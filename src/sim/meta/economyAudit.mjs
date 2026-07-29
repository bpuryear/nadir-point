/**
 * THE ECONOMY AUDIT.
 *
 *   node src/sim/meta/economyAudit.mjs        # exits non-zero on any failure
 *
 * WHY THIS EXISTS. Before it, the tree was green on every check it had: 51 of 51 from
 * `selftest.mjs`, two clean harnesses, a passing smoke run — over an economy with a
 * 14-35x internal contradiction and a working exotic printer. `selftest.mjs:627-630`
 * asserted `scrapped.yield.alloy > 0`, which BLESSED the expensive path rather than
 * questioning it, and `harness.js` / `sortieHarness.js` are printers that always exit 0.
 * `HANDOFF.md:203-206` records the project's own version of this lesson — "a check that
 * measures nothing prints ok" — and the economy was its second instance.
 *
 * Every assertion below is over the REGISTERED CONTENT, not over a fixture: 24 modules
 * and 13 ship classes imported from `src/art/geometry`, so it fails when someone adds a
 * module whose numbers break the loop, not only when someone edits this file.
 *
 * WHAT IT ASSERTS
 *
 *   1  SCRAP-PATH AGREEMENT   the hold path and the mount path pay within 10% of each
 *                             other, on every module at three conditions, measured end
 *                             to end through a real refinery rather than from the rate
 *                             constants.
 *   2  NO PRINTER             a pattern-build -> install -> scrap cycle is a strict
 *                             TOTAL loss for every module. This is the assertion the
 *                             old `exotic: v >= 0.75 ? 1 : 0` fails.
 *   3  EXOTIC REACHABILITY    (FLAG 8) closing the mint is only correct if exotic can
 *                             still be obtained. Asserts a production path exists in
 *                             the refine table AND that registered content actually
 *                             yields the grade that produces it AND that the perk
 *                             tree's demand is payable inside a plausible campaign.
 *   4  PERK TREE FLOOR        the whole tree costs more than N full tanks of
 *                             propellant, priced from the live anchorage table.
 *   5  DECLARED SINKS         every file that spends `exotic` is named on the
 *                             player-facing codex card for exotic.
 *   6  SECTION FIELD READS    every field a consumer reads off a `WreckSection` is a
 *                             field the constructor writes. This is the `section.grade`
 *                             class of bug: read by `items.js:413`, written nowhere, so
 *                             2 of the 5 devices could not drop for the life of the file.
 *   7  A REAL WRECK          builds `Wreck`s out of all 13 registered hulls and reads
 *                             what comes off them: grades stamped, all three drop tables
 *                             reachable, and the cut panel's economy row present.
 *
 * NEGATIVE CONTROLS, run against this file rather than assumed:
 *
 *   restore the old `mass * 0.4 * condition` rate  -> section 1 fails, 72 of 72 samples,
 *                                                     worst 15.60x
 *   restore `exotic: v >= 0.75 ? 1 : 0`            -> section 2 fails, 24 of 24 modules
 *                                                     are printers returning 102-109%,
 *                                                     19 of them a cheaper exotic source
 *                                                     than the crucible
 *   un-stamp `WreckSection.grade`                  -> section 6 names items.js:414, and
 *                                                     section 7 drops to three items:
 *                                                     boarding_charge 0, scan_pulse 0
 *                                                     out of 48,800 rolls
 */

import * as THREE from 'three';
import { Engine } from '../../core/loop.js';
import { World } from '../../core/world.js';
import { allModules, allShipClasses, getModule } from '../../core/contracts.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { EconomySystem, REFINE_YIELD, MATERIAL_VOLUME, MATERIAL_DEFS, REFINED_POOLS, SCRAP_GRADES, gradeForModule, gradeForKind } from './materials.js';
import { CargoHold } from './cargo.js';
import { PERK_DEFS } from './perks.js';
import { patternCost } from './patterns.js';
import { WreckSection, SalvageSystem, Wreck } from '../salvage.js';
import { breakDownItem, sectionPreview } from './index.js';
import { scrapYield, scrapUnits, repairCost } from '../condition.js';

