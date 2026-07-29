import { getModule } from '../../core/contracts.js';
import { MEV } from './events.js';

/**
 * THE MATERIAL CHAIN — two tiers, and two tiers only.
 *
 *      wreck section  ->  SCRAP (3 grades)  ->  REFINED (4 pools)  ->  repairs,
 *                                                                      rebuilds,
 *                                                                      patterns,
 *                                                                      perks, items
 *
 * `beta-decay-systems.md` §6.4 is explicit about why this is not four tiers: Beta
 * Decay's chain is deep because it feeds a factory and a securities exchange, and we
 * have neither and the brief forbids both. Two tiers is the honest depth for a chain
 * whose only consumer is "putting the ship back together".
 *
 * WHAT MAKES THIS A SYSTEM RATHER THAN THREE COUNTERS
 *
 *   1. Scrap is GRADED BY SOURCE. Hull plating, machinery and cores refine into
 *      different things, so *which section you cut* is a materials decision and not
 *      just a quantity one. This is the reference's "Common Ore / Heavy Metals /
 *      Reinforced" idea at the depth we can actually pay for.
 *   2. Scrap is BULKY. Refining compresses it roughly six-to-one by volume, so the
 *      refinery is the thing that lets you keep cutting - and it is lossy, so the
 *      compression costs you material.
 *   3. Refining is a QUEUE. Put scrap in, refined comes out, first in first out, no
 *      minigame, no placement puzzle, no timing window. Simulate the noun, abstract
 *      the verb.
 *   4. Everything downstream draws on the SAME four pools. Repairing a breached mount,
 *      rebuilding a module from a pattern, fabricating a decoy and buying a hull perk
 *      are competing claims. That competition is the whole point of scarcity.
 *
 * EXPLICIT NON-GOAL: there is no market, no price and nothing to sell to. Materials
 * are a sink. `salvage.js` already committed to this and it is correct.
 */

/** Tier 0. What a cut section actually gives you. Bulky, useless until refined. */
export const SCRAP_GRADES = ['plate', 'machine', 'core'];

/** Tier 1. What repairs, rebuilds, perks and items are paid for in. */
export const REFINED_POOLS = ['alloy', 'composite', 'electronics', 'exotic'];

/**
 * Cubic metres per unit, by material. Scrap is torn plate and shattered housings and
 * it stows badly; refined stock is billets and spools and it stows well.
 */
export const MATERIAL_VOLUME = {
  plate: 0.40,
  machine: 0.34,
  core: 0.26,
  alloy: 0.060,
  composite: 0.070,
  electronics: 0.040,
  exotic: 0.030,
};

/**
 * Refining yields, in refined units per unit of scrap.
 *
 * Every row sums to less than 1: refining is lossy, and that loss is the price of the
 * volume compression. Exotic only ever comes out of cores, which is what makes an
 * intact reactor or sensor section the thing you go out of your way for.
 */
export const REFINE_YIELD = {
  plate: { alloy: 0.55, composite: 0.18 },
  machine: { alloy: 0.30, composite: 0.12, electronics: 0.14 },
  core: { alloy: 0.12, composite: 0.05, electronics: 0.34, exotic: 0.015 },
};

/** Which grade of scrap a wreck section of a given subsystem kind tears down into. */
export function gradeForKind(kind) {
  switch (kind) {
    case 'weapon':
    case 'engine':
      return 'machine';
    case 'reactor':
    case 'sensor':
    case 'hangar':
      return 'core';
    default:
      return 'plate';
  }
}

/**
 * What grade of scrap a MODULE tears down into. One rule, two callers.
 *
 * This used to exist twice. `gradeForSection` below had this branch inline, and
 * `breakDownItem` (index.js) carried a second copy that omitted `grants.thrust` and
 * `grants.jumpRange` — so an engine module cut off a wreck was `machine` scrap and the
 * same module broken down in the hold was `plate`. Two grades for one object is exactly
 * the divergence the audit now fails on, so there is one function and both call it.
 */
export function gradeForModule(def) {
  if (!def) return 'plate';
  const g = def.grants ?? {};
  if (g.powerOutput || g.sensorRange || g.hangarBays) return 'core';
  if (def.weapon || g.thrust || g.jumpRange) return 'machine';
  return 'plate';
}

