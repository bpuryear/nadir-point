/**
 * THE RIPPLE, MEASURED.
 *
 *     node tools/ripple.mjs
 *
 * Headless. No browser, no GPU, no server, no dev dependency. Everything below is
 * driven on the real `CombatSystem`, the real `SalvoController`, the real `WeaponMount`
 * and the real registered modules, at the real `SIM.dt`.
 *
 * WHY IT DRIVES THE SYSTEMS DIRECTLY rather than through `Engine.frame`: `SIM.maxSubsteps`
 * is 6 (`units.js:92`) and `loop.js` zeroes the accumulator when it saturates, so on a
 * slow frame at 4x a sweep can lose sim steps entirely. Through the loop this tool
 * would be measuring the loop. It calls `combat.fixedUpdate(dt)` and then every ship's
 * `fixedUpdate(dt)`, in that order, which is exactly the order band the engine gives
 * them (combat 40, ships 60 — `game.js:196-235`).
 *
 * THE ONE CHECK THAT MATTERS MOST IS 4. It asserts the SLOT COUNT IS UNCHANGED when a
 * barrel is destroyed. A future refactor that "cleans up" the wave by dropping dead
 * slots would make every other check here still pass and would destroy the feature:
 * the hole in the wave IS the readout. Check 4 is the thing that stops it.
 *
 * Every check prints its sample size. A check that measures nothing prints "ok" just as
 * loudly as one that measures everything.
 */

import * as THREE from 'three';
import { Engine } from '../src/core/loop.js';
import { World } from '../src/core/world.js';
import { Ship, WeaponMount } from '../src/sim/ship.js';
import { CombatSystem } from '../src/sim/combat.js';
import {
  RIPPLE, SALVO, CHARGE, MAX_SLOTS, attachSalvo, salvoOf, salvoReport, salvoPreview,
} from '../src/sim/salvo.js';
import { SALVO_THERMAL, THERMAL } from '../src/sim/heat.js';
import { PART_EFFECT } from '../src/sim/subparts.js';
import { misfeedChance, MISFEED_STALL } from '../src/sim/condition.js';
import { EV } from '../src/core/events.js';
import { SIM } from '../src/core/units.js';
import { AMMO_SPEC, ammoClassOf } from '../src/core/ammo.js';
import {
  registerShipClass, getShipClass, getModule, allModules,
} from '../src/core/contracts.js';
import { CRUISER_HARDPOINTS } from '../src/art/geometry/hardpoints.js';
// Registers all thirteen weapon-bearing modules, with their declared `muzzles`.
import '../src/art/geometry/modules/index.js';

const DT = SIM.dt;

let passed = 0;
let failed = 0;

const rule = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);
const f = (v, dp = 3) => (typeof v === 'number' ? v.toFixed(dp) : String(v));

function check(ok, name, evidence) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`        ${evidence}`);
}

const HP = new Map(CRUISER_HARDPOINTS.map((h) => [h.id, h]));

// ---------------------------------------------------------------------------
// fixture
// ---------------------------------------------------------------------------

function defineClasses() {
  if (getShipClass('ripple_cruiser')) return;
  registerShipClass({
    id: 'ripple_cruiser', name: 'Ripple Test Cruiser', faction: 'player', role: 'cruiser',
    length: 1400, mass: 42000, maxSpeed: 120, accel: 12, turnRate: 0.2, hullHP: 90000,
    triBudget: 2000, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 9000, position: [0, 0, -60], radius: 70, salvageValue: 0.3, label: 'REACTOR' },
    ],
    weapons: [],
  });
  // A hostile that shoots back, used only by check 13. Kept off `ripple_target` so no
  // other check has incoming fire in it.
  registerShipClass({
    id: 'ripple_shooter', name: 'Ripple Test Shooter', faction: 'coalition', role: 'destroyer',
    length: 480, mass: 9000, maxSpeed: 90, accel: 9, turnRate: 0.3, hullHP: 900000,
    triBudget: 1200, build: () => new THREE.Group(),
    subsystems: [
      { id: 'battery', kind: 'weapon', hp: 4000, position: [0, 0, 40], radius: 60, salvageValue: 0.3, label: 'BATTERY' },
    ],
    weapons: [{
      // A CANNON. `DEFAULT_FIRE_MODE.cannon` is 'SALVO' (ship.js:41), so this mount is
      // in exactly the state that a naive `fireMode !== 'AUTO'` gate would disarm.
      id: 'npc_cannon', name: 'NPC Cannon', type: 'cannon', range: 5200, damage: 40,
      shotsPerBurst: 3, burstInterval: 0.2, cooldown: 2.4, projectileSpeed: 1400,
      tracking: 0.8, powerDraw: 6, mount: [0, 0, 40], yawCentre: 0, yawWidth: Math.PI * 1.6,
    }],
  });
  registerShipClass({
    id: 'ripple_target', name: 'Ripple Test Target', faction: 'coalition', role: 'destroyer',
    length: 480, mass: 9000, maxSpeed: 90, accel: 9, turnRate: 0.3, hullHP: 900000,
    triBudget: 1200, build: () => new THREE.Group(),
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 400000, position: [0, 0, -40], radius: 40, salvageValue: 0.3, label: 'REACTOR' },
    ],
    weapons: [],
  });
}

/** A World with a real THREE.Scene and no renderer. Nothing here needs a GPU. */
function makeWorld(seed) {
  const engine = new Engine();
  const scene = new THREE.Scene();
  const world = new World({
    engine,
    renderer: { scene, far: new THREE.Scene(), camera: new THREE.PerspectiveCamera() },
    seed,
  });
  world.reputation.coalition = -1;   // hostile, so `areHostile` says yes
  return world;
}

/**
 * Fit a module to a hardpoint exactly the way `refit.js:316-332` does: the TARGET
 * hardpoint's anchor and arc, verbatim, mirror 1. A port-authored module fitted to
 * starboard therefore differs from its port twin only in the muzzle mirroring, which
 * is what `salvo.js#muzzleMirror` is for and what this fixture exercises.
 */
