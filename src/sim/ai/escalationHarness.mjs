/**
 * DOES THE PRESSURE ACTUALLY ARRIVE?
 *
 *     node src/sim/ai/escalationHarness.mjs
 *
 * Exits non-zero the moment escalation stops arriving. That is the whole reason this
 * file exists: the escalation ladder is INVISIBLE UNTIL IT FAILS. Nothing crashes, no
 * gate goes red, no console error appears — the game just quietly becomes a place where
 * you can strip every hull in the system and nobody ever comes. It had been exactly that
 * since the ladder was written, and three harnesses ran green over the top of it.
 *
 * NOTHING HERE IS A FIXTURE. It assembles what `src/game.js` assembles, in the same
 * order, from the same modules: the real material-free build of the registered modules
 * and faction ships, the registered `player_cruiser` from `camera/feel.js`, the real
 * `CombatSystem`, the real `SalvageSystem` (which installs the real progression layer),
 * the real `RefitSystem`, the real ARRIVAL FIT at condition 0.82, and the real
 * `installWorldSim` — faction war, fleet AI, ship AI, travel and discovery. The player
 * starts at The Graveyard with the six wrecks the war seeded there, and the player FLIES
 * between them under `orderMove` and the real `PlaneBody`, burning real propellant,
 * because the time it takes to cross a field is the thing the ledger's decay is measured
 * against and a harness that teleports would be measuring a game nobody plays.
 *
 * The only stub is the art stream's `attachModule`/`detachModule` pair, which returns an
 * empty `THREE.Group` because there is no GL context in node. Every simulation number
 * below came out of the simulation.
 *
 * WHY THIS FILE EXISTS RATHER THAN ANOTHER PARAGRAPH: the ladder was already documented
 * as working. `sim/meta/sortieHarness.js` section 7 prints a healthy-looking ledger and
 * has done for two waves — because it spawns victims, kills them (a kill is worth 30
 * claim), calls `salvage._store()` on every section directly with no cut time at all,
 * and does it deep in Coalition space where the decay multiplier is at its lowest. Every
 * one of those four choices flatters the number. On the live path, at the POI the player
 * actually starts in, cutting flat out with nothing wasted, the peak claim ever reached
 * was 37.4 against a first rung of 110, and the count of hostiles that ever arrived was
 * zero. A harness that cannot reproduce the shipped game's own starting conditions will
 * certify anything.
 */

import * as THREE from 'three';
import { Engine } from '../../core/loop.js';
import { World } from '../../core/world.js';
import { Ship } from '../ship.js';
import { CombatSystem } from '../combat.js';
import { SalvageSystem } from '../salvage.js';
import { RefitSystem } from '../refit.js';
import { EV } from '../../core/events.js';
import { MEV } from '../meta/events.js';
import { RANGE } from '../../core/units.js';
import { registerPlayerCruiser, applyClassHandling } from '../../camera/feel.js';
import { CRUISER_SUBSYSTEMS } from '../../art/geometry/cruiser.js';
import '../../art/geometry/modules/index.js';
import '../../art/geometry/ships/index.js';
import { installWorldSim } from '../../world/index.js';
import { ESCALATION } from '../../world/factionWar.js';
import { effectiveRange } from './shipAI.js';
import { makeSystemsRead, readSystems, aimFor, pressReason } from './pressure.js';

const DT = 1 / 60;
const OTHER = { coalition: 'concord', concord: 'coalition' };

let passed = 0;
let failed = 0;
const rule = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);
const f = (v, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : String(v));
function check(ok, name, evidence) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (evidence) console.log(`        ${evidence}`);
}

// ---------------------------------------------------------------------------
// the live assembly
// ---------------------------------------------------------------------------

const STUB_ATTACHMENT = {
  attachModule: () => ({ object: new THREE.Group() }),
  detachModule: () => {},
};

/** `src/game.js`'s ARRIVAL_FIT, verbatim, including the condition. */
const ARRIVAL_FIT = [
  ['bow', 'bow_mining_array'],
  ['ventral', 'ventral_salvage_tractor'],
  ['dorsal', 'dorsal_sensor_mast'],
  ['port', 'port_cannon_bank'],
  ['starboard', 'port_cannon_bank'],
  ['engine', 'engine_thruster_upgrade'],
];

