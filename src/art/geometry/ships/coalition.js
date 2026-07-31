/**
 * COALITION HULLS — heavy industrial. Built to be repaired in the field by someone
 * angry.
 *
 * ===========================================================================
 * THE DESIGN LANGUAGE, and it is the whole reason these read as a different navy
 * from Concord rather than the same ship in a different colour:
 * ===========================================================================
 *
 *   PLATED, NOT PANELLED. Wide flat decks, a hard beltline, sections that STEP
 *   between named breaks rather than sweeping fair. Every Coalition mass is cut
 *   from the same twelve-point section as the hull it is bolted to, so the ship
 *   reads as one yard's plate stock at every size.
 *
 *   SLAB ARMOUR, BOLTED ON. Armour belts sit PROUD of the flank with visible gaps
 *   between plates. A continuous strip is a stripe; a run of plates is armour.
 *   `Mass#belt` is that knob and Concord's is the same call with `plates: 1`.
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
 * WHAT CHANGED IN THIS PASS: THE SECTION, AND THEREFORE EVERYTHING
 * ===========================================================================
 * The player cruiser was rebuilt out of a TWELVE-POINT FACETED SECTION and measured
 * 32.2% of its surface area within 5 degrees of a cardinal axis. This file was still
 * building hulls out of `Lines` — an 8-gon of four orthogonal planes and four thin
 * chamfers — plus `panelledSlab` boxes bolted to the outside of it, and measured:
 *
 *     class                    tris   axis    clus  top6        AFTER
 *     coalition_strikecraft     138   82.1%   13   72.6%     374  8.3%  40  26.9%
 *     coalition_carrier        1592   67.3%   18   63.6%    3012 22.3%  24  26.4%
 *     coalition_monitor         844   54.8%   19   51.8%    2296 10.5%  25  18.3%
 *     coalition_destroyer      1576   46.5%   20   44.2%    2972 10.7%  31  20.9%
 *     coalition_frigate         900   47.7%   21   44.9%    1976 11.1%  25  27.2%
 *     coalition_corvette        490   41.7%   31   41.7%    1482  9.8%  33  17.4%
 *
 * Bars are axis <= 45%, clus >= 24, top6 <= 45%; the redesigned player cruiser reads
 * 32.2% / 14 / 34.0%. All six classes now pass all three and five of the six are
 * BELOW THE CRUISER on the axis number, which is what "the fleet belongs to the same
 * game as the ship the player flies" looks like when you have to measure it. Draw
 * calls at LOD0 are 11 / 11 / 11 / 11 / 12 / 5 - byte for byte what they were - and
 * the two classes that shipped fewer than three LODs now ship three, so the count at
 * range went DOWN (corvette 11/6/3 against 11/6, strike craft 5/4/3 against 5).
 *
 * In game the player flew a redesigned sleek hull against cardboard boxes, and that
 * inconsistency was more visible than either half of it alone. Six things changed and
 * every one of them is a call into `ships/common.js#Mass`, the extracted cruiser
 * vocabulary — no new primitive was invented here:
 *
 *   1. EVERY HULL IS A `Mass`. One continuous loft of the twelve-point section, six
 *      facets a side, NO FACET WITHIN 5 DEGREES OF AN AXIS at any station. The
 *      station tables keep their plan curve, their waist and their prow — the shape
 *      of each class is unchanged, the SECTION it is swept from is not.
 *   2. EVERY BOLTED-ON MASS IS ALSO A `Mass`. Sponsons, gun houses, engine pods,
 *      drive towers, the flight deck, the island, the bridges, the gallery rails,
 *      the waist keels. `panelledSlab` survives nowhere on a mass over 20 m.
 *   3. ARMOUR IS `Mass#belt`, NOT `G.armourBelt`. The old primitive laid a run of
 *      straight prisms at a fixed x, which on a hull whose half-beam moves is a
 *      plank nailed to a curve; `belt` cuts each plate from the hull's OWN section
 *      and stands it proud along the facet's measured outward normal, so it lies on
 *      the skin by construction. Same gaps, same faction read, on the surface.
 *   4. STRUCTURE IS `Mass#frames`, at `FRAME`'s 6.4-10.0% of length rhythm. The same
 *      visual rhythm on a 95 m corvette and a 900 m carrier is what makes a fleet
 *      look like it was welded in one yard, and it is the cue this file had none of.
 *   5. DETAIL WENT SUBTRACTIVE. `Mass#intake` (a trench that follows the sweep) and
 *      `Mass#recess` (an aperture aimed down the facet normal) replace the proud
 *      greeble boxes. A hole self-shadows under a flat key; a box does not.
 *   6. PAINT FOLLOWS AN EDGE, because it is now `Mass#plate` on the deck chamfer
 *      rather than a slab rotated to look like it does (§4a).
 *
 * WHAT DID NOT CHANGE, DELIBERATELY: the TOPOLOGY of every class. `common.js` is
 * explicit that frames, strakes, belts, recesses and intakes move the outline by ~0
 * and buy ZERO separation, and that the closest pairs in the game are Coalition's own
 * monitor/destroyer at 10.2 m against a 10.0 m bar. So the number of masses per
 * class, where the sky is, the plan curve, the waist positions and the sheer/keel
 * relationship are all held, and the surface language is what moved.
 *
 * ===========================================================================
 * FIVE CAPITAL CLASSES, DELIBERATELY NOT THE SAME SHAPE AT FIVE SIZES
 * ===========================================================================
 *   Lancet    corvette  95 m   FORE-HEAVY ARROW. A gun with a hull under it and
 *                             two engines slung outboard on open struts.
 *   Ardent    frigate  210 m   A CROSS. Two enormous sponson boxes carried on
 *                             external trusses, overhanging the flanks by two
 *                             thirds of the hull's own beam. Solid in the middle.
 *   Sledge    monitor  420 m   A GUN WITH A RAFT UNDER IT. The flattest section in
 *                             the Coalition (1.82 worst, 2.10 mean) and a single
 *                             house forward carrying two 190 m barrels that reach
 *                             110 m past the bow and end in a 25 m muzzle brake.
 *   Bulwark   destroyer 480 m  BROKEN-BACKED. Forward citadel and aft engine block
 *                             joined by an OPEN WAIST with the reactor drum in it,
 *                             and a portal gantry straight over the hole.
 *   Anvil     carrier  900 m   A CANYON. Two side hulls with a 560 m flight-through
 *                             slot cut between them, open at the bow, the stern AND
 *                             the sky, crossed by two bridges. Engine towers stand
 *                             off the hull on lattice pylons.
 *
 * ARDENT vs BULWARK was the weakest pair on the silhouette sheet and it separated
 * "mainly on a 26 m waist notch" (docs/review/acceptance.md). It is a topology
 * difference and it is stated as one rule: THE ARDENT IS SOLID IN THE MIDDLE AND
 * WIDE AT THE EDGES; THE BULWARK IS EMPTY IN THE MIDDLE AND NARROW AT THE EDGES.
 * In plan the Ardent is a cross and the Bulwark is a bar with a hole in it. There is
 * no distance at which those are the same shape.
 *
 * ===========================================================================
 * THE STATION TABLES ARE ALL SEVEN COLUMNS NOW
 * ===========================================================================
 *     [z, half, top, bottom, knuckle, deckFlat, flare]
 *
 * The same seven `cruiser.js#HULL_STATIONS` is written in. `half` is the half-beam
 * AT THE KNUCKLE — the widest point of the section, which is NOT the deck edge —
 * so a table converted from `Lines` keeps its plan outline exactly while the deck
 * edge steps inboard by `deckFlat` and the beltline drops to `knuckle`. Read the
 * block headed THE SECTION FAMILY in `common.js` before editing one.
 *
 * BEAM : DEPTH >= 1.6 IS ENFORCED by `Mass` on every mass over 80 m of span, and six
 * tables in this file were reshaped to meet it — the old fleet ran 0.63 to 1.57, i.e.
 * hulls TALLER THAN THEY WERE WIDE, against a cruiser that holds 1.96 worst. "FLAT"
 * is the first word of the brief. FIVE masses carry an `exempt` REASON instead
 * (MN_RAIL, DD_CITADEL, DD_WAIST, CR_ISLAND, CR_TOWER) and every one of them is a
 * tower or a longitudinal beam rather than a hull section.
 *
 * MEASURED, `Mass#findings`, all five primary tables:
 *
 *     hull            B:H worst/mean   minParallel   calm runs   waist   stations
 *     Lancet            1.62 / 1.76       0.063        0            0.27     12
 *     Ardent            1.62 / 1.73       0.050        0            0.13      8
 *     Sledge            1.82 / 2.10       0.048        0            0.23     11
 *     Bulwark (fore)    1.64 / 1.71       0.089        0            0.41      5
 *     Anvil (side)      1.70 / 1.81       0.042        1 of 90 m    0.38      9
 *
 * `minParallel` is `ship-redesign.md` L5 — the closest the deck slope and the keel
 * slope come to being equal over any adjacent pair. Where they ARE equal the section
 * is merely being extruded and the hull has no sheer. Every table here was over the
 * 0.04 bar after one pass of y-column edits; the Anvil's stern was at 0.008, i.e.
 * 120 m of pure extrusion, which is exactly the defect the rule names. The audit does
 * not gate the FLEET on L5 (only the cruiser), so this is held here by hand.
 */

import * as G from '../greeble.js';
import { BUDGET, HULL_LENGTH, RANGE } from '../../../core/units.js';
import {
  Buckets, FACET, Mass, chineStrip, glowDisc, glowSlot, shipClass, weapon,
} from './common.js';

const PI = Math.PI;
const HALF_PI = PI * 0.5;

/**
 * Lengths for the two classes that are not in core/units.js#HULL_LENGTH. That file
 * is shared foundation and this stream does not edit it unilaterally; adding
 * `monitor: 420` and `carrier: 900` there is proposed in the stream report.
 */
export const COALITION_LENGTH = { monitor: 420, carrier: 900 };

// ---------------------------------------------------------------------------
// Two local helpers. Everything else comes from `Mass` or the greeble kit.
// ---------------------------------------------------------------------------

/**
 * A run of transverse beams, each ROLLED off the axis.
 *
 * `G.hullRibs` builds `rectProfile` prisms, so a rank of them is 100% axis-aligned
 * surface area sitting in exactly the place — inside an open bay — where the eye is
 * being invited to look INTO the structure. `bevelBox#cant` is the kit's own answer:
 * at 0.14 rad every long face is 8 degrees off its axis for zero extra triangles,
 * and alternating the sign gives a rank of beams that were clearly fitted by hand.
 *
 * Beams taper toward the ends of the run, the way `hullRibs#taper` did, so the run
 * answers to the shape of the hole rather than being a rubber stamp.
 */