/**
 * What grade of scrap a wreck section tears down into.
 *
 * `WreckSection` now STAMPS `grade` in its constructor (salvage.js), so the first
 * branch is the normal path rather than a future upgrade. The derivation below is kept
 * because it is what makes the stamp checkable — the two must agree, and a section
 * built by some other path still gets a correct grade instead of silently falling into
 * one drop table. `items.js#rollDrop` read `section.grade` directly for exactly as long
 * as nothing wrote it, and two of the five devices could not drop as a result.
 *
 * The order matters: the module it yields is the strongest signal, then whether it was
 * a magazine, then the label the hull gave it.
 */
export function gradeForSection(section) {
  if (section?.grade && SCRAP_GRADES.includes(section.grade)) return section.grade;

  const def = section?.moduleId ? getModule(section.moduleId) : null;
  if (def) return gradeForModule(def);
  if (section?.ammo) return 'machine';

  const label = String(section?.label ?? '').toLowerCase();
  if (label.includes('reactor') || label.includes('sensor') || label.includes('core')
    || label.includes('mast') || label.includes('hangar') || label.includes('bay')
    || label.includes('array') || label.includes('radar')) return 'core';
  if (label.includes('engine') || label.includes('drive') || label.includes('thrust')
    || label.includes('turret') || label.includes('cannon') || label.includes('battery')
    || label.includes('launcher') || label.includes('mount') || label.includes('magazine')) return 'machine';
  return 'plate';
}

/** Codex-facing descriptions. One sentence each, same card, learn it once. */
export const MATERIAL_DEFS = [
  {
    id: 'plate', tier: 0, name: 'Plate Scrap',
    description: 'Torn hull plating and structural frame, cut into stowable lengths.',
    source: 'Hull plating, armour belts and any section with no machinery in it.',
    refinesTo: REFINE_YIELD.plate,
  },
  {
    id: 'machine', tier: 0, name: 'Machine Scrap',
    description: 'Broken drives, mounts and feed gear, still full of usable alloy.',
    source: 'Weapon and engine sections.',
    refinesTo: REFINE_YIELD.machine,
  },
  {
    id: 'core', tier: 0, name: 'Core Scrap',
    description: 'Reactor shielding, sensor stacks and control cores - the only source of exotics.',
    source: 'Reactor, sensor and hangar sections.',
    refinesTo: REFINE_YIELD.core,
  },
  {
    id: 'alloy', tier: 1, name: 'Alloy Stock',
    description: 'Structural billet. Everything that holds the ship together is paid for in this.',
    source: 'Refined from every grade of scrap.',
    consumedBy: 'Hull repair, hardpoint structure repair, pattern rebuilds, perks.',
  },
  {
    id: 'composite', tier: 1, name: 'Composite Weave',
    description: 'Ablative and thermal laminate, spooled.',
    source: 'Refined mostly from plate scrap.',
    consumedBy: 'Hardpoint repair, pattern rebuilds, item fabrication.',
  },
  {
    id: 'electronics', tier: 1, name: 'Electronics',
    description: 'Recovered control boards, emitters and sensor elements.',
    source: 'Refined from machine and core scrap.',
    consumedBy: 'Pattern rebuilds of weapons and sensors, item fabrication, perks.',
  },
  {
    id: 'exotic', tier: 1, name: 'Exotic Lattice',
    description: 'Pre-collapse lattice recovered intact from a core. Nothing else makes it.',
    // This card is player-facing and it was wrong in four places. It said "Nothing else
    // may spend it" while `patterns.js:50` charged 1 for every tier-3 rebuild,
    // `refit.js:411` charged 1 to rebuild a destroyed traverse or feed part, and
    // `condition.js:148` charged 1 to repair anything below 0.25 — and it omitted that
    // `condition.js:167` MINTED one out of scrapping a clean part, which is the printer
    // that has since been closed. `economyAudit.mjs` section 5 now fails if a file
    // spends exotic without appearing here.
    source: 'Refined from core scrap only, at roughly one part in seventy. Nothing mints it.',
    consumedBy: 'Permanent hull perks, tier-3 pattern rebuilds, replacing a destroyed '
      + 'traverse or feed part, and repair of anything below quarter condition.',
  },
];

/**
 * The ledger and the refinery.
 *
 * Refined pools live on `world.materials` so that `refit.js`, which already reads
 * `world.materials.alloy`, keeps working untouched. Scrap lives here, because scrap is
 * NOT a currency - it is inventory, it takes up room, and it can be thrown overboard.
 */
