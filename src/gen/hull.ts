/**
 * Finished hulls: profile, plating, greebles, running lights, and the six
 * hardpoint anchors modules bolt onto.
 *
 * In a top-down view "dorsal" and "ventral" cannot be above and below, so they
 * render as centreline positions — dorsal forward of amidships, ventral aft of
 * it. Together with the bow, the engine block, and the two sponsons that gives
 * six positions a player can tell apart at a glance, which is the requirement
 * they exist to satisfy.
 */

import type { Rng } from '../sim/rng.js';
import { type PixBuf } from './pixbuf.js';
import { EMISSIVE, FACTION_PALETTE, rampOf, type FactionId } from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import { buildProfile, isFilled, type Profile, type SizeClass } from './grammar/profile.js';
import { plateHull, type PlateBand } from './grammar/plates.js';
import { applyGreebles, applyRunningLights } from './grammar/greeble.js';

export type HardpointId = 'bow' | 'dorsal' | 'ventral' | 'port' | 'starboard' | 'engine';

/** Install order — also the z-order modules composite in. */
export const HARDPOINT_IDS: readonly HardpointId[] = [
  'bow', 'dorsal', 'ventral', 'port', 'starboard', 'engine',
];

/** Position along the hull as a fraction from bow (0) to stern (1). */
export const HARDPOINT_AT: Readonly<Record<HardpointId, number>> = {
  bow: 0.06,
  dorsal: 0.30,
  port: 0.50,
  starboard: 0.50,
  ventral: 0.66,
  engine: 0.93,
};

export interface Hardpoint {
  id: HardpointId;
  x: number;
  y: number;
}

export interface Hull {
  buf: PixBuf;
  centreX: number;
  profile: Profile;
  hardpoints: Readonly<Record<HardpointId, Hardpoint>>;
  faction: FactionId;
  sizeClass: SizeClass;
  /** Plate bands, bow to stern — the structure damage uses for blown plating. */
  plates: readonly PlateBand[];
}

export interface HullSpec {
  faction: FactionId;
  sizeClass: SizeClass;
  rng: Rng;
  length?: number;
}

/** Emissive colour each faction runs its lights in. */
const RUNNING_LIGHT_COLOR: Readonly<Record<FactionId, number>> = {
  concord: EMISSIVE.blue,
  coalition: EMISSIVE.amber,
  derelict: EMISSIVE.green,
  player: EMISSIVE.amber,
};

/**
 * Minimum rows between two hardpoints.
 *
 * Row identity is not enough: the sponsons sit off the centreline, so a
 * hardpoint three rows from them is only sqrt(13) away in Euclidean terms —
 * under the four-pixel floor that keeps six positions distinguishable. Four
 * rows apart guarantees four pixels apart whatever the x offsets are.
 */
const MIN_ROW_GAP = 4;

function withinGap(y: number, claimed: Set<number>, gap: number): boolean {
  for (const c of claimed) {
    if (Math.abs(y - c) < gap) return true;
  }
  return false;
}

/**
 * The nominal row for a fraction along the hull.
 */
function nominalRow(profile: Profile, fraction: number): number {
  return Math.max(0, Math.min(profile.length - 1, Math.round((profile.length - 1) * fraction)));
}

/**
 * Searches outward from the nominal row for the nearest row satisfying
 * `accept`, returning null if none does.
 *
 * Outward-by-distance rather than walking in a direction. A directional walk
 * has a fixed point at midships — it oscillates between two adjacent rows and
 * never reaches a valid row just past them — and a linear scan from row 0 has
 * no positional preference, so it can return a row from the far end of the hull
 * and invert the bow-to-stern ordering. Distance-ordered search has neither
 * failure.
 */
function searchOutward(
  profile: Profile,
  fraction: number,
  accept: (y: number) => boolean,
): number | null {
  const raw = nominalRow(profile, fraction);
  for (let d = 0; d < profile.length; d++) {
    const candidates = d === 0 ? [raw] : [raw - d, raw + d];
    for (const y of candidates) {
      if (y < 0 || y >= profile.length) continue;
      if (accept(y)) return y;
    }
  }
  return null;
}

