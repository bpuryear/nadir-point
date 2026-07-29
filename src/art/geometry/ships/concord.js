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
 * WHAT CHANGED IN THIS PASS
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
  Buckets, Lines, chineStrip, glowSlot, lightRun, shipClass, weapon, bladePlate, mirrorOutline,
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
// CORVETTE — "Whipcord", 95 m
// ===========================================================================

/**
 * The central nacelle. It STOPS at z = -14: everything aft of that is open sky
 * between the two booms, and that hole is the class.
 *
 * The waist is at z = -14 (deck half 5.6) and the shoulder at z = -2 (7.8); the
 * nose droops to a tip centre 3.0 m below the axis over the last 13 m.
 */
const CC_HULL = new Lines([
  [-14, 5.6, 3.2, -3.6, 3.6, 2.0, 2.4, 0.90],
  [-2, 7.8, 4.2, -4.6, 5.2, 2.8, 3.2, 0.88],
  [16, 6.2, 3.4, -3.8, 4.0, 2.2, 2.6, 0.92],
  [30, 3.6, 1.4, -3.0, 2.2, 1.2, 1.8, 1.04],
  [40, 1.6, -1.0, -3.2, 0.9, 0.7, 1.0, 1.06],
  [47.5, 0.5, -2.2, -3.8, 0.2, 0.3, 0.4, 1.00],
]);

/** A tail boom, in its own space; placed at x = +-CC_BOOM_X. */
const CC_BOOM = new Lines([
  [-47.6, 1.5, 0.9, -1.1, 1.0, 0.5, 0.7],
  [-30, 2.6, 1.6, -1.9, 1.7, 0.9, 1.2],
  [2, 3.2, 2.0, -2.4, 2.1, 1.1, 1.5],
]);
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
// Where along the wing the boom sits. Chosen so that x AFTER the rotation is still
// 9.4 m: the nineteen-metre gap between the booms is the plan-view read and the
// dihedral must not pay for the profile fix by narrowing it.
const CC_KNUCKLE = 9.4 / Math.cos(0.56);     // 11.07
const CC_BOOM_X = CC_KNUCKLE * Math.cos(CC_DIHEDRAL);   // 7.95
const CC_BOOM_Y = CC_KNUCKLE * Math.sin(CC_DIHEDRAL) - 0.4;  // 4.58

/** Starboard wing outline, [x, z], CCW. Carries the boom at its trailing edge. */
const CC_WING = [[5.0, 9], [5.2, -12], [16.5, -14], [15.0, 2]];

function corvetteParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  // --- 1. the central nacelle ----------------------------------------------
  B.add('core', 'hull', full ? CC_HULL.loft({ capFront: false })
    : CC_HULL.loftPick([-2, 30, 40], { capFront: false }));
  // The lance aperture, in the tip of the hull itself. Concord's guns are holes.
  B.add('core', 'emissive', glowSlot(1.1, 0.5), { pos: [0, -3.0, 47.6] });

  // --- 2. wings, and the booms that grow out of them ------------------------
  //
  // THE CLASS READ. Two booms, 44 m long, standing 9.4 m off the centreline with
  // nineteen metres of nothing between them, closed at the back by a tailplane.
  // In plan that is a rectangular hole in the tail; from the beam it is two
  // parallel lines with daylight between them; from dead astern it is a squared
  // horseshoe. No other hull in the game - either navy, any size - has a hole in
  // it except the Coalition destroyer and carrier, both of which are four to nine
  // times this length and cannot be confused with it by anybody.
  for (const s of [-1, 1]) {
    B.add('core', 'plating', bladePlate(s > 0 ? CC_WING : mirrorOutline(CC_WING), 1.1),
      { pos: [0, -0.4, 0], rot: [0, 0, s * CC_DIHEDRAL] });
    B.add('core', 'hull', CC_BOOM.loft({ capFront: false }, full ? 1 : 2),
      { pos: [s * CC_BOOM_X, CC_BOOM_Y, 0], rot: [0, 0, s * CC_DIHEDRAL] });
    // Boom drive: a lit slot in the tail, no nozzle. Concord does not admit to
    // having machinery.
    B.add('engine', 'dark', G.panelledSlab({ width: 3.4, height: 2.4, depth: 3.0, chamfer: 0.8, detail: D }),
      { pos: [s * CC_BOOM_X, CC_BOOM_Y, -45.6], rot: [0, 0, s * CC_DIHEDRAL] });
    B.add('engine', 'emissive', glowSlot(2.6, 1.5),
      { pos: [s * CC_BOOM_X, CC_BOOM_Y, -47.5], rot: [0, PI, -s * CC_DIHEDRAL] });
    if (full) {
      // Wing-root fairing: the wing GROWS from the hull, it is not bolted to it.
      B.add('core', 'hull', G.taperedWedge({
        length: 20, width0: 3.6, height0: 4.4, width1: 1.4, height1: 1.6, shear: -0.6, detail: D,
      }), { pos: [s * 5.4, 2.4, 4], rot: [0, PI, -s * CC_DIHEDRAL * 0.6] });
    }
  }

  // Tailplane across the boom tops. Without it the booms read as two loose spars;
  // with it the tail is a closed frame with a window in it - and now that the booms
  // ride four and a half metres above the nacelle, the crossbar is also the top of
  // the V and the highest thing on the ship.
  B.add('core', 'plating', G.panelledSlab({
    width: CC_BOOM_X * 2 + 3.0, height: 1.0, depth: 5.6, chamfer: 0.4, detail: D,
  }), { pos: [0, CC_BOOM_Y + 2.1, -42] });

  // --- 3. fins -------------------------------------------------------------
  // One small fin on each boom, not a median sail: the frigate owns the tall-fin
  // read and a corvette that borrowed it would be a frigate at half scale. They are
  // canted with the wing, so from astern the pair continues the V outward instead
  // of standing vertically like a Coalition mast.
  for (const s of [-1, 1]) {
    B.add('core', 'plating', G.radiatorFin({
      chord: 9, span: 3.8, thickness: 0.8, sweep: -3.5, tipChord: 5, detail: D,
    }), { pos: [s * CC_BOOM_X, CC_BOOM_Y + 1.6, -38], rot: [0, 0, s * CC_DIHEDRAL] });
  }
  // THE KEEL BLADE. The other half of the profile fix: the V opens upward, so the
  // hull needs something below the axis or the whole ship migrates above its own
  // centreline. 7.4 m deep against the old 3.4, and long enough (24 m chord) to
  // read as a fin rather than as a skid. It is also the only Concord surface that
  // is a straight line in profile, which is what makes the swept ones read as
  // swept.
  B.add('core', 'plating', G.radiatorFin({
    chord: 24, span: 7.4, thickness: 1.1, sweep: 7, tipChord: 11, detail: D,
  }), { pos: [0, -4.4, 14], rot: [PI, 0, 0] });

  // --- 4. canopy: a lit slit, flush ----------------------------------------
  if (full) {
    B.add('core', 'emissive', glowSlot(4.4, 0.6), { pos: [0, 4.3, 10], rot: [-0.5, 0, 0] });
    // The single accent line. Concord wears one, on the port shoulder, always, and
    // it follows the chine rather than sitting on a flat (ship-language.md §4a).
    B.add('core', 'trim', G.panelledSlab({ width: 0.8, height: 0.5, depth: 14, detail: D }),
      { pos: [-5.6, 2.8, 4], rot: [0, -0.06, 0] });
  }

  // --- 5. running lights: mandatory ----------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(CC_HULL, -12, 34, s));
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
const MR_HULL = new Lines([
  [-104, 7.4, 3.6, -4.4, 4.8, 2.2, 2.8, 0.90],
  [-96, 5.4, 2.6, -3.2, 3.6, 1.6, 2.0, 0.92],
  [-64, 11.5, 6.0, -7.0, 7.6, 3.6, 4.4, 0.88],
  [-30, 14.6, 7.8, -9.0, 9.6, 4.6, 5.6, 0.86],
  [-4, 16.0, 8.6, -9.6, 10.4, 5.0, 6.0, 0.86],
  [40, 12.4, 6.6, -8.4, 8.0, 3.9, 5.2, 0.94],
  [76, 7.0, 3.0, -8.0, 4.4, 2.1, 4.0, 1.06],
  [105, 2.0, -3.0, -9.0, 0.9, 0.9, 1.4, 1.00],
]);

