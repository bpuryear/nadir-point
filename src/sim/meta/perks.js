import { EV } from '../../core/events.js';
import { MEV } from './events.js';

/**
 * HULL PERKS.
 *
 * The scope decision is precise about this: progression attaches to the SHIP, never to
 * a separate character sheet. So there is no pilot, no XP and no level here. What there
 * is, is a hull that accumulates capability - work done to a specific cruiser, paid for
 * in materials that could have been repairs, and gated on what the player has learned.
 *
 * TWO CURRENCIES, DELIBERATELY:
 *
 *   MATERIALS gate whether you can afford it. Every perk competes directly with hull
 *             repair, mount repair, pattern rebuilds and item fabrication for the same
 *             four pools, and the top tier is the only thing in the game allowed to
 *             spend `exotic`. Buying a perk is a decision to fly damaged for a while.
 *
 *   KNOWLEDGE gates whether it is offered at all. `requires` reads the codex. This is
 *             the mechanism that makes "the player's power curve is knowledge" a
 *             mechanical claim rather than a slogan - you cannot buy the salvager's
 *             instincts until you have taken enough hulls apart to have them.
 *
 * WHAT THIS IS NOT: a perk tree with branches and exclusive picks. `fun-systems.md`
 * names a pilot perk tree as one of the two most criticised systems in Everspace 2 and
 * rules it out. These are seven flat, permanent, ranked improvements to a physical
 * ship, every one of which multiplies a value some other system already reads.
 */

/**
 * @typedef {Object} PerkDef
 * @property {string} id
 * @property {string} name
 * @property {string} description        one sentence, functional
 * @property {number} maxRank
 * @property {(rank:number) => Object} cost      refined materials for the NEXT rank
 * @property {Object} [requires]         codex gate: {category, state, count}
 * @property {string} effect             human-readable, shown on the card
 */

/** The whole list. Seven entries; adding an eighth should require an argument. */
export const PERK_DEFS = [
  {
    id: 'reinforced_mounts',
    name: 'Reinforced Mounts',
    description: 'Doubler plates and deeper bolt rings under every hardpoint.',
    effect: '+12% hardpoint structure per rank',
    maxRank: 3,
    cost: (r) => ({ alloy: 90 + r * 70, composite: 30 + r * 25 }),
  },
  {
    id: 'hold_bracing',
    name: 'Hold Bracing',
    description: 'Cuts the internal frames back and re-stows the bay for bulk cargo.',
    effect: '+400 m3 hold per rank',
    maxRank: 3,
    cost: (r) => ({ alloy: 70 + r * 60, composite: 40 + r * 30 }),
  },
  {
    id: 'cutting_optics',
    name: 'Cutting Optics',
    description: 'Better beam collimation on the salvage rig; sections come free faster.',
    effect: '+18% cut rate per rank',
    maxRank: 2,
    cost: (r) => ({ alloy: 40, electronics: 45 + r * 40 }),
    requires: { category: 'module', state: 'salvaged', count: 3 },
  },
  {
    id: 'field_refinery',
    name: 'Field Refinery',
    description: 'A second crucible line: scrap goes through faster and comes out cleaner.',
    effect: '+60% refining rate and +5% yield per rank',
    maxRank: 2,
    cost: (r) => ({ alloy: 80 + r * 60, electronics: 55 + r * 45 }),
    requires: { category: 'material', state: 'salvaged', count: 4 },
  },
  {
    id: 'spool_governor',
    name: 'Spool Governor',
    description: 'Rewritten reactor bus timing: power routing answers faster.',
    effect: '+15% power spool rate per rank',
    maxRank: 2,
    cost: (r) => ({ alloy: 60, electronics: 70 + r * 60, exotic: 1 }),
    requires: { category: 'module', state: 'installed', count: 3 },
  },
  {
    id: 'pattern_archive',
    name: 'Pattern Archive',
    description: 'Indexed fabrication records; rebuilding a known module costs less.',
    effect: '-25% pattern rebuild cost',
    maxRank: 1,
    cost: () => ({ alloy: 160, electronics: 120, exotic: 2 }),
    requires: { category: 'module', state: 'salvaged', count: 6 },
  },
  {
    id: 'salvagers_eye',
    name: "Salvager's Eye",
    description: 'Enough hulls taken apart that you can read one at a glance: projected section yield is shown before you cut.',
    effect: 'projected yield on every wreck section, at any range you can see',
    maxRank: 1,
    cost: () => ({ alloy: 120, composite: 60, exotic: 3 }),
    requires: { category: 'module', state: 'installed', count: 5 },
  },
];

const BY_ID = new Map(PERK_DEFS.map((d) => [d.id, d]));

