import type { World } from '../sim/world.ts';

// Render snapshot layout. prev* hold the state one tick earlier, so the
// renderer can interpolate between ticks.

export const U_X = 0;
export const U_Y = 1;
export const U_HX = 2;
export const U_HY = 3;
export const U_PX = 4;
export const U_PY = 5;
export const U_PHX = 6;
export const U_PHY = 7;
export const U_STATUS = 8;
export const U_STRUCT = 9;
/** Four facings, as a fraction of the design's plate. */
export const U_ARMOUR = 10;
export const U_TARGET = 14;
export const U_STRIDE = 15;

export const M_HP = 0;
export const M_SHOT_AGE = 1;
export const M_TARGET = 2;
export const M_HIT = 3;
export const M_STRIDE = 4;

export interface PrevState {
  x: Float64Array;
  y: Float64Array;
  hx: Float64Array;
  hy: Float64Array;
}

export function createPrev(units: number): PrevState {
  return { x: new Float64Array(units), y: new Float64Array(units), hx: new Float64Array(units), hy: new Float64Array(units) };
}

export function savePrev(w: World, p: PrevState): void {
  p.x.set(w.x.subarray(0, w.count));
  p.y.set(w.y.subarray(0, w.count));
  p.hx.set(w.hx.subarray(0, w.count));
  p.hy.set(w.hy.subarray(0, w.count));
}

export function writeUnits(w: World, p: PrevState, out: Float32Array): void {
  for (let i = 0; i < w.count; i++) {
    const o = i * U_STRIDE;
    const d = w.designs[w.design[i]];
    out[o + U_X] = w.x[i];
    out[o + U_Y] = w.y[i];
    out[o + U_HX] = w.hx[i];
    out[o + U_HY] = w.hy[i];
    out[o + U_PX] = p.x[i];
    out[o + U_PY] = p.y[i];
    out[o + U_PHX] = p.hx[i];
    out[o + U_PHY] = p.hy[i];
    out[o + U_STATUS] = w.status[i];
    out[o + U_STRUCT] = w.structure[i] / d.hull.structure;
    for (let f = 0; f < 4; f++) {
      const plan = d.design.armour[f];
      out[o + U_ARMOUR + f] = plan > 0 ? w.armour[i * 4 + f] / plan : 0;
    }
    out[o + U_TARGET] = w.target[i];
  }
}

export function writeModules(w: World, out: Float32Array): void {
  for (let m = 0; m < w.moduleCount; m++) {
    const o = m * M_STRIDE;
    const i = w.mUnit[m];
    const def = w.designs[w.design[i]].modules[w.mSlot[m]].def;
    out[o + M_HP] = w.mHp[m] / def.hp;
    out[o + M_SHOT_AGE] = Math.min(w.tick - 1 - w.mLastShot[m], 999);
    out[o + M_TARGET] = w.mTarget[m];
    out[o + M_HIT] = w.mHit[m];
  }
}
