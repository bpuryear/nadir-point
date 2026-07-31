/**
 * THE MODULE KIT — shared plumbing every bolt-on module is built with.
 *
 * A module is a piece of somebody else's warship that the crew cut free and welded
 * onto the Nadir. Three things have to be true of all twenty-four of them, and this
 * file is what makes them true once instead of twenty-four times:
 *
 *   1. IT LOOKS LIKE THE FACTION IT CAME FROM. Not by hue alone — by material
 *      behaviour and emissive colour too, because half the time the ship is a
 *      silhouette against a gas giant. `materialFor()` is the only route to a
 *      material; it maps five abstract surfaces onto the shared registry and picks
 *      a per-faction wear level. Nobody in this stream calls `new THREE.Material`.
 *
 *   2. IT TELLS YOU HOW BIG IT IS. Every module wears running lights at EXACTLY
 *      `MODULE_LIGHT_SPACING_M` = 20 m, which is half the cruiser's 40 m hull
 *      station spacing (cruiser.js#RUNNING_LIGHT_AXIS_SPACING_M). The two rhythms
 *      are harmonically locked: two module lamps per hull lamp, everywhere, on
 *      every module, forever. That is the only thing in a vacuum that says whether
 *      the lump you are looking at is 30 m or 300 m across, so it is not decoration
 *      and it is not adjustable per module. At LOD1 the run thins to every 40 m —
 *      still a constant, still the same rhythm, half the quads.
 *
 *   3. IT COSTS WHAT IT SAYS IT COSTS. `ModuleBuilder.finish()` counts triangles
 *      into `userData.triangles` so the audit in index.js can assert the 400
 *      ceiling from units.js#BUDGET.moduleTris without a browser.
 *
 * AUTHORING CONVENTION — see hardpoints.js §2, which this file does not repeat:
 * ship space, +Z forward, +Y up, +X starboard, origin AT THE MOUNT POINT. Port
 * modules are authored port-side only; the attachment system mirrors them.
 */

import * as THREE from 'three';
import * as G from '../greeble.js';
import { BUDGET, SCALE_CUE } from '../../../core/units.js';

/**
 * Module running lights, at the SAME spacing as every hull in the game.
 *
 * This was 20 m - deliberately half the hull's 40 m, so a salvaged module carried a
 * different rhythm from the ship it was bolted to. That is a nice idea and it breaks
 * the scale cue: a player who has learned "one beacon is 40 m" and then counts beacons
 * along a module reads it as twice its real length. Two rhythms on one silhouette do
 * not communicate two things, they stop communicating anything. Faction identity is
 * carried by hue, structure and material instead, where it costs nothing.
 */
export const MODULE_LIGHT_SPACING_M = SCALE_CUE.runningLightSpacingM;
/** Lamp face size, metres. Constant too — a lamp that scales is a lamp that lies. */
export const MODULE_LIGHT_SIZE_M = 4.6;
/** Hard ceiling from units.js. Every module declares this as its triBudget. */
export const MODULE_TRI_BUDGET = BUDGET.moduleTris;

/**
 * Base wear per faction. Coalition is field-repaired and filthy, Concord is
 * maintained, derelict has been oxidising since before anyone was born.
 * The registry quantises to 0.125 steps, so these collapse to few materials.
 */
const WEAR = { coalition: 0.6, concord: 0.25, derelict: 0.85, player: 0.5 };

/**
 * Surfaces a module may use. Five, deliberately — the same five the cruiser uses.
 * A sixth would be a new visual language, and the whole art direction is that
 * mismatched salvage reads as one object because the vocabulary is constrained.
 *
 *   hull     the primary mass
 *   plating  brighter armour laid over the mass — this is where the key light lands
 *   dark     recesses, bay interiors, structure seen through a gap
 *   greeble  mechanism: barrels, struts, pipes, hinges
 *   trim     bolt rings and hazard banding, the identity carrier
 */
export const SURFACES = ['hull', 'plating', 'dark', 'greeble', 'trim'];

/**
 * Derelict hulls get ONE eroded surface, not two: `derelictHull` in the registry
 * already carries the pitting and the non-human panel layout, and splitting it
 * into hull + plating would just be two draw calls of the same material.
 */
export function resolveSurface(faction, surface) {
  if (faction === 'derelict' && surface === 'plating') return 'hull';
  return surface;
}

