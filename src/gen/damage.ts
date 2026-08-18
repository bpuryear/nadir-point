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
 *
 * Damage marks are structured, not per-pixel noise. Independent Bernoulli
 * draws per pixel produce salt-and-pepper speckle — every mark a 1-2px
 * singleton — no matter what probability you tune. "Scorched pixels, blown
 * plating, spark particles" reads as *marks*, so the mechanisms below pick a
 * handful of locations and spread outward from each one:
 *
 *   blast scorch     a few blast centres, radial falloff outward
 *   blown plating     whole plate bands' interiors, when the sprite has plate
 *                      structure (hulls do; modules and debris do not)
 *   breach clusters    the fallback for sprites with no plate structure —
 *                      clustered interior holes instead of scattered pinholes
 */

import type { Rng } from '../sim/rng.js';
import {
  cloneBuf, EMPTY, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import type { PlateBand } from './grammar/plates.js';
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
  /** Plate bands, when the sprite has them. Modules and debris do not. */
  plates?: readonly PlateBand[];
}

interface Severity {
  /** Number of blast centres to scorch outward from. */
  blastCount: number;
  /** Radius, in pixels, past which a blast's scorch chance reaches zero. */
  blastRadius: number;
  /** Fraction of emissives that go dark. */
  lightsOut: number;
  /** Plate bands (or, when there's no plate data, breach clusters) blown out. */
  breaches: number;
  /** Whether the outline itself may erode. */
  erodeEdges: boolean;
}

const SEVERITY: Readonly<Record<DamageState, Severity>> = {
  intact:    { blastCount: 0, blastRadius: 0, lightsOut: 0,   breaches: 0, erodeEdges: false },
  damaged:   { blastCount: 3, blastRadius: 6, lightsOut: 0.5, breaches: 0, erodeEdges: false },
  critical:  { blastCount: 4, blastRadius: 7, lightsOut: 1,   breaches: 2, erodeEdges: false },
  destroyed: { blastCount: 5, blastRadius: 8, lightsOut: 1,   breaches: 4, erodeEdges: true },
};

/** Radius of a fallback breach cluster, used only when no plate data is given. */
const BREACH_RADIUS = 6;

/** True when every eight-neighbour is opaque — safe to punch without touching the outline. */
function isInteriorPixel(buf: PixBuf, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isOpaque(getPx(buf, x + dx, y + dy))) return false;
    }
  }
  return true;
}

/** Angular control points a blast's outline is interpolated between. */
const BLAST_LOBES = 8;

/**
 * Radius at `angle` (radians), circularly interpolated between the blast's
 * lobe control points.
 */
function lobeRadius(control: readonly number[], angle: number): number {
  const n = control.length;
  const step = (2 * Math.PI) / n;
  const norm = (angle + Math.PI) / step;
  const i0 = Math.floor(norm) % n;
  const i1 = (i0 + 1) % n;
  const t = norm - Math.floor(norm);
  return control[i0]! * (1 - t) + control[i1]! * t;
}

/**
 * Scorches outward from `count` randomly chosen blast centres.
 *
 * Each blast fills every pixel within a radius that itself varies smoothly
 * by angle — solid, not a per-pixel coin flip. A per-pixel probabilistic
 * falloff was the first thing tried here, and even a steep, narrow one still
 * produces a scatter of one-off pixels in the transition band: plenty of
 * low-probability area, almost no two adjacent survivors, so a "gradual
 * falloff" reads right back as speckle. A blast is star-shaped from its own
 * centre by construction instead, which is what guarantees every pixel in it
 * connects back to every other — the irregular, lumpy edge comes from
 * varying *where* the solid boundary falls, not from whether any given pixel
 * survives a coin flip. Emissives are left alone — the running-lights pass
 * owns them.
 */
function scorchBlasts(
  out: PixBuf,
  rng: Rng,
  count: number,
  radius: number,
  scorchDark: Rgba,
  scorchMid: Rgba,
): void {
  if (count <= 0 || radius <= 0) return;

  // Centres prefer interior pixels over edge ones. A blast centred right on
  // the silhouette boundary is thin on one side by construction, and at
  // destroyed severity the independent edge-erosion pass can then eat that
  // thin side whole, splitting one blob into a big piece and a few stray
  // fragments. Keeping the centre off the edge keeps the blob's solid core
  // clear of that interaction; the blast can still reach the edge through its
  // radius, this only steers where it's anchored.
  const interior: { x: number; y: number }[] = [];
  const anyOpaque: { x: number; y: number }[] = [];
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const c = getPx(out, x, y);
      if (!isOpaque(c) || isEmissive(c)) continue;
      anyOpaque.push({ x, y });
      if (isInteriorPixel(out, x, y)) interior.push({ x, y });
    }
  }
  const candidates = interior.length > 0 ? interior : anyOpaque;
  if (candidates.length === 0) return;

  for (let i = 0; i < count; i++) {
    const centre = rng.pick(candidates);
    // Per-blast size jitter, so a group of blasts doesn't read as identical
    // stamped circles.
    const baseRadius = radius * rng.range(0.75, 1.0);
    const control: number[] = [];
    for (let k = 0; k < BLAST_LOBES; k++) control.push(baseRadius * rng.range(0.6, 1.15));
    const maxReach = baseRadius * 1.15;
    // Integer pixel offsets — dy/dx must land on whole pixels, so the bound
    // is rounded out to cover the (fractional) maxReach rather than being it.
    const reach = Math.ceil(maxReach);

    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > maxReach) continue;

        const x = centre.x + dx;
        const y = centre.y + dy;
        const c = getPx(out, x, y);
        if (!isOpaque(c) || isEmissive(c)) continue;

        if (d <= lobeRadius(control, Math.atan2(dy, dx))) {
          setPx(out, x, y, rng.chance(0.6) ? scorchDark : scorchMid);
        }
      }
    }
  }
}

