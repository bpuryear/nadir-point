import { describe, expect, it } from 'vitest';
import { LOD_DIVISORS } from '../gen/lod.js';
import {
  advanceZoom, crossfadeAlpha, CROSSFADE_SECONDS, lodTierFor, makeZoom,
  setZoom, stepZoom, unitsPerPixel, ZOOM_LEVELS,
} from './zoom.js';

describe('the four levels', () => {
  it('has exactly four, one per LOD tier', () => {
    expect(ZOOM_LEVELS).toEqual([0, 1, 2, 3]);
    expect(ZOOM_LEVELS.length).toBe(LOD_DIVISORS.length);
  });

  it('binds each level to its tier one to one', () => {
    for (const level of ZOOM_LEVELS) expect(lodTierFor(level)).toBe(level);
  });

  it('takes units-per-pixel straight from the LOD divisors', () => {
    // Zoom must never invent a scale the generator has no sprite for.
    for (const level of ZOOM_LEVELS) {
      expect(unitsPerPixel(level)).toBe(LOD_DIVISORS[level]);
    }
  });

  it('never yields a fractional units-per-pixel', () => {
    for (const level of ZOOM_LEVELS) {
      expect(Number.isInteger(unitsPerPixel(level))).toBe(true);
    }
  });
});

describe('changing level', () => {
  it('starts settled', () => {
    const z = makeZoom();
    expect(z.from).toBeNull();
    expect(crossfadeAlpha(z)).toBe(1);
  });

  it('records where it came from and begins a crossfade', () => {
    const z = makeZoom(0);
    setZoom(z, 3);
    expect(z.level).toBe(3);
    expect(z.from).toBe(0);
    expect(crossfadeAlpha(z)).toBeLessThan(1);
  });

  it('settles after the crossfade duration', () => {
    const z = makeZoom(0);
    setZoom(z, 1);
    advanceZoom(z, CROSSFADE_SECONDS);
    expect(crossfadeAlpha(z)).toBe(1);
    expect(z.from).toBeNull();
  });

  it('completes within 100ms, the feedback budget', () => {
    // The spec requires visible feedback within 100ms of any order.
    expect(CROSSFADE_SECONDS).toBeLessThanOrEqual(0.1);
  });

  it('ignores a set to the level it is already on', () => {
    const z = makeZoom(2);
    setZoom(z, 2);
    expect(z.from).toBeNull();
    expect(crossfadeAlpha(z)).toBe(1);
  });

  it('jumps straight to any level without passing through the others', () => {
    // Keys 1-4 bind directly, so Wide must be reachable in one press.
    const z = makeZoom(0);
    setZoom(z, 3);
    expect(z.level).toBe(3);
  });
});

describe('stepping', () => {
  it('moves one level at a time', () => {
    const z = makeZoom(1);
    stepZoom(z, 1);
    expect(z.level).toBe(2);
    stepZoom(z, -1);
    expect(z.level).toBe(1);
  });

  it('clamps at both ends rather than wrapping', () => {
    const z = makeZoom(0);
    stepZoom(z, -1);
    expect(z.level).toBe(0);
    setZoom(z, 3);
    advanceZoom(z, CROSSFADE_SECONDS);
    stepZoom(z, 1);
    expect(z.level).toBe(3);
  });
});

describe('crossfade', () => {
  it('rises monotonically to 1', () => {
    const z = makeZoom(0);
    setZoom(z, 1);
    let previous = crossfadeAlpha(z);
    for (let i = 0; i < 8; i++) {
      advanceZoom(z, CROSSFADE_SECONDS / 8);
      const now = crossfadeAlpha(z);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBe(1);
  });

  it('clamps past the end rather than overshooting', () => {
    const z = makeZoom(0);
    setZoom(z, 1);
    advanceZoom(z, 10);
    expect(crossfadeAlpha(z)).toBe(1);
  });
});
