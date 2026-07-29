/**
 * HEADLESS SIM HARNESS.
 *
 *   node src/sim/selftest.mjs
 *
 * Runs the simulation with no renderer, no DOM and no GPU, and prints real numbers for
 * every system in this stream. It is not a unit test suite and it is not a smoke test:
 * it is the thing that answers "does the system actually do anything", which is a
 * question compilation cannot answer.
 *
 * Every scenario is a controlled comparison - the same fight fought two ways - because
 * a number on its own proves nothing. Exits non-zero if any assertion fails.
 */

import * as THREE from 'three';
import { Engine } from '../core/loop.js';
import { World } from '../core/world.js';
import { Ship } from './ship.js';
import { CombatSystem } from './combat.js';
import { SalvageSystem, Wreck } from './salvage.js';
import { registerShipClass, getShipClass, registerModule, getModule } from '../core/contracts.js';
import { readFileSync, readdirSync } from 'node:fs';
import { SIM } from '../core/units.js';
import {
  fireRateMul, traverseMul, damageMul, misfeedChance, repairCost, scrapYield, cutQuality,
  salvageState, conditionLabel,
} from './condition.js';
import { THERMAL, thermalReport } from './heat.js';
import { storesReport, AMMO_SPEC } from './stores.js';
import { partAimPoints } from './subparts.js';

// ---------------------------------------------------------------------------
// harness plumbing
// ---------------------------------------------------------------------------

let failures = 0;
let checks = 0;
const fmt = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : String(v));

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`   PASS  ${label}${detail ? `   ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`   FAIL  ${label}${detail ? `   ${detail}` : ''}`);
  }
}

function heading(n, title) {
  console.log(`\n${'='.repeat(74)}\n${n}. ${title}\n${'='.repeat(74)}`);
}

/** A World with a real THREE.Scene and no renderer. Nothing here needs a GPU. */
function makeWorld(seed = 'selftest') {
  const engine = new Engine();
  const scene = new THREE.Scene();
  const fakeRenderer = { scene, far: new THREE.Scene(), camera: new THREE.PerspectiveCamera() };
  const world = new World({ engine, renderer: fakeRenderer, seed });
  return world;
}

function defineClasses() {
  if (getShipClass('test_cruiser')) return;

  // Registered modules so the wreck yield table has something real to match against.
  registerModule({
    id: 'test_coalition_cannon', name: 'Coalition Cannon Bank', hardpoint: 'port', tier: 2,
    faction: 'coalition', description: 'test', triBudget: 400, mass: 340,
    build: () => new THREE.Group(),
    weapon: {
      id: 'w1', name: 'cannon', type: 'cannon', range: 5200, damage: 44, shotsPerBurst: 4,
      burstInterval: 0.22, cooldown: 2.4, projectileSpeed: 1400, tracking: 0.5, powerDraw: 6,
    },
  });
  registerModule({
    id: 'test_coalition_sensor', name: 'Coalition Sensor Mast', hardpoint: 'dorsal', tier: 1,
    faction: 'coalition', description: 'test', triBudget: 300, mass: 90,
    build: () => new THREE.Group(), grants: { sensorRange: 4000 },
  });
  registerModule({
    id: 'test_coalition_reactor', name: 'Coalition Reactor Uprate', hardpoint: 'engine', tier: 2,
    faction: 'coalition', description: 'test', triBudget: 350, mass: 260,
    build: () => new THREE.Group(), grants: { powerOutput: 24 },
  });

  const cannon = (id, mount, yawCentre) => ({
    id, name: `${id} bank`, type: 'cannon', range: 5200, damage: 44, shotsPerBurst: 4,
    burstInterval: 0.22, cooldown: 2.4, projectileSpeed: 1400, tracking: 0.5, powerDraw: 6,
    yawWidth: Math.PI * 0.7, subsystemAccuracy: 0.7, mount, yawCentre,
  });
  const beam = (id, mount, yawCentre) => ({
    id, name: `${id} lance`, type: 'beam', range: 4200, damage: 30, shotsPerBurst: 6,
    burstInterval: 0.18, cooldown: 2.0, projectileSpeed: Infinity, tracking: 0.7, powerDraw: 9,
    yawWidth: Math.PI * 0.7, subsystemAccuracy: 0.92, mount, yawCentre,
  });

  registerShipClass({
    id: 'test_cruiser', name: 'Test Cruiser', faction: 'player', role: 'cruiser',
    length: 1400, mass: 42000, maxSpeed: 120, accel: 12, turnRate: 0.2, hullHP: 9000,
    triBudget: 2000, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 900, position: [0, 0, -60], radius: 70, salvageValue: 0.3, label: 'REACTOR' },
      { id: 'engine_main', kind: 'engine', hp: 800, position: [0, 0, -240], radius: 80, salvageValue: 0.2, label: 'MAIN DRIVE' },
      { id: 'battery_port', kind: 'weapon', hp: 620, position: [-120, 0, 60], radius: 60, salvageValue: 0.3, label: 'PORT BATTERY' },
      { id: 'battery_stbd', kind: 'weapon', hp: 620, position: [120, 0, 60], radius: 60, salvageValue: 0.3, label: 'STBD BATTERY' },
    ],
    weapons: [cannon('port_cannon', [-120, 0, 60], Math.PI * 0.5), beam('stbd_beam', [120, 0, 60], -Math.PI * 0.5)],
  });

  registerShipClass({
    id: 'test_destroyer', name: 'Test Destroyer', faction: 'coalition', role: 'destroyer',
    length: 480, mass: 9000, maxSpeed: 150, accel: 18, turnRate: 0.32, hullHP: 3200,
    triBudget: 1200, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 420, position: [0, 0, -30], radius: 34, salvageValue: 0.3, label: 'REACTOR' },
      { id: 'engine', kind: 'engine', hp: 380, position: [0, 0, -120], radius: 40, salvageValue: 0.2, label: 'DRIVE' },
      { id: 'battery_fwd', kind: 'weapon', hp: 300, position: [0, 0, 90], radius: 34, salvageValue: 0.35, label: 'FORWARD BATTERY' },
      { id: 'sensor', kind: 'sensor', hp: 160, position: [0, 20, 30], radius: 20, salvageValue: 0.15, label: 'SENSOR MAST' },
    ],
    weapons: [cannon('dd_cannon', [0, 0, 90], 0)],
  });
}

