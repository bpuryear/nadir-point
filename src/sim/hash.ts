import type { World } from './world.ts';

// Two FNV-1a lanes over the raw bits of the state. Typed arrays use the
// platform byte order; every target platform is little-endian.

const FNV_PRIME = 16777619;

interface HashState {
  a: number;
  b: number;
}

function mixWord(h: HashState, word: number): void {
  h.a = Math.imul(h.a ^ word, FNV_PRIME);
  h.b = Math.imul(h.b ^ (word ^ 0x5bd1e995), FNV_PRIME);
}

function mixF64(h: HashState, arr: Float64Array, n: number): void {
  const words = new Uint32Array(arr.buffer, arr.byteOffset, n * 2);
  for (let k = 0; k < words.length; k++) mixWord(h, words[k]);
}

function mixInts(h: HashState, arr: Int32Array | Uint8Array, n: number): void {
  for (let k = 0; k < n; k++) mixWord(h, arr[k]);
}

function hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

export function hashWorld(w: World): string {
  const h: HashState = { a: 0x811c9dc5, b: 0x01000193 };
  const n = w.count;
  const m = w.moduleCount;
  mixWord(h, w.tick);
  mixWord(h, n);
  mixWord(h, w.rng.a);
  mixWord(h, w.rng.b);
  mixWord(h, w.rng.c);
  mixWord(h, w.rng.d);
  mixInts(h, w.status, n);
  mixF64(h, w.x, n);
  mixF64(h, w.y, n);
  mixF64(h, w.hx, n);
  mixF64(h, w.hy, n);
  mixF64(h, w.speed, n);
  mixF64(h, w.structure, n);
  mixF64(h, w.armour, n * 4);
  mixF64(h, w.dcSupply, n);
  mixInts(h, w.target, n);
  mixInts(h, w.run, n);
  mixF64(h, w.mHp, m);
  mixInts(h, w.mCooldown, m);
  return hex(h.a) + hex(h.b);
}
