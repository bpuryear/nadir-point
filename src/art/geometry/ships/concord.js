/**
 * CONCORD HULLS — sleek. Ceramic over metal, built by people who never expect a
 * boarding action.
 *
 * THE DESIGN LANGUAGE. Read the Coalition file first; this one is defined against
 * it, point for point, because the pass/fail criterion is that the two navies are
 * distinguishable in black silhouette with no colour at all.
 *
 *   SWEPT AND CONTINUOUS. Where Coalition steps between stations, Concord runs six
 *   or seven of them so the flank is a continuous curve made of flat facets. The
 *   cross-section is a BLADE: the chamfers are almost as wide as the half-beam, so
 *   the top and bottom faces are narrow strips and the hull is a flattened diamond.
 *   Nothing on a Concord hull is a box.
 *
 *   NOTHING HANGS OFF. No pylons, no external conduit, no cantilevered radiators.
 *   Every mass either grows out of the hull line (wings, sail, strakes) or is
 *   recessed into it (weapon slots, exhausts, the hangar). Concord does not admit
 *   to having machinery.
 *
 *   NO BELLS. The drive is a recessed rectangular SLOT with a lit throat. This is
 *   the single fastest tell at any distance: Coalition sterns are a cluster of
 *   circles, Concord sterns are a horizontal bar of light.
 *
 *   PREDATORY. Every class leads with a long thin nose and carries its mass aft.
 *   The eye is meant to read "this is pointed at you".
 *
 * THE THREE CLASSES:
 *   corvette   an arrowhead. Blade fuselage with two swept-back wings; from above a
 *              dart, from the side almost nothing at all.
 *   frigate    a shark. Long spindle with ONE tall dorsal sail amidships and two
 *              forward-swept ventral strakes. The sail is the class read.
 *   destroyer  a TRIMARAN. Central blade with two 220 m outrigger nacelles slung on
 *              swept pylons. From above it is three parallel blades and there is
 *              nothing else in the game shaped like that.
 */

import * as G from '../greeble.js';
import { HULL_LENGTH, RANGE } from '../../../core/units.js';
import {
  Buckets, Lines, chineStrip, glowSlot, shipClass, weapon, bladePlate, mirrorOutline,
} from './common.js';

const PI = Math.PI;
const HALF_PI = PI * 0.5;

// ===========================================================================
// CORVETTE — "Whipcord", 95 m
// ===========================================================================

const CC_HULL = new Lines([
  [-40, 4.6, 2.2, -2.8, 3.0, 1.5, 1.8],
  [-24, 7.0, 3.6, -4.2, 4.6, 2.4, 3.0],
  [-4, 7.6, 4.0, -4.4, 5.0, 2.6, 3.2],
  [18, 5.8, 3.0, -3.4, 3.8, 2.0, 2.4],
  [36, 2.8, 1.5, -1.7, 1.8, 1.0, 1.2],
]);

/** Starboard wing outline, [x, z], CCW. Swept back hard; the tip trails the tail. */
const CC_WING = [[5.5, 8], [5.5, -30], [14.5, -27], [16.5, -14]];

function corvetteParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  // --- 1. the blade --------------------------------------------------------
  B.add('core', 'hull', CC_HULL.loft({ capFront: false }, full ? 1 : 2));
  // Drooped nose. In profile this class is otherwise a straight line, and a
  // straight line is not a silhouette.
  B.add('core', 'plating', G.taperedWedge({
    length: 11.5, width0: 5.6, height0: 3.2, width1: 1.0, height1: 0.7, shear: -1.3, chamfer: 0.5, detail: D,
  }), { pos: [0, 0, 36] });
  // The lance aperture. Concord's guns are holes, not barrels.
  B.add('weapon', 'emissive', glowSlot(1.1, 0.5), { pos: [0, 0.2, 47.4] });

  // --- 2. wings ------------------------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'plating', bladePlate(s > 0 ? CC_WING : mirrorOutline(CC_WING), 1.1), { pos: [0, -0.4, 0] });
    if (full) {
      // Wing-root fairing: the wing GROWS from the hull, it is not bolted to it.
      B.add('core', 'hull', G.taperedWedge({
        length: 26, width0: 3.6, height0: 4.4, width1: 1.4, height1: 1.6, shear: -0.6, detail: D,
      }), { pos: [s * 6.4, -0.2, -2], rot: [0, PI, 0] });
      // Wing-tip drive: a lit slot, not a nozzle.
      B.add('engine', 'emissive', glowSlot(2.6, 0.9), { pos: [s * 12.4, -0.4, -27.6], rot: [0, PI, 0] });
    }
  }

  // --- 3. dorsal sail + ventral strake -------------------------------------
  // Small, and as far aft as it goes: the frigate owns the tall-fin read.
  B.add('core', 'plating', G.radiatorFin({
    chord: 13, span: 4.6, thickness: 0.9, sweep: -5, tipChord: 7, detail: D,
  }), { pos: [0, 3.2, -32] });
  if (full) {
    B.add('core', 'plating', G.radiatorFin({
      chord: 13, span: 3.4, thickness: 0.9, sweep: 5, tipChord: 7, detail: D,
    }), { pos: [0, -4.0, -6], rot: [PI, 0, 0] });
  }

  // --- 4. stern: one recessed slot, lit ------------------------------------
  B.add('engine', 'dark', G.panelledSlab({ width: 9.0, height: 4.4, depth: 8.0, chamfer: 1.4, detail: D }),
    { pos: [0, -0.3, -43.2] });
  B.add('engine', 'emissive', glowSlot(6.6, 2.2), { pos: [0, -0.3, -47.4], rot: [0, PI, 0] });

  // --- 5. canopy: a dark slit, flush ---------------------------------------
  if (full) {
    B.add('core', 'glass', G.panelledSlab({ width: 2.4, height: 0.6, depth: 4.4, detail: D }),
      { pos: [0, 3.9, 12] });
    // The single accent line. Concord wears one, on the port shoulder, always.
    B.add('core', 'trim', G.panelledSlab({ width: 0.8, height: 0.5, depth: 14, detail: D }),
      { pos: [-5.4, 2.6, 4], rot: [0, -0.06, 0] });
  }

  // --- 6. running lights: 6 m, both flanks, mandatory ----------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(CC_HULL, -36, 30, s));

  return { buckets: B.list() };
}

// ===========================================================================
// FRIGATE — "Meridian", 210 m
// ===========================================================================

