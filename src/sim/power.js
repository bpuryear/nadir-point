import { POWER_CHANNELS } from '../core/contracts.js';
import { EV } from '../core/events.js';

/**
 * Reactor output routing — SUPPLY AND DEMAND.
 *
 * A fixed pool the player reallocates live between shields, weapons, engines and
 * sensors. Three rules carry the whole system:
 *
 *   1. THE FIT ASKS FOR MORE THAN THE REACTOR MAKES. Every channel publishes a DEMAND
 *      in reactor units, derived from the hardware bolted to the hull. Those four
 *      numbers do not have to add up to the capacity and on a fought-out cruiser they
 *      do not: `strain` is `demand / capacity` and it goes above 1. When it does there
 *      is no allocation that feeds everything, so there is a channel you must leave
 *      dark. That is the difference between a split and a budget.
 *   2. Reallocation is NOT instant. Channels spool toward their new setting, so
 *      panic-switching mid-fight leaves you with neither the shields you gave up nor
 *      the guns you asked for. Committing early is the skill.
 *   3. Damage lowers the ceiling, not the allocation. A breached reactor means every
 *      channel gets less for the rest of the fight, and you have to decide what to
 *      stop paying for.
 *
 * RULE 3 WAS A FALSE CLAIM IN A SOURCE FILE UNTIL THIS COMMIT. `factor()` used to
 * return `actual[ch] / (1/4)` — a pure ratio of SHARES. `capacity` never entered it,
 * so `setHealthFactor()` (written by `ship.js#_refreshEfficiency` from the reactor
 * subsystem's HP) moved `get()`, which two call sites read, and moved nothing that the
 * player could feel: cadence, thrust and shield regen all go through `factor()`.
 * A reactor could be shot to 20% and the guns kept their rate of fire. `factor()` is
 * now `supply / demand` with `supply = capacity * actual[ch]`, so capacity — and
 * therefore reactor damage — multiplies straight through into every consumer.
 *
 * WHY `factor()` KEEPS ITS OLD SCALE. Every consumer reads it as a performance
 * multiplier around 1.0 (`combat.js:180`, `ship.js:953`, `ship.js:1020`,
 * `salvo.js:440`, `vfx/engines.js:228`, `ui/weapons.js:512`). Demand is therefore
 * calibrated so a LIGHT hull sits near 1.0 at an even split, exactly where the old
 * ratio put it, and the new behaviour appears as the fit grows. Nothing had to be
 * re-tuned at the far end either: over-supply is deliberately worth less than
 * under-supply costs (`DEMAND.overdriveGain`) and is capped at `DEMAND.overdriveMax`
 * 2.0, which is the exact value the old `actual/even` form produced at a 50% share.
 * So no channel can now be driven harder than it could before, and starving one bites
 * for the first time.
 *
 * This layer stays locked until the player installs their first reactor module. A new
 * player gets arcs and subsystem targeting first; handing over both layers at once is
 * how you make a good system feel like homework. Every consumer guards on
 * `power.unlocked`, so a hull with no reactor is unaffected by any of the above.
 */

