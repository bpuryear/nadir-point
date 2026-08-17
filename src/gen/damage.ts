/**
 * The four damage frames every hull and module ships with.
 *
 * The rule that shapes this code is a design rule, not a graphics one: modules
 * are lost only to critical hardpoint breach, and the player must be able to see
 * a hardpoint approaching that threshold and react to it. So the frames escalate
 * in a legible order —
 *
 *   intact     untouched
 *   damaged    scorch and dead running lights; outline pixel-identical
 *   critical   interior holes punched through, every emissive out; the bounding
 *              box still holds, so the ship reads as breached rather than eaten
 *   destroyed  the outline itself erodes
 *
 * Keeping the silhouette whole until critical is what makes the warning
 * readable. If ordinary damage nibbled the outline, a player would have no way
 * to tell "hurt" from "about to lose the module".
 */

import type { Rng } from '../sim/rng.js';
import {
  cloneBuf, EMPTY, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { isEmissive, snapToPalette, WARM } from './palette.js';

export type DamageState = 'intact' | 'damaged' | 'critical' | 'destroyed';

/** In worsening order. */
export const DAMAGE_STATES: readonly DamageState[] = [
  'intact', 'damaged', 'critical', 'destroyed',
];

export interface DamageSpec {
  state: DamageState;
  rng: Rng;
  allowed: readonly Rgba[];
}

interface Severity {
  /** Fraction of hull pixels that take scorch. */
  scorch: number;
  /** Fraction of emissives that go dark. */
  lightsOut: number;
  /** Fraction of interior pixels punched out. */
  holes: number;
  /** Whether the outline itself may erode. */
  erodeEdges: boolean;
}

const SEVERITY: Readonly<Record<DamageState, Severity>> = {
  intact:    { scorch: 0,    lightsOut: 0,   holes: 0,    erodeEdges: false },
  damaged:   { scorch: 0.10, lightsOut: 0.5, holes: 0,    erodeEdges: false },
  critical:  { scorch: 0.22, lightsOut: 1,   holes: 0.10, erodeEdges: false },
  destroyed: { scorch: 0.34, lightsOut: 1,   holes: 0.22, erodeEdges: true },
};

/** True when every eight-neighbour is opaque — safe to punch without touching the outline. */
function isInteriorPixel(buf: PixBuf, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isOpaque(getPx(buf, x + dx, y + dy))) return false;
    }
  }
  return true;
}

export function applyDamage(src: PixBuf, spec: DamageSpec): PixBuf {
  if (spec.state === 'intact') return cloneBuf(src);

  const { rng, allowed } = spec;
  const sev = SEVERITY[spec.state];
  const out = cloneBuf(src);

  // Scorch palette: the dark end of the warm ramp, snapped into whatever the
  // caller allows so a faction lock is never broken by damage.
  const scorchDark = snapToPalette(WARM[1]!, allowed);
  const scorchMid = snapToPalette(WARM[2]!, allowed);

  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const c = getPx(out, x, y);
      if (!isOpaque(c)) continue;

      // Running lights die first and stay dead.
      if (isEmissive(c)) {
        if (rng.chance(sev.lightsOut)) {
          setPx(out, x, y, scorchDark);
        }
        continue;
      }

      if (rng.chance(sev.scorch)) {
        setPx(out, x, y, rng.chance(0.6) ? scorchDark : scorchMid);
      }
    }
  }

  // Holes are punched only through interior pixels, which is what preserves the
  // bounding box at critical.
  if (sev.holes > 0) {
    const snapshot = cloneBuf(out);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (!isInteriorPixel(snapshot, x, y)) continue;
        if (rng.chance(sev.holes)) setPx(out, x, y, EMPTY);
      }
    }
  }

  if (sev.erodeEdges) {
    const snapshot = cloneBuf(out);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (isInteriorPixel(snapshot, x, y)) continue; // edge pixels only
        if (rng.chance(0.3)) setPx(out, x, y, EMPTY);
      }
    }
  }

  return out;
}

export function damageFrames(
  src: PixBuf,
  rng: Rng,
  allowed: readonly Rgba[],
): Readonly<Record<DamageState, PixBuf>> {
  const frames = {} as Record<DamageState, PixBuf>;
  for (const state of DAMAGE_STATES) {
    // A child stream per state, so adding a state later cannot change how the
    // existing ones look.
    frames[state] = applyDamage(src, { state, rng: rng.split(state), allowed });
  }
  return frames;
}
