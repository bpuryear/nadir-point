/**
 * THE ANCIENT HULK — 3400 metres of something that lost a war nobody now remembers.
 *
 * This object exists to be found, and finding it has to feel like an event. That is
 * a shape problem before it is a lighting problem, so the whole design is built
 * around one idea: NOTHING ABOUT IT WAS DECIDED BY A PERSON.
 *
 * HOW IT REFUSES TO BE A HUMAN SHIP
 *
 *   FIVE-FOLD RADIAL SYMMETRY, NOT BILATERAL. Coalition and Concord hulls are
 *   mirror-symmetric about one plane, have a top and a bottom, and put the crew at
 *   the front. This has a pentagonal core and five identical radial vanes, so there
 *   is no up, no deck, no port and no starboard. A player who tries to read it the
 *   way they read a warship gets nothing back, and that failure is the point.
 *
 *   NO BRIDGE. No window, no tower, no armoured box that could hold a person. The
 *   only openings are the ones the war made.
 *
 *   NO ENGINES. There is no thruster, no bell, no slot, no plume, nothing at either
 *   end that could have pushed it. It has an axis and no direction.
 *
 *   THE SPINE TWISTS. Every station is rotated a little further round than the last,
 *   forty degrees over 3.4 kilometres. It is far too slow to notice as motion and
 *   far too consistent to read as damage, which is exactly the effect wanted: the
 *   surface never lines up with itself and the eye cannot find a straight edge.
 *
 *   THE SYMMETRIES DISAGREE. Five vanes. Three spokes. One ring, tilted seventeen
 *   degrees out of the plane those spokes sit in. Nothing here shares a period with
 *   anything else, and no shipwright who had to build it would have allowed that.
 *
 * ===========================================================================
 * WHAT THIS FILE TAKES FROM THE FLEET VOCABULARY, AND WHAT IT REFUSES
 * ===========================================================================
 *
 * `ships/common.js` "THE SECTION FAMILY" is the language the player cruiser was
 * rebuilt in and the language the two navies are being rebuilt in: a twelve-point
 * BILATERAL section with a knuckle, `Mass#loft`, `Mass#plate`, `Mass#belt`,
 * `Mass#frames`, `Mass#recess`, `Mass#intake`. This file takes the METHOD and
 * refuses the SECTION, and both halves of that are deliberate.
 *
 * TAKEN — because it is what makes a surface stop being a box:
 *
 *   ONE CONTINUOUS LOFTED BODY, not a stack of prisms. `Spindle#loft` below.
 *   PLATES CUT FROM THE BODY'S OWN SECTION, lying on the skin by construction and
 *     therefore parallel to it at every station, exactly as `cruiser.js#skinPlate`
 *     and `Mass#plate` do it (`Spindle#plate`).
 *   THE OUTWARD NORMAL IS MEASURED, NEVER INFERRED FROM INDEX ORDER. `facetNormal`
 *     below is `common.js:609` ported to a radial section, and it exists because
 *     `cruiser.js#flankStrake` put three plates a side THIRTEEN METRES INSIDE the
 *     hull by taking the sign from the way the facet pair was written.
 *   DETAIL IS CUT INTO THE SILHOUETTE, NOT BOLTED TO THE OUTSIDE OF IT
 *     (`Spindle#cut`, `Spindle#scar`), which is the single rule the flagged hulls
 *     break hardest.
 *   STRUCTURE IS NEVER EVENLY SPACED. `FRAME.gaps` is imported and used verbatim.
 *
 * REFUSED — because this thing has to predate everyone in the frame:
 *
 *   `hullSection` IS BILATERAL. It has a deck, a keel, a beltline and a knuckle,
 *   and every one of those words is a claim about which way is up. Building the
 *   hulk out of it would hand it a top and a front, put it in the same family as
 *   the two navies, and throw away the one property that makes it alien — for a
 *   metric that is already the best in the game (7.2% axis-aligned against a 45%
 *   bar, the lowest of fourteen classes). So the hulk gets its OWN section family,
 *   `hulkSection`, built to the same three RULES the fleet's section is built to
 *   and to none of its geometry:
 *
 *     no facet is a large fraction of the perimeter    7.3-10.7% over 19 stations
 *     no dihedral lands in the 12-28 degree band       0 of 285, measured
 *     the section is convex, so a loft cap is sound    0 concave points, measured
 *
 *   FIFTEEN POINTS, five-fold: each lobe is a CHAMFERED CORNER, then two flats
 *   meeting at a RIDGE. The corner breaks are 5.7-9.8 degrees — a fair panel seam —
 *   and the ridge is a 52-61 degree chine that runs the whole 3.4 km and catches a
 *   rim light from any direction, which is the radial answer to the cruiser's
 *   knuckle. The ridges are also where the vanes come out, so the chine is the
 *   vane's spar continuing into the body rather than a decoration on top of one.
 *
 *   THE ROW IS FOUR COLUMNS, `[z, r, chamfer, ridge]`, and the fact that it is not
 *   the fleet's seven is the statement. There is no `top`, no `bottom`, no
 *   `knuckle` and no `deckFlat` because there is no deck. A reader who diffs this
 *   table against `cruiser.js#HULL_STATIONS` should come away certain these two
 *   objects were not designed by the same civilisation.
 *
 * HOW IT READS AS BROKEN OPEN, AND AS PICKED OVER
 *
 *   The spine is in TWO PIECES with a 300 m gap. Inside the gap is a smaller inner
 *   spindle, six longerons and four frame rings — the thing's actual structure,
 *   which you can only see because something tore the outside off. Both rims are
 *   FUNNELS, not flat discs: the skin turns inward and recedes, so the breach has a
 *   plating thickness and a dark throat instead of the sliced-cheese cap the first
 *   pass shipped (docs/probes/derelict-breach.png, the flat pentagon).
 *
 *   THE SKIN IS ARMOUR AND A THIRD OF IT IS GONE. Every lobe carries a belt of skin
 *   plates cut from the body's own section, and 21 of the 72 footprints are empty —
 *   16 of 52 on the aft flanks, 3 of 4 on the tail, 2 of 16 on the forward corners.
 *   The five lobes are NOT equally plated: one is nearly intact, one has been
 *   stripped to the frames front to back, one has a 420 m salvage cut down it, three
 *   have plates hanging off by one edge. Where a plate is missing there is a SCAR
 *   the exact shape of the plate it used to be, with the ribs it was bolted to
 *   standing in the bottom of it. That asymmetry is the whole "picked over" read and
 *   it costs nothing in the silhouette: the form stays rigorously five-fold, only
 *   the DAMAGE is asymmetric, which is what damage is.
 *
 *   One vane is a stump with shards still attached. The debris that came out is
 *   still nearby, turning slowly, because there has been nothing to disturb it.
 *
 * SCALE CUE. Emissive nodes at a constant 200 m along three lines of the spine, and
 * a running-light seam — the game-wide strip, laid at `LIGHT_U_PER_M` so it is the
 * same 40 m lamp spacing as every other hull — down the outer edge of each surviving
 * vane, plus ONE seam on ONE spine ridge, the last circuit still lit. Both spacings
 * are constant, which is the only property that matters.
 *
 * BUDGET. `BUDGET.capitalTris` (5000), the committed capital ceiling. LOD0 measured
 * at the bottom of this file's own audit run; drifting debris is excluded and counted
 * separately (it is one InstancedMesh and does not belong to the hull).
 */

import * as THREE from 'three';
import * as G from '../greeble.js';
import { HULL_LENGTH, BUDGET } from '../../../core/units.js';
import { Buckets, lightRun, glowDisc, buildShip, weapon, FRAME } from './common.js';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const TAU = PI * 2;

/**
 * A glow disc pre-rotated to face +X, so that a single Z-rotation then points it
 * radially outward.
 *
 * `place()` builds its matrix with Euler order XYZ, i.e. Rx·Ry·Rz, which applies
 * the Z term FIRST. A radial orientation needs Y-then-Z and cannot be expressed
 * in one XYZ Euler, so the Y half is baked into the geometry here. Getting this
 * wrong is what turned the first pass of spine nodes into flat squares lying at
 * the wrong angle.
 *
 * SIX segments, not eight. Forty-five of these is 270 triangles of the hull budget
 * against 360, and the disc is at most 34 m across on a 3400 m object carrying a
 * radial glow texture — the two extra facets buy nothing and the ninety triangles
 * buy four more skin plates.
 */
const radialGlow = (r) => G.place(glowDisc(r, 6), { rot: [0, HALF_PI, 0] });

export const HULK_LENGTH = HULL_LENGTH.ancientHulk;   // 3400

/** Spine node spacing. Constant, known, and nothing like the 40 m lamp spacing. */
export const HULK_NODE_SPACING_M = 200;

// ===========================================================================
// THE HULK SECTION — five-fold, fifteen points, and nothing in it says "up"
// ===========================================================================

