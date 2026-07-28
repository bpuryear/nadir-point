/**
 * BROADSIDE MODULES — the port sponson shelf.
 *
 * PORT ONLY. Every module in this file is authored looking outboard along -X with
 * its baseplate at y = 0, exactly as hardpoints.js §3 requires, and the attachment
 * system mirrors it when the player fits it to the starboard sponson. There is no
 * starboard copy of anything here and there must never be one: a hand-authored
 * mirror is a second thing to keep in sync and it will drift.
 *
 * Mount is at [-156, 46, 130] and the seating adds a 7 m service gap outboard, so
 * module local x = -100 is world x = -263. The hull's own widest point is x = 198
 * over the outrigger drive pods, which means LOCAL x = -35 IS WHERE THE SHIP ENDS.
 * A broadside module that stops at local -60 has added twenty-five metres to a
 * 1400 m ship and is not visible in any silhouette.
 *
 * Broadside is the cruiser's natural fighting position (140 degree arc centred on
 * the beam), and the two sponsons between them own a third of the hull's length in
 * z - port at z +60..+200, starboard 120 m further aft. That makes these the only
 * modules other than the ventral that can change the outline over a long run of the
 * ship, so they are sized to do it. The three heavy fits separate on HEIGHT before
 * they separate on width:
 *
 * MEASURED off the built geometry in hull space, port mount:
 *
 *   gauss outrigger  y +42..+290  x to -367   HIGH:  a hard line in the sky
 *   flak cluster     y  -6..+191  x to -538   SPIKY: reaches furthest, but as
 *                                             barrels with sky between them
 *   heavy broadside  y -10..+168  x to -469   LOW:   the widest SOLID mass
 *
 * The gauss rail itself sits at y = +290, 120 m clear of anything the heavy
 * broadside has, so from the beam one is a line in the sky over an empty gap and
 * the other is a slab at deck level - separable before a single detail resolves.
 * The flak's extra reach is fan, not slab: in plan it is a starburst where the
 * other two are rectangles.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, barrel, aimed } from './kit.js';

const HALF_PI = Math.PI * 0.5;
/** Rotation that sends a +Z-authored primitive outboard to port. */
const OUTBOARD = [0, -HALF_PI, 0];

// ---------------------------------------------------------------------------
// T1 — Coalition Cannon Bank
// ---------------------------------------------------------------------------

/**
 * Four mass drivers in a row on a boxy casemate. The cheapest broadside in the
 * game and still the one that most obviously says "this side of the ship shoots".
 */