/** The ONLY way a module gets a material. See art/materials/index.js. */
export function materialFor(ctx, faction, surface) {
  const M = ctx.materials;
  if (!M?.get) throw new Error('[modules] ctx.materials must be the shared material registry');
  const w = WEAR[faction] ?? 0.5;
  switch (surface) {
    case 'hull':
      return faction === 'derelict'
        ? M.get('derelictHull', { wear: w, tier: 2 })
        : M.get('hull', { faction, wear: w, tier: 2 });
    case 'plating': return M.get('plating', { faction, wear: Math.max(0, w - 0.12), tier: 2 });
    case 'dark': return M.get('hullDark', { faction, wear: Math.min(1, w + 0.12), tier: 2 });
    case 'greeble': return M.get('greeble', { faction, wear: 0.55, tier: 1 });
    case 'trim': return M.get('trim', { faction, wear: 0.45, tier: 1 });
    case 'glass': return M.get('glass', { faction });
    default: throw new Error(`[modules] unknown surface "${surface}"`);
  }
}

// ---------------------------------------------------------------------------
// Emissive quads
// ---------------------------------------------------------------------------

const _n = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

/**
 * A flat square facing `normal`, centred on `pos`, wound so its front face looks
 * outward. Two triangles. Used for running lights only; emitters and exhausts use
 * `glowDisc` so the two never read as the same kind of light.
 */
