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
 * small sprite read as a huge object. So the reduction scores hull candidate
 * colours by count *plus* a bonus for silhouette-edge pixels, and handles
 * running lights separately: any block touching a light is a *candidate* to
 * stay lit, but only a shrinking budget of them actually do, so the lights
 * thin out with the hull instead of multiplying into a solid ladder. Interior
 * panel seams are expected to vanish by tier 3. The outline is not.
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

/**
 * Minimum pixels on either axis at the far tier.
 *
 * Was 3. At 3, a 107px cruiser (107/32 ≈ 3.3) and a 56px destroyer
 * (56/32 ≈ 1.75) both floored to the same 3 rows — two different size classes
 * drawing identical silhouettes in 29% of sampled pairs, which collapsed the
 * acceptance criterion that a cruiser must stay distinguishable from a
 * destroyer at the far tier. At 2, a destroyer floors to 2 rows and a cruiser
 * to 3-4, and the size difference between them becomes the signal instead of
 * being erased by it. Below 2 there is no spine left to draw, so 2 is the
 * true floor.
 *
 * Accepted consequence: corvette (24-36px) and destroyer (48-72px) both floor
 * to 2 rows and may still collide with each other at this tier. The
 * acceptance criterion names cruiser-versus-destroyer specifically, and at
 * 32x reduction two small classes are both genuinely just specks — that is
 * not chased further here.
 */
export const TIER_FLOOR = 2;

/**
 * An emissive pixel counts this much more than a hull pixel when a block has
 * more than one candidate emissive colour. It does not decide how many blocks
 * stay lit overall — that is the emissive budget in `reduceTier`, not this.
 */
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

interface LitBlock {
  ox: number;
  oy: number;
  /** Best emissive colour in this block, for when the budget keeps it lit. */
  emissiveColor: Rgba;
  /** Raw count of emissive source pixels in this block — the budget ranks on this. */
  emissiveCount: number;
  /** Best hull colour in this block, for when the budget does not keep it lit. */
  fallback: Rgba;
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

  let sourceEmissiveCount = 0;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (isEmissive(getPx(src, x, y))) sourceEmissiveCount++;
    }
  }

  /**
   * Running lights thin out as tiers shrink; they never multiply and never
   * vanish.
   *
   * Preserving every light while the hull shrinks 57x made a tier-2 cruiser 17.5%
   * emissive — a ladder of lights that blooms into a blob at the zoom where
   * silhouette matters most. The budget keeps spacing legible as a scale cue
   * while leaving the hull readable as a hull.
   */
  const emissiveBudget = sourceEmissiveCount === 0
    ? 0
    : Math.max(1, Math.round(sourceEmissiveCount / divisor));

  const litBlocks: LitBlock[] = [];

  for (let oy = 0; oy < h; oy++) {
    // x1/y1 come from the *next* block's own x0/y0 rather than a rounded-up
    // width, so adjacent blocks partition the source exactly instead of
    // sharing a column or row. A shared column was letting a single light
    // pixel win two neighbouring blocks at once, turning 14 source lights
    // into 16 in the output — a reduction that isn't allowed to create light.
    const y0 = Math.floor(oy * blockH);
    const y1 = oy === h - 1 ? src.h : Math.floor((oy + 1) * blockH);

    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor(ox * blockW);
      const x1 = ox === w - 1 ? src.w : Math.floor((ox + 1) * blockW);

      const hullScores = new Map<Rgba, number>();
      const emissiveScores = new Map<Rgba, number>();
      let emissiveCount = 0;
      let filled = 0;
      let total = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          const c = getPx(src, x, y);
          if (!isOpaque(c)) continue;
          filled++;

          if (isEmissive(c)) {
            emissiveCount++;
            emissiveScores.set(c, (emissiveScores.get(c) ?? 0) + EMISSIVE_WEIGHT);
            continue;
          }

          const weight = isEdgePixel(src, x, y) ? EDGE_WEIGHT : 1;
          hullScores.set(c, (hullScores.get(c) ?? 0) + weight);
        }
      }

      if (total === 0 || filled / total < FILL_THRESHOLD) {
        setPx(out, ox, oy, EMPTY);
        continue;
      }

      let bestHull = EMPTY;
      let bestHullScore = -1;
      for (const [color, score] of hullScores) {
        if (score > bestHullScore) {
          bestHullScore = score;
          bestHull = color;
        }
      }

      if (emissiveCount === 0) {
        setPx(out, ox, oy, snapToPalette(bestHull, allowed));
        continue;
      }

      let bestEmissive = EMPTY;
      let bestEmissiveScore = -1;
      for (const [color, score] of emissiveScores) {
        if (score > bestEmissiveScore) {
          bestEmissiveScore = score;
          bestEmissive = color;
        }
      }

      // Don't decide yet whether this block stays lit — that is a global
      // decision made once every block has been scored, so the budget can
      // keep the blocks with the most light in them rather than whichever
      // happen to be scanned first.
      litBlocks.push({
        ox,
        oy,
        emissiveColor: snapToPalette(bestEmissive, allowed),
        emissiveCount,
        fallback: snapToPalette(bestHull === EMPTY ? bestEmissive : bestHull, allowed),
      });
    }
  }

  // Keep the `emissiveBudget` blocks carrying the most light; every other
  // light-touched block falls back to its own best hull colour instead of
  // lighting up. Array#sort is a stable sort, so blocks tied on count keep
  // their scan order — output stays deterministic for a given input.
  litBlocks.sort((a, b) => b.emissiveCount - a.emissiveCount);
  for (let i = 0; i < litBlocks.length; i++) {
    const block = litBlocks[i]!;
    setPx(out, block.ox, block.oy, i < emissiveBudget ? block.emissiveColor : block.fallback);
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
