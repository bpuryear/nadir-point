import { STANDARD_PATTERNS } from '../content/designs.ts';
import { EXERCISE_1, type ExerciseDef } from '../content/exercises.ts';
import { createBattle, type BattleSpec } from './battle.ts';
import { autoDeploy, type FleetOrder } from './deploy.ts';
import { hashWorld } from './hash.ts';
import { step } from './step.ts';
import { CRIPPLED, type World } from './world.ts';

export interface BattleCheck {
  name: string;
  seed: number;
  checkpoints: Record<string, string>;
  finalTick: number;
  finalHash: string;
  winner: number;
  onField: [number, number];
}

export const CHECK_TICKS = [1, 30, 300, 900, 1800, 3600] as const;

/** A battle spec for an exercise, given the player's fleet orders. */
export function exerciseBattle(ex: ExerciseDef, player: FleetOrder[], seed: number): BattleSpec {
  return {
    seed,
    width: ex.width,
    height: ex.height,
    maxSeconds: ex.maxSeconds,
    fleets: [
      { designs: player.map((o) => o.design), ships: autoDeploy(player, ex.playerZone, 0) },
      { designs: ex.enemy.map((o) => o.design), ships: autoDeploy(ex.enemy, ex.enemyZone, 1) },
    ],
  };
}

/** Standard patterns against standard patterns: broadside and bow fire, all hull classes. */
export function mirrorBattle(seed: number): BattleSpec {
  const fleet: FleetOrder[] = [
    { design: STANDARD_PATTERNS[2], count: 1 },
    { design: STANDARD_PATTERNS[1], count: 2 },
    { design: STANDARD_PATTERNS[0], count: 4 },
  ];
  const zoneA = { x0: 300, x1: 1600, y0: 600, y1: 3400 };
  const zoneB = { x0: 4400, x1: 5700, y0: 600, y1: 3400 };
  return {
    seed,
    width: 6000,
    height: 4000,
    maxSeconds: 480,
    fleets: [
      { designs: fleet.map((o) => o.design), ships: autoDeploy(fleet, zoneA, 0) },
      { designs: fleet.map((o) => o.design), ships: autoDeploy(fleet, zoneB, 1) },
    ],
  };
}

export const CHECK_BATTLES: readonly { name: string; spec: () => BattleSpec }[] = [
  { name: 'ex1-issued-1', spec: () => exerciseBattle(EXERCISE_1, EXERCISE_1.issued, 1) },
  { name: 'ex1-issued-7', spec: () => exerciseBattle(EXERCISE_1, EXERCISE_1.issued, 7) },
  { name: 'mirror-20260928', spec: () => mirrorBattle(20260928) },
];

export function runToEnd(w: World, onTick?: (w: World) => void): World {
  while (!w.ended) {
    step(w);
    onTick?.(w);
  }
  return w;
}

export function onFieldCount(w: World, side: number): number {
  let n = 0;
  for (let i = 0; i < w.count; i++) if (w.side[i] === side && w.status[i] < CRIPPLED) n++;
  return n;
}

/** Run one check battle to the end and record hashes along the way. */
export function runBattleCheck(name: string, spec: BattleSpec): BattleCheck {
  const w = createBattle(spec);
  const checkpoints: Record<string, string> = {};
  let next = 0;
  runToEnd(w, (world) => {
    if (next < CHECK_TICKS.length && world.tick === CHECK_TICKS[next]) {
      checkpoints[world.tick] = hashWorld(world);
      next++;
    }
  });
  return {
    name,
    seed: spec.seed,
    checkpoints,
    finalTick: w.tick,
    finalHash: hashWorld(w),
    winner: w.winner,
    onField: [onFieldCount(w, 0), onFieldCount(w, 1)],
  };
}