function boot(seed) {
  // `Ship._nextId` is a process global that ends up in salvage's per-wreck RNG label, so
  // two worlds built in one process would otherwise draw different numbers from the same
  // seed. Reset for the same reason `sortieHarness.js` resets it.
  Ship._nextId = 0;
  const engine = new Engine();
  const world = new World({
    engine,
    renderer: { scene: new THREE.Scene(), far: new THREE.Scene(), camera: new THREE.PerspectiveCamera() },
    seed,
  });

  // The real hull's subsystem table, which is what `game.js` hands in as
  // `hullResult.subsystems`. Without it the player has no `weapon` subsystem at all and
  // section 9's "shoot the battery while it is offline" cannot be measured on anything
  // the player actually flies.
  const playerClass = registerPlayerCruiser({
    root: new THREE.Group(), subsystems: CRUISER_SUBSYSTEMS,
  });
  const player = new Ship({
    classDef: playerClass, world, faction: 'player', isPlayer: true,
    root: new THREE.Group(), position: new THREE.Vector3(0, 0, 0),
  });
  applyClassHandling(player.body, playerClass);
  world.player = player;
  world.addShip(player);

  const combat = new CombatSystem(world);
  world.register('combat', combat);
  engine.add(combat);
  const salvage = new SalvageSystem(world);          // installs progression + sortie
  world.register('salvage', salvage);
  engine.add(salvage);
  const refit = new RefitSystem(world, STUB_ATTACHMENT);
  world.register('refit', refit);
  engine.add({
    name: 'ships', order: 60,
    fixedUpdate: (dt) => { for (const s of world.ships) s.fixedUpdate(dt); world.time += dt; },
  });

  const fitted = [];
  for (const [hardpoint, moduleId] of ARRIVAL_FIT) {
    const uid = `arrival:${hardpoint}`;
    world.inventory.push({ moduleId, condition: 0.82, uid });
    if (refit.install(hardpoint, uid)?.ok) fitted.push(hardpoint);
  }

  const sim = installWorldSim(world);
  return { world, engine, sim, war: sim.war, player, salvage, combat, fitted };
}

/** How far the tractor reaches on this fit, from the salvage system's own arithmetic. */
const beam = (g) => RANGE.salvageBeam * (1 + g.salvage.tractorRating * 0.4);

function nearestSection(g, faction) {
  let best = null;
  let bestD = Infinity;
  for (const w of g.world.wrecks) {
    if (faction && w.faction !== faction) continue;
    for (const s of w.sections) {
      if (!s.cuttable) continue;
      const d = s.worldPosition.distanceTo(g.player.position);
      if (d < bestD) { bestD = d; best = { wreck: w, section: s, d }; }
    }
  }
  return best;
}

/**
 * Play a salvager: fly to the nearest cuttable section of `faction`, cut it, repeat.
 *
 * The flying is real — `orderMove` into `MoveController` into `PlaneBody` — so the time
 * spent crossing the field between hulls is real time in which the ledger is free to
 * decay. That is the difference between this and every previous measurement of the
 * ladder, and it is where the answer lives.
 */
function workField(g, faction, seconds, watch = {}) {
  const range = beam(g) * 0.85;
  let t = 0;
  let cuts = 0;
  let steering = null;
  while (t < seconds) {
    if (!g.salvage.cutting) {
      const n = nearestSection(g, faction);
      if (n) {
        if (n.d <= range) {
          g.player.move?.cancel?.();
          steering = null;
          if (g.salvage.orderCut(n.wreck, n.section)) cuts++;
        } else if (steering !== n.section.id) {
          steering = n.section.id;
          g.player.orderMove(n.section.worldPosition);
        }
      }
    }
    g.engine._fixedStep(DT);
    t += DT;
    watch.tick?.(t, cuts);
  }
  return { cuts, elapsed: t };
}

/** Closest any escalation hull has come to the player, and when it first bore. */
function pursuitProbe(g) {
  const state = { closest: Infinity, inRangeAt: null, seen: 0 };
  state.sample = (t) => {
    for (const s of g.world.ships) {
      if (s.isPlayer || s.dead || !s.__escalation) continue;
      state.seen++;
      const d = s.position.distanceTo(g.player.position);
      if (d < state.closest) state.closest = d;
      if (state.inRangeAt === null && d <= effectiveRange(s)) state.inRangeAt = t;
    }
  };
  return state;
}

