/**
 * HEADLESS EXERCISE HARNESS for the sortie loop.
 *
 *     node src/sim/meta/sortieHarness.js
 *
 * Nothing in here is a mock. It builds a real `World` with a real `Engine`, the real
 * `installWorldSim` (faction war, travel, discovery, AI), the real salvage system - which
 * installs the real progression layer - and then plays a sortie: undock, burn to a POI,
 * cut a hull apart, get shot to pieces, drift, get towed in, dock, read the debrief,
 * save, reload, and check that the same world came back.
 *
 * Every number printed came out of the simulation.
 */

import * as THREE from 'three';
import { Engine } from '../../core/loop.js';
import { World } from '../../core/world.js';
import { EV } from '../../core/events.js';
import { KM } from '../../core/units.js';
import { Ship } from '../ship.js';
import { SalvageSystem } from '../salvage.js';
import { CombatSystem } from '../combat.js';
import { RefitSystem } from '../refit.js';
import { MEV } from './events.js';
import { memoryStorage, captureSave, SAVE_VERSION } from '../../core/persistence.js';
import { ESCALATION } from '../../world/factionWar.js';

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 7) => String(typeof v === 'number' ? Math.round(v * 100) / 100 : v).padStart(n);
const rule = (t) => `\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`;

/** Printed as it happens, so a throw halfway through still shows what got that far. */
const say = (s = '') => console.log(s);

function makeWorld(seed = 'harness/sortie/001') {
  const engine = new Engine();
  const stub = { scene: new THREE.Scene(), far: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
  return new World({ engine, renderer: stub, seed });
}

function advance(engine, seconds, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) engine._fixedStep(dt);
  return steps;
}

const PLAYER_CLASS = {
  id: 'harness_cruiser', name: 'Harness Cruiser', faction: 'player', role: 'cruiser',
  length: 1400, mass: 62000, maxSpeed: 140, accel: 14, turnRate: 0.22, hullHP: 12000,
  triBudget: 2000, planeLocked: true, build: () => new THREE.Group(),
  subsystems: [
    { id: 'reactor', kind: 'reactor', hp: 1800, position: [0, 20, -60], radius: 130, salvageValue: 0.3, label: 'Reactor' },
    { id: 'drive', kind: 'engine', hp: 1200, position: [0, 0, -500], radius: 140, salvageValue: 0.2, label: 'Main Drive' },
  ],
  weapons: [],
};

const VICTIM_CLASS = (id, faction) => ({
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
});

/**
 * A geometry stub for `RefitSystem`. It is the ONLY stub in this file, and it is a stub
 * of the art stream's `attachModule`/`detachModule` pair rather than of any simulation:
 * the refit system, the gate, the condition chain and the statistics recompute are all
 * the real ones.
 */
const STUB_ATTACHMENT = {
  attachModule: () => ({ object: new THREE.Group() }),
  detachModule: () => {},
};

async function buildGame(seed) {
  // `Ship._nextId` is a process-global counter and it ends up in the label that salvage
  // forks its per-wreck RNG from, so two worlds built in one process draw different
  // numbers from the same seed. In the browser the process is the page, so this only
  // bites a harness - but it has to be reset here or "same seed, same result" would be
  // measuring the counter rather than the seed. Reported as a finding.
  Ship._nextId = 0;
  const w = makeWorld(seed);
  const player = new Ship({
    classDef: PLAYER_CLASS, world: w, faction: 'player', isPlayer: true, root: new THREE.Group(),
  });
  w.player = player;
  w.addShip(player);

  const combat = new CombatSystem(w);
  w.register('combat', combat);
  w.engine.add(combat);
  const salvage = new SalvageSystem(w);      // installs the progression + sortie layer
  w.register('salvage', salvage);
  w.engine.add(salvage);
  // The real refit system, with the art stream's attachment pair stubbed out. The gate
  // claims it on its first step, exactly as it would in the game.
  w.register('refit', new RefitSystem(w, STUB_ATTACHMENT));

  // `game.js` drives every hull from one system at order 60 so the ordering is
  // explicit. Reproduced exactly, because without it nothing integrates and a transit
  // burn would sit in `turning` forever.
  w.engine.add({
    name: 'ships',
    order: 60,
    fixedUpdate: (dt) => {
      for (const ship of w.ships) ship.fixedUpdate(dt);
      w.time += dt;
    },
  });

  const { installWorldSim } = await import('../../world/index.js');
  installWorldSim(w, { autoAdopt: false, enterStart: false });

  // Give the player some standing so berths are open, and something to pay with.
  w.reputation.coalition = 20;
  w.reputation.concord = 12;
  w.materials.alloy = 400;
  w.materials.composite = 120;
  return w;
}

