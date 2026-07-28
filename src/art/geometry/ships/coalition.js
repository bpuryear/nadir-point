/**
 * COALITION HULLS — heavy industrial. Built to be repaired in the field by someone
 * angry.
 *
 * ===========================================================================
 * THE DESIGN LANGUAGE, and it is the whole reason these read as a different navy
 * from Concord rather than the same ship in a different colour:
 * ===========================================================================
 *
 *   RECTILINEAR. Wide flat decks, small chamfers relative to the beam, stations
 *   that STEP rather than sweep. Every Coalition cross-section is a box that has
 *   had its corners knocked off, never a blade. Chamfer width is 25-30% of the
 *   half-beam here against Concord's 60-70%.
 *
 *   SLAB ARMOUR, BOLTED ON. Armour belts sit PROUD of the flank with visible gaps
 *   between plates. A continuous strip is a stripe; a run of plates is armour.
 *
 *   EXTERNAL STRUCTURE. Engine pods hang off hex-strut pylons with sky between
 *   them and the hull. Radiators cantilever off the engine block. Conduit runs
 *   along the OUTSIDE where a fitter can reach it. Nothing is hidden, because
 *   hiding it means cutting the hull open to fix it.
 *
 *   VISIBLE MACHINERY. Thruster BELLS, not slots. Flanged pipe, not fairing. On
 *   the destroyer the reactor is a drum in an open waist that you can shoot.
 *
 *   ONE COLOUR OF PAINT. Safety orange on the prow and on the mount collars,
 *   nowhere else. It is the identity carrier and it stops being one the moment it
 *   is used for decoration (ship-language.md §4).
 *
 * ===========================================================================
 * WHAT CHANGED IN THIS PASS, and why
 * ===========================================================================
 * The cruiser was rebuilt to a researched design language (docs/design/ship-
 * language.md) and the fleet was still built to the old one, so the player's own
 * hull and the ships it fought no longer looked like they came from the same
 * game. Four things came across, and they are applied to every hull in this file:
 *
 *   1. NO CONSTANT SECTION (R2.1). Every station table now has a WAIST and a
 *      SHOULDER - exactly one interior minimum and one interior maximum in the
 *      plan half-beam curve (R2.2) - and the waist section is at most 0.70 of the
 *      shoulder's (R2.3). `Lines#audit()` measures all three and probes/ships.js
 *      prints the result, so this cannot quietly rot.
 *   2. A CHINE BREAK AND A CHISEL PROW (R2.4, R2.5). Over the forward 14% of each
 *      hull the silhouette height falls by at least 6.4% of the hull's length, and
 *      it falls ASYMMETRICALLY - deck steeper than 14 degrees, keel shallower than
 *      10, ratio at least 1.4:1 - so the point ends up BELOW the axis and the bow
 *      reads as a bow rather than as the end of a pipe. Every hull's forwardmost
 *      station has its section centre below y = 0.
 *   3. TUMBLEHOME AFT, FLARE FORWARD. `Lines` now carries a keel half-beam per
 *      station (see common.js). Aft of the forefoot the keel is 0.78-0.86 of the
 *      deck, so the upper flank catches the key and the lower falls into shadow;
 *      forward of it the keel is 1.05-1.12 of the deck, so the widest part of the
 *      bow is down at the forefoot.
 *   4. REAL NEGATIVE SPACE. Every class has at least one void you can see stars
 *      through from more than one direction, and on this side of the fleet the
 *      void is always STRUCTURAL - the gap under a pylon, the bay between two
 *      trusses, the canyon through the carrier - because Coalition ships are held
 *      together by things you can see.
 *
 * ===========================================================================
 * FIVE CAPITAL CLASSES, DELIBERATELY NOT THE SAME SHAPE AT FIVE SIZES
 * ===========================================================================
 *   Lancet    corvette  95 m   FORE-HEAVY ARROW. A gun with a hull under it and
 *                             two engines slung outboard on open struts.
 *   Ardent    frigate  210 m   A CROSS. Two enormous sponson boxes carried on
 *                             external trusses, overhanging the flanks by two
 *                             thirds of the hull's own beam. Solid in the middle.
 *   Sledge    monitor  420 m   A GUN WITH A RAFT UNDER IT. The lowest hull in the
 *                             game (30 m of freeboard over 420 m of length) and a
 *                             single house forward carrying two 190 m barrels that
 *                             reach 110 m past the bow.
 *   Bulwark   destroyer 480 m  BROKEN-BACKED. Forward citadel and aft engine block
 *                             joined by an OPEN WAIST with the reactor drum in it,
 *                             and a portal gantry straight over the hole.
 *   Anvil     carrier  900 m   A CANYON. Two side hulls with a 560 m flight-through
 *                             slot cut between them, open at the bow, the stern AND
 *                             the sky, crossed by two bridges. Engine towers stand
 *                             off the hull on lattice pylons.
 *
 * ARDENT vs BULWARK was the weakest pair on the silhouette sheet and it separated
 * "mainly on a 26 m waist notch" (docs/review/acceptance.md). It is now a topology
 * difference and it is stated as one rule: THE ARDENT IS SOLID IN THE MIDDLE AND
 * WIDE AT THE EDGES; THE BULWARK IS EMPTY IN THE MIDDLE AND NARROW AT THE EDGES.
 * The Bulwark's broadside boxes are gone - they were what made its plan view a
 * cross too - and its guns are now recessed casemates flush in the flank, so in
 * plan the Ardent is a cross and the Bulwark is a bar with a hole in it. There is
 * no distance at which those are the same shape.
 */

import * as G from '../greeble.js';
import { HULL_LENGTH, RANGE } from '../../../core/units.js';
import { Buckets, Lines, chineStrip, glowDisc, glowSlot, shipClass, weapon } from './common.js';

const PI = Math.PI;
const HALF_PI = PI * 0.5;

/**
 * Lengths for the two new classes. They are NOT in core/units.js#HULL_LENGTH
 * because that file is shared foundation and this stream does not edit it
 * unilaterally; adding `monitor: 300` and `carrier: 900` there is proposed in the
 * stream report. Nothing outside this file reads these.
 */
export const COALITION_LENGTH = { monitor: 420, carrier: 900 };

// ===========================================================================
// CORVETTE — "Lancet", 95 m
// ===========================================================================

/**
 * `[z, deckHalf, top, bottom, chamW, chamTop, chamBot, keelRatio]`
 *
 * Waist at z = -30 (deck half 6.0), shoulder at z = -8 (8.6): ratio of sections
 * 0.61 against the 0.70 the rule asks for. Chine break at z = +30, after which the
 * deck falls at 17.7 degrees and the keel rises at 8.4 - a 2.1 : 1 asymmetry that
 * puts the tip 3.4 m below the axis on a 95 m ship.
 */
const CV_HULL = new Lines([
  [-42, 7.4, 4.2, -7.4, 2.2, 1.5, 2.2, 0.80],
  [-30, 6.0, 3.6, -6.2, 1.8, 1.3, 1.8, 0.82],
  [-8, 8.6, 5.8, -8.2, 2.6, 1.8, 2.4, 0.78],
  [14, 7.2, 5.0, -7.6, 2.3, 1.6, 2.2, 0.86],
  [30, 4.6, 3.0, -6.8, 1.5, 1.1, 1.6, 1.05],
  [40, 2.6, -0.4, -5.4, 0.8, 0.7, 1.0, 1.10],
  [47.5, 1.0, -2.6, -4.2, 0.3, 0.4, 0.5, 1.00],
]);

/** The gun. Sits proud on the spine, offset 1.6 m to starboard - see the blister. */
const CV_GUN = new Lines([
  [-8, 5.0, 4.6, -4.2, 1.6, 1.4, 1.4],
  [30, 4.2, 3.6, -3.4, 1.4, 1.2, 1.2],
]);
const CV_GUN_Y = 9.0;
const CV_GUN_X = 1.6;

function corvetteParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  // --- 1. the hull, and the gun that is the point of it --------------------
  B.add('core', 'hull', full ? CV_HULL.loft() : CV_HULL.loftPick([-30, -8, 30, 40]));
  B.add('core', 'plating', CV_GUN.loft(), { pos: [CV_GUN_X, CV_GUN_Y, 0] });

  // Two barrels out to z = +45, muzzle plate to +47.5. This is what makes the
  // class read fore-heavy: the weapon is longer than the hull it is bolted to.
  for (const s of [-1, 1]) {
    B.add('core', 'greeble', G.pipeRun({
      length: 15, radius: 1.5, sides: 6, axis: 'z', detail: D,
    }), { pos: [CV_GUN_X + s * 2.4, CV_GUN_Y + 0.4, 30] });
  }
  B.add('core', 'dark', G.panelledSlab({ width: 9.5, height: 4.2, depth: 2.5, detail: D }),
    { pos: [CV_GUN_X, CV_GUN_Y + 0.4, 46.2] });
  // The one piece of paint on the ship, and it follows a structural edge (§4a).
  if (full) {
    B.add('core', 'trim', G.panelledSlab({ width: 10.4, height: 1.4, depth: 4.0, detail: D }),
      { pos: [CV_GUN_X, CV_GUN_Y + 3.0, 26] });
  }

  // --- 2. the crew blister, hung off the PORT flank ------------------------
  // Asymmetry with a reason: the gun took the centreline, so the two people who
  // fly this thing got bolted to the side of it.
  B.add('core', 'hull', G.panelledSlab({ width: 5.4, height: 5.0, depth: 9.0, chamfer: 1.6, detail: D }),
    { pos: [-7.8, 4.6, 4] });
  if (full) {
    // Window band, not a glass pane. A 2 m lit slot is a storey and it survives to
    // a silhouette; a dark quad is a hole in the shading and a whole extra draw.
    B.add('core', 'emissive', glowSlot(3.4, 1.0), { pos: [-10.7, 5.4, 4], rot: [0, -HALF_PI, 0] });
  }

  // --- 3. engines, bolted on outboard, with SKY BETWEEN --------------------
  // The struts are the whole Coalition thesis at 95 m: the pods do not blend into
  // the hull, they hang off it, and you can see the gap.
  for (const s of [-1, 1]) {
    B.add('engine', 'greeble', G.hexStrut({ length: 6.4, radius: 1.6, axis: 'x', detail: D }),
      { pos: [s * 5.6, -1.0, -30], rot: [0, s > 0 ? 0 : PI, 0] });
    B.add('engine', 'dark', G.panelledSlab({ width: 7.0, height: 7.4, depth: 15, chamfer: 2.0, detail: D }),
      { pos: [s * 12.6, -1.0, -33] });
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 2.9, mouth: 4.5, length: 7.0, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [s * 12.6, -1.0, -40.5] });
    B.add('engine', 'engineGlow', glowDisc(4.3, 8), { pos: [s * 12.6, -1.0, -47.4], rot: [0, PI, 0] });
  }

  // --- 4. the things a fitter touches --------------------------------------
  // Ventral ammo drum, hanging below the keel so the underside is not a flat plate.
  B.add('core', 'greeble', G.pipeRun({
    length: 26, radius: 3.8, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D,
  }), { pos: [0, -11.0, -16] });

  if (full) {
    // One radiator, starboard only. The port one is a stub where it was sheared off.
    B.add('engine', 'plating', G.radiatorFin({
      chord: 15, span: 12, thickness: 1.2, sweep: -5, tipChord: 10, detail: D,
    }), { pos: [7.6, 3.0, -34], rot: [0, 0, 0.34] });
    B.add('engine', 'dark', G.panelledSlab({ width: 1.6, height: 3.0, depth: 8, detail: D }),
      { pos: [-8.0, 4.0, -32] });

    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 34, height: 6.4, thickness: 1.8, plates: 1, gap: 5, chamfer: 1.4, detail: D,
      }), { pos: [s * 8.4, -1.2, -8] });
    }
  }

  // --- 5. running lights: mandatory, both flanks ---------------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(CV_HULL, -40, 26, s));

  return { buckets: B.list() };
}

// ===========================================================================
// FRIGATE — "Ardent", 210 m.  THE CROSS.
// ===========================================================================

/**
 * Waist at z = -72 (deck half 15.0), shoulder at z = +10 (21.5), waist section
 * 0.63 of the shoulder's. Chine break at z = +72; over the forward 30 m the
 * silhouette falls 15 m with the deck at 19.5 degrees against the keel at 8.9, and
 * the tip centre sits 6.9 m below the axis.
 */
const FG_HULL = new Lines([
  [-96, 20.0, 11.0, -14.5, 5.6, 3.6, 4.6, 0.80],
  [-72, 15.0, 8.6, -11.6, 4.2, 2.8, 3.6, 0.82],
  [-30, 18.4, 12.4, -13.0, 5.0, 3.4, 4.0, 0.80],
  [10, 21.5, 13.0, -14.0, 5.8, 3.6, 4.4, 0.78],
  [48, 17.0, 10.6, -14.8, 4.4, 3.0, 4.0, 0.90],
  [72, 12.0, 8.2, -15.4, 3.0, 2.2, 3.2, 1.10],
  [92, 6.6, 1.6, -13.4, 1.6, 1.2, 2.0, 1.12],
  [105, 2.2, -3.4, -10.4, 0.6, 0.7, 1.0, 1.00],
]);

/** Stern block. Deliberately WIDER than the hull - the step is the read. */
const FG_ENGINE = new Lines([
  [-101, 24.0, 13.5, -17.5, 6.4, 4.0, 5.0, 0.86],
  [-96, 25.5, 15.0, -18.5, 6.8, 4.2, 5.2, 0.86],
  [-88, 21.0, 12.0, -15.5, 5.6, 3.6, 4.4, 0.84],
]);

/** Blockhouse. Aft of centre and 3.5 m to port; it is a fitting, not a feature. */
const FG_BRIDGE = new Lines([
  [-46, 7.5, 27.0, 11.0, 2.0, 2.0, 2.0],
  [-20, 8.5, 31.0, 11.0, 2.5, 2.5, 2.0],
  [12, 6.0, 22.0, 11.0, 2.0, 2.0, 2.0],
]);
const FG_BRIDGE_X = -3.5;

/**
 * THE SPONSON, and it is the class.
 *
 * A 96 m box standing 20 m OUTBOARD OF THE HULL'S OWN FLANK on two open trusses,
 * so in plan the ship is a cross with two clear bays of open sky inside each arm of
 * it, and from the beam it is a long flat shelf with daylight under it. The centre
 * of the box is at x = 40 against a shoulder half-beam of 21.5: the sponsons stand
 * further outboard than the hull is wide, which is the proportion that makes the
 * plan view a CROSS rather than a hull with blisters.
 */
const FG_SPONSON_X = 40.0;

function frigateParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    // Far LOD: the four masses and the cross, and nothing else. Authored INWARD
    // from the LOD0 silhouette by naming the stations that ARE the silhouette -
    // the waist, the shoulder, the chine break and both prow stations.
    B.add('core', 'hull', FG_HULL.loftPick([-72, 10, 72, 92]));
    B.add('core', 'hull', FG_ENGINE.loft({ capFront: false }, 2));
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.panelledSlab({ width: 22, height: 15, depth: 96, detail: D }),
        { pos: [s * FG_SPONSON_X, 3, 8] });
      // The truss gap survives: two stubs, not a solid fillet. The hole inside the
      // arm of the cross is the class read and it is the last thing to go.
      for (const dz of [-30, 34]) {
        B.add('core', 'hull', G.panelledSlab({ width: 20, height: 6, depth: 10, detail: D }),
          { pos: [s * 30, 3, dz] });
      }
    }
    B.add('core', 'hull', G.panelledSlab({ width: 17, height: 22, depth: 58, detail: D }),
      { pos: [FG_BRIDGE_X, 21, -17] });
    return { buckets: B.list() };
  }

  // --- 1. spine + chisel prow ----------------------------------------------
  B.add('core', 'hull', full ? FG_HULL.loft({ capBack: false })
    : FG_HULL.loftPick([-72, 10, 48, 72, 92], { capBack: false }));
  if (full) {
    // Prow chevrons - the only paint forward of the bridge, and they run ALONG the
    // chine break rather than across a flat (§4a: an accent follows an edge).
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 1.8, height: 1.6, depth: 20, detail: D }),
        { pos: [s * 8.4, 4.5, 80], rot: [0, s * 0.12, 0.10] });
    }
  }

  // --- 2. THE SPONSONS ON OPEN TRUSSES. The class read. --------------------
  for (const s of [-1, 1]) {
    // The box itself, well outboard.
    B.add('core', 'hull', G.panelledSlab({ width: 22, height: 15, depth: 96, chamfer: 4, detail: D }),
      { pos: [s * FG_SPONSON_X, 3.0, 8] });
    // THREE TRUSSES AT UNEVEN SPACING, not a fillet. The two bays between them are
    // 35 m and 33 m of clear sky on a 96 m shelf, so a third of each arm of the
    // cross is background - which is the reason the class does not read as a fat
    // hull, and the reason the Bulwark (whose flanks are unbroken) cannot borrow it.
    for (const dz of full ? [-34, 40] : [-30, 34]) {
      B.add('core', 'greeble', G.hexStrut({ length: 20, radius: 2.6, axis: 'x', detail: D }),
        { pos: [s * 20, 1.0, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
    // Gun house on top of the shelf, then barrels out through the outboard face.
    B.add('core', 'dark', G.panelledSlab({ width: 14, height: 6.5, depth: 54, chamfer: 2.0, detail: D }),
      { pos: [s * FG_SPONSON_X, 13.0, 12] });
    for (const dz of full ? [-10, 30] : [12]) {
      B.add('core', 'greeble', G.pipeRun({
        length: 16, radius: 2.1, sides: 6, axis: 'x', detail: D,
      }), { pos: [s * (FG_SPONSON_X + 8), 5.0, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }

  // --- 3. dorsal: ONE blockhouse, mast, open truss aft ---------------------
  // ONE. The Bulwark has two, separated by a hole in the ship; that difference is
  // half of what tells the pair apart from the beam.
  B.add('core', 'hull', FG_BRIDGE.loft({ capBack: false }), { pos: [FG_BRIDGE_X, 0, 0] });
  if (full) {
    B.add('core', 'emissive', glowSlot(9.0, 2.0), { pos: [FG_BRIDGE_X, 26.0, 15.8] });
  }
  B.add('core', 'greeble', G.antennaMast({
    height: 22, radius: 1.6, tipRadius: 0.8, spars: full ? 2 : 1, sparSpan: 7, detail: D,
  }), { pos: [FG_BRIDGE_X, 30, -34] });
  if (full) {
    B.add('core', 'greeble', G.sensorDish({ radius: 5.0, depth: 2.2, sides: 8, stub: 2.5, detail: D }),
      { pos: [FG_BRIDGE_X, 54, -32], rot: [-0.5, 0, 0] });
  }
  // The deck plating over the WAIST simply is not there: frames where a hull would
  // be. Coalition ships are never finished, and the sheer already dips underneath.
  B.add('core', 'dark', G.hullRibs({
    count: full ? 4 : 2, spacing: 9, span: 30, height: 7, thickness: 2.4, taper: 0.85, detail: D,
  }), { pos: [0, 11, -70] });

  // --- 4. stern block, bells, radiator bank --------------------------------
  B.add('engine', 'hull', FG_ENGINE.loft({ capFront: false }));
  for (const x of [-12.5, 0, 12.5]) {
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 5.0, mouth: 7.4, length: 13, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [x, -1.5, -88] });
    B.add('engine', 'engineGlow', glowDisc(7.0, 8), { pos: [x, -1.5, -101.4], rot: [0, PI, 0] });
  }
  // Three fins to port, two to starboard, and no two the same size. The ship lost
  // one and the crew rebalanced by moving the survivors - a story a silhouette can
  // tell for free, and a repeated element the eye can count adds nothing after two.
  const fins = full
    ? [[-1, -95, 20, 26], [-1, -80, 15, 19], [-1, -66, 11, 13], [1, -88, 17, 22], [1, -72, 13, 16]]
    : [[-1, -90, 19, 25], [1, -76, 14, 17]];
  for (const [s, z, chord, span] of fins) {
    B.add('engine', 'plating', G.radiatorFin({
      chord, span, thickness: 1.6, sweep: -chord * 0.36, tipChord: chord * 0.64, detail: D,
    }), { pos: [s * 21, 12, z], rot: [0, 0, s * 0.30] });
  }

  // --- 5. field-repair vocabulary ------------------------------------------
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 96, height: 12, thickness: 2.2, plates: 1, gap: 12, chamfer: 2.4, detail: D,
      }), { pos: [s * 19.6, -3.0, -20] });
    }
    // Conduit trunk along the PORT flank only, where a fitter can reach it.
    B.add('core', 'greeble', G.pipeRun({
      length: 58, radius: 2.2, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-21.0, 7.0, -50] });
    // Ventral tow cradle: this navy salvages its own dead.
    B.add('core', 'dark', G.hullRibs({
      count: 3, spacing: 22, span: 26, height: 5, thickness: 3.0, taper: 0.9, detail: D,
    }), { pos: [0, -18, -6] });
  }

  // --- 6. running lights ---------------------------------------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(FG_HULL, -92, 88, s, { width: 2.0 }));

  return { buckets: B.list() };
}

// ===========================================================================
// MONITOR — "Sledge", 300 m.  A GUN WITH A RAFT UNDER IT.   *** NEW ***
// ===========================================================================

/**
 * The class exists because the fleet had nothing between a 210 m frigate and a
 * 480 m destroyer, and because every Coalition hull was a hull with weapons on it.
 * This one is a WEAPON WITH A HULL UNDER IT, and it is the only capital ship in
 * either navy whose largest single mass is its gun.
 *
 * The read, in the order the eye gets it:
 *   1. The hull is FLAT. 34 m of freeboard over 300 m of length - a ratio of 8.8:1
 *      against the Ardent's 5.6 and the Bulwark's 6.2 - so from the beam it is a
 *      plank, and the gun house standing on it is the only tall thing for a
 *      kilometre.
 *   2. The gun house is 46 m tall and the barrels are 190 m long, so 110 m of
 *      barrel hangs past the stem. The ship visibly cannot get out of its own way.
 *   3. The whole after half is an OPEN MACHINERY GALLERY: four bells on an exposed
 *      frame with sky between them and the deck, radiators cantilevered off it,
 *      and the conduit runs on the outside. The stern is a skeleton.
 */
const MN_HULL = new Lines([
  [-150, 22, 10, -12, 6.0, 3.5, 4.5, 0.84],
  [-118, 17, 7, -10, 4.5, 2.6, 3.4, 0.86],
  [-40, 30, 14, -15, 8.0, 4.4, 5.4, 0.80],
  [46, 38, 16, -18, 10.0, 5.0, 6.0, 0.78],
  [98, 30, 12, -20, 7.6, 4.0, 5.6, 0.92],
  [128, 19, 5, -21, 4.4, 2.6, 4.2, 1.10],
  [150, 7, -4, -14, 1.6, 1.4, 2.2, 1.00],
]);

const MN_GUN_Z = 42;
const MN_GUN_Y = 40;

function monitorParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', MN_HULL.loftPick([-118, 46, 128]));
    // The gun house and the barrels ARE the class, so they are what the far LOD
    // spends its triangles on.
    B.add('core', 'hull', G.panelledSlab({ width: 68, height: 44, depth: 92, detail: D }),
      { pos: [0, MN_GUN_Y, MN_GUN_Z] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.pipeRun({ length: 190, radius: 6.5, sides: 4, axis: 'z', detail: D }),
        { pos: [s * 15, MN_GUN_Y + 4, 70] });
    }
    // The open stern frame: two rails with the bells between them.
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.panelledSlab({ width: 10, height: 26, depth: 120, detail: D }),
        { pos: [s * 26, 6, -96] });
    }
    return { buckets: B.list() };
  }

  // --- 1. the raft ---------------------------------------------------------
  B.add('core', 'hull', full ? MN_HULL.loft({ capBack: false })
    : MN_HULL.loftPick([-118, 46, 98, 128], { capBack: false }));
  // Belt armour along both flanks, and it is the calm reserve: nothing else may go
  // on the midships flanks of this class.
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 168, height: 22, thickness: 3.4, plates: 2, gap: 20, chamfer: 4, detail: D,
      }), { pos: [s * 33, -2, -6] });
    }
  }

  // --- 2. THE GUN. Barbette, house, two 190 m barrels. ---------------------
  B.add('core', 'dark', G.pipeRun({ length: 18, radius: 30, sides: 8, axis: 'y', caps: false, detail: D }),
    { pos: [0, 12, MN_GUN_Z] });
  B.add('core', 'hull', G.panelledSlab({ width: 68, height: 44, depth: 92, chamfer: 10, detail: D }),
    { pos: [0, MN_GUN_Y, MN_GUN_Z] });
  // The mantlet: a stepped block on the front face, so the house is not one prism.
  B.add('core', 'plating', G.panelledSlab({ width: 52, height: 30, depth: 26, chamfer: 6, detail: D }),
    { pos: [0, MN_GUN_Y + 2, MN_GUN_Z + 56] });
  for (const s of [-1, 1]) {
    B.add('core', 'greeble', G.pipeRun({
      length: 190, radius: 6.5, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D,
    }), { pos: [s * 15, MN_GUN_Y + 4, 70] });
    B.add('core', 'dark', G.pipeRun({ length: 14, radius: 8.6, sides: 6, axis: 'z', caps: false, detail: D }),
      { pos: [s * 15, MN_GUN_Y + 4, 246] });
  }
  if (full) {
    // Recoil rails down the sides of the house, and the one stripe of paint.
    B.add('core', 'trim', G.panelledSlab({ width: 72, height: 2.2, depth: 8, detail: D }),
      { pos: [0, MN_GUN_Y + 24, MN_GUN_Z - 40] });
    for (const s of [-1, 1]) {
      B.add('core', 'greeble', G.hexStrut({ length: 64, radius: 3.0, axis: 'z', detail: D }),
        { pos: [s * 36, MN_GUN_Y - 8, MN_GUN_Z - 26] });
    }
  }

  // --- 3. the low deckhouse, right aft, offset to starboard ----------------
  B.add('core', 'hull', G.panelledSlab({ width: 30, height: 24, depth: 54, chamfer: 6, detail: D }),
    { pos: [5, 22, -104] });
  if (full) {
    B.add('core', 'emissive', glowSlot(20, 2.6), { pos: [5, 26, -76.6] });
  }
  B.add('core', 'greeble', G.antennaMast({
    height: 34, radius: 2.2, tipRadius: 1.0, spars: full ? 2 : 1, sparSpan: 11, detail: D,
  }), { pos: [5, 32, -124] });

  // --- 4. THE OPEN MACHINERY GALLERY. The stern is a skeleton. -------------
  // Two rails carry everything; the bells hang between them with sky above and
  // below. This is where the class earns its 6-12% negative space, and it is the
  // clearest statement of "external structure" anywhere in the navy.
  for (const s of [-1, 1]) {
    B.add('engine', 'hull', G.panelledSlab({ width: 10, height: 26, depth: 120, chamfer: 3, detail: D }),
      { pos: [s * 26, 6, -96] });
  }
  for (const [x, y] of full ? [[-13, 12], [13, 12], [-13, -8], [13, -8]] : [[-13, 4], [13, 4]]) {
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 6.5, mouth: 10, length: 20, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [x, y, -136] });
    B.add('engine', 'engineGlow', glowDisc(9.4, 8), { pos: [x, y, -157], rot: [0, PI, 0] });
  }
  if (full) {
    // Cross-braces between the rails, three of them, unevenly spaced.
    for (const z of [-58, -104, -142]) {
      B.add('engine', 'greeble', G.hexStrut({ length: 46, radius: 2.6, axis: 'x', detail: D }),
        { pos: [-23, 22, z] });
    }
    // Conduit trunk on the OUTSIDE of the port rail.
    B.add('engine', 'greeble', G.pipeRun({
      length: 118, radius: 3.4, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-33, 2, -152] });
  }
  // Radiators cantilevered off the gallery, two port one starboard, all different.
  for (const [s, z, chord, span] of full
    ? [[-1, -140, 26, 34], [-1, -112, 18, 23], [1, -126, 22, 28]]
    : [[-1, -130, 24, 31], [1, -110, 18, 22]]) {
    B.add('engine', 'plating', G.radiatorFin({
      chord, span, thickness: 2.2, sweep: -chord * 0.38, tipChord: chord * 0.62, rim: 2.4, detail: D,
    }), { pos: [s * 29, 18, z], rot: [0, 0, s * 0.34] });
  }

  // --- 5. running lights ---------------------------------------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(MN_HULL, -144, 132, s, { width: 2.6 }));

  return { buckets: B.list() };
}

