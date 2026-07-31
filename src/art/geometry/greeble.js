/**
 * THE GREEBLE KIT — one hard-edged detail vocabulary for the whole game.
 *
 * Every geometry stream builds from these primitives. That is the entire point: a
 * hull assembled from mismatched salvage only reads as one deliberate object if the
 * *parts* share a language. Twelve primitives, all faceted, all cheap, all authored
 * in metres. If a shape you want is not here, add it here rather than inlining it in
 * your hull, and the next stream gets it for free.
 *
 * RULES THIS FILE OBEYS, AND SO MUST YOU
 *   - ONE UNIT IS ONE METRE. Nothing is authored in "model space" and rescaled.
 *   - HARD EDGES BY DEFAULT. Geometry comes back non-indexed with per-face normals,
 *     so flat shading happens in the geometry and not in a material variant. Smooth
 *     normals are opt-in (`smooth: true`) and only correct on a genuinely curved
 *     surface.
 *   - UVs ARE METRES, +V IS UP. Matches the material registry's contract exactly
 *     (art/materials/index.js). `mergeParts` re-projects UVs across the merged whole
 *     so plate seams run continuously over an assembly instead of restarting on each
 *     bolt-on.
 *   - CHEAP. Most primitives are under 60 triangles at full detail. `detail` is
 *     0 (far) / 1 (mid) / 2 (full) and always *removes* geometry as it drops; it
 *     never changes the primitive's overall proportions, so an LOD swap does not
 *     move the silhouette.
 *   - NO MATERIALS. This file returns BufferGeometry and nothing else. Materials
 *     come from the registry, always.
 *
 * MEASURED TRIANGLE COSTS at detail = 2, fully optioned (scratch/kit.mjs prints
 * these; they are ceilings, not targets):
 *   panelledSlab 12 plain / 28 chamfered / 52 with plates
 *   bevelBox     28 chamfered / 60 drafted    facetProfile   0 (a profile, not a solid)
 *   taperedWedge 12 plain / 28 chamfered      hexStrut       20
 *   pipeRun      44 with two flanges          radiatorFin    12 plain / 36 with ribs
 *   sensorDish   32                           thrusterBell   60 (inner shell + collar)
 *   armourBelt   12 per plate                 hullRibs       12 per rib
 *   antennaMast  56                           blastDoor      36
 *   dockingCollar 24 (48 with inner wall)     cappedConduit  16
 *   mountPad     22
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Detail tiers. Mirrors BuildContext.lod but inverted: 2 is full, 0 is far. */
export const DETAIL = { FAR: 0, MID: 1, FULL: 2 };

/** BuildContext.lod (0 full .. 2 far) -> DETAIL (2 full .. 0 far). */
export const detailForLod = (lod = 0) => Math.max(0, Math.min(2, 2 - lod));

const HALF_PI = Math.PI * 0.5;

// ---------------------------------------------------------------------------
// Attribute plumbing
// ---------------------------------------------------------------------------

/**
 * Keep exactly {position, normal, uv}, non-indexed, Float32. mergeGeometries
 * refuses to merge geometries whose attribute sets differ, and silently produces
 * garbage if one is indexed and another is not, so everything is normalised here
 * rather than at forty call sites.
 */
export function normalizeAttrs(geometry) {
  let g = geometry;
  if (g.index) g = g.toNonIndexed();
  const pos = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  const keep = new Set(['position', 'normal', 'uv']);
  for (const name of Object.keys(g.attributes)) if (!keep.has(name)) g.deleteAttribute(name);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** Hard-edged finish: non-indexed with per-face normals. */
export function hard(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  return normalizeAttrs(g);
}

/** Smooth finish. Only correct where the surface really is curved. */
export function smooth(geometry) {
  const g = geometry.index ? geometry : geometry.clone();
  g.computeVertexNormals();
  return normalizeAttrs(g);
}

/**
 * Box/triplanar projection in metres from the dominant vertex normal.
 * Side faces get (u,v) = (z,y) so +V points up the hull and streaks run down.
 */
export function metreUV(geometry) {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; }        // flanks: V is up
    else if (ny >= nz) { u = x; v = z; }               // decks
    else { u = x; v = y; }                             // bow / stern faces
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

const _m4 = new THREE.Matrix4();
const _mr = new THREE.Matrix4();
const _ms = new THREE.Matrix4();
const _euler = new THREE.Euler();

/**
 * Clone + place. `rot` is XYZ Euler radians, `scale` a number or [x,y,z].
 * Returns a new geometry; the input is untouched so primitives stay reusable.
 */
export function place(geometry, { pos, rot, scale } = {}) {
  const g = geometry.clone();
  if (rot || scale || pos) {
    _m4.identity();
    if (scale !== undefined) {
      const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
      _ms.makeScale(s[0], s[1], s[2]);
      _m4.multiply(_ms);
    }
    if (rot) {
      _euler.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'XYZ');
      _mr.makeRotationFromEuler(_euler);
      _m4.premultiply(_mr);
    }
    if (pos) {
      _mr.makeTranslation(pos[0] || 0, pos[1] || 0, pos[2] || 0);
      _m4.premultiply(_mr);
    }
    g.applyMatrix4(_m4);
  }
  return g;
}

/**
 * Merge placed parts into one geometry, then re-project UVs across the whole thing.
 *
 * @param {Array<BufferGeometry|{geo:BufferGeometry,pos?:number[],rot?:number[],scale?:number|number[]}>} parts
 * @param {{uv?:boolean}} [opts]  uv:false keeps the parts' own UVs (glow discs, decals)
 * @returns {THREE.BufferGeometry|null}
 */
export function mergeParts(parts, { uv = true } = {}) {
  const geos = [];
  for (const p of parts) {
    if (!p) continue;
    const src = p.isBufferGeometry ? p : p.geo;
    if (!src) continue;
    geos.push(normalizeAttrs(p.isBufferGeometry ? src.clone() : place(src, p)));
  }
  if (!geos.length) return null;
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (!merged) throw new Error('[greeble] mergeGeometries failed - mismatched attributes');
  if (uv) metreUV(merged);
  return merged;
}