/**
 * Starboard ventral strake, [x, z], CCW. Genuinely FORWARD-swept: the tip leads
 * the root by thirty metres. Nothing else in the game does that, and it is what
 * keeps this class's plan view from being the corvette's plan view.
 */
const MR_STRAKE = [[13.0, 12], [12.0, -50], [26.0, -22], [29.0, 42]];

function frigateParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', MR_HULL.loftPick([-96, -4, 40, 76], { capFront: false }));
    // The sail carries the class at any distance, so it survives to the far LOD.
    B.add('core', 'hull', G.radiatorFin({
      chord: 58, span: 36, thickness: 3.0, sweep: -18, tipChord: 24, detail: D,
    }), { pos: [0, 7.0, -30] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', bladePlate(s > 0 ? MR_STRAKE : mirrorOutline(MR_STRAKE), 3.0), { pos: [0, -8, 0] });
    }
    return { buckets: B.list() };
  }

  // --- 1. spindle, and the prow is the hull's own chisel --------------------
  B.add('core', 'hull', full ? MR_HULL.loft({ capFront: false })
    : MR_HULL.loftPick([-96, -4, 40, 76], { capFront: false }));
  B.add('core', 'emissive', glowSlot(1.4, 0.8), { pos: [0, -6.0, 105.2] });

  // --- 2. THE SAIL. The class read. ---------------------------------------
  // Tall and near-vertical, amidships. The corvette's fin is small and far aft, and
  // the destroyer's pair is canted and at the stern, so no two resolve to the same
  // shape from the beam.
  B.add('core', 'hull', G.radiatorFin({
    chord: 58, span: 36, thickness: 3.0, sweep: -18, tipChord: 24, rim: 3.2, detail: D,
  }), { pos: [0, 7.0, -30] });
  if (full) {
    // Sensor strip up the leading edge instead of a mast. Concord hides its aerials.
    B.add('core', 'trim', G.panelledSlab({ width: 1.2, height: 30, depth: 1.2, detail: D }),
      { pos: [0, 24, -8], rot: [0.30, 0, 0] });
  }

  // --- 2b. THE OUTRIGGER, AND THERE IS ONLY ONE OF IT ----------------------
  //
  // Round-one blind review: "Destroyer, escort, frigate and corvette are four sizes
  // of the same swept arrowhead ... give each Concord class one non-scalable
  // structural idea the others do not have." Measured with both hulls normalised to
  // 200 m, corvette against frigate was the closest pair in the navy at 8.9 m of
  // mean outline divergence, i.e. under two pixels at the review scale.
  //
  // This is the frigate's idea: a SINGLE auxiliary nacelle on a cantilevered pylon,
  // starboard only, carrying the sensor tender's power plant. It is non-scalable
  // because it is asymmetric - you cannot get it by making a corvette bigger - and
  // it is the only bilaterally unequal hull in either navy, which also means the
  // Meridian is the one class you can tell which way up and which way round it is
  // from a single glance at a plan contact.
  B.add('core', 'hull', G.taperedWedge({
    length: 124, width0: 12, height0: 12, width1: 7, height1: 8, shear: 2.0, chamfer: 2.6, detail: D,
  }), { pos: [37, -11, -66] });
  B.add('core', 'plating', G.panelledSlab({ width: 20, height: 4.4, depth: 13, chamfer: 1.6, detail: D }),
    { pos: [26, -8, -30] });
  if (full) {
    B.add('core', 'plating', G.panelledSlab({ width: 18, height: 3.6, depth: 11, chamfer: 1.4, detail: D }),
      { pos: [26, -8, 14] });
    B.add('core', 'greeble', G.hexStrut({ length: 15, radius: 1.6, axis: 'x', detail: D }),
      { pos: [26, -13, -8] });
  }
  B.add('engine', 'emissive', glowSlot(5.0, 3.4), { pos: [37, -9.6, -67.4], rot: [0, PI, 0] });

  // --- 3. ventral strakes, swept FORWARD -----------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'plating', bladePlate(s > 0 ? MR_STRAKE : mirrorOutline(MR_STRAKE), 2.6), { pos: [0, -8.0, 0] });
    if (full) {
      B.add('core', 'hull', G.taperedWedge({
        length: 34, width0: 5.0, height0: 6.0, width1: 2.0, height1: 2.4, shear: -1.0, detail: D,
      }), { pos: [s * 13.0, -6.4, -14] });
    }
  }

  // --- 4. weapons: recessed slots, three a side ----------------------------
  for (const s of [-1, 1]) {
    for (const dz of full ? [26, -2, -30] : [-2]) {
      B.add('core', 'dark', G.blastDoor({ width: 16, height: 5.0, depth: 1.6, seam: false, detail: D }),
        { pos: [s * 15.4, 1.0, dz], rot: [0, s * HALF_PI, 0] });
      if (full) {
        B.add('core', 'emissive', glowSlot(12, 0.7),
          { pos: [s * 15.8, 1.0, dz], rot: [0, s * HALF_PI, 0] });
      }
    }
  }
  // Two flush dorsal blisters. A dome, not a turret: the barrels live inside.
  for (const dz of full ? [26, -2] : [12]) {
    B.add('core', 'plating', G.mountPad({ radius: 6.0, height: 2.6, sides: 8, detail: D }),
      { pos: [0, 8.0, dz] });
  }
  // Ventral sensor keel. The frigate's third mass: from the beam it is a bulge
  // under a blade, which is a shape neither the corvette nor the destroyer has.
  B.add('core', 'hull', G.taperedWedge({
    length: 62, width0: 11, height0: 12, width1: 5, height1: 5, shear: 2.5, chamfer: 2.4, detail: D,
  }), { pos: [0, -13, -34] });
  if (full) {
    B.add('core', 'dark', G.blastDoor({ width: 8, height: 26, depth: 1.4, seam: false, detail: D }),
      { pos: [0, -18.5, -6], rot: [-HALF_PI, 0, 0] });
  }

  // --- 5. stern: two slots and a tail fairing ------------------------------
  B.add('engine', 'dark', G.panelledSlab({ width: 15, height: 7.0, depth: 10, chamfer: 2.2, detail: D }),
    { pos: [0, -0.3, -100] });
  for (const s of [-1, 1]) {
    B.add('engine', 'emissive', glowSlot(5.4, 3.0), { pos: [s * 3.6, -0.3, -105.2], rot: [0, PI, 0] });
  }

  if (full) {
    B.add('core', 'emissive', glowSlot(9.0, 1.2), { pos: [0, 8.4, 44], rot: [-0.4, 0, 0] });
    B.add('core', 'trim', G.panelledSlab({ width: 1.2, height: 0.7, depth: 44, detail: D }),
      { pos: [-11.4, 5.4, 18], rot: [0, -0.05, 0] });
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
const HC_HULL = new Lines([
  [-150, 10, 6, -8, 6.0, 3.0, 4.0, 0.88],
  [-124, 8, 5, -6, 5.0, 2.5, 3.0, 0.90],
  [-60, 22, 15, -17, 14.0, 8.0, 10.0, 0.86],
  [10, 27, 18, -21, 17.0, 10.0, 12.0, 0.84],
  [78, 20, 13, -20, 12.0, 7.0, 11.0, 0.92],
  [122, 11, 5, -17, 6.0, 4.0, 8.0, 1.06],
  [150, 3, -6, -12, 1.2, 1.5, 2.0, 1.00],
]);

/** Starboard wing, [x, z], CCW. The tip is at x = 95 on a hull half-beam of 27. */
const HC_WING = [[20, 62], [24, -70], [78, -104], [95, -18], [72, 40]];
/** Starboard canard, well forward and much smaller: the plan outline is not one delta. */
const HC_CANARD = [[14, 108], [16, 66], [52, 48], [46, 92]];

function halcyonParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', HC_HULL.loftPick([-124, 10, 122], { capFront: false }));
    for (const s of [-1, 1]) {
      B.add('core', 'hull', bladePlate(s > 0 ? HC_WING : mirrorOutline(HC_WING), 9), { pos: [0, -2, 0] });
      B.add('core', 'hull', bladePlate(s > 0 ? HC_CANARD : mirrorOutline(HC_CANARD), 6), { pos: [0, 0, 0] });
    }
    // The keel blade: the only vertical event, so it is the last thing to go.
    B.add('core', 'hull', G.radiatorFin({
      chord: 150, span: 78, thickness: 8, sweep: 34, tipChord: 74, detail: D,
    }), { pos: [0, -18, 40], rot: [PI, 0, 0] });
    return { buckets: B.list() };
  }

  // --- 1. the body. Thin, and it is the SPAR the wings grow from. ----------
  B.add('core', 'hull', full ? HC_HULL.loft({ capFront: false })
    : HC_HULL.loftPick([-124, 10, 78, 122], { capFront: false }));
  B.add('core', 'emissive', glowSlot(2.0, 0.9), { pos: [0, -9.0, 150.2] });

  // --- 2. THE WING. One continuous surface from root to tip. ---------------
  for (const s of [-1, 1]) {
    B.add('core', 'hull', bladePlate(s > 0 ? HC_WING : mirrorOutline(HC_WING), 9), { pos: [0, -2, 0] });
    // Root fairing so the wing GROWS out of the body rather than being taped to it.
    B.add('core', 'plating', G.taperedWedge({
      length: 120, width0: 22, height0: 26, width1: 8, height1: 8, shear: -3, chamfer: 3, detail: D,
    }), { pos: [s * 24, 0, 40], rot: [0, PI - s * 0.16, 0] });
    // Canard forward, much smaller and at a different sweep: the plan outline has
    // two events on each side, not one, so it is an arrowhead and not a triangle.
    B.add('core', 'plating', bladePlate(s > 0 ? HC_CANARD : mirrorOutline(HC_CANARD), 6), { pos: [0, 1, 0] });
    // Wingtip drive slot. Concord: recessed, no nozzle, a bar of light.
    B.add('engine', 'dark', G.panelledSlab({ width: 26, height: 11, depth: 20, chamfer: 4, detail: D }),
      { pos: [s * 80, -2, -96] });
    B.add('engine', 'emissive', glowSlot(19, 6), { pos: [s * 80, -2, -107], rot: [0, PI, 0] });
    if (full) {
      // Weapon slots along the wing leading edge, three a side, unevenly spaced.
      for (const [x, z] of [[s * 40, 34], [s * 58, 6], [s * 74, -30]]) {
        B.add('core', 'dark', G.blastDoor({ width: 22, height: 5, depth: 1.6, seam: false, detail: D }),
          { pos: [x, 3.4, z], rot: [-HALF_PI, 0, 0] });
        B.add('core', 'emissive', glowSlot(17, 0.9), { pos: [x, 4.2, z], rot: [-HALF_PI, 0, 0] });
      }
    }
  }

  // --- 3. THE KEEL BLADE. The class's only vertical event. -----------------
  // 95 m below a hull that is 38 m deep. Sensor aperture, and the reason the class
  // is not a flat smear from the beam.
  B.add('core', 'hull', G.radiatorFin({
    chord: 150, span: 78, thickness: 8, sweep: 34, tipChord: 74, rim: 9, detail: D,
  }), { pos: [0, -18, 40], rot: [PI, 0, 0] });
  if (full) {
    // A second, much smaller blade forward and offset to port. Two blades of
    // clearly different size read as equipment; two of the same size read as fins.
    B.add('core', 'plating', G.radiatorFin({
      chord: 62, span: 30, thickness: 5, sweep: 14, tipChord: 32, rim: 5, detail: D,
    }), { pos: [-9, -16, 118], rot: [PI, 0, 0] });
    B.add('core', 'trim', G.panelledSlab({ width: 1.4, height: 0.9, depth: 62, detail: D }),
      { pos: [-19, 9, 26], rot: [0, -0.06, 0] });
  }

  // --- 4. dorsal: one low faired blister, no mast --------------------------
  B.add('core', 'plating', G.mountPad({ radius: 14, height: 6, sides: 8, detail: D }), { pos: [0, 16, -6] });
  if (full) {
    B.add('core', 'emissive', glowSlot(14, 1.2), { pos: [0, 18.4, 62], rot: [-0.4, 0, 0] });
  }

  // --- 5. running lights: body and both wing tips --------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(HC_HULL, -142, 132, s, { width: 2.6 }));
    B.add('core', 'runningLights', lightRun([s * 92, 1, -22], [s * 74, 1, -96], [0, 1, 0], 2.4));
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
const PG_HULL = new Lines([
  [-240, 12, 8, -14, 8.0, 4.0, 6.0, 0.88],
  [-190, 9, 14, -16, 6.0, 6.0, 7.0, 0.90],
  [-120, 26, 62, -30, 17.0, 20.0, 13.0, 0.86],
  [-30, 33, 98, -42, 21.0, 30.0, 17.0, 0.84],
  [60, 27, 62, -36, 17.0, 20.0, 15.0, 0.88],
  [130, 16, 34, -30, 10.0, 10.0, 12.0, 1.05],
  [200, 7, 4, -20, 4.0, 4.0, 6.0, 1.08],
  [240, 2.5, -16, -24, 1.2, 1.5, 2.0, 1.00],
]);

