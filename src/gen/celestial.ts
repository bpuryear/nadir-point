/**
 * POI background stacks — depth without a third axis.
 *
 * The 3D build put the world in a volume. This one fakes the volume with
 * parallax layers, and has to do it well, because the sense of scale now lives
 * entirely here. Each POI is a palette lock plus a composition, and the bar it
 * has to clear is that a single screenshot with the HUD hidden tells you where
 * you are.
 *
 * Parallax runs 0 (infinitely far, never moves) to 1 (the play plane). The
 * optional foreground layer sits above 1: debris silhouettes drifting in front
 * of the action, faster than it, partially occluding it. Used sparingly — it is
 * seasoning, and a frame full of it is unreadable.
 */

import type { Rng } from '../sim/rng.js';
import {
  countOpaque, createBuf, luminance, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { POI_PALETTE, snapToPalette, type PoiId } from './palette.js';
import { ditherMask } from './grammar/plates.js';

export interface Layer {
  buf: PixBuf;
  /** 0 = infinitely far, 1 = the play plane, >1 = in front of it. */
  parallax: number;
  name: string;
}

export interface PoiStack {
  poi: PoiId;
  layers: readonly Layer[];
  foreground: Layer | null;
}

/** Stars per 1000 square pixels. Bounded so a starfield never becomes a texture. */
export const STAR_DENSITY = 6;

/** Picks the n brightest colours in a POI's lock — used for stars and highlights. */
function brightest(poi: PoiId, n: number): Rgba[] {
  const lum = (c: Rgba) =>
    0.299 * ((c >>> 24) & 255) + 0.587 * ((c >>> 16) & 255) + 0.114 * ((c >>> 8) & 255);
  return [...POI_PALETTE[poi]].sort((a, b) => lum(b) - lum(a)).slice(0, n);
}

/** Picks the n darkest colours — used for deep-space grounds and near debris. */
function darkest(poi: PoiId, n: number): Rgba[] {
  const lum = (c: Rgba) =>
    0.299 * ((c >>> 24) & 255) + 0.587 * ((c >>> 16) & 255) + 0.114 * ((c >>> 8) & 255);
  return [...POI_PALETTE[poi]].sort((a, b) => lum(a) - lum(b)).slice(0, n);
}

export function buildStarfield(w: number, h: number, poi: PoiId, rng: Rng): PixBuf {
  const buf = createBuf(w, h);
  const palette = brightest(poi, 3);
  const count = Math.round(((w * h) / 1000) * STAR_DENSITY);

  for (let i = 0; i < count; i++) {
    const x = rng.int(w);
    const y = rng.int(h);
    // Most stars are the dimmest of the three; a few are bright. A uniform
    // field reads as noise, a weighted one reads as distance.
    const c = rng.chance(0.15) ? palette[0]! : rng.chance(0.4) ? palette[1]! : palette[2]!;
    setPx(buf, x, y, c);
  }

  return buf;
}

interface NebulaBlob {
  cx: number;
  cy: number;
  r: number;
}

/**
 * A nebula is a wash, not a scatter.
 *
 * Three independently drawn blobs can come out small and barely overlapping, at
 * which point the density cutoff discards most of the frame — measured down to
 * 11% coverage in 1 draw in 14,000. Chasing that with a lower assertion just
 * records how hard anyone has looked; the geometry is what needs fixing.
 *
 * So the blob set is a candidate: draw it, measure, and grow the radii until the
 * wash actually covers the frame. Growth is monotonic, so this always
 * terminates, and the fallback at full growth is a nebula that covers almost
 * everything — which is a far better failure than a near-empty sky.
 */
const NEBULA_MIN_COVERAGE = 0.25;
const NEBULA_MAX_GROWTH_STEPS = 8;
const NEBULA_GROWTH = 1.25;

function renderNebula(
  w: number, h: number, poi: PoiId, palette: readonly Rgba[], blobs: readonly NebulaBlob[],
): PixBuf {
  const buf = createBuf(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let density = 0;
      for (const b of blobs) {
        const d = Math.hypot(x - b.cx, y - b.cy) / b.r;
        if (d < 1) density += (1 - d) * (1 - d);
      }
      if (density <= 0.05) continue;

      // Quantise to a band, then dither one step up on half the cells.
      const bandF = Math.min(0.999, density) * palette.length;
      let band = Math.floor(bandF);
      if (bandF - band > 0.5 && ditherMask(x, y)) band += 1;

      const c = palette[Math.min(palette.length - 1, band)]!;
      setPx(buf, x, y, snapToPalette(c, POI_PALETTE[poi]));
    }
  }

  return buf;
}

export function buildNebula(w: number, h: number, poi: PoiId, rng: Rng): PixBuf {
  const palette = darkest(poi, 4);

  // Three overlapping soft blobs, quantised into palette bands and dithered at
  // the boundaries. Ordered dither on a large gradient is what the post chain
  // expects; a smooth ramp would band uglily once the palette snapped it.
  //
  // Centres and base radii are drawn once, before the growth loop below —
  // redrawing them per attempt would consume unbounded randomness and break
  // the determinism every other system relies on.
  const baseBlobs: NebulaBlob[] = Array.from({ length: 3 }, () => ({
    cx: rng.range(0, w),
    cy: rng.range(0, h),
    r: rng.range(Math.min(w, h) * 0.3, Math.min(w, h) * 0.8),
  }));

  let buf = renderNebula(w, h, poi, palette, baseBlobs);

  for (let step = 1; step < NEBULA_MAX_GROWTH_STEPS; step++) {
    if (countOpaque(buf) / (w * h) >= NEBULA_MIN_COVERAGE) break;

    // Growth scales radii only; centres stay put so the composition thickens
    // instead of rearranging.
    const scale = NEBULA_GROWTH ** step;
    const grown = baseBlobs.map((b) => ({ ...b, r: b.r * scale }));
    buf = renderNebula(w, h, poi, palette, grown);
  }

  return buf;
}

