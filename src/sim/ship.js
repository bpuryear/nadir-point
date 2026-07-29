import * as THREE from 'three';
import { PlaneBody, FreeBody, MoveController, angleDelta, yawOf } from './physics.js';
import { PowerPlant, installDefaultPresets } from './power.js';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { HARDPOINTS } from '../core/contracts.js';
import { clamp01, degrade, traverseMul, salvageState, conditionLabel } from './condition.js';
import { MountThermal, ShipThermal } from './heat.js';
import { ShipStores, ammoClassOf, AMMO_SPEC, storesScaleFor, STORES } from './stores.js';
import { ModuleParts, partsFor, PART_EFFECT } from './subparts.js';
import { MEV } from './meta/events.js';

/**
 * How a mount decides to shoot.
 *
 *   AUTO   — the mount fires itself the moment it bears. `combat.js` drives it.
 *   SALVO  — the mount waits to be released as part of a broadside ripple.
 *   CHARGE — the mount winds up, holds, and is released.
 *
 * This is the ONE piece of new per-mount state the armament design needs, and there
 * is no other legitimate home for it: the mode belongs to the physical mount, not to
 * the weapon definition (which is shared by every copy of the module) and not to the
 * controller (which is rebuilt on every refit).
 */
export const FIRE_MODES = ['AUTO', 'SALVO', 'CHARGE'];

/**
 * Default mode per weapon archetype. `WEAPON_TYPES` in `core/contracts.js:27` is the
 * closed set of eight and all eight are named here, so an unknown type is a
 * registration defect rather than a silent AUTO.
 *
 * Point defence is reactive by definition — `combat.js:118,382,403` already treats
 * `type === 'pd'` as not commandable — so its mode is not merely defaulted to AUTO,
 * it is pinned there by the accessor below.
 */
export const DEFAULT_FIRE_MODE = {
  pd: 'AUTO',
  flak: 'AUTO',
  beam: 'AUTO',
  mining: 'AUTO',
  cannon: 'SALVO',
  rail: 'SALVO',
  missile: 'SALVO',
  lance: 'CHARGE',
};

/**
 * How long `mount.traverseLocked = true` holds for, in seconds, when the caller does
 * not name a duration. A controller that knows its own sweep length should assign a
 * number instead.
 */
export const TRAVERSE_LOCK_HOLD = 0.35;

/** Seconds from nothing to a full charge, when the weapon def does not say. */
export const CHARGE_TIME_DEFAULT = 2.6;

/** An abandoned charge bleeds away at this multiple of the rate it built up. */
export const CHARGE_BLEED = 2;

/**
 * A weapon mount: one weapon definition, bolted to a specific place on a specific
 * hull, with a firing arc that is a property of WHERE IT IS, not of what it is.
 *
 * This is the spatial layer of combat. A broadside battery covers port. Getting it
 * onto the enemy means turning a kilometre and a half of ship, which takes seconds
 * you have to plan for. That planning is the game.
 */
export class WeaponMount {
  /**
   * @param {import('../core/contracts.js').WeaponDef} def
   * @param {Object} opts
   * @param {THREE.Vector3} opts.localPosition  where it sits on the hull
   * @param {number} opts.yawCentre             arc centre, radians from ship forward
   * @param {number} opts.yawWidth              total arc width, radians
   * @param {string} [opts.hardpoint]           which hardpoint it came in on
   * @param {number} [opts.condition]           0..1 quality of this physical instance
   * @param {Object} [opts.moduleDef]           the ModuleDef, when it came from one
   * @param {number} [opts.containerHP]         HP pool the sub-parts divide up
   * @param {string} [opts.fireMode]            restored from the module instance record
   * @param {boolean} [opts.excluded]           restored from the module instance record
   */
  constructor(def, opts) {
    this.def = def;
    this.localPosition = opts.localPosition.clone();
    this.yawCentre = opts.yawCentre ?? 0;
    this.yawWidth = opts.yawWidth ?? Math.PI * 0.5;
    this.pitchWidth = def.pitchWidth ?? Math.PI * 0.25;
    this.hardpoint = opts.hardpoint ?? null;

    /** Current traverse of the mount within its arc, radians from yawCentre. */
    this.traverse = 0;
    this.cooldown = 0;
    this.burstRemaining = 0;
    this.burstTimer = 0;
    this.online = true;
    /** Why it is offline, when it is: 'subsystem' | 'heat' | 'detached' | 'condition'. */
    this.offlineReason = null;
    this.target = null;
    this.aimedSubsystem = null;

    /**
     * FIRE MODE. See FIRE_MODES above. Stored behind an accessor so point defence
     * cannot be talked out of AUTO by a UI click or a stale save.
     */
    this._fireMode = FIRE_MODES.includes(opts.fireMode)
      ? opts.fireMode
      : (DEFAULT_FIRE_MODE[def.type] ?? 'AUTO');

    /**
     * Excluded from group fire. The player has told this mount to sit out the next
     * broadside — usually to keep a cooked barrel out of the wave, or to hold one
     * gun back for point work. It says nothing about whether the mount is usable.
     */
    this.excluded = opts.excluded === true;

    /** Wind-up state for the CHARGE archetype. 0..1, and whether it is building. */
    this.charge = 0;
    this.charging = false;
    /** Seconds from nothing to full. Derived once; the tick reads it every step. */
    this.chargeTime = def.chargeTime > 0 ? def.chargeTime : CHARGE_TIME_DEFAULT;

    /**
     * TRAVERSE LOCK, in seconds remaining.
     *
     * A mount that has committed to a shot stops tracking, and that visible freeze is
     * the anticipation tell the whole firing feel is built on. It is a countdown and
     * not a flag on purpose: a controller that is torn down mid-salvo — by a refit, a
     * cripple, a thermal trip — must not be able to leave a gun frozen for the rest
     * of the run. Assign a boolean for the default hold or a number of seconds.
     */
    this.traverseLockFor = 0;

    /**
     * UNIVERSAL CONDITION on the instance. This is the same number that was on the
     * wreck section it was cut from and that will be on it again in the hold. It
     * degrades rate of fire, traverse, muzzle energy and cooling, and it decides what
     * the mount is worth when it comes off.
     */
    this.condition = opts.condition ?? 1;
    this.moduleDef = opts.moduleDef ?? null;
    /** Which weapon subsystem on the hull this mount belongs to (NPC hulls). */
    this.subsystemId = opts.subsystemId ?? null;

    /** Thermal state. See heat.js. */
    this.thermal = new MountThermal(def);

    /** Stores. `ammoClass === null` means energy-fed. */
    this.ammoClass = ammoClassOf(def);
    this.readyMax = def.ready ?? (this.ammoClass ? AMMO_SPEC[this.ammoClass].ready : 0);
    this.ready = this.readyMax;
    this.reloading = 0;
    /** Misfeed stall from poor condition, seconds. */
    this.stall = 0;

    /** Sub-parts. Barrels / feed / traverse ring / pad. See subparts.js. */
    this.parts = new ModuleParts(this, partsFor(def, this.moduleDef), opts.containerHP ?? 600).refresh();

    this.worldPosition = new THREE.Vector3();
    this.worldForward = new THREE.Vector3();
  }

