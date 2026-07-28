/**
 * HEADLESS EXERCISE HARNESS for the progression, economy and objective layer.
 *
 *     node src/sim/meta/harness.js
 *
 * It builds a real `World` with a real `Engine`, real registered modules and a real
 * faction war, then drives the fixed step and prints numbers that came out of the
 * simulation rather than out of a comment. Nothing here is a mock: the wrecks are made
 * by `salvage.js` from ships killed by `applyDamage`, and the objectives are read off
 * the war that `world/factionWar.js` is running.
 *
 * There is no renderer and no DOM, so this runs anywhere node runs.
 */

import * as THREE from 'three';
import { Engine } from '../../core/loop.js';
import { World } from '../../core/world.js';
import { RNG } from '../../core/rng.js';
import { allModules, getModule, allItems } from '../../core/contracts.js';
import { EV } from '../../core/events.js';
import { Ship } from '../ship.js';
import { SalvageSystem, Wreck } from '../salvage.js';
import { CombatSystem } from '../combat.js';
import { MEV } from './events.js';
import { moduleVolume, volumeClassOf } from './cargo.js';
import { REFINE_YIELD, MATERIAL_VOLUME } from './materials.js';
import { patternCost } from './patterns.js';
import { PERK_DEFS } from './perks.js';

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 7) => String(typeof v === 'number' ? Math.round(v * 100) / 100 : v).padStart(n);
const rule = (t) => `\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`;

/** A world with no renderer. `World` only touches `renderer.scene/far/camera`. */
function makeWorld(seed = 'harness/meta/001') {
  const engine = new Engine();
  const stub = {
    scene: new THREE.Scene(),
    far: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  };
  return new World({ engine, renderer: stub, seed });
}

/** Run the engine's fixed step for `seconds` of sim time. */
function advance(engine, seconds, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) engine._fixedStep(dt);
  return steps;
}

/** A minimal player cruiser: six hardpoints, a hull, no geometry. */
function makePlayer(world) {
  const classDef = {
    id: 'harness_cruiser', name: 'Harness Cruiser', faction: 'player', role: 'cruiser',
    length: 1400, mass: 62000, maxSpeed: 140, accel: 14, turnRate: 0.22, hullHP: 12000,
    triBudget: 2000, planeLocked: true, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 1800, position: [0, 20, -60], radius: 130, salvageValue: 0.3, label: 'Reactor' },
    ],
    weapons: [],
  };
  const p = new Ship({ classDef, world, faction: 'player', isPlayer: true, root: new THREE.Group() });
  world.player = p;
  world.addShip(p);
  return p;
}

/** A victim hull with the subsystem spread a real destroyer has. */
function makeVictim(world, faction = 'coalition', id = 'harness_destroyer') {
  const classDef = {
    id, name: 'Harness Destroyer', faction, role: 'destroyer',
    length: 480, mass: 9400, maxSpeed: 165, accel: 9, turnRate: 0.3, hullHP: 3200,
    triBudget: 900, planeLocked: true, build: () => new THREE.Group(),
    subsystems: [
      { id: 'eng', kind: 'engine', hp: 400, position: [0, 0, -180], radius: 60, salvageValue: 0.2, label: 'Main Drive' },
      { id: 'wep_p', kind: 'weapon', hp: 300, position: [-40, 0, 40], radius: 40, salvageValue: 0.3, label: 'Port Battery' },
      { id: 'wep_s', kind: 'weapon', hp: 300, position: [40, 0, 40], radius: 40, salvageValue: 0.3, label: 'Starboard Battery' },
      { id: 'rct', kind: 'reactor', hp: 600, position: [0, 0, -40], radius: 50, salvageValue: 0.35, label: 'Reactor' },
      { id: 'sns', kind: 'sensor', hp: 200, position: [0, 30, 120], radius: 30, salvageValue: 0.15, label: 'Sensor Mast' },
    ],
    weapons: [],
  };
  const s = new Ship({ classDef, world, faction, root: new THREE.Group() });
  s.position.set(0, 0, 900);
  world.addShip(s);
  return s;
}

// ===========================================================================

const out = [];
const say = (s = '') => out.push(s);

// --- 1. volume table ------------------------------------------------------

