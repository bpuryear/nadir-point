import { HULL_BY_ID } from '../content/hulls.ts';
import { MODULE_BY_ID, MODULE_INDEX } from '../content/modules.ts';
import { HULL_CLASSES, ZONES, type Armour, type Design, type HullDef, type ModuleDef, type MountDef } from '../content/types.ts';
import { DT } from './constants.ts';
import { cos, degToRad, sin } from './dmath.ts';

// Turns a Design into the numbers the sim and the designer need.
// Formulas: docs/design/m1-rules.md §3 and §6.

const SPEED_TIME = 12;
const SPEED_CAP = 220;
const FIRE_CONTROL_MUL = 1.25;
const ENGAGE_FRACTION = { short: 0.55, optimal: 0.8 } as const;
const LONG_FRACTION = 0.95;
/** Bearings checked for the firing bearing, in preference order on ties. */
const BEARING_CANDIDATES = [0, 30, -30, 60, -60, 90, -90, 120, -120, 180];
export const DPS_BEARINGS = 12;
const STRAFE_KEEP = 0.9;

export interface CompiledModule {
  def: ModuleDef;
  defIndex: number;
  mount: MountDef;
  zone: number;
  x: number;
  y: number;
  /** Mount facing as a unit vector in the ship frame. */
  fx: number;
  fy: number;
  /** A target is in arc when dot(direction, facing) >= arcCos. */
  arcCos: number;
}

export interface CompiledDesign {
  design: Design;
  hull: HullDef;
  cls: number;
  modules: CompiledModule[];
  /** Indexes into `modules`. */
  weapons: number[];
  mass: number;
  thrust: number;
  accel: number;
  maxSpeed: number;
  turnRate: number;
  powerOut: number;
  powerDraw: number;
  cost: number;
  crew: number;
  armourMassTotal: number;
  trackingMul: number;
  refRange: number;
  maxRange: number;
  engageRange: number;
  /** Preferred bearing of the target, degrees and unit vector in the ship frame. */
  bearingDeg: number;
  bearingX: number;
  bearingY: number;
  /** Damage per second that bears at 0°, 30°, ... 330°. */
  dpsByBearing: number[];
  totalDps: number;
}

export function validateDesign(d: Design): string[] {
  const errors: string[] = [];
  const hull = HULL_BY_ID.get(d.hull);
  if (!hull) return [`Unknown hull "${d.hull}".`];

  let bridges = 0;
  let drives = 0;
  let out = 0;
  let draw = 0;
  for (const [mountId, moduleId] of Object.entries(d.modules)) {
    const mount = hull.mounts.find((m) => m.id === mountId);
    const mod = MODULE_BY_ID.get(moduleId);
    if (!mount) {
      errors.push(`${hull.name} has no mount ${mountId}.`);
      continue;
    }
    if (!mod) {
      errors.push(`Unknown module "${moduleId}" on ${mountId}.`);
      continue;
    }
    if (mod.mount !== mount.type) errors.push(`${mod.name} needs a ${mod.mount} mount; ${mountId} is ${mount.type}.`);
    if (mod.size > mount.size) errors.push(`${mod.name} is too large for ${mountId}.`);
    if (mod.kind === 'bridge') bridges++;
    if (mod.kind === 'drive') drives++;
    out += mod.output;
    draw += mod.draw;
  }
  if (bridges === 0) errors.push('No bridge. Every ship needs one.');
  if (drives === 0) errors.push('No drive. The ship cannot move.');
  if (draw > out) errors.push(`Power draw ${draw} MW exceeds reactor output ${out} MW.`);
  for (let f = 0; f < 4; f++) {
    const a = d.armour[f];
    if (!(a >= 0 && a <= hull.armourMax[f])) errors.push(`Armour on facing ${f} must be 0–${hull.armourMax[f]}.`);
  }
  if (d.doctrine.priority.length > 3) errors.push('At most 3 priority criteria.');
  if (!(d.doctrine.withdrawAt >= 0 && d.doctrine.withdrawAt <= 0.9)) errors.push('Withdraw threshold must be 0–0.9.');
  return errors;
}

