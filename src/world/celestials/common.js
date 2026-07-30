/**
 * Shared plumbing for the celestial backdrop.
 *
 * Everything in `world/celestials` renders into `renderer.far` — a second scene with
 * its own camera that copies the main camera's ORIENTATION and takes only
 * `FAR_SCENE.parallax` of its translation. That means:
 *
 *   * distances in here are *compressed* — the shell is FAR_SCENE.radius (9 km of
 *     far-scene units), not the real astronomical distance. A gas giant "200 000 km
 *     away" is a 3.2 km sphere at 9 km. What matters is its ANGULAR size.
 *   * the far camera never really translates, so a quad built facing the origin at
 *     build time is facing the camera forever. No per-frame billboarding.
 *   * depth is cleared between the far pass and the main pass, so far-scene depth is
 *     ours alone to use. We use it: the gas giant writes depth, everything drawn
 *     after it can be occluded by it, and that occlusion is the strongest depth cue
 *     the backdrop has.
 *
 * RENDER ORDER CONTRACT — every celestial obeys this or the layering falls apart:
 *
 *   ORDER.dome      -1   depthTest off, normal blend      the coloured darkness
 *   ORDER.stars      0   depthTest off, additive          always at the very back
 *   ORDER.backGlow   1   depthTest off, additive          nebula behind everything
 *   ORDER.star       2   depthTest off, additive          the system primary
 *   ORDER.planet     5   depthTest ON, depthWrite ON      occludes all of the above
 *   ORDER.rings      6   depthTest ON, depthWrite off
 *   ORDER.frontGlow 20   depthTest ON, additive           occluded BY the planet
 *   ORDER.dust      24   depthTest ON, normal blend       dark lanes in front
 *
 * COLOUR: the material registry has no celestial keys, so these shaders are built
 * here. Every colour they use still comes out of `art/palette.js` through
 * `mix`/`shade`, and every material is stamped `userData.__paletteKey =
 * 'celestial:<what>'` so `paletteAudit()` reports it as a known, deliberate
 * exception rather than silently passing.
 */

import * as THREE from 'three';
import { NEUTRAL, mix, shade } from '../../art/palette.js';
import { makeCanvas, ctx2d } from '../../art/textures/canvas2d.js';

/** Draw order inside the far scene. See the header. */
export const ORDER = {
  /**
   * The sky dome. NEGATIVE, and that is the whole contract it needs: it is drawn
   * before everything else in the far scene with depth test AND depth write off, so
   * its radius is free to be anything inside the far camera's frustum and no other
   * celestial has to know it exists. See `skydome.js` for why the frame has one.
   */
  dome: -1,
  stars: 0,
  backGlow: 1,
  star: 2,
  planet: 5,
  rings: 6,
  frontGlow: 20,
  dust: 24,
};

/**
 * Stamp a material the registry has no key for. This is not a way around palette
 * enforcement — it is a way of telling the audit "this is a celestial shader, it is
 * expected, here is what it is". Anything not in this namespace and not registry
 * built is still a defect.
 */
export function markCelestial(material, what) {
  material.userData.__paletteKey = `celestial:${what}`;
  material.userData.materialKey = `celestial:${what}`;
  material.userData.celestial = what;
  return material;
}

