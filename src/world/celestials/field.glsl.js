/**
 * THE FIELD FUNCTION — direction-space structure for the sky, as a GLSL string.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS, MEASURED
 * ===========================================================================
 *
 * `docs/review/field-baseline.md` §5 is the finding this file answers, and it is not
 * the finding the plan was written against. R1 and R2 already PASS on HEAD — the
 * graveyard `engagement` field measures median luma 0.1283 against a 0.10 target and
 * median chroma 0.1451 against 0.12. What is wrong with the frame is that it is a
 * FLAT WASH. Re-measured on this tree with this file's changes stashed, which is why
 * these differ from the baseline's own printout in the last digit:
 *
 *   dark    33.52% of field  mean luma 0.0891   median chroma 0.1019   hue 96.0 deg
 *   mid     33.11% of field  mean luma 0.1284   median chroma 0.1490   hue 94.1 deg
 *   bright  33.37% of field  mean luma 0.1641   median chroma 0.1842   hue 93.7 deg
 *                                        dark-to-bright hue separation 2.3 deg
 *
 * One hue at every value, over a monotone luma ramp with an interquartile range of
 * 0.049. That is a gradient. `nebula.js:4-7` says in its own header that a flat
 * coloured gradient painted across the sky is the exact failure it exists to avoid,
 * and the sky dome — which by measurement carries the ENTIRE field, the 14-layer
 * nebula moving the median by -0.0003 (`field-baseline.md` §2) — is that gradient.
 *
 * The owner's ruling: green in the LUMINOUS CORE, rust and amber in the DUST LANES
 * and the OUTER BANDS, separated on the VALUE axis and on the STRUCTURAL axis so the
 * two cannot average to mud. This file is the structural axis. `skydome.js` spends it.
 *
 * ===========================================================================
 * WHAT IS IN HERE AND WHY EACH PIECE, WITH ITS SOURCE
 * ===========================================================================
 *
 * `docs/design/research/backgrounds-procedural.md`, and `space-backgrounds.md` item 3
 * which selects from it. Every choice below is one of theirs, and the ones they
 * measured as traps are named as traps:
 *
 *  * A **2-LEVEL IQ DOMAIN WARP** (iquilezles.org/articles/warp), which the research
 *    measured at coherence 0.450 -> 0.747 and stringiness 22.9 -> 666 for 2.2x the
 *    cost. `nebula.js:59-60` already has a domain warp, but it is ONE level at
 *    amplitude 0.34 of a unit-domain UV, which is a nudge and not a warp. **Three
 *    levels over-curls into an intestinal look; this stops at two,** as instructed.
 *
 *  * On an **ANISOTROPICALLY STRETCHED DOMAIN**. The measured winner for a *band* was
 *    the warp composited on a 4:1 stretched domain: 0.850 coherence, long directional
 *    strands. `common.js:105-126` (`cylFbm`) already knows this trick and states why —
 *    "`aspect > 1` stretches features along longitude, which is the whole reason gas
 *    giant turbulence reads as ribbons rather than as clouds". The sky did not use it.
 *    Here the stretch is applied to `d.y`, i.e. ACROSS the ecliptic, so features run
 *    long in the plane the game is fought on and thin perpendicular to it.
 *
 *  * **ONE noise field, read twice.** The lane mask is the same warped domain offset
 *    by a constant, which is `backgrounds-procedural.md` §2.6.1 verbatim: a real dust
 *    lane sits *on* the emission it obscures because it is the same cloud.
 *    `nebula.js:237` draws a fresh random position instead, "which is why the lanes
 *    never sit on the emission they are supposed to obscure".
 *
 *  * **NOT curl noise.** Measured trap: a 4-octave potential gives coherence 0.161 and
 *    salt-and-pepper mush at 265 ms/256^2 because velocities scale as O(1/L) and the
 *    finest octave dominates (Bridson). Not used, not as a shape source.
 *
 * VALUE NOISE, not gradient noise, and that is a cost decision with a number behind
 * it. This function runs at full frame resolution on a mesh that covers 100% of every
 * frame, and F3 — "the single most important measurement in the document" — is a
 * frame-time gate at 2560x1440. A 3D gradient noise costs a dot product and a gradient
 * fetch per corner against value noise's one hash; over `FIELD_TAPS.noiseEvals` taps
 * per pixel that is the difference between shipping this live and baking it. The
 * hash is IQ's `fract(p*17)` triple product: no `sin`, which is the other common
 * choice and is both slower and driver-dependent.
 *
 * ===========================================================================
 * THE COST DIAL IS THE OCTAVE COUNTS BELOW, AND THEY ARE JS CONSTANTS
 * ===========================================================================
 *
 * `FIELD_TAPS` is the single source of truth for what this costs. The GLSL is
 * generated from it, so `FIELD_TAPS.noiseEvals` is arithmetic on the shipped shader
 * rather than a comment that can drift from it. Warp levels want LOW frequency — they
 * displace the domain, they do not draw the detail — so they run at 2 octaves while
 * the shape field runs at 4. Raising `warp` is the most expensive knob in here: it is
 * multiplied by six.
 *
 * DETERMINISM: this is a pure function of `gl_FragCoord`-derived direction and
 * uniforms. No time input, no `Math.random` (there is no JS RNG in this file at all),
 * so two renders of the same pose are identical and `fieldcheck.mjs`'s A0-vs-A1
 * control stays at the film grain's own noise floor.
 */

