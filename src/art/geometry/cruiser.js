/**
 * THE PLAYER CRUISER — "Nadir", 1400 metres of salvager that someone welded guns to.
 *
 * This is the object the player looks at for the entire run, so every decision here
 * is a decision about the whole game.
 *
 * THE READ, in the order the eye gets it:
 *   1. ONE SPINE. A single slab-sided lofted hull runs the full 1400 m. Everything
 *      else hangs off it. You can rotate the camera anywhere and the spine tells you
 *      which way the ship is pointing.
 *   2. FRONT vs BACK, instantly. The bow ends in a heavy ventral CUTTER BLADE that
 *      hangs below the keel - a salvager's tool, not a warship's ram. The stern is a
 *      squat engine block WIDER than the hull with a rank of swept radiator fins.
 *      Blade forward, fins aft. There is no angle where those two read the same.
 *   3. TOP vs BOTTOM. Up is where the bridge tower and the gun beds are. Down is an
 *      open cradle of frames and rails big enough to swallow a frigate whole.
 *   4. INCOMPLETE. Six mounts, all empty on a bare hull, all wearing the same
 *      vocabulary: a bolt ring, exposed hex struts, capped conduits. The main drive
 *      well at the stern is a 108 x 72 m octagonal hole with nothing in it - the
 *      ship limps on two auxiliary bells. Every empty socket is an invitation.
 *   5. PURPOSEFUL ASYMMETRY. The bridge tower sits 16 m to port. A salvaged fuel
 *      cylinder is strapped to the starboard flank. A cargo derrick folds over the
 *      port bow. Three radiators to port, two to starboard. None of it is noise -
 *      each one is a thing the crew bolted on and never removed.
 *
 * SCALE. Running lights sit at EXACTLY 40 m along the hull's main axis, both flanks,
 * 35 stations from z=-680 to z=+680, on the upper chamfer so they catch from above
 * and from the beam. That constant rhythm is the only thing in a vacuum that tells
 * a player how big this is, so it is not decoration and it is not negotiable.
 *
 * The game-wide 6 m strip from art/textures/runningLights.js is deliberately NOT
 * used here: laid along 650 m of chine it renders as one continuous additive band
 * that erases the chamfer highlights the whole design is built on. `chineStrip()`
 * below is kept and exported for hulls short enough to wear it.
 *
 * BUDGET. LOD0 core hull is under units.js#BUDGET.cruiserCoreTris (2000), running
 * lights included. LOD1 is ~42% of that and LOD2 is a ~150 triangle silhouette.
 * Modules are not counted here; they carry their own 400 each.
 *
 * DRAW CALLS. Merged by (damage group x material). Separately damageable masses -
 * the bridge tower and the engine block - stay separate meshes because a destroyed
 * subsystem has to be able to change independently of the rest of the hull.
 *
 * Everything else worth knowing is in ./hardpoints.js.
 */

import * as THREE from 'three';
import * as G from './greeble.js';
import { CRUISER_HARDPOINTS, CRUISER_ANCHORS, createSockets } from './hardpoints.js';

export const CRUISER_LENGTH = 1400;

/** Mandatory scale cue. Do not change this per-ship; see runningLights.js. */
export const RUNNING_LIGHT_AXIS_SPACING_M = 40;

// ---------------------------------------------------------------------------
// The lines. Every number below is metres in ship space: +Z forward, +Y up,
// +X starboard, origin at the volumetric centre of the hull.
// ---------------------------------------------------------------------------

/** [z, halfWidth, top, bottom, chamferWidth, chamferTop, chamferBottom] */
const HULL_STATIONS = [
  [-520, 104, 44, -56, 26, 14, 18],
  [-330, 112, 52, -62, 28, 16, 20],
  [-120, 116, 58, -64, 30, 16, 22],
  [180, 114, 58, -64, 30, 16, 22],
  [400, 90, 50, -58, 26, 16, 20],
  [570, 68, 34, -48, 20, 12, 16],
  [700, 46, 16, -34, 14, 8, 10],
];

/** The stern block. Deliberately WIDER than the hull - the step is the read. */
const ENGINE_STATIONS = [
  [-700, 152, 78, -84, 34, 20, 24],
  [-640, 156, 82, -88, 36, 20, 26],
  [-560, 148, 76, -82, 34, 20, 24],
  [-470, 118, 56, -66, 28, 16, 20],
];

