/**
 * FACTION SHIP KIT — the shared machinery every faction hull is built with.
 *
 * Nothing in this file makes a design decision. It exists so that
 * `coalition.js`, `concord.js` and `derelict.js` can each be a list of METRES and
 * nothing else, and so the triangle audit can count a hull without a browser.
 *
 * THE ONE RULE THAT MATTERS HERE
 *   Everything above `buildShip()` is PURE: three.js maths and the greeble kit, no
 *   materials, no textures, no DOM, no GPU. `tools/` and `scratch/` can therefore
 *   import a hull and count it. `buildShip()` is the only function that touches the
 *   material registry, and it never constructs a material - it asks the registry.
 *
 * SURFACES. Six per faction and no more. The whole art direction is that a fleet of
 * mismatched salvage still reads as one world, and that survives exactly as long as
 * the number of distinct surfaces in frame stays small. A hull that wants a seventh
 * surface wants a different silhouette instead.
 *
 * RUNNING LIGHTS. Every faction hull wears the strip from
 * art/textures/runningLights.js, laid on the upper chine with U authored in METRES.
 * Two triangles a side, exact spacing, no way to lie about the ship's size.
 *
 * THE SPACING IS 40 m, AND IT USED TO BE 6. That was a real defect and it is worth
 * stating why, because it is invisible in any single picture. There are two
 * constants in this codebase that both call themselves the game-wide running-light
 * spacing:
 *
 *   core/units.js#SCALE_CUE.runningLightSpacingM      40   (shared foundation)
 *   art/textures/runningLights.js#RUNNING_LIGHT_...    6   (the texture's own tile)
 *
 * The player cruiser and every bolt-on module use the first (cruiser.js#
 * RUNNING_LIGHT_AXIS_SPACING_M, modules/kit.js#MODULE_LIGHT_SPACING_M); the faction
 * fleet was authoring U straight in metres and therefore getting the second. So the
 * one repeating feature in the game whose entire job is to be a RULER was 6 m on a
 * Coalition frigate and 40 m on the cruiser flying beside it - a hull measured
 * against its escort read six and a half times the size it is, which is precisely
 * the failure mode ship-language.md §7 forbids ("40 m, game-wide, never
 * overridden"). Scaling U by `LIGHT_U_PER_M` converts hull metres into texture
 * metres, so one lamp lands every 40 m on every hull in the fleet and the fleet
 * agrees with the cruiser.
 *
 * The right long-term fix is one constant, not two, and that is a change to
 * art/textures/ and core/ which this stream does not own - noted in the report.
 *
 * ===========================================================================
 * THE SHARED HULL VOCABULARY lives in this file, under "THE SECTION FAMILY"
 * ===========================================================================
 * `Lines` below is the OLD language: an 8-gon of four orthogonal planes and four
 * thin chamfers. Every hull in the fleet is built from it and the fleet measures
 * 47-82% axis-aligned as a result. `Mass` and its section are the language the
 * player cruiser was rebuilt in, extracted so three faction files share ONE
 * vocabulary instead of three readings of a paragraph. Start at the block comment
 * headed "THE SECTION FAMILY - the one shape every hull in this game is cut from",
 * and read "HOW TO MAKE TWO HULLS THAT ARE NOT THE SAME SHAPE" before authoring a
 * station table.
 */

import * as THREE from 'three';
import * as G from '../greeble.js';
import { SCALE_CUE } from '../../../core/units.js';
import { RUNNING_LIGHT_SPACING_M } from '../../textures/runningLights.js';

/**
 * Texture-U per hull metre. The strip texture lays a lamp every
 * RUNNING_LIGHT_SPACING_M of U, so this is the factor that turns that into the
 * game-wide spacing.
 */
export const LIGHT_U_PER_M = RUNNING_LIGHT_SPACING_M / SCALE_CUE.runningLightSpacingM;

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/**
 * Faction surface tables: logical name -> [registry key, registry opts].
 *
 * `wear` is quantised by the registry to 0.125 steps, so the values here are
 * authored on that grid - otherwise two hulls that meant to share a material get
 * two, and two draw calls with them.
 */
export const SURFACES = {
  coalition: {
    hull: ['hull', { faction: 'coalition', wear: 0.625, tier: 2 }],
    plating: ['plating', { faction: 'coalition', wear: 0.5, tier: 2 }],
    dark: ['hullDark', { faction: 'coalition', wear: 0.75, tier: 2 }],
    greeble: ['greeble', { faction: 'coalition', wear: 0.625, tier: 1 }],
    trim: ['trim', { faction: 'coalition', wear: 0.5, tier: 1 }],
    glass: ['glass', { faction: 'coalition' }],
  },
  concord: {
    hull: ['hull', { faction: 'concord', wear: 0.25, tier: 3 }],
    plating: ['plating', { faction: 'concord', wear: 0.125, tier: 3 }],
    dark: ['hullDark', { faction: 'concord', wear: 0.375, tier: 3 }],
    greeble: ['greeble', { faction: 'concord', wear: 0.25, tier: 2 }],
    trim: ['trim', { faction: 'concord', wear: 0.25, tier: 2 }],
    glass: ['glass', { faction: 'concord' }],
  },
  derelict: {
    hull: ['derelictHull', { faction: 'derelict', wear: 0.875, tier: 1 }],
    plating: ['derelictHull', { faction: 'derelict', wear: 0.75, tier: 2 }],
    dark: ['hullDark', { faction: 'derelict', wear: 1.0, tier: 1 }],
    greeble: ['greeble', { faction: 'derelict', wear: 0.875, tier: 1 }],
    trim: ['trim', { faction: 'derelict', wear: 0.75, tier: 1 }],
    glass: ['glass', { faction: 'derelict' }],
  },
};

/** Surfaces whose UVs are authored by the part and must not be re-projected. */
const RAW_SURFACES = new Set(['runningLights', 'engineGlow', 'emissive']);

// ---------------------------------------------------------------------------
// Part collection
// ---------------------------------------------------------------------------

/**
 * Geometry accumulator. One bucket per (damage group x surface); each bucket
 * merges into exactly one mesh, so a hull is a handful of draw calls and a
 * separately-destroyable mass is still its own object.
 */
export class Buckets {
  constructor() { this.map = new Map(); }

  /**
   * @param {string} group   damage group: 'core' | 'engine' | 'weapon' | 'tower' ...
   * @param {string} surface key into the faction surface table, or an emissive key
   * @param {THREE.BufferGeometry} geo
   * @param {{pos?:number[],rot?:number[],scale?:number|number[]}} [xf]
   */
  add(group, surface, geo, xf = null) {
    if (!geo) return;
    const uv = !RAW_SURFACES.has(surface);
    const key = `${group}/${surface}`;
    let b = this.map.get(key);
    if (!b) {
      b = { key, group, surface, uv, parts: [] };
      this.map.set(key, b);
    }
    b.parts.push(xf ? { geo, ...xf } : { geo });
  }

  list() { return Array.from(this.map.values()); }
}

// ---------------------------------------------------------------------------
// Hull lines
// ---------------------------------------------------------------------------

/**
 * A run of hull stations, the cross-section this whole game is drawn in.
 *
 * Rows are `[z, deckHalf, top, bottom, chamW, chamTop, chamBot, keelRatio?]`,
 * ascending in z, all metres in ship space (+Z forward, +Y up, +X starboard).
 *
 * The chamfers are not decoration. They are where every rim light in the frame
 * comes from, which is why the running-light strip is laid on the upper one.
 *
 * ---------------------------------------------------------------------------
 * `keelRatio` — the eighth column, and the reason this class changed
 * ---------------------------------------------------------------------------
 * The rebuilt cruiser (art/geometry/cruiser.js) carries the keel half-beam
 * independently of the deck half-beam, which is what buys naval architecture's two
 * free curves:
 *
 *   TUMBLEHOME   keel < deck (0.78-0.84). The flanks slope INWARD going down, so
 *                the upper flank catches the key and the lower flank falls into
 *                shadow. One geometric surface reads as two values, for nothing.
 *   FLARE        keel > deck (1.05-1.15), forward of the forefoot, so the widest
 *                part of the bow is down at the waterline rather than up at the
 *                deck. Flare forward plus tumblehome aft is the difference between
 *                a ship and an extrusion (ship-language.md §2).
 *
 * The faction fleet was built to the OLD language and every hull was a plain
 * `octProfile`, i.e. keelRatio 1.0 everywhere: vertical flanks, no value split, no
 * flare. Omitting the column still gives you exactly that, so nothing breaks; the
 * point is that a hull that wants to match the cruiser can now say so in one number
 * per station. `hullProfile` returns the same eight points in the same winding as
 * `octProfile`, so the two are interchangeable inside a single loft.
 */
