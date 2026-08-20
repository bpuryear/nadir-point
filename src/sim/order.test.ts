import { describe, expect, it } from 'vitest';
import { CRUISER_BODY, makeBody, speed } from './body.js';
import { integrate, TICK_SECONDS } from './integrate.js';
import { distance, vec2 } from './math/vec2.js';
import { FACING_CONE, hasArrived, makeMoveOrder, steer } from './order.js';

const cruiser = (over = {}) => makeBody({ ...CRUISER_BODY, ...over });

/** Runs the full order loop for a while and reports where the ship ended up. */
const fly = (b: ReturnType<typeof cruiser>, order: ReturnType<typeof makeMoveOrder>, seconds: number) => {
  const steps = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < steps; i++) integrate(b, steer(b, order), TICK_SECONDS);
};

describe('steer', () => {
  it('returns neutral with no order', () => {
    expect(steer(cruiser(), null)).toEqual({ thrust: 0, turn: 0 });
  });

  it('turns toward a target behind it before thrusting', () => {
    // Turn commitment: a heavy ship points itself before it pushes. Thrusting
    // while facing away would let it crab sideways to any target and erase the
    // whole point of positioning.
    const b = cruiser({ heading: 0 });
    const order = makeMoveOrder(vec2(-500, 0));
    const c = steer(b, order);
    expect(Math.abs(c.turn)).toBeGreaterThan(0.5);
    expect(c.thrust).toBeLessThanOrEqual(0);
  });

  it('thrusts once it is facing the target', () => {
    const b = cruiser({ heading: 0 });
    const c = steer(b, makeMoveOrder(vec2(500, 0)));
    expect(c.thrust).toBeGreaterThan(0.5);
  });

  it('only thrusts inside the facing cone', () => {
    const justOutside = cruiser({ heading: FACING_CONE + 0.15 });
    expect(steer(justOutside, makeMoveOrder(vec2(500, 0))).thrust).toBeLessThanOrEqual(0);
  });
});

describe('flying an order to completion', () => {
  it('reaches a target ahead of it', () => {
    const b = cruiser();
    const order = makeMoveOrder(vec2(600, 0));
    fly(b, order, 40);
    expect(distance(b.position, order.target)).toBeLessThan(order.arriveRadius * 2);
  });

  it('reaches a target behind it, having turned around first', () => {
    const b = cruiser({ heading: 0 });
    const order = makeMoveOrder(vec2(-600, 0));
    fly(b, order, 60);
    expect(distance(b.position, order.target)).toBeLessThan(order.arriveRadius * 2);
  });

  it('reaches a target off to one side', () => {
    const b = cruiser({ heading: 0 });
    const order = makeMoveOrder(vec2(400, 500));
    fly(b, order, 60);
    expect(distance(b.position, order.target)).toBeLessThan(order.arriveRadius * 2);
  });

  it('is close to stopped once it arrives', () => {
    // Arriving at speed and sailing past is the failure this braking exists to
    // prevent — the ship should settle, not orbit its own waypoint forever.
    const b = cruiser();
    const order = makeMoveOrder(vec2(600, 0));
    fly(b, order, 40);
    expect(speed(b)).toBeLessThan(6);
  });

  it('does not oscillate once arrived', () => {
    const b = cruiser();
    const order = makeMoveOrder(vec2(500, 0));
    fly(b, order, 40);
    const settled = { x: b.position.x, y: b.position.y };
    fly(b, order, 10);
    expect(distance(b.position, settled)).toBeLessThan(order.arriveRadius);
  });
});

describe('hasArrived', () => {
  it('is false far away and true within the radius', () => {
    const order = makeMoveOrder(vec2(100, 0), 20);
    expect(hasArrived(makeBody({ position: vec2(0, 0) }), order)).toBe(false);
    expect(hasArrived(makeBody({ position: vec2(95, 0) }), order)).toBe(true);
  });
});
