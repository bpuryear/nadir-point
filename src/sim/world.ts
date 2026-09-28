import { MODULES } from '../content/modules.ts';
import { HULL_CLASSES } from '../content/types.ts';
import type { CompiledDesign } from './design.ts';
import { createGrid, type Grid } from './grid.ts';
import { createRng, type Rng } from './rng.ts';

export const SIDE_A = 0;
export const SIDE_B = 1;
export const WINNER_NONE = -1;
export const WINNER_DRAW = 2;

// Unit status. Order matters: everything below CRIPPLED can act.
export const ACTIVE = 0;
export const WITHDRAWING = 1;
export const CRIPPLED = 2;
export const DESTROYED = 3;
export const ESCAPED = 4;

/** Reason codes for target choice: 0..2 = priority criterion index; these for the rest. */
export const REASON_NEAREST = -1;
export const REASON_NONE = -2;

export const EVENT_BREACH = 1;
export const EVENT_DESTROYED = 2;

/** Per side, per weapon module type, per target class. Index with telemetryIndex(). */
export interface Telemetry {
  shots: Float64Array;
  hits: Float64Array;
  expected: Float64Array;
  raw: Float64Array;
  through: Float64Array;
  /** Through damage taken, per victim side and facing: side * 4 + facing. */
  facingThrough: Float64Array;
  breachLosses: Int32Array;
  blastVictims: Int32Array;
  /** Per unit. */
  dealt: Float64Array;
  taken: Float64Array;
  activeTicks: Int32Array;
  idleTicks: Int32Array;
  fateTick: Int32Array;
}

export interface HitBuffer {
  n: number;
  target: Int32Array;
  shooter: Int32Array;
  weapon: Int32Array;
  damage: Float64Array;
  pen: Float64Array;
  fromX: Float64Array;
  fromY: Float64Array;
}

export interface World {
  tick: number;
  maxTicks: number;
  width: number;
  height: number;
  count: number;
  moduleCount: number;
  designs: CompiledDesign[];

  side: Uint8Array;
  design: Uint16Array;
  status: Uint8Array;
  x: Float64Array;
  y: Float64Array;
  /** Heading as a unit vector. The sim never needs an angle. */
  hx: Float64Array;
  hy: Float64Array;
  speed: Float64Array;
  structure: Float64Array;
  /** 4 per unit: bow, port, starboard, stern. */
  armour: Float64Array;
  /** Current capability; drops when drives are lost. */
  maxSpeed: Float64Array;
  accel: Float64Array;
  turnCos: Float64Array;
  turnSin: Float64Array;
  target: Int32Array;
  /** Targets as they were at the start of the tick; decisions read this. */
  targetPrev: Int32Array;
  targetReason: Int8Array;
  /** Strike ships: 1 while breaking off after an attack run, 0 while running in. */
  run: Uint8Array;
  retarget: Int32Array;
  lastHitTick: Int32Array;
  dcSupply: Float64Array;
  crewLost: Float64Array;
  /** First module index of each unit. */
  modStart: Int32Array;

  mUnit: Int32Array;
  mSlot: Uint16Array;
  mHp: Float64Array;
  mCooldown: Int32Array;
  mTarget: Int32Array;
  mLastShot: Int32Array;
  mHit: Uint8Array;

  /** Scratch for the two-phase tick. */
  present: Uint8Array;
  nextHx: Float64Array;
  nextHy: Float64Array;
  nextSpeed: Float64Array;
  corrX: Float64Array;
  corrY: Float64Array;
  hits: HitBuffer;

  deployedValue: Float64Array;
  activeValue: Float64Array;
  broken: Uint8Array;
  ended: boolean;
  winner: number;

  /** Events raised this tick, for the renderer: x, y, radius, kind. */
  events: number[];

  rng: Rng;
  grid: Grid;
  stats: Telemetry;
}

export const NUM_WEAPON_TYPES = MODULES.length;
export const NUM_CLASSES = HULL_CLASSES.length;

export function telemetryIndex(side: number, moduleDef: number, cls: number): number {
  return (side * NUM_WEAPON_TYPES + moduleDef) * NUM_CLASSES + cls;
}

function createTelemetry(units: number): Telemetry {
  const n = 2 * NUM_WEAPON_TYPES * NUM_CLASSES;
  return {
    shots: new Float64Array(n),
    hits: new Float64Array(n),
    expected: new Float64Array(n),
    raw: new Float64Array(n),
    through: new Float64Array(n),
    facingThrough: new Float64Array(8),
    breachLosses: new Int32Array(2),
    blastVictims: new Int32Array(2),
    dealt: new Float64Array(units),
    taken: new Float64Array(units),
    activeTicks: new Int32Array(units),
    idleTicks: new Int32Array(units),
    fateTick: new Int32Array(units).fill(-1),
  };
}

export function createWorld(
  designs: CompiledDesign[],
  units: number,
  modules: number,
  hitCapacity: number,
  width: number,
  height: number,
  seed: number,
  maxTicks: number,
): World {
  return {
    tick: 0,
    maxTicks,
    width,
    height,
    count: 0,
    moduleCount: 0,
    designs,
    side: new Uint8Array(units),
    design: new Uint16Array(units),
    status: new Uint8Array(units),
    x: new Float64Array(units),
    y: new Float64Array(units),
    hx: new Float64Array(units),
    hy: new Float64Array(units),
    speed: new Float64Array(units),
    structure: new Float64Array(units),
    armour: new Float64Array(units * 4),
    maxSpeed: new Float64Array(units),
    accel: new Float64Array(units),
    turnCos: new Float64Array(units),
    turnSin: new Float64Array(units),
    target: new Int32Array(units).fill(-1),
    targetPrev: new Int32Array(units).fill(-1),
    targetReason: new Int8Array(units).fill(REASON_NONE),
    run: new Uint8Array(units),
    retarget: new Int32Array(units),
    lastHitTick: new Int32Array(units).fill(-1000),
    dcSupply: new Float64Array(units),
    crewLost: new Float64Array(units),
    modStart: new Int32Array(units + 1),
    mUnit: new Int32Array(modules),
    mSlot: new Uint16Array(modules),
    mHp: new Float64Array(modules),
    mCooldown: new Int32Array(modules),
    mTarget: new Int32Array(modules).fill(-1),
    mLastShot: new Int32Array(modules).fill(-1000),
    mHit: new Uint8Array(modules),
    present: new Uint8Array(units),
    nextHx: new Float64Array(units),
    nextHy: new Float64Array(units),
    nextSpeed: new Float64Array(units),
    corrX: new Float64Array(units),
    corrY: new Float64Array(units),
    hits: {
      n: 0,
      target: new Int32Array(hitCapacity),
      shooter: new Int32Array(hitCapacity),
      weapon: new Int32Array(hitCapacity),
      damage: new Float64Array(hitCapacity),
      pen: new Float64Array(hitCapacity),
      fromX: new Float64Array(hitCapacity),
      fromY: new Float64Array(hitCapacity),
    },
    deployedValue: new Float64Array(2),
    activeValue: new Float64Array(2),
    broken: new Uint8Array(2),
    ended: false,
    winner: WINNER_NONE,
    events: [],
    rng: createRng(seed),
    grid: createGrid(width, height, 250, units),
    stats: createTelemetry(units),
  };
}

export function isOnField(status: number): boolean {
  return status < CRIPPLED;
}

export function isPresent(status: number): boolean {
  return status < DESTROYED;
}
