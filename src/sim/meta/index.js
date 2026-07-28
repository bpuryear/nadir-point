import { EV } from '../../core/events.js';
import { getModule } from '../../core/contracts.js';
import { MEV } from './events.js';
import { EconomySystem, gradeForSection, gradeForKind, MATERIAL_DEFS, SCRAP_GRADES, REFINED_POOLS, REFINE_YIELD } from './materials.js';
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
  MEV, MATERIAL_DEFS, SCRAP_GRADES, REFINED_POOLS, REFINE_YIELD, PERK_DEFS, ARRIVAL_TIERS,
  REFIT_GATE, DERELICT, SAVE_VERSION,
  moduleVolume, volumeClassOf, patternCost, gradeForSection, gradeForKind,
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
 * Break a stored module down. Called by `SalvageSystem.scrapInventoryItem`.
 *
 * A module gives back roughly a tenth of its tonnage in scrap, scaled by condition -
 * so scrapping a good part to repair the hull is a real and painful trade, which is the
 * scarcity the scope decision asked for.
 */
export function breakDownItem(world, item) {
  const economy = world.systems.economy;
  if (!economy) return null;
  const def = getModule(item.moduleId);
  const mass = def?.mass ?? 200;
  const grade = def?.weapon ? 'machine'
    : (def?.grants?.powerOutput || def?.grants?.sensorRange || def?.grants?.hangarBays) ? 'core'
      : 'plate';
  const units = Math.max(1, Math.round(mass * 0.10 * (item.condition ?? 1)));
  const accepted = economy.addScrap(grade, units, item.uid);
  world.systems.codex?.markModule(item.moduleId, 'salvaged');
  world.bus?.emit(EV.SALVAGE_ACQUIRED, { kind: 'materials', amount: accepted, grade, scrapped: def });
  return { grade, units: accepted, vented: units - accepted };
}

/**
 * Projected yield of a wreck section, before you cut it.
 *
 * Gated on the `salvagers_eye` hull perk, which is itself gated on codex knowledge:
 * this is the payoff loop that makes reading the codex worth doing. Returns null when
 * the player has not earned the readout, and a UI must render that absence honestly
 * rather than showing the numbers anyway.
 */
export function projectedYield(world, section) {
  if (!world.systems.perks?.seesProjectedYield) return null;
  const grade = gradeForSection(section);
  const units = Math.max(1, Math.round(section.materials ?? 0));
  const def = section.moduleId ? getModule(section.moduleId) : null;
  const cargo = world.systems.cargo;
  const room = def && cargo ? cargo.canTakeModule(def) : null;
  return {
    grade,
    scrapUnits: units,
    refined: world.systems.economy?.previewRefine(grade, units) ?? {},
    module: def ? { id: def.id, name: def.name, volumeM3: moduleVolume(def) } : null,
    condition: section.integrity,
    state: section.integrity >= 0.6 ? 'INTACT' : section.integrity >= 0.25 ? 'DAMAGED' : 'SCRAP',
    teachesPattern: !!(def && section.integrity >= 0.6 && !world.systems.patterns?.has(def.id)),
    willFit: room ? room.ok : true,
  };
}
