/**
 * THE FLIGHT MODEL, MEASURED.
 *
 *     node tools/flight.mjs        (npm run flight)
 *
 * Headless, no browser, no GPU, no server. Everything here is integrated on the real
 * `PlaneBody` at the real `SIM.dt`, or read out of the real registry.
 *
 * WHY THIS FILE EXISTS. `src/sim/selftest.mjs` has 51 checks and NOT ONE of them is
 * about the flight model — the closest, at `selftest.mjs:575`, only asserts that a
 * loaded hull accelerates more slowly than an empty one. `acceptance.md:64`'s "14.9 s
 * for 180 degrees from rest" was measured by hand, on `synthesisePlayerClass`, which
 * was a hull no registered class described. Nothing gated it, so it went stale without
 * anyone noticing. Every number this tool prints, it re-derives.
 *
 * The sample size for each check is printed with it. A check that measures nothing
 * prints "ok" just as loudly as one that measures everything.
 */

import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PlaneBody, MoveController, RECOIL } from '../src/sim/physics.js';
import { SIM, COMBAT_PLANE_Y, HULL_LENGTH, KM } from '../src/core/units.js';
import { getShipClass } from '../src/core/contracts.js';
import { CRUISER_FEEL, registerPlayerCruiser, applyClassHandling } from '../src/camera/feel.js';
import { TRANSIT, legProfile } from '../src/world/travel.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const DT = SIM.dt;
const L = HULL_LENGTH.cruiser;

let failed = 0;
let passed = 0;
const rule = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

/** @param {boolean} ok @param {string} name @param {string} evidence */
function check(ok, name, evidence) {
  if (ok) passed++; else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`        ${evidence}`);
}

const f = (v, dp = 2) => (typeof v === 'number' ? v.toFixed(dp) : String(v));

// ---------------------------------------------------------------------------
// The class under test. Registered through the same function `src/game.js` calls.
// ---------------------------------------------------------------------------
registerPlayerCruiser({ root: new THREE.Group() });
const CLS = getShipClass('player_cruiser');

/** A body built from the registered class, with the handling fields ship.js drops. */
function body(overrides = {}) {
  const b = new PlaneBody({
    mass: CLS.mass, maxSpeed: CLS.maxSpeed, accel: CLS.accel,
    turnRate: CLS.turnRate, radius: CLS.length * 0.42, ...overrides,
  });
  applyClassHandling(b, CLS);
  Object.assign(b, overrides);
  return b;
}

// ---------------------------------------------------------------------------
// Integrators
// ---------------------------------------------------------------------------

/** Order a 180 deg turn from rest. Returns time to first cross, and peak overshoot. */
function about(deg = 180) {
  const b = body();
  const want = (deg * Math.PI) / 180;
  b.heading = 0; b.desiredHeading = want; b.throttle = 0;
  let t = 0, over = 0, cross = null, steps = 0;
  for (let i = 0; i < 60 * 900; i++) {
    b.integrate(DT); t += DT; steps++;
    const signed = b.heading - want;
    if (signed > over) over = signed;
    if (cross === null && Math.abs(signed) < (0.5 * Math.PI) / 180) cross = t;
    if (cross !== null && t > cross + 25) break;
  }
  return { t: cross, overDeg: (over * 180) / Math.PI, steps };
}

/** 0 -> 99% of cruise. */
function accelRun() {
  const b = body(); b.throttle = 1;
  const z0 = b.position.z; let t = 0, steps = 0;
  for (let i = 0; i < 60 * 6000; i++) { b.integrate(DT); t += DT; steps++; if (b.speed >= CLS.maxSpeed * 0.99) break; }
  return { t, d: b.position.z - z0, steps };
}

/** cruise -> 1%. */
function stopRun() {
  const b = body(); b.throttle = 1;
  for (let i = 0; i < 60 * 6000; i++) { b.integrate(DT); if (b.speed >= CLS.maxSpeed * 0.999) break; }
  const z0 = b.position.z; b.throttle = 0; let t = 0, steps = 0;
  for (let i = 0; i < 60 * 6000; i++) { b.integrate(DT); t += DT; steps++; if (b.speed <= CLS.maxSpeed * 0.01) break; }
  return { t, d: b.position.z - z0, steps, predicted: 0.5 * CLS.maxSpeed * (CLS.maxSpeed / CLS.retroAccel) };
}

