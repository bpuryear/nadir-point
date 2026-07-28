/**
 * WORLD SIM INSTALLER.
 *
 * `src/game.js` looks for `./world/index.js#installWorldSim` and calls it once, before
 * most content exists. So this must be idempotent, must not assume a player, must not
 * assume the material registry, and must not throw when the geometry stream has not
 * registered a single ship class - because on the day this lands, it has not.
 *
 * What it installs, in engine order:
 *
 *   20  faction-war   the world simulation. Runs whether or not anyone is watching.
 *   22  fleet-ai      formations, focus fire, retreat thresholds
 *   24  ship-ai       per-hull combat behaviour, written against the firing arcs
 *   26  travel        Plot-and-Burn: courses, the transit burn, interception, arrival
 *   28  discovery     passive contact, survey sweeps, salvaged intel
 *
 * All five sit in the 20-39 "AI, world sim" band from ARCHITECTURE.md, ahead of combat
 * at 40 and physics at 60, so an order decided this step is acted on this step.
 *
 * The read-only surface `docs/design/controls.md` 5.7 promised the travel and UI
 * streams is published as `world.systems.factionWar`:
 *
 *   poiState(id) -> { control, heat, contested, lastSeenTick }
 *   heatAt(id) | heatAt(x, z)
 *   controlAt(id) | controlAt(x, z)
 *   frontLine() -> Vector2[] segment pairs
 */

import { buildSystem, START_POI } from './system.js';
import { FactionWarSystem } from './factionWar.js';
import { TravelSystem } from './travel.js';
import { DiscoverySystem } from './discovery.js';
import { ShipAISystem } from '../sim/ai/shipAI.js';
import { FleetAISystem } from '../sim/ai/fleetAI.js';

export { buildSystem, StarSystem, POINode, SYSTEM_TABLE, START_POI } from './system.js';
export { FactionWarSystem, POIWarState, WAR_TUNING } from './factionWar.js';
export { TravelSystem, TRANSIT, legProfile } from './travel.js';
export { DiscoverySystem } from './discovery.js';
export { buildPOIInstance, enterPOI, POI_FIELDS } from './poi/index.js';

/**
 * @param {import('../core/world.js').World} world
 * @param {Object} [opts]
 * @param {boolean} [opts.autoAdopt]   AI takes over every non-player hull that spawns
 * @param {boolean} [opts.enterStart]  load the starting POI's content immediately
 * @returns {Object} the world-sim API, also registered as `world.systems.worldSim`
 */
export function installWorldSim(world, opts = {}) {
  if (world.systems.worldSim) return world.systems.worldSim;

  const system = buildSystem();

  const fleetAI = new FleetAISystem(world);
  const shipAI = new ShipAISystem(world, { autoAdopt: opts.autoAdopt !== false });
  const war = new FactionWarSystem(world, system, { fleetAI, shipAI });
  const travel = new TravelSystem(world, system, war, { fleetAI, shipAI });
  const discovery = new DiscoverySystem(world, system, war, {
    startPOI: opts.startPOI ?? START_POI,
    startBlips: opts.startBlips ?? 2,
  });

  world.register('system', system);
  world.register('factionWar', war);
  world.register('fleetAI', fleetAI);
  world.register('shipAI', shipAI);
  world.register('travel', travel);
  world.register('discovery', discovery);

  world.engine?.add(war);
  world.engine?.add(fleetAI);
  world.engine?.add(shipAI);
  world.engine?.add(travel);
  world.engine?.add(discovery);

  // The player starts standing in a place, not in an abstraction. `buildSystem`
  // recentres the map on the starting POI so this is a no-op on coordinates and a
  // real one on content: it is what makes the first frame a location.
  const startId = opts.startPOI ?? START_POI;
  const bootDressed = !!(world.poi || world.systems.lighting || world.systems.celestials || world.systems.fields);
  if (opts.enterStart !== false) {
    if (bootDressed) {
      // Integration already lit and dressed the start POI. Adopt it rather than
      // building a second sky on top of the first one.
      travel.adoptCurrent(startId);
      war.materialise(startId, {
        rng: world.rng.fork(`poi-enter:${startId}`),
        materials: world.systems.materials ?? null,
        palette: world.systems.palette ?? null,
        faction: 'player', lod: 0,
      });
    } else {
      try {
        travel.enter(startId);
      } catch (err) {
        console.warn('[world-sim] could not load the starting POI yet', err);
      }
    }
  }

  const api = {
    system, war, travel, discovery, shipAI, fleetAI,
    startPOI: startId,
    /** For the probe and the bench: run the war forward without rendering. */
    advance(seconds, step = 1 / 6) {
      let t = 0;
      while (t < seconds) {
        const dt = Math.min(step, seconds - t);
        war.fixedUpdate(dt);
        t += dt;
      }
      return war.snapshot();
    },
    snapshot: () => war.snapshot(),
    dispose() {
      war.dispose?.();
      shipAI.dispose?.();
      discovery.dispose?.();
      for (const s of [war, fleetAI, shipAI, travel, discovery]) {
        const list = world.engine?.systems;
        const i = list ? list.indexOf(s) : -1;
        if (i >= 0) list.splice(i, 1);
      }
      delete world.systems.worldSim;
    },
  };

  world.register('worldSim', api);
  return api;
}
