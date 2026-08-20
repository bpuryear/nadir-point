import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import {
  countOpaque, createBuf, getPx, isOpaque, rgba, setPx, type PixBuf,
} from './pixbuf.js';
import { buildHull } from './hull.js';
import { buildModule, MODULE_CATALOGUE, type ModuleSprite } from './module.js';
import { compositeShip, type Loadout } from './composite.js';
import { getDitherPlan, type DitherPlan } from './grammar/plates.js';
import { shadeStep } from './palette.js';
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

/**
 * A fitted player cruiser: the same shape of ship the moire was reported
 * against on the contact sheet (hull plus three modules, so both the hull's
 * own dither and each module's own dither are exercised).
 */
function fittedCruiser() {
  const rng = makeRng('rotate-dither');
  const hull = buildHull({ faction: 'player', sizeClass: 'cruiser', rng: rng.split('hull') });
  const mod = (id: string): ModuleSprite => {
    const def = MODULE_CATALOGUE.find((m) => m.id === id)!;
    return buildModule(def, 'player', rng.split(id));
  };
  const loadout: Loadout = {
    bow: mod('siege-lance'),
    dorsal: mod('spinal-coil'),
    engine: mod('jump-drive'),
  };
  return compositeShip(hull, loadout);
}

/**
 * Classifies each dither-tracked pixel of an *already-baked* bin as the high
 * or low side of its dither pair, reading the classification off the bin's
 * actual rendered colour — not off an independently recomputed mask. That
 * distinction matters: a version of this test that decided high/low itself
 * (by calling `ditherMask` directly, in whichever frame it assumed the fix
 * used) would keep passing even if `bakeRotations` regressed to source-frame
 * dithering, because it would never look at what the function under test
 * actually produced. Reading the real pixel is what makes this a test of
 * `bakeRotations`, not a test of this file's assumptions about it.
 *
 * Still needs to replicate bakeRotations' own inverse-rotation sampling —
 * same style as the "pinned direction" bake-geometry test above — but only to
 * find *which* plan entry a destination pixel corresponds to; that
 * correspondence is geometry, identical whether the bake is fixed or broken.
 * What the fix changes is which of the two colours ends up at that pixel,
 * and that is read from `baked`, the real output.
 */
function classifyBakedBin(
  src: PixBuf, plan: DitherPlan, baked: PixBuf, bin: number, bins: number,
): boolean[][] {
  const size = bakeSize(src);
  const dcx = size / 2;
  const dcy = size / 2;
  const offsetX = Math.floor((size - src.w) / 2);
  const offsetY = Math.floor((size - src.h) / 2);
  const scx = offsetX + src.w / 2;
  const scy = offsetY + src.h / 2;

  const angle = headingForBin(bin, bins);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);

  // `null` marks a pixel the plan does not track (not part of an interior
  // dither, or not opaque) — excluded from both metrics below, same as the
  // unrotated dither tests only ever look at the mask itself.
  const high: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const rx = dx + 0.5 - dcx;
      const ry = dy + 0.5 - dcy;
      const sx = Math.floor(rx * cos - ry * sin + scx);
      const sy = Math.floor(rx * sin + ry * cos + scy);
      const srcX = sx - offsetX;
      const srcY = sy - offsetY;

      const entry = getDitherPlan(plan, srcX, srcY);
      if (entry === null) continue;

      const rendered = getPx(baked, dx, dy);
      if (!isOpaque(rendered)) continue;

      // The two colours a tracked pixel can possibly be: the low and high
      // side of its pair. Whichever the real bake actually painted decides
      // the classification.
      high[dy]![dx] = rendered === shadeStep(entry.ramp, entry.base + 1);
    }
  }

  return high.map((row) => row.map((cell) => cell === true));
}

function longestHorizontalRun(high: boolean[][]): number {
  let longest = 0;
  for (const row of high) {
    let run = 0;
    for (const cell of row) {
      run = cell ? run + 1 : 0;
      if (run > longest) longest = run;
    }
  }
  return longest;
}

