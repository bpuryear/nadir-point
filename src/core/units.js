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

/**
 * HULL ADAPTATION — the numbers the hull reads off a fitted module.
 *
 * `docs/design/cruiser-adaptation.md` §B.3: the module declares a NEED, never a shape,
 * and it declares as little as possible so that twenty-four modules cannot become
 * twenty-four dialects. Three inputs reach the hull's seat builder:
 *
 *   massClass    DERIVED from `ModuleDef.mass`, never declared. A module cannot lie
 *                about its class without lying about its handling penalty, which the
 *                player feels.
 *   footprintM   declared, two numbers, `ModuleDef.fit.footprintM`
 *   service      declared, one enum, `ModuleDef.fit.service`
 *
 * The derivations live in `core/contracts.js` (`massClassOf`, `footprintNorm`,
 * `fitProfile`); only the constants are here, because this is the file that owns
 * every number carrying a unit.
 */
export const FIT = {
  /**
   * Mass-class thresholds, tonnes. `mass < 450` is class 1, `< 1000` class 2, else 3.
   *
   * MEASURED, not chosen by feel. The library spans 180 t (`bow_prow_spike`) to 2400 t
   * (`ventral_hangar_deck`), and these two cuts are the pair that fills all three bands
   * on all four PAN mounts:
   *
   *   bow      180 310 | 860 940  | 1180              1 / 2 / 3   all three
   *   dorsal   240 290 | 640 780  | 1420              1 / 2 / 3   all three
   *   ventral  320 410 | 900      | 1050 2400         1 / 2 / 3   all three
   *   port     380 420 | 560      | 1240 1560         1 / 2 / 3   all three
   *   engine       --  | 720      | 1180 1400 1900    NO CLASS 1  see below
   *
   * Thresholds at 700/1500 leave bow and dorsal with no class-3 module at all, which
   * would make the heaviest seat unreachable on two of six mounts.
   *
   * THE ENGINE MOUNT HAS NO CLASS-1 MODULE AND NO THRESHOLD PAIR CAN GIVE IT ONE: its
   * lightest fit is 720 t and its heaviest is 1900 t, so any cut that puts 720 in class
   * 1 puts 1180, 1400 and 1900 in classes 1-2 and empties class 3 everywhere else.
   * `cruiser-adaptation.md` §B.3 asserts in prose that "every one of the five mount
   * families populates all three bands" and then prints a table with the engine's class-1
   * column empty; the table is right. It costs nothing: the drive well is a socket, not a
   * pan (`cruiser.js#SEAT.engine` is `well: true`), so the mass-class ladder the apron and
   * coaming ride on does not run there. `modules/audit.mjs` prints the coverage per mount
   * and fails only if a PAN mount loses a band.
   */
  massClassT: [450, 1000],

  /**
   * Footprint quantum, metres. Declared footprints are rounded to this before they
   * reach the seat builder, which is what makes at most ~90 distinct seats cacheable
   * (§B.4). 8 m is under a pixel at the LOD1 switch.
   */
  footprintQuantumM: 8,

  /** Sanity bounds on a declared footprint, metres. See contracts.js#validateFit. */
  minFootprintM: 8,
  maxFootprintM: 900,

  /**
   * FROZEN REFERENCE SPANS for `footprintNorm`, per mount, metres: how big a root is
   * "small" and how big is "large" ON THIS MOUNT. `[min, max]` for [across, alongShip].
   *
   * WHY THIS IS A FROZEN CONSTANT AND NOT DERIVED FROM THE LIBRARY. The obvious
   * implementation normalises each module against the min and max of the modules
   * actually registered. That makes every seat on the ship a function of which OTHER
   * modules exist: adding a twenty-fifth module would silently re-shape the seat under
   * the other twenty-four, and the determinism test in §B.7 would start depending on
   * import order. A frozen span is a pure function of (mount, footprint) and adding a
   * module moves nothing. A module outside the span clamps to 0 or 1 and the audit says
   * so rather than re-scaling everybody.
   *
   * The numbers bracket the measured library with a metre or two of air at each end:
   *
   *   bow      across 122-185   along  90-210
   *   dorsal   across  92-302   along  92-178
   *   ventral  across 132-264   along 102-820
   *   port     across 131-406   along 188-340      starboard shares the port list
   *   engine   across 132-516   along  98-124
   *
   * (`node src/art/geometry/modules/audit.mjs`, FIT DECLARATIONS section, prints the
   * live spread against these bounds.)
   */
  footprintRefM: {
    bow:       { across: [120, 190], along: [90, 210] },
    dorsal:    { across: [90, 305], along: [90, 180] },
    ventral:   { across: [130, 265], along: [100, 820] },
    port:      { across: [130, 410], along: [185, 345] },
    starboard: { across: [130, 410], along: [185, 345] },
    engine:    { across: [130, 520], along: [95, 125] },
  },
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

/**
 * Committed performance budget. Enforced by tools/bench.mjs.
 *
 * ---------------------------------------------------------------------------
 * WHY THE GEOMETRY CEILINGS ARE FIVE TIMES WHAT THEY WERE
 * ---------------------------------------------------------------------------
 * They were set when nobody had measured which of the two ceilings was actually
 * binding. `docs/review/benchmark.json`, hardware rasterisation, 2560x1440, quality
 * high, is the measurement:
 *
 *     peak.triangles   138,315  against  1,900,000    7.3% USED
 *     peak.calls          506   against        320    158% used, FAIL
 *
 * So there are 1.76 MILLION triangles of headroom and the scene is 186 draw calls over
 * its ceiling. Triangles are not the constraint. Draw calls are, and GTAO renders every
 * one of them a second time.
 *
 * THE RULE THAT FOLLOWS, and it is the whole performance balance of this wave: SPEND
 * TRIANGLES FREELY, SPEND DRAW CALLS ALMOST NOT AT ALL. More detail inside the SAME
 * merged meshes and the same materials is nearly free; a new mesh or a new material is
 * expensive. Every hull in this game merges its parts into one THREE.Mesh per
 * (damage group x surface) - `cruiser.js#buildCruiser`, `ships/common.js#buildShip` -
 * so stations, facets, recesses and primitives inside an existing surface cost exactly
 * zero draws. A sixth surface costs one draw per damage group per hull, forever.
 *
 * Sanity check on the new ceilings. Force EVERY hull in the benchmark scene to LOD0 at
 * its ceiling: 1 cruiser at 9,000 + 6 modules at 1,200 + 12 combat ships at 5,000 =
 * 76,200 triangles of ship geometry. The whole scene today peaks at 138,315 including
 * 930 instanced debris objects and the skybox. The redesign cannot plausibly take the
 * scene past ~210,000 triangles, which is 11% of the ceiling. Triangles remain a
 * non-issue by a factor of nine.
 *
 * MEASURED AFTER THE CRUISER REDESIGN, so these are not aspirational numbers:
 * LOD0 5,241 triangles across 11 draws, against 1,989 across 11 before it. Five times
 * the geometry, THE SAME ELEVEN DRAW CALLS. That equality is the point of this comment.
 */
export const BUDGET = {
  drawCalls: 320,
  triangles: 1_900_000,
  programs: 90,
  /** Player cruiser LOD0 core hull, running lights included. Measured: 5,241. */
  cruiserCoreTris: 9000,
  /**
   * Player cruiser LOD0 core hull WITH its adaptation geometry, over the worst-case
   * fit — the six heaviest modules, not a sampled one. The modules' own triangles are
   * not in this figure; `moduleTris` below is their ceiling.
   *
   * `cruiser-adaptation.md` §B.2's arithmetic: bare hull 7309 with lights, Part A's
   * rake +0, its portal rings -20, its rail re-expression +400 authored at three
   * stations, and adaptation's worst case +720 (six mounts x <=120: plates 56, chocks
   * 32, fairing 32, apron/coaming/service 0) = ~8410 of 9000. This ceiling sits between
   * the two so that the fitted hull has a budget of its own and cannot quietly eat the
   * bare hull's 1691 triangles of headroom.
   */
  cruiserFittedTris: 8600,
  /** One fitted module at LOD0. */
  moduleTris: 1200,
  /** A strike craft, 18 m. Still the one class where triangles are worth counting. */
  fighterTris: 400,
  /** A faction hull >= 300 m at LOD0. */
  capitalTris: 5000,
  /** A faction hull 95-210 m at LOD0. */
  escortTris: 2000,
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
