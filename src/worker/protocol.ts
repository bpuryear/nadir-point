import type { BattleSpec } from '../sim/battle.ts';
import type { BattleReport } from '../sim/report.ts';

/** Playback speed a battle starts at: sim seconds per real second. */
export const DEFAULT_PLAYBACK = 1;

export type ToWorker =
  | { type: 'start'; spec: BattleSpec }
  | { type: 'speed'; value: number }
  | { type: 'pause'; value: boolean }
  | { type: 'inspect'; unit: number }
  | { type: 'skip' }
  | { type: 'return'; units: ArrayBuffer; modules: ArrayBuffer };

export interface WeaponDetail {
  code: string;
  mount: string;
  hp: number;
  /** Seconds until the next shot. */
  reload: number;
  target: number;
  inArc: boolean;
  hitChance: number;
}

export interface InspectDetail {
  unit: number;
  status: number;
  structure: number;
  structureMax: number;
  armour: number[];
  armourPlan: number[];
  speed: number;
  maxSpeed: number;
  target: number;
  /** Plain-language reason for the current target. */
  reason: string;
  weapons: WeaponDetail[];
  modules: { code: string; mount: string; hp: number }[];
  dcSupply: number;
  crewLost: number;
}

export interface SnapshotMsg {
  type: 'snapshot';
  battleId: number;
  units: ArrayBuffer;
  modules: ArrayBuffer;
  /** x, y, radius, kind for each event since the last snapshot. */
  events: number[];
  tick: number;
  onField: [number, number];
  ended: boolean;
  winner: number;
  stepMs: number;
  steps: number;
  inspect: InspectDetail | null;
}

export interface EndedMsg {
  type: 'ended';
  battleId: number;
  hash: string;
  report: BattleReport;
}

export type FromWorker = SnapshotMsg | EndedMsg;