function spawn(world, classId, { player = false, x = 0, z = 0, heading = 0, faction } = {}) {
  const classDef = getShipClass(classId);
  const ship = new Ship({
    classDef, world, faction: faction ?? classDef.faction, isPlayer: player,
    root: new THREE.Group(), position: new THREE.Vector3(x, 0, z), heading,
  });
  world.addShip(ship);
  if (player) world.player = ship;
  return ship;
}

/** Step the sim `seconds` at the real fixed rate, driving ships the way game.js does. */
function run(world, seconds, systems = []) {
  const steps = Math.round(seconds / SIM.dt);
  for (let i = 0; i < steps; i++) {
    for (const s of systems) s.fixedUpdate(SIM.dt);
    for (const ship of world.ships) ship.fixedUpdate(SIM.dt);
    world.time += SIM.dt;
  }
}

// ---------------------------------------------------------------------------
// 1. condition
// ---------------------------------------------------------------------------

function testCondition() {
  heading(1, 'UNIVERSAL MODULE CONDITION');
  console.log('   cond   fireRate  traverse  damage  misfeed  band');
  for (const c of [1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0.15]) {
    console.log(`   ${fmt(c, 2)}   ${fmt(fireRateMul(c))}     ${fmt(traverseMul(c))}     ${fmt(damageMul(c))}   `
      + `${fmt(misfeedChance(c))}    ${conditionLabel(c)}`);
  }
  check('nominal condition costs nothing', fireRateMul(0.9) === 1 && damageMul(0.85) === 1);
  check('worn condition degrades rate and traverse',
    fireRateMul(0.6) < 1 && traverseMul(0.6) < 1,
    `rate ${fmt(fireRateMul(0.6))}, traverse ${fmt(traverseMul(0.6))}`);
  check('degraded condition adds misfeeds', misfeedChance(0.3) > 0 && misfeedChance(0.6) === 0,
    `p(jam) at 0.30 = ${fmt(misfeedChance(0.3))}`);
  check('inert below 0.20', fireRateMul(0.15) === 0);

  const cheap = repairCost(340, 0.7, 1);
  const dear = repairCost(340, 0.25, 1);
  console.log(`   repair 340 t from 0.70 -> 1.00 : ${cheap.alloy} alloy, ${cheap.composite} composite, ${cheap.exotic} exotic`);
  console.log(`   repair 340 t from 0.25 -> 1.00 : ${dear.alloy} alloy, ${dear.composite} composite, ${dear.exotic} exotic`);
  console.log(`   scrap  340 t at 0.90           : ${JSON.stringify(scrapYield(340, 0.9))}`);
  console.log(`   scrap  340 t at 0.30           : ${JSON.stringify(scrapYield(340, 0.3))}`);
  check('a wrecked part costs more per point of condition than a worn one',
    dear.alloy / (1 - 0.25) > cheap.alloy / (1 - 0.7) * 1.3,
    `${fmt(dear.alloy / 0.75, 1)}/pt vs ${fmt(cheap.alloy / 0.3, 1)}/pt`);
  check('scrapping a poor part pays less than scrapping a good one',
    scrapYield(340, 0.3).alloy < scrapYield(340, 0.9).alloy);

  const clean = cutQuality(0.8, 0, false);
  const hasty = cutQuality(0.8, 0, true);
  const burning = cutQuality(0.8, 0.9, false);
  console.log(`   cut 0.80 clean / cold  -> ${fmt(clean)}`);
  console.log(`   cut 0.80 fast  / cold  -> ${fmt(hasty)}`);
  console.log(`   cut 0.80 clean / burning -> ${fmt(burning)}`);
  check('a part cut from a burning wreck is worse than one cut clean',
    burning < clean - 0.2, `${fmt(burning)} vs ${fmt(clean)}`);
  check('the fast cut costs quality', hasty < clean);
}

