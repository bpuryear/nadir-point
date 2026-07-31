/**
 * ============================================================================
 * THE HARDPOINT ATTACHMENT CONTRACT
 * ============================================================================
 *
 * Read this before you write a module. The whole point of the convention below is
 * that a module author never writes a single line of rotation maths, because
 * rotation maths at an attachment seam is where 90% of the bugs in a system like
 * this come from.
 *
 * ---------------------------------------------------------------------------
 * 1. SOCKETS
 * ---------------------------------------------------------------------------
 * Each of the six hardpoints ('bow','dorsal','ventral','port','starboard','engine')
 * has a SOCKET: an empty THREE.Object3D parented to the hull root.
 *
 *   - The socket is POSITIONED at the mount point (`def.anchor`, hull-local metres).
 *   - The socket has NO ROTATION and NO SCALE relative to the hull. Ever.
 *     `socket.quaternion` is identity and `socket.scale` is (1,1,1) by definition.
 *
 * Because the socket is unrotated, ship space and socket space differ only by a
 * translation. That is the entire trick.
 *
 * ---------------------------------------------------------------------------
 * 2. WHAT A MODULE'S build(ctx) MUST RETURN
 * ---------------------------------------------------------------------------
 * An `THREE.Object3D` authored in SHIP SPACE ORIENTATION:
 *
 *      +Z is ship FORWARD          (toward the bow)
 *      +Y is ship UP               (toward the dorsal spine)
 *      +X is ship STARBOARD        (right, looking forward)
 *      the object's ORIGIN sits exactly AT THE MOUNT POINT
 *
 * So a port cannon bank is modelled around the origin with its barrels pointing
 * roughly -X (outboard to port) and its baseplate at y = 0. A bow lance is modelled
 * with its muzzle out along +Z. A dorsal turret has its ring at y = 0 and its mass
 * above it.
 *
 * The attachment system does `socket.add(object)` and then applies ONE fixed seating
 * transform per mount - a 7 m standoff along the outward normal and a 3-7 degree
 * tilt, both derived from the mount id and therefore identical on every run. See
 * "SEATING" below for why. It is not a correction and you must not pre-compensate
 * for it: author your module square, with its origin at the mount point, and the
 * system will sit it proud and slightly crooked because that is what a hull of
 * bolted-on salvage looks like. If your module looks wrong on the hull beyond that,
 * your module is authored wrong - do not "fix" it by rotating it at the call site.
 *
 * A module that must seat flush and square (a drive that plugs into the drive well,
 * a ring that has to be concentric with something) sets `def.rigidMount = true`.
 *
 * `def.normal` tells you which way is OUTBOARD for that mount, so you know which
 * direction your mass should grow. It is documentation, not a transform.
 *
 * ---------------------------------------------------------------------------
 * 3. MIRRORING (port <-> starboard)
 * ---------------------------------------------------------------------------
 * YOU AUTHOR THE PORT VERSION ONLY. Register it with `hardpoint: 'port'`. When the
 * player installs it on the starboard mount, `attachModule` mirrors it across the
 * YZ plane for you.
 *
 * The mirror is NOT `scale.x = -1`. A negative-determinant transform inverts face
 * winding, three's normal matrix then flips the normals to compensate, and the
 * rasteriser happily culls every front face - the module renders inside-out, and it
 * renders inside-out in the shadow map too, which is the version of the bug that
 * takes a day to find. `mirrorX()` instead:
 *
 *   - rebuilds every geometry with x negated AND the triangle winding reversed
 *     (cached per source geometry, so installing the same module twice is cheap)
 *   - conjugates every node transform by the mirror M = diag(-1,1,1):
 *       position -> (-x, y, z)
 *       rotation -> quaternion (x, -y, -z, w)     [ = M R M, a proper rotation ]
 *       scale    -> unchanged                     [ M S M = S ]
 *
 * The result has a POSITIVE determinant everywhere, so winding, culling, shadows
 * and normals are all correct, and any empty Object3D you left in the module as a
 * muzzle or exhaust marker lands in the mirrored place with a valid orientation.
 *
 * A module that is genuinely handed (an asymmetric loading mechanism, stencilled
 * text) can opt out with `def.noMirror = true`, in which case the starboard copy is
 * the unmirrored object and it is on you to make it read.
 *
 * ---------------------------------------------------------------------------
 * 4. FIRING ARCS
 * ---------------------------------------------------------------------------
 * `yawCentre` is radians from ship forward (+Z). POSITIVE YAW TURNS +Z TOWARD +X.
 *
 * State it that way and nothing else, because every other phrasing of this has
 * already cost this project a bug. The code the number is fed to is:
 *
 *     yawOf(x, z) = Math.atan2(x, z)                       physics.js
 *     worldForward.set(sin(aim), 0, cos(aim))              ship.js, aim = heading + yawCentre
 *
 * so `yawCentre = +PI/2` produces the direction (1, 0, 0), which is +X, which is
 * STARBOARD (see §2). It is the same convention as three.js's own `rotation.y`:
 * `rotation.y = +PI/2` maps a local +Z to world +X, verified rather than assumed.
 *
 * BEWARE "counter-clockwise looking down", which this comment used to say and
 * `physics.js#yawOf` still says. It is true under the right-hand rule — positive
 * rotation about +Y appears counter-clockwise viewed from +Y — but it is read the
 * other way round by anyone holding a plan view drawn the way plan views are drawn,
 * with forward up the page and starboard to the right. That layout is a view from
 * BELOW the ship, not above it, and the sign flips. The rule above has no such
 * reading: +Z toward +X, and the two lines of code that implement it.
 *
 * So: bow is 0, STARBOARD is +PI/2, PORT is -PI/2, engine is PI. Each mount's arc
 * is centred on ITS OWN SIDE OF THE HULL — the port sponson sits at x = -158 and
 * fires to port. This was inverted until it was measured: every port battery in the
 * game, player and NPC, had its firing arc on the starboard beam and vice versa,
 * because the anchors were authored from §2 (+X is starboard, which is correct) and
 * the yaw centres from the "counter-clockwise" sentence above (which is ambiguous).
 * `assertMountArcsFaceOutboard` below is the check that stops it coming back.
 *
 * `yawWidth` is the TOTAL arc, so a mount covers
 * [yawCentre - yawWidth/2, yawCentre + yawWidth/2].
 *
 * The six arcs are chosen so that a fully fitted hull TILES THE CIRCLE with a 30-34
 * degree overlap at every seam and no gap anywhere. The only blind wedge in the
 * system belongs to the dorsal mount alone (54 degrees dead astern, behind the
 * bridge tower and the radiator bank). See ARC_RATIONALE - these are design
 * decisions, not numbers picked to look reasonable.
 *
 * ---------------------------------------------------------------------------
 * 5. THE API
 * ---------------------------------------------------------------------------
 *   CRUISER_HARDPOINTS                                  HardpointDef[]
 *   restForward(yawCentre)                              -> [x, y, z] unit vector
 *   assertMountArcsFaceOutboard(defs, label)            throws on an inverted arc
 *   createSockets(root)                                 -> Map<id, {socket, def}>
 *   attachModule(hullResult, id, moduleDef, ctx)        -> { object, detach() }
 *   detachModule(hullResult, id)                        -> boolean
 *   mirrorX(object3D)                                   -> THREE.Object3D
 *   getSilhouetteSignature(hullResult)                  -> signature object
 *   hardpointDef(id)                                    -> HardpointDef
 */