/**
 * Outrigger nacelle, 220 m, carried at x = +-88 and 34 m BELOW the centreline.
 *
 * Both of those numbers are silhouette decisions. Outboard far enough that there
 * is forty metres of daylight between hull and nacelle in plan - otherwise the
 * pylons fill the gap and the trimaran collapses into one delta, which is exactly
 * what happened the first time. Slung LOW so the profile is a three-level stack:
 * crest on top, hull in the middle, nacelles below.
 */
const PG_NACELLE = new Lines([
  [-150, 6, 3.4, -4.0, 4.0, 1.8, 2.4, 0.92],
  [-108, 11, 6.0, -7.0, 7.2, 3.4, 4.4, 0.90],
  [-40, 13, 7.2, -8.4, 8.6, 4.0, 5.2, 0.88],
  [34, 10, 5.6, -6.4, 6.6, 3.0, 4.0, 0.96],
  [70, 4, 1.4, -4.4, 2.6, 1.2, 1.6, 1.00],
]);
const PG_NACELLE_X = 88;
const PG_NACELLE_Y = -34;

/**
 * Starboard forward and aft pylons, [x, z], CCW. Swept back, faired, and thin
 * enough in Z that most of the forty metres between hull and nacelle stays open
 * in plan. A short stubby pylon reads as a packing crate between two ships.
 */
