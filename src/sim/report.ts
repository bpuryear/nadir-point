import { MODULES } from '../content/modules.ts';
import { FACINGS, HULL_CLASSES } from '../content/types.ts';
import { TICK_HZ } from './constants.ts';
import {
  ACTIVE,
  CRIPPLED,
  DESTROYED,
  ESCAPED,
  NUM_CLASSES,
  NUM_WEAPON_TYPES,
  telemetryIndex,
  WITHDRAWING,
  type World,
} from './world.ts';

// After-action report: what happened, and the three largest causes.
// docs/design/m1-rules.md §8. Pure function of the finished world.

export type Fate = 'on station' | 'withdrew' | 'escaped' | 'crippled' | 'destroyed';

export interface ShipRow {
  unit: number;
  side: number;
  design: string;
  hull: string;
  fate: Fate;
  fateAt: number;
  structure: number;
  dealt: number;
  taken: number;
  crewLost: number;
  modulesLost: string[];
}

export interface WeaponRow {
  side: number;
  weapon: string;
  targetClass: string;
  shots: number;
  hits: number;
  hitRate: number;
  expectedRate: number;
  raw: number;
  through: number;
  throughRate: number;
}

export interface Cause {
  kind: 'hit-rate' | 'penetration' | 'facing' | 'breach' | 'idle' | 'value';
  impact: number;
  text: string;
}

export interface BattleReport {
  winner: number;
  seconds: number;
  deployed: [number, number];
  lost: [number, number];
  ships: ShipRow[];
  weapons: WeaponRow[];
  /** Largest first; from side 0's point of view. */
  causes: Cause[];
}

const MIN_SHOTS = 20;

export function buildReport(w: World): BattleReport {
  const ships = shipRows(w);
  const weapons = weaponRows(w);
  const lost: [number, number] = [0, 0];
  for (const s of ships) {
    if (s.fate === 'crippled' || s.fate === 'destroyed') lost[s.side] += w.designs[w.design[s.unit]].cost;
  }
  const causes = [
    ...hitRateCauses(weapons),
    ...penetrationCauses(w, weapons),
    ...facingCauses(w),
    ...breachCauses(w),
    ...idleCauses(w),
  ].sort((a, b) => b.impact - a.impact);
  return {
    winner: w.winner,
    seconds: w.tick / TICK_HZ,
    deployed: [w.deployedValue[0], w.deployedValue[1]],
    lost,
    ships,
    weapons,
    causes: causes.slice(0, 3),
  };
}

function fateOf(status: number): Fate {
  switch (status) {
    case ACTIVE:
      return 'on station';
    case WITHDRAWING:
      return 'withdrew';
    case ESCAPED:
      return 'escaped';
    case CRIPPLED:
      return 'crippled';
    default:
      return 'destroyed';
  }
}

function shipRows(w: World): ShipRow[] {
  const rows: ShipRow[] = [];
  for (let i = 0; i < w.count; i++) {
    const d = w.designs[w.design[i]];
    const start = w.modStart[i];
    rows.push({
      unit: i,
      side: w.side[i],
      design: d.design.name,
      hull: d.hull.name,
      fate: fateOf(w.status[i]),
      fateAt: w.stats.fateTick[i] >= 0 ? w.stats.fateTick[i] / TICK_HZ : -1,
      structure: Math.max(0, w.structure[i] / d.hull.structure),
      dealt: w.stats.dealt[i],
      taken: w.stats.taken[i],
      crewLost: Math.min(d.crew, Math.round(w.crewLost[i])),
      modulesLost: d.modules.filter((_, k) => w.mHp[start + k] <= 0).map((m) => m.def.code),
    });
  }
  return rows;
}

