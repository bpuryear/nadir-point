/**
 * BATTLE DEBRIS FIELD.
 *
 * Lives in `world.scene`, real metres.
 *
 * FOUR KINDS, BECAUSE ONE KIND IS A PARTICLE SYSTEM. A field of identical tumbling
 * lumps reads as gravel. What reads as a battle is the mix of silhouettes:
 *
 *   plate  torn hull plating — wide, thin, irregular outline, catches the key light
 *          on one face and goes black on the other. The value contrast carrier.
 *   spar   severed structural framing — long, thin, ribbed. These are the pieces
 *          that give the field its sense of SIZE, because a 200 m spar next to a
 *          40 m plate tells you what you are looking at.
 *   chunk  tumbling fragments — small convex rubble that fills the volume.
 *   plume  frozen atmosphere — additive crossed billboards; the only soft shape in
 *          the field, and the only thing that says the wrecks are still venting.
 *
 * ONE MATERIAL FOR THE THREE RIGID KINDS. The registry's `debris` albedo is
 * deliberately desaturated so `setColorAt` can carry Coalition green-grey, Concord
 * pale blue, derelict bronze and scorched near-black in the same batch. That is
 * three draw calls for the entire wreckage field (one per geometry — an
 * InstancedMesh is one geometry by definition) plus one for the plumes.
 *
 * PARALLAX LAYERING. Instances are drawn from three depth bands with different size
 * distributions, so there is always wreckage between the camera and the ship as well
 * as behind it. Depth layering is the scale cue this field exists to provide;
 * a single shell of debris all at one range provides none.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { getFactionPalette, NEUTRAL, mix, shade } from '../../art/palette.js';

/**
 * Depth bands. The near band is deliberately SPARSE and LARGE: a handful of big
 * wrecks crossing the frame reads as a battle, a hundred small ones scattered evenly
 * over the sky reads as confetti and destroys the backdrop behind it.
 */