// ---------------------------------------------------------------------------
// 2. heat
// ---------------------------------------------------------------------------

function testHeat() {
  heading(2, 'HEAT, PER MOUNT — and its interlock with power routing');
  defineClasses();

  /** Fire one ship at another for `seconds` under a named power preset. */
  function scenario(preset, seconds = 30) {
    const world = makeWorld(`heat:${preset}`);
    const combat = new CombatSystem(world);
    const player = spawn(world, 'test_cruiser', { player: true });
    const foe = spawn(world, 'test_destroyer', { x: 1200, z: 1200, faction: 'coalition' });
    world.reputation.coalition = -1;
    player.power.unlocked = true;
    player.power.applyPreset(preset);
    player.body.desiredHeading = Math.atan2(1200, 1200) - Math.PI * 0.5; // open the port battery
    player.orderAttack(foe);
    // Keep the target alive so the test measures thermals, not lethality.
    foe.hullHP = 1e9;
    for (const s of foe.subsystems.values()) s.hp = 1e9;

    run(world, seconds, [combat]);
    const t = thermalReport(player);
    const shots = player.stores.capacity.shell - player.stores.ammo.shell + (player.stores.ready ?? 0);
    return { world, player, t, combat, shots };
  }

  const assault = scenario('assault');
  const run3 = scenario('run');
  console.log(`   ASSAULT routing  load ${fmt(assault.player.power.thermalLoad)}  radiate ${fmt(assault.player.thermal.radiate)}`
    + `  peak heat ${fmt(assault.t.peak)}  EXT ${fmt(assault.t.ext, 1)}/${assault.t.extMax}  status ${assault.t.state}`);
  console.log(`   RUN routing      load ${fmt(run3.player.power.thermalLoad)}  radiate ${fmt(run3.player.thermal.radiate)}`
    + `  peak heat ${fmt(run3.t.peak)}  EXT ${fmt(run3.t.ext, 1)}/${run3.t.extMax}  status ${run3.t.state}`);
  for (const m of assault.t.mounts) {
    console.log(`     assault mount ${m.label.padEnd(18)} heat ${fmt(m.heat)}  rate ${fmt(m.rate)}/s  `
      + `tripped ${m.tripped}  online ${m.online}  reason ${m.offlineReason ?? '-'}`);
  }

  check('power routing changes the radiator budget',
    assault.player.thermal.radiate < run3.player.thermal.radiate - 0.05,
    `assault ${fmt(assault.player.thermal.radiate)} vs run ${fmt(run3.player.thermal.radiate)}`);
  check('sustained fire under assault routing runs hotter than under run routing',
    assault.t.peak > run3.t.peak,
    `${fmt(assault.t.peak)} vs ${fmt(run3.t.peak)}`);
  check('the status word actually changes', assault.t.state !== 'NOMINAL', assault.t.state);
  check('EXT readout tracks the bar', Math.abs(
    assault.t.ext - (THERMAL.extIdle + (THERMAL.extMax - THERMAL.extIdle) * assault.t.peak)) < 1e-6);

  // A mount that is deliberately cooked must trip, go offline and come back.
  const s = scenario('assault', 4);
  const mount = s.player.weapons[0];
  s.player.thermal.trip(mount);
  console.log(`   forced trip: online=${mount.online} reason=${mount.offlineReason} `
    + `condition=${fmt(mount.condition)} structure=${fmt(s.player.hardpoints.get('port')?.structureHP ?? -1, 0)}`);
  check('a tripped mount goes offline through the existing `online` path', mount.online === false);
  check('cooking a mount wears it', mount.condition < 1, `condition ${fmt(mount.condition)}`);
  // Break off before measuring the recovery: a mount that rearms and immediately
  // resumes firing is correct behaviour, but it is not what this check is about.
  s.player.orderHold();
  s.player.target = null;
  run(s.world, 30, [s.combat]);
  console.log(`   after 30 s cooling: heat ${fmt(mount.thermal.heat)} online ${mount.online}`);
  check('it rearms once it has cooled below the hysteresis point',
    mount.online === true && mount.thermal.heat <= THERMAL.rearmAt);

  // Coolant purge.
  const p = scenario('assault', 20);
  const before = p.t.peak;
  const purged = p.player.thermal.purge();
  p.player.thermal.update(SIM.dt);
  console.log(`   purge: ${purged}, peak ${fmt(before)} -> ${fmt(p.player.thermal.peak)}, `
    + `coolant ${p.player.stores.coolant}/${p.player.stores.coolantMax}`);
  check('a coolant purge is a real, finite action',
    purged && p.player.thermal.peak < before * 0.6 && p.player.stores.coolant === p.player.stores.coolantMax - 1);
}

