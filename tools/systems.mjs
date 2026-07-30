/**
 * THE SYSTEMS BUDGET, MEASURED.
 *
 *     node tools/systems.mjs
 *
 * Headless. No browser, no GPU, no server. Everything below runs on the real
 * `PowerPlant`, the real `ShipThermal`, the real `SalvageSystem`, the real `ShipAI` and
 * the real registered modules, at the real `SIM.dt`.
 *
 * It exists because of one sentence in a critic's report that the shipped code agreed
 * with: "power.js normalises the four channels to sum to 1, so there is always 100% of
 * something and never a slot you must leave dark." Four sliders that always add to 100%
 * are a SPLIT. A budget needs a demand side that can exceed supply. Sections 1 and 2
 * below are the arithmetic that says whether this build has one, on the real registry
 * rather than on a fixture invented to make the number come out.
 *
 * WHAT EACH SECTION IS FOR:
 *
 *   1  DEMAND      the fit publishes a per-channel bill, and on a fought-out cruiser
 *                  it exceeds the reactor. There is a channel you must starve.
 *   2  REACTOR     damage to the reactor moves something the player can feel. It did
 *                  not before: `factor()` was a ratio of shares and never read capacity.
 *   3  PRESSURE    the AI reads heat, stores and power off the hull it is shooting at,
 *                  and changes what it does. A grep for those words in `src/sim/ai/`
 *                  used to return nothing at all.
 *   4  VERBS       every verb the systems declare has a caller in the input layer.
 *                  This is a SOURCE scan, because that is the only kind of check that
 *                  catches a method with no caller — the defect it exists for was two
 *                  fully implemented verbs the player could not reach.
 *   5  SAVE        the hull survives a save/load round trip as an absolute.
 *
 * Exits non-zero on any failure.
 */

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Engine } from '../src/core/loop.js';
import { World } from '../src/core/world.js';
import { Ship, WeaponMount } from '../src/sim/ship.js';
import { CombatSystem } from '../src/sim/combat.js';
import { SalvageSystem, Wreck } from '../src/sim/salvage.js';
import { ShipAISystem } from '../src/sim/ai/shipAI.js';
import { readSystems, makeSystemsRead, aimFor, routeFor, biasFor, AI_OVERROUTE } from '../src/sim/ai/pressure.js';
import { PowerPlant, DEMAND, installDefaultPresets, powerReport } from '../src/sim/power.js';
import { THERMAL } from '../src/sim/heat.js';
import { SIM } from '../src/core/units.js';
import { EV } from '../src/core/events.js';
import { POWER_CHANNELS, registerShipClass, getShipClass, getModule } from '../src/core/contracts.js';
import { captureSave, applySave, memoryStorage, PersistenceSystem } from '../src/core/persistence.js';
import { CRUISER_HARDPOINTS } from '../src/art/geometry/hardpoints.js';
// Registering the real modules is what makes section 1 a measurement of the shipped
// registry instead of a measurement of this file's imagination.
import '../src/art/geometry/modules/index.js';

const DT = SIM.dt;
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

let passed = 0;
let failed = 0;

const rule = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);
const f = (v, dp = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : String(v));

function check(ok, name, evidence) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (evidence) console.log(`        ${evidence}`);
}

// ---------------------------------------------------------------------------
// fixture
// ---------------------------------------------------------------------------

const HP = new Map(CRUISER_HARDPOINTS.map((h) => [h.id, h]));

function defineClasses() {
  if (getShipClass('sys_cruiser')) return;
  registerShipClass({
    id: 'sys_cruiser', name: 'Systems Test Cruiser', faction: 'player', role: 'cruiser',
    length: 1400, mass: 62000, maxSpeed: 140, accel: 14, turnRate: 0.22, hullHP: 12000,
    triBudget: 2000, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 1800, position: [0, 0, -60], radius: 130, salvageValue: 0.3, label: 'REACTOR' },
      { id: 'engine_main', kind: 'engine', hp: 1400, position: [0, 0, -560], radius: 150, salvageValue: 0.2, label: 'DRIVE' },
      { id: 'battery_p', kind: 'weapon', hp: 900, position: [-48, 5, 120], radius: 80, salvageValue: 0.3, label: 'PORT BATTERY' },
    ],
    weapons: [],
  });
  registerShipClass({
    id: 'sys_frigate', name: 'Systems Test Frigate', faction: 'coalition', role: 'frigate',
    length: 480, mass: 9400, maxSpeed: 165, accel: 9, turnRate: 0.3, hullHP: 3200,
    triBudget: 1200, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 900, position: [0, 0, -40], radius: 40, salvageValue: 0.3, label: 'REACTOR' },
      { id: 'engine_main', kind: 'engine', hp: 700, position: [0, 0, -160], radius: 44, salvageValue: 0.2, label: 'DRIVE' },
      { id: 'battery', kind: 'weapon', hp: 600, position: [0, 0, 40], radius: 40, salvageValue: 0.3, label: 'BATTERY' },
    ],
    weapons: [{
      id: 'sys_npc_cannon', name: 'NPC Cannon', type: 'cannon', range: 5200, damage: 40,
      shotsPerBurst: 3, burstInterval: 0.2, cooldown: 2.4, projectileSpeed: 1400,
      tracking: 0.8, powerDraw: 8, mount: [0, 0, 40], yawCentre: 0, yawWidth: Math.PI * 1.6,
    }],
  });
}