export class Lines {
  constructor(rows) {
    this.rows = rows;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] <= rows[i - 1][0]) {
        throw new Error(`[ships] station table is not ascending in z at index ${i}`);
      }
    }
  }

  get z0() { return this.rows[0][0]; }
  get z1() { return this.rows[this.rows.length - 1][0]; }

  /** Drop intermediate stations for a cheaper LOD without moving the extremes. */
  static decimate(rows, keepEvery) {
    if (keepEvery <= 1 || rows.length <= 2) return rows;
    const out = [rows[0]];
    for (let i = keepEvery; i < rows.length - 1; i += keepEvery) out.push(rows[i]);
    out.push(rows[rows.length - 1]);
    return out;
  }

  static profile(r) {
    return G.hullProfile({
      deckHalf: r[1], keelHalf: r[1] * (r[7] ?? 1),
      top: r[2], bottom: r[3], chamW: r[4], chamTop: r[5], chamBot: r[6],
    });
  }

  stations(keepEvery = 1) {
    return Lines.decimate(this.rows, keepEvery).map((r) => ({ z: r[0], points: Lines.profile(r) }));
  }

  /**
   * Stations at the listed z values ONLY, extremes always kept.
   *
   * This exists because `decimate` is the wrong tool for an LOD and the cruiser
   * rebuild proved it: a blind every-other pass dropped the waist and two of three
   * prow stations, and the ship read as a DIFFERENT CLASS at five kilometres than
   * at three. An LOD is authored INWARD from the LOD0 silhouette by naming the
   * stations that ARE the silhouette, never by throwing away every second one.
   */
  pick(zs) {
    const keep = this.rows.filter((r, i) => zs.includes(r[0]) || i === 0 || i === this.rows.length - 1);
    return keep.map((r) => ({ z: r[0], points: Lines.profile(r) }));
  }

  loft(opts = {}, keepEvery = 1) { return G.loft(this.stations(keepEvery), opts); }

  /** Loft only the named stations. See `pick`. */
  loftPick(zs, opts = {}) { return G.loft(this.pick(zs), opts); }

  /** Linear interpolation of the table at an arbitrary z. Clamped at both ends. */
  at(z) {
    const rows = this.rows;
    let a = rows[0], b = rows[rows.length - 1];
    if (z <= rows[0][0]) { a = b = rows[0]; }
    else if (z >= rows[rows.length - 1][0]) { a = b = rows[rows.length - 1]; }
    else {
      for (let i = 0; i < rows.length - 1; i++) {
        if (z >= rows[i][0] && z <= rows[i + 1][0]) { a = rows[i]; b = rows[i + 1]; break; }
      }
    }
    const span = b[0] - a[0];
    const t = span === 0 ? 0 : (z - a[0]) / span;
    const L = (i) => a[i] + (b[i] - a[i]) * t;
    return {
      hw: L(1), top: L(2), bot: L(3), cw: L(4), ct: L(5), cb: L(6),
      keel: (a[7] ?? 1) + ((b[7] ?? 1) - (a[7] ?? 1)) * t,
    };
  }

  /**
   * SELF-AUDIT against ship-language.md §2, in metres, normalised by hull length.
   * Returns findings rather than throwing, because a corvette legitimately cannot
   * afford every rule a 1400 m cruiser can. Called by probes/ships.js.
   */
  audit(length) {
    const rows = this.rows;
    const out = { flatRun: 0, minima: 0, maxima: 0, waistRatio: 1, tipBelowAxis: 0 };
    // Longest contiguous run inside +-4% of the run's starting half-beam (R2.1).
    for (let i = 0; i < rows.length; i++) {
      const base = rows[i][1];
      let j = i;
      while (j + 1 < rows.length && Math.abs(rows[j + 1][1] - base) <= base * 0.04) j++;
      out.flatRun = Math.max(out.flatRun, rows[j][0] - rows[i][0]);
    }
    // Interior extrema in the plan half-beam curve (R2.2): want exactly one of each.
    for (let i = 1; i < rows.length - 1; i++) {
      if (rows[i][1] < rows[i - 1][1] && rows[i][1] < rows[i + 1][1]) out.minima++;
      if (rows[i][1] > rows[i - 1][1] && rows[i][1] > rows[i + 1][1]) out.maxima++;
    }
    // Waist depth (R2.3): smallest interior section against the largest.
    const area = (r) => r[1] * 2 * (r[2] - r[3]);
    const interior = rows.slice(1, -1);
    if (interior.length) {
      const lo = Math.min(...interior.map(area));
      const hi = Math.max(...rows.map(area));
      out.waistRatio = hi > 0 ? lo / hi : 1;
    }
    // Tip centre below the axis (R2.5).
    const tip = rows[rows.length - 1];
    out.tipBelowAxis = -((tip[2] + tip[3]) * 0.5);
    out.flatRunFrac = out.flatRun / Math.max(1, length);
    return out;
  }

  /**
   * Midpoint and outward normal of the upper chamfer facet at z, starboard side.
   * The facet runs from (hw, top-ct) to (hw-cw, top), so its outward normal is
   * (ct, cw) normalised - which is what puts a light strip flat on the chine
   * however the lines are edited later.
   */
  chine(z) {
    const s = this.at(z);
    const nx = s.ct, ny = s.cw;
    const len = Math.hypot(nx, ny) || 1;
    return { x: s.hw - s.cw * 0.5, y: s.top - s.ct * 0.5, nx: nx / len, ny: ny / len };
  }
}

// ===========================================================================
// THE SECTION FAMILY - the one shape every hull in this game is cut from
// ===========================================================================
//
// WHY THIS EXISTS, as a number rather than as a preference.
//
// `ships/audit.mjs` weights every LOD0 triangle by area and bins its face normal.
// The fraction of surface area lying within 5 degrees of +-X / +-Y / +-Z is what
// "it is a box" means when you have to measure it. On HEAD:
//
//     player_cruiser          7169 tris   axis 32.2%   <- rebuilt from this section
//     coalition_strikecraft    138 tris   axis 82.1%
//     coalition_carrier       1592 tris   axis 67.3%
//     concord_escort           532 tris   axis 61.5%
//     concord_frigate          616 tris   axis 57.6%
//     coalition_monitor        844 tris   axis 54.8%
//
// The cruiser is not better lit or better textured than the carrier. It is cut
// from a different section. `Lines` (above) is an 8-gon: four big orthogonal
// planes carrying ~86% of the section perimeter and four thin chamfers carrying
// the rest, which is a box with its corners knocked off however you sweep it.
// `greeble.js#facetProfile` is a 12-gon of six facets a side in which NO FACET IS
// WITHIN 5 DEGREES OF AN AXIS at any station in the hull's working range, the
// largest facet is 11% of the perimeter, and every dihedral is either under 12
// degrees (a fair panel break) or over 28 (a chine that catches a rim light) -
// never in the 12-28 band that reads as a modelling accident.
//
// Everything below is a thin, NAMED, CHECKED layer over that one function plus
// `greeble.js#loft`. It makes no design decisions; it removes the four ways a
// caller can build the right shape wrongly, all four of which have already
// happened in this repository at least once.
//
// ---------------------------------------------------------------------------
// THE ROW, and it is the same seven columns in all three places
// ---------------------------------------------------------------------------
//
//     [z, half, top, bottom, knuckle, deckFlat, flare]
//
//   z         station position, metres, ASCENDING. +Z forward.
//   half      HALF-BEAM AT THE KNUCKLE - the widest point of the section, which is
//             NOT the deck edge. Full beam is 2 * half.
//   top       deck plate level. The cambered crown sits above it.
//   bottom    keel plate level. The deadrise crown sits below it.
//   knuckle   how far below the deck the knuckle sits, as a FRACTION of section
//             depth. 0.30..0.55. Low number = high beltline = flare; high number =
//             low beltline = slab sides.
//   deckFlat  deck flat half-width over `half`. Wide = a platform. Narrow = a blade.
//   flare     scales the two points BELOW the knuckle. <1 tumblehome, >1 flare.
//
// `cruiser.js#HULL_STATIONS` is written in these columns. `modules/kit.js#
// massProfile` reads these columns. This file's `Mass` takes these columns. One
// row format across the hull, the module library and the fleet is the whole point:
// a shape that reads correctly on the cruiser transfers by copying seven numbers.
//
// ---------------------------------------------------------------------------
// HOW TO MAKE TWO HULLS THAT ARE NOT THE SAME SHAPE
// ---------------------------------------------------------------------------
//
// READ THIS BEFORE AUTHORING A TABLE. `ships/audit.mjs` holds 78 class pairs apart
// by outline distance with both hulls normalised to 200 m, and gates INTRA-faction
// pairs at 10.0 m mean / 40.0 m peak at that reference. The closest pairs on record
// are coalition monitor/destroyer at 10.2 and concord corvette/frigate at 11.2 -
// 2% and 12% of headroom. Giving nine hulls the same section family is exactly the
// move that collapses them, so the knobs have to be turned HARD and turned
// DIFFERENTLY per class.
//
// THE METRIC ONLY SEES THREE NUMBERS PER Z-BIN: max |x|, max y, min y
// (`silhouetteSignature` below). That has a blunt consequence worth stating first:
//
//     FRAMES, STRAKES, BELTS, RECESSES AND INTAKES MOVE THE OUTLINE BY ~0 AND
//     THEREFORE BUY EXACTLY ZERO SEPARATION.
//
// They are surface language: they are how a hull stops being a box and how a NAVY
// reads as one navy. They are not how a CLASS reads as one class. An agent who
// rebuilds five hulls by adding frames and strakes to five similar lofts will make
// the fleet much prettier and fail this gate. Separation is bought with, in
// descending order of power:
//
//   1. TOPOLOGY - how many masses, and where the sky is. One `Mass` is a hull; two
//      `Mass`es with a gap between them is a different CLASS OF OBJECT at 30 px.
//      Every pair currently near the floor is a pair with the same topology.
//   2. THE PLAN CURVE - where the waist and the shoulder sit along z, and how deep
//      the waist is. `findings().waistRatio` measures it. A waist at 20% of length
//      and a waist at 70% are different silhouettes at any range.
//   3. BEAM : DEPTH. The single strongest continuous lever. 1.7 is a tower, 2.2 is
//      the cruiser, 3.4 is a raft. It moves max|x| and both y extremes at once.
//   4. THE SHEER AND KEEL RELATIONSHIP. Deck rising while the keel drops is a
//      wedge; both falling forward is a dart; a flat keel under a falling deck is a
//      monitor. `findings().minParallel` refuses to let them run parallel.
//   5. `deckFlat` OVER THE LENGTH. 0.65 aft falling to 0.25 at the stem is a
//      carrier that ends in a blade. A constant 0.5 is the default and the default
//      is what everything else will also be.
//   6. `knuckle` OVER THE LENGTH. Moves the beltline, which moves the plan-view
//      outline without moving beam - the cheapest way to separate two hulls that
//      have to share proportions for gameplay reasons.
//   7. `flare` OVER THE LENGTH. Tumblehome everywhere is a slab; flare forward of
//      the forefoot is a bow that pushes something out of the way.
//
// Knobs 5-7 are free: they cost no triangles and no draw calls. Knob 1 costs
// neither if the second mass merges into the same bucket.
//
// AFTER AUTHORING, RUN `node src/art/geometry/ships/audit.mjs` AND READ THE TEN
// CLOSEST PAIRS. It is two seconds and it is the only opinion that counts.
//
// ---------------------------------------------------------------------------
// THE CALLING CONVENTION, end to end
// ---------------------------------------------------------------------------
//
//   const HULL = new Mass([
//     // [z, half, top, bottom, knuckle, deckFlat, flare]
//     [-150, 30, 12, -17, 0.50, 0.60, 0.86],   // slab stern: low beltline, wide deck
//     ...
//     [ 150,  8, -3, -12, 0.34, 0.34, 1.00],   // a chisel, and its centre below y=0
//   ], { label: 'ardent' });
//
//   const FRAMES = HULL.frameStations({ length: 210, count: 3 });
//
//   function ardentParts({ lod }) {
//     const D = G.detailForLod(lod);          // 2 / 1 / 0
//     const full = lod === 0;
//     const B = new Buckets();
//
//     // 1. THE MASS. One loft. Stations by NAME past LOD0.
//     B.add('core', 'hull', HULL.loft(lod ? { lod, at: [-150, -70, 20, 105, 150] } : {}));
//
//     // 2. STRUCTURE, at the hull's rhythm.
//     if (D >= G.DETAIL.MID) B.add('core', 'plating', HULL.frames(FRAMES, { detail: D }));
//
//     // 3. THE VALUE SPLIT, and it belongs BELOW THE KNUCKLE and nowhere else.
//     //    Coalition: a BELT of separate plates with sky between them.
//     //    Concord:   ONE continuous strake. Same call, one argument apart.
//     if (full) for (const side of [-1, 1]) {
//       B.add('core', 'dark', HULL.belt({ z0: -140, z1: 20, plates: 3, side, taper: 0.2 }));
//     }
//
//     // 4. DETAIL INSIDE THE SILHOUETTE. Cut the recess, THEN put machinery in it.
//     if (full) {
//       B.add('core', 'greeble', HULL.intake({ z0: -120, z1: -20, side: -1 }));
//       B.add('core', 'greeble', HULL.recess({ z: 40, side: 1, width: 18, height: 9 }));
//     }
//
//     // 5. THE SCALE CUE. `chineStrip` takes a Mass unchanged - `Mass#chine` returns
//     //    the KNUCKLE, which is the one edge visible from above, abeam and ahead.
//     for (const side of [-1, 1]) B.add('core', 'runningLights', chineStrip(HULL, -140, 130, side));
//
//     return { buckets: B.list() };
//   }
//
// FOUR THINGS THAT ARE EASY TO GET WRONG AND ARE NOT ERRORS:
//
//   - EVERY `B.add` ABOVE LANDS IN THE SAME FEW BUCKETS, so all of it is ONE draw
//     call per surface per damage group. Triangles are free here and draw calls are
//     not: more detail in the same buckets costs nothing, a new SURFACE costs a draw
//     per damage group per hull forever.
//   - A `Mass` is in ITS OWN FRAME. Place it at `B.add` time. Two masses with sky
//     between them is the strongest separation move in the kit and it is two
//     `B.add`s with different `pos`.
//   - `dark` GOES BELOW THE KNUCKLE ONLY. Above and below the same chine is the one
//     arrangement that stops the chine reading as the boundary between two values.
//   - NOTHING DENSE IS MIRRORED. `for (const side of [-1, 1])` on a recess is the
//     strongest single tell of procedural placement there is. Mirror the structure;
//     put the hangar, the patch and the sheared-off stub on one side only.
// ---------------------------------------------------------------------------

