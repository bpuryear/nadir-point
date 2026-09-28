// sfc32 seeded by splitmix32. Integer ops only, so every engine gives the same stream.

export interface Rng {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function createRng(seed: number): Rng {
  let s = seed | 0;
  const mix = (): number => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) | 0;
  };
  const rng: Rng = { a: mix(), b: mix(), c: mix(), d: mix() };
  for (let i = 0; i < 12; i++) nextU32(rng);
  return rng;
}

export function nextU32(r: Rng): number {
  const t = (((r.a + r.b) | 0) + r.d) | 0;
  r.d = (r.d + 1) | 0;
  r.a = r.b ^ (r.b >>> 9);
  r.b = (r.c + (r.c << 3)) | 0;
  r.c = (r.c << 21) | (r.c >>> 11);
  r.c = (r.c + t) | 0;
  return t >>> 0;
}

/** Uniform in [0, 1). */
export function nextFloat(r: Rng): number {
  return nextU32(r) / 4294967296;
}

export function nextRange(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(r);
}

/** Uniform integer in [0, n). */
export function nextInt(r: Rng, n: number): number {
  return Math.floor(nextFloat(r) * n);
}
