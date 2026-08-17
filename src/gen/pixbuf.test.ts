import { describe, expect, it } from 'vitest';
import {
  alphaOf, blit, blitOpaque, blueOf, countOpaque, createBuf, cloneBuf, crop,
  EMPTY, fillBuf, fromHex, getPx, greenOf, isOpaque, luminance, opaqueBounds,
  redOf, rgba, setPx,
} from './pixbuf.js';

const RED = rgba(255, 0, 0);
const BLUE = rgba(0, 0, 255);

describe('packed colour', () => {
  it('packs and unpacks channels', () => {
    const c = rgba(18, 52, 86, 120);
    expect(redOf(c)).toBe(18);
    expect(greenOf(c)).toBe(52);
    expect(blueOf(c)).toBe(86);
    expect(alphaOf(c)).toBe(120);
  });

  it('defaults alpha to opaque', () => {
    expect(alphaOf(rgba(1, 2, 3))).toBe(255);
  });

  it('stays a positive integer at the top of the range', () => {
    const c = rgba(255, 255, 255, 255);
    expect(c).toBeGreaterThan(0);
    expect(Number.isSafeInteger(c)).toBe(true);
  });

  it('parses hex with and without alpha', () => {
    expect(fromHex('#12345678')).toBe(rgba(0x12, 0x34, 0x56, 0x78));
    expect(fromHex('#123456')).toBe(rgba(0x12, 0x34, 0x56, 255));
  });

  it('rejects malformed hex rather than producing NaN pixels', () => {
    expect(() => fromHex('123456')).toThrow();
    expect(() => fromHex('#12345')).toThrow();
  });

  it('treats EMPTY as transparent and everything else by its alpha', () => {
    expect(isOpaque(EMPTY)).toBe(false);
    expect(isOpaque(rgba(0, 0, 0, 255))).toBe(true);
  });

  it('measures luminance', () => {
    expect(luminance(rgba(0, 0, 0))).toBe(0);
    expect(luminance(rgba(255, 255, 255))).toBeCloseTo(255, 0);
    expect(luminance(rgba(255, 0, 0))).toBeLessThan(luminance(rgba(0, 255, 0)));
  });
});

describe('buffer creation', () => {
  it('starts fully transparent', () => {
    const b = createBuf(4, 3);
    expect(b.w).toBe(4);
    expect(b.h).toBe(3);
    expect(b.data.length).toBe(4 * 3 * 4);
    expect(countOpaque(b)).toBe(0);
  });

  it('rejects a non-positive size', () => {
    expect(() => createBuf(0, 4)).toThrow(RangeError);
    expect(() => createBuf(4, -1)).toThrow(RangeError);
  });

  it('clones without sharing memory', () => {
    const a = createBuf(2, 2);
    setPx(a, 0, 0, RED);
    const b = cloneBuf(a);
    setPx(b, 1, 1, BLUE);
    expect(getPx(a, 1, 1)).toBe(EMPTY);
    expect(getPx(b, 0, 0)).toBe(RED);
  });
});

describe('pixel access', () => {
  it('round-trips a pixel', () => {
    const b = createBuf(3, 3);
    setPx(b, 1, 2, RED);
    expect(getPx(b, 1, 2)).toBe(RED);
  });

  it('returns EMPTY outside the buffer instead of throwing', () => {
    const b = createBuf(2, 2);
    expect(getPx(b, -1, 0)).toBe(EMPTY);
    expect(getPx(b, 0, -1)).toBe(EMPTY);
    expect(getPx(b, 2, 0)).toBe(EMPTY);
    expect(getPx(b, 0, 2)).toBe(EMPTY);
  });

  it('silently ignores writes outside the buffer', () => {
    const b = createBuf(2, 2);
    expect(() => setPx(b, -5, 5, RED)).not.toThrow();
    expect(countOpaque(b)).toBe(0);
  });

  it('fills every pixel', () => {
    const b = createBuf(3, 2);
    fillBuf(b, BLUE);
    expect(countOpaque(b)).toBe(6);
    expect(getPx(b, 2, 1)).toBe(BLUE);
  });
});

describe('blit', () => {
  it('copies opaque pixels and skips transparent ones', () => {
    const dst = createBuf(4, 4);
    fillBuf(dst, BLUE);
    const src = createBuf(2, 2);
    setPx(src, 0, 0, RED); // (1,1) transparent

    blit(dst, src, 1, 1);
    expect(getPx(dst, 1, 1)).toBe(RED);
    expect(getPx(dst, 2, 2)).toBe(BLUE); // transparent source left the target alone
  });

  it('clips at every edge without wrapping', () => {
    const dst = createBuf(4, 4);
    const src = createBuf(2, 2);
    fillBuf(src, RED);

    blit(dst, src, -1, -1);
    expect(getPx(dst, 0, 0)).toBe(RED);
    expect(getPx(dst, 3, 3)).toBe(EMPTY); // did not wrap around

    blit(dst, src, 3, 3);
    expect(getPx(dst, 3, 3)).toBe(RED);
    expect(countOpaque(dst)).toBe(2);
  });

  it('is a no-op when placed entirely outside', () => {
    const dst = createBuf(4, 4);
    const src = createBuf(2, 2);
    fillBuf(src, RED);
    blit(dst, src, 10, 10);
    blit(dst, src, -10, -10);
    expect(countOpaque(dst)).toBe(0);
  });

  it('blitOpaque carries transparency across, punching holes', () => {
    const dst = createBuf(2, 2);
    fillBuf(dst, BLUE);
    const src = createBuf(2, 2); // fully transparent
    blitOpaque(dst, src, 0, 0);
    expect(countOpaque(dst)).toBe(0);
  });
});

describe('bounds and crop', () => {
  it('finds the tight box around opaque pixels', () => {
    const b = createBuf(8, 8);
    setPx(b, 2, 3, RED);
    setPx(b, 5, 6, RED);
    expect(opaqueBounds(b)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 6 });
  });

  it('returns null for a fully transparent buffer', () => {
    expect(opaqueBounds(createBuf(4, 4))).toBeNull();
  });

  it('handles a single pixel', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, RED);
    expect(opaqueBounds(b)).toEqual({ x0: 1, y0: 1, x1: 1, y1: 1 });
  });

  it('crops a region', () => {
    const b = createBuf(4, 4);
    setPx(b, 2, 2, RED);
    const c = crop(b, 2, 2, 2, 2);
    expect(c.w).toBe(2);
    expect(getPx(c, 0, 0)).toBe(RED);
  });

  it('fills out-of-range crop area with transparency rather than throwing', () => {
    const b = createBuf(2, 2);
    fillBuf(b, RED);
    const c = crop(b, 1, 1, 3, 3);
    expect(getPx(c, 0, 0)).toBe(RED);
    expect(getPx(c, 2, 2)).toBe(EMPTY);
  });
});
