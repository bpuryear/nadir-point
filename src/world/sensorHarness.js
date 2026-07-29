/**
 * HEADLESS EXERCISE HARNESS for terrain, contact resolution, probes and codex bias.
 *
 *     node src/world/sensorHarness.js
 *
 * It builds a real `World`, a real `Engine`, a real `StarSystem`, a real
 * `FactionWarSystem`, a real `TravelSystem` and a real `DiscoverySystem`, drives the
 * 60 Hz fixed step, and prints numbers that came out of the simulation. Wrecks are made
 * by `salvage.js` from ships killed by `applyDamage`. Nothing in here is a mock and
 * nothing in here is a comment pretending to be a measurement.
 *
 * Seven sections, each of which is a claim this wave makes, with the evidence under it:
 *
 *   1. the terrain table, and what it does to a point in space
 *   2. contact resolution as a curve in range and in time
 *   3. the SENSORS power channel, which had zero combat effect before this wave
 *   4. terrain in the transit interception roll: hiding, and being lit up
 *   5. probes, and the enemy-probe dilemma priced in both directions
 *   6. codex-biased wreck contents against the uniform pick it replaced
 *   7. per-section damage attribution, and proof salvage reads it rather than rolling
 */

import * as THREE from 'three';
import { Engine } from '../core/loop.js';
import { World } from '../core/world.js';
import { allModules } from '../core/contracts.js';
import { KM } from '../core/units.js';
import { Ship } from '../sim/ship.js';
import { SalvageSystem } from '../sim/salvage.js';
import { CodexSystem } from '../sim/meta/codex.js';
import { buildSystem, TERRAIN, START_POI } from './system.js';
import { FactionWarSystem } from './factionWar.js';
import { TravelSystem } from './travel.js';
import { DiscoverySystem } from './discovery.js';

// The module library registers itself on import. Without it `allModules()` is empty and
// section 6 has nothing to bias, which would make the codex test a tautology.
await import('../art/geometry/modules/index.js');

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 7, dp = 2) => String(typeof v === 'number' ? Math.round(v * 10 ** dp) / 10 ** dp : v).padStart(n);
const pct = (v, n = 6) => `${(v * 100).toFixed(1)}%`.padStart(n);
const rule = (t) => `\n${'='.repeat(84)}\n${t}\n${'='.repeat(84)}`;

function makeWorld(seed = 'harness/sensors/001') {
  const engine = new Engine();
  const stub = {
    scene: new THREE.Scene(),
    far: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
  };
  return new World({ engine, renderer: stub, seed });
}

function advance(engine, seconds, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) engine._fixedStep(dt);
  return steps;
}

const CRUISER = {
  id: 'harness_cruiser', name: 'Harness Cruiser', faction: 'player', role: 'cruiser',
  length: 1400, mass: 62000, maxSpeed: 140, accel: 14, turnRate: 0.22, hullHP: 12000,
  triBudget: 2000, planeLocked: true, build: () => new THREE.Group(),
  subsystems: [
    { id: 'reactor', kind: 'reactor', hp: 1800, position: [0, 20, -60], radius: 130, salvageValue: 0.3, label: 'Reactor' },
  ],
  weapons: [],
};

