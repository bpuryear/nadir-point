import { describe, expect, it } from 'vitest';
import { CRUISER_BODY, makeBody, speed } from './body.js';
import { integrate, NEUTRAL, stoppingDistance, TICK_SECONDS } from './integrate.js';

const cruiser = () => makeBody(CRUISER_BODY);
const run = (b: ReturnType<typeof cruiser>, control: { thrust: number; turn: number }, seconds: number) => {
  const steps = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < steps; i++) integrate(b, control, TICK_SECONDS);
};

describe('heading can never change instantly', () => {
  it('does not move at all in a single tick from rest', () => {
    // This is the acceptance criterion. A ship that snaps its heading is the
    // failure this whole integrator exists to prevent.
    const b = cruiser();
    integrate(b, { thrust: 0, turn: 1 }, TICK_SECONDS);
    expect(Math.abs(b.heading)).toBeLessThan(0.01);
  });

  it('takes over a second to reach peak turn rate', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 0.5);
    expect(b.angularVelocity).toBeLessThan(b.turnRate * 0.95);
  });

  it('never exceeds its peak turn rate however long it turns', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 30);
    expect(b.angularVelocity).toBeLessThanOrEqual(b.turnRate + 1e-9);
  });

  it('cannot reverse its turn instantly either', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 5);
    const spinning = b.angularVelocity;
    integrate(b, { thrust: 0, turn: -1 }, TICK_SECONDS);
    // One tick of counter-turn barely dents it.
    expect(b.angularVelocity).toBeGreaterThan(spinning * 0.9);
  });

  it('holds heading in (-PI, PI] across many revolutions', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 60);
    expect(b.heading).toBeGreaterThan(-Math.PI - 1e-9);
    expect(b.heading).toBeLessThanOrEqual(Math.PI + 1e-9);
  });
});

describe('momentum is real', () => {
  it('keeps moving after thrust stops', () => {
    const b = cruiser();
    run(b, { thrust: 1, turn: 0 }, 3);
    const cruising = speed(b);
    expect(cruising).toBeGreaterThan(1);
    run(b, NEUTRAL, 0.5);
    // Drag bleeds speed, but nowhere near instantly.
    expect(speed(b)).toBeGreaterThan(cruising * 0.5);
  });

  it('takes seconds to come to a full stop from cruise', () => {
    // The spec's words: "Full stop from cruise takes seconds."
    const b = cruiser();
    run(b, { thrust: 1, turn: 0 }, 5);
    expect(speed(b)).toBeGreaterThan(1);

    let seconds = 0;
    while (speed(b) > 0.5 && seconds < 30) {
      integrate(b, { thrust: -1, turn: 0 }, TICK_SECONDS);
      seconds += TICK_SECONDS;
    }
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(30);
  });

  it('drifts sideways when it turns while moving', () => {
    // Turning changes where the ship points, not where it is going. That
    // divergence is the whole feel of a heavy vessel.
    const b = cruiser();
    run(b, { thrust: 1, turn: 0 }, 4);
    const headingBefore = b.heading;
    run(b, { thrust: 0, turn: 1 }, 1.5);
    const velocityAngle = Math.atan2(b.velocity.y, b.velocity.x);
    expect(Math.abs(b.heading - headingBefore)).toBeGreaterThan(0.3);
    expect(Math.abs(b.heading - velocityAngle)).toBeGreaterThan(0.2);
  });

  it('accelerates along its heading, not along an axis', () => {
    const b = makeBody({ ...CRUISER_BODY, heading: Math.PI / 2 });
    run(b, { thrust: 1, turn: 0 }, 2);
    expect(b.velocity.y).toBeGreaterThan(1);
    expect(Math.abs(b.velocity.x)).toBeLessThan(0.5);
  });
});

describe('control clamping', () => {
  it('ignores thrust and turn magnitudes above 1', () => {
    const a = cruiser();
    const b = cruiser();
    run(a, { thrust: 1, turn: 1 }, 2);
    run(b, { thrust: 50, turn: 50 }, 2);
    expect(speed(b)).toBeCloseTo(speed(a), 6);
    expect(b.angularVelocity).toBeCloseTo(a.angularVelocity, 6);
  });
});

describe('stoppingDistance', () => {
  it('is zero at rest', () => {
    expect(stoppingDistance(cruiser())).toBe(0);
  });

  it('grows with speed', () => {
    const slow = cruiser();
    run(slow, { thrust: 1, turn: 0 }, 1);
    const fast = cruiser();
    run(fast, { thrust: 1, turn: 0 }, 5);
    expect(stoppingDistance(fast)).toBeGreaterThan(stoppingDistance(slow));
  });
});
