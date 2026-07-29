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
 *
 * EVERY PERK COSTS SOMETHING THE HULL WAS USING.
 *
 * Six of the seven used to be pure scalars — the exact failure `fun-systems.md:118-123`
 * records as the second-most-criticised system in Everspace 2, and one this file's own
 * header (:26-28) admitted to. With no drawback there is no decision: you buy all seven
 * in whatever order you can afford, and the ranks are a formality. Each now spends a
 * value some OTHER system already integrates and the HUD already draws, so the trade is
 * visible before you commit and felt afterwards:
 *
 *   reinforced_mounts  structure  <-  internal volume     (hold panel)
 *   hold_bracing       volume     <-  hull integrity      (hull bar, crippling gate)
 *   cutting_optics     cut rate   <-  section condition   (cut panel projection)
 *   field_refinery     refining   <-  power spool rate    (power panel)
 *   spool_governor     spool rate <-  reactor ceiling     (power capacity)
 *   pattern_archive    cost       <-  rebuilt condition   (the part you get)
 *   salvagers_eye      a readout, and nothing else — so it trades nothing
 *
 * Two of them meet on the same dial on purpose. `hold_bracing` cuts frames back for
 * volume; `reinforced_mounts` puts frames in and takes volume away. `spool_governor`
 * buys bus timing and `field_refinery` spends it. That is what stops the tree being a
 * checklist: two perks you both want are arguing with each other.
 *
 * COSTS ARE SCALED TO A CAMPAIGN, NOT A FIELD. The whole tree used to cost 1570 alloy
 * against a 590-alloy tank of propellant — under three fills, and one good 14-hulk
 * field paid for all of it, so the hull stopped accumulating after roughly one sortie.
 * `economyAudit.mjs` now asserts the floor from the live anchorage prices rather than
 * from a number in a document.
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
 * @property {string|null} drawback      what it costs, in the same voice as `effect`
 */

