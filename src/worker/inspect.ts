import type { Criterion } from '../content/types.ts';
import { TICK_HZ } from '../sim/constants.ts';
import { hitChance, inArcAndRange } from '../sim/weapons.ts';
import { ACTIVE, CRIPPLED, REASON_NEAREST, WITHDRAWING, type World } from '../sim/world.ts';
import type { InspectDetail } from './protocol.ts';

const CRITERION_TEXT: Record<Criterion, string> = {
  cruiser: 'cruisers',
  destroyer: 'destroyers',
  frigate: 'frigates',
  crippled: 'crippled ships',
  armourBroken: 'ships with broken armour',
  threat: 'ships firing on it',
};

function reasonText(w: World, i: number): string {
  const status = w.status[i];
  if (status === WITHDRAWING) return w.broken[w.side[i]] ? 'Withdrawing: the fleet has broken.' : 'Withdrawing: below its withdraw threshold.';
  if (status === CRIPPLED) return 'Crippled. Out of the fight.';
  if (status !== ACTIVE) return 'Out of the battle.';
  const r = w.targetReason[i];
  if (w.target[i] < 0) return 'No target.';
  if (r === REASON_NEAREST) return 'Nearest enemy (no priority criterion matched).';
  const crit = w.designs[w.design[i]].design.doctrine.priority[r];
  return `Priority ${r + 1}: ${CRITERION_TEXT[crit]}.`;
}

export function inspect(w: World, i: number): InspectDetail | null {
  if (i < 0 || i >= w.count) return null;
  const d = w.designs[w.design[i]];
  const start = w.modStart[i];
  const weapons = d.weapons.map((k) => {
    const mod = d.modules[k];
    const m = start + k;
    const t = w.mTarget[m] >= 0 && w.tick - w.mLastShot[m] < TICK_HZ * 6 ? w.mTarget[m] : w.target[i];
    const inArc = t >= 0 && inArcAndRange(w, i, t, mod);
    return {
      code: mod.def.code,
      mount: mod.mount.id,
      hp: w.mHp[m] / mod.def.hp,
      reload: w.mCooldown[m] / TICK_HZ,
      target: t,
      inArc,
      hitChance: inArc ? hitChance(w, i, t, mod) : 0,
    };
  });
  return {
    unit: i,
    status: w.status[i],
    structure: w.structure[i],
    structureMax: d.hull.structure,
    armour: [0, 1, 2, 3].map((f) => w.armour[i * 4 + f]),
    armourPlan: [...d.design.armour],
    speed: w.speed[i],
    maxSpeed: w.maxSpeed[i],
    target: w.target[i],
    reason: reasonText(w, i),
    weapons,
    modules: d.modules.map((m, k) => ({ code: m.def.code, mount: m.mount.id, hp: w.mHp[start + k] / m.def.hp })),
    dcSupply: w.dcSupply[i],
    crewLost: Math.round(w.crewLost[i]),
  };
}
