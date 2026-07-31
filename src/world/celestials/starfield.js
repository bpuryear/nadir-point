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
 *
 * ===========================================================================
 * W7: ALL THREE PARAGRAPHS ABOVE ARE TRUE AND THE STARFIELD WAS STILL INVISIBLE
 * ===========================================================================
 *
 * `docs/design/skybox-spec.md` §4.1 measured this file alone — dome, nebula, star
 * and gas giant all hidden — at the `engagement` pose, 1600x900:
 *
 *   7200 stars, frame 1440000 px
 *     > luma 0.06    0.0846 %   (1218 px)    <- THIS is the starfield
 *     > luma 0.40    0.0055 %   (  79 px)
 *
 * **7 200 stars produced 1 218 pixels above luma 0.06 — 0.17 px per star.** The
 * sprites cover at least ~32 000 px of geometry at the 2.4 px size floor, so the
 * overwhelming majority of this file rendered BELOW the post chain's own film-grain
 * floor and contributed nothing but haze. `field-baseline.md` §2's "+0.0002 of field
 * median" was read as "the starfield does not matter"; it does not matter *to a
 * median*, by area it never could, and it is the subject of the frame.
 *
 * Four things changed, in the order they matter, and every one of them is measured
 * in the commit that carries it:
 *
 *  a. AMPLITUDE (`uAmp`). The ramp floor was 0.30 and the median star draws
 *     `pow(vFlux, .85)` ~= 0.003, i.e. essentially the whole population sat on the
 *     floor. Raising the floor is the single change that turns haze into stars.
 *     It is a uniform so it can be SOLVED against the area budget rather than
 *     guessed — see `setAmp`.
 *
 *  b. MAG_SLOPE 0.58 -> 0.47. 0.58 is the Euclidean slope: correct for a uniformly
 *     populated infinite universe, wrong for the real sky over this file's own
 *     magnitude window. `space-backgrounds.md` §4 item 6 measures the Tycho-2/UCAC4
 *     slope over -1.4..6.7 at ~=0.468 (1 744 stars to mag 5, 382 925 to mag 10). A
 *     too-high slope pushes the inverse CDF towards MAG_MAX, over-producing
 *     near-threshold specks and under-producing the bright anchors — which is
 *     exactly the 79-px-above-0.40 measurement above.
 *
 *  c. THE BAND IS AN EXPONENTIAL, NOT A LINE. The rejection gradient was
 *     `1 - bandDensity*clamp01((t-0.12)/0.88)` — a gentle straight line from plane
 *     to pole, which cannot make a band read. The Milky Way's thin disc is ~270 pc
 *     of scale height against ~2.6 kpc of scale length, near 10:1, which is why the
 *     naked-eye band is a hard NARROW stripe and not a broad brightening. The
 *     rejection is now `exp(-|sin b| / bandHeight)`, and the stars that survive the
 *     try cap are a uniform halo, which is also what the real sky has.
 *
 *  d. THE SPRITE HAD A SUB-PIXEL CORE. `core` in `softPointTexture` is a fraction
 *     of the sprite RADIUS, so at the 2.4 px size floor a core of 0.16 is 0.38 px
 *     of flat top — and whether a faint star landed on 1.0 or 0.14 of sprite alpha
 *     depended on where its centre fell inside a pixel. That is the "single hot
 *     texel" failure paragraph 3 above is written against, arriving through the
 *     parameter rather than through the geometry. The core is now wide enough that
 *     the smallest star is a solid dot.
 *
 * WHAT WAS DELIBERATELY NOT CHANGED, because the guides point at it and our own
 * measurement says it is not our failure. `starfield.js:96-97` biases temperature
 * hot with flux, which reads like the inversion of the KSP guide's "desaturate dim
 * stars to its lowest value" advice. In TEMPERATURE space it is. On screen it is
 * not: §4.1 measured dim star pixels (0.065 < L <= 0.15) at median chroma 0.0980
 * and bright ones (L > 0.35) at 0.1569 — but normalised by their own luma, which is
 * the only fair comparison because chroma is luma-bounded, the dim sit at C/L ~=
 * 1.09 and the bright at ~= 0.35. **Our dim stars are already the more saturated
 * population**, and a low-flux star already draws `temp` uniformly over the whole
 * ramp, i.e. this file is already "Full Spectrum" for dim stars, which is the
 * guides' actual ask. The bright ones desaturate by CLIPPING through ACES. So the
 * fix is (a), not a change to the draw at :96-97.
 */