export class EconomySystem {
  constructor(world, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('economy');
    this.name = 'economy';
    this.order = 85;

    /** Tier 0 stock, by grade. */
    this.scrap = { plate: 0, machine: 0, core: 0 };

    /**
     * The refinery queue. FIFO, one job at a time, no interaction beyond putting
     * something into it. `{grade, remaining}` entries; the head is being worked.
     */
    this.queue = [];

    /** Scrap units processed per second at base. Perks and a field dock raise it. */
    this.baseRate = opts.rate ?? 7;
    this.rateMultiplier = 1;
    /** Additive fraction on every yield. A perk buys this; it never exceeds ~+0.15. */
    this.yieldBonus = 0;

    /** Fractional output carried between steps so a slow trickle is not rounded away. */
    this._pending = { alloy: 0, composite: 0, electronics: 0, exotic: 0 };

    /** Running totals, for the codex, the objectives layer and the report. */
    this.lifetime = { scrap: 0, refined: 0, vented: 0, spent: 0 };

    const m = world.materials;
    if (m.electronics === undefined) m.electronics = 0;
    if (m.exotic === undefined) m.exotic = 0;
  }

  get rate() { return this.baseRate * this.rateMultiplier; }

  get materials() { return this.world.materials; }

  /** Scrap units awaiting refining, including whatever is in the queue. */
  get scrapTotal() {
    let n = this.scrap.plate + this.scrap.machine + this.scrap.core;
    for (const job of this.queue) n += job.remaining;
    return n;
  }

  /** Cubic metres of tier-0 and tier-1 stock currently aboard. */
  volumeM3() {
    let v = 0;
    for (const g of SCRAP_GRADES) v += this.scrap[g] * MATERIAL_VOLUME[g];
    for (const job of this.queue) v += job.remaining * MATERIAL_VOLUME[job.grade];
    for (const p of REFINED_POOLS) v += (this.materials[p] ?? 0) * MATERIAL_VOLUME[p];
    return v;
  }

  // --- tier 0 ---------------------------------------------------------------

