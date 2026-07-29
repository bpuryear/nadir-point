/**
 * THE SORTIE.
 *
 * `closest-comparables.md` §5.2, Product 1: a run manufactures a bounded session with a
 * shape, and Hardspace: Shipbreaker is the proof that you can have that shape with no
 * permadeath, no procedural generation and full persistence. A shift there works because
 * it has a hard boundary, a consumable that forces you home, and a debrief that prices
 * what you did.
 *
 * We already owned two of the three and had wired none of them:
 *
 *   propellant   `world/travel.js`, 0.8 units/km, and `refuel()` called by nobody, which
 *                made it a one-way ratchet toward immobility rather than a clock
 *   hold volume  `meta/cargo.js`, real and well-designed, and it fills
 *
 * The third is somewhere to go back to, and that is `world/system.js`'s anchorages plus
 * `TravelSystem.dock()`. This file is the fourth thing: the ledger that watches what
 * happens between undocking and docking, so that arriving somewhere can PRICE it.
 *
 * WHAT THIS IS NOT. It is not a score, it is not a rank, and it does not gate anything.
 * Nothing in the game reads the debrief and changes. It exists because a session with
 * no summary is a session the player cannot feel the shape of, and every roguelike on
 * the shelf gets a disproportionate share of its felt progression from the screen at
 * the end. Ours costs one accumulator per number, and every number was already tracked
 * somewhere - this file only puts them next to each other.
 *
 * THE FOUR-QUESTION TEST (docs/design/scope-decision.md):
 *
 *  1. What decision does it create? None on its own - but it is the readout on the two
 *     that the sortie loop creates: "cut one more section or burn home on what is left",
 *     and "which berth". A player who cannot see what the last sortie earned cannot
 *     price the next one.
 *  2. What does it interlock with? Propellant (travel), volume (cargo), the refinery
 *     backlog (economy), the codex, the salvage ledger, and the debt an anchorage
 *     extends. It is the seam where all six become one paragraph.
 *  3. What does it abstract? Everything about time except sim seconds. There is no
 *     shift clock, no forced return, no expiry: the boundary is the tank and the hold,
 *     which are physical, and not a timer, which would be imposed.
 *  4. Can the player see it? It IS the seeing. `debrief()` and `live()` are read APIs.
 */

import { EV } from '../../core/events.js';
import { MEV } from './events.js';
import { KM } from '../../core/units.js';
import { SCRAP_GRADES, REFINED_POOLS } from './materials.js';

/** A blank ledger. One place, so a reset and a first run are the same code. */
function blankRecord(index, at, fromPOI) {
  return {
    index,
    startedAt: at,
    endedAt: 0,
    fromPOI,
    toPOI: null,
    /** Cutting. */
    sectionsCut: 0,
    modulesRecovered: 0,
    ammoRecovered: 0,
    intelFixes: 0,
    /** { moduleId, name, condition } - the single best thing that came aboard. */
    bestPart: null,
    meanCondition: 0,
    _conditionSum: 0,
    _conditionCount: 0,
    /** Economy. */
    scrap: { plate: 0, machine: 0, core: 0 },
    refined: { alloy: 0, composite: 0, electronics: 0, exotic: 0 },
    spent: 0,
    /** Movement. */
    propellantBurned: 0,
    distanceM: 0,
    poisVisited: [],
    /** Violence. */
    kills: 0,
    hullLost: 0,
    modulesLost: 0,
    crippled: false,
    /** Knowledge. */
    codexAdvances: 0,
    /** Attention. */
    escalations: [],
  };
}

export class SortieSystem {
  /** @param {import('../../core/world.js').World} world */
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.name = 'sortie';
    /** After the economy, before nothing. It only reads. */
    this.order = 88;

    this.time = 0;
    this.index = 0;
    /** @type {ReturnType<typeof blankRecord>} */
    this.current = blankRecord(0, 0, null);
    /** @type {Array} completed sorties, newest last, capped. */
    this.log = [];
    /** True between `dock()` and `undock()`. Written by the travel layer. */
    this.docked = false;

    /**
     * DEBT. Hardspace's one genuinely load-bearing persistent number, and the only
     * thing in this design that survives a disaster without being a punishment: a yard
     * that tows you home and puts you back together does not do it for nothing, and a
     * berth that fuels a ship with no alloy left is extending credit. Debt is settled
     * out of refined stock when you dock, before anything else is paid for, so it is
     * always visible as "this sortie earned less than it looked like".
     */
    this.debt = 0;
    this.debtPaid = 0;

