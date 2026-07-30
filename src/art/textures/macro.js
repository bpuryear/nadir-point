/**
 * THE MACRO LAYER — the one texture on a hull that does NOT tile.
 *
 * Everything else in this directory is a tiling detail map: one UV unit is one
 * metre, the registry sets `repeat` from the faction's plate size, and the tile
 * repeats. That is correct for plating and it is fatal on its own, because a 1400 m
 * hull carrying a 26 m tile shows the same 54 plates fifty-four times and the eye
 * finds it in under a second. Defect D4.
 *
 * This map is the second frequency, and it is addressed in OBJECT SPACE rather than
 * in UV space, so on any one hull it is sampled exactly once from end to end. That
 * is what buys three things a tiling map cannot buy at any resolution:
 *
 *   1. LOW-FREQUENCY VALUE DRIFT. Repetition is detected by finding two patches
 *      with the same value. A slow ±12% swing across hundreds of metres means no
 *      two repeats of the plate tile ever land on the same value, and the lattice
 *      stops resolving. This is the cheap half of the D4 fix and it is the half
 *      that does most of the work.
 *   2. ASYMMETRIC HAND-PLACED MARKS. A hull number, a chevron pair, hazard bars at
 *      the drive well and the bay mouth. Seeded per faction, drawn ONCE, and
 *      different on the port face from the starboard face — see the region model
 *      below. Marks stamped into a tiling map appear fifty times, which is why
 *      hullMaps.js keeps its stencils at alpha 0.34 and can never do this.
 *   3. SOOT. Streaks trailing off vents and thrusters, running down the flanks and
 *      aft over the deck. Directional, and the direction differs per face, which no
 *      tiling map can express because a tiling map does not know which face it is on.
 *
 * ---------------------------------------------------------------------------
 * THE REGION MODEL, AND WHY IT IS SIX REGIONS AND NOT ONE
 * ---------------------------------------------------------------------------
 * The shader picks a region from the dominant axis AND SIGN of the object-space
 * normal, and projects the other two object-space axes into it:
 *
 *   0  +X starboard flank   (z, y)      3  -Y belly            (x, z)
 *   1  -X port flank        (z, y)      4  +Z bow              (x, y)
 *   2  +Y deck              (x, z)      5  -Z stern            (x, y)
 *
 * Six regions, packed 3 x 2 into one texture. The sign split is the load-bearing
 * part: with a single projection the port and starboard flanks sample the same
 * texels and every mark is mirror-matched, which ship-language.md §3 names as "the
 * strongest single tell of procedural placement". With the sign in the region index
 * the two flanks carry genuinely different marks and different soot.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY LEFT BLANK
 * ---------------------------------------------------------------------------
 * The material is SHARED. A 1400 m cruiser, a 480 m destroyer and an 18 m fighter
 * all sample the same map with the same `macroM` metre scale, so a small object
 * samples a small patch around the region CENTRE. The centre box of every region is
 * therefore held clear of marks — a fighter gets drift and nothing else, instead of
 * being painted with one enormous letter. Marks live in an annulus, which on a
 * capital hull is the fore and aft thirds where they belong anyway.
 *
 * Region 4, the bow, carries no marks at all: §3 forbids detail in the forward
 * 200 m because the prow's job is convergence and it is the part most often
 * silhouetted against a celestial.
 *
 * CHANNELS
 *   R  value drift, 0.5 = neutral       B  soot / exhaust wash, 0 = clean
 *   G  STRUCTURE HEIGHT, 0.5 = neutral  A  ink marks, 0 = none
 *
 * ---------------------------------------------------------------------------
 * G STOPPED BEING A ROUGHNESS SCRIBBLE AND BECAME A HEIGHT FIELD
 * ---------------------------------------------------------------------------
 * Round-two review, BLOCKER: "There is currently exactly one dense element on the
 * entire 1400 m ship", and the §3 rule it quoted back at us — "if you want greeble
 * somewhere, cut a recess for it first."
 *
 * A tiling map cannot cut a recess because it does not know where it is. This one
 * does. G is now RELIEF IN METRES (0.5 neutral, full swing 44 m — see
 * materials/hullShader.js#HULL_MACRO_DEFAULTS.reliefM), and the shader derives four
 * things from it with no extra texture fetch: a normal perturbation from its
 * screen-space gradient, a cavity term on indirect light and albedo, a roughness
 * drift, and the DETAIL GAIN that amplifies the tiling map's contrast inside a
 * structure band and damps it over open armour.
 *
 * So the frequency hierarchy is placed HERE, per square metre of a specific hull, and
 * not by hoping the geometry stream assigns the right material to the right face.
 * §3's budget — 8 to 11 dense bands of roughly 55 x 200 m, at mass joints, inside
 * recesses and around machinery, never mirror-matched port to starboard — is a list
 * of rectangles in `STRUCTURE` below, in ship metres.
 *
 * Roughness drift lost its own FBM field when G was repurposed. It is now derived
 * from the height, which is better than what it replaced: a recess collects dirt and
 * a proud frame gets rubbed clean, and the old field knew about neither.
 */

import * as THREE from 'three';
import {
  makeCanvas, ctx2d, saturate01, canvasToField,
} from './canvas2d.js';
import { fbmField } from './noise.js';
import { drawText, hullCode, hazardStripes, factionSigil } from './decals.js';
import { getFactionPalette } from '../palette.js';

/**
 * Region resolution. 384 over 1600 m is 4.17 m per texel.
 *
 * 256 was tried first and the marks were unreadable at it: the 5x7 block font needs
 * seven texel rows for one glyph, which at 6.3 m/texel forces a 44 m character
 * before it resolves at all, and the first render put a 208 m hazard smear across
 * the foredeck. 384 costs a 1152 x 768 RGBA atlas — 3.5 MB per faction before mips —
 * and lets a 36 m hull number and a 16 m hazard pitch actually resolve.
 */
export const MACRO_REGION = 384;
export const MACRO_COLS = 3;
export const MACRO_ROWS = 2;

/**
 * Metres of hull that one region spans, end to end. The ±800 m this implies is the
 * cruiser's own 1400 m length plus margin, so the hero ship uses most of a region
 * and nothing smaller ever wraps.
 */
export const MACRO_DEFAULT_M = 1600;

/**
 * Metres of relief a full 0..1 swing of the G channel represents, so 0.5 is the hull
 * skin and the channel spans ±22 m. Exported and imported by
 * `materials/hullShader.js` rather than written down twice: the atlas authors depths
 * against this number and the shader reconstructs them from it, and two copies of a
 * scale factor is a bug waiting for one of them to be edited.
 *
 * 44 m is chosen so §3's "a recess deeper than 8 m" is comfortably inside the range
 * with room for the 19 m bay throat, while a one-texel filtering error is 0.17 m.
 */
export const MACRO_RELIEF_M = 44;

export const MACRO_DEFAULTS = {
  faction: 'player',
  seed: 0,
  /** 0 disables marks and soot, leaving drift only. Used for debris and rubble. */
  marks: 1,
};

/**
 * THE CENTRE OF EVERY REGION IS STILL HELD CLEAR, and it is now held clear by
 * construction rather than by a rejection test.
 *
 * The material is SHARED: a 1400 m cruiser, a 480 m destroyer and an 18 m fighter
 * all sample this map at the same metre scale, so an 18 m fighter only ever reaches
 * ±9 m either side of the region centre. Every mark below is anchored to a hull
 * feature at least 40 m off the centreline or off midships, so a fighter picks up
 * drift and soot and no lettering — which is what the old ±56 m rejection box was
 * for. The nearest mark to any region centre is the bay rail at x = ±105.
 *
 * STATED LIMITATION: the anchors are the PLAYER CRUISER's, and one atlas serves a
 * whole faction. A 480 m Coalition destroyer reaches ±240 m and therefore picks up
 * the bay-rail stripes and the two nearest hazard patches at stations where its own
 * structure is something else. They read as generic hull markings rather than as
 * wrong ones, and it is strictly better than the previous behaviour (uniform random
 * placement, which put them nowhere structural on ANY hull) — but the honest fix is
 * a per-CLASS anchor set, which needs the geometry stream to publish its feature
 * stations. Recorded in the stream report rather than hidden here.
 */