const MR_HULL = new Lines([
  [-96, 5.4, 2.6, -3.2, 3.6, 1.6, 2.0],
  [-72, 10.5, 5.4, -6.4, 7.0, 3.2, 4.0],
  [-40, 14.0, 7.4, -8.6, 9.2, 4.4, 5.4],
  [-4, 15.0, 8.0, -9.0, 9.8, 4.8, 5.8],
  [34, 12.0, 6.4, -7.4, 7.8, 3.8, 4.6],
  [66, 6.6, 3.4, -4.0, 4.2, 2.0, 2.6],
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
  const decim = lod === 0 ? 1 : 2;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', MR_HULL.loft({ capFront: false }, 2));
    B.add('core', 'hull', G.taperedWedge({
      length: 40, width0: 13.2, height0: 7.4, width1: 1.4, height1: 1.0, detail: D,
    }), { pos: [0, 0, 66] });
    // The sail carries the class at any distance, so it survives to the far LOD.
    B.add('core', 'hull', G.radiatorFin({
      chord: 58, span: 36, thickness: 3.0, sweep: -18, tipChord: 24, detail: D,
    }), { pos: [0, 7.0, -30] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', bladePlate(s > 0 ? MR_STRAKE : mirrorOutline(MR_STRAKE), 3.0), { pos: [0, -7, 0] });
    }
    return { buckets: B.list() };
  }

  // --- 1. spindle + needle -------------------------------------------------
  B.add('core', 'hull', MR_HULL.loft({ capFront: false }, decim));
  B.add('core', 'plating', G.taperedWedge({
    length: 40, width0: 13.2, height0: 7.4, width1: 1.4, height1: 1.0, chamfer: 0.8, detail: D,
  }), { pos: [0, 0, 66] });
  B.add('weapon', 'emissive', glowSlot(1.4, 0.8), { pos: [0, 0.2, 106.2] });

  // --- 2. THE SAIL. The class read. ---------------------------------------
  // Tall and near-vertical, amidships. The corvette's fin is small and far aft, so
  // the two never resolve to the same shape from the beam.
  B.add('tower', 'hull', G.radiatorFin({
    chord: 58, span: 36, thickness: 3.0, sweep: -18, tipChord: 24, detail: D,
  }), { pos: [0, 7.0, -30] });
  if (full) {
    // Sensor strip up the leading edge instead of a mast. Concord hides its aerials.
    B.add('tower', 'trim', G.panelledSlab({ width: 1.2, height: 30, depth: 1.2, detail: D }),
      { pos: [0, 24, -8], rot: [0.30, 0, 0] });
  }

  // --- 3. ventral strakes, swept FORWARD -----------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'plating', bladePlate(s > 0 ? MR_STRAKE : mirrorOutline(MR_STRAKE), 2.6), { pos: [0, -7.4, 0] });
    if (full) {
      B.add('core', 'hull', G.taperedWedge({
        length: 34, width0: 5.0, height0: 6.0, width1: 2.0, height1: 2.4, shear: -1.0, detail: D,
      }), { pos: [s * 13.0, -6.0, -14] });
    }
  }

  // --- 4. weapons: recessed slots, three a side ----------------------------
  for (const s of [-1, 1]) {
    for (const dz of full ? [26, -2, -30] : [-2]) {
      B.add('weapon', 'dark', G.blastDoor({ width: 16, height: 5.0, depth: 1.6, seam: false, detail: D }),
        { pos: [s * 14.6, 1.0, dz], rot: [0, s * HALF_PI, 0] });
      if (full) {
        B.add('weapon', 'emissive', glowSlot(12, 0.7),
          { pos: [s * 15.0, 1.0, dz], rot: [0, s * HALF_PI, 0] });
      }
    }
  }
  // Two flush dorsal blisters. A dome, not a turret: the barrels live inside.
  for (const dz of full ? [26, -2] : [12]) {
    B.add('weapon', 'plating', G.mountPad({ radius: 6.0, height: 2.6, sides: 8, detail: D }),
      { pos: [0, 7.4, dz] });
  }
  // Ventral sensor keel. The frigate's third mass: from the beam it is a bulge
  // under a blade, which is a shape neither the corvette nor the destroyer has.
  B.add('core', 'hull', G.taperedWedge({
    length: 62, width0: 11, height0: 12, width1: 5, height1: 5, shear: 2.5, chamfer: 2.4, detail: D,
  }), { pos: [0, -12, -34] });
  if (full) {
    B.add('core', 'dark', G.blastDoor({ width: 8, height: 26, depth: 1.4, seam: false, detail: D }),
      { pos: [0, -17.5, -6], rot: [-HALF_PI, 0, 0] });
  }

  // --- 5. stern: two slots and a tail fairing ------------------------------
  B.add('engine', 'dark', G.panelledSlab({ width: 15, height: 7.0, depth: 10, chamfer: 2.2, detail: D }),
    { pos: [0, -0.3, -99] });
  for (const s of [-1, 1]) {
    B.add('engine', 'emissive', glowSlot(5.4, 3.0), { pos: [s * 3.6, -0.3, -104.2], rot: [0, PI, 0] });
  }

  if (full) {
    B.add('core', 'glass', G.panelledSlab({ width: 4.6, height: 1.0, depth: 7.0, detail: D }),
      { pos: [0, 7.9, 40] });
    B.add('core', 'trim', G.panelledSlab({ width: 1.2, height: 0.7, depth: 44, detail: D }),
      { pos: [-11.0, 5.2, 18], rot: [0, -0.05, 0] });
  }

  // --- 6. running lights ---------------------------------------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(MR_HULL, -92, 60, s, { width: 2.0 }));

  return { buckets: B.list() };
}

// ===========================================================================
// DESTROYER — "Peregrine", 480 m. A trimaran.
// ===========================================================================

const PG_HULL = new Lines([
  [-228, 11, 5.5, -6.5, 7.4, 3.2, 4.2],
  [-176, 22, 12, -14, 14, 6.5, 8.5],
  [-110, 30, 17, -19, 19, 9, 12],
  [-30, 33, 19, -21, 21, 10, 13],
  [56, 27, 15, -17, 17, 8, 10],
  [130, 16, 9, -10, 10, 4.6, 6],
]);

/**
 * Outrigger nacelle, 220 m, carried at x = +-88 and 30 m BELOW the centreline.
 *
 * Both of those numbers are silhouette decisions. Outboard far enough that there
 * is forty metres of daylight between hull and nacelle in plan - otherwise the
 * pylons fill the gap and the trimaran collapses into one delta, which is exactly
 * what happened the first time. Slung LOW so the profile is a three-level stack
 * instead of one flat sliver, which is the only thing that tells this class from
 * the frigate when both are edge-on.
 */
