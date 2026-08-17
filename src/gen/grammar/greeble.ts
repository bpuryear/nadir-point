/**
 * Budgeted surface detail and running lights.
 *
 * Two rules govern this module, and both exist because detail is the constraint
 * that most wants violating:
 *
 *   1. Greebles are budgeted per size class. A fighter is 8-12px long and gets
 *      almost none; adding "just a bit more" to a small hull is how a readable
 *      silhouette turns into noise.
 *
 *   2. Greebles never touch the outline. They are interior decoration only. If a
 *      greeble could alter the edge, then a module bolted to a hardpoint would no
 *      longer be identifiable by outline, and the entire silhouette economy the
 *      game is built on stops working.
 *
 * Running lights are not decoration. Placed at fixed spacing along a hull, they
 * are one of the three scale cues that let a four-pixel speck read as a ship
 * kilometres long, so their spacing is a constant, not a random draw.
 */

import type { Rng } from '../../sim/rng.js';
import { getPx, isOpaque, setPx, type Rgba } from '../pixbuf.js';
import { shadeStep } from '../palette.js';
import { isFilled, type Profile, type SizeClass } from './profile.js';
import { BASE_STEP, type PlatedHull } from './plates.js';

/** Maximum greebles by size class. Deliberately austere. */
export const GREEBLE_BUDGET: Readonly<Record<SizeClass, number>> = {
  fighter: 1,
  corvette: 4,
  destroyer: 9,
  cruiser: 16,
  capital: 24,
};

/** Pixels between running lights along a hull at LOD tier 1. */
export const RUNNING_LIGHT_SPACING = 16;

/**
 * A pixel is interior if it is filled and all eight neighbours are filled.
 * Only interior pixels may be greebled, which is what guarantees the outline
 * survives untouched.
 */
function isInterior(profile: Profile, cx: number, x: number, y: number): boolean {
  const rel = x - cx;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isFilled(profile, rel + dx, y + dy)) return false;
    }
  }
  return true;
}

export function applyGreebles(
  hull: PlatedHull,
  profile: Profile,
  ramp: readonly Rgba[],
  rng: Rng,
): number {
  const budget = GREEBLE_BUDGET[profile.sizeClass];
  const cx = hull.centreX;
  let placed = 0;

  // Bounded attempts: a narrow hull may simply have nowhere legal to put one,
  // and the loop must terminate regardless.
  const maxAttempts = budget * 12;

  for (let attempt = 0; attempt < maxAttempts && placed < budget; attempt++) {
    const w = 1 + rng.int(3);           // 1-3 px wide
    const h = 1 + rng.int(2);           // 1-2 px tall
    const y = 1 + rng.int(Math.max(1, profile.length - h - 2));
    const half = profile.halfWidth[y]!;
    if (half < 2) continue;

    const x = cx - half + 1 + rng.int(Math.max(1, half * 2 - 1));

    // Every pixel of the greeble must be interior, or it could reach the edge.
    let legal = true;
    for (let dy = 0; dy < h && legal; dy++) {
      for (let dx = 0; dx < w && legal; dx++) {
        if (!isInterior(profile, cx, x + dx, y + dy)) legal = false;
      }
    }
    if (!legal) continue;

    // A vent reads dark; a raised block reads light. Both stay inside the ramp.
    const step = rng.chance(0.55) ? BASE_STEP - 2 : BASE_STEP + 2;
    const color = shadeStep(ramp, step);

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setPx(hull.buf, x + dx, y + dy, color);
      }
    }
    placed++;
  }

  return placed;
}

/**
 * The rows running lights land on. Exposed separately so the scale-cue check can
 * verify spacing without re-deriving it.
 */
export function runningLightRows(profile: Profile): number[] {
  const rows: number[] = [];
  const first = RUNNING_LIGHT_SPACING;
  for (let y = first; y < profile.length - 2; y += RUNNING_LIGHT_SPACING) {
    if (profile.halfWidth[y]! >= 2) rows.push(y);
  }
  return rows;
}

export function applyRunningLights(
  hull: PlatedHull,
  profile: Profile,
  color: Rgba,
): number {
  const cx = hull.centreX;
  let placed = 0;

  for (const y of runningLightRows(profile)) {
    const half = profile.halfWidth[y]!;
    // One inboard of each edge, so the light sits on the hull rather than
    // extending it — the silhouette must not change.
    for (const x of [cx - half + 1, cx + half - 1]) {
      if (isOpaque(getPx(hull.buf, x, y))) {
        setPx(hull.buf, x, y, color);
        placed++;
      }
    }
  }

  return placed;
}
