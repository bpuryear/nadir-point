/**
 * DORSAL MODULES — the raised barbette between the bridge tower and the casemate.
 *
 * Mount is at hardpoints.js#CRUISER_ANCHORS.dorsal = [0, 94, -40] - the top of the
 * raised dorsal armour spine, over the shoulder. (This header said [0, 130, 270]
 * until the hull rebuild moved it; the anchors are the single source of truth and
 * this comment is not, so trust that constant, not this sentence.) The module sits
 * on a plinth whose surrounding deck is about 30 m below the mount plane.
 *
 * Three consequences an author has to design for:
 *
 *   - a module wider than ~166 m OVERHANGS the plinth, which is good (it breaks the
 *     outline) but has to be shown to be carried: hence the down-struts on the rail
 *     battery and the missile raft. Unsupported overhang reads as a bug.
 *   - the bridge tower and the cruiser's own sensor mast are AFT of this mount, not
 *     over it, so a dorsal fit is silhouetted against sky rather than against them.
 *     That is why the mount can afford five fits and why they have to differ from
 *     each other rather than merely from the hull.
 *   - THE FIVE FITS ARE MEASURED AGAINST EACH OTHER, not eyeballed.
 *     `modules/audit.mjs` fits each one to a real cruiser and compares the outlines;
 *     the run that found rail-battery vs PD-ring differing by 36 m at their peak -
 *     under one pixel at the 30 px read - is what drove the current shapes. The
 *     mount now owns two clearly separate bands: TALL AND OPEN (sensor mast,
 *     shield pylons, PD crown) and LOW AND SOLID (missile raft), with the rail
 *     battery armoured and reaching forward over the foredeck.
 *
 * The dorsal bed has near-full traverse (306 degrees), so unlike the bow these read
 * as TURRETS: ring, rotating mass, mechanism above the ring.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import {
  ModuleBuilder, MODULE_TRI_BUDGET, barrel, aimed, muzzleAlong,
  massLoft, massFrames, massStrake, massRecess,
} from './kit.js';

const HALF_PI = Math.PI * 0.5;

/**
 * A SPAR IN THE HULL'S SECTION, from widths alone; same construction and reasoning as
 * `bow.js#spar`. Depth follows the beam at a fixed 1.72 : 1, so a spar cannot violate
 * M-F4 whatever length it is given - which matters because M-F4 is an assertion inside
 * `massLoft`, i.e. a red gate rather than a bad picture.
 */
const SPAR_DEPTH = 0.58;
const spar = (len, w0, w1, mid = 0.46) => {
  const wm = (w0 + w1) * 0.52;
  const row = (z, w, k, df, fl) => [z, w, w * SPAR_DEPTH, -w * SPAR_DEPTH, k, df, fl];
  return [row(0, w0, 0.44, 0.48, 0.92), row(len * mid, wm, 0.44, 0.48, 0.92), row(len, w1, 0.42, 0.46, 0.96)];
};

/** Twin rails: struck from z = 56, 208 m long, muzzle glow 8 m proud of the tip. */
const RAIL_SIDES = [-1, 1];
const RAIL_X = 30;
const RAIL_Y = 82;
const RAIL_MUZZLE_Z = 272;
/** The gunhouse's stations, `[z, half, top, bottom]`, at module z -6. Beam : depth 1.67. */
const TURRET = [[-75, 56, 92, 26], [-24, 65, 97, 19], [30, 65, 97, 19], [75, 58, 90, 28]];

// ---------------------------------------------------------------------------
// T3 — Coalition Rail Battery
// ---------------------------------------------------------------------------

/**
 * Twin 9.5 km rails in a barbette turret. The heaviest thing that can go on top of
 * the ship, and it is built to look it: a ring, a slab turret, an aft counterweight
 * that overhangs the plinth, four down-struts carrying the load into the deck, and
 * 210 m of rail sticking out over the bow.
 *
 * The turret grew 16 m and the rails and hoist rose with it, because the fitted
 * audit had this and the missile raft peaking only 129 m apart - under three pixels
 * at the 30 px read, on the two mounts a player is most likely to be choosing
 * between. This is the TALL, ARMOURED, FORWARD-REACHING dorsal fit; the raft is the
 * flat one. The rails now clear the raft's own deck line by fifty metres along the
 * whole 210 m they overhang, which is where the difference is most visible: over
 * the foredeck, against sky.
 */
