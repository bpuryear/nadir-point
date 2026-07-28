/**
 * ENGINE MODULES — the main drive well.
 *
 * The bare cruiser's stern is a 108 x 72 m octagonal HOLE with nothing in it; the
 * ship limps on two auxiliary bells bolted either side of it. That hole is the most
 * legible "unfinished" cue on the hull, so an engine module has two jobs: fill it,
 * and be visible doing so.
 *
 * Mount is at [0, 0, -624] on the BACK PLATE of the well, and the well mouth is at
 * z = -700, i.e. LOCAL z = -76. Anything between local 0 and -76 is inside the hole
 * and must stay inside the 108 x 72 m section. Everything past local -76 is in open
 * space and is where the silhouette actually changes.
 */

import { registerModule } from '../../../core/contracts.js';
import * as G from '../greeble.js';
import { ModuleBuilder, MODULE_TRI_BUDGET, ringBand, aimed } from './kit.js';

const HALF_PI = Math.PI * 0.5;
/** Faces a +Z-authored disc or collar aft. */
const AFT = [0, Math.PI, 0];
/** The well's clear section, minus a metre of rattle room. */
const WELL = G.octProfile(51, 34, -34, 17, 10, 10);

// ---------------------------------------------------------------------------
// T1 — Coalition Thruster Upgrade
// ---------------------------------------------------------------------------

/**
 * A real main drive at last: one 84 m bell in the well, two smaller ones on
 * outriggers, and the plumbing that feeds them. T1, and it still changes the stern
 * from a hole into an engine.
 */
function buildThrusterUpgrade(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // The plug: fills the well exactly, so the hole reads as filled and not covered.
  b.add('hull', G.prism(WELL, -74, -2, { capFront: true, capBack: false }), null);
  b.add('trim', G.dockingCollar({ radius: 46, innerRadius: 31, depth: 8, sides: 6, detail: D }),
    { pos: [0, 0, -6], rot: AFT });

  // Main bell, mouth well aft of the hull.
  b.add('greeble', G.thrusterBell({
    throat: 46, mouth: 76, length: 92, sides: 8, collar: true, detail: D,
  }), { pos: [0, 0, -74] });
  b.glow([0, 0, -164], 62, AFT);

  // Two outrigger bells, low and splayed, on short pylons.
  for (const s of [-1, 1]) {
    b.add('hull', G.panelledSlab({ width: 42, height: 30, depth: 54, chamfer: 8, detail: D }),
      { pos: [s * 78, -34, -78] });
    b.add('greeble', G.thrusterBell({
      throat: 22, mouth: 36, length: 48, sides: 6, collar: false, detail: D,
    }), { pos: [s * 78, -34, -100] });
    b.glow([s * 78, -34, -146], 30, AFT);
    if (full) {
      b.add('greeble', G.pipeRun({ length: 76, radius: 8, sides: 6, axis: 'x', flanges: 1, detail: D }),
        { pos: [s * 16, -30, -62] });
    }
  }

  // Fuel trunks over the top of the plug.
  if (full) {
    for (const s of [-1, 1]) {
      b.add('greeble', G.pipeRun({ length: 88, radius: 9, sides: 6, axis: 'z', flanges: 0, detail: D }),
        { pos: [s * 26, 40, -94] });
    }
  }

  b.lightRun([0, 46, -20], [0, 46, -140], [0, 1, 0], { max: 7 });

  return b.finish('engine_thruster_upgrade');
}

registerModule({
  id: 'engine_thruster_upgrade',
  name: 'Coalition Main Drive',
  hardpoint: 'engine',
  tier: 1,
  faction: 'coalition',
  description: 'A main drive that actually fits the well, plus two outriggers. The ship has '
    + 'been limping on auxiliaries since you inherited it; this is the day that stops.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 720,
  build: buildThrusterUpgrade,
  grants: { thrust: 0.55, turnRate: 0.15 },
  silhouetteTags: ['bells', 'plug', 'aft-reach', 'engine'],
});

// ---------------------------------------------------------------------------
// T2 — Concord Reactor Uprate
// ---------------------------------------------------------------------------

/**
 * A fusion core in the drive well with four radiators in a cross around it. The
 * cross is the whole silhouette idea: from directly astern this is an X, and no
 * other module in the library makes an X.
 */
