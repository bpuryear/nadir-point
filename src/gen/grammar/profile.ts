/**
 * Spine profiles — the first half of the shape grammar.
 *
 * A profile is the hull's reach from the centreline at every row from bow
 * (y = 0) to stern (y = length - 1). It is the silhouette before any plating
 * exists, and because the acceptance criteria judge ships by outline, it is
 * where faction identity actually lives. Everything later in the pipeline
 * decorates this shape; none of it changes the outline.
 *
 * Reach is tracked per side — `leftWidth` (port, negative x) and `rightWidth`
 * (starboard, positive x) — rather than as one symmetric half-width. A single
 * half-width per row can only ever describe a solid of revolution: whatever
 * curve goes in, a lathe-turned shape comes out, because both sides are
 * always the same number. Concord, Coalition and Derelict keep both sides
 * equal (their faction identity is legitimately about the curve, not the
 * silhouette's left/right balance), so for them `leftWidth` and `rightWidth`
 * are the same array under two names. Player does not: its whole shape
 * language is asymmetric massing, which is exactly the thing a symmetric
 * representation cannot express. `halfWidth` — max(left, right) per row —
 * stays available for callers that only need "is there hull, how far does it
 * reach" (hardpoint search, LOD reduction, greeble placement) and don't care
 * which side the reach comes from.
 *
 * Faction shape languages are parameters, not drawings:
 *
 *   concord    a milled wedge — continuous taper, narrow bow, flared stern
 *   coalition  welded slabs — long constant-width runs with abrupt shoulders
 *   derelict   an eroded hull — a base shape with bites taken out of it
 *   player     an assembled working salvager — hard rectangular masses
 *              bolted together with abrupt transitions, lopsided port to
 *              starboard the way a hull built from other hulls' parts would
 *              be, with a blunt squared bow and a broad drive block aft
 */

import type { Rng } from '../../sim/rng.js';
import type { FactionId } from '../palette.js';

export type SizeClass = 'fighter' | 'corvette' | 'destroyer' | 'cruiser' | 'capital';

/** Inclusive length range in pixels at LOD tier 1. Fixed by the specification. */
export const SIZE_LENGTH: Readonly<Record<SizeClass, [number, number]>> = {
  fighter: [8, 12],
  corvette: [24, 36],
  destroyer: [48, 72],
  cruiser: [96, 128],
  capital: [130, 160],
};

/** Peak half-width as a fraction of length. Coalition ships are beamier by design. */
const BEAM_RATIO: Readonly<Record<FactionId, [number, number]>> = {
  concord: [0.11, 0.15],
  coalition: [0.18, 0.23],
  derelict: [0.13, 0.19],
  player: [0.15, 0.19],
};

export interface Profile {
  readonly length: number;
  /** Reach to starboard (positive x) at each row. */
  readonly rightWidth: Int32Array;
  /**
   * Reach to port (negative x) at each row. Equal to `rightWidth` for every
   * faction except player — see the module doc comment.
   */
  readonly leftWidth: Int32Array;
  /**
   * max(leftWidth[y], rightWidth[y]) at each row. Callers that only need "is
   * there hull here, and how far does it reach" — hardpoint placement, LOD
   * reduction, greeble candidate columns — read this instead of picking a
   * side, since they don't care which side the reach comes from.
   */
  readonly halfWidth: Int32Array;
  readonly maxHalfWidth: number;
  readonly faction: FactionId;
  readonly sizeClass: SizeClass;
}

export interface ProfileSpec {
  faction: FactionId;
  sizeClass: SizeClass;
  rng: Rng;
  length?: number;
}

/** A milled wedge: smooth taper from a narrow bow to a broad, flared stern. */
function concordCurve(t: number): number {
  // t is 0 at the bow, 1 at the stern. The rise spans half the hull so
  // rounding has enough rows to express every integer half-width along the
  // way — that resolution is what makes the taper read as milled rather than
  // stepped, and it's what the shape-language test measures.
  const nose = Math.pow(Math.min(t / 0.5, 1), 0.9);
  const body = 1 - 0.4 * Math.pow(Math.max(t - 0.5, 0) / 0.35, 1.15);
  const stern = t > 0.85 ? 1 + 0.35 * ((t - 0.85) / 0.15) : 1; // engine flare
  return nose * body * stern;
}

/** Quantises a curve into slabs so the hull reads as welded rather than milled. */
function slabbed(curve: (t: number) => number, slabs: number, t: number): number {
  const step = Math.floor(t * slabs) / slabs;
  const mid = step + 0.5 / slabs;
  return curve(Math.min(mid, 1));
}