/**
 * The three facets of one lobe, by NAME.
 *
 * `common.js#FACET` exists because a caller holding a pair of raw indices is how
 * three plates a side ended up thirteen metres inside the player cruiser. Same
 * lesson, same fix, different section: every plate, belt, cut and scar below takes
 * a LOBE INDEX and one of these names, never a pair of integers.
 *
 * There is no `deck`, no `keel` and no `lowerFlank` here, and the absence is the
 * point — a body with five-fold symmetry has no up to name a facet against. The
 * names are relative to the RIDGE, which is the only landmark the section has.
 *
 *   rise    the flat running up to the ridge  (widening in the direction of winding)
 *   fall    the flat running down off it
 *   corner  the chamfer across the pentagon vertex, shared with the next lobe
 */
export const LOBE_FACET = ['rise', 'fall', 'corner'];

/**
 * Section cardinality per LOD, by NAME — the radial twin of `SECTION_LOD`.
 *
 * 15 / 15 / 10. LOD1 keeps all fifteen for the same measured reason the fleet's
 * section keeps all twelve: the saving belongs on the STATION axis, where a station
 * is fifteen points and a facet is two. LOD2 drops the RIDGE points, which is the
 * cheapest cardinality cut available here — with the ridge gone the outline at that
 * angle falls back to the pentagon edge line, worst case 46.6 m at the widest
 * station (z 1000). That is 1.37% of a 3402 m hull, against 113 m to the pixel at
 * the 30 px tactical read this level exists for: four tenths of a pixel.
 */
export const HULK_SECTION_LOD = {
  full: null,                                    // 15
  mid: null,                                     // 15 — see above
  far: [0, 2, 3, 5, 6, 8, 9, 11, 12, 14],        // 10: the five ridges collapsed
};

/**
 * THE SECTION. Fifteen points, five lobes, counter-clockwise, ridge `k` pointing at
 * world angle `twist + k * 72°` exactly — so a vane placed at that angle grows out
 * of its own chine and not out of the middle of a flat.
 *
 * Point layout, and it is the only index arithmetic in this file:
 *
 *     lobe k -> 3k   cut A   3k+1  RIDGE   3k+2  cut B
 *     facet  rise = [3k, 3k+1]   fall = [3k+1, 3k+2]   corner = [3k+2, 3k+3]
 *
 * @param {Object} p
 * @param {number} p.r        pentagon CIRCUMRADIUS. The section's own widest point
 *                            is the ridge at ~0.94-0.97 r; see `sectionFindings`.
 * @param {number} p.twist    radians. Ridge 0 points here.
 * @param {number} [p.chamfer] corner cut as a fraction of the pentagon edge, per end
 * @param {number} [p.ridge]  ridge push, as a fraction of the flat's own radius
 * @param {number[]} [p.keep] `HULK_SECTION_LOD` index map
 */
export function hulkSection({ r, twist, chamfer = 0.26, ridge = 0.18, keep = null, label = 'section' }) {
  if (!(r > 0)) throw new Error(`[hulk] ${label}: radius must be > 0, got ${r}`);
  if (chamfer < 0.14 || chamfer > 0.40) {
    throw new Error(`[hulk] ${label}: chamfer ${chamfer} is outside 0.14..0.40. Below 0.14 the corner `
      + 'stops being a facet and starts being a vertex; above 0.40 the two cuts meet and the '
      + 'pentagon becomes a decagon with no flats left to plate.');
  }
  if (ridge < 0.06 || ridge > 0.30) {
    throw new Error(`[hulk] ${label}: ridge ${ridge} is outside 0.06..0.30. The ridge is what makes `
      + 'the chine a chine: under 0.06 with any usable chamfer the dihedrals land in the 12-28 '
      + 'degree band that reads as a modelling accident. Run sectionFindings().');
  }
  const V = new Array(5);
  for (let j = 0; j < 5; j++) {
    const a = twist + PI / 5 + (j / 5) * TAU;
    V[j] = [Math.cos(a) * r, Math.sin(a) * r];
  }
  const P = new Array(15);
  for (let k = 0; k < 5; k++) {
    const A = V[(k + 4) % 5], B = V[k];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const mx = (A[0] + B[0]) * 0.5, my = (A[1] + B[1]) * 0.5;
    P[3 * k] = [A[0] + dx * chamfer, A[1] + dy * chamfer];
    P[3 * k + 1] = [mx * (1 + ridge), my * (1 + ridge)];
    P[3 * k + 2] = [A[0] + dx * (1 - chamfer), A[1] + dy * (1 - chamfer)];
  }
  if (!keep) return P;
  return keep.map((i) => P[i]);
}

/** `[i, j]` into a 15-point section, by lobe and facet name. Never write the pair. */
export function facetOf(lobe, kind) {
  const k = ((lobe % 5) + 5) % 5;
  if (kind === 'rise') return [3 * k, 3 * k + 1];
  if (kind === 'fall') return [3 * k + 1, 3 * k + 2];
  if (kind === 'corner') return [3 * k + 2, (3 * k + 3) % 15];
  throw new Error(`[hulk] facetOf: "${kind}" is not one of ${LOBE_FACET.join(' / ')}`);
}

/**
 * THE THREE RULES THE SECTION IS HELD TO, as numbers rather than as a preference.
 *
 * `common.js` states them for the fleet's twelve-point section: largest facet 11% of
 * perimeter, every dihedral either under 12 degrees (a fair panel break) or over 28
 * (a chine that catches a rim light), never in between. This measures the same three
 * things on the radial section, plus convexity — which matters here and not there
 * because `greeble.js#loft` caps with a triangle fan from point 0, and a fan over a
 * star-shaped polygon self-overlaps.
 *
 * Findings, not throws, EXCEPT for the two bounds `hulkSection` enforces: the safe
 * (chamfer, ridge) region is a diagonal band, not a rectangle, so no pair of scalar
 * bounds can express it and only the measurement can.
 */
export function sectionFindings(P) {
  const n = P.length;
  let perim = 0, maxFacet = 0, minTurn = 180, maxTurn = 0, concave = 0, band = 0, rMax = 0;
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1];
    const vx = c[0] - b[0], vy = c[1] - b[1];
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180 / PI;
    if (turn <= 0) concave++;
    const t = Math.abs(turn);
    if (t >= 12 && t <= 28) band++;
    if (t < minTurn) minTurn = t;
    if (t > maxTurn) maxTurn = t;
    const l = Math.hypot(vx, vy);
    perim += l;
    if (l > maxFacet) maxFacet = l;
    const rr = Math.hypot(b[0], b[1]);
    if (rr > rMax) rMax = rr;
  }
  return {
    points: n,
    maxFacetFrac: maxFacet / perim,
    minTurnDeg: minTurn,
    maxTurnDeg: maxTurn,
    inAccidentBand: band,
    concave,
    rMax,
  };
}

// ---------------------------------------------------------------------------
// Section maths. Module-level scratch: this runs at build time, but the house rule
// is no allocation in a loop and there is no reason for this file to be the
// exception.
// ---------------------------------------------------------------------------

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
 * The outward normal of a facet, MEASURED rather than inferred — `common.js:609`
 * ported to the radial section, and it is worth having twice.
 *
 * The bug it prevents has already shipped once in this repository:
 * `cruiser.js#flankStrake` took the sign of the normal from whether the facet pair
 * was written ascending, was called `[2, 1]`, and put three plates a side thirteen
 * metres INSIDE the hull with their outer faces coplanar with the skin — carrying
 * the ship's entire second value, rendered by whichever of two coplanar faces won
 * the depth test.
 *
 * A radial section makes that failure mode WORSE, not better, because there is no
 * "outboard is +x" intuition to catch it by eye: five lobes point five different
 * ways and one of them is at 216 degrees. So the normal is never reasoned about.
 * It is stepped off the facet midpoint and the section polygon is asked whether the
 * point left it. There is no argument order, winding convention or index wrap
 * (`corner` on lobe 4 is `[14, 0]`) that can defeat that.
 */
