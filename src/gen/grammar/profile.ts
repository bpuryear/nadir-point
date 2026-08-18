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
 *   player     a working salvager — modest notched bow, narrow spine, a
 *              stern engine block wider than everything ahead of it
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

/**
 * A working salvager: a modest, squared forward block with a central notch
 * (the salvage maw wrecks get drawn into), a long narrow spine amidships, and
 * a heavy engine block aft that is both the widest mass on the hull and wider
 * than the bow block by a wide margin. Three differentiated masses — not a
 * taper (Concord), not a stack of constant-width runs (Coalition), and not
 * the earlier stack of near-equal lozenges this replaced.
 *
 * That earlier version paired a bow-heavy jaw with a stern-heavy drive
 * section of *comparable* size, which made the hull read as nearly the same
 * shape rotated 180° — a contact-sheet review measured it at ~0.76-0.79
 * overlap against its own reversal (see the `rotationOverlap` metric in
 * profile.test.ts) and called it a turned-wood baluster. The fix here is not
 * "pinch the waist harder", it is asymmetry of *kind*: the bow stays modest
 * and blocky (notch, short plateaus, nothing past ~0.44 of peak width) while
 * the stern is one continuous flare that is *never* matched by anything
 * forward of the spine — the widest point on the whole hull sits at the very
 * stern. Reversed, this hull cannot be mistaken for itself.
 *
 * Expressed as a control polygon rather than a formula: each pair is
 * [fraction of length, half-width as a fraction of the peak], linearly
 * interpolated between neighbours. Straight facets between control points is
 * the point — it reads as milled panels bolted together, not a milled curve.
 */
const PLAYER_HULL: ReadonlyArray<readonly [number, number]> = [
  [0.00, 0.40], // squared bow face — blunt, but modest: the bow is not the ship's mass
  [0.05, 0.44], // bow corner — a short flat plateau, not a taper to a point
  [0.10, 0.22], // the maw: a hard notch cut into the jaw right behind the bow face
  [0.16, 0.40], // rises back out of the notch
  [0.24, 0.44], // forward working block (dorsal sits here) — squared, but not the hull's mass
  [0.34, 0.32],
  [0.44, 0.20], // the spine: narrow, offset toward the bow half (port/starboard sponsons sit here)
  [0.54, 0.24], // climbs straight back out — a pinch, not a held plateau
  [0.62, 0.34], // ventral bay, on the rise off the spine
  [0.70, 0.48],
  [0.78, 0.64], // engine block ramp — one long continuous run to the stern
  [0.86, 0.82],
  [0.93, 0.97],
  [1.00, 1.00], // engine block — the widest point, right at the stern: a flare, not a point
];

function playerCurve(t: number): number {
  for (let i = 0; i < PLAYER_HULL.length - 1; i++) {
    const [t0, h0] = PLAYER_HULL[i]!;
    const [t1, h1] = PLAYER_HULL[i + 1]!;
    if (t <= t1 || i === PLAYER_HULL.length - 2) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return h0 + (h1 - h0) * Math.min(1, Math.max(0, f));
    }
  }
  return PLAYER_HULL[PLAYER_HULL.length - 1]![1];
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
        // No slab quantisation here — the control-polygon curve itself is
        // already faceted (straight runs between control points), and its
        // shape carries the player identity (notch, waist, engine block).
        // Quantising on top would flatten those facets back into the wide,
        // near-featureless plateaus this profile replaced.
        shape = playerCurve(t);
        break;
    }

    // A shape function that is strictly positive at `t` says this row is part
    // of the hull; rounding must not override that to 0. At the small end of
    // the size range `peak` itself can be 1-2px, and a shape fraction like a
    // notch minimum (~0.2) rounds straight to 0 there — an interior gap with
    // no erosion involved, splitting the silhouette exactly like the erosion
    // bug this file's `erode` guards against. A shape of exactly 0 (the bow
    // tip of the concord/derelict taper) is a deliberate point and stays 0.
    halfWidth[y] = shape > 0 ? Math.max(1, Math.round(shape * peak)) : 0;
  }

  if (faction === 'derelict') {
    erode(halfWidth, rng);
  }

  // Erosion is allowed to take bites out of a derelict, but not to eat it
  // whole. A profile with no filled rows is an invisible ship — its sprite is
  // empty, its hardpoints have nowhere to land, and nothing downstream can
  // render it. Short hulls are the exposed case: a few bites can clear an
  // 8-12px fighter entirely.
  //
  // Restore a minimal spine around midships rather than undoing the erosion —
  // what survives should still read as wreckage, just wreckage that exists.
  let anyFilled = false;
  for (const w of halfWidth) {
    if (w > 0) { anyFilled = true; break; }
  }
  if (!anyFilled) {
    const mid = Math.floor(length / 2);
    const spine = Math.max(1, Math.round(length * 0.2));
    for (let y = Math.max(0, mid - spine); y <= Math.min(length - 1, mid + spine); y++) {
      halfWidth[y] = 1;
    }
  }

  let maxHalfWidth = 0;
  for (const w of halfWidth) if (w > maxHalfWidth) maxHalfWidth = w;

  // Guard the invariant the tests assert: never wider than long. A pathological
  // random draw at the small end could otherwise produce a disc.
  if (maxHalfWidth * 2 >= length) {
    const scale = (length - 1) / (maxHalfWidth * 2);
    maxHalfWidth = 0;
    for (let y = 0; y < length; y++) {
      // Math.floor alone can round an originally-filled row down to 0, which
      // opens exactly the interior gap this file works elsewhere to prevent
      // (see `erode`) — a plain floor scaled a small hull's row from 1 to 0
      // on tiny fighter-class hulls, splitting the silhouette in two. A row
      // that was filled before rescaling stays filled after it.
      const scaled = Math.floor(halfWidth[y]! * scale);
      halfWidth[y] = halfWidth[y]! > 0 ? Math.max(1, scaled) : 0;
      if (halfWidth[y]! > maxHalfWidth) maxHalfWidth = halfWidth[y]!;
    }
  }

  return { length, halfWidth, maxHalfWidth, faction, sizeClass };
}

/**
 * Takes bites out of a hull. Derelicts have been dead for a long time; the
 * erosion is the difference between "a ship" and "what is left of a ship".
 *
 * A bite thins a row toward nothing but must never actually reach it: `plates.ts`
 * skips any row whose half-width is 0 (`if (half === 0) continue;`), so a single
 * zeroed interior row paints as a fully transparent band the width of the
 * canvas — the pixels above and below it are no longer even diagonally
 * adjacent. Two masses of hull sharing a canvas but not a single connected
 * pixel is not "an eroded ship", it is a broken umbrella stand: an
 * attachment-offset bug wearing damage as an excuse. Flooring every bitten row
 * at a half-width of 1 keeps the hull one connected object — down to a single
 * bridging pixel column at the worst of a bite — while still reading as
 * severely thinned, which is what erosion is for.
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
      // Never floor to 0 here: that would sever the hull into disconnected
      // pieces (see the note above). A bitten row may still hit 0 by way of a
      // *different* mechanism — e.g. it started at 0 already — but erosion
      // itself must not be the thing that creates the gap.
      if (halfWidth[y]! > 0) {
        halfWidth[y] = Math.max(1, Math.round(halfWidth[y]! * (1 - severity)));
      }
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
