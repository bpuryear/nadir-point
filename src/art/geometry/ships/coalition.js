/**
 * COALITION HULLS — heavy industrial. Built to be repaired in the field by someone
 * angry.
 *
 * THE DESIGN LANGUAGE, and it is the whole reason these read as a different navy
 * from Concord rather than the same ship in a different colour:
 *
 *   RECTILINEAR. Wide flat decks, small chamfers relative to the beam, stations that
 *   step rather than sweep. Every Coalition cross-section is a box that has had its
 *   corners knocked off, never a blade.
 *
 *   SLAB ARMOUR, BOLTED ON. Armour belts sit PROUD of the flank with visible gaps
 *   between plates. A continuous strip is a stripe; a run of plates is armour.
 *
 *   EXTERNAL STRUCTURE. Engine pods hang off hex-strut pylons. Radiators cantilever
 *   off the engine block. Conduit runs along the outside of the hull where a fitter
 *   can reach it. Nothing is hidden because hiding it means cutting the hull open to
 *   fix it.
 *
 *   VISIBLE MACHINERY. Thruster BELLS, not slots. Flanged pipe, not fairing. On the
 *   destroyer the reactor is a drum in an open waist that you can shoot.
 *
 *   ONE COLOUR OF PAINT. Safety orange on the prow and on the mount collars, nowhere
 *   else. It is the identity carrier and it stops being one the moment it is used
 *   for decoration.
 *
 * THE THREE CLASSES ARE DELIBERATELY NOT THE SAME SHAPE AT THREE SIZES:
 *   corvette   fore-heavy. A gun with a hull under it and two engines slung outboard.
 *              Reads as an arrow with a fat back from above, a hammer from the side.
 *   frigate    broadside. Two enormous sponson boxes amidships that overhang the
 *              flanks; from above it is a cross, from the side a low slab with a
 *              blockhouse aft.
 *   destroyer  BROKEN-BACKED. Forward citadel and aft engine block joined by an OPEN
 *              WAIST with the reactor drum sitting in it. From any angle there is a
 *              hole through the middle of the ship. Nothing else in the game does
 *              that, which is why the salvage prize is recognisable at four
 *              kilometres.
 */

import * as G from '../greeble.js';
import { HULL_LENGTH, RANGE } from '../../../core/units.js';
import { Buckets, Lines, chineStrip, glowDisc, shipClass, weapon } from './common.js';

const PI = Math.PI;

// ===========================================================================
// CORVETTE — "Lancet", 95 m
// ===========================================================================

const CV_HULL = new Lines([
  [-40, 6.5, 3.5, -7.0, 2.0, 1.4, 2.0],
  [-16, 8.2, 5.6, -8.6, 2.6, 1.8, 2.4],
  [12, 7.6, 5.6, -7.6, 2.6, 1.8, 2.2],
  [26, 4.4, 2.6, -5.0, 1.6, 1.2, 1.6],
]);

/** The gun. Sits proud on the spine, offset 1.6 m to starboard - see the blister. */
const CV_GUN = new Lines([
  [-8, 5.0, 4.6, -4.2, 1.6, 1.4, 1.4],
  [30, 4.2, 3.6, -3.4, 1.4, 1.2, 1.2],
]);
const CV_GUN_Y = 8.4;
const CV_GUN_X = 1.6;

function corvetteParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  // --- 1. the hull, and the gun that is the point of it --------------------
  B.add('core', 'hull', CV_HULL.loft({}, full ? 1 : 2));
  B.add('weapon', 'plating', CV_GUN.loft(), { pos: [CV_GUN_X, CV_GUN_Y, 0] });

  // Two barrels out to z = +45, muzzle plate to +47.5. This is what makes the
  // class read fore-heavy: the weapon is longer than the hull it is bolted to.
  for (const s of [-1, 1]) {
    B.add('weapon', 'greeble', G.pipeRun({
      length: 15, radius: 1.5, sides: 6, axis: 'z', detail: D,
    }), { pos: [CV_GUN_X + s * 2.4, CV_GUN_Y + 0.4, 30] });
  }
  B.add('weapon', 'dark', G.panelledSlab({ width: 9.5, height: 4.2, depth: 2.5, detail: D }),
    { pos: [CV_GUN_X, CV_GUN_Y + 0.4, 46.2] });
  // The one piece of paint on the ship.
  if (full) {
    B.add('weapon', 'trim', G.panelledSlab({ width: 10.4, height: 1.4, depth: 4.0, detail: D }),
      { pos: [CV_GUN_X, CV_GUN_Y + 3.0, 26] });
  }

  // --- 2. the crew blister, hung off the PORT flank ------------------------
  // Asymmetry with a reason: the gun took the centreline, so the two people who
  // fly this thing got bolted to the side of it.
  B.add('core', 'hull', G.panelledSlab({ width: 5.4, height: 5.0, depth: 9.0, chamfer: 1.6, detail: D }),
    { pos: [-7.4, 4.6, 8] });
  if (full) {
    B.add('core', 'glass', G.panelledSlab({ width: 1.0, height: 2.0, depth: 3.4, detail: D }),
      { pos: [-10.2, 5.4, 9.5] });
  }

  // --- 3. engines, bolted on outboard --------------------------------------
  for (const s of [-1, 1]) {
    B.add('engine', 'greeble', G.hexStrut({ length: 5.5, radius: 2.0, axis: 'x', detail: D }),
      { pos: [s * 6.2, -1.0, -30], rot: [0, s > 0 ? 0 : PI, 0] });
    B.add('engine', 'dark', G.panelledSlab({ width: 7.0, height: 7.4, depth: 15, chamfer: 2.0, detail: D }),
      { pos: [s * 11.6, -1.0, -33] });
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 2.9, mouth: 4.5, length: 7.0, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [s * 11.6, -1.0, -40.5] });
    B.add('engine', 'engineGlow', glowDisc(4.3, 8), { pos: [s * 11.6, -1.0, -47.4], rot: [0, PI, 0] });
  }

  // --- 4. the things a fitter touches --------------------------------------
  // Ventral ammo drum, hanging below the keel so the underside is not a flat plate.
  B.add('core', 'greeble', G.pipeRun({
    length: 26, radius: 3.8, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D,
  }), { pos: [0, -10.6, -16] });

  if (full) {
    // One radiator, starboard only. The port one is a stub where it was sheared off.
    B.add('engine', 'plating', G.radiatorFin({
      chord: 15, span: 12, thickness: 1.2, sweep: -5, tipChord: 10, detail: D,
    }), { pos: [7.6, 3.0, -34], rot: [0, 0, 0.34] });
    B.add('engine', 'dark', G.panelledSlab({ width: 1.6, height: 3.0, depth: 8, detail: D }),
      { pos: [-8.0, 4.0, -32] });

    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 34, height: 6.4, thickness: 1.8, plates: 2, gap: 5, chamfer: 1.4, detail: D,
      }), { pos: [s * 8.0, -1.2, -8] });
    }
  }

  // --- 5. running lights: 6 m, both flanks, mandatory ----------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(CV_HULL, -38, 22, s));

  return { buckets: B.list() };
}

// ===========================================================================
// FRIGATE — "Ardent", 210 m
// ===========================================================================

const FG_HULL = new Lines([
  [-78, 14.0, 8.0, -12.0, 4.0, 3.0, 4.0],
  [-42, 18.0, 11.0, -15.0, 5.0, 3.5, 4.5],
  [4, 19.0, 12.0, -15.5, 5.0, 3.5, 4.5],
  [46, 16.5, 10.0, -13.5, 4.5, 3.0, 4.0],
  [76, 9.5, 4.5, -9.0, 3.0, 2.0, 3.0],
]);