// ===========================================================================
// DESTROYER — "Bulwark", 480 m. The salvage prize.
// ===========================================================================

const DD_FORE = new Lines([
  [40, 38, 26, -26, 10, 7, 8, 0.80],
  [96, 41, 29, -27, 11, 7, 8, 0.78],
  [160, 34, 22, -28, 9, 6, 8, 0.90],
  [200, 25, 14, -30, 6, 4, 7, 1.08],
  [240, 9, -6, -22, 2, 2, 3, 1.05],
]);

const DD_AFT = new Lines([
  [-200, 33, 22, -24, 9, 6, 7, 0.82],
  [-150, 40, 28, -28, 11, 7, 9, 0.78],
  [-90, 37, 25, -26, 10, 6, 8, 0.80],
  [-40, 34, 22, -24, 9, 6, 7, 0.84],
]);

/** Stern block, wider than either hull section. */
const DD_ENGINE = new Lines([
  [-250, 50, 32, -35, 13, 8, 10, 0.86],
  [-232, 53, 34, -37, 14, 9, 11, 0.86],
  [-196, 38, 25, -28, 10, 6, 8, 0.82],
]);

/** Forward citadel: three stepped decks, offset 5 m to port. */
const DD_CITADEL = new Lines([
  [46, 18, 74, 24, 4, 4, 4],
  [80, 20, 78, 24, 5, 5, 4],
  [112, 16, 58, 24, 4, 4, 4],
  [128, 9, 44, 26, 3, 3, 3],
]);
const DD_CITADEL_X = -5;

/**
 * Turret stations. One forward of the citadel, one on the aft deck firing FORWARD
 * across the open waist - which is the shot that tells you the hole is really
 * there, because you can see the barrels through it.
 */
const DD_TURRETS = [168, -62];

/**
 * THE WAIST, and it is the whole class.
 *
 * The hull's two SIDE WALLS carry straight through from the forward section to the
 * aft one; everything between them is missing. So in plan there are two 15 m slots
 * with a reactor drum sitting in the middle of them, and in profile the top of the
 * ship drops 18 m for eighty metres and then climbs again.
 *
 * The keels are at the hull's own half-beam on purpose: they read as the ship's
 * sides continuing, not as two beams someone added. A destroyer with a hole through
 * it is a destroyer that has been opened for you.
 */
const DD_WAIST = { z0: -40, z1: 40, keelX: 33.5, keelY: -14, keelW: 9, keelH: 28 };
const DD_REACTOR_Z = 0;

/** A dorsal turret: barbette, house, two barrels. The one gun shape this navy has. */
function dorsalTurret(B, x, y, z, D, full) {
  B.add('core', 'dark', G.mountPad({ radius: 15, height: 4, sides: 8, detail: D }), { pos: [x, y, z] });
  if (full) {
    B.add('core', 'trim', G.dockingCollar({ radius: 12, innerRadius: 8, depth: 2.5, sides: 8, detail: D }),
      { pos: [x, y + 4, z], rot: [-HALF_PI, 0, 0] });
  }
  B.add('core', 'plating', G.panelledSlab({ width: 24, height: 12, depth: 26, chamfer: 4, detail: D }),
    { pos: [x, y + 11, z - 2] });
  for (const s of [-1, 1]) {
    B.add('core', 'greeble', G.pipeRun({
      length: 26, radius: 2.6, sides: 6, axis: 'z', detail: D,
    }), { pos: [x + s * 5.5, y + 11, z + 11] });
  }
}

function destroyerParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', DD_FORE.loftPick([96, 200]));
    B.add('core', 'hull', DD_AFT.loftPick([-150]));
    B.add('core', 'hull', DD_ENGINE.loft({ capFront: false }, 2));
    B.add('core', 'hull', G.panelledSlab({ width: 36, height: 46, depth: 120, detail: D }),
      { pos: [DD_CITADEL_X, 42, 82] });
    B.add('core', 'hull', G.taperedWedge({
      length: 92, width0: 30, height0: 30, width1: 15, height1: 16, shear: -13, detail: D,
    }), { pos: [0, -30, 140] });
    // The waist keels: the hole through the middle survives to the far LOD,
    // because that hole IS the class.
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.panelledSlab({
        width: DD_WAIST.keelW, height: DD_WAIST.keelH, depth: 92, detail: D,
      }), { pos: [s * DD_WAIST.keelX, DD_WAIST.keelY, 0] });
    }
    B.add('core', 'hull', G.pipeRun({ length: 70, radius: 15, sides: 6, axis: 'z', detail: D }),
      { pos: [0, -6, -35] });
    // The gantry beam over the waist. The hole and the thing bridging it are the
    // class, so both survive to the far LOD.
    B.add('core', 'hull', G.panelledSlab({ width: 13, height: 7, depth: 108, detail: D }),
      { pos: [0, 77, 0] });
    B.add('core', 'hull', G.panelledSlab({ width: 30, height: 26, depth: 78, detail: D }),
      { pos: [DD_CITADEL_X, 34, -128] });
    return { buckets: B.list() };
  }

  // --- 1. forward citadel section ------------------------------------------
  B.add('core', 'hull', full ? DD_FORE.loft({ capBack: false })
    : DD_FORE.loftPick([96, 160, 200], { capBack: false }));
  // THE CHIN. A ventral armour ram that hangs 28 m below the keel forward of the
  // citadel. From the beam this class is otherwise a long low hull with two
  // deckhouses, which is a frigate with more of everything; the hook under the bow
  // is the one line that cannot be mistaken for the Ardent at any distance.
  B.add('core', 'plating', G.taperedWedge({
    length: 92, width0: 30, height0: 30, width1: 15, height1: 16, shear: -13, chamfer: 5, detail: D,
  }), { pos: [0, -30, 140] });
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 3.0, height: 3.0, depth: 30, detail: D }),
        { pos: [s * 16, 6, 196], rot: [0, s * 0.14, 0.14] });
    }
  }

  B.add('core', 'hull', DD_CITADEL.loft({ capBack: false }), { pos: [DD_CITADEL_X, 0, 0] });
  if (full) {
    B.add('core', 'emissive', glowSlot(22, 3.0), { pos: [DD_CITADEL_X, 56, 126] });
  }
  B.add('core', 'greeble', G.antennaMast({
    height: 40, radius: 3.0, tipRadius: 1.4, spars: full ? 3 : 1, sparSpan: 13, detail: D,
  }), { pos: [DD_CITADEL_X, 74, 66] });
  if (full) {
    B.add('core', 'greeble', G.sensorDish({ radius: 10, depth: 4.5, sides: 10, stub: 5, detail: D }),
      { pos: [DD_CITADEL_X, 116, 70], rot: [-0.5, 0, 0] });
  }

  // --- 2. THE WAIST. Two side walls, a hole, and a reactor sitting in it. --
  for (const s of [-1, 1]) {
    B.add('core', 'hull', G.panelledSlab({
      width: DD_WAIST.keelW, height: DD_WAIST.keelH, depth: 96, chamfer: 3, detail: D,
    }), { pos: [s * DD_WAIST.keelX, DD_WAIST.keelY, 0] });
  }
  // Four thin transverse frames across the top of the hole. They tell the eye it
  // is looking INTO a structure; any more of them and the hole closes up again.
  B.add('core', 'dark', G.hullRibs({
    count: full ? 4 : 2, spacing: 24, span: 64, height: 5, thickness: 4, taper: 0.92, detail: D,
  }), { pos: [0, -2, 0] });

  // THE GANTRY. A portal frame straight over the open waist: two legs off the
  // citadel and aft-deck shoulders, a box beam across the top, and two diagonals.
  //
  // This is the committed structural difference between the Ardent and the Bulwark,
  // and it exists because "long low hull, tall deckhouse, lattice mast, engine block
  // with swept fins" described BOTH classes and the pair was the weakest on the
  // silhouette sheet. A frigate is a hull with things on it. This is a hull with a
  // hole through it and a bridge built over the hole - there is a rectangle of empty
  // space in the middle of the profile that nothing else in the game produces, and
  // it survives to any distance at which the ship is more than a few pixels.
  {
    const GY = 30, GTOP = 74, GZ = 47;
    for (const s of [-1, 1]) {
      B.add('core', 'dark', G.hexStrut({
        length: GTOP - GY, radius: 4.5, axis: 'y', caps: false, detail: D,
      }), { pos: [0, GY, s * GZ] });
    }
    B.add('core', 'dark', G.panelledSlab({ width: 13, height: 7, depth: GZ * 2 + 14, detail: D }),
      { pos: [0, GTOP + 3, 0] });
    if (full) {
      // Diagonals into the frame corners: a portal with no bracing is a shape, a
      // portal with bracing is a structure.
      for (const s of [-1, 1]) {
        const dy = GTOP - GY - 8, dz = s * (GZ - 6);
        B.add('core', 'dark', G.hexStrut({
          length: Math.hypot(dy, dz), radius: 3.0, axis: 'z', caps: false, detail: D,
        }), { pos: [0, GY + 4, s * 6], rot: [Math.atan2(-dy, dz), 0, 0] });
      }
    }
  }

  // The reactor. A drum you can see, aim at, and lose the whole prize with.
  B.add('core', 'greeble', G.pipeRun({
    length: 66, radius: 15, sides: 8, axis: 'z', flanges: full ? 2 : 0, detail: D,
  }), { pos: [0, -6, DD_REACTOR_Z - 33] });
  B.add('core', 'emissive', G.pipeRun({
    length: 5, radius: 16.4, sides: 8, axis: 'z', caps: false, detail: D,
  }), { pos: [0, -6, DD_REACTOR_Z - 2.5] });
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'greeble', G.cappedConduit({ length: 14, radius: 3.4, sides: 6, axis: 'x', detail: D }),
        { pos: [s * 15, -6, DD_REACTOR_Z - 24], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }

  // --- 3. aft hull, aft deckhouse, RECESSED casemates, hangar --------------
  B.add('core', 'hull', full ? DD_AFT.loft({ capFront: false, capBack: false })
    : DD_AFT.loftPick([-150, -90], { capFront: false, capBack: false }));
  // A SECOND deckhouse. One blockhouse is a frigate; two, separated by a hole in
  // the ship, is a destroyer, and that is true from four kilometres out.
  B.add('core', 'hull', G.panelledSlab({ width: 30, height: 26, depth: 78, chamfer: 6, detail: D }),
    { pos: [DD_CITADEL_X, 34, -128] });
  if (full) {
    B.add('core', 'dark', G.panelledSlab({ width: 20, height: 10, depth: 40, chamfer: 3, detail: D }),
      { pos: [DD_CITADEL_X, 50, -140] });
  }

  // Two turrets. The forward one sits ahead of the citadel; the aft one sits on
  // the aft deck and fires forward THROUGH the waist, so the hole in the ship is
  // something the guns visibly use rather than a hole for its own sake.
  dorsalTurret(B, DD_CITADEL_X, 22, DD_TURRETS[0], D, full);
  dorsalTurret(B, DD_CITADEL_X, 23, DD_TURRETS[1], D, full);

  // THE BROADSIDE IS RECESSED, NOT BOXED.
  //
  // It used to be two 15 x 15 x 74 m boxes standing off the flanks, which put a
  // pair of wings on the plan outline at exactly the place the Ardent has its
  // sponsons - so both classes read as a cross from above and the pair collapsed.
  // The guns now live in a cut-in casemate flush with the flank: the plan outline
  // stays a clean bar with a hole in the middle, which is the class, and the
  // recess is deeper than 8 m so the greeble inside it self-shadows (§3).
  for (const s of [-1, 1]) {
    B.add('core', 'dark', G.recess({ width: 74, height: 17, depth: 11, wall: 3.5, detail: D }),
      { pos: [s * 34, 3, -128], rot: [0, s * HALF_PI, 0] });
    for (const dz of full ? [-156, -128, -100] : [-128]) {
      B.add('core', 'greeble', G.pipeRun({
        length: 15, radius: 2.6, sides: 6, axis: 'x', detail: D,
      }), { pos: [s * 36, 3, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }
  // Hangar: a real opening in the ventral aft hull, with frames inside it.
  B.add('core', 'dark', G.blastDoor({ width: 44, height: 26, depth: 4, detail: D }),
    { pos: [0, -26, -110], rot: [HALF_PI, 0, 0] });
  if (full) {
    B.add('core', 'greeble', G.hullRibs({
      count: 3, spacing: 14, span: 40, height: 4, thickness: 3, taper: 0.9, detail: D,
    }), { pos: [0, -22, -110] });
    B.add('core', 'trim', G.panelledSlab({ width: 50, height: 1.6, depth: 3, detail: D }),
      { pos: [0, -27, -84] });
  }

  // --- 4. stern block ------------------------------------------------------
  B.add('engine', 'hull', DD_ENGINE.loft({ capFront: false }));
  for (const s of [-1, 1]) {
    for (const y of [14, -14]) {
      B.add('engine', 'greeble', G.thrusterBell({
        throat: 9, mouth: 13.5, length: 24, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
      }), { pos: [s * 20, y, -216] });
      B.add('engine', 'engineGlow', glowDisc(13, 8), { pos: [s * 20, y, -240.6], rot: [0, PI, 0] });
    }
  }
  // Root chord sits on the block, tip trails aft; the aft-most fin tip lands
  // exactly on z = -240 so the class measures its declared 480 m and not 484.
  const fins = full
    ? [[-1, -228, 36, 50], [-1, -206, 26, 34], [-1, -186, 18, 23], [1, -220, 31, 42], [1, -194, 22, 28]]
    : [[-1, -216, 34, 46], [1, -200, 24, 31]];
  for (const [s, z, chord, span] of fins) {
    B.add('engine', 'plating', G.radiatorFin({
      chord, span, thickness: 3, sweep: -chord * 0.36, tipChord: chord * 0.64, rim: 3.4, detail: D,
    }), { pos: [s * 38, 26, z], rot: [0, 0, s * 0.3] });
  }

  // --- 5. field-repair vocabulary ------------------------------------------
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 150, height: 26, thickness: 4, plates: 2, gap: 22, chamfer: 5, detail: D,
      }), { pos: [s * 39, -4, 122] });
    }
    B.add('core', 'greeble', G.pipeRun({
      length: 120, radius: 4.0, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-38, 14, -178] });
  }

  // --- 6. running lights: two runs, because the waist breaks the chine -----
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(DD_FORE, 46, 220, s, { width: 3.2 }));
    B.add('core', 'runningLights', chineStrip(DD_AFT, -196, -44, s, { width: 3.2 }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// CARRIER — "Anvil", 900 m.  THE CANYON.       *** NEW ***
// ===========================================================================

/**
 * The fleet had no carrier, and a navy without one is a skirmish force. It also had
 * nothing at 900 m, so the size ladder went 480 -> 1400 with nothing in between.
 *
 * THE CLASS READ IS A HOLE 560 METRES LONG.
 *
 * Two separate side hulls, 166 m apart, joined by a flight deck underneath and by
 * exactly TWO transverse bridges over the top. Everything between them is open sky:
 * the slot is open at the bow, open at the stern, and open upward for 400 of its
 * 560 m. Strike craft fly IN at the stern and OUT at the bow, and from the beam you
 * can see straight through the middle of a 900 m ship.
 *
 * Nothing else in either navy has negative space at that scale. The Bulwark's waist
 * is 80 m on a 480 m hull (17%); this is 560 on 900 (62%), and it is open on three
 * faces rather than two. At the thirty-pixel read the Anvil is a rectangle with a
 * slot in it and the Bulwark is a bar with a notch, and the size difference makes
 * the rest.
 *
 * Coalition to the last rivet: the engines are not in the hull, they are two
 * TOWERS standing 90 m outboard on lattice pylons with sky all round them, and the
 * flight deck's landing lights and catapult rails are on the outside of everything.
 */
const CR_SIDE = new Lines([
  [-450, 34, 44, -46, 9.0, 6, 7, 0.84],
  [-330, 30, 46, -44, 8.0, 6, 7, 0.84],
  [-300, 22, 36, -34, 6.0, 4, 5, 0.88],
  [-120, 33, 48, -44, 9.0, 6, 7, 0.80],
  [90, 37, 50, -46, 10.0, 6, 7, 0.78],
  [250, 31, 42, -48, 8.0, 5, 7, 0.90],
  [350, 22, 28, -50, 5.0, 4, 6, 1.10],
  [450, 7, -10, -30, 1.6, 2, 3, 1.00],
]);
/** Centreline of each side hull. Inner faces are 166 m apart: that is the canyon. */
const CR_SIDE_X = 117;
const CR_SLOT = { z0: -320, z1: 240, halfW: 83 };

function carrierParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  const sideLoft = (opts) => (full ? CR_SIDE.loft(opts)
    : CR_SIDE.loftPick([-300, 90, 250, 350], opts));

  if (lod >= 2) {
    for (const s of [-1, 1]) {
      B.add('core', 'hull', CR_SIDE.loftPick([-300, 90, 350]), { pos: [s * CR_SIDE_X, 0, 0] });
      // Engine tower, outboard: the second-largest mass and the aft read.
      B.add('core', 'hull', G.panelledSlab({ width: 46, height: 150, depth: 170, detail: D }),
        { pos: [s * 212, 30, -330] });
    }
    // The flight deck floor. It is what makes the slot a canyon and not a gap
    // between two ships, so it survives to the far LOD with the slot.
    B.add('core', 'hull', G.panelledSlab({ width: 250, height: 26, depth: 420, detail: D }),
      { pos: [0, -44, 40] });
    // Island, port side, tall.
    B.add('core', 'hull', G.panelledSlab({ width: 44, height: 130, depth: 190, detail: D }),
      { pos: [-124, 110, -100] });
    // The two bridges over the canyon: without them the ship reads as a catamaran.
    for (const z of [-300, 210]) {
      B.add('core', 'hull', G.panelledSlab({ width: 190, height: 22, depth: 54, detail: D }),
        { pos: [0, 46, z] });
    }
    return { buckets: B.list() };
  }

  // --- 1. the two side hulls -----------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'hull', sideLoft({ capBack: false }), { pos: [s * CR_SIDE_X, 0, 0] });
    if (full) {
      // Slab armour, outboard face only. The inner faces are the canyon walls and
      // they are CALM RESERVE: nothing goes on them, because everything the player
      // sees through the slot is read against them.
      B.add('core', 'plating', G.armourBelt({
        length: 420, height: 56, thickness: 9, plates: 3, gap: 44, chamfer: 8, detail: D,
      }), { pos: [s * 155, 2, -40] });
    }
  }

  // --- 2. THE FLIGHT DECK, i.e. the canyon floor ---------------------------
  //
  // IT STOPS AT z = -170. The first pass ran the deck the whole length of the slot,
  // and a canyon with a floor in it is a trench, not a hole: from directly above the
  // plan silhouette closed up solid and nothing could be seen through the ship from
  // any angle. The aft 150 m of the slot has NO FLOOR, so there is a genuine
  // 150 x 166 m through-hole - open to the sky, open to the keel and open astern -
  // and strike craft recover up through it. That hole is the class read and it is
  // the only thing on this ship that a 30 px silhouette will keep.
  B.add('core', 'hull', G.panelledSlab({ width: 250, height: 26, depth: 420, chamfer: 12, detail: D }),
    { pos: [0, -44, 40] });
  // Two transverse deck beams under the open section, so the hole is framed rather
  // than being a place where the model ran out. The gap between them is 96 m.
  for (const z of [-190, -300]) {
    B.add('core', 'plating', G.panelledSlab({ width: 236, height: 20, depth: 34, chamfer: 6, detail: D }),
      { pos: [0, -44, z] });
  }
  // Catapult rails: two, unequal, and offset from the centreline so the deck is
  // not bilaterally symmetric.
  if (full) {
    for (const [x, z, len] of [[-40, 60, 360], [46, 96, 280]]) {
      B.add('core', 'trim', G.panelledSlab({ width: 7, height: 2.4, depth: len, detail: D }),
        { pos: [x, -30, z] });
    }
  }
  // The two bridges across the top of the slot. TWO, at unequal z, so the canyon
  // has three bays of different lengths (220 / 456 / 84 m) rather than a rhythm.
  for (const z of [-300, 210]) {
    B.add('core', 'hull', G.panelledSlab({ width: 190, height: 22, depth: 54, chamfer: 8, detail: D }),
      { pos: [0, 46, z] });
  }
  if (full) {
    // Deck framing visible in the canyon walls: this is a recess deeper than 8 m,
    // which is the only place greeble is allowed on this hull (§3, justification 2).
    for (const s of [-1, 1]) {
      B.add('core', 'greeble', G.hullRibs({
        count: 3, spacing: 130, span: 60, height: 9, thickness: 7, taper: 0.9, detail: D,
      }), { pos: [s * 78, -10, 20], rot: [0, 0, HALF_PI] });
    }
    // Deck lighting down both canyon walls: the scale cue INSIDE the hole.
    for (const s of [-1, 1]) {
      B.add('core', 'engineGlow', glowSlot(420, 5),
        { pos: [s * 80, -22, 40], rot: [0, s * HALF_PI, 0] });
    }
  }

  // --- 3. the island, PORT side only ---------------------------------------
  B.add('core', 'hull', G.panelledSlab({ width: 44, height: 130, depth: 190, chamfer: 12, detail: D }),
    { pos: [-124, 110, -100] });
  B.add('core', 'plating', G.panelledSlab({ width: 30, height: 40, depth: 90, chamfer: 8, detail: D }),
    { pos: [-124, 190, -140] });
  if (full) {
    B.add('core', 'emissive', glowSlot(70, 5), { pos: [-147, 150, -70], rot: [0, -HALF_PI, 0] });
    B.add('core', 'emissive', glowSlot(70, 5), { pos: [-147, 132, -70], rot: [0, -HALF_PI, 0] });
  }
  B.add('core', 'greeble', G.antennaMast({
    height: 96, radius: 5.0, tipRadius: 2.2, spars: full ? 3 : 1, sparSpan: 24, detail: D,
  }), { pos: [-124, 212, -60] });
  if (full) {
    B.add('core', 'greeble', G.sensorDish({ radius: 22, depth: 9, sides: 10, stub: 9, detail: D }),
      { pos: [-124, 300, -50], rot: [-0.5, 0, 0] });
  }

  // --- 4. THE ENGINE TOWERS, standing off on lattice pylons ----------------
  // Coalition to the last rivet: the drives are not in the hull. Each tower hangs
  // 95 m outboard on two hex pylons with open sky above, below and between them,
  // and each carries three bells in a vertical column. From astern the ship is two
  // towers of three circles with a 400 m gap in the middle.
  for (const s of [-1, 1]) {
    for (const y of [70, -40]) {
      B.add('engine', 'greeble', G.hexStrut({ length: 62, radius: 9, axis: 'x', detail: D }),
        { pos: [s * 150, y, -330], rot: [0, s > 0 ? 0 : PI, 0] });
    }
    B.add('engine', 'hull', G.panelledSlab({ width: 46, height: 150, depth: 170, chamfer: 14, detail: D }),
      { pos: [s * 212, 30, -330] });
    for (const y of full ? [88, 30, -28] : [58, -12]) {
      B.add('engine', 'greeble', G.thrusterBell({
        throat: 14, mouth: 21, length: 40, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
      }), { pos: [s * 212, y, -408] });
      B.add('engine', 'engineGlow', glowDisc(20, 8), { pos: [s * 212, y, -446], rot: [0, PI, 0] });
    }
    if (full) {
      // Fuel trunk from the tower back into the hull, on the OUTSIDE.
      B.add('engine', 'greeble', G.pipeRun({
        length: 210, radius: 8, sides: 6, axis: 'z', flanges: 2, detail: D,
      }), { pos: [s * 196, 104, -340] });
    }
  }
  // Radiators cantilevered off the towers, three port and two starboard, none the
  // same size. Two towers of matched fins would be a machine; this is a navy.
  for (const [s, y, z, chord, span] of full
    ? [[-1, 100, -390, 60, 96], [-1, 40, -360, 44, 66], [-1, -30, -380, 32, 44], [1, 80, -378, 52, 78], [1, 10, -356, 38, 56]]
    : [[-1, 70, -380, 56, 88], [1, 40, -366, 44, 64]]) {
    B.add('engine', 'plating', G.radiatorFin({
      chord, span, thickness: 5, sweep: -chord * 0.38, tipChord: chord * 0.62, rim: 5, detail: D,
    }), { pos: [s * 236, y, z], rot: [0, 0, s * 0.42] });
  }

  // --- 5. defensive fit: recessed, because there is no room for boxes ------
  for (const s of [-1, 1]) {
    for (const dz of full ? [180, -40, -250] : [-40]) {
      B.add('core', 'dark', G.recess({ width: 58, height: 22, depth: 14, wall: 5, detail: D }),
        { pos: [s * 150, 14, dz], rot: [0, s * HALF_PI, 0] });
      B.add('core', 'greeble', G.pipeRun({ length: 22, radius: 3.4, sides: 6, axis: 'x', detail: D }),
        { pos: [s * 152, 14, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }
  // Bow. Each side hull ends in its own chisel, so the forward view is a two-pronged
  // fork with the canyon mouth between the prongs. Painted, because this navy paints
  // exactly one thing.
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 4, height: 4, depth: 64, detail: D }),
        { pos: [s * (CR_SIDE_X + 12), 6, 400], rot: [0, s * 0.12, 0.16] });
    }
  }

  // --- 6. running lights: both outboard chines -----------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', G.place(chineStrip(CR_SIDE, -440, 430, s, { width: 5.0 }),
      { pos: [s * CR_SIDE_X, 0, 0] }));
  }

  return { buckets: B.list() };
}