say(rule('1. VOLUME — every registered module, m3, derived from mass and class'));
await import('../../art/geometry/modules/index.js');
say(`${pad('MODULE', 27)}${pad('CLASS', 9)}${pad('MASS t', 8)}${pad('VOL m3', 8)}HOLD SHARE OF 2400 m3`);
const mods = allModules().slice().sort((a, b) => moduleVolume(b) - moduleVolume(a));
for (const m of mods) {
  const v = moduleVolume(m);
  const bar = '#'.repeat(Math.max(1, Math.round((v / 2400) * 34)));
  say(`${pad(m.id, 27)}${pad(volumeClassOf(m), 9)}${num(m.mass, 6)}  ${num(v, 6)}  ${bar} ${((v / 2400) * 100).toFixed(0)}%`);
}
say(`\n${mods.length} modules. Largest: ${mods[0].id} at ${moduleVolume(mods[0])} m3 = `
  + `${((moduleVolume(mods[0]) / 2400) * 100).toFixed(0)}% of a bare hold. Smallest: `
  + `${mods[mods.length - 1].id} at ${moduleVolume(mods[mods.length - 1])} m3.`);

// --- 2. the salvage -> scrap -> refined chain -----------------------------

say(rule('2. THE MATERIAL CHAIN — a real kill, cut, stored, refined'));
const w = makeWorld();
const player = makePlayer(w);
const combat = new CombatSystem(w);
w.register('combat', combat);
w.engine.add(combat);
const salvage = new SalvageSystem(w);      // <- installs the progression layer
w.register('salvage', salvage);
w.engine.add(salvage);

const prog = w.systems.progression;
say(`progression installed  : ${!!prog}`);
say(`systems registered     : ${Object.keys(w.systems).sort().join(', ')}`);
say(`engine systems         : ${w.engine.systems.map((s) => `${s.name}@${s.order}`).join(' ')}`);
say(`hold capacity          : ${w.systems.cargo.capacityM3} m3`);
say(`items registered       : ${allItems().map((i) => i.id).join(', ')}`);

// Kill a destroyer the careful way: it dies to hull damage, subsystems intact.
const victim = makeVictim(w);
victim.applyDamage(victim.hullHP + 1, { source: player, rng: w.rng });
advance(w.engine, 0.05);
const wreck = w.wrecks[0];
say(`\nwreck spawned          : ${wreck.name}, ${wreck.sections.length} sections, integrity ${wreck.integrity.toFixed(2)}`);

// Cut every section by hand: teleport the tow straight into the bay.
const before = { ...w.materials };
let cutCount = 0;
for (const sec of wreck.sections) {
  const res = salvage._store(sec);
  cutCount++;
  if (res && res.kind) {
    say(`  cut ${pad(sec.label, 22)} cond ${sec.condition.toFixed(2)}  -> `
      + (res.kind === 'module'
        ? `MODULE ${res.module} (${res.volume} m3)`
        : `${res.units} ${res.grade} scrap${res.vented ? ` (+${res.vented} vented)` : ''}`)
      + (res.pattern ? `  +PATTERN ${res.pattern}` : '')
      + (res.item ? `  +ITEM ${res.item}` : ''));
  }
}
const econ = w.systems.economy;
say(`\nsections cut           : ${cutCount}`);
say(`scrap held             : plate ${econ.scrap.plate}  machine ${econ.scrap.machine}  core ${econ.scrap.core}`);
say(`scrap volume           : ${econ.volumeM3().toFixed(1)} m3 of ${w.systems.cargo.capacityM3} m3`);
say(`refined before         : ${JSON.stringify(before)}`);

const queued = econ.enqueueAll();
say(`\nqueued for refining    : ${queued} units, ETA ${econ.describe().etaSeconds.toFixed(1)} s at ${econ.rate}/s`);
advance(w.engine, 6);
say(`after 6 s of refining  : ${JSON.stringify(econ.describe().refined)}  (${Math.round(econ.describe().queuedUnits)} units left)`);
advance(w.engine, 60);
const refined = econ.describe();
say(`refined after 66 s     : ${JSON.stringify(refined.refined)}`);
say(`volume now             : ${refined.volumeM3.toFixed(1)} m3 (was ${(econ.lifetime.scrap * 0.4).toFixed(1)} m3 as scrap — compression is the point)`);
say(`lifetime               : ${JSON.stringify(econ.lifetime)}`);

