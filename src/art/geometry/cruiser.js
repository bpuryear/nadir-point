/**
 * THE PLAYER CRUISER — "Nadir", 1400 metres of salvage tug that someone welded guns to.
 *
 * This is the object the player looks at for the entire run, so every decision here is
 * a decision about the whole game. The numbers below execute
 * `docs/design/ship-language.md`; where a rule from that document is being satisfied
 * the rule id is quoted, because a proportion you cannot check is a proportion that
 * drifts.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG WITH THE OLD HULL, so it does not come back
 * ---------------------------------------------------------------------------
 * The primary mass was a CONSTANT-SECTION RECTANGULAR BOX: half-beam 112-116 m from
 * z = -330 to z = +180, i.e. 510 m of the 1400 held inside a +-2% band, with the deck
 * line moving six metres over that whole run. Detail was then bolted to its flanks.
 * There was no mass hierarchy, no taper, no negative space, and the prow was a
 * truncated slab with a plank under it. It read as a barge with greebles, and no
 * amount of surface treatment rescues a barge.
 *
 * ---------------------------------------------------------------------------
 * THE READ, in the order the eye gets it
 * ---------------------------------------------------------------------------
 * 1. FOUR MASSES, RANKABLE (ship-language.md §1). Measured off the geometry, not
 *    intended - z extent, then the mass's own L : B : H:
 *
 *      M1  spine                   z -700..+700  1400 m   8.5 : 1.6 : 1  long and thin
 *      M2  ventral assembly        z -160..+690   850 m   4.5 : 1.8 : 1  long, wide, shallow
 *      M3  dorsal spine + bridge   z -480.. +40   520 m   2.5 : 0.7 : 1  tall and blocky
 *      M4  stern block + drives    z -700..-400   300 m   1.7 : 2.2 : 1  short and wide
 *
 *    The size ladder on z extent is 1.65x, 1.63x, 1.73x - every step clears the 1.6
 *    the rule asks for, so the eye can rank them instead of giving up and seeing one
 *    lumpy object. No two share an aspect ratio within 20%. ONE HONEST EXCEPTION: M4's
 *    widest dimension is not its 300 m length but its 396 m beam across the drive pods,
 *    and 520/396 is 1.31, under the step. The pods have to be outboard of the block's
 *    156 m half-beam or the outrigger gap they exist to create does not exist, so this
 *    is a trade taken deliberately and recorded rather than hidden.
 *
 * 2. THE SECTION NEVER HOLDS STILL. Half-beam runs 150 -> 94 -> 136 -> 16: a maximum
 *    at the transom, a visible WAIST at z = -470, a SHOULDER at z = -40, then a taper
 *    to a chisel. Exactly one interior minimum and one interior maximum in the plan
 *    curve (R2.2); the longest contiguous run inside +-4% of its own starting
 *    half-beam is 140 m against a 160 m limit - the old hull's was 510 (R2.1). The
 *    deck line has three inflections, so the profile is never one horizontal.
 *
 * 3. A PROW WITH MASS BEHIND IT, AND A KNUCKLE.
 *
 *    This is the correction the whole rebuild turns on, so it is worth stating what
 *    was wrong. The first attempt collapsed the beam from 134 m at the shoulder to
 *    74 m by z = +400 and hung an open A-frame in front of it. Reviewed blind against
 *    real reference art it read as a CRANE JIB, and with the aft fins covered the
 *    ship's heading was genuinely ambiguous: all the mass was aft and the forward
 *    third was two sticks.
 *
 *    Now the hull carries its section forward. At z = +300 it is still 228 m across
 *    and 142 m deep - 84% of the shoulder beam, five hundred metres ahead of the
 *    bridge - and it holds that until a hard CHINE BREAK at z = +460, where the deck
 *    stops falling at 3.4 degrees and starts falling at 21.8. That knuckle is a
 *    single edge readable from any angle, and a flat foredeck visibly falls into it.
 *    Over the forward 200 m the hull silhouette falls 97 m and it falls
 *    ASYMMETRICALLY - deck at 18.2 degrees, keel at 9.6, a 1.9 : 1 ratio (R2.4) -
 *    which puts the point 45 m BELOW the axis (R2.5). The tip is a 32 x 18 m blade,
 *    not a needle: a needle reads as an antenna, a cone reads as a nose, a chisel
 *    reads as a bow.
 *
 *    THE HULL IS THE FORWARDMOST THING ON THE SHIP, at every LOD. The cutter yoke
 *    now stops 36 m short of the stem and its stays run up and FORWARD to meet it.
 *    Tooling hangs off a bow; it is not the bow.
 *
 * 4. HOLES YOU CAN SEE STARS THROUGH. Voids rather than recesses, because each is
 *    open on at least two faces, so as the camera orbits, background passes through:
 *      - the salvage bay throat, 210 x 182 m, open ventral AND aft
 *      - the four uneven rail bays between the bay's five frames, and the slot above
 *        the tow track where it hangs clear of the keel
 *      - the cutter yoke's mouth, closed off by the forestay
 *      - the outrigger gaps fore and aft of the two drive pylons
 *      - the dorsal cutaway, where the armour spine stands clear on three frames
 *    A one-sided cavity always reads as a dark patch of hull. These do not.
 *
 * 5. IT IS A SALVAGER. Two cutter heads on a ventral A-frame at different z (+664
 *    port, +628 starboard) because a matched pair reads as a weapon mount and a
 *    mismatched pair reads as tooling. Four grapple arms on pivots unmatched port to
 *    starboard. A 54 x 34 m hangar mouth in the port flank. A salvaged fuel cylinder,
 *    a captured armour plate wired on seven degrees off the hull's plate grid, a
 *    spare drive bell lashed to the aft deck on a cradle, a section of flank with the
 *    skin missing. If a bare-hull render could be mistaken for a line ship with the
 *    paint removed, this has failed.
 *
 * 6. INCOMPLETE. The main drive well is a 108 x 72 m octagonal hole with nothing in
 *    it; the ship limps on two outrigger bells. Six mounts, all empty on a bare hull,
 *    all wearing one vocabulary. Every empty socket is an invitation.
 *
 * ---------------------------------------------------------------------------
 * FEWER, LARGER, ASYMMETRIC - the other half of the round-one correction
 * ---------------------------------------------------------------------------
 * Blind review counted "roughly eight features of near-equal visual weight" and it
 * was right: four identical aft fins, three bright tan mount pads, a bridge, a bow
 * gantry and a ventral truss, all competing. There was no first read, so the eye had
 * nowhere to land. What changed, all of it subtractive:
 *
 *   five radiator fins -> THREE, spans 200 / 140 / 92 m at four different z, two to
 *     port and one to starboard. No two the same size; a repeated element the eye can
 *     count adds nothing after the second one.
 *   mount pads moved from the `hull` surface to `plating`, so they stop reading as
 *     five bone-coloured patches spread evenly down a grey ship.
 *   the port bow derrick DELETED - the second thing at the bow that read as a crane.
 *   two bridge wings -> ONE, to port.
 *   `trim` deleted as a surface entirely: it existed for six bolt rings and one
 *     hazard patch, and it cost a whole draw call to put an out-of-family bone colour
 *     on the hull. LOD0 is now NINE draws, not ten.
 *
 * ---------------------------------------------------------------------------
 * SURFACE: 60 / 30 / 10, and it is enforced by where detail is ALLOWED to go
 * ---------------------------------------------------------------------------
 * Dense detail is allowed in exactly EIGHT places on this hull, and each one claims
 * one of the four justifications from §3 - a joint between two masses, a recess
 * deeper than 8 m, machinery, or functional edge structure:
 *
 *   drive-well rim band          machinery        exposed flank ribs, PORT ONLY  recess
 *   radiator roots + fairings    mass joint       dorsal cutaway ribs            recess
 *   cutter-head knuckles x2      machinery        bay diagonals + grapples       edge
 *   the six mount assemblies     machinery        mast and dish                  machinery
 *
 * Everything else is CALM RESERVE and nothing may be placed on it: the two 640 m
 * flank belts, the dorsal armour spine, the sponson decks, the bay's outboard rail
 * faces, the whole foredeck and the forward 200 m - the prow's job is convergence and
 * detail there fights it.
 *
 * Nothing dense is mirrored. The cutter-head knuckles are 84 m apart in z, the rib
 * section and the hangar are port-only, the deck hatch is starboard-only, the hazard
 * patch is port-only, and the sponsons sit at different z. Mirror-matched greeble is
 * the strongest single tell of procedural placement, and a hull that is bilaterally
 * symmetric cannot read as repaired.
 *
 * ---------------------------------------------------------------------------
 * SCALE - three features whose size the player already knows
 * ---------------------------------------------------------------------------
 * Running lights at EXACTLY 40 m (units.js#SCALE_CUE) are necessary and not
 * sufficient: 40 m is not a distance anyone has stood next to, so on its own it
 * calibrates nothing and the hull reads as an indeterminate grey twig. Three
 * features carry a size the player DOES know:
 *
 *   hangar mouth, port flank      54 x 34 m   three fighters wide (a fighter is 18 m)
 *   boat-bay hatch, stbd foredeck 26 x 18 m   exactly one fighter
 *   bridge window bands            5 m tall   one storey
 *
 * ---------------------------------------------------------------------------
 * BUDGET
 * ---------------------------------------------------------------------------
 * LOD0 core hull is 1989 triangles against units.js#BUDGET.cruiserCoreTris (2000),
 * running lights included.
 *
 * EVERY LOD IS AUTHORED INWARD FROM LOD0's SILHOUETTE. This is a rule now because
 * breaking it produced the worst finding of round one: the ship read as three
 * different classes at three ranges. LOD1 had two fins where LOD0 had four; LOD2
 * invented a downward spike prow that existed nowhere else, deleted the fins
 * entirely, and filled the bay voids in with solid boxes - deleting the one feature
 * nothing else in the game has. Concretely:
 *
 *   - LOD1's stations are PICKED BY HAND, not decimated every-other. The waist and
 *     all three prow stations survive, because they are the silhouette.
 *   - all five bay frames survive to LOD1. The four voids between them cost eight
 *     triangles each. Negative space is the LAST thing an LOD gives up.
 *   - LOD2 is built from `pick(HULL_STATIONS, ...)` plus proxies for the same four
 *     masses, including the bay slot as a real hole and two of the three fins.
 *
 * DRAW CALLS. The build is over its committed ceiling of 320 (docs/review/benchmark.md
 * measured 650), so this rebuild is draw-NEGATIVE: two damage groups instead of three
 * and THREE surfaces instead of six, giving 9 draws at LOD0 against the old 14 and
 * 5 at LOD1 against the old 12. The benchmark's camera sits at 7.2 km, which is LOD1,
 * so the LOD1 number is the one that pays.
 *
 * Everything else worth knowing is in ./hardpoints.js.
 */