function fit(ship, hardpointId, moduleId) {
  const def = getModule(moduleId);
  if (!def) throw new Error(`no module "${moduleId}"`);
  const hp = HP.get(hardpointId);
  const mount = new WeaponMount(def.weapon, {
    localPosition: new THREE.Vector3(hp.anchor[0], hp.anchor[1], hp.anchor[2]),
    yawCentre: hp.yawCentre,
    yawWidth: def.weapon.yawWidth ?? hp.yawWidth,
    hardpoint: hardpointId,
    condition: 1,
    moduleDef: def,
    containerHP: hp.structureHP,
  });
  ship.weapons.push(mount);
  return mount;
}

/**
 * A player cruiser with `fits`, a hostile destroyer on the port beam, and a recorder
 * on the bus. `fits` is [[hardpointId, moduleId], ...].
 */
function scenario(fits, { seed = 'ripple', bearing = -Math.PI * 0.5, range = 2400, command = true } = {}) {
  defineClasses();
  const world = makeWorld(seed);
  const combat = new CombatSystem(world);
  world.register('combat', combat);

  const player = new Ship({ classDef: getShipClass('ripple_cruiser'), world, faction: 'player', isPlayer: true });
  world.player = player;
  world.addShip(player);
  for (const [hpId, modId] of fits) fit(player, hpId, modId);
  /*
   * ATTACH BEFORE THE FIRST STEP, exactly as `input/controls.js` does in its
   * constructor and for the same reason. Attach late and the 120-step settle below
   * becomes 120 steps of uncommanded automatic fire: the battery spends its cooldown,
   * `schedulable()` then rejects it, and the first commanded wave comes back short.
   * Measured while writing this: 6 slots instead of 10, and the check-2 worst case
   * fell from 20 slots to 14. `command: false` is check 14's deliberate exception.
   */
  if (command) attachSalvo(player, combat);

  const target = new Ship({
    classDef: getShipClass('ripple_target'), world, faction: 'coalition',
    position: new THREE.Vector3(Math.sin(bearing) * range, 0, Math.cos(bearing) * range),
  });
  world.addShip(target);
  player.orderAttack(target);

  const rec = { t: 0, fired: [], salvos: [], complete: [], charging: [], impacts: 0 };
  world.bus.on(EV.WEAPON_CHARGING, (p) => rec.charging.push({
    t: rec.t, mount: p.mount, time: p.time, charge: p.charge, aborted: p.aborted === true,
  }));
  world.bus.on(EV.WEAPON_FIRED, (p) => {
    rec.fired.push({
      t: rec.t, mount: p.mount, hardpoint: p.mount.hardpoint, emitter: p.emitter,
      ox: p.origin.x, oy: p.origin.y, oz: p.origin.z,
    });
  });
  world.bus.on(EV.SALVO_FIRED, (p) => rec.salvos.push({ t: rec.t, side: p.side, slotCount: p.slotCount }));
  world.bus.on(EV.SALVO_COMPLETE, (p) => rec.complete.push({
    t: rec.t, side: p.side, fired: p.fired, dropped: p.dropped, reasons: { ...p.reasons },
  }));
  world.bus.on(EV.PROJECTILE_IMPACT, () => { rec.impacts++; });

  // Settle one step so every mount has a world position and has begun tracking.
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      combat.fixedUpdate(DT);
      for (const s of world.ships) s.fixedUpdate(DT);
      world.time += DT;
      rec.t += DT;
    }
  };
  step(120);            // two seconds: mounts traverse onto the target
  rec.fired.length = 0; // nothing should have fired, but do not measure the settle

  const ctx = { world, combat, player, target, rec, step };
  ALL_SCENARIOS.push(ctx);
  return ctx;
}

/**
 * Every scenario this run built, in construction order.
 *
 * Check 15 audits the SALVO_FIRED/SALVO_COMPLETE ledger over all of them rather than
 * over a fresh scenario of its own. A conservation law that is only ever checked on a
 * case built to satisfy it is not a conservation law.
 */
const ALL_SCENARIOS = [];

/** Ship-local z of a slot, for the ordering check. */
const slotZ = (c, i) => c._slots[i].localZ;

/** Destroy one sub-part outright, the way `Ship._onPartDestroyed` leaves the mount. */
function killPart(mount, partId) {
  const p = mount.parts.get(partId);
  if (!p) throw new Error(`mount has no part "${partId}"`);
  mount.parts.damagePart(p, p.maxHP * 4);
  // `ship.js:712-715` takes an inert mount offline with reason 'output'. Mirrored here
  // so the fixture is in the same state the real damage path leaves it in — which is
  // the state check 4 asserts the scheduler still accepts.
  if (mount.parts.inert) { mount.online = false; mount.offlineReason = 'output'; }
  return p;
}

/** Run one salvo to completion and return the released sequence. */
function runSalvo(ctx, side = 'auto', opts = undefined) {
  const c = attachSalvo(ctx.player, ctx.combat);
  ctx.rec.fired.length = 0;
  ctx.rec.salvos.length = 0;
  ctx.rec.complete.length = 0;
  ctx.rec.impacts = 0;
  const n = c.arm(side, opts);
  const t0 = ctx.rec.t;
  const plan = [];
  for (let i = 0; i < n; i++) {
    const s = c._slots[i];
    plan.push({ i, hardpoint: s.mount.hardpoint, emitter: s.emitter, z: s.localZ, x: s.localX, time: s.time, dead: s.dead, frozen: s.frozen });
  }
  let guard = 0;
  while (c.active && guard++ < 6000) ctx.step(1);
  return { n, plan, t0, controller: c };
}

// ---------------------------------------------------------------------------
// 1. the wave runs fore to aft
// ---------------------------------------------------------------------------
rule('1  ORDER — the wave walks the hull from the bow aft, one barrel at a time');

const s1 = scenario([['port', 'port_broadside_battery'], ['dorsal', 'dorsal_missile_cells']]);
const r1 = runSalvo(s1);

console.log('        slot  hardpoint          emitter   local z    local x    t (s)');
for (const p of r1.plan) {
  console.log(`         ${String(p.i).padStart(2)}   ${p.hardpoint.padEnd(18)}   ${p.emitter}     `
    + `${f(p.z, 1).padStart(8)}   ${f(p.x, 1).padStart(8)}   ${f(p.time)}`);
}