// ---------------------------------------------------------------------------
// 3. stores
// ---------------------------------------------------------------------------

function testStores() {
  heading(3, 'STORES: AMMUNITION, CHARGE, PROPELLANT');
  defineClasses();

  const world = makeWorld('stores');
  const combat = new CombatSystem(world);
  const player = spawn(world, 'test_cruiser', { player: true });
  // One hostile on each beam, so the port cannon (kinetic) and the starboard lance
  // (energy) both engage and both currencies are actually spent.
  const foe = spawn(world, 'test_destroyer', { x: 900, z: 900, faction: 'coalition' });
  const foe2 = spawn(world, 'test_destroyer', { x: -900, z: -900, faction: 'coalition' });
  world.reputation.coalition = -1;
  player.power.unlocked = true;
  player.power.applyPreset('assault');
  player.orderAttack(foe);
  for (const f of [foe, foe2]) {
    f.hullHP = 1e9;
    for (const sub of f.subsystems.values()) sub.hp = 1e9;
  }
  player.body.desiredHeading = Math.atan2(900, 900) - Math.PI * 0.5;

  const startShell = player.stores.ammo.shell;
  const startProp = player.stores.tank().current;
  run(world, 45, [combat]);
  const rep = storesReport(player);
  console.log(`   KINETIC: shells ${startShell} -> ${player.stores.ammo.shell}`);
  for (const row of rep.ammo) {
    console.log(`     ${row.label.padEnd(8)} mag ${String(row.rounds).padStart(4)}/${row.capacity}  `
      + `feed ${row.ready}/${row.readyMax}  reloading ${fmt(row.reloading, 1)}s  dry ${row.dry}`);
  }
  check('kinetic fire consumes finite rounds', player.stores.ammo.shell < startShell,
    `${startShell - player.stores.ammo.shell} rounds spent`);

  // Now put the starboard lance on the target instead. Energy weapons never go dry -
  // they draw the same pool the shields want.
  player.orderAttack(foe2);
  player.body.desiredHeading = Math.atan2(-900, -900) + Math.PI * 0.5;
  const startCharge = player.stores.charge;
  run(world, 20, [combat]);
  const beamMount = player.weapons.find((m) => m.ammoClass === null);
  console.log(`   ENERGY : charge ${fmt(startCharge, 1)} -> ${fmt(player.stores.charge, 1)} of ${player.stores.chargeMax}`
    + `  (assault routing supplies ${fmt(player.power.get('weapons'), 1)} units)`);
  check('energy fire consumes reactor charge', player.stores.charge < startCharge,
    `${fmt(startCharge - player.stores.charge, 1)} units drawn`);

  // Starve the weapons channel: the lance runs dry on charge while the magazine is
  // untouched. Two currencies, and the power widget only pays one of them.
  const chargeAssault = player.stores.charge;
  player.power.applyPreset('turtle');
  run(world, 20, [combat]);
  console.log(`   under TURTLE routing: charge ${fmt(chargeAssault, 1)} -> ${fmt(player.stores.charge, 1)}, `
    + `weapons supply ${fmt(player.power.get('weapons'), 1)}, beam blocked = ${player.stores.blockedReason(beamMount) ?? 'no'}`);
  check('routing power away from weapons starves the energy mounts',
    player.stores.charge < chargeAssault || player.stores.blockedReason(beamMount) === 'CHARGE',
    `charge ${fmt(player.stores.charge, 1)}`);

  // Manoeuvring costs propellant.
  const prop0 = player.stores.tank().current;
  player.orderMove(new THREE.Vector3(6000, 0, 6000));
  run(world, 60, [combat]);
  const prop1 = player.stores.tank().current;
  console.log(`   propellant ${fmt(startProp, 1)} -> ${fmt(prop1, 1)}  `
    + `(${fmt(prop0 - prop1, 2)} spent on a 60 s burn, speed ${fmt(player.body.speed, 1)} m/s)`);
  check('manoeuvring spends propellant', prop1 < prop0, `${fmt(prop0 - prop1, 2)} units`);

  // Drain to the reserve floor and confirm the clamp, and that it is only a clamp.
  const tank = player.stores.tank();
  tank.current = tank.reserve + 0.05;
  // DEMAND delta-v, do not just let time pass. The previous version drained the tank
  // and ran five seconds while the ship was still coasting toward the waypoint above.
  // Coasting costs nothing — `_spend` returns early below 1e-4 of dv — so no draw was
  // ever refused, `starved` stayed false, and the assertion below failed against a
  // sim that was behaving correctly. Reversing the course forces a real burn.
  player.orderMove(new THREE.Vector3(-6000, 0, -6000));
  run(world, 5, [combat]);
  console.log(`   at reserve: propellant ${fmt(tank.current, 2)} (floor ${tank.reserve}), `
    + `starved ${player.stores.starved}, engine efficiency ${fmt(player.body.engineEfficiency)}`);
  check('the reserve floor is never breached', tank.current >= tank.reserve - 1e-6);
  check('running on the reserve clamps manoeuvring but does not strand you',
    player.stores.starved && player.body.engineEfficiency > 0 && player.body.engineEfficiency < 0.7);

  // Fabrication competes with repair for the same alloy.
  world.materials.alloy = 100;
  const fab = player.stores.fabricate('shell', 60, world.materials);
  console.log(`   fabricate 60 shells: ${JSON.stringify(fab)}  alloy left ${world.materials.alloy}`);
  check('ammunition is manufactured out of repair materials', fab.ok && world.materials.alloy < 100);
}

