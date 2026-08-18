/**
 * Wreckage in four size bands.
 *
 * Debris has to read as pieces of ships, not as rocks — it is what a battle
 * leaves behind and what the player cuts apart, so it carries the same plating
 * language and the same faction palette as the hull it came off. The difference
 * is that it is torn: an irregular blob with a jagged edge, never a filled
 * rectangle, because a filled rectangle reads as cargo.
 */

import type { Rng } from '../sim/rng.js';
import {
  countOpaque, createBuf, crop, EMPTY, opaqueBounds, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { FACTION_PALETTE, rampOf, shadeStep, type FactionId } from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import { ditherMask } from './grammar/plates.js';

export type DebrisSize = 'chip' | 'shard' | 'chunk' | 'hulk';

export const DEBRIS_SIZES: readonly DebrisSize[] = ['chip', 'shard', 'chunk', 'hulk'];

/** Longest-axis extent per band, in pixels at LOD tier 1. */
export const DEBRIS_EXTENT: Readonly<Record<DebrisSize, [number, number]>> = {
  chip: [2, 4],
  shard: [4, 8],
  chunk: [8, 16],
  hulk: [16, 28],
};

export interface DebrisSprite {
  buf: PixBuf;
  size: DebrisSize;
  faction: FactionId;
}

/** Below this fraction of its own bounding box, a "torn" piece reads as scattered noise. */
const MIN_FILL = 0.35;

/** Above this fraction, a piece reads as a filled rectangle — cargo, not wreckage. */
const MAX_FILL = 0.92;

/**
 * Debris must read as torn plate: irregular enough not to look like cargo,
 * intact enough not to look like confetti, and still lit consistently enough to
 * pass QC. A single tear draw satisfies all three most of the time and none of
 * them reliably — one seed in a hundred produced a 98%-filled slab, another a
 * 17%-filled scatter, and roughly one in a thousand eroded the lit edges enough
 * that the piece failed its own light check and threw.
 *
 * So the tear is a candidate, not a result. Retry with a fresh draw until it
 * lands inside the band, easing the intensity as attempts run out so the loop
 * always terminates on something valid.
 */
const MAX_TEAR_ATTEMPTS = 12;

function paintSlab(work: PixBuf, w: number, h: number, ramp: readonly Rgba[], weathering: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lit = x === 0 || y === 0;
      const shadow = x === w - 1 || y === h - 1;
      let step = 3 + weathering;
      if (lit && !shadow) step += 2;
      else if (shadow && !lit) step -= 2;
      else if (ditherMask(x, y)) step += 1;
      setPx(work, x, y, shadeStep(ramp, step));
    }
  }
}

function tearSlab(
  work: PixBuf,
  w: number,
  h: number,
  rng: Rng,
  bites: number,
  isAnchor: (x: number, y: number) => boolean,
): void {
  for (let i = 0; i < bites; i++) {
    const bw = 1 + rng.int(Math.max(1, Math.floor(w / 2)));
    const bh = 1 + rng.int(Math.max(1, Math.floor(h / 2)));
    // Anchor bites to an edge, so they read as breaks rather than as holes.
    const fromLeft = rng.chance(0.5);
    const fromTop = rng.chance(0.5);
    const bx = fromLeft ? 0 : w - bw;
    const by = fromTop ? 0 : h - bh;

    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        // Ragged rather than square: skip some pixels of the bite.
        const clear = rng.chance(0.8);
        if (clear && !isAnchor(x, y)) setPx(work, x, y, EMPTY);
      }
    }
  }
}

