/**
 * BROADSIDE MODULES — the port sponson shelf.
 *
 * PORT ONLY. Every module in this file is authored looking outboard along -X with
 * its baseplate at y = 0, exactly as hardpoints.js §3 requires, and the attachment
 * system mirrors it when the player fits it to the starboard sponson. There is no
 * starboard copy of anything here and there must never be one: a hand-authored
 * mirror is a second thing to keep in sync and it will drift.
 *
 * Mount is at [-158, 46, 60] - moved from [-156, 46, 130] so the sponson shelf sits
 * over the salvage cradle's second transverse frame instead of bridging the 76 m of
 * clear background between hull flank and bay rail - and the seating adds a 7 m
 * service gap outboard, so
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
 *
 * ---------------------------------------------------------------------------
 * EVERY PRIMARY MASS IN THIS FILE IS NOW A LOFT OF THE HULL'S OWN SECTION
 * ---------------------------------------------------------------------------
 * They were `panelledSlab`s - rectangular prisms, 100% of their surface area within
 * five degrees of a cardinal axis - bolted to a hull that had just spent five thousand
 * triangles becoming a twelve-point plate family. That mismatch is what "trash strewn
 * on a decent hull" measures: a broadside module spans about 30% of the ship's
 * silhouette and carried about 7% of its triangles, and the eye reads density.
 *
 * So each of the five gets `massLoft` - the same `facetProfile` the hull is lofted
 * from, six large planes a side, a knuckle at 80.8 degrees - plus `massFrames` at the
 * hull's 90-140 m structural rhythm, a `massStrake` cut from the mass's own section
 * with `dark` below the knuckle and `plating` above, and a `massRecess` for the
 * machinery to sit IN rather than on. See `kit.js`.
 *
 * The mechanism is untouched. Barrels, rails, emitter rods and the flak fan are what
 * separates these five from each other and they are all still exactly where they were;
 * what changed is what they come OUT of. `BUDGET.moduleTris` is 1200, the worst module
 * in the library was 398, and this file had not spent one of the eight hundred free
 * triangles that the hull redesign authorised.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import {
  ModuleBuilder, MODULE_TRI_BUDGET, barrel, aimed, muzzleAlong,
  massLoft, massFrames, massStrake, massRecess,
} from './kit.js';

const HALF_PI = Math.PI * 0.5;
/** Rotation that sends a +Z-authored primitive outboard to port. */
const OUTBOARD = [0, -HALF_PI, 0];
/** …and the direction that rotation actually sends +Z, for `muzzleAlong`. */
const OUTBOARD_DIR = [-1, 0, 0];

/**
 * A SPAR IN THE HULL'S SECTION, from widths alone. Same construction and reasoning as
 * `bow.js#spar`: depth follows the beam at a fixed 1.72 : 1, so a spar built through
 * here cannot violate M-F4 whatever length it is given. The four modules this file
 * rebuilt last wave got their primary masses; the flak cluster got nothing, and its
 * arms and stalks were the `hexStrut`s this replaces.
 */
const SPAR_DEPTH = 0.58;
const spar = (len, w0, w1, mid = 0.46) => {
  const wm = (w0 + w1) * 0.52;
  const row = (z, w, k, df, fl) => [z, w, w * SPAR_DEPTH, -w * SPAR_DEPTH, k, df, fl];
  return [row(0, w0, 0.44, 0.48, 0.92), row(len * mid, wm, 0.44, 0.48, 0.92), row(len, w1, 0.42, 0.46, 0.96)];
};

// ---------------------------------------------------------------------------
// T1 — Coalition Cannon Bank
// ---------------------------------------------------------------------------

/**
 * THE FOUR GUNS, as `[z, length, x]` — the echeloned staircase described below.
 * Hoisted to module scope because the ModuleDef's `muzzles` are computed from these
 * same three numbers per gun, so a barrel that moves takes its muzzle with it.
 *
 * The LOD1 pair is a SEPARATE table and is deliberately not what `muzzles` reads:
 * the declared muzzle list is the LOD0 set at every quality level (see kit.js).
 */