// ===========================================================================
// 1. THE FIELD YOU ARRIVE IN
// ===========================================================================
rule('1. THE FIELD YOU ARRIVE IN — the live assembly, not a fixture');
{
  const g = boot('escalation/field');
  const perFaction = { coalition: 0, concord: 0 };
  let materials = 0;
  for (const w of g.world.wrecks) {
    for (const s of w.sections) {
      if (!s.cuttable) continue;
      if (perFaction[w.faction] !== undefined) perFaction[w.faction]++;
      materials += s.materials;
    }
  }
  const cuttable = perFaction.coalition + perFaction.concord;
  const hostiles = g.world.ships.filter((s) => !s.isPlayer && !s.dead).length;

  console.log(`  POI ${g.sim.travel.currentPOI}, radius ${g.sim.system.get('graveyard').radius / 1000} km`);
  console.log(`  wrecks ${g.world.wrecks.length}, cuttable sections ${cuttable} `
    + `(coalition ${perFaction.coalition}, concord ${perFaction.concord}), materials ${materials}`);
  console.log(`  player: ${g.fitted.length}/6 hardpoints fitted, ${g.player.weapons.length} mounts, `
    + `tractor ${f(g.salvage.tractorRating, 3)}, beam ${f(beam(g) / 1000, 2)} km`);

  check(g.fitted.length === ARRIVAL_FIT.length && g.player.weapons.length > 0,
    'the player arrives fitted, on the same ARRIVAL_FIT game.js installs',
    `${g.fitted.join(', ')} — ${g.player.weapons.length} commandable mounts`);
  check(g.world.wrecks.length >= 6 && cuttable >= 40,
    'and the graveyard has a crop to work',
    `${g.world.wrecks.length} wrecks, ${cuttable} cuttable sections`);
  check(hostiles === 0,
    'and nothing hostile is in it — the opening is quiet BY DESIGN, which is only a '
    + 'design if the rest of this file passes',
    `${hostiles} hostiles at t=0`);
}

// ===========================================================================
// 2. CUTTING RAISES A CLAIM, AND THE RIGHT ONE
// ===========================================================================
rule('2. DOES SALVAGING RAISE A FACTION CLAIM, AND BY HOW MUCH PER SECTION?');
const perSection = {};
{
  for (const faction of ['coalition', 'concord']) {
    const g = boot('escalation/accrue');
    const war = g.war;
    const deltas = [];
    g.world.bus.on(MEV.LEDGER_CHANGED, (e) => {
      if (e.faction === faction && e.delta > 0 && e.reason === 'salvage') deltas.push(e.delta);
    });
    workField(g, faction, 60);
    const gross = deltas.reduce((a, b) => a + b, 0);
    perSection[faction] = deltas.length ? gross / deltas.length : 0;
    const theirs = war.ledger[faction];
    const others = war.ledger[OTHER[faction]];
    console.log(`  cutting ${faction} hulls: ${deltas.length} charges, gross ${f(gross)} claim, `
      + `mean ${f(perSection[faction], 2)}/charge; ${OTHER[faction]} claim ${f(others.claim, 2)}`);
    check(deltas.length > 0 && gross > 0,
      `cutting ${faction} hulls charges ${faction}`,
      `${deltas.length} charges over 60 s, ${f(gross)} claim gross, standing now `
      + `${f(g.world.reputation[faction])}`);
    check(others.claim < theirs.claim * 0.25,
      `and does NOT charge ${OTHER[faction]} — the ledger is per faction, so "go and strip `
      + `the other side for a while" is a real answer`,
      `${faction} ${f(theirs.claim)} vs ${OTHER[faction]} ${f(others.claim)}`);
  }
}

