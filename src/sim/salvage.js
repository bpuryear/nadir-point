import * as THREE from 'three';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { RANGE } from '../core/units.js';
import { getModule, allModules } from '../core/contracts.js';
import { FreeBody } from './physics.js';
import { installProgression, storeSection, breakDownItem, gradeForKind } from './meta/index.js';
import {
  clamp01, salvageState, conditionLabel, cutQuality, burnRate, scrapYield, CONDITION,
} from './condition.js';
import { ammoSalvage, ammoClassOf, AMMO_SPEC } from './stores.js';

/**
 * Salvage.
 *
 * Yields PARTS, not currency. A cannon bank you cut off a wreck is a cannon bank, and
 * it is the same object when it ends up on your hull. There is no market, no prices
 * and nothing to sell to - the only economy is that parts can be broken down into
 * generic materials, and materials are what repairs cost. That is the sink that makes
 * scarcity bite without inventing a trading game.
 *
 * How a ship died decides what is left of it. A reactor kill leaves almost nothing;
 * carefully shooting out engines and weapon mounts leaves nearly everything. This is
 * the whole reason subsystem targeting exists.
 */

/**
 * A cuttable section of a wreck. One section, one part.
 *
 * `condition` is the universal 0..1 from condition.js and it is the SAME number that
 * was on the hull section while you were shooting at it, that will be on the part in
 * your hold, and that will be on the mount when you install it. `integrity` remains as
 * an alias so nothing that already reads it has to change.
 */
export class WreckSection {
  constructor({ id, moduleId, label, localPosition, radius, condition = 1, integrity, materials = 0, ammo = null, ammoRounds = 0 }) {
    this.id = id;
    this.moduleId = moduleId;      // null means it only yields raw materials
    this.label = label;
    this.localPosition = localPosition.clone();
    this.worldPosition = new THREE.Vector3();
    this.radius = radius;
    /** 0..1 universal condition. Below CONDITION.scrap it is materials only. */
    this.condition = clamp01(integrity ?? condition);
    this.materials = materials;
    /** Salvageable ammunition, when this section was a magazine. */
    this.ammo = ammo;
    this.ammoRounds = ammoRounds;
    this.cutProgress = 0;
    this.detached = false;
    this.object = null;            // geometry, if the wreck built one
  }

  /** Legacy alias. Everything that used `integrity` keeps working. */
  get integrity() { return this.condition; }
  set integrity(v) { this.condition = clamp01(v); }

  get cuttable() {
    return !this.detached && this.condition > 0.02;
  }

  /** INTACT / DAMAGED / SCRAP, the same vocabulary the targeting ring uses. */
  get state() { return salvageState(this.condition); }

  /** True when cutting this out will actually produce an installable part. */
  get yieldsModule() { return !!this.moduleId && this.condition >= CONDITION.scrap; }
}

export class Wreck {
  /**
   * @param {Object} opts
   * @param {import('./ship.js').Ship} opts.ship  the ship that died
   */
  constructor({ ship, root = null, rng }) {
    this.id = `wreck:${ship.id}`;
    this.sourceClass = ship.classDef;
    this.faction = ship.faction;
    this.name = `${ship.classDef.name} hulk`;
    this.root = root ?? ship.root;
    this.integrity = ship.salvageIntegrity;

    /**
     * RESIDUAL HEAT. A hull that went up with its reactor is still burning when you
     * get there, and a torch cut through a burning wreck cooks what you are cutting
     * out of it (condition.js#cutQuality). It decays over about ninety seconds, so
     * waiting is a genuine option - and waiting is exactly what a response timer or a
     * second hostile makes expensive. The wreck is a clock you can choose to read.
     */
    this.residualHeat = 0;
    this.heatDecay = 1 / 90;

    // Wrecks tumble. Slowly, and forever, because nothing stops them.
    this.body = new FreeBody({ mass: ship.classDef.mass, radius: ship.radius });
    this.body.position.copy(ship.position);
    this.body.velocity.copy(ship.velocity).multiplyScalar(0.35);
    this.body.quaternion.copy(ship.root.quaternion);
    this.body.angularVelocity.set(
      rng.signed() * 0.05, rng.signed() * 0.04, rng.signed() * 0.05,
    );
    this.body.noCollide = false;

    /** @type {WreckSection[]} */
    this.sections = [];
    this._buildSections(ship, rng);

    this.towedBy = null;
  }

