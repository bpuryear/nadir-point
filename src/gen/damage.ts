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
 *   destroyed  the outline itself tears at a handful of bites, and blown bands
 *              are heavily scorched but keep scorched spars and decking behind
 *              rather than going empty — a hulk you could still fly up to and
 *              cut apart, not a silhouette eaten down to a ghost outline
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
 *   torn edges         a handful of bounded bites out of the boundary itself
 *
 * A frame is built by layering stages (damaged, then critical, then
 * destroyed) on top of one another rather than rolling each state's damage
 * independently from the source sprite. Every stage only removes pixels or
 * recolours ones that survive — never restores anything a lower stage
 * cleared — and each stage draws from a child stream named after the stage
 * itself (`spec.rng.split('critical-stage')`, not `spec.rng` directly), which
 * `Rng.split` derives purely from the seed string rather than from how much
 * of the parent has been consumed. So asking for `'critical'` and asking for
 * `'destroyed'` from *the same* `spec.rng` reproduce bit-for-bit the same
 * damaged and critical stages before destroyed's own stage adds anything —
 * `destroyed` is a superset of `critical`'s pixel loss by construction, not
 * by tuning severity numbers and hoping the random band picks cooperate. That
 * is what makes "opaque count is monotonically non-increasing" a guarantee
 * instead of a thing that happens to hold for the seeds in the test suite.
 * The cost is the one thing the previous per-state-split design bought:
 * inserting a new stage between two existing ones would now shift what every
 * later stage draws. `DAMAGE_STATES` is a closed, ordered list of four; that
 * risk is accepted deliberately here in exchange for the monotonicity proof.
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

/** The three non-intact states, in the order their stages layer on. */
const STAGE_ORDER: readonly Exclude<DamageState, 'intact'>[] = [
  'damaged', 'critical', 'destroyed',
];

export interface DamageSpec {
  state: DamageState;
  rng: Rng;
  allowed: readonly Rgba[];
  /** Plate bands, when the sprite has them. Modules and debris do not. */
  plates?: readonly PlateBand[];
}

interface StageDelta {
  /** Number of *additional* blast centres this stage scorches outward from. */
  blastCount: number;
  /** Radius, in pixels, past which a blast's scorch chance reaches zero. */
  blastRadius: number;
  /** Chance any still-lit emissive goes dark at this stage. */
  lightsOutChance: number;
  /** Additional plate bands (or breach clusters) blown out at this stage. */
  breachAdd: number;
  /**
   * Whether bands blown *at this stage* keep scorched spars and decking
   * behind instead of going fully empty. Only `destroyed` sets this:
   * `critical`'s clean gutting is the escalation step that reads as
   * "breached," and a wreck one step worse than that should still hold
   * together, not vanish. Bands a lower stage already blew stay however that
   * stage left them — this only governs new bands added at this stage.
   */
  retainStructure: boolean;
  /** Number of ragged bites this stage chews out of the outline. */
  tearCount: number;
  /** Radius, in pixels, of each bite. */
  tearRadius: number;
  /**
   * Whether this stage sheds an entire end plate band — every pixel, rim
   * included, not just the interior `blowPlateBands` leaves standing. Only
   * `destroyed` sets this. A gutted-but-rimmed band (what `breachAdd` alone
   * produces) still holds the ship's original length and upright proportions;
   * "destroyed" has to cost the hull actual mass, not just texture, or it
   * reads as "scorched but functional" rather than "wreck". Shedding a whole
   * end band is what a reviewer's bounding-box-height measurement is meant to
   * catch changing.
   */
  shedEnd: boolean;
}