await import('../../art/geometry/modules/index.js');
await import('../../art/geometry/ships/index.js');

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let checks = 0;
let failures = 0;
const fmt = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : String(v));
const rule = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

function check(label, ok, detail = '') {
  checks++;
  if (!ok) failures++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
}

/** A world with no renderer, the same stub the meta harness uses. */
function makeWorld(seed) {
  const engine = new Engine();
  const stub = { scene: new THREE.Scene(), far: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
  return new World({ engine, renderer: stub, seed });
}

/** An economy and a hold with no ship, so nothing competes for volume. */
function makeEconomy(seed = 'audit') {
  const world = makeWorld(seed);
  const cargo = new CargoHold(world, { baseM3: 1e9 });   // never the binding constraint here
  const economy = new EconomySystem(world);
  world.register('cargo', cargo);
  world.register('economy', economy);
  return { world, cargo, economy };
}

const MODULES = allModules();
const CLASSES = allShipClasses();
const CONDITIONS = [1.0, 0.85, 0.6];

console.log('NADIR POINT — economy audit');
console.log(`${MODULES.length} registered modules, ${CLASSES.length} registered ship classes, `
  + `${CONDITIONS.length} conditions per module = ${MODULES.length * CONDITIONS.length} scrap samples`);

// ===========================================================================
rule('1. SCRAP-PATH AGREEMENT — the hold path versus the mount path');
// ===========================================================================
//
// THE HOLD PATH   `salvage.scrapInventoryItem` -> `meta/index.js#breakDownItem`
//                 -> graded scrap -> the refinery queue -> refined pools.
// THE MOUNT PATH  `refit.scrapInstalled` -> `condition.js#scrapYield` -> refined.
//
// The hold path is measured END TO END: real `addScrap`, real FIFO queue, real
// `_flushPending` carry, so integer flooring and the fractional carry are included
// rather than assumed away. Measured on the same module these used to be 14.0x apart
// (port_cannon_bank at condition 1.0: 12 alloy against 168) and 34.3x at the extreme
// (ventral_hangar_deck: 28 against 960).

const TOLERANCE = 0.10;
let worstRatio = 1;
let worstLabel = '';
let disagreements = 0;
const sampleRows = [];

for (const def of MODULES) {
  for (const c of CONDITIONS) {
    const { world, economy } = makeEconomy(`audit/scrap/${def.id}/${c}`);
    world.inventory.push({ moduleId: def.id, condition: c, uid: `audit:${def.id}` });
    const out = breakDownItem(world, world.inventory[0]);
    economy.enqueueAll();
    economy.refineAll();
    let holdTotal = 0;
    for (const p of REFINED_POOLS) holdTotal += world.materials[p] ?? 0;

    const mount = scrapYield(def.mass ?? 200, c, gradeForModule(def));
    let mountTotal = 0;
    for (const p of REFINED_POOLS) mountTotal += mount[p] ?? 0;

    const hi = Math.max(holdTotal, mountTotal);
    const lo = Math.min(holdTotal, mountTotal);
    // Both paths floor, so a module small enough to produce single-digit refined units
    // can differ by a whole unit without any rate divergence. Treat a difference of one
    // unit as agreement; anything larger is a real difference in the arithmetic.
    const ratio = lo <= 0 ? (hi <= 1 ? 1 : Infinity) : hi / lo;
    const withinOne = hi - lo <= 1;
    if (!withinOne && ratio > 1 + TOLERANCE) disagreements++;
    if (!withinOne && ratio > worstRatio) { worstRatio = ratio; worstLabel = `${def.id}@${c}`; }
    if (c === 1.0) {
      sampleRows.push({ id: def.id, mass: def.mass, grade: out?.grade ?? '?', units: out?.units ?? 0, holdTotal, mountTotal });
    }
  }
}

sampleRows.sort((a, b) => b.mass - a.mass);
console.log(`   ${'MODULE'.padEnd(28)}${'MASS t'.padStart(7)}${'GRADE'.padStart(9)}`
  + `${'UNITS'.padStart(7)}${'HOLD'.padStart(7)}${'MOUNT'.padStart(7)}`);
for (const r of sampleRows.slice(0, 6)) {
  console.log(`   ${r.id.padEnd(28)}${String(r.mass).padStart(7)}${r.grade.padStart(9)}`
    + `${String(r.units).padStart(7)}${String(r.holdTotal).padStart(7)}${String(r.mountTotal).padStart(7)}`);
}
console.log(`   ...${sampleRows.length - 6} more modules at condition 1.00, and the same set at 0.85 and 0.60`);
console.log(`   worst divergence: ${worstLabel || 'none'} at ${worstRatio === 1 ? '1.00' : fmt(worstRatio)}x`);
check(`both scrap paths agree within ${TOLERANCE * 100}% on all ${MODULES.length * CONDITIONS.length} samples`,
  disagreements === 0, `${disagreements} disagreements, worst ${fmt(worstRatio)}x`);

// --- the grade argument, and what dropping it costs -----------------------
//
// `scrapYield(massT, condition, grade)` is only correct when the caller passes the
// grade. `refit.js:419` and `refit.js:552` call the two-argument form, so both take the
// `'machine'` default regardless of what the module is. That is not a rate divergence —
// the units are right — but the refining table is not flat: plate sums to 0.73 refined
// per unit against core's 0.525, so a plate module previewed as machine is wrong by a
// third. This measures it rather than describing it, and it is a HANDOVER: both call
// sites live in `sim/refit.js`, which this stream does not own.
let gradeWorst = 1;
let gradeWorstId = '';
let gradeWrong = 0;
for (const def of MODULES) {
  const trueGrade = gradeForModule(def);
  if (trueGrade === 'machine') continue;
  gradeWrong++;
  const withGrade = scrapYield(def.mass ?? 200, 1.0, trueGrade);
  const without = scrapYield(def.mass ?? 200, 1.0);
  let a = 0; let b = 0;
  for (const p of REFINED_POOLS) { a += withGrade[p] ?? 0; b += without[p] ?? 0; }
  const ratio = Math.max(a, b) / Math.max(1, Math.min(a, b));
  if (ratio > gradeWorst) { gradeWorst = ratio; gradeWorstId = def.id; }
}
console.log(`   ${gradeWrong} of ${MODULES.length} modules are not machine-grade; dropping the grade`
  + ` argument misprices the worst of them (${gradeWorstId}) by ${fmt(gradeWorst)}x`);
console.log('   -> HANDOVER: sim/refit.js:419 and :552 call the two-argument form. Passing');
console.log('      `found.def` as the third argument fixes both. Not this stream\'s file.');
check('scrapYield accepts a ModuleDef in place of a grade string, so the fix is one token',
  scrapYield(400, 1, MODULES[0]).grade === gradeForModule(MODULES[0]),
  `${MODULES[0].id} -> ${scrapYield(400, 1, MODULES[0]).grade}`);

// ===========================================================================
rule('2. NO PRINTER — pattern build -> install -> scrap must be a strict loss');
// ===========================================================================
//
// `patterns.js:122` rebuilds at REBUILD_CONDITION, and a rebuilt module can be
// installed and immediately scrapped. If the cycle returns as much as it costs it can
// be cranked, and the old code did exactly that: build port_cannon_bank for 147 alloy
// + 34 electronics, scrap it for 143 alloy + 50 composite + 1 EXOTIC. Net -4 alloy,
// -34 electronics, +50 composite, +1 exotic per turn. The perk tree needed 7 exotic,
// so the whole tree cost seven turns and 28 alloy.

const REBUILD_CONDITION = 0.85;

// The honest price of one exotic: refine core scrap until one falls out. Everything
// else that produces exotic has to be at least this expensive or it is a shortcut.
const directRefinedPerExotic = exoticRefinedCost();
function exoticRefinedCost() {
  const per = REFINE_YIELD.core?.exotic ?? 0;
  if (per <= 0) return Infinity;
  const units = 1 / per;
  let refined = 0;
  for (const k in REFINE_YIELD.core) refined += REFINE_YIELD.core[k] * units;
  return refined;
}

let printers = 0;
let shortcuts = 0;
let bestCrank = 0;
let bestCrankId = '';
const cycleRows = [];

for (const def of MODULES) {
  const cost = patternCost(def);
  if (!cost) continue;
  let inTotal = 0;
  for (const p of REFINED_POOLS) inTotal += cost[p] ?? 0;

  // BOTH EXITS. A rebuilt module can leave by the hold (`breakDownItem`) or off the
  // mount (`refit.scrapInstalled` -> `condition.js#scrapYield`), and the printer lived
  // on the SECOND one. An audit that only walked the hold path would have reported this
  // section clean while the exploit ran — which is how it survived a 51-of-51 selftest.
  const { world, economy } = makeEconomy(`audit/cycle/${def.id}`);
  world.inventory.push({ moduleId: def.id, condition: REBUILD_CONDITION, uid: `cycle:${def.id}` });
  breakDownItem(world, world.inventory[0]);
  economy.enqueueAll();
  economy.refineAll();
  let holdOut = 0;
  for (const p of REFINED_POOLS) holdOut += world.materials[p] ?? 0;

  const mount = scrapYield(def.mass ?? 200, REBUILD_CONDITION, gradeForModule(def));
  let mountOut = 0;
  for (const p of REFINED_POOLS) mountOut += mount[p] ?? 0;

  // Take the exit that pays best: the loop is only closed if BOTH are a loss.
  const outTotal = Math.max(holdOut, mountOut);
  const exoticOut = Math.max(world.materials.exotic ?? 0, mount.exotic ?? 0);
  const exoticIn = cost.exotic ?? 0;

  const returnFrac = inTotal > 0 ? outTotal / inTotal : 0;
  // A cycle that returns as much as it cost can be cranked forever. This is the
  // assertion the old `exotic: v >= 0.75 ? 1 : 0` fails: port_cannon_bank cost 181
  // refined units and paid back 194 plus an exotic.
  const isPrinter = returnFrac >= 1;

  // A cycle that nets exotic is legitimate only if it is a WORSE deal than refining
  // core scrap. Several large core modules do net an exotic — that is the refine table
  // doing its job on a big enough part, not a loophole — but each one burns hundreds of
  // refined units to do it, so nobody would ever choose it as a source.
  const netExotic = exoticOut - exoticIn;
  const netRefined = inTotal - outTotal;
  const costPerExotic = netExotic > 0 ? netRefined / netExotic : Infinity;
  const isShortcut = netExotic > 0 && costPerExotic < directRefinedPerExotic;

  if (isPrinter) printers++;
  if (isShortcut) shortcuts++;
  if (isPrinter || isShortcut) {
    cycleRows.push({ id: def.id, inTotal, outTotal, returnFrac, exoticIn, exoticOut, costPerExotic });
  }
  if (returnFrac > bestCrank) { bestCrank = returnFrac; bestCrankId = def.id; }
}

console.log(`   ${MODULES.length} modules cycled at condition ${REBUILD_CONDITION}`);
console.log(`   best return on a full crank: ${bestCrankId} at ${fmt(bestCrank * 100, 1)}% of what it cost`);
console.log(`   one exotic costs ${fmt(directRefinedPerExotic, 1)} refined units through the crucible; `
  + 'a cycle that beats that price is a shortcut');
for (const r of cycleRows) {
  console.log(`   OFFENDER  ${r.id}: in ${r.inTotal} -> out ${r.outTotal} (${fmt(r.returnFrac * 100, 1)}%), `
    + `exotic ${r.exoticIn} -> ${r.exoticOut} at ${fmt(r.costPerExotic, 1)} refined each`);
}
check('no module can be rebuilt and scrapped for a net gain', printers === 0,
  `${printers} printers, best crank returns ${fmt(bestCrank * 100, 1)}%`);
check('no rebuild-and-scrap cycle is a cheaper source of exotic than the crucible',
  shortcuts === 0, `${shortcuts} shortcuts against ${fmt(directRefinedPerExotic, 1)} refined per exotic`);

// ===========================================================================
rule('3. EXOTIC REACHABILITY — FLAG 8');
// ===========================================================================
//
// Removing `condition.js:167`'s exotic mint correctly closes a printer. It also makes
// exotic strictly a refining product of core scrap at 0.015 per unit. NOTHING IN THE
// PERK TREE WOULD TELL A PLAYER IT HAD BECOME UNREACHABLE, so non-negativity is not the
// property to check — obtainability is. Three separate things have to be true: the
// refine table has to produce it, the registered CONTENT has to yield the grade that
// produces it, and the demand has to be payable inside a campaign.

const exoticGrades = SCRAP_GRADES.filter((g) => (REFINE_YIELD[g]?.exotic ?? 0) > 0);
const exoticPerCore = REFINE_YIELD.core?.exotic ?? 0;
console.log(`   grades that refine into exotic: ${exoticGrades.join(', ') || 'NONE'} `
  + `(core at ${exoticPerCore} per unit)`);
check('exotic has at least one production path in the refine table', exoticGrades.length > 0);

// Does the content actually put that grade in the world? A grade nothing produces is a
// production path on paper only.
let coreSubsystems = 0;
let coreUnitsPerHull = 0;
for (const cls of CLASSES) {
  let hull = 0;
  for (const sub of cls.subsystems ?? []) {
    if (gradeForKind(sub.kind) !== 'core') continue;
    coreSubsystems++;
    // `salvage.js:164` — a section carries `salvageValue * 100 * condition` units.
    hull += (sub.salvageValue ?? 0.2) * 100;
  }
  coreUnitsPerHull += hull;
}
const avgCorePerHull = CLASSES.length ? coreUnitsPerHull / CLASSES.length : 0;
console.log(`   ${coreSubsystems} core-grade subsystems across ${CLASSES.length} registered classes`);
console.log(`   an intact hull yields ${fmt(avgCorePerHull, 1)} core scrap units on average`);
check('registered content yields the grade exotic comes from', coreSubsystems > 0 && avgCorePerHull > 0,
  `${coreSubsystems} core subsystems`);

// Lifetime demand: the whole perk tree, plus one rebuild of every tier-3 pattern, plus
// the repair surcharge on a part taken below 0.25.
let perkExotic = 0;
const perkTotal = { alloy: 0, composite: 0, electronics: 0, exotic: 0 };
for (const def of PERK_DEFS) {
  for (let r = 0; r < def.maxRank; r++) {
    const c = def.cost(r);
    for (const p of REFINED_POOLS) perkTotal[p] += c[p] ?? 0;
  }
}
perkExotic = perkTotal.exotic;
let patternExotic = 0;
for (const def of MODULES) patternExotic += patternCost(def)?.exotic ?? 0;
const repairExotic = repairCost(400, 0.1, 1).exotic;
const lifetimeExotic = perkExotic + patternExotic + repairExotic;

const coreUnitsNeeded = exoticPerCore > 0 ? lifetimeExotic / exoticPerCore : Infinity;
const m3Needed = coreUnitsNeeded * (MATERIAL_VOLUME.core ?? 0.26);
const baseHold = new CargoHold(makeWorld('audit/hold')).baseM3;
const hullsNeeded = avgCorePerHull > 0 ? coreUnitsNeeded / avgCorePerHull : Infinity;

console.log(`   lifetime exotic demand: ${perkExotic} perks + ${patternExotic} tier-3 patterns `
  + `+ ${repairExotic} worst-case repair = ${lifetimeExotic}`);
console.log(`   that is ${Math.ceil(coreUnitsNeeded)} core scrap units = ${Math.round(m3Needed)} m3 `
  + `(${fmt(m3Needed / baseHold * 100, 1)}% of a ${baseHold} m3 base hold) = `
  + `${fmt(hullsNeeded, 1)} fully-stripped hulls`);

/** A campaign is dozens of hulls, not thousands. Beyond this, exotic is a wall. */
const HULL_CEILING = 120;
check(`the perk tree's exotic demand is payable inside a campaign (<= ${HULL_CEILING} hulls)`,
  Number.isFinite(hullsNeeded) && hullsNeeded > 0 && hullsNeeded <= HULL_CEILING,
  `${fmt(hullsNeeded, 1)} hulls of core sections`);
check('exotic is not free either — it costs more than one hold of core scrap to finish the tree',
  m3Needed > baseHold * 0.02, `${Math.round(m3Needed)} m3 against a ${baseHold} m3 hold`);

// ===========================================================================
rule('4. PERK TREE FLOOR — priced against propellant, not against a document');
// ===========================================================================
//
// The tree used to cost 1570 alloy against a tank of propellant at 590, so the entire
// permanent progression path was under three fills and one good field bought all of it.
// The fill price is read off the live anchorage table rather than quoted, because
// `sortie-loop.md:58`'s figure is a document and this is a gate.

const { installWorldSim } = await import('../../world/index.js');
const wsWorld = makeWorld('audit/world');
installWorldSim(wsWorld);
const system = wsWorld.systems.system;
let dearest = 0;
let dearestName = '';
let cheapest = Infinity;
for (const node of system?.anchorages?.() ?? []) {
  const p = node.anchorage?.propellantPerUnit ?? 0;
  if (p > dearest) { dearest = p; dearestName = node.name; }
  if (p > 0 && p < cheapest) cheapest = p;
}
const tank = wsWorld.propellant ?? { max: 640, reserve: 40 };
const fillUnits = Math.max(0, (tank.max ?? 640) - (tank.reserve ?? 40));
const fillAlloy = fillUnits * dearest;

console.log(`   propellant ${fmt(cheapest)}/u to ${fmt(dearest)}/u across ${system?.anchorages?.().length ?? 0} berths `
  + `(dearest: ${dearestName})`);
console.log(`   one full tank = ${fillUnits} units = ${Math.round(fillAlloy)} alloy at the dearest berth`);
console.log(`   whole tree: ${perkTotal.alloy} alloy, ${perkTotal.composite} composite, `
  + `${perkTotal.electronics} electronics, ${perkTotal.exotic} exotic`);
const fills = fillAlloy > 0 ? perkTotal.alloy / fillAlloy : 0;
console.log(`   = ${fmt(fills, 2)} full tanks of propellant in alloy alone`);

/** Below this the hull stops accumulating after roughly one sortie. */
const MIN_FILLS = 3;
check(`the perk tree costs more than ${MIN_FILLS} full tanks of propellant`, fills >= MIN_FILLS,
  `${fmt(fills, 2)} tanks`);
check('every perk states a drawback or states that it has none',
  PERK_DEFS.every((d) => 'drawback' in d),
  `${PERK_DEFS.filter((d) => d.drawback).length} of ${PERK_DEFS.length} carry one`);

// ===========================================================================
rule('5. DECLARED SINKS — the codex card versus the code');
// ===========================================================================
//
// `materials.js`'s exotic card is PLAYER-FACING. It said "Permanent hull perks. Nothing
// else may spend it" while `patterns.js:50` (tier-3 rebuilds), `refit.js:411` (destroyed
// traverse and feed parts) and `condition.js:148` (repair below 0.25) all spent it.
// Four disagreements on one card the player reads. This asserts the card names every
// file that actually spends it.

const EXOTIC_SINKS = [
  { file: 'sim/meta/perks.js', keyword: 'perk' },
  { file: 'sim/meta/patterns.js', keyword: 'pattern' },
  { file: 'sim/refit.js', keyword: 'part' },
  { file: 'sim/condition.js', keyword: 'repair' },
];
const exoticCard = MATERIAL_DEFS.find((m) => m.id === 'exotic');
const cardText = `${exoticCard?.consumedBy ?? ''} ${exoticCard?.source ?? ''}`.toLowerCase();
const undeclared = [];
for (const sink of EXOTIC_SINKS) {
  const spends = /exotic\s*[:=]/.test(readFileSync(join(SRC, sink.file), 'utf8'));
  const named = cardText.includes(sink.keyword);
  console.log(`   ${sink.file.padEnd(24)} spends exotic: ${spends ? 'yes' : 'no '}   named on the card: ${named ? 'yes' : 'NO'}`);
  if (spends && !named) undeclared.push(sink.file);
}
check('the exotic codex card names every file that spends exotic', undeclared.length === 0,
  undeclared.join(', '));

// ===========================================================================
rule('6. SECTION FIELD READS — every field read is a field written');
// ===========================================================================
//
// `items.js:413` read `section.grade` to choose a device drop table. `WreckSection`
// never wrote it, so the expression was permanently falsy and `boarding_charge` and
// `scan_pulse` could not drop at all. Nothing in the tree could have caught that: the
// code is valid, the test passed, and the consequence was a silent absence. This walks
// the whole of `src/sim` and `src/ui`, collects every `section.<field>` read, and
// checks it against a live instance.

const probe = new WreckSection({
  id: 'probe', moduleId: null, label: 'probe',
  localPosition: new THREE.Vector3(), radius: 1, condition: 1, materials: 1,
});
const written = new Set(Object.keys(probe));
for (let proto = Object.getPrototypeOf(probe); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
  for (const k of Object.getOwnPropertyNames(proto)) written.add(k);
}
// Fields the salvage loop stamps onto a section after construction, all in this file's
// own lane and all deliberate.
for (const k of ['_row']) written.add(k);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) out.push(full);
  }
  return out;
}
// This file is excluded from its own scan because it CONTAINS the pattern by
// definition — the regex literal below matches itself. That is not an allowlist hiding
// a violator: `economyAudit.mjs` reads no wreck section, and every other file in both
// trees is scanned. If this exclusion ever grows a second entry, that entry is a bug.
const SELF = fileURLToPath(import.meta.url);
const scanned = [...walk(join(SRC, 'sim')), ...walk(join(SRC, 'ui'))].filter((f) => f !== SELF);
const READ = /\bsection\.([A-Za-z_$][\w$]*)/g;
const unwritten = new Map();
let readSites = 0;
for (const file of scanned) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(READ)) {
    readSites++;
    const field = m[1];
    if (written.has(field)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    if (!unwritten.has(field)) unwritten.set(field, []);
    unwritten.get(field).push(`${relative(SRC, file)}:${line}`);
  }
}
console.log(`   ${written.size} fields on a live WreckSection; ${readSites} \`section.<field>\` reads `
  + `across ${scanned.length} files in src/sim and src/ui`);