export function buildGasGiant(diameter: number, poi: PoiId, rng: Rng): PixBuf {
  const buf = createBuf(diameter, diameter);
  const r = diameter / 2;
  // POI_PALETTE entries concatenate several ramps (SPACE, WARM, NEUTRAL, ...)
  // that are each individually dark-to-light but not jointly so — declaration
  // order jumps backward in luminance at every ramp boundary. Walking that
  // order with "+step" would make the terminator direction a coin flip
  // whenever a band's base colour lands near a seam. Sort by luminance first
  // so index arithmetic reliably means "brighter", matching the one global
  // light every other sprite in the game obeys.
  const palette = [...POI_PALETTE[poi]].sort((a, b) => luminance(a) - luminance(b));

  // Horizontal bands of varying height. Each band carries a small tint —
  // clamped to +-1 sorted-palette step of its neighbours — so bands read as
  // distinct stripes without ever outweighing the terminator below. A tint
  // free to roam the whole palette (as an independent per-band pick would)
  // could out-swing the terminator's own contribution, and then whichever
  // band two sample points happened to land in — not their position on the
  // sphere — would decide which one looked lit. That is what "one global
  // light, no exceptions" rules out.
  const bandCount = 5 + rng.int(5);
  const bandEdges: number[] = [];
  for (let i = 1; i < bandCount; i++) {
    bandEdges.push(Math.round(diameter * (i / bandCount) * rng.range(0.82, 1.18)));
  }
  const bandTint: number[] = [];
  let tint = 0;
  for (let i = 0; i < bandCount; i++) {
    bandTint.push(tint);
    tint = Math.max(-1, Math.min(1, tint + (rng.chance(0.5) ? 1 : -1)));
  }

  // The terminator sweeps most of the palette's range between the darkest
  // and brightest corner of the disc, which is what makes it the dominant
  // term against a +-1 band tint.
  const mid = (palette.length - 1) / 2;

  for (let y = 0; y < diameter; y++) {
    let band = 0;
    for (const edge of bandEdges) if (y >= edge) band++;

    for (let x = 0; x < diameter; x++) {
      const dx = x - r + 0.5;
      const dy = y - r + 0.5;
      if (dx * dx + dy * dy > r * r) continue;

      // Terminator: light from the top-left, same as every sprite in the game.
      const lit = Math.max(-1, Math.min(1, (-dx - dy) / (r * 1.6)));
      const target = mid + lit * mid + bandTint[band]!;

      let idx = Math.floor(target);
      if (target - idx > 0.5 && ditherMask(x, y)) idx += 1;
      idx = Math.max(0, Math.min(palette.length - 1, idx));

      setPx(buf, x, y, palette[idx]!);
    }
  }

  return buf;
}

/** Sparse silhouettes for the near-debris and foreground layers. */
function buildDebrisLayer(
  w: number, h: number, poi: PoiId, rng: Rng, count: number, maxSize: number,
): PixBuf {
  const buf = createBuf(w, h);
  const color = darkest(poi, 1)[0]!;

  for (let i = 0; i < count; i++) {
    const bw = 1 + rng.int(maxSize);
    const bh = 1 + rng.int(maxSize);
    const x0 = rng.int(w);
    const y0 = rng.int(h);
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        if (rng.chance(0.8)) setPx(buf, x, y, color);
      }
    }
  }

  return buf;
}

export function buildPoiStack(poi: PoiId, w: number, h: number, rng: Rng): PoiStack {
  const layers: Layer[] = [
    { buf: buildStarfield(w, h, poi, rng.split('stars')), parallax: 0.02, name: 'starfield' },
    { buf: buildNebula(w, h, poi, rng.split('nebula')), parallax: 0.10, name: 'nebula' },
  ];

  // The celestial layer: a gas giant where the POI has one, otherwise a
  // distant wreck field. Either way it is the thing that dwarfs everything.
  if (poi === 'gasgiant' || poi === 'star') {
    const diameter = Math.round(Math.min(w, h) * 1.4);
    layers.push({
      buf: buildGasGiant(diameter, poi, rng.split('celestial')),
      parallax: 0.18,
      name: poi === 'star' ? 'star' : 'gas-giant',
    });
  } else {
    layers.push({
      buf: buildDebrisLayer(w, h, poi, rng.split('far-wrecks'), 14, 5),
      parallax: 0.18,
      name: 'distant-wrecks',
    });
  }

  layers.push({
    buf: buildDebrisLayer(w, h, poi, rng.split('near-debris'), 26, 3),
    parallax: 0.45,
    name: 'near-debris',
  });

  // Foreground occlusion, used on the two densest POIs only. Seasoning.
  const foreground = poi === 'wreckreef' || poi === 'belt'
    ? {
        buf: buildDebrisLayer(w, h, poi, rng.split('foreground'), 5, 7),
        parallax: 1.6,
        name: 'foreground-debris',
      }
    : null;

  return { poi, layers, foreground };
}