// Cumulative severity by `destroyed`, once every prior stage has stacked, is
// the same shape the original single-shot design had (4 blasts, radius 7, 2
// bands fully gutted, by critical; heavier scorch and 2 more bands on top by
// destroyed) — this table holds each stage's *increment*, not the running
// total.
const STAGE_DELTA: Readonly<Record<Exclude<DamageState, 'intact'>, StageDelta>> = {
  damaged:   { blastCount: 3, blastRadius: 6, lightsOutChance: 0.5, breachAdd: 0, retainStructure: false, tearCount: 0,  tearRadius: 0, shedEnd: false },
  critical:  { blastCount: 1, blastRadius: 7, lightsOutChance: 1,   breachAdd: 2, retainStructure: false, tearCount: 0,  tearRadius: 0, shedEnd: false },
  // Heavier scorch than the old build's per-state total, since "worse than
  // critical" is no longer carried by hollowing more bands out completely —
  // see `retainStructure` above. Two things change the outline itself, both
  // only at `destroyed`: `shedEnd` clears one whole end plate band (rim
  // included, not just interior — see `shedEndBand`), which is what actually
  // shortens the hull's bounding box instead of merely texturing it; a much
  // heavier `tearEdges` pass (up from a token 6/4) then chews ragged bites
  // both around that fresh amputation and along the rest of the silhouette,
  // so the loss doesn't read as one clean rectangular crop. Not an
  // independent 30%-per-pixel roll across the whole perimeter — that per-pixel
  // roll was what turned a blown band's surviving rim into a dotted line
  // indistinguishable from a marching-ants selection outline.
  //
  // `breachAdd` dropped from 2 to 1 here (critical still blows 2) now that
  // `shedEnd` also spends a whole band: unchanged, the two mechanisms
  // together could interior-gut-or-clear every band on a hull with only 3-5
  // of them, leaving nothing but spar/deck grate lines standing — measured at
  // 0-1% of intact opaque area on a corvette sample, indistinguishable from
  // the "ghost outline" regression a prior review already rejected. One fewer
  // band spent here keeps a solid reserve standing on the smaller size
  // classes without shrinking the cruiser-scale destruction the contact
  // sheet is judged against (verified below).
  destroyed: { blastCount: 3, blastRadius: 9, lightsOutChance: 1,   breachAdd: 1, retainStructure: true,  tearCount: 16, tearRadius: 6, shedEnd: true },
};

/** Radius of a fallback breach cluster, used only when no plate data is given. */
const BREACH_RADIUS = 6;

/**
 * Bite geometry (`tearCount`/`tearRadius` in `STAGE_DELTA`, and the seam bite
 * radius in `raggedenSeam`) is tuned in fixed pixel units against the
 * cruiser band this project reviews against most — roughly 50px wide,
 * 100-128px long. Applied unscaled to a corvette (as little as ~9px wide,
 * 24px long), a single configured bite radius can span the *entire* hull,
 * and a configured bite *count* at that radius reliably erases it — verified
 * directly: pre-scaling, a sample of destroyed corvettes measured 0-1% of
 * intact opaque area and 0-14% of intact height, i.e. the "eaten down to a
 * ghost outline" regression a prior review already rejected once, just
 * re-triggered by a different mechanism. Scaling both down with the hull's
 * own width/length keeps `destroyed` "structurally broken but still
 * substantial" at every size class the sweep covers, not only the one the
 * numbers were tuned against.
 */
const TEAR_REF_W = 50;
const TEAR_REF_H = 110;

function scaledTearRadius(radius: number, out: PixBuf): number {
  if (radius <= 0) return 0;
  const scale = Math.max(0.3, Math.min(1, out.w / TEAR_REF_W));
  return Math.max(2, Math.round(radius * scale));
}

function scaledTearCount(count: number, out: PixBuf): number {
  if (count <= 0) return 0;
  const scale = Math.max(0.3, Math.min(1, out.h / TEAR_REF_H));
  return Math.max(2, Math.round(count * scale));
}

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
  // the silhouette boundary is thin on one side by construction, and the
  // destroyed stage's edge-tearing pass can then eat that thin side whole,
  // splitting one blob into a big piece and a few stray fragments. Keeping
  // the centre off the edge keeps the blob's solid core clear of that
  // interaction; the blast can still reach the edge through its radius, this
  // only steers where it's anchored.
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
 * Blown plating: removes every interior pixel of the given plate bands. Edge
 * pixels of the band survive — that is what keeps the silhouette holding even
 * as a band is gutted, the same rule interior-only punching has always
 * followed, just applied to a whole band instead of scattered points.
 *
 * With `retainStructure`, a blown band is gutted but not emptied: two rows of
 * scorched decking (roughly a third and two-thirds down the band) and a spar
 * every few columns survive, recoloured to scorch rather than left at plate
 * colour. A wreck you could fly up to and cut apart still has ribs and deck
 * plate inside a breached band; an evenly-emptied rectangle does not. The
 * pattern is fixed (columns, thirds-of-band-height), not a per-pixel roll —
 * structured marks, same rule every damage mechanism in this file follows.
 */