function victimClass(faction, id) {
  return {
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
}

/** A world with the whole world-sim stack in it, installed by hand so nothing is hidden. */
function makeRig({ seed = 'harness/sensors/001', startPOI = START_POI, sensors = null } = {}) {
  const world = makeWorld(seed);
  const system = buildSystem(startPOI);
  const war = new FactionWarSystem(world, system, {});
  const travel = new TravelSystem(world, system, war, {});
  const discovery = new DiscoverySystem(world, system, war, { startPOI, startBlips: 2 });
  world.register('system', system);
  world.register('factionWar', war);
  world.register('travel', travel);
  world.register('discovery', discovery);
  world.engine.add(war);
  world.engine.add(travel);
  world.engine.add(discovery);

  const player = new Ship({ classDef: CRUISER, world, faction: 'player', isPlayer: true, root: new THREE.Group() });
  world.player = player;
  world.addShip(player);
  world.engine.add({ name: 'ships', order: 60, fixedUpdate: (dt) => { for (const s of world.ships) s.fixedUpdate(dt); } });

  if (sensors != null) {
    player.power.unlocked = true;
    const rest = (1 - sensors) / 3;
    player.power.setAll({ sensors, shields: rest, weapons: rest, engines: rest });
    // Skip the spool so the harness measures the sensor setting, not the ramp to it.
    for (const ch in player.power.target) player.power.actual[ch] = player.power.target[ch];
  }
  return { world, system, war, travel, discovery, player };
}

function place(player, x, z) {
  player.body.position.set(x, 0, z);
  player.body.velocity.set(0, 0, 0);
}

// ===========================================================================
// 1. THE TERRAIN TABLE
// ===========================================================================
function section1() {
  console.log(rule('1. TERRAIN — the table, and every POI that now carries one'));
  const { system, discovery } = makeRig();

  console.log(pad('TERRAIN', 12) + num('SIGNATURE', 11) + num('SENSOR', 9) + num('CLUTTER', 9) + num('REACH km', 10));
  for (const t of Object.values(TERRAIN)) {
    console.log(pad(t.id, 12) + num(t.signature, 11) + num(t.sensor, 9) + num(t.clutter, 9) + num(t.reach / KM, 10, 0));
  }

  console.log('\n' + pad('POI', 22) + pad('KIND', 12) + pad('TERRAIN', 12)
    + num('SIG', 6) + num('SENSOR', 8) + num('CLUTTER', 9));
  for (const n of system.nodes) {
    console.log(pad(n.name, 22) + pad(n.kind, 12) + pad(n.terrainId, 12)
      + num(n.terrain.signature, 6) + num(n.terrain.sensor, 8) + num(n.terrain.clutter, 9));
  }

  // The falloff, measured. A reading at the centre, at the edge of the arrival
  // boundary, half way out, and beyond the reach where it must be exactly open space.
  const belt = system.get('marrow-shoal');
  const giant = system.get('giant-orbit');
  console.log('\nFALLOFF — Marrow Shoal (belt, reach 150 km) sampled outward along +X');
  console.log(pad('OFFSET km', 12) + pad('TERRAIN', 12) + num('WEIGHT', 8) + num('SIG', 7) + num('SENSOR', 8) + num('CLUTTER', 9));
  for (const km of [0, 26, 50, 90, 140, 160, 260]) {
    const t = system.terrainAt(belt.position.x + km * KM, belt.position.z);
    console.log(pad(km, 12) + pad(t.id, 12) + num(t.weight, 8) + num(t.signature, 7) + num(t.sensor, 8) + num(t.clutter, 9));
  }

  // Two masks overlapping: strongest wins, they do not stack into an invisible corridor.
  const mid = {
    x: (belt.position.x + giant.position.x) * 0.5,
    z: (belt.position.z + giant.position.z) * 0.5,
  };
  const t = system.terrainAt(mid.x, mid.z);
  const dBelt = Math.hypot(mid.x - belt.position.x, mid.z - belt.position.z) / KM;
  const dGiant = Math.hypot(mid.x - giant.position.x, mid.z - giant.position.z) / KM;
  console.log(`\nOVERLAP — midpoint Marrow Shoal (${dBelt.toFixed(0)} km) / giant-orbit (${dGiant.toFixed(0)} km)`);
  console.log(`  strongest wins: ${t.id} w=${t.weight.toFixed(3)} sig=${t.signature.toFixed(3)} sensor=${t.sensor.toFixed(3)}`);

  console.log(`\nsanity: terrain at a point 400 km from everything -> `
    + JSON.stringify(system.terrainAt(system.bounds.minX - 400 * KM, 0)));
  discovery.dispose();
}

// ===========================================================================
// 2. RESOLUTION AS A CURVE
// ===========================================================================
function section2() {
  console.log(rule('2. CONTACT RESOLUTION — seconds from nothing to a name, by range and terrain'));

  // NOTE ON DISTANCES. A POI's arrival boundary is 26 km and crossing it resolves the
  // place outright - you are standing in it. So every measurement below is taken OUTSIDE
  // that boundary, in the 26-45 km band where passive contact is the only channel
  // working. `RANGE.sensorBase` is 14 km, so this band is genuinely marginal, which is
  // the design: the map is opened by intel and by sweeps, and passive contact is what
  // sharpens what you already have a hint of.

  /** Sit the player `km` from a POI and run until it resolves, or give up. */
  function timeToResolve(targetId, offsetKm, { sensors = 0.25, cap = 1200 } = {}) {
    const rig = makeRig({ sensors });
    const node = rig.system.get(targetId);
    place(rig.player, node.position.x + offsetKm * KM, node.position.z);
    rig.discovery._sampleTerrain();
    const marks = { signature: -1, classified: -1, resolved: -1 };
    for (let t = 0; t < cap; t += 1) {
      advance(rig.world.engine, 1);
      const r = rig.discovery.resolutionOf(targetId);
      if (marks.signature < 0 && r >= 0.15) marks.signature = t + 1;
      if (marks.classified < 0 && r >= 0.45) marks.classified = t + 1;
      if (marks.resolved < 0 && r >= 0.80) { marks.resolved = t + 1; break; }
    }
    const final = rig.discovery.resolutionOf(targetId);
    const profile = rig.discovery.sensorProfile();
    rig.discovery.dispose();
    return { ...marks, final, profile };
  }

  // Deepwell is a debris field (clutter 0.80). Hollow Anchor is an anchorage
  // (clutter 0.10, and it sees 15% further). Same distances, different places.
  const cases = [
    ['hollow-anchor', 'anchorage'],
    ['marrow-shoal', 'belt'],
    ['deepwell', 'debris'],
    ['near-star', 'corona'],
  ];
  console.log(pad('TARGET', 16) + pad('TERRAIN', 11) + num('OFFSET km', 11) + num('REACH km', 10)
    + num('SIG @s', 8) + num('CLASS @s', 10) + num('NAMED @s', 10) + num('FINAL', 7));
  for (const [id, terr] of cases) {
    for (const km of [28, 32, 36]) {
      const r = timeToResolve(id, km);
      console.log(pad(id, 16) + pad(terr, 11) + num(km, 11) + num(r.profile.rangeKm, 10, 1)
        + num(r.signature < 0 ? '--' : r.signature, 8, 0)
        + num(r.classified < 0 ? '--' : r.classified, 10, 0)
        + num(r.resolved < 0 ? '--' : r.resolved, 10, 0)
        + num(r.final, 7, 3));
    }
  }

  // The error bars have to actually shrink, or "gradual" is a word rather than a system.
  console.log('\nERROR BARS — one contact, sampled as it sharpens (Hollow Anchor at 30 km)');
  const rig = makeRig({ sensors: 0.25 });
  const node = rig.system.get('hollow-anchor');
  place(rig.player, node.position.x + 30 * KM, node.position.z);
  rig.discovery._sampleTerrain();
  console.log(pad('t s', 6) + num('RESOLUTION', 12) + pad('  TIER', 14) + pad('LABEL', 30)
    + num('MASS t', 9) + num('+/-', 7) + num('POS ERR km', 12));
  for (let t = 0; t <= 180; t += 20) {
    if (t > 0) advance(rig.world.engine, 20);
    const rows = rig.discovery.describeContacts();
    const row = rows.find((r) => r.id === 'hollow-anchor');
    if (!row) { console.log(pad(t, 6) + num(0, 12) + '  (undetected)'); continue; }
    console.log(pad(t, 6) + num(row.resolution, 12, 3) + pad(`  ${row.tier}`, 14) + pad(row.label, 30)
      + num(row.mass, 9, 0) + num(row.massError, 7, 0) + num(row.positionErrorKm, 12, 1));
  }
  rig.discovery.dispose();
}

// ===========================================================================
// 3. THE SENSORS POWER CHANNEL
// ===========================================================================
function section3() {
  console.log(rule('3. THE SENSORS CHANNEL — which had zero combat effect before this wave'));

  console.log('POI resolution at a fixed 30 km (outside the 26 km arrival boundary), by routing:');
  console.log(pad('PRESET', 12) + num('SENSORS', 9) + num('PIPS', 6) + num('REACH km', 10)
    + num('NAMED @s', 10) + num('RES @60s', 10));
  const presets = [
    ['assault', 0.08], ['run', 0.10], ['balanced', 0.25], ['scan', 0.48], ['all-in', 0.90],
  ];
  for (const [name, share] of presets) {
    const rig = makeRig({ sensors: share });
    const node = rig.system.get('hollow-anchor');
    place(rig.player, node.position.x + 30 * KM, node.position.z);
    rig.discovery._sampleTerrain();
    let named = -1;
    let at60 = 0;
    for (let t = 0; t < 600; t++) {
      advance(rig.world.engine, 1);
      const r = rig.discovery.resolutionOf('hollow-anchor');
      if (t === 59) at60 = r;
      if (named < 0 && r >= 0.80) named = t + 1;
      if (named > 0 && t >= 59) break;
    }
    const p = rig.discovery.sensorProfile();
    console.log(pad(name, 12) + num(share, 9) + num(p.pips, 6) + num(p.rangeKm, 10, 1)
      + num(named < 0 ? '--' : named, 10, 0) + num(at60, 10, 3));
    rig.discovery.dispose();
  }

  console.log('\nHULL CLASSIFICATION — a hostile destroyer at 9 km, and what the codex learns:');
  console.log(pad('SENSORS', 10) + num('PIPS', 6) + num('SEEN @s', 9) + num('SCANNED @s', 12)
    + pad('  READOUT AT t=20 s', 42) + pad('SUBSYS?', 9) + 'CODEX');
  for (const share of [0.08, 0.25, 0.48]) {
    const rig = makeRig({ sensors: share });
    const codex = new CodexSystem(rig.world);
    rig.world.register('codex', codex);
    place(rig.player, 0, 0);
    const hostile = new Ship({
      classDef: victimClass('coalition', 'harness_destroyer'),
      world: rig.world, faction: 'coalition', root: new THREE.Group(),
    });
    hostile.body.position.set(9 * KM, 0, 0);
    rig.world.addShip(hostile);
    rig.discovery._sampleTerrain();

    let seenAt = -1;
    let scannedAt = -1;
    let labelAt20 = '';
    let subsAt20 = false;
    for (let t = 0; t < 200; t++) {
      advance(rig.world.engine, 1);
      const r = rig.discovery.shipResolution(hostile);
      if (seenAt < 0 && r >= 0.45) seenAt = t + 1;
      if (scannedAt < 0 && r >= 0.80) scannedAt = t + 1;
      if (t === 19) {
        const row = rig.discovery.describeShipContacts()[0];
        labelAt20 = row ? `${row.label} ~${row.mass}t +/-${row.massError}` : '(no contact)';
        subsAt20 = row ? row.showSubsystems : false;
      }
      if (scannedAt > 0 && t >= 19) break;
    }
    console.log(pad(share, 10) + num(rig.discovery.sensorPips(), 6)
      + num(seenAt < 0 ? '--' : seenAt, 9, 0) + num(scannedAt < 0 ? '--' : scannedAt, 12, 0)
      + pad(`  ${labelAt20}`, 42) + pad(subsAt20 ? 'yes' : 'NO', 9)
      + codex.stateOf('ship', 'harness_destroyer'));
    rig.discovery.dispose();
    codex.dispose();
  }
}

// ===========================================================================
// 4. TERRAIN IN THE TRANSIT RISK ROLL
// ===========================================================================
function section4() {
  console.log(rule('4. TRANSIT RISK — terrain in the interception quote, and in the roll'));

  const { system, travel, discovery, player, world, war } = makeRig();
  // Let the war run a while so heat is not all at its authored t=0 value.
  advance(world.engine, 600);

  console.log(pad('COURSE', 34) + num('km', 7) + num('HEAT', 7) + num('MASK', 7)
    + pad('  TERRAIN', 12) + num('MASKED', 8) + num('OLD %', 8) + num('NEW %', 8));

  const legsToTry = [
    ['graveyard', 'saltpan'],
    ['graveyard', 'the-lattice'],
    ['graveyard', 'meridian-gate'],
    ['graveyard', 'near-star'],
    ['graveyard', 'cinderport'],
    ['graveyard', 'deepwell'],
  ];
  for (const [fromId, toId] of legsToTry) {
    const from = system.get(fromId);
    const to = system.get(toId);
    place(player, from.position.x, from.position.z);
    const course = travel.plot([to.position], [toId]);
    const leg = course.legs[0];
    // What the old formula would have quoted: heat x heatK x drive signature, no terrain.
    const oldPerRoll = Math.min(0.35, leg.heat * 0.05 * travel.signature);
    const oldChance = 1 - (1 - oldPerRoll) ** leg.rolls;
    console.log(pad(`${fromId} -> ${toId}`, 34) + num(leg.distance / KM, 7, 0) + num(leg.heat, 7, 3)
      + num(leg.mask, 7, 3) + pad(`  ${leg.terrain}`, 12) + num(leg.maskedFraction, 8, 2)
      + num(oldChance * 100, 8, 1) + num(leg.interceptChance * 100, 8, 1));
  }

  console.log('\nSIGNATURE AT A POINT — drive x emissions x terrain, the number the roll uses:');
  console.log(pad('WHERE', 26) + pad('TERRAIN', 12) + num('DRIVE', 8) + num('EMIT', 7) + num('TERRAIN', 9) + num('TOTAL', 8));
  for (const id of ['graveyard', 'saltpan', 'giant-orbit', 'near-star', 'meridian-gate']) {
    const n = system.get(id);
    place(player, n.position.x, n.position.z);
    discovery._sampleTerrain();
    const t = system.terrainAt(n.position.x, n.position.z);
    console.log(pad(id, 26) + pad(t.id, 12) + num(travel.signature, 8) + num(travel.emissionMultiplier, 7)
      + num(t.signature, 9) + num(travel.signatureAt(n.position.x, n.position.z), 8));
  }

  console.log('\nPER-MINUTE INTERCEPTION WHILE BURNING, POI by POI. Same drive, same war,');
  console.log('different ground. This spread is the decision terrain now creates:');
  console.log(pad('POI', 26) + pad('TERRAIN', 12) + num('HEAT', 7) + num('SIG', 7)
    + num('OLD %/min', 11) + num('NEW %/min', 11));
  const rows = [];
  for (const nd of system.nodes) {
    place(player, nd.position.x, nd.position.z);
    discovery._sampleTerrain();
    const heat = war.heatAtPoint(nd.position.x, nd.position.z);
    const sig = travel.signatureAt(nd.position.x, nd.position.z);
    rows.push({
      id: nd.id,
      terrain: nd.terrainId,
      heat,
      sig,
      oldP: Math.min(0.35, heat * 0.05 * travel.signature),
      newP: Math.min(0.35, heat * 0.05 * sig),
    });
  }
  rows.sort((a, b) => a.newP - b.newP);
  for (const r of rows) {
    console.log(pad(r.id, 26) + pad(r.terrain, 12) + num(r.heat, 7, 3) + num(r.sig, 7, 2)
      + num(r.oldP * 100, 11, 2) + num(r.newP * 100, 11, 2));
  }
  console.log(`safest ground is ${rows[0].id} at ${(rows[0].newP * 100).toFixed(2)}%/min; `
    + `worst is ${rows[rows.length - 1].id} at ${(rows[rows.length - 1].newP * 100).toFixed(2)}%/min `
    + `— a ${(rows[rows.length - 1].newP / Math.max(1e-9, rows[0].newP)).toFixed(1)}x spread.`);

  // And the sweep, which is the emission half of the same product.
  const n = system.get('saltpan');
  place(player, n.position.x, n.position.z);
  discovery._sampleTerrain();
  const quiet = travel.signatureAt(n.position.x, n.position.z);
  discovery.survey.active = true;
  const loud = travel.signatureAt(n.position.x, n.position.z);
  discovery.survey.active = false;
  console.log(`\nsweeping inside the Saltpan: signature ${quiet.toFixed(3)} -> ${loud.toFixed(3)}`
    + `  (hiding buys ${(6 / quiet).toFixed(1)}x, sweeping spends ${(loud / quiet).toFixed(1)}x)`);
  discovery.dispose();
}

// ===========================================================================
// 5. PROBES
// ===========================================================================
function section5() {
  console.log(rule('5. PROBES — a sensor you spend, and one you have to decide about'));

  const TARGET = 'deepwell';

  /** Run 360 s from the start POI with no probe, a passive probe, or an active one. */
  function run(mode) {
    const rig = makeRig({ sensors: 0.25, seed: 'harness/probe/001' });
    const start = rig.system.get(START_POI);
    const target = rig.system.get(TARGET);
    place(rig.player, start.position.x, start.position.z);
    rig.discovery._sampleTerrain();
    const bearing = Math.atan2(
      target.position.x - start.position.x,
      target.position.z - start.position.z,
    );
    const probe = mode === 'none' ? null : rig.discovery.deployProbe({ bearing, mode });
    const heatBefore = rig.war.poiState(TARGET).heat;
    advance(rig.world.engine, 360);
    const out = {
      mode,
      resolution: rig.discovery.resolutionOf(TARGET),
      tier: rig.discovery.describeContacts().find((c) => c.id === TARGET)?.tier ?? 'none',
      heatBefore,
      heatAfter: rig.war.poiState(TARGET).heat,
      contacts: probe ? probe.seen.size : 0,
      distanceKm: target.position.distanceTo(start.position) / KM,
      reachKm: rig.discovery.sensorProfile().rangeKm,
    };
    rig.discovery.dispose();
    return out;
  }

  const none = run('none');
  console.log(`the problem: ${TARGET} is ${none.distanceKm.toFixed(0)} km away and the hull's own `
    + `sensor reach is ${none.reachKm.toFixed(1)} km. Passive contact will never touch it.`);
  console.log('\n' + pad('PROBE', 10) + num('RESOLUTION @360s', 18) + pad('  TIER', 14)
    + num('CONTACTS', 10) + num('TARGET HEAT', 13) + num('DELTA', 8));
  for (const mode of ['none', 'passive', 'active']) {
    const r = mode === 'none' ? none : run(mode);
    console.log(pad(mode, 10) + num(r.resolution, 18, 3) + pad(`  ${r.tier}`, 14)
      + num(r.contacts, 10, 0) + num(r.heatAfter, 13, 3)
      + num(r.heatAfter - none.heatAfter, 8, 3));
  }
  console.log('DELTA is heat against the no-probe control: an active probe pulls patrols');
  console.log('toward the PROBE, which is the whole reason to choose passive sometimes.');

  // Flight profile, so the reach numbers are not taken on trust.
  const rig = makeRig({ sensors: 0.25, seed: 'harness/probe/001' });
  const start = rig.system.get(START_POI);
  const target = rig.system.get(TARGET);
  place(rig.player, start.position.x, start.position.z);
  rig.discovery._sampleTerrain();
  const bearing = Math.atan2(target.position.x - start.position.x, target.position.z - start.position.z);
  const probe = rig.discovery.deployProbe({ bearing, mode: 'active' });
  console.log(`\nFLIGHT — ${probe.id} ${probe.mode}, ${probe.life} s, ${probe.speed} m/s, `
    + `${(probe.reach / KM).toFixed(0)} km reach`);
  console.log(pad('t s', 7) + num('OUT km', 9) + num('TO TARGET km', 14)
    + num('TARGET RES', 12) + num('SEEN', 7));
  for (let t = 0; t <= 360; t += 60) {
    if (t > 0) advance(rig.world.engine, 60);
    const row = rig.discovery.describeProbes().find((r) => r.owner === 'player');
    const out = row ? Math.hypot(row.x - start.position.x, row.z - start.position.z) / KM : NaN;
    const toT = row ? Math.hypot(row.x - target.position.x, row.z - target.position.z) / KM : NaN;
    console.log(pad(t, 7) + num(Number.isFinite(out) ? out : 'gone', 9, 0)
      + num(Number.isFinite(toT) ? toT : '--', 14, 0)
      + num(rig.discovery.resolutionOf(TARGET), 12, 3)
      + num(row ? row.contacts : probe.seen.size, 7, 0));
  }

  // ---- the dilemma --------------------------------------------------------
  console.log('\nTHE ENEMY PROBE — both horns, priced:');
  const { discovery, world, war, system, player } = rig;
  place(player, start.position.x, start.position.z);
  const enemy = forceEnemyProbe(discovery, 60 * KM);
  if (!enemy) { console.log('  (no enemy probe spawned)'); rig.discovery.dispose(); return; }
  advance(world.engine, 2);
  enemy.hasFix = false;
  const quiet = discovery.signatureMultiplier;
  enemy.hasFix = true;
  const watched = discovery.signatureMultiplier;
  console.log(`  a ${enemy.faction} probe, ${(enemy.reach / KM).toFixed(0)} km reach, `
    + `${enemy.remaining.toFixed(0)} s of life left`);
  console.log(`  LEAVE IT : signature ${quiet.toFixed(3)} -> ${watched.toFixed(3)} `
    + `(x${(watched / quiet).toFixed(2)}) for as long as it lives`);

  enemy.seen.add('the-lattice');
  enemy.seen.add('vault-nine');
  enemy.x = player.position.x + 4 * KM;
  enemy.z = player.position.z;
  const heatBefore = system.nodes.map((n) => war.poiState(n.id).heat);
  const repBefore = world.reputation[enemy.faction] ?? 0;
  const latticeBefore = discovery.resolutionOf('the-lattice');
  const res = discovery.destroyProbe(enemy);
  let spiked = 0;
  let heatSum = 0;
  system.nodes.forEach((n, i) => {
    const after = war.poiState(n.id).heat;
    if (after > heatBefore[i] + 1e-6) { spiked++; heatSum += after - heatBefore[i]; }
  });
  console.log(`  KILL IT  : ${res.ok ? 'destroyed' : res.reason}; `
    + `${res.sharpened ?? 0} contacts sharpened (the-lattice ${latticeBefore.toFixed(3)} -> `
    + `${discovery.resolutionOf('the-lattice').toFixed(3)}); heat +${heatSum.toFixed(3)} `
    + `across ${spiked} POIs; ${enemy.faction} standing ${repBefore} -> ${world.reputation[enemy.faction]}`);

  const far = forceEnemyProbe(discovery, 300 * KM);
  console.log(`  and you have to close on it: ${JSON.stringify(discovery.destroyProbe(far))}`);
  console.log(`  signature back to ${discovery.signatureMultiplier.toFixed(3)} once it is gone `
    + `(watched=${discovery.watched}).`);
  rig.discovery.dispose();
}

/** The enemy spawn is probabilistic; the harness needs one on demand. */
function forceEnemyProbe(discovery, offset = 60 * KM) {
  const p = discovery.world.player;
  // One hostile probe at a time is a hard rule in the system, so reuse whichever one
  // the war has already spent on us rather than pretending we can conjure a second.
  const existing = discovery.probes.find((q) => q.owner === 'hostile' && !q.dead);
  if (existing) {
    if (offset) {
      existing.x = p.position.x + offset;
      existing.z = p.position.z;
      existing.hasFix = offset <= existing.reach;
    }
    return existing;
  }
  for (const n of discovery.system.nodes) discovery.war.bumpHeat(n.id, 1);
  discovery._enemyCheckIn = 0;
  let probe = null;
  for (let i = 0; i < 40 && !probe; i++) probe = discovery._maybeSpawnEnemyProbe();
  if (probe && offset) {
    probe.x = p.position.x + offset;
    probe.z = p.position.z;
    probe.hasFix = offset <= probe.reach;
  }
  return probe;
}

// ===========================================================================
// 6. CODEX-BIASED WRECK CONTENTS
// ===========================================================================
function section6() {
  console.log(rule('6. CODEX BIAS — what a wreck offers, against the uniform pick it replaced'));

  /** Kill `n` coalition destroyers and tally which module ids their sections carried. */
  function sample(n, seedCodex) {
    const world = makeWorld(`harness/bias/${seedCodex ? 'known' : 'fresh'}`);
    const salvage = new SalvageSystem(world);
    world.register('salvage', salvage);
    world.engine.add(salvage);
    const codex = world.systems.codex ?? new CodexSystem(world);
    world.register('codex', codex);

    if (seedCodex) for (const id of seedCodex) codex.markModule(id, 'installed');

    const tally = new Map();
    for (let i = 0; i < n; i++) {
      const ship = new Ship({
        classDef: victimClass('coalition', 'harness_destroyer'),
        world, faction: 'coalition', root: new THREE.Group(),
      });
      world.addShip(ship);
      ship.fixedUpdate(1 / 60);
      // Kill it through the drive so the batteries survive above CONDITION.scrap and
      // therefore actually carry a moduleId. A reactor pop would floor every section to
      // 0.15 and the tally would be empty - which is section 7's point, not this one.
      const eng = ship.sections.get('eng');
      for (let k = 0; k < 200 && !ship.dead; k++) {
        ship.applyDamage(120, { point: eng.worldPosition.clone(), subsystemId: 'eng', accuracy: 1 });
      }
      if (!ship.dead) ship.applyDamage(99999, { point: eng.worldPosition.clone() });
      const wreck = world.wrecks[world.wrecks.length - 1];
      if (!wreck) continue;
      for (const s of wreck.sections) {
        if (!s.moduleId) continue;
        tally.set(s.moduleId, (tally.get(s.moduleId) ?? 0) + 1);
      }
      world.wrecks.length = 0;
    }
    return tally;
  }

  const weaponIds = allModules().filter((m) => m.faction === 'coalition' && m.weapon).map((m) => m.id);
  console.log(`coalition weapon modules a destroyer's batteries can match: ${weaponIds.length}`);

  const N = 400;
  const fresh = sample(N, null);
  // Now pretend the player already flies two of them. They should dry up.
  const owned = weaponIds.slice(0, 2);
  const known = sample(N, owned);

  console.log(`\n${N} destroyers, 2 battery sections each. "OWNED" marks a module already installed.`);
  console.log(pad('MODULE', 28) + num('EMPTY CODEX', 13) + num('%', 7)
    + num('2 OWNED', 9) + num('%', 7) + pad('  ', 4) + 'OWNED?');
  // Denominator is WEAPON sections only. The reactor and sensor sections also carry a
  // module, but each has a single candidate in the registry, so they are a constant in
  // both columns and would only dilute the comparison.
  const totalWeapons = (m) => weaponIds.reduce((a, id) => a + (m.get(id) ?? 0), 0);
  const tf = totalWeapons(fresh);
  const tk = totalWeapons(known);
  const ids = Array.from(new Set([...fresh.keys(), ...known.keys()])).sort();
  for (const id of ids) {
    const a = fresh.get(id) ?? 0;
    const b = known.get(id) ?? 0;
    const weapon = weaponIds.includes(id);
    console.log(pad(id, 28) + num(a, 13, 0) + num(weapon ? (a / tf) * 100 : '--', 7, 1)
      + num(b, 9, 0) + num(weapon ? (b / tk) * 100 : '--', 7, 1) + pad('  ', 4)
      + (owned.includes(id) ? 'INSTALLED' : weapon ? '' : '(sole candidate for its role)'));
  }
  const ownedShareFresh = owned.reduce((s, id) => s + (fresh.get(id) ?? 0), 0) / tf;
  const ownedShareKnown = owned.reduce((s, id) => s + (known.get(id) ?? 0), 0) / tk;
  console.log(`\nshare of drops that were one of the two owned modules: `
    + `${pct(ownedShareFresh)} with an empty codex -> ${pct(ownedShareKnown)} once installed`);
  console.log(`uniform would be ${pct(owned.length / weaponIds.length)} in both columns, `
    + `and the empty-codex column lands there because every entry is equally unknown.`);
}

// ===========================================================================
// 7. DAMAGE ATTRIBUTION -> SALVAGE
// ===========================================================================
function section7() {
  console.log(rule('7. SECTION OUTCOME — read from accumulated damage, not rolled at death'));

  function kill(mode) {
    const world = makeWorld(`harness/attrib/${mode}`);
    const salvage = new SalvageSystem(world);
    world.register('salvage', salvage);
    const ship = new Ship({
      classDef: victimClass('coalition', 'harness_destroyer'),
      world, faction: 'coalition', root: new THREE.Group(),
    });
    world.addShip(ship);
    ship.fixedUpdate(1 / 60);        // cache section world positions

    if (mode === 'surgical') {
      // Everything into the drive, from astern. The batteries are never touched.
      const eng = ship.sections.get('eng');
      for (let i = 0; i < 60; i++) {
        ship.applyDamage(120, { point: eng.worldPosition.clone(), subsystemId: 'eng', accuracy: 1 });
        if (ship.dead) break;
      }
      if (!ship.dead) ship.applyDamage(99999, { point: eng.worldPosition.clone() });
    } else if (mode === 'brawl') {
      // Hosed from bow to stern, but never at the reactor: this is the "shot at
      // everything" kill, and it must be distinguishable from a reactor pop.
      // Aim points chosen to sit outside the reactor subsystem's 50 m hit radius: a
      // brawl is "shot at everything", not "shot the one thing that ends the fight".
      const spread = ['plate_fore', 'wep_p', 'plate_aft', 'wep_s'].map((id) => ship.sections.get(id));
      let i = 0;
      while (!ship.dead && i < 1200) {
        ship.applyDamage(60, { point: spread[i % spread.length].worldPosition.clone() });
        i++;
      }
    } else {
      // Reactor pop. The easy kill that destroys almost everything you came for.
      const rct = ship.sections.get('rct');
      while (!ship.dead) ship.applyDamage(150, { point: rct.worldPosition.clone(), subsystemId: 'rct', accuracy: 1 });
    }
    const wreck = world.wrecks[world.wrecks.length - 1];
    return { ship, wreck };
  }

  const runs = [kill('surgical'), kill('brawl'), kill('reactor')];
  console.log(pad('SECTION', 22) + num('SURGICAL', 10) + num('BRAWL', 9) + num('REACTOR', 9)
    + '   (wreck section condition, and its salvage state)');
  for (let i = 0; i < runs[0].wreck.sections.length; i++) {
    const cells = runs.map((r) => r.wreck.sections[i]);
    console.log(pad(cells[0].label, 22)
      + num(cells[0].condition, 10, 3) + num(cells[1]?.condition ?? NaN, 9, 3)
      + num(cells[2]?.condition ?? NaN, 9, 3)
      + `   ${cells.map((c) => c?.state ?? '--').join(' / ')}`);
  }
  console.log('\n' + pad('', 22) + num('SURGICAL', 10) + num('BRAWL', 9) + num('REACTOR', 9));
  console.log(pad('salvageIntegrity', 22)
    + runs.map((r, i) => num(r.ship.salvageIntegrity, i === 0 ? 10 : 9, 3)).join(''));
  console.log(pad('installable modules', 22)
    + runs.map((r, i) => num(r.wreck.sections.filter((s) => s.yieldsModule).length, i === 0 ? 10 : 9, 0)).join(''));
  console.log(pad('materials total', 22)
    + runs.map((r, i) => num(r.wreck.sections.reduce((a, s) => a + s.materials, 0), i === 0 ? 10 : 9, 0)).join(''));
  console.log('\nIf these three columns were identical, section outcome would still be a die roll.');
}

// ===========================================================================

section1();
section2();
section3();
section4();
section5();
section6();
section7();
console.log('\nharness complete.\n');
