import { describe, expect, it } from 'vitest';
import { vec2 } from '../sim/math/vec2.js';
import {
  fitViewport, screenToWorld, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, worldToScreen,
} from './viewport.js';

describe('fitViewport', () => {
  it('always picks a whole-number scale', () => {
    // A fractional scale resamples every sprite and undoes the entire
    // rotation-bake strategy, which exists so nothing is ever resampled.
    for (let w = 320; w <= 3840; w += 37) {
      for (const h of [200, 720, 1080, 1440, 2160]) {
        const vp = fitViewport(w, h);
        expect(Number.isInteger(vp.scale)).toBe(true);
        expect(vp.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('picks the largest scale that still fits', () => {
    const vp = fitViewport(VIRTUAL_WIDTH * 3, VIRTUAL_HEIGHT * 3);
    expect(vp.scale).toBe(3);
  });

  it('is limited by the tighter axis', () => {
    const vp = fitViewport(VIRTUAL_WIDTH * 4, VIRTUAL_HEIGHT * 2);
    expect(vp.scale).toBe(2);
  });

  it('never scales below 1, even on a tiny display', () => {
    expect(fitViewport(100, 60).scale).toBe(1);
  });

  it('letterboxes the remainder as whole pixels', () => {
    const vp = fitViewport(VIRTUAL_WIDTH * 2 + 33, VIRTUAL_HEIGHT * 2 + 11);
    expect(vp.scale).toBe(2);
    expect(Number.isInteger(vp.offsetX)).toBe(true);
    expect(Number.isInteger(vp.offsetY)).toBe(true);
    expect(vp.offsetX).toBe(16);
    expect(vp.offsetY).toBe(5);
  });
});

describe('world and screen transforms', () => {
  const vp = fitViewport(VIRTUAL_WIDTH * 2, VIRTUAL_HEIGHT * 2);

  it('puts the camera centre at the middle of the virtual canvas', () => {
    const out = worldToScreen(vec2(), vec2(100, 100), vec2(100, 100), 1, vp);
    expect(out.x).toBeCloseTo(VIRTUAL_WIDTH / 2, 6);
    expect(out.y).toBeCloseTo(VIRTUAL_HEIGHT / 2, 6);
  });

  it('moves a world point right when it is right of the camera', () => {
    const out = worldToScreen(vec2(), vec2(140, 100), vec2(100, 100), 1, vp);
    expect(out.x).toBeCloseTo(VIRTUAL_WIDTH / 2 + 40, 6);
  });

  it('compresses distance as units-per-pixel grows', () => {
    const near = worldToScreen(vec2(), vec2(140, 100), vec2(100, 100), 1, vp);
    const far = worldToScreen(vec2(), vec2(140, 100), vec2(100, 100), 4, vp);
    expect(far.x - VIRTUAL_WIDTH / 2).toBeCloseTo((near.x - VIRTUAL_WIDTH / 2) / 4, 6);
  });

  it('round-trips through screenToWorld at every zoom divisor', () => {
    for (const upp of [1, 4, 8, 32]) {
      const world = vec2(1234.5, -678.25);
      const screen = worldToScreen(vec2(), world, vec2(100, 100), upp, vp);
      const back = screenToWorld(vec2(), screen, vec2(100, 100), upp, vp);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
    }
  });
});