const PG_PYLON_F = [[26, 60], [28, 10], [82, -15], [80, 20]];
const PG_PYLON_A = [[28, -52], [30, -100], [82, -120], [80, -78]];
const PG_PYLON_Y = -24;

function destroyerParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    // The crest is in the hull, so picking the crest stations IS picking the
    // silhouette. -190 is the waist, -30 the crest peak, 130 the chine break.
    B.add('core', 'hull', PG_HULL.loftPick([-190, -120, -30, 130], { capFront: false }));
    for (const s of [-1, 1]) {
      B.add('core', 'hull', PG_NACELLE.loftPick([-108, -40]), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
      B.add('core', 'hull', bladePlate(s > 0 ? PG_PYLON_F : mirrorOutline(PG_PYLON_F), 11), { pos: [0, PG_PYLON_Y, 0] });
      B.add('core', 'hull', bladePlate(s > 0 ? PG_PYLON_A : mirrorOutline(PG_PYLON_A), 11), { pos: [0, PG_PYLON_Y, 0] });
    }
    // The twin fins carry the class from the beam, so they survive to the far LOD
    // exactly as the Coalition destroyer's waist does.
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.radiatorFin({
        chord: 104, span: 86, thickness: 5, sweep: -34, tipChord: 54, detail: D,
      }), { pos: [s * 13, 40, -188], rot: [0, 0, s * 0.42] });
    }
    return { buckets: B.list() };
  }

  // --- 1. central blade, crest and all -------------------------------------
  B.add('core', 'hull', full ? PG_HULL.loft({ capFront: false })
    : PG_HULL.loftPick([-190, -120, -30, 60, 130, 200], { capFront: false }));
  B.add('core', 'emissive', glowSlot(2.6, 1.6), { pos: [0, -20.0, 240.4] });
  if (full) {
    // Lance rails: two thin strips down the nose, following the chine. The only
    // forward detail there is - the prow's job is convergence.
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 1.4, height: 1.0, depth: 78, detail: D }),
        { pos: [s * 5.0, 14.0, 176], rot: [0, s * 0.03, 0.14] });
    }
  }

  // --- 2. the outriggers. The class read. ---------------------------------
  for (const s of [-1, 1]) {
    B.add('engine', 'hull', full ? PG_NACELLE.loft({ capFront: false })
      : PG_NACELLE.loftPick([-108, -40, 34], { capFront: false }),
    { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
    B.add('engine', 'plating', G.taperedWedge({
      length: 26, width0: 8, height0: 4.4, width1: 1.2, height1: 0.9, chamfer: 0.6, detail: D,
    }), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 70] });
    // Pylons: thick in Y so they read as structure edge-on, thin in Z so there is
    // open sky between hull and nacelle in plan.
    B.add('core', 'plating', bladePlate(s > 0 ? PG_PYLON_F : mirrorOutline(PG_PYLON_F), 11), { pos: [0, PG_PYLON_Y, 0] });
    B.add('core', 'plating', bladePlate(s > 0 ? PG_PYLON_A : mirrorOutline(PG_PYLON_A), 11), { pos: [0, PG_PYLON_Y, 0] });
    // Nacelle drive: a lit slot in the tail, matching the main hull's.
    B.add('engine', 'dark', G.panelledSlab({ width: 12, height: 8, depth: 12, chamfer: 2.4, detail: D }),
      { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, -145] });
    B.add('engine', 'emissive', glowSlot(8.4, 4.2), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, -152.4], rot: [0, PI, 0] });
    if (full) {
      B.add('engine', 'trim', G.panelledSlab({ width: 1.4, height: 0.9, depth: 40, detail: D }),
        { pos: [s * (PG_NACELLE_X - 9), PG_NACELLE_Y + 3, -40] });
    }
  }

  // --- 3. dorsal: the crest is the hull, so all that is left is the TAIL ---
  //
  // TWO CANTED FINS at the stern, 86 m of span each, splayed 24 degrees. A pair of
  // fins is not a sail: from the beam it reads as one tall mass with a notch, from
  // astern as a V, and in plan as two blades outboard of the crest. The Meridian's
  // single upright sail cannot be confused with it at any angle, and this class is
  // the only Concord hull that is TALL AT THE BACK AND TALL IN THE MIDDLE.
  for (const s of [-1, 1]) {
    B.add('core', 'plating', G.radiatorFin({
      chord: 104, span: 86, thickness: 5, sweep: -34, tipChord: 54, rim: 5.5, detail: D,
    }), { pos: [s * 13, 40, -188], rot: [0, 0, s * 0.42] });
  }
  // Blisters set INTO the crest, flush. There is no plinth: a Concord turret does
  // not stand on a pad, it opens in a surface.
  for (const dz of full ? [40, -30, -96] : [-30]) {
    const t = (dz + 120) / 150;
    B.add('core', 'plating', G.mountPad({ radius: 13, height: 5.5, sides: 8, detail: D }),
      { pos: [0, 62 + 30 * Math.max(0, 1 - Math.abs(t - 0.6) * 2.0), dz] });
  }
  if (full) {
    B.add('core', 'trim', G.panelledSlab({ width: 1.6, height: 26, depth: 1.6, detail: D }),
      { pos: [0, 66, -150], rot: [0.5, 0, 0] });
    B.add('core', 'emissive', glowSlot(16, 2.0), { pos: [0, 40.0, 118], rot: [-0.5, 0, 0] });
  }

  // --- 4. flank slots + ventral hangar -------------------------------------
  for (const s of [-1, 1]) {
    for (const dz of full ? [56, 0, -56] : [0]) {
      B.add('core', 'dark', G.blastDoor({ width: 34, height: 11, depth: 3, seam: false, detail: D }),
        { pos: [s * 32.4, 2, dz], rot: [0, s * HALF_PI, 0] });
      if (full) {
        B.add('core', 'emissive', glowSlot(27, 1.6), { pos: [s * 33.2, 2, dz], rot: [0, s * HALF_PI, 0] });
      }
    }
  }
  // Hangar: a slot in the ventral centreline with a lit throat, no doors visible.
  B.add('core', 'dark', G.panelledSlab({ width: 26, height: 6, depth: 62, chamfer: 2, detail: D }),
    { pos: [0, -34, -20] });
  B.add('core', 'emissive', glowSlot(20, 44), { pos: [0, -36.6, -20], rot: [HALF_PI, 0, 0] });

  // --- 5. stern: one wide bar of light -------------------------------------
  B.add('engine', 'dark', G.panelledSlab({ width: 26, height: 13, depth: 18, chamfer: 4, detail: D }),
    { pos: [0, 4, -230] });
  B.add('engine', 'emissive', glowSlot(19, 8), { pos: [0, 4, -239.6], rot: [0, PI, 0] });

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
const SL_HULL = new Lines([
  [-310, 13, 10, -14, 8.0, 5.0, 7.0, 0.88],
  [-270, 10, 8, -11, 6.0, 4.0, 5.0, 0.90],
  [-150, 26, 30, -28, 17.0, 12.0, 14.0, 0.86],
  [-10, 34, 42, -36, 22.0, 16.0, 18.0, 0.84],
  [130, 27, 32, -34, 17.0, 12.0, 16.0, 0.90],
  [230, 17, 20, -36, 10.0, 7.0, 12.0, 1.05],
  [310, 5, -10, -24, 2.0, 2.0, 3.0, 1.00],
]);

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