function buildCannonBank(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // THE CASEMATE HANGS. Everything below is slung UNDER the sponson shelf on two
  // visible external brackets, so this module's mass is below the mount plane and
  // the beam array's is above it.
  //
  // The fitted-silhouette audit (modules/audit.mjs) had these two peaking 91 m
  // apart - two pixels at the 30 px read - because both were a box standing on the
  // sponson at about the same height reaching about the same distance outboard.
  // Making one of them smaller would have been a difference in degree; hanging one
  // and standing the other is a difference in kind, and it is the same fix that
  // separated the bow's breaching prow from its torpedo tubes. It also happens to
  // be how a casemate works: guns low, magazine above them, hoists between.
  b.add('hull', G.panelledSlab({ width: 112, height: 48, depth: 210, chamfer: 14, detail: D }),
    { pos: [-38, -48, 0] });
  // The outer casemate face, skewed in plan so it agrees with the gun steps.
  b.add('plating', G.panelledSlab({ width: 74, height: 44, depth: 150, chamfer: 12, detail: D }),
    { pos: [-104, -60, -4], rot: [0, 0.40, 0] });
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // The two brackets that carry it. Coalition shows its structure.
  if (full) {
    for (const z of [-84, 78]) {
      b.add('greeble', G.hexStrut({ length: 62, radius: 9, axis: 'y', detail: D }),
        { pos: [-30, -34, z], rot: [0, 0, 0.22] });
      b.add('greeble', G.hexStrut({ length: 74, radius: 7, axis: 'y', detail: D }),
        { pos: [-96, -30, z], rot: [0, 0, 0.30] });
    }
  }

  // Four barrels, canted 15 degrees DOWN - a casemate under the shelf cannot shoot
  // level - and ECHELONED: each gun forward of the last sits 8 m further outboard
  // on its own step and is 20 m longer, so the muzzles step out in 28 m increments
  // from 190 m of reach at the aft end to 274 m at the forward one and the
  // casemate's plan outline is a staircase.
  //
  // IT ALSO REACHES A LOT LESS FAR THAN IT DID. This is the cheapest fitting on the
  // mount and it now looks like it: 290 m of half-beam against the Concord beam
  // array's 548 and the derelict flak cluster's 536. It still clears
  // ship-language.md §6 M1 - a hundred metres outboard of the bare hull's own
  // outline at that station - but it no longer competes with the tier-3 fittings
  // for the same silhouette, which is what had it and the beam array measuring
  // 91 m apart at their closest.
  //
  // That staircase is the other half of the separation from the beam array, and it
  // is the half the plan view can see. A module on the BEAM can only move one of
  // the three channels this audit measures - a sponson fitting cannot change the
  // hull's deck line or its keel - so hanging this one below the shelf, which is
  // the difference a player sees from ahead or astern, scores nothing from abeam.
  // Coalition steps where Concord runs a continuous line, so the fix that reads
  // from every angle is the one already in the faction's vocabulary.
  const rows = full
    ? [[-66, 70, -120], [-22, 90, -128], [22, 110, -136], [66, 130, -144]]
    : [[-52, 80, -124], [36, 120, -140]];
  for (const [z, len, x] of rows) {
    b.add('greeble', aimed(barrel({ length: len, radius: 10, detail: D }),
      [-1, -0.27, 0], [x, -58, z]));
  }

  // Ammunition hoist. It is the one part that stands ABOVE the shelf, so the module
  // still reads as attached to something rather than as a pod in space.
  b.add('hull', G.panelledSlab({ width: 52, height: 58, depth: 60, chamfer: 10, detail: D }),
    { pos: [-62, 24, -118] });
  if (full) {
    b.add('greeble', G.pipeRun({ length: 88, radius: 10, sides: 6, axis: 'z', flanges: 1, detail: D }),
      { pos: [-92, 4, -88] });
  }

  b.lightRun([-34, -20, -94], [-34, -20, 98], [0, -1, 0], { max: 9 });

  return b.finish('port_cannon_bank');
}

registerModule({
  id: 'port_cannon_bank',
  name: 'Coalition Cannon Bank',
  hardpoint: 'port',
  tier: 1,
  faction: 'coalition',
  description: 'Four mass drivers in a casemate off a Coalition line frigate. Nothing clever, '
    + 'nothing expensive, and it will still open a corvette at five kilometres.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 420,
  build: buildCannonBank,
  weapon: {
    id: 'w_cannon_bank', name: 'Cannon Bank', type: 'cannon',
    range: RANGE.cannon, damage: 130, shotsPerBurst: 4, burstInterval: 0.22,
    cooldown: 3.2, projectileSpeed: 1600, tracking: 0.30, powerDraw: 12,
    yawWidth: Math.PI * 0.778, pitchWidth: Math.PI * 0.14, subsystemAccuracy: 0.30,
  },
  silhouetteTags: ['barrel-row', 'boxy', 'slung', 'below-plane'],
});

// ---------------------------------------------------------------------------
// T2 — Concord Beam Array
// ---------------------------------------------------------------------------

/**
 * A ceramic fairing with three staggered emitter rods and a pair of swept radiators
 * over the top. Concord's whole language: one clean primary form, very few parts,
 * and the mechanism kept thin.
 */