/** The whole list. Seven entries; adding an eighth should require an argument. */
export const PERK_DEFS = [
  {
    id: 'reinforced_mounts',
    name: 'Reinforced Mounts',
    description: 'Doubler plates and deeper bolt rings under every hardpoint.',
    effect: '+12% hardpoint structure per rank',
    drawback: '-90 m3 hold per rank — the doublers intrude into the bay',
    maxRank: 3,
    cost: (r) => ({ alloy: 180 + r * 150, composite: 60 + r * 55 }),
  },
  {
    id: 'hold_bracing',
    name: 'Hold Bracing',
    description: 'Cuts the internal frames back and re-stows the bay for bulk cargo.',
    effect: '+400 m3 hold per rank',
    drawback: '-6% hull integrity per rank — those frames were structure',
    maxRank: 3,
    cost: (r) => ({ alloy: 150 + r * 130, composite: 90 + r * 70 }),
  },
  {
    id: 'cutting_optics',
    name: 'Cutting Optics',
    description: 'Better beam collimation on the salvage rig; sections come free faster.',
    effect: '+18% cut rate per rank',
    drawback: '-0.05 condition on every section you cut, per rank — the torch runs hot',
    maxRank: 2,
    cost: (r) => ({ alloy: 90 + r * 70, electronics: 110 + r * 90 }),
    requires: { category: 'module', state: 'salvaged', count: 3 },
  },
  {
    id: 'field_refinery',
    name: 'Field Refinery',
    description: 'A second crucible line: scrap goes through faster and comes out cleaner.',
    effect: '+60% refining rate and +5% yield per rank',
    drawback: '-12% power spool rate per rank — the crucible is on the same bus',
    maxRank: 2,
    cost: (r) => ({ alloy: 170 + r * 130, electronics: 130 + r * 100 }),
    requires: { category: 'material', state: 'salvaged', count: 4 },
  },
  {
    id: 'spool_governor',
    name: 'Spool Governor',
    description: 'Rewritten reactor bus timing: power routing answers faster.',
    effect: '+15% power spool rate per rank',
    drawback: '-5% reactor output per rank — margin traded for response',
    maxRank: 2,
    cost: (r) => ({ alloy: 140, electronics: 160 + r * 130, exotic: 1 + r }),
    requires: { category: 'module', state: 'installed', count: 3 },
  },
  {
    id: 'pattern_archive',
    name: 'Pattern Archive',
    description: 'Indexed fabrication records; rebuilding a known module costs less.',
    effect: '-25% pattern rebuild cost',
    drawback: 'rebuilt parts come off the line at 0.74 condition instead of 0.85',
    maxRank: 1,
    cost: () => ({ alloy: 380, electronics: 280, exotic: 2 }),
    requires: { category: 'module', state: 'salvaged', count: 6 },
  },
  {
    id: 'salvagers_eye',
    name: "Salvager's Eye",
    description: 'Enough hulls taken apart that you can read one at a glance: the refined yield of a section is projected before you cut it.',
    effect: 'projected refined yield, the exotic trickle and the unlearned patterns, on every wreck section',
    // The only perk with no drawback, and it says so rather than leaving a blank. It
    // buys a READOUT — `sectionPreview().refinedPreview` — not a number on the hull, so
    // there is nothing for it to trade against. It previously bought `projectedYield()`,
    // which had zero call sites anywhere in `src/`; see meta/index.js#sectionPreview.
    drawback: null,
    maxRank: 1,
    cost: () => ({ alloy: 300, composite: 150, electronics: 120, exotic: 1 }),
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

    const bracing = this.rank('hold_bracing');
    const mounts = this.rank('reinforced_mounts');
    const optics = this.rank('cutting_optics');
    const refinery = this.rank('field_refinery');
    const governor = this.rank('spool_governor');

    // Internal volume is a shared dial: bracing cuts frames out to make room, the
    // mount doublers put frames back in and take it away. Both land here, both are SET
    // from rank, so the net is whatever the two ranks say and calling this twice is
    // still a no-op.
    const hold = w.systems.cargo;
    if (hold) hold.perkBonusM3 = bracing * 400 - mounts * 90;

    const salvage = w.systems.salvage;
    if (salvage) {
      salvage.cutRate = (salvage._baseCutRate ??= salvage.cutRate) * (1 + optics * 0.18);
      // ...and every section comes off scorched. Read by `condition.js#cutQuality`
      // through `salvage._updateCut`, and projected on the cut panel before the cut.
      salvage.cutConditionPenalty = optics * 0.05;
    }

    const econ = w.systems.economy;
    if (econ) {
      econ.rateMultiplier = 1 + refinery * 0.6;
      econ.yieldBonus = refinery * 0.05;
    }

    const patterns = w.systems.patterns;
    if (patterns) {
      patterns.costMultiplier = this.has('pattern_archive') ? 0.75 : 1;
      // A cheaper rebuild is a looser rebuild. `patterns.build` reads this instead of
      // the module constant, so the drawback is on the part the player receives.
      patterns.rebuildConditionMul = this.has('pattern_archive') ? 0.87 : 1;
    }

    if (ship?.power) {
      // Two perks meet on the spool: the governor buys response, the crucible spends it.
      ship.power.spoolRate = (ship.power._baseSpoolRate ??= ship.power.spoolRate)
        * (1 + governor * 0.15) * (1 - refinery * 0.12);
      // ...and the governor's own bill is headroom. `power.capacity` is
      // `(baseOutput + bonusOutput) * healthFactor`; `bonusOutput` belongs to the fit
      // and `healthFactor` to damage, so this is the only term a perk may hold.
      ship.power.baseOutput = (ship.power._basePerkOutput ??= ship.power.baseOutput)
        * (1 - governor * 0.05);
    }

    // Bracing cut the frames back. `derelict.js:57` cripples the player at 35% of
    // `maxHullHP`, so this moves the crippling threshold as well as the bar.
    if (ship && ship.maxHullHP > 0) {
      const baseHull = (ship._basePerkMaxHullHP ??= ship.maxHullHP);
      const nextHull = Math.max(1, Math.round(baseHull * (1 - bracing * 0.06)));
      const frac = ship.maxHullHP > 0 ? ship.hullHP / ship.maxHullHP : 1;
      ship.maxHullHP = nextHull;
      ship.hullHP = Math.min(nextHull, Math.max(1, Math.round(nextHull * frac)));
    }

    if (ship?.hardpoints) {
      const mul = 1 + mounts * 0.12;
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
        /** What it costs, in the same voice and on the same row. Never omit it. */
        drawback: def.drawback ?? null,
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