let zMonotonic = true;
let tMonotonic = true;
for (let i = 1; i < r1.plan.length; i++) {
  if (r1.plan[i].z > r1.plan[i - 1].z + 1e-9) zMonotonic = false;
  if (r1.plan[i].time < r1.plan[i - 1].time - 1e-9) tMonotonic = false;
}
const firedOrder = s1.rec.fired;
let releaseMonotonic = true;
for (let i = 1; i < firedOrder.length; i++) {
  if (firedOrder[i].t < firedOrder[i - 1].t - 1e-9) releaseMonotonic = false;
}
const crossings = r1.plan.filter((p, i) => i > 0 && p.hardpoint !== r1.plan[i - 1].hardpoint).length;
check(zMonotonic && tMonotonic && releaseMonotonic && r1.n === 10,
  'ship-local z is non-increasing and time is non-decreasing across the whole wave',
  `${r1.n} slots (4 sponson + 6 VLS), ${firedOrder.length} released, ${crossings} mount `
  + `crossings — the two modules INTERLEAVE, which is the point: the wave is a property `
  + `of the hull, not of the module list. z from ${f(r1.plan[0].z, 1)} to `
  + `${f(r1.plan[r1.n - 1].z, 1)} m.`);

// ---------------------------------------------------------------------------
// 2. cadence, mount gaps, and the worst case
// ---------------------------------------------------------------------------
rule('2  CADENCE — every beat is in band, crossings cost a gap, and the sweep is bounded');

const gaps = [];
for (let i = 1; i < r1.plan.length; i++) {
  gaps.push({
    dt: r1.plan[i].time - r1.plan[i - 1].time,
    crossed: r1.plan[i].hardpoint !== r1.plan[i - 1].hardpoint,
  });
}
const sameMount = gaps.filter((g) => !g.crossed);
const crossMount = gaps.filter((g) => g.crossed);
const inBand = sameMount.every((g) => g.dt >= RIPPLE.stepMin - 1e-9 && g.dt <= RIPPLE.stepMax + 1e-9);
const crossCarriesGap = crossMount.every((g) => g.dt >= RIPPLE.stepMin + RIPPLE.mountGap - 1e-9);
const sweep1 = r1.plan[r1.n - 1].time;

check(inBand && crossCarriesGap && sweep1 <= RIPPLE.sweepMax,
  'same-mount gaps sit inside [stepMin, stepMax]; cross-mount gaps carry mountGap',
  `${sameMount.length} same-mount gaps in [${f(Math.min(...sameMount.map((g) => g.dt)))}, `
  + `${f(Math.max(...sameMount.map((g) => g.dt)))}] against band [${RIPPLE.stepMin}, ${RIPPLE.stepMax}]; `
  + `${crossMount.length} cross-mount gaps, min ${f(Math.min(...crossMount.map((g) => g.dt)))} `
  + `>= stepMin+mountGap ${f(RIPPLE.stepMin + RIPPLE.mountGap)}; sweep ${f(sweep1)} s <= ${RIPPLE.sweepMax}.`);

// FLAG 12. The worst case a registered hull can produce, printed rather than left to a
// playtest. `stepMin` wins over `sweepMax` by design, so this overshoots and says so.
const worstFits = [
  ['port', 'port_broadside_battery'], ['starboard', 'port_cannon_bank'],
  ['dorsal', 'dorsal_missile_cells'], ['bow', 'bow_torpedo_tubes'],
];
const sWorst = scenario(worstFits, { seed: 'ripple-worst' });
const cWorst = attachSalvo(sWorst.player, sWorst.combat);
const nWorst = cWorst.arm('all', { immediate: true });
const sweepWorst = cWorst.sweep;
// The compression floor is stepMin per beat AND per mount crossing: `squeeze` clamps a
// mountGap to stepMin too, and an interleaved wave crosses far more often than it has
// mounts, because the order is a property of where the barrels are on the hull.
let crossWorst = 0;
for (let i = 1; i < nWorst; i++) if (cWorst._slots[i].mountIndex !== cWorst._slots[i - 1].mountIndex) crossWorst++;
const floorWorst = RIPPLE.stepMin * (nWorst - 1 + crossWorst);
const over = ((sweepWorst / RIPPLE.sweepMax) - 1) * 100;
console.log(`\n        WORST CASE over the registry, side 'all', every mount fresh:`);
console.log(`          ${nWorst} slots across ${cWorst._mountCount} mounts (pool is ${MAX_SLOTS}), `
  + `${crossWorst} mount crossings`);
console.log(`          sweep ${f(sweepWorst)} s against sweepMax ${RIPPLE.sweepMax} s  -> ${f(over, 1)}% OVER`);
console.log(`          the floor stepMin*(n-1) alone is ${f(floorWorst)} s, so the ceiling is`);
console.log(`          unreachable by compression: stepMin wins, exactly as the spec says it does.`);
console.log(`          This is FLAG 12. It is a measurement, not a playtest note.`);
check((sweepWorst <= RIPPLE.sweepMax || floorWorst > RIPPLE.sweepMax)
  && Math.abs(sweepWorst - floorWorst) < 1e-9,
  'the sweep only exceeds sweepMax when stepMin makes the ceiling unreachable',
  `worst hull: ${nWorst} slots, sweep ${f(sweepWorst)} s, which is EXACTLY the stepMin `
  + `floor ${f(floorWorst)} s — every beat and every crossing is already compressed to `
  + `${RIPPLE.stepMin} s and there is nothing left to give. Ordinary broadside: `
  + `${r1.n} slots, ${f(sweep1)} s, inside the ceiling.`);

// ---------------------------------------------------------------------------
// 3. power routing reads out in the rhythm
// ---------------------------------------------------------------------------
rule('3  POWER READS OUT IN THE RHYTHM — the wave IS the routing widget, heard');

const s3 = scenario([['port', 'port_broadside_battery']], { seed: 'ripple-power' });
s3.player.power.unlocked = true;
const sweeps = {};
for (const preset of ['assault', 'balanced', 'run']) {
  s3.player.power.applyPreset(preset);
  s3.step(300);                                  // 5 s: spoolRate 0.34/s settles a 0.25 swing
  const c = attachSalvo(s3.player, s3.combat);
  c._lockout = 0;
  for (const m of s3.player.weapons) { m.cooldown = 0; m.ready = m.readyMax; m.reloading = 0; }
  const n = c.arm('port');
  sweeps[preset] = { n, sweep: c.sweep, factor: s3.player.power.factor('weapons') };
  let guard = 0;
  while (c.active && guard++ < 3000) s3.step(1);
}
console.log(`        preset     weapons factor   slots   sweep (ms)   spec (ms)`);
console.log(`        assault    ${f(sweeps.assault.factor, 2)}             ${sweeps.assault.n}       `
  + `${f(sweeps.assault.sweep * 1000, 1).padStart(6)}       234`);