/**
 * The player hull, as a stack of composited rectangular masses rather than a
 * curve.
 *
 * This replaced two earlier designs, both of which were tuned as a single
 * symmetric half-width curve and both of which read as a solid of revolution
 * no matter how the curve itself was reshaped — a uniform slab first ("plain
 * and slab-sided"), then a smooth taper (a round bulbous "head", a pinched
 * "neck", a flared conical "skirt" — a chess pawn). A profile that stores one
 * symmetric half-width per row is, by definition, a lathe-turned shape;
 * retuning the curve a third time would only produce a third one. The fix is
 * structural, not cosmetic: independent left/right extents per row, held flat
 * across each block and stepped — never ramped — between blocks, so the hull
 * reads as panels bolted together at hard corners, not as a milled curve.
 *
 * Each block gives a bow-to-stern fraction range `[t0, t1)` and a fraction of
 * peak beam for each side. The two sides are deliberately different in nearly
 * every block — asymmetry is the single strongest way to keep this hull from
 * reading as Coalition's welded-slab language, which is also stepped but is
 * symmetric and regular by design. This hull is lopsided and irregular:
 *
 *   - a blunt, squared bow face, modest rather than massive
 *   - a hard notch cut into the jaw right behind it, deeper to starboard
 *   - a forward block with a salvage-mount bulge welded on hard to port
 *   - a narrow mid spine (port/starboard hardpoints land here)
 *   - a sponson block mirrored the other way — a hard starboard bulge, the
 *     strongest single asymmetry signal on the hull
 *   - a ventral run favouring port again, so the two halves never mirror
 *   - a ramp, stepped rather than tapered, into
 *   - the engine block: the broad drive block aft, wider on both sides than
 *     anything forward of it and the widest mass on the whole hull — the
 *     clear stern identity the bow never claims.
 */
const PLAYER_BLOCKS: ReadonlyArray<{ t0: number; t1: number; left: number; right: number }> = [
  { t0: 0.00, t1: 0.07, left: 0.40, right: 0.36 }, // bow face — blunt, squared
  { t0: 0.07, t1: 0.16, left: 0.24, right: 0.14 }, // the maw — a hard notch, deeper to starboard
  { t0: 0.16, t1: 0.32, left: 0.58, right: 0.30 }, // forward block — salvage-mount bulge, hard to port
  { t0: 0.32, t1: 0.44, left: 0.26, right: 0.18 }, // narrow mid spine
  { t0: 0.44, t1: 0.60, left: 0.30, right: 0.66 }, // sponson block — mirrored bulge, hard to starboard
  { t0: 0.60, t1: 0.74, left: 0.62, right: 0.46 }, // ventral run — favours port again
  { t0: 0.74, t1: 0.86, left: 0.80, right: 0.72 }, // stepped ramp into the engine block
  { t0: 0.86, t1: 1.001, left: 1.00, right: 0.94 }, // engine block — the widest mass, aft
];

function playerBlockAt(t: number): { left: number; right: number } {
  for (const b of PLAYER_BLOCKS) {
    if (t >= b.t0 && t < b.t1) return b;
  }
  return PLAYER_BLOCKS[PLAYER_BLOCKS.length - 1]!;
}

/**
 * Rescales both side arrays in place by the same factor so the hull is never
 * wider than it is long, preserving whatever left/right asymmetry the shape
 * already had rather than collapsing it back to symmetric.
 *
 * Shared across every faction: a symmetric profile with leftWidth === rightWidth
 * rescales identically on both arrays and stays symmetric; an asymmetric one
 * keeps its asymmetry ratio.
 */
function clampToLength(leftWidth: Int32Array, rightWidth: Int32Array, length: number): void {
  let maxHalf = 0;
  for (let y = 0; y < length; y++) {
    const h = Math.max(leftWidth[y]!, rightWidth[y]!);
    if (h > maxHalf) maxHalf = h;
  }
  if (maxHalf * 2 < length) return;

  const scale = (length - 1) / (maxHalf * 2);
  for (const arr of [leftWidth, rightWidth]) {
    for (let y = 0; y < length; y++) {
      // Math.floor alone can round an originally-filled row down to 0, which
      // opens exactly the interior gap `erode` works elsewhere to prevent — a
      // plain floor scaled a small hull's row from 1 to 0 on tiny fighter-class
      // hulls, splitting the silhouette in two. A row that was filled before
      // rescaling stays filled after it.
      const scaled = Math.floor(arr[y]! * scale);
      arr[y] = arr[y]! > 0 ? Math.max(1, scaled) : 0;
    }
  }
}

