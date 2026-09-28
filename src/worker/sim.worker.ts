import { createBattle } from '../sim/battle.ts';
import { TICK_MS } from '../sim/constants.ts';
import { hashWorld } from '../sim/hash.ts';
import { buildReport } from '../sim/report.ts';
import { onFieldCount } from '../sim/run.ts';
import { step } from '../sim/step.ts';
import type { World } from '../sim/world.ts';
import { inspect } from './inspect.ts';
import { DEFAULT_PLAYBACK, type EndedMsg, type SnapshotMsg, type ToWorker } from './protocol.ts';
import { createPrev, M_STRIDE, savePrev, U_STRIDE, writeModules, writeUnits, type PrevState } from './snapshot.ts';

// Runs the sim at its fixed tick in real time, scaled by the playback speed,
// and posts a snapshot after each batch of ticks.

const LOOP_MS = 4;
const MAX_STEPS_PER_LOOP = 12;
const SKIP_STEPS_PER_LOOP = 600;

interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let world: World | null = null;
let prev: PrevState | null = null;
let battleId = 0;
let speed = DEFAULT_PLAYBACK;
let paused = false;
let skipping = false;
let simClock = 0;
let lastNow = 0;
let inspected = -1;
let events: number[] = [];
const unitPool: ArrayBuffer[] = [];
const modulePool: ArrayBuffer[] = [];

scope.onmessage = (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'start':
      battleId++;
      world = createBattle(msg.spec);
      prev = createPrev(world.count);
      savePrev(world, prev);
      simClock = 0;
      lastNow = performance.now();
      skipping = false;
      inspected = -1;
      events = [];
      unitPool.length = 0;
      modulePool.length = 0;
      post(0, 0);
      break;
    case 'speed':
      speed = msg.value;
      break;
    case 'pause':
      paused = msg.value;
      break;
    case 'inspect':
      inspected = msg.unit;
      if (paused) post(0, 0);
      break;
    case 'skip':
      skipping = true;
      break;
    case 'return':
      if (world && msg.units.byteLength === world.count * U_STRIDE * 4) unitPool.push(msg.units);
      if (world && msg.modules.byteLength === world.moduleCount * M_STRIDE * 4) modulePool.push(msg.modules);
      break;
  }
};

function loop(): void {
  const now = performance.now();
  const realDt = Math.min(now - lastNow, 250);
  lastNow = now;
  if (!world || !prev || world.ended) return;
  if (paused && !skipping) return;

  let due: number;
  if (skipping) {
    due = SKIP_STEPS_PER_LOOP;
  } else {
    simClock += realDt * speed;
    due = Math.min(Math.floor(simClock / TICK_MS) - world.tick, MAX_STEPS_PER_LOOP);
  }
  if (due <= 0) return;

  const t0 = performance.now();
  let ran = 0;
  for (; ran < due && !world.ended; ran++) {
    if (ran === due - 1) savePrev(world, prev);
    step(world);
    if (world.events.length) events.push(...world.events);
  }
  const stepMs = (performance.now() - t0) / Math.max(1, ran);
  // If the sim cannot keep up, drop the backlog rather than spiral.
  if (simClock > (world.tick + MAX_STEPS_PER_LOOP) * TICK_MS) simClock = world.tick * TICK_MS;
  if (skipping) simClock = world.tick * TICK_MS;
  post(ran, stepMs);
  if (world.ended) postEnded();
}

function post(steps: number, stepMs: number): void {
  if (!world || !prev) return;
  const units = unitPool.pop() ?? new ArrayBuffer(world.count * U_STRIDE * 4);
  const modules = modulePool.pop() ?? new ArrayBuffer(world.moduleCount * M_STRIDE * 4);
  writeUnits(world, prev, new Float32Array(units));
  writeModules(world, new Float32Array(modules));
  const msg: SnapshotMsg = {
    type: 'snapshot',
    battleId,
    units,
    modules,
    events,
    tick: world.tick,
    onField: [onFieldCount(world, 0), onFieldCount(world, 1)],
    ended: world.ended,
    winner: world.winner,
    stepMs,
    steps,
    inspect: inspected >= 0 ? inspect(world, inspected) : null,
  };
  events = [];
  scope.postMessage(msg, [units, modules]);
}

function postEnded(): void {
  if (!world) return;
  const msg: EndedMsg = { type: 'ended', battleId, hash: hashWorld(world), report: buildReport(world) };
  scope.postMessage(msg);
}

setInterval(loop, LOOP_MS);
