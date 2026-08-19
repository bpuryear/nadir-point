import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from './integrate.js';
import { makeLoop, MAX_TICKS_PER_FRAME, TIME_SCALES } from './loop.js';

describe('fixed timestep', () => {
  it('runs one tick per tick-length of real time at 1x', () => {
    const loop = makeLoop();
    expect(loop.ticksFor(TICK_SECONDS)).toBe(1);
  });

  it('accumulates fractional time rather than dropping it', () => {
    // Frame times never divide evenly into ticks. Dropping the remainder would
    // make the sim run slow by a few percent forever.
    const loop = makeLoop();
    const third = TICK_SECONDS / 3;
    expect(loop.ticksFor(third)).toBe(0);
    expect(loop.ticksFor(third)).toBe(0);
    expect(loop.ticksFor(third)).toBe(1);
  });

  it('runs several ticks for a long frame', () => {
    const loop = makeLoop();
    expect(loop.ticksFor(TICK_SECONDS * 4)).toBe(4);
  });

  it('never changes its tick duration', () => {
    const loop = makeLoop();
    const before = loop.tickSeconds;
    loop.scale = 4;
    loop.ticksFor(1);
    expect(loop.tickSeconds).toBe(before);
  });
});

describe('time controls', () => {
  it('offers pause, 1x, 2x and 4x', () => {
    expect(TIME_SCALES).toEqual([0, 1, 2, 4]);
  });

  it('runs no ticks while paused', () => {
    const loop = makeLoop();
    loop.scale = 0;
    expect(loop.ticksFor(TICK_SECONDS * 10)).toBe(0);
  });

  it('does not bank time while paused', () => {
    // Unpausing after a minute must not fast-forward a minute of simulation.
    const loop = makeLoop();
    loop.scale = 0;
    loop.ticksFor(60);
    loop.scale = 1;
    expect(loop.ticksFor(TICK_SECONDS)).toBe(1);
  });

  it('runs proportionally more ticks at higher scales', () => {
    // frame is deliberately small enough that scale x frame stays well under
    // MAX_TICKS_PER_FRAME — this test is about the scale multiplier, not the
    // death-spiral cap (that invariant has its own tests below). At frame =
    // TICK_SECONDS * 3, a 4x scale would need 12 ticks, which the cap (8)
    // would clamp, breaking the proportionality being asserted here for a
    // reason unrelated to what this test checks.
    const one = makeLoop();
    const four = makeLoop();
    four.scale = 4;
    const frame = TICK_SECONDS;
    expect(four.ticksFor(frame)).toBe(one.ticksFor(frame) * 4);
  });
});

describe('the death spiral guard', () => {
  it('caps ticks for an enormous frame', () => {
    // A long stall must not queue thousands of ticks, which would stall harder
    // and queue more. Better to lose simulated time than to lock up.
    const loop = makeLoop();
    expect(loop.ticksFor(10)).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
  });

  it('discards the backlog rather than paying it off later', () => {
    const loop = makeLoop();
    loop.ticksFor(10);
    expect(loop.ticksFor(TICK_SECONDS)).toBe(1);
  });
});

describe('reset', () => {
  it('clears accumulated time', () => {
    const loop = makeLoop();
    loop.ticksFor(TICK_SECONDS * 0.9);
    loop.reset();
    expect(loop.ticksFor(TICK_SECONDS * 0.5)).toBe(0);
  });
});

describe('negative real time', () => {
  // A clock correction, a rewound or stale timestamp, or an upstream bug can
  // hand ticksFor a negative delta. The cap guards runaway positive input;
  // this guards the symmetric case, which is just as capable of breaking the
  // "ticksFor returns a count" contract if left unchecked.

  it('returns zero ticks for a negative delta', () => {
    const loop = makeLoop();
    expect(loop.ticksFor(-5)).toBe(0);
  });

  it('does not corrupt the accumulator — a negative frame leaves the next normal frame unaffected', () => {
    // The dangerous version of this bug is a clamp applied only to the return
    // value, after the negative delta has already been folded into the
    // accumulator. That would still leave the accumulator wrong and would
    // only show up once a later frame's remainder crosses a tick boundary
    // differently than it should — exactly the kind of latent corruption an
    // assertion on the very next call's raw tick count could still miss by
    // coincidence. -2.5 * TICK_SECONDS is not a whole multiple of
    // tickSeconds, so an unclamped implementation leaves a 0.5-tick remainder
    // banked; following up with a 0.6-tick frame (0.5 + 0.6 = 1.1 -> 1 tick)
    // would then diverge from a clean loop fed the same 0.6-tick frame
    // (0 + 0.6 -> 0 ticks), which is what this test checks for.
    const withNegativeFrame = makeLoop();
    withNegativeFrame.ticksFor(-2.5 * TICK_SECONDS);
    const afterNegative = withNegativeFrame.ticksFor(0.6 * TICK_SECONDS);

    const clean = makeLoop();
    const withoutNegativeFrame = clean.ticksFor(0.6 * TICK_SECONDS);

    expect(afterNegative).toBe(withoutNegativeFrame);
  });
});
