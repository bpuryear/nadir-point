import { describe, expect, it } from 'vitest';
import { alphaOf, EMPTY, luminance, rgba } from './pixbuf.js';
import {
  COALITION_RAMP, CONCORD_RAMP, EMISSIVE, EMISSIVE_SET, FACTION_PALETTE,
  isEmissive, isInPalette, MASTER_PALETTE, NEUTRAL, POI_PALETTE, rampOf,
  shadeStep, snapToPalette, SPACE, UI, WARM,
} from './palette.js';

describe('master palette', () => {
  it('holds 52 colours', () => {
    expect(MASTER_PALETTE).toHaveLength(52);
  });

  it('contains no duplicates', () => {
    expect(new Set(MASTER_PALETTE).size).toBe(52);
  });

  it('is entirely opaque — transparency is an alpha state, not a colour', () => {
    for (const c of MASTER_PALETTE) expect(alphaOf(c)).toBe(255);
  });

  it('is the union of its named groups', () => {
    const grouped = new Set([
      ...NEUTRAL, ...WARM, ...CONCORD_RAMP, ...COALITION_RAMP,
      ...Object.values(EMISSIVE), ...SPACE, ...UI,
    ]);
    expect(grouped.size).toBe(52);
    for (const c of MASTER_PALETTE) expect(grouped.has(c)).toBe(true);
  });
});

describe('ramps ascend in luminance', () => {
  const ramps: [string, readonly number[]][] = [
    ['neutral', NEUTRAL], ['warm', WARM],
    ['concord', CONCORD_RAMP], ['coalition', COALITION_RAMP], ['space', SPACE], ['ui', UI],
  ];

  for (const [name, ramp] of ramps) {
    it(`${name} goes dark to light with no flat steps`, () => {
      for (let i = 1; i < ramp.length; i++) {
        expect(luminance(ramp[i]!)).toBeGreaterThan(luminance(ramp[i - 1]!));
      }
    });
  }

  it('gives the hull ramps enough range to shade with', () => {
    for (const ramp of [NEUTRAL, CONCORD_RAMP, COALITION_RAMP, WARM]) {
      const spread = luminance(ramp.at(-1)!) - luminance(ramp[0]!);
      expect(spread).toBeGreaterThan(120);
    }
  });
});