  /**
   * Turn what survived into cuttable sections.
   *
   * This used to be a die roll: every subsystem rolled against ONE hull-wide integrity
   * number, so the destroyer whose engines you surgically removed and the destroyer you
   * hosed from bow to stern produced statistically identical loot. Now each section
   * arrives carrying the condition it accumulated during the fight, section by section.
   * Shoot the engines out cleanly and the weapon batteries come off at 0.9; brawl at
   * knife range and everything comes off at 0.4.
   */
  _buildSections(ship, rng) {
    const pool = allModules();
    let index = 0;

    for (const sub of ship.subsystems.values()) {
      const section = ship.sections?.get(sub.def.id);
      // Section condition is the accumulated damage record. A destroyed subsystem is
      // scrap regardless of what the plating around it looks like.
      const condition = sub.destroyed
        ? Math.min(section?.condition ?? 0.25, 0.18)
        : clamp01(section?.condition ?? this.integrity);
      const localPos = new THREE.Vector3(...sub.def.position);

      let moduleId = null;
      if (condition >= CONDITION.scrap
        && (sub.def.kind === 'weapon' || sub.def.kind === 'reactor' || sub.def.kind === 'hangar' || sub.def.kind === 'sensor')) {
        // Match a registered module of this faction whose role fits the subsystem.
        const candidates = pool.filter((m) => m.faction === this.faction && matchesKind(m, sub.def.kind));
        if (candidates.length) moduleId = rng.pick(candidates).id;
      }

      this.sections.push(new WreckSection({
        id: `${this.id}/s${index++}`,
        moduleId,
        label: sub.def.label ?? sub.def.id,
        localPosition: localPos,
        radius: sub.def.radius,
        condition,
        materials: Math.round((sub.def.salvageValue ?? 0.2) * 100 * condition),
      }));
    }

    // Magazines. A hull that died with rounds still in it is worth cutting open for
    // them, which is what keeps a dry player looking for a specific KIND of target
    // rather than any target at all.
    const carried = new Map();
    for (const mount of ship.weapons ?? []) {
      const cls = mount.ammoClass ?? ammoClassOf(mount.def);
      if (!cls) continue;
      carried.set(cls, (carried.get(cls) ?? 0) + (ship.stores?.rounds(cls) ?? 0));
    }
    for (const [cls, held] of carried) {
      const rounds = Math.round(Math.min(held, ammoSalvage(cls)) * this.integrity);
      if (rounds <= 0) continue;
      this.sections.push(new WreckSection({
        id: `${this.id}/mag_${cls}`,
        moduleId: null,
        label: `${AMMO_SPEC[cls].label} MAGAZINE`,
        localPosition: new THREE.Vector3(rng.signed() * ship.radius * 0.3, 0, rng.signed() * ship.radius * 0.3),
        radius: ship.radius * 0.12,
        condition: clamp01(this.integrity),
        materials: 12,
        ammo: cls,
        ammoRounds: rounds,
      }));
    }

    // Plain hull plating is always worth something, which is what keeps a blown-up
    // ship from being a total loss. Plating carries the condition of the run of hull
    // it came from, so which side of the ship you shot decides which plates are worth
    // the cutting time.
    const plates = ['plate_fore', 'plate_mid', 'plate_aft'];
    for (let i = 0; i < plates.length; i++) {
      const hull = ship.sections?.get(plates[i]);
      const condition = clamp01(hull?.condition ?? this.integrity);
      if (condition < 0.05) continue;
      this.sections.push(new WreckSection({
        id: `${this.id}/${plates[i]}`,
        moduleId: null,
        label: hull?.label ?? 'hull plating',
        localPosition: hull ? hull.localPosition.clone() : new THREE.Vector3(0, 0, (i - 1) * ship.radius * 0.55),
        radius: ship.radius * 0.18,
        condition,
        materials: Math.round(rng.range(30, 70) * condition),
      }));
    }
  }

