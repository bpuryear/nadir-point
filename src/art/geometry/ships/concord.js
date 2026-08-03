/**
 * CONCORD HULLS — sleek. Ceramic over metal, built by people who never expect a
 * boarding action.
 *
 * ===========================================================================
 * THE DESIGN LANGUAGE. Read the Coalition file first; this one is defined against
 * it, point for point, because the pass/fail criterion is that the two navies are
 * distinguishable in black silhouette with no colour at all.
 * ===========================================================================
 *
 *   SWEPT AND CONTINUOUS. Where Coalition STEPS between stations, Concord runs six
 *   to eight of them so the flank is a continuous curve made of flat facets. The
 *   cross-section is a BLADE: the chamfers are 60-70% of the half-beam against
 *   Coalition's 25-30%, so the top and bottom faces are narrow strips and the hull
 *   is a flattened diamond. Nothing on a Concord hull is a box.
 *
 *   NOTHING HANGS OFF. No pylons, no external conduit, no cantilevered radiators.
 *   Every mass either GROWS OUT OF the hull line (wings, sail, crest, strakes,
 *   cradle arms) or is RECESSED INTO it (weapon slots, exhausts, the hangar).
 *   Concord does not admit to having machinery.
 *
 *   NO BELLS. The drive is a recessed rectangular SLOT with a lit throat. This is
 *   the single fastest tell at any distance: Coalition sterns are a cluster of
 *   circles, Concord sterns are a horizontal bar of light.
 *
 *   PREDATORY. Every class leads with a long thin nose and carries its mass aft.
 *   The eye is meant to read "this is pointed at you".
 *
 * ===========================================================================
 * WHAT CHANGED IN THIS PASS — THE SECTION, ON EVERY CLASS
 * ===========================================================================
 * Every hull in this file was built from `common.js#Lines`: an 8-gon of four big
 * orthogonal planes and four thin chamfers, i.e. a box with its corners knocked off
 * however you sweep it. Every wing, strake, sail and fin was a `bladePlate` or a
 * `radiatorFin`: a flat prism whose two large faces are exactly +-Y or +-X. The
 * fleet audit measures what that costs, area-weighted, on the LOD0 mesh:
 *
 *                          BEFORE                    AFTER
 *   corvette         358 tris  axis 27.4%     1056 tris  axis  8.6%
 *   frigate          616 tris  axis 57.6%     1316 tris  axis 17.9%
 *   escort           532 tris  axis 61.5%     1446 tris  axis 24.3%
 *   destroyer        832 tris  axis 36.5%     1736 tris  axis  4.7%
 *   tender           648 tris  axis 25.9%     1926 tris  axis  3.0%
 *   strikecraft      122 tris  axis 70.3%      336 tris  axis 30.5%
 *
 * Three moves, and nothing else:
 *
 *   1. EVERY MASS IS A `Mass`. Six hulls, three outrigger pods, a dorsal spine, a
 *      ventral fairing, two fork prongs - all `common.js#Mass`, the twelve-point
 *      section the player cruiser was rebuilt from, with the same seven columns.
 *   2. EVERY BLADE IS A `bladeGeo`. See the block below. A wing is a hull section
 *      with a very large chord:thickness swept along a span instead of along a keel,
 *      so it is cut from `hullSection` too and it wears the same knuckle.
 *   3. DETAIL MOVED INSIDE THE SILHOUETTE. Every `blastDoor` and `panelledSlab`
 *      bolted to a flank is now a `Mass#recess` or a `Mass#intake` CUT INTO it, and
 *      every drive housing is gone: the drive is a lit slot in the mass's own
 *      transom, which is what this file's own header has always said Concord does.
 *
 * Draw calls went DOWN, not up (12 -> 10 on the destroyer, 9 -> 7 on the frigate,
 * 9 -> 8 on the tender), because the housings that carried `engine/dark` and
 * `core/greeble` were deleted rather than replaced. Triangles are cheap; draws are
 * not, and this pass spent 6,300 of the first to buy back 5 of the second.
 *
 * THE OTHER GATE, and it is the one that could have been lost. `audit.mjs` holds
 * every intra-Concord pair 10.0 m apart in outline at a 200 m reference; the
 * closest pair in the game was corvette/frigate at 11.2. Frames, strakes, belts and
 * recesses move the outline by ~0 and buy exactly zero separation, so this pass paid
 * for its surface work with PROPORTION: the Whipcord became the wide flat one (beam
 * 0.36 of length, top 0.12) and the Meridian the tall narrow one (beam 0.29, top
 * 0.25). Measured, corvette/frigate went 11.2 -> 12.4 and the Concord floor went
 * 11.2 -> 11.6.
 *
 * ===========================================================================
 * WHAT CHANGED IN THE PASS BEFORE IT
 * ===========================================================================
 * Same four corrections as the Coalition file - a waist and a shoulder in every
 * plan curve, an asymmetric chisel prow with the tip below the axis, tumblehome
 * aft and flare forward via the new keel column in `Lines`, and at least one void
 * you can see stars through per class. The difference is HOW each is expressed,
 * and that difference is the faction:
 *
 *   - Coalition negative space is STRUCTURAL: the gap under a pylon, the bay
 *     between two trusses, the canyon between two side hulls. You see the frame.
 *   - Concord negative space is FORMED: the hole between a boom and a tailplane,
 *     the enclosed teardrop between a cradle arm and the keel, the slot between
 *     two nacelles. You see a shape, and you never see how it is held together.
 *
 * PEREGRINE, the named acceptance failure ("reads as a horizontal smear with
 * little vertical event"), is fixed in the hull lines themselves rather than by
 * bolting something tall to the deck - see that section.
 *
 * ===========================================================================
 * FIVE CAPITAL CLASSES
 * ===========================================================================
 *   Whipcord  corvette  95 m   a TWIN-BOOM with a rectangular hole in its tail.
 *   Meridian  frigate  210 m   a SHARK: long spindle, one tall dorsal sail
 *                             amidships, two forward-swept ventral strakes.
 *   Halcyon   escort   300 m   a FLYING WING. 190 m of beam on 300 m of length -
 *                             the widest length:beam ratio in either navy - razor
 *                             thin in profile, with one deep ventral keel-blade.
 *   Peregrine destroyer 480 m  a TRIMARAN with a DORSAL CREST. The hull's own top
 *                             line rises 114 m and falls again; twin canted fins
 *                             over the stern; two nacelles slung low.
 *   Solace    tender   620 m   TWO CRADLE ARMS sweeping down and forward off the
 *                             flanks to meet under the bow, enclosing a 340 m
 *                             teardrop void that a whole frigate fits inside.
 */

import * as G from '../greeble.js';
import { HULL_LENGTH, RANGE } from '../../../core/units.js';
import {
  Buckets, Mass, FACET, SECTION_LOD, hullSection, chineStrip, glowSlot, lightRun,
  shipClass, weapon,
} from './common.js';

const PI = Math.PI;
const HALF_PI = PI * 0.5;

/**
 * Lengths for the two new classes. Not in core/units.js#HULL_LENGTH because that
 * file is shared foundation and this stream does not edit it unilaterally; adding
 * `escort: 300` and `tender: 620` there is proposed in the stream report.
 */
export const CONCORD_LENGTH = { escort: 300, tender: 620 };

// ===========================================================================
// THE BLADE — the one primitive this file needed and the kit did not have
// ===========================================================================
//
// Every Concord class is mostly BLADE: wings, canards, strakes, the frigate's sail,
// the destroyer's tail fins and pylons, the escort's 95 m keel. Before this pass all
// of them were `bladePlate` (a flat prism extruded in Y) or `radiatorFin` (a flat
// prism extruded in X). Both are two large faces at exactly +-Y or +-X, so every one
// of them scored 100% AXIS-ALIGNED, and on hulls that are mostly blade that is the
// whole diagnosis:
//
//     concord_escort   532 tris  axis 61.5%   150x78 keel blade + 2 wings + 2 canards
//     concord_frigate  616 tris  axis 57.6%   58x36 sail + 2 strakes
//     concord_strike   122 tris  axis 70.3%   2 wings on an 18 m hull
//
// A blade is not a different KIND of object from a hull. It is a hull section with a
// very large beam:depth swept along a span instead of along a keel. So it is built
// from `common.js#hullSection` - the same twelve points, six facets a side, no facet
// within 5 degrees of an axis - and the only axis-aligned area left on a blade is the
// root and tip caps, which are chord x thickness and usually buried.
//
// ROWS ARE `[span, zCentre, chord, thickness]`, ascending in span:
//
//   span       distance from the blade's own root, metres
//   zCentre    SHIP z of the chord's midpoint at that station. This column is the
//              SWEEP: zCentre falling as span rises is a swept-back blade, rising is
//              forward-swept, and it is a free curve rather than the single `sweep`
//              scalar `radiatorFin` allows. The Meridian's forward-swept strakes and
//              the Peregrine's raked fins are the same function with this column
//              going opposite ways.
//   chord      full chord at that station
//   thickness  full thickness. `knuckle`/`deckFlat`/`flare` shape the section exactly
//              as they shape a hull: a low `deckFlat` is a sharp-backed blade, `flare`
//              over 1 puts the widest point of the section toward the trailing edge.
//
// The blade is authored with its span along +Z and its chord along +X and is then
// AIMED, in the two-named-rotations form the house rule asks for (kit.js#aimed,
// common.js#aimAt): never one composed Euler triple at a seam.
//
// COST, counted off `greeble.js#loft`: 2n triangles per span gap and n-2 per cap, so
// at twelve points a three-station wing capped both ends is 2*24 + 2*10 = 68 against
// `bladePlate`'s 12 - which is the trade the budget was raised for, and it is inside
// the SAME merged bucket, so it is zero extra draw calls.
// ---------------------------------------------------------------------------

/**
 * A blade in its own frame: span along +Z, chord along +X, thickness along +Y.
 *
 * @param {number[][]} rows  `[span, zCentre, chord, thickness]`, ascending in span
 * @param {Object} [p]
 * @param {number} [p.knuckle]   0.30..0.55, where the widest point of the section sits
 * @param {number} [p.deckFlat]  0.05..0.98, flat width at the top of the section
 * @param {number} [p.flare]     scales the points below the knuckle
 * @param {number[]} [p.keep]    `SECTION_LOD` map
 * @param {boolean} [p.root]     cap the root end. False when it is buried in a hull.
 * @param {boolean} [p.tip]      cap the tip end. False only where another mass closes it.
 */
function bladeGeo(rows, {
  knuckle = 0.42, deckFlat = 0.30, flare = 1, keep = null, root = true, tip = true,
} = {}) {
  return G.loft(rows.map(([s, zc, chord, thick]) => ({
    z: s,
    points: hullSection({
      half: chord * 0.5, top: thick * 0.5, bottom: -thick * 0.5,
      knuckle, deckFlat, flare, keep, label: `blade span=${s}`,
      // The section is translated in its own plane so the chord is centred on the
      // ship z the caller asked for. Local +X becomes ship -Z under the yaw below.
    }).map(([x, y]) => [x - zc, y]),
  })), { capFront: tip, capBack: root });
}

/** Span along +X: a wing, a strake, a horizontal pylon. Starboard as authored. */
const spanX = (geo) => G.place(geo, { rot: [0, HALF_PI, 0] });

/**
 * Span along +Y: a fin, a sail, a keel blade.
 *
 * `roll` is the angle the span makes with +X, so `HALF_PI` is straight up,
 * `-HALF_PI` hangs the blade below the hull as a keel, and `HALF_PI - cant` splays a
 * fin outboard toward +X. Two `place` calls, not one composed Euler triple.
 */
const spanY = (geo, roll = HALF_PI) => G.place(spanX(geo), { rot: [0, 0, roll] });

/** A blade and its properly-wound mirror. Winding is reversed, not scaled negative. */
function bladePair(geo) { return [geo, G.mirrorGeometryX(geo)]; }