function blowPlateBands(
  out: PixBuf,
  rng: Rng,
  bands: readonly PlateBand[],
  retainStructure: boolean,
  scorchDark: Rgba,
  scorchMid: Rgba,
): void {
  const snapshot = cloneBuf(out);
  const SPAR_PERIOD = 5;

  for (const band of bands) {
    const bandH = band.y1 - band.y0 + 1;
    const deckRows = new Set([
      band.y0 + Math.floor(bandH / 3),
      band.y0 + Math.floor((bandH * 2) / 3),
    ]);

    for (let y = band.y0; y <= band.y1; y++) {
      for (let x = 0; x < out.w; x++) {
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (!isInteriorPixel(snapshot, x, y)) continue;

        if (retainStructure && (deckRows.has(y) || x % SPAR_PERIOD === 0)) {
          setPx(out, x, y, rng.chance(0.5) ? scorchDark : scorchMid);
          continue;
        }
        setPx(out, x, y, EMPTY);
      }
    }
  }
}

/**
 * Carves `count` bounded, irregular bites centred on pixels drawn from
 * `candidates`, using the same blast-lobe construction as `scorchBlasts` so
 * each bite is a solid, connected notch rather than scattered pixels. Shared
 * by `tearEdges` (candidates = every boundary pixel in the sprite) and
 * `shedEndBand`'s seam-raggedening (candidates = boundary pixels local to a
 * freshly amputated end) so both read as the same kind of damage.
 *
 * Bites are clipped against `snapshot`, not `out` — every bite in the batch
 * is measured from the same pre-pass silhouette, so an early bite opening a
 * gap cannot make a later one in the same call tunnel through it into solid
 * interior mass.
 */
function carveRaggedBites(
  out: PixBuf,
  snapshot: PixBuf,
  rng: Rng,
  candidates: readonly { x: number; y: number }[],
  count: number,
  radius: number,
): void {
  if (count <= 0 || radius <= 0 || candidates.length === 0) return;

  for (let i = 0; i < count; i++) {
    const centre = rng.pick(candidates);
    const baseRadius = radius * rng.range(0.75, 1.0);
    const control: number[] = [];
    for (let k = 0; k < BLAST_LOBES; k++) control.push(baseRadius * rng.range(0.6, 1.15));
    const maxReach = baseRadius * 1.15;
    const reach = Math.ceil(maxReach);

    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > maxReach) continue;

        const x = centre.x + dx;
        const y = centre.y + dy;
        // Only bite pixels that were already boundary in the pre-tear frame —
        // this keeps a bite a shallow notch instead of tunnelling into solid
        // interior mass the moment a neighbouring pixel opens up.
        if (!isOpaque(getPx(snapshot, x, y)) || isInteriorPixel(snapshot, x, y)) continue;

        if (d <= lobeRadius(control, Math.atan2(dy, dx))) {
          setPx(out, x, y, EMPTY);
        }
      }
    }
  }
}

/**
 * Chews a handful of bounded, irregular bites out of the outline — reuses the
 * blast-lobe construction so a bite is a solid, connected notch rather than
 * scattered pixels, applied only to boundary pixels so it stays a torn edge
 * instead of eating into the hull's mass. This replaces an earlier
 * independent-30%-per-pixel roll across every edge pixel in the sprite: that
 * roll read fine on its own, but stacked on top of blown plate bands it left
 * a blown band's surviving rim as a dotted line — indistinguishable from a
 * marching-ants selection outline rather than battle damage.
 */
