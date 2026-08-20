/**
 * The frame update — the seam five tested invariants meet at, and the one part
 * of the wave that had no test because it lived inside a Pixi ticker callback.
 *
 * Nothing here needs a GPU: `updateFrame` is arithmetic over sim state and
 * placement records, and `main.ts` is the only thing that turns its output into
 * sprites.
 */

import { describe, expect, it } from 'vitest';
import { buildPoiStack } from '../gen/celestial.js';
import { LOD_DIVISORS } from '../gen/lod.js';
import { binForHeading, headingForBin } from '../gen/rotate.js';
import { CRUISER_BODY, makeBody } from '../sim/body.js';
import { integrate, TICK_SECONDS } from '../sim/integrate.js';
import { makeLoop, MAX_TICKS_PER_FRAME } from '../sim/loop.js';
import { vec2 } from '../sim/math/vec2.js';
import { makeMoveOrder, steer } from '../sim/order.js';
import { makeRng } from '../sim/rng.js';
import { makeCamera, snappedCentre } from '../render/camera.js';
import { tierCorrection } from '../render/lodpivot.js';
import { makePlacement, placeLayer, tiledLayers } from '../render/parallax.js';
import { fitViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../render/viewport.js';
import {
  CROSSFADE_SECONDS, makeZoom, unitsPerPixel, ZOOM_LEVELS, type ZoomLevel,
} from '../render/zoom.js';
import { makeInput, type InputState } from './input.js';
import { makeFrameState, updateFrame, type FrameState } from './frame.js';

const FRAME = 1 / 60;

/**
 * A deliberately asymmetric pivot gap. Both components non-zero and of
 * different magnitude, so a correction that dropped an axis or swapped the two
 * would fail rather than coincidentally agree.
 */
const SHIP_PIVOT_OFFSET = vec2(-3, 7);

function state(over: { zoom?: ZoomLevel; layers?: boolean } = {}): FrameState {
  const body = makeBody(CRUISER_BODY);
  const layers = over.layers === false
    ? []
    : tiledLayers(
        buildPoiStack('graveyard', VIRTUAL_WIDTH, VIRTUAL_HEIGHT, makeRng('frame')),
        VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
      );
  return makeFrameState({
    body,
    camera: makeCamera(body.position),
    zoom: makeZoom(over.zoom ?? 1),
    loop: makeLoop(),
    viewport: fitViewport(VIRTUAL_WIDTH * 2, VIRTUAL_HEIGHT * 2),
    layers,
    shipPivotOffset: SHIP_PIVOT_OFFSET,
  });
}

const idle = (): InputState => makeInput();

/** Normalises -0 to 0; Math.round(-0.1) is -0 and toBe uses Object.is. */
const z = (n: number): number => n + 0;

/** Runs `frames` frames of `dt` with no input. */
function run(s: FrameState, frames: number, dt = FRAME): void {
  for (let i = 0; i < frames; i++) updateFrame(s, idle(), dt);
}

describe('the fixed timestep', () => {
  it('never gives integrate anything but the loop tick duration', () => {
    // The whole determinism design rests on this. Rather than spy on integrate,
    // reproduce the sim independently at exactly TICK_SECONDS and require the
    // body to land in the same place to full float precision — which it can
    // only do if every tick was that length. The frames are deliberately
    // ragged and none of them is a whole tick: a frame of exactly 1/60 would
    // let `integrate(body, control, dt)` pass by coincidence.
    const s = state();
    // Under a standing order, so the body is actually integrating something —
    // at rest the control is neutral and any tick length gives the same
    // (unmoved) answer.
    s.order = makeMoveOrder(vec2(900, -400));
    const reference = makeBody(CRUISER_BODY);
    const referenceOrder = makeMoveOrder(vec2(900, -400));
    let ticks = 0;

    for (let i = 0; i < 240; i++) {
      ticks += updateFrame(s, idle(), 0.0173 + (i % 7) * 0.0011).ticks;
    }
    expect(ticks).toBeGreaterThan(200);
    for (let i = 0; i < ticks; i++) {
      integrate(reference, steer(reference, referenceOrder), TICK_SECONDS);
    }

    expect(s.loop.tickSeconds).toBe(TICK_SECONDS);
    expect(reference.position.x).toBeGreaterThan(100);
    expect(s.body.position.x).toBe(reference.position.x);
    expect(s.body.position.y).toBe(reference.position.y);
    expect(s.body.heading).toBe(reference.heading);
  });

  it('puts a ship in the same place however the same second is cut into frames', () => {
    // A frame-rate dependent tick would show up here as divergence.
    const fast = state();
    const slow = state();
    const order = { moveTarget: vec2(900, 300), zoomRequest: null, zoomStep: 0, timeScale: null };
    updateFrame(fast, { ...order }, FRAME);
    updateFrame(slow, { ...order }, FRAME);

    for (let i = 0; i < 60 * 5; i++) updateFrame(fast, idle(), FRAME);
    for (let i = 0; i < 50; i++) updateFrame(slow, idle(), 0.1);

    expect(fast.body.position.x).toBeCloseTo(slow.body.position.x, 9);
    expect(fast.body.position.y).toBeCloseTo(slow.body.position.y, 9);
  });

  it('caps a monstrous frame rather than running the whole backlog', () => {
    const s = state();
    expect(updateFrame(s, idle(), 30).ticks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
  });

  it('runs no ticks for a frame shorter than one tick', () => {
    expect(updateFrame(state(), idle(), TICK_SECONDS / 4).ticks).toBe(0);
  });

  it('runs no ticks while paused, but still advances the render', () => {
    // Pausing must not freeze the crossfade or the camera — the spec's
    // "visible feedback within 100 ms" does not exempt a paused game.
    const s = state();
    const out = updateFrame(
      s, { moveTarget: null, zoomRequest: 3, zoomStep: 0, timeScale: 0 }, FRAME,
    );
    expect(out.ticks).toBe(0);
    expect(out.current.tier).toBe(3);
    expect(out.previous).not.toBeNull();
  });
});

describe('zoom level to LOD tier', () => {
  it('shows the tier bound to the level, at every level', () => {
    for (const level of ZOOM_LEVELS) {
      const s = state({ zoom: level });
      const out = updateFrame(s, idle(), FRAME);
      expect(out.current.tier).toBe(level);
      expect(out.unitsPerPixel).toBe(LOD_DIVISORS[level]);
    }
  });

  it('reaches any level in one keypress and reports the tier immediately', () => {
    const s = state({ zoom: 0 });
    const out = updateFrame(
      s, { moveTarget: null, zoomRequest: 3, zoomStep: 0, timeScale: null }, FRAME,
    );
    expect(out.current.tier).toBe(3);
    expect(out.unitsPerPixel).toBe(32);
  });

  it('moves exactly one level per drained wheel frame, however many notches', () => {
    const s = state({ zoom: 0 });
    const out = updateFrame(
      s, { moveTarget: null, zoomRequest: null, zoomStep: 7, timeScale: null }, FRAME,
    );
    expect(out.current.tier).toBe(1);
  });
});

describe('the rotation bin', () => {
  it('is the nose-up bin for the ship heading, quarter turn included', () => {
    const s = state();
    s.body.heading = 0.9;
    expect(updateFrame(s, idle(), FRAME).bin).toBe(binForHeading(0.9 + Math.PI / 2));
  });

  it('stays in range and sweeps every bin over a full revolution', () => {
    const s = state();
    const seen = new Set<number>();
    for (let i = 0; i < 256; i++) {
      s.body.heading = -Math.PI + (i / 256) * Math.PI * 2;
      const bin = updateFrame(s, idle(), FRAME).bin;
      expect(bin).toBeGreaterThanOrEqual(0);
      expect(bin).toBeLessThan(64);
      seen.add(bin);
    }
    expect(seen.size).toBe(64);
  });
});

describe('the crossfade', () => {
  it('is settled with no second sprite until the level changes', () => {
    const out = updateFrame(state(), idle(), FRAME);
    expect(out.previous).toBeNull();
    expect(out.current.alpha).toBe(1);
  });

  it('shows both tiers, with alphas that sum to one, during a transition', () => {
    const s = state({ zoom: 0 });
    updateFrame(s, { moveTarget: null, zoomRequest: 2, zoomStep: 0, timeScale: null }, FRAME);
    const out = updateFrame(s, idle(), CROSSFADE_SECONDS / 4);
    expect(out.previous).not.toBeNull();
    expect(out.current.tier).toBe(2);
    expect(out.previous!.tier).toBe(0);
    expect(out.current.alpha + out.previous!.alpha).toBeCloseTo(1, 9);
    expect(out.current.alpha).toBeGreaterThan(0);
    expect(out.current.alpha).toBeLessThan(1);
  });

  it('drops the second sprite once the fade is over', () => {
    const s = state({ zoom: 0 });
    updateFrame(s, { moveTarget: null, zoomRequest: 1, zoomStep: 0, timeScale: null }, FRAME);
    updateFrame(s, idle(), CROSSFADE_SECONDS);
    const out = updateFrame(s, idle(), FRAME);
    expect(out.previous).toBeNull();
    expect(out.current.alpha).toBe(1);
  });

  it('finishes inside the 100 ms feedback budget', () => {
    const s = state({ zoom: 0 });
    updateFrame(s, { moveTarget: null, zoomRequest: 3, zoomStep: 0, timeScale: null }, FRAME);
    const out = updateFrame(s, idle(), 0.1);
    expect(out.previous).toBeNull();
  });
});

describe("tier 3's pivot correction", () => {
  it('is applied to the tier 3 sprite and to nothing else', () => {
    const s = state({ zoom: 3 });
    s.body.heading = 0.7;
    const out = updateFrame(s, idle(), FRAME);

    const expected = tierCorrection(
      vec2(), SHIP_PIVOT_OFFSET, headingForBin(out.bin), out.unitsPerPixel,
    );
    // At WIDE the ship is at the centre of the canvas; the correction is the
    // only thing that can move it off it. At this level the correction happens
    // to round to zero — 32 units per pixel swallows a native-pixel gap, which
    // is exactly why lodpivot.ts scales by the *current* level rather than by
    // tier 3's own. The crossfade cases below are where it has teeth.
    expect(z(out.current.x - VIRTUAL_WIDTH / 2)).toBe(z(expected.x));
    expect(z(out.current.y - VIRTUAL_HEIGHT / 2)).toBe(z(expected.y));
  });

  it('leaves tiers 0-2 exactly on the unadjusted screen position', () => {
    for (const level of [0, 1, 2] as const) {
      const s = state({ zoom: level });
      s.body.heading = 0.7;
      const out = updateFrame(s, idle(), FRAME);
      expect(out.current.x).toBe(VIRTUAL_WIDTH / 2);
      expect(out.current.y).toBe(VIRTUAL_HEIGHT / 2);
    }
  });

  it('corrects only the tier 3 half of a crossfade out of WIDE', () => {
    // This is the case the correction exists for: two sprites on one anchor,
    // one of them pivoting on a different physical point of the ship.
    const s = state({ zoom: 3 });
    s.body.heading = 0.7;
    updateFrame(s, idle(), FRAME);
    updateFrame(s, { moveTarget: null, zoomRequest: 0, zoomStep: 0, timeScale: null }, FRAME);
    const out = updateFrame(s, idle(), CROSSFADE_SECONDS / 4);

    expect(out.current.tier).toBe(0);
    expect(out.previous!.tier).toBe(3);
    const expected = tierCorrection(
      vec2(), SHIP_PIVOT_OFFSET, headingForBin(out.bin), out.unitsPerPixel,
    );
    expect(z(out.previous!.x - out.current.x)).toBe(z(expected.x));
    expect(z(out.previous!.y - out.current.y)).toBe(z(expected.y));
    // And at CLOSE it is not zero, or the assertion above proves nothing.
    expect(Math.abs(expected.x) + Math.abs(expected.y)).toBeGreaterThan(0);
  });

  it('scales the correction with the level being rendered, not with tier 3', () => {
    // The gap is a fixed number of native pixels, so a finer level resolves
    // more of it. A correction that ignored unitsPerPixel would be identical
    // at every level, which is the bug this guards.
    const seen = new Set<string>();
    for (const level of ZOOM_LEVELS) {
      const s = state({ zoom: 3 });
      s.body.heading = 0.7;
      updateFrame(s, idle(), FRAME);
      updateFrame(
        s, { moveTarget: null, zoomRequest: level, zoomStep: 0, timeScale: null }, FRAME,
      );
      const out = updateFrame(s, idle(), CROSSFADE_SECONDS / 4);
      const from = out.previous ?? out.current;
      seen.add(`${from.x - out.current.x},${from.y - out.current.y}`);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('the ship on screen', () => {
  it('sits at the centre of the virtual canvas while it is not moving', () => {
    const out = updateFrame(state(), idle(), FRAME);
    expect(out.current.x).toBe(VIRTUAL_WIDTH / 2);
    expect(out.current.y).toBe(VIRTUAL_HEIGHT / 2);
  });

  it('lands on whole pixels at every zoom level, all through a flight', () => {
    for (const level of ZOOM_LEVELS) {
      const s = state({ zoom: level });
      updateFrame(
        s, { moveTarget: vec2(1234.5, -678.25), zoomRequest: null, zoomStep: 0, timeScale: null },
        FRAME,
      );
      for (let i = 0; i < 600; i++) {
        const out = updateFrame(s, idle(), FRAME);
        expect(Number.isInteger(out.current.x)).toBe(true);
        expect(Number.isInteger(out.current.y)).toBe(true);
      }
    }
  });

  it('leads the ship, so it does not stay pinned to the exact centre in flight', () => {
    // The camera leads in the direction of travel; a ship welded to the centre
    // would mean the follow is not running at all.
    const s = state();
    updateFrame(
      s, { moveTarget: vec2(3000, 0), zoomRequest: null, zoomStep: 0, timeScale: null }, FRAME,
    );
    run(s, 300);
    expect(s.body.position.x).toBeGreaterThan(50);
    expect(updateFrame(s, idle(), FRAME).current.x).toBeLessThan(VIRTUAL_WIDTH / 2);
  });
});

describe('the camera centre', () => {
  it('is the follow position snapped to the current zoom grid', () => {
    const s = state({ zoom: 2 });
    updateFrame(
      s, { moveTarget: vec2(777, -333), zoomRequest: null, zoomStep: 0, timeScale: null }, FRAME,
    );
    run(s, 120);
    const out = updateFrame(s, idle(), FRAME);
    expect(out.centre).toEqual(snappedCentre(vec2(), s.camera, unitsPerPixel(2)));
    expect(Math.abs(out.centre.x % 8)).toBe(0);
  });
});

describe('the parallax layers', () => {
  it('reports one placement per layer, in the order given', () => {
    const s = state();
    const out = updateFrame(s, idle(), FRAME);
    expect(out.layers.length).toBe(s.layers.length);
    out.layers.forEach((p, i) => {
      expect(p).toEqual(placeLayer(makePlacement(), s.layers[i]!, out.centre, out.unitsPerPixel));
    });
  });

  it('keeps reporting them correctly after a long flight and a zoom change', () => {
    const s = state();
    updateFrame(
      s, { moveTarget: vec2(4000, 1500), zoomRequest: null, zoomStep: 0, timeScale: null }, FRAME,
    );
    run(s, 900);
    const out = updateFrame(
      s, { moveTarget: null, zoomRequest: 0, zoomStep: 0, timeScale: null }, FRAME,
    );
    out.layers.forEach((p, i) => {
      expect(p).toEqual(placeLayer(makePlacement(), s.layers[i]!, out.centre, out.unitsPerPixel));
      expect(Number.isInteger(p.offsetX)).toBe(true);
    });
  });

  it('copes with a stack that has no layers at all', () => {
    expect(updateFrame(state({ layers: false }), idle(), FRAME).layers.length).toBe(0);
  });
});

describe('input', () => {
  it('turns a move target into a standing order the ship keeps executing', () => {
    const s = state();
    updateFrame(
      s, { moveTarget: vec2(600, 0), zoomRequest: null, zoomStep: 0, timeScale: null }, FRAME,
    );
    expect(s.order).not.toBeNull();
    run(s, 60 * 45);
    expect(Math.hypot(s.body.position.x - 600, s.body.position.y)).toBeLessThan(50);
  });

  it('applies the time scale to the loop', () => {
    const s = state();
    const out = updateFrame(
      s, { moveTarget: null, zoomRequest: null, zoomStep: 0, timeScale: 4 }, TICK_SECONDS,
    );
    expect(s.loop.scale).toBe(4);
    expect(out.ticks).toBe(4);
  });
});

describe('allocation discipline', () => {
  it('rewrites one output record rather than making a new one each frame', () => {
    const s = state();
    const a = updateFrame(s, idle(), FRAME);
    const b = updateFrame(s, idle(), FRAME);
    expect(b).toBe(a);
    expect(b.centre).toBe(a.centre);
    expect(b.layers[0]).toBe(a.layers[0]);
  });
});
