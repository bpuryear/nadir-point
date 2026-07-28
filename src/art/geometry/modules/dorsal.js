/**
 * DORSAL MODULES — the raised barbette between the bridge tower and the casemate.
 *
 * Mount is at [0, 130, 270], sitting on a 166 x 110 m plinth whose surrounding deck
 * is 72 m BELOW the mount. Two consequences an author has to design for:
 *
 *   - a module wider than ~166 m OVERHANGS the plinth, which is good (it breaks the
 *     outline) but has to be shown to be carried: hence the down-struts on the rail
 *     battery and the missile raft. Unsupported overhang reads as a bug.
 *   - the bridge tower tops out at y = 206 and the sensor mast at y = 302, i.e.
 *     local y = 76 and y = 172. A dorsal module that stops below local y = 80 is
 *     inside the tower's outline and does nothing for the silhouette.
 *
 * The dorsal bed has near-full traverse (306 degrees), so unlike the bow these read
 * as TURRETS: ring, rotating mass, mechanism above the ring.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, barrel, aimed } from './kit.js';

const HALF_PI = Math.PI * 0.5;

// ---------------------------------------------------------------------------
// T3 — Coalition Rail Battery
// ---------------------------------------------------------------------------

/**
 * Twin 9.5 km rails in a barbette turret. The heaviest thing that can go on top of
 * the ship, and it is built to look it: a ring, a slab turret, an aft counterweight
 * that overhangs the plinth, four down-struts carrying the load into the deck, and
 * 210 m of rail sticking out over the bow.
 */
function buildRailBattery(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Barbette ring at the mount plane.
  b.graft([0, 0, 0], [-HALF_PI, 0, 0], 64);
  b.add('dark', G.pipeRun({ length: 20, radius: 58, sides: 8, axis: 'y', caps: false, detail: D }),
    { pos: [0, -2, 0] });

  // Turret body.
  b.add('hull', G.panelledSlab({ width: 122, height: 64, depth: 150, chamfer: 20, detail: D }),
    { pos: [0, 50, -6] });
  // Aft counterweight, overhanging the plinth and off-centre to port.
  b.add('plating', G.panelledSlab({ width: 86, height: 44, depth: 62, chamfer: 12, detail: D }),
    { pos: [-10, 42, -104] });

  // The rails. Long, thin, parallel: the read.
  for (const s of [-1, 1]) {
    b.add('greeble', barrel({ length: 208, radius: 11, radiusEnd: 9, detail: D }),
      { pos: [s * 30, 62, 56] });
    b.glow([s * 30, 62, 272], 9);
  }
  // Recoil cradle under the rails.
  b.add('greeble', G.panelledSlab({ width: 92, height: 14, depth: 84, detail: D }), { pos: [0, 44, 92] });

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

  // Ammunition hoist standing proud of the turret roof, to starboard.
  b.add('plating', G.panelledSlab({ width: 34, height: 46, depth: 54, chamfer: 8, detail: D }),
    { pos: [34, 100, -44] });

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
function buildSensorMast(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.panelledSlab({ width: 92, height: 26, depth: 92, chamfer: 10, detail: D }),
    { pos: [0, 10, 0] });
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
  if (full) {
    b.add('plating', G.panelledSlab({ width: 8, height: 54, depth: 34, chamfer: 3, detail: D }),
      { pos: [-40, 150, 0], rot: [0, 0, 0.34] });
    b.add('plating', G.panelledSlab({ width: 8, height: 38, depth: 26, chamfer: 3, detail: D }),
      { pos: [38, 112, 0], rot: [0, 0, -0.34] });
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
 */
function buildMissileCells(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // The raft, overhanging the plinth to both sides.
  b.add('hull', G.panelledSlab({ width: 196, height: 24, depth: 178, chamfer: 10, detail: D }),
    { pos: [0, 10, 0] });
  b.graft([0, -8, 0], [-HALF_PI, 0, 0], 42);

  // Six cells. Open at the top; you can see down into them.
  const cells = full
    ? [[-56, -50], [0, -50], [56, -50], [-56, 44], [0, 44], [56, 44]]
    : [[-56, -50], [56, -50], [0, 44]];
  for (const [x, z] of cells) {
    b.add('plating', G.hexStrut({ length: 74, radius: 25, axis: 'y', caps: false, detail: D }),
      { pos: [x, 20, z] });
    b.add('dark', G.hexStrut({ length: 68, radius: 22, axis: 'y', caps: true, detail: D }),
      { pos: [x, 18, z] });
  }

  // Two hatches, hinged open at 70 degrees. These are the parts that say "loaded".
  if (full) {
    for (const s of [-1, 1]) {
      b.add('plating', G.panelledSlab({ width: 62, height: 5, depth: 74, chamfer: 2, detail: D }),
        { pos: [s * 100, 52, -4], rot: [0, 0, -s * 1.22] });
    }
  }

  // Reload crane over the port edge — the module's asymmetry.
  b.add('greeble', G.hexStrut({ length: 110, radius: 7, axis: 'x', detail: D }),
    { pos: [-118, 96, 62], rot: [0, 0, 0.34] });
  b.add('greeble', G.panelledSlab({ width: 22, height: 26, depth: 26, detail: D }), { pos: [-42, 130, 62] });

  b.lightRun([-92, 30, -84], [-92, 30, 84], [-0.86, 0.5, 0], { max: 9 });

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
  weapon: {
    id: 'w_vls_cells', name: 'Vertical Launch Cells', type: 'missile',
    range: RANGE.missile, damage: 460, shotsPerBurst: 6, burstInterval: 0.35,
    cooldown: 12.0, projectileSpeed: 300, tracking: 0.55, powerDraw: 16,
    yawWidth: Math.PI * 2, pitchWidth: Math.PI * 0.8, subsystemAccuracy: 0.20,
  },
  silhouetteTags: ['raft', 'cell-cluster', 'wide', 'flat'],
});

// ---------------------------------------------------------------------------
// T1 — Concord Point-Defence Ring
// ---------------------------------------------------------------------------

/**
 * Four twin PD mounts on tall stalks around a ring, with a flat AESA panel standing
 * up in the middle. The stalks are what save this from being a flush disc: at 44 m
 * they read as a CROWN from every angle.
 */
function buildPDRing(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.mountPad({ radius: 76, height: 16, sides: 8, detail: D }), { pos: [0, 0, 0] });
  b.graft([0, 16, 0], [-HALF_PI, 0, 0], 72);

  // Four mounts. Not at 90 degree intervals — offset so the ring has a front.
  const mounts = full ? [0.35, 1.72, 3.30, 4.75] : [0.35, 3.30];
  for (const a of mounts) {
    const x = Math.cos(a) * 60, z = Math.sin(a) * 60;
    b.add('greeble', G.hexStrut({ length: 44, radius: 8, radiusEnd: 10, axis: 'y', detail: D }),
      { pos: [x, 10, z] });
    b.add('plating', G.panelledSlab({ width: 26, height: 18, depth: 30, chamfer: 6, detail: D }),
      { pos: [x, 62, z] });
    // Twin barrels, pointing outboard along the ring radius.
    b.add('greeble', G.panelledSlab({ width: 12, height: 6, depth: 40, detail: D }),
      { pos: [x * 1.42, 64, z * 1.42], rot: [0, HALF_PI - a, 0] });
  }

  // Central AESA panel: a flat plate standing on edge, canted forward.
  b.add('plating', G.panelledSlab({ width: 62, height: 66, depth: 9, chamfer: 4, detail: D }),
    { pos: [0, 66, 0], rot: [-0.26, 0, 0] });
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
  weapon: {
    id: 'w_pd_ring', name: 'PD Ring', type: 'pd',
    range: RANGE.pointDefence, damage: 26, shotsPerBurst: 8, burstInterval: 0.09,
    cooldown: 0.8, projectileSpeed: 2000, tracking: 3.2, powerDraw: 8,
    yawWidth: Math.PI * 2, pitchWidth: Math.PI * 0.92, subsystemAccuracy: 0.10,
  },
  silhouetteTags: ['crown', 'ring', 'stalked', 'low'],
});

