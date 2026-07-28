/**
 * THE ANCIENT HULK — 3400 metres of something that lost a war nobody now remembers.
 *
 * This object exists to be found, and finding it has to feel like an event. That is
 * a shape problem before it is a lighting problem, so the whole design is built
 * around one idea: NOTHING ABOUT IT WAS DECIDED BY A PERSON.
 *
 * HOW IT REFUSES TO BE A HUMAN SHIP
 *
 *   FIVE-FOLD RADIAL SYMMETRY, NOT BILATERAL. Coalition and Concord hulls are
 *   mirror-symmetric about one plane, have a top and a bottom, and put the crew at
 *   the front. This has a pentagonal core and five identical radial vanes, so there
 *   is no up, no deck, no port and no starboard. A player who tries to read it the
 *   way they read a warship gets nothing back, and that failure is the point.
 *
 *   NO BRIDGE. No window, no tower, no armoured box that could hold a person. The
 *   only openings are the ones the war made.
 *
 *   NO ENGINES. There is no thruster, no bell, no slot, no plume, nothing at either
 *   end that could have pushed it. It has an axis and no direction.
 *
 *   THE SPINE TWISTS. Every station is rotated a little further round than the last,
 *   forty degrees over 3.4 kilometres. It is far too slow to notice as motion and
 *   far too consistent to read as damage, which is exactly the effect wanted: the
 *   surface never lines up with itself and the eye cannot find a straight edge.
 *
 *   THE SYMMETRIES DISAGREE. Five vanes. Three spokes. One ring, tilted seventeen
 *   degrees out of the plane those spokes sit in. Nothing here shares a period with
 *   anything else, and no shipwright who had to build it would have allowed that.
 *
 * HOW IT READS AS BROKEN OPEN
 *
 *   The spine is in TWO PIECES with a 240 m gap. Inside the gap is a smaller inner
 *   spindle, six longerons and four frame rings - the thing's actual structure,
 *   which you can only see because something tore the outside off. One vane is a
 *   stump with shards still attached. The debris that came out is still nearby,
 *   turning slowly, because there has been nothing to disturb it.
 *
 * SCALE CUE. Emissive nodes at a constant 200 m along three lines of the spine, and
 * a 6 m running-light seam - the game-wide strip, same as every other hull - down
 * the outer edge of each surviving vane. At 3.4 km the 6 m seam reads as a
 * continuous line of light, and the 200 m nodes give the rhythm. Both are constant,
 * which is the only property that matters.
 *
 * BUDGET. LOD0 under 2500 triangles, drifting debris excluded and counted
 * separately (it is one InstancedMesh and does not belong to the hull).
 */

import * as THREE from 'three';
import * as G from '../greeble.js';
import { HULL_LENGTH } from '../../../core/units.js';
import { Buckets, bladePlate, lightRun, glowDisc, buildShip, weapon } from './common.js';

const PI = Math.PI;
const HALF_PI = PI * 0.5;
const TAU = PI * 2;

/**
 * A glow disc pre-rotated to face +X, so that a single Z-rotation then points it
 * radially outward.
 *
 * `place()` builds its matrix with Euler order XYZ, i.e. Rx·Ry·Rz, which applies
 * the Z term FIRST. A radial orientation needs Y-then-Z and cannot be expressed
 * in one XYZ Euler, so the Y half is baked into the geometry here. Getting this
 * wrong is what turned the first pass of spine nodes into flat squares lying at
 * the wrong angle.
 */
const radialGlow = (r) => G.place(glowDisc(r, 8), { rot: [0, HALF_PI, 0] });

export const HULK_LENGTH = HULL_LENGTH.ancientHulk;   // 3400

/** Spine node spacing. Constant, known, and nothing like the 6 m lamp spacing. */
export const HULK_NODE_SPACING_M = 200;

// ---------------------------------------------------------------------------
// The spine
// ---------------------------------------------------------------------------

/**
 * `[z, radius]`. One table, split into two lofts with a gap between them: the gap
 * IS the breach, so there is no way to edit the lines and accidentally heal it.
 */
