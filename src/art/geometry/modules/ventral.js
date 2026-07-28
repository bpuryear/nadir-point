/**
 * VENTRAL MODULES — the salvage cradle, looking down.
 *
 * Mount is at [0, -66, -10] and the module HANGS. The cradle around it is a pair of
 * frames at x = +/-100 running down to rails at y = -190, so the clear volume
 * directly under the mount is about 170 m wide until you get below y = -200, at
 * which point there is nothing but vacuum and you can be as wide as you like. Both
 * the hangar deck and the drone bay use exactly that: narrow through the cradle,
 * then flare out underneath it. That step is what makes them read as fitted INTO
 * the ship rather than stuck ON it.
 *
 * This mount is not a firing arc (see hardpoints.js#ARC_RATIONALE); it is the
 * utility bay, and it is where the run's biggest structural decision lives.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, throat, aimed } from './kit.js';

const HALF_PI = Math.PI * 0.5;

const oct = (hw, top, bot, cw, ct, cb) => G.octProfile(hw, top, bot, cw, ct, cb);

// ---------------------------------------------------------------------------
// T3 — Concord Hangar Deck   *** the structural pivot of the whole design ***
// ---------------------------------------------------------------------------

/**
 * THE HANGAR DECK. Installing this converts the game from a single-ship brawler
 * into a small RTS, so it has to be the most obvious change the player can make to
 * their ship, and it has to be obvious from the outside.
 *
 * What it does to the silhouette:
 *   - a 420 m lofted deck hull threaded down through the salvage cradle
 *   - a flight deck pad BELOW the cradle rails and wider than the cruiser's beam,
 *     so the bottom line of the ship steps out and down
 *   - two lit launch throats in the forward face, with a lined interior
 *   - a blast door and a control blister to port
 *   - approach lighting down both flanks at the standard 20 m
 * The bare hull's ventral view is an open frame. With this fitted it is a slab.
 */
function buildHangarDeck(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // The deck hull. A real lofted form, not a box: it has a bow and a stern.
  b.add('hull', G.loft([
    { z: -228, points: oct(74, -14, -138, 20, 14, 18) },
    { z: -40, points: oct(90, -8, -152, 24, 16, 20) },
    { z: 118, points: oct(88, -8, -150, 24, 16, 20) },
    { z: 208, points: oct(60, -16, -120, 18, 12, 16) },
  ], { capFront: true, capBack: true }), null);

  // Flight deck pad, below the cradle rails and wider than the cruiser's beam.
  b.add('plating', G.panelledSlab({ width: 268, height: 34, depth: 322, chamfer: 22, detail: D }),
    { pos: [0, -166, -18] });

  // Two launch throats in the forward face. Lined, so they read as holes.
  for (const s of [-1, 1]) {
    b.add('dark', throat({ width: 50, height: 44, depth: 64, detail: D }), { pos: [s * 30, -74, 208] });
    b.glow([s * 30, -74, 200], 22);
  }
  // Recovery slot in the port flank, lit from inside. Only port: a carrier lands
  // to port and launches forward, and the asymmetry is the tell.
  b.add('dark', throat({ width: 208, height: 56, depth: 46, detail: D }),
    { pos: [-90, -76, 20], rot: [0, -HALF_PI, 0] });
  b.glow([-83, -76, 20], 26, [0, -HALF_PI, 0]);

  // Blast door on the underside of the flight deck.
  b.add('plating', G.blastDoor({ width: 150, height: 118, depth: 7, seam: false, detail: D }),
    { pos: [0, -184, -18], rot: [HALF_PI, 0, 0] });

  // Control blister to port, overhanging the deck edge.
  b.add('hull', G.panelledSlab({ width: 44, height: 30, depth: 84, chamfer: 8, detail: D }),
    { pos: [-104, -46, 96] });
  b.add('glass', G.panelledSlab({ width: 6, height: 12, depth: 44, detail: D }), { pos: [-127, -46, 96] });

  // Structure carrying the deck up to the mount.
  b.graft([0, 0, 0], [HALF_PI, 0, 0], 48);
  if (full) {
    // Two hangers, not four. A symmetric 2x2 grid of identical posts is machine
    // rhythm; a forward-port and an aft-starboard pair is what a deck that was cut
    // out of somebody else's carrier actually ends up hanging from.
    for (const [x, dz] of [[-54, 130], [54, -140]]) {
      b.add('greeble', G.hexStrut({ length: 30, radius: 10, axis: 'y', detail: D }),
        { pos: [x, -34, dz] });
    }
    // Deck ribs visible under the overhang.
    b.add('greeble', G.hullRibs({
      count: 2, spacing: 150, span: 232, height: 12, thickness: 10, taper: 0.9, detail: D,
    }), { pos: [0, -148, -18] });
  }

  // Approach lighting. Both flanks, 20 m, the length of the deck.
  b.lightRun([-92, -128, -180], [-92, -128, 160], [-1, 0, 0], { max: 8 });
  b.lightRun([92, -128, -180], [92, -128, 160], [1, 0, 0], { max: 8 });

  return b.finish('ventral_hangar_deck');
}

