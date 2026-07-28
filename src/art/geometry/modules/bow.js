/**
 * BOW MODULES — the forward bed, on top of the prow casemate.
 *
 * Mount is at [0, 100, 470] in hull space and the ship's nose is at z = 700, so
 * LOCAL z = 230 IS THE END OF THE SHIP. Anything a bow module wants to be seen
 * doing has to happen forward of that, which is why every one of these grows a
 * long way down +Z. A bow module that stops at local z = 150 is invisible: it is
 * hiding inside the casemate the hull already has.
 *
 * The bow is also the one mount where the arc is narrow on purpose (100 degrees,
 * see hardpoints.js#ARC_RATIONALE) — bow weapons are aimed by turning 1.4 km of
 * ship. That is a design statement, so the geometry says it too: these read as
 * SPINAL. Long, axial, braced back into the hull.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, barrel, throat, aimed } from './kit.js';

const HALF_PI = Math.PI * 0.5;

// ---------------------------------------------------------------------------
// T3 — Concord Siege Lance
// ---------------------------------------------------------------------------

/**
 * A spinal particle lance off a Concord line cruiser: a 300 m accelerator tube on
 * an A-frame cradle, two capacitor pods flanking the breech, focus rings along the
 * run. The read is a NEEDLE — nothing else on the ship is thin and 300 m long, so
 * this loadout is identifiable from any angle at any distance.
 */
function buildSiegeLance(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // Breech block, sat over the pad and reaching back onto the casemate deck.
  b.add('hull', G.panelledSlab({ width: 98, height: 76, depth: 150, chamfer: 22, detail: D }),
    { pos: [0, 30, -22] });
  b.graft([0, -6, -22], [-HALF_PI, 0, 0], 44);

  // The tube. One long hex run; the whole module is really this shape.
  b.add('plating', G.hexStrut({ length: 300, radius: 17, axis: 'z', detail: D }),
    { pos: [0, 46, 54] });
  // Flared muzzle and the aperture itself.
  b.add('greeble', G.hexStrut({ length: 30, radius: 25, radiusEnd: 20, axis: 'z', detail: D }),
    { pos: [0, 46, 350] });
  b.glow([0, 46, 383], 17);

  // Focus rings. Two, not five: they are a rhythm along the tube, not a texture.
  const rings = full ? [140, 250] : [190];
  for (const z of rings) {
    b.add('greeble', G.dockingCollar({ radius: 30, innerRadius: 19, depth: 11, sides: 6, detail: D }),
      { pos: [0, 46, z] });
  }

  // Capacitor pods. Concord builds them as clean tapered fairings, and the port
  // one is longer because the starboard bank was cannibalised for the reactor.
  b.add('hull', G.taperedWedge({
    length: 168, width0: 36, height0: 50, width1: 20, height1: 26, chamfer: 6, detail: D,
  }), { pos: [-48, 34, 22] });
  b.add('hull', G.taperedWedge({
    length: 126, width0: 36, height0: 50, width1: 20, height1: 26, chamfer: 6, detail: D,
  }), { pos: [48, 34, 22] });

  // The cradle: an A-frame carrying the tube where it leaves the breech.
  if (full) {
    for (const s of [-1, 1]) {
      b.add('greeble', G.hexStrut({ length: 56, radius: 7, axis: 'y', detail: D }),
        { pos: [s * 30, -4, 196], rot: [0, 0, -s * 0.42] });
    }
    b.add('greeble', G.panelledSlab({ width: 74, height: 10, depth: 22, detail: D }), { pos: [0, 40, 196] });
  }

  // Running lights: along the top of the tube, 20 m apart. This is the ONE cue
  // that tells you the lance is 300 m and not 30.
  b.lightRun([0, 64, 70], [0, 64, 330], [0, 1, 0], { max: 12 });

  return b.finish('bow_siege_lance');
}