function makeWorld(seed) {
  const engine = new Engine();
  const scene = new THREE.Scene();
  const world = new World({
    engine,
    renderer: { scene, far: new THREE.Scene(), camera: new THREE.PerspectiveCamera() },
    seed,
  });
  world.reputation.coalition = -1;
  return world;
}

function spawn(world, classId, { player = false, x = 0, z = 0, faction } = {}) {
  const classDef = getShipClass(classId);
  const ship = new Ship({
    classDef, world, faction: faction ?? classDef.faction, isPlayer: player,
    root: new THREE.Group(), position: new THREE.Vector3(x, 0, z),
  });
  world.addShip(ship);
  if (player) world.player = ship;
  return ship;
}

function step(world, seconds, systems = []) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    for (const s of systems) s.fixedUpdate(DT);
    for (const ship of world.ships) ship.fixedUpdate(DT);
    world.time += DT;
  }
}

/**
 * Fit real registered modules to a hull the way `refit.js#_applyModuleEffects` does —
 * the same `powerOutput`, `shieldCapacity` and `massLoad` arithmetic, so the demand
 * table below is billed against the numbers the game bills against. Weapons go on as
 * real `WeaponMount`s through the ship's own path.
 */
const REFERENCE_FIT_MASS = 35500;
function fit(ship, pairs) {
  let installedMass = 0;
  let powerBonus = 0;
  let shieldCapacity = 0;
  let bays = 0;
  for (const [hpId, moduleId] of pairs) {
    const def = getModule(moduleId);
    if (!def) throw new Error(`no module "${moduleId}"`);
    installedMass += def.mass ?? 0;
    const g = def.grants ?? {};
    powerBonus += g.powerOutput ?? 0;
    shieldCapacity += g.shieldCapacity ?? 0;
    bays += g.hangarBays ?? 0;
    if (def.weapon) {
      const hp = HP.get(hpId);
      ship.weapons.push(new WeaponMount(def.weapon, {
        localPosition: new THREE.Vector3(hp.anchor[0], hp.anchor[1], hp.anchor[2]),
        yawCentre: hp.yawCentre,
        yawWidth: def.weapon.yawWidth ?? hp.yawWidth,
        hardpoint: hpId,
        condition: 1,
        moduleDef: def,
        containerHP: hp.structureHP,
      }));
    }
  }
  ship.massLoad = 1 + installedMass / REFERENCE_FIT_MASS;
  ship.power.bonusOutput = powerBonus;
  ship.power.unlocked = powerBonus > 0;
  ship.shields.max = shieldCapacity;
  ship.shields.regen = shieldCapacity * 0.06;
  if (ship.world) ship.world.hangarBays = bays;
  ship.power.observe(ship);
  return ship;
}

// ===========================================================================
rule('1  DEMAND — the fit bills the reactor, and the bill can be bigger than the pay');
// ===========================================================================

defineClasses();

/**
 * Three real fits off the shipped registry, from "just installed a reactor" to
 * "everything the hull will carry". The middle one is the interesting case: it is what
 * a player has after two or three sorties.
 */
const FITS = {
  light: [['engine', 'engine_reactor_uprate'], ['port', 'port_cannon_bank']],
  working: [['engine', 'engine_reactor_uprate'], ['dorsal', 'dorsal_shield_pylons'],
    ['port', 'port_broadside_battery'], ['bow', 'bow_torpedo_tubes']],
  heavy: [['engine', 'engine_reactor_uprate'], ['dorsal', 'dorsal_shield_pylons'],
    ['port', 'port_broadside_battery'], ['starboard', 'port_broadside_battery'],
    ['bow', 'bow_siege_lance'], ['ventral', 'ventral_cargo_expansion']],
};

