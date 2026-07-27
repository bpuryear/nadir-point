import * as THREE from 'three';
import { RNG, WORLD_SEED } from './rng.js';
import { EV } from './events.js';

/**
 * The World is the single object every system reads from and writes to. It is not
 * an ECS - a full ECS buys us nothing at this entity count and costs readability -
 * but entities do live in flat arrays so combat and physics can iterate tightly.
 */
export class World {
  constructor({ engine, renderer, seed = WORLD_SEED }) {
    this.engine = engine;
    this.bus = engine.bus;
    this.renderer = renderer;
    this.scene = renderer.scene;
    this.far = renderer.far;
    this.camera = renderer.camera;

    this.seed = seed;
    this.rng = new RNG(seed);

    /** @type {Ship[]} all live ships including the player */
    this.ships = [];
    /** @type {Object[]} wrecks awaiting salvage */
    this.wrecks = [];
    /** @type {Object[]} tow/tractor targets in flight */
    this.salvageInFlight = [];
    /** @type {Ship|null} */
    this.player = null;
    /** @type {Object|null} active POI instance */
    this.poi = null;

    /** Systems that want a handle on each other park it here. */
    this.systems = Object.create(null);

    /** Player-facing state. */
    this.inventory = [];
    this.materials = { alloy: 0, composite: 0, exotic: 0 };
    this.reputation = { coalition: 0, concord: 0 };
    this.unlocked = { powerRouting: false, hangar: false };

    this.selection = new Set();
    this.time = 0;
  }

  register(name, system) {
    this.systems[name] = system;
    return system;
  }

  addShip(ship) {
    this.ships.push(ship);
    if (ship.root) this.scene.add(ship.root);
    this.bus.emit(EV.SHIP_SPAWNED, ship);
    return ship;
  }

  removeShip(ship) {
    const i = this.ships.indexOf(ship);
    if (i >= 0) this.ships.splice(i, 1);
    if (ship.root?.parent) ship.root.parent.remove(ship.root);
    this.selection.delete(ship);
  }

  addWreck(wreck) {
    this.wrecks.push(wreck);
    if (wreck.root) this.scene.add(wreck.root);
    return wreck;
  }

  removeWreck(wreck) {
    const i = this.wrecks.indexOf(wreck);
    if (i >= 0) this.wrecks.splice(i, 1);
    if (wreck.root?.parent) wreck.root.parent.remove(wreck.root);
  }

  /** Ships hostile to `ship`, cheapest useful query in the game. */
  hostilesOf(ship, out = []) {
    out.length = 0;
    for (const other of this.ships) {
      if (other === ship || other.dead) continue;
      if (this.areHostile(ship.faction, other.faction)) out.push(other);
    }
    return out;
  }

  areHostile(a, b) {
    if (a === b) return false;
    if (a === 'derelict' || b === 'derelict') return true;
    if (a === 'player' || b === 'player') {
      const other = a === 'player' ? b : a;
      return (this.reputation[other] ?? 0) < 0;
    }
    return true; // coalition vs concord
  }

  /** Nearest entity of a predicate within radius. */
  nearest(position, radius, predicate) {
    let best = null;
    let bestD2 = radius * radius;
    for (const s of this.ships) {
      if (s.dead || !predicate(s)) continue;
      const d2 = position.distanceToSquared(s.position);
      if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    return best;
  }

  dispose() {
    this.ships.length = 0;
    this.wrecks.length = 0;
  }
}

/** Shared scratch vectors. Allocating in a hot loop is the one unforgivable sin here. */
export const scratch = {
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  v3: new THREE.Vector3(),
  v4: new THREE.Vector3(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  m1: new THREE.Matrix4(),
  m2: new THREE.Matrix4(),
  box: new THREE.Box3(),
  sphere: new THREE.Sphere(),
  ray: new THREE.Ray(),
  color: new THREE.Color(),
};