/** The bridge tower, in its own space; shifted 16 m to port when placed. */
const TOWER_STATIONS = [
  [-262, 50, 146, 46, 6, 6, 6],
  [-196, 58, 146, 46, 6, 6, 6],
  [-192, 72, 206, 46, 8, 8, 6],
  [50, 72, 206, 46, 8, 8, 6],
  [56, 60, 178, 46, 6, 6, 6],
  [140, 60, 176, 78, 6, 6, 6],
  [198, 42, 168, 132, 6, 6, 6],
];

/** The forward cutter blade. Hangs below the keel; this is the bow, unmistakably. */
const BLADE_STATIONS = [
  [300, 62, -34, -74, 14, 6, 6],
  [470, 76, -28, -120, 14, 8, 8],
  [620, 82, -22, -158, 14, 8, 8],
  [700, 58, -34, -128, 12, 8, 8],
];

/**
 * The prow casemate: a plated armour house over the forward deck. Before this
 * existed the silhouette's forward third was a featureless sliver, which is the
 * classic failure mode - all the interesting mass piled aft.
 */
const CASEMATE_STATIONS = [
  [382, 76, 100, 44, 16, 12, 12],
  [520, 72, 100, 34, 16, 12, 12],
  [612, 48, 78, 16, 12, 12, 10],
  [692, 22, 46, -8, 8, 8, 8],
];

const TOWER_X = -16;

/** Octagonal main drive well: an enormous, obvious, empty socket. */
const WELL = { hw: 54, top: 36, bot: -36, cw: 18, ct: 11, cb: 11, mouthZ: -700, backZ: -624 };

const stationProfile = ([, hw, top, bot, cw, ct, cb]) => G.octProfile(hw, top, bot, cw, ct, cb);
const toStations = (rows) => rows.map((r) => ({ z: r[0], points: stationProfile(r) }));

/** Drop stations for a cheaper LOD without moving the extremes. */
function decimate(rows, keepEvery) {
  if (keepEvery <= 1) return rows;
  const out = [rows[0]];
  for (let i = keepEvery; i < rows.length - 1; i += keepEvery) out.push(rows[i]);
  out.push(rows[rows.length - 1]);
  return out;
}

/** Linear interpolation of a station table at an arbitrary z. Used to sit running
 *  lights exactly on the chamfer no matter how the lines change. */
function sectionAt(z) {
  const rows = z <= -500 ? ENGINE_STATIONS : HULL_STATIONS;
  let a = rows[0], b = rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (z >= rows[i][0] && z <= rows[i + 1][0]) { a = rows[i]; b = rows[i + 1]; break; }
  }
  if (z < rows[0][0]) { a = rows[0]; b = rows[0]; }
  if (z > rows[rows.length - 1][0]) { a = b = rows[rows.length - 1]; }
  const span = b[0] - a[0];
  const t = span === 0 ? 0 : (z - a[0]) / span;
  const L = (i) => a[i] + (b[i] - a[i]) * t;
  return { hw: L(1), top: L(2), bot: L(3), cw: L(4), ct: L(5), cb: L(6) };
}

/** Midpoint and outward normal of the upper chamfer facet at z, starboard side. */
function chineAt(z) {
  const s = sectionAt(z);
  const x = s.hw - s.cw * 0.5;
  const y = s.top - s.ct * 0.5;
  // Facet runs from (hw, top-ct) to (hw-cw, top); outward normal is (ct, cw).
  const nx = s.ct, ny = s.cw;
  const len = Math.hypot(nx, ny) || 1;
  return { x, y, nx: nx / len, ny: ny / len };
}

// ---------------------------------------------------------------------------
// Material assignment. Five surfaces, no more. The whole art direction is that a
// hull of mismatched salvage still reads as one object, and that survives exactly
// as long as the number of distinct surfaces in frame stays small.
// ---------------------------------------------------------------------------

const SURFACE = {
  hull: ['hull', { faction: 'player', wear: 0.5, tier: 2 }],
  hullDark: ['hullDark', { faction: 'player', wear: 0.66, tier: 2 }],
  plating: ['plating', { faction: 'player', wear: 0.4, tier: 2 }],
  greeble: ['greeble', { faction: 'player', wear: 0.55, tier: 1 }],
  trim: ['trim', { faction: 'player', wear: 0.45, tier: 1 }],
  glass: ['glass', { faction: 'player' }],
};

/** Damage groups. `core` is the hull proper; the other two die independently. */
const GROUPS = ['core', 'dorsal', 'engine'];

class Buckets {
  constructor() { this.map = new Map(); }

