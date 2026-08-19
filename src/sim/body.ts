/**
 * A 2D rigid body — the state every moving thing in the game carries.
 *
 * Deliberately a plain data record with no behaviour. The integrator advances
 * it, the order system steers it, and the renderer reads it, but none of them
 * owns it. That keeps the simulation a pure transformation of state rather than
 * a graph of objects calling each other.
 */

import { vec2, type Vec2 } from './math/vec2.js';

export interface Body {
  position: Vec2;
  velocity: Vec2;
  /** Radians. 0 points along +X. */
  heading: number;
  /** Radians per second. */
  angularVelocity: number;
  mass: number;
  /** Peak linear acceleration, world units per second squared. */
  thrust: number;
  /** Peak turn rate, radians per second. */
  turnRate: number;
  /** How fast the turn rate itself can change, radians per second squared. */
  angularAccel: number;
  /** Linear damping per second. Small — this is not a frictionless vacuum by choice. */
  drag: number;
}

export type BodySpec = Partial<Body>;

/**
 * The player cruiser's tuning.
 *
 * The spec asks for mass and momentum to be real, and notes that in 2D there is
 * no visual weight to lean on — the movement integrator has to sell it alone.
 * So: a full revolution takes about six seconds at peak rate, and reaching that
 * rate takes another second on top. Drift, overshoot and turn commitment all
 * fall out of those two numbers.
 */
export const CRUISER_BODY: Readonly<BodySpec> = {
  mass: 1200,
  thrust: 26,
  turnRate: 1.05,
  angularAccel: 0.9,
  drag: 0.35,
};

export function makeBody(spec: BodySpec = {}): Body {
  return {
    // Copy rather than adopt: two bodies made from one spec must not share a
    // position vector, or they would move together.
    position: spec.position ? vec2(spec.position.x, spec.position.y) : vec2(),
    velocity: spec.velocity ? vec2(spec.velocity.x, spec.velocity.y) : vec2(),
    heading: spec.heading ?? 0,
    angularVelocity: spec.angularVelocity ?? 0,
    mass: spec.mass ?? 1000,
    thrust: spec.thrust ?? 30,
    turnRate: spec.turnRate ?? 1.2,
    angularAccel: spec.angularAccel ?? 1.0,
    drag: spec.drag ?? 0.35,
  };
}

export function speed(b: Body): number {
  return Math.hypot(b.velocity.x, b.velocity.y);
}

/** Normalises a heading into (−π, π]. */
export function wrapHeading(radians: number): number {
  const TAU = Math.PI * 2;
  let a = radians % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}