import * as THREE from 'three';
import { HARDPOINTS } from '../../core/contracts.js';
import { RNG } from '../../core/rng.js';
import { mirrorGeometryX } from './greeble.js';

// ---------------------------------------------------------------------------
// Anchors. These are the single source of truth for where things bolt on; the
// cruiser's own "empty mount" furniture is placed from these same numbers, so the
// visible socket and the logical socket cannot drift apart.
// ---------------------------------------------------------------------------

/**
 * The mounts moved with the 2025 hull rebuild (see cruiser.js). Nothing about the
 * CONTRACT changed - a module is still authored in ship-space orientation with its
 * origin at the mount point, and moving an anchor simply moves the module with it.
 * What changed is that the six anchors now sit on six real, structurally distinct
 * parts of the ship, and that PORT AND STARBOARD ARE NO LONGER MIRRORS: the port
 * sponson owns z +18..+102 and the starboard one z -152..-68, so a fully fitted hull
 * is never bilaterally symmetric. That is a deliberate salvager read, not an
 * oversight, and the mirroring machinery in this file handles it unchanged.
 */
export const CRUISER_ANCHORS = {
  bow: [0, 32, 420],        // the foredeck, ahead of the armour spine, on the sheer
  // THE ONLY ANCHOR THE HULL REDESIGN MOVED, and it moved 30 m in y and nothing else.
  // It now sits on the dorsal barbette that stands on the ridge crown at this station
  // (cruiser.js, "THE DORSAL BARBETTE"), which is what a capital's dorsal bed sits on
  // and what restores `modules/audit.mjs`'s rail_battery / missile_cells separation to
  // 149 m against its 140 m bar. Every other anchor is byte-identical: move one, re-run
  // the module audit, then move the next.
  dorsal: [0, 124, -40],    // top of the dorsal barbette, on the ridge crown
  ventral: [0, -78, 0],     // roof of the salvage bay throat; the module hangs down
  port: [-158, 46, 60],     // top face of the port sponson shelf, and the sponson
                            // sits on the salvage cradle's second transverse frame
  starboard: [158, 46, -110], // 170 m further aft than port, on purpose, and on the
                              // cradle's fourth frame
  engine: [0, 0, -624],     // end plate of the empty main drive well
};

