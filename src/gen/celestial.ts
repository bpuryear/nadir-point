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
  blit, countOpaque, createBuf, getPx, isOpaque, luminance, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import {
  POI_PALETTE, rampOf, SPACE, snapToPalette, type FactionId, type PoiId,
} from './palette.js';
import { ditherMask } from './grammar/plates.js';
import { buildDebris, type DebrisSize } from './debris.js';

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

/**
 * Luminance of SPACE[0] — the exact colour every POI frame is filled with
 * before any layer is drawn (see tools/contactsheet.ts's `fillBuf(buf,
 * SPACE[0])`). A background pixel painted at or below this value is not dim,
 * it is invisible: identical to "nothing was drawn here."
 */
const VOID_LUMINANCE = luminance(SPACE[0]!);

/**
 * How far above the void a background tone must sit to read as present
 * rather than merge into the frame fill. This is the number both
 * `darkest()`'s palette floor and the nebula's contrast floor (see
 * `buildNebula`) are built to satisfy — coverage was the wrong proxy for
 * either: a background layer can be 85% painted and still be 0% visible if
 * the paint is the same colour as the void. Picked so the resulting floor
 * (~15) lands at the bottom of the project's documented background band
 * (roughly 15-45; hulls run 40-140, running lights 80-200).
 */
const BACKGROUND_CONTRAST_MARGIN = 10;

/** The darkest a background colour may be and still count as usable. */
const BACKGROUND_LUMINANCE_FLOOR = VOID_LUMINANCE + BACKGROUND_CONTRAST_MARGIN;

/** Picks the n brightest colours in a POI's lock — used for stars and highlights. */
function brightest(poi: PoiId, n: number): Rgba[] {
  return [...POI_PALETTE[poi]].sort((a, b) => luminance(b) - luminance(a)).slice(0, n);
}

/**
 * Picks the n darkest *usable* colours — used for deep-space grounds and
 * debris. "Usable" excludes anything at or below BACKGROUND_LUMINANCE_FLOOR:
 * for 5 of 8 POIs the literal darkest entry in the lock is SPACE[0], the
 * void colour itself, and picking it here painted background layers in the
 * exact colour they sit on top of — measured at 26-38% of a nebula's pixels
 * being indistinguishable from empty space. Every POI lock has entries above
 * the floor (checked against all 8), so the fallback below only guards a
 * hypothetical future lock that doesn't.
 */
