import { describe, expect, it } from 'vitest';
import { angleOf, vec2 } from './math/vec2.js';
import { CRUISER_BODY, makeBody, speed, wrapHeading } from './body.js';

describe('makeBody', () => {
  it('defaults to a body at rest at the origin', () => {
    const b = makeBody();
    expect(b.position).toEqual({ x: 0, y: 0 });
    expect(b.velocity).toEqual({ x: 0, y: 0 });
    expect(b.heading).toBe(0);
    expect(b.angularVelocity).toBe(0);
  });

  it('takes overrides', () => {
    const b = makeBody({ position: vec2(3, 4), heading: 1.5, mass: 900 });
    expect(b.position).toEqual({ x: 3, y: 4 });
    expect(b.heading).toBe(1.5);
    expect(b.mass).toBe(900);
  });

  it('does not alias the spec it was given', () => {
    // A shared position vector between two bodies would couple their movement.
    const pos = vec2(1, 1);
    const a = makeBody({ position: pos });
    const b = makeBody({ position: pos });
    a.position.x = 99;
    expect(b.position.x).toBe(1);
    expect(pos.x).toBe(1);
  });

  it('gives every body positive mass, thrust and turn rate', () => {
    const b = makeBody();
    expect(b.mass).toBeGreaterThan(0);
    expect(b.thrust).toBeGreaterThan(0);
    expect(b.turnRate).toBeGreaterThan(0);
    expect(b.angularAccel).toBeGreaterThan(0);
  });
});

describe('CRUISER_BODY', () => {
  it('describes a heavy ship — slow to turn and slow to stop', () => {
    // The spec's feel requirement: mass and momentum are real, and in 2D there
    // is no visual mass to lean on, so the numbers have to sell it alone.
    const b = makeBody(CRUISER_BODY);
    // A full revolution takes several seconds at peak rate.
    expect((Math.PI * 2) / b.turnRate).toBeGreaterThan(4);
    // Reaching peak turn rate is not instant either.
    expect(b.turnRate / b.angularAccel).toBeGreaterThan(0.8);
  });
});

describe('speed', () => {
  it('is the magnitude of velocity', () => {
    expect(speed(makeBody({ velocity: vec2(3, 4) }))).toBe(5);
  });
});

describe('wrapHeading', () => {
  it('leaves an in-range heading alone', () => {
    expect(wrapHeading(1)).toBeCloseTo(1, 10);
  });

  it('wraps past a full revolution', () => {
    expect(wrapHeading(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 10);
    expect(wrapHeading(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5, 10);
  });

  it('always returns a heading in (-PI, PI]', () => {
    for (let a = -20; a < 20; a += 0.37) {
      const w = wrapHeading(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('round-trips through angleOf', () => {
    for (const a of [0.3, 2.9, -2.9, 3.14]) {
      expect(wrapHeading(angleOf({ x: Math.cos(a), y: Math.sin(a) }))).toBeCloseTo(a, 9);
    }
  });
});
