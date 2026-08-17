import { describe, expect, it } from 'vitest';
import { countOpaque, createBuf, EMPTY, getPx, rgba } from './pixbuf.js';
import {
  drawText, GLYPH_ADVANCE, GLYPH_H, GLYPH_W, hasGlyph, renderText, textWidth,
} from './font.js';

const WHITE = rgba(255, 255, 255);

describe('glyph coverage', () => {
  it('covers A-Z', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(hasGlyph(ch)).toBe(true);
  });

  it('covers 0-9', () => {
    for (const ch of '0123456789') expect(hasGlyph(ch)).toBe(true);
  });

  it('covers the punctuation the contact sheet labels need', () => {
    for (const ch of ' -.:/') expect(hasGlyph(ch)).toBe(true);
  });

  it('maps lowercase onto the uppercase glyph', () => {
    expect(hasGlyph('a')).toBe(true);
  });

  it('reports an unmapped character as missing', () => {
    expect(hasGlyph('é')).toBe(false);
  });
});

describe('metrics', () => {
  it('uses a 5x7 cell with a one-pixel gap', () => {
    expect(GLYPH_W).toBe(5);
    expect(GLYPH_H).toBe(7);
    expect(GLYPH_ADVANCE).toBe(6);
  });

  it('measures text without a trailing gap', () => {
    expect(textWidth('A')).toBe(5);
    expect(textWidth('AB')).toBe(11);
    expect(textWidth('ABC')).toBe(17);
  });

  it('scales metrics by integers', () => {
    expect(textWidth('AB', 2)).toBe(22);
    expect(textWidth('', 3)).toBe(0);
  });
});

describe('drawing', () => {
  it('puts ink on the buffer', () => {
    const b = createBuf(40, 10);
    drawText(b, 'A', 0, 0, WHITE);
    expect(countOpaque(b)).toBeGreaterThan(5);
  });

  it('leaves a space blank', () => {
    const b = createBuf(20, 10);
    drawText(b, ' ', 0, 0, WHITE);
    expect(countOpaque(b)).toBe(0);
  });

  it('draws in the requested colour only', () => {
    const b = createBuf(20, 10);
    const red = rgba(255, 0, 0);
    drawText(b, 'X', 0, 0, red);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const c = getPx(b, x, y);
        expect(c === EMPTY || c === red).toBe(true);
      }
    }
  });

  it('stays inside its declared box', () => {
    const b = createBuf(20, 20);
    drawText(b, 'W', 3, 4, WHITE);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (getPx(b, x, y) === EMPTY) continue;
        expect(x).toBeGreaterThanOrEqual(3);
        expect(x).toBeLessThan(3 + GLYPH_W);
        expect(y).toBeGreaterThanOrEqual(4);
        expect(y).toBeLessThan(4 + GLYPH_H);
      }
    }
  });

  it('advances between characters', () => {
    const a = createBuf(30, 10);
    drawText(a, 'II', 0, 0, WHITE);
    const b = createBuf(30, 10);
    drawText(b, 'I', 0, 0, WHITE);
    expect(countOpaque(a)).toBe(countOpaque(b) * 2);
  });

  it('clips at the edge without throwing or wrapping', () => {
    const b = createBuf(8, 8);
    expect(() => drawText(b, 'LONG TEXT', 0, 0, WHITE)).not.toThrow();
    expect(() => drawText(b, 'A', -20, -20, WHITE)).not.toThrow();
  });

  it('renders an unknown character as a visible box rather than nothing', () => {
    const b = createBuf(20, 10);
    drawText(b, 'é', 0, 0, WHITE);
    expect(countOpaque(b)).toBeGreaterThan(10);
  });

  it('scales by whole pixels', () => {
    const one = createBuf(40, 20);
    drawText(one, 'A', 0, 0, WHITE, 1);
    const two = createBuf(40, 20);
    drawText(two, 'A', 0, 0, WHITE, 2);
    expect(countOpaque(two)).toBe(countOpaque(one) * 4);
  });

  it('distinguishes different letters', () => {
    const a = createBuf(20, 10);
    drawText(a, 'A', 0, 0, WHITE);
    const b = createBuf(20, 10);
    drawText(b, 'B', 0, 0, WHITE);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });
});

describe('renderText', () => {
  it('returns a buffer sized to the text', () => {
    const buf = renderText('AB', WHITE);
    expect(buf.w).toBe(textWidth('AB'));
    expect(buf.h).toBe(GLYPH_H);
  });

  it('returns a 1x1 buffer for empty text rather than throwing', () => {
    const buf = renderText('', WHITE);
    expect(buf.w).toBe(1);
    expect(countOpaque(buf)).toBe(0);
  });
});
