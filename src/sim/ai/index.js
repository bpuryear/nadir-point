/**
 * AI stream entry point.
 *
 * `src/game.js` probes `./world/index.js` first and falls back to this module, so both
 * paths resolve to the same installer. Everything the AI half exports is re-exported
 * here so a consumer that only wants ship behaviour does not have to import the whole
 * world simulation to get it.
 */

export { ShipAI, ShipAISystem, AIHelm, bestArcHeading, effectiveRange, PRESS } from './shipAI.js';
export {
  readSystems, makeSystemsRead, aimFor, biasFor, routeFor, AI_BIAS, AI_OVERROUTE,
} from './pressure.js';
export { Fleet, FleetAISystem, shipStrength, FORMATIONS } from './fleetAI.js';
export { pickClass, usingFallbackRoster, AI_ROLES } from './roster.js';
export { installWorldSim } from '../../world/index.js';