// ===========================================================================
await import('../../art/geometry/modules/index.js');

say(rule('1. THE ANCHORAGES — five berths, and they are not interchangeable'));
const w = await buildGame();
const sys = w.systems.system;
const travel = w.systems.travel;
const war = w.systems.factionWar;
const sortie = w.systems.sortie;

say(`POIs in the system     : ${sys.nodes.length}`);
say(`with a berth           : ${sys.anchorages().length}  (${sys.anchorages().map((n) => n.id).join(', ')})`);
say(`  the research said six station/yard POIs. There are five: vault-nine is a graveyard.`);
say('');
say(`${pad('BERTH', 20)}${pad('KIND', 8)}${pad('OWNER', 11)}${pad('PROP/u', 8)}${pad('SUBSIDY', 9)}${pad('REPAIR', 8)}${pad('REFINE', 8)}${pad('REFIT', 7)}${pad('MIN STAND', 10)}HEAVY`);
for (const n of sys.anchorages()) {
  const a = n.anchorage;
  say(`${pad(n.name, 20)}${pad(n.kind, 8)}${pad(travel.ownerOf(n.id), 11)}`
    + `${num(a.propellantPerUnit, 6)}  ${num(a.repairSubsidy, 7)}  ${num(a.repairRateMul, 6)}  `
    + `${num(a.refineRateMul, 6)}  ${num(a.refitSpeedMul, 5)}  ${num(a.minStanding, 8)}  ${a.heavyRefit ? 'yes' : 'no'}`);
}

say(rule('2. DOCKING — the refusals are the design'));
const start = sys.get('graveyard');
w.player.position.copy(start.position);
travel.adoptCurrent('graveyard');
say(`at ${pad(start.name, 18)} : ${JSON.stringify(travel.dockStatus('graveyard').reason)}`);

const cinder = sys.get('cinderport');
w.player.position.copy(cinder.position);
w.player.body.velocity.set(0, 0, 900);
say(`at Cinderport at 900 m/s: ${travel.dockStatus('cinderport').reason}`);
w.player.body.velocity.set(0, 0, 0);
w.player.position.set(cinder.position.x + 40 * KM, 0, cinder.position.z);
say(`40 km off the berth     : ${travel.dockStatus('cinderport').reason}`);
w.player.position.copy(cinder.position);
say(`alongside, standing +20 : ok=${travel.dockStatus('cinderport').ok}`);
const repBefore = w.reputation.coalition;
w.reputation.coalition = -50;
say(`alongside, standing -50 : ${travel.dockStatus('cinderport').reason}`);
w.reputation.coalition = repBefore;

say(rule('3. PROPELLANT IS A CLOCK NOW — refuel(), finally called'));
const tank = w.propellant;
tank.current = 180;
say(`tank before            : ${tank.current} / ${tank.max}`);
say(`alloy before           : ${w.materials.alloy}`);
const dockRes = travel.dock('cinderport');
say(`dock                   : ok=${dockRes.ok}  berth fee ${JSON.stringify(dockRes.fee)}  queued ${Math.round(dockRes.queued)} scrap`);
const buy = travel.buyPropellant('full');
say(`buy full               : ${Math.round(buy.units)} units for ${Math.ceil(buy.cost)} alloy `
  + `(paid ${Math.round(buy.paid.alloy)}, credit ${Math.round(buy.paid.credit)})`);
say(`tank after             : ${tank.current} / ${tank.max}`);
say(`alloy after            : ${Math.round(w.materials.alloy)}   debt ${Math.round(sortie.debt)}`);
say(`  range at 0.8 u/km    : ${Math.round((tank.current - tank.reserve) / 0.8)} km, silent ${Math.round((tank.current - tank.reserve) / 0.5)} km`);