function buildBeamArray(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // The fairing. Authored along +Z then swung outboard, so `width0` is fore-aft.
  b.add('hull', G.taperedWedge({
    length: 168, width0: 224, height0: 64, width1: 110, height1: 36, chamfer: 12, detail: D,
  }), { pos: [-4, 22, 0], rot: OUTBOARD });
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // Three emitter rods, staggered fore-aft and in height so they never read as a
  // grille. The middle one is longest.
  const rods = full ? [[-74, 12, 168], [2, 36, 216], [76, 12, 168]] : [[2, 36, 216]];
  for (const [z, y, len] of rods) {
    b.add('greeble', G.hexStrut({ length: len, radius: 11, radiusEnd: 7, axis: 'z', detail: D }),
      { pos: [-162, y, z], rot: OUTBOARD });
    b.glow([-162 - len - 8, y, z], 13, OUTBOARD);
  }

  // Two radiators, laid back over the fairing rather than standing up like fins.
  // Upright plates here read as tail surfaces, which is an aircraft cue and wrong
  // for a broadside mount; laid back they read as what they are, heat rejection.
  for (const s of [-1, 1]) {
    b.add('plating', G.radiatorFin({
      chord: 84, span: 84, thickness: 6, sweep: -34, tipChord: 44, rim: 7, detail: D,
    }), { pos: [-54, 48, s * 78], rot: [0, 0, 0.78] });
  }

  b.lightRun([-40, 60, -100], [-40, 60, 100], [0, 1, 0], { max: 9 });

  return b.finish('port_beam_array');
}

registerModule({
  id: 'port_beam_array',
  name: 'Concord Beam Array',
  hardpoint: 'port',
  tier: 2,
  faction: 'concord',
  description: 'Three continuous-wave emitters in a ceramic fairing, with the radiators the '
    + 'donor ship needed to survive firing them. Hitscan, and it eats power.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 560,
  build: buildBeamArray,
  weapon: {
    id: 'w_beam_array', name: 'Beam Array', type: 'beam',
    range: RANGE.beam, damage: 280, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 2.4, projectileSpeed: Infinity, tracking: 0.42, powerDraw: 28,
    yawWidth: Math.PI * 0.778, pitchWidth: Math.PI * 0.20, subsystemAccuracy: 0.62,
  },
  silhouetteTags: ['fairing', 'emitter-rods', 'laid-back', 'sleek'],
});

// ---------------------------------------------------------------------------
// T1 — Derelict Flak Cluster
// ---------------------------------------------------------------------------

/**
 * DEFECT, quoted from docs/review/acceptance.md: "port_flak_cluster merges into a
 * lump when a barrel is occluded."
 *
 * The diagnosis was a packing problem, not a shape problem. Six 52-104 m barrels
 * came out of a 40 m drum that was itself bolted to a 74 x 132 m box, so the mean
 * gap between adjacent barrels near the drum was under fifteen metres - at any
 * distance past two kilometres that fills in and the whole assembly is one blob
 * with a fringe. Three changes, all of them about NEGATIVE SPACE:
 *
 *   1. THE BASE IS OPEN. The solid casemate box is gone; the drum sits on two
 *      trunnion arms with sky between them and the shelf. There is now a hole
 *      through the module before you even reach the barrels.
 *   2. THE BARRELS ARE LONG AND ANGULARLY SEPARATED. 168-246 m, and no two adjacent
 *      barrels are within 24 degrees of each other in the fan. At 200 m from a 26 m
 *      hub, 24 degrees is 80 m of clear sky between neighbours - which still reads
 *      as a gap at four kilometres, and that is the whole test.
 *   3. THE FAN SPRAYS DOWN AS WELL AS UP. Two of the six point below the shelf
 *      plane. A fan that is symmetric about the horizontal reads as a rake; one
 *      that is not reads as damage, which is the faction.
 *
 * The hoppers moved off the drum onto their own stalks for the same reason: a lump
 * bolted to a lump is one lump.
 */
