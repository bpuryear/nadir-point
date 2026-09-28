import type { Design } from '../content/types.ts';
import { TICK_HZ } from './constants.ts';
import { compileDesign, turnStep, type CompiledDesign } from './design.ts';
import { ACTIVE, createWorld, type World } from './world.ts';

export interface ShipPlacement {
  /** Design id within the fleet's design list. */
  design: string;
  x: number;
  y: number;
}

export interface FleetSpec {
  designs: Design[];
  ships: ShipPlacement[];
}

export interface BattleSpec {
  seed: number;
  width: number;
  height: number;
  maxSeconds: number;
  fleets: [FleetSpec, FleetSpec];
}

export const DC_SUPPLY = 400;
const SPEED_TIME = 12;
const SPEED_CAP = 220;

export function createBattle(spec: BattleSpec): World {
  const designs: CompiledDesign[] = [];
  const index = new Map<string, number>();
  let units = 0;
  let modules = 0;
  let weapons = 0;

  spec.fleets.forEach((fleet, side) => {
    for (const d of fleet.designs) {
      const key = `${side}:${d.id}`;
      if (index.has(key)) continue;
      index.set(key, designs.length);
      designs.push(compileDesign(d));
    }
    for (const s of fleet.ships) {
      const di = index.get(`${side}:${s.design}`);
      if (di === undefined) throw new Error(`Fleet ${side} places unknown design "${s.design}".`);
      units++;
      modules += designs[di].modules.length;
      weapons += designs[di].weapons.length;
    }
  });

  const w = createWorld(designs, units, modules, Math.max(1, weapons), spec.width, spec.height, spec.seed, spec.maxSeconds * TICK_HZ);
  spec.fleets.forEach((fleet, side) => {
    for (const s of fleet.ships) addUnit(w, side, index.get(`${side}:${s.design}`)!, s.x, s.y);
  });
  w.modStart[w.count] = w.moduleCount;
  return w;
}

function addUnit(w: World, side: number, designIndex: number, x: number, y: number): void {
  const d = w.designs[designIndex];
  const i = w.count++;
  w.side[i] = side;
  w.design[i] = designIndex;
  w.status[i] = ACTIVE;
  w.x[i] = x;
  w.y[i] = y;
  w.hx[i] = side === 0 ? 1 : -1;
  w.hy[i] = 0;
  w.structure[i] = d.hull.structure;
  for (let f = 0; f < 4; f++) w.armour[i * 4 + f] = d.design.armour[f];
  w.retarget[i] = i % TICK_HZ;
  w.modStart[i] = w.moduleCount;
  for (let k = 0; k < d.modules.length; k++) {
    const m = w.moduleCount++;
    w.mUnit[m] = i;
    w.mSlot[m] = k;
    w.mHp[m] = d.modules[k].def.hp;
    // Stagger first shots so a fleet does not fire in one volley.
    w.mCooldown[m] = k % 7;
  }
  w.dcSupply[i] = d.modules.some((m) => m.def.kind === 'damagecontrol') ? DC_SUPPLY : 0;
  w.deployedValue[side] += d.cost;
  w.modStart[i + 1] = w.moduleCount;
  refreshMobility(w, i);
}

/** Recompute speed, acceleration and turn from the drives that still work. */
export function refreshMobility(w: World, i: number): void {
  const d = w.designs[w.design[i]];
  let thrust = 0;
  const start = w.modStart[i];
  for (let k = 0; k < d.modules.length; k++) {
    if (d.modules[k].def.kind === 'drive' && w.mHp[start + k] > 0) thrust += d.modules[k].def.thrust;
  }
  const accel = thrust / d.mass;
  w.accel[i] = accel;
  w.maxSpeed[i] = Math.min(SPEED_CAP, accel * SPEED_TIME);
  const turn = d.hull.turnBase * Math.min(1.6, Math.max(0.4, accel / d.hull.refAccel));
  const t = turnStep(turn);
  w.turnCos[i] = t.c;
  w.turnSin[i] = t.s;
}