export function buildDebris(size: DebrisSize, faction: FactionId, rng: Rng): DebrisSprite {
  const [lo, hi] = DEBRIS_EXTENT[size];
  const extent = lo + rng.int(hi - lo + 1);
  // Wreckage is rarely square; the short axis runs 55-100% of the long one.
  const shortAxis = Math.max(2, Math.round(extent * rng.range(0.55, 1)));
  const horizontal = rng.chance(0.5);

  const w = horizontal ? extent : shortAxis;
  const h = horizontal ? shortAxis : extent;
  const ramp = rampOf(faction);

  // Every piece weathers a little differently — sun-bleached, scorched, or
  // freshly cut — so the whole plate sits a ramp step darker or lighter
  // before lit/shadow edges are applied on top. Shading otherwise depends
  // only on position, so two pieces torn into the same silhouette (a 2x2
  // chip has almost no room to vary) would paint identically; this keeps
  // same-shaped pieces distinguishable without changing the shape grammar.
  // Fixed once per piece — every tear attempt below repaints the same
  // weathered slab, so retries vary only in how the plate breaks.
  const weathering = rng.int(3) - 1; // -1, 0, or +1

  // Tear the corners and edges. Bounded bites so the piece survives.
  //
  // Two anchor pixels, at the two extreme ends of the long axis's midline,
  // are immune to tearing — like a keel surviving at bow and stern even when
  // the plate between them is stripped. Without this, a small band (a 2x2
  // chip is only four pixels) can have every pixel on the long axis chipped
  // away from both ends at once, and the cropped result collapses below the
  // size band's own minimum extent. Because opaqueBounds only needs one
  // min-coordinate pixel and one max-coordinate pixel to fix a span, two
  // surviving pixels are enough to guarantee the final crop's long axis is
  // always exactly `extent`, which is constructed to already sit inside
  // [lo, hi] — and two pixels out of a whole plate cost the piece almost
  // nothing in raggedness. This holds on every attempt, so the retry loop
  // below never has to re-check the band.
  const midline = horizontal ? Math.floor(h / 2) : Math.floor(w / 2);
  const isAnchor = (x: number, y: number): boolean =>
    horizontal
      ? y === midline && (x === 0 || x === w - 1)
      : x === midline && (y === 0 || y === h - 1);

  // A crop as small as chip/shard's own minimum extent (a 2x2 or 2x3 box) has
  // no tear pattern that can land inside [MIN_FILL, MAX_FILL] — losing even one
  // pixel of a four-pixel box swings the ratio by 25 points. The fill band only
  // means something once a piece has an interior worth tearing into.
  const boundFill = size === 'chunk' || size === 'hulk';

  for (let attempt = 0; attempt < MAX_TEAR_ATTEMPTS; attempt++) {
    const work = createBuf(w, h);
    paintSlab(work, w, h, ramp, weathering);

    // Ease off as attempts run out: fewer, smaller bites tear less, which
    // trends toward a higher fill (clearing the MIN_FILL floor) and toward
    // edges that keep the light-direction margin intact (clearing QC). That
    // guarantees the loop converges — it never has to trend toward MAX_FILL,
    // because a fresh independent draw on the very next attempt is already
    // very likely to clear that ceiling on its own.
    const biteFloor = Math.max(1, 4 - Math.floor(attempt / 3));
    const bites = biteFloor + rng.int(4);
    tearSlab(work, w, h, rng, bites, isAnchor);

    // Guarantee the piece still exists after tearing.
    if (opaqueBounds(work) === null) {
      setPx(work, Math.floor(w / 2), Math.floor(h / 2), shadeStep(ramp, 3 + weathering));
    }

    // Crop to the tight bounds so debris has no dead margin — pooled sprites
    // are placed by their bounding box and a transparent border would offset
    // them.
    const b = opaqueBounds(work)!;
    const buf = crop(work, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);

    const fill = countOpaque(buf) / (buf.w * buf.h);
    if (boundFill && (fill < MIN_FILL || fill > MAX_FILL)) continue;

    const report = qcSprite(`debris:${size}:${faction}`, buf, FACTION_PALETTE[faction]);
    if (report.pass) return { buf, size, faction };
  }

  // Every attempt missed the fill band or failed QC. Fall back to a
  // minimally-torn piece — one or two bites keep the shading close to the
  // pristine, cleanly-lit slab, so assertQc will pass. A mildly boxy piece
  // beats a thrown exception.
  const work = createBuf(w, h);
  paintSlab(work, w, h, ramp, weathering);
  tearSlab(work, w, h, rng, 1 + rng.int(2), isAnchor);
  if (opaqueBounds(work) === null) {
    setPx(work, Math.floor(w / 2), Math.floor(h / 2), shadeStep(ramp, 3 + weathering));
  }
  const b = opaqueBounds(work)!;
  const buf = crop(work, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
  assertQc(qcSprite(`debris:${size}:${faction}`, buf, FACTION_PALETTE[faction]));
  return { buf, size, faction };
}

export function buildDebrisSet(
  faction: FactionId,
  rng: Rng,
  perSize = 4,
): DebrisSprite[] {
  const set: DebrisSprite[] = [];
  for (const size of DEBRIS_SIZES) {
    // A child stream per size so changing the count of one band cannot reshuffle
    // the others.
    const stream = rng.split(size);
    for (let i = 0; i < perSize; i++) {
      set.push(buildDebris(size, faction, stream.split(`${i}`)));
    }
  }
  return set;
}