const SPINE = [
  [-1735, 16], [-1500, 52], [-1180, 104], [-820, 150], [-440, 186], [-60, 212], [100, 217],
  // ---- breach: z 100 .. 400, no hull ----
  [400, 226], [700, 244], [1050, 262], [1400, 286],
];
const BREACH = { z0: 100, z1: 400 };

/** Forty degrees of twist over the whole length. Slow enough to be uncanny. */
const twistAt = (z) => ((z + 1700) / HULK_LENGTH) * 0.70;

const radiusAt = (z) => {
  if (z <= SPINE[0][0]) return SPINE[0][1];
  const last = SPINE[SPINE.length - 1];
  if (z >= last[0]) return last[1];
  for (let i = 0; i < SPINE.length - 1; i++) {
    const [za, ra] = SPINE[i], [zb, rb] = SPINE[i + 1];
    if (z >= za && z <= zb) return ra + (rb - ra) * ((z - za) / (zb - za));
  }
  return last[1];
};

/** Pentagonal station. The 5-gon is rotated so a FACET faces +X, never a vertex. */
const pent = (r, twist) => G.ngonProfile(r, 5, twist + PI / 5);

function spineLoft(rows, keepEvery = 1) {
  const kept = keepEvery <= 1 ? rows
    : rows.filter((_, i) => i === 0 || i === rows.length - 1 || i % keepEvery === 0);
  return G.loft(kept.map(([z, r]) => ({ z, points: pent(r, twistAt(z)) })));
}

// ---------------------------------------------------------------------------
// Radial vanes
// ---------------------------------------------------------------------------

/**
 * Vane outline in `[radial, axial]` metres, counter-clockwise. It is deliberately
 * not a wing shape: the trailing edge runs the wrong way and the widest point is
 * a third of the way along, which is the sort of thing a human designer would fix.
 */
const VANE = [[200, 900], [200, -300], [430, -150], [620, 120], [560, 640]];
const VANE_SPAR = [[190, 820], [190, -240], [310, -160], [330, 560]];
/** The fifth vane. Snapped off 130 m out; everything past that is elsewhere now. */
const VANE_STUMP = [[200, 900], [200, -300], [300, -210], [336, 300], [252, 700]];

// ---------------------------------------------------------------------------
// The ring
// ---------------------------------------------------------------------------