  get range() { return this.def.range; }

  /**
   * Fire mode. Point defence always reads AUTO and its setter is a no-op: PD is
   * reactive, it picks its own targets, and `combat.js:382,403` already refuses to
   * treat it as a commandable weapon. Anything outside FIRE_MODES is ignored rather
   * than stored, so a corrupt save cannot park a mount in a mode nothing drives.
   */
  get fireMode() { return this.def.type === 'pd' ? 'AUTO' : this._fireMode; }

  set fireMode(mode) {
    if (this.def.type === 'pd') return;
    if (!FIRE_MODES.includes(mode)) return;
    this._fireMode = mode;
  }

  /** True while the mount is committed and will not slew. See `traverseLockFor`. */
  get traverseLocked() { return this.traverseLockFor > 0; }

  set traverseLocked(v) {
    if (typeof v === 'number') this.traverseLockFor = Math.max(0, v);
    else this.traverseLockFor = v ? TRAVERSE_LOCK_HOLD : 0;
  }

  /**
   * Half-arc actually available. A dead traverse ring freezes the gun where it stood:
   * the mount keeps a few degrees of slop and nothing more, so from then on the only
   * way to aim it is to turn the ship. That is the spatial layer taking over a job the
   * turret used to do for you.
   */
  get halfArc() {
    return this.parts?.traverseFrozen ? PART_EFFECT.traverseFrozenArc : this.yawWidth * 0.5;
  }

  /** Centre of the available arc, relative to yawCentre. Non-zero only when frozen. */
  get arcOffset() {
    return this.parts?.traverseFrozen ? this.parts.frozenAt : 0;
  }

  /** Traverse rate after condition. A worn ring cannot hold a fast target. */
  get trackingRate() {
    return this.def.tracking * traverseMul(this.condition);
  }

  /** True when the mount is usable at all right now. */
  get usable() {
    return this.online && !this.parts.inert && !this.parts.detached && this.condition >= 0.2;
  }

  /** True when a world-space point falls inside this mount's arc and range. */
  canBear(shipPosition, shipHeading, point) {
    const dx = point.x - this.worldPosition.x;
    const dz = point.z - this.worldPosition.z;
    const dy = point.y - this.worldPosition.y;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > this.range * this.range) return false;

    const bearing = yawOf(dx, dz);
    const relative = angleDelta(shipHeading + this.yawCentre + this.arcOffset, bearing);
    if (Math.abs(relative) > this.halfArc) return false;

