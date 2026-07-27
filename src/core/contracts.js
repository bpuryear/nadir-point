/**
 * SHARED CONTRACTS.
 *
 * Every stream in this project codes against the shapes in this file. If you are
 * adding a module, a ship class, a weapon or a point of interest, you register it
 * here and the rest of the game picks it up without further wiring.
 *
 * These are JSDoc typedefs plus runtime registries plus a dev-time validator.
 * The validator is not decoration: a module that silently fails to declare its
 * hardpoint would render fine and then be uninstallable, which is a bug that takes
 * an hour to find and one line to prevent.
 */

/** The six hardpoints on the player cruiser. Order matters for UI layout. */
export const HARDPOINTS = ['bow', 'dorsal', 'ventral', 'port', 'starboard', 'engine'];

/** Subsystem kinds. Targetable on every ship, player included. */
export const SUBSYSTEM_KINDS = ['engine', 'weapon', 'reactor', 'hangar', 'sensor'];

/** Power channels. The reactor divides its output between exactly these. */
export const POWER_CHANNELS = ['shields', 'weapons', 'engines', 'sensors'];

/** Faction ids. `derelict` is the ancient third party - hazard, not combatant. */
export const FACTIONS = ['coalition', 'concord', 'derelict', 'player'];

/** Weapon archetypes. Drives VFX selection, arc defaults and salvage identity. */
export const WEAPON_TYPES = ['cannon', 'beam', 'rail', 'missile', 'flak', 'pd', 'lance', 'mining'];

/**
 * @typedef {Object} BuildContext
 * @property {import('./rng.js').RNG} rng      deterministic stream for this build
 * @property {Object} materials                the shared material registry
 * @property {Object} palette                  active palette (POI or faction)
 * @property {string} faction
 * @property {number} lod                      0 = full detail, 1 = mid, 2 = far
 */

/**
 * @typedef {Object} HardpointDef
 * @property {string} id                       one of HARDPOINTS
 * @property {[number,number,number]} anchor   local-space mount point on the hull, metres
 * @property {[number,number,number]} normal   outward facing of the mount
 * @property {number} yawCentre                radians, 0 = ship forward (+Z)
 * @property {number} yawWidth                 total arc width in radians for weapons here
 * @property {number} maxTier                  highest module tier this mount accepts
 * @property {number} structureHP              breach threshold; hitting 0 loses the module
 */

/**
 * @typedef {Object} WeaponDef
 * @property {string} id
 * @property {string} name
 * @property {string} type                     one of WEAPON_TYPES
 * @property {number} range                    metres
 * @property {number} damage                   per shot
 * @property {number} shotsPerBurst
 * @property {number} burstInterval            seconds between shots inside a burst
 * @property {number} cooldown                 seconds between bursts
 * @property {number} projectileSpeed          m/s; Infinity for hitscan beams
 * @property {number} tracking                 radians/sec the mount can traverse
 * @property {number} powerDraw                units of reactor output when firing
 * @property {number} [yawWidth]               overrides the hardpoint arc
 * @property {number} [pitchWidth]             vertical arc; PD is near-spherical
 * @property {number} [subsystemAccuracy]      0..1 chance of hitting the aimed subsystem
 */

/**
 * @typedef {Object} SubsystemDef
 * @property {string} id
 * @property {string} kind                     one of SUBSYSTEM_KINDS
 * @property {number} hp
 * @property {[number,number,number]} position local-space centre
 * @property {number} radius                   hit sphere, metres
 * @property {number} salvageValue             0..1 share of the hull's salvage it carries
 * @property {string} [label]                  shown in the targeting UI
 */

/**
 * @typedef {Object} ModuleDef
 * @property {string} id
 * @property {string} name
 * @property {string} hardpoint                one of HARDPOINTS
 * @property {number} tier                     1..3
 * @property {string} faction                  visual identity it carries onto your hull
 * @property {string} description
 * @property {(ctx:BuildContext) => import('three').Object3D} build
 * @property {number} triBudget                hard ceiling, enforced by the geometry audit
 * @property {WeaponDef} [weapon]
 * @property {Object} [grants]                 passive effects: {hangarBays, salvageRate, powerOutput, thrust, turnRate, cargo, sensorRange, shieldCapacity}
 * @property {number} [mass]                   tonnes; affects handling
 * @property {string[]} [silhouetteTags]       what it should read as at distance
 */

