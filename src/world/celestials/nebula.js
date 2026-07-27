/**
 * NEBULA.
 *
 * The failure mode this file exists to avoid is a flat coloured gradient painted
 * across the whole sky. That reads as a backdrop, it kills the black point, and it
 * makes every ship in front of it look like a sticker.
 *
 * What produces DEPTH instead:
 *
 *   * LAYERS AT DIFFERENT RADII, some of which the gas giant occludes and some of
 *     which pass in front of it. Occlusion is the only depth cue in a backdrop that
 *     survives a still frame, so we spend far-scene depth on it deliberately.
 *   * DARK DUST IN FRONT OF GLOW. An additive-only nebula can only ever get
 *     brighter, so it flattens. The near layers include normal-blended near-black
 *     lanes that eat the glow behind them. That silhouette is what sells volume.
 *   * NEGATIVE SPACE. Emission is confined to a band about one radian wide across a
 *     single region of the sky. Everything else is empty. A nebula that fills the
 *     sky has no contrast left to spend on the ships.
 *
 * Cost: three merged geometries (back glow / front glow / dust) and three shared
 * textures, so the entire nebula is 3 draw calls regardless of layer count. Colour
 * varies per layer through a vertex-colour attribute rather than per-material.
 */

import * as THREE from 'three';
import {
  ORDER, markCelestial, col, planarFbm, clamp01, smoothstep, lerp,
  quadBuffers, faceOriginQuad, finishQuads,
} from './common.js';
import { makeCanvas, ctx2d } from '../../art/textures/canvas2d.js';

/**
 * One nebula sheet: billowy emission with holes, a hard-ish leading edge, and an
 * alpha that falls to zero well inside the quad so the square never shows.
 *
 * `filament` mixes in a ridged field, which is what gives the thin bright strands
 * that make a nebula look like it has structure rather than fog.
 */