console.log(`  FIT       CAPACITY   DEMAND   STRAIN   DEFICIT  ${POWER_CHANNELS.map((c) => c.padStart(7)).join('  ')}`);
const measured = {};
for (const name of Object.keys(FITS)) {
  const w = makeWorld(`sys/demand/${name}`);
  const p = spawn(w, 'sys_cruiser', { player: true });
  installDefaultPresets(p.power);
  fit(p, FITS[name]);
  const r = powerReport(p);
  measured[name] = {
    capacity: r.capacity, demand: r.demandTotal, strain: r.strain, deficit: r.deficit,
    ch: Object.fromEntries(POWER_CHANNELS.map((c) => [c, r.channels[c].demand])),
    ship: p, world: w,
  };
  const m = measured[name];
  console.log(`  ${name.padEnd(9)} ${f(m.capacity, 1).padStart(7)} PU ${f(m.demand, 1).padStart(8)} `
    + `${f(m.strain).padStart(8)} ${f(m.deficit, 1).padStart(9)}   `
    + POWER_CHANNELS.map((c) => f(m.ch[c], 1).padStart(7)).join('  '));
}

check(measured.light.strain < 1,
  'a hull that has just installed its first reactor is NOT short of power',
  `light fit: ${f(measured.light.demand, 1)} PU of demand against ${f(measured.light.capacity, 1)} PU `
  + `of capacity, strain ${f(measured.light.strain)}. The shortfall has to arrive WITH the `
  + `capability, or the mechanic is a punishment for being early.`);

check(measured.heavy.strain > 1 && measured.heavy.deficit > 0,
  'a fought-out cruiser asks for more than its reactor makes',
  `heavy fit: ${f(measured.heavy.demand, 1)} PU of demand against ${f(measured.heavy.capacity, 1)} PU, `
  + `strain ${f(measured.heavy.strain)} — ${f(measured.heavy.deficit, 1)} PU that CANNOT be supplied `
  + `at any allocation, because the four shares sum to 1 and the four demands do not.`);

check(measured.light.strain < measured.working.strain && measured.working.strain < measured.heavy.strain,
  'strain rises monotonically with the fit, so the budget is a consequence of choices',
  `${f(measured.light.strain)} -> ${f(measured.working.strain)} -> ${f(measured.heavy.strain)} `
  + `over light / working / heavy.`);

/**
 * THE CENTRAL CLAIM, TESTED AS AN EXHAUSTIVE SEARCH RATHER THAN AN ARGUMENT.
 *
 * Sweep every allocation on a 5% grid — 1771 of them, every way four channels can be
 * divided — and count how many satisfy all four. On the heavy fit the answer has to be
 * zero, and the best any allocation can do has to leave at least one channel below the
 * brownout line. That is the difference between "there is always 100% of something" and
 * "there is a slot you must leave dark".
 */
function sweepAllocations(plant) {
  let feasible = 0;
  let total = 0;
  let bestWorst = 0;
  const s = 0.05;
  const map = { shields: 0, weapons: 0, engines: 0, sensors: 0 };
  for (let a = 0; a <= 20; a++) {
    for (let b = 0; a + b <= 20; b++) {
      for (let c = 0; a + b + c <= 20; c++) {
        const d = 20 - a - b - c;
        map.shields = a * s; map.weapons = b * s; map.engines = c * s; map.sensors = d * s;
        total++;
        let worst = Infinity;
        for (const ch of POWER_CHANNELS) {
          const sat = (plant.capacity * map[ch]) / plant.demandOf(ch);
          if (sat < worst) worst = sat;
        }
        if (worst > bestWorst) bestWorst = worst;
        if (worst >= 1) feasible++;
      }
    }
  }
  return { feasible, total, bestWorst };
}

const heavySweep = sweepAllocations(measured.heavy.ship.power);
const lightSweep = sweepAllocations(measured.light.ship.power);
console.log(`\n  exhaustive 5% allocation sweep, ${heavySweep.total} allocations each:`);
console.log(`    light fit : ${lightSweep.feasible} feed every channel; best worst-channel `
  + `${f(lightSweep.bestWorst)}`);
console.log(`    heavy fit : ${heavySweep.feasible} feed every channel; best worst-channel `
  + `${f(heavySweep.bestWorst)}`);