export function buildProfile(spec: ProfileSpec): Profile {
  const { faction, sizeClass, rng } = spec;
  const [lo, hi] = SIZE_LENGTH[sizeClass];
  const length = spec.length ?? lo + rng.int(hi - lo + 1);

  const [beamLo, beamHi] = BEAM_RATIO[faction];
  const peak = Math.max(1, Math.round(length * rng.range(beamLo, beamHi)));

  let leftWidth: Int32Array;
  let rightWidth: Int32Array;

  if (faction === 'player') {
    leftWidth = new Int32Array(length);
    rightWidth = new Int32Array(length);
    for (let y = 0; y < length; y++) {
      const t = length === 1 ? 0 : y / (length - 1);
      const block = playerBlockAt(t);
      leftWidth[y] = Math.max(1, Math.round(block.left * peak));
      rightWidth[y] = Math.max(1, Math.round(block.right * peak));
    }
  } else {
    // Coalition slab count scales with hull length so a corvette gets 3-4
    // slabs and a capital gets 7-8 — the language reads the same at every size.
    const slabs = Math.max(3, Math.round(length / 18));
    const width = new Int32Array(length);

    for (let y = 0; y < length; y++) {
      const t = length === 1 ? 0 : y / (length - 1);

      let shape: number;
      switch (faction) {
        case 'concord':
          shape = concordCurve(t);
          break;
        case 'coalition':
          shape = slabbed(concordCurve, slabs, t);
          break;
        case 'derelict':
          shape = concordCurve(t);
          break;
      }

      // A shape function that is strictly positive at `t` says this row is
      // part of the hull; rounding must not override that to 0. At the small
      // end of the size range `peak` itself can be 1-2px, and a shape
      // fraction rounds straight to 0 there — an interior gap with no
      // erosion involved. A shape of exactly 0 (the bow tip of the
      // concord/derelict taper) is a deliberate point and stays 0.
      width[y] = shape > 0 ? Math.max(1, Math.round(shape * peak)) : 0;
    }

    if (faction === 'derelict') {
      erode(width, rng);
    }

    // Erosion is allowed to take bites out of a derelict, but not to eat it
    // whole. A profile with no filled rows is an invisible ship — its sprite
    // is empty, its hardpoints have nowhere to land, and nothing downstream
    // can render it. Short hulls are the exposed case: a few bites can clear
    // an 8-12px fighter entirely.
    //
    // Restore a minimal spine around midships rather than undoing the
    // erosion — what survives should still read as wreckage, just wreckage
    // that exists.
    let anyFilled = false;
    for (const w of width) {
      if (w > 0) { anyFilled = true; break; }
    }
    if (!anyFilled) {
      const mid = Math.floor(length / 2);
      const spine = Math.max(1, Math.round(length * 0.2));
      for (let y = Math.max(0, mid - spine); y <= Math.min(length - 1, mid + spine); y++) {
        width[y] = 1;
      }
    }

    leftWidth = width;
    rightWidth = new Int32Array(width); // independent copy — see the module doc comment
  }

  // Guard the invariant the tests assert: never wider than long. A pathological
  // random draw at the small end could otherwise produce a disc.
  clampToLength(leftWidth, rightWidth, length);

  const halfWidth = new Int32Array(length);
  let maxHalfWidth = 0;
  for (let y = 0; y < length; y++) {
    const h = Math.max(leftWidth[y]!, rightWidth[y]!);
    halfWidth[y] = h;
    if (h > maxHalfWidth) maxHalfWidth = h;
  }

  return { length, leftWidth, rightWidth, halfWidth, maxHalfWidth, faction, sizeClass };
}

/**
 * The floor erosion may never thin a row past, scaled to the hull's own peak
 * beam rather than a flat pixel count.
 *
 * Bare connectivity — never zero — was the old bar, and it let a derelict
 * erode down to a single-pixel bridge between two full-mass ends. That reads
 * as two objects sharing a canvas, not one damaged hull: a "kebab skewer", per
 * review. A 1px bridge is technically one connected component and visually
 * two. The fix is a floor with real plate mass behind it, proportional to the
 * hull so a capital's waist and a corvette's waist are both "thinned", not
 * both "clipped to the same absolute number".
 */
export const MIN_WAIST_FRACTION = 0.3;

export function minWaistFor(peak: number): number {
  return Math.max(1, Math.round(peak * MIN_WAIST_FRACTION));
}

/**
 * Takes bites out of a hull. Derelicts have been dead for a long time; the
 * erosion is the difference between "a ship" and "what is left of a ship".
 *
 * Erosion used to apply each bite independently to disjoint (and sometimes
 * gapped) spans. A row that fell between two bites, touched by neither, kept
 * its full pristine width — which on a contact-sheet render showed up as a
 * lone full-width row standing in the middle of a heavily thinned run, read
 * as a horizontal crossbar welding two separate masses together (a "kebab
 * skewer", per review) rather than as part of one continuously eroded waist.
 * Erosion here instead picks a single contiguous zone and blends every bite's
 * severity across it with a zone-wide baseline, so no row inside the zone
 * ever reverts to untouched width, and never below `minWaistFor(peak)` — see
 * that function's doc comment for why a bare 1px bridge is not enough.
 */
