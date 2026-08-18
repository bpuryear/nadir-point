import { describe, expect, it } from 'vitest';
import type { Rng } from '../sim/rng.js';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, luminance } from './pixbuf.js';
import { POI_PALETTE, SPACE, type PoiId } from './palette.js';
import { checkBinaryAlpha, checkPalette } from './qc.js';
import {
  buildGasGiant, buildNebula, buildPoiStack, buildStarfield, STAR_DENSITY,
} from './celestial.js';

const ALL_POIS = Object.keys(POI_PALETTE) as PoiId[];

/** Luminance of the exact colour every POI frame is filled with. */
const VOID_LUMINANCE = luminance(SPACE[0]!);

/**
 * Forces every `range()` draw to its lower bound. For `buildNebula` that
 * means all three blobs land at the same corner with the smallest allowed
 * base radius — the least-covered, least-contrasted nebula the generator can
 * produce. Deterministic, so it exercises the true worst case on every run
 * instead of hoping a handful of random seeds stumbles into it: mutating
 * `NEBULA_MIN_COVERAGE` from 0.25 to 0.01 used to survive the whole suite,
 * because the coverage test sampled 40 seeds against a failure tail that
 * only fires on about 0.4% of random draws.
 */
function makeWorstCaseRng(): Rng {
  return {
    next: () => 0,
    int: () => 0,
    range: (lo: number) => lo,
    pick: (items) => items[0]!,
    chance: () => false,
    split: () => makeWorstCaseRng(),
  };
}