/**
 * Why each arc is the width it is. Kept as data so the UI can explain a mount to
 * the player without a second copy of this reasoning drifting out of sync.
 */
export const ARC_RATIONALE = {
  bow: 'A forward cone of 100 degrees. Bow mounts are aimed by turning a 1.4 km ship; '
    + 'a wide arc here would make hull facing meaningless, which is the one decision '
    + 'capital-ship combat is made of.',
  dorsal: 'Near-full traverse, 306 degrees, with a 54-degree blind wedge dead astern '
    + 'where the bridge tower, the aft truss and the radiator bank are in the way. '
    + 'The dorsal bed is the flexible mount and pays for it in tier cost.',
  ventral: 'Not a firing arc. The ventral mount is the utility bay - grapples, '
    + 'tractors, hangar throats - so it is declared full-circle and any weapon that '
    + 'mounts here overrides with its own yawWidth.',
  port: '140 degrees centred on the PORT beam (-PI/2), i.e. -20 to -160 degrees. '
    + 'Broadside is the cruiser\'s natural fighting position.',
  starboard: 'Mirror of port, on the starboard beam (+PI/2): +20 to +160 degrees.',
  engine: '108 degrees centred astern. Covers exactly the 40-degree gap the two '
    + 'sponsons leave behind the ship, so a stern chaser closes the rear blind spot.',
};

/**
 * The six mounts. Measured from ship forward with positive yaw turning +Z toward
 * +X (see §4), the four weapon arcs cover the full circle:
 *   bow        -50 ..  +50
 *   starboard  +20 .. +160
 *   engine    +126 .. +234
 *   port      +200 .. +340   (i.e. -20 .. -160)
 * Every seam overlaps by 30-34 degrees, so a target crossing from the bow arc into
 * the broadside is never briefly untouchable. There is no bearing a fully fitted
 * hull cannot answer, which is the promise the refit screen makes to the player -
 * and the reason a HALF-fitted hull has holes the player can feel.
 *
 * The COVERAGE here is unchanged from the version that had port and starboard the
 * wrong way round: the same four wedges, tiled the same way, with the same overlaps.
 * All that moved is which mount owns which wedge, and that is the whole defect -
 * the guns are on one flank and the arc was on the other.
 *
 * @type {import('../../core/contracts.js').HardpointDef[]}
 */
