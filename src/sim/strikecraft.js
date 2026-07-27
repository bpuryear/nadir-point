import * as THREE from 'three';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { Ship } from './ship.js';
import { getShipClass } from '../core/contracts.js';

/**
 * The hangar layer.
 *
 * Installing a hangar deck converts this from single-ship tactics into a small-scale
 * RTS: the player gains a squadron to select, order, and lose. That is a genuine
 * change of genre partway through a run, so it is built as a system that SWITCHES ON
 * rather than one bolted on afterwards - selection, orders and the command UI all
 * exist from the start and simply have nothing to command until a hangar is installed.
 *
 * Strike craft are the only player-controlled things that leave the combat plane, and
 * that is deliberate: watching your fighters climb away from the plane is what tells
 * you the plane was a choice and not a limitation.
 */

export const SQUAD_STANCE = ['aggressive', 'defensive', 'escort', 'strike'];

export class StrikeCraft extends Ship {
  constructor(opts) {
    super({ ...opts, isPlayer: false });
    this.squad = opts.squad ?? null;
    this.homeShip = opts.homeShip ?? null;
    this.state = 'launching';   // launching | forming | engaging | returning | docked
    this.stateTimer = 0;
    this.fuel = 1;
    this.orbitPhase = Math.random === undefined ? 0 : 0; // set by the squad, never Math.random
  }
}

export class Squadron {
  constructor({ world, homeShip, size, classId, rng }) {
    this.world = world;
    this.homeShip = homeShip;
    this.rng = rng;
    this.classId = classId;
    this.size = size;
    /** @type {StrikeCraft[]} */
    this.craft = [];
    this.stance = 'defensive';
    this.order = { type: 'recall', target: null, point: null };
    this.name = 'Alpha';

    /** Formation slots, in home-ship local space. Kept off the combat plane on purpose. */
    this.slots = [];
    for (let i = 0; i < size; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      this.slots.push(new THREE.Vector3(
        (col - 1.5) * 90,
        220 + row * 70,
        -260 - row * 120,
      ));
    }
  }

  get alive() { return this.craft.filter((c) => !c.dead); }
  get docked() { return this.craft.filter((c) => c.state === 'docked').length; }

  launch() {
    const def = getShipClass(this.classId);
    if (!def) return false;
    let launched = 0;
    for (let i = this.craft.length; i < this.size; i++) {
      const c = new StrikeCraft({
        classDef: def,
        world: this.world,
        faction: 'player',
        squad: this,
        homeShip: this.homeShip,
        position: this.homeShip.position.clone().add(scratch.v1.set(
          this.rng.signed() * 60, 90 + this.rng.next() * 40, -this.homeShip.radius * 0.6,
        )),
      });
      c.orbitPhase = (i / this.size) * Math.PI * 2;
      c.state = 'launching';
      c.stateTimer = 0.6 + i * 0.35; // staggered launch, reads as a deck cycle
      this.craft.push(c);
      this.world.addShip(c);
      launched++;
    }
    return launched > 0;
  }

  orderAttack(target) {
    this.order = { type: 'attack', target, point: null };
    for (const c of this.alive) { c.state = 'engaging'; c.orderAttack(target); }
  }

  orderMove(point) {
    this.order = { type: 'move', target: null, point: point.clone() };
    for (const c of this.alive) c.state = 'moving';
  }

  recall() {
    this.order = { type: 'recall', target: null, point: null };
    for (const c of this.alive) c.state = 'returning';
  }

  setStance(s) {
    if (SQUAD_STANCE.includes(s)) this.stance = s;
  }
}

