/**
 * Reconciling tier 3's pivot with tiers 0-2's.
 *
 * `bakeRotations` always pivots a tier on its own source buffer's geometric
 * centre (see gen/rotate.ts's `scx`/`scy`). Tiers 0-2 are proportional
 * reductions of the same composite buffer (`gen/lod.ts`'s `reduceTier`), so
 * they all share one physical pivot: the composite buffer's own bbox centre.
 * Tier 3 (`silhouetteTier`) is generated fresh from the hull's profile alone,
 * independent of the composite's bounds — its own bbox centre is the hull's
 * centreline instead, which is a *different* physical point on the ship
 * whenever installed modules make the composite's union bounds asymmetric
 * (`compositeShip`'s own `centreX`/`centreY` exist precisely because that
 * asymmetry is the common case, not the exception).
 *
 * The two sprites share one screen anchor (`main.ts` draws both at the same
 * `screenX`/`screenY` with anchor 0.5/0.5), so without correction the ~80ms
 * Wide crossfade briefly shows two frames that agree on facing but disagree
 * on which point of the ship sits under that anchor — a jump whose size
 * depends on the *target* zoom level's `unitsPerPixel` (worst at the finest
 * levels, since the underlying native-pixel gap is fixed but a finer level
 * resolves more of it), not on tier 3's own coarse scale where the gap
 * happens to round away to nothing.
 *
 * `pivotOffset` is that fixed gap, in native (tier-0-scale) pixels: the
 * vector from tier 3's own pivot (the hull centreline) to the pivot tiers
 * 0-2 share (the composite's bbox centre). It only depends on the ship's
 * geometry, so it is computed once at boot.
 *
 * `tierCorrection` turns the fixed, ship-relative `pivotOffset` into a
 * screen-space nudge for tier 3's sprite at the ship's *current* heading and
 * the render's *current* zoom scale. The offset is ship-fixed, so it rotates
 * with the hull — a heading-independent constant nudge would only be correct
 * at one heading and wrong at every other, which is why this is not simply a
 * fixed pixel offset applied once. Adding this correction to tier 3's draw
 * position, and *only* tier 3's, makes it agree with tiers 0-2 on which
 * physical point of the ship sits under the shared anchor, at every heading
 * and every zoom level a Wide crossfade can reach into.
 */

import { rotate, vec2, type Vec2 } from '../sim/math/vec2.js';

/**
 * The vector from tier 3's own pivot (the hull centreline, `centreX`/`centreY`
 * as `compositeShip` reports them) to the pivot tiers 0-2 share (the
 * composite buffer's own bbox centre, `compositeWidth`/`compositeHeight`
 * halved) — in native, unrotated pixels.
 */
export function pivotOffset(
  compositeWidth: number, compositeHeight: number, centreX: number, centreY: number,
): Vec2 {
  return vec2(centreX - compositeWidth / 2, centreY - compositeHeight / 2);
}

/**
 * Rotates the fixed `offset` to the ship's current heading and scales it into
 * screen pixels at the current zoom level, rounded — the same whole-pixel
 * snapping every other sprite position in `main.ts` already applies. Reads
 * `offset` into locals before writing `out`, so `out` may alias a scratch
 * vector reused across frames.
 */
export function tierCorrection(out: Vec2, offset: Vec2, heading: number, unitsPerPixel: number): Vec2 {
  rotate(out, offset, heading);
  out.x = Math.round(out.x / unitsPerPixel);
  out.y = Math.round(out.y / unitsPerPixel);
  return out;
}