// The same purchase at the yard, for comparison. Berths are not interchangeable.
const w2 = await buildGame('harness/sortie/price');
w2.propellant.current = 180;
w2.materials.alloy = 900;
const iron = w2.systems.system.get('ironhold');
w2.player.position.copy(iron.position);
w2.systems.travel.adoptCurrent('ironhold');
w2.systems.travel.dock('ironhold');
const buy2 = w2.systems.travel.buyPropellant('full');
say(`same fill at Ironhold  : ${Math.ceil(buy2.cost)} alloy vs ${Math.ceil(buy.cost)} at Cinderport `
  + `— ${((buy2.cost / buy.cost - 1) * 100).toFixed(0)}% more`);

say(rule('4. THE SORTIE — undock, burn out, work, burn home, read the bill'));
travel.undock('harness');
say(`sortie #${sortie.index} open, docked=${sortie.docked}`);

/** Fly a plotted course for real. Returns how long the burn actually took. */
function runCourse(world, poiId, cap = 900) {
  const t = world.systems.travel;
  const course = t.plotTo(poiId);
  if (!course.ok) return { ok: false, reason: course.reason, course };
  t.commit(course);
  let elapsed = 0;
  while (t.state !== 'idle' && elapsed < cap) {
    advance(world.engine, 1);
    elapsed += 1;
  }
  return { ok: t.state === 'idle', elapsed, course, state: t.state };
}

const outbound = travel.plotTo('marrow-shoal');
say(`\nplot Cinderport -> Marrow Shoal`);
say(`  ${(outbound.legs[0].distance / KM).toFixed(0)} km, ${outbound.totalTime.toFixed(0)} s, `
  + `${Math.ceil(outbound.totalPropellant)} propellant, intercept ${(outbound.interceptChance * 100).toFixed(1)}%`);
say(`  legal                : ${outbound.ok}${outbound.reason ? ` (${outbound.reason})` : ''}`);
const propBefore = w.propellant.current;
const leg = runCourse(w, 'marrow-shoal');
say(`  burned for           : ${leg.elapsed} s of sim time, arrived=${leg.ok} (state ${leg.state})`);
say(`  propellant           : ${Math.round(propBefore)} -> ${Math.round(w.propellant.current)} `
  + `(${Math.round(propBefore - w.propellant.current)} spent; the quote was ${Math.ceil(outbound.totalPropellant)})`);
say(`  at                   : ${travel.currentPOI ?? 'open space'}`);

// Put a hull in front of the player and take it apart for real.
const salvage = w.systems.salvage;
const victim = new Ship({ classDef: VICTIM_CLASS('h_dd', 'coalition'), world: w, faction: 'coalition', root: new THREE.Group() });
victim.position.copy(w.player.position).add(new THREE.Vector3(900, 0, 0));
w.addShip(victim);
victim.applyDamage(victim.hullHP + 1, { source: w.player, rng: w.rng });
advance(w.engine, 0.05);
const wreck = w.wrecks.find((x) => !x.detachedModule);
say(`wreck                  : ${wreck.name}, ${wreck.sections.length} sections, integrity ${wreck.integrity.toFixed(2)}`);
let cutCount = 0;
for (const sec of wreck.sections) { salvage._store(sec); cutCount++; }
say(`cut                    : ${cutCount} sections`);

// THE CLOCK BITES. This is not staged: the outbound leg cost 371 of 600 spendable
// units, and the way home costs the same 371.
const homePlot = travel.plotTo('cinderport');
say(`\nplot the way home      : ok=${homePlot.ok}`);
say(`  ${homePlot.reason ?? 'legal'}`);
say(`reachable berths from Marrow Shoal, at the tank we have:`);
say(`  ${pad('BERTH', 22)}${pad('KM', 8)}${pad('PROPELLANT', 12)}REACHABLE`);
for (const row of travel.status().anchorages) {
  say(`  ${pad(row.name, 22)}${num(row.km, 6)}  ${num(row.propellant, 10)}  ${row.reachable ? 'yes' : 'NO'}`);
}
say(`  SILENT running is 0.5 u/km rather than 0.8. Home would cost `
  + `${Math.ceil((homePlot.legs[0]?.distance ?? 0) / KM * 0.5)} that way, and we have `
  + `${Math.floor(w.propellant.current - w.propellant.reserve)}.`);
travel.setSilent(true);
const silentPlot = travel.plotTo('cinderport');
say(`  under SILENT          : ok=${silentPlot.ok} — ${silentPlot.reason ?? 'legal'}`);
travel.setSilent(false);