registerModule({
  id: 'bow_siege_lance',
  name: 'Concord Siege Lance',
  hardpoint: 'bow',
  tier: 3,
  faction: 'concord',
  description: 'A spinal particle lance cut from a Concord line cruiser, cradled on an A-frame '
    + 'that reaches 150 m past your own bow. It fires where the ship is pointed and nowhere else.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1180,
  build: buildSiegeLance,
  weapon: {
    id: 'w_siege_lance', name: 'Siege Lance', type: 'lance',
    range: RANGE.lance, damage: 2600, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 11.0, projectileSpeed: Infinity, tracking: 0.05, powerDraw: 42,
    yawWidth: Math.PI * 0.10, pitchWidth: Math.PI * 0.05, subsystemAccuracy: 0.72,
  },
  silhouetteTags: ['spinal', 'needle', 'overhanging', 'forward-reach'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Breaching Prow
// ---------------------------------------------------------------------------

/**
 * A boarding ram: a drooping armoured wedge with cutting teeth and two harpoon
 * tubes, plus the winch drum that reels the line back in. Reads as a BEAK from the
 * side and a chisel from above, and it hangs BELOW the casemate deck so it changes
 * the bow's bottom line as well as its top one.
 */
function buildBreachingProw(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Backing block bolted to the pad.
  b.add('hull', G.panelledSlab({ width: 108, height: 56, depth: 96, chamfer: 16, detail: D }),
    { pos: [0, 6, -18] });

  // The ram itself: tipped nose-down so it hangs under the prow.
  //
  // The droop used to be 0.30 rad and the tip finished at roughly the height it
  // started; against the torpedo battery - the other Coalition bow module, also a
  // big block with things sticking forward out of it - the two were hard to tell
  // apart. 0.46 rad puts the tip 120 m BELOW the mount plane, so this module's
  // whole read is that the bow of the ship now points DOWN, and the torpedo block's
  // is that it points UP. Opposite signs, one glance.
  b.add('plating', G.taperedWedge({
    length: 232, width0: 116, height0: 70, width1: 34, height1: 18, shear: -12, chamfer: 8, detail: D,
  }), { pos: [0, 2, 16], rot: [0.46, 0, 0] });

  // Teeth along the leading edge. Three, uneven — a cutter that has been re-welded.
  if (full) {
    const teeth = [[-30, 8], [4, 0], [32, 14]];
    for (const [x, dz] of teeth) {
      b.add('greeble', G.taperedWedge({
        length: 46, width0: 20, height0: 20, width1: 4, height1: 5, detail: D,
      }), { pos: [x, -104 + dz * 0.4, 210 + dz], rot: [0.46, 0, 0] });
    }
  }

  // Harpoon tubes, one either side of the ram root, angled slightly out.
  for (const s of [-1, 1]) {
    b.add('greeble', aimed(barrel({ length: 104, radius: 11, brake: false, detail: D }),
      [s * 0.14, -0.08, 1], [s * 52, 26, 20]));
  }
  // Winch drum: to port only. Somebody bolted it where there was room.
  b.add('greeble', G.pipeRun({ length: 54, radius: 20, sides: 6, axis: 'x', flanges: full ? 1 : 0, detail: D }),
    { pos: [-72, 40, -26] });

  // Flank armour on the ram root.
  if (full) {
    for (const s of [-1, 1]) {
      b.add('plating', G.armourBelt({
        length: 118, height: 34, thickness: 9, plates: 2, gap: 14, chamfer: 6, detail: D,
      }), { pos: [s * 56, -8, 66] });
    }
  }

  b.graft([0, -22, -18], [-HALF_PI, 0, 0], 42);

  // Lights down the ram's upper spine, following the droop.
  b.lightRun([0, 24, 40], [0, -76, 200], [0, 1, 0], { max: 8 });

  return b.finish('bow_breaching_prow');
}

registerModule({
  id: 'bow_breaching_prow',
  name: 'Coalition Breaching Prow',
  hardpoint: 'bow',
  tier: 2,
  faction: 'coalition',
  description: 'Armoured ram and twin harpoon tubes off a Coalition assault frigate. Reels a '
    + 'target in close, then opens it. The teeth were re-welded by somebody in a hurry.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 860,
  build: buildBreachingProw,
  weapon: {
    id: 'w_harpoon_tubes', name: 'Harpoon Tubes', type: 'missile',
    range: 1800, damage: 420, shotsPerBurst: 2, burstInterval: 0.7,
    cooldown: 6.5, projectileSpeed: 340, tracking: 0.16, powerDraw: 10,
    yawWidth: Math.PI * 0.36, pitchWidth: Math.PI * 0.16, subsystemAccuracy: 0.30,
  },
  grants: { salvageRate: 0.20 },
  silhouetteTags: ['beak', 'ventral-hook', 'overhanging', 'toothed'],
});

// ---------------------------------------------------------------------------
// T1 — Derelict Mining Laser Array
// ---------------------------------------------------------------------------

/**
 * Three cutting heads on splayed arms off an ancient mining tender. Nothing about
 * the spread is symmetrical, because nothing the derelicts built is. Cheap, T1,
 * and still unmistakable at distance: a forward-facing CLAW.
 */
function buildMiningArray(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  // Backplate: an eight-sided drum rather than a box. Not a human shape.
  b.add('hull', G.pipeRun({ length: 54, radius: 44, sides: 6, axis: 'z', flanges: 0, detail: D }),
    { pos: [0, 16, -30] });
  b.graft([0, -6, -14], [-HALF_PI, 0, 0], 40);

  // Three arms at 0, 128 and 235 degrees around the axis — deliberately not thirds.
  const arms = [
    { a: 0.35, len: 196, r: 68 },
    { a: 2.24, len: 152, r: 60 },
    { a: 4.10, len: 172, r: 62 },
  ];
  for (const arm of arms) {
    const ca = Math.cos(arm.a), sa = Math.sin(arm.a);
    const x = ca * arm.r, y = 16 + sa * arm.r;
    const dir = [ca * 0.40, sa * 0.40, 1];
    b.add('greeble', aimed(
      G.hexStrut({ length: arm.len, radius: 8, radiusEnd: 6, axis: 'z', detail: D }), dir, [x, y, 0],
    ));
    // Emitter head: a short flared cone on the end of the arm, aperture glowing.
    const k = arm.len / Math.hypot(ca * 0.40, sa * 0.40, 1);
    const hx = x + ca * 0.40 * k, hy = y + sa * 0.40 * k, hz = k;
    b.add('hull', aimed(
      G.hexStrut({ length: 32, radius: 15, radiusEnd: 11, axis: 'z', detail: D }), dir, [hx, hy, hz],
    ));
    b.glow([hx + ca * 9, hy + sa * 9, hz + 36], 12);
  }

  // Coolant vanes on the drum, three of them, canted.
  if (full) {
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1;
      b.add('plating', G.radiatorFin({
        chord: 54, span: 62, thickness: 5, sweep: -18, tipChord: 34, detail: D,
      }), { pos: [Math.cos(a) * 30, 16 + Math.sin(a) * 30, -34], rot: [0, 0, a - HALF_PI] });
    }
  }

  b.lightRun([0, 62, -20], [0, 62, 100], [0, 1, 0], { max: 7 });

  return b.finish('bow_mining_array');
}

registerModule({
  id: 'bow_mining_array',
  name: 'Ancient Cutting Array',
  hardpoint: 'bow',
  tier: 1,
  faction: 'derelict',
  description: 'Three cutting heads on splayed arms, pulled off a derelict mining tender. The '
    + 'arms are not evenly spaced and nobody has ever worked out why.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 310,
  build: buildMiningArray,
  weapon: {
    id: 'w_cutting_array', name: 'Cutting Array', type: 'mining',
    range: RANGE.salvageBeam, damage: 90, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 0.5, projectileSpeed: Infinity, tracking: 0.22, powerDraw: 14,
    yawWidth: Math.PI * 0.42, pitchWidth: Math.PI * 0.30, subsystemAccuracy: 0.55,
  },
  grants: { salvageRate: 0.45 },
  silhouetteTags: ['claw', 'splayed', 'overhanging', 'asymmetric'],
});

// ---------------------------------------------------------------------------
// T2 — Coalition Torpedo Tubes
// ---------------------------------------------------------------------------

/**
 * Four heavy tubes in a stepped 2x2 block, muzzles open, with the reload magazine
 * strapped along the starboard flank because there was nowhere else to put it.
 * The read is a BLUNT SQUARE SNOUT — the exact opposite of the lance, which is why
 * both exist.
 */
function buildTorpedoTubes(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  b.add('hull', G.panelledSlab({ width: 118, height: 88, depth: 148, chamfer: 16, detail: D }),
    { pos: [0, 30, 26] });
  b.graft([0, -14, 10], [-HALF_PI, 0, 0], 44);

  // Four tubes, standing a long way clear of the block. The upper pair is stepped
  // 40 m further forward and 56 m higher: that step is the entire reason this reads
  // as a stack of tubes instead of as a box with dark spots painted on it.
  // The step is now 88 m, not 56. Together with the breaching prow's steeper droop
  // this is the pair's separation: that module's mass goes DOWN and forward of the
  // bow, this one's goes UP and forward of it. At a glance, in silhouette, from any
  // angle, one is a beak and one is a staircase.
  const tubes = [[-32, 2, 178], [32, 2, 178], [-32, 90, 224], [32, 90, 224]];
  for (const [x, y, z] of tubes) {
    b.add('plating', G.hexStrut({ length: 96, radius: 25, axis: 'z', caps: false, detail: D }),
      { pos: [x, y, z - 96] });
    b.add('dark', throat({ width: 34, height: 34, depth: 52, detail: D }), { pos: [x, y, z] });
  }
  // Mantlet the upper pair grows out of, so the step has something to stand on.
  b.add('plating', G.panelledSlab({ width: 104, height: 42, depth: 52, chamfer: 8, detail: D }),
    { pos: [0, 84, 126] });
  // Hoist tower behind the upper tubes: the tallest thing on the bow, and the
  // reason the block reads as a stack rather than as a wide box.
  b.add('hull', G.panelledSlab({ width: 58, height: 74, depth: 62, chamfer: 10, detail: D }),
    { pos: [0, 96, 34] });

  // Magazine drum: starboard flank only.
  b.add('greeble', G.pipeRun({ length: 156, radius: 27, sides: 6, axis: 'z', flanges: full ? 2 : 0, detail: D }),
    { pos: [76, 16, -34] });
  if (full) {
    for (const dz of [-12, 78]) {
      b.add('greeble', G.hexStrut({ length: 34, radius: 6, axis: 'x', detail: D }), { pos: [48, 16, dz] });
    }
  }

  // Lights along the block's port chine — the side with no magazine on it.
  b.lightRun([-62, 76, -40], [-62, 76, 120], [-0.5, 0.86, 0], { max: 9 });

  return b.finish('bow_torpedo_tubes');
}

registerModule({
  id: 'bow_torpedo_tubes',
  name: 'Coalition Torpedo Battery',
  hardpoint: 'bow',
  tier: 2,
  faction: 'coalition',
  description: 'Four 12 km torpedo tubes in a stepped block, with the reload magazine strapped '
    + 'to the starboard flank because there was nowhere else for it to go.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 940,
  build: buildTorpedoTubes,
  weapon: {
    id: 'w_bow_torpedoes', name: 'Heavy Torpedoes', type: 'missile',
    range: RANGE.missile, damage: 1150, shotsPerBurst: 4, burstInterval: 0.9,
    cooldown: 14.0, projectileSpeed: 260, tracking: 0.10, powerDraw: 18,
    yawWidth: Math.PI * 0.5, pitchWidth: Math.PI * 0.22, subsystemAccuracy: 0.25,
  },
  silhouetteTags: ['blunt-snout', 'stacked', 'boxy', 'asymmetric'],
});

// ---------------------------------------------------------------------------
// T1 — Concord Prow Sensor Spike
// ---------------------------------------------------------------------------

/**
 * A 230 m interferometry boom on a cruciform of fins. It is the cheapest module in
 * the library and one of the most legible, because a bare needle in front of a
 * 1.4 km hull is a shape no other module produces.
 */
function buildProwSpike(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.panelledSlab({ width: 76, height: 42, depth: 74, chamfer: 12, detail: D }),
    { pos: [0, 14, -8] });
  b.graft([0, -8, -8], [-HALF_PI, 0, 0], 38);

  // The boom.
  b.add('greeble', G.hexStrut({ length: 236, radius: 8, radiusEnd: 2.2, axis: 'z', detail: D }),
    { pos: [0, 30, 26] });

  // Cruciform stabiliser fins at the root — four blades, so the spike reads as a
  // deliberate instrument rather than as a stray pole.
  for (let i = 0; i < 4; i++) {
    const a = i * HALF_PI + 0.4;
    b.add('plating', G.radiatorFin({
      chord: 60, span: 54, thickness: 4, sweep: -26, tipChord: 26, detail: D,
    }), { pos: [Math.cos(a) * 9, 30 + Math.sin(a) * 9, 34], rot: [0, 0, a - HALF_PI] });
  }

  // Two collars up the boom, and a small forward-looking dish at 40%.
  if (full) {
    for (const z of [110, 190]) {
      b.add('greeble', G.dockingCollar({ radius: 15, innerRadius: 9, depth: 6, sides: 6, detail: D }),
        { pos: [0, 30, z] });
    }
    b.add('plating', aimed(G.sensorDish({ radius: 26, depth: 10, sides: 8, stub: 8, detail: D }),
      [-0.42, 0.20, 1], [-30, 46, 96]));
  }
  // No emitter glow at the tip: this is an instrument, not a gun, and a bright
  // aperture here would read as a weapon at distance.
  b.lightRun([0, 40, 30], [0, 40, 250], [0, 1, 0], { max: 12 });

  return b.finish('bow_prow_spike');
}

registerModule({
  id: 'bow_prow_spike',
  name: 'Concord Interferometry Boom',
  hardpoint: 'bow',
  tier: 1,
  faction: 'concord',
  description: 'A 230 m sensor boom on a cruciform of stabiliser fins. Doubles your resolution '
    + 'at range and makes your bow read as a needle from four kilometres out.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 180,
  build: buildProwSpike,
  grants: { sensorRange: RANGE.sensorBase * 0.55 },
  silhouetteTags: ['needle', 'cruciform', 'forward-reach', 'thin'],
});
