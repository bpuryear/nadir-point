/**
 * THE SKY DOME — the coloured darkness.
 *
 * WHY THIS FILE EXISTS, MEASURED.
 *
 * `docs/design/reference-frames.md` §0: in all six of the owner's reference frames the
 * background is a large, saturated, luminous object; in ours it was black. That was not
 * a figure of speech. Measured on the live game with a background mask built by
 * rendering each pose twice (once normally, once with `world.scene` hidden, so the
 * pixels that do not change ARE the background):
 *
 *   engagement   background median luma 0.0261, 2.1% of frame above luma 0.06
 *   wide         background median luma 0.0146, 18.7%
 *   close        background median luma 0.0076, 34.0%
 *
 * against R1's targets of median >= 0.10 and >= 40% of frame above 0.06.
 *
 * The graveyard authors 7200 stars and a 14-layer nebula and NONE of it read, for a
 * reason that is geometric and not a matter of intensity: the nebula band was aimed at
 * `[-0.62, 0.10, 0.78]` and the tactical camera at the shipped `engagement` pose looks
 * along `(-0.316, -0.586, -0.746)`. That is **116.4 degrees apart** — the band was
 * behind the camera. `close` measured 147.7 degrees, `wide` 55.2. Re-aiming the band
 * (see `celestials/index.js`) fixes the framings it can reach, but it cannot fix all of
 * them at once, because the tactical camera's yaw is free and a band is directional by
 * design (`nebula.js`: "a nebula that fills the sky has no contrast left to spend on
 * the ships").
 *
 * So the band stays a band, and THIS carries the floor. EVE Frontier is the proof in
 * the reference set: near-monochrome, very dark, and it works because **the darkness is
 * coloured rather than black**. One inward-facing sphere, one draw call, one program,
 * no texture:
 *
 *   * an ECLIPTIC BAND — brightest near the combat plane, falling to the poles, with
 *     the hue leaning one way above the plane and the other below. So the dome is
 *     never one flat wash, which is the "backdrop" failure `nebula.js` is written
 *     against;
 *   * plus a broad lobe of the POI's field hue centred on the same axis the nebula
 *     band is centred on, so the location's colour comes FROM somewhere.
 *
 * THE BAND IS NOT A TOP-TO-BOTTOM RAMP, AND THE FIRST VERSION OF THIS FILE HAD IT
 * BACKWARDS. A vertical `mix(ground, zenith, y)` puts one end of the value range
 * below the plane — and the tactical camera pitches 12 to 36 degrees DOWN, so below
 * the plane is where most of every frame points. Measured at the `close` pose, whose
 * view axis is at y = -0.238, that ramp delivered 68% of its value range to sky the
 * frame does not contain. A band centred on the plane is also the physically honest
 * shape: a system's dust lies in its ecliptic, which is the plane the game is fought
 * on.
 *
 * It is deliberately dim. Calibrated against measured frames (out ~= 1.111 * L^0.643
 * through ACES, the POI grade and the vignette, fitted on the `close`/`wide` pair),
 * the lobe peak is authored to land near sRGB 0.18 and the anti-lobe near 0.06 — a
 * range you would call black if you saw it next to a lit hull, which is the point. It
 * raises the floor off zero and gives the floor a hue; it does not light the scene.
 *
 * DEPTH AND ORDER. `ORDER.dome` is -1: depth test and depth write both off, drawn
 * before the starfield, so nothing about the existing layering contract moves. The
 * radius only has to put the sphere inside the far camera's frustum
 * (`FAR_SCENE.radius * 4`); it plays no part in ordering.
 */

import * as THREE from 'three';
import { ORDER, markCelestial, col } from './common.js';

/**
 * @param {Object} p
 * @param {number} [p.radius]      far-scene shell radius; only has to be in frustum
 * @param {[number,number,number]} [p.axis]  direction the field's hue comes from
 * @param {number} [p.spread]      angular radius of the lobe, radians
 * @param {number} p.core          palette hex: the field hue at its strongest
 * @param {number} p.zenith        palette hex: the band's tint above the plane
 * @param {number} p.ground        palette hex: the band's tint below the plane
 * @param {number} [p.gain]        multiplier on the lobe
 * @param {number} [p.baseGain]    multiplier on the ecliptic band
 * @param {number} [p.mottle]      +/- fraction of very-low-frequency variation
 * @param {number} [p.segments]
 * @returns {{object:THREE.Mesh, material:THREE.ShaderMaterial,
 *            setGain:Function, dispose:Function}}
 */
export function buildSkyDome({
  radius = 28000,
  axis = [0, 0, -1],
  spread = 1.15,
  core,
  zenith,
  ground,
  gain = 1.0,
  baseGain = 1.0,
  mottle = 0.34,
  segments = 32,
} = {}) {
  const geo = new THREE.SphereGeometry(radius, segments, Math.max(8, segments >> 1));
  geo.name = 'sky-dome';

  const a = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAxis: { value: a },
      uCore: { value: col(core) },
      uZenith: { value: col(zenith) },
      uGround: { value: col(ground) },
      // The lobe is stated as an ANGULAR RADIUS and converted to the two cosines the
      // shader interpolates between, so the authored number means what it says.
      uLobe: { value: new THREE.Vector2(Math.cos(Math.min(Math.PI, spread * 1.75)), Math.cos(spread * 0.22)) },
      uGain: { value: gain },
      uBase: { value: baseGain },
      uMottle: { value: mottle },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uAxis, uCore, uZenith, uGround;
      uniform vec2 uLobe;
      uniform float uGain, uBase;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);

        // 1. the floor: an ecliptic band. Value peaks at the combat plane and falls to
        //    the poles; hue leans to uGround below the plane and uZenith above it. The
        //    0.30 residual is what keeps the poles coloured rather than black.
        float b = 1.0 - smoothstep(0.06, 0.92, abs(d.y));
        vec3 base = mix(uGround, uZenith, smoothstep(-0.55, 0.55, d.y));
        vec3 c = base * (0.30 + 0.70 * b * b) * uBase;

        // 2. the lobe: the location's hue, centred where its nebula bank is. Squared
        //    so the falloff has a shoulder rather than a linear ramp, which is what
        //    keeps it reading as distant gas and not as a vignette.
        float t = smoothstep(uLobe.x, uLobe.y, dot(d, uAxis));
        c += uCore * (t * t) * uGain;

        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
    fog: false,
  });
  markCelestial(mat, 'sky-dome');

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky-dome';
  mesh.renderOrder = ORDER.dome;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    object: mesh,
    material: mat,
    /** Live handle for probes and for anything that wants to prove the dome is the source. */
    setGain(k) { mat.uniforms.uGain.value = k; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
