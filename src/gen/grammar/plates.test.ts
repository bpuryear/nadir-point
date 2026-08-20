import { describe, expect, it } from 'vitest';
import { makeRng } from '../../sim/rng.js';
import { countOpaque, getPx, isOpaque, luminance } from '../pixbuf.js';
import { CONCORD_RAMP, NEUTRAL } from '../palette.js';
import { checkLightDirection, checkPalette } from '../qc.js';
import { buildProfile, isFilled } from './profile.js';
import { ditherMask, plateHull } from './plates.js';

const hull = (faction: 'concord' | 'player' = 'player', seed = 'plate') => {
  const profile = buildProfile({ faction, sizeClass: 'cruiser', rng: makeRng(seed) });
  const ramp = faction === 'concord' ? CONCORD_RAMP : NEUTRAL;
  return { profile, ramp, plated: plateHull({ profile, ramp, rng: makeRng(seed) }) };
};

describe('plated hull geometry', () => {
  it('fills exactly the profile and nothing else', () => {
    const { profile, plated } = hull();
    for (let y = 0; y < plated.buf.h; y++) {
      for (let x = 0; x < plated.buf.w; x++) {
        const filled = isFilled(profile, x - plated.centreX, y);
        expect(isOpaque(getPx(plated.buf, x, y))).toBe(filled);
      }
    }
  });

  it('sizes the buffer to the hull', () => {
    const { profile, plated } = hull();
    expect(plated.buf.h).toBe(profile.length);
    expect(plated.buf.w).toBe(profile.maxHalfWidth * 2 + 1);
    expect(plated.centreX).toBe(profile.maxHalfWidth);
  });

  it('draws something', () => {
    expect(countOpaque(hull().plated.buf)).toBeGreaterThan(500);
  });
});

describe('plated hull colour', () => {
  it('uses only its ramp', () => {
    for (const faction of ['concord', 'player'] as const) {
      const { ramp, plated } = hull(faction);
      expect(checkPalette(plated.buf, ramp)).toEqual([]);
    }
  });

  it('uses at least three values — flat hulls are a generator failure', () => {
    const { plated } = hull();
    const used = new Set<number>();
    for (let y = 0; y < plated.buf.h; y++) {
      for (let x = 0; x < plated.buf.w; x++) {
        const c = getPx(plated.buf, x, y);
        if (isOpaque(c)) used.add(c);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it('passes the light-direction check', () => {
    // The whole point of the shading pass.
    for (const faction of ['concord', 'player'] as const) {
      for (const seed of ['a', 'b', 'c']) {
        const report = checkLightDirection(hull(faction, seed).plated.buf);
        expect(report).not.toBeNull();
        expect(report!.pass).toBe(true);
      }
    }
  });

  it('makes the top-left border brighter than the bottom-right border', () => {
    const { profile, plated } = hull();
    const y = Math.floor(profile.length / 2);
    // Each side's own extent — the player hull's two sides can differ, and
    // centreX - halfWidth (the wider side's reach) is not necessarily on the
    // hull for the narrower side.
    const left = getPx(plated.buf, plated.centreX - profile.leftWidth[y]!, y);
    const right = getPx(plated.buf, plated.centreX + profile.rightWidth[y]!, y);
    expect(luminance(left)).toBeGreaterThan(luminance(right));
  });
});

describe('plate seams', () => {
  it('divides the hull into plates', () => {
    const { plated } = hull();
    expect(plated.plateCount).toBeGreaterThanOrEqual(3);
    expect(plated.plateCount).toBeLessThanOrEqual(12);
  });

  it('draws seams as single-pixel dark rows', () => {
    const { profile, plated } = hull();
    // A seam row is darker on average than the rows on either side of it.
    const rowMean = (y: number) => {
      let sum = 0, n = 0;
      for (let x = 0; x < plated.buf.w; x++) {
        const c = getPx(plated.buf, x, y);
        if (isOpaque(c)) { sum += luminance(c); n++; }
      }
      return n === 0 ? 0 : sum / n;
    };

    let seamRows = 0;
    for (let y = 2; y < profile.length - 2; y++) {
      if (rowMean(y) < rowMean(y - 1) && rowMean(y) < rowMean(y + 1)) seamRows++;
    }
    expect(seamRows).toBeGreaterThanOrEqual(plated.plateCount - 1);
  });

  it('scales plate count with hull length', () => {
    const small = buildProfile({ faction: 'player', sizeClass: 'corvette', rng: makeRng('s') });
    const large = buildProfile({ faction: 'player', sizeClass: 'capital', rng: makeRng('s') });
    const a = plateHull({ profile: small, ramp: NEUTRAL, rng: makeRng('s') });
    const b = plateHull({ profile: large, ramp: NEUTRAL, rng: makeRng('s') });
    expect(b.plateCount).toBeGreaterThan(a.plateCount);
  });
});

describe('dither', () => {
  it('is a 4x4 ordered mask that tiles', () => {
    expect(ditherMask(0, 0)).toBe(ditherMask(4, 4));
    expect(ditherMask(1, 2)).toBe(ditherMask(9, 10));
  });

  it('turns on for about half the cells', () => {
    let on = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherMask(x, y)) on++;
    expect(on).toBe(8);
  });

  it('never clumps into 2x2 blocks', () => {
    // This is what the pattern actually has to avoid. A 50% ordered dither is
    // a checkerboard by construction — that is correct and near-invisible
    // between two adjacent ramp steps. What ruins hull plate is clumping:
    // fully-on 2x2 blocks read as woven texture rather than as shading.
    let blocks = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (ditherMask(x, y) && ditherMask(x + 1, y) &&
            ditherMask(x, y + 1) && ditherMask(x + 1, y + 1)) {
          blocks++;
        }
      }
    }
    expect(blocks).toBe(0);
  });

  it('never runs more than one cell horizontally', () => {
    for (let y = 0; y < 16; y++) {
      let run = 0;
      for (let x = 0; x < 32; x++) {
        run = ditherMask(x, y) ? run + 1 : 0;
        expect(run).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('determinism', () => {
  it('renders identically from the same seed', () => {
    expect(Array.from(hull('player', 'z').plated.buf.data))
      .toEqual(Array.from(hull('player', 'z').plated.buf.data));
  });

  it('renders differently from different seeds', () => {
    expect(Array.from(hull('player', 'z1').plated.buf.data))
      .not.toEqual(Array.from(hull('player', 'z2').plated.buf.data));
  });
});
