import { describe, expect, it } from 'vitest';
import { makeRng } from './rng.js';

const draw = (seed: string, n: number) => {
  const r = makeRng(seed);
  return Array.from({ length: n }, () => r.next());
};

describe('rng determinism', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw('salvager', 20)).toEqual(draw('salvager', 20));
  });

  it('produces a different sequence for a different seed', () => {
    expect(draw('salvager', 20)).not.toEqual(draw('salvagex', 20));
  });

  it('stays inside [0, 1)', () => {
    const r = makeRng('bounds');
    for (let i = 0; i < 10_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('does not immediately repeat itself', () => {
    const values = new Set(draw('cycle', 5000));
    expect(values.size).toBeGreaterThan(4990);
  });
});

describe('rng derived draws', () => {
  it('returns integers in [0, n)', () => {
    const r = makeRng('ints');
    for (let i = 0; i < 5000; i++) {
      const v = r.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('covers the whole integer range', () => {
    const r = makeRng('coverage');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.int(6));
    expect(seen.size).toBe(6);
  });

  it('treats int(0) and int(1) as degenerate rather than NaN', () => {
    const r = makeRng('degenerate');
    expect(r.int(1)).toBe(0);
    expect(r.int(0)).toBe(0);
  });

  it('returns floats inside a range', () => {
    const r = makeRng('range');
    for (let i = 0; i < 2000; i++) {
      const v = r.range(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });

  it('picks an element from the array', () => {
    const r = makeRng('pick');
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(r.pick(items));
  });

  it('refuses to pick from an empty array', () => {
    expect(() => makeRng('empty').pick([])).toThrow(RangeError);
  });

  it('honours the probability passed to chance', () => {
    const r = makeRng('chance');
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (r.chance(0.25)) hits++;
    expect(hits).toBeGreaterThan(2200);
    expect(hits).toBeLessThan(2800);
  });

  it('treats chance(0) and chance(1) as absolute', () => {
    const r = makeRng('absolutes');
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });
});

describe('rng splitting', () => {
  it('gives the same child stream for the same parent seed and name', () => {
    const a = makeRng('world').split('sprites');
    const b = makeRng('world').split('sprites');
    expect(Array.from({ length: 10 }, () => a.next()))
      .toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('gives different streams for different names', () => {
    const parent = makeRng('world');
    const sprites = parent.split('sprites');
    const layout = parent.split('layout');
    expect(Array.from({ length: 10 }, () => sprites.next()))
      .not.toEqual(Array.from({ length: 10 }, () => layout.next()));
  });

  it('does not advance the parent when a child is drawn from', () => {
    const parent = makeRng('world');
    const child = parent.split('combat');
    for (let i = 0; i < 100; i++) child.next();

    const untouched = makeRng('world');
    untouched.split('combat');

    expect(parent.next()).toBe(untouched.next());
  });

  it('keeps sibling streams independent — this is the whole point', () => {
    // Draw heavily from combat, then confirm factionwar is unmoved.
    const a = makeRng('seed-1');
    const combatA = a.split('combat');
    const warA = a.split('factionwar');
    for (let i = 0; i < 500; i++) combatA.next();
    const afterHeavyCombat = Array.from({ length: 10 }, () => warA.next());

    const b = makeRng('seed-1');
    b.split('combat');
    const warB = b.split('factionwar');
    const withoutCombat = Array.from({ length: 10 }, () => warB.next());

    expect(afterHeavyCombat).toEqual(withoutCombat);
  });

  it('splits recursively', () => {
    const deep = makeRng('root').split('a').split('b');
    const same = makeRng('root').split('a').split('b');
    expect(deep.next()).toBe(same.next());
  });
});