console.log(`        balanced   ${f(sweeps.balanced.factor, 2)}             ${sweeps.balanced.n}       `
  + `${f(sweeps.balanced.sweep * 1000, 1).padStart(6)}       330`);
console.log(`        run        ${f(sweeps.run.factor, 2)}             ${sweeps.run.n}       `
  + `${f(sweeps.run.sweep * 1000, 1).padStart(6)}       660`);
check(sweeps.assault.sweep < sweeps.balanced.sweep && sweeps.balanced.sweep < sweeps.run.sweep,
  'routing to weapons compresses the wave; routing away stretches it',
  `${f(sweeps.assault.sweep * 1000, 1)} < ${f(sweeps.balanced.sweep * 1000, 1)} < `
  + `${f(sweeps.run.sweep * 1000, 1)} ms over a 4-gun bank, 3 samples. The design document's own `
  + `table is 234/330/660 ms and this is the same arithmetic run on the real power plant. `
  + `'run' is floored by the max(0.25, factor) clamp at combat.js:146, not by its 0.05 share.`);

// ---------------------------------------------------------------------------
// 4. THE HOLE. The one check that stops a refactor destroying the mechanic.
// ---------------------------------------------------------------------------
rule('4  HOLES — a dead barrel keeps its slot. THE SLOT COUNT DOES NOT CHANGE.');

const s4 = scenario([['port', 'port_broadside_battery'], ['dorsal', 'dorsal_missile_cells']], { seed: 'ripple-dead' });
const deadMount = s4.player.weapons[0];
const before = runSalvo(s4);
const beforeCount = before.n;
const beforeFired = s4.rec.fired.filter((e) => e.mount === deadMount).length;

killPart(deadMount, 'barrels');
s4.step(60);
salvoOf(s4.player)._lockout = 0;
for (const m of s4.player.weapons) { m.cooldown = 0; m.ready = m.readyMax; m.reloading = 0; }

const after = runSalvo(s4);
const firedFromDead = s4.rec.fired.filter((e) => e.mount === deadMount).length;
const deadSlots = after.plan.filter((p) => p.dead);
const deadGaps = [];
for (let i = 1; i < after.plan.length; i++) {
  if (after.plan[i - 1].dead) deadGaps.push(after.plan[i].time - after.plan[i - 1].time);
}
const gapsAreDeadPause = deadGaps.length > 0 && deadGaps.every((g) => Math.abs(g - RIPPLE.deadPause) < 1e-6
  || Math.abs(g - (RIPPLE.deadPause + RIPPLE.mountGap)) < 1e-6);

check(after.n === beforeCount && firedFromDead === 0 && deadSlots.length === 4 && gapsAreDeadPause,
  'destroying the output sub-part leaves the slot count identical and the wave holed',
  `slots ${beforeCount} -> ${after.n} (UNCHANGED); ${deadSlots.length} of them now dead; `
  + `rounds out of THAT mount ${beforeFired} -> ${firedFromDead}; `
  + `the gaps after a dead slot are ${deadGaps.map((g) => f(g)).join(', ')} s against deadPause `
  + `${RIPPLE.deadPause} (+ mountGap ${RIPPLE.mountGap} where the wave crosses). `
  + `IF THIS EVER FAILS BECAUSE THE COUNT WENT DOWN, THE FEATURE HAS BEEN REFACTORED AWAY.`);

// ---------------------------------------------------------------------------
// 5. a worn feed is a late beat
// ---------------------------------------------------------------------------
rule('5  STUTTER — a destroyed feed stretches that mount\'s beats and nothing else\'s');

const s5 = scenario([['port', 'port_broadside_battery']], { seed: 'ripple-feed' });
const base5 = runSalvo(s5);
const baseStep = base5.plan[1].time - base5.plan[0].time;

killPart(s5.player.weapons[0], 'feed');
s5.step(60);
salvoOf(s5.player)._lockout = 0;
for (const m of s5.player.weapons) { m.cooldown = 0; m.ready = m.readyMax; m.reloading = 0; }
const worn5 = runSalvo(s5);
const wornStep = worn5.plan[1].time - worn5.plan[0].time;
const expected = 1 / Math.sqrt(PART_EFFECT.feedFireRate);
const observed = wornStep / baseStep;

check(Math.abs(observed - expected) < 1e-6 && worn5.n === base5.n && s5.rec.complete.length === 1,
  'a dead feed grows the step by exactly 1/sqrt(0.35) and the sweep still completes',
  `step ${f(baseStep)} -> ${f(wornStep)} s, ratio ${f(observed, 5)} against `
  + `1/sqrt(PART_EFFECT.feedFireRate ${PART_EFFECT.feedFireRate}) = ${f(expected, 5)}. `
  + `${worn5.n} slots, ${s5.rec.fired.length} released, SALVO_COMPLETE emitted once. `
  + `This is the check that would fail if fireRateMul were counted twice: the double `
  + `count gives 264 ms, past stepMax ${RIPPLE.stepMax}, and the clamp would eat it.`);

// ---------------------------------------------------------------------------
// 6. a frozen ring fires into empty space
// ---------------------------------------------------------------------------
rule('6  FROZEN — the gun still fires, it just fires where it is stuck');

const s6 = scenario([['port', 'port_broadside_battery']], { seed: 'ripple-frozen' });
const base6 = runSalvo(s6);
const base6Step = base6.plan[1].time - base6.plan[0].time;

const frozenMount = s6.player.weapons[0];
frozenMount.traverse = 0.9;                     // 51.6 deg off arc centre, then the ring dies
killPart(frozenMount, 'ring');
s6.step(60);
salvoOf(s6.player)._lockout = 0;
for (const m of s6.player.weapons) { m.cooldown = 0; m.ready = m.readyMax; m.reloading = 0; }

const heatBefore = frozenMount.thermal.heat;
const hullBefore = s6.target.hullHP;
const frozen6 = runSalvo(s6);
const frozenStep = frozen6.plan[1].time - frozen6.plan[0].time;
const bears = frozenMount.canBear(s6.player.position, s6.player.heading, s6.target.position);
const heatAfter = frozenMount.thermal.heat;     // read BEFORE the flight time below
s6.step(600);                                   // let any round that WAS on line arrive

