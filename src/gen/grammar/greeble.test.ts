import { describe, expect, it } from 'vitest';
import { makeRng } from '../../sim/rng.js';
import { getPx, isOpaque, opaqueBounds } from '../pixbuf.js';
import { EMISSIVE, isEmissive, NEUTRAL } from '../palette.js';
import { checkLightDirection, checkPalette } from '../qc.js';
import { buildProfile, type SizeClass } from './profile.js';
import { plateHull } from './plates.js';
import {
  applyGreebles, applyRunningLights, GREEBLE_BUDGET, RUNNING_LIGHT_SPACING, runningLightRows,
} from './greeble.js';

const make = (sizeClass: SizeClass = 'cruiser', seed = 'g') => {
  const profile = buildProfile({ faction: 'player', sizeClass, rng: makeRng(seed) });
  const hull = plateHull({ profile, ramp: NEUTRAL, rng: makeRng(seed) });
  return { profile, hull };
};

/** The set of opaque pixel coordinates — the silhouette. */
const silhouette = (buf: { w: number; h: number }, get: (x: number, y: number) => number) => {
  const s = new Set<string>();
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) if (isOpaque(get(x, y))) s.add(`${x},${y}`);
  }
  return s;
};

describe('greeble budget', () => {
  it('scales with size class', () => {
    expect(GREEBLE_BUDGET.fighter).toBeLessThan(GREEBLE_BUDGET.corvette);
    expect(GREEBLE_BUDGET.corvette).toBeLessThan(GREEBLE_BUDGET.destroyer);
    expect(GREEBLE_BUDGET.destroyer).toBeLessThan(GREEBLE_BUDGET.cruiser);
    expect(GREEBLE_BUDGET.cruiser).toBeLessThan(GREEBLE_BUDGET.capital);
  });

  it('gives fighters almost nothing — at 8-12px there is no room for detail', () => {
    expect(GREEBLE_BUDGET.fighter).toBeLessThanOrEqual(2);
  });

  it('never exceeds the budget', () => {
    for (const sizeClass of Object.keys(GREEBLE_BUDGET) as SizeClass[]) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const { profile, hull } = make(sizeClass, seed);
        const placed = applyGreebles(hull, profile, NEUTRAL, makeRng(seed));
        expect(placed).toBeLessThanOrEqual(GREEBLE_BUDGET[sizeClass]);
      }
    }
  });
});

describe('greebles never touch the outline', () => {
  it('leaves the silhouette pixel-identical', () => {
    // This is the constraint that keeps every module identifiable by outline.
    // Greebles are interior decoration; if one can change the edge, the
    // silhouette economy is dead.
    for (const seed of ['a', 'b', 'c']) {
      const { profile, hull } = make('cruiser', seed);
      const before = silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y));
      applyGreebles(hull, profile, NEUTRAL, makeRng(seed));
      const after = silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y));
      expect(after).toEqual(before);
    }
  });

  it('leaves the bounding box unchanged', () => {
    const { profile, hull } = make();
    const before = opaqueBounds(hull.buf);
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(opaqueBounds(hull.buf)).toEqual(before);
  });

  it('stays inside the hull ramp', () => {
    const { profile, hull } = make();
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(checkPalette(hull.buf, NEUTRAL)).toEqual([]);
  });

  it('does not break the light-direction check', () => {
    const { profile, hull } = make();
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(checkLightDirection(hull.buf)!.pass).toBe(true);
  });

  it('actually changes something', () => {
    const { profile, hull } = make();
    const before = Array.from(hull.buf.data);
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(Array.from(hull.buf.data)).not.toEqual(before);
  });
});

describe('running lights', () => {
  it('spaces them evenly along the hull', () => {
    const { profile } = make('cruiser');
    const rows = runningLightRows(profile);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]! - rows[i - 1]!).toBe(RUNNING_LIGHT_SPACING);
    }
  });

  it('gives longer hulls more lights — this is the scale cue', () => {
    // Known spacing along a hull is one of the three cues that make a 4px
    // speck read as kilometres long. More hull, more lights.
    const cruiser = runningLightRows(make('cruiser').profile).length;
    const capital = runningLightRows(make('capital').profile).length;
    expect(capital).toBeGreaterThan(cruiser);
  });

  it('places an emissive pixel on each side at each row', () => {
    const { profile, hull } = make();
    const placed = applyRunningLights(hull, profile, EMISSIVE.amber);
    expect(placed).toBe(runningLightRows(profile).length * 2);
  });

  it('uses only emissive colours for the lights', () => {
    const { profile, hull } = make();
    applyRunningLights(hull, profile, EMISSIVE.amber);
    let found = 0;
    for (let y = 0; y < hull.buf.h; y++) {
      for (let x = 0; x < hull.buf.w; x++) {
        if (isEmissive(getPx(hull.buf, x, y))) found++;
      }
    }
    expect(found).toBe(runningLightRows(profile).length * 2);
  });

  it('does not change the silhouette either', () => {
    const { profile, hull } = make();
    const before = silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y));
    applyRunningLights(hull, profile, EMISSIVE.amber);
    expect(silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y))).toEqual(before);
  });

  it('places no lights on a hull shorter than the spacing', () => {
    const { profile } = make('fighter');
    expect(runningLightRows(profile)).toEqual([]);
  });
});

describe('determinism', () => {
  it('places identical greebles from the same seed', () => {
    const a = make('cruiser', 'same');
    const b = make('cruiser', 'same');
    applyGreebles(a.hull, a.profile, NEUTRAL, makeRng('r'));
    applyGreebles(b.hull, b.profile, NEUTRAL, makeRng('r'));
    expect(Array.from(a.hull.buf.data)).toEqual(Array.from(b.hull.buf.data));
  });
});