const BANDS = [
  { radius: 3200, half: 1100, share: 0.07, size: 2.60 },  // near — a few big wrecks
  { radius: 9000, half: 2600, share: 0.31, size: 1.05 },  // mid
  { radius: 22000, half: 5400, share: 0.62, size: 0.58 }, // far — small, many
];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Torn hull plate: irregular prism, thin, with a proper rim so it is not a card. */
function plateGeometry(rng, size = 40, thickness = 1.6) {
  const n = rng.int(6, 9);
  const top = [];
  const bot = [];
  let a = rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    a += (Math.PI * 2) / n * (0.55 + rng.next() * 0.9);
    const rad = size * (0.45 + rng.next() * 0.75);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad * (0.55 + rng.next() * 0.5);
    // plates are buckled, not flat
    const y = (rng.next() - 0.5) * size * 0.12;
    top.push(new THREE.Vector3(x, y + thickness, z));
    bot.push(new THREE.Vector3(x, y - thickness, z));
  }

  const pos = [];
  const push = (p, q, s) => { pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z); };
  for (let i = 1; i < n - 1; i++) {
    push(top[0], top[i], top[i + 1]);
    push(bot[0], bot[i + 1], bot[i]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    push(top[i], bot[i], bot[j]);
    push(top[i], bot[j], top[j]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Severed structural framing: a heavy spine with a few asymmetric collars and a
 * torn stub at one end. The collars are deliberately IRREGULAR in spacing and size —
 * evenly spaced ribs of equal height read as a comb, which is the single most
 * recognisable "procedural greeble" tell there is.
 */
function sparGeometry(rng, length = 180) {
  const parts = [];
  const w = length * (0.030 + rng.next() * 0.022);

  const spine = new THREE.BoxGeometry(w * 1.7, w * 2.3, length);
  parts.push(spine);
  // a second spine offset to one side: framing, not a stick
  const rail = new THREE.BoxGeometry(w * 0.9, w * 0.9, length * (0.55 + rng.next() * 0.35));
  rail.translate(w * 2.1, w * 0.4, rng.range(-length * 0.15, length * 0.15));
  parts.push(rail);

  const collars = rng.int(2, 4);
  let z = rng.range(-0.42, -0.25);
  for (let i = 0; i < collars; i++) {
    const h = w * (1.6 + rng.next() * 1.5);
    const collar = new THREE.BoxGeometry(w * (3.2 + rng.next() * 2.2), h, w * (0.7 + rng.next() * 0.8));
    collar.translate(w * 0.6, rng.range(-w * 0.4, w * 0.4), z * length);
    parts.push(collar);
    z += 0.16 + rng.next() * 0.26;
    if (z > 0.44) break;
  }

  // the torn end: a smaller, offset, rotated stub
  const stub = new THREE.BoxGeometry(w * 1.3, w * 1.6, length * 0.15);
  stub.rotateX(rng.range(-0.5, 0.5));
  stub.rotateY(rng.range(-0.35, 0.35));
  stub.translate(rng.range(-w, w), rng.range(-w, w), length * 0.55);
  parts.push(stub);

  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  return g;
}

/** Tumbling fragment: small convex hull. */
function chunkGeometry(rng, size = 14) {
  const pts = [];
  const s = { x: 0, y: 0, z: 0 };
  const ax = 0.5 + rng.next() * 0.6, ay = 0.4 + rng.next() * 0.7, az = 0.55 + rng.next() * 0.6;
  for (let i = 0; i < 9; i++) {
    rng.onSphere(s);
    const k = 0.6 + rng.next() * 0.6;
    pts.push(new THREE.Vector3(s.x * ax * k, s.y * ay * k, s.z * az * k).multiplyScalar(size));
  }
  const g = new ConvexGeometry(pts);
  return g;
}

/** Three orthogonal quads. Reads as a soft volume from any angle, costs 12 tris. */
function crossQuadGeometry(size = 1) {
  const a = new THREE.PlaneGeometry(size, size);
  const b = new THREE.PlaneGeometry(size, size);
  b.rotateY(Math.PI / 2);
  const c = new THREE.PlaneGeometry(size, size);
  c.rotateX(Math.PI / 2);
  const g = mergeGeometries([a, b, c], false);
  a.dispose(); b.dispose(); c.dispose();
  return g;
}

/** Box/triplanar metre UVs — the registry's debris maps are authored in metres. */
function addMetreUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  if (!nor) geometry.computeVertexNormals();
  const n2 = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(n2.getX(i)), ny = Math.abs(n2.getY(i)), nz = Math.abs(n2.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; }
    else if (ny >= nz) { u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// ---------------------------------------------------------------------------

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {Object} p.materials          the material registry
 * @param {number} [p.count]            rigid pieces; 200+ is cheap
 * @param {string[]} [p.factions]       which liveries are in the wreck
 * @param {number} [p.scorched]         0..1 share burnt to near-black
 * @param {number} [p.plumes]           frozen atmosphere billboards, 0 to disable
 * @param {number} [p.plumeColor]       palette hex
 * @param {number} [p.age]              0 fresh, 1 decades old — drives wear and plumes
 * @param {number} [p.scale]            multiplies every piece
 */
export function buildDebrisField({
  rng,
  materials,
  count = 260,
  factions = ['coalition', 'concord'],
  scorched = 0.28,
  plumes = 26,
  plumeColor = NEUTRAL.ice,
  age = 0.5,
  scale = 1,
  spin = 0.10,
  castShadows = true,
  /** Override the depth stack. A POI with no rock needs more near wreckage. */
  bands = BANDS,
} = {}) {
  const r = rng.fork('debris');
  const root = new THREE.Group();
  root.name = 'debris-field';

  // One material for every rigid piece. Instance colour does the rest.
  const rigidMat = materials.get('debris', {
    instanced: true,
    flatShading: true,
    faction: 'player',
    wear: Math.min(1, 0.45 + age * 0.5),
    scale: 1,
  });

  const KINDS = [
    { id: 'plate', share: 0.42, make: (rr) => addMetreUV(plateGeometry(rr, 38 * scale, 1.5 * scale)), sizeJitter: [0.5, 2.4], castShadow: true },
    { id: 'spar', share: 0.20, make: (rr) => addMetreUV(sparGeometry(rr, 190 * scale)), sizeJitter: [0.4, 1.8], castShadow: true },
    { id: 'chunk', share: 0.38, make: (rr) => addMetreUV(chunkGeometry(rr, 13 * scale)), sizeJitter: [0.5, 2.8], castShadow: false },
  ];

  // --- instance colours ----------------------------------------------------
  const tints = [];
  for (const f of factions) {
    const pal = getFactionPalette(f);
    tints.push(pal.base, pal.baseAlt, shade(pal.base, 0.62), pal.baseDark);
  }
  // ageing pulls everything towards oxide and carbon
  const burnt = mix(NEUTRAL.scorchCore, NEUTRAL.rockDark, 0.35);
  const tintColors = tints.map((h) => new THREE.Color().setHex(mix(h, burnt, age * 0.42), THREE.SRGBColorSpace));
  const burntColor = new THREE.Color().setHex(burnt, THREE.SRGBColorSpace);

  const geometries = [];
  const meshes = [];
  const spins = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const c = new THREE.Color();

  const _look = new THREE.Matrix4();
  const _roll = new THREE.Quaternion();
  const ORIGIN = new THREE.Vector3(0, 0, 0);
  const UP = new THREE.Vector3(0, 1, 0);
  const FWD = new THREE.Vector3(0, 0, 1);

  const totalShare = bands.reduce((a, b) => a + b.share, 0) || 1;
  const pickBand = () => {
    let x = r.next() * totalShare;
    for (const b of bands) { x -= b.share; if (x <= 0) return b; }
    return bands[bands.length - 1];
  };

  for (const kind of KINDS) {
    const n = Math.max(1, Math.round(count * kind.share));
    const geo = kind.make(r.fork(`debris:${kind.id}`));
    geometries.push(geo);

    const inst = new THREE.InstancedMesh(geo, rigidMat, n);
    inst.name = `debris-${kind.id}`;
    inst.castShadow = castShadows && kind.castShadow;
    inst.receiveShadow = true;
    inst.frustumCulled = false;

    const axes = new Float32Array(n * 3);
    const rates = new Float32Array(n);
    const phases = new Float32Array(n);
    const bases = new Float32Array(n * 3);
    const scales = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const band = pickBand();
      const a = r.next() * Math.PI * 2;
      // sqrt for area-uniform placement inside the band, biased outwards a little
      const rad = band.radius * (0.18 + Math.sqrt(r.next()) * 0.82);
      pos.set(Math.cos(a) * rad, r.gaussian(0, band.half * 0.45), Math.sin(a) * rad);
      if (Math.abs(pos.y) > band.half) pos.y = Math.sign(pos.y) * band.half * (0.6 + r.next() * 0.4);

      const k = band.size * (kind.sizeJitter[0] + Math.pow(r.next(), 1.6) * (kind.sizeJitter[1] - kind.sizeJitter[0]));
      scl.set(k * (0.75 + r.next() * 0.5), k * (0.7 + r.next() * 0.6), k * (0.75 + r.next() * 0.5));

      e.set(r.next() * 6.283, r.next() * 6.283, r.next() * 6.283);
      q.setFromEuler(e);
      m.compose(pos, q, scl);
      inst.setMatrixAt(i, m);

      if (r.next() < scorched) c.copy(burntColor).multiplyScalar(0.7 + r.next() * 0.8);
      else c.copy(tintColors[r.int(0, tintColors.length - 1)]).multiplyScalar(0.55 + r.next() * 0.75);
      inst.setColorAt(i, c);

      const s = { x: 0, y: 0, z: 0 };
      r.onSphere(s);
      axes[i * 3] = s.x; axes[i * 3 + 1] = s.y; axes[i * 3 + 2] = s.z;
      rates[i] = r.gaussian(0, spin) * (1.4 - band.size * 0.5);
      phases[i] = r.next() * 6.283;
      bases[i * 3] = pos.x; bases[i * 3 + 1] = pos.y; bases[i * 3 + 2] = pos.z;
      scales[i * 3] = scl.x; scales[i * 3 + 1] = scl.y; scales[i * 3 + 2] = scl.z;
    }

    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    root.add(inst);
    meshes.push(inst);
    spins.push({ inst, n, axes, rates, phases, bases, scales });
  }

  // --- frozen atmosphere ---------------------------------------------------
  let plumeMesh = null;
  let plumeGeo = null;
  if (plumes > 0) {
    plumeGeo = crossQuadGeometry(1);
    geometries.push(plumeGeo);
    // Dim on purpose. A vent plume that reaches the bloom threshold turns into a
    // lens flare, and a field of lens flares is not a battlefield.
    const plumeMat = materials.get('engineGlow', {
      instanced: true,
      faction: 'player',
      color: plumeColor,
      intensity: 0.10 + (1 - age) * 0.22,
    });
    plumeMesh = new THREE.InstancedMesh(plumeGeo, plumeMat, plumes);
    plumeMesh.name = 'debris-plumes';
    plumeMesh.frustumCulled = false;
    plumeMesh.renderOrder = 6;
    const pc = new THREE.Color().setHex(plumeColor, THREE.SRGBColorSpace);
    for (let i = 0; i < plumes; i++) {
      const band = pickBand();
      const a = r.next() * Math.PI * 2;
      const rad = band.radius * (0.2 + Math.sqrt(r.next()) * 0.8);
      pos.set(Math.cos(a) * rad, r.gaussian(0, band.half * 0.4), Math.sin(a) * rad);
      const k = (60 + r.next() * 150) * band.size * scale;
      scl.set(k, k * (0.7 + r.next() * 0.8), k);
      // Aim the dominant quad at the play area rather than at a random angle: a
      // crossed billboard caught edge on reads as a hard four-pointed star, which
      // looks like a lens artefact and not like escaping atmosphere.
      _look.lookAt(pos, ORIGIN, UP);
      q.setFromRotationMatrix(_look);
      q.multiply(_roll.setFromAxisAngle(FWD, r.next() * 6.283));
      m.compose(pos, q, scl);
      plumeMesh.setMatrixAt(i, m);
      c.copy(pc).multiplyScalar(0.10 + r.next() * 0.42);
      plumeMesh.setColorAt(i, c);
    }
    plumeMesh.instanceMatrix.needsUpdate = true;
    if (plumeMesh.instanceColor) plumeMesh.instanceColor.needsUpdate = true;
    plumeMesh.computeBoundingSphere();
    root.add(plumeMesh);
    meshes.push(plumeMesh);
  }

  const _q = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _scl = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  let t = 0;

  return {
    object: root,
    meshes,
    count: spins.reduce((a, s) => a + s.n, 0) + plumes,
    plumes: plumeMesh,
    update(dt) {
      t += dt;
      for (const s of spins) {
        for (let i = 0; i < s.n; i++) {
          _axis.set(s.axes[i * 3], s.axes[i * 3 + 1], s.axes[i * 3 + 2]);
          _q.setFromAxisAngle(_axis, s.phases[i] + s.rates[i] * t);
          _pos.set(s.bases[i * 3], s.bases[i * 3 + 1], s.bases[i * 3 + 2]);
          _scl.set(s.scales[i * 3], s.scales[i * 3 + 1], s.scales[i * 3 + 2]);
          _m.compose(_pos, _q, _scl);
          s.inst.setMatrixAt(i, _m);
        }
        s.inst.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const mesh of meshes) mesh.dispose?.();
      root.clear();
    },
  };
}
