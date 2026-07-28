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

/**
 * Scale cues.
 *
 * Running lights only work as a scale cue if the spacing is ONE constant the player
 * can learn and then apply to anything on screen. Three different spacings on one
 * ship - hull, module, faction escort - do not read as three rhythms, they read as
 * no information at all, and the cue silently stops working.
 *
 * So: every discrete navigation beacon on every hull and every module in the game is
 * at this spacing. Nothing overrides it per-ship.
 *
 * This is distinct from the fine emissive deck strip in art/textures/runningLights.js,
 * which is a continuous lit edge rather than a set of countable points. Two different
 * visual elements; only the countable one is load-bearing for scale.
 */
export const SCALE_CUE = {
  /** Metres between discrete navigation beacons, on everything. */
  runningLightSpacingM: 40,
};

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

/**
 * Time control multipliers, in order. Index 0 is pause.
 *
 * Two bands. COMBAT is what the player has in an engagement, and it stops at 4x
 * deliberately: past that you cannot read an arc closing or react to a breach warning,
 * so a faster setting would only be a way to lose a ship you were not watching.
 *
 * TRANSIT adds a compression tail that is available ONLY while under transit burn with
 * nothing resolved on sensors. A 300 km leg is 157 seconds of sim time; at 16x it is
 * ten seconds, which is a journey rather than a chore. The instant a contact resolves,
 * the band collapses back to COMBAT and the current scale is clamped into it - you do
 * not get to fast-forward through an ambush.
 */
export const TIME_SCALES_COMBAT = [0, 1, 2, 4];
export const TIME_SCALES_TRANSIT = [0, 1, 2, 4, 8, 16, 32, 64];

/** The active table. The engine swaps this via setScaleTable(); do not mutate it. */
export const TIME_SCALES = TIME_SCALES_COMBAT;