// ---------------------------------------------------------------------------
// T3 — Derelict Shield Pylons
// ---------------------------------------------------------------------------

/**
 * Three pylons at angles no human would choose, holding a faceted node 190 m above
 * the deck with nothing visibly connecting it to them. This is the module that
 * makes a loadout read as SCAVENGED-FROM-SOMETHING-OLDER at a glance.
 */
function buildShieldPylons(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  // Base drum, eight sided and canted 6 degrees off the deck plane.
  b.add('hull', G.pipeRun({ length: 34, radius: 62, sides: 6, axis: 'y', flanges: 0, detail: D }),
    { pos: [0, 0, 0], rot: [0.06, 0, -0.06] });
  b.graft([0, 34, 0], [-HALF_PI, 0, 0], 46);

  // Three pylons. 0, 133 and 242 degrees, three different lengths, three different
  // splay angles. Nothing here agrees with anything else, on purpose.
  const pylons = [
    { a: 0.00, len: 178, tilt: 0.34 },
    { a: 2.32, len: 148, tilt: 0.22 },
    { a: 4.22, len: 202, tilt: 0.42 },
  ];
  for (const p of pylons) {
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    const dir = [ca * p.tilt, 1, sa * p.tilt];
    const k = p.len / Math.hypot(ca * p.tilt, 1, sa * p.tilt);
    b.add('hull', aimed(
      G.hexStrut({ length: p.len, radius: 12, radiusEnd: 4, axis: 'z', detail: D }),
      dir, [ca * 40, 26, sa * 40],
    ));
    b.glow([ca * 40 + ca * p.tilt * k, 26 + k, sa * 40 + sa * p.tilt * k], 11, [-HALF_PI, 0, 0]);
  }

  // The node: a faceted crystal suspended between the pylon tips, touching none.
  b.add('plating', G.hexStrut({ length: 62, radius: 38, radiusEnd: 6, axis: 'y', detail: D }),
    { pos: [0, 232, 0] });
  b.add('plating', aimed(G.hexStrut({ length: 58, radius: 38, radiusEnd: 5, axis: 'z', detail: D }),
    [0.07, -1, 0.05], [0, 232, 0]));
  b.glow([0, 232, 48], 34);
  b.glow([0, 232, -48], 34, [0, Math.PI, 0]);

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
