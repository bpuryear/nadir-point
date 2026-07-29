/**
 * CRUISER FEEL — the single source of truth for how the player's hull handles.
 *
 * `docs/design/controls.md:1035` presents `export const CRUISER_FEEL` as an existing
 * camera-stream artefact that the physics stream consumes. It has never existed:
 * `grep -rn CRUISER_FEEL src/` before this commit returned exactly one hit, a comment
 * at `src/world/travel.js:46` saying the transit constants "mirror" it. In its absence
 * the player cruiser was defined FIVE times in five files, and the five disagreed two
 * ways — `game.js`, `probes/benchmark.js`, `world/sensorHarness.js` and
 * `sim/meta/harness.js` carried 62000/140/14/0.22 while `probes/ui.js` and
 * `probes/worldsim.js` carried the spec's 620000/180/6.0/0.085. The probes and the
 * game were measuring different ships.
 *
 * This block plus `registerPlayerCruiser()` below is the only thing that stops that
 * re-splitting. `tools/flight.mjs` check 2 scans for a re-split and fails on it.
 *
 * ---------------------------------------------------------------------------
 * THE NUMBERS ARE NOT controls.md §6.1 VERBATIM, AND THAT IS DELIBERATE.
 *
 * Measured on the real `PlaneBody` at the real `SIM.dt`, §6.1 as written gives:
 *
 *   turnRate 0.085  ->  37.5 s for 180 deg from rest
 *
 * against controls.md:42's own axiom 5, "a 1.4 km cruiser should take twenty seconds
 * to come about" — 87% over. controls.md:15-16 states the precedence itself: "If a
 * later section contradicts one of these, the axiom wins and the section is a bug."
 * Three further §6.1 fields are wrong on their own terms and are NOT copied in:
 *
 *   maxSpeed 180      1400/180 = 7.8 s to cross own length, OUTSIDE §6.2's own 8-10 s
 *                     band. The live 140 gives exactly 10.0 s. Code wins; kept at 140.
 *   turnExp 1.35      §6.3 argues for it against exp 1.0, but the implementation
 *                     baseline is exp 2.0. Measured turn-authority multiplier at 25%
 *                     speed: exp2 0.9550 vs exp1.35 0.8892; at 50%: 0.8200 vs 0.7175.
 *                     Adopting 1.35 makes the 25-50% positioning band MATERIALLY
 *                     WORSE, the opposite of what its own paragraph argues for.
 *                     Staying at exp 2 also keeps acceptance.md:64's sentence "turn
 *                     rate degrades with the square of speed" literally true.
 *   turnRateFloorK    Unreachable. `1 - 0.72 * s^2` is monotone decreasing on [0,1]
 *                     with minimum 0.28 > 0.22, so the floor never fires. Omitted
 *                     rather than implemented as a measured no-op.
 *
 * `accelLateral` / `maxLateralSpeed` are also omitted: `PlaneBody` has no lateral
 * thrust term and `src/input/controls.js` has no strafe binding, so they would
 * describe a control that does not exist.
 *
 * What IS taken verbatim from §6.1 is `turnFalloff: 0.72` — it makes the flank/rest
 * turn-authority ratio exactly 0.28, which is what controls.md:1202's verification
 * row asks for — and `bankMax` / `bankTau`.
 * ---------------------------------------------------------------------------
 */

import { HULL_LENGTH } from '../core/units.js';
import { getShipClass, registerShipClass } from '../core/contracts.js';

/**
 * Handling constants for the player cruiser. Every figure in the comments was
 * integrated on the real `PlaneBody` at `SIM.dt`, not derived on paper;
 * `node tools/flight.mjs` re-measures the load-bearing ones on every run.
 */