  /** @param {string} group @param {string} surface @param {THREE.BufferGeometry} geo */
  add(group, surface, geo, xf = null) {
    if (!geo) return;
    const key = `${group}/${surface}`;
    let b = this.map.get(key);
    if (!b) {
      b = { key, group, surface, parts: [], uv: true };
      this.map.set(key, b);
    }
    b.parts.push(xf ? { geo, ...xf } : { geo });
  }

  /** Parts whose UVs are authored (glow discs, running-light strips). */
  addRaw(group, surface, geo, xf = null) {
    const key = `${group}/${surface}#raw`;
    let b = this.map.get(key);
    if (!b) {
      b = { key, group, surface, parts: [], uv: false };
      this.map.set(key, b);
    }
    b.parts.push(xf ? { geo, ...xf } : { geo });
  }

  list() { return Array.from(this.map.values()); }
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

/**
 * Pure geometry. No materials, no THREE.Mesh, nothing that needs a GPU or a DOM -
 * which is what lets `tools/` count triangles for this hull without a browser.
 *
 * @param {{rng: import('../../core/rng.js').RNG, lod?: number}} p
 * @returns {{buckets: Array, lights: Array, masses: Array, detail: number}}
 */
export function hullParts({ rng, lod = 0 }) {
  const D = G.detailForLod(lod);
  const B = new Buckets();
  const r = rng.fork('cruiser:hull');
  const masses = [];

  const mass = (id, geoOrBox) => {
    const box = new THREE.Box3();
    if (geoOrBox.isBox3) box.copy(geoOrBox);
    else { geoOrBox.computeBoundingBox(); box.copy(geoOrBox.boundingBox); }
    masses.push({ id, box });
  };

  // =========================================================================
  // LOD2: silhouette only. Six masses, one surface, ~150 triangles.
  // =========================================================================
  if (lod >= 2) {
    const hull = G.loft(toStations(decimate(HULL_STATIONS, 3)));
    B.add('core', 'hull', hull);
    B.add('core', 'hull', G.loft(toStations(decimate(ENGINE_STATIONS, 3))));
    B.add('core', 'hull', G.loft(toStations(decimate(BLADE_STATIONS, 3))));
    // Tower, cradle and sponsons as single blocks - they are outline, not detail.
    B.add('core', 'hull', G.taperedWedge({
      length: 456, width0: 116, height0: 122, width1: 88, height1: 74, shear: 24, detail: D,
    }), { pos: [TOWER_X, 107, -260] });
    B.add('core', 'hull', G.panelledSlab({ width: 240, height: 130, depth: 520, detail: D }),
      { pos: [0, -126, -8] });
    for (const s of [-1, 1]) {
      B.add('core', 'hull', G.panelledSlab({ width: 76, height: 26, depth: 220, detail: D }),
        { pos: [s * 152, 8, 48] });
    }
    mass('hull', hull);
    return { buckets: B.list(), lights: [], masses, detail: D };
  }

  const decim = lod === 1 ? 2 : 1;
  /** True only at LOD0. Fine detail that is sub-pixel past 4 km lives behind this. */
  const full = lod === 0;

  // =========================================================================
  // 1. THE SPINE
  // =========================================================================
  const hullGeo = G.loft(toStations(decimate(HULL_STATIONS, decim)), { capBack: false });
  B.add('core', 'hull', hullGeo);
  mass('spine', hullGeo);

  // Flank armour: three separate plates a side, gaps and all. This is where the key
  // light catches - bright plating against the darker hull below it.
  for (const s of [-1, 1]) {
    B.add('core', 'plating', G.armourBelt({
      length: 700, height: 50, thickness: 12, plates: full ? 3 : 2, gap: 40, chamfer: 8, detail: D,
    }), { pos: [s * 114, -6, -60] });
  }

  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'plating', G.panelledSlab({ width: 18, height: 18, depth: 700, chamfer: 5, detail: D }),
        { pos: [s * 88, 58, 60] });
    }
  }

  // A hull section with the skin off, port side only. Ribs where plating should be.
  if (full) {
    B.add('core', 'hullDark', G.panelledSlab({ width: 12, height: 62, depth: 190, detail: D }),
      { pos: [-108, 4, -400] });
    B.add('core', 'greeble', G.hullRibs({
      count: 3, spacing: 56, span: 66, height: 11, thickness: 9, taper: 0.8, detail: D,
    }), { pos: [-114, 4, -400], rot: [0, 0, Math.PI * 0.5] });
  }

  // =========================================================================
  // 2. THE BOW: cutter blade + forward gun bed
  // =========================================================================
  const bladeGeo = G.loft(toStations(decimate(BLADE_STATIONS, decim)), { capFront: false });
  B.add('core', 'plating', bladeGeo);
  mass('cutter-blade', bladeGeo);

  const caseGeo = G.loft(toStations(decimate(CASEMATE_STATIONS, decim)));
  B.add('core', 'plating', caseGeo);
  mass('prow-casemate', caseGeo);

  if (full) {
    // Forward chevrons: the one place the ship wears a marking colour.
    for (const s of [-1, 1]) {
      B.add('core', 'trim', G.panelledSlab({ width: 8, height: 6, depth: 130, detail: D }),
        { pos: [s * 72, 72, 490], rot: [0, s * 0.08, 0] });
    }
  }

  emptyMount(B, 'bow', CRUISER_ANCHORS.bow, {
    up: [0, 1, 0], padRadius: 44, struts: 2, conduits: 1, detail: D, full, rng: r,
  });

  // Port bow derrick. Asymmetric on purpose: a salvage crane nobody unbolted.
  if (full) {
    B.add('core', 'greeble', G.hexStrut({ length: 170, radius: 11, axis: 'y', detail: D }),
      { pos: [-98, 26, 336], rot: [-0.62, 0, 0.22] });
    B.add('core', 'greeble', G.panelledSlab({ width: 26, height: 18, depth: 34, detail: D }),
      { pos: [-130, 138, 424] });
  }

  // =========================================================================
  // 3. DORSAL: forward gun bed, bridge tower, sensor mast, open aft truss
  // =========================================================================
  emptyMount(B, 'dorsal', CRUISER_ANCHORS.dorsal, {
    up: [0, 1, 0], padRadius: 62, struts: 2, conduits: 1, plinth: [166, 78, 110], detail: D, full, rng: r,
  });

  const towerGeo = G.loft(toStations(decimate(TOWER_STATIONS, decim)), { capBack: false });
  B.add('dorsal', 'hull', towerGeo, { pos: [TOWER_X, 0, 0] });
  {
    const bx = new THREE.Box3();
    towerGeo.computeBoundingBox();
    bx.copy(towerGeo.boundingBox).translate(new THREE.Vector3(TOWER_X, 0, 0));
    mass('bridge-tower', bx);
  }

  // Bridge glazing on the forward face of the canted bridge. Two panes: the pair
  // reads as "windows", one reads as "a panel", three is detail density we do not
  // spend at this scale.
  if (full) {
    for (const i of [-1, 1]) {
      B.add('dorsal', 'glass', G.panelledSlab({ width: 26, height: 15, depth: 3, detail: D }),
        { pos: [TOWER_X + i * 16, 150, 201] });
    }
  }

  // Sensor mast. The tallest thing on the ship: it fixes "up" from any angle.
  B.add('dorsal', 'greeble', G.antennaMast({
    height: 118, radius: 8, tipRadius: 3.5, spars: 3, sparSpan: 34, detail: D,
  }), { pos: [TOWER_X, 184, -172] });
  if (full) {
    B.add('dorsal', 'greeble', G.sensorDish({ radius: 30, depth: 13, sides: 10, stub: 12, detail: D }),
      { pos: [TOWER_X, 296, -168], rot: [-0.42, 0, 0] });
  }

  // Open truss aft of the tower: the deck plating simply is not there yet.
  B.add('core', 'hullDark', G.hullRibs({
    count: full ? 4 : 2, spacing: 62, span: 196, height: 46, thickness: 13, taper: 0.86, detail: D,
  }), { pos: [0, 62, -372] });
  if (full) {
    for (const s of [-1, 1]) {
      B.add('core', 'greeble', G.panelledSlab({ width: 15, height: 13, depth: 210, detail: D }),
        { pos: [s * 78, 84, -372] });
    }
  }

  // =========================================================================
  // 4. VENTRAL: the salvage cradle. Open on three sides so the player can SEE it
  //    swallow a hulk. This is the single strongest "what does this ship do" cue.
  // =========================================================================
  {
    const legZ = full ? [235, 80, -80, -235] : [200, -200];
    for (const z of legZ) {
      for (const s of [-1, 1]) {
        B.add('core', 'hullDark', G.panelledSlab({ width: 30, height: 132, depth: 38, detail: D }),
          { pos: [s * 100, -124, z] });
      }
    }
    for (const s of [-1, 1]) {
      B.add('core', 'hullDark', G.panelledSlab({ width: 36, height: 24, depth: 530, detail: D }),
        { pos: [s * 100, -190, -6] });
    }
    if (full) {
      B.add('core', 'greeble', G.hullRibs({
        count: 3, spacing: 150, span: 178, height: 16, thickness: 14, taper: 0.9, detail: D,
      }), { pos: [0, -58, -6] });
      // Folded grapple arms stowed against the cradle ceiling.
      for (const s of [-1, 1]) {
        B.add('core', 'greeble', G.hexStrut({ length: 170, radius: 10, axis: 'z', detail: D }),
          { pos: [s * 52, -76, 30] });
      }
    }
    const cradle = new THREE.Box3(new THREE.Vector3(-136, -202, -272), new THREE.Vector3(136, -58, 272));
    mass('salvage-cradle', cradle);
  }

  emptyMount(B, 'ventral', CRUISER_ANCHORS.ventral, {
    up: [0, -1, 0], padRadius: 46, struts: 0, conduits: 0, detail: D, full, rng: r,
  });

  // =========================================================================
  // 5. SPONSONS: the two broadside shelves. Bare shelf, exposed frame, one pad.
  // =========================================================================
  for (const s of [-1, 1]) {
    const x = s * 152;
    B.add('core', 'hull', G.panelledSlab({ width: 76, height: 26, depth: 220, chamfer: 8, detail: D }),
      { pos: [x, 8, 48] });
    B.add('core', 'hullDark', G.taperedWedge({
      length: 62, width0: 40, height0: 46, width1: 26, height1: 14, shear: 22, detail: D,
    }), { pos: [s * 112, -22, 48], rot: [0, s * Math.PI * 0.5, 0] });

    if (full) {
      for (const dz of [-58, 128]) {
        B.add('core', 'greeble', G.hexStrut({ length: 54, radius: 7, axis: 'y', detail: D }),
          { pos: [s * 184, 20, 48 + dz] });
      }
      B.add('core', 'greeble', G.panelledSlab({ width: 14, height: 11, depth: 200, detail: D }),
        { pos: [s * 184, 72, 48] });
    }
    const shelf = new THREE.Box3(
      new THREE.Vector3(Math.min(x - 38, x + 38), -5, -62),
      new THREE.Vector3(Math.max(x - 38, x + 38), 21, 158),
    );
    mass(s < 0 ? 'port-sponson' : 'starboard-sponson', shelf);
  }
  emptyMount(B, 'port', CRUISER_ANCHORS.port, {
    up: [0, 1, 0], padRadius: 34, struts: 0, conduits: 0, detail: D, full, rng: r,
  });
  emptyMount(B, 'starboard', CRUISER_ANCHORS.starboard, {
    up: [0, 1, 0], padRadius: 34, struts: 0, conduits: 0, detail: D, full, rng: r,
  });

  // Salvaged fuel cylinder strapped to the starboard flank. Nothing about it
  // matches the hull, which is exactly why it belongs on this ship.
  B.add('core', 'greeble', G.pipeRun({
    length: 250, radius: 40, sides: 8, axis: 'z', flanges: full ? 1 : 0, detail: D,
  }), { pos: [146, -8, -320] });

  // =========================================================================
  // 6. THE STERN: block, empty drive well, two aux bells, radiator bank
  // =========================================================================
  const engGeo = G.loft(toStations(decimate(ENGINE_STATIONS, decim)), { capFront: false, capBack: false });
  B.add('engine', 'hull', engGeo);
  mass('engine-block', engGeo);

  const wellProfile = G.octProfile(WELL.hw, WELL.top, WELL.bot, WELL.cw, WELL.ct, WELL.cb);
  const sternProfile = stationProfile(ENGINE_STATIONS[0]);
  // Annular stern face between the block's outline and the drive-well mouth.
  B.add('engine', 'plating', G.ringFace(sternProfile, wellProfile, WELL.mouthZ, true));
  // The well itself: an inside-out shell, so you look INTO a hole.
  B.add('engine', 'hullDark', G.prism(wellProfile, WELL.backZ, WELL.mouthZ, {
    capFront: false, capBack: true, flip: true,
  }));
  emptyMount(B, 'engine', CRUISER_ANCHORS.engine, {
    up: [0, 0, -1], padRadius: 46, struts: 0, conduits: 2, detail: D, full, rng: r,
  });

  // Two auxiliary bells doing the work of a drive that is not installed.
  for (const s of [-1, 1]) {
    B.add('engine', 'greeble', G.thrusterBell({
      throat: 24, mouth: 36, length: 66, sides: 8, collar: false, detail: D,
    }), { pos: [s * 110, 26, -634] });
    if (full) {
      B.add('engine', 'greeble', G.thrusterBell({
        throat: 13, mouth: 20, length: 34, sides: 6, collar: false, inner: false, detail: D,
      }), { pos: [s * 110, -50, -666] });
    }
  }

  for (const s of [-1, 1]) {
    B.addRaw('engine', 'engineGlow', glowDisc(34), { pos: [s * 110, 26, -697], rot: [0, Math.PI, 0] });
  }

  // Radiator bank. Three to port, two to starboard - the ship lost one and the
  // crew rebalanced by moving the survivors, which is the kind of story a
  // silhouette can tell for free. Root chord sits on the block; the tip trails aft.
  const fins = full
    ? [[-1, -672], [-1, -604], [-1, -536], [1, -652], [1, -570]]
    : [[-1, -652], [-1, -552], [1, -602]];
  for (const [s, z] of fins) {
    B.add('engine', 'plating', G.radiatorFin({
      chord: 66, span: 146, thickness: 7, sweep: -24, tipChord: 44, ribs: 0, detail: D,
    }), { pos: [s * 128, 62, z], rot: [0, 0, s * 0.30] });
  }

  // =========================================================================
  // 7. RUNNING LIGHTS — exactly 40 m apart along the main axis. Mandatory.
  // =========================================================================
  const lights = [];
  for (let z = -680; z <= 680.01; z += RUNNING_LIGHT_AXIS_SPACING_M) {
    const c = chineAt(z);
    for (const s of [-1, 1]) {
      lights.push({
        pos: [s * (c.x + c.nx * 2.5), c.y + c.ny * 2.5, z],
        normal: [s * c.nx, c.ny, 0],
        // Every fifth light (200 m) is a beacon. Still a constant spacing, so it
        // adds rhythm without lying about the ship's size.
        scale: Math.abs(z) % 200 < 1 ? 13 : 7,
      });
    }
  }

  // NOTE: the game-wide 6 m strip (art/textures/runningLights.js) is deliberately
  // NOT used on this hull. Laid along 650 m of chine it renders as one continuous
  // additive band that erases the chamfer highlights the whole design depends on.
  // The 40 m beacons above carry the scale cue on their own. See chineStrip() for
  // the implementation if a shorter hull wants it.

  return { buckets: B.list(), lights, masses, detail: D };
}