// ---------------------------------------------------------------------------
// 4. sub-parts
// ---------------------------------------------------------------------------

function testSubParts() {
  heading(4, 'MODULE SUB-PARTS');
  defineClasses();
  const world = makeWorld('parts');
  const combat = new CombatSystem(world);
  const player = spawn(world, 'test_cruiser', { player: true });
  const foe = spawn(world, 'test_destroyer', { x: 800, z: 0, faction: 'coalition' });
  world.reputation.coalition = -1;
  run(world, 0.1, [combat]);

  const aim = partAimPoints(foe);
  console.log(`   ${aim.length} aim points on a ${foe.classDef.name}:`);
  for (const a of aim) {
    console.log(`     ${a.weapon.padEnd(16)} ${a.label.padEnd(14)} ${a.kind.padEnd(9)} `
      + `hp ${fmt(a.health, 2)}  -> ${a.consequence}`);
  }
  check('every weapon mount presents 2..4 aim points', aim.length >= 2 && aim.length <= 4 * foe.weapons.length);

  const mount = foe.weapons[0];
  const baseRate = mount.parts.fireRateMul;
  const baseTrack = mount.halfArc;

  /**
   * Aimed part shots can miss - a traverse ring is a smaller thing to hit than the
   * battery it sits on, and `_partHit` prices that in. So each of these fires until it
   * connects and reports how many shots that took, which is itself a useful number.
   */
  const shootPart = (partId) => {
    let shots = 0;
    const part = mount.parts.get(partId);
    while (!part.destroyed && shots < 40) {
      foe.applyDamage(200, { subsystemId: 'battery_fwd', partId, accuracy: 1, rng: world.rng });
      shots++;
    }
    return shots;
  };

  // Kill the feed: rate of fire collapses, everything else keeps working.
  const feedShots = shootPart('feed');
  console.log(`   feed destroyed in ${feedShots} aimed shots -> fireRateMul ${fmt(baseRate)} -> `
    + `${fmt(mount.parts.fireRateMul)}, reloadMul ${fmt(mount.parts.reloadMul)}, inert ${mount.parts.inert}`);
  check('killing the feed slows the gun without disabling it',
    mount.parts.fireRateMul < baseRate && mount.parts.reloadMul > 1 && !mount.parts.inert);

  // Kill the traverse ring: the arc freezes.
  shootPart('ring');
  console.log(`   traverse destroyed -> frozen ${mount.parts.traverseFrozen}, `
    + `half-arc ${fmt(baseTrack)} rad -> ${fmt(mount.halfArc)} rad`);
  check('killing the traverse ring freezes the arc',
    mount.parts.traverseFrozen && mount.halfArc < baseTrack * 0.2);

  // Kill the barrels: inert.
  shootPart('barrels');
  console.log(`   output destroyed -> inert ${mount.parts.inert}, usable ${mount.usable}`);
  check('killing the barrels makes the module inert', mount.parts.inert && !mount.usable);

  // The payoff: shoot the pad off and the module drops as a salvageable object.
  const world2 = makeWorld('parts:detach');
  const salvage = new SalvageSystem(world2);
  world2.register('salvage', salvage);
  const player2 = spawn(world2, 'test_cruiser', { player: true });
  const foe2 = spawn(world2, 'test_destroyer', { x: 700, z: 0, faction: 'coalition' });
  world2.reputation.coalition = -1;
  run(world2, 0.1, [salvage]);
  const wrecksBefore = world2.wrecks.length;
  const pad = foe2.weapons[0].parts.get('pad');
  let padShots = 0;
  while (!pad.destroyed && padShots < 40) {
    foe2.applyDamage(200, { subsystemId: 'battery_fwd', partId: 'pad', accuracy: 1, rng: world2.rng });
    padShots++;
  }
  const dropped = world2.wrecks[world2.wrecks.length - 1];
  console.log(`   mount pad destroyed in ${padShots} shots -> wrecks ${wrecksBefore} -> ${world2.wrecks.length}`);
  if (dropped) {
    const sec = dropped.sections[0];
    console.log(`     "${dropped.name}"  condition ${fmt(sec.condition)}  state ${sec.state}  `
      + `moduleId ${sec.moduleId ?? '(none registered)'}  cuttable ${sec.cuttable}`);
  }
  check('shooting the mount pad drops the module into space as salvage',
    world2.wrecks.length === wrecksBefore + 1 && dropped?.sections[0].cuttable);
  check('the dropped module is INTACT, not wreckage',
    dropped && dropped.sections[0].condition > 0.6, `condition ${fmt(dropped?.sections[0].condition ?? 0)}`);
  check('the ship it came off knows the mount is gone',
    foe2.weapons[0].parts.detached && !foe2.weapons[0].usable);
}