export function faceQuad(pos, normal, size) {
  _n.set(normal[0], normal[1], normal[2]);
  if (_n.lengthSq() < 1e-9) _n.set(0, 1, 0);
  _n.normalize();
  const ref = Math.abs(_n.y) > 0.94 ? _Z : _Y;
  _r.crossVectors(ref, _n).normalize();
  _u.crossVectors(_n, _r).normalize();
  const h = size * 0.5;
  const p = (sx, sy) => [
    pos[0] + _r.x * sx * h + _u.x * sy * h,
    pos[1] + _r.y * sx * h + _u.y * sy * h,
    pos[2] + _r.z * sx * h + _u.z * sy * h,
  ];
  const a = p(-1, -1), b = p(1, -1), c = p(1, 1), d = p(-1, 1);
  const v = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** An additive disc with 0..1 UVs for the registry's glow texture. 8 triangles. */
export function glowDiscGeo(radius) {
  return new THREE.CircleGeometry(radius, 8);
}

// ---------------------------------------------------------------------------
// THE HULL'S OWN FORM LANGUAGE, made available to a module in three calls.
//
// A census across the five module files found this, and it is the whole diagnosis
// of "trash strewn on a decent hull" stated as a count:
//
//     G.panelledSlab  46      G.bevelBox      0
//     G.hexStrut      41      G.facetProfile  0
//     G.pipeRun       18      G.recess        0
//
// Zero uses of all three of the hull's shape-makers, and forty-six of the one thing
// `greeble.js:490-497` says a hull must not be built from: "a `panelledSlab` is a
// rectangular prism ... 100% of its surface area is axis-aligned. Ninety-nine of
// those in a stack is what `docs/probes/cruiser.png` WAS." So the modules were built
// out of the exact primitives the hull redesign spent five thousand triangles
// removing, which is why they read as scaffolding beside it however they are lit.
//
// The vocabulary already existed, in the same file, and no module called it. The four
// functions below are the reason that is now cheap: a module gets the hull's section,
// its structural-frame rhythm, its on-surface plate runs and its subtractive detail
// for one line each, instead of thirty lines of hand-rolled loft per module.
//
// The rules they implement (design/module-integration.md §2.2), and every one of them
// is a property of the hull measured by `ships/audit.mjs`:
//
//   M-F1  the primary mass is a LOFT of >= 3 `facetProfile` stations, not a prism
//   M-F2  the module carries its OWN KNUCKLE - one continuous chine at 80 +- 6 deg
//         of dihedral, `dark` below it and `plating`/`hull` above
//   M-F3  no dihedral in the 12-28 degree band anywhere. `facetProfile` guarantees
//         this: its five dihedrals are 6.2 / 35.3 / 80.8 / 32.6 / 10.6
//   M-F4  section beam : depth >= 1.6 on any mass over 80 m long
//   M-F5  two to four structural frames, 90-140 m apart and NEVER evenly
//   M-F6  at least one strake lying ON the module's own flank
//   M-F7  subtractive detail only - cut the recess, then put machinery in it
// ---------------------------------------------------------------------------

/** The hull's own dihedral at the knuckle, degrees. Modules echo it (M-F2). */
export const MODULE_CHINE = 80.8;

/**
 * A station row, in the same seven columns `cruiser.js#HULL_STATIONS` uses:
 * `[z, half, top, bottom, knuckle, deckFlat, flare]`. Writing a module's mass as a
 * table of these instead of as a stack of boxes is the entire change.
 */
export const massProfile = ([, half, top, bot, knuckle = 0.44, deckFlat = 0.50, flare = 0.9], keep = null) =>
  G.facetProfile({ maxHalf: half, top, bottom: bot, knuckle, deckFlat, flare, keep });

/** Linear interpolation of a module's own station table at an arbitrary z. */
export function massAt(rows, z) {
  let a = rows[0], b = rows[1] ?? rows[0];
  for (let i = 0; i < rows.length - 1; i++) {
    if (z >= rows[i][0] && z <= rows[i + 1][0]) { a = rows[i]; b = rows[i + 1]; break; }
  }
  if (z <= rows[0][0]) { a = b = rows[0]; }
  if (z >= rows[rows.length - 1][0]) { a = b = rows[rows.length - 1]; }
  const span = b[0] - a[0];
  const t = span === 0 ? 0 : (z - a[0]) / span;
  return a.map((v, i) => v + ((b[i] ?? v) - v) * t);
}

/**
 * M-F1 / M-F2 / M-F4: a module's primary mass, built the way the hull is built.
 *
 * One loft through the given stations of the hull's own twelve-point section, so the
 * mass arrives with a knuckle, a cambered deck, a keel with deadrise and not one
 * facet within five degrees of an axis - for the same triangle count a chamfered box
 * costs, and with the value split available for free at the knuckle.
 *
 * ASSERTS M-F4 rather than documenting it. A module mass over 80 m long whose section
 * is taller than 1/1.6 of its beam is from a different ship in the literal sense, and
 * the failure mode is that nobody notices until it is on the hull.
 */
export function massLoft(rows, {
  detail = 2, capFront = true, capBack = true, label = 'mass', keep = undefined,
} = {}) {
  // Twelve points at LOD0, twelve at LOD1 and eight at LOD2, exactly as the hull
  // does it (`greeble.js#FACET_LOD`): with six facets a side every point carries a
  // 33-degree chine or more, so dropping one moves the outline tens of metres.
  // `keep` is an explicit escape for a SECONDARY mass - a deck beam, a pod belly -
  // where 8 points is under a pixel and the module is at its ceiling.
  const card = keep !== undefined ? keep : (detail >= G.DETAIL.MID ? null : G.FACET_LOD.far);
  const len = Math.abs(rows[rows.length - 1][0] - rows[0][0]);
  if (len > 80) {
    for (const r of rows) {
      const ratio = (r[1] * 2) / Math.max(1e-3, r[2] - r[3]);
      if (ratio < 1.6) {
        throw new Error(`[modules] ${label} station z=${r[0]} has beam:depth ${ratio.toFixed(2)}, `
          + 'under M-F4\'s 1.6. The hull holds >= 1.96 at every station and averages 2.27; a module '
          + 'that is taller than it is wide does not read as a piece of the same fleet.');
      }
    }
  }
  return G.loft(rows.map((r) => ({ z: r[0], points: massProfile(r, card) })), { capFront, capBack });
}

/**
 * M-F5: structural frames, at the hull's rhythm. A 4 m step in the module's OWN
 * section at each z, built exactly as `cruiser.js` builds the hull's eight: the
 * profile at that station scaled 1.04 with the deck and keel pushed out.
 *
 * This is the cue that says "cut off a capital ship" rather than "modelled at 60 m
 * scale", and it is the cheapest one there is - 24 triangles a frame.
 */
export function massFrames(rows, zs, { detail = 2, scale = 1.04, push = 4 } = {}) {
  // A frame is a 4 m step, not an outline: the 8-point map costs it nothing and it
  // has to survive to LOD1, which is where the benchmark camera actually sits.
  const keep = detail >= G.DETAIL.FULL ? null : G.FACET_LOD.far;
  const parts = [];
  for (const z of zs) {
    const s = massAt(rows, z);
    const ring = (k) => massProfile(
      [z, s[1] * k, s[2] + (k - 1) * push * 25, s[3] - (k - 1) * push * 25, s[4], s[5], s[6]], keep,
    );
    parts.push({
      geo: G.loft([
        { z: z - 4, points: ring(1.0) }, { z: z - 2.4, points: ring(scale) },
        { z: z + 2.4, points: ring(scale) }, { z: z + 4, points: ring(1.0) },
      ], { capFront: false, capBack: false }),
    });
  }
  return G.mergeParts(parts);
}

/**
 * M-F6: a plate lying ON the module's own flank, cut from the module's own section.
 *
 * Same construction as `cruiser.js#skinPlate`, against the module's table: take the
 * two points bounding a facet at each station, inset along the facet, offset along
 * the facet's OUTWARD normal. A plate that is a straight bar at a fixed x on a body
 * whose section moves is the defect `cruiser.js:876-880` describes at length; this
 * cannot be that, because the plate IS the surface, offset.
 *
 * `drift` walks the plate across its facet as it runs, which is an angled plate that
 * has not left the surface (M-F8's 7-degree rule, built rather than faked).
 */
export function massStrake(rows, {
  z0, z1, side = 1, facet = [2, 1], t0 = 0.08, t1 = 0.92, drift = 0, out = 5, detail = 2,
}) {
  const zs = [z0];
  for (const r of rows) if (r[0] > z0 && r[0] < z1) zs.push(r[0]);
  zs.push(z1);
  const thin = detail >= G.DETAIL.FULL || zs.length <= 3
    ? zs : zs.filter((z, i) => i === 0 || i === zs.length - 1 || i % 2 === 0);
  const sgn = facet[1] > facet[0] ? 1 : -1;
  const span = (z1 - z0) || 1;
  return G.loft(thin.map((z) => {
    const P = massProfile(massAt(rows, z));
    const A = P[facet[0]], B = P[facet[1]];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (dy / l) * out * sgn, ny = (-dx / l) * out * sgn;
    const k = drift * ((z - z0) / span);
    const ta = Math.min(0.97, Math.max(0.03, t0 + k)), tb = Math.min(0.97, Math.max(0.03, t1 + k));
    let pts = [
      [A[0] + dx * ta, A[1] + dy * ta], [A[0] + dx * tb, A[1] + dy * tb],
      [A[0] + dx * tb + nx, A[1] + dy * tb + ny], [A[0] + dx * ta + nx, A[1] + dy * ta + ny],
    ].map(([x, y]) => [side * x, y]);
    let a2 = 0;
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a2 += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
    if (a2 < 0) pts = pts.slice().reverse();
    return { z, points: pts };
  }));
}

/**
 * M-F7: a recess cut INTO a facet of the module's own mass, lying on the surface and
 * facing along that facet's outward normal.
 *
 * `G.recess` is used zero times in the module stream today and it is the only cheap
 * way to get a self-shadowing dark value: the four walls face four directions, so at
 * least two are always turned away from the key, and the aperture reads as a hole
 * rather than as a painted rectangle. Additive greeble on a proud face does not do
 * this under any key, which is why §3 of the hull's own brief forbids it.
 */
export function massRecess(rows, {
  z, side = 1, facet = [2, 3], t = 0.5, width = 40, height = 20, depth = 12, wall = 4, detail = 2,
}) {
  const P = massProfile(massAt(rows, z));
  const A = P[facet[0]], B = P[facet[1]];
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const l = Math.hypot(dx, dy) || 1;
  const sgn = facet[1] > facet[0] ? 1 : -1;
  const nx = (dy / l) * sgn, ny = (-dx / l) * sgn;
  const px = A[0] + dx * t, py = A[1] + dy * t;
  // `recess` opens toward +Z at z = 0, so aim its +Z down the outward normal.
  return aimed(G.recess({ width, height, depth, wall, detail }),
    [side * nx, ny, 0], [side * px, py, z]);
}

// ---------------------------------------------------------------------------
// Shared sub-shapes. Anything two modules both want lives here, so the detail
// vocabulary stays one vocabulary.
// ---------------------------------------------------------------------------

/**
 * A gun barrel along +Z with the breech at z=0: a capped hex tube plus a muzzle
 * brake ring. 20 tris bare, 32 with the brake, 12/24 at MID.
 */
export function barrel({ length = 90, radius = 7, radiusEnd = null, brake = true, detail = 2 }) {
  const parts = [{
    geo: G.hexStrut({ length, radius, radiusEnd, axis: 'z', caps: true, detail }),
  }];
  if (brake) {
    parts.push({
      geo: G.hexStrut({
        length: Math.min(12, length * 0.16), radius: (radiusEnd ?? radius) * 1.45,
        axis: 'z', caps: false, detail,
      }),
      pos: [0, 0, length - Math.min(12, length * 0.16) * 1.6],
    });
  }
  return G.mergeParts(parts);
}

const _d = new THREE.Vector3();

/**
 * MUZZLE DECLARATIONS — where a gun's shots actually leave the module.
 *
 * A weapon module declares `muzzles: [[x,y,z], ...]` ON ITS ModuleDef, in module
 * space, one entry per `weapon.shotsPerBurst`. Three rules, and each of them is a
 * defect this project has already paid for:
 *
 *   1. IT IS DATA ON THE DEF, NEVER READ OFF THE BUILT MESH. `ModuleBuilder.glow`
 *      is LOD-gated behind `this.full` (lod === 0), so a mesh-derived emitter count
 *      changes with graphics quality — `port_beam_array` publishes three glow discs
 *      at LOD0 and one at LOD1/2. A simulation quantity that moves when the player
 *      drags a quality slider is a broken seed. The declared list is the LOD0 set
 *      and it does not vary.
 *   2. IT IS FREE. A glow disc is 8 real triangles (`glowDiscGeo`) against a 400-tri
 *      module ceiling; an array of numbers costs nothing and shows up nowhere in
 *      `tools/probe.mjs cruiser`.
 *   3. IT IS COMPUTED FROM THE SAME LITERALS THE GEOMETRY USES, not typed a second
 *      time. This file's own hardest-won rule, stated at broadside.js's flak
 *      cluster: "a number typed by hand is a number that stops being right the first
 *      time either end moves." Every muzzle table below therefore reads the same
 *      barrel-root and barrel-length constants the `build()` that draws them reads.
 *
 * The consumer is the salvo controller (Wave 2), which transforms each entry by the
 * mount's local position and the ship's heading, and mirrors x for a port-authored
 * module fitted to starboard — exactly as `mirrorX` does to the geometry.
 */

/**
 * The tip of a primitive of `length` struck from `root` down `dir`.
 *
 * This is the muzzle counterpart of `aimed()`: `aimed(barrel({length: L}), d, p)`
 * puts the breech at `p` and the muzzle at `muzzleAlong(p, d, L)`. `dir` need not
 * be normalised — it is the same unnormalised triple the geometry call site passes.
 *
 * @param {number[]} root    where the primitive's origin sits, module space
 * @param {number[]} dir     direction its +Z axis was aimed down
 * @param {number} length    metres along that direction
 * @returns {[number,number,number]} the tip, module space
 */
export function muzzleAlong(root, dir, length) {
  const m = Math.hypot(dir[0], dir[1], dir[2]);
  const k = m > 1e-9 ? length / m : 0;
  return [root[0] + dir[0] * k, root[1] + dir[1] * k, root[2] + dir[2] * k];
}

/**
 * Point a +Z-authored primitive down an arbitrary direction and place it.
 *
 * Every splayed strut, canted horn and fanned barrel in this stream goes through
 * here rather than through a hand-written Euler triple. Composing two rotations in
 * one XYZ Euler is the single most reliable way to produce a part that is 12
 * degrees wrong in a way nobody notices until the module is on the ship — so the
 * two rotations are applied as two separate transforms instead, where the order is
 * written down and cannot be misread.
 *
 * @param {THREE.BufferGeometry} geo  authored along +Z from the origin
 * @param {number[]} dir              direction the +Z axis should end up pointing
 * @param {number[]} pos              where the origin ends up
 */
export function aimed(geo, dir, pos = [0, 0, 0]) {
  _d.set(dir[0], dir[1], dir[2]);
  if (_d.lengthSq() < 1e-9) _d.set(0, 0, 1);
  _d.normalize();
  const yaw = Math.atan2(_d.x, _d.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, _d.y)));
  return G.place(G.place(geo, { rot: [pitch, 0, 0] }), { rot: [0, yaw, 0], pos });
}