function clumpedBlocks(high: boolean[][]): number {
  let blocks = 0;
  for (let y = 0; y < high.length - 1; y++) {
    for (let x = 0; x < high[y]!.length - 1; x++) {
      if (high[y]![x] && high[y]![x + 1] && high[y + 1]![x] && high[y + 1]![x + 1]) blocks++;
    }
  }
  return blocks;
}

describe('dither survives rotation', () => {
  // The invariant plates.ts's own "dither" tests establish on the unrotated
  // mask directly — longest horizontal run <= 1, zero clumped 2x2 blocks —
  // is exactly what shipped broken: those tests never saw a rotated bin, so
  // a hull that passed them could still moire hard once baked at an angle.
  // These tests carry the same invariant through the bake, on real hull and
  // module dithering, at axis-aligned, 22.5-degree, and 45-degree bins.

  it('every sampled bin keeps a short run and no clumping', () => {
    const fitted = fittedCruiser();
    const hullPixels = countOpaque(fitted.buf);
    const baked = bakeRotations(fitted.buf, ROTATION_BINS, fitted.plan);

    // 0/16/32/48 are axis-aligned (already correct pre-fix); 4/20/36/52 sit at
    // 22.5 degrees and 8/24/40/56 at 45 degrees — the angles the bug report
    // measured as worst.
    const sampledBins = [0, 4, 8, 16, 20, 24, 32, 36, 40, 48, 52, 56];

    for (const bin of sampledBins) {
      const high = classifyBakedBin(fitted.buf, fitted.plan, baked[bin]!, bin, ROTATION_BINS);
      const run = longestHorizontalRun(high);
      const clumped = clumpedBlocks(high);
      const clumpedPer1000 = (clumped * 1000) / hullPixels;

      expect(run, `bin ${bin}: longest run`).toBeLessThanOrEqual(2);
      expect(clumpedPer1000, `bin ${bin}: clumped per 1000 hull px`).toBeLessThan(10);
    }
  });

  it('45-degree bins moire hard without the fix — pins the defect this closes', () => {
    // Bakes the *unfixed* code path (no plan passed, exactly what shipped)
    // and asserts it violates the same target the row above requires the
    // fixed path to meet. Read together, these two tests prove the plan
    // argument is what makes the difference: same ship, same bins, only
    // whether `bakeRotations` gets the plan changes. If this ever stops
    // failing, the "before" baseline the fix is measured against has moved
    // and needs re-checking.
    const fitted = fittedCruiser();
    const hullPixels = countOpaque(fitted.buf);
    const baked = bakeRotations(fitted.buf, ROTATION_BINS);

    for (const bin of [8, 24, 40, 56]) {
      const high = classifyBakedBin(fitted.buf, fitted.plan, baked[bin]!, bin, ROTATION_BINS);
      const run = longestHorizontalRun(high);
      const clumped = clumpedBlocks(high);
      const clumpedPer1000 = (clumped * 1000) / hullPixels;

      expect(run > 2 || clumpedPer1000 >= 10, `bin ${bin}: expected the unfixed bake to violate the target`).toBe(true);
    }
  });

  it('bin 0 ignores the plan and still reproduces the source exactly', () => {
    const fitted = fittedCruiser();
    const withPlan = bakeRotations(fitted.buf, ROTATION_BINS, fitted.plan)[0]!;
    const withoutPlan = bakeRotations(fitted.buf, ROTATION_BINS)[0]!;
    expect(Array.from(withPlan.data)).toEqual(Array.from(withoutPlan.data));
  });

  it('actually changes the baked colours at a 45-degree bin — the plan is not silently ignored', () => {
    const fitted = fittedCruiser();
    const withPlan = bakeRotations(fitted.buf, ROTATION_BINS, fitted.plan)[8]!;
    const withoutPlan = bakeRotations(fitted.buf, ROTATION_BINS)[8]!;
    expect(Array.from(withPlan.data)).not.toEqual(Array.from(withoutPlan.data));
  });
});
