/**
 * FIELDS — the things in `world.scene` that are not ships.
 *
 * Asteroids and battle debris are the only objects in the game that are allowed to
 * fill the vertical volume freely, and that is their real job. Capitals are locked
 * to y = 0, so without a field there is nothing above or below the combat plane and
 * a 1.4 km cruiser has nothing to be 1.4 km NEXT TO. Everything about the sense of
 * scale in a frame comes from the parallax stack these two build.
 *
 * Per-POI presets live here so `game.js` can install the right field for a location
 * with one call, and so the POI definitions in `world/lighting/pois.js` and the
 * integration path cannot drift apart.
 */

import { buildAsteroidField, SIZE_CLASSES } from './asteroids.js';
import { buildDebrisField } from './debris.js';
import { NEUTRAL } from '../../art/palette.js';

/**
 * What is in the volume at each POI. Kept next to the builders rather than inside
 * them: the builders describe HOW a field is made, this describes WHICH field a
 * place has.
 */
export const FIELD_PRESETS = {
  'giant-orbit': {
    // Captured rock dragged up out of the belt, plus a shattered fleet.
    asteroids: {
      innerRadius: 3400, outerRadius: 24000, halfHeight: 5600,
      density: 0.85, clumpCount: 4, clumpRadius: 3800,
    },
    debris: {
      count: 300, factions: ['coalition', 'concord'],
      scorched: 0.30, plumes: 26, age: 0.25, scale: 1.25,
      plumeColor: NEUTRAL.ice,
    },
  },
  graveyard: {
    // Almost no rock: this was a battle, not a belt.
    asteroids: {
      innerRadius: 6000, outerRadius: 26000, halfHeight: 4200,
      density: 0.30, clumpCount: 3, clumpRadius: 5200,
      tint: NEUTRAL.rockDark, spin: 0.012,
    },
    debris: {
      count: 420, factions: ['coalition', 'concord', 'derelict'],
      scorched: 0.46, plumes: 8, age: 0.95, scale: 1.5,
      plumeColor: NEUTRAL.ice, spin: 0.03,
      // With no rock and no bright sky, the wreckage is the ONLY thing carrying
      // depth here, so it is weighted forward: big hulks in the mid ground rather
      // than a haze of specks at 22 km that the dim key cannot reach.
      bands: [
        { radius: 4200, half: 1500, share: 0.14, size: 2.40 },
        { radius: 11000, half: 3200, share: 0.46, size: 1.20 },
        { radius: 24000, half: 5800, share: 0.40, size: 0.62 },
      ],
    },
  },
  'near-star': {
    // Sun-scorched rubble, dense and close: the volumetrics need something to rake
    // through or the whole POI is just a bright light.
    asteroids: {
      innerRadius: 2200, outerRadius: 18000, halfHeight: 6000,
      density: 1.35, clumpCount: 6, clumpRadius: 3000,
      tint: NEUTRAL.rock, spin: 0.05,
    },
    debris: {
      count: 180, factions: ['coalition'],
      scorched: 0.62, plumes: 14, age: 0.55, scale: 1.0,
      plumeColor: NEUTRAL.ice,
    },
  },
};

/**
 * Installer, in the shape `game.js` calls. Idempotent.
 *
 *   installFields(world, 'giant-orbit', ctx)   // ctx.materials must be the registry
 *
 * Rotation runs on `fixedUpdate` (order 30) so tumbling is deterministic and obeys
 * the time controls — debris frozen at 4x speed would be an obvious tell.
 */
export function installFields(world, poiId = 'giant-orbit', ctx = {}) {
  if (world.systems.fields) return world.systems.fields;

  const materials = ctx.materials ?? world.systems?.materials;
  if (!materials) {
    console.warn('[fields] no material registry available - skipping fields');
    return null;
  }

  const preset = FIELD_PRESETS[poiId] ?? FIELD_PRESETS['giant-orbit'];
  const rng = ctx.rng ?? world.rng.fork(`fields:${poiId}`);

  const asteroids = preset.asteroids
    ? buildAsteroidField({ rng, materials, ...preset.asteroids })
    : null;
  if (asteroids) world.scene.add(asteroids.object);

  const debris = preset.debris
    ? buildDebrisField({ rng, materials, ...preset.debris })
    : null;
  if (debris) world.scene.add(debris.object);

  const system = {
    name: 'fields',
    order: 30,
    fixedUpdate(dt) {
      asteroids?.update(dt);
      debris?.update(dt);
    },
  };
  world.engine?.add(system);

  const api = {
    asteroids,
    debris,
    count: (asteroids?.count ?? 0) + (debris?.count ?? 0),
    dispose() {
      if (asteroids) { world.scene.remove(asteroids.object); asteroids.dispose(); }
      if (debris) { world.scene.remove(debris.object); debris.dispose(); }
      const list = world.engine?.systems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
      delete world.systems.fields;
    },
  };
  world.register('fields', api);
  return api;
}

export { buildAsteroidField, buildDebrisField, SIZE_CLASSES };