/**
 * Octave counts, and the tap arithmetic that follows from them.
 *
 * `noiseEvals` is per pixel: six warp fbm calls (two vec3 levels) at `warp` octaves,
 * one shape call at `shape`, one lane call at `lane`.
 *
 * MEASURED COST, AND IT IS LINEAR IN THIS NUMBER.
 * `NP_RASTER=hardware npm run bench -- --width 2560 --height 1440` against the same
 * tree with `structure: 0` (which compiles the whole field out — see `skydome.js`):
 *
 *   warp shape lane   noiseEvals   mean frame   delta vs field-off
 *    -    -     -         0          11.8 ms       baseline
 *    1    4     3        13          14.2 ms       +2.4 ms
 *    2    4     3        19          15.2 ms       +3.4 ms   <- W6, no longer shipped
 *    1    2     2        10          (see below)             <- SHIPPED
 *
 * W7 RE-MEASURED THE WHOLE FRAME RATHER THAN THIS DELTA, because the wave changed
 * more than the tap count. `NP_RASTER=hardware npm run bench -- --width 2560
 * --height 1440`, HEAD `0d9d58e` measured by stashing `src/` on the same machine in
 * the same session:
 *
 *   HEAD  mean 39.2 ms  median 39.2  p99 47.1   draw calls 511  programs 62
 *   W7    mean 36.6 ms  median 36.3  p99 44.8   draw calls (smoke) 262  programs 60
 *
 * **-2.6 ms and -2 programs**, from 19 taps to 10 over the dome's 100%-of-frame
 * fill, minus the nebula's 9 draw calls and 3 materials, plus 3 dust quads that pay
 * 10 taps over a quarter of the frame. Note the absolute numbers are far off the
 * 11.8/15.2 ms above: that pair was measured on different hardware, so the DELTA
 * there and the DELTA here are comparable and the levels are not. The budget gate
 * fails on both sides and failed before this wave — it is a pre-existing 511-draw
 * -call bench scene, not a backdrop cost.
 *
 * That is 0.185 and 0.179 ms per evaluation — linear to 3%, so this table extrapolates
 * and the dial is honest. **F3's verdict is therefore BAKE, and it is structural:** a
 * 2-level warp costs six fbm calls before it draws anything, so the cheapest possible
 * form of this construction is 8 evals ~ 1.45 ms, still 2.9x over F3's 0.5 ms
 * "ship live and skip the bake" threshold. No octave setting reaches it.
 *
 * RAISING `warp` IS THE EXPENSIVE KNOB — it is multiplied by six. Raising `shape` or
 * `lane` costs one eval each.
 *
 * ===========================================================================
 * W7: THE OCTAVE COUNTS ARE ALSO THE BAND-LIMIT, AND THAT IS WHY THEY DROPPED
 * ===========================================================================
 *
 * `docs/design/skybox-spec.md` §7 measured an octave-band contrast pyramid on the
 * shipped field and named the failure in two numbers:
 *
 *   * mid-frequency contrast energy at 1.6-26 degrees is **2.08x** the plain-stars
 *     control's (0.05603 vs 0.02695). That band is the marble.
 *   * the STAR band's share of total field contrast falls from 20.8% to 8.3% when
 *     the dome is on — the subject losing 2.5x of its share of the frame's
 *     structure to the backdrop.
 *
 * `{warp: 2, shape: 4, lane: 3}` = 19 taps, and **octaves 3 and 4 of the shape
 * field ARE the r=4..r=16 bands** the pyramid measures as the problem. They are not
 * detail that happens to be too strong; they are detail that must not exist. Cut to
 * `{warp: 1, shape: 2, lane: 2}` = 10 taps.
 *
 * THE RULE THAT OUTLIVES THE OCTAVE COUNTS, because octave counts drift: **the
 * field must contain no feature smaller than 8 degrees of arc.** At the shots' own
 * 46 deg / 900 px that is 156 px, i.e. the field must survive a blur of radius 78 px
 * essentially unchanged. Anyone raising `shape` past 2 has to show that blur test,
 * not an opinion about detail.
 *
 * THE WARP STAYS AT TWO LEVELS AND DROPS TO ONE OCTAVE, which is not the same
 * decision. Two LEVELS is what makes the lanes thread the emission instead of
 * landing beside it (three curls into an intestinal look; one is a nudge). One
 * OCTAVE per level is what keeps the displacement low-frequency, which is all a
 * warp should ever be. The research's own measurement backs the second half: curl
 * noise is a trap at 4 octaves (coherence 0.161) and fine at 1 (0.892), because
 * velocities scale as O(1/L) and the finest octave dominates. Same arithmetic here.
 */