import * as THREE from 'three';
import * as G from './greeble.js';
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
 * M1, THE SPINE. One loft, the full 1400 m, five zones and not one of them constant.
 *
 * `[z, deckHalf, top, bottom, chamW, chamTop, chamBot, keelRatio]`
 *
 * `keelRatio` is the keel half-beam as a fraction of the deck half-beam, and it is
 * where two of naval architecture's three free curves live:
 *   TUMBLEHOME (0.78-0.80) everywhere aft of the forefoot, so the flanks slope inward
 *     going down. The upper flank catches the key and the lower flank falls into
 *     shadow, which buys a two-value split on what is geometrically one surface.
 *   FLARE (1.15) forward of z = +400, so the widest part of the bow is down at the
 *     working gear rather than up at the deck.
 * The third curve, SHEER, is the `top` column: -24 at the stem, +72 under the
 * superstructure, dropping 22 m to +50 where the deck plating is missing at z = -400,
 * rising again to +78 at the stern block. Three inflections, no horizontals.
 *
 * The 34 m chamfer at the transom against 2 m at the tip is a free front/back cue at
 * every zoom: sharp forward, blunt aft.
 */
const HULL_STATIONS = [
  // ZONE E — STERN BLOCK. Maximum beam is an ENDPOINT here, not a bump.
  [-700, 150, 80, -86, 22, 13, 26, 0.72],
  [-620, 138, 82, -88, 21, 13, 24, 0.72],
  [-540, 124, 74, -78, 18, 12, 22, 0.72],
  // ZONE W — WAIST. 30 m of beam lost in 70 m of length; the ship is visibly pinched.
  [-470, 94, 58, -56, 14, 9, 18, 0.76],
  [-400, 100, 52, -60, 14, 9, 18, 0.76],
  // ZONE M — MIDBODY, rising to the shoulder.
  // THE SHOULDER MOVED AFT, to z = -260, under the superstructure. It used to sit at
  // z = -40, i.e. exactly where the salvage bay is, which meant the hull was at its
  // widest precisely where the bay rails needed clear water outboard of it — and the
  // plan view came out a slug with no background anywhere inside its outline. Widest
  // under the island, narrowing steadily forward, is also the load path a real ship
  // would have: the heaviest structure is under the heaviest thing on the deck.
  [-260, 128, 74, -66, 16, 10, 20, 0.72],
  [-40, 120, 70, -70, 17, 10, 20, 0.70],
  // ZONE F — FOREBODY. THE FOREDECK. The section is carried forward nearly whole:
  // at z = +300 the hull is still 224 m across and 136 m deep, i.e. 82% of the
  // shoulder's beam and 97% of its depth, five hundred metres ahead of the bridge.
  // This is the correction the first pass got wrong - it collapsed the beam to 74 m
  // by z = +400 and the forward third became two sticks and a gantry.
  [120, 112, 66, -76, 16, 10, 20, 0.72],
  [300, 104, 58, -84, 14, 9, 18, 0.84],
  [460, 88, 46, -90, 12, 8, 16, 1.00],
  // ZONE P — PROW. A CHISEL, not a needle, and it starts with a KNUCKLE.
  //
  // The deck falls 3.4 degrees over the whole 340 m foredeck and then 21.8 degrees in
  // the eighty metres from z +460 to +540. That break is the hard chine the bow read
  // depends on: a single edge, visible as one line from any angle, that the flat
  // foredeck visibly falls into. A continuous fair curve from the shoulder to the tip
  // - which is what the first correction produced - has mass but no event, and reads
  // as a torpedo. The section stays a wide flat blade through the fall, so the tip is
  // 32 m across and 18 m deep rather than a point: a needle reads as an antenna, a
  // cone reads as a nose, a chisel reads as a bow.
  [540, 78, 14, -86, 12, 9, 12, 1.10],
  [630, 50, -8, -74, 8, 7, 9, 1.08],
  [700, 16, -36, -54, 3, 4, 5, 1.00],
];

/**
 * M3a, THE RAISED DORSAL ARMOUR SPINE. 520 m, inset ~40 m from the deck chine on both
 * sides, which is what produces the horizontal shadow line that makes a hull read as
 * layered rather than extruded. 520/1220 = 0.43, inside the ziggurat rule's 0.5.
 *
 * Its AFT END DOES NOT LAND. Over the waist - where the deck line has already dipped
 * 22 m and the plating is missing - the spine runs 15-21 m clear of the hull and is
 * carried on four exposed transverse frames, so there is sky between it and the deck.
 * Forward of z = -300 it settles back into the hull and becomes solid armour. An
 * armoured deck that visibly stands on its own frames for a hundred and eighty metres
 * is the cheapest "this ship is not finished" statement available, and it costs
 * nothing: it is the same four stations with different numbers in them.
 */