/**
 * The faceted hull section, named. Twelve points, six facets a side, counter-
 * clockwise from the starboard keel edge going UP.
 *
 * This is `greeble.js#facetProfile` with the fleet's argument names, its bounds
 * CHECKED instead of silently clamped, and one place to read about what the
 * numbers do. Use it for a one-off section; use `Mass` for a run of them.
 *
 * WHY THE BOUNDS THROW RATHER THAN CLAMP. `facetProfile` clamps `knuckle` into
 * 0.30..0.55 and moves on, which is right for a library primitive and wrong for a
 * hull table: a station written with knuckle 0.62 renders as 0.55, the author sees
 * a shape they did not ask for, and there is nothing on screen that says so. The
 * cruiser's own table lives in 0.34..0.53 and never needed the clamp.
 *
 * Returned indices - `FACET` below names the edges between them:
 *   0 keel flat (S)  1 keel chamfer (S)  2 KNUCKLE (S)  3 deck chamfer (S)
 *   4 deck flat (S)  5 deck crown  6..10 the port mirror of 4..0  11 keel crown
 *
 * @param {Object} p
 * @param {number} p.half      half-beam AT THE KNUCKLE. Full beam is twice this.
 * @param {number} p.top       deck plate level
 * @param {number} p.bottom    keel plate level
 * @param {number} [p.knuckle] beltline depth below the deck, as a fraction of
 *                             (top - bottom). 0.30..0.55.
 * @param {number} [p.deckFlat] deck flat half-width over `half`
 * @param {number} [p.flare]   scales the points below the knuckle. <1 tumblehome.
 * @param {number} [p.camber]  deck crown rise, fraction of section depth
 * @param {number} [p.deadrise] keel crown drop, fraction of section depth
 * @param {number[]} [p.keep]  `SECTION_LOD` index map for LOD cardinality
 */
export function hullSection({
  half, top, bottom, knuckle = 0.4234, deckFlat = 0.5085, flare = 1,
  camber = 0.0679, deadrise = 0.0486, keep = null, label = 'section',
}) {
  if (!(half > 0)) throw new Error(`[ships] ${label}: half-beam must be > 0, got ${half}`);
  if (!(top > bottom)) throw new Error(`[ships] ${label}: top ${top} must be above bottom ${bottom}`);
  if (knuckle < 0.30 || knuckle > 0.55) {
    throw new Error(`[ships] ${label}: knuckle ${knuckle} is outside 0.30..0.55. `
      + 'facetProfile would clamp it silently and you would author a shape you cannot see. '
      + 'The beltline is a fraction of section depth, not a metre value.');
  }
  if (!(deckFlat > 0.05 && deckFlat < 0.98)) {
    throw new Error(`[ships] ${label}: deckFlat ${deckFlat} is outside 0.05..0.98. It is the deck `
      + 'flat half-width OVER the knuckle half-beam, a ratio - 1.0 would put the deck edge at the '
      + 'widest point of the section, which is the box-with-a-lid this section family exists to avoid.');
  }
  return G.facetProfile({ maxHalf: half, top, bottom, knuckle, deckFlat, flare, camber, deadrise, keep });
}

/**
 * Section cardinality per LOD, by NAME. Re-exported from `greeble.js#FACET_LOD` so
 * no fleet file has to reach into the greeble kit to decimate a hull.
 *
 * 12 / 12 / 8. LOD1 KEEPS ALL TWELVE and that is measured, not lazy: with six
 * facets a side every point carries a 33-degree chine or more, and dropping the
 * keel chamfer moves the outline 41 m on the cruiser - eight pixels at the LOD1
 * switch. LOD saving comes from STATIONS, which is the axis where a station is 12
 * points and a facet is 2.
 */
export const SECTION_LOD = G.FACET_LOD;

/**
 * NAMED FACETS - the fix for the bug this wave was told about by name.
 *
 * `cruiser.js#flankStrake` was called with the facet written `[2, 1]` (knuckle DOWN
 * to the keel chamfer) and applied `(dy, -dx)` with no sign correction. That is the
 * INWARD normal, so three plates a side sat 13 m INSIDE the hull with their outer
 * faces coplanar with the skin - carrying `dark`, the ship's entire second value,
 * rendered by whichever of two coplanar faces won the depth test. Measured at
 * z -500: the offset landed at (104.5, 14.6) against a knuckle at (114.0, 5.6).
 *
 * The lesson is not "remember to check the sign". It is that a caller should never
 * be holding a pair of integers in the first place. Every plate, belt, recess and
 * intake below takes one of these six constants, and `facetNormal` VERIFIES the
 * result by stepping off the facet and asking the section polygon whether it left
 * it - so the sign is correct even for a hand-written pair, even reversed, even
 * across the 11 -> 0 wrap where "increasing index" is not defined at all.
 *
 * Walking up the starboard side. `dark` belongs BELOW the knuckle and nowhere else
 * (cruiser.js#SURFACE): the knuckle is an 80.8-degree chine visible from above,
 * abeam and ahead, so the value boundary lands on a real edge with a shadow at it
 * instead of stopping in the middle of a face.
 */