registerModule({
  id: 'ventral_hangar_deck',
  // NOTE FOR THE HARDPOINT OWNER: this is tier 3, and hardpoints.js currently caps
  // the ventral mount at maxTier 2. Reported, not edited - see the stream report.
  name: 'Concord Hangar Deck',
  hardpoint: 'ventral',
  tier: 3,
  faction: 'concord',
  description: 'A full flight deck threaded through your salvage cradle: two launch throats, a '
    + 'port recovery slot, and 268 m of landing pad hanging below the keel. You stop being one '
    + 'ship the day you fit this.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 2400,
  build: buildHangarDeck,
  grants: { hangarBays: 2, powerOutput: -18, thrust: -0.10, turnRate: -0.12 },
  silhouetteTags: ['deck', 'slab-belly', 'wider-than-hull', 'launch-throats'],
});

// ---------------------------------------------------------------------------
// T1 — Derelict Salvage Tractor
// ---------------------------------------------------------------------------

/**
 * A yoke of three emitter horns hanging under the keel on splayed arms. It is the
 * cheapest way to change the ship's bottom line, and the horns pointing forward and
 * down say what the ship is for without a line of UI.
 */
function buildSalvageTractor(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.add('hull', G.pipeRun({ length: 46, radius: 48, sides: 6, axis: 'y', flanges: 0, detail: D }),
    { pos: [0, -46, 0] });
  b.graft([0, 0, 0], [HALF_PI, 0, 0], 42);

  // Three arms, splayed down and forward, none the same length.
  const arms = [
    { x: -62, z: 30, len: 116, tilt: 0.42 },
    { x: 58, z: 18, len: 96, tilt: 0.34 },
    { x: 2, z: 86, len: 132, tilt: 0.56 },
  ];
  for (const arm of arms) {
    const a = Math.atan2(arm.z, arm.x);
    const ca = Math.cos(a), sa = Math.sin(a);
    const dir = [ca * arm.tilt, -1, sa * arm.tilt];
    const k = arm.len / Math.hypot(ca * arm.tilt, 1, sa * arm.tilt);
    b.add('hull', aimed(
      G.hexStrut({ length: arm.len, radius: 11, radiusEnd: 8, axis: 'z', detail: D }),
      dir, [ca * 22, -52, sa * 22],
    ));
    const hx = ca * 22 + ca * arm.tilt * k, hy = -52 - k, hz = sa * 22 + sa * arm.tilt * k;
    // Emitter horn: a short bell flaring downward off the end of the arm.
    b.add('plating', aimed(
      G.hexStrut({ length: 36, radius: 13, radiusEnd: 22, axis: 'z', detail: D }),
      [0, -1, 0], [hx, hy, hz],
    ));
    b.glow([hx, hy - 40, hz], 20, [HALF_PI, 0, 0]);
  }

  if (full) {
    // Cable spools on the drum, at unrelated angles.
    for (const a of [0.8, 3.5]) {
      b.add('greeble', G.pipeRun({ length: 30, radius: 12, sides: 6, axis: 'x', flanges: 1, detail: D }),
        { pos: [Math.cos(a) * 44 - 15, -30, Math.sin(a) * 44] });
    }
  }

  b.lightRun([0, -22, 52], [0, -22, -52], [0, 0.4, 1], { max: 6 });

  return b.finish('ventral_salvage_tractor');
}