// ===========================================================================
// 3 + 4 + 5. THE TIER TRIPS, SOMETHING ARRIVES, AND YOU WERE TOLD FIRST
// ===========================================================================
rule('3-5. DOES A TIER TRIP, DOES ANYTHING ARRIVE, AND WERE YOU WARNED?');
const arrivals = [];
{
  for (const faction of ['coalition', 'concord']) {
    const g = boot('escalation/arrive');
    const war = g.war;
    const probe = pursuitProbe(g);
    let firstCutAt = null;
    let warnAt = null;
    let warnText = null;
    let warnClaim = 0;
    let spawnAt = null;
    let spawnTier = null;
    let spawnShips = 0;
    let cutsAtSpawn = 0;

    g.world.bus.on(EV.SALVAGE_CUT_START, () => { if (firstCutAt === null) firstCutAt = clock.t; });
    g.world.bus.on(EV.NOTIFY, (n) => {
      if (warnAt === null && typeof n?.text === 'string'
        && n.text.startsWith(`${faction.toUpperCase()} HAS NOTICED`)) {
        warnAt = clock.t; warnText = n.text; warnClaim = war.ledger[faction].claim;
      }
    });
    let openedAt = null;
    let squawked = 0;
    let squawkText = null;
    g.world.bus.on(EV.NOTIFY, (n) => {
      if (squawkText === null && /SQUAWKING/.test(n?.text ?? '')) squawkText = n.text;
    });
    g.world.bus.on(MEV.ESCALATION, (e) => {
      if (spawnAt !== null || e.faction !== faction) return;
      spawnAt = clock.t; spawnTier = e.tier; spawnShips = e.ships; cutsAtSpawn = clock.cuts;
      const s = g.world.ships.find((x) => x.__escalation && !x.dead);
      if (s) openedAt = s.position.distanceTo(g.player.position);
      // Counted AFTER the war's own listeners have run, which is the order the bus
      // dispatches in: discovery binds to the same event.
      for (const x of g.world.ships) {
        if (x.__escalation && !x.dead && g.sim.discovery.shipResolution(x) > 0) squawked++;
      }
    });

    const clock = { t: 0, cuts: 0 };
    let sensorReach = 0;
    const res = workField(g, faction, 400, {
      tick: (t, cuts) => {
        clock.t = t; clock.cuts = cuts; probe.sample(t);
        sensorReach = g.sim.discovery.sensorRange() * 1.35;   // RESOLVE.shipReach
      },
    });

    const row = {
      faction, cuts: res.cuts, firstCutAt, warnAt, warnClaim, spawnAt, spawnTier, spawnShips,
      cutsAtSpawn, closest: probe.closest, inRangeAt: probe.inRangeAt,
      propellant: g.world.propellant?.current ?? null,
    };
    arrivals.push(row);

    console.log(`\n  ${faction.toUpperCase()} — working their hulls, flying between them`);
    console.log(`    first cut               ${f(firstCutAt)} s`);
    console.log(`    warned                  ${warnAt === null ? 'NEVER' : `${f(warnAt)} s`}`
      + `  ${warnText ? `"${warnText}"` : ''}`);
    console.log(`    tier tripped            ${spawnAt === null ? 'NEVER' : `${f(spawnAt)} s`}`
      + `  ${spawnTier ?? ''} ${spawnShips ? `(${spawnShips} hulls)` : ''}`
      + `  after ${cutsAtSpawn} sections cut`);
    console.log(`    first hostile in range  ${probe.inRangeAt === null ? 'NEVER' : `${f(probe.inRangeAt)} s`}`);
    console.log(`    sensor reach on hulls   ${f(sensorReach / 1000, 1)} km `
      + `(terrain ${g.sim.discovery.terrain.id}) vs opening range ${f((openedAt ?? NaN) / 1000, 1)} km`);
    console.log(`    closest approach        ${Number.isFinite(probe.closest) ? `${f(probe.closest / 1000, 2)} km` : 'n/a'}`);
    console.log(`    sections cut in 400 s   ${res.cuts}   propellant left ${f(row.propellant)}`);

    check(spawnAt !== null,
      `${faction} answers a stripped field — a tier trips inside a single session`,
      spawnAt === null
        ? `NEVER. Peak claim ${f(war.ledger[faction].claim)} against rung 1 at ${ESCALATION[0].at}.`
        : `${spawnTier} at ${f(spawnAt)} s, after ${cutsAtSpawn} sections and `
          + `${f(spawnAt - (firstCutAt ?? 0))} s of work`);
    check(probe.inRangeAt !== null && probe.closest < 6000,
      'and it CLOSES — a hostile gets inside its own weapons range of the player',
      probe.inRangeAt === null
        ? `NEVER bore. Closest approach ${Number.isFinite(probe.closest) ? f(probe.closest / 1000, 2) : 'n/a'} km.`
        : `bore at ${f(probe.inRangeAt)} s, closed to ${f(probe.closest, 0)} m; `
          + `${f(probe.inRangeAt - (firstCutAt ?? 0))} s from first cut to first hostile in range`);
    check(warnAt !== null && spawnAt !== null && spawnAt - warnAt >= 8,
      'and the player was WARNED first, with a readable lead and both numbers in the line',
      warnAt === null ? 'no warning fired at all'
        : `warned at ${f(warnAt)} s (claim ${f(warnClaim)}), group launched at ${f(spawnAt)} s — `
          + `${f(spawnAt - warnAt)} s of lead`);
    check(squawked > 0,
      'and it is ON THE SENSOR BOARD from the moment it launches — the warning comes with '
      + 'a bearing, not a mystery',
      `opened at ${f((openedAt ?? NaN) / 1000, 1)} km against a hull-contact reach of only `
      + `${f(sensorReach / 1000, 1)} km, so passive sensors alone would have shown nothing `
      + `for ${f((probe.inRangeAt ?? 0) - (spawnAt ?? 0), 0)} s. ${squawked} of `
      + `${spawnShips} hulls squawked at launch: "${squawkText}"`);
  }
}

