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

// The ammunition defaults live with the magazine simulation, and duplicating them
// here to avoid the import would be a second source of truth for the number this
// file exists to check against. `core/persistence.js` already reaches into
// `sim/meta/events.js` for the same reason. `sim/stores.js` imports only
// `core/events.js` and `sim/condition.js`, neither of which imports this file, so
// there is no cycle — verified by importing stores.js standalone.
import { AMMO_SPEC, ammoClassOf } from '../sim/stores.js';

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
 * Sub-part kinds inside a module. A cannon bank is not one HP bar: it is barrels, a
 * feed, a traverse ring and the pad it is bolted to, and each one fails differently.
 * Killing the `mount` drops the whole module into space INTACT, which is the point.
 */
export const PART_KINDS = ['output', 'feed', 'traverse', 'cooling', 'mount'];

/**
 * Ammunition classes. `null` on a WeaponDef means the weapon is energy-fed and costs
 * reactor charge instead - the two-currency decision.
 */
export const AMMO_CLASSES = ['shell', 'railslug', 'missile', 'flakcan', 'pdslug'];

/**
 * @typedef {Object} PartDef
 * @property {string} id
 * @property {string} label                    second-tier label in the subsystem ring
 * @property {string} kind                     one of PART_KINDS
 * @property {number} hpShare                  0..1 of the module's HP held by this part
 * @property {[number,number,number]} [offset] from the module origin, metres
 * @property {number} [radius]                 hit sphere, metres
 * @property {number} [salvageValue]           0..1 share of the module's salvage
 */

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
 * @property {string|null} [ammoClass]         one of AMMO_CLASSES; null/absent = energy-fed
 * @property {number} [ready]                  rounds held in the mount's own feed
 * @property {number} [reload]                 seconds, ship magazine -> ready feed
 * @property {number} [heatPerShot]            0..1 of the mount's thermal capacity per shot
 * @property {number} [coolRate]               0..1 of thermal capacity shed per second
 * @property {number} [spread]                 dispersion in radians at nominal heat
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
 * @property {Array<[number,number,number]>} [muzzles]
 *                                             WHERE THE SHOTS COME OUT, in module space,
 *                                             one entry per `weapon.shotsPerBurst`, in the
 *                                             order the barrels are authored.
 *
 *                                             This is DATA ON THE DEFINITION and the sim
 *                                             must never derive it from the built mesh.
 *                                             Emitter geometry is LOD-gated — `port_beam_array`
 *                                             draws three glow discs at LOD0 and one at
 *                                             LOD1/2 — so a mesh-derived count is a
 *                                             simulation quantity that changes with the
 *                                             graphics quality setting, and a seeded run
 *                                             would stop reproducing between two clients.
 *                                             The declared list is the LOD0 set at every
 *                                             quality level.
 *
 *                                             A port-authored module fitted to the starboard
 *                                             mount has its geometry mirrored across the YZ
 *                                             plane (`hardpoints.js#mirrorX`); its muzzles
 *                                             must be mirrored the same way, x -> -x, by the
 *                                             consumer.
 * @property {Object} [grants]                 passive effects: {hangarBays, salvageRate, powerOutput, thrust, turnRate, cargo, sensorRange, shieldCapacity}
 * @property {number} [mass]                   tonnes; affects handling
 * @property {string[]} [silhouetteTags]       what it should read as at distance
 * @property {PartDef[]} [parts]               sub-parts; sim/subparts.js supplies defaults
 * @property {number} [volume]                 cubic metres it occupies in the hold. The
 *                                             hold is measured in m3, not slots, so a
 *                                             destroyer reactor is genuinely bulky.
 *                                             Optional: `sim/meta/cargo.js#moduleVolume`
 *                                             derives one from mass and role when a
 *                                             module does not declare it, so authoring
 *                                             this is an override, never an obligation.
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