check(heavySweep.feasible === 0 && heavySweep.bestWorst < DEMAND.brownoutAt,
  'on a fought-out hull NO allocation feeds all four, and the best one still browns a channel out',
  `${heavySweep.feasible} of ${heavySweep.total} allocations satisfy every channel. The best any `
  + `allocation achieves on its worst channel is ${f(heavySweep.bestWorst)}, under the `
  + `${DEMAND.brownoutAt} brownout line. THIS IS THE CHECK THAT SAYS THIS IS A BUDGET AND NOT A `
  + `SPLIT — if it ever goes green because someone normalised demand against capacity, the `
  + `system is gone.`);

check(lightSweep.feasible > 0,
  'and on a light hull there are allocations that feed everything, so the sweep can tell them apart',
  `${lightSweep.feasible} of ${lightSweep.total}.`);

// The shortfall must be legible without opening a panel.
{
  const m = measured.heavy;
  const p = m.ship;
  const notes = [];
  m.world.bus.on(EV.NOTIFY, (e) => { if (/BROWNOUT|RESTORED/.test(e.text ?? '')) notes.push(e.text); });
  const brown = [];
  m.world.bus.on('power:brownout', (e) => brown.push(e));
  p.power.applyPreset('assault');
  step(m.world, 6);
  const rep = powerReport(p);
  console.log(`\n  heavy fit under ASSAULT routing:`);
  for (const ch of POWER_CHANNELS) {
    const c = rep.channels[ch];
    console.log(`    ${ch.padEnd(8)} supply ${f(c.supply, 1).padStart(6)} PU  demand ${f(c.demand, 1).padStart(6)} PU  `
      + `satisfaction ${f(c.satisfaction)}  factor ${f(c.factor)}  ${c.brownout ? 'BROWNOUT' : ''}`);
  }
  console.log(`    events: ${brown.length} power:brownout, notifications ${JSON.stringify(notes)}`);
  check(rep.brownouts > 0 && brown.length > 0 && notes.length > 0,
    'the shortfall announces itself — a bus event AND a player-visible line, with no UI work',
    `${rep.brownouts} channel(s) browned out; ${brown.length} typed events; ${notes.length} notifications. `
    + `A shortfall the player cannot see is a hidden nerf, not a system.`);
}

// ===========================================================================
rule('2  THE REACTOR — damage now moves something the player can feel');
// ===========================================================================

{
  const w = makeWorld('sys/reactor');
  const p = spawn(w, 'sys_cruiser', { player: true });
  installDefaultPresets(p.power);
  fit(p, FITS.working);
  p.power.applyPreset('balanced');
  step(w, 6);

  const before = {};
  for (const ch of POWER_CHANNELS) before[ch] = p.power.factor(ch);
  const capBefore = p.power.capacity;

  // Shoot the reactor down to 40%. `_refreshEfficiency` reads `kindHealth('reactor')`
  // and pushes it into `setHealthFactor`, exactly as combat damage does.
  const reactor = p.subsystems.get('reactor');
  reactor.hp = reactor.maxHP * 0.4;
  step(w, 1);

  const after = {};
  for (const ch of POWER_CHANNELS) after[ch] = p.power.factor(ch);
  console.log(`  capacity ${f(capBefore, 1)} PU -> ${f(p.power.capacity, 1)} PU  `
    + `(healthFactor ${f(p.power.healthFactor)})`);
  console.log('  channel     factor before   factor after');
  for (const ch of POWER_CHANNELS) {
    console.log(`    ${ch.padEnd(9)} ${f(before[ch]).padStart(12)}   ${f(after[ch]).padStart(12)}`);
  }
  const allFell = POWER_CHANNELS.every((ch) => after[ch] < before[ch] - 1e-6);
  check(allFell,
    'a hurt reactor lowers EVERY channel, which is what power.js:13-15 has always claimed',
    `healthFactor ${f(p.power.healthFactor)}; weapons ${f(before.weapons)} -> ${f(after.weapons)}, `
    + `engines ${f(before.engines)} -> ${f(after.engines)}. Before this commit `
    + `factor() was actual/(1/4) — a ratio of SHARES with capacity nowhere in it — so this `
    + `check would have measured 0.000 change on all four and the comment was a false claim `
    + `in a source file.`);

  check(p.power.strain > 1,
    'and it does it by pushing the hull into deficit, not by a hidden multiplier',
    `strain ${f(p.power.strain)} after the hit, from ${f(measured.working.strain)} before: the demand `
    + `did not move, the capacity did.`);
}