// ===========================================================================
// 6. THE RESPONSE FINDS A PLAYER WHO IS NOT STANDING ON THE POI MARKER
// ===========================================================================
rule('6. IT CONVERGES ON THE PLAYER, NOT ON THE MAP');
{
  /*
   * The regression this section exists for, measured before the fix: the group anchored
   * on the POI CENTRE at a random bearing 17-26 km out, the POI radius is 26 km, and
   * `ShipAI._selectTarget` acquires at a floor of 26 km — so a group could open 40 km
   * from the player, see nobody, and sit on its spawn point forever. Four of these ten
   * runs read `closest 11.73 / 31.99 / 24.18 / 26.68 km, in range NEVER`.
   */
  const rows = [];
  for (const offKm of [0, 9, 16, 22, 25]) {
    for (const seedN of [1, 2]) {
      const g = boot(`escalation/off/${offKm}/${seedN}`);
      const war = g.war;
      g.world.reputation.coalition = -50;
      const probe = pursuitProbe(g);
      let t = 0;
      let spawnDist = null;
      while (t < 320) {
        // Hold the claim over the rung and hold the player still: this section is about
        // the group's navigation, and nothing else.
        war.ledger.coalition.claim = Math.max(war.ledger.coalition.claim, ESCALATION[0].at * 1.2);
        war.ledger.coalition.lastPOI = 'graveyard';
        g.player.position.set(offKm * 1000, 0, 0);
        g.player.body.position.set(offKm * 1000, 0, 0);
        g.engine._fixedStep(DT);
        t += DT;
        if (spawnDist === null) {
          const s = g.world.ships.find((x) => x.__escalation && !x.dead);
          if (s) spawnDist = s.position.distanceTo(g.player.position);
        }
        probe.sample(t);
      }
      rows.push({ offKm, seedN, spawnDist, closest: probe.closest, inRangeAt: probe.inRangeAt });
      console.log(`  player ${String(offKm).padStart(2)} km off centre, seed ${seedN}: `
        + `opened at ${spawnDist === null ? ' n/a ' : `${f(spawnDist / 1000, 1).padStart(5)} km`}, `
        + `closed to ${Number.isFinite(probe.closest) ? `${f(probe.closest / 1000, 2).padStart(5)} km` : '  n/a'}, `
        + `in range ${probe.inRangeAt === null ? 'NEVER' : `${f(probe.inRangeAt, 0)} s`}`);
    }
  }
  const stranded = rows.filter((r) => r.inRangeAt === null);
  const worstOpen = Math.max(...rows.map((r) => r.spawnDist ?? Infinity));
  check(stranded.length === 0,
    'every response reaches the player wherever they are standing in the field',
    `${rows.length - stranded.length}/${rows.length} converged; worst opening range `
    + `${f(worstOpen / 1000, 1)} km, inside ShipAI's 26 km acquisition floor by construction`);
}