function darkest(poi: PoiId, n: number): Rgba[] {
  const usable = POI_PALETTE[poi].filter((c) => luminance(c) > BACKGROUND_LUMINANCE_FLOOR);
  const pool = usable.length > 0 ? usable : POI_PALETTE[poi];
  return [...pool].sort((a, b) => luminance(a) - luminance(b)).slice(0, n);
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
 * So the blob set is a candidate: draw it, measure, and grow the radii until
 * the wash actually reads as a nebula. Growth is monotonic, so this always
 * terminates, and the fallback at full growth is a nebula that covers almost
 * everything — which is a far better failure than a near-empty sky.
 *
 * "Reads as a nebula" used to mean coverage alone: grow until 25% of the
 * frame is opaque. That is the wrong proxy — coverage says nothing about
 * whether the paint can be told apart from the void it sits on. Measured
 * against the un-floored palette, gasgiant's nebula hit 85% coverage while
 * 38% of its pixels were SPACE[0], the exact background fill: fully "covered"
 * and largely invisible at once. `darkest()` now keeps SPACE[0] (and anything
 * as dark) out of the palette entirely, so this loop's real job is contrast:
 * keep growing until the *mean luminance of the painted pixels* clears the
 * void by BACKGROUND_CONTRAST_MARGIN. Coverage is kept as a secondary floor —
 * a nebula should still be a wash, not a fleck — but contrast is what the
 * loop is judged on.
 */
const NEBULA_MIN_COVERAGE = 0.25;
const NEBULA_MAX_GROWTH_STEPS = 8;
const NEBULA_GROWTH = 1.25;

/** Mean Rec. 601 luminance over a buffer's opaque pixels only. 0 if none. */
function meanPaintedLuminance(buf: PixBuf): number {
  let sum = 0;
  let count = 0;
  const { data } = buf;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** True once a nebula draw clears both the coverage and contrast floors. */
function nebulaMeetsFloor(buf: PixBuf, w: number, h: number): boolean {
  if (countOpaque(buf) / (w * h) < NEBULA_MIN_COVERAGE) return false;
  return meanPaintedLuminance(buf) - VOID_LUMINANCE >= BACKGROUND_CONTRAST_MARGIN;
}

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
    if (nebulaMeetsFloor(buf, w, h)) break;

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

/**
 * Ceiling on a background layer's luminance: the documented top of the
 * background band (see BACKGROUND_LUMINANCE_FLOOR's comment — the band runs
 * roughly 15-45, hulls start around 40). Debris is shaded plate cut from a
 * faction ramp, which reaches well past hull brightness at its lit end
 * (WARM alone tops out at 178), so recolouring has to clamp it back down —
 * without a ceiling, a "distant" wreck could paint as bright as the ship
 * flying past it.
 */
const BACKGROUND_LUMINANCE_CEILING = 45;

/**
 * A small dark-to-light ramp of background-safe tones for recolouring
 * debris: the `n` darkest colours in the POI's lock that clear
 * BACKGROUND_LUMINANCE_FLOOR and stay under BACKGROUND_LUMINANCE_CEILING.
 * Distant layers ask for fewer entries than near ones — a shorter, darker
 * ramp is the distance-based darkening pass: it reads as farther away
 * because there is less room in it to be bright.
 *
 * If nothing in the lock clears the ceiling — star's lock is deliberately
 * harsh, see POI_PALETTE — falls back to the single darkest usable colour,
 * which `darkest()` guarantees exists for every POI. A flat silhouette with
 * no shading headroom still stays dimmer than a hull, which a shaded one
 * that ignored the ceiling would not.
 */
function backgroundPalette(poi: PoiId, n: number): Rgba[] {
  const usable = darkest(poi, POI_PALETTE[poi].length)
    .filter((c) => luminance(c) <= BACKGROUND_LUMINANCE_CEILING);
  return usable.length > 0 ? usable.slice(0, n) : darkest(poi, 1);
}

/**
 * Remaps a debris sprite's own faction-ramp shading into a POI-locked
 * background sub-palette. Every entry in `subPalette` is already
 * floor-and-ceiling bounded (see backgroundPalette), so whatever this picks
 * is guaranteed on-lock and dim enough to read as background — the job here
 * is only to decide *which* of those safe tones each pixel gets, preserving
 * the piece's own lit/shadow gradient (what makes a torn plate read as a
 * plate) instead of flattening it to one flat silhouette colour.
 */
function recolorForBackground(
  buf: PixBuf, ramp: readonly Rgba[], subPalette: readonly Rgba[],
): PixBuf {
  const out = createBuf(buf.w, buf.h);
  const rampLum = ramp.map((c) => luminance(c));
  const rampMin = Math.min(...rampLum);
  const rampMax = Math.max(...rampLum);
  const span = Math.max(1, rampMax - rampMin);

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      if (!isOpaque(c)) continue;
      const t = Math.max(0, Math.min(1, (luminance(c) - rampMin) / span));
      const idx = Math.round(t * (subPalette.length - 1));
      setPx(out, x, y, subPalette[idx]!);
    }
  }
  return out;
}

/**
 * Which faction's wreckage a POI's debris is drawn from — narrative flavour
 * ("a graveyard of derelict hulks", "a Concord staging yard") more than a
 * strict colour requirement, since recolorForBackground remaps every pixel
 * into the POI's own locked tones regardless of which ramp built the shape.
 * Picked toward whichever ramp the POI's own lock already leans on, so a
 * piece still looks plausible if anyone inspects it before recolouring.
 */
const DEBRIS_FACTION: Readonly<Record<PoiId, FactionId>> = Object.freeze({
  gasgiant: 'derelict',
  belt: 'derelict',
  station: 'player',
  graveyard: 'derelict',
  yard: 'concord',
  star: 'derelict',
  deepfield: 'player',
  wreckreef: 'derelict',
});

/** Weighted pools: a duplicated entry is picked more often. */
const DISTANT_WRECK_SIZES: readonly DebrisSize[] = ['hulk', 'hulk', 'chunk'];
const NEAR_DEBRIS_SIZES: readonly DebrisSize[] = ['chip', 'chip', 'shard', 'shard', 'shard', 'chunk'];