/**
 * WHERE THE HULL ACTUALLY IS INSIDE EACH REGION.
 *
 * A region maps ±800 m to 0..1 on BOTH of its axes, but a capital hull is 1400 m
 * long, 330 m in beam and 490 m tall, so it does not fill a region squarely. On a
 * flank region — projection (z, y) — the hull occupies v from 0.35 to 0.66 and
 * nothing else; a mark placed at v = 0.8 is 480 m above the deck and is drawn on
 * empty texture. The first pass placed uniformly over 0.10..0.90 and roughly
 * three quarters of the flank marks landed off the hull entirely, which reads as
 * "the marks are unreliable" rather than as the bug it is.
 *
 * The projection stays ISOTROPIC — squeezing each axis to fit would stretch a
 * hazard bar 2.8:1 — and the placement window does the work instead.
 *
 * Still used for SOOT, which is a wash and only needs to start on the hull. Marks
 * no longer use it: see SHIP below.
 */
const BAND = [
  { u0: 0.12, u1: 0.88, v0: 0.355, v1: 0.645 },  // 0 +X flank   (z, y)
  { u0: 0.12, u1: 0.88, v0: 0.355, v1: 0.645 },  // 1 -X flank   (z, y)
  { u0: 0.42, u1: 0.58, v0: 0.12, v1: 0.88 },    // 2 +Y deck    (x, z)
  { u0: 0.42, u1: 0.58, v0: 0.12, v1: 0.88 },    // 3 -Y belly   (x, z)
  { u0: 0.42, u1: 0.58, v0: 0.375, v1: 0.625 },  // 4 +Z bow     (x, y)
  { u0: 0.42, u1: 0.58, v0: 0.375, v1: 0.625 },  // 5 -Z stern   (x, y)
];

/**
 * ---------------------------------------------------------------------------
 * THE STRUCTURE THE MARKS ARE PLACED AGAINST
 * ---------------------------------------------------------------------------
 * Round-one review, on the previous pass: "Accent colour does not follow structure.
 * The yellow patches sit mid-face, cross plate boundaries, start and stop nowhere
 * structural, and have no shadow at their border ... Quantity is not the problem —
 * saturated albedo measures 0.9% of the hull mask, well inside §4's 3.5% budget —
 * PLACEMENT is the entire failure."
 *
 * It was, and the cause was mechanical: `place()` drew a uniform random point inside
 * the band and dropped a rectangle there. Nothing in the generator knew where the
 * deck chine, the bay mouth or the drive well were, so nothing could possibly land
 * on them.
 *
 * Every mark below is now placed at a NAMED FEATURE OF THE HULL, in ship metres,
 * taken from ship-language.md §5 and §7. Nothing is drawn at a random position.
 * The RNG still decides which of a few permitted variants is used and how the glyphs
 * read, so a seed still changes the ship — it no longer changes whether a hazard
 * band is on the bay door or in the middle of an armour belt.
 */
/**
 * HANDEDNESS PER REGION. Must stay identical to the sign the shader applies in
 * `materials/hullShader.js#nadirMacroUV`, which flips the first axis on regions 0, 2
 * and 5 so lettering reads left-to-right when you are looking at that face. Without
 * the matching flip here, fixing the mirroring would move every mark to the opposite
 * end of the ship — a hull number authored on the bow would be stencilled on the
 * stern, which is a subtler and more expensive bug than the mirroring was.
 */
const AXIS_FLIP = [-1, 1, -1, 1, 1, -1];

const SHIP = {
  length: 1400,          // z -700 .. +700
  deckChine: 68,         // y, main deck edge (it has sheer: +64 .. +78)
  keel: -76,             // y
  shoulderZ: -40,        // maximum hull beam
  sternBlock: -620,      // z, centre of the stern block
  bay: { z0: -160, z1: 160, x: 105, yTop: -72, yBot: -240 },
  driveWell: { r: 62 },  // radius at z = -700, centred on the axis
  grapplePort: [112, -38],      // z of the two port pivots
  grappleStbd: [64, -96],       // z of the two starboard pivots  (never mirrored)
  mounts: { dorsalZ: 270, bowZ: 470, engineZ: -624 },
  ribsZ: -400,           // port flank, skin missing
  patchZ: -180,          // port flank, captured armour plate at 7 degrees
  /**
   * SENSOR STATIONS — where the WHITE family goes, and only there.
   * `bridgeZ` is the superstructure (the same station STRUCTURE region 0 already
   * calls "the superstructure footing"); `arrayZ` is the foredeck array; `mastX` is
   * how far outboard the flank apertures sit on the superstructure.
   */
  sensor: { bridgeZ: -130, arrayZ: 380, mastY: 96, apertureY: 40 },
  /**
   * THE GRAPPLE RAILS, not just the pivots. A grapple arm swings, so it runs on a
   * track, and a track is functional edge structure a yard paints. Stated as the z
   * span each side's rail covers, hung off the pivots already declared above.
   */
  grappleRail: { port: [-70, 140], stbd: [-128, 96], y: -50 },
};

/**
 * ---------------------------------------------------------------------------
 * THE MARK SET IS DRAWN AT THREE HULL SCALES, BECAUSE ONE ATLAS SERVES A FLEET
 * ---------------------------------------------------------------------------
 * Recorded as a stated limitation by the previous pass and raised again by review:
 * "one atlas serving a whole faction currently anchors its marks to the PLAYER
 * CRUISER's feature stations, so a 480 m destroyer picks up bay-rail stripes where
 * its own structure is something else."
 *
 * The mechanism behind that is not fixable by moving marks around. A region maps
 * ±800 m of OBJECT SPACE to 0..1, `macroM` is a per-MATERIAL uniform, and
 * `ships/common.js#SURFACES` gives a whole faction ONE hull material - so every hull
 * of that faction, from a 95 m interceptor to a 900 m carrier, samples the same atlas
 * at the same metres-per-texel. Giving each class its own scale means giving each
 * class its own material, which is a draw call per class per surface against a budget
 * that is already 499 against a committed 320.
 *
 * What CAN be done, and is done here: make the mark set SELF-SIMILAR. The same small
 * structural vocabulary - a chine edge stripe, an access hazard, a sensor aperture -
 * is drawn three times at three scales of the same anchor table, so the annulus a
 * 480 m hull actually reaches carries marks sized and placed for a 480 m hull, and
 * the annulus a 200 m corvette reaches carries marks sized for a corvette.
 *
 *   scale 1.00   reaches ±700 m   the player cruiser and the 900 m carrier
 *   scale 0.34   reaches ±240 m   destroyers and frigates (the 480 m class)
 *   scale 0.14   reaches ±100 m   corvettes and escorts (the ~200 m class)
 *
 * The scale factor multiplies BOTH region axes, so a chine that sits at y = 68 m on
 * the cruiser sits at y = 23 m on the destroyer set - which is roughly where a 480 m
 * hull's deck chine actually is. That is the whole reason a uniform scale is the
 * right transform here rather than a squeeze.
 *
 * The smaller sets are deliberately MINIMAL - one stripe, one hazard, one aperture -
 * both because §3 wants less detail rather than more and because those marks are
 * additionally visible on the big hull, near midships, where they read as extra
 * marking density on the superstructure rather than as a second ship's worth of
 * stencilling.
 *
 * STATED LIMITATION, in full: this does not make the marks CORRECT for a given class,
 * it makes them PLAUSIBLE at that class's size. A destroyer whose real chine is at
 * y = 18 m still gets a stripe at y = 23 m. Getting it right needs a per-class anchor
 * table and a per-class atlas, which needs either the draw budget to pay for it or a
 * texture array; both are named in the stream report.
 */
const MARK_SCALES = [1.0, 0.34, 0.14];

/**
 * EVERY MARK BELOW IS SIZED IN METRES, and this is the only reason the sizes are
 * checkable. The first pass sized them in region fractions and the numbers looked
 * modest — 0.13 x 0.042 of a region — right up until they were multiplied by 1600 m
 * and landed on the foredeck as a 208 x 67 m yellow smear. ship-language.md §4 caps
 * a hazard patch at 40 x 60 m and puts the glyph floor at 12 m; those are metres, so
 * these are metres.
 */
const PX_PER_M = MACRO_REGION / MACRO_DEFAULT_M;
const m = (metres) => metres * PX_PER_M;
const frac = (metres) => metres / MACRO_DEFAULT_M;

/**
 * Draw soot streaks running in `dir` (+1 = down the canvas) from a scatter of vent
 * points. Alpha accumulates, so overlapping streaks darken — which is what happens
 * under a vent that has been running for twenty years.
 */