const CANNON_ROWS = [[-66, 70, -106], [-22, 90, -114], [22, 110, -122], [66, 130, -130]];
/** The casemate's own station table, `[z, half, top, bottom]`, at module x -38. */
const CASEMATE = [[-105, 46, -30, -66], [-34, 56, -24, -72], [40, 56, -24, -72], [105, 48, -28, -68]];
const CANNON_ROWS_LOD1 = [[-52, 80, -110], [36, 120, -126]];
/** Barrels are canted 15 degrees down and struck outboard from y = -58. */
const CANNON_AIM = [-1, -0.27, 0];
const CANNON_BREECH_Y = -58;

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
  // THE CASEMATE, in the hull's own section. `[z, half, top, bottom]` - beam : depth
  // 2.3 at the middle and 2.5 at the ends, against M-F4's 1.6.
  b.add('hull', G.place(massLoft(CASEMATE, { detail: D, label: 'casemate' }), { pos: [-38, 0, 0] }));
  // M-F5: two frames, 108 m apart and off-centre, so the 210 m mass reads as 210 m.
  b.add('plating', G.place(massFrames(CASEMATE, [-66, 42], { detail: D }), { pos: [-38, 0, 0] }));
  // M-F6 / F10: one plate on the lower flank, `dark`, stopping at the knuckle.
  b.add('dark', G.place(massStrake(CASEMATE, {
    z0: -88, z1: 74, side: -1, facet: [2, 1], t0: 0.12, t1: 0.66, drift: 0.14, out: 4, detail: D,
  }), { pos: [-38, 0, 0] }));
  // The outer casemate face, skewed in plan so it agrees with the gun steps. A
  // `bevelBox` rather than a slab: drafted ends and a canted section put all four of
  // its long faces off their axes for 32 triangles (M-F1's beam clause).
  b.add('plating', G.bevelBox({
    width: 92, height: 46, depth: 168, chamfer: 12, draft: 9, cant: 0.13, rake: -8, detail: D,
  }), { pos: [-100, -60, -4], rot: [0, 0.40, 0] });
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
  // THE BARRELS COME OUT OF THE CASEMATE, not off the end of it. Each root used to
  // sit three metres outboard of the face it was supposed to be mounted in, which is
  // invisible in a shaded render and reads in PLAN as four bars floating beside the
  // ship (tools/silhouette.mjs, top view - and the old rasteriser hid it by stamping
  // an edge-on facet's whole bounding box). Every root is now buried 14 m inside the
  // face, which is also how a casemate works: the gun is IN the box.
  const rows = full ? CANNON_ROWS : CANNON_ROWS_LOD1;
  for (const [z, len, x] of rows) {
    b.add('greeble', aimed(barrel({ length: len, radius: 10, detail: D }),
      CANNON_AIM, [x, CANNON_BREECH_Y, z]));
  }

  // M-F7: the loading gear sits IN a cut, not on a proud face. A recess 20 m deep
  // self-shadows; a greeble band on a flat does not, under any key.
  b.add('dark', G.place(massRecess(CASEMATE, {
    z: -18, side: -1, facet: [2, 3], t: 0.46, width: 86, height: 30, depth: 20, wall: 4, detail: D,
  }), { pos: [-38, 0, 0] }));

  // Ammunition hoist. It is the one part that stands ABOVE the shelf, so the module
  // still reads as attached to something rather than as a pod in space.
  b.add('hull', G.bevelBox({
    width: 52, height: 58, depth: 60, chamfer: 10, draft: 7, cant: -0.11, detail: D,
  }), { pos: [-62, 24, -118] });
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
  // Four muzzles for four shots, stepping 28 m further outboard and 44 m further
  // forward each time — so the ripple visibly walks up the staircase.
  muzzles: CANNON_ROWS.map(([z, len, x]) => muzzleAlong([x, CANNON_BREECH_Y, z], CANNON_AIM, len)),
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
 * The three emitter rods as `[z, y, length]`. THE MIDDLE ONE IS INDEX 1 AND IT IS
 * THE FIRING ROD — see the `muzzles` note on the def below.
 */