import * as THREE from 'three';
import { ORDER, markCelestial, stellarColor, clamp01 } from './common.js';

const MAG_MIN = -1.4;
const MAG_MAX = 6.7;
/**
 * Log-slope of the cumulative count function, N(<m) ~ 10^(k*m).
 *
 * 0.47, not the Euclidean 0.58. See paragraph (b) of the header: 0.58 is the slope
 * for a uniformly populated infinite universe and the real slope over this file's
 * own -1.4..6.7 window is ~0.468, because the Galaxy is a disc and runs out of
 * stars in z long before it runs out in the plane.
 */
const MAG_SLOPE = 0.47;

/**
 * Rejection tries before a star is placed wherever it last landed.
 *
 * This is not a safety valve, it is the halo. A band this narrow rejects ~72% of
 * uniform draws, so at 6 tries about 10% of the population would be placed
 * uniformly regardless of the band; at 10 it is ~2.6%. The number therefore sets
 * how much of the sky is off-band, and 10 leaves a thin, deliberate halo instead of
 * a tenth of the catalogue.
 */
const MAX_PLACEMENT_TRIES = 10;

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {number} [p.count]        how many stars
 * @param {number} [p.radius]       far-scene shell radius
 * @param {number} [p.gain]         overall brightness multiplier
 * @param {number} [p.pixelRatio]
 * @param {number} [p.bandDensity]  0 = uniform sky, 1 = a strong galactic band
 * @param {number} [p.bandHeight]   scale height of the band in |sin(galactic lat)|.
 *                                  0.14 is ~8 degrees, which is the naked-eye band.
 * @param {[number,number,number]} [p.bandAxis] pole of the galactic band
 * @param {[number,number,number]} [p.amp] emission ramp: [floor, ceiling, gamma],
 *                                  applied as `mix(floor, ceiling, pow(flux, gamma))`.
 *                                  THE FLOOR IS THE LOAD-BEARING NUMBER — see header (a).
 * @returns {{object:THREE.Points, material:THREE.ShaderMaterial, setGain:Function, setAmp:Function, setPixelRatio:Function, dispose:Function}}
 */