/** Sustained turn at flank. Returns the radius the hull actually carves. */
function flankCircle() {
  const b = body(); b.throttle = 1;
  for (let i = 0; i < 60 * 6000; i++) { b.integrate(DT); if (b.speed >= CLS.maxSpeed * 0.999) break; }
  let omega = 0, steps = 0;
  for (let i = 0; i < 60 * 600; i++) {
    b.desiredHeading = b.heading + Math.PI / 2;
    b.integrate(DT); steps++;
    omega = Math.max(omega, Math.abs(b.angularVelocity));
  }
  return { v: b.speed, omega, r: b.speed / omega, steps };
}

/** Turn authority at a given speed fraction, without integrating. */
function turnRateAtFrac(s) {
  const b = body();
  b.velocity.set(0, 0, CLS.maxSpeed * s);
  return b.effectiveTurnRate();
}

/** A 12 km move order through the real MoveController. */
function moveOrder(distance = 12000, arrivalRadius = 70) {
  const b = body();
  const mc = new MoveController(b);
  mc.order(new THREE.Vector3(0, COMBAT_PLANE_Y, distance), arrivalRadius);
  let t = 0, past = 0, steps = 0;
  for (let i = 0; i < 60 * 4000; i++) {
    mc.update(DT); b.integrate(DT); t += DT; steps++;
    past = Math.max(past, b.position.z - distance);
    if (!mc.active) break;
  }
  return { t, past, steps, active: mc.active, err: Math.abs(b.position.z - distance) };
}

// ---------------------------------------------------------------------------
// 1. The registration is the definition
// ---------------------------------------------------------------------------
rule('1  player_cruiser is registered, and IS CRUISER_FEEL');

check(!!CLS, 'player_cruiser is in the registry after importing camera/feel.js',
  CLS ? `id "${CLS.id}", ${CLS.length} m, ${CLS.mass} t` : 'getShipClass returned undefined');

const FIELD_MAP = [
  ['mass', 'mass'], ['maxSpeed', 'maxSpeed'], ['accel', 'accelFwd'],
  ['retroAccel', 'accelRetro'], ['turnRate', 'turnRateAtRest'], ['angAccel', 'angAccel'],
];
const mismatched = FIELD_MAP.filter(([c, k]) => CLS?.[c] !== CRUISER_FEEL[k]);
check(mismatched.length === 0, 'every handling field is === the CRUISER_FEEL field',
  `${FIELD_MAP.length} fields compared: `
  + FIELD_MAP.map(([c, k]) => `${c}=${CLS?.[c]}`).join(' ')
  + (mismatched.length ? `  MISMATCHED: ${mismatched.map(([c]) => c).join(',')}` : ''));

check(CLS?.length === L, 'length is HULL_LENGTH.cruiser', `${CLS?.length} vs ${L}`);

// ---------------------------------------------------------------------------
// 2. Nobody has re-created a second player class
// ---------------------------------------------------------------------------
rule('2  no duplicate player-cruiser literal anywhere in src/');

/*
 * THE RULE, stated exactly, because a loose one produces false positives and a tool
 * that cries wolf gets disabled. A PLAYER-CLASS DECLARATION is an object literal that
 * carries `faction: 'player'` AND `role: 'cruiser'` AND all four handling fields
 * (`mass` `maxSpeed` `accel` `turnRate`) within a 13-line window. It must live in
 * `src/camera/feel.js` and nowhere else.
 *
 * Requiring the four stat fields is what stops `src/probes/vfx.js:307` being reported:
 * that line passes `{faction:'player', role:'cruiser'}` as ARGUMENTS to a probe's
 * `makeShip` helper and declares no handling numbers at all. It is not drift, and an
 * earlier draft of this check called it drift.
 *
 * KNOWN_OUT_OF_LANE is a RATCHET, not an allowlist: anything NOT in it fails the run,
 * and every entry is printed on every run with its owner and its one-line fix, so it
 * cannot rot the way `selftest.mjs`'s determinism allowlist did (HANDOFF "Traps").
 * These three are in other streams' write sets for this wave; W1-C may not touch them.
 */