registerModule({
  id: 'ventral_salvage_tractor',
  name: 'Derelict Tractor Yoke',
  hardpoint: 'ventral',
  tier: 1,
  faction: 'derelict',
  description: 'Three emitter horns on a yoke that hangs under the keel. Pulls a hulk into the '
    + 'cradle at 1.8 km. The arms are different lengths and the field is stable anyway.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 320,
  build: buildSalvageTractor,
  weapon: {
    id: 'w_tractor_beam', name: 'Tractor Beam', type: 'mining',
    range: RANGE.salvageBeam, damage: 20, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 0.5, projectileSpeed: Infinity, tracking: 0.9, powerDraw: 12,
    yawWidth: Math.PI * 2, pitchWidth: Math.PI * 0.7, subsystemAccuracy: 0.05,
  },
  grants: { salvageRate: 0.85 },
  silhouetteTags: ['yoke', 'hanging-horns', 'below-keel', 'asymmetric'],
});

// ---------------------------------------------------------------------------
// T1 — Coalition Cargo Expansion
// ---------------------------------------------------------------------------

/**
 * Three pressure pods strapped into the cradle, one of them visibly not the same
 * model as the other two. Slung low enough to break the keel line, and long enough
 * to be read as cargo rather than as machinery.
 */
function buildCargoExpansion(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Cradle beam the pods hang off.
  b.add('hull', G.panelledSlab({ width: 168, height: 24, depth: 268, chamfer: 8, detail: D }),
    { pos: [0, -26, 0] });
  b.graft([0, 0, 0], [HALF_PI, 0, 0], 40);

  // Two matched cylindrical pods...
  for (const s of [-1, 1]) {
    b.add('plating', G.pipeRun({
      length: 244, radius: 38, sides: 6, axis: 'z', flanges: full ? 2 : 0, detail: D,
    }), { pos: [s * 46, -84, -122] });
  }
  // ...and one square container that came off something else entirely, hung lower
  // and shorter. This is the module's whole personality.
  b.add('hull', G.panelledSlab({ width: 78, height: 62, depth: 156, chamfer: 10, detail: D }),
    { pos: [-6, -148, 32] });

  if (full) {
    // Strapping.
    for (const dz of [-96, 8, 104]) {
      b.add('greeble', G.panelledSlab({ width: 178, height: 8, depth: 12, detail: D }), { pos: [0, -84, dz] });
    }
    b.add('greeble', G.hexStrut({ length: 62, radius: 7, axis: 'y', detail: D }), { pos: [-6, -150, 96] });
  }

  b.lightRun([0, -22, 128], [0, -22, -128], [0, 0.4, 1], { max: 8 });

  return b.finish('ventral_cargo_expansion');
}

