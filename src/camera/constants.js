import { CAMERA } from '../core/units.js';

/**
 * Camera tuning. Derived in docs/design/controls.md - read §2 before changing any of
 * these, most of them have a reason that is not obvious from the number.
 */
export const ORBIT = {
  // sensitivity
  yawSensRadPerPx: 0.0042,
  pitchSensRadPerPx: 0.0034,   // vertical deliberately slower than horizontal
  keyYawRate: 0.85,            // rad/s
  invertY: false,
  sensScaleRange: [0.25, 3.0],

  // zoom, geometric: constant RATIO per notch, because perceived magnification
  // change is proportional to ratio and not to difference. See §2.3.
  lnZoomRange: Math.log(CAMERA.maxDistance / CAMERA.minDistance),
  notchRatio: 1.18,
  stepT: Math.log(1.18) / Math.log(CAMERA.maxDistance / CAMERA.minDistance),
  fineScale: 0.25,
  coarseScale: 3.0,
  minDistRadiusK: 1.9,
  cursorBiasIn: 0.35,          // zooming in is a targeting gesture...
  cursorBiasOut: 0.0,          // ...zooming out is an orientation gesture

  // pitch floor rises with zoom, so a plan view is enforced at strategic range
  pitchFloorMax: 0.95,
  pitchFloorT0: 0.30,
  pitchFloorT1: 1.00,
  defaultPitchOffset: 0.30,

  // pan
  keyPanRate: 0.55,            // x distance, per second
  panFastMul: 2.5,
  panSlowMul: 0.35,
  grazingSinClamp: 0.18,
  edgeScrollEnabled: false,
  edgeScrollPx: 12,
  edgeScrollMul: 0.75,

  // damping time constants, seconds. 0 means applied directly.
  tauOrbitDrag: 0.0,           // axiom: a drag is never smoothed
  tauOrbitKey: 0.055,
  tauZoom: 0.090,
  tauFocusKey: 0.120,
  /*
   * 0.35 led the locked focus ahead of the ship by its velocity, so the hull sat behind
   * centre whenever it moved — correct for an RTS "show me where it is going", wrong for
   * the owner's ruling that this camera is third-person: "the ship kept as the
   * center-focused ... like most third person games show the character in the middle".
   * Zero means the ship IS the pivot. If a forward read is ever wanted again it should
   * be a small screen-space offset, not a focus lead, so the pivot never leaves the hull.
   */
  followLead: 0,

  // snap
  snapMs: 450,
  snapBackMs: 900,
  snapBackIdle: 6.0,
  snapBackEnabled: false,      // ships off; Home is one keypress and it is honest
  frameEngagementMargin: 0.18,

  // strategic overlay band
  strategicT0: 1.00,
  strategicT1: 1.35,
  strategicScaleAtT1: 400,
};

export const CINE = {
  fov: 34, back: 1.35, up: 0.22, side: 0.55, aimAhead: 0.9,
  tauPos: 0.55, tauAim: 0.75, driftAmp: 0.018, driftHz: 0.07, rollMax: 0.09,

  /**
   * Camera roll per radian of `PlaneBody.recoilBank`. The hull's own recoil roll peaks
   * at a MEASURED 0.03508 rad (2.01 deg, `tools/flight.mjs` check 11) and settles to
   * exactly zero, so 1.35 puts 2.71 deg of camera roll under a full broadside against
   * `rollMax`'s 5.16 deg ceiling — room for a hard turn to be happening at the same
   * time, which is the case the clamp in `cinematic.js` exists for.
   *
   * Below 1.0 the term is measurably present and perceptually absent; above about 2.0 a
   * broadside taken mid-turn saturates the clamp and the horizon locks over, which reads
   * as a bug rather than as recoil.
   */
  recoilRollK: 1.35,
  /**
   * s. The roll tau WHILE the guns are talking. The turn's 0.8 s is the lag that reads
   * as tonnage on a heading change; run the recoil through it as well and a kick becomes
   * a slow lean, because `RECOIL.rise` has already spent its authored rise by then.
   */
  tauRollGun: 0.22,
};

/**
 * Frame-rate independent exponential damping.
 *
 * `lerp(a, b, 0.1)` per frame is a defect: it moves a 144 Hz player's camera about
 * 2.4x faster than a 60 Hz player's. This form covers the same PROPORTION of the
 * remaining distance over any interval regardless of how it is subdivided.
 */
export function damp(current, target, tau, dt) {
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export function dampVec(current, target, tau, dt) {
  if (tau <= 0) return current.copy(target);
  const k = 1 - Math.exp(-dt / tau);
  current.x += (target.x - current.x) * k;
  current.y += (target.y - current.y) * k;
  current.z += (target.z - current.z) * k;
  return current;
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** C2 continuous. A plain smoothstep has a visible acceleration kink at 450 ms. */
export function smootherstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Shortest signed arc from a to b. */
export function shortestArc(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
