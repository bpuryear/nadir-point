import { describe, expect, it } from 'vitest';
import { makeRng } from '../../sim/rng.js';
import type { FactionId } from '../palette.js';
import {
  buildProfile, isFilled, profileArea, profileWidth, SIZE_LENGTH, type SizeClass,
} from './profile.js';

const build = (faction: FactionId, sizeClass: SizeClass, seed = 'p') =>
  buildProfile({ faction, sizeClass, rng: makeRng(seed) });

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];
const ALL_SIZES: SizeClass[] = ['fighter', 'corvette', 'destroyer', 'cruiser', 'capital'];

/** Counts how many times the half-width changes value along the hull. */
function widthSteps(halfWidth: Int32Array): number {
  let steps = 0;
  for (let i = 1; i < halfWidth.length; i++) {
    if (halfWidth[i] !== halfWidth[i - 1]) steps++;
  }
  return steps;
}

describe('profile dimensions', () => {
  it('respects the size class length range', () => {
    for (const sizeClass of ALL_SIZES) {
      const [lo, hi] = SIZE_LENGTH[sizeClass];
      for (const faction of ALL_FACTIONS) {
        const p = build(faction, sizeClass);
        expect(p.length).toBeGreaterThanOrEqual(lo);
        expect(p.length).toBeLessThanOrEqual(hi);
        expect(p.halfWidth.length).toBe(p.length);
      }
    }
  });

  it('puts the cruiser inside the 96-128px band the spec fixes', () => {
    expect(SIZE_LENGTH.cruiser[0]).toBeGreaterThanOrEqual(96);
    expect(SIZE_LENGTH.cruiser[1]).toBeLessThanOrEqual(128);
  });

  it('keeps fighters at 8-12px', () => {
    expect(SIZE_LENGTH.fighter).toEqual([8, 12]);
  });

  it('keeps capitals at or under 160px', () => {
    expect(SIZE_LENGTH.capital[1]).toBeLessThanOrEqual(160);
  });

  it('honours an explicit length', () => {
    const p = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('x'), length: 110 });
    expect(p.length).toBe(110);
  });

  it('never lets a hull be wider than it is long', () => {
    for (const faction of ALL_FACTIONS) {
      for (const sizeClass of ALL_SIZES) {
        const p = build(faction, sizeClass);
        expect(p.maxHalfWidth * 2).toBeLessThan(p.length);
      }
    }
  });

  it('reports maxHalfWidth accurately', () => {
    const p = build('player', 'cruiser');
    expect(p.maxHalfWidth).toBe(Math.max(...Array.from(p.halfWidth)));
  });
});

describe('profile shape', () => {
  it('has a bow narrower than its widest point', () => {
    for (const faction of ALL_FACTIONS) {
      const p = build(faction, 'cruiser');
      expect(p.halfWidth[0]!).toBeLessThan(p.maxHalfWidth);
    }
  });

  it('is never negative and never zero at the widest point', () => {
    for (const faction of ALL_FACTIONS) {
      const p = build(faction, 'destroyer');
      for (const w of p.halfWidth) expect(w).toBeGreaterThanOrEqual(0);
      expect(p.maxHalfWidth).toBeGreaterThan(0);
    }
  });

  it('keeps a continuous hull for live factions — no interior gaps', () => {
    // A hole in the middle of a Concord hull is a generator bug. Derelicts are
    // exempt: erosion is their whole point.
    for (const faction of ['concord', 'coalition', 'player'] as const) {
      const p = build(faction, 'cruiser');
      const firstFilled = Array.from(p.halfWidth).findIndex((w) => w > 0);
      const lastFilled = p.halfWidth.length - 1 -
        Array.from(p.halfWidth).reverse().findIndex((w) => w > 0);
      for (let y = firstFilled; y <= lastFilled; y++) {
        expect(p.halfWidth[y]!).toBeGreaterThan(0);
      }
    }
  });

  it('lets derelicts be eroded — they may have gaps', () => {
    const anyGap = ['a', 'b', 'c', 'd', 'e'].some((seed) => {
      const p = build('derelict', 'cruiser', seed);
      const filled = Array.from(p.halfWidth);
      const first = filled.findIndex((w) => w > 0);
      const last = filled.length - 1 - [...filled].reverse().findIndex((w) => w > 0);
      return filled.slice(first, last + 1).some((w) => w === 0);
    });
    expect(anyGap).toBe(true);
  });

  it('never erodes a hull out of existence', () => {
    // A profile with no filled rows is an invisible ship: empty sprite, no
    // surface for hardpoints, nothing to render. Erosion may take bites; it may
    // not eat the whole hull. Short derelicts are the exposed case.
    for (const sizeClass of ['fighter', 'corvette', 'destroyer', 'cruiser'] as SizeClass[]) {
      for (let i = 0; i < 500; i++) {
        const p = build('derelict', sizeClass, `erode-${i}`);
        expect(p.maxHalfWidth, `derelict/${sizeClass}/erode-${i}`).toBeGreaterThan(0);
        expect(profileArea(p), `derelict/${sizeClass}/erode-${i}`).toBeGreaterThan(0);
      }
    }
  });

  it('never lets a hull be flat for more than half its length', () => {
    // A profile that holds one width across most of the hull has no
    // silhouette. Slab sides are the Coalition and player languages; a single
    // slab is a brick, and at LOD tier 4 a brick is indistinguishable from any
    // other brick. Fighters are exempt — at 8-12px there is no shape to hold.
    //
    // The seed sweep is wide on purpose. Three seeds passed this assertion
    // while a broader sample sat exactly on the threshold, so a narrow sample
    // proves nothing here.
    const sizes: SizeClass[] = ['corvette', 'destroyer', 'cruiser', 'capital'];
    const seeds = Array.from({ length: 40 }, (_, i) => `sweep-${i}`);

    let worst = 0;
    let worstAt = '';

    for (const faction of ALL_FACTIONS) {
      for (const sizeClass of sizes) {
        for (const seed of seeds) {
          const p = build(faction, sizeClass, seed);
          let longest = 0;
          let run = 1;
          for (let i = 1; i < p.length; i++) {
            run = p.halfWidth[i] === p.halfWidth[i - 1] ? run + 1 : 1;
            if (run > longest) longest = run;
          }
          const ratio = longest / p.length;
          if (ratio > worst) {
            worst = ratio;
            worstAt = `${faction}/${sizeClass}/${seed} run=${longest} len=${p.length}`;
          }
        }
      }
    }

    expect(worst, `worst case: ${worstAt}`).toBeLessThan(0.5);
  });
});

