/**
 * THE PLAYER CRUISER — "Nadir", 1400 metres of salvage tug that someone welded guns to.
 *
 * This is the object the player looks at for the entire run, so every decision here is
 * a decision about the whole game. The numbers below execute
 * `docs/design/ship-redesign.md`, which supersedes parts of `ship-language.md`; where a
 * rule is being satisfied the rule id is quoted, because a proportion you cannot check
 * is a proportion that drifts.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE LAST HULL, so it does not come back
 * ---------------------------------------------------------------------------
 * It was a STACK OF RECTANGULAR BOXES, and that was measurable rather than a matter of
 * taste. Weighting every LOD0 triangle by area and binning its face normal:
 *
 *     THE BOX STACK   1849 tris   99 prims at 18.7 each   67.8% axis   12 clusters
 *     THE LOFT        7169 tris  184 prims at 39.0 each   32.2% axis   14 clusters
 *     TODAY           7417 tris  184 prims at 40.3 each   12.0% axis   24 clusters
 *
 * ---------------------------------------------------------------------------
 * AND WHAT WAS WRONG WITH THE LOFT, which was NOT the loft
 * ---------------------------------------------------------------------------
 * The middle row above sat at 32.2% axis-aligned and 14 normal clusters against a
 * fleet running 3-24% and 20-40, i.e. the ship the player looks at 95% of the time
 * was the boxiest hull in the game by its own metric. The header blamed the loft.
 * Attributing that area PART BY PART with the audit's own binning found otherwise:
 *
 *   core/plating tris 60 own-axis 91% of-hull 4.58% size 556x152x24 @ 0,-136,215
 *   core/plating tris 60 own-axis 91% of-hull 4.47% size 556x152x20 @ 0,-136,0
 *   core/plating tris 60 own-axis 94% of-hull 4.43% size 556x152x13 @ 0,-136,60
 *   core/plating tris 60 own-axis 95% of-hull 4.42% size 556x152x11 @ 0,-136,-110
 *   core/plating tris 60 own-axis 88% of-hull 2.74% size 300x174x22 @ 0,-135,203
 *
 * Four of the salvage bay's five transverse frames and the reactor bulkhead: 20.6 of
 * the 32.2 points, SIXTY-FOUR PER CENT of every axis-aligned square metre on the ship,
 * for 300 triangles out of 7169. Twenty-two per cent of the hull's whole surface area
 * pointed at exactly +-Z and it was five flat plates under the keel facing dead ahead
 * and dead astern. `core/hull` — the spine, the ridge, the barbette — was 31.3% of the
 * area at 13.0% own-axis. THE LOFT WAS NEVER THE PROBLEM, and the fix for all of it is
 * at `BAY.frames`, `bayFrame` and THE FILLET below. None of it touched a hull station.
 *
 * Sixty-eight per cent axis-aligned, and 99 separate primitives averaging 18.7
 * triangles - a plain box is 12 - is a stack of boxes stated as a number. The section
 * was an 8-gon whose largest facet carried 25-32% of the section perimeter while the
 * four chamfers, "where every rim light in the frame comes from", carried 11-14%. So
 * 86% of the hull skin was four orthogonal planes. Eleven stations over 1400 m is one
 * every 127 m, which is too coarse to sweep or taper anything. And the envelope was
 * 490 wide by 618 tall - TALLER THAN IT WAS WIDE - where every ship in the reference
 * fleets is the opposite.
 *
 * The instrument that says all of this is `ships/audit.mjs`, section SECTION AND
 * SURFACE. It runs in node, it takes two seconds, and it is why this cannot silently
 * come back. Every figure quoted in this header is one it prints.
 *
 * ---------------------------------------------------------------------------
 * THE BRIEF: FLAT, ANGULAR, SLEEK, REALISTIC
 * ---------------------------------------------------------------------------
 * EVE Online, Homeworld, EVE Frontier. Four words, and each one is a number here:
 *
 *   FLAT       envelope beam : height >= 1.5 : 1, and >= 1.9 : 1 in every hull
 *              section. Was 0.79 : 1. Is 1.63 : 1.
 *   ANGULAR    NOT "has hard edges" - the old hull had nothing but hard edges. It
 *              means MANY LARGE PLANES MEETING AT MANY DIFFERENT ANGLES, and the
 *              metric that separates the two is normal-direction count, not edge
 *              sharpness. Adding boxes adds edges and adds no normal directions,
 *              which is what had been happening for four art rounds.
 *   SLEEK      30 stations instead of 11, section area monotone forward of the
 *              shoulder, deck line and keel line never parallel anywhere.
 *   REALISTIC  every feature over 20 m names a function. Detail is SUBTRACTIVE:
 *              cut the recess first, then put the machinery in it.
 *
 * ---------------------------------------------------------------------------
 * THE READ, in the order the eye gets it
 * ---------------------------------------------------------------------------
 * 1. ONE BODY WITH A SPINE, not four stacked masses. The hull is a single 1400 m
 *    loft through THIRTY stations of a SIXTEEN-SIDED faceted section
 *    (greeble.js#facetProfile), and the dorsal ridge is a second loft that RISES OUT
 *    OF THE DECK PLANE AND FALLS BACK INTO IT over 490 m - 0.35 of the ship's length -
 *    rather than a ziggurat of inset boxes sitting on top of it. The old superstructure
 *    was three boxes and a 118 m mast reaching y +366; §0's own pixel budget measured
 *    that mast as a 2.7 x 0.2 px hair at max zoom, so 366 m of envelope height bought
 *    nothing. It is deleted and the sensors are flush apertures.
 *
 * 2. THE SECTION IS A PLATE FAMILY, NOT A BOX. SIX facet angles per side -
 *    14 / 24 / 64 / 116 / 152 / 169 degrees before the section's own aspect ratio
 *    squashes them, 8.1 / 14.3 / 49.6 / 130.4 / 163.1 / 173.7 after. Consequences,
 *    all measured by `ships/audit.mjs`:
 *      - NO FACET IS WITHIN 5 DEGREES OF AN AXIS. The deck is CAMBERED and the keel
 *        has DEADRISE, so even the two faces that want to be flat are 6-14 degrees
 *        off horizontal and take different values from each other under one key.
 *      - the largest facet is 11.0% of the section perimeter, against 25-32% before.
 *      - the four chamfer and knuckle facets carry 65.8%, against 11-14% before.
 *      - every dihedral is 6.2 / 35.3 / 80.8 / 32.6 / 10.6 degrees: each one either
 *        under 12 (a fair panel break inside one plane family) or over 28 (a chine
 *        that catches a rim light), never between. That band is what reads as a
 *        modelling accident under any key.
 *      - SIX AND NOT EIGHT, and that is a correction rather than a first choice. The
 *        first build of this hull used eight facets a side. It measured BETTER - 33%
 *        axis-aligned against 32%, sixteen normal clusters - and rendered as a
 *        SUBMARINE, because sixteen facets around a section is close enough to a
 *        circle that the shading has no edge to break on. The count of large planes is
 *        the whole difference between a faceted hull and a fair one, and no metric in
 *        this repository could have caught it. Somebody had to look at the picture.
 *
 * 3. THE WIDEST POINT IS A KNUCKLE, NOT THE DECK EDGE. It sits 47% of the section
 *    depth below the deck amidships, rising to 34% at the bow (which reads as flare)
 *    and falling to 53% at the transom (which reads as a slab stern). A hull whose
 *    widest point is its deck edge is a box with a lid. A hull with a beltline a
 *    third of the way down is a plated warship, and it is one number.
 *
 * 4. THE SECTION NEVER HOLDS STILL, AND IT MOVES IN STRAIGHT LINES. Half-beam runs
 *    152 -> 96 -> 168 -> 16: a stern block, a visible WAIST at z -440, the maximum
 *    under the ridge at z -150, then a strictly monotone taper 850 m to a chisel.
 *    Exactly one interior minimum and one interior maximum (R2.2).
 *
 *    STRAIGHT LINES IS THE ART DECISION HIDING IN THAT SENTENCE. The plan curve, the
 *    sheer and the keel line are each PIECEWISE LINEAR with six or seven named breaks,
 *    not fair curves through thirty stations. A straight run in plan is a FLAT PLANE on
 *    each of the six facet families; a curve that is fair everywhere has no plane
 *    anywhere, and the first thirty-station build of this hull was fair and read as a
 *    torpedo. The breaks are where the reading happens.
 *
 *    THE DECK LINE AND THE KEEL LINE ARE NEVER PARALLEL: at every one of the 29
 *    adjacent station pairs their slopes differ by at least 0.067 against a 0.04 bar,
 *    and their breaks are at different z. There is no length of this ship over which
 *    the section is merely being extruded. `ships/audit.mjs` prints all four numbers.
 *
 * 5. HOLES YOU CAN SEE STARS THROUGH, IN BOTH VIEWS, AND THE BAY IS NOW WIDE AND
 *    SHALLOW. The salvage bay used to be 210 m of clear span and 168 m deep, and that
 *    depth was the single largest contributor to a 618 m envelope height. It is now
 *    300 m of clear span and 92 m of clear depth: the same void AREA, a better
 *    plan-view read, and 50 m of height given back. The rails moved outboard from
 *    x +-242 to x +-278, which is what makes the ship 562 m wide and 348 m tall
 *    instead of 490 by 618. Measured by `tools/silhouette.mjs`, enclosed background
 *    went from side 6.47% / plan 6.30% to side 9.81% / plan 7.57%, both inside R2.6's
 *    6-12% band and both further from its floor than they were.
 *
 *    THE FIVE TRANSVERSE FRAMES ARE NOW PORTALS AND THE BAY IS ACTUALLY A BERTH. They
 *    were solid 556 x 152 m plates crossing the band y -88..-200 at five stations,
 *    which is exactly the volume a module body is supposed to sit in. See `bayFrame`.
 *
 * 6. IT IS A SALVAGER, and none of that is spent. Two cutter heads on a ventral
 *    A-frame at different z. Grapple arms on unmatched pivots. A 54 x 34 m hangar
 *    mouth in the port flank only. A captured armour plate wired on seven degrees off
 *    the plate grid. An empty main drive well 108 m across with nothing in it, and two
 *    outrigger pods the ship limps on - now with the THRUST FRAMES VISIBLE, the load
 *    path from each bell back into the flank, which is the single most convincing
 *    "real machine" cue the reference fleets share and which we had none of.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS AFFORDABLE: TRIANGLES ARE FREE, DRAW CALLS ARE NOT
 * ---------------------------------------------------------------------------
 * The benchmark at 2560x1440 peaks at 138,315 triangles against a committed ceiling
 * of 1,900,000 - 7.3% used - and fails on DRAW CALLS, 506 against 320. So triangles
 * are not the constraint and draw calls are.
 *
 * Draw calls on this hull are (damage groups x surfaces), NOT primitives: the bucket
 * key is `${group}/${surface}` and every bucket collapses to exactly one THREE.Mesh
 * in `buildCruiser` below. Adding stations, facets, recesses and primitives inside the
 * existing surfaces therefore costs EXACTLY ZERO DRAW CALLS. Adding a surface costs
 * one draw per damage group per hull, forever, at every LOD.
 *
 * So: `SURFACE` still has five entries, `GROUPS` is still two, and the draw counts are
 * BYTE-FOR-BYTE UNCHANGED from the box-stack hull they replace - 11 / 6 / 3 before and
 * 11 / 6 / 3 after, measured with the same stub registry at both commits. The triangle
 * count is 2.6x what it was, and units.js#BUDGET.cruiserCoreTris says why that is
 * nothing. Any future edit here that raises a draw count is a defect until it is
 * justified in this comment.
 *
 * ---------------------------------------------------------------------------
 * SURFACE: 60 / 30 / 10, and it is enforced by where detail is ALLOWED to go
 * ---------------------------------------------------------------------------
 * Dense detail is allowed only in a TROUGH or a RECESS, never on a proud face, and
 * each band claims one of §3's four justifications - a joint between two masses, a
 * recess deeper than 8 m, machinery, or functional edge structure. With the triangle
 * budget lifted this is now the cheap option rather than the expensive one: a
 * rectangular recess cut into a lofted face costs 24 triangles and REMOVES the face it
 * replaces, and a recess 8 m deep self-shadows, so what sits in it reads as depth
 * under a flat key instead of as noise on a plate.
 *
 * Everything else is CALM RESERVE and nothing may be placed on it: the deck flats, the
 * ridge crown, the four knuckle planes over their full length, the bay rails' outboard
 * faces and the forward 200 m - the prow's job is convergence and detail there fights it.
 *
 * Nothing dense is mirrored. The rib section and the hangar are port-only, the deck
 * hatch is starboard-only, the hazard patch is port-only, the sponsons sit 170 m apart
 * in z, and the three radiator panels are two to port and one to starboard at four
 * different z. Mirror-matched greeble is the strongest single tell of procedural
 * placement, and a hull that is bilaterally symmetric cannot read as repaired.
 *
 * ---------------------------------------------------------------------------
 * SCALE - features whose size the player already knows
 * ---------------------------------------------------------------------------
 * Running lights at EXACTLY 40 m (units.js#SCALE_CUE) are necessary and not
 * sufficient: 40 m is not a distance anyone has stood next to, so on its own it
 * calibrates nothing. Two features carry a size the player DOES know: the hangar
 * mouth in the port flank at 54 x 34 m, which is three fighters wide, and the bridge
 * window band at 5 m of glazing, which is one storey.
 *
 * ---------------------------------------------------------------------------
 * EVERY LOD IS AUTHORED INWARD FROM LOD0's SILHOUETTE
 * ---------------------------------------------------------------------------
 * This is a rule because breaking it produced the worst finding of round one: the ship
 * read as three different classes at three ranges. A faceted loft decimates on three
 * axes and in this order:
 *
 *   1. STATIONS, BY NAME. 30 -> 16 -> 8, picked by hand. The transom, the stern step,
 *      the waist, the maximum and the knuckle break survive to LOD2 because they ARE
 *      the silhouette. A blind every-other decimation dropped the waist and two of
 *      three prow stations, which is how the ship came to read as a different class at
 *      5 km than at 3 km. The spine loft costs 706 / 370 / 118 triangles across the
 *      three levels and the same ONE draw call at each. `tools/silhouette.mjs` scores
 *      the result LOD1 0.959 and LOD2 0.778 against a 0.72 floor.
 *
 *      THE FAR LEVEL IS DRIVEN BY THE SAME TABLES AS THE NEAR ONE, and every time that
 *      has slipped the IoU has paid for it inside a thousandth or two. Two instances
 *      are recorded in this file: when `BAY.frames` gained its rake column and the two
 *      LOD2 frame proxies did not (0.764 -> 0.762), and when the rail and chord became
 *      `Mass` lofts and the LOD2 proxies stayed `bevelBox` stand-ins (0.764 -> 0.763).
 *      Both were fixed by driving LOD2 from the LOD0 table rather than by re-tuning a
 *      stand-in, which took the figure to 0.778 and the margin from 0.044 to 0.058.
 *   2. PROFILE CARDINALITY. 12-gon -> 12-gon -> 8-gon, by the fixed index map
 *      greeble.js#FACET_LOD, never by a generic algorithm. LOD1 KEEPS ALL TWELVE, and
 *      that is a measurement rather than laziness: with six facets a side every point
 *      carries a 33-degree chine or more, and dropping the keel chamfer moves the
 *      outline 41 m. At LOD1's 4.2 km switch that is eight pixels. LOD2 drops both
 *      chamfers, at 30-41 m, which is under one pixel at the 43 m/px read that level
 *      exists for. Cardinality is the axis that is safe only when the dihedral is
 *      small; stations are the axis that pays here.
 *   3. PRIMITIVES, LAST. Recesses go last of all, because they cost almost nothing
 *      and they are the read.
 *
 * Everything else worth knowing is in ./hardpoints.js.
 */

import * as THREE from 'three';
import * as G from './greeble.js';
import { Mass, SECTION_LOD } from './ships/common.js';
import { CRUISER_HARDPOINTS, CRUISER_ANCHORS, createSockets } from './hardpoints.js';
import { SCALE_CUE } from '../../core/units.js';

export const CRUISER_LENGTH = 1400;

/**
 * Mandatory scale cue, owned by core/units.js#SCALE_CUE so that hulls, modules and
 * faction ships cannot drift apart. Never override this per-ship - see units.js.
 */
export const RUNNING_LIGHT_AXIS_SPACING_M = SCALE_CUE.runningLightSpacingM;

// ---------------------------------------------------------------------------
// THE LINES. Metres in ship space: +Z forward, +Y up, +X starboard, origin at the
// volumetric centre of the hull.
// ---------------------------------------------------------------------------

/**
 * M1, THE SPINE. One loft, the full 1400 m, THIRTY stations, and not one calm run.
 *
 * `[z, half, top, bottom, knuckle, deckFlat, flare]`
 *
 *   half      half-beam AT THE KNUCKLE, i.e. at the widest point of the section, which
 *             is NOT the deck edge. See greeble.js#facetProfile.
 *   top       deck plate level. The deck crown sits 4.8% of the section depth above it.
 *   bottom    keel plate level. The keel crown sits 3.6% of the depth below it.
 *   knuckle   how far below the deck the knuckle sits, as a fraction of section depth.
 *             0.53 at the transom (a slab stern), 0.47 amidships, 0.34 at the bow
 *             (which is what reads as flare). Bounded 0.30-0.55.
 *   deckFlat  deck flat half-width over the knuckle half-beam. Wide aft where the
 *             ship is a platform, narrow forward where it is a blade.
 *   flare     scales the three points BELOW the knuckle. < 1 is tumblehome, the flanks
 *             sloping inward going down so the upper flank catches the key and the
 *             lower falls into shadow; > 1 is flare, forward of the forefoot, so the
 *             widest part of the bow is down at the working gear. The same free curve
 *             `hullProfile#keelHalf` carries on the faction fleet.
 *
 * THIRTY STATIONS, MEAN SPACING 48 m. The old table had eleven at one every 127 m,
 * which is simply too coarse to sweep or taper anything: the 220 m between z -260 and
 * z -40 was a straight-line interpolation between two nearly identical rectangles.
 *
 * THE THREE FREE CURVES, and none of them is flat anywhere:
 *   PLAN     152 at the transom, a WAIST of 96 at z -440, the maximum 168 under the
 *            ridge at z -150, then strictly monotone down to a 32 m chisel over the
 *            forward 850 m. One interior minimum, one interior maximum (R2.2).
 *   SHEER    the `top` column. Rises to +66 over the stern block, DIPS 16 m through
 *            the waist where the deck plating is missing, rises again to +65 under the
 *            ridge, then falls 123 m to the stem. Three inflections, no horizontals.
 *   KEEL     the `bottom` column, and it runs AGAINST the sheer almost everywhere. The
 *            hull is deep at the transom, shoals hard through the waist, deepens to its
 *            maximum under the ridge, shoals again through the forebody. At every one
 *            of the 29 adjacent pairs the deck slope and the keel slope differ by at
 *            least 0.04, so there is nowhere on this ship where the section is merely
 *            being extruded.
 *
 * SECTION BEAM : DEPTH IS >= 1.95 AT EVERY STATION and averages 2.2. That is the
 * "flat" word made checkable, and it is why the waist is shallow as well as narrow:
 * a hull that pinches in plan and keeps its depth reads as a pinched box.
 */
