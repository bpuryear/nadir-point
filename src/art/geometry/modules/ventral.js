/**
 * VENTRAL MODULES — the salvage cradle, looking down. THE BIGGEST MOUNT ON THE SHIP.
 *
 * Mount is at [0, -78, 0] and the module HANGS. The cradle around it is a pair of
 * rails at x = +/-98..170 running down to a bay floor at y = -248, so the clear
 * volume directly under the mount is about 195 m wide until you get below y = -250,
 * at which point there is nothing but vacuum and you can be as wide and as deep as
 * you like.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY MODULE IN THIS FILE JUST GOT TWO TO THREE TIMES BIGGER
 * ---------------------------------------------------------------------------
 * The acceptance criterion "three loadouts of the same cruiser distinguishable in
 * silhouette" measures mean outline divergence per z-bin between two full builds,
 * and it was FAILING at 26.5 m against a target of 45 (docs/review/acceptance.md).
 * The diagnosis in that document is exact and it is worth restating because it is
 * the reason for every number below:
 *
 *   "Max now passes, so there ARE places on the outline where two builds differ
 *    decisively; what is missing is difference along most of the length."
 *
 * The hull's own bands are already as differentiated as one hull can be. The bow
 * mount changes four z-bins out of twenty-eight, the dorsal three, the engine two.
 * ONLY the ventral mount and the two sponsons can change the outline along most of
 * the ship, and of those the ventral is the one with unlimited room to grow into.
 * So the three ventral modules are now separated on THREE AXES AT ONCE, and the
 * separation is the design rather than a side effect of it:
 *
 * MEASURED off the built geometry in hull space, not intended:
 *
 *   | module      | deepest y | half-beam | z extent    | topology         |
 *   |-------------|-----------|-----------|-------------|------------------|
 *   | cargo pods  |  -356 m   |   293 m   | -425 .. 405 | slung solid mass |
 *   | hangar deck |  -540 m   |   217 m   | -320 .. 310 | closed slab      |
 *   | field dock  |  -487 m   |   441 m   | -490 .. 450 | open cage        |
 *
 * (The bare hull's own ventral envelope is y = -248, x = +/-198.) No two modules
 * share a rank on any of the three columns: the cargo pods are the shallowest and
 * the middle width, the hangar deck is the deepest and the narrowest, the field
 * dock is the widest and the longest. Read any one column and you have named the
 * build. A player who sees the bottom of the ship knows which of the three they
 * are looking at before they can resolve a single panel line, which is the entire
 * point of the criterion.
 *
 * The rule this file now enforces on itself, from ship-language.md §6 M1: A MODULE
 * THAT SITS INSIDE THE HULL ENVELOPE IS A FAILED MODULE. The hull's own ventral
 * envelope reaches y = -248 (bay floor) and x = +/-198 (drive pods), so anything
 * shallower than -250 or narrower than 200 is invisible in the outline and is
 * costing triangles to change nothing.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, throat, aimed } from './kit.js';

const HALF_PI = Math.PI * 0.5;

const oct = (hw, top, bot, cw, ct, cb) => G.octProfile(hw, top, bot, cw, ct, cb);

/**
 * The hull's own ventral envelope, in MODULE-LOCAL metres (the mount sits at world
 * y = -85 once the 7 m service gap is applied). Kept here as named numbers because
 * every module in this file is checked against them in review.
 */
const ENVELOPE = {
  keelY: -163,        // world -248, the salvage bay floor: the depth to beat
  halfBeam: 198,      // world x, the outrigger drive pods: the beam to beat
  cradleHalf: 175,    // clear half-width of the throat the module threads through
};

// ---------------------------------------------------------------------------
// T3 — Concord Hangar Deck        THE DEEP ONE
// ---------------------------------------------------------------------------

/**
 * THE HANGAR DECK. Installing this converts the game from a single-ship brawler
 * into a small RTS, so it has to be the most obvious change the player can make to
 * their ship, and it has to be obvious from four kilometres.
 *
 * It is the DEEP module. A three-level stack hanging straight down off the keel:
 * a narrow neck through the cradle, a 200 m deep hangar block, and a landing
 * platform under that, bottoming out at world y = -540. That is 292 m below the
 * salvage bay floor - the ship visibly grows a second body underneath itself.
 *
 * It is deliberately the NARROWEST of the three: 340 m across against the hull's
 * own 396 m beam over the drive pods. A carrier is a deep ship, not a wide one,
 * and keeping it narrow is what stops it colliding with the field dock's read.
 *
 * It is also the SHORTEST at 640 m, because a flight deck is a machine for one
 * job and it does not run the length of the ship the way cargo racking does.
 */
