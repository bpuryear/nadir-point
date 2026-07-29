/**
 * THE POINTS OF INTEREST.
 *
 * Three locations, three lighting setups. The test each one has to pass is that a
 * player shown a single still frame can name where they are — not from a label, from
 * the light:
 *
 *   giant-orbit  A banded giant fills a third of the frame. Warm off-frame key at 20
 *                degrees of elevation throws long shadows across a shattered fleet;
 *                the whole shadow side is filled by cold blue planetshine, so the
 *                dark half of every hull is BLUE and the lit half is CREAM. Two
 *                temperatures, one frame.
 *
 *   graveyard    The sun is a pinprick 60 degrees away and almost edge on. There is
 *                no fill worth the name — the nebula does it, and it does it in a
 *                sick derelict green. Everything is silhouette, rim light and
 *                near-black. Decades-old wreckage, no rock, nothing moving fast.
 *
 *   near-star    Six stops brighter than anywhere else. The key blows out the lit
 *                faces entirely, shadow terminators are knife-edged, the god-ray pass
 *                is turned up and the star sits just inside the frame so it has
 *                something to rake through. Everything that is not directly lit is
 *                crushed to silhouette.
 *
 * Each `build(ctx, world)` returns a live instance with `dispose()`; nothing here
 * mutates global state that a later POI cannot undo.
 */

import * as THREE from 'three';
import { registerPOI } from '../../core/contracts.js';
import { getPOIPalette } from '../../art/palette.js';
import { buildCelestials, CELESTIAL_SPECS } from '../celestials/index.js';
import { buildAsteroidField } from '../fields/asteroids.js';
import { buildDebrisField } from '../fields/debris.js';
import { FIELD_PRESETS } from '../fields/index.js';
import { buildPOILighting } from './poi.js';

/**
 * Shared assembly: sky, rig, fields, and one update system for the whole lot.
 *
 * Field contents come from `FIELD_PRESETS` rather than being restated here, so the
 * POI registry path and the `installFields` integration path cannot describe two
 * different versions of the same place.
 */
function assemble(poiId, ctx, world, { lighting = {}, fields = {} } = {}) {
  const rng = ctx.rng ?? world.rng.fork(poiId);
  const materials = ctx.materials ?? world.systems?.materials;
  if (!materials) throw new Error(`[poi:${poiId}] build needs ctx.materials (the material registry)`);

  const preset = FIELD_PRESETS[poiId] ?? {};
  const asteroids = fields.asteroids === null ? null : { ...preset.asteroids, ...(fields.asteroids ?? {}) };
  const debris = fields.debris === null ? null : { ...preset.debris, ...(fields.debris ?? {}) };

  const sky = buildCelestials(poiId, { rng, far: world.far });
  const rig = buildPOILighting(poiId, ctx, world, { spec: sky.spec, ...lighting });

  const rocks = asteroids ? buildAsteroidField({ rng, materials, ...asteroids }) : null;
  if (rocks) world.scene.add(rocks.object);

  const wreck = debris ? buildDebrisField({ rng, materials, ...debris }) : null;
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

  const instance = {
    id: poiId,
    sky,
    rig,
    asteroids: rocks,
    debris: wreck,
    sunDir: sky.sunDir,
    palette: getPOIPalette(poiId),
    dispose() {
      sky.dispose();
      rig.dispose();
      if (rocks) { world.scene.remove(rocks.object); rocks.dispose(); }
      if (wreck) { world.scene.remove(wreck.object); wreck.dispose(); }
      const list = world.engine?.systems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
      if (world.poi === instance) world.poi = null;
    },
  };
  world.poi = instance;
  return instance;
}

// ---------------------------------------------------------------------------

const giantSpec = CELESTIAL_SPECS['giant-orbit'];
const graveyardSpec = CELESTIAL_SPECS.graveyard;
const starSpec = CELESTIAL_SPECS['near-star'];

const asVec = (v) => [v.x, v.y, v.z];

/**
 * NO `systemPos` ON ANY OF THESE THREE, DELIBERATELY.
 *
 * They used to carry `[0.62, 0.18]`, `[-0.44, 0.71]` and `[0.08, -0.83]`. The field is
 * declared in `core/contracts.js` and read by NOTHING in `src/` — grep it — so those
 * numbers were never rendered anywhere, and they disagreed with the only other place
 * that computes the same quantity: `world/system.js` derives it from the node table as
 * `[spec.pos[0] / 900, spec.pos[1] / 900]` — and `giant-orbit`'s row is
 * `pos: [-120, -700]`, so that is `[-0.133, -0.778]`, nothing like `[0.62, 0.18]`.
 *
 * That was survivable while this file was dead. It is not survivable now that it is on
 * the game path: the map positions are in `world/system.js`'s TABLE, in metres on the
 * combat plane, and a second contradictory copy here is how the next session loses an
 * hour deciding which one the map is drawn from. If a POI ever needs an authored map
 * position, it belongs in the node table with every other node's, not in the lighting
 * definition.
 */