/** Triangle count of a geometry. The only honest way to argue about a budget. */
export function triCount(geometry) {
  if (!geometry) return 0;
  const idx = geometry.index;
  return (idx ? idx.count : geometry.getAttribute('position').count) / 3;
}

// ---------------------------------------------------------------------------
// Profiles — closed 2D outlines, counter-clockwise seen from +Z.
// Everything extruded in this file consumes one of these, which is why the
// winding is right everywhere without a single normal-flipping hack.
// ---------------------------------------------------------------------------

/** Axis-aligned rectangle. */
export function rectProfile(width, height, cx = 0, cy = 0) {
  const hw = width * 0.5, hh = height * 0.5;
  return [[cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh], [cx - hw, cy - hh]];
}

/**
 * The hull cross-section of this game: a flat-topped, flat-sided box with four
 * chamfers. Chamfered corners are where every rim light in the frame comes from,
 * so they are not optional decoration - they are the value contrast.
 */
export function octProfile(halfWidth, top, bottom, chamW, chamTop, chamBot) {
  const hw = halfWidth;
  return [
    [hw, bottom + chamBot], [hw, top - chamTop],
    [hw - chamW, top], [-hw + chamW, top],
    [-hw, top - chamTop], [-hw, bottom + chamBot],
    [-hw + chamW, bottom], [hw - chamW, bottom],
  ];
}

/**
 * THE HULL SECTION. `octProfile` with the deck half-beam and the keel half-beam
 * stated independently, which is the only thing naval architecture's three free
 * curves actually need:
 *
 *   TUMBLEHOME   keel < deck   the flanks slope inward going down. The upper flank
 *                catches the key and the lower flank falls into shadow, so one
 *                geometric surface reads as two values for nothing.
 *   FLARE        keel > deck   the reverse, forward of the forefoot, so the widest
 *                part of the bow is down at the working gear rather than up at the
 *                deck. Flare forward + tumblehome aft is the difference between a
 *                ship and an extrusion.
 *
 * Eight points, same cardinality and same winding as `octProfile`, so the two are
 * interchangeable inside one loft.
 */
export function hullProfile({
  deckHalf, keelHalf = null, top, bottom, chamW = 0, chamTop = 0, chamBot = 0, keelChamW = null,
}) {
  const dh = Math.max(1e-3, deckHalf);
  const kh = Math.max(1e-3, keelHalf ?? deckHalf);
  const h = Math.max(1e-3, top - bottom);
  const cw = Math.min(chamW, dh * 0.92);
  const kw = Math.min(keelChamW ?? chamW * (kh / dh), kh * 0.92);
  const ct = Math.min(chamTop, h * 0.45);
  const cb = Math.min(chamBot, h * 0.45);
  return [
    [kh, bottom + cb], [dh, top - ct],
    [dh - cw, top], [-dh + cw, top],
    [-dh, top - ct], [-kh, bottom + cb],
    [-kh + kw, bottom], [kh - kw, bottom],
  ];
}

/**
 * THE FACETED HULL SECTION — a 12-gon of SIX LARGE PLANES PER SIDE, and the reason
 * the fleet stopped being boxes.
 *
 * `hullProfile` (above) is an 8-gon: four big orthogonal planes and four thin
 * chamfers, which measures out at 86% of the section perimeter in four facets whose
 * normals are +-X and +-Y. Stack a few of those and you get a shape whose surface is
 * two-thirds axis-aligned, which is what a stack of boxes IS. That is a measurable
 * property, not a matter of taste - see `ships/audit.mjs`, section SECTION AND SURFACE,
 * for the number on every hull in the game.
 *
 * This profile is built the other way round: from a PLATE FAMILY of six facet angles
 * per side, chosen so that
 *
 *   1. NO FACET IS WITHIN 5 DEGREES OF AN AXIS. Not one, at any station in the hull's
 *      whole beam-to-depth range. The deck is CAMBERED and the keel has DEADRISE, so
 *      even the two faces that "want" to be flat sit 8-15 degrees off horizontal and
 *      take different values from each other under one key.
 *   2. Every dihedral is either SMALL (6-7 degrees - a fair panel break inside one
 *      plane family) or a HARD CHINE (36-79 degrees). Nothing in the 12-28 degree
 *      band, which is the band that reads as a modelling accident under any key.
 *   3. The widest point of the section is a KNUCKLE about 43% of the section depth
 *      below the deck, never the deck edge and never the keel. A hull whose widest
 *      point is its deck edge is a box with a lid; a hull with a beltline a third of
 *      the way down is the EVE / Homeworld / EVE Frontier read, and it is one number.
 *
 * WHY SIX AND NOT MORE. The first build of this function used EIGHT facets per side.
 * It passed every number - 33% axis-aligned, fifteen normal clusters - and rendered as
 * a SUBMARINE: sixteen facets around a section is close enough to a circle that the
 * shading has no edge to break on, and "angular" became "smooth". The brief is large
 * flat planes meeting at hard angles, and the count of planes is the whole difference
 * between a faceted hull and a fair one. Six per side is three big planes (lower flank,
 * upper flank, deck chamfer) plus a deck flat, a keel flat and a deadrise.
 *
 * The six angles, walking up the starboard side from the keel crown, are
 * 14 / 24 / 64 / 116 / 152 / 169 degrees BEFORE the section's own aspect ratio squashes
 * them. At the hull's working beam-to-depth of 2.0-2.7 they land at
 * 8.1 / 14.3 / 49.6 / 130.4 / 163.1 / 173.7, so the dihedrals are
 * 6.2 / 35.3 / 80.8 / 32.6 / 10.6 — every one either under 12 degrees (a fair panel
 * break inside one plane family) or over 28 (a chine that catches a rim light), and
 * nothing in between. The closest any facet comes to a cardinal axis is 5.7 degrees,
 * at the transom, where the section is at its flattest.
 *
 * MEASURED at maxHalf 168, depth 140: perimeter 784 m, LARGEST FACET 86 m = 11.0% of
 * it (the rule asks for under 18%; the old 8-gon's worst was 32%), and the four
 * chamfer and knuckle facets carry 65.8% (the rule asks for 34%; the old 8-gon
 * carried 11-14%).
 *
 * Point order and winding match `hullProfile` exactly - counter-clockwise starting at
 * the starboard keel edge and going UP - so the two are interchangeable inside one
 * `loft` provided the cardinality matches. They do NOT match in cardinality, which is
 * deliberate: `hullProfile` is unchanged and every faction hull, the derelict and all
 * twenty-four modules still call it.
 *
 * Returned indices, which `cruiser.js` decimates by name at LOD2:
 *   0 keel flat (S)   1 keel chamfer (S)   2 KNUCKLE (S)   3 deck chamfer (S)
 *   4 deck flat (S)   5 deck crown         6..10 the port mirror of 4..0
 *   11 keel crown
 *
 * @param {Object} p
 * @param {number} p.maxHalf   half-beam AT THE KNUCKLE, i.e. the widest point
 * @param {number} p.top       deck plate level (the crown sits above it)
 * @param {number} p.bottom    keel plate level (the crown sits below it)
 * @param {number} [p.knuckle] knuckle depth as a fraction of (top-bottom) below the
 *                             deck. 0.30..0.55; deep aft, high forward.
 * @param {number} [p.deckFlat] deck flat half-width as a fraction of maxHalf
 * @param {number} [p.flare]   scales the two points below the knuckle. < 1 is
 *                             TUMBLEHOME (flanks slope inward going down), > 1 is
 *                             FLARE. The same free curve `hullProfile#keelHalf` carries.
 * @param {number} [p.camber]  deck crown rise as a fraction of (top-bottom)
 * @param {number} [p.deadrise] keel crown drop as a fraction of (top-bottom)
 * @param {number[]} [p.keep]  indices to emit, for LOD cardinality reduction. Ascending,
 *                             and must include 0 so the winding is stable.
 */