function erode(width: Int32Array, rng: Rng): void {
  const length = width.length;

  let peak = 0;
  for (const w of width) if (w > peak) peak = w;
  const minWaist = minWaistFor(peak);

  // A single erosion zone, kept clear of the extreme bow and stern so the
  // hull still reads nose-first and the engine block survives intact. Capped
  // well under half the hull on its own — the zone is where erosion is
  // *possible*, not where it is uniform, so its length is not directly the
  // flat-run length; the per-row baseline jitter below is what keeps a long
  // zone from reading as one flat plateau.
  const zoneStart = Math.floor(length * rng.range(0.22, 0.42));
  const zoneLen = Math.max(6, Math.round(length * rng.range(0.24, 0.34)));
  const zoneEnd = Math.min(length - 2, zoneStart + zoneLen);
  if (zoneEnd <= zoneStart) return;

  // 1-3 damage lobes inside the zone, each a local severity peak that falls
  // off with distance from its centre.
  const lobeCount = 1 + rng.int(3);
  const lobes: { centre: number; radius: number; severity: number }[] = [];
  for (let i = 0; i < lobeCount; i++) {
    lobes.push({
      centre: zoneStart + rng.range(0, zoneEnd - zoneStart),
      radius: Math.max(3, (zoneEnd - zoneStart) * rng.range(0.35, 0.7)),
      severity: rng.range(0.55, 0.92),
    });
  }

  for (let y = zoneStart; y <= zoneEnd; y++) {
    const original = width[y]!;
    if (original === 0) continue; // nothing to erode on an already-empty row

    // Baseline damage carries *some* jitter per row, drawn fresh each row
    // rather than held at one flat value: a constant baseline floors every
    // row untouched by a lobe to the exact same eroded width, which is a
    // long flat run by another name — the same silhouette-collapse the
    // Coalition/Concord flat-run guard exists to catch, just self-inflicted
    // by erosion instead of by the base curve. Lobes still deepen it further
    // where they reach.
    let severity = rng.range(0.15, 0.4);
    for (const lobe of lobes) {
      const d = Math.abs(y - lobe.centre);
      if (d < lobe.radius) {
        severity = Math.max(severity, lobe.severity * (1 - d / lobe.radius));
      }
    }

    const eroded = Math.round(original * (1 - severity));
    // Never below the waist floor, and never above the row's own pristine
    // width (the floor is derived from the hull's global peak, which can
    // exceed a given row's untouched width near the ends of the zone).
    width[y] = Math.min(original, Math.max(minWaist, eroded));
  }

  // On a small hull (a corvette's peak beam can be as little as 2-3px) the
  // base curve itself only spans a handful of distinct integer widths.
  // Erosion thinning a bump down to a value the *un-eroded* stern flare
  // already sits at silently merges the two runs into one — an emergent flat
  // run neither the curve nor the erosion "intended" on its own. Enforced
  // directly rather than left to chance, and bounded by the same waist floor
  // so this safety valve can never undercut the minimum connection width it
  // sits downstream of.
  breakLongRuns(width, minWaist);
}

/**
 * Guarantees no run of identical consecutive widths exceeds `maxRunFraction`
 * of the hull's length, chopping any excess into a fine alternation instead.
 * Never reduces a row below `floor` — the flat-run ceiling and the waist
 * floor are both hard constraints, and this must satisfy both at once rather
 * than trading one for the other.
 */
function breakLongRuns(width: Int32Array, floor: number, maxRunFraction = 0.42): void {
  const n = width.length;
  const maxRun = Math.max(1, Math.floor(n * maxRunFraction));
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && width[j + 1] === width[i]) j++;
    if (j - i + 1 > maxRun) {
      // Step every other row from the point the run becomes "too long" down
      // by one pixel — a checkerboard of V and V-1 rather than a flat run of
      // V, and still reads as thinned plate rather than a texture error at
      // this scale.
      for (let k = i + maxRun; k <= j; k += 2) {
        if (width[k]! > floor) width[k] = width[k]! - 1;
      }
    }
    i = j + 1;
  }
}

export function profileWidth(p: Profile, y: number): number {
  if (y < 0 || y >= p.length) return 0;
  const left = p.leftWidth[y]!;
  const right = p.rightWidth[y]!;
  if (left === 0 && right === 0) return 0;
  return left + right + 1;
}

/** `x` is measured from the centreline, so it may be negative. */
export function isFilled(p: Profile, x: number, y: number): boolean {
  if (y < 0 || y >= p.length) return false;
  const left = p.leftWidth[y]!;
  const right = p.rightWidth[y]!;
  if (left === 0 && right === 0) return false;
  return x >= 0 ? x <= right : -x <= left;
}

export function profileArea(p: Profile): number {
  let area = 0;
  for (let y = 0; y < p.length; y++) area += profileWidth(p, y);
  return area;
}