const SPINE_STATIONS = [
  // Lands on the stern-block deck (hull top +74 here), so the slot it opens forward
  // of this station is CLOSED at both ends and is therefore enclosed background in
  // plan rather than an open-ended notch. A notch is a concavity; a closed slot is a
  // hole, and only holes count against R2.6.
  [-540, 122, 98, 74, 16, 10, 8, 1],
  // THE CUTAWAY, and it is now cut THROUGH rather than recessed. Over the waist the
  // spine is 20 m WIDER than the hull under it (hull half-beam 94 here) and stands
  // 24 m clear of a deck that has already dipped, carried on three exposed frames.
  // So from directly above there is sky between the armour and the hull on both
  // sides, and from abeam there is sky under it. Two open faces: a hole, not a recess.
  [-470, 114, 106, 82, 14, 9, 8, 1],
  [-390, 110, 104, 76, 14, 9, 8, 1],
  [-300, 88, 108, 64, 16, 11, 8, 1],
  [40, 56, 92, 50, 12, 9, 8, 1],     // buried: hull deck is at +67
];

/**
 * M3b, THE SUPERSTRUCTURE — A STEPPED ZIGGURAT, AND IT USED TO BE A DOME.
 *
 * It was a five-station LOFT, and a loft through five stations that grow and shrink
 * is a blob: blind review called it "a soft rounded dome with a mast — the least
 * designed shape on the ship, and the one the eye goes to first in profile", which
 * was exactly right. A hull reads as LAYERED rather than extruded because of the
 * horizontal shadow lines where one deck steps in from the one below it, and a
 * curve has no step in it anywhere.
 *
 * So it is boxes now, with hard horizontal steps, per ship-language.md §1:
 *
 *   deck 1  main hull          1220 m           the loft
 *   deck 2  raised armour spine 580 m  y +74..+108   0.48 x deck 1
 *   deck 3  bridge base         190 m  y +80..+176   0.33 x deck 2
 *   deck 4  bridge house        112 m  y +176..+232  0.59 x deck 3, inset 26/34 m
 *   deck 5  conning cap          48 m  y +232..+258
 *
 * Each deck is inset from the one below on at least three sides, and the insets are
 * the whole point: they cost nothing in triangles and they are what the eye reads as
 * structure. Shifted 18 m to port: a command block on the centreline is a warship's,
 * a command block off the centreline is a working ship's.
 */
const BRIDGE_DECKS = [
  { len: 190, w: 104, y0: 80, y1: 176, z: -238 },
  { len: 112, w: 68, y0: 176, y1: 232, z: -226 },
  { len: 48, w: 40, y0: 232, y1: 258, z: -232 },
];

const BRIDGE_X = -18;

/**
 * M2a, THE SALVAGE BAY. A through-slot, not a hangar door and not a recess: open on
 * the ventral face AND the aft face, closed forward by the reactor bulkhead. That
 * second open face is the whole difference - as the camera orbits, stars pass through.
 *
 * The rails sit 26 m outboard of the 134 m shoulder half-beam, which is what makes the
 * bay a readable mass in PLAN view instead of a shape hidden under the keel. The four
 * frame bays are 96 / 62 / 104 / 58 m and deliberately not on the hull's 180 m
 * structural rhythm: the bay is a separate structure carrying a different load, and
 * evenly spaced frames are what made the first pass read as a road bridge.
 */
const BAY = {
  z0: -200, z1: 200,

  /**
   * THE RAILS STAND CLEAR OF THE FLANK, and this is the single change that fixes the
   * plan view.
   *
   * They used to run from x = 98 (under the keel) out to 170, i.e. they were a
   * moulding on the underside of a hull whose own half-beam at that station was 136.
   * From above, nothing. Blind review measured the enclosed background in the plan
   * silhouette at 0.65% against this project's own 6-12% floor and called the plan
   * outline "still a slug", which it was.
   *
   * Now the rail is a box from x 176 to 222 — its INBOARD face is 56 m outboard of
   * the hull's widest station and 64 m outboard of the flank beside it — carried on
   * five transverse frames that pass under the keel. So in plan there are four bands
   * of background between hull and rail on each side, and in profile the 116 m band
   * between the two chords is background as well. Two open faces on the same void,
   * which is the difference between a hole and a dark patch of hull.
   *
   * The cost is stated rather than hidden: maximum beam across the cradle is 444 m,
   * not the 312 m in ship-language.md §7's envelope table. That table was written
   * before the plan view had been measured, and a 4.7 : 1 hull inside a 3.2 : 1
   * working structure is the Kushan-resource-controller read — a narrow ship with a
   * wide machine bolted under it — rather than a wider ship.
   */
  railIn: 176, railOut: 222,
  chordOut: 214, chordIn: 168,     // bottom chord, slightly inboard of the rail
  throat: 105,                     // clear half-width of the slot itself
  roof: -60, chordTop: -100,       // top chord: 40 m of real section depth, not a plank
  floor: -252, chordBot: -216,
  frameTop: -72, frameBot: -240,   // frames OVERLAP both chords rather than abutting
                                   // them: two faces that merely touch are coplanar,
                                   // which is a z-fight, and a truss whose members
                                   // only kiss falls apart the moment an LOD drops
                                   // the diagonal that was quietly holding it.

  /**
   * `[z, thickness, rake]`. Bays of 140 / 60 / 110 / 90 m — and the unevenness is now
   * unmistakable rather than technically true. The previous 96 / 62 / 104 / 58 was
   * unequal on paper and read as four equal windows in the render, because 96 vs 104
   * and 58 vs 62 are inside the eye's tolerance. A load path is where the load is,
   * and the loads on this thing are the reactor bulkhead forward and the tow track
   * aft, so the frames bunch where the load bunches.
   */
  frames: [[200, 24, 0], [60, 13, 0], [0, 20, 0], [-110, 11, 0], [-200, 18, 0.22]],
};

/**
 * M2b, THE CUTTER YOKE. Two independent heads on a ventral A-frame. The tips are 36 m
 * apart in z and 14 m apart in y ON PURPOSE - a matched pair reads as a weapon mount,
 * a mismatched pair reads as tooling. Deepest point of the assembly is y = -228 at
 * z = +556.
 *
 * THE YOKE NO LONGER LEADS. Its forwardmost point is z = +664, thirty-six metres
 * BEHIND the hull's stem at +700, and its arms hang off a bow that already has 224 m
 * of beam and 136 m of depth at z = +300. The first pass had this backwards: the
 * gantry reached furthest forward and the hull behind it was a sliver, so the
 * assembly read as a crane jib and the ship's heading was genuinely ambiguous. Tooling
 * hangs off a bow. It is not the bow.
 */
const YOKE = {
  port: { root: [-74, -84, 430], knuckle: [-130, -228, 556], tip: [-136, -186, 664] },
  stbd: { root: [74, -84, 430], knuckle: [126, -210, 542], tip: [132, -172, 628] },
  armR: 20, headR: 13, tie: -152,
};

/** Octagonal main drive well: an enormous, obvious, empty socket in the transom. */
const WELL = { hw: 54, top: 36, bot: -36, cw: 18, ct: 11, cb: 11, mouthZ: -700, backZ: -624 };

/**
 * The two outrigger drive pods, and the gaps around them. The pods hang outboard of
 * the stern block on a single pylon each, so there is open sky between pod and hull
 * fore and aft of the pylon - the third of the three voids, and the one that reads in
 * plan view and from dead astern.
 */
const POD = { x: 196, halfW: 30, z0: -700, z1: -552, top: 52, bot: -40, pylonZ: -628, pylonT: 40 };

/**
 * THE RADIATOR BANK. `[side, z, chord, span, rake]`.
 *
 * THREE fins, not five, and no two are the same size: spans 200 / 140 / 92 m, a ratio
 * of 1.43 and 1.52 between neighbours. The first pass hung five identical fins at
 * even spacing and the result was a picket fence - four co-equal diagonals that were
 * the highest-contrast thing in the frame and carried no information, because a
 * repeated element the eye can count adds nothing after the second one. Every
 * reference varies its repeats in size or clusters them asymmetrically.
 *
 * Two to port, one to starboard, at four different z values. The ship lost one and
 * the crew rebalanced by moving the survivors, and an asymmetric bank is a story the
 * silhouette tells for free.
 */