function weaponRows(w: World): WeaponRow[] {
  const rows: WeaponRow[] = [];
  const s = w.stats;
  for (let side = 0; side < 2; side++) {
    for (let m = 0; m < NUM_WEAPON_TYPES; m++) {
      for (let c = 0; c < NUM_CLASSES; c++) {
        const i = telemetryIndex(side, m, c);
        if (s.shots[i] === 0) continue;
        rows.push({
          side,
          weapon: MODULES[m].name,
          targetClass: HULL_CLASSES[c],
          shots: s.shots[i],
          hits: s.hits[i],
          hitRate: s.hits[i] / s.shots[i],
          expectedRate: s.expected[i] / s.shots[i],
          raw: s.raw[i],
          through: s.through[i],
          throughRate: s.raw[i] > 0 ? s.through[i] / s.raw[i] : 0,
        });
      }
    }
  }
  return rows;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const plural = (c: string): string => `${c}s`;

/** Our weapons that rarely hit a class of target. */
function hitRateCauses(rows: WeaponRow[]): Cause[] {
  return rows
    .filter((r) => r.side === 0 && r.shots >= MIN_SHOTS && r.hitRate < 0.35)
    .map((r) => {
      const def = MODULES.find((m) => m.name === r.weapon)!;
      const missed = (r.shots - r.hits) * def.weapon!.damage;
      return {
        kind: 'hit-rate' as const,
        impact: missed * (0.35 - r.hitRate),
        text: `${r.weapon} hit enemy ${plural(r.targetClass)} ${pct(r.hitRate)} of the time (${r.hits} of ${r.shots}). Its tracking is ${def.weapon!.tracking}°/s; small, fast targets cross faster than that.`,
      };
    });
}

/** Our hits that armour stopped. */
function penetrationCauses(w: World, rows: WeaponRow[]): Cause[] {
  return rows
    .filter((r) => r.side === 0 && r.hits >= 10 && r.throughRate < 0.4)
    .map((r) => {
      const def = MODULES.find((m) => m.name === r.weapon)!;
      return {
        kind: 'penetration' as const,
        impact: (r.raw - r.through) * 0.6,
        text: `${r.weapon} put ${pct(r.throughRate)} of its damage through enemy ${r.targetClass} armour (penetration ${def.weapon!.pen} against ${Math.round(meanPlate(w, 1, r.targetClass))} average plate).`,
      };
    });
}

function meanPlate(w: World, side: number, cls: string): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < w.count; i++) {
    if (w.side[i] !== side) continue;
    const d = w.designs[w.design[i]];
    if (d.hull.cls !== cls) continue;
    for (let f = 0; f < 4; f++) sum += d.design.armour[f];
    n += 4;
  }
  return n ? sum / n : 0;
}

/** The facing through which most damage reached our hulls. */
function facingCauses(w: World): Cause[] {
  const t = w.stats.facingThrough;
  const total = t[0] + t[1] + t[2] + t[3];
  if (total <= 0) return [];
  let worst = 0;
  for (let f = 1; f < 4; f++) if (t[f] > t[worst]) worst = f;
  const share = t[worst] / total;
  if (share < 0.4) return [];
  return [
    {
      kind: 'facing',
      impact: t[worst] * (share - 0.25),
      text: `${pct(share)} of the damage that reached your hulls came through ${FACINGS[worst]} armour.`,
    },
  ];
}

function breachCauses(w: World): Cause[] {
  const lost = w.stats.breachLosses[0];
  if (lost === 0) return [];
  let value = 0;
  for (let i = 0; i < w.count; i++) if (w.side[i] === 0 && w.status[i] === DESTROYED) value += w.designs[w.design[i]].cost;
  const victims = w.stats.blastVictims[0];
  return [
    {
      kind: 'breach',
      impact: value * 0.5 + victims * 50,
      text: `${lost} of your ships were lost to reactor breaches; ${victims} more took blast damage. Close formations spread breaches.`,
    },
  ];
}

/** Our ships that spent most of the battle with nothing to shoot. */
function idleCauses(w: World): Cause[] {
  let active = 0;
  let idle = 0;
  let dpsIdle = 0;
  for (let i = 0; i < w.count; i++) {
    if (w.side[i] !== 0) continue;
    active += w.stats.activeTicks[i];
    idle += w.stats.idleTicks[i];
    dpsIdle += (w.designs[w.design[i]].totalDps * w.stats.idleTicks[i]) / TICK_HZ;
  }
  if (active === 0) return [];
  const share = idle / active;
  if (share < 0.35) return [];
  return [
    {
      kind: 'idle',
      impact: dpsIdle * 0.3,
      text: `Your ships spent ${pct(share)} of their time in action with nothing in arc and range. Check engagement range and fire arcs.`,
    },
  ];
}
