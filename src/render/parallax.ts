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
import { blit, createBuf, type PixBuf } from '../gen/pixbuf.js';
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

/**
 * Grows a layer buffer so it is at least one screen in each axis.
 *
 * Layers scroll as tiles, so the buffer's size is also the distance between
 * repeats. Most POI layers are generated at exactly the frame size and need
 * nothing done to them. The celestial layer of a gas-giant or star POI is the
 * exception: `buildPoiStack` sizes it `min(w, h) * 1.4` square, which for a
 * 480x270 frame is 378x378 — narrower than the screen. Tiled as-is, a second
 * gas giant would appear 378 pixels from the first, inside the same frame, and
 * a POI whose whole job is to dwarf everything would read as wallpaper.
 *
 * Padding it out to a full frame (transparent surround, original centred) puts
 * the repeat a whole screen away in layer space instead — at parallax 0.18
 * that is thousands of world units of travel — while keeping the wrap that
 * stops the backdrop draining into void. A buffer already big enough is
 * returned untouched, so the common case allocates nothing.
 */
export function padLayerBuffer(buf: PixBuf, minWidth: number, minHeight: number): PixBuf {
  if (buf.w >= minWidth && buf.h >= minHeight) return buf;

  // Never shrink an axis that is already large enough — cropping a layer to
  // make it tile would be a worse defect than the one being fixed.
  const w = Math.max(buf.w, minWidth);
  const h = Math.max(buf.h, minHeight);
  const out = createBuf(w, h);
  // Whole-pixel centring; an odd remainder biases left/up rather than landing
  // the layer on a half pixel.
  blit(out, buf, Math.floor((w - buf.w) / 2), Math.floor((h - buf.h) / 2));
  return out;
}

/** Far to near, with the foreground last so it draws over the play plane. */
export function sortedLayers(stack: PoiStack): readonly Layer[] {
  const all = stack.foreground === null
    ? [...stack.layers]
    : [...stack.layers, stack.foreground];
  return all.sort((a, b) => a.parallax - b.parallax);
}

/**
 * The draw list the renderer actually tiles: `sortedLayers`, with every buffer
 * grown to at least one frame.
 *
 * These two steps are composed here rather than left to the caller because
 * they have to agree. `placeLayer` reports `wrapWidth`/`wrapHeight` from
 * `layer.buf`, and the renderer folds the scroll by exactly those — so if the
 * padded buffer went to the GPU while the unpadded one stayed in the layer,
 * the layer would be wrapped at a period that is not its tile size and would
 * jump every time it wrapped. Returning padded layers keeps the buffer that
 * was uploaded and the buffer whose size is reported the same object.
 */
export function tiledLayers(
  stack: PoiStack, minWidth: number, minHeight: number,
): readonly Layer[] {
  return sortedLayers(stack).map((layer) => {
    const buf = padLayerBuffer(layer.buf, minWidth, minHeight);
    return buf === layer.buf ? layer : { ...layer, buf };
  });
}