function buildHangarDeck(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // 1. The neck: threads down through the cradle throat, staying inside 175 m.
  b.add('hull', G.loft([
    { z: -300, points: oct(74, -16, -150, 20, 14, 18) },
    { z: -20, points: oct(96, -8, -168, 26, 16, 22) },
    { z: 290, points: oct(80, -14, -158, 22, 14, 20) },
  ], { capFront: true, capBack: true }), null);

  // 2. THE HANGAR BLOCK. 200 m of enclosed deck, hung clear of the keel. This is
  //    the mass; everything else on the module is a feature of it.
  b.add('hull', G.loft([
    { z: -320, points: oct(128, -172, -352, 34, 26, 30) },
    { z: -110, points: oct(170, -166, -368, 44, 30, 36) },
    { z: 160, points: oct(170, -166, -368, 44, 30, 36) },
    { z: 310, points: oct(120, -180, -344, 32, 24, 28) },
  ], { capFront: true, capBack: true }), null);

  // 3. The landing platform, below the block and stepped inboard of it: a
  //    ziggurat in reverse, which is what stops the stack reading as one prism.
  b.add('plating', G.panelledSlab({ width: 286, height: 46, depth: 540, chamfer: 26, detail: D }),
    { pos: [0, -432, -14] });
  b.add('plating', G.blastDoor({ width: 190, height: 300, depth: 9, seam: false, detail: D }),
    { pos: [0, -456, -14], rot: [HALF_PI, 0, 0] });

  // 4. Two launch throats in the forward face of the block, lined so they read as
  //    holes rather than as black stickers.
  for (const s of [-1, 1]) {
    b.add('dark', throat({ width: 74, height: 66, depth: 78, detail: D }), { pos: [s * 62, -258, 310] });
    b.glow([s * 62, -258, 300], 32);
  }
  // Recovery slot in the PORT flank, lit from inside. Only port: a carrier lands to
  // port and launches forward, and that asymmetry is the tell.
  b.add('dark', throat({ width: 300, height: 92, depth: 58, detail: D }),
    { pos: [-170, -262, 10], rot: [0, -HALF_PI, 0] });
  b.glow([-160, -262, 10], 38, [0, -HALF_PI, 0]);

  // 5. Control blister, overhanging the deck edge to port and well forward - the
  //    one thing on the module that is not on the centreline.
  b.add('hull', G.panelledSlab({ width: 62, height: 44, depth: 120, chamfer: 10, detail: D }),
    { pos: [-186, -204, 176] });

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 52);
  if (full) {
    // Two hangers, not four. A symmetric 2x2 grid of identical posts is machine
    // rhythm; a forward-port and an aft-starboard pair is what a deck cut out of
    // somebody else's carrier ends up hanging from.
    for (const [x, dz] of [[-78, 190], [78, -200]]) {
      b.add('greeble', G.hexStrut({ length: 60, radius: 14, axis: 'y', detail: D }),
        { pos: [x, -172, dz] });
    }
  }

  // Approach lighting, both flanks, at the game-wide spacing.
  b.lightRun([-176, -300, -260], [-176, -300, 220], [-1, 0, 0], { max: 9 });
  b.lightRun([176, -300, -260], [176, -300, 220], [1, 0, 0], { max: 9 });

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
  description: 'A full flight deck threaded through your salvage cradle and hung 450 m below the '
    + 'keel: two launch throats, a port recovery slot, and a landing platform under all of it. '
    + 'The ship grows a second body. You stop being one ship the day you fit this.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 2400,
  build: buildHangarDeck,
  grants: { hangarBays: 2, powerOutput: -18, thrust: -0.10, turnRate: -0.12 },
  silhouetteTags: ['deck', 'deep-belly', 'stacked', 'launch-throats', 'closed'],
});

// ---------------------------------------------------------------------------
// T1 — Derelict Salvage Tractor
// ---------------------------------------------------------------------------

