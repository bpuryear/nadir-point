/**
 * BOW MODULES — the forward bed, on the foredeck ahead of the armour spine.
 *
 * Mount is at [0, 100, 420] in hull space and the ship's stem is at z = 700, so
 * LOCAL z = 280 IS THE END OF THE SHIP. Anything a bow module wants to be seen
 * doing has to happen forward of that, which is why every one of these grows a
 * long way down +Z. A bow module that stops at local z = 150 is invisible: it is
 * hiding inside the foredeck the hull already has.
 *
 * The bow is also the one mount where the arc is narrow on purpose (100 degrees,
 * see hardpoints.js#ARC_RATIONALE) — bow weapons are aimed by turning 1.4 km of
 * ship. That is a design statement, so the geometry says it too: these read as
 * SPINAL. Long, axial, braced back into the hull.
 *
 * ---------------------------------------------------------------------------
 * THE PROW / TORPEDO PAIR, which was a named acceptance failure
 * ---------------------------------------------------------------------------
 * docs/review/acceptance.md: "bow_torpedo_tubes vs bow_breaching_prow separate only
 * by a 17 degree droop." Both were a big Coalition block with things sticking
 * forward out of it, and a droop angle is not a silhouette difference - at any
 * distance where the bow is forty pixels wide, seventeen degrees is two pixels.
 *
 * They are now separated by SIGN and by TOPOLOGY, which are the two things that
 * survive to a thirty-pixel read:
 *
 *   breaching prow    ALL of its mass is BELOW the mount plane. Nothing on it goes
 *                     above local y = +40. It is one solid wedge driving down and
 *                     forward to a tip 300 m under the foredeck.
 *   torpedo battery   ALL of its mass is ABOVE the mount plane, and it is a STACK:
 *                     four tubes on four separate steps climbing 300 m, carried on
 *                     an OPEN lattice you can see through between the steps.
 *
 * One is a solid beak pointing at the floor; the other is an open staircase
 * pointing at the ceiling. There is no angle from which those are the same object.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, barrel, throat, aimed, muzzleAlong } from './kit.js';

const HALF_PI = Math.PI * 0.5;

/** The lance's aperture, at the far end of the flared muzzle. */
const LANCE_MUZZLE = [0, 58, 545];

// ---------------------------------------------------------------------------
// T3 — Concord Siege Lance
// ---------------------------------------------------------------------------

/**
 * A spinal particle lance off a Concord line cruiser: a 440 m accelerator tube on
 * an A-frame cradle, two capacitor pods flanking the breech, focus rings along the
 * run. The read is a NEEDLE — nothing else on the ship is thin and 440 m long, so
 * this loadout is identifiable from any angle at any distance, and the muzzle
 * stands 250 m clear of the stem.
 */
function buildSiegeLance(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // Breech block, sat over the pad and reaching back onto the foredeck.
  b.add('hull', G.panelledSlab({ width: 118, height: 92, depth: 190, chamfer: 26, detail: D }),
    { pos: [0, 34, -30] });
  b.graft([0, -6, -30], [-HALF_PI, 0, 0], 44);

  // The tube. One long hex run; the whole module is really this shape.
  b.add('plating', G.hexStrut({ length: 440, radius: 21, axis: 'z', detail: D }),
    { pos: [0, 58, 60] });
  // Flared muzzle and the aperture itself.
  b.add('greeble', G.hexStrut({ length: 40, radius: 32, radiusEnd: 25, axis: 'z', detail: D }),
    { pos: [0, 58, 500] });
  b.glow(LANCE_MUZZLE, 22);

  // Focus rings. Two, not five: they are a rhythm along the tube, not a texture.
  const rings = full ? [200, 370] : [280];
  for (const z of rings) {
    b.add('greeble', G.dockingCollar({ radius: 38, innerRadius: 24, depth: 13, sides: 6, detail: D }),
      { pos: [0, 58, z] });
  }

  // Capacitor pods. Concord builds them as clean tapered fairings, and the port
  // one is longer because the starboard bank was cannibalised for the reactor.
  b.add('hull', G.taperedWedge({
    length: 236, width0: 44, height0: 62, width1: 24, height1: 32, chamfer: 8, detail: D,
  }), { pos: [-60, 40, 26] });
  b.add('hull', G.taperedWedge({
    length: 168, width0: 44, height0: 62, width1: 24, height1: 32, chamfer: 8, detail: D,
  }), { pos: [60, 40, 26] });

  // The cradle: an A-frame carrying the tube where it leaves the breech.
  if (full) {
    for (const s of [-1, 1]) {
      b.add('greeble', G.hexStrut({ length: 74, radius: 9, axis: 'y', detail: D }),
        { pos: [s * 38, -12, 280], rot: [0, 0, -s * 0.42] });
    }
    b.add('greeble', G.panelledSlab({ width: 96, height: 12, depth: 28, detail: D }), { pos: [0, 50, 280] });
  }

  // Running lights: along the top of the tube. This is the ONE cue that tells you
  // the lance is 440 m and not 44.
  b.lightRun([0, 80, 80], [0, 80, 480], [0, 1, 0], { max: 12 });

  return b.finish('bow_siege_lance');
}

