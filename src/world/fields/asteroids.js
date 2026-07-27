/**
 * ASTEROID FIELD.
 *
 * This lives in `world.scene` — real metres, the player can fly into it — not in the
 * far scene.
 *
 * THE SCALE CUE IS THE VERTICAL VOLUME. A belt drawn as a flat annulus on the combat
 * plane reads as a texture on a floor. The same rocks distributed through a slab
 * several kilometres thick above and below y=0 read as a place, because the near
 * ones cross in front of the cruiser and the far ones sit behind it and the eye gets
 * a parallax stack for free. Capitals are plane-locked; the environment is the thing
 * that is allowed to use the third axis, so it must.
 *
 * SHAPE. Rocks are convex hulls of anisotropically scattered points, optionally
 * cleaved by one or two half-space cuts. That gives hard facets, flat fracture
 * planes and real silhouette variety at 20-60 triangles. A displaced icosphere
 * cannot do this: every rock ends up the same rock at a different size, which is the
 * single most recognisable "procedural asteroid" tell.
 *
 * DRAW CALLS. One InstancedMesh per (size class x shape variant) — twelve by
 * default, four hundred-odd rocks. Per-instance colour carries the light/dark
 * variation so one material serves a whole class.
 */

import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { NEUTRAL, mix } from '../../art/palette.js';

/** Size classes. `base` is the metre radius the geometry and its UVs are authored at. */
export const SIZE_CLASSES = [
  { id: 'grit', base: 14, count: 300, points: 8, cleaves: 0, ore: 0.05, castShadow: false, spread: 1.00 },
  { id: 'small', base: 55, count: 150, points: 12, cleaves: 1, ore: 0.10, castShadow: true, spread: 0.92 },
  { id: 'medium', base: 210, count: 48, points: 16, cleaves: 1, ore: 0.20, castShadow: true, spread: 0.80 },
  { id: 'large', base: 700, count: 12, points: 22, cleaves: 2, ore: 0.30, castShadow: true, spread: 0.62 },
];

/**
 * Convex hull rock. Points are scattered on an anisotropic ellipsoid with radial
 * jitter, then optionally clipped against random planes to give flat fracture faces.
 */
function rockGeometry(rng, radius, nPoints, cleaves) {
  const pts = [];
  const ax = 0.55 + rng.next() * 0.55;
  const ay = 0.45 + rng.next() * 0.65;
  const az = 0.60 + rng.next() * 0.50;
  const s = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < nPoints; i++) {
    rng.onSphere(s);
    // a few points pushed well out become the corners that define the silhouette
    const k = rng.next() < 0.22 ? 1.05 + rng.next() * 0.42 : 0.62 + rng.next() * 0.34;
    pts.push(new THREE.Vector3(s.x * ax * k, s.y * ay * k, s.z * az * k).multiplyScalar(radius));
  }

  // Cleave: clamp every point into a half-space, which flattens one whole side
  // into a fracture face. Shallow on purpose — cut too deep and a 16-point hull
  // collapses into a wedge, and a field of wedges reads as a bag of dice.
  for (let c = 0; c < cleaves; c++) {
    rng.onSphere(s);
    const n = new THREE.Vector3(s.x, s.y, s.z).normalize();
    const d = radius * (0.58 + rng.next() * 0.30);
    for (const p of pts) {
      const over = p.dot(n) - d;
      if (over > 0) p.addScaledVector(n, -over);
    }
  }

  const g = new ConvexGeometry(pts);
  // ConvexGeometry emits per-face normals already, but no UVs.
  addMetreUV(g);
  g.computeBoundingSphere();
  return g;
}

/**
 * Box/triplanar projection in METRES from the dominant face normal. The registry's
 * rock texture is authored at one UV unit = one metre, so this has to be in metres
 * or every rock gets a different apparent grain size.
 */
function addMetreUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
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

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {Object} p.materials         the material registry
 * @param {number} [p.innerRadius]     metres
 * @param {number} [p.outerRadius]     metres
 * @param {number} [p.halfHeight]      metres of vertical volume, each way
 * @param {number} [p.density]         multiplier on every class count
 * @param {number} [p.variants]        shape variants per class
 * @param {number[]} [p.clumps]        [count, radius] — local density knots
 * @param {number} [p.tint]            palette hex for the rock albedo
 * @param {number} [p.spin]            mean rotation rate, rad/s
 */