/**
 * One cradle arm as a single merged surface, starboard side.
 *
 * The path turns through ninety degrees in two planes, so a single `loft` cannot
 * do it; each pair of consecutive nodes becomes a tapered prism aimed down its own
 * segment. The two rotations are applied as two separate `place` calls rather than
 * composed into one XYZ Euler, for the reason stated in modules/kit.js#aimed: a
 * composed Euler at a seam is where the twelve-degrees-wrong bugs live.
 *
 * The port arm is produced by `G.mirrorGeometryX`, which negates x AND reverses
 * the triangle winding. It is NOT produced by a negative scale: a negative-
 * determinant transform inverts winding, three's normal matrix flips the normals to
 * compensate, and the rasteriser then culls every front face - the arm would render
 * inside-out, including in the shadow map. See hardpoints.js §3.
 */
function armLoft() {
  const parts = [];
  for (let i = 0; i < SL_ARM.length - 1; i++) {
    const a = SL_ARM[i], b = SL_ARM[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, dy / len)));
    const geo = G.loft([
      { z: 0, points: G.octProfile(a[3], a[4], -a[4], a[3] * 0.6, a[4] * 0.5, a[4] * 0.5) },
      { z: len, points: G.octProfile(b[3], b[4], -b[4], b[3] * 0.6, b[4] * 0.5, b[4] * 0.5) },
    ], { capFront: i === SL_ARM.length - 2, capBack: i === 0 });
    parts.push({ geo: G.place(G.place(geo, { rot: [pitch, 0, 0] }), { rot: [0, yaw, 0], pos: [a[0], a[1], a[2]] }) });
  }
  return G.mergeParts(parts);
}

