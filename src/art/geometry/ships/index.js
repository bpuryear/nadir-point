/**
 * FACTION SHIP REGISTRY.
 *
 * Importing this module is what registers the hulls. `game.js` pulls it in through
 * `import.meta.glob('./art/geometry/*\/index.js')`, so nothing has to be wired into
 * a switch statement: the world sim's `pickClass()` finds these the moment the file
 * exists and stops using its fallback roster on its own.
 *
 * NINE CLASSES:
 *   coalition_corvette   Lancet      95 m    coalition_strikecraft  Bolt     18 m
 *   coalition_frigate    Ardent     210 m    concord_strikecraft    Shrike   18 m
 *   coalition_destroyer  Bulwark    480 m
 *   concord_corvette     Whipcord    95 m    derelict_ancient_hulk         3400 m
 *   concord_frigate      Meridian   210 m
 *   concord_destroyer    Peregrine  480 m
 *
 * Registration is idempotent at module scope but `registerShipClass` throws on a
 * duplicate id, so the guard below is real: two streams may both import this file.
 */

import { registerShipClass, getShipClass } from '../../../core/contracts.js';
import { COALITION_SHIPS } from './coalition.js';
import { CONCORD_SHIPS } from './concord.js';
import { DERELICT_SHIPS } from './derelict.js';

export const ALL_SHIP_CLASSES = [...COALITION_SHIPS, ...CONCORD_SHIPS, ...DERELICT_SHIPS];

for (const def of ALL_SHIP_CLASSES) {
  if (!getShipClass(def.id)) registerShipClass(def);
}

/**
 * Explicit, idempotent installer in the shape ARCHITECTURE.md asks for. The import
 * above has already done the work; this exists so integration has a call site and
 * a return value to assert on.
 */
export function installFactionShips() {
  for (const def of ALL_SHIP_CLASSES) {
    if (!getShipClass(def.id)) registerShipClass(def);
  }
  return ALL_SHIP_CLASSES.map((d) => d.id);
}

export { COALITION_SHIPS, CONCORD_SHIPS, DERELICT_SHIPS };
export { ANCIENT_HULK, buildHulkDebris, HULK_LENGTH, HULK_NODE_SPACING_M } from './derelict.js';
export { SURFACES, buildShip, auditParts } from './common.js';