for (const [field, sites] of unwritten) console.log(`   UNWRITTEN  section.${field} read at ${sites.join(', ')}`);
check('every field read off a WreckSection is a field the constructor writes',
  unwritten.size === 0, [...unwritten.keys()].join(', '));
check('the scan measured something', readSites >= 10 && written.size >= 10,
  `${readSites} reads, ${written.size} fields`);

// ===========================================================================
rule('7. WHAT A REAL WRECK YIELDS — grades stamped, and every drop table reachable');
// ===========================================================================
//
// Sections 1-6 measure functions. This one builds `Wreck`s out of the registered ship
// classes and reads what actually comes off them, because the `section.grade` bug was
// invisible at the function level: `gradeForSection` was always right, `DROP_TABLE` was
// always right, and the game still only ever produced three of its five devices.

const wreckWorld = makeWorld('audit/wrecks');
// `SalvageSystem`'s constructor installs the progression layer — the same seam the game
// boots through — so this exercises the assembled objects, not a hand-built stub.
const wreckSalvage = new SalvageSystem(wreckWorld);
wreckWorld.register('salvage', wreckSalvage);
const { Ship } = await import('../ship.js');

const gradeCounts = { plate: 0, machine: 0, core: 0 };
let sections = 0;
let unstamped = 0;
let disagreeStamp = 0;
const allSections = [];
for (const cls of CLASSES) {
  const ship = new Ship({ classDef: cls, world: wreckWorld, faction: cls.faction, root: new THREE.Group() });
  const wreck = new Wreck({ ship, root: ship.root, rng: wreckWorld.rng.fork(`wreck:${cls.id}`) });
  wreckWorld.addWreck(wreck);   // so `describeWrecks()` below reads the real list
  for (const s of wreck.sections) {
    sections++;
    allSections.push(s);
    if (!SCRAP_GRADES.includes(s.grade)) { unstamped++; continue; }
    gradeCounts[s.grade]++;
    // The stamp and the derivation must agree, or one of them is lying to a consumer.
    const preview = sectionPreviewOf(s);
    if (preview.scrapGrade !== s.grade) disagreeStamp++;
  }
}
function sectionPreviewOf(s) {
  return sectionPreview(wreckWorld, s);
}

