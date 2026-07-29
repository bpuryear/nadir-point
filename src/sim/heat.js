/**
 * HEAT, PER MOUNT.
 *
 * The reference build shows `STATUS NOMINAL` flipping to `STATUS OVERHEATED` with an
 * `EXT 87.8 / 94.4` figure and a large bar (reference-ui-language.md §5, §8). That is
 * the shape this implements: a per-mount thermal load, a ship-level radiator budget,
 * and a status word that changes while you watch it.
 *
 * The decision it creates is the one the game was missing: "I can bring four mounts to
 * bear - should I fire all four?" Sustained fire has had no price at all until now.
 * Turning to open a broadside is already a manoeuvring problem; heat makes holding the
 * broadside a second, different problem.
 *
 * THE POWER INTERLOCK IS THE POINT. Routing power to weapons raises rate of fire (the
 * existing behaviour) AND raises heat per shot AND cuts the radiator budget, because
 * every channel you draw on dumps waste heat into the same hull. So `assault` routing
 * burns its mounts out; `run`/`turtle` routing sustains. The power widget already
 * existed and had one meaningful axis; this gives it a second one that pulls the
 * opposite way.
 */

import { coolingMul } from './condition.js';

export const THERMAL = {
  /** Above this a mount's dispersion widens and its fire solution degrades. */
  softCap: 0.70,
  /** At 1.0 the mount trips offline. */
  tripAt: 1.0,
  /** It will not come back until it has cooled this far - hysteresis, not a flicker. */
  rearmAt: 0.45,
  /** Seconds offline after a trip, before the rearm threshold is even considered. */
  spinDown: 4.5,
  /** Fraction of thermal capacity a mount sheds per second at a nominal radiator. */
  baseCool: 0.085,
  /** Structure damage to the hardpoint a tripped mount sits on. Trips cost hull. */
  tripStructureDamage: 16,
  /** Condition a mount loses each time it is cooked. Heat feeds back into salvage. */
  tripConditionLoss: 0.02,
  /** Fraction of mount heat a coolant purge removes. */
  purgeFraction: 0.55,

  /** Displayed exterior temperature, matching the reference readout's scale. */
  extIdle: 41.0,
  extMax: 94.4,

  /** Ship status word thresholds, on peak mount heat. */
  elevatedAt: 0.50,
  overheatedAt: 0.85,
};

/**
 * Heat produced per shot, by weapon archetype, as a fraction of a mount's capacity.
 *
 * Tuned so a cannon bank can fire indefinitely at balanced power and cooks itself in
 * about four bursts at assault power, and so a beam - which has no ammunition cost at
 * all - pays for that with the worst thermal load in the game. That is the trade the
 * two-currency stores model needs in order to be a decision rather than a preference.
 */
const HEAT_PER_SHOT = {
  cannon: 0.030,
  rail: 0.095,
  beam: 0.055,
  lance: 0.075,
  mining: 0.030,
  flak: 0.018,
  pd: 0.005,
  missile: 0.004,
};

/**
 * WHAT A COMMITTED BROADSIDE COSTS THERMALLY.
 *
 * These live here rather than in `sim/salvo.js` because `ShipThermal` is the only thing
 * that reads them. Putting them in the salvo controller would mean `heat.js` importing
 * `salvo.js`, and `salvo.js` already imports `condition.js` which `heat.js` imports too;
 * this tree has just finished paying for one invisible import cycle (see the header of
 * `core/ammo.js`) and does not need a second.
 *
 * MEASURED, so that nobody has to take the paragraph above on trust: `sim/salvo.js`
 * imports NOTHING from this file. `heatMul` is applied inside `onShot` below, which the
 * controller reaches through `combat.js#_fire`, and the surcharge window is opened
 * through `beginSalvoSurcharge()`. Both are behaviour, not constants, so the controller
 * never needs the table and there is no edge between the two files in either direction.
 * `tools/ripple.mjs` imports the table directly to print it.
 *
 * The arithmetic, against the real constants in this file and the real Heavy Broadside
 * (`broadside.js` port_broadside_battery, damage 340, cannon):
 *
 *   perShot   = HEAT_PER_SHOT.cannon 0.030 x clamp(340/45, 0.4, 2.2) = 0.066
 *   balanced  = 0.066 x (0.75 + 0.35 x 1.10) x 1.15 = 0.0855/shot = 0.342 for four guns
 *               shed over the 5.0 s cooldown at 0.085 x (0.4 + 0.65 x 0.82) = 0.078/s
 *               -> 0.39 shed against 0.34 added. Sustainable.
 *   assault   = weapons factor 2.0 -> 0.110/shot = 0.440 per salvo against a 2.5 s
 *               window -> net positive. The fourth broadside cooks the battery.
 *
 * That gap IS the alpha-versus-sustain decision, and it falls out of two numbers
 * because `update()` below already couples radiator budget to reactor load.
 */