/** Stern block. Deliberately WIDER than the hull - the step is the read. */
const FG_ENGINE = new Lines([
  [-102, 23.0, 13.0, -17.0, 6.0, 4.0, 5.0],
  [-92, 24.5, 14.5, -18.0, 6.0, 4.0, 5.0],
  [-70, 17.0, 10.0, -14.0, 5.0, 3.5, 4.5],
]);

/** Blockhouse. Aft of centre and 3.5 m to port; it is a fitting, not a feature. */
const FG_BRIDGE = new Lines([
  [-40, 7.5, 27.0, 11.0, 2.0, 2.0, 2.0],
  [-16, 8.5, 29.0, 11.0, 2.5, 2.5, 2.0],
  [14, 6.0, 22.0, 11.0, 2.0, 2.0, 2.0],
]);
const FG_BRIDGE_X = -3.5;

/** Broadside sponson. One definition, mirrored - the class read in one shape. */
const FG_SPONSON = new Lines([
  [-20, 7.5, 7.0, -7.0, 2.4, 2.0, 2.4],
  [42, 7.0, 6.0, -6.5, 2.4, 2.0, 2.4],
]);
const FG_SPONSON_X = 25.0;

function frigateParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const decim = lod === 0 ? 1 : 2;
  const B = new Buckets();

  if (lod >= 2) {
    // Far LOD: five masses, one surface, outline only. Every one overlaps its
    // neighbour so the proxy never separates into fragments at the switch.
    B.add('core', 'hull', FG_HULL.loft({}, 2));
    B.add('core', 'hull', FG_ENGINE.loft({ capFront: false }, 2));
    B.add('core', 'hull', G.taperedWedge({
      length: 30, width0: 19, height0: 13.5, width1: 7, height1: 5, detail: D,
    }), { pos: [0, -1, 76] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.panelledSlab({ width: 15, height: 13, depth: 62, detail: D }),
        { pos: [s * FG_SPONSON_X, 1, 11] });
    }
    B.add('core', 'hull', G.panelledSlab({ width: 17, height: 20, depth: 54, detail: D }),
      { pos: [FG_BRIDGE_X, 20, -13] });
    return { buckets: B.list() };
  }

  // --- 1. spine + blunt armoured prow --------------------------------------
  B.add('core', 'hull', FG_HULL.loft({ capBack: false }, decim));
  B.add('core', 'plating', G.taperedWedge({
    length: 30, width0: 19, height0: 13.4, width1: 7.5, height1: 5.5, shear: -1.0, chamfer: 2.4, detail: D,
  }), { pos: [0, -1.5, 76] });
  if (full) {
    // Prow chevrons - the only paint forward of the bridge.
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 1.8, height: 1.6, depth: 22, detail: D }),
        { pos: [s * 7.6, 2.5, 88], rot: [0, s * 0.12, 0] });
    }
  }

  // --- 2. the sponsons. THE class read. ------------------------------------
  for (const s of [-1, 1]) {
    B.add('weapon', 'hull', FG_SPONSON.loft(), { pos: [s * FG_SPONSON_X, 1.0, 0] });
    // Gun house on top of the shelf, then barrels out through the outboard face.
    B.add('weapon', 'dark', G.panelledSlab({ width: 11, height: 5.0, depth: 40, chamfer: 1.6, detail: D }),
      { pos: [s * FG_SPONSON_X, 8.5, 10] });
    for (const dz of full ? [-4, 24] : [10]) {
      B.add('weapon', 'greeble', G.pipeRun({
        length: 13, radius: 1.9, sides: 6, axis: 'x', detail: D,
      }), { pos: [s * (FG_SPONSON_X + 5.5), 2.0, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
    if (full) {
      // Under-shelf buttress: the sponson is CARRIED, not floating.
      B.add('weapon', 'dark', G.taperedWedge({
        length: 12, width0: 26, height0: 11, width1: 8, height1: 4, shear: -3, detail: D,
      }), { pos: [s * 18.5, -7.0, 6], rot: [0, s * PI * 0.5, 0] });
    }
  }

  // --- 3. dorsal: blockhouse, mast, open truss aft -------------------------
  B.add('tower', 'hull', FG_BRIDGE.loft({ capBack: false }, decim), { pos: [FG_BRIDGE_X, 0, 0] });
  if (full) {
    B.add('tower', 'glass', G.panelledSlab({ width: 7.0, height: 2.2, depth: 1.0, detail: D }),
      { pos: [FG_BRIDGE_X, 24.5, 13.6] });
  }
  B.add('tower', 'greeble', G.antennaMast({
    height: 20, radius: 1.6, tipRadius: 0.8, spars: full ? 2 : 1, sparSpan: 7, detail: D,
  }), { pos: [FG_BRIDGE_X, 28, -30] });
  if (full) {
    B.add('tower', 'greeble', G.sensorDish({ radius: 5.0, depth: 2.2, sides: 8, stub: 2.5, detail: D }),
      { pos: [FG_BRIDGE_X, 50, -28], rot: [-0.5, 0, 0] });
  }
  // The deck plating between the blockhouse and the engine block simply is not
  // there. Frames where a hull would be: Coalition ships are never finished.
  B.add('core', 'dark', G.hullRibs({
    count: full ? 4 : 2, spacing: 9, span: 30, height: 7, thickness: 2.4, taper: 0.85, detail: D,
  }), { pos: [0, 13, -58] });

  // --- 4. stern block, bells, radiator bank --------------------------------
  B.add('engine', 'hull', FG_ENGINE.loft({ capFront: false }, decim));
  for (const x of [-11.5, 0, 11.5]) {
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 5.0, mouth: 7.4, length: 13, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [x, -1.0, -89] });
    B.add('engine', 'engineGlow', glowDisc(7.0, 8), { pos: [x, -1.0, -102.4], rot: [0, PI, 0] });
  }
  // Three fins to port, two to starboard. The ship lost one and the crew
  // rebalanced by moving the survivors - a story a silhouette can tell for free.
  const fins = full
    ? [[-1, -98], [-1, -87], [-1, -76], [1, -93], [1, -80]]
    : [[-1, -93], [1, -83]];
  for (const [s, z] of fins) {
    B.add('engine', 'plating', G.radiatorFin({
      chord: 17, span: 21, thickness: 1.6, sweep: -6, tipChord: 11, detail: D,
    }), { pos: [s * 19, 12, z], rot: [0, 0, s * 0.30] });
  }

  // --- 5. field-repair vocabulary ------------------------------------------
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 96, height: 12, thickness: 2.2, plates: 3, gap: 8, chamfer: 2.4, detail: D,
      }), { pos: [s * 18.4, -3.0, -20] });
    }
    // Conduit trunk along the PORT flank only, where a fitter can reach it.
    B.add('core', 'greeble', G.pipeRun({
      length: 58, radius: 2.2, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-19.4, 7.0, -46] });
    // Ventral tow cradle: this navy salvages its own dead.
    B.add('core', 'dark', G.hullRibs({
      count: 3, spacing: 22, span: 26, height: 5, thickness: 3.0, taper: 0.9, detail: D,
    }), { pos: [0, -17, -6] });
  }

  // --- 6. running lights ---------------------------------------------------
  for (const s of [-1, 1]) B.add('core', 'runningLights', chineStrip(FG_HULL, -74, 70, s, { width: 2.0 }));

  return { buckets: B.list() };
}