// ===========================================================================
// 6b. THE HUNTER DOES NOT ANNOUNCE ITSELF
// ===========================================================================
rule('6b. THE THIRD RUNG STAYS DARK — the tiers differ in a way you can feel');
{
  const g = boot('escalation/hunter');
  const war = g.war;
  const entry = war.ledger.coalition;
  g.world.reputation.coalition = -50;
  // The picket has already been answered; the claim is over the hunter's threshold.
  // From here the real `_updateLedger` warns, waits out `warnLead`, and launches.
  entry.tier = 1;
  let squawks = 0;
  let tier = null;
  let resAtLaunch = -1;
  g.world.bus.on(EV.NOTIFY, (n) => { if (/SQUAWKING/.test(n?.text ?? '')) squawks++; });
  g.world.bus.on(MEV.ESCALATION, (e) => {
    if (tier !== null) return;
    tier = e.tier;
    resAtLaunch = 0;
    for (const x of g.world.ships) {
      if (x.__escalation && !x.dead) resAtLaunch = Math.max(resAtLaunch, g.sim.discovery.shipResolution(x));
    }
  });
  const probe = pursuitProbe(g);
  let t = 0;
  while (t < 260) {
    entry.claim = Math.max(entry.claim, ESCALATION[2].at * 1.1);
    entry.lastPOI = 'graveyard';
    g.engine._fixedStep(DT);
    t += DT;
    probe.sample(t);
  }
  console.log(`  launched ${tier ?? 'nothing'}; squawks ${squawks}; `
    + `sensor resolution at launch ${f(resAtLaunch, 2)}; `
    + `closed to ${Number.isFinite(probe.closest) ? `${f(probe.closest / 1000, 2)} km` : 'n/a'}, `
    + `in range ${probe.inRangeAt === null ? 'NEVER' : `${f(probe.inRangeAt, 0)} s`}`);
  check(tier === 'hunter' && squawks === 0 && resAtLaunch === 0,
    'a hunter-killer launches silent — no squawk, nothing on the board, you find it yourself',
    `tier ${tier}, ${squawks} squawks, resolution ${f(resAtLaunch, 2)} at launch against the `
    + `tender's ${'0.30'}. That difference is the third rung's whole character.`);
  check(probe.inRangeAt !== null,
    'and it still arrives — silent is not the same as absent',
    probe.inRangeAt === null ? 'never bore'
      : `bore at ${f(probe.inRangeAt, 0)} s, closed to ${f(probe.closest, 0)} m`);
}

// ===========================================================================
// 7. A CAUTIOUS PLAYER IS NEVER PUNISHED, AND LEAVING IS THE WAY OUT
// ===========================================================================
rule('7. TAKE A LITTLE AND LEAVE — nobody comes, and the claim goes with you');
{
  const g = boot('escalation/cautious');
  const war = g.war;
  const node = g.sim.system.get('graveyard');
  let escalations = 0;
  g.world.bus.on(MEV.ESCALATION, () => { escalations++; });

  // Six sections, then fly out of the field. The claim holds while you are still
  // standing in the graveyard — you are, visibly, the ship that took their hulls apart
  // — and sheds once you have gone. Both halves are the system: the hold is what makes
  // the ladder reachable, and the shed is what makes leaving a real answer instead of
  // a timer running down whatever you do.
  const range = beam(g) * 0.85;
  let t = 0;
  let cuts = 0;
  let claimInField = 0;
  let leftAt = null;
  const away = new THREE.Vector3(node.position.x + node.radius * 2.2, 0, node.position.z);
  while (t < 900) {
    if (cuts < 6) {
      if (!g.salvage.cutting) {
        const n = nearestSection(g, 'coalition');
        if (n && n.d <= range) { g.player.move?.cancel?.(); if (g.salvage.orderCut(n.wreck, n.section)) cuts++; }
        else if (n) g.player.orderMove(n.section.worldPosition);
      }
    } else if (leftAt === null) {
      claimInField = Math.max(claimInField, war.ledger.coalition.claim);
      g.player.orderMove(away);
      if (g.player.position.distanceTo(node.position) > node.radius) leftAt = t;
    }
    g.engine._fixedStep(DT);
    t += DT;
  }
  const status = war.ledgerStatus().find((r) => r.faction === 'coalition');
  console.log(`  ${cuts} sections cut, claim in the field peaked at ${f(claimInField)}`);
  console.log(`  crossed the boundary at ${leftAt === null ? 'never' : `${f(leftAt, 0)} s`}, `
    + `claim at t=${f(t, 0)} s is ${f(war.ledger.coalition.claim, 2)}`);
  console.log(`  readout now: "${status.text}"`);
  check(escalations === 0,
    'six sections never draws anybody — the ladder is EARNED, and a cautious player is safe',
    `${cuts} sections, peak claim ${f(claimInField)} against rung 1 at ${ESCALATION[0].at}, `
    + `${escalations} responses`);
  check(leftAt !== null && war.ledger.coalition.claim < 1 && status.holding === false,
    'and leaving the field is what sheds it — the pressure is spatially negotiable',
    `claim ${f(claimInField)} inside the boundary, ${f(war.ledger.coalition.claim, 2)} after `
    + `${f(t - leftAt, 0)} s outside it at ${f(status.awayDecay, 2)}/s`);
}

