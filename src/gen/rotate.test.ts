import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, createBuf, getPx, rgba, setPx } from './pixbuf.js';
import { buildHull } from './hull.js';
import {
  bakeRotations, bakeSize, binForHeading, headingForBin, ROTATION_BINS,
} from './rotate.js';

const RED = rgba(255, 0, 0);

/** A small asymmetric test sprite: an L, so rotation is unambiguous. */
function ell() {
  const b = createBuf(4, 4);
  for (let y = 0; y < 4; y++) setPx(b, 0, y, RED);
  setPx(b, 1, 3, RED);
  setPx(b, 2, 3, RED);
  return b;
}

describe('bin arithmetic', () => {
  it('bakes 64 bins by default', () => {
    expect(ROTATION_BINS).toBe(64);
  });

  it('maps heading 0 to bin 0', () => {
    expect(binForHeading(0)).toBe(0);
  });

  it('wraps a full revolution back to bin 0', () => {
    expect(binForHeading(Math.PI * 2)).toBe(0);
    expect(binForHeading(-Math.PI * 2)).toBe(0);
  });

  it('handles negative headings', () => {
    expect(binForHeading(-Math.PI / 2)).toBe(48); // three quarters round
  });

  it('always returns a bin in range', () => {
    for (let a = -20; a < 20; a += 0.13) {
      const bin = binForHeading(a);
      expect(bin).toBeGreaterThanOrEqual(0);
      expect(bin).toBeLessThan(ROTATION_BINS);
      expect(Number.isInteger(bin)).toBe(true);
    }
  });

  it('round-trips a bin through its heading', () => {
    for (let bin = 0; bin < ROTATION_BINS; bin++) {
      expect(binForHeading(headingForBin(bin))).toBe(bin);
    }
  });

  it('resolves to 5.625 degrees per bin', () => {
    expect((headingForBin(1) * 180) / Math.PI).toBeCloseTo(5.625, 5);
  });
});

describe('bake geometry', () => {
  it('produces one buffer per bin', () => {
    expect(bakeRotations(ell(), 8)).toHaveLength(8);
  });

  it('makes every bin the same square size', () => {
    const src = ell();
    const size = bakeSize(src);
    for (const bin of bakeRotations(src, 8)) {
      expect(bin.w).toBe(size);
      expect(bin.h).toBe(size);
    }
  });

  it('sizes the canvas to fit the diagonal, so nothing clips when rotated', () => {
    const src = createBuf(10, 30);
    expect(bakeSize(src)).toBeGreaterThanOrEqual(Math.ceil(Math.hypot(10, 30)));
  });

  it('uses an even side so the pivot is an exact centre', () => {
    expect(bakeSize(ell()) % 2).toBe(0);
    expect(bakeSize(createBuf(7, 13)) % 2).toBe(0);
  });
});

describe('bake fidelity', () => {
  it('reproduces the source exactly at bin 0', () => {
    const src = ell();
    const bin0 = bakeRotations(src, 8)[0]!;
    const size = bakeSize(src);
    const ox = Math.floor((size - src.w) / 2);
    const oy = Math.floor((size - src.h) / 2);

    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        expect(getPx(bin0, ox + x, oy + y), `${x},${y}`).toBe(getPx(src, x, y));
      }
    }
  });

  it('rotates a quarter turn exactly', () => {
    // A 90 degree bin must be a pure array rotation with no resampling loss.
    const src = ell();
    const bins = bakeRotations(src, 4);
    expect(countOpaque(bins[1]!)).toBe(countOpaque(bins[0]!));
    expect(countOpaque(bins[2]!)).toBe(countOpaque(bins[0]!));
    expect(countOpaque(bins[3]!)).toBe(countOpaque(bins[0]!));
  });

  it('actually rotates — bins differ from one another', () => {
    const bins = bakeRotations(ell(), 8);
    const keys = bins.map((b) => Array.from(b.data).join(','));
    expect(new Set(keys).size).toBe(8);
  });

  it('roughly conserves mass across every bin', () => {
    // Nearest-neighbour sampling gains and loses a little; a bin that lost half
    // the ship is a bug in the inverse mapping.
    const src = buildHull({ faction: 'player', sizeClass: 'destroyer', rng: makeRng('r') }).buf;
    const base = countOpaque(src);
    for (const bin of bakeRotations(src, 16)) {
      expect(countOpaque(bin)).toBeGreaterThan(base * 0.85);
      expect(countOpaque(bin)).toBeLessThan(base * 1.15);
    }
  });

  it('introduces no partial alpha — point sampling only', () => {
    const src = buildHull({ faction: 'concord', sizeClass: 'corvette', rng: makeRng('r') }).buf;
    for (const bin of bakeRotations(src, 16)) {
      for (let i = 3; i < bin.data.length; i += 4) {
        expect(bin.data[i] === 0 || bin.data[i] === 255).toBe(true);
      }
    }
  });

  it('introduces no new colours — the palette survives rotation', () => {
    const src = ell();
    for (const bin of bakeRotations(src, 16)) {
      for (let y = 0; y < bin.h; y++) {
        for (let x = 0; x < bin.w; x++) {
          const c = getPx(bin, x, y);
          expect(c === 0 || c === RED).toBe(true);
        }
      }
    }
  });

  it('rotates in a pinned direction, not merely some direction', () => {
    // countOpaque is direction-agnostic, so the quarter-turn test above passes
    // whichever way the bake turns. Negating the angle left the whole suite
    // green — a sign error would ship silently and every ship would rotate
    // backwards. Pin it against an independently computed 90-degree rotation.
    const src = ell();
    const bins = bakeRotations(src, 4);
    const size = bakeSize(src);
    const ox = Math.floor((size - src.w) / 2);
    const oy = Math.floor((size - src.h) / 2);

    // Read bin 1's content back into a source-sized grid, then compare against
    // both possible quarter turns of the source. Exactly one must match.
    const observed: number[] = [];
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) observed.push(getPx(bins[1]!, ox + x, oy + y));
    }

    // ell() is 4x4 (src.w === src.h), which makes this index arithmetic valid.
    // A non-square sprite would swap dimensions between the two rotations and
    // this comparison would need reworking.
    const cw: number[] = [];
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) cw.push(getPx(src, y, src.h - 1 - x));
    }

    const ccw: number[] = [];
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) ccw.push(getPx(src, src.w - 1 - y, x));
    }

    const matchesCw = observed.every((v, i) => v === cw[i]);
    const matchesCcw = observed.every((v, i) => v === ccw[i]);

    expect(matchesCw || matchesCcw, 'bin 1 of a 4-bin bake is not a clean quarter turn').toBe(true);
    // Pinned against the current, verified-correct implementation: bin 1 of a
    // 4-bin bake matches the clockwise quarter turn, not the counter-clockwise
    // one. Whichever it is, pin it — this is the assertion that catches a sign flip.
    const EXPECTED_CCW = false;
    expect(matchesCcw, 'rotation direction changed').toBe(EXPECTED_CCW);
  });
});

describe('determinism', () => {
  it('bakes identically twice', () => {
    const src = ell();
    const a = bakeRotations(src, 8);
    const b = bakeRotations(src, 8);
    for (let i = 0; i < 8; i++) {
      expect(Array.from(a[i]!.data)).toEqual(Array.from(b[i]!.data));
    }
  });
});