function buildRailBattery(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Barbette ring at the mount plane.
  b.graft([0, 0, 0], [-HALF_PI, 0, 0], 64);
  b.add('dark', G.pipeRun({ length: 20, radius: 58, sides: 8, axis: 'y', caps: false, detail: D }),
    { pos: [0, -2, 0] });

  // THE TURRET BODY, in the hull's own section. It was 122 x 80, i.e. beam : depth
  // 1.53 - under M-F4's 1.6, on a mass 150 m long. 130 x 78 turns it over, and a
  // turret that is wider than it is tall is what every capital in the reference
  // fleets has: the height goes into the barbette, not into the gunhouse.
  b.add('hull', G.place(massLoft(TURRET, { detail: D, label: 'rail turret' }), { pos: [0, 0, -6] }));
  b.add('plating', G.place(massFrames(TURRET, [-38, 34], { detail: D }), { pos: [0, 0, -6] }));
  // M-F6 / F10: `dark` below the turret's own knuckle, `hull` above it.
  b.add('dark', G.place(massStrake(TURRET, {
    z0: -58, z1: 58, side: 1, facet: [2, 1], t0: 0.14, t1: 0.68, drift: 0.12, out: 4, detail: D,
  }), { pos: [0, 0, -6] }));
  // Aft counterweight, overhanging the plinth and off-centre to port.
  b.add('plating', G.bevelBox({
    width: 86, height: 44, depth: 62, chamfer: 12, draft: 8, cant: 0.12, rake: -7, detail: D,
  }), { pos: [-10, 42, -104] });

  // The rails. Long, thin, parallel: the read.
  for (const s of RAIL_SIDES) {
    b.add('greeble', barrel({ length: 208, radius: 11, radiusEnd: 9, detail: D }),
      { pos: [s * RAIL_X, RAIL_Y, 56] });
    b.glow([s * RAIL_X, RAIL_Y, RAIL_MUZZLE_Z], 9);
  }
  // Recoil cradle under the rails.
  b.add('greeble', G.panelledSlab({ width: 92, height: 14, depth: 84, detail: D }), { pos: [0, 64, 92] });

  // Down-struts into the deck (deck is at local y = -72).
  if (full) {
    for (const s of [-1, 1]) {
      for (const dz of [-70, 62]) {
        b.add('greeble', G.hexStrut({ length: 74, radius: 8, axis: 'y', detail: D }),
          { pos: [s * 74, -72, dz], rot: [0, 0, -s * 0.18] });
      }
    }
    // Cable trunk from the turret down the port side.
    b.add('greeble', aimed(
      G.pipeRun({ length: 78, radius: 9, sides: 6, axis: 'z', flanges: 1, detail: D }),
      [-0.30, 1, -0.16], [-56, -68, -74],
    ));
  }

  // M-F7: the loading gear is IN the turret's flank, not on it.
  b.add('dark', G.place(massRecess(TURRET, {
    z: 26, side: -1, facet: [2, 3], t: 0.44, width: 64, height: 26, depth: 16, wall: 4, detail: D,
  }), { pos: [0, 0, -6] }));

  // Ammunition hoist standing proud of the turret roof, to starboard.
  b.add('plating', G.bevelBox({
    width: 34, height: 46, depth: 54, chamfer: 8, draft: 6, cant: -0.14, detail: D,
  }), { pos: [34, 118, -44] });

  b.lightRun([-58, 84, -60], [-58, 84, 60], [-0.4, 0.92, 0], { max: 7 });

  return b.finish('dorsal_rail_battery');
}

registerModule({
  id: 'dorsal_rail_battery',
  name: 'Coalition Rail Battery',
  hardpoint: 'dorsal',
  tier: 3,
  faction: 'coalition',
  description: 'Twin mass-driver rails in a full-traverse barbette, off a Coalition monitor. '
    + 'Four struts carry the recoil into your deck frames. You will feel every shot.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1420,
  build: buildRailBattery,
  // Two rails, two shots. This module already drew its two apertures in the right
  // places; the declaration makes them the SIM's numbers instead of the renderer's.
  muzzles: RAIL_SIDES.map((s) => [s * RAIL_X, RAIL_Y, RAIL_MUZZLE_Z]),
  weapon: {
    id: 'w_rail_battery', name: 'Twin Rails', type: 'rail',
    range: RANGE.rail, damage: 780, shotsPerBurst: 2, burstInterval: 0.35,
    cooldown: 7.5, projectileSpeed: 4200, tracking: 0.12, powerDraw: 34,
    yawWidth: Math.PI * 1.7, pitchWidth: Math.PI * 0.18, subsystemAccuracy: 0.55,
  },
  silhouetteTags: ['turret', 'twin-barrel', 'overhanging', 'top-heavy'],
});