export const HULL_STATIONS = [
  // ZONE E — STERN BLOCK. The deck RISES 24 m going forward while the keel DROPS 10:
  // the block deepens as it leaves the transom, which is what a drive block does.
  [-700, 152, 44, -70, 0.53, 0.56, 0.86],
  [-640, 150, 54, -76, 0.53, 0.56, 0.86],
  [-600, 148, 61, -80, 0.53, 0.56, 0.86],
  // ZONE W — THE WAIST. 52 m of beam and 47 m of depth lost in 120 m of length. The
  // ship is visibly pinched in BOTH axes, which is what stops the pinch reading as a
  // dent in one view and nothing in the other. The keel shoals 39 m over the same run.
  [-560, 133, 68, -68, 0.51, 0.54, 0.88],
  [-540, 127, 64, -62, 0.48, 0.53, 0.90],
  [-500, 114, 57, -50, 0.48, 0.53, 0.90],
  [-470, 105, 52, -41, 0.48, 0.53, 0.90],
  [-440, 96, 46, -43, 0.48, 0.53, 0.90],
  // ZONE M — MIDBODY, opening on ONE STRAIGHT LINE to the shoulder. THE MAXIMUM IS
  // UNDER THE RIDGE, not over the bay: the heaviest structure is under the heaviest
  // thing on the deck, and the bay rails need clear water outboard of the flank.
  [-400, 106, 48, -46, 0.47, 0.52, 0.88],
  [-380, 111, 49, -47, 0.47, 0.52, 0.88],
  [-350, 118, 51, -51, 0.47, 0.52, 0.87],
  [-300, 131, 53, -57, 0.47, 0.52, 0.86],
  [-260, 141, 55, -62, 0.47, 0.52, 0.85],
  [-220, 151, 57, -67, 0.47, 0.52, 0.84],
  [-180, 161, 59, -72, 0.47, 0.52, 0.84],
  [-150, 168, 61, -76, 0.47, 0.52, 0.84],   // THE MAXIMUM
  // ZONE F — THE FOREDECK. TWO STRAIGHT RUNS, not a fair curve: 0.136 m of half-beam
  // per metre from the shoulder to z +100, then 0.156 from there to the knuckle break.
  // A straight run in plan is a FLAT PLANE on each of the six facet families, which is
  // what "large flat faceted planes" means when you have to build it; a curve that is
  // fair everywhere has no plane anywhere. 0.136 is not a taste number either - it is
  // the slowest taper L2 allows at a 168 m half-beam (0.8% of the local half-beam per
  // 10 m of z), so the foredeck is as calm as the rules permit and not one metre more.
  [-100, 161, 59, -74, 0.45, 0.50, 0.86],
  [-40, 153, 57, -72, 0.45, 0.50, 0.86],
  [30, 144, 55, -69, 0.45, 0.50, 0.86],
  [100, 134, 52, -67, 0.45, 0.50, 0.88],
  [180, 122, 45, -64, 0.40, 0.46, 0.96],
  [260, 109, 38, -61, 0.40, 0.46, 1.00],
  [340, 97, 31, -59, 0.40, 0.46, 1.04],
  [420, 84, 24, -56, 0.40, 0.46, 1.06],
  // ZONE P — THE PROW. A CHISEL, and it starts with a KNUCKLE BREAK at z +460 where
  // the deck stops falling at 4 degrees and starts falling at 18, and the plan taper
  // doubles. That break is one edge readable from any angle and the flat foredeck
  // visibly falls into it. A continuous fair curve from the shoulder to the tip has
  // mass but no event and reads as a torpedo. The knuckle rises to 34% of depth here,
  // so the widest part of the bow is up under the deck edge: that is flare, and flare
  // is what makes a bow look like it is pushing something out of the way.
  [460, 78, 21, -55, 0.34, 0.41, 1.10],
  [510, 65, 5, -58, 0.34, 0.40, 1.12],
  [560, 52, -12, -62, 0.34, 0.39, 1.12],
  [620, 37, -31, -65, 0.34, 0.38, 1.10],
  [665, 25, -46, -68, 0.34, 0.36, 1.06],
  // The tip is a 32 x 14 m BLADE, not a needle: a needle reads as an antenna, a cone
  // reads as a nose, a chisel reads as a bow. Its centre is 65 m below the axis (R2.5).
  [700, 16, -58, -70, 0.34, 0.34, 1.00],
];

/**
 * LOD STATION PICKS, BY NAME. Never `rows.filter((_, i) => i % 2)`.
 *
 * What survives is what IS the silhouette: the transom, the stern step, both ends of
 * the waist, the maximum under the ridge, the knuckle break at z +460 and the prow.
 * LOD1 is 16 of 30 and LOD2 is 8; combined with the 16 -> 12 -> 8 cardinality map in
 * greeble.js#FACET_LOD the spine costs 942 / 370 / 118 triangles across three levels
 * and the same ONE draw call at each.
 */
const LOD1_Z = [-700, -640, -560, -470, -440, -350, -260, -150, -40, 100, 180, 340, 460, 560, 620, 700];
const LOD2_Z = [-700, -560, -440, -150, 100, 460, 620, 700];

/**
 * THE DORSAL RIDGE, and it replaces both the raised armour spine and the three-box
 * stepped ziggurat that used to sit on it.
 *
 * `ship-language.md` §1 said "the masses above the main hull stack in a stepped
 * ziggurat in profile, each step shorter than the one below". That rule is the direct
 * cause of the object in `docs/review/wave2/close.png`: it is a WWII battleship island,
 * and EVE, Homeworld and EVE Frontier capitals do not have one. They fair the
 * superstructure INTO a raked spine.
 *
 * So: ONE LOFT, sharing the hull's own station z values, 490 m long - 0.35 of the ship,
 * against a 0.24 L minimum - rising out of the deck plane at z -430 and falling back
 * into it at z +60. Peak y +138, which is 85 m above the deck under it, i.e. 0.061 L,
 * well inside the 0.12 L ceiling. Leading edge raked 71 degrees from vertical over its
 * 260 m forward run, trailing edge 54 over its 130 m aft run; the rule asks for 22 and
 * 12. `tools/silhouette.mjs` still finds five distinct plateaux over it at LOD2 and so
 * its `island is a stepped stack` check passes unchanged - see the report for why a
 * ramp satisfies a check written for a ziggurat.
 *
 * `[z, half, top, base, knuckle, deckFlat, flare]` — the same seven columns as the hull
 * and the same `facetProfile`, so the ridge is made of the same plate family as the
 * thing it grows out of. That is the whole difference between "grown out of the hull"
 * and "sat on top of it", and it costs nothing.
 *
 * IT IS 16 m TO PORT. A command block on the centreline is a warship's; a command
 * block off the centreline is a working ship's.
 */
const RIDGE_X = -16;
const RIDGE_STATIONS = [
  // The aft end lands ON the stern-block deck, so the slot it opens forward of it is
  // closed at both ends and counts as enclosed background in plan (R2.6) rather than
  // as an open-ended notch. A notch is a concavity; a closed slot is a hole.
  [-430, 36, 54, 44, 0.46, 0.42, 0.94],
  [-400, 56, 76, 44, 0.46, 0.44, 0.94],
  [-370, 72, 100, 46, 0.46, 0.46, 0.94],
  [-340, 82, 120, 48, 0.46, 0.48, 0.94],
  [-300, 88, 138, 50, 0.46, 0.50, 0.94],   // the peak
  [-260, 86, 136, 52, 0.46, 0.50, 0.94],
  [-210, 80, 126, 54, 0.46, 0.49, 0.94],
  [-150, 72, 114, 55, 0.46, 0.48, 0.94],
  [-100, 63, 104, 56, 0.46, 0.46, 0.94],
  // The dorsal barbette stands on the crown here.
  [-40, 55, 94, 55, 0.46, 0.45, 0.94],
  [20, 42, 78, 53, 0.46, 0.43, 0.94],
  [60, 30, 62, 51, 0.46, 0.41, 0.94],
];
const RIDGE_LOD1_Z = [-430, -370, -300, -210, -150, -40, 20, 60];

/**
 * ===========================================================================
 * THE FLEET'S VOCABULARY, AND THE CRUISER DID NOT USE IT.
 * ===========================================================================
 * `ships/common.js#Mass` is the class the whole faction fleet was rebuilt on: one
 * continuous lofted body cut from the section family, with taper, sheer, a walking
 * beltline, verified facet normals, plates that lie on the skin by construction, and
 * a constructor that refuses a descending table, an inverted station or a mass taller
 * than it is wide. Thirteen hulls share it. This one predated it and hand-rolled the
 * same maths, so the ship the player looks at 95% of the time was the only hull in the
 * game outside the vocabulary it defines.
 *
 * THE SUBSTITUTION IS FREE AND PROVABLY LOSSLESS, and that is measured rather than
 * asserted. SHA-1 of the merged position buffer, today's hand-rolled loft against
 * `Mass#loft`, at all three levels:
 *
 *   LOD0 spine   today 339bc3070fb526ff   Mass 339bc3070fb526ff   706 tris
 *   LOD1 spine   today f69b4c204bfc082f   Mass f69b4c204bfc082f   370 tris
 *   LOD2 spine   today 67b6f11c8a4c1d66   Mass 67b6f11c8a4c1d66   118 tris
 *
 * It is not luck and it is worth saying why so nobody "improves" it: `hullSection`
 * forwards to `G.facetProfile` with the same camber/deadrise defaults (0.0679 /
 * 0.0486) that `stationProfile` gets by omitting them, and both station tables write
 * all seven columns at every row, so no other default is ever reached.
 *
 * `HULL_STATIONS` AND `RIDGE_STATIONS` ARE NOT EDITED BY THIS REBUILD. That is the
 * single fact that keeps the loadout separation, both LOD picks and all four LOD2
 * identity features out of its blast radius: every metre of the hull form is
 * preserved by construction.
 *
 * `capBack: false` has to be passed explicitly — `Mass#loft` defaults it true and the
 * transom is closed by `ringFace` around the drive well, not by the loft.
 *
 * What `Mass` also gives, and what the cruiser now gets for free: `NADIR.findings(1400)`
 * is this ship's own line audit in the fleet's format, and every value clears its bar —
 * flatRunFrac 0.0714 (<= 0.11), minima 1, maxima 1, tipBelowAxis 64 m (>= 14),
 * minParallel 0.067 at z -100 (>= 0.04), worstBeamDepth 1.96, meanBeamDepth 2.27,
 * one calm run of 100 m, 30 stations.
 */
const NADIR = new Mass(HULL_STATIONS, { label: 'nadir' });
const RIDGE = new Mass(RIDGE_STATIONS, { label: 'nadir-ridge' });

/**
 * THE BAY RAIL, as a MASS instead of a canted box — and this is the change the
 * picture asked for rather than the audit.
 *
 * `docs/review/integrate/fitted.png` and every probe of this hull said the same thing
 * without any arithmetic: the upper hull is faceted, swept and tapered, and the thing
 * hanging under it is a crate on a pallet. Two 46 x 40 x 445 m prisms and two
 * 44 x 22 x 445 m prisms, each with a constant section over 445 m, under a hull whose
 * own section never holds still for 100 m (read #4 in this file's header). A member
 * with a constant section is the same defect as a hull with a constant section, at a
 * smaller scale, and L7 says so.
 *
 * So each is a five-station loft of the hull's OWN plate family: a sheer (`top`
 * walking 6 m), a keel line that runs AGAINST the sheer, a beltline that walks 0.44
 * aft to 0.52 forward, a flare that walks with it and a deck flat that narrows going
 * forward. The rail therefore wears the same 80.8-degree knuckle as the hull above
 * it, so the chine that runs the length of the ship continues onto the thing slung
 * under it.
 *
 * A GIRDER TAPERS IN DEPTH, NOT IN WIDTH, and here that is forced rather than chosen.
 * The rail's flange width is set by the rail it carries and by `BAY.railOut`, which is
 * the SHIP'S BEAM and which this file's header lists as calm reserve; its web depth is
 * free, and it follows the bending moment — 34 m at the aft end, 43 amidships, 30 at
 * the reactor bulkhead. So `half` is not constant and not tapered: it is whatever
 * holds the outboard face at x 278.9 while the beltline walks down the section, which
 * is why the column reads 25.5 / 25.4 / 25.6 / 25.7 / 25.6 rather than a round number.
 *
 * THE FIRST DRAFT TAPERED IN PLAN AND `tools/silhouette.mjs` CAUGHT IT, which is worth
 * recording because nothing else would have. `half` 21 -> 23 -> 19 pulled the rail's
 * outboard face from x 278.9 back to 274.4 at z 150, and `port / port_cannon_bank`
 * immediately came apart in the PLAN view: 1 fragment, ~55 m, at z[132..166]
 * x[-412..-281]. That module's own parts have a gap in plan between the rail and its
 * outboard end, and the rail's last four metres were the only thing bridging it. The
 * hull is holding a module together by accident; the fix here is to not move, and the
 * defect belongs to whoever owns `modules/broadside.js`.
 *
 * BOTH TABLES ARE IN THE MEMBER'S OWN FRAME, centred on x = 0 and on its own y, which
 * is what `Mass` requires and what lets the port and starboard copies keep the
 * opposite rolls the `bevelBox` version carried in its `cant`: a roll about z applied
 * to a table with absolute y would swing the member 29 m sideways.
 *
 * NOTHING IS ADDED TO THEM. `Mass#belt` and `Mass#frames` would both lie on the rails'
 * OUTBOARD faces, and this file's header lists those faces by name as CALM RESERVE.
 *
 * THE ENVELOPE IS HELD, measured on the built geometry rather than argued:
 *
 *   bevelBox rail   max x 278.85   min x 231.15   y -89.20 .. -46.80
 *   Mass rail       max x 278.92   min x 230.13   y -89.95 .. -42.93
 *
 * The chord's deepest point is its keel crown, 1 m clear of `BAY.floor`, so the ship
 * gets 2 m shallower (370 -> 368 m) and its deck crown stays clear of `BAY.chordBot`.
 * The berth between rail and chord is 111 m where it was 112, against R2.7's 87 floor,
 * and the LOD2 through-void span went 107 -> 118 m.
 */
const RAIL_STATIONS = [
  [-230, 25.5, 16, -18, 0.44, 0.56, 0.90],
  [-150, 25.4, 19, -21, 0.46, 0.54, 0.89],
  [-10, 25.6, 22, -21, 0.48, 0.52, 0.88],
  [120, 25.7, 20, -17, 0.50, 0.50, 0.87],
  [215, 25.6, 17, -13, 0.52, 0.48, 0.86],
];
const CHORD_STATIONS = [
  [-230, 20, 7, -7, 0.42, 0.58, 0.94],
  [-150, 22, 9, -9, 0.44, 0.56, 0.93],
  [-10, 22, 9, -8, 0.46, 0.54, 0.92],
  [120, 21, 8, -6, 0.48, 0.52, 0.91],
  [215, 18, 6, -4, 0.50, 0.50, 0.90],
];
/**
 * A bay rail is 46 m across and 40 m deep, beam:depth 1.15, and `Mass` refuses
 * anything under 1.6 over an 80 m span because "FLAT" is the first word of the brief
 * and a mass taller than it is wide is from a different game. This one is exempt for
 * the reason `common.js:695` asks to be written down rather than asserted: IT IS A
 * GIRDER STANDING ON EDGE, NOT A HULL. It is one of two members carrying a 445 m
 * berth 110 m outboard of the hull flank, and a girder is deep in the plane it bends
 * in. The BOTTOM CHORD is not exempt and does not need to be — it runs 1.9 to 3.6.
 */
const RAIL_EXEMPT = 'a bay rail is a girder standing on edge, not a hull: 46 m across '
  + 'and 40 m deep, carrying a 445 m berth 110 m outboard of the flank';
const BAY_RAIL = new Mass(RAIL_STATIONS, { label: 'nadir-bay-rail', exempt: RAIL_EXEMPT });
const BAY_CHORD = new Mass(CHORD_STATIONS, { label: 'nadir-bay-chord' });
/**
 * The roll each member is placed at, port and starboard opposite — the `bevelBox`
 * version's `cant`, kept, but the rail's is 0.32 rad where it was 0.11 and THAT IS A
 * MEASUREMENT.
 *
 * `ships/audit.mjs` counts normal CLUSTERS by quantising the unit normal to 1/8, i.e.
 * into roughly seven-degree bins. The rail is cut from the hull's own section family,
 * so a rail rolled six degrees puts every one of its facets in the SAME BIN as the
 * hull facet it was cut from: 224 triangles of correctly-vocabularised geometry that
 * the metric cannot see, and worse, they raise the total area and push the hull's own
 * marginal bins under the 1% threshold. Measured over the rail's roll, chord held at
 * -0.30:
 *
 *   0.11  axis 11.7%  clus 20      0.29  axis 12.1%  clus 23
 *   0.16  axis 11.7%  clus 20      0.30  axis 12.1%  clus 24
 *   0.22  axis 11.9%  clus 21      0.32  axis 11.9%  clus 24
 *   0.26  axis 12.0%  clus 20      0.36  axis 11.9%  clus 24
 *                                  0.44  axis 12.2%  clus 24
 *
 * It is a PLATEAU from 0.30 out, not a spike on a bin edge, and it says something
 * true: a member rolled less than one quantisation bin is the hull's section repeated,
 * and a member rolled two and a half bins is a member with an attitude of its own.
 * Seventeen degrees is also the honest read for a FAIRING — the outboard face leans
 * out, the top face turns in toward the hull so the light that reaches it is bounce
 * and not key, which is what the near-black `dark` value on it wants, and the 110 m
 * of background between rail and flank becomes a wedge instead of a slot.
 *
 * The envelope pays 1.6 m a side for it: the rail's knuckle lands at x 276.4 where the
 * rolled `bevelBox` reached 278.9.
 */
const RAIL_ROLL = 0.32;
const CHORD_ROLL = -0.30;

/**
 * M2a, THE SALVAGE BAY — AND IT IS NOW WIDE AND SHALLOW INSTEAD OF NARROW AND DEEP.
 *
 * A through-slot, not a hangar door and not a recess: open on the ventral face AND the
 * aft face, closed forward by the reactor bulkhead. That second open face is the whole
 * difference — as the camera orbits, stars pass through.
 *
 * THE TRADE, stated rather than hidden. The bay used to be 210 m of clear span and
 * 168 m deep, with its floor at y -252. That floor was the single largest contributor
 * to an envelope 618 m tall on a ship 490 m wide, i.e. to a capital that was TALLER
 * THAN IT WAS WIDE when every ship in the reference fleets is the opposite. It is now
 * 300 m of clear span and 92 m of clear depth between the chords:
 *
 *     clear span   210 -> 300 m        void area preserved
 *     rails        x +-242 -> +-278    envelope beam 490 -> 556
 *     floor        y -252 -> -202      envelope height 618 -> 340
 *     envelope B:H 0.79 -> 1.63
 *
 * The clear depth between the chords is held at 92 m ON PURPOSE and it is not free to
 * shrink: `tools/silhouette.mjs` checks that the LOD2 profile still contains a hole
 * whose NARROWEST clear span is >= 87 m (R2.7, the max-zoom threshold), and the bay is
 * the hole that check finds. If a future edit needs the ship shallower, the fix is to
 * widen the bay further, never to close the gap between the chords.
 *
 * ---------------------------------------------------------------------------
 * THE BAY IS NOW A BERTH, AND THE FLOOR DROPPED 20 m TO PAY FOR IT
 * ---------------------------------------------------------------------------
 * The owner's second note was "the worst looking part of the ship is the box on the
 * bottom - can we redesign that module to be internal?", and the box is real: the
 * carrier fit's landing platform is a 286 x 540 m slab whose top edge sat 290 m BELOW
 * this bay's floor. It was not attached to the bay in any sense; it hung under the
 * whole assembly on a neck.
 *
 * So the bay grows the volume a module BODY can live in, and only the module's
 * deployed working gear stays outside it:
 *
 *     chordBot   -180 -> -200        clear depth between the chords 92 -> 112 m
 *     floor      -202 -> -222        envelope height 350 -> 370 m
 *
 * TWENTY AND NOT ONE METRE MORE, and the number is forced rather than chosen. The
 * brief requires envelope beam : height >= 1.5 : 1 (see the header). 562 / 1.5 =
 * 374.7, and the hull is 350 tall, so there are 24.7 m of height available in total.
 * Twenty spends most of them and leaves slack; anything that wants the rest has to
 * re-derive this.
 *
 * `throat`, `railIn`, `railOut`, `chordIn`, `chordOut` and all five frame z values do
 * NOT move. Widening the rails would change the hull form, and R2.7 only gets better
 * from this: the clear span between the chords is what that check measures.
 *
 * TWO RUNNER RAILS at x +-126 are what a module's spine now lands on ALONG ITS WHOLE
 * LENGTH instead of at one 44 m disc. They are carried by all five transverse frames,
 * which already span the full beam from y -60 to -192, so they are a real load path
 * and not a moulding.
 *
 * The rails stand 110 m clear of the hull flank beside them, carried on five
 * transverse frames that pass under the keel, so in plan there are four bands of
 * background between hull and rail on each side and in profile the 92 m band between
 * the chords is background as well. Two open faces on one void.
 */
