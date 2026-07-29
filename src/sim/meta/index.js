import { EV } from '../../core/events.js';
import { getModule } from '../../core/contracts.js';
import { MEV } from './events.js';
import { EconomySystem, gradeForSection, gradeForKind, gradeForModule, MATERIAL_DEFS, SCRAP_GRADES, REFINED_POOLS, REFINE_YIELD, MATERIAL_VOLUME } from './materials.js';
import { scrapUnits, scrapYield, salvageState } from '../condition.js';
import { CargoHold, moduleVolume, volumeClassOf } from './cargo.js';
import { ItemSystem } from './items.js';
import { CodexSystem } from './codex.js';
import { PatternSystem, patternCost } from './patterns.js';
import { PerkSystem, PERK_DEFS } from './perks.js';
import { ObjectiveSystem, ARRIVAL_TIERS } from './objectives.js';
import { SortieSystem } from './sortie.js';
import { RefitGateSystem, REFIT_GATE } from './refitGate.js';
import { DerelictSystem, DERELICT } from './derelict.js';
import { PersistenceSystem, SAVE_VERSION } from '../../core/persistence.js';

export {
  EconomySystem, CargoHold, ItemSystem, CodexSystem, PatternSystem, PerkSystem, ObjectiveSystem,
  SortieSystem, RefitGateSystem, DerelictSystem, PersistenceSystem,
  MEV, MATERIAL_DEFS, SCRAP_GRADES, REFINED_POOLS, REFINE_YIELD, MATERIAL_VOLUME,
  PERK_DEFS, ARRIVAL_TIERS, REFIT_GATE, DERELICT, SAVE_VERSION,
  moduleVolume, volumeClassOf, patternCost, gradeForSection, gradeForKind, gradeForModule,
};

/**
 * PROGRESSION, ECONOMY AND OBJECTIVES — the installer.
 *
 * Idempotent, tolerant of every optional dependency being absent, and safe to call
 * before the world sim, the refit system or any geometry has landed. It installs:
 *
 *   30  objectives   reads the faction war, writes nothing back to it
 *   39  items        ahead of combat, so a coolant purge is hot the same step
 *   85  economy      the refinery queue, in the salvage/cleanup band
 *
 * `cargo`, `codex`, `patterns` and `perks` are event-driven and have no fixed step.
 *
 * WIRING NOTE FOR INTEGRATION. `src/game.js` is owned by integration and this stream
 * may not edit it, and its `import.meta.glob` list has no entry that would pick this
 * file up. So `SalvageSystem`'s constructor calls this installer - salvage is
 * constructed unconditionally in `bootGame`, so it is a reliable seam. Moving the call
 * into `bootGame` is a two-line change and the guard below makes the move safe: calling
 * it from both places is a no-op the second time.
 */