export const SALVO_THERMAL = {
  /** A committed salvo runs the guns harder than trickle fire. Heat per shot x this. */
  heatMul: 1.15,
  /** Fraction of the radiator budget a salvo eats while the surcharge runs. */
  radiatorSurcharge: 0.18,
  /** Seconds the surcharge lasts, from the moment the ripple is armed. */
  surchargeTime: 3.0,
};

/** Thermal weight of each power channel. Actual shares sum to 1, so load is 0.3..1.0. */
const CHANNEL_HEAT = { weapons: 1.0, shields: 0.6, engines: 0.5, sensors: 0.3 };

/** How much of a mount's capacity one shot costs. Data can override per weapon. */
export function heatPerShot(def) {
  if (typeof def.heatPerShot === 'number') return def.heatPerShot;
  const base = HEAT_PER_SHOT[def.type] ?? 0.03;
  const scale = Math.max(0.4, Math.min(2.2, (def.damage ?? 40) / 45));
  return base * scale;
}

/**
 * Per-mount thermal state. Lives on the WeaponMount because every consequence of heat
 * is a mount-level consequence: this mount stops firing, this mount scatters, this
 * mount's hardpoint takes the structural damage.
 */
export class MountThermal {
  constructor(def) {
    this.perShot = heatPerShot(def);
    this.coolRate = def.coolRate ?? THERMAL.baseCool;
    this.heat = 0;
    this.rate = 0;            // heat/second, signed, smoothed - the HUD's `0.12/s`
    this.tripped = false;
    this.tripTimer = 0;
    this.trips = 0;           // how many times this mount has been cooked this fight
    this._prev = 0;
  }

  get overSoftCap() {
    return this.heat > THERMAL.softCap;
  }

  /** 0 below the soft cap, rising to 1 at a trip. Drives spread and accuracy loss. */
  get stress() {
    if (this.heat <= THERMAL.softCap) return 0;
    return Math.min(1, (this.heat - THERMAL.softCap) / (THERMAL.tripAt - THERMAL.softCap));
  }
}

/**
 * Ship-level thermal management.
 *
 * The radiator budget is what couples heat to power routing. `load` is how much of the
 * reactor's output is being drawn and therefore dumped as waste heat; `radiate` is what
 * is left over for the radiators. Both are derived from numbers the power plant already
 * publishes, so there is no new hidden state anywhere.
 */
export class ShipThermal {
  constructor(ship) {
    this.ship = ship;
    this.load = 0.6;
    this.radiate = 0.65;
    this.peak = 0;
    this.mean = 0;
    this.state = 'NOMINAL';
    this.ext = THERMAL.extIdle;
    this.rate = 0;
    this._prevPeak = 0;
    /**
     * Seconds of salvo radiator surcharge left. Written by `sim/salvo.js` through
     * `beginSalvoSurcharge()` when a ripple is armed, decremented here. This is the
     * only piece of state the ripple adds anywhere, it lives in this stream's own
     * object rather than on `Ship`, and it decays to zero on its own — a controller
     * torn down mid-salvo by a refit cannot leave the radiators permanently derated.
     */
    this.surchargeTimer = 0;
    /**
     * Reused report object. A read API that allocates every frame is a defect.
     * `softCap` and `surcharge` are declared HERE, not first assigned in
     * `thermalReport`: a property added to an object after construction forces a hidden
     * class transition on the first read, which is exactly the cost this object exists
     * to avoid.
     */
    this._report = { state: 'NOMINAL', ext: 0, extMax: THERMAL.extMax, load: 0, radiate: 0,
      peak: 0, mean: 0, rate: 0, tripped: 0, coolant: 0, coolantMax: 0,
      softCap: THERMAL.softCap, surcharge: 0, mounts: [] };
  }

