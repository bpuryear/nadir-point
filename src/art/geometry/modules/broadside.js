/**
 * BROADSIDE MODULES — the port sponson shelf.
 *
 * PORT ONLY. Every module in this file is authored looking outboard along -X with
 * its baseplate at y = 0, exactly as hardpoints.js §3 requires, and the attachment
 * system mirrors it when the player fits it to the starboard sponson. There is no
 * starboard copy of anything here and there must never be one: a hand-authored
 * mirror is a second thing to keep in sync and it will drift.
 *
 * Mount is at [-152, 22, 48] on top of a 76 x 220 m shelf. The cruiser's own
 * outboard handrail runs along x = -184 between y = 66 and y = 77 (local y 44..55),
 * so mass that crosses that plane belongs either below local y = 40 or above local
 * y = 60. The barrels on all five of these sit below it.
 *
 * Broadside is the cruiser's natural fighting position (140 degree arc centred on
 * the beam), so these are the modules that decide what the ship's fight looks like,
 * and they are the ones most visible in a top-down silhouette.
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

  b.add('hull', G.panelledSlab({ width: 88, height: 38, depth: 178, chamfer: 12, detail: D }),
    { pos: [-26, 16, 0] });
  b.add('plating', G.panelledSlab({ width: 56, height: 34, depth: 126, chamfer: 10, detail: D }),
    { pos: [-84, 26, -4] });
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // Four barrels. Evenly spaced, because Coalition gunnery is a production line.
  const rows = full ? [-54, -18, 18, 54] : [-42, 30];
  for (const z of rows) {
    b.add('greeble', barrel({ length: 92, radius: 8, detail: D }), { pos: [-104, 26, z], rot: OUTBOARD });
  }

  // Ammunition hoist, aft and raised: the module's only asymmetry.
  b.add('hull', G.panelledSlab({ width: 40, height: 46, depth: 48, chamfer: 8, detail: D }),
    { pos: [-46, 46, -96] });
  if (full) {
    b.add('greeble', G.pipeRun({ length: 66, radius: 8, sides: 6, axis: 'z', flanges: 1, detail: D }),
      { pos: [-70, 44, -72] });
  }

  b.lightRun([-24, 38, -78], [-24, 38, 82], [0, 1, 0], { max: 9 });

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
  silhouetteTags: ['barrel-row', 'boxy', 'overhanging', 'broadside'],
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
    length: 124, width0: 168, height0: 52, width1: 84, height1: 30, chamfer: 10, detail: D,
  }), { pos: [-4, 20, 0], rot: OUTBOARD });
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // Three emitter rods, staggered fore-aft and in height so they never read as a
  // grille. The middle one is longest.
  const rods = full ? [[-56, 10, 118], [2, 28, 152], [58, 10, 118]] : [[2, 28, 152]];
  for (const [z, y, len] of rods) {
    b.add('greeble', G.hexStrut({ length: len, radius: 9, radiusEnd: 6, axis: 'z', detail: D }),
      { pos: [-116, y, z], rot: OUTBOARD });
    b.glow([-116 - len - 8, y, z], 11, OUTBOARD);
  }

  // Two radiators, laid back over the fairing rather than standing up like fins.
  // Upright plates here read as tail surfaces, which is an aircraft cue and wrong
  // for a broadside mount; laid back they read as what they are, heat rejection.
  for (const s of [-1, 1]) {
    b.add('plating', G.radiatorFin({
      chord: 62, span: 52, thickness: 5, sweep: -26, tipChord: 32, detail: D,
    }), { pos: [-40, 40, s * 58], rot: [0, 0, 0.78] });
  }

  b.lightRun([-30, 50, -78], [-30, 50, 78], [0, 1, 0], { max: 9 });

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
  silhouetteTags: ['fairing', 'emitter-rods', 'finned', 'sleek'],
});

// ---------------------------------------------------------------------------
// T1 — Derelict Flak Cluster
// ---------------------------------------------------------------------------

/**
 * A canted drum with six short barrels sprayed out of it at angles that do not
 * divide a circle, plus two ammunition hoppers of different sizes. Reads as a
 * BURST from any angle - the outline is spiky where every other broadside is flat.
 */