export function installProgression(world, deps = {}) {
  if (world.systems.economy) return world.systems.progression;

  const salvage = deps.salvage ?? world.systems.salvage ?? null;

  const cargo = new CargoHold(world, deps.cargo);
  const economy = new EconomySystem(world, deps.economy);
  const codex = new CodexSystem(world);
  const patterns = new PatternSystem(world);
  const items = new ItemSystem(world);
  const perks = new PerkSystem(world);
  const objectives = new ObjectiveSystem(world);

  // THE SORTIE LOOP. Four systems, all of which read state that already existed and
  // none of which invent a resource: the sortie ledger and its debrief, the refit
  // commitment gate, the crippling handler, and the save. See each file's header for
  // the four-question test it passes.
  const sortie = new SortieSystem(world);
  const refitGate = new RefitGateSystem(world);
  const derelict = new DerelictSystem(world);
  const persistence = new PersistenceSystem(world, deps.persistence);

  world.register('cargo', cargo);
  world.register('economy', economy);
  world.register('codex', codex);
  world.register('patterns', patterns);
  world.register('items', items);
  world.register('perks', perks);
  world.register('objectives', objectives);
  world.register('sortie', sortie);
  world.register('refitGate', refitGate);
  world.register('derelict', derelict);
  world.register('persistence', persistence);

  world.engine?.add(objectives);
  world.engine?.add(items);
  world.engine?.add(economy);
  world.engine?.add(derelict);
  world.engine?.add(sortie);
  world.engine?.add(refitGate);
  // `refit.js` is usually already up by now; if it is not, the gate claims it on its
  // first step instead. Either way nothing else has to know about the ordering.
  refitGate.enforce();

  // The hold's slot ceiling is a hold, not a warehouse. Volume is the real constraint;
  // this only stops a pathological "forty sensor masts" fit.
  if (salvage && salvage.cargoCapacity < 12) salvage.cargoCapacity = 12;

  perks.apply();

  /** Bus subscriptions this installer owns, released on dispose. */
  const offs = [];

  const api = {
    cargo, economy, codex, patterns, items, perks, objectives,
    sortie, refitGate, derelict, persistence,

    /**
     * THE ONE READ CALL A UI NEEDS. Everything below is also available per-system.
     */
    describe() {
      return {
        hold: cargo.describe(),
        materials: economy.describe(),
        items: items.describeHotbar(),
        activeItems: items.describeActive(),
        patterns: patterns.describeKnown(),
        perks: perks.describe(),
        objectives: objectives.describe(),
        codex: codex.progress(),
        sortie: sortie.live(),
        refit: refitGate.status(),
        derelict: derelict.status(),
        sites: derelict.sites(),
        ledger: world.systems.factionWar?.ledgerStatus?.() ?? null,
        berth: world.systems.travel?.status?.() ?? null,
      };
    },

    /**
     * The cut decision, per wreck section. `salvage.describeWrecks()` gives the rows;
     * this gives what each one is worth. See `sectionPreview` above for the split
     * between what every player sees and what `salvagers_eye` buys.
     */
    sectionPreview: (section) => sectionPreview(world, section),

    /** What breaking a stored or installed part down would pay. No side effects. */
    scrapPreview: (item, condition = null) => scrapPreview(world, item, condition),

    dispose() {
      for (const off of offs) off?.();
      offs.length = 0;
      codex.dispose?.();
      items.dispose?.();
      perks.dispose?.();
      objectives.dispose?.();
      sortie.dispose?.();
      refitGate.dispose?.();
      derelict.dispose?.();
      for (const s of [objectives, items, economy, derelict, sortie, refitGate]) {
        const list = world.engine?.systems;
        const i = list?.indexOf(s) ?? -1;
        if (i >= 0) list.splice(i, 1);
      }
      for (const k of ['cargo', 'economy', 'codex', 'patterns', 'items', 'perks', 'objectives',
        'sortie', 'refitGate', 'derelict', 'persistence', 'progression']) {
        delete world.systems[k];
      }
    },
  };

  world.register('progression', api);

  // Keep the hold's fit bonus honest without touching `refit.js`'s one-place-where-a-
  // loadout-becomes-statistics rule: recompute from the fit whenever the fit changes.
  const recomputeFit = () => {
    let m3 = 0;
    for (const hp of world.player?.hardpoints?.values() ?? []) {
      m3 += hp.module?.def?.grants?.cargo ?? 0;
    }
    cargo.setFitBonus(m3);
  };
  offs.push(world.bus.on(EV.MODULE_INSTALLED, recomputeFit));
  offs.push(world.bus.on(EV.MODULE_REMOVED, recomputeFit));
  offs.push(world.bus.on(EV.MODULE_LOST, recomputeFit));
  recomputeFit();

  return api;
}

/**
 * The salvage seam.
 *
 * `SalvageSystem._store` delegates here when the progression layer is installed. This
 * is where a cut section stops being geometry and becomes economy, and it is the single
 * place where the four consequences of a cut are decided:
 *
 *   1. a whole module, if it survived AND there is volume for it
 *   2. otherwise scrap, graded by what the section was, capped by remaining volume
 *   3. a pattern, if the section came off intact
 *   4. occasionally a device, likewise only from an intact section
 *
 * Rule 1 is the one that matters: a full hold turns a rare part into scrap, so "what do
 * I leave behind" is a question with a wrong answer.
 *
 * @returns {{kind:string, [key:string]:any}}
 */
export function storeSection(world, section, salvage) {
  const economy = world.systems.economy;
  const cargo = world.systems.cargo;
  if (!economy || !cargo) return { kind: 'none' };

  const rng = salvage?.rng ?? world.rng;
  const codex = world.systems.codex;
  const patterns = world.systems.patterns;
  const items = world.systems.items;

  // Intact sections teach, whether or not the part itself fits in the hold.
  const learned = patterns?.rollFromSection(section, rng) ?? null;
  const dropped = items?.rollDrop(section, rng) ?? null;

  const def = section.moduleId ? getModule(section.moduleId) : null;
  if (def) {
    const room = cargo.canTakeModule(def);
    const slots = salvage ? world.inventory.length < salvage.cargoCapacity : true;
    if (room.ok && slots) {
      world.inventory.push({
        moduleId: def.id,
        condition: section.integrity,
        uid: section.id,
        volume: room.volume,
      });
      codex?.markModule(def.id, 'salvaged');
      world.bus?.emit(EV.SALVAGE_ACQUIRED, { kind: 'module', module: def, section });
      world.bus?.emit(MEV.CARGO_CHANGED, { reason: 'module' });
      return { kind: 'module', module: def.id, volume: room.volume, pattern: learned, item: dropped };
    }
    // It did not fit. That is a decision the player made about what to cut, and the
    // part is torn up for what it weighs.
    world.bus?.emit(EV.NOTIFY, {
      text: `${def.name} WILL NOT FIT — ${Math.round(room.free)} m3 free, needs ${room.volume}`,
      important: true,
    });
  }

  const grade = gradeForSection(section);
  const units = Math.max(1, Math.round(section.materials ?? 0));
  const accepted = economy.addScrap(grade, units, section.id);
  codex?.markMaterial(grade, 'salvaged');
  world.bus?.emit(EV.SALVAGE_ACQUIRED, {
    kind: 'materials', amount: accepted, grade, section, vented: units - accepted,
  });
  return { kind: 'scrap', grade, units: accepted, vented: units - accepted, pattern: learned, item: dropped };
}

