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
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE NOW TWICE THE SIZE THEY WERE
 * ---------------------------------------------------------------------------
 * The loadout-silhouette criterion bins the outline along z. The stern owns only
 * the last two bins of twenty-eight, so an engine module cannot buy length - the
 * only currency it has is CROSS SECTION, and it has to spend all of it. The hull's
 * own stern already reaches x = +/-198 over the outrigger drive pods and y = +/-96,
 * so a module that stops at 150 m across is inside an envelope that is already
 * there and contributes exactly nothing.
 *
 * The four modules are therefore separated by the SHAPE of that cross section, seen
 * from dead astern, which is the one view where an engine is the whole silhouette:
 *
 *   thruster upgrade   a WIDE LOW BAR   x +/-334, y +85..-222   four bells
 *   reactor uprate     an X             x/y +/-225 on the diagonals
 *   jump ring          a CIRCLE         x/y +/-304, open in the middle
 *   stern armour       a RECTANGLE      x +/-260, y +/-210, no holes at all
 *
 * (Measured off the built geometry in hull space. The bare hull's own stern reaches
 * x = +/-198 over the outrigger drive pods, so all four clear it.)
 *
 * A bar, a cross, a circle and a rectangle. Four shapes a player can name.
 */

import { registerModule } from '../../../core/contracts.js';
import * as G from '../greeble.js';
import {
  ModuleBuilder, MODULE_TRI_BUDGET, ringBand, aimed,
  massLoft, massFrames, massStrake,
} from './kit.js';

const HALF_PI = Math.PI * 0.5;
/** Faces a +Z-authored disc or collar aft. */
const AFT = [0, Math.PI, 0];
/** Sends a +Z-authored mass across the ship, to starboard. */
const ATHWART = [0, HALF_PI, 0];
/** The well's clear section, minus a metre of rattle room. */
const WELL = G.octProfile(51, 34, -34, 17, 10, 10);

/**
 * A SPAR IN THE HULL'S SECTION, authored from widths alone. Same construction and the
 * same reasoning as `bow.js#spar`: the depth follows from the beam at a fixed 1.72 : 1,
 * so a spar built through here cannot violate M-F4 whatever length it is given, and a
 * module that would violate it fails `massLoft`'s assertion at BUILD time - i.e. as a
 * red gate, in a stream with no browser open, rather than as a bad picture.
 *
 * Every pylon, spindle and beam in this file was a `hexStrut` or a `panelledSlab`: a
 * six-sided tube or a rectangular prism, which are the two things `kit.js`'s census
 * found forty-six and forty-one of and zero uses of the hull's own shape-makers beside.
 */
const SPAR_DEPTH = 0.58;
const spar = (len, w0, w1, mid = 0.46) => {
  const wm = (w0 + w1) * 0.52;
  const row = (z, w, k, df, fl) => [z, w, w * SPAR_DEPTH, -w * SPAR_DEPTH, k, df, fl];
  return [row(0, w0, 0.44, 0.48, 0.92), row(len * mid, wm, 0.44, 0.48, 0.92), row(len, w1, 0.42, 0.46, 0.96)];
};

// ---------------------------------------------------------------------------
// T1 — Coalition Thruster Upgrade        THE BAR
// ---------------------------------------------------------------------------

/**
 * A real main drive at last, and the Coalition builds it the Coalition way: the
 * machinery is OUTSIDE. One 172 m bell in the well, three more on a transverse beam
 * that reaches 330 m across and hangs 250 m below the axis, and the plumbing that
 * feeds them running along the outside where a fitter can get at it.
 *
 * From astern it is a WIDE LOW BAR of four circles, two to port and two on the
 * centreline and starboard. That bar is 660 m across on a hull whose own stern is
 * 396 m across, so the module is the outline rather than a swelling on it.
 */
/**
 * THE BEAM'S STATIONS, `[z, half, top, bottom, knuckle, deckFlat, flare]`, authored
 * along +Z and swung athwartships by `ATHWART`. Beam : depth 1.72-1.74 against M-F4's
 * 1.6 - and it tapers to BOTH ends, which is what a transverse beam does and what
 * `spar()` (one taper) cannot express.
 */
const DRIVE_BEAM = [
  [-310, 40, 23, -23, 0.42, 0.46, 0.94],
  [-96, 50, 29, -29, 0.45, 0.49, 0.90],
  [120, 50, 29, -29, 0.45, 0.49, 0.90],
  [310, 42, 24, -24, 0.40, 0.44, 0.96],
];