// ===========================================================================
// DESTROYER — "Bulwark", 480 m. The salvage prize.
// ===========================================================================

const DD_FORE = new Lines([
  [40, 38, 26, -26, 10, 7, 8],
  [96, 39, 28, -27, 10, 7, 8],
  [160, 34, 23, -25, 9, 6, 8],
  [206, 21, 13, -18, 6, 4, 6],
]);

const DD_AFT = new Lines([
  [-196, 35, 24, -25, 9, 6, 8],
  [-140, 39, 27, -27, 10, 7, 8],
  [-74, 38, 26, -26, 10, 7, 8],
  [-40, 36, 24, -24, 9, 6, 7],
]);

/** Stern block, wider than either hull section. */
const DD_ENGINE = new Lines([
  [-240, 48, 31, -34, 11, 7, 9],
  [-224, 50, 33, -36, 11, 7, 9],
  [-192, 38, 25, -28, 10, 6, 8],
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
  B.add('weapon', 'dark', G.mountPad({ radius: 15, height: 4, sides: 8, detail: D }), { pos: [x, y, z] });
  if (full) {
    B.add('weapon', 'trim', G.dockingCollar({ radius: 12, innerRadius: 8, depth: 2.5, sides: 8, detail: D }),
      { pos: [x, y + 4, z], rot: [-PI * 0.5, 0, 0] });
  }
  B.add('weapon', 'plating', G.panelledSlab({ width: 24, height: 12, depth: 26, chamfer: 4, detail: D }),
    { pos: [x, y + 11, z - 2] });
  for (const s of [-1, 1]) {
    B.add('weapon', 'greeble', G.pipeRun({
      length: 26, radius: 2.6, sides: 6, axis: 'z', detail: D,
    }), { pos: [x + s * 5.5, y + 11, z + 11] });
  }
}

function destroyerParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const decim = lod === 0 ? 1 : 2;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', DD_FORE.loft({}, 2));
    B.add('core', 'hull', DD_AFT.loft({}, 2));
    B.add('core', 'hull', DD_ENGINE.loft({ capFront: false }, 2));
    B.add('core', 'hull', G.taperedWedge({
      length: 34, width0: 42, height0: 31, width1: 12, height1: 10, detail: D,
    }), { pos: [0, -2, 206] });
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
  B.add('core', 'hull', DD_FORE.loft({ capBack: false }, decim));
  B.add('core', 'plating', G.taperedWedge({
    length: 34, width0: 42, height0: 31, width1: 13, height1: 11, shear: -3, chamfer: 5, detail: D,
  }), { pos: [0, -2, 206] });
  // THE CHIN. A ventral armour ram that hangs 28 m below the keel forward of the
  // citadel. From the beam this class is otherwise a long low hull with two
  // deckhouses, which is a frigate with more of everything; the hook under the bow
  // is the one line that cannot be mistaken for the Ardent at any distance.
  B.add('core', 'plating', G.taperedWedge({
    length: 92, width0: 30, height0: 30, width1: 15, height1: 16, shear: -13, chamfer: 5, detail: D,
  }), { pos: [0, -30, 140] });
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 3.0, height: 3.0, depth: 34, detail: D }),
        { pos: [s * 15, 5, 220], rot: [0, s * 0.14, 0] });
    }
  }

  B.add('tower', 'hull', DD_CITADEL.loft({ capBack: false }, decim), { pos: [DD_CITADEL_X, 0, 0] });
  if (full) {
    for (const i of [-1, 1]) {
      B.add('tower', 'glass', G.panelledSlab({ width: 6, height: 3.0, depth: 1.2, detail: D }),
        { pos: [DD_CITADEL_X + i * 6.5, 56, 126] });
    }
  }
  B.add('tower', 'greeble', G.antennaMast({
    height: 40, radius: 3.0, tipRadius: 1.4, spars: full ? 3 : 1, sparSpan: 13, detail: D,
  }), { pos: [DD_CITADEL_X, 74, 66] });
  if (full) {
    B.add('tower', 'greeble', G.sensorDish({ radius: 10, depth: 4.5, sides: 10, stub: 5, detail: D }),
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
  B.add('reactor', 'greeble', G.pipeRun({
    length: 66, radius: 15, sides: 8, axis: 'z', flanges: full ? 2 : 0, detail: D,
  }), { pos: [0, -6, DD_REACTOR_Z - 33] });
  B.add('reactor', 'emissive', G.pipeRun({
    length: 5, radius: 16.4, sides: 8, axis: 'z', caps: false, detail: D,
  }), { pos: [0, -6, DD_REACTOR_Z - 2.5] });
  if (full) {
    for (const s of [-1, 1]) {
      B.add('reactor', 'greeble', G.cappedConduit({ length: 14, radius: 3.4, sides: 6, axis: 'x', detail: D }),
        { pos: [s * 15, -6, DD_REACTOR_Z - 24], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }

  // --- 3. aft hull, aft deckhouse, batteries, hangar -----------------------
  B.add('core', 'hull', DD_AFT.loft({ capFront: false, capBack: false }, decim));
  // A SECOND deckhouse. One blockhouse is a frigate; two, separated by a hole in
  // the ship, is a destroyer, and that is true from four kilometres out.
  B.add('tower', 'hull', G.panelledSlab({ width: 30, height: 26, depth: 78, chamfer: 6, detail: D }),
    { pos: [DD_CITADEL_X, 34, -128] });
  if (full) {
    B.add('tower', 'dark', G.panelledSlab({ width: 20, height: 10, depth: 40, chamfer: 3, detail: D }),
      { pos: [DD_CITADEL_X, 50, -140] });
  }

  // Two turrets. The forward one sits ahead of the citadel; the aft one sits on
  // the aft deck and fires forward THROUGH the waist, so the hole in the ship is
  // something the guns visibly use rather than a hole for its own sake.
  dorsalTurret(B, DD_CITADEL_X, 22, DD_TURRETS[0], D, full);
  dorsalTurret(B, DD_CITADEL_X, 23, DD_TURRETS[1], D, full);

  // Broadside batteries on the aft hull, where the arcs actually are.
  for (const s of [-1, 1]) {
    B.add('weapon', 'hull', G.panelledSlab({ width: 15, height: 15, depth: 74, chamfer: 4, detail: D }),
      { pos: [s * 43, 2, -128] });
    for (const dz of full ? [-156, -128, -100] : [-128]) {
      B.add('weapon', 'greeble', G.pipeRun({
        length: 15, radius: 2.6, sides: 6, axis: 'x', detail: D,
      }), { pos: [s * 50, 2, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }
  // Hangar: a real opening in the ventral aft hull, with frames inside it.
  B.add('hangar', 'dark', G.blastDoor({ width: 44, height: 26, depth: 4, detail: D }),
    { pos: [0, -26, -110], rot: [PI * 0.5, 0, 0] });
  if (full) {
    B.add('hangar', 'greeble', G.hullRibs({
      count: 3, spacing: 14, span: 40, height: 4, thickness: 3, taper: 0.9, detail: D,
    }), { pos: [0, -22, -110] });
    B.add('hangar', 'trim', G.panelledSlab({ width: 50, height: 1.6, depth: 3, detail: D }),
      { pos: [0, -27, -84] });
  }

  // --- 4. stern block ------------------------------------------------------
  B.add('engine', 'hull', DD_ENGINE.loft({ capFront: false }, decim));
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
    ? [[-1, -228], [-1, -208], [-1, -188], [1, -222], [1, -196]]
    : [[-1, -216], [1, -202]];
  for (const [s, z] of fins) {
    B.add('engine', 'plating', G.radiatorFin({
      chord: 32, span: 44, thickness: 3, sweep: -12, tipChord: 21, detail: D,
    }), { pos: [s * 38, 26, z], rot: [0, 0, s * 0.3] });
  }

  // --- 5. field-repair vocabulary ------------------------------------------
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.armourBelt({
        length: 150, height: 26, thickness: 4, plates: 3, gap: 16, chamfer: 5, detail: D,
      }), { pos: [s * 38, -4, 122] });
    }
    B.add('core', 'greeble', G.pipeRun({
      length: 120, radius: 4.0, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-37, 14, -178] });
  }

  // --- 6. running lights: two runs, because the waist breaks the chine -----
  for (const s of [-1, 1]) {
    B.add('core', 'runningLights', chineStrip(DD_FORE, 46, 200, s, { width: 3.2 }));
    B.add('core', 'runningLights', chineStrip(DD_AFT, -190, -44, s, { width: 3.2 }));
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
  B.add('core', 'glass', G.panelledSlab({ width: 1.6, height: 1.0, depth: 2.4, detail: D }),
    { pos: [0, 1.7, 3.2] });
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
      { id: 'gun', kind: 'weapon', hp: 170, position: [1.6, 8.4, 14], radius: 11, salvageValue: 0.30, label: 'Bow Gun' },
      { id: 'reactor', kind: 'reactor', hp: 210, position: [0, -2, -8], radius: 9, salvageValue: 0.32, label: 'Core' },
      { id: 'engine_port', kind: 'engine', hp: 120, position: [-11.6, -1, -36], radius: 8, salvageValue: 0.10, label: 'Port Pod' },
      { id: 'engine_stbd', kind: 'engine', hp: 120, position: [11.6, -1, -36], radius: 8, salvageValue: 0.10, label: 'Starboard Pod' },
    ],
    weapons: [
      weapon('cv_gun', 'Bow Autocannon', 'cannon', {
        mount: [1.6, 8.8, 44], yawCentre: 0, yawWidth: PI * 0.42,
        range: RANGE.cannon * 0.72, damage: 27, shotsPerBurst: 5, burstInterval: 0.11,
        cooldown: 2.2, projectileSpeed: 1700, tracking: 1.1,
      }),
      weapon('cv_pd', 'Point Defence', 'pd', {
        mount: [-7.4, 7.2, 8], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
      { id: 'port_battery', kind: 'weapon', hp: 430, position: [-25, 4, 10], radius: 20, salvageValue: 0.30, label: 'Port Sponson' },
      { id: 'stbd_battery', kind: 'weapon', hp: 430, position: [25, 4, 10], radius: 20, salvageValue: 0.30, label: 'Starboard Sponson' },
      { id: 'engine', kind: 'engine', hp: 640, position: [0, -1, -92], radius: 24, salvageValue: 0.18, label: 'Main Drive' },
      { id: 'sensor', kind: 'sensor', hp: 250, position: [-3.5, 38, -30], radius: 14, salvageValue: 0.10, label: 'Sensor Mast' },
    ],
    weapons: [
      weapon('fg_port', 'Port Mass Driver Bank', 'cannon', {
        mount: [-30.5, 2, 10], yawCentre: PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_stbd', 'Starboard Mass Driver Bank', 'cannon', {
        mount: [30.5, 2, 10], yawCentre: -PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_pd', 'Point Defence', 'pd', {
        mount: [-3.5, 30, -4], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
        range: RANGE.pointDefence, damage: 8, shotsPerBurst: 4, burstInterval: 0.07,
        cooldown: 1.1, projectileSpeed: 2400, tracking: 3.0,
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
      { id: 'port_battery', kind: 'weapon', hp: 1000, position: [-43, 2, -128], radius: 40, salvageValue: 0.16, label: 'Port Battery' },
      { id: 'stbd_battery', kind: 'weapon', hp: 1000, position: [43, 2, -128], radius: 40, salvageValue: 0.16, label: 'Starboard Battery' },
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
        mount: [-50, 2, -128], yawCentre: PI * 0.5, yawWidth: PI * 0.545,
        range: RANGE.cannon * 1.15, damage: 92, shotsPerBurst: 3, cooldown: 4.6,
        projectileSpeed: 1250, tracking: 0.38,
      }),
      weapon('dd_stbd', 'Starboard Heavy Battery', 'cannon', {
        mount: [50, 2, -128], yawCentre: -PI * 0.5, yawWidth: PI * 0.545,
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

export { corvetteParts, frigateParts, destroyerParts, strikeCraftParts };