/** Mean luminance over a buffer's opaque pixels only, 0 if none are opaque. */
function meanPaintedLuminance(buf: ReturnType<typeof buildNebula>): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      if (!isOpaque(c)) continue;
      sum += luminance(c);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

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
  it('covers a large fraction of the frame, even in the worst-case geometry', () => {
    // Deterministic instead of sampled — see makeWorstCaseRng's comment for
    // why a stochastic sweep missed a real regression here before.
    for (const poi of ALL_POIS) {
      const neb = buildNebula(220, 130, poi, makeWorstCaseRng());
      const coverage = countOpaque(neb) / (220 * 130);
      expect(coverage, poi).toBeGreaterThanOrEqual(0.29);
    }
  });

  it('never paints a pixel at or below the void colour, even in the worst-case geometry', () => {
    // The actual defect this generator shipped with: darkest(poi, 4) could
    // return SPACE[0], the frame's own fill colour, as the nebula's lowest
    // band. Measured before the fix: 26-38% of a nebula's opaque pixels were
    // literally the same colour as empty space. The worst-case geometry
    // guarantees the lowest density band — the weakest link — is actually
    // exercised, so this is a hard guarantee rather than a statistical one.
    for (const poi of ALL_POIS) {
      const neb = buildNebula(220, 130, poi, makeWorstCaseRng());
      let minLum = Infinity;
      for (let y = 0; y < neb.h; y++) {
        for (let x = 0; x < neb.w; x++) {
          const c = getPx(neb, x, y);
          if (!isOpaque(c)) continue;
          minLum = Math.min(minLum, luminance(c));
        }
      }
      expect(minLum - VOID_LUMINANCE, poi).toBeGreaterThanOrEqual(10);
    }
  });

  it('paints with mean luminance well above the void, across every POI and many seeds', () => {
    // Coverage was the wrong proxy for "the nebula is visible" — a frame can
    // be 85% covered in a colour indistinguishable from the void. This is
    // the property that actually matters: swept across real (non-degenerate)
    // seeds, does the painted area read as brighter than empty space by a
    // real margin.
    let worst = Infinity;
    let worstAt = '';
    for (const poi of ALL_POIS) {
      for (let i = 0; i < 60; i++) {
        const neb = buildNebula(160, 100, poi, makeRng(`neb-${i}`));
        const contrast = meanPaintedLuminance(neb) - VOID_LUMINANCE;
        if (contrast < worst) {
          worst = contrast;
          worstAt = `${poi}/neb-${i}`;
        }
      }
    }
    expect(worst, `weakest contrast was ${worst.toFixed(1)} at ${worstAt}`).toBeGreaterThanOrEqual(13);
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

describe('debris layers', () => {
  const DEBRIS_LAYER_NAMES = new Set(['near-debris', 'distant-wrecks', 'foreground-debris']);

  /**
   * Counts 8-connected opaque blobs and how many of those blobs are a single
   * pixel with no opaque neighbour at all.
   *
   * Coverage was the wrong property to assert on here: a layer built from
   * real debris.ts sprites and a layer built from hundreds of tiny scattered
   * rectangles can paint the exact same fraction of the frame while looking
   * completely different — one reads as broken ships, the other as a second,
   * dimmer starfield. What actually separates "wreckage" from "noise" is
   * shape: a real debris sprite is one connected silhouette no matter how
   * large, while noise is many small disconnected flecks. Component count
   * and isolated-pixel fraction measure exactly that, independent of how
   * much of the frame ends up painted.
   */
  function shapeStats(buf: ReturnType<typeof buildPoiStack>['layers'][number]['buf']): {
    components: number;
    isolatedFraction: number;
  } {
    const seen = new Uint8Array(buf.w * buf.h);
    let components = 0;
    let opaque = 0;
    let isolated = 0;
    for (let y = 0; y < buf.h; y++) {
      for (let x = 0; x < buf.w; x++) {
        if (!isOpaque(getPx(buf, x, y))) continue;
        opaque++;
        const idx = y * buf.w + x;
        if (seen[idx]) continue;
        components++;
        let size = 0;
        const stack: [number, number][] = [[x, y]];
        seen[idx] = 1;
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          size++;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= buf.w || ny >= buf.h) continue;
              const nidx = ny * buf.w + nx;
              if (seen[nidx] || !isOpaque(getPx(buf, nx, ny))) continue;
              seen[nidx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
        if (size === 1) isolated++;
      }
    }
    return { components, isolatedFraction: opaque > 0 ? isolated / opaque : 0 };
  }

  it('reads as a scatter of distinct wreck shapes, not uniform speckle', () => {
    // Measured against the rectangle-scatter this replaced, on the same
    // 220x130 canvas swept across the same 25 seeds x 8 POIs: the old
    // implementation never produced fewer than 140 connected blobs in a
    // single near-debris or distant-wrecks layer (mean blob size 3.3-8.1px —
    // essentially a fleck field). This implementation, built from real
    // debris.ts sprites in hulk/chunk (distant) and chip/shard/chunk (near)
    // bands, tops out at 50 blobs across the same sweep, and isolated
    // (no-neighbour) pixels never exceeded 3.4% of a layer. The thresholds
    // below sit with a wide margin on the correct side of both.
    const w = 220, h = 130;
    let worstComponents = 0;
    let worstComponentsAt = '';
    let worstIsolated = 0;
    let worstIsolatedAt = '';
    for (const poi of ALL_POIS) {
      for (let i = 0; i < 25; i++) {
        const stack = buildPoiStack(poi, w, h, makeRng(`shape-${poi}-${i}`));
        for (const layer of stack.layers) {
          if (layer.name !== 'near-debris' && layer.name !== 'distant-wrecks') continue;
          const { components, isolatedFraction } = shapeStats(layer.buf);
          const at = `${poi}/${layer.name}/${i}`;
          expect(components, at).toBeLessThanOrEqual(70);
          expect(isolatedFraction, at).toBeLessThanOrEqual(0.15);
          if (components > worstComponents) { worstComponents = components; worstComponentsAt = at; }
          if (isolatedFraction > worstIsolated) { worstIsolated = isolatedFraction; worstIsolatedAt = at; }
        }
      }
    }
    expect(worstComponents, `most fragmented layer was ${worstComponentsAt}`).toBeLessThanOrEqual(70);
    expect(worstIsolated, `speckliest layer was ${worstIsolatedAt}`).toBeLessThanOrEqual(0.15);
  });

  it('paints debris well above the void, not at the palette floor', () => {
    // A silhouette painted exactly at BACKGROUND_LUMINANCE_FLOOR still clears
    // the void, but with only a handful of opaque pixels per blob it reads
    // thin. debrisColor() picks one step up from the darkest usable tone —
    // check that every debris layer actually uses it.
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 220, 130, makeRng(poi));
      const allLayers = [...stack.layers, ...(stack.foreground ? [stack.foreground] : [])];
      for (const layer of allLayers) {
        if (!DEBRIS_LAYER_NAMES.has(layer.name)) continue;
        let found = false;
        for (let y = 0; y < layer.buf.h; y++) {
          for (let x = 0; x < layer.buf.w; x++) {
            const c = getPx(layer.buf, x, y);
            if (!isOpaque(c)) continue;
            found = true;
            expect(luminance(c) - VOID_LUMINANCE, `${poi}/${layer.name}`).toBeGreaterThanOrEqual(10);
          }
        }
        expect(found, `${poi}/${layer.name}`).toBe(true);
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