function buildThrusterUpgrade(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // The plug: fills the well exactly, so the hole reads as filled and not covered.
  b.add('hull', G.prism(WELL, -74, -2, { capFront: true, capBack: false }), null);
  b.graft([0, 0, -6], AFT, 46);

  // Main bell, mouth well aft of the hull.
  b.add('greeble', G.thrusterBell({
    throat: 50, mouth: 86, length: 108, sides: 8, collar: true, detail: D,
  }), { pos: [0, 0, -80] });
  b.glow([0, 0, -186], 70, AFT);

  // THE BEAM. One transverse spar carrying everything outboard, dropped below the
  // axis so the cluster is a bar under the stern rather than a ring around it.
  //
  // Authored along +Z and swung athwartships, exactly as `broadside.js` swings the
  // beam array's fairing, so its `half` column reads fore-aft. It was a 620 x 54 x 96
  // `panelledSlab` - and this one mass is about a third of what the astern view of
  // this module IS, so it was also about a third of why the bar read as scaffolding
  // beside a hull built from twelve-point plate.
  b.add('hull', G.place(massLoft(DRIVE_BEAM, { detail: D, label: 'drive beam' }),
    { pos: [0, -104, -132], rot: ATHWART }));
  // M-F5: two frames, 216 m apart on a 620 m spar and neither at its centre.
  b.add('plating', G.place(massFrames(DRIVE_BEAM, [-214, 2], { detail: D }),
    { pos: [0, -104, -132], rot: ATHWART }));
  // M-F6: one plate along the beam's forward face, below its own knuckle, on `dark`.
  b.add('dark', G.place(massStrake(DRIVE_BEAM, {
    z0: -280, z1: 240, side: -1, facet: [2, 1], t0: 0.12, t1: 0.64, drift: 0.14, out: 5, detail: D,
  }), { pos: [0, -104, -132], rot: ATHWART }));

  // THREE outrigger bells, not four. Two to port and one to starboard, all
  // different sizes and all at different depths: a row of four matched circles is
  // a radiator grille, and an odd count is the cheapest way to stop a cluster
  // reading as a machined part. It is also 140 triangles cheaper, which is what
  // brings the module back under the 400 ceiling.
  const pods = [
    { x: -168, y: -132, r: 46, len: 76 },
    { x: 178, y: -152, r: 40, len: 66 },
    { x: -298, y: -188, r: 34, len: 58 },
  ];
  for (const p of pods) {
    // THE BRACKET REACHES THE SPAR, whatever depth the bell is slung at. It used to
    // be a fixed p.r * 1.8 tall box centred on the bell, which works for the two
    // inboard pods and leaves the outboard one - the smallest bell at the deepest
    // hang - floating 26 m below the beam it is bolted to. `tools/silhouette.mjs`
    // found it as a 73 m detached block in the fitted carrier build's bow view.
    // Derived from the spar's own underside so it cannot drift again.
    const top = -128;                                   // 3 m inside the spar
    const h = Math.max(p.r * 1.8, top - (p.y - p.r * 0.9));
    // A drafted, canted `bevelBox` rather than a `panelledSlab`: for the same 32
    // triangles all four of its long faces come off their axes, which is M-F1's beam
    // clause and the same substitution `broadside.js` made on the casemate's outer
    // face. Each bracket leans the way its pod hangs.
    b.add('hull', G.bevelBox({
      width: p.r * 2.1, height: h, depth: 66, chamfer: 8, draft: 7,
      cant: p.x < 0 ? 0.12 : -0.10, rake: p.x < 0 ? -9 : 7, detail: D,
    }), { pos: [p.x, top - h * 0.5, -150] });
    b.add('greeble', G.thrusterBell({
      throat: p.r * 0.62, mouth: p.r, length: p.len, sides: 6, collar: false, inner: false, detail: D,
    }), { pos: [p.x, p.y, -182] });
    b.glow([p.x, p.y, -182 - p.len], p.r * 0.86, AFT);
  }

  // One fuel trunk, along the port side, outside the hull because that is where
  // it gets repaired. There is no starboard twin, and that is the faction.
  if (full) {
    b.add('greeble', G.pipeRun({ length: 300, radius: 13, sides: 6, axis: 'x', flanges: 1, detail: D }),
      { pos: [-322, -78, -118] });
  }

  b.lightRun([-300, -74, -108], [300, -74, -108], [0, 1, 0], { max: 12 });

  return b.finish('engine_thruster_upgrade');
}

