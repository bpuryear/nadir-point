/**
 * One frame of the game, as arithmetic.
 *
 * This is everything the ticker used to do inline, minus the sprite writes. It
 * exists as a separate function because it is the only place where the fixed
 * timestep, tier selection, rotation-bin selection, crossfade bookkeeping and
 * tier 3's pivot correction all meet — five invariants that each have a tested
 * module behind them and that, wired together in a Pixi ticker callback, had no
 * test at all. Nothing here touches PixiJS or the DOM, so all five are reachable
 * from Node.
 *
 * The split is: `updateFrame` decides *what* should be on screen, `main.ts`
 * writes it to sprites. The renderer still never mutates sim state except
 * through `integrate`, which is called here and only here.
 */

import type { Layer } from '../gen/celestial.js';
import type { LodTier } from '../gen/lod.js';
import { binForHeading, headingForBin } from '../gen/rotate.js';
import type { Body } from '../sim/body.js';
import { integrate } from '../sim/integrate.js';
import type { Loop } from '../sim/loop.js';
import { vec2, type Vec2 } from '../sim/math/vec2.js';
import { makeMoveOrder, steer, type MoveOrder } from '../sim/order.js';
import { followBody, snappedCentre, type Camera } from '../render/camera.js';
import { tierCorrection } from '../render/lodpivot.js';
import { makePlacement, placeLayer, type LayerPlacement } from '../render/parallax.js';
import { worldToScreen, type Viewport } from '../render/viewport.js';
import {
  advanceZoom, crossfadeAlpha, lodTierFor, setZoom, stepZoom, unitsPerPixel, type ZoomState,
} from '../render/zoom.js';
import type { InputState } from './input.js';

/** Where one of the ship's two sprites goes, and which atlas it reads. */
export interface SpritePlacement {
  tier: LodTier;
  /** Virtual-canvas pixels, always whole. */
  x: number;
  y: number;
  alpha: number;
}

export interface FrameOutput {
  /** How many fixed ticks this frame ran. Zero is normal and not an error. */
  ticks: number;
  /** Rotation bin, 0-63. */
  bin: number;
  unitsPerPixel: number;
  /** The camera centre snapped to the current zoom's pixel grid. */
  centre: Vec2;
  current: SpritePlacement;
  /** The tier being faded out of, or null when the zoom is settled. */
  previous: SpritePlacement | null;
  /** One placement per layer, in the order the layers were given. */
  layers: readonly LayerPlacement[];
}

export interface FrameStateSpec {
  body: Body;
  camera: Camera;
  zoom: ZoomState;
  loop: Loop;
  viewport: Viewport;
  layers: readonly Layer[];
  /**
   * The fixed, ship-relative gap between tier 3's pivot and the one tiers 0-2
   * share (see render/lodpivot.ts). Computed once at boot from the ship's own
   * geometry.
   */
  shipPivotOffset: Vec2;
}

export interface FrameState extends FrameStateSpec {
  /** The order the ship is currently executing, or null. */
  order: MoveOrder | null;
  /**
   * Scratch, rewritten in place every frame so the hot path allocates nothing.
   * Read it and copy what you need; do not retain it across frames.
   */
  readonly out: FrameOutput;
  /**
   * Backing store for `out.previous`, which is null whenever no crossfade is
   * running. Kept here rather than allocated per transition.
   */
  readonly previousSlot: SpritePlacement;
}

export function makeFrameState(spec: FrameStateSpec): FrameState {
  return {
    ...spec,
    order: null,
    previousSlot: { tier: 0, x: 0, y: 0, alpha: 0 },
    out: {
      ticks: 0,
      bin: 0,
      unitsPerPixel: 1,
      centre: vec2(),
      current: { tier: 0, x: 0, y: 0, alpha: 1 },
      previous: null,
      layers: spec.layers.map(() => makePlacement()),
    },
  };
}

const _screen = vec2();
const _correction = vec2();

/**
 * Places one of the ship's sprites.
 *
 * Tier 3's frame is centred on a different physical point of the ship than
 * tiers 0-2 (see render/lodpivot.ts), so it — and only it — gets nudged. The
 * nudge depends on the ship's current bin angle and the *current* zoom scale,
 * not on tier 3's own coarse scale, which is why it cannot be a constant.
 */
function place(
  out: SpritePlacement,
  tier: LodTier,
  screenX: number,
  screenY: number,
  bin: number,
  unitsPerPixel: number,
  shipPivotOffset: Vec2,
): void {
  out.tier = tier;
  if (tier === 3) {
    tierCorrection(_correction, shipPivotOffset, headingForBin(bin), unitsPerPixel);
    out.x = screenX + _correction.x;
    out.y = screenY + _correction.y;
  } else {
    out.x = screenX;
    out.y = screenY;
  }
}

/**
 * Advances the simulation and works out what the frame should show.
 *
 * `dt` is real elapsed seconds since the last frame. It reaches the loop, the
 * zoom crossfade and the camera follow — and nothing else. In particular it
 * never reaches `integrate`, which is only ever given `loop.tickSeconds`: that
 * is what makes the physics frame-rate independent and a seeded replay
 * meaningful, and it is the single most important line in this file.
 */
export function updateFrame(state: FrameState, pending: InputState, dt: number): FrameOutput {
  const { out } = state;

  if (pending.moveTarget !== null) state.order = makeMoveOrder(pending.moveTarget);
  if (pending.zoomRequest !== null) setZoom(state.zoom, pending.zoomRequest);
  if (pending.zoomStep !== 0) stepZoom(state.zoom, pending.zoomStep);
  if (pending.timeScale !== null) state.loop.scale = pending.timeScale;

  // Simulation: fixed ticks only, never a tick sized from the frame.
  const ticks = state.loop.ticksFor(dt);
  for (let i = 0; i < ticks; i++) {
    integrate(state.body, steer(state.body, state.order), state.loop.tickSeconds);
  }

  // Render: reads the sim, writes nothing back to it.
  advanceZoom(state.zoom, dt);
  followBody(state.camera, state.body, dt);

  const upp = unitsPerPixel(state.zoom.level);
  snappedCentre(out.centre, state.camera, upp);

  // Bin 0 is the unrotated source, which is drawn nose-up; a body heading of 0
  // points along +x. Hence the quarter turn. If the ship renders a quarter turn
  // off, this sign is the first thing to check.
  const bin = binForHeading(state.body.heading + Math.PI / 2);
  worldToScreen(_screen, state.body.position, out.centre, upp, state.viewport);
  const screenX = Math.round(_screen.x);
  const screenY = Math.round(_screen.y);

  out.ticks = ticks;
  out.bin = bin;
  out.unitsPerPixel = upp;

  const alpha = crossfadeAlpha(state.zoom);
  place(out.current, lodTierFor(state.zoom.level), screenX, screenY, bin, upp, state.shipPivotOffset);
  out.current.alpha = state.zoom.from === null ? 1 : alpha;

  if (state.zoom.from === null) {
    out.previous = null;
  } else {
    place(
      state.previousSlot, lodTierFor(state.zoom.from),
      screenX, screenY, bin, upp, state.shipPivotOffset,
    );
    state.previousSlot.alpha = 1 - alpha;
    out.previous = state.previousSlot;
  }

  for (let i = 0; i < state.layers.length; i++) {
    placeLayer(out.layers[i]!, state.layers[i]!, out.centre, upp);
  }

  return out;
}
