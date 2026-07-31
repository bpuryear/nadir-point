/**
 * THE SKY DOME — the coloured darkness, and now the structure inside it.
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
 *
 * ===========================================================================
 * W6-A: THE PARAGRAPHS ABOVE ARE ALL TRUE AND THEY DESCRIBE A FLAT WASH
 * ===========================================================================
 *
 * `docs/review/field-baseline.md` measured what the file above actually ships, and it
 * closed R1. RE-MEASURED ON THIS TREE before anything below was written, by stashing
 * this file's changes and running `node tools/fieldcheck.mjs engagement --report` —
 * engagement field median luma **0.1283** against a 0.10 target, 97.8% of frame above
 * 0.06, chroma 0.1451 against the corrected green target of 0.12. That reproduces the
 * baseline's 0.1281 to within its own noise floor. The dome is also the ONLY thing
 * carrying it: the baseline's `--attrib` pass measured the field collapsing to
 * 0.0280 / 2.04% with the dome hidden, while hiding the entire 14-layer nebula moves
 * the median by **-0.0003**.
 *
 * And the frame still does not look like the references, for a reason the same
 * instrument states in one number (§5, and reproduced here on this tree):
 *
 *   dark    mean luma 0.0891   median chroma 0.1019   hue 96.0 deg
 *   mid     mean luma 0.1284   median chroma 0.1490   hue 94.1 deg
 *   bright  mean luma 0.1641   median chroma 0.1842   hue 93.7 deg
 *              dark-to-bright hue separation 2.3 deg  <- ONE HUE AT EVERY VALUE
 *
 * Two of the three bullets at the top of this header are therefore not delivering.
 * "never one flat wash" is exactly what 2.3 degrees of hue separation over a monotone
 * luma ramp is. The band and the lobe are both SMOOTH ANALYTIC FUNCTIONS OF DIRECTION:
 * `abs(d.y)` and `dot(d, uAxis)`. Neither has any spatial frequency above the first,
 * so whatever hue they are authored in, they can only ever paint a gradient in it.
 *
 * WHAT IS ADDED, AND THE ONE RULE IT IS BUILT AROUND. The owner ruled for a rust and
 * green blend SEPARATED BY VALUE AND STRUCTURE, not mixed — the stated failure mode
 * being mud, two hues at similar value averaging to grey. So:
 *
 *   1. `field.glsl.js` supplies one warped, anisotropically stretched noise field
 *      read twice: an emission density and a dust optical depth from the SAME warped
 *      domain, offset. That is the structural axis.
 *   2. The density MODULATES the existing green emission about its own mean, so the
 *      green core gains structure without gaining or losing energy.
 *   3. The optical depth is spent as **COLOURED ABSORPTION** — `exp(-uAbsorb * tau)`
 *      with a blue-heaviest coefficient, which is Leria/Neyret's per-channel
 *      `e^(-a_rgb * tau)` collapsed into the one multiply a single shader can afford.
 *      The lanes therefore DARKEN AND REDDEN the green behind them rather than tinting
 *      it: they move pixels DOWN the value axis and ACROSS the hue axis at the same
 *      time, which is precisely the separation the ruling asks for and the reason real
 *      nebula photographs read as depth instead of as gradient.
 *   4. And the dust SCATTERS a warm fraction of exactly what it absorbed, outside the
 *      lobe. Bounding the emission by the absorption is what keeps a dust lane from
 *      becoming the brightest thing in frame; §5 in the shader body records the two
 *      measured failures that got it there. Red carries a 0.2126 luminance weight
 *      against green's 0.7152, so a warm term buys three times the chroma per unit of
 *      luma it spends — which is the arithmetic that lets a second hue exist in the
 *      dark tier without lifting the dark tier into the mid one.
 *
 * MEASURED, `engagement` field, HEAD -> this file (N = 1 440 000 px, hardware raster,
 * `node tools/fieldcheck.mjs engagement --report`, the two trees differing by exactly
 * this file, `field.glsl.js` and the settings block in `index.js`):
 *
 *                          HEAD      shipped     target
 *   median luma            0.1283    0.1271      >= 0.10   both PASS
 *   % above 0.06           97.8%     89.9%       >= 40%    both PASS
 *   median chroma          0.1451    0.1373      >= 0.12   both PASS (green-dominant)
 *   hue band (80% mass)    5 deg     32 deg      <= 60     both PASS
 *   luma p05 .. p95        0.0697..0.1754        0.0511..0.2565
 *   luma ladder WIDTH      0.106     0.205       <- 1.94x
 *   dark tier hue          96.0 deg  45.6 deg    <- RUST
 *   bright tier hue        93.7 deg  89.1 deg    <- GREEN
 *   DARK-TO-BRIGHT HUE SEPARATION    2.3 deg  ->  43.5 deg
 *
 * READ THE LUMA COLUMN BEFORE THE HUE ONE. The median moved -0.0012, which is inside
 * the instrument's own run-to-run noise, and that is the POINT: the ladder nearly
 * doubled and the dark tier rotated 50 degrees into rust WITHOUT the frame getting
 * brighter. Structure and a second hue were bought with distribution, not with energy.
 *
 * And `cinematic`, the one shot that FAILED BOTH R1 and R2 on HEAD — measured here at
 * 0.0939 luma and 0.1019 chroma, because its yaw puts the lobe behind the camera —
 * now reads **0.1202 luma / 0.1295 chroma and PASSES BOTH**. Over the four shots
 * `fieldcheck` grades, this tree goes **3/4 -> 4/4**.
 *
 * `close` and `wide` (giant-orbit, a BLUE field) are held rather than improved:
 * 0.1053 -> 0.1071 and 0.1437 -> 0.1405 of median luma, chroma 0.2941 -> 0.2784 and
 * 0.3058 -> 0.3058. See `index.js`'s giant-orbit block for why that POI deliberately
 * takes structure and keeps one hue.
 *
 * NONE OF THIS IS A LUMINANCE CHANGE AND IT MUST NOT BECOME ONE. `field-baseline.md`
 * §8 kills the plan's 2.0-2.3x lift outright: R1 is at 128% of target already, and the
 * previous author of this file overshot once to a measured 0.3777 ("a lit room, not a
 * graveyard"). The absorption term REMOVES energy; the gains below are re-solved
 * against a measured frame to put the median back, not to raise it.
 *
 * `structure: 0` COMPILES THE FIELD OUT ENTIRELY — not a zeroed uniform, no `npField`
 * call, no taps. That is deliberate: it is the A/B control for F3's frame-time gate,
 * and a control that still pays the cost measures nothing.
 *
 * ===========================================================================
 * F3 — THE FILL-COST GATE. ANSWERED, AND THE ANSWER IS "BAKE".
 * ===========================================================================
 *
 * `space-backgrounds.md` §6 calls F3 "the single most important measurement in the
 * document" because it arbitrates a three-way disagreement worth several days. Its
 * table: under 0.5 ms, ship the live shader and skip the cubemap bake entirely; over
 * 2 ms, the bake is mandatory.
 *
 * MEASURED. `NP_RASTER=hardware npm run bench -- --width 2560 --height 1440`, the
 * committed benchmark scene, which pins `poi='giant-orbit'` and therefore compiles
 * this field in. The two trees differ by this file, `field.glsl.js` and the settings
 * in `index.js`; NOTHING else, and neither draw calls (422 vs 424, both over the
 * pre-existing 320 ceiling for unrelated reasons) nor programs (62 vs 62) move.
 * Two runs per side, and they reproduce to 0.1 ms:
 *
 *   field       mean frame        median      p95        p99
 *   OFF (HEAD)  11.8 / 11.8 ms    11.6/11.8   12.8/12.9  13.1/13.9
 *   ON          15.2 / 15.2 ms    15.0/15.0   16.1/16.3  16.4/16.6
 *   DELTA       +3.4 ms           +3.3        +3.4       +3.4
 *
 * **+3.4 ms IS OVER F3'S 2 ms LINE BY 1.7x. THE BAKE (item 4) IS MANDATORY.**
 *
 * AND THE VERDICT IS STRUCTURAL, NOT A TUNING PROBLEM — which is the part that
 * actually settles the argument. `FIELD_TAPS` is the cost dial, so it was swept:
 * dropping the warp from 2 octaves to 1 (19 -> 13 noise evaluations per pixel)
 * measured 14.2 ms, a +2.4 ms delta. That is 0.179 ms per evaluation at 19 taps and
 * 0.185 at 13 — LINEAR IN TAPS to 3%. A 2-level IQ domain warp costs six fbm calls
 * before it draws anything, so the cheapest possible version of this construction is
 * 6 warp + 1 shape + 1 lane = 8 taps = **1.45 ms predicted**, still 2.9x over the
 * 0.5 ms "skip the bake" threshold. There is no octave setting that reaches it.
 *
 * So: shipped live for now, because it passes the frame budget on hardware (65.6 fps
 * mean, 60.2 fps at p99 at 2560x1440, both PASS) and the look is the wave's whole
 * point — but item 4 now has a measured mandate and 3.4 ms of headroom waiting for it.
 *
 * ===========================================================================
 * A-2: ITEM 4 IS TAKEN. THE FIELD IS BAKED, AND NOTHING ABOVE IS UNTRUE.
 * ===========================================================================
 *
 * Everything in this header still describes what the sky IS. The construction below is
 * unchanged line for line — the band, the lobe, the galactic core and halo, the
 * mean-preserving structure term, the coloured absorption, the bounded warm scatter.
 * What changed is WHEN it runs: once, into a cube map, instead of ten noise evaluations
 * on every pixel of every frame.
 *
 * `docs/review/perf-bisect.md` §4.3 re-measured F3 a third time and independently on
 * different hardware, and got the same verdict: `far:dome-flat` **-2.44 ms**, against
 * F3's 2 ms mandatory line. It also measured the thing that makes the bake capture all
 * of it rather than some of it — `far:dome-hidden` recovers LESS (-2.32 ms) than drawing
 * the dome with a constant colour, so the geometry, the draw call and the full-screen
 * fill are already free and 100% of the cost is the taps.
 *
 * THE BAKE IS A COST CHANGE AND NOT A LOOK CHANGE, which item 4 asks to be said out
 * loud so that nobody "improves the look" inside it. See `render/bakes.js` for why it is exact
 * (a pure function of `normalize(vDir)` is exactly what a cube stores) and for why 512
 * texels a face is oversampling by an order of magnitude against `field.glsl.js`'s own
 * 8-degree band limit. `fieldcheck` on all four shots, before and after, is in the
 * commit message; the largest movement in any of the twelve graded statistics is inside
 * the instrument's run-to-run noise.
 *
 * `bake: false` KEEPS THE LIVE SHADER, and that is not a leftover: it is the A/B control
 * for anyone re-measuring F3, in the same spirit as `structure: 0` compiling the field
 * out entirely two paragraphs up. A control that cannot be switched on measures nothing.
 *
 * The live-tuning handles — `setScale`, `setTerms`, `setField`, `setGain` — all still
 * work. They mutate the SOURCE material's uniforms and then queue a re-bake, so a
 * console session solving gains against a measured frame behaves exactly as it did
 * before, one frame later. Anything else would have left four handles that silently
 * stopped doing anything, which is the defect `perf-bisect.md` §5 was written about.
 */

