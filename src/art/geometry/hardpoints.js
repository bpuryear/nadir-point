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
 * The attachment system simply does `socket.add(object)`. No rotation is applied.
 * If your module looks wrong on the hull, your module is authored wrong - do not
 * "fix" it by rotating it at the call site.
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
 * `yawCentre` is radians from ship forward (+Z), counter-clockwise looking DOWN.
 * Port is +PI/2, starboard is -PI/2, bow is 0, engine is PI. `yawWidth` is the TOTAL
 * arc, so a mount covers [yawCentre - yawWidth/2, yawCentre + yawWidth/2].
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
 *   createSockets(root)                                 -> Map<id, {socket, def}>
 *   attachModule(hullResult, id, moduleDef, ctx)        -> { object, detach() }
 *   detachModule(hullResult, id)                        -> boolean
 *   mirrorX(object3D)                                   -> THREE.Object3D
 *   getSilhouetteSignature(hullResult)                  -> signature object
 *   hardpointDef(id)                                    -> HardpointDef
 */

import * as THREE from 'three';
import { HARDPOINTS } from '../../core/contracts.js';
import { mirrorGeometryX } from './greeble.js';

// ---------------------------------------------------------------------------
// Anchors. These are the single source of truth for where things bolt on; the
// cruiser's own "empty mount" furniture is placed from these same numbers, so the
// visible socket and the logical socket cannot drift apart.
// ---------------------------------------------------------------------------

export const CRUISER_ANCHORS = {
  bow: [0, 100, 470],       // forward turret bed on top of the prow casemate
  dorsal: [0, 130, 270],    // raised barbette between the tower and the casemate
  ventral: [0, -66, -10],   // ceiling of the salvage cradle, module hangs down
  port: [-152, 22, 48],     // top face of the port sponson shelf
  starboard: [152, 22, 48],
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
  port: '140 degrees centred on the beam (+PI/2), i.e. 20 to 160 degrees. Broadside '
    + 'is the cruiser\'s natural fighting position.',
  starboard: 'Mirror of port: -20 to -160 degrees.',
  engine: '108 degrees centred astern. Covers exactly the 40-degree gap the two '
    + 'sponsons leave behind the ship, so a stern chaser closes the rear blind spot.',
};

/**
 * The six mounts. Measured counter-clockwise from ship forward, the four weapon
 * arcs cover the full circle:
 *   bow        -50 ..  +50
 *   port       +20 .. +160
 *   engine    +126 .. +234
 *   starboard +200 .. +340   (i.e. -20 .. -160)
 * Every seam overlaps by 30-34 degrees, so a target crossing from the bow arc into
 * the broadside is never briefly untouchable. There is no bearing a fully fitted
 * hull cannot answer, which is the promise the refit screen makes to the player -
 * and the reason a HALF-fitted hull has holes the player can feel.
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
    yawCentre: Math.PI * 0.5,
    yawWidth: Math.PI * 0.778,      // 140 degrees
    maxTier: 3,
    structureHP: 1200,
    label: 'Port Sponson',
  },
  {
    id: 'starboard',
    anchor: CRUISER_ANCHORS.starboard,
    normal: [1, 0, 0],
    yawCentre: -Math.PI * 0.5,
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