// Over-supply is worth less than under-supply costs, and cannot exceed the old maximum.
{
  const plant = new PowerPlant({ baseOutput: 100 });
  plant.demand.weapons = 25;
  const rows = [];
  for (const share of [0.05, 0.10, 0.25, 0.50, 0.75, 1.0]) {
    plant.actual.weapons = share;
    rows.push([share, plant.satisfaction('weapons'), plant.factor('weapons')]);
  }
  console.log('\n  share   satisfaction   factor');
  for (const [s, sat, fac] of rows) {
    console.log(`   ${f(s).padStart(5)} ${f(sat).padStart(12)} ${f(fac).padStart(9)}`);
  }
  const under = rows.find((r) => r[0] === 0.10);
  const over = rows.find((r) => r[0] === 0.50);
  check(Math.abs(under[2] - under[1]) < 1e-9 && over[2] < over[1] && rows.every((r) => r[2] <= DEMAND.overdriveMax),
    'starving is linear, over-feeding has diminishing returns, and nothing exceeds the old ceiling',
    `at 10% share satisfaction ${f(under[1])} and factor ${f(under[2])} — identical, so a shortfall `
    + `bites in full. At 50% satisfaction ${f(over[1])} but factor only ${f(over[2])}. Ceiling is `
    + `${DEMAND.overdriveMax}, which is EXACTLY what the old actual/(1/4) form returned at a 50% `
    + `share, so no consumer got stronger than it was.`);
}

// ===========================================================================
rule('3  PRESSURE — the AI reads heat, stores and power, and changes what it does');
// ===========================================================================

{
  // The grep that started this. Re-run against the tree on this commit rather than
  // quoted from a report.
  const NAMES = ['shipAI.js', 'fleetAI.js', 'pressure.js', 'roster.js', 'index.js'];
  const lines = [];
  for (const n of NAMES) {
    const src = readFileSync(join(ROOT, 'src/sim/ai', n), 'utf8').split('\n');
    for (let i = 0; i < src.length; i++) lines.push([n, i + 1, src[i]]);
  }
  const code = lines.filter(([, , l]) => {
    const t = l.trim();
    return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
  });
  const brief = code.filter(([, , l]) => /power\.|thermal|stores\.|salvo/.test(l));
  const reads = code.filter(([, , l]) => /\.(thermal|stores|power)\b|readSystems|selfRead|\.strain\b|trippedCount|\.coolant\b|ammoClass/.test(l));
  console.log(`  lines of code in src/sim/ai/ : ${code.length}`);
  console.log(`  matching the brief's grep    : ${brief.length}`);
  for (const [n, i, l] of brief) console.log(`      ${n}:${i}  ${l.trim().slice(0, 78)}`);
  console.log(`  reading a system at all      : ${reads.length}`);
  check(brief.length > 0 && reads.length >= 8,
    'src/sim/ai/ reads the four systems it used to be blind to',
    `${brief.length} code lines match the brief's own grep /power\\.|thermal|stores\\.|salvo/ `
    + `and ${reads.length} touch a system at all, over ${code.length} lines of code. The `
    + `measurement in the brief was ZERO across 1131 lines, and it was correct.`);
}

