/**
 * The fixed-timestep driver.
 *
 * The simulation advances in fixed increments no matter what the frame rate is
 * doing. Time controls change how many ticks run per frame; they never change
 * the tick duration. A variable tick would make the physics frame-rate
 * dependent and would make a seeded replay produce different results on a
 * different machine, which is the property the whole determinism design rests
 * on.
 */

import { TICK_SECONDS } from './integrate.js';

export type TimeScale = 0 | 1 | 2 | 4;

export const TIME_SCALES: readonly TimeScale[] = [0, 1, 2, 4];

/**
 * The most ticks one frame may run.
 *
 * After a long stall — a breakpoint, a background tab — the accumulator holds
 * seconds of unrun time. Running all of it would stall again and accumulate
 * more, a spiral that never recovers. Losing simulated time is the better
 * failure.
 */
export const MAX_TICKS_PER_FRAME = 8;

export interface Loop {
  readonly tickSeconds: number;
  scale: TimeScale;
  /** Feed real elapsed seconds; returns how many fixed ticks to run now. */
  ticksFor(realSeconds: number): number;
  reset(): void;
}

export function makeLoop(tickSeconds: number = TICK_SECONDS): Loop {
  let accumulator = 0;

  return {
    tickSeconds,
    scale: 1 as TimeScale,

    ticksFor(realSeconds: number): number {
      // Paused banks nothing. Unpausing after a minute must not fast-forward a
      // minute of simulation.
      if (this.scale === 0) {
        accumulator = 0;
        return 0;
      }

      accumulator += realSeconds * this.scale;

      let ticks = Math.floor(accumulator / tickSeconds);
      accumulator -= ticks * tickSeconds;

      if (ticks > MAX_TICKS_PER_FRAME) {
        ticks = MAX_TICKS_PER_FRAME;
        // Drop the backlog outright rather than paying it off over later
        // frames, which would just prolong the stall.
        accumulator = 0;
      }

      return ticks;
    },

    reset(): void {
      accumulator = 0;
    },
  };
}