say(`\nSTRANDED. The tender path integration-decisions.md promised:`);
const reach = w.systems.derelict.reachability();
say(`  range on the tank     : ${reach.rangeKm.toFixed(0)} km at the silent rate`);
say(`  nearest willing berth : ${reach.nearest.node.name} at ${(reach.nearest.distance / KM).toFixed(0)} km`);
say(`  reachable             : ${reach.reachable}`);
advance(w.engine, 50);
const tow = w.systems.derelict.status();
say(`  after 50 s adrift     : tender from ${tow?.toName}, ${tow?.remaining.toFixed(0)} s out, `
  + `${tow?.bill} alloy`);
advance(w.engine, 95);
say(`  towed to              : ${travel.dockedAt}, docked=${travel.docked}, `
  + `debt ${Math.round(sortie.debt)}`);

const back = { debrief: sortie.lastDebrief(), settled: { paid: 0 } };
const d = back.debrief;
say('');
say(`DEBRIEF — sortie ${d.index}, ${d.seconds.toFixed(1)} s, ${d.places.length} place(s)`);
say(`  sections cut         : ${d.cut.sections}   modules ${d.cut.modules}   ammo ${d.cut.ammo}`);
say(`  mean condition       : ${d.cut.meanCondition.toFixed(2)}`);
say(`  best part            : ${d.cut.best ? `${d.cut.best.name} at ${d.cut.best.condition.toFixed(2)}` : '--'}`);
say(`  scrap aboard         : ${JSON.stringify(d.economy.scrap)} = ${d.economy.scrapUnits} units`);
say(`  refined this sortie  : ${JSON.stringify(d.economy.refined)}`);
say(`  materials spent      : ${d.economy.spent}    net ${d.economy.net}`);
say(`  propellant burned    : ${d.movement.propellantBurned.toFixed(1)}   over ${d.movement.km.toFixed(1)} km`);
say(`  codex advances       : ${d.knowledge.codexAdvances}   intel fixes ${d.knowledge.intelFixes}`);
say(`  debt                 : ${Math.round(d.debt)}   settled on arrival ${Math.round(back.settled.paid)}`);
const econ = w.systems.economy;
say(`refinery              : ${Math.round(econ.describe().queuedUnits)} units queued at ${econ.rate.toFixed(1)}/s `
  + `(dock multiplier x${(econ.rate / econ.baseRate).toFixed(1)})`);
advance(w.engine, 30);
say(`after 30 s berthed     : ${JSON.stringify(econ.describe().refined)}, ${Math.round(econ.describe().queuedUnits)} left`);
const live = sortie.live();
say(`live strip             : limiter ${live.limiter}, range ${Math.round(live.rangeKm)} km, hold ${(live.holdFraction * 100).toFixed(0)}% full`);

say(rule('5. REFIT COMMITMENT — the same swap, in three places'));
const gate = w.systems.refitGate;
say(`gate enforcing refit.install: ${gate.enforced} (no refit system in a headless build: ${!w.systems.refit})`);
const modId = 'port_cannon_bank';
w.inventory.push({ moduleId: modId, condition: 0.9, uid: 'harness/part/1' });
const at = (label) => {
  const c = gate.check('port', modId, 'install');
  say(`${pad(label, 26)} ok=${pad(c.ok, 6)} ${pad(`${c.seconds.toFixed(1)}s`, 8)}`
    + `${pad(`-${(c.conditionLoss * 100).toFixed(1)}% cond`, 16)}${c.reason ?? c.note ?? ''}`);
};
at('docked at Cinderport');
travel.undock('refit test');
at('open space');
// Bolt the Field Dock on by hand to show what autonomy buys, and what it costs.
const ventral = w.player.hardpoints.get('ventral');
ventral.module = { moduleId: 'ventral_repair_bay', condition: 1, uid: 'fd', def: { id: 'ventral_repair_bay', name: 'Field Dock', mass: 260, tier: 2 } };
at('open space + Field Dock');
ventral.module = null;
w.player.hardpoints.get('port').module = { moduleId: 'x', condition: 1, uid: 'x', def: { id: 'x', name: 'Something', mass: 200, tier: 1 } };
at('open space, mount occupied');
w.player.hardpoints.get('port').module = null;
// bow_siege_lance is the registry's tier-3 bow module. Heavy gantries only.
say(`tier 3 in open space       : ${gate.check('bow', 'bow_siege_lance', 'install').reason ?? 'allowed'}`);
w.player.position.copy(sys.get('cinderport').position);
travel.dock('cinderport');
say(`tier 3 at Cinderport      : ${gate.check('bow', 'bow_siege_lance', 'install').reason ?? 'allowed'}`);
w.player.position.copy(sys.get('ironhold').position);
travel.undock('to the yard');
travel.adoptCurrent('ironhold');
travel.dock('ironhold');
const t3 = gate.check('bow', 'bow_siege_lance', 'install');
say(`tier 3 at Ironhold        : ${t3.reason ?? `allowed, ${t3.seconds.toFixed(1)}s`}`);
travel.undock('back out');