/**
 * WHAT EACH CHANNEL ASKS FOR, and why these are the four drivers.
 *
 * The rule for what belongs here: a term is allowed only if the player CHOSE it at a
 * refit screen. Demand is the bill for the fit, so every coefficient multiplies
 * something the player bolted on and can take off again. Nothing here is a hidden
 * per-run drift.
 *
 *   base            hotel load. What the hull draws with nothing installed.
 *   perPowerDraw    weapons. `powerDraw` is already on every WeaponDef and until now
 *                   was spent ONLY by energy mounts, out of `stores.charge`
 *                   (`stores.js:141,152`) — a kinetic bank's declared draw was read by
 *                   nothing at all. It is now the standing bill for keeping that mount
 *                   fed and its capacitors up, for every mount, kinetic or not.
 *   perShieldPoint  shields. `refit.js:357` sets `shields.regen = capacity * 0.06`, so
 *                   a 5200-point bank regenerates 312/s. That is not free.
 *   perMount        sensors. Fire control is per barrel. This is what makes a gun-heavy
 *                   fit strain TWO channels rather than one, which is the interlock
 *                   that stops "route everything to weapons" being an answer.
 *   perBay          sensors. Launch control for a strike wing.
 *   engines         scales with `ship.massLoad` — the drives have to move whatever you
 *                   bolted on. `refit.js:352` already makes mass cost propellant; this
 *                   makes it cost power too, on the same number.
 *
 * CALIBRATION, against the real registry rather than a guess. `tools/systems.mjs`
 * prints the table; the two ends of it are:
 *
 *   light  (reactor + one broadside)          demand  73 of 146 PU   strain 0.50
 *   heavy  (reactor, shields, 2x heavy
 *           broadside, bow lance, hold)       demand 158 of 134 PU   strain 1.18
 *
 * So a new hull feels nothing and a fought-out one is 24 PU short no matter how the
 * sliders are set. The shortfall arrives as capability does, which is the only shape
 * of this mechanic that does not punish a player for being early.
 */
export const DEMAND = {
  /** Hotel load per channel, in reactor units, before anything is installed. */
  base: { shields: 8, weapons: 6, engines: 26, sensors: 14 },
  /** Weapons, per unit of a mount's declared `powerDraw`. */
  perPowerDraw: 0.55,
  /** Shields, per point of `shields.max`. */
  perShieldPoint: 0.0075,
  /** Sensors, per commandable mount (fire control). */
  perMount: 3.0,
  /** Sensors, per hangar bay (launch control). */
  perBay: 4.0,
  /** A channel is never allowed to ask for less than this, so `factor` cannot blow up. */
  floor: 1,
  /** Return on supply ABOVE demand. Under 1 it is linear; over 1 it is worth this. */
  overdriveGain: 0.45,
  /** Hard ceiling on `factor`. Exactly the old `actual/even` value at a 50% share. */
  overdriveMax: 2.0,
  /** Below this satisfaction a channel is BROWNED OUT and says so. */
  brownoutAt: 0.85,
  /** Hysteresis: it stops saying so above this. */
  brownoutClearAt: 0.93,
};

export class PowerPlant {
  /**
   * @param {Object} opts
   * @param {number} opts.baseOutput   reactor output at full health
   * @param {import('../core/events.js').EventBus} [opts.bus]
   */
  constructor({ baseOutput = 100, bus = null } = {}) {
    this.baseOutput = baseOutput;
    this.bonusOutput = 0;      // reactor uprate modules add here
    this.healthFactor = 1;     // reactor subsystem damage multiplies here
    this.bus = bus;

    /** Requested share of the pool, 0..1 each, always summing to 1. */
    this.target = {};
    /** Actual share currently delivered. Chases `target` at spoolRate. */
    this.actual = {};
    /**
     * DEMAND, in reactor units, per channel. Recomputed from the fit every step by
     * `observe()`. NOT normalised and NOT bounded by capacity: the sum is allowed to
     * exceed what the reactor makes, and that is the entire point of the system.
     */
    this.demand = {};
    /** Latched brownout state per channel, so the notification does not chatter. */
    this._brown = {};
    for (const ch of POWER_CHANNELS) {
      this.target[ch] = 1 / POWER_CHANNELS.length;
      this.actual[ch] = 1 / POWER_CHANNELS.length;
      this.demand[ch] = DEMAND.base[ch] ?? DEMAND.floor;
      this._brown[ch] = false;
    }

    /** Fraction of full scale a channel can shift per second. Tuned so a full
     *  swing takes ~3 s - long enough to punish flapping, short enough to be a
     *  decision rather than a commitment for the whole engagement. */
    this.spoolRate = 0.34;

    this.unlocked = false;
    this._presets = new Map();

    /**
     * The hull this plant is fitted to, for reading the fit. Set by `bindShip()` from
     * `ShipThermal`'s constructor — see the note there for why that call site and not
     * a nicer one. Null on a standalone plant, which then keeps the base demand table
     * and behaves exactly as an unfitted hull.
     */
    this.ship = null;

    /** Reused report object; a read API that allocates every frame is a defect. */
    this._report = {
      capacity: 0, healthFactor: 1, unlocked: false, demandTotal: 0, strain: 0,
      deficit: 0, brownouts: 0, thermalLoad: 0, radiatorMargin: 0, channels: {},
    };
    for (const ch of POWER_CHANNELS) {
      this._report.channels[ch] = {
        channel: ch, target: 0, actual: 0, supply: 0, demand: 0,
        satisfaction: 0, deficit: 0, factor: 0, brownout: false, spooling: false,
      };
    }
  }