// ===========================================================================
// STRIKE CRAFT — "Bolt", 18 m, under 150 triangles
// ===========================================================================

function strikeCraftParts() {
  const D = G.DETAIL.MID;   // one LOD; MID keeps the chamfers and drops the plates
  const B = new Buckets();

  // Fuselage: a box with a DROOPED chisel nose and a stub fin, so the profile is
  // not a bar. At 18 m the silhouette is all there is.
  B.add('core', 'hull', G.taperedWedge({
    length: 11, width0: 3.4, height0: 2.6, width1: 1.6, height1: 1.4, shear: -0.8, chamfer: 0.5, detail: D,
  }), { pos: [0, 0, -2] });
  B.add('core', 'hull', G.panelledSlab({ width: 3.6, height: 2.8, depth: 7, chamfer: 0.8, detail: D }),
    { pos: [0, 0, -5.5] });
  // THE FIN, and it is the class read. A 5.2 m single tail on a 2.8 m deep body:
  // taller than the fuselage it stands on, which is a thing no Concord hull does at
  // any size. Bolt / Whipcord / Shrike used to be three flat deltas separated only
  // by wing sweep and were genuinely unidentifiable on the silhouette sheet; the
  // three now differ in topology - solid body with a tall fin, hole in the tail,
  // forked nose - so each survives to three pixels.
  B.add('core', 'dark', G.radiatorFin({
    chord: 5.4, span: 5.2, thickness: 0.4, sweep: -1.6, tipChord: 2.4, detail: D,
  }), { pos: [0, 1.3, -7.4] });
  // Canopy, forward and offset - a Coalition pilot sits where the armour is thinnest.
  B.add('core', 'emissive', glowSlot(2.2, 0.7), { pos: [0, 2.2, 3.2], rot: [-0.6, 0, 0] });
  // Two engine pods slung outboard on stubs. Same idea as the corvette, one size down.
  for (const s of [-1, 1]) {
    B.add('core', 'dark', G.panelledSlab({ width: 1.4, height: 1.4, depth: 6.0, detail: D }),
      { pos: [s * 3.2, -0.3, -5.0] });
    B.add('core', 'greeble', G.hexStrut({ length: 1.6, radius: 0.7, axis: 'x', detail: G.DETAIL.FAR }),
      { pos: [s * 1.8, -0.3, -5.0], rot: [0, s > 0 ? 0 : PI, 0] });
    B.add('core', 'engineGlow', glowDisc(1.1, 6), { pos: [s * 3.2, -0.3, -8.1], rot: [0, PI, 0] });
    // Cannon under the nose.
    B.add('core', 'greeble', G.pipeRun({
      length: 4.0, radius: 0.32, sides: 4, axis: 'z', detail: G.DETAIL.FAR,
    }), { pos: [s * 1.1, -1.5, 3.0] });
  }
  return { buckets: B.list() };
}

