import { POWER_CHANNELS } from '../core/contracts.js';
import { EV } from '../core/events.js';

/**
 * Reactor output routing.
 *
 * A fixed pool the player reallocates live between shields, weapons, engines and
 * sensors. Two rules carry the whole system:
 *
 *   1. Reallocation is NOT instant. Channels spool toward their new setting, so
 *      panic-switching mid-fight leaves you with neither the shields you gave up nor
 *      the guns you asked for. Committing early is the skill.
 *   2. Damage lowers the ceiling, not the allocation. A breached reactor means every
 *      channel gets less for the rest of the fight, and you have to decide what to
 *      stop paying for.
 *
 * This layer stays locked until the player installs their first reactor module. A new
 * player gets arcs and subsystem targeting first; handing over both layers at once is
 * how you make a good system feel like homework.
 */
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
    for (const ch of POWER_CHANNELS) {
      this.target[ch] = 1 / POWER_CHANNELS.length;
      this.actual[ch] = 1 / POWER_CHANNELS.length;
    }

    /** Fraction of full scale a channel can shift per second. Tuned so a full
     *  swing takes ~3 s - long enough to punish flapping, short enough to be a
     *  decision rather than a commitment for the whole engagement. */
    this.spoolRate = 0.34;

    this.unlocked = false;
    this._presets = new Map();
  }

  get capacity() {
    return (this.baseOutput + this.bonusOutput) * this.healthFactor;
  }

  /** Power units actually available to a channel right now. */
  get(channel) {
    return this.capacity * (this.actual[channel] ?? 0);
  }

  /** 0..1 how well supplied a channel is versus an even split. */
  factor(channel) {
    const even = 1 / POWER_CHANNELS.length;
    return (this.actual[channel] ?? 0) / even;
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

  definePreset(name, map) {
    this._presets.set(name, map);
  }

  applyPreset(name) {
    const p = this._presets.get(name);
    if (p) this.setAll(p);
  }

  /** Reactor subsystem damage. 0 = dead reactor, 1 = healthy. */
  setHealthFactor(f) {
    const clamped = Math.max(0, Math.min(1, f));
    if (Math.abs(clamped - this.healthFactor) < 1e-4) return;
    this.healthFactor = clamped;
    this.bus?.emit(EV.POWER_CAPACITY_CHANGED, { capacity: this.capacity, healthFactor: clamped });
  }

  update(dt) {
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
  }

  /** Snapshot for the UI. */
  snapshot() {
    const out = { capacity: this.capacity, healthFactor: this.healthFactor, unlocked: this.unlocked, channels: {} };
    for (const ch of POWER_CHANNELS) {
      out.channels[ch] = {
        target: this.target[ch],
        actual: this.actual[ch],
        power: this.get(ch),
        spooling: Math.abs(this.target[ch] - this.actual[ch]) > 1e-3,
      };
    }
    return out;
  }
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