function buildFlakCluster(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // TWO TRUNNION ARMS, not a casemate. The gap between them is the first hole.
  for (const s of [-1, 1]) {
    b.add('hull', aimed(G.hexStrut({ length: 132, radius: 17, radiusEnd: 13, axis: 'z', detail: D }),
      [-1, 0.34, s * 0.28], [-14, 6, s * 44]));
  }

  // The hub: small, canted, and hung out in space on the arms.
  b.add('hull', G.pipeRun({ length: 62, radius: 30, sides: 6, axis: 'x', flanges: 0, detail: D }),
    { pos: [-158, 52, 0], rot: [0, 0, 0.26] });

  // Six barrels across a 190 degree fan in yaw and a 60 degree spread in pitch.
  // Adjacent yaw separations are 0.42/0.55/0.47/0.61/0.44 rad - all over 24 degrees
  // - and three different lengths, so nothing pairs up.
  const guns = full
    ? [
      [-1.44, 0.46, 202], [-1.02, -0.34, 246], [-0.47, 0.22, 174],
      [0.00, -0.46, 224], [0.61, 0.38, 168], [1.05, -0.12, 236],
    ]
    : [[-1.02, -0.30, 232], [0.00, 0.24, 200], [1.05, -0.10, 216]];
  for (const [yaw, pitch, len] of guns) {
    // Outboard (-X) swung by `yaw` in the horizontal and lifted by `pitch`.
    b.add('greeble', aimed(barrel({ length: len, radius: 9, brake: false, detail: D }),
      [-Math.cos(yaw), pitch, Math.sin(yaw)], [-168, 52, 0]));
  }

  // Two hoppers, on their OWN stalks, well clear of the hub and of each other.
  const hoppers = [{ x: -76, y: 96, z: -122, w: 62 }, { x: -60, y: -34, z: 116, w: 42 }];
  for (const h of hoppers) {
    b.add('greeble', aimed(G.hexStrut({ length: 74, radius: 9, axis: 'z', detail: D }),
      [h.x < -68 ? -0.8 : -0.6, h.y > 0 ? 1 : -1, h.z < 0 ? -0.9 : 0.9], [-30, 14, 0]));
    b.add('plating', G.panelledSlab({
      width: h.w, height: h.w * 0.86, depth: h.w * 0.94, chamfer: h.w * 0.16, detail: D,
    }), { pos: [h.x, h.y, h.z] });
  }

  b.lightRun([-30, 34, -70], [-30, 34, 70], [0, 1, 0], { max: 7 });

  return b.finish('port_flak_cluster');
}

registerModule({
  id: 'port_flak_cluster',
  name: 'Derelict Flak Cluster',
  hardpoint: 'port',
  tier: 1,
  faction: 'derelict',
  description: 'Six barrels up to 246 m long sprayed out of an ancient hub across a 190 degree '
    + 'fan, two of them pointing below the deck. It throws a wall of fragments at two kilometres '
    + 'and it has never once been reloaded.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 380,
  build: buildFlakCluster,
  weapon: {
    id: 'w_flak_cluster', name: 'Flak Cluster', type: 'flak',
    range: RANGE.flak, damage: 55, shotsPerBurst: 6, burstInterval: 0.12,
    cooldown: 2.0, projectileSpeed: 1300, tracking: 1.1, powerDraw: 10,
    yawWidth: Math.PI * 0.9, pitchWidth: Math.PI * 0.5, subsystemAccuracy: 0.08,
  },
  silhouetteTags: ['spiky', 'fan', 'open-trunnion', 'asymmetric', 'downward'],
});

// ---------------------------------------------------------------------------
// T3 — Coalition Heavy Broadside Battery        THE LOW, MASSIVE ONE
// ---------------------------------------------------------------------------