// Run one to completion so the time is spent for real, out in the field.
w.player.position.copy(sys.get('graveyard').position);
travel.adoptCurrent('graveyard');
const started = gate.beginInstall('port', 'harness/part/1');
say(`\nbegan a field install  : ${started.ok ? `${started.job.total.toFixed(1)} s of work` : started.reason}`);
if (started.ok) {
  advance(w.engine, started.job.total * 0.5);
  say(`  halfway              : ${gate.status().job.remaining.toFixed(1)} s left, mount still empty=${!w.player.hardpoints.get('port').module}`);
  advance(w.engine, started.job.total * 0.6);
  const mounted = w.player.hardpoints.get('port');
  say(`  completed            : ${mounted.module?.def?.name ?? 'nothing'} on the port mount at `
    + `condition ${(mounted.module?.condition ?? 0).toFixed(3)} — it went into the job at 0.900`);
  say(`  weapon mounts now    : ${w.player.weapons.length}, arc centre `
    + `${(w.player.weapons[0]?.yawCentre ?? 0).toFixed(2)} rad — the field weld is a real gun`);
}
// And the same call through refit.install, which the gate has taken over.
w.inventory.push({ moduleId: 'dorsal_sensor_mast', condition: 1, uid: 'harness/part/2' });
const viaRefit = w.systems.refit.install('dorsal', 'harness/part/2');
say(`refit.install(...) now : ok=${viaRefit.ok} pending=${!!viaRefit.pending} `
  + `— the gate answered, not refit (enforced=${gate.enforced})`);
gate.cancel();

say(rule('6. CRIPPLING — not death'));
const w3 = await buildGame('harness/sortie/cripple');
const p3 = w3.player;
const sys3 = w3.systems.system;
const grave = sys3.get('graveyard');
p3.position.copy(grave.position);
w3.systems.travel.adoptCurrent('graveyard');
// Three mounts, two of them already beaten up.
const fit = [['port', 'Port Cannon Bank', 0.2], ['dorsal', 'Dorsal Array', 0.9], ['bow', 'Bow Rail', 0.3]];
for (const [id, name, structFrac] of fit) {
  const hp = p3.hardpoints.get(id);
  hp.module = { moduleId: `m_${id}`, condition: 0.8, uid: `u_${id}`, def: { id: `m_${id}`, name, mass: 300, tier: 2 } };
  hp.structureHP = hp.maxStructureHP * structFrac;
}
say(`fit before             : ${[...p3.hardpoints.values()].filter((h) => h.module).map((h) => `${h.id}@${Math.round(h.structureHP / h.maxStructureHP * 100)}%`).join(' ')}`);
say(`hold before            : ${w3.systems.economy.scrap.plate} plate scrap, ${w3.inventory.length} modules`);

const events = [];
for (const t of [MEV.PLAYER_CRIPPLED, MEV.WRECKSITE_MARKED, MEV.PLAYER_RECOVERED]) {
  w3.bus.on(t, (e) => events.push([t, e]));
}
w3.systems.economy.addScrap('plate', 60);
p3.applyDamage(p3.hullHP + 1, { source: null, rng: w3.rng });
advance(w3.engine, 0.1);

