/**
 * DUST LANES — the one thing the deleted nebula could do that a dome cannot.
 *
 * `common.js:18-27` calls front-layer occlusion "the strongest depth cue the
 * backdrop has", and it is right: the far scene clears depth before the main pass
 * and the gas giant writes depth, so anything drawn after it at a smaller radius
 * genuinely passes IN FRONT of it. A sky dome is at infinity by construction and can
 * never do that. When `docs/design/skybox-spec.md` §5 deleted `nebula.js` — 19 quads
 * worth 0.0017 of field median and exactly zero chroma — this is the capability it
 * had to hand back, and F11 is the falsifier that says to land the two separately so
 * a lost depth cue is attributable.
 *
 * ===========================================================================
 * IT SUBTRACTS. IT CANNOT ADD, AND THAT IS THE BLEND MODE, NOT A TUNING
 * ===========================================================================
 *
 * `blendSrc: ZERO, blendDst: ONE_MINUS_SRC_COLOR` makes the framebuffer operation
 *
 *   dst = dst * (1 - src)
 *
 * per channel. With a blue-heaviest `src` a lane multiplies blue down hardest and
 * red least, so it **darkens and reddens** what is behind it in one operation —
 * which is what interstellar dust does, and is Leria/Neyret's per-channel
 * `e^(-a_rgb * tau)` expressed as a blend factor instead of a shader multiply. The
 * old dust quads were `normal` blend at 0.92 opacity, i.e. they painted a
 * near-black colour ON TOP, which is a hole cut in the image rather than something
 * standing in front of light.
 *
 * The bound matters more than the hue: **no authored parameter can make one of
 * these brighter than what is behind it**, because the only arithmetic available to
 * it is a multiply by a number in [0,1]. A dust lane that is the brightest thing in
 * frame is not a dust lane, and this construction cannot produce one rather than
 * being tuned until it happens not to. That is the same argument `skydome.js` step 6
 * makes for its warm scatter term, applied to the layer in front.
 *
 * ===========================================================================
 * THE SAME FIELD FUNCTION AS THE DOME, OFFSET — NOT A FRESH RANDOM PLACEMENT
 * ===========================================================================
 *
 * `field.glsl.js` is evaluated here at the fragment's own far-scene direction with
 * the POI's own `fieldScale`/`fieldStretch`/`laneScale`, so these lanes are the same
 * cloud as the dome's, seen closer. `backgrounds-procedural.md` §2.6.1 is the source
 * and `nebula.js:237` was the counter-example: it drew a fresh random position for
 * every dust layer, "which is why the lanes never sit on the emission they are
 * supposed to obscure".
 *
 * `domainOffset` is small and deliberate. At exactly zero these quads would land on
 * the dome's lanes to the pixel and simply double the absorption there; a nearby
 * offset gives a related-but-nearer cloud, which is what the parallax between a
 * 6 km shell and a dome at infinity should look like.
 *
 * NO TEXTURE. The profile is analytic, so there is no `CanvasTexture`, no
 * premultiplied-alpha D35 exposure, and no 256^2 x mips of texture memory — the
 * three sheets the deleted module carried were 1.0 MB between them.
 *
 * COST: 2-4 quads, ONE draw call, one program, `FIELD_TAPS.noiseEvals` taps over
 * the covered area only rather than over 100% of frame the way the dome pays them.
 */

import * as THREE from 'three';
import { ORDER, markCelestial, faceOriginQuad, quadBuffers, finishQuads } from './common.js';
import { FIELD_GLSL, FIELD_TAPS } from './field.glsl.js';

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {number} [p.count]        how many quads. 2-4; more is a wash, not lanes.
 * @param {number} [p.radius]       far-scene shell radius. MUST be smaller than the
 *                                  gas giant's `distance` or the depth test rejects
 *                                  these and the whole point is lost.
 * @param {number} [p.spread]       how far off `axis` the quads are scattered, rad
 * @param {[number,number,number]} [p.axis] bearing the lanes are hung on
 * @param {[number,number,number]} [p.bandAxis] pole of the galactic band. Pass the
 *                                  starfield's own, and the lanes lie ALONG the
 *                                  band instead of anywhere. See the note below.
 * @param {[number,number,number]} [p.absorb] per-channel absorbance at full depth.
 *                                  BLUE-HEAVIEST or the lane does not redden.
 * @param {number} [p.depth]        peak optical depth multiplier
 * @param {[number,number]} [p.lane] smoothstep window on the lane field
 * @param {number} [p.fieldScale]
 * @param {number} [p.fieldStretch]
 * @param {number} [p.laneScale]
 * @param {number} [p.domainOffset]
 * @returns {{object:THREE.Mesh, material:THREE.ShaderMaterial, setDepth:Function, dispose:Function}}
 */
