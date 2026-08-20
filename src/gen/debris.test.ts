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

  it('keeps chunks and hulks between confetti and cargo', () => {
    // A single tear draw satisfies neither bound reliably: one seed in a
    // hundred produced a 98%-filled slab that reads as cargo, another a
    // 17%-filled scatter that reads as noise. Sweep, do not sample.
    for (const size of ['chunk', 'hulk'] as DebrisSize[]) {
      for (const faction of ALL_FACTIONS) {
        for (let i = 0; i < 60; i++) {
          const d = buildDebris(size, faction, makeRng(`fill-${i}`));
          const b = opaqueBounds(d.buf)!;
          const area = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
          const fill = countOpaque(d.buf) / area;
          expect(fill, `${size}/${faction}/${i} fill ${fill.toFixed(3)}`).toBeGreaterThanOrEqual(0.35);
          expect(fill, `${size}/${faction}/${i} fill ${fill.toFixed(3)}`).toBeLessThanOrEqual(0.92);
        }
      }
    }
  });

  it('never throws for any faction, band or seed', () => {
    // buildDebris asserts its own QC and threw on roughly one build in a
    // thousand. The contact sheet builds debris across four factions.
    for (const size of DEBRIS_SIZES) {
      for (const faction of ALL_FACTIONS) {
        for (let i = 0; i < 60; i++) {
          expect(() => buildDebris(size, faction, makeRng(`throw-${i}`)), `${size}/${faction}/${i}`)
            .not.toThrow();
        }
      }
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

  it('varies within a set — no two shard/chunk/hulk pieces identical', () => {
    // Chip is excluded: a 2-4px piece has a state space small enough (a handful
    // of pixels, most of them anchored against the band-minimum guarantee) that
    // two independent draws can coincide by chance even with the weathering
    // offset. Two identical 3-pixel specks in a debris field are invisible, so
    // this is not chased — see the task report. Shard/chunk/hulk have enough
    // room that a collision would be a real defect.
    const set = buildDebrisSet('player', makeRng('s'), 4);
    const keys = set
      .filter((d) => d.size !== 'chip')
      .map((d) => `${d.size}:${Array.from(d.buf.data).join(',')}`);
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