/**
 * THE CUT EDGE. An irregular hexagon in the XY plane, deliberately NOT concentric
 * with the bolt ring it surrounds and with six unequal radii.
 *
 * This is the piece of the donor ship's own skin that came away with the module
 * when the crew cut it free. It matters because "a piece of somebody else's warship
 * welded onto yours" was, up to now, a claim the geometry never made: every module
 * met the hull at a perfect hexagonal collar and stopped, so a Coalition gun and a
 * derelict flak drum met the deck in exactly the same way and the foreign ones read
 * as texture corruption rather than as salvage. A torch cut is off-centre and it is
 * never round.
 *
 * Fixed radii, not RNG: a scale cue that changes between two builds of the same
 * module is not a cue, and this file has no seeded stream of its own.
 */
const CUT_RADII = [1.44, 1.06, 1.32, 1.52, 1.10, 1.26];

export function cutOutline(radius) {
  const ox = radius * 0.17, oy = -radius * 0.10;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.37;
    pts.push([ox + Math.cos(a) * radius * CUT_RADII[i], oy + Math.sin(a) * radius * CUT_RADII[i]]);
  }
  return pts;
}

/**
 * A closed ring band in the XY plane: outer wall, inner wall, two faces. This is
 * how the jump drive's field ring and the hangar's bay throats are built — a real
 * hole you can see through, for 8 triangles per side.
 */
