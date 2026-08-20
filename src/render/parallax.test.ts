import { describe, expect, it } from 'vitest';
import { buildPoiStack } from '../gen/celestial.js';
import { makeRng } from '../sim/rng.js';
import { vec2 } from '../sim/math/vec2.js';
import { createBuf, getPx, setPx } from '../gen/pixbuf.js';
import {
  makePlacement, padLayerBuffer, placeLayer, sortedLayers, tiledLayers,
} from './parallax.js';

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

  it('is absolute, not accumulated — many small moves land where one big move does', () => {
    // Number.isInteger alone cannot tell correct absolute rounding from a
    // buggy `out.offsetX += ...`: both produce integers. This can. Walk the
    // camera there in 400 sub-pixel steps and the answer must be the answer
    // for the endpoint, with no drift picked up along the way.
    const s = stack();
    const p = makePlacement();
    const steps = 400;
    const stepX = 0.31;
    const stepY = -0.17;

    for (const layer of s.layers) {
      for (const upp of [1, 4, 8, 32]) {
        const camera = vec2(0, 0);
        for (let i = 1; i <= steps; i++) {
          camera.x = i * stepX;
          camera.y = i * stepY;
          placeLayer(p, layer, camera, upp);
        }
        const direct = placeLayer(makePlacement(), layer, vec2(steps * stepX, steps * stepY), upp);
        expect(p.offsetX).toBe(direct.offsetX);
        expect(p.offsetY).toBe(direct.offsetY);
        // And that answer is the exact rounding of the closed form, so an
        // accumulator that happened to agree with itself still fails here.
        expect(p.offsetX).toBe(-Math.round((steps * stepX * layer.parallax) / upp));
        expect(p.offsetY).toBe(-Math.round((steps * stepY * layer.parallax) / upp));
      }
    }
  });

  it('returns to exactly zero when the camera returns to the origin', () => {
    // A layer that has drifted by a pixel per lap is the visible symptom of
    // accumulation, and it only shows up after a round trip.
    const s = stack();
    const p = makePlacement();
    const layer = s.layers[s.layers.length - 1]!;
    for (let i = 0; i < 1000; i++) {
      placeLayer(p, layer, vec2(Math.sin(i * 0.11) * 743.2, Math.cos(i * 0.07) * 512.9), 4);
    }
    placeLayer(p, layer, vec2(0, 0), 4);
    // Math.abs only to normalise the -0 that `-Math.round(0)` produces; the
    // assertion is that the magnitude is exactly zero, not merely small.
    expect(Math.abs(p.offsetX)).toBe(0);
    expect(Math.abs(p.offsetY)).toBe(0);
  });

  it('reports the layer size for wrapping', () => {
    // Consumed by render/scene.ts's setLayerSprite, which folds the absolute
    // offset by whole periods of these before writing it to tilePosition.
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

describe('padLayerBuffer', () => {
  it('returns a buffer already at least one frame untouched', () => {
    const buf = createBuf(480, 270);
    expect(padLayerBuffer(buf, 480, 270)).toBe(buf);
    expect(padLayerBuffer(createBuf(600, 400), 480, 270).w).toBe(600);
  });

  it('grows an undersized buffer to the frame and centres the original', () => {
    // The gas-giant case: buildPoiStack sizes that layer min(w,h)*1.4 square,
    // 378x378 for a 480x270 frame — narrower than the screen, so tiled as-is a
    // second gas giant lands inside the same frame.
    const src = createBuf(378, 378);
    setPx(src, 0, 0, 0xff0000ff);
    setPx(src, 377, 377, 0x00ff00ff);

    const out = padLayerBuffer(src, 480, 270);

    expect(out.w).toBe(480);
    // The tall axis is already bigger than the frame and must not be cropped.
    expect(out.h).toBe(378);
    expect(getPx(out, 51, 0)).toBe(0xff0000ff);
    expect(getPx(out, 51 + 377, 377)).toBe(0x00ff00ff);
  });

  it('never crops an axis that was already large enough', () => {
    const out = padLayerBuffer(createBuf(200, 900), 480, 270);
    expect(out.w).toBe(480);
    expect(out.h).toBe(900);
  });

  it('centres on whole pixels', () => {
    const src = createBuf(377, 269);
    setPx(src, 0, 0, 0xabcdefff);
    const padded = padLayerBuffer(src, 480, 270);
    // floor((480-377)/2) = 51, floor((270-269)/2) = 0
    expect(getPx(padded, 51, 0)).toBe(0xabcdefff);
  });
});

describe('tiledLayers', () => {
  it('keeps the far-to-near order sortedLayers established', () => {
    const ordered = tiledLayers(stack(), 220, 130);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.parallax).toBeGreaterThanOrEqual(ordered[i - 1]!.parallax);
    }
  });

  it('reports a wrap period equal to the buffer it hands the renderer', () => {
    // The invariant this function exists to hold: the buffer uploaded to the
    // GPU and the buffer whose size placeLayer reports must be the same one,
    // or the scroll is folded at a period that is not the tile size and the
    // layer jumps every wrap.
    const s = buildPoiStack('gasgiant', 480, 270, makeRng('tiled'));
    for (const layer of tiledLayers(s, 480, 270)) {
      const p = placeLayer(makePlacement(), layer, vec2(0, 0), 1);
      expect(p.wrapWidth).toBe(layer.buf.w);
      expect(p.wrapHeight).toBe(layer.buf.h);
      expect(layer.buf.w).toBeGreaterThanOrEqual(480);
      expect(layer.buf.h).toBeGreaterThanOrEqual(270);
    }
  });

  it('grows the gas giant POI\'s celestial layer, which is narrower than a frame', () => {
    const s = buildPoiStack('gasgiant', 480, 270, makeRng('tiled'));
    const raw = sortedLayers(s).find((l) => l.name === 'gas-giant')!;
    const tiled = tiledLayers(s, 480, 270).find((l) => l.name === 'gas-giant')!;
    expect(raw.buf.w).toBeLessThan(480);
    expect(tiled.buf.w).toBe(480);
    expect(tiled.parallax).toBe(raw.parallax);
  });
});