// ---------------------------------------------------------------------------
// T1 — Concord Long-Range Sensor Mast
// ---------------------------------------------------------------------------

/**
 * A 210 m lattice mast with a 46 m dish on top. Adds the tallest point on the ship
 * by a wide margin, which is exactly what a sensor loadout should look like: the
 * silhouette says "this hull sees a long way and cannot punch".
 */
/** The plinth's stations, `[z, half, top, bottom]`. Beam : depth 3.5. */
const MAST_PLINTH = [[-46, 38, 22, -4], [-8, 46, 25, -7], [30, 46, 25, -7], [46, 40, 21, -3]];
/** `[x, y, width, height]`. Two, at different heights and different sizes (M-F9). */
const MAST_PANELS = [[-40, 150, 42, 54], [38, 112, 30, 38]];

function buildSensorMast(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', massLoft(MAST_PLINTH, { detail: D, label: 'mast plinth' }));
  b.add('plating', massFrames(MAST_PLINTH, [-24], { detail: D }));
  b.graft([0, 22, 0], [-HALF_PI, 0, 0], 40);

  // The mast.
  b.add('greeble', G.antennaMast({
    height: 206, radius: 10, tipRadius: 3.6, spars: full ? 3 : 1, sparSpan: 44, detail: D,
  }), { pos: [0, 22, 0] });

  // Primary dish, canted forward.
  b.add('plating', G.sensorDish({ radius: 46, depth: 19, sides: 10, stub: 16, detail: D }),
    { pos: [0, 236, 14], rot: [-0.48, 0, 0] });

  // Secondary panel arrays, port and starboard at different heights — an array
  // that is symmetric reads as decoration; one that is not reads as equipment.
  //
  // AND THEY ARE BOLTED TO THE MAST NOW. `tools/silhouette.mjs` counted them as two
  // detached fragments of about 22 m in the bow-on view: the mast is 10 m in radius
  // at that height and the panels sat at x +-40, so in projection they were two plates
  // floating beside a pole. Each now has a stub arm, struck from the mast's own
  // surface and cut to the measured distance to the panel less a bite of it, so
  // neither figure is authored and neither can drift.
  if (full) {
    for (const [px, py, w, h] of MAST_PANELS) {
      const root = [Math.sign(px) * 7, py - 6, 0];
      const d = [px - root[0], py - root[1], 0];
      b.add('greeble', aimed(G.hexStrut({
        length: Math.hypot(d[0], d[1]) - w * 0.30, radius: 5, axis: 'z', detail: D,
      }), d, root));
      b.add('plating', G.bevelBox({
        width: w, height: h, depth: h * 0.62, chamfer: 3, draft: 3, cant: px < 0 ? 0.34 : -0.34, detail: D,
      }), { pos: [px, py, 0] });
    }
    // Three guy struts leaning in from the plinth to meet the mast.
    for (let i = 0; i < 3; i++) {
      const a = 0.5 + i * 2.09;
      const ca = Math.cos(a), sa = Math.sin(a);
      b.add('greeble', aimed(
        G.hexStrut({ length: 86, radius: 5, axis: 'z', detail: D }),
        [-ca * 0.30, 1, -sa * 0.30], [ca * 30, 22, sa * 30],
      ));
    }
  }

  b.lightRun([0, 40, 0], [0, 220, 0], [0, 0, 1], { max: 10 });

  return b.finish('dorsal_sensor_mast');
}

