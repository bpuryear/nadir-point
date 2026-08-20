/**
 * The pixel buffer every generated sprite is made of.
 *
 * Colours are packed into a single number as 0xRRGGBBAA, which makes palette
 * membership a Set lookup rather than a four-way comparison — the palette QC
 * runs over every pixel of every sprite, so that difference is worth the
 * packing.
 *
 * Alpha is binary by project rule: 0 or 255, never between. Partial alpha would
 * make both palette QC and LOD reduction ambiguous, and pixel art does not want
 * it anyway.
 *
 * Out-of-bounds reads return EMPTY and out-of-bounds writes are dropped. That is
 * deliberate: generators draw shapes that legitimately overhang their buffer,
 * and clamping at the primitive keeps every caller from repeating the same
 * bounds check.
 */

export type Rgba = number;

export interface PixBuf {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;
}

/** Inclusive corners. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const EMPTY: Rgba = 0;

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export function fromHex(hex: string): Rgba {
  if (!/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) {
    throw new RangeError(`malformed hex colour: ${hex}`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  return rgba(r, g, b, a);
}

export function redOf(c: Rgba): number {
  return (c >>> 24) & 255;
}

export function greenOf(c: Rgba): number {
  return (c >>> 16) & 255;
}

export function blueOf(c: Rgba): number {
  return (c >>> 8) & 255;
}

export function alphaOf(c: Rgba): number {
  return c & 255;
}

export function isOpaque(c: Rgba): boolean {
  return (c & 255) !== 0;
}

/** Rec. 601 luminance, 0–255. Used by the light-direction check and LOD weighting. */
export function luminance(c: Rgba): number {
  return 0.299 * redOf(c) + 0.587 * greenOf(c) + 0.114 * blueOf(c);
}

export function createBuf(w: number, h: number): PixBuf {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new RangeError(`buffer size must be positive integers, got ${w}x${h}`);
  }
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function cloneBuf(b: PixBuf): PixBuf {
  return { w: b.w, h: b.h, data: new Uint8ClampedArray(b.data) };
}

export function getPx(b: PixBuf, x: number, y: number): Rgba {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return EMPTY;
  const i = (y * b.w + x) * 4;
  return rgba(b.data[i]!, b.data[i + 1]!, b.data[i + 2]!, b.data[i + 3]!);
}

export function setPx(b: PixBuf, x: number, y: number, c: Rgba): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  b.data[i] = redOf(c);
  b.data[i + 1] = greenOf(c);
  b.data[i + 2] = blueOf(c);
  b.data[i + 3] = alphaOf(c);
}

export function fillBuf(b: PixBuf, c: Rgba): void {
  const r = redOf(c), g = greenOf(c), bl = blueOf(c), a = alphaOf(c);
  for (let i = 0; i < b.data.length; i += 4) {
    b.data[i] = r;
    b.data[i + 1] = g;
    b.data[i + 2] = bl;
    b.data[i + 3] = a;
  }
}

/** Copies opaque source pixels; transparent source pixels leave the target untouched. */
export function blit(dst: PixBuf, src: PixBuf, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      const c = getPx(src, x, y);
      if (isOpaque(c)) setPx(dst, tx, ty, c);
    }
  }
}

/** Copies every source pixel including transparency — punches holes in the target. */
export function blitOpaque(dst: PixBuf, src: PixBuf, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      setPx(dst, tx, ty, getPx(src, x, y));
    }
  }
}

export function opaqueBounds(b: PixBuf): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.data[(y * b.w + x) * 4 + 3]! !== 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return null;
  return { x0, y0, x1, y1 };
}

export function crop(b: PixBuf, x0: number, y0: number, w: number, h: number): PixBuf {
  const out = createBuf(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      setPx(out, x, y, getPx(b, x0 + x, y0 + y));
    }
  }
  return out;
}

export function countOpaque(b: PixBuf): number {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) {
    if (b.data[i]! !== 0) n++;
  }
  return n;
}