export function ringBand({ outer = 120, inner = 90, z0 = 0, z1 = 20, sides = 10, detail = 2 }) {
  const n = detail >= G.DETAIL.MID ? sides : Math.max(5, Math.round(sides * 0.6));
  const rot = Math.PI / n;
  const O = G.ngonProfile(outer, n, rot);
  const I = G.ngonProfile(inner, n, rot);
  return G.mergeParts([
    { geo: G.prism(O, z0, z1, { capFront: false, capBack: false }) },
    { geo: G.prism(I, z0, z1, { capFront: false, capBack: false, flip: true }) },
    { geo: G.ringFace(O, I, z1, false) },
    { geo: G.ringFace(O, I, z0, true) },
  ]);
}

/**
 * A recessed opening in a flat face at z=0 looking +Z: a lined box you can see
 * INTO. Launch throats, torpedo tubes, drone racks. The lining is what stops an
 * opening reading as a black sticker.
 */
export function throat({ width = 60, height = 40, depth = 50, detail = 2 }) {
  const outer = G.rectProfile(width, height);
  const inner = G.rectProfile(width * 0.86, height * 0.86);
  const parts = [
    { geo: G.prism(outer, -depth, 0, { capFront: false, capBack: true, flip: true }) },
  ];
  if (detail >= G.DETAIL.FULL) {
    parts.push({ geo: G.prism(inner, -depth * 0.55, -depth * 0.5, { capFront: false, capBack: false }) });
  }
  return G.mergeParts(parts);
}

