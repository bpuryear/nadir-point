/**
 * TURNING A POI NODE INTO A PLACE.
 *
 * `system.js` says where the fourteen points of interest are and what they are. This
 * file is the one place any of them becomes geometry and light, and it does it by
 * calling the environment stream's builders rather than growing a second copy of
 * them:
 *
 *   world/celestials/index.js  the sky
 *   world/lighting/poi.js      the rig (key, IBL, fill, hemisphere, grade)
 *   world/fields/*             the rock and the wreckage in the volume
 *
 * Three of the fourteen (`giant-orbit`, `graveyard`, `near-star`) are authored end to
 * end by that stream and are used exactly as registered. The other eleven share those
 * six lighting palettes, so the thing that tells two `station` POIs apart is WHERE THE
 * LIGHT COMES FROM and what is floating in the volume - a sun direction and a field
 * preset, both authored per place in `system.js`.
 *
 * NO LOADING SCREEN. `enterPOI` disposes the previous place and builds the next one
 * inside a single simulation step. At the sizes involved that is a hitch, not a
 * screen: the camera never cuts, the 3D scene never stops rendering, and the ships
 * that were already in flight keep flying.
 */

import * as THREE from 'three';
import { getPOI } from '../../core/contracts.js';
import { getPOIPalette, NEUTRAL } from '../../art/palette.js';
import { EV } from '../../core/events.js';
import { buildCelestials, CELESTIAL_SPECS } from '../celestials/index.js';
import { buildPOILighting } from '../lighting/poi.js';
import { buildAsteroidField } from '../fields/asteroids.js';
import { buildDebrisField } from '../fields/debris.js';
import { FIELD_PRESETS } from '../fields/index.js';

/**
 * Sky overrides for the three palettes the environment stream did not author a
 * celestial spec for. Each one states the whole sky rather than patching one: a
 * shallow merge over `giant-orbit`'s spec would otherwise silently leave a banded gas
 * giant hanging over a belt.
 */
const SKY = {
  belt: (sunDir) => ({
    poiPalette: 'belt',
    sunDir,
    background: NEUTRAL.spaceBlack,
    starfield: { count: 5200, gain: 0.72, bandDensity: 0.44, bandAxis: [0.42, 0.68, -0.60] },
    star: { direction: sunDir, distance: 24000, angularRadius: 0.0075, coreGain: 28, haloGain: 1.5, shells: 3 },
    // Dust, not gas: wide, dim, warm. It is the belt's own haze catching the primary.
    nebula: {
      centre: [sunDir.x * 0.4, -0.15, sunDir.z * 0.4 - 0.7], spread: 0.90, layers: 7, dustLayers: 4,
      intensity: 0.34, radius: 21000, frontRadius: 5200, scale: 1.2,
    },
    giant: null,
  }),

  yard: (sunDir) => ({
    poiPalette: 'yard',
    sunDir,
    background: NEUTRAL.spaceBlack,
    starfield: { count: 6400, gain: 0.86, bandDensity: 0.52, bandAxis: [-0.34, 0.79, 0.51] },
    // Work lights, not a star: big, soft, low gain. The palette already says 0.02 rad.
    star: { direction: sunDir, distance: 21000, angularRadius: 0.018, coreGain: 18, haloGain: 2.4, shells: 3 },
    nebula: {
      centre: [-0.55, 0.22, -0.80], spread: 0.62, layers: 9, dustLayers: 3,
      intensity: 0.44, radius: 20000, frontRadius: 4400, scale: 1.0,
    },
    giant: null,
  }),

  station: (sunDir) => ({
    poiPalette: 'station',
    sunDir,
    background: NEUTRAL.spaceBlack,
    starfield: { count: 7600, gain: 1.05, bandDensity: 0.58, bandAxis: [0.18, 0.86, 0.48] },
    star: { direction: sunDir, distance: 28000, angularRadius: 0.004, coreGain: 30, haloGain: 0.9, shells: 3 },
    nebula: {
      centre: [0.62, 0.08, 0.78], spread: 0.58, layers: 8, dustLayers: 3,
      intensity: 0.40, radius: 22000, frontRadius: 4800, scale: 1.05,
    },
    // A cold giant far enough off to be a backdrop rather than the subject: it gives
    // the station approach a horizon to be silhouetted against.
    giant: {
      direction: new THREE.Vector3(0.42, -0.16, 0.89).normalize(),
      distance: 9000, radius: 1180, rings: false, spin: 1.2, gain: 0.85,
      axis: [0.10, 0.94, -0.32],
    },
  }),
};

/**
 * What is floating at each kind of place. These are the same knobs `FIELD_PRESETS`
 * uses; they live here because they belong to the POIs this stream authored.
 */