check(frozen6.n === base6.n && s6.rec.fired.length === base6.n && !bears
  && Math.abs(frozenStep - (base6Step + RIPPLE.frozenPause)) < 1e-6
  && s6.target.hullHP === hullBefore && heatAfter > heatBefore,
  'a frozen mount spends the round and the heat and lands nothing',
  `frozenAt ${f(frozenMount.parts.frozenAt)} rad, residual arc `
  + `${PART_EFFECT.traverseFrozenArc} rad, target ${bears ? 'IN' : 'OUT OF'} that arc. `
  + `step ${f(base6Step)} -> ${f(frozenStep)} s = step + frozenPause ${RIPPLE.frozenPause}. `
  + `${s6.rec.fired.length} of ${frozen6.n} slots fired; target hull ${f(hullBefore, 0)} -> `
  + `${f(s6.target.hullHP, 0)} (unchanged) over 600 further steps of flight time; mount `
  + `heat ${f(heatBefore)} -> ${f(heatAfter)} at the end of the sweep. reasons.frozen = `
  + `${s6.rec.complete[0]?.reasons.frozen ?? 0} of ${frozen6.n} — every round wasted.`);

// ---------------------------------------------------------------------------
// 7. the wave that stops two guns early
// ---------------------------------------------------------------------------
rule('7  DIES HALFWAY — a mid-sweep trip or jam drops that mount and only that mount');

const s7 = scenario([['port', 'port_broadside_battery'], ['dorsal', 'dorsal_missile_cells']], { seed: 'ripple-cook' });
const cookMount = s7.player.weapons[0];
// One shot from the trip. `onShot` adds perShot x (0.75 + 0.35 x power) x heatMul.
cookMount.thermal.heat = THERMAL.tripAt - 0.01;
const cooked = runSalvo(s7);
const firedCooked = s7.rec.fired.filter((e) => e.mount === cookMount).length;
const firedOther = s7.rec.fired.filter((e) => e.mount !== cookMount).length;
const otherSlots = cooked.plan.filter((p) => p.hardpoint !== 'port').length;
const rc = s7.rec.complete[0];

check(cookMount.thermal.tripped && firedCooked === 1 && firedOther === otherSlots
  && rc && rc.reasons.cooked === 3 && rc.fired + rc.dropped === cooked.n,
  'a mount that cooks mid-sweep loses its remaining slots; no other mount loses one',
  `the port battery fired ${firedCooked} of 4 then tripped (heat `
  + `${f(cookMount.thermal.heat)} >= tripAt ${THERMAL.tripAt}); reasons.cooked = `
  + `${rc?.reasons.cooked}; the dorsal cells fired ${firedOther} of ${otherSlots}. `
  + `fired ${rc?.fired} + dropped ${rc?.dropped} = slotCount ${cooked.n}, the invariant `
  + `EV.SALVO_COMPLETE's payload note promises.`);

// The jam half is statistical: misfeedChance caps at 0.45 and the worst a schedulable
// mount can reach is condition 0.20. So it is measured over a real sample.
const s7b = scenario([['port', 'port_broadside_battery'], ['dorsal', 'dorsal_missile_cells']], { seed: 'ripple-jam' });
const jamMount = s7b.player.weapons[0];
jamMount.condition = 0.21;
let salvosRun = 0;
let jams = 0;
let jamCleanEveryTime = true;
for (let k = 0; k < 200; k++) {
  const c = attachSalvo(s7b.player, s7b.combat);
  c._lockout = 0;
  for (const m of s7b.player.weapons) {
    m.cooldown = 0; m.stall = 0; m.ready = m.readyMax; m.reloading = 0;
    m.thermal.heat = 0; m.thermal.tripped = false; m.online = true; m.offlineReason = null;
  }
  s7b.player.stores.ammo.shell = s7b.player.stores.capacity.shell;
  s7b.player.stores.ammo.missile = s7b.player.stores.capacity.missile;
  const res = runSalvo(s7b);
  if (res.n === 0) continue;
  salvosRun++;
  const comp = s7b.rec.complete[0];
  if (!comp || !comp.reasons.jammed) continue;
  jams++;
  const firedFromJam = s7b.rec.fired.filter((e) => e.mount === jamMount).length;
  const dorsalSlots = res.plan.filter((p) => p.hardpoint === 'dorsal').length;
  const firedDorsal = s7b.rec.fired.filter((e) => e.hardpoint === 'dorsal').length;
  if (firedFromJam !== 0 || comp.reasons.jammed !== 4 || firedDorsal !== dorsalSlots) jamCleanEveryTime = false;
}
const rate = jams / Math.max(1, salvosRun);
check(jams > 0 && jamCleanEveryTime,
  'a misfeed rolled once per mount drops all four of its slots and none of the dorsal cells',
  `SAMPLE SIZE ${salvosRun} salvos at condition 0.21; ${jams} jammed = ${f(rate * 100, 1)}% `
  + `against misfeedChance(0.21) = ${f(misfeedChance(0.21))}. In every one of the ${jams}, all `
  + `4 sponson slots dropped as 'jammed', 0 rounds left that mount, and every dorsal slot `
  + `still fired. Stall set to MISFEED_STALL ${MISFEED_STALL} s.`);

// ---------------------------------------------------------------------------
// 8. running dry mid-ripple
// ---------------------------------------------------------------------------
rule('8  RAN DRY — the feed empties and the wave stops where the rounds stopped');

const s8 = scenario([['port', 'port_broadside_battery']], { seed: 'ripple-dry' });
const dryMount = s8.player.weapons[0];
dryMount.ready = 2;
const dry = runSalvo(s8);
const dryComp = s8.rec.complete[0];
const reloadStarted = dryMount.reloading > 0 || dryMount.ready > 0;

check(dry.n === 4 && s8.rec.fired.length === 2 && dryMount.cooldown >= 0.5
  && dryComp.reasons.dry === 2 && dryComp.fired + dryComp.dropped === 4 && reloadStarted,
  'two ready rounds against four barrels fires exactly two and stops there',
  `${dry.n} slots scheduled from a ${dryMount.readyMax}-round feed set to 2; `
  + `${s8.rec.fired.length} fired, reasons.dry ${dryComp.reasons.dry}, and the two dropped `
  + `slots KEPT THEIR BEATS — ${dry.n} scheduled, ${dry.n} resolved. Cooldown afterwards `
  + `${f(dryMount.cooldown)} s. MEASURED, NOT ASSUMED: that number is the COMPLETION `
  + `cooldown (def.cooldown ${dryMount.def.cooldown} / cadence), not the >= 0.5 floor the `
  + `dry path sets — for every registered weapon def.cooldown/cadence exceeds 0.5, so the `
  + `floor this controller mirrors from combat.js:160-162 only ever shows through if the `
  + `sweep is torn down before it completes.`);