export const FACET = {
  keel: [11, 0],          // keel crown to starboard keel edge. Below the waterline read.
  keelChamfer: [0, 1],    // deadrise break
  lowerFlank: [1, 2],     // keel chamfer UP to the knuckle. The `dark` band. 35.3 deg.
  upperFlank: [2, 3],     // knuckle UP to the deck chamfer. The 80.8-degree chine is at its foot.
  deckChamfer: [3, 4],    // the rim-light facet. 32.6 deg.
  deck: [4, 5],           // deck flat edge to the cambered crown
};

/**
 * Structural frame rhythm, as fractions of HULL LENGTH.
 *
 * The cruiser carries its frames 90-140 m apart over 1400 m. Held as metres that
 * rhythm is meaningless on a 95 m corvette and invisible on a 900 m carrier; held
 * as a fraction of length it is the same visual rhythm on all three, which is what
 * makes a fleet look like it was built in the same yards.
 *
 * `gaps` is why frames are NEVER EVENLY SPACED (modules/kit.js M-F5). Evenly
 * spaced ribs read as a texture; unevenly spaced ones read as structure answering
 * to something inside the hull. Fixed numbers and not RNG, because a scale cue that
 * changes between two builds of the same ship is not a cue.
 */
export const FRAME = {
  minSpacingFrac: 0.064,     // 90 m on the 1400 m cruiser
  spacingFrac: 0.082,        // 115 m - the mean
  maxSpacingFrac: 0.100,     // 140 m
  gaps: [1.00, 1.21, 0.86, 1.11, 0.94, 1.17, 0.90],
};

// ---------------------------------------------------------------------------
// Section maths. Module-level scratch: these run at build time, but the house rule
// is no allocation in a loop and there is no reason for this file to be the
// exception.
// ---------------------------------------------------------------------------

const _dir = new THREE.Vector3();

/** Even-odd ray cast. `pts` is a closed polygon of [x, y]. */
function insideSection(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i][1], yj = pts[j][1];
    if ((yi > y) !== (yj > y)) {
      const t = (y - yi) / (yj - yi);
      if (x < pts[i][0] + t * (pts[j][0] - pts[i][0])) hit = !hit;
    }
  }
  return hit;
}

/**
 * The outward normal of a facet, MEASURED rather than inferred.
 *
 * `cruiser.js#skinPlate` takes the sign from the index order, which is correct for
 * every pair it is called with and undefined for `FACET.keel` ([11, 0], where the
 * index decreases across the wrap). This steps `eps` off the facet midpoint along
 * the candidate normal and asks the section polygon whether that point is still
 * inside. If it is, the normal is flipped. There is no argument order, winding
 * convention or index wrap that can defeat it.
 *
 * `eps` scales with the section so it works on an 18 m fighter and a 900 m carrier.
 */
function facetNormal(P, facet, label) {
  const [i, j] = facet;
  if (!(i >= 0 && i < P.length && j >= 0 && j < P.length)) {
    throw new Error(`[ships] ${label}: facet [${i},${j}] is not a pair of indices into a `
      + `${P.length}-point section. Use one of the FACET constants.`);
  }
  const step = ((j - i) % P.length + P.length) % P.length;
  if (step !== 1 && step !== P.length - 1) {
    throw new Error(`[ships] ${label}: facet [${i},${j}] is a chord across the section, not a `
      + 'facet - its two points are not adjacent. A plate laid on a chord cuts through the hull. '
      + 'Use one of the FACET constants.');
  }
  const A = P[i], B = P[j];
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len, ny = -dx / len;
  let lo = Infinity, hi = -Infinity, ylo = Infinity, yhi = -Infinity;
  for (const p of P) {
    if (p[0] < lo) lo = p[0];
    if (p[0] > hi) hi = p[0];
    if (p[1] < ylo) ylo = p[1];
    if (p[1] > yhi) yhi = p[1];
  }
  const eps = Math.max(1e-3, Math.hypot(hi - lo, yhi - ylo) * 0.004);
  const mx = (A[0] + B[0]) * 0.5, my = (A[1] + B[1]) * 0.5;
  if (insideSection(P, mx + nx * eps, my + ny * eps)) { nx = -nx; ny = -ny; }
  return { ax: A[0], ay: A[1], dx, dy, len, nx, ny };
}

/** Four points into a station, wound counter-clockwise. A clockwise one lofts inside-out. */
function windCCW(pts) {
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a2 < 0 ? pts.slice().reverse() : pts;
}

/**
 * Point a +Z-authored primitive down a direction and place it, as two named
 * rotations rather than one composed Euler triple. Same construction as
 * `modules/kit.js#aimed`, and for the same reason: composing two rotations in one
 * XYZ Euler is the most reliable way to produce a part that is twelve degrees wrong
 * in a way nobody notices until it is on the ship.
 */
function aimAt(geo, dir, pos = [0, 0, 0]) {
  _dir.set(dir[0], dir[1], dir[2]);
  if (_dir.lengthSq() < 1e-9) _dir.set(0, 0, 1);
  _dir.normalize();
  const yaw = Math.atan2(_dir.x, _dir.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, _dir.y)));
  return G.place(G.place(geo, { rot: [pitch, 0, 0] }), { rot: [0, yaw, 0], pos });
}

/**
 * A MASS - one continuous lofted body cut from the section family.
 *
 * A hull is a Mass. So is a sponson, an engine block, a boom, a dorsal ridge, the
 * side hull of a carrier. The distinction the class draws is not "hull vs part", it
 * is ONE CONTINUOUS SWEPT BODY vs a stack of prisms, and the whole difference
 * between the cruiser and the fleet today is which of those the geometry is.
 *
 * EVERYTHING IS IN THE MASS'S OWN FRAME, centred on x = 0 with z straight off the
 * table. A mass that lives elsewhere on the ship is PLACED at `B.add(...)` time -
 * `B.add('core', 'hull', pod.loft(), { pos: [86, -20, -140] })` - exactly as the
 * fleet already places a `Lines` loft today. Nothing here carries a world offset,
 * so a plate and the loft it lies on can never disagree about where the body is.
 *
 * WHAT THE CONSTRUCTOR REFUSES, and why each one is a defect that has shipped:
 *
 *   ascending z          `loft` produces inside-out geometry from a descending
 *                        table and nothing says so until a hull renders hollow.
 *   top above bottom     a station with an inverted section lofts a bow tie.
 *   beam : depth         over 80 m of length, >= `minBeamDepth` (1.6, the module
 *                        library's M-F4). "FLAT" is the first word of the brief and
 *                        this is the only place it can be checked. The cruiser
 *                        holds 1.96 worst and 2.27 mean. A mass that is taller than
 *                        it is wide is from a different game; if one genuinely is -
 *                        a conning tower, a fin - pass `exempt` WITH THE REASON,
 *                        the way `audit.mjs#LINE_AUDIT` does.
 *
 * @param {number[][]} rows  `[z, half, top, bottom, knuckle?, deckFlat?, flare?]`
 * @param {Object} [opts]
 * @param {string} [opts.label]          used in every error message. Name it.
 * @param {number} [opts.minBeamDepth]
 * @param {string} [opts.exempt]         a REASON, not a boolean
 */