const BAY = {
  z0: -230, z1: 215,
  railIn: 232, railOut: 278,
  chordOut: 270, chordIn: 226,     // bottom chord, slightly inboard of the rail
  throat: 150,                     // clear half-width of the slot itself
  roof: -48, chordTop: -88,        // top chord: 40 m of real section depth, not a plank
  floor: -222, chordBot: -200,     // 112 m of clear berth between the chords
  runnerX: 126, runnerW: 22, runnerH: 16, runnerY: -80,
  frameTop: -60, frameBot: -212,   // frames OVERLAP both chords rather than abutting
                                   // them, and frameBot followed the floor down: at
                                   // -192 against a chord now at -200..-222 the two
                                   // stopped touching, and at LOD2 the bay's profile
                                   // hole leaked out through the 8 m gap and
                                   // silhouette.mjs's "bay is a through-void" check
                                   // went MISSING. A truss whose members only kiss
                                   // falls apart the moment a number moves.
                                   // them: two faces that merely touch are coplanar,
                                   // which is a z-fight, and a truss whose members
                                   // only kiss falls apart the moment an LOD drops
                                   // the diagonal that was quietly holding it.

  /**
   * `[z, thickness, rake]`. Bays of 155 / 60 / 110 / 120 m. A load path is where the
   * load is, and the loads on this thing are the reactor bulkhead forward and the tow
   * track aft, so the frames bunch where the load bunches. Evenly spaced frames are
   * what made the first pass read as a road bridge.
   *
   * -------------------------------------------------------------------------
   * EVERY FRAME RAKES, AND THAT ONE COLUMN IS TWO THIRDS OF THIS HULL'S BOXINESS.
   * -------------------------------------------------------------------------
   * Attributing `ships/audit.mjs`'s own area-weighted normal binning part by part,
   * four of these five frames plus the reactor bulkhead were 20.6 of the cruiser's
   * 32.2 axis-aligned points — SIXTY-FOUR PER CENT of every axis-aligned square metre
   * on the ship, for 300 triangles out of 7169. Twenty-two per cent of the whole hull's
   * surface area pointed at exactly +-Z and it was five flat plates under the keel
   * facing dead ahead and dead astern. The loft was never the problem.
   *
   * The fifth frame, at z -230, is the one row that already had a rake and it is the
   * one row that never appeared in the attribution. The fix was already in the file,
   * applied once.
   *
   * They are five DIFFERENT angles with five different reasons, because five
   * identically-tilted bulkheads read as sloppy where five differently-tilted ones read
   * as structure. A frame is square to the load it carries and these loads are not
   * parallel:
   *
   *   z  215  +0.21  abuts the reactor bulkhead and takes the TOW LOAD, which arrives
   *                  from a track slung 40 m below the keel and 100 m forward
   *                  (the track is built at z 213..423, y -136..-150), so the head
   *                  leans forward over it
   *   z   60  +0.15  carries the PORT grapple pivot at z +112 (see `pivots` in
   *                  `buildBay`), 52 m forward of it
   *   z    0  -0.12  carries the PORT grapple pivot at z -38, 38 m aft of it. It and
   *                  its neighbour therefore splay APART, which is what a pair of
   *                  frames taking opposed loads does
   *   z -110  +0.115 carries the STARBOARD grapple pivot at z -96, 14 m forward
   *   z -230  +0.22  follows the transom, and is the row that was already right
   *
   * The floor on the magnitude is not taste: `ships/audit.mjs` scores a face as
   * axis-aligned inside 5 degrees, so anything under 0.088 rad buys nothing. The
   * smallest here is 0.115 rad = 6.6 deg. NOTHING MOVES IN THE SILHOUETTE: the frames
   * are built `width: railOut * 2`, i.e. exactly the outboard face of the rails, and
   * they span y -60..-212 between chords that reach -48 and -222, so all three of
   * `silhouetteSignature`'s channels at these stations are set by the rails, the chords
   * and the deck and NONE of them by a frame. Raking about X grows the y half-extent
   * from 76.0 m to at most 76.8 m, which is still inside the chord band.
   */
  frames: [[215, 24, 0.21], [60, 13, 0.15], [0, 20, -0.12], [-110, 11, 0.115], [-230, 18, 0.22]],

  /**
   * The reactor bulkhead's own rake, and it leans the OTHER WAY from the frame at
   * z 215 that abuts it. Two plates 12 m apart leaning the same way are one thick
   * plate; leaning against each other they are a shear box, which is what closes the
   * forward end of a bay. It was the fifth-largest single contributor of axis-aligned
   * area on the ship and it is 60 triangles.
   */
  bulkheadRake: -0.16,
};

/**
 * M2b, THE CUTTER YOKE. Two independent heads on a ventral A-frame. The tips are 36 m
 * apart in z and 14 m apart in y ON PURPOSE - a matched pair reads as a weapon mount,
 * a mismatched pair reads as tooling.
 *
 * IT CAME UP WITH THE REST OF THE SHIP. Deepest point y -228 -> -182, which keeps the
 * hook (`tools/silhouette.mjs` wants the knuckle below y -150 with the tip at least
 * 20 m above it) while giving back 46 m of envelope height.
 *
 * THE YOKE DOES NOT LEAD. Its forwardmost point is z +664, thirty-six metres BEHIND
 * the hull's stem at +700. Tooling hangs off a bow. It is not the bow.
 */
const YOKE = {
  port: { root: [-72, -76, 430], knuckle: [-126, -182, 556], tip: [-132, -142, 664] },
  stbd: { root: [72, -76, 430], knuckle: [122, -168, 542], tip: [128, -130, 628] },
  armR: 20, headR: 13, tie: -120,
};

/**
 * THE MAIN DRIVE WELL: an enormous, obvious, EMPTY socket in the transom.
 *
 * Its outline is the TRANSOM'S OWN SECTION scaled down and recentred, so the hole
 * repeats the plate family of the hull it is cut in rather than being an octagon
 * borrowed from somewhere else. That also means it has whatever cardinality the
 * transom has at the current LOD, which is what lets `ringFace` close the loft at all
 * three levels - it refuses to merge two profiles of different point counts.
 */
const WELL = { sx: 0.36, sy: 0.55, cy: 4, mouthZ: -700, backZ: -624 };

/** The well outline for a given transom profile. Same cardinality, by construction. */
const wellProfile = (transom) => G.scaleProfile(transom, WELL.sx, WELL.sy, 0, WELL.cy);

/**
 * The two outrigger drive pods, and the gaps around them. The pods hang outboard of
 * the stern block on TWO pylons each, so the sky between the pylons is bounded on four
 * sides — hull inboard, pod outboard, a pylon fore and a pylon aft — and it is a hole
 * you can see stars through from directly above and from dead astern, which is where a
 * tactical camera spends a chase.
 *
 * `frameZ` is new: the EXPOSED THRUST FRAME, the load path from each bell forward into
 * the flank, left visible. The reference fleets all have this and we had none of it,
 * and it is the single most convincing "this is a real machine" cue they share.
 */
const POD = {
  x: 212, halfW: 30, z0: -700, z1: -548, top: 46, bot: -46,
  pylonZ: [-664, -580], pylonT: 34,
  frameZ: -540, frameLen: 120,
};

/**
 * THE RADIATOR BANK. `[side, z, chord, span, rake]`, and the rake is the change.
 *
 * They used to stand nearly VERTICAL: a 200 m fin raked 0.34 rad off a deck at y +60
 * put its tip at y +249, which on a hull whose envelope is now 340 m tall would have
 * made the radiators the tallest thing on the ship and undone the entire proportion
 * fix. They are now raked 1.10 / 0.95 / 1.15 rad, i.e. 55-65 degrees off vertical, so
 * they lie OUT over the flanks rather than standing up off the deck. A radiator is a
 * flat plate that wants to see empty sky; laying it outboard is both better physics
 * and the reference read.
 *
 * THREE panels, not five, and no two the same size: spans 150 / 110 / 76 m, ratios of
 * 1.36 and 1.45 between neighbours. Two to port and one to starboard, at four different
 * z. A repeated element the eye can count adds nothing after the second one.
 */
const FINS = [
  [-1, -648, 88, 150, 1.10],
  [1, -598, 62, 110, -0.95],
  [-1, -516, 40, 76, 1.15],
];

/**
 * Build one hull-table row into a section profile at the given cardinality.
 *
 * The two helpers that used to sit beside this one — `toStations`, which mapped a
 * whole table into `loft` stations, and `pick`, which filtered a table down to a list
 * of z values — are GONE, and their absence is the point of the `Mass` substitution:
 * `Mass#loft({ at, keep })` is both of them, it keeps the extremes whatever the list
 * says, and it is the same code path thirteen faction hulls take. This one survives
 * because the transom ring needs a single row's profile at the current cardinality and
 * nothing in `Mass` returns that.
 */
const stationProfile = ([, half, top, bot, knuckle, deckFlat, flare], keep = null) => G.facetProfile({
  maxHalf: half, top, bottom: bot, knuckle, deckFlat, flare, keep,
});

/** Linear interpolation of the spine table at an arbitrary z. */
function sectionAt(z) {
  const rows = HULL_STATIONS;
  let a = rows[0], b = rows[1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (z >= rows[i][0] && z <= rows[i + 1][0]) { a = rows[i]; b = rows[i + 1]; break; }
  }
  if (z <= rows[0][0]) { a = b = rows[0]; }
  if (z >= rows[rows.length - 1][0]) { a = b = rows[rows.length - 1]; }
  const span = b[0] - a[0];
  const t = span === 0 ? 0 : (z - a[0]) / span;
  const L = (i) => a[i] + (b[i] - a[i]) * t;
  return { half: L(1), top: L(2), bot: L(3), knuckle: L(4), deckFlat: L(5), flare: L(6) };
}

/** Linear interpolation of the RIDGE table at an arbitrary z, same columns. */
function ridgeSectionAt(z) {
  const rows = RIDGE_STATIONS;
  let a = rows[0], b = rows[1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (z >= rows[i][0] && z <= rows[i + 1][0]) { a = rows[i]; b = rows[i + 1]; break; }
  }
  if (z <= rows[0][0]) { a = b = rows[0]; }
  if (z >= rows[rows.length - 1][0]) { a = b = rows[rows.length - 1]; }
  const span = b[0] - a[0];
  const t = span === 0 ? 0 : (z - a[0]) / span;
  const L = (i) => a[i] + (b[i] - a[i]) * t;
  return { half: L(1), top: L(2), bot: L(3), knuckle: L(4), deckFlat: L(5), flare: L(6) };
}

/** The twelve-point section at z, from either table. The seat work's one primitive. */
const profileAt = (z, section = sectionAt) => {
  const c = section(z);
  return G.facetProfile({
    maxHalf: c.half, top: c.top, bottom: c.bot,
    knuckle: c.knuckle, deckFlat: c.deckFlat, flare: c.flare,
  });
};

/**
 * THE HULL'S OWN UPPER SURFACE at (z, x): the section polyline from the STARBOARD
 * KNUCKLE up the deck chamfer, across the deck flat, over the CAMBERED CROWN and back
 * down to the port knuckle. `facetProfile` returns those seven points as indices
 * 2..8, monotone decreasing in x, so the walk is a straight scan.
 *
 * The deck is not flat and it never was: the crown sits 6.79% of the section depth
 * above the deck plate line and the deck chamfer falls another 10.5% of it over the
 * outboard third of the half-beam. Anything authored at `sectionAt(z).top + k` is
 * therefore NOT lying on the deck — it is a horizontal plane cutting through a
 * cambered one, which is both an axis-aligned face the section audit charges for and
 * a plate that visibly floats at one end and sinks at the other. Ask this function
 * instead.
 *
 * Outside the knuckles it clamps, because past the knuckle the surface is the flank
 * and a "deck height" there is not a defined thing.
 */
