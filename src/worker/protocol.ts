export type ToWorker =
  | { type: 'start'; seed: number; perSide: number }
  | { type: 'speed'; value: number }
  | { type: 'pause'; value: boolean }
  | { type: 'return'; buf: ArrayBuffer };

export interface SnapshotMsg {
  type: 'snapshot';
  buf: ArrayBuffer;
  count: number;
  tick: number;
  seed: number;
  alive: [number, number];
  ended: boolean;
  winner: number;
  /** Mean sim cost per tick over this batch, ms. */
  stepMs: number;
  /** Ticks run since the previous snapshot. */
  steps: number;
  hash: string | null;
}

export type FromWorker = SnapshotMsg;
