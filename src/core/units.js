/**
 * Scale constants. ONE WORLD UNIT IS ONE METRE. Every system obeys this.
 *
 * The sense of scale in this game comes from honest units, not from tricks.
 * If a cruiser is 1.4 km long it is 1400 units long, and a fighter beside it is 18.
 */

export const METRE = 1;
export const KM = 1000;

/** Reference hull lengths, metres. */
export const HULL_LENGTH = {
  fighter: 18,
  corvette: 95,
  frigate: 210,
  destroyer: 480,
  cruiser: 1400, // the player ship
  station: 2600,
  ancientHulk: 3400,
};

/** The combat plane. The cruiser is locked to y=0; everything else is not. */
export const COMBAT_PLANE_Y = 0;

/** Engagement distances, metres. */
export const RANGE = {
  pointDefence: 900,
  flak: 2200,
  cannon: 5200,
  beam: 4200,
  rail: 9500,
  missile: 12000,
  lance: 6800,
  salvageBeam: 1800,
  sensorBase: 14000,
};

/** Camera. Near/far for the gameplay scene; celestials live in the far scene. */
export const CAMERA = {
  fov: 46,
  near: 2,
  far: 260000,
  minDistance: 260,      // "cruiser fills the frame"
  maxDistance: 46000,    // "cruiser is a bright speck against the gas giant"
  defaultDistance: 3200,
  minPitch: 0.06,        // radians above the plane
  maxPitch: 1.45,
};

/** Far scene: celestials rendered at compressed distance with their own camera. */
export const FAR_SCENE = {
  radius: 9000,          // celestials are placed on/inside this shell
  parallax: 2.2e-4,      // how much the far camera tracks main camera translation
};

/** Committed performance budget. Enforced by tools/bench.mjs. */
export const BUDGET = {
  drawCalls: 320,
  triangles: 1_900_000,
  programs: 90,
  cruiserCoreTris: 2000,
  moduleTris: 400,
  fighterTris: 150,
  targetFPS: 60,
  minLowFPS: 50,
};

/** Simulation timestep. Fixed step, accumulator-driven, scaled by time controls. */
export const SIM = {
  hz: 60,
  dt: 1 / 60,
  maxSubsteps: 6,
};

/** Time control multipliers, in order. Index 0 is pause. */
export const TIME_SCALES = [0, 1, 2, 4];
