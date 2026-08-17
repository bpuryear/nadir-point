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
import { buildProfile, type Profile, type SizeClass } from './grammar/profile.js';
import { plateHull } from './grammar/plates.js';
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

/** Clamps a row into the hull and off its very tips, where there is no width. */
function anchorRow(profile: Profile, fraction: number): number {
  const raw = Math.round((profile.length - 1) * fraction);
  // Walk toward midships until the row has hull on it. A derelict's erosion can
  // leave the nominal row empty, and an anchor floating in a gap is a defect.
  const mid = Math.floor(profile.length / 2);
  let y = Math.max(0, Math.min(profile.length - 1, raw));
  let guard = profile.length;
  while (guard-- > 0 && profile.halfWidth[y]! < 1) {
    y += y < mid ? 1 : -1;
    if (y < 0 || y >= profile.length) return mid;
  }
  return y;
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

  for (const id of HARDPOINT_IDS) {
    const y = anchorRow(profile, HARDPOINT_AT[id]);
    const half = profile.halfWidth[y]!;

    let x = cx;
    if (id === 'port') x = cx - Math.max(1, half - 1);
    if (id === 'starboard') x = cx + Math.max(1, half - 1);

    hardpoints[id] = { id, x, y };
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
  };
}
