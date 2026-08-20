/**
 * Input collection.
 *
 * The key mapping and the drain semantics are pure and tested; only
 * `attachInput` touches the DOM. Orders are drained rather than read, because a
 * target left in the state would re-issue every frame and the ship would never
 * settle on it.
 */

import type { TimeScale } from '../sim/loop.js';
import { vec2, type Vec2 } from '../sim/math/vec2.js';
import type { ZoomLevel } from '../render/zoom.js';

export interface InputState {
  moveTarget: Vec2 | null;
  zoomRequest: ZoomLevel | null;
  /** Accumulated wheel steps since the last drain. */
  zoomStep: number;
  timeScale: TimeScale | null;
}

export function makeInput(): InputState {
  return { moveTarget: null, zoomRequest: null, zoomStep: 0, timeScale: null };
}

/** Keys 1-4 jump straight to a level, so Wide needs one press, not three. */
export function keyToZoom(key: string): ZoomLevel | null {
  switch (key) {
    case '1': return 0;
    case '2': return 1;
    case '3': return 2;
    case '4': return 3;
    default: return null;
  }
}

export function keyToTimeScale(key: string): TimeScale | null {
  switch (key) {
    case ' ': return 0;
    case 'z': return 1;
    case 'x': return 2;
    case 'c': return 4;
    default: return null;
  }
}

export function drainInput(state: InputState): InputState {
  const snapshot: InputState = {
    moveTarget: state.moveTarget,
    zoomRequest: state.zoomRequest,
    zoomStep: state.zoomStep,
    timeScale: state.timeScale,
  };
  state.moveTarget = null;
  state.zoomRequest = null;
  state.zoomStep = 0;
  state.timeScale = null;
  return snapshot;
}

/** Wires DOM events into the state. Returns a detach function. */
export function attachInput(
  state: InputState,
  host: HTMLElement,
  toWorld: (screenX: number, screenY: number) => Vec2,
): () => void {
  const onContextMenu = (e: Event): void => e.preventDefault();

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 2) return; // right-click issues move orders
    const rect = host.getBoundingClientRect();
    const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    state.moveTarget = vec2(world.x, world.y);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const zoom = keyToZoom(e.key);
    if (zoom !== null) { state.zoomRequest = zoom; e.preventDefault(); return; }
    const scale = keyToTimeScale(e.key);
    if (scale !== null) { state.timeScale = scale; e.preventDefault(); }
  };

  const onWheel = (e: WheelEvent): void => {
    state.zoomStep += Math.sign(e.deltaY);
    e.preventDefault();
  };

  host.addEventListener('contextmenu', onContextMenu);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('wheel', onWheel, { passive: false });
  globalThis.addEventListener('keydown', onKeyDown);

  return () => {
    host.removeEventListener('contextmenu', onContextMenu);
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('wheel', onWheel);
    globalThis.removeEventListener('keydown', onKeyDown);
  };
}