/**
 * Item kinds. An ITEM IS NOT A MODULE. A module is bolted to one of six hardpoints and
 * is part of the silhouette; an item is carried in the hold, occupies volume, and is
 * spent. The scope decision puts items in on the Everspace-2 principle: a device that
 * CHANGES WHAT YOU CAN DO is worth more than a device that adds 8% damage, so every
 * item here is a new verb and none of them is a stat.
 *
 *   consumable  one-shot, consumed on use
 *   device      one-shot, but its effect is a timed window rather than an instant
 */
export const ITEM_KINDS = ['consumable', 'device'];

/**
 * @typedef {Object} ItemDef
 * @property {string} id
 * @property {string} name
 * @property {string} kind                     one of ITEM_KINDS
 * @property {string} description              one sentence, functional. Codex card rule.
 * @property {number} volume                   cubic metres per unit in the hold
 * @property {number} [maxStack]
 * @property {Object} [buildCost]              refined materials to fabricate one
 * @property {string} [requires]               short human-readable precondition
 * @property {(ctx:Object) => {ok:boolean, reason?:string}} activate
 */

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

const _modules = new Map();
const _shipClasses = new Map();
const _pois = new Map();
const _items = new Map();

const REQUIRED = {
  module: ['id', 'name', 'hardpoint', 'tier', 'faction', 'build', 'triBudget'],
  ship: ['id', 'name', 'faction', 'role', 'length', 'mass', 'maxSpeed', 'accel', 'turnRate', 'hullHP', 'build', 'triBudget'],
  poi: ['id', 'name', 'kind', 'keyLight', 'build'],
  item: ['id', 'name', 'kind', 'description', 'volume', 'activate'],
};

/**
 * TWO ARMAMENT INVARIANTS, AND THEY CARRY DELIBERATELY DIFFERENT WEIGHTS.
 *
 * ---------------------------------------------------------------------------
 * 1. THE FEED IS AT LEAST AS DEEP AS THE BURST IS LONG.  **THROWS**
 * ---------------------------------------------------------------------------
 * `WeaponMount.readyMax` is `def.ready ?? AMMO_SPEC[class].ready` (sim/ship.js).
 * If that is smaller than `shotsPerBurst` the mount runs dry mid-burst every single
 * time it fires: `consumeShot` returns false, `burstRemaining` is zeroed and the
 * cooldown is forced up before a full reload. `dorsal_missile_cells` did exactly
 * that for the whole life of the project — six declared cells, four launched — and
 * nothing caught it because nothing compared the two numbers. This throws because
 * it has exactly one known violator and that violator is fixed in this same commit.
 *
 * ---------------------------------------------------------------------------
 * 2. ONE MUZZLE PER SHOT.  **WARNS**
 * ---------------------------------------------------------------------------
 * This one deliberately does NOT throw, and the reason is worth writing down:
 * `registerModule` runs at import time, so a throw here does not fail a test — it
 * refuses to boot the game. Invariant 1 is checked against numbers that have been
 * in the tree for months and has one known violator with a known fix. Invariant 2
 * is checked against `muzzles` arrays authored fresh in the same commit as this
 * check, across thirteen modules, where a single miscounted barrel would brick
 * boot at import time for every stream working in parallel.
 *
 * So it warns, loudly, with both numbers.
 *
 * THE PRECONDITION FOR PROMOTING IT TO A THROW IS ALREADY MET, and is recorded here
 * so whoever does it does not have to re-establish it. This spot-check:
 *
 *   node -e "import('./src/art/geometry/modules/index.js').then(async()=>{ \
 *     const {allModules}=await import('./src/core/contracts.js'); \
 *     for(const d of allModules()) if(d.weapon) \
 *       console.log(d.id, d.muzzles?.length??0, d.weapon.shotsPerBurst)})"
 *
 * prints THIRTEEN equal pairs and no warnings, and did so on three separately built
 * trees on the commit that introduced it. It is still a warn only because six agents
 * are editing this tree in parallel right now, and an import-time throw in the one
 * file every geometry module imports turns any half-merged branch into a dead boot
 * for everybody. Promote it — and the shape check below, which matters more, because
 * a malformed entry yields NaN in the sim rather than a crash — in the integration
 * pass, when the tree has one writer. It is a two-line change.
 */