// ---------------------------------------------------------------------------
// 5. per-section damage attribution
// ---------------------------------------------------------------------------

function testAttribution() {
  heading(5, 'PER-SECTION DAMAGE ATTRIBUTION FOR SALVAGE');
  defineClasses();

  /** Kill a destroyer two ways and compare what is left of it. */
  function killAndSalvage(mode) {
    const world = makeWorld(`attr:${mode}`);
    const salvage = new SalvageSystem(world);
    world.register('salvage', salvage);
    const player = spawn(world, 'test_cruiser', { player: true });
    const foe = spawn(world, 'test_destroyer', { x: 600, z: 0, faction: 'coalition' });
    world.reputation.coalition = -1;
    run(world, 0.1, [salvage]);

    const engine = foe.subsystems.get('engine');
    if (mode === 'surgical') {
      // Precise fire into the drive, then finish through the same hole.
      while (!foe.dead) {
        foe.applyDamage(90, {
          subsystemId: 'engine', point: engine.worldPosition, accuracy: 1,
          source: player, rng: world.rng,
        });
      }
    } else {
      // Hose the whole hull from close range with unaimed fire.
      let i = 0;
      while (!foe.dead) {
        const target = [...foe.sections.values()][i++ % foe.sections.size];
        foe.applyDamage(90, { point: target.worldPosition, source: player, rng: world.rng });
      }
    }
    run(world, 0.2, [salvage]);
    const wreck = world.wrecks[0];
    return { foe, wreck, salvage, world };
  }

  const surgical = killAndSalvage('surgical');
  const brawl = killAndSalvage('brawl');

  const show = (name, r) => {
    console.log(`   ${name}: hull-wide salvageIntegrity ${fmt(r.foe.salvageIntegrity)}`);
    for (const row of r.foe.salvageProjection()) {
      console.log(`     ${row.label.padEnd(18)} ${fmt(row.condition, 2)}  ${row.state.padEnd(8)} ${row.grade}`);
    }
    const modules = r.wreck.sections.filter((s) => s.yieldsModule).length;
    console.log(`     -> wreck sections ${r.wreck.sections.length}, of which yield an installable part: ${modules}`);
    return modules;
  };

  const surgicalModules = show('SURGICAL (drive only)', surgical);
  const brawlModules = show('BRAWL (everything)', brawl);

  const surgicalBattery = surgical.foe.sections.get('battery_fwd').condition;
  const brawlBattery = brawl.foe.sections.get('battery_fwd').condition;
  check('damage is attributed to the section that took it',
    surgical.foe.sections.get('engine').condition < surgicalBattery - 0.3,
    `engine ${fmt(surgical.foe.sections.get('engine').condition)} vs battery ${fmt(surgicalBattery)}`);
  check('a surgical kill leaves the weapon sections worth cutting',
    surgicalBattery > brawlBattery + 0.2, `${fmt(surgicalBattery)} vs ${fmt(brawlBattery)}`);
  check('the wreck carries the per-section condition through',
    surgicalModules >= brawlModules, `${surgicalModules} vs ${brawlModules} installable parts`);
  check('salvageIntegrity still reads as one number for existing consumers',
    surgical.foe.salvageIntegrity > 0 && surgical.foe.salvageIntegrity <= 1);

  // The reactor rule must survive the refactor.
  const world = makeWorld('attr:reactor');
  const salvage = new SalvageSystem(world);
  world.register('salvage', salvage);
  spawn(world, 'test_cruiser', { player: true });
  const victim = spawn(world, 'test_destroyer', { x: 600, z: 0, faction: 'coalition' });
  world.reputation.coalition = -1;
  run(world, 0.1, [salvage]);
  victim.applyDamage(5000, { subsystemId: 'reactor', accuracy: 1, rng: world.rng });
  console.log(`   reactor kill -> salvageIntegrity ${fmt(victim.salvageIntegrity)}, dead ${victim.dead}`);
  const wreck = world.wrecks[0];
  console.log(`   wreck residual heat ${fmt(wreck.residualHeat)} (cools in ${fmt(wreck.coolIn, 0)} s)`);
  check('a reactor kill still floors every section', victim.salvageIntegrity <= 0.16);
  check('a reactor kill leaves a burning wreck', wreck.residualHeat > 0.6);

  // Cutting the burning wreck vs waiting for it to cool.
  const hotSection = wreck.sections.find((s) => s.cuttable);
  const hot = cutQuality(hotSection.condition, wreck.residualHeat, false);
  const cold = cutQuality(hotSection.condition, 0, false);
  console.log(`   cutting "${hotSection.label}" now -> ${fmt(hot)} (${salvageState(hot)}), `
    + `after it cools -> ${fmt(cold)} (${salvageState(cold)})`);
  check('waiting for a wreck to cool is worth something', cold > hot);
}

