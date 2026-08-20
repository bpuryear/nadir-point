import { describe, expect, it } from 'vitest';
import {
  add, addScaled, angleDelta, angleOf, cross, distance, dot, fromAngle,
  len, lenSq, normalize, rotate, scale, sub, vec2,
} from './vec2.js';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 10);

describe('vec2 construction', () => {
  it('defaults to the origin', () => {
    expect(vec2()).toEqual({ x: 0, y: 0 });
  });

  it('carries the values it is given', () => {
    expect(vec2(3, -4)).toEqual({ x: 3, y: -4 });
  });
});

describe('vec2 arithmetic writes into out and returns it', () => {
  it('adds', () => {
    const out = vec2();
    const r = add(out, vec2(1, 2), vec2(10, 20));
    expect(r).toBe(out);
    expect(out).toEqual({ x: 11, y: 22 });
  });

  it('subtracts', () => {
    expect(sub(vec2(), vec2(10, 20), vec2(1, 2))).toEqual({ x: 9, y: 18 });
  });

  it('scales', () => {
    expect(scale(vec2(), vec2(3, -4), 2)).toEqual({ x: 6, y: -8 });
  });

  it('adds a scaled vector — the integrator step', () => {
    expect(addScaled(vec2(), vec2(1, 1), vec2(10, 20), 0.5)).toEqual({ x: 6, y: 11 });
  });

  it('aliases safely when out is also an input', () => {
    const a = vec2(1, 2);
    add(a, a, a);
    expect(a).toEqual({ x: 2, y: 4 });
  });
});

describe('vec2 magnitude', () => {
  it('measures length', () => {
    expect(len(vec2(3, 4))).toBe(5);
  });

  it('measures squared length without a square root', () => {
    expect(lenSq(vec2(3, 4))).toBe(25);
  });

  it('measures distance between points', () => {
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
  });

  it('normalizes to unit length', () => {
    const n = normalize(vec2(), vec2(3, 4));
    close(n.x, 0.6);
    close(n.y, 0.8);
    close(len(n), 1);
  });

  it('normalizes the zero vector to zero rather than NaN', () => {
    expect(normalize(vec2(), vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe('vec2 products', () => {
  it('takes the dot product', () => {
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
  });

  it('takes the 2D scalar cross product', () => {
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1);
    expect(cross(vec2(0, 1), vec2(1, 0))).toBe(-1);
  });
});

describe('vec2 angles', () => {
  it('rotates a quarter turn', () => {
    const r = rotate(vec2(), vec2(1, 0), Math.PI / 2);
    close(r.x, 0);
    close(r.y, 1);
  });

  it('builds a vector from an angle and length', () => {
    const v = fromAngle(vec2(), 0, 5);
    close(v.x, 5);
    close(v.y, 0);
  });

  it('defaults fromAngle to unit length', () => {
    close(len(fromAngle(vec2(), 1.234)), 1);
  });

  it('reads the angle of a vector', () => {
    close(angleOf(vec2(0, 1)), Math.PI / 2);
    close(angleOf(vec2(-1, 0)), Math.PI);
  });

  it('round-trips angle to vector and back', () => {
    for (const a of [0, 0.5, 1.5, 3, -0.5, -3]) {
      close(angleOf(fromAngle(vec2(), a)), a);
    }
  });

  it('takes the short way around when computing a turn', () => {
    close(angleDelta(0.1, -0.1), -0.2);
    close(angleDelta(-3.0, 3.0), -0.283185307179586);
    close(angleDelta(3.0, -3.0), 0.283185307179586);
  });

  it('returns a turn no larger than half a revolution', () => {
    for (let from = -Math.PI; from < Math.PI; from += 0.37) {
      for (let to = -Math.PI; to < Math.PI; to += 0.41) {
        expect(Math.abs(angleDelta(from, to))).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});
