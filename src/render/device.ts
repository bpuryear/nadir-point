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
 */

import { Application, Container, RendererType, type Renderer } from 'pixi.js';
import { fitViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, type Viewport } from './viewport.js';

export interface Device {
  app: Application;
  /** The virtual canvas. Draw into this, never into app.stage directly. */
  stage: Container;
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

  const stage = new Container();
  app.stage.addChild(stage);

  const backend = detectBackend(app.renderer);
  const viewport = fitViewport(host.clientWidth, host.clientHeight);

  const device: Device = { app, stage, viewport, renderer: backend };
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

function applyViewport(device: Device): void {
  const { scale, offsetX, offsetY } = device.viewport;
  device.stage.scale.set(scale);
  device.stage.position.set(offsetX, offsetY);
}
