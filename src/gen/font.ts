/**
 * A 5x7 bitmap font — the project's only typeface, rendered at integer scales
 * only.
 *
 * Each glyph is five column bytes. Bit 0 of a column is its top row, bit 6 the
 * bottom, so a column byte never exceeds 0x7F. This is the classic 5x7 cell
 * that early terminal hardware used, which is exactly the register the UI is
 * meant to speak in.
 */

import { createBuf, setPx, type PixBuf, type Rgba } from './pixbuf.js';

export const GLYPH_W = 5 as const;
export const GLYPH_H = 7 as const;
/** Cell width plus a one-pixel inter-character gap. */
export const GLYPH_ADVANCE = 6 as const;

/** Column bitmaps, LSB = top row. */
const GLYPHS: Readonly<Record<string, readonly number[]>> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x01, 0x01],
  G: [0x3e, 0x41, 0x41, 0x51, 0x32],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x04, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x7f, 0x20, 0x18, 0x20, 0x7f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x03, 0x04, 0x78, 0x04, 0x03],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

/** Rendered for any character with no glyph, so a gap is visible rather than silent. */
const MISSING: readonly number[] = [0x7f, 0x7f, 0x7f, 0x7f, 0x7f];

function glyphOf(ch: string): readonly number[] {
  return GLYPHS[ch.toUpperCase()] ?? MISSING;
}

export function hasGlyph(ch: string): boolean {
  return ch.toUpperCase() in GLYPHS;
}

/**
 * Scales must be whole pixels.
 *
 * A fractional scale does not merely look wrong — `col * scale` produces
 * fractional coordinates, typed-array indexing silently no-ops on them, and the
 * glyph comes out with pieces missing. Failing here is far better than shipping
 * a contact sheet nobody can explain.
 */
function assertIntegerScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError(`font scale must be a positive integer, got ${scale}`);
  }
}

export function textWidth(text: string, scale = 1): number {
  assertIntegerScale(scale);
  if (text.length === 0) return 0;
  return (text.length * GLYPH_ADVANCE - 1) * scale;
}

export function drawText(
  dst: PixBuf,
  text: string,
  x: number,
  y: number,
  color: Rgba,
  scale = 1,
): void {
  assertIntegerScale(scale);
  for (let i = 0; i < text.length; i++) {
    const columns = glyphOf(text[i]!);
    const originX = x + i * GLYPH_ADVANCE * scale;

    for (let col = 0; col < GLYPH_W; col++) {
      const bits = columns[col]!;
      for (let row = 0; row < GLYPH_H; row++) {
        if ((bits & (1 << row)) === 0) continue;
        // Scale by painting a scale x scale block; setPx clips for us.
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPx(dst, originX + col * scale + sx, y + row * scale + sy, color);
          }
        }
      }
    }
  }
}

export function renderText(text: string, color: Rgba, scale = 1): PixBuf {
  assertIntegerScale(scale);
  const buf = createBuf(Math.max(1, textWidth(text, scale)), GLYPH_H * scale);
  drawText(buf, text, 0, 0, color, scale);
  return buf;
}