export const FIELD_TAPS = Object.freeze({
  warp: 1,
  shape: 2,
  lane: 2,
  get warpCalls() { return 6; },
  get noiseEvals() { return 6 * this.warp + this.shape + this.lane; },
});

/** An fbm with a literal loop bound, because GLSL ES 1.0 wants a constant one. */
function fbm(name, octaves) {
  return /* glsl */`
float ${name}(vec3 p) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < ${octaves}; i++) {
    s += a * npNoise(p);
    n += a;
    // Lacunarity is 2.03 rather than 2.0 and each octave carries an irrational-ish
    // offset, so successive octaves never re-align on the integer lattice. At exactly
    // 2.0 the corners of octave i sit on corners of octave i+1 and the sum shows a
    // faint grid, which on a full-frame sky is the one artefact nobody can unsee.
    p = p * 2.03 + vec3(19.19, 7.71, 33.37);
    a *= 0.5;
  }
  return s / n;
}`;
}

export const FIELD_GLSL = /* glsl */`
// ---------------------------------------------------------------------------
// hash + value noise. IQ's integer-lattice hash: three fracts and a triple
// product, no trig, stable across drivers.
// ---------------------------------------------------------------------------
float npHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1031, 0.1030, 0.0973));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float npNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = npHash(i + vec3(0.0, 0.0, 0.0));
  float n100 = npHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = npHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = npHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = npHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = npHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = npHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = npHash(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
${fbm('npFbmWarp', FIELD_TAPS.warp)}
${fbm('npFbmShape', FIELD_TAPS.shape)}
${fbm('npFbmLane', FIELD_TAPS.lane)}

// ---------------------------------------------------------------------------
// The 2-level warp, IQ's article lifted into 3D. q displaces the domain, r
// displaces the displaced domain. Two levels is what makes the lanes thread the
// emission rather than land beside it; one is a nudge, three curls into intestines.
//
// THE AMPLITUDE IS 0.85, NOT IQ's 4.0, AND THAT IS THE SINGLE LINE THAT WAS
// MAKING THE MARBLE.
//
// npField builds its domain as d * scale, so ONE unit of p is ONE feature of the
// base octave. IQ's 4.0 therefore displaces the domain by FOUR base features
// before a single sample is taken - at the shipped fieldScale of 3.0 that is 1.33
// times the entire domain radius. That is not a warp, it is a scramble, and a
// scrambled smooth field has energy at every frequency including the 1.6-6.5
// degree marble zone skybox-spec.md 7.2 measures as the failure. Cutting the
// octave counts alone could never have fixed it: the octaves were being FOLDED
// into finer structure than they contain.
//
// 0.85 keeps the displacement under one base feature, which is what a warp is for
// - it bends the strands and threads the lanes through the emission without
// inventing detail smaller than the thing being warped. IQ's number is right for
// his domain and wrong for ours, and it is the amplitude and not the article that
// is the project-specific decision.
// ---------------------------------------------------------------------------
const float NP_WARP_AMP = 0.85;

vec3 npWarp(vec3 p) {
  vec3 q = vec3(
    npFbmWarp(p),
    npFbmWarp(p + vec3(5.2, 1.3, 2.8)),
    npFbmWarp(p + vec3(1.7, 9.2, 4.4)));
  vec3 r = vec3(
    npFbmWarp(p + NP_WARP_AMP * q + vec3(8.3, 2.8, 6.1)),
    npFbmWarp(p + NP_WARP_AMP * q + vec3(3.4, 7.1, 1.9)),
    npFbmWarp(p + NP_WARP_AMP * q + vec3(6.7, 4.3, 9.8)));
  return p + NP_WARP_AMP * r;
}

/**
 * THE FIELD. One warp, two reads.
 *
 *   d        unit direction in far-scene space
 *   d          unit direction in far-scene space
 *   scale      base frequency, in cycles across the sphere
 *   stretch    anisotropy ACROSS the ecliptic. > 1 shortens features in y, so the
 *              strands lie along the combat plane rather than crossing it.
 *   laneScale  frequency of the dust lane relative to the emission. < 1 gives banks.
 *
 * Returns  x = emission density in [0,1]
 *          y = dust optical depth in [0,1], from the SAME warped domain offset by a
 *              constant, so the lane threads through the glow it is meant to obscure.
 */
vec2 npField(vec3 d, float scale, float stretch, float laneScale) {
  vec3 p = vec3(d.x, d.y * stretch, d.z) * scale;
  vec3 w = npWarp(p);
  // The lane is the SAME warped domain, offset by a constant so it threads through
  // the glow it obscures, and scaled so a dust BANK can be several times the size of
  // the emission detail it crosses. laneScale < 1 is what turns veins into banks; at
  // 1.0 the lane mask has the emission's own frequency and reads as cracks in a
  // surface rather than as dust in front of light. Measured by looking at the frame.
  return vec2(npFbmShape(w), npFbmLane(w * laneScale + vec3(11.93, 4.17, 23.71)));
}
`;
