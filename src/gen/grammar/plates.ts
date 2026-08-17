/**
 * Plating and shading — the second half of the shape grammar.
 *
 * Takes a profile and paints it: horizontal plate bands, each a slightly
 * different value so the hull reads as assembled from big flat pieces; a
 * single-pixel dark seam between bands; and a light baked in from the top-left,
 * which means edges facing up and left take the bright end of the ramp and
 * edges facing down and right take the dark end.
 *
 * The shading is deliberately coarse — two or three ramp steps with an ordered
 * dither between them. Smooth gradients would fight the pixel scale, and the
 * detail-density rule says a hull must read as plate, not as texture.
 */

import type { Rng } from '../../sim/rng.js';
import {
  createBuf, setPx, type PixBuf, type Rgba,
} from '../pixbuf.js';
import { shadeStep } from '../palette.js';
import { isFilled, type Profile } from './profile.js';

export interface PlateSpec {
  profile: Profile;
  ramp: readonly Rgba[];
  rng: Rng;
}

export interface PlatedHull {
  buf: PixBuf;
  /** x coordinate of the hull centreline inside `buf`. */
  centreX: number;
  plateCount: number;
}

/** Mid-ramp index that unlit interior plate sits at. */
export const BASE_STEP = 3;

/**
 * 4x4 Bayer matrix, normalised to a boolean test at 50%.
 *
 * At exactly 50% coverage a Bayer matrix's threshold is, by construction, a
 * plain checkerboard — it is built recursively from a 2x2 checkerboard base,
 * so the coarsest bit-plane a midpoint threshold reads out is always that
 * base pattern. That is correct here, not a bug: a checkerboard is the
 * canonical 50% ordered dither and, between two adjacent ramp steps, reads as
 * shading rather than as a visible texture. What actually ruins hull plate is
 * clumping — fully-on 2x2 blocks reading as woven texture — and a Bayer
 * threshold has none of that.
 */
const BAYER: readonly number[] = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

export function ditherMask(x: number, y: number): boolean {
  const i = (((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4);
  return BAYER[i]! < 8;
}

/** True when the pixel's exposed side faces up and left — the lit direction. */
function facesLight(profile: Profile, cx: number, x: number, y: number): boolean {
  const rel = x - cx;
  return (
    !isFilled(profile, rel, y - 1) ||
    !isFilled(profile, rel - 1, y) ||
    !isFilled(profile, rel - 1, y - 1)
  );
}

/** True when the pixel's exposed side faces down and right — the shadow direction. */
function facesShadow(profile: Profile, cx: number, x: number, y: number): boolean {
  const rel = x - cx;
  return (
    !isFilled(profile, rel, y + 1) ||
    !isFilled(profile, rel + 1, y) ||
    !isFilled(profile, rel + 1, y + 1)
  );
}

export function plateHull(spec: PlateSpec): PlatedHull {
  const { profile, ramp, rng } = spec;
  const centreX = profile.maxHalfWidth;
  const buf = createBuf(profile.maxHalfWidth * 2 + 1, profile.length);

  // Plate bands. Roughly one plate per 14px of hull, jittered, so a corvette
  // gets 3 and a capital gets 10 — the density reads the same at every size.
  const targetPlates = Math.max(3, Math.min(12, Math.round(profile.length / 14)));
  const boundaries: number[] = [];
  {
    let y = 0;
    while (y < profile.length) {
      const span = Math.max(4, Math.round((profile.length / targetPlates) * rng.range(0.7, 1.3)));
      y += span;
      if (y < profile.length - 2) boundaries.push(y);
    }
  }
  const plateCount = boundaries.length + 1;

  // Each plate carries a small base-value offset so neighbours are separable
  // without anything as loud as a different colour.
  const plateOffset = new Int32Array(plateCount);
  for (let i = 0; i < plateCount; i++) {
    plateOffset[i] = rng.int(3) - 1; // -1, 0, or +1
  }

  const seamRows = new Set(boundaries);
  const plateIndexAt = (y: number): number => {
    let i = 0;
    for (const b of boundaries) {
      if (y >= b) i++;
    }
    return i;
  };

  for (let y = 0; y < profile.length; y++) {
    const plate = plateIndexAt(y);
    const offset = plateOffset[plate]!;
    const half = profile.halfWidth[y]!;
    if (half === 0) continue;

    for (let x = centreX - half; x <= centreX + half; x++) {
      let step = BASE_STEP + offset;

      if (seamRows.has(y)) {
        // Panel seam: one pixel, two steps down, drawn across the whole plate.
        step -= 2;
      } else {
        const lit = facesLight(profile, centreX, x, y);
        const shadow = facesShadow(profile, centreX, x, y);

        if (lit && !shadow) {
          step += 2;
        } else if (shadow && !lit) {
          step -= 2;
        } else {
          // Interior plate: dither between this step and one above so a large
          // flat area has texture without gaining detail.
          if (ditherMask(x, y)) step += 1;
        }
      }

      setPx(buf, x, y, shadeStep(ramp, step));
    }
  }

  return { buf, centreX, plateCount };
}