// ===========================================================================
// CORVETTE — "Whipcord", 95 m
// ===========================================================================

/**
 * The central nacelle. It STOPS at z = -14: everything aft of that is open sky
 * between the two booms, and that hole is the class.
 *
 * The waist is at z = -14 (deck half 5.6) and the shoulder at z = -2 (7.8); the
 * nose droops to a tip centre 3.0 m below the axis over the last 13 m.
 */
const CC_HULL = new Mass([
  // [z, half, top, bottom, knuckle, deckFlat, flare]
  [-16.0, 5.4, 2.9, -3.4, 0.52, 0.46, 0.86],
  [-2.0, 7.8, 4.0, -4.5, 0.48, 0.40, 0.88],
  [16.0, 6.3, 3.2, -3.7, 0.44, 0.34, 0.94],
  [30.0, 3.7, 1.4, -3.0, 0.38, 0.28, 1.04],
  [40.0, 1.9, -0.7, -3.1, 0.34, 0.24, 1.08],
  [47.6, 0.6, -2.3, -3.9, 0.32, 0.20, 1.02],
], { label: 'whipcord' });

/** Frames at the fleet rhythm for a 95 m class: 7.8 and 9.4 m apart. */
const CC_FRAMES = CC_HULL.frameStations({ length: 95, count: 3, from: -12, to: 30 });

/** A tail boom, in its own frame; placed at x = +-CC_BOOM_X. */
const CC_BOOM = new Mass([
  [-47.6, 1.5, 0.8, -1.1, 0.50, 0.44, 0.90],
  [-30.0, 2.6, 1.5, -1.9, 0.46, 0.36, 0.92],
  [2.0, 3.2, 1.9, -2.4, 0.42, 0.30, 0.96],
], { label: 'whipcord boom' });
/**
 * THE V.
 *
 * The booms used to sit at y = -0.4, level with the nacelle, on a flat wing. In
 * PLAN that is the class - two rails with a rectangular hole between them - but in
 * PROFILE it was a razor: 12.6 m of height on 95 m of length, i.e. an aspect of
 * 0.13, and the pairwise silhouette audit put Whipcord within 7.1 m of the Concord
 * strike craft and 7.5 m of the Meridian, both against a floor of 6.7. The whole
 * class was carried by one view.
 *
 * So the wing has 32 degrees of DIHEDRAL and the booms ride at its knuckle. The
 * profile now has three events on a hull that had none: the wing rising aft from
 * the nacelle shoulder, the boom line above the hull's own top line, and a keel
 * blade below it. Height goes 12.6 -> 21.6 m (aspect 0.23) without one new mass -
 * the same parts, rotated, which is the Concord answer: nothing is bolted on, the
 * surface itself changes direction.
 *
 * `CC_DIHEDRAL` is used by the wing, the boom placement and the boom's own roll, so
 * they cannot drift apart. Boom x is the wing knuckle's x AFTER the rotation.
 */
const CC_DIHEDRAL = 0.56;                    // radians, 32 degrees
/**
 * Where along the wing SPAN the boom sits, and the boom's x/y after the dihedral
 * rotation. Widened from a 9.4 m half-gap to 10.2: `concord_corvette` against
 * `concord_frigate` is the tightest intra-faction pair in the game (11.2 m mean at
 * the 200 m reference against a 10.0 bar), and the corvette's answer is to be the
 * WIDE, FLAT one - beam 0.36 of its length against the frigate's 0.34 on a hull
 * three times longer. The gap between the booms stays the plan-view read.
 */
const CC_KNUCKLE = 12.0;
const CC_BOOM_X = CC_KNUCKLE * Math.cos(CC_DIHEDRAL);        // 10.14
const CC_BOOM_Y = CC_KNUCKLE * Math.sin(CC_DIHEDRAL) - 0.4;  // 5.97

/**
 * Starboard wing: `[span, zCentre, chord, thickness]`. The root at span 4.4 is
 * inside the nacelle's own 6.3-7.8 m half-beam, so it is uncapped and the wing grows
 * out of the skin. The boom rides at span `CC_KNUCKLE`, i.e. two thirds out.
 */
const CC_WING = [
  [4.4, -1.5, 21.0, 2.6],
  [CC_KNUCKLE, -4.6, 18.0, 2.0],
  [20.0, -7.2, 13.0, 1.0],
];

/** The tailplane, spanning both boom tops in one blade. Slightly arched. */
const CC_TAIL = [
  [-CC_BOOM_X - 1.6, -42.0, 5.6, 1.1],
  [0, -42.8, 6.8, 1.7],
  [CC_BOOM_X + 1.6, -42.0, 5.6, 1.1],
];

/** One boom fin, canted with the wing. Swept back. */
const CC_FIN = [
  [0, -38.0, 9.0, 1.0],
  [2.0, -39.4, 7.2, 0.7],
  [3.9, -40.6, 5.0, 0.4],
];

/** THE KEEL BLADE, hung below the axis. Raked forward as span goes down. */
const CC_KEEL = [
  [0, 14.0, 24.0, 1.4],
  [4.0, 16.6, 18.0, 1.0],
  [7.6, 19.0, 11.0, 0.6],
];

function corvetteParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();
  const card = full ? SECTION_LOD.full : SECTION_LOD.mid;

  // --- 1. the central nacelle ----------------------------------------------
  B.add('core', 'hull', CC_HULL.loft({
    capFront: false, keep: card, at: full ? null : [-2, 16, 30, 40],
  }));
  // The lance aperture, in the tip of the hull itself. Concord's guns are holes.
  B.add('core', 'emissive', glowSlot(1.1, 0.5), { pos: [0, -3.1, 47.7] });

  // --- 1b. THE SURFACE, and it is the hull's own section -------------------
  //
  // Three frames at the fleet's 8.2%-of-length rhythm, ONE continuous strake a side
  // below the knuckle carrying `dark`, and two recesses that are not a mirrored
  // pair. The strake is continuous rather than a belt of separate plates because
  // that is the faction knob: Coalition bolts on armour it expects to replace, a
  // navy that fairs everything in does not leave a seam a fitter can get a bar
  // behind (common.js#Mass.belt).
  if (full) {
    B.add('core', 'plating', CC_HULL.frames(CC_FRAMES, { detail: D }));
    for (const side of [-1, 1]) {
      B.add('core', 'dark', CC_HULL.plate({
        z0: -15, z1: 34, side, facet: FACET.lowerFlank, t0: 0.06, t1: 0.94, out: 0.22,
      }));
    }
    // Machinery goes INSIDE the silhouette. A boat bay to port, a sensor aperture
    // to starboard at a different station: mirrored detail is the strongest tell of
    // procedural placement there is.
    B.add('core', 'dark', CC_HULL.intake({
      z0: -14, z1: 12, side: -1, facet: FACET.upperFlank, t0: 0.34, t1: 0.70, depth: 0.55,
    }));
    B.add('core', 'dark', CC_HULL.recess({
      z: 22, side: 1, facet: FACET.upperFlank, width: 3.4, height: 1.8, depth: 0.9,
    }));
  }

  // --- 2. wings, and the booms that grow out of them ------------------------
  //
  // THE CLASS READ. Two booms, 50 m long, standing 10.1 m off the centreline with
  // twenty metres of nothing between them, closed at the back by a tailplane.
  // In plan that is a rectangular hole in the tail; from the beam it is two
  // parallel lines with daylight between them; from dead astern it is a squared
  // horseshoe. No other hull in the game - either navy, any size - has a hole in
  // it except the Coalition destroyer and carrier, both of which are four to nine
  // times this length and cannot be confused with it by anybody.
  const wing = bladePair(spanX(bladeGeo(CC_WING, {
    knuckle: 0.44, deckFlat: 0.28, flare: 1.04, keep: card, root: false,
  })));
  for (const s of [-1, 1]) {
    const i = s > 0 ? 0 : 1;
    B.add('core', 'plating', wing[i], { pos: [0, -0.4, 0], rot: [0, 0, s * CC_DIHEDRAL] });
    B.add('core', 'hull', CC_BOOM.loft({ capFront: false, keep: card }),
      { pos: [s * CC_BOOM_X, CC_BOOM_Y, 0], rot: [0, 0, s * CC_DIHEDRAL] });
    // Boom drive: a lit slot in the boom's OWN transom. The 12-triangle box that
    // used to stand behind each boom carrying the whole `engine/dark` surface is
    // gone; Concord does not admit to having machinery, least of all in a housing.
    B.add('engine', 'emissive', glowSlot(2.6, 1.5),
      { pos: [s * CC_BOOM_X, CC_BOOM_Y, -47.7], rot: [0, PI, -s * CC_DIHEDRAL] });
    if (full) {
      // Wing-root fairing, cut from the boom's own section rather than from a wedge.
      B.add('core', 'hull', CC_BOOM.loft({ at: [-30], keep: SECTION_LOD.far, capFront: false }),
        { pos: [s * 5.6, 2.2, 6], rot: [0, PI, -s * CC_DIHEDRAL * 0.6], scale: [0.62, 0.62, 0.42] });
    }
  }

  // Tailplane across the boom tops. Without it the booms read as two loose spars;
  // with it the tail is a closed frame with a window in it - and now that the booms
  // ride six metres above the nacelle, the crossbar is also the top of the V and the
  // highest thing on the ship.
  B.add('core', 'plating', spanX(bladeGeo(CC_TAIL, { knuckle: 0.46, deckFlat: 0.34, keep: card })),
    { pos: [0, CC_BOOM_Y + 2.1, 0] });

  // --- 3. fins -------------------------------------------------------------
  // One small fin on each boom, not a median sail: the frigate owns the tall-fin
  // read and a corvette that borrowed it would be a frigate at half scale. They are
  // canted with the wing, so from astern the pair continues the V outward instead
  // of standing vertically like a Coalition mast.
  const fin = bladePair(spanY(bladeGeo(CC_FIN, { deckFlat: 0.26, keep: card, root: false })));
  for (const s of [-1, 1]) {
    B.add('core', 'plating', fin[s > 0 ? 0 : 1],
      { pos: [s * CC_BOOM_X, CC_BOOM_Y + 1.2, 0], rot: [0, 0, s * CC_DIHEDRAL] });
  }
  // THE KEEL BLADE. The other half of the profile fix: the V opens upward, so the
  // hull needs something below the axis or the whole ship migrates above its own
  // centreline. 7.6 m deep and 24 m of chord, so it reads as a fin rather than as a
  // skid, and it is the only Concord surface that is a straight line in profile -
  // which is what makes the swept ones read as swept.
  B.add('core', 'plating', spanY(bladeGeo(CC_KEEL, { deckFlat: 0.26, keep: card, root: false }), -HALF_PI),
    { pos: [0, -3.4, 0] });

  // --- 4. canopy: a lit slit, flush ----------------------------------------
  if (full) {
    B.add('core', 'emissive', glowSlot(4.4, 0.6), { pos: [0, 4.1, 10], rot: [-0.5, 0, 0] });
    // The single accent line. Concord wears one, on the port shoulder, always, and
    // it follows the chine rather than sitting on a flat (ship-language.md §4a) -
    // which is now literally true: it is a skin plate on the deck chamfer, parallel
    // to the surface underneath it at every station, not a bar at a fixed x.
    B.add('core', 'trim', CC_HULL.plate({
      z0: -10, z1: 30, side: -1, facet: FACET.deckChamfer, t0: 0.30, t1: 0.52,
      drift: 0.18, out: 0.16,
    }));
  }

  // --- 5. running lights: mandatory ----------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(CC_HULL, -14, 34, s));
    B.add('core', 'runningLights', G.place(chineStrip(CC_BOOM, -44, 0, s),
      { pos: [s * CC_BOOM_X, CC_BOOM_Y, 0], rot: [0, 0, s * CC_DIHEDRAL] }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// FRIGATE — "Meridian", 210 m
// ===========================================================================

/**
 * Waist at z = -96 (5.4), shoulder at z = -4 (16.0). Over the forward 30 m the
 * silhouette falls 19 m, deck at 21 degrees against keel at 8, tip centre 6 m
 * below the axis.
 */
const MR_HULL = new Mass([
  // [z, half, top, bottom, knuckle, deckFlat, flare]
  [-104, 7.4, 3.4, -4.6, 0.52, 0.50, 0.86],
  [-96, 5.6, 2.4, -3.4, 0.53, 0.52, 0.86],
  [-64, 11.2, 5.8, -7.2, 0.50, 0.46, 0.88],
  [-30, 14.0, 7.6, -8.6, 0.47, 0.40, 0.88],
  [-4, 15.2, 8.4, -9.2, 0.45, 0.36, 0.90],
  [40, 12.0, 6.4, -8.0, 0.40, 0.30, 0.98],
  [76, 7.0, 2.8, -5.8, 0.36, 0.24, 1.06],
  [105, 2.6, -3.4, -6.4, 0.32, 0.18, 1.00],
], { label: 'meridian' });

/** Four frames at the fleet rhythm on a 210 m class: 17-21 m apart. */
const MR_FRAMES = MR_HULL.frameStations({ length: 210, count: 4, from: -80, to: 50 });

/**
 * THE SAIL, as `[span, zCentre, chord, thickness]` up from a root at y +6.
 *
 * Taller than it was (46 m of span against 36) and raked HARDER: the chord centre
 * walks 24 m aft over the span, so from the beam the leading edge is a long diagonal
 * rather than a near-vertical plate. That rake is also the separation move - the
 * Meridian is now the TALL, NARROW class (top 0.25 of its length, max |x| 0.16)
 * against the Whipcord's WIDE, FLAT one (top 0.12, max |x| 0.18).
 */
const MR_SAIL = [
  [0, -28, 62, 5.4],
  [17, -34, 55, 4.2],
  [32, -42, 42, 2.8],
  [46, -50, 26, 1.4],
];

/**
 * THE OUTRIGGER, AND THERE IS ONLY ONE OF IT.
 *
 * Round-one blind review: "Destroyer, escort, frigate and corvette are four sizes
 * of the same swept arrowhead ... give each Concord class one non-scalable
 * structural idea the others do not have."
 *
 * This is the frigate's idea: a SINGLE auxiliary nacelle, starboard only, carrying
 * the sensor tender's power plant. It is non-scalable because it is asymmetric - you
 * cannot get it by making a corvette bigger - and it is the only bilaterally unequal
 * warship in either navy, which also means the Meridian is the one class you can tell
 * which way up and which way round it is from a single glance at a plan contact.
 *
 * It is a `Mass` now rather than a `taperedWedge`, so it wears the same knuckle, the
 * same tumblehome and the same running-light chine as the hull it hangs off.
 */
const MR_POD = new Mass([
  [-62, 4.6, 2.4, -3.0, 0.50, 0.44, 0.88],
  [-20, 7.0, 3.8, -4.6, 0.46, 0.38, 0.90],
  [26, 6.0, 3.2, -4.0, 0.42, 0.32, 0.96],
  [58, 2.6, 0.6, -2.4, 0.36, 0.26, 1.04],
], { label: 'meridian pod' });
const MR_POD_X = 30;
const MR_POD_Y = -11;

/** The pylon carrying it: a blade, span outboard from the flank to the pod. */
const MR_PYLON = [
  [13.0, -14, 42, 5.0],
  [MR_POD_X, -12, 30, 4.0],
];

/**
 * Starboard ventral strake: `[span, zCentre, chord, thickness]`. Genuinely
 * FORWARD-swept - the chord centre moves 30 m FORWARD as the span goes outboard, so
 * the tip leads the root. Nothing else in the game does that, and it is what keeps
 * this class's plan view from being the corvette's plan view.
 */
const MR_STRAKE = [
  [10.0, -19, 62, 5.0],
  [17.0, -5, 56, 3.8],
  [24.0, 11, 42, 2.4],
];

/**
 * THE VENTRAL SENSOR KEEL, and it is now a blade rather than a wedge: 23 m below a
 * hull that is only 24 m deep. From the beam that is a bulge under a blade under a
 * sail, which is a three-level profile neither the corvette nor the destroyer has,
 * and it is the other half of the "tall and narrow" separation move.
 */
const MR_KEEL = [
  [0, -34, 66, 10.0],
  [10, -32, 56, 7.0],
  [18, -30, 40, 4.0],
  [23, -28, 24, 2.0],
];

function frigateParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();
  const card = lod >= 2 ? SECTION_LOD.far : SECTION_LOD.full;

  if (lod >= 2) {
    B.add('core', 'hull', MR_HULL.loft({ at: [-96, -4, 40, 76], keep: card, capFront: false }));
    // The sail carries the class at any distance, so it survives to the far LOD.
    B.add('core', 'hull', spanY(bladeGeo(MR_SAIL, { deckFlat: 0.26, keep: card, root: false })),
      { pos: [0, 6, 0] });
    B.add('core', 'hull', spanY(bladeGeo(MR_KEEL, { deckFlat: 0.30, keep: card, root: false }), -HALF_PI),
      { pos: [0, -7, 0] });
    // So does the single outrigger: an asymmetric plan contact at 30 px is the whole
    // point of the feature and it cannot be the first thing simplified away.
    B.add('core', 'hull', MR_POD.loft({ at: [-20, 26], keep: card }),
      { pos: [MR_POD_X, MR_POD_Y, -4] });
    for (const geo of bladePair(spanX(bladeGeo(MR_STRAKE, { deckFlat: 0.28, keep: card, root: false })))) {
      B.add('core', 'hull', geo, { pos: [0, -8, 0] });
    }
    return { buckets: B.list() };
  }

  // --- 1. spindle, and the prow is the hull's own chisel --------------------
  B.add('core', 'hull', MR_HULL.loft({
    capFront: false, at: full ? null : [-96, -64, -4, 40, 76],
  }));
  B.add('core', 'emissive', glowSlot(1.4, 0.8), { pos: [0, -6.4, 105.2] });

  // --- 1b. the surface: frames, ONE continuous strake a side, cut apertures --
  if (full) {
    B.add('core', 'plating', MR_HULL.frames(MR_FRAMES, { detail: D }));
    for (const side of [-1, 1]) {
      B.add('core', 'dark', MR_HULL.plate({
        z0: -100, z1: 66, side, facet: FACET.lowerFlank, t0: 0.06, t1: 0.94, out: 0.55,
      }));
    }
    // A boat bay to port and a long duct to starboard at a different station and a
    // different length. Mirrored detail is the strongest tell of procedural
    // placement there is (common.js#Mass, "NOTHING DENSE IS MIRRORED").
    B.add('core', 'dark', MR_HULL.intake({
      z0: -78, z1: -6, side: -1, facet: FACET.upperFlank, t0: 0.30, t1: 0.64, depth: 1.6,
    }));
    B.add('core', 'dark', MR_HULL.intake({
      z0: -44, z1: 42, side: 1, facet: FACET.deckChamfer, t0: 0.34, t1: 0.70, depth: 1.2,
    }));
  }

  // --- 2. THE SAIL. The class read. ---------------------------------------
  // Tall, raked, amidships. The corvette's fin is small and far aft, and the
  // destroyer's pair is canted and at the stern, so no two resolve to the same shape
  // from the beam.
  B.add('core', 'hull', spanY(bladeGeo(MR_SAIL, { knuckle: 0.44, deckFlat: 0.26, root: false })),
    { pos: [0, 6, 0] });
  if (full) {
    // Sensor strip up the leading edge instead of a mast. Concord hides its aerials.
    B.add('core', 'trim', G.panelledSlab({ width: 1.0, height: 26, depth: 1.0, detail: D }),
      { pos: [0, 30, -14], rot: [0.34, 0, 0] });
  }

  // --- 2b. THE OUTRIGGER, AND THERE IS ONLY ONE OF IT ----------------------
  B.add('core', 'hull', MR_POD.loft(), { pos: [MR_POD_X, MR_POD_Y, -4] });
  B.add('core', 'plating', spanX(bladeGeo(MR_PYLON, { knuckle: 0.46, deckFlat: 0.34, root: false, tip: false })),
    { pos: [0, -9, 0] });
  if (full) {
    B.add('core', 'dark', MR_POD.intake({
      z0: -50, z1: 20, side: 1, facet: FACET.upperFlank, t0: 0.32, t1: 0.68, depth: 0.8,
    }), { pos: [MR_POD_X, MR_POD_Y, -4] });
    B.add('core', 'runningLights', G.place(chineStrip(MR_POD, -56, 50, 1, { width: 1.6 }),
      { pos: [MR_POD_X, MR_POD_Y, -4] }));
  }
  B.add('engine', 'emissive', glowSlot(5.0, 3.4), { pos: [MR_POD_X, MR_POD_Y + 1.4, -66.4], rot: [0, PI, 0] });

  // --- 3. ventral strakes, swept FORWARD -----------------------------------
  for (const geo of bladePair(spanX(bladeGeo(MR_STRAKE, {
    knuckle: 0.44, deckFlat: 0.28, flare: 1.05, root: false,
  })))) {
    B.add('core', 'plating', geo, { pos: [0, -8, 0] });
  }

  // --- 4. weapons: recessed slots, three a side ----------------------------
  //
  // These were `blastDoor` boxes standing PROUD of the flank - a 16 x 5 slab lying on
  // a curved surface, which is the exact move the section audit measures as "box".
  // A recess is the opposite move, it is cheaper, and its four walls face four
  // directions so at least two are always turned away from the key.
  for (const s of [-1, 1]) {
    for (const dz of full ? [26, -2, -30] : [-2]) {
      B.add('core', 'dark', MR_HULL.recess({
        z: dz, side: s, facet: FACET.upperFlank, t: 0.42,
        width: 15, height: 4.6, depth: 2.0, wall: 0.9, detail: D,
      }));
      if (full) {
        B.add('core', 'emissive', glowSlot(12, 0.7),
          { pos: [s * 15.4, 1.0, dz], rot: [0, s * HALF_PI, 0] });
      }
    }
  }
  // Two flush dorsal blisters. A dome, not a turret: the barrels live inside.
  for (const dz of full ? [26, -2] : [12]) {
    B.add('core', 'plating', G.mountPad({ radius: 6.0, height: 2.6, sides: 8, detail: D }),
      { pos: [0, 7.6, dz] });
  }
  // Ventral sensor keel. The frigate's third mass, and 23 m of it: from the beam it
  // is a bulge under a blade, a shape neither the corvette nor the destroyer has.
  B.add('core', 'hull', spanY(bladeGeo(MR_KEEL, { knuckle: 0.46, deckFlat: 0.30, root: false }), -HALF_PI),
    { pos: [0, -7, 0] });
  if (full) {
    B.add('core', 'emissive', glowSlot(6, 22), { pos: [-3.4, -26, -32], rot: [0, -HALF_PI, 0] });
  }

  // --- 5. stern: one wide bar of light in the hull's own transom ------------
  for (const s of [-1, 1]) {
    B.add('engine', 'emissive', glowSlot(5.4, 3.0), { pos: [s * 3.4, -0.6, -104.2], rot: [0, PI, 0] });
  }

  if (full) {
    B.add('core', 'emissive', glowSlot(9.0, 1.2), { pos: [0, 8.0, 44], rot: [-0.4, 0, 0] });
    // The single accent line, on the port shoulder, laid on the deck chamfer.
    B.add('core', 'trim', MR_HULL.plate({
      z0: -60, z1: 50, side: -1, facet: FACET.deckChamfer, t0: 0.28, t1: 0.48,
      drift: 0.20, out: 0.30,
    }));
  }

  // --- 6. running lights ---------------------------------------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(MR_HULL, -100, 90, s, { width: 2.0 }));

  return { buckets: B.list() };
}

// ===========================================================================
// ESCORT — "Halcyon", 300 m.  THE FLYING WING.        *** NEW ***
// ===========================================================================

/**
 * The one shape neither navy had: a hull that is WIDER THAN IT IS LONG-ish.
 * 190 m of beam on 300 m of length is 1.58 : 1, against the Meridian's 7.2 : 1 and
 * the Peregrine's 2.7 : 1, so in plan it is an arrowhead and in profile it is a
 * razor - 38 m of hull depth over 300 m of length, the thinnest thing in the game.
 * Its one vertical event is a single ventral keel-blade dropping 95 m, which is
 * two and a half times the hull's own depth.
 *
 * That combination - very wide, very thin, one deep blade underneath - is not
 * available to any other class, and it is what an escort is for: a platform that
 * is all sensor aperture and all weapon arc and almost no target.
 */
const HC_HULL = new Mass([
  // [z, half, top, bottom, knuckle, deckFlat, flare]
  // The WIDEST deckFlat in either navy - 0.60-0.70 against the Meridian's 0.18-0.52.
  // An escort is a platform and its section says so: the deck is a working flat and
  // the flanks are two short chamfers under it, where the frigate's section is a
  // blade with a 20% flat on top of it.
  [-150, 11, 5.0, -6.0, 0.52, 0.60, 0.88],
  [-124, 9, 4.0, -5.0, 0.53, 0.62, 0.88],
  [-60, 22, 10.0, -12.0, 0.50, 0.66, 0.86],
  [10, 27, 12.0, -14.0, 0.47, 0.70, 0.84],
  [78, 21, 9.0, -12.0, 0.44, 0.62, 0.90],
  [122, 12, 4.0, -9.0, 0.38, 0.44, 1.02],
  [150, 4, -5.0, -9.0, 0.34, 0.26, 1.00],
], { label: 'halcyon' });

/** Five frames at the fleet rhythm on a 300 m class: 21-30 m apart. */
const HC_FRAMES = HC_HULL.frameStations({ length: 300, count: 5, from: -130, to: 90 });

/**
 * THE WING, as `[span, zCentre, chord, thickness]`. A cranked delta: the chord
 * centre walks 56 m aft over 73 m of span while the chord itself falls from 132 to
 * 52, so the leading edge sweeps gently and the trailing edge sweeps hard. Tip at
 * x 95, i.e. 190 m of beam on 300 m of length - the widest ratio in the game.
 *
 * The root is at span 22, inside the body's own 27 m half-beam, and uncapped: this
 * is ONE CONTINUOUS SURFACE from spar to tip, not a plate taped to a hull.
 */
const HC_WING = [
  [22, -4, 132, 18.0],
  [52, -26, 112, 12.0],
  [78, -50, 78, 7.0],
  [95, -60, 52, 3.5],
];

/** The canard: much smaller, well forward, and at the OPPOSITE sweep. */
const HC_CANARD = [
  [14, 87, 42, 7.0],
  [33, 79, 44, 5.0],
  [50, 71, 38, 3.0],
];

/**
 * THE KEEL BLADE. The class's only vertical event: 78 m below a hull that is 26 m
 * deep. Sensor aperture, and the reason the class is not a flat smear from the beam.
 */
const HC_KEEL = [
  [0, -35, 150, 12.0],
  [30, -44, 120, 9.0],
  [56, -50, 92, 6.0],
  [78, -54, 74, 3.5],
];

/** A smaller second blade, forward and offset to PORT. Never a mirrored pair. */
const HC_BLADE2 = [
  [0, 118, 62, 6.0],
  [16, 112, 48, 4.0],
  [30, 106, 32, 2.2],
];

/** The wingtip drive pod, in its own frame. Placed at +-HC_POD_X. */
const HC_POD = new Mass([
  [-26, 6.0, 3.4, -4.4, 0.52, 0.50, 0.88],
  [4, 10.0, 5.6, -6.8, 0.46, 0.42, 0.88],
  [24, 6.0, 3.0, -4.6, 0.40, 0.32, 1.00],
], { label: 'halcyon pod' });
const HC_POD_X = 80;

/** The one dorsal mass: a long low faired blister, no mast. Its own section. */
const HC_DORSAL = new Mass([
  [-58, 13, 5.0, -4.0, 0.50, 0.52, 0.90],
  [-6, 17, 7.6, -5.0, 0.46, 0.46, 0.88],
  [48, 11, 4.4, -3.6, 0.40, 0.34, 0.98],
], { label: 'halcyon dorsal' });

function halcyonParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();
  const card = lod >= 2 ? SECTION_LOD.far : SECTION_LOD.full;

  if (lod >= 2) {
    B.add('core', 'hull', HC_HULL.loft({ at: [-124, 10, 122], keep: card, capFront: false }));
    for (const geo of bladePair(spanX(bladeGeo(HC_WING, { deckFlat: 0.34, keep: card, root: false })))) {
      B.add('core', 'hull', geo, { pos: [0, -2, 0] });
    }
    for (const geo of bladePair(spanX(bladeGeo(HC_CANARD, { deckFlat: 0.32, keep: card, root: false })))) {
      B.add('core', 'hull', geo, { pos: [0, 0, 0] });
    }
    // The keel blade: the only vertical event, so it is the last thing to go.
    B.add('core', 'hull', spanY(bladeGeo(HC_KEEL, { deckFlat: 0.34, keep: card, root: false }), -HALF_PI),
      { pos: [0, -16, 0] });
    return { buckets: B.list() };
  }

  // --- 1. the body. Thin, and it is the SPAR the wings grow from. ----------
  B.add('core', 'hull', HC_HULL.loft({
    capFront: false, at: full ? null : [-124, -60, 10, 78, 122],
  }));
  B.add('core', 'emissive', glowSlot(2.0, 0.9), { pos: [0, -7.4, 150.2] });

  if (full) {
    B.add('core', 'plating', HC_HULL.frames(HC_FRAMES, { detail: D }));
    // ONE continuous strake a side, below the knuckle, where `dark` belongs.
    for (const side of [-1, 1]) {
      B.add('core', 'dark', HC_HULL.plate({
        z0: -140, z1: 100, side, facet: FACET.lowerFlank, t0: 0.06, t1: 0.94, out: 0.9,
      }));
    }
    // A 90 m boat bay in the PORT flank only, and a shorter duct to starboard.
    B.add('core', 'dark', HC_HULL.intake({
      z0: -110, z1: -14, side: -1, facet: FACET.upperFlank, t0: 0.28, t1: 0.62, depth: 2.4,
    }));
    B.add('core', 'dark', HC_HULL.intake({
      z0: -40, z1: 60, side: 1, facet: FACET.deckChamfer, t0: 0.36, t1: 0.72, depth: 1.8,
    }));
  }

  // --- 2. THE WING. One continuous surface from root to tip. ---------------
  const wing = bladePair(spanX(bladeGeo(HC_WING, {
    knuckle: 0.46, deckFlat: 0.34, flare: 1.04, root: false,
  })));
  const canard = bladePair(spanX(bladeGeo(HC_CANARD, {
    knuckle: 0.42, deckFlat: 0.32, flare: 1.02, root: false,
  })));
  for (const s of [-1, 1]) {
    const i = s > 0 ? 0 : 1;
    B.add('core', 'hull', wing[i], { pos: [0, -2, 0] });
    // Canard forward, much smaller and at the opposite sweep: the plan outline has
    // two events on each side, not one, so it is an arrowhead and not a triangle.
    B.add('core', 'plating', canard[i], { pos: [0, 1, 0] });
    // Wingtip drive: a pod cut from the same section as the hull, with the drive as
    // a lit slot in its own transom. Concord: recessed, no nozzle, a bar of light.
    B.add('engine', 'hull', HC_POD.loft({ keep: card, capBack: false }),
      { pos: [s * HC_POD_X, -2, -96] });
    B.add('engine', 'emissive', glowSlot(15, 6), { pos: [s * HC_POD_X, -2, -122.2], rot: [0, PI, 0] });
    if (full) {
      // Weapon slots along the wing leading edge, three a side, unevenly spaced.
      // Recesses, not proud blast doors: apertures in a surface, which is the whole
      // Concord weapon language and also the cheaper geometry.
      for (const [x, z, w] of [[s * 40, 34, 22], [s * 58, 6, 20], [s * 74, -32, 16]]) {
        B.add('core', 'dark', G.recess({ width: w, height: 5, depth: 2.4, wall: 1.0, detail: D }),
          { pos: [x, 2.6, z], rot: [-HALF_PI, 0, 0] });
        B.add('core', 'emissive', glowSlot(w * 0.78, 0.9), { pos: [x, 3.4, z], rot: [-HALF_PI, 0, 0] });
      }
    }
  }

  // --- 3. THE KEEL BLADE. The class's only vertical event. -----------------
  B.add('core', 'hull', spanY(bladeGeo(HC_KEEL, { knuckle: 0.46, deckFlat: 0.34, root: false }), -HALF_PI),
    { pos: [0, -16, 0] });
  if (full) {
    // A second, much smaller blade forward and offset to port. Two blades of clearly
    // different size read as equipment; two of the same size read as fins.
    B.add('core', 'plating', spanY(bladeGeo(HC_BLADE2, { deckFlat: 0.30, root: false }), -HALF_PI),
      { pos: [-9, -14, 0] });
    B.add('core', 'trim', HC_HULL.plate({
      z0: -90, z1: 70, side: -1, facet: FACET.deckChamfer, t0: 0.30, t1: 0.46,
      drift: 0.22, out: 0.55,
    }));
  }

  // --- 4. dorsal: one low faired mass, no mast -----------------------------
  B.add('core', 'plating', HC_DORSAL.loft({ keep: card }), { pos: [0, 9, -6] });
  if (full) {
    B.add('core', 'emissive', glowSlot(14, 1.2), { pos: [0, 15.4, 40], rot: [-0.4, 0, 0] });
  }

  // --- 5. running lights: body and both wing tips --------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(HC_HULL, -142, 132, s, { width: 2.6 }));
    B.add('core', 'runningLights', lightRun([s * 92, 1, -26], [s * 74, 1, -96], [0, 1, 0], 2.4));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// DESTROYER — "Peregrine", 480 m. A trimaran with a crest.
// ===========================================================================

/**
 * THE FIX FOR "A HORIZONTAL SMEAR WITH LITTLE VERTICAL EVENT".
 *
 * The defect, quoted from docs/review/acceptance.md, was real and the previous
 * attempt at it was the wrong shape of answer: it bolted a 20 m spine slab and a
 * pair of tail fins onto a hull whose own top line ran dead flat for 360 m. A
 * feature added ON TOP of a flat hull is still a flat hull with a feature on it.
 *
 * The vertical event is now IN THE HULL LINES. The top of the section rises from
 * +8 at the transom to +98 at z = -30 and falls to -16 at the stem: a 114 m sweep
 * on a 480 m ship, three inflections, and not one horizontal anywhere. The hull is
 * 140 m deep at its deepest against 40 m before, i.e. 29% of its own length, which
 * is the Homeworld destroyer proportion rather than the airliner proportion.
 *
 * That is also the faction-correct answer. Coalition builds a vertical event by
 * standing a blockhouse on a deck; Concord builds one by SWEEPING THE HULL UP into
 * a crest, because on a Concord ship every mass grows out of the hull line.
 *
 * Around it: two 220 m nacelles slung 30 m LOW on swept pylons with forty metres of
 * daylight between them and the hull, and two canted fins over the stern. From the
 * beam it is a fin; from astern a V between two low nacelles; in plan three
 * parallel blades. Nothing about that reads as a scaled-up Meridian.
 */
const PG_HULL = new Mass([
  // [z, half, top, bottom, knuckle, deckFlat, flare]
  //
  // THE CREST IS IN THIS TABLE AND IT STAYS IN THIS TABLE. The `top` column rises
  // from +8 at the transom to +98 at z -30 and falls to -16 at the stem: 114 m of
  // sweep on a 480 m ship, three inflections, not one horizontal. That is the class,
  // and it is the faction-correct way to build a vertical event - Coalition stands a
  // blockhouse on a deck, Concord SWEEPS THE HULL UP.
  //
  // `knuckle` is pinned at its 0.55 ceiling through the crest for a reason worth
  // stating: it is a fraction of section DEPTH, and the section here is 140 m deep,
  // so 0.55 puts the widest point of the section at y +21 - down at the hull's own
  // waterline body, with 77 m of crest flank raking up above it to a 17 m ridge.
  // The knuckle line over the eight stations runs -3.7, -2.5, +11.4, +21, +8.1,
  // +0.7, -7, -19.2: a fair sheer, which is what the running-light chine follows.
  [-240, 12, 8, -14, 0.53, 0.52, 0.86],
  [-190, 9, 14, -16, 0.55, 0.50, 0.88],
  [-120, 26, 62, -30, 0.55, 0.34, 0.86],
  [-30, 33, 98, -42, 0.55, 0.26, 0.84],
  [60, 27, 62, -36, 0.55, 0.28, 0.86],
  [130, 16, 34, -30, 0.52, 0.32, 0.98],
  [200, 7, 4, -20, 0.46, 0.28, 1.06],
  [240, 2.5, -16, -24, 0.40, 0.22, 1.00],
], {
  label: 'peregrine',
  // The ONE declared exemption in this file, in the form the class asks for: a
  // reason, not a boolean. Beam:depth runs 1.09 at the transom down to 0.47 under
  // the crest peak, against the 1.60 floor. A hull that is taller than it is wide is
  // normally from a different game - but this one is 29% of its own length deep on
  // purpose ("the Homeworld destroyer proportion rather than the airliner
  // proportion"), and the alternative measured worse: lifting the crest into a
  // separate mass so the body could pass left the body's KEEL 20 m shallower, and
  // `concord_frigate / concord_destroyer` fell from 12.0 to 10.7 against a 10.0 bar.
  // The separation is the gate; beam:depth is a finding. This is the trade, declared.
  exempt: 'the crest IS the class: 114 m of rise on 480 m of length, 29% of its own '
    + 'length deep. Splitting it out to pass cost 1.3 m of frigate/destroyer outline '
    + 'separation against a 10.0 m bar, which is the gate that actually fails.',
});

/** Six frames at the fleet rhythm on a 480 m class: 34-48 m apart. */
const PG_FRAMES = PG_HULL.frameStations({ length: 480, count: 6, from: -200, to: 160 });

/**
 * Outrigger nacelle, 220 m, carried at x = +-88 and 34 m BELOW the centreline.
 *
 * Both of those numbers are silhouette decisions. Outboard far enough that there
 * is forty metres of daylight between hull and nacelle in plan - otherwise the
 * pylons fill the gap and the trimaran collapses into one delta, which is exactly
 * what happened the first time. Slung LOW so the profile is a three-level stack:
 * crest on top, hull in the middle, nacelles below.
 *
 * Both of those are COMPOSITION, not gate. Measured while pinning the fins: setting
 * `PG_NACELLE_Y` to 0 leaves concord_destroyer at height 169.3 and the
 * frigate/destroyer peak at 49.6 unmoved, because the hull's own keel is deeper and
 * the fins own the top. Keep the drop because the three-level read is the class; do
 * not keep it under the impression that the audit is holding it up.
 */
const PG_NACELLE = new Mass([
  [-150, 6.0, 3.2, -4.0, 0.52, 0.48, 0.88],
  [-108, 11.0, 6.0, -7.0, 0.50, 0.44, 0.88],
  [-40, 13.0, 7.0, -8.4, 0.46, 0.38, 0.88],
  [34, 10.0, 5.4, -6.4, 0.42, 0.32, 0.96],
  [70, 4.4, 1.2, -4.0, 0.36, 0.26, 1.02],
], { label: 'peregrine nacelle' });
const PG_NACELLE_X = 88;
const PG_NACELLE_Y = -34;

/**
 * The forward and aft pylons as blades: `[span, zCentre, chord, thickness]`, span
 * outboard from the flank to the nacelle. Thick in Y so they read as structure
 * edge-on, short in Z so most of the forty metres between hull and nacelle stays
 * open sky in plan. A short stubby pylon reads as a packing crate between two ships.
 */
const PG_PYLON_F = [
  [26, 35, 50, 11],
  [82, 3, 35, 9],
];
const PG_PYLON_A = [
  [28, -76, 48, 11],
  [82, -99, 42, 9],
];
const PG_PYLON_Y = -24;

/**
 * One tail fin, 86 m of span, raked hard aft: the chord centre walks 59 m aft over
 * the span, so from the beam the fin is a long diagonal rather than a plate.
 *
 * THE CANT WAS INVERTED AND IT IS FIXED HERE. The pair was placed with
 * `rot [0, 0, s * 0.42]`, which leans the STARBOARD fin's tip to PORT: measured, the
 * starboard tip landed at x -22 having started at x +13, so the two fins crossed each
 * other over the centreline and the file's own comment ("from astern a V") described
 * a shape the geometry did not make. `HALF_PI - s * 0.42` splays them outward.
 *
 * THAT FIX IS NOT FREE, whatever this comment used to say. It claimed the change was
 * "silhouette-NEUTRAL" because the nacelles hold max |x| through every bin the fins
 * occupy and both fins reach y 118 either way. The first half is true and beside the
 * point and the second is simply wrong: the argument was made entirely in PLAN, and
 * the metric scores the PROFILE too. Reverting it reds the audit. The measurement is
 * on the `fin` builder below - read it before you touch either number.
 */
const PG_FIN = [
  [0, -136, 104, 5.5],
  [34, -158, 88, 4.5],
  [62, -178, 70, 3.2],
  [86, -195, 54, 2.0],
];

function destroyerParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();
  const card = lod >= 2 ? SECTION_LOD.far : SECTION_LOD.full;
  // LOAD-BEARING AND MEASURED. This roll and the `y 40` in the fin's mount below hold
  // the tightest pair in the faction: `concord_frigate / concord_destroyer`, peak 49.6
  // against a 40.0 m bar, 9.6 m of margin. Each was reverted ON ITS OWN with nothing
  // else changed and `node src/art/geometry/ships/audit.mjs` re-run:
  //
  //   `HALF_PI - s * 0.42` -> `s * 0.42`   (the pre-fix cant: fins lie near-horizontal)
  //     concord_destroyer  height 169.3 -> 158.3,  beam UNCHANGED at 202
  //     frigate / destroyer  max 49.6 -> 38.3  TOO CLOSE
  //     *** INTRA-FACTION SEPARATION FAILED ***   the audit exits 1
  //
  //   fin mount `[s * 13, 40, 0]` -> `[s * 13, 0, 0]`   (drop the 40 m lift)
  //     concord_destroyer  height 169.3 -> 158.3,  beam UNCHANGED at 202
  //     frigate / destroyer  max 49.6 -> 32.9  TOO CLOSE
  //     *** INTRA-FACTION SEPARATION FAILED ***   the audit exits 1
  //
  // The unchanged beam is the whole lesson, and it is how the neutrality claim above
  // came to be written: BOTH reverts leave beam at 202 and the nacelles still own max
  // |x| in every bin, so a plan-view argument says either is free. It is not, because
  // `silhouetteSignature` (common.js:1367) bins TOP and BOTTOM as well as half-width.
  // What these two numbers hold is the aft PROFILE - fins near-vertical and lifted
  // clear of the crest are 11 m of stern height the Meridian's single upright sail has
  // nowhere to match. Flatten them or set them down and this class's tail collapses
  // onto the frigate's.
  //
  // The `s * 13` stagger in that same mount is genuinely cosmetic and was measured to
  // say so: `s * 0` leaves the peak at 49.6 (mean 11.6 -> 11.3, bar 10.0). Spend that
  // one if you need it. Do not spend the other two.
  const fin = (s) => spanY(bladeGeo(PG_FIN, { deckFlat: 0.28, keep: card, root: false }),
    HALF_PI - s * 0.42);
  // Built ONCE and indexed, not rebuilt inside the side loop: `bladePair` mirrors a
  // geometry, and mirroring the same blade four times to use two of them is the kind
  // of build-time waste that turns into a two-second probe.
  const pylonF = bladePair(spanX(bladeGeo(PG_PYLON_F, { knuckle: 0.46, deckFlat: 0.40, keep: card })));
  const pylonA = bladePair(spanX(bladeGeo(PG_PYLON_A, { knuckle: 0.46, deckFlat: 0.40, keep: card })));

  if (lod >= 2) {
    // -190 is the waist, -30 the crest peak, 130 the chine break.
    B.add('core', 'hull', PG_HULL.loft({ at: [-190, -120, -30, 130], keep: card, capFront: false }));
    for (const s of [-1, 1]) {
      B.add('core', 'hull', PG_NACELLE.loft({ at: [-108, -40], keep: card }),
        { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
      for (const pair of [pylonF, pylonA]) {
        B.add('core', 'hull', pair[s > 0 ? 0 : 1], { pos: [0, PG_PYLON_Y, 0] });
      }
      // The twin fins carry the class from the beam, so they survive to the far LOD
      // exactly as the Coalition destroyer's waist does. The 40 is measured and
      // load-bearing - see the note on `fin` above before changing it here or at LOD0.
      B.add('core', 'hull', fin(s), { pos: [s * 13, 40, 0] });
    }
    return { buckets: B.list() };
  }

  // --- 1. central blade, crest and all -------------------------------------
  B.add('core', 'hull', PG_HULL.loft({
    capFront: false, at: full ? null : [-190, -120, -30, 60, 130, 200],
  }));
  B.add('core', 'emissive', glowSlot(2.6, 1.6), { pos: [0, -20.0, 240.4] });

  if (full) {
    B.add('core', 'plating', PG_HULL.frames(PG_FRAMES, { detail: D }));
    for (const side of [-1, 1]) {
      B.add('core', 'dark', PG_HULL.plate({
        z0: -220, z1: 170, side, facet: FACET.lowerFlank, t0: 0.06, t1: 0.94, out: 1.3,
      }));
    }
    // Lance rails: two skin plates down the nose, laid on the deck chamfer so they
    // follow the section instead of being two bars at a fixed x.
    for (const side of [-1, 1]) {
      B.add('core', 'trim', PG_HULL.plate({
        z0: 120, z1: 226, side, facet: FACET.deckChamfer, t0: 0.34, t1: 0.50, drift: 0.16, out: 1.1,
      }));
    }
    // A 130 m boat bay in the PORT flank and a shorter duct to starboard: mirrored
    // detail is the strongest tell of procedural placement there is.
    B.add('core', 'dark', PG_HULL.intake({
      z0: -170, z1: -40, side: -1, facet: FACET.upperFlank, t0: 0.26, t1: 0.60, depth: 3.4,
    }));
    B.add('core', 'dark', PG_HULL.intake({
      z0: -60, z1: 70, side: 1, facet: FACET.deckChamfer, t0: 0.34, t1: 0.68, depth: 2.6,
    }));
  }

  // --- 2. the outriggers. The class read. ---------------------------------
  for (const s of [-1, 1]) {
    B.add('engine', 'hull', PG_NACELLE.loft({
      capFront: false, at: full ? null : [-108, -40, 34],
    }), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
    for (const pair of [pylonF, pylonA]) {
      B.add('core', 'plating', pair[s > 0 ? 0 : 1], { pos: [0, PG_PYLON_Y, 0] });
    }
    // Nacelle drive: a lit slot in the nacelle's own transom, no housing.
    B.add('engine', 'emissive', glowSlot(8.4, 4.2),
      { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, -150.4], rot: [0, PI, 0] });
    if (full) {
      B.add('engine', 'dark', PG_NACELLE.plate({
        z0: -140, z1: 50, side: s, facet: FACET.lowerFlank, t0: 0.08, t1: 0.92, out: 0.5,
      }), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
    }
  }

  // --- 3. the tail: TWO CANTED FINS, splayed 24 degrees --------------------
  //
  // A pair of fins is not a sail: from the beam it reads as one tall mass with a
  // notch, from astern as a V, and in plan as two blades outboard of the crest. The
  // Meridian's single upright sail cannot be confused with it at any angle, and this
  // class is the only Concord hull that is TALL AT THE BACK AND TALL IN THE MIDDLE.
  // "Tall at the back" is not a description here, it is the measurement: the cant in
  // `fin` and the 40 in this mount are each worth more than the frigate/destroyer
  // margin on their own. The note on `fin` has the numbers and the failing output.
  for (const s of [-1, 1]) B.add('core', 'plating', fin(s), { pos: [s * 13, 40, 0] });
  // Blisters set INTO the crest, flush. There is no plinth: a Concord turret does
  // not stand on a pad, it opens in a surface.
  for (const dz of full ? [40, -30, -96] : [-30]) {
    const c = PG_HULL.at(dz);
    B.add('core', 'plating', G.mountPad({ radius: 13, height: 5.5, sides: 8, detail: D }),
      { pos: [0, c.top - 2.4, dz] });
  }
  if (full) {
    B.add('core', 'trim', G.panelledSlab({ width: 1.6, height: 26, depth: 1.6, detail: D }),
      { pos: [0, 66, -150], rot: [0.5, 0, 0] });
    B.add('core', 'emissive', glowSlot(16, 2.0), { pos: [0, 40.0, 118], rot: [-0.5, 0, 0] });
  }

  // --- 4. flank slots + ventral hangar -------------------------------------
  for (const s of [-1, 1]) {
    for (const dz of full ? [56, 0, -56] : [0]) {
      B.add('core', 'dark', PG_HULL.recess({
        z: dz, side: s, facet: FACET.upperFlank, t: 0.44,
        width: 34, height: 10, depth: 4.4, wall: 1.8, detail: D,
      }));
      if (full) {
        B.add('core', 'emissive', glowSlot(27, 1.6), { pos: [s * 33.4, 2, dz], rot: [0, s * HALF_PI, 0] });
      }
    }
  }
  // Hangar: a 120 m trench sunk into the ventral centreline with a lit throat, no
  // doors visible. It is cut INTO the keel facet rather than being a 26 x 62 box
  // hung under the hull, which is the difference between a hangar and a crate.
  B.add('core', 'dark', PG_HULL.intake({
    z0: -80, z1: 40, side: 1, facet: FACET.keel, t0: 0.10, t1: 0.86, depth: 6.0,
  }));
  B.add('core', 'dark', PG_HULL.intake({
    z0: -80, z1: 40, side: -1, facet: FACET.keel, t0: 0.10, t1: 0.86, depth: 6.0,
  }));
  B.add('core', 'emissive', glowSlot(20, 44), { pos: [0, -38.0, -20], rot: [HALF_PI, 0, 0] });

  // --- 5. stern: one wide bar of light in the hull's own transom ------------
  B.add('engine', 'emissive', glowSlot(19, 8), { pos: [0, -2, -239.4], rot: [0, PI, 0] });

  // --- 6. running lights: hull and both nacelles ---------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(PG_HULL, -232, 224, s, { width: 3.4 }));
    B.add('engine', 'runningLights', G.place(chineStrip(PG_NACELLE, -144, 64, s, { width: 2.4 }),
      { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// TENDER — "Solace", 620 m.  THE CRADLE.            *** NEW ***
// ===========================================================================

/**
 * Concord's support and repair ship, and the answer to the same question the
 * Coalition carrier answers - "what does a hole 300 m across look like in THIS
 * navy?" - given in the opposite vocabulary.
 *
 * The Coalition's Anvil makes its hole by leaving a gap between two side hulls and
 * bridging it with visible structure. The Solace makes its hole by sweeping TWO
 * CRADLE ARMS out of its own flanks at z = -60, curving them down and forward, and
 * closing them under the bow at z = +250. The result is a single enclosed teardrop
 * void 340 m long and 150 m deep between the arms and the keel - big enough that a
 * 210 m frigate sits inside it - with no strut, no truss and no pylon anywhere.
 * You cannot see how it is held together, which is the faction.
 *
 * From the beam: a slender hull with an eye in it. From below: a closed loop. In
 * plan: a narrow blade inside a wide oval. Nothing else in the game is a closed
 * curve, and at thirty pixels the enclosed void is the only thing you need.
 */
const SL_HULL = new Mass([
  // [z, half, top, bottom, knuckle, deckFlat, flare]
  //
  // The hull carries SHEER rather than depth: the deck runs +12 -> +30 -> -6 while
  // the keel stays inside -3 .. -14, so the body is flat (1.67-2.00 beam:depth) and
  // the mass goes into the two fairings that grow off it - the spine above and the
  // ventral below. That is the Concord answer to "where does a 620 m support hull
  // put its volume": not in one deep prism, in three lofts that share a chine.
  // TWELVE STATIONS on 620 m - one every 56 m, the cruiser's own 48 m rhythm. The
  // seven-station table this replaced put 140 m of straight-line interpolation
  // between two nearly identical sections either side of the shoulder, which is too
  // coarse to sweep anything: a taper that is one long chord has one normal, and
  // `clus` (distinct normal directions holding >= 1% of area) is what measures that.
  [-310, 15, 12, -6, 0.53, 0.58, 0.86],
  [-270, 12, 10, -3, 0.53, 0.60, 0.86],
  [-230, 16, 13, -4, 0.52, 0.58, 0.87],
  [-190, 21, 18, -6, 0.51, 0.56, 0.88],
  [-150, 27, 24, -8, 0.50, 0.54, 0.88],
  [-90, 31, 27, -10, 0.49, 0.51, 0.87],
  [-10, 35, 30, -12, 0.47, 0.48, 0.86],
  [70, 32, 28, -11, 0.45, 0.45, 0.88],
  [130, 29, 24, -10, 0.44, 0.42, 0.90],
  [190, 25, 19, -11, 0.42, 0.37, 0.96],
  [230, 20, 12, -12, 0.40, 0.32, 1.02],
  [310, 6, -6, -12, 0.34, 0.24, 1.00],
], { label: 'solace' });

/** Six frames at the fleet rhythm on a 620 m class: 44-62 m apart. */
const SL_FRAMES = SL_HULL.frameStations({ length: 620, count: 6, from: -260, to: 200 });

/** The dorsal spine: a long low faired mass, no mast. Its keel is inside the deck. */
const SL_SPINE = new Mass([
  [-170, 20, 40, 16, 0.52, 0.50, 0.90],
  [-80, 26, 52, 20, 0.48, 0.44, 0.88],
  [20, 23, 48, 22, 0.44, 0.38, 0.92],
  [110, 16, 38, 22, 0.40, 0.32, 1.00],
  [170, 9, 28, 18, 0.36, 0.26, 1.00],
], { label: 'solace spine' });

/** The ventral fairing: the machinery volume, under the keel and inside the void. */
const SL_VENTRAL = new Mass([
  [-210, 14, -2, -19, 0.52, 0.50, 0.90],
  [-120, 24, 0, -29, 0.49, 0.46, 0.89],
  [-40, 30, 2, -34, 0.46, 0.41, 0.87],
  [40, 28, 1, -32, 0.44, 0.38, 0.88],
  [120, 22, 0, -27, 0.42, 0.34, 0.92],
  [210, 13, -4, -20, 0.38, 0.28, 1.00],
], { label: 'solace ventral' });

/**
 * THE CRADLE ARM, port side, as a chain of segments from root to bow closure.
 * `[x, y, z, halfW, halfH]` - each pair of consecutive entries is lofted, so the
 * arm is ONE continuous swept surface rather than a run of struts. The x values
 * bow outward to 118 amidships and come back to 22 at the closure: that outward
 * bow is what makes the void an oval instead of a wedge.
 */
const SL_ARM = [
  [30, -18, -70, 15, 20],
  [78, -74, -20, 17, 22],
  [112, -128, 70, 18, 24],
  [118, -152, 150, 16, 21],
  [92, -156, 224, 13, 17],
  [46, -132, 272, 10, 13],
  [16, -96, 300, 8, 10],
];

/** Where the two arms meet under the bow: one closure block, so the loop is CLOSED. */
const SL_CLOSURE = new Mass([
  [-37, 20, 12, -12, 0.50, 0.46, 0.90],
  [0, 27, 14, -14, 0.46, 0.40, 0.88],
  [37, 18, 10, -11, 0.40, 0.32, 1.00],
], { label: 'solace closure' });

/**
 * One cradle arm as a single merged surface, starboard side.
 *
 * The path turns through ninety degrees in two planes, so a single `loft` cannot
 * do it; each pair of consecutive nodes becomes a tapered prism aimed down its own
 * segment. The two rotations are applied as two separate `place` calls rather than
 * composed into one XYZ Euler, for the reason stated in modules/kit.js#aimed: a
 * composed Euler at a seam is where the twelve-degrees-wrong bugs live.
 *
 * THE SECTION IS THE FLEET'S SECTION NOW. Each segment used to be an `octProfile` -
 * four orthogonal planes and four chamfers - so the two 340 m arms that ARE this
 * class were the largest axis-aligned surface in the Concord navy. They are cut from
 * `hullSection` here, the same twelve points as the hull they hang off, which is
 * what makes the arm read as an extension of the ship rather than as a girder.
 *
 * The port arm is produced by `G.mirrorGeometryX`, which negates x AND reverses
 * the triangle winding. It is NOT produced by a negative scale: a negative-
 * determinant transform inverts winding, three's normal matrix flips the normals to
 * compensate, and the rasteriser then culls every front face - the arm would render
 * inside-out, including in the shadow map. See hardpoints.js §3.
 */
function armLoft(keep) {
  const parts = [];
  const sect = (n) => hullSection({
    half: n[3], top: n[4], bottom: -n[4], knuckle: 0.46, deckFlat: 0.40, flare: 0.90,
    keep, label: 'solace arm',
  });
  for (let i = 0; i < SL_ARM.length - 1; i++) {
    const a = SL_ARM[i], b = SL_ARM[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / len)));
    const geo = G.loft([
      { z: 0, points: sect(a) },
      { z: len, points: sect(b) },
    ], { capFront: i === SL_ARM.length - 2, capBack: i === 0 });
    parts.push({ geo: G.place(G.place(geo, { rot: [pitch, 0, 0] }), { rot: [0, yaw, 0], pos: [a[0], a[1], a[2]] }) });
  }
  return G.mergeParts(parts);
}

/** Both arms. Starboard as authored, port properly mirrored. */
function cradleArms(keep = null) {
  const stbd = armLoft(keep);
  return [stbd, G.mirrorGeometryX(stbd)];
}

function tenderParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();
  const card = lod >= 2 ? SECTION_LOD.far : SECTION_LOD.full;

  if (lod >= 2) {
    B.add('core', 'hull', SL_HULL.loft({ at: [-270, -10, 230], keep: card, capFront: false }));
    B.add('core', 'hull', SL_SPINE.loft({ at: [-80], keep: card }));
    B.add('core', 'hull', SL_VENTRAL.loft({ at: [-40], keep: card }));
    // The arms ARE the class, so they survive whole. There is nothing else at this
    // range worth spending triangles on.
    for (const arm of cradleArms(card)) B.add('core', 'hull', arm);
    return { buckets: B.list() };
  }

  // --- 1. the spindle, and the two fairings that grow off it ---------------
  B.add('core', 'hull', SL_HULL.loft({
    capFront: false, at: full ? null : [-270, -190, -10, 130, 230],
  }));
  B.add('core', 'hull', SL_SPINE.loft({ at: full ? null : [-80, 20] }));
  B.add('core', 'hull', SL_VENTRAL.loft({ at: full ? null : [-120, -40, 120] }));
  B.add('core', 'emissive', glowSlot(2.2, 1.2), { pos: [0, -11, 310.2] });

  if (full) {
    B.add('core', 'plating', SL_HULL.frames(SL_FRAMES, { detail: D }));
    for (const side of [-1, 1]) {
      B.add('core', 'dark', SL_HULL.plate({
        z0: -290, z1: 250, side, facet: FACET.lowerFlank, t0: 0.06, t1: 0.94, out: 1.4,
      }));
    }
    // A 200 m cargo trench to PORT and a shorter one to starboard at a different
    // station: never a mirrored pair.
    B.add('core', 'dark', SL_HULL.intake({
      z0: -250, z1: -40, side: -1, facet: FACET.upperFlank, t0: 0.28, t1: 0.62, depth: 3.6,
    }));
    B.add('core', 'dark', SL_HULL.intake({
      z0: -60, z1: 90, side: 1, facet: FACET.deckChamfer, t0: 0.34, t1: 0.70, depth: 2.8,
    }));
  }

  // --- 2. THE CRADLE ARMS. One swept surface a side, root to closure. ------
  for (const arm of cradleArms()) B.add('core', 'hull', arm);
  // Where the two arms meet under the bow: one closure block, so the loop is
  // visibly CLOSED. An open loop is two arms; a closed one is a cradle.
  B.add('core', 'plating', SL_CLOSURE.loft(), { pos: [0, -92, 276], rot: [0.24, 0, 0] });

  if (full) {
    // Clamp pads on the INNER face of each arm, three a side at different z, so
    // the void reads as a working volume rather than as a decorative hole. They
    // are the only busy thing on the ship and they are inside a recess, which is
    // the only place Concord allows detail (§3, justification 2).
    for (const s of [-1, 1]) {
      for (const [x, y, z] of [[64, -70, -12], [104, -126, 92], [86, -150, 208]]) {
        B.add('core', 'greeble', G.mountPad({ radius: 13, height: 7, sides: 6, detail: D }),
          { pos: [s * x, y, z], rot: [0, 0, s * HALF_PI] });
        B.add('core', 'emissive', glowSlot(16, 3), { pos: [s * (x - 9), y, z], rot: [0, -s * HALF_PI, 0] });
      }
    }
    // Two tow beams that stay inside the void: they never break the outline, which
    // is the point - the outline belongs to the arms.
    B.add('core', 'greeble', G.hexStrut({ length: 96, radius: 7, axis: 'z', detail: D }),
      { pos: [-22, -60, 60], rot: [0.24, 0.14, 0] });
    B.add('core', 'greeble', G.hexStrut({ length: 72, radius: 6, axis: 'z', detail: D }),
      { pos: [26, -52, 150], rot: [0.18, -0.10, 0] });
  }

  // --- 3. dorsal: two flush blisters set into the spine --------------------
  for (const dz of full ? [-120, 20] : [-40]) {
    const c = SL_SPINE.at(dz);
    B.add('core', 'plating', G.mountPad({ radius: 15, height: 6, sides: 8, detail: D }),
      { pos: [0, c.top - 2.0, dz] });
  }
  if (full) {
    B.add('core', 'trim', G.panelledSlab({ width: 1.6, height: 26, depth: 1.6, detail: D }),
      { pos: [0, 52, -240], rot: [0.5, 0, 0] });
    B.add('core', 'trim', SL_HULL.plate({
      z0: -180, z1: 160, side: -1, facet: FACET.deckChamfer, t0: 0.30, t1: 0.46,
      drift: 0.20, out: 0.9,
    }));
    B.add('core', 'emissive', glowSlot(24, 2.2), { pos: [0, 34, 96], rot: [-0.4, 0, 0] });
  }

  // --- 4. fabrication bay: a trench cut into the ventral keel, over the void
  for (const side of [-1, 1]) {
    B.add('core', 'dark', SL_VENTRAL.intake({
      z0: -30, z1: 110, side, facet: FACET.keel, t0: 0.12, t1: 0.84, depth: 7.0,
    }));
  }
  B.add('core', 'emissive', glowSlot(34, 100), { pos: [0, -30, 40], rot: [HALF_PI, 0, 0] });

  // --- 5. stern: one wide bar of light, flanked by two smaller ones --------
  B.add('engine', 'emissive', glowSlot(25, 9), { pos: [0, 0, -310.4], rot: [0, PI, 0] });
  for (const s of [-1, 1]) {
    B.add('engine', 'emissive', glowSlot(7, 4), { pos: [s * 22, 6, -308], rot: [0, PI, 0] });
  }

  // --- 6. running lights ---------------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(SL_HULL, -300, 290, s, { width: 3.0 }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// STRIKE CRAFT — "Shrike", 18 m.  Was 122 tris at 70.3% axis-aligned.
// ===========================================================================

/**
 * THE WORST NUMBER IN THE NAVY, AND WHY IT WAS THE WORST.
 *
 * 70.3% of this hull's surface area lay within 5 degrees of an axis on 122
 * triangles, which is what happens when four of the five parts are flat prisms:
 * an `octProfile` body (four orthogonal planes), two `taperedWedge` prongs (a bare
 * `rectProfile` box at MID detail - the chamfer is gated on FULL and this class
 * never asks for FULL), two `bladePlate` wings whose entire area is +-Y, one
 * `radiatorFin` whose entire area is +-X, and a `panelledSlab` transom.
 *
 * Every one of those is now a `Mass` or a `bladeGeo`, at 400 triangles of committed
 * budget rather than 150. Nothing about the CLASS moved: the fork is still a fork,
 * the wings are still forward-swept and still most of the plan area, and the ventral
 * fin still hangs below the wing plane so this is the one fighter with a bottom edge.
 */
const SH_BODY = new Mass([
  // [z, half, top, bottom, knuckle, deckFlat, flare]
  [-7.4, 1.50, 0.65, -0.95, 0.50, 0.40, 0.86],
  [-2.0, 2.30, 1.00, -1.30, 0.46, 0.34, 0.92],
  [1.20, 1.90, 0.80, -1.05, 0.40, 0.28, 1.02],
  [3.00, 1.10, 0.30, -0.85, 0.34, 0.22, 1.08],
], { label: 'shrike' });

/** One prong of the fork, in its own frame. Placed at +-SH_PRONG_X. */
const SH_PRONG = new Mass([
  [0, 0.78, 0.42, -0.55, 0.46, 0.34, 0.96],
  [7.4, 0.20, -0.06, -0.24, 0.34, 0.24, 1.00],
], { label: 'shrike prong' });
const SH_PRONG_X = 1.35;

/**
 * Starboard wing: `[span, zCentre, chord, thickness]`. FORWARD-SWEPT - zCentre rises
 * with span, so the tip leads the root by 3.4 m on a 13 m wingspan. The root at span
 * 1.3 is inside the body's own 1.9-2.3 m half-beam, so it is capped `root: false` and
 * the wing genuinely grows out of the skin instead of butting against it.
 */
const SH_WING = [
  [1.3, -1.80, 5.00, 0.58],
  [3.9, 0.00, 4.60, 0.42],
  [6.5, 1.60, 3.60, 0.26],
];

/** The ventral fin, hung below the wing plane. Raked AFT as span goes down. */
const SH_FIN = [
  [0, -3.00, 4.40, 0.40],
  [1.1, -3.30, 3.40, 0.30],
  [2.1, -3.70, 2.20, 0.18],
];

function strikeCraftParts() {
  const B = new Buckets();

  // THE FORK. The nose is split into two prongs with a 1.2 m slot between them and
  // the emitter firing down it. It is the whole class read and it is the one feature
  // that survives to three pixels: the Bolt is a solid delta with a tall fin, the
  // Whipcord has a hole in its TAIL, and this has a hole in its NOSE.
  B.add('core', 'hull', SH_BODY.loft());
  for (const s of [-1, 1]) {
    B.add('core', 'hull', SH_PRONG.loft({ keep: SECTION_LOD.far, capBack: false }),
      { pos: [s * SH_PRONG_X, 0, 2.6], rot: [0, -s * 0.045, 0] });
  }
  // The emitter sits deep in the throat of the fork, so the gap reads as a working
  // aperture rather than as a missing part.
  B.add('core', 'emissive', glowSlot(1.1, 0.6), { pos: [0, 0, 4.2] });

  // WINGS. One faceted blade a side, mirrored by winding rather than by scale.
  for (const geo of bladePair(spanX(bladeGeo(SH_WING, { deckFlat: 0.26, flare: 1.06, root: false })))) {
    B.add('core', 'plating', geo, { pos: [0, -0.10, 0] });
  }
  // Deep single ventral fin. In profile this class is otherwise a flat line; the fin
  // hangs BELOW the wing plane so the Shrike has a bottom edge the Bolt and the
  // Whipcord do not.
  B.add('core', 'plating', spanY(bladeGeo(SH_FIN, { deckFlat: 0.24, root: false }), -HALF_PI),
    { pos: [0, -0.9, 0] });

  // The one subtractive detail, and it is on the PORT side only: a mirrored pair of
  // trenches on an 18 m hull is the strongest tell of procedural placement there is.
  B.add('core', 'dark', SH_BODY.intake({
    z0: -6.4, z1: 1.0, side: -1, facet: FACET.upperFlank, t0: 0.30, t1: 0.72, depth: 0.30,
  }));

  B.add('core', 'emissive', glowSlot(1.6, 0.35), { pos: [0, 1.0, 0.4], rot: [-0.5, 0, 0] });
  // The drive is the transom itself: a lit slot in a continuous surface, no housing.
  // Concord does not admit to having machinery, and a box bolted to the tail of an
  // 18 m hull was 12 triangles of pure axis-aligned area saying that it does.
  B.add('core', 'emissive', glowSlot(2.0, 0.8), { pos: [0, -0.15, -7.6], rot: [0, PI, 0] });
  return { buckets: B.list() };
}

// ===========================================================================
// Class definitions
// ===========================================================================

export const CONCORD_SHIPS = [
  shipClass({
    id: 'concord_corvette',
    name: 'Whipcord',
    faction: 'concord',
    role: 'corvette',
    length: HULL_LENGTH.corvette,
    mass: 2700, maxSpeed: 262, accel: 29, turnRate: 0.66,
    hullHP: 780, triBudget: 2000,
    partsFor: corvetteParts,
    levels: 2,
    subsystems: [
      { id: 'lance', kind: 'weapon', hp: 150, position: [0, -2, 40], radius: 9, salvageValue: 0.32, label: 'Nose Lance' },
      { id: 'reactor', kind: 'reactor', hp: 190, position: [0, 0, -8], radius: 8, salvageValue: 0.34, label: 'Core' },
      // On the tailplane between the booms: one hitbox that covers both drives,
      // sitting on geometry the player can actually see and shoot at.
      { id: 'engine', kind: 'engine', hp: 150, position: [0, 6.0, -44], radius: 13, salvageValue: 0.14, label: 'Drive Booms' },
      { id: 'sensor', kind: 'sensor', hp: 90, position: [0, 4.1, 10], radius: 5, salvageValue: 0.08, label: 'Array' },
    ],
    weapons: [
      weapon('cc_lance', 'Nose Lance', 'lance', {
        mount: [0, -3.0, 47.6], yawCentre: 0, yawWidth: PI * 0.20, pitchWidth: PI * 0.14,
        range: RANGE.lance * 0.7, damage: 44, shotsPerBurst: 1, cooldown: 3.6,
        projectileSpeed: Infinity, tracking: 0.9, subsystemAccuracy: 0.8,
      }),
      weapon('cc_pd', 'Point Defence', 'pd', {
        mount: [0, 3.6, -2], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 9, shotsPerBurst: 4, burstInterval: 0.06,
        cooldown: 0.9, projectileSpeed: 2400, tracking: 3.4,
      }),
    ],
  }),

  shipClass({
    id: 'concord_frigate',
    name: 'Meridian',
    faction: 'concord',
    role: 'frigate',
    length: HULL_LENGTH.frigate,
    mass: 19500, maxSpeed: 168, accel: 10.4, turnRate: 0.22,
    hullHP: 3100, triBudget: 2000,
    partsFor: frigateParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 680, position: [0, 0, -10], radius: 16, salvageValue: 0.36, label: 'Reactor' },
      { id: 'port_battery', kind: 'weapon', hp: 380, position: [-15.4, 1, -2], radius: 22, salvageValue: 0.30, label: 'Port Slots' },
      { id: 'stbd_battery', kind: 'weapon', hp: 380, position: [15.4, 1, -2], radius: 22, salvageValue: 0.30, label: 'Starboard Slots' },
      { id: 'engine', kind: 'engine', hp: 560, position: [0, -0.6, -102], radius: 18, salvageValue: 0.18, label: 'Drive Slots' },
      { id: 'sensor', kind: 'sensor', hp: 220, position: [0, 26, -34], radius: 20, salvageValue: 0.12, label: 'Sail Array' },
    ],
    weapons: [
      weapon('mr_port', 'Port Beam Slots', 'beam', {
        mount: [-16, 1, -2], yawCentre: -PI * 0.5, yawWidth: PI * 0.58,
        range: RANGE.beam, damage: 34, shotsPerBurst: 2, burstInterval: 0.5,
        cooldown: 3.2, projectileSpeed: Infinity, tracking: 0.7, subsystemAccuracy: 0.72,
      }),
      weapon('mr_stbd', 'Starboard Beam Slots', 'beam', {
        mount: [16, 1, -2], yawCentre: PI * 0.5, yawWidth: PI * 0.58,
        range: RANGE.beam, damage: 34, shotsPerBurst: 2, burstInterval: 0.5,
        cooldown: 3.2, projectileSpeed: Infinity, tracking: 0.7, subsystemAccuracy: 0.72,
      }),
      weapon('mr_dorsal', 'Dorsal Blister', 'rail', {
        mount: [0, 8.6, 26], yawCentre: 0, yawWidth: PI * 1.3,
        range: RANGE.rail * 0.8, damage: 56, shotsPerBurst: 1, cooldown: 5.0,
        projectileSpeed: 3200, tracking: 0.6,
      }),
      weapon('mr_pd', 'Point Defence', 'pd', {
        mount: [0, 8.6, -2], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 8, shotsPerBurst: 4, burstInterval: 0.07,
        cooldown: 1.0, projectileSpeed: 2400, tracking: 3.2,
      }),
    ],
  }),

  shipClass({
    id: 'concord_escort',
    name: 'Halcyon',
    faction: 'concord',
    role: 'escort',
    length: CONCORD_LENGTH.escort,
    mass: 34000, maxSpeed: 186, accel: 12.0, turnRate: 0.20,
    hullHP: 4600, triBudget: 5000,
    partsFor: halcyonParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 900, position: [0, 0, -30], radius: 22, salvageValue: 0.32, label: 'Core' },
      { id: 'keel_array', kind: 'sensor', hp: 620, position: [0, -58, -40], radius: 44, salvageValue: 0.18, label: 'Keel Array' },
      { id: 'port_wing', kind: 'weapon', hp: 700, position: [-58, 3, 4], radius: 46, salvageValue: 0.20, label: 'Port Wing Slots' },
      { id: 'stbd_wing', kind: 'weapon', hp: 700, position: [58, 3, 4], radius: 46, salvageValue: 0.20, label: 'Starboard Wing Slots' },
      { id: 'engine_port', kind: 'engine', hp: 520, position: [-80, -2, -98], radius: 20, salvageValue: 0.10, label: 'Port Drive' },
      { id: 'engine_stbd', kind: 'engine', hp: 520, position: [80, -2, -98], radius: 20, salvageValue: 0.10, label: 'Starboard Drive' },
    ],
    weapons: [
      weapon('hc_port', 'Port Wing Slots', 'beam', {
        mount: [-58, 4, 4], yawCentre: -PI * 0.5, yawWidth: PI * 0.70,
        range: RANGE.beam * 1.05, damage: 48, shotsPerBurst: 3, burstInterval: 0.4,
        cooldown: 3.4, projectileSpeed: Infinity, tracking: 0.8, subsystemAccuracy: 0.70,
      }),
      weapon('hc_stbd', 'Starboard Wing Slots', 'beam', {
        mount: [58, 4, 4], yawCentre: PI * 0.5, yawWidth: PI * 0.70,
        range: RANGE.beam * 1.05, damage: 48, shotsPerBurst: 3, burstInterval: 0.4,
        cooldown: 3.4, projectileSpeed: Infinity, tracking: 0.8, subsystemAccuracy: 0.70,
      }),
      weapon('hc_pd', 'Point Defence', 'pd', {
        mount: [0, 16, -6], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 12, shotsPerBurst: 6, burstInterval: 0.05,
        cooldown: 0.7, projectileSpeed: 2400, tracking: 3.6,
      }),
    ],
  }),

  shipClass({
    id: 'concord_destroyer',
    name: 'Peregrine',
    faction: 'concord',
    role: 'destroyer',
    length: HULL_LENGTH.destroyer,
    mass: 86000, maxSpeed: 138, accel: 7.0, turnRate: 0.125,
    hullHP: 8600, triBudget: 5000,
    partsFor: destroyerParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 1850, position: [0, 0, -30], radius: 30, salvageValue: 0.40, label: 'Reactor' },
      { id: 'lance', kind: 'weapon', hp: 700, position: [0, -4, 190], radius: 26, salvageValue: 0.16, label: 'Bow Lance' },
      { id: 'blister_fwd', kind: 'weapon', hp: 640, position: [0, 68, 40], radius: 18, salvageValue: 0.12, label: 'Forward Blister' },
      { id: 'blister_aft', kind: 'weapon', hp: 640, position: [0, 69, -96], radius: 18, salvageValue: 0.12, label: 'Aft Blister' },
      { id: 'engine_port', kind: 'engine', hp: 900, position: [-88, -34, -140], radius: 26, salvageValue: 0.12, label: 'Port Nacelle' },
      { id: 'engine_stbd', kind: 'engine', hp: 900, position: [88, -34, -140], radius: 26, salvageValue: 0.12, label: 'Starboard Nacelle' },
      { id: 'engine_main', kind: 'engine', hp: 1100, position: [0, -2, -232], radius: 26, salvageValue: 0.10, label: 'Main Drive' },
      { id: 'hangar', kind: 'hangar', hp: 780, position: [0, -40, -20], radius: 30, salvageValue: 0.12, label: 'Hangar Slot' },
      { id: 'sensor', kind: 'sensor', hp: 500, position: [0, 74, -170], radius: 30, salvageValue: 0.10, label: 'Tail Array' },
    ],
    weapons: [
      weapon('pg_lance', 'Bow Lance', 'lance', {
        mount: [0, -20.0, 240.4], yawCentre: 0, yawWidth: PI * 0.18, pitchWidth: PI * 0.12,
        range: RANGE.lance, damage: 132, shotsPerBurst: 1, cooldown: 7.0,
        projectileSpeed: Infinity, tracking: 0.28, subsystemAccuracy: 0.9,
      }),
      weapon('pg_port', 'Port Beam Battery', 'beam', {
        mount: [-33, 2, 0], yawCentre: -PI * 0.5, yawWidth: PI * 0.56,
        range: RANGE.beam * 1.1, damage: 64, shotsPerBurst: 2, burstInterval: 0.55,
        cooldown: 4.2, projectileSpeed: Infinity, tracking: 0.5, subsystemAccuracy: 0.78,
      }),
      weapon('pg_stbd', 'Starboard Beam Battery', 'beam', {
        mount: [33, 2, 0], yawCentre: PI * 0.5, yawWidth: PI * 0.56,
        range: RANGE.beam * 1.1, damage: 64, shotsPerBurst: 2, burstInterval: 0.55,
        cooldown: 4.2, projectileSpeed: Infinity, tracking: 0.5, subsystemAccuracy: 0.78,
      }),
      weapon('pg_dorsal', 'Dorsal Blisters', 'rail', {
        mount: [0, 68, 40], yawCentre: 0, yawWidth: PI * 1.25,
        range: RANGE.rail, damage: 88, shotsPerBurst: 1, cooldown: 5.6,
        projectileSpeed: 3400, tracking: 0.44,
      }),
      weapon('pg_pd', 'Point Defence', 'pd', {
        mount: [0, 69, -96], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 10, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.85, projectileSpeed: 2400, tracking: 3.2,
      }),
    ],
  }),

  shipClass({
    id: 'concord_tender',
    name: 'Solace',
    faction: 'concord',
    role: 'tender',
    length: CONCORD_LENGTH.tender,
    mass: 142000, maxSpeed: 104, accel: 4.0, turnRate: 0.070,
    hullHP: 11500, triBudget: 5000,
    partsFor: tenderParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 2600, position: [0, 4, -60], radius: 40, salvageValue: 0.30, label: 'Reactor' },
      { id: 'cradle_port', kind: 'hangar', hp: 1800, position: [-96, -128, 90], radius: 90, salvageValue: 0.18, label: 'Port Cradle Arm' },
      { id: 'cradle_stbd', kind: 'hangar', hp: 1800, position: [96, -128, 90], radius: 90, salvageValue: 0.18, label: 'Starboard Cradle Arm' },
      { id: 'fabricator', kind: 'hangar', hp: 1400, position: [0, -34, 40], radius: 50, salvageValue: 0.20, label: 'Fabrication Bay' },
      { id: 'engine', kind: 'engine', hp: 1500, position: [0, -1, -300], radius: 34, salvageValue: 0.14, label: 'Drive Slots' },
      { id: 'sensor', kind: 'sensor', hp: 620, position: [0, 46, -120], radius: 34, salvageValue: 0.10, label: 'Spine Array' },
    ],
    weapons: [
      weapon('sl_pd_fwd', 'Forward Point Defence', 'pd', {
        mount: [0, 50, 20], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 11, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.8, projectileSpeed: 2400, tracking: 3.2,
      }),
      weapon('sl_pd_aft', 'Aft Point Defence', 'pd', {
        mount: [0, 48, -120], yawCentre: PI, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 11, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.8, projectileSpeed: 2400, tracking: 3.2,
      }),
      weapon('sl_tractor', 'Cradle Tractors', 'mining', {
        mount: [0, -60, 60], yawCentre: 0, yawWidth: PI * 2, pitchWidth: PI * 0.8,
        range: RANGE.salvageBeam, damage: 24, shotsPerBurst: 1, burstInterval: 0,
        cooldown: 0.5, projectileSpeed: Infinity, tracking: 0.9, subsystemAccuracy: 0.05,
      }),
    ],
  }),

  shipClass({
    id: 'concord_strikecraft',
    name: 'Shrike',
    faction: 'concord',
    role: 'fighter',
    length: HULL_LENGTH.fighter,
    mass: 21, maxSpeed: 470, accel: 105, turnRate: 2.7,
    hullHP: 72, triBudget: 400,
    planeLocked: false,
    partsFor: strikeCraftParts,
    levels: 1,
    subsystems: [
      { id: 'core', kind: 'reactor', hp: 34, position: [0, 0, -1], radius: 2.6, salvageValue: 0.6, label: 'Core' },
    ],
    weapons: [
      weapon('sh_lance', 'Nose Emitter', 'beam', {
        mount: [0, 0, 6], yawCentre: 0, yawWidth: PI * 0.12, pitchWidth: PI * 0.12,
        range: RANGE.pointDefence * 1.6, damage: 16, shotsPerBurst: 2, burstInterval: 0.3,
        cooldown: 1.8, projectileSpeed: Infinity, tracking: 1.4,
      }),
    ],
  }),
];

export {
  corvetteParts, frigateParts, halcyonParts, destroyerParts, tenderParts, strikeCraftParts,
  CC_HULL, MR_HULL, HC_HULL, PG_HULL, SL_HULL,
};
