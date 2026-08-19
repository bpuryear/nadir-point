/**
 * Fixed-step motion integration.
 *
 * The acceptance criterion "the cruiser cannot change heading instantly at any
 * speed" is satisfied here or nowhere. Heading moves only through angular
 * velocity, angular velocity moves only through angular acceleration, and
 * nothing in this module assigns a heading directly. A ship that could snap its
 * facing would make every firing arc meaningless, since bringing an arc to bear
 * is supposed to be the primary combat skill.
 *
 * Drift falls out of the same structure for free: turning changes where the
 * ship points, not where it is going, and only thrust along the new heading
 * gradually redirects the velocity.
 */

import { wrapHeading, type Body } from './body.js';
import { addScaled, fromAngle, scale, vec2 } from './math/vec2.js';

export const TICK_HZ = 60 as const;
export const TICK_SECONDS = 1 / TICK_HZ;

/** Both fields are intentions in [-1, 1], not forces. */
export interface Control {
  thrust: number;
  turn: number;
}

export const NEUTRAL: Readonly<Control> = { thrust: 0, turn: 0 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Scratch vectors, module-level so the hot path allocates nothing per tick. */
const _accel = vec2();

export function integrate(body: Body, control: Control, dt: number): void {
  const turn = clamp(control.turn, -1, 1);
  const thrust = clamp(control.thrust, -1, 1);

  // Angular: the commanded rate is approached, never assumed.
  const targetRate = turn * body.turnRate;
  const rateDelta = targetRate - body.angularVelocity;
  const maxRateChange = body.angularAccel * dt;
  body.angularVelocity += clamp(rateDelta, -maxRateChange, maxRateChange);
  body.angularVelocity = clamp(body.angularVelocity, -body.turnRate, body.turnRate);

  body.heading = wrapHeading(body.heading + body.angularVelocity * dt);

  // Linear: thrust acts along the current heading, so a turn only redirects
  // travel as fast as the engines can push the velocity around.
  fromAngle(_accel, body.heading, thrust * body.thrust);
  addScaled(body.velocity, body.velocity, _accel, dt);

  // Drag is small and exists so the ship settles rather than coasting forever.
  const damping = Math.max(0, 1 - body.drag * dt);
  scale(body.velocity, body.velocity, damping);

  addScaled(body.position, body.position, body.velocity, dt);
}

/**
 * Roughly how far the body travels if it brakes at full thrust from now.
 *
 * Used by the order system to decide when to start slowing down. Ignores drag,
 * which makes it a slight over-estimate — braking early looks deliberate,
 * braking late looks like a mistake.
 */
export function stoppingDistance(body: Body): number {
  const v = Math.hypot(body.velocity.x, body.velocity.y);
  if (v === 0) return 0;
  return (v * v) / (2 * body.thrust);
}