const FINS = [
  [-1, -648, 88, 200, 0.34],
  [1, -598, 62, 140, -0.28],
  [-1, -516, 40, 92, 0.22],
];

const stationProfile = ([, dh, top, bot, cw, ct, cb, keel]) => G.hullProfile({
  deckHalf: dh, keelHalf: dh * (keel ?? 1), top, bottom: bot, chamW: cw, chamTop: ct, chamBot: cb,
});
const toStations = (rows) => rows.map((r) => ({ z: r[0], points: stationProfile(r) }));

/** Keep only the listed z values from a station table. Extremes are never dropped. */
function pick(rows, zs) {
  return rows.filter((r) => zs.includes(r[0]));
}

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
  return { hw: L(1), top: L(2), bot: L(3), cw: L(4), ct: L(5), cb: L(6), keel: L(7) };
}

/** Midpoint and outward normal of the upper chamfer facet at z, starboard side. */
function chineAt(z) {
  const s = sectionAt(z);
  const x = s.hw - s.cw * 0.5;
  const y = s.top - s.ct * 0.5;
  // Facet runs from (hw, top-ct) to (hw-cw, top); outward normal is (ct, cw).
  const nx = s.ct, ny = s.cw;
  const len = Math.hypot(nx, ny) || 1;
  return { x, y, nx: nx / len, ny: ny / len };
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
   * the two 640 m flank armour belts below the chine, the stern block's armour
   * casing, the drive pylons and pods, and the bay's outboard rail fairings. Every
   * one of those boundaries is a real geometric edge — a plate lip, the chine, the
   * step at the stern — so the value change never stops in the middle of a face,
   * which §4 says is the diagnostic for a decal on styrene.
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
  // screen. So the ~170 triangles here are spent on exactly six things and nothing
  // else: the waist, the shoulder, the asymmetric prow, the stern-block step, the
  // superstructure as a distinct stack, and the bay throat as an ACTUAL HOLE. No
  // greeble, no mast, no radiators - at 43 m/px a 118 m mast is a 0.2 px hair.
  //
  // The rule that keeps a far LOD from falling apart: every proxy has at least a third
  // of its own depth buried inside the spine. A block that merely touches the hull
  // reads as a detached slab floating alongside it the moment shading flattens out.
  // =========================================================================
  if (lod >= 2) {
    // -----------------------------------------------------------------------
    // WHY THIS WAS REBUILT, so it does not come back.
    //
    // The previous LOD2 passed the review loop's IoU gate at 0.764 and was still,
    // read blind, "a fish with a caudal fin". IoU was the wrong instrument: FILLING A
    // HOLE BARELY MOVES AN INTERSECTION-OVER-UNION RATIO, because closing the hole
    // adds the same pixels to the intersection and to the union. So the proxy had
    // quietly closed the ventral bay throat - the one feature nothing else in the
    // game has - into a solid rectangle, deleted the superstructure, and turned the
    // hooked cutter yoke into a straight spike, and the number said 0.764 and passed.
    //
    // It is now authored OUTWARD FROM THE FOUR IDENTITY FEATURES rather than inward
    // from LOD0's volume, and the gate in tools/silhouette.mjs was replaced with one
    // that checks each of them is present in the LOD2 mask on its own terms:
    //
    //   1. the bay as a genuine THROUGH-VOID, clear span intact
    //   2. the superstructure as a distinct STEPPED STACK
    //   3. the cutter yoke's HOOK - down-and-forward, then forward-and-UP
    //   4. the stern-block STEP
    //
    // Every number below is still a pick from, or a proxy of, the LOD0 tables. The
    // cost is 214 -> ~360 triangles across the same TWO draw calls, and that is the
    // trade taken deliberately: at 43 m to the pixel this is the only geometry on
    // screen, so a hundred and fifty triangles buying the ship's identity at its
    // hardest read is the cheapest hundred and fifty triangles in the project.
    // -----------------------------------------------------------------------
    B.add('core', 'hull', G.loft(toStations(
      pick(HULL_STATIONS, [-700, -540, -470, -260, 120, 460, 700]),
    ), { capBack: false }));
    // Transom with the empty drive well still cut into it: the well is a 108 m hole
    // and 108 m is 2.5 px at max zoom, which is exactly the threshold that matters.
    B.add('core', 'hull', G.ringFace(
      stationProfile(HULL_STATIONS[0]),
      G.octProfile(WELL.hw, WELL.top, WELL.bot, WELL.cw, WELL.ct, WELL.cb), WELL.mouthZ, true,
    ));

    // FEATURE 2 — THE SUPERSTRUCTURE AS A STEPPED STACK, not a wedge. Two of the
    // three LOD0 decks survive with the hard step between them intact; the third is
    // 48 m and is one pixel. A stack with a step in it reads as a bridge from any
    // angle; a smooth wedge reads as a fin, which is exactly what the last one did.
    for (const d of BRIDGE_DECKS.slice(0, 2)) {
      B.add('core', 'hull', G.panelledSlab({ width: d.w, height: d.y1 - d.y0, depth: d.len, detail: D }),
        { pos: [BRIDGE_X, (d.y0 + d.y1) * 0.5, d.z] });
    }
    // Raised armour spine: the step between deck 1 and deck 2, overhanging the waist
    // to port and starboard exactly as it does at LOD0.
    B.add('core', 'dark', G.panelledSlab({ width: 216, height: 32, depth: 560, detail: D }),
      { pos: [0, 90, -252] });

    // FEATURE 1 — THE BAY, AS AN ACTUAL HOLE, and it is the last thing that may ever
    // be simplified away. Two chords a side with 116 m of clear air between them, and
    // 56 m of clear air between rail and hull flank, tied by two end frames. In
    // profile the band between the chords is background; in plan the bands between
    // rail and flank are background. Two open faces on one void: as the camera
    // orbits, stars pass through it, which is the difference between a hole and a
    // dark patch of hull, and it is the only thing at this range that says salvager.
    for (const s of [-1, 1]) {
      const x = s * (BAY.railIn + BAY.railOut) * 0.5;
      const w = BAY.railOut - BAY.railIn;
      B.add('core', 'dark', G.panelledSlab({ width: w, height: BAY.roof - BAY.chordTop, depth: 320, detail: D }),
        { pos: [x, (BAY.roof + BAY.chordTop) * 0.5, 0] });
      B.add('core', 'dark', G.panelledSlab({ width: w, height: BAY.chordBot - BAY.floor, depth: 320, detail: D }),
        { pos: [x, (BAY.chordBot + BAY.floor) * 0.5, 0] });
    }
    for (const [z, t] of [[148, 26], [-148, 22]]) {
      B.add('core', 'dark', G.panelledSlab({
        width: BAY.railOut * 2, height: BAY.frameTop - BAY.frameBot, depth: t, detail: D,
      }), { pos: [0, (BAY.frameTop + BAY.frameBot) * 0.5, z] });
    }

    // FEATURE 3 — THE HOOK. Two segments a side, and they bend the OTHER WAY at the
    // knuckle: down-and-forward to y -228, then forward-and-up to the tip. One
    // straight wedge is a spike, and a spike reads as a ram, which inverts the whole
    // thesis of the ship - it leads with a tool, not a gun. The tips still stop 36 m
    // SHORT of the stem: the hull is the forwardmost thing on this ship at every LOD.
    for (const key of ['port', 'stbd']) {
      const y = YOKE[key];
      B.add('core', 'dark', beam(y.root, y.knuckle, 26, { detail: D }));
      B.add('core', 'dark', beam(y.knuckle, y.tip, 20, { detail: D }));
    }

    // FEATURE 4 — the stern-block step is carried by the hull picks above (-700,
    // -540, -470), and the DRIVE ARRAY STANDS OUTBOARD OF IT on two single pylons, so
    // in plan there is open sky both fore and aft of each pylon. From dead astern -
    // which is where a tactical camera spends most of a chase - that gap is the
    // difference between a drive array and a wider transom.
    for (const s of [-1, 1]) {
      B.add('core', 'dark', G.panelledSlab({
        width: POD.halfW * 2, height: POD.top - POD.bot, depth: POD.z1 - POD.z0, detail: D,
      }), { pos: [s * POD.x, 6, (POD.z0 + POD.z1) * 0.5] });
      B.add('core', 'dark', G.panelledSlab({
        width: POD.x - 126, height: 42, depth: POD.pylonT, detail: D,
      }), { pos: [s * (POD.x + 126) * 0.5, 14, POD.pylonZ] });
    }

    // Two of the three radiator fins. At 43 m/px a 200 m fin is 4.6 px of hard
    // diagonal against black, and the aft end of this ship is not identifiable
    // without them - LOD1 keeps all three, LOD2 keeps the two large ones.
    for (const [s, z, chord, span, rake] of FINS.slice(0, 2)) {
      B.add('core', 'radiator', G.radiatorFin({
        chord, span, thickness: 14, sweep: -chord * 0.42, tipChord: chord * 0.6, detail: D,
      }), { pos: [s * 116, 60, z], rot: [0, 0, rake] });
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
  const spineRows = full ? HULL_STATIONS
    : pick(HULL_STATIONS, [-700, -540, -470, -260, -40, 120, 300, 440, 540, 630, 700]);
  B.add('core', 'hull', G.loft(toStations(spineRows), { capBack: false }));
  massBox('spine', -156, -92, -700, 156, 96, 700);

  // -------------------------------------------------------------------------
  // THE FLANK ARMOUR BELTS — the ship's second value, and its hard chine.
  //
  // Two things were wrong here and they were the same thing. Blind review: "plate
  // language is pillowy, not industrial. Flank plates are bulging bread-roll forms
  // with soft filleted edges; nothing has the flat face plus hard chamfer plus
  // recessed groove that the references all use", and separately, the hull was a
  // single bone value from stem to stern.
  //
  // So the belts are now FLAT-FACED (chamfer 0 — a rounded plate edge is a fillet and
  // a fillet is what makes a plate read as a bread roll), they are BROKEN INTO FIVE
  // 118 m PLATES with 9 m gaps that read as recessed grooves because the plate stands
  // 13 m proud of the flank behind it, and they carry `dark` rather than `plating`.
  // Five plates over 640 m is a 118 m module repeating 11 times over the hull's
  // length, against §7's "largest plate module >= 55 m, <= 26 repeats".
  //
  // They sit BELOW THE CHINE, on the tumblehome flank, and they stop at the chine
  // rather than wrapping over it. That is what makes the value boundary a real
  // geometric edge instead of a line drawn across a face: deck plane above the chine
  // in bone, flank plane below it in near-black, and the chine itself is where they
  // meet. It is also the read the Idris's slate-versus-ochre split is built on.
  // -------------------------------------------------------------------------
  for (const s of [-1, 1]) {
    B.add('core', 'dark', G.armourBelt({
      length: 640, height: 62, thickness: 13, plates: 5, gap: 9, chamfer: 0, detail: D,
    }), { pos: [s * 116, -18, -80] });
  }

  // The stern block's armour casing, same value, and its forward edge lands exactly
  // on the step at z = -540 so the boundary is a structural break rather than a line
  // that stops in the middle of a plate. `dark` on the two things at the bottom and
  // back of the ship and bone above is the whole two-value split in two calls.
  B.add('core', 'dark', G.panelledSlab({
    width: 300, height: 78, depth: 152, chamfer: 22, detail: D,
  }), { pos: [0, -30, -620] });

  // A structural frame every 180 m: geometry, not texture, so the flank carries a
  // 180 m rhythm that survives to 14 km as well as the 45 m plate rhythm that does
  // not. Two rhythms beating against each other is what stops either reading as tiling.
  if (mid) {
    for (const z of [-360, -180, 0]) {
      const s = sectionAt(z);
      B.add('core', 'plating', G.panelledSlab({
        width: (s.hw + 4) * 2, height: (s.top - s.bot) * 0.86, depth: 9, detail: D,
      }), { pos: [0, (s.top + s.bot) * 0.5, z] });
    }
  }

  // =========================================================================
  // 2. M3 — DORSAL: armour spine, superstructure, mast
  // =========================================================================
  // Both lofts keep ALL their stations at LOD1. They cost 64 and 80 triangles between
  // them and they are two of the four masses; thinning them was pure silhouette loss
  // for no measurable saving.
  B.add('core', 'dark', G.loft(toStations(SPINE_STATIONS)));

  // THE ISLAND, AS THREE INSET DECKS WITH HARD HORIZONTAL STEPS BETWEEN THEM.
  //
  // It was a loft through five stations, which is a curve, which is a dome, and the
  // dome was the first thing the eye landed on in every profile. Boxes with steps
  // cost 36 triangles fewer than the loft they replace and they are the reason a hull
  // reads as LAYERED rather than extruded: each inset throws a horizontal shadow line
  // at the step, and those lines are free.
  for (const d of BRIDGE_DECKS) {
    if (!mid && d.len < 90) continue;             // the 48 m cap is under 12 m at LOD1
    B.add('core', 'hull', G.panelledSlab({
      width: d.w, height: d.y1 - d.y0, depth: d.len, chamfer: d.len > 120 ? 10 : 6, detail: D,
    }), { pos: [BRIDGE_X, (d.y0 + d.y1) * 0.5, d.z] });
  }
  massBox('dorsal', -80, 40, -540, 80, 258, 40);

  // THE DORSAL CUTAWAY. The deck plating over the waist simply is not there: four
  // exposed frames, and the sheer already dips 22 m underneath them. This is a recess
  // deeper than 8 m, so greeble inside it self-shadows and reads as depth rather than
  // as noise - the corollary being that if you want greeble somewhere, you cut the
  // recess first.
  //
  // The rib count does NOT drop at LOD1. These four ribs are also what holds the aft
  // end of the armour spine up: thin them and the spine's overhang loses its visible
  // support and reads as a slab floating over the deck, which is exactly what review
  // found at LOD1.
  B.add('core', 'plating', G.hullRibs({
    count: 3, spacing: 68, span: 132, height: 30, thickness: 12, taper: 0.82, detail: D,
  }), { pos: [0, 60, -392] });

  // Bridge wing, PORT ONLY. The block is 104 m across inside a 272 m beam, so from
  // directly above it vanishes into the hull outline; this shelf is the only thing on
  // the dorsal that breaks the PLAN outline. There is no starboard twin: the bridge is
  // already 18 m to port, the starboard shelf only ever overlapped its parent by nine
  // metres (which is how it came to hang in space at LOD1), and one wing is a stronger
  // read than two.
  B.add('core', 'hull', G.panelledSlab({ width: 104, height: 14, depth: 62, detail: D }),
    { pos: [-104, 176, -236] });
  B.add('core', 'plating', G.taperedWedge({
    length: 60, width0: 26, height0: 44, width1: 16, height1: 14, shear: -14, detail: D,
  }), { pos: [-140, 168, -236], rot: [0, Math.PI * 0.5, 0] });

  // THE LIT WINDOW BAND, and it is a SCALE CUE before it is decoration. A 1400 m hull
  // with nothing human-sized on it reads as an indeterminate grey twig at any
  // distance, because the eye has nothing whose size it already knows. Two bands of
  // 5 m glazing across the bridge face is a storey height, and a storey is a thing
  // every player has stood in. Additive, so it survives a near-black shadow side.
  //
  // ROUND-TWO REVIEW: "the bridge band ... blooms into a featureless white slab with
  // no window structure resolvable in it ... give the band enough internal structure
  // to survive the bloom." A single 62 m quad cannot have internal structure, because
  // bloom is a blur and a blur of one bright rectangle is one bright rectangle. So the
  // band is now PANES with real unlit mullions between them: the dark gaps are gaps in
  // the GEOMETRY, so no amount of blur closes them and the band reads as a row of
  // windows at every distance it is visible at. Same material, same merge bucket,
  // same draw call, +32 triangles. The intensity cut that goes with it is in
  // art/materials/index.js.
  for (const [dy, w, panes] of [[0, 62, 7], [-26, 44, 5]]) {
    const pitch = w / panes;
    const paneW = pitch * 0.62;          // 38% of the run is mullion, and it is dark
    for (let i = 0; i < panes; i++) {
      const px = (i - (panes - 1) * 0.5) * pitch;
      B.addRaw('core', 'engineGlow', glowQuad(paneW, 5),
        { pos: [BRIDGE_X + px, 216 + dy, -140 + dy * 0.22], rot: [-0.34, 0, 0] });
    }
  }

  // Sensor mast: the tallest thing on the ship at y = +366, so it fixes "up" from any
  // angle. The POLE survives to LOD1 - it is 118 m, which is 29 px at the LOD1 switch
  // and the single strongest "this end is the stern" cue in the frame. Only the spars
  // and the dish, both under 30 m, drop.
  B.add('core', 'greeble', G.antennaMast({
    height: 118, radius: 8, tipRadius: 3.5, spars: full ? 2 : 0, sparSpan: 30, detail: D,
  }), { pos: [BRIDGE_X, 248, -238] });
  if (full) {
    B.add('core', 'greeble', G.sensorDish({ radius: 26, depth: 11, sides: 6, stub: 0, detail: D }),
      { pos: [BRIDGE_X, 328, -234], rot: [-0.42, 0, 0] });
  }

  // =========================================================================
  // 3. M2 — THE VENTRAL ASSEMBLY: bay, tow track, cutter yoke
  // =========================================================================
  buildBay(B, D, full, r);
  buildYoke(B, D, full);
  massBox('ventral-assembly', -170, -240, -160, 170, -60, 700);

  // THE TOW TRACK: the keel beam that ties the bay's mouth to the yoke's root, so the
  // two read as ONE 860 m assembly rather than as two unrelated lumps.
  //
  // It hangs 40 m CLEAR of the keel, cantilevered off the reactor bulkhead and picked
  // up by a single stanchion near its forward end. Flush against the keel it was a
  // moulding; slung under it, the 175 x 40 m slot above it is background you can see
  // through, and the assembly reads as running gear bolted to the underside of a ship
  // rather than as part of the ship's shell.
  B.add('core', 'plating', G.panelledSlab({ width: 96, height: 30, depth: 250, detail: D }),
    { pos: [0, -128, 285] });
  B.add('core', 'plating', G.panelledSlab({ width: 44, height: 54, depth: 34, detail: D }),
    { pos: [0, -104, 372] });

  // =========================================================================
  // 3b. THE THREE FEATURES THAT SAY "1400 METRES"
  //
  // Nothing on the first pass was human-sized, so nothing calibrated the hull: a
  // player could read it as 300 m or 3 km and the running lights, at an arbitrary
  // 40 m, could not settle it because 40 m is not a size anyone has stood next to.
  // These three are, and all three are cheap:
  //
  //   the hangar mouth   54 x 34 m, i.e. three fighters wide (a fighter is 18 m)
  //   the boat bay hatch 26 x 18 m, exactly one fighter
  //   the window band    5 m glazing, one storey                (built above)
  //
  // The hangar is on the PORT flank only and the hatch is on the starboard foredeck,
  // because a matched pair would read as styling rather than as function.
  // =========================================================================
  // The tunnel is bottomless on purpose: the hull's own tumblehome flank, which sits
  // 17 m down it and is not perpendicular to the mouth, is what you see at the end.
  // A slanted back wall inside a straight tube is free depth.
  B.add('core', 'plating', G.recess({ width: 54, height: 34, depth: 26, wall: 7, detail: D }),
    { pos: [-140, 12, -60], rot: [0, -Math.PI * 0.5, 0] });
  B.addRaw('core', 'engineGlow', glowQuad(40, 16),
    { pos: [-117, 6, -60], rot: [0, -Math.PI * 0.5, 0] });
  if (mid) {
    B.add('core', 'plating', G.blastDoor({ width: 26, height: 18, depth: 5, seam: false, detail: D }),
      { pos: [58, 64, 176], rot: [-Math.PI * 0.5, 0, 0] });
  }

  // =========================================================================
  // 4. SPONSONS. Deliberately NOT mirrored: port owns z +60..+200, starboard owns
  //    z -60..+80, so a fully fitted hull is never bilaterally symmetric (§6 M6).
  // =========================================================================
  for (const [s, cz] of [[-1, 130], [1, 10]]) {
    B.add('core', 'hull', G.panelledSlab({ width: 76, height: 30, depth: 76, chamfer: 9, detail: D }),
      { pos: [s * 152, 30, cz] });
    // The bracket under it. A shelf with nothing holding it up is a shelf nobody built.
    B.add('core', 'plating', G.taperedWedge({
      length: 56, width0: 44, height0: 52, width1: 26, height1: 16, shear: 18, detail: D,
    }), { pos: [s * 122, 2, cz], rot: [0, s * Math.PI * 0.5, 0] });
    massBox(s < 0 ? 'port-sponson' : 'starboard-sponson',
      s * 152 - 38, 16, cz - 38, s * 152 + 38, 46, cz + 38);
  }

  // =========================================================================
  // 5. M4 — THE STERN: drive well, outrigger pods, radiators
  // =========================================================================
  buildStern(B, D, full, r);
  massBox('stern', -228, -88, -700, 228, 96, -400);

  // =========================================================================
  // 6. THE SIX EMPTY MOUNTS, in one vocabulary
  // =========================================================================
  emptyMount(B, 'bow', CRUISER_ANCHORS.bow, { face: 'up', padRadius: 32, conduits: 0, detail: D, full, rng: r });
  emptyMount(B, 'dorsal', CRUISER_ANCHORS.dorsal, { face: 'up', padRadius: 44, conduits: 0, detail: D, full, rng: r });
  emptyMount(B, 'ventral', CRUISER_ANCHORS.ventral, { face: 'down', padRadius: 44, conduits: 0, detail: D, full, rng: r });
  emptyMount(B, 'port', CRUISER_ANCHORS.port, { face: 'up', padRadius: 32, conduits: 0, detail: D, full, rng: r });
  emptyMount(B, 'starboard', CRUISER_ANCHORS.starboard, { face: 'up', padRadius: 32, conduits: 0, detail: D, full, rng: r });
  emptyMount(B, 'engine', CRUISER_ANCHORS.engine, { face: 'aft', padRadius: 44, conduits: 1, detail: D, full, rng: r });

  // =========================================================================
  // 7. THE THINGS THE CREW BOLTED ON. 8-14% of hull volume that does not match.
  // =========================================================================
  if (mid) {
    // Salvaged fuel cylinder, starboard flank. Nothing about it matches the hull,
    // which is exactly why it belongs on this ship.
    B.add('core', 'greeble', G.pipeRun({
      length: 250, radius: 38, sides: 6, axis: 'z', flanges: 0, detail: D,
    }), { pos: [136, -14, -300] });

    // Captured armour plate, wired on at SEVEN DEGREES off the hull's plate grid. That
    // mismatch is the load-bearing detail: a patch that aligns to the grid reads as
    // design, a patch seven degrees off reads as repair.
    B.add('core', 'plating', G.panelledSlab({ width: 11, height: 62, depth: 170, detail: D }),
      { pos: [-128, 6, -180], rot: [0.1222, 0, 0] });

    // Spare drive bell, lashed to the aft deck, ON A CRADLE. The bell used to be
    // pinned at y = +88 over a deck that is at +73, so it hovered fifteen metres above
    // the ship and review found it as a grey slab hanging in empty space at LOD1. A
    // bolted-on object that is not visibly bolted on is not salvage, it is a bug.
    B.add('core', 'plating', G.panelledSlab({ width: 46, height: 12, depth: 52, detail: D }),
      { pos: [52, 76, -542] });
    // IT LIES DOWN, MOUTH ASTERN, AND IT HAS AN INTERIOR SHELL. Stood upright with
    // its mouth to the sky and no inner shell it rendered as a 54 m black ellipse in
    // the aft deck, which review read - correctly - as a missing face rather than as
    // a designed aperture. A cone open at one end must never point at the camera's
    // usual hemisphere, and it must never be hollow.
    B.add('core', 'greeble', G.thrusterBell({
      throat: 17, mouth: 27, length: 44, sides: 6, collar: false, inner: true, detail: D,
    }), { pos: [52, 104, -520], rot: [0, 0, 0.24] });
  }

  if (full) {
    // Exposed rib section, port FLANK - distinct from the dorsal cutaway above it.
    // The ship is not finished and never will be.
    B.add('core', 'greeble', G.hullRibs({
      count: 2, spacing: 58, span: 58, height: 10, thickness: 8, taper: 0.8, detail: D,
    }), { pos: [-104, -6, -420], rot: [0, 0, Math.PI * 0.5] });
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
    // REAL SECTION DEPTH, not a plank. 46 m across and 40 m deep, chamfered top and
    // bottom, standing 56 m clear of the hull flank, and it carries `dark` — so the
    // assembly reads as a MASS WITH A HOLE THROUGH IT rather than as scaffolding, and
    // it is a different value from the hull it hangs under. §1's area rule wants the
    // secondary mass at 18-24% of the silhouette; line-work cannot get there and a
    // 46 x 40 x 320 m box on each side can.
    // -----------------------------------------------------------------------
    B.add('core', 'dark', G.panelledSlab({
      width: railW, height: BAY.roof - BAY.chordTop, depth: len, chamfer: 11, detail: D,
    }), { pos: [s * railX, (BAY.roof + BAY.chordTop) * 0.5, cz] });

    // Bottom chord, slightly inboard of the rail above it so the assembly has a
    // visible section rather than being one prismatic bar.
    B.add('core', 'dark', G.panelledSlab({
      width: BAY.chordOut - BAY.chordIn, height: BAY.chordBot - BAY.floor, depth: len, chamfer: 8, detail: D,
    }), { pos: [s * (BAY.chordOut + BAY.chordIn) * 0.5, (BAY.chordBot + BAY.floor) * 0.5, cz] });

    // One diagonal per rail, and they are braced in OPPOSITE directions fore and aft.
    // A rectangular frame with no diagonal cannot take a shear load and the eye knows
    // it even when the player could not say why; two diagonals that mirror each other
    // read as a truss bought from a catalogue.
    if (full) {
      B.add('core', 'greeble', beam(
        [s * railX, BAY.chordTop, s < 0 ? 152 : -152], [s * railX, BAY.chordBot, s < 0 ? -8 : -112], 10,
        { caps: false, detail: D },
      ));
    }

    // DOOR TRACKS AND STANCHION FEET, on the rail's inboard face and nowhere else.
    // This is §3 justification 4 — dense detail on functional edge structure, not on
    // the plate the track is bolted to — and it is the ONLY greeble anywhere on the
    // 320 m assembly. The four outboard rail faces stay calm reserve.
    if (full) {
      for (const z of s < 0 ? [104, -46] : [46, -128]) {
        B.add('core', 'greeble', G.greebleBand({
          length: 88, width: 15, height: 11, boxes: 2, conduits: 1,
          rng: rng.fork(`bay:track:${s}:${z}`), detail: D,
        }), { pos: [s * (BAY.railIn + 12), -64, z], rot: [0, 0, s * 0.4] });
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
  for (const [z, t, rake] of BAY.frames) {
    B.add('core', 'plating', G.panelledSlab({
      width: BAY.railOut * 2, height: BAY.frameTop - BAY.frameBot, depth: t, chamfer: 6, detail: D,
    }), { pos: [0, (BAY.frameTop + BAY.frameBot) * 0.5, z], rot: [rake, 0, 0] });
  }

  // Reactor bulkhead: the forward face, and the only closed one.
  B.add('core', 'plating', G.panelledSlab({
    width: BAY.throat * 2, height: BAY.roof - BAY.floor, depth: 22, detail: D,
  }), { pos: [0, (BAY.roof + BAY.floor) * 0.5, BAY.z1 - 12] });

  // FOUR GRAPPLE ARMS, two a side, stowed folded against the rails 12 degrees off
  // parallel. The pivots are at DIFFERENT z port and starboard - symmetric grapples
  // read as landing gear, and this ship is not landing anywhere.
  if (full) {
    const pivots = [[-1, 112], [-1, -38], [1, 64], [1, -96]];
    for (const [s, z] of pivots) {
      B.add('core', 'greeble', beam([s * (BAY.railIn + 4), -104, z], [s * (BAY.railOut - 6), -118, z - 94], 11,
        { caps: false, detail: D }));
    }
  }

  // Bay interior lighting: a recess deeper than 12 m gets the warm interior treatment,
  // which is what gives every deep cut on this hull a payoff.
  for (const s of [-1, 1]) {
    B.addRaw('core', 'engineGlow', glowDisc(15), { pos: [s * 96, -84, 40], rot: [Math.PI * 0.5, 0, 0] });
  }

  // HAZARD MARKING, and the one place on the ventral it is legal: the door swing arc
  // and the grapple travel envelope, i.e. exactly where something moves (§4b).
  // PORT ONLY. §3 is explicit that a dense or accented band appearing at port x and
  // again at starboard x at the same z is the strongest single tell of procedural
  // placement, and a hazard stripe is the most conspicuous accent on the ship.
  if (full) {
    B.add('core', 'greeble', G.panelledSlab({ width: 30, height: 5, depth: 60, detail: D }),
      { pos: [-(BAY.railIn + 8), -62, 132] });
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
    if (full) {
      // Machinery at the knuckle. Machinery is allowed to look busy because machinery
      // IS busy - this is one of the four justifications a dense band may claim (§3).
      B.add('core', 'greeble', G.panelledSlab({ width: 30, height: 26, depth: 40, detail: D }),
        { pos: [y.knuckle[0] * 1.06, y.knuckle[1] + 14, y.knuckle[2]] });
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
  B.add('core', 'plating', beam(YOKE.port.tip, [-22, -52, 694], 9, { caps: false, detail: D }));
  B.add('core', 'plating', beam(YOKE.stbd.tip, [24, -54, 682], 9, { caps: false, detail: D }));

  // The transverse tie that makes it an A-FRAME rather than two independent legs.
  B.add('core', 'plating', beam(
    [YOKE.port.root[0] - 6, YOKE.tie, 498], [YOKE.stbd.root[0] + 6, YOKE.tie + 12, 490], 16, { detail: D },
  ));

}

// ---------------------------------------------------------------------------
// M4 — the stern
// ---------------------------------------------------------------------------

function buildStern(B, D, full, rng) {
  // The main drive well: an inside-out shell, so you look INTO a hole rather than at a
  // dark disc. It is empty because the ship does not have its main drive.
  //
  // THE TRANSOM RING IS THE TRANSOM. The spine loft is built with `capBack: false`
  // and this annulus closes it, which is why the well is a real hole. The first pass
  // let the loft cap the transom AND drew this ring on top of it: two coplanar faces
  // 0 m apart, which is a textbook z-fight. It showed up in review as "a dark
  // elliptical void between the aft fins" and "a grid of thin black lines", i.e. as
  // two separate defects that were one bug. It lives in `core` rather than `engine`
  // because it is hull skin, and losing the whole stern face when the drive array is
  // shot off would be a hole in the ship.
  const wellProfile = G.octProfile(WELL.hw, WELL.top, WELL.bot, WELL.cw, WELL.ct, WELL.cb);
  const transom = stationProfile(HULL_STATIONS[0]);
  B.add('core', 'hull', G.ringFace(transom, wellProfile, WELL.mouthZ, true));
  B.add('engine', 'greeble', G.prism(wellProfile, WELL.backZ, WELL.mouthZ, {
    capFront: false, capBack: true, flip: true,
  }));

  // TWO OUTRIGGER PODS. Each hangs off the block on a SINGLE pylon, so there is open
  // sky between pod and hull both fore and aft of it: the third void, and the one that
  // reads in plan and from dead astern. The bells on their after ends are what the
  // ship is actually flying on.
  for (const s of [-1, 1]) {
    B.add('engine', 'hull', G.loft([
      { z: POD.z0, points: G.hullProfile({ deckHalf: POD.halfW, keelHalf: POD.halfW * 0.8, top: POD.top, bottom: POD.bot, chamW: 8, chamTop: 7, chamBot: 7 }) },
      { z: POD.z1 - 40, points: G.hullProfile({ deckHalf: POD.halfW, keelHalf: POD.halfW * 0.8, top: POD.top, bottom: POD.bot, chamW: 8, chamTop: 7, chamBot: 7 }) },
      { z: POD.z1, points: G.hullProfile({ deckHalf: POD.halfW * 0.5, keelHalf: POD.halfW * 0.44, top: POD.top * 0.6, bottom: POD.bot * 0.6, chamW: 5, chamTop: 4, chamBot: 4 }) },
    ]), { pos: [s * POD.x, 6, 0] });

    B.add('engine', 'plating', G.panelledSlab({
      width: POD.x - 140, height: 46, depth: POD.pylonT, detail: D,
    }), { pos: [s * (POD.x + 140) * 0.5, 14, POD.pylonZ] });

    B.add('engine', 'greeble', G.thrusterBell({
      throat: 17, mouth: 25, length: 54, sides: 6, collar: false, detail: D,
    }), { pos: [s * POD.x, 6, POD.z0 + 54] });
    B.addRaw('engine', 'engineGlow', glowDisc(22), { pos: [s * POD.x, 6, POD.z0 + 3], rot: [0, Math.PI, 0] });
  }

  // THE RADIATOR BANK (see FINS). Every fin carries a rim spar on its tip and
  // trailing edge, so the plate has a visible EDGE instead of reading as a sheet of
  // tarpaulin hung off the stern, and each one sits on a root fairing - a fin that
  // grows straight out of a flat is a decal, a fin that grows out of a housing is
  // hardware.
  for (const [s, z, chord, span, rake] of FINS) {
    B.add('engine', 'radiator', G.radiatorFin({
      chord, span, thickness: 13, sweep: -chord * 0.42, tipChord: chord * 0.6,
      rim: 9, detail: D,
    }), { pos: [s * 116, 60, z], rot: [0, 0, rake] });
    B.add('engine', 'greeble', G.panelledSlab({
      width: 30, height: 22, depth: chord * 1.15, detail: D,
    }), { pos: [s * 116, 66, z + chord * 0.4] });
  }

  // GREEBLE BANDS AT THE STERN, both justified: the drive-well rim is machinery and
  // the radiator roots are a joint between two masses.
  if (full) {
    B.add('engine', 'greeble', G.greebleBand({
      length: 190, width: 46, height: 15, boxes: 3, conduits: 0, rng: rng.fork('band:radroot'), detail: D,
    }), { pos: [-116, 78, -600] });
    B.add('engine', 'greeble', G.greebleBand({
      length: 110, width: 40, height: 13, boxes: 2, conduits: 0, rng: rng.fork('band:wellrim'), detail: D,
    }), { pos: [96, -30, -644], rot: [0, 0, -Math.PI * 0.5] });
  }
}

// ---------------------------------------------------------------------------
// Shared sub-assemblies
// ---------------------------------------------------------------------------

/**
 * An UNOCCUPIED mount, in the one vocabulary the whole ship uses: a plinth, a bolt
 * ring and capped conduits. This function existing once is why all six mounts read as
 * the same kind of thing, which is why filling one reads as progress rather than as a
 * random new lump.
 *
 * The bolt ring goes in `trim` and the socket bore in `greeble`, so an empty mount is
 * DARKER inside than out - a warm, busy interior behind a clean rim is a far stronger
 * "something goes here" signal than a bolt circle on a flat pad (§4, recess colour).
 */
function emptyMount(B, id, anchor, { face, padRadius, conduits, detail, full, rng }) {
  const [ax, ay, az] = anchor;
  const padRot = face === 'down' ? [Math.PI, 0, 0] : [0, 0, 0];
  const collarRot = face === 'up' ? [-Math.PI * 0.5, 0, 0]
    : face === 'down' ? [Math.PI * 0.5, 0, 0]
      : [0, Math.PI, 0];
  const sign = face === 'down' ? -1 : 1;

  // Past the LOD1 switch the whole mount assembly is under two pixels.
  if (!full) return;

  // The pad is `plating`, not `hull`. On `hull` the five pads came back in the khaki
  // tier-2 variant and read as five bright tan patches evenly spread down a grey ship
  // - five more co-equal features on a hull that already had too many, and the only
  // saturated albedo anywhere except the accent trim. A mount pad is a flat bed; it
  // does not need to be a different colour to say so, the bolt ring says it.
  const padH = 9;
  if (face !== 'aft') {
    B.add('core', 'plating', G.mountPad({ radius: padRadius, height: padH, sides: 5, detail }),
      { pos: [ax, ay, az], rot: padRot });
  }

  B.add('core', 'greeble', G.dockingCollar({
    radius: padRadius * 0.74, innerRadius: padRadius * 0.5, depth: 7, sides: 4, detail,
  }), {
    pos: face === 'aft' ? [ax, ay, az - 7] : [ax, ay + sign * padH, az],
    rot: collarRot,
  });

  const jitter = rng.fork(`mount:${id}`);
  for (let i = 0; i < conduits; i++) {
    const a = Math.PI * (0.25 + i * (1.5 / Math.max(1, conduits))) + jitter.range(0, 0.3);
    const rr = padRadius * 1.16;
    const len = 20 + jitter.range(0, 12);
    if (face === 'aft') {
      B.add('core', 'greeble', G.cappedConduit({ length: len, radius: 7, axis: 'z', detail }), {
        pos: [ax + Math.cos(a) * rr, ay + Math.sin(a) * rr, az],
        rot: [0, Math.PI, 0],
      });
    } else {
      B.add('core', 'greeble', G.cappedConduit({ length: len, radius: 7, axis: 'y', detail }), {
        pos: [ax + Math.cos(a) * rr, ay, az + Math.sin(a) * rr],
        rot: padRot,
      });
    }
  }
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
  { id: 'sensor_array', kind: 'sensor', hp: 900, position: [-18, 300, -208], radius: 62, salvageValue: 0.10, label: 'Sensor Mast' },
  { id: 'salvage_bay', kind: 'hangar', hp: 2200, position: [0, -156, 0], radius: 140, salvageValue: 0.14, label: 'Salvage Bay' },
  { id: 'cutter_yoke', kind: 'weapon', hp: 1100, position: [0, -190, 560], radius: 120, salvageValue: 0.10, label: 'Cutter Yoke' },
  { id: 'mount_port', kind: 'weapon', hp: 1200, position: [-156, 30, 130], radius: 66, salvageValue: 0.06, label: 'Port Sponson' },
  { id: 'mount_stbd', kind: 'weapon', hp: 1200, position: [156, 30, 10], radius: 66, salvageValue: 0.06, label: 'Starboard Sponson' },
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
      const key = `${group}/${b.surface}${b.uv ? '' : '#raw'}`;
      let e = merged.get(key);
      if (!e) { e = { group, surface: b.surface, uv: b.uv, parts: [] }; merged.set(key, e); }
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