    const horiz = Math.sqrt(dx * dx + dz * dz);
    const pitch = Math.atan2(dy, Math.max(1e-3, horiz));
    return Math.abs(pitch) <= this.pitchWidth * 0.5;
  }

  /** How far off-arc a point is, in radians. 0 means bearing. Used by the AI. */
  arcError(shipHeading, point) {
    const dx = point.x - this.worldPosition.x;
    const dz = point.z - this.worldPosition.z;
    const relative = angleDelta(shipHeading + this.yawCentre + this.arcOffset, yawOf(dx, dz));
    return Math.max(0, Math.abs(relative) - this.halfArc);
  }

  updateWorld(shipPosition, shipHeading) {
    const s = Math.sin(shipHeading), c = Math.cos(shipHeading);
    const lx = this.localPosition.x, ly = this.localPosition.y, lz = this.localPosition.z;
    this.worldPosition.set(
      shipPosition.x + lx * c + lz * s,
      shipPosition.y + ly,
      shipPosition.z + lz * c - lx * s,
    );
    const aim = shipHeading + this.yawCentre + this.traverse;
    this.worldForward.set(Math.sin(aim), 0, Math.cos(aim));
  }

  /**
   * Traverse toward a bearing, clamped to the arc. Returns true when on target.
   *
   * A traverse-locked mount does not slew: it has committed, and the frozen gun is
   * the tell that a shot is coming. It still answers honestly about whether it
   * happens to bear, because a locked gun that was already on target is a gun that
   * can fire — returning a flat `false` here would make the lock a mute button.
   */
  trackTowards(shipHeading, point, dt) {
    const dx = point.x - this.worldPosition.x;
    const dz = point.z - this.worldPosition.z;
    const desired = angleDelta(shipHeading + this.yawCentre, yawOf(dx, dz));
    const centre = this.arcOffset;
    const half = this.halfArc;
    const clamped = THREE.MathUtils.clamp(desired, centre - half, centre + half);
    if (this.traverseLockFor <= 0) {
      const delta = clamped - this.traverse;
      const step = this.trackingRate * dt;
      this.traverse += THREE.MathUtils.clamp(delta, -step, step);
    }
    return Math.abs(clamped - this.traverse) < 0.02 && Math.abs(desired - clamped) < 0.02;
  }
}

/**
 * A ship. Player cruiser, faction warship and strike craft all use this - the
 * differences are data (a class definition) and which body type it gets.
 */
export class Ship {
  /**
   * @param {Object} opts
   * @param {import('../core/contracts.js').ShipClassDef} opts.classDef
   * @param {import('../core/world.js').World} opts.world
   * @param {string} opts.faction
   * @param {boolean} [opts.isPlayer]
   * @param {THREE.Object3D} [opts.root]  prebuilt geometry; built from classDef if absent
   */
  constructor({ classDef, world, faction, isPlayer = false, root = null, position = null, heading = 0 }) {
    this.classDef = classDef;
    this.world = world;
    this.bus = world?.bus ?? null;
    this.faction = faction ?? classDef.faction;
    this.isPlayer = isPlayer;
    this.id = `${classDef.id}#${(Ship._nextId = (Ship._nextId ?? 0) + 1)}`;

    this.planeLocked = classDef.planeLocked ?? classDef.role !== 'fighter';
    const bodySpec = {
      mass: classDef.mass,
      maxSpeed: classDef.maxSpeed,
      accel: classDef.accel,
      turnRate: classDef.turnRate,
      radius: classDef.length * 0.42,
    };
    this.body = this.planeLocked ? new PlaneBody(bodySpec) : new FreeBody(bodySpec);
    this.body.planeLocked = this.planeLocked;
    this.move = this.planeLocked ? new MoveController(this.body) : null;

    if (position) this.body.position.copy(position);
    if (this.planeLocked) {
      this.body.heading = heading;
      this.body.desiredHeading = heading;
    }

    this.root = root ?? new THREE.Group();
    this.root.name = this.id;

    // --- health -------------------------------------------------------------
    this.maxHullHP = classDef.hullHP;
    this.hullHP = classDef.hullHP;
    this.dead = false;
    this.disabled = false;
    /**
     * CRIPPLED, NOT DEAD. The player's hull does not produce a corpse - see `_cripple`
     * below and `sim/meta/derelict.js` for what happens next. Always false on an NPC.
     */
    this.crippled = false;
    /** Reactor scrammed: no thrust, no steering authority, nothing on the bus. */
    this.scrammed = false;

    /** @type {Map<string, {def:Object, hp:number, maxHP:number, destroyed:boolean, worldPosition:THREE.Vector3}>} */
    this.subsystems = new Map();
    for (const def of classDef.subsystems ?? []) {
      this.subsystems.set(def.id, {
        def,
        hp: def.hp,
        maxHP: def.hp,
        destroyed: false,
        worldPosition: new THREE.Vector3(),
      });
    }

    /** @type {WeaponMount[]} */
    this.weapons = [];
    for (const w of classDef.weapons ?? []) {
      const localPosition = new THREE.Vector3(...(w.mount ?? [0, 0, 0]));
      const host = this._nearestWeaponSubsystem(localPosition);
      this.weapons.push(new WeaponMount(w, {
        localPosition,
        yawCentre: w.yawCentre ?? 0,
        yawWidth: w.yawWidth ?? Math.PI * 0.5,
        subsystemId: host?.def.id ?? null,
        // Sub-parts divide the HP of whatever they are bolted to: the weapon subsystem
        // on an NPC hull, or the hardpoint structure on the player's.
        containerHP: host ? host.maxHP : Math.max(200, classDef.hullHP * 0.08),
      }));
    }

    /** Player-only: installed modules per hardpoint, and the structural state of each. */
    this.hardpoints = new Map();
    if (isPlayer) {
      for (const id of HARDPOINTS) {
        this.hardpoints.set(id, {
          id,
          module: null,
          object: null,
          structureHP: 1000,
          maxStructureHP: 1000,
          breached: false,
          warned: false,
        });
      }
    }

    this.power = new PowerPlant({ baseOutput: isPlayer ? 100 : 80, bus: this.bus });
    if (isPlayer) installDefaultPresets(this.power);

    this.shields = { current: 0, max: 0, regen: 0, downUntil: 0 };

    /**
     * PER-SECTION SALVAGE CONDITION.
     *
     * `salvageIntegrity` used to be one number for a whole 480 m destroyer, which meant
     * that carefully removing its engines and carelessly hosing its flank produced the
     * same loot. Now every subsystem and every stretch of plating carries its own
     * condition, degraded by the damage that actually landed near it. Shoot the engines
     * out and the weapon sections come off pristine.
     *
     * `salvageIntegrity` survives as a derived accessor so every existing reader - the
     * HUD, the faction-war ghost spawner, the wreck builder - keeps working unchanged.
     */
    this.sections = new Map();
    this._buildSections();

    /** Thermal management. See heat.js. */
    this.thermal = new ShipThermal(this);
    /** Ammunition, charge, coolant, propellant. See stores.js. */
    this.stores = new ShipStores(this, { scale: storesScaleFor(classDef), player: isPlayer });
    /** Installed mass over hull reference mass. Refit writes this; propellant reads it. */
    this.massLoad = 1;

    this.order = { type: 'hold', point: null, target: null, subsystem: null };
    this.target = null;
    this.targetSubsystem = null;
    /** Second-tier aim point: which sub-part of the aimed subsystem to shoot at. */
    this.targetPart = null;

    this._hostiles = [];
    this._salvageRows = [];
  }