function facetNormal(P, facet, label) {
  const [i, j] = facet;
  if (!(i >= 0 && i < P.length && j >= 0 && j < P.length)) {
    throw new Error(`[hulk] ${label}: facet [${i},${j}] is not a pair of indices into a `
      + `${P.length}-point section. Use facetOf(lobe, kind).`);
  }
  const step = ((j - i) % P.length + P.length) % P.length;
  if (step !== 1 && step !== P.length - 1) {
    throw new Error(`[hulk] ${label}: facet [${i},${j}] is a chord across the section, not a facet. `
      + 'A plate laid on a chord cuts through the body. Use facetOf(lobe, kind).');
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

// ===========================================================================
// THE SPINDLE — one continuous twisted body, and everything that lies on it
// ===========================================================================

/**
 * A SPINDLE is to this file what `Mass` is to the fleet files: ONE CONTINUOUS
 * SWEPT BODY, in its own frame, with the plate / belt / rib / cut vocabulary hung
 * off it so that nothing on the surface can disagree with the surface.
 *
 * The method names are deliberately the fleet's — `loft`, `plate`, `belt`, `cut`,
 * `rib`, `findings` — because an agent who has read `common.js` should be able to
 * read this class without reading it. The ROWS are deliberately not the fleet's.
 *
 * @param {number[][]} rows  `[z, r, chamfer?, ridge?]`, ascending in z
 * @param {Object} [opts]
 * @param {string} [opts.label]
 * @param {(z:number)=>number} [opts.twist]  radians at z. Constant twist is legal
 *                                           and is what makes a body a cylinder.
 */
class Spindle {
  constructor(rows, { label = 'spindle', twist = () => 0 } = {}) {
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new Error(`[hulk] ${label}: a spindle needs at least two stations, got ${rows?.length ?? 0}`);
    }
    this.rows = rows;
    this.label = label;
    this.twistAt = twist;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (i && r[0] <= rows[i - 1][0]) {
        throw new Error(`[hulk] ${label}: station table is not ascending in z at index ${i} (z ${r[0]})`);
      }
      // Parse every station now, so a bad number names its own row rather than
      // surfacing two hundred lines later as a hollow loft.
      const P = hulkSection({
        r: r[1], twist: 0, chamfer: r[2] ?? 0.26, ridge: r[3] ?? 0.18, label: `${label} z=${r[0]}`,
      });
      const f = sectionFindings(P);
      if (f.concave) {
        throw new Error(`[hulk] ${label} z=${r[0]}: section is concave at ${f.concave} of 15 points. `
          + 'greeble.js#loft caps with a triangle fan from point 0 and a fan over a star self-overlaps. '
          + 'The safe (chamfer, ridge) region is a diagonal band: raise ridge or lower chamfer.');
      }
    }
  }

  get z0() { return this.rows[0][0]; }

  get z1() { return this.rows[this.rows.length - 1][0]; }

  get span() { return this.z1 - this.z0; }

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
    return { z, r: L(1, 1), chamfer: L(2, 0.26), ridge: L(3, 0.18), twist: this.twistAt(z) };
  }

  /** The section at an arbitrary z, at full or reduced cardinality. */
  section(z, keep = null) {
    const s = this.at(z);
    return hulkSection({
      r: s.r, twist: s.twist, chamfer: s.chamfer, ridge: s.ridge, keep, label: `${this.label} z=${z}`,
    });
  }

  /** The body's own widest radius at z — the ridge, not the pentagon circumradius. */
  outerRadius(z) {
    const s = this.at(z);
    return s.r * Math.cos(PI / 5) * (1 + s.ridge);
  }

  /**
   * THE LOFT: the section run along the axis with taper and twist, as ONE body.
   *
   * LOD IS TAKEN ON THE STATION AXIS, BY NAME — `at` is a list of z values that ARE
   * the silhouette (the tail point, the collar, the waist, both breach rims, the
   * shoulder), never `rows.filter((_, i) => i % 2)`.
   */
  loft({ at = null, keep = undefined, lod = 0, capFront = true, capBack = true, flip = false } = {}) {
    const card = keep !== undefined ? keep : (lod >= 2 ? HULK_SECTION_LOD.far : HULK_SECTION_LOD.full);
    const last = this.rows.length - 1;
    const rows = at
      ? this.rows.filter((r, i) => i === 0 || i === last || at.includes(r[0]))
      : this.rows;
    if (rows.length < 2) throw new Error(`[hulk] ${this.label}: loft picked fewer than two stations`);
    return G.loft(rows.map((r) => ({
      z: r[0],
      points: hulkSection({
        r: r[1], twist: this.twistAt(r[0]), chamfer: r[2] ?? 0.26, ridge: r[3] ?? 0.18,
        keep: card, label: `${this.label} z=${r[0]}`,
      }),
    })), { capFront, capBack, flip });
  }

  /** The z values a run from z0 to z1 is sampled at: every station, plus both ends. */
  samples(z0, z1, maxStep) {
    const zs = [z0];
    for (const r of this.rows) if (r[0] > z0 && r[0] < z1) zs.push(r[0]);
    zs.push(z1);
    if (!(maxStep > 0)) return zs;
    const out = [zs[0]];
    for (let i = 1; i < zs.length; i++) {
      const n = Math.ceil((zs[i] - zs[i - 1]) / maxStep);
      for (let k = 1; k <= n; k++) out.push(zs[i - 1] + ((zs[i] - zs[i - 1]) * k) / n);
    }
    return out;
  }

  /**
   * A SKIN PLATE: a plate lying ON this body by construction, spanning a named facet
   * of a named lobe from `inner` to `out` metres off the skin.
   *
   * At every sample it takes the two points bounding the facet, insets along the
   * facet, offsets along the facet's VERIFIED outward normal, and lofts the
   * four-point result — so the plate is exactly parallel to the surface underneath
   * it at every station, which a prismatic bar at a fixed radius cannot be on a body
   * that tapers 274 m and turns 40 degrees over its length.
   *
   * FOUR THINGS THIS DOES THAT `Mass#plate` DOES NOT, all of them because this ship
   * is broken and that one is not:
   *
   *   `t0End`/`t1End`   the plate narrows or wanders as it runs: a torn plate comes
   *                     to a ragged point instead of ending square.
   *   `outEnd`          the plate LIFTS off the skin. `out` 0.6 at one end and 34 at
   *                     the other is a plate still bolted down at one edge and
   *                     standing off at the other, which is what a plate does when
   *                     something has been under it with a bar.
   *   `inner`           the plate's under-face is offset too, so a NEGATIVE pair is
   *                     a rib standing in the bottom of a scar rather than a plate
   *                     standing on the skin. One primitive, both jobs.
   *   `curl`            the lift eases in quadratically instead of linearly, so a
   *                     peeled plate curls away from the hull instead of shearing
   *                     off it in a straight line.
   */
  plate({
    z0, z1, lobe = 0, kind = 'rise', t0 = 0.08, t1 = 0.92, t0End = null, t1End = null,
    inner = 0, out = 3, outEnd = null, curl = true, maxStep = 240,
  }) {
    const facet = facetOf(lobe, kind);
    const zs = this.samples(z0, z1, outEnd === null ? 0 : maxStep);
    const span = (z1 - z0) || 1;
    const ta1 = t0End ?? t0;
    const tb1 = t1End ?? t1;
    const o1 = outEnd ?? out;
    return G.loft(zs.map((z) => {
      const P = this.section(z);
      const f = facetNormal(P, facet, `${this.label} plate z=${z}`);
      const u = (z - z0) / span;
      const e = curl ? u * u : u;
      const ta = Math.min(0.98, Math.max(0.02, t0 + (ta1 - t0) * u));
      const tb = Math.min(0.98, Math.max(0.02, t1 + (tb1 - t1) * u));
      const lo = inner;
      const hi = out + (o1 - out) * e;
      const ax = f.ax + f.dx * ta, ay = f.ay + f.dy * ta;
      const bx = f.ax + f.dx * tb, by = f.ay + f.dy * tb;
      return {
        z,
        points: windCCW([
          [ax + f.nx * lo, ay + f.ny * lo],
          [bx + f.nx * lo, by + f.ny * lo],
          [bx + f.nx * hi, by + f.ny * hi],
          [ax + f.nx * hi, ay + f.ny * hi],
        ]),
      };
    }));
  }

  /**
   * A CUT: a trench sunk into a facet, following the section sweep as it runs.
   *
   * `Mass#intake` built for a hull that is intact, and it is the same construction:
   * four rails — the two mouth edges pushed `lip` metres proud and the same two
   * pushed `depth` metres in — lofted with `flip` so the walls face into the trench.
   * Nothing is coplanar with the skin, so nothing can z-fight it, and the ends are
   * capped so the trench reads as a cut rather than as a hole through the ship.
   *
   * On this hull it does two jobs that are the same geometry and different fiction:
   * a long shallow one is a SALVAGE CUT somebody made getting at what was inside,
   * and a short one the exact footprint of a plate is the SCAR where that plate used
   * to be. `scar` below is the second call with the plate's own arguments, so a scar
   * can never be the wrong size for the plate it replaces.
   */
  cut({
    z0, z1, lobe = 0, kind = 'rise', t0 = 0.24, t1 = 0.76, depth = 14, lip = 1.2, maxStep = 0,
  }) {
    const facet = facetOf(lobe, kind);
    const zs = this.samples(z0, z1, maxStep);
    return G.loft(zs.map((z) => {
      const P = this.section(z);
      const f = facetNormal(P, facet, `${this.label} cut z=${z}`);
      const ax = f.ax + f.dx * t0, ay = f.ay + f.dy * t0;
      const bx = f.ax + f.dx * t1, by = f.ay + f.dy * t1;
      return {
        z,
        points: windCCW([
          [ax + f.nx * lip, ay + f.ny * lip],
          [ax - f.nx * depth, ay - f.ny * depth],
          [bx - f.nx * depth, by - f.ny * depth],
          [bx + f.nx * lip, by + f.ny * lip],
        ]),
      };
    }), { flip: true });
  }

  /**
   * AN ARMOUR BELT: a run of skin plates with gaps between them, merged into one
   * geometry and therefore one bucket and one draw call.
   *
   * `missing` is the whole reason this exists rather than `Mass#belt`. A modern navy
   * bolts a belt on expecting to replace one plate of it; this thing has had four of
   * them taken off by somebody who was not the owner. Every index in `missing` is
   * emitted as a SCAR instead — the same footprint, sunk instead of proud, with the
   * ribs it was bolted to standing in the bottom of it.
   *
   * @returns {{plates: THREE.BufferGeometry|null, scars: THREE.BufferGeometry|null}}
   *          two geometries because they belong on two different surfaces: plating
   *          for what is still there, dark for the hole where it is not.
   */
  belt({
    z0, z1, lobe = 0, kind = 'rise', plates = 5, gap = null, missing = [], taper = 0,
    t0 = 0.08, t1 = 0.92, out = 3, scarDepth = null, ribs = 2,
  }) {
    const n = Math.max(1, Math.round(plates));
    const run = z1 - z0;
    const g = gap ?? Math.abs(run) * 0.028;
    const each = (run - g * (n - 1)) / n;
    if (!(each > 0)) {
      throw new Error(`[hulk] ${this.label}: belt of ${n} plates with ${g.toFixed(1)} m gaps does not `
        + `fit in ${run.toFixed(1)} m. Fewer plates or a smaller gap.`);
    }
    const sunk = scarDepth ?? Math.max(2, out * 3.2);
    const on = [];
    const off = [];
    for (let i = 0; i < n; i++) {
      const a = z0 + i * (each + g);
      const shrink = 1 - taper * (n === 1 ? 0 : i / (n - 1));
      const b = a + each * shrink;
      if (b - a < 1e-3) continue;
      if (missing.includes(i)) {
        off.push({ geo: this.cut({ z0: a, z1: b, lobe, kind, t0, t1, depth: sunk, lip: out * 0.35 }) });
        // The ribs the plate was bolted to. `inner`/`out` are both NEGATIVE, so these
        // stand in the FLOOR of the scar and never break the silhouette.
        for (let k = 0; k < ribs; k++) {
          const zr = a + ((k + 1) / (ribs + 1)) * (b - a);
          const w = Math.max(3, (b - a) * 0.045);
          off.push({
            geo: this.plate({
              z0: zr - w, z1: zr + w, lobe, kind, t0: t0 + 0.02, t1: t1 - 0.02,
              inner: -sunk, out: -sunk * 0.28,
            }),
          });
        }
      } else {
        on.push({ geo: this.plate({ z0: a, z1: b, lobe, kind, t0, t1, out }) });
      }
    }
    return { plates: G.mergeParts(on, { uv: false }), scars: G.mergeParts(off, { uv: false }) };
  }

  /**
   * RIBS: a step in the body's OWN section at each z, pushed out by `proud` and held
   * for `step` metres — `Mass#frames` for a section that has no deck.
   *
   * THE SPACING IS THE INVARIANT, NOT THE COUNT, and the gaps come from `FRAME.gaps`
   * verbatim, because "structure is never evenly spaced" is a fact about structure
   * and not a fact about the Coalition. What the hulk does NOT take is the fleet's
   * SPACING FRACTION: `FRAME` puts a frame every 6.4-10.0% of hull length, and this
   * thing carries its ribs at 11.6 / 13.5 / 16.3% — measured, 395 / 459 / 555 m,
   * no two gaps alike. That is coarser than any hull either navy builds, at a scale
   * neither of them works at, and it is the cheapest way to say "older and bigger"
   * in a shape a player can count. The fleet's bounds are therefore deliberately NOT
   * enforced here: `Mass#frameStations` throws outside 6.4-10.0% and it is right to,
   * because a Coalition frigate wearing this rhythm would lie about its size.
   */
  ribStations({ length = this.span, spacing = 0.135, count = 4, from = null, to = null } = {}) {
    const target = Math.max(1e-6, spacing * length);
    const lo = from ?? this.z0;
    const hi = to ?? this.z1;
    const usable = hi - lo;
    let n = Math.max(0, Math.round(count));
    const total = (k) => {
      let s = 0;
      for (let i = 0; i < k - 1; i++) s += target * FRAME.gaps[i % FRAME.gaps.length];
      return s;
    };
    while (n >= 2 && total(n) > usable) n--;
    if (n < 2) return [];
    let z = (lo + hi) * 0.5 - total(n) * 0.5;
    const zs = [z];
    for (let i = 0; i < n - 1; i++) {
      z += target * FRAME.gaps[i % FRAME.gaps.length];
      zs.push(z);
    }
    return zs;
  }

  ribs(zs, { proud = null, step = null, keep = null } = {}) {
    if (!zs || !zs.length) return null;
    const parts = [];
    for (const z of zs) {
      const s = this.at(Math.min(this.z1, Math.max(this.z0, z)));
      const pr = proud ?? Math.max(1, s.r * 0.05);
      const st = step ?? Math.max(2, this.span * 0.005);
      const ring = (o) => hulkSection({
        r: s.r + o, twist: s.twist, chamfer: s.chamfer, ridge: s.ridge, keep, label: `${this.label} rib`,
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
   * A TORN RIM: the skin turns inward and recedes into darkness instead of being
   * capped by a flat disc.
   *
   * This is the single most important forty triangles in the file. The first pass
   * capped both breach lofts, so a 226 m-radius pentagon of solid plate faced the
   * player at the exact place the fiction says the ship was ripped open — visible
   * in docs/probes/derelict-breach.png as the flat facet the yellow emissive sits
   * on. A funnel gives the breach a PLATING THICKNESS and a throat, which is what
   * a torn shell has and a sliced one does not, and it is still closed, so nothing
   * shows through the far side of the hull.
   *
   * ALWAYS FLIPPED, AND THE FIRST DRAFT WAS NOT. A funnel is only ever looked at
   * from inside the gap, so every triangle of it has to face the middle of the
   * breach. `G.loft` winds a section for an OUTWARD normal — correct for a hull,
   * exactly backwards for a hole — and the first draft took `flip` from the sign of
   * `into`, which happened to be right for the forward rim and wrong for the aft
   * one. Measured, with the eye on the axis at z 250:
   *
   *     aft  rim (into -150)    0 tris face the breach, 43 face away   <- INVISIBLE
   *     fore rim (into +170)   43 tris face the breach,  0 face away
   *
   * Back-face culling deleted the whole aft wall and the player looked straight
   * through the ship. Nothing on screen says so, because what you see through the
   * hole is the same near-black as the throat you were supposed to be seeing.
   *
   * @param {number} z      the rim station
   * @param {number} into   metres back INTO the body (signed: -1 aft, +1 forward)
   */
  rim(z, into, { throat = 0.22, keep = null } = {}) {
    const s = this.at(z);
    const outer = hulkSection({
      r: s.r, twist: s.twist, chamfer: s.chamfer, ridge: s.ridge, keep, label: `${this.label} rim`,
    });
    const inner = hulkSection({
      r: s.r * throat, twist: s.twist + 0.10, chamfer: s.chamfer, ridge: s.ridge, keep,
      label: `${this.label} rim throat`,
    });
    const zi = z + into;
    const rows = into > 0
      ? [{ z, points: outer }, { z: zi, points: inner }]
      : [{ z: zi, points: inner }, { z, points: outer }];
    return G.loft(rows, { capFront: into > 0, capBack: into < 0, flip: true });
  }

  /**
   * Findings, in the spirit of `Mass#findings`. Nothing here throws; read it and
   * justify what fails.
   *
   * NOTHING IN THIS TREE CALLS IT YET, and that is a wiring gap rather than dead
   * code. `audit.mjs#LINE_AUDIT` is a fixed list of `[label, Lines, length, exempt]`
   * and the hulk has never been in it, because R2.1/R2.2/R2.3/R2.5 are rules about a
   * bilateral hull's half-beam curve and this body has no half-beam. Both Spindles
   * are exported (`HULK_AFT`, `HULK_FORE`) so the agent who owns `audit.mjs` can add
   * a radial block in one line; that file is not this stream's to write.
   */
  findings() {
    const rows = this.rows;
    const out = { stations: rows.length, minima: 0, maxima: 0 };
    for (let i = 1; i < rows.length - 1; i++) {
      if (rows[i][1] < rows[i - 1][1] && rows[i][1] < rows[i + 1][1]) out.minima++;
      if (rows[i][1] > rows[i - 1][1] && rows[i][1] > rows[i + 1][1]) out.maxima++;
    }
    let worst = null;
    for (const r of rows) {
      const f = sectionFindings(hulkSection({ r: r[1], twist: 0, chamfer: r[2], ridge: r[3] }));
      if (!worst || f.maxFacetFrac > worst.maxFacetFrac) worst = { z: r[0], ...f };
    }
    out.worstSection = worst;
    out.rMin = Math.min(...rows.map((r) => r[1]));
    out.rMax = Math.max(...rows.map((r) => r[1]));
    return out;
  }
}

// ---------------------------------------------------------------------------
// The spine
// ---------------------------------------------------------------------------

/** Forty degrees of twist over the whole length. Slow enough to be uncanny. */
const twistAt = (z) => ((z + 1700) / HULK_LENGTH) * 0.70;

const BREACH = { z0: 100, z1: 400 };

/**
 * `[z, r, chamfer, ridge]`. ONE table, split into two lofts with a gap between them:
 * the gap IS the breach, so there is no way to edit the lines and accidentally heal
 * it.
 *
 * THE PLAN CURVE, and why it is no longer a cone. The first pass was monotonic from
 * r 16 to r 286 over 3.4 km — a dart, and a dart has a front. This has a COLLAR at
 * z -1180, a WAIST at z -960 where the ring's spokes reach in, and a SHOULDER at
 * z +1000 after which the body FALLS AWAY into the crown. Three interior extrema, so
 * there is no station from which the object reads as pointing anywhere; and the
 * shoulder-then-fall is what stops the forward half being a nose. `common.js` ranks
 * the plan curve second only to topology as a separation lever, and this hull's
 * closest neighbour in the fleet is measured after every edit.
 *
 * `chamfer` falls and `ridge` rises going forward, along the safe diagonal the
 * section's dihedral rule allows: the tail is blunt-cornered with a soft chine and
 * the forward body is sharp-cornered with a hard one, so the same section family
 * describes a body that changes character over its length without changing family.
 */
const SPINE = [
  [-1735, 14, 0.30, 0.16],
  [-1620, 40, 0.30, 0.16],
  [-1460, 78, 0.30, 0.16],
  [-1300, 108, 0.30, 0.16],
  [-1180, 124, 0.31, 0.16],   // COLLAR — an interior maximum
  [-1070, 116, 0.31, 0.16],
  [-960, 109, 0.30, 0.16],    // WAIST — an interior minimum, where the spokes reach
  [-820, 128, 0.30, 0.17],
  [-620, 160, 0.28, 0.17],
  [-440, 186, 0.28, 0.17],
  [-250, 204, 0.27, 0.18],
  [-60, 216, 0.26, 0.18],
  [100, 226, 0.26, 0.18],     // AFT BREACH RIM
  // ---- breach: z 100 .. 400, no hull ----
  [400, 232, 0.26, 0.18],     // FORE BREACH RIM
  [600, 250, 0.25, 0.19],
  [820, 274, 0.24, 0.19],
  [1000, 288, 0.23, 0.20],    // SHOULDER — the plan maximum
  [1180, 274, 0.22, 0.20],
  [1400, 242, 0.22, 0.20],    // crown root
];

const AFT = new Spindle(SPINE.filter((r) => r[0] <= BREACH.z0), { label: 'hulk:aft', twist: twistAt });
const FORE = new Spindle(SPINE.filter((r) => r[0] >= BREACH.z1), { label: 'hulk:fore', twist: twistAt });

/** Stations that ARE the silhouette, kept by NAME past LOD0. */
const AFT_LOD1 = [-1620, -1460, -1180, -1070, -960, -820, -620, -440, -250, -60];
const AFT_LOD2 = [-1460, -1180, -960, -620, -250];
const FORE_LOD1 = [600, 820, 1000, 1180];
const FORE_LOD2 = [820, 1000];

/** Widest radius anywhere on the body at z — the ridge. Used to place everything. */
function radiusAt(z) {
  if (z <= BREACH.z0) return AFT.outerRadius(z);
  if (z >= BREACH.z1) return FORE.outerRadius(z);
  return AFT.outerRadius(BREACH.z0);
}

/** The world angle ridge `lobe` points at, at station z. Vanes grow out of these. */
const ridgeAngle = (lobe, z) => twistAt(z) + (lobe / 5) * TAU;

/** The bare pentagon, for the raw structure INSIDE the skin. */
const pent = (r, twist) => G.ngonProfile(r, 5, twist + PI / 5);

// ---------------------------------------------------------------------------
// Radial vanes
// ---------------------------------------------------------------------------

/**
 * VANE STATIONS, `[radial, axialCentre, axialHalf, halfThickness]`.
 *
 * The plan outline is the one that shipped — widest a third of the way out, trailing
 * edge running the wrong way, and a leading edge that sweeps back toward the root —
 * sampled off the original five-point polygon so the SILHOUETTE does not move. What
 * is new is that a vane now has a SECTION: an eight-point chamfered profile that
 * tapers 52 m to 9 m from root to tip. The first pass extruded a flat polygon
 * through a constant thickness, which is two large parallel planes and a square
 * edge — the one construction in the file that was a box, and the one part of the
 * object a player sees from ten kilometres.
 */
const VANE = [
  [190, 300, 600, 26],
  [320, 296, 517, 22],
  [430, 292, 442, 17],
  [500, 316, 367, 12],
  [560, 337, 303, 8],
  [620, 120, 12, 4.5],
];
/** The fifth vane. Snapped off ~130 m out; everything past that is elsewhere now. */
const VANE_STUMP = [
  [190, 300, 600, 26],
  [270, 298, 550, 23],
  [316, 250, 470, 20],
  [330, 180, 300, 14],
];

/**
 * THE VANE SECTION: a double wedge, thickest 29% aft of centre, coming to an edge
 * at both the leading and the trailing end.
 *
 * Six points, and every one of them earns its place. A flat plate has TWO faces and
 * they are parallel, which is the one construction in this file that measured as a
 * box and the one part of the object visible from ten kilometres. A double wedge has
 * FOUR, meeting at a chine down the middle of each face that runs 430 m and catches
 * a rim light — the same move the ridge makes on the spine section, at a scale a
 * player reads from the tactical view. It is also CHEAPER than the chamfered octagon
 * that was the obvious fix: 12 triangles a segment against 16.
 *
 * `u` is the axial offset from the station's own centre; `t` is thickness. Wound
 * counter-clockwise in (u, t).
 */
function vaneProfile(half, th, detail) {
  if (detail < G.DETAIL.FULL) {
    return [[half, 0], [-half * 0.42, th], [-half, 0], [-half * 0.42, -th]];
  }
  return [
    [half, 0],
    [half * 0.35, th * 0.74],
    [-half * 0.42, th],
    [-half, 0],
    [-half * 0.42, -th],
    [half * 0.35, -th * 0.74],
  ];
}

/**
 * One vane, lofted along +X (radial) with its axial extent in +Z, so a single
 * Z-rotation at `B.add` time then points it at any lobe.
 *
 * THE MIRROR, and it is the one thing in this function that is not obvious.
 * `G.orient(g, 'x')` is a +90 degree rotation about Y, which sends local +Z to world
 * +X (radial, wanted) and local +X to world MINUS Z. So a profile authored with the
 * leading edge at +u would come out pointing aft. The axial coordinate is therefore
 * negated on its way in, and negating x mirrors the polygon and reverses its
 * winding, so the point list is reversed to put it back — the same correction
 * `common.js#mirrorOutline` makes, for the same reason. Getting this wrong builds
 * a vane that is exactly right and 180 degrees round.
 */
function vaneBody(table, detail) {
  const stations = table.map(([rad, c, half, th]) => ({
    z: rad,
    points: vaneProfile(half, th, detail).map(([u, t]) => [-(c + u), t]).reverse(),
  }));
  return G.orient(G.loft(stations), 'x');
}

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

const RING = {
  radius: 700, z: -380, section: 34, sectors: 18, missing: [7, 8, 9, 10, 11], tilt: 0.30,
};
const SPOKES = [0.35, 0.35 + TAU / 3, 0.35 + 2 * TAU / 3];

// ---------------------------------------------------------------------------
// WHERE THE DAMAGE IS. Five-fold form, asymmetric damage.
// ---------------------------------------------------------------------------

/**
 * One entry per lobe, and the whole "picked over" read is in this table.
 *
 * The FORM stays rigorously five-fold — same section, same vane, same ridge angle —
 * because that symmetry is what makes the object alien. The DAMAGE is different on
 * every lobe AND different on the two facets of the same lobe, because that is what
 * damage is, and because `common.js` states the rule the fleet files are held to and
 * it applies here word for word: NOTHING DENSE IS MIRRORED. Five identical stripped
 * patches at 72-degree intervals would read as a texture; two identical ones either
 * side of the same chine would read as a modifier stack.
 *
 * Fixed indices, no RNG: a hull that looks different between two builds of the same
 * seed is not a hull, it is a slot machine.
 *
 *   rise/fall  `[plates, missing[]]` for the two flats of the lobe. Every index in
 *              `missing` becomes a SCAR — the same footprint sunk instead of proud,
 *              with the ribs the plate was bolted to standing in the bottom of it.
 *   peel       `[index, metres]` — a plate still attached at its aft edge and
 *              standing this far off the skin at its forward one.
 *   slash      a long salvage cut down the lobe, `[z0, z1]`, or null.
 *   fore       plates missing from the forward corner belt; `null` means this lobe
 *              carries no forward plating at all.
 *
 * 21 of the 72 belt footprints on the object are empty — 16 of 52 on the aft flanks,
 * 3 of 4 on the tail, 2 of 16 on the forward corners. That gradient is the design:
 * the tail was cleaned out, the flanks were worked, the forward corners were barely
 * touched, which is the order somebody stripping a wreck would actually work in. And
 * a third is the fraction, not a half: under about a fifth the object reads as
 * merely damaged, and over about a half it reads as a frame that never had a skin.
 * It has to read as a SHIP THAT WAS STRIPPED.
 */
const LOBE_DAMAGE = [
  // 0 — the reference face. Nearly whole: this is what the other four were.
  { rise: [6, []], fall: [5, [3]], peel: null, slash: null, fore: [] },
  // 1 — the lobe the snapped vane came off. Stripped to the frames, front to back.
  { rise: [6, [1, 2, 4]], fall: [6, [0, 2, 3, 5]], peel: [5, 26], slash: null, fore: null },
  // 2 — worked over from the breach end, then abandoned half done.
  { rise: [5, [3, 4]], fall: [4, [1]], peel: [4, 34], slash: null, fore: [2] },
  // 3 — a 420 m cut down the flank, made by something getting at what was inside.
  { rise: [5, [2]], fall: [4, []], peel: null, slash: [-540, -120], fore: [] },
  // 4 — plates lifted and left, and one whole run taken.
  { rise: [6, [4]], fall: [5, [0, 2, 3]], peel: [2, 18], slash: null, fore: [1] },
];

/** The belt runs the length of the aft body, which is the half the player can reach. */
const BELT_RUN = { z0: -1040, z1: 70 };

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function hulkParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const B = new Buckets();

  // =========================================================================
  // 1. THE SPINE, in two pieces, one continuous loft each.
  //
  // Neither piece is capped at the breach. Both get a `rim` instead: the skin turns
  // inward and recedes, so the wound has a wall thickness and a throat.
  // =========================================================================
  {
    const card = lod >= 2 ? HULK_SECTION_LOD.far : HULK_SECTION_LOD.full;
    B.add('core', 'hull', AFT.loft({
      at: lod === 0 ? null : (lod === 1 ? AFT_LOD1 : AFT_LOD2), keep: card, capFront: false,
    }));
    B.add('core', 'hull', FORE.loft({
      at: lod === 0 ? null : (lod === 1 ? FORE_LOD1 : FORE_LOD2), keep: card, capBack: false,
    }));
    B.add('breach', 'dark', AFT.rim(BREACH.z0, -150, { keep: card }));
    B.add('breach', 'dark', FORE.rim(BREACH.z1, 170, { keep: card }));
  }

  // =========================================================================
  // 2. THE CROWN. Five horns and a node - no cockpit, no bridge, no purpose a
  //    human eye can assign to it. SEVEN-fold, on a five-fold body, which is one
  //    of the three symmetries that refuse to agree. Two horns are broken now, not
  //    one: whatever was worth taking off this thing was taken off the end you can
  //    reach without going inside.
  // =========================================================================
  B.add('core', 'plating', G.loft([
    { z: 1400, points: G.ngonProfile(190, 7, PI / 7) },
    { z: 1520, points: G.ngonProfile(212, 7, PI / 7) },
    { z: 1660, points: G.ngonProfile(96, 7, PI / 7) },
  ]));
  for (let i = 0; i < 5; i++) {
    const a = ridgeAngle(i, 1400);
    // Horn 3 is snapped off a third of the way up. Horn 0 is GONE — all that is
    // left is the seat it stood in, which is a louder statement than a stump: a
    // stump is battle damage and an empty mount is somebody with a cutting torch.
    const broken = i === 3 ? 1 : (i === 0 ? 2 : 0);
    if (broken !== 2) {
      B.add('core', 'plating', G.taperedWedge({
        length: broken ? 150 : 330,
        width0: 108, height0: 96,
        width1: broken ? 84 : 26, height1: broken ? 72 : 20,
        chamfer: 12, detail: D,
      }), {
        pos: [Math.cos(a) * 168, Math.sin(a) * 168, 1360],
        rot: [Math.sin(a) * -0.42, Math.cos(a) * 0.42, 0],
      });
    }
    if (broken === 2 && full) {
      B.add('core', 'dark', G.recess({ width: 96, height: 84, depth: 34, wall: 9, detail: D }), {
        pos: [Math.cos(a) * 186, Math.sin(a) * 186, 1392],
        rot: [Math.sin(a) * -0.42, Math.cos(a) * 0.42, 0],
      });
    }
  }

  // =========================================================================
  // 3. FIVE VANES. Four intact, one snapped. The break is the only place on the
  //    object where anything is at a human sort of angle, and it is because it
  //    tore rather than because it was drawn.
  //
  //    Each vane grows out of a RIDGE — `ridgeAngle(i, z)` is the same angle
  //    `hulkSection` puts ridge i at — so the 55-degree chine that runs the length
  //    of the body IS the vane's spar arriving. On the first pass the section was a
  //    plain pentagon and the vanes emerged from the middle of a flat.
  // =========================================================================
  for (let i = 0; i < 5; i++) {
    const a = ridgeAngle(i, 300);
    const snapped = i === 1;
    B.add('core', 'hull', vaneBody(snapped ? VANE_STUMP : VANE, D), { rot: [0, 0, a] });
    // The spar: a hex beam running out along the vane, half buried in it. The first
    // pass used a flat plate 92 m thick inside a vane 46 m thick, i.e. a slab
    // standing proud of both faces of a slab.
    const reach = snapped ? 300 : 560;
    B.add('core', 'plating', G.hexStrut({
      length: reach - 150, radius: 30, radiusEnd: snapped ? 20 : 11, axis: 'x', detail: D,
    }), { pos: [Math.cos(a) * 150, Math.sin(a) * 150, 300], rot: [0, 0, a] });

    if (snapped) {
      // Torn edge: three shards left hanging past the break, each at its own angle.
      for (let k = 0; k < 3; k++) {
        const t = -140 + k * 300;
        B.add('core', 'dark', G.taperedWedge({
          length: 90 + k * 40, width0: 40, height0: 54, width1: 8, height1: 12,
          shear: k % 2 ? 18 : -22, detail: D,
        }), {
          pos: [Math.cos(a) * 320, Math.sin(a) * 320, t],
          rot: [0.4 - k * 0.35, PI * 0.5 + (k - 1) * 0.5, a],
        });
      }
    } else if (full) {
      // The game-wide running-light strip down the outer edge of every surviving
      // vane, laid at LIGHT_U_PER_M so the lamp spacing is the fleet's 40 m. At
      // 3.4 km that reads as a continuous line, which is what makes the scale legible.
      const p0 = [Math.cos(a) * 616, Math.sin(a) * 616, 110];
      const p1 = [Math.cos(a) * 556, Math.sin(a) * 556, 632];
      B.add('core', 'runningLights', lightRun(p0, p1, [Math.cos(a), Math.sin(a), 0], 9));
    }
  }

  // =========================================================================
  // 4. THE SKIN. Armour plating cut from the body's own section, and most of it
  //    gone. This is the "picked over" read and it is the largest single spend in
  //    the file.
  //
  //    Every plate lies ON the loft by construction (see `Spindle#plate`), every
  //    scar is the exact footprint of the plate that used to be there, and the
  //    ribs in the bottom of a scar are the same primitive at a negative offset -
  //    so nothing here can drift off the surface when the station table is edited.
  //
  //    IT BUYS NO SEPARATION AND THAT IS EXPECTED. `silhouetteSignature` sees three
  //    numbers per z-bin and a 3 m plate on a 226 m radius moves none of them. This
  //    is surface language: it is how a hull stops being a box and how this object
  //    stops looking newer than the fleet it is parked next to.
  // =========================================================================
  if (lod < 2) {
    const thin = lod > 0;
    for (let lobe = 0; lobe < 5; lobe++) {
      const d = LOBE_DAMAGE[lobe];
      for (const kind of thin ? ['rise'] : ['rise', 'fall']) {
        const [count, gone] = d[kind];
        const n = thin ? Math.max(2, count - 2) : count;
        const miss = thin ? gone.filter((i) => i < n).slice(0, 1) : gone;
        const { plates, scars } = AFT.belt({
          z0: BELT_RUN.z0 + (kind === 'fall' ? 60 : 0),
          z1: BELT_RUN.z1 - (kind === 'fall' ? 90 : 0),
          lobe, kind, plates: n, missing: miss, taper: 0.14,
          t0: kind === 'rise' ? 0.14 : 0.10, t1: kind === 'rise' ? 0.90 : 0.86,
          out: 3.4, scarDepth: 17, ribs: thin ? 0 : 2,
        });
        B.add('core', 'plating', plates);
        B.add('core', 'dark', scars);
      }
      // The corner chamfer carries a narrow belt of its own on the forward body -
      // the one place the skin is still mostly whole, so there is something for the
      // stripped lobes to be stripped AGAINST. Lobe 1 has none: whatever took its
      // vane off worked the whole length of it.
      if (full && d.fore) {
        const { plates, scars } = FORE.belt({
          z0: 430, z1: 1180, lobe, kind: 'corner', plates: 4, missing: d.fore,
          t0: 0.16, t1: 0.84, out: 2.6, taper: 0.2, scarDepth: 13, ribs: 1,
        });
        B.add('core', 'plating', plates);
        B.add('core', 'dark', scars);
      }
      // Plates still bolted at one edge and standing off at the other.
      if (full && d.peel) {
        const [idx, lift] = d.peel;
        const each = (BELT_RUN.z1 - BELT_RUN.z0) / d.fall[0];
        const a = BELT_RUN.z0 + idx * each;
        B.add('core', 'dark', AFT.plate({
          z0: a, z1: a + each * 0.86, lobe, kind: 'fall',
          t0: 0.12, t1: 0.88, t0End: 0.30, t1End: 0.70,
          out: 1.2, outEnd: lift,
        }));
      }
      // THE TAIL, and it gets one belt on one lobe with three of its four plates
      // gone. Everything aft of `BELT_RUN.z0` is bare skin, which is the honest
      // reading of "picked over" - but bare skin with no evidence of what was on it
      // is just an unfinished model. Four footprints and one plate is the evidence.
      if (full && lobe === 3) {
        const { plates, scars } = AFT.belt({
          z0: -1600, z1: -1080, lobe, kind: 'rise', plates: 4, missing: [0, 1, 3],
          t0: 0.18, t1: 0.86, out: 2.2, scarDepth: 9, ribs: 1,
        });
        B.add('core', 'plating', plates);
        B.add('core', 'dark', scars);
      }
      // A salvage cut down the flank. Long, shallow, and made by something that did
      // not care what it was cutting.
      if (full && d.slash) {
        B.add('core', 'dark', AFT.cut({
          z0: d.slash[0], z1: d.slash[1], lobe, kind: 'fall',
          t0: 0.30, t1: 0.62, depth: 22, lip: 1.6, maxStep: 150,
        }));
      }
    }
  }

  // =========================================================================
  // 5. RIBS, at 12-16% of length. Coarser than any hull either navy builds - see
  //    `Spindle#ribStations`. They survive to LOD1, which is where the object is
  //    seen from across a system.
  // =========================================================================
  if (lod < 2) {
    const keep = lod === 0 ? null : HULK_SECTION_LOD.far;
    B.add('core', 'plating', AFT.ribs(
      AFT.ribStations({ length: HULK_LENGTH, count: lod === 0 ? 4 : 3, from: -1400, to: 20 }),
      { keep },
    ));
    B.add('core', 'plating', FORE.ribs(
      FORE.ribStations({ length: HULK_LENGTH, count: 2, from: 470, to: 1300 }),
      { keep },
    ));
  }

  // =========================================================================
  // 6. THE RING. Thirteen of eighteen sectors, on three spokes, tilted 17 degrees
  //    out of the plane the spokes define. Nothing about that is buildable.
  // =========================================================================
  {
    const parts = [];
    const chord = 2 * RING.radius * Math.sin(PI / RING.sectors) * 1.02;
    // A TRIANGULAR section, not a pentagonal one.
    //
    // Every structural class on this object used to be built out of the same 5-gon,
    // so a 1400 m ring and a 200 m spine had facets of wildly different sizes
    // carrying identical surface frequency, and the thing had no scale hierarchy at
    // any distance. One primitive per class - 5 for the spine, 3 for the ring, 7 for
    // the crown, a chamfered octagon for the vanes - means facet size tracks feature
    // size, which is the geometry half of the fix. The other half is the surface
    // map's density, which materials owns.
    const prof = G.ngonProfile(RING.section * 1.25, 3, PI / 3);
    for (let i = 0; i < RING.sectors; i++) {
      if (RING.missing.includes(i)) continue;
      if (!full && i % 2) continue;         // half the sectors past LOD0
      const th = (i / RING.sectors) * TAU;
      // The two sectors at the break are half gone and taper into nothing. A ring
      // that stops square at both ends of the gap was cut; one that tapers tore.
      const end = i === 6 ? -1 : i === 12 ? 1 : 0;
      const a0 = end > 0 ? -chord * 0.5 : -chord * 0.5;
      const a1 = end < 0 ? chord * 0.06 : chord * 0.5;
      parts.push({
        geo: end
          ? G.orient(G.loft([
            { z: end > 0 ? chord * 0.5 : a0, points: G.ngonProfile(RING.section * 1.25, 3, PI / 3) },
            { z: end > 0 ? -chord * 0.06 : a1, points: G.ngonProfile(RING.section * 0.34, 3, PI / 3) },
          ].sort((x, y) => x.z - y.z)), 'x')
          : G.orient(G.prism(prof, a0, a1), 'x'),
        rot: [0, 0, th + PI * 0.5],
        pos: [Math.cos(th) * RING.radius, Math.sin(th) * RING.radius, 0],
      });
    }
    for (const th of SPOKES) {
      parts.push({
        geo: G.hexStrut({ length: RING.radius - 110, radius: 24, radiusEnd: 40, axis: 'x', detail: D }),
        rot: [0, 0, th],
        pos: [Math.cos(th) * 110, Math.sin(th) * 110, 0],
      });
    }
    const ring = G.mergeParts(parts);
    B.add('ring', 'plating', G.place(ring, { rot: [RING.tilt, 0, 0], pos: [0, 0, RING.z] }));
  }

  // =========================================================================
  // 7. THE BREACH. The outside is gone for 300 m and you can see what was under
  //    it. This is the single most important 300 metres of the object, and it is
  //    the one part the player gets within a hundred metres of.
  // =========================================================================
  {
    const zc = (BREACH.z0 + BREACH.z1) * 0.5;
    /**
     * EVERYTHING IN HERE IS DELIBERATELY THIN, AND DELIBERATELY CRUDER THAN THE SKIN.
     *
     * The first pass filled the breach with an inner spindle at 96 m and frames at
     * 180 m against a hull radius of 220, and the result was a continuous silhouette
     * with a slight texture change - the wound healed itself. At 80 and 120 the gap
     * is a genuine neck: the object narrows to a third of its diameter for three
     * hundred metres and you can see daylight past the longerons.
     *
     * The inner structure is a BARE PENTAGON where the skin is a fifteen-point
     * chamfered section. That hierarchy is the point: what this thing showed the
     * universe was faired and plated, and what is under it is a raw five-sided spar.
     * You are not supposed to have seen this part.
     */
    B.add('breach', 'dark', G.loft([
      { z: BREACH.z0 - 70, points: pent(80, twistAt(BREACH.z0)) },
      { z: BREACH.z1 + 70, points: pent(86, twistAt(BREACH.z1)) },
    ]));
    const longerons = full ? 6 : 3;
    for (let i = 0; i < longerons; i++) {
      const a = twistAt(zc) + (i / longerons) * TAU;
      B.add('breach', 'greeble', G.hexStrut({ length: 380, radius: 13, axis: 'z', detail: D }), {
        pos: [Math.cos(a) * 116, Math.sin(a) * 116, BREACH.z0 - 45],
      });
    }
    const frames = full ? 4 : 2;
    for (let i = 0; i < frames; i++) {
      const z = BREACH.z0 - 20 + (i / (frames - 1)) * (BREACH.z1 - BREACH.z0 + 40);
      B.add('breach', 'greeble', G.prism(pent(128, twistAt(z)), z - 7, z + 7,
        { capFront: false, capBack: false }));
    }
    // Something in there is still running. A BAND around the inner spindle, not a
    // pair of flat panels: the breach is looked into from the side far more often
    // than down the axis, and a plane facing +Z is invisible from the side.
    B.add('breach', 'emissive', G.prism(pent(94, twistAt(zc)), zc - 60, zc + 60,
      { capFront: false, capBack: false }));

    if (full) {
      // TORN TEETH. The rim plating bent outward as it went, so each tooth is a skin
      // plate still attached at its inboard edge and lifted at its outboard one -
      // the same `plate` primitive the belts use, with `outEnd` doing the work. Five
      // a rim, on alternating facets, so the two rims do not mirror each other.
      for (let k = 0; k < 5; k++) {
        B.add('breach', 'dark', AFT.plate({
          z0: BREACH.z0 - 120 - k * 9, z1: BREACH.z0, lobe: k, kind: k % 2 ? 'rise' : 'fall',
          t0: 0.10, t1: 0.90, t0End: 0.26, t1End: 0.74,
          out: 1.0, outEnd: 22 + k * 5,
        }));
        B.add('breach', 'dark', FORE.plate({
          z0: BREACH.z1, z1: BREACH.z1 + 108 + k * 11, lobe: (k + 2) % 5, kind: k % 2 ? 'fall' : 'corner',
          t0: 0.24, t1: 0.76, t0End: 0.10, t1End: 0.90,
          out: 20 + k * 4, outEnd: 0.8,
        }));
      }
    }
  }

  // =========================================================================
  // 8. SURFACE NODULES. Five-fold, repeated at three bands, and they sit ON the
  //    ridges - the one landmark the section has - rather than at an arbitrary
  //    angle. They are the only thing on the object whose purpose is unreadable,
  //    which is what makes the surface feel grown rather than assembled.
  // =========================================================================
  if (lod < 2) {
    const bands = full ? [-1240, -700, 800] : [-700, 800];
    for (const z of bands) {
      const r = radiusAt(z);
      for (let i = 0; i < 5; i++) {
        const a = ridgeAngle(i, z);
        B.add('core', 'greeble', G.mountPad({ radius: r * 0.30, height: r * 0.11, sides: 8, detail: D }), {
          pos: [Math.cos(a) * (r * 0.92), Math.sin(a) * (r * 0.92), z],
          rot: [0, 0, a - HALF_PI],
        });
      }
    }
  }

  // =========================================================================
  // 9. SCALE CUE: emissive nodes every 200 m along three lines of the spine, plus
  //    ONE running-light seam on ONE ridge - the last circuit on the object still
  //    lit, and the only thing about it that is not five-fold.
  // =========================================================================
  if (lod < 2) {
    const step = full ? HULK_NODE_SPACING_M : HULK_NODE_SPACING_M * 2;
    for (let z = -1600; z <= 1400.01; z += step) {
      if (z > BREACH.z0 && z < BREACH.z1) continue;
      const r = radiusAt(z);
      const s = Math.min(34, Math.max(11, r * 0.16));
      const disc = radialGlow(s);
      for (let i = 0; i < 3; i++) {
        const a = twistAt(z) + (i / 3) * TAU + 0.9;
        B.add('core', 'engineGlow', disc, {
          pos: [Math.cos(a) * (r * 1.02), Math.sin(a) * (r * 1.02), z],
          rot: [0, 0, a],
        });
      }
    }
  }
  if (full) {
    // 440 m, not the whole flank: a strip that ran the length of the body would say
    // "powered and maintained", and this one has to say "one section of one circuit
    // is somehow still closed". Same texture, same LIGHT_U_PER_M, same 40 m lamps -
    // so it is still a ruler, it is just a short one.
    const z0 = -700, z1 = -260;
    const a0 = ridgeAngle(0, z0), a1 = ridgeAngle(0, z1);
    const r0 = radiusAt(z0), r1 = radiusAt(z1);
    B.add('core', 'runningLights', lightRun(
      [Math.cos(a0) * (r0 + 4), Math.sin(a0) * (r0 + 4), z0],
      [Math.cos(a1) * (r1 + 4), Math.sin(a1) * (r1 + 4), z1],
      [Math.cos(a1), Math.sin(a1), 0], 5,
    ));
  }

  return { buckets: B.list() };
}

// ---------------------------------------------------------------------------
// Drifting debris
// ---------------------------------------------------------------------------

/**
 * What came out of the breach, still nearby because there has been nothing to
 * disturb it. One InstancedMesh, one draw call; NOT counted against the hull's
 * triangle budget because it is not part of the hull.
 *
 * @returns {THREE.InstancedMesh|null}
 */
export function buildHulkDebris(ctx, count = 30) {
  const registry = ctx?.materials;
  if (!registry?.get) return null;
  const rng = (ctx.rng ?? { next: () => 0.5, range: (a, b) => (a + b) * 0.5, signed: () => 0 }).fork
    ? ctx.rng.fork('hulk:debris') : ctx.rng;

  // One chunk shape, instanced. A shard of the SKIN, cut from the same fifteen-point
  // section the hull is: this came off the object rather than being scattered near it.
  const chunk = G.mergeParts([
    { geo: G.loft([
      { z: -1, points: hulkSection({ r: 0.62, twist: 0.2, chamfer: 0.30, ridge: 0.16 }) },
      { z: 0.35, points: hulkSection({ r: 1.0, twist: 0.5, chamfer: 0.26, ridge: 0.18 }) },
      { z: 1.1, points: hulkSection({ r: 0.30, twist: 0.9, chamfer: 0.22, ridge: 0.20 }) },
    ]) },
  ]);
  const mat = registry.get('derelictHull', { faction: 'derelict', wear: 1.0, tier: 1, instanced: true });
  const mesh = new THREE.InstancedMesh(chunk, mat, count);
  mesh.name = 'ancient_hulk:debris';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Clustered around the breach and thinning out along the axis - it came from
    // one event, not from everywhere.
    const a = rng.next() * TAU;
    const rad = 700 + Math.pow(rng.next(), 0.55) * 2200;
    const z = 240 + rng.signed() * 1500 * (0.35 + rng.next());
    p.set(Math.cos(a) * rad, Math.sin(a) * rad, z);
    e.set(rng.next() * TAU, rng.next() * TAU, rng.next() * TAU);
    q.setFromEuler(e);
    // Small. A chunk that reads at the same apparent size as a vane stops being
    // debris and starts being clutter in front of the thing it came out of.
    const k = 9 + Math.pow(rng.next(), 2.4) * 78;
    s.set(k, k, k * rng.range(0.8, 2.4));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Class definition
// ---------------------------------------------------------------------------

/**
 * @type {import('../../../core/contracts.js').ShipClassDef}
 *
 * It is registered as a ship class so the salvage, targeting and world-sim layers
 * can treat it like any other hull without a special case. It cannot move: speed,
 * acceleration and turn rate are all zero, which is the honest way to say "static
 * exploration object" to systems that only speak ShipClassDef.
 */
export const ANCIENT_HULK = {
  id: 'derelict_ancient_hulk',
  name: 'Ancient Hulk',
  faction: 'derelict',
  role: 'hulk',
  length: HULK_LENGTH,
  mass: 4_200_000,
  maxSpeed: 0, accel: 0, turnRate: 0,
  hullHP: 48000,
  /**
   * The committed capital ceiling, not a local number. It was 2500 and the geometry
   * sat at 1734 of it - the same "budget raised, budget unspent" the module wave
   * found. A 3.4 km object the player flies INTO is the last hull in the game that
   * should be economising on triangles: draw calls are the scarce resource and this
   * costs the same ten either way.
   */
  triBudget: BUDGET.capitalTris,
  planeLocked: true,
  partsFor: hulkParts,
  lodLevels: 3,
  build(ctx) {
    const root = buildShip(ctx, {
      id: 'derelict_ancient_hulk',
      faction: 'derelict',
      partsFor: hulkParts,
      length: HULK_LENGTH,
      levels: 3,
    });
    const debris = buildHulkDebris(ctx);
    if (debris) {
      root.add(debris);
      root.userData.debris = debris;
    }
    return root;
  },
  subsystems: [
    { id: 'core', kind: 'reactor', hp: 9000, position: [0, 0, 240], radius: 190, salvageValue: 0.34, label: 'Something Still Running' },
    { id: 'crown', kind: 'sensor', hp: 6000, position: [0, 0, 1500], radius: 260, salvageValue: 0.20, label: 'Crown' },
    { id: 'ring', kind: 'sensor', hp: 5200, position: [0, 0, -380], radius: 740, salvageValue: 0.18, label: 'Ring Array' },
    { id: 'vane_root', kind: 'weapon', hp: 4400, position: [0, 0, 300], radius: 420, salvageValue: 0.14, label: 'Vane Roots' },
    { id: 'tail', kind: 'engine', hp: 3800, position: [0, 0, -1400], radius: 150, salvageValue: 0.08, label: 'Tail Spindle' },
  ],
  weapons: [
    // It is a hazard, not a combatant. One thing, short range, and it only ever
    // fires at whatever is closest - see sim/ai. Kept so the class is legal and so
    // "go inside it" is a decision rather than a formality.
    weapon('hulk_lash', 'Something Reaches Out', 'beam', {
      mount: [0, 0, 240], yawCentre: 0, yawWidth: PI * 2, pitchWidth: PI,
      range: 1600, damage: 70, shotsPerBurst: 1, cooldown: 9.0,
      projectileSpeed: Infinity, tracking: 0.4, powerDraw: 0, subsystemAccuracy: 0.3,
    }),
  ],
};

export const DERELICT_SHIPS = [ANCIENT_HULK];

/**
 * `HULK_AFT` / `HULK_FORE` / `HULK_SPINE` are exported for the audit, not for
 * building: they are the two Spindles and the table they were cut from, so a
 * headless tool can ask this hull the same questions `audit.mjs#LINE_AUDIT` asks the
 * fleet's `Lines` without importing anything that touches a material registry.
 */
export { hulkParts, AFT as HULK_AFT, FORE as HULK_FORE, SPINE as HULK_SPINE };