function deckSurfaceY(z, x) {
  const P = profileAt(z);
  for (let i = 2; i < 8; i++) {
    const a = P[i], b = P[i + 1];
    if (x <= a[0] && x >= b[0]) {
      const t = (x - a[0]) / ((b[0] - a[0]) || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return x > P[2][0] ? P[2][1] : P[8][1];
}

/**
 * THE KNUCKLE at z, starboard side: the widest point of the section and the hard
 * 80.8-degree chine that runs the length of the ship. This is where the running lights
 * go, because it is the one edge that is visible from above, from abeam and from
 * ahead, and it is where a rim light lands from any key.
 *
 * EIGHTY-POINT-EIGHT, not forty-four. This comment and the one at the flank strakes
 * both said "a hard 44-degree chine" and 44 is stale from the eight-facet build that
 * `greeble.js#facetProfile` explains was thrown away. The six-facet section's five
 * dihedrals are 6.2 / 35.3 / 80.8 / 32.6 / 10.6 (greeble.js:271-273) and the knuckle
 * is the third. It matters because every module in the library is now asked to carry
 * a chine that echoes it (modules/kit.js#MODULE_CHINE), and echoing 44 would put the
 * module's hardest edge in a band the hull does not use.
 *
 * The outward normal is the average of the two facets that meet at it, which is what
 * makes a lamp sitting on it face out of the corner rather than out of one plane.
 */
function chineAt(z) {
  const s = sectionAt(z);
  const P = G.facetProfile({
    maxHalf: s.half, top: s.top, bottom: s.bot,
    knuckle: s.knuckle, deckFlat: s.deckFlat, flare: s.flare,
  });
  const belt = P[1], knuck = P[2], shoulder = P[3];
  // Outward normal of a CCW segment (dx, dy) is (dy, -dx).
  const nrm = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  };
  const n1 = nrm(belt, knuck), n2 = nrm(knuck, shoulder);
  const nx = n1[0] + n2[0], ny = n1[1] + n2[1];
  const len = Math.hypot(nx, ny) || 1;
  return { x: knuck[0], y: knuck[1], nx: nx / len, ny: ny / len };
}

// ---------------------------------------------------------------------------
// Aimed structure. Struts on this hull run between two points in space - the yoke
// arms, the grapples, the truss diagonals - and euler angles at a seam are where the
// bugs live. Building the basis directly is shorter than the maths it replaces and it
// cannot be off by a sign.
// ---------------------------------------------------------------------------

const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3();
const _basis = new THREE.Matrix4();

/**
 * A plate lying ON the lower flank, from z0 to z1, standing `out` metres proud of it.
 *
 * The two points that bound the lower-flank facet at any station are `facetProfile`
 * indices 3 (the knuckle) and 2 (the belt break). Offsetting both along that facet's
 * outward normal gives a four-point section that is, by construction, exactly parallel
 * to the surface underneath it — which a straight prismatic bar at a fixed x cannot be
 * on a hull whose half-beam moves 72 m over its length.
 *
 * Sampled at every spine station inside the range plus both ends, so the plate follows
 * the sweep. `side` is -1 for port.
 */
/**
 * THE SEAT'S LOAD-BEARING PRIMITIVE: a plate lying ON a lofted skin.
 *
 * `flankStrake` below does this for exactly one facet (the lower flank) of exactly
 * one loft (the hull), which is all it needed to. A SEAT needs it for the deck, the
 * upper flank, the deck chamfer and the dorsal ridge's own section, so the maths is
 * generalised here and `flankStrake` keeps its own body byte-for-byte.
 *
 * Given two `facetProfile` indices it walks the station table, takes the two points
 * that bound that facet at each station, insets along the facet, offsets along the
 * facet's OUTWARD NORMAL, and lofts the result. The plate is therefore parallel to
 * the surface underneath it at every station BY CONSTRUCTION, which is the property
 * that separates a plate run from a bar laid across a hull whose section moves.
 *
 * `drift` walks the plate ACROSS the facet as it runs in z, which is how the 7 and
 * 16 degree plate angles the seat wants are built: an angled plate that is still on
 * the surface. A plate rotated in world space is a plate that leaves the surface.
 *
 * TWO THINGS THAT ARE NOT COPIED FROM `flankStrake`, and both are deliberate.
 *
 *  1. THE SIGN OF THE NORMAL. `facetProfile` winds counter-clockwise seen from +Z
 *     with the index increasing UP the starboard side, so the outward normal of the
 *     edge i -> j is (dy, -dx) ONLY when j > i. `flankStrake` is called with the
 *     facet written as [2, 1] - knuckle down to the keel chamfer, i.e. decreasing -
 *     so the normal it computes points INWARD and its three plates a side sit 13 m
 *     inside the skin with their outer faces coplanar with it. Measured: at z -500
 *     the offset lands at (104.5, 14.6) against a knuckle at (114.0, 5.6), which is
 *     inside the section. That is a hull defect, it predates this file's seat work,
 *     and correcting it would move the hull's own outline over 620 m of flank - so it
 *     is REPORTED and not changed here. This function takes the sign from the index
 *     order and is therefore proud whichever way the facet is written.
 *  2. THE WINDING IS MEASURED, NOT ASSUMED. The four-point section is emitted, its
 *     signed area taken, and the order reversed if it came out clockwise. Four
 *     facets times two sides times two normal directions is sixteen chances to get a
 *     hand-written winding wrong and see it only as a hollow plate in one view.
 *
 * @param {Object} p
 * @param {number[][]} p.rows      station table to take z breaks from
 * @param {Function} p.section     z -> {half, top, bot, knuckle, deckFlat, flare}
 * @param {number[]} p.facet       two `facetProfile` indices bounding the facet
 * @param {number} p.t0,p.t1       inset along the facet, 0 at facet[0], 1 at facet[1]
 * @param {number} p.drift         t shift from z0 to z1; this is the plate's angle
 * @param {number} p.out           metres proud of the skin
 * @param {number[]} p.offset      world offset, for a loft that is not on the axis
 */
function skinPlate({
  z0, z1, side = 1, rows = HULL_STATIONS, section = sectionAt, facet = [2, 1],
  t0 = 0.08, t1 = 0.92, drift = 0, out = 3, offset = [0, 0], full = true,
}) {
  const zs = [z0];
  for (const r of rows) if (r[0] > z0 && r[0] < z1) zs.push(r[0]);
  zs.push(z1);
  const thin = full || zs.length <= 3
    ? zs : zs.filter((z, i) => i === 0 || i === zs.length - 1 || i % 2 === 0);
  const sgn = facet[1] > facet[0] ? 1 : -1;
  const span = (z1 - z0) || 1;

  const stations = thin.map((z) => {
    const P = profileAt(z, section);
    const A = P[facet[0]], Bp = P[facet[1]];
    const dx = Bp[0] - A[0], dy = Bp[1] - A[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (dy / l) * out * sgn, ny = (-dx / l) * out * sgn;
    const k = drift * ((z - z0) / span);
    const ta = Math.min(0.97, Math.max(0.03, t0 + k));
    const tb = Math.min(0.97, Math.max(0.03, t1 + k));
    const ax = A[0] + dx * ta, ay = A[1] + dy * ta;
    const bx = A[0] + dx * tb, by = A[1] + dy * tb;
    let pts = [
      [ax, ay], [bx, by], [bx + nx, by + ny], [ax + nx, ay + ny],
    ].map(([x, y]) => [side * x + offset[0], y + offset[1]]);
    // Signed area; a clockwise section lofts inside-out.
    let a2 = 0;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      a2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    if (a2 < 0) pts = pts.slice().reverse();
    return { z, points: pts };
  });
  return G.loft(stations);
}

/**
 * The three proud plates a side, below the knuckle. Now a thin wrapper on `skinPlate`,
 * and the reason is a bug that had them BURIED IN THE HULL rather than proud of it.
 *
 * `greeble.js#facetProfile` winds counter-clockwise with the index increasing UP the
 * starboard side, so for an edge i -> j the outward normal is `(dy, -dx)` ONLY WHEN
 * j > i. This function was called with the facet written `[2, 1]` — knuckle down to the
 * keel chamfer, i.e. DECREASING — and applied `(dy/l, -dx/l)` with no sign correction,
 * which is the INWARD normal.
 *
 * MEASURED at z = -500 (maxHalf 114, top 57, bottom -50, knuckle 0.48, deckFlat 0.53,
 * flare 0.90), knuckle P[2] at (114.0, 5.6):
 *
 *   facet [2,1], no sign   offset 13 m lands at (104.5,  14.6)   INSIDE the section
 *   facet [1,2], signed    offset 13 m lands at (123.5,  -3.3)   proud, correct
 *
 * confirmed by point-in-polygon against the section itself. So all three strakes a side
 * sat 13 m inside the hull with their outer faces exactly COPLANAR with the skin. They
 * carry the `dark` surface — the ship's entire second value, the near-black below the
 * knuckle — so that value was being rendered by whichever of two coplanar faces won the
 * depth test. A z-fight waiting to flicker, and the visible cause of the striping in the
 * hull renders.
 *
 * `skinPlate` already does this correctly: it takes `sgn` from the index order at its
 * line 702 and applies it to the normal. Delegating rather than duplicating the fix means
 * there is now ONE place in this file that knows how to offset along a facet normal.
 *
 * NOT a cosmetic change: it moves the hull's own outline by up to 9 m in x over 620 m of
 * flank, so it is re-measured against the section/surface audit, the R2.6 enclosed-
 * background band and the loadout separation rather than assumed safe.
 *
 * The 6%/94% band is the old inset, preserved: a plate that reaches both chines is not a
 * plate, it is the flank. Expressed from the keel end because the facet now reads upward.
 */
function flankStrake(z0, z1, side, out, full) {
  return skinPlate({ z0, z1, side, out, full, facet: [1, 2], t0: 0.06, t1: 0.94 });
}

/** A hex beam from a to b. Right-handed basis, so winding and shadows stay correct. */
function beam(a, b, radius, { radiusEnd = null, caps = true, detail = G.DETAIL.FULL } = {}) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _d.length();
  if (len < 1e-4) return null;
  _d.divideScalar(len);
  _up.set(0, 1, 0);
  if (Math.abs(_d.y) > 0.94) _up.set(0, 0, 1);
  _u.crossVectors(_up, _d).normalize();
  _v.crossVectors(_d, _u).normalize();
  _basis.makeBasis(_u, _v, _d);
  _basis.setPosition(a[0], a[1], a[2]);
  const g = G.hexStrut({ length: len, radius, radiusEnd, axis: 'z', caps, detail });
  g.applyMatrix4(_basis);
  return g;
}

// ---------------------------------------------------------------------------
// MATERIAL ASSIGNMENT. THREE surfaces, down from six.
//
// `hullDark` folded into `plating`, `glass` replaced by emissive window bands, and
// `trim` deleted outright - it carried six bolt rings and one hazard patch in a bone
// colour that review called out as out-of-family, for a whole draw call. Because the whole
// art direction is that a hull of mismatched salvage still reads as ONE object, and
// that survives exactly as long as the number of distinct surfaces in frame stays
// small. It is also two fewer draw calls per damage group, which is the point: the
// build is at 650 draws against a committed 320.
//
// `plating` carries seed 1 so its plate layout differs from every other hull in the
// game at the same faction and tier - the cheapest half of the fix for D4's visible
// tiling over 1400 m.
// ---------------------------------------------------------------------------

const SURFACE = {
  hull: ['hull', { faction: 'player', wear: 0.5, tier: 2 }],
  plating: ['plating', { faction: 'player', wear: 0.4, tier: 2, seed: 1 }],
  /**
   * THE SECOND VALUE, and its absence was a blocker.
   *
   * Round-one blind review counted the surface assignments and found 130 of 136 going
   * to hull / plating / greeble — albedo Y 0.192 / 0.249 / 0.332, eight tenths of a
   * stop end to end — with `baseDark` (Y 0.024) used six times and only inside
   * recesses. So the ship read as ONE BONE VALUE at every distance no matter how it
   * was lit, which is the opposite of the amber / bone / near-black identity
   * look-target.md names, and it is an ALBEDO problem, not an exposure one.
   *
   * `hullDark` draws its albedo from palette.js#player.baseDark (0x2b2722, the
   * near-black of the three), and it now carries LARGE AREAS rather than crevices:
   * the three flank strakes a side, the stern block's armour casing, the drive
   * pylons, the thrust frames, the bay's rail fairings and the tow-track beams.
   *
   * EVERY ONE OF THOSE IS BELOW THE KNUCKLE, and that is a rule rather than an
   * accident. The knuckle is the section's widest point and its hardest chine - an
   * 80-degree dihedral, the one edge on this hull visible from above, from abeam and
   * from ahead. Deck and upper flank above it in bone, lower flank below it in
   * near-black, and the knuckle itself is where they meet, so the value boundary is a
   * real geometric edge with a shadow at it rather than a line that stops in the
   * middle of a face - which §4 names as the diagnostic for a decal on styrene. The
   * dorsal ridge is deliberately NOT dark for the same reason: it sits above the
   * knuckle, and putting the second value on both sides of an edge is the one thing
   * that stops the edge reading as the boundary between them.
   *
   * IT COSTS ONE DRAW CALL PER DAMAGE GROUP, and the offset is stated in the build:
   * the engine group's `plating` bucket is gone, its contents moved here, so LOD0 is
   * ten draws where it was nine and LOD1 and LOD2 are unchanged. The benchmark's
   * camera sits at 7.2 km, i.e. LOD1 for this hull, so the number the draw ceiling is
   * measured against does not move at all.
   */
  dark: ['hullDark', { faction: 'player', wear: 0.5, tier: 2 }],
  greeble: ['greeble', { faction: 'player', wear: 0.6, tier: 1 }],
  /**
   * A HEAT-REJECTION PANEL IS NOT ARMOUR. Cross-stream change requested by the
   * surface stream and recorded in its report: round-two review named it a BLOCKER
   * that "the radiator fins, which are heat-rejection panels ... should never carry
   * an armour-plate map". Everything on the geometry side is the surface NAME; the
   * map behind it is `art/materials` -> `textures/panelLines.js#radiatorField`.
   */
  radiator: ['radiator', { faction: 'player', wear: 0.55, tier: 1 }],
};

/**
 * Damage groups, down from three. The bridge tower does not need independent damage
 * GEOMETRY - it needs an independent material swap, and that costs nothing. The drive
 * array genuinely dies on its own, so it keeps its group.
 */
const GROUPS = ['core', 'engine'];

class Buckets {
  constructor() { this.map = new Map(); }

  /** @param {string} group @param {string} surface @param {THREE.BufferGeometry} geo */
  add(group, surface, geo, xf = null) {
    if (!geo) return;
    const key = `${group}/${surface}`;
    let b = this.map.get(key);
    if (!b) { b = { key, group, surface, parts: [], uv: true }; this.map.set(key, b); }
    b.parts.push(xf ? { geo, ...xf } : { geo });
  }

  /** Parts whose UVs are authored (glow discs, running-light strips). */
  addRaw(group, surface, geo, xf = null) {
    const key = `${group}/${surface}#raw`;
    let b = this.map.get(key);
    if (!b) { b = { key, group, surface, parts: [], uv: false }; this.map.set(key, b); }
    b.parts.push(xf ? { geo, ...xf } : { geo });
  }

  list() { return Array.from(this.map.values()); }
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

/**
 * Pure geometry. No materials, no THREE.Mesh, nothing that needs a GPU or a DOM -
 * which is what lets `tools/` count triangles for this hull without a browser.
 *
 * @param {{rng: import('../../core/rng.js').RNG, lod?: number}} p
 * @returns {{buckets: Array, lights: Array, masses: Array, detail: number}}
 */
export function hullParts({ rng, lod = 0 }) {
  const D = G.detailForLod(lod);
  const B = new Buckets();
  const r = rng.fork('cruiser:hull');
  const masses = [];

  const massBox = (id, x0, y0, z0, x1, y1, z1) => {
    masses.push({
      id,
      box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)),
    });
  };

  // =========================================================================
  // LOD2 — THE 30 PIXEL READ.
  //
  // At max zoom the hull is 32 px wide and 43 m to the pixel, and THIS is what is on
  // screen. So the triangles here are spent on exactly six things and nothing else:
  // the waist, the shoulder, the asymmetric prow, the stern-block step, the dorsal
  // ridge as a distinct raked mass, and the bay throat as an ACTUAL HOLE.
  //
  // The rule that keeps a far LOD from falling apart: every proxy has at least a third
  // of its own depth buried inside the spine. A block that merely touches the hull
  // reads as a detached slab floating alongside it the moment shading flattens out.
  // =========================================================================
  if (lod >= 2) {
    // -----------------------------------------------------------------------
    // WHY THIS IS AUTHORED OUTWARD FROM FOUR NAMED FEATURES, not decimated inward.
    //
    // An older LOD2 passed the review loop's IoU gate at 0.764 and was still, read
    // blind, "a fish with a caudal fin". IoU was the wrong instrument: FILLING A HOLE
    // BARELY MOVES AN INTERSECTION-OVER-UNION RATIO, because closing the hole adds the
    // same pixels to the intersection and to the union. So the proxy had quietly
    // closed the ventral bay throat into a solid rectangle and turned the hooked
    // cutter yoke into a straight spike, and the number said 0.764 and passed.
    //
    // `tools/silhouette.mjs` therefore checks four features in the LOD2 mask itself:
    //
    //   1. the bay as a genuine THROUGH-VOID whose narrowest clear span is >= 87 m
    //   2. the superstructure as a distinct raised mass over z -420..-120
    //   3. the cutter yoke's HOOK - down-and-forward, then forward-and-UP
    //   4. the stern-block STEP
    //
    // All four are built below and every number is a pick from, or a proxy of, the
    // LOD0 tables.
    // -----------------------------------------------------------------------
    const far = G.FACET_LOD.far;
    B.add('core', 'hull', NADIR.loft({ at: LOD2_Z, keep: SECTION_LOD.far, capBack: false }));
    // Transom with the empty drive well still cut into it: the well is a 108 m hole
    // and 108 m is 2.5 px at max zoom, which is exactly the threshold that matters.
    const transom2 = stationProfile(HULL_STATIONS[0], far);
    B.add('core', 'hull', G.ringFace(transom2, wellProfile(transom2), WELL.mouthZ, true));

    // FEATURE 2 — THE DORSAL RIDGE. Three of the twelve stations, at the 8-gon, which
    // is enough to keep a raked ridge that rises out of the deck and falls back into
    // it. A stepped stack would have needed the boxes; a ridge needs three stations.
    B.add('core', 'hull', RIDGE.loft({
      at: [-430, -300, -150, 60], keep: SECTION_LOD.far, capFront: false, capBack: false,
    }), { pos: [RIDGE_X, 0, 0] });

    // FEATURE 1 — THE BAY, AS AN ACTUAL HOLE, and it is the last thing that may ever
    // be simplified away. Two chords a side with 92 m of clear air between them, and
    // 110 m of clear air between rail and hull flank, tied by two end frames. In
    // profile the band between the chords is background; in plan the bands between
    // rail and flank are background. Two open faces on one void: as the camera orbits,
    // stars pass through it, which is the difference between a hole and a dark patch
    // of hull, and it is the only thing at this range that says salvager.
    // The rail and the chord are THE SAME MASSES LOD0 USES, at the far cardinality and
    // three stations, and that is a coherence fix rather than a flourish. They were two
    // `bevelBox` stand-ins 320 m long with the pre-taper section, and when LOD0's became
    // five-station lofts with a 0.32 roll the far level stopped agreeing with the near
    // one about where the bottom of the ship is: the LOD coherence IoU fell 0.764 to
    // 0.763 on a 0.044 margin. Driving both levels from one table is the only version
    // of this that cannot drift again. 8 points and 3 stations is 28 triangles a
    // member against the `bevelBox`'s 12 at FAR detail.
    for (const s of [-1, 1]) {
      B.add('core', 'dark', BAY_RAIL.loft({ at: [-10], keep: SECTION_LOD.far }),
        { pos: [s * (BAY.railIn + BAY.railOut) * 0.5, (BAY.roof + BAY.chordTop) * 0.5, 0],
          rot: [0, 0, s * RAIL_ROLL] });
      B.add('core', 'dark', BAY_CHORD.loft({ at: [-10], keep: SECTION_LOD.far }),
        { pos: [s * (BAY.chordOut + BAY.chordIn) * 0.5, (BAY.chordBot + BAY.floor) * 0.5, 0],
          rot: [0, 0, s * CHORD_ROLL] });
    }
    // The two frame proxies stand in for LOD0's five, AND THEY RAKE WITH THEM. This
    // is the same feature at two levels: when `BAY.frames` gained its rake column the
    // LOD0 side mask changed and these did not, and the LOD coherence IoU — 0.044 of
    // margin, the tightest figure in the game — fell 0.764 to 0.762 for it. Each proxy
    // carries the mean rake of the LOD0 frames it replaces: +0.18 for the forward pair
    // at z 215 / 60, +0.072 for the aft three at z 0 / -110 / -230.
    for (const [z, t, rake] of [[148, 26, 0.18], [-148, 22, 0.072]]) {
      B.add('core', 'dark', G.bevelBox({
        width: BAY.railOut * 2, height: BAY.frameTop - BAY.frameBot, depth: t, chamfer: 8, detail: D,
      }), { pos: [0, (BAY.frameTop + BAY.frameBot) * 0.5, z], rot: [rake, 0, 0] });
    }

    // FEATURE 3 — THE HOOK. Two segments a side, and they bend the OTHER WAY at the
    // knuckle: down-and-forward to y -182, then forward-and-up to the tip. One
    // straight wedge is a spike, and a spike reads as a ram, which inverts the whole
    // thesis of the ship - it leads with a tool, not a gun. The tips still stop 36 m
    // SHORT of the stem: the hull is the forwardmost thing on this ship at every LOD.
    for (const key of ['port', 'stbd']) {
      const y = YOKE[key];
      B.add('core', 'dark', beam(y.root, y.knuckle, 26, { detail: D }));
      B.add('core', 'dark', beam(y.knuckle, y.tip, 20, { detail: D }));
    }

    // FEATURE 4 — the stern-block step is carried by the hull picks above (-700,
    // -560, -440), and the DRIVE ARRAY STANDS OUTBOARD OF IT on two single pylons, so
    // in plan there is open sky both fore and aft of each pylon. From dead astern -
    // which is where a tactical camera spends most of a chase - that gap is the
    // difference between a drive array and a wider transom.
    for (const s of [-1, 1]) {
      B.add('core', 'dark', G.bevelBox({
        width: POD.halfW * 2, height: POD.top - POD.bot, depth: POD.z1 - POD.z0,
        chamfer: 9, draft: 7, detail: D,
      }), { pos: [s * POD.x, 0, (POD.z0 + POD.z1) * 0.5] });
      for (const pz of POD.pylonZ) {
        B.add('core', 'dark', G.bevelBox({
          width: POD.x - 128, height: 44, depth: POD.pylonT, chamfer: 7, cant: s * 0.10, detail: D,
        }), { pos: [s * (POD.x + 128) * 0.5, 8, pz] });
      }
    }

    // Two of the three radiator panels. At 43 m/px a 150 m panel raked out over the
    // flank is 3.5 px of hard diagonal against black, and the aft end of this ship is
    // not identifiable without them.
    for (const [s, z, chord, span, rake] of FINS.slice(0, 2)) {
      B.add('core', 'radiator', G.radiatorFin({
        chord, span, thickness: 14, sweep: -chord * 0.42, tipChord: chord * 0.6, detail: D,
      }), { pos: [s * 112, 54, z], rot: [0, 0, rake] });
    }

    massBox('spine', -156, -92, -700, 156, 96, 700);
    return { buckets: B.list(), lights: [], masses, detail: D };
  }

  /** True only at LOD0. Anything authored below 12 m lives behind this (§0). */
  const full = lod === 0;
  const mid = D >= G.DETAIL.MID;

  // =========================================================================
  // 1. M1 — THE SPINE
  //
  // At LOD1 the stations are thinned by HAND, not by `decimate`, and the ones that
  // are kept are the ones that ARE the silhouette: the transom, the stern step, the
  // waist, the shoulder, the foredeck and all three prow stations. A blind
  // every-other-station decimation dropped the waist and two of the three prow
  // stations, which is precisely how the ship came to read as a different class at
  // 5 km than at 3 km.
  // =========================================================================
  const card = full ? SECTION_LOD.full : SECTION_LOD.mid;
  B.add('core', 'hull', NADIR.loft({ at: full ? null : LOD1_Z, keep: card, capBack: false }));
  massBox('spine', -170, -90, -700, 170, 70, 700);

  // -------------------------------------------------------------------------
  // THE FLANK STRAKES — the ship's second value, and it is CUT FROM THE HULL'S OWN
  // SECTION rather than bolted across it.
  //
  // This used to be `armourBelt`, a straight 640 m prismatic bar standing at a fixed
  // x. On a hull whose half-beam ran 94 to 128 that bar poked out at the ends and sank
  // into the flank in the middle, which is most of what "plate language is pillowy,
  // not industrial" and "nothing has the flat face plus hard chamfer plus recessed
  // groove" were describing. A straight bar cannot lie on a curved flank.
  //
  // `flankStrake` walks the spine table over a z range, takes the two points that
  // bound the LOWER FLANK at each station — the knuckle and the belt break — and
  // offsets them 13 m along that facet's own outward normal. So the plate is exactly
  // the shape of the surface it is bolted to, at every station, for free.
  //
  // THREE PLATES A SIDE with 14 m gaps that read as recessed grooves. They stop AT THE
  // KNUCKLE and never wrap over it: deck and upper flank in bone above, lower flank in
  // near-black below, and the knuckle — a hard 80.8-degree chine, the one edge on this
  // ship visible from every angle — is where the two values meet. A value boundary on
  // a real geometric edge with a shadow at it is a plated hull; the same boundary in
  // the middle of a face is a decal on styrene.
  //
  // DEFECT, MEASURED AND NOT FIXED HERE. `flankStrake` is called with its facet
  // written [2, 1] — knuckle DOWN to the keel chamfer, i.e. decreasing index — and
  // `facetProfile` winds counter-clockwise with the index increasing UP the starboard
  // side, so the "(dy, -dx)" it computes is the INWARD normal. At z -500 the knuckle
  // is at (114.0, 5.6) and the 13 m offset lands at (104.5, 14.6), which is inside the
  // section. These three plates a side are therefore 13 m INSIDE the skin with their
  // outer faces coplanar with it, not 13 m proud of it, and the second value is being
  // rendered by whichever of two coplanar faces wins the depth test.
  //
  // It is reported rather than corrected because flipping the sign moves the hull's
  // own outline by up to 9 m over 620 m of flank at six stations, and this wave's
  // brief is that the hull form is not to move. `#skinPlate`, which the mount seats
  // use, takes the sign FROM THE INDEX ORDER and cannot have this bug.
  // -------------------------------------------------------------------------
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[-620, -418], [-404, -200], [-186, 18]]) {
      B.add('core', 'dark', flankStrake(z0, z1, s, 13, full));
    }
  }

  // -------------------------------------------------------------------------
  // EIGHT STRUCTURAL FRAMES, AS REAL 6 m STEPS IN THE PLANE.
  //
  // §3's plate rhythm is a 180 m structural frame beating against a 45 m plate break,
  // and two rhythms beating is what stops either reading as tiling. Until now the
  // 180 m rhythm was TEXTURE at every range and geometry at two stations. With the
  // triangle budget lifted it is geometry at all eight: a 6 m step in the section,
  // built from the hull's own profile at that z scaled up 4%, which is 34 triangles
  // each and survives to LOD1. That step is what makes a 1.4 km hull read as 1.4 km
  // rather than as a 400 m hull photographed closer.
  //
  // They are NOT evenly spaced — 180 m nominal, jittered by the zones they land in —
  // because a perfectly even rhythm is the other way to read as tiling.
  // -------------------------------------------------------------------------
  if (mid) {
    for (const z of [-590, -430, -300, -160, -20, 140, 290, 430]) {
      const sec = sectionAt(z);
      const ring = (k) => G.facetProfile({
        maxHalf: sec.half * k, top: sec.top + (k - 1) * 40, bottom: sec.bot - (k - 1) * 40,
        knuckle: sec.knuckle, deckFlat: sec.deckFlat, flare: sec.flare,
        keep: full ? null : G.FACET_LOD.mid,
      });
      B.add('core', 'plating', G.loft([
        { z: z - 5, points: ring(1.0) },
        { z: z - 3, points: ring(1.04) },
        { z: z + 3, points: ring(1.04) },
        { z: z + 5, points: ring(1.0) },
      ], { capFront: false, capBack: false }));
    }
  }

  // =========================================================================
  // 2. M3 — THE DORSAL RIDGE, FAIRED IN
  //
  // One loft, twelve stations, sharing the hull's plate family and its own taper. It
  // rises out of the deck plane at z -430 and falls back into it at z +60; there is no
  // step anywhere on it and no box sitting on top of anything. Both ends are OPEN
  // (`capFront: false, capBack: false`) because both ends are inside the hull loft —
  // a cap there would be a coplanar face buried in the deck, which is a z-fight.
  //
  // ALL TWELVE STATIONS SURVIVE TO LOD1 in z and eight at LOD2; they cost 330 and 96
  // triangles and the ridge is the ship's whole dorsal read. Thinning it was pure
  // silhouette loss for no measurable saving.
  // =========================================================================
  B.add('core', 'hull', RIDGE.loft({
    at: full ? null : RIDGE_LOD1_Z, keep: card, capFront: false, capBack: false,
  }), { pos: [RIDGE_X, 0, 0] });
  massBox('dorsal', RIDGE_X - 84, 44, -430, RIDGE_X + 84, 138, 60);

  // -------------------------------------------------------------------------
  // THE FILLET, and it is the difference between "grown out of the hull" and "sat on
  // top of it". Where the ridge meets the deck there is one extra station 14 m out
  // from the join on each side, so the join is a chamfer and not a right angle. It is
  // a second, much flatter loft lying along the same z values, 20 m tall.
  //
  // IT NOW LIES ON THE DECK INSTEAD OF CUTTING THROUGH IT, and that was a real defect
  // and not only a metric. Both of its long chords used to be written at `sec.top - 2`
  // and `sec.top - 22`: two DEAD-FLAT HORIZONTAL PLANES 208 m wide running 490 m, on a
  // deck that is cambered by 6.79% of section depth and that falls away down the deck
  // chamfer outboard of the deck flat. Consequences, both measured:
  //
  //   - it was the LARGEST single contributor of axis-aligned area left on this hull
  //     once the bay frames were raked: 132 triangles, 60% own-axis, 3.3% of the whole
  //     ship's surface, and the top-six list's only `core/hull` entry
  //   - at z -300 the fillet's PORT rim sits at hull x -120, which is 20 m outboard of
  //     the deck chamfer, where the hull's own surface is at y 15.8. The rim was
  //     written at y 51. The plate was floating 15 m clear of the hull it fillets.
  //
  // Both chords now follow `deckSurfaceY` — the section's own polyline from the
  // starboard knuckle up over the cambered crown and down to the port knuckle — so the
  // fillet is parallel to the surface it lies on at every station and at every x, by
  // construction, which is the same property `skinPlate` gives every plate run on this
  // ship. One extra vertex per chord: 132 triangles becomes 176.
  // -------------------------------------------------------------------------
  if (mid) {
    B.add('core', 'hull', G.loft(RIDGE_STATIONS.map((r) => {
      const w = r[1] + 16;
      // The chamfer's top rim height, unchanged: a blend of the ridge crown and the
      // deck under it. Only the two chords move.
      const shoulder = r[2] * 0.32 + sectionAt(r[0]).top * 0.68;
      const deck = (x) => deckSurfaceY(r[0], x + RIDGE_X);
      const lift = shoulder - deck(w - 14);
      return {
        z: r[0],
        points: [
          [w, deck(w) - 2], [w - 14, shoulder], [0, deck(0) + lift], [-w + 14, shoulder],
          [-w, deck(-w) - 2],
          [-w, deck(-w) - 22], [0, deck(0) - 22], [w, deck(w) - 22],
        ],
      };
    }), { capFront: false, capBack: false }), { pos: [RIDGE_X, 0, 0] });
  }

  // -------------------------------------------------------------------------
  // THE DORSAL BARBETTE — the one hardpoint anchor this redesign is allowed to move,
  // and the reason it has to.
  //
  // `CRUISER_ANCHORS.dorsal` used to be [0, 94, -40], the top of the raised armour
  // spine. The ridge crown is at exactly that height at exactly that station, so the
  // anchor could have stayed put — and `modules/audit.mjs` says it must not. Measured
  // with the mount at y 94, `rail_battery / missile_cells` separates by a peak of
  // 120 m against a 140 m bar: a rail battery's barrels reach forward over a foredeck
  // that is now 30 stations deep instead of 11, so the outline the audit samples under
  // them is the DECK rather than the sparse gaps between two stations 340 m apart. The
  // old 233 m peak in those bins was measuring an under-sampled hull, not a module.
  //
  // The fix is structural rather than metric: a capital's dorsal bed sits on a
  // BARBETTE, a 30 m armoured ring standing proud of the deck it turns on, and putting
  // one here raises every dorsal module clear of the foredeck behind it. The anchor
  // moves 30 m up and not one metre in z or x. Moved alone, and re-measured alone.
  // -------------------------------------------------------------------------
  B.add('core', 'hull', G.bevelBox({
    width: 92, height: 30, depth: 116, chamfer: 10, draft: 8, detail: D,
  }), { pos: [-6, 109, -40] });
  if (mid) {
    B.add('core', 'plating', G.bevelBox({
      width: 110, height: 10, depth: 132, chamfer: 6, draft: 7, detail: D,
    }), { pos: [-6, 92, -40] });
  }

  // THE DORSAL CUTAWAY. The deck plating over the waist simply is not there: three
  // exposed frames, and the sheer already dips 16 m underneath them. This is a recess
  // deeper than 8 m, so greeble inside it self-shadows and reads as depth rather than
  // as noise — the corollary being that if you want greeble somewhere, you cut the
  // recess first.
  B.add('core', 'plating', G.hullRibs({
    count: 3, spacing: 60, span: 116, height: 26, thickness: 12, taper: 0.82, detail: D,
  }), { pos: [0, 46, -462] });

  // Bridge wing, PORT ONLY. There is no starboard twin: the ridge is already 16 m to
  // port and one wing is a stronger read than two. It is a raked plane, not a shelf.
  B.add('core', 'hull', G.bevelBox({
    width: 96, height: 12, depth: 68, chamfer: 5, draft: 9, rake: 12, cant: 0.16, detail: D,
  }), { pos: [-96, 118, -286] });
  B.add('core', 'plating', G.taperedWedge({
    length: 58, width0: 24, height0: 40, width1: 14, height1: 12, shear: -12, detail: D,
  }), { pos: [-126, 106, -286], rot: [0, Math.PI * 0.5, 0] });

  // THE LIT WINDOW BAND, and it is a SCALE CUE before it is decoration. Two bands of
  // 5 m glazing across the ridge's forward face is a storey height, and a storey is a
  // thing every player has stood in. Additive, so it survives a near-black shadow side.
  //
  // The band is PANES with real unlit mullions between them: the dark gaps are gaps in
  // the GEOMETRY, so no amount of bloom closes them and the band reads as a row of
  // windows at every distance it is visible at. Same material, same merge bucket, same
  // draw call.
  for (const [dy, w, panes] of [[0, 58, 5], [-22, 42, 4]]) {
    const pitch = w / panes;
    const paneW = pitch * 0.62;          // 38% of the run is mullion, and it is dark
    for (let i = 0; i < panes; i++) {
      const px = (i - (panes - 1) * 0.5) * pitch;
      B.addRaw('core', 'engineGlow', glowQuad(paneW, 5),
        { pos: [RIDGE_X + px, 118 + dy, -216 + dy * 0.28], rot: [-0.52, 0, 0] });
    }
  }

  // -------------------------------------------------------------------------
  // FLUSH SENSOR APERTURES — THE THING THAT REPLACED THE MAST.
  //
  // The mast was 118 m of pole plus a dish at y +366, i.e. it owned 366 m of a 618 m
  // envelope height. `ship-language.md` §0 measured it as a 2.7 x 0.2 px hair at max
  // zoom: it bought no read at all and it cost the entire proportion of the ship.
  //
  // A phased array is a FLAT PANEL. Three of them, recessed 3 m into the ridge flanks
  // and the foredeck, at three different sizes and no two at mirrored x — 44 x 18 m is
  // a real aperture at 4 km and nothing at 14, which is exactly right for a sensor.
  // This is a proportion fix and a realism fix in one, and it costs 72 triangles
  // against the mast's 56 plus 366 m of envelope.
  // -------------------------------------------------------------------------
  if (mid) {
    B.add('core', 'greeble', G.recess({ width: 44, height: 18, depth: 4, wall: 3, detail: D }),
      { pos: [RIDGE_X - 70, 122, -300], rot: [0, -Math.PI * 0.5, 0.22] });
    B.add('core', 'greeble', G.recess({ width: 34, height: 14, depth: 4, wall: 3, detail: D }),
      { pos: [RIDGE_X + 62, 108, -196], rot: [0, Math.PI * 0.5, -0.18] });
    B.add('core', 'greeble', G.recess({ width: 30, height: 16, depth: 4, wall: 3, detail: D }),
      { pos: [44, 56, 156], rot: [-Math.PI * 0.5, 0, 0.3] });
  }

  // =========================================================================
  // 3. M2 — THE VENTRAL ASSEMBLY: bay, tow track, cutter yoke
  // =========================================================================
  buildBay(B, D, full, r);
  buildYoke(B, D, full);
  massBox('ventral-assembly', -278, BAY.floor, -240, 278, -48, 700);

  // THE TOW TRACK: the keel beam that ties the bay's mouth to the yoke's root, so the
  // two read as ONE 860 m assembly rather than as two unrelated lumps.
  //
  // It hangs 40 m CLEAR of the keel, cantilevered off the reactor bulkhead and picked
  // up by a single stanchion near its forward end. Flush against the keel it was a
  // moulding; slung under it, the 175 x 40 m slot above it is background you can see
  // through, and the assembly reads as running gear bolted to the underside of a ship
  // rather than as part of the ship's shell.
  //
  // IT HANGS LOWER THAN IT DID, and the reason is measurable rather than aesthetic.
  // At y -128 the slot between keel and track was 33 m of background; at y -162 it is
  // 65 m, over 190 m of length, and R2.6's hole budget is counted in area. It is also
  // the difference between a moulding and running gear.
  //
  // THE DOT GRID IS GONE. Round-one review: "a proud rectangular box carries a
  // literal repeating dot-grid bump pattern ... greeble on a proud face with no
  // structural logic, which section 3 explicitly forbids". It was a 96 x 250 m
  // uninterrupted proud face and the surface layer had nothing to do but tile across
  // it. It is now TWO SIDE BEAMS WITH A RECESSED CHANNEL BETWEEN THEM - the recess is
  // 14 m deep, which clears §3's 8 m threshold, so what sits in it self-shadows and
  // reads as depth - and the machinery in the channel is the tow winch and its cable
  // run, which is a thing with a job rather than a bump pattern.
  for (const s of [-1, 1]) {
    B.add('core', 'dark', G.bevelBox({
      width: 30, height: 34, depth: 210, chamfer: 7, draft: 6, rake: s * 8, detail: D,
    }), { pos: [s * 36, -150, 318] });
  }
  B.add('core', 'plating', G.bevelBox({
    width: 44, height: 20, depth: 210, chamfer: 5, draft: 5, detail: D,
  }), { pos: [0, -136, 318] });
  if (mid) {
    B.add('core', 'greeble', G.pipeRun({ length: 168, radius: 9, sides: 6, axis: 'z', flanges: 1, detail: D }),
      { pos: [-14, -146, 236] });
  }
  // The single stanchion that picks the track up near its forward end, and the slot it
  // closes: keel above, track below, bulkhead aft, stanchion forward - four sides, so
  // it is a hole rather than a shadow under an overhang.
  B.add('core', 'plating', G.bevelBox({
    width: 44, height: 74, depth: 30, chamfer: 6, draft: 5, cant: 0.09, detail: D,
  }), { pos: [0, -112, 408] });

  // =========================================================================
  // 3b. THE THREE FEATURES THAT SAY "1400 METRES"
  //
  // Nothing on the first pass was human-sized, so nothing calibrated the hull: a
  // player could read it as 300 m or 3 km and the running lights, at an arbitrary
  // 40 m, could not settle it because 40 m is not a size anyone has stood next to.
  // These three are, and all three are cheap:
  //
  //   the hangar mouth   54 x 34 m, i.e. three fighters wide (a fighter is 18 m)
  //   the window band    5 m glazing, one storey                (built above)
  //
  // There were three. The 26 x 18 m boat-bay hatch on the starboard foredeck is gone:
  // one human-scale cue on each of two surfaces is a calibration, three is a habit,
  // and the hatch was the smallest and least legible of them. The hangar is on the
  // PORT flank only, because a matched pair would read as styling, not as function.
  // =========================================================================
  // The tunnel is bottomless on purpose: the hull's own tumblehome flank, which sits
  // 17 m down it and is not perpendicular to the mouth, is what you see at the end.
  // A slanted back wall inside a straight tube is free depth.
  B.add('core', 'plating', G.recess({ width: 54, height: 34, depth: 30, wall: 5, detail: D }),
    { pos: [-152, 4, -60], rot: [0, -Math.PI * 0.5, 0] });
  B.addRaw('core', 'engineGlow', glowQuad(40, 16),
    { pos: [-132, 0, -60], rot: [0, -Math.PI * 0.5, 0] });

  // =========================================================================
  // 4. SPONSONS. Deliberately NOT mirrored: port owns z +18..+102, starboard owns
  //    z -152..-68 - 170 m apart - so a fully fitted hull is never bilaterally
  //    symmetric (§6 M6). Both sit ON a cradle frame; see the note at the shelf.
  // =========================================================================
  for (const [s, cz] of [[-1, 60], [1, -110]]) {
    // THE SPONSON LANDS ON A CRADLE FRAME, and that is not a detail. Sitting between
    // frames it bridged the 76 m of clear background between hull flank and bay rail
    // and cut the two largest plan-view voids on the ship into six small ones - the
    // exact failure the plan silhouette was blocked on. Over a frame it is carried by
    // structure that is already there and it costs no negative space at all.
    B.add('core', 'hull', G.bevelBox({
      width: 84, height: 28, depth: 88, chamfer: 8, draft: 9, cant: s * 0.13, detail: D,
    }), { pos: [s * 180, 32, cz] });
    // The bracket under it. A shelf with nothing holding it up is a shelf nobody built.
    B.add('core', 'plating', G.taperedWedge({
      length: 62, width0: 44, height0: 52, width1: 26, height1: 16, shear: 18, detail: D,
    }), { pos: [s * 134, 4, cz], rot: [0, s * Math.PI * 0.5, 0] });
    massBox(s < 0 ? 'port-sponson' : 'starboard-sponson',
      s * 180 - 42, 18, cz - 44, s * 180 + 42, 46, cz + 44);
  }

  // =========================================================================
  // 5. M4 — THE STERN: drive well, outrigger pods, radiators
  // =========================================================================
  buildStern(B, D, full, r);
  massBox('stern', -250, -86, -700, 250, 90, -400);

  // =========================================================================
  // 6. THE SIX SEATS, in one vocabulary. See `mountSeat`.
  //
  // These survive to LOD1, which is a change and a deliberate one. The old
  // `emptyMount` returned early at anything past LOD0 on the grounds that "the whole
  // mount assembly is under two pixels" - true of a bolt ring, false of a 130 m
  // apron with three plate runs off it, and the benchmark's camera sits at 7.2 km,
  // i.e. LOD1, so LOD1 is where this ship is actually seen.
  // =========================================================================
  for (const id of ['bow', 'dorsal', 'ventral', 'port', 'starboard', 'engine']) {
    mountSeat(B, id, CRUISER_ANCHORS[id], { detail: D, full, rng: r, card });
  }

  // =========================================================================
  // 7. THE THINGS THE CREW BOLTED ON. 8-14% of hull volume that does not match.
  // =========================================================================
  if (mid) {
    // Salvaged fuel cylinder, starboard flank. Nothing about it matches the hull,
    // which is exactly why it belongs on this ship.
    B.add('core', 'greeble', G.pipeRun({
      length: 250, radius: 38, sides: 6, axis: 'z', flanges: 0, detail: D,
    }), { pos: [148, -30, -300], rot: [0, 0, -0.36] });

    // Captured armour plate, wired on at SEVEN DEGREES off the hull's plate grid. That
    // mismatch is the load-bearing detail: a patch that aligns to the grid reads as
    // design, a patch seven degrees off reads as repair.
    B.add('core', 'plating', G.bevelBox({
      width: 11, height: 62, depth: 170, chamfer: 3, draft: 4, detail: D,
    }), { pos: [-152, 4, -180], rot: [0.1222, 0, -0.42] });

    // Spare drive bell, lashed to the aft deck, ON A CRADLE. The bell used to be
    // pinned at y = +88 over a deck that is at +73, so it hovered fifteen metres above
    // the ship and review found it as a grey slab hanging in empty space at LOD1. A
    // bolted-on object that is not visibly bolted on is not salvage, it is a bug.
    B.add('core', 'plating', G.bevelBox({
      width: 46, height: 12, depth: 52, chamfer: 4, draft: 4, detail: D,
    }), { pos: [52, 68, -542] });
    // IT LIES DOWN, MOUTH ASTERN, AND IT HAS AN INTERIOR SHELL. Stood upright with
    // its mouth to the sky and no inner shell it rendered as a 54 m black ellipse in
    // the aft deck, which review read - correctly - as a missing face rather than as
    // a designed aperture. A cone open at one end must never point at the camera's
    // usual hemisphere, and it must never be hollow.
    B.add('core', 'greeble', G.thrusterBell({
      throat: 17, mouth: 27, length: 44, sides: 6, collar: false, inner: true, detail: D,
    }), { pos: [52, 96, -520], rot: [0, 0, 0.24] });
  }

  if (full) {
    // Exposed rib section, port FLANK - distinct from the dorsal cutaway above it.
    // The ship is not finished and never will be.
    B.add('core', 'greeble', G.hullRibs({
      count: 2, spacing: 58, span: 58, height: 10, thickness: 8, taper: 0.8, detail: D,
    }), { pos: [-98, -18, -420], rot: [0, 0, Math.PI * 0.5] });
  }
  // The cargo derrick that used to stand over the port bow is GONE. It was a
  // 150 m open A-frame reaching up and forward off the forecastle, and in every
  // three-quarter frame it was the second thing at the bow that read as a crane jib.
  // The brief's own detail-density cap says the fix is fewer, larger features, and
  // the hangar mouth carries the "working ship" read better and for a third the cost.

  // =========================================================================
  // 8. RUNNING LIGHTS — exactly 40 m apart along the main axis. Mandatory.
  // =========================================================================
  const lights = [];
  for (let z = -680; z <= 680.01; z += RUNNING_LIGHT_AXIS_SPACING_M) {
    const c = chineAt(z);
    for (const s of [-1, 1]) {
      lights.push({
        pos: [s * (c.x + c.nx * 2.5), c.y + c.ny * 2.5, z],
        normal: [s * c.nx, c.ny, 0],
        // Every fifth light (200 m) is a beacon. Still constant spacing, so it adds
        // rhythm without lying about the ship's size.
        //
        // HALVED from the first pass. At 13 m and 7 m across they rendered as a
        // string of white spheres along the deck edge - a pearl necklace, and by a
        // wide margin the brightest thing in the frame, so they were doing the job
        // the key light is supposed to do. A navigation light is a POINT: it marks
        // the deck edge, it does not light the ship.
        scale: Math.abs(z) % 200 < 1 ? 7 : 4,
      });
    }
  }

  return { buckets: B.list(), lights, masses, detail: D };
}

