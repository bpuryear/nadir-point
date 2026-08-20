/**
 * Four discrete zoom levels, each bound to one LOD tier.
 *
 * Zoom never scales a sprite. A 128px cruiser squeezed to 4px is mush, and mush
 * at the far end kills the wide shot the game is sold on — so instead the
 * camera changes how many world units a pixel covers and swaps to a different
 * pre-generated tier. Units-per-pixel comes straight from LOD_DIVISORS so the
 * camera can never ask for a scale the generator has no sprite for.
 *
 * The transition is a crossfade between two correctly-rendered frames, not an
 * animated scale. Animating the scale would put sprites at non-integer sizes
 * mid-transition and reintroduce exactly the resampling this design removes.
 */

import { LOD_DIVISORS, type LodTier } from '../gen/lod.js';

export type ZoomLevel = 0 | 1 | 2 | 3;

export const ZOOM_LEVELS: readonly ZoomLevel[] = [0, 1, 2, 3];

export const ZOOM_NAMES: Readonly<Record<ZoomLevel, string>> = {
  0: 'CLOSE',
  1: 'TACTICAL',
  2: 'OPERATIONAL',
  3: 'WIDE',
};

/** Short enough to sit inside the spec's 100ms feedback budget. */
export const CROSSFADE_SECONDS = 0.08;

export interface ZoomState {
  level: ZoomLevel;
  /** The level being faded out of, or null when settled. */
  from: ZoomLevel | null;
  elapsed: number;
}

export function makeZoom(level: ZoomLevel = 1): ZoomState {
  return { level, from: null, elapsed: 0 };
}

export function setZoom(z: ZoomState, level: ZoomLevel): void {
  if (level === z.level) return;
  z.from = z.level;
  z.level = level;
  z.elapsed = 0;
}

export function stepZoom(z: ZoomState, delta: number): void {
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, z.level + Math.sign(delta)));
  setZoom(z, next as ZoomLevel);
}

export function advanceZoom(z: ZoomState, dt: number): void {
  if (z.from === null) return;
  z.elapsed += dt;
  if (z.elapsed >= CROSSFADE_SECONDS) {
    z.from = null;
    z.elapsed = 0;
  }
}

/** 0 at the start of a transition, 1 once settled. */
export function crossfadeAlpha(z: ZoomState): number {
  if (z.from === null) return 1;
  return Math.max(0, Math.min(1, z.elapsed / CROSSFADE_SECONDS));
}

export function unitsPerPixel(level: ZoomLevel): number {
  return LOD_DIVISORS[level];
}

export function lodTierFor(level: ZoomLevel): LodTier {
  return level as LodTier;
}