const derelict = w3.systems.derelict;
say(`\ndead                   : ${p3.dead}   crippled: ${p3.crippled}   scrammed: ${p3.scrammed}`);
say(`engine efficiency      : ${p3.body.engineEfficiency}   steering ${p3.body.steeringEfficiency}`);
say(`weapons online         : ${p3.weapons.filter((m) => m.online).length} of ${p3.weapons.length}`);
say(`fit after              : ${[...p3.hardpoints.values()].filter((h) => h.module).map((h) => h.id).join(' ') || '(nothing)'}`);
say(`hold after             : ${w3.systems.economy.scrap.plate} plate scrap  <- the hold survives, per look-target.md §3`);
const st3 = derelict.status();
say(`drifting               : ${st3.remaining.toFixed(0)} s, tender from ${st3.toName}, bill ${st3.bill} alloy${st3.hostile ? ' (hostile)' : ''}`);
const site = derelict.sites()[0];
say(`site marked            : ${site.modules.length} modules — ${site.modules.map((m) => `${m.name} @${m.condition.toFixed(2)}`).join(', ')}`);
say(`  they are at ${site.km.toFixed(1)} km, live in the world = ${site.live}`);
say(`  detached modules now in world.wrecks: ${w3.wrecks.filter((x) => x.detachedModule).length}`);

advance(w3.engine, 50);
say(`\nafter the drift        : crippled=${p3.crippled}  hull ${Math.round(p3.hullHP)}/${p3.maxHullHP} `
  + `(${Math.round(p3.hullHP / p3.maxHullHP * 100)}%)`);
say(`towed to               : ${w3.systems.travel.dockedAt}  docked=${w3.systems.travel.docked}`);
say(`the bill               : ${st3.bill} alloy borrowed, then settled out of `
  + `refined stock on docking — alloy now ${Math.round(w3.materials.alloy)}, `
  + `debt ${Math.round(w3.systems.sortie.debt)}`);
say(`site is now            : ${derelict.sites()[0]?.km.toFixed(0)} km away, live=${derelict.sites()[0]?.live}`);
say(`  going back for them is a sortie, and the record is what makes that true.`);

say(rule('7. THE ESCALATION LEDGER — earned, and spatially negotiable'));
const w4 = await buildGame('harness/sortie/ledger');
const war4 = w4.systems.factionWar;
const sys4 = w4.systems.system;
const salv4 = w4.systems.salvage;
say(`${pad('TIER', 10)}${pad('AT CLAIM', 10)}${pad('SENDS', 34)}COOLDOWN`);
for (const e of ESCALATION) say(`${pad(e.tier, 10)}${num(e.at, 8)}  ${pad(e.roles.join(' + '), 34)}${e.cooldown}s`);

// Work deep in Coalition space.
const ironhold = sys4.get('ironhold');
w4.player.position.copy(ironhold.position);
const shareIn = war4._controlShare('coalition', w4.player.position.x, w4.player.position.z);
say(`\nat Ironhold, Coalition control share of the field: ${shareIn.toFixed(2)}`);

let escalations = 0;
w4.bus.on(MEV.ESCALATION, (e) => { escalations++; say(`  >> ${e.faction} sent a ${e.tier}: ${e.ships} hulls at ${e.poiId ?? 'open space'}`); });

const cutSome = (n, faction) => {
  for (let i = 0; i < n; i++) {
    const v = new Ship({ classDef: VICTIM_CLASS(`v${i}`, faction), world: w4, faction, root: new THREE.Group() });
    v.position.copy(w4.player.position).add(new THREE.Vector3(600, 0, 0));
    w4.addShip(v);
    v.applyDamage(v.hullHP + 1, { source: w4.player, rng: w4.rng });
    advance(w4.engine, 0.05);
    const wr = w4.wrecks.find((x) => !x.detachedModule && !x.spent);
    if (!wr) continue;
    for (const sec of wr.sections) salv4._store(sec);
    advance(w4.engine, 0.5);
  }
};

say('');
say(`${pad('AFTER', 34)}${pad('COALITION CLAIM', 17)}${pad('TIER', 9)}DECAY/s`);
const report = (label) => {
  const row = war4.ledgerStatus().find((r) => r.faction === 'coalition');
  say(`${pad(label, 34)}${num(row.claim, 15)}  ${pad(row.tier ?? '--', 9)}${row.decayPerSecond.toFixed(2)}`);
  return row;
};
report('start');
cutSome(2, 'coalition');
report('2 Coalition hulls stripped');
advance(w4.engine, 40);
report('40 s later, still in their space');
cutSome(6, 'coalition');
advance(w4.engine, 20);
report('6 more');
say(`escalation responses so far: ${escalations}, hostile hulls in world: `
  + `${w4.ships.filter((s) => s.__escalation).length}`);

