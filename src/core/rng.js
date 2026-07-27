/**
 * Deterministic seeded RNG. Every procedural system in the game draws from one of
 * these, never from Math.random, so any bug reproduces from its seed alone.
 */

/** Hash a string to a 32-bit integer seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 - small, fast, good enough distribution for content generation. */
export class RNG {
  constructor(seed = 0x9e3779b9) {
    this.seed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this._s = this.seed;
  }

  /** Fork a labelled child stream. Sibling streams never interfere. */
  fork(label) {
    return new RNG((this.seed ^ hashSeed(String(label))) >>> 0);
  }

  reset() {
    this._s = this.seed;
    return this;
  }

  /** [0,1) */
  next() {
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min,max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** integer [min,max] inclusive */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  bool(p = 0.5) {
    return this.next() < p;
  }

  /** signed [-1,1] */
  signed() {
    return this.next() * 2 - 1;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick. entries: [{ weight, ...}] */
  pickWeighted(entries, weightKey = 'weight') {
    let total = 0;
    for (const e of entries) total += e[weightKey] ?? 1;
    let r = this.next() * total;
    for (const e of entries) {
      r -= e[weightKey] ?? 1;
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  }

  /** In-place Fisher-Yates. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Approximately normal via sum of uniforms. */
  gaussian(mean = 0, stdev = 1) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + stdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Uniform point on a unit sphere, written into out {x,y,z}. */
  onSphere(out = { x: 0, y: 0, z: 0 }) {
    const z = this.signed();
    const a = this.next() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    out.x = r * Math.cos(a);
    out.y = z;
    out.z = r * Math.sin(a);
    return out;
  }
}

/** Root seed for the whole build. Change this and the entire system regenerates. */
export const WORLD_SEED = 'nadir-point/vertical-slice/001';

/** Global root RNG. Systems should fork it rather than consume it directly. */
export const rootRNG = new RNG(WORLD_SEED);