function beamRun({
  count, span, height, thickness, spacing, cant = 0.14, taper = 0.88, detail = G.DETAIL.FULL,
}) {
  const n = detail >= G.DETAIL.MID ? count : Math.max(2, Math.ceil(count * 0.5));
  const step = detail >= G.DETAIL.MID ? spacing : spacing * (count / n);
  const parts = [];
  const z0 = -((n - 1) * step) * 0.5;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : Math.abs((i / (n - 1)) * 2 - 1);
    parts.push({
      geo: G.bevelBox({
        width: span * (1 - (1 - taper) * t), height, depth: thickness,
        chamfer: height * 0.28, cant: cant * (i % 2 ? -1 : 1), detail,
      }),
      pos: [0, 0, z0 + i * step],
    });
  }
  return G.mergeParts(parts, { uv: false });
}

/**
 * THE FACTION SURFACE PASS, and it is the same four calls on every hull in this file.
 *
 * This is what makes six classes read as one navy without touching their outlines:
 * structural frames at the hull's own rhythm, an armour BELT of separate plates below
 * the knuckle carrying `dark`, a longitudinal trench, and the running lights on the
 * knuckle itself. Everything here lands in buckets the class already has, so it costs
 * ZERO draw calls; `common.js` is explicit that it also buys zero separation, which is
 * exactly why it is safe to give all six the same treatment.
 *
 * `dark` GOES BELOW THE KNUCKLE ONLY. Above and below the same chine is the one
 * arrangement that stops the chine reading as the boundary between two values.
 */
function platePass(B, mass, {
  group = 'core', length, frames = null, belt = null, beltOut = null, plates = 3,
  taper = 0.2, lights = null, lightWidth = 2.0, pos = null, detail = G.DETAIL.FULL, full = true,
}) {
  const at = pos ? { pos } : null;
  if (frames && detail >= G.DETAIL.MID) {
    const zs = mass.frameStations({ length, count: frames.count ?? 3, from: frames.from, to: frames.to });
    B.add(group, 'plating', mass.frames(zs, { detail }), at);
  }
  if (belt && full) {
    for (const side of [-1, 1]) {
      B.add(group, 'dark', mass.belt({
        z0: belt[0], z1: belt[1], plates, taper, side, out: beltOut, facet: FACET.lowerFlank,
      }), at);
    }
  }
  if (lights) {
    for (const side of [-1, 1]) {
      const strip = chineStrip(mass, lights[0], lights[1], side, { width: lightWidth });
      B.add(group, 'runningLights', pos ? G.place(strip, { pos }) : strip);
    }
  }
}

// ===========================================================================
// CORVETTE — "Lancet", 95 m
// ===========================================================================

/**
 * `[z, half, top, bottom, knuckle, deckFlat, flare]`
 *
 * WAIST at z -30, SHOULDER at z 0, chine break at z +30, and the tip centre 4.0 m
 * below the axis on a 95 m ship. Beam:depth runs 1.65-2.25 against the old table's
 * 0.94-1.28: the Lancet used to be a hull TALLER THAN IT WAS WIDE with a gun on top,
 * which is the one proportion the brief names as being from a different game. It is
 * now a flat plated arrow, and the gun standing on it reads as the tall thing.
 *
 * `knuckle` walks 0.52 -> 0.34 over the length, so the beltline climbs toward the bow
 * and `flare` crosses 1.0 at the chine break: the widest part of the bow is down at
 * the forefoot, which is what makes a 95 m ship look like it is pushing something.
 */
const CV_HULL = new Mass([
  [-42, 9.2, 1.6, -8.0, 0.52, 0.62, 0.84],
  [-36, 8.2, 1.9, -7.0, 0.51, 0.60, 0.85],
  [-30, 7.2, 2.2, -5.8, 0.50, 0.58, 0.86],   // THE WAIST
  [-22, 8.4, 3.8, -5.9, 0.48, 0.56, 0.84],
  [-14, 9.4, 4.6, -6.4, 0.46, 0.54, 0.82],
  [-6, 9.9, 5.2, -6.6, 0.45, 0.53, 0.81],
  [2, 10.4, 5.4, -6.9, 0.44, 0.52, 0.80],    // THE SHOULDER
  [10, 9.7, 5.0, -6.7, 0.43, 0.50, 0.85],
  [18, 8.9, 4.2, -6.8, 0.42, 0.47, 0.92],
  [26, 7.6, 3.0, -6.3, 0.39, 0.44, 1.02],    // the chine break
  [33, 5.6, 0.6, -5.6, 0.36, 0.40, 1.09],
  [40, 2.8, -2.0, -4.8, 0.34, 0.34, 1.00],   // THE STEM - and the gun runs on past it
], { label: 'lancet' });

/** The gun. Sits proud on the spine, offset 1.6 m to starboard - see the blister. */
const CV_GUN = new Mass([
  [-18, 3.8, 3.4, -3.2, 0.48, 0.58, 0.92],
  [-8, 4.7, 4.3, -3.9, 0.46, 0.55, 0.90],
  [2, 5.2, 4.8, -4.1, 0.45, 0.53, 0.88],
  [14, 5.0, 4.6, -3.9, 0.43, 0.50, 0.89],
  [24, 4.5, 4.0, -3.6, 0.41, 0.47, 0.92],
  [32, 4.0, 3.4, -3.4, 0.40, 0.46, 0.94],
], { label: 'lancet gun' });
const CV_GUN_Y = 10.4;
const CV_GUN_X = 1.6;

/** The crew blister, hung off the PORT flank. Its own little section, not a box. */
const CV_BLISTER = new Mass([
  [-1, 2.6, 2.4, -2.6, 0.48, 0.58, 0.90],
  [4, 2.9, 2.8, -2.8, 0.45, 0.54, 0.88],
  [9, 2.2, 1.8, -2.4, 0.42, 0.48, 0.92],
], { label: 'lancet blister' });

/** An engine pod. Two of them, slung outboard with SKY between pod and hull. */
const CV_POD = new Mass([
  [-42, 3.6, 3.4, -3.6, 0.48, 0.58, 0.88],
  [-33, 4.2, 3.8, -4.0, 0.45, 0.54, 0.86],
  [-24, 3.4, 3.0, -3.4, 0.44, 0.52, 0.90],
], { label: 'lancet pod' });
const CV_POD_X = 16.2;

function corvetteParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    // THE THIRD LEVEL, and it is new: this class shipped two. At 3,990 m - the
    // switch distance for a 95 m hull - the Lancet is a handful of pixels, and the
    // only things in it are the arrow, the gun that overhangs the bow and the two
    // pods standing outboard. Three surfaces, so three draw calls instead of six.
    B.add('core', 'hull', CV_HULL.loft({ lod, at: [-30, 2, 26] }));
    B.add('core', 'plating', CV_GUN.loft({ lod, at: [2] }), { pos: [CV_GUN_X, CV_GUN_Y, 0] });
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.pipeRun({ length: 17, radius: 1.6, sides: 4, axis: 'z', detail: D }),
        { pos: [CV_GUN_X + s * 2.4, CV_GUN_Y + 0.4, 30] });
      B.add('core', 'hull', CV_POD.loft({ lod }), { pos: [s * CV_POD_X, -1.0, 0] });
      B.add('core', 'engineGlow', glowDisc(4.3, 6), { pos: [s * CV_POD_X, -1.0, -47.4], rot: [0, PI, 0] });
    }
    return { buckets: B.list() };
  }

  // --- 1. the hull, and the gun that is the point of it --------------------
  B.add('core', 'hull', full ? CV_HULL.loft() : CV_HULL.loft({ at: [-30, 2, 26, 33] }));
  B.add('core', 'plating', CV_GUN.loft(), { pos: [CV_GUN_X, CV_GUN_Y, 0] });

  // TWO BARRELS OUT TO z +45 AND A MUZZLE PLATE TO +47.5, ON A HULL WHOSE STEM IS AT
  // z +40. That claim used to be in this comment and false - the old stem was at
  // +47.5, so nothing overhung anything. The forward 8% of the class is now gun and
  // nothing else, which is what makes it read fore-heavy and is the same statement
  // the Sledge makes with 110 m of barrel.
  for (const s of [-1, 1]) {
    B.add('core', 'greeble', G.pipeRun({
      length: 15, radius: 1.5, sides: 6, axis: 'z', detail: D,
    }), { pos: [CV_GUN_X + s * 2.4, CV_GUN_Y + 0.4, 30] });
  }
  B.add('core', 'dark', G.bevelBox({
    width: 9.5, height: 3.0, depth: 2.5, chamfer: 0.9, draft: 0.7, cant: 0.11, detail: D,
  }), { pos: [CV_GUN_X, CV_GUN_Y + 0.4, 46.2] });

  // --- 2. the crew blister, hung off the PORT flank ------------------------
  // Asymmetry with a reason: the gun took the centreline, so the two people who
  // fly this thing got bolted to the side of it.
  B.add('core', 'hull', CV_BLISTER.loft(), { pos: [-8.6, 4.4, 0] });
  if (full) {
    // Window band, not a glass pane. A 2 m lit slot is a storey and it survives to
    // a silhouette; a dark quad is a hole in the shading and a whole extra draw.
    B.add('core', 'emissive', glowSlot(3.4, 1.0), { pos: [-11.6, 5.2, 4], rot: [0, -HALF_PI, 0] });
  }

  // --- 3. engines, bolted on outboard, with SKY BETWEEN --------------------
  // The struts are the whole Coalition thesis at 95 m: the pods do not blend into
  // the hull, they hang off it, and you can see the gap.
  for (const s of [-1, 1]) {
    B.add('engine', 'greeble', G.hexStrut({ length: 9.0, radius: 1.6, axis: 'x', detail: D }),
      { pos: [s * 7.2, -1.0, -30], rot: [0, s > 0 ? 0 : PI, 0] });
    B.add('engine', 'dark', CV_POD.loft(), { pos: [s * CV_POD_X, -1.0, 0] });
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 2.9, mouth: 4.5, length: 7.0, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [s * CV_POD_X, -1.0, -40.5] });
    B.add('engine', 'engineGlow', glowDisc(4.3, 8), { pos: [s * CV_POD_X, -1.0, -47.4], rot: [0, PI, 0] });
  }

  // --- 4. the things a fitter touches --------------------------------------
  // Ventral ammo drum, hanging below the keel so the underside is not a flat plate.
  B.add('core', 'greeble', G.pipeRun({
    length: 26, radius: 3.4, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D,
  }), { pos: [0, -9.4, -16], rot: [0, 0, 0.21] });

  if (full) {
    // One radiator, starboard only. The port one is a stub where it was sheared off.
    // THE ONE RADIATOR HANGS UNDER THE HULL, NOT OVER IT, and that is a separation
    // decision as much as an art one. Every other Coalition class carries its fins on
    // top of an engine block; "long low hull, engine block with swept fins" is the
    // description that collapsed Ardent against Bulwark once already. The Lancet's
    // cooling plant is slung under the keel with the ammunition, so from the beam its
    // whole after body is BELOW the axis and everything tall on it is forward.
    B.add('engine', 'plating', G.radiatorFin({
      chord: 15, span: 13, thickness: 1.2, sweep: -5, tipChord: 10, detail: D,
    }), { pos: [7.8, -3.6, -34], rot: [0, 0, PI - 0.30] });
    B.add('engine', 'dark', G.bevelBox({
      width: 1.6, height: 3.0, depth: 8, chamfer: 0.6, cant: 0.16, detail: D,
    }), { pos: [-8.6, -4.4, -32] });

    // A trench along the PORT upper flank only. Subtractive detail: this is the cable
    // run, and it self-shadows where a proud conduit would just add noise.
    B.add('core', 'greeble', CV_HULL.intake({
      z0: -34, z1: 14, side: -1, facet: FACET.upperFlank, t0: 0.32, t1: 0.62, depth: 0.55,
    }));
    // One aperture, starboard only. NOTHING DENSE IS MIRRORED.
    B.add('core', 'greeble', CV_HULL.recess({
      z: -20, side: 1, facet: FACET.upperFlank, t: 0.45, width: 5.0, height: 2.2, depth: 1.1, wall: 0.3, detail: D,
    }));
    // The one piece of paint on the ship, and it is a plate lying ON the deck chamfer
    // rather than a slab rotated to look as though it does (§4a).
    for (const s of [-1, 1]) {
      B.add('core', 'trim', CV_HULL.plate({
        z0: 10, z1: 38, side: s, facet: FACET.deckChamfer, t0: 0.30, t1: 0.44, drift: 0.24, out: 0.16,
      }));
    }
  }

  // --- 5. the faction surface pass, and the running lights ------------------
  platePass(B, CV_HULL, {
    length: 95,
    frames: { count: 3, from: -40, to: -4 },
    belt: [-38, 24], beltOut: 0.45, plates: 3, taper: 0.22,
    lights: [-40, 26], lightWidth: 1.6, detail: D, full,
  });

  return { buckets: B.list() };
}

