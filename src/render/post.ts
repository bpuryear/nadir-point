import { RenderPipeline, type Camera, type Scene, type WebGPURenderer } from 'three/webgpu';
import { abs, float, length, luminance, mix, pass, rand, renderOutput, screenUV, smoothstep, time, uniform, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

export interface PostControls {
  pipeline: RenderPipeline;
  /** 0 = off, 1 = full tilt-shift blur. */
  blur: { value: number };
}

/**
 * Tilt-shift blur and bloom in linear light; then tone mapping and sRGB; then
 * grade, grain and vignette in display space, where their strength is what the
 * eye sees. Grain added in linear light turns near-black into grey mush.
 *
 * The blur is a vertical screen-space gradient: sharp in a middle band, blurred
 * toward the top and bottom edges. For a flat scene this reads as a miniature.
 */
export function createPost(renderer: WebGPURenderer, scene: Scene, camera: Camera): PostControls {
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');

  const uBlur = uniform(1);
  const uFocus = uniform(0.5);
  const uBand = uniform(0.12);
  const uSoft = uniform(0.34);

  const soft = gaussianBlur(color, null, 3, { resolutionScale: 0.5 });
  const heavy = gaussianBlur(soft, null, 7, { resolutionScale: 0.5 });
  const d = abs(screenUV.y.sub(uFocus));
  const t = smoothstep(uBand, uBand.add(uSoft), d).mul(uBlur);
  const blurred = mix(soft.rgb, heavy.rgb, smoothstep(0.4, 1, t));
  let linear = mix(color.rgb, blurred, smoothstep(0, 0.35, t));
  linear = linear.add(bloom(color, 0.9, 0.35, 1.1).rgb);

  // Display space from here on.
  let c = renderOutput(vec4(linear, 1)).rgb;

  // Grade: pull most of the colour out; the accents survive because they are bright.
  c = mix(vec3(luminance(c)), c, 0.72);

  const grain = rand(screenUV.add(time.mul(0.0137).fract())).sub(0.5).mul(0.028);
  c = c.add(grain);

  const vig = smoothstep(0.32, 0.85, length(screenUV.sub(0.5)));
  c = c.mul(float(1).sub(vig.mul(0.55)));

  const pipeline = new RenderPipeline(renderer, vec4(c, 1));
  pipeline.outputColorTransform = false;
  return { pipeline, blur: uBlur };
}