export const CRUISER_HARDPOINTS = [
  {
    id: 'bow',
    anchor: CRUISER_ANCHORS.bow,
    normal: [0, 0, 1],
    yawCentre: 0,
    yawWidth: Math.PI * 0.556,      // 100 degrees
    maxTier: 3,
    structureHP: 1400,
    label: 'Forward Bed',
  },
  {
    id: 'dorsal',
    anchor: CRUISER_ANCHORS.dorsal,
    normal: [0, 1, 0],
    yawCentre: 0,
    yawWidth: Math.PI * 1.7,        // 306 degrees
    maxTier: 3,
    structureHP: 1100,
    label: 'Dorsal Bed',
  },
  {
    id: 'ventral',
    anchor: CRUISER_ANCHORS.ventral,
    normal: [0, -1, 0],
    yawCentre: 0,
    yawWidth: Math.PI * 2,          // utility mount, see ARC_RATIONALE
    maxTier: 2,
    structureHP: 900,
    label: 'Salvage Cradle',
  },
  {
    id: 'port',
    anchor: CRUISER_ANCHORS.port,
    normal: [-1, 0, 0],
    yawCentre: -Math.PI * 0.5,      // -X. The port sponson fires to PORT. See §4.
    yawWidth: Math.PI * 0.778,      // 140 degrees
    maxTier: 3,
    structureHP: 1200,
    label: 'Port Sponson',
  },
  {
    id: 'starboard',
    anchor: CRUISER_ANCHORS.starboard,
    normal: [1, 0, 0],
    yawCentre: Math.PI * 0.5,       // +X. The starboard sponson fires to STARBOARD.
    yawWidth: Math.PI * 0.778,
    maxTier: 3,
    structureHP: 1200,
    label: 'Starboard Sponson',
  },
  {
    id: 'engine',
    anchor: CRUISER_ANCHORS.engine,
    normal: [0, 0, -1],
    yawCentre: Math.PI,
    yawWidth: Math.PI * 0.6,        // 108 degrees
    maxTier: 2,
    structureHP: 1500,
    label: 'Main Drive Well',
  },
];

const _byId = new Map(CRUISER_HARDPOINTS.map((h) => [h.id, h]));

export function hardpointDef(id) {
  const d = _byId.get(id);
  if (!d) throw new Error(`[hardpoints] unknown hardpoint "${id}" (have: ${HARDPOINTS.join(', ')})`);
  return d;
}

/** Sanity: the contract's list and this hull's list must agree, at import time. */
for (const id of HARDPOINTS) {
  if (!_byId.has(id)) throw new Error(`[hardpoints] contracts declares "${id}" but the cruiser has no mount for it`);
}
for (const h of CRUISER_HARDPOINTS) {
  if (!HARDPOINTS.includes(h.id)) throw new Error(`[hardpoints] "${h.id}" is not a HARDPOINT in contracts.js`);
}

// ---------------------------------------------------------------------------
// THE HANDEDNESS ASSERTION
//
// A mount's guns must point out of the side of the hull they are bolted to. That
// is not a naming preference and it is not an art note - it is the one relation
// between `anchor`/`normal` (authored by geometry) and `yawCentre` (consumed by the
// sim) that nothing in the codebase checked, and it was wrong on every flank mount
// in the game: the port sponson at x = -158 had its 140 degree arc centred on +X.
// Nothing exposed it, because `_fire` spawns from `mount.worldPosition` (the right
// side) and aims at the target, and `mount.worldForward` had exactly one consumer.
// Per-emitter muzzle flashes and a ripple that walks down one flank make it loud.
//
// The check is one dot product, at import time, and it costs nothing.
// ---------------------------------------------------------------------------

/**
 * Where a mount points with the ship at heading 0 and the turret centred.
 * This is `ship.js#WeaponMount.updateWorld`'s `worldForward` with `shipHeading` and
 * `traverse` both zero, written out so the two cannot drift.
 *
 * @param {number} yawCentre  radians; positive turns +Z toward +X
 * @returns {[number,number,number]} unit vector in ship space
 */
export function restForward(yawCentre) {
  return [Math.sin(yawCentre), 0, Math.cos(yawCentre)];
}

/** How closely a mount's rest bearing must agree with its own outward normal. */
export const HANDEDNESS_MIN_DOT = 0.9;