/** Picks up to `count` distinct items from `items`, order randomised. */
function pickDistinct<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  const chosen: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = rng.int(pool.length);
    chosen.push(pool[idx]!);
    pool.splice(idx, 1);
  }
  return chosen;
}

/**
 * Blown plating: picks whole plate bands and removes every interior pixel in
 * their row range. Edge pixels of the band survive — that is what keeps the
 * silhouette holding even as a band is gutted, the same rule interior-only
 * punching has always followed, just applied to a whole band instead of
 * scattered points.
 */
function blowPlateBands(
  out: PixBuf,
  rng: Rng,
  plates: readonly PlateBand[],
  count: number,
): void {
  const snapshot = cloneBuf(out);
  const chosen = pickDistinct(rng, plates, count);
  for (const band of chosen) {
    for (let y = band.y0; y <= band.y1; y++) {
      for (let x = 0; x < out.w; x++) {
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (!isInteriorPixel(snapshot, x, y)) continue;
        setPx(out, x, y, EMPTY);
      }
    }
  }
}

/**
 * Fallback for sprites with no plate structure (modules, debris): clustered
 * interior holes around a few breach centres instead of the plate-band
 * mechanism, so they still degrade as readable breaches rather than speckle.
 */
function punchBreachClusters(out: PixBuf, rng: Rng, count: number, radius: number): void {
  const snapshot = cloneBuf(out);
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      if (isOpaque(getPx(snapshot, x, y)) && isInteriorPixel(snapshot, x, y)) {
        candidates.push({ x, y });
      }
    }
  }
  if (candidates.length === 0) return;

  for (let i = 0; i < count; i++) {
    const centre = rng.pick(candidates);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;

        const x = centre.x + dx;
        const y = centre.y + dy;
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (!isInteriorPixel(snapshot, x, y)) continue;

        const t = 1 - d / radius;
        if (rng.chance(t * t * 0.9)) setPx(out, x, y, EMPTY);
      }
    }
  }
}

export function applyDamage(src: PixBuf, spec: DamageSpec): PixBuf {
  if (spec.state === 'intact') return cloneBuf(src);

  const { rng, allowed, plates } = spec;
  const sev = SEVERITY[spec.state];
  const out = cloneBuf(src);

  // Scorch palette: the dark end of the warm ramp, snapped into whatever the
  // caller allows so a faction lock is never broken by damage.
  const scorchDark = snapToPalette(WARM[1]!, allowed);
  const scorchMid = snapToPalette(WARM[2]!, allowed);

  // Running lights die first and stay dead. This runs as its own pass so the
  // blast scorch below never re-touches a pixel this pass already resolved.
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const c = getPx(out, x, y);
      if (isOpaque(c) && isEmissive(c) && rng.chance(sev.lightsOut)) {
        setPx(out, x, y, scorchDark);
      }
    }
  }

  // Blast scorch: a handful of blast centres, radial falloff outward. This is
  // what produces connected marks instead of salt-and-pepper speckle.
  scorchBlasts(out, rng, sev.blastCount, sev.blastRadius, scorchDark, scorchMid);

  // Blown plating (or, without plate data, clustered breaches). Interior-only,
  // which is what preserves the bounding box at critical.
  if (sev.breaches > 0) {
    if (plates && plates.length > 0) {
      blowPlateBands(out, rng, plates, sev.breaches);
    } else {
      punchBreachClusters(out, rng, sev.breaches, BREACH_RADIUS);
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
  plates?: readonly PlateBand[],
): Readonly<Record<DamageState, PixBuf>> {
  const frames = {} as Record<DamageState, PixBuf>;
  for (const state of DAMAGE_STATES) {
    // A child stream per state, so adding a state later cannot change how the
    // existing ones look. `plates` is spread in only when given —
    // exactOptionalPropertyTypes forbids an explicit `plates: undefined`.
    frames[state] = applyDamage(src, {
      state, rng: rng.split(state), allowed, ...(plates ? { plates } : {}),
    });
  }
  return frames;
}
