/**
 * The tactical camera.
 *
 * Two jobs, and the second one is load-bearing for the art direction.
 *
 * It follows the ship with lag and a small lead in the direction of travel. A
 * camera welded to the hull makes the world jerk around a stationary ship;
 * lagging lets the ship read as heavy instead. Leading keeps the player looking
 * where they are going, which is what stops them fighting the camera — the spec
 * forbids that outright.
 *
 * And it snaps to the pixel grid. A camera at a fractional world position puts
 * every sprite on a fractional pixel, and the entire scene crawls no matter how
 * carefully the sprites themselves were baked. Snapping is cheap and it is the
 * difference between a still image and a shimmering one.
 */

import { type Body } from '../sim/body.js';
import { addScaled, sub, vec2, type Vec2 } from '../sim/math/vec2.js';

export interface Camera {
  position: Vec2;
  /** Fraction of the remaining gap closed per second. */
  lag: number;
  /** Seconds of velocity to look ahead by. */
  lead: number;
}

export const DEFAULT_LAG = 3.2;
export const DEFAULT_LEAD = 0.45;

export function makeCamera(at: Vec2 = vec2()): Camera {
  return { position: vec2(at.x, at.y), lag: DEFAULT_LAG, lead: DEFAULT_LEAD };
}

const _desired = vec2();
const _gap = vec2();

export function followBody(cam: Camera, body: Body, dt: number): void {
  // Look ahead of the ship by a fraction of a second of travel.
  _desired.x = body.position.x + body.velocity.x * cam.lead;
  _desired.y = body.position.y + body.velocity.y * cam.lead;

  sub(_gap, _desired, cam.position);

  // Exponential approach, frame-rate independent.
  const t = 1 - Math.exp(-cam.lag * dt);
  addScaled(cam.position, cam.position, _gap, t);
}

/**
 * The camera centre rounded onto the current zoom's pixel grid.
 *
 * Returns a new value rather than moving the camera, so the smooth follow keeps
 * its sub-pixel precision internally and only the rendered centre is quantised.
 * Quantising the camera itself would make it stutter as it crept between cells.
 */
export function snappedCentre(out: Vec2, cam: Camera, unitsPerPixel: number): Vec2 {
  out.x = Math.round(cam.position.x / unitsPerPixel) * unitsPerPixel;
  out.y = Math.round(cam.position.y / unitsPerPixel) * unitsPerPixel;
  return out;
}
