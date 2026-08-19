import { describe, expect, it } from 'vitest';
import { createBuf } from '../gen/pixbuf.js';
import { layoutForBins, MAX_ATLAS_DIMENSION, packUniform } from './atlaspack.js';

describe('packUniform', () => {
  it('places every cell', () => {
    const layout = packUniform(64, 40, 40);
    expect(layout.rects).toHaveLength(64);
    expect(new Set(layout.rects.map((r) => r.index)).size).toBe(64);
  });

  it('never overlaps two cells', () => {
    const layout = packUniform(64, 37, 41);
    for (let i = 0; i < layout.rects.length; i++) {
      for (let j = i + 1; j < layout.rects.length; j++) {
        const a = layout.rects[i]!;
        const b = layout.rects[j]!;
        const disjoint =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(disjoint, `rect ${a.index} overlaps ${b.index}`).toBe(true);
      }
    }
  });

  it('keeps every cell inside the reported bounds', () => {
    const layout = packUniform(64, 37, 41);
    for (const r of layout.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(layout.width);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it('uses whole-pixel positions', () => {
    // A cell on a fractional texel samples its neighbour's edge and bleeds.
    const layout = packUniform(64, 40, 40);
    for (const r of layout.rects) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
    }
  });

  it('stays within the maximum texture dimension', () => {
    const layout = packUniform(64, 190, 190);
    expect(layout.width).toBeLessThanOrEqual(MAX_ATLAS_DIMENSION);
  });

  it('throws rather than silently truncating when the cells cannot fit', () => {
    expect(() => packUniform(64, 4000, 4000)).toThrow(RangeError);
  });

  it('handles a single cell', () => {
    const layout = packUniform(1, 12, 12);
    expect(layout.rects).toHaveLength(1);
    expect(layout.rects[0]).toEqual({ index: 0, x: 0, y: 0, w: 12, h: 12 });
  });
});

describe('layoutForBins', () => {
  it('sizes cells to the largest bin so every bin fits its cell', () => {
    // bakeRotations returns equal-sized bins, but taking the max rather than
    // assuming it means an unequal set degrades to wasted space, not corruption.
    const bins = [createBuf(30, 30), createBuf(40, 36), createBuf(20, 20)];
    const layout = layoutForBins(bins);
    for (const r of layout.rects) {
      expect(r.w).toBeGreaterThanOrEqual(40);
      expect(r.h).toBeGreaterThanOrEqual(36);
    }
  });

  it('produces one rect per bin', () => {
    const bins = Array.from({ length: 64 }, () => createBuf(48, 48));
    expect(layoutForBins(bins).rects).toHaveLength(64);
  });

  it('rejects an empty bin list', () => {
    expect(() => layoutForBins([])).toThrow(RangeError);
  });
});