export const CRUISER_FEEL = {
  /**
   * Tonnes, hull only, before modules. 10x the old synthesised 62,000.
   *
   * MEASURED CONSEQUENCE OF THIS CHANGE: none. `PlaneBody.mass` is read in exactly
   * one place in the whole tree — `resolveCollisions` (physics.js) — and
   * `resolveCollisions` HAS NO CALLERS. There is no ship-to-ship collision in the
   * assembled game, so there is no ram damage to make dominant and no shoving to
   * stop. See the note on `resolveCollisions` in `src/sim/physics.js`.
   */
  mass: 620000,

  /**
   * m/s. UNCHANGED from live. 1400/140 = 10.0 s to cross own length, at the top of
   * controls.md:1077's own 8-10 s band. §6.1's 180 falls outside it.
   */
  maxSpeed: 140,

  /** m/s^2 forward. Measured 0 -> 99% of cruise in 17.3 s over 1203 m (0.86 L). */
  accelFwd: 8.0,

  /**
   * m/s^2 retro. Measured cruise -> 1% in 25.2 s over 1777 m (1.27 L). Stopping is
   * deliberately harder than starting; §6.2 makes the same argument with 4.0 against
   * an accel of 6.0 (ratio 0.667). This pair holds the ratio at 0.688 on numbers that
   * satisfy axiom 5.
   */
  accelRetro: 5.5,

  /**
   * rad/s at rest. Measured 20.22 s for 180 deg from rest — controls.md:42 axiom 5
   * asks for twenty. (Live today: 15.3 s at turnRate 0.22.)
   */
  turnRateAtRest: 0.165,

  /**
   * rad/s^2, per-class. Measured: 2.25 s to spool to 95% of at-rest yaw rate, and a
   * 6.24 deg heading OVERSHOOT that settles out — which controls.md:1093-1096
   * explicitly asks to be shipped ("Ship the overshoot") and which the current code
   * cannot produce (measured overshoot today: 0.00 deg, because angAccel =
   * 2.4 x maxRate makes the loop critically damped).
   *
   * THIS MUST NEVER BECOME A GLOBAL CONSTANT. controls.md:1063 declares a flat
   * 0.030 rad/s^2. Applied to every PlaneBody it gives coalition_corvette an 18.4 s
   * yaw spool and coalition_strikecraft a 76.0 s one (measured, all 13 registered
   * classes) — every escort in the game stops being able to turn. `PlaneBody` reads
   * it as `spec.angAccel ?? maxRate * 2.4`, so a class that does not declare it is
   * bit-identical to before.
   *
   * Tuning knob for the overshoot, measured: 0.055 -> 9.2 deg, 0.070 -> 6.2 deg,
   * 0.090 -> 3.7 deg. The 180 deg time barely moves across that range
   * (20.53 / 20.22 / 19.98 s), so this is a feel dial, not a performance one.
   */
  angAccel: 0.070,

  /**
   * Turn-authority falloff coefficient in `1 - turnFalloff * speedFrac^2`.
   * 0.72 makes the flank/rest ratio exactly 0.28 (controls.md:1202) against the live
   * 0.38. Flank turn radius goes from 1675 m (1.20 L) to 3030 m (2.16 L) — a 4.33 L
   * tactical DIAMETER, which is the battleship-shaped figure §6.3 was reaching for
   * before it compared its own radius column against real ships' diameters.
   */
  turnFalloff: 0.72,

  /**
   * Exponent on speedFrac. Stays 2 — see the header. Declared here so the number is
   * stated rather than implied by the shape of one line in physics.js.
   */
  turnExp: 2,

  /** rad. Cosmetic bank into the turn. Was a bare 0.13 literal in physics.js. */
  bankMax: 0.12,

  /**
   * s. The bank LAGS the turn; controls.md:1181 says "that lag is the tonnage".
   * The old `min(1, dt*1.6)` lerp has an effective tau of 0.617 s at the fixed
   * 1/60 step AND is frame-rate dependent; this is the exponential form from
   * `src/camera/constants.js#damp`, which is not.
   */
  bankTau: 1.4,
};