function buildFlakCluster(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);
  b.add('hull', G.panelledSlab({ width: 74, height: 30, depth: 132, chamfer: 10, detail: D }),
    { pos: [-24, 12, 0] });
  // The drum, canted out and up.
  b.add('hull', G.pipeRun({ length: 76, radius: 40, sides: 6, axis: 'x', flanges: 0, detail: D }),
    { pos: [-116, 42, 0], rot: [0, 0, 0.22] });

  // Six barrels. Splayed across a 150 degree fan, three lengths, and LONG.
  //
  // At 52-66 m the barrels barely cleared the drum and the module's outline was a
  // lumpy box - which is also what the Coalition stern armour was. The fan is the
  // whole class read, so it has to be the dominant thing in the outline: these run
  // out to 104 m, nearly the width of the shelf they sit on, and no two adjacent
  // barrels are the same length. Spiky where every other broadside is flat.
  const guns = full
    ? [[-0.98, 0.34, 88], [-0.40, -0.18, 104], [0.14, 0.44, 72], [0.68, -0.08, 98], [1.18, 0.26, 78], [-1.52, -0.3, 84]]
    : [[-0.6, 0.2, 92], [0.5, 0.1, 92]];
  for (const [yaw, pitch, len] of guns) {
    // Outboard (-X) swung by `yaw` in the horizontal and lifted by `pitch`.
    b.add('greeble', aimed(barrel({ length: len, radius: 7, brake: false, detail: D }),
      [-Math.cos(yaw), pitch, Math.sin(yaw)], [-124, 42, 0]));
  }

  // Two hoppers, deliberately unequal.
  b.add('plating', G.panelledSlab({ width: 44, height: 40, depth: 44, chamfer: 8, detail: D }),
    { pos: [-56, 40, -74] });
  b.add('plating', G.panelledSlab({ width: 30, height: 26, depth: 30, chamfer: 6, detail: D }),
    { pos: [-44, 34, 70] });

  b.lightRun([-24, 30, -60], [-24, 30, 60], [0, 1, 0], { max: 7 });

  return b.finish('port_flak_cluster');
}

registerModule({
  id: 'port_flak_cluster',
  name: 'Derelict Flak Cluster',
  hardpoint: 'port',
  tier: 1,
  faction: 'derelict',
  description: 'Six short barrels sprayed out of an ancient drum across a 130 degree fan. It '
    + 'throws a wall of fragments at two kilometres and it has never once been reloaded.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 380,
  build: buildFlakCluster,
  weapon: {
    id: 'w_flak_cluster', name: 'Flak Cluster', type: 'flak',
    range: RANGE.flak, damage: 55, shotsPerBurst: 6, burstInterval: 0.12,
    cooldown: 2.0, projectileSpeed: 1300, tracking: 1.1, powerDraw: 10,
    yawWidth: Math.PI * 0.9, pitchWidth: Math.PI * 0.5, subsystemAccuracy: 0.08,
  },
  silhouetteTags: ['spiky', 'fan', 'drum', 'asymmetric'],
});

// ---------------------------------------------------------------------------
// T3 — Coalition Heavy Broadside Battery
// ---------------------------------------------------------------------------

/**
 * The heaviest thing that fits on a sponson: an extended armoured shelf carrying
 * two twin turrets in superfiring pairs, an ammunition tower behind them, and a
 * belt of armour plate along the outboard face. It doubles the ship's beam on the
 * side it is fitted to, and from above it is unmistakable.
 */
function buildBroadsideBattery(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Extended shelf, overhanging outboard and running past both ends of the sponson.
  b.add('hull', G.panelledSlab({ width: 132, height: 34, depth: 254, chamfer: 14, detail: D }),
    { pos: [-52, 14, 0] });
  b.graft([0, -6, 0], [-HALF_PI, 0, 0], 36);

  // Two turrets. The forward one is superfiring on a barbette - the height step is
  // what makes this read as a battery rather than as two boxes.
  const turrets = [{ z: 74, y: 62, s: 1.0 }, { z: -72, y: 34, s: 0.86 }];
  for (const t of turrets) {
    b.add('plating', G.panelledSlab({
      width: 72 * t.s, height: 40 * t.s, depth: 86 * t.s, chamfer: 12 * t.s, detail: D,
    }), { pos: [-70, t.y, t.z] });
    if (t.y > 40) {
      b.add('hull', G.pipeRun({ length: 30, radius: 40, sides: 6, axis: 'y', flanges: 0, detail: D }),
        { pos: [-70, 28, t.z] });
    }
    for (const dz of [-20 * t.s, 20 * t.s]) {
      b.add('greeble', barrel({ length: 104 * t.s, radius: 10 * t.s, detail: D }),
        { pos: [-104, t.y + 2, t.z + dz], rot: OUTBOARD });
    }
  }

  // Ammunition tower behind the turrets, breaking the outline upward.
  b.add('hull', G.panelledSlab({ width: 44, height: 84, depth: 56, chamfer: 10, detail: D }),
    { pos: [-30, 62, -128] });

  // Armour belt along the outboard edge of the shelf.
  if (full) {
    // Two long plates, not three short ones. A calm 100 m plate with one big seam
    // in it reads at 1400 m scale; three 70 m plates read as tiling.
    b.add('plating', G.armourBelt({
      length: 236, height: 40, thickness: 12, plates: 2, gap: 26, chamfer: 8, detail: D,
    }), { pos: [-118, 12, 0] });
    // Two struts back into the sponson, because a shelf this long has to be carried.
    for (const dz of [-96, 96]) {
      b.add('greeble', G.hexStrut({ length: 52, radius: 8, axis: 'x', detail: D }), { pos: [-104, -12, dz] });
    }
  }

  b.lightRun([-16, 34, -112], [-16, 34, 112], [0, 1, 0], { max: 12 });

  return b.finish('port_broadside_battery');
}