function buildReactorUprate(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.prism(WELL, -70, -2, { capFront: true, capBack: false }), null);
  b.add('trim', G.dockingCollar({ radius: 44, innerRadius: 29, depth: 8, sides: 6, detail: D }),
    { pos: [0, 0, -6], rot: AFT });

  // The core: a big faceted drum protruding aft.
  b.add('hull', G.pipeRun({ length: 128, radius: 50, sides: 8, axis: 'z', flanges: 0, detail: D }),
    { pos: [0, 0, -196] });
  b.add('plating', G.hexStrut({ length: 34, radius: 54, radiusEnd: 44, axis: 'z', detail: D }),
    { pos: [0, 0, -70], rot: AFT });
  b.glow([0, 0, -202], 44, AFT);

  // Four radiators in a cross. Concord runs them hot and clean.
  const fins = full ? [0, 1, 2, 3] : [0, 2];
  for (const i of fins) {
    const a = i * HALF_PI + 0.78;
    b.add('plating', G.radiatorFin({
      chord: 96, span: 118, thickness: 6, sweep: -34, tipChord: 56, detail: D,
    }), { pos: [Math.cos(a) * 34, Math.sin(a) * 34, -196], rot: [0, 0, a - HALF_PI] });
  }

  // Two coolant towers on the plug face, unequal.
  b.add('greeble', G.pipeRun({ length: 74, radius: 13, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D }),
    { pos: [-40, 30, -140] });
  b.add('greeble', G.pipeRun({ length: 52, radius: 11, sides: 6, axis: 'z', flanges: 0, detail: D }),
    { pos: [42, 26, -120] });

  b.lightRun([0, 56, -74], [0, 56, -194], [0, 1, 0], { max: 7 });

  return b.finish('engine_reactor_uprate');
}

registerModule({
  id: 'engine_reactor_uprate',
  name: 'Concord Fusion Core',
  hardpoint: 'engine',
  tier: 2,
  faction: 'concord',
  description: 'A Concord fusion core dropped into your drive well, with the four radiators it '
    + 'needs to survive. From astern your ship becomes an X.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1180,
  build: buildReactorUprate,
  grants: { powerOutput: 46, thrust: 0.18 },
  silhouetteTags: ['cross', 'radiators', 'core', 'aft-reach'],
});

// ---------------------------------------------------------------------------
// T3 — Derelict Jump Drive
// ---------------------------------------------------------------------------

/**
 * A 300 m field ring standing off the stern on three unequal pylons, with nothing
 * inside it. It is the single most recognisable object in the library from any
 * distance and any angle, which is right: the jump drive is the module that decides
 * where a run goes.
 */
function buildJumpDrive(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.add('hull', G.prism(WELL, -66, -2, { capFront: true, capBack: false }), null);
  b.add('trim', G.dockingCollar({ radius: 44, innerRadius: 29, depth: 9, sides: 6, detail: D }),
    { pos: [0, 0, -6], rot: AFT });

  // Central spindle out to the ring plane.
  b.add('hull', G.hexStrut({ length: 118, radius: 26, radiusEnd: 17, axis: 'z', detail: D }),
    { pos: [0, 0, -66], rot: AFT });

  // The ring. A real band with a hole through it — you can see stars inside it.
  b.add('plating', ringBand({ outer: 150, inner: 116, z0: -18, z1: 18, sides: 10, detail: D }),
    { pos: [0, 0, -196] });

  // Three pylons from the plug out to the ring. Unequal, as always.
  const pylons = [0.3, 2.5, 4.4];
  for (let i = 0; i < pylons.length; i++) {
    const a = pylons[i];
    const ca = Math.cos(a), sa = Math.sin(a);
    const r = 132;
    b.add('hull', aimed(
      G.hexStrut({ length: 150 + i * 8, radius: 11, radiusEnd: 8, axis: 'z', detail: D }),
      [ca * 0.86, sa * 0.86, -1], [ca * 18, sa * 18, -62],
    ));
    // Field emitter where the pylon meets the ring.
    b.add('greeble', G.panelledSlab({ width: 26, height: 26, depth: 30, chamfer: 6, detail: D }),
      { pos: [ca * r, sa * r, -196] });
    b.glowDir([ca * (r - 22), sa * (r - 22), -196], 26, [-ca, -sa, 0]);
  }

  if (full) {
    // Two conduits hanging off the spindle at angles that agree with nothing.
    for (const a of [1.4, 3.8]) {
      b.add('greeble', aimed(G.cappedConduit({ length: 44, radius: 8, axis: 'z', detail: D }),
        [Math.cos(a), Math.sin(a), -0.4], [Math.cos(a) * 24, Math.sin(a) * 24, -120]));
    }
  }

  b.lightRun([0, 40, -20], [0, 40, -160], [0, 1, 0], { max: 8 });

  return b.finish('engine_jump_drive');
}