const RING = {
  radius: 700, z: -380, section: 34, sectors: 18, missing: [7, 8, 9, 10, 11], tilt: 0.30,
};
const SPOKES = [0.35, 0.35 + TAU / 3, 0.35 + 2 * TAU / 3];

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function hulkParts({ lod }) {
  const D = G.detailForLod(lod);
  const full = lod === 0;
  const decim = lod === 0 ? 1 : lod === 1 ? 2 : 3;
  const B = new Buckets();

  const aft = SPINE.filter((r) => r[0] <= BREACH.z0);
  const fore = SPINE.filter((r) => r[0] >= BREACH.z1);

  // =========================================================================
  // 1. THE SPINE, in two pieces
  // =========================================================================
  B.add('core', 'hull', spineLoft(aft, decim));
  B.add('core', 'hull', spineLoft(fore, decim));

  // =========================================================================
  // 2. THE CROWN. Five horns and a node - no cockpit, no bridge, no purpose a
  //    human eye can assign to it. One horn is half the length of the others.
  // =========================================================================
  B.add('core', 'plating', G.loft([
    { z: 1400, points: G.ngonProfile(190, 10, PI / 10) },
    { z: 1520, points: G.ngonProfile(212, 10, PI / 10) },
    { z: 1660, points: G.ngonProfile(96, 10, PI / 10) },
  ]));
  for (let i = 0; i < 5; i++) {
    const a = twistAt(1400) + (i / 5) * TAU;
    const broken = i === 3;
    B.add('core', 'plating', G.taperedWedge({
      length: broken ? 150 : 330,
      width0: 108, height0: 96,
      width1: broken ? 84 : 26, height1: broken ? 72 : 20,
      chamfer: 12, detail: D,
    }), {
      pos: [Math.cos(a) * 168, Math.sin(a) * 168, 1360],
      rot: [Math.sin(a) * -0.42, Math.cos(a) * 0.42, 0],
    });
  }

  // =========================================================================
  // 3. FIVE VANES. Four intact, one snapped. The break is the only place on the
  //    object where anything is at a human sort of angle, and it is because it
  //    tore rather than because it was drawn.
  // =========================================================================
  for (let i = 0; i < 5; i++) {
    const a = twistAt(300) + (i / 5) * TAU;
    const snapped = i === 1;
    B.add('core', 'hull', bladePlate(snapped ? VANE_STUMP : VANE, 46), { rot: [0, 0, a] });
    B.add('core', 'plating', bladePlate(snapped ? VANE_SPAR.map(([x, z]) => [Math.min(x, 300), z]) : VANE_SPAR, 92),
      { rot: [0, 0, a] });
    if (snapped) {
      // Torn edge: three shards left hanging past the break, each at its own angle.
      for (let k = 0; k < 3; k++) {
        const t = -140 + k * 300;
        B.add('core', 'dark', G.taperedWedge({
          length: 90 + k * 40, width0: 40, height0: 54, width1: 8, height1: 12,
          shear: k % 2 ? 18 : -22, detail: D,
        }), {
          pos: [Math.cos(a) * 320, Math.sin(a) * 320, t],
          rot: [0.4 - k * 0.35, PI * 0.5 + (k - 1) * 0.5, a],
        });
      }
    } else if (full) {
      // 6 m seam down the outer edge of every surviving vane. Same strip as a
      // Coalition corvette wears, which is what makes the scale readable.
      const p0 = [Math.cos(a) * 616, Math.sin(a) * 616, 110];
      const p1 = [Math.cos(a) * 556, Math.sin(a) * 556, 632];
      B.add('core', 'runningLights', lightRun(p0, p1, [Math.cos(a), Math.sin(a), 0], 9));
    }
  }

  // =========================================================================
  // 4. THE RING. Thirteen of eighteen sectors, on three spokes, tilted 17 degrees
  //    out of the plane the spokes define. Nothing about that is buildable.
  // =========================================================================
  {
    const parts = [];
    const chord = 2 * RING.radius * Math.sin(PI / RING.sectors) * 1.02;
    const prof = G.ngonProfile(RING.section, 5, PI / 5);
    for (let i = 0; i < RING.sectors; i++) {
      if (RING.missing.includes(i)) continue;
      if (!full && i % 2) continue;         // half the sectors past LOD0
      const th = (i / RING.sectors) * TAU;
      parts.push({
        geo: G.orient(G.prism(prof, -chord * 0.5, chord * 0.5), 'x'),
        rot: [0, 0, th + PI * 0.5],
        pos: [Math.cos(th) * RING.radius, Math.sin(th) * RING.radius, 0],
      });
    }
    for (const th of SPOKES) {
      parts.push({
        geo: G.hexStrut({ length: RING.radius - 110, radius: 24, radiusEnd: 40, axis: 'x', detail: D }),
        rot: [0, 0, th],
        pos: [Math.cos(th) * 110, Math.sin(th) * 110, 0],
      });
    }
    const ring = G.mergeParts(parts);
    B.add('ring', 'plating', G.place(ring, { rot: [RING.tilt, 0, 0], pos: [0, 0, RING.z] }));
  }

  // =========================================================================
  // 5. THE BREACH. The outside is gone for 240 m and you can see what was under
  //    it. This is the single most important 240 metres of the object.
  // =========================================================================
  {
    const zc = (BREACH.z0 + BREACH.z1) * 0.5;
    /**
     * EVERYTHING IN HERE IS DELIBERATELY THIN.
     *
     * The first pass filled the breach with an inner spindle at 96 m and frames at
     * 180 m against a hull radius of 220, and the result was a continuous
     * silhouette with a slight texture change - the wound healed itself. At 80 and
     * 120 the gap is a genuine neck: the object narrows to a third of its diameter
     * for three hundred metres and you can see daylight past the longerons.
     */
    B.add('breach', 'dark', G.loft([
      { z: BREACH.z0 - 70, points: pent(80, twistAt(BREACH.z0)) },
      { z: BREACH.z1 + 70, points: pent(86, twistAt(BREACH.z1)) },
    ]));
    const longerons = full ? 6 : 3;
    for (let i = 0; i < longerons; i++) {
      const a = twistAt(zc) + (i / longerons) * TAU;
      B.add('breach', 'greeble', G.hexStrut({ length: 380, radius: 13, axis: 'z', detail: D }), {
        pos: [Math.cos(a) * 116, Math.sin(a) * 116, BREACH.z0 - 45],
      });
    }
    const frames = full ? 4 : 2;
    for (let i = 0; i < frames; i++) {
      const z = BREACH.z0 - 20 + (i / (frames - 1)) * (BREACH.z1 - BREACH.z0 + 40);
      B.add('breach', 'greeble', G.prism(pent(128, twistAt(z)), z - 7, z + 7,
        { capFront: false, capBack: false }));
    }
    // Something in there is still running. A BAND around the inner spindle, not a
    // pair of flat panels: the breach is looked into from the side far more often
    // than down the axis, and a plane facing +Z is invisible from the side.
    B.add('breach', 'emissive', G.prism(pent(94, twistAt(zc)), zc - 60, zc + 60,
      { capFront: false, capBack: false }));

    if (full) {
      // Peeled skin around both rims: the plates bent outward as they tore.
      for (let i = 0; i < 5; i++) {
        for (const [z, dir] of [[BREACH.z0, 1], [BREACH.z1, -1]]) {
          const a = twistAt(z) + ((i + 0.5) / 5) * TAU;
          B.add('breach', 'dark', G.taperedWedge({
            length: 110, width0: 130, height0: 26, width1: 74, height1: 10, shear: 20, detail: D,
          }), {
            pos: [Math.cos(a) * (radiusAt(z) - 20), Math.sin(a) * (radiusAt(z) - 20), z],
            rot: [dir > 0 ? -0.5 : 0.5 + PI, 0, a],
          });
        }
      }
    }
  }

  // =========================================================================
  // 6. SURFACE NODULES. Five-fold, repeated at four bands. They are the only
  //    "detail" on the object and they are all the same object, which is what
  //    makes the surface feel grown rather than assembled.
  // =========================================================================
  if (lod < 2) {
    const bands = full ? [-1240, -700, -180, 800] : [-700, 800];
    for (const z of bands) {
      const r = radiusAt(z);
      for (let i = 0; i < 5; i++) {
        const a = twistAt(z) + (i / 5) * TAU + 0.3;
        B.add('core', 'greeble', G.mountPad({ radius: r * 0.30, height: r * 0.11, sides: 8, detail: D }), {
          pos: [Math.cos(a) * (r * 0.86), Math.sin(a) * (r * 0.86), z],
          rot: [0, 0, a - PI * 0.5],
        });
      }
    }
  }

  // =========================================================================
  // 7. SCALE CUE: emissive nodes every 200 m along three lines of the spine.
  // =========================================================================
  if (lod < 2) {
    const step = full ? HULK_NODE_SPACING_M : HULK_NODE_SPACING_M * 2;
    for (let z = -1600; z <= 1400.01; z += step) {
      if (z > BREACH.z0 && z < BREACH.z1) continue;
      const r = radiusAt(z);
      const s = Math.min(34, Math.max(11, r * 0.16));
      const disc = radialGlow(s);
      for (let i = 0; i < 3; i++) {
        const a = twistAt(z) + (i / 3) * TAU + 0.9;
        B.add('core', 'engineGlow', disc, {
          pos: [Math.cos(a) * (r * 1.02), Math.sin(a) * (r * 1.02), z],
          rot: [0, 0, a],
        });
      }
    }
  }

  return { buckets: B.list() };
}