  get capacity() {
    return (this.baseOutput + this.bonusOutput) * this.healthFactor;
  }

  /** Power units actually available to a channel right now. */
  get(channel) {
    return this.capacity * (this.actual[channel] ?? 0);
  }

  /** Power units this channel is asking for, given the fit. Never below `DEMAND.floor`. */
  demandOf(channel) {
    return Math.max(DEMAND.floor, this.demand[channel] ?? DEMAND.base[channel] ?? DEMAND.floor);
  }

  /** Total the fit is asking for. Freely allowed to exceed `capacity`. */
  get demandTotal() {
    let t = 0;
    for (const ch of POWER_CHANNELS) t += this.demandOf(ch);
    return t;
  }

  /**
   * How oversubscribed the reactor is. 1.0 means the fit asks for exactly what the
   * reactor makes; above 1.0 there is no allocation that satisfies everything and the
   * player is choosing what to starve.
   */
  get strain() {
    const c = this.capacity;
    return c > 1e-6 ? this.demandTotal / c : Infinity;
  }

  /** Reactor units the fit asks for and cannot have, at ANY allocation. 0 when slack. */
  get deficit() {
    return Math.max(0, this.demandTotal - this.capacity);
  }

  /** 0..n — supply over demand for one channel. 1.0 is "fed exactly". */
  satisfaction(channel) {
    return this.get(channel) / this.demandOf(channel);
  }

  /** True when this channel is being run below the point where it starts to show. */
  isBrownedOut(channel) {
    return this.satisfaction(channel) < DEMAND.brownoutAt;
  }

  /**
   * Performance multiplier for a channel: supply over demand, with over-supply worth
   * less than under-supply costs and capped at the old maximum.
   *
   * Below 1.0 this is linear and unforgiving, which is what makes an unmet channel a
   * thing the player feels rather than a number in a panel.
   */
  factor(channel) {
    const sat = this.satisfaction(channel);
    if (!(sat > 0)) return 0;
    if (sat <= 1) return sat;
    return Math.min(DEMAND.overdriveMax, 1 + (sat - 1) * DEMAND.overdriveGain);
  }

  // --- demand ---------------------------------------------------------------

  /**
   * Bind the hull whose fit this plant bills for.
   *
   * CALLED FROM `ShipThermal`'s constructor (`sim/heat.js`), and the reason is
   * ownership, not taste. `Ship` constructs `new PowerPlant(...)` at `ship.js:371` and
   * calls `power.update(dt)` with one argument at `ship.js:968`; neither passes the
   * hull, and `sim/ship.js` belongs to the Ship & refit stream. `ShipThermal` is
   * constructed twenty lines later at `ship.js:392` with the ship in hand, it is the
   * other half of this same interlock, and it is in this stream's write set. So the
   * bind happens there, once, and the recompute happens here every step.
   *
   * A one-line `this.power.bindShip(this)` in `Ship`'s constructor makes the call in
   * `heat.js` a no-op and can be deleted; that is filed as a request.
   */
  bindShip(ship) {
    this.ship = ship ?? null;
    if (ship) this.observe(ship);
    return this;
  }