/** Both arms. Starboard as authored, port properly mirrored. */
function cradleArms() {
  const stbd = armLoft();
  return [stbd, G.mirrorGeometryX(stbd)];
}

function tenderParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', SL_HULL.loftPick([-270, -10, 230], { capFront: false }));
    // The arms ARE the class, so they survive whole. There is nothing else at this
    // range worth spending triangles on.
    for (const arm of cradleArms()) B.add('core', 'hull', arm);
    return { buckets: B.list() };
  }

  // --- 1. the spindle ------------------------------------------------------
  B.add('core', 'hull', full ? SL_HULL.loft({ capFront: false })
    : SL_HULL.loftPick([-270, -150, -10, 130, 230], { capFront: false }));
  B.add('core', 'emissive', glowSlot(2.2, 1.2), { pos: [0, -17, 310.2] });

  // --- 2. THE CRADLE ARMS. One swept surface a side, root to closure. ------
  for (const arm of cradleArms()) B.add('core', 'hull', arm);
  // Where the two arms meet under the bow: one closure block, so the loop is
  // visibly CLOSED. An open loop is two arms; a closed one is a cradle.
  B.add('core', 'plating', G.panelledSlab({
    width: 54, height: 24, depth: 74, chamfer: 6, detail: D,
  }), { pos: [0, -92, 276], rot: [0.24, 0, 0] });

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

  // --- 3. dorsal: a long low faired spine and two flush blisters -----------
  B.add('core', 'hull', G.taperedWedge({
    length: 300, width0: 34, height0: 44, width1: 16, height1: 20, shear: -6, chamfer: 6, detail: D,
  }), { pos: [0, 40, -170] });
  for (const dz of full ? [-120, 20] : [-40]) {
    B.add('core', 'plating', G.mountPad({ radius: 15, height: 6, sides: 8, detail: D }), { pos: [0, 64, dz] });
  }
  if (full) {
    B.add('core', 'trim', G.panelledSlab({ width: 1.6, height: 26, depth: 1.6, detail: D }),
      { pos: [0, 74, -240], rot: [0.5, 0, 0] });
    B.add('core', 'emissive', glowSlot(24, 2.2), { pos: [0, 46, 96], rot: [-0.4, 0, 0] });
    B.add('core', 'emissive', glowSlot(24, 2.2), { pos: [0, 39, 96], rot: [-0.4, 0, 0] });
  }

  // --- 4. fabrication bay: a recess in the ventral hull, over the void -----
  B.add('core', 'dark', G.recess({ width: 44, height: 120, depth: 22, wall: 8, detail: D }),
    { pos: [0, -36, 40], rot: [HALF_PI, 0, 0] });
  B.add('core', 'emissive', glowSlot(34, 100), { pos: [0, -40, 40], rot: [HALF_PI, 0, 0] });

  // --- 5. stern: one wide bar of light, flanked by two smaller ones --------
  B.add('engine', 'dark', G.panelledSlab({ width: 34, height: 15, depth: 22, chamfer: 5, detail: D }),
    { pos: [0, -1, -298] });
  B.add('engine', 'emissive', glowSlot(25, 9), { pos: [0, -1, -310.4], rot: [0, PI, 0] });
  for (const s of [-1, 1]) {
    B.add('engine', 'emissive', glowSlot(7, 4), { pos: [s * 22, 4, -305], rot: [0, PI, 0] });
  }

  // --- 6. running lights ---------------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(SL_HULL, -300, 290, s, { width: 3.0 }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// STRIKE CRAFT — "Shrike", 18 m, under 150 triangles
// ===========================================================================

/**
 * Starboard wing, [x, z], CCW. Forward-swept and genuinely BIG: the tip is at
 * x = 6.4 on a hull whose half-beam is 2.2, so the wing is most of the plan area
 * rather than a fillet.
 */
const SH_WING = [[1.4, 0.6], [1.4, -4.2], [6.4, -0.6], [5.6, 3.4]];

