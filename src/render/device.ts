/**
 * PixiJS application boot.
 *
 * The spec asks for WebGPU with automatic WebGL2 fallback, verified rather than
 * assumed — so `createDevice` reports which backend it actually got, and the
 * boot logs it. A silent fallback is the kind of thing that is discovered on a
 * user's machine six months later.
 *
 * The stage is the virtual canvas: everything is drawn into it at 1:1 and it is
 * scaled to the window by a whole number. Nearest-neighbour scaling and a
 * pixel-perfect canvas style are both required here, or the integer scale gets
 * undone by the browser's default smoothing at the very last step.
 *
 * That scaling happens in *two* steps, and the split is load-bearing. The stage
 * is rendered into `frame`, a RenderTexture that is exactly VIRTUAL_WIDTH x
 * VIRTUAL_HEIGHT whatever the window is doing, and only then is that texture
 * blitted to the display at the integer scale. The obvious alternative — put
 * the stage under `app.stage` and scale it there — was what this file used to
 * do, and it silently made every screen-space effect run at display resolution:
 * Pixi's FilterSystem sizes a filter's working texture from the resolution of
 * the render target it is drawing into, so on a 1920x1080 window at scale 4 the
 * post chain's grain hashed per *display* pixel and injected a 4x4 noise field
 * inside every art pixel, the 4x4 Bayer dither tile landed inside a single
 * virtual pixel, and bloom's +/-2 texel reach shrank to +/-0.5 virtual pixels —
 * inert. Measured before the change: the post-filtered image differed between a
 * 1000x600 and a 1920x1080 window, and 97-100% of virtual pixels carried
 * structure inside themselves. Rendering into a fixed-size target makes the
 * filter chain's input size a constant, so its output is the same bytes at
 * every window size and nothing can appear inside a pixel.
 */

import {
  Application, Container, RendererType, RenderTexture, Sprite, type Renderer,
} from 'pixi.js';
import { fitViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, type Viewport } from './viewport.js';

/** Matches the clear colour of the window itself, so the seam is invisible. */
const BACKGROUND = 0x04050a;

export interface Device {
  app: Application;
  /** The virtual canvas. Draw into this, never into app.stage directly. */
  stage: Container;
  /**
   * The fixed VIRTUAL_WIDTH x VIRTUAL_HEIGHT framebuffer `stage` renders into.
   * Its size never changes, which is what keeps the post chain resolution-
   * independent. `presentDevice` is what fills it.
   */
  frame: RenderTexture;
  /** The one sprite on `app.stage`: `frame`, blitted at the integer scale. */
  present: Sprite;
  viewport: Viewport;
  renderer: 'webgpu' | 'webgl';
}

export async function createDevice(
  host: HTMLElement,
  preference: 'webgpu' | 'webgl' = 'webgpu',
): Promise<Device> {
  const app = new Application();

  await app.init({
    preference,
    width: host.clientWidth,
    height: host.clientHeight,
    backgroundColor: 0x04050a,
    antialias: false,
    roundPixels: true,
    autoDensity: false,
    resolution: 1,
  });

  // Nearest-neighbour at the canvas level. Without this the browser smooths the
  // integer upscale and every pixel-integrity guarantee upstream is undone at
  // the last possible step.
  app.canvas.style.imageRendering = 'pixelated';
  host.appendChild(app.canvas);

  // Deliberately NOT added to app.stage: the stage is rendered into `frame`
  // by presentDevice, and app.stage holds only the sprite that shows `frame`.
  // Parenting it here as well would render the whole scene twice.
  const stage = new Container();

  const frame = RenderTexture.create({
    width: VIRTUAL_WIDTH,
    height: VIRTUAL_HEIGHT,
    // resolution 1 is the whole point: it is what the FilterSystem reads to
    // size the post chain's working textures.
    resolution: 1,
    antialias: false,
    scaleMode: 'nearest',
  });

  const present = new Sprite(frame);
  app.stage.addChild(present);

  const backend = detectBackend(app.renderer);
  const viewport = fitViewport(host.clientWidth, host.clientHeight);

  const device: Device = { app, stage, frame, present, viewport, renderer: backend };
  applyViewport(device);

  // Loud on purpose: a silent fallback is discovered on someone else's machine.
  console.info(
    `[render] backend=${backend} virtual=${VIRTUAL_WIDTH}x${VIRTUAL_HEIGHT} scale=${viewport.scale}`,
  );

  return device;
}

function detectBackend(renderer: Renderer): 'webgpu' | 'webgl' {
  // Pixi v8 exposes `type` as the numeric RendererType enum, not a string
  // (WEBGL=1, WEBGPU=2, CANVAS=4). Treat anything that is not explicitly
  // RendererType.WEBGPU as the WebGL2 path rather than guessing.
  return renderer.type === RendererType.WEBGPU ? 'webgpu' : 'webgl';
}

export function resizeDevice(device: Device, displayWidth: number, displayHeight: number): void {
  device.app.renderer.resize(displayWidth, displayHeight);
  device.viewport = fitViewport(displayWidth, displayHeight);
  applyViewport(device);
}

/**
 * Renders the virtual canvas into `frame`.
 *
 * Call this once per frame, before Pixi renders `app.stage` — the application's
 * own render runs at UPDATE_PRIORITY.LOW, so a ticker callback added at the
 * default priority is already in front of it. Skipping this leaves the previous
 * frame on screen rather than erroring, which is exactly the kind of silence
 * this wave kept producing, so: if the picture stops moving, look here first.
 */
export function presentDevice(device: Device): void {
  device.app.renderer.render({
    container: device.stage,
    target: device.frame,
    clearColor: BACKGROUND,
  });
}

function applyViewport(device: Device): void {
  const { scale, offsetX, offsetY } = device.viewport;
  // The scale lives on the blit sprite, never on the stage. On the stage it
  // would put the scene into the fixed-size framebuffer magnified and cropped,
  // and would put the post chain back at display resolution.
  device.present.scale.set(scale);
  device.present.position.set(offsetX, offsetY);
}
