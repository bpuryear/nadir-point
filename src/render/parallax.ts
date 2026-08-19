/**
 * Parallax layer placement.
 *
 * Depth without a third axis. Each layer moves at a fraction of the camera's
 * speed — 0 is infinitely far and never moves, 1 is the play plane, and the
 * optional foreground sits above 1 and overtakes the action.
 *
 * Every offset is rounded to a whole pixel. Background layers fill the screen,
 * so a fractional offset is the most visible defect available: the layers crawl
 * against each other and the whole frame looks unstable, whatever the sprites
 * themselves are doing.
 */

import type { Layer, PoiStack } from '../gen/celestial.js';
import type { Vec2 } from '../sim/math/vec2.js';

export interface LayerPlacement {
  offsetX: number;
  offsetY: number;
  wrapWidth: number;
  wrapHeight: number;
}

export function makePlacement(): LayerPlacement {
  return { offsetX: 0, offsetY: 0, wrapWidth: 0, wrapHeight: 0 };
}

export function placeLayer(
  out: LayerPlacement,
  layer: Layer,
  cameraCentre: Vec2,
  unitsPerPixel: number,
): LayerPlacement {
  // Round after scaling, so the offset is whole pixels on the virtual canvas
  // rather than whole world units. Computed from the absolute camera centre
  // each call — never accumulated frame to frame — so rounding error cannot
  // build up and make a slow layer crawl or stall.
  out.offsetX = -Math.round((cameraCentre.x * layer.parallax) / unitsPerPixel);
  out.offsetY = -Math.round((cameraCentre.y * layer.parallax) / unitsPerPixel);
  out.wrapWidth = layer.buf.w;
  out.wrapHeight = layer.buf.h;
  return out;
}

/** Far to near, with the foreground last so it draws over the play plane. */
export function sortedLayers(stack: PoiStack): readonly Layer[] {
  const all = stack.foreground === null
    ? [...stack.layers]
    : [...stack.layers, stack.foreground];
  return all.sort((a, b) => a.parallax - b.parallax);
}
