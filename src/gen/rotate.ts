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
import { resolveDither, type DitherPlan } from './grammar/plates.js';

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

/**
 * `plan` is optional and, when supplied, must be paired with `src` — same
 * dimensions, same coordinate frame (`compositeShip` and `plateHull` both
 * produce a colour buffer and a plan together for exactly this reason).
 *
 * Rotating an already-dithered sprite scrambles its checkerboard into
 * diagonal clumps: a Bayer mask is only a clean checkerboard when read in the
 * grid it was built for, and rotation changes which pixels are adjacent to
 * which. The fix is to never carry a *resolved* dither pixel through a
 * rotation at all — carry what it was dithering between instead, and decide
 * fresh once the pixel is sitting in the bin's own destination grid, via
 * `resolveDither`.
 *
 * Bin 0 is the exception: it is a pure translation, not a rotation, so it
 * skips the plan entirely and copies `src` as-is. That is what keeps bin 0 a
 * byte-for-byte reproduction of the source regardless of dithering — the
 * property `bakeSize`'s pivot arithmetic is checked against — rather than a
 * fresh dither decision that happens to usually agree with it.
 */
export function bakeRotations(src: PixBuf, bins = ROTATION_BINS, plan?: DitherPlan): PixBuf[] {
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
    const recompute = plan !== undefined && bin !== 0;

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

        const srcX = sx - offsetX;
        const srcY = sy - offsetY;
        const c = getPx(src, srcX, srcY);
        if (c === EMPTY) continue;

        const color = recompute ? resolveDither(plan, srcX, srcY, dx, dy, c) : c;
        setPx(buf, dx, dy, color);
      }
    }

    out.push(buf);
  }

  return out;
}