// ---------------------------------------------------------------------------
// M2a — the salvage bay
// ---------------------------------------------------------------------------

/**
 * A TRANSVERSE FRAME WITH A HOLE IN IT IS A FRAME. A transverse frame without one is
 * a 556 x 152 m plate, and five of those were most of this hull's boxiness.
 *
 * Four members prismed through the frame's thickness and raked as one:
 *
 *   HEAD    full beam, under the keel, DEEPEST ON THE CENTRELINE (26 m) and tapering
 *           to 10 m at the rail. It is the member that welds to the keel across the
 *           throat and cantilevers out to carry a rail 128 m outboard of that weld,
 *           so it is deep where it is welded and shallow where it only has to be a
 *           flange. Its soffit reaches exactly `BAY.chordTop` on the centreline and
 *           no further: the berth below it stays clear.
 *   LEGS    one under each rail fairing, x 226..278 at the head and BATTERED to
 *           240..270 at the sill, so neither of a leg's two long faces is vertical
 *           and neither of its ends is square. They run up INTO the head and down
 *           INTO the sill: two members that merely touch are coplanar, which is a
 *           z-fight, and this bay has been bitten by that once already (see `BAY`).
 *   SILL    the tie across the bottom, inside the bottom chord's own band, crowned
 *           6 m at the centreline so its top face is not a plane either.
 *
 * WHAT THIS COSTS AND WHAT IT BUYS. 56 triangles against the solid slab's 60, so the
 * five frames are 20 triangles CHEAPER. Measured on the whole hull it is worth about
 * five normal clusters and six points of top6, because the opening deletes the two
 * flat +-Z caps' worth of area at the centre and replaces it with four inner reveal
 * faces pointing four new ways.
 *
 * IT IS INVISIBLE IN BOTH GATED VIEWS, AND THAT IS MEASURED RATHER THAN HOPED FOR.
 * `tools/silhouette.mjs` projects orthographically along the axes. Along X the legs
 * cover the full y band the solid plate covered; along Y the head and the sill each
 * cover the full x band. So R2.6's enclosed background, R2.7's clear span and the
 * LOD2 through-void check cannot see the hole at all — which is also why the LOD2
 * frame proxies do NOT need the ring, where they DID need the rake.
 *
 * It is also the honest shape. The bay is a berth: a module's body sits between the
 * chords at y -88..-200, and five solid plates crossing that band at five stations
 * was a berth a module could not be in.
 */