  /**
   * Put scrap in the hold. Returns how much actually fitted: a full hold VENTS the
   * overflow, which is the moment volume stops being a number and becomes a decision.
   */
  addScrap(grade, units, source = null) {
    if (!(units > 0)) return 0;
    const g = SCRAP_GRADES.includes(grade) ? grade : 'plate';
    const hold = this.world.systems.cargo;
    let accepted = units;
    if (hold) {
      const room = Math.max(0, hold.freeM3());
      accepted = Math.min(units, room / MATERIAL_VOLUME[g]);
    }
    accepted = Math.floor(accepted);
    const vented = units - accepted;
    if (accepted > 0) {
      this.scrap[g] += accepted;
      this.lifetime.scrap += accepted;
      this.bus?.emit(MEV.SCRAP_ACQUIRED, { grade: g, units: accepted, source });
    }
    if (vented > 0.5) {
      this.lifetime.vented += vented;
      this.bus?.emit(MEV.SCRAP_VENTED, { grade: g, units: Math.round(vented), source });
    }
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'scrap' });
    return accepted;
  }

  /** Throw scrap overboard to free volume immediately. The panic valve. */
  ventScrap(grade, units = Infinity) {
    const g = SCRAP_GRADES.includes(grade) ? grade : 'plate';
    const n = Math.min(this.scrap[g], units);
    if (n <= 0) return 0;
    this.scrap[g] -= n;
    this.lifetime.vented += n;
    this.bus?.emit(MEV.SCRAP_VENTED, { grade: g, units: n, deliberate: true });
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'vent' });
    return n;
  }

  /** Queue scrap for refining. FIFO: this joins the back of the line. */
  enqueue(grade, units = Infinity) {
    const g = SCRAP_GRADES.includes(grade) ? grade : 'plate';
    const n = Math.min(this.scrap[g], units);
    if (n <= 0) return 0;
    this.scrap[g] -= n;
    const back = this.queue[this.queue.length - 1];
    if (back && back.grade === g) back.remaining += n;
    else this.queue.push({ grade: g, remaining: n });
    return n;
  }

  /** Queue everything. The button a player presses when the cutting is done. */
  enqueueAll() {
    let n = 0;
    for (const g of SCRAP_GRADES) n += this.enqueue(g);
    return n;
  }

  // --- tier 1 ---------------------------------------------------------------

  /** Can the four pools cover this cost right now? */
  canAfford(cost) {
    if (!cost) return true;
    for (const k of REFINED_POOLS) {
      if ((cost[k] ?? 0) > (this.materials[k] ?? 0)) return false;
    }
    return true;
  }

  /** What is missing, as a cost object. The refit screen shows this in red. */
  shortfall(cost) {
    const out = {};
    for (const k of REFINED_POOLS) {
      const need = (cost?.[k] ?? 0) - (this.materials[k] ?? 0);
      if (need > 0) out[k] = Math.ceil(need);
    }
    return out;
  }

  /** Spend. All or nothing - a half-paid repair is a bug, not a mechanic. */
  spend(cost, reason = '') {
    if (!this.canAfford(cost)) {
      return { ok: false, reason: 'insufficient materials', shortfall: this.shortfall(cost) };
    }
    let total = 0;
    for (const k of REFINED_POOLS) {
      const n = cost?.[k] ?? 0;
      if (n <= 0) continue;
      this.materials[k] -= n;
      total += n;
    }
    this.lifetime.spent += total;
    this.bus?.emit(MEV.MATERIALS_SPENT, { cost, reason, total });
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'spend' });
    return { ok: true, cost };
  }

  /** Give materials back. Used by objective payouts and by cancelling a job. */
  credit(amounts, reason = '') {
    for (const k of REFINED_POOLS) {
      const n = amounts?.[k] ?? 0;
      if (n > 0) this.materials[k] = (this.materials[k] ?? 0) + n;
    }
    this.bus?.emit(MEV.CARGO_CHANGED, { reason });
    return amounts;
  }

  // --- the queue ------------------------------------------------------------

  fixedUpdate(dt) {
    if (this.queue.length === 0) return;
    let budget = this.rate * dt;
    // No allocation in here: the head is mutated in place and shifted when spent.
    while (budget > 0 && this.queue.length > 0) {
      const job = this.queue[0];
      const take = Math.min(job.remaining, budget);
      job.remaining -= take;
      budget -= take;
      this._yield(job.grade, take);
      if (job.remaining <= 1e-6) this.queue.shift();
    }
    this._flushPending();
  }

  _yield(grade, units) {
    const table = REFINE_YIELD[grade];
    const bonus = 1 + this.yieldBonus;
    for (const k in table) this._pending[k] += table[k] * units * bonus;
  }

  _flushPending() {
    let emitted = null;
    for (const k of REFINED_POOLS) {
      const whole = Math.floor(this._pending[k]);
      if (whole <= 0) continue;
      this._pending[k] -= whole;
      this.materials[k] = (this.materials[k] ?? 0) + whole;
      this.lifetime.refined += whole;
      (emitted ??= {})[k] = whole;
    }
    if (emitted) {
      this.bus?.emit(MEV.REFINED, emitted);
      this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'refined' });
    }
  }

  /** Run the queue to completion without waiting. Used by the harness and by tests. */
  refineAll() {
    while (this.queue.length > 0) this.fixedUpdate(1);
    return { ...this.materials };
  }

  // --- read API -------------------------------------------------------------

  /**
   * Everything a materials panel needs, in one object.
   * @returns {{scrap:Object, refined:Object, queue:Array, rate:number,
   *            etaSeconds:number, volumeM3:number, lifetime:Object}}
   */
  describe() {
    let queued = 0;
    for (const job of this.queue) queued += job.remaining;
    return {
      scrap: { ...this.scrap },
      refined: {
        alloy: this.materials.alloy ?? 0,
        composite: this.materials.composite ?? 0,
        electronics: this.materials.electronics ?? 0,
        exotic: this.materials.exotic ?? 0,
      },
      queue: this.queue.map((j) => ({ grade: j.grade, remaining: Math.round(j.remaining) })),
      queuedUnits: Math.round(queued),
      rate: this.rate,
      etaSeconds: this.rate > 0 ? queued / this.rate : Infinity,
      volumeM3: this.volumeM3(),
      lifetime: { ...this.lifetime },
    };
  }

  /** What a given quantity of a grade would actually produce. Shown before you commit. */
  previewRefine(grade, units) {
    const table = REFINE_YIELD[grade] ?? {};
    const out = {};
    for (const k in table) out[k] = Math.floor(table[k] * units * (1 + this.yieldBonus));
    return out;
  }

  /**
   * The same preview, UNROUNDED.
   *
   * `previewRefine` floors, which is honest about what a single batch delivers but
   * lies about exotic: core refines at 0.015 exotic per unit, so any batch under 67
   * core units previews as `exotic: 0` while the refinery's `_pending` carry does in
   * fact accumulate the fraction and eventually pay it. A player reading the floored
   * preview would conclude exotic is unobtainable from the batches they can actually
   * carry. This is what a readout that has to be truthful about a trickle uses.
   */
  previewRefineExact(grade, units) {
    const table = REFINE_YIELD[grade] ?? {};
    const out = {};
    for (const k in table) out[k] = table[k] * units * (1 + this.yieldBonus);
    return out;
  }
}