// ===========================================================================
// FRIGATE — "Ardent", 210 m.  THE CROSS.
// ===========================================================================

/**
 * WAIST at z -72, SHOULDER at z +10, waist section 0.13 of the shoulder's. Chine
 * break at z +72; over the forward 33 m the silhouette falls 16 m with the deck
 * steeper than the keel, and the tip centre sits 6.2 m below the axis.
 *
 * Beam:depth was 0.63-1.59 and is 1.60-1.91. The Ardent's arms are what make it a
 * cross; a deep narrow spine between them made it a cross made of pipes.
 */
const FG_HULL = new Mass([
  [-96, 21.0, 10.0, -12.0, 0.53, 0.62, 0.84],
  [-72, 15.5, 7.6, -9.2, 0.51, 0.58, 0.86],   // THE WAIST
  [-30, 19.0, 11.0, -11.4, 0.47, 0.55, 0.82],
  [10, 22.0, 12.2, -12.2, 0.45, 0.53, 0.80],  // THE SHOULDER
  [48, 17.8, 9.4, -12.6, 0.42, 0.48, 0.92],
  [72, 13.8, 6.4, -10.4, 0.38, 0.43, 1.08],   // the chine break
  [92, 7.6, 0.4, -8.6, 0.34, 0.38, 1.12],
  [105, 3.0, -4.4, -8.0, 0.34, 0.34, 1.00],
], { label: 'ardent' });

/** Stern block. Deliberately WIDER than the hull - the step is the read. */
const FG_ENGINE = new Mass([
  [-101, 24.0, 12.0, -16.0, 0.52, 0.64, 0.88],
  [-96, 25.5, 13.5, -17.0, 0.52, 0.64, 0.88],
  [-88, 21.0, 11.0, -14.5, 0.50, 0.60, 0.86],
], { label: 'ardent stern' });

/** Blockhouse. Aft of centre and 3.5 m to port; it is a fitting, not a feature. */
const FG_BRIDGE = new Mass([
  [-46, 7.5, 27.0, 11.0, 0.44, 0.52, 0.90],
  [-20, 8.5, 31.0, 11.0, 0.42, 0.50, 0.88],
  [12, 6.0, 22.0, 11.0, 0.40, 0.46, 0.94],
], { label: 'ardent bridge' });
const FG_BRIDGE_X = -3.5;

/**
 * THE SPONSON, and it is the class.
 *
 * A 96 m mass standing 20 m OUTBOARD OF THE HULL'S OWN FLANK on three open trusses,
 * so in plan the ship is a cross with two clear bays of open sky inside each arm of
 * it, and from the beam it is a long flat shelf with daylight under it. Its centre is
 * at x = 40 against a shoulder half-beam of 22: the sponsons stand further outboard
 * than the hull is wide, which is the proportion that makes the plan view a CROSS
 * rather than a hull with blisters.
 *
 * It is authored in SHIP z so a plate, a frame or a light strip on it lands where the
 * table says it does, and placed outboard at `B.add` time.
 */
const FG_SPONSON = new Mass([
  [-40, 12.0, 7.0, -7.0, 0.50, 0.62, 0.88],
  [-10, 13.0, 8.0, -7.0, 0.47, 0.58, 0.86],
  [22, 12.4, 7.0, -7.4, 0.45, 0.55, 0.86],
  [56, 8.0, 3.0, -6.0, 0.42, 0.46, 1.00],
], { label: 'ardent sponson' });
const FG_SPONSON_X = 40.0;

/** The gun house standing on the shelf. Same plate family, one size down. */
const FG_GUNHOUSE = new Mass([
  [-15, 6.5, 3.0, -3.5, 0.48, 0.58, 0.90],
  [12, 7.5, 3.6, -3.6, 0.45, 0.55, 0.88],
  [39, 6.0, 2.6, -3.4, 0.42, 0.50, 0.94],
], { label: 'ardent gun house' });

function frigateParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    // Far LOD: the four masses and the cross, and nothing else. Authored INWARD
    // from the LOD0 silhouette by naming the stations that ARE the silhouette -
    // the waist, the shoulder, the chine break and both prow stations.
    B.add('core', 'hull', FG_HULL.loft({ lod, at: [-72, 10, 72, 92] }));
    B.add('core', 'hull', FG_ENGINE.loft({ lod, capFront: false }));
    for (const s of [-1, 1]) {
      B.add('core', 'hull', FG_SPONSON.loft({ lod, at: [-10] }), { pos: [s * FG_SPONSON_X, 3, 0] });
      // The truss gap survives: two stubs, not a solid fillet. The hole inside the
      // arm of the cross is the class read and it is the last thing to go.
      for (const dz of [-30, 34]) {
        B.add('core', 'hull', G.hexStrut({ length: 20, radius: 3.4, axis: 'x', detail: D }),
          { pos: [s * 20, 3, dz], rot: [0, s > 0 ? 0 : PI, 0] });
      }
    }
    B.add('core', 'hull', FG_BRIDGE.loft({ lod }), { pos: [FG_BRIDGE_X, 0, 0] });
    return { buckets: B.list() };
  }

  // --- 1. spine + chisel prow ----------------------------------------------
  B.add('core', 'hull', full ? FG_HULL.loft({ capBack: false })
    : FG_HULL.loft({ at: [-72, 10, 48, 72, 92], capBack: false }));
  if (full) {
    // Prow chevrons - the only paint forward of the bridge, and they RUN ALONG the
    // deck chamfer rather than across a flat (§4a: an accent follows an edge). This
    // is a `Mass#plate`, so it is on the skin at every station by construction.
    for (const s of [-1, 1]) {
      B.add('core', 'trim', FG_HULL.plate({
        z0: 52, z1: 96, side: s, facet: FACET.deckChamfer, t0: 0.30, t1: 0.44, drift: 0.28, out: 0.35,
      }));
    }
  }

  // --- 2. THE SPONSONS ON OPEN TRUSSES. The class read. --------------------
  for (const s of [-1, 1]) {
    B.add('core', 'hull', FG_SPONSON.loft(full ? {} : { at: [-10, 22] }),
      { pos: [s * FG_SPONSON_X, 3.0, 0] });
    // THREE TRUSSES AT UNEVEN SPACING, not a fillet. The two bays between them are
    // 35 m and 33 m of clear sky on a 96 m shelf, so a third of each arm of the
    // cross is background - which is the reason the class does not read as a fat
    // hull, and the reason the Bulwark (whose flanks are unbroken) cannot borrow it.
    for (const dz of full ? [-34, 40] : [-30, 34]) {
      B.add('core', 'greeble', G.hexStrut({ length: 20, radius: 2.6, axis: 'x', detail: D }),
        { pos: [s * 20, 1.0, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
    // Gun house on top of the shelf, then barrels out through the outboard face.
    B.add('core', 'dark', FG_GUNHOUSE.loft(), { pos: [s * FG_SPONSON_X, 13.0, 0] });
    for (const dz of full ? [-10, 30] : [12]) {
      B.add('core', 'greeble', G.pipeRun({
        length: 16, radius: 2.1, sides: 6, axis: 'x', detail: D,
      }), { pos: [s * (FG_SPONSON_X + 8), 5.0, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
    // The shelf gets the hull's own frame rhythm, taken from the SHIP's 210 m and not
    // from its own 96, so it does not wear a rhythm that lies about the size of it.
    if (D >= G.DETAIL.MID) {
      B.add('core', 'plating', FG_SPONSON.frames(
        FG_SPONSON.frameStations({ length: 210, count: 2, from: -34, to: 26 }), { detail: D },
      ), { pos: [s * FG_SPONSON_X, 3.0, 0] });
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
  // The deck plating over the WAIST simply is not there: beams where a hull would
  // be. Coalition ships are never finished, and the sheer already dips underneath.
  B.add('core', 'dark', beamRun({
    count: full ? 3 : 2, spacing: 11, span: 30, height: 7, thickness: 2.4, detail: D,
  }), { pos: [0, 10, -70] });

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
    // Conduit trunk along the PORT flank only, where a fitter can reach it, and a
    // trench under it that it visibly runs out of.
    B.add('core', 'greeble', G.pipeRun({
      length: 58, radius: 2.2, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-22.5, 6.0, -50] });
    B.add('core', 'greeble', FG_HULL.intake({
      z0: -90, z1: -20, side: -1, facet: FACET.upperFlank, t0: 0.30, t1: 0.58, depth: 1.3,
    }));
    // Boat bay, starboard only.
    B.add('core', 'greeble', FG_HULL.recess({
      z: -8, side: 1, facet: FACET.upperFlank, t: 0.5, width: 15, height: 6.0, depth: 2.6, wall: 0.7, detail: D,
    }));
    // Ventral tow cradle: this navy salvages its own dead.
    B.add('core', 'dark', beamRun({
      count: 3, spacing: 22, span: 26, height: 5, thickness: 3.0, cant: 0.18, detail: D,
    }), { pos: [0, -16, -6] });
  }

  // --- 6. the faction surface pass, and the running lights ------------------
  platePass(B, FG_HULL, {
    length: 210,
    frames: { count: 3, from: -92, to: -14 },
    belt: [-88, 30], beltOut: 0.9, plates: 3, taper: 0.24,
    lights: [-92, 88], lightWidth: 2.0, detail: D, full,
  });

  return { buckets: B.list() };
}

// ===========================================================================
// MONITOR — "Sledge", 420 m.  A GUN WITH A RAFT UNDER IT.
// ===========================================================================

/**
 * This is a WEAPON WITH A HULL UNDER IT, and it is the only capital ship in either
 * navy whose largest single mass is its gun.
 *
 * The read, in the order the eye gets it:
 *   1. The hull is FLAT. It carries the highest beam:depth in the fleet - 1.82 at its
 *      worst station and 2.08 mean, against the cruiser's 1.96/2.27 - so from the
 *      beam it is a plank, and the gun house standing on it is the only tall thing
 *      for a kilometre.
 *   2. The gun house is 50 m of section standing on a deck at +15, and the barrels
 *      are 190 m long, so 110 m of barrel hangs past the stem. The ship visibly
 *      cannot get out of its own way.
 *   3. The whole after half is an OPEN MACHINERY GALLERY: four bells on an exposed
 *      frame with sky between them and the deck, radiators cantilevered off it,
 *      and the conduit runs on the outside. The stern is a skeleton.
 */
const MN_HULL = new Mass([
  [-150, 23, 9, -13, 0.53, 0.64, 0.86],
  [-134, 20.5, 7.5, -11.5, 0.53, 0.63, 0.87],
  [-118, 18, 6, -10, 0.52, 0.62, 0.88],       // THE WAIST
  [-80, 24, 9.5, -12.5, 0.50, 0.60, 0.86],
  [-40, 30, 13, -15, 0.49, 0.58, 0.84],
  [4, 34.5, 14.2, -16.8, 0.47, 0.56, 0.82],
  [46, 38, 15, -18, 0.46, 0.55, 0.80],        // THE SHOULDER, under the gun
  [76, 34.4, 13.8, -20.8, 0.44, 0.52, 0.86],
  [98, 30, 11, -20, 0.43, 0.50, 0.92],
  [128, 20, 4, -18, 0.38, 0.44, 1.08],
  [150, 8, -5, -13, 0.34, 0.36, 1.00],
], { label: 'sledge' });

const MN_GUN_Z = 42;
const MN_GUN_Y = 64;
const MN_RAIL_X = 40;

/**
 * THE GUN HOUSE, and the reason it is 92 m of its own station table rather than a
 * `panelledSlab`.
 *
 * Measured with both hulls normalised to 200 m, monitor against destroyer is the
 * closest pair in the game at 10.2 m of mean outline divergence against a 10.0 m bar.
 * The class idea is right and the geometry has to commit to it: 50 m of house with
 * its roof at y +92 on a hull whose deck is at +15 makes the gun five times the
 * freeboard, and the gallery rails at x +-48.5 put the after third of the ship WIDER
 * than the hull it is bolted to. In plan the Sledge is an H and the Bulwark is a bar;
 * in profile the Sledge is a tower on a plank.
 *
 * It is cut from the same twelve-point section as the raft under it, which is what
 * stops it reading as a shipping container someone left on the foredeck.
 */
const MN_GUN_HOUSE = new Mass([
  [-46, 33, 19, -21, 0.50, 0.60, 0.90],
  [-30, 37, 22.5, -23.5, 0.49, 0.58, 0.89],
  [-14, 40.5, 25, -25, 0.47, 0.56, 0.88],
  [6, 40.8, 24.6, -25.2, 0.46, 0.55, 0.88],
  [20, 40, 24, -25, 0.45, 0.54, 0.88],
  [46, 30, 15, -21, 0.42, 0.48, 0.94],
], { label: 'sledge gun house' });

/** The mantlet: a stepped mass on the front face, so the house is not one prism. */
const MN_MANTLET = new Mass([
  [-13, 26, 15, -15, 0.48, 0.56, 0.90],
  [13, 22, 12, -13, 0.44, 0.50, 0.94],
], { label: 'sledge mantlet' });

/**
 * A GALLERY RAIL. Two of them carry the whole after half of the ship and the bells
 * hang between them with sky above and below.
 *
 * EXEMPT FROM BEAM:DEPTH WITH THE REASON: a rail is a longitudinal beam, not a hull
 * section. It is 17 m wide over 26 m of depth because the GAP BETWEEN THE RAILS is
 * the class - widen it to 1.6 and the gallery closes up into a stern block, which is
 * the Bulwark's shape and the pair this class is closest to.
 */
const MN_RAIL = new Mass([
  [-162, 7.5, 8, -14, 0.50, 0.60, 0.90],
  [-140, 8.2, 10, -15, 0.49, 0.58, 0.89],
  [-120, 8.5, 11, -15, 0.48, 0.56, 0.88],
  [-92, 8.0, 10.4, -14.2, 0.47, 0.54, 0.89],
  [-60, 7.0, 9, -13, 0.46, 0.52, 0.90],
  [-30, 5.0, 5, -10, 0.44, 0.48, 0.96],
], { label: 'sledge rail', exempt: 'a gallery rail is a longitudinal beam; the gap between the rails is the class' });

/** The low after deckhouse, offset to starboard. */
const MN_HOUSE = new Mass([
  [-131, 13, 25, 8, 0.48, 0.58, 0.90],
  [-108, 14, 26, 8, 0.45, 0.54, 0.88],
  [-85, 11, 23, 9, 0.42, 0.50, 0.92],
], { label: 'sledge deckhouse' });

function monitorParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    B.add('core', 'hull', MN_HULL.loft({ lod, at: [-118, 46, 128] }));
    // The gun house and the barrels ARE the class, so they are what the far LOD
    // spends its triangles on.
    B.add('core', 'hull', MN_GUN_HOUSE.loft({ lod, at: [-14, 20] }), { pos: [0, MN_GUN_Y, MN_GUN_Z] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.pipeRun({ length: 190, radius: 6.5, sides: 4, axis: 'z', detail: D }),
        { pos: [s * 15, MN_GUN_Y + 4, 70] });
      // The open stern frame: two rails with the bells between them.
      B.add('core', 'hull', MN_RAIL.loft({ lod, at: [-120] }), { pos: [s * MN_RAIL_X, -6, 0] });
    }
    return { buckets: B.list() };
  }

  // --- 1. the raft ---------------------------------------------------------
  B.add('core', 'hull', full ? MN_HULL.loft({ capBack: false })
    : MN_HULL.loft({ at: [-118, 46, 98, 128], capBack: false }));

  // --- 2. THE GUN. Barbette, house, two 190 m barrels. ---------------------
  B.add('core', 'dark', G.pipeRun({ length: 26, radius: 30, sides: 8, axis: 'y', caps: false, detail: D }),
    { pos: [0, 12, MN_GUN_Z] });
  B.add('core', 'hull', MN_GUN_HOUSE.loft(full ? {} : { at: [-14, 20] }),
    { pos: [0, MN_GUN_Y, MN_GUN_Z] });
  B.add('core', 'plating', MN_MANTLET.loft(), { pos: [0, MN_GUN_Y + 2, MN_GUN_Z + 56] });
  if (D >= G.DETAIL.MID) {
    B.add('core', 'plating', MN_GUN_HOUSE.frames(
      MN_GUN_HOUSE.frameStations({ length: 420, count: 3, from: -40, to: 34 }), { detail: D },
    ), { pos: [0, MN_GUN_Y, MN_GUN_Z] });
  }
  if (full) {
    for (const side of [-1, 1]) {
      B.add('core', 'dark', MN_GUN_HOUSE.belt({
        z0: -42, z1: 40, plates: 3, taper: 0.18, side, out: 1.2, facet: FACET.lowerFlank,
      }), { pos: [0, MN_GUN_Y, MN_GUN_Z] });
    }
  }
  for (const s of [-1, 1]) {
    // ROLLED 9 DEGREES. `pipeRun` builds a flat-topped hex, which puts two of its
    // six flats exactly on +-X: on a 190 m barrel that is 4,940 m2 of dead-square
    // surface, 3.2% of the whole ship, for free. A barrel's flats have no reason to
    // be square to the world and rolling them costs nothing.
    B.add('core', 'greeble', G.pipeRun({
      length: 190, radius: 6.5, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D,
    }), { pos: [s * 15, MN_GUN_Y + 4, 70], rot: [0, 0, s * 0.16] });
    // The muzzle brake, and it is deliberately fat: 110 m of barrel hanging past the
    // stem with a 25 m ring on the end of it is the one thing on this class that is
    // in the frame when nothing else is, and it is what the Anvil - the only other
    // hull in the navy with a bow that far from its own hull - has nothing like.
    B.add('core', 'dark', G.pipeRun({ length: 16, radius: 12.5, sides: 6, axis: 'z', caps: false, detail: D }),
      { pos: [s * 15, MN_GUN_Y + 4, 244], rot: [0, 0, s * 0.16] });
  }
  if (full) {
    // Recoil rails down the sides of the house, and the one stripe of paint on it -
    // a plate lying on the house's own deck chamfer, so it wraps the roof edge.
    for (const s of [-1, 1]) {
      B.add('core', 'trim', MN_GUN_HOUSE.plate({
        z0: -34, z1: 34, side: s, facet: FACET.deckChamfer, t0: 0.34, t1: 0.47, out: 0.6,
      }), { pos: [0, MN_GUN_Y, MN_GUN_Z] });
      B.add('core', 'greeble', G.hexStrut({ length: 64, radius: 3.0, axis: 'z', detail: D }),
        { pos: [s * 36, MN_GUN_Y - 18, MN_GUN_Z - 26] });
    }
    // Ammunition hoists: two apertures in the house's port flank, unequal, not mirrored.
    for (const z of [-24, 16]) {
      B.add('core', 'greeble', MN_GUN_HOUSE.recess({
        z, side: -1, facet: FACET.upperFlank, t: 0.5, width: 16, height: 9, depth: 4, wall: 1.2, detail: D,
      }), { pos: [0, MN_GUN_Y, MN_GUN_Z] });
    }
  }

  // --- 3. the low deckhouse, right aft, offset to starboard ----------------
  B.add('core', 'hull', MN_HOUSE.loft(), { pos: [5, 0, 0] });
  if (full) {
    B.add('core', 'emissive', glowSlot(18, 2.2), { pos: [5, 26, -85.6] });
  }
  // THE MAST STANDS ON THE GUN HOUSE, not on the after deckhouse. Aft of the barbette
  // this class is meant to be a bare skeleton, and a 30 m mast back there was the
  // tallest thing over the whole after half - which put the Sledge's profile within
  // two pixels of the Bulwark's exactly where the two are supposed to be least alike.
  // Amidships it also does what a director should do: it sits over the gun.
  B.add('core', 'greeble', G.antennaMast({
    height: 30, radius: 2.0, tipRadius: 1.0, spars: full ? 2 : 1, sparSpan: 10, detail: D,
  }), { pos: [4, MN_GUN_Y + 26, MN_GUN_Z - 30] });

  // --- 4. THE OPEN MACHINERY GALLERY. The stern is a skeleton. -------------
  for (const s of [-1, 1]) {
    B.add('engine', 'hull', MN_RAIL.loft(), { pos: [s * MN_RAIL_X, -6, 0] });
  }
  for (const [x, y] of full ? [[-13, 12], [13, 12], [-13, -8], [13, -8]] : [[-13, 4], [13, 4]]) {
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 6.5, mouth: 10, length: 20, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
    }), { pos: [x, y, -136] });
    B.add('engine', 'engineGlow', glowDisc(9.4, 8), { pos: [x, y, -157], rot: [0, PI, 0] });
  }
  if (full) {
    // Cross-braces between the rails, three of them, unevenly spaced and rolled off
    // the axis so the gallery reads as fitted rather than extruded.
    B.add('engine', 'greeble', beamRun({
      count: 3, spacing: 42, span: 62, height: 6, thickness: 5, cant: 0.16, detail: D,
    }), { pos: [0, 20, -100] });
    // Conduit trunk on the OUTSIDE of the port rail.
    B.add('engine', 'greeble', G.pipeRun({
      length: 118, radius: 3.4, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-49, 2, -152], rot: [0, 0, 0.19] });
  }
  // RADIATORS CANTILEVERED DOWNWARD off the gallery, two port one starboard, all
  // different. Downward is a separation decision as well as a plausible one: every
  // other Coalition capital carries its fins on top of an engine block, and "long
  // low hull, engine block with swept fins" is the description that collapsed the
  // Ardent against the Bulwark once already. Hung under an open frame they also put
  // the class's whole after body BELOW the axis against a gun house 92 m above it,
  // which is the profile the name is about.
  for (const [s, z, chord, span] of full
    ? [[-1, -140, 34, 46], [-1, -112, 24, 31], [1, -126, 29, 38]]
    : [[-1, -130, 32, 42], [1, -110, 24, 30]]) {
    B.add('engine', 'plating', G.radiatorFin({
      chord, span, thickness: 2.2, sweep: -chord * 0.38, tipChord: chord * 0.62, rim: 2.4, detail: D,
    }), { pos: [s * 46, -20, z], rot: [0, 0, PI - s * 0.34] });
  }

  // --- 5. field-repair vocabulary and the surface pass ----------------------
  if (full) {
    // The forward flanks are the class's CALM RESERVE: one trench and nothing else,
    // because the gun house is what the eye is meant to be reading up there.
    B.add('core', 'greeble', MN_HULL.intake({
      z0: -60, z1: 96, side: -1, facet: FACET.upperFlank, t0: 0.34, t1: 0.60, depth: 2.2,
    }));
    for (const s of [-1, 1]) {
      B.add('core', 'trim', MN_HULL.plate({
        z0: 104, z1: 142, side: s, facet: FACET.deckChamfer, t0: 0.30, t1: 0.44, drift: 0.26, out: 0.7,
      }));
    }
  }
  platePass(B, MN_HULL, {
    length: 420,
    frames: { count: 4, from: -140, to: 20 },
    belt: [-130, 90], beltOut: 1.8, plates: 4, taper: 0.22,
    lights: [-144, 132], lightWidth: 2.6, detail: D, full,
  });

  return { buckets: B.list() };
}

// ===========================================================================
// DESTROYER — "Bulwark", 480 m. The salvage prize.
// ===========================================================================

const DD_FORE = new Mass([
  [40, 40, 22, -24, 0.50, 0.58, 0.84],
  [96, 43, 25, -26, 0.47, 0.55, 0.80],
  [160, 36, 19, -25, 0.43, 0.50, 0.86],
  [200, 27, 12, -21, 0.38, 0.44, 1.06],
  [240, 11, -6, -18, 0.34, 0.34, 1.00],
], { label: 'bulwark fore' });

const DD_AFT = new Mass([
  [-200, 35, 19, -21, 0.52, 0.60, 0.86],
  [-150, 42, 24, -24, 0.50, 0.57, 0.82],
  [-90, 39, 22, -23, 0.48, 0.55, 0.80],
  [-40, 35, 19, -21, 0.47, 0.54, 0.80],
], { label: 'bulwark aft' });

/** Stern block, wider than either hull section. */
const DD_ENGINE = new Mass([
  [-250, 48, 28, -32, 0.53, 0.64, 0.88],
  [-232, 52, 31, -34, 0.52, 0.62, 0.88],
  [-196, 38, 23, -26, 0.50, 0.58, 0.84],
], { label: 'bulwark stern' });

/**
 * Forward citadel: three stepped decks, offset 5 m to port.
 *
 * EXEMPT FROM BEAM:DEPTH WITH THE REASON: a citadel is a superstructure tower
 * standing ON a hull, not a hull section. It is 40 m wide over 52 m of deckhouse
 * because that is what makes the Bulwark's profile two tall blocks with a hole
 * between them; the HULL underneath it holds 1.64 at its worst station.
 */
const DD_CITADEL_X = -5;
const DD_CITADEL = new Mass([
  [46, 18, 72, 24, 0.46, 0.54, 0.90],
  [80, 20, 76, 24, 0.44, 0.52, 0.88],
  [112, 16, 56, 24, 0.42, 0.48, 0.92],
  [128, 9, 44, 26, 0.40, 0.42, 0.96],
], { label: 'bulwark citadel', exempt: 'a citadel is a superstructure tower standing on the hull, not a hull section' });

/** The aft deckhouse. One blockhouse is a frigate; two, with a hole between them... */
const DD_HOUSE = new Mass([
  [-167, 14, 46, 22, 0.48, 0.58, 0.90],
  [-128, 15, 48, 21, 0.45, 0.54, 0.88],
  [-89, 12, 43, 23, 0.42, 0.50, 0.92],
], { label: 'bulwark deckhouse' });

/**
 * THE CHIN. A ventral armour ram that hangs below the keel forward of the citadel.
 * From the beam this class is otherwise a long low hull with two deckhouses, which is
 * a frigate with more of everything; the hook under the bow is the one line that
 * cannot be mistaken for the Ardent at any distance.
 */
const DD_CHIN = new Mass([
  [96, 20, -14, -38, 0.52, 0.64, 0.90],
  [140, 20, -20, -42, 0.48, 0.58, 0.92],
  [186, 15, -28, -46, 0.44, 0.50, 0.98],
  [222, 11.5, -38, -52, 0.38, 0.42, 1.00],
  [238, 8.2, -50, -60, 0.34, 0.36, 1.00],
], { label: 'bulwark chin' });

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
 * aft one; everything between them is missing. So in plan there are two slots with a
 * reactor drum sitting in the middle of them, and in profile the top of the ship
 * drops for eighty metres and then climbs again.
 *
 * EXEMPT FROM BEAM:DEPTH WITH THE REASON: these are the ship's sides continuing
 * through a hole, so they are as narrow as a side wall and as deep as the hull.
 * Widening them to 1.6 would close the hole, and the hole is the class.
 */
const DD_WAIST_X = 33.5;
const DD_WAIST = new Mass([
  [-48, 4.5, 0, -28, 0.50, 0.58, 0.90],
  [0, 5.2, 2, -30, 0.47, 0.54, 0.88],
  [48, 4.5, 0, -28, 0.44, 0.50, 0.92],
], { label: 'bulwark waist keel', exempt: 'the waist keels are the ship\'s side walls carried through a hole; widening them closes it' });
const DD_REACTOR_Z = 0;

/** A dorsal turret house. Same plate family as the ship it stands on. */
const DD_TURRET_HOUSE = new Mass([
  [-14, 11, 6, -6, 0.48, 0.58, 0.90],
  [2, 12, 7, -6, 0.45, 0.54, 0.88],
  [14, 10, 5, -5.5, 0.42, 0.50, 0.92],
], { label: 'bulwark turret' });

/** A dorsal turret: barbette, house, two barrels. The one gun shape this navy has. */
function dorsalTurret(B, x, y, z, D, full) {
  B.add('core', 'dark', G.mountPad({ radius: 15, height: 4, sides: 8, detail: D }), { pos: [x, y, z] });
  if (full) {
    B.add('core', 'trim', G.dockingCollar({ radius: 12, innerRadius: 8, depth: 2.5, sides: 8, detail: D }),
      { pos: [x, y + 4, z], rot: [-HALF_PI, 0, 0] });
  }
  B.add('core', 'plating', DD_TURRET_HOUSE.loft(), { pos: [x, y + 11, z - 2] });
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
    B.add('core', 'hull', DD_FORE.loft({ lod, at: [96, 200] }));
    B.add('core', 'hull', DD_AFT.loft({ lod, at: [-150] }));
    B.add('core', 'hull', DD_ENGINE.loft({ lod, capFront: false }));
    B.add('core', 'hull', DD_CITADEL.loft({ lod, at: [80] }), { pos: [DD_CITADEL_X, 0, 0] });
    B.add('core', 'hull', DD_CHIN.loft({ lod, at: [186] }));
    // The waist keels: the hole through the middle survives to the far LOD,
    // because that hole IS the class.
    for (const s of [-1, 1]) {
      B.add('core', 'hull', DD_WAIST.loft({ lod }), { pos: [s * DD_WAIST_X, -14, 0] });
    }
    B.add('core', 'hull', G.pipeRun({ length: 70, radius: 15, sides: 6, axis: 'z', detail: D }),
      { pos: [0, -6, -35] });
    // The gantry beam over the waist. The hole and the thing bridging it are the
    // class, so both survive to the far LOD.
    B.add('core', 'hull', G.bevelBox({
      width: 13, height: 7, depth: 108, chamfer: 2.4, draft: 2, cant: 0.12, detail: D,
    }), { pos: [0, 77, 0] });
    B.add('core', 'hull', DD_HOUSE.loft({ lod, at: [-128] }), { pos: [DD_CITADEL_X, 0, 0] });
    return { buckets: B.list() };
  }

  // --- 1. forward citadel section ------------------------------------------
  B.add('core', 'hull', full ? DD_FORE.loft({ capBack: false })
    : DD_FORE.loft({ at: [96, 160, 200], capBack: false }));
  B.add('core', 'plating', DD_CHIN.loft(full ? {} : { at: [140, 222] }));
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'trim', DD_FORE.plate({
        z0: 150, z1: 224, side: s, facet: FACET.deckChamfer, t0: 0.30, t1: 0.44, drift: 0.28, out: 0.9,
      }));
    }
  }

  B.add('core', 'hull', DD_CITADEL.loft({ capBack: false }), { pos: [DD_CITADEL_X, 0, 0] });
  if (D >= G.DETAIL.MID) {
    B.add('core', 'plating', DD_CITADEL.frames(
      DD_CITADEL.frameStations({ length: 480, count: 2, from: 52, to: 122 }), { detail: D },
    ), { pos: [DD_CITADEL_X, 0, 0] });
  }
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
    B.add('core', 'hull', DD_WAIST.loft(), { pos: [s * DD_WAIST_X, -14, 0] });
  }
  // Four thin transverse beams across the top of the hole. They tell the eye it
  // is looking INTO a structure; any more of them and the hole closes up again.
  B.add('core', 'dark', beamRun({
    count: full ? 4 : 2, spacing: 24, span: 64, height: 5, thickness: 4, cant: 0.15, detail: D,
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
    B.add('core', 'dark', G.bevelBox({
      width: 13, height: 7, depth: GZ * 2 + 14, chamfer: 2.4, draft: 2, cant: 0.12, detail: D,
    }), { pos: [0, GTOP + 3, 0] });
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
  }), { pos: [0, -6, DD_REACTOR_Z - 33], rot: [0, 0, 0.2] });
  B.add('core', 'emissive', G.pipeRun({
    length: 5, radius: 16.4, sides: 8, axis: 'z', caps: false, detail: D,
  }), { pos: [0, -6, DD_REACTOR_Z - 2.5], rot: [0, 0, 0.2] });
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'greeble', G.cappedConduit({ length: 14, radius: 3.4, sides: 6, axis: 'x', detail: D }),
        { pos: [s * 15, -6, DD_REACTOR_Z - 24], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }

  // --- 3. aft hull, aft deckhouse, RECESSED casemates, hangar --------------
  B.add('core', 'hull', full ? DD_AFT.loft({ capFront: false, capBack: false })
    : DD_AFT.loft({ at: [-150, -90], capFront: false, capBack: false }));
  // A SECOND deckhouse. One blockhouse is a frigate; two, separated by a hole in
  // the ship, is a destroyer, and that is true from four kilometres out.
  B.add('core', 'hull', DD_HOUSE.loft(), { pos: [DD_CITADEL_X, 0, 0] });
  if (full) {
    B.add('core', 'dark', G.bevelBox({
      width: 20, height: 10, depth: 40, chamfer: 3, draft: 2.4, cant: 0.10, rake: 3, detail: D,
    }), { pos: [DD_CITADEL_X, 56, -140] });
  }

  // Two turrets. The forward one sits ahead of the citadel; the aft one sits on
  // the aft deck and fires forward THROUGH the waist, so the hole in the ship is
  // something the guns visibly use rather than a hole for its own sake.
  dorsalTurret(B, DD_CITADEL_X, 20, DD_TURRETS[0], D, full);
  dorsalTurret(B, DD_CITADEL_X, 21, DD_TURRETS[1], D, full);

  // THE BROADSIDE IS RECESSED, NOT BOXED.
  //
  // It used to be two 15 x 15 x 74 m boxes standing off the flanks, which put a
  // pair of wings on the plan outline at exactly the place the Ardent has its
  // sponsons - so both classes read as a cross from above and the pair collapsed.
  // The guns now live in a casemate CUT INTO the flank along the facet's own outward
  // normal, so the plan outline stays a clean bar with a hole in the middle.
  for (const s of [-1, 1]) {
    B.add('core', 'dark', DD_AFT.recess({
      z: -128, side: s, facet: FACET.upperFlank, t: 0.5,
      width: 74, height: 17, depth: 11, wall: 3.5, detail: D,
    }));
    for (const dz of full ? [-156, -128, -100] : [-128]) {
      B.add('core', 'greeble', G.pipeRun({
        length: 15, radius: 2.6, sides: 6, axis: 'x', detail: D,
      }), { pos: [s * 38, 3, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }
  // Hangar: a real opening in the ventral aft hull, cut down the keel facet's normal.
  B.add('core', 'dark', DD_AFT.recess({
    z: -110, side: 1, facet: FACET.keel, t: 0.5,
    width: 44, height: 26, depth: 9, wall: 3, detail: D,
  }));
  if (full) {
    B.add('core', 'greeble', beamRun({
      count: 3, spacing: 14, span: 40, height: 4, thickness: 3, cant: 0.2, detail: D,
    }), { pos: [0, -22, -110] });
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

  // --- 5. field-repair vocabulary and the surface pass ----------------------
  if (full) {
    B.add('core', 'greeble', G.pipeRun({
      length: 120, radius: 4.0, sides: 6, axis: 'z', flanges: 2, detail: D,
    }), { pos: [-41, 12, -178], rot: [0, 0, 0.19] });
    // Two trenches, and they are on DIFFERENT sides of two different masses.
    B.add('core', 'greeble', DD_FORE.intake({
      z0: 52, z1: 190, side: -1, facet: FACET.upperFlank, t0: 0.32, t1: 0.58, depth: 2.4,
    }));
    B.add('core', 'greeble', DD_AFT.intake({
      z0: -190, z1: -60, side: 1, facet: FACET.lowerFlank, t0: 0.30, t1: 0.52, depth: 2.4,
    }));
  }
  platePass(B, DD_FORE, {
    length: 480,
    frames: { count: 3, from: 44, to: 190 },
    belt: [52, 200], beltOut: 2.0, plates: 3, taper: 0.26,
    lights: [46, 220], lightWidth: 3.2, detail: D, full,
  });
  platePass(B, DD_AFT, {
    length: 480,
    frames: { count: 3, from: -196, to: -50 },
    belt: [-192, -50], beltOut: 2.0, plates: 4, taper: 0.20,
    lights: [-196, -44], lightWidth: 3.2, detail: D, full,
  });

  return { buckets: B.list() };
}

// ===========================================================================
// CARRIER — "Anvil", 900 m.  THE CANYON.
// ===========================================================================

/**
 * THE CLASS READ IS A HOLE 560 METRES LONG.
 *
 * Two separate side hulls, 166 m apart, joined by a flight deck underneath and by
 * exactly TWO transverse bridges over the top. Everything between them is open sky:
 * the slot is open at the bow, open at the stern, and open upward for 400 of its
 * 560 m. Strike craft fly IN at the stern and OUT at the bow, and from the beam you
 * can see straight through the middle of a 900 m ship.
 *
 * THE SIDE HULLS ARE FLAT NOW, AND THAT WAS THE WHOLE DEFECT. They were 68 m wide
 * over 90 m of depth - a beam:depth of 0.76, i.e. two towers - and the class measured
 * 67.3% axis-aligned, the worst capital in the game, reading as a flat slab with a
 * notch in it. They run 60-90 m of beam over 32-53 m of depth now: 1.70 at the worst
 * station and 1.81 mean, the flattest capital section in the Coalition after the
 * Sledge. The ship is TALL because the island and the drive towers are tall, and
 * those are structures standing on it rather than the hull pretending to be one.
 *
 * Coalition to the last rivet: the engines are not in the hull, they are two TOWERS
 * standing 85 m outboard on lattice pylons with sky all round them, and the flight
 * deck's landing lights and catapult rails are on the outside of everything.
 */
const CR_SIDE = new Mass([
  [-450, 39, 20, -24, 0.53, 0.64, 0.86],
  [-330, 35, 18, -21, 0.52, 0.62, 0.86],
  [-300, 30, 17, -15, 0.50, 0.58, 0.88],    // THE WAIST
  [-120, 40, 25, -22, 0.48, 0.56, 0.82],
  [0, 45, 28, -25, 0.46, 0.54, 0.80],       // THE SHOULDER
  [90, 43, 26, -23, 0.45, 0.52, 0.82],
  [250, 36, 20, -22, 0.42, 0.50, 0.92],
  [350, 28, 13, -19, 0.38, 0.44, 1.10],
  [450, 9, -20, -28, 0.34, 0.34, 1.00],
], { label: 'anvil side' });

/** Centreline of each side hull. Inner faces are 166 m apart: that is the canyon. */
const CR_SIDE_X = 128;
const CR_SLOT = { z0: -320, z1: 240, halfW: 83 };

/**
 * THE FLIGHT DECK, i.e. the canyon floor, and a mass in its own right rather than a
 * 250 x 26 x 420 m slab. Beam:depth 8.5-9.7, which is what a deck should be, and the
 * knuckle runs the whole length so the deck edge takes a rim light instead of being
 * the top of a rectangle.
 *
 * IT STOPS AT z = -170. A canyon with a floor in it is a trench, not a hole: with the
 * deck run the whole length of the slot the plan silhouette closed up solid and
 * nothing could be seen through the ship from any angle. The aft 150 m of the slot
 * has NO FLOOR, so there is a genuine 150 x 166 m through-hole - open to the sky,
 * open to the keel and open astern - and strike craft recover up through it.
 */
const CR_DECK = new Mass([
  [-170, 116, -14, -38, 0.50, 0.72, 0.92],
  [-60, 124, -12, -38, 0.48, 0.72, 0.90],
  [110, 122, -13, -39, 0.46, 0.70, 0.92],
  [250, 94, -18, -40, 0.44, 0.62, 1.00],
], { label: 'anvil deck' });

/** A bridge across the top of the slot. Two of them, at unequal z. */
const CR_BRIDGE = new Mass([
  [-27, 92, 12, -10, 0.50, 0.66, 0.92],
  [0, 95, 14, -11, 0.48, 0.64, 0.90],
  [27, 90, 11, -10, 0.46, 0.62, 0.92],
], { label: 'anvil bridge' });

/**
 * The island, port side. EXEMPT FROM BEAM:DEPTH WITH THE REASON: a carrier island is
 * a control tower - 46 m wide over 127 m of it - and the whole point of the class is
 * that it stands on a hull which is 1.73 flat underneath.
 */
const CR_ISLAND = new Mass([
  [-95, 20, 52, -60, 0.48, 0.56, 0.92],
  [-40, 23, 65, -62, 0.45, 0.52, 0.90],
  [40, 22, 58, -60, 0.43, 0.50, 0.90],
  [95, 16, 34, -54, 0.40, 0.44, 0.96],
], { label: 'anvil island', exempt: 'a carrier island is a control tower standing on the deck, not a hull section' });

/**
 * A drive tower. EXEMPT FROM BEAM:DEPTH WITH THE REASON: it is a 46 x 149 m tower
 * hanging in open space 85 m off the hull on two pylons, and the sky around it is
 * the Coalition thesis at 900 m.
 */
const CR_TOWER = new Mass([
  [-415, 21, 98, -40, 0.48, 0.56, 0.92],
  [-360, 23, 105, -44, 0.46, 0.54, 0.90],
  [-290, 22, 100, -42, 0.44, 0.52, 0.90],
  [-245, 17, 82, -30, 0.42, 0.46, 0.94],
], { label: 'anvil drive tower', exempt: 'a drive tower hangs off the hull on pylons; it is a tower, not a hull section' });
const CR_TOWER_X = 212;

function carrierParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  if (lod >= 2) {
    for (const s of [-1, 1]) {
      B.add('core', 'hull', CR_SIDE.loft({ lod, at: [-300, 0, 350] }), { pos: [s * CR_SIDE_X, 0, 0] });
      // Engine tower, outboard: the second-largest mass and the aft read.
      B.add('core', 'hull', CR_TOWER.loft({ lod, at: [-360] }), { pos: [s * CR_TOWER_X, 30, 0] });
    }
    // The flight deck floor. It is what makes the slot a canyon and not a gap
    // between two ships, so it survives to the far LOD with the slot.
    B.add('core', 'hull', CR_DECK.loft({ lod, at: [-60] }));
    // Island, port side, tall.
    B.add('core', 'hull', CR_ISLAND.loft({ lod, at: [-40] }), { pos: [-124, 110, -100] });
    // The two bridges over the canyon: without them the ship reads as a catamaran.
    for (const z of [-300, 210]) {
      B.add('core', 'hull', CR_BRIDGE.loft({ lod }), { pos: [0, 46, z] });
    }
    return { buckets: B.list() };
  }

  // --- 1. the two side hulls -----------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'hull', full ? CR_SIDE.loft({ capBack: false })
      : CR_SIDE.loft({ at: [-300, 0, 90, 250, 350], capBack: false }), { pos: [s * CR_SIDE_X, 0, 0] });
  }
  // Slab armour, OUTBOARD FACE ONLY, and it is the faction's own knob: four separate
  // plates with 40 m of sky between them, cut from the hull's own section so they lie
  // on the skin at every station. The inner faces are the canyon walls and they are
  // CALM RESERVE - nothing goes on them, because everything the player sees through
  // the slot is read against them.
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'dark', CR_SIDE.belt({
        z0: -260, z1: 200, plates: 4, taper: 0.22, side: s, out: 3.2, facet: FACET.lowerFlank,
      }), { pos: [s * CR_SIDE_X, 0, 0] });
    }
  }
  if (D >= G.DETAIL.MID) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', CR_SIDE.frames(
        CR_SIDE.frameStations({ length: 900, count: 4, from: -280, to: 160 }), { detail: D },
      ), { pos: [s * CR_SIDE_X, 0, 0] });
    }
  }

  // --- 2. THE FLIGHT DECK, i.e. the canyon floor ---------------------------
  B.add('core', 'hull', CR_DECK.loft(full ? {} : { at: [-60, 110] }));
  // Two transverse deck beams under the open section, so the hole is framed rather
  // than being a place where the model ran out. The gap between them is 96 m.
  B.add('core', 'plating', beamRun({
    count: 2, spacing: 110, span: 236, height: 20, thickness: 34, cant: 0.13, taper: 0.94, detail: D,
  }), { pos: [0, -44, -245] });
  // Catapult rails: two, unequal, and offset from the centreline so the deck is
  // not bilaterally symmetric. Rolled off the axis with everything else.
  if (full) {
    for (const [x, z, len, cant] of [[-40, 60, 360, 0.10], [46, 96, 280, -0.13]]) {
      B.add('core', 'trim', G.bevelBox({
        width: 7, height: 2.4, depth: len, chamfer: 0.9, draft: 0.8, cant, detail: D,
      }), { pos: [x, -28, z] });
    }
  }
  // The two bridges across the top of the slot. TWO, at unequal z, so the canyon
  // has three bays of different lengths (220 / 456 / 84 m) rather than a rhythm.
  for (const z of [-300, 210]) {
    B.add('core', 'hull', CR_BRIDGE.loft(), { pos: [0, 46, z] });
  }
  if (full) {
    // Deck framing visible in the canyon walls, and it is a TRENCH cut down the
    // inboard flank rather than ribs bolted onto it - the only place any surface
    // language is allowed inside the slot (§3, justification 2).
    for (const s of [-1, 1]) {
      B.add('core', 'greeble', CR_SIDE.intake({
        z0: -160, z1: 200, side: -s, facet: FACET.lowerFlank, t0: 0.30, t1: 0.62, depth: 5,
      }), { pos: [s * CR_SIDE_X, 0, 0] });
    }
    // Deck lighting down both canyon walls: the scale cue INSIDE the hole.
    for (const s of [-1, 1]) {
      B.add('core', 'engineGlow', glowSlot(420, 5),
        { pos: [s * (CR_SLOT.halfW - 3), -22, 40], rot: [0, s * HALF_PI, 0] });
    }
  }

  // --- 3. the island, PORT side only ---------------------------------------
  B.add('core', 'hull', CR_ISLAND.loft(), { pos: [-124, 110, -100] });
  if (D >= G.DETAIL.MID) {
    B.add('core', 'plating', CR_ISLAND.frames(
      CR_ISLAND.frameStations({ length: 900, count: 2, from: -80, to: 80 }), { detail: D },
    ), { pos: [-124, 110, -100] });
  }
  if (full) {
    B.add('core', 'emissive', glowSlot(70, 5), { pos: [-148, 150, -70], rot: [0, -HALF_PI, 0] });
    B.add('core', 'emissive', glowSlot(70, 5), { pos: [-148, 132, -70], rot: [0, -HALF_PI, 0] });
    for (const s of [-1, 1]) {
      B.add('core', 'trim', CR_ISLAND.plate({
        z0: -70, z1: 50, side: s, facet: FACET.deckChamfer, t0: 0.34, t1: 0.47, out: 1.2,
      }), { pos: [-124, 110, -100] });
    }
  }
  B.add('core', 'greeble', G.antennaMast({
    height: 96, radius: 5.0, tipRadius: 2.2, spars: full ? 3 : 1, sparSpan: 24, detail: D,
  }), { pos: [-124, 178, -60] });
  if (full) {
    B.add('core', 'greeble', G.sensorDish({ radius: 22, depth: 9, sides: 10, stub: 9, detail: D }),
      { pos: [-124, 288, -50], rot: [-0.5, 0, 0] });
  }

  // --- 4. THE ENGINE TOWERS, standing off on lattice pylons ----------------
  // Coalition to the last rivet: the drives are not in the hull. Each tower hangs
  // 85 m outboard on two hex pylons with open sky above, below and between them,
  // and each carries three bells in a vertical column. From astern the ship is two
  // towers of three circles with a 400 m gap in the middle.
  for (const s of [-1, 1]) {
    for (const y of [70, -20]) {
      B.add('engine', 'greeble', G.hexStrut({ length: 50, radius: 9, axis: 'x', detail: D }),
        { pos: [s * 164, y, -330], rot: [0, s > 0 ? 0 : PI, 0] });
    }
    B.add('engine', 'hull', CR_TOWER.loft(full ? {} : { at: [-360, -290] }),
      { pos: [s * CR_TOWER_X, 30, 0] });
    for (const y of full ? [88, 30, -28] : [58, -12]) {
      B.add('engine', 'greeble', G.thrusterBell({
        throat: 14, mouth: 21, length: 40, sides: 6, collar: false, inner: D >= G.DETAIL.MID, detail: D,
      }), { pos: [s * CR_TOWER_X, y, -408] });
      B.add('engine', 'engineGlow', glowDisc(20, 8), { pos: [s * CR_TOWER_X, y, -446], rot: [0, PI, 0] });
    }
    if (full) {
      // Fuel trunk from the tower back into the hull, on the OUTSIDE.
      B.add('engine', 'greeble', G.pipeRun({
        length: 210, radius: 8, sides: 6, axis: 'z', flanges: 2, detail: D,
      }), { pos: [s * 196, 104, -340], rot: [0, 0, s * 0.18] });
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
      B.add('core', 'dark', CR_SIDE.recess({
        z: dz, side: s, facet: FACET.upperFlank, t: 0.5,
        width: 58, height: 22, depth: 14, wall: 5, detail: D,
      }), { pos: [s * CR_SIDE_X, 0, 0] });
      B.add('core', 'greeble', G.pipeRun({ length: 22, radius: 3.4, sides: 6, axis: 'x', detail: D }),
        { pos: [s * 172, 14, dz], rot: [0, s > 0 ? 0 : PI, 0] });
    }
  }
  // Bow. Each side hull ends in its own chisel, so the forward view is a two-pronged
  // fork with the canyon mouth between the prongs. Painted, because this navy paints
  // exactly one thing, and the paint lies on the chamfer it is calling out.
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'trim', CR_SIDE.plate({
        z0: 300, z1: 430, side: s, facet: FACET.deckChamfer, t0: 0.30, t1: 0.44, drift: 0.28, out: 1.6,
      }), { pos: [s * CR_SIDE_X, 0, 0] });
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
// STRIKE CRAFT — "Bolt", 18 m
// ===========================================================================