describe('membership', () => {
  it('accepts every palette colour', () => {
    for (const c of MASTER_PALETTE) expect(isInPalette(c)).toBe(true);
  });

  it('accepts transparency', () => {
    expect(isInPalette(EMPTY)).toBe(true);
  });

  it('rejects an invented colour', () => {
    expect(isInPalette(rgba(123, 45, 67))).toBe(false);
  });

  it('rejects a palette colour at the wrong alpha', () => {
    const c = MASTER_PALETTE[0]!;
    expect(isInPalette(rgba((c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, 128))).toBe(false);
  });
});

describe('emissives', () => {
  it('names eight of them', () => {
    expect(Object.keys(EMISSIVE)).toHaveLength(8);
    expect(EMISSIVE_SET.size).toBe(8);
  });

  it('identifies them', () => {
    expect(isEmissive(EMISSIVE.amber)).toBe(true);
    expect(isEmissive(NEUTRAL[0]!)).toBe(false);
  });

  it('makes them the brightest things in the palette', () => {
    // Bloom keys off emissives; if hull midtones outshone them the threshold
    // could not separate the two.
    const dimmestEmissive = Math.min(...Object.values(EMISSIVE).map(luminance));
    const brightestHull = Math.max(...[...NEUTRAL, ...WARM].map(luminance));
    expect(dimmestEmissive).toBeGreaterThan(brightestHull * 0.55);
  });
});

describe('faction locks', () => {
  it('defines a subset for each faction', () => {
    for (const id of ['concord', 'coalition', 'derelict', 'player'] as const) {
      const lock = FACTION_PALETTE[id];
      expect(lock.length).toBeGreaterThan(6);
      expect(lock.length).toBeLessThan(MASTER_PALETTE.length);
      for (const c of lock) expect(isInPalette(c)).toBe(true);
    }
  });

  it('gives the two live factions visibly different hull ramps', () => {
    const concord = new Set(rampOf('concord'));
    const overlap = rampOf('coalition').filter((c) => concord.has(c));
    expect(overlap).toHaveLength(0);
  });

  it('returns a usable ramp for every faction', () => {
    for (const id of ['concord', 'coalition', 'derelict', 'player'] as const) {
      expect(rampOf(id).length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('POI locks', () => {
  it('defines eight POIs, each a real subset', () => {
    const ids = Object.keys(POI_PALETTE);
    expect(ids).toHaveLength(8);
    for (const id of ids) {
      const lock = POI_PALETTE[id as keyof typeof POI_PALETTE];
      expect(lock.length).toBeGreaterThan(3);
      expect(lock.length).toBeLessThan(MASTER_PALETTE.length);
      for (const c of lock) expect(isInPalette(c)).toBe(true);
    }
  });

  it('gives each POI a distinct lock — no two are the same set', () => {
    const keys = Object.values(POI_PALETTE).map((lock) => [...lock].sort().join(','));
    expect(new Set(keys).size).toBe(8);
  });
});

describe('snapping', () => {
  it('leaves a palette colour untouched', () => {
    expect(snapToPalette(NEUTRAL[3]!)).toBe(NEUTRAL[3]!);
  });

  it('pulls a near-miss to its nearest neighbour', () => {
    const target = NEUTRAL[3]!;
    const nudged = rgba(
      ((target >>> 24) & 255) + 2,
      ((target >>> 16) & 255) - 1,
      ((target >>> 8) & 255) + 1,
    );
    expect(snapToPalette(nudged)).toBe(target);
  });

  it('always returns something in the palette', () => {
    for (let i = 0; i < 200; i++) {
      const c = rgba((i * 37) % 256, (i * 91) % 256, (i * 13) % 256);
      expect(isInPalette(snapToPalette(c))).toBe(true);
    }
  });

  it('honours a restricted allowed set', () => {
    const allowed = CONCORD_RAMP;
    for (let i = 0; i < 50; i++) {
      const c = rgba((i * 51) % 256, (i * 17) % 256, (i * 200) % 256);
      expect(allowed).toContain(snapToPalette(c, allowed));
    }
  });

  it('passes transparency through rather than snapping it to black', () => {
    expect(snapToPalette(EMPTY)).toBe(EMPTY);
  });
});

describe('shadeStep', () => {
  it('indexes into a ramp', () => {
    expect(shadeStep(NEUTRAL, 2)).toBe(NEUTRAL[2]!);
  });

  it('clamps rather than wrapping or returning undefined', () => {
    expect(shadeStep(NEUTRAL, -5)).toBe(NEUTRAL[0]!);
    expect(shadeStep(NEUTRAL, 999)).toBe(NEUTRAL.at(-1)!);
  });

  it('rounds a fractional step', () => {
    expect(shadeStep(NEUTRAL, 1.6)).toBe(NEUTRAL[2]!);
  });
});

describe('the palette is immutable at runtime', () => {
  it('refuses mutation of the master palette', () => {
    expect(Object.isFrozen(MASTER_PALETTE)).toBe(true);
  });

  it('refuses mutation of every ramp', () => {
    for (const ramp of [NEUTRAL, WARM, CONCORD_RAMP, COALITION_RAMP, SPACE, UI]) {
      expect(Object.isFrozen(ramp)).toBe(true);
    }
  });

  it('refuses mutation of the faction and POI locks, inner arrays included', () => {
    expect(Object.isFrozen(FACTION_PALETTE)).toBe(true);
    expect(Object.isFrozen(POI_PALETTE)).toBe(true);
    for (const lock of Object.values(FACTION_PALETTE)) expect(Object.isFrozen(lock)).toBe(true);
    for (const lock of Object.values(POI_PALETTE)) expect(Object.isFrozen(lock)).toBe(true);
  });

  it('hands out a frozen ramp from rampOf', () => {
    expect(Object.isFrozen(rampOf('concord'))).toBe(true);
  });
});
