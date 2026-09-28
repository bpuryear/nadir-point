import type { CompiledDesign } from '../sim/design.ts';
import type { World } from '../sim/world.ts';
import { U_HX, U_HY, U_PHX, U_PHY, U_PX, U_PY, U_STRIDE, U_X, U_Y } from '../worker/snapshot.ts';

/** The static facts of a battle the renderer needs: who is who, and where each module sits. */
export interface Roster {
  designs: CompiledDesign[];
  count: number;
  moduleCount: number;
  unitDesign: Uint16Array;
  unitSide: Uint8Array;
  modStart: Int32Array;
  mUnit: Int32Array;
  mSlot: Uint16Array;
}

export function rosterFrom(w: World): Roster {
  return {
    designs: w.designs,
    count: w.count,
    moduleCount: w.moduleCount,
    unitDesign: w.design.slice(0, w.count),
    unitSide: w.side.slice(0, w.count),
    modStart: w.modStart.slice(0, w.count + 1),
    mUnit: w.mUnit.slice(0, w.moduleCount),
    mSlot: w.mSlot.slice(0, w.moduleCount),
  };
}

/** Interpolated positions and headings for this frame, shared by every view. */
export class Poses {
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly hx: Float32Array;
  readonly hz: Float32Array;

  constructor(count: number) {
    this.x = new Float32Array(count);
    this.z = new Float32Array(count);
    this.hx = new Float32Array(count);
    this.hz = new Float32Array(count);
  }

  update(units: Float32Array, count: number, alpha: number): void {
    for (let i = 0; i < count; i++) {
      const o = i * U_STRIDE;
      this.x[i] = units[o + U_PX] + (units[o + U_X] - units[o + U_PX]) * alpha;
      this.z[i] = units[o + U_PY] + (units[o + U_Y] - units[o + U_PY]) * alpha;
      let hx = units[o + U_PHX] + (units[o + U_HX] - units[o + U_PHX]) * alpha;
      let hz = units[o + U_PHY] + (units[o + U_HY] - units[o + U_PHY]) * alpha;
      const len = Math.hypot(hx, hz) || 1;
      hx /= len;
      hz /= len;
      this.hx[i] = hx;
      this.hz[i] = hz;
    }
  }

  /** Ship-frame point (x forward, y up, z port) to world, for unit i. */
  toWorld(i: number, lx: number, ly: number, lz: number, out: Float32Array, o: number): void {
    const hx = this.hx[i];
    const hz = this.hz[i];
    out[o] = this.x[i] + lx * hx - lz * hz;
    out[o + 1] = ly;
    out[o + 2] = this.z[i] + lx * hz + lz * hx;
  }
}