registerModule({
  id: 'bow_siege_lance',
  name: 'Concord Siege Lance',
  hardpoint: 'bow',
  tier: 3,
  faction: 'concord',
  description: 'A spinal particle lance cut from a Concord line cruiser, cradled on an A-frame '
    + 'that reaches 250 m past your own stem. It fires where the ship is pointed and nowhere else.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1180,
  build: buildSiegeLance,
  // One shot, one aperture, 545 m forward of the mount and therefore 250 m past the
  // ship's own stem. The CHARGE archetype anchors its pre-fire VFX and audio here.
  muzzles: [LANCE_MUZZLE],
  weapon: {
    id: 'w_siege_lance', name: 'Siege Lance', type: 'lance',
    range: RANGE.lance, damage: 2600, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 11.0, projectileSpeed: Infinity, tracking: 0.05, powerDraw: 42,
    yawWidth: Math.PI * 0.10, pitchWidth: Math.PI * 0.05, subsystemAccuracy: 0.72,
  },
  silhouetteTags: ['spinal', 'needle', 'axial', 'forward-reach'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Breaching Prow        EVERYTHING BELOW THE MOUNT PLANE
// ---------------------------------------------------------------------------

/**
 * A boarding ram, and the rule this module now obeys is a single line: NOTHING ON
 * IT GOES ABOVE LOCAL y = +40. It is one solid armoured wedge driving down and
 * forward, cutting teeth on its leading edge, harpoon tubes slung underneath, and
 * a winch drum to port. The tip finishes 300 m below the foredeck and 60 m past
 * the stem, so from the beam the bow of the ship visibly points at the floor.
 *
 * Against the torpedo battery - which is the other Coalition bow module and which
 * now puts everything ABOVE the mount plane on an open lattice - this is a solid
 * shape with an opposite sign. See the file header.
 */

/** Twin harpoon tubes slung under the ram root, angled down and out. */
const HARPOON_SIDES = [-1, 1];
const HARPOON_LEN = 156;
const harpoonAim = (s) => [s * 0.16, -0.34, 1];
const harpoonRoot = (s) => [s * 64, -54, 20];

function buildBreachingProw(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Backing block bolted to the pad, and it sits LOW: the whole module hangs.
  b.add('hull', G.panelledSlab({ width: 132, height: 66, depth: 118, chamfer: 18, detail: D }),
    { pos: [0, -18, -26] });

  // The ram: a long wedge tipped steeply nose-down. 0.58 rad over 330 m puts the
  // tip 300 m below the mount plane and 60 m past the stem.
  b.add('plating', G.taperedWedge({
    length: 330, width0: 148, height0: 88, width1: 40, height1: 22, shear: -16, chamfer: 10, detail: D,
  }), { pos: [0, -26, 10], rot: [0.58, 0, 0] });
  // A second, shorter wedge under the first, offset to starboard: the ram is a
  // re-welded assembly, not a casting, and the step between the two is a hard edge
  // that catches the key all the way down the droop.
  b.add('hull', G.taperedWedge({
    length: 210, width0: 96, height0: 46, width1: 30, height1: 16, shear: -8, chamfer: 8, detail: D,
  }), { pos: [16, -74, 30], rot: [0.66, 0, 0] });

  // Teeth down the leading edge. Three, uneven — a cutter that has been re-welded.
  //
  // THEY ARE SPREAD IN Z, NOT ACROSS THE TIP. All three used to sit at the ram's
  // forwardmost station (z = 288) at x = -38, +6 and +40, and the ram at that
  // station is 40 m across: the two outboard teeth stood clear of the wedge they
  // were welded to and read in plan as a pair of 34 m splinters floating ahead of
  // the bow (`tools/silhouette.mjs`, top view).
  //
  // The wedge's half-beam falls from 74 m at its root to 20 m at the tip, so each
  // tooth is now placed at a station where the wedge is still wider than the tooth
  // is, and its y follows the 0.58 rad droop. A saw edge running back up the ram is
  // also the better read: teeth clustered at a point are a drill, teeth down an edge
  // are a cutter, and this ship cuts.
  if (full) {
    // NONE OF THEM REACHES THE TIP. The forward tooth used to sit at z = 286, i.e.
    // at the ram's own forwardmost station, and a 62 m wedge starting there ends up
    // 52 m PAST the thing it is welded to - in profile a detached splinter ahead of
    // the bow. (The previous rasteriser welded it by stamping an edge-on facet's
    // bounding box; tools/silhouette.mjs no longer does that, and this is one of
    // three real detachments the honest version found on its first run.)
    const teeth = [[-34, 140], [14, 200], [-8, 252]];
    for (const [x, z] of teeth) {
      const t = (z - 10) / 275.6;                    // fraction along the ram
      b.add('greeble', G.taperedWedge({
        length: 62, width0: 26, height0: 26, width1: 5, height1: 6, detail: D,
      }), { pos: [x, -26 - t * 180.4 - 22, z], rot: [0.58, 0, 0] });
    }
  }

  // Harpoon tubes, slung UNDER the ram root and angled down and out. On the old
  // version these sat above the block and were the one part that read the same as
  // the torpedo battery's tubes.
  for (const s of HARPOON_SIDES) {
    b.add('greeble', aimed(barrel({ length: HARPOON_LEN, radius: 14, brake: false, detail: D }),
      harpoonAim(s), harpoonRoot(s)));
  }
  // Winch drum: to port only, and below the deck line. Somebody bolted it where
  // there was room.
  b.add('greeble', G.pipeRun({ length: 78, radius: 27, sides: 6, axis: 'x', flanges: full ? 1 : 0, detail: D }),
    { pos: [-98, -6, -36] });

  // Flank armour on the ram root.
  if (full) {
    for (const s of [-1, 1]) {
      b.add('plating', G.armourBelt({
        length: 156, height: 46, thickness: 12, plates: 2, gap: 18, chamfer: 8, detail: D,
      }), { pos: [s * 72, -62, 80] });
    }
  }

  b.graft([0, -48, -26], [-HALF_PI, 0, 0], 42);

  // Lights down the ram's upper spine, following the droop.
  b.lightRun([0, 6, 40], [0, -152, 250], [0, 1, 0], { max: 8 });

  return b.finish('bow_breaching_prow');
}

registerModule({
  id: 'bow_breaching_prow',
  name: 'Coalition Breaching Prow',
  hardpoint: 'bow',
  tier: 2,
  faction: 'coalition',
  description: 'An armoured ram that drives 300 m below your foredeck, with twin harpoon tubes '
    + 'slung under it. Reels a target in close, then opens it. The teeth were re-welded by '
    + 'somebody in a hurry.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 860,
  build: buildBreachingProw,
  // Two harpoons, two tubes, port tube first. Both sit 104 m BELOW the mount plane,
  // which is the whole point of this module against the torpedo battery's stack.
  muzzles: HARPOON_SIDES.map((s) => muzzleAlong(harpoonRoot(s), harpoonAim(s), HARPOON_LEN)),
  weapon: {
    id: 'w_harpoon_tubes', name: 'Harpoon Tubes', type: 'missile',
    range: 1800, damage: 420, shotsPerBurst: 2, burstInterval: 0.7,
    cooldown: 6.5, projectileSpeed: 340, tracking: 0.16, powerDraw: 10,
    yawWidth: Math.PI * 0.36, pitchWidth: Math.PI * 0.16, subsystemAccuracy: 0.30,
  },
  grants: { salvageRate: 0.20 },
  silhouetteTags: ['beak', 'below-plane', 'solid', 'toothed'],
});

// ---------------------------------------------------------------------------
// T1 — Derelict Mining Laser Array
// ---------------------------------------------------------------------------

/**
 * Three cutting heads on splayed arms off an ancient mining tender. Nothing about
 * the spread is symmetrical, because nothing the derelicts built is. Cheap, T1,
 * and still unmistakable at distance: a forward-facing CLAW that is 300 m across
 * and open in the middle, so the bow of the ship acquires a hole in it.
 */

/** Three arms at 20, 128 and 235 degrees around the axis - deliberately not thirds. */
const MINING_ARMS = [
  { a: 0.35, len: 320, r: 96 },
  { a: 2.24, len: 244, r: 84 },
  { a: 4.10, len: 282, r: 88 },
];
const MINING_SPLAY = 0.52;
const MINING_HUB_Y = 18;

/**
 * Everything about one arm derived from its three authored numbers: where it is
 * struck from, where it points, where its head lands, and where the cutting
 * aperture ends up. The build loop and the muzzle declaration both read this, so
 * moving an arm moves its muzzle and neither can be forgotten.
 */
function miningArm(arm) {
  const ca = Math.cos(arm.a), sa = Math.sin(arm.a);
  const root = [ca * arm.r, MINING_HUB_Y + sa * arm.r, 0];
  const dir = [ca * MINING_SPLAY, sa * MINING_SPLAY, 1];
  const k = arm.len / Math.hypot(dir[0], dir[1], dir[2]);
  const head = [root[0] + dir[0] * k, root[1] + dir[1] * k, k];
  return { ca, sa, root, dir, head, aperture: [head[0] + ca * 13, head[1] + sa * 13, head[2] + 52] };
}

function buildMiningArray(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  // Backplate: a six-sided drum rather than a box. Not a human shape.
  b.add('hull', G.pipeRun({ length: 76, radius: 62, sides: 6, axis: 'z', flanges: 0, detail: D }),
    { pos: [0, 18, -44] });
  b.graft([0, -6, -18], [-HALF_PI, 0, 0], 40);

  for (const arm of MINING_ARMS) {
    const { root, dir, head, aperture } = miningArm(arm);
    b.add('greeble', aimed(
      G.hexStrut({ length: arm.len, radius: 12, radiusEnd: 8, axis: 'z', detail: D }), dir, root,
    ));
    // Emitter head: a short flared cone on the end of the arm, aperture glowing.
    b.add('hull', aimed(
      G.hexStrut({ length: 48, radius: 22, radiusEnd: 16, axis: 'z', detail: D }), dir, head,
    ));
    b.glow(aperture, 17);
  }

  // Coolant vanes on the drum, three of them, canted.
  if (full) {
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1;
      b.add('plating', G.radiatorFin({
        chord: 76, span: 96, thickness: 6, sweep: -26, tipChord: 48, rim: 8, detail: D,
      }), { pos: [Math.cos(a) * 42, 18 + Math.sin(a) * 42, -48], rot: [0, 0, a - HALF_PI] });
    }
  }

  b.lightRun([0, 86, -28], [0, 86, 140], [0, 1, 0], { max: 7 });

  return b.finish('bow_mining_array');
}

registerModule({
  id: 'bow_mining_array',
  name: 'Ancient Cutting Array',
  hardpoint: 'bow',
  tier: 1,
  faction: 'derelict',
  description: 'Three cutting heads on 300 m splayed arms, pulled off a derelict mining tender. '
    + 'The arms are not evenly spaced and nobody has ever worked out why.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 310,
  build: buildMiningArray,
  // THREE apertures are drawn; ONE fires, because `shotsPerBurst` is 1 and the
  // muzzle list must match it. The firing head is the longest arm (320 m, the one
  // that reaches furthest forward); the other two stay decorative glows. If the
  // cutting beam ever becomes a three-shot weapon this becomes `MINING_ARMS.map`.
  muzzles: [miningArm(MINING_ARMS[0]).aperture],
  weapon: {
    id: 'w_cutting_array', name: 'Cutting Array', type: 'mining',
    range: RANGE.salvageBeam, damage: 90, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 0.5, projectileSpeed: Infinity, tracking: 0.22, powerDraw: 14,
    yawWidth: Math.PI * 0.42, pitchWidth: Math.PI * 0.30, subsystemAccuracy: 0.55,
  },
  grants: { salvageRate: 0.45 },
  silhouetteTags: ['claw', 'splayed', 'open-centre', 'asymmetric'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Torpedo Tubes        EVERYTHING ABOVE THE MOUNT PLANE
// ---------------------------------------------------------------------------

/**
 * Four heavy tubes on FOUR SEPARATE STEPS climbing 300 m above the foredeck, each
 * one further forward than the last, carried on an open lattice of hex struts with
 * sky between the steps.
 *
 * The rule, and it is the counterpart of the breaching prow's: NOTHING ON THIS
 * MODULE GOES BELOW LOCAL y = -20. A staircase, open, going up; a beak, solid,
 * going down. The old pair were both "a block with tubes in it" and separated only
 * by a droop angle, which is the acceptance-criteria failure this closes.
 *
 * The reload magazine is strapped along the starboard flank of the lowest step,
 * because there was nowhere else to put it.
 */

/**
 * THE FOUR STEPS. Each is 78 m higher and 46 m further forward than the one below.
 * `y` is the platform, the tube sits 26 m above it, and `len` is how far the tube
 * runs forward from `z` — so the tube mouth, and the muzzle, is at `z + len`.
 */
const TORPEDO_STEPS = [
  { y: 34, z: 96, w: 132, len: 150, r: 30 },
  { y: 112, z: 142, w: 112, len: 138, r: 27 },
  { y: 190, z: 188, w: 94, len: 126, r: 24 },
  { y: 268, z: 234, w: 78, len: 114, r: 21 },
];
/** Steps alternate 8 m either side of the centreline so the stack reads as built. */
const torpedoX = (i) => (i % 2 ? 8 : -8);
const torpedoMuzzle = (s, i) => [torpedoX(i), s.y + 26, s.z + s.len];

function buildTorpedoTubes(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  b.graft([0, -14, 10], [-HALF_PI, 0, 0], 44);

  // The lattice between the steps is open; see TORPEDO_STEPS above the function.
  for (let i = 0; i < TORPEDO_STEPS.length; i++) {
    const s = TORPEDO_STEPS[i];
    const x = torpedoX(i);
    // Platform. Square-cornered on purpose: this is the rectilinear navy, and a
    // chamfer on four platforms is sixty-four triangles for an edge nobody reads.
    b.add('hull', G.panelledSlab({ width: s.w, height: 34, depth: 92, detail: D }),
      { pos: [x, s.y, s.z - 40] });
    // Tube, open at the muzzle.
    b.add('plating', G.hexStrut({ length: s.len, radius: s.r, axis: 'z', caps: false, detail: D }),
      { pos: [x, s.y + 26, s.z] });
    b.add('dark', throat({ width: s.r * 1.5, height: s.r * 1.5, depth: s.r * 2.2, detail: D }),
      { pos: torpedoMuzzle(s, i) });
  }

  // THE LATTICE. Two raked legs a side carrying the stack, with the four bays
  // between them open to the sky. This is what makes the module read as a tower
  // rather than as a slab with holes drawn on it.
  for (const s of [-1, 1]) {
    b.add('greeble', aimed(G.hexStrut({
      length: 330, radius: 13, radiusEnd: 9, axis: 'z', caps: false, detail: D,
    }), [s * 0.10, 1, 0.46], [s * 52, -10, 40]));
  }
  // Hoist rail up the back of the stack: the tallest single line on the module.
  b.add('greeble', aimed(G.hexStrut({ length: 340, radius: 11, axis: 'z', detail: D }),
    [0, 1, 0.12], [0, 6, 8]));
  b.add('hull', G.panelledSlab({ width: 64, height: 46, depth: 58, chamfer: 10, detail: D }),
    { pos: [0, 316, 60] });

  // Magazine drum: starboard flank of the lowest step only.
  b.add('greeble', G.pipeRun({ length: 210, radius: 32, sides: 6, axis: 'z', flanges: full ? 2 : 0, detail: D }),
    { pos: [96, 22, -50] });

  // Lights up the port leg — the side with no magazine on it.
  b.lightRun([-58, 10, 40], [-58, 280, 190], [-0.5, 0.86, 0], { max: 9 });

  return b.finish('bow_torpedo_tubes');
}

registerModule({
  id: 'bow_torpedo_tubes',
  name: 'Coalition Torpedo Battery',
  hardpoint: 'bow',
  tier: 2,
  faction: 'coalition',
  description: 'Four 12 km torpedo tubes on four stepped platforms climbing 300 m above your '
    + 'foredeck, carried on an open lattice, with the reload magazine strapped to the starboard '
    + 'flank because there was nowhere else for it to go.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 940,
  build: buildTorpedoTubes,
  // Four tubes, four torpedoes, lowest step first. The four muzzles climb 234 m in
  // y and 102 m in z, so a full salvo walks visibly UP the staircase — the only
  // module in the library whose burst has a vertical read.
  muzzles: TORPEDO_STEPS.map(torpedoMuzzle),
  weapon: {
    id: 'w_bow_torpedoes', name: 'Heavy Torpedoes', type: 'missile',
    range: RANGE.missile, damage: 1150, shotsPerBurst: 4, burstInterval: 0.9,
    cooldown: 14.0, projectileSpeed: 260, tracking: 0.10, powerDraw: 18,
    yawWidth: Math.PI * 0.5, pitchWidth: Math.PI * 0.22, subsystemAccuracy: 0.25,
  },
  silhouetteTags: ['staircase', 'above-plane', 'open-lattice', 'stacked'],
});

// ---------------------------------------------------------------------------
// T1 — Concord Prow Sensor Spike
// ---------------------------------------------------------------------------

/**
 * A 330 m interferometry boom on a cruciform of fins. It is the cheapest module in
 * the library and one of the most legible, because a bare needle in front of a
 * 1.4 km hull is a shape no other module produces.
 */
function buildProwSpike(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.panelledSlab({ width: 92, height: 52, depth: 92, chamfer: 14, detail: D }),
    { pos: [0, 16, -8] });
  b.graft([0, -10, -8], [-HALF_PI, 0, 0], 38);

  // The boom.
  b.add('greeble', G.hexStrut({ length: 336, radius: 10, radiusEnd: 2.6, axis: 'z', detail: D }),
    { pos: [0, 36, 30] });

  // Cruciform stabiliser fins at the root — four blades, so the spike reads as a
  // deliberate instrument rather than as a stray pole.
  for (let i = 0; i < 4; i++) {
    const a = i * HALF_PI + 0.4;
    b.add('plating', G.radiatorFin({
      chord: 78, span: 82, thickness: 5, sweep: -34, tipChord: 34, rim: 7, detail: D,
    }), { pos: [Math.cos(a) * 11, 36 + Math.sin(a) * 11, 44], rot: [0, 0, a - HALF_PI] });
  }

  // Two collars up the boom, and a small forward-looking dish at 40%.
  if (full) {
    for (const z of [150, 260]) {
      b.add('greeble', G.dockingCollar({ radius: 18, innerRadius: 11, depth: 7, sides: 6, detail: D }),
        { pos: [0, 36, z] });
    }
    b.add('plating', aimed(G.sensorDish({ radius: 34, depth: 13, sides: 8, stub: 10, detail: D }),
      [-0.42, 0.20, 1], [-40, 58, 128]));
  }
  // No emitter glow at the tip: this is an instrument, not a gun, and a bright
  // aperture here would read as a weapon at distance.
  b.lightRun([0, 50, 36], [0, 50, 340], [0, 1, 0], { max: 12 });

  return b.finish('bow_prow_spike');
}

registerModule({
  id: 'bow_prow_spike',
  name: 'Concord Interferometry Boom',
  hardpoint: 'bow',
  tier: 1,
  faction: 'concord',
  description: 'A 330 m sensor boom on a cruciform of stabiliser fins. Doubles your resolution '
    + 'at range and makes your bow read as a needle from four kilometres out.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 180,
  build: buildProwSpike,
  grants: { sensorRange: RANGE.sensorBase * 0.55 },
  silhouetteTags: ['needle', 'cruciform', 'axial', 'thin'],
});