{
  const w = makeWorld('sys/pressure');
  const p = spawn(w, 'sys_cruiser', { player: true });
  installDefaultPresets(p.power);
  fit(p, FITS.working);
  const foe = spawn(w, 'sys_frigate', { x: 3000, z: 0 });
  const ai = new ShipAISystem(w);
  const combat = new CombatSystem(w);
  w.register('combat', combat);
  // Shields up: an empty bank is a real opening and would otherwise put a healthy hull
  // on the board with pressure already on it, which is a fixture artefact, not a read.
  p.shields.current = p.shields.max;
  step(w, 1, [ai, combat]);

  const read = makeSystemsRead();

  // Healthy player: nothing to press.
  readSystems(p, read);
  const calm = { pressure: read.pressure, aim: aimFor(read) };

  // Cook the battery. `trip` is the real path combat takes when a mount cooks.
  for (const m of p.weapons) p.thermal.trip(m);
  p.thermal.update(DT);
  readSystems(p, read);
  const hot = { pressure: read.pressure, aim: aimFor(read), tripped: read.tripped };

  // Strain the reactor on top.
  const reactor = p.subsystems.get('reactor');
  reactor.hp = reactor.maxHP * 0.3;
  p.fixedUpdate(DT);
  readSystems(p, read);
  const strained = { pressure: read.pressure, aim: aimFor(read), strain: read.strain };

  // Empty the magazines.
  for (const cls of Object.keys(p.stores.ammo)) p.stores.ammo[cls] = 0;
  for (const m of p.weapons) m.ready = 0;
  p.stores.charge = 0;
  readSystems(p, read);
  const dry = { pressure: read.pressure, aim: aimFor(read), dry: read.dry };

  console.log(`  player state          pressure   aim`);
  console.log(`    healthy             ${f(calm.pressure).padStart(8)}   ${calm.aim ?? '(profile default)'}`);
  console.log(`    battery cooked      ${f(hot.pressure).padStart(8)}   ${hot.aim} (${hot.tripped} mounts tripped)`);
  console.log(`    + reactor strained  ${f(strained.pressure).padStart(8)}   ${strained.aim} (strain ${f(strained.strain)})`);
  console.log(`    + magazines dry     ${f(dry.pressure).padStart(8)}   ${dry.aim}`);

  check(calm.aim === null && hot.aim === 'weapon' && strained.aim === 'reactor',
    'the AI aims at the failure it can see, not at a constant from its role profile',
    `healthy -> null (profile keeps its default); cooking -> 'weapon' (finish the battery while `
    + `it is offline); strained -> 'reactor' (capacity multiplies every channel, so this is the `
    + `highest-leverage shot on an oversubscribed hull and nearly worthless on a slack one).`);

  check(dry.pressure > strained.pressure && strained.pressure > hot.pressure && hot.pressure > calm.pressure,
    'and pressure accumulates across the three systems rather than latching on one',
    `${f(calm.pressure)} -> ${f(hot.pressure)} -> ${f(strained.pressure)} -> ${f(dry.pressure)}.`);
}

{
  // The behaviours the read drives: break point, engagement range, and target choice.
  const w = makeWorld('sys/press-behaviour');
  const p = spawn(w, 'sys_cruiser', { player: true });
  installDefaultPresets(p.power);
  fit(p, FITS.working);
  const foe = spawn(w, 'sys_frigate', { x: 2600, z: 0 });
  const ai = new ShipAISystem(w);
  const combat = new CombatSystem(w);
  w.register('combat', combat);
  step(w, 2, [ai, combat]);

  const a = foe.ai;
  const calmState = a.state;
  const calmPressing = a.pressing;

  for (const m of p.weapons) p.thermal.trip(m);
  p.thermal.update(DT);
  step(w, 2, [ai, combat]);
  const hotPressing = a.pressing;
  const hotState = a.state;

  console.log(`  frigate vs a healthy cruiser : state ${calmState}, pressing ${calmPressing}`);
  console.log(`  frigate vs a cooked cruiser  : state ${hotState}, pressing ${hotPressing}`);
  check(!calmPressing && hotPressing && hotState === 'press',
    'a hostile presses a hull whose battery is offline, and does not press a healthy one',
    `pressing ${calmPressing} -> ${hotPressing}. Preferred range is multiplied by PRESS.rangeK and `
    + `the break point by PRESS.breakK, so it both closes AND holds through damage it would `
    + `otherwise run from. That is the "second clock": cooking your own guns to force a kill now `
    + `has somebody betting against you.`);

  check(foe.power.unlocked === true && foe.ai.routing !== 'patrol',
    'and it is inside the same power budget the player is',
    `hostile plant unlocked=${foe.power.unlocked}, routing '${foe.ai.routing}', strain `
    + `${f(foe.power.strain)}. Before this commit refit.js:375 unlocked the plant for the PLAYER `
    + `only, so every 'power.unlocked ? factor : 1' guard in combat.js and ship.js took the `
    + `constant branch on every hostile in the game.`);
}