registerModule({
  id: 'engine_thruster_upgrade',
  name: 'Coalition Main Drive',
  hardpoint: 'engine',
  tier: 1,
  faction: 'coalition',
  description: 'A main drive that actually fits the well, plus three mismatched outriggers on a '
    + '620 m spar slung under the stern - two to port, one to starboard. The ship has been '
    + 'limping on auxiliaries since you inherited it; this is the day that stops.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 720,
  // Measured root at the mount face 138 x 102 m; a drive uprate is a heat-rejection problem.
  fit: { footprintM: [138, 102], service: 'coolant' },
  build: buildThrusterUpgrade,
  grants: { thrust: 0.55, turnRate: 0.15 },
  silhouetteTags: ['bells', 'wide-bar', 'slung-low', 'engine'],
});

// ---------------------------------------------------------------------------
// T2 — Concord Reactor Uprate        THE X
// ---------------------------------------------------------------------------

/**
 * A fusion core in the drive well with four radiators in a cross around it. The
 * cross is the whole silhouette idea: from directly astern this is an X, and no
 * other module in the library makes an X.
 *
 * The arms now reach 225 m from the axis rather than 128. At 128 the tips landed
 * inside the hull's own 198 m half-beam over the drive pods, so the X was a
 * decoration on a stern that was already that wide; at 225 the X IS the stern.
 * The four spans are also unequal - 246 / 218 / 246 / 196 - because a Concord hull
 * is clean, not machined.
 */
/**
 * THE CORE'S STATIONS, aft face first: `pipeRun` runs 0..length from its origin, so
 * this mass occupies exactly the z the drum did, -244 (aft, where the glow is) to -76
 * (the well mouth). Beam : depth 1.71-1.74.
 */
const FUSION_CORE = [
  [-244, 52, 30, -30, 0.40, 0.44, 0.96],
  [-196, 68, 39, -39, 0.44, 0.48, 0.92],
  [-134, 70, 41, -41, 0.46, 0.50, 0.88],
  [-76, 60, 35, -35, 0.42, 0.46, 0.94],
];

function buildReactorUprate(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.prism(WELL, -70, -2, { capFront: true, capBack: false }), null);
  b.graft([0, 0, -6], AFT, 44);

  // The core, protruding a long way aft so the X has a hub.
  //
  // It was a `pipeRun` - an eight-sided TUBE 116 m in diameter with two flat ends
  // square to +-Z. The hub of the X is the one part of this module a player looks at
  // when the four radiators have told them what it is, and it was the roundest object
  // on the stern. In the hull's section it is 140 x 82 rather than 116 round: M-F4
  // wants beam : depth >= 1.6 and a drum is 1.0, so the core had to lie down to get
  // here. It reads better lying down - the X's arms are what carry the height.
  b.add('hull', massLoft(FUSION_CORE, { detail: D, label: 'fusion core' }));
  // M-F5: two frames on the core, 94 m apart, neither at its centre of length.
  b.add('plating', massFrames(FUSION_CORE, [-212, -118], { detail: D }));
  // M-F6: Concord's one long plate, on the starboard flank below the core's knuckle.
  b.add('dark', massStrake(FUSION_CORE, {
    z0: -228, z1: -92, side: 1, facet: [2, 1], t0: 0.14, t1: 0.70, drift: -0.10, out: 5, detail: D,
  }));
  b.add('plating', G.hexStrut({ length: 46, radius: 64, radiusEnd: 50, axis: 'z', detail: D }),
    { pos: [0, 0, -74], rot: AFT });
  b.glow([0, 0, -252], 52, AFT);

  // Four radiators in a cross, on the diagonals, unequal spans.
  const arms = full ? [[0.78, 246], [2.35, 218], [3.92, 246], [5.50, 196]] : [[0.78, 246], [3.92, 246]];
  for (const [a, span] of arms) {
    b.add('plating', G.radiatorFin({
      chord: 150, span, thickness: 9, sweep: -54, tipChord: 88, rim: 11, detail: D,
    }), { pos: [Math.cos(a) * 54, Math.sin(a) * 54, -248], rot: [0, 0, a - HALF_PI] });
  }

  // Two coolant towers on the plug face, unequal, standing above the X's arms so
  // the cross has a top that is not one of its own arms.
  b.add('greeble', G.pipeRun({ length: 128, radius: 20, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D }),
    { pos: [-58, 58, -190] });
  b.add('greeble', G.pipeRun({ length: 88, radius: 16, sides: 6, axis: 'z', flanges: 0, detail: D }),
    { pos: [62, 44, -160] });

  b.lightRun([0, 76, -84], [0, 76, -244], [0, 1, 0], { max: 7 });

  return b.finish('engine_reactor_uprate');
}