export function buildStarfield({
  rng,
  count = 5200,
  radius = 30000,
  gain = 1.0,
  pixelRatio = 1,
  bandDensity = 0.55,
  bandHeight = 0.14,
  bandAxis = [0.32, 0.86, -0.40],
  /**
   * SOLVED, NOT GUESSED, AND THE SOLVE CORRECTED THE SPEC.
   *
   * `skybox-spec.md` §4.2(a) proposed `mix(0.85, 4.0, pow(flux, 0.85))` as a
   * starting point against a gate of 0.40-1.50% of frame above luma 0.06. Swept on
   * this tree with `setAmp` against the starfield ALONE (dome, dust, star and giant
   * all hidden, `engagement`, 1600x900, N = 1 440 000 px):
   *
   *   floor ceil gam |   >0.06    >0.20    >0.40  | dim chroma (N)   bright chroma
   *    0.30 2.80 .85 |  0.579%   0.371%  0.1592%  | 0.1686 (1952)    0.1412
   *    0.34 2.20 .80 |  0.592%   0.385%  0.1770%  | 0.1725 (1966)    0.1412   <- SHIPPED
   *    0.46 1.60 .70 |  0.804%   0.423%  0.2158%  | 0.0431 (4003)    0.1451
   *    0.55 2.40 .80 |  0.993%   0.449%  0.2383%  | 0.0275 (5656)    0.1451
   *    0.70 2.10 .72 |  1.728%   0.512%  0.2674%  | 0.0275 (13059)   0.1529
   *    1.05 3.30 .80 |  7.898% (the first guess: 5x over the top of the gate)
   *
   * READ THE DIM-CHROMA COLUMN, NOT THE AREA ONE. Every row from 0.55 up is inside
   * the area gate and every one of them is WRONG, because raising the floor floods
   * the 0.065-0.15 luma bucket with bloom skirt rather than with stars: the count
   * goes 1 966 -> 13 059 while the median chroma of that bucket collapses 0.1725 ->
   * 0.0275. That is grey haze passing an area gate, which is the exact failure this
   * file's header is written against, so the floor is set at the bottom of the band
   * and not in the middle of it.
   *
   * **AND THE AMPLITUDE WAS NOT THE FIX.** At the SHIPPED-BEFORE amp of
   * `0.30, 2.80, 0.85` this tree already measures 0.579% against the old tree's
   * 0.0846% — a 6.8x lift with the ramp untouched. The profile fix (d), the count
   * and the slope did that; 0.30 -> 0.34 is a whisker on top. §4.2 called amplitude
   * "the only change that matters" and the measurement says otherwise.
   */
  amp = [0.34, 2.20, 0.80],
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
      // |cos| to the band pole IS |sin(galactic latitude)|: 0 in the band plane, 1
      // at the poles. An EXPONENTIAL in it, not a line — a disc's column density
      // falls off exponentially out of the plane, which is why the naked-eye band
      // is a narrow stripe with a hard edge rather than a broad brightening. At
      // bandHeight 0.14 the density is down to 1/e by 8 degrees of latitude.
      const t = Math.abs(v.dot(axis));
      const keep = 1 - bandDensity * (1 - Math.exp(-t / bandHeight));
      if (r.next() < keep || tries >= MAX_PLACEMENT_TRIES) break;
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
    size[i] = 2.4 + 9.6 * Math.pow(fn, 0.62) + (fn > 0.55 ? 3.4 * (fn - 0.55) : 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aFlux', new THREE.BufferAttribute(flux, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.01);
  geo.name = 'starfield';

  /**
   * THE PROFILE IS ANALYTIC AND ITS CORE IS SPECIFIED IN PIXELS. That is the whole
   * change, and it is (d) in the header.
   *
   * `softPointTexture`'s `core` is a fraction of the sprite RADIUS. The size ramp
   * above spans 2.4 px to 13.5 px, so ONE authored fraction cannot be right at both
   * ends: 0.16 gives the biggest star a 2.2 px flat top and the smallest one 0.38 px
   * — sub-pixel, i.e. the exact "single hot texel" this file's header paragraph 3
   * says is the most common failure in a procedural starfield. Measured
   * consequence: a 2.4 px star whose centre lands on a pixel centre samples alpha
   * 1.0, and the same star half a pixel over samples 0.14. Seven-to-one on a
   * sub-pixel accident, over the population that IS most of the sky.
   *
   * Computing the profile from `gl_PointCoord` instead lets the flat top be stated
   * in PIXELS, which is what paragraph 3 always meant ("a sprite with a 2-3 px flat
   * core"). `CORE_PX` of flat top, then a smooth skirt to the quad edge, at every
   * size. A faint star is now reliably a solid dot and a bright one is a small disc
   * with a falloff, which is the difference between the two that the eye reads.
   *
   * It also deletes the only texture this file had. No CanvasTexture, so defect D35
   * (premultiplied alpha destroying colour below alpha ~12/255) cannot apply here
   * at all rather than being safe by luck — and the anti-mipmap reasoning at
   * `common.js:218-227`, which is correct and non-obvious, is simply not needed for
   * a profile that has no texture to build a mip chain from.
   */
  const CORE_PX = 1.25;
  const FALLOFF = 2.35;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGain: { value: gain },
      uPixelRatio: { value: pixelRatio },
      /**
       * [floor, ceiling, gamma] of the emission ramp. A UNIFORM, not a literal,
       * because §4.2(a) of the spec makes the star area budget a two-sided gate
       * (0.40-1.50% of frame above luma 0.06) and a gate you have to recompile to
       * probe is a gate nobody solves against. `setAmp` is how it was solved.
       */
      uAmp: { value: new THREE.Vector3(amp[0], amp[1], amp[2]) },
      uProfile: { value: new THREE.Vector2(CORE_PX, FALLOFF) },
    },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aFlux;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vFlux;
      varying float vSizePx;
      void main() {
        vColor = aColor;
        vFlux = aFlux;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // constant in pixels: no attenuation, therefore no crawl on rotate
        vSizePx = aSize * uPixelRatio;
        gl_PointSize = vSizePx;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uGain;
      uniform vec3 uAmp;
      uniform vec2 uProfile;
      varying vec3 vColor;
      varying float vFlux;
      varying float vSizePx;
      void main() {
        // 0 at the centre of the quad, 1 at the inscribed edge.
        float r = length(gl_PointCoord - 0.5) * 2.0;
        // The flat top is uProfile.x PIXELS wide at every star size. 0.72 is a
        // ceiling, not a taste: past it the smallest stars lose their skirt
        // entirely and start to alias as hard squares.
        float core = clamp(uProfile.x / max(vSizePx, 1.0), 0.0, 0.72);
        float a = pow(max(1.0 - (r - core) / (1.0 - core), 0.0), uProfile.y);
        // The floor is what most of the sky is: pow(flux, gamma) for a median star
        // is about 0.003, so the population sits ON the floor and the ceiling only
        // ever describes the handful of anchors that push past the 1.05 bloom
        // threshold in postfx.js:266.
        float amp = mix(uAmp.x, uAmp.y, pow(vFlux, uAmp.z));
        gl_FragColor = vec4(vColor * amp * uGain * a, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    /**
     * ON, AND IT WAS OFF, AND THAT PUT STARS ON THE FACE OF THE GAS GIANT.
     *
     * Measured at the `wide` pose by rendering the frame twice, once with this
     * object hidden: the white specks scattered across the giant's night side are
     * this file. `common.js`'s render-order contract says `ORDER.planet` (5)
     * "occludes all of the above" and `ORDER.stars` is 0, so on the face of it the
     * stars draw first and the planet paints over them. **`renderOrder` cannot do
     * that here, because it only sorts WITHIN a render list.** The planet body is
     * an opaque material and this one is `transparent: true`; three.js renders the
     * whole opaque list before the whole transparent list, so the planet draws
     * first no matter what either `renderOrder` says, and a `depthTest: false`
     * additive pass afterwards lands on top of it.
     *
     * With the test ON the far scene's own depth buffer does the job the contract
     * describes — the giant writes depth at `ORDER.planet` and these points sit at
     * `radius` 30 000 behind it, so they are correctly rejected. `gasgiant.js`'s
     * own halo and rings already carry `depthTest: true` for exactly this reason;
     * the starfield is the one far-scene layer that did not.
     *
     * The defect predates this wave — it is visible in the `6ae7df9` control frame
     * — and raising the star amplitude is what made it impossible to miss.
     */
    depthTest: true,
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
    /** Live handle on [floor, ceiling, gamma]. See the `uAmp` note above. */
    setAmp(floor, ceiling, gamma) {
      const v = material.uniforms.uAmp.value;
      v.set(floor ?? v.x, ceiling ?? v.y, gamma ?? v.z);
    },
    setPixelRatio(pr) { material.uniforms.uPixelRatio.value = pr; },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