/**
 * A yoke of three emitter horns hanging under the keel on splayed arms, and now on
 * arms long enough to matter: the deepest horn tip is 380 m under the keel and the
 * widest is 250 m off the centreline, so the module reads as a SPIDER rather than
 * as a bulge. Nothing about it is symmetrical, because nothing the derelicts built
 * is.
 */
function buildSalvageTractor(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.add('hull', G.pipeRun({ length: 88, radius: 62, sides: 6, axis: 'y', flanges: 0, detail: D }),
    { pos: [0, -88, 0] });
  b.graft([0, 0, 0], [HALF_PI, 0, 0], 44);

  // Three arms, splayed down and out, none the same length and none at a third of
  // a circle. Every tip clears the hull envelope by more than 100 m.
  const arms = [
    { x: -1, z: 0.26, len: 300, tilt: 0.86 },
    { x: 1, z: 0.14, len: 246, tilt: 0.70 },
    { x: 0.06, z: 1, len: 336, tilt: 0.52 },
  ];
  for (const arm of arms) {
    const a = Math.atan2(arm.z, arm.x);
    const ca = Math.cos(a), sa = Math.sin(a);
    const dir = [ca * arm.tilt, -1, sa * arm.tilt];
    const k = arm.len / Math.hypot(ca * arm.tilt, 1, sa * arm.tilt);
    b.add('hull', aimed(
      G.hexStrut({ length: arm.len, radius: 16, radiusEnd: 11, axis: 'z', detail: D }),
      dir, [ca * 34, -96, sa * 34],
    ));
    const hx = ca * 34 + ca * arm.tilt * k, hy = -96 - k, hz = sa * 34 + sa * arm.tilt * k;
    // Emitter horn: a short bell flaring downward off the end of the arm.
    b.add('plating', aimed(
      G.hexStrut({ length: 58, radius: 20, radiusEnd: 36, axis: 'z', detail: D }),
      [0, -1, 0], [hx, hy, hz],
    ));
    b.glow([hx, hy - 62, hz], 32, [HALF_PI, 0, 0]);
  }

  if (full) {
    // Cable spools on the drum, at unrelated angles.
    for (const a of [0.8, 3.5]) {
      b.add('greeble', G.pipeRun({ length: 44, radius: 18, sides: 6, axis: 'x', flanges: 1, detail: D }),
        { pos: [Math.cos(a) * 58 - 22, -56, Math.sin(a) * 58] });
    }
  }

  b.lightRun([0, -34, 76], [0, -34, -76], [0, 0.4, 1], { max: 6 });

  return b.finish('ventral_salvage_tractor');
}

registerModule({
  id: 'ventral_salvage_tractor',
  name: 'Derelict Tractor Yoke',
  hardpoint: 'ventral',
  tier: 1,
  faction: 'derelict',
  description: 'Three emitter horns on arms that reach 300 m off the keel in three directions '
    + 'that do not divide a circle. Pulls a hulk into the cradle at 1.8 km. The arms are '
    + 'different lengths and the field is stable anyway.',
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
  silhouetteTags: ['yoke', 'hanging-horns', 'splayed', 'asymmetric', 'open'],
});

// ---------------------------------------------------------------------------
// T1 — Coalition Cargo Expansion       THE WIDE, SHALLOW, LONG ONE
// ---------------------------------------------------------------------------

/**
 * Cargo racking, and it runs 850 m of the ship's 1400.
 *
 * This is the SHALLOW module and it earns its place in the outline by being WIDE
 * and LONG instead: two 620 m pressure pods slung on transverse yokes at x = +/-208,
 * which is ten metres outboard of the hull's own widest point, plus one square
 * container that is visibly not the same model as the pods, hung lower and off the
 * centreline.
 *
 * Against the hangar deck it is the opposite reading in every dimension: broad and
 * flat where that is deep and narrow, and open underneath where that is a slab.
 * Against the field dock it is solid mass where that is a cage.
 */