function bayFrame(thickness) {
  const hw = BAY.railOut;                     // 278 — the rail's own outboard face
  const cy = (BAY.frameTop + BAY.frameBot) * 0.5;    // the frame is placed on its centre,
  const top = BAY.frameTop - cy;                     // exactly as the solid slab was, so
  const bot = BAY.frameBot - cy;                     // the rake column keeps its meaning
  const soffitEnd = -70 - cy, soffitMid = BAY.chordTop - cy;  // head 10 m at the rail, 28 at the keel
  const sillEnd = -205 - cy, sillMid = -199 - cy;             // sill  7 m at the rail, 13 at the keel
  const legTop = -64 - cy, legBot = -207 - cy;       // both ends buried in the member beyond
  // THE BATTER IS A METRIC, NOT A LOOK. A leg's two long faces are the only faces on
  // this frame that a rake about X cannot move off an axis, because rotating about X
  // leaves an +-X normal exactly +-X. Over the leg's 143 m of height an 18 m batter is
  // 7.2 degrees and a 16 m one is 6.4; `ships/audit.mjs` scores anything inside 5
  // degrees as axis-aligned, so the first draft's 8 m outer batter (3.2 degrees) was
  // still a flat side of a box. Measured on the whole hull: batter 8/14 reads axis
  // 13.8%, batter 18/16 reads 13.2%.
  const legOutTop = hw, legOutBot = hw - 18;
  const legInTop = BAY.railIn - 6, legInBot = BAY.railIn + 16;
  const q = thickness * 0.5;

  // Every outline is written counter-clockwise in x-y seen from +Z, which is the
  // winding `greeble.js#loft` needs for outward normals and the winding
  // `facetProfile` already uses, so nothing here needs a signed-area correction.
  // All four are convex, which is what `loft`'s fan caps require.
  const head = [[-hw, soffitEnd], [0, soffitMid], [hw, soffitEnd], [hw, top], [-hw, top]];
  const sill = [[-hw, bot], [hw, bot], [hw, sillEnd], [0, sillMid], [-hw, sillEnd]];
  const leg = (s) => {
    const o = [[legInBot, legBot], [legOutBot, legBot], [legOutTop, legTop], [legInTop, legTop]];
    return s > 0 ? o : o.map(([x, y]) => [-x, y]).reverse();
  };

  return G.mergeParts([head, sill, leg(1), leg(-1)]
    .map((o) => ({ geo: G.prism(o, -q, q) })), { uv: false });
}

/**
 * A through-slot 320 m long, 210 m wide and 168 m deep, open ventral and aft. The
 * verification for this is not "does it look open": from a camera at 25 degrees
 * elevation abeam, background must be visible through it.
 *
 * The four bays between the five frames are 96 / 62 / 104 / 58 m. Every frame is where
 * a load path is, and load paths are not evenly spaced.
 */
function buildBay(B, D, full, rng) {
  const railX = (BAY.railIn + BAY.railOut) * 0.5;
  const railW = BAY.railOut - BAY.railIn;
  const len = BAY.z1 - BAY.z0;
  const cz = (BAY.z0 + BAY.z1) * 0.5;

  for (const s of [-1, 1]) {
    // -----------------------------------------------------------------------
    // THE RAIL FAIRING. Round-one review: "the ventral bay is still a road bridge.
    // It is a flat plate girder with four near-evenly-spaced rectangular window
    // openings and untextured white posts, at the same value as the hull and with no
    // plating or machinery ... as built it contributes line-work rather than
    // silhouette area."
    //
    // Every clause of that is now addressed by one change: THE RAIL IS A FAIRING WITH
    // REAL SECTION DEPTH, not a plank. 46 m across and 40 m deep, standing 110 m clear
    // of the hull flank, and it carries `dark` — so the assembly reads as a MASS WITH A
    // HOLE THROUGH IT rather than as scaffolding, and it is a different value from the
    // hull it hangs under.
    //
    // IT IS A `Mass`, NOT A `bevelBox`, AND THAT IS THE VOCABULARY FIX. The previous
    // pass got as far as "not a `panelledSlab`" — a `bevelBox` takes twelve edges off,
    // drafts both ends and cants the section — but a `bevelBox` still has THE SAME
    // SECTION FOR 445 METRES, under a hull whose own section does not hold still for
    // a hundred. `BAY_RAIL` is a five-station loft of the hull's own plate family with
    // a taper, a sheer, a keel line running against the sheer and a beltline that
    // walks 0.44 to 0.52, so the 80.8-degree knuckle that runs the length of the ship
    // continues onto the thing slung under it. See `RAIL_STATIONS`.
    //
    // The roll is the old `cant`, kept: port and starboard roll opposite ways, and
    // because `RAIL_STATIONS` is authored in the member's own frame the roll happens
    // about the member's own axis rather than about the ship's.
    // -----------------------------------------------------------------------
    B.add('core', 'dark', BAY_RAIL.loft({ keep: full ? SECTION_LOD.full : SECTION_LOD.mid }),
      { pos: [s * railX, (BAY.roof + BAY.chordTop) * 0.5, 0], rot: [0, 0, s * RAIL_ROLL] });

    // Bottom chord, slightly inboard of the rail above it so the assembly has a
    // visible section rather than being one prismatic bar — and now with a section of
    // its own that moves, for the same reason.
    B.add('core', 'dark', BAY_CHORD.loft({ keep: full ? SECTION_LOD.full : SECTION_LOD.mid }),
      { pos: [s * (BAY.chordOut + BAY.chordIn) * 0.5, (BAY.chordBot + BAY.floor) * 0.5, 0],
        rot: [0, 0, s * CHORD_ROLL] });

    // One diagonal per rail, braced in OPPOSITE directions port and starboard, and
    // BOTH IN SHORT BAYS. A rectangular frame with no diagonal cannot take a shear
    // load and the eye knows it even when the player could not say why - but a
    // diagonal drawn across the 140 m bay cut the largest void on the ship in half in
    // profile, which is a bad trade for a truss member nobody can name. In a 60 m bay
    // it does the same structural work and costs a void that was never going to read.
    if (full) {
      const [za, zb] = s < 0 ? [-110, -230] : [0, 60];
      B.add('core', 'greeble', beam(
        [s * railX, BAY.chordTop, za], [s * railX, BAY.chordBot, zb], 10,
        { caps: false, detail: D },
      ));
    }

    // DOOR TRACKS AND STANCHION FEET, on the rail's inboard face and nowhere else.
    // This is §3 justification 4 — dense detail on functional edge structure, not on
    // the plate the track is bolted to — and it is the ONLY greeble anywhere on the
    // 320 m assembly. The four outboard rail faces stay calm reserve.
    if (full) {
      if (s < 0) {
        B.add('core', 'greeble', G.greebleBand({
          length: 118, width: 15, height: 11, boxes: 2, conduits: 1,
          rng: rng.fork('bay:track'), detail: D,
        }), { pos: [s * (BAY.railIn + 12), -56, 96], rot: [0, 0, s * 0.4] });
      }
    }
  }

  // THE FIVE TRANSVERSE FRAMES, and they now run THE FULL WIDTH — rail to rail,
  // passing under the keel — instead of being two short stubs a side. That is the
  // actual load path (the rails are 56 m outboard of the hull; something has to carry
  // them) and it is what closes the four plan-view voids at both ends so they are
  // enclosed background rather than an open-ended notch.
  //
  // ALL FIVE SURVIVE TO LOD1. The four voids between them cost eight triangles each
  // and they are the one feature on this ship that nothing else in the game has;
  // dropping to three at LOD1 halved the void count and the hull read as a different
  // class of ship at 5 km. Negative space is the last thing an LOD gives up.
  //
  // Each one is a PORTAL — see `bayFrame` — and not a plate. It is placed on its own
  // centre with the rake from `BAY.frames`, byte-for-byte the transform the solid
  // slab used, so the rake column keeps the meaning documented against it.
  for (const [z, t, rake] of BAY.frames) {
    B.add('core', 'plating', bayFrame(t),
      { pos: [0, (BAY.frameTop + BAY.frameBot) * 0.5, z], rot: [rake, 0, 0] });
  }

  // -------------------------------------------------------------------------
  // THE TWO RUNNER RAILS — the ventral mount's plate run, and the reason a module
  // fitted here now lands on 445 m of structure instead of on a 44 m disc.
  //
  // They hang just under the keel at x +-126, which is where all five transverse
  // frames already pass (y -60 .. -192, full beam), so every one of them picks a rail
  // up. That is the difference between a rail and a moulding: this one has five
  // supports and a job. A module's spine sits down between them and the eye reads the
  // module as BERTHED rather than as slung.
  //
  // `dark`, because everything below the knuckle on this ship is (F10), and canted so
  // neither of their long faces is square to an axis.
  // -------------------------------------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'dark', G.bevelBox({
      width: BAY.runnerW, height: BAY.runnerH, depth: len - 30,
      chamfer: 5, draft: 6, cant: s * 0.10, detail: D,
    }), { pos: [s * BAY.runnerX, BAY.runnerY + (s < 0 ? 0 : 3), cz - 4] });
  }

  // Reactor bulkhead: the forward face, and the only closed one. It rakes; see
  // `BAY.bulkheadRake` for why, and for what its two flat 300 x 174 m faces were
  // costing the section audit before it did.
  B.add('core', 'plating', G.bevelBox({
    width: BAY.throat * 2, height: BAY.roof - BAY.floor, depth: 22, chamfer: 9, draft: 7, detail: D,
  }), { pos: [0, (BAY.roof + BAY.floor) * 0.5, BAY.z1 - 12], rot: [BAY.bulkheadRake, 0, 0] });

  // FOUR GRAPPLE ARMS, two a side, stowed folded against the rails 12 degrees off
  // parallel. The pivots are at DIFFERENT z port and starboard - symmetric grapples
  // read as landing gear, and this ship is not landing anywhere.
  if (full) {
    // THREE arms, two port and one starboard. Four in two matched pairs read as
    // landing gear however the pivots are offset; an odd count cannot.
    const pivots = [[-1, 112], [-1, -38], [1, -96]];
    for (const [s, z] of pivots) {
      B.add('core', 'greeble', beam([s * (BAY.railIn + 4), -102, z], [s * (BAY.railOut - 6), -116, z - 94], 11,
        { caps: false, detail: D }));
    }
  }

  // Bay interior lighting: a recess deeper than 12 m gets the warm interior treatment,
  // which is what gives every deep cut on this hull a payoff.
  for (const s of [-1, 1]) {
    B.addRaw('core', 'engineGlow', glowDisc(15), { pos: [s * 118, -80, 40], rot: [Math.PI * 0.5, 0, 0] });
  }

  // HAZARD MARKING, and the one place on the ventral it is legal: the door swing arc
  // and the grapple travel envelope, i.e. exactly where something moves (§4b).
  // PORT ONLY. §3 is explicit that a dense or accented band appearing at port x and
  // again at starboard x at the same z is the strongest single tell of procedural
  // placement, and a hazard stripe is the most conspicuous accent on the ship.
  if (full) {
    B.add('core', 'greeble', G.bevelBox({ width: 30, height: 5, depth: 60, chamfer: 2, detail: D }),
      { pos: [-(BAY.railIn + 8), -54, 132] });
  }
}

// ---------------------------------------------------------------------------
// M2b — the cutter yoke
// ---------------------------------------------------------------------------

/**
 * Two arms down and forward from the forefoot to a knuckle, then two heads forward and
 * up to the tips. The open triangle between the yoke and the hull's keel line is the
 * largest single void on the ship and it is the reason the bow reads as a claw.
 */
function buildYoke(B, D, full) {
  for (const key of ['port', 'stbd']) {
    const y = YOKE[key];
    B.add('core', 'plating', beam(y.root, y.knuckle, YOKE.armR, { detail: D }));
    B.add('core', 'greeble', beam(y.knuckle, y.tip, YOKE.headR, { radiusEnd: YOKE.headR * 0.55, detail: D }));
    // The cutting head glows only while cutting; the disc is here so the VFX stream
    // has a surface to drive.
    B.addRaw('core', 'engineGlow', glowDisc(7), { pos: [y.tip[0], y.tip[1], y.tip[2] + 2] });
    if (full && key === 'port') {
      // Machinery at the knuckle, PORT ONLY. Machinery is allowed to look busy because
      // machinery IS busy - one of the four justifications a dense band may claim (§3)
      // - but §3 also forbids the same band appearing at mirrored x, and a matched
      // pair of cutting heads is what the whole yoke exists not to be.
      B.add('core', 'greeble', G.bevelBox({
        width: 34, height: 28, depth: 44, chamfer: 6, draft: 5, cant: -0.18, detail: D,
      }), { pos: [y.knuckle[0] * 1.06, y.knuckle[1] + 14, y.knuckle[2]] });
    }
  }

  // THE FORESTAY, and it is the single most valuable pair of struts on the ship.
  //
  // Structurally it is what takes the reaction load when a cutting head bites - a
  // cantilevered yoke with nothing tying its tip back to the stem would fold the first
  // time it was used, and Cobb's rule is that you design the thing as if it were real
  // and let the form come out of that. Visually it CLOSES THE CLAW: without it the
  // space under the forebody is a concavity, and with it that space is an enclosed
  // 22 000 m2 hole with stars behind it, which is most of this hull's negative-space
  // budget in two beams and twenty-four triangles (R2.6).
  //
  // Both stays now run UP AND FORWARD to the stem, because the stem is now ahead of
  // the yoke rather than behind it. That reversal is the whole bow fix stated in two
  // struts: the tooling is slung under a bow, and the bow is what points.
  B.add('core', 'plating', beam(YOKE.port.tip, [-22, -60, 694], 9, { caps: false, detail: D }));
  B.add('core', 'plating', beam(YOKE.stbd.tip, [24, -62, 682], 9, { caps: false, detail: D }));

  // The transverse tie that makes it an A-FRAME rather than two independent legs.
  B.add('core', 'plating', beam(
    [YOKE.port.root[0] - 6, YOKE.tie, 498], [YOKE.stbd.root[0] + 6, YOKE.tie + 12, 490], 16, { detail: D },
  ));

  // THE CUTTER BEAM RAILS. Each head runs on a rail that is a LOFT, not a bar: four
  // stations with its own taper, because a strut with a constant section is the same
  // defect as a hull with a constant section at a smaller scale (L7).
  for (const key of ['port', 'stbd']) {
    const y = YOKE[key];
    const sgn = key === 'port' ? -1 : 1;
    B.add('core', 'dark', G.loft([
      { z: 0, points: G.octProfile(15, 10, -10, 5, 4, 4) },
      { z: 44, points: G.octProfile(12, 8, -8, 4, 3, 3) },
      { z: 96, points: G.octProfile(9, 6, -6, 3, 3, 3) },
    ]), { pos: [y.root[0] + sgn * 22, y.root[1] + 26, y.root[2] - 96], rot: [0.16, sgn * 0.12, 0] });
  }

}

