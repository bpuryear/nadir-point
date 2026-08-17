/**
 * Four LOD tiers, one per zoom level.
 *
 * Zoom never scales a sprite. A 128px cruiser squeezed to 4px is mush, and mush
 * at the far end kills the wide shot the game is sold on. Instead each hull
 * exists at four discrete sizes and the camera swaps between them.
 *
 * Tiers 2 and 3 are reductions, but not box filters. A plain average erases the
 * two things that have to survive: the outline, which is the only way ships stay
 * tellable apart, and the running lights, which are the scale cue that makes a
 * small sprite read as a huge object. So the reduction scores candidate colours
 * by count *plus* a heavy bonus for emissives and a smaller one for
 * silhouette-edge pixels. Interior panel seams are expected to vanish by tier 3.
 * The outline is not.
 *
 * Tier 4 is not reduced at all. At four pixels the question is which four
 * pixels, and no filter answers it well — so it is drawn from the shape
 * grammar's profile directly, which already knows where the spine and the mass
 * are.
 */

import {
  createBuf, EMPTY, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { isEmissive, snapToPalette } from './palette.js';
import { type Profile } from './grammar/profile.js';

/** Divisor per zoom level: close, tactical, operational, wide. */
export const LOD_DIVISORS: readonly [1, 4, 8, 32] = [1, 4, 8, 32];

export type LodTier = 0 | 1 | 2 | 3;

/** Below three pixels a silhouette cannot encode a spine, so the far tier clamps. */
export const TIER_FLOOR = 3;

/** An emissive pixel counts this much more than a hull pixel when reducing. */
export const EMISSIVE_WEIGHT = 8;

/** A silhouette-edge pixel counts this much more than an interior one. */
export const EDGE_WEIGHT = 3;

/** A block this full or fuller survives as an opaque pixel. Biased to preserve. */
export const FILL_THRESHOLD = 0.25;

function isEdgePixel(src: PixBuf, x: number, y: number): boolean {
  return (
    !isOpaque(getPx(src, x - 1, y)) || !isOpaque(getPx(src, x + 1, y)) ||
    !isOpaque(getPx(src, x, y - 1)) || !isOpaque(getPx(src, x, y + 1))
  );
}

export function reduceTier(src: PixBuf, divisor: number, allowed: readonly Rgba[]): PixBuf {
  // No TIER_FLOOR here — that floor belongs to the generated far tier. A plain
  // reduction is only ever asked to divide by 4 or 8 against real hull sizes,
  // where round(dim/divisor) is already comfortably above three; clamping it
  // here would only distort the block grid on tiny inputs (as the unit tests
  // below rely on) without ever mattering on a real hull.
  const w = Math.max(1, Math.round(src.w / divisor));
  const h = Math.max(1, Math.round(src.h / divisor));
  const out = createBuf(w, h);

  const blockW = src.w / w;
  const blockH = src.h / h;

  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor(ox * blockW);
      const y0 = Math.floor(oy * blockH);
      const x1 = Math.min(src.w, Math.ceil((ox + 1) * blockW));
      const y1 = Math.min(src.h, Math.ceil((oy + 1) * blockH));
      const area = (x1 - x0) * (y1 - y0);

      const scores = new Map<Rgba, number>();
      let filled = 0;
      let total = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          const c = getPx(src, x, y);
          if (!isOpaque(c)) continue;
          filled++;

          // An emissive pixel's weight is scaled by the whole block's area, not
          // just EMISSIVE_WEIGHT flat, so a single running-light pixel always
          // outscores every other pixel in the block combined — even if every
          // one of them is a silhouette edge. EDGE_WEIGHT < EMISSIVE_WEIGHT
          // guarantees (area - 1) * EDGE_WEIGHT < area * EMISSIVE_WEIGHT for
          // any area, so the light can never be voted out by the hull around
          // it. That is the whole point of tier 2/3 reduction: the light is
          // the scale cue and must survive no matter how rare it is.
          let weight = 1;
          if (isEmissive(c)) weight = EMISSIVE_WEIGHT * area;
          else if (isEdgePixel(src, x, y)) weight = EDGE_WEIGHT;

          scores.set(c, (scores.get(c) ?? 0) + weight);
        }
      }

      if (total === 0 || filled / total < FILL_THRESHOLD) {
        setPx(out, ox, oy, EMPTY);
        continue;
      }

      let best = EMPTY;
      let bestScore = -1;
      for (const [color, score] of scores) {
        if (score > bestScore) {
          bestScore = score;
          best = color;
        }
      }

      setPx(out, ox, oy, snapToPalette(best, allowed));
    }
  }

  return out;
}

/**
 * The far tier, drawn from the profile rather than filtered down to it.
 *
 * The profile is resampled to the target length and filled; one emissive pixel
 * goes at the stern so even a speck carries a light.
 */
export function silhouetteTier(
  profile: Profile,
  targetLength: number,
  hullColor: Rgba,
  lightColor: Rgba,
): PixBuf {
  const h = Math.max(TIER_FLOOR, targetLength);
  const scale = profile.length / h;

  // Width follows the profile's own aspect ratio, floored so the hull has body.
  const w = Math.max(TIER_FLOOR, Math.round(((profile.maxHalfWidth * 2 + 1) / scale)));
  const out = createBuf(w, h);
  const cx = Math.floor(w / 2);

  for (let y = 0; y < h; y++) {
    // Sample the middle of the source band this output row represents.
    const sy = Math.min(profile.length - 1, Math.floor((y + 0.5) * scale));
    const halfSource = profile.halfWidth[sy]!;

    // `half` is already the row's width measured in *output* pixels: length
    // and width share one profile coordinate space, so dividing by the same
    // row-compression `scale` converts both consistently. Re-checking each
    // output column against the profile with an offset re-multiplied by
    // `scale` (as an earlier version of this did) throws that away — at these
    // compression ratios (scale in the tens) almost no offset survives that
    // round trip, so every row silently collapses to its centre pixel and
    // ships of every size end up with the same silhouette. Filling the span
    // directly is both simpler and correct.
    const half = Math.min(cx, Math.max(0, Math.round(halfSource / scale)));
    for (let x = cx - half; x <= cx + half; x++) {
      setPx(out, x, y, hullColor);
    }

    // Guarantee the row is present at all — a resampled hull that vanishes to
    // nothing mid-body would break the silhouette read.
    if (!isOpaque(getPx(out, cx, y))) setPx(out, cx, y, hullColor);
  }

  // One light, at the stern, on the centreline.
  setPx(out, cx, h - 1, lightColor);

  return out;
}

export function buildLodSet(
  src: PixBuf,
  profile: Profile,
  allowed: readonly Rgba[],
  hullColor: Rgba,
  lightColor: Rgba,
): PixBuf[] {
  return [
    src,
    reduceTier(src, LOD_DIVISORS[1], allowed),
    reduceTier(src, LOD_DIVISORS[2], allowed),
    silhouetteTier(profile, Math.round(src.h / LOD_DIVISORS[3]), hullColor, lightColor),
  ];
}