// ---------------------------------------------------------------------------
// ModuleBuilder
// ---------------------------------------------------------------------------

/**
 * Collects placed geometry per surface, merges each surface into ONE mesh, and
 * hands back a Group. A module is therefore 2-4 draw calls no matter how many
 * pieces it is built from, which is the only way six modules plus a 14-draw hull
 * fit inside the 320 draw-call ceiling.
 */
export class ModuleBuilder {
  /**
   * @param {import('../../../core/contracts.js').BuildContext} ctx
   * @param {string} faction  visual identity this part carries onto your hull
   */
  constructor(ctx, faction) {
    this.ctx = ctx;
    this.faction = faction;
    this.lod = Math.max(0, Math.min(2, ctx.lod ?? 0));
    /** greeble.js detail tier: 2 at LOD0, 1 at LOD1. */
    this.detail = G.detailForLod(this.lod);
    /** True only at LOD0. Fine mechanism lives behind this. */
    this.full = this.lod === 0;
    this.rng = ctx.rng ?? null;
    this._parts = new Map();
    this._lights = [];
    this._glows = [];
  }

  /** Place a geometry on a surface. `xf` is {pos,rot,scale} exactly as greeble.place. */
  add(surface, geo, xf = null) {
    if (!geo) return this;
    const s = resolveSurface(this.faction, surface);
    let list = this._parts.get(s);
    if (!list) { list = []; this._parts.set(s, list); }
    list.push(xf ? { geo, ...xf } : { geo });
    return this;
  }

