/**
 * Tests the pure parts of scene.ts: draw order and layer-placement arithmetic.
 *
 * `Container` and `Sprite` construct fine in Node without a GPU or a canvas —
 * they are plain scene-graph objects until something renders them — so these
 * are genuine assertions on real Pixi objects, not a mock standing in for one.
 * There is no meaningful Node test for the GPU upload itself; that is verified
 * by browser observation instead (see the task report).
 */

import { describe, expect, it } from 'vitest';
import { Container, Sprite } from 'pixi.js';
import { makeScene, setLayerSprite } from './scene.js';
import { makePlacement } from './parallax.js';

describe('makeScene', () => {
  it('attaches the scene root to the given parent', () => {
    const parent = new Container();
    const scene = makeScene(parent);
    expect(parent.children).toEqual([scene.root]);
  });

  it('adds the three layer containers to root in background, play, foreground order', () => {
    const parent = new Container();
    const scene = makeScene(parent);
    expect(scene.root.children).toEqual([scene.background, scene.play, scene.foreground]);
  });

  it('leaves draw order to insertion, with no per-frame sort to depend on', () => {
    // There is no LAYER_Z constant any more, and sortableChildren stays off:
    // a zIndex that silently does nothing unless someone remembers to enable
    // sorting is worse than no zIndex at all.
    const scene = makeScene(new Container());
    expect(scene.root.sortableChildren).toBe(false);
  });

  it('creates a fresh scene graph on every call', () => {
    const parent = new Container();
    const a = makeScene(parent);
    const b = makeScene(parent);
    expect(a.root).not.toBe(b.root);
    expect(parent.children).toEqual([a.root, b.root]);
  });
});

describe('setLayerSprite', () => {
  it('positions the sprite at the placement offsets exactly', () => {
    const sprite = new Sprite();
    const placement = makePlacement();
    placement.offsetX = -17;
    placement.offsetY = 42;

    setLayerSprite(sprite, placement);

    expect(sprite.position.x).toBe(-17);
    expect(sprite.position.y).toBe(42);
  });

  it('does not reintroduce a fraction the placement did not have', () => {
    // Placements are already whole pixels by contract (parallax.ts). This
    // guards against setLayerSprite scaling or dividing the offset instead
    // of assigning it directly.
    const sprite = new Sprite();
    const placement = makePlacement();
    placement.offsetX = 5;
    placement.offsetY = -3;

    setLayerSprite(sprite, placement);

    expect(Number.isInteger(sprite.position.x)).toBe(true);
    expect(Number.isInteger(sprite.position.y)).toBe(true);
    expect(sprite.position.x).toBe(placement.offsetX);
    expect(sprite.position.y).toBe(placement.offsetY);
  });
});