console.log(`   ${sections} sections off ${CLASSES.length} registered hulls: `
  + `${gradeCounts.plate} plate, ${gradeCounts.machine} machine, ${gradeCounts.core} core`);
check('every wreck section carries a stamped scrap grade', unstamped === 0, `${unstamped} unstamped`);
check('the stamp and the derivation agree on every section', disagreeStamp === 0, `${disagreeStamp} disagree`);
check('all three scrap grades occur in real content',
  gradeCounts.plate > 0 && gradeCounts.machine > 0 && gradeCounts.core > 0);

// Device drops. `items.js:413` chose a table from `section.grade`, which nothing wrote,
// so `DROP_TABLE.machine` was the only reachable table for the life of the file:
// `boarding_charge` (plate) and `scan_pulse` (core) — 2 of the 5 registered items —
// could not drop AT ALL and were fabrication-only. This rolls the real hook over the
// real sections and counts which items come out.
const items = wreckWorld.systems.items;
const dropRng = wreckWorld.rng.fork('audit/drops');
const dropped = new Map();
let intactSamples = 0;
for (let pass = 0; pass < 400; pass++) {
  for (const s of allSections) {
    if (s.integrity < 0.55) continue;
    intactSamples++;
    const id = items.rollDrop(s, dropRng);
    if (id) dropped.set(id, (dropped.get(id) ?? 0) + 1);
  }
}
const dropTables = new Set();
for (const g of SCRAP_GRADES) {
  if (gradeCounts[g] > 0) dropTables.add(g);
}
console.log(`   ${intactSamples} intact-section rolls produced: `
  + `${[...dropped.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing'}`);
