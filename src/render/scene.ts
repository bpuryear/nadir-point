/**
 * The draw list.
 *
 * Three containers in a fixed order: background parallax, the play plane, and
 * the sparse foreground that drifts in front of the action. Order is structural
 * rather than sorted per frame — the spec's layering is fixed, and a per-frame
 * sort would be cost paid for nothing.
 */

import { Container, type TilingSprite } from 'pixi.js';
import type { LayerPlacement } from './parallax.js';

export interface Scene {
  root: Container;
  background: Container;
  play: Container;
  foreground: Container;
}

export function makeScene(parent: Container): Scene {
  const root = new Container();
  const background = new Container();
  const play = new Container();
  const foreground = new Container();

  // Insertion order *is* the draw order. `sortableChildren` is deliberately
  // left off and there is no z-index constant to set: with three containers in
  // a fixed order there is nothing for a per-frame sort to decide, and a
  // z-index that only works when someone remembers to enable sorting is a trap.
  // Change the order here, not with a zIndex on a child.
  root.addChild(background, play, foreground);
  parent.addChild(root);

  return { root, background, play, foreground };
}

/**
 * Reduces an absolute layer offset to an equivalent offset inside one tile.
 *
 * `placeLayer` reports the *absolute* offset — computed fresh from the camera
 * centre every frame so rounding error can never accumulate — and that number
 * grows without bound as the ship flies. A tiling texture repeats every
 * `period` pixels, so subtracting whole periods changes nothing on screen while
 * keeping the number small enough that float precision never becomes a factor.
 * Result is always in [0, period), and stays a whole number when the input is
 * one, which the placement guarantees.
 */
export function wrapOffset(offset: number, period: number): number {
  // A degenerate period would divide by zero; a layer with no size cannot tile,
  // so pass the offset through rather than inventing a wrap for it.
  if (period <= 0) return offset;
  return ((offset % period) + period) % period;
}

/**
 * Scrolls a parallax layer.
 *
 * The layer is a `TilingSprite` covering the whole virtual canvas, not a plain
 * sprite that gets moved: a plain sprite slides off and leaves void behind it.
 * The buffers are exactly one screen wide, so at CLOSE the nearest background
 * layer clears the frame after a few hundred world units of travel and the
 * foreground clears it sooner — a couple of minutes of flying and the backdrop
 * is gone. Tiling makes that impossible by construction.
 *
 * The scroll goes into `tilePosition`, and the sprite itself never moves. That
 * is what `wrapWidth`/`wrapHeight` on the placement are for.
 *
 * The placement's offsets are already whole pixels — this must not reintroduce
 * a fraction by scaling or rounding differently.
 */
export function setLayerSprite(sprite: TilingSprite, placement: LayerPlacement): void {
  sprite.tilePosition.set(
    wrapOffset(placement.offsetX, placement.wrapWidth),
    wrapOffset(placement.offsetY, placement.wrapHeight),
  );
}