    this._prevPropellant = world.propellant?.current ?? null;
    this._offs = [];
    this._bind();
  }

  // =========================================================================
  // Boundaries
  // =========================================================================

  /** Called by `TravelSystem.undock()`. Opens a fresh ledger. */
  begin(fromPOI = null) {
    this.index++;
    this.current = blankRecord(this.index, this.time, fromPOI);
    this._prevPropellant = this.world.propellant?.current ?? null;
    this.docked = false;
    this.bus.emit(MEV.SORTIE_STARTED, { index: this.index, fromPOI });
    return this.current;
  }

  /**
   * Called by `TravelSystem.dock()`. Closes the ledger and returns the debrief.
   * Idempotent: docking twice does not produce two sorties.
   */
  end(toPOI = null) {
    if (this.docked) return this.lastDebrief();
    const rec = this.current;
    rec.endedAt = this.time;
    rec.toPOI = toPOI;
    rec.meanCondition = rec._conditionCount > 0 ? rec._conditionSum / rec._conditionCount : 0;
    this.docked = true;
    this.log.push(rec);
    if (this.log.length > 24) this.log.shift();
    const out = this.debrief(rec);
    this.bus.emit(MEV.SORTIE_ENDED, out);
    return out;
  }

  // =========================================================================
  // Debt
  // =========================================================================

  /** Take on credit. Always succeeds - that is what makes it credit. */
  borrow(alloy, reason = '') {
    if (!(alloy > 0)) return 0;
    this.debt += alloy;
    this.bus.emit(MEV.DEBT_CHANGED, { debt: this.debt, delta: alloy, reason });
    this.bus.emit(EV.NOTIFY, {
      text: `${Math.ceil(alloy)} ALLOY ON CREDIT — ${reason.toUpperCase()} — DEBT ${Math.ceil(this.debt)}`,
      important: true,
    });
    return alloy;
  }

  /**
   * Settle what can be settled out of refined alloy. Run on docking, before the player
   * is offered anything to spend on, so the bill lands where it can be read.
   */
  settle() {
    if (this.debt <= 0) return { paid: 0, debt: 0 };
    const m = this.world.materials;
    const paid = Math.min(this.debt, Math.floor(m.alloy ?? 0));
    if (paid > 0) {
      m.alloy -= paid;
      this.debt -= paid;
      this.debtPaid += paid;
      this.bus.emit(MEV.DEBT_CHANGED, { debt: this.debt, delta: -paid, reason: 'settled' });
    }
    return { paid, debt: this.debt };
  }

  // =========================================================================
  // Accumulation
  // =========================================================================

  fixedUpdate(dt) {
    this.time += dt;
    const rec = this.current;

    // Propellant burned: read the tank rather than trusting any one spender, because
    // three different systems debit it (transit legs, manoeuvring, and the anchorage
    // refilling it) and only the tank knows the truth.
    const tank = this.world.propellant;
    if (tank) {
      if (this._prevPropellant === null) this._prevPropellant = tank.current;
      const delta = this._prevPropellant - tank.current;
      if (delta > 0) rec.propellantBurned += delta;
      this._prevPropellant = tank.current;
    }

    // Distance under way. No allocation: the body's own speed scalar.
    const player = this.world.player;
    if (player && !player.dead && !this.docked) {
      rec.distanceM += (player.body?.speed ?? 0) * dt;
    }
  }

  _bind() {
    const on = (type, fn) => this._offs.push(this.bus.on(type, fn));
    const rec = () => this.current;

    on(EV.SALVAGE_ACQUIRED, (e) => {
      const r = rec();
      if (e?.kind === 'module') {
        r.modulesRecovered++;
        const condition = e.section?.condition ?? e.section?.integrity ?? 1;
        if (!r.bestPart || condition > r.bestPart.condition) {
          r.bestPart = { moduleId: e.module?.id ?? null, name: e.module?.name ?? 'MODULE', condition };
        }
      } else if (e?.kind === 'ammo') {
        r.ammoRecovered += e.rounds ?? 0;
      } else if (e?.kind === 'intel') {
        r.intelFixes += e.count ?? 1;
      }
      if (e?.section) {
        r.sectionsCut++;
        r._conditionSum += e.section.condition ?? e.section.integrity ?? 0;
        r._conditionCount++;
      }
    });

    on(MEV.SCRAP_ACQUIRED, ({ grade, units }) => {
      const r = rec();
      if (SCRAP_GRADES.includes(grade)) r.scrap[grade] += units ?? 0;
    });

    on(MEV.REFINED, (amounts) => {
      const r = rec();
      for (const k of REFINED_POOLS) if (amounts?.[k]) r.refined[k] += amounts[k];
    });

    on(MEV.MATERIALS_SPENT, ({ total }) => { rec().spent += total ?? 0; });
    on(MEV.CODEX_UPDATED, () => { rec().codexAdvances++; });

    on(EV.SHIP_DESTROYED, ({ ship, source }) => {
      if (ship?.isPlayer) return;
      const killer = source?.isPlayer ? 'player' : source?.faction ?? null;
      if (killer === 'player' || killer === 'player_squadron') rec().kills++;
    });

    on(EV.MODULE_LOST, ({ ship }) => { if (ship?.isPlayer) rec().modulesLost++; });
    on(MEV.PLAYER_CRIPPLED, () => { rec().crippled = true; });
    on(MEV.ESCALATION, ({ faction, tier }) => { rec().escalations.push(`${faction}:${tier}`); });

    on(EV.POI_ENTERED, ({ id }) => {
      const r = rec();
      if (id && !r.poisVisited.includes(id)) r.poisVisited.push(id);
    });
  }

  // =========================================================================
  // Read API
  // =========================================================================

  /**
   * THE DEBRIEF. Everything the sortie earned, in the order a player wants to read it.
   * Pure: it allocates a fresh object because it is called once per docking, not once
   * per frame.
   */
  debrief(record = null) {
    const r = record ?? this.current;
    const seconds = Math.max(0, (r.endedAt || this.time) - r.startedAt);
    const scrapUnits = SCRAP_GRADES.reduce((n, g) => n + r.scrap[g], 0);
    const refinedUnits = REFINED_POOLS.reduce((n, k) => n + r.refined[k], 0);
    const meanCondition = r._conditionCount > 0 ? r._conditionSum / r._conditionCount : 0;
    return {
      index: r.index,
      seconds,
      from: r.fromPOI,
      to: r.toPOI,
      places: r.poisVisited.slice(),
      cut: {
        sections: r.sectionsCut,
        modules: r.modulesRecovered,
        ammo: r.ammoRecovered,
        meanCondition,
        best: r.bestPart,
      },
      economy: {
        scrap: { ...r.scrap },
        scrapUnits,
        refined: { ...r.refined },
        refinedUnits,
        spent: r.spent,
        net: refinedUnits - r.spent,
      },
      movement: {
        propellantBurned: r.propellantBurned,
        km: r.distanceM / KM,
        perKm: r.distanceM > 0 ? r.propellantBurned / (r.distanceM / KM) : 0,
      },
      cost: {
        kills: r.kills,
        modulesLost: r.modulesLost,
        crippled: r.crippled,
        escalations: r.escalations.slice(),
      },
      knowledge: { codexAdvances: r.codexAdvances, intelFixes: r.intelFixes },
      debt: this.debt,
    };
  }

  lastDebrief() {
    return this.log.length ? this.debrief(this.log[this.log.length - 1]) : null;
  }

  /**
   * The live readout for a HUD strip: how far into this sortie you are, in the two
   * units that actually end it. Cached and mutated - safe every frame.
   */
  live() {
    const out = this._live ?? (this._live = {});
    const r = this.current;
    const tank = this.world.propellant ?? { current: 0, max: 1, reserve: 0 };
    const hold = this.world.systems.cargo;
    const spendable = Math.max(0, tank.current - (tank.reserve ?? 0));
    out.index = r.index;
    out.docked = this.docked;
    out.seconds = this.time - r.startedAt;
    out.sections = r.sectionsCut;
    out.modules = r.modulesRecovered;
    out.propellant = tank.current;
    out.propellantMax = tank.max;
    // The two clocks, as fractions of themselves. Whichever is smaller is the one
    // that will end this sortie.
    out.rangeFraction = tank.max > 0 ? spendable / tank.max : 0;
    out.holdFraction = hold ? Math.min(1, hold.usedM3() / Math.max(1, hold.capacityM3)) : 0;
    // At the rate the travel layer is currently charging - SILENT is 0.5/km rather than
    // 0.8, so the range readout has to follow the mode or it lies by 60%.
    const perKm = this.world.systems.travel?.propellantPerKm ?? 0.8;
    out.perKm = perKm;
    out.rangeKm = spendable / perKm;
    out.debt = this.debt;
    out.limiter = (1 - out.rangeFraction) > out.holdFraction ? 'PROPELLANT' : 'HOLD';
    return out;
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
  }
}
