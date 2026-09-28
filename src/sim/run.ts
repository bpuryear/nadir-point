import { hashWorld } from './hash.ts';
import { createTestBattle } from './scenario.ts';
import { step } from './step.ts';

export interface BattleCheck {
  seed: number;
  perSide: number;
  checkpoints: Record<string, string>;
  finalTick: number;
  finalHash: string;
  winner: number;
  alive: [number, number];
}

export const CHECK_TICKS = [1, 30, 300, 900, 1800] as const;
export const CHECK_SEEDS = [1, 7, 20260928] as const;

/** Run one test battle to the end and record hashes along the way. */
export function runBattleCheck(seed: number, perSide = 250): BattleCheck {
  const w = createTestBattle(seed, perSide);
  const checkpoints: Record<string, string> = {};
  let next = 0;
  while (!w.ended) {
    step(w);
    if (next < CHECK_TICKS.length && w.tick === CHECK_TICKS[next]) {
      checkpoints[w.tick] = hashWorld(w);
      next++;
    }
  }
  return {
    seed,
    perSide,
    checkpoints,
    finalTick: w.tick,
    finalHash: hashWorld(w),
    winner: w.winner,
    alive: [w.aliveBySide[0], w.aliveBySide[1]],
  };
}