export const POI_GIANT_ORBIT = registerPOI({
  id: 'giant-orbit',
  name: 'Marrow Belt, High Orbit',
  kind: 'giant',
  paletteId: 'giant-orbit',
  keyLight: {
    direction: asVec(giantSpec.sunDir),
    color: getPOIPalette('giant-orbit').key.color,
    intensity: getPOIPalette('giant-orbit').key.intensity,
    angularRadius: getPOIPalette('giant-orbit').key.angularRadius,
  },
  fill: getPOIPalette('giant-orbit').fill,
  ibl: getPOIPalette('giant-orbit').ibl,
  grade: getPOIPalette('giant-orbit').grade,
  build(ctx, world) {
    // Captured rock left in orbit plus a shattered fleet; see FIELD_PRESETS.
    return assemble('giant-orbit', ctx, world, {
      /**
       * The shadow box is a SELF-SHADOWING box, not a scene box.
       *
       * These were 3600 / 3800 / 3200, which contradicted poi.js's own note that the
       * box had been halved to 1750 to get the normal-offset bias down. At 3600 m
       * over a 2048 map a texel is 3.5 m and the normal offset is 4.9 m, and a
       * contact shadow under a 40 m overhang does not survive being moved five
       * metres. A capital ship that does not shadow itself cannot read as massive,
       * and inter-ship shadows in vacuum land on nothing and are never seen — so the
       * box is sized to the hull plus its immediate escorts and nothing else.
       * Then it was MEASURED rather than reasoned about. `tools/shadowcheck.mjs`
       * diffs the close shot against the same frame with `key.castShadow = false`,
       * and at 2000 m the cast shadows covered 5.3% of the lit hull at a mean delta
       * of 51/255 — live, but eroded at the near end of every contact shadow by a
       * 2.6 m normal offset. 1400 m gives 1.37 m texels and a 1.85 m offset.
       */
      lighting: { shadowRadius: 1400 },
    });
  },
});

export const POI_GRAVEYARD = registerPOI({
  id: 'graveyard',
  name: 'The Graveyard',
  kind: 'graveyard',
  paletteId: 'graveyard',
  keyLight: {
    direction: asVec(graveyardSpec.sunDir),
    color: getPOIPalette('graveyard').key.color,
    intensity: getPOIPalette('graveyard').key.intensity,
    angularRadius: getPOIPalette('graveyard').key.angularRadius,
  },
  fill: getPOIPalette('graveyard').fill,
  ibl: getPOIPalette('graveyard').ibl,
  grade: getPOIPalette('graveyard').grade,
  build(ctx, world) {
    // Decades old, three liveries, almost no rock; see FIELD_PRESETS.
    return assemble('graveyard', ctx, world, {
      lighting: { shadowRadius: 1400 },
    });
  },
});

export const POI_NEAR_STAR = registerPOI({
  id: 'near-star',
  name: 'Perihelion Shoal',
  kind: 'star',
  paletteId: 'near-star',
  keyLight: {
    direction: asVec(starSpec.sunDir),
    color: getPOIPalette('near-star').key.color,
    intensity: getPOIPalette('near-star').key.intensity,
    angularRadius: getPOIPalette('near-star').key.angularRadius,
  },
  fill: getPOIPalette('near-star').fill,
  ibl: getPOIPalette('near-star').ibl,
  grade: getPOIPalette('near-star').grade,
  build(ctx, world) {
    /**
     * Dense sun-scorched rubble for the volumetrics to rake through; see
     * FIELD_PRESETS.
     *
     * The palette's full 0.72 god-ray strength is kept: this is the one POI whose
     * identity is volumetrics, and the rubble gives the pass something real to rake
     * through.
     */
    return assemble('near-star', ctx, world, {
      lighting: { shadowRadius: 1400 },
    });
  },
});

export const POIS = [POI_GIANT_ORBIT, POI_GRAVEYARD, POI_NEAR_STAR];

/**
 * Installer, in the shape ARCHITECTURE.md asks for. Importing this module is what
 * registers the POIs; this exists so integration has an explicit, idempotent call
 * site and a way to instantiate one.
 *
 *   import { installPOIs } from './world/lighting/pois.js';
 *   installPOIs(world);
 *   world.systems.pois.enter('giant-orbit', ctx);
 */
export function installPOIs(world) {
  if (world.systems.pois) return world.systems.pois;
  const api = {
    ids: POIS.map((p) => p.id),
    current: null,
    enter(id, ctx) {
      api.current?.dispose();
      const def = POIS.find((p) => p.id === id);
      if (!def) throw new Error(`[pois] unknown POI "${id}" (have: ${api.ids.join(', ')})`);
      api.current = def.build(ctx, world);
      return api.current;
    },
    leave() { api.current?.dispose(); api.current = null; },
  };
  world.register('pois', api);
  return api;
}

export { THREE };
