import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, luminance } from './pixbuf.js';
import { POI_PALETTE, type PoiId } from './palette.js';
import { checkBinaryAlpha, checkPalette } from './qc.js';
import {
  buildGasGiant, buildNebula, buildPoiStack, buildStarfield, STAR_DENSITY,
} from './celestial.js';

const ALL_POIS = Object.keys(POI_PALETTE) as PoiId[];

describe('starfield', () => {
  it('places stars at a bounded density', () => {
    const w = 200, h = 100;
    const field = buildStarfield(w, h, 'deepfield', makeRng('s'));
    const expected = ((w * h) / 1000) * STAR_DENSITY;
    expect(countOpaque(field)).toBeGreaterThan(expected * 0.5);
    expect(countOpaque(field)).toBeLessThan(expected * 1.5);
  });

  it('never fills the sky — a starfield is mostly empty', () => {
    const field = buildStarfield(200, 100, 'deepfield', makeRng('s'));
    expect(countOpaque(field) / (200 * 100)).toBeLessThan(0.05);
  });

  it('stays on the POI palette', () => {
    for (const poi of ALL_POIS) {
      const field = buildStarfield(120, 80, poi, makeRng(poi));
      expect(checkPalette(field, POI_PALETTE[poi]), poi).toEqual([]);
    }
  });
});

describe('nebula', () => {
  it('covers a large fraction of the frame, across every POI', () => {
    // A nebula is a wash, not a scatter. The generator now grows its blobs
    // until the frame is actually covered, so this asserts the design floor
    // rather than the deepest point a sweep happened to reach — an earlier
    // version of this test asserted 0.2 and held only because it sampled one
    // seed; the real distribution reached 0.11.
    let worst = 1;
    let worstAt = '';
    for (const poi of ALL_POIS) {
      for (let i = 0; i < 40; i++) {
        const neb = buildNebula(160, 100, poi, makeRng(`neb-${i}`));
        const coverage = countOpaque(neb) / (160 * 100);
        if (coverage < worst) {
          worst = coverage;
          worstAt = `${poi}/neb-${i}`;
        }
      }
    }
    expect(worst, `thinnest nebula was ${worst.toFixed(3)} at ${worstAt}`).toBeGreaterThanOrEqual(0.24);
  });

  it('stays on the POI palette', () => {
    for (const poi of ALL_POIS) {
      const neb = buildNebula(100, 60, poi, makeRng(poi));
      expect(checkPalette(neb, POI_PALETTE[poi]), poi).toEqual([]);
      expect(checkBinaryAlpha(neb)).toEqual([]);
    }
  });

  it('uses several values so it reads as depth rather than a flat wash', () => {
    const neb = buildNebula(160, 100, 'wreckreef', makeRng('n'));
    const used = new Set<number>();
    for (let y = 0; y < neb.h; y++) {
      for (let x = 0; x < neb.w; x++) {
        const c = getPx(neb, x, y);
        if (isOpaque(c)) used.add(c);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
  });
});

describe('gas giant', () => {
  it('is round', () => {
    const giant = buildGasGiant(64, 'gasgiant', makeRng('g'));
    expect(giant.w).toBe(64);
    expect(giant.h).toBe(64);
    // Corners empty, centre filled.
    expect(isOpaque(getPx(giant, 0, 0))).toBe(false);
    expect(isOpaque(getPx(giant, 32, 32))).toBe(true);
  });

  it('is lit from the top-left like everything else', () => {
    const giant = buildGasGiant(64, 'gasgiant', makeRng('g'));
    expect(luminance(getPx(giant, 22, 22))).toBeGreaterThan(luminance(getPx(giant, 42, 42)));
  });

  it('is banded, not smooth', () => {
    const giant = buildGasGiant(64, 'gasgiant', makeRng('g'));
    let changes = 0;
    for (let y = 1; y < 64; y++) {
      if (getPx(giant, 32, y) !== getPx(giant, 32, y - 1)) changes++;
    }
    expect(changes).toBeGreaterThan(4);
  });

  it('stays on the POI palette', () => {
    const giant = buildGasGiant(48, 'gasgiant', makeRng('g'));
    expect(checkPalette(giant, POI_PALETTE.gasgiant)).toEqual([]);
  });
});

describe('POI stacks', () => {
  it('builds three to five parallax layers', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 160, 100, makeRng(poi));
      expect(stack.layers.length, poi).toBeGreaterThanOrEqual(3);
      expect(stack.layers.length, poi).toBeLessThanOrEqual(5);
    }
  });

  it('orders layers from far to near', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 160, 100, makeRng(poi));
      for (let i = 1; i < stack.layers.length; i++) {
        expect(stack.layers[i]!.parallax).toBeGreaterThan(stack.layers[i - 1]!.parallax);
      }
    }
  });

  it('keeps every layer behind the play plane', () => {
    for (const poi of ALL_POIS) {
      for (const layer of buildPoiStack(poi, 160, 100, makeRng(poi)).layers) {
        expect(layer.parallax).toBeGreaterThan(0);
        expect(layer.parallax).toBeLessThan(1);
      }
    }
  });

  it('puts the foreground layer in front of the play plane when present', () => {
    const stack = buildPoiStack('wreckreef', 160, 100, makeRng('f'));
    if (stack.foreground !== null) {
      expect(stack.foreground.parallax).toBeGreaterThan(1);
    }
  });

  it('locks every layer to the POI palette', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 120, 80, makeRng(poi));
      for (const layer of stack.layers) {
        expect(checkPalette(layer.buf, POI_PALETTE[poi]), `${poi}/${layer.name}`).toEqual([]);
      }
    }
  });

  it('makes every POI visually distinct from every other', () => {
    // The acceptance criterion: identifiable from a single screenshot.
    const keys = ALL_POIS.map((poi) => {
      const stack = buildPoiStack(poi, 100, 60, makeRng('shared'));
      const colors = new Set<number>();
      for (const layer of stack.layers) {
        for (let i = 0; i < layer.buf.data.length; i += 4) {
          if (layer.buf.data[i + 3] !== 0) {
            colors.add((layer.buf.data[i]! << 16) | (layer.buf.data[i + 1]! << 8) | layer.buf.data[i + 2]!);
          }
        }
      }
      return [...colors].sort((a, b) => a - b).join(',');
    });
    expect(new Set(keys).size).toBe(ALL_POIS.length);
  });

  it('names every layer', () => {
    for (const layer of buildPoiStack('gasgiant', 160, 100, makeRng('n')).layers) {
      expect(layer.name.length).toBeGreaterThan(2);
    }
  });

  it('draws something in every layer of every stack — a blank layer is not a layer', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 160, 100, makeRng(poi));
      for (const layer of stack.layers) {
        expect(countOpaque(layer.buf), `${poi}/${layer.name}`).toBeGreaterThan(0);
      }
      if (stack.foreground !== null) {
        expect(countOpaque(stack.foreground.buf), `${poi}/${stack.foreground.name}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('determinism', () => {
  it('rebuilds identically from the same seed', () => {
    const a = buildPoiStack('belt', 100, 60, makeRng('z'));
    const b = buildPoiStack('belt', 100, 60, makeRng('z'));
    for (let i = 0; i < a.layers.length; i++) {
      expect(Array.from(a.layers[i]!.buf.data)).toEqual(Array.from(b.layers[i]!.buf.data));
    }
  });
});