registerModule({
  id: 'engine_reactor_uprate',
  name: 'Concord Fusion Core',
  hardpoint: 'engine',
  tier: 2,
  faction: 'concord',
  description: 'A Concord fusion core dropped into your drive well, with the four 250 m radiators '
    + 'it needs to survive. From astern your ship becomes an X six hundred metres across.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1180,
  // Measured root at the mount face 132 x 98 m; it is reactor, and it plugs into the one already there.
  fit: { footprintM: [132, 98], service: 'reactor' },
  build: buildReactorUprate,
  grants: { powerOutput: 46, thrust: 0.18 },
  silhouetteTags: ['cross', 'radiators', 'core', 'diagonal'],
});

// ---------------------------------------------------------------------------
// T3 — Derelict Jump Drive        THE CIRCLE
// ---------------------------------------------------------------------------

/**
 * A 608 m field ring (320 m nominal radius, 304 across the flats of a ten-sided
 * band) standing off the stern on three unequal pylons, with nothing
 * inside it. It is the single most recognisable object in the library from any
 * distance and any angle, which is right: the jump drive is the module that decides
 * where a run goes.
 *
 * The ring is now wider than the hull is anywhere - 608 m against the cruiser's
 * 396 m maximum beam - and it stands 240 m clear of the transom, so at every orbit
 * angle there is a band of stars between the ring and the ship it is bolted to.
 */
function buildJumpDrive(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  b.add('hull', G.prism(WELL, -66, -2, { capFront: true, capBack: false }), null);
  b.graft([0, 0, -6], AFT, 44);

  // Central spindle out to the ring plane, as a spar rather than a six-sided tube.
  b.add('hull', aimed(massLoft(spar(190, 34, 20), { detail: D, label: 'jump spindle' }),
    [0, 0, -1], [0, 0, -70]));

  // The ring. A real band with a hole through it - you can see stars inside it.
  b.add('plating', ringBand({ outer: 320, inner: 262, z0: -26, z1: 26, sides: 8, detail: D }),
    { pos: [0, 0, -276] });

  // Three pylons from the plug out to the ring. Unequal, as always.
  const pylons = [0.3, 2.5, 4.4];
  for (let i = 0; i < pylons.length; i++) {
    const a = pylons[i];
    const ca = Math.cos(a), sa = Math.sin(a);
    const r = 288;
    // The pylons are SPARS, rolled tangential so each presents a flat plate from the
    // beam and stays edge-on-ish from astern - the astern read is a CIRCLE with
    // nothing in it, and three broad blades across it would close the hole this
    // module's whole silhouette tag set is built on.
    b.add('hull', aimed(G.place(
      massLoft(spar(316 + i * 12, 17, 11), { detail: D, label: 'jump pylon' }),
      { rot: [0, 0, a + HALF_PI] },
    ), [ca * 0.94, sa * 0.94, -1], [ca * 26, sa * 26, -66]));
    // Field emitter where the pylon meets the ring.
    b.add('greeble', G.bevelBox({
      width: 40, height: 40, depth: 44, chamfer: 8, draft: 6, cant: a, detail: D,
    }), { pos: [ca * r, sa * r, -276] });
    b.glowDir([ca * (r - 34), sa * (r - 34), -276], 38, [-ca, -sa, 0]);
  }

  // MACHINERY ON THE CIRCUMFERENCE, AND IT IS NOT DISTRIBUTED EVENLY.
  //
  // Round-one blind review: "the ring, reads as a wagon wheel ... the ring needs a
  // thickened root and asymmetric machinery on its circumference". A torus with
  // evenly spaced spokes is a wheel in every culture that has ever had wheels, and
  // three identical pylons at 17, 143 and 252 degrees are still three spokes.
  //
  // So: one 90-degree arc of the ring carries a heavy field-coil housing that steps
  // 34 m proud of the band, a second, much smaller one sits 150 degrees away, and
  // there is nothing at all on the remaining two thirds. The ring now has a TOP and
  // a BOTTOM - which a wheel does not - and the housings are at neither the pylons
  // nor halfway between them, so nothing on it divides into equal parts.
  for (const [a0, arc, depth, thick] of [[0.95, 1.55, 46, 34], [3.55, 0.0, 30, 20]]) {
    const steps = arc > 0 ? (b.full ? 3 : 2) : 1;
    for (let i = 0; i < steps; i++) {
      const a = a0 + (arc * i) / (steps - 1 || 1);
      const ca = Math.cos(a), sa = Math.sin(a);
      b.add('hull', G.bevelBox({
        width: thick, height: 62 - i * 8, depth, chamfer: 5, draft: 5, rake: 8 - i * 6, detail: D,
      }), { pos: [ca * (291 + thick * 0.4), sa * (291 + thick * 0.4), -276], rot: [0, 0, a] });
    }
  }
  // The spindle root, thickened: a collar where the spine leaves the plug, because a
  // 32 m spar coming out of a flat plate is a pin, and a pin is what makes the whole
  // assembly read as a wheel on an axle rather than as a machine.
  b.add('plating', G.hexStrut({
    length: 40, radius: 62, radiusEnd: 44, axis: 'z', caps: false, detail: D,
  }), { pos: [0, 0, -68], rot: AFT });

  if (full) {
    // Two conduits hanging off the spindle at angles that agree with nothing.
    for (const a of [1.4]) {
      b.add('greeble', aimed(G.cappedConduit({ length: 66, radius: 12, axis: 'z', detail: D }),
        [Math.cos(a), Math.sin(a), -0.4], [Math.cos(a) * 34, Math.sin(a) * 34, -164]));
    }
  }

  b.lightRun([0, 52, -24], [0, 52, -230], [0, 1, 0], { max: 8 });

  return b.finish('engine_jump_drive');
}