// ---------------------------------------------------------------------------
// 9. determinism, and the fork label that would have broken it
// ---------------------------------------------------------------------------
rule('9  DETERMINISM — same seed, same wave, in a fresh World in the SAME process');

function sequence(seed) {
  const s = scenario([['port', 'port_broadside_battery'], ['dorsal', 'dorsal_missile_cells']], { seed });
  s.player.weapons[0].condition = 0.21;    // put the misfeed roll on the critical path
  const c = attachSalvo(s.player, s.combat);
  // Twenty consecutive salvos, so the RNG stream is exercised far past its first draw.
  const seq = [];
  for (let k = 0; k < 20; k++) {
    c._lockout = 0;
    for (const m of s.player.weapons) { m.cooldown = 0; m.stall = 0; m.ready = m.readyMax; m.reloading = 0; m.thermal.heat = 0; }
    s.player.stores.ammo.shell = s.player.stores.capacity.shell;
    s.player.stores.ammo.missile = s.player.stores.capacity.missile;
    runSalvo(s);
    for (const e of s.rec.fired) seq.push(`${f(e.t)}|${e.hardpoint}|${e.emitter}`);
  }
  return { ship: s.player, label: salvoOf(s.player).rngLabel, rngSeed: s.world.rng.seed, seq: seq.join(' ') };
}
const a9 = sequence('ripple-det');
const b9 = sequence('ripple-det');
const c9 = sequence('ripple-other-seed');

check(a9.seq === b9.seq && a9.label === b9.label && a9.seq.length > 0 && c9.seq !== a9.seq,
  'two Worlds built from one seed in one process release an identical sequence',
  `${a9.seq.split(' ').length} released events over 20 consecutive salvos, compared tuple `
  + `by tuple: identical. A DIFFERENT world seed gives a different sequence `
  + `(${c9.seq.split(' ').length} events), so the check is measuring something. The fork `
  + `label is "${a9.label}" in all three runs — it is built from the SPAWN INDEX, and the `
  + `seed enters through world.rng (${a9.rngSeed} vs ${c9.rngSeed}), which is what makes `
  + `the label safe to reuse. ship.id would have been "${a9.ship.id}" and "${b9.ship.id}": `
  + `Ship._nextId (ship.js:291) is a counter on the class, so it does not reset between `
  + `Worlds and a fork label built from it would have made these two runs diverge.`);

// ---------------------------------------------------------------------------
// 10. nothing allocates
// ---------------------------------------------------------------------------
rule('10  NO ALLOCATION — the pool is built once and reused for every salvo');

const s10 = scenario([['port', 'port_broadside_battery'], ['dorsal', 'dorsal_missile_cells']], { seed: 'ripple-alloc' });
const c10 = attachSalvo(s10.player, s10.combat);
const identities = new Set(c10._slots);
const poolLen = c10._slots.length;
const reportId = salvoReport(s10.player);
const shotId = c10._shot;

const heap0 = process.memoryUsage().heapUsed;
let salvoCount = 0;
for (let k = 0; k < 500; k++) {
  c10._lockout = 0;
  for (const m of s10.player.weapons) { m.cooldown = 0; m.ready = m.readyMax; m.reloading = 0; m.thermal.heat = 0; }
  s10.player.stores.ammo.shell = s10.player.stores.capacity.shell;
  s10.player.stores.ammo.missile = s10.player.stores.capacity.missile;
  if (c10.arm('auto') > 0) salvoCount++;
  let guard = 0;
  while (c10.active && guard++ < 400) s10.step(1);
  salvoReport(s10.player);
  salvoPreview(s10.player);
}
const heap1 = process.memoryUsage().heapUsed;
const identitiesAfter = new Set(c10._slots);
let sameSet = identities.size === identitiesAfter.size;
for (const s of identities) if (!identitiesAfter.has(s)) sameSet = false;
const kb = (heap1 - heap0) / 1024;

check(c10._slots.length === poolLen && c10._slots.length === MAX_SLOTS && sameSet
  && salvoReport(s10.player) === reportId && c10._shot === shotId,
  'the slot pool, the report and the per-shot payload are the same objects afterwards',
  `SAMPLE SIZE ${salvoCount} salvos (${salvoCount * 10} slots released). Pool length `
  + `${poolLen} -> ${c10._slots.length}, and the ${identities.size} slot objects are the `
  + `SAME ${identitiesAfter.size} objects — the in-place insertion sort permutes them, it `
  + `never replaces them. salvoReport and _shot return one identity throughout. Heap moved `
  + `${kb >= 0 ? '+' : ''}${f(kb, 1)} kB across the run WITHOUT a forced gc, which is `
  + `evidence, not proof: the identity assertions above are the proof.`);

// ---------------------------------------------------------------------------
// 11. one muzzle per shot, as DATA on the definition
// ---------------------------------------------------------------------------
rule('11  EMITTER INVARIANT — muzzles are static data, one per shot, on every module');

const weaponModules = allModules().filter((d) => d.weapon);
const rows11 = [];
let mismatches = 0;
let derived = 0;
for (const d of weaponModules) {
  const n = d.muzzles?.length ?? 0;
  const want = d.weapon.shotsPerBurst;
  if (n !== want) mismatches++;
  // The regression this exists for: an accessor would let someone re-derive the list
  // from the built mesh, which is LOD-gated and would make a sim quantity depend on the
  // graphics quality setting.
  const desc = Object.getOwnPropertyDescriptor(d, 'muzzles');
  const isData = !!desc && typeof desc.get !== 'function';
  const stable = d.muzzles === d.muzzles;
  if (!isData || !stable) derived++;
  rows11.push(`${d.id} ${n}/${want}`);
}
check(weaponModules.length === 13 && mismatches === 0 && derived === 0,
  'all thirteen weapon modules declare exactly shotsPerBurst muzzles, as a plain array',
  `SAMPLE SIZE ${weaponModules.length} modules, ${weaponModules.reduce((a, d) => a + (d.muzzles?.length ?? 0), 0)} `
  + `muzzles: ${rows11.join(', ')}. ${derived} of them expose muzzles through a getter `
  + `(any non-zero here means someone is deriving them from geometry, and the count would `
  + `then change with LOD — port_beam_array draws 3 glow discs at LOD0 and 1 at LOD1/2).`);

