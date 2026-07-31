/**
 * CELESTIAL COMPOSITION, PER POINT OF INTEREST.
 *
 * `CELESTIAL_SPECS` is the single source of truth for what is in the sky at a POI
 * *and* for where its light comes from. The lighting rig reads `sunDir` from here,
 * the star is drawn along `sunDir`, and the gas giant's terminator is computed from
 * `sunDir`. There is no second copy of that vector to fall out of sync.
 *
 * Every colour is derived from the POI's locked palette through `mix`/`shade`, so a
 * location's sky, its key light and its hull tints are all the same small set of
 * hues seen three different ways. That is why a frame from one POI is instantly
 * distinguishable from a frame from another.
 *
 *   giant-orbit  a banded blue giant filling a third of frame, ringed, half lit by a
 *                small off-frame sun; cold planetshine, a thin nebula band far away.
 *   graveyard    no near star. A pinprick sun low and cold, a derelict green nebula
 *                bank doing all the fill, and the same banded giant that `giant-orbit`
 *                sits over, 760 map units away and small. Dark, and coloured.
 *   near-star    the primary at five degrees across, wide halo, everything else
 *                crushed. A hot dust band and almost no visible stars.
 *
 * ===========================================================================
 * WHERE THE FIELD POINTS IS NOT A FREE CHOICE, AND IT WAS WRONG
 * ===========================================================================
 *
 * `docs/design/reference-frames.md` §0: in all six owner references the background is
 * a large, saturated, luminous object; in ours it was black. The graveyard authors
 * 7200 stars and a FOURTEEN-layer nebula and none of it read. It was not intensity.
 * Measured on the live game (background isolated by rendering each pose twice, once
 * normally and once with `world.scene` hidden, so the unchanged pixels ARE background):
 *
 *   shot          nebula centre off the view axis      background median luma
 *   engagement    116.4 deg  (BEHIND the camera)       0.0261
 *   close         147.7 deg  (BEHIND the camera)       0.0076
 *   wide           55.2 deg  (just off frame)          0.0146
 *
 * The tactical camera looks DOWN at the combat plane — its forward vector at the
 * shipped `engagement` pose is (-0.316, -0.586, -0.746) — and every nebula band in
 * this file was aimed at or above the horizon on a bearing nobody had checked against
 * a camera. A band you cannot see is worth exactly as much as no band.
 *
 * Two changes follow, and both are stated as directions here because this file is the
 * single source of truth for what is in the sky:
 *
 *   1. Every `nebula.centre` is aimed BELOW the horizon (y between -0.20 and -0.32),
 *      because that is where a camera pitched 12-36 degrees down spends most of its
 *      frame. `nebula.js#buildNebula` elongates a band along `centre x (0,1,0)`, which
 *      is horizontal for any centre that is not near-polar, so a low centre gives a
 *      band that lies ACROSS the frame rather than over the top of it.
 *   2. `dome` is new: one inward-facing sphere carrying a near-black vertical gradient
 *      in the POI's own hue plus a broad lobe on the band's axis. It is the coloured
 *      darkness, not a light. See `skydome.js` for the measurement it answers and for
 *      why a band alone cannot answer it (the camera's yaw is free; a band is not).
 */

import * as THREE from 'three';
import { getPOIPalette, NEUTRAL, mix, shade, saturate } from '../../art/palette.js';
import { buildStarfield } from './starfield.js';
import { buildNebula } from './nebula.js';
import { buildGasGiant } from './gasgiant.js';
import { buildStar } from './star.js';
import { buildSkyDome } from './skydome.js';
import { ORDER } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/**
 * Build a gas giant colour ramp out of a POI palette. Bright zones first, deep belt
 * last; the planet shader indexes it and the polar hood blends towards the tail.
 */
function giantRamp(pal) {
  return [
    mix(NEUTRAL.ice, pal.accent, 0.34),                 // 0 bright zone
    mix(pal.accent, NEUTRAL.ice, 0.30),                 // 1 zone
    pal.accent,                                          // 2 mid belt
    mix(pal.accent, pal.fill.color, 0.68),              // 3 belt
    mix(pal.fill.color, pal.ibl.horizon, 0.62),         // 4 dark belt
    mix(pal.ibl.horizon, pal.shadow, 0.55),             // 5 deep / polar
  ];
}