export class Mass {
  constructor(rows, { label = 'mass', minBeamDepth = 1.6, exempt = null } = {}) {
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new Error(`[ships] ${label}: a mass needs at least two stations, got ${rows?.length ?? 0}`);
    }
    this.rows = rows;
    this.label = label;
    this.exempt = exempt;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i && r[0] <= rows[i - 1][0]) {
        throw new Error(`[ships] ${label}: station table is not ascending in z at index ${i} (z ${r[0]})`);
      }
      // Cheap parse of every station now, so a bad number names its own row rather
      // than surfacing 200 lines later as a hollow loft.
      hullSection({
        half: r[1], top: r[2], bottom: r[3], knuckle: r[4] ?? 0.4234,
        deckFlat: r[5] ?? 0.5085, flare: r[6] ?? 1, label: `${label} z=${r[0]}`,
      });
    }
    const span = this.span;
    if (span > 80 && !exempt) {
      for (const r of rows) {
        const ratio = (r[1] * 2) / Math.max(1e-3, r[2] - r[3]);
        if (ratio < minBeamDepth) {
          throw new Error(`[ships] ${label}: station z=${r[0]} has beam:depth ${ratio.toFixed(2)}, `
            + `under ${minBeamDepth}. The player cruiser holds 1.96 at its worst station and 2.27 `
            + 'on average, and "FLAT" is the first word of the brief. Widen it, shallow it, or pass '
            + '{ exempt: "why" } and say so where the next agent will read it.');
        }
      }
    }
  }

  get z0() { return this.rows[0][0]; }

  get z1() { return this.rows[this.rows.length - 1][0]; }

  get span() { return this.z1 - this.z0; }

  /** Mean section depth. The scale every proportional default here is taken from. */
  get depth() {
    let s = 0;
    for (const r of this.rows) s += r[2] - r[3];
    return s / this.rows.length;
  }

  /** Linear interpolation of the table at an arbitrary z. Clamped at both ends. */
  at(z) {
    const rows = this.rows;
    let a = rows[0], b = rows[rows.length - 1];
    if (z <= rows[0][0]) { a = b = rows[0]; } else if (z >= b[0]) { a = b = rows[rows.length - 1]; } else {
      for (let i = 0; i < rows.length - 1; i++) {
        if (z >= rows[i][0] && z <= rows[i + 1][0]) { a = rows[i]; b = rows[i + 1]; break; }
      }
    }
    const sp = b[0] - a[0];
    const t = sp === 0 ? 0 : (z - a[0]) / sp;
    const L = (i, d) => (a[i] ?? d) + ((b[i] ?? d) - (a[i] ?? d)) * t;
    return {
      z, half: L(1, 1), top: L(2, 0), bot: L(3, 0),
      knuckle: L(4, 0.4234), deckFlat: L(5, 0.5085), flare: L(6, 1),
    };
  }

  /** The section at an arbitrary z, at full or reduced cardinality. */
  section(z, keep = null) {
    const s = this.at(z);
    return hullSection({
      half: s.half, top: s.top, bottom: s.bot, knuckle: s.knuckle,
      deckFlat: s.deckFlat, flare: s.flare, keep, label: `${this.label} z=${z}`,
    });
  }

  /**
   * THE LOFT: the section run along the spine with taper and sheer, as ONE body.
   *
   * This is the function that makes a hull a hull rather than a stack. Taper is the
   * `half` column moving, sheer is `top`, and the keel line is `bottom`; the loft
   * connects consecutive sections with quads, so every one of those three curves
   * becomes a set of large flat planes on the six facet families rather than a step.
   *
   * LOD IS TAKEN ON THE STATION AXIS, BY NAME. Pass `at` a list of z values that
   * ARE the silhouette - the transom, both ends of the waist, the shoulder, the
   * chine break, the stem. Never `rows.filter((_, i) => i % 2)`: a blind every-other
   * pass on the cruiser dropped the waist and two of three prow stations and the
   * ship read as a DIFFERENT CLASS at five kilometres than at three.
   *
   * @param {Object} [opts]
   * @param {number[]} [opts.at]     z values to keep. Extremes are always kept.
   * @param {number} [opts.lod]      0/1 keep 12 points, 2+ collapses to 8
   * @param {number[]} [opts.keep]   explicit `SECTION_LOD` map, overrides `lod`
   * @param {boolean} [opts.capFront] cap the highest-z station
   * @param {boolean} [opts.capBack]  cap the lowest-z station
   * @param {boolean} [opts.flip]     inside-out, for a bay lining or a drive well
   */
  loft({ at = null, lod = 0, keep = undefined, capFront = true, capBack = true, flip = false } = {}) {
    const card = keep !== undefined ? keep : (lod >= 2 ? SECTION_LOD.far : SECTION_LOD.full);
    const last = this.rows.length - 1;
    const rows = at
      ? this.rows.filter((r, i) => i === 0 || i === last || at.includes(r[0]))
      : this.rows;
    if (rows.length < 2) throw new Error(`[ships] ${this.label}: loft picked fewer than two stations`);
    return G.loft(rows.map((r) => ({
      z: r[0],
      points: hullSection({
        half: r[1], top: r[2], bottom: r[3], knuckle: r[4] ?? 0.4234,
        deckFlat: r[5] ?? 0.5085, flare: r[6] ?? 1, keep: card, label: `${this.label} z=${r[0]}`,
      }),
    })), { capFront, capBack, flip });
  }

  /**
   * THE KNUCKLE at z, starboard side: the widest point of the section and the hard
   * 80.8-degree chine that runs the length of the body. The outward normal is the
   * average of the two facets that meet there, which is what makes a lamp sitting on
   * it face out of the CORNER rather than out of one of the two planes.
   *
   * Deliberately named `chine` as well, with the same `{x, y, nx, ny}` shape
   * `Lines#chine` returns, so `chineStrip(mass, z0, z1, side)` works on a Mass with
   * no change to `chineStrip` and no second running-light path in the fleet.
   */
  chine(z) {
    const P = this.section(z);
    const nrm = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l];
    };
    const n1 = nrm(P[1], P[2]), n2 = nrm(P[2], P[3]);
    const nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const l = Math.hypot(nx, ny) || 1;
    return { x: P[2][0], y: P[2][1], nx: nx / l, ny: ny / l };
  }

  /**
   * A SKIN PLATE: a plate lying ON this mass by construction, standing `out` metres
   * proud of the named facet.
   *
   * At every station inside the run it takes the two points bounding the facet,
   * insets along the facet by `t0`/`t1`, offsets along the facet's VERIFIED outward
   * normal, and lofts the four-point result. The plate is therefore exactly parallel
   * to the surface underneath it at every station - which a prismatic bar at a fixed
   * x cannot be on a body whose half-beam moves, and which is the difference between
   * plating and a plank nailed to a hull.
   *
   * `drift` walks the plate ACROSS its facet as it runs in z. That is how an angled
   * plate is built without rotating anything: a plate rotated in world space is a
   * plate that has left the surface.
   *
   * PLATES ARE LOD0/LOD1 DETAIL. Past LOD1 the loft itself drops to eight points and
   * the skin becomes a chord under the twelve-point section this plate is cut from,
   * so a thin plate can sink. Gate them on `full`/`detail` the way the cruiser does.
   *
   * @param {Object} p
   * @param {number} p.z0,p.z1
   * @param {number} [p.side]     -1 port, +1 starboard
   * @param {number[]} [p.facet]  a `FACET` constant
   * @param {number} [p.t0],[p.t1] inset along the facet, 0 at facet[0], 1 at facet[1]
   * @param {number} [p.drift]    t shift from z0 to z1 - the plate's angle
   * @param {number} [p.out]      metres proud. Defaults to 2% of mean section depth.
   * @param {boolean} [p.full]    false thins the station sampling by half
   */
  plate({
    z0, z1, side = 1, facet = FACET.lowerFlank, t0 = 0.08, t1 = 0.92,
    drift = 0, out = null, full = true,
  }) {
    const proud = out ?? Math.max(0.15, this.depth * 0.02);
    if (!(proud > 0)) throw new Error(`[ships] ${this.label}: plate out must be > 0, got ${out}`);
    const zs = [z0];
    for (const r of this.rows) if (r[0] > z0 && r[0] < z1) zs.push(r[0]);
    zs.push(z1);
    const thin = full || zs.length <= 3
      ? zs : zs.filter((z, i) => i === 0 || i === zs.length - 1 || i % 2 === 0);
    const span = (z1 - z0) || 1;
    return G.loft(thin.map((z) => {
      const P = this.section(z);
      const f = facetNormal(P, facet, `${this.label} plate z=${z}`);
      const k = drift * ((z - z0) / span);
      const ta = Math.min(0.97, Math.max(0.03, t0 + k));
      const tb = Math.min(0.97, Math.max(0.03, t1 + k));
      const ax = f.ax + f.dx * ta, ay = f.ay + f.dy * ta;
      const bx = f.ax + f.dx * tb, by = f.ay + f.dy * tb;
      const nx = f.nx * proud, ny = f.ny * proud;
      return {
        z,
        points: windCCW([[ax, ay], [bx, by], [bx + nx, by + ny], [ax + nx, ay + ny]]
          .map(([x, y]) => [side * x, y])),
      };
    }));
  }

  /**
   * AN ARMOUR BELT: a RUN of skin plates with visible gaps between them, merged into
   * one geometry and therefore into one bucket and one draw call.
   *
   * This is a faction knob and it is worth stating as one, because it costs nothing
   * and it is one of the few surface decisions that survives to a fleet view. A
   * continuous strake is a stripe; a run of separate plates with sky between them is
   * ARMOUR, bolted on by somebody who expects to replace one of them. Coalition
   * wants a belt of three or four; Concord wants one continuous plate, because a
   * navy that fairs everything in does not leave seams where a fitter can get a bar
   * behind the plate.
   *
   * `taper` shortens each plate going forward, so the run reads as answering to the
   * hull's own convergence rather than as a repeat.
   */
  belt({
    z0, z1, plates = 3, gap = null, taper = 0, side = 1, facet = FACET.lowerFlank,
    t0 = 0.08, t1 = 0.92, drift = 0, out = null, full = true,
  }) {
    const n = Math.max(1, Math.round(plates));
    const run = z1 - z0;
    const g = gap ?? Math.abs(run) * 0.035;
    const each = (run - g * (n - 1)) / n;
    if (!(each > 0)) {
      throw new Error(`[ships] ${this.label}: belt of ${n} plates with ${g.toFixed(1)} m gaps `
        + `does not fit in ${run.toFixed(1)} m. Fewer plates or a smaller gap.`);
    }
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = z0 + i * (each + g);
      const shrink = 1 - taper * (n === 1 ? 0 : i / (n - 1));
      const b = a + each * shrink;
      if (b - a < 1e-3) continue;
      parts.push({ geo: this.plate({ z0: a, z1: b, side, facet, t0, t1, drift, out, full }) });
    }
    return G.mergeParts(parts, { uv: false });
  }

  /**
   * FRAME STATIONS: where the structural frames go, at the hull's own rhythm.
   *
   * THE SPACING IS THE INVARIANT, NOT THE COUNT, and getting that the wrong way
   * round is a mistake this function made in its first draft. Spacing is a fraction
   * of the CLASS length (see `FRAME`), so the cruiser's 90-140 m over 1400 m becomes
   * 7-11 m on a 95 m corvette and 62-90 m on a 900 m carrier - the same rhythm at
   * every size, which is what makes a fleet look like it was welded in one yard.
   * Pass `length` when the mass is PART of a bigger ship: a sponson on a 480 m
   * destroyer takes the destroyer's 480, not its own 90, or it will wear a rhythm
   * that says "this object is 90 m long" and quietly break the scale cue.
   *
   * A first draft derived the count from the span instead and produced TWELVE frames
   * on every hull in the fleet - 864 triangles, which is 1.7x a whole corvette. Four
   * is the default because `modules/kit.js` M-F5 asks for two to four, and because
   * frames answer to something INSIDE the hull: a band of them over the machinery
   * says more than an even wash of them over the whole length.
   *
   * NEVER EVENLY SPACED, and deterministically so: each gap is exactly
   * `spacing * length * FRAME.gaps[i]`, a fixed sequence, no RNG anywhere - so every
   * gap is inside 7.0-9.9% of length by construction and no two adjacent gaps are
   * equal. The run is centred on the mass unless `from`/`to` say otherwise. A mass
   * too short to carry two frames at the rhythm gets NONE, which is the honest
   * answer rather than two frames at a spacing that lies about the ship's size.
   *
   * COST: 72 triangles a frame at twelve points, 48 at eight (`frames({detail})`).
   * On a 5000-triangle capital that is nothing. On a 500-triangle corvette it is
   * not, so ask for two.
   */
  frameStations({
    length = this.span, spacing = FRAME.spacingFrac, count = 4, from = null, to = null,
  } = {}) {
    const target = Math.max(1e-6, spacing * length);
    const lo = from ?? this.z0;
    const hi = to ?? this.z1;
    const usable = (hi - lo) * (from === null && to === null ? 0.88 : 1);
    let n = Math.max(0, Math.round(count));
    const total = (k) => {
      let s = 0;
      for (let i = 0; i < k - 1; i++) s += target * FRAME.gaps[i % FRAME.gaps.length];
      return s;
    };
    while (n >= 2 && total(n) > usable) n--;
    if (n < 2) return [];
    const run = total(n);
    let z = (lo + hi) * 0.5 - run * 0.5;
    const zs = [z];
    for (let i = 0; i < n - 1; i++) {
      const step = target * FRAME.gaps[i % FRAME.gaps.length];
      const frac = step / length;
      if (frac < FRAME.minSpacingFrac || frac > FRAME.maxSpacingFrac) {
        throw new Error(`[ships] ${this.label}: frame gap ${step.toFixed(1)} m is ${(frac * 100).toFixed(1)}% `
          + `of a ${length} m hull, outside the ${(FRAME.minSpacingFrac * 100).toFixed(1)}-`
          + `${(FRAME.maxSpacingFrac * 100).toFixed(1)}% the cruiser uses. Pass the right \`length\`, `
          + 'do not ship a rhythm that lies about the size of the ship.');
      }
      z += step;
      zs.push(z);
    }
    return zs;
  }

  /**
   * FRAMES: a step in the mass's OWN section at each z, built the way the cruiser
   * builds its eight - the section at that station, pushed out by `proud` metres and
   * held for `step` metres of z.
   *
   * This is the cheapest cue in the kit and it is the one that says "cut off a
   * capital ship" rather than "modelled at 60 m scale": 24 triangles a frame at
   * eight points, 48 at twelve. It survives to LOD1, which is where the benchmark
   * camera actually sits.
   *
   * Both defaults scale with the mass, so a frame is the same PROPORTION of every
   * hull rather than the same metre count on all of them.
   */
  frames(zs, { proud = null, step = null, detail = G.DETAIL.FULL } = {}) {
    if (!zs || !zs.length) return null;
    const pr = proud ?? Math.max(0.25, this.span * 0.004);
    const st = step ?? Math.max(0.35, this.span * 0.004);
    const keep = detail >= G.DETAIL.FULL ? SECTION_LOD.full : SECTION_LOD.far;
    const parts = [];
    for (const z of zs) {
      const s = this.at(Math.min(this.z1, Math.max(this.z0, z)));
      const ring = (o) => hullSection({
        half: s.half + o, top: s.top + o, bottom: s.bot - o,
        knuckle: s.knuckle, deckFlat: s.deckFlat, flare: s.flare, keep, label: `${this.label} frame`,
      });
      const lo = Math.max(this.z0, z - st), hi = Math.min(this.z1, z + st);
      if (hi - lo < 1e-3) continue;
      const mid = (hi - lo) * 0.3;
      parts.push({
        geo: G.loft([
          { z: lo, points: ring(0) },
          { z: lo + mid, points: ring(pr) },
          { z: hi - mid, points: ring(pr) },
          { z: hi, points: ring(0) },
        ], { capFront: false, capBack: false }),
      });
    }
    return G.mergeParts(parts, { uv: false });
  }

  /**
   * A RECESS cut into a facet: an aperture lying ON the surface and facing along
   * that facet's outward normal.
   *
   * DETAIL GOES INSIDE THE SILHOUETTE, NOT OUTSIDE IT. This is the rule the flagged
   * hulls break hardest - nine of them carry their detail as `panelledSlab` boxes
   * bolted to the outside, which is why they measure 47-82% axis-aligned. A recess
   * is the opposite move and it is cheaper: 24 triangles, its four walls face four
   * directions so at least two are always turned away from the key, and it reads as
   * a HOLE under a flat light where a proud box reads as noise.
   *
   * `greeble.js#recess` is deliberately bottomless - the hull's own skin is what you
   * see at the end of the tunnel, which is both cheaper than a back plate and
   * incapable of z-fighting with one.
   *
   * Cut the recess FIRST, then put the machinery in it. A dish, a bell or a
   * conduit standing in a recess is depth; the same part on a flat plate is a
   * sticker.
   */
  recess({
    z, side = 1, facet = FACET.upperFlank, t = 0.5,
    width = null, height = null, depth = null, wall = null, detail = G.DETAIL.FULL,
  }) {
    const P = this.section(z);
    const f = facetNormal(P, facet, `${this.label} recess z=${z}`);
    const d = this.depth;
    const w = width ?? d * 0.35;
    const h = height ?? d * 0.18;
    const dp = depth ?? d * 0.07;
    const wl = wall ?? Math.max(0.2, d * 0.02);
    const px = f.ax + f.dx * t, py = f.ay + f.dy * t;
    return aimAt(
      G.recess({ width: w, height: h, depth: dp, wall: wl, detail }),
      [side * f.nx, f.ny, 0],
      [side * px, py, z],
    );
  }

  /**
   * AN INTAKE: a longitudinal trench sunk into a facet and following the section
   * sweep as it runs.
   *
   * A `recess` is one aperture at one station. This is the other half of the
   * subtractive vocabulary and the fleet needs it more: a slot that runs 80 or 300 m
   * along a flank, tapering with the hull, reading as a cable run, a cooling duct,
   * a boat bay or a plating seam deep enough to self-shadow. There is no way to
   * build that additively that does not end up as a long box lying on a curved
   * surface with a gap at each end.
   *
   * HOW IT WORKS WITHOUT CSG. Four rails: the two mouth edges pushed `lip` metres
   * PROUD, and the same two pushed `depth` metres IN. Lofted as a four-point section
   * with `flip`, so the walls face into the trench and the floor faces the viewer,
   * exactly as `greeble.js#recess` builds its tunnel. The aperture quad between the
   * two proud lips faces inward and is back-face culled, so nothing is coplanar with
   * the skin and nothing can z-fight it. Ends are capped, so the trench is closed
   * and reads as a cut rather than as a hole through the ship.
   */
  intake({
    z0, z1, side = 1, facet = FACET.upperFlank, t0 = 0.35, t1 = 0.65,
    depth = null, lip = null, full = true,
  }) {
    const d = this.depth;
    const sink = depth ?? d * 0.06;
    const proud = lip ?? Math.max(0.1, d * 0.012);
    const zs = [z0];
    for (const r of this.rows) if (r[0] > z0 && r[0] < z1) zs.push(r[0]);
    zs.push(z1);
    const thin = full || zs.length <= 3
      ? zs : zs.filter((z, i) => i === 0 || i === zs.length - 1 || i % 2 === 0);
    return G.loft(thin.map((z) => {
      const P = this.section(z);
      const f = facetNormal(P, facet, `${this.label} intake z=${z}`);
      const ax = f.ax + f.dx * t0, ay = f.ay + f.dy * t0;
      const bx = f.ax + f.dx * t1, by = f.ay + f.dy * t1;
      const pts = [
        [ax + f.nx * proud, ay + f.ny * proud],
        [ax - f.nx * sink, ay - f.ny * sink],
        [bx - f.nx * sink, by - f.ny * sink],
        [bx + f.nx * proud, by + f.ny * proud],
      ].map(([x, y]) => [side * x, y]);
      return { z, points: windCCW(pts) };
    }), { flip: true });
  }

  /**
   * THE LINE AUDIT for this table, in the shape `Lines#audit` returns so a class
   * that swaps `Lines` for `Mass` stays in `audit.mjs#LINE_AUDIT` unchanged, plus
   * the four checks the cruiser's own rebuild is measured by.
   *
   * Findings, not throws: a 95 m corvette legitimately cannot afford every rule a
   * 1400 m cruiser can. But run it, print it, and put a REASON next to anything you
   * are choosing to fail.
   *
   *   flatRunFrac   longest contiguous +-4% half-beam run over length (R2.1, <=0.11)
   *   minima/maxima interior extrema in the plan curve (R2.2, one of each)
   *   waistRatio    smallest interior section over the largest (R2.3, <=0.70)
   *   tipBelowAxis  forwardmost section centre below y=0 (R2.5, >= 1% of L)
   *   worstBeamDepth / meanBeamDepth   the word "flat", checkable (S4)
   *   minParallel   the closest the deck slope and the keel slope come to equal
   *                 over any adjacent pair (L5, >= 0.04). Where they ARE equal the
   *                 section is merely being extruded, and an extrusion has no sheer.
   *   calmRuns      runs where the half-beam changes under 0.8% per 10 m (L2). At
   *                 most two, each at most 12% of length; no calm anywhere is a hull
   *                 with no rest in it, one long calm is the prismatic barge.
   *
   * ONE TRAP, INHERITED DELIBERATELY. `waistRatio` scans EVERY interior station, so
   * on a dense table it finds the prow taper rather than the waist and reads far
   * lower than the same hull described in seven stations: the cruiser's 30-station
   * table scores 0.02 where the fleet's coarse tables score 0.04-0.48. That is
   * exactly what `Lines#audit` does and the number is left bit-identical to it on
   * purpose, because `audit.mjs#LINE_AUDIT` compares hulls against a fixed bar. Read
   * it as a floor, compare like with like, and use `minima`/`maxima` for the
   * question "does this hull have a waist at all".
   */
  findings(length = this.span) {
    const rows = this.rows;
    const out = { flatRun: 0, minima: 0, maxima: 0, waistRatio: 1, tipBelowAxis: 0 };
    for (let i = 0; i < rows.length; i++) {
      const base = rows[i][1];
      let j = i;
      while (j + 1 < rows.length && Math.abs(rows[j + 1][1] - base) <= base * 0.04) j++;
      out.flatRun = Math.max(out.flatRun, rows[j][0] - rows[i][0]);
    }
    for (let i = 1; i < rows.length - 1; i++) {
      if (rows[i][1] < rows[i - 1][1] && rows[i][1] < rows[i + 1][1]) out.minima++;
      if (rows[i][1] > rows[i - 1][1] && rows[i][1] > rows[i + 1][1]) out.maxima++;
    }
    const area = (r) => r[1] * 2 * (r[2] - r[3]);
    const interior = rows.slice(1, -1);
    if (interior.length) {
      const lo = Math.min(...interior.map(area));
      const hi = Math.max(...rows.map(area));
      out.waistRatio = hi > 0 ? lo / hi : 1;
    }
    const tip = rows[rows.length - 1];
    out.tipBelowAxis = -((tip[2] + tip[3]) * 0.5);
    out.flatRunFrac = out.flatRun / Math.max(1, length);

    const bh = rows.map((r) => (2 * r[1]) / Math.max(1e-3, r[2] - r[3]));
    out.worstBeamDepth = Math.min(...bh);
    out.meanBeamDepth = bh.reduce((a, b) => a + b, 0) / bh.length;

    out.minParallel = Infinity;
    out.minParallelZ = rows[0][0];
    const calm = [];
    let run = null;
    for (let i = 0; i < rows.length - 1; i++) {
      const dz = rows[i + 1][0] - rows[i][0];
      const para = Math.abs((rows[i + 1][2] - rows[i][2]) / dz - (rows[i + 1][3] - rows[i][3]) / dz);
      if (para < out.minParallel) { out.minParallel = para; out.minParallelZ = rows[i][0]; }
      const rate = Math.abs((rows[i + 1][1] - rows[i][1]) / Math.max(1e-6, rows[i][1])) / (dz / 10);
      if (rate < 0.008) {
        if (run && run.z1 === rows[i][0]) run.z1 = rows[i + 1][0];
        else { run = { z0: rows[i][0], z1: rows[i + 1][0] }; calm.push(run); }
      } else run = null;
    }
    out.calmRuns = calm;
    out.longestCalm = calm.length ? Math.max(...calm.map((c) => c.z1 - c.z0)) : 0;
    out.stations = rows.length;
    return out;
  }

  /** `Lines#audit`-compatible alias, so `audit.mjs#LINE_AUDIT` takes a Mass as-is. */
  audit(length) { return this.findings(length); }
}