function buildCargoExpansion(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Keel spine the whole rack hangs off. Long, so the module reads as one object.
  b.add('hull', G.panelledSlab({ width: 132, height: 34, depth: 830, chamfer: 10, detail: D }),
    { pos: [0, -46, -10] });
  b.graft([0, 0, 0], [HALF_PI, 0, 0], 42);

  // Two transverse yokes carrying the pods outboard. Unequal spacing: a load path
  // is where the load is, not where a drawing looked tidy.
  for (const [dz, w] of [[-296, 452], [232, 418]]) {
    b.add('hull', G.panelledSlab({ width: w, height: 30, depth: 74, chamfer: 8, detail: D }),
      { pos: [0, -128, dz] });
  }

  // Two 620 m pressure pods, outboard of the hull's own beam.
  for (const s of [-1, 1]) {
    b.add('plating', G.pipeRun({
      length: 620, radius: 68, sides: 6, axis: 'z', flanges: full ? 2 : 0, detail: D,
    }), { pos: [s * 208, -172, -320] });
  }

  // ...and one square container that came off something else entirely, hung lower
  // and further forward than either pod. This is the module's whole personality:
  // it is the only part of the rack that breaks the -300 m line.
  b.add('hull', G.panelledSlab({ width: 148, height: 108, depth: 330, chamfer: 12, detail: D }),
    { pos: [-16, -216, 96] });

  if (full) {
    // Strapping over the pods, at three unequal stations.
    for (const dz of [-232, 24, 268] ) {
      b.add('greeble', G.panelledSlab({ width: 500, height: 12, depth: 18, detail: D }),
        { pos: [0, -170, dz] });
    }
    b.add('greeble', G.hexStrut({ length: 96, radius: 11, axis: 'y', detail: D }), { pos: [-16, -166, 236] });
  }

  b.lightRun([0, -30, 380], [0, -30, -380], [0, 0.4, 1], { max: 10 });

  return b.finish('ventral_cargo_expansion');
}