  /**
   * Waste-heat load from the reactor, 0.3..1.0.
   *
   * The power plant publishes this itself (power.js#thermalLoad) so the routing widget
   * and the thermal readout can never disagree about what the reactor is doing. The
   * local fallback exists only so this system does not throw on a hull without a plant.
   */
  computeLoad(power) {
    if (!power) return 0.6;
    if (typeof power.thermalLoad === 'number') return power.thermalLoad;
    const share = power.unlocked ? power.actual : null;
    let load = 0;
    for (const ch of Object.keys(CHANNEL_HEAT)) {
      const s = share ? (share[ch] ?? 0) : 0.25;
      load += s * CHANNEL_HEAT[ch];
    }
    return load;
  }

  update(dt) {
    const ship = this.ship;
    this.load = this.computeLoad(ship.power);

    // A damaged reactor cannot run its own cooling loops properly, so a hurt ship also
    // runs hot. One line, and it makes the reactor a thermal target as well as a power one.
    const plantHealth = 0.7 + 0.3 * (ship.kindHealth ? ship.kindHealth('reactor') : 1);
    this.radiate = Math.max(0.25, Math.min(0.95, 1.25 - this.load)) * plantHealth;

    // A committed broadside dumps its waste heat faster than the loops can carry it
    // away, so for a few seconds afterwards EVERY mount cools more slowly - including
    // the ones that did not fire. That is what makes a second salvo a decision rather
    // than a repeat.
    if (this.surchargeTimer > 0) {
      this.surchargeTimer -= dt;
      this.radiate *= 1 - SALVO_THERMAL.radiatorSurcharge;
      if (this.surchargeTimer < 0) this.surchargeTimer = 0;
    }

    let peak = 0;
    let sum = 0;
    let n = 0;
    let tripped = 0;

    for (const mount of ship.weapons) {
      const th = mount.thermal;
      if (!th) continue;
      n++;

      // Shedding: radiator budget x the mount's own cooling hardware x its condition.
      // A dead `cooling` sub-part is the difference between a gun you can hold down
      // and one you have to feather.
      const partMul = mount.parts ? mount.parts.coolingMul : 1;
      const cool = th.coolRate * (0.4 + this.radiate) * partMul * coolingMul(mount.condition ?? 1);
      if (th.heat > 0) {
        th.heat -= cool * dt;
        if (th.heat < 0) th.heat = 0;
      }

      if (th.tripped) {
        tripped++;
        th.tripTimer -= dt;
        if (th.tripTimer <= 0 && th.heat <= THERMAL.rearmAt) {
          th.tripped = false;
          mount.online = mount.offlineReason === 'heat' ? true : mount.online;
          if (mount.offlineReason === 'heat') mount.offlineReason = null;
        }
      }

      // Smoothed signed rate, in heat units per second, for the HUD's rate chip.
      const delta = (th.heat - th._prev) / Math.max(1e-6, dt);
      th.rate += (delta - th.rate) * Math.min(1, dt * 6);
      th._prev = th.heat;

      if (th.heat > peak) peak = th.heat;
      sum += th.heat;
    }

    this.peak = peak;
    this.mean = n > 0 ? sum / n : 0;
    this.trippedCount = tripped;

    const rawRate = (peak - this._prevPeak) / Math.max(1e-6, dt);
    this.rate += (rawRate - this.rate) * Math.min(1, dt * 6);
    this._prevPeak = peak;

    this.ext = THERMAL.extIdle + (THERMAL.extMax - THERMAL.extIdle) * Math.min(1, peak);
    this.state = tripped > 0 || peak >= THERMAL.overheatedAt
      ? 'OVERHEATED'
      : peak >= THERMAL.elevatedAt ? 'ELEVATED' : 'NOMINAL';
  }

  /**
   * Add heat from one shot and trip the mount if it cooks.
   * Called from the fire site in combat.js, once per shot, no allocation.
   *
   * @param {Object} mount
   * @param {number} [powerFactorWeapons]
   * @param {boolean} [salvo]  true when the shot is part of a committed ripple, which
   *                           costs `SALVO_THERMAL.heatMul` more per shot than the same
   *                           gun firing itself on AUTO.
   */
  onShot(mount, powerFactorWeapons = 1, salvo = false) {
    const th = mount.thermal;
    if (!th) return;
    // More power through the gun is more shots AND more heat per shot. Both directions.
    th.heat += th.perShot * (0.75 + 0.35 * powerFactorWeapons) * (salvo ? SALVO_THERMAL.heatMul : 1);
    if (th.heat >= THERMAL.tripAt && !th.tripped) this.trip(mount);
  }