  get spent() {
    return this.sections.every((s) => !s.cuttable);
  }

  update(dt) {
    this.body.integrate(dt);
    if (this.root) this.body.applyTo(this.root);
    const q = this.body.quaternion;
    for (const s of this.sections) {
      s.worldPosition.copy(s.localPosition).applyQuaternion(q).add(this.body.position);
    }
  }
}

function matchesKind(moduleDef, kind) {
  if (kind === 'weapon') return !!moduleDef.weapon;
  if (kind === 'hangar') return !!moduleDef.grants?.hangarBays;
  if (kind === 'reactor') return !!moduleDef.grants?.powerOutput;
  if (kind === 'sensor') return !!moduleDef.grants?.sensorRange;
  return false;
}

/**
 * The salvage loop: cut a section free, tow it in, store it, install it.
 *
 * Cutting is deliberately slow and deliberately requires you to hold position inside
 * a short range. That is what turns "harvest under fire during a live battle" into an
 * actual decision rather than a free reward.
 */
export class SalvageSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('salvage');
    this.order = 80;
    this.name = 'salvage';

    /** @type {{section:WreckSection, wreck:Wreck}|null} */
    this.cutting = null;
    /** Sections in transit to the ventral bay. */
    this.inTow = [];

    this.cutRate = 0.34;         // fraction per second at base tractor rating
    this.tractorRating = 0;      // raised by the salvage tractor module
    this.cargoCapacity = 6;      // raised by cargo expansion modules

    this.bus.on(EV.SHIP_DESTROYED, ({ ship }) => this._spawnWreck(ship));

    // The progression, economy and objective layer installs from here.
    //
    // `src/game.js` is integration's file and its `import.meta.glob` list has no entry
    // that would find `sim/meta/index.js`, so there is no other seam available to this
    // stream. Salvage is constructed unconditionally in `bootGame`, which makes it a
    // reliable one. The installer is idempotent, so lifting this call into `bootGame`
    // later is a two-line change that cannot double-install.
    try {
      installProgression(world, { salvage: this });
    } catch (err) {
      console.warn('[salvage] progression layer failed to install', err);
    }
  }

  get player() { return this.world.player; }

  _spawnWreck(ship) {
    if (ship.isPlayer) return;
    const wreck = new Wreck({ ship, root: ship.root, rng: this.rng.fork(ship.id) });
    this.world.removeShip(ship);
    this.world.addWreck(wreck);
    return wreck;
  }

  /** Player orders a cut on a specific section. */
  orderCut(wreck, section) {
    if (!section.cuttable) return false;
    this.cutting = { wreck, section };
    this.bus.emit(EV.SALVAGE_CUT_START, { wreck, section });
    return true;
  }

  cancelCut() {
    if (this.cutting) this.bus.emit(EV.SALVAGE_CUT_STOP, this.cutting);
    this.cutting = null;
  }

  /** Nearest cuttable section within tractor range of the player. */
  findNearestSection(maxRange = RANGE.salvageBeam) {
    const p = this.player;
    if (!p) return null;
    let best = null;
    let bestD2 = maxRange * maxRange;
    for (const wreck of this.world.wrecks) {
      for (const s of wreck.sections) {
        if (!s.cuttable) continue;
        const d2 = s.worldPosition.distanceToSquared(p.position);
        if (d2 < bestD2) { bestD2 = d2; best = { wreck, section: s }; }
      }
    }
    return best;
  }

  fixedUpdate(dt) {
    for (const wreck of this.world.wrecks) wreck.update(dt);

    this._updateCut(dt);
    this._updateTow(dt);
  }

  _updateCut(dt) {
    const c = this.cutting;
    if (!c) return;
    const p = this.player;
    if (!p || p.dead) { this.cancelCut(); return; }

    const range = RANGE.salvageBeam * (1 + this.tractorRating * 0.4);
    const dist = c.section.worldPosition.distanceTo(p.position);
    if (dist > range || !c.section.cuttable) {
      // Drifting out of range stops the cut but keeps the progress, so a wreck that
      // tumbles away is an inconvenience rather than a lost run.
      this.cancelCut();
      return;
    }

    const rate = this.cutRate * (1 + this.tractorRating * 0.65);
    c.section.cutProgress += rate * dt;

    if (c.section.cutProgress >= 1) {
      c.section.detached = true;
      c.section.cutProgress = 1;
      this.inTow.push({
        wreck: c.wreck,
        section: c.section,
        position: c.section.worldPosition.clone(),
        velocity: new THREE.Vector3(),
      });
      this.bus.emit(EV.SALVAGE_TOW_START, { section: c.section });
      this.cutting = null;
    }
  }

  _updateTow(dt) {
    const p = this.player;
    if (!p) return;
    for (let i = this.inTow.length - 1; i >= 0; i--) {
      const t = this.inTow[i];
      const toShip = scratch.v1.copy(p.position).sub(t.position);
      const dist = toShip.length();
      if (dist < p.radius * 0.4) {
        this._store(t.section);
        this.inTow.splice(i, 1);
        continue;
      }
      toShip.divideScalar(Math.max(1e-3, dist));
      // Accelerate toward the bay, capped, so a tow has visible weight to it.
      t.velocity.addScaledVector(toShip, 110 * dt);
      if (t.velocity.length() > 380) t.velocity.setLength(380);
      t.position.addScaledVector(t.velocity, dt);
    }
  }

  _store(section) {
    const w = this.world;

    // THE ECONOMY SEAM. When the progression layer is installed, storing a section is
    // a volume decision and a materials decision rather than a slot check: see
    // `sim/meta/index.js#storeSection`. The path below is kept intact as the fallback
    // so this file still works standalone.
    if (w.systems.economy) {
      const result = storeSection(w, section, this);
      if (result.kind !== 'none') return result;
    }

    if (section.moduleId && w.inventory.length < this.cargoCapacity) {
      const def = getModule(section.moduleId);
      if (def) {
        w.inventory.push({ moduleId: def.id, condition: section.integrity, uid: section.id });
        this.bus.emit(EV.SALVAGE_ACQUIRED, { kind: 'module', module: def, section });
        return;
      }
    }
    // Either it was scrap, or the hold is full - either way it becomes materials.
    const mats = section.materials;
    w.materials.alloy += Math.round(mats * 0.7);
    w.materials.composite += Math.round(mats * 0.25);
    if (this.rng.next() < 0.08) w.materials.exotic += 1;
    this.bus.emit(EV.SALVAGE_ACQUIRED, { kind: 'materials', amount: mats, section });
  }

  /** Break a stored part down into materials. The repair economy runs on this. */
  scrapInventoryItem(uid) {
    const w = this.world;
    const i = w.inventory.findIndex((it) => it.uid === uid);
    if (i < 0) return false;
    const [item] = w.inventory.splice(i, 1);
    const def = getModule(item.moduleId);
    const value = Math.round((def?.mass ?? 200) * 0.4 * item.condition);
    w.materials.alloy += value;
    w.materials.composite += Math.round(value * 0.35);
    this.bus.emit(EV.SALVAGE_ACQUIRED, { kind: 'materials', amount: value, scrapped: def });
    return true;
  }
}
