import { createGrid, type Grid } from './grid.ts';
import { createRng, type Rng } from './rng.ts';

export const SIDE_A = 0;
export const SIDE_B = 1;
export const WINNER_NONE = -1;
export const WINNER_DRAW = 2;

/** Struct-of-arrays battle state. Index i is one unit across every array. */
export interface World {
  tick: number;
  maxTicks: number;
  width: number;
  height: number;
  count: number;

  side: Uint8Array;
  cls: Uint8Array;
  alive: Uint8Array;

  x: Float64Array;
  y: Float64Array;
  /** Heading as a unit vector. The sim never needs an angle. */
  hx: Float64Array;
  hy: Float64Array;
  speed: Float64Array;
  hp: Float64Array;

  target: Int32Array;
  retarget: Int32Array;
  cooldown: Int32Array;
  lastShotTick: Int32Array;
  shotTarget: Int32Array;
  shotHit: Uint8Array;

  /** Scratch for the two-phase tick: decisions read start-of-tick state, then all units move. */
  nextHx: Float64Array;
  nextHy: Float64Array;
  nextSpeed: Float64Array;
  pendingDamage: Float64Array;
  corrX: Float64Array;
  corrY: Float64Array;

  aliveBySide: Int32Array;
  ended: boolean;
  winner: number;

  rng: Rng;
  grid: Grid;
}

export function createWorld(capacity: number, width: number, height: number, seed: number, maxTicks: number): World {
  return {
    tick: 0,
    maxTicks,
    width,
    height,
    count: 0,
    side: new Uint8Array(capacity),
    cls: new Uint8Array(capacity),
    alive: new Uint8Array(capacity),
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    hx: new Float64Array(capacity),
    hy: new Float64Array(capacity),
    speed: new Float64Array(capacity),
    hp: new Float64Array(capacity),
    target: new Int32Array(capacity).fill(-1),
    retarget: new Int32Array(capacity),
    cooldown: new Int32Array(capacity),
    lastShotTick: new Int32Array(capacity).fill(-1000),
    shotTarget: new Int32Array(capacity).fill(-1),
    shotHit: new Uint8Array(capacity),
    nextHx: new Float64Array(capacity),
    nextHy: new Float64Array(capacity),
    nextSpeed: new Float64Array(capacity),
    pendingDamage: new Float64Array(capacity),
    corrX: new Float64Array(capacity),
    corrY: new Float64Array(capacity),
    aliveBySide: new Int32Array(2),
    ended: false,
    winner: WINNER_NONE,
    rng: createRng(seed),
    grid: createGrid(width, height, 250, capacity),
  };
}

export function addUnit(w: World, side: number, cls: number, x: number, y: number, hx: number, hy: number, hp: number): number {
  const i = w.count++;
  w.side[i] = side;
  w.cls[i] = cls;
  w.alive[i] = 1;
  w.x[i] = x;
  w.y[i] = y;
  w.hx[i] = hx;
  w.hy[i] = hy;
  w.hp[i] = hp;
  w.retarget[i] = i % 15;
  w.aliveBySide[side]++;
  return i;
}
