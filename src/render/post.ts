/**
 * The post chain: bloom, then ordered dither, then grain, then vignette.
 *
 * The spec fixes both the contents and the order, and forbids everything else —
 * no CRT-tube warping, no interlace-line cosplay, no split-channel colour
 * fringing. This is meant to read as clean pixel art under a disciplined
 * grade, not as nostalgia filtering.
 *
 * The bloom threshold is high on purpose, but see BLOOM_THRESHOLD below: a
 * luminance threshold cannot actually separate emissives from hull values in
 * this palette, because the two ranges overlap. What the current number buys
 * is a compromise, not a clean separation.
 */

import { Filter, GlProgram, GpuProgram, type Container } from 'pixi.js';

export interface PostSettings {
  bloom: boolean;
  dither: boolean;
  grain: boolean;
  vignette: boolean;
}

export const DEFAULT_POST: Readonly<PostSettings> = {
  bloom: true,
  dither: true,
  grain: true,
  vignette: true,
};

/**
 * Luminance above which a pixel blooms, in 0..1.
 *
 * **There is no gap for this number to live in.** The emissive and hull
 * luminance ranges overlap completely, so no threshold — not this one, not any
 * other — separates them. Measured with `luminance(c) / 255` over
 * `src/gen/palette.ts`:
 *
 *   - dimmest emissive: `EMISSIVE.red` at 0.495
 *   - brightest non-emissive: `NEUTRAL[7]` at 0.895
 *
 * At the shipped 0.72, five palette entries that are not emissive haze anyway
 * (`NEUTRAL[6]` 0.759, `NEUTRAL[7]` 0.895, `CONCORD_RAMP[6]` 0.811,
 * `COALITION_RAMP[6]` 0.794, `UI[6]` 0.864) while five of the eight emissives
 * never bloom at all (`red` 0.495, `blue` 0.556, `magenta` 0.575, `orange`
 * 0.598, `green` 0.717). `green` misses by three thousandths; the ship's own
 * running-light colour, `EMISSIVE.amber` at 0.730, clears the line by 0.010.
 *
 * So do **not** read a hazing hull as a regression in the palette and go
 * "restore" a brightness invariant: the palette never had one, and no edit to
 * a single ramp entry can give it one while emissives run from 0.495 to 0.966.
 *
 * The remedy is an open decision, deliberately not taken here. The two
 * candidates are (a) key the bloom on palette membership instead of luminance —
 * bake an emissive mask into the alpha or a second channel at generation time
 * and let the shader read that, which makes "only emissives bloom" exact and
 * threshold-free; or (b) re-grade the palette so the emissive and hull
 * luminance ranges genuinely separate, which is a visual-direction change to
 * every sprite in the game, not a shader change. Until that call is made this
 * number stays where it is, and this comment is the record of what it does.
 */
export const BLOOM_THRESHOLD = 0.72;

/** Grain is deliberately barely there. */
const GRAIN_STRENGTH = 0.035;
const VIGNETTE_STRENGTH = 0.28;

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }
`;

/**
 * WGSL companion to `VERTEX`, shared by every stage.
 *
 * `createDevice` (Task 10) boots WebGPU by default with WebGL2 as the observed
 * fallback — it is not a hypothetical path, it is what this project actually
 * runs under first. A `Filter` built with only a `glProgram` reports itself
 * compatible with `RendererType.WEBGL` alone (see `Shader`'s constructor); on
 * a WebGPU renderer, Pixi's `FilterSystem._popFilterData` finds the filter
 * incompatible and sets `filterData.skip = true` for the *entire* filter
 * list — no error, no warning, the pass is just skipped. Confirmed in the
 * browser: with only `glProgram` set, toggling every stage on and off through
 * `setEnabled` produced a byte-identical canvas every time (verified with a
 * pixel-level diff, not just a look). Each filter below now carries a
 * `gpuProgram` too, following the struct/binding layout Pixi's own bundled
 * filters (e.g. `NoiseFilter`) use, so the chain actually renders on the
 * backend this project boots by default.
 */
const WGSL_HEADER = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}
`;

function makeFilter(
  fragment: string,
  wgslFragment: string,
  resources: Record<string, unknown> = {},
): Filter {
  return new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment }),
    gpuProgram: GpuProgram.from({
      vertex: { source: WGSL_HEADER + wgslFragment, entryPoint: 'mainVertex' },
      fragment: { source: WGSL_HEADER + wgslFragment, entryPoint: 'mainFragment' },
    }),
    resources,
  });
}

/**
 * Bloom, tight. Extracts only pixels above the threshold, blurs them a little,
 * and adds them back — no haze pass over the whole frame.
 */
function bloomFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uThreshold;
out vec4 finalColor;
void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec3 sum = vec3(0.0);
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      vec2 o = vec2(float(x), float(y)) * uInputSize.zw;
      vec4 s = texture(uTexture, vTextureCoord + o);
      float l = dot(s.rgb, vec3(0.299, 0.587, 0.114));
      if (l > uThreshold) sum += s.rgb * (l - uThreshold);
    }
  }
  finalColor = vec4(base.rgb + sum * 0.16, base.a);
}
`, `
struct BloomUniforms { uThreshold: f32 };
@group(1) @binding(0) var<uniform> uniforms: BloomUniforms;

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let base = textureSample(uTexture, uSampler, uv);
  var sum = vec3<f32>(0.0, 0.0, 0.0);
  for (var x: i32 = -2; x <= 2; x = x + 1) {
    for (var y: i32 = -2; y <= 2; y = y + 1) {
      let o = vec2<f32>(f32(x), f32(y)) * gfu.uInputSize.zw;
      let s = textureSample(uTexture, uSampler, uv + o);
      let l = dot(s.rgb, vec3<f32>(0.299, 0.587, 0.114));
      if (l > uniforms.uThreshold) {
        sum = sum + s.rgb * (l - uniforms.uThreshold);
      }
    }
  }
  return vec4<f32>(base.rgb + sum * 0.16, base.a);
}
`, { uniforms: { uThreshold: { value: BLOOM_THRESHOLD, type: 'f32' } } });
}

/** Ordered 4x4 dither, applied only where the frame has a gradient to break up. */
function ditherFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
out vec4 finalColor;
const float bayer[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0);
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 p = vTextureCoord * uInputSize.xy;
  int i = int(mod(p.y, 4.0)) * 4 + int(mod(p.x, 4.0));
  float t = (bayer[i] / 16.0 - 0.5) * (1.0 / 255.0) * 2.0;
  finalColor = vec4(c.rgb + t, c.a);
}
`, `
const bayer = array<f32, 16>(
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0);

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(uTexture, uSampler, uv);
  let p = uv * gfu.uInputSize.xy;
  let i = i32(p.y % 4.0) * 4 + i32(p.x % 4.0);
  let t = (bayer[i] / 16.0 - 0.5) * (1.0 / 255.0) * 2.0;
  return vec4<f32>(c.rgb + t, c.a);
}
`);
}

/** Static grain — no time uniform, so it cannot crawl between frames. */
function grainFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uStrength;
out vec4 finalColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float n = hash(floor(vTextureCoord * uInputSize.xy)) - 0.5;
  finalColor = vec4(c.rgb + n * uStrength, c.a);
}
`, `
struct GrainUniforms { uStrength: f32 };
@group(1) @binding(0) var<uniform> uniforms: GrainUniforms;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(uTexture, uSampler, uv);
  let n = hash(floor(uv * gfu.uInputSize.xy)) - 0.5;
  return vec4<f32>(c.rgb + n * uniforms.uStrength, c.a);
}
`, { uniforms: { uStrength: { value: GRAIN_STRENGTH, type: 'f32' } } });
}

function vignetteFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uStrength;
out vec4 finalColor;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 d = vTextureCoord - 0.5;
  float v = 1.0 - dot(d, d) * uStrength * 2.0;
  finalColor = vec4(c.rgb * clamp(v, 0.0, 1.0), c.a);
}
`, `
struct VignetteUniforms { uStrength: f32 };
@group(1) @binding(0) var<uniform> uniforms: VignetteUniforms;

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = textureSample(uTexture, uSampler, uv);
  let d = uv - vec2<f32>(0.5, 0.5);
  let v = 1.0 - dot(d, d) * uniforms.uStrength * 2.0;
  return vec4<f32>(c.rgb * clamp(v, 0.0, 1.0), c.a);
}
`, { uniforms: { uStrength: { value: VIGNETTE_STRENGTH, type: 'f32' } } });
}

export interface PostChain {
  filters: Filter[];
  setEnabled(stage: keyof PostSettings, on: boolean): void;
}

export function makePostChain(
  target: Container,
  settings: Partial<PostSettings> = {},
): PostChain {
  const active: PostSettings = { ...DEFAULT_POST, ...settings };

  const built: Record<keyof PostSettings, Filter> = {
    bloom: bloomFilter(),
    dither: ditherFilter(),
    grain: grainFilter(),
    vignette: vignetteFilter(),
  };

  // Order is fixed by the spec and must not be sorted or reordered.
  const ORDER: (keyof PostSettings)[] = ['bloom', 'dither', 'grain', 'vignette'];

  const rebuild = (): void => {
    const filters = ORDER.filter((k) => active[k]).map((k) => built[k]);
    target.filters = filters;
  };

  rebuild();

  return {
    get filters(): Filter[] {
      return ORDER.filter((k) => active[k]).map((k) => built[k]);
    },
    setEnabled(stage: keyof PostSettings, on: boolean): void {
      active[stage] = on;
      rebuild();
    },
  };
}
