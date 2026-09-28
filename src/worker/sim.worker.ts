import { TICK_MS } from '../sim/constants.ts';
import { hashWorld } from '../sim/hash.ts';
import { createTestBattle } from '../sim/scenario.ts';
import { step } from '../sim/step.ts';
import type { World } from '../sim/world.ts';
import type { SnapshotMsg, ToWorker } from './protocol.ts';
import { createPrev, savePrev, STRIDE, writeSnapshot, type PrevState } from './snapshot.ts';

// Runs the sim at its fixed tick in real time, scaled by the playback speed,
// and posts a snapshot after each batch of ticks.

const LOOP_MS = 4;
const MAX_STEPS_PER_LOOP = 12;

interface WorkerScope {
  postMessage(msg: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let world: World | null = null;
let prev: PrevState | null = null;
let seed = 0;
let speed = 2;
let paused = false;
let simClock = 0;
let lastNow = 0;
let endPosted = false;
const pool: ArrayBuffer[] = [];

scope.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'start':
      seed = msg.seed;
      world = createTestBattle(msg.seed, msg.perSide);
      prev = createPrev(world.count);
      savePrev(world, prev);
      simClock = 0;
      lastNow = performance.now();
      endPosted = false;
      pool.length = 0;
      post(0, 0);
      break;
    case 'speed':
      speed = msg.value;
      break;
    case 'pause':
      paused = msg.value;
      break;
    case 'return':
      if (world && msg.buf.byteLength === world.count * STRIDE * 4) pool.push(msg.buf);
      break;
  }
};

function loop(): void {
  const now = performance.now();
  const realDt = Math.min(now - lastNow, 250);
  lastNow = now;
  if (!world || !prev || paused || world.ended) return;

  simClock += realDt * speed;
  const due = Math.min(Math.floor(simClock / TICK_MS) - world.tick, MAX_STEPS_PER_LOOP);
  if (due <= 0) return;

  const t0 = performance.now();
  for (let k = 0; k < due && !world.ended; k++) {
    if (k === due - 1) savePrev(world, prev);
    step(world);
  }
  const stepMs = (performance.now() - t0) / due;
  // If the sim cannot keep up, drop the backlog rather than spiral.
  if (simClock > (world.tick + MAX_STEPS_PER_LOOP) * TICK_MS) simClock = world.tick * TICK_MS;
  post(due, stepMs);
}

function post(steps: number, stepMs: number): void {
  if (!world || !prev) return;
  const bytes = world.count * STRIDE * 4;
  const buf = pool.pop() ?? new ArrayBuffer(bytes);
  writeSnapshot(world, prev, new Float32Array(buf));
  const ended = world.ended;
  const msg: SnapshotMsg = {
    type: 'snapshot',
    buf,
    count: world.count,
    tick: world.tick,
    seed,
    alive: [world.aliveBySide[0], world.aliveBySide[1]],
    ended,
    winner: world.winner,
    stepMs,
    steps,
    hash: ended && !endPosted ? hashWorld(world) : null,
  };
  if (ended) endPosted = true;
  scope.postMessage(msg, [buf]);
}

setInterval(loop, LOOP_MS);
