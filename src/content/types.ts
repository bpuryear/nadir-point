// Content types: plain data. The sim reads these; nothing here computes.

export type Zone = 'bow' | 'port' | 'starboard' | 'stern' | 'dorsal' | 'core';
export const ZONES: readonly Zone[] = ['bow', 'port', 'starboard', 'stern', 'dorsal', 'core'];

/** Armour facings, in array order. */
export const FACINGS = ['bow', 'port', 'starboard', 'stern'] as const;
export type Facing = 0 | 1 | 2 | 3;
export type Armour = [number, number, number, number];

export type Size = 1 | 2 | 3;
export const SIZE_NAME: Record<Size, string> = { 1: 'S', 2: 'M', 3: 'L' };

export type MountType = 'hardpoint' | 'internal' | 'engine';
export type HullClass = 'frigate' | 'destroyer' | 'cruiser';
export const HULL_CLASSES: readonly HullClass[] = ['frigate', 'destroyer', 'cruiser'];

export interface MountDef {
  id: string;
  zone: Zone;
  size: Size;
  type: MountType;
  /** Position in the ship frame: +x forward, +y port. Metres. */
  x: number;
  y: number;
  /** Direction the mount faces, degrees; positive toward port. */
  facing: number;
  /** Fire-arc half-width, degrees. 180 means all round. */
  arc: number;
}

export interface HullDef {
  id: string;
  name: string;
  cls: HullClass;
  faction: 'compact';
  length: number;
  beam: number;
  height: number;
  /** Collision and target-size radius, metres. */
  radius: number;
  baseMass: number;
  structure: number;
  /** Turn rate at the reference acceleration, degrees per second. */
  turnBase: number;
  refAccel: number;
  cost: number;
  crew: number;
  armourMax: Armour;
  /** Tonnes per plate point, per facing. */
  armourMass: Armour;
  mounts: MountDef[];
}

export type ModuleKind = 'weapon' | 'reactor' | 'drive' | 'bridge' | 'firecontrol' | 'damagecontrol';

export interface WeaponStats {
  family: 'kinetic';
  damage: number;
  pen: number;
  /** Seconds between shots. */
  reload: number;
  range: number;
  /** Degrees per second. */
  tracking: number;
  /** Radians. */
  spread: number;
}

export interface ModuleDef {
  id: string;
  name: string;
  /** Short code for dense tables, e.g. MD-L. */
  code: string;
  kind: ModuleKind;
  size: Size;
  mount: MountType;
  mass: number;
  /** Power drawn, MW. */
  draw: number;
  /** Power produced, MW (reactors). */
  output: number;
  thrust: number;
  cost: number;
  hp: number;
  crew: number;
  weapon?: WeaponStats;
  blurb: string;
}

export type Criterion = 'cruiser' | 'destroyer' | 'frigate' | 'crippled' | 'armourBroken' | 'threat';
export const CRITERIA: readonly Criterion[] = ['cruiser', 'destroyer', 'frigate', 'crippled', 'armourBroken', 'threat'];

export interface Doctrine {
  role: 'line' | 'strike';
  engage: 'short' | 'optimal' | 'long';
  priority: Criterion[];
  /** Withdraw below this structure fraction. 0 means never. */
  withdrawAt: number;
}

export interface Design {
  id: string;
  name: string;
  hull: string;
  /** Mount id to module id. Empty mounts are allowed. */
  modules: Record<string, string>;
  armour: Armour;
  doctrine: Doctrine;
}