const BEAM_RODS = [[-74, 12, 168], [2, 36, 216], [76, 12, 168]];
/** The fairing's stations, `[z, half, top, bottom]`, authored along +Z then swung. */
const FAIRING = [[0, 112, 32, -32], [96, 88, 27, -25], [168, 55, 19, -17]];
/** At LOD1/2 only the long middle rod is built. Same rod, so the aperture is stable. */
const BEAM_RODS_LOD1 = [BEAM_RODS[1]];
/** The rod's root is at x = -186 and it runs outboard; the aperture sits 8 m proud. */
const beamAperture = ([z, y, len]) => [-162 - len - 8, y, z];

/**
 * A ceramic fairing with three staggered emitter rods and a pair of swept radiators
 * over the top. Concord's whole language: one clean primary form, very few parts,
 * and the mechanism kept thin.
 */
function buildBeamArray(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // THE FAIRING, authored along +Z and swung outboard, so its `half` column is
  // fore-aft. A three-station `massLoft` where a two-station `taperedWedge` was: one
  // clean primary form is Concord's whole language, and a lofted one is still one
  // form - it just shades like the hull instead of like a doorstop. Beam : depth runs
  // 3.5 at the root to 3.1 at the tip.
  b.add('hull', G.place(massLoft(FAIRING, { detail: D, label: 'beam fairing' }),
    { pos: [-4, 22, 0], rot: OUTBOARD }));
  // M-F5, and on this module they are the cooling ribs. Two, unevenly placed.
  b.add('plating', G.place(massFrames(FAIRING, [58, 128], { detail: D }),
    { pos: [-4, 22, 0], rot: OUTBOARD }));
  // M-F6. Concord gets ONE long plate rather than Coalition's several short ones.
  b.add('dark', G.place(massStrake(FAIRING, {
    z0: 14, z1: 156, side: 1, facet: [2, 1], t0: 0.14, t1: 0.70, drift: -0.10, out: 4, detail: D,
  }), { pos: [-4, 22, 0], rot: OUTBOARD }));
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 34);

  // THE EMITTER HOUSING, and it is the difference between three rods and a hairbrush.
  //
  // The fairing tapers from 224 m fore-aft at its root to 110 m at its outboard end,
  // and the two outer rods sit at z = -74 and +76 - i.e. OUTSIDE the taper by the
  // time it reaches them. So they left the fairing through thin air, and in plan the
  // module was a wedge with two detached sticks beside it. Round-one review made the
  // general form of this complaint about the whole module vocabulary: "fair every
  // primitive into structure ... the lance needs a recoil cradle and a mount collar".
  // This is that collar: a 208 m transverse block across the fairing's outboard end
  // that all three rods are seated in, so the mechanism emerges from a housing.
  // 84 x 52 rather than 44 x 76: M-F4 wants beam : depth >= 1.6 on any mass over 80 m
  // long and this one is 208, so a housing that was taller than it was wide had to
  // turn over. It also reads better - a collar a gun sits IN is wide.
  b.add('plating', G.bevelBox({
    width: 84, height: 52, depth: 208, chamfer: 12, draft: 10, cant: -0.12, detail: D,
  }), { pos: [-178, 20, 0] });

  // Three emitter rods, staggered fore-aft and in height so they never read as a
  // grille. The middle one is longest.
  const rods = full ? BEAM_RODS : BEAM_RODS_LOD1;
  for (const rod of rods) {
    const [z, y, len] = rod;
    b.add('greeble', G.hexStrut({ length: len, radius: 11, radiusEnd: 7, axis: 'z', detail: D }),
      { pos: [-186, y, z], rot: OUTBOARD });
    b.glow(beamAperture(rod), 13, OUTBOARD);
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
  // ONE muzzle, because `shotsPerBurst` is 1. This module is the reason the muzzle
  // list is data on the def rather than a count of glow discs on the built mesh: it
  // draws THREE apertures at LOD0 and ONE at LOD1/2, so a mesh-derived emitter count
  // would be 3 on a high-quality client and 1 on a low-quality one, and a seeded
  // replay would diverge between two players watching the same fight. The rod that
  // fires is the long middle one — the only one that exists at every LOD.
  muzzles: [beamAperture(BEAM_RODS[1])],
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
 *
 * ---------------------------------------------------------------------------
 * AND THEN THE OPENING-OUT WENT TOO FAR: THE MODULE CAME APART.
 * ---------------------------------------------------------------------------
 * `tools/silhouette.mjs` rasterises the fitted outline and counts 4-connected
 * components, and on this module it counted FOUR. The hub, all six barrels, and
 * both hoppers were floating clear of the ship with nothing touching them:
 *
 *   - the trunnion arms SPLAYED outboard (dz = +-0.28 per unit of reach) from
 *     roots at z +-44, so they finished at z +-78 while the hub they were meant to
 *     carry ended at z +-30. Forty-eight metres of clear sky at the joint.
 *   - the barrels were struck from x = -168; the hub's outboard face is at -158.
 *   - each hopper stalk was a fixed 74 m long aimed at a box 129-154 m away, so
 *     both stopped roughly fifty metres short of the thing they were holding up.
 *
 * None of the existing audits could see it. `modules/audit.mjs` bins the outline
 * along z and records a top/bottom envelope per bin, and a detached part lands in
 * the same bin as the hull and simply widens that bin's range - it scores as MORE
 * silhouette. `probes/cruiser.js#floatingParts` runs a union-find over PART bounding
 * boxes, and every one of these pieces is merged into a per-surface mesh whose box
 * spans the whole module. It took rasterising the black shape a reviewer actually
 * looks at.
 *
 * The rule this now holds itself to, and the reason the two stalk lengths below are
 * COMPUTED rather than typed: a strut's length is the distance to the thing it
 * carries, minus a bite into it. A number typed by hand is a number that stops
 * being right the first time either end moves.
 */

/** Six barrels as `[yaw, pitch, length]` across a 190 degree fan. LOD0 set. */
const FLAK_GUNS = [
  [-1.44, 0.46, 202], [-1.02, -0.34, 246], [-0.47, 0.22, 174],
  [0.00, -0.46, 224], [0.61, 0.38, 168], [1.05, -0.12, 236],
];
const FLAK_GUNS_LOD1 = [[-1.02, -0.30, 232], [0.00, 0.24, 200], [1.05, -0.10, 216]];
/** Every barrel is struck from INSIDE the hub, not off its outboard face. */
const FLAK_BREECH = [-150, 52, 0];
const flakAim = (yaw, pitch) => [-Math.cos(yaw), pitch, Math.sin(yaw)];

function buildFlakCluster(ctx) {
  const b = new ModuleBuilder(ctx, 'derelict');
  const D = b.detail, full = b.full;

  // The torn baseplate, 46 m rather than 34: it has to be wide enough in z for the
  // trunnion roots to sit ON it, which is what the 34 m plate was not.
  b.graft([0, -4, 0], [-HALF_PI, 0, 0], 46);

  // TWO TRUNNION ARMS, not a casemate. The gap between them is the first hole, and
  // they CONVERGE - 88 m apart at the plate, 39 m apart where they take the hub.
  // Splayed arms and a narrow hub is the geometry of a thing that has fallen off.
  //
  // They are SPARS now, rolled a quarter turn so the blade stands on edge: the whole
  // point of this pair is the sky between them, and a spar lying flat would spend its
  // 36 m of beam closing the gap it exists to open. On edge it is 21 m thick in z and
  // the 88 -> 39 m hole is untouched.
  for (const s of [-1, 1]) {
    b.add('hull', aimed(G.place(
      massLoft(spar(132, 18, 13), { detail: D, label: 'trunnion arm' }), { rot: [0, 0, HALF_PI] },
    ), [-1, 0.34, -s * 0.20], [-16, 4, s * 44]));
  }

  // The hub: small, canted, and hung out in space on the arms. Authored along +Z and
  // aimed outboard, so it spans x -158..-96 exactly as the `pipeRun` did and the arms
  // still land at -139. 72 across by 42 deep rather than 60 round - the derelicts
  // built it, but the crew that cut it free owned one torch and it shows.
  b.add('hull', G.place(aimed(massLoft([
    [0, 30, 18, -18, 0.44, 0.48, 0.92],
    [22, 36, 21, -21, 0.46, 0.50, 0.88],
    [62, 32, 19, -19, 0.42, 0.46, 0.94],
  ], { detail: D, label: 'flak hub' }), [1, 0, 0], [-158, 52, 0]), { rot: [0, 0, 0.26] }));

  // Six barrels across a 190 degree fan in yaw and a 60 degree spread in pitch.
  // Adjacent yaw separations are 0.42/0.55/0.47/0.61/0.44 rad - all over 24 degrees
  // - and three different lengths, so nothing pairs up.
  const guns = full ? FLAK_GUNS : FLAK_GUNS_LOD1;
  for (const [yaw, pitch, len] of guns) {
    // Outboard (-X) swung by `yaw` in the horizontal and lifted by `pitch`. Struck
    // from INSIDE the hub barrel (x -150, against its -158..-96 run) rather than
    // ten metres off its outboard face.
    b.add('greeble', aimed(barrel({ length: len, radius: 9, brake: false, detail: D }),
      flakAim(yaw, pitch), FLAK_BREECH));
  }

  // Two hoppers, on their OWN stalks, well clear of the hub and of each other. Each
  // stalk is struck from a root ON THE BASEPLATE and cut to the measured distance
  // to its box, less a bite of a third of the box, so the joint is buried at both
  // ends. Neither figure is authored; both follow whatever the box does.
  const hoppers = [
    { x: -76, y: 96, z: -122, w: 62, root: [-26, 2, -18] },
    { x: -60, y: -34, z: 116, w: 42, root: [-24, 0, 16] },
  ];
  for (const h of hoppers) {
    const d = [h.x - h.root[0], h.y - h.root[1], h.z - h.root[2]];
    b.add('greeble', aimed(massLoft(spar(Math.hypot(d[0], d[1], d[2]) - h.w * 0.34, 10, 8), {
      detail: D, label: 'hopper stalk', keep: G.FACET_LOD.far,
    }), d, h.root));
    b.add('plating', G.bevelBox({
      width: h.w, height: h.w * 0.86, depth: h.w * 0.94, chamfer: h.w * 0.16,
      draft: h.w * 0.11, cant: h.z < 0 ? 0.15 : -0.12, rake: h.z < 0 ? -6 : 5, detail: D,
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
  // Six barrels, six shots, and the fan is why: each shot leaves from a different
  // point on a 190 degree spray, so a flak burst is visibly a spray and not six
  // rounds out of one hole.
  muzzles: FLAK_GUNS.map(([yaw, pitch, len]) => muzzleAlong(FLAK_BREECH, flakAim(yaw, pitch), len)),
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

/** Two turrets in a superfiring pair. `s` scales the aft one down to 0.86. */
const BROADSIDE_TURRETS = [{ z: 100, y: 82, s: 1.0 }, { z: -98, y: 44, s: 0.86 }];
/** The shelf and its outboard skirt, `[z, half, top, bottom]`, at module x -100 / -206. */
const SHELF = [[-170, 96, 26, -6], [-56, 112, 33, -9], [70, 112, 33, -9], [170, 100, 28, -4]];
const SKIRT = [[-150, 38, 4, -40], [10, 44, 9, -45], [150, 36, 2, -38]];
/** Twin barrels per turret: struck from x = -156, 150 m long, split +-28 m in z. */
const BROADSIDE_BARREL_X = -156;
const BROADSIDE_BARREL_LEN = 150;
const BROADSIDE_BARREL_DZ = 28;

function buildBroadsideBattery(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // THE SHELF, and it was the single worst offender in the library: a 224 x 42 x 340 m
  // rectangular prism, the biggest flat-sided thing anyone had bolted to this hull.
  // Same envelope, the hull's own section, beam : depth 5.3.
  b.add('hull', G.place(massLoft(SHELF, { detail: D, label: 'broadside shelf' }), { pos: [-100, 0, 0] }));
  // M-F5: three frames at 116 / 132 m. The shelf is 340 m long and has to say so.
  b.add('plating', G.place(massFrames(SHELF, [-118, -2, 130], { detail: D }), { pos: [-100, 0, 0] }));
  // M-F6, two plates and NOT a mirrored pair: different lengths, different z, one on
  // the lower flank in `dark` and one on the upper in `plating`.
  b.add('dark', G.place(massStrake(SHELF, {
    z0: -150, z1: 40, side: -1, facet: [2, 1], t0: 0.10, t1: 0.62, drift: 0.16, out: 5, detail: D,
  }), { pos: [-100, 0, 0] }));
  b.add('plating', G.place(massStrake(SHELF, {
    z0: -30, z1: 150, side: 1, facet: [3, 2], t0: 0.18, t1: 0.58, drift: -0.12, out: 4, detail: D,
  }), { pos: [-100, 0, 0] }));
  // Outboard skirt: the shelf steps DOWN at its outer edge rather than stopping, so
  // the plan outline has a step in it and the mass reads as carried. 88 x 54 rather
  // than 66 x 76 - M-F4 again, on a 300 m mass that was taller than it was wide.
  b.add('plating', G.place(massLoft(SKIRT, { detail: D, label: 'broadside skirt', keep: G.FACET_LOD.far }),
    { pos: [-206, 0, 0] }));
  b.graft([0, -6, 0], [-HALF_PI, 0, 0], 36);

  // Two turrets. The forward one is superfiring on a barbette - the height step is
  // what makes this read as a battery rather than as two boxes.
  for (const t of BROADSIDE_TURRETS) {
    b.add('plating', G.bevelBox({
      width: 100 * t.s, height: 52 * t.s, depth: 116 * t.s, chamfer: 15 * t.s,
      draft: 9 * t.s, cant: t.s > 0.9 ? 0.11 : -0.14, detail: D,
    }), { pos: [-104, t.y, t.z] });
    if (t.y > 60) {
      b.add('hull', G.pipeRun({ length: 42, radius: 54, sides: 6, axis: 'y', flanges: 0, detail: D }),
        { pos: [-104, 32, t.z] });
    }
    for (const dz of [-BROADSIDE_BARREL_DZ * t.s, BROADSIDE_BARREL_DZ * t.s]) {
      b.add('greeble', barrel({ length: BROADSIDE_BARREL_LEN * t.s, radius: 13 * t.s, detail: D }),
        { pos: [BROADSIDE_BARREL_X, t.y + 2, t.z + dz], rot: OUTBOARD });
    }
  }

  // Ammunition tower behind the turrets. Deliberately NOT the tallest thing on the
  // module: this fit's read is "low and wide" and a spire would undo it.
  b.add('hull', G.bevelBox({
    width: 58, height: 96, depth: 74, chamfer: 9, draft: 8, cant: 0.12, rake: 10, detail: D,
  }), { pos: [-42, 74, -170] });
  // M-F7: the shell hoists live in a cut in the shelf's own flank.
  b.add('dark', G.place(massRecess(SHELF, {
    z: -66, side: 1, facet: [2, 3], t: 0.44, width: 96, height: 26, depth: 18, wall: 4, detail: D,
  }), { pos: [-100, 0, 0] }));

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
  // Four muzzles: two turrets, twin barrels each, forward turret first. The forward
  // pair sits 38 m higher and 198 m further forward than the aft pair, which is what
  // makes a four-shot burst read as a superfiring battery rather than as one gun.
  muzzles: BROADSIDE_TURRETS.flatMap((t) => [-BROADSIDE_BARREL_DZ * t.s, BROADSIDE_BARREL_DZ * t.s]
    .map((dz) => muzzleAlong(
      [BROADSIDE_BARREL_X, t.y + 2, t.z + dz], OUTBOARD_DIR, BROADSIDE_BARREL_LEN * t.s,
    ))),
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

/** The rail's line in module space, and the aperture 8 m off the end of the cap. */
/** The base's stations, `[z, half, top, bottom]`, at module x -30. Beam : depth 2.7. */
const GAUSS_BASE = [[-130, 40, 28, -6], [-40, 48, 32, -4], [60, 48, 32, -4], [130, 42, 26, -8]];
const GAUSS_RAIL_X = -176;
const GAUSS_RAIL_Y = 212;
const GAUSS_MUZZLE_Z = 350;

function buildGaussOutrigger(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  b.add('hull', G.place(massLoft(GAUSS_BASE, { detail: D, label: 'gauss base' }), { pos: [-30, 0, 0] }));
  b.add('plating', G.place(massFrames(GAUSS_BASE, [-74, 52], { detail: D }), { pos: [-30, 0, 0] }));
  b.add('dark', G.place(massStrake(GAUSS_BASE, {
    z0: -110, z1: 112, side: -1, facet: [2, 1], t0: 0.16, t1: 0.68, drift: -0.12, out: 4, detail: D,
  }), { pos: [-30, 0, 0] }));
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
    { pos: [GAUSS_RAIL_X, GAUSS_RAIL_Y, -222] });
  b.add('greeble', G.hexStrut({ length: 44, radius: 26, radiusEnd: 20, axis: 'z', detail: D }),
    { pos: [GAUSS_RAIL_X, GAUSS_RAIL_Y, 298] });
  b.glow([GAUSS_RAIL_X, GAUSS_RAIL_Y, GAUSS_MUZZLE_Z], 18);

  // Two focus rings along the run.
  const rings = full ? [-64, 140] : [40];
  for (const z of rings) {
    b.add('greeble', G.dockingCollar({ radius: 32, innerRadius: 20, depth: 13, sides: 6, detail: D }),
      { pos: [GAUSS_RAIL_X, GAUSS_RAIL_Y, z] });
  }

  // Capacitor blister slung under the rail between the pylons, so the gap between
  // rail and shelf is broken once rather than being one long empty rectangle.
  // 72 x 44, so a 168 m mass clears M-F4's 1.6.
  b.add('hull', G.bevelBox({
    width: 72, height: 44, depth: 168, chamfer: 10, draft: 9, cant: -0.13, detail: D,
  }), { pos: [-158, 148, 4] });
  // M-F7: the capacitor bank's own service cut, in the base's upper flank.
  b.add('dark', G.place(massRecess(GAUSS_BASE, {
    z: 34, side: -1, facet: [3, 4], t: 0.42, width: 74, height: 24, depth: 16, wall: 4, detail: D,
  }), { pos: [-30, 0, 0] }));

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
  // One shot, one muzzle, 210 m above the sponson deck. This is the highest muzzle
  // on any flank fit, so the flash is the one that reads against sky.
  muzzles: [[GAUSS_RAIL_X, GAUSS_RAIL_Y, GAUSS_MUZZLE_Z]],
  weapon: {
    id: 'w_gauss_outrigger', name: 'Gauss Rail', type: 'rail',
    range: RANGE.rail, damage: 690, shotsPerBurst: 1, burstInterval: 0,
    cooldown: 6.0, projectileSpeed: 5200, tracking: 0.08, powerDraw: 30,
    yawWidth: Math.PI * 0.55, pitchWidth: Math.PI * 0.10, subsystemAccuracy: 0.66,
  },
  silhouetteTags: ['outrigger', 'long-rail', 'high', 'thin'],
});
