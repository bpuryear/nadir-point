/**
 * STORES: ammunition, charge, coolant, propellant.
 *
 * A fight used to cost time and hull. It should cost stores. This is the consequence
 * layer that turns "should I take this fight" into an arithmetic question with an
 * answer the player can work out before committing.
 *
 * TWO CURRENCIES, ONE DECISION (beta-decay-systems.md §6.4):
 *
 *   KINETIC weapons - cannon, rail, missile, flak, pd - draw finite rounds from a
 *   magazine. Rounds are salvageable off wrecks and fabricable from materials, so an
 *   empty magazine is a reason to go and cut something open.
 *
 *   ENERGY weapons - beam, lance, mining - draw reactor charge, which refills from the
 *   `weapons` power channel. They never run out, but every shot is power you are not
 *   spending on shields, and the buffer empties faster than the reactor fills it.
 *
 * So an all-kinetic fit can alpha-strike but goes dry; an all-energy fit never goes dry
 * but cannot alpha-strike without dropping its shields to do it. Neither is correct,
 * which is the definition of a decision.
 *
 * PROPELLANT is the travel layer's currency (0.8 units/km, `world/travel.js`), and it
 * has never been charged for inside a fight. It is now: manoeuvring spends delta-v and
 * delta-v spends propellant, so a running battle costs you the legs to get home. The
 * 40-unit reserve floor from the travel spec is honoured here too - you are always left
 * able to limp, never stranded by a fight.
 */

import { EV } from '../core/events.js';
import { clamp01 } from './condition.js';

/*
 * The ammunition classes and magazine data now live in `core/ammo.js` and are re-exported
 * here, so every existing `from './stores.js'` import keeps working unchanged.
 *
 * They moved because `core/contracts.js` needs the ready-round defaults to validate that
 * a weapon's burst fits its magazine, and importing them from here closed a cycle
 * (contracts -> stores -> condition -> meta/materials -> contracts). See the header of
 * `core/ammo.js` for why that cycle was invisible to the check that was run against it.
 */
export {
  AMMO_FOR_TYPE, AMMO_SPEC, ammoSalvage, ammoClassOf, isEnergyWeapon,
} from '../core/ammo.js';
import { AMMO_SPEC } from '../core/ammo.js';

export const STORES = {
  /** Charge buffer, in reactor units. Sized so a beam bank empties it in ~6 seconds. */
  chargeBase: 90,
  /** Charge refilled per second per unit of `weapons` power available. */
  chargeRegenPerPower: 0.85,
  /** Coolant purges carried. Small on purpose - it is a decision, not a rotation. */
  coolantBase: 3,
  /**
   * Propellant per m/s of commanded delta-v, at reference mass.
   *
   * Calibrated so one full stop-and-restart of the cruiser costs about seven units -
   * roughly nine kilometres of transit. A knife fight where you keep reversing your
   * facing therefore costs a real fraction of the legs you needed to get home, and a
   * fight you win from a single firing pass costs almost nothing. That difference is
   * the point.
   */
  burnPerDeltaV: 0.03,
  /** Travel spec figure, repeated here rather than imported across a stream boundary. */
  propellantPerKm: 0.8,
  /** The reserve the cruiser never spends manoeuvring. Matches world/travel.js. */
  reserve: 40,
  /** Engine authority once you are down to the reserve. You can limp, not fight. */
  starvedEfficiency: 0.45,
};

/**
 * Everything a hull carries that a fight can use up.
 *
 * Every ship gets one. The player's is authoritative and visible; a hostile's runs the
 * same code with a coarser magazine, which means a long fight genuinely dries an enemy
 * up and "outlast them" is an available tactic rather than a fiction.
 */
export class ShipStores {
  constructor(ship, { scale = 1, player = false } = {}) {
    this.ship = ship;
    this.player = player;

    /** @type {Record<string, number>} rounds in the ship magazine, by class */
    this.ammo = Object.create(null);
    /** @type {Record<string, number>} */
    this.capacity = Object.create(null);
    for (const cls of Object.keys(AMMO_SPEC)) {
      this.capacity[cls] = Math.round(AMMO_SPEC[cls].capacity * scale);
      this.ammo[cls] = this.capacity[cls];
    }

    this.chargeMax = STORES.chargeBase * scale;
    this.charge = this.chargeMax;

    this.coolantMax = player ? STORES.coolantBase : 1;
    this.coolant = this.coolantMax;

    /** Non-player hulls keep propellant locally; the player shares world.propellant. */
    this.localPropellant = { current: 400 * scale, max: 400 * scale, reserve: 0 };

    this.starved = false;
    this._warnedDry = Object.create(null);
    this._prevVel = { x: 0, y: 0, z: 0 };
    this._burned = 0;

    this._report = { ammo: [], charge: 0, chargeMax: 0, coolant: 0, coolantMax: 0,
      propellant: 0, propellantMax: 0, reserve: 0, starved: false, burnRate: 0 };
  }