// ---------------------------------------------------------------------------
// 12. the feed is at least as deep as the burst is long
// ---------------------------------------------------------------------------
rule('12  AUTHORING INVARIANT — no module can run dry inside its own burst');

const kinetic = weaponModules.filter((d) => ammoClassOf(d.weapon) != null);
const violations = [];
for (const d of kinetic) {
  const cls = ammoClassOf(d.weapon);
  const ready = d.weapon.ready ?? AMMO_SPEC[cls]?.ready ?? 0;
  if (ready < d.weapon.shotsPerBurst) violations.push(`${d.id} ${ready}<${d.weapon.shotsPerBurst}`);
}
check(kinetic.length > 0 && violations.length === 0,
  'every kinetic module holds at least shotsPerBurst ready rounds',
  `SAMPLE SIZE ${kinetic.length} kinetic modules of ${weaponModules.length}; `
  + `${violations.length} violations${violations.length ? `: ${violations.join(', ')}` : ''}. `
  + `dorsal_missile_cells declared 6 cells against a 4-round default feed for the whole `
  + `life of the project; it now declares ready: `
  + `${getModule('dorsal_missile_cells').weapon.ready ?? AMMO_SPEC.missile.ready}.`);

// ---------------------------------------------------------------------------
// 13. the third verb
// ---------------------------------------------------------------------------
rule('13  CHARGE AND RELEASE — a half-wound lance throws a weak shot, not nothing');


const s14 = scenario([['bow', 'bow_siege_lance']], { seed: 'ripple-charge', bearing: 0, range: 2400 });
const lance = s14.player.weapons[0];
const c14 = attachSalvo(s14.player, s14.combat);

function windAndRelease(to) {
  s14.player.stores.charge = s14.player.stores.chargeMax;
  lance.cooldown = 0;
  lance.charge = 0;
  s14.rec.fired.length = 0;
  s14.rec.charging.length = 0;
  c14.wantCharge(true);
  let guard = 0;
  while (lance.charge < to && guard++ < 1200) s14.step(1);
  const q = lance.charge;
  const hull = s14.target.hullHP;
  c14.wantCharge(false);
  s14.step(3);
  // `after` must be read HERE. Reading `lance.charge` at assert time would read whatever
  // the LAST sub-test left behind, and the refund assertion would measure nothing.
  return {
    q, after: lance.charge, delta: hull - s14.target.hullHP,
    shots: s14.rec.fired.length, events: [...s14.rec.charging],
  };
}

const half = windAndRelease(0.5);
const full = windAndRelease(1.0);
const abort = windAndRelease(0.2);

// Overhold: sit on a full charge past CHARGE.holdMax and it vents.
s14.player.stores.charge = s14.player.stores.chargeMax;
lance.cooldown = 0; lance.charge = 0; lance.thermal.heat = 0;
s14.rec.fired.length = 0; s14.rec.charging.length = 0;
c14.wantCharge(true);
let g14 = 0;
while (lance.charge < 1 && g14++ < 1200) s14.step(1);
const heatAtFull = lance.thermal.heat;
s14.step(Math.ceil((CHARGE.holdMax + 0.2) / DT));
const vented = lance.charge === 0 && !lance.charging;
const ventHeat = lance.thermal.heat - heatAtFull;
c14.wantCharge(false);
s14.step(2);

const expectedHalf = CHARGE.dmgFloor + (1 - CHARGE.dmgFloor) * half.q;
const ratio = half.delta / full.delta;

check(half.shots === 1 && full.shots === 1 && abort.shots === 0
  && Math.abs(ratio - expectedHalf) < 0.01
  && abort.events.some((e) => e.aborted)
  && abort.after > 0 && abort.after <= abort.q * CHARGE.abortRefund + 1e-9
  && vented && ventHeat > 0,
  'release scales the shot by the wind-up, an early release aborts, and a held charge vents',
  `at charge ${f(half.q, 3)} the lance landed ${f(half.delta, 0)} damage against `
  + `${f(full.delta, 0)} at full: ratio ${f(ratio, 4)} versus the predicted `
  + `dmgFloor ${CHARGE.dmgFloor} + ${f(1 - CHARGE.dmgFloor, 2)} x charge = ${f(expectedHalf, 4)}. `
  + `Releasing at ${f(abort.q, 3)} (below minRelease ${f(CHARGE.minRelease, 3)}) fired `
  + `${abort.shots} rounds, emitted an aborted WEAPON_CHARGING and refunded to `
  + `${f(abort.after, 3)}, inside abortRefund ${CHARGE.abortRefund} x ${f(abort.q, 3)} = `
  + `${f(abort.q * CHARGE.abortRefund, 3)} less three steps of bleed. Holding a full charge `
  + `for CHARGE.holdMax ${CHARGE.holdMax} s vented it: charge ${f(lance.charge, 3)}, `
  + `mount heat +${f(ventHeat, 3)}. SAMPLE SIZE 4 wind-ups.`);

// ---------------------------------------------------------------------------
// 14. the regression this feature could most easily have caused
// ---------------------------------------------------------------------------
rule('14  ATTACHING IS WHAT WITHHOLDS — an unattached hull still fires itself');

/*
 * THE TWO WAYS THIS FEATURE DISARMS A SHIP, MEASURED IN ONE SCENARIO.
 *
 * (a) Gate the AUTO path on `fireMode !== 'AUTO'` unconditionally and every NPC cannon,
 *     rail and missile in the game goes quiet: `DEFAULT_FIRE_MODE` (ship.js:36-45) puts
 *     all three archetypes in SALVO and no NPC has a controller. The hostile below is
 *     that ship.
 *
 * (b) Gate it on `ship.isPlayer` and attach from `combat.fixedUpdate` instead, and any
 *     player hull with no input layer goes quiet. That is not hypothetical either:
 *     `src/sim/selftest.mjs` drives `CombatSystem` directly against a `{ player: true }`
 *     cruiser, and this revision measured it at 49 of 54 checks — "kinetic fire consumes
 *     finite rounds  0 rounds spent" — before the attach moved to `input/controls.js`.
 *     The player below is that ship, until the third phase attaches it.
 *
 * So the assertion is three-way, in one world: the NPC fires, the UNATTACHED player
 * fires, and the ATTACHED player does not until it is commanded.
 */