// ---------------------------------------------------------------------------
// Shared sub-assemblies
// ---------------------------------------------------------------------------

/**
 * An UNOCCUPIED mount, in the one vocabulary the whole ship uses: a plinth, a bolt
 * ring, exposed hex struts and capped conduits. This function existing once is why
 * all six mounts read as the same kind of thing, which is why filling one reads as
 * progress rather than as a random new lump.
 */
function emptyMount(B, id, anchor, { up, padRadius, struts, conduits, plinth = null, detail, full, rng }) {
  const [ax, ay, az] = anchor;
  const face = up[1] > 0 ? 'up' : up[1] < 0 ? 'down' : 'aft';

  // Rotations that point a +Y primitive (pad, strut, conduit) or a +Z primitive
  // (collar) along the mount's outward normal.
  const padRot = face === 'down' ? [Math.PI, 0, 0] : [0, 0, 0];
  const collarRot = face === 'up' ? [-Math.PI * 0.5, 0, 0]
    : face === 'down' ? [Math.PI * 0.5, 0, 0]
      : [0, Math.PI, 0];
  const sign = face === 'down' ? -1 : 1;

  if (plinth && detail >= G.DETAIL.MID) {
    B.add('core', 'hull', G.panelledSlab({
      width: plinth[0], height: plinth[1], depth: plinth[2], chamfer: 12, detail,
    }), { pos: [ax, ay - sign * plinth[1] * 0.5, az] });
  }

  // Past the LOD1 switch distance the whole mount assembly is under two pixels.
  // Everything below this line is LOD0 only.
  if (!full) return;

  const padH = 9;
  if (face !== 'aft') {
    B.add('core', 'hull', G.mountPad({ radius: padRadius, height: padH, sides: 6, detail }),
      { pos: [ax, ay, az], rot: padRot });
  }

  // The bolt ring. This one shape, in the trim surface, is what makes an empty
  // socket read as a socket on all six mounts.
  B.add('core', 'trim', G.dockingCollar({
    radius: padRadius * 0.74, innerRadius: padRadius * 0.5, depth: 7, sides: 6, detail,
  }), {
    pos: face === 'aft' ? [ax, ay, az - 7] : [ax, ay + sign * padH, az],
    rot: collarRot,
  });

  const jitter = rng.fork(`mount:${id}`);
  for (let i = 0; i < struts; i++) {
    const a = (i / Math.max(1, struts)) * Math.PI * 2 + jitter.range(0, 0.6);
    const rr = padRadius * 1.3;
    // The rotation already sends the strut outward; do not also offset the origin.
    B.add('core', 'greeble', G.hexStrut({ length: 44, radius: 7, axis: 'y', detail }), {
      pos: [ax + Math.cos(a) * rr, ay, az + Math.sin(a) * rr],
      rot: padRot,
    });
  }
  for (let i = 0; i < conduits; i++) {
    const a = Math.PI * (0.25 + i * (1.5 / Math.max(1, conduits))) + jitter.range(0, 0.3);
    const rr = padRadius * 1.12;
    const len = 22 + jitter.range(0, 12);
    if (face === 'aft') {
      B.add('core', 'greeble', G.cappedConduit({ length: len, radius: 7, axis: 'z', detail }), {
        pos: [ax + Math.cos(a) * rr, ay + Math.sin(a) * rr, az],
        rot: [0, Math.PI, 0],
      });
    } else {
      B.add('core', 'greeble', G.cappedConduit({ length: len, radius: 7, axis: 'y', detail }), {
        pos: [ax + Math.cos(a) * rr, ay, az + Math.sin(a) * rr],
        rot: padRot,
      });
    }
  }
}