/** THREE.Color from a palette hex, sRGB-decoded. Build time only. */
export function col(hex) {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

// ---------------------------------------------------------------------------
// Noise. Cylindrical: wraps exactly in u (longitude), clamps in v (latitude).
// ---------------------------------------------------------------------------

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/** Random lattice, `w` cells around, `h` cells pole to pole. */
export function lattice(rng, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return { g, w, h };
}

/** Bilinear + smootherstep sample. u wraps, v clamps. */
export function sampleCyl(lat, u, v) {
  const { g, w, h } = lat;
  const x = u * w;
  const y = v * (h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const i0 = ((x0 % w) + w) % w;
  const i1 = (i0 + 1) % w;
  const j0 = Math.max(0, Math.min(h - 1, y0));
  const j1 = Math.max(0, Math.min(h - 1, y0 + 1));
  const a = g[j0 * w + i0], b = g[j0 * w + i1];
  const c = g[j1 * w + i0], d = g[j1 * w + i1];
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

/**
 * Anisotropic fractal noise on a cylinder. `aspect` > 1 stretches features along
 * longitude, which is the whole reason gas giant turbulence reads as ribbons rather
 * than as clouds.
 */
export function cylFbm(rng, { cellsU = 4, cellsV = 12, octaves = 5, gain = 0.52, lacunarity = 2.05 } = {}) {
  const layers = [];
  let amp = 1, total = 0, cu = cellsU, cv = cellsV;
  for (let o = 0; o < octaves; o++) {
    layers.push({ lat: lattice(rng, Math.max(2, Math.round(cu)), Math.max(2, Math.round(cv))), amp });
    total += amp;
    amp *= gain;
    cu *= lacunarity;
    cv *= lacunarity;
  }
  const inv = 1 / total;
  return (u, v) => {
    let s = 0;
    for (const l of layers) s += sampleCyl(l.lat, u, v) * l.amp;
    return s * inv;
  };
}

/** Ridged variant — gives the thin bright filaments inside a turbulent belt. */
export function cylRidged(rng, opts) {
  const layers = [];
  let amp = 1, total = 0;
  let cu = opts.cellsU ?? 4, cv = opts.cellsV ?? 12;
  const octaves = opts.octaves ?? 4;
  const gain = opts.gain ?? 0.5;
  const lac = opts.lacunarity ?? 2.1;
  for (let o = 0; o < octaves; o++) {
    layers.push({ lat: lattice(rng, Math.max(2, Math.round(cu)), Math.max(2, Math.round(cv))), amp });
    total += amp;
    amp *= gain;
    cu *= lac;
    cv *= lac;
  }
  const inv = 1 / total;
  return (u, v) => {
    let s = 0;
    for (const l of layers) {
      const n = sampleCyl(l.lat, u, v);
      s += (1 - Math.abs(n * 2 - 1)) * l.amp;
    }
    return s * inv;
  };
}

/** Plain square tileable fbm returning a sampler, for the nebula sheets. */
export function planarFbm(rng, { cells = 4, octaves = 5, gain = 0.5, lacunarity = 2, ridged = false } = {}) {
  const layers = [];
  let amp = 1, total = 0, c = cells;
  for (let o = 0; o < octaves; o++) {
    layers.push({ lat: lattice(rng, Math.max(2, Math.round(c)), Math.max(2, Math.round(c)) + 1), amp });
    total += amp;
    amp *= gain;
    c *= lacunarity;
  }
  const inv = 1 / total;
  return (u, v) => {
    let s = 0;
    for (const l of layers) {
      let n = sampleCyl(l.lat, u, v);
      if (ridged) n = 1 - Math.abs(n * 2 - 1);
      s += n * l.amp;
    }
    return s * inv;
  };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a || 1e-9));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

/**
 * Soft round point sprite, premultiplied into the alpha channel.
 *
 * `core` is the fraction of the radius held at full brightness. A star sprite with
 * no core is a single hot texel and scintillates the moment the camera moves; a
 * sprite with a 2-3 px flat core does not. That is the entire reason this takes a
 * parameter.
 */
export function softPointTexture({ size = 64, core = 0.10, falloff = 2.6, mipmaps = false, name = 'soft-point' } = {}) {
  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(size, size);
  const half = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.sqrt(dx * dx + dy * dy);
      let a;
      if (r <= core) a = 1;
      else a = Math.pow(clamp01(1 - (r - core) / (1 - core)), falloff);
      const o = (y * size + x) * 4;
      img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
      img.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.name = name;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  // MIPMAPS OFF BY DEFAULT, AND THIS MATTERS.
  // A star is a 2-3 pixel point sprite. With mipmaps, a 2 px quad selects the
  // bottom of the chain, which is the AVERAGE of the whole sprite — about 0.15
  // alpha for a soft profile. Every faint star in the sky then loses 85 % of its
  // brightness and the field collapses to "a few dozen dots". Without mipmaps the
  // sprite is sampled near its centre where the alpha is 1, which is correct, and
  // the flat core keeps it from aliasing.
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = mipmaps;
  t.needsUpdate = true;
  return t;
}

/** Radial glow with an adjustable exponent. Used for the star's corona shells. */
export function glowTexture({ size = 128, power = 3.0, inner = 0.0, name = 'glow' } = {}) {
  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(size, size);
  const half = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = r >= 1 ? 0 : Math.pow(clamp01(1 - r), power) + (r < inner ? 1 : 0);
      const o = (y * size + x) * 4;
      img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255;
      img.data[o + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.name = name;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Stellar colour ramp — derived from the palette, never invented
// ---------------------------------------------------------------------------

/**
 * Six stops from hot blue-white to cool ember, every one produced by `mix()` on
 * declared palette colours so `paletteProvenance()` can explain it. Real blackbody
 * RGB would introduce a dozen hues nobody signed off on; this keeps the sky inside
 * the same value language as the ships.
 */
export const STELLAR_RAMP = [
  mix(NEUTRAL.ice, 0x7fe4ff, 0.42),          // O/B — concord.emissive blue-white
  mix(NEUTRAL.ice, 0x7fe4ff, 0.16),          // A
  NEUTRAL.ice,                                // A/F
  mix(NEUTRAL.ice, NEUTRAL.select, 0.62),     // G
  mix(NEUTRAL.select, 0xff9126, 0.30),        // K — coalition.emissive amber
  mix(NEUTRAL.select, 0xff9126, 0.58),        // M
];

/** Sample the ramp with a 0..1 "temperature" (1 = hottest). */
export function stellarColor(t, out = new THREE.Color()) {
  const n = STELLAR_RAMP.length - 1;
  const x = clamp01(1 - t) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const a = col(STELLAR_RAMP[i]);
  const b = col(STELLAR_RAMP[i + 1]);
  return out.copy(a).lerp(b, f);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const _up = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/**
 * A quad of size (w,h) placed at `pos`, facing the far-scene origin, rolled by
 * `roll`. Returned as raw position/uv/colour arrays so many of them can be merged
 * into one draw call.
 */
export function faceOriginQuad(pos, w, h, roll, color, out) {
  const dir = pos.clone().normalize().multiplyScalar(-1);
  const up = Math.abs(dir.y) > 0.94 ? _altUp : _up;
  _m.lookAt(new THREE.Vector3(0, 0, 0), dir, up);
  _q.setFromRotationMatrix(_m);
  _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));

  const hw = w * 0.5, hh = h * 0.5;
  const corners = [
    new THREE.Vector3(-hw, -hh, 0), new THREE.Vector3(hw, -hh, 0),
    new THREE.Vector3(hw, hh, 0), new THREE.Vector3(-hw, hh, 0),
  ];
  const base = out.position.length / 3;
  for (const c of corners) {
    c.applyQuaternion(_q).add(pos);
    out.position.push(c.x, c.y, c.z);
    out.color.push(color.r, color.g, color.b);
  }
  out.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  out.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return out;
}

export function quadBuffers() {
  return { position: [], uv: [], color: [], index: [] };
}

export function finishQuads(b, name = 'quads') {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  // NOT named `color`: three declares `attribute vec3 color` itself under
  // USE_COLOR, and a duplicate declaration is a shader compile error.
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(b.color, 3));
  g.setIndex(b.index);
  g.computeBoundingSphere();
  g.name = name;
  return g;
}

/** Direction helper: a normalised THREE.Vector3 from a [x,y,z] array. */
export function dirOf(arr) {
  return new THREE.Vector3(arr[0], arr[1], arr[2]).normalize();
}

export { mix, shade, NEUTRAL };
