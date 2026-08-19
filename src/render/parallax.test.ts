import { describe, expect, it } from 'vitest';
import { buildPoiStack } from '../gen/celestial.js';
import { makeRng } from '../sim/rng.js';
import { vec2 } from '../sim/math/vec2.js';
import { makePlacement, placeLayer, sortedLayers } from './parallax.js';

const stack = () => buildPoiStack('graveyard', 220, 130, makeRng('parallax'));

describe('placeLayer', () => {
  it('always produces whole-pixel offsets', () => {
    // Fractional offsets make layers crawl against each other, and these fill
    // the screen, so it is the most visible failure available.
    const s = stack();
    const p = makePlacement();
    for (const layer of s.layers) {
      for (const upp of [1, 4, 8, 32]) {
        for (let i = 0; i < 60; i++) {
          placeLayer(p, layer, vec2(i * 13.7 - 300, i * -7.3 + 90), upp);
          expect(Number.isInteger(p.offsetX)).toBe(true);
          expect(Number.isInteger(p.offsetY)).toBe(true);
        }
      }
    }
  });

  it('moves a near layer further than a far one', () => {
    const s = stack();
    const far = s.layers[0]!;
    const near = s.layers[s.layers.length - 1]!;
    expect(near.parallax).toBeGreaterThan(far.parallax);

    const a = placeLayer(makePlacement(), far, vec2(1000, 0), 1);
    const b = placeLayer(makePlacement(), near, vec2(1000, 0), 1);
    expect(Math.abs(b.offsetX)).toBeGreaterThan(Math.abs(a.offsetX));
  });

  it('barely moves the most distant layer', () => {
    // Parallax near zero is the definition of "infinitely far".
    const s = stack();
    const far = s.layers[0]!;
    const p = placeLayer(makePlacement(), far, vec2(5000, 0), 1);
    expect(Math.abs(p.offsetX)).toBeLessThan(5000 * far.parallax + 2);
  });

  it('reports the layer size for wrapping', () => {
    const s = stack();
    const layer = s.layers[1]!;
    const p = placeLayer(makePlacement(), layer, vec2(0, 0), 1);
    expect(p.wrapWidth).toBe(layer.buf.w);
    expect(p.wrapHeight).toBe(layer.buf.h);
  });

  it('is stable for a stationary camera', () => {
    const s = stack();
    const layer = s.layers[2]!;
    const a = placeLayer(makePlacement(), layer, vec2(77.7, -33.3), 4);
    const b = placeLayer(makePlacement(), layer, vec2(77.7, -33.3), 4);
    expect(a).toEqual(b);
  });

  it('does not allocate — writes into the placement it is given', () => {
    const s = stack();
    const p = makePlacement();
    const returned = placeLayer(p, s.layers[0]!, vec2(1, 1), 1);
    expect(returned).toBe(p);
  });
});

describe('sortedLayers', () => {
  it('orders far to near', () => {
    const ordered = sortedLayers(stack());
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.parallax).toBeGreaterThanOrEqual(ordered[i - 1]!.parallax);
    }
  });

  it('puts the foreground last, in front of the play plane', () => {
    const s = buildPoiStack('wreckreef', 220, 130, makeRng('fg'));
    const ordered = sortedLayers(s);
    if (s.foreground !== null) {
      expect(ordered[ordered.length - 1]!.name).toBe(s.foreground.name);
      expect(ordered[ordered.length - 1]!.parallax).toBeGreaterThan(1);
    }
  });
});