const PG_NACELLE = new Lines([
  [-150, 6, 3.4, -4.0, 4.0, 1.8, 2.4],
  [-108, 11, 6.0, -7.0, 7.2, 3.4, 4.4],
  [-40, 13, 7.2, -8.4, 8.6, 4.0, 5.2],
  [34, 10, 5.6, -6.4, 6.6, 3.0, 4.0],
  [70, 4, 2.2, -2.6, 2.6, 1.2, 1.6],
]);
const PG_NACELLE_X = 88;
const PG_NACELLE_Y = -30;

/**
 * Starboard forward and aft pylons, [x, z], CCW. Swept back, faired, and thin
 * enough in Z that most of the forty metres between hull and nacelle stays open
 * in plan. A short stubby pylon reads as a packing crate between two ships.
 */
const PG_PYLON_F = [[26, 60], [28, 10], [82, -15], [80, 20]];
const PG_PYLON_A = [[28, -52], [30, -100], [82, -120], [80, -78]];
const PG_PYLON_Y = -21;

function destroyerParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const decim = lod === 0 ? 1 : 2;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', PG_HULL.loft({ capFront: false }, 2));
    B.add('core', 'hull', G.taperedWedge({
      length: 110, width0: 32, height0: 19, width1: 3, height1: 2, detail: D,
    }), { pos: [0, 0, 130] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', PG_NACELLE.loft({}, 2), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
      B.add('core', 'hull', bladePlate(s > 0 ? PG_PYLON_F : mirrorOutline(PG_PYLON_F), 11), { pos: [0, PG_PYLON_Y, 0] });
      B.add('core', 'hull', bladePlate(s > 0 ? PG_PYLON_A : mirrorOutline(PG_PYLON_A), 11), { pos: [0, PG_PYLON_Y, 0] });
    }
    B.add('core', 'hull', G.panelledSlab({ width: 16, height: 20, depth: 250, detail: D }),
      { pos: [0, 24, -40] });
    return { buckets: B.list() };
  }

  // --- 1. central blade + 110 m lance nose ---------------------------------
  B.add('core', 'hull', PG_HULL.loft({ capFront: false }, decim));
  B.add('core', 'plating', G.taperedWedge({
    length: 110, width0: 32, height0: 19, width1: 3.4, height1: 2.4, chamfer: 1.6, detail: D,
  }), { pos: [0, 0, 130] });
  B.add('weapon', 'emissive', glowSlot(2.6, 1.6), { pos: [0, 0.4, 240.4] });
  if (full) {
    // Lance rails: two thin strips down the nose. The only forward detail there is.
    for (const s of [-1, 1]) {
      B.add('weapon', 'trim', G.panelledSlab({ width: 1.4, height: 1.0, depth: 78, detail: D }),
        { pos: [s * 4.0, 3.0, 176], rot: [0, s * 0.03, 0] });
    }
  }

  // --- 2. the outriggers. The class read. ---------------------------------
  for (const s of [-1, 1]) {
    B.add('engine', 'hull', PG_NACELLE.loft({ capFront: false }, decim), { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] });
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

  // --- 3. dorsal: a long low spine and three flush blisters ----------------
  // NO SAIL. The frigate is the class with the fin; if this one had one too, the
  // two would be the same shape at two sizes when seen from the beam.
  B.add('tower', 'hull', G.panelledSlab({ width: 16, height: 20, depth: 250, chamfer: 4, detail: D }),
    { pos: [0, 24, -40] });
  for (const dz of full ? [70, 10, -50] : [10]) {
    B.add('weapon', 'plating', G.mountPad({ radius: 13, height: 5.5, sides: 8, detail: D }),
      { pos: [0, 34, dz] });
    if (full) {
      B.add('weapon', 'dark', G.panelledSlab({ width: 7, height: 3.4, depth: 20, chamfer: 1.2, detail: D }),
        { pos: [0, 38, dz + 9] });
    }
  }
  if (full) {
    B.add('tower', 'trim', G.panelledSlab({ width: 1.6, height: 30, depth: 1.6, detail: D }),
      { pos: [0, 48, -140], rot: [0.5, 0, 0] });
    B.add('core', 'glass', G.panelledSlab({ width: 8, height: 1.6, depth: 12, detail: D }),
      { pos: [0, 18.8, 116] });
  }

  // --- 4. flank slots + ventral hangar -------------------------------------
  for (const s of [-1, 1]) {
    for (const dz of full ? [56, 0, -56] : [0]) {
      B.add('weapon', 'dark', G.blastDoor({ width: 34, height: 11, depth: 3, seam: false, detail: D }),
        { pos: [s * 32.4, 2, dz], rot: [0, s * HALF_PI, 0] });
      if (full) {
        B.add('weapon', 'emissive', glowSlot(27, 1.6), { pos: [s * 33.2, 2, dz], rot: [0, s * HALF_PI, 0] });
      }
    }
  }
  // Hangar: a slot in the ventral centreline with a lit throat, no doors visible.
  B.add('hangar', 'dark', G.panelledSlab({ width: 26, height: 6, depth: 62, chamfer: 2, detail: D }),
    { pos: [0, -20, -20] });
  B.add('hangar', 'emissive', glowSlot(20, 44), { pos: [0, -22.6, -20], rot: [HALF_PI, 0, 0] });

  // --- 5. stern: one wide bar of light -------------------------------------
  B.add('engine', 'dark', G.panelledSlab({ width: 26, height: 13, depth: 18, chamfer: 4, detail: D }),
    { pos: [0, 0, -230] });
  B.add('engine', 'emissive', glowSlot(19, 8), { pos: [0, 0, -239.6], rot: [0, PI, 0] });

  // --- 6. running lights: hull and both nacelles ---------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(PG_HULL, -220, 124, s, { width: 3.4 }));
    B.add('engine', 'runningLights', G.place(chineStrip(PG_NACELLE, -144, 64, s, { width: 2.4 }),
      { pos: [s * PG_NACELLE_X, PG_NACELLE_Y, 0] }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// STRIKE CRAFT — "Shrike", 18 m, under 150 triangles
// ===========================================================================

/** Starboard wing, [x, z], CCW. Forward-swept: it reads as Concord at 3 pixels. */
const SH_WING = [[1.4, 1.0], [1.4, -4.0], [4.6, -1.4], [4.4, 2.6]];

function strikeCraftParts() {
  const D = G.DETAIL.MID;
  const B = new Buckets();

  // A flattened dart. No canopy bubble, no pods, no visible engine.
  B.add('core', 'hull', G.loft([
    { z: -6.0, points: G.octProfile(1.5, 0.7, -0.9, 1.0, 0.5, 0.6) },
    { z: -1.0, points: G.octProfile(2.2, 1.0, -1.2, 1.5, 0.7, 0.9) },
    { z: 4.5, points: G.octProfile(1.4, 0.6, -0.8, 0.9, 0.4, 0.5) },
  ]));
  B.add('core', 'plating', G.taperedWedge({
    length: 5.5, width0: 2.6, height0: 1.3, width1: 0.4, height1: 0.3, detail: D,
  }), { pos: [0, 0, 4.5] });
  for (const s of [-1, 1]) {
    B.add('core', 'plating', bladePlate(s > 0 ? SH_WING : mirrorOutline(SH_WING), 0.4), { pos: [0, -0.1, 0] });
  }
  B.add('core', 'glass', G.panelledSlab({ width: 0.9, height: 0.3, depth: 1.8, detail: D }),
    { pos: [0, 0.9, 1.6] });
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
      { id: 'lance', kind: 'weapon', hp: 150, position: [0, 0.2, 38], radius: 9, salvageValue: 0.32, label: 'Nose Lance' },
      { id: 'reactor', kind: 'reactor', hp: 190, position: [0, 0, -10], radius: 8, salvageValue: 0.34, label: 'Core' },
      { id: 'engine', kind: 'engine', hp: 150, position: [0, -0.3, -40], radius: 8, salvageValue: 0.14, label: 'Drive Slot' },
      { id: 'sensor', kind: 'sensor', hp: 90, position: [0, 3.9, 12], radius: 5, salvageValue: 0.08, label: 'Array' },
    ],
    weapons: [
      weapon('cc_lance', 'Nose Lance', 'lance', {
        mount: [0, 0.2, 47], yawCentre: 0, yawWidth: PI * 0.20, pitchWidth: PI * 0.14,
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
      { id: 'port_battery', kind: 'weapon', hp: 380, position: [-14.6, 1, -2], radius: 22, salvageValue: 0.30, label: 'Port Slots' },
      { id: 'stbd_battery', kind: 'weapon', hp: 380, position: [14.6, 1, -2], radius: 22, salvageValue: 0.30, label: 'Starboard Slots' },
      { id: 'engine', kind: 'engine', hp: 560, position: [0, -0.3, -99], radius: 18, salvageValue: 0.18, label: 'Drive Slots' },
      { id: 'sensor', kind: 'sensor', hp: 220, position: [0, 22, -22], radius: 18, salvageValue: 0.12, label: 'Sail Array' },
    ],
    weapons: [
      weapon('mr_port', 'Port Beam Slots', 'beam', {
        mount: [-15, 1, -2], yawCentre: PI * 0.5, yawWidth: PI * 0.58,
        range: RANGE.beam, damage: 34, shotsPerBurst: 2, burstInterval: 0.5,
        cooldown: 3.2, projectileSpeed: Infinity, tracking: 0.7, subsystemAccuracy: 0.72,
      }),
      weapon('mr_stbd', 'Starboard Beam Slots', 'beam', {
        mount: [15, 1, -2], yawCentre: -PI * 0.5, yawWidth: PI * 0.58,
        range: RANGE.beam, damage: 34, shotsPerBurst: 2, burstInterval: 0.5,
        cooldown: 3.2, projectileSpeed: Infinity, tracking: 0.7, subsystemAccuracy: 0.72,
      }),
      weapon('mr_dorsal', 'Dorsal Blister', 'rail', {
        mount: [0, 8.4, 26], yawCentre: 0, yawWidth: PI * 1.3,
        range: RANGE.rail * 0.8, damage: 56, shotsPerBurst: 1, cooldown: 5.0,
        projectileSpeed: 3200, tracking: 0.6,
      }),
      weapon('mr_pd', 'Point Defence', 'pd', {
        mount: [0, 8.4, -2], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 8, shotsPerBurst: 4, burstInterval: 0.07,
        cooldown: 1.0, projectileSpeed: 2400, tracking: 3.2,
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
      { id: 'lance', kind: 'weapon', hp: 700, position: [0, 2, 190], radius: 26, salvageValue: 0.16, label: 'Bow Lance' },
      { id: 'blister_fwd', kind: 'weapon', hp: 640, position: [0, 36, 70], radius: 16, salvageValue: 0.12, label: 'Forward Blister' },
      { id: 'blister_aft', kind: 'weapon', hp: 640, position: [0, 36, -50], radius: 16, salvageValue: 0.12, label: 'Aft Blister' },
      { id: 'engine_port', kind: 'engine', hp: 900, position: [-88, -30, -140], radius: 26, salvageValue: 0.12, label: 'Port Nacelle' },
      { id: 'engine_stbd', kind: 'engine', hp: 900, position: [88, -30, -140], radius: 26, salvageValue: 0.12, label: 'Starboard Nacelle' },
      { id: 'engine_main', kind: 'engine', hp: 1100, position: [0, 0, -230], radius: 26, salvageValue: 0.10, label: 'Main Drive' },
      { id: 'hangar', kind: 'hangar', hp: 780, position: [0, -20, -20], radius: 30, salvageValue: 0.12, label: 'Hangar Slot' },
      { id: 'sensor', kind: 'sensor', hp: 500, position: [0, 40, -110], radius: 26, salvageValue: 0.10, label: 'Sail Array' },
    ],
    weapons: [
      weapon('pg_lance', 'Bow Lance', 'lance', {
        mount: [0, 0.4, 238], yawCentre: 0, yawWidth: PI * 0.18, pitchWidth: PI * 0.12,
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
        mount: [0, 36, 70], yawCentre: 0, yawWidth: PI * 1.25,
        range: RANGE.rail, damage: 88, shotsPerBurst: 1, cooldown: 5.6,
        projectileSpeed: 3400, tracking: 0.44,
      }),
      weapon('pg_pd', 'Point Defence', 'pd', {
        mount: [0, 36, -50], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 10, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.85, projectileSpeed: 2400, tracking: 3.2,
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

export { corvetteParts, frigateParts, destroyerParts, strikeCraftParts };
