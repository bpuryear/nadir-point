import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque } from './pixbuf.js';
import { EMISSIVE, FACTION_PALETTE, isEmissive, NEUTRAL } from './palette.js';
import { checkPalette } from './qc.js';
import { buildProfile } from './grammar/profile.js';
import { buildHull } from './hull.js';
import {
  buildLodSet, LOD_DIVISORS, reduceTier, silhouetteTier, TIER_FLOOR,
} from './lod.js';

const allowed = FACTION_PALETTE.player;
const hull = (sizeClass: 'cruiser' | 'destroyer' = 'cruiser', seed = 'l') =>
  buildHull({ faction: 'player', sizeClass, rng: makeRng(seed) });

const lodSet = (sizeClass: 'cruiser' | 'destroyer' = 'cruiser', seed = 'l') => {
  const h = hull(sizeClass, seed);
  return buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);
};

describe('tier structure', () => {
  it('defines four divisors matching the four zoom levels', () => {
    expect(LOD_DIVISORS).toEqual([1, 4, 8, 32]);
  });

  it('returns four tiers', () => {
    expect(lodSet()).toHaveLength(4);
  });

  it('leaves tier 1 byte-identical to the source', () => {
    const h = hull();
    const tiers = buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);
    expect(Array.from(tiers[0]!.data)).toEqual(Array.from(h.buf.data));
  });

  it('shrinks each tier by its divisor', () => {
    const h = hull();
    const tiers = buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);
    expect(tiers[1]!.h).toBe(Math.max(TIER_FLOOR, Math.round(h.buf.h / 4)));
    expect(tiers[2]!.h).toBe(Math.max(TIER_FLOOR, Math.round(h.buf.h / 8)));
  });

  it('never produces an empty tier', () => {
    for (const sizeClass of ['cruiser', 'destroyer'] as const) {
      for (const tier of lodSet(sizeClass)) {
        expect(countOpaque(tier)).toBeGreaterThan(0);
      }
    }
  });

  it('honours the three-pixel floor on the far tier', () => {
    const tiers = lodSet();
    expect(tiers[3]!.w).toBeGreaterThanOrEqual(TIER_FLOOR);
    expect(tiers[3]!.h).toBeGreaterThanOrEqual(TIER_FLOOR);
  });

  it('gets smaller monotonically', () => {
    const tiers = lodSet();
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.h).toBeLessThan(tiers[i - 1]!.h);
    }
  });
});

describe('reduction preserves what matters', () => {
  it('stays on palette at every tier', () => {
    for (const tier of lodSet()) {
      expect(checkPalette(tier, allowed)).toEqual([]);
    }
  });

  it('keeps the running lights alive down to the far tier', () => {
    // This is the scale cue. A 4px speck reads as kilometres long because it
    // still carries a light; a reduction that averaged them away would kill it.
    for (const tier of lodSet()) {
      let emissives = 0;
      for (let y = 0; y < tier.h; y++) {
        for (let x = 0; x < tier.w; x++) if (isEmissive(getPx(tier, x, y))) emissives++;
      }
      expect(emissives).toBeGreaterThan(0);
    }
  });

  it('weights emissives above their pixel count', () => {
    // A single emissive in a 4x4 block must win against 15 hull pixels.
    const src = { w: 4, h: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    for (let i = 0; i < 16; i++) {
      const c = i === 5 ? EMISSIVE.amber : NEUTRAL[3]!;
      src.data[i * 4] = (c >>> 24) & 255;
      src.data[i * 4 + 1] = (c >>> 16) & 255;
      src.data[i * 4 + 2] = (c >>> 8) & 255;
      src.data[i * 4 + 3] = 255;
    }
    const reduced = reduceTier(src, 4, allowed);
    expect(isEmissive(getPx(reduced, 0, 0))).toBe(true);
  });

  it('keeps a mostly-filled block filled and a mostly-empty block empty', () => {
    const mostlyFull = { w: 4, h: 4, data: new Uint8ClampedArray(64) };
    for (let i = 0; i < 12; i++) mostlyFull.data[i * 4 + 3] = 255;
    expect(isOpaque(getPx(reduceTier(mostlyFull, 4, allowed), 0, 0))).toBe(true);

    const nearlyEmpty = { w: 4, h: 4, data: new Uint8ClampedArray(64) };
    nearlyEmpty.data[3] = 255;
    expect(isOpaque(getPx(reduceTier(nearlyEmpty, 4, allowed), 0, 0))).toBe(false);
  });

  it('introduces no partial alpha', () => {
    for (const tier of lodSet()) {
      for (let i = 3; i < tier.data.length; i += 4) {
        expect(tier.data[i] === 0 || tier.data[i] === 255).toBe(true);
      }
    }
  });
});

describe('the far tier is generated, not filtered', () => {
  it('draws a hull from the profile at a target length', () => {
    const profile = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('s') });
    const tiny = silhouetteTier(profile, 4, NEUTRAL[3]!, EMISSIVE.amber);
    expect(tiny.h).toBe(4);
    expect(countOpaque(tiny)).toBeGreaterThan(0);
  });

  it('clamps to the floor when asked for something absurd', () => {
    const profile = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('s') });
    expect(silhouetteTier(profile, 1, NEUTRAL[3]!, EMISSIVE.amber).h).toBe(TIER_FLOOR);
  });

  it('carries one emissive so the speck still has a light', () => {
    const profile = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('s') });
    const tiny = silhouetteTier(profile, 4, NEUTRAL[3]!, EMISSIVE.amber);
    let emissives = 0;
    for (let y = 0; y < tiny.h; y++) {
      for (let x = 0; x < tiny.w; x++) if (isEmissive(getPx(tiny, x, y))) emissives++;
    }
    expect(emissives).toBe(1);
  });

  it('keeps a cruiser and a destroyer distinguishable at the far tier', () => {
    // The acceptance criterion at 4px. If these collapse to the same blob, the
    // wide shot stops carrying information.
    const cruiser = lodSet('cruiser')[3]!;
    const destroyer = lodSet('destroyer')[3]!;
    const key = (b: typeof cruiser) => {
      const bits: string[] = [];
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) bits.push(isOpaque(getPx(b, x, y)) ? '1' : '0');
      }
      return `${b.w}x${b.h}:${bits.join('')}`;
    };
    expect(key(cruiser)).not.toBe(key(destroyer));
  });
});

describe('determinism', () => {
  it('produces identical tiers twice', () => {
    const a = lodSet('cruiser', 'same');
    const b = lodSet('cruiser', 'same');
    for (let i = 0; i < 4; i++) {
      expect(Array.from(a[i]!.data)).toEqual(Array.from(b[i]!.data));
    }
  });
});