// ---------------------------------------------------------------------------
// Plates
// ---------------------------------------------------------------------------

/**
 * A thin plate lying in the XZ plane, authored as an outline of `[x, z]` pairs
 * (counter-clockwise) and extruded through `thickness` in Y.
 *
 * Wings, strakes, outrigger pylons and the derelict's radial vanes are all this
 * one primitive. It is separate from `radiatorFin` because a fin is authored in
 * the vertical plane and a wing is authored in the horizontal one, and doing both
 * with one function means every call site needs a comment explaining which.
 */
export function bladePlate(outline, thickness) {
  return G.place(G.prism(outline, -thickness * 0.5, thickness * 0.5), { rot: [Math.PI * 0.5, 0, 0] });
}

/** Mirror an `[x, z]` outline to port, preserving counter-clockwise winding. */
export const mirrorOutline = (o) => o.map(([x, z]) => [-x, z]).reverse();

// ---------------------------------------------------------------------------
// Emissive primitives
// ---------------------------------------------------------------------------

/**
 * THE SCALE CUE. A strip along the upper chine from z0 to z1 on one side, with U
 * authored in HULL METRES and scaled by `LIGHT_U_PER_M` so the registry's
 * running-light texture lays down exactly one lamp every
 * SCALE_CUE.runningLightSpacingM - see the file header. Two triangles.
 *
 * @param {Lines} lines
 * @param {number} side  -1 port, +1 starboard
 */
