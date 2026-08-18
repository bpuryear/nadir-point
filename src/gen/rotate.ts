/**
 * The rotation baker.
 *
 * Sprites are never rotated at runtime. Instead each composite is baked into 64
 * fixed bins, 5.625 degrees apart, and the renderer blits the nearest bin
 * unrotated at integer device pixels. That makes "zero sub-pixel artifacts" a
 * structural property of the pipeline rather than something to tune toward:
 * there is no runtime resampling that could shimmer, because there is no runtime
 * rotation.
 *
 * The cost is a bake, and the bake is cheap — a cruiser composite takes one to
 * two milliseconds and only runs on refit or a damage-state change, so the refit
 * screen still updates instantly.
 *
 * Every bin shares one square canvas sized to the source's diagonal, so a bin
 * can be swapped for another without the sprite's centre moving. The side is
 * forced even so the pivot lands exactly between pixels and bin 0 reproduces the
 * source byte for byte.
 */

import { createBuf, EMPTY, getPx, setPx, type PixBuf } from './pixbuf.js';

export const ROTATION_BINS = 64;

const TAU = Math.PI * 2;

export function binForHeading(radians: number, bins = ROTATION_BINS): number {
  const step = TAU / bins;
  const bin = Math.round(radians / step);
  return ((bin % bins) + bins) % bins;
}

export function headingForBin(bin: number, bins = ROTATION_BINS): number {
  return (bin * TAU) / bins;
}

/** Square side big enough that no rotation of the source clips, forced even. */
export function bakeSize(src: PixBuf): number {
  const diagonal = Math.ceil(Math.hypot(src.w, src.h));
  return diagonal % 2 === 0 ? diagonal : diagonal + 1;
}

export function bakeRotations(src: PixBuf, bins = ROTATION_BINS): PixBuf[] {
  const size = bakeSize(src);
  const out: PixBuf[] = [];

  // Destination pivot is the exact centre of an even-sided canvas.
  const dcx = size / 2;
  const dcy = size / 2;

  // Source pivot placed so bin 0 lands the source on integer pixels.
  const offsetX = Math.floor((size - src.w) / 2);
  const offsetY = Math.floor((size - src.h) / 2);
  const scx = offsetX + src.w / 2;
  const scy = offsetY + src.h / 2;

  for (let bin = 0; bin < bins; bin++) {
    const buf = createBuf(size, size);
    const angle = headingForBin(bin, bins);

    // Inverse rotation: walk destination pixels and sample the source, which is
    // the only way to guarantee every destination pixel is written exactly once
    // and no holes appear.
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        // Sample at pixel centres.
        const rx = dx + 0.5 - dcx;
        const ry = dy + 0.5 - dcy;

        const sx = Math.floor(rx * cos - ry * sin + scx);
        const sy = Math.floor(rx * sin + ry * cos + scy);

        const c = getPx(src, sx - offsetX, sy - offsetY);
        if (c !== EMPTY) setPx(buf, dx, dy, c);
      }
    }

    out.push(buf);
  }

  return out;
}
