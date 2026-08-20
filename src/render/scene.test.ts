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
import { Container, Texture, TilingSprite } from 'pixi.js';
import { makeScene, setLayerSprite, wrapOffset } from './scene.js';
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

describe('wrapOffset', () => {
  it('leaves an offset already inside one tile alone', () => {
    expect(wrapOffset(17, 480)).toBe(17);
    expect(wrapOffset(0, 480)).toBe(0);
  });

  it('folds a positive offset past the period back inside it', () => {
    expect(wrapOffset(480, 480)).toBe(0);
    expect(wrapOffset(485, 480)).toBe(5);
    expect(wrapOffset(480 * 97 + 13, 480)).toBe(13);
  });

  it('folds a negative offset into [0, period) rather than staying negative', () => {
    // JavaScript's % keeps the sign of the dividend, so a bare `x % w` would
    // hand the tiling shader a negative scroll for any camera left of origin.
    expect(wrapOffset(-1, 480)).toBe(479);
    expect(wrapOffset(-480, 480)).toBe(0);
    expect(wrapOffset(-480 * 12 - 7, 480)).toBe(473);
  });

  it('is always in [0, period) for a wide sweep of offsets', () => {
    for (const period of [37, 270, 480]) {
      for (let o = -5000; o <= 5000; o += 7) {
        const w = wrapOffset(o, period);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThan(period);
        // The fold must be a whole number of periods, or the layer jumps.
        expect(Math.abs((o - w) % period)).toBe(0);
      }
    }
  });

  it('keeps whole-pixel offsets whole', () => {
    for (let o = -1000; o <= 1000; o += 3) {
      expect(Number.isInteger(wrapOffset(o, 480))).toBe(true);
    }
  });

  it('passes a degenerate period through rather than dividing by zero', () => {
    expect(wrapOffset(9, 0)).toBe(9);
  });
});

describe('setLayerSprite', () => {
  const tiling = () => new TilingSprite({ texture: Texture.EMPTY, width: 480, height: 270 });

  it('scrolls tilePosition and never moves the sprite itself', () => {
    // A sprite that moves slides off screen and leaves void behind it. That is
    // the whole reason the layer is a TilingSprite.
    const sprite = tiling();
    const placement = makePlacement();
    placement.offsetX = -17;
    placement.offsetY = 42;
    placement.wrapWidth = 480;
    placement.wrapHeight = 270;

    setLayerSprite(sprite, placement);

    expect(sprite.position.x).toBe(0);
    expect(sprite.position.y).toBe(0);
    expect(sprite.tilePosition.x).toBe(463);
    expect(sprite.tilePosition.y).toBe(42);
  });

  it('wraps an offset far outside the buffer back into it', () => {
    // 24,000 world units is the point at which the starfield used to be gone.
    const sprite = tiling();
    const placement = makePlacement();
    placement.offsetX = -24000;
    placement.offsetY = 12345;
    placement.wrapWidth = 480;
    placement.wrapHeight = 270;

    setLayerSprite(sprite, placement);

    expect(sprite.tilePosition.x).toBe(wrapOffset(-24000, 480));
    expect(sprite.tilePosition.y).toBe(wrapOffset(12345, 270));
    expect(sprite.tilePosition.x).toBeGreaterThanOrEqual(0);
    expect(sprite.tilePosition.x).toBeLessThan(480);
  });

  it('does not reintroduce a fraction the placement did not have', () => {
    // Placements are already whole pixels by contract (parallax.ts). This
    // guards against setLayerSprite scaling or dividing the offset instead
    // of folding it by whole periods.
    const sprite = tiling();
    const placement = makePlacement();
    placement.offsetX = 5;
    placement.offsetY = -3;
    placement.wrapWidth = 480;
    placement.wrapHeight = 270;

    setLayerSprite(sprite, placement);

    expect(Number.isInteger(sprite.tilePosition.x)).toBe(true);
    expect(Number.isInteger(sprite.tilePosition.y)).toBe(true);
  });

  it('places the same pixel under the same screen position after a full period', () => {
    // The property that makes wrapping invisible: an offset and that offset
    // plus one buffer width must scroll to the identical tile position.
    const a = tiling();
    const b = tiling();
    const pa = makePlacement();
    const pb = makePlacement();
    pa.wrapWidth = pb.wrapWidth = 480;
    pa.wrapHeight = pb.wrapHeight = 270;
    pa.offsetX = -313;
    pa.offsetY = 77;
    pb.offsetX = pa.offsetX - 480 * 5;
    pb.offsetY = pa.offsetY + 270 * 9;

    setLayerSprite(a, pa);
    setLayerSprite(b, pb);

    expect(b.tilePosition.x).toBe(a.tilePosition.x);
    expect(b.tilePosition.y).toBe(a.tilePosition.y);
  });
});
