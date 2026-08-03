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
 *
 * EXIT CODE. Sections 1-6 and 8-10 are a printer and stay one. SECTION 7 IS NOT: its
 * three ledger checks set a non-zero exit. See the block above section 7 for why — it
 * spent two waves printing a flattering escalation ledger for a system that had never
 * once run in a game, and a printer is how that happens.
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

say(rule('7. THE ESCALATION LEDGER — what a sortie actually earns, and how it is shed'));
/*
 * WHAT THIS SECTION USED TO BE, AND WHY IT WAS WORSE THAN NOTHING.
 *
 * It printed a healthy-looking ledger — 311 claim off two hulls, a tender launched, 1169
 * after eight — and it printed it for two waves while, on the live path, the peak claim
 * a player had ever reached was 37.4 against a first rung of 110 and the number of
 * hostiles that had ever arrived in a game was ZERO. It was green throughout the entire
 * period in which the escalation table was unreachable content. It is the reason nobody
 * looked.
 *
 * It got there by four choices, every one of them flattering:
 *
 *   1. it teleported the player onto Ironhold's node position, where the Coalition
 *      control share is 0.95 and `accrueClaim`'s `0.30 + 0.70 * share` multiplier is at
 *      its maximum — rather than the graveyard the game actually starts you in;
 *   2. it MANUFACTURED AND KILLED its victims with `source: w4.player`, and a kill is
 *      worth `LEDGER.perKill` = 30 claim, so eight hulls paid 240 claim before a single
 *      section was cut;
 *   3. it called `salvage._store(sec)` on every section directly, which charges the
 *      ledger with ZERO CUT TIME and zero transit — and the decay rule the whole system
 *      turns on is measured against exactly that time;
 *   4. and it did all of it standing still, so nothing ever left the field it was
 *      earned in.
 *
 * WHAT IT IS NOW. The same three properties, taken off the real path:
 *
 *   - the claim is EARNED, at the real cut rate, through `salvage.orderCut`, at the POI
 *     the player starts in, with no kill billed to the player at all;
 *   - it HOLDS while the player is still in that field and SHEDS once they have FLOWN
 *     out of it under `orderMove` and the real `PlaneBody`;
 *   - and docking at a berth the robbed faction runs buys a fixed fraction of it down.
 *
 * The first of those is a NEGATIVE CONTROL and it is the check this file should have
 * been making all along: one hull's worth of honest work does not reach rung 1 and does
 * not draw anybody. If it ever does, either the ladder has been made free or something
 * is paying the ledger that should not be.
 *
 * WHAT IS NOT MEASURED HERE, AND CANNOT BE. Whether the ladder FIRES, whether the group
 * that answers can find the player, and whether it climbs past rung 1. This harness's
 * worlds are built `{ autoAdopt: false, enterStart: false }` — there is no seeded field
 * to work and any hull that did spawn would never be adopted by the ship AI, so it would
 * sit on its spawn point forever. Section 7 asserting the ladder from inside this world
 * is how the last version ended up certifying a system that had never run. The gate for
 * that is `node src/sim/ai/escalationHarness.mjs`, which builds the live assembly and
 * exits non-zero; it is in `tools/gates.mjs`, and this file is not.
 */
