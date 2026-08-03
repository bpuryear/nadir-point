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

// The ammunition defaults are the source of truth this file validates against, so they
// are imported rather than duplicated. They live in `core/ammo.js`, which imports
// nothing.
//
// This used to import them from `sim/stores.js`, under a comment asserting that no cycle
// existed because "stores.js imports only core/events.js and sim/condition.js, neither of
// which imports this file". That enumerated stores.js's DIRECT imports and stopped one hop
// short: `sim/condition.js:27` imports `./meta/materials.js`, whose first line imports
// `getModule` from here. The cycle was real, and the stated check — importing stores.js
// standalone — could not have detected it, because it traverses the whole loop and
// completes silently. See `core/ammo.js` for the full account.
import { AMMO_SPEC, ammoClassOf } from './ammo.js';

// The adaptation constants — mass-class thresholds, the footprint quantum and the frozen
// per-mount reference spans — live in `core/units.js` because that is the file that owns
// every number carrying a unit. THE IMPORT IS SAFE AND HERE IS THE CHECK, stated the way
// the ammo.js header says it has to be stated: `core/units.js` has NO import statement of
// any kind (`grep -c "^import" src/core/units.js` -> 0), so it is a leaf and cannot close
// a cycle through this file or any other. That is the whole argument; it does not depend
// on enumerating anybody's transitive imports, which is the step that produced the false
// "no cycle" comment this file used to carry.
import { FIT } from './units.js';

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
 * SHIP SERVICES A MODULE MAY CLAIM TO CONNECT TO.
 *
 * This is the second half of the adaptation contract and it is one enum wide on
 * purpose. `cruiser.js#mountSeat` runs a service trunk out of every apron - a pipe run
 * that leaves the pan and disappears under a plate run eighty metres away. Today its
 * bearing is a hand-picked constant per mount. Under adaptation the bearing is the
 * bearing from the apron to the REAL thing: `CRUISER_SUBSYSTEMS`' reactor, salvage bay
 * or sensor array, projected into the seat's plane. So a magazine-fed gun's trunk runs
 * at the magazine and a sensor's runs at the array, and the ship looks like it was
 * plumbed for what is bolted to it.
 *
 * THE MODULE NAMES THE SERVICE; THE HULL OWNS WHERE IT IS. That split is the whole
 * feature (`hull-adaptation.md` §0, and it is the part of that document that survived).
 * A module that could name a POSITION would be a module deciding what the inside of
 * somebody else's ship looks like, and six modules would then disagree about where the
 * reactor is.
 *
 * The trunk is a CLAIM THAT A PATH EXISTS, not the path. Nothing simulates it, nothing
 * routes it, and it is drawn only where it lies on the skin.
 */