registerModule({
  id: 'engine_jump_drive',
  // NOTE FOR THE HARDPOINT OWNER: tier 3, and hardpoints.js caps the engine mount
  // at maxTier 2. Reported, not edited - see the stream report.
  name: 'Derelict Jump Ring',
  hardpoint: 'engine',
  tier: 3,
  faction: 'derelict',
  description: 'A 608 m field ring on three pylons, with nothing inside it and no moving parts. '
    + 'It is wider than your ship and it takes you to systems the Coalition has no charts for.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1900,
  // Measured root at the mount face 132 x 98 m; powerOutput -24: the drive charges off the reactor.
  fit: { footprintM: [132, 98], service: 'reactor' },
  build: buildJumpDrive,
  grants: { powerOutput: -24, thrust: 0.10, jumpRange: 3 },
  silhouetteTags: ['ring', 'circle', 'alien', 'see-through'],
});

// ---------------------------------------------------------------------------
// T1 — Coalition Stern Armour Belt        THE RECTANGLE
// ---------------------------------------------------------------------------

/**
 * D-list defect, quoted: "the stern is slightly bigger and nothing more."
 *
 * That was fair. The old version was a stepped transom 316 m across on a stern
 * block that is already 312 m across, i.e. a two-metre-a-side change to an outline
 * the hull already had, and it was doing it with the same rounded octagonal section
 * as everything else on the ship. Two things fix it, and neither is "make it a bit
 * wider":
 *
 *   1. IT IS A RECTANGLE. Not an octagon, not a drum, not a fan. A 520 x 420 m flat
 *      slab with square corners and a raised rim, welded over the back of the ship.
 *      Every other module in the library is round, spiky or open; this one is the
 *      only orthogonal shape in the set, and at thirty pixels a square reads as a
 *      square when a slightly-larger octagon reads as nothing at all.
 *   2. IT HAS SKIRTS. Two armour skirts sweep 300 m FORWARD along the flanks from
 *      the transom, standing 40 m proud of the hull. So the module is not only a
 *      face at the back, it is a change to the ship's PLAN outline for a fifth of
 *      its length - which is where "and nothing more" came from: the old one had no
 *      extent in z at all.
 *
 * It gives up the drive well - you cannot have this and an engine - and in exchange
 * the back of the ship becomes a wall.
 */