export const CELESTIAL_SPECS = {
  // -------------------------------------------------------------------------
  'giant-orbit': {
    poiPalette: 'giant-orbit',
    // 96 degrees of elongation from the planet: a clean vertical terminator on the
    // giant AND a hard raking key on the fleet. Low (20 deg) for long shadows.
    sunDir: V(0.776, 0.347, -0.526),
    background: NEUTRAL.spaceBlack,
    starfield: { count: 7000, gain: 0.95, bandDensity: 0.50, bandAxis: [0.28, 0.82, -0.50] },
    star: { direction: V(0.776, 0.347, -0.526), distance: 26000, angularRadius: 0.0085, coreGain: 30, haloGain: 2.0, shells: 3 },
    /**
     * Centre y was +0.19 and is now -0.20: at the `wide` pose the band sat 55.2 deg
     * off the view axis, i.e. over the top of the frame. Below the horizon it comes to
     * 49.7 deg and its near edge crosses the frame. `close` (yaw 2.35) still cannot
     * see it at all — 138.7 deg — and nothing about a directional band can fix that;
     * the dome below is what carries that framing.
     */
    nebula: {
      centre: [0.2094, -0.20, -0.9572], spread: 0.58, layers: 10, dustLayers: 3,
      intensity: 0.72, radius: 22000, frontRadius: 4600, scale: 1.0,
    },
    /**
     * Cold blue field. Lobe on the band, ecliptic floor in the same hue.
     *
     * `close` is the framing this POI's floor is solved against, because it is the one
     * that can see NO lobe at all — the band sits 138.6 degrees off its view axis, so
     * everything it measures is the ecliptic term. Solved through the fitted response
     * `out = 1.111 * L^0.643`: a background median of 0.115 needs L = 0.0294 at the
     * `close` view direction, and `0.8*ground + 0.2*zenith` there is L = 0.0290 before
     * the band factor of 0.853. Hence baseGain 1.19.
     */
    dome: {
      axis: [0.2094, -0.20, -0.9572], spread: 1.20,
      core: saturate(mix(0x24406e, 0x8fb4ff, 0.34), 1.30),
      zenith: saturate(mix(0x0a1024, 0x24406e, 0.72), 1.25),
      ground: saturate(mix(0x070b16, 0x24406e, 0.62), 1.25),
      gain: 0.276, baseGain: 1.35,
      /**
       * STRUCTURE HERE. THE SECOND HUE DOES NOT SURVIVE A BLUE FIELD, AND THAT IS A
       * MEASUREMENT, NOT A PREFERENCE.
       *
       * THE ABSORPTION IS NEARLY GREY HERE AND THE GRAVEYARD'S IS NOT, AND THAT IS
       * ARITHMETIC. A blue field keeps its energy in the channel a blue-heaviest
       * absorber eats FIRST. Run the graveyard's strongly-ordered coefficients on blue
       * and the lane does not rotate blue toward amber — it rotates it through grey and
       * out the other side, which is a violet dark tier and a collapsed chroma, i.e.
       * precisely the mud the owner's ruling exists to prevent. [0.86, 0.98, 1.22] is
       * still ordered correctly — dust reddens — but the ratio is 1.4:1 across the
       * channels instead of the graveyard's 12.7:1, so it spends its effect on VALUE
       * and almost none of it on HUE. For a field whose hue IS the location's identity
       * that is the right trade.
       *
       * SO THIS POI TAKES STRUCTURE AND KEEPS ONE HUE, AND THE RESULT IS MODEST.
       * Measured on this tree, HEAD -> shipped, `node tools/fieldcheck.mjs close,wide`:
       *
       *                     close                    wide
       *   median luma       0.1053 -> 0.1071         0.1437 -> 0.1407
       *   median chroma     0.2941 -> 0.2784         0.3058 -> 0.3058
       *   hue band          4 -> 5 deg               5 -> 5 deg
       *   luma p05..p95     0.0453..0.1510           0.0182..0.2826
       *                  -> 0.0460..0.1522        -> 0.0182..0.3348
       *   ladder WIDTH      0.1057 -> 0.1062         0.2644 -> 0.3166  (+20%)
       *   tier hue sep      3.2 -> 3.4 deg           2.7 -> 3.2 deg
       *
       * STATED PLAINLY BECAUSE IT WOULD BE EASY TO OVERSELL: at `close` this block does
       * almost nothing a measurement can see — the ladder widens by 0.0005 and the hue
       * separation by 0.2 degrees. At `wide`, where the frame contains far more sky and
       * far less gas giant, it widens the luma ladder by 20%. Both shots hold R1 and R2
       * with the median inside 0.003 of HEAD. This POI is NOT where the owner's ruling
       * lands, and the numbers say so rather than dressing it up.
       *
       * The ruling is authored for the graveyard and it lands at the graveyard; forcing
       * a second hue here would cost this location the chroma that IS its identity.
       * `reference-frames.md` §1's Everspace note — cool field, warm accents in the
       * DARK MASSES (R5) — is better answered by the wrecks and stations than by the
       * sky, and R5 is not this stream's file.
       *
       * `warmGain` 0.40 is the same scattering albedo as the graveyard's, and it is
       * safe on a cool field ONLY because `skydome.js` gates the warm on the lane and
       * bounds it by the radiance the absorption removed. Chroma is max-minus-min, so
       * an UNgated warm term on a blue field raises the minimum channel and costs
       * chroma one-for-one; see that file's step 6 for why the construction cannot do
       * that rather than being tuned so that it happens not to.
       *
       * Gains raised for the energy the absorption removes, not to make the place
       * brighter — and `close` reading 0.1071 against HEAD's 0.1053 is the check on
       * that claim, not the sentence before it.
       */
      structure: 0.40,
      coreBias: 0.35,
      fieldScale: 2.2,
      fieldStretch: 3.0,
      density: [0.38, 0.68],
      lane: [0.52, 0.68],
      laneDepth: 1.90,
      laneScale: 0.45,
      absorb: [0.86, 0.98, 1.22],
      warm: saturate(NEUTRAL.rockOre, 1.20),
      warmGain: 0.40,
    },
    giant: {
      // 34 degrees across at a 99 degree elongation: about a third of a 16:9 frame,
      // half lit, terminator running down the disc rather than clipping a limb.
      direction: V(-0.6007, -0.2603, -0.7559),
      distance: 9000, radius: 2740, rings: true,
      ringInner: 1.31, ringOuter: 2.14, spin: 1.9, gain: 1.0,
      // Sun 33 degrees above the ring plane (so the ring shadow lands on the LIT
      // hemisphere and is actually visible) and the plane only 15 degrees open to
      // the probe camera (so the rings stay a line, not a plate).
      axis: [0.013, 0.902, -0.431],
    },
  },

  // -------------------------------------------------------------------------
  graveyard: {
    poiPalette: 'graveyard',
    // Low, cold, and almost edge on. Everything here is silhouette and rim.
    sunDir: V(-0.905, 0.145, 0.400),
    background: 0x000000,
    starfield: { count: 7200, gain: 1.25, bandDensity: 0.62, bandAxis: [-0.20, 0.72, 0.66] },
    star: { direction: V(-0.905, 0.145, 0.400), distance: 30000, angularRadius: 0.0022, coreGain: 26, haloGain: 0.55, shells: 3 },
    /**
     * RE-AIMED, AND THIS IS THE SINGLE MEASURED CAUSE OF "THE BACKGROUND IS BLACK".
     *
     * The centre was `[-0.62, 0.10, 0.78]`. The tactical camera at the shipped
     * `engagement` pose looks along `(-0.316, -0.586, -0.746)`: the band was **116.4
     * degrees off the view axis**, which is to say behind the player's shoulder. All
     * fourteen layers of it rendered every frame into pixels nobody was looking at.
     *
     * It now runs on the bearing to `giant-orbit` — the graveyard sits at map
     * `[-190, 60]` and giant-orbit at `[-120, -700]`, and `world/system.js:312` maps
     * `pos` to `(x, 0, z)`, so that bearing is `(70, -760)` normalised to
     * `(0.0917, 0, -0.9958)` — dropped 14 degrees below the plane. Two reasons, both
     * of them checkable rather than aesthetic:
     *
     *   * BELOW, because `nebula.js` elongates the band along `centre x (0,1,0)`, so a
     *     low centre lays the band ACROSS a camera that is looking down at the plane
     *     instead of hanging it over the frame's top edge.
     *   * ON THAT BEARING, because the giant below is on it too. The nebula bank, the
     *     planet and the fill light are then one direction and one composition rather
     *     than three unrelated facts, and `world/lighting/pois.js` points the
     *     graveyard's fill at this same vector — which is what the palette's own
     *     comment ("the nebula IS the fill here") always claimed and never did.
     */
    nebula: {
      centre: [0.0890, -0.2419, -0.9662], spread: 0.78, layers: 14, dustLayers: 5,
      intensity: 1.30, radius: 20000, frontRadius: 4000, scale: 1.15,
      /**
       * Explicit tints, NOT derived from `fill` and `ibl.horizon` the way the other
       * POIs are. The graveyard palette's fill (0x4c6a4a) and horizon (0x14202e) are
       * near-black by design, so the generic derivation produces a nebula that is
       * literally invisible — and this is the one location whose fill light is
       * supposed to be coming from the nebula.
       *
       * THE COLD BLUE TINT IS GONE, and it cost the location its identity. R2 asks for
       * one hue owning the field inside a band 60 degrees wide. Measured on the hexes
       * that were here, the three tints sat at hue **88.3, 91.5 and 212.0 degrees** —
       * a 124 degree spread, because `mix(0xb6c6da, 0x1b2a3a, 0.55)` is a cold blue and
       * `r.int(0, 2)` gave it a third of every layer. Three greens at 86.9, 89.6 and
       * 128.2 degrees span 41. `saturate()` is the only thing raising chroma; every
       * hue below is a graveyard palette hue untouched, because saturate is
       * luminance-preserving and hue-preserving by construction.
       */
      tints: [
        saturate(mix(0x8fb04a, NEUTRAL.ice, 0.32), 1.30),
        saturate(mix(0x4c6a4a, 0x8fb04a, 0.45), 1.25),
        saturate(mix(0x14202e, 0x4c6a4a, 0.80), 1.25),
      ],
    },
    /**
     * Derelict green owns this field. `core` is the palette's own accent pushed on
     * chroma alone; the floor is the same family two stops down, so even the part of
     * the sky with nothing in it is green rather than black. That is the EVE Frontier
     * lesson from the reference set — the darkness is coloured, not absent.
     */
    dome: {
      axis: [0.0890, -0.2419, -0.9662], spread: 1.30,
      /**
       * THE FLOOR IS BUILT FROM THE ACCENT, NOT FROM `fill`, AND THAT IS A CHROMA
       * DECISION WITH A NUMBER BEHIND IT.
       *
       * `graveyard.fill` (0x4c6a4a) has r and b within 2/255 of each other, so no
       * amount of `saturate` gets much absolute chroma out of it — built from it the
       * background measured median chroma **0.0863** at median luma 0.0911, which is
       * within 1% of the arithmetic ceiling for that colour's own channel ratios.
       * `graveyard.accent` (0x8fb04a) has a blue channel at 0.42 of its green, and the
       * same solve gives 0.114 at luma 0.12. Both are graveyard palette hues and
       * `saturate` is hue-preserving, so this moves chroma and nothing else.
       *
       * See the stream report for why 0.18 absolute chroma — R2 as literally written —
       * is not reachable by ANY green-dominant field at R1's luma: green carries a
       * 0.7152 luminance weight, so a pure green at median luma 0.10 tops out at
       * chroma 0.14, and a realistic one at about 0.12.
       */
      core: saturate(0x8fb04a, 1.50),
      zenith: saturate(mix(0x4c6a4a, 0x8fb04a, 0.70), 1.50),
      ground: saturate(mix(0x4c6a4a, 0x8fb04a, 0.45), 1.55),
      /**
       * SOLVED AGAINST A MEASURED FRAME, NOT GUESSED, AND THE FIRST GUESS WAS 5x OVER.
       * At gain 0.17 / baseGain 1.05 the `engagement` background measured median luma
       * **0.3777** with 98.8% of the frame above 0.06 — a lit room, not a graveyard.
       * The fitted response `out = 1.111 * L^0.643` predicted 0.3896 for that dome's
       * L = 0.196, which is the model agreeing with the frame to 3%, so it can be
       * inverted. Re-solved for a 0.1225 median against the brighter floor colours
       * above (ground L 0.224 against the old 0.126).
       *
       * W6-A RAISED THESE, AND UPWARD IS NOT A BRIGHTNESS DECISION. It is compensation
       * for energy the new dust lanes REMOVE. `field-baseline.md` §8 kills the plan's
       * proposed 2.0-2.3x lift outright — R1 already reads 0.1283 against a 0.10 target
       * on HEAD, re-measured on this tree. The absorption term in `skydome.js` is a
       * multiply by `exp(-uAbsorb * tau)`, which can only ever take light away; these
       * gains put the median back where the measured frame had it.
       *
       * THE PROOF THAT THEY DID NOT RAISE IT IS THE MEASUREMENT, NOT THIS SENTENCE.
       * `node tools/fieldcheck.mjs engagement --report`, hardware, N = 1 440 000 px:
       * HEAD 0.1283 -> shipped **0.1271**. That is -0.0012, i.e. the frame is a hair
       * DARKER than the one the baseline graded, while its luma ladder p05..p95 widens
       * from 0.106 to 0.205 and its dark tier rotates from green to rust. The whole
       * point of this wave is that those two things happened without the median moving.
       *
       * The ratio to HEAD is 0.092/0.049 = 1.878 on the lobe and 0.318/0.170 = 1.871 on
       * the band — i.e. the absorption is eating very close to a uniform 47% of the
       * dome's output at this POI, and the two gains are scaled together rather than
       * being independently fiddled.
       *
       * `cinematic` is the shot these were finally set against, because it is the
       * yaw-independent floor: its yaw puts the lobe behind the camera, so it sees the
       * band and nothing else, and `field-baseline.md` §4 names its shortfall as "the
       * new brief". It FAILED BOTH R1 AND R2 on HEAD — measured on this tree at 0.0939
       * luma / 0.1019 chroma against 0.10 / 0.12 — and at these gains it measures
       * **0.1202 / 0.1295 and PASSES BOTH**.
       *
       * (An earlier pass of this work recorded a gain-by-gain audit trail here. Those
       * runs used settings this commit did not keep, so the table has been removed
       * rather than re-printed under numbers it no longer describes. Every figure above
       * is from a run of the command named above against the tree as committed.)
       */
      gain: 0.092, baseGain: 0.318,
      /**
       * ===================================================================
       * THE OWNER'S RUST-AND-GREEN RULING, AS FIVE NUMBERS
       * ===================================================================
       *
       * Green in the LUMINOUS CORE, rust and amber in the DUST LANES and the OUTER
       * BANDS, separated by VALUE and by STRUCTURE so they cannot average to mud.
       * `skydome.js`'s header has the mechanism; these are the authored settings and
       * why each one is the number it is.
       *
       * MEASURED RESULT OF THIS BLOCK, `engagement` field, HEAD -> here. Hardware
       * raster, N = 1 440 000 px, the two trees differing by this block, `skydome.js`
       * and `field.glsl.js`:
       *
       *                        HEAD      shipped
       *   median luma          0.1283    0.1271     R1 needs 0.10        both PASS
       *   % above 0.06         97.8%      89.9%     R1 needs 40%         both PASS
       *   median chroma        0.1451    0.1373     R2 needs 0.12        both PASS
       *   hue band (80% mass)  5 deg     32 deg     R2 needs <= 60 deg   both PASS
       *   luma p05 .. p95      0.0697..0.1754       0.0511..0.2565
       *   dark tier hue        96.0 deg  45.6 deg   <- RUST
       *   mid tier hue         94.1 deg  76.5 deg
       *   bright tier hue      93.7 deg  89.1 deg   <- GREEN
       *   DARK-TO-BRIGHT HUE SEPARATION   2.3 deg   ->   43.5 deg
       *
       * The chroma and the "% above 0.06" both go DOWN, and that is the dust doing its
       * job rather than a regression: a lane that occludes has to darken and desaturate
       * the pixels it covers, or it is not in front of anything. Both stay well clear of
       * their targets. What the ruling is graded on is the last three rows.
       *
       * `structure` 0.34 — the emission is multiplied by `1 + s*(2*dens-1)`, which at
       * 0.34 swings between 0.66 and 1.34, a **2.03:1** bright-to-dark ratio from
       * structure alone, against a measured interquartile luma range of 0.049 on HEAD
       * (p25 0.1034, p75 0.1522). It is mean-preserving by construction — the mean of
       * `2*dens-1` over a field with mean density 0.5 is zero — which is why it moves
       * the LADDER without moving the MEDIAN, and the measured -0.0012 above is that
       * property holding on a real frame rather than in a derivation.
       *
       * `fieldScale` 3.0 / `fieldStretch` 3.4 — 3.0 cycles across the sphere puts the
       * base octave's feature at a **19.2 degree** chord angle before the domain warp
       * displaces it, which against a 46 degree FOV is a few strands in frame rather
       * than a texture. The stretch is applied across the ecliptic, so the strands lie
       * ALONG the plane the game is fought on; `common.js:105-126` states the same
       * trick for the gas giant and says why ("stretches features along longitude,
       * which is the whole reason gas giant turbulence reads as ribbons rather than as
       * clouds").
       *
       * `lane` [0.50, 0.68] / `laneDepth` 1.75 — NARROW AND DEEP, AND THIS IS THE PAIR
       * THAT DECIDES WHETHER THE RESULT IS DUST OR MUD. The window is 0.18 wide on the
       * upper half of a 3-octave fbm, so lanes are a minority of the sky and the rest
       * of it stays clean green. The failure mode is a WIDE, SHALLOW window: that
       * partially reddens most of the frame at once, which is not dust, it is a warm
       * veil, and a warm veil over green is exactly the grey average the owner named as
       * the failure mode. Narrow and deep spends the same energy on a small area and
       * gets STRUCTURE; wide and shallow spends it everywhere and gets TINT.
       *
       * `absorb` [0.15, 1.10, 1.90] — per-channel absorption, blue-heaviest, so the
       * lane REDDENS what it occludes. These are optical coefficients and not colours;
       * they are deliberately not palette hexes, because there is no sense in which
       * `exp(-1.90)` is a colour the palette could own. At the peak depth of 1.75 the
       * transmission is **0.769 / 0.146 / 0.036** — red survives 5.3x better than green
       * and 21x better than blue, which is the entire hue rotation, and every channel is
       * below 1 so everything it touches gets DARKER. One operation, both axes of the
       * owner's separation.
       *
       * `warm` — the graveyard palette has no warm hue at all (key is 0xb6c6da, fill
       * 0x4c6a4a, accent 0x8fb04a: cold, green, green). `NEUTRAL.rockOre` is the
       * palette's warm ochre and it is the honest choice here for a location made of
       * oxidised wreckage. Pushed on chroma alone by `saturate`, which is hue- and
       * luminance-preserving below the clip thresholds recorded above; 0x8a6a3c is
       * sRGB 0.541 / 0.416 / 0.235, so its blue sits at **0.435 of its red** and it has
       * real room before `saturate` drives a channel to the clamp. That matters here:
       * `field-baseline.md` §7 caught all three of this dome's authored colours already
       * clipped to exactly zero blue, and chroma bought by deleting a channel is the
       * trap this wave is supposed to be climbing out of, not back into.
       *
       * `warmGain` 0.34 — a SCATTERING ALBEDO, not a brightness. `skydome.js` divides
       * `warm` by its own luminance and multiplies this by the radiance the absorption
       * removed from the same pixel, so 0.34 means "34% of what the dust took out comes
       * back warm", and the term is bounded by construction rather than by taste.
       *
       * IT IS SET AGAINST `cinematic`, NOT AGAINST `engagement`, and that is a
       * consequence of the shader and not a preference. The warm rides `(1 - t)`, so
       * the lobe gates it out of the graveyard's own luminous core — which is the half
       * of the owner's ruling that says GREEN OWNS THE CORE, enforced in one factor.
       * `engagement` faces the lobe, so this number barely reaches it; `cinematic`
       * faces away from the lobe and is therefore the shot that grades the warm.
       *
       * THE CEILING ON THIS NUMBER IS R2's HUE BAND, NOT R1. `field-baseline.md` §5
       * warns that "a field genuinely carrying both cannot fit inside R2's 60 degree
       * band if both hues carry comparable chroma mass" — so pushing the warm until it
       * is a co-equal hue does not fail as a dim frame, it fails as a 60+ degree band.
       * At the shipped value `engagement` measures a **32 degree** band and `cinematic`
       * **29**, both inside the ceiling with room; that headroom is what the number is
       * spending, and anyone raising it should watch the band column and not the luma.
       */
      structure: 0.34,
      coreBias: 0.30,
      fieldScale: 3.0,
      fieldStretch: 3.4,
      density: [0.22, 0.84],
      lane: [0.50, 0.68],
      laneDepth: 1.75,
      laneScale: 0.42,
      absorb: [0.15, 1.10, 1.90],
      warm: saturate(NEUTRAL.rockOre, 1.35),
      warmGain: 0.34,
    },
    /**
     * THE OWNER RULED: KEEP THE GRAVEYARD, DRESS IT UP. THIS IS THE DRESSING.
     *
     * `giant: null` meant there was no large body in the sky at all, which is half of
     * why the wide read has no scale cue: a 1400 m hull against a starfield is a hull
     * against nothing, and nothing has no size.
     *
     * This is the SAME banded giant `giant-orbit` sits over, seen from 760 map units
     * away, so it is astronomically correct and it is a destination the player can see
     * and travel to. Direction is the in-plane bearing above, dropped 28 degrees below
     * the combat plane — the tactical camera pitches 12-36 degrees DOWN, so a body on
     * the horizon leaves the top of the frame; at -28 it lands at NDC (0.61, 0.20) in
     * the shipped `engagement` pose, right of centre and just above the middle.
     *
     * SMALL, DELIBERATELY: `asin(1630/24000)` is 3.9 degrees of angular radius, about
     * 150 px of disc in a 900 px frame with the ring line reaching 330 px. Big enough
     * to carry a terminator and a ring, far too small to take the frame off the ship —
     * `giant-orbit` is the place where the planet is the subject and this is not it.
     *
     * The axis is `giant-orbit`'s, unchanged, for continuity: it is the same planet.
     * `sunDir` is the graveyard's, so the terminator is lit by the pinprick sun that
     * lights everything else here and the disc is a phase rather than a flat coin.
     * 512 rather than 1024 texels: at 150 px of disc, 1024 is texture memory and boot
     * time spent on detail no frame can resolve.
     */
    giant: {
      direction: V(0.0810, -0.4695, -0.8792),
      distance: 24000, radius: 1630, rings: true,
      ringInner: 1.34, ringOuter: 2.14, spin: 2.6, gain: 0.90,
      axis: [0.013, 0.902, -0.431],
      textureSize: 512,
    },
  },

  // -------------------------------------------------------------------------
  'near-star': {
    poiPalette: 'near-star',
    // Just inside the frame edge so the god-ray pass has a real anchor.
    sunDir: V(0.560, 0.300, -0.772),
    background: 0x000000,
    starfield: { count: 2600, gain: 0.30, bandDensity: 0.35, bandAxis: [0.55, 0.60, 0.58] },
    star: {
      direction: V(0.560, 0.300, -0.772), distance: 16000, angularRadius: 0.042,
      coreGain: 40, haloGain: 1.7, shells: 3, wideHalo: true,
    },
    nebula: {
      centre: [0.2951, -0.24, -0.9245], spread: 0.85, layers: 8, dustLayers: 2,
      intensity: 0.36, radius: 19000, frontRadius: 4200, scale: 1.35,
    },
    /**
     * Hot dust. One warm hue, and the floor is the same rust two stops down.
     *
     * NOT MEASURED ON A FRAME, and that is stated rather than hidden: no shot in
     * `tools/shots.json` visits `near-star`, so this is carried on the arithmetic
     * that solved the other two — core L 0.104 x gain, ecliptic L ~0.028 x baseGain,
     * which puts it in the same band as `giant-orbit` before this POI's own exposure
     * 0.86 and vignette 0.52 pull it back down. It should be shot before anyone
     * quotes a number for it.
     */
    dome: {
      axis: [0.2951, -0.24, -0.9245], spread: 1.25,
      core: saturate(mix(0x5a2c12, 0xff7a2a, 0.30), 1.20),
      zenith: saturate(mix(0x120804, 0x5a2c12, 0.80), 1.20),
      ground: saturate(mix(0x1a0c05, 0x5a2c12, 0.72), 1.20),
      /**
       * STILL NOT MEASURED, AND THESE GAINS ARE ARITHMETIC. `field-baseline.md` §9 is
       * explicit — no shot in `tools/shots.json` visits `near-star`, so `fieldcheck`
       * cannot see it and "nobody should quote a number for near-star". That was true
       * before this change and it is true after it.
       *
       * What IS defensible: the field settings below are close to the graveyard's, and
       * the graveyard's gains had to be scaled **1.878x (lobe, 0.049 -> 0.092)** and
       * **1.871x (band, 0.170 -> 0.318)** to hold its MEASURED median once the dust
       * absorption was taking energy out of it. 0.26 x 1.88 = 0.489 and 0.95 x 1.88 =
       * 1.786 carry that one measured ratio across to a location nobody has shot. That
       * is a much narrower claim than a solve — it assumes only that a similar dust
       * setting removes a similar fraction of a dome's output — and it is the most this
       * location's instrumentation supports.
       *
       * The warm scatter is this POI's own accent rather than `rockOre`: the field is
       * already rust here, so the dust lanes deepen the location's own hue instead of
       * introducing a second one. That is a different job from the graveyard's and it
       * is why the number differs. **Shoot this POI before quoting anything.**
       */
      gain: 0.489, baseGain: 1.78,
      structure: 0.42,
      coreBias: 0.35,
      fieldScale: 2.5,
      fieldStretch: 3.2,
      density: [0.37, 0.69],
      lane: [0.52, 0.68],
      laneDepth: 1.90,
      laneScale: 0.45,
      absorb: [0.32, 0.98, 1.70],
      warm: saturate(mix(0x5a2c12, 0xff7a2a, 0.55), 1.15),
      warmGain: 0.35,
    },
    giant: null,
  },
};

