/**
 * Canvas + buffer plumbing for the procedural texture generators.
 *
 * Everything in this directory produces a THREE.CanvasTexture or THREE.DataTexture
 * at runtime. No image is ever fetched and none is ever committed. The rules that
 * matter and are easy to get wrong:
 *
 *   - Albedo/colour maps are sRGB. Data maps (normal, ORM, masks) are NOT. Getting
 *     this backwards is the single most common reason a PBR set looks washed out.
 *   - Everything tiles. Generators write into wrapped buffers and the seam is the
 *     tile border, which is itself a panel gap, so the repeat is invisible.
 *   - three flips textures vertically by default, so canvas row 0 ends up at v=1.
 *     "Down the hull" is +row in canvas space. Streaking depends on this.
 */

import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0, edge1, x) {
  const t = saturate01((x - edge0) / (edge1 - edge0 || 1e-9));
  return t * t * (3 - 2 * t);
}

/** Create a 2D drawing surface. Works in a browser and in a worker. */
export function makeCanvas(w, h = w) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('[textures] no canvas implementation available in this environment');
}

export function ctx2d(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!ctx) throw new Error('[textures] could not acquire a 2d context');
  return ctx;
}

/** sRGB hex -> [0..255, 0..255, 0..255]. No colour management: this is canvas ink. */
export function hexBytes(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

export function css(hex, alpha = 1) {
  const [r, g, b] = hexBytes(hex);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Wrap a canvas as a texture. `data` maps must not be sRGB-decoded; `color` maps
 * must be. There is no third option and defaulting is how bugs happen, so the
 * caller states it.
 */
export function canvasTexture(canvas, { srgb = false, repeat = 1, aniso = 8, name = '', flipY = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.name = name;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.setScalar(repeat);
  t.anisotropy = aniso;
  t.flipY = flipY;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A float field the generators build panel height and masks in. */
export function field(size, fill = 0) {
  const f = new Float32Array(size * size);
  if (fill !== 0) f.fill(fill);
  return f;
}

/** Toroidal sample - every generator wraps, so this is the only indexer used. */
export const wrapIdx = (x, y, size) => ((y % size) + size) % size * size + (((x % size) + size) % size);

export function fieldGet(f, x, y, size) { return f[wrapIdx(x, y, size)]; }

/** Separable box blur on a wrapped float field. Two passes approximate a gaussian. */
export function blurField(src, size, radius, passes = 2) {
  if (radius < 1) return src;
  let a = src;
  let b = new Float32Array(size * size);
  const r = Math.round(radius);
  const norm = 1 / (r * 2 + 1);
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[row + (((k % size) + size) % size)];
      for (let x = 0; x < size; x++) {
        b[row + x] = sum * norm;
        const out = a[row + ((((x - r) % size) + size) % size)];
        const inc = a[row + ((((x + r + 1) % size) + size) % size)];
        sum += inc - out;
      }
    }
    // vertical
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += b[((((k % size) + size) % size)) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = sum * norm;
        const out = b[((((y - r) % size) + size) % size) * size + x];
        const inc = b[((((y + r + 1) % size) + size) % size) * size + x];
        sum += inc - out;
      }
    }
  }
  return a;
}

/**
 * Height field -> tangent-space normal map bytes.
 *
 * Sobel on a wrapped field. The v axis is negated because three flips the texture,
 * so an increase in canvas row is a decrease in v, and green-up (OpenGL
 * convention, which is what MeshStandardMaterial expects) has to follow.
 */
export function heightToNormalBytes(height, size, strength = 1) {
  const out = new Uint8ClampedArray(size * size * 4);
  const s = strength * size * 0.0075;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size;
    const yp = ((y + 1) % size) * size;
    const yc = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      // Sobel
      const tl = height[ym + xm], t = height[ym + x], tr = height[ym + xp];
      const l = height[yc + xm], r = height[yc + xp];
      const bl = height[yp + xm], b = height[yp + x], br = height[yp + xp];
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * s;
      let ny = dy * s;   // canvas row down == hull down == -v, hence no extra flip
      const nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= inv; ny *= inv;
      const o = (yc + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (nz * inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Write RGBA bytes into a canvas and return it. */
export function bytesToCanvas(bytes, size) {
  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(size, size);
  img.data.set(bytes);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Pack three float fields into one RGB texture: R = ambient occlusion,
 * G = roughness, B = metalness. MeshStandardMaterial reads .r/.g/.b from
 * aoMap/roughnessMap/metalnessMap respectively, so one texture and one sampler
 * serves all three. This is the single biggest texture-memory saving available and
 * it costs nothing.
 */
export function packORM(ao, rough, metal, size) {
  const bytes = new Uint8ClampedArray(size * size * 4);
  for (let i = 0, n = size * size; i < n; i++) {
    const o = i * 4;
    bytes[o] = ao[i] * 255;
    bytes[o + 1] = rough[i] * 255;
    bytes[o + 2] = metal[i] * 255;
    bytes[o + 3] = 255;
  }
  return bytesToCanvas(bytes, size);
}

/** Grayscale float field -> single-channel-looking RGBA canvas (for masks/debug). */
export function fieldToCanvas(f, size, { tint = null, alphaFromValue = false } = {}) {
  const bytes = new Uint8ClampedArray(size * size * 4);
  const [tr, tg, tb] = tint ? hexBytes(tint) : [255, 255, 255];
  for (let i = 0, n = size * size; i < n; i++) {
    const v = saturate01(f[i]);
    const o = i * 4;
    bytes[o] = tr * v; bytes[o + 1] = tg * v; bytes[o + 2] = tb * v;
    bytes[o + 3] = alphaFromValue ? v * 255 : 255;
  }
  return bytesToCanvas(bytes, size);
}

/** Read a canvas back as float luminance, 0..1. Used to compose stages. */
export function canvasToField(canvas, size) {
  const ctx = ctx2d(canvas);
  const d = ctx.getImageData(0, 0, size, size).data;
  const f = new Float32Array(size * size);
  for (let i = 0, n = size * size; i < n; i++) {
    f[i] = (d[i * 4] * 0.2126 + d[i * 4 + 1] * 0.7152 + d[i * 4 + 2] * 0.0722) / 255;
  }
  return f;
}

/**
 * Draw a rounded rectangle without relying on ctx.roundRect, which is not present
 * on every 2D context implementation this may run under.
 */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/**
 * Run `draw(ctx, dx, dy)` nine times so anything drawn near an edge appears on the
 * opposite edge too. This is how decals, scorches and greebles stay tileable
 * without any special-casing inside the generator.
 */
export function drawWrapped(ctx, size, draw) {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      ctx.save();
      ctx.translate(ox * size, oy * size);
      draw(ctx, ox * size, oy * size);
      ctx.restore();
    }
  }
}