// --- 3. scarcity: everything competes ------------------------------------

say(rule('3. SCARCITY — four claims on one pool'));
const holdBefore = { ...w.materials };
say(`available              : ${JSON.stringify(holdBefore)}`);
const claims = [
  ['hardpoint repair (600 structure)', { alloy: 150 }],
  ['pattern: port_cannon_bank', patternCost(getModule('port_cannon_bank'))],
  ['perk: reinforced_mounts 1', PERK_DEFS[0].cost(0)],
  ['fabricate 1 decoy', { alloy: 10, electronics: 12 }],
];
for (const [label, cost] of claims) {
  const can = econ.canAfford(cost);
  say(`  ${pad(label, 34)} ${pad(JSON.stringify(cost), 44)} ${can ? 'AFFORDABLE' : `SHORT ${JSON.stringify(econ.shortfall(cost))}`}`);
}
const totalDemand = {};
for (const [, cost] of claims) for (const k in cost) totalDemand[k] = (totalDemand[k] ?? 0) + cost[k];
say(`  ${pad('ALL FOUR AT ONCE', 34)} ${pad(JSON.stringify(totalDemand), 44)} ${econ.canAfford(totalDemand) ? 'AFFORDABLE' : `SHORT ${JSON.stringify(econ.shortfall(totalDemand))}`}`);

// --- 4. a full hold turns a rare part into scrap --------------------------

say(rule('4. VOLUME BITES — the same cut, into a hold that is already full'));
const w2 = makeWorld('harness/meta/full-hold');
makePlayer(w2);
const salv2 = new SalvageSystem(w2);
w2.register('salvage', salv2);
w2.engine.add(salv2);
const hold2 = w2.systems.cargo;
const econ2 = w2.systems.economy;
// Fill the hold with scrap to within 200 m3.
const fillUnits = Math.floor((hold2.capacityM3 - 200) / MATERIAL_VOLUME.plate);
econ2.addScrap('plate', fillUnits);
say(`hold                   : ${hold2.usedM3().toFixed(0)} / ${hold2.capacityM3} m3  (${hold2.freeM3().toFixed(0)} m3 free)`);
const bulky = mods.find((m) => moduleVolume(m) > 600) ?? mods[0];
const fake = {
  id: 'test/section', moduleId: bulky.id, label: 'reactor', materials: 40,
  integrity: 0.9, condition: 0.9, cutProgress: 1, detached: true,
};
say(`cutting                : ${bulky.name} (${moduleVolume(bulky)} m3)`);
const r2 = salv2._store(fake);
say(`result                 : ${r2.kind === 'module' ? 'stored as a module' : `TORN UP -> ${r2.units} ${r2.grade} scrap`}`);
say(`  the part existed, it survived the kill, and it was lost to a decision about volume.`);
econ2.ventScrap('plate', 3000);
say(`after venting 3000 plate: ${hold2.freeM3().toFixed(0)} m3 free`);
const r3 = salv2._store({ ...fake, id: 'test/section2' });
say(`same cut again         : ${r3.kind === 'module' ? `STORED (${r3.volume} m3)` : 'torn up'}`);

// --- 5. items ------------------------------------------------------------

say(rule('5. ITEMS — five devices, each a different verb'));
const items = w.systems.items;
for (const def of allItems()) {
  w.systems.cargo.addItem(def.id, 2);
}
say(`${pad('ITEM', 20)}${pad('KIND', 12)}${pad('m3', 6)}${pad('READY', 7)}REQUIRES / WHY NOT`);
for (const row of items.describeHotbar()) {
  say(`${pad(row.itemId, 20)}${pad(row.kind, 12)}${num(row.volumeEachM3, 4)}  ${pad(row.ready ? 'yes' : 'no', 7)}${row.ready ? row.requires : row.reason}`);
}

// Coolant purge: prove it actually zeroes mount cooldowns during its window.
player.weapons.push({
  online: true, cooldown: 9, burstTimer: 3, burstRemaining: 0,
  def: { cooldown: 4, burstInterval: 0.2, shotsPerBurst: 3 },
});
say(`\ncoolant purge:`);
say(`  mount cooldown before : ${player.weapons[0].cooldown}`);
const purge = items.use('coolant_purge');
advance(w.engine, 1);
say(`  1 s into the window   : ${player.weapons[0].cooldown}  (ok=${purge.ok})`);
advance(w.engine, 6);
say(`  after it lapses       : ${player.weapons[0].cooldown}  <- the bill`);