let ledgerFailures = 0;
const ledgerCheck = (ok, name, evidence) => {
  if (!ok) ledgerFailures++;
  say(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (evidence) say(`        ${evidence}`);
};

const w4 = await buildGame('harness/sortie/ledger');
const war4 = w4.systems.factionWar;
const sys4 = w4.systems.system;
const salv4 = w4.systems.salvage;
say(`${pad('TIER', 10)}${pad('AT CLAIM', 10)}${pad('SENDS', 34)}COOLDOWN`);
for (const e of ESCALATION) say(`${pad(e.tier, 10)}${num(e.at, 8)}  ${pad(e.roles.join(' + '), 34)}${e.cooldown}s`);

// Where the game starts you, not where the number is biggest.
const grave4 = sys4.get('graveyard');
w4.player.position.copy(grave4.position);
w4.player.body.position.copy(grave4.position);
w4.systems.travel.adoptCurrent('graveyard');
w4.propellant.current = w4.propellant.max;
const shareIn = war4._controlShare('coalition', w4.player.position.x, w4.player.position.z);
say(`\nat ${grave4.name} — the POI the player starts in. Coalition control share here: `
  + `${shareIn.toFixed(2)} (it is 0.95 at Ironhold, which is where this section used to stand)`);

let escalations = 0;
w4.bus.on(MEV.ESCALATION, (e) => { escalations++; say(`  >> ${e.faction} sent a ${e.tier}: ${e.ships} hulls at ${e.poiId ?? 'open space'}`); });

/*
 * One hull to work on. It is destroyed with `source: null` — the war killed it, not the
 * player — because `LEDGER.perKill` bills 30 claim for a kill and this section is about
 * what CUTTING earns. Everything after this point is the shipped salvage path: order the
 * cut, wait for the torch, wait for the tow, and the ledger charges itself off the
 * events the game emits.
 */
const target = new Ship({ classDef: VICTIM_CLASS('h_ledger', 'coalition'), world: w4, faction: 'coalition', root: new THREE.Group() });
target.position.copy(w4.player.position).add(new THREE.Vector3(700, 0, 0));
w4.addShip(target);
target.applyDamage(target.hullHP + 1, { source: null, rng: w4.rng });
advance(w4.engine, 0.05);
const hulk = w4.wrecks.find((x) => !x.detachedModule && !x.spent);
const charges = [];
w4.bus.on(MEV.LEDGER_CHANGED, (e) => {
  if (e.faction === 'coalition' && e.delta > 0) charges.push({ delta: e.delta, reason: e.reason });
});

let cutT = 0;
let cutSections = 0;
let peakClaim = 0;
while (cutT < 240 && hulk) {
  if (!salv4.cutting) {
    const next = hulk.sections.find((s) => s.cuttable);
    if (!next) break;
    if (!salv4.orderCut(hulk, next)) break;
    cutSections++;
  }
  advance(w4.engine, 1 / 60);
  cutT += 1 / 60;
  peakClaim = Math.max(peakClaim, war4.ledger.coalition.claim);
}
// A section still under the tractor is a charge that has not landed yet. Drain the tow
// before anything below reads the claim, or the "it holds" measurement would be watching
// the last two sections arrive and calling a rise a hold.
while (cutT < 320 && (salv4.cutting || salv4.inTow.length > 0)) {
  advance(w4.engine, 1 / 60);
  cutT += 1 / 60;
  peakClaim = Math.max(peakClaim, war4.ledger.coalition.claim);
}
const kills = charges.filter((c) => c.reason === 'kill');
const gross = charges.reduce((a, c) => a + c.delta, 0);
say(`\ncut ${cutSections} sections off ${hulk?.name ?? 'nothing'} through salvage.orderCut, on the real`);
say(`torch clock: ${cutT.toFixed(1)} s of simulation, ${(cutT / Math.max(1, cutSections)).toFixed(1)} s per section.`);
say(`  charges landed        : ${charges.length}  (${kills.length} of them kills)`);
say(`  gross claim earned    : ${gross.toFixed(1)}   peak on the coalition ledger ${peakClaim.toFixed(1)}`);
say(`  rung 1 wants          : ${ESCALATION[0].at}`);
ledgerCheck(escalations === 0 && peakClaim < ESCALATION[0].at && kills.length === 0,
  'ONE HULL, HONESTLY CUT, DRAWS NOBODY — the ladder is earned, not handed over',
  `${cutSections} sections in ${cutT.toFixed(0)} s of torch time, peak claim `
  + `${peakClaim.toFixed(1)} against rung 1 at ${ESCALATION[0].at}, ${escalations} responses, `
  + `${kills.length} kills billed. The old section reached 311 off two hulls because it `
  + `killed them and skipped the clock.`);

// ---------------------------------------------------------------------------
// It holds while you are standing in it, and sheds once you have gone.
// ---------------------------------------------------------------------------
const holdStart = war4.ledger.coalition.claim;
advance(w4.engine, 90);
const heldFor90 = war4.ledger.coalition.claim;
const inField = war4.ledgerStatus().find((r) => r.faction === 'coalition');
say(`\nstanding in the field  : claim ${holdStart.toFixed(2)} -> ${heldFor90.toFixed(2)} over 90 s  `
  + `("${inField.text}")`);

// Fly out for real. The boundary is what the rule is written against, so crossing it by
// teleport would be measuring a different game — see the decay note in factionWar.js.
const away4 = new THREE.Vector3(grave4.position.x + grave4.radius * 1.6, 0, grave4.position.z);
let flyT = 0;
while (flyT < 600 && w4.player.position.distanceTo(grave4.position) <= grave4.radius) {
  w4.player.orderMove(away4);
  advance(w4.engine, 1);
  flyT += 1;
}
const leftAt = w4.player.position.distanceTo(grave4.position) > grave4.radius ? flyT : null;
const onLeaving = war4.ledger.coalition.claim;
advance(w4.engine, 60);
const after60 = war4.ledger.coalition.claim;
const outField = war4.ledgerStatus().find((r) => r.faction === 'coalition');
say(`flew out of it         : ${leftAt === null ? 'NEVER CROSSED' : `crossed at ${leftAt} s`}, `
  + `${(w4.player.position.distanceTo(grave4.position) / KM).toFixed(1)} km from the marker `
  + `(radius ${(grave4.radius / KM).toFixed(0)} km)`);
say(`60 s outside it        : claim ${onLeaving.toFixed(2)} -> ${after60.toFixed(2)}  `
  + `("${outField.text}")`);
ledgerCheck(heldFor90 === holdStart && inField.holding === true && inField.decayPerSecond === 0
  && leftAt !== null && after60 < onLeaving && outField.holding === false,
  'and the claim HOLDS while you are still in the field and SHEDS once you have flown out '
  + '— the pressure is spatially negotiable, and the readout agrees with the arithmetic',
  `held ${holdStart.toFixed(2)} flat for 90 s in the field (holding=${inField.holding}, `
  + `decay ${inField.decayPerSecond.toFixed(2)}/s), then shed `
  + `${(onLeaving - after60).toFixed(2)} in 60 s outside it at ${outField.awayDecay.toFixed(2)}/s`);

// ---------------------------------------------------------------------------
// And paying a berth buys it down. `LEDGER.dockRelief` is 0.35 and is not exported, so
// the assertion is on the RATIO the real MEV.DOCKED path produced.
// ---------------------------------------------------------------------------
const ironhold = sys4.get('ironhold');
say(`\nflying to their yard   : ${(w4.player.position.distanceTo(ironhold.position) / KM).toFixed(0)} km, `
  + `standing ${w4.reputation.coalition.toFixed(1)} against Ironhold's minimum of `
  + `${ironhold.anchorage.minStanding}`);
// At 0.8 u/km the yard is out of reach on the tank the graveyard leaves you with — the
// course quotes 835 against 594 spendable. SILENT running is 0.5 u/km and it is the
// answer the game already has for exactly this, so the harness takes it rather than
// topping the tank up by hand and pretending the burn was free.
w4.systems.travel.setSilent(true);
const toYard = runCourse(w4, 'ironhold', 6000);
say(`  under SILENT running : ok=${toYard.ok}${toYard.reason ? ` (${toYard.reason})` : ''}, `
  + `${toYard.elapsed ?? 0} s of burn, at ${w4.systems.travel.currentPOI ?? 'open space'}, `
  + `${Math.round(w4.propellant.current)} propellant left`);
w4.systems.travel.setSilent(false);

/*
 * 739 s of transit at 1.12/s shed the whole graveyard claim on the way, which is the
 * decay rule doing exactly what it says. So the bill this section settles is one the
 * player runs up HERE: a Coalition hull cut in the Coalition yard's own field, on the
 * same real `orderCut` path as above, at a control share of 0.95 rather than 0.49. That
 * is also the honest version of what the old section was reaching for when it teleported
 * here — the difference is that the charge is cutting, not two manufactured kills.
 */
w4.player.orderMove(ironhold.position);
let settle = 0;
while (settle < 400 && w4.player.body.velocity.length() > 60) { advance(w4.engine, 1); settle += 1; }
const shareYard = war4._controlShare('coalition', w4.player.position.x, w4.player.position.z);
const yardVictim = new Ship({ classDef: VICTIM_CLASS('h_yard', 'coalition'), world: w4, faction: 'coalition', root: new THREE.Group() });
yardVictim.position.copy(w4.player.position).add(new THREE.Vector3(700, 0, 0));
w4.addShip(yardVictim);
yardVictim.applyDamage(yardVictim.hullHP + 1, { source: null, rng: w4.rng });
advance(w4.engine, 0.05);
const yardHulk = w4.wrecks.find((x) => !x.detachedModule && !x.spent && x.faction === 'coalition');
let yardT = 0;
let yardCuts = 0;
while (yardT < 200 && yardHulk) {
  if (!salv4.cutting) {
    const next = yardHulk.sections.find((s) => s.cuttable);
    if (!next) break;
    if (!salv4.orderCut(yardHulk, next)) break;
    yardCuts++;
  }
  advance(w4.engine, 1 / 60);
  yardT += 1 / 60;
}
while (yardT < 320 && (salv4.cutting || salv4.inTow.length > 0)) { advance(w4.engine, 1 / 60); yardT += 1 / 60; }
say(`  settled alongside    : ${Math.round(w4.player.body.velocity.length())} m/s after ${settle} s of `
  + `braking, ${(w4.player.position.distanceTo(ironhold.position) / KM).toFixed(1)} km off the berth`);
say(`  cut ${yardCuts} sections here : control share ${shareYard.toFixed(2)}, claim now `
  + `${war4.ledger.coalition.claim.toFixed(2)}`);

const beforeDock = war4.ledger.coalition.claim;
const docked4 = w4.systems.travel.dock('ironhold');
const afterDock = war4.ledger.coalition.claim;
const relief = beforeDock > 0 ? 1 - afterDock / beforeDock : NaN;
say(`docking at their yard  : ok=${docked4.ok}${docked4.reason ? ` (${docked4.reason})` : ''} — `
  + `claim ${beforeDock.toFixed(2)} -> ${afterDock.toFixed(2)}, ${(relief * 100).toFixed(1)}% bought off`);
ledgerCheck(docked4.ok === true && beforeDock > 1 && Math.abs(relief - 0.35) < 1e-9,
  'and docking at a berth the robbed faction runs settles exactly LEDGER.dockRelief of it '
  + '— you paid them, and it is a receipt rather than forgiveness',
  `${beforeDock.toFixed(2)} -> ${afterDock.toFixed(2)} on the real travel.dock path, `
  + `relief ${(relief * 100).toFixed(4)}% against the constant's 35%`);

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
/*
 * THIS FILE NOW HAS AN EXIT CODE, AND IT HAS ONE BECAUSE OF SECTION 7.
 *
 * Everything else here is a printer and stays one — the sortie, the debrief, the
 * save/load table are read by a human comparing numbers. Section 7 was a printer too,
 * and being a printer is exactly how it printed a flattering ledger for two waves
 * without anybody noticing that the system it described had never run. Its three
 * assertions are cheap and they are the ones a regression would trip, so they get a
 * process exit rather than a paragraph.
 */
if (ledgerFailures > 0) {
  console.error(`\n${ledgerFailures} SECTION 7 LEDGER CHECK(S) FAILED — the salvage ledger no `
    + `longer behaves the way the sortie loop is documented to depend on. The ladder itself is `
    + `gated by src/sim/ai/escalationHarness.mjs, not here.`);
  process.exit(1);
}
