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
 * RUNNING LIGHTS. Every faction hull wears the game-wide 6 m strip from
 * art/textures/runningLights.js, laid on the upper chine with U authored in METRES.
 * Two triangles a side, exact spacing, no way to lie about the ship's size. The
 * cruiser (1400 m) deliberately does not use it because 650 m of chine renders as
 * one continuous band; at 95-480 m the lamps stay resolvable, which is the whole
 * point of putting them there.
 */

import * as THREE from 'three';
import * as G from '../greeble.js';

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
 * A run of octagonal stations, the cross-section this whole game is drawn in.
 * Rows are `[z, halfWidth, top, bottom, chamferWidth, chamferTop, chamferBottom]`,
 * ascending in z, all metres in ship space (+Z forward, +Y up, +X starboard).
 *
 * The chamfers are not decoration. They are where every rim light in the frame
 * comes from, which is why the running-light strip is laid on the upper one.
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

  stations(keepEvery = 1) {
    return Lines.decimate(this.rows, keepEvery).map((r) => ({
      z: r[0],
      points: G.octProfile(r[1], r[2], r[3], r[4], r[5], r[6]),
    }));
  }

  loft(opts = {}, keepEvery = 1) { return G.loft(this.stations(keepEvery), opts); }

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
    return { hw: L(1), top: L(2), bot: L(3), cw: L(4), ct: L(5), cb: L(6) };
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
 * authored in METRES so the registry's running-light texture lays down exactly one
 * lamp every 6 m and a beacon every 48 m. Two triangles.
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
  const lengthM = Math.abs(z1 - z0);
  return quad(p, [[0, 0], [0, 1], [lengthM, 1], [lengthM, 0]], [side * a.nx, a.ny, 0]);
}

/**
 * A free-standing emissive strip between two points, facing `normal`. Used where a
 * hull has no chine to sit on - Concord's flush flanks, the derelict's vanes.
 * U is metres, same contract as `chineStrip`.
 */
export function lightRun(from, to, normal, width = 1.6) {
  const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const lengthM = d.length();
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
    const { buckets } = partsFor({ rng: ctx.rng, lod });

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