  /** The propellant tank this hull draws from. The player's is the travel layer's. */
  tank() {
    if (!this.player) return this.localPropellant;
    const w = this.ship.world;
    if (!w) return this.localPropellant;
    // travel.js lazily creates the same object with the same defaults; whoever gets
    // here first wins and the other reuses it. Idempotent by construction.
    if (!w.propellant) w.propellant = { current: 640, max: 640, reserve: STORES.reserve };
    return w.propellant;
  }

  // --- ammunition ----------------------------------------------------------

  rounds(cls) { return cls ? (this.ammo[cls] ?? 0) : 0; }

  addAmmo(cls, n) {
    if (!cls || !(n > 0)) return 0;
    const cap = this.capacity[cls] ?? 0;
    const before = this.ammo[cls] ?? 0;
    const after = Math.min(cap, before + n);
    this.ammo[cls] = after;
    return after - before;
  }

  /**
   * Can this mount fire right now, and if not, why not.
   * Returns null when it can, or a reason string the HUD prints verbatim.
   */
  blockedReason(mount) {
    const cls = mount.ammoClass;
    if (cls === null) {
      return this.charge >= (mount.def.powerDraw ?? 4) ? null : 'CHARGE';
    }
    if (mount.reloading > 0) return 'RELOAD';
    if (mount.ready > 0) return null;
    return (this.ammo[cls] ?? 0) > 0 ? 'RELOAD' : 'DRY';
  }

  /** Spend one shot's worth. Returns false if it could not be paid for. */
  consumeShot(mount) {
    const cls = mount.ammoClass;
    if (cls === null) {
      const cost = mount.def.powerDraw ?? 4;
      if (this.charge < cost) return false;
      this.charge -= cost;
      return true;
    }
    if (mount.ready <= 0) return false;
    mount.ready--;
    if (mount.ready === 0) this.beginReload(mount);
    return true;
  }

  /**
   * Refill a mount's ready feed from the magazine.
   *
   * A dead `feed` sub-part does not stop the reload, it makes it hand-work: 3.5x as
   * long. Blocking it entirely would silently delete the module, which is exactly the
   * kind of invisible consequence the design test forbids.
   */
  beginReload(mount) {
    const cls = mount.ammoClass;
    if (cls === null || mount.reloading > 0) return false;
    if ((this.ammo[cls] ?? 0) <= 0) {
      if (!this._warnedDry[cls] && this.player) {
        this._warnedDry[cls] = true;
        this.ship.bus?.emit(EV.NOTIFY, { text: `${AMMO_SPEC[cls].label} MAGAZINE DRY`, important: true });
      }
      return false;
    }
    const feedMul = mount.parts ? mount.parts.reloadMul : 1;
    mount.reloading = (mount.def.reload ?? AMMO_SPEC[cls].reload) * feedMul;
    return true;
  }

  _finishReload(mount) {
    const cls = mount.ammoClass;
    const want = mount.readyMax - mount.ready;
    const have = this.ammo[cls] ?? 0;
    const taken = Math.min(want, have);
    this.ammo[cls] = have - taken;
    mount.ready += taken;
    mount.reloading = 0;
    if (taken > 0) this._warnedDry[cls] = false;
  }

  /** Manufacture rounds from materials. Competes directly with repair for alloy. */
  fabricate(cls, rounds, materials) {
    const spec = AMMO_SPEC[cls];
    if (!spec || !(rounds > 0)) return { ok: false, reason: 'unknown ammunition class' };
    const room = (this.capacity[cls] ?? 0) - (this.ammo[cls] ?? 0);
    const n = Math.min(rounds, room);
    if (n <= 0) return { ok: false, reason: 'magazine full' };
    const alloy = Math.ceil(n * spec.fabAlloy);
    const composite = Math.ceil(n * spec.fabComposite);
    if ((materials.alloy ?? 0) < alloy) return { ok: false, reason: `needs ${alloy} alloy, have ${materials.alloy ?? 0}`, alloy, composite };
    if ((materials.composite ?? 0) < composite) return { ok: false, reason: `needs ${composite} composite, have ${materials.composite ?? 0}`, alloy, composite };
    materials.alloy -= alloy;
    materials.composite -= composite;
    this.ammo[cls] = (this.ammo[cls] ?? 0) + n;
    return { ok: true, rounds: n, alloy, composite };
  }

  // --- per-step ------------------------------------------------------------