export class StrikeCraftSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('strikecraft');
    this.name = 'strikecraft';
    this.order = 30;
    /** @type {Squadron[]} */
    this.squadrons = [];

    this.bus.on(EV.MODULE_INSTALLED, () => this._syncCapacity());
    this.bus.on(EV.MODULE_LOST, () => this._syncCapacity());
    this.bus.on(EV.MODULE_REMOVED, () => this._syncCapacity());
  }

  _syncCapacity() {
    const bays = this.world.hangarBays ?? 0;
    if (bays > 0 && this.squadrons.length === 0) {
      const classId = this._playerStrikeCraftClass();
      if (!classId) return;
      const squad = new Squadron({
        world: this.world,
        homeShip: this.world.player,
        size: Math.min(8, bays),
        classId,
        rng: this.rng.fork('alpha'),
      });
      this.squadrons.push(squad);
      this.bus.emit(EV.NOTIFY, { text: `Squadron ${squad.name} ready — ${squad.size} craft`, important: true });
    } else if (bays === 0) {
      for (const s of this.squadrons) for (const c of s.alive) this.world.removeShip(c);
      this.squadrons.length = 0;
    }
  }

  _playerStrikeCraftClass() {
    // Whatever strike craft the geometry stream registered; prefer a player-flagged
    // one, otherwise fly whatever we salvaged the hangar from.
    for (const f of ['player', 'coalition', 'concord']) {
      const c = getShipClass(`${f}_strikecraft`);
      if (c) return c.id;
    }
    return null;
  }

  fixedUpdate(dt) {
    const player = this.world.player;
    if (!player) return;

    for (const squad of this.squadrons) {
      for (const c of squad.craft) {
        if (c.dead) continue;
        this._updateCraft(c, squad, dt);
      }
      // Clear out the dead so the squadron can rebuild from the deck.
      for (let i = squad.craft.length - 1; i >= 0; i--) {
        if (squad.craft[i].dead) squad.craft.splice(i, 1);
      }
    }
  }

  _updateCraft(c, squad, dt) {
    const home = squad.homeShip;
    c.stateTimer -= dt;

    switch (c.state) {
      case 'launching': {
        if (c.stateTimer > 0) {
          // Clear the deck before doing anything clever.
          c.body.seek(scratch.v1.copy(home.position).add(scratch.v2.set(0, 260, -home.radius)), dt, 0.7);
          break;
        }
        c.state = squad.order.type === 'attack' ? 'engaging' : 'forming';
        break;
      }
      case 'forming': {
        const slot = squad.slots[squad.craft.indexOf(c) % squad.slots.length];
        const s = Math.sin(home.heading), co = Math.cos(home.heading);
        scratch.v1.set(
          home.position.x + slot.x * co + slot.z * s,
          home.position.y + slot.y,
          home.position.z + slot.z * co - slot.x * s,
        );
        c.body.seek(scratch.v1, dt, 0.85);
        break;
      }
      case 'engaging': {
        const target = squad.order.target;
        if (!target || target.dead) { c.state = 'forming'; c.target = null; break; }
        c.target = target;
        // Strafing run: approach, then break off past the target rather than parking
        // on it. Fighters that hover in front of a capital ship look like drones.
        const dist = c.body.position.distanceTo(target.position);
        if (dist > target.radius * 1.6) {
          c.body.seek(target.position, dt, 1);
        } else {
          c.orbitPhase += dt * 0.9;
          scratch.v1.set(
            target.position.x + Math.cos(c.orbitPhase) * target.radius * 2.2,
            target.position.y + Math.sin(c.orbitPhase * 0.7) * target.radius * 0.9,
            target.position.z + Math.sin(c.orbitPhase) * target.radius * 2.2,
          );
          c.body.seek(scratch.v1, dt, 1);
        }
        break;
      }
      case 'moving': {
        if (squad.order.point) {
          const d = c.body.seek(squad.order.point, dt, 1);
          if (d < 200) c.state = 'forming';
        } else c.state = 'forming';
        break;
      }
      case 'returning': {
        const d = c.body.seek(home.position, dt, 1);
        if (d < home.radius * 0.6) {
          c.state = 'docked';
          c.dead = false;
          this.world.removeShip(c);
        }
        break;
      }
      default: break;
    }

    c.fixedUpdate(dt);
  }

  /** Squadrons the command UI can issue orders to. */
  get commandable() {
    return this.squadrons.filter((s) => s.alive.length > 0);
  }
}