/**
 * The worst hull in the game at 82.1% axis-aligned, on the class that has the fewest
 * triangles to hide it with: a `rectProfile` wedge, a `rectProfile` slab, two
 * `rectProfile` pods and a fin whose two large faces were exactly +-X. Every one of
 * those is now cut from the fleet's section, and the fin is CANTED - 13 degrees is
 * enough to take it out of the axis bin entirely and it reads as a fighter that was
 * built by the same yard as the carrier it launches from.
 */
const SC_HULL = new Mass([
  [-9.0, 1.9, 1.0, -1.2, 0.50, 0.60, 0.86],
  [-4.5, 2.2, 1.3, -1.3, 0.46, 0.55, 0.84],
  [0.5, 1.8, 1.2, -1.2, 0.42, 0.48, 0.88],
  [4.5, 1.2, 0.5, -1.1, 0.36, 0.40, 1.06],
  [9.0, 0.35, -0.9, -1.5, 0.34, 0.34, 1.00],
], { label: 'bolt' });

/** An engine pod. Two, slung outboard on stubs - the corvette's idea, one size down. */
const SC_POD = new Mass([
  [-8.2, 0.72, 0.72, -0.76, 0.48, 0.58, 0.88],
  [-2.0, 0.56, 0.52, -0.60, 0.44, 0.50, 0.92],
], { label: 'bolt pod' });