export const POI_FIELDS = {
  'yard-heavy': {
    asteroids: { innerRadius: 5200, outerRadius: 20000, halfHeight: 3200, density: 0.28, clumpCount: 3, clumpRadius: 4200 },
    debris: { count: 240, factions: ['coalition'], scorched: 0.16, plumes: 30, age: 0.20, scale: 1.6, spin: 0.04 },
  },
  'yard-light': {
    asteroids: { innerRadius: 6200, outerRadius: 22000, halfHeight: 3600, density: 0.22, clumpCount: 3, clumpRadius: 4600 },
    debris: { count: 190, factions: ['concord'], scorched: 0.12, plumes: 24, age: 0.15, scale: 1.5, spin: 0.035 },
  },
  'station-quiet': {
    asteroids: { innerRadius: 7000, outerRadius: 24000, halfHeight: 4200, density: 0.20, clumpCount: 2, clumpRadius: 5200 },
    debris: { count: 150, factions: ['coalition'], scorched: 0.20, plumes: 18, age: 0.35, scale: 1.1 },
  },
  'station-picket': {
    asteroids: { innerRadius: 4800, outerRadius: 21000, halfHeight: 4600, density: 0.34, clumpCount: 4, clumpRadius: 3800 },
    debris: { count: 260, factions: ['concord', 'coalition'], scorched: 0.42, plumes: 20, age: 0.45, scale: 1.2 },
  },
  'station-fortress': {
    asteroids: { innerRadius: 8000, outerRadius: 25000, halfHeight: 3800, density: 0.16, clumpCount: 2, clumpRadius: 5600 },
    debris: { count: 130, factions: ['concord'], scorched: 0.10, plumes: 26, age: 0.10, scale: 1.35 },
  },
  'belt-dense': {
    asteroids: { innerRadius: 2600, outerRadius: 22000, halfHeight: 6200, density: 1.45, clumpCount: 6, clumpRadius: 3200 },
    debris: { count: 120, factions: ['coalition', 'concord'], scorched: 0.34, plumes: 10, age: 0.60, scale: 0.9 },
  },
  'belt-sparse': {
    asteroids: { innerRadius: 3000, outerRadius: 19000, halfHeight: 5000, density: 0.55, clumpCount: 2, clumpRadius: 6400 },
    debris: { count: 90, factions: ['concord'], scorched: 0.40, plumes: 8, age: 0.70, scale: 1.0 },
  },
  'belt-ice': {
    asteroids: { innerRadius: 2800, outerRadius: 23000, halfHeight: 5800, density: 1.10, clumpCount: 5, clumpRadius: 3600, tint: NEUTRAL.ice },
    debris: { count: 110, factions: ['concord'], scorched: 0.28, plumes: 22, age: 0.50, scale: 0.95, plumeColor: NEUTRAL.ice },
  },
  'graveyard-ancient': {
    asteroids: { innerRadius: 6000, outerRadius: 24000, halfHeight: 4400, density: 0.26, clumpCount: 3, clumpRadius: 5000, tint: NEUTRAL.rockDark },
    debris: {
      count: 380, factions: ['derelict', 'coalition', 'concord'], scorched: 0.50, plumes: 6, age: 1.0, scale: 1.7, spin: 0.02,
      bands: [
        { radius: 4000, half: 1400, share: 0.16, size: 2.6 },
        { radius: 10500, half: 3000, share: 0.44, size: 1.25 },
        { radius: 23000, half: 5600, share: 0.40, size: 0.60 },
      ],
    },
  },
  'graveyard-cold': {
    asteroids: { innerRadius: 6800, outerRadius: 25000, halfHeight: 4000, density: 0.18, clumpCount: 2, clumpRadius: 5400, tint: NEUTRAL.rockDark },
    debris: {
      count: 330, factions: ['coalition', 'concord'], scorched: 0.55, plumes: 5, age: 0.92, scale: 1.55, spin: 0.018,
      bands: [
        { radius: 4400, half: 1600, share: 0.13, size: 2.4 },
        { radius: 11500, half: 3400, share: 0.45, size: 1.15 },
        { radius: 24000, half: 6000, share: 0.42, size: 0.58 },
      ],
    },
  },
};

/**
 * Build a POI instance. Same contract as the environment stream's `assemble`: returns
 * an object with `dispose()`, and installs itself as `world.poi`.
 *
 * @param {{id:string, paletteId:string, sunDir:THREE.Vector3, field:string|null}} spec
 * @param {import('../../core/contracts.js').BuildContext} ctx
 * @param {import('../../core/world.js').World} world
 * @param {Object} [opts]  { extraDebris } - wreckage the faction war left behind
 */