export function buildDustLanes({
  rng,
  count = 3,
  radius = 6000,
  spread = 0.9,
  axis = [0, 0, -1],
  bandAxis = null,
  absorb = [0.16, 0.52, 0.92],
  depth = 1.0,
  lane = [0.46, 0.82],
  fieldScale = 2.6,
  fieldStretch = 3.2,
  laneScale = 0.5,
  domainOffset = 0.7,
} = {}) {
  const r = rng.fork('dust-lanes');
  const a = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();

  /**
   * THE LANES LIE ALONG THE GALACTIC BAND, AND THAT IS THE DIFFERENCE BETWEEN THIS
   * FILE WORKING AND DOING NOTHING AT ALL.
   *
   * These quads only SUBTRACT. Absorption against black is a no-op, so a lane hung
   * anywhere except in front of something luminous is invisible by construction —
   * measured on the first version of this file, which scattered them isotropically
   * about the POI's lobe bearing and could not be seen in the frame at any depth.
   * The brightest thing in this sky is the diffuse galactic band, so:
   *
   *   * the placement bearing is the POI's own axis PROJECTED INTO THE BAND PLANE,
   *     the same construction `skydome.js` uses for its `uGalCentre`, so the lanes
   *     sit on the stretch of band the location's colour comes from;
   *   * the scatter is ANISOTROPIC — `spread` radians ALONG the band and a fifth of
   *     that across it — so they read as lanes lying in the plane rather than as
   *     blobs sitting on it.
   *
   * It is also the physically honest placement: interstellar dust lies in the
   * galactic plane. That is what the Great Rift is.
   */
  const pole = bandAxis ? new THREE.Vector3(bandAxis[0], bandAxis[1], bandAxis[2]).normalize() : null;
  let along;
  if (pole) {
    along = a.clone().addScaledVector(pole, -a.dot(pole));
    if (along.lengthSq() < 1e-6) along.set(1, 0, 0).addScaledVector(pole, -pole.x);
    along.normalize();
  } else {
    along = a.clone();
  }
  // An orthonormal frame: e1 runs ALONG the band, e2 across it.
  const across = pole ?? (Math.abs(along.y) > 0.94 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  const e1 = new THREE.Vector3().crossVectors(across, along).normalize();
  const e2 = new THREE.Vector3().crossVectors(along, e1).normalize();

  const buf = quadBuffers();
  const white = new THREE.Color(1, 1, 1);
  const pos = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Evenly spaced ALONG the band and jittered, not drawn independently: `count`
    // is 2-4, and that many uniform draws clump often enough that the lanes can all
    // land on one side and leave the body unoccluded.
    const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    pos.copy(along)
      .addScaledVector(e1, (u * 0.85 + (r.next() - 0.5) * 0.35) * spread)
      .addScaledVector(e2, (r.next() - 0.5) * spread * 0.20)
      .normalize()
      .multiplyScalar(radius);
    const w = radius * (1.5 + r.next() * 1.1);
    faceOriginQuad(pos, w, w * (0.34 + r.next() * 0.32), r.next() * Math.PI * 2, white, buf);
  }

  const geo = finishQuads(buf, 'dust-lanes');

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAbsorb: { value: new THREE.Vector3(absorb[0], absorb[1], absorb[2]) },
      // x,y = the smoothstep window that turns the lane field into a lane;
      // z = peak optical depth; w = the lane's frequency relative to the emission.
      uLaneShape: { value: new THREE.Vector4(lane[0], lane[1], depth, laneScale) },
      uField: { value: new THREE.Vector2(fieldScale, fieldStretch) },
      uOffset: { value: domainOffset },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      varying vec2 vUv;
      void main() {
        // The far camera never really translates (see common.js), and these quads
        // are built into a group at the origin, so object-space position IS the
        // far-scene direction - the same read the dome does.
        vDir = normalize(position);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uAbsorb;
      uniform vec4 uLaneShape;
      uniform vec2 uField;
      uniform float uOffset;
      varying vec3 vDir;
      varying vec2 vUv;
${FIELD_GLSL}
      void main() {
        // A quad with a visible edge is a quad, not a cloud. This falls to zero
        // well inside the geometry so nothing rectangular can ever show.
        float e = length(vUv - 0.5) * 2.0;
        float mask = 1.0 - smoothstep(0.30, 0.98, e);
        if (mask <= 0.001) discard;

        vec3 d = normalize(vDir + vec3(uOffset * 0.021));
        vec2 f = npField(d, uField.x, uField.y, uLaneShape.w);
        float tau = smoothstep(uLaneShape.x, uLaneShape.y, f.y) * uLaneShape.z * mask;

        // src is an ABSORBANCE, and the blend below is dst *= (1 - src). Clamped
        // strictly below 1 so a lane can never take a channel all the way to zero -
        // chroma bought by deleting a channel is the trap this project has already
        // fallen into once (field-baseline.md 7).
        gl_FragColor = vec4(clamp(uAbsorb * tau, 0.0, 0.92), 1.0);
      }
    `,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    blendEquation: THREE.AddEquation,
    // ON, and that is the whole point of this file: the gas giant writes far-scene
    // depth at ORDER.planet, so a quad inside its distance passes the test and
    // occludes it. depthWrite stays off so the quads do not occlude each other.
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  markCelestial(material, 'dust-lanes');

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'dust-lanes';
  mesh.renderOrder = ORDER.dust;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  return {
    object: mesh,
    material,
    count,
    /** Per-pixel noise evaluations, over the covered area only. */
    taps: FIELD_TAPS.noiseEvals,
    setDepth(k) { material.uniforms.uLaneShape.value.z = k; },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
