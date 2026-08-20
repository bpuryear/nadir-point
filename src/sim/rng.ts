/**
 * Seeded, splittable pseudo-random number generation.
 *
 * `sfc32` is the generator — small, fast, and statistically sound enough for a
 * game. `cyrb128` turns a string seed into the four 32-bit words it needs.
 *
 * The splitting is the load-bearing part. Systems take a *named child stream*
 * rather than sharing one generator, so how much randomness combat consumes
 * cannot shift what the world layout or the sprite generator produce. Sharing a
 * single stream would make "any bug is reproducible from a seed" a false claim:
 * firing one extra shot would change the shape of the nebula.
 */

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). Returns 0 for n <= 1. */
  int(n: number): number;
  /** A float in [lo, hi). */
  range(lo: number, hi: number): number;
  /** A uniformly chosen element. Throws RangeError if the array is empty. */
  pick<T>(items: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** An independent child stream. Drawing from it never advances this one. */
  split(name: string): Rng;
}

/** Hashes a string into four 32-bit seed words. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

function fromWords(seed: string, words: [number, number, number, number]): Rng {
  let [a, b, c, d] = words;

  const next = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  return {
    next,

    int(n: number): number {
      if (n <= 1) return 0;
      return Math.floor(next() * n);
    },

    range(lo: number, hi: number): number {
      return lo + next() * (hi - lo);
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('pick() called on an empty array');
      }
      // Index is in bounds by construction; the assertion satisfies
      // noUncheckedIndexedAccess without a runtime cost.
      return items[Math.floor(next() * items.length)]!;
    },

    chance(p: number): boolean {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },

    /**
     * Derives a child from the *seed string*, not from the current internal
     * state. That is why drawing from a child cannot advance the parent, and
     * why two siblings stay independent no matter how hard either is used.
     */
    split(name: string): Rng {
      const childSeed = `${seed}/${name}`;
      return fromWords(childSeed, cyrb128(childSeed));
    },
  };
}

export function makeRng(seed: string): Rng {
  return fromWords(seed, cyrb128(seed));
}