/**
 * Subsystems for the player cruiser when the geometry stream did not supply any.
 * Lifted verbatim from the deleted `synthesisePlayerClass` so a headless consumer
 * (tools, harnesses) gets the same hull the game gets. NOT the same thing as
 * `CRUISER_SUBSYSTEMS` in `art/geometry/cruiser.js`, which is the real hull's table;
 * this is only what stands in when no hull was built.
 */
export const FALLBACK_SUBSYSTEMS = [
  { id: 'engine_main', kind: 'engine', hp: 1400, position: [0, 0, -560], radius: 150, salvageValue: 0.2, label: 'Main Drive' },
  { id: 'reactor', kind: 'reactor', hp: 1800, position: [0, 20, -60], radius: 130, salvageValue: 0.3, label: 'Reactor' },
  { id: 'sensor', kind: 'sensor', hp: 700, position: [0, 90, 320], radius: 90, salvageValue: 0.1, label: 'Sensor Mast' },
];

export const PLAYER_CRUISER_ID = 'player_cruiser';

/**
 * The registered class definition, derived from `CRUISER_FEEL` rather than restating
 * it. `tools/flight.mjs` check 1 asserts field-by-field `===` equality between the
 * two, so a literal typed into this object instead of read from the block fails.
 *
 * @param {Object} [opts]
 * @param {THREE.Object3D|null} [opts.root]        built hull, if the geometry stream ran
 * @param {Array} [opts.subsystems]                subsystem table from the hull build
 * @param {number} [opts.hullHP]
 */
export function playerCruiserClass({ root = null, subsystems = null, hullHP = 12000 } = {}) {
  return {
    id: PLAYER_CRUISER_ID,
    name: 'Salvager Cruiser',
    faction: 'player',
    role: 'cruiser',
    length: HULL_LENGTH.cruiser,
    mass: CRUISER_FEEL.mass,
    maxSpeed: CRUISER_FEEL.maxSpeed,
    accel: CRUISER_FEEL.accelFwd,
    retroAccel: CRUISER_FEEL.accelRetro,
    turnRate: CRUISER_FEEL.turnRateAtRest,
    angAccel: CRUISER_FEEL.angAccel,
    hullHP,
    triBudget: 2000,
    planeLocked: true,
    build: () => root,
    subsystems: subsystems ?? FALLBACK_SUBSYSTEMS,
    weapons: [],
  };
}

/**
 * Register `player_cruiser` once. Idempotent, because `bootGame` is not the only
 * caller — three probes and two harnesses register it too, and `registerShipClass`
 * throws on a duplicate id.
 *
 * Re-registering with a real hull after a placeholder one is deliberately allowed to
 * be a no-op: the FIRST registration wins, exactly as `registerItem` behaves, so the
 * class the player flies can never depend on load order.
 */
export function registerPlayerCruiser(opts = {}) {
  const existing = getShipClass(PLAYER_CRUISER_ID);
  if (existing) return existing;
  return registerShipClass(playerCruiserClass(opts));
}

/**
 * Push the two per-class handling fields onto a live body.
 *
 * `Ship`'s constructor (`sim/ship.js`) builds its `bodySpec` from five named
 * `classDef` fields and does not forward `angAccel` or `retroAccel`, so a class that
 * declares them is silently ignored. `sim/ship.js` belongs to the Ship & refit stream
 * (ARCHITECTURE.md:141) and is out of this stream's write set, so this is the seam
 * until that one-line pass-through lands — see the request in the W1-C report.
 *
 * Written to be a no-op once ship.js forwards them: it assigns the same values the
 * spec path would.
 */
export function applyClassHandling(body, classDef) {
  if (!body || !classDef) return body;
  if (classDef.angAccel != null) body.angAccel = classDef.angAccel;
  if (classDef.retroAccel != null) body.retroAccel = classDef.retroAccel;
  return body;
}
