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
import {
  ModuleBuilder, MODULE_TRI_BUDGET, barrel, throat, aimed, muzzleAlong,
  massLoft, massFrames, massStrake, massRecess,
} from './kit.js';

const HALF_PI = Math.PI * 0.5;

/**
 * A SECONDARY MASS IN THE HULL'S SECTION, as one call.
 *
 * `massLoft` wants a table of `[z, half, top, bottom, knuckle, deckFlat, flare]`, which
 * is the right shape for a body whose stations were designed one at a time. It is the
 * wrong shape for the twenty-odd BOOMS, TUBES, LEGS and RAILS on this mount, where the
 * only thing that varies down the run is how wide it is: writing those out longhand is
 * how a table ends up with a station whose depth someone forgot to scale, and M-F4 then
 * fires at build time in a stream that has no browser open.
 *
 * So a spar is authored as widths alone and the depth follows from `SPAR_DEPTH`. The
 * ratio is 1/0.58 = 1.72 : 1 of beam to depth at EVERY station by construction, against
 * M-F4's 1.6 - a spar built through here cannot violate the rule, whatever length it is
 * given. That matters more than it sounds: `massLoft` throws rather than warns, so an
 * unbuildable module is a hard failure of `tools/gates.mjs`, not a bad-looking picture.
 *
 * It is also the shape the brief asks for. A 1.72 : 1 section is a FLAT spar - a blade
 * with a knuckle down each edge, six large planes a side - where every one of these was
 * a `hexStrut`, i.e. a six-sided tube whose whole read is round.
 */
const SPAR_DEPTH = 0.58;
const spar = (len, w0, w1, mid = 0.46) => {
  const wm = (w0 + w1) * 0.52;
  const row = (z, w, k, df, fl) => [z, w, w * SPAR_DEPTH, -w * SPAR_DEPTH, k, df, fl];
  return [row(0, w0, 0.44, 0.48, 0.92), row(len * mid, wm, 0.44, 0.48, 0.92), row(len, w1, 0.42, 0.46, 0.96)];
};

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
/**
 * THE BREECH, in the hull's own section. `[z, half, top, bottom, knuckle, deckFlat,
 * flare]`. It was a `panelledSlab` 118 x 92 x 190 - a rectangular prism, 100% of its
 * surface area within five degrees of a cardinal axis, on a hull that holds 8.3%.
 *
 * It also had to TURN OVER to get here. 118 wide by 92 deep is beam : depth 1.28,
 * under M-F4's 1.6, so `massLoft` refuses to build it: a breech taller than it is wide
 * is a different fleet's part. 168 x 98 is the same volume lying down, and it is what
 * every capital in the reference material does - the height goes into the cradle, not
 * into the block.
 */
const LANCE_BREECH = [
  [-128, 66, 72, -6, 0.42, 0.46, 0.94],
  [-56, 84, 84, -14, 0.45, 0.49, 0.90],
  [26, 82, 82, -12, 0.45, 0.49, 0.90],
  [72, 62, 70, -4, 0.40, 0.44, 0.96],
];

