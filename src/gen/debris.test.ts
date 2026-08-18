import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, type FactionId } from './palette.js';
import { checkBinaryAlpha, checkPalette } from './qc.js';
import {
  buildDebris, buildDebrisSet, DEBRIS_EXTENT, DEBRIS_SIZES, type DebrisSize,
} from './debris.js';

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];

describe('size bands', () => {
  it('names four, smallest first', () => {
    expect(DEBRIS_SIZES).toEqual(['chip', 'shard', 'chunk', 'hulk']);
  });

  it('gives each band an ascending, non-overlapping extent', () => {
    for (let i = 1; i < DEBRIS_SIZES.length; i++) {
      const prev = DEBRIS_EXTENT[DEBRIS_SIZES[i - 1]!];
      const cur = DEBRIS_EXTENT[DEBRIS_SIZES[i]!];
      expect(cur[0]).toBeGreaterThanOrEqual(prev[1]);
    }
  });

  it('respects its band', () => {
    for (const size of DEBRIS_SIZES) {
      const [lo, hi] = DEBRIS_EXTENT[size];
      for (const seed of ['a', 'b', 'c', 'd']) {
        const d = buildDebris(size, 'player', makeRng(seed));
        const longest = Math.max(d.buf.w, d.buf.h);
        expect(longest).toBeGreaterThanOrEqual(lo);
        expect(longest).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe('debris sprites', () => {
  it('draws something in every band and faction', () => {
    for (const size of DEBRIS_SIZES) {
      for (const faction of ALL_FACTIONS) {
        const d = buildDebris(size, faction, makeRng(`${size}-${faction}`));
        expect(countOpaque(d.buf), `${size}/${faction}`).toBeGreaterThan(2);
      }
    }
  });

  it('stays on its faction palette', () => {
    for (const size of DEBRIS_SIZES) {
      for (const faction of ALL_FACTIONS) {
        const d = buildDebris(size, faction, makeRng(`${size}-${faction}`));
        expect(checkPalette(d.buf, FACTION_PALETTE[faction])).toEqual([]);
        expect(checkBinaryAlpha(d.buf)).toEqual([]);
      }
    }
  });

  it('is irregular — debris is torn, not cut', () => {
    // A perfect rectangle reads as a crate. Wreckage should not fill its box.
    for (const size of ['chunk', 'hulk'] as DebrisSize[]) {
      const d = buildDebris(size, 'player', makeRng(size));
      const b = opaqueBounds(d.buf)!;
      const boxArea = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
      expect(countOpaque(d.buf) / boxArea).toBeLessThan(0.92);
    }
  });

  it('touches its own bounding box on every side — no dead margin', () => {
    const d = buildDebris('chunk', 'player', makeRng('m'));
    const b = opaqueBounds(d.buf)!;
    expect(b.x0).toBe(0);
    expect(b.y0).toBe(0);
    expect(b.x1).toBe(d.buf.w - 1);
    expect(b.y1).toBe(d.buf.h - 1);
  });

  it('uses more than one value, so it reads as plate rather than a blob', () => {
    const d = buildDebris('hulk', 'player', makeRng('v'));
    const used = new Set<number>();
    for (let i = 0; i < d.buf.data.length; i += 4) {
      if (d.buf.data[i + 3] !== 0) {
        used.add((d.buf.data[i]! << 16) | (d.buf.data[i + 1]! << 8) | d.buf.data[i + 2]!);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(2);
  });
});

describe('debris sets', () => {
  it('returns one sprite per size per requested count', () => {
    expect(buildDebrisSet('player', makeRng('s'), 3)).toHaveLength(12);
  });

  it('varies within a set — no two pieces identical', () => {
    const set = buildDebrisSet('player', makeRng('s'), 4);
    const keys = set.map((d) => `${d.size}:${Array.from(d.buf.data).join(',')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every size band', () => {
    const set = buildDebrisSet('coalition', makeRng('s'), 2);
    expect(new Set(set.map((d) => d.size))).toEqual(new Set(DEBRIS_SIZES));
  });
});

describe('determinism', () => {
  it('rebuilds identically from the same seed', () => {
    expect(Array.from(buildDebris('chunk', 'concord', makeRng('z')).buf.data))
      .toEqual(Array.from(buildDebris('chunk', 'concord', makeRng('z')).buf.data));
  });
});