  /**
   * THE GRAFT. Every module's root, in one shared vocabulary, replacing the bare
   * bolt ring each of them used to place by hand:
   *
   *   1. a CUT PLATE - the donor hull's own skin, torch-cut, off-centre, on the
   *      `dark` surface so the ragged edge reads as a recess against the plating;
   *   2. the BOLT RING, standing on the plate rather than on your deck;
   *   3. two WELD BEADS across the join at angles that agree with nothing.
   *
   * The whole point is that a Coalition gun, a Concord fairing and a derelict flak
   * drum all meet your hull the same way, because the crew that fitted them owned
   * one cutting torch and one welder. Without it the foreign palettes read as a
   * rendering artefact; with it they read as somebody's decision.
   *
   * `pos` and `rot` are exactly what the old dockingCollar call used, so the mount
   * face is unchanged. `beads: 0` for a module with no triangles to spare.
   *
   * @param {number[]} pos    mount point in module space
   * @param {number[]} rot    XYZ Euler that points the collar's +Z outward
   * @param {number} radius   bolt-ring radius, metres
   */
  graft(pos, rot, radius, { beads = 2 } = {}) {
    const D = this.detail;
    const plateH = Math.max(4, radius * 0.14);
    this.add('dark', G.prism(cutOutline(radius), 0, plateH), { pos, rot });
    this.add('trim', G.place(G.dockingCollar({
      radius: radius * 0.92, innerRadius: radius * 0.6, depth: 8, sides: 6, detail: D,
    }), { pos: [0, 0, plateH] }), { pos, rot });
    if (!this.full || beads <= 0) return this;
    for (let i = 0; i < beads; i++) {
      const a = 0.72 + i * 2.45;
      const rr = radius * 1.15;
      this.add('greeble', G.place(
        G.prism(G.rectProfile(radius * 0.66, radius * 0.19), 0, plateH * 0.75,
          { capFront: false, capBack: false }),
        { rot: [0, 0, a], pos: [Math.cos(a) * rr, Math.sin(a) * rr, 0] },
      ), { pos, rot });
    }
    return this;
  }

  /** One running lamp. Sits `standoff` metres proud so it never z-fights the plate. */
  light(pos, normal, standoff = 2.2) {
    const p = [
      pos[0] + normal[0] * standoff,
      pos[1] + normal[1] * standoff,
      pos[2] + normal[2] * standoff,
    ];
    this._lights.push(faceQuad(p, normal, MODULE_LIGHT_SIZE_M));
    return this;
  }

