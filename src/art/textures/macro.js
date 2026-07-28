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
 *   G  roughness drift, 0.5 = neutral   A  ink marks, 0 = none
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
};

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
const INK_V = 0.42;
const HAZ_V = 1.0;

/**
 * Marks for one region, placed at named hull features.
 *
 * @param {CanvasRenderingContext2D} ctx  draws in mark VALUE, greyscale
 */
function regionMarks(ctx, size, rng, { region, faction }) {
  /** Ship metres on the region's first axis -> canvas x. See AXIS_FLIP. */
  const flip = AXIS_FLIP[region];
  const X = (a) => (0.5 + (flip * a) / MACRO_DEFAULT_M) * size;
  /** Ship metres on the second axis -> canvas y. three flips the texture. */
  const Y = (b) => (1 - (0.5 + b / MACRO_DEFAULT_M)) * size;
  const V = (v) => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;

  /**
   * §4(a): a stripe running ALONG a real geometric edge, 2-4 m wide, 40-260 m long,
   * starting and ending at a structural break. Stated in ship metres on both axes,
   * so it cannot drift off the edge it is following.
   */
  const edgeStripe = (a0, a1, b, widthM = 3.2) => {
    const x0 = X(Math.min(a0, a1)), x1 = X(Math.max(a0, a1));
    ctx.fillStyle = V(HAZ_V);
    ctx.fillRect(x0, Y(b) - m(widthM) * 0.5, x1 - x0, Math.max(1, m(widthM)));
  };

  /** The same, running along the OTHER axis (a vertical edge in this projection). */
  const edgeStripeV = (a, b0, b1, widthM = 3.2) => {
    const y0 = Y(Math.max(b0, b1)), y1 = Y(Math.min(b0, b1));
    ctx.fillStyle = V(HAZ_V);
    ctx.fillRect(X(a) - m(widthM) * 0.5, y0, Math.max(1, m(widthM)), y1 - y0);
  };

  /**
   * §4(b): 45-degree bars at something that moves, opens, fires or gets hot.
   * Centred on a named feature. The pitch is 16 m rather than the document's 6 m
   * because 6 m is 1.4 texels here and would alias into a flat wash — the honest
   * trade is a coarser bar that resolves over a finer one that does not.
   */
  const hazardAt = (a, b, wM, hM, pitchM = 16) => {
    hazardStripes(ctx, X(a) - m(wM) * 0.5, Y(b) - m(hM) * 0.5, m(wM), m(hM), {
      a: 0xffffff, b: 0x000000, period: Math.max(2, m(pitchM)), angle: Math.PI / 4,
    });
  };

  /** §4(c): a functional marking, glyph height >= 12 m. Ink family. */
  const codeAt = (a, b, heightM, text = null) => {
    const cell = Math.max(1, m(heightM) / 7);
    const s = text ?? hullCode(rng, faction);
    ctx.fillStyle = V(INK_V);
    drawText(ctx, s, X(a), Y(b), cell, { align: 'center', baseline: 'middle' });
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
    ctx.lineWidth = Math.max(1, m(2.2));
    ctx.strokeRect(-m(wM) * 0.5, -m(hM) * 0.5, m(wM), m(hM));
    // Fasteners along the two long edges: this is what "wired on" looks like.
    ctx.fillStyle = V(INK_V);
    const step = m(9);
    for (let x = -m(wM) * 0.5 + step * 0.5; x < m(wM) * 0.5; x += step) {
      for (const y of [-m(hM) * 0.5, m(hM) * 0.5]) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.8, m(1.6)), 0, Math.PI * 2);
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
      ctx.fillRect(X(a) - m(2.4), Y(Math.max(b0, b1)), m(4.8), Math.abs(Y(b1) - Y(b0)));
    }
  };

  switch (region) {
    // ---- 0: +X starboard flank, projection (z, y) --------------------------
    case 0:
      // §4(a) one structural-edge stripe, following the deck chine, 190 m, starting
      // at the shoulder and stopping at the forebody plate break.
      edgeStripe(60, 250, SHIP.deckChine - 6, 3.0);
      // §4(c) registry code, forward of the shoulder, mid-flank.
      codeAt(210, -8, 30);
      // §4(b) the starboard grapple pivots — arms move. Note these are at DIFFERENT
      // z from the port ones (§5), so the two flanks are never mirror-matched.
      hazardAt(SHIP.grappleStbd[1], -58, 34, 20, 12);
      break;

    // ---- 1: -X port flank, projection (z, y) -------------------------------
    case 1:
      // A different edge run from starboard, and along the KEEL chine rather than
      // the deck chine, so the two flanks do not read as one repeated treatment.
      edgeStripe(-300, -90, SHIP.keel + 8, 3.4);
      codeAt(330, -6, 36);
      hazardAt(SHIP.grapplePort[0], -58, 34, 20, 12);
      // §5 identity: the repair made with someone else's plate, 7 degrees off grid.
      patchOutline(SHIP.patchZ, 4, 86, 44, 7);
      // §5 identity: the ship is not finished and never will be.
      ribs(SHIP.ribsZ, -30, 40, 4, 22);
      break;

    // ---- 2: +Y deck, projection (x, z) -------------------------------------
    case 2:
      // §4(b) mount pads: something is bolted on here and it gets craned in.
      hazardAt(0, SHIP.mounts.dorsalZ, 40, 26, 13);
      hazardAt(0, SHIP.mounts.bowZ, 32, 22, 12);
      // §4(b) the drive-well approach on the aft deck — exhaust.
      hazardAt(-42, SHIP.sternBlock + 40, 30, 20, 12);
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
      factionSigil(ctx, faction, X(0), Y(430), m(16), 0x6b6b6b);
      break;

    // ---- 3: -Y belly, projection (x, z) ------------------------------------
    case 3: {
      // §4(a)+(b) the bay door swing arc. Both rails and both transverse frames,
      // following the real 210 x 320 m opening rather than floating near it. This is
      // the largest single marking on the ship and every metre of it is on an edge.
      const B = SHIP.bay;
      edgeStripeV(B.x, B.z0, B.z1, 3.6);
      edgeStripeV(-B.x, B.z0, B.z1, 3.6);
      edgeStripe(-B.x, B.x, B.z1, 3.6);
      hazardAt(B.x - 26, B.z1 - 24, 34, 22, 12);
      hazardAt(-B.x + 26, B.z0 + 24, 34, 22, 12);
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
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        hazardAt(Math.cos(t) * r, Math.sin(t) * r, 15, 15, 7);
      }
      // §4(c) the stern block carries the ship's number where a tug can read it.
      codeAt(-96, 44, 30);
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
  const sootCtx = ctx2d(sootCanvas);
  const inkCtx = ctx2d(inkCanvas);

  for (let region = 0; region < 6; region++) {
    const rr = rng.fork(`macro:${o.faction}:${o.seed}:${region}`);

    // --- drift: two independent low-frequency fields ------------------------
    // baseCells 2 over a region is a feature every ~800 m: a whole-ship value swing,
    // not a pattern. Three octaves add the 200 m and 100 m tiers under it.
    const drift = fbmField(rr.fork('drift'), R, { baseCells: 2, octaves: 3, gain: 0.52 });
    const rough = fbmField(rr.fork('rough'), R, { baseCells: 3, octaves: 3, gain: 0.50 });
    frameRhythm(drift, R, region);

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
    if (o.marks) regionMarks(inkCtx, R, rr.fork('marks'), { region, faction: o.faction });
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
        bytes[dst + 1] = rough[src] * 255;
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
