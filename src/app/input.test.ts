import { describe, expect, it } from 'vitest';
import { vec2 } from '../sim/math/vec2.js';
import { drainInput, keyToTimeScale, keyToZoom, makeInput } from './input.js';

describe('keyToZoom', () => {
  it('binds 1 through 4 to the four levels', () => {
    // Direct binding matters: the spec wants Wide reachable without passing
    // through the intermediate levels.
    expect(keyToZoom('1')).toBe(0);
    expect(keyToZoom('2')).toBe(1);
    expect(keyToZoom('3')).toBe(2);
    expect(keyToZoom('4')).toBe(3);
  });

  it('ignores anything else', () => {
    for (const k of ['0', '5', 'a', 'Escape', '']) expect(keyToZoom(k)).toBeNull();
  });
});

describe('keyToTimeScale', () => {
  it('binds space to pause and the bracket keys to speeds', () => {
    expect(keyToTimeScale(' ')).toBe(0);
    expect(keyToTimeScale('z')).toBe(1);
    expect(keyToTimeScale('x')).toBe(2);
    expect(keyToTimeScale('c')).toBe(4);
  });

  it('ignores anything else', () => {
    expect(keyToTimeScale('q')).toBeNull();
  });
});

describe('drainInput', () => {
  it('returns what was pending and clears it', () => {
    // Orders must fire once. A target left in the state would re-issue every
    // frame and the ship would never settle.
    const state = makeInput();
    state.moveTarget = vec2(10, 20);
    state.zoomRequest = 3;
    state.zoomStep = -1;
    state.timeScale = 0;

    const drained = drainInput(state);
    expect(drained.moveTarget).toEqual({ x: 10, y: 20 });
    expect(drained.zoomRequest).toBe(3);
    expect(drained.zoomStep).toBe(-1);
    expect(drained.timeScale).toBe(0);

    expect(state.moveTarget).toBeNull();
    expect(state.zoomRequest).toBeNull();
    expect(state.zoomStep).toBe(0);
    expect(state.timeScale).toBeNull();
  });

  it('is safe to drain when nothing is pending', () => {
    const drained = drainInput(makeInput());
    expect(drained.moveTarget).toBeNull();
    expect(drained.zoomStep).toBe(0);
  });
});