  /**
   * A run of lamps at EXACTLY MODULE_LIGHT_SPACING_M along a segment (double that
   * at LOD1). `max` caps the run so a 300 m barrel does not spend 30 quads; the
   * spacing never changes, only how far the run goes.
   */
  lightRun(from, to, normal, { max = 12 } = {}) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz);
    const step = MODULE_LIGHT_SPACING_M * (this.full ? 1 : 2);
    if (len < 1e-3) return this.light(from, normal);
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const n = Math.min(max, Math.floor(len / step) + 1);
    for (let i = 0; i < n; i++) {
      const d = i * step;
      this.light([from[0] + ux * d, from[1] + uy * d, from[2] + uz * d], normal);
    }
    return this;
  }

  /**
   * An emitter: muzzle, exhaust, tractor head, bay floodlight. Additive, textured,
   * deliberately a different *kind* of light from a running lamp so the player
   * never mistakes a working aperture for a scale cue.
   */
  glow(pos, radius, rot = [0, 0, 0]) {
    this._glows.push({ geo: glowDiscGeo(radius), pos, rot });
    return this;
  }

  /** As `glow`, but facing an arbitrary direction. See `aimed`. */
  glowDir(pos, radius, dir) {
    this._glows.push({ geo: aimed(glowDiscGeo(radius), dir, pos) });
    return this;
  }

  /** @returns {THREE.Group} with userData.triangles set. */
  finish(name = 'module') {
    const group = new THREE.Group();
    group.name = name;
    let tris = 0;

    for (const [surface, parts] of this._parts) {
      const geo = G.mergeParts(parts);
      if (!geo) continue;
      geo.name = `${name}:${surface}`;
      const mesh = new THREE.Mesh(geo, materialFor(this.ctx, this.faction, surface));
      mesh.name = `${name}:${surface}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      tris += G.triCount(geo);
    }

    if (this._lights.length) {
      const geo = G.mergeParts(this._lights.map((g) => ({ geo: g })), { uv: false });
      geo.name = `${name}:lights`;
      const mesh = new THREE.Mesh(geo, this.ctx.materials.get('emissive', {
        faction: this.faction, intensity: 2.0,
      }));
      mesh.name = `${name}:runningLights`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 2;
      mesh.userData.isRunningLight = true;
      group.add(mesh);
      tris += G.triCount(geo);
    }

    if (this._glows.length) {
      const geo = G.mergeParts(this._glows, { uv: false });
      geo.name = `${name}:glow`;
      const mesh = new THREE.Mesh(geo, this.ctx.materials.get('engineGlow', {
        faction: this.faction, intensity: 2.6,
      }));
      mesh.name = `${name}:glow`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 3;
      mesh.userData.isGlow = true;
      group.add(mesh);
      tris += G.triCount(geo);
    }

    group.userData.triangles = tris;
    group.userData.faction = this.faction;
    return group;
  }
}

// ---------------------------------------------------------------------------
// Outline measurement
// ---------------------------------------------------------------------------

/**
 * OUTLINE SIGNATURES OVER A SHARED AXIS.
 *
 * The acceptance criterion this exists for is "every module identifiable from
 * silhouette alone at max tactical zoom", which sat at PARTIAL with the honest
 * admission that the evidence was a contact sheet and not a measurement. This is
 * the measurement, and it is deliberately the same one the loadout probe uses:
 * bin along z, record half-beam, top and bottom per bin.
 *
 * THE SHARED AXIS IS THE POINT. `hardpoints.js#getSilhouetteSignature` bins over
 * the BARE hull's z range, so a bow module reaching to z = +966 on a hull that ends
 * at +702 has a quarter of a kilometre of itself folded into the last bin - and
 * overhang is exactly what a module is supposed to contribute. Binning every
 * variant of one mount over the union of their envelopes scores that overhang where
 * it is.
 *
 * @param {Array<{id:string, objects:THREE.Object3D[]}>} entries
 * @returns {Array<{id:string, bins:Array}>}
 */
export function outlineSignatures(entries, { bins = 32 } = {}) {
  const v = new THREE.Vector3();
  let zMin = Infinity, zMax = -Infinity;
  const each = (objects, fn) => {
    for (const root of objects) {
      // NOT enough on its own: this updates `root` and its descendants from
      // `root.parent.matrixWorld`, which is only correct if the caller has already
      // updated the hierarchy above it. Callers that hand in sockets' children must
      // call `updateMatrixWorld(true)` on the hull root first - see audit.mjs.
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
        const pos = o.geometry?.getAttribute('position');
        if (!pos) return;
        const step = pos.count > 3000 ? 3 : 1;
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          fn(v);
        }
      });
    }
  };
  for (const e of entries) each(e.objects, (p) => {
    if (p.z < zMin) zMin = p.z;
    if (p.z > zMax) zMax = p.z;
  });
  const span = Math.max(1e-6, zMax - zMin);

  return entries.map((e) => {
    const out = [];
    for (let i = 0; i < bins; i++) out.push({ halfWidth: 0, top: -Infinity, bottom: Infinity, count: 0 });
    each(e.objects, (p) => {
      let k = Math.floor(((p.z - zMin) / span) * bins);
      if (k < 0) k = 0; else if (k >= bins) k = bins - 1;
      const bin = out[k];
      const ax = Math.abs(p.x);
      if (ax > bin.halfWidth) bin.halfWidth = ax;
      if (p.y > bin.top) bin.top = p.y;
      if (p.y < bin.bottom) bin.bottom = p.y;
      bin.count++;
    });
    for (const bin of out) if (!bin.count) { bin.top = 0; bin.bottom = 0; }
    return { id: e.id, bins: out };
  });
}

/** Mean and peak outline difference between two signatures, in metres. */
export function outlineDivergence(a, b) {
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
  return { mean: s / n, max: mx };
}

/**
 * Targets for a SINGLE-MODULE swap on the 1400 m cruiser, in metres.
 *
 * At maximum tactical zoom the hull is about thirty pixels long, so one pixel is
 * 1400/30 = 46.7 m - which is where ship-language.md §6 M2's "45 m" comes from. A
 * full loadout changes six mounts at once and is held to that mean across the whole
 * outline. Two fits of ONE mount can only differ where that mount is, so holding
 * them to the same whole-hull mean would be a rule about how many mounts a ship has
 * rather than about whether the player can tell two modules apart. The peak is what
 * carries this criterion: somewhere on the outline the two must differ by three
 * pixels, and the mean is checked over the BINS THE TWO MODULES ACTUALLY TOUCH.
 */
export const MODULE_DIVERGENCE = { mean: 46.7, max: 140 };

/** Count triangles in a built module without a GPU. Used by the audit. */
export function countTriangles(object) {
  let t = 0;
  object.traverse((o) => {
    if (o.isMesh && o.geometry) t += G.triCount(o.geometry) * (o.isInstancedMesh ? o.count : 1);
  });
  return t;
}