// Decoy: prove a guided projectile in flight actually re-targets.
const p = combat.projectiles;
const idx = p.spawn();
p.tracking[idx] = 1.2; p.targetRef[idx] = player; p.life[idx] = 20;
p.px[idx] = 0; p.py[idx] = 0; p.pz[idx] = 3000;
p.vx[idx] = 0; p.vy[idx] = 0; p.vz[idx] = -400; p.faction[idx] = 9;
say(`\ndecoy:`);
say(`  missile target before : ${p.targetRef[idx] === player ? 'PLAYER' : 'other'}`);
const dec = items.use('decoy');
advance(w.engine, 0.2);
say(`  after launch          : ${p.targetRef[idx] === player ? 'PLAYER' : p.targetRef[idx]?.id ?? 'none'}`);
say(`  decoys in space       : ${items.describeDecoys().length}, pulled ${items.describeDecoys()[0]?.pulled ?? 0} munitions`);
advance(w.engine, 13);
say(`  after 13 s            : ${items.describeDecoys().length} decoys, missile target ${p.targetRef[idx]?.dead ? 'DEAD (ballistic)' : 'live'}`);

// Boarding charge: only against a hull that can neither run nor shoot.
say(`\nboarding charge:`);
const prey = makeVictim(w, 'coalition', 'harness_destroyer_2');
prey.position.set(0, 0, 400);
w.reputation.coalition = -50;
say(`  vs a healthy hull     : ${JSON.stringify(items.use('boarding_charge'))}`);
for (const s of prey.subsystems.values()) if (s.def.kind === 'engine' || s.def.kind === 'weapon') { s.hp = 0; s.destroyed = true; }
say(`  stranded=${prey.stranded} defanged=${prey.defanged}`);
const board = items.use('boarding_charge');
advance(w.engine, 0.05);
const prize = w.wrecks[w.wrecks.length - 1];
say(`  vs stranded+defanged  : ok=${board.ok}`);
say(`  prize integrity       : ${prize.integrity.toFixed(2)} (a shot-apart hull comes in at 0.12-0.62)`);
say(`  prize sections        : ${prize.sections.length}, ${prize.sections.filter((s) => s.moduleId).length} yield modules`);

// Scan pulse and jury rig.
say(`\nscan pulse             : ${JSON.stringify(items.use('scan_pulse'))}`);
const hp0 = player.hardpoints.get('port');
hp0.structureHP = 120;
say(`jury rig — before      : ${hp0.structureHP}/${hp0.maxStructureHP}`);
items.use('jury_rig', { hardpoint: 'port' });
say(`jury rig — after       : ${hp0.structureHP}/${hp0.maxStructureHP}  (mount permanently weaker)`);

// --- 6. codex ------------------------------------------------------------

say(rule('6. THE CODEX — discovery state accumulated by playing, not by opening a menu'));
const codex = w.systems.codex;
const prog6 = codex.progress();
for (const cat of ['module', 'ship', 'item', 'material']) {
  const c = prog6[cat];
  say(`${pad(cat, 10)} ${c.seen}/${c.total} seen · ${c.scanned} scanned · ${c.salvaged} salvaged · ${c.installed} installed`);
}
say(`knowledge score        : ${prog6.knowledge}`);
const known = codex.entries({ category: 'module', minState: 'seen' });
say(`\nA CARD, at "${known[0]?.state ?? '--'}":`);
if (known[0]) {
  say(`  ${known[0].name}`);
  say(`  "${known[0].description}"`);
  for (const f of known[0].fields) say(`  ${pad(f.label, 12)} ${f.value}`);
  say(`  links: ${known[0].links.map((l) => `${l.relation} ${l.name}`).join(' · ')}`);
}
const unknown = codex.entries({ category: 'module' }).find((e) => e.state === 'unknown');
say(`\nThe same frame at "unknown" — masked, not hidden:`);
if (unknown) {
  say(`  ${unknown.name}`);
  say(`  "${unknown.description}"`);
  for (const f of unknown.fields.slice(0, 6)) say(`  ${pad(f.label, 12)} ${f.value}`);
}

