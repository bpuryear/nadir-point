import { describe, expect, it } from 'vitest';
import { createBuf, fromHex, getPx, isOpaque, setPx, type PixBuf } from '../gen/pixbuf.js';
import { bakeRotations, headingForBin } from '../gen/rotate.js';
import { vec2 } from '../sim/math/vec2.js';
import { pivotOffset, tierCorrection } from './lodpivot.js';

/**
 * A 3x3 marker block, not a single pixel: `bakeRotations` samples by inverse
 * mapping (walk destination pixels, sample the source), so an isolated
 * source pixel can fall through the cracks at some rotation angles and
 * vanish from the destination entirely. A block survives every angle, and
 * its centroid tracks the same physical point a single pixel would.
 */
function markedBuf(w: number, h: number, mx: number, my: number): PixBuf {
  const buf = createBuf(w, h);
  const white = fromHex('#ffffff');
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) setPx(buf, mx + dx, my + dy, white);
  }
  return buf;
}

function markerCentroid(buf: PixBuf): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (isOpaque(getPx(buf, x, y))) { sx += x; sy += y; n++; }
    }
  }
  if (n === 0) throw new Error('marker vanished — bad test fixture, not the code under test');
  return { x: sx / n, y: sy / n };
}

describe('tierCorrection', () => {
  it('realigns a differently-pivoted bake with the shared pivot, at every bin', () => {
    // Buffer A: the shared physical point sits exactly at A's own centre —
    // the convention tiers 0-2 share (bakeRotations always pivots a tier on
    // its own source buffer's centre).
    const w = 41, h = 41;
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const bufA = markedBuf(w, h, cx, cy);

    // Buffer B: same physical point, but displaced from B's own centre —
    // analogous to tier 3, whose own pivot (its centre) is the hull
    // centreline while the shared point (the composite's bbox centre) sits
    // elsewhere in its frame.
    const disp = vec2(6, -4);
    const bufB = markedBuf(w, h, cx + disp.x, cy + disp.y);

    // pivotOffset(compositeW, compositeH, centreX, centreY) computes
    // centreX - compositeW/2 — i.e. "B's own pivot minus the shared point",
    // expressed in the shared frame. Here the shared point sits at (cx,cy)
    // and B's own pivot sits at (cx - disp.x, cy - disp.y).
    const offset = pivotOffset(2 * cx, 2 * cy, cx - disp.x, cy - disp.y);
    expect(offset).toEqual({ x: -disp.x, y: -disp.y });

    const bins = 64;
    const binsA = bakeRotations(bufA, bins);
    const binsB = bakeRotations(bufB, bins);

    const corr = vec2();
    let maxResidual = 0;
    for (let bin = 0; bin < bins; bin++) {
      const angle = headingForBin(bin, bins);
      const markerA = markerCentroid(binsA[bin]!);
      const markerBRaw = markerCentroid(binsB[bin]!);
      tierCorrection(corr, offset, angle, 1);

      const residualX = markerBRaw.x + corr.x - markerA.x;
      const residualY = markerBRaw.y + corr.y - markerA.y;
      maxResidual = Math.max(maxResidual, Math.abs(residualX), Math.abs(residualY));
    }

    // Without correction the residual would track |disp| ≈ 7.2px at every
    // bin (worst case ~14px if the sign were flipped, since corr would then
    // point away instead of toward alignment). What is left after
    // correcting is only the bake's own nearest-neighbour rounding jitter.
    expect(maxResidual).toBeLessThanOrEqual(1);
  });

  it('is a no-op at zero offset, at any heading', () => {
    const out = vec2();
    tierCorrection(out, vec2(0, 0), 1.23, 4);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('scales down as unitsPerPixel grows, consistent with a fixed native-pixel offset', () => {
    const offset = vec2(32, 0);
    const out = vec2();
    tierCorrection(out, offset, 0, 1);
    expect(out.x).toBe(32);
    tierCorrection(out, offset, 0, 32);
    expect(out.x).toBe(1);
  });
});

describe('pivotOffset', () => {
  it('is zero when the composite bbox centre and the reported centreline coincide', () => {
    const offset = pivotOffset(48, 145, 24, 72.5);
    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it('matches the boot-time cruiser geometry (regression fixture from the review finding)', () => {
    // src/app/main.ts's seed-'wave2' player cruiser with bow: siege-lance,
    // dorsal: rail-battery, engine: thruster-uprate composites to a 48x145
    // buffer whose bbox centre (24, 72.5) sits 7px/9.5px away from the
    // reported hull centreline (31, 82) — the exact asymmetry this module
    // exists to correct for.
    const offset = pivotOffset(48, 145, 31, 82);
    expect(offset).toEqual({ x: 7, y: 9.5 });
  });
});