/**
 * Throw if any mount's firing arc is centred on the wrong side of the hull.
 *
 * Compares `restForward(yawCentre)` against the mount's outward `normal`, in the
 * HORIZONTAL PLANE ONLY, and requires the dot product to exceed
 * `HANDEDNESS_MIN_DOT`. Two things about that are deliberate:
 *
 *   - IT IS A YAW TEST, so it is projected onto XZ. `yawCentre` says nothing about
 *     elevation, and a mount whose normal is vertical carries no yaw information at
 *     all: the dorsal bed (normal [0,1,0]) and the ventral cradle (normal [0,-1,0])
 *     both have a horizontal projection of zero length. Testing them against the raw
 *     3-D normal would demand `dot([0,0,1], [0,1,0]) > 0.9`, which is 0 and can
 *     never pass for any `yawCentre`. They are SKIPPED, and both are declared
 *     near-full-traverse anyway (306 and 360 degrees), so there is no side for them
 *     to be on. This is the one place the check's specification as written could not
 *     be implemented literally.
 *   - 0.9 IS 25.8 DEGREES, which is generous on purpose. It is not measuring
 *     precision, it is catching a SIGN: the failure mode is 180 degrees out, and
 *     every legitimate value in the table is exact.
 *
 * @param {Array} defs        HardpointDef-shaped objects with `normal` and `yawCentre`
 * @param {string} [label]    what to name in the error
 * @returns {number} how many mounts were actually checked - see the sample-size rule
 */
export function assertMountArcsFaceOutboard(defs, label = 'cruiser') {
  let checked = 0;
  for (const d of defs) {
    const n = d?.normal;
    if (!n) continue;
    const h = Math.hypot(n[0], n[2]);
    if (h < 1e-6) continue;                     // vertical normal: no yaw to check
    const f = restForward(d.yawCentre ?? 0);
    const dot = (f[0] * n[0] + f[2] * n[2]) / h;
    checked++;
    if (dot <= HANDEDNESS_MIN_DOT) {
      const deg = (r) => (r * 180 / Math.PI).toFixed(1);
      throw new Error(
        `[hardpoints] ${label} mount "${d.id}" has its firing arc on the wrong side of the `
        + `hull. Its outward normal is [${n.join(', ')}] but yawCentre ${deg(d.yawCentre ?? 0)} `
        + `deg points it at [${f.map((v) => v.toFixed(2)).join(', ')}] - dot ${dot.toFixed(3)}, `
        + `needs > ${HANDEDNESS_MIN_DOT}. Positive yaw turns +Z toward +X, so a mount whose `
        + `normal is -X wants yawCentre -PI/2. See section 4 of this file.`,
      );
    }
  }
  return checked;
}

// Four of the six mounts carry a horizontal normal and are checked here; the dorsal
// and ventral mounts face straight up and down and are skipped, for the reason in
// the doc comment above.
assertMountArcsFaceOutboard(CRUISER_HARDPOINTS);

// ---------------------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------------------

/**
 * Build the six sockets and parent them to `root`. Called by buildCruiser; you
 * should not need it yourself.
 *
 * @param {THREE.Object3D} root
 * @returns {Map<string, {socket: THREE.Object3D, def: Object, module: Object|null}>}
 */
export function createSockets(root) {
  const map = new Map();
  for (const def of CRUISER_HARDPOINTS) {
    const socket = new THREE.Object3D();
    socket.name = `socket:${def.id}`;
    socket.position.set(def.anchor[0], def.anchor[1], def.anchor[2]);
    // Explicit, because the whole convention depends on it being true.
    socket.quaternion.identity();
    socket.scale.set(1, 1, 1);
    socket.userData.hardpoint = def.id;
    root.add(socket);
    map.set(def.id, { socket, def, module: null, object: null, mirrored: false });
  }
  return map;
}