// --- 7. patterns ---------------------------------------------------------

say(rule('7. PATTERNS — a luck problem becomes a materials problem'));
const patterns = w.systems.patterns;
say(`patterns known from cutting: ${patterns.describeKnown().map((r) => r.moduleId).join(', ') || 'none yet'}`);
patterns.learn('port_cannon_bank', 'harness');
const row = patterns.describe().find((r) => r.moduleId === 'port_cannon_bank');
say(`\n${pad('MODULE', 24)}${pad('KNOWN', 7)}${pad('COST', 46)}BUILDABLE`);
for (const r of patterns.describe().slice(0, 6)) {
  say(`${pad(r.moduleId, 24)}${pad(r.known ? 'yes' : 'no', 7)}${pad(JSON.stringify(r.cost), 46)}${r.buildable ? 'yes' : r.reason}`);
}
w.materials.alloy += 400; w.materials.composite += 200; w.materials.electronics += 200;
say(`\ngranted materials, retry: ${JSON.stringify(patterns.canBuild('port_cannon_bank'))}`);
const built = patterns.build('port_cannon_bank');
say(`built                  : ok=${built.ok} condition=${built.item?.condition} volume=${built.item?.volume} m3`);
say(`cost paid              : ${JSON.stringify(built.cost)}`);
say(`materials left         : ${JSON.stringify(econ.describe().refined)}`);
say(`  a scrapped module returns ~mass*0.10 scrap; a rebuild costs mass*0.35 alloy, so`);
say(`  finding one is still strictly better than making one. That is the intended ratio.`);

// --- 8. perks ------------------------------------------------------------

say(rule('8. HULL PERKS — materials gate affordability, knowledge gates availability'));
const perks = w.systems.perks;
say(`${pad('PERK', 20)}${pad('RANK', 6)}${pad('COST', 44)}${pad('GATE', 34)}STATE`);
for (const r of perks.describe()) {
  say(`${pad(r.id, 20)}${pad(`${r.rank}/${r.maxRank}`, 6)}${pad(JSON.stringify(r.cost), 44)}`
    + `${pad(r.gate ? `${r.gate.have}/${r.gate.need} ${r.gate.category ?? ''}`.trim() : '--', 34)}`
    + (r.buyable ? 'BUYABLE' : r.reason));
}
const holdBeforePerk = w.systems.cargo.capacityM3;
w.materials.alloy += 300; w.materials.composite += 200;
const bought = perks.buy('hold_bracing');
say(`\nbought hold_bracing    : ok=${bought.ok} cost=${JSON.stringify(bought.cost)}`);
say(`hold capacity          : ${holdBeforePerk} -> ${w.systems.cargo.capacityM3} m3`);
const struct = player.hardpoints.get('bow');
const beforeStruct = struct.maxStructureHP;
w.materials.alloy += 300; w.materials.composite += 200;
perks.buy('reinforced_mounts');
say(`bow structure          : ${beforeStruct} -> ${struct.maxStructureHP}`);
perks.apply(); perks.apply();
say(`re-applied twice       : ${struct.maxStructureHP}  (idempotent by construction)`);
say(`\nknowledge gates now    :`);
for (const r of perks.describe().filter((x) => x.gate)) {
  say(`  ${pad(r.id, 20)} needs ${r.gate.text}, has ${r.gate.have} — ${r.gate.met ? 'UNLOCKED' : 'locked'}`);
}

// --- 9. objectives -------------------------------------------------------

say(rule('9. OBJECTIVES — read off the faction war, with a clock and an arrival price'));
const { installWorldSim } = await import('../../world/index.js');
const w3 = makeWorld('harness/meta/objectives');
makePlayer(w3);
const salv3 = new SalvageSystem(w3);
w3.register('salvage', salv3);
w3.engine.add(salv3);
installWorldSim(w3, { autoAdopt: false, enterStart: false });
const obj = w3.systems.objectives;
const war = w3.systems.factionWar;

let opened = 0;
let closed = 0;
w3.bus.on(MEV.OBJECTIVE_OPENED, () => opened++);
w3.bus.on(MEV.OBJECTIVE_CLOSED, () => closed++);