  update(dt) {
    const ship = this.ship;

    // Charge refills from whatever the weapons channel is actually delivering. Route
    // power away from weapons and your beams stutter within a couple of seconds.
    const power = ship.power;
    const supply = power ? (power.unlocked ? power.get('weapons') : power.capacity * 0.25) : 25;
    if (this.charge < this.chargeMax) {
      this.charge = Math.min(this.chargeMax, this.charge + supply * STORES.chargeRegenPerPower * dt * 0.1);
    }

    for (const mount of ship.weapons) {
      if (mount.reloading > 0) {
        mount.reloading -= dt;
        if (mount.reloading <= 0) this._finishReload(mount);
      } else if (mount.ammoClass !== null && mount.ready <= 0) {
        this.beginReload(mount);
      }
    }

    this._updatePropellant(dt);
  }

  /**
   * Propellant against commanded delta-v.
   *
   * Charging distance would be wrong - this is a vacuum, coasting is free. What costs
   * is changing your velocity, which is precisely the thing a knife-fight makes you do
   * constantly. Kill an enemy's engines and circling them at leisure is cheap; chasing
   * a corvette that keeps breaking off is not.
   */
  _updatePropellant(dt) {
    const b = this.ship.body;
    if (!b) return;
    const dvx = b.velocity.x - this._prevVel.x;
    const dvy = b.velocity.y - this._prevVel.y;
    const dvz = b.velocity.z - this._prevVel.z;
    this._prevVel.x = b.velocity.x; this._prevVel.y = b.velocity.y; this._prevVel.z = b.velocity.z;

    // While the travel layer is running a transit leg it bills the propellant itself,
    // per the published 0.8/km rate. Double-billing the same burn would be a bug the
    // player experiences as "the numbers lie".
    if (this.ship.world?.systems?.travel?.transiting) return;

    const dv = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    if (dv < 1e-4) { this._burned += (0 - this._burned) * Math.min(1, dt * 2); return; }

    const massMul = this.ship.massLoad ?? 1;
    const spend = dv * STORES.burnPerDeltaV * massMul;
    const tank = this.tank();
    const floor = this.player ? (tank.reserve ?? STORES.reserve) : 0;
    const available = Math.max(0, tank.current - floor);
    const paid = Math.min(available, spend);
    tank.current = Math.max(0, tank.current - paid);
    this._burned += (spend / Math.max(1e-6, dt) - this._burned) * Math.min(1, dt * 3);

    const starved = paid < spend - 1e-6;
    if (starved !== this.starved) {
      this.starved = starved;
      if (starved && this.player) {
        this.ship.bus?.emit(EV.NOTIFY, { text: 'PROPELLANT AT RESERVE — MANOEUVRING LIMITED', important: true });
      }
    }
  }

  /**
   * READ API for the HUD. Cached and mutated; safe every frame, do not retain.
   *
   *   const s = storesReport(world.player);
   *   s.ammo[i]   { cls, label, rounds, capacity, ready, readyMax, reloading, dry }
   *   s.charge / s.chargeMax        energy buffer
   *   s.propellant / s.propellantMax / s.reserve
   *   s.starved   true when manoeuvring is being clipped by the reserve floor
   */
  report() {
    const r = this._report;
    const rows = r.ammo;
    rows.length = 0;
    for (const cls of Object.keys(AMMO_SPEC)) {
      let ready = 0, readyMax = 0, reloading = 0, used = false;
      for (const m of this.ship.weapons) {
        if (m.ammoClass !== cls) continue;
        used = true;
        ready += m.ready; readyMax += m.readyMax;
        reloading = Math.max(reloading, m.reloading);
      }
      if (!used) continue;
      let row = this._rowCache?.[cls];
      if (!row) {
        if (!this._rowCache) this._rowCache = Object.create(null);
        row = this._rowCache[cls] = {};
      }
      row.cls = cls;
      row.label = AMMO_SPEC[cls].label;
      row.rounds = this.ammo[cls] ?? 0;
      row.capacity = this.capacity[cls] ?? 0;
      row.ready = ready;
      row.readyMax = readyMax;
      row.reloading = reloading;
      row.dry = (this.ammo[cls] ?? 0) <= 0 && ready <= 0;
      rows.push(row);
    }
    const tank = this.tank();
    r.charge = this.charge;
    r.chargeMax = this.chargeMax;
    r.coolant = this.coolant;
    r.coolantMax = this.coolantMax;
    r.propellant = tank.current;
    r.propellantMax = tank.max;
    r.reserve = tank.reserve ?? 0;
    r.starved = this.starved;
    r.burnRate = this._burned;
    return r;
  }
}

/** Convenience read API mirroring thermalReport(). */
export function storesReport(ship) {
  return ship?.stores ? ship.stores.report() : null;
}

/** Magazine scale by hull role. A fighter carries a fighter's worth of ammunition. */
export function storesScaleFor(classDef) {
  switch (classDef?.role) {
    case 'fighter': return 0.12;
    case 'corvette': return 0.35;
    case 'frigate': return 0.6;
    case 'destroyer': return 0.85;
    case 'station': return 1.6;
    default: return 1;
  }
}
