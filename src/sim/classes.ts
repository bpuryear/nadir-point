import { cos, degToRad, sin } from './dmath.ts';
import { DT } from './constants.ts';

// M0 placeholder hull classes. M1 replaces these with designs built from modules.
export interface HullClass {
  name: string;
  /** Collision and render radius, metres. */
  radius: number;
  length: number;
  beam: number;
  maxSpeed: number;
  accel: number;
  /** Turn rate, degrees per second. */
  turnRate: number;
  hp: number;
  range: number;
  damage: number;
  reloadTicks: number;
  hitChance: number;
  /** Per-tick rotation, precomputed with deterministic trig. */
  turnCos: number;
  turnSin: number;
}

function hull(spec: Omit<HullClass, 'turnCos' | 'turnSin'>): HullClass {
  const step = degToRad(spec.turnRate) * DT;
  return { ...spec, turnCos: cos(step), turnSin: sin(step) };
}

export const CLASSES: readonly HullClass[] = [
  hull({ name: 'frigate', radius: 22, length: 60, beam: 18, maxSpeed: 160, accel: 60, turnRate: 70, hp: 120, range: 900, damage: 6, reloadTicks: 18, hitChance: 0.55 }),
  hull({ name: 'destroyer', radius: 34, length: 95, beam: 26, maxSpeed: 115, accel: 35, turnRate: 40, hp: 320, range: 1300, damage: 14, reloadTicks: 30, hitChance: 0.6 }),
  hull({ name: 'cruiser', radius: 55, length: 160, beam: 42, maxSpeed: 75, accel: 18, turnRate: 20, hp: 900, range: 1800, damage: 38, reloadTicks: 54, hitChance: 0.65 }),
];

export const CLASS_FRIGATE = 0;
export const CLASS_DESTROYER = 1;
export const CLASS_CRUISER = 2;
