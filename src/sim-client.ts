import { TICK_MS } from './sim/constants.ts';
import type { FromWorker, SnapshotMsg, ToWorker } from './worker/protocol.ts';

export interface Snapshot {
  meta: SnapshotMsg;
  data: Float32Array;
  receivedAt: number;
}

/** Main-thread handle on the sim worker. Holds the latest snapshot. */
export class SimClient {
  private worker: Worker;
  latest: Snapshot | null = null;
  speed = 2;
  paused = false;
  onSnapshot: ((s: Snapshot) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
  }

  start(seed: number, perSide: number): void {
    this.latest = null;
    this.send({ type: 'start', seed, perSide });
    this.send({ type: 'speed', value: this.speed });
    this.send({ type: 'pause', value: this.paused });
  }

  setSpeed(value: number): void {
    this.speed = value;
    this.send({ type: 'speed', value });
  }

  setPaused(value: boolean): void {
    this.paused = value;
    this.send({ type: 'pause', value });
  }

  /** 0..1 progress from the previous tick to the latest one, for interpolation. */
  alpha(now: number): number {
    if (!this.latest || this.paused || this.latest.meta.ended) return 1;
    const a = (now - this.latest.receivedAt) / (TICK_MS / this.speed);
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  private receive(msg: FromWorker): void {
    const old = this.latest;
    this.latest = { meta: msg, data: new Float32Array(msg.buf), receivedAt: performance.now() };
    if (old && old.meta.count === msg.count) this.send({ type: 'return', buf: old.meta.buf }, [old.meta.buf]);
    this.onSnapshot?.(this.latest);
  }

  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }
}
