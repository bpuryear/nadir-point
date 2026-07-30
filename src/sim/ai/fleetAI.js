/**
 * FLEET-LEVEL BEHAVIOUR.
 *
 * Individual ship AI answers "where do I point my guns". This answers the three
 * questions above that, and they are the ones that make a group of ships read as a
 * squadron rather than as five independent hulls that happen to share a colour:
 *
 *   1. FORMATION. A fleet has a facing and a shape. Broadside ships form line abreast
 *      ACROSS the bearing to the enemy, because that is the formation in which every
 *      hull in the line can fire at once - which is the same reason line-of-battle
 *      existed. Corvettes screen ahead of it. It is not decoration: a frigate holding
 *      a slot on the line is a frigate that is not masking its neighbour's arc.
 *
 *   2. FOCUS FIRE. Five ships spreading damage across five targets kill nothing for a
 *      minute and then everything at once. Five ships killing one target remove a
 *      fifth of the incoming fire immediately. The fleet picks one and everything that
 *      can reach it shoots it.
 *
 *   3. WHEN TO LEAVE. A fleet that is losing withdraws as a fleet, not as five
 *      separate panics. The threshold is on the ratio of committed strength, so a
 *      fight that turns hopeless ends, and the survivors are somebody's reinforcements
 *      at the next POI rather than five more wrecks here.
 */

import * as THREE from 'three';
import { yawOf, angleDelta } from '../physics.js';

/** Combat power of one hull, in comparable units. Hull, guns and mobility. */
export function shipStrength(ship) {
  if (!ship || ship.dead) return 0;
  let gun = 0;
  for (const m of ship.weapons) {
    if (!m.online) continue;
    const t = m.def.type;
    if (t === 'pd' || t === 'flak') continue;
    gun += (m.def.damage * m.def.shotsPerBurst) / Math.max(0.5, m.def.cooldown);
  }
  const mobility = ship.stranded ? 0.55 : 1;
  return (ship.hullHP * 0.02 + gun * 3.2) * mobility;
}

export const FORMATIONS = ['line', 'wedge', 'screen'];

export class Fleet {
  /**
   * @param {Object} p
   * @param {import('../../core/world.js').World} p.world
   * @param {string} p.faction
   * @param {string} p.id
   * @param {import('../../core/rng.js').RNG} p.rng
   * @param {THREE.Vector3} [p.anchor]  where it forms up when it has nothing to fight
   */
  constructor({ world, faction, id, rng, anchor = null, poiId = null }) {
    this.world = world;
    this.faction = faction;
    this.id = id;
    this.rng = rng;
    this.poiId = poiId;

    /** @type {import('../ship.js').Ship[]} */
    this.ships = [];
    /** @type {import('../ship.js').Ship|null} */
    this.focus = null;

    this.stance = 'engage';            // engage | hold | withdraw
    this.formation = 'line';
    this.spacing = 900;

    this.anchor = new THREE.Vector3().copy(anchor ?? new THREE.Vector3());
    this.centroid = new THREE.Vector3().copy(this.anchor);
    this.facing = 0;

    /** Preallocated slot vectors; grown only when the fleet gains a hull. */
    this._slots = [];
    this._slotIndex = new Map();

    this.initialStrength = 0;
    this.retreatThreshold = 0.30;
    this.thinkPeriod = 0.5;
    this.thinkIn = rng.range(0, 0.5);
  }

  add(ship) {
    if (this.ships.includes(ship)) return;
    this.ships.push(ship);
    while (this._slots.length < this.ships.length) this._slots.push(new THREE.Vector3());
    this._reindex();
    if (ship.ai) ship.ai.fleet = this;
    this.initialStrength += shipStrength(ship);
  }

  remove(ship) {
    const i = this.ships.indexOf(ship);
    if (i >= 0) this.ships.splice(i, 1);
    this._reindex();
  }

  _reindex() {
    this._slotIndex.clear();
    // Heavies hold the centre of the line, screens go to the wings. Stable ordering,
    // so a slot does not shuffle every time somebody dies.
    const ordered = this.ships.slice().sort((a, b) => (b.classDef?.length ?? 0) - (a.classDef?.length ?? 0));
    for (let i = 0; i < ordered.length; i++) this._slotIndex.set(ordered[i], i);
  }

  get alive() {
    let n = 0;
    for (const s of this.ships) if (!s.dead) n++;
    return n;
  }

  strength() {
    let total = 0;
    for (const s of this.ships) total += shipStrength(s);
    return total;
  }

  slotFor(ship) {
    const i = this._slotIndex.get(ship);
    return i === undefined ? this.anchor : this._slots[i];
  }
}