// ---------------------------------------------------------------------------
// M4 — the stern
// ---------------------------------------------------------------------------

function buildStern(B, D, full, rng) {
  const card = full ? G.FACET_LOD.full : G.FACET_LOD.mid;

  // THE MAIN DRIVE WELL: an inside-out shell, so you look INTO a hole rather than at a
  // dark disc. It is empty because the ship does not have its main drive.
  //
  // THE TRANSOM RING IS THE TRANSOM. The spine loft is built with `capBack: false` and
  // this annulus closes it, which is why the well is a real hole. An earlier pass let
  // the loft cap the transom AND drew this ring on top of it: two coplanar faces 0 m
  // apart, a textbook z-fight, which showed up in review as "a dark elliptical void
  // between the aft fins" and "a grid of thin black lines" — two separate defects that
  // were one bug.
  //
  // The well's outline is the TRANSOM'S OWN SECTION scaled to 36% x 55% and lifted 4 m,
  // so the hole repeats the hull's plate family instead of being an octagon from
  // somewhere else — and it therefore has whatever cardinality the transom has at this
  // LOD, which is what lets `ringFace` close the loft at all three levels.
  const transom = stationProfile(HULL_STATIONS[0], card);
  const well = wellProfile(transom);
  B.add('core', 'hull', G.ringFace(transom, well, WELL.mouthZ, true));
  B.add('engine', 'greeble', G.prism(well, WELL.backZ, WELL.mouthZ, {
    capFront: false, capBack: true, flip: true,
  }));

  // TWO OUTRIGGER PODS, EACH ON TWO PYLONS — and the second pylon is the whole point.
  //
  // On one pylon the sky fore and aft of it is a NOTCH: open at one end, so it is a
  // concavity in the outline and R2.6 does not count it. On two pylons the sky BETWEEN
  // them is bounded on all four sides — hull inboard, pod outboard, a pylon fore and a
  // pylon aft — and it is a hole you can see stars through from directly above and
  // from dead astern, which is where a tactical camera spends a chase.
  //
  // The pod is built from `facetProfile`, i.e. from the same plate family as the ship
  // it hangs off, and it tapers over four stations rather than three.
  for (const s of [-1, 1]) {
    const podSec = (h, t, b, k) => G.facetProfile({
      maxHalf: h, top: t, bottom: b, knuckle: k, deckFlat: 0.42, flare: 0.9, keep: card,
    });
    B.add('engine', 'hull', G.loft([
      { z: POD.z0, points: podSec(POD.halfW * 0.94, POD.top * 0.92, POD.bot * 0.92, 0.50) },
      { z: POD.z0 + 40, points: podSec(POD.halfW, POD.top, POD.bot, 0.48) },
      { z: POD.z1 - 44, points: podSec(POD.halfW * 0.96, POD.top * 0.94, POD.bot * 0.96, 0.45) },
      { z: POD.z1, points: podSec(POD.halfW * 0.50, POD.top * 0.58, POD.bot * 0.60, 0.42) },
    ]), { pos: [s * POD.x, 0, 0] });

    // Unequal pylons, and unequal port to starboard: the forward one is deeper because
    // it takes the thrust load. Matched pylons read as landing gear.
    for (let i = 0; i < POD.pylonZ.length; i++) {
      B.add('engine', 'dark', G.bevelBox({
        width: POD.x - 128, height: i === 0 ? 40 : 52, depth: POD.pylonT - i * 6,
        chamfer: 7, draft: 6, cant: s * (i === 0 ? 0.12 : -0.09), detail: D,
      }), { pos: [s * (POD.x + 128) * 0.5, 8, POD.pylonZ[i] + (s < 0 ? 0 : 14)] });
    }

    // -----------------------------------------------------------------------
    // THE EXPOSED THRUST FRAME — new, and it is the single most convincing "this is a
    // real machine" cue the reference fleets share.
    //
    // A bell hanging on a pylon is a lamp on a stick. A bell whose thrust is visibly
    // carried by a truss running 120 m FORWARD into the flank is an engine. Two
    // members per side, splayed in plan, landing on the hull at two different z so the
    // load path forks rather than terminating in one point — and they are `dark`, so
    // they read as structure under the pod rather than as more hull.
    //
    // IT NOW ACTUALLY REACHES THE FLANK, and that sentence used to be false. The two
    // members ended at x +-152 and +-138 where the hull's own half-beam is 98-101, so
    // a "load path into the flank" stopped thirty-seven to fifty-four metres short of
    // the flank, in vacuum. The only thing joining the whole assembly to the ship in
    // PLAN was a twelve-metre rasterisation bridge across to the aft pylon - under
    // three pixels at `tools/silhouette.mjs`'s working scale, which is why the audit
    // read one piece and why a four-metre change anywhere else could tip it into two.
    // It did: dropping SEAT_STANDOFF from 7 to 3 moved the bow modules 4 m aft, the
    // raster window shrank by that much, and the bridge stopped rounding closed.
    //
    // So the endpoints are now taken FROM `sectionAt`, at each member's own z, and
    // driven a little inside the skin. That is the LOD2 rule ("every proxy has at
    // least a third of its own depth buried inside the spine") applied to a member
    // that was exempted from it by nobody deciding to. A member that terminates in
    // space is the same defect as a module that does not look seated, at the stern.
    //
    // It is the only new named feature at the stern and it costs 80 triangles a side.
    // -----------------------------------------------------------------------
    const root = [s * (POD.x - 14), 10, POD.frameZ];
    const lowZ = POD.frameZ + POD.frameLen;
    const upZ = POD.frameZ + POD.frameLen * 0.72;
    const lowSec = sectionAt(lowZ), upSec = sectionAt(upZ);
    // The lower member lands ON the knuckle, the upper one up on the deck chamfer, so
    // the fork terminates on two different facets as well as at two different z.
    const lowEnd = [s * lowSec.half * 0.94, lowSec.top - lowSec.knuckle * (lowSec.top - lowSec.bot), lowZ];
    const upEnd = [s * upSec.half * 0.72, upSec.top - 0.107 * (upSec.top - upSec.bot), upZ];
    B.add('engine', 'dark', beam(root, lowEnd, 13, { detail: D }));
    B.add('engine', 'dark', beam(root, upEnd, 10, { detail: D }));
    if (full) {
      B.add('engine', 'greeble', beam(lowEnd, upEnd, 6, { caps: false, detail: D }));
    }

    B.add('engine', 'greeble', G.thrusterBell({
      throat: 17, mouth: 25, length: 54, sides: 6, collar: false, detail: D,
    }), { pos: [s * POD.x, 0, POD.z0 + 54] });
    B.addRaw('engine', 'engineGlow', glowDisc(22), { pos: [s * POD.x, 0, POD.z0 + 3], rot: [0, Math.PI, 0] });
  }

  // -------------------------------------------------------------------------
  // THE RADIATOR BANK — FLAT RAKED PANELS, NOT RIBBED FINS.
  //
  // A radiator is a flat plate. Ribs on one are a lie, and the panels used to stand
  // nearly vertical off the deck: a 200 m fin raked 0.34 rad put its tip at y +249,
  // which on a ship whose whole envelope is now 340 m tall would have made the
  // radiators the tallest thing on it and undone the proportion fix on its own.
  //
  // They now lie OUT over the flanks at 55-65 degrees off vertical. Every panel still
  // carries a rim spar on its tip and trailing edge, so the plate has a visible EDGE
  // instead of reading as tarpaulin, and each sits on a root fairing: a panel that
  // grows out of a flat is a decal, a panel that grows out of a housing is hardware.
  // -------------------------------------------------------------------------
  for (const [s, z, chord, span, rake] of FINS) {
    B.add('engine', 'radiator', G.radiatorFin({
      chord, span, thickness: 13, sweep: -chord * 0.42, tipChord: chord * 0.6,
      rim: span > 120 ? 9 : 0, detail: D,
    }), { pos: [s * 112, 54, z], rot: [0, 0, rake] });
    B.add('engine', 'greeble', G.bevelBox({
      width: 30, height: 22, depth: chord * 1.15, chamfer: 5, draft: 5, cant: -rake * 0.4, detail: D,
    }), { pos: [s * 112, 58, z + chord * 0.4] });
  }

  // GREEBLE BANDS AT THE STERN, both justified: the drive-well rim is machinery and
  // the radiator roots are a joint between two masses. Both sit IN a trough — a recess
  // cut first, machinery placed in it second — which is the governing rule of §6 and
  // the reason a dense band self-shadows instead of reading as noise on a plate.
  if (full) {
    // `greeble`, not `plating`: `engine/plating` is not a bucket this hull owns, and
    // creating one would cost a draw call at LOD0 forever for a 24-triangle trough.
    // The draw budget is (damage groups x surfaces) and nothing may quietly add to it.
    B.add('engine', 'greeble', G.recess({ width: 190, height: 52, depth: 11, wall: 5, detail: D }),
      { pos: [-112, 72, -600], rot: [-Math.PI * 0.5, 0, 0] });
    B.add('engine', 'greeble', G.greebleBand({
      length: 176, width: 42, height: 13, boxes: 2, conduits: 0, rng: rng.fork('band:radroot'), detail: D,
    }), { pos: [-112, 62, -600] });
  }
}

// ---------------------------------------------------------------------------
// Shared sub-assemblies
// ---------------------------------------------------------------------------

/**
 * ============================================================================
 * THE SEAT — what a hull grows so that a module lands INTO something
 * ============================================================================
 *
 * A mount used to be a pad and a bolt ring: a 9 m plinth and a 7 m collar, with the
 * module standing a further 7 m proud on top (`hardpoints.js#SEAT_STANDOFF`). So a
 * module met the hull at a 32-44 m disc, SIXTEEN METRES CLEAR OF THE SKIN, with no
 * geometry anywhere carrying its mass outward. That is the whole "trash strewn on a
 * decent hull" read, and it is a geometric statement rather than a taste one: there
 * was no transition surface at any of the six junctions.
 *
 * A real ship has a SEAT. The hull thickens locally, the skin is cut and pans down
 * into a bed, a coaming stands proud around the cut, plating runs off that bed and
 * lies along the hull carrying the load away, and the module's overhang is chocked.
 * Six parts, built at EVERY mount whether or not anything is fitted, so an empty
 * hardpoint reads as a berth rather than as a boss:
 *
 *   APRON        an irregular hexagonal pan cut 9 m into the skin with a 4 m proud
 *                coaming. Drafted - its wall runs from 0.80 r at the floor to 1.00 r
 *                at the rim, so nothing about it is square to an axis (F3).
 *   PAD          unchanged radius, but standing on the APRON FLOOR, so its top is
 *                3 m BELOW the skin instead of 9 m above it.
 *   COLLAR       on the pad, spanning -3 .. +3 about the skin.
 *   PLATE RUN    two or three plates running off the apron rim and LYING ON the
 *                hull, built by `skinPlate` so they are parallel to the surface at
 *                every station. This is the load-bearing item, in both senses.
 *   CHOCKS       wedges under the module's overhanging side. A cantilevered mass
 *                with nothing under it is what the eye reads as unattached.
 *   SERVICE RUN  a pipe and two conduits leaving the apron and disappearing under a
 *                plate 60-120 m away, so something crosses the join.
 *
 * THE INTERPENETRATION IS FIXED BY THE SAME ARITHMETIC. Before: the pad spanned
 * 0..9 outward of the anchor, the collar 9..16, and the module's own cut plate
 * 7..13.2 (`modules/kit.js#graft`, plateH = max(4, r*0.14)). The hull's bolt ring
 * passed THROUGH the module's cut plate at all six mounts - two interpenetrating
 * solids, invisible only because the module is opaque. Now the pad is -9..-3, the
 * collar -3..+3, `SEAT_STANDOFF` is 3, and the module's plate starts at exactly +3.
 * The ring is the foot the plate lands on, which is what the standoff comment always
 * claimed it was.
 *
 * COST: about 250 triangles a mount, ~1500 for all six, against `cruiserCoreTris`
 * 9000 and a measured LOD0 of 5241. ZERO NEW DRAW CALLS - every part goes into
 * hull / plating / dark / greeble in the `core` group, four buckets this hull already
 * owns, and the header's rule is that primitives inside an existing surface are free.
 *
 * MOST OF IT SURVIVES TO LOD1. The apron, the pad, the plate run and the chocks are
 * silhouette and value, not mechanism; the collar and the service run are LOD0.
 */

/**
 * Irregular hexagon, six unequal radii. It is OUR structure rather than a torch cut
 * (`modules/kit.js#cutOutline` is the torch), so it is competently irregular rather
 * than ragged - but a regular hexagon on a hull with no other regular hexagon on it
 * reads as a catalogue part, and §6 is explicit that this ship has never seen a
 * catalogue.
 */
const APRON_R = [1.00, 0.87, 0.96, 1.00, 0.91, 0.84];
function apronOutline(rx, ry, k = 1) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    pts.push([Math.cos(a) * rx * APRON_R[i] * k, Math.sin(a) * ry * APRON_R[i] * k]);
  }
  return pts;
}

/**
 * Per-mount seat data. Five of the six anchors are `hardpoints.js#CRUISER_ANCHORS`
 * unchanged; this table says what the hull grows around each of them.
 *
 *   rx, ry   apron half-extent across and along. NOT one radius: the doc's
 *            "1.9 x padRadius" is right about the size and wrong about the shape,
 *            because a circle of that radius at the bow is wider than the foredeck
 *            and a circle of it on the dorsal barbette hangs off both ends of the
 *            barbette. Every apron is elongated along the feature it sits on.
 *   tilt     world-space [x, y, z] rotation applied to the whole seat AFTER the face
 *            rotation, so the pan lies on the local surface rather than on the world
 *            axes. The bow deck falls 0.0875 m per metre going forward; the sponson
 *            shelves are `bevelBox`es canted +-0.13 rad.
 *   plates   plate runs, each { z0, z1, side, facet, t0, t1, drift, out, surface }.
 *            NEVER MIRRORED port to starboard - the 170 m z offset between the two
 *            sponsons is a deliberate asymmetry (F13) and a mirrored seat undoes it.
 *   chocks   [across, alongShip, length, width, height, bearing] buttresses standing
 *            ON the skin off the apron rim. `bearing` is radians in the skin plane.
 *   service  { from: [across, alongShip], len, bearing, pitch }
 *
 * THE SEAT'S LOCAL FRAME, because getting it wrong is silent. Every part below is
 * authored with +Z OUTWARD and is then turned onto the hull by `seated()`. For an
 * `up` mount local X is world +X, local Y is world -Z (AFT) and local Z is world +Y;
 * for `down` local Y is world +Z and local Z is world -Y; for `aft` local Z is world
 * -Z. So local +Z is the mount normal at all six, which is the only invariant the
 * table below relies on - the tuples are written in (across, along-ship) and mapped.
 */
const SEAT = {
  bow: {
    face: 'up', padRadius: 32, rx: 38, ry: 40, tilt: [0.0875, 0, 0],
    // The forward rim lands at z 460, ON the prow knuckle break, and no further: the
    // forward 200 m is calm reserve and the prow's job is convergence. The structural
    // frame at z 430 (F8) crosses the pan and becomes its coaming rib for free, which
    // is "the hull acknowledges the module" for no triangles at all.
    plates: [
      // Three, running AFT down the foredeck, at 0 / 7 / 16 degrees to the axis. The
      // angle is `drift` - the plate walks across the deck facet as it runs - so it
      // is an angled plate that is still ON the surface.
      { z0: 196, z1: 386, side: 1, facet: [4, 5], t0: 0.12, t1: 0.52, drift: 0.22, out: 3, surface: 'plating' },
      { z0: 240, z1: 380, side: -1, facet: [4, 5], t0: 0.30, t1: 0.74, drift: -0.14, out: 3, surface: 'plating' },
      // One drops over the deck chamfer onto the upper flank, port only, so the run
      // crosses a chine instead of stopping at one.
      { z0: 268, z1: 388, side: -1, facet: [3, 2], t0: 0.10, t1: 0.44, drift: 0.10, out: 3, surface: 'plating' },
    ],
    chocks: [[-40, -34, 52, 30, 22, -1.24], [38, 28, 44, 24, 17, 0.62], [-26, 44, 36, 20, 14, 1.86]],
    service: { from: [24, -30], len: 96, bearing: -1.36, pitch: 0.09 },
  },
  dorsal: {
    // The one mount that already had a seat - a 30 m barbette - and not a coincidence
    // that it is the one the module audit had to fix structurally rather than
    // metrically. The apron is cut into the barbette's top face.
    face: 'up', padRadius: 44, rx: 42, ry: 50, tilt: [0, 0, 0],
    plates: [
      // The ridge CROWN is calm reserve, so the run goes on the ridge FLANKS, below
      // the crown, at the ridge's own rake. Built from RIDGE_STATIONS through
      // `ridgeSectionAt`, so they lie on the ridge and not on a plane near it.
      { z0: -190, z1: -46, side: -1, ridge: true, facet: [3, 2], t0: 0.14, t1: 0.58, drift: 0.16, out: 3, surface: 'plating' },
      { z0: -36, z1: 44, side: 1, ridge: true, facet: [3, 2], t0: 0.20, t1: 0.62, drift: -0.12, out: 3, surface: 'plating' },
      { z0: -128, z1: -58, side: 1, ridge: true, facet: [4, 3], t0: 0.24, t1: 0.70, drift: 0, out: 3, surface: 'plating' },
    ],
    chocks: [[-34, -52, 46, 28, 19, -1.42], [32, 46, 40, 24, 24, 0.48], [8, -58, 34, 18, 13, -1.96]],
    service: { from: [-28, -46], len: 78, bearing: -1.72, pitch: 0.12 },
  },
  ventral: {
    face: 'down', padRadius: 44, rx: 58, ry: 76, tilt: [0, 0, 0],
    plates: [
      // The keel. `dark` below the knuckle, which is every plate on this mount.
      { z0: -180, z1: 8, side: 1, facet: [0, 1], t0: 0.10, t1: 0.56, drift: 0.18, out: 3, surface: 'dark' },
      { z0: -96, z1: 132, side: -1, facet: [0, 1], t0: 0.22, t1: 0.70, drift: -0.12, out: 3, surface: 'dark' },
      { z0: 30, z1: 190, side: -1, facet: [1, 2], t0: 0.08, t1: 0.40, drift: 0.14, out: 3, surface: 'dark' },
    ],
    chocks: [[-56, -58, 54, 30, 23, -1.18], [52, 66, 46, 26, 18, 0.56], [-36, 84, 36, 20, 15, 1.92]],
    service: { from: [32, 62], len: 104, bearing: 0.74, pitch: 0.10 },
  },
  port: {
    face: 'up', padRadius: 32, rx: 26, ry: 40, tilt: [0, 0, -0.13],
    plates: [
      // ONE 150 m plate running inboard from the shelf onto the upper flank, at the
      // local facet angle. Port and starboard differ in length, in z and in facet.
      { z0: -34, z1: 116, side: -1, facet: [2, 3], t0: 0.16, t1: 0.52, drift: 0.20, out: 3, surface: 'plating' },
      { z0: 22, z1: 128, side: -1, facet: [3, 4], t0: 0.20, t1: 0.60, drift: -0.10, out: 3, surface: 'plating' },
    ],
    chocks: [[-24, -44, 44, 26, 21, -1.30], [-22, 40, 34, 20, 15, 1.74], [20, 14, 30, 16, 12, 0.22]],
    service: { from: [10, -34], len: 84, bearing: -1.44, pitch: 0.11 },
  },
  starboard: {
    face: 'up', padRadius: 32, rx: 26, ry: 40, tilt: [0, 0, 0.13],
    plates: [
      { z0: -222, z1: -84, side: 1, facet: [2, 3], t0: 0.24, t1: 0.64, drift: -0.16, out: 3, surface: 'plating' },
      { z0: -168, z1: -32, side: 1, facet: [3, 4], t0: 0.12, t1: 0.46, drift: 0.18, out: 3, surface: 'plating' },
      { z0: -246, z1: -156, side: 1, facet: [1, 2], t0: 0.30, t1: 0.68, drift: 0, out: 3, surface: 'dark' },
    ],
    chocks: [[22, 44, 48, 28, 19, 1.66], [26, -38, 36, 22, 16, -1.22], [-18, -10, 28, 15, 11, 2.96]],
    service: { from: [-12, 36], len: 92, bearing: 1.52, pitch: 0.09 },
  },
  // The drive well IS the apron - a 108 m socket cut in the transom, deeper than any
  // pan this file could add. Its seat is what a socket needs and a pan does not:
  // KEYWAYS. Six bolt bosses at the well profile's OWN vertex positions and four
  // longitudinal ribs up its inner wall, so a drive plugs into something with visible
  // register features instead of touching a flat annulus.
  engine: { face: 'aft', padRadius: 44, well: true },
};