function validateArmament(def) {
  const w = def.weapon;

  // (1) Feed depth. Energy-fed weapons have no magazine and are exempt.
  const cls = ammoClassOf(w);
  if (cls != null) {
    const ready = w.ready ?? AMMO_SPEC[cls]?.ready ?? 0;
    if (ready < w.shotsPerBurst) {
      throw new Error(
        `[contracts] module "${def.id}" weapon "${w.id}" holds ${ready} ready round(s) of `
        + `${cls} but fires ${w.shotsPerBurst} per burst. It would run dry mid-burst on every `
        + `shot. Declare "ready: ${w.shotsPerBurst}" on the weapon, or shorten the burst.`,
      );
    }
  }

  // (2) One muzzle per shot. See the header: warn, do not throw.
  const n = def.muzzles?.length ?? 0;
  if (n !== w.shotsPerBurst) {
    console.warn(
      `[contracts] module "${def.id}" declares ${n} muzzle(s) against shotsPerBurst `
      + `${w.shotsPerBurst}. Every shot in a burst needs its own origin or the whole burst `
      + `leaves from one point on the hull.`,
    );
  }
  for (let i = 0; i < n; i++) {
    const m = def.muzzles[i];
    if (!Array.isArray(m) || m.length !== 3 || !m.every((v) => Number.isFinite(v))) {
      console.warn(
        `[contracts] module "${def.id}" muzzle[${i}] is not a finite [x,y,z] triple: `
        + `${JSON.stringify(m)}. It will read as NaN in the sim.`,
      );
    }
  }
}

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
    if (def.weapon?.ammoClass != null && !AMMO_CLASSES.includes(def.weapon.ammoClass)) {
      throw new Error(`[contracts] module "${def.id}" ammoClass "${def.weapon.ammoClass}" is not an AMMO_CLASS`);
    }
    if (def.weapon) validateArmament(def);
    // Sub-parts are optional. When declared they must be legible aim points, so the
    // budget is enforced here rather than discovered as an unusable UI ring later.
    if (def.parts) {
      if (!Array.isArray(def.parts) || def.parts.length > 4) {
        throw new Error(`[contracts] module "${def.id}" declares ${def.parts?.length ?? '?'} parts; 1..4 is the budget`);
      }
      let share = 0;
      for (const part of def.parts) {
        if (!part.id || !PART_KINDS.includes(part.kind)) {
          throw new Error(`[contracts] module "${def.id}" part "${part.id ?? '<no id>'}" has unknown kind "${part.kind}"`);
        }
        share += part.hpShare ?? 0;
      }
      if (share > 1.0001) {
        throw new Error(`[contracts] module "${def.id}" part hpShare sums to ${share.toFixed(2)}, must be <= 1`);
      }
    }
  }
  if (kind === 'item') {
    if (!ITEM_KINDS.includes(def.kind)) {
      throw new Error(`[contracts] item "${def.id}" declares unknown kind "${def.kind}"`);
    }
    if (!(def.volume > 0)) {
      throw new Error(`[contracts] item "${def.id}" must declare a positive volume in m3`);
    }
    if (typeof def.activate !== 'function') {
      throw new Error(`[contracts] item "${def.id}" has no activate(ctx)`);
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

/**
 * Register a carried item. Re-registering the same id is a NO-OP rather than a throw,
 * unlike the geometry registries: the item library lives in `sim/meta/items.js` and is
 * imported by an installer that must be safe to run twice.
 */
export function registerItem(def) {
  if (_items.has(def.id)) return _items.get(def.id);
  validate('item', def);
  _items.set(def.id, def);
  return def;
}

export const getModule = (id) => _modules.get(id);
export const getShipClass = (id) => _shipClasses.get(id);
export const getPOI = (id) => _pois.get(id);
export const getItem = (id) => _items.get(id);

export const allModules = () => Array.from(_modules.values());
export const allShipClasses = () => Array.from(_shipClasses.values());
export const allPOIs = () => Array.from(_pois.values());
export const allItems = () => Array.from(_items.values());

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
    items: _items.size,
  };
}
