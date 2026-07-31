/**
 * VENTRAL MODULES — the salvage cradle, and it is a BERTH now rather than a hook.
 *
 * ---------------------------------------------------------------------------
 * "THE WORST LOOKING PART OF THE SHIP IS THE BOX ON THE BOTTOM"
 * ---------------------------------------------------------------------------
 * That was the owner's second note and the box was real. The carrier fit's landing
 * platform was a 286 x 540 m `panelledSlab` - a rectangular prism, 100% of its area
 * axis-aligned - hung at world y -494 under a bay whose floor was at -202. It was not
 * attached to the bay in any sense: it hung under the ENTIRE assembly on a neck, and
 * its flat underside was 154 000 square metres of one value facing the camera every
 * time the tactical view dropped below the horizon.
 *
 * The three fits in this file now put their BODY INSIDE THE BAY and hang only their
 * deployed working gear, which is long, open and structural. `cruiser.js` dropped the
 * bay floor 20 m to make room (chordBot -180 -> -200, floor -202 -> -222, 112 m of
 * clear berth) and grew two runner rails at x +-126 for a module spine to land on
 * along its whole length instead of on one 44 m disc.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BOX COULD NOT SIMPLY BE DELETED, MEASURED RATHER THAN ARGUED
 * ---------------------------------------------------------------------------
 * `docs/review/acceptance.md` carries a PASS for "three loadouts of the same cruiser
 * distinguishable in silhouette", and it was won EXACTLY by making the ventral fits
 * big and cantilevered at three different depths. Run the criterion with this mount
 * emptied and the other five untouched - `node src/probes/loadoutsAudit.mjs --empty
 * ventral` - and it does not get tight, it FAILS:
 *
 *     all six fitted    worst pair mean 84.5   max 355   PASS
 *     ventral EMPTY     worst pair mean 42.5   max 248   FAIL   (bar is 45)
 *     bottom-channel divergence with it empty:  0.1 / 4.7 / 4.8 m
 *
 * The last line is the finding. The outline signature has three channels per z-bin -
 * half-beam, top and bottom - and THE VENTRAL IS THE BOTTOM CHANNEL. Nothing else on
 * this ship moves the keel line at all. So recessing this mount spends one criterion
 * out of three, and it can only be done by replacing the depth difference rather than
 * deleting it.
 *
 * Bins are 28 over 1402 m, i.e. 50.1 m of ship each. A difference held over only the
 * 445 m bay is nine bins and would need 180 m of depth per bin to pay for itself; held
 * over 850 m it needs 95. THE MECHANISM MUST BE LONG BEFORE IT IS DEEP, which is what
 * kills every "make it a shallow reveal in the bay floor" idea and is not obvious
 * without the measurement.
 *
 * ---------------------------------------------------------------------------
 * THREE RULES THIS FILE NOW HOLDS ITSELF TO
 * ---------------------------------------------------------------------------
 * V1 CONTAINMENT. The module's primary mass lives inside the bay volume - x +-226,
 *    y -48 .. -222, z -230 .. +215. What is outside it is gear, not body.
 *
 * V2 NO BOX. Nothing below y -240 presents a downward face over 12 000 m2. This is
 *    the rule that kills the slab underside, and `massLoft` satisfies it almost by
 *    accident: a `facetProfile` keel is a narrow flat with deadrise between two
 *    chamfers, so a 92 m beam presents a 26 m keel flat, not a 92 m one.
 *
 * V3 DEPTH BANDS, 100 m apart, each held over at least twelve of the twenty-eight
 *    z-bins. This is what replaces "three different sizes of box":
 *
 *      SHALLOW  world -270   cargo pods     two 760 m pod bellies, lower 40% proud
 *      MID      world -370   field dock     940 m of open rail and three portals
 *      DEEP     world -470   hangar deck    a landing GRID on legs, with an open well
 *
 *    Every one of the three is now SHALLOWER than it was (-356 / -487 / -540 before),
 *    so the fitted ships got shorter as well as tidier.
 *
 * ---------------------------------------------------------------------------
 * AND THEY ARE BUILT OUT OF THE HULL NOW
 * ---------------------------------------------------------------------------
 * Every primary mass in this file is a `massLoft` - the hull's own twelve-point
 * `facetProfile` section, six large planes a side, a knuckle at 80.8 degrees of
 * dihedral, a cambered deck and a keel with deadrise - carrying `massFrames` at the
 * hull's 90-140 m structural rhythm, `massStrake` plates cut from the mass's own
 * section, and `massRecess` cuts for the machinery to sit in. See `kit.js`, which
 * explains why forty-six `panelledSlab`s was the whole diagnosis.
 */