// ---------------------------------------------------------------------------
// SEATING — the service gap and the seeded misalignment
//
// Two transforms, applied by the system rather than by the module author, that
// together are the difference between "a bump on the hull" and "something a crew
// bolted on":
//
//   THE SERVICE GAP. The module stands SEAT_STANDOFF metres proud of its anchor,
//   which is exactly the height of the empty mount's bolt ring, so the ring becomes
//   the visible foot the module sits on and the gap between module and hull is open.
//   That gap is a dark line separating the module's value from the hull's, which is
//   what makes it read as a SEPARATE OBJECT at three kilometres rather than as a
//   swelling. It also fixes an old bug quietly: modules used to be authored with
//   their base at y = 0 and then sunk nine metres into the mount pad.
//
//   SEVEN METRES WAS THE WRONG WAY TO BUY THAT LINE, and the arithmetic says so
//   rather than the taste. Under the old furniture a module met the hull at a 32-44 m
//   disc SIXTEEN METRES CLEAR OF THE SKIN - pad 0..9, collar 9..16, module from 7 -
//   with nothing crossing the gap. Worse, the collar's 9..16 and the module's own cut
//   plate at 7..13.2 (`modules/kit.js#graft`) OVERLAPPED: the hull's bolt ring passed
//   through the module at all six mounts, two interpenetrating solids that nothing
//   rendered because the module is opaque. `cruiser.js#mountSeat` now cuts a 9 m
//   apron with a 4 m coaming around every mount, which draws the dark line AROUND the
//   module instead of UNDER it and does it with a real shadowed edge. The pad drops
//   onto the apron floor at -9..-3, the collar spans -3..+3, and this constant is 3 -
//   so the module's cut plate starts exactly where the bolt ring ends. Nothing
//   interpenetrates and nothing hovers.
//
//   THE MISALIGNMENT. A fixed 3-7 degree tilt about an axis perpendicular to the
//   mount normal, seeded from the socket id so a given mount always leans the same
//   way and a seed reproduces exactly. Nothing on this ship left a yard as a set;
//   a module that lines up perfectly reads as design, and design is what this hull
//   is not. It is deliberately small enough not to change a firing arc - arcs come
//   from `def.yawCentre`, which is data, not from the object's transform.
//
// A module that genuinely must seat flush (a drive that plugs into the drive well,
// a ring that has to be concentric) opts out with `def.rigidMount = true`.
// ---------------------------------------------------------------------------

/** Metres a module stands proud of its anchor. Lands on the bolt ring's top face. */
export const SEAT_STANDOFF = 3;

const _seatCache = new Map();

/**
 * The fixed seating transform for a mount: a translation along the outward normal
 * and a small rotation about an axis perpendicular to it. Computed once per mount.
 *
 * @param {string} id
 * @returns {{offset: THREE.Vector3, quaternion: THREE.Quaternion}}
 */
export function seatingFor(id) {
  let seat = _seatCache.get(id);
  if (seat) return seat;
  const def = hardpointDef(id);
  const n = new THREE.Vector3(def.normal[0], def.normal[1], def.normal[2]).normalize();
  // Perpendicular axis: cross with whichever cardinal the normal is least parallel to.
  const ref = Math.abs(n.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const axis = new THREE.Vector3().crossVectors(n, ref).normalize();
  const rng = new RNG(`mount:${id}`);
  const angle = rng.range(0.052, 0.122);          // 3.0 to 7.0 degrees, never zero
  const spin = rng.bool() ? 1 : -1;
  seat = {
    offset: n.clone().multiplyScalar(SEAT_STANDOFF),
    quaternion: new THREE.Quaternion().setFromAxisAngle(axis, angle * spin),
  };
  _seatCache.set(id, seat);
  return seat;
}

// ---------------------------------------------------------------------------
// Mirroring
// ---------------------------------------------------------------------------

/** Source geometry -> mirrored geometry. Installing the same part twice is free. */
const _mirrorCache = new WeakMap();

function mirroredGeometry(geometry) {
  let g = _mirrorCache.get(geometry);
  if (!g) {
    g = mirrorGeometryX(geometry);
    g.name = (geometry.name || 'geo') + ':mirrorX';
    _mirrorCache.set(geometry, g);
  }
  return g;
}

/**
 * Mirror an object tree across the YZ plane, in place, keeping a positive
 * determinant everywhere. See section 3 of the header for why this is not a scale.
 *
 * @param {THREE.Object3D} object
 * @returns {THREE.Object3D} the same object, mirrored
 */
export function mirrorX(object) {
  object.traverse((o) => {
    o.position.x = -o.position.x;
    // q -> (x, -y, -z, w) is the conjugation M R M for M = diag(-1,1,1).
    o.quaternion.set(o.quaternion.x, -o.quaternion.y, -o.quaternion.z, o.quaternion.w);
    if (o.isInstancedMesh) {
      // Per-instance matrices need the same conjugation.
      const m = new THREE.Matrix4();
      const mir = new THREE.Matrix4().makeScale(-1, 1, 1);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        m.premultiply(mir).multiply(mir);
        o.setMatrixAt(i, m);
      }
      o.instanceMatrix.needsUpdate = true;
    }
    if (o.isMesh || o.isLine || o.isPoints) {
      if (o.geometry) o.geometry = mirroredGeometry(o.geometry);
    }
  });
  object.updateMatrixWorld(true);
  return object;
}