export const FIT_SERVICES = ['reactor', 'magazine', 'coolant', 'hold', 'sensor', 'hangar'];

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
 * THE ADAPTATION DECLARATION. Two fields, and the hull may read nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------
 * Seats made a module land INTO something. Adaptation makes THE HULL CHANGE FOR WHAT IS
 * FITTED: the apron grows to the module's root, the coaming rises with the load, the
 * plate runs multiply and lengthen, chocks appear under a cantilever, the service trunk
 * aims at a real subsystem, and a fairing bridges the apron rim to the module's root on
 * one or two sides. All of it is generated by `cruiser.js`, in the hull's vocabulary,
 * into buckets the bare hull already has.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS THIS SMALL, AND WHY IT WILL STAY THIS SMALL
 * ---------------------------------------------------------------------------
 * THE MODULE DECLARES A NEED, NEVER A SHAPE. The moment a module can name a shape -
 * `kind: 'blister'`, `kind: 'vane'`, a silhouette claim, a triangle budget of its own -
 * there are twenty-four authorities deciding what a weld looks like, and a hull with
 * twenty-four opinions about its own joints is a hull wearing modules rather than a
 * designed object. Every system that reads as designed has exactly one authority
 * deciding how a joint looks. Here that authority is the hull.
 *
 * So the resolved seat is a pure function of FOUR inputs:
 *
 *     seatFor(mountId, massClass, quantisedFootprint, service)
 *
 * two of which the module does not even declare. `mountId` is the mount. `massClass` is
 * DERIVED from `mass` (see `massClassOf`) and is therefore not something a module can
 * lie about without also lying about its handling penalty, which the player feels. Only
 * the two fields below are authored.
 *
 * The test is trivial to state and `modules/audit.mjs` enforces the half of it that does
 * not need the hull: TWO DIFFERENT MODULES WITH THE SAME MOUNT, THE SAME MASS CLASS AND
 * THE SAME QUANTISED FOOTPRINT MUST RESOLVE TO THE SAME SEAT. A per-module special case
 * fails that instantly and cannot be argued with.
 *
 * If a module needs something these four inputs cannot express, it expresses it ON ITS
 * OWN BODY inside its own 1200 triangles. That is what the module budget is for.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------------------------------------------------------
 *   a silhouette claim   `loadoutsAudit.mjs` already MEASURES the outline change. A
 *                        declared one is a number the module asserts and the audit has
 *                        to police - a lie detector for a lie nobody needs to tell.
 *   a triangle budget    the hull generates the geometry, so the hull owns the budget
 *                        (`BUDGET.cruiserFittedTris`). A module may not raise the hull's
 *                        ceiling by asking.
 *   a cantilever         derivable. The hull compares the footprint's half-extent with
 *                        its own pad radius; a module telling the hull how far it
 *                        overhangs a pad it cannot see would be a guess with a unit on it.
 *   a mirror flag        `hardpoints.js#mirrorX` already handles port -> starboard, and
 *                        adaptation is never mirrored: the two sponsons are 170 m apart
 *                        in z, so the same module fitted both sides produces two
 *                        different joints for free.
 *
 * @typedef {Object} FitDecl
 * @property {[number,number]} footprintM
 *     THE MODULE'S ROOT PLAN EXTENT AT THE MOUNT FACE, `[across, alongShip]`, metres.
 *     NOT its bounding box: a 300 m barrel standing on a 40 m base has a 40 m root, and
 *     the apron is grown to the base.
 *
 *     Defined so that it can be checked rather than believed: it is the plan extent of
 *     the module's LOD0 geometry within the FIRST 16 METRES OUTBOARD OF THE MOUNT FACE,
 *     measured in the seat's own two in-plane axes. `across` is the axis square to the
 *     ship's centreline in the seat plane and `alongShip` runs fore-aft, matching the
 *     `(across, along-ship)` tuples `cruiser.js#SEAT` is already written in; on the
 *     engine mount, whose seat faces aft, `alongShip` is the vertical, exactly as the
 *     SEAT table's own tuples are.
 *
 *     `modules/audit.mjs` builds every module and fails the gate if a declaration is
 *     more than 30% away from the measurement, so a bounding box declared here, or the
 *     two axes swapped, is caught by a tool and not by somebody looking at the ship.
 *     The measurement is seed-independent and LOD0-only (verified across two seeds; LOD1
 *     roots differ by up to 78%, which is why the check pins the LOD).
 *
 *     Consume it through `footprintNorm()` rather than raw: the metre values span
 *     90-820 m across the library and mean different things on different mounts.
 * @property {string} service
 *     One of `FIT_SERVICES`. What the module's trunk claims to connect to. REQUIRED, and
 *     required most of all on a weapon: a gun whose feed connects to nothing is the one
 *     case `hull-adaptation.md` §1.1 calls out by name, because "something goes down and
 *     inward from the mount" is the entire visual signature of "this hull was built for
 *     this weapon" and it is twelve triangles.
 *
 *     A magazine-fed weapon must say `magazine` - it eats rounds out of the ship's
 *     magazine, and that is not a matter of taste. Energy-fed weapons are free to say
 *     `reactor` or `coolant` (or, for the two salvage beams, `hold`, which is where what
 *     they cut actually goes).
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
 * @property {number} [mass]                   tonnes; affects handling, AND the sole
 *                                             input to the adaptation mass class - see
 *                                             `massClassOf`. Deriving the class rather
 *                                             than declaring it is what stops a module
 *                                             asking for a heavier seat than it earns.
 * @property {FitDecl} fit                     HOW IT MEETS THE SKIN. Required on every
 *                                             module in the geometry library; see the
 *                                             FitDecl typedef above and `validateFit`.
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