/**
 * @typedef {Object} ShipClassDef
 * @property {string} id
 * @property {string} name
 * @property {string} faction
 * @property {string} role                     'fighter'|'corvette'|'frigate'|'destroyer'|'cruiser'|'station'|'hulk'
 * @property {number} length                   metres, must match units.js HULL_LENGTH
 * @property {number} mass                     tonnes
 * @property {number} maxSpeed                 m/s
 * @property {number} accel                    m/s^2
 * @property {number} turnRate                 radians/sec at zero speed
 * @property {number} hullHP
 * @property {(ctx:BuildContext) => import('three').Object3D} build
 * @property {SubsystemDef[]} subsystems
 * @property {WeaponDef[]} weapons
 * @property {number} triBudget
 * @property {boolean} [planeLocked]           true for capitals, false for strike craft
 */

/**
 * @typedef {Object} POIDef
 * @property {string} id
 * @property {string} name
 * @property {string} kind                     'battlefield'|'belt'|'station'|'graveyard'|'yard'|'star'|'giant'
 * @property {string} paletteId
 * @property {Object} keyLight                 {direction:[x,y,z], color:number, intensity:number, angularRadius:number}
 * @property {Object} fill                     {color:number, intensity:number}
 * @property {Object} ibl                      parameters for the procedural environment map
 * @property {Object} grade                    per-POI post overrides {exposure, bloom, godrays, vignette, fogDensity}
 * @property {(ctx:BuildContext, world:any) => void} build
 * @property {[number,number]} systemPos       position on the system map, arbitrary units
 */

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

const _modules = new Map();
const _shipClasses = new Map();
const _pois = new Map();

const REQUIRED = {
  module: ['id', 'name', 'hardpoint', 'tier', 'faction', 'build', 'triBudget'],
  ship: ['id', 'name', 'faction', 'role', 'length', 'mass', 'maxSpeed', 'accel', 'turnRate', 'hullHP', 'build', 'triBudget'],
  poi: ['id', 'name', 'kind', 'keyLight', 'build'],
};

function validate(kind, def) {
  const missing = REQUIRED[kind].filter((k) => def[k] === undefined || def[k] === null);
  if (missing.length) {
    throw new Error(`[contracts] ${kind} "${def.id ?? '<no id>'}" is missing required field(s): ${missing.join(', ')}`);
  }
  if (kind === 'module') {
    if (!HARDPOINTS.includes(def.hardpoint)) {
      throw new Error(`[contracts] module "${def.id}" declares unknown hardpoint "${def.hardpoint}"`);
    }
    if (def.tier < 1 || def.tier > 3) {
      throw new Error(`[contracts] module "${def.id}" tier ${def.tier} outside 1..3`);
    }
    if (!FACTIONS.includes(def.faction)) {
      throw new Error(`[contracts] module "${def.id}" declares unknown faction "${def.faction}"`);
    }
    if (def.weapon && !WEAPON_TYPES.includes(def.weapon.type)) {
      throw new Error(`[contracts] module "${def.id}" weapon type "${def.weapon.type}" is not a WEAPON_TYPE`);
    }
  }
  if (kind === 'ship') {
    for (const sub of def.subsystems ?? []) {
      if (!SUBSYSTEM_KINDS.includes(sub.kind)) {
        throw new Error(`[contracts] ship "${def.id}" subsystem "${sub.id}" has unknown kind "${sub.kind}"`);
      }
    }
  }
  return def;
}

export function registerModule(def) {
  validate('module', def);
  if (_modules.has(def.id)) throw new Error(`[contracts] duplicate module id "${def.id}"`);
  _modules.set(def.id, def);
  return def;
}

export function registerShipClass(def) {
  validate('ship', def);
  if (_shipClasses.has(def.id)) throw new Error(`[contracts] duplicate ship class id "${def.id}"`);
  _shipClasses.set(def.id, def);
  return def;
}

export function registerPOI(def) {
  validate('poi', def);
  if (_pois.has(def.id)) throw new Error(`[contracts] duplicate POI id "${def.id}"`);
  _pois.set(def.id, def);
  return def;
}

export const getModule = (id) => _modules.get(id);
export const getShipClass = (id) => _shipClasses.get(id);
export const getPOI = (id) => _pois.get(id);

export const allModules = () => Array.from(_modules.values());
export const allShipClasses = () => Array.from(_shipClasses.values());
export const allPOIs = () => Array.from(_pois.values());

export const modulesForHardpoint = (hp) => allModules().filter((m) => m.hardpoint === hp);
export const shipClassesForFaction = (f) => allShipClasses().filter((s) => s.faction === f);

/** Used by the geometry audit tool and the refit screen. */
export function registryReport() {
  const byHardpoint = {};
  for (const hp of HARDPOINTS) byHardpoint[hp] = modulesForHardpoint(hp).length;
  return {
    modules: _modules.size,
    modulesByHardpoint: byHardpoint,
    shipClasses: _shipClasses.size,
    pois: _pois.size,
  };
}