/**
 * THREE LEVELS, AND THIS CLASS SHIPPED ONE.
 *
 * An 18 m hull switches at 198 m and 756 m, so LOD1 and LOD2 are where a strike
 * craft spends nearly all of its screen time - a wing of them is the densest thing
 * in a fight and it was paying five draw calls each at every range. The cuts are by
 * SURFACE, because past LOD0 `buildShip` collapses damage groups and the draw count
 * IS the surface count: LOD1 drops the cannons and the pylon stubs (4 draws), LOD2
 * drops the canopy as well (3). Nothing that carries the class read - the tall
 * canted fin, the two outboard pods - is cut at any level.
 */
function strikeCraftParts({ lod = 0 } = {}) {
  const D = lod === 0 ? G.DETAIL.MID : G.DETAIL.FAR;
  const full = lod === 0;
  const B = new Buckets();

  // Fuselage: one loft of the fleet's own section, with the drooped chisel nose in
  // the table rather than bolted on. At 18 m the silhouette is all there is.
  B.add('core', 'hull', lod === 0 ? SC_HULL.loft() : SC_HULL.loft({ lod, at: [-4.5, 4.5] }));

  // THE FIN, and it is the class read. A 5.2 m single tail on a 2.5 m deep body:
  // taller than the fuselage it stands on, which is a thing no Concord hull does at
  // any size. Bolt / Whipcord / Shrike used to be three flat deltas separated only
  // by wing sweep and were genuinely unidentifiable on the silhouette sheet; the
  // three now differ in topology - solid body with a tall fin, hole in the tail,
  // forked nose - so each survives to three pixels. CANTED 13 degrees, which costs
  // nothing and is the difference between a plate and a plate square to the world.
  B.add('core', 'dark', G.radiatorFin({
    chord: 5.4, span: 5.2, thickness: 0.4, sweep: -1.6, tipChord: 2.4, rim: 0.35, detail: D,
  }), { pos: [0.15, 1.2, -7.4], rot: [0, 0.09, 0.23] });
  // Canopy, forward and offset - a Coalition pilot sits where the armour is thinnest.
  if (lod <= 1) B.add('core', 'emissive', glowSlot(2.0, 0.7), { pos: [0, 1.9, 2.6], rot: [-0.6, 0.12, 0] });
  for (const s of [-1, 1]) {
    B.add('core', 'dark', lod === 0 ? SC_POD.loft() : SC_POD.loft({ lod }), { pos: [s * 3.0, -0.3, 0] });
    B.add('core', 'engineGlow', glowDisc(0.8, 6), { pos: [s * 3.0, -0.3, -8.2], rot: [0, PI, 0] });
    if (full) {
      B.add('core', 'greeble', G.hexStrut({ length: 1.5, radius: 0.55, axis: 'x', detail: G.DETAIL.MID }),
        { pos: [s * 1.6, -0.3, -5.0], rot: [0, s > 0 ? 0 : PI, 0] });
      // Cannon under the nose.
      B.add('core', 'greeble', G.pipeRun({
        length: 4.0, radius: 0.32, sides: 6, axis: 'z', detail: G.DETAIL.MID,
      }), { pos: [s * 1.0, -1.3, 3.0] });
      // The navy's own plate language, at 18 m: one proud strake a side below the
      // knuckle carrying `dark`, cut from this hull's section exactly as the
      // carrier's 460 m belt is cut from its own.
      B.add('core', 'dark', SC_HULL.plate({
        z0: -7.5, z1: 3.0, side: s, facet: FACET.lowerFlank, t0: 0.14, t1: 0.86, out: 0.09,
      }));
    }
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
    hullHP: 950, triBudget: BUDGET.escortTris,
    partsFor: corvetteParts,
    subsystems: [
      { id: 'gun', kind: 'weapon', hp: 170, position: [1.6, 9.0, 14], radius: 11, salvageValue: 0.30, label: 'Bow Gun' },
      { id: 'reactor', kind: 'reactor', hp: 210, position: [0, -2, -8], radius: 9, salvageValue: 0.32, label: 'Core' },
      { id: 'engine_port', kind: 'engine', hp: 120, position: [-CV_POD_X, -1, -36], radius: 8, salvageValue: 0.10, label: 'Port Pod' },
      { id: 'engine_stbd', kind: 'engine', hp: 120, position: [CV_POD_X, -1, -36], radius: 8, salvageValue: 0.10, label: 'Starboard Pod' },
    ],
    weapons: [
      weapon('cv_gun', 'Bow Autocannon', 'cannon', {
        mount: [1.6, 9.4, 44], yawCentre: 0, yawWidth: PI * 0.42,
        range: RANGE.cannon * 0.72, damage: 27, shotsPerBurst: 5, burstInterval: 0.11,
        cooldown: 2.2, projectileSpeed: 1700, tracking: 1.1,
      }),
      weapon('cv_pd', 'Point Defence', 'pd', {
        mount: [-8.6, 7.0, 4], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
    hullHP: 3600, triBudget: BUDGET.escortTris,
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
        mount: [-48, 5, 12], yawCentre: -PI * 0.5, yawWidth: PI * 0.605,
        range: RANGE.cannon, damage: 46, shotsPerBurst: 4, cooldown: 3.8, tracking: 0.5,
      }),
      weapon('fg_stbd', 'Starboard Mass Driver Bank', 'cannon', {
        mount: [48, 5, 12], yawCentre: PI * 0.5, yawWidth: PI * 0.605,
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
    hullHP: 6400, triBudget: BUDGET.capitalTris,
    partsFor: monitorParts,
    subsystems: [
      { id: 'gun', kind: 'weapon', hp: 1600, position: [0, MN_GUN_Y, MN_GUN_Z], radius: 46, salvageValue: 0.42, label: 'Siege Mount' },
      { id: 'reactor', kind: 'reactor', hp: 1100, position: [0, -2, -50], radius: 22, salvageValue: 0.28, label: 'Reactor' },
      { id: 'engine', kind: 'engine', hp: 820, position: [0, 4, -130], radius: 34, salvageValue: 0.16, label: 'Drive Gallery' },
      { id: 'sensor', kind: 'sensor', hp: 300, position: [4, MN_GUN_Y + 40, MN_GUN_Z - 30], radius: 16, salvageValue: 0.10, label: 'Mast' },
    ],
    weapons: [
      weapon('mn_siege', 'Siege Mortar', 'cannon', {
        mount: [0, MN_GUN_Y + 4, 250], yawCentre: 0, yawWidth: PI * 0.32,
        range: RANGE.cannon * 1.5, damage: 340, shotsPerBurst: 2, burstInterval: 0.8,
        cooldown: 9.0, projectileSpeed: 900, tracking: 0.10, subsystemAccuracy: 0.30,
      }),
      weapon('mn_pd', 'Point Defence', 'pd', {
        mount: [5, 30, -104], yawCentre: 0, yawWidth: PI * 1.9, pitchWidth: PI * 0.9,
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
    hullHP: 9800, triBudget: BUDGET.capitalTris,
    partsFor: destroyerParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 2000, position: [0, -6, 0], radius: 22, salvageValue: 0.40, label: 'Reactor Drum' },
      { id: 'turret_fwd', kind: 'weapon', hp: 720, position: [-5, 31, 166], radius: 19, salvageValue: 0.14, label: 'Forward Turret' },
      { id: 'turret_aft', kind: 'weapon', hp: 720, position: [-5, 32, -64], radius: 19, salvageValue: 0.14, label: 'Aft Turret' },
      { id: 'port_battery', kind: 'weapon', hp: 1000, position: [-34, 3, -128], radius: 38, salvageValue: 0.16, label: 'Port Casemate' },
      { id: 'stbd_battery', kind: 'weapon', hp: 1000, position: [34, 3, -128], radius: 38, salvageValue: 0.16, label: 'Starboard Casemate' },
      { id: 'engine', kind: 'engine', hp: 1560, position: [0, 0, -222], radius: 46, salvageValue: 0.18, label: 'Main Drive' },
      { id: 'hangar', kind: 'hangar', hp: 820, position: [0, -24, -110], radius: 26, salvageValue: 0.12, label: 'Hangar Deck' },
      { id: 'sensor', kind: 'sensor', hp: 540, position: [-5, 92, 76], radius: 22, salvageValue: 0.10, label: 'Sensor Mast' },
    ],
    weapons: [
      weapon('dd_t1', 'Forward Turret', 'cannon', {
        mount: [-5, 31, 190], yawCentre: 0, yawWidth: PI * 1.15,
        range: RANGE.cannon * 1.1, damage: 78, shotsPerBurst: 2, cooldown: 4.2,
        projectileSpeed: 1300, tracking: 0.42,
      }),
      weapon('dd_t2', 'Aft Turret', 'cannon', {
        mount: [-5, 32, -40], yawCentre: 0, yawWidth: PI * 1.15,
        range: RANGE.cannon * 1.1, damage: 78, shotsPerBurst: 2, cooldown: 4.2,
        projectileSpeed: 1300, tracking: 0.42,
      }),
      weapon('dd_port', 'Port Heavy Battery', 'cannon', {
        mount: [-38, 3, -128], yawCentre: -PI * 0.5, yawWidth: PI * 0.545,
        range: RANGE.cannon * 1.15, damage: 92, shotsPerBurst: 3, cooldown: 4.6,
        projectileSpeed: 1250, tracking: 0.38,
      }),
      weapon('dd_stbd', 'Starboard Heavy Battery', 'cannon', {
        mount: [38, 3, -128], yawCentre: PI * 0.5, yawWidth: PI * 0.545,
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
    hullHP: 22000, triBudget: BUDGET.capitalTris,
    partsFor: carrierParts,
    subsystems: [
      { id: 'reactor', kind: 'reactor', hp: 4200, position: [0, -30, -160], radius: 60, salvageValue: 0.26, label: 'Reactor Room' },
      { id: 'flight_deck', kind: 'hangar', hp: 3600, position: [0, -30, -60], radius: 180, salvageValue: 0.28, label: 'Flight Deck' },
      { id: 'island', kind: 'sensor', hp: 1400, position: [-124, 150, -100], radius: 70, salvageValue: 0.12, label: 'Island' },
      { id: 'engine_port', kind: 'engine', hp: 2400, position: [-CR_TOWER_X, 30, -360], radius: 90, salvageValue: 0.14, label: 'Port Drive Tower' },
      { id: 'engine_stbd', kind: 'engine', hp: 2400, position: [CR_TOWER_X, 30, -360], radius: 90, salvageValue: 0.14, label: 'Starboard Drive Tower' },
      { id: 'port_battery', kind: 'weapon', hp: 1200, position: [-171, 14, -40], radius: 60, salvageValue: 0.08, label: 'Port Casemates' },
      { id: 'stbd_battery', kind: 'weapon', hp: 1200, position: [171, 14, -40], radius: 60, salvageValue: 0.08, label: 'Starboard Casemates' },
    ],
    weapons: [
      weapon('cr_port', 'Port Casemates', 'cannon', {
        mount: [-175, 14, -40], yawCentre: -PI * 0.5, yawWidth: PI * 0.62,
        range: RANGE.cannon * 0.9, damage: 58, shotsPerBurst: 4, cooldown: 4.0,
        projectileSpeed: 1500, tracking: 0.5,
      }),
      weapon('cr_stbd', 'Starboard Casemates', 'cannon', {
        mount: [175, 14, -40], yawCentre: PI * 0.5, yawWidth: PI * 0.62,
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
    hullHP: 90, triBudget: BUDGET.fighterTris,
    planeLocked: false,
    partsFor: strikeCraftParts,
    subsystems: [
      { id: 'core', kind: 'reactor', hp: 40, position: [0, 0, -2], radius: 3, salvageValue: 0.6, label: 'Core' },
    ],
    weapons: [
      weapon('sc_gun', 'Nose Cannon', 'cannon', {
        mount: [0, -1.3, 5], yawCentre: 0, yawWidth: PI * 0.14, pitchWidth: PI * 0.14,
        range: RANGE.pointDefence * 1.4, damage: 14, shotsPerBurst: 6, burstInterval: 0.08,
        cooldown: 1.6, projectileSpeed: 2100, tracking: 1.4,
      }),
    ],
  }),
];

export {
  corvetteParts, frigateParts, monitorParts, destroyerParts, carrierParts, strikeCraftParts,
  CV_HULL, FG_HULL, MN_HULL, DD_FORE, CR_SIDE, CR_SLOT,
};
