/**
 * FACTION SHIP REGISTRY.
 *
 * Importing this module is what registers the hulls. `game.js` pulls it in through
 * `import.meta.glob('./art/geometry/*\/index.js')`, so nothing has to be wired into
 * a switch statement: the world sim's `pickClass()` finds these the moment the file
 * exists and stops using its fallback roster on its own.
 *
 * THIRTEEN CLASSES. Two navies of five capital hulls plus a strike craft each, and
 * the derelict hulk. The four marked NEW closed two gaps: neither navy had a
 * carrier or a support ship, and the size ladder jumped 480 -> 1400 with nothing
 * in between.
 *
 *   COALITION                              CONCORD
 *   coalition_corvette   Lancet     95 m   concord_corvette   Whipcord    95 m
 *   coalition_frigate    Ardent    210 m   concord_frigate    Meridian   210 m
 *   coalition_monitor    Sledge    300 m * concord_escort     Halcyon    300 m *
 *   coalition_destroyer  Bulwark   480 m   concord_destroyer  Peregrine  480 m
 *   coalition_carrier    Anvil     900 m * concord_tender     Solace     620 m *
 *   coalition_strikecraft Bolt      18 m   concord_strikecraft Shrike     18 m
 *
 *   derelict_ancient_hulk                                              3400 m
 *
 * NOTE FOR THE WORLD-SIM STREAM: `sim/ai/roster.js#pickClass` resolves by `role`
 * and its callers only ever ask for corvette / frigate / destroyer, so the four
 * new roles ('monitor', 'carrier', 'escort', 'tender') will never be spawned by the
 * faction war as it stands. Adding them to the war's spawn table is a change in
 * that stream's files and is reported rather than made here.
 *
 * Registration is idempotent at module scope but `registerShipClass` throws on a
 * duplicate id, so the guard below is real: two streams may both import this file.
 *
 * BEFORE YOU CHANGE A HULL, run the headless audit. It needs no browser, no server
 * and no GPU, and it takes under a second:
 *
 *     node src/art/geometry/ships/audit.mjs
 *
 * It prints triangles, draw buckets and MEASURED extents per class against the
 * declared length and the triangle budget, then runs the hull-line rules from
 * docs/design/ship-language.md §2 over every primary station table. It exits
 * non-zero on a budget breach, on a length that has drifted more than 5% from its
 * declared value, or on a hull-line failure that is not explicitly exempt.
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
