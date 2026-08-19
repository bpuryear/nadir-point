/**
 * The virtual canvas and its integer scale to the display.
 *
 * Everything in the world is drawn at 1:1 into a fixed virtual canvas, and that
 * canvas is scaled to the window by a whole number. This is the last link in
 * the pixel-integrity chain: sprites are baked unrotated into 64 bins so
 * nothing resamples at runtime, and a fractional display scale here would
 * resample all of it anyway and throw that away.
 *
 * The leftover is letterboxed in whole pixels rather than absorbed by stretching.
 */

import { type Vec2 } from '../sim/math/vec2.js';

export const VIRTUAL_WIDTH = 480 as const;
export const VIRTUAL_HEIGHT = 270 as const;

export interface Viewport {
  virtualWidth: number;
  virtualHeight: number;
  /** Whole-number multiplier from virtual pixels to display pixels. */
  scale: number;
  /** Letterbox margin in display pixels. */
  offsetX: number;
  offsetY: number;
}

export function fitViewport(displayWidth: number, displayHeight: number): Viewport {
  const byWidth = Math.floor(displayWidth / VIRTUAL_WIDTH);
  const byHeight = Math.floor(displayHeight / VIRTUAL_HEIGHT);
  // At least 1: a display too small for one virtual pixel per device pixel
  // should crop, not blur.
  const scale = Math.max(1, Math.min(byWidth, byHeight));

  return {
    virtualWidth: VIRTUAL_WIDTH,
    virtualHeight: VIRTUAL_HEIGHT,
    scale,
    offsetX: Math.floor((displayWidth - VIRTUAL_WIDTH * scale) / 2),
    offsetY: Math.floor((displayHeight - VIRTUAL_HEIGHT * scale) / 2),
  };
}

/** World point to virtual-canvas pixel. Does not round — callers snap. */
export function worldToScreen(
  out: Vec2,
  world: Vec2,
  cameraCentre: Vec2,
  unitsPerPixel: number,
  vp: Viewport,
): Vec2 {
  out.x = (world.x - cameraCentre.x) / unitsPerPixel + vp.virtualWidth / 2;
  out.y = (world.y - cameraCentre.y) / unitsPerPixel + vp.virtualHeight / 2;
  return out;
}

/** Virtual-canvas pixel back to a world point. */
export function screenToWorld(
  out: Vec2,
  screen: Vec2,
  cameraCentre: Vec2,
  unitsPerPixel: number,
  vp: Viewport,
): Vec2 {
  out.x = (screen.x - vp.virtualWidth / 2) * unitsPerPixel + cameraCentre.x;
  out.y = (screen.y - vp.virtualHeight / 2) * unitsPerPixel + cameraCentre.y;
  return out;
}
