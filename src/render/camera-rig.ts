import { PerspectiveCamera } from 'three/webgpu';

// Tilt-shift camera: low field of view, pitched down at the battle plane.
// Sim (x, y) maps to world (x, 0, y). The rig orbits a focus point on the plane.

const PITCH_DEG = 58;
const FOV_DEG = 20;
const MIN_DIST = 1200;
const MAX_DIST = 26000;

export class CameraRig {
  readonly camera: PerspectiveCamera;
  focusX: number;
  focusZ: number;
  dist: number;
  private boundsW: number;
  private boundsH: number;
  /** Called when the player pans or zooms by hand. */
  onUserInput: (() => void) | null = null;

  constructor(aspect: number, mapW: number, mapH: number) {
    this.camera = new PerspectiveCamera(FOV_DEG, aspect, 50, 80000);
    this.boundsW = mapW;
    this.boundsH = mapH;
    this.focusX = mapW / 2;
    this.focusZ = mapH / 2;
    this.dist = 15500;
    this.apply();
  }

  /** Frame a new map: centre on it and pull back far enough to see it whole. */
  setBounds(mapW: number, mapH: number): void {
    this.boundsW = mapW;
    this.boundsH = mapH;
    this.focusX = mapW / 2;
    this.focusZ = mapH / 2;
    this.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, Math.max(mapW, mapH * 1.6) * 1.55));
    this.apply();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Pan by a screen-space delta in CSS pixels. */
  panPixels(dx: number, dy: number, viewportHeight: number): void {
    const worldPerPixel = (2 * this.dist * Math.tan((FOV_DEG * Math.PI) / 360)) / viewportHeight;
    const pitch = (PITCH_DEG * Math.PI) / 180;
    this.focusX -= dx * worldPerPixel;
    this.focusZ -= (dy * worldPerPixel) / Math.sin(pitch);
    this.clampFocus();
    this.apply();
  }

  /** Zoom by a factor; below 1 moves closer. */
  zoom(factor: number): void {
    this.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, this.dist * factor));
    this.apply();
  }

  /** Ease toward a framing: used by the follow camera. dt in seconds. */
  track(x: number, z: number, dist: number, dt: number): void {
    const k = 1 - Math.exp(-dt * 1.6);
    this.focusX += (x - this.focusX) * k;
    this.focusZ += (z - this.focusZ) * k;
    const target = Math.min(MAX_DIST, Math.max(MIN_DIST, dist));
    this.dist += (target - this.dist) * k;
    this.clampFocus();
    this.apply();
  }

  /** Distance that fits a w × h box on the battle plane into the view. */
  fitDistance(w: number, h: number): number {
    const half = Math.tan((FOV_DEG * Math.PI) / 360);
    const pitch = (PITCH_DEG * Math.PI) / 180;
    const byWidth = w / (2 * half * this.camera.aspect);
    const byHeight = (h * Math.sin(pitch)) / (2 * half);
    return Math.max(byWidth, byHeight);
  }

  private clampFocus(): void {
    const pad = 3000;
    this.focusX = Math.min(this.boundsW + pad, Math.max(-pad, this.focusX));
    this.focusZ = Math.min(this.boundsH + pad, Math.max(-pad, this.focusZ));
  }

  private apply(): void {
    const pitch = (PITCH_DEG * Math.PI) / 180;
    this.camera.position.set(this.focusX, this.dist * Math.sin(pitch), this.focusZ + this.dist * Math.cos(pitch));
    this.camera.lookAt(this.focusX, 0, this.focusZ);
    this.camera.updateMatrixWorld();
  }
}

/**
 * Mouse, trackpad and keyboard.
 * - Drag: pan. Wheel (mouse): zoom. Two-finger scroll (trackpad): pan.
 * - Pinch: zoom (Chrome and Firefox send ctrl+wheel; Safari sends gesture events).
 * - WASD / arrows: pan. Q / E or - / =: zoom.
 */
export function attachControls(el: HTMLElement, rig: CameraRig): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const keys = new Set<string>();

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 0) rig.onUserInput?.();
    rig.panPixels(e.clientX - lastX, e.clientY - lastY, el.clientHeight);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent): void => {
    dragging = false;
    el.releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    rig.onUserInput?.();
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
    const dx = e.deltaX * scale;
    const dy = e.deltaY * scale;
    if (e.ctrlKey) {
      rig.zoom(Math.exp(dy * 0.01));
    } else if (looksLikeTrackpad(e)) {
      rig.panPixels(-dx, -dy, el.clientHeight);
    } else {
      rig.zoom(Math.exp(dy * 0.0015));
    }
  };

  // Safari pinch.
  let gestureScale = 1;
  const onGestureStart = (e: Event): void => {
    e.preventDefault();
    gestureScale = 1;
  };
  const onGestureChange = (e: Event): void => {
    e.preventDefault();
    rig.onUserInput?.();
    const scale = (e as unknown as { scale: number }).scale;
    rig.zoom(gestureScale / scale);
    gestureScale = scale;
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    keys.add(e.key.toLowerCase());
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.key.toLowerCase());
  };
  const onBlur = (): void => keys.clear();

  let raf = 0;
  let last = performance.now();
  const tick = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const speed = 900 * dt;
    let px = 0;
    let py = 0;
    if (keys.has('a') || keys.has('arrowleft')) px += speed;
    if (keys.has('d') || keys.has('arrowright')) px -= speed;
    if (keys.has('w') || keys.has('arrowup')) py += speed;
    if (keys.has('s') || keys.has('arrowdown')) py -= speed;
    const zoomOut = keys.has('q') || keys.has('-');
    const zoomIn = keys.has('e') || keys.has('=');
    if (px || py || zoomOut || zoomIn) rig.onUserInput?.();
    if (px || py) rig.panPixels(px, py, el.clientHeight);
    if (zoomOut) rig.zoom(1 + 1.2 * dt);
    if (zoomIn) rig.zoom(1 / (1 + 1.2 * dt));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('gesturestart', onGestureStart);
  el.addEventListener('gesturechange', onGestureChange);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    cancelAnimationFrame(raf);
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('gesturestart', onGestureStart);
    el.removeEventListener('gesturechange', onGestureChange);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

// Mouse wheels report whole notches (deltaMode 1, or deltaY near a multiple of
// 100 with no deltaX). Trackpads report small, fractional, two-axis deltas.
function looksLikeTrackpad(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return false;
  if (e.deltaX !== 0) return true;
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40;
}