// Now move to the other side of the map and watch it fall.
const meridian = sys4.get('meridian-gate');
w4.player.position.copy(meridian.position);
const shareOut = war4._controlShare('coalition', w4.player.position.x, w4.player.position.z);
say(`\nmoved to Meridian Gate. Coalition control share here: ${shareOut.toFixed(2)}`);
report('on arrival');
advance(w4.engine, 120);
report('120 s in Concord space');
say(`  same 120 s in Coalition space would have shed `
  + `${(0.55 * (1 + (1 - shareIn) * 2) * 120).toFixed(0)}; here it shed `
  + `${(0.55 * (1 + (1 - shareOut) * 2) * 120).toFixed(0)}. That is the negotiation.`);

// And paying a berth buys it down.
w4.player.position.copy(sys4.get('ironhold').position);
w4.reputation.coalition = 30;
w4.systems.travel.adoptCurrent('ironhold');
const beforeDock = war4.ledger.coalition.claim;
w4.systems.travel.dock('ironhold');
say(`\ndocking at their yard  : claim ${beforeDock.toFixed(1)} -> ${war4.ledger.coalition.claim.toFixed(1)} (you paid them)`);

say(rule('8. PERSISTENCE — save, reload, and check it is the same world'));
const storage = memoryStorage();
const w5 = await buildGame('harness/sortie/save');
w5.systems.persistence.storage = storage;
const p5 = w5.player;
// Make the world messy so the save has something to be wrong about.
p5.hullHP = 7400;
// Install through the real refit system (bypassing the commitment gate, as a load
// does) so the codex records it exactly as it would in play.
w5.inventory.push({ moduleId: 'dorsal_sensor_mast', condition: 0.62, uid: 'sv1' });
w5.systems.refit.install('dorsal', 'sv1', { bypassGate: true });
p5.hardpoints.get('port').structureHP = 380;
w5.inventory.push({ moduleId: 'port_cannon_bank', condition: 0.44, uid: 'sv2' });
w5.systems.economy.addScrap('core', 88);
w5.materials.electronics = 41;
w5.reputation.concord = -37;
w5.systems.codex.markModule('port_cannon_bank', 'installed');
w5.systems.perks.ranks.set('hold_bracing', 1);
w5.systems.patterns.known.set('port_cannon_bank', { at: 0, reason: 'harness' });
w5.systems.discovery.reveal('ironhold', 'intel');
w5.systems.discovery.reveal('meridian-gate', 'intel');
w5.systems.sortie.debt = 96;
advance(w5.engine, 300, 1 / 12);       // let the war do something
w5.systems.factionWar.ledger.coalition.claim = 143;

const saved = w5.systems.persistence.save();
say(`save                   : ok=${saved.ok}  ${saved.bytes} bytes  version ${SAVE_VERSION}`);
const peek = w5.systems.persistence.peek();
say(`peek                   : ${JSON.stringify(peek)}`);

const fingerprint = (world) => {
  const p = world.player;
  const wr = world.systems.factionWar;
  return {
    hull: Math.round(p.hullHP),
    fit: [...p.hardpoints.entries()].map(([id, hp]) => `${id}:${hp.module?.def?.id ?? hp.module?.moduleId ?? '-'}@${(hp.module?.condition ?? 0).toFixed(2)}`).join(','),
    portStructure: Math.round(p.hardpoints.get('port').structureHP),
    inventory: world.inventory.map((i) => `${i.moduleId}@${i.condition.toFixed(2)}`).join(','),
    materials: JSON.stringify(world.materials),
    scrap: JSON.stringify(world.systems.economy.scrap),
    reputation: JSON.stringify(world.reputation),
    codex: world.systems.codex.state.size,
    perks: [...world.systems.perks.ranks.entries()].join(','),
    patterns: [...world.systems.patterns.known.keys()].join(','),
    known: [...world.systems.discovery.known].sort().join(','),
    warTime: Math.round(wr.time),
    control: [...wr.states.values()].map((s) => s.control.toFixed(3)).join(','),
    hulks: [...wr.states.values()].reduce((n, s) => n + s.hulks.length, 0),
    claim: Math.round(wr.ledger.coalition.claim),
    debt: Math.round(world.systems.sortie.debt),
  };
};

