/**
 * THE SYSTEM PRIMARY.
 *
 * No lens flare. Flares are a lens artefact and they read as a screen effect, which
 * is exactly the opposite of what this needs to do — the star has to sit in the
 * world so the key light has a visible source and the god-ray pass has something
 * honest to aim at.
 *
 * Instead it is built to FEED THE BLOOM the post chain already runs (threshold 1.05
 * in linear HDR):
 *
 *   * a small, extremely hot core — colour multiplied far past 1, so the bloom pass
 *     turns it into a real light source rather than a white dot,
 *   * two corona shells at increasing radius and decreasing exponent, which give the
 *     bloom a gradient to spread along so the falloff looks like light rather than
 *     like a blurred circle,
 *   * an optional wide, very dim outer halo for the 'near-star' case where the star
 *     dominates the whole frame.
 *
 * The returned `keyDirection` is the single source of truth for the POI's key light
 * direction — the lighting rig reads it, so the sun you can see and the shadows on
 * the hull can never disagree.
 */

import * as THREE from 'three';
import { ORDER, markCelestial, col, glowTexture } from './common.js';

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {THREE.Vector3} p.direction   unit direction from the camera to the star
 * @param {number} [p.distance]         far-scene distance
 * @param {number} [p.angularRadius]    apparent radius, radians
 * @param {number} p.core               palette hex of the disc
 * @param {number} p.halo               palette hex of the corona
 * @param {number} [p.coreGain]         linear multiplier on the disc (>> 1)
 * @param {number} [p.haloGain]
 * @param {number} [p.shells]           corona shells, 2 or 3
 * @param {boolean} [p.wideHalo]        add the dim frame-filling outer halo
 */
export function buildStar({
  rng,
  direction = new THREE.Vector3(-0.72, 0.30, 0.62),
  distance = 24000,
  angularRadius = 0.010,
  core,
  halo,
  coreGain = 26,
  haloGain = 2.2,
  shells = 3,
  wideHalo = false,
} = {}) {
  const r = rng.fork('star');
  const dir = direction.clone().normalize();

  const root = new THREE.Group();
  root.name = 'star';
  root.position.copy(dir).multiplyScalar(distance);
  // face the far-scene origin
  root.lookAt(0, 0, 0);
  root.renderOrder = ORDER.star;

  const discR = Math.tan(angularRadius) * distance;

  const textures = [];
  const materials = [];
  const geometries = [];

  const addShell = (radius, tex, colorHex, gain, order) => {
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2);
    const m = new THREE.MeshBasicMaterial({
      map: tex,
      color: col(colorHex).multiplyScalar(gain),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: true,
      fog: false,
    });
    markCelestial(m, 'star');
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    root.add(mesh);
    materials.push(m);
    geometries.push(g);
    return mesh;
  };

  /**
   * CORONA SHELLS, EXPLICIT AND SMALL.
   *
   * Radii are multiples of the DISC radius, and they stay in single digits on
   * purpose. A corona at forty times the disc is not a corona, it is a full-screen
   * additive quad: at the 'near-star' POI, where the disc is already three degrees
   * across, it fills the entire frame with flat grey, destroys the black point and
   * turns a dramatic lighting setup into a white-out. Every shell here stays inside
   * a few disc radii and the falloff exponents do the reach.
   */
  const CORONA = [
    { r: 2.3, gain: 1.00, power: 7.0 },
    { r: 5.4, gain: 0.28, power: 4.0 },
    { r: 12.0, gain: 0.055, power: 2.6 },
  ];

  // Outer, very dim, wide. Drawn first so the hotter shells add on top of it.
  if (wideHalo) {
    const t = glowTexture({ size: 256, power: 2.0, name: 'star-wide' });
    textures.push(t);
    addShell(discR * 26, t, halo, haloGain * 0.008, ORDER.star - 0.3);
  }

  for (let i = Math.min(shells, CORONA.length) - 1; i >= 0; i--) {
    const s = CORONA[i];
    const t = glowTexture({ size: 256, power: s.power, name: `star-corona-${i}` });
    textures.push(t);
    addShell(discR * s.r, t, halo, haloGain * s.gain, ORDER.star - 0.2 + i * 0.01);
  }

  // The disc. Hard edge, small, and hot enough that the bloom threshold catches
  // it several times over.
  const coreTex = glowTexture({ size: 128, power: 5.0, inner: 0.62, name: 'star-core' });
  textures.push(coreTex);
  addShell(discR * 1.6, coreTex, core, coreGain, ORDER.star + 0.1);

  // A little seeded variation so two stars in one build are not identical.
  root.rotateZ(r.range(0, Math.PI * 2));

  return {
    object: root,
    /** Unit direction from the observer toward the star. The POI key direction. */
    keyDirection: dir.clone(),
    distance,
    angularRadius,
    materials,
    setGain(k) {
      for (let i = 0; i < materials.length; i++) materials[i].color.multiplyScalar(k);
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