export function facetProfile({
  maxHalf, top, bottom, knuckle = 0.4234, deckFlat = 0.5085, flare = 1,
  camber = 0.0679, deadrise = 0.0486, keep = null,
}) {
  const M = Math.max(1e-3, maxHalf);
  const d = Math.max(1e-3, top - bottom);
  const k = Math.min(0.55, Math.max(0.30, knuckle));

  // y as a fraction of the section depth BELOW the deck plate. The two points above
  // the knuckle and the two below are remapped when the knuckle moves, so moving it
  // moves the whole beltline rather than shearing one facet.
  const K0 = 0.4234;
  const up = (t) => t * (k / K0);
  const dn = (t) => k + (t - K0) * ((1 - k) / (1 - K0));

  // xFrac, yFracBelowTop. Derived from the plate-family walk described above; the walk
  // is reproduced in `ships/audit.mjs` so these five numbers are checkable.
  const side = [
    [0.2835 * flare, dn(1.0000)],                        // 0 keel flat edge
    [0.6760 * (1 + (flare - 1) * 0.6), dn(0.8799)],      // 1 keel chamfer
    [1.0000, k],                                         // 2 THE KNUCKLE - widest point
    [0.7664, up(0.0943)],                                // 3 deck chamfer
    [deckFlat, 0],                                       // 4 deck flat edge
  ];

  const P = new Array(12);
  for (let i = 0; i < 5; i++) {
    P[i] = [side[i][0] * M, top - side[i][1] * d];
    P[10 - i] = [-side[i][0] * M, top - side[i][1] * d];
  }
  P[5] = [0, top + camber * d];              // deck crown
  P[11] = [0, bottom - deadrise * d];        // keel crown

  if (!keep) return P;
  return keep.map((i) => P[i]);
}

/**
 * Index maps for `facetProfile#keep`. LOD collapses cardinality by NAME, never by
 * dropping every other point.
 *
 * There is only ONE map, and that is a finding rather than an omission. With eight
 * facets per side the two small-dihedral points could be dropped at LOD1 for under 4 m
 * of outline movement; with six, every point carries a 36-degree chine or more, and
 * dropping the keel chamfer moves the outline 41 m. So LOD1 keeps all twelve and the
 * saving comes from stations instead — which is the right axis anyway, since a station
 * is 12 points and a facet is 2. LOD2 drops both chamfers, at 30-41 m, which is under
 * one pixel at the 43 m/px max-zoom read this level exists for.
 */
export const FACET_LOD = {
  full: null,                             // 12
  mid: null,                              // 12 — see above
  far: [0, 2, 4, 5, 6, 8, 10, 11],        // 8: both chamfers collapsed
};