function strikeCraftParts() {
  const D = G.DETAIL.MID;
  const B = new Buckets();

  // THE FORK. The nose is split into two prongs with a 1.6 m gap between them and
  // the emitter firing down the slot. It is the whole class read and it is the one
  // feature that survives to three pixels: the Bolt is a solid delta with a tall
  // fin, the Whipcord has a hole in its TAIL, and this has a hole in its NOSE.
  B.add('core', 'hull', G.loft([
    { z: -6.0, points: G.octProfile(1.5, 0.7, -0.9, 1.0, 0.5, 0.6) },
    { z: -1.0, points: G.octProfile(2.2, 1.0, -1.2, 1.5, 0.7, 0.9) },
    { z: 2.4, points: G.octProfile(1.8, 0.8, -1.0, 1.2, 0.5, 0.7) },
  ]));
  for (const s of [-1, 1]) {
    B.add('core', 'plating', G.taperedWedge({
      length: 7.6, width0: 1.5, height0: 1.1, width1: 0.3, height1: 0.25, detail: D,
    }), { pos: [s * 0.9, 0, 2.4], rot: [0, -s * 0.045, 0] });
    B.add('core', 'plating', bladePlate(s > 0 ? SH_WING : mirrorOutline(SH_WING), 0.4), { pos: [0, -0.1, 0] });
  }
  // The emitter sits deep in the throat of the fork, so the gap reads as a working
  // aperture rather than as a missing part.
  B.add('core', 'emissive', glowSlot(1.1, 0.6), { pos: [0, 0, 4.2] });

  // Deep single ventral fin. In profile this class is otherwise a flat line; the
  // fin hangs BELOW the wing plane so the Shrike has a bottom edge the Bolt and
  // the Whipcord do not.
  B.add('core', 'plating', G.radiatorFin({
    chord: 4.4, span: 1.9, thickness: 0.3, sweep: 1.4, tipChord: 2.2, detail: D,
  }), { pos: [0, -1.0, -3.0], rot: [PI, 0, 0] });

  B.add('core', 'emissive', glowSlot(1.6, 0.35), { pos: [0, 1.0, 0.4], rot: [-0.5, 0, 0] });
  B.add('core', 'dark', G.panelledSlab({ width: 2.6, height: 1.4, depth: 1.6, detail: D }),
    { pos: [0, -0.1, -6.6] });
  B.add('core', 'emissive', glowSlot(2.0, 0.8), { pos: [0, -0.1, -7.5], rot: [0, PI, 0] });
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
    hullHP: 780, triBudget: 500,
    partsFor: corvetteParts,
    levels: 2,
    subsystems: [
      { id: 'lance', kind: 'weapon', hp: 150, position: [0, -2, 40], radius: 9, salvageValue: 0.32, label: 'Nose Lance' },
      { id: 'reactor', kind: 'reactor', hp: 190, position: [0, 0, -8], radius: 8, salvageValue: 0.34, label: 'Core' },
      // On the tailplane between the booms: one hitbox that covers both drives,
      // sitting on geometry the player can actually see and shoot at.
      { id: 'engine', kind: 'engine', hp: 150, position: [0, 5.2, -43], radius: 12, salvageValue: 0.14, label: 'Drive Booms' },
      { id: 'sensor', kind: 'sensor', hp: 90, position: [0, 4.3, 10], radius: 5, salvageValue: 0.08, label: 'Array' },
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
    hullHP: 3100, triBudget: 900,
    partsFor: frigateParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 680, position: [0, 0, -10], radius: 16, salvageValue: 0.36, label: 'Reactor' },
      { id: 'port_battery', kind: 'weapon', hp: 380, position: [-15.4, 1, -2], radius: 22, salvageValue: 0.30, label: 'Port Slots' },
      { id: 'stbd_battery', kind: 'weapon', hp: 380, position: [15.4, 1, -2], radius: 22, salvageValue: 0.30, label: 'Starboard Slots' },
      { id: 'engine', kind: 'engine', hp: 560, position: [0, -0.3, -100], radius: 18, salvageValue: 0.18, label: 'Drive Slots' },
      { id: 'sensor', kind: 'sensor', hp: 220, position: [0, 22, -22], radius: 18, salvageValue: 0.12, label: 'Sail Array' },
    ],
    weapons: [
      weapon('mr_port', 'Port Beam Slots', 'beam', {
        mount: [-16, 1, -2], yawCentre: PI * 0.5, yawWidth: PI * 0.58,
        range: RANGE.beam, damage: 34, shotsPerBurst: 2, burstInterval: 0.5,
        cooldown: 3.2, projectileSpeed: Infinity, tracking: 0.7, subsystemAccuracy: 0.72,
      }),
      weapon('mr_stbd', 'Starboard Beam Slots', 'beam', {
        mount: [16, 1, -2], yawCentre: -PI * 0.5, yawWidth: PI * 0.58,
        range: RANGE.beam, damage: 34, shotsPerBurst: 2, burstInterval: 0.5,
        cooldown: 3.2, projectileSpeed: Infinity, tracking: 0.7, subsystemAccuracy: 0.72,
      }),
      weapon('mr_dorsal', 'Dorsal Blister', 'rail', {
        mount: [0, 9.0, 26], yawCentre: 0, yawWidth: PI * 1.3,
        range: RANGE.rail * 0.8, damage: 56, shotsPerBurst: 1, cooldown: 5.0,
        projectileSpeed: 3200, tracking: 0.6,
      }),
      weapon('mr_pd', 'Point Defence', 'pd', {
        mount: [0, 9.0, -2], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
    hullHP: 4600, triBudget: 1200,
    partsFor: halcyonParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 900, position: [0, 0, -30], radius: 22, salvageValue: 0.32, label: 'Core' },
      { id: 'keel_array', kind: 'sensor', hp: 620, position: [0, -60, -34], radius: 44, salvageValue: 0.18, label: 'Keel Array' },
      { id: 'port_wing', kind: 'weapon', hp: 700, position: [-58, 3, 4], radius: 46, salvageValue: 0.20, label: 'Port Wing Slots' },
      { id: 'stbd_wing', kind: 'weapon', hp: 700, position: [58, 3, 4], radius: 46, salvageValue: 0.20, label: 'Starboard Wing Slots' },
      { id: 'engine_port', kind: 'engine', hp: 520, position: [-80, -2, -100], radius: 20, salvageValue: 0.10, label: 'Port Drive' },
      { id: 'engine_stbd', kind: 'engine', hp: 520, position: [80, -2, -100], radius: 20, salvageValue: 0.10, label: 'Starboard Drive' },
    ],
    weapons: [
      weapon('hc_port', 'Port Wing Slots', 'beam', {
        mount: [-58, 4, 4], yawCentre: PI * 0.5, yawWidth: PI * 0.70,
        range: RANGE.beam * 1.05, damage: 48, shotsPerBurst: 3, burstInterval: 0.4,
        cooldown: 3.4, projectileSpeed: Infinity, tracking: 0.8, subsystemAccuracy: 0.70,
      }),
      weapon('hc_stbd', 'Starboard Wing Slots', 'beam', {
        mount: [58, 4, 4], yawCentre: -PI * 0.5, yawWidth: PI * 0.70,
        range: RANGE.beam * 1.05, damage: 48, shotsPerBurst: 3, burstInterval: 0.4,
        cooldown: 3.4, projectileSpeed: Infinity, tracking: 0.8, subsystemAccuracy: 0.70,
      }),
      weapon('hc_pd', 'Point Defence', 'pd', {
        mount: [0, 20, -6], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
    hullHP: 8600, triBudget: 1600,
    partsFor: destroyerParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 1850, position: [0, 0, -30], radius: 30, salvageValue: 0.40, label: 'Reactor' },
      { id: 'lance', kind: 'weapon', hp: 700, position: [0, -4, 190], radius: 26, salvageValue: 0.16, label: 'Bow Lance' },
      { id: 'blister_fwd', kind: 'weapon', hp: 640, position: [0, 84, 40], radius: 18, salvageValue: 0.12, label: 'Forward Blister' },
      { id: 'blister_aft', kind: 'weapon', hp: 640, position: [0, 66, -96], radius: 18, salvageValue: 0.12, label: 'Aft Blister' },
      { id: 'engine_port', kind: 'engine', hp: 900, position: [-88, -34, -140], radius: 26, salvageValue: 0.12, label: 'Port Nacelle' },
      { id: 'engine_stbd', kind: 'engine', hp: 900, position: [88, -34, -140], radius: 26, salvageValue: 0.12, label: 'Starboard Nacelle' },
      { id: 'engine_main', kind: 'engine', hp: 1100, position: [0, 4, -230], radius: 26, salvageValue: 0.10, label: 'Main Drive' },
      { id: 'hangar', kind: 'hangar', hp: 780, position: [0, -34, -20], radius: 30, salvageValue: 0.12, label: 'Hangar Slot' },
      { id: 'sensor', kind: 'sensor', hp: 500, position: [0, 76, -170], radius: 30, salvageValue: 0.10, label: 'Tail Array' },
    ],
    weapons: [
      weapon('pg_lance', 'Bow Lance', 'lance', {
        mount: [0, -20.0, 240.4], yawCentre: 0, yawWidth: PI * 0.18, pitchWidth: PI * 0.12,
        range: RANGE.lance, damage: 132, shotsPerBurst: 1, cooldown: 7.0,
        projectileSpeed: Infinity, tracking: 0.28, subsystemAccuracy: 0.9,
      }),
      weapon('pg_port', 'Port Beam Battery', 'beam', {
        mount: [-33, 2, 0], yawCentre: PI * 0.5, yawWidth: PI * 0.56,
        range: RANGE.beam * 1.1, damage: 64, shotsPerBurst: 2, burstInterval: 0.55,
        cooldown: 4.2, projectileSpeed: Infinity, tracking: 0.5, subsystemAccuracy: 0.78,
      }),
      weapon('pg_stbd', 'Starboard Beam Battery', 'beam', {
        mount: [33, 2, 0], yawCentre: -PI * 0.5, yawWidth: PI * 0.56,
        range: RANGE.beam * 1.1, damage: 64, shotsPerBurst: 2, burstInterval: 0.55,
        cooldown: 4.2, projectileSpeed: Infinity, tracking: 0.5, subsystemAccuracy: 0.78,
      }),
      weapon('pg_dorsal', 'Dorsal Blisters', 'rail', {
        mount: [0, 84, 40], yawCentre: 0, yawWidth: PI * 1.25,
        range: RANGE.rail, damage: 88, shotsPerBurst: 1, cooldown: 5.6,
        projectileSpeed: 3400, tracking: 0.44,
      }),
      weapon('pg_pd', 'Point Defence', 'pd', {
        mount: [0, 66, -96], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
    hullHP: 11500, triBudget: 1600,
    partsFor: tenderParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 2600, position: [0, 4, -60], radius: 40, salvageValue: 0.30, label: 'Reactor' },
      { id: 'cradle_port', kind: 'hangar', hp: 1800, position: [-96, -128, 90], radius: 90, salvageValue: 0.18, label: 'Port Cradle Arm' },
      { id: 'cradle_stbd', kind: 'hangar', hp: 1800, position: [96, -128, 90], radius: 90, salvageValue: 0.18, label: 'Starboard Cradle Arm' },
      { id: 'fabricator', kind: 'hangar', hp: 1400, position: [0, -40, 40], radius: 50, salvageValue: 0.20, label: 'Fabrication Bay' },
      { id: 'engine', kind: 'engine', hp: 1500, position: [0, -1, -300], radius: 34, salvageValue: 0.14, label: 'Drive Slots' },
      { id: 'sensor', kind: 'sensor', hp: 620, position: [0, 62, -180], radius: 30, salvageValue: 0.10, label: 'Spine Array' },
    ],
    weapons: [
      weapon('sl_pd_fwd', 'Forward Point Defence', 'pd', {
        mount: [0, 64, 20], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 11, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.8, projectileSpeed: 2400, tracking: 3.2,
      }),
      weapon('sl_pd_aft', 'Aft Point Defence', 'pd', {
        mount: [0, 64, -120], yawCentre: PI, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
    hullHP: 72, triBudget: 150,
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