export function chineStrip(lines, z0, z1, side, { width = 1.6, offset = 0.35 } = {}) {
  const a = lines.chine(z0), b = lines.chine(z1);
  const half = width * 0.5;
  const across = (c) => [-c.ny * half, c.nx * half];  // across the facet, in XY
  const ca = across(a), cb = across(b);
  const p = [
    [side * (a.x + a.nx * offset + ca[0]), a.y + a.ny * offset + ca[1], z0],
    [side * (a.x + a.nx * offset - ca[0]), a.y + a.ny * offset - ca[1], z0],
    [side * (b.x + b.nx * offset - cb[0]), b.y + b.ny * offset - cb[1], z1],
    [side * (b.x + b.nx * offset + cb[0]), b.y + b.ny * offset + cb[1], z1],
  ];
  const u = Math.abs(z1 - z0) * LIGHT_U_PER_M;
  return quad(p, [[0, 0], [0, 1], [u, 1], [u, 0]], [side * a.nx, a.ny, 0]);
}

/**
 * A free-standing emissive strip between two points, facing `normal`. Used where a
 * hull has no chine to sit on - Concord's flush flanks, the derelict's vanes.
 * Same U contract as `chineStrip`.
 */
export function lightRun(from, to, normal, width = 1.6) {
  const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const lengthM = d.length() * LIGHT_U_PER_M;
  d.normalize();
  const n = new THREE.Vector3(...normal).normalize();
  const side = new THREE.Vector3().crossVectors(n, d).normalize().multiplyScalar(width * 0.5);
  const p = [
    [from[0] - side.x, from[1] - side.y, from[2] - side.z],
    [from[0] + side.x, from[1] + side.y, from[2] + side.z],
    [to[0] + side.x, to[1] + side.y, to[2] + side.z],
    [to[0] - side.x, to[1] - side.y, to[2] - side.z],
  ];
  return quad(p, [[0, 0], [0, 1], [lengthM, 1], [lengthM, 0]], normal);
}