const KNOWN_OUT_OF_LANE = new Map([
  ['src/sim/meta/harness.js', 'W1-D (sim/meta/**) — 62000/140/14/0.22; replace with registerPlayerCruiser()'],
  ['src/sim/meta/sortieHarness.js', 'W1-D (sim/meta/**) — 62000/140/14/0.22; NOT named in the recon brief, which counted five copies. There are six.'],
  ['src/sim/selftest.mjs', 'W1-D — `test_cruiser` 42000/120/12/0.2. Arguably a legitimate fixture rather than drift; owner decides.'],
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const files = walk(SRC);
const offenders = [];
for (const p of files) {
  const rel = relative(ROOT, p).split('\\').join('/');
  if (rel === 'src/camera/feel.js') continue;         // the one legitimate home
  const lines = readFileSync(p, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/role:\s*'cruiser'/.test(lines[i])) continue;
    const window = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
    if (!/faction:\s*'player'/.test(window)) continue;
    if (!/\bmass:\s*\d/.test(window)) continue;
    if (!/\bmaxSpeed:\s*\d/.test(window)) continue;
    if (!/\baccel:\s*\d/.test(window)) continue;
    if (!/\bturnRate:\s*[\d.]/.test(window)) continue;
    offenders.push({ rel, line: i + 1 });
  }
}
const unexpected = offenders.filter((o) => !KNOWN_OUT_OF_LANE.has(o.rel));
check(unexpected.length === 0,
  'no NEW player-class literal outside camera/feel.js',
  `${files.length} files scanned under src/; ${offenders.length} declaration(s) found, `
  + `${unexpected.length} unexpected`
  + (unexpected.length ? `: ${unexpected.map((o) => `${o.rel}:${o.line}`).join(', ')}` : '')
  + `\n        remaining, owned elsewhere (this count must only go DOWN):`
  + offenders.filter((o) => KNOWN_OUT_OF_LANE.has(o.rel))
    .map((o) => `\n          ${o.rel}:${o.line}  ${KNOWN_OUT_OF_LANE.get(o.rel)}`).join(''));

// ---------------------------------------------------------------------------
// 3. Axiom 5 — twenty seconds to come about
// ---------------------------------------------------------------------------
rule('3  180 degrees from rest, integrated');

const turn180 = about(180);
check(turn180.t !== null && Math.abs(turn180.t - 20.2) <= 1.0,
  '180 deg from rest is 20.2 s +/- 1.0 (controls.md:42, axiom 5)',
  `${f(turn180.t)} s over ${turn180.steps} integration steps at dt=${f(DT, 5)}`);

// acceptance.md:64's criterion is a LOWER bound: the hull cannot change heading
// instantly. Assert it as a lower bound so this row can never silently regress.
check(turn180.t !== null && turn180.t >= 10.0,
  'ACCEPTANCE: "the cruiser cannot change heading instantly at any speed"',
  `${f(turn180.t)} s for 180 deg from rest; was 15.3 s on the deleted synthesised hull`);

check(turn180.overDeg > 1.0 && turn180.overDeg < 12.0,
  'the ordered heading is OVERSHOT and settled back (controls.md:1093-1096)',
  `${f(turn180.overDeg)} deg peak overshoot; 0.00 deg before angAccel became per-class`);

// ---------------------------------------------------------------------------
// 4. The turn-rate curve
// ---------------------------------------------------------------------------
rule('4  turn authority against speed');

const fracs = [];
for (let i = 0; i <= 20; i++) fracs.push(i / 20);
const rates = fracs.map(turnRateAtFrac);
const ratio = rates[rates.length - 1] / rates[0];
let monotone = true;
for (let i = 1; i < rates.length; i++) if (rates[i] > rates[i - 1] + 1e-12) monotone = false;
check(Math.abs(ratio - 0.28) <= 0.005 && monotone,
  'turnRateAt(vmax)/turnRateAt(0) = 0.280 +/- 0.005, monotone decreasing (controls.md:1202)',
  `ratio ${f(ratio, 4)} over ${fracs.length} samples; monotone=${monotone}; `
  + `0.25 ${f(rates[5] / rates[0], 4)}  0.50 ${f(rates[10] / rates[0], 4)}  0.75 ${f(rates[15] / rates[0], 4)}`);

// ---------------------------------------------------------------------------
// 5. Size cue — seconds to cross own length
// ---------------------------------------------------------------------------
rule('5  the size cue');

const cross = L / CLS.maxSpeed;
check(cross >= 8.0 && cross <= 10.0,
  '1400 m / maxSpeed is inside controls.md:1077\'s own 8-10 s band',
  `${f(cross)} s at maxSpeed ${CLS.maxSpeed} m/s (controls.md 6.1's own 180 gives ${f(L / 180)} s — outside)`);

// ---------------------------------------------------------------------------
// 6. Turning circle, in hull lengths
// ---------------------------------------------------------------------------
rule('6  flank turning circle');

const circle = flankCircle();
const radiusL = circle.r / L;
check(radiusL >= 2.0 && radiusL <= 2.6,
  'flank turn RADIUS is 2.0-2.6 hull lengths (= 4.0-5.2 L tactical diameter)',
  `${Math.round(circle.r)} m = ${f(radiusL)} L radius, ${f(radiusL * 2)} L tactical diameter, `
  + `at v=${f(circle.v, 1)} m/s omega=${f(circle.omega, 4)} rad/s over ${circle.steps} steps. `
  + 'controls.md:1133 compares its own radius column against real battleships\' DIAMETERS; '
  + 'corrected, 3-4 L diameter is the reference and this is "a little more".');

// ---------------------------------------------------------------------------
// 7. Braking authority, and the move controller that budgets against it
// ---------------------------------------------------------------------------
rule('7  braking is a separate authority, and stoppingDistance() knows it');

const stop = stopRun();
const closed = (CLS.maxSpeed * CLS.maxSpeed) / (2 * CLS.retroAccel);
check(Math.abs(stop.d - closed) / closed <= 0.02,
  'measured stopping distance matches v^2 / (2 * retroAccel) within 2%',
  `${Math.round(stop.d)} m measured over ${stop.steps} steps vs ${Math.round(closed)} m closed form `
  + `(${f((100 * (stop.d - closed)) / closed, 1)}%); ${f(stop.t, 1)} s`);

const accel = accelRun();
check(stop.d > accel.d * 1.2,
  'stopping is harder than starting (controls.md 6.2)',
  `0->cruise ${Math.round(accel.d)} m in ${f(accel.t, 1)} s; cruise->0 ${Math.round(stop.d)} m in ${f(stop.t, 1)} s`);

const move = moveOrder();
check(!move.active && move.past < L,
  'a 12 km move order arrives, with peak overshoot under one hull length',
  `arrived at ${f(move.t, 1)} s, peak ${Math.round(move.past)} m past the marker `
  + `(${f(move.past / L)} L), final error ${Math.round(move.err)} m, ${move.steps} steps. `
  + 'With stoppingTime() left on `accel` this measures 413 m.');

// ---------------------------------------------------------------------------
// 8. The transit layer hands the hull back at its own ceiling
// ---------------------------------------------------------------------------
rule('8  transit arrival speed');

check(TRANSIT.combatArrivalSpeed === undefined,
  'TRANSIT no longer carries a hard-coded combatArrivalSpeed',
  `TRANSIT keys: ${Object.keys(TRANSIT).length}; combatArrivalSpeed = ${String(TRANSIT.combatArrivalSpeed)} `
  + '(was a literal 180 against a 140 m/s hull — 28.6% over its own ceiling)');

const travelSrc = readFileSync(join(SRC, 'world/travel.js'), 'utf8');
const derived = /_saved\?\.maxSpeed \?\? body\.maxSpeed/.test(travelSrc);
check(derived, 'the final-leg arrival speed is read from the hull, not a literal',
  `_updateBurning reads \`this._saved?.maxSpeed ?? body.maxSpeed\` = ${CLS.maxSpeed} m/s for this class`);

// ---------------------------------------------------------------------------
// 9. Asymmetric retro must not leak into the transit profile
// ---------------------------------------------------------------------------
rule('9  the transit closed form still reproduces its published table');

const legs = [[120, 151], [300, 225], [600, 312]];
const rows = legs.map(([km, want]) => {
  const got = legProfile(km * KM, TRANSIT.accel, TRANSIT.maxSpeed).time + TRANSIT.spool;
  return { km, want, got, ok: Math.abs(got - want) <= 2 };
});
check(rows.every((r) => r.ok),
  'legProfile + spool still gives 151 / 225 / 312 s for 120 / 300 / 600 km (+/- 2 s)',
  rows.map((r) => `${r.km}km ${f(r.got, 1)}s (want ${r.want})`).join('  '));

// The trap this guards: `_enterTransit` must force body.retroAccel symmetric, or the
// closed form above stops describing the burn it is quoting for.
const savesRetro = /retroAccel: body\.retroAccel/.test(travelSrc)
  && /body\.retroAccel = this\.accel;/.test(travelSrc);
const restoresRetro = /body\.retroAccel = this\._saved\.retroAccel/.test(travelSrc);
check(savesRetro && restoresRetro,
  '_enterTransit saves + forces retroAccel symmetric, _exitTransit restores it',
  `save+force ${savesRetro}, restore ${restoresRetro}. Without this every published leg time, `
  + 'every propellant quote derived from it and every interception percentage is wrong, '
  + 'and both smoke and selftest still pass.');

// ---------------------------------------------------------------------------
// 10. angAccel must stay per-class
// ---------------------------------------------------------------------------
rule('10  a class that does not declare angAccel is unchanged');

const plain = new PlaneBody({ mass: 9400, maxSpeed: 165, accel: 9, turnRate: 0.3 });
plain.desiredHeading = Math.PI;
let plainSpool = 0;
for (let i = 0; i < 60 * 600; i++) { plain.integrate(DT); plainSpool += DT; if (Math.abs(plain.angularVelocity) >= 0.3 * 0.95) break; }
check(plain.angAccel === null && plainSpool < 1.0,
  'an undeclared class still spools at maxRate * 2.4',
  `angAccel field = ${String(plain.angAccel)}, spool to 95% in ${f(plainSpool)} s. `
  + 'controls.md:1063\'s flat 0.030 rad/s^2 would make this 9.5 s, and coalition_strikecraft 76.0 s.');

// ---------------------------------------------------------------------------
// 11. Recoil is rotational and ONLY rotational
// ---------------------------------------------------------------------------
rule('11  recoil moves the roll and nothing else');

const rb = body(); rb.throttle = 0.5;
for (let i = 0; i < 60 * 60; i++) rb.integrate(DT);      // settle to steady flight
const x0 = rb.position.x;
const kick = RECOIL.bank * (340 / 300);                   // one Heavy Broadside gun
const gap = Math.round(0.110 / DT);
let peakRoll = 0, peakVx = 0, steps = 0;
for (let i = 0; i < 60 * 6; i++) {
  if (i % gap === 0 && i < 4 * gap) rb.recoilKick(kick);
  rb.integrate(DT); steps++;
  peakRoll = Math.max(peakRoll, Math.abs(rb.recoilBank));
  peakVx = Math.max(peakVx, Math.abs(rb.velocity.x));
}
check(peakVx === 0 && Math.abs(rb.position.x - x0) === 0,
  'a four-gun ripple adds EXACTLY zero lateral velocity and zero displacement',
  `peak |vx| ${peakVx.toExponential(3)} m/s, lateral displacement `
  + `${Math.abs(rb.position.x - x0).toExponential(3)} m over ${steps} steps. `
  + 'firing-feel.md 5.2\'s lateral shove is inert against the velocity servo; if this '
  + 'ever becomes non-zero, stores.js will bill the shove as thrust.');

check(peakRoll > 0.02 && peakRoll <= RECOIL.bankCap && Math.abs(rb.recoilBank) < 1e-6,
  'the ripple rolls the hull a visible amount and returns to zero',
  `peak ${peakRoll.toFixed(5)} rad = ${((peakRoll * 180) / Math.PI).toFixed(2)} deg `
  + `(cap ${RECOIL.bankCap}, turn bank reaches ${CRUISER_FEEL.bankMax} rad = `
  + `${((CRUISER_FEEL.bankMax * 180) / Math.PI).toFixed(1)} deg); settled to `
  + `${rb.recoilBank.toFixed(8)}. The armament brief predicted 2.25 deg from an `
  + 'instant-delivery model; with the 1/14 s rise the real figure is lower.');

rule(`${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