export function buildAsteroidField({
  rng,
  materials,
  innerRadius = 2600,
  outerRadius = 26000,
  halfHeight = 5200,
  density = 1,
  variants = 3,
  clumpCount = 5,
  clumpRadius = 4200,
  tint = NEUTRAL.rock,
  spin = 0.035,
  castShadows = true,
} = {}) {
  const r = rng.fork('asteroids');
  const root = new THREE.Group();
  root.name = 'asteroid-field';

  // clump centres: gives the belt local structure instead of uniform confetti
  const clumps = [];
  for (let i = 0; i < clumpCount; i++) {
    const a = r.next() * Math.PI * 2;
    const rad = innerRadius + Math.pow(r.next(), 0.7) * (outerRadius - innerRadius);
    clumps.push(new THREE.Vector3(
      Math.cos(a) * rad,
      r.gaussian(0, halfHeight * 0.30),
      Math.sin(a) * rad,
    ));
  }

  const meshes = [];
  const geometries = [];
  const spins = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const c = new THREE.Color();

  const light = mix(tint, NEUTRAL.select, 0.28);
  const dark = mix(tint, NEUTRAL.rockDark, 0.62);
  const ore = mix(tint, NEUTRAL.rockOre, 0.45);
  const cLight = new THREE.Color().setHex(light, THREE.SRGBColorSpace);
  const cDark = new THREE.Color().setHex(dark, THREE.SRGBColorSpace);
  const cOre = new THREE.Color().setHex(ore, THREE.SRGBColorSpace);

  for (const cls of SIZE_CLASSES) {
    const total = Math.max(0, Math.round(cls.count * density));
    if (!total) continue;

    const material = materials.get('asteroid', {
      instanced: true,
      flatShading: true,
      tint,
      ore: cls.ore,
      scale: Math.max(0.25, Math.min(4, cls.base / 55)),
    });

    // split the class across shape variants
    const per = Math.ceil(total / variants);
    for (let vI = 0; vI < variants; vI++) {
      const n = Math.min(per, total - vI * per);
      if (n <= 0) break;

      const geo = rockGeometry(r.fork(`rock:${cls.id}:${vI}`), cls.base, cls.points, cls.cleaves);
      geometries.push(geo);

      const inst = new THREE.InstancedMesh(geo, material, n);
      inst.name = `asteroids-${cls.id}-${vI}`;
      inst.castShadow = castShadows && cls.castShadow;
      inst.receiveShadow = true;
      inst.frustumCulled = false;

      const axes = new Float32Array(n * 3);
      const rates = new Float32Array(n);
      const phases = new Float32Array(n);
      const bases = new Float32Array(n * 3);
      const scales = new Float32Array(n * 3);

      for (let i = 0; i < n; i++) {
        // half the rocks belong to a clump, half are field
        if (r.bool(0.55) && clumps.length) {
          const k = clumps[r.int(0, clumps.length - 1)];
          pos.set(
            k.x + r.gaussian(0, clumpRadius),
            k.y + r.gaussian(0, clumpRadius * 0.55),
            k.z + r.gaussian(0, clumpRadius),
          );
        } else {
          const a = r.next() * Math.PI * 2;
          const rad = innerRadius + Math.pow(r.next(), 0.62) * (outerRadius - innerRadius) * cls.spread;
          pos.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        }
        // THE vertical volume. Gaussian, so the belt has a dense core and thins
        // out rather than ending at a hard ceiling.
        pos.y = r.gaussian(0, halfHeight * 0.42);
        if (Math.abs(pos.y) > halfHeight) pos.y = Math.sign(pos.y) * halfHeight * (0.7 + r.next() * 0.3);

        const k = 0.55 + Math.pow(r.next(), 1.7) * 1.25;
        scl.set(k * (0.7 + r.next() * 0.6), k * (0.62 + r.next() * 0.7), k * (0.7 + r.next() * 0.6));

        e.set(r.next() * 6.283, r.next() * 6.283, r.next() * 6.283);
        q.setFromEuler(e);
        m.compose(pos, q, scl);
        inst.setMatrixAt(i, m);

        // value variation: this is what stops a class reading as one repeated rock
        const t = r.next();
        c.copy(t < 0.14 ? cOre : cDark).lerp(cLight, Math.pow(r.next(), 1.5));
        inst.setColorAt(i, c);

        const s = { x: 0, y: 0, z: 0 };
        r.onSphere(s);
        axes[i * 3] = s.x; axes[i * 3 + 1] = s.y; axes[i * 3 + 2] = s.z;
        rates[i] = r.gaussian(0, spin) * (55 / cls.base) ** 0.5;
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
  }

  // scratch, reused every frame
  const _q = new THREE.Quaternion();
  const _axis = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _scl = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  let t = 0;

  return {
    object: root,
    meshes,
    /** Total instances across every class. */
    count: spins.reduce((a, s) => a + s.n, 0),
    /**
     * Real rotation. Recomposes matrices from the stored base pose, so it never
     * drifts and never allocates.
     */
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