/**
 * Resolve any of the three shapes a "part" arrives in into `{def, condition, uid}`.
 *
 * There are three because three different systems hold parts and none of them can be
 * asked to change: the hold carries `{moduleId, condition, uid}` records, a hardpoint
 * carries a module INSTANCE with `.def` and `.condition`, and the refit stream's pinned
 * handover passes a bare `ModuleDef` with the condition alongside. Accepting all three
 * here is what lets `breakDownItem` be the single breakdown path without a second
 * function per caller — and a second function per caller is exactly how the 14x
 * divergence got in.
 */
function resolveScrappable(item, conditionOverride = null) {
  if (!item) return { def: null, condition: 1, uid: null };
  // A module instance from a hardpoint: `{def, condition}`.
  if (item.def) {
    return { def: item.def, condition: conditionOverride ?? item.condition ?? 1, uid: item.uid ?? null };
  }
  // A hold record: `{moduleId, condition, uid}`.
  if (item.moduleId) {
    return { def: getModule(item.moduleId), condition: conditionOverride ?? item.condition ?? 1, uid: item.uid ?? null };
  }
  // A bare ModuleDef. It carries no condition, so one must be supplied or it is assumed
  // pristine — which is why the refit handover passes the mount's condition explicitly.
  if (item.id) return { def: item, condition: conditionOverride ?? 1, uid: null };
  return { def: null, condition: conditionOverride ?? 1, uid: null };
}

/**
 * Break a part down. THE ONLY BREAKDOWN PATH.
 *
 * Called by `SalvageSystem.scrapInventoryItem` for a stored part and by
 * `RefitSystem.scrapInstalled` for one that is still bolted on. Both arrive here so
 * that "what does melting this pay" has exactly one answer. It used to have two, 13-35x
 * apart, and the expensive one wrote `world.materials` directly — bypassing hold
 * volume, the refinery queue and the refining loss, and minting an exotic on top.
 *
 * A module gives back roughly a tenth of its tonnage in scrap, scaled by condition, and
 * that scrap has to fit and has to be refined - so scrapping a good part to repair the
 * hull is a real and painful trade, which is the scarcity the scope decision asked for.
 *
 * @param {Object} world
 * @param {Object} item              hold record, module instance, or ModuleDef
 * @param {number|null} [condition]  overrides the condition carried by `item`
 */
export function breakDownItem(world, item, condition = null) {
  const economy = world.systems.economy;
  if (!economy) return null;
  const r = resolveScrappable(item, condition);
  if (!r.def) return null;
  const grade = gradeForModule(r.def);
  const units = scrapUnits(r.def.mass ?? 200, r.condition);
  const accepted = economy.addScrap(grade, units, r.uid);
  const vented = units - accepted;
  world.systems.codex?.markModule(r.def.id, 'salvaged');
  world.bus?.emit(EV.SALVAGE_ACQUIRED, { kind: 'materials', amount: accepted, grade, scrapped: r.def });
  if (vented > 0) {
    // The hold refused part of it. Say so in the same voice the anchorage refusals use,
    // on the channel `ui/index.js:263` already renders — a silent loss is the one
    // outcome a scarcity system may never produce.
    world.bus?.emit(EV.NOTIFY, {
      text: `${String(r.def.name ?? r.def.id).toUpperCase()} BROKEN DOWN — ${vented} of ${units} units vented, `
        + `${Math.round(world.systems.cargo?.freeM3() ?? 0)} m3 free`,
      important: true,
    });
  }
  return {
    grade,
    units: accepted,
    vented,
    moduleId: r.def.id,
    refined: economy.previewRefine(grade, accepted),
  };
}