function sheetTexture(rng, {
  size = 256, cells = 3, octaves = 6, filament = 0.45,
  threshold = 0.44, sharpness = 0.42, holes = 0.55, name = 'nebula-sheet',
} = {}) {
  const base = planarFbm(rng.fork(`${name}:base`), { cells, octaves, gain: 0.55 });
  const ridge = planarFbm(rng.fork(`${name}:ridge`), { cells: cells * 2, octaves: 4, gain: 0.5, ridged: true });
  const warpX = planarFbm(rng.fork(`${name}:wx`), { cells: 2, octaves: 3 });
  const warpY = planarFbm(rng.fork(`${name}:wy`), { cells: 2, octaves: 3 });
  const hole = planarFbm(rng.fork(`${name}:hole`), { cells: 2, octaves: 4 });

  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;

      // domain warp — turns concentric blobs into curled sheets
      const wx = u + (warpX(u, v) - 0.5) * 0.34;
      const wy = v + (warpY(u, v) - 0.5) * 0.34;

      let n = base(wx, wy);
      n = lerp(n, ridge(wx * 1.3, wy * 1.3), filament);

      // holes: the negative space that keeps it from becoming fog
      const h = hole(u * 0.7, v * 0.7);
      n *= smoothstep(0.30, 0.62, h + (1 - holes) * 0.35);

      // radial falloff so the quad edge is never visible
      const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
      const rr = Math.sqrt(dx * dx + dy * dy);
      n *= smoothstep(1.02, 0.18, rr);

      let a = clamp01((n - threshold) / (1 - threshold));
      a = Math.pow(a, 1 + sharpness * 3);

      // RGB carries a two-tone core/edge so a single tint still reads as gas with
      // a hot interior rather than as one flat colour.
      const hot = clamp01((a - 0.30) / 0.70);
      const o = (y * size + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 150 + hot * 105;
      img.data[o + 2] = 110 + hot * 145;
      img.data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(canvas);
  t.name = name;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function sheetMaterial(map, { additive, order, opacity, name }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uOpacity: { value: opacity },
      uAdditive: { value: additive ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aTint;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv;
        vColor = aTint;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uOpacity;
      uniform float uAdditive;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vec4 s = texture2D(uMap, vUv);
        if (uAdditive > 0.5) {
          // hot core reads through the tint: s.gb lifts the interior
          vec3 c = vColor * (0.55 + 0.45 * s.g) * s.a * uOpacity;
          gl_FragColor = vec4(c, 1.0);
        } else {
          // dust: occludes what is behind it, tint is a near-black lane colour
          gl_FragColor = vec4(vColor, s.a * uOpacity);
        }
      }
    `,
    transparent: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    depthTest: order >= ORDER.frontGlow,
    side: THREE.DoubleSide,
    toneMapped: true,
    fog: false,
  });
  m.name = name;
  markCelestial(m, name);
  return m;
}

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {number[]} p.tints            2-4 palette hexes for the emission layers
 * @param {number} p.dustTint           near-black hex for the occluding lanes
 * @param {[number,number,number]} p.centre  unit direction the band is centred on
 * @param {number} [p.spread]           angular half-width of the band, radians
 * @param {number} [p.layers]           emission sheets
 * @param {number} [p.dustLayers]
 * @param {number} [p.intensity]
 * @param {number} [p.radius]           mean far-scene radius of the band
 * @param {number} [p.frontRadius]      radius of the sheets that pass in front
 */
export function buildNebula({
  rng,
  tints,
  dustTint = 0x02030a,
  centre = [-0.55, 0.22, -0.80],
  spread = 0.62,
  layers = 11,
  dustLayers = 4,
  intensity = 1.0,
  radius = 21000,
  frontRadius = 4200,
  scale = 1.0,
} = {}) {
  const r = rng.fork('nebula');
  const root = new THREE.Group();
  root.name = 'nebula';
  root.matrixAutoUpdate = false;

  // Three sheet textures, reused across layers. More than three and the memory
  // cost climbs without the eye ever noticing; fewer and repeats become legible.
  const sheets = [
    sheetTexture(r, { size: 256, cells: 3, filament: 0.30, threshold: 0.46, holes: 0.62, name: 'neb-a' }),
    sheetTexture(r, { size: 256, cells: 4, filament: 0.62, threshold: 0.50, holes: 0.48, name: 'neb-b' }),
    sheetTexture(r, { size: 256, cells: 2, filament: 0.18, threshold: 0.38, holes: 0.72, name: 'neb-c' }),
  ];

  const axis = new THREE.Vector3(centre[0], centre[1], centre[2]).normalize();
  // an orthonormal frame around the band centre
  const tangent = new THREE.Vector3(0, 1, 0);
  if (Math.abs(axis.y) > 0.9) tangent.set(1, 0, 0);
  const bx = new THREE.Vector3().crossVectors(axis, tangent).normalize();
  const by = new THREE.Vector3().crossVectors(bx, axis).normalize();

  const backBufs = sheets.map(() => quadBuffers());
  const frontBufs = sheets.map(() => quadBuffers());
  const dustBufs = sheets.map(() => quadBuffers());

  const tintColors = tints.map((t) => col(t));
  const dust = col(dustTint);
  const pos = new THREE.Vector3();

  const place = (spreadScale, radiusBase, radiusJitter) => {
    // elongated along bx: a band, not a blob
    const a = (r.next() * 2 - 1) * spread * spreadScale * 1.55;
    const b = r.gaussian(0, spread * spreadScale * 0.34);
    pos.copy(axis).addScaledVector(bx, a).addScaledVector(by, b).normalize();
    pos.multiplyScalar(radiusBase * (1 + (r.next() * 2 - 1) * radiusJitter));
    return pos;
  };

  // --- emission behind the planet -----------------------------------------
  for (let i = 0; i < layers; i++) {
    const si = r.int(0, sheets.length - 1);
    const p = place(1.0, radius, 0.30).clone();
    const s = radius * scale * (0.30 + r.next() * 0.55);
    const tint = tintColors[r.int(0, tintColors.length - 1)].clone();
    // depth by value: further layers dimmer and cooler
    const dim = 0.45 + r.next() * 0.55;
    tint.multiplyScalar(intensity * dim);
    faceOriginQuad(p, s, s * (0.62 + r.next() * 0.62), r.next() * Math.PI * 2, tint, backBufs[si]);
  }

  // --- emission in front, occluded by the planet ---------------------------
  const frontCount = Math.max(2, Math.round(layers * 0.36));
  for (let i = 0; i < frontCount; i++) {
    const si = r.int(0, sheets.length - 1);
    const p = place(1.25, frontRadius, 0.35).clone();
    const s = frontRadius * scale * (0.55 + r.next() * 0.85);
    const tint = tintColors[r.int(0, tintColors.length - 1)].clone();
    tint.multiplyScalar(intensity * (0.30 + r.next() * 0.40));
    faceOriginQuad(p, s, s * (0.5 + r.next() * 0.7), r.next() * Math.PI * 2, tint, frontBufs[si]);
  }

  // --- dust lanes: near-black, normal-blended, in front of the glow --------
  for (let i = 0; i < dustLayers; i++) {
    const si = r.int(0, sheets.length - 1);
    const p = place(1.05, frontRadius * 1.35, 0.22).clone();
    const s = frontRadius * 1.35 * scale * (0.55 + r.next() * 0.75);
    faceOriginQuad(p, s, s * (0.30 + r.next() * 0.40), r.next() * Math.PI * 2, dust, dustBufs[si]);
  }

  const materials = [];
  const geometries = [];

  const emit = (bufs, additive, order, opacity, label) => {
    for (let i = 0; i < bufs.length; i++) {
      if (!bufs[i].index.length) continue;
      const g = finishQuads(bufs[i], `${label}-${i}`);
      const m = sheetMaterial(sheets[i], { additive, order, opacity, name: `${label}-${i}` });
      const mesh = new THREE.Mesh(g, m);
      mesh.name = `${label}-${i}`;
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      materials.push(m);
      geometries.push(g);
    }
  };

  emit(backBufs, true, ORDER.backGlow, 1.0, 'nebula-back');
  emit(frontBufs, true, ORDER.frontGlow, 1.0, 'nebula-front');
  emit(dustBufs, false, ORDER.dust, 0.92, 'nebula-dust');

  root.updateMatrix();

  return {
    object: root,
    materials,
    setIntensity(k) { for (const m of materials) if (m.uniforms.uAdditive.value > 0.5) m.uniforms.uOpacity.value = k; },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of sheets) t.dispose();
    },
  };
}