  /**
   * Start (or restart) the radiator surcharge. Called once per armed ripple.
   * Idempotent by construction: re-arming refreshes the window, it does not stack.
   */
  beginSalvoSurcharge() {
    this.surchargeTimer = SALVO_THERMAL.surchargeTime;
  }

  /** Cook a mount. Reuses the existing `online` offline path, so the HUD already shows it. */
  trip(mount) {
    const th = mount.thermal;
    th.heat = Math.max(th.heat, THERMAL.tripAt);
    th.tripped = true;
    th.trips++;
    th.tripTimer = THERMAL.spinDown;
    mount.online = false;
    mount.offlineReason = 'heat';
    mount.burstRemaining = 0;

    // A cooked mount damages what it is bolted to, and wears itself. Heat is not free
    // even after it has cooled: it feeds condition, which feeds salvage value.
    if (mount.condition !== undefined) {
      mount.condition = Math.max(0, mount.condition - THERMAL.tripConditionLoss);
    }
    const ship = this.ship;
    const hp = mount.hardpoint ? ship.hardpoints?.get(mount.hardpoint) : null;
    if (hp && !hp.breached) hp.structureHP = Math.max(0, hp.structureHP - THERMAL.tripStructureDamage);
    ship.bus?.emit('weapon:overheated', { ship, mount, hardpoint: mount.hardpoint ?? null });
  }

  /**
   * Dump coolant. The thing the player presses.
   *
   * Costs a charge from stores, which is a real, finite, salvageable resource, so the
   * decision is "do I spend a purge to hold this broadside for six more seconds or do
   * I break off". Returns false when there is nothing to spend.
   */
  purge() {
    const stores = this.ship.stores;
    if (!stores || stores.coolant < 1) return false;
    stores.coolant -= 1;
    for (const mount of this.ship.weapons) {
      const th = mount.thermal;
      if (!th) continue;
      th.heat *= 1 - THERMAL.purgeFraction;
      if (th.tripped && th.heat <= THERMAL.rearmAt) {
        th.tripped = false;
        th.tripTimer = 0;
        if (mount.offlineReason === 'heat') { mount.online = true; mount.offlineReason = null; }
      }
    }
    this.ship.bus?.emit('thermal:purge', { ship: this.ship, remaining: stores.coolant });
    return true;
  }
}

/**
 * READ API for the HUD.
 *
 * Returns a cached, mutated object - safe to call every frame. Do not retain the
 * arrays, they are reused. Mirrors the reference readout exactly: a status word, an
 * EXT figure over its ceiling, a bar value, a rate, and the per-mount detail the
 * weapon strip needs.
 *
 *   const t = thermalReport(world.player);
 *   t.state          'NOMINAL' | 'ELEVATED' | 'OVERHEATED'
 *   t.ext / t.extMax  41.0 .. 94.4
 *   t.peak            0..1, the big bar
 *   t.rate            heat units/sec, signed; multiply by 100 for the `%/s` chip
 *   t.mounts[i]       { hardpoint, label, type, heat, rate, tripped, tripRemaining,
 *                       stress, online, offlineReason }
 */
export function thermalReport(ship) {
  const t = ship?.thermal;
  if (!t) return null;
  const r = t._report;
  r.state = t.state;
  r.ext = t.ext;
  r.extMax = THERMAL.extMax;
  r.load = t.load;
  r.radiate = t.radiate;
  r.peak = t.peak;
  r.mean = t.mean;
  r.rate = t.rate;
  r.tripped = t.trippedCount ?? 0;
  r.coolant = ship.stores?.coolant ?? 0;
  r.coolantMax = ship.stores?.coolantMax ?? 0;
  r.softCap = THERMAL.softCap;
  /** Seconds of salvo radiator surcharge left; 0 when none. See SALVO_THERMAL. */
  r.surcharge = t.surchargeTimer;

  const mounts = r.mounts;
  mounts.length = 0;
  for (const m of ship.weapons) {
    const th = m.thermal;
    if (!th) continue;
    let slot = m._thermalRow;
    if (!slot) slot = m._thermalRow = {};
    slot.hardpoint = m.hardpoint ?? null;
    slot.label = m.def.name ?? m.def.id;
    slot.type = m.def.type;
    slot.heat = th.heat;
    slot.rate = th.rate;
    slot.tripped = th.tripped;
    slot.tripRemaining = Math.max(0, th.tripTimer);
    slot.stress = th.stress;
    slot.online = m.online;
    slot.offlineReason = m.offlineReason ?? null;
    mounts.push(slot);
  }
  return r;
}