// ---------------------------------------------------------------------------
// Attach / detach
// ---------------------------------------------------------------------------

/**
 * Install a module on a mount.
 *
 * @param {Object} hullResult                 the object returned by buildCruiser()
 * @param {string} hardpointId                one of HARDPOINTS
 * @param {import('../../core/contracts.js').ModuleDef} moduleDef
 * @param {import('../../core/contracts.js').BuildContext} ctx
 * @returns {{object: THREE.Object3D, hardpoint: string, mirrored: boolean, detach: () => void}}
 */
export function attachModule(hullResult, hardpointId, moduleDef, ctx) {
  const entry = hullResult?.hardpoints?.get(hardpointId);
  if (!entry) throw new Error(`[hardpoints] hull has no mount "${hardpointId}"`);
  if (!moduleDef?.build) throw new Error(`[hardpoints] module "${moduleDef?.id}" has no build(ctx)`);

  // Swapping is legal and common; the refit screen relies on it.
  if (entry.object) detachModule(hullResult, hardpointId);

  const authored = moduleDef.hardpoint;
  const mirrored = !moduleDef.noMirror
    && ((hardpointId === 'starboard' && authored === 'port')
      || (hardpointId === 'port' && authored === 'starboard'));

  const object = moduleDef.build(ctx);
  if (!object || !object.isObject3D) {
    throw new Error(`[hardpoints] module "${moduleDef.id}" build(ctx) did not return an Object3D`);
  }
  object.name = `module:${moduleDef.id}`;
  object.userData.moduleId = moduleDef.id;
  object.userData.hardpoint = hardpointId;
  object.userData.mirrored = mirrored;
  if (mirrored) mirrorX(object);

  // Seat it: proud of the hull on the bolt ring, and never quite square. Mirroring
  // runs first so the misalignment is applied in socket space and port/starboard
  // therefore lean in genuinely different directions rather than in mirror image.
  if (!moduleDef.rigidMount) {
    const seat = seatingFor(hardpointId);
    object.position.add(seat.offset);
    object.quaternion.premultiply(seat.quaternion);
    object.userData.seated = true;
  }

  object.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  entry.socket.add(object);
  entry.object = object;
  entry.module = moduleDef;
  entry.mirrored = mirrored;
  hullResult.silhouetteDirty = true;

  return {
    object,
    hardpoint: hardpointId,
    mirrored,
    detach: () => detachModule(hullResult, hardpointId),
  };
}

/**
 * Remove whatever is on a mount and dispose the geometry it owns. Mirrored
 * geometries are shared through the mirror cache and are deliberately NOT disposed
 * here - they belong to the source geometry's lifetime, not to this installation.
 *
 * @returns {boolean} true if something was removed
 */
export function detachModule(hullResult, hardpointId) {
  const entry = hullResult?.hardpoints?.get(hardpointId);
  if (!entry?.object) return false;
  const obj = entry.object;
  entry.socket.remove(obj);
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.name?.endsWith(':mirrorX')) o.geometry.dispose();
  });
  entry.object = null;
  entry.module = null;
  entry.mirrored = false;
  hullResult.silhouetteDirty = true;
  return true;
}