  /**
   * Recompute demand from the fit. No allocation: it writes into `this.demand`.
   *
   * Cheap by construction — one pass over `ship.weapons`, which is at most a handful
   * of mounts — so it runs every step and can never be stale after a refit, a mount
   * being shot off or a module being uninstalled.
   */
  observe(ship = this.ship) {
    const base = DEMAND.base;
    if (!ship) {
      for (const ch of POWER_CHANNELS) this.demand[ch] = base[ch] ?? DEMAND.floor;
      return this.demand;
    }

    let weapons = base.weapons;
    let mounts = 0;
    const list = ship.weapons;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const def = m?.def;
        if (!def) continue;
        // A mount that has been shot off the hull is gone from this array; a mount that
        // is merely OFFLINE is still plumbed in and still drawing standby. Only a
        // BREACHED hardpoint stops the bill, which is why blowing a mount pad open is
        // an upgrade to your power budget and a downgrade to everything else.
        weapons += (def.powerDraw ?? 4) * DEMAND.perPowerDraw;
        mounts++;
      }
    }

    const shieldMax = ship.shields?.max ?? 0;
    const shields = base.shields + shieldMax * DEMAND.perShieldPoint;

    const massLoad = ship.massLoad ?? 1;
    const engines = base.engines * (massLoad > 0 ? massLoad : 1);

    const bays = ship.world?.hangarBays ?? 0;
    const sensors = base.sensors + mounts * DEMAND.perMount + bays * DEMAND.perBay;

    this.demand.weapons = weapons;
    this.demand.shields = shields;
    this.demand.engines = engines;
    this.demand.sensors = sensors;
    return this.demand;
  }

  /**
   * Request a share for one channel. The remainder is redistributed across the other
   * channels in proportion to what they currently ask for, so nudging one slider does
   * not silently zero another.
   */
  setChannel(channel, value) {
    if (!POWER_CHANNELS.includes(channel)) return;
    const v = Math.max(0, Math.min(1, value));
    const others = POWER_CHANNELS.filter((c) => c !== channel);
    const remaining = 1 - v;
    const otherTotal = others.reduce((s, c) => s + this.target[c], 0);

    this.target[channel] = v;
    if (otherTotal <= 1e-6) {
      for (const c of others) this.target[c] = remaining / others.length;
    } else {
      for (const c of others) this.target[c] = (this.target[c] / otherTotal) * remaining;
    }
    this.bus?.emit(EV.POWER_ROUTED, { channel, value: v, target: { ...this.target } });
  }

  /** Set every channel at once, normalised. Used by presets and by the AI. */
  setAll(map) {
    let total = 0;
    for (const ch of POWER_CHANNELS) total += Math.max(0, map[ch] ?? 0);
    if (total <= 1e-6) return;
    for (const ch of POWER_CHANNELS) this.target[ch] = Math.max(0, map[ch] ?? 0) / total;
    this.bus?.emit(EV.POWER_ROUTED, { channel: null, target: { ...this.target } });
  }

  /**
   * The allocation that feeds every channel in proportion to what it ASKS for.
   *
   * Not a preset: it is derived from the fit, so it changes when the fit does. When
   * `strain <= 1` this satisfies everything with slack left over; when `strain > 1` it
   * spreads the shortfall evenly instead of choosing a victim, which is the correct
   * default for a player who has not decided yet. It is what the UI's DEMAND ticks
   * line up with, and what `applyPreset('demand')` selects.
   */
  demandRouting(out = null) {
    const total = this.demandTotal;
    const map = out ?? {};
    for (const ch of POWER_CHANNELS) map[ch] = total > 1e-6 ? this.demandOf(ch) / total : 0.25;
    return map;
  }

  definePreset(name, map) {
    this._presets.set(name, map);
  }

  applyPreset(name) {
    if (name === 'demand') { this.setAll(this.demandRouting()); return; }
    const p = this._presets.get(name);
    if (p) this.setAll(p);
  }

  /**
   * WASTE HEAT, by channel.
   *
   * Every channel you draw on dumps heat into the same hull, and weapons dump the most.
   * This is the coupling that makes the power widget cut both ways: routing to weapons
   * buys rate of fire and immediately makes the mounts harder to keep cool, while a
   * defensive or running routing sustains fire for far longer than an assault one. See
   * sim/heat.js, which reads these two numbers and nothing else from the plant.
   */
  static CHANNEL_HEAT = { weapons: 1.0, shields: 0.6, engines: 0.5, sensors: 0.3 };

  /** 0.3..1.0 - how much of the reactor's output is being turned into heat. */
  get thermalLoad() {
    const weights = PowerPlant.CHANNEL_HEAT;
    let load = 0;
    for (const ch of POWER_CHANNELS) {
      const share = this.unlocked ? (this.actual[ch] ?? 0) : 1 / POWER_CHANNELS.length;
      load += share * (weights[ch] ?? 0.5);
    }
    return load;
  }

  /** 0.25..0.95 - radiator capacity left over. Mount cooling scales with this. */
  get radiatorMargin() {
    return Math.max(0.25, Math.min(0.95, 1.25 - this.thermalLoad));
  }

  /** Reactor subsystem damage. 0 = dead reactor, 1 = healthy. */
  setHealthFactor(f) {
    const clamped = Math.max(0, Math.min(1, f));
    if (Math.abs(clamped - this.healthFactor) < 1e-4) return;
    this.healthFactor = clamped;
    this.bus?.emit(EV.POWER_CAPACITY_CHANGED, { capacity: this.capacity, healthFactor: clamped });
  }

  update(dt) {
    // Demand first: the fit may have changed since the last step (a refit landed, a
    // mount was shot off, a shield generator was breached) and every number below is
    // read against it.
    this.observe();

    const step = this.spoolRate * dt;
    let drift = 0;
    for (const ch of POWER_CHANNELS) {
      const diff = this.target[ch] - this.actual[ch];
      if (Math.abs(diff) <= step) {
        this.actual[ch] = this.target[ch];
      } else {
        this.actual[ch] += Math.sign(diff) * step;
      }
      drift += this.actual[ch];
    }
    // Renormalise so rounding cannot leak or invent power over a long session.
    if (drift > 1e-6 && Math.abs(drift - 1) > 1e-6) {
      for (const ch of POWER_CHANNELS) this.actual[ch] /= drift;
    }

    this._announce();
  }

  /**
   * SAY IT OUT LOUD.
   *
   * A shortfall the player cannot see is a hidden nerf, not a system. The UI stream
   * owns the panel that draws it (`ui/power.js`) and a request is filed for the ticks;
   * this is the half that does not depend on that landing — the same `EV.NOTIFY` line
   * every other consequence in the game announces itself with, plus a typed bus event
   * for anything that wants to react.
   *
   * Latched with hysteresis (`DEMAND.brownoutAt` / `brownoutClearAt`), so a channel
   * spooling across the threshold cannot spam the log. Player hulls only: an NPC
   * browning out is the player's good news and does not need a line of text.
   */
  _announce() {
    if (!this.unlocked || !this.bus) return;
    const isPlayer = this.ship?.isPlayer === true;
    for (const ch of POWER_CHANNELS) {
      const sat = this.satisfaction(ch);
      const was = this._brown[ch];
      const now = was ? sat < DEMAND.brownoutClearAt : sat < DEMAND.brownoutAt;
      if (now === was) continue;
      this._brown[ch] = now;
      this.bus.emit('power:brownout', {
        ship: this.ship, channel: ch, brownout: now, satisfaction: sat,
        supply: this.get(ch), demand: this.demandOf(ch),
      });
      if (!isPlayer) continue;
      this.bus.emit(EV.NOTIFY, {
        text: now
          ? `${ch.toUpperCase()} BROWNOUT — ${Math.round(sat * 100)}% OF DEMAND`
          : `${ch.toUpperCase()} RESTORED`,
        important: now,
      });
    }
  }

  /** How many channels are currently browned out. */
  get brownoutCount() {
    let n = 0;
    for (const ch of POWER_CHANNELS) if (this._brown[ch]) n++;
    return n;
  }

  /**
   * Snapshot for the UI. ALLOCATES — it is the historical shape and `ui/power.js`
   * calls it once per frame per panel. `report()` below is the non-allocating form and
   * is what anything on a hot path should use.
   */
  snapshot() {
    const out = {
      capacity: this.capacity,
      healthFactor: this.healthFactor,
      unlocked: this.unlocked,
      thermalLoad: this.thermalLoad,
      radiatorMargin: this.radiatorMargin,
      demandTotal: this.demandTotal,
      strain: this.strain,
      deficit: this.deficit,
      brownouts: this.brownoutCount,
      channels: {},
    };
    for (const ch of POWER_CHANNELS) {
      const supply = this.get(ch);
      const demand = this.demandOf(ch);
      out.channels[ch] = {
        target: this.target[ch],
        actual: this.actual[ch],
        power: supply,
        supply,
        demand,
        /** Demand as a SHARE of capacity — where the UI puts the demand tick. */
        demandShare: this.capacity > 1e-6 ? demand / this.capacity : 0,
        satisfaction: supply / demand,
        deficit: Math.max(0, demand - supply),
        factor: this.factor(ch),
        brownout: this._brown[ch],
        spooling: Math.abs(this.target[ch] - this.actual[ch]) > 1e-3,
      };
    }
    return out;
  }

  /**
   * READ API. Cached and mutated; safe every frame, do not retain.
   *
   *   const p = powerReport(world.player);
   *   p.strain        demand / capacity. Above 1 there is no allocation that works.
   *   p.deficit       reactor units the fit cannot have, at any allocation
   *   p.channels[ch]  { supply, demand, satisfaction, deficit, factor, brownout }
   */
  report() {
    const r = this._report;
    r.capacity = this.capacity;
    r.healthFactor = this.healthFactor;
    r.unlocked = this.unlocked;
    r.demandTotal = this.demandTotal;
    r.strain = this.strain;
    r.deficit = this.deficit;
    r.brownouts = this.brownoutCount;
    r.thermalLoad = this.thermalLoad;
    r.radiatorMargin = this.radiatorMargin;
    for (const ch of POWER_CHANNELS) {
      const row = r.channels[ch];
      const supply = this.get(ch);
      const demand = this.demandOf(ch);
      row.target = this.target[ch];
      row.actual = this.actual[ch];
      row.supply = supply;
      row.demand = demand;
      row.satisfaction = supply / demand;
      row.deficit = Math.max(0, demand - supply);
      row.factor = this.factor(ch);
      row.brownout = this._brown[ch];
      row.spooling = Math.abs(this.target[ch] - this.actual[ch]) > 1e-3;
    }
    return r;
  }
}

/** Convenience read API mirroring `thermalReport()` and `storesReport()`. */
export function powerReport(ship) {
  return ship?.power ? ship.power.report() : null;
}

/** Sensible starting presets. The UI exposes these as one-key routings. */
export function installDefaultPresets(plant) {
  plant.definePreset('balanced', { shields: 0.25, weapons: 0.25, engines: 0.25, sensors: 0.25 });
  plant.definePreset('assault',  { shields: 0.20, weapons: 0.50, engines: 0.22, sensors: 0.08 });
  plant.definePreset('run',      { shields: 0.30, weapons: 0.05, engines: 0.55, sensors: 0.10 });
  plant.definePreset('turtle',   { shields: 0.58, weapons: 0.18, engines: 0.14, sensors: 0.10 });
  plant.definePreset('scan',     { shields: 0.22, weapons: 0.12, engines: 0.18, sensors: 0.48 });
  return plant;
}