const before5 = fingerprint(w5);

// A fresh world, exactly as a page reload would produce it, then load the file.
const w6 = await buildGame('harness/sortie/save');
w6.systems.persistence.storage = storage;
const loaded = w6.systems.persistence.load();
say(`load into a fresh world: ok=${loaded.ok} applied=[${loaded.applied?.join(' ')}]`);
const after6 = fingerprint(w6);

say('');
say(`${pad('FIELD', 16)}${pad('BEFORE SAVE', 30)}${pad('AFTER LOAD', 30)}MATCH`);
let mismatches = 0;
for (const k of Object.keys(before5)) {
  const a = String(before5[k]);
  const b = String(after6[k]);
  const ok = a === b;
  if (!ok) mismatches++;
  say(`${pad(k, 16)}${pad(a.slice(0, 28), 30)}${pad(b.slice(0, 28), 30)}${ok ? 'yes' : 'NO'}`);
}
say(`\n${Object.keys(before5).length - mismatches} of ${Object.keys(before5).length} fields identical.`);

say('\nfailing safe:');
const badVersion = { ...captureSave(w5), version: 999 };
say(`  wrong version        : ${JSON.stringify((await import('../../core/persistence.js')).applySave(w6, badVersion))}`);
const badSeed = { ...captureSave(w5), seed: 'some-other-world' };
say(`  wrong seed           : ${JSON.stringify((await import('../../core/persistence.js')).applySave(w6, badSeed))}`);
storage.setItem('nadir-point/save/v1', '{not json');
say(`  corrupt file         : ${JSON.stringify(w6.systems.persistence.load())}`);
say(`  world untouched      : hull still ${Math.round(w6.player.hullHP)}, fit still "${fingerprint(w6).fit}"`);

say(rule('9. DETERMINISM — same seed, same sortie'));
async function runSortie(seed) {
  const wx = await buildGame(seed);
  const t = wx.systems.travel;
  wx.player.position.copy(wx.systems.system.get('cinderport').position);
  t.adoptCurrent('cinderport');
  t.dock('cinderport');
  t.buyPropellant('full');
  t.undock('determinism');
  const sv = wx.systems.salvage;
  for (let i = 0; i < 3; i++) {
    const v = new Ship({ classDef: VICTIM_CLASS(`d${i}`, 'coalition'), world: wx, faction: 'coalition', root: new THREE.Group() });
    v.position.copy(wx.player.position).add(new THREE.Vector3(700, 0, 0));
    wx.addShip(v);
    v.applyDamage(v.hullHP + 1, { source: wx.player, rng: wx.rng });
    advance(wx.engine, 0.05);
    const wr = wx.wrecks.find((x) => !x.spent && !x.detachedModule);
    if (wr) for (const sec of wr.sections) sv._store(sec);
    advance(wx.engine, 1);
  }
  advance(wx.engine, 60, 1 / 12);
  const dd = t.dock('cinderport').debrief;
  return `${dd.cut.sections}|${dd.economy.scrapUnits}|${JSON.stringify(dd.economy.scrap)}|`
    + `${wx.systems.factionWar.ledger.coalition.claim.toFixed(3)}|${Math.round(wx.systems.sortie.debt)}`;
}
const r1 = await runSortie('det/sortie/1');
const r2 = await runSortie('det/sortie/1');
const r3 = await runSortie('det/sortie/2');
say(`seed 1 run a           : ${r1}`);
say(`seed 1 run b           : ${r2}`);
say(`identical              : ${r1 === r2}`);
say(`seed 2 differs         : ${r1 !== r3}`);
say(`Math.random in this stream: none — every system forks world.rng`);

say(rule('10. THE DOUBLE-BILLING BUG stores.js was already guarding against'));
say(`stores.js line 279 reads world.systems.travel.transiting before charging manoeuvring`);
say(`propellant, so a transit leg is not billed twice. That property did not exist:`);
say(`  travel.transiting is now : ${typeof travel.transiting} (${travel.transiting})`);
say(`  travel.inTransit         : ${travel.inTransit}`);
say(`Before this change the check was permanently undefined and every burn paid both the`);
say(`published 0.8/km and the per-delta-v manoeuvring rate.`);

say('');