{
  // The routing solve is bounded. This is the check that stops "the AI manages power"
  // being a silent 50% rate-of-fire buff to every hostile in the game.
  const w = makeWorld('sys/route-bound');
  const foe = spawn(w, 'sys_frigate', { x: 0, z: 0 });
  foe.power.unlocked = true;
  foe.power.observe(foe);
  let worst = 0;
  const rows = [];
  for (const state of ['patrol', 'approach', 'trade', 'press', 'cool', 'withdraw', 'cornered']) {
    const share = routeFor(foe.power, biasFor(state, null));
    let maxSat = 0;
    for (const ch of POWER_CHANNELS) {
      const sat = (foe.power.capacity * share[ch]) / foe.power.demandOf(ch);
      if (sat > maxSat) maxSat = sat;
    }
    worst = Math.max(worst, maxSat);
    rows.push([state, maxSat, share.weapons]);
  }
  console.log('  AI routing   weapons share   best satisfaction reached');
  for (const [s, sat, wsh] of rows) {
    console.log(`    ${s.padEnd(10)} ${f(wsh).padStart(11)} ${f(sat).padStart(22)}`);
  }
  const bound = AI_OVERROUTE / foe.power.strain;
  check(worst <= bound + 1e-6,
    'no AI routing feeds a channel past AI_OVERROUTE times its own demand',
    `best satisfaction any of the seven states reaches is ${f(worst)}, against the bound `
    + `AI_OVERROUTE/strain = ${f(AI_OVERROUTE)}/${f(foe.power.strain)} = ${f(bound)}. An ABSOLUTE `
    + `share table would have put this frigate's weapons channel at 32 PU on a `
    + `${f(foe.power.demandOf('weapons'), 1)} PU demand — factor 1.52, a 52% rate-of-fire increase `
    + `for every hostile in the game, arriving as a side effect of an AI file.`);
}

// ===========================================================================
rule('4  VERBS — every declared verb has a caller in the input layer');
// ===========================================================================

/**
 * A SOURCE SCAN, and it has to be, because the defect this catches is invisible to
 * every runtime test: a method that is fully implemented, whose state the UI draws,
 * and which nothing calls. Two shipped that way.
 */
{
  const controls = readFileSync(join(ROOT, 'src/input/controls.js'), 'utf8');
  const heat = readFileSync(join(ROOT, 'src/sim/heat.js'), 'utf8');
  const salvage = readFileSync(join(ROOT, 'src/sim/salvage.js'), 'utf8');

  const purgeBound = /case PURGE_KEY:/.test(controls) && /_purge\s*\(\)/.test(controls)
    && /thermal\.purge\(\)/.test(controls);
  check(purgeBound && /purge\(\)\s*\{/.test(heat),
    'COOLANT PURGE is reachable from a key',
    `controls.js binds PURGE_KEY -> _purge() -> ShipThermal.purge(). Before this commit `
    + `heat.js#purge had exactly ONE caller in the tree — src/sim/selftest.mjs — while `
    + `ui/weapons.js:764 drew stores.coolant as three pips that could never move.`);

  const modePassed = /orderCut\([^)]*,\s*mode\)/.test(controls) || /orderCut\(wreck, section, mode\)/.test(controls);
  check(modePassed && /setCutMode\(mode\)/.test(salvage),
    'FAST CUT is reachable — orderCut\'s third argument now has a caller',
    `controls.js#_cut passes 'fast'|'clean' into salvage.orderCut(wreck, section, mode), which `
    + `calls setCutMode. Both cut paths — Z and right-click — go through that one method, so the `
    + `mode cannot be bound to one and not the other.`);
}

{
  // And the fast cut actually does something different, on the real salvage system.
  const w = makeWorld('sys/cut');
  const p = spawn(w, 'sys_cruiser', { player: true });
  const salvage = new SalvageSystem(w);
  w.register('salvage', salvage);
  const victim = spawn(w, 'sys_frigate', { x: 300, z: 0 });
  victim.applyDamage(victim.hullHP + 1, { source: p, rng: w.rng });
  step(w, DT, [salvage]);
  const wreck = w.wrecks[0];
  const sec = wreck?.sections?.find((s) => s.cuttable);
  const results = {};
  for (const mode of ['clean', 'fast']) {
    sec.cutProgress = 0;
    sec.detached = false;
    sec.condition = 0.9;
    wreck.residualHeat = 0.6;
    salvage.orderCut(wreck, sec, mode);
    let t = 0;
    while (!sec.detached && t < 200) { salvage.fixedUpdate(DT); t += DT; }
    results[mode] = { seconds: t, condition: sec.condition, mode: salvage.cutMode };
    const idx = salvage.inTow.findIndex((r) => r.section === sec);
    if (idx >= 0) salvage.inTow.splice(idx, 1);
  }
  console.log(`  clean cut: ${f(results.clean.seconds, 2)} s, part comes off at ${f(results.clean.condition)}`);
  console.log(`  fast  cut: ${f(results.fast.seconds, 2)} s, part comes off at ${f(results.fast.condition)}`);
  check(results.fast.seconds < results.clean.seconds && results.fast.condition < results.clean.condition
    && results.fast.mode === 'fast',
    'and the mode is a real trade: faster off a burning wreck, worse in the hold',
    `${f(results.clean.seconds, 2)} s at ${f(results.clean.condition)} versus ${f(results.fast.seconds, 2)} s `
    + `at ${f(results.fast.condition)} on the same section of the same wreck at residual heat 0.6. `
    + `fastCutRate 1.75 was dead data until the third argument had a caller.`);
}