// ---------------------------------------------------------------------------
// Drifting debris
// ---------------------------------------------------------------------------

/**
 * What came out of the breach, still nearby because there has been nothing to
 * disturb it. One InstancedMesh, one draw call; NOT counted against the hull's
 * triangle budget because it is not part of the hull.
 *
 * @returns {THREE.InstancedMesh|null}
 */
export function buildHulkDebris(ctx, count = 30) {
  const registry = ctx?.materials;
  if (!registry?.get) return null;
  const rng = (ctx.rng ?? { next: () => 0.5, range: (a, b) => (a + b) * 0.5, signed: () => 0 }).fork
    ? ctx.rng.fork('hulk:debris') : ctx.rng;

  // One chunk shape, instanced. A pentagonal shard, because everything this thing
  // was made of broke along five-fold lines.
  const chunk = G.mergeParts([
    { geo: G.loft([
      { z: -1, points: G.ngonProfile(0.62, 5, 0.2) },
      { z: 0.35, points: G.ngonProfile(1.0, 5, 0.5) },
      { z: 1.1, points: G.ngonProfile(0.30, 5, 0.9) },
    ]) },
  ]);
  const mat = registry.get('derelictHull', { faction: 'derelict', wear: 1.0, tier: 1, instanced: true });
  const mesh = new THREE.InstancedMesh(chunk, mat, count);
  mesh.name = 'ancient_hulk:debris';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Clustered around the breach and thinning out along the axis - it came from
    // one event, not from everywhere.
    const a = rng.next() * TAU;
    const rad = 700 + Math.pow(rng.next(), 0.55) * 2200;
    const z = 240 + rng.signed() * 1500 * (0.35 + rng.next());
    p.set(Math.cos(a) * rad, Math.sin(a) * rad, z);
    e.set(rng.next() * TAU, rng.next() * TAU, rng.next() * TAU);
    q.setFromEuler(e);
    // Small. A chunk that reads at the same apparent size as a vane stops being
    // debris and starts being clutter in front of the thing it came out of.
    const k = 9 + Math.pow(rng.next(), 2.4) * 78;
    s.set(k, k, k * rng.range(0.8, 2.4));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Class definition
// ---------------------------------------------------------------------------

/**
 * @type {import('../../../core/contracts.js').ShipClassDef}
 *
 * It is registered as a ship class so the salvage, targeting and world-sim layers
 * can treat it like any other hull without a special case. It cannot move: speed,
 * acceleration and turn rate are all zero, which is the honest way to say "static
 * exploration object" to systems that only speak ShipClassDef.
 */
export const ANCIENT_HULK = {
  id: 'derelict_ancient_hulk',
  name: 'Ancient Hulk',
  faction: 'derelict',
  role: 'hulk',
  length: HULK_LENGTH,
  mass: 4_200_000,
  maxSpeed: 0, accel: 0, turnRate: 0,
  hullHP: 48000,
  triBudget: 2500,
  planeLocked: true,
  partsFor: hulkParts,
  lodLevels: 3,
  build(ctx) {
    const root = buildShip(ctx, {
      id: 'derelict_ancient_hulk',
      faction: 'derelict',
      partsFor: hulkParts,
      length: HULK_LENGTH,
      levels: 3,
    });
    const debris = buildHulkDebris(ctx);
    if (debris) {
      root.add(debris);
      root.userData.debris = debris;
    }
    return root;
  },
  subsystems: [
    { id: 'core', kind: 'reactor', hp: 9000, position: [0, 0, 240], radius: 190, salvageValue: 0.34, label: 'Something Still Running' },
    { id: 'crown', kind: 'sensor', hp: 6000, position: [0, 0, 1500], radius: 260, salvageValue: 0.20, label: 'Crown' },
    { id: 'ring', kind: 'sensor', hp: 5200, position: [0, 0, -380], radius: 740, salvageValue: 0.18, label: 'Ring Array' },
    { id: 'vane_root', kind: 'weapon', hp: 4400, position: [0, 0, 300], radius: 420, salvageValue: 0.14, label: 'Vane Roots' },
    { id: 'tail', kind: 'engine', hp: 3800, position: [0, 0, -1400], radius: 150, salvageValue: 0.08, label: 'Tail Spindle' },
  ],
  weapons: [
    // It is a hazard, not a combatant. One thing, short range, and it only ever
    // fires at whatever is closest - see sim/ai. Kept so the class is legal and so
    // "go inside it" is a decision rather than a formality.
    weapon('hulk_lash', 'Something Reaches Out', 'beam', {
      mount: [0, 0, 240], yawCentre: 0, yawWidth: PI * 2, pitchWidth: PI,
      range: 1600, damage: 70, shotsPerBurst: 1, cooldown: 9.0,
      projectileSpeed: Infinity, tracking: 0.4, powerDraw: 0, subsystemAccuracy: 0.3,
    }),
  ],
};

export const DERELICT_SHIPS = [ANCIENT_HULK];
export { hulkParts };