/** Regular n-gon. `rotation` in radians; a flat top wants rotation = PI/n. */
export function ngonProfile(radius, sides = 6, rotation = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

/** Scale a profile about the origin, optionally recentred. */
export function scaleProfile(points, sx, sy = sx, cx = 0, cy = 0) {
  return points.map(([x, y]) => [x * sx + cx, y * sy + cy]);
}

// ---------------------------------------------------------------------------
// Loft — the workhorse. Every prism, wedge, bell and hull in the game is one.
// ---------------------------------------------------------------------------

/**
 * Loft a run of same-cardinality profiles along +Z.
 *
 * @param {Array<{z:number, points:number[][]}>} stations  ascending z
 * @param {Object} [opts]
 * @param {boolean} [opts.capFront=true]   cap the highest-z station
 * @param {boolean} [opts.capBack=true]    cap the lowest-z station
 * @param {boolean} [opts.flip=false]      reverse winding (inside-out shells: bell
 *                                         interiors, drive wells, bay linings)
 * @param {boolean} [opts.smoothShading=false]
 */
export function loft(stations, { capFront = true, capBack = true, flip = false, smoothShading = false } = {}) {
  if (stations.length < 2) throw new Error('[greeble] loft needs >= 2 stations');
  const n = stations[0].points.length;
  for (const s of stations) {
    if (s.points.length !== n) throw new Error('[greeble] loft stations must share a point count');
  }

  const verts = [];
  const push = (x, y, z) => { verts.push(x, y, z); };
  const tri = (a, b, c) => {
    if (flip) { push(...a); push(...c); push(...b); }
    else { push(...a); push(...b); push(...c); }
  };

  for (let s = 0; s < stations.length - 1; s++) {
    const A = stations[s], B = stations[s + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ai = [A.points[i][0], A.points[i][1], A.z];
      const aj = [A.points[j][0], A.points[j][1], A.z];
      const bi = [B.points[i][0], B.points[i][1], B.z];
      const bj = [B.points[j][0], B.points[j][1], B.z];
      tri(ai, aj, bj);
      tri(ai, bj, bi);
    }
  }

  if (capFront) {
    const F = stations[stations.length - 1];
    for (let i = 1; i < n - 1; i++) {
      tri([F.points[0][0], F.points[0][1], F.z],
        [F.points[i][0], F.points[i][1], F.z],
        [F.points[i + 1][0], F.points[i + 1][1], F.z]);
    }
  }
  if (capBack) {
    const K = stations[0];
    for (let i = 1; i < n - 1; i++) {
      tri([K.points[0][0], K.points[0][1], K.z],
        [K.points[i + 1][0], K.points[i + 1][1], K.z],
        [K.points[i][0], K.points[i][1], K.z]);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  if (smoothShading) return smooth(g);
  return normalizeAttrs(g);
}

/** Two-station loft: a straight prism from z0 to z1. */
export function prism(points, z0, z1, opts = {}) {
  return loft([{ z: z0, points }, { z: z1, points }], opts);
}

/**
 * Reorient a primitive authored along +Z.
 *   'z' identity | 'x' +Z becomes +X | 'y' +Z becomes +Y
 */
export function orient(geometry, axis = 'z') {
  if (axis === 'x') return place(geometry, { rot: [0, HALF_PI, 0] });
  if (axis === 'y') return place(geometry, { rot: [-HALF_PI, 0, 0] });
  return geometry;
}

// ---------------------------------------------------------------------------
// THE KIT
// ---------------------------------------------------------------------------

/**
 * 1. PANELLED SLAB — the default mass. A chamfered box; at full detail two raised
 * plates on the +Y face so a large flat reads as *plated* rather than as a
 * primitive. Centred on its own origin, long axis +Z.
 *
 * @returns {THREE.BufferGeometry} <= 28 tris (12 unchamfered, +24 with plates)
 */
export function panelledSlab({
  width = 40, height = 20, depth = 60, chamfer = 0, detail = DETAIL.FULL, plates = 0,
} = {}) {
  const c = Math.min(chamfer, width * 0.45, height * 0.45);
  const profile = c > 0 && detail >= DETAIL.MID
    ? octProfile(width * 0.5, height * 0.5, -height * 0.5, c, c, c)
    : rectProfile(width, height);
  const body = prism(profile, -depth * 0.5, depth * 0.5);
  if (!plates || detail < DETAIL.FULL) return body;

  const parts = [{ geo: body }];
  const step = depth / (plates + 1);
  const pg = prism(rectProfile(width * 0.62, 1.6), -step * 0.34, step * 0.34);
  for (let i = 0; i < plates; i++) {
    parts.push({ geo: pg, pos: [0, height * 0.5 + 0.6, -depth * 0.5 + step * (i + 1)] });
  }
  return mergeParts(parts);
}

/**
 * 1b. BEVEL BOX — what `panelledSlab` should have been for anything over 40 metres.
 *
 * A `panelledSlab` is a rectangular prism. Even chamfered it keeps its two ENDS as
 * flat +-Z rectangles and its four long faces exactly on +-X / +-Y, so 100% of its
 * surface area is axis-aligned. Ninety-nine of those in a stack is what
 * `docs/probes/cruiser.png` was, and it is why the player cruiser measured 74% of its
 * area within 5 degrees of a cardinal axis - boxier than any faction capital in its
 * own fleet.
 *
 * This is the same mass with all twelve edges taken off AND both ends drafted, so the
 * end caps stop being square to the axis. A rail 320 m long with a 6% end draft has
 * its two ends 3.4 degrees off - not enough. `draft` is therefore authored as an
 * ANGLE-equivalent inset per end and the default is deliberately generous.
 *
 * It costs 60 triangles against `panelledSlab`'s 12, which under the lifted triangle
 * budget is nothing, and it is most of why the player cruiser moved from 67.8% of its
 * surface area within 5 degrees of a cardinal axis to 32.1%. The other half is the
 * hull loft itself; these are the bolt-ons.
 *
 * @param {number} [p.chamfer]  corner cut on the four long edges, metres
 * @param {number} [p.draft]    how far each end face is inset, metres. The end cap
 *                              shrinks by this much in x and y, so the end is a
 *                              raked frustum face rather than a square transom.
 * @param {number} [p.cant]     roll of the SECTION about +Z, radians. This is the
 *                              cheapest single number in the kit: at 0.10 rad every
 *                              one of the four long faces is 5.7 degrees off its
 *                              axis, for exactly zero extra triangles, and a plate
 *                              that is not square to the world is what separates
 *                              "assembled from salvage" from "extruded in CAD".
 * @param {number} [p.rake]     y-shift of the +Z end relative to the -Z end, metres.
 *                              A mass whose top is not parallel to its bottom.
 * @returns {THREE.BufferGeometry} 28 chamfered, 60 with draft or rake, 12 at DETAIL.FAR
 */
export function bevelBox({
  width = 40, height = 20, depth = 60, chamfer = 6, draft = 0, cant = 0, rake = 0,
  detail = DETAIL.FULL,
} = {}) {
  const c = Math.min(chamfer, width * 0.45, height * 0.45);
  const roll = (pts) => {
    if (!cant) return pts;
    const s = Math.sin(cant), k = Math.cos(cant);
    return pts.map(([x, y]) => [x * k - y * s, x * s + y * k]);
  };
  if (detail < DETAIL.MID || c <= 0) {
    return prism(roll(rectProfile(width, height)), -depth * 0.5, depth * 0.5);
  }
  const sec = (w, h, cc) => roll(octProfile(w * 0.5, h * 0.5, -h * 0.5, cc, cc, cc));
  const dr = Math.max(0, Math.min(draft, width * 0.4, height * 0.4));
  if (dr <= 0 && rake === 0) return prism(sec(width, height, c), -depth * 0.5, depth * 0.5);
  const sx = (width - dr * 2) / width;
  const sy = (height - dr * 2) / height;
  const mid = sec(width, height, c);
  const end = sec(width - dr * 2, height - dr * 2, c * Math.min(sx, sy));
  const off = (pts, dy) => pts.map(([x, y]) => [x, y + dy]);
  // Four stations, so the draft is a real bevel at each end rather than a taper over
  // the whole length: the mass keeps its section for the middle 80% of its run.
  const q = depth * 0.5, m = depth * 0.4;
  return loft([
    { z: -q, points: off(end, -rake * 0.5) },
    { z: -m, points: off(mid, -rake * 0.4) },
    { z: m, points: off(mid, rake * 0.4) },
    { z: q, points: off(end, rake * 0.5) },
  ]);
}

/**
 * 2. TAPERED WEDGE — prow blades, buttresses, engine fairings. Runs from z=0 to
 * z=length; the far end can be narrower, shorter and vertically sheared, which is
 * what makes a wedge read as *pointing* rather than merely being smaller.
 *
 * @returns {THREE.BufferGeometry} 12 tris (20 with a chamfered leading edge)
 */
export function taperedWedge({
  length = 80, width0 = 60, height0 = 40, width1 = 20, height1 = 12,
  shear = 0, chamfer = 0, detail = DETAIL.FULL,
} = {}) {
  const c = chamfer > 0 && detail >= DETAIL.FULL ? Math.min(chamfer, width1 * 0.45, height1 * 0.45) : 0;
  const p0 = c > 0
    ? octProfile(width0 * 0.5, height0 * 0.5, -height0 * 0.5, c, c, c)
    : rectProfile(width0, height0);
  const p1 = c > 0
    ? octProfile(width1 * 0.5, height1 * 0.5 + shear, -height1 * 0.5 + shear, c * (width1 / width0), c, c)
    : rectProfile(width1, height1, 0, shear);
  return loft([{ z: 0, points: p0 }, { z: length, points: p1 }]);
}

/**
 * 3. HEXAGONAL STRUT — exposed structure. The single most important primitive in
 * this game's vocabulary: a hull that shows its skeleton reads as unfinished, and
 * unfinished is the whole progression fantasy. Flat-topped hex, along `axis`.
 *
 * @returns {THREE.BufferGeometry} 20 tris capped, 12 open
 */
export function hexStrut({
  length = 60, radius = 6, radiusEnd = null, axis = 'y', caps = true, detail = DETAIL.FULL,
} = {}) {
  const sides = detail >= DETAIL.MID ? 6 : 4;
  const rot = Math.PI / sides;
  const r1 = radiusEnd ?? radius;
  const g = loft(
    [{ z: 0, points: ngonProfile(radius, sides, rot) }, { z: length, points: ngonProfile(r1, sides, rot) }],
    { capFront: caps, capBack: caps },
  );
  return orient(g, axis);
}

/**
 * 4. PIPE RUN — conduit, fuel line, coolant trunk. Optional flange rings at the
 * ends; a bare tube reads as a cylinder, a flanged one reads as plumbing.
 *
 * @returns {THREE.BufferGeometry} <= 44 tris
 */
export function pipeRun({
  length = 80, radius = 5, sides = 6, axis = 'z', caps = true, flanges = 0, detail = DETAIL.FULL,
} = {}) {
  const n = detail >= DETAIL.MID ? sides : 4;
  const prof = ngonProfile(radius, n, Math.PI / n);
  const parts = [{ geo: prism(prof, 0, length, { capFront: caps, capBack: caps }) }];
  if (flanges > 0 && detail >= DETAIL.FULL) {
    const fp = ngonProfile(radius * 1.45, n, Math.PI / n);
    const fw = Math.min(4, length * 0.08);
    for (let i = 0; i < flanges; i++) {
      const t = flanges === 1 ? 0.5 : i / (flanges - 1);
      const z = fw + t * (length - fw * 2);
      parts.push({ geo: prism(fp, z - fw, z + fw, { capFront: false, capBack: false }) });
    }
  }
  return orient(mergeParts(parts), axis);
}

/**
 * 5. RADIATOR FIN — the cheapest silhouette-breaker there is. A swept plate in the
 * ZY plane extruded across X. Heat radiators are the one piece of hard science a
 * space warship visibly needs, and a rank of them reads as *engineering* from four
 * kilometres out.
 *
 * Root edge lies on y=0 spanning z in [0, chord]; tip at y=span, swept aft by
 * `sweep` and shortened by `tipChord`.
 *
 * @returns {THREE.BufferGeometry} 12 tris (36 with ribs)
 */
export function radiatorFin({
  chord = 120, span = 90, thickness = 5, sweep = -40, tipChord = null, ribs = 0,
  rim = 0, detail = DETAIL.FULL,
} = {}) {
  const tc = tipChord ?? chord * 0.7;
  // Outline in XY (x plays the role of z), CCW seen from +Z, then oriented to X.
  const outline = [
    [0, 0], [chord, 0], [sweep + tc, span], [sweep, span],
  ];
  const parts = [{ geo: prism(outline, -thickness * 0.5, thickness * 0.5) }];
  // EDGE RIM. A radiator panel drawn as a bare slab reads as a sheet of tarpaulin:
  // its silhouette is a quadrilateral with no thickness cue anywhere except the two
  // end caps, which face away from the camera most of the time. A rim that stands
  // proud of both faces gives the plate an EDGE - a narrow band at a different
  // orientation, so it takes a different value under any key and the panel reads as
  // installed hardware rather than as a painted quad. 24 triangles, and it is the
  // difference between "radiator" and "pool cover".
  if (rim > 0 && detail >= DETAIL.MID) {
    const t2 = thickness * 0.5 + rim * 0.55;
    const spar = (ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * rim * 0.5, ny = dx / len * rim * 0.5;
      return prism([
        [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny],
      ], -t2, t2, { capFront: false, capBack: false });
    };
    parts.push({ geo: spar(sweep, span, sweep + tc, span) });      // tip spar
    if (detail >= DETAIL.FULL) parts.push({ geo: spar(chord, 0, sweep + tc, span) });
  }
  if (ribs > 0 && detail >= DETAIL.FULL) {
    for (let i = 0; i < ribs; i++) {
      const t = (i + 1) / (ribs + 1);
      const y = span * t;
      const x0 = sweep * t;
      const x1 = x0 + chord + (tc - chord) * t;
      parts.push({
        geo: prism([[x0, y - 1.6], [x1, y - 1.6], [x1, y + 1.6], [x0, y + 1.6]],
          -thickness * 0.9, thickness * 0.9),
      });
    }
  }
  // XY outline -> ZY plane: the primitive's +X becomes +Z, so a NEGATIVE sweep
  // trails the tip aft, which is what "swept" has to mean on a ship.
  return place(mergeParts(parts), { rot: [0, -HALF_PI, 0] });
}

/**
 * 6. SENSOR DISH — faceted, concave, mounted facing +Z. Deliberately low-sided:
 * a smooth dish would be the only smooth thing on the ship and would read as an
 * import from another game.
 *
 * @returns {THREE.BufferGeometry} <= 30 tris
 */
export function sensorDish({ radius = 26, depth = 12, sides = 10, stub = 10, detail = DETAIL.FULL } = {}) {
  const n = detail >= DETAIL.FULL ? sides : Math.max(6, Math.round(sides * 0.6));
  const rim = ngonProfile(radius, n, Math.PI / n);
  const verts = [];
  const push = (p) => verts.push(p[0], p[1], p[2]);
  const apex = [0, 0, -depth];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = [rim[i][0], rim[i][1], 0];
    const b = [rim[j][0], rim[j][1], 0];
    push(apex); push(a); push(b);          // concave face, normals toward +Z
    push(apex); push(b); push(a);          // convex back
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  const dish = normalizeAttrs(g);
  if (stub <= 0 || detail < DETAIL.MID) return dish;
  return mergeParts([
    { geo: dish },
    { geo: prism(ngonProfile(radius * 0.13, 4, Math.PI / 4), -depth - stub, -depth * 0.5) },
  ]);
}

/**
 * 7. THRUSTER BELL — a frustum opening toward -Z (aft, in ship space) with the
 * throat at z=0. At detail >= MID an inner shell is built with reversed winding so
 * looking into the bell shows a lit interior rather than backface void.
 *
 * @returns {THREE.BufferGeometry} <= 44 tris
 */
export function thrusterBell({
  throat = 24, mouth = 40, length = 60, sides = 8, collar = true, inner = true, detail = DETAIL.FULL,
} = {}) {
  const n = detail >= DETAIL.FULL ? sides : Math.max(5, Math.round(sides * 0.66));
  const rot = Math.PI / n;
  const outer = loft([
    { z: -length, points: ngonProfile(mouth, n, rot) },
    { z: 0, points: ngonProfile(throat, n, rot) },
  ], { capFront: true, capBack: false });
  const parts = [{ geo: outer }];
  if (inner && detail >= DETAIL.MID) {
    parts.push({
      geo: loft([
        { z: -length, points: ngonProfile(mouth * 0.94, n, rot) },
        { z: -length * 0.06, points: ngonProfile(throat * 0.9, n, rot) },
      ], { capFront: true, capBack: false, flip: true }),
    });
  }
  if (collar && detail >= DETAIL.FULL) {
    parts.push({
      geo: prism(ngonProfile(mouth * 1.07, n, rot), -length, -length + Math.min(6, length * 0.12),
        { capFront: false, capBack: false }),
    });
  }
  return mergeParts(parts);
}

/**
 * 8. ARMOUR BELT — a run of separate plates along +Z with visible gaps. The gaps
 * are the point: a continuous strip is a stripe, a run of plates is armour.
 * Centred on the origin, plate faces looking +X.
 *
 * @returns {THREE.BufferGeometry} 12 tris per plate
 */
export function armourBelt({
  length = 400, height = 44, thickness = 10, plates = 4, gap = 12, chamfer = 6, detail = DETAIL.FULL,
} = {}) {
  const n = detail >= DETAIL.MID ? plates : Math.max(1, Math.round(plates * 0.5));
  const seg = (length - gap * (n - 1)) / n;
  const c = detail >= DETAIL.FULL ? Math.min(chamfer, height * 0.3) : 0;
  const prof = c > 0
    ? [[thickness * 0.5, -height * 0.5 + c], [thickness * 0.5, height * 0.5 - c],
      [-thickness * 0.5, height * 0.5], [-thickness * 0.5, -height * 0.5]]
    : rectProfile(thickness, height);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const z0 = -length * 0.5 + i * (seg + gap);
    parts.push({ geo: prism(prof, z0, z0 + seg) });
  }
  return mergeParts(parts);
}

/**
 * 9. HULL RIBS — transverse frames. Used inside open bays and under exposed decks:
 * the ribs are what tell the eye it is looking *into* a structure.
 *
 * @returns {THREE.BufferGeometry} 12 tris per rib
 */
export function hullRibs({
  count = 5, spacing = 90, span = 200, height = 16, thickness = 10, taper = 0.85, detail = DETAIL.FULL,
} = {}) {
  const n = detail >= DETAIL.MID ? count : Math.max(2, Math.ceil(count * 0.5));
  const step = detail >= DETAIL.MID ? spacing : spacing * (count / n);
  const parts = [];
  const z0 = -((n - 1) * step) * 0.5;
  for (let i = 0; i < n; i++) {
    const w = span * (1 - (1 - taper) * Math.abs((i / Math.max(1, n - 1)) * 2 - 1));
    parts.push({ geo: prism(rectProfile(w, height), z0 + i * step - thickness * 0.5, z0 + i * step + thickness * 0.5) });
  }
  return mergeParts(parts);
}

/**
 * 10. ANTENNA MAST — a tapered hex tower with cross spars, along +Y. Reads as a
 * sensor array from any distance and costs almost nothing.
 *
 * @returns {THREE.BufferGeometry} <= 56 tris
 */
export function antennaMast({
  height = 120, radius = 7, tipRadius = 3, spars = 3, sparSpan = 40, detail = DETAIL.FULL,
} = {}) {
  const parts = [{ geo: hexStrut({ length: height, radius, radiusEnd: tipRadius, axis: 'y', detail }) }];
  const n = detail >= DETAIL.FULL ? spars : Math.min(1, spars);
  for (let i = 0; i < n; i++) {
    const t = 0.42 + (i / Math.max(1, n)) * 0.5;
    const y = height * t;
    const s = sparSpan * (1 - t * 0.55);
    parts.push({
      geo: prism(rectProfile(2.6, 2.6), -s, s),
      pos: [0, y, 0],
      rot: [0, i % 2 === 0 ? 0 : HALF_PI, 0],
    });
  }
  return mergeParts(parts);
}

/**
 * 11. BLAST DOOR — a recessed hatch in a flank or deck: a sunken plate with a
 * raised frame lip and a centre seam. Facing +Z, sitting at z=0.
 *
 * @returns {THREE.BufferGeometry} <= 36 tris
 */
export function blastDoor({ width = 60, height = 40, depth = 4, seam = true, detail = DETAIL.FULL } = {}) {
  const parts = [{ geo: prism(rectProfile(width, height), -depth, -depth * 0.25) }];
  if (detail >= DETAIL.MID) {
    // Raised lip: a slightly larger, shallower plate behind the door leaf.
    parts.push({ geo: prism(rectProfile(width * 1.1, height * 1.14), -depth * 1.4, -depth * 0.9) });
  }
  if (seam && detail >= DETAIL.FULL) {
    parts.push({ geo: prism(rectProfile(2.4, height * 0.92), -depth * 0.3, depth * 0.2) });
  }
  return mergeParts(parts);
}

/**
 * 12. DOCKING COLLAR — an n-sided ring facing +Z. Doubles as the bolt ring on an
 * empty mount, which is why every unoccupied hardpoint on the cruiser wears one:
 * a flat plate reads as hull, a bolt ring reads as *somewhere a thing goes*.
 *
 * @returns {THREE.BufferGeometry} <= 48 tris
 */
export function dockingCollar({
  radius = 30, innerRadius = null, depth = 8, sides = 6, inner = false, detail = DETAIL.FULL,
} = {}) {
  const n = detail >= DETAIL.FULL ? sides : Math.max(4, Math.round(sides * 0.7));
  const rot = Math.PI / n;
  const ri = innerRadius ?? radius * 0.66;
  const outerP = ngonProfile(radius, n, rot);
  const innerP = ngonProfile(ri, n, rot);
  // Outer wall, open at the base because it always sits flush on something.
  const parts = [{ geo: prism(outerP, 0, depth, { capFront: false, capBack: false }) }];
  parts.push({ geo: ringFace(outerP, innerP, depth) });
  // The inner wall is only visible if the collar is a real hole in a real plate;
  // on a bolt ring sitting on a solid pad it is 12 wasted triangles per mount.
  if (inner && detail >= DETAIL.FULL) {
    parts.push({ geo: prism(innerP, 0, depth, { capFront: false, capBack: false, flip: true }) });
  }
  return mergeParts(parts);
}

/**
 * Flat annulus between two same-cardinality profiles at height z, facing +Z.
 * `facingBack` flips it to face -Z. Used for recessed faces: collar rims, the
 * cruiser's drive-well mouth, any hole cut in a flat plate.
 */
export function ringFace(outer, inner, z = 0, facingBack = false) {
  const verts = [];
  const n = outer.length;
  if (inner.length !== n) throw new Error('[greeble] ringFace needs matching point counts');
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const o1 = [outer[i][0], outer[i][1], z], o2 = [outer[j][0], outer[j][1], z];
    const i1 = [inner[i][0], inner[i][1], z], i2 = [inner[j][0], inner[j][1], z];
    if (facingBack) { verts.push(...i1, ...o2, ...o1, ...i1, ...i2, ...o2); }
    else { verts.push(...i1, ...o1, ...o2, ...i1, ...o2, ...i2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.computeVertexNormals();
  return normalizeAttrs(g);
}

/**
 * BONUS 12b. RECESS — a rectangular hole cut into a surface: four inward-facing
 * walls and a back plate, opening toward +Z at z = 0 and sinking to z = -depth.
 *
 * This is the primitive §3 of the design doc is really asking for when it says
 * "if you want greeble somewhere, cut a recess for it first". A recess is the only
 * cheap way to get a self-shadowing dark value on a hull: the walls face four
 * different directions, so at least two of them are always turned away from the key,
 * and the aperture reads as a hole rather than as a painted rectangle. It is also
 * the whole scale cue - a 54 m hangar mouth beside an 18 m fighter says "1400 metres"
 * in a way no amount of panel line ever will.
 *
 * DELIBERATELY BOTTOMLESS. There is no back plate: the aperture is meant to be sunk
 * into a closed hull loft, and the hull's own skin is what you see at the end of the
 * tunnel. A back plate would either z-fight with that skin or float in front of it,
 * and a hole whose floor is the actual hull is both cheaper and more honest.
 *
 * `wall` is how far the housing stands proud of the surface it is bolted to, which is
 * what gives the mouth an edge at a grazing angle.
 *
 * @returns {THREE.BufferGeometry} 24 tris
 */
export function recess({ width = 60, height = 40, depth = 26, wall = 8, detail = DETAIL.FULL } = {}) {
  const inner = rectProfile(width, height);
  const outer = rectProfile(width + wall * 2, height + wall * 2);
  const parts = [
    // Inward-facing tunnel walls: you look INTO these.
    { geo: prism(inner, -depth, 0, { capFront: false, capBack: false, flip: true }) },
    // The mouth face, an annulus, so nothing solid crosses the aperture.
    { geo: ringFace(outer, inner, 0) },
  ];
  // Outward-facing housing sides, so the aperture stands proud and has an edge.
  if (detail >= DETAIL.MID) {
    parts.push({ geo: prism(outer, -depth, 0, { capFront: false, capBack: false }) });
  }
  return mergeParts(parts);
}

/**
 * BONUS 13. CAPPED CONDUIT — a stub of pipe with a bolted blank on the end. This
 * is the single clearest way to say "something was meant to plug in here and has
 * not". Along +Z, cap at the far end.
 *
 * @returns {THREE.BufferGeometry} <= 20 tris
 */
export function cappedConduit({ length = 22, radius = 5, sides = 6, axis = 'z', detail = DETAIL.FULL } = {}) {
  const n = detail >= DETAIL.MID ? sides : 4;
  const rot = Math.PI / n;
  // A tube that flares out into a bolted blank. One loft, one cap: 16 triangles,
  // because there are a lot of these on a hull and they must stay nearly free.
  const g = loft([
    { z: 0, points: ngonProfile(radius, n, rot) },
    { z: length, points: ngonProfile(radius * 1.35, n, rot) },
  ], { capFront: true, capBack: false });
  return orient(g, axis);
}

/**
 * BONUS 14. MOUNT PAD — the flat bed an empty hardpoint sits on: a low chamfered
 * plinth. Pair it with a dockingCollar and a few cappedConduits and the player
 * reads "this is where the gun goes" without a single line of UI.
 *
 * @returns {THREE.BufferGeometry} <= 22 tris
 */
export function mountPad({ radius = 40, height = 8, sides = 8, detail = DETAIL.FULL } = {}) {
  const n = detail >= DETAIL.FULL ? sides : Math.max(4, Math.round(sides * 0.6));
  const g = loft([
    { z: 0, points: ngonProfile(radius, n, Math.PI / n) },
    { z: height, points: ngonProfile(radius * 0.88, n, Math.PI / n) },
  ], { capFront: true, capBack: false });
  return orient(g, 'y');
}

/**
 * BONUS 15. GREEBLE BAND — a run of mismatched machinery boxes along +Z, sitting on
 * the XZ plane and growing +Y.
 *
 * This primitive exists to enforce a rule rather than to draw a shape. Dense detail
 * on a capital hull only reads if it is CONCENTRATED IN BANDS at joints, in recesses
 * and around machinery, with large calm armour faces in between for it to be dense
 * *against*; scattered evenly it dissolves into one mid-frequency mush at every
 * distance past about three kilometres. Making a band the unit of authoring means the
 * 60/30/10 calm/medium/dense split is something you can count instead of something
 * you hope for.
 *
 * Deterministic: every dimension comes from `rng`, never from Math.random, so a seed
 * reproduces the hull exactly.
 *
 * @returns {THREE.BufferGeometry} 12 tris per box, plus 16 per conduit
 */
export function greebleBand({
  length = 200, width = 55, height = 16, boxes = 4, conduits = 0, rng, detail = DETAIL.FULL,
} = {}) {
  if (!rng?.range) throw new Error('[greeble] greebleBand needs an RNG (never Math.random)');
  const n = detail >= DETAIL.FULL ? boxes : Math.max(1, Math.ceil(boxes * 0.5));
  const parts = [];
  const step = length / n;
  for (let i = 0; i < n; i++) {
    const w = width * rng.range(0.34, 0.92);
    const d = step * rng.range(0.42, 0.86);
    const h = height * rng.range(0.45, 1.0);
    parts.push({
      geo: prism(rectProfile(w, h), -d * 0.5, d * 0.5),
      pos: [width * rng.range(-0.22, 0.22), h * 0.5, -length * 0.5 + step * (i + 0.5)],
    });
  }
  const c = detail >= DETAIL.FULL ? conduits : 0;
  for (let i = 0; i < c; i++) {
    const len = height * rng.range(0.8, 1.7);
    parts.push({
      geo: cappedConduit({ length: len, radius: Math.max(2, height * 0.16), axis: 'y', detail }),
      pos: [width * rng.range(-0.3, 0.3), 0, length * rng.range(-0.42, 0.42)],
    });
  }
  return mergeParts(parts);
}

/**
 * Rebuild a geometry mirrored across the YZ plane (x -> -x) with the winding order
 * reversed, so it can be used under an ordinary positive-determinant transform.
 *
 * This exists because `scale.x = -1` inverts face winding: three's normal matrix
 * flips the *normals* correctly but the rasteriser then culls the wrong faces, and
 * the module looks hollow. Mirroring the geometry instead is the only fix that
 * survives shadow maps and depth prepasses.
 */
export function mirrorGeometryX(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const count = pos.count;
  const p = new Float32Array(count * 3);
  const nn = nor ? new Float32Array(count * 3) : null;
  const uu = uv ? new Float32Array(count * 2) : null;
  // Reverse each triangle's vertex order while negating x.
  for (let t = 0; t < count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const src = t + (2 - k);
      const dst = t + k;
      p[dst * 3] = -pos.getX(src); p[dst * 3 + 1] = pos.getY(src); p[dst * 3 + 2] = pos.getZ(src);
      if (nn) { nn[dst * 3] = -nor.getX(src); nn[dst * 3 + 1] = nor.getY(src); nn[dst * 3 + 2] = nor.getZ(src); }
      if (uu) { uu[dst * 2] = uv.getX(src); uu[dst * 2 + 1] = uv.getY(src); }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (nn) out.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  if (uu) out.setAttribute('uv', new THREE.BufferAttribute(uu, 2));
  if (!nn) out.computeVertexNormals();
  return out;
}
