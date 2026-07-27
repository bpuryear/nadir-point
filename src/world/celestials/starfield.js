/**
 * STARFIELD.
 *
 * Not white dots. Three things separate a real starfield from a particle emitter:
 *
 * 1. MAGNITUDE DISTRIBUTION. The number of stars brighter than magnitude m grows
 *    roughly as 10^(0.6m) — for every naked-eye star there are hundreds you can
 *    barely resolve. Sampling brightness uniformly gives a flat, grey, "static"
 *    sky. Here magnitude is drawn from that power law by inverse CDF and flux is
 *    10^(-0.4m), so the frame contains a handful of genuinely bright anchors and
 *    thousands of near-threshold specks. That ratio is what makes it read as sky.
 *
 * 2. COLOUR FROM TEMPERATURE, CORRELATED WITH BRIGHTNESS. Hot stars are rare but
 *    over-represented among the bright ones because they are luminous. So the
 *    temperature draw is biased by flux. The ramp itself is built from the locked
 *    palette (see common.js#STELLAR_RAMP) rather than from a blackbody curve — the
 *    sky must not introduce hues the ships cannot answer.
 *
 * 3. NO SCINTILLATION. gl_PointSize is constant in PIXELS (no size attenuation) and
 *    the sprite has a flat core several texels across, so a star is never a single
 *    hot texel flickering between samples as the camera rotates. This is the single
 *    most common failure in a procedural starfield and it is a one-line cause.
 *
 * One THREE.Points, one draw call, one program.
 */

import * as THREE from 'three';
import { ORDER, markCelestial, softPointTexture, stellarColor, clamp01 } from './common.js';

const MAG_MIN = -1.4;
const MAG_MAX = 6.7;
const MAG_SLOPE = 0.58;      // log-slope of the cumulative count function

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {number} [p.count]        how many stars
 * @param {number} [p.radius]       far-scene shell radius
 * @param {number} [p.gain]         overall brightness multiplier
 * @param {number} [p.pixelRatio]
 * @param {number} [p.bandDensity]  0 = uniform sky, 1 = a strong galactic band
 * @param {[number,number,number]} [p.bandAxis] pole of the galactic band
 * @returns {{object:THREE.Points, material:THREE.ShaderMaterial, setGain:Function, setPixelRatio:Function, dispose:Function}}
 */
export function buildStarfield({
  rng,
  count = 5200,
  radius = 30000,
  gain = 1.0,
  pixelRatio = 1,
  bandDensity = 0.55,
  bandAxis = [0.32, 0.86, -0.40],
} = {}) {
  const r = rng.fork('starfield');

  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const flux = new Float32Array(count);

  const axis = new THREE.Vector3(bandAxis[0], bandAxis[1], bandAxis[2]).normalize();
  const p = { x: 0, y: 0, z: 0 };
  const c = new THREE.Color();
  const v = new THREE.Vector3();

  // inverse CDF constants for the magnitude power law
  const k = MAG_SLOPE;
  const lo = Math.pow(10, k * MAG_MIN);
  const hi = Math.pow(10, k * MAG_MAX);

  for (let i = 0; i < count; i++) {
    // --- placement: uniform sphere, then rejection-thinned towards a band ----
    let tries = 0;
    do {
      r.onSphere(p);
      v.set(p.x, p.y, p.z);
      tries++;
      // |cos| to the band pole: 0 in the band plane, 1 at the poles
      const t = Math.abs(v.dot(axis));
      const keep = 1 - bandDensity * clamp01((t - 0.12) / 0.88);
      if (r.next() < keep || tries > 6) break;
    } while (true);

    position[i * 3] = v.x * radius;
    position[i * 3 + 1] = v.y * radius;
    position[i * 3 + 2] = v.z * radius;

    // --- magnitude -> flux --------------------------------------------------
    const u = r.next();
    const mag = Math.log10(lo + u * (hi - lo)) / k;
    // normalised so a magnitude MAG_MIN star sits at 1 and the faintest at ~6e-4
    const fn = clamp01(Math.pow(10, -0.4 * (mag - MAG_MIN)));
    flux[i] = fn;

    // --- temperature, biased hot for the bright ones ------------------------
    const bias = Math.pow(fn, 0.45);
    const temp = clamp01(r.next() * (1 - bias * 0.55) + bias * 0.55 * (0.45 + r.next() * 0.55));
    stellarColor(temp, c);
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b;

    // --- screen size: sqrt of flux, floored so nothing is sub-pixel ---------
    size[i] = 1.9 + 9.4 * Math.pow(fn, 0.62) + (fn > 0.55 ? 3.2 * (fn - 0.55) : 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aFlux', new THREE.BufferAttribute(flux, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.01);
  geo.name = 'starfield';

  const sprite = softPointTexture({ size: 64, core: 0.16, falloff: 2.9, name: 'star-sprite' });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSprite: { value: sprite },
      uGain: { value: gain },
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aFlux;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vFlux;
      void main() {
        vColor = aColor;
        vFlux = aFlux;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // constant in pixels: no attenuation, therefore no crawl on rotate
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uSprite;
      uniform float uGain;
      varying vec3 vColor;
      varying float vFlux;
      void main() {
        float a = texture2D(uSprite, gl_PointCoord).a;
        // faint stars stay inside the dither's reach; the top few percent are
        // pushed past the 1.05 bloom threshold so the sky has real anchors.
        float amp = mix(0.10, 2.35, pow(vFlux, 0.85));
        gl_FragColor = vec4(vColor * amp * uGain * a, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: true,
    fog: false,
  });
  markCelestial(material, 'starfield');

  const object = new THREE.Points(geo, material);
  object.name = 'starfield';
  object.renderOrder = ORDER.stars;
  object.frustumCulled = false;
  object.matrixAutoUpdate = false;
  object.updateMatrix();

  return {
    object,
    material,
    count,
    setGain(g) { material.uniforms.uGain.value = g; },
    setPixelRatio(pr) { material.uniforms.uPixelRatio.value = pr; },
    dispose() {
      geo.dispose();
      material.dispose();
      sprite.dispose();
    },
  };
}