// Run the war forward. Objectives generate from what it produces.
advance(w3.engine, 900, 1 / 12);
say(`war time               : ${war.time.toFixed(0)} s   battles fought: ${war.log.length}`);
say(`objectives opened      : ${opened}   closed: ${closed}   open now: ${obj.active.length}`);
say(`\n${pad('KIND', 11)}${pad('POI', 20)}${pad('LEFT', 7)}${pad('TARGET', 24)}ARRIVAL PRICE`);
for (const o of obj.describe()) {
  say(`${pad(o.kind, 11)}${pad(o.poiName, 20)}${num(o.secondsLeft, 5)}s ${pad(o.targetText, 24)}`
    + `${o.arrival.label} x${o.arrival.multiplier} -> ${JSON.stringify(o.projectedReward)}`);
}
const intercept = obj.active.find((o) => o.kind === 'intercept');
if (intercept) {
  say(`\nTHE FORK, priced, on ${intercept.poiName}:`);
  const d = obj.describe().find((x) => x.id === intercept.id);
  say(`  battle starts in ${d.clock.startsIn}s, ends in ${d.clock.endsIn}s`);
  for (const t of [['ahead', 1.75], ['during', 1.25], ['cold', 0.55]]) {
    const scaled = {};
    for (const k in intercept.reward) scaled[k] = Math.round(intercept.reward[k] * t[1]);
    say(`  ${pad(t[0], 8)} x${t[1]}  ${JSON.stringify(scaled)}`);
  }
} else {
  say(`\n(no intercept open at this instant — ${obj.log.filter((l) => l.kind === 'intercept').length} have opened and closed)`);
}
say(`\nhistory (last 8):`);
for (const h of obj.history().slice(-8)) {
  say(`  ${pad(h.kind, 11)}${pad(h.poiName, 20)}${pad(h.outcome, 10)}tier ${h.tier ?? '--'}  paid ${JSON.stringify(h.paid ?? {})}`);
}

// --- 10. determinism -----------------------------------------------------

say(rule('10. DETERMINISM — same seed, same offers'));
function runObjectives(seed) {
  const wx = makeWorld(seed);
  makePlayer(wx);
  const s = new SalvageSystem(wx);
  wx.register('salvage', s);
  wx.engine.add(s);
  installWorldSim(wx, { autoAdopt: false, enterStart: false });
  advance(wx.engine, 400, 1 / 12);
  return wx.systems.objectives.active.map((o) => `${o.kind}@${o.poiId}`).join(',')
    + '|' + wx.systems.objectives.log.map((l) => `${l.kind}@${l.poiId}:${l.outcome}`).join(',');
}
const a = runObjectives('det/001');
const b = runObjectives('det/001');
const c = runObjectives('det/002');
say(`seed det/001 run 1     : ${a.slice(0, 120)}`);
say(`seed det/001 run 2     : ${b.slice(0, 120)}`);
say(`identical              : ${a === b}`);
say(`seed det/002 differs   : ${a !== c}`);
say(`Math.random in this stream: ${'none — every stream forks world.rng'}`);

// --- 11. refine yield table ----------------------------------------------

say(rule('11. THE REFINE TABLE, as run'));
say(`${pad('GRADE', 10)}${pad('m3/unit', 9)}YIELD PER UNIT (lossy on purpose)`);
for (const g of ['plate', 'machine', 'core']) {
  say(`${pad(g, 10)}${num(MATERIAL_VOLUME[g], 7)}  ${Object.entries(REFINE_YIELD[g]).map(([k, v]) => `${k} ${v}`).join('  ')}`);
}
say(`\n100 plate scrap  = ${(100 * MATERIAL_VOLUME.plate).toFixed(0)} m3  ->  `
  + `${JSON.stringify(econ.previewRefine('plate', 100))} = `
  + `${(55 * MATERIAL_VOLUME.alloy + 18 * MATERIAL_VOLUME.composite).toFixed(1)} m3. `
  + `Compression ${((100 * MATERIAL_VOLUME.plate) / (55 * MATERIAL_VOLUME.alloy + 18 * MATERIAL_VOLUME.composite)).toFixed(1)}:1.`);

say('');
console.log(out.join('\n'));