/**
 * THE ADAPTATION DECLARATION, VALIDATED. Two tiers, and the split is the same one the
 * armament header above argues for, for the same reason.
 *
 * ---------------------------------------------------------------------------
 * A MALFORMED `fit` THROWS.
 * ---------------------------------------------------------------------------
 * An unknown service, a footprint that is not two finite positive metre values, a
 * footprint outside `FIT.minFootprintM`..`maxFootprintM`, a magazine-fed weapon whose
 * trunk claims to run somewhere other than the magazine. Every one of these produces a
 * seat that is wrong rather than absent - a NaN apron radius, a trunk aimed at a
 * subsystem that is not there - and the failure would surface as a hull that looks
 * subtly broken at one mount, three waves later. This is the same call `contracts.js`
 * already makes on a missing hardpoint and on a burst deeper than its feed.
 *
 * ---------------------------------------------------------------------------
 * A MISSING `fit` WARNS HERE AND THROWS IN `modules/index.js`.
 * ---------------------------------------------------------------------------
 * This is not softness, it is where the throw belongs, and it is measured:
 *
 *   `src/sim/selftest.mjs:70` registers three synthetic modules - a cannon, a sensor
 *   mast and a reactor uprate - whose `build` returns an empty `THREE.Group`. They exist
 *   so the wreck yield table has real registry entries to match against. They are never
 *   seated on a hull and they have no geometry to have a root extent OF. A blanket throw
 *   in `registerModule` makes gate 1 of `tools/gates.mjs` - the whole sim stream - fail
 *   at import, and the fix would be in a file this stream does not own.
 *
 *   Measured: `node -e "import('./src/sim/ship.js'); import('./src/sim/salvage.js')"`
 *   then `allModules().length` prints 0. The sim stream never loads the geometry library,
 *   so the two registries do not overlap and the two rules cannot collide.
 *
 * So the completeness rule lives one layer out, in `art/geometry/modules/index.js`, which
 * is the file that IS the library: importing it registers all twenty-four modules and
 * then sweeps them, and a module added to `bow.js` without a `fit` refuses to load - the
 * game does not boot, the probes do not run, the audit exits non-zero. That is "fails at
 * import rather than producing a hull that silently does not adapt", asserted at the
 * boundary where it is true, and it cannot brick a sim fixture in somebody else's file.
 *
 * AND THIS ORDER IS THE LESSON FROM THE MUZZLE CHECK ABOVE, WHICH IS STILL A WARN. Both
 * of the throws below were landed as warns first and promoted inside the same commit,
 * after `node src/art/geometry/modules/audit.mjs` printed twenty-four clean fit rows. A
 * validator promoted before its data is authored is a validator that bricks boot on the
 * first miscount, in the one file every geometry module imports.
 */