/**
 * A mount, occupied or not. This function existing once is why all six read as the
 * same kind of thing, which is why filling one reads as progress rather than as a
 * random new lump.
 */
function mountSeat(B, id, anchor, { detail, full, rng, card }) {
  const S = SEAT[id];
  const [ax, ay, az] = anchor;
  const { face, padRadius } = S;
  const faceRot = face === 'up' ? [-Math.PI * 0.5, 0, 0]
    : face === 'down' ? [Math.PI * 0.5, 0, 0]
      : [0, Math.PI, 0];
  const sign = face === 'down' ? -1 : 1;
  // Outward, in world metres, for placing things along the mount normal.
  const outv = (d) => (face === 'aft' ? [ax, ay, az - d] : [ax, ay + sign * d, az]);
  /** Place a part authored in the seat's own +Z-outward frame onto the hull. */
  const seated = (geo) => G.place(G.place(geo, { rot: faceRot }),
    { rot: S.tilt ?? [0, 0, 0], pos: [ax, ay, az] });

  if (S.well) return wellSeat(B, anchor, { detail, full, card });

  // ---- APRON: the pan, and the coaming that stands proud around it ---------
  const rim = apronOutline(S.rx, S.ry);
  const floorPts = apronOutline(S.rx, S.ry, 0.80);
  const outer = apronOutline(S.rx, S.ry, 1.13);
  // Floor `dark`, coaming `plating`: a dark hole behind a bright rim is the read, and
  // it is the same one every recess on this hull uses (§4, recess colour).
  B.add('core', 'dark', seated(G.loft(
    [{ z: -9, points: floorPts }, { z: 4, points: rim }],
    { capFront: false, capBack: true, flip: true },
  )));
  B.add('core', 'plating', seated(G.mergeParts([
    { geo: G.prism(outer, -2, 4, { capFront: false, capBack: false }) },
    { geo: G.ringFace(outer, rim, 4) },
  ])));

  // ---- PAD, on the apron floor, and COLLAR, spanning the skin --------------
  // The pad is `plating`, not `hull`. On `hull` the five pads came back in the khaki
  // tier-2 variant and read as five bright tan patches evenly spread down a grey ship.
  B.add('core', 'plating', G.mountPad({ radius: padRadius, height: 6, sides: 5, detail }),
    { pos: outv(-9), rot: face === 'down' ? [Math.PI, 0, 0] : [0, 0, 0] });

  // ---- PLATE RUN: the load path, lying on the skin -------------------------
  for (const p of S.plates) {
    B.add('core', p.surface, skinPlate({
      z0: p.z0, z1: p.z1, side: p.side, facet: p.facet, t0: p.t0, t1: p.t1,
      drift: p.drift, out: p.out, full,
      rows: p.ridge ? RIDGE_STATIONS : HULL_STATIONS,
      section: p.ridge ? ridgeSectionAt : sectionAt,
      offset: p.ridge ? [RIDGE_X, 0] : [0, 0],
    }));
  }

  // ---- CHOCKS: something under the overhang --------------------------------
  // Unequal, unequally spaced, and never a mirrored pair. They were cut to fit what
  // was actually there.
  //
  // `lay` is the only rotation maths in this function and it is two nested places
  // rather than one composed Euler, for the reason `modules/kit.js#aimed` gives:
  // composing two rotations into one XYZ triple is the most reliable way to build a
  // part that is twelve degrees wrong in a way nobody sees until it is on the ship.
  // Inner: the primitive's +Z (its length) turns into the skin plane and its +Y (its
  // height) turns OUTWARD. Outer: a bearing within that plane, then the position.
  const lay = (geo, bearing, across, along, up) => G.place(
    G.place(geo, { rot: [Math.PI * 0.5, 0, 0] }),
    { rot: [0, 0, bearing], pos: [across, -along, up] },
  );

  for (const [across, along, len, w0, h0, bearing] of S.chocks) {
    B.add('core', 'plating', seated(lay(G.taperedWedge({
      length: len, width0: w0, height0: h0, width1: w0 * 0.44, height1: h0 * 0.30,
      shear: -h0 * 0.26, chamfer: 4, detail,
    }), bearing, across, along, h0 * 0.5 - 2)));
  }

  if (!full) return;

  B.add('core', 'greeble', G.dockingCollar({
    radius: padRadius * 0.74, innerRadius: padRadius * 0.5, depth: 6, sides: 4, detail,
  }), { pos: outv(-3), rot: faceRot });

  // ---- SERVICE RUN: something crosses the join -----------------------------
  // A trunk leaving the apron, running along the skin and disappearing under one of
  // the plate runs 80-100 m away. It is the cheapest thing on the seat and it is the
  // one that says the module is PLUMBED IN rather than parked.
  const sv = S.service;
  B.add('core', 'greeble', seated(G.place(
    lay(G.pipeRun({ length: sv.len, radius: 6, sides: 6, axis: 'z', flanges: 1, detail }),
      sv.bearing, sv.from[0], sv.from[1], 5),
    { rot: [sv.pitch, 0, 0] },
  )));
  const jitter = rng.fork(`mount:${id}`);
  for (let i = 0; i < 2; i++) {
    const a = 0.9 + i * 2.7 + jitter.range(0, 0.4);
    B.add('core', 'greeble', seated(G.place(
      G.cappedConduit({ length: 14 + jitter.range(0, 9), radius: 5, axis: 'z', detail }),
      { rot: [0.7 + jitter.range(0, 0.3), a, 0], pos: [Math.cos(a) * S.rx * 1.18, Math.sin(a) * S.ry * 1.06, 1] },
    )));
  }
}

/**
 * THE ENGINE SEAT. The well outline is the transom's own section scaled 0.36 x 0.55,
 * so its vertices are real register points on the hull's plate family - put the bolt
 * bosses THERE and a drive plugs into a socket with keyways rather than touching a
 * flat annulus. Four ribs run the well's inner wall mouth to back and stop a 108 m
 * bore reading as a smooth pipe.
 */
function wellSeat(B, anchor, { detail, full, card }) {
  const transom = stationProfile(HULL_STATIONS[0], card);
  const well = wellProfile(transom);
  const n = well.length;
  // SIX bosses on a profile with eight or twelve vertices, and not every other one:
  // an even tiling of a socket is machine rhythm, and this one was cut by a crew.
  const pick = n >= 12 ? [0, 2, 3, 5, 7, 10] : [0, 1, 3, 4, 5, 7];
  for (let i = 0; i < pick.length; i++) {
    const p = well[pick[i] % n];
    const k = 0.88 + (i % 3) * 0.05;
    B.add('core', 'plating', G.bevelBox({
      width: 20 + (i % 2) * 6, height: 14, depth: 22, chamfer: 3, draft: 3,
      cant: (i % 2 ? 0.14 : -0.11), detail,
    }), { pos: [p[0] * k, p[1] * k, WELL.backZ + 12] });
  }
  if (!full) return;
  // Longitudinal ribs on the bore, at four unequal angles.
  for (const [t, r] of [[0.14, 9], [0.42, 7], [0.63, 9], [0.88, 6]]) {
    const i = Math.floor(t * n) % n;
    const p = well[i];
    const l = Math.hypot(p[0], p[1]) || 1;
    B.add('core', 'greeble', G.bevelBox({
      width: r * 2, height: 9, depth: WELL.mouthZ - WELL.backZ - 14, chamfer: 2, draft: 2, detail,
    }), {
      pos: [p[0] * 0.90, p[1] * 0.90, (WELL.mouthZ + WELL.backZ) * 0.5 - 4],
      rot: [0, 0, Math.atan2(p[1], p[0]) - Math.PI * 0.5 + (l > 0 ? 0 : 0)],
    });
  }
  B.add('core', 'greeble', G.dockingCollar({
    radius: 34, innerRadius: 22, depth: 6, sides: 4, detail,
  }), { pos: [anchor[0], anchor[1], anchor[2] + 3], rot: [0, Math.PI, 0] });
}

/** A flat additive disc with 0..1 UVs for the engine-glow texture. 8 triangles. */
function glowDisc(radius) {
  return new THREE.CircleGeometry(radius, 8);
}

/**
 * A flat additive quad with 0..1 UVs, facing +Z. Two triangles.
 *
 * This is how the window bands and the hangar interior are lit. They are emissive
 * rather than shaded because §4(d) is right that emissive is the one class of small,
 * saturated, everywhere detail that survives - the eye reads it as a source, not as
 * paint - and because a lit window on the shadow side of a hull is the only thing
 * that still says "crewed" when the key has gone.
 */
function glowQuad(width, height) {
  return new THREE.PlaneGeometry(width, height);
}

/**
 * A 6 m emissive strip along the deck chine. U is authored in METRES so the registry's
 * running-light texture lays down exactly one lamp every six metres with no per-mesh
 * fiddling and no way to lie about the ship's size.
 *
 * Deliberately NOT used on this hull: laid along 650 m of chine it renders as one
 * continuous additive band that erases the chamfer highlights the whole design is
 * built on, and the 40 m beacons carry the scale cue on their own. Kept and exported
 * for hulls short enough to wear it.
 */
export function chineStrip(z0, z1, side) {
  const a = chineAt(z0), b = chineAt(z1);
  const half = 5;
  const cross = (c) => [-c.ny * half, c.nx * half];
  const ca = cross(a), cb = cross(b);
  const off = 2.0;
  const p = [
    [side * (a.x + a.nx * off + ca[0]), a.y + a.ny * off + ca[1], z0],
    [side * (a.x + a.nx * off - ca[0]), a.y + a.ny * off - ca[1], z0],
    [side * (b.x + b.nx * off - cb[0]), b.y + b.ny * off - cb[1], z1],
    [side * (b.x + b.nx * off + cb[0]), b.y + b.ny * off + cb[1], z1],
  ];
  const lengthM = Math.abs(z1 - z0);
  const uvs = [[0, 0], [0, 1], [lengthM, 1], [lengthM, 0]];
  const order = [0, 1, 2, 0, 2, 3];

  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const outward = [side * a.nx, a.ny, 0];
  const flip = (nrm[0] * outward[0] + nrm[1] * outward[1]) < 0;
  const idx = flip ? [0, 2, 1, 0, 3, 2] : order;

  const pos = new Float32Array(18);
  const uv = new Float32Array(12);
  for (let i = 0; i < 6; i++) {
    const k = idx[i];
    pos[i * 3] = p[k][0]; pos[i * 3 + 1] = p[k][1]; pos[i * 3 + 2] = p[k][2];
    uv[i * 2] = uvs[k][0]; uv[i * 2 + 1] = uvs[k][1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------

/**
 * Targetable subsystems, positioned on the real geometry above. Salvage shares sum to
 * 0.94: a hull stripped of every subsystem is still worth something for its frame, and
 * no single kill can take the whole prize.
 *
 * @type {import('../../core/contracts.js').SubsystemDef[]}
 */
export const CRUISER_SUBSYSTEMS = [
  { id: 'reactor', kind: 'reactor', hp: 3200, position: [0, -10, 220], radius: 92, salvageValue: 0.24, label: 'Reactor' },
  { id: 'engine_port', kind: 'engine', hp: 1800, position: [-202, 6, -640], radius: 58, salvageValue: 0.12, label: 'Port Outrigger' },
  { id: 'engine_stbd', kind: 'engine', hp: 1800, position: [202, 6, -640], radius: 58, salvageValue: 0.12, label: 'Starboard Outrigger' },
  // The mast is gone (see the sensor apertures in `hullParts`), so the array is now
  // where the arrays are: on the dorsal ridge. Same id, same kind, same hp and same
  // salvage share — the sim, the damage model and the economy key off those and none
  // of them may move because the art did.
  { id: 'sensor_array', kind: 'sensor', hp: 900, position: [-16, 124, -284], radius: 62, salvageValue: 0.10, label: 'Sensor Array' },
  { id: 'salvage_bay', kind: 'hangar', hp: 2200, position: [0, -128, 0], radius: 150, salvageValue: 0.14, label: 'Salvage Bay' },
  { id: 'cutter_yoke', kind: 'weapon', hp: 1100, position: [0, -156, 560], radius: 120, salvageValue: 0.10, label: 'Cutter Yoke' },
  { id: 'mount_port', kind: 'weapon', hp: 1200, position: [-180, 32, 60], radius: 66, salvageValue: 0.06, label: 'Port Sponson' },
  { id: 'mount_stbd', kind: 'weapon', hp: 1200, position: [180, 32, -110], radius: 66, salvageValue: 0.06, label: 'Starboard Sponson' },
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Build the player cruiser.
 *
 * @param {import('../../core/contracts.js').BuildContext} ctx
 * @returns {{
 *   root: THREE.Group,
 *   lod: THREE.LOD,
 *   hardpoints: Map<string, {socket: THREE.Object3D, def: Object, module: Object|null, object: THREE.Object3D|null}>,
 *   subsystems: import('../../core/contracts.js').SubsystemDef[],
 *   bounds: THREE.Box3,
 *   masses: Array<{id:string, box:THREE.Box3}>,
 *   stats: {triangles:number[], drawCalls:number[]},
 * }}
 */
export function buildCruiser(ctx) {
  const { materials, rng } = ctx;
  if (!materials?.get) throw new Error('[cruiser] ctx.materials must be the shared material registry');

  const root = new THREE.Group();
  root.name = 'cruiser';

  const lodNode = new THREE.LOD();
  lodNode.name = 'cruiser:lod';
  root.add(lodNode);

  const bounds = new THREE.Box3();
  const triangles = [];
  const drawCalls = [];
  let masses = [];

  // LOD switch distances. At 4.2 km the hull is 353 px wide and greeble stops being
  // resolvable; at 14 km it is 106 px and only the four masses survive.
  const LEVELS = [0, 4200, 14000];

  for (let lod = 0; lod < 3; lod++) {
    const level = new THREE.Group();
    level.name = `cruiser:lod${lod}`;

    const { buckets, lights, masses: m } = hullParts({ rng, lod });
    if (lod === 0) masses = m;

    let tris = 0;
    let calls = 0;

    // Group nodes exist so the damage system can hide or replace a whole mass. Past
    // LOD0 nothing is damaged independently, so everything collapses into one group
    // and the draw count halves - which is the change the benchmark actually needed,
    // because its camera sits at 7.2 km and never sees LOD0 at all.
    const groupNodes = Object.create(null);
    for (const g of GROUPS) {
      const n = new THREE.Group();
      n.name = `cruiser:${g}`;
      level.add(n);
      groupNodes[g] = n;
    }

    const merged = new Map();
    for (const b of buckets) {
      const group = lod === 0 ? b.group : 'core';
      // PAST LOD0, `greeble` FOLDS INTO `plating`. This is the draw call that pays
      // for `dark`, and the trade is stated rather than absorbed: the two-value
      // albedo split is a large-area read that has to survive to every range, and
      // greeble-versus-plating is a roughness and detail-scale difference on parts
      // that are under three pixels once the hull is 353 px wide. One surface for
      // small hardware, one for the ship's second value. LOD1 and LOD2 therefore
      // cost exactly what they cost before `dark` existed, and the benchmark's
      // camera sits at 7.2 km, which is LOD1.
      const surface = lod === 0 || b.surface !== 'greeble' ? b.surface : 'plating';
      const key = `${group}/${surface}${b.uv ? '' : '#raw'}`;
      let e = merged.get(key);
      if (!e) { e = { group, surface, uv: b.uv, parts: [] }; merged.set(key, e); }
      for (const p of b.parts) e.parts.push(p);
    }

    for (const [key, b] of merged) {
      const geo = G.mergeParts(b.parts, { uv: b.uv });
      if (!geo) continue;
      geo.name = `cruiser:${key}`;
      const [mkey, opts] = SURFACE[b.surface] ?? [b.surface, { faction: 'player' }];
      const mesh = new THREE.Mesh(geo, materials.get(mkey, opts));
      mesh.name = key;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Additive emissive must not write depth or fight the hull.
      if (b.surface === 'runningLights' || b.surface === 'engineGlow') {
        mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 2;
      }
      groupNodes[b.group].add(mesh);
      tris += G.triCount(geo);
      calls++;
      if (lod === 0) {
        geo.computeBoundingBox();
        bounds.union(geo.boundingBox);
      }
    }

    // Running lights: one InstancedMesh, one draw call, the whole scale cue.
    if (lights.length) {
      const quad = new THREE.PlaneGeometry(1, 1);
      const mat = materials.get('emissive', { faction: 'player', intensity: 1.55, instanced: true });
      const inst = new THREE.InstancedMesh(quad, mat, lights.length);
      inst.name = 'cruiser:runningLights';
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      const m4 = new THREE.Matrix4();
      const rot = new THREE.Matrix4();
      const eye = new THREE.Vector3();
      const tgt = new THREE.Vector3();
      const up = new THREE.Vector3(0, 0, 1);
      const scl = new THREE.Vector3();
      for (let i = 0; i < lights.length; i++) {
        const L = lights[i];
        eye.set(0, 0, 0);
        tgt.set(-L.normal[0], -L.normal[1], -L.normal[2]);
        rot.lookAt(eye, tgt, up);          // +Z of the quad ends up along the normal
        m4.copy(rot);
        m4.scale(scl.set(L.scale, L.scale, L.scale));
        m4.setPosition(L.pos[0], L.pos[1], L.pos[2]);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      groupNodes.core.add(inst);
      tris += lights.length * 2;
      calls++;
    }

    triangles.push(tris);
    drawCalls.push(calls);
    lodNode.addLevel(level, LEVELS[lod]);
  }

  // Sockets last so they are not swept up by the LOD levels: modules must survive an
  // LOD switch, so they hang off the root, not off a level.
  const hardpoints = createSockets(root);

  const result = {
    root,
    lod: lodNode,
    hardpoints,
    subsystems: CRUISER_SUBSYSTEMS,
    bounds,
    masses,
    stats: { triangles, drawCalls },
    silhouetteDirty: false,
  };
  root.userData.hull = result;
  return result;
}

export { CRUISER_HARDPOINTS };