/**
 * A row for a centreline hardpoint: on real hull, and as clear of rows already
 * taken as the hull's geometry allows.
 *
 * The gap degrades one pixel at a time rather than being abandoned outright —
 * a row three pixels from another hardpoint is a much better outcome than one
 * pixel away, and an all-or-nothing fallback throws that distinction away. On
 * a hull where five hardpoints at gap 4 is an exact fit, erosion removing a
 * few rows can make the full gap infeasible without making every gap
 * infeasible, and the descending sweep finds whatever the hull can still
 * support before giving up on the gap entirely.
 *
 * Only past that does the fallback degrade through DISTINCTNESS, never
 * through validity: a hardpoint sharing a row is cosmetic on a hull too small
 * to hold six; one floating in a hole is a defect at any size. `buildProfile`
 * guarantees at least one filled row even after erosion, so the distinctness
 * tiers always succeed; the terminal `nominalRow` fallback exists only as a
 * belt-and-braces guard against that guarantee ever regressing, not as a claim
 * it currently relies on.
 */
function anchorRow(profile: Profile, fraction: number, claimed: Set<number>): number {
  const filled = (y: number) => profile.halfWidth[y]! >= 1;

  for (let gap = MIN_ROW_GAP; gap >= 1; gap--) {
    const found = searchOutward(profile, fraction, (y) => filled(y) && !withinGap(y, claimed, gap));
    if (found !== null) return found;
  }

  return (
    searchOutward(profile, fraction, (y) => filled(y) && !claimed.has(y)) ??
    searchOutward(profile, fraction, filled) ??
    nominalRow(profile, fraction)
  );
}

/**
 * A row for the sponsons: broad enough that port and starboard land at least
 * four pixels apart, and as clear of rows already taken as the hull allows.
 *
 * Same descending-gap degradation as `anchorRow`, applied to the "broad
 * enough" rows first; only once no broad row exists at any gap does it fall
 * back to distinctness and then to any filled row.
 */
function sponsonRow(profile: Profile, fraction: number, claimed: Set<number>): number {
  const broad = (y: number) => profile.halfWidth[y]! >= 3;
  const filled = (y: number) => profile.halfWidth[y]! >= 1;

  for (let gap = MIN_ROW_GAP; gap >= 1; gap--) {
    const found = searchOutward(profile, fraction, (y) => broad(y) && !withinGap(y, claimed, gap));
    if (found !== null) return found;
  }

  return (
    searchOutward(profile, fraction, (y) => broad(y) && !claimed.has(y)) ??
    searchOutward(profile, fraction, broad) ??
    searchOutward(profile, fraction, filled) ??
    nominalRow(profile, fraction)
  );
}

export function buildHull(spec: HullSpec): Hull {
  const { faction, sizeClass, rng } = spec;

  const profile = buildProfile(
    spec.length === undefined
      ? { faction, sizeClass, rng }
      : { faction, sizeClass, rng, length: spec.length },
  );

  const ramp = rampOf(faction);
  const plated = plateHull({ profile, ramp, rng });

  applyGreebles(plated, profile, ramp, rng);
  applyRunningLights(plated, profile, RUNNING_LIGHT_COLOR[faction]);

  const cx = plated.centreX;
  const hardpoints = {} as Record<HardpointId, Hardpoint>;
  const claimed = new Set<number>();

  // Port and starboard share one row, chosen wide enough to keep them apart.
  const sponsonY = sponsonRow(profile, HARDPOINT_AT.port, claimed);
  claimed.add(sponsonY);

  for (const id of HARDPOINT_IDS) {
    if (id === 'port' || id === 'starboard') {
      const half = profile.halfWidth[sponsonY]!;
      const dir = id === 'port' ? -1 : 1;
      // Start just inboard of the edge and walk toward the centreline until the
      // pixel is actually hull — erosion can hollow the edge cell while leaving
      // the row nominally filled.
      let x = cx;
      for (let off = Math.max(1, half - 1); off >= 0; off--) {
        if (isFilled(profile, dir * off, sponsonY)) { x = cx + dir * off; break; }
      }
      hardpoints[id] = { id, x, y: sponsonY };
      continue;
    }

    const y = anchorRow(profile, HARDPOINT_AT[id], claimed);
    claimed.add(y);
    hardpoints[id] = { id, x: cx, y };
  }

  // Fail loudly at generation time rather than shipping an off-palette hull that
  // only surfaces when the whole contact sheet is QC'd.
  assertQc(qcSprite(`hull:${faction}:${sizeClass}`, plated.buf, FACTION_PALETTE[faction]));

  return {
    buf: plated.buf,
    centreX: cx,
    profile,
    hardpoints,
    faction,
    sizeClass,
    plates: plated.plates,
  };
}
