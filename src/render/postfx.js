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
 * Final grade, applied after tone mapping in LDR: chromatic aberration, vignette,
 * film grain and an ordered dither. The dither is not decoration - 8-bit gradients
 * across a nebula band without it, and you see every step.
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
    lift: { value: new THREE.Color(0.004, 0.008, 0.016) },
    gain: { value: new THREE.Color(1.0, 0.995, 1.01) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, aberration, grain, vignette, vignetteSoftness, dither, saturation;
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
      col = col * gain + lift;

      float vig = 1.0 - vignette * smoothstep(vignetteSoftness * 0.35, 0.86, length(fromCentre) * 1.32);
      col *= vig;

      float n = hash21(uv * resolution + fract(time) * 431.17) - 0.5;
      col += n * grain * (1.0 - smoothstep(0.0, 0.65, lum));

      col += bayer(gl_FragCoord.xy) * (dither / 255.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const QUALITY_PRESETS = {
  low:    { gtao: false, godrays: false, bloom: true,  smaa: false, bloomRes: 0.5,  godraySamples: 0,  renderScale: 0.85 },
  medium: { gtao: false, godrays: true,  bloom: true,  smaa: true,  bloomRes: 0.5,  godraySamples: 16, renderScale: 1.0 },
  high:   { gtao: true,  godrays: true,  bloom: true,  smaa: true,  bloomRes: 0.6,  godraySamples: 24, renderScale: 1.0 },
  ultra:  { gtao: true,  godrays: true,  bloom: true,  smaa: true,  bloomRes: 0.75, godraySamples: 40, renderScale: 1.0 },
};

export class PostChain {
  constructor(rendererWrapper, quality = 'high') {
    this.rw = rendererWrapper;
    const renderer = rendererWrapper.renderer;

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: 0,
      depthBuffer: true,
      stencilBuffer: false,
    }));
    this.composer.renderToScreen = true;

    // 1. celestial backdrop, clears the buffer
    this.farPass = new RenderPass(rendererWrapper.far, rendererWrapper.farCamera);
    this.farPass.clear = true;
    this.farPass.clearDepth = false;

    // 2. gameplay scene on top, keeps colour, resets depth
    this.mainPass = new RenderPass(rendererWrapper.scene, rendererWrapper.camera);
    this.mainPass.clear = false;
    this.mainPass.clearDepth = true;

    // 3. ambient occlusion over gameplay geometry only
    this.gtao = new GTAOPass(rendererWrapper.scene, rendererWrapper.camera, 1, 1);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({
      radius: 34.0,
      distanceExponent: 1.6,
      thickness: 12.0,
      scale: 1.0,
      samples: 12,
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
    this.setQuality(quality);
  }

  /** Point the volumetrics at whatever object stands in for this POI's key light. */
  setKeyLight(object3D, tint = null) {
    this._keyLight = object3D;
    if (tint) this.godrays.uniforms.tint.value.copy(tint);
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
    if (this._w) this.setSize(this._w, this._h, this._pr);
  }

  setSize(width, height, pixelRatio = 1) {
    this._w = width;
    this._h = height;
    this._pr = pixelRatio;
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
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
    this.composer.dispose?.();
  }
}