// ===========================================================================
rule('5  SAVE — the hull is an absolute and survives the round trip as one');
// ===========================================================================

{
  const w = makeWorld('sys/save');
  const p = spawn(w, 'sys_cruiser', { player: true });
  installDefaultPresets(p.power);
  // A perk that rescales max hull. This is the exact shape that compounded.
  const ranks = new Map([['hold_bracing', 1]]);
  const perks = {
    ranks,
    apply() {
      const bracing = ranks.get('hold_bracing') ?? 0;
      const base = (p._basePerkMaxHullHP ??= p.maxHullHP);
      const next = Math.max(1, Math.round(base * (1 - bracing * 0.06)));
      const frac = p.maxHullHP > 0 ? p.hullHP / p.maxHullHP : 1;
      p.maxHullHP = next;
      p.hullHP = Math.min(next, Math.max(1, Math.round(next * frac)));
    },
  };
  w.register('perks', perks);
  perks.apply();
  p.hullHP = 7400;
  const saved = captureSave(w);

  // A FRESH world, which is the case that compounded: `_basePerkMaxHullHP` is unset and
  // `maxHullHP` is back at its pre-perk value, so a ratio applied after an absolute
  // charges the player the bracing penalty a second time.
  const w2 = makeWorld('sys/save');
  const p2 = spawn(w2, 'sys_cruiser', { player: true });
  installDefaultPresets(p2.power);
  const ranks2 = new Map();
  const perks2 = {
    ranks: ranks2,
    apply() {
      const bracing = ranks2.get('hold_bracing') ?? 0;
      const base = (p2._basePerkMaxHullHP ??= p2.maxHullHP);
      const next = Math.max(1, Math.round(base * (1 - bracing * 0.06)));
      const frac = p2.maxHullHP > 0 ? p2.hullHP / p2.maxHullHP : 1;
      p2.maxHullHP = next;
      p2.hullHP = Math.min(next, Math.max(1, Math.round(next * frac)));
    },
  };
  w2.register('perks', perks2);
  const res = applySave(w2, saved);
  console.log(`  applied  : ${res.ok} ${JSON.stringify(res.applied)}`);
  console.log(`  hull     : ${p.hullHP}/${p.maxHullHP} saved  ->  ${p2.hullHP}/${p2.maxHullHP} loaded`);
  check(res.ok && p2.hullHP === p.hullHP && p2.maxHullHP === p.maxHullHP,
    'hull and max hull come back exactly, with a hull perk in the file',
    `${p.hullHP}/${p.maxHullHP} -> ${p2.hullHP}/${p2.maxHullHP}. Before this commit persistence.js `
    + `restored hullHP as an absolute at :357 and then called perks.apply() at :293, which `
    + `re-seeded from the fresh world's PRE-perk maxHullHP and rescaled by (1 - bracing*0.06) a `
    + `second time — 7400 came back as 6956, and sortieHarness.js has printed "15 of 16 fields `
    + `identical" for as long as it has existed.`);

  // Twice more, to prove it is not merely one round trip that survives.
  let hull = p2.hullHP;
  for (let i = 0; i < 2; i++) {
    const again = captureSave(w2);
    applySave(w2, again);
    perks2.apply();
  }
  check(p2.hullHP === hull,
    'and it does not drift across repeated round trips',
    `three loads: ${p.hullHP} -> ${hull} -> ${p2.hullHP}.`);
}

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(78)}`);
console.log(`${passed} of ${passed + failed} checks passed`);
console.log('='.repeat(78));
console.log(`\nconstants in force: DEMAND.base ${JSON.stringify(DEMAND.base)}`);
console.log(`                    perPowerDraw ${DEMAND.perPowerDraw}, perShieldPoint ${DEMAND.perShieldPoint}, `
  + `perMount ${DEMAND.perMount}, perBay ${DEMAND.perBay}`);
console.log(`                    overdriveGain ${DEMAND.overdriveGain}, overdriveMax ${DEMAND.overdriveMax}, `
  + `brownoutAt ${DEMAND.brownoutAt}, AI_OVERROUTE ${AI_OVERROUTE}`);
process.exit(failed > 0 ? 1 : 0);