// ===========================================================================
// Class definitions
// ===========================================================================

export const COALITION_SHIPS = [
  shipClass({
    id: 'coalition_corvette',
    name: 'Lancet',
    faction: 'coalition',
    role: 'corvette',
    length: HULL_LENGTH.corvette,
    mass: 3200, maxSpeed: 236, accel: 24, turnRate: 0.58,
    hullHP: 950, triBudget: 500,
    partsFor: corvetteParts,
    levels: 2,
    subsystems: [
      { id: 'gun', kind: 'weapon', hp: 170, position: [1.6, 9.0, 14], radius: 11, salvageValue: 0.30, label: 'Bow Gun' },
      { id: 'reactor', kind: 'reactor', hp: 210, position: [0, -2, -8], radius: 9, salvageValue: 0.32, label: 'Core' },
      { id: 'engine_port', kind: 'engine', hp: 120, position: [-12.6, -1, -36], radius: 8, salvageValue: 0.10, label: 'Port Pod' },
      { id: 'engine_stbd', kind: 'engine', hp: 120, position: [12.6, -1, -36], radius: 8, salvageValue: 0.10, label: 'Starboard Pod' },
    ],
    weapons: [
      weapon('cv_gun', 'Bow Autocannon', 'cannon', {
        mount: [1.6, 9.4, 44], yawCentre: 0, yawWidth: PI * 0.42,
        range: RANGE.cannon * 0.72, damage: 27, shotsPerBurst: 5, burstInterval: 0.11,
        cooldown: 2.2, projectileSpeed: 1700, tracking: 1.1,
      }),
      weapon('cv_pd', 'Point Defence', 'pd', {
        mount: [-7.8, 7.2, 4], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 9, shotsPerBurst: 4, burstInterval: 0.06,
        cooldown: 0.9, projectileSpeed: 2400, tracking: 3.2,
      }),
    ],
  }),

  shipClass({
    id: 'coalition_frigate',
    name: 'Ardent',
    faction: 'coalition',
    role: 'frigate',
    length: HULL_LENGTH.frigate,
    mass: 23000, maxSpeed: 152, accel: 9.2, turnRate: 0.19,
    hullHP: 3600, triBudget: 900,
    partsFor: frigateParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 740, position: [0, -2, -22], radius: 17, salvageValue: 0.36, label: 'Reactor' },
      { id: 'port_battery', kind: 'weapon', hp: 430, position: [-40, 6, 12], radius: 24, salvageValue: 0.30, label: 'Port Sponson' },
      { id: 'stbd_battery', kind: 'weapon', hp: 430, position: [40, 6, 12], radius: 24, salvageValue: 0.30, label: 'Starboard Sponson' },
      { id: 'engine', kind: 'engine', hp: 640, position: [0, -1.5, -95], radius: 26, salvageValue: 0.18, label: 'Main Drive' },
      { id: 'sensor', kind: 'sensor', hp: 250, position: [-3.5, 42, -34], radius: 14, salvageValue: 0.10, label: 'Sensor Mast' },
    ],
    weapons: [
      weapon('fg_port', 'Port Mass Driver Bank', 'cannon', {
        mount: [-48, 5, 12], yawCentre: PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_stbd', 'Starboard Mass Driver Bank', 'cannon', {
        mount: [48, 5, 12], yawCentre: -PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_pd', 'Point Defence', 'pd', {
        mount: [-3.5, 32, -4], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 8, shotsPerBurst: 4, burstInterval: 0.07,
        cooldown: 1.1, projectileSpeed: 2400, tracking: 3.0,
      }),
    ],
  }),

  shipClass({
    id: 'coalition_monitor',
    name: 'Sledge',
    faction: 'coalition',
    role: 'monitor',
    length: COALITION_LENGTH.monitor,
    mass: 46000, maxSpeed: 96, accel: 4.4, turnRate: 0.085,
    hullHP: 6400, triBudget: 1200,
    partsFor: monitorParts,
    subsystems: [
      { id: 'gun', kind: 'weapon', hp: 1600, position: [0, MN_GUN_Y, MN_GUN_Z], radius: 46, salvageValue: 0.42, label: 'Siege Mount' },
      { id: 'reactor', kind: 'reactor', hp: 1100, position: [0, -2, -50], radius: 22, salvageValue: 0.28, label: 'Reactor' },
      { id: 'engine', kind: 'engine', hp: 820, position: [0, 4, -130], radius: 34, salvageValue: 0.16, label: 'Drive Gallery' },
      { id: 'sensor', kind: 'sensor', hp: 300, position: [5, 50, -124], radius: 16, salvageValue: 0.10, label: 'Mast' },
    ],
    weapons: [
      weapon('mn_siege', 'Siege Mortar', 'cannon', {
        mount: [0, MN_GUN_Y + 4, 250], yawCentre: 0, yawWidth: PI * 0.32,
        range: RANGE.cannon * 1.5, damage: 340, shotsPerBurst: 2, burstInterval: 0.8,
        cooldown: 9.0, projectileSpeed: 900, tracking: 0.10, subsystemAccuracy: 0.30,
      }),
      weapon('mn_pd', 'Point Defence', 'pd', {
        mount: [5, 36, -104], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 10, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.85, projectileSpeed: 2400, tracking: 3.0,
      }),
    ],
  }),

  shipClass({
    id: 'coalition_destroyer',
    name: 'Bulwark',
    faction: 'coalition',
    role: 'destroyer',
    length: HULL_LENGTH.destroyer,
    mass: 98000, maxSpeed: 124, accel: 6.2, turnRate: 0.11,
    hullHP: 9800, triBudget: 1600,
    partsFor: destroyerParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 2000, position: [0, -6, 0], radius: 22, salvageValue: 0.40, label: 'Reactor Drum' },
      { id: 'turret_fwd', kind: 'weapon', hp: 720, position: [-5, 33, 166], radius: 19, salvageValue: 0.14, label: 'Forward Turret' },
      { id: 'turret_aft', kind: 'weapon', hp: 720, position: [-5, 34, -64], radius: 19, salvageValue: 0.14, label: 'Aft Turret' },
      { id: 'port_battery', kind: 'weapon', hp: 1000, position: [-34, 3, -128], radius: 38, salvageValue: 0.16, label: 'Port Casemate' },
      { id: 'stbd_battery', kind: 'weapon', hp: 1000, position: [34, 3, -128], radius: 38, salvageValue: 0.16, label: 'Starboard Casemate' },
      { id: 'engine', kind: 'engine', hp: 1560, position: [0, 0, -222], radius: 46, salvageValue: 0.18, label: 'Main Drive' },
      { id: 'hangar', kind: 'hangar', hp: 820, position: [0, -24, -110], radius: 26, salvageValue: 0.12, label: 'Hangar Deck' },
      { id: 'sensor', kind: 'sensor', hp: 540, position: [-5, 92, 76], radius: 22, salvageValue: 0.10, label: 'Sensor Mast' },
    ],
    weapons: [
      weapon('dd_t1', 'Forward Turret', 'cannon', {
        mount: [-5, 33, 190], yawCentre: 0, yawWidth: PI * 1.15,
        range: RANGE.cannon * 1.1, damage: 78, shotsPerBurst: 2, cooldown: 4.2,
        projectileSpeed: 1300, tracking: 0.42,
      }),
      weapon('dd_t2', 'Aft Turret', 'cannon', {
        mount: [-5, 34, -40], yawCentre: 0, yawWidth: PI * 1.15,
        range: RANGE.cannon * 1.1, damage: 78, shotsPerBurst: 2, cooldown: 4.2,
        projectileSpeed: 1300, tracking: 0.42,
      }),
      weapon('dd_port', 'Port Heavy Battery', 'cannon', {
        mount: [-38, 3, -128], yawCentre: PI * 0.5, yawWidth: PI * 0.545,
        range: RANGE.cannon * 1.15, damage: 92, shotsPerBurst: 3, cooldown: 4.6,
        projectileSpeed: 1250, tracking: 0.38,
      }),
      weapon('dd_stbd', 'Starboard Heavy Battery', 'cannon', {
        mount: [38, 3, -128], yawCentre: -PI * 0.5, yawWidth: PI * 0.545,
        range: RANGE.cannon * 1.15, damage: 92, shotsPerBurst: 3, cooldown: 4.6,
        projectileSpeed: 1250, tracking: 0.38,
      }),
      weapon('dd_pd', 'Point Defence', 'pd', {
        mount: [-5, 80, 80], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 10, shotsPerBurst: 5, burstInterval: 0.06,
        cooldown: 0.85, projectileSpeed: 2400, tracking: 3.0,
      }),
    ],
  }),

  shipClass({
    id: 'coalition_carrier',
    name: 'Anvil',
    faction: 'coalition',
    role: 'carrier',
    length: COALITION_LENGTH.carrier,
    mass: 320000, maxSpeed: 88, accel: 3.1, turnRate: 0.055,
    hullHP: 22000, triBudget: 1800,
    partsFor: carrierParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 4200, position: [0, -30, -160], radius: 60, salvageValue: 0.26, label: 'Reactor Room' },
      { id: 'flight_deck', kind: 'hangar', hp: 3600, position: [0, -30, -60], radius: 180, salvageValue: 0.28, label: 'Flight Deck' },
      { id: 'island', kind: 'sensor', hp: 1400, position: [-124, 150, -100], radius: 70, salvageValue: 0.12, label: 'Island' },
      { id: 'engine_port', kind: 'engine', hp: 2400, position: [-212, 30, -360], radius: 90, salvageValue: 0.14, label: 'Port Drive Tower' },
      { id: 'engine_stbd', kind: 'engine', hp: 2400, position: [212, 30, -360], radius: 90, salvageValue: 0.14, label: 'Starboard Drive Tower' },
      { id: 'port_battery', kind: 'weapon', hp: 1200, position: [-150, 14, -40], radius: 60, salvageValue: 0.08, label: 'Port Casemates' },
      { id: 'stbd_battery', kind: 'weapon', hp: 1200, position: [150, 14, -40], radius: 60, salvageValue: 0.08, label: 'Starboard Casemates' },
    ],
    weapons: [
      weapon('cr_port', 'Port Casemates', 'cannon', {
        mount: [-154, 14, -40], yawCentre: PI * 0.5, yawWidth: PI * 0.62,
        range: RANGE.cannon * 0.9, damage: 58, shotsPerBurst: 4, cooldown: 4.0,
        projectileSpeed: 1500, tracking: 0.5,
      }),
      weapon('cr_stbd', 'Starboard Casemates', 'cannon', {
        mount: [154, 14, -40], yawCentre: -PI * 0.5, yawWidth: PI * 0.62,
        range: RANGE.cannon * 0.9, damage: 58, shotsPerBurst: 4, cooldown: 4.0,
        projectileSpeed: 1500, tracking: 0.5,
      }),
      weapon('cr_pd', 'Point Defence', 'pd', {
        mount: [-124, 176, -100], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 12, shotsPerBurst: 6, burstInterval: 0.05,
        cooldown: 0.7, projectileSpeed: 2400, tracking: 3.2,
      }),
    ],
  }),

  shipClass({
    id: 'coalition_strikecraft',
    name: 'Bolt',
    faction: 'coalition',
    role: 'fighter',
    length: HULL_LENGTH.fighter,
    mass: 26, maxSpeed: 420, accel: 92, turnRate: 2.4,
    hullHP: 90, triBudget: 150,
    planeLocked: false,
    partsFor: strikeCraftParts,
    levels: 1,
    subsystems: [
      { id: 'core', kind: 'reactor', hp: 40, position: [0, 0, -2], radius: 3, salvageValue: 0.6, label: 'Core' },
    ],
    weapons: [
      weapon('sc_gun', 'Nose Cannon', 'cannon', {
        mount: [0, -1.5, 5], yawCentre: 0, yawWidth: PI * 0.14, pitchWidth: PI * 0.14,
        range: RANGE.pointDefence * 1.4, damage: 14, shotsPerBurst: 6, burstInterval: 0.08,
        cooldown: 1.6, projectileSpeed: 2100, tracking: 1.4,
      }),
    ],
  }),
];

export {
  corvetteParts, frigateParts, monitorParts, destroyerParts, carrierParts, strikeCraftParts,
  CV_HULL, FG_HULL, MN_HULL, DD_FORE, CR_SIDE,
};
