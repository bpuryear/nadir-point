/**
 * CELESTIAL COMPOSITION, PER POINT OF INTEREST.
 *
 * `CELESTIAL_SPECS` is the single source of truth for what is in the sky at a POI
 * *and* for where its light comes from. The lighting rig reads `sunDir` from here,
 * the star is drawn along `sunDir`, and the gas giant's terminator is computed from
 * `sunDir`. There is no second copy of that vector to fall out of sync.
 *
 * Every colour is derived from the POI's locked palette through `mix`/`shade`, so a
 * location's sky, its key light and its hull tints are all the same small set of
 * hues seen three different ways. That is why a frame from one POI is instantly
 * distinguishable from a frame from another.
 *
 *   giant-orbit  a banded blue giant filling a third of frame, ringed, half lit by a
 *                small off-frame sun; cold planetshine, a thin nebula band far away.
 *   graveyard    no near star. A pinprick sun low and cold, and a sickly derelict
 *                green nebula doing most of the (very little) work. Near-black.
 *   near-star    the primary at five degrees across, wide halo, everything else
 *                crushed. A hot dust band and almost no visible stars.
 */

import * as THREE from 'three';
import { getPOIPalette, NEUTRAL, mix, shade } from '../../art/palette.js';
import { buildStarfield } from './starfield.js';
import { buildNebula } from './nebula.js';
import { buildGasGiant } from './gasgiant.js';
import { buildStar } from './star.js';
import { ORDER } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

/**
 * Build a gas giant colour ramp out of a POI palette. Bright zones first, deep belt
 * last; the planet shader indexes it and the polar hood blends towards the tail.
 */
function giantRamp(pal) {
  return [
    mix(NEUTRAL.ice, pal.accent, 0.34),                 // 0 bright zone
    mix(pal.accent, NEUTRAL.ice, 0.30),                 // 1 zone
    pal.accent,                                          // 2 mid belt
    mix(pal.accent, pal.fill.color, 0.68),              // 3 belt
    mix(pal.fill.color, pal.ibl.horizon, 0.62),         // 4 dark belt
    mix(pal.ibl.horizon, pal.shadow, 0.55),             // 5 deep / polar
  ];
}

export const CELESTIAL_SPECS = {
  // -------------------------------------------------------------------------
  'giant-orbit': {
    poiPalette: 'giant-orbit',
    // 96 degrees of elongation from the planet: a clean vertical terminator on the
    // giant AND a hard raking key on the fleet. Low (20 deg) for long shadows.
    sunDir: V(0.776, 0.347, -0.526),
    background: NEUTRAL.spaceBlack,
    starfield: { count: 7000, gain: 0.95, bandDensity: 0.50, bandAxis: [0.28, 0.82, -0.50] },
    star: { direction: V(0.776, 0.347, -0.526), distance: 26000, angularRadius: 0.0085, coreGain: 30, haloGain: 2.0, shells: 3 },
    nebula: {
      centre: [0.21, 0.19, -0.96], spread: 0.55, layers: 10, dustLayers: 3,
      intensity: 0.62, radius: 22000, frontRadius: 4600, scale: 1.0,
    },
    giant: {
      // 34 degrees across at a 99 degree elongation: about a third of a 16:9 frame,
      // half lit, terminator running down the disc rather than clipping a limb.
      direction: V(-0.6007, -0.2603, -0.7559),
      distance: 9000, radius: 2740, rings: true,
      ringInner: 1.31, ringOuter: 2.14, spin: 1.9, gain: 1.0,
      // Sun 33 degrees above the ring plane (so the ring shadow lands on the LIT
      // hemisphere and is actually visible) and the plane only 15 degrees open to
      // the probe camera (so the rings stay a line, not a plate).
      axis: [0.013, 0.902, -0.431],
    },
  },

  // -------------------------------------------------------------------------
  graveyard: {
    poiPalette: 'graveyard',
    // Low, cold, and almost edge on. Everything here is silhouette and rim.
    sunDir: V(-0.905, 0.145, 0.400),
    background: 0x000000,
    starfield: { count: 7200, gain: 1.25, bandDensity: 0.62, bandAxis: [-0.20, 0.72, 0.66] },
    star: { direction: V(-0.905, 0.145, 0.400), distance: 30000, angularRadius: 0.0022, coreGain: 26, haloGain: 0.55, shells: 3 },
    nebula: {
      centre: [-0.62, 0.10, 0.78], spread: 0.72, layers: 14, dustLayers: 5,
      intensity: 1.15, radius: 20000, frontRadius: 4000, scale: 1.15,
      /**
       * Explicit tints, NOT derived from `fill` and `ibl.horizon` the way the other
       * POIs are. The graveyard palette's fill (0x1b2a3a) and horizon (0x14202e) are
       * near-black by design, so the generic derivation produces a nebula that is
       * literally invisible — and this is the one location whose fill light is
       * supposed to be coming from the nebula. Derelict green over cold blue, lifted
       * far enough to be seen and no further.
       */
      tints: [
        mix(0x8fb04a, NEUTRAL.ice, 0.42),
        mix(0x14202e, 0x8fb04a, 0.55),
        mix(0xb6c6da, 0x1b2a3a, 0.55),
      ],
    },
    giant: null,
  },

  // -------------------------------------------------------------------------
  'near-star': {
    poiPalette: 'near-star',
    // Just inside the frame edge so the god-ray pass has a real anchor.
    sunDir: V(0.560, 0.300, -0.772),
    background: 0x000000,
    starfield: { count: 2600, gain: 0.30, bandDensity: 0.35, bandAxis: [0.55, 0.60, 0.58] },
    star: {
      direction: V(0.560, 0.300, -0.772), distance: 16000, angularRadius: 0.042,
      coreGain: 40, haloGain: 1.7, shells: 3, wideHalo: true,
    },
    nebula: {
      centre: [0.30, -0.10, -0.95], spread: 0.85, layers: 8, dustLayers: 2,
      intensity: 0.30, radius: 19000, frontRadius: 4200, scale: 1.35,
    },
    giant: null,
  },
};