import { registerModule } from '../../../core/contracts.js';
import { RANGE } from '../../../core/units.js';
import * as G from '../greeble.js';
import {
  ModuleBuilder, MODULE_TRI_BUDGET, throat, aimed,
  massLoft, massFrames, massStrake, massRecess,
} from './kit.js';

/**
 * The tractor yoke's three arms. Not thirds of a circle and not equal lengths,
 * because nothing the derelicts built is. Hoisted so the emitter apertures the
 * geometry draws and the muzzle the ModuleDef declares come from one table.
 */
const TRACTOR_ARMS = [
  { x: -1, z: 0.26, len: 300, tilt: 0.86 },
  { x: 1, z: 0.14, len: 246, tilt: 0.70 },
  { x: 0.06, z: 1, len: 336, tilt: 0.52 },
];
const TRACTOR_HUB_Y = -96;
const TRACTOR_HUB_R = 34;
/** The horn's bell hangs 62 m below the end of its arm; that is the aperture. */
const TRACTOR_HORN_DROP = 62;

/** One arm resolved: strike point, direction, where the arm ends, where it emits. */
function tractorArm(arm) {
  const a = Math.atan2(arm.z, arm.x);
  const ca = Math.cos(a), sa = Math.sin(a);
  const dir = [ca * arm.tilt, -1, sa * arm.tilt];
  const k = arm.len / Math.hypot(ca * arm.tilt, 1, sa * arm.tilt);
  const root = [ca * TRACTOR_HUB_R, TRACTOR_HUB_Y, sa * TRACTOR_HUB_R];
  const head = [root[0] + ca * arm.tilt * k, TRACTOR_HUB_Y - k, root[2] + sa * arm.tilt * k];
  return { dir, root, head, aperture: [head[0], head[1] - TRACTOR_HORN_DROP, head[2]] };
}

const HALF_PI = Math.PI * 0.5;

const oct = (hw, top, bot, cw, ct, cb) => G.octProfile(hw, top, bot, cw, ct, cb);

/**
 * THE BERTH, in MODULE-LOCAL metres. The mount is at world [0, -78, 0] and the module
 * origin sits 3 m below it on the bolt ring's top face (`hardpoints.js#SEAT_STANDOFF`,
 * dropped from 7 when `cruiser.js#mountSeat` gave every mount a real apron), so
 *
 *     LOCAL y = WORLD y + 81
 *
 * Kept as named numbers because every mass in this file is checked against them.
 */
const BERTH = {
  roof: 33,           // world -48, the bay roof
  keel: 5,            // world -76, where the hull's keel crown actually is
  chordTop: -7,       // world -88
  chordBot: -119,     // world -200
  floor: -141,        // world -222, the bay floor
  half: 226,          // world x, the bottom chords: the berth's clear half-width
  runnerX: 126,       // the two runner rails a spine lands on
  z0: -230, z1: 215,  // the bay's own z run
};

/**
 * V3's three bands, LOCAL. 100 m apart, and each fit holds its own over at least
 * twelve of the twenty-eight z-bins. See the header for why 100 and why long.
 */
const BAND = { shallow: -189, mid: -289, deep: -389 };

/** Kept for the two modules outside the probe's loadouts, which still hang. */
const ENVELOPE = {
  keelY: -141,        // world -222, the salvage bay floor: the depth to beat
  halfBeam: 198,      // world x, the outrigger drive pods: the beam to beat
  cradleHalf: 175,    // clear half-width of the throat the module threads through
};