/**
 * Build the far-scene contents for a POI.
 *
 * @param {string} poiId
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {THREE.Scene} [p.far]   if given, the result is added to it
 * @param {Object} [p.overrides]  shallow-merged over the spec
 * @returns {{root:THREE.Group, sunDir:THREE.Vector3, spec:Object, parts:Object,
 *            update:Function, dispose:Function}}
 */
export function buildCelestials(poiId, { rng, far = null, overrides = {} } = {}) {
  const spec = { ...(CELESTIAL_SPECS[poiId] ?? CELESTIAL_SPECS['giant-orbit']), ...overrides };
  const pal = getPOIPalette(spec.poiPalette ?? poiId);
  const r = rng.fork(`celestials:${poiId}`);

  const root = new THREE.Group();
  root.name = `celestials:${poiId}`;

  const parts = {};

  /*
   * --- the coloured darkness, first and behind everything ------------------
   *
   * Built before the starfield so the scene graph reads in draw order; the actual
   * ordering is `ORDER.dome` (-1) with depth test off, not insertion order.
   */
  if (spec.dome) {
    parts.dome = buildSkyDome(spec.dome);
    root.add(parts.dome.object);
  }

  // --- starfield -----------------------------------------------------------
  parts.starfield = buildStarfield({ rng: r, ...spec.starfield });
  root.add(parts.starfield.object);

  // --- nebula --------------------------------------------------------------
  if (spec.nebula) {
    // Emission tints: the POI accent, the fill (its bounce colour) and one cooled
    // deep tone. Three hues, no more — the sky must not out-colour the ships.
    const tints = spec.nebula.tints ?? [
      mix(pal.accent, NEUTRAL.ice, 0.20),
      pal.fill.color,
      mix(pal.ibl.horizon, pal.accent, 0.35),
    ];
    parts.nebula = buildNebula({
      rng: r,
      tints,
      dustTint: shade(pal.shadow, 0.75),
      ...spec.nebula,
    });
    root.add(parts.nebula.object);
  }

  // --- the primary ---------------------------------------------------------
  if (spec.star) {
    parts.star = buildStar({
      rng: r,
      core: mix(pal.key.color, NEUTRAL.select, 0.10),
      halo: mix(pal.key.color, pal.accent, 0.28),
      ...spec.star,
    });
    root.add(parts.star.object);
  }

  // --- the hero ------------------------------------------------------------
  if (spec.giant) {
    parts.giant = buildGasGiant({
      rng: r,
      sunDir: spec.sunDir,
      ramp: spec.giant.ramp ?? giantRamp(pal),
      colors: {
        sun: pal.key.color,
        night: mix(pal.shadow, pal.fill.color, 0.55),
        rim: mix(pal.accent, NEUTRAL.ice, 0.35),
        aurora: mix(pal.accent, NEUTRAL.friendly, 0.30),
        storm: mix(NEUTRAL.select, pal.accent, 0.22),
        // Cool and dark. A warm bright ring next to a cold planet becomes the
        // brightest thing in frame and steals the composition from the hero.
        ringDust: mix(NEUTRAL.rock, NEUTRAL.rockDark, 0.42),
        ringIce: mix(NEUTRAL.ice, NEUTRAL.rock, 0.45),
        nightGain: 0.055,
        rimGain: 0.85,
        auroraGain: 0.30,
        haloGain: 0.55,
        ringGain: 0.60,
        ringAmbient: 0.055,
        ringTau: 0.72,
      },
      ...spec.giant,
    });
    root.add(parts.giant.object);
  }

  root.updateMatrixWorld(true);

  if (far) {
    far.add(root);
    far.background = new THREE.Color().setHex(spec.background ?? NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
  }

  return {
    root,
    parts,
    spec,
    sunDir: spec.sunDir.clone(),
    palette: pal,
    /** Order constants, so callers can slot their own celestials into the stack. */
    ORDER,
    /** Refresh view-dependent uniforms. Cheap; safe to skip on a static shot. */
    update(farCamera) {
      parts.giant?.refresh(farCamera);
    },
    dispose() {
      root.parent?.remove(root);
      for (const k of Object.keys(parts)) parts[k]?.dispose?.();
    },
  };
}

/**
 * Installer, in the shape `game.js` calls. Idempotent: a second call returns the
 * instance already installed rather than stacking a second sky on the first.
 *
 *   installCelestials(world, 'giant-orbit', ctx)
 *
 * Registers a render-rate system (order 60) that refreshes the gas giant's
 * view-dependent uniforms. It runs at render rate, not sim rate, because the far
 * camera moves while paused.
 */
export function installCelestials(world, poiId = 'giant-orbit', ctx = {}) {
  if (world.systems.celestials) return world.systems.celestials;

  const sky = buildCelestials(poiId, {
    rng: ctx.rng ?? world.rng.fork(`celestials:${poiId}`),
    far: world.far,
  });

  const system = {
    name: 'celestials',
    order: 60,
    update() { sky.update(world.renderer?.farCamera ?? null); },
  };
  world.engine?.addRender(system);

  const api = {
    ...sky,
    dispose() {
      sky.dispose();
      const list = world.engine?.renderSystems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
      delete world.systems.celestials;
    },
  };
  world.register('celestials', api);
  return api;
}

export { buildStarfield, buildNebula, buildGasGiant, buildStar, buildSkyDome, ORDER };