/**
 * Build the far-scene contents for a POI.
 *
 * @param {string} poiId
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {THREE.Scene} [p.far]   if given, the result is added to it
 * @param {Object} [p.overrides]  shallow-merged over the spec
 * @returns {{root:THREE.Group, sunDir:THREE.Vector3, spec:Object, parts:Object,
 *            update:Function, dispose:Function}}
 */
export function buildCelestials(poiId, { rng, far = null, overrides = {} } = {}) {
  const spec = { ...(CELESTIAL_SPECS[poiId] ?? CELESTIAL_SPECS['giant-orbit']), ...overrides };
  const pal = getPOIPalette(spec.poiPalette ?? poiId);
  const r = rng.fork(`celestials:${poiId}`);

  const root = new THREE.Group();
  root.name = `celestials:${poiId}`;

  const parts = {};

  // --- starfield -----------------------------------------------------------
  parts.starfield = buildStarfield({ rng: r, ...spec.starfield });
  root.add(parts.starfield.object);

  // --- nebula --------------------------------------------------------------
  if (spec.nebula) {
    // Emission tints: the POI accent, the fill (its bounce colour) and one cooled
    // deep tone. Three hues, no more — the sky must not out-colour the ships.
    const tints = spec.nebula.tints ?? [
      mix(pal.accent, NEUTRAL.ice, 0.20),
      pal.fill.color,
      mix(pal.ibl.horizon, pal.accent, 0.35),
    ];
    parts.nebula = buildNebula({
      rng: r,
      tints,
      dustTint: shade(pal.shadow, 0.75),
      ...spec.nebula,
    });
    root.add(parts.nebula.object);
  }

  // --- the primary ---------------------------------------------------------
  if (spec.star) {
    parts.star = buildStar({
      rng: r,
      core: mix(pal.key.color, NEUTRAL.select, 0.10),
      halo: mix(pal.key.color, pal.accent, 0.28),
      ...spec.star,
    });
    root.add(parts.star.object);
  }

  // --- the hero ------------------------------------------------------------
  if (spec.giant) {
    parts.giant = buildGasGiant({
      rng: r,
      sunDir: spec.sunDir,
      ramp: spec.giant.ramp ?? giantRamp(pal),
      colors: {
        sun: pal.key.color,
        night: mix(pal.shadow, pal.fill.color, 0.55),
        rim: mix(pal.accent, NEUTRAL.ice, 0.35),
        aurora: mix(pal.accent, NEUTRAL.friendly, 0.30),
        storm: mix(NEUTRAL.select, pal.accent, 0.22),
        // Cool and dark. A warm bright ring next to a cold planet becomes the
        // brightest thing in frame and steals the composition from the hero.
        ringDust: mix(NEUTRAL.rock, NEUTRAL.rockDark, 0.42),
        ringIce: mix(NEUTRAL.ice, NEUTRAL.rock, 0.45),
        nightGain: 0.055,
        rimGain: 0.85,
        auroraGain: 0.30,
        haloGain: 0.55,
        ringGain: 0.60,
        ringAmbient: 0.055,
        ringTau: 0.72,
      },
      ...spec.giant,
    });
    root.add(parts.giant.object);
  }

  root.updateMatrixWorld(true);

  if (far) {
    far.add(root);
    far.background = new THREE.Color().setHex(spec.background ?? NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
  }

  return {
    root,
    parts,
    spec,
    sunDir: spec.sunDir.clone(),
    palette: pal,
    /** Order constants, so callers can slot their own celestials into the stack. */
    ORDER,
    /** Refresh view-dependent uniforms. Cheap; safe to skip on a static shot. */
    update(farCamera) {
      parts.giant?.refresh(farCamera);
    },
    dispose() {
      root.parent?.remove(root);
      for (const k of Object.keys(parts)) parts[k]?.dispose?.();
    },
  };
}

/**
 * Installer, in the shape `game.js` calls. Idempotent: a second call returns the
 * instance already installed rather than stacking a second sky on the first.
 *
 *   installCelestials(world, 'giant-orbit', ctx)
 *
 * Registers a render-rate system (order 60) that refreshes the gas giant's
 * view-dependent uniforms. It runs at render rate, not sim rate, because the far
 * camera moves while paused.
 */
export function installCelestials(world, poiId = 'giant-orbit', ctx = {}) {
  if (world.systems.celestials) return world.systems.celestials;

  const sky = buildCelestials(poiId, {
    rng: ctx.rng ?? world.rng.fork(`celestials:${poiId}`),
    far: world.far,
  });

  const system = {
    name: 'celestials',
    order: 60,
    update() { sky.update(world.renderer?.farCamera ?? null); },
  };
  world.engine?.addRender(system);

  const api = {
    ...sky,
    dispose() {
      sky.dispose();
      const list = world.engine?.renderSystems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
      delete world.systems.celestials;
    },
  };
  world.register('celestials', api);
  return api;
}

export { buildStarfield, buildNebula, buildGasGiant, buildStar, ORDER };
