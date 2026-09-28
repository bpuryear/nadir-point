import { CLASSES } from '../sim/classes.ts';
import type { World } from '../sim/world.ts';

// Per-unit layout of the render snapshot. prev* hold the state one tick
// earlier, so the renderer can interpolate between ticks.
export const S_X = 0;
export const S_Y = 1;
export const S_HX = 2;
export const S_HY = 3;
export const S_PX = 4;
export const S_PY = 5;
export const S_PHX = 6;
export const S_PHY = 7;
export const S_SIDE = 8;
export const S_CLS = 9;
export const S_ALIVE = 10;
export const S_HP = 11;
export const S_SHOT_TARGET = 12;
export const S_SHOT_AGE = 13;
export const S_SHOT_HIT = 14;
export const STRIDE = 15;

export interface PrevState {
  x: Float64Array;
  y: Float64Array;
  hx: Float64Array;
  hy: Float64Array;
}

export function createPrev(capacity: number): PrevState {
  return {
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    hx: new Float64Array(capacity),
    hy: new Float64Array(capacity),
  };
}

export function savePrev(w: World, p: PrevState): void {
  p.x.set(w.x);
  p.y.set(w.y);
  p.hx.set(w.hx);
  p.hy.set(w.hy);
}

export function writeSnapshot(w: World, p: PrevState, out: Float32Array): void {
  for (let i = 0; i < w.count; i++) {
    const o = i * STRIDE;
    out[o + S_X] = w.x[i];
    out[o + S_Y] = w.y[i];
    out[o + S_HX] = w.hx[i];
    out[o + S_HY] = w.hy[i];
    out[o + S_PX] = p.x[i];
    out[o + S_PY] = p.y[i];
    out[o + S_PHX] = p.hx[i];
    out[o + S_PHY] = p.hy[i];
    out[o + S_SIDE] = w.side[i];
    out[o + S_CLS] = w.cls[i];
    out[o + S_ALIVE] = w.alive[i];
    out[o + S_HP] = w.hp[i] / CLASSES[w.cls[i]].hp;
    out[o + S_SHOT_TARGET] = w.shotTarget[i];
    out[o + S_SHOT_AGE] = Math.min(w.tick - 1 - w.lastShotTick[i], 999);
    out[o + S_SHOT_HIT] = w.shotHit[i];
  }
}