describe('faction shape language', () => {
  it('makes Coalition hulls visibly stepped and Concord hulls smooth', () => {
    // This is the shape language, expressed as an assertion: Coalition is
    // welded from slabs and changes width abruptly; Concord is a milled wedge.
    const concordSteps = widthSteps(build('concord', 'cruiser').halfWidth);
    const coalitionRuns = build('coalition', 'cruiser').halfWidth;

    let longestFlatRun = 0;
    let run = 1;
    for (let i = 1; i < coalitionRuns.length; i++) {
      run = coalitionRuns[i] === coalitionRuns[i - 1] ? run + 1 : 1;
      longestFlatRun = Math.max(longestFlatRun, run);
    }

    expect(longestFlatRun).toBeGreaterThan(8);   // Coalition has slab sections
    expect(concordSteps).toBeGreaterThan(20);    // Concord tapers continuously
  });

  it('gives each faction a different silhouette from the same seed', () => {
    const shapes = ALL_FACTIONS.map((f) => Array.from(build(f, 'cruiser', 'same').halfWidth).join(','));
    expect(new Set(shapes).size).toBe(4);
  });

  it('makes Coalition hulls beamier than Concord ones', () => {
    const concord = build('concord', 'cruiser');
    const coalition = build('coalition', 'cruiser');
    const ratio = (p: ReturnType<typeof build>) => p.maxHalfWidth / p.length;
    expect(ratio(coalition)).toBeGreaterThan(ratio(concord));
  });
});

describe('determinism', () => {
  it('produces identical profiles from identical seeds', () => {
    const a = build('concord', 'destroyer', 'seed-1');
    const b = build('concord', 'destroyer', 'seed-1');
    expect(Array.from(a.halfWidth)).toEqual(Array.from(b.halfWidth));
  });

  it('produces different profiles from different seeds', () => {
    const a = build('concord', 'destroyer', 'seed-1');
    const b = build('concord', 'destroyer', 'seed-2');
    expect(Array.from(a.halfWidth)).not.toEqual(Array.from(b.halfWidth));
  });
});

describe('queries', () => {
  it('reports full width as twice the half-width plus the centreline', () => {
    const p = build('player', 'cruiser');
    expect(profileWidth(p, 50)).toBe(p.halfWidth[50]! * 2 + 1);
  });

  it('reports zero width outside the hull', () => {
    const p = build('player', 'cruiser');
    expect(profileWidth(p, -1)).toBe(0);
    expect(profileWidth(p, p.length)).toBe(0);
  });

  it('fills symmetrically about the centreline', () => {
    const p = build('player', 'cruiser');
    for (let y = 0; y < p.length; y += 7) {
      for (let x = 0; x <= p.maxHalfWidth; x++) {
        expect(isFilled(p, x, y)).toBe(isFilled(p, -x, y));
      }
    }
  });

  it('excludes points beyond the half-width', () => {
    const p = build('player', 'cruiser');
    const y = 40;
    expect(isFilled(p, p.halfWidth[y]!, y)).toBe(true);
    expect(isFilled(p, p.halfWidth[y]! + 1, y)).toBe(false);
  });

  it('measures area as the sum of row widths', () => {
    const p = build('player', 'corvette');
    let expected = 0;
    for (let y = 0; y < p.length; y++) expected += profileWidth(p, y);
    expect(profileArea(p)).toBe(expected);
  });
});