registerModule({
  id: 'dorsal_sensor_mast',
  name: 'Concord Deep Survey Mast',
  hardpoint: 'dorsal',
  tier: 1,
  faction: 'concord',
  description: 'A 210 m lattice mast and a 46 m dish. It is the tallest thing you will ever '
    + 'bolt on, it is made of glass, and it doubles the range you see contacts at.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 240,
  build: buildSensorMast,
  grants: { sensorRange: RANGE.sensorBase * 1.0 },
  silhouetteTags: ['mast', 'dish', 'tall', 'thin'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Missile Cells
// ---------------------------------------------------------------------------

/**
 * A vertical-launch raft: six open hex cells standing proud of an armoured deck,
 * two hatches lying open, and a reload crane folded over the port edge. Wide and
 * FLAT, so it is the dorsal module that changes the top-down outline rather than
 * the side one — which is what makes it distinguishable from the rail battery.
 *
 * WIDER AND FLATTER THAN IT WAS, for the reason given on the PD ring: the two were
 * measured at the same bounding box and the same read. This one keeps the whole
 * mount's LOW, WIDE, SOLID half - 252 m across, nothing above 100 m - and the ring
 * takes the tall, open half. The 22 m cut off the crane is worth more than it
 * sounds: a lone thin arm was setting this module's whole silhouette height, so
 * the raft measured "tall" while looking flat.
 */

/** Six cells as `[x, z]`. LOD1 builds three of them; the muzzle list is these six. */
const VLS_CELLS = [[-92, -50], [0, -50], [92, -50], [-92, 44], [0, 44], [92, 44]];
const VLS_CELLS_LOD1 = [VLS_CELLS[0], VLS_CELLS[2], VLS_CELLS[4]];
/** The cell tube is struck at y = 20 and runs 74 m up, so the mouth is at y = 94. */
const VLS_CELL_Y = 20;
const VLS_CELL_LEN = 74;

/**
 * THE RAFT, in the hull's own section. `[z, half, top, bottom, knuckle, deckFlat,
 * flare]`. It was a `panelledSlab` 252 x 22 x 178, and it is the single largest
 * horizontal plate on the ship when this fit is installed - "wide and FLAT" is the
 * whole read - so it was also the single largest axis-aligned face in the library.
 * Beam : depth 10.5-11.5, so M-F4 never came near it; what the section buys here is
 * the cambered deck, the knuckle and the keel deadrise, which is why the raft now
 * takes a gradient across its top instead of one flat value.
 */
const VLS_RAFT = [
  [-89, 118, 20, -6, 0.42, 0.46, 0.94],
  [-24, 126, 22, -8, 0.45, 0.49, 0.90],
  [40, 126, 22, -8, 0.45, 0.49, 0.90],
  [89, 116, 19, -5, 0.40, 0.44, 0.96],
];

function buildMissileCells(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // The raft, overhanging the plinth to both sides.
  b.add('hull', G.place(massLoft(VLS_RAFT, { detail: D, label: 'vls raft' }), { pos: [0, 8, 0] }));
  // M-F5: two frames, 96 m apart and neither at the centre of length. Coalition
  // shows its structure, and on a 178 m raft the frames are what say 178.
  b.add('plating', G.place(massFrames(VLS_RAFT, [-58, 38], { detail: D }), { pos: [0, 8, 0] }));
  // M-F6 / F10: one plate a side on the raft's lower flank, below its own knuckle,
  // on `dark`, so the value boundary lands on a real chine with a shadow at it.
  for (const [side, z0, z1, t0] of [[-1, -76, 52, 0.12], [1, -30, 78, 0.22]]) {
    b.add('dark', G.place(massStrake(VLS_RAFT, {
      z0, z1, side, facet: [2, 1], t0, t1: t0 + 0.52, drift: -side * 0.12, out: 4, detail: D,
    }), { pos: [0, 8, 0] }));
  }
  b.graft([0, -8, 0], [-HALF_PI, 0, 0], 42);

  // Six cells. Open at the top; you can see down into them.
  const cells = full ? VLS_CELLS : VLS_CELLS_LOD1;
  for (const [x, z] of cells) {
    b.add('plating', G.hexStrut({ length: VLS_CELL_LEN, radius: 25, axis: 'y', caps: false, detail: D }),
      { pos: [x, VLS_CELL_Y, z] });
    b.add('dark', G.hexStrut({ length: 68, radius: 22, axis: 'y', caps: true, detail: D }),
      { pos: [x, 18, z] });
  }

  // Two hatches, hinged open at 70 degrees. These are the parts that say "loaded".
  if (full) {
    for (const s of [-1, 1]) {
      b.add('plating', G.bevelBox({
        width: 62, height: 5, depth: 74, chamfer: 2, draft: 2, rake: s * 5, detail: D,
      }), { pos: [s * 132, 40, -4], rot: [0, 0, -s * 0.95] });
    }
  }

  // Reload crane over the port edge — the module's asymmetry. `spar` rather than
  // `hexStrut`: a crane jib is a plate girder, not a pipe.
  // Struck from the INBOARD, HIGH end and running outboard and down, which is the
  // way the `hexStrut` ran: it was authored along +X from x -150 with a 0.26 rad lift
  // about Z, so its high end was the inboard one at y 90 and its low end the outboard
  // one at 62. The jib's top sets this module's whole silhouette height (see the
  // header on why 22 m came off it), so the two ends are not interchangeable.
  b.add('greeble', aimed(massLoft(spar(110, 8, 6), {
    detail: D, label: 'crane jib', keep: G.FACET_LOD.far,
  }), [-1, -0.26, 0], [-44, 90, 62]));
  b.add('greeble', G.bevelBox({
    width: 22, height: 26, depth: 26, chamfer: 4, draft: 4, cant: 0.16, detail: D,
  }), { pos: [-74, 84, 62] });

  b.lightRun([-124, 24, -84], [-124, 24, 84], [-0.86, 0.5, 0], { max: 9 });

  return b.finish('dorsal_missile_cells');
}

registerModule({
  id: 'dorsal_missile_cells',
  name: 'Coalition Missile Raft',
  hardpoint: 'dorsal',
  tier: 2,
  faction: 'coalition',
  description: 'Six vertical launch cells on an armoured raft, hatches open, reload crane still '
    + 'bolted where the donor ship had its port walkway.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 780,
  build: buildMissileCells,
  // Six cells, six missiles, one muzzle per cell at the mouth of its tube.
  muzzles: VLS_CELLS.map(([x, z]) => [x, VLS_CELL_Y + VLS_CELL_LEN, z]),
  weapon: {
    id: 'w_vls_cells', name: 'Vertical Launch Cells', type: 'missile',
    range: RANGE.missile, damage: 460, shotsPerBurst: 6, burstInterval: 0.35,
    cooldown: 12.0, projectileSpeed: 300, tracking: 0.55, powerDraw: 16,
    yawWidth: Math.PI * 2, pitchWidth: Math.PI * 0.8, subsystemAccuracy: 0.20,
    // SIX CELLS, SIX ROUNDS IN THE FEED. Without this override `WeaponMount.readyMax`
    // falls back to `AMMO_SPEC.missile.ready` = 4 (stores.js), so this launcher has
    // been firing four of its six cells and then forcing a 0.5 s stall and an 11 s
    // reload for the whole life of the project. Nothing caught it because nothing
    // checked the relation; `contracts.js` now throws on it, and this is the one
    // violator that fix was written against. The two must stay in the same commit.
    ready: 6,
  },
  silhouetteTags: ['raft', 'cell-cluster', 'wide', 'flat'],
});

// ---------------------------------------------------------------------------
// T1 — Concord Point-Defence Ring
// ---------------------------------------------------------------------------

/**
 * Four twin PD mounts on SPLAYED stalks around a ring, with a flat AESA panel
 * standing up in the middle.
 *
 * WHY THE STALKS ARE NOW 96 m AND NOT 44. The fitted-silhouette audit
 * (modules/audit.mjs) measured this module against the missile raft at a mean of
 * 30 m and a peak of 78 m of outline difference - under two pixels at the 30 px
 * read, i.e. two dorsal fits the player cannot tell apart. The cause was not
 * subtle: both were 215 m wide, both stopped around y = 100 local, and both were a
 * flat cluster on a round pad. Same bounding box, same read.
 *
 * The stalks were where the class was supposed to be, so the class is now IN the
 * stalks: 150 m tall, splayed 19 degrees outboard so the four guns stand at a
 * radius of 102 m - well outside the 76 m pad - with clear sky between them from
 * every angle. That makes
 * this the OPEN, TALL, THIN dorsal fit against the raft's LOW, WIDE, SOLID one -
 * a difference of kind, which is what ship-language.md §6 M7 means by two modules
 * on one hardpoint not sharing a tag set. It costs nothing: a longer strut is the
 * same eight triangles as a short one, and the splay is a rotation.
 */

/** Four mounts, NOT at 90 degree intervals — offset so the ring has a front. */
const PD_MOUNTS = [0.35, 1.72, 3.30, 4.75];
const PD_MOUNTS_LOD1 = [PD_MOUNTS[0], PD_MOUNTS[2]];
const PD_SPLAY = 0.34;                   // radians the stalks lean outboard
const PD_STALK = 150;
const PD_RING_R = 52;                    // where a stalk is struck from the pad
const PD_GUN_OFFSET = 30;                // barrel block centre, outboard of the head
const PD_GUN_DEPTH = 40;                 // its depth; the aperture is half of that further out
const PD_GUN_WIDTH = 12;                 // twin barrels sit +-width/4 across it

/**
 * One PD mount resolved from its bearing. Returns the stalk root, the gun-head
 * platform, and the TWO barrel apertures — this is a twin mount, so four mounts
 * publish the eight muzzles `shotsPerBurst` promises.
 */
function pdMount(a) {
  const c = Math.cos(a), s = Math.sin(a);
  const reach = PD_STALK * Math.sin(PD_SPLAY);
  const rise = PD_STALK * Math.cos(PD_SPLAY);
  const root = [c * PD_RING_R, 10, s * PD_RING_R];
  const head = [c * (PD_RING_R + reach), 10 + rise, s * (PD_RING_R + reach)];
  const gr = PD_RING_R + reach + PD_GUN_OFFSET + PD_GUN_DEPTH * 0.5;
  const t = PD_GUN_WIDTH * 0.25;         // half the separation between the twins
  // The block is yawed to HALF_PI - a, which sends its +Z radially outboard and its
  // +X tangential; the twins are split along that tangent.
  const muzzles = [-1, 1].map((k) => [c * gr + k * t * s, 12 + rise, s * gr - k * t * c]);
  return { c, s, reach, rise, root, head, muzzles };
}

/**
 * THE PAD, in the hull's own section, where a `mountPad` - a regular eight-sided disc
 * with a flat top square to +Y - used to be. 152 m across, 22 deep and 150 long, so
 * beam : depth is 6.9 and M-F4 is never in question; what it buys is the same camber,
 * knuckle and deadrise the raft gets, on the one horizontal face this module has.
 */
const PD_PAD = [
  [-75, 66, 14, -8, 0.42, 0.46, 0.94],
  [-22, 76, 16, -6, 0.45, 0.49, 0.90],
  [26, 76, 16, -6, 0.45, 0.49, 0.90],
  [75, 64, 13, -9, 0.40, 0.44, 0.96],
];

function buildPDRing(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', massLoft(PD_PAD, { detail: D, label: 'pd pad' }));
  // M-F5: one frame, off-centre. Concord uses few parts and this module is a ring
  // of stalks, so the pad gets one step rather than the Coalition raft's two.
  b.add('plating', massFrames(PD_PAD, [-34], { detail: D }));
  // M-F6: Concord's one long plate, on the port flank below the pad's knuckle.
  b.add('dark', massStrake(PD_PAD, {
    z0: -62, z1: 64, side: -1, facet: [2, 1], t0: 0.14, t1: 0.70, drift: -0.10, out: 4, detail: D,
  }));
  b.graft([0, 16, 0], [-HALF_PI, 0, 0], 72);

  const mounts = full ? PD_MOUNTS : PD_MOUNTS_LOD1;
  for (const a of mounts) {
    const { c, s, reach, rise, root, head } = pdMount(a);
    // Lean each stalk away from the axis. The head lands at radius
    // 52 + 150 sin(SPLAY) = 102 m, i.e. outside the 76 m pad, so the four guns are
    // silhouetted against sky rather than against the module's own body.
    //
    // The stalk is a SPAR - 18 m across the flat and 10 thick - rolled to stand on
    // edge to the ring, so from any orbit angle at least two of the four present a
    // thin edge and the sky between them survives. That gap is the whole reason the
    // stalks went from 44 m to 150 (see the header): closing it with four round
    // 16 m posts turned wide would undo the fix.
    b.add('greeble', aimed(G.place(massLoft(spar(PD_STALK, 9, 7), {
      detail: D, label: 'pd stalk', keep: G.FACET_LOD.far,
    }), { rot: [0, 0, HALF_PI] }), [c * Math.sin(PD_SPLAY), Math.cos(PD_SPLAY), s * Math.sin(PD_SPLAY)], root));
    b.add('plating', G.bevelBox({
      width: 26, height: 18, depth: 30, chamfer: 6, draft: 4, cant: 0.14, rake: -4, detail: D,
    }), { pos: head });
    // Twin barrels, pointing outboard along the ring radius.
    b.add('greeble', G.bevelBox({
      width: PD_GUN_WIDTH, height: 6, depth: PD_GUN_DEPTH, chamfer: 2, draft: 2, detail: D,
    }), {
      pos: [c * (PD_RING_R + reach + PD_GUN_OFFSET), 12 + rise, s * (PD_RING_R + reach + PD_GUN_OFFSET)],
      rot: [0, HALF_PI - a, 0],
    });
  }

  // Central AESA panel: a flat plate standing on edge, canted forward. It stays
  // BELOW the gun heads - the crown is the read, and a mast in the middle of it
  // would put this module back in the sensor mast's band.
  b.add('plating', G.bevelBox({
    width: 62, height: 66, depth: 9, chamfer: 4, draft: 3, cant: -0.09, detail: D,
  }), { pos: [0, 62, 0], rot: [-0.26, 0, 0] });
  if (full) {
    b.add('greeble', G.hexStrut({ length: 40, radius: 9, axis: 'y', detail: D }), { pos: [0, 14, 0] });
  }

  b.lightRun([-66, 22, -30], [-66, 22, 30], [-1, 0.2, 0], { max: 4 });
  b.lightRun([66, 22, -30], [66, 22, 30], [1, 0.2, 0], { max: 4 });

  return b.finish('dorsal_pd_ring');
}

registerModule({
  id: 'dorsal_pd_ring',
  name: 'Concord Point-Defence Ring',
  hardpoint: 'dorsal',
  tier: 1,
  faction: 'concord',
  description: 'Four twin autocannon on stalks around a fire-control ring. Near-spherical '
    + 'coverage; it will not hurt a frigate but nothing small gets through it.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 290,
  build: buildPDRing,
  // Eight muzzles: four twin mounts. PD is locked to AUTO and is excluded from the
  // ripple, but it still needs per-barrel origins so its tracers leave the barrel
  // that is actually pointing at the missile rather than the centre of the pad.
  muzzles: PD_MOUNTS.flatMap((a) => pdMount(a).muzzles),
  weapon: {
    id: 'w_pd_ring', name: 'PD Ring', type: 'pd',
    range: RANGE.pointDefence, damage: 26, shotsPerBurst: 8, burstInterval: 0.09,
    cooldown: 0.8, projectileSpeed: 2000, tracking: 3.2, powerDraw: 8,
    yawWidth: Math.PI * 2, pitchWidth: Math.PI * 0.92, subsystemAccuracy: 0.10,
  },
  silhouetteTags: ['crown', 'ring', 'stalked', 'open'],
});

// ---------------------------------------------------------------------------
// T3 — Derelict Shield Pylons
// ---------------------------------------------------------------------------

/**
 * Three pylons at angles no human would choose, holding a faceted node 190 m above
 * the deck. This is the module that makes a loadout read as SCAVENGED-FROM-
 * SOMETHING-OLDER at a glance.
 *
 * IT USED TO SAY "with nothing visibly connecting it to them", AND IT MEANT IT. The
 * three pylons splayed OUTBOARD - tilt +0.22 to +0.42 - so their tips finished at
 * x 90-105 while the node they were holding is 38 m in radius on the centreline. In
 * the bow-on view `tools/silhouette.mjs` counted the node as a detached fragment
 * SIXTY-NINE METRES across, against a 26 m precedent: the biggest loose piece in the
 * library, and the front view did not gate, so it had been printed and read past for
 * as long as the tool has existed.
 *
 * That is the same defect as an unseated module - a lobe standing clear with nothing
 * crossing the gap - so it is fixed the same way and in the same wave. The pylons now
 * CONVERGE: each is aimed at its own point inside the crystal and cut to the measured
 * distance less a bite of it, exactly as `broadside.js`'s flak hoppers are. Neither
 * the length nor the direction is authored, so neither can drift when the node moves.
 *
 * The fiction survives intact and arguably improves. Three legs that splay out and
 * then bend back in are a CRADLE, and a cradle holding something that is obviously
 * not from the same civilisation is a better read than a crystal hovering unsupported
 * - which, at four kilometres against a gas giant, just looks like a bug.
 */
/** Where the crystal is. Everything else on this module is measured against it. */
const NODE_Y = 232;
/** The drum's stations, `[z, half, top, bottom]`. Beam : depth 3.6. */
const PYLON_DRUM = [[-58, 50, 26, -8], [-16, 62, 30, -4], [22, 62, 30, -4], [58, 52, 24, -6]];
/**
 * `a` bearing, `r` root radius on the drum, `t*` the point inside the crystal each
 * pylon is aimed at. Three different roots and three different targets, so the three
 * lengths and the three angles all come out different without one of them being typed.
 */
const PYLONS = [
  { a: 0.00, r: 44, tx: 14, ty: -18, tz: 6 },
  { a: 2.32, r: 38, tx: -12, ty: 4, tz: -9 },
  { a: 4.22, r: 50, tx: 4, ty: -30, tz: 13 },
];

function buildShieldPylons(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  // Base drum, in the hull's own section and canted off the deck plane. The `pipeRun`
  // it replaces was a six-sided tube 124 m across with two flat ends square to +-Y -
  // which is the tube-and-stick vocabulary this wave exists to get rid of.
  b.add('hull', G.place(massLoft(PYLON_DRUM, { detail: D, label: 'pylon drum' }),
    { rot: [0, 0, -0.06] }));
  b.graft([0, 34, 0], [-HALF_PI, 0, 0], 46);

  // Three pylons. 0, 133 and 242 degrees, three different root radii, and each AIMED
  // AT ITS OWN POINT inside the crystal - the pylon's length is then whatever that
  // distance is, less a third of the node's radius so the joint is buried. Nothing
  // here agrees with anything else, on purpose, and nothing here is a typed number
  // that stops being right the first time either end moves.
  for (const p of PYLONS) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    const root = [ca * p.r, 26, sa * p.r];
    const tgt = [p.tx, NODE_Y + p.ty, p.tz];
    const d = [tgt[0] - root[0], tgt[1] - root[1], tgt[2] - root[2]];
    const len = Math.hypot(d[0], d[1], d[2]) - 13;
    b.add('hull', aimed(
      G.hexStrut({ length: len, radius: 13, radiusEnd: 5, axis: 'z', detail: D }), d, root,
    ));
    b.glowDir([root[0] + d[0] * 0.94, root[1] + d[1] * 0.94, root[2] + d[2] * 0.94], 11, d);
  }

  // The node: a faceted crystal, and the three pylons are now buried in it.
  b.add('plating', G.hexStrut({ length: 62, radius: 38, radiusEnd: 6, axis: 'y', detail: D }),
    { pos: [0, NODE_Y, 0] });
  b.add('plating', aimed(G.hexStrut({ length: 58, radius: 38, radiusEnd: 5, axis: 'z', detail: D }),
    [0.07, -1, 0.05], [0, NODE_Y, 0]));
  b.glow([0, NODE_Y, 48], 34);
  b.glow([0, NODE_Y, -48], 34, [0, Math.PI, 0]);

  if (full) {
    // Two conduits climbing out of the drum at unrelated angles.
    for (const a of [1.1, 3.9]) {
      const ca = Math.cos(a), sa = Math.sin(a);
      b.add('greeble', aimed(G.cappedConduit({ length: 46, radius: 8, axis: 'z', detail: D }),
        [ca * 0.55, 1, sa * 0.55], [ca * 52, 20, sa * 52]));
    }
  }

  b.lightRun([0, 12, 62], [0, 12, -62], [0, 0.3, 1], { max: 7 });

  return b.finish('dorsal_shield_pylons');
}

registerModule({
  id: 'dorsal_shield_pylons',
  name: 'Derelict Barrier Pylons',
  hardpoint: 'dorsal',
  tier: 3,
  faction: 'derelict',
  description: 'Three pylons and a node that hangs between them without touching anything. It '
    + 'holds a barrier around your hull. Nobody in the Coalition can tell you how.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 640,
  build: buildShieldPylons,
  grants: { shieldCapacity: 5200, powerOutput: -12 },
  silhouetteTags: ['tripod', 'floating-node', 'tall', 'alien'],
});
