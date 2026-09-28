import type { BattleSpec } from './sim/battle.ts';
import { TICK_MS } from './sim/constants.ts';
import type { EndedMsg, FromWorker, SnapshotMsg, ToWorker } from './worker/protocol.ts';

export interface Snapshot {
  meta: SnapshotMsg;
  units: Float32Array;
  modules: Float32Array;
  receivedAt: number;
}

/** Main-thread handle on the sim worker. Holds the latest snapshot of the current battle. */
export class SimClient {
  private worker: Worker;
  private battleId = 0;
  latest: Snapshot | null = null;
  speed = 2;
  paused = false;
  onSnapshot: ((s: Snapshot) => void) | null = null;
  onEnded: ((m: EndedMsg) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
  }

  start(spec: BattleSpec): void {
    this.battleId++;
    this.latest = null;
    this.send({ type: 'start', spec });
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

  inspect(unit: number): void {
    this.send({ type: 'inspect', unit });
  }

  skip(): void {
    this.send({ type: 'skip' });
  }

  /** 0..1 progress from the previous tick to the latest one, for interpolation. */
  alpha(now: number): number {
    if (!this.latest || this.paused || this.latest.meta.ended) return 1;
    const a = (now - this.latest.receivedAt) / (TICK_MS / this.speed);
    return a < 0 ? 0 : a > 1 ? 1 : a;
  }

  private receive(msg: FromWorker): void {
    // Messages from a battle that has been replaced are dropped.
    if (msg.battleId !== this.battleId) return;
    if (msg.type === 'ended') {
      this.onEnded?.(msg);
      return;
    }
    const old = this.latest;
    this.latest = { meta: msg, units: new Float32Array(msg.units), modules: new Float32Array(msg.modules), receivedAt: performance.now() };
    if (old) this.send({ type: 'return', units: old.meta.units, modules: old.meta.modules }, [old.meta.units, old.meta.modules]);
    this.onSnapshot?.(this.latest);
  }

  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }
}