function tearEdges(out: PixBuf, rng: Rng, count: number, radius: number): void {
  if (count <= 0 || radius <= 0) return;

  const snapshot = cloneBuf(out);
  const edges: { x: number; y: number }[] = [];
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      if (!isOpaque(getPx(snapshot, x, y))) continue;
      if (isInteriorPixel(snapshot, x, y)) continue;
      edges.push({ x, y });
    }
  }
  carveRaggedBites(out, snapshot, rng, edges, count, radius);
}

/**
 * Shears off one whole end plate band — every pixel, rim included, not just
 * the interior `blowPlateBands` leaves standing — so the hull actually loses
 * length and mass at `destroyed` instead of only gaining texture. This is
 * what makes a "destroyed" bounding box measurably shorter than "intact":
 * blown-but-rimmed bands (`breachAdd`) keep the ship's full original extent,
 * which is the exact "same height, same upright stance" a reviewer flagged
 * as reading like graffiti on an otherwise-intact hull rather than a wreck.
 *
 * Picks bow or stern at random (`rng.chance(0.5)`) rather than always the
 * same end, so the amputation shows up as a genuine structural loss across
 * the sprite population rather than a fixed "always missing the nose" tell.
 * Never sheds the last remaining band — a hull must still exist after
 * `destroyed`.
 *
 * The cut itself is not left clean: `raggedenSeam` immediately carves a
 * handful of bounded bites out of the fresh boundary it creates, so the loss
 * reads as a torn stump, not a rectangular crop that could be mistaken for a
 * canvas bug.
 */
function shedEndBand(out: PixBuf, rng: Rng, bands: readonly PlateBand[]): void {
  // `breachAdd` across `critical` and `destroyed` already interior-guts up to
  // three bands by the time this runs. On a hull with only 3-4 total plate
  // bands (a corvette's minimum) that alone touches nearly every band, and
  // shedding a whole one on top measured out to 0-1% of intact opaque area —
  // the exact "eaten down to a ghost outline" regression this feature exists
  // to avoid, just reached by a different route. Requiring a few spare bands
  // keeps at least one solid, unbreached band standing after the shed on any
  // hull large enough to have one; smaller hulls stay exactly as damaged as
  // `breachAdd` alone already leaves them, unchanged from before this pass.
  if (bands.length < 5) return;

  const shedBow = rng.chance(0.5);
  const target = shedBow ? bands[0]! : bands[bands.length - 1]!;

  for (let y = target.y0; y <= target.y1; y++) {
    for (let x = 0; x < out.w; x++) {
      if (isOpaque(getPx(out, x, y))) setPx(out, x, y, EMPTY);
    }
  }

  raggedenSeam(out, rng, shedBow ? target.y1 + 1 : target.y0 - 1, shedBow, scaledTearRadius(4, out));
}

/** How many rows deep of the surviving hull, past a fresh amputation, count
 * as "local to the seam" for `raggedenSeam`'s bite candidates. */
const SEAM_DEPTH = 6;

/**
 * Carves a handful of bites out of the boundary rows immediately behind a
 * fresh amputation (see `shedEndBand`), biased to land near the seam rather
 * than anywhere on the sprite's full perimeter — the general `tearEdges` pass
 * later in the same stage samples the *whole* boundary roughly uniformly, and
 * a seam is usually a small fraction of that by pixel count, so without this
 * bias it would read as one suspiciously straight cut most of the time
 * instead of a torn stump.
 */