const s13 = scenario([['port', 'port_broadside_battery']], { seed: 'ripple-npc', command: false });
const shooter = new Ship({
  classDef: getShipClass('ripple_shooter'), world: s13.world, faction: 'coalition',
  position: new THREE.Vector3(-2400, 0, 400),
});
s13.world.addShip(shooter);
shooter.orderAttack(s13.player);
const npcMount = shooter.weapons[0];
const playerMount = s13.player.weapons[0];

// PHASE 1 — nobody is attached. Both hulls should fire on the automatic path.
s13.rec.fired.length = 0;
s13.step(600);                                   // ten seconds
const npcShots = s13.rec.fired.filter((e) => e.mount === npcMount).length;
const looseShots = s13.rec.fired.filter((e) => e.mount === playerMount).length;
const attachedBefore = !!salvoOf(s13.player);

// PHASE 2 — attach the player, the way `input/controls.js` does. Its battery must now
// hold: it is under command and nothing has commanded it.
attachSalvo(s13.player, s13.combat);
s13.rec.fired.length = 0;
s13.step(600);
const npcShots2 = s13.rec.fired.filter((e) => e.mount === npcMount).length;
const heldShots = s13.rec.fired.filter((e) => e.mount === playerMount).length;

// PHASE 3 — command it. The same battery that just sat out fires as a wave.
salvoOf(s13.player)._lockout = 0;
const commanded = runSalvo(s13, 'auto');
const commandedShots = s13.rec.fired.filter((e) => e.mount === playerMount).length;

check(npcMount.fireMode === 'SALVO' && playerMount.fireMode === 'SALVO'
  && npcShots > 0 && looseShots > 0 && !attachedBefore
  && npcShots2 > 0 && heldShots === 0
  && commanded.n > 0 && commandedShots === commanded.n,
  'a SALVO mount fires itself until a controller exists, and only then waits to be released',
  `SAMPLE SIZE 1200 steps of automatic fire plus one commanded wave. Both mounts report `
  + `fireMode "SALVO". UNATTACHED (600 steps): the NPC fired ${npcShots} rounds and the `
  + `player's own battery fired ${looseShots} on the automatic path. ATTACHED (600 more `
  + `steps): the NPC still fired ${npcShots2}, the player's battery fired ${heldShots}. `
  + `COMMANDED: ${commanded.n} slots scheduled, ${commandedShots} rounds released. `
  + `THE TWO DEFECTS THIS RULES OUT: an unconditional "fireMode !== 'AUTO' -> continue" `
  + `disarms every hostile hull in the game, and attaching on ship.isPlayer from `
  + `combat.fixedUpdate disarms any player hull with no input layer — measured at 49 of `
  + `54 in src/sim/selftest.mjs before the attach moved to src/input/controls.js.`);

// ---------------------------------------------------------------------------
// 15. the ledger closes
// ---------------------------------------------------------------------------
rule('15  THE LEDGER CLOSES — fired + dropped is the slot count, on every salvo run');

/*
 * `EV.SALVO_COMPLETE`'s payload note (core/events.js:178-181) promises that
 * `fired + dropped` equals the `slotCount` from the matching `EV.SALVO_FIRED`, and the
 * HUD is specified to print "SALVO 6/8 · 2 DEAD" off exactly that. Nothing else in this
 * file asserts it across ALL the scenarios, and it is the one arithmetic that a new
 * drop reason can break silently — `_drop` bumps `_dropped`, and a future early
 * `return` that forgets to would leave the wave permanently short by one.
 *
 * Every SALVO_FIRED/SALVO_COMPLETE pair this whole run produced is checked, not a fresh
 * one, so the sample is every wave the tool fired in anger.
 */
const ledger = [];
for (const ctx of ALL_SCENARIOS) {
  const n = Math.min(ctx.rec.salvos.length, ctx.rec.complete.length);
  for (let i = 0; i < n; i++) {
    const a = ctx.rec.salvos[i];
    const b = ctx.rec.complete[i];
    ledger.push({ slotCount: a.slotCount, fired: b.fired, dropped: b.dropped, side: a.side, sideOut: b.side });
  }
}
const ledgerBad = ledger.filter((e) => e.fired + e.dropped !== e.slotCount || e.side !== e.sideOut);
const ledgerDropped = ledger.reduce((s, e) => s + e.dropped, 0);

check(ledger.length >= 8 && ledgerBad.length === 0,
  'every SALVO_COMPLETE accounts for every slot its SALVO_FIRED scheduled',
  `SAMPLE SIZE ${ledger.length} completed salvos across ${ALL_SCENARIOS.length} scenarios, `
  + `${ledger.reduce((s, e) => s + e.slotCount, 0)} slots total of which ${ledgerDropped} `
  + `were dropped; ${ledgerBad.length} mismatches. A sample with zero dropped slots would `
  + `prove nothing about the drop paths, and this one has ${ledgerDropped}. `
  + `The side reported at arm time also matches the side reported at completion on all `
  + `${ledger.length}, so a wave cannot be attributed to the wrong flank halfway through.`);

// ---------------------------------------------------------------------------
rule(`${passed} of ${passed + failed} checks passed`);
console.log(`\nconstants in force: RIPPLE.step ${RIPPLE.step} [${RIPPLE.stepMin}, ${RIPPLE.stepMax}] `
  + `exp ${RIPPLE.cadenceExp}, mountGap ${RIPPLE.mountGap}, sweepMax ${RIPPLE.sweepMax}, `
  + `deadPause ${RIPPLE.deadPause}, frozenPause ${RIPPLE.frozenPause}, NO JITTER`);
console.log(`                    SALVO.lockout ${SALVO.lockout}, heatMul ${SALVO_THERMAL.heatMul}, `
  + `radiatorSurcharge ${SALVO_THERMAL.radiatorSurcharge} for ${SALVO_THERMAL.surchargeTime} s, `
  + `CHARGE.minRelease ${f(CHARGE.minRelease, 2)}, holdMax ${CHARGE.holdMax}`);
process.exit(failed ? 1 : 0);