// ---------------------------------------------------------------------------
// 6. repair under scarcity
// ---------------------------------------------------------------------------

function testRepair() {
  heading(6, 'HEAT/CONDITION-AWARE REPAIR UNDER SCARCITY');
  defineClasses();

  // RefitSystem needs an attachment shim and a hull result; both are injected, which is
  // exactly why it can be exercised without the geometry stream.
  const world = makeWorld('repair');
  const player = spawn(world, 'test_cruiser', { player: true });
  const stubModule = {
    id: 'test_cannon_bank', name: 'Test Cannon Bank', hardpoint: 'port', tier: 2,
    faction: 'coalition', mass: 340, build: () => new THREE.Group(), triBudget: 400,
    weapon: getShipClass('test_cruiser').weapons[0],
    grants: { powerOutput: 20 },
  };
  const attachment = { attachModule: () => ({ object: new THREE.Group() }), detachModule: () => {} };
  world.hullResult = { hardpoints: new Map() };

  return import('./refit.js').then(({ RefitSystem }) => {
    const refit = new RefitSystem(world, attachment);
    world.register('refit', refit);

    // Install a worn module by hand, the way a salvaged part arrives.
    const hp = player.hardpoints.get('port');
    hp.module = { moduleId: stubModule.id, condition: 0.42, uid: 'test:1', def: stubModule };
    refit._applyModuleEffects(player);

    const mount = player.weapons.find((m) => m.hardpoint === 'port');
    console.log(`   installed at condition 0.42 -> mount condition ${fmt(mount.condition)}, `
      + `fire rate x${fmt(fireRateMul(mount.condition))}, power grant ${fmt(player.power.bonusOutput, 1)} of 20`);
    check('condition follows the part onto the hull', mount.condition === 0.42);
    check('condition scales passive grants too', player.power.bonusOutput < 20 && player.power.bonusOutput > 0);
    check('mass makes the hull slower', player.massLoad > 1 && player.body.accel < player.classDef.accel,
      `massLoad ${fmt(player.massLoad)}, accel ${fmt(player.body.accel, 2)} vs ${player.classDef.accel}`);

    // Break a sub-part and starve the materials pool.
    mount.parts.damagePart(mount.parts.get('ring'), 1e6);
    player.hullHP = player.maxHullHP * 0.7;
    player.stores.ammo.shell = 10;
    world.materials.alloy = 60;
    world.materials.composite = 20;
    world.materials.exotic = 1;

    const plan = refit.repairPlan();
    console.log(`   TRIAGE (alloy ${world.materials.alloy}, composite ${world.materials.composite}, exotic ${world.materials.exotic}):`);
    for (const row of plan) {
      console.log(`     ${String(Math.round(row.priority)).padStart(3)}  ${row.label.padEnd(34)} `
        + `${String(row.cost.alloy).padStart(4)}a ${String(row.cost.composite).padStart(3)}c ${row.cost.exotic}x  `
        + `${row.affordable ? 'CAN AFFORD' : 'cannot    '}  ${row.detail}`
        + (row.scrapYield ? `   [scrapping pays ${row.scrapYield.alloy}a]` : ''));
    }
    const bill = refit.repairBill();
    console.log(`   full bill: ${bill.alloy}a ${bill.composite}c ${bill.exotic}x — coverable: ${bill.coverable}`);
    check('the triage screen lists every repairable thing', plan.length >= 4, `${plan.length} rows`);
    check('scarcity is real: the full bill exceeds the pool', !bill.coverable);
    check('at least one job is unaffordable and says so', plan.some((r) => !r.affordable));
    check('a dead sub-part outranks cosmetic wear',
      plan.findIndex((r) => r.kind === 'part') < plan.findIndex((r) => r.kind === 'hull'));
    const moduleRow = plan.find((r) => r.kind === 'module');
    check('repair-versus-scrap is presented as one comparison',
      !!moduleRow?.scrapYield && moduleRow.scrapYield.alloy > 0,
      `restore ${moduleRow?.cost.alloy}a vs scrap +${moduleRow?.scrapYield.alloy}a`);

    // A hot mount cannot be serviced.
    mount.thermal.heat = 0.9;
    world.materials.alloy = 500; world.materials.composite = 500; world.materials.exotic = 5;
    const job = refit.repairModule('port', 0.8);
    console.log(`   queued: ${job.ok} ${job.job?.label ?? job.reason} (cost ${JSON.stringify(job.cost)})`);
    refit.fixedUpdate(SIM.dt);
    console.log(`   with the mount at heat 0.90 the job reports: ${refit.active?.blocked}`);
    check('a hot mount cannot be worked on', refit.active?.blocked === 'MOUNT HOT');

    mount.thermal.heat = 0;
    for (let i = 0; i < 60 * 30; i++) refit.fixedUpdate(SIM.dt);
    console.log(`   after cooling and 30 s of work: condition ${fmt(mount.condition)}`);
    check('repair actually restores condition over time', mount.condition >= 0.79,
      `0.42 -> ${fmt(mount.condition)}`);

    // Partial repair is a real option under scarcity.
    const partial = repairCost(340, 0.35, 0.55);
    const full = repairCost(340, 0.35, 1);
    console.log(`   partial 0.35->0.55 costs ${partial.alloy}a; full 0.35->1.00 costs ${full.alloy}a`);
    check('buying only what you need is much cheaper', partial.alloy * 2 < full.alloy);

    const scrapped = refit.scrapInstalled('port');
    console.log(`   scrapping the repaired module instead pays ${JSON.stringify(scrapped.yield)}`);
    check('scrapping an installed module is available and pays materials',
      scrapped.ok && scrapped.yield.alloy > 0);
  });
}

