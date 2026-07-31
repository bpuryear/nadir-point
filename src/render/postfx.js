import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/**
 * Screen-space volumetric light. Radial blur of the bright parts of the frame
 * towards the key light's projected position. Against a near-black starfield this
 * reads as shafts through debris without paying for a real march.
 */
const GodRaysShader = {
  name: 'GodRays',
  uniforms: {
    tDiffuse: { value: null },
    lightScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    intensity: { value: 0.42 },
    decay: { value: 0.94 },
    density: { value: 0.72 },
    weight: { value: 0.32 },
    threshold: { value: 1.05 },
    samples: { value: 24 },
    tint: { value: new THREE.Color(1, 0.92, 0.78) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 lightScreenPos;
    uniform float intensity, decay, density, weight, threshold;
    uniform int samples;
    uniform vec3 tint;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (intensity <= 0.0001) { gl_FragColor = base; return; }

      vec2 delta = (vUv - lightScreenPos) * (density / float(samples));
      vec2 coord = vUv;
      float illum = 1.0;
      vec3 accum = vec3(0.0);

      for (int i = 0; i < 64; i++) {
        if (i >= samples) break;
        coord -= delta;
        vec3 s = texture2D(tDiffuse, clamp(coord, 0.0, 1.0)).rgb;
        // only genuinely bright things throw shafts
        float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
        s *= smoothstep(threshold, threshold * 2.0, lum);
        accum += s * illum * weight;
        illum *= decay;
      }

      // fade out when the light is off screen so shafts do not pop at the frame edge
      vec2 d = abs(lightScreenPos - vec2(0.5));
      float onScreen = 1.0 - smoothstep(0.5, 1.15, max(d.x, d.y));
      gl_FragColor = vec4(base.rgb + accum * tint * intensity * onScreen, base.a);
    }
  `,
};

/**
 * Final grade, applied after tone mapping in LDR: a per-POI lift/gain, chromatic
 * aberration, vignette, film grain and an ordered dither. The dither is not
 * decoration - 8-bit gradients across a nebula band without it, and you see every
 * step.
 *
 * THE LIFT/GAIN PAIR IS THE ONLY THING TYING A FRAME TOGETHER.
 *
 * Every object in a shot is lit by the POI rig, but they do not share an albedo
 * family: the rocks are warm brown, the hull is neutral gunmetal, the giant is cold
 * blue. Lit correctly and graded not at all, that is three unrelated temperatures in
 * one frame. `lift` tints the toe towards the POI's shadow colour and `gain` tints
 * the shoulder towards its key, weighted by how dark or bright each pixel already
 * is - so the shadows across every object in frame agree with each other and so do
 * the highlights. It is a few lines of shader and it does more for coherence than
 * any amount of re-authoring albedo.
 */
const GradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    aberration: { value: 0.0016 },
    grain: { value: 0.028 },
    vignette: { value: 0.42 },
    vignetteSoftness: { value: 0.62 },
    dither: { value: 1.0 },
    saturation: { value: 1.04 },
    /** Toe tint (linear-ish LDR colour) and how far into the toe it reaches. */
    lift: { value: new THREE.Color(0.04, 0.08, 0.15) },
    liftAmount: { value: 0.03 },
    /** Shoulder tint and its weight. */
    gain: { value: new THREE.Color(1.0, 0.96, 0.90) },
    gainAmount: { value: 0.10 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, aberration, grain, vignette, vignetteSoftness, dither, saturation;
    uniform float liftAmount, gainAmount;
    uniform vec3 lift, gain;
    varying vec2 vUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    // 4x4 ordered Bayer matrix
    float bayer(vec2 pos) {
      int x = int(mod(pos.x, 4.0));
      int y = int(mod(pos.y, 4.0));
      int idx = y * 4 + x;
      float m[16];
      m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
      m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
      m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
      m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
      float v = 0.0;
      for (int i = 0; i < 16; i++) { if (i == idx) v = m[i]; }
      return v / 16.0 - 0.5;
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCentre = uv - 0.5;
      float r2 = dot(fromCentre, fromCentre);

      // aberration scales with distance from centre - zero in the middle of frame
      vec2 ca = fromCentre * aberration * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - ca).b;

      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, saturation);

      // Toe towards the POI's shadow colour, shoulder towards its key. Both are
      // weighted by where the pixel already sits on the curve, so a mid-grey hull
      // flank is barely touched while the black of space picks up the location's
      // cold and the lit decks pick up its cream.
      float toe = 1.0 - smoothstep(0.0, 0.42, lum);
      float shoulder = smoothstep(0.24, 0.95, lum);
      col += lift * (liftAmount * toe);
      col = mix(col, col * gain, gainAmount * shoulder);

      float vig = 1.0 - vignette * smoothstep(vignetteSoftness * 0.35, 0.86, length(fromCentre) * 1.32);
      col *= vig;

      float n = hash21(uv * resolution + fract(time) * 431.17) - 0.5;
      col += n * grain * (1.0 - smoothstep(0.0, 0.65, lum));

      col += bayer(gl_FragCoord.xy) * (dither / 255.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * `msaa` is the sample count on the HDR composer target. It is a quality knob and
 * not a constant because it is the one setting here whose cost is per-SAMPLE over
 * every covered pixel of a half-float target — on a machine that can afford it, it
 * is the only thing that fixes a high-contrast geometric silhouette (see the note in
 * the constructor); on one that cannot, it is the first thing to drop. 0 falls back
 * to SMAA alone, which is what shipped before.
 *
 * ===========================================================================
 * A-2: `msaa` AND `renderScale` HAD NEVER BEEN READ, AND `msaa` IS 31% OF THE FRAME
 * ===========================================================================
 *
 * `docs/review/perf-bisect.md` §5 found it: `setQuality` below read `gtao`, `godrays`,
 * `godraySamples`, `bloom` and `smaa` and NOTHING ELSE. The sample count was hard-coded
 * `samples: 4` in the constructor and `renderScale` was matched by `grep -rn` in exactly
 * two places tree-wide — this table, and a comment describing what it would do if
 * anything read it. So `low` and `medium` paid 4x MSAA on a 2560x1440 half-float target,
 * which this table says they should not, and `low`'s `renderScale: 0.85` never rendered
 * a single frame at 0.85.
 *
 * This is the same defect `renderer.js:128-139` documents one layer up — `?quality=`
 * doing nothing for the life of the project because `PostChain` was constructed before
 * `opts.quality` resolved. That was fixed at `c9bfd00`. Two knobs in the same table were
 * left dead by the fix. Both are read now: `msaa` in `_setSamples`, `renderScale` in
 * `setSize`.
 *
 * AND `high` DROPS 4 -> 2, WHICH IS A LOOK DECISION AND IS MEASURED, NOT ASSUMED.
 * `perfattrib`'s `msaa:samples=2`, A-B-A against local baselines, 3 passes, spread 0.70:
 * **4.52 ms of a 14.1 ms frame, 31%.** It is the cheapest quality-per-millisecond trade
 * in the whole chain and there is nothing else in the frame close to it. What is NOT
 * given up: SMAA stays enabled at `high` behind it, so a silhouette still gets a
 * coverage resolve AND a morphological one. `ultra` keeps 4 — that is the preset whose
 * entire job is to spend fill on the frame the owner judges captures with, and the 4x
 * coverage the constructor's note argues for lives there now rather than nowhere.
 *
 * `perf-bisect.md` §6 #2 also prices dropping SMAA at `high` at a further 3.13 ms. THAT
 * ONE IS NOT TAKEN HERE and the reason is in the constructor's note: SMAA and MSAA are
 * the two halves of the answer to a round-one review complaint about stair-stepped
 * silhouettes, and halving the coverage samples AND deleting the morphological pass in
 * one commit would leave nobody able to say which of the two moved the edge. The number
 * is recorded so the owner can take it as a second step against a capture; see
 * §"what was measured and not taken" in the commit.
 */
export const QUALITY_PRESETS = {
  low:    { gtao: false, godrays: false, bloom: true,  smaa: true,  msaa: 0, bloomRes: 0.5,  godraySamples: 0,  renderScale: 0.85 },
  medium: { gtao: false, godrays: true,  bloom: true,  smaa: true,  msaa: 2, bloomRes: 0.5,  godraySamples: 16, renderScale: 1.0 },
  high:   { gtao: true,  godrays: true,  bloom: true,  smaa: true,  msaa: 2, bloomRes: 0.6,  godraySamples: 24, renderScale: 1.0 },
  ultra:  { gtao: true,  godrays: true,  bloom: true,  smaa: true,  msaa: 4, bloomRes: 0.75, godraySamples: 40, renderScale: 1.0 },
};

/**
 * The HDR buffer the whole frame is composed in, plus the depth texture GTAO reads.
 *
 * `depthTexture` is not decoration and it is not free-floating: it is the entire
 * mechanism of `SceneDepthGTAOPass` below. `RenderPass` writes colour AND depth into
 * this target; attaching a texture rather than a renderbuffer is what makes that depth
 * SAMPLEABLE afterwards, and three resolves it out of the multisample framebuffer for
 * us (`WebGLTextures.js:2323-2342` blits with `DEPTH_BUFFER_BIT` whenever
 * `resolveDepthBuffer` is true, which is the default).
 *
 * `stencilBuffer: false`, so the depth texture is `DepthFormat`/`UnsignedIntType`
 * (DEPTH_COMPONENT24) rather than the packed depth-stencil GTAOPass allocates for
 * itself. Both sample their depth in `.x`, which is what `DEPTH_SWIZZLING` selects.
 */
function makeHdrTarget(samples) {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
    samples,
    depthBuffer: true,
    stencilBuffer: false,
    depthTexture: new THREE.DepthTexture(1, 1),
  });
}

/**
 * GTAO WITHOUT ITS OWN DEPTH-NORMAL PREPASS. THIS IS THE DRAW-CALL FIX.
 *
 * `docs/review/perf-bisect.md` §3.1 ledgers the busiest frame of the benchmark scene:
 *
 *     farPass (celestials)         calls   10
 *     mainPass (gameplay+shadow)   calls  200
 *     gtao                         calls  190     <- 45% of the frame's draw calls
 *     everything after gtao        calls   19
 *     TOTAL                        calls  419     against a ceiling of 320
 *
 * The scene's OWN geometry has been inside the 320 ceiling the whole time. 190 of the
 * 419 are stock `GTAOPass` re-rendering every mesh in the scene a second time under
 * `MeshNormalMaterial` to fill a G-buffer — and `perf-bisect.md` §3.3 prices halving the
 * AO RESOLVE at 0.31 ms against 2.62 ms for the whole pass, which says the cost is the
 * redraw and not the resolve.
 *
 * `mainPass` already wrote exactly that depth, one pass earlier, into the composer's own
 * target. `GTAOPass.setGBuffer()` exists for precisely this and sets `_renderGBuffer =
 * false` when handed a depth texture. Two details make it work here and both are checked
 * rather than assumed:
 *
 *   1. WHICH BUFFER. `EffectComposer` ping-pongs, and which of `renderTarget1`/`2` holds
 *      the scene depth depends on how many `needsSwap` passes ran before us — a parity
 *      that is NOT stable frame to frame. So the depth is taken from the `readBuffer`
 *      ARGUMENT this pass is handed, which is by definition the buffer the two
 *      `RenderPass`es just drew into, whatever the parity. Nothing here reaches into the
 *      composer's internals.
 *   2. WHAT IS IN IT. `mainPass.clearDepth = true`, so the depth under GTAO is the
 *      gameplay scene alone and the celestial backdrop is not in it — the same set stock
 *      GTAOPass's prepass renders. It differs in one way and the difference is in our
 *      favour: the prepass draws every mesh regardless of `depthWrite`, while the real
 *      depth buffer honours it, and every VFX material in `src/vfx/**` is
 *      `depthWrite: false` (shields:158, engines:326, rings:170, weapons:160 and :315,
 *      damage:72, particles:175). Additive plumes therefore cannot occlude anything in
 *      the AO, which they could before. The only `THREE.Points` in the project is the
 *      starfield (`celestials/starfield.js:351`) and it is in the FAR scene, so the
 *      point/line exclusion stock GTAOPass does with `_overrideVisibility` is moot.
 *
 * WHAT IS GIVEN UP: the normal buffer. With no `tNormal`, `GTAOShader`'s
 * `NORMAL_VECTOR_TYPE 0` path reconstructs the view normal from depth. That is the
 * edge-aware variant — it takes two taps either side on each axis and picks the side
 * with the smaller second derivative (`GTAOShader.js:120-140`), which is the standard
 * defence against smearing a normal across a silhouette. On a hull made of large flat
 * plates the reconstruction is exact, because a plane's normal IS its depth gradient.
 * It costs eight extra depth fetches per AO pixel, which is why the measured saving
 * below is not the full 2.62 ms bound.
 */
class SceneDepthGTAOPass extends GTAOPass {
  constructor(scene, camera, width, height) {
    super(scene, camera, width, height);

    // Stop the prepass, and free the full-resolution half-float RGBA normal target it
    // was allocating (2560x1440 x RGBA16F = 29.5 MB) plus its own depth-stencil texture.
    // `setSize` below keeps it pinned at 1x1; it is kept rather than nulled only because
    // `GTAOPass.setSize`/`dispose` dereference it unconditionally.
    this._renderGBuffer = false;
    this.normalRenderTarget.dispose();
    this.normalRenderTarget.setSize(1, 1);
    this.normalTexture = null;
    this.depthTexture = null;
    this._boundDepth = undefined;
    this._depthComplained = false;

    for (const m of [this.gtaoMaterial, this.pdMaterial]) {
      m.defines.NORMAL_VECTOR_TYPE = 0;   // reconstruct from depth
      m.defines.DEPTH_SWIZZLING = 'x';    // DepthFormat, not packed depth-stencil
      m.uniforms.tNormal.value = null;
      m.needsUpdate = true;
    }
  }

  setSize(width, height) {
    super.setSize(width, height);
    this.normalRenderTarget.setSize(1, 1);
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    const depth = readBuffer?.depthTexture ?? null;
    if (!depth) {
      // Loud rather than silent: `tools/smoke.mjs` treats a console error as a defect,
      // so a composer target built without a depth texture fails a gate instead of
      // quietly shipping a frame with no ambient occlusion in it.
      if (!this._depthComplained) {
        this._depthComplained = true;
        console.error('[postfx] GTAO read buffer has no depthTexture; disabling ambient occlusion');
      }
      this.enabled = false;
      return;
    }
    if (depth !== this._boundDepth) {
      this._boundDepth = depth;
      this.depthTexture = depth;
      this.gtaoMaterial.uniforms.tDepth.value = depth;
      this.pdMaterial.uniforms.tDepth.value = depth;
      this.depthRenderMaterial.uniforms.tDepth.value = depth;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

export class PostChain {
  constructor(rendererWrapper, quality = 'high') {
    this.rw = rendererWrapper;
    const renderer = rendererWrapper.renderer;

    /**
     * MSAA ON THE HDR BUFFER, WHICH THE RENDERER'S OWN `antialias: false` CANNOT DO.
     *
     * Round-one review: "hard stair-stepped silhouette edges throughout both frames,
     * the images read lower-fidelity than the geometry deserves", and separately the
     * radiator fin field aliasing into moire at 1280x720.
     *
     * SMAA was already in the chain and is not enough here, for a reason specific to
     * this game: SMAA is a post filter on the RESOLVED image, and it reconstructs an
     * edge by looking at neighbouring pixels. A 1400 m hull against a near-black
     * starfield is the worst case for that — the edge is a two-pixel step between a
     * lit plate and literal zero, with nothing in between for the filter to infer a
     * gradient from, so it leaves the staircase almost intact. MSAA supersamples
     * COVERAGE at the rasteriser, before anything is resolved, which is the only
     * thing that fixes a high-contrast geometric silhouette.
     *
     * It goes on the composer's render target rather than on the WebGLRenderer,
     * because everything is drawn into the HDR chain and the renderer's own
     * backbuffer is never what the frame is composed in. `renderer.antialias` stays
     * false and the note there stays true: MSAA on the BACKBUFFER does not survive
     * HDR. MSAA on the HDR target does, because the resolve happens in HDR.
     *
     * 4 samples, not 8: this is a fill-rate cost on every pixel of a half-float
     * target and 4 already removes the staircase. SMAA stays in the chain after the
     * grade, where it now only has sub-pixel work left to do.
     *
     * A-2: THE SAMPLE COUNT IS NO LONGER WRITTEN HERE. It comes from
     * `QUALITY_PRESETS[quality].msaa` via `_setSamples`, which is what that field was
     * always for and what nothing had ever read. The paragraphs above stay true of
     * `ultra`, which keeps 4; `high` is 2 and the header on the preset table has the
     * measurement that moved it.
     */
    this._samples = (QUALITY_PRESETS[quality] ?? QUALITY_PRESETS.high).msaa ?? 4;
    this.composer = new EffectComposer(renderer, makeHdrTarget(this._samples));
    this.composer.renderTarget1.texture.name = 'EffectComposer.rt1';
    this.composer.renderTarget2.texture.name = 'EffectComposer.rt2';
    this.composer.renderToScreen = true;

    // 1. celestial backdrop, clears the buffer
    this.farPass = new RenderPass(rendererWrapper.far, rendererWrapper.farCamera);
    this.farPass.clear = true;
    this.farPass.clearDepth = false;

    // 2. gameplay scene on top, keeps colour, resets depth
    this.mainPass = new RenderPass(rendererWrapper.scene, rendererWrapper.camera);
    this.mainPass.clear = false;
    this.mainPass.clearDepth = true;

    /**
     * 3. Ambient occlusion over gameplay geometry only.
     *
     * Tuned up hard, and the reason is specific: when the key is behind the camera
     * there is no terminator anywhere in frame, and on a hull built out of boxes
     * every visible face returns nearly the same value. AO is then the ONLY thing
     * separating the dorsal block from the deck it sits on, the truss legs from the
     * hull above them, and one bolted-on module from the next. The radius is in
     * METRES, so 60 is the scale of the gaps between a cruiser's masses - a radius
     * tuned on a 1 m test scene does nothing here at all.
     */
    this.gtao = new SceneDepthGTAOPass(rendererWrapper.scene, rendererWrapper.camera, 1, 1);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 1.0;
    this.gtao.updateGtaoMaterial({
      radius: 60.0,
      distanceExponent: 1.4,
      thickness: 30.0,
      scale: 1.35,
      samples: 16,
      screenSpaceRadius: false,
    });

    // 4. volumetric shafts from the key light
    this.godrays = new ShaderPass(GodRaysShader);

    // 5. HDR bloom, tight threshold - haze here would kill the near-black shadows
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.34, 1.05);

    // 6. ACES tone map + sRGB transfer
    this.output = new OutputPass();

    // 7. LDR grade
    this.grade = new ShaderPass(GradeShader);

    // 8. edge AA last, on the graded image
    this.smaa = new SMAAPass();

    this.composer.addPass(this.farPass);
    this.composer.addPass(this.mainPass);
    this.composer.addPass(this.gtao);
    this.composer.addPass(this.godrays);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.smaa);

    this._keyLight = null;
    this._lightWorld = new THREE.Vector3();
    this._lightProjected = new THREE.Vector3();

    /**
     * Exposure is split in two so unrelated systems can drive it without fighting.
     * `baseExposure` is the POI's grade - each point of interest is a lighting setup
     * and owns its own stop. `exposureScale` is transient and multiplicative, used by
     * the tactical overlay to dim the live 3D scene as the strategic view fades in.
     */
    this.baseExposure = 1.0;
    this.exposureScale = 1.0;

    this.setQuality(quality);
  }

  /** Per-POI grade exposure. */
  setExposure(v) {
    this.baseExposure = v;
    this._applyExposure();
  }

  /** Transient multiplier, 0..1. The tactical overlay drives this to 0.22. */
  setExposureScale(v) {
    this.exposureScale = v;
    this._applyExposure();
  }

  _applyExposure() {
    this.rw.renderer.toneMappingExposure = this.baseExposure * this.exposureScale;
  }

  /**
   * The POI's colour grade.
   *
   * Colours come in as PALETTE HEX and are decoded to their raw 0..1 sRGB
   * components, NOT converted to the renderer's linear working space. This pass
   * runs after OutputPass, so the pixels it sees are already display-encoded; a
   * linear-space tint here would arrive one or two orders of magnitude too weak in
   * the toe and be silently invisible. The lift is additionally normalised so its
   * brightest channel is 1, which makes `liftAmount` mean exactly "how far off zero
   * the black point moves", in units the viewer can see.
   *
   * @param {{lift?:number|null, liftAmount?:number,
   *          gain?:number|null, gainAmount?:number,
   *          saturation?:number}} g   colours are palette hex, not THREE.Color
   */
  setColorGrade(g = {}) {
    const u = this.grade.uniforms;
    if (g.lift != null) {
      const r = ((g.lift >> 16) & 255) / 255;
      const gr = ((g.lift >> 8) & 255) / 255;
      const b = (g.lift & 255) / 255;
      const p = Math.max(1e-3, r, gr, b);
      u.lift.value.setRGB(r / p, gr / p, b / p);
    }
    if (g.gain != null) {
      u.gain.value.setRGB(
        ((g.gain >> 16) & 255) / 255,
        ((g.gain >> 8) & 255) / 255,
        (g.gain & 255) / 255,
      );
    }
    if (g.liftAmount != null) u.liftAmount.value = g.liftAmount;
    if (g.gainAmount != null) u.gainAmount.value = g.gainAmount;
    if (g.saturation != null) u.saturation.value = g.saturation;
  }

  /** Snapshot, so a POI can restore whatever was there before it. */
  getColorGrade() {
    const u = this.grade.uniforms;
    const hex = (c) => (Math.round(Math.min(1, c.r) * 255) << 16)
      | (Math.round(Math.min(1, c.g) * 255) << 8)
      | Math.round(Math.min(1, c.b) * 255);
    return {
      lift: hex(u.lift.value),
      liftAmount: u.liftAmount.value,
      gain: hex(u.gain.value),
      gainAmount: u.gainAmount.value,
      saturation: u.saturation.value,
    };
  }

  /** Point the volumetrics at whatever object stands in for this POI's key light. */
  setKeyLight(object3D, tint = null) {
    this._keyLight = object3D;
    if (tint) this.godrays.uniforms.tint.value.copy(tint);
  }

  /**
   * Rebuild the composer's two HDR buffers at a new sample count.
   *
   * It has to be a rebuild. `samples` is read once, when three allocates the
   * framebuffer (`WebGLTextures#setupRenderTarget`, guarded on
   * `__webglFramebuffer === undefined`), so assigning `renderTarget.samples` on a
   * live target changes a number nobody reads a second time — which is the same shape
   * of bug as the dead preset field this method exists to honour.
   */
  _setSamples(n) {
    if (n === this._samples) return;
    this._samples = n;
    // `EffectComposer#reset` disposes both buffers and clones the replacement, and
    // `RenderTarget#copy` clones `depthTexture` rather than aliasing it, so rt1 and rt2
    // end up with one depth texture each. Verified, because two ping-pong buffers
    // sharing one depth attachment would be a silent one-frame-late AO.
    this.composer.reset(makeHdrTarget(n));
    this.composer.renderTarget1.texture.name = 'EffectComposer.rt1';
    this.composer.renderTarget2.texture.name = 'EffectComposer.rt2';
    if (this._w) this.composer.setSize(this._w, this._h);
  }

  setQuality(name) {
    const q = QUALITY_PRESETS[name] ?? QUALITY_PRESETS.high;
    this.quality = name;
    this.preset = q;
    this.gtao.enabled = q.gtao;
    this.godrays.enabled = q.godrays;
    this.godrays.uniforms.samples.value = q.godraySamples;
    this.bloom.enabled = q.bloom;
    this.smaa.enabled = q.smaa;
    this._setSamples(q.msaa ?? 4);
    if (this._w) this.setSize(this._w, this._h, this._pr);
  }

  /**
   * `renderScale` shrinks the INTERNAL chain and leaves the canvas alone.
   *
   * Every pass runs at `pixelRatio * renderScale`; the final pass writes to the
   * default framebuffer, which is still at the canvas's own size, so the hardware
   * scales once on the way out. That is what makes it a fill-rate knob rather than a
   * window-size knob: `perf-bisect.md` §3.2 fits the frame at
   * `0.0102 + 0.9859 x (pixel share)`, so 0.85 scale is 0.72 of the pixels and about
   * 0.73 of the frame. It is 1.0 at `medium`, `high` and `ultra` and changes nothing
   * there; it exists so `low` means what its row says.
   */
  setSize(width, height, pixelRatio = 1) {
    this._w = width;
    this._h = height;
    this._pr = pixelRatio;
    const scale = this.preset.renderScale ?? 1;
    const w = Math.max(1, Math.floor(width * pixelRatio * scale));
    const h = Math.max(1, Math.floor(height * pixelRatio * scale));
    // The composer is driven in whole PIXELS with a ratio of 1, rather than in logical
    // units with the ratio folded in. `EffectComposer#setSize` multiplies its arguments
    // by `_pixelRatio` and hands the product straight to `RenderTarget#setSize` and to
    // every pass, and `renderScale: 0.85` is the first setting in this project able to
    // make that product fractional. A fractional render-target width is not a size any
    // GL call can take, so it would be silently truncated somewhere downstream of here.
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    this.gtao.setSize(w, h);
    this.bloom.setSize(Math.floor(w * this.preset.bloomRes), Math.floor(h * this.preset.bloomRes));
    this.grade.uniforms.resolution.value.set(w, h);
  }

  render(elapsed = performance.now() / 1000) {
    this.grade.uniforms.time.value = elapsed;

    if (this.godrays.enabled) {
      const cam = this.rw.camera;
      if (this._keyLight) {
        this._keyLight.getWorldPosition(this._lightWorld);
        this._lightProjected.copy(this._lightWorld).project(cam);
      } else {
        this._lightProjected.set(0, 0, -1);
      }
      // Behind the camera means no shafts at all.
      const behind = this._lightProjected.z > 1;
      this.godrays.uniforms.lightScreenPos.value.set(
        this._lightProjected.x * 0.5 + 0.5,
        this._lightProjected.y * 0.5 + 0.5,
      );
      this.godrays.uniforms.intensity.value = behind ? 0 : (this._godrayIntensity ?? 0.42);
    }

    this.composer.render();
  }

  set godrayIntensity(v) { this._godrayIntensity = v; }
  get godrayIntensity() { return this._godrayIntensity ?? 0.42; }

  dispose() {
    // `EffectComposer#dispose` frees its two buffers and nothing else — it does not walk
    // `passes`. GTAO and SMAA each own render targets, and GTAO's are full-resolution, so
    // they are disposed here by name rather than left to a composer that never looks at
    // them. (`SceneDepthGTAOPass` keeps `normalRenderTarget` at 1x1 alive precisely so
    // that `GTAOPass#dispose` can dereference it here without a null check.)
    this.gtao.dispose?.();
    this.smaa.dispose?.();
    this.bloom.dispose?.();
    this.composer.dispose?.();
  }
}
