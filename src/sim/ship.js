import * as THREE from 'three';
import { PlaneBody, FreeBody, MoveController, angleDelta, yawOf } from './physics.js';
import { PowerPlant, installDefaultPresets } from './power.js';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { HARDPOINTS } from '../core/contracts.js';

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
    this.target = null;
    this.aimedSubsystem = null;

    this.worldPosition = new THREE.Vector3();
    this.worldForward = new THREE.Vector3();
  }

  get range() { return this.def.range; }

  /** True when a world-space point falls inside this mount's arc and range. */
  canBear(shipPosition, shipHeading, point) {
    const dx = point.x - this.worldPosition.x;
    const dz = point.z - this.worldPosition.z;
    const dy = point.y - this.worldPosition.y;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > this.range * this.range) return false;

    const bearing = yawOf(dx, dz);
    const relative = angleDelta(shipHeading + this.yawCentre, bearing);
    if (Math.abs(relative) > this.yawWidth * 0.5) return false;

    const horiz = Math.sqrt(dx * dx + dz * dz);
    const pitch = Math.atan2(dy, Math.max(1e-3, horiz));
    return Math.abs(pitch) <= this.pitchWidth * 0.5;
  }

  /** How far off-arc a point is, in radians. 0 means bearing. Used by the AI. */
  arcError(shipHeading, point) {
    const dx = point.x - this.worldPosition.x;
    const dz = point.z - this.worldPosition.z;
    const relative = angleDelta(shipHeading + this.yawCentre, yawOf(dx, dz));
    return Math.max(0, Math.abs(relative) - this.yawWidth * 0.5);
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

  /** Traverse toward a bearing, clamped to the arc. Returns true when on target. */
  trackTowards(shipHeading, point, dt) {
    const dx = point.x - this.worldPosition.x;
    const dz = point.z - this.worldPosition.z;
    const desired = angleDelta(shipHeading + this.yawCentre, yawOf(dx, dz));
    const clamped = THREE.MathUtils.clamp(desired, -this.yawWidth * 0.5, this.yawWidth * 0.5);
    const delta = clamped - this.traverse;
    const step = this.def.tracking * dt;
    this.traverse += THREE.MathUtils.clamp(delta, -step, step);
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
      this.weapons.push(new WeaponMount(w, {
        localPosition: new THREE.Vector3(...(w.mount ?? [0, 0, 0])),
        yawCentre: w.yawCentre ?? 0,
        yawWidth: w.yawWidth ?? Math.PI * 0.5,
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
     * How much of this hull survives as salvage. Starts at 1. A reactor kill takes
     * almost all of it - that is the central tension of the game, expressed as one
     * number. Anyone can blow a ship up; taking one apart is a skill.
     */
    this.salvageIntegrity = 1;

    this.order = { type: 'hold', point: null, target: null, subsystem: null };
    this.target = null;
    this.targetSubsystem = null;

    this._hostiles = [];
  }

  // --- queries --------------------------------------------------------------

  get position() { return this.body.position; }
  get velocity() { return this.body.velocity; }
  get heading() { return this.planeLocked ? this.body.heading : 0; }
  get radius() { return this.body.radius; }

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

  orderAttack(target, subsystemId = null) {
    this.order = { type: 'attack', point: null, target, subsystem: subsystemId };
    this.target = target;
    this.targetSubsystem = subsystemId;
    this.bus?.emit(EV.ORDER_ATTACK, { ship: this, target, subsystem: subsystemId });
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
          if (m.localPosition.distanceToSquared(scratch.v1.set(...sub.def.position)) < (sub.def.radius * 1.6) ** 2) {
            m.online = false;
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

  _destroy(opts) {
    if (this.dead) return;
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

  /** Recompute how well the hull performs given damage and power routing. */
  _refreshEfficiency() {
    const engineHealth = this.kindHealth('engine');
    const enginePower = this.power.unlocked ? 0.55 + 0.9 * this.power.factor('engines') * 0.5 : 1;
    this.body.engineEfficiency = Math.max(0.05, engineHealth * enginePower);
    this.body.steeringEfficiency = Math.max(0.1, 0.35 + 0.65 * engineHealth);

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

    for (const m of this.weapons) {
      m.updateWorld(this.position, this.heading);
      if (m.cooldown > 0) m.cooldown -= dt;
      if (m.burstTimer > 0) m.burstTimer -= dt;
    }

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