/** Two triangles from four points, wound so the face looks along `outward`. */
function quad(p, uvs, outward) {
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const nrm = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  const dot = nrm[0] * outward[0] + nrm[1] * outward[1] + nrm[2] * outward[2];
  const idx = dot < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
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

/** A flat additive disc with 0..1 UVs for the engine-glow texture. */
export function glowDisc(radius, segments = 8) {
  return new THREE.CircleGeometry(radius, segments);
}

/**
 * A rectangular emissive face, +Z out. Concord's whole engine language: no bells,
 * no plume housing, just a slot in an otherwise continuous surface.
 */
export function glowSlot(width, height) {
  return new THREE.PlaneGeometry(width, height);
}

// ---------------------------------------------------------------------------
// Audit (headless)
// ---------------------------------------------------------------------------

/** Collapse every damage group into `core`, keeping surfaces separate. */
function mergeBuckets(buckets) {
  const map = new Map();
  for (const b of buckets) {
    const key = `core/${b.surface}`;
    let e = map.get(key);
    if (!e) { e = { key, group: 'core', surface: b.surface, uv: b.uv, parts: [] }; map.set(key, e); }
    for (const p of b.parts) e.parts.push(p);
  }
  return Array.from(map.values());
}

/**
 * Merge every bucket and report triangles and bounds without a GPU. This is the
 * only honest way to argue about a budget, and it runs in node.
 *
 * @param {(p:{rng:any, lod:number}) => {buckets:Array}} partsFor
 * @returns {{triangles:number, draws:number, bounds:THREE.Box3, bySurface:Object}}
 */
export function auditParts(partsFor, rng, lod = 0) {
  const { buckets } = partsFor({ rng, lod });
  const bounds = new THREE.Box3();
  const bySurface = Object.create(null);
  let triangles = 0;
  let draws = 0;
  for (const b of buckets) {
    const geo = G.mergeParts(b.parts, { uv: b.uv });
    if (!geo) continue;
    const t = G.triCount(geo);
    triangles += t;
    draws++;
    bySurface[b.surface] = (bySurface[b.surface] ?? 0) + t;
    geo.computeBoundingBox();
    bounds.union(geo.boundingBox);
    geo.dispose();
  }
  return { triangles, draws, bounds, bySurface };
}

/**
 * NORMALISED SILHOUETTE SIGNATURE — the measurement behind "every faction ship
 * class distinguishable from every other".
 *
 * That criterion has sat at PARTIAL through two passes on the strength of somebody
 * looking at the sheet and saying the pairs looked different, which is exactly the
 * kind of judgement that quietly rots as hulls get edited. This turns it into a
 * number, using the same method the loadout probe already uses for modules: bin the
 * hull along z and record the outline in each bin.
 *
 * Two differences from the loadout signature, both deliberate:
 *
 *   1. It is NORMALISED BY LENGTH. Two classes 95 m and 900 m long are trivially
 *      tellable apart by size, and a metric that scored them apart on size would
 *      pass a fleet of thirteen identical shapes at thirteen sizes. The question
 *      this metric asks is the one the silhouette sheet asks: with both hulls drawn
 *      at the same length, is the SHAPE different?
 *   2. Emissive surfaces are excluded, because the sheet hides them - a lamp is not
 *      outline.
 *
 * Returned figures are fractions of hull length. Multiply by a reference length to
 * read them as metres at that size.
 */
export function silhouetteSignature(partsFor, rng, { lod = 0, bins = 24 } = {}) {
  const { buckets } = partsFor({ rng, lod });
  const pts = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const b of buckets) {
    if (RAW_SURFACES.has(b.surface)) continue;   // lamps and plumes are not outline
    const geo = G.mergeParts(b.parts, { uv: false });
    if (!geo) continue;
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      pts.push(v.x, v.y, v.z);
      box.expandByPoint(v);
    }
    geo.dispose();
  }
  const L = Math.max(1e-6, box.max.z - box.min.z);
  const out = [];
  for (let i = 0; i < bins; i++) out.push({ halfWidth: 0, top: -Infinity, bottom: Infinity, count: 0 });
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    let k = Math.floor(((z - box.min.z) / L) * bins);
    if (k < 0) k = 0; else if (k >= bins) k = bins - 1;
    const bin = out[k];
    const ax = Math.abs(x) / L;
    if (ax > bin.halfWidth) bin.halfWidth = ax;
    const ty = y / L;
    if (ty > bin.top) bin.top = ty;
    if (ty < bin.bottom) bin.bottom = ty;
    bin.count++;
  }
  // A hull with a genuine through-void has bins with no geometry at all. Those are
  // scored as zero extent, which is the honest answer: at that station the
  // silhouette is background, and a class that is empty where another is solid is
  // exactly the difference this metric should reward.
  for (const bin of out) if (!bin.count) { bin.top = 0; bin.bottom = 0; }
  return { bins: out, length: L, beam: box.max.x - box.min.x, height: box.max.y - box.min.y };
}

/**
 * Mean and max outline divergence between two normalised signatures, expressed at
 * a reference length so the number is readable in metres.
 *
 * THE THRESHOLD, and where it comes from. ship-language.md §0/§8 fix the hardest
 * read in the game at "30 px": at maximum tactical zoom a capital hull is about
 * thirty pixels long, and silhouette is the only information the player has. One
 * pixel is therefore L/30 = 3.3% of the hull's length. Two classes whose outlines
 * differ by less than one pixel at that read are, literally, the same shape on
 * screen. So: mean divergence >= 3.3% of L, peak divergence >= 10% of L (three
 * pixels somewhere along the hull, which is what makes the difference findable
 * rather than merely present).
 */
export const CLASS_DIVERGENCE = { mean: 0.0333, max: 0.10 };

export function silhouetteDivergence(a, b, refLength = 1) {
  let s = 0, n = 0, mx = 0;
  for (let i = 0; i < a.bins.length; i++) {
    const d = [
      Math.abs(a.bins[i].halfWidth - b.bins[i].halfWidth),
      Math.abs(a.bins[i].top - b.bins[i].top),
      Math.abs(a.bins[i].bottom - b.bins[i].bottom),
    ];
    for (const t of d) { s += t; if (t > mx) mx = t; }
    n += 3;
  }
  return { mean: (s / n) * refLength, max: mx * refLength };
}

// ---------------------------------------------------------------------------
// Assembly - the only part that touches the material registry
// ---------------------------------------------------------------------------

/**
 * Build a ship as a `THREE.LOD` of merged meshes.
 *
 * @param {import('../../../core/contracts.js').BuildContext} ctx
 * @param {Object} spec
 * @param {string} spec.id
 * @param {string} spec.faction
 * @param {(p:{rng:any, lod:number}) => {buckets:Array}} spec.partsFor
 * @param {number} spec.length          metres, drives the LOD switch distances
 * @param {number} [spec.levels=3]      how many LODs this class ships
 * @returns {THREE.Group}
 */
export function buildShip(ctx, { id, faction, partsFor, length, levels = 3 }) {
  const registry = ctx?.materials;
  const table = SURFACES[faction] ?? SURFACES.coalition;
  const root = new THREE.Group();
  root.name = id;

  // Headless (the sim boots before the renderer in some tools): return an empty
  // root rather than throwing, exactly like the fallback roster does.
  if (!registry?.get) return root;

  const lodNode = new THREE.LOD();
  lodNode.name = `${id}:lod`;
  root.add(lodNode);

  /**
   * Switch distances as multiples of hull length, not absolute metres. A 95 m
   * corvette and a 480 m destroyer subtend the same angle at the same multiple of
   * their own length, so one rule keeps every class swapping at the same apparent
   * size instead of the corvette popping while the destroyer is still full detail.
   */
  const LEVELS = [0, length * 11, length * 42];

  const triangles = [];
  const drawCalls = [];

  for (let lod = 0; lod < levels; lod++) {
    const level = new THREE.Group();
    level.name = `${id}:lod${lod}`;
    const { buckets: raw } = partsFor({ rng: ctx.rng, lod });

    // PAST LOD0 EVERYTHING COLLAPSES INTO ONE DAMAGE GROUP.
    //
    // Damage groups exist so a system can hide or swap one mass; past the first LOD
    // switch nothing is destroyed independently, because at that range you cannot
    // see which part came off. Keeping them costs one draw call per (group x
    // surface) pair for no visible return, and the benchmark's camera sits at
    // 7.2 km, i.e. LOD1 for every hull in the frame - so the LOD1 number is the one
    // that pays. This is the same change that took the cruiser from 12 draws to 5.
    const buckets = lod === 0 ? raw : mergeBuckets(raw);

    const groups = Object.create(null);
    let tris = 0;
    let calls = 0;

    for (const b of buckets) {
      const geo = G.mergeParts(b.parts, { uv: b.uv });
      if (!geo) continue;
      geo.name = `${id}:${b.key}`;

      let mat;
      if (b.surface === 'runningLights') {
        mat = registry.get('runningLights', { faction, intensity: 2.1 });
      } else if (b.surface === 'engineGlow') {
        mat = registry.get('engineGlow', { faction, intensity: 2.6 });
      } else if (b.surface === 'emissive') {
        mat = registry.get('emissive', { faction, intensity: 1.9 });
      } else {
        const entry = table[b.surface];
        if (!entry) throw new Error(`[ships] ${id}: unknown surface "${b.surface}"`);
        mat = registry.get(entry[0], entry[1]);
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = b.key;
      const additive = b.surface === 'runningLights' || b.surface === 'engineGlow';
      mesh.castShadow = !additive;
      mesh.receiveShadow = !additive;
      if (additive) mesh.renderOrder = 3;

      let g = groups[b.group];
      if (!g) {
        g = new THREE.Group();
        g.name = `${id}:${b.group}`;
        level.add(g);
        groups[b.group] = g;
      }
      g.add(mesh);
      tris += G.triCount(geo);
      calls++;
    }

    triangles.push(tris);
    drawCalls.push(calls);
    lodNode.addLevel(level, LEVELS[lod] ?? LEVELS[LEVELS.length - 1]);
  }

  root.userData.stats = { triangles, drawCalls };
  root.userData.lod = lodNode;
  return root;
}

/**
 * A weapon mount definition. `mount`, `yawCentre` and `yawWidth` are read by
 * sim/ship.js#WeaponMount and are the spatial half of combat: a broadside battery
 * covers port and nothing else, so bringing it to bear means turning the ship.
 *
 * Every `mount` here must sit on a barrel the player can actually see. A firing
 * arc whose origin floats off the hull is the same defect as a reactor hitbox in
 * empty space.
 */
export function weapon(id, name, type, over = {}) {
  return {
    id, name, type,
    range: 5200,
    damage: 42,
    shotsPerBurst: 3,
    burstInterval: 0.16,
    cooldown: 3.4,
    projectileSpeed: 1400,
    tracking: 0.55,
    powerDraw: 8,
    subsystemAccuracy: 0.55,
    mount: [0, 0, 0],
    yawCentre: 0,
    yawWidth: Math.PI * 0.45,
    ...over,
  };
}

/**
 * Boilerplate every faction ship shares. Keeps the class definitions in the
 * faction files down to numbers and geometry, which is the only way twelve hulls
 * stay comparable.
 */
export function shipClass(spec) {
  const { partsFor, levels = 3, ...rest } = spec;
  return {
    ...rest,
    planeLocked: rest.planeLocked ?? rest.role !== 'fighter',
    build(ctx) {
      return buildShip(ctx, {
        id: rest.id, faction: rest.faction, partsFor, length: rest.length, levels,
      });
    },
    /** Exposed so tools/ and probes can count without building a scene. */
    partsFor,
    lodLevels: levels,
  };
}