// ===========================================================================
// 8. THE READOUT TELLS THE TRUTH ABOUT WHICH WAY THE NUMBER IS GOING
// ===========================================================================
rule('8. THE READOUT — the claim, the rung, and which way it is moving');
{
  const g = boot('escalation/readout');
  const war = g.war;
  const node = g.sim.system.get('graveyard');
  // Sample the moment a charge lands, so "working" is not an assumption about timing.
  let working = null;
  g.world.bus.on(MEV.LEDGER_CHANGED, (e) => {
    if (!working && e.faction === 'coalition' && e.delta > 0) {
      working = war.ledgerStatus().find((r) => r.faction === 'coalition');
    }
  });
  workField(g, 'coalition', 120);
  const away = new THREE.Vector3(node.position.x + node.radius * 2.2, 0, node.position.z);
  let t = 0;
  while (t < 500 && g.player.position.distanceTo(node.position) <= node.radius) {
    g.player.orderMove(away);
    g.engine._fixedStep(DT);
    t += DT;
  }
  for (let i = 0; i < 60 * 10; i++) g.engine._fixedStep(DT);
  const gone = war.ledgerStatus().find((r) => r.faction === 'coalition');

  console.log(`  in the field : "${working?.text ?? '(no charge landed)'}"`);
  console.log(`  outside it   : "${gone.text}"`);
  check(!!working && working.holding === true && working.decayPerSecond === 0
    && gone.holding === false && gone.decayPerSecond > 0,
    'the decay readout reports what the number is doing NOW, not what it would do if you left',
    `in field: holding ${working?.holding} at ${working?.holdingAt}, decay `
    + `${f(working?.decayPerSecond, 2)}/s; outside: holding ${gone.holding}, decay `
    + `${f(gone.decayPerSecond, 2)}/s`);
  check(!!working && /\d+ \/ \d+ to [A-Z]+/.test(working.text),
    'and the HUD sentence names the claim, the threshold and the rung',
    `"${working?.text}"`);
}

// ===========================================================================
// 9. THE ENEMY IS A SECOND CLOCK, AND SAYS SO
// ===========================================================================
rule('9. THE ENEMY READS HEAT, STORES AND POWER — AND THE PLAYER CAN SEE IT');
{
  // The tell and the shot are the same decision, so they are asserted against each other
  // case by case rather than trusted to stay in step.
  const cases = [
    { name: 'strained reactor', set: (r) => { r.strained = true; }, aim: 'reactor', word: 'REACTOR' },
    { name: 'cooking mounts', set: (r) => { r.cooking = true; }, aim: 'weapon', word: 'BATTERY' },
    { name: 'dry magazines', set: (r) => { r.dry = true; }, aim: 'engine', word: 'DRIVE' },
  ];
  let agreed = 0;
  for (const c of cases) {
    const r = makeSystemsRead();
    r.valid = true;
    c.set(r);
    const a = aimFor(r);
    const s = pressReason(r) ?? '';
    if (a === c.aim && s.includes(c.word)) agreed++;
    console.log(`  ${c.name.padEnd(18)} aimFor -> ${String(a).padEnd(8)} tell -> "${s}"`);
  }
  const healthy = makeSystemsRead();
  healthy.valid = true;
  check(agreed === cases.length && aimFor(healthy) === null && pressReason(healthy) === null,
    'the sentence the player reads and the subsystem the AI shoots come from the same branch',
    `${agreed}/${cases.length} agree; a healthy hull produces neither an aim override nor a tell`);

  // ...and now on the live assembly, with a real escalation group in the field.
  const g = boot('escalation/press');
  const war = g.war;
  g.world.reputation.coalition = -50;
  const probe = pursuitProbe(g);
  let t = 0;
  const tells = [];
  g.world.bus.on(EV.NOTIFY, (n) => { if (/IS PRESSING/.test(n?.text ?? '')) tells.push([t, n.text]); });
  while (t < 200) {
    war.ledger.coalition.claim = Math.max(war.ledger.coalition.claim, ESCALATION[0].at * 1.2);
    war.ledger.coalition.lastPOI = 'graveyard';
    g.engine._fixedStep(DT);
    t += DT;
    probe.sample(t);
  }
  const foes = g.world.ships.filter((s) => s.__escalation && !s.dead);
  const calm = foes.map((s) => s.ai?.pressing === true).filter(Boolean).length;

  // Cook every one of the player's mounts, which is exactly what a full ripple does.
  for (const m of g.player.weapons) g.player.thermal.trip(m);
  g.player.thermal.update(DT);
  for (let i = 0; i < 60 * 4; i++) { g.engine._fixedStep(DT); t += DT; }

  const read = makeSystemsRead();
  readSystems(g.player, read);
  const pressing = foes.filter((s) => s.ai?.pressing === true);
  const aiming = foes.filter((s) => {
    const sub = s.targetSubsystem ? g.player.subsystems.get(s.targetSubsystem) : null;
    return sub?.def.kind === 'weapon';
  });
  const routed = foes.filter((s) => s.power?.unlocked && s.ai && s.ai.routing !== 'patrol');

  console.log(`  escalation hulls in the field      ${foes.length}`);
  console.log(`  player read after tripping mounts  pressure ${f(read.pressure, 2)}, `
    + `cooking ${read.cooking}, tripped ${read.tripped}`);
  console.log(`  pressing before / after            ${calm} / ${pressing.length}`);
  console.log(`  aiming at a weapon subsystem       ${aiming.length}`);
  console.log(`  inside the same power budget       ${routed.length} of ${foes.length} `
    + `(routing ${foes.map((s) => s.ai?.routing).join(', ')})`);
  for (const [tt, text] of tells.slice(0, 3)) console.log(`  tell @${f(tt, 0)} s: "${text}"`);

  check(foes.length > 0 && pressing.length > 0 && calm < pressing.length,
    'the group that came for you presses when your mounts go over the cap, and did not before',
    `${calm} pressing before, ${pressing.length} of ${foes.length} after; player pressure `
    + `${f(read.pressure, 2)} against PRESS.at 0.34`);
  check(aiming.length > 0,
    'and it shoots the battery while the battery is offline',
    `${aiming.length} of ${foes.length} hulls aimed at a weapon subsystem`);
  check(routed.length === foes.length,
    'and it is inside the same reactor budget the player is, not on a fixed split',
    `${routed.length}/${foes.length} hulls with an unlocked plant and a solved routing`);
  check(tells.length > 0,
    'and it SAYS SO — the player can read why the fight just changed',
    tells.length ? `"${tells[0][1]}"` : 'no tell was ever emitted; the pressure model is invisible');
}