registerModule({
  id: 'ventral_cargo_expansion',
  name: 'Coalition Cargo Pods',
  hardpoint: 'ventral',
  tier: 1,
  faction: 'coalition',
  description: 'Two 620 m pressure pods on transverse yokes wider than your own hull, and one '
    + 'square container that came off something else. Two thousand tonnes of hold, slung along '
    + 'most of the keel, and you will notice all of it when you dock.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 410,
  build: buildCargoExpansion,
  grants: { cargo: 600, thrust: -0.05 },
  silhouetteTags: ['pods', 'slung', 'wide-yoke', 'mismatched', 'shallow'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Repair Bay        THE WIDEST AND LONGEST ONE
// ---------------------------------------------------------------------------

/**
 * An open drydock cage under the keel, sized to take a frigate broadside-on: two
 * 940 m rails at x = +/-268, three portal frames spanning 570 m across, four legs,
 * three articulated arms and a fabricator drum.
 *
 * The point of contrast with the hangar deck is that this one is OPEN. You can see
 * stars through it from every angle, so the two never read the same even though
 * both are "a big thing under the ship" - one is a solid body, one is a skeleton.
 * The point of contrast with the cargo pods is that this one is a FRAME with mass
 * only at its edges, and it is 200 m wider and 90 m deeper than they are.
 */
function buildRepairBay(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 44);
  // Spine the cage hangs from, threaded through the cradle throat.
  b.add('hull', G.panelledSlab({ width: 138, height: 34, depth: 760, chamfer: 10, detail: D }),
    { pos: [0, -40, -20] });

  // THE THREE PORTAL FRAMES. Each is a transverse beam on two down-legs, and the
  // gaps between them are the module: this is the only thing on the ship you can
  // see the gas giant through in plan view.
  const portals = [-372, -20, 352];
  for (let i = 0; i < portals.length; i++) {
    const z = portals[i];
    const w = i === 1 ? 570 : 508;
    // Square-cornered: this is Coalition dock structure, and three chamfered
    // beams is forty-eight triangles spent on an edge nobody reads at 3 km.
    b.add('plating', G.panelledSlab({ width: w, height: 34, depth: 56, detail: D }),
      { pos: [0, -212, z] });
    for (const s of [-1, 1]) {
      // Uncapped: the leg meets the beam above it and the rail below it, so both
      // ends are buried. Twelve triangles instead of twenty, six times over.
      b.add('hull', G.hexStrut({
        length: 190, radius: 17, radiusEnd: 13, axis: 'y', caps: false, detail: D,
      }), { pos: [s * (w * 0.5 - 24), -212, z] });
    }
  }

  // The two working rails: 940 m fore and aft, well outboard of the hull's beam.
  for (const s of [-1, 1]) {
    b.add('plating', G.panelledSlab({ width: 52, height: 40, depth: 940, chamfer: 10, detail: D }),
      { pos: [s * 244, -278, -20] });
  }

  // Three arms. Two folded against the starboard rail, one extended to port and
  // working - the module's asymmetry, and the reason it reads as busy machinery
  // rather than as a bridge truss.
  if (full) {
    b.add('greeble', G.hexStrut({ length: 150, radius: 11, axis: 'z', detail: D }), { pos: [204, -232, -150] });
  }
  b.add('greeble', aimed(G.hexStrut({ length: 210, radius: 13, axis: 'z', detail: D }),
    [-1, -0.36, 0], [-220, -196, 150]));
  b.add('greeble', G.panelledSlab({ width: 46, height: 36, depth: 40, detail: D }), { pos: [-418, -264, 150] });
  b.glow([-418, -286, 150], 20, [HALF_PI, 0, 0]);

  // Fabricator drum on the starboard rail: the deepest single point on the module.
  b.add('greeble', G.pipeRun({ length: 168, radius: 40, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D }),
    { pos: [244, -344, -140] });

  b.lightRun([-244, -302, -400], [-244, -302, 380], [0, -1, 0], { max: 11 });

  return b.finish('ventral_repair_bay');
}

registerModule({
  id: 'ventral_repair_bay',
  name: 'Coalition Field Dock',
  hardpoint: 'ventral',
  tier: 2,
  faction: 'coalition',
  description: 'An open drydock cage 940 m long and 570 m across: three portal frames, two '
    + 'working rails, three arms and a fabricator drum. Big enough to take a frigate '
    + 'broadside-on, and you can watch it work through the gaps.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 900,
  build: buildRepairBay,
  grants: { repairRate: 26, powerOutput: -8 },
  silhouetteTags: ['open-cage', 'portal-frames', 'widest', 'see-through', 'longest'],
});

// ---------------------------------------------------------------------------
// T2 — Derelict Drone Bay
// ---------------------------------------------------------------------------

/**
 * A faceted drum hung well under the keel with six launch tubes radiating from its
 * rim at odd angles. Not a hangar - it makes drones, and it is the cheap route into
 * fielding anything at all. It reads as a SEA MINE, which nothing else in the
 * library does.
 */
function buildDroneBay(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 46);
  // Neck through the cradle, then the drum a long way below it.
  b.add('hull', G.hexStrut({ length: 128, radius: 56, radiusEnd: 86, axis: 'y', detail: D }),
    { pos: [0, -128, 0], rot: [Math.PI, 0, 0] });
  b.add('hull', G.pipeRun({ length: 156, radius: 118, sides: 8, axis: 'y', flanges: 0, detail: D }),
    { pos: [0, -286, 0], rot: [0.05, 0, 0.04] });

  // Six tubes around the rim. Angles are uneven and two of them are longer.
  const tubes = full
    ? [[0.0, 120], [1.0, 164], [2.15, 120], [3.05, 120], [4.25, 170], [5.35, 120]]
    : [[0.0, 120], [2.15, 120], [4.25, 170]];
  for (const [a, len] of tubes) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const dir = [ca, -0.16, sa];
    const k = len / Math.hypot(ca, 0.42, sa);
    b.add('plating', aimed(
      G.hexStrut({ length: len, radius: 22, radiusEnd: 17, axis: 'z', caps: false, detail: D }),
      dir, [ca * 104, -204, sa * 104],
    ));
    b.glowDir([ca * (104 + k * 1.02), -204 - 0.16 * k * 1.02, sa * (104 + k * 1.02)], 19, dir);
  }

  if (full) {
    b.add('greeble', aimed(G.cappedConduit({ length: 62, radius: 13, axis: 'z', detail: D }),
      [0.34, -1, -0.2], [50, -48, -44]));
  }

  b.lightRun([0, -352, 96], [0, -352, -96], [0, -0.6, 1], { max: 6 });

  return b.finish('ventral_drone_bay');
}

registerModule({
  id: 'ventral_drone_bay',
  name: 'Derelict Drone Foundry',
  hardpoint: 'ventral',
  tier: 2,
  faction: 'derelict',
  description: 'A 236 m faceted drum slung under your keel with six launch tubes at angles that '
    + 'do not divide evenly into a circle. It builds its own drones out of whatever you feed it.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1050,
  build: buildDroneBay,
  grants: { hangarBays: 1, salvageRate: 0.15, powerOutput: -10 },
  silhouetteTags: ['drum', 'radial-tubes', 'mine', 'alien'],
});

export { ENVELOPE };