registerModule({
  id: 'port_broadside_battery',
  name: 'Coalition Heavy Broadside',
  hardpoint: 'port',
  tier: 3,
  faction: 'coalition',
  description: 'Two twin turrets superfiring off an extended armoured shelf, with the magazine '
    + 'tower behind them. It adds 130 m to your beam on the side you fit it.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1560,
  build: buildBroadsideBattery,
  weapon: {
    id: 'w_heavy_broadside', name: 'Heavy Broadside', type: 'cannon',
    range: RANGE.cannon, damage: 340, shotsPerBurst: 4, burstInterval: 0.30,
    cooldown: 5.0, projectileSpeed: 1800, tracking: 0.22, powerDraw: 26,
    yawWidth: Math.PI * 0.778, pitchWidth: Math.PI * 0.16, subsystemAccuracy: 0.42,
  },
  silhouetteTags: ['superfiring', 'shelf', 'tower', 'wide'],
});

// ---------------------------------------------------------------------------
// T3 — Concord Gauss Outrigger
// ---------------------------------------------------------------------------

/**
 * A 330 m gauss rail carried on two A-frames well outboard and well above the
 * sponson. Nothing else in the library puts a long horizontal line high on the
 * ship's flank, which is precisely the point: fitted alongside a heavy broadside
 * it is still trivially distinguishable in silhouette.
 */
function buildGaussOutrigger(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.panelledSlab({ width: 74, height: 30, depth: 196, chamfer: 10, detail: D }),
    { pos: [-22, 12, 0] });
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // Two A-frame pylons standing up and outboard. Different heights - the forward
  // one carries the muzzle end and is taller.
  const pylons = [{ z: 76, h: 122 }, { z: -70, h: 98 }];
  for (const p of pylons) {
    b.add('hull', aimed(G.taperedWedge({
      length: p.h, width0: 40, height0: 56, width1: 22, height1: 26, chamfer: 6, detail: D,
    }), [-0.62, 1, 0], [-30, 20, p.z]));
  }

  // The rail itself, running fore-and-aft, outboard and high.
  b.add('plating', G.hexStrut({ length: 336, radius: 13, radiusEnd: 11, axis: 'z', detail: D }),
    { pos: [-116, 118, -142] });
  b.add('greeble', G.hexStrut({ length: 30, radius: 19, radiusEnd: 15, axis: 'z', detail: D }),
    { pos: [-116, 118, 194] });
  b.glow([-116, 118, 230], 13);

  // Two focus rings along the run.
  const rings = full ? [-42, 96] : [30];
  for (const z of rings) {
    b.add('greeble', G.dockingCollar({ radius: 24, innerRadius: 15, depth: 10, sides: 6, detail: D }),
      { pos: [-116, 118, z] });
  }

  // Capacitor blister slung under the rail between the pylons.
  b.add('hull', G.panelledSlab({ width: 46, height: 34, depth: 118, chamfer: 8, detail: D }),
    { pos: [-104, 74, 4] });

  b.lightRun([-116, 138, -130], [-116, 138, 170], [0, 1, 0], { max: 12 });

  return b.finish('port_gauss_outrigger');
}

registerModule({
  id: 'port_gauss_outrigger',
  name: 'Concord Gauss Outrigger',
  hardpoint: 'port',
  tier: 3,
  faction: 'concord',
  description: 'A 330 m gauss rail on two A-frames, carried outboard and above the sponson so '
    + 'it clears your own hull. Nine and a half kilometres of reach off the beam.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1240,
  build: buildGaussOutrigger,
  weapon: {
    id: 'w_gauss_outrigger', name: 'Gauss Rail', type: 'rail',
    range: RANGE.rail, damage: 690, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 6.0, projectileSpeed: 5200, tracking: 0.08, powerDraw: 30,
    yawWidth: Math.PI * 0.55, pitchWidth: Math.PI * 0.10, subsystemAccuracy: 0.66,
  },
  silhouetteTags: ['outrigger', 'long-rail', 'raised', 'thin'],
});