function buildSiegeLance(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // Breech block, sat over the pad and reaching back onto the foredeck.
  b.add('hull', massLoft(LANCE_BREECH, { detail: D, label: 'lance breech' }));
  // M-F5: two frames, 106 m apart, neither on the centre of length.
  b.add('plating', massFrames(LANCE_BREECH, [-84, 22], { detail: D }));
  // M-F6: Concord gets ONE long plate rather than Coalition's several short ones.
  b.add('dark', massStrake(LANCE_BREECH, {
    z0: -108, z1: 56, side: -1, facet: [2, 1], t0: 0.14, t1: 0.70, drift: -0.10, out: 5, detail: D,
  }));
  b.graft([0, -6, -30], [-HALF_PI, 0, 0], 44);

  // THE TUBE, and it is a SPAR rather than a `hexStrut` now. A 440 m six-sided tube
  // is 440 m of round, which is the one thing this hull's language does not contain;
  // the same run in the hull's section is a flat accelerator rail 44 m across with a
  // knuckle down each edge, for the same outline the needle read depends on.
  b.add('plating', G.place(massLoft(spar(440, 22, 19), { detail: D, label: 'lance tube' }),
    { pos: [0, 58, 60] }));
  // Flared muzzle and the aperture itself. This one stays a ring: a muzzle brake IS
  // a collar, and it is 40 m of a 545 m module.
  b.add('greeble', G.hexStrut({ length: 40, radius: 32, radiusEnd: 25, axis: 'z', detail: D }),
    { pos: [0, 58, 500] });
  b.glow(LANCE_MUZZLE, 22);

  // Focus rings. Two, not five: they are a rhythm along the tube, not a texture.
  const rings = full ? [200, 370] : [280];
  for (const z of rings) {
    b.add('greeble', G.dockingCollar({ radius: 38, innerRadius: 24, depth: 13, sides: 6, detail: D }),
      { pos: [0, 58, z] });
  }

  // Capacitor pods, cut from the same section as everything else and rooted 13 m
  // INSIDE the breech's own flank rather than standing beside it. The port one is
  // longer because the starboard bank was cannibalised for the reactor.
  for (const [s, len] of [[-1, 236], [1, 168]]) {
    b.add('hull', G.place(massLoft(spar(len, 27, 16), { detail: D, label: 'capacitor pod' }),
      { pos: [s * 96, 34, 26] }));
  }

  // The cradle: an A-frame carrying the tube where it leaves the breech.
  if (full) {
    for (const s of [-1, 1]) {
      b.add('greeble', G.hexStrut({ length: 74, radius: 9, axis: 'y', detail: D }),
        { pos: [s * 38, -12, 280], rot: [0, 0, -s * 0.42] });
    }
    b.add('greeble', G.bevelBox({
      width: 96, height: 14, depth: 28, chamfer: 4, draft: 4, cant: 0.09, detail: D,
    }), { pos: [0, 50, 280] });
    // M-F7: the capacitor tap sits IN a cut in the breech, not on it.
    b.add('dark', massRecess(LANCE_BREECH, {
      z: -20, side: 1, facet: [2, 3], t: 0.48, width: 72, height: 28, depth: 18, wall: 4, detail: D,
    }));
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
  // Measured root at the mount face 134 x 200 m; an energy lance, so the trunk is power.
  fit: { footprintM: [134, 200], service: 'reactor' },
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

/**
 * THE BACKING BLOCK, in the hull's own section, where a `panelledSlab` 132 x 66 x 118
 * was. Beam : depth 1.94-2.00 against M-F4's 1.6 - this one did not have to turn over,
 * because a boarding ram's backing block was already wider than it was deep.
 */
const PROW_BACKING = [
  [-85, 58, 8, -50, 0.42, 0.46, 0.94],
  [-30, 68, 14, -56, 0.45, 0.49, 0.90],
  [20, 68, 14, -56, 0.45, 0.49, 0.90],
  [45, 60, 10, -52, 0.40, 0.44, 0.96],
];
/**
 * THE RAM. `taperedWedge` gave it four flat faces and a chamfer; `spar` gives it the
 * same 148 m root beam and 40 m tip in the hull's twelve-point section, so the wedge
 * that drives 300 m under the foredeck is now built out of the same plates as the
 * foredeck. The tip is a knuckle rather than a corner, which is what a ram wants.
 */
const PROW_RAM = spar(330, 74, 20, 0.42);
const PROW_RAM_XF = { pos: [0, -26, 10], rot: [0.58, 0, 0] };

function buildBreachingProw(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Backing block bolted to the pad, and it sits LOW: the whole module hangs.
  b.add('hull', massLoft(PROW_BACKING, { detail: D, label: 'prow backing' }));
  // M-F5: two frames, 96 m apart. Coalition shows its structure.
  b.add('plating', massFrames(PROW_BACKING, [-58, 38], { detail: D }));

  // The ram: a long spar tipped steeply nose-down. 0.58 rad over 330 m puts the
  // tip 300 m below the mount plane and 60 m past the stem.
  b.add('plating', G.place(massLoft(PROW_RAM, { detail: D, label: 'ram' }), PROW_RAM_XF));
  // M-F6: two plates lying ON the ram's own flanks, cut from the ram's own section
  // and following the droop because they ARE the surface, offset. This is what the
  // pair of `armourBelt` bars bolted across the root used to gesture at.
  for (const [side, z0, z1, t0] of [[-1, 40, 300, 0.12], [1, 90, 330, 0.20]]) {
    b.add('dark', G.place(massStrake(PROW_RAM, {
      z0, z1, side, facet: [2, 1], t0, t1: t0 + 0.52, drift: side * 0.12, out: 5, detail: D,
    }), PROW_RAM_XF));
  }
  // A second, shorter spar under the first, offset to starboard: the ram is a
  // re-welded assembly, not a casting, and the step between the two is a hard edge
  // that catches the key all the way down the droop.
  b.add('hull', G.place(massLoft(spar(210, 48, 15, 0.44), { detail: D, label: 'ram underblade' }),
    { pos: [16, -74, 30], rot: [0.66, 0, 0] }));

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
      // A tooth is a BLADE, not a spike: 26 m across and 15 m thick, in the same
      // section as the ram it is welded to. A cutter's teeth are flat.
      b.add('greeble', G.place(massLoft(spar(62, 13, 3.5), { detail: D, label: 'ram tooth' }),
        { pos: [x, -26 - t * 180.4 - 22, z], rot: [0.58, 0, 0] }));
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

  // M-F7: the harpoon reels sit IN a cut in the backing block's flank rather than
  // as a proud band across it. A 20 m recess self-shadows under any key; the
  // `armourBelt` that used to hang off the ram root at x +-72 did not, and it was
  // also a straight bar at a fixed x on a body whose section moves - the exact
  // defect `kit.js#massStrake` exists to make impossible.
  if (full) {
    b.add('dark', massRecess(PROW_BACKING, {
      z: -18, side: -1, facet: [2, 3], t: 0.44, width: 62, height: 26, depth: 20, wall: 4, detail: D,
    }));
    b.add('dark', massRecess(PROW_BACKING, {
      z: 12, side: 1, facet: [2, 3], t: 0.50, width: 44, height: 22, depth: 16, wall: 4, detail: D,
    }));
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
  // Measured root at the mount face 154 x 130 m; the harpoon tubes are missile-fed.
  fit: { footprintM: [154, 130], service: 'magazine' },
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
 * Three cutting heads on splayed booms off an ancient mining tender. Nothing about
 * the spread is symmetrical, because nothing the derelicts built is. Cheap, T1,
 * and still unmistakable at distance: a forward-facing CLAW that is 460 m across
 * and open in the middle, so the bow of the ship acquires a hole in it.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE MODULE THE OWNER WAS LOOKING AT
 * ---------------------------------------------------------------------------
 * The integration wave's critic named it: "the single loudest thing on the ship is
 * still the bow mining array: three tubes with knobs, at unrelated angles". Every
 * word of that was a build instruction:
 *
 *   TUBES   the booms were `hexStrut` - six-sided TUBES, whose entire read is round,
 *           on a ship that had just spent five thousand triangles becoming a flat
 *           twelve-point plate family. They are now `massLoft` SPARS: the hull's own
 *           section at 1.72 : 1 of beam to depth, so each boom is a flat blade with a
 *           knuckle down both of its edges. Same reach, same three angles, opposite
 *           surface behaviour - the key rakes along a boom now instead of sliding
 *           round it.
 *   KNOBS   the cutting heads were bare flared cones with a glow disc stuck on the
 *           front, which is the additive-greeble-on-a-proud-face failure `kit.js`
 *           M-F7 exists to forbid. Each head is now a lofted housing with the
 *           aperture CUT INTO it (`throat`) and the glow sitting 12 m down the hole,
 *           so it self-shadows and reads as a working emitter rather than a bulb.
 *   DRUM    the body was a `pipeRun` - a hexagonal tube 124 m across with two flat
 *           ends square to +-Z, which is 100% axis-aligned end area on a hull that
 *           holds 8.3%. It is a 204 m `massLoft` YOKE with two frames at the hull's
 *           structural rhythm, a strake cut from its own section and two machinery
 *           recesses; the booms are struck from INSIDE it rather than from a radius
 *           22-34 m outside it, which is the graft the module never had.
 *
 * The reach, the three bearings and the open centre are untouched, because that is
 * the silhouette the audit separates on and it was never the complaint.
 */

/**
 * Three booms at 20, 128 and 235 degrees around the axis - deliberately not thirds.
 *
 * `r` IS A ROOT RADIUS INSIDE THE YOKE. It was 84-96 against a drum 62 m in radius,
 * so all three arms were struck from a point outside the only thing on this module
 * that could have been holding them and the whole array read, in the bow-on view of
 * `tools/silhouette.mjs`, as a SIXTY-SIX METRE detached fragment beside the ship. The
 * integration wave pulled them to 46-52 against that drum; against the yoke's own
 * section - half-beam 94 at the widest station - 40-44 buries every root in solid
 * mass with 50 m of body outboard of it.
 *
 * `w0`/`w1` are the boom's half-beam at root and tip. Its depth follows from
 * `SPAR_DEPTH`, so no boom can be authored taller than it is wide.
 */
const MINING_ARMS = [
  { a: 0.35, len: 380, r: 44, w0: 27, w1: 14 },
  { a: 2.24, len: 304, r: 40, w0: 24, w1: 13 },
  { a: 4.10, len: 342, r: 42, w0: 26, w1: 15 },
];
const MINING_SPLAY = 0.52;
const MINING_HUB_Y = 16;
/** Struck from inside the yoke, which spans z -104 .. +100. */
const MINING_ROOT_Z = -30;
/** The cutting head: a lofted housing on the end of each boom, aperture cut into it. */
const MINING_HEAD_LEN = 66;

/**
 * THE YOKE, in the hull's own twelve-point section.
 * `[z, half, top, bottom, knuckle, deckFlat, flare]` - the same seven columns
 * `cruiser.js#HULL_STATIONS` uses. Beam : depth runs 1.71 at the middle to 1.82 at
 * the stern station, against M-F4's 1.6.
 */
const MINING_YOKE = [
  [-104, 66, 54, -22, 0.42, 0.46, 0.94],
  [-36, 94, 72, -38, 0.45, 0.49, 0.90],
  [38, 90, 68, -36, 0.45, 0.49, 0.90],
  [100, 60, 48, -18, 0.40, 0.44, 0.96],
];

/**
 * Everything about one boom derived from its authored numbers: where it is struck
 * from, where it points, where its housing lands, how the flat of the blade is
 * rolled, and where the cutting aperture ends up. The build loop and the muzzle
 * declaration both read this, so moving a boom moves its muzzle and neither can be
 * forgotten.
 */
function miningArm(arm) {
  const ca = Math.cos(arm.a), sa = Math.sin(arm.a);
  const root = [ca * arm.r, MINING_HUB_Y + sa * arm.r, MINING_ROOT_Z];
  const dir = [ca * MINING_SPLAY, sa * MINING_SPLAY, 1];
  const k = arm.len / Math.hypot(dir[0], dir[1], dir[2]);
  const head = [root[0] + dir[0] * k, root[1] + dir[1] * k, root[2] + k];
  return {
    ca,
    sa,
    root,
    dir,
    head,
    // The blade's flat is rolled TANGENTIAL to the claw, so bow-on the three booms
    // present their broad faces around the open centre instead of three round sticks.
    roll: arm.a + HALF_PI,
    aperture: muzzleAlong(head, dir, MINING_HEAD_LEN),
  };
}

function buildMiningArray(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  // 1. THE YOKE. `derelict` resolves `plating` to `hull` (kit.js#resolveSurface), so
  //    the frames and the strake land on the eroded surface with it - one material,
  //    still a real 4 m step and a real plate edge.
  b.add('hull', massLoft(MINING_YOKE, { detail: D, label: 'mining yoke' }));
  // M-F5: two frames, 96 m apart and neither on the centre of length.
  b.add('plating', massFrames(MINING_YOKE, [-62, 34], { detail: D }));
  // M-F6 / F10: one plate a side on the LOWER flank, below the yoke's own knuckle,
  // on `dark`, so the value boundary lands on an 80-degree chine with a shadow at it.
  b.add('dark', massStrake(MINING_YOKE, {
    z0: -86, z1: 62, side: -1, facet: [2, 1], t0: 0.12, t1: 0.66, drift: 0.16, out: 5, detail: D,
  }));
  b.add('dark', massStrake(MINING_YOKE, {
    z0: -30, z1: 90, side: 1, facet: [2, 1], t0: 0.20, t1: 0.72, drift: -0.12, out: 4, detail: D,
  }));
  b.graft([0, -20, -18], [-HALF_PI, 0, 0], 40);

  // 2. THREE BOOMS, struck from inside the yoke and rolled flat-on to the claw.
  for (const arm of MINING_ARMS) {
    const { root, dir, head, roll, aperture } = miningArm(arm);
    b.add('hull', aimed(G.place(
      massLoft(spar(arm.len, arm.w0, arm.w1), { detail: D, label: 'cutter boom' }),
      { rot: [0, 0, roll] },
    ), dir, root));

    // 3. THE HEAD. A lofted housing that FLARES where the old cone tapered - a
    //    cutting head is a bell, and a flare gives the aperture something to be cut
    //    into. Then the aperture itself, as a lined hole (M-F7) with the glow 12 m
    //    down it rather than a disc stuck on the front.
    const hw = arm.w1;
    b.add('plating', aimed(G.place(
      massLoft([
        [0, hw * 1.05, hw * 0.58, -hw * 0.58, 0.44, 0.48, 0.92],
        [MINING_HEAD_LEN * 0.52, hw * 1.85, hw * 1.02, -hw * 1.02, 0.46, 0.50, 0.88],
        [MINING_HEAD_LEN, hw * 1.62, hw * 0.90, -hw * 0.90, 0.42, 0.46, 0.96],
      ], { detail: D, label: 'cutter head', keep: full ? null : G.FACET_LOD.far }),
      { rot: [0, 0, roll] },
    ), dir, head));
    b.add('dark', aimed(throat({
      width: hw * 2.0, height: hw * 1.3, depth: hw * 2.4, detail: D,
    }), dir, aperture));
    b.glowDir(muzzleAlong(aperture, dir, -12), hw * 0.86, dir);
  }

  // 4. M-F7: the coolant plant sits IN a cut in the yoke's flank, not on it. Two,
  //    on opposite sides and at unrelated stations, because this is a derelict.
  b.add('dark', massRecess(MINING_YOKE, {
    z: -12, side: -1, facet: [2, 3], t: 0.46, width: 84, height: 34, depth: 22, wall: 4, detail: D,
  }));
  if (full) {
    b.add('dark', massRecess(MINING_YOKE, {
      z: 56, side: 1, facet: [1, 2], t: 0.40, width: 56, height: 26, depth: 16, wall: 4, detail: D,
    }));
    // Two coolant vanes, swept back ALONG the yoke's flank rather than fanned off a
    // drum at three unrelated bearings. They lie on the surface they cool.
    for (const s of [-1, 1]) {
      b.add('plating', G.radiatorFin({
        chord: 84, span: 74, thickness: 6, sweep: -30, tipChord: 46, rim: 8, detail: D,
      }), { pos: [s * 82, 30, -56], rot: [0, 0, s * 1.34] });
    }
  }

  b.lightRun([0, 84, -84], [0, 84, 92], [0, 1, 0], { max: 7 });

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
  // Measured root at the mount face 182 x 176 m; a continuous cutting beam is a heat problem before it is a power one.
  fit: { footprintM: [182, 176], service: 'coolant' },
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

/**
 * ONE STEP'S PLATFORM, in the hull's own section, running fore-aft.
 *
 * The comment this replaces said the four platforms were "square-cornered on purpose:
 * this is the rectilinear navy, and a chamfer on four platforms is sixty-four
 * triangles". Both halves of that were wrong once the hull was rebuilt. The Coalition
 * ships in `ships/` are not rectilinear any more - they are the cruiser's own
 * twelve-point section, and `coalition_strikecraft` went from 82.1% axis-aligned to
 * 8.3% getting there. And the triangles are not scarce: `BUDGET.moduleTris` is 1200
 * and this module was spending 360.
 */
const torpedoDeck = (w) => [
  [-46, w * 0.50, 20, -14, 0.44, 0.48, 0.92],
  [0, w * 0.53, 22, -16, 0.45, 0.49, 0.90],
  [46, w * 0.47, 19, -13, 0.42, 0.46, 0.94],
];

function buildTorpedoTubes(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  b.graft([0, -14, 10], [-HALF_PI, 0, 0], 44);

  // The lattice between the steps is open; see TORPEDO_STEPS above the function.
  for (let i = 0; i < TORPEDO_STEPS.length; i++) {
    const s = TORPEDO_STEPS[i];
    const x = torpedoX(i);
    // Platform, in the hull's section. Beam : depth 3.6-3.9, so the deck stays a
    // deck; what it gains is a cambered top, a knuckle and a keel with deadrise
    // instead of six faces square to the axes.
    b.add('hull', G.place(massLoft(torpedoDeck(s.w), { detail: D, label: 'torpedo deck' }),
      { pos: [x, s.y, s.z - 40] }));
    // Tube, open at the muzzle - and square-sectioned now, because a torpedo tube
    // that shows a flat top plate reads as ordnance and a round one reads as pipe.
    b.add('plating', G.place(massLoft(spar(s.len, s.r * 1.12, s.r * 1.02),
      { detail: D, label: 'torpedo tube' }), { pos: [x, s.y + 26, s.z] }));
    b.add('dark', throat({ width: s.r * 1.5, height: s.r * 1.5, depth: s.r * 2.2, detail: D }),
      { pos: torpedoMuzzle(s, i) });
  }

  // THE LATTICE. Two raked legs a side carrying the stack, with the four bays
  // between them open to the sky. This is what makes the module read as a tower
  // rather than as a slab with holes drawn on it.
  for (const s of [-1, 1]) {
    b.add('greeble', aimed(G.place(
      massLoft(spar(330, 15, 10), { detail: D, label: 'lattice leg', keep: G.FACET_LOD.far }),
      { rot: [0, 0, s * 0.5] },
    ), [s * 0.10, 1, 0.46], [s * 52, -10, 40]));
  }
  // Hoist rail up the back of the stack: the tallest single line on the module.
  b.add('greeble', aimed(massLoft(spar(340, 12, 9), {
    detail: D, label: 'hoist rail', keep: G.FACET_LOD.far,
  }), [0, 1, 0.12], [0, 6, 8]));
  b.add('hull', G.bevelBox({
    width: 64, height: 46, depth: 58, chamfer: 10, draft: 8, cant: -0.12, rake: 9, detail: D,
  }), { pos: [0, 316, 60] });

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
  // Measured root at the mount face 184 x 210 m; torpedoes come out of the magazine.
  fit: { footprintM: [184, 210], service: 'magazine' },
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
/**
 * THE INSTRUMENT PLINTH. 92 x 52 x 92 of `panelledSlab` becomes 104 x 62 of the hull's
 * section over the same 100 m run - beam : depth 1.67-1.76 against M-F4's 1.6, which
 * is 12 m of extra beam over the slab, because 92 x 52 would have been 1.56 and
 * `massLoft` throws rather than warns.
 * It is the cheapest module in the library and it still gets the whole vocabulary,
 * because "cheap" is a triangle count and this one was spending 312 of 1200.
 */
const SPIKE_PLINTH = [
  [-54, 45, 40, -14, 0.42, 0.46, 0.94],
  [-14, 52, 44, -18, 0.45, 0.49, 0.90],
  [22, 52, 44, -18, 0.45, 0.49, 0.90],
  [46, 44, 38, -12, 0.40, 0.44, 0.96],
];

function buildProwSpike(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', massLoft(SPIKE_PLINTH, { detail: D, label: 'spike plinth' }));
  b.add('plating', massFrames(SPIKE_PLINTH, [-30], { detail: D }));
  // M-F6: Concord's one long plate, on the port flank below the plinth's knuckle.
  b.add('dark', massStrake(SPIKE_PLINTH, {
    z0: -44, z1: 38, side: -1, facet: [2, 1], t0: 0.16, t1: 0.72, drift: -0.10, out: 4, detail: D,
  }));
  b.graft([0, -10, -8], [-HALF_PI, 0, 0], 38);

  // The boom, and it is a flat blade rather than a six-sided pole: 22 m across at the
  // root and 6 m at the tip, with a knuckle down both edges. Same outline, and it
  // catches the key along its length instead of banding across it.
  b.add('greeble', G.place(massLoft(spar(336, 11, 3), {
    detail: D, label: 'interferometry boom', keep: full ? null : G.FACET_LOD.far,
  }), { pos: [0, 36, 30] }));

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
  // Measured root at the mount face 122 x 90 m; an interferometry boom answers to the sensor array.
  fit: { footprintM: [122, 90], service: 'sensor' },
  build: buildProwSpike,
  grants: { sensorRange: RANGE.sensorBase * 0.55 },
  silhouetteTags: ['needle', 'cruciform', 'axial', 'thin'],
});