/** A flat additive disc with 0..1 UVs for the engine-glow texture. 10 triangles. */
function glowDisc(radius) {
  return new THREE.CircleGeometry(radius, 10);
}

/**
 * The 6 m emissive strip along the midship chine. U is authored in METRES so the
 * registry's running-light texture lays down exactly one lamp every six metres with
 * no per-mesh fiddling and no way to lie about the ship's size.
 */
export function chineStrip(z0, z1, side) {
  const a = chineAt(z0), b = chineAt(z1);
  const half = 5;
  const cross = (c) => [-c.ny * half, c.nx * half];   // across the facet
  const ca = cross(a), cb = cross(b);
  const off = 2.0;
  const p = [
    [side * (a.x + a.nx * off + ca[0]), a.y + a.ny * off + ca[1], z0],
    [side * (a.x + a.nx * off - ca[0]), a.y + a.ny * off - ca[1], z0],
    [side * (b.x + b.nx * off - cb[0]), b.y + b.ny * off - cb[1], z1],
    [side * (b.x + b.nx * off + cb[0]), b.y + b.ny * off + cb[1], z1],
  ];
  const lengthM = Math.abs(z1 - z0);
  const uvs = [[0, 0], [0, 1], [lengthM, 1], [lengthM, 0]];
  const order = [0, 1, 2, 0, 2, 3];

  // Emit with outward winding: test the first triangle against the outward normal.
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const outward = [side * a.nx, a.ny, 0];
  const flip = (nrm[0] * outward[0] + nrm[1] * outward[1]) < 0;
  const idx = flip ? [0, 2, 1, 0, 3, 2] : order;

  const pos = new Float32Array(18);
  const uv = new Float32Array(12);
  for (let i = 0; i < 6; i++) {
    const k = idx[i];
    pos[i * 3] = p[k][0]; pos[i * 3 + 1] = p[k][1]; pos[i * 3 + 2] = p[k][2];
    uv[i * 2] = uvs[k][0]; uv[i * 2 + 1] = uvs[k][1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------

/**
 * Targetable subsystems, positioned on the real geometry above. Salvage shares sum
 * to 0.94: a hull stripped of every subsystem is still worth something for its
 * frame, and no single kill can take the whole prize.
 *
 * @type {import('../../core/contracts.js').SubsystemDef[]}
 */
export const CRUISER_SUBSYSTEMS = [
  { id: 'reactor', kind: 'reactor', hp: 3200, position: [0, -6, -300], radius: 96, salvageValue: 0.28, label: 'Reactor' },
  { id: 'engine_port', kind: 'engine', hp: 1800, position: [-110, 26, -650], radius: 62, salvageValue: 0.12, label: 'Port Drive' },
  { id: 'engine_stbd', kind: 'engine', hp: 1800, position: [110, 26, -650], radius: 62, salvageValue: 0.12, label: 'Starboard Drive' },
  { id: 'sensor_array', kind: 'sensor', hp: 900, position: [-16, 268, -170], radius: 66, salvageValue: 0.10, label: 'Sensor Mast' },
  { id: 'salvage_cradle', kind: 'hangar', hp: 2200, position: [0, -128, -6], radius: 130, salvageValue: 0.14, label: 'Salvage Cradle' },
  { id: 'mount_port', kind: 'weapon', hp: 1200, position: [-152, 22, 48], radius: 70, salvageValue: 0.09, label: 'Port Sponson' },
  { id: 'mount_stbd', kind: 'weapon', hp: 1200, position: [152, 22, 48], radius: 70, salvageValue: 0.09, label: 'Starboard Sponson' },
];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Build the player cruiser.
 *
 * @param {import('../../core/contracts.js').BuildContext} ctx
 * @returns {{
 *   root: THREE.Group,
 *   lod: THREE.LOD,
 *   hardpoints: Map<string, {socket: THREE.Object3D, def: Object, module: Object|null, object: THREE.Object3D|null}>,
 *   subsystems: import('../../core/contracts.js').SubsystemDef[],
 *   bounds: THREE.Box3,
 *   masses: Array<{id:string, box:THREE.Box3}>,
 *   stats: {triangles:number[], drawCalls:number[]},
 * }}
 */
export function buildCruiser(ctx) {
  const { materials, rng } = ctx;
  if (!materials?.get) throw new Error('[cruiser] ctx.materials must be the shared material registry');

  const root = new THREE.Group();
  root.name = 'cruiser';

  const lodNode = new THREE.LOD();
  lodNode.name = 'cruiser:lod';
  root.add(lodNode);

  const bounds = new THREE.Box3();
  const triangles = [];
  const drawCalls = [];
  let masses = [];

  // LOD switch distances. The cruiser is 1400 m; at 4.2 km it is roughly a fifth of
  // the frame, which is where the greeble stops being resolvable at 1080p.
  const LEVELS = [0, 4200, 14000];

  for (let lod = 0; lod < 3; lod++) {
    const level = new THREE.Group();
    level.name = `cruiser:lod${lod}`;

    const { buckets, lights, masses: m } = hullParts({ rng, lod });
    if (lod === 0) masses = m;

    let tris = 0;
    let calls = 0;

    // Group nodes exist so the damage system can hide/replace a whole mass.
    const groupNodes = Object.create(null);
    for (const g of GROUPS) {
      const n = new THREE.Group();
      n.name = `cruiser:${g}`;
      level.add(n);
      groupNodes[g] = n;
    }

    for (const b of buckets) {
      const geo = G.mergeParts(b.parts, { uv: b.uv });
      if (!geo) continue;
      geo.name = `cruiser:${b.key}`;
      const [key, opts] = SURFACE[b.surface] ?? [b.surface, { faction: 'player' }];
      const mesh = new THREE.Mesh(geo, materials.get(key, opts));
      mesh.name = `${b.key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Additive emissive strips must not write depth or fight the hull.
      if (b.surface === 'runningLights' || b.surface === 'engineGlow') {
        mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 2;
      }
      groupNodes[b.group].add(mesh);
      tris += G.triCount(geo);
      calls++;
      if (lod === 0) {
        geo.computeBoundingBox();
        bounds.union(geo.boundingBox);
      }
    }

    // Running lights: one InstancedMesh, one draw call, the whole scale cue.
    if (lights.length) {
      const quad = new THREE.PlaneGeometry(1, 1);
      const mat = materials.get('emissive', { faction: 'player', intensity: 1.55, instanced: true });
      const inst = new THREE.InstancedMesh(quad, mat, lights.length);
      inst.name = 'cruiser:runningLights';
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      const m4 = new THREE.Matrix4();
      const rot = new THREE.Matrix4();
      const eye = new THREE.Vector3();
      const tgt = new THREE.Vector3();
      const up = new THREE.Vector3(0, 0, 1);
      for (let i = 0; i < lights.length; i++) {
        const L = lights[i];
        eye.set(0, 0, 0);
        tgt.set(-L.normal[0], -L.normal[1], -L.normal[2]);
        rot.lookAt(eye, tgt, up);          // +Z of the quad ends up along the normal
        m4.copy(rot);
        m4.scale(new THREE.Vector3(L.scale, L.scale, L.scale));
        m4.setPosition(L.pos[0], L.pos[1], L.pos[2]);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      groupNodes.core.add(inst);
      tris += lights.length * 2;
      calls++;
    }

    triangles.push(tris);
    drawCalls.push(calls);
    lodNode.addLevel(level, LEVELS[lod]);
  }

  // Sockets last so they are not swept up by the LOD levels: modules must survive
  // an LOD switch, so they hang off the root, not off a level.
  const hardpoints = createSockets(root);

  const result = {
    root,
    lod: lodNode,
    hardpoints,
    subsystems: CRUISER_SUBSYSTEMS,
    bounds,
    masses,
    stats: { triangles, drawCalls },
    silhouetteDirty: false,
  };
  root.userData.hull = result;
  return result;
}

export { CRUISER_HARDPOINTS };