export function buildPOIInstance(spec, ctx, world, opts = {}) {
  const poiId = spec.id;
  const paletteId = spec.paletteId;
  const rng = ctx.rng ?? world.rng.fork(`poi:${poiId}`);
  const materials = ctx.materials ?? world.systems?.materials;
  if (!materials) throw new Error(`[poi:${poiId}] build needs ctx.materials (the material registry)`);

  const sunDir = (spec.sunDir ?? new THREE.Vector3(0.78, 0.35, -0.53)).clone().normalize();

  // --- sky -----------------------------------------------------------------
  const skyOverrides = CELESTIAL_SPECS[paletteId] ? {} : (SKY[paletteId]?.(sunDir) ?? {});
  const sky = buildCelestials(CELESTIAL_SPECS[paletteId] ? paletteId : poiId, {
    rng: rng.fork('sky'),
    far: world.far,
    overrides: CELESTIAL_SPECS[paletteId]
      // A palette the environment stream authored: keep its sky, move its sun so two
      // POIs sharing a palette are not the same photograph.
      ? { sunDir, star: { ...CELESTIAL_SPECS[paletteId].star, direction: sunDir } }
      : skyOverrides,
  });

  // --- rig -----------------------------------------------------------------
  materials.setPOI?.(paletteId);
  const rig = buildPOILighting(paletteId, ctx, world, {
    spec: sky.spec,
    sunDir: sky.sunDir,
    shadowRadius: opts.shadowRadius ?? 3600,
  });

  // --- fields --------------------------------------------------------------
  const preset = POI_FIELDS[spec.field] ?? FIELD_PRESETS[paletteId] ?? FIELD_PRESETS['giant-orbit'];
  const rocks = preset.asteroids
    ? buildAsteroidField({ rng: rng.fork('rock'), materials, ...preset.asteroids })
    : null;
  if (rocks) world.scene.add(rocks.object);

  // The war's leftovers are added to the authored field rather than replacing it, so
  // a POI that has just changed hands is visibly fuller than one that has not.
  const extra = opts.extraDebris ?? ctx.warDebris ?? null;
  const debrisSpec = preset.debris ? { ...preset.debris, ...(extra ?? {}) } : extra;
  const wreck = debrisSpec
    ? buildDebrisField({ rng: rng.fork('wreck'), materials, ...debrisSpec })
    : null;
  if (wreck) world.scene.add(wreck.object);

  const system = {
    name: `poi:${poiId}`,
    order: 30,
    fixedUpdate(dt) {
      rocks?.update(dt);
      wreck?.update(dt);
    },
  };
  world.engine?.add(system);

  const skySystem = {
    name: `poi-sky:${poiId}`,
    order: 62,
    update() { sky.update(world.renderer?.farCamera ?? null); },
  };
  world.engine?.addRender(skySystem);

  const instance = {
    id: poiId,
    paletteId,
    sky,
    rig,
    asteroids: rocks,
    debris: wreck,
    sunDir: sky.sunDir,
    palette: getPOIPalette(paletteId),
    dispose() {
      sky.dispose();
      rig.dispose();
      if (rocks) { world.scene.remove(rocks.object); rocks.dispose(); }
      if (wreck) { world.scene.remove(wreck.object); wreck.dispose(); }
      unhook(world.engine?.systems, system);
      unhook(world.engine?.renderSystems, skySystem);
      if (world.poi === instance) world.poi = null;
    },
  };
  world.poi = instance;
  return instance;
}

function unhook(list, system) {
  if (!list) return;
  const i = list.indexOf(system);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Enter a POI: tear down whatever was here, build what is here now, tell everyone.
 *
 * Safe to call with a POI id the registry does not know - it warns and leaves the
 * previous place standing, because dropping the player into an unlit void is worse
 * than arriving somewhere slightly wrong.
 */
export function enterPOI(world, poiId, ctx, opts = {}) {
  const def = getPOI(poiId);
  if (!def?.build) {
    console.warn(`[poi] no registered POI "${poiId}" - staying where we are`);
    return world.poi ?? null;
  }
  const previous = world.poi;
  const previousId = previous?.id ?? null;
  if (previousId === poiId && !opts.force) return previous;

  if (previous) {
    previous.dispose();
    world.bus?.emit(EV.POI_LEFT, { id: previousId });
  }

  let instance = null;
  try {
    instance = def.build(ctx, world);
  } catch (err) {
    console.error(`[poi] "${poiId}" failed to build`, err);
    return null;
  }

  /**
   * ONE CONTINUOUS COORDINATE SPACE.
   *
   * Every field builder in the project centres its work on the origin, because until
   * now a POI was the only thing in the world. It is not any more: the system is
   * sixteen hundred kilometres across and this place is somewhere specific in it. So
   * the volume gets shifted onto the node, once, on the group - which costs nothing
   * and means the player's coordinates never lie.
   */
  const origin = ctx.poiOrigin;
  if (origin && instance && (origin.x !== 0 || origin.z !== 0)) {
    instance.asteroids?.object?.position.copy(origin);
    instance.debris?.object?.position.copy(origin);
  }

  world.bus?.emit(EV.POI_ENTERED, { id: poiId, poi: instance, def });
  return instance;
}