registerModule({
  id: 'ventral_cargo_expansion',
  name: 'Coalition Cargo Pods',
  hardpoint: 'ventral',
  tier: 1,
  faction: 'coalition',
  description: 'Two pressure pods and a square container that came off something else. Six '
    + 'hundred tonnes of hold, and it hangs low enough that you will notice it when you dock.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 410,
  build: buildCargoExpansion,
  grants: { cargo: 600, thrust: -0.05 },
  silhouetteTags: ['pods', 'slung', 'below-keel', 'mismatched'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Repair Bay
// ---------------------------------------------------------------------------

/**
 * An open drydock cage under the keel: four legs, two longitudinal rails, three
 * articulated arms and a welding head. The point of contrast with the hangar deck
 * is that this one is OPEN - you can see through it - so the two never read the
 * same in silhouette even though they occupy the same volume.
 */
function buildRepairBay(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 42);
  b.add('hull', G.panelledSlab({ width: 120, height: 26, depth: 210, chamfer: 8, detail: D }),
    { pos: [0, -22, 0] });

  // Four legs down to the rails.
  const legs = full ? [[-72, -128], [72, -128], [-72, 116], [72, 116]] : [[-72, -128], [72, 116]];
  for (const [x, z] of legs) {
    b.add('hull', G.hexStrut({ length: 130, radius: 12, radiusEnd: 10, axis: 'y', detail: D }),
      { pos: [x, -152, z] });
  }
  // The rails: the working surface of the dock.
  for (const s of [-1, 1]) {
    b.add('plating', G.panelledSlab({ width: 30, height: 22, depth: 288, chamfer: 6, detail: D }),
      { pos: [s * 72, -164, -6] });
  }
  // Transverse yoke at the aft end only.
  b.add('plating', G.panelledSlab({ width: 172, height: 20, depth: 30, chamfer: 5, detail: D }),
    { pos: [0, -164, -136] });

  // Three arms. Two folded against a rail, one extended to port and working.
  if (full) {
    for (const dz of [-60, 40]) {
      b.add('greeble', G.hexStrut({ length: 74, radius: 7, axis: 'z', detail: D }), { pos: [58, -132, dz] });
    }
  }
  b.add('greeble', aimed(G.hexStrut({ length: 104, radius: 8, axis: 'z', detail: D }),
    [-1, -0.34, 0], [-64, -110, 60]));
  b.add('greeble', G.panelledSlab({ width: 28, height: 22, depth: 24, detail: D }), { pos: [-162, -144, 60] });
  b.glow([-162, -158, 60], 12, [HALF_PI, 0, 0]);

  // Fabricator drum on the starboard rail.
  b.add('greeble', G.pipeRun({ length: 88, radius: 22, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D }),
    { pos: [72, -196, -46] });

  b.lightRun([-72, -178, -130], [-72, -178, 120], [0, -1, 0], { max: 9 });

  return b.finish('ventral_repair_bay');
}

registerModule({
  id: 'ventral_repair_bay',
  name: 'Coalition Field Dock',
  hardpoint: 'ventral',
  tier: 2,
  faction: 'coalition',
  description: 'An open drydock cage: two rails, four legs, three arms and a fabricator drum. '
    + 'Repairs your hull between engagements, and you can watch it work.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 900,
  build: buildRepairBay,
  grants: { repairRate: 26, powerOutput: -8 },
  silhouetteTags: ['open-cage', 'drydock', 'below-keel', 'see-through'],
});

// ---------------------------------------------------------------------------
// T2 — Derelict Drone Bay
// ---------------------------------------------------------------------------

/**
 * A faceted drum hung under the keel with six launch tubes radiating from its rim
 * at odd angles. Not a hangar - it makes drones, and it is the cheap route into
 * fielding anything at all.
 */
function buildDroneBay(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 44);
  // Neck through the cradle, then the drum below it.
  b.add('hull', G.hexStrut({ length: 66, radius: 44, radiusEnd: 62, axis: 'y', detail: D }),
    { pos: [0, -66, 0], rot: [Math.PI, 0, 0] });
  b.add('hull', G.pipeRun({ length: 92, radius: 76, sides: 8, axis: 'y', flanges: 0, detail: D }),
    { pos: [0, -158, 0], rot: [0.05, 0, 0.04] });

  // Six tubes around the rim. Angles are uneven and two of them are longer.
  const tubes = full
    ? [[0.0, 68], [1.0, 92], [2.15, 68], [3.05, 68], [4.25, 96], [5.35, 68]]
    : [[0.0, 68], [2.15, 68], [4.25, 96]];
  for (const [a, len] of tubes) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const dir = [ca, -0.16, sa];
    const k = len / Math.hypot(ca, 0.42, sa);
    b.add('plating', aimed(
      G.hexStrut({ length: len, radius: 15, radiusEnd: 12, axis: 'z', caps: false, detail: D }),
      dir, [ca * 66, -112, sa * 66],
    ));
    b.glowDir([ca * (66 + k * 1.02), -112 - 0.16 * k * 1.02, sa * (66 + k * 1.02)], 13, dir);
  }

  if (full) {
    b.add('greeble', aimed(G.cappedConduit({ length: 42, radius: 9, axis: 'z', detail: D }),
      [0.34, -1, -0.2], [34, -22, -28]));
  }

  b.lightRun([0, -196, 62], [0, -196, -62], [0, -0.6, 1], { max: 6 });

  return b.finish('ventral_drone_bay');
}

registerModule({
  id: 'ventral_drone_bay',
  name: 'Derelict Drone Foundry',
  hardpoint: 'ventral',
  tier: 2,
  faction: 'derelict',
  description: 'A faceted drum with six launch tubes at angles that do not divide evenly into '
    + 'a circle. It builds its own drones out of whatever you feed it.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1050,
  build: buildDroneBay,
  grants: { hangarBays: 1, salvageRate: 0.15, powerOutput: -10 },
  silhouetteTags: ['drum', 'radial-tubes', 'below-keel', 'alien'],
});