export class FleetAISystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('fleet-ai');
    this.name = 'fleet-ai';
    this.order = 22;
    /** @type {Fleet[]} */
    this.fleets = [];
    this._nextId = 0;

    this._scratch = new THREE.Vector3();
  }

  create({ faction, anchor = null, poiId = null }) {
    const fleet = new Fleet({
      world: this.world,
      faction,
      id: `${faction}-fleet-${this._nextId++}`,
      rng: this.rng.fork(`${faction}:${this._nextId}`),
      anchor,
      poiId,
    });
    this.fleets.push(fleet);
    return fleet;
  }

  destroy(fleet) {
    const i = this.fleets.indexOf(fleet);
    if (i >= 0) this.fleets.splice(i, 1);
    for (const s of fleet.ships) if (s.ai) s.ai.fleet = null;
    fleet.ships.length = 0;
  }

  fixedUpdate(dt) {
    for (let i = this.fleets.length - 1; i >= 0; i--) {
      const fleet = this.fleets[i];
      // Prune the dead. Cheap - fleets are small and this is the only place that
      // touches the array, so nothing else can be holding a stale index.
      for (let j = fleet.ships.length - 1; j >= 0; j--) {
        if (fleet.ships[j].dead) { fleet.ships.splice(j, 1); fleet._reindex(); }
      }
      if (fleet.ships.length === 0) { this.fleets.splice(i, 1); continue; }

      fleet.thinkIn -= dt;
      if (fleet.thinkIn > 0) { this._updateSlots(fleet); continue; }
      fleet.thinkIn += fleet.thinkPeriod;

      this._think(fleet);
      this._updateSlots(fleet);
    }
  }

  _think(fleet) {
    const world = this.world;

    // --- centroid and facing ------------------------------------------------
    let cx = 0, cz = 0, n = 0;
    for (const s of fleet.ships) { cx += s.position.x; cz += s.position.z; n++; }
    if (n > 0) fleet.centroid.set(cx / n, 0, cz / n);

    // --- focus fire ---------------------------------------------------------
    let best = null;
    let bestScore = -Infinity;
    let enemyStrength = 0;
    for (const other of world.ships) {
      if (other.dead) continue;
      if (!world.areHostile(fleet.faction, other.faction)) continue;
      const d = Math.hypot(other.position.x - fleet.centroid.x, other.position.z - fleet.centroid.z);
      if (d > 42000) continue;
      enemyStrength += shipStrength(other);
      const hpFrac = other.maxHullHP > 0 ? other.hullHP / other.maxHullHP : 1;
      // Concentrate on whatever dies soonest for the least travel: hurt things first,
      // then dangerous things, then near things.
      const score = (1 - hpFrac) * 3.2 + shipStrength(other) / 220 - (d / 12000);
      if (score > bestScore) { bestScore = score; best = other; }
    }
    fleet.focus = best;

    if (best) {
      fleet.facing = yawOf(best.position.x - fleet.centroid.x, best.position.z - fleet.centroid.z);
    } else {
      fleet.facing = yawOf(fleet.anchor.x - fleet.centroid.x, fleet.anchor.z - fleet.centroid.z);
    }

    // --- formation ----------------------------------------------------------
    let heavies = 0;
    let light = 0;
    let maxRadius = 200;
    for (const s of fleet.ships) {
      if (s.classDef?.role === 'corvette') light++; else heavies++;
      maxRadius = Math.max(maxRadius, s.radius);
    }
    fleet.formation = heavies === 0 ? 'screen' : (best ? 'line' : 'wedge');
    fleet.spacing = maxRadius * 2.6 + 320;

    // --- when to leave ------------------------------------------------------
    const mine = fleet.strength();
    if (fleet.stance !== 'withdraw') {
      const ratio = mine / Math.max(1, fleet.initialStrength);
      const outmatched = enemyStrength > mine * 2.1;
      if (ratio < fleet.retreatThreshold || (outmatched && ratio < 0.55)) {
        fleet.stance = 'withdraw';
      }
    } else if (enemyStrength < mine * 0.55) {
      // The enemy broke first. Turn around.
      fleet.stance = 'engage';
      fleet.initialStrength = Math.max(mine, fleet.initialStrength * 0.6);
    }
  }

  /**
   * Write the formation slots. Runs every step (not just on the think tick) so slots
   * track a moving centroid smoothly; it is pure arithmetic over a handful of ships
   * into vectors that already exist.
   *
   * WHICH POINT THE FORMATION IS BUILT AROUND IS THE WHOLE OF "GO SOMEWHERE".
   *
   * This used to build every slot around `fleet.centroid` unconditionally, including
   * when the fleet had nothing to fight — so `ShipAI._patrol`, whose entire job is to
   * drive to `slotFor(ship)`, was handed a point roughly where the ship already stood,
   * measured `d < anchorRadius`, and set the throttle to zero. A fleet with no target
   * therefore could not move, and `Fleet.anchor` — documented in the constructor as
   * "where it forms up when it has nothing to fight" — was read by nothing except a
   * facing fallback. It was decorative.
   *
   * That is not a tidiness point. It is why an escalation group that opened outside its
   * own acquisition range sat on its spawn point for the rest of the game: nothing in
   * the fleet layer could tell it where to be. With no focus the formation now assembles
   * on the anchor, which `FactionWarSystem._updateResponses` keeps on the player, so a
   * group that has lost contact steers to where its quarry is instead of holding a
   * station nobody chose. With a focus, `base` is the centroid exactly as before.
   */
  _updateSlots(fleet) {
    const n = fleet.ships.length;
    if (n === 0) return;
    const s = Math.sin(fleet.facing), c = Math.cos(fleet.facing);
    // right-hand perpendicular of the facing, on the plane
    const rx = c, rz = -s;
    const base = fleet.focus && !fleet.focus.dead ? fleet.centroid : fleet.anchor;

    for (let i = 0; i < n; i++) {
      const slot = fleet._slots[i] ?? (fleet._slots[i] = new THREE.Vector3());
      const lateral = (i - (n - 1) * 0.5) * fleet.spacing;
      let along = 0;
      if (fleet.formation === 'wedge') along = -Math.abs(i - (n - 1) * 0.5) * fleet.spacing * 0.8;
      else if (fleet.formation === 'screen') along = fleet.spacing * 1.6;
      slot.set(
        base.x + rx * lateral + s * along,
        0,
        base.z + rz * lateral + c * along,
      );
    }
  }
}
