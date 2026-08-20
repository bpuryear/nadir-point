import { describe, expect, it } from 'vitest';
import { CRUISER_BODY, makeBody } from '../sim/body.js';
import { distance, vec2 } from '../sim/math/vec2.js';
import { followBody, makeCamera, snappedCentre } from './camera.js';

describe('following', () => {
  it('closes on a stationary ship', () => {
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(300, 200) });
    for (let i = 0; i < 240; i++) followBody(cam, b, 1 / 60);
    expect(distance(cam.position, b.position)).toBeLessThan(4);
  });

  it('lags behind rather than snapping', () => {
    // A camera welded to the ship makes the world jerk around it. Lag is what
    // lets the ship feel heavy rather than the background feel unstable.
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(1000, 0) });
    followBody(cam, b, 1 / 60);
    expect(cam.position.x).toBeGreaterThan(0);
    expect(cam.position.x).toBeLessThan(500);
  });

  it('does not move away from the target on a negative dt', () => {
    // A stale or rewound timestamp can hand followBody a negative dt. Without
    // a floor, exp(-lag * dt) exceeds 1, t goes negative, and addScaled drives
    // the camera away from the desired point instead of toward it — the same
    // failure shape as an unclamped tick accumulator, just for the camera.
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(1000, 0) });
    const before = distance(cam.position, b.position);
    followBody(cam, b, -1);
    const after = distance(cam.position, b.position);
    expect(after).toBeLessThanOrEqual(before);
  });

  it('leads in the direction of travel', () => {
    // Looking where you are going is what keeps the player from fighting the
    // camera, which the spec forbids outright.
    const still = makeBody({ ...CRUISER_BODY, position: vec2(0, 0) });
    const moving = makeBody({ ...CRUISER_BODY, position: vec2(0, 0), velocity: vec2(60, 0) });

    const a = makeCamera(vec2(0, 0));
    const b = makeCamera(vec2(0, 0));
    for (let i = 0; i < 120; i++) {
      followBody(a, still, 1 / 60);
      followBody(b, moving, 1 / 60);
    }
    expect(b.position.x).toBeGreaterThan(a.position.x + 5);
  });

  it('is stable when the ship is stationary', () => {
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(100, 100) });
    for (let i = 0; i < 600; i++) followBody(cam, b, 1 / 60);
    const settled = vec2(cam.position.x, cam.position.y);
    for (let i = 0; i < 60; i++) followBody(cam, b, 1 / 60);
    expect(distance(cam.position, settled)).toBeLessThan(0.5);
  });
});

describe('pixel-grid snapping', () => {
  it('lands the centre on a whole pixel at every zoom divisor', () => {
    // This is the other half of pixel integrity. A camera on a fractional world
    // position puts every sprite on a fractional pixel and the scene crawls.
    const cam = makeCamera(vec2(123.456, -78.9));
    for (const upp of [1, 4, 8, 32]) {
      const c = snappedCentre(vec2(), cam, upp);
      expect(Number.isInteger(c.x / upp)).toBe(true);
      expect(Number.isInteger(c.y / upp)).toBe(true);
    }
  });

  it('never moves the centre by more than half a pixel', () => {
    for (const upp of [1, 4, 8, 32]) {
      for (let i = 0; i < 200; i++) {
        const cam = makeCamera(vec2(i * 7.31 - 500, i * -3.77 + 200));
        const c = snappedCentre(vec2(), cam, upp);
        expect(Math.abs(c.x - cam.position.x)).toBeLessThanOrEqual(upp / 2 + 1e-9);
        expect(Math.abs(c.y - cam.position.y)).toBeLessThanOrEqual(upp / 2 + 1e-9);
      }
    }
  });

  it('does not mutate the camera', () => {
    const cam = makeCamera(vec2(10.5, 20.5));
    snappedCentre(vec2(), cam, 8);
    expect(cam.position).toEqual({ x: 10.5, y: 20.5 });
  });

  it('is stable for a stationary camera — no jitter between frames', () => {
    const cam = makeCamera(vec2(50.4999, 50.4999));
    const a = snappedCentre(vec2(), cam, 4);
    const b = snappedCentre(vec2(), cam, 4);
    expect(a).toEqual(b);
  });
});