/** Everything currently bolted on, in HARDPOINTS order. For the refit UI. */
export function installedModules(hullResult) {
  return HARDPOINTS
    .map((id) => hullResult.hardpoints.get(id))
    .filter((e) => e?.module)
    .map((e) => ({ hardpoint: e.def.id, module: e.module, mirrored: e.mirrored }));
}

// ---------------------------------------------------------------------------
// Silhouette signature
// ---------------------------------------------------------------------------

const SIG_BINS = 28;

/**
 * A compact numeric description of what the ship's OUTLINE currently is.
 *
 * The design bar for this game is Homeworld's silhouette readability, and the only
 * way to hold that bar across a hundred loadout permutations is to be able to
 * measure it. This walks the visible LOD0 geometry plus every installed module,
 * bins every vertex by its position along the hull's main axis, and reports the
 * extreme extents per bin - which is exactly the top-down and side-on outline.
 *
 * Uses of it:
 *   - the silhouette audit in probes/cruiser.js
 *   - the refit screen, to show "this module changes your outline HERE"
 *   - a regression check: if a change flattens a lobe, the numbers say so
 *
 * Cost is one pass over ~4k vertices. Call it on install, not per frame.
 *
 * @param {Object} hullResult
 * @returns {{length:number, beam:number, height:number, bins:Array, masses:Array, hardpoints:Array, hash:string}}
 */
export function getSilhouetteSignature(hullResult) {
  const root = hullResult.root;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const v = new THREE.Vector3();

  const b = hullResult.bounds;
  const zMin = b.min.z, zMax = b.max.z;
  const span = Math.max(1e-6, zMax - zMin);

  const bins = [];
  for (let i = 0; i < SIG_BINS; i++) {
    bins.push({
      z: zMin + span * ((i + 0.5) / SIG_BINS),
      halfWidth: 0, top: -Infinity, bottom: Infinity, count: 0,
    });
  }

  const targets = [];
  const lod0 = hullResult.lod?.levels?.[0]?.object;
  if (lod0) targets.push(lod0);
  for (const e of hullResult.hardpoints.values()) if (e.object) targets.push(e.object);

  for (const t of targets) {
    t.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const pos = o.geometry?.getAttribute('position');
      if (!pos) return;
      local.multiplyMatrices(inv, o.matrixWorld);
      const step = pos.count > 3000 ? 3 : 1;   // sample dense meshes, the outline survives
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(local);
        let k = Math.floor(((v.z - zMin) / span) * SIG_BINS);
        if (k < 0) k = 0; else if (k >= SIG_BINS) k = SIG_BINS - 1;
        const bin = bins[k];
        const ax = Math.abs(v.x);
        if (ax > bin.halfWidth) bin.halfWidth = ax;
        if (v.y > bin.top) bin.top = v.y;
        if (v.y < bin.bottom) bin.bottom = v.y;
        bin.count++;
      }
    });
  }

  for (const bin of bins) {
    if (!bin.count) { bin.top = 0; bin.bottom = 0; }
    bin.z = Math.round(bin.z);
    bin.halfWidth = Math.round(bin.halfWidth);
    bin.top = Math.round(bin.top);
    bin.bottom = Math.round(bin.bottom);
  }

  const masses = (hullResult.masses ?? []).map((m) => ({
    id: m.id,
    box: [
      Math.round(m.box.min.x), Math.round(m.box.min.y), Math.round(m.box.min.z),
      Math.round(m.box.max.x), Math.round(m.box.max.y), Math.round(m.box.max.z),
    ],
  }));

  const hps = HARDPOINTS.map((id) => {
    const e = hullResult.hardpoints.get(id);
    return { id, occupied: !!e?.object, module: e?.module?.id ?? null };
  });

  const hash = bins.map((x) => `${x.halfWidth},${x.top},${x.bottom}`).join('|');

  return {
    length: Math.round(b.max.z - b.min.z),
    beam: Math.round(b.max.x - b.min.x),
    height: Math.round(b.max.y - b.min.y),
    bounds: {
      min: [Math.round(b.min.x), Math.round(b.min.y), Math.round(b.min.z)],
      max: [Math.round(b.max.x), Math.round(b.max.y), Math.round(b.max.z)],
    },
    bins,
    masses,
    hardpoints: hps,
    hash,
  };
}