function sootStreaks(ctx, size, rng, band, { count, dirY = 1, dirX = 0, lengthMin = 0.09, lengthMax = 0.30, width = 0.012, strength = 1 }) {
  for (let i = 0; i < count; i++) {
    // Vents are on the hull, so streaks START inside the band the hull occupies.
    // They are allowed to run OUT of it, because a streak that stops at a boundary
    // is the one thing that would give the projection away.
    const sx = (band.u0 + rng.next() * (band.u1 - band.u0)) * size;
    const sy = (band.v0 + rng.next() * (band.v1 - band.v0) * 0.7) * size;
    const len = (lengthMin + rng.next() * (lengthMax - lengthMin)) * size;
    const w = (width * (0.5 + rng.next())) * size;
    const ex = sx + dirX * len + (rng.next() - 0.5) * len * 0.16;
    const ey = sy + dirY * len;
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    const a = strength * (0.35 + rng.next() * 0.45);
    grad.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`);
    grad.addColorStop(0.35, `rgba(255,255,255,${(a * 0.55).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    // A streak is a wedge: wide where it leaves the vent, feathering out downstream.
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.5, sy);
    ctx.lineTo(sx + w * 0.5, sy);
    ctx.lineTo(ex + w * 1.6, ey);
    ctx.lineTo(ex - w * 1.6, ey);
    ctx.closePath();
    ctx.fill();
  }
}

/** A soft radial wash, for the exhaust bloom around a drive well. */
function sootWash(ctx, size, cx, cy, r, strength) {
  const g = ctx.createRadialGradient(cx * size, cy * size, 0, cx * size, cy * size, r * size);
  g.addColorStop(0, `rgba(255,255,255,${strength.toFixed(3)})`);
  g.addColorStop(0.55, `rgba(255,255,255,${(strength * 0.45).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/**
 * TWO MARK FAMILIES, AND THEY ARE NOT INTERCHANGEABLE.
 *
 *   ink      §4(c) functional markings — hull numbers, mount identifiers, the
 *            faction sigil, repair-patch outlines. Palette `marking.ink`: a near
 *            neutral, because a stencilled registry number is paint, not a warning.
 *   hazard   §4(a) structural edge stripes and §4(b) hazard zones. Palette
 *            `marking.hazardA`: the only saturated albedo allowed on the hull.
 *
 * They share the atlas's one free channel, so the family is encoded in the VALUE:
 * ink draws at 0.42, hazard at 1.0, and the shader classifies with a smoothstep
 * across 0.50-0.86. Stated honestly: bilinear filtering across the outer edge of a
 * hazard patch passes through the ink band for well under one texel, so a hazard
 * patch carries a sub-4 m lighter edging. That is a placard border, it is what real
 * hazard markings have, and it is cheaper than a second texture fetch.
 */
/**
 * Band order is INK < HAZARD < SENSOR and it is load-bearing, not alphabetical: a
 * mark's filtered outer edge ramps down through every band beneath it, so the family
 * with the largest painted area has to sit below the family whose colour it must not
 * be averaged towards. The full argument is in materials/hullShader.js#nadirMark.
 */
const INK_V = 0.42;
/**
 * HAZARD DRAWS AT 0.80, NOT 0.72, AND THE REASON IS THE FILTER, NOT THE PALETTE.
 *
 * The shader classifies the family from this value, and every hazard mark is a few
 * atlas texels wide, so what the shader actually sees is this value ATTENUATED by
 * bilinear filtering and by the mip chain. Measured on the generated atlas by running
 * the shader's own band functions over the alpha channel: at full resolution the
 * hazard family covers 0.143% of the atlas and after ONE 2x2 mip drop it covers
 * 0.057%, while the INK share goes 0.235% -> 0.402%. Two thirds of the ship's amber
 * was being reclassified as bone paint by the filter, which is precisely the measured
 * finding "the saturated accent is 0.61% of ship area ... the amber identity is not
 * actually on the ship".
 *
 * 0.80 keeps a filtered mark inside the hazard band down to 72% of its peak and is
 * still clear of the SENSOR floor (0.86), so nothing crosses families.
 */
const HAZ_V = 0.80;
const SENSOR_V = 1.0;

/**
 * THE NARROWEST HAZARD MARK THIS ATLAS CAN HOLD, IN METRES.
 *
 * A region is 384 texels over 1600 m, i.e. 4.17 m per texel, and a mark needs about
 * two and a half texels of core before bilinear magnification stops eating its peak
 * value. 11 m is 2.64 texels. Every hazard stroke below is floored at it.
 *
 * This is the third time this file has had to overrule a metre figure from
 * ship-language.md for the same mechanical reason - §4(a) caps a structural stripe at
 * "2-4 m", the previous pass took it to 7.5 m to survive the mip chain, and 7.5 m is
 * 1.8 texels, which does not. The document is written for a hull you are standing
 * next to. Recorded rather than quietly applied.
 */
const HAZ_MIN_M = 11;

/**
 * ---------------------------------------------------------------------------
 * THE DENSE BANDS, AS METRES OF HULL — ship-language.md §3
 * ---------------------------------------------------------------------------
 * "Dense greeble is concentrated in bands, never scattered. Budget: 8 to 11 bands on
 * the whole ship, each roughly 55 m x 200 m", and a band is only legal if it is at a
 * joint between two masses, inside a recess deeper than 8 m, around machinery, or on
 * functional edge structure.
 *
 * Ten bands. Each one is a RECESS first — `depth` is metres below the hull skin, and
 * every one of them clears §3's 8 m floor — with machinery blocks scattered on the
 * recess floor. That ordering is the rule the review quoted: cut the recess, then put
 * the greeble in it. Greeble on a proud face is noise; greeble in a hole
 * self-shadows, which is why it survives a flat key.
 *
 * PORT AND STARBOARD ARE NEVER LEVEL. §3: "If a band appears at port x = -114, it must
 * not appear at starboard x = +114 at the same z ... Offset the starboard equivalent
 * by >= 60 m in z or omit it entirely." Every pair below is offset by 90-150 m, and
 * two bands exist on one side only.
 *
 * `a` and `b` are the region's two projected axes in ship metres — (z, y) on a flank,
 * (x, z) on deck and belly, (x, y) on the stern — matching `regionMarks`.
 */
const STRUCTURE = {
  // +X starboard flank, (z, y)
  0: [
    // The waist / stern-block step: two masses meet, so fasteners and cable runs.
    { a0: -520, a1: -330, b0: -18, b1: 34, depth: 11, parts: 16 },
    // The bay rail meeting the keel. Functional edge structure.
    { a0: 40, a1: 190, b0: -58, b1: -14, depth: 9, parts: 12 },
    // The superstructure footing, starboard side.
    { a0: -190, a1: -70, b0: 18, b1: 58, depth: 10, parts: 10 },
  ],
  // -X port flank, (z, y). Every z offset >= 90 m from its starboard opposite.
  1: [
    { a0: -430, a1: -250, b0: -30, b1: 20, depth: 12, parts: 16 },
    { a0: -70, a1: 80, b0: -60, b1: -16, depth: 9, parts: 12 },
    // Port only: the radiator roots, which are hot and therefore busy (§4b).
    { a0: -600, a1: -470, b0: 10, b1: 56, depth: 10, parts: 14 },
  ],
  // +Y deck, (x, z)
  2: [
    // Drive and radiator roots where they come through the aft deck.
    { a0: -66, a1: 4, b0: -560, b1: -410, depth: 10, parts: 14 },
    // Foredeck service run, offset off the centreline so it is not symmetric.
    { a0: 22, a1: 78, b0: 130, b1: 300, depth: 9, parts: 11 },
  ],
  // -Y belly, (x, z)
  3: [
    // Keel machinery outboard of the bay, port side only.
    { a0: -146, a1: -92, b0: -430, b1: -290, depth: 11, parts: 12 },
  ],
  4: [],
  // -Z stern, (x, y). The aux bell collar; the drive well itself is cut separately.
  5: [
    { a0: -152, a1: -96, b0: -18, b1: 42, depth: 10, parts: 10 },
  ],
};

/**
 * THE STRUCTURE CHANNEL: recesses, frames and machinery, in metres of relief.
 *
 * Drawn greyscale where 0.5 is the hull skin. `RELIEF_M` has to agree with
 * `HULL_MACRO_DEFAULTS.reliefM` in materials/hullShader.js — it is imported rather
 * than repeated for the same reason `MACRO_DEFAULT_M` is: two copies of a scale
 * factor is a bug waiting for someone to change one of them.
 *
 * @param {CanvasRenderingContext2D} ctx
 */
function regionStructure(ctx, size, rng, { region }) {
  const flip = AXIS_FLIP[region];
  const X = (a) => (0.5 + (flip * a) / MACRO_DEFAULT_M) * size;
  const Y = (b) => (1 - (0.5 + b / MACRO_DEFAULT_M)) * size;
  /** Metres of relief (+ proud, − sunk) -> the greyscale value to draw. */
  const H = (metres) => {
    const v = Math.max(0, Math.min(1, 0.5 + metres / MACRO_RELIEF_M));
    const c = Math.round(v * 255);
    return `rgb(${c},${c},${c})`;
  };

  ctx.fillStyle = H(0);
  ctx.fillRect(0, 0, size, size);

  /**
   * THE 180 m STRUCTURAL FRAME, AS RELIEF RATHER THAN AS A VALUE BAND.
   *
   * D45 is open because the previous pass could only put this rhythm in the albedo,
   * where it is a stripe rather than a rib. With G carrying height it can be what §7
   * actually specifies: a proud transverse frame at every station, 7 m of relief and
   * about 9 m wide, which shades on one side and catches the key on the other and
   * therefore survives to the LOD1 switch. It is still not GEOMETRY — a real ring
   * would break the silhouette, and that stays geometry's to build — but it is no
   * longer a painted line.
   */
  const alongU = region === 0 || region === 1;
  const alongV = region === 2 || region === 3;
  if (alongU || alongV) {
    const halfW = m(4.5);
    for (let station = -720; station <= 720; station += FRAME_M) {
      ctx.fillStyle = H(7);
      if (alongU) ctx.fillRect(X(station) - halfW, 0, halfW * 2, size);
      else ctx.fillRect(0, Y(station) - halfW, size, halfW * 2);
      // A frame is a rib with a shadow gap either side of it, not a bar glued on.
      ctx.fillStyle = H(-2.2);
      if (alongU) {
        ctx.fillRect(X(station) - halfW - m(2.6), 0, m(2.6), size);
        ctx.fillRect(X(station) + halfW, 0, m(2.6), size);
      } else {
        ctx.fillRect(0, Y(station) - halfW - m(2.6), size, m(2.6));
        ctx.fillRect(0, Y(station) + halfW, size, m(2.6));
      }
    }
  }

  // --- the dense bands ------------------------------------------------------
  for (const band of (STRUCTURE[region] ?? [])) {
    const x0 = Math.min(X(band.a0), X(band.a1));
    const x1 = Math.max(X(band.a0), X(band.a1));
    const y0 = Math.min(Y(band.b0), Y(band.b1));
    const y1 = Math.max(Y(band.b0), Y(band.b1));
    const w = x1 - x0, h = y1 - y0;

    // A raised coaming around the opening. Every real hatch has one and it is what
    // stops the recess reading as a decal: the rim catches the key from any side.
    ctx.fillStyle = H(3.4);
    ctx.fillRect(x0 - m(4), y0 - m(4), w + m(8), h + m(8));
    // The recess floor.
    ctx.fillStyle = H(-band.depth);
    ctx.fillRect(x0, y0, w, h);

    // Machinery ON THE FLOOR of the recess. Everything here stays BELOW the hull
    // skin, so nothing in the band is ever proud of the plate around it - which is
    // the review's complaint about the one dense element that did exist: "it is proud
    // of the surface rather than sunk into a recess, so it cannot self-shadow".
    const br = rng.fork(`band:${region}:${band.a0}`);
    for (let i = 0; i < band.parts; i++) {
      const pw = m(6 + br.next() * 15);
      const ph = m(5 + br.next() * 12);
      const px = x0 + br.next() * Math.max(1, w - pw);
      const py = y0 + br.next() * Math.max(1, h - ph);
      // Blocks rise from the floor towards - but never to - the skin.
      const rise = band.depth * (0.25 + br.next() * 0.55);
      ctx.fillStyle = H(-band.depth + rise);
      ctx.fillRect(px, py, pw, ph);
      // A darker face on one side of each block, so even the parts self-shadow.
      ctx.fillStyle = H(-band.depth + rise * 0.35);
      ctx.fillRect(px, py + ph * 0.72, pw, ph * 0.28);
    }
    // Two or three conduits running out of the band and onto the hull. This is what
    // makes a band read as connected to the ship rather than pasted onto it.
    const runs = 2 + br.int(0, 1);
    for (let i = 0; i < runs; i++) {
      const t = (i + 0.5) / runs;
      ctx.fillStyle = H(1.8);
      if (w > h) ctx.fillRect(x0 + w * t, y1, m(3.2), m(18 + br.next() * 40));
      else ctx.fillRect(x1, y0 + h * t, m(18 + br.next() * 40), m(3.2));
    }
  }

  // --- the named holes ------------------------------------------------------
  // §4's recess-colour rule and §5's "a genuinely open bay you can see through" both
  // want these to be DEEP. They are cut here as well as in geometry so the surface
  // treatment agrees with the shape.
  if (region === 3) {
    const B = SHIP.bay;
    const bx0 = Math.min(X(-B.x), X(B.x)), bx1 = Math.max(X(-B.x), X(B.x));
    const by0 = Math.min(Y(B.z0), Y(B.z1)), by1 = Math.max(Y(B.z0), Y(B.z1));
    ctx.fillStyle = H(4.2);
    ctx.fillRect(bx0 - m(9), by0 - m(9), bx1 - bx0 + m(18), by1 - by0 + m(18));
    ctx.fillStyle = H(-19);
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // The four uneven transverse frames from §5 - 96 / 62 / 104 / 58 m, never equal.
    let z = B.z1;
    for (const bay of [96, 62, 104, 58]) {
      z -= bay;
      ctx.fillStyle = H(-6);
      ctx.fillRect(bx0, Y(z) - m(3.5), bx1 - bx0, m(7));
    }
  }
  if (region === 5) {
    ctx.fillStyle = H(3.0);
    ctx.beginPath();
    ctx.arc(X(0), Y(0), m(SHIP.driveWell.r + 12), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = H(-17);
    ctx.beginPath();
    ctx.arc(X(0), Y(0), m(SHIP.driveWell.r), 0, Math.PI * 2);
    ctx.fill();
  }
  if (region === 2) {
    // The dorsal cutaway between the ribs, z -480..-300 (§2's negative space).
    ctx.fillStyle = H(-13);
    ctx.fillRect(X(-78), Y(-300), X(78) - X(-78), Y(-480) - Y(-300));
    for (let i = 0; i < 5; i++) {
      const zr = -480 + (i + 0.5) * (180 / 5);
      ctx.fillStyle = H(4.5);
      ctx.fillRect(X(-78), Y(zr) - m(5), X(78) - X(-78), m(10));
    }
  }
  if (region === 1) {
    // §5 identity: the exposed rib section where the skin is missing. A recess with
    // the frames still standing in it, which is a different thing from a hatch.
    ctx.fillStyle = H(-14);
    ctx.fillRect(X(SHIP.ribsZ) - m(52), Y(44), m(104), Y(-34) - Y(44));
    for (let i = 0; i < 4; i++) {
      const a = SHIP.ribsZ + (i - 1.5) * 22;
      ctx.fillStyle = H(2.5);
      ctx.fillRect(X(a) - m(2.6), Y(44), m(5.2), Y(-34) - Y(44));
    }
    // §5 identity: the captured armour plate, wired on 7 degrees off the plate grid.
    // Proud, because it is someone else's plate laid ON TOP of ours.
    ctx.save();
    ctx.translate(X(SHIP.patchZ), Y(4));
    ctx.rotate(7 * Math.PI / 180);
    ctx.fillStyle = H(2.8);
    ctx.fillRect(-m(45), -m(23), m(90), m(46));
    ctx.restore();
  }
}

/**
 * Marks for one region, placed at named hull features.
 *
 * @param {CanvasRenderingContext2D} ctx  draws in mark VALUE, greyscale
 */
function regionMarks(ctx, size, rng, { region, faction, scale = 1 }) {
  /**
   * Ship metres on the region's first axis -> canvas x. See AXIS_FLIP.
   * `scale` shrinks the whole anchor table onto a smaller hull class - see
   * MARK_SCALES. At scale 1 these are identical to what they always were.
   */
  const flip = AXIS_FLIP[region];
  const X = (a) => (0.5 + (flip * a * scale) / MACRO_DEFAULT_M) * size;
  /** Ship metres on the second axis -> canvas y. three flips the texture. */
  const Y = (b) => (1 - (0.5 + (b * scale) / MACRO_DEFAULT_M)) * size;
  const V = (v) => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;
  /** Every size in metres shrinks with the anchor table, or a corvette wears a
   *  cruiser's 8 m stripe on a 30 m flank. */
  const ms = (metres) => m(metres * scale);

  /**
   * §4(a): a stripe running ALONG a real geometric edge, 2-4 m wide, 40-260 m long,
   * starting and ending at a structural break. Stated in ship metres on both axes,
   * so it cannot drift off the edge it is following.
   */
  /**
   * WIDTH WENT 3.2 m -> 7.5 m, AND THE REASON IS THE MIP CHAIN, NOT TASTE.
   *
   * Round-two review, MAJOR: "the marks are too small and too low-contrast to survive
   * the mip chain; size at least one structural edge stripe so it is visible at the
   * default 3200 m camera". §0's table gives 3.0 m per pixel at that camera, so a
   * 3.2 m stripe was ONE pixel wide — and one pixel of a 3-pixel-minimum feature,
   * antialiased against a hull twice its value, is a faint grey smudge. At 7.5 m it is
   * 2.5 px at the default camera and still 1.9 px at the LOD1 switch, which is the
   * width at which a line reads as a line.
   *
   * §4(a) caps a stripe at "2-4 m" — that cap is written for a hull you are standing
   * next to and it is overruled here deliberately, because the game is played at
   * 3.2 km and a rule that makes the mark invisible at the only distance anyone sees
   * it is not serving its own purpose. Recorded rather than quietly ignored.
   */
  const edgeStripe = (a0, a1, b, widthM = HAZ_MIN_M) => {
    const w = Math.max(HAZ_MIN_M, widthM);
    const x0 = X(Math.min(a0, a1)), x1 = X(Math.max(a0, a1));
    ctx.fillStyle = V(HAZ_V);
    ctx.fillRect(x0, Y(b) - ms(w) * 0.5, x1 - x0, Math.max(1, ms(w)));
  };

  /** The same, running along the OTHER axis (a vertical edge in this projection). */
  const edgeStripeV = (a, b0, b1, widthM = HAZ_MIN_M) => {
    const w = Math.max(HAZ_MIN_M, widthM);
    const y0 = Y(Math.max(b0, b1)), y1 = Y(Math.min(b0, b1));
    ctx.fillStyle = V(HAZ_V);
    ctx.fillRect(X(a) - ms(w) * 0.5, y0, Math.max(1, ms(w)), y1 - y0);
  };

  /**
   * §4(b) AN ACCESS HATCH — the orange family's most common member and the reason
   * the semantic rule pays for itself.
   *
   * Drawn as an OUTLINE with a hinge bar and two dogs, never a fill: a filled orange
   * rectangle mid-face is the model-kit signature §4 exists to prevent, and a hatch
   * is a rim and a mechanism, not a painted panel. At 14 x 10 m it is a personnel
   * access big enough for a suited crew and a toolbox, and it is 4.7 x 3.3 px at the
   * default 3200 m camera - a mark, not a smear.
   */
  /**
   * A 2.4 m OUTLINE IS 0.58 OF ONE ATLAS TEXEL AND IT NEVER RENDERED AS ORANGE.
   *
   * The outline was the right instinct and the wrong instrument. At 4.17 m/texel a
   * 2.4 m stroke cannot carry the hazard value past bilinear filtering, so all five
   * of these hatches were drawing a faint bone smudge — the mark existed in the atlas
   * and did not exist in the frame. Verified by running the shader's own band
   * functions over the atlas: see the note on HAZ_V.
   *
   * So the hatch becomes a small SOLID panel with a dark slot down one side. 13 x 9 m
   * is 3.1 x 2.2 texels, which resolves, and it is 117 m^2 on a 3.9 million m^2 hull —
   * this is a MARK, not the "arbitrary whole face" §4 forbids. The slot is what keeps
   * it from reading as a sticker: a hatch has a hinge line and a dogged edge.
   */
  const accessHatch = (a, b, wM = 13, hM = 9) => {
    const w = ms(wM), h = ms(hM);
    const x = X(a) - w * 0.5, y = Y(b) - h * 0.5;
    ctx.save();
    ctx.fillStyle = V(HAZ_V);
    ctx.fillRect(x, y, w, h);
    // The hinge slot: unmarked hull, so the panel reads as two leaves rather than
    // as one painted rectangle.
    ctx.fillStyle = V(0);
    ctx.fillRect(x + w * 0.46, y, Math.max(1, ms(2.2)), h);
    ctx.restore();
  };

  /**
   * §4 SENSORS ARE WHITE. An aperture ring with a cross-hair, in the bone family, so
   * a sensor face is recognisable as a sensor face before any label is read. Kept to
   * an OUTLINE for the same reason the hatch is: a filled white disc on a bone hull
   * is a blown highlight, and an aperture is a hole with a rim.
   */
  const sensorAperture = (a, b, rM = 11) => {
    const r = ms(rM);
    ctx.save();
    ctx.strokeStyle = V(SENSOR_V);
    ctx.lineWidth = Math.max(1, ms(2.2));
    ctx.beginPath();
    ctx.arc(X(a), Y(b), Math.max(1.2, r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(a) - r * 1.35, Y(b));
    ctx.lineTo(X(a) + r * 1.35, Y(b));
    ctx.stroke();
    ctx.restore();
  };

  /** §4 SENSORS ARE WHITE — a flat phased array, drawn as its own outline plus the
   *  element rows inside it. The other half of the sensor vocabulary. */
  const sensorArray = (a, b, wM = 34, hM = 16) => {
    const w = ms(wM), h = ms(hM);
    const x = X(a) - w * 0.5, y = Y(b) - h * 0.5;
    ctx.save();
    ctx.strokeStyle = V(SENSOR_V);
    ctx.lineWidth = Math.max(1, ms(2.2));
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = V(SENSOR_V);
    const rows = 3;
    for (let i = 0; i < rows; i++) {
      ctx.fillRect(x + w * 0.10, y + h * (i + 0.7) / (rows + 0.6), w * 0.80, Math.max(1, ms(1.6)));
    }
    ctx.restore();
  };

  /**
   * §4(b): 45-degree bars at something that moves, opens, fires or gets hot.
   * Centred on a named feature. The pitch is 16 m rather than the document's 6 m
   * because 6 m is 1.4 texels here and would alias into a flat wash — the honest
   * trade is a coarser bar that resolves over a finer one that does not.
   */
  /**
   * The bar colour is 0xb8b8b8, not 0xffffff, because the value IS the family: 184/255
   * is 0.72, the HAZARD band. White would classify as SENSOR and paint every access
   * marking on the ship bone instead of orange. See the band table above.
   */
  const HAZ_HEX = 0xb8b8b8;
  const hazardAt = (a, b, wM, hM, pitchM = 16) => {
    hazardStripes(ctx, X(a) - ms(wM) * 0.5, Y(b) - ms(hM) * 0.5, ms(wM), ms(hM), {
      a: HAZ_HEX, b: 0x000000, period: Math.max(2, ms(pitchM)), angle: Math.PI / 4,
    });
  };

  /**
   * ---------------------------------------------------------------------------
   * §4's ACCENT BUDGET IS 3.5% AND THE SHIP WAS SPENDING 0.61%
   * ---------------------------------------------------------------------------
   * Blocker, art direction: "The saturated accent is 0.61% of ship area against a
   * 3.5% budget and a 1.8-7.0% reference range. The amber identity is not actually on
   * the ship. Spend it where it has a REASON: bay door arc, grapple rails, drive-well
   * rim, radiator roots, cutter yoke shoulders."
   *
   * Every mark added below is on one of those five, and every one of them is an
   * EDGE, a RAIL or a RIM — never a fill on an open face, which is the model-kit read
   * §4 exists to prevent and which this file's own `trim` history was failed on.
   *
   * `rail` is the shape that was missing from the vocabulary. A stripe follows a
   * chine; a hazard patch marks a zone; a RAIL is the painted track something runs
   * on, and it is drawn as two thin lines with a gap, because that is what a track
   * with a slot down the middle looks like from three kilometres and it costs half
   * the saturated area a solid bar would.
   */
  const rail = (a0, a1, b, widthM = HAZ_MIN_M, gapM = 16.0) => {
    const w = Math.max(HAZ_MIN_M, widthM);
    const x0 = X(Math.min(a0, a1)), x1 = X(Math.max(a0, a1));
    ctx.fillStyle = V(HAZ_V);
    for (const s of [-1, 1]) {
      ctx.fillRect(x0, Y(b + s * gapM * 0.5) - ms(w) * 0.5, x1 - x0, Math.max(1, ms(w)));
    }
  };

  /** The same rail, running along the region's SECOND axis. */
  const railV = (a, b0, b1, widthM = HAZ_MIN_M, gapM = 16.0) => {
    const w = Math.max(HAZ_MIN_M, widthM);
    const y0 = Y(Math.max(b0, b1)), y1 = Y(Math.min(b0, b1));
    ctx.fillStyle = V(HAZ_V);
    for (const s of [-1, 1]) {
      ctx.fillRect(X(a + s * gapM * 0.5) - ms(w) * 0.5, y0, Math.max(1, ms(w)), y1 - y0);
    }
  };

  /**
   * A RIM: a hazard annulus that follows a circular opening instead of sitting beside
   * it. The drive well is the hottest thing on the ship and its rim is the one place
   * on a hull where a broad painted band is not decoration.
   */
  const rimBand = (rM, widthM, segments = 24) => {
    ctx.save();
    ctx.strokeStyle = V(HAZ_V);
    ctx.lineWidth = Math.max(1, ms(Math.max(HAZ_MIN_M, widthM)));
    // Dashed, so it reads as a marked rim rather than as a solid ring: half the
    // saturated area of a continuous band for the same read.
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = t0 + (Math.PI * 2 / segments) * 0.52;
      ctx.beginPath();
      ctx.arc(X(0), Y(0), Math.max(1.2, ms(rM)), t0, t1);
      ctx.stroke();
    }
    ctx.restore();
  };

  /**
   * §4(c): a functional marking. Glyph height floor is 12 m and the CEILING is what
   * round two got wrong.
   *
   * Review, MAJOR: "The number is roughly 35-40 m tall — about 3x §4(c)'s 12 m
   * minimum — rendered soft and airbrushed rather than stencilled, and it sits in the
   * middle of a flat flank crossing nothing structural ... because the ship carries
   * no other marking it is the largest single graphic element on a 1400 m hull."
   *
   * All three clauses are addressed separately, because they are three different
   * mistakes. SIZE: 14 m, just over the floor. EDGE: the atlas is 4.17 m/texel, so a
   * 14 m glyph is 3.4 texels tall and its stroke is well under one — no amount of
   * hardening saves that. The glyph is therefore drawn at 3x into a scratch canvas and
   * downsampled with `imageSmoothingEnabled = false`, which keeps the stroke a hard
   * step instead of a two-texel ramp. PLACE: the callers now pass a station on the
   * deck chine rather than mid-flank.
   */
  const codeAt = (a, b, heightM, text = null) => {
    const s = text ?? hullCode(rng, faction);
    const cell = Math.max(1, ms(heightM) / 7);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = V(INK_V);
    drawText(ctx, s, X(a), Y(b), cell, { align: 'center', baseline: 'middle' });
    ctx.restore();
  };

  /**
   * §5: the captured armour plate, wired on at 7 degrees off the hull's plate grid.
   * Drawn as an OUTLINE with a fastener row, never a fill — a filled rectangle that
   * stops in the middle of a face is the exact model-kit signature §4 describes, and
   * an outline reads as a plate edge because that is what a plate edge is.
   */
  const patchOutline = (a, b, wM, hM, deg) => {
    ctx.save();
    ctx.translate(X(a), Y(b));
    ctx.rotate(deg * Math.PI / 180);
    ctx.strokeStyle = V(INK_V);
    ctx.lineWidth = Math.max(1, ms(2.2));
    ctx.strokeRect(-ms(wM) * 0.5, -ms(hM) * 0.5, ms(wM), ms(hM));
    // Fasteners along the two long edges: this is what "wired on" looks like.
    ctx.fillStyle = V(INK_V);
    const step = ms(9);
    for (let x = -ms(wM) * 0.5 + step * 0.5; x < ms(wM) * 0.5; x += step) {
      for (const y of [-ms(hM) * 0.5, ms(hM) * 0.5]) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, ms(1.6)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  /** §5: exposed rib section — the skin is missing and you can see the frames. */
  const ribs = (aCentre, b0, b1, count, pitchM) => {
    ctx.fillStyle = V(INK_V);
    for (let i = 0; i < count; i++) {
      const a = aCentre + (i - (count - 1) * 0.5) * pitchM;
      ctx.fillRect(X(a) - ms(2.4), Y(Math.max(b0, b1)), ms(4.8), Math.abs(Y(b1) - Y(b0)));
    }
  };

  /**
   * THE SMALLER HULL CLASSES GET A MINIMAL SET, NOT A COPY OF THE CRUISER'S.
   *
   * At scale < 1 this is everything that is drawn: one chine edge stripe, one access
   * hatch and one sensor aperture per flank, and one hazard on the deck and belly.
   * Three marks per face is the density §3 wants on a 480 m hull and it is all a
   * self-similar set can honestly claim to place - the cruiser's bay rails, drive
   * well and rib section are features a destroyer does not have and must not wear.
   */
  if (scale < 1) {
    switch (region) {
      case 0:
        edgeStripe(-40, 260, SHIP.deckChine - 9, 8.0);
        accessHatch(120, SHIP.deckChine - 40);
        sensorAperture(SHIP.sensor.bridgeZ, SHIP.sensor.apertureY, 11);
        break;
      case 1:
        edgeStripe(-330, -60, SHIP.keel + 10, 7.0);
        accessHatch(-210, SHIP.keel + 40);
        break;
      case 2:
        hazardAt(0, SHIP.mounts.dorsalZ, 40, 26, 13);
        sensorArray(0, SHIP.sensor.bridgeZ, 34, 16);
        break;
      case 3:
        accessHatch(0, -60, 20, 14);
        break;
      default: break;
    }
    return;
  }

  switch (region) {
    // ---- 0: +X starboard flank, projection (z, y) --------------------------
    case 0:
      /**
       * §4(a) THE ONE STRIPE THAT HAS TO SURVIVE THE DEFAULT CAMERA.
       *
       * It follows the deck chine — a real geometric edge, the one that carries the
       * running lights — and it starts and stops at real breaks: the shoulder at
       * z = -40 (maximum hull beam, §7) and the forebody plate break at z = +260
       * where the taper begins. 300 m long, 8 m wide. This is the Hiigaran
       * destroyer's stripe and it is the ship's only colour identity at 3 km.
       */
      edgeStripe(-40, 260, SHIP.deckChine - 9, 8.0);
      // A short return down the shoulder, so the stripe visibly TURNS at a structural
      // corner rather than fading out in the middle of a plate.
      edgeStripeV(-40, SHIP.deckChine - 9, SHIP.deckChine - 42, 8.0);
      /**
       * §4(a) THE KEEL CHINE, STARBOARD. A hull has two chines and the accent budget
       * was being spent on one of them per side. The span is 100..430, which is clear
       * of the port keel run (-330..-60) by 160 m, so §3's "never level, offset the
       * opposite side by >= 60 m" holds on this edge as it does on every other.
       */
      edgeStripe(100, 430, SHIP.keel + 10, 8.0);
      /**
       * §4(b) THE STARBOARD GRAPPLE RAIL. The arms move along it, which is the whole
       * reason the colour is allowed here. Drawn as a track, not a bar - see `rail`.
       */
      rail(SHIP.grappleRail.stbd[0], SHIP.grappleRail.stbd[1], SHIP.grappleRail.y, 5.0, 9.0);
      // §4(c) registry code, small and hung off the chine rather than floating.
      codeAt(200, SHIP.deckChine - 34, 14);
      // §4(b) the starboard grapple pivots — arms move. Note these are at DIFFERENT
      // z from the port ones (§5), so the two flanks are never mirror-matched.
      hazardAt(SHIP.grappleStbd[1], -58, 34, 20, 12);
      /**
       * ORANGE = ACCESS. Two hatches on the starboard flank, at the two places a
       * hull has them: the superstructure footing and the machinery band aft. Both
       * sit inside a STRUCTURE band declared above, so the mark is on the recess it
       * describes rather than in the middle of an armour belt.
       */
      accessHatch(-140, 32);
      accessHatch(-430, 4);
      // WHITE = SENSORS. The bridge's flank aperture, on the superstructure.
      sensorAperture(SHIP.sensor.bridgeZ + 46, SHIP.sensor.apertureY, 10);
      break;

    // ---- 1: -X port flank, projection (z, y) -------------------------------
    case 1:
      // A different edge run from starboard, and along the KEEL chine rather than
      // the deck chine, so the two flanks do not read as one repeated treatment.
      edgeStripe(-330, -60, SHIP.keel + 10, 7.0);
      // §4(a) the deck chine on THIS side too, over a span 220 m clear of starboard's
      // (-40..260), so both chines are marked on both flanks and no two runs are
      // opposite one another.
      edgeStripe(-560, -260, SHIP.deckChine - 9, 8.0);
      // §4(b) the port grapple rail. Different z from starboard's, like the pivots.
      rail(SHIP.grappleRail.port[0], SHIP.grappleRail.port[1], SHIP.grappleRail.y, 5.0, 9.0);
      /**
       * §4(b) THE RADIATOR ROOTS. This flank's STRUCTURE band (a -600..-470) is the
       * radiator root recess; a heat-rejection root is hot, is serviced, and is
       * exactly what the access family describes. One hatch at each end of the run
       * rather than a wash over it.
       */
      hazardAt(-588, 33, 26, 40, 12);
      hazardAt(-484, 33, 26, 40, 12);
      // Port carries the mount identifier rather than the registry, at the pad.
      codeAt(-300, SHIP.keel + 34, 13, 'M4');
      hazardAt(SHIP.grapplePort[0], -58, 34, 20, 12);
      // §5 identity: the repair made with someone else's plate, 7 degrees off grid.
      patchOutline(SHIP.patchZ, 4, 86, 44, 7);
      // §5 identity: the ship is not finished and never will be.
      ribs(SHIP.ribsZ, -30, 40, 4, 22);
      // ORANGE = ACCESS. The port radiator-root band is the hottest, most serviced
      // part of this flank (STRUCTURE region 1 cuts a recess there), so it gets the
      // pair; the second is at the bay rail, offset well clear of starboard's.
      accessHatch(-534, 30);
      accessHatch(10, -38);
      break;

    // ---- 2: +Y deck, projection (x, z) -------------------------------------
    case 2:
      // §4(b) mount pads: something is bolted on here and it gets craned in.
      hazardAt(0, SHIP.mounts.dorsalZ, 40, 26, 13);
      hazardAt(0, SHIP.mounts.bowZ, 32, 22, 12);
      /**
       * §4(b) THE CUTTER YOKE SHOULDERS. The bow mount is where the salvage yoke
       * bolts on and where its shoulders take the load, so the pad carries a marked
       * shoulder either side of the mount itself. Two blocks, not one band, because
       * the load path is two shoulders.
       */
      hazardAt(-38, SHIP.mounts.bowZ, 20, 30, 11);
      hazardAt(38, SHIP.mounts.bowZ, 20, 30, 11);
      // §4(b) the drive-well approach on the aft deck — exhaust.
      hazardAt(-42, SHIP.sternBlock + 40, 30, 20, 12);
      /**
       * §4(b) THE RADIATOR ROOTS WHERE THEY COME THROUGH THE DECK. STRUCTURE region 2
       * cuts the recess at x -66..4, z -560..-410; these are the two service rails
       * running down either side of it. Rails, because a radiator is withdrawn along
       * them when it is changed out.
       */
      edgeStripeV(-31 - 40, -560, -410, 5.0);
      edgeStripeV(-31 + 40, -560, -410, 5.0);
      /**
       * §4(c) the sigil, on the foredeck where a crew would paint it.
       *
       * The colour argument is 0x6b6b6b and not 0xffffff, and that is not cosmetic:
       * `factionSigil` sets its own fillStyle from this hex, so passing white would
       * write mark value 1.0 and the shader would classify the sigil as HAZARD and
       * paint the ship's own insignia in safety amber. 0x6b6b6b is luminance 0.42,
       * which is INK_V. Setting ctx.fillStyle before the call does nothing - the
       * function overrides it.
       */
      factionSigil(ctx, faction, X(0), Y(430), ms(16), 0x6b6b6b);
      /**
       * WHITE = SENSORS, and the deck is where they live. The bridge-roof array and
       * the foredeck array, plus one aperture between them. These are the only three
       * white marks on the upper half of the ship, which is the point: a single
       * consistent colour applied to a single consistent function is legible at a
       * glance in a way that a mixed palette of decoration never is.
       *
       * `arrayZ` is 380 m, i.e. 320 m short of the stem, so §3's "no detail in the
       * forward 200 m" is respected with 120 m to spare.
       */
      sensorArray(0, SHIP.sensor.bridgeZ, 40, 18);
      sensorArray(34, SHIP.sensor.arrayZ, 30, 14);
      sensorAperture(-30, SHIP.sensor.arrayZ - 90, 9);
      // ORANGE = ACCESS. The engine-mount pad's service hatch, off the centreline.
      accessHatch(48, SHIP.mounts.engineZ + 70, 16, 11);
      break;

    // ---- 3: -Y belly, projection (x, z) ------------------------------------
    case 3: {
      // §4(a)+(b) the bay door swing arc. Both rails and both transverse frames,
      // following the real 210 x 320 m opening rather than floating near it. This is
      // the largest single marking on the ship and every metre of it is on an edge.
      const B = SHIP.bay;
      edgeStripeV(B.x, B.z0, B.z1, 7.5);
      edgeStripeV(-B.x, B.z0, B.z1, 7.5);
      edgeStripe(-B.x, B.x, B.z1, 7.5);
      // The aft lip of the opening was unmarked while the forward one was. Both ends
      // of a 320 m door aperture are a structural break.
      edgeStripe(-B.x, B.x, B.z0, 7.5);
      hazardAt(B.x - 26, B.z1 - 24, 34, 22, 12);
      hazardAt(-B.x + 26, B.z0 + 24, 34, 22, 12);
      /**
       * §4(b) THE DOOR SWING ARC — the largest single reason the accent budget
       * exists. A 320 m door leaf sweeps outboard of each rail, and the band it
       * sweeps is painted because standing in it while the bay cycles kills you.
       * Hatched rather than filled, so it is a marked zone and not a coloured panel,
       * and offset outboard of the rail so it does not double the rail's own width.
       */
      hazardAt(B.x + 24, 0, 20, 300, 14);
      hazardAt(-B.x - 24, 0, 20, 300, 14);
      // ORANGE = ACCESS. Two keel hatches outboard of the bay, at different z so the
      // belly is not mirror-matched either (§3).
      accessHatch(-B.x - 40, -120, 16, 12);
      accessHatch(B.x + 40, 40, 16, 12);
      break;
    }

    // ---- 4: +Z bow ---------------------------------------------------------
    // NOTHING. §3 forbids detail in the forward 200 m: the prow's job is
    // convergence and it is the region most often silhouetted against a celestial.
    case 4: break;

    // ---- 5: -Z stern, projection (x, y) ------------------------------------
    case 5: {
      // §4(b) the drive-well rim is hot. An annulus, drawn as eight bars around the
      // real 62 m radius, so it follows the rim instead of sitting beside it.
      const r = SHIP.driveWell.r;
      /**
       * §4(b) THE DRIVE-WELL RIM. Eight 15 m patches scattered around a 62 m radius
       * read as eight patches; a dashed band ON the radius reads as a marked rim, and
       * the rim is the thing that is hot. Four of the patches stay, at the quarters,
       * as the tie-down points a rim band does not describe.
       */
      rimBand(r, 12, 22);
      for (let i = 0; i < 4; i++) {
        const t = (i / 4) * Math.PI * 2 + Math.PI / 4;
        hazardAt(Math.cos(t) * r, Math.sin(t) * r, 15, 15, 7);
      }
      // §4(c) the stern block carries the ship's number where a tug can read it.
      codeAt(-96, 44, 14);
      break;
    }
    default: break;
  }
}

/**
 * THE 180 m STRUCTURAL FRAME RHYTHM, AS A VALUE BAND THAT SURVIVES MIPS.
 *
 * Round-one review: "At the everyday playing view all surface detail has vanished.
 * The hull is flat untextured grey with facet shading only — no panel line, no plate
 * break, no macro value drift survives the mip drop. §3's second, coarser 180 m
 * structural frequency is not visible in the render at any distance I looked at."
 *
 * The review's own fix — make it geometry, a real proud frame ring at each station —
 * is right and is the geometry stream's to make; it is raised in this stream's report
 * and nothing here substitutes for it.
 *
 * What CAN be done here, and is: put the rhythm in the macro layer rather than in the
 * tiling detail map. The tiling map is addressed at metres/tileM and mips away as
 * soon as a tile falls under a few pixels. The macro layer is addressed in OBJECT
 * SPACE at 4.17 m/texel and is sampled once from stem to stern, so a 180 m feature in
 * it is 43 texels wide — it is still 43 texels wide at every LOD, and at the
 * three-quarter camera (roughly 4 m/px) it resolves one-to-one. A value band cannot
 * mip out of existence the way a 0.26 m groove can.
 *
 * The band is deliberately shallow (a few percent) plus a narrow darker line on the
 * station itself. It is a rhythm, not a stripe: at 180 m over a 1400 m hull that is
 * seven and a bit stations, which is the frame spacing §7 specifies.
 *
 * Applied only to the four regions with a fore-aft axis. On the bow and stern faces
 * "along the ship" is out of the page and a rhythm there would be a bullseye.
 */
const FRAME_M = 180;

function frameRhythm(driftField, R, region) {
  // Which of the region's two axes is the ship's z. Flanks project (z, y) so it is
  // the U axis; deck and belly project (x, z) so it is the V axis.
  const alongU = region === 0 || region === 1;
  const alongV = region === 2 || region === 3;
  if (!alongU && !alongV) return;

  const perTexel = MACRO_DEFAULT_M / R;               // metres per texel
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      // Ship-space metres along the fore-aft axis. Canvas row 0 is v = 1, hence the
      // flip on the V case: this has to agree with X()/Y() in regionMarks or the
      // frame lines would sit between the marks rather than under them.
      // The same AXIS_FLIP the marks use: on region 0 the first axis is -z, so a
      // station at z = -400 is on the opposite side of the texture from region 1's.
      // Without this the frame lines and the marks would disagree about where
      // midships is on the starboard flank.
      const zM = alongU
        ? AXIS_FLIP[region] * ((x + 0.5) * perTexel - MACRO_DEFAULT_M * 0.5)
        : (1 - (y + 0.5) / R) * MACRO_DEFAULT_M - MACRO_DEFAULT_M * 0.5;
      const phase = zM / FRAME_M;
      const f = phase - Math.floor(phase);            // 0..1 within one frame bay
      // A shallow saw across the bay: each bay is very slightly brighter at its
      // forward end, which is what a real frame does to the plating it stiffens.
      const bay = (f - 0.5) * 0.055;
      // The station itself: a 5 m darker line, one and a bit texels wide.
      const d = Math.min(f, 1 - f) * FRAME_M;         // metres to the nearest station
      const station = d < 5 ? (1 - d / 5) * 0.10 : 0;
      const i = y * R + x;
      driftField[i] = Math.max(0, Math.min(1, driftField[i] + bay - station));
    }
  }
}

/**
 * Build the macro atlas.
 * @param {Object} o
 * @param {import('../../core/rng.js').RNG} o.rng
 * @returns {{texture:THREE.Texture, regionPx:number, cols:number, rows:number}}
 */
export function macroField(opts = {}) {
  const o = { ...MACRO_DEFAULTS, ...opts };
  const { rng } = o;
  if (!rng) throw new Error('[macroField] needs an rng');
  getFactionPalette(o.faction);          // validate early, throw at build not at draw

  const R = MACRO_REGION;
  const W = R * MACRO_COLS;
  const H = R * MACRO_ROWS;
  const bytes = new Uint8ClampedArray(W * H * 4);

  // Scratch canvases reused across regions: soot and ink are drawn with the 2D API
  // and read back, and allocating twelve canvases for a texture built once at load
  // is exactly the kind of thing that shows up as a hitch.
  const sootCanvas = makeCanvas(R);
  const inkCanvas = makeCanvas(R);
  const structCanvas = makeCanvas(R);
  const sootCtx = ctx2d(sootCanvas);
  const inkCtx = ctx2d(inkCanvas);
  const structCtx = ctx2d(structCanvas);

  for (let region = 0; region < 6; region++) {
    const rr = rng.fork(`macro:${o.faction}:${o.seed}:${region}`);

    // --- drift --------------------------------------------------------------
    // baseCells 2 over a region is a feature every ~800 m: a whole-ship value swing,
    // not a pattern. Three octaves add the 200 m and 100 m tiers under it.
    const drift = fbmField(rr.fork('drift'), R, { baseCells: 2, octaves: 3, gain: 0.52 });
    frameRhythm(drift, R, region);

    // --- structure: recesses, frames and the dense bands ---------------------
    // Skipped entirely when `marks` is off (debris, rubble): a torn fragment must not
    // carry the parent hull's bay throat.
    structCtx.clearRect(0, 0, R, R);
    if (o.marks) {
      regionStructure(structCtx, R, rr.fork('structure'), { region });
    } else {
      structCtx.fillStyle = 'rgb(128,128,128)';
      structCtx.fillRect(0, 0, R, R);
    }
    const struct = canvasToField(structCanvas, R);

    // --- soot ---------------------------------------------------------------
    sootCtx.clearRect(0, 0, R, R);
    sootCtx.fillStyle = '#000000';
    sootCtx.fillRect(0, 0, R, R);
    if (o.marks) {
      const sr = rr.fork('soot');
      switch (region) {
        case 0: sootStreaks(sootCtx, R, sr, BAND[region], { count: 5, dirY: 1, strength: 0.85 }); break;
        case 1: sootStreaks(sootCtx, R, sr, BAND[region], { count: 7, dirY: 1, strength: 1.0 }); break;
        // Deck soot runs aft, i.e. towards -Z, which in the (x, z) projection is -V,
        // and -V is +canvas-row because three flips the texture.
        case 2: sootStreaks(sootCtx, R, sr, BAND[region], { count: 5, dirY: 1, dirX: 0.10, strength: 0.7, lengthMax: 0.40 }); break;
        case 3: sootStreaks(sootCtx, R, sr, BAND[region], { count: 4, dirY: 1, strength: 1.0, width: 0.030 }); break;
        case 4: sootStreaks(sootCtx, R, sr, BAND[region], { count: 1, dirY: 1, strength: 0.35 }); break;
        case 5:
          sootWash(sootCtx, R, 0.5, 0.5, 0.20, 0.60);
          sootStreaks(sootCtx, R, sr, BAND[region], { count: 6, dirY: -1, strength: 0.9, lengthMax: 0.30 });
          break;
        default: break;
      }
    }
    const soot = canvasToField(sootCanvas, R);

    // --- ink ----------------------------------------------------------------
    inkCtx.clearRect(0, 0, R, R);
    inkCtx.fillStyle = '#000000';
    inkCtx.fillRect(0, 0, R, R);
    if (o.marks) {
      // Largest first, so a smaller class's marks are drawn OVER the big set where
      // the two annuli overlap near the region centre. The small set is the one that
      // has to survive intact - it is the only marking a 480 m hull will ever see.
      for (const scale of MARK_SCALES) {
        regionMarks(inkCtx, R, rr.fork(`marks:${scale}`), { region, faction: o.faction, scale });
      }
    }
    const ink = canvasToField(inkCanvas, R);

    // --- pack ---------------------------------------------------------------
    const col = region % MACRO_COLS;
    // Region index 0..2 is the TOP canvas row. three flips the texture, so the
    // shader's row-from-the-bottom is (1 - floor(index / cols)); the two agree.
    const rowC = Math.floor(region / MACRO_COLS);
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < R; x++) {
        const src = y * R + x;
        const dst = ((rowC * R + y) * W + (col * R + x)) * 4;
        bytes[dst] = drift[src] * 255;
        bytes[dst + 1] = struct[src] * 255;
        // Soot is squared so the thin end of every streak falls away fast; a linear
        // ramp leaves a grey haze over the whole flank, which is grime, not soot.
        bytes[dst + 2] = saturate01(soot[src] * soot[src] * 1.15) * 255;
        /**
         * PASSED THROUGH, NOT THRESHOLDED. This used to be
         * `smoothstep(0.18, 0.62, ink)`, which was correct when every mark was one
         * colour: it hardened the antialiased glyph edges. It cannot survive the two
         * mark families, because the FAMILY is encoded in the value — ink at 0.42,
         * hazard at 1.0 — and that smoothstep maps 0.42 to 0.51 and would leave the
         * shader unable to tell them apart. The canvas already holds exactly the
         * values the shader classifies on.
         */
        bytes[dst + 3] = saturate01(ink[src]) * 255;
      }
    }
  }

  /**
   * A DataTexture, NOT a CanvasTexture, AND THIS IS NOT A STYLE PREFERENCE.
   *
   * This is the only map in the game whose ALPHA channel carries data rather than
   * coverage — alpha is the mark channel and it is 0 over most of the atlas. A 2D
   * canvas backing store is PREMULTIPLIED: writing (r, g, b, 0) through
   * `putImageData` and reading it back gives (0, 0, 0, 0) in every browser that
   * stores premultiplied, because there is no way to recover r from r x 0. Every
   * other generator here is safe because it writes alpha 255 everywhere; this one
   * would have had its drift, roughness-drift and soot channels silently zeroed
   * across ~99% of its area, leaving a constant -15% albedo offset and no drift, no
   * soot and no frame rhythm at all — a defect that looks exactly like "the macro
   * layer does not do very much" and would be debugged in the shader.
   *
   * A DataTexture hands the bytes to the driver untouched. It costs nothing and it
   * removes the failure mode rather than testing for it.
   *
   * `flipY` and the filtering are set to match what `canvasTexture` did, because the
   * shader's region row arithmetic (`1 - floor(idx / 3)`) assumes the flip. NPOT with
   * mipmaps is legal in WebGL2, which is the only target (ARCHITECTURE.md).
   */
  const texture = new THREE.DataTexture(new Uint8Array(bytes.buffer), W, H, THREE.RGBAFormat);
  texture.name = `macro:${o.faction}:${o.seed}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  // The atlas must NOT wrap: the shader clamps into a region and a wrap here would
  // fetch a neighbouring region's marks along every region border.
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return { texture, regionPx: R, cols: MACRO_COLS, rows: MACRO_ROWS, macroM: MACRO_DEFAULT_M };
}
