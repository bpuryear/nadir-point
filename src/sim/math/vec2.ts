/**
 * 2D vector math. The sim's only geometry primitive.
 *
 * Every operation that produces a vector writes into an `out` parameter and
 * returns it, so the hot paths (integration, collision) can run against pooled
 * vectors without allocating per tick. Aliasing `out` with an input is safe:
 * every function reads both inputs into locals before writing.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  out.x = ax + bx;
  out.y = ay + by;
  return out;
}

export function sub(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  out.x = ax - bx;
  out.y = ay - by;
  return out;
}

export function scale(out: Vec2, a: Vec2, s: number): Vec2 {
  const ax = a.x, ay = a.y;
  out.x = ax * s;
  out.y = ay * s;
  return out;
}

export function addScaled(out: Vec2, a: Vec2, b: Vec2, s: number): Vec2 {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  out.x = ax + bx * s;
  out.y = ay + by * s;
  return out;
}

export function lenSq(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function len(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** A zero-length input yields the zero vector rather than NaN. */
export function normalize(out: Vec2, a: Vec2): Vec2 {
  const ax = a.x, ay = a.y;
  const l = Math.sqrt(ax * ax + ay * ay);
  if (l === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = ax / l;
  out.y = ay / l;
  return out;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** The 2D scalar cross product — positive when b is counter-clockwise of a. */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function rotate(out: Vec2, a: Vec2, radians: number): Vec2 {
  const ax = a.x, ay = a.y;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  out.x = ax * c - ay * s;
  out.y = ax * s + ay * c;
  return out;
}

export function fromAngle(out: Vec2, radians: number, length = 1): Vec2 {
  out.x = Math.cos(radians) * length;
  out.y = Math.sin(radians) * length;
  return out;
}

/** Radians in (−π, π]. */
export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

/**
 * The shortest signed turn from one heading to another, in (−π, π].
 *
 * Every turn in the game goes through here. Without the wrap, a ship correcting
 * a 10° error across the ±π seam turns 350° the wrong way to get there.
 */
export function angleDelta(from: number, to: number): number {
  const TAU = Math.PI * 2;
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