// ---------------------------------------------------------------------------
// determinism
// ---------------------------------------------------------------------------

function testDeterminism() {
  heading(7, 'DETERMINISM — no Math.random anywhere in the stream');
  defineClasses();
  const fingerprint = (seed) => {
    const world = makeWorld(seed);
    const combat = new CombatSystem(world);
    const salvage = new SalvageSystem(world);
    world.register('salvage', salvage);
    const player = spawn(world, 'test_cruiser', { player: true });
    const foe = spawn(world, 'test_destroyer', { x: 900, z: 900, faction: 'coalition' });
    world.reputation.coalition = -1;
    player.power.unlocked = true;
    player.power.applyPreset('assault');
    player.orderAttack(foe, 'engine');
    player.body.desiredHeading = Math.atan2(900, 900) - Math.PI * 0.5;
    run(world, 40, [combat, salvage]);
    return [
      foe.hullHP.toFixed(4), foe.salvageIntegrity.toFixed(6),
      player.thermal.peak.toFixed(6), player.stores.ammo.shell,
      world.wrecks.length, world.wrecks[0]?.sections.length ?? 0,
    ].join('|');
  };
  const a = fingerprint('run-A');
  const b = fingerprint('run-A');
  console.log(`   seed A #1 : ${a}`);
  console.log(`   seed A #2 : ${b}`);
  check('the same seed reproduces exactly', a === b);

  // A seeded run is only reproducible if nothing in the stream reaches for the global
  // generator. This is cheap to check and impossible to argue with.
  // Scan for what actually breaks determinism — CALLING the global generator, or
  // aliasing it so it can be called later. The previous version tested for the bare
  // identifier and then stripped two hard-coded strings to get a pass, one of which
  // (`Math.random === undefined`) was cut to fit a single no-op line in strikecraft.js.
  // An allowlist shaped like one line of code is not a check, and prose about the rule
  // in a comment or a log string should never have had to be smuggled past it.
  const CALL = /Math\.random\s*\(/;
  const ALIAS = /[=:]\s*Math\.random\b\s*[^(]/;
  const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.js'));
  const offenders = files.filter((f) => {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    return CALL.test(src) || ALIAS.test(src);
  });
  console.log(`   scanned ${files.length} files in src/sim for Math.random: ${offenders.length ? offenders.join(', ') : 'none'}`);
  check('no Math.random anywhere in src/sim', offenders.length === 0, offenders.join(', '));
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('NADIR POINT — combat & salvage depth harness');
  console.log(`three.js ${THREE.REVISION}, fixed step ${SIM.hz} Hz`);
  testCondition();
  testHeat();
  testStores();
  testSubParts();
  testAttribution();
  await testRepair();
  testDeterminism();

  console.log(`\n${'='.repeat(74)}`);
  console.log(`${checks - failures} of ${checks} checks passed`);
  console.log('='.repeat(74));
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