function raggedenSeam(out: PixBuf, rng: Rng, seamY: number, seamBelow: boolean, radius: number): void {
  const snapshot = cloneBuf(out);
  const lo = seamBelow ? seamY : Math.max(0, seamY - SEAM_DEPTH);
  const hi = seamBelow ? Math.min(out.h - 1, seamY + SEAM_DEPTH) : seamY;

  const local: { x: number; y: number }[] = [];
  for (let y = lo; y <= hi; y++) {
    for (let x = 0; x < out.w; x++) {
      if (!isOpaque(getPx(snapshot, x, y))) continue;
      if (isInteriorPixel(snapshot, x, y)) continue;
      local.push({ x, y });
    }
  }

  const count = 3 + rng.int(3); // 3-5 bites
  carveRaggedBites(out, snapshot, rng, local, count, radius);
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

  const { allowed, plates } = spec;
  const out = cloneBuf(src);

  // Scorch palette: the dark end of the warm ramp, snapped into whatever the
  // caller allows so a faction lock is never broken by damage.
  const scorchDark = snapToPalette(WARM[1]!, allowed);
  const scorchMid = snapToPalette(WARM[2]!, allowed);

  const targetIdx = STAGE_ORDER.indexOf(spec.state as Exclude<DamageState, 'intact'>);
  // Plate bands a lower stage has already blown are removed from the pool so
  // a later stage's `breachAdd` always lands on fresh bands.
  const remainingPlates = plates ? [...plates] : [];

  for (let i = 0; i <= targetIdx; i++) {
    const stageName = STAGE_ORDER[i]!;
    const delta = STAGE_DELTA[stageName];
    // Derived from the seed string, not the parent's consumed state (see
    // `Rng.split`), so this stage draws bit-for-bit the same numbers whether
    // it is running as the last stage of a `'critical'` frame or a
    // mid-sequence stage of a `'destroyed'` one built from the same `rng`.
    const stageRng = spec.rng.split(`${stageName}-stage`);

    // Running lights: darken whatever is still lit by this stage's chance.
    // This runs before this stage's own scorch blasts so those blasts never
    // re-touch a pixel this pass already resolved.
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const c = getPx(out, x, y);
        if (isOpaque(c) && isEmissive(c) && stageRng.chance(delta.lightsOutChance)) {
          setPx(out, x, y, scorchDark);
        }
      }
    }

    scorchBlasts(out, stageRng, delta.blastCount, delta.blastRadius, scorchDark, scorchMid);

    if (delta.breachAdd > 0) {
      if (remainingPlates.length > 0) {
        const chosen = pickDistinct(stageRng, remainingPlates, delta.breachAdd);
        blowPlateBands(out, stageRng, chosen, delta.retainStructure, scorchDark, scorchMid);
        for (const band of chosen) {
          const idx = remainingPlates.indexOf(band);
          if (idx >= 0) remainingPlates.splice(idx, 1);
        }
      } else {
        punchBreachClusters(out, stageRng, delta.breachAdd, BREACH_RADIUS);
      }
    }

    // Shed before the general tear pass, not after: shedding creates a fresh
    // amputation edge, and the wider `tearEdges` sweep that follows should be
    // free to gnaw at that new edge along with the rest of the silhouette
    // rather than always running on a snapshot that predates it.
    if (delta.shedEnd && plates && plates.length > 0) {
      shedEndBand(out, stageRng, plates);
    }

    tearEdges(out, stageRng, scaledTearCount(delta.tearCount, out), scaledTearRadius(delta.tearRadius, out));
  }

  return out;
}

export function damageFrames(
  src: PixBuf,
  rng: Rng,
  allowed: readonly Rgba[],
  plates?: readonly PlateBand[],
): Readonly<Record<DamageState, PixBuf>> {
  // Every state pulls from the *same* child stream, not one split per state.
  // That is what lets `applyDamage`'s per-stage splits line up across states
  // — the monotonicity guarantee described at the top of this file only
  // holds when 'critical' and 'destroyed' are asked to build on the same
  // `rng` seed, the way they are here.
  const shared = rng.split('damage');
  const frames = {} as Record<DamageState, PixBuf>;
  for (const state of DAMAGE_STATES) {
    // `plates` is spread in only when given — exactOptionalPropertyTypes
    // forbids an explicit `plates: undefined`.
    frames[state] = applyDamage(src, { state, rng: shared, allowed, ...(plates ? { plates } : {}) });
  }
  return frames;
}
