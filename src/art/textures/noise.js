/**
 * Tileable noise. Deterministic from an RNG, wraps exactly at the tile border.
 *
 * This exists to support the other generators - grime gradients, oxide mottling,
 * pitting on derelict hulls. It is deliberately NOT the source of surface detail.
 * Panel layout is structural (see panelLines.js); noise only modulates it. The
 * moment noise starts carrying the detail, every hull in the game looks like the
 * same hull.
 */

import { saturate01, smoothstep } from './canvas2d.js';

/** Tileable value-noise lattice at `cells` resolution, sampled with smootherstep. */
export function valueLattice(rng, cells) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return { g, cells };
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

export function sampleLattice(lat, u, v) {
  const { g, cells } = lat;
  const x = u * cells, y = v * cells;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const i0 = ((x0 % cells) + cells) % cells;
  const i1 = (i0 + 1) % cells;
  const j0 = ((y0 % cells) + cells) % cells;
  const j1 = (j0 + 1) % cells;
  const a = g[j0 * cells + i0], b = g[j0 * cells + i1];
  const c = g[j1 * cells + i0], d = g[j1 * cells + i1];
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/**
 * Fractal sum of tileable value noise into a size x size field, 0..1.
 * `baseCells` must divide the tile for the wrap to be exact; it always does
 * because every octave is an integer lattice over the unit square.
 */
export function fbmField(rng, size, { baseCells = 4, octaves = 5, gain = 0.5, lacunarity = 2, ridged = false } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, cells = baseCells;
  const lats = [];
  for (let o = 0; o < octaves; o++) {
    lats.push({ lat: valueLattice(rng, Math.max(2, Math.round(cells))), amp });
    total += amp;
    amp *= gain;
    cells *= lacunarity;
  }
  const inv = 1 / total;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let s = 0;
      for (const { lat, amp: a } of lats) {
        let n = sampleLattice(lat, u, v);
        if (ridged) n = 1 - Math.abs(n * 2 - 1);
        s += n * a;
      }
      out[y * size + x] = s * inv;
    }
  }
  return out;
}

/**
 * Tileable cellular (Worley) distance field, 0..1, where 0 is a feature centre.
 * Used for pitting and corrosion craters on derelict hulls. Grid-bucketed so it
 * stays O(pixels) rather than O(pixels x points).
 */
export function cellularField(rng, size, { cells = 12, jitter = 0.85, invert = false } = {}) {
  const pts = new Float32Array(cells * cells * 2);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const k = (j * cells + i) * 2;
      pts[k] = (i + 0.5 + (rng.next() - 0.5) * jitter) / cells;
      pts[k + 1] = (j + 0.5 + (rng.next() - 0.5) * jitter) / cells;
    }
  }
  const out = new Float32Array(size * size);
  const maxD = 1.5 / cells;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const cj = Math.floor(v * cells);
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const ci = Math.floor(u * cells);
      let best = 1e9;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ((ci + di) % cells + cells) % cells;
          const j = ((cj + dj) % cells + cells) % cells;
          const k = (j * cells + i) * 2;
          let dx = pts[k] - u;
          let dy = pts[k + 1] - v;
          if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
          if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
      }
      const d = saturate01(Math.sqrt(best) / maxD);
      out[y * size + x] = invert ? 1 - d : d;
    }
  }
  return out;
}

/**
 * Directional streak field: vertical smears that start at random heights and fade
 * downward, plus a slow horizontal variation so they clump. This is the thing that
 * makes a hull read as "something has been running down this for forty years"
 * rather than "someone applied a grunge overlay".
 */
export function streakField(rng, size, { count = 90, lengthMin = 0.06, lengthMax = 0.42, width = 3, strength = 1 } = {}) {
  const out = new Float32Array(size * size);
  for (let s = 0; s < count; s++) {
    const cx = Math.floor(rng.next() * size);
    const y0 = Math.floor(rng.next() * size);
    const len = Math.round(size * (lengthMin + rng.next() * (lengthMax - lengthMin)));
    const w = Math.max(1, Math.round(width * (0.4 + rng.next() * 1.6)));
    const amp = strength * (0.25 + rng.next() * 0.75);
    const drift = (rng.next() - 0.5) * 0.06;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // strong at the origin, long thin tail
      const a = amp * (1 - t) * (1 - t) * smoothstep(0, 0.05, t);
      const y = (y0 + i) % size;
      const xc = cx + drift * i;
      for (let k = -w; k <= w; k++) {
        const fall = 1 - Math.abs(k) / (w + 1);
        const x = ((Math.round(xc) + k) % size + size) % size;
        const idx = y * size + x;
        const val = a * fall * fall;
        if (val > out[idx]) out[idx] = val;
      }
    }
  }
  return out;
}

/** In-place: out = a op b. Small helpers so composition stages stay readable. */
export const fieldOps = {
  max(a, b) { for (let i = 0; i < a.length; i++) if (b[i] > a[i]) a[i] = b[i]; return a; },
  mul(a, b) { for (let i = 0; i < a.length; i++) a[i] *= b[i]; return a; },
  add(a, b, k = 1) { for (let i = 0; i < a.length; i++) a[i] += b[i] * k; return a; },
  scale(a, k) { for (let i = 0; i < a.length; i++) a[i] *= k; return a; },
  bias(a, k) { for (let i = 0; i < a.length; i++) a[i] += k; return a; },
  clamp01(a) { for (let i = 0; i < a.length; i++) a[i] = saturate01(a[i]); return a; },
  remap(a, lo, hi) { const d = hi - lo; for (let i = 0; i < a.length; i++) a[i] = lo + a[i] * d; return a; },
  copy(a) { return Float32Array.from(a); },
  contrast(a, k, pivot = 0.5) {
    for (let i = 0; i < a.length; i++) a[i] = saturate01(pivot + (a[i] - pivot) * k);
    return a;
  },
};
