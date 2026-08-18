import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, type PixBuf } from './pixbuf.js';
import {
  EMISSIVE, FACTION_PALETTE, isEmissive, NEUTRAL, type FactionId,
} from './palette.js';
import { checkPalette } from './qc.js';
import { buildProfile, type SizeClass } from './grammar/profile.js';
import { buildHull } from './hull.js';
import {
  buildLodSet, LOD_DIVISORS, reduceTier, silhouetteTier, TIER_FLOOR,
} from './lod.js';

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];

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

  it('thins running lights proportionally without losing them', () => {
    // Lights are the scale cue: a 4px speck reads as kilometres long because it
    // still carries one. But preserving all of them while the hull shrinks makes
    // the sprite mostly lights, which blooms into a blob. They must thin, not
    // multiply and not vanish.
    const h = hull();
    const tiers = buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);

    const emissiveCount = (b: PixBuf) => {
      let n = 0;
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) if (isEmissive(getPx(b, x, y))) n++;
      }
      return n;
    };

    const sourceLights = emissiveCount(tiers[0]!);

    if (sourceLights > 0) {
      // Lights survive the reduction chain when there were any to begin with.
      // A source hull with none (erosion can strip every light-bearing pixel
      // from a derelict) has nothing to preserve, and inventing one at tier 1
      // or 2 would not be a fix — it would be a light that was never there.
      for (const i of [1, 2]) {
        expect(emissiveCount(tiers[i]!), `tier ${i} lost every light`).toBeGreaterThan(0);
      }
    }

    // Never multiplied within the reduction chain — tier 3 is generated, not
    // reduced, and legitimately adds a light to an unlit hulk so it can be
    // seen and salvaged at wide zoom.
    for (const i of [1, 2]) {
      expect(emissiveCount(tiers[i]!), `tier ${i} gained lights`)
        .toBeLessThanOrEqual(emissiveCount(tiers[i - 1]!));
    }

    // The far tier is generated, not reduced, and carries exactly one light by
    // design regardless of the source. A ratio cap does not apply here; the
    // count does.
    expect(emissiveCount(tiers[3]!), 'far tier must carry exactly one light').toBe(1);

    // The cap guards against bloom turning a sprite into a blob. It only means
    // anything on a sprite large enough to have structure: break-even for 15%
    // is about 7 opaque pixels, so on a 3-pixel corvette at tier 2 a single
    // required light is a third of the ship by arithmetic, not by defect.
    for (const [i, tier] of tiers.entries()) {
      const opaque = countOpaque(tier);
      const lights = emissiveCount(tier);
      if (opaque >= 20) {
        expect(lights / opaque, `tier ${i} is ${(lights / opaque * 100).toFixed(0)}% emissive`)
          .toBeLessThan(0.15);
      } else {
        // Too small for a ratio to be meaningful — what matters is that the
        // scale cue is present and has not multiplied.
        expect(lights, `tier ${i} lights on a ${opaque}px sprite`).toBeLessThanOrEqual(2);
      }
    }
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

  it('keeps cruiser and destroyer distinguishable at the far tier', () => {
    // The acceptance criterion. TIER_FLOOR previously clamped both classes to
    // the same 3x3 and they collided in 29% of pairs.
    for (const faction of ALL_FACTIONS) {
      for (let i = 0; i < 25; i++) {
        const seed = `far-${i}`;
        const key = (sizeClass: SizeClass) => {
          const h = buildHull({ faction, sizeClass, rng: makeRng(seed) });
          const t = buildLodSet(h.buf, h.profile, FACTION_PALETTE[faction], NEUTRAL[3]!, EMISSIVE.amber)[3]!;
          const bits: string[] = [];
          for (let y = 0; y < t.h; y++) {
            for (let x = 0; x < t.w; x++) bits.push(isOpaque(getPx(t, x, y)) ? '1' : '0');
          }
          return `${t.w}x${t.h}:${bits.join('')}`;
        };
        expect(key('cruiser'), `${faction}/${seed}`).not.toBe(key('destroyer'));
      }
    }
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