/**
 * The heaviest thing that fits on a sponson: an armoured shelf that reaches 400 m
 * off the ship's centreline, carrying two twin turrets in a superfiring pair, an
 * ammunition tower behind them, and a belt of plate along the outboard face.
 *
 * It is the LOW one of the three heavy broadsides. Its highest point is hull-space
 * y = +168; the gauss outrigger's LOWEST point is +42 and its rail sits at +290, so
 * the two never occupy the same band and are separable from the beam without
 * resolving a single detail. It reaches 469 m off the centreline against the hull's
 * own 198, and unlike the flak cluster every metre of that is solid mass.
 */
function buildBroadsideBattery(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Extended shelf, overhanging outboard and running past both ends of the sponson.
  b.add('hull', G.panelledSlab({ width: 224, height: 42, depth: 340, chamfer: 18, detail: D }),
    { pos: [-100, 12, 0] });
  // Outboard skirt: the shelf steps DOWN at its outer edge rather than stopping, so
  // the plan outline has a step in it and the mass reads as carried.
  b.add('plating', G.panelledSlab({ width: 66, height: 76, depth: 300, detail: D }),
    { pos: [-206, -18, 0] });
  b.graft([0, -6, 0], [-HALF_PI, 0, 0], 36);

  // Two turrets. The forward one is superfiring on a barbette - the height step is
  // what makes this read as a battery rather than as two boxes.
  const turrets = [{ z: 100, y: 82, s: 1.0 }, { z: -98, y: 44, s: 0.86 }];
  for (const t of turrets) {
    b.add('plating', G.panelledSlab({
      width: 100 * t.s, height: 52 * t.s, depth: 116 * t.s, chamfer: 15 * t.s, detail: D,
    }), { pos: [-104, t.y, t.z] });
    if (t.y > 60) {
      b.add('hull', G.pipeRun({ length: 42, radius: 54, sides: 6, axis: 'y', flanges: 0, detail: D }),
        { pos: [-104, 32, t.z] });
    }
    for (const dz of [-28 * t.s, 28 * t.s]) {
      b.add('greeble', barrel({ length: 150 * t.s, radius: 13 * t.s, detail: D }),
        { pos: [-156, t.y + 2, t.z + dz], rot: OUTBOARD });
    }
  }

  // Ammunition tower behind the turrets. Deliberately NOT the tallest thing on the
  // module: this fit's read is "low and wide" and a spire would undo it.
  b.add('hull', G.panelledSlab({ width: 58, height: 96, depth: 74, detail: D }),
    { pos: [-42, 74, -170] });

  // Armour belt along the outboard edge of the shelf.
  if (full) {
    // Two long plates, not three short ones. A calm 150 m plate with one big seam
    // in it reads at 1400 m scale; three 70 m plates read as tiling.
    b.add('plating', G.armourBelt({
      length: 316, height: 54, thickness: 16, plates: 1, gap: 34, chamfer: 10, detail: D,
    }), { pos: [-238, 14, 0] });
    // Three struts back into the sponson, because a shelf this long has to be
    // carried, and the gaps between them are sky in the plan view.
    for (const dz of [-134, 134]) {
      b.add('greeble', G.hexStrut({
        length: 168, radius: 11, axis: 'x', caps: false, detail: D,
      }), { pos: [-190, -30, dz] });
    }
  }

  b.lightRun([-22, 40, -150], [-22, 40, 150], [0, 1, 0], { max: 12 });

  return b.finish('port_broadside_battery');
}

registerModule({
  id: 'port_broadside_battery',
  name: 'Coalition Heavy Broadside',
  hardpoint: 'port',
  tier: 3,
  faction: 'coalition',
  description: 'Two twin turrets superfiring off a shelf that reaches 240 m outboard of your '
    + 'sponson, with the magazine tower behind them and belt plate along the outer edge. It adds '
    + 'two hundred metres to your beam on the side you fit it, and none of it is tall.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1560,
  build: buildBroadsideBattery,
  weapon: {
    id: 'w_heavy_broadside', name: 'Heavy Broadside', type: 'cannon',
    range: RANGE.cannon, damage: 340, shotsPerBurst: 4, burstInterval: 0.30,
    cooldown: 5.0, projectileSpeed: 1800, tracking: 0.22, powerDraw: 26,
    yawWidth: Math.PI * 0.778, pitchWidth: Math.PI * 0.16, subsystemAccuracy: 0.42,
  },
  silhouetteTags: ['superfiring', 'shelf', 'low', 'solid-slab'],
});