/** Shading-ramp lengths for the two debris bands — see backgroundPalette. */
const DISTANT_WRECK_SHADES = 3;
const NEAR_DEBRIS_SHADES = 4;

/**
 * Debris-sprite counts per 10,000 square pixels. Distant wrecks are sparse —
 * the remains of a battle, not a crowd — near debris denser, matching the
 * "sparse large silhouettes far / smaller more numerous pieces near" split
 * the spec describes. Tuned so the contact sheet's 220x130 POI canvas
 * (28,600px^2) gets ~5 distant wrecks and ~16 near pieces: enough for the
 * layer to read as wreckage while keeping buildDebris's own retry loop
 * cheap. See celestial.test.ts's "debris layers" describe block for
 * measured build cost.
 */
const DISTANT_WRECK_DENSITY = 1.8;
const NEAR_DEBRIS_SPRITE_DENSITY = 5.5;

/**
 * Scatters real wreckage sprites (see debris.ts) across the frame, recoloured
 * into the POI's own dim background band. Replaces an earlier version that
 * scattered filled rectangles — present on screen, but shapeless: at layer
 * resolution a random rect and a random star speckle read the same. A POI
 * named "graveyard" needs its distant-wrecks layer to look like broken
 * ships, not like a second, dimmer starfield.
 */
function buildDebrisLayer(
  w: number, h: number, poi: PoiId, rng: Rng,
  sizes: readonly DebrisSize[], count: number, shades: number,
): PixBuf {
  const buf = createBuf(w, h);
  const faction = DEBRIS_FACTION[poi];
  const ramp = rampOf(faction);
  const subPalette = backgroundPalette(poi, shades);

  for (let i = 0; i < count; i++) {
    const size = rng.pick(sizes);
    const piece = buildDebris(size, faction, rng.split(`piece-${i}`));
    const recoloured = recolorForBackground(piece.buf, ramp, subPalette);

    // Roll the centre, not the corner, so a piece can drift off any edge —
    // matches the old scatter's coverage instead of clustering pieces away
    // from the border.
    const x = rng.int(w) - Math.floor(recoloured.w / 2);
    const y = rng.int(h) - Math.floor(recoloured.h / 2);
    blit(buf, recoloured, x, y);
  }

  return buf;
}

export function buildPoiStack(poi: PoiId, w: number, h: number, rng: Rng): PoiStack {
  const layers: Layer[] = [
    { buf: buildStarfield(w, h, poi, rng.split('stars')), parallax: 0.02, name: 'starfield' },
    { buf: buildNebula(w, h, poi, rng.split('nebula')), parallax: 0.10, name: 'nebula' },
  ];

  // Debris-sprite counts are derived from frame area — see
  // DISTANT_WRECK_DENSITY / NEAR_DEBRIS_SPRITE_DENSITY.
  const area = w * h;
  const distantWreckCount = Math.max(2, Math.round((area / 10000) * DISTANT_WRECK_DENSITY));
  const nearDebrisCount = Math.max(4, Math.round((area / 10000) * NEAR_DEBRIS_SPRITE_DENSITY));

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
      buf: buildDebrisLayer(
        w, h, poi, rng.split('far-wrecks'), DISTANT_WRECK_SIZES, distantWreckCount, DISTANT_WRECK_SHADES,
      ),
      parallax: 0.18,
      name: 'distant-wrecks',
    });
  }

  layers.push({
    buf: buildDebrisLayer(
      w, h, poi, rng.split('near-debris'), NEAR_DEBRIS_SIZES, nearDebrisCount, NEAR_DEBRIS_SHADES,
    ),
    parallax: 0.45,
    name: 'near-debris',
  });

  // Foreground occlusion, used on the two densest POIs only. Seasoning.
  const foreground = poi === 'wreckreef' || poi === 'belt'
    ? {
        buf: buildDebrisLayer(w, h, poi, rng.split('foreground'), NEAR_DEBRIS_SIZES, 5, NEAR_DEBRIS_SHADES),
        parallax: 1.6,
        name: 'foreground-debris',
      }
    : null;

  return { poi, layers, foreground };
}