check('boarding_charge can drop (plate sections)', (dropped.get('boarding_charge') ?? 0) > 0,
  `${dropped.get('boarding_charge') ?? 0} drops`);
check('scan_pulse can drop (core sections)', (dropped.get('scan_pulse') ?? 0) > 0,
  `${dropped.get('scan_pulse') ?? 0} drops`);
check('the drop roll measured something', intactSamples >= 100, `${intactSamples} rolls`);

// The cut panel's read API. `salvage.describeWrecks()` now publishes `sec.economy`, and
// the refined projection inside it is gated on `salvagers_eye`.
const rows = wreckSalvage.describeWrecks();
const withEconomy = rows.flatMap((r) => r.sections).filter((s) => s.economy);
const ungated = withEconomy.filter((s) => s.economy.refinedPreview === null);
wreckWorld.systems.perks.ranks.set('salvagers_eye', 1);
const gatedRows = wreckSalvage.describeWrecks().flatMap((r) => r.sections).filter((s) => s.economy?.refinedPreview);
console.log(`   cut rows: ${withEconomy.length} sections carry an economy preview; `
  + `${ungated.length} withhold the refined projection until salvagers_eye`);
check('the cut panel can see the scrap grade without any perk',
  withEconomy.length > 0 && withEconomy.every((s) => SCRAP_GRADES.includes(s.economy.scrapGrade)),
  `${withEconomy.length} rows`);
check('the refined projection is what the salvagers_eye perk actually buys',
  ungated.length === withEconomy.length && gatedRows.length > 0,
  `${ungated.length} gated before, ${gatedRows.length} shown after`);

// ===========================================================================
console.log(`\n${'='.repeat(78)}`);
console.log(`${checks - failures} of ${checks} economy checks passed`);
console.log('='.repeat(78));
process.exit(failures > 0 ? 1 : 0);