// ---------------------------------------------------------------------------
// T3 — Concord Hangar Deck        THE DEEP ONE
// ---------------------------------------------------------------------------

/**
 * THE HANGAR DECK — THE DEEP ONE, and it is a GRID now instead of a slab.
 *
 * Installing this converts the game from a single-ship brawler into a small RTS, so
 * it has to be the most obvious change the player can make to their ship and it has
 * to be obvious from four kilometres. It was, and the way it did it was a 286 x 540 m
 * flat-bottomed prism hung at world y -494: the thing the owner was looking at.
 *
 * Same read, opposite construction. The BODY - the hangar itself, the two launch
 * throats and the recovery slot - is a `massLoft` sitting INSIDE the berth, between
 * the bottom chords, landing on both runner rails. What hangs is the LANDING DECK,
 * and it is a frame: two runs of three deck beams on four unequal legs with an OPEN
 * CENTRE WELL you can see the gas giant through. No piece of it presents a downward
 * face over 12 000 m2 (V2), which is checkable and which the slab failed by 13x.
 *
 * It is still the deepest of the three at world -470, still the narrowest, and still
 * the shortest. What it is not is a box.
 */
function buildHangarDeck(ctx) {
  const b = new ModuleBuilder(ctx, 'concord');
  const D = b.detail, full = b.full;

  // 1. THE BODY, in the hull's own section, sitting in the berth.
  //    `[z, half, top, bottom, knuckle, deckFlat, flare]` - the same seven columns
  //    `cruiser.js#HULL_STATIONS` uses, so this mass is made of the same plate family
  //    as the ship it is welded into. Beam : depth runs 2.5-2.7 against M-F4's 1.6.
  const BODY = [
    [-318, 104, -6, -96, 0.46, 0.50, 0.88],
    [-140, 148, -4, -118, 0.47, 0.52, 0.86],
    [126, 150, -4, -118, 0.47, 0.52, 0.86],
    [308, 112, -8, -100, 0.44, 0.48, 0.92],
  ];
  b.add('hull', massLoft(BODY, { detail: D, label: 'hangar body' }));
  // M-F5: three frames, unevenly spaced at 118 / 136 m, the hull's own rhythm.
  b.add('plating', massFrames(BODY, [-196, -62], { detail: D }));
  // M-F2 / M-F6 / F10: one plate a side on the LOWER flank, below the module's own
  // knuckle, on `dark`. The value boundary lands on a real 80-degree chine with a
  // shadow at it rather than in the middle of a face.
  b.add('dark', massStrake(BODY, { z0: -290, z1: -30, side: -1, facet: [2, 1], t0: 0.10, t1: 0.62, drift: 0.14, out: 5, detail: D }));
  b.add('dark', massStrake(BODY, { z0: -110, z1: 250, side: 1, facet: [2, 1], t0: 0.22, t1: 0.70, drift: -0.10, out: 5, detail: D }));

  // 2. THE LANDING DECK, as a FRAME. Three beams a side with 40 m gaps, two
  //    transverse ties, and nothing at all down the centre. `massLoft` is what makes
  //    V2 nearly free: a `facetProfile` keel is a narrow flat with deadrise between
  //    two chamfers, so a 92 m beam shows a 26 m keel flat and 26 x 186 is 4 836 m2.
  const DECK = (z0, z1, half) => [
    [z0, half * 0.86, BAND.deep + 46, BAND.deep + 4, 0.45, 0.48, 0.9],
    [(z0 + z1) * 0.5, half, BAND.deep + 50, BAND.deep, 0.45, 0.48, 0.9],
    [z1, half * 0.88, BAND.deep + 46, BAND.deep + 4, 0.45, 0.48, 0.9],
  ];
  // Port and starboard runs are at DIFFERENT z (M-F9): a carrier lands to port.
  for (const [s, runs] of [[-1, [[-316, -136], [-96, 84], [124, 300]]],
    [1, [[-268, -104], [-64, 132], [172, 306]]]]) {
    for (let i = 0; i < runs.length; i++) {
      const [z0, z1] = runs[i];
      b.add('plating', G.place(massLoft(DECK(z0, z1, 46 - i * 3),
        { detail: D, label: 'deck beam', keep: G.FACET_LOD.far }), { pos: [s * 152, 0, 0] }));
    }
  }
  // Two transverse ties, unequal, and neither on the module's centre of length.
  for (const [dz, w, h] of [[-188, 300, 30], [206, 268, 24]]) {
    b.add('plating', G.bevelBox({
      width: w, height: h, depth: 46, chamfer: 6, draft: 6, cant: dz < 0 ? 0.11 : -0.09, detail: D,
    }), { pos: [0, BAND.deep + 26, dz] });
  }

  // 3. FOUR LEGS, unequal and not at mirrored z. They are what the deck hangs on and
  //    they are the only thing crossing the 230 m between body and deck, so they are
  //    canted `bevelBox`es rather than tubes - a stick reads as scaffolding.
  for (const [x, dz, w] of [[-152, -244, 30], [152, -142, 26], [-152, 196, 27], [152, 262, 23]]) {
    b.add('hull', G.bevelBox({
      width: w, height: 250, depth: w * 1.7, chamfer: 5, draft: 5,
      cant: x < 0 ? 0.12 : -0.10, rake: dz > 0 ? 14 : -11, detail: D,
    }), { pos: [x, BAND.deep + 172, dz] });
  }

  // 4. M-F7: two launch throats, cut INTO the body's own forward flank rather than
  //    stuck onto it, plus a recovery slot to port only.
  for (const s of [-1, 1]) {
    b.add('dark', throat({ width: 70, height: 60, depth: 74, detail: D }), { pos: [s * 58, -58, 306] });
    b.glow([s * 58, -58, 298], 30);
  }
  b.add('dark', massRecess(BODY, {
    z: 20, side: -1, facet: [2, 3], t: 0.5, width: 250, height: 74, depth: 44, wall: 5, detail: D,
  }));
  b.glow([-146, -46, 20], 38, [0, -HALF_PI, 0]);
  if (full) {
    b.add('dark', massRecess(BODY, {
      z: -212, side: 1, facet: [1, 2], t: 0.42, width: 92, height: 40, depth: 22, wall: 4, detail: D,
    }));
  }

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 52);

  // Approach lighting down the deck's outboard edges, at the game-wide spacing.
  b.lightRun([-186, BAND.deep + 34, -300], [-186, BAND.deep + 34, 280], [-1, 0, 0], { max: 9 });
  b.lightRun([186, BAND.deep + 34, -260], [186, BAND.deep + 34, 300], [1, 0, 0], { max: 9 });

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
  for (const arm of TRACTOR_ARMS) {
    const { dir, root, head, aperture } = tractorArm(arm);
    b.add('hull', aimed(
      G.hexStrut({ length: arm.len, radius: 16, radiusEnd: 11, axis: 'z', detail: D }),
      dir, root,
    ));
    // Emitter horn: a short bell flaring downward off the end of the arm.
    b.add('plating', aimed(
      G.hexStrut({ length: 58, radius: 20, radiusEnd: 36, axis: 'z', detail: D }),
      [0, -1, 0], head,
    ));
    b.glow(aperture, 32, [HALF_PI, 0, 0]);
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
  // THREE horns are drawn; ONE emits, because `shotsPerBurst` is 1. The firing horn
  // is the longest arm (336 m, the one that reaches forward), which is also the one
  // that clears the salvage cradle. Same rule as bow_mining_array.
  muzzles: [tractorArm(TRACTOR_ARMS[2]).aperture],
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
 * CARGO PODS — THE SHALLOW ONE, and it earns the outline by being LONG.
 *
 * §4.1's arithmetic is the whole design of this module. Twenty-eight z-bins over
 * 1402 m is 50.1 m of ship per bin, so a keel-line difference held over 760 m is
 * fifteen bins and a difference held over the 445 m bay is nine. Length is what buys
 * the MEAN, and the mean is the quantity recessing the ventral threatens. So this fit
 * is the shallowest of the three at world -270 and the longest thing on the ship.
 *
 * The rack itself - the spine, the two transverse yokes, the racking - is INSIDE the
 * berth, landing on both runner rails. What is proud is the lower 40% of two 760 m
 * pod bellies, plus one square container that came off something else entirely and is
 * hung lower and off the centreline. That container is the module's whole personality
 * and it is the only part that breaks the band.
 *
 * Against the hangar deck it is the opposite reading in every dimension: broad, flat
 * and long where that is deep, narrow and short. Against the field dock it is solid
 * mass where that is a cage.
 */
function buildCargoExpansion(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  // 1. THE RACK, in the berth. 830 m of the hull's own section, beam : depth 2.3-2.6.
  const RACK = [
    [-412, 96, -8, -84, 0.46, 0.50, 0.90],
    [-190, 128, -6, -104, 0.47, 0.52, 0.88],
    [180, 128, -6, -104, 0.47, 0.52, 0.88],
    [408, 88, -12, -78, 0.43, 0.47, 0.94],
  ];
  b.add('hull', massLoft(RACK, { detail: D, label: 'cargo rack' }));
  // M-F5, at 132 / 104 / 118 m. Never evenly - an even rhythm reads as tiling.
  b.add('plating', massFrames(RACK, [-284, -152, -48, 70], { detail: D }));
  // M-F6 / F10. Port and starboard runs differ in length and in z (M-F9).
  b.add('dark', massStrake(RACK, { z0: -380, z1: -40, side: -1, facet: [2, 1], t0: 0.12, t1: 0.64, drift: 0.16, out: 5, detail: D }));
  b.add('dark', massStrake(RACK, { z0: -120, z1: 366, side: 1, facet: [2, 1], t0: 0.24, t1: 0.72, drift: -0.12, out: 5, detail: D }));

  // 2. TWO 760 m POD BELLIES, half-buried in the rack. Their tops are inside the
  //    berth and only the lower 40% is proud, so what the keel line sees is a long
  //    shallow swell rather than a slung cylinder. At world -270 they are the SHALLOW
  //    band, held over fifteen of the twenty-eight bins.
  //    M-F4 asserts beam : depth >= 1.6 and it FIRED on the first draft of this table
  //    at 1.26 - a pod 100 m across and 78 m deep is a cylinder wearing a section.
  //    A pressure pod on a flat ship is wide and shallow, and now it measures so.
  const POD = (s) => [
    [-372 + s * 14, 60, BAND.shallow + 88, BAND.shallow + 22, 0.46, 0.50, 0.88],
    [-120, 76, BAND.shallow + 96, BAND.shallow + 2, 0.47, 0.52, 0.86],
    [160, 76, BAND.shallow + 96, BAND.shallow + 2, 0.47, 0.52, 0.86],
    [386 + s * 10, 58, BAND.shallow + 86, BAND.shallow + 26, 0.44, 0.48, 0.92],
  ];
  for (const s of [-1, 1]) {
    b.add('plating', G.place(massLoft(POD(s), { detail: D, label: 'cargo pod', keep: G.FACET_LOD.far }),
      { pos: [s * 176, 0, 0] }));
  }

  // 3. Two transverse yokes carrying the pods. Unequal spacing: a load path is where
  //    the load is, not where a drawing looked tidy.
  for (const [dz, w, h] of [[-296, 400, 34], [232, 372, 28]]) {
    b.add('hull', G.bevelBox({
      width: w, height: h, depth: 70, chamfer: 7, draft: 7, cant: dz < 0 ? -0.12 : 0.10, detail: D,
    }), { pos: [0, BAND.shallow + 104, dz] });
  }

  // 4. ...AND ONE SQUARE CONTAINER THAT CAME OFF SOMETHING ELSE. Canted, drafted, off
  //    the centreline and hung 44 m lower than either pod. It is the only element on
  //    the module that is not in the module's own language, which is the point: this
  //    ship is a salvager and the container is a different ship's.
  b.add('hull', G.bevelBox({
    width: 152, height: 104, depth: 330, chamfer: 14, draft: 12, cant: 0.13, rake: -16, detail: D,
  }), { pos: [-24, BAND.shallow + 44, 108] });

  // 5. M-F7: two cuts in the rack's own flank with the racking machinery inside them.
  b.add('dark', massRecess(RACK, {
    z: -246, side: 1, facet: [2, 3], t: 0.46, width: 132, height: 46, depth: 26, wall: 5, detail: D,
  }));
  if (full) {
    b.add('dark', massRecess(RACK, {
      z: 122, side: -1, facet: [1, 2], t: 0.38, width: 96, height: 38, depth: 20, wall: 4, detail: D,
    }));
    // Strapping over the pods, at three unequal stations and one of them only to port.
    for (const [dz, s] of [[-232, 0], [24, 0], [268, -1]]) {
      b.add('greeble', G.bevelBox({
        width: s ? 240 : 452, height: 11, depth: 17, chamfer: 3, cant: 0.09, detail: D,
      }), { pos: [s * 108, BAND.shallow + 96, dz] });
    }
  }

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 42);
  b.lightRun([0, -14, 380], [0, -14, -380], [0, 0.4, 1], { max: 10 });

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
 * THE FIELD DOCK — THE MID BAND, and the one you can see stars through.
 *
 * Sized to take a frigate broadside-on: 940 m of open drydock. The point of contrast
 * with the hangar deck is that this one is a CAGE - mass only at its edges - so the
 * two never read the same even though both are "a big thing under the ship". The
 * point of contrast with the cargo pods is that those are solid.
 *
 * Its body is a spine in the berth. What hangs is two working rails at world -370
 * held over nineteen of the twenty-eight z-bins, three portal frames, and the arms.
 * The rails stay OUTBOARD at x +-244 on purpose: they are 18 m wider than the berth,
 * and the half-beam channel of the outline signature is the one this fit contributes
 * to that the other two do not.
 */
function buildRepairBay(ctx) {
  const b = new ModuleBuilder(ctx, 'coalition');
  const D = b.detail, full = b.full;

  b.graft([0, 0, 0], [HALF_PI, 0, 0], 44);

  // 1. THE SPINE, in the berth, on both runner rails. Beam : depth 2.2-2.5.
  const SPINE = [
    [-400, 78, -10, -78, 0.46, 0.50, 0.90],
    [-160, 104, -8, -96, 0.47, 0.52, 0.88],
    [200, 104, -8, -96, 0.47, 0.52, 0.88],
    [396, 72, -14, -70, 0.43, 0.47, 0.94],
  ];
  b.add('hull', massLoft(SPINE, { detail: D, label: 'dock spine' }));
  b.add('plating', massFrames(SPINE, [-268, -142], { detail: D }));
  b.add('dark', massStrake(SPINE, { z0: -350, z1: -60, side: 1, facet: [2, 1], t0: 0.14, t1: 0.66, drift: 0.14, out: 5, detail: D }));

  // 2. THE TWO WORKING RAILS, 940 m, at the MID band. Same section family as the
  //    spine, so the cage is made of the ship rather than of scaffolding poles -
  //    which is exactly what four `panelledSlab`s made it before.
  //    M-F4 fired here too, at 1.08: a 52 m rail 48 m deep is a bar, not a section.
  //    A dock rail a frigate is slung under is wide enough to walk along.
  const RAIL = (s) => [
    [-462 + s * 18, 30, BAND.mid + 50, BAND.mid + 14, 0.46, 0.50, 0.9],
    [20 + s * 60, 38, BAND.mid + 44, BAND.mid, 0.46, 0.50, 0.9],
    [446 + s * 14, 28, BAND.mid + 48, BAND.mid + 16, 0.46, 0.50, 0.9],
  ];
  for (const s of [-1, 1]) {
    b.add('plating', G.place(massLoft(RAIL(s), { detail: D, label: 'dock rail', keep: G.FACET_LOD.far }),
      { pos: [s * 244, 0, 0] }));
  }

  // 3. THREE PORTAL FRAMES, and the gaps between them are the module. Each is a
  //    transverse beam on two down-legs; the legs run from the spine THROUGH the beam
  //    to the rail, so all three levels are tied at one station and nothing hangs.
  const portals = [-372, -20, 352];
  for (let i = 0; i < portals.length; i++) {
    const z = portals[i];
    const w = i === 1 ? 552 : 494;
    b.add('plating', G.bevelBox({
      width: w, height: 32, depth: 54, chamfer: 7, draft: 7, cant: i === 1 ? -0.11 : 0.10, detail: D,
    }), { pos: [0, BAND.mid + 42, z] });
    for (const s of [-1, 1]) {
      b.add('hull', G.bevelBox({
        width: 26 + (i % 2) * 5, height: 232, depth: 32, chamfer: 5, draft: 5,
        cant: s * (i === 1 ? 0.12 : -0.09), detail: D,
      }), { pos: [s * (w * 0.5 - 26), BAND.mid + 148, z] });
    }
    // KING POST, on the centreline, spine to beam. Without it the down-legs stand at
    // x +-221..250 and the spine is only 104 wide, so the whole cage hung off nothing.
    // Un-drafted, and that is a budget decision stated rather than absorbed: both
    // ends of a king post are buried, the spine above it and the portal beam below,
    // so 32 triangles of end bevel each were paying for an edge nothing can see.
    // `cant` still keeps its four long faces off their axes, and that is free.
    b.add('hull', G.bevelBox({
      width: 30, height: 156, depth: 34, chamfer: 5, cant: i === 1 ? 0.13 : -0.10, detail: D,
    }), { pos: [0, BAND.mid + 118, z] });
  }

  // 4. Three arms: two folded against the starboard rail, one extended to port and
  //    working. The asymmetry is why this reads as busy machinery rather than as a
  //    bridge truss, and M-F9 forbids the mirrored alternative anyway.
  if (full) {
    b.add('greeble', G.hexStrut({ length: 150, radius: 11, axis: 'z', caps: false, detail: D }),
      { pos: [206, BAND.mid + 52, -150] });
    b.add('dark', massRecess(SPINE, {
      z: -96, side: -1, facet: [2, 3], t: 0.44, width: 104, height: 40, depth: 22, wall: 4, detail: D,
    }));
  }
  b.add('greeble', aimed(G.hexStrut({ length: 210, radius: 13, axis: 'z', caps: false, detail: D }),
    [-1, -0.36, 0], [-222, BAND.mid + 84, 150]));
  b.add('greeble', G.bevelBox({ width: 44, height: 34, depth: 38, chamfer: 5, draft: 4, cant: 0.14, detail: D }),
    { pos: [-420, BAND.mid + 8, 150] });
  b.glow([-420, BAND.mid - 14, 150], 20, [HALF_PI, 0, 0]);

  // Fabricator drum ON the starboard rail, not 6 m clear of it.
  b.add('greeble', G.pipeRun({ length: 168, radius: 38, sides: 6, axis: 'z', flanges: full ? 1 : 0, detail: D }),
    { pos: [244, BAND.mid - 24, -140] });

  b.lightRun([-244, BAND.mid - 4, -400], [-244, BAND.mid - 4, 380], [0, -1, 0], { max: 8 });

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
    // One coolant trunk down the OUTSIDE, from the collar plate to the drum rim.
    // It used to be struck from [50, -48, -44] with a length of 62 - above the
    // neck's top edge (y = -128) and outboard of the 46 m plate - so it was 45 m of
    // pipe hanging in vacuum touching nothing at either end (`tools/silhouette.mjs`,
    // side view). Now it starts on the plate and finishes inside the drum, and
    // because it runs at a radius of 36 -> 98 m against a 59 m neck it is OUTSIDE
    // the neck for its whole length, which is the only place a serviceable line
    // belongs and the only place it is visible from.
    b.add('greeble', aimed(G.cappedConduit({ length: 150, radius: 13, axis: 'z', detail: D }),
      [62, -146, 22], [34, -4, 12]));
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
