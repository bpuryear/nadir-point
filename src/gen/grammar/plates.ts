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
  createBuf, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from '../pixbuf.js';
import { shadeStep } from '../palette.js';
import { isFilled, type Profile } from './profile.js';

export interface PlateSpec {
  profile: Profile;
  ramp: readonly Rgba[];
  rng: Rng;
}

/** A single plate band: the inclusive row range it spans. */
export interface PlateBand {
  y0: number;
  y1: number;
}

export interface PlatedHull {
  buf: PixBuf;
  /** x coordinate of the hull centreline inside `buf`. */
  centreX: number;
  plateCount: number;
  /** The row range each plate band spans, bow to stern. */
  plates: readonly PlateBand[];
  /** Which pixels of `buf` were resolved by the interior dither, and how. */
  plan: DitherPlan;
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

/**
 * A parallel record of which pixels of a colour buffer were resolved by an
 * interior dither, and what they were dithering between.
 *
 * Rotating an already-dithered buffer scrambles the checkerboard into diagonal
 * clumps — rotation maps a pixel's four-neighbourhood to different pixels than
 * the ones the dither pattern was built against, and a Bayer mask evaluated in
 * the wrong frame is not a Bayer mask any more. The fix is to defer the dither
 * decision until the pixel has landed in its final frame: carry *what* a pixel
 * is dithering between (a ramp and a base step) through every transform that
 * would otherwise scramble it, and only call `ditherMask` once, in destination
 * coordinates, at the point a bin is baked.
 *
 * `base[i] < 0` marks a pixel that is not part of an interior dither — a seam,
 * a lit or shadowed edge, or anything outside the plate grammar entirely — and
 * callers should fall back to whatever colour the paired buffer already holds.
 */
export interface DitherPlan {
  readonly w: number;
  readonly h: number;
  readonly base: Int16Array;
  readonly ramp: (readonly Rgba[] | undefined)[];
}

export function createDitherPlan(w: number, h: number): DitherPlan {
  return { w, h, base: new Int16Array(w * h).fill(-1), ramp: new Array(w * h).fill(undefined) };
}

function planIndex(plan: DitherPlan, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= plan.w || y >= plan.h) return null;
  return y * plan.w + x;
}

/** Marks a pixel as dithering between `ramp[base]` and `ramp[base + 1]`. */
export function setDitherPlan(
  plan: DitherPlan, x: number, y: number, ramp: readonly Rgba[], base: number,
): void {
  const i = planIndex(plan, x, y);
  if (i === null) return;
  plan.base[i] = base;
  plan.ramp[i] = ramp;
}

/** Marks a pixel as not part of an interior dither. */
export function clearDitherPlan(plan: DitherPlan, x: number, y: number): void {
  const i = planIndex(plan, x, y);
  if (i === null) return;
  plan.base[i] = -1;
  plan.ramp[i] = undefined;
}

/** Reads a plan entry directly. Exposed for tests and instrumentation that
 * need the raw base/ramp rather than a resolved colour. */
export function getDitherPlan(
  plan: DitherPlan, x: number, y: number,
): { ramp: readonly Rgba[]; base: number } | null {
  const i = planIndex(plan, x, y);
  if (i === null) return null;
  const base = plan.base[i]!;
  if (base < 0) return null;
  return { ramp: plan.ramp[i]!, base };
}

/**
 * Copies plan entries from `src` into `dst` at offset `(dx, dy)`, mirroring
 * `blit`'s "only where the source pixel is opaque" rule so a plan tracks
 * exactly the provenance of whatever colour buffer it is paired with.
 */
export function blitDitherPlan(
  dst: DitherPlan, src: DitherPlan, srcBuf: PixBuf, dx: number, dy: number,
): void {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (!isOpaque(getPx(srcBuf, x, y))) continue;
      const entry = getDitherPlan(src, x, y);
      if (entry === null) clearDitherPlan(dst, tx, ty);
      else setDitherPlan(dst, tx, ty, entry.ramp, entry.base);
    }
  }
}

/**
 * Resolves the colour a plan-tracked pixel should take, evaluating the dither
 * mask fresh at `(dx, dy)` — the pixel's coordinates in whatever frame it is
 * about to be drawn into, not the frame it was generated in. Pixels the plan
 * does not cover fall back to `fallback`, which callers pass as the colour the
 * paired buffer already holds.
 */
export function resolveDither(
  plan: DitherPlan, sx: number, sy: number, dx: number, dy: number, fallback: Rgba,
): Rgba {
  const entry = getDitherPlan(plan, sx, sy);
  if (entry === null) return fallback;
  return shadeStep(entry.ramp, entry.base + (ditherMask(dx, dy) ? 1 : 0));
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
  const plan = createDitherPlan(buf.w, buf.h);

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
    const left = profile.leftWidth[y]!;
    const right = profile.rightWidth[y]!;
    if (left === 0 && right === 0) continue;

    for (let x = centreX - left; x <= centreX + right; x++) {
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
          // flat area has texture without gaining detail. Recorded in the plan
          // *before* the mask is applied — the rotation baker re-evaluates the
          // mask itself once the pixel has landed in its final frame, rather
          // than inheriting this decision as a fixed colour.
          setDitherPlan(plan, x, y, ramp, step);
          if (ditherMask(x, y)) step += 1;
        }
      }

      setPx(buf, x, y, shadeStep(ramp, step));
    }
  }

  // Bands from the same `boundaries` array the shading pass already computed.
  // Band 0 runs 0..boundaries[0]-1, the next boundaries[0]..boundaries[1]-1,
  // and so on, with the last band closing out at the hull's final row.
  const plates: PlateBand[] = [];
  {
    let y0 = 0;
    for (const b of boundaries) {
      plates.push({ y0, y1: b - 1 });
      y0 = b;
    }
    plates.push({ y0, y1: profile.length - 1 });
  }

  return { buf, centreX, plateCount, plates, plan };
}
