// Deterministic maths for the sim.
//
// ECMAScript leaves Math.sin, Math.cos, Math.pow, Math.atan2 and friends
// implementation-approximated, and engines really do disagree. The sim may only
// use + - * / and Math.sqrt on floats, plus exact helpers (floor, round, abs,
// min, max, imul). These functions are built from those alone.

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

const INV_HALF_PI = 0.6366197723675814;
// pi/2 split so that k * HALF_PI_HI is exact for |k| < 2^20 (fdlibm pio2_1 / pio2_1t).
const HALF_PI_HI = 1.5707963267341256;
const HALF_PI_LO = 6.077100506506192e-11;

// Taylor kernels on [-pi/4, pi/4]; truncation error is below 2e-14.
const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;
const C2 = -1 / 2;
const C4 = 1 / 24;
const C6 = -1 / 720;
const C8 = 1 / 40320;
const C10 = -1 / 3628800;
const C12 = 1 / 479001600;
const C14 = -1 / 87178291200;

function sinKernel(r: number): number {
  const r2 = r * r;
  return r * (1 + r2 * (S3 + r2 * (S5 + r2 * (S7 + r2 * (S9 + r2 * (S11 + r2 * S13))))));
}

function cosKernel(r: number): number {
  const r2 = r * r;
  return 1 + r2 * (C2 + r2 * (C4 + r2 * (C6 + r2 * (C8 + r2 * (C10 + r2 * (C12 + r2 * C14))))));
}

export function sin(x: number): number {
  const k = Math.round(x * INV_HALF_PI);
  const r = x - k * HALF_PI_HI - k * HALF_PI_LO;
  switch (k & 3) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

export function cos(x: number): number {
  const k = Math.round(x * INV_HALF_PI);
  const r = x - k * HALF_PI_HI - k * HALF_PI_LO;
  switch (k & 3) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

export function degToRad(deg: number): number {
  return (deg * PI) / 180;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