function validateFit(def) {
  const fit = def.fit;
  if (fit === undefined || fit === null) {
    console.warn(
      `[contracts] module "${def.id}" declares no "fit". The hull cannot adapt to it: it `
      + 'will get the unfitted seat whatever is bolted on. Declare '
      + '{ footprintM: [across, alongShip], service } - see FitDecl in core/contracts.js. '
      + '(Modules in art/geometry/modules/** fail hard on this; see modules/index.js.)',
    );
    return;
  }
  const where = `[contracts] module "${def.id}" fit`;
  if (typeof fit !== 'object') throw new Error(`${where} must be an object, got ${typeof fit}`);

  const fp = fit.footprintM;
  if (!Array.isArray(fp) || fp.length !== 2) {
    throw new Error(`${where}.footprintM must be [across, alongShip] in metres, got ${JSON.stringify(fp)}`);
  }
  const AXIS = ['across', 'alongShip'];
  for (let i = 0; i < 2; i++) {
    const v = fp[i];
    if (!Number.isFinite(v) || v < FIT.minFootprintM || v > FIT.maxFootprintM) {
      throw new Error(
        `${where}.footprintM[${i}] (${AXIS[i]}) is ${v}; it must be a finite `
        + `${FIT.minFootprintM}..${FIT.maxFootprintM} m. This is the module's ROOT plan extent `
        + 'at the mount face, not its bounding box - a 300 m barrel on a 40 m base declares 40.',
      );
    }
  }
  if (!FIT_SERVICES.includes(fit.service)) {
    throw new Error(
      `${where}.service is ${JSON.stringify(fit.service)}; it must be one of `
      + `${FIT_SERVICES.join(', ')}. The module names the service and the hull decides where `
      + 'it is - that split is the feature.',
    );
  }
  // `massClassOf` is the third seat input and it is derived from `mass`, so a module that
  // declares a fit and no mass would silently sit in class 1 whatever it weighs.
  if (!(def.mass > 0)) {
    throw new Error(
      `${where} is declared but mass is ${def.mass}. The seat's load class is DERIVED from `
      + 'mass (units.js#FIT.massClassT); without it every fit is class 1.',
    );
  }
  // A magazine-fed weapon's trunk is its feed. This is checked rather than trusted
  // because both halves of it are already on the same definition: the weapon's ammo
  // class comes from `ammoClassOf`, so the check costs nothing and cannot drift.
  if (def.weapon) {
    const cls = ammoClassOf(def.weapon);
    if (cls != null && fit.service !== 'magazine') {
      throw new Error(
        `${where}.service is "${fit.service}" but weapon "${def.weapon.id}" is fed ${cls} out `
        + 'of the ship\'s magazine. The trunk is the feed; declare service: \'magazine\'.',
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
    validateFit(def);
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

// ---------------------------------------------------------------------------
// THE READ SIDE OF THE ADAPTATION CONTRACT
//
// Five pure functions, no state, no registry lookup, no module id anywhere. This is
// everything `cruiser.js#mountSeat` is allowed to know about what is bolted to it, and
// it is deliberately small enough to fit in one screen: a hull that can reach further
// than this is a hull that can special-case, and a hull that special-cases is not
// adapting, it is a lookup table with a rot date.
//
// A note for the caller that matters more than it looks: NONE of these touch the built
// mesh. The seat is resolved from the declaration alone, so it can be built before, or
// without, the module's own geometry - which is what keeps the incremental reskin at
// ~3.1 ms and what lets the ninety-entry seat cache be keyed at all (`fitKey`).
// ---------------------------------------------------------------------------

/**
 * The seat's load class, 1..3, DERIVED from tonnage. Never declared, never overridable.
 *
 * The apron's coaming rises 3 / 5 / 8 m proud on this number and the plate runs go
 * `1 + massClass`, so it is the single strongest "the hull was built for this" cue. A
 * module cannot buy a heavier-looking seat without also buying the handling penalty,
 * which the player feels in the turn rate. `tier` deliberately drives NOTHING here: tier
 * is an economic quantity, and a T1 240 t sensor mast and a T1 1400 t armour belt are
 * not the same load.
 *
 * @param {{mass?:number}} def
 * @returns {1|2|3}
 */
export function massClassOf(def) {
  const t = def?.mass;
  const [light, medium] = FIT.massClassT;
  if (!(t > 0)) return 1;
  return t < light ? 1 : t < medium ? 2 : 3;
}

/**
 * The declared footprint, snapped to `FIT.footprintQuantumM`. This is what the seat is
 * keyed on: quantising is what collapses twenty-four modules to at most ninety distinct
 * seats and makes a repeat fit a cache hit instead of a rebuild. 8 m is under a pixel at
 * the LOD1 switch, so nothing is visible for it.
 *
 * @param {[number,number]} footprintM
 * @returns {[number,number]}
 */
export function quantiseFootprintM(footprintM) {
  const q = FIT.footprintQuantumM;
  return [Math.round(footprintM[0] / q) * q, Math.round(footprintM[1] / q) * q];
}

/**
 * The footprint as 0..1 WITHIN ITS MOUNT'S FROZEN REFERENCE SPAN — and this, not the raw
 * metres, is what a seat builder should scale an apron by.
 *
 * The raw numbers span 90-820 m across the library and they do not mean the same thing on
 * two different mounts: 200 m along-ship is the largest bow root there is and the
 * smallest ventral one. A hull that consumed metres directly would need a table of
 * per-mount scale factors, that table would be a second place the mount families are
 * described, and it would drift from `units.js#FIT.footprintRefM` the first time a module
 * was retouched. So the normalisation lives here, once.
 *
 * The span is FROZEN DATA, not the min/max of the registered modules — see the long note
 * on `FIT.footprintRefM`. Out-of-span footprints clamp, which is the correct failure: a
 * twenty-fifth module bigger than anything on its mount gets the biggest seat that mount
 * has, and it does not resize the other twenty-four.
 *
 * @param {string} mountId  the mount being FITTED, which for a mirrored broadside module
 *                          is 'starboard' while `def.hardpoint` still says 'port'
 * @param {[number,number]} footprintM
 * @returns {[number,number]} [across, alongShip], each 0..1
 */
export function footprintNorm(mountId, footprintM) {
  const ref = FIT.footprintRefM[mountId];
  if (!ref) throw new Error(`[contracts] footprintNorm: no reference span for mount "${mountId}"`);
  const at = (v, [lo, hi]) => (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5);
  return [at(footprintM[0], ref.across), at(footprintM[1], ref.along)];
}

/**
 * Everything the hull may know about a fit, resolved, in one object.
 *
 * `mount` is passed in rather than read off the def because a port-authored module fitted
 * to the starboard sponson is a DIFFERENT SEAT: the two sponsons are 170 m apart in z, so
 * the same module produces two different joints, and that asymmetry is deliberate (F13).
 *
 * Returns `null` for a module with no declaration, so a caller can fall back to the
 * unfitted seat rather than crash. In `art/geometry/modules/**` that case cannot arise -
 * `modules/index.js` refuses to load a library module without a fit - but the sim's own
 * registry fixtures have no geometry and no fit, and this function is reachable from the
 * refit screen.
 *
 * @param {Object} def
 * @param {string} [mountId]
 * @returns {{mount:string, massClass:1|2|3, footprintM:[number,number],
 *            footprintQ:[number,number], norm:[number,number], service:string} | null}
 */
export function fitProfile(def, mountId = def?.hardpoint) {
  if (!def?.fit) return null;
  const footprintM = def.fit.footprintM;
  return {
    mount: mountId,
    massClass: massClassOf(def),
    footprintM,
    footprintQ: quantiseFootprintM(footprintM),
    norm: footprintNorm(mountId, footprintM),
    service: def.fit.service,
  };
}

/**
 * The seat cache key, and the statement of the determinism rule in one line: two fits
 * with the same key MUST produce byte-identical seat geometry.
 *
 * Note what is not in it - the module id, the name, the faction, the tier, the triangle
 * count. If a seat ever differs between two modules with equal keys, something read
 * something it was not given.
 *
 * @param {Object} def
 * @param {string} [mountId]
 * @returns {string|null}
 */
export function fitKey(def, mountId = def?.hardpoint) {
  const p = fitProfile(def, mountId);
  return p ? `${p.mount}|${p.massClass}|${p.footprintQ[0]}|${p.footprintQ[1]}|${p.service}` : null;
}

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