export function compileDesign(d: Design): CompiledDesign {
  const errors = validateDesign(d);
  if (errors.length) throw new Error(`Invalid design "${d.name}": ${errors.join(' ')}`);
  const hull = HULL_BY_ID.get(d.hull)!;

  const modules: CompiledModule[] = [];
  const weapons: number[] = [];
  let mass = hull.baseMass;
  let thrust = 0;
  let out = 0;
  let draw = 0;
  let cost = hull.cost;
  let crew = hull.crew;
  let fireControl = false;

  // Mount order, not object key order, so compiled designs never depend on how a design was edited.
  for (const mount of hull.mounts) {
    const id = d.modules[mount.id];
    if (!id) continue;
    const def = MODULE_BY_ID.get(id)!;
    const facing = degToRad(mount.facing);
    const arcCos = mount.arc >= 180 ? -2 : cos(degToRad(mount.arc));
    if (def.weapon) weapons.push(modules.length);
    modules.push({
      def,
      defIndex: MODULE_INDEX.get(id)!,
      mount,
      zone: ZONES.indexOf(mount.zone),
      x: mount.x,
      y: mount.y,
      fx: cos(facing),
      fy: sin(facing),
      arcCos,
    });
    mass += def.mass;
    thrust += def.thrust;
    out += def.output;
    draw += def.draw;
    cost += def.cost;
    crew += def.crew;
    if (def.kind === 'firecontrol') fireControl = true;
  }

  let armourMassTotal = 0;
  for (let f = 0; f < 4; f++) armourMassTotal += d.armour[f] * hull.armourMass[f];
  mass += armourMassTotal;
  cost += Math.round(armourMassTotal * 0.5);

  const accel = thrust / mass;
  const maxSpeed = Math.min(SPEED_CAP, accel * SPEED_TIME);
  const turnRate = hull.turnBase * Math.min(1.6, Math.max(0.4, accel / hull.refAccel));

  const dpsByBearing = new Array<number>(DPS_BEARINGS).fill(0);
  let dpsSum = 0;
  let rangeWeighted = 0;
  let maxRange = 0;
  for (const wi of weapons) {
    const m = modules[wi];
    const w = m.def.weapon!;
    const dps = w.damage / w.reload;
    dpsSum += dps;
    rangeWeighted += dps * w.range;
    maxRange = Math.max(maxRange, w.range);
    for (let k = 0; k < DPS_BEARINGS; k++) {
      const b = degToRad(k * 30);
      if (cos(b) * m.fx + sin(b) * m.fy >= m.arcCos) dpsByBearing[k] += dps;
    }
  }
  const refRange = dpsSum > 0 ? rangeWeighted / dpsSum : 1000;
  if (maxRange === 0) maxRange = 1000;
  const engage = d.doctrine.engage;
  const engageRange = engage === 'long' ? maxRange * LONG_FRACTION : refRange * ENGAGE_FRACTION[engage];

  const bearingDeg = d.doctrine.role === 'strike' ? strafeBearing(dpsByBearing) : bestBearing(dpsByBearing);
  const br = degToRad(bearingDeg);

  return {
    design: d,
    hull,
    cls: HULL_CLASSES.indexOf(hull.cls),
    modules,
    weapons,
    mass,
    thrust,
    accel,
    maxSpeed,
    turnRate,
    powerOut: out,
    powerDraw: draw,
    cost,
    crew,
    armourMassTotal,
    trackingMul: fireControl ? FIRE_CONTROL_MUL : 1,
    refRange,
    maxRange,
    engageRange,
    bearingDeg,
    bearingX: cos(br),
    bearingY: sin(br),
    dpsByBearing,
    totalDps: dpsSum,
  };
}

function dpsAt(dps: number[], bearingDeg: number): number {
  return dps[(((bearingDeg / 30) % DPS_BEARINGS) + DPS_BEARINGS) % DPS_BEARINGS];
}

/** Line ships: the bearing with the most damage per second; ties go to the smallest angle. */
function bestBearing(dps: number[]): number {
  let bearing = 0;
  let best = -1;
  for (const b of BEARING_CANDIDATES) {
    if (dpsAt(dps, b) > best) {
      best = dpsAt(dps, b);
      bearing = b;
    }
  }
  return bearing;
}

/**
 * Strike ships: the widest bearing that keeps at least 90% of the best damage, so
 * they strafe across the target instead of flying straight at it.
 */
function strafeBearing(dps: number[]): number {
  const best = dpsAt(dps, bestBearing(dps));
  let bearing = 0;
  for (const b of BEARING_CANDIDATES) {
    if (Math.abs(b) > Math.abs(bearing) && dpsAt(dps, b) >= best * STRAFE_KEEP) bearing = b;
  }
  return bearing;
}

/** Per-tick rotation for a given turn rate, deterministic. */
export function turnStep(turnRateDeg: number): { c: number; s: number } {
  const step = degToRad(turnRateDeg) * DT;
  return { c: cos(step), s: sin(step) };
}

export function armourOf(d: Design): Armour {
  return [d.armour[0], d.armour[1], d.armour[2], d.armour[3]];
}