function buildArmourBelt(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // Plug the well flush.
  b.add('hull', G.prism(WELL, -76, -4, { capFront: true, capBack: false }), null);
  b.graft([0, 0, -8], AFT, 42);

  // THE PLATE. Square corners, deliberately: `rectProfile`, not `octProfile`.
  b.add('plating', G.loft([
    { z: -150, points: G.rectProfile(468, 372) },
    { z: -118, points: G.rectProfile(520, 420) },
    { z: -96, points: G.rectProfile(506, 408) },
  ], { capFront: true, capBack: false }), null);
  // The raised rim around it, so the flat face has an edge that takes its own value.
  b.add('hull', G.loft([
    { z: -172, points: G.rectProfile(482, 386) },
    { z: -150, points: G.rectProfile(508, 410) },
  ], { capFront: true, capBack: false }), null);

  // THE SKIRTS. Two armour runs sweeping forward along the flanks, standing proud
  // of the hull. This is the part the old module did not have.
  //
  // AND THEY ARE THE PART THAT GETS THE HULL'S EDGE TREATMENT, not the plate. The
  // transom stays a `rectProfile` loft on purpose - see the header: it is the only
  // orthogonal shape in the library and that is the whole separation from the other
  // three engine fits, so lofting it into the twelve-point section would be spending
  // this module's identity to satisfy a rule about masses. The skirts are a different
  // argument: they run 300 m FORWARD along the ship's own flanks, so they are read
  // beside the hull's plating rather than against sky, and a bare rectangular bar
  // lying on a twelve-point flank is exactly the mismatch this wave is about. Eight
  // chamfers a station, for the eight triangles `octProfile` costs over `rectProfile`.
  for (const s of [-1, 1]) {
    const skirt = (hw, top, dx, dy) => G.octProfile(hw, top, -top, hw * 0.42, top * 0.13, top * 0.13)
      .map(([x, y]) => [x + dx, y + dy]);
    b.add('plating', G.loft([
      { z: -120, points: skirt(23, 150, s * 236, -20) },
      { z: 40, points: skirt(19, 125, s * 214, -14) },
      { z: 190, points: skirt(15, 85, s * 186, -6) },
    ], { capFront: true, capBack: true }), null);
    if (full) {
      b.add('plating', G.armourBelt({
        length: 250, height: 120, thickness: 20, plates: 3, gap: 22, chamfer: 14, detail: D,
      }), { pos: [s * 248, -20, 30] });
    }
  }
  // And a cap plate across the top and bottom of the block, squaring it off. Drafted
  // and raked rather than a bare prism: the plate's job is to square off the transom
  // in the ASTERN view, and a draft on its fore-and-aft ends does not touch that
  // outline while giving the two faces the side view sees a real angle to catch.
  for (const s of [-1, 1]) {
    b.add('plating', G.bevelBox({
      width: 430, height: 30, depth: 210, chamfer: 7, draft: 6, rake: s * 8, detail: D,
    }), { pos: [0, s * 186, 10] });
  }

  if (full) {
    // Corner cleats flush with the rim, not wedges cantilevered off it: armour does
    // not stick out, it squares off. Spiky corners here made this read as the same
    // object as the derelict flak cluster at two different sizes.
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        b.add('hull', G.bevelBox({
          width: 62, height: 62, depth: 40, chamfer: 10, draft: 7, detail: D,
        }), { pos: [sx * 226, sy * 178, -140] });
      }
    }
  }
  // Two bolted blanks where the drive plumbing used to run.
  b.add('greeble', G.cappedConduit({ length: 42, radius: 19, axis: 'z', detail: D }),
    { pos: [-84, 74, -156], rot: AFT });
  b.add('greeble', G.cappedConduit({ length: 30, radius: 15, axis: 'z', detail: D }),
    { pos: [96, -64, -156], rot: AFT });

  b.lightRun([-200, 202, -110], [200, 202, -110], [0, 1, 0], { max: 11 });

  return b.finish('engine_armour_belt');
}

registerModule({
  id: 'engine_armour_belt',
  name: 'Coalition Stern Armour',
  hardpoint: 'engine',
  tier: 1,
  faction: 'coalition',
  description: 'A 520 x 420 m armour plate welded flat over your drive well, with skirts running '
    + '300 m forward along both flanks. You give up your main engine for it. Nothing that comes '
    + 'at your stern gets through, and from astern you are a rectangle.',
  triBudget: MODULE_TRI_BUDGET,
  mass: 1400,
  // Measured root at the mount face 516 x 124 m; plate stock and the repair alloy for it both live in the hold.
  fit: { footprintM: [516, 124], service: 'hold' },
  build: buildArmourBelt,
  grants: { armour: 3600, thrust: -0.12 },
  silhouetteTags: ['transom', 'rectangle', 'skirted', 'orthogonal'],
});
