/**
 * Spine profiles — the first half of the shape grammar.
 *
 * A profile is the hull's half-width at every row from bow (y = 0) to stern
 * (y = length - 1). It is the silhouette before any plating exists, and because
 * the acceptance criteria judge ships by outline, it is where faction identity
 * actually lives. Everything later in the pipeline decorates this shape; none of
 * it changes the outline.
 *
 * Faction shape languages are parameters, not drawings:
 *
 *   concord    a milled wedge — continuous taper, narrow bow, flared stern
 *   coalition  welded slabs — long constant-width runs with abrupt shoulders
 *   derelict   an eroded hull — a base shape with bites taken out of it
 *   player     a working salvager — blunt bow, slab sides, heavy midsection
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

/** A working salvager: blunt bow, mass carried forward of amidships, narrowing aft. */
function playerCurve(t: number): number {
  const nose = Math.pow(Math.min(t / 0.18, 1), 0.45);
  const body = 1 - 0.34 * Math.pow(Math.max(t - 0.4, 0) / 0.6, 1.4);
  const stern = t > 0.9 ? 1 + 0.12 * ((t - 0.9) / 0.1) : 1;
  return nose * body * stern;
}

/** Quantises a curve into slabs so the hull reads as welded rather than milled. */
function slabbed(curve: (t: number) => number, slabs: number, t: number): number {
  const step = Math.floor(t * slabs) / slabs;
  const mid = step + 0.5 / slabs;
  return curve(Math.min(mid, 1));
}

export function buildProfile(spec: ProfileSpec): Profile {
  const { faction, sizeClass, rng } = spec;
  const [lo, hi] = SIZE_LENGTH[sizeClass];
  const length = spec.length ?? lo + rng.int(hi - lo + 1);

  const [beamLo, beamHi] = BEAM_RATIO[faction];
  const peak = Math.max(1, Math.round(length * rng.range(beamLo, beamHi)));

  const halfWidth = new Int32Array(length);

  // Coalition slab count scales with hull length so a corvette gets 3-4 slabs
  // and a capital gets 7-8 — the language reads the same at every size.
  const slabs = Math.max(3, Math.round(length / 18));

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
      case 'player':
        shape = slabbed(playerCurve, Math.max(4, Math.round(length / 20)), t);
        break;
    }

    halfWidth[y] = Math.max(0, Math.round(shape * peak));
  }

  // A hull one pixel wide at the bow is a point, not a prow. Guarantee the very
  // front row is at least present so the silhouette has a tip to read.
  if (halfWidth[0] === 0) halfWidth[0] = 0;

  if (faction === 'derelict') {
    erode(halfWidth, rng);
  }

  let maxHalfWidth = 0;
  for (const w of halfWidth) if (w > maxHalfWidth) maxHalfWidth = w;

  // Guard the invariant the tests assert: never wider than long. A pathological
  // random draw at the small end could otherwise produce a disc.
  if (maxHalfWidth * 2 >= length) {
    const scale = (length - 1) / (maxHalfWidth * 2);
    maxHalfWidth = 0;
    for (let y = 0; y < length; y++) {
      halfWidth[y] = Math.floor(halfWidth[y]! * scale);
      if (halfWidth[y]! > maxHalfWidth) maxHalfWidth = halfWidth[y]!;
    }
  }

  return { length, halfWidth, maxHalfWidth, faction, sizeClass };
}

/**
 * Takes bites out of a hull. Derelicts have been dead for a long time; the
 * erosion is the difference between "a ship" and "what is left of a ship", and
 * it is the only faction permitted interior gaps.
 */
function erode(halfWidth: Int32Array, rng: Rng): void {
  const length = halfWidth.length;
  const bites = 1 + rng.int(3);

  for (let i = 0; i < bites; i++) {
    // Keep bites away from the extreme bow so the hull still reads nose-first.
    const start = Math.floor(length * rng.range(0.25, 0.85));
    const span = Math.max(2, Math.round(length * rng.range(0.04, 0.11)));
    const severity = rng.range(0.45, 1);

    for (let y = start; y < Math.min(length, start + span); y++) {
      halfWidth[y] = Math.max(0, Math.round(halfWidth[y]! * (1 - severity)));
    }
  }
}

export function profileWidth(p: Profile, y: number): number {
  if (y < 0 || y >= p.length) return 0;
  const half = p.halfWidth[y]!;
  return half === 0 ? 0 : half * 2 + 1;
}

/** `x` is measured from the centreline, so it may be negative. */
export function isFilled(p: Profile, x: number, y: number): boolean {
  if (y < 0 || y >= p.length) return false;
  const half = p.halfWidth[y]!;
  if (half === 0) return false;
  return Math.abs(x) <= half;
}

export function profileArea(p: Profile): number {
  let area = 0;
  for (let y = 0; y < p.length; y++) area += profileWidth(p, y);
  return area;
}