registerModule({
  id: 'engine_jump_drive',
  // NOTE FOR THE HARDPOINT OWNER: tier 3, and hardpoints.js caps the engine mount
  // at maxTier 2. Reported, not edited — see the stream report.
  name: 'Derelict Jump Ring',
  hardpoint: 'engine',
  tier: 3,
  faction: 'derelict',
  description: 'A 300 m field ring on three pylons, with nothing inside it and no moving parts. '
    + 'It takes you to systems the Coalition has no charts for.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1900,
  build: buildJumpDrive,
  grants: { powerOutput: -24, thrust: 0.10, jumpRange: 3 },
  silhouetteTags: ['ring', 'aft-reach', 'alien', 'see-through'],
});

// ---------------------------------------------------------------------------
// T1 — Coalition Stern Armour Belt
// ---------------------------------------------------------------------------

/**
 * A stern plug and a wrap of belt armour. It gives up the drive well — you cannot
 * have this and an engine — and in exchange the back of the ship becomes a flat
 * armoured face 40 m wider than the engine block, with buttresses.
 *
 * It is the quietest module in the library in silhouette terms, and that is an
 * honest reflection of what it is: armour does not stick out, it squares off.
 */
function buildArmourBelt(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Plug the well flush.
  b.add('hull', G.prism(WELL, -76, -4, { capFront: true, capBack: false }), null);
  b.add('trim', G.dockingCollar({ radius: 42, innerRadius: 28, depth: 8, sides: 6, detail: D }),
    { pos: [0, 0, -8], rot: AFT });

  // The transom: a stepped armoured face, wider and taller than the engine block.
  b.add('plating', G.loft([
    { z: -132, points: G.octProfile(178, 104, -112, 40, 26, 30) },
    { z: -96, points: G.octProfile(186, 110, -118, 42, 28, 32) },
    { z: -78, points: G.octProfile(168, 96, -104, 38, 24, 28) },
  ], { capFront: true, capBack: false }), null);

  // Belt plates wrapping the block's flanks, standing proud of it.
  for (const s of [-1, 1]) {
    b.add('plating', G.armourBelt({
      length: 150, height: 96, thickness: 16, plates: full ? 3 : 2, gap: 16, chamfer: 12, detail: D,
    }), { pos: [s * 168, 0, -20] });
  }
  // And across the top and bottom of the block.
  for (const s of [-1, 1]) {
    b.add('plating', G.armourBelt({
      length: 140, height: 90, thickness: 14, plates: full ? 2 : 1, gap: 18, chamfer: 10, detail: D,
    }), { pos: [0, s * 92, -20], rot: [0, 0, HALF_PI] });
  }

  // Four buttresses off the transom corners, which is what stops it reading flat.
  if (full) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        b.add('hull', aimed(
          G.taperedWedge({ length: 76, width0: 40, height0: 40, width1: 14, height1: 14, detail: D }),
          [sx * 0.62, sy * 0.5, -1], [sx * 128, sy * 74, -74],
        ));
      }
    }
  }
  // Two bolted blanks where the drive plumbing used to run.
  b.add('greeble', G.cappedConduit({ length: 30, radius: 13, axis: 'z', detail: D }),
    { pos: [-56, 46, -132], rot: AFT });
  b.add('greeble', G.cappedConduit({ length: 22, radius: 11, axis: 'z', detail: D }),
    { pos: [64, -40, -132], rot: AFT });

  b.lightRun([-96, 108, -100], [96, 108, -100], [0, 1, 0], { max: 10 });

  return b.finish('engine_armour_belt');
}

registerModule({
  id: 'engine_armour_belt',
  name: 'Coalition Stern Armour',
  hardpoint: 'engine',
  tier: 1,
  faction: 'coalition',
  description: 'Belt armour and a stepped transom welded over the drive well. You give up your '
    + 'main engine for it. Nothing that comes at your stern gets through.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1400,
  build: buildArmourBelt,
  grants: { armour: 3600, thrust: -0.12 },
  silhouetteTags: ['transom', 'squared-stern', 'belted', 'wide'],
});