import * as THREE from 'three';
import { ORDER, markCelestial, col } from './common.js';
import { FIELD_GLSL, FIELD_TAPS } from './field.glsl.js';
import { requestBake, bakeDirectionCube } from '../../render/bakes.js';

export { FIELD_TAPS };

/**
 * Scale a colour to Rec.709 luminance 1, in place. Used so the dust's scattering
 * albedo is separable from its hue: `uWarm` carries only the chromaticity and
 * `uWarmGain` carries the fraction of absorbed radiance that comes back.
 */
function unitLuma(c) {
  const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (L > 1e-6) c.multiplyScalar(1 / L);
  return c;
}

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
 * @param {[number,number,number]} [p.galAxis] pole of the GALACTIC band. Pass the
 *                                 starfield's own `bandAxis` — the diffuse band and
 *                                 the resolved stars must be the same band or the
 *                                 frame contains two Milky Ways.
 * @param {number} [p.galHeight]   scale height of the diffuse band in |sin b|. Pass
 *                                 the starfield's `bandHeight`, for the same reason.
 * @param {number} [p.galGain]     multiplier on the diffuse band. 0 compiles it out.
 * @param {number} [p.galCore]     palette hex: the band's unresolved starlight
 * @param {number} [p.bandY]       sin(elevation) the ecliptic band is centred on. 0 is
 *                                 the combat plane and is the shipped value; see
 *                                 `docs/review/field-baseline.md` §3 for why moving it
 *                                 is a POSE question answered better by the far
 *                                 camera's pitch than by an edit here.
 * @param {number} [p.structure]   0 disables the noise field at COMPILE time
 * @param {number} [p.coreBias]    share of the structure that survives at the anti-lobe;
 *                                 1 is a uniformly busy sky, which measures well and
 *                                 looks wrong. See section 3 of the fragment body.
 * @param {number} [p.fieldScale]  base frequency, cycles across the sphere
 * @param {number} [p.fieldStretch] anisotropy across the ecliptic; >1 gives strands
 * @param {[number,number]} [p.density] smoothstep window on the shape field
 * @param {[number,number]} [p.lane]    smoothstep window on the lane field
 * @param {number} [p.laneDepth]   peak optical depth of a lane
 * @param {number} [p.laneScale]   lane frequency relative to the emission; < 1 gives
 *                                 dust BANKS, 1.0 gives veins that read as cracks
 * @param {[number,number,number]} [p.absorb] per-channel absorption; blue-heaviest
 * @param {number} [p.warm]        palette hex: rust/amber for lanes and outer bands
 * @param {number} [p.warmGain]    emission gain on the warm term
 * @param {number} [p.segments]
 * @param {boolean} [p.bake]       bake the field to a cube map at first render. `false`
 *                                 keeps the live shader — the A/B control for F3.
 * @param {number} [p.bakeSize]    texels per cube face
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
  bandY = 0.0,
  galAxis = null,
  galHeight = 0.13,
  galGain = 0.0,
  galCore = 0xffffff,
  structure = 0.0,
  coreBias = 0.4,
  fieldScale = 2.6,
  fieldStretch = 3.2,
  density = [0.36, 0.70],
  lane = [0.50, 0.86],
  laneDepth = 1.0,
  laneScale = 0.5,
  absorb = [0.30, 1.00, 1.70],
  warm = 0x000000,
  warmGain = 0.0,
  segments = 32,
  bake = true,
  bakeSize = 512,
} = {}) {
  const geo = new THREE.SphereGeometry(radius, segments, Math.max(8, segments >> 1));
  geo.name = 'sky-dome';

  const a = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  const structured = structure > 0;
  const banded = galGain > 0 && !!galAxis;

  /**
   * The galactic band's own "towards the centre" direction.
   *
   * It is the POI's lobe axis with the band pole projected out, i.e. the component
   * of the location's composition axis that lies IN the band plane. That is not a
   * shortcut for lack of a better idea: it means the brightest stretch of the Milky
   * Way and the direction the location's colour comes from are one bearing rather
   * than two unrelated facts, which is the same argument `index.js:210-224` makes
   * for putting the nebula bank on the bearing to the gas giant. Degenerate only if
   * the lobe axis IS the band pole, and the fallback covers that.
   */
  const gp = banded ? new THREE.Vector3(galAxis[0], galAxis[1], galAxis[2]).normalize() : null;
  const gc = banded ? a.clone().addScaledVector(gp, -a.dot(gp)) : null;
  if (gc && gc.lengthSq() < 1e-6) gc.set(1, 0, 0).addScaledVector(gp, -gp.x);
  gc?.normalize();

  const uniforms = {
    uAxis: { value: a },
    uCore: { value: col(core) },
    uZenith: { value: col(zenith) },
    uGround: { value: col(ground) },
    // The lobe is stated as an ANGULAR RADIUS and converted to the two cosines the
    // shader interpolates between, so the authored number means what it says.
    uLobe: { value: new THREE.Vector2(Math.cos(Math.min(Math.PI, spread * 1.75)), Math.cos(spread * 0.22)) },
    uGain: { value: gain },
    uBase: { value: baseGain },
    uBandY: { value: bandY },
  };

  if (banded) {
    Object.assign(uniforms, {
      uGalAxis: { value: gp },
      uGalCentre: { value: gc },
      uGalCore: { value: col(galCore) },
      // x = scale height in |sin b|, y = gain
      uGal: { value: new THREE.Vector2(galHeight, galGain) },
    });
  }

  if (structured) {
    Object.assign(uniforms, {
      uStructure: { value: structure },
      uCoreBias: { value: coreBias },
      // x = base frequency, y = anisotropic stretch across the ecliptic
      uField: { value: new THREE.Vector2(fieldScale, fieldStretch) },
      uDensity: { value: new THREE.Vector2(density[0], density[1]) },
      // x,y = the smoothstep window that turns the lane field into a lane; z = peak
      // optical depth; w = the lane's frequency relative to the emission's.
      uLaneShape: { value: new THREE.Vector4(lane[0], lane[1], laneDepth, laneScale) },
      uAbsorb: { value: new THREE.Vector3(absorb[0], absorb[1], absorb[2]) },
      // NORMALISED TO UNIT LUMINANCE at build time, so `warmGain` below is a
      // scattering albedo in [0,1] and not a number whose meaning depends on how
      // bright the authored hex happens to be. One divide here, none per pixel.
      uWarm: { value: unitLuma(col(warm)) },
      uWarmGain: { value: warmGain },
    });
  }

  /**
   * ONE vertex shader for both the live material and the baked one.
   *
   * `vDir` is the object-space vertex direction and it is the ONLY input either
   * fragment shader has. That is the property `render/bakes.js` depends on and it is why the
   * bake is exact rather than an approximation — see its header.
   */
  const DOME_VERTEX = /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: DOME_VERTEX,
    fragmentShader: /* glsl */`
      uniform vec3 uAxis, uCore, uZenith, uGround;
      uniform vec2 uLobe;
      uniform float uGain, uBase, uBandY;
      varying vec3 vDir;
${banded ? `
      uniform vec3 uGalAxis, uGalCentre, uGalCore;
      uniform vec2 uGal;` : ''}
${structured ? `
      uniform float uStructure, uWarmGain, uCoreBias;
      uniform vec2 uField, uDensity;
      uniform vec4 uLaneShape;
      uniform vec3 uAbsorb, uWarm;
${FIELD_GLSL}` : ''}
      void main() {
        vec3 d = normalize(vDir);
${structured ? `
        // ONE field evaluation, two reads. Everything below spends it.
        vec2 f = npField(d, uField.x, uField.y, uLaneShape.w);
        float dens = smoothstep(uDensity.x, uDensity.y, f.x);
        float tau  = smoothstep(uLaneShape.x, uLaneShape.y, f.y) * uLaneShape.z;
` : ''}
        // 1. the floor: an ecliptic band. Value peaks at the combat plane and falls to
        //    the poles; hue leans to uGround below the plane and uZenith above it. The
        //    0.30 residual is what keeps the poles coloured rather than black.
        float b = 1.0 - smoothstep(0.06, 0.92, abs(d.y - uBandY));
        vec3 base = mix(uGround, uZenith, smoothstep(-0.55, 0.55, d.y));
        vec3 c = base * (0.30 + 0.70 * b * b) * uBase;

        // 2. the lobe: the location's hue, centred where its nebula bank is. Squared
        //    so the falloff has a shoulder rather than a linear ramp, which is what
        //    keeps it reading as distant gas and not as a vignette.
        float t = smoothstep(uLobe.x, uLobe.y, dot(d, uAxis));
        c += uCore * (t * t) * uGain;
${banded ? `
        // 2b. THE GALACTIC BAND, DIFFUSE. skybox-spec.md 4.2(f): 13 000 point
        //     sprites cannot make a band read, so the band's UNRESOLVED component
        //     belongs here and its resolved component belongs in the sprites. Same
        //     pole, same scale height, same exponential profile as
        //     starfield.js's rejection function, because it is the same disc seen
        //     two ways - a disc's column density falls off exponentially out of the
        //     plane, which is why the naked-eye band is a narrow stripe.
        //
        //     THIS IS THE ONE LAYER ALLOWED TO BE A STRIPE AND IT IS STILL
        //     BAND-LIMITED. exp(-|sin b|/h) has no spatial frequency at all across
        //     the band; the only variation along it is one lobe towards the
        //     galactic centre, which is a 90-degree feature. Nothing here can land
        //     in the 1.6-6.5 degree marble zone that skybox-spec.md 7.2 measures as
        //     the failure.
        //     TWO EXPONENTIALS, NOT ONE, AND THAT IS WHAT MAKES IT A BAND RATHER
        //     THAN A HAZE. A single exp(-sb/h) at the scale height that gives the
        //     right core width has wings reaching +-23 degrees, so the "band" is a
        //     soft brightening across half the frame - measured, and it looked like
        //     fog. A disc seen edge-on is a bright thin CORE inside a faint wide
        //     HALO, so it is summed as two: 0.82 of the light inside one scale
        //     height and 0.18 spread over three. Both terms are still exponentials
        //     in |sin b| with no spatial frequency across the band at all.
        //
        //     THE SPLIT IS GRADED ON THE FRAME, NOT ON THE MEDIAN. At 0.74/0.26
        //     over four scale heights the halo reached +-31 degrees against a 46
        //     degree vertical FOV, so the "band" covered the whole frame and read
        //     as fog - a wall again, quieter. Moving 0.08 of the light from the
        //     halo into the core is what gives it an EDGE, which is the thing that
        //     makes it a band.
        float sb = abs(dot(d, uGalAxis));
        float band = 0.82 * exp(-sb / uGal.x) + 0.18 * exp(-sb / (uGal.x * 3.0));
        // Towards the centre it is brighter, away from it thinner: one lobe, not a
        // texture. Real bands are not uniform along their length and a uniform one
        // reads as a painted stripe.
        float lon = 0.26 + 0.74 * smoothstep(-0.70, 0.95, dot(d, uGalCentre));
        c += uGalCore * (band * lon * uGal.y);` : ''}
${structured ? `
        // 3. NEGATIVE SPACE FIRST. The structure and the dust below are both weighted
        //    towards the LOBE, i.e. towards the nebula bank, and away from the rest of
        //    the sky. \`uCoreBias\` is the share that survives at the anti-lobe.
        //
        //    WHY THE BIAS EXISTS AT ALL, AND IT IS A LIMIT OF THE METRIC RATHER THAN
        //    A TASTE NOTE. Applying the field at full amplitude in EVERY direction
        //    passes R1 and R2 just as well as this does — and it has to, because a
        //    whole-sky median cannot tell a uniformly busy sky from a quiet sky with
        //    one busy region. They have the same median. \`nebula.js\` states the
        //    consequence in its own header: "NEGATIVE SPACE. Emission is confined to
        //    a band about one radian wide across a single region of the sky.
        //    Everything else is empty. A nebula that fills the sky has no contrast
        //    left to spend on the ships." So the field is weighted toward the lobe by
        //    construction, and \`uCoreBias\` is deliberately BELOW 1 at every POI.
        //    **Neither R1 nor R2 can see this decision. Do not let a green fieldcheck
        //    talk anyone into raising it to 1.**
        //
        //    W7: THE WEIGHT IS THE LOBE **OR THE BAND**, WHICHEVER IS STRONGER, AND
        //    THAT IS NOT A RELAXATION OF THE RULE ABOVE. \`uCoreBias\` is unchanged
        //    and still below 1 at every POI, so the negative space is still negative
        //    space. What changed is WHERE the light is: the diffuse galactic band is
        //    now the brightest thing in the sky and it is on a DIFFERENT AXIS from
        //    the lobe, so a dust weight that keys only on the lobe puts the lanes
        //    everywhere except across the one feature they are supposed to cross.
        //    Interstellar dust lies IN the galactic plane — that is what the Great
        //    Rift is — so weighting the lanes onto the band is the physically honest
        //    version of the same negative-space decision, not a weakening of it.
        float g = mix(uCoreBias, 1.0, ${banded ? 'max(t, band * lon)' : 't'});

        // 4. STRUCTURE on the green emission, MEAN-PRESERVING about dens = 0.5. This
        //    is the term that has to not move R1: it multiplies by 1 + s*(2*dens-1),
        //    whose mean over a field with mean density 0.5 is exactly 1.
        c *= 1.0 + uStructure * g * (2.0 * dens - 1.0);

        // 5. THE DUST OCCLUDES, as COLOURED ABSORPTION and not as paint. Leria/Neyret
        //    define per-channel absorption coefficients a_rgb and a local transparency
        //    e^(-a_rgb * tau); with a blue-heaviest a_rgb the lane REDDENS what is
        //    behind it, which is what interstellar dust does and is why a lane reads
        //    as dust in front of light rather than as a hole cut in the image. This is
        //    the term that moves a pixel DOWN the value axis and ACROSS the hue axis
        //    in one operation, which is the whole of the owner's separation ruling.
        vec3 lit = c;
        c *= exp(-uAbsorb * (tau * g));

        // 6. AND THE DUST SCATTERS WHAT IT TOOK. Single scattering, stated as one
        //    line: the warm term is a fraction of the radiance the absorption above
        //    REMOVED FROM THIS PIXEL, so uWarmGain is a scattering albedo and the
        //    term is bounded by construction — a lane can never end up brighter than
        //    the light it stands in front of, for any authored gain <= 1.
        //
        //    THE BOUND IS THE POINT, AND HERE IS WHY IT IS A BOUND AND NOT A TUNING.
        //    Chroma as this project grades it is max(R,G,B) - min(R,G,B). A warm term
        //    sprayed over a COOL field therefore raises the MINIMUM channel and costs
        //    chroma one-for-one — that is the owner's "mud" arriving by arithmetic
        //    rather than by taste, and it is why the warm is gated on the lane (so it
        //    lands only where the dust is) and on (1-t) (so the luminous core keeps
        //    its own hue unmixed). And because the term is a FRACTION OF THE RADIANCE
        //    THE LINE ABOVE JUST REMOVED, no authored gain <= 1 can make a lane
        //    brighter than the light it stands in front of. A dust lane that is the
        //    brightest thing in frame is not a dust lane; this construction cannot
        //    produce one, rather than being tuned until it happens not to.
        //
        //    (The two failed constructions this replaced — an ungated warm, and a
        //    lane-gated warm with a free gain — were measured by the earlier pass of
        //    this work whose settings this commit did not keep. Those runs were NOT
        //    re-run here, so no number from them is quoted. What IS re-measured on
        //    this tree is the shipped result, in the header table above.)
        //
        //    (1-t) stays as a second gate so the luminous core keeps its own hue
        //    unmixed, which is the half of the ruling that says green owns the core.
        float absorbed = dot(lit - c, vec3(0.2126, 0.7152, 0.0722));
        c += uWarm * (uWarmGain * (1.0 - t) * absorbed);
` : ''}
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

  /**
   * THE BAKE. Only when there is something worth baking.
   *
   * `bake && structured` and not `bake` alone: the ten noise evaluations are the
   * entire measured cost (`perf-bisect.md` §4.3, and `field.glsl.js:120`'s per-eval
   * figure from the other direction). An unstructured dome's fragment is two
   * smoothsteps, a mix and — at a banded POI — two exponentials, none of which has a
   * measurable cost at any resolution, so baking one would spend 12.6 MB to buy
   * nothing. `structure: 0` domes therefore keep the live shader and behave exactly as
   * they did, which also keeps them usable as the control they already are.
   */
  const bakeable = bake && structured;
  let bakedMat = null;
  let bakedCube = null;
  let bakeQueued = false;
  let bakeMs = 0;
  let disposed = false;

  function applyBake(renderer) {
    bakeQueued = false;
    if (disposed) return;
    const previous = bakedCube;
    const { target, ms } = bakeDirectionCube(renderer, mat, bakeSize);
    bakedCube = target;
    bakeMs = ms;
    if (bakedMat) {
      bakedMat.uniforms.uSky.value = target.texture;
    } else {
      bakedMat = new THREE.ShaderMaterial({
        uniforms: { uSky: { value: target.texture } },
        vertexShader: DOME_VERTEX,
        fragmentShader: /* glsl */`
          uniform samplerCube uSky;
          varying vec3 vDir;
          void main() {
            // The whole point. Ten noise evaluations became one fetch, and because the
            // cube was written at the same directions this reads it at, the value is
            // the one the live shader would have computed.
            gl_FragColor = vec4(textureCube(uSky, normalize(vDir)).rgb, 1.0);
          }
        `,
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: true,
        fog: false,
      });
      markCelestial(bakedMat, 'sky-dome');
      mesh.material = bakedMat;
    }
    // Only after the swap: disposing the old cube while it is still the bound texture
    // of the visible material would show one frame of nothing.
    previous?.dispose();
  }

  /** Queue a (re-)bake. Idempotent inside one frame; a no-op on a live-shader dome. */
  function queueBake() {
    if (!bakeable || disposed || bakeQueued) return;
    bakeQueued = true;
    requestBake(applyBake);
  }

  queueBake();

  return {
    object: mesh,
    material: mat,
    /**
     * Per-pixel noise evaluations this dome compiled in. 0 when `structure` is 0.
     *
     * This still reports what the SOURCE shader costs, because that is what the number
     * has always meant and what `field.glsl.js`'s tables are indexed by. What the
     * dome costs per frame once baked is one `textureCube`, and `baked` below says
     * whether that is what is on the mesh.
     */
    taps: structured ? FIELD_TAPS.noiseEvals : 0,
    /** True once the cube is on the mesh. False on a live-shader dome, and for the
     *  one frame between construction and the renderer draining the bake queue. */
    get baked() { return bakedMat !== null && mesh.material === bakedMat; },
    /** Wall-clock of the last bake, milliseconds. F4's falsifier is 400 ms. */
    get bakeMs() { return bakeMs; },
    /** Texels per cube face, or 0 on a live-shader dome. */
    bakeSize: bakeable ? bakeSize : 0,
    /** Force a re-bake. The live-tuning handles below call it for you. */
    rebake: queueBake,
    /** Live handle for probes and for anything that wants to prove the dome is the source. */
    setGain(k) { mat.uniforms.uGain.value = k; queueBake(); },
    /**
     * Scale every emissive term of the dome by one factor, live.
     *
     * THIS IS THE HANDLE §6.2's "single uniform scale" ACTUALLY NEEDS, and
     * `skybox-spec.md` §3.1 is wrong about how to get it. It says to "scale
     * `baseGain` and leave `gain` alone: `baseGain` is the multiplier on the whole
     * field". Read the fragment body: `uBase` multiplies the ECLIPTIC BAND term
     * only and `uGain` multiplies the LOBE term only. Scaling `baseGain` alone
     * leaves the lobe at 100% of an output the rest of the sky has been cut to 14%
     * of, which is not a uniform scale — it is a bright green blob on a dark field.
     * Every emissive term moves together here, which is what preserves the channel
     * ratios and therefore every hue exactly.
     */
    setScale(k) {
      const u = mat.uniforms;
      u.uGain.value = gain * k;
      u.uBase.value = baseGain * k;
      if (u.uGal) u.uGal.value.y = galGain * k;
      queueBake();
    },
    /**
     * The three emissive terms independently, for solving their RATIO. `setScale`
     * solves the level; this solves the mix. Absolute values, not multipliers.
     */
    setTerms(g, base, gal) {
      const u = mat.uniforms;
      if (g != null) u.uGain.value = g;
      if (base != null) u.uBase.value = base;
      if (gal != null && u.uGal) u.uGal.value.y = gal;
      queueBake();
    },
    /**
     * The structural knobs, live, for the same reason `setTerms` exists: the
     * frequency content of this field is graded by looking at a frame, and a knob
     * you have to rebuild to move is a knob nobody sweeps. No-op on an unstructured
     * dome.
     */
    setField({ structure: s, laneDepth: ld, lane: lw, fieldScale: fs, coreBias: cb, galHeight: gh } = {}) {
      const u = mat.uniforms;
      if (gh != null && u.uGal) u.uGal.value.x = gh;
      if (!u.uStructure) { queueBake(); return false; }
      if (s != null) u.uStructure.value = s;
      if (cb != null) u.uCoreBias.value = cb;
      if (fs != null) u.uField.value.x = fs;
      if (ld != null) u.uLaneShape.value.z = ld;
      if (lw) u.uLaneShape.value.set(lw[0], lw[1], u.uLaneShape.value.z, u.uLaneShape.value.w);
      queueBake();
      return true;
    },
    dispose() {
      disposed = true;
      geo.dispose();
      mat.dispose();
      bakedMat?.dispose();
      bakedCube?.dispose();
    },
  };
}
