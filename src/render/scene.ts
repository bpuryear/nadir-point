/**
 * The draw list.
 *
 * Three containers in a fixed order: background parallax, the play plane, and
 * the sparse foreground that drifts in front of the action. Order is structural
 * rather than sorted per frame — the spec's layering is fixed, and a per-frame
 * sort would be cost paid for nothing.
 */

import { Container, type Sprite } from 'pixi.js';
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
 * Positions a parallax layer sprite.
 *
 * The placement's offsets are already whole pixels — this must not reintroduce
 * a fraction by scaling or rounding differently.
 */
export function setLayerSprite(sprite: Sprite, placement: LayerPlacement): void {
  sprite.position.set(placement.offsetX, placement.offsetY);
}