export class PerkSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.name = 'perks';

    /** @type {Map<string, number>} perk id -> rank held */
    this.ranks = new Map();
    this._offs = [];

    // The refit system rebuilds the hull's statistics from the fit on every install
    // and every removal, which would wipe a perk that touches the same value. So the
    // perks re-apply immediately afterwards. One ordering rule, stated once.
    this._offs.push(this.bus.on(EV.MODULE_INSTALLED, () => this.apply()));
    this._offs.push(this.bus.on(EV.MODULE_REMOVED, () => this.apply()));
  }

  rank(id) { return this.ranks.get(id) ?? 0; }
  has(id) { return this.rank(id) > 0; }

  // --- gating ---------------------------------------------------------------

  /** Is the knowledge requirement met? Reads the codex, and nothing else. */
  unlocked(id) {
    const def = BY_ID.get(id);
    if (!def) return false;
    if (!def.requires) return true;
    const codex = this.world.systems.codex;
    if (!codex) return false;
    const { category, state, count } = def.requires;
    return codex.count(category, state) >= count;
  }

  /** Cost of the next rank, or null if it is maxed. */
  nextCost(id) {
    const def = BY_ID.get(id);
    if (!def) return null;
    const r = this.rank(id);
    if (r >= def.maxRank) return null;
    return def.cost(r);
  }

  canBuy(id) {
    const def = BY_ID.get(id);
    if (!def) return { ok: false, reason: `unknown perk "${id}"` };
    if (this.rank(id) >= def.maxRank) return { ok: false, reason: 'at maximum rank' };
    if (!this.unlocked(id)) {
      const { category, state, count } = def.requires;
      const have = this.world.systems.codex?.count(category, state) ?? 0;
      return { ok: false, reason: `needs ${count} ${category}s ${state} — you have ${have}`, locked: true };
    }
    const cost = this.nextCost(id);
    const econ = this.world.systems.economy;
    if (econ && !econ.canAfford(cost)) {
      return { ok: false, reason: 'insufficient materials', cost, shortfall: econ.shortfall(cost) };
    }
    return { ok: true, cost };
  }

  /** Buy one rank. Permanent, and paid for out of the same pool as repairs. */
  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) return check;
    const econ = this.world.systems.economy;
    const paid = econ ? econ.spend(check.cost, `perk:${id}`) : { ok: true };
    if (!paid.ok) return paid;
    const rank = this.rank(id) + 1;
    this.ranks.set(id, rank);
    this.apply();
    const def = BY_ID.get(id);
    this.bus?.emit(MEV.PERK_PURCHASED, { id, rank, cost: check.cost, def });
    this.bus?.emit(EV.NOTIFY, { text: `HULL UPGRADED — ${def.name} ${rank}`, important: true });
    return { ok: true, id, rank, cost: check.cost };
  }

  // --- application ----------------------------------------------------------

  /**
   * Push every held perk onto the systems that read the values.
   *
   * Idempotent by construction: each target is SET from the perk's rank rather than
   * incremented, so calling this twice never doubles anything. That property is what
   * lets it be re-run on every refit without bookkeeping.
   */
  apply() {
    const w = this.world;
    const ship = w.player;

    const hold = w.systems.cargo;
    if (hold) hold.perkBonusM3 = this.rank('hold_bracing') * 400;

    const salvage = w.systems.salvage;
    if (salvage) {
      salvage.cutRate = (salvage._baseCutRate ??= salvage.cutRate)
        * (1 + this.rank('cutting_optics') * 0.18);
    }

    const econ = w.systems.economy;
    if (econ) {
      const r = this.rank('field_refinery');
      econ.rateMultiplier = 1 + r * 0.6;
      econ.yieldBonus = r * 0.05;
    }

    const patterns = w.systems.patterns;
    if (patterns) patterns.costMultiplier = this.has('pattern_archive') ? 0.75 : 1;

    if (ship?.power) {
      ship.power.spoolRate = (ship.power._baseSpoolRate ??= ship.power.spoolRate)
        * (1 + this.rank('spool_governor') * 0.15);
    }

    if (ship?.hardpoints) {
      const mul = 1 + this.rank('reinforced_mounts') * 0.12;
      for (const hp of ship.hardpoints.values()) {
        const base = (hp._basemaxStructureHP ??= hp.maxStructureHP);
        // A jury-rigged mount keeps its penalty; the perk scales what is left of it.
        const jury = 0.7 ** (hp.juryRigged ?? 0);
        const next = Math.round(base * mul * jury);
        const frac = hp.maxStructureHP > 0 ? hp.structureHP / hp.maxStructureHP : 1;
        hp.maxStructureHP = next;
        hp.structureHP = Math.min(next, Math.round(next * frac));
      }
    }
    return this;
  }

  /** Does the player have the knowledge perk that reveals projected section yield? */
  get seesProjectedYield() { return this.has('salvagers_eye'); }

  // --- read API -------------------------------------------------------------

  /**
   * Every perk, its rank, its next cost, whether it is affordable, and - when locked -
   * exactly what knowledge would unlock it. A perk screen is this list rendered.
   */
  describe() {
    const econ = this.world.systems.economy;
    const codex = this.world.systems.codex;
    return PERK_DEFS.map((def) => {
      const rank = this.rank(def.id);
      const cost = this.nextCost(def.id);
      const check = this.canBuy(def.id);
      let gate = null;
      if (def.requires) {
        const have = codex?.count(def.requires.category, def.requires.state) ?? 0;
        gate = {
          text: `${def.requires.count} ${def.requires.category} entries at ${def.requires.state}`,
          have,
          need: def.requires.count,
          met: have >= def.requires.count,
        };
      }
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        effect: def.effect,
        rank,
        maxRank: def.maxRank,
        cost,
        affordable: !!(cost && econ?.canAfford(cost)),
        shortfall: cost && econ && !econ.canAfford(cost) ? econ.shortfall(cost) : null,
        gate,
        buyable: check.ok,
        reason: check.ok ? null : check.reason,
      };
    });
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
  }
}