// ---------------------------------------------------------------------------
// T3 — Concord Gauss Outrigger        THE HIGH, THIN ONE
// ---------------------------------------------------------------------------

/**
 * A 520 m gauss rail carried on two A-frames well outboard and 210 m above the
 * sponson deck. Nothing else in the library puts a long horizontal line that high
 * on the ship's flank, which is precisely the point: fitted alongside a heavy
 * broadside it is still trivially distinguishable in silhouette, because one is a
 * line in the sky and the other is a slab at deck level.
 *
 * The rail runs past both ends of the sponson, so on a fully fitted hull the two
 * sponsons put 520 m of hard horizontal at two different heights and two different
 * z ranges down the ship's flanks - the single largest change any pair of modules
 * makes to the plan outline.
 */
function buildGaussOutrigger(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.panelledSlab({ width: 96, height: 36, depth: 260, chamfer: 12, detail: D }),
    { pos: [-30, 14, 0] });
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // Two A-frame pylons standing up and outboard. Different heights - the forward
  // one carries the muzzle end and is taller.
  const pylons = [{ z: 108, h: 216 }, { z: -104, h: 178 }];
  for (const p of pylons) {
    b.add('hull', aimed(G.taperedWedge({
      length: p.h, width0: 56, height0: 76, width1: 26, height1: 32, chamfer: 8, detail: D,
    }), [-0.60, 1, 0], [-42, 22, p.z]));
  }

  // The rail itself, running fore-and-aft, outboard and HIGH.
  b.add('plating', G.hexStrut({ length: 520, radius: 17, radiusEnd: 14, axis: 'z', detail: D }),
    { pos: [-176, 212, -222] });
  b.add('greeble', G.hexStrut({ length: 44, radius: 26, radiusEnd: 20, axis: 'z', detail: D }),
    { pos: [-176, 212, 298] });
  b.glow([-176, 212, 350], 18);

  // Two focus rings along the run.
  const rings = full ? [-64, 140] : [40];
  for (const z of rings) {
    b.add('greeble', G.dockingCollar({ radius: 32, innerRadius: 20, depth: 13, sides: 6, detail: D }),
      { pos: [-176, 212, z] });
  }

  // Capacitor blister slung under the rail between the pylons, so the gap between
  // rail and shelf is broken once rather than being one long empty rectangle.
  b.add('hull', G.panelledSlab({ width: 60, height: 44, depth: 168, chamfer: 10, detail: D }),
    { pos: [-158, 148, 4] });

  b.lightRun([-176, 238, -200], [-176, 238, 280], [0, 1, 0], { max: 12 });

  return b.finish('port_gauss_outrigger');
}

registerModule({
  id: 'port_gauss_outrigger',
  name: 'Concord Gauss Outrigger',
  hardpoint: 'port',
  tier: 3,
  faction: 'concord',
  description: 'A 520 m gauss rail on two A-frames, carried 210 m above your sponson deck and '
    + 'well outboard so it clears your own hull. Nine and a half kilometres of reach off the beam, '
    + 'and a hard horizontal line in the sky that no other fit produces.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1240,
  build: buildGaussOutrigger,
  weapon: {
    id: 'w_gauss_outrigger', name: 'Gauss Rail', type: 'rail',
    range: RANGE.rail, damage: 690, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 6.0, projectileSpeed: 5200, tracking: 0.08, powerDraw: 30,
    yawWidth: Math.PI * 0.55, pitchWidth: Math.PI * 0.10, subsystemAccuracy: 0.66,
  },
  silhouetteTags: ['outrigger', 'long-rail', 'high', 'thin'],
});