/**
 * What breaking a part down WOULD pay, without doing it. No side effects.
 *
 * This is the number the hold row and the refit transaction confirmation must print.
 * `ui/inventory.js:28` currently computes its own `mass * 0.4 * condition` and prints
 * "168 AL" for a part that yields 12 alloy after refining; `ui/refit.js:271` reprints
 * it as the confirmation. Both should call this instead.
 */
export function scrapPreview(world, item, condition = null) {
  const r = resolveScrappable(item, condition);
  if (!r.def) return null;
  const grade = gradeForModule(r.def);
  const units = scrapUnits(r.def.mass ?? 200, r.condition);
  const econ = world?.systems?.economy ?? null;
  const cargo = world?.systems?.cargo ?? null;
  const free = cargo ? cargo.freeM3() : Infinity;
  const m3 = units * (MATERIAL_VOLUME[grade] ?? 0.34);
  return {
    moduleId: r.def.id,
    name: r.def.name ?? r.def.id,
    condition: r.condition,
    grade,
    scrapUnits: units,
    m3,
    /** Scrap is bulky. A full hold vents the overflow, so this can be false. */
    fits: m3 <= free + 1e-6,
    freeM3: free,
    refined: econ ? econ.previewRefine(grade, units) : scrapYield(r.def.mass ?? 200, r.condition, grade),
    refinedExact: econ ? econ.previewRefineExact(grade, units) : null,
  };
}

/**
 * WHAT CUTTING THIS SECTION WILL ACTUALLY GIVE YOU. Read before the cut.
 *
 * This is the read API the salvage cut panel needs and the reason it lives here rather
 * than in `salvage.js`: the grade, the volume and the refined projection are all
 * economy facts, and the cut row would otherwise have to reach across three systems to
 * assemble them. `salvage.js#describeWrecks` publishes the geometry and the clock; this
 * publishes the consequence.
 *
 * IT IS SPLIT IN TWO ON PURPOSE.
 *
 *   UNGATED — grade, scrap units, the cubic metres it will occupy, whether the part
 *             itself will fit. `materials.js:17-31` says the whole point of the chain is
 *             that scrap is graded by source, so "which section do I cut" is a materials
 *             decision. Nothing in `src/ui/` called `gradeForSection`, so that decision
 *             was unavailable to the player. It cannot be a perk; it is the mechanic.
 *
 *   GATED on `salvagers_eye` — the projected REFINED yield after the crucible's lossy
 *             pass, the unrounded exotic trickle, and whether the section still has a
 *             pattern to teach. This is the readout the ungated path genuinely does not
 *             show. The perk previously bought `projectedYield()`, which had zero call
 *             sites anywhere in `src/`, while `ui/theme.js:344-351` handed every player
 *             a projected salvage state for free. A capstone that buys a dead function
 *             is worse than no capstone.
 *
 * @returns {Object} always a row; `refined` is null until the perk is held.
 */
export function sectionPreview(world, section) {
  if (!section) return null;
  const grade = gradeForSection(section);
  const units = Math.max(1, Math.round(section.materials ?? 0));
  const def = section.moduleId ? getModule(section.moduleId) : null;
  const cargo = world?.systems?.cargo ?? null;
  const econ = world?.systems?.economy ?? null;
  const room = def && cargo ? cargo.canTakeModule(def) : null;
  const condition = section.condition ?? section.integrity ?? 0;
  const detailed = !!world?.systems?.perks?.seesProjectedYield;

  return {
    sectionId: section.id ?? null,
    label: section.label ?? null,
    condition,
    state: salvageState(condition),

    // --- ungated: the materials decision -----------------------------------
    scrapGrade: grade,
    scrapUnits: units,
    /** Cubic metres the SCRAP occupies if the part does not survive or does not fit. */
    m3IfTaken: units * (MATERIAL_VOLUME[grade] ?? 0.34),
    moduleId: def?.id ?? null,
    moduleName: def?.name ?? null,
    moduleVolumeM3: def ? moduleVolume(def) : 0,
    /** Does the whole part fit? A full hold turns a rare part into scrap. */
    willFit: room ? room.ok : true,
    freeM3: cargo ? cargo.freeM3() : Infinity,

    // --- gated: the salvager's eye -----------------------------------------
    detailed,
    refinedPreview: detailed && econ ? econ.previewRefine(grade, units) : null,
    refinedExact: detailed && econ ? econ.previewRefineExact(grade, units) : null,
    teachesPattern: detailed
      ? !!(def && condition >= 0.6 && !world.systems.patterns?.has(def.id))
      : null,
  };
}

/**
 * Back-compatible alias. `projectedYield` is what `perks.js:99` promised and what
 * nothing ever called; `sectionPreview` is the shape that replaced it.
 */
export function projectedYield(world, section) {
  if (!world.systems.perks?.seesProjectedYield) return null;
  return sectionPreview(world, section);
}