// ===========================================================================
// 10. SAME SEED, SAME PRESSURE
// ===========================================================================
rule('10. DETERMINISM — the same seed brings the same people at the same time');
{
  const run = () => {
    const g = boot('escalation/determinism');
    const clock = { t: 0 };
    let spawnAt = null;
    let tier = null;
    g.world.bus.on(MEV.ESCALATION, (e) => { if (spawnAt === null) { spawnAt = clock.t; tier = e.tier; } });
    workField(g, 'concord', 240, { tick: (t) => { clock.t = t; } });
    return { spawnAt, tier, claim: g.war.ledger.concord.claim };
  };
  const a = run();
  const b = run();
  console.log(`  run A: ${a.tier ?? 'none'} at ${a.spawnAt === null ? 'never' : `${f(a.spawnAt)} s`}, claim ${f(a.claim, 3)}`);
  console.log(`  run B: ${b.tier ?? 'none'} at ${b.spawnAt === null ? 'never' : `${f(b.spawnAt)} s`}, claim ${f(b.claim, 3)}`);
  check(a.spawnAt !== null && a.spawnAt === b.spawnAt && a.tier === b.tier && a.claim === b.claim,
    'two runs of one seed escalate identically',
    `${a.tier} @ ${f(a.spawnAt)} s both times, claim ${f(a.claim, 3)} both times`);
}

// ---------------------------------------------------------------------------
rule(`${passed} of ${passed + failed} escalation checks passed`);
if (failed > 0) {
  console.error(`\n${failed} FAILED. Escalation has stopped arriving — the graveyard is a `
    + `place you can strip forever with nobody ever coming, and nothing else in the build `
    + `will tell you.`);
  process.exit(1);
}
console.log('\nsummary, from first cut to somebody shooting at you:');
for (const r of arrivals) {
  console.log(`  ${r.faction.padEnd(10)} warned ${f(r.warnAt).padStart(6)} s · `
    + `${r.spawnTier} launched ${f(r.spawnAt).padStart(6)} s (${r.cutsAtSpawn} sections) · `
    + `bearing on you ${f(r.inRangeAt).padStart(6)} s · closed to ${f(r.closest, 0)} m`);
}
console.log(`\nconstants in force: rungs ${ESCALATION.map((e) => `${e.tier}@${e.at}`).join(' ')}`);
process.exit(0);