  /** The weapon subsystem a mount at this local position belongs to, if any. */
  _nearestWeaponSubsystem(localPosition) {
    let best = null;
    let bestD2 = Infinity;
    for (const s of this.subsystems.values()) {
      if (s.def.kind !== 'weapon') continue;
      const [x, y, z] = s.def.position;
      const d2 = (x - localPosition.x) ** 2 + (y - localPosition.y) ** 2 + (z - localPosition.z) ** 2;
      if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    // Only claim it when the mount is genuinely on that battery.
    return best && bestD2 < (best.def.radius * 3) ** 2 ? best : null;
  }

  /**
   * One salvage section per subsystem, plus three runs of plating.
   *
   * `toughness` is how much damage takes a pristine section to scrap. Deriving it from
   * subsystem HP means an armoured reactor housing degrades slower than a sensor mast
   * without anyone authoring a table, and it means the number is already balanced
   * against the weapons that exist.
   */
  _buildSections() {
    for (const sub of this.subsystems.values()) {
      this.sections.set(sub.def.id, {
        id: sub.def.id,
        label: sub.def.label ?? sub.def.id,
        kind: sub.def.kind,
        subsystemId: sub.def.id,
        condition: 1,
        salvageValue: sub.def.salvageValue ?? 0.2,
        toughness: Math.max(40, sub.maxHP * 1.6),
        radius: sub.def.radius,
        localPosition: new THREE.Vector3(...sub.def.position),
        worldPosition: new THREE.Vector3(),
      });
    }
    const r = this.classDef.length * 0.42;
    const plates = [['plate_fore', 'FORE PLATING', 0.55], ['plate_mid', 'MIDSHIPS PLATING', 0], ['plate_aft', 'AFT PLATING', -0.55]];
    for (const [id, label, zf] of plates) {
      this.sections.set(id, {
        id,
        label,
        kind: 'hull',
        subsystemId: null,
        condition: 1,
        salvageValue: 0.12,
        toughness: Math.max(60, this.maxHullHP * 0.45),
        radius: r * 0.5,
        localPosition: new THREE.Vector3(0, 0, r * zf),
        worldPosition: new THREE.Vector3(),
      });
    }
  }

  // --- queries --------------------------------------------------------------

  get position() { return this.body.position; }
  get velocity() { return this.body.velocity; }
  get heading() { return this.planeLocked ? this.body.heading : 0; }
  get radius() { return this.body.radius; }

  /**
   * How much of this hull survives as salvage: the salvage-weighted mean of every
   * section's condition. A reactor kill floors the lot - that rule is unchanged and it
   * is still the best rule in the design.
   */
  get salvageIntegrity() {
    let sum = 0;
    let weight = 0;
    for (const s of this.sections.values()) {
      sum += s.condition * s.salvageValue;
      weight += s.salvageValue;
    }
    return weight > 0 ? clamp01(sum / weight) : 1;
  }

  /** Assigning floors every section. Used by catastrophic kills and by ghost spawns. */
  set salvageIntegrity(v) {
    const c = clamp01(v);
    for (const s of this.sections.values()) s.condition = c;
  }

  /**
   * READ API — live projected salvage, for the subsystem ring.
   *
   * `ship.salvageProjection()` returns a cached array of
   *   { id, label, kind, condition, state, salvageValue, worldPosition, moduleLikely }
   * where `state` is INTACT / DAMAGED / SCRAP. Call it every frame while a hostile is
   * targeted; the ring colours each segment from `state` and the player watches the
   * value of what they are shooting at fall in real time. That is the whole point of
   * attributing damage per section: the payoff stops being a hidden die roll.
   */
  salvageProjection() {
    const rows = this._salvageRows;
    rows.length = 0;
    for (const s of this.sections.values()) {
      let row = s._row;
      if (!row) row = s._row = {};
      row.id = s.id;
      row.label = s.label;
      row.kind = s.kind;
      row.condition = s.condition;
      row.state = salvageState(s.condition);
      row.grade = conditionLabel(s.condition);
      row.salvageValue = s.salvageValue;
      row.worldPosition = s.worldPosition;
      // A section only yields an installable part if it is a module-bearing kind and
      // has not been shot to pieces.
      row.moduleLikely = s.kind !== 'hull' && s.kind !== 'engine' && s.condition >= 0.2;
      rows.push(row);
    }
    return rows;
  }

  subsystemsOfKind(kind) {
    const out = [];
    for (const s of this.subsystems.values()) if (s.def.kind === kind) out.push(s);
    return out;
  }

  /** 0..1 health of a whole class of subsystem. Drives efficiency multipliers. */
  kindHealth(kind) {
    let hp = 0, max = 0;
    for (const s of this.subsystems.values()) {
      if (s.def.kind !== kind) continue;
      hp += s.hp; max += s.maxHP;
    }
    return max > 0 ? hp / max : 1;
  }

  /** A stranded ship cannot run, which is what makes it salvageable at leisure. */
  get stranded() {
    const engines = this.subsystemsOfKind('engine');
    return engines.length > 0 && engines.every((e) => e.destroyed);
  }

  /** A defanged ship is harmless but still mobile. */
  get defanged() {
    const w = this.subsystemsOfKind('weapon');
    return w.length > 0 && w.every((s) => s.destroyed);
  }

  // --- orders ---------------------------------------------------------------

  orderMove(point) {
    this.order = { type: 'move', point: point.clone(), target: null, subsystem: null };
    this.move?.order(point, this.radius * 0.5);
    this.bus?.emit(EV.ORDER_MOVE, { ship: this, point });
  }

  /**
   * @param {Ship} target
   * @param {string|null} [subsystemId]  first-tier aim point
   * @param {string|null} [partId]       second-tier aim point inside that module
   */
  orderAttack(target, subsystemId = null, partId = null) {
    this.order = { type: 'attack', point: null, target, subsystem: subsystemId, part: partId };
    this.target = target;
    this.targetSubsystem = subsystemId;
    this.targetPart = partId;
    this.bus?.emit(EV.ORDER_ATTACK, { ship: this, target, subsystem: subsystemId, part: partId });
  }

  orderHold() {
    this.order = { type: 'hold', point: null, target: null, subsystem: null };
    this.move?.cancel();
  }

  // --- damage ---------------------------------------------------------------

  /**
   * Apply damage.
   *
   * @param {number} amount
   * @param {Object} opts
   * @param {string} [opts.subsystemId]  aimed subsystem; may still miss
   * @param {THREE.Vector3} [opts.point] world-space impact point
   * @param {Ship} [opts.source]
   * @param {number} [opts.accuracy]     0..1 chance the aimed subsystem is actually hit
   * @param {string} [opts.partId]       aimed sub-part inside a weapon module
   * @param {import('../core/rng.js').RNG} [opts.rng]
   */
  applyDamage(amount, opts = {}) {
    if (this.dead) return 0;
    let remaining = amount;

    // Shields eat damage first and drop the whole ship's protection when they fail.
    if (this.shields.current > 0) {
      const absorbed = Math.min(this.shields.current, remaining);
      this.shields.current -= absorbed;
      remaining -= absorbed;
      this.bus?.emit(EV.SHIELD_IMPACT, { ship: this, point: opts.point, amount: absorbed });
      if (remaining <= 0) return amount;
    }

    // Aimed subsystem damage. Accuracy is what makes subsystem targeting a skill
    // rather than a checkbox - a long-range shot at a moving corvette's engine
    // mostly hits hull.
    const rng = opts.rng ?? this.world?.rng;
    let hitSubsystem = null;
    if (opts.subsystemId) {
      const s = this.subsystems.get(opts.subsystemId);
      if (s && !s.destroyed) {
        const acc = opts.accuracy ?? 0.7;
        if (!rng || rng.next() < acc) hitSubsystem = s;
      }
    } else if (opts.point) {
      hitSubsystem = this._subsystemNear(opts.point);
    }

    // Sub-parts sit in front of the module they belong to. An aimed part takes the hit
    // first and passes the overflow on, so shooting a traverse ring is a way of
    // choosing WHICH consequence you buy, never a way of making damage disappear.
    const part = this._partHit(opts, hitSubsystem);
    if (part) {
      const before = part.part.destroyed;
      remaining = part.mount.parts.damagePart(part.part, remaining);
      this.bus?.emit(EV.SUBSYSTEM_HIT, {
        ship: this, subsystem: hitSubsystem, part: part.part, mount: part.mount,
        amount, point: opts.point,
      });
      if (!before && part.part.destroyed) this._onPartDestroyed(part.mount, part.part, opts);
    }

    if (hitSubsystem) {
      hitSubsystem.hp -= remaining;
      this.bus?.emit(EV.SUBSYSTEM_HIT, { ship: this, subsystem: hitSubsystem, amount: remaining, point: opts.point });
      if (hitSubsystem.hp <= 0) {
        hitSubsystem.hp = 0;
        hitSubsystem.destroyed = true;
        this._onSubsystemDestroyed(hitSubsystem, opts);
      }
      // Subsystem damage bleeds into the hull, so stripping a ship still kills it eventually.
      remaining *= 0.35;
    }

    // Attribute what landed to the SECTION that took it. This is the number the
    // salvage yield is read from, so precision now pays in loot as well as in kills.
    this._attributeDamage(amount, opts.point ?? null, hitSubsystem);

    // Player hardpoints take structural damage from hits in their region. This is the
    // ONLY path by which a module can be permanently lost, and the player can watch
    // the number fall - losing a rare module to an invisible threshold is a bug.
    if (this.isPlayer && opts.point) {
      const hp = this._hardpointNear(opts.point);
      if (hp && !hp.breached && hp.module) {
        hp.structureHP -= remaining * 0.55;
        if (!hp.warned && hp.structureHP <= hp.maxStructureHP * 0.35) {
          hp.warned = true;
          this.bus?.emit(EV.HARDPOINT_BREACH_WARNING, { ship: this, hardpoint: hp });
        }
        if (hp.structureHP <= 0) {
          hp.structureHP = 0;
          hp.breached = true;
          this._breachHardpoint(hp);
        }
      }
    }

    this.hullHP -= remaining;
    if (this.hullHP <= 0) {
      this.hullHP = 0;
      this._destroy(opts);
    }
    return amount;
  }

  /**
   * Which sub-part, if any, this shot lands on.
   *
   * Two ways in: the shooter aimed at a named part (the second-tier ring), or the shot
   * simply landed on one. Aimed shots respect the same accuracy roll the subsystem
   * layer uses, at a penalty - a part is a smaller thing to hit than a battery, and it
   * should be a harder shot or the ring is a free win.
   */
  _partHit(opts, hitSubsystem) {
    if (opts.partId) {
      const rng = opts.rng ?? this.world?.rng;
      const acc = (opts.accuracy ?? 0.7) * 0.75;
      if (rng && rng.next() > acc) return null;
      for (const m of this.weapons) {
        if (m.parts.detached) continue;
        if (hitSubsystem && m.subsystemId && m.subsystemId !== hitSubsystem.def.id) continue;
        const p = m.parts.get(opts.partId);
        if (p && !p.destroyed) return { mount: m, part: p };
      }
      return null;
    }
    if (!opts.point) return null;
    for (const m of this.weapons) {
      if (m.parts.detached) continue;
      const p = m.parts.nearest(opts.point);
      if (p) return { mount: m, part: p };
    }
    return null;
  }

  /** Consequences of losing a sub-part. All of them are visible within one second. */
  _onPartDestroyed(mount, part, opts) {
    this.bus?.emit(EV.SUBSYSTEM_DESTROYED, {
      ship: this, subsystem: this.subsystems.get(mount.subsystemId) ?? null,
      part, mount, point: opts?.point ?? null,
    });
    if (mount.parts.inert) {
      mount.online = false;
      mount.offlineReason = 'output';
    }
    if (mount.parts.wantsDetach && !mount.parts.detached) this._detachMount(mount, opts);
  }

  /**
   * The mount pad is gone: the module comes off the hull INTACT and becomes a thing
   * floating in space that anybody can cut free. This is the payoff of the whole
   * sub-part system - shoot the pad off a Coalition frigate's cannon bank and the
   * cannon bank is now shopping, not wreckage.
   */
  _detachMount(mount, opts) {
    mount.parts.detached = true;
    mount.online = false;
    mount.offlineReason = 'detached';
    mount.burstRemaining = 0;

    const hp = mount.hardpoint ? this.hardpoints.get(mount.hardpoint) : null;
    const moduleDef = mount.moduleDef ?? hp?.module?.def ?? null;
    if (hp?.module) {
      const lost = hp.module;
      hp.module = null;
      if (hp.object?.parent) hp.object.parent.remove(hp.object);
      hp.object = null;
      hp.breached = true;
      hp.structureHP = 0;
      this.bus?.emit(EV.MODULE_LOST, { ship: this, hardpoint: hp.id, module: lost, intact: true });
    }

    // Salvage owns what a floating part looks like; it may not be installed yet.
    this.world?.systems?.salvage?.spawnDetachedModule?.({
      ship: this,
      mount,
      moduleDef,
      condition: mount.condition,
      point: opts?.point ?? mount.worldPosition,
    });
  }

  /**
   * Spread the damage that landed onto the salvage sections nearest it.
   *
   * Direct subsystem hits degrade their own section at full weight and bleed a quarter
   * into whatever is next to them. Unaimed hull hits degrade the nearest run of plating.
   * Nothing here allocates: it is a fixed walk over a Map of at most a dozen entries.
   */
  _attributeDamage(amount, point, hitSubsystem) {
    if (!(amount > 0) || this.sections.size === 0) return;

    if (hitSubsystem) {
      const direct = this.sections.get(hitSubsystem.def.id);
      if (direct) direct.condition = degrade(direct.condition, amount, direct.toughness);
      // Splash into neighbours, so hosing a battery ruins the plating around it too.
      if (point) {
        for (const s of this.sections.values()) {
          if (s === direct) continue;
          const d2 = s.worldPosition.distanceToSquared(point);
          const reach = s.radius * 2.5;
          if (d2 < reach * reach) s.condition = degrade(s.condition, amount * 0.22, s.toughness);
        }
      }
      return;
    }

    if (point) {
      let best = null;
      let bestD2 = Infinity;
      for (const s of this.sections.values()) {
        const d2 = s.worldPosition.distanceToSquared(point);
        if (d2 < bestD2) { bestD2 = d2; best = s; }
      }
      if (best) {
        const near = bestD2 <= best.radius * best.radius;
        best.condition = degrade(best.condition, amount * (near ? 1 : 0.45), best.toughness);
      }
      return;
    }

    // Unlocated damage (shield bleed-through, scripted hits) spreads thinly.
    const share = amount / this.sections.size;
    for (const s of this.sections.values()) s.condition = degrade(s.condition, share * 0.5, s.toughness);
  }

  _subsystemNear(point) {
    let best = null;
    let bestD2 = Infinity;
    for (const s of this.subsystems.values()) {
      if (s.destroyed) continue;
      const d2 = s.worldPosition.distanceToSquared(point);
      if (d2 < s.def.radius * s.def.radius && d2 < bestD2) { bestD2 = d2; best = s; }
    }
    return best;
  }

  _hardpointNear(point) {
    let best = null;
    let bestD2 = Infinity;
    for (const hp of this.hardpoints.values()) {
      if (!hp.object) continue;
      hp.object.getWorldPosition(scratch.v1);
      const d2 = scratch.v1.distanceToSquared(point);
      if (d2 < bestD2) { bestD2 = d2; best = hp; }
    }
    // Only count it if the hit was genuinely near that mount.
    return bestD2 < (this.radius * 0.6) ** 2 ? best : null;
  }

  _onSubsystemDestroyed(sub, opts) {
    this.bus?.emit(EV.SUBSYSTEM_DESTROYED, { ship: this, subsystem: sub, point: opts.point });

    switch (sub.def.kind) {
      case 'engine':
        if (this.stranded) {
          this.disabled = true;
          this.move?.cancel();
          this.bus?.emit(EV.SHIP_DISABLED, { ship: this, reason: 'engines' });
        }
        break;
      case 'weapon':
        // Take the matching mounts offline so a defanged ship really is harmless.
        for (const m of this.weapons) {
          if (m.subsystemId === sub.def.id
            || m.localPosition.distanceToSquared(scratch.v1.set(...sub.def.position)) < (sub.def.radius * 1.6) ** 2) {
            m.online = false;
            m.offlineReason = 'subsystem';
          }
        }
        break;
      case 'reactor':
        // The profitable kill is the difficult one. Popping the reactor is easy and
        // it destroys almost everything you came for.
        this.salvageIntegrity = Math.min(this.salvageIntegrity, 0.15);
        this.hullHP = Math.min(this.hullHP, this.maxHullHP * 0.05);
        this._destroy({ ...opts, catastrophic: true });
        break;
      case 'hangar':
        this.bus?.emit(EV.NOTIFY, { text: `${this.classDef.name} hangar destroyed`, ship: this });
        break;
      default:
        break;
    }
    this._refreshEfficiency();
  }

  _breachHardpoint(hp) {
    const lost = hp.module;
    this.bus?.emit(EV.HARDPOINT_BREACHED, { ship: this, hardpoint: hp });
    if (lost) {
      hp.module = null;
      if (hp.object?.parent) hp.object.parent.remove(hp.object);
      hp.object = null;
      this.bus?.emit(EV.MODULE_LOST, { ship: this, hardpoint: hp.id, module: lost });
    }
    this._rebuildWeaponMounts?.();
  }

  /**
   * CRIPPLING, NOT DEATH.
   *
   * `closest-comparables.md` §5.2, Product 4, verified against the code: every
   * `SHIP_DESTROYED` listener handled the NPC case and not one handled the player, so
   * the player became `dead: true` and the game ran on around a corpse. The answer that
   * fits our fiction - and the one recorded as binding in
   * `docs/design/look-target.md` §3 - is not a game-over and not a respawn:
   *
   *   reactor scram, drive dead, weapons dark, DRIFTING
   *   breached hardpoints eject their modules INTACT, at the place you fell
   *   the cargo hold survives - what you cut on this sortie comes home
   *   recovery to the nearest anchorage costs a bill and time
   *
   * This method is only the mechanism: it stops the ship. Everything that makes it a
   * story - which mounts breach, where the modules land, who tows you and what they
   * charge - is `sim/meta/derelict.js`, because it needs the map and this file must not.
   *
   * It is deliberately not reachable twice. A crippled hull that keeps being shot at
   * stays crippled; there is no second, worse state to fall into.
   */
  _cripple(opts) {
    if (this.crippled) return;
    this.crippled = true;
    this.disabled = true;
    this.scrammed = true;
    this.hullHP = Math.max(1, this.maxHullHP * 0.02);

    this.move?.cancel?.();
    this.body.throttle = 0;
    this.order = { type: 'hold', point: null, target: null, subsystem: null };
    this.target = null;

    for (const m of this.weapons) {
      m.online = false;
      m.offlineReason = 'scram';
      m.burstRemaining = 0;
    }
    this.shields.current = 0;
    this.shields.max = 0;
    this.power.bonusOutput = 0;
    this.power.setHealthFactor?.(0);
    this._refreshEfficiency();

    this.bus?.emit(EV.SHIP_DISABLED, { ship: this, reason: 'crippled' });
    this.bus?.emit(MEV.PLAYER_CRIPPLED, {
      ship: this,
      source: opts?.source ?? null,
      catastrophic: !!opts?.catastrophic,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
    });
  }

  _destroy(opts) {
    if (this.dead) return;
    // The player is crippled instead. `derelict.enabled === false` puts the old
    // behaviour back for a test that wants a corpse.
    if (this.isPlayer && this.world?.systems?.derelict?.enabled !== false) {
      this._cripple(opts);
      return;
    }
    this.dead = true;
    this.disabled = true;
    if (opts?.catastrophic) this.salvageIntegrity = Math.min(this.salvageIntegrity, 0.15);
    this.bus?.emit(EV.SHIP_DESTROYED, {
      ship: this,
      catastrophic: !!opts?.catastrophic,
      salvageIntegrity: this.salvageIntegrity,
      source: opts?.source ?? null,
    });
  }

  /** Recompute how well the hull performs given damage, power routing and stores. */
  _refreshEfficiency() {
    // A scrammed reactor is not a degraded reactor. No floor applies: the hull coasts
    // on whatever momentum it had, which is what "drifting" has to mean or the word is
    // decoration.
    if (this.scrammed) {
      this.body.engineEfficiency = 0;
      this.body.steeringEfficiency = 0;
      return;
    }
    const engineHealth = this.kindHealth('engine');
    const enginePower = this.power.unlocked ? 0.55 + 0.9 * this.power.factor('engines') * 0.5 : 1;
    // Down to the propellant reserve you can still limp home - the travel spec's floor
    // guarantees that - but you cannot fight. It is a visible, warned-about clamp.
    const fuel = this.stores?.starved ? STORES.starvedEfficiency : 1;
    this.body.engineEfficiency = Math.max(0.05, engineHealth * enginePower * fuel);
    this.body.steeringEfficiency = Math.max(0.1, (0.35 + 0.65 * engineHealth) * fuel);

    const reactorHealth = this.kindHealth('reactor');
    this.power.setHealthFactor(reactorHealth);
  }

  // --- per-step -------------------------------------------------------------

  fixedUpdate(dt) {
    if (this.dead) return;

    this.power.update(dt);
    this._refreshEfficiency();

    if (this.planeLocked) {
      if (!this.disabled) this.move?.update(dt);
      else this.body.throttle = 0;
      this.body.integrate(dt);
    } else {
      this.body.integrate(dt);
    }

    // Cache world-space subsystem positions once per step; combat reads them a lot.
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    for (const sub of this.subsystems.values()) {
      const [lx, ly, lz] = sub.def.position;
      sub.worldPosition.set(
        this.position.x + lx * c + lz * s,
        this.position.y + ly,
        this.position.z + lz * c - lx * s,
      );
    }
    for (const sec of this.sections.values()) {
      const { x: lx, y: ly, z: lz } = sec.localPosition;
      sec.worldPosition.set(
        this.position.x + lx * c + lz * s,
        this.position.y + ly,
        this.position.z + lz * c - lx * s,
      );
    }

    for (const m of this.weapons) {
      m.updateWorld(this.position, this.heading);
      m.parts.updateWorld(m.worldPosition, this.heading);
      if (m.cooldown > 0) m.cooldown -= dt;
      if (m.burstTimer > 0) m.burstTimer -= dt;
      if (m.stall > 0) m.stall -= dt;
      // The commitment timers, on the same clock as every other mount timer. Ships
      // tick at order 60 and combat at order 40 (game.js:184-190), so a controller
      // that sets or consumes either of these in the same step sees its own write
      // first and this loop only ever advances what it left behind.
      if (m.traverseLockFor > 0) m.traverseLockFor -= dt;
      if (m.charging) m.charge = Math.min(1, m.charge + dt / m.chargeTime);
      else if (m.charge > 0) m.charge = Math.max(0, m.charge - (dt / m.chargeTime) * CHARGE_BLEED);
    }

    // Heat first, then stores: a mount that tripped this step must not also reload.
    this.thermal.update(dt);
    this.stores.update(dt);

    // Shields regenerate on a delay after taking a hit, funded by power routing.
    if (this.shields.max > 0) {
      const supply = this.power.unlocked ? this.power.factor('shields') : 1;
      this.shields.current = Math.min(
        this.shields.max,
        this.shields.current + this.shields.regen * supply * dt,
      );
    }
  }

  /** Push simulation state onto the scene graph. Called from a render system. */
  syncTransform() {
    this.body.applyTo(this.root);
  }
}
