import { refreshMobility } from './battle.ts';
import { TICK_HZ } from './constants.ts';
import { nextFloat, nextInt } from './rng.ts';
import {
  ACTIVE,
  CRIPPLED,
  DESTROYED,
  EVENT_BREACH,
  EVENT_DESTROYED,
  telemetryIndex,
  WITHDRAWING,
  type World,
} from './world.ts';

// Hits land here, after every unit has moved. docs/design/m1-rules.md §5.

const WEAR = 0.1;
const CREW_PER_DAMAGE = 0.2;
const WRECK_FRACTION = -0.5;
const ZONE_DORSAL = 4;
const ZONE_CORE = 5;
/** Breach chance, blast radius and peak damage by reactor size (index 1..3). */
const BREACH_CHANCE = [0, 0.15, 0.25, 0.35];
const BLAST_RADIUS = [0, 120, 180, 260];
const BLAST_PEAK = [0, 60, 120, 220];
const DC_ARMOUR_RATE = 3;
const DC_MODULE_RATE = 4;
const DC_ARMOUR_CAP = 0.75;
const UNDER_FIRE_TICKS = 3 * TICK_HZ;

interface Blast {
  x: number;
  y: number;
  radius: number;
  peak: number;
  source: number;
}

/** 0 bow, 1 port, 2 starboard, 3 stern: the facing of unit t that points at (fromX, fromY). */
export function facingToward(w: World, t: number, fromX: number, fromY: number): number {
  const dx = fromX - w.x[t];
  const dy = fromY - w.y[t];
  const fx = dx * w.hx[t] + dy * w.hy[t];
  const ly = dy * w.hx[t] - dx * w.hy[t];
  const aly = Math.abs(ly);
  if (fx >= aly) return 0;
  if (-fx >= aly) return 3;
  return ly > 0 ? 1 : 2;
}

export function resolveHits(w: World): void {
  const blasts: Blast[] = [];
  const h = w.hits;
  for (let k = 0; k < h.n; k++) {
    const t = h.target[k];
    if (w.status[t] >= DESTROYED) continue;
    const facing = facingToward(w, t, h.fromX[k], h.fromY[k]);
    const through = applyDamage(w, t, h.damage[k], h.pen[k], facing, blasts);
    const shooter = h.shooter[k];
    w.stats.dealt[shooter] += through;
    w.stats.through[telemetryIndex(w.side[shooter], h.weapon[k], w.designs[w.design[t]].cls)] += through;
  }
  h.n = 0;

  // Blasts can breach more reactors; the queue grows until it settles.
  for (let b = 0; b < blasts.length; b++) {
    const blast = blasts[b];
    destroy(w, blast.source);
    w.stats.breachLosses[w.side[blast.source]]++;
    w.events.push(blast.x, blast.y, blast.radius, EVENT_BREACH);
    for (let j = 0; j < w.count; j++) {
      if (j === blast.source || w.status[j] >= DESTROYED) continue;
      const dx = w.x[j] - blast.x;
      const dy = w.y[j] - blast.y;
      const reach = blast.radius + w.designs[w.design[j]].hull.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const falloff = 1 - Math.sqrt(d2) / reach;
      const dmg = blast.peak * falloff;
      w.stats.blastVictims[w.side[j]]++;
      applyDamage(w, j, dmg, dmg, facingToward(w, j, blast.x, blast.y), blasts);
    }
  }
}

/** Armour, then structure and one module. Returns the damage that got through. */
function applyDamage(w: World, t: number, dmg: number, pen: number, facing: number, blasts: Blast[]): number {
  const a = t * 4 + facing;
  const plate = w.armour[a];
  let through = dmg;
  if (plate > 0) {
    const r = pen / plate;
    through = r >= 1 ? dmg : dmg * r * r;
    const rc = Math.min(1, r);
    const wear = WEAR * dmg * rc * rc;
    w.armour[a] = Math.max(0, plate - wear);
  }
  w.lastHitTick[t] = w.tick;
  if (through <= 0) return 0;

  w.structure[t] -= through;
  w.crewLost[t] += through * CREW_PER_DAMAGE;
  w.stats.taken[t] += through;
  w.stats.facingThrough[w.side[t] * 4 + facing] += through;
  hitModule(w, t, facing, through, blasts);

  const max = w.designs[w.design[t]].hull.structure;
  if (w.structure[t] <= WRECK_FRACTION * max) destroy(w, t);
  else if (w.structure[t] <= 0) cripple(w, t);
  else checkWithdraw(w, t);
  return through;
}

function hitModule(w: World, t: number, facing: number, dmg: number, blasts: Blast[]): void {
  const roll = nextFloat(w.rng);
  const zone = roll < 0.55 ? facing : roll < 0.8 ? ZONE_DORSAL : ZONE_CORE;
  const d = w.designs[w.design[t]];
  const start = w.modStart[t];
  let n = 0;
  for (let k = 0; k < d.modules.length; k++) if (d.modules[k].zone === zone && w.mHp[start + k] > 0) n++;
  if (n === 0) return;
  let pick = nextInt(w.rng, n);
  for (let k = 0; k < d.modules.length; k++) {
    if (d.modules[k].zone !== zone || w.mHp[start + k] <= 0) continue;
    if (pick-- > 0) continue;
    const m = start + k;
    w.mHp[m] -= dmg;
    if (w.mHp[m] <= 0) {
      w.mHp[m] = 0;
      moduleLost(w, t, k, blasts);
    }
    return;
  }
}

function moduleLost(w: World, t: number, k: number, blasts: Blast[]): void {
  const d = w.designs[w.design[t]];
  const def = d.modules[k].def;
  switch (def.kind) {
    case 'reactor':
      if (nextFloat(w.rng) < BREACH_CHANCE[def.size]) {
        blasts.push({ x: w.x[t], y: w.y[t], radius: BLAST_RADIUS[def.size], peak: BLAST_PEAK[def.size], source: t });
      } else if (!hasWorking(w, t, 'reactor')) {
        cripple(w, t);
      }
      break;
    case 'bridge':
      cripple(w, t);
      break;
    case 'drive':
      refreshMobility(w, t);
      if (!hasWorking(w, t, 'drive')) cripple(w, t);
      break;
    default:
      break;
  }
}

function hasWorking(w: World, t: number, kind: string): boolean {
  const d = w.designs[w.design[t]];
  const start = w.modStart[t];
  for (let k = 0; k < d.modules.length; k++) if (d.modules[k].def.kind === kind && w.mHp[start + k] > 0) return true;
  return false;
}

function checkWithdraw(w: World, t: number): void {
  if (w.status[t] !== ACTIVE) return;
  const d = w.designs[w.design[t]];
  const at = d.design.doctrine.withdrawAt;
  if (at > 0 && w.structure[t] < at * d.hull.structure) w.status[t] = WITHDRAWING;
}

export function cripple(w: World, t: number): void {
  if (w.status[t] >= CRIPPLED) return;
  w.status[t] = CRIPPLED;
  w.target[t] = -1;
  w.stats.fateTick[t] = w.tick;
}

function destroy(w: World, t: number): void {
  if (w.status[t] >= DESTROYED) return;
  w.status[t] = DESTROYED;
  w.speed[t] = 0;
  w.target[t] = -1;
  w.stats.fateTick[t] = w.tick;
  w.events.push(w.x[t], w.y[t], w.designs[w.design[t]].hull.radius, EVENT_DESTROYED);
}

/** Once a second per ship, staggered by index. docs/design/m1-rules.md §5.5. */
export function damageControl(w: World): void {
  for (let i = 0; i < w.count; i++) {
    if ((w.tick + i) % TICK_HZ !== 0) continue;
    const s = w.status[i];
    if (!(s === ACTIVE || s === WITHDRAWING) || w.dcSupply[i] <= 0) continue;
    if (!hasWorking(w, i, 'damagecontrol')) continue;
    const rate = w.tick - w.lastHitTick[i] < UNDER_FIRE_TICKS ? 0.5 : 1;
    repairArmour(w, i, DC_ARMOUR_RATE * rate);
    repairModule(w, i, DC_MODULE_RATE * rate);
  }
}

function repairArmour(w: World, i: number, amount: number): void {
  const plan = w.designs[w.design[i]].design.armour;
  let worst = -1;
  let worstRatio = DC_ARMOUR_CAP;
  for (let f = 0; f < 4; f++) {
    if (plan[f] <= 0) continue;
    const ratio = w.armour[i * 4 + f] / plan[f];
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = f;
    }
  }
  if (worst < 0) return;
  const room = plan[worst] * DC_ARMOUR_CAP - w.armour[i * 4 + worst];
  const used = Math.min(amount, room, w.dcSupply[i]);
  w.armour[i * 4 + worst] += used;
  w.dcSupply[i] -= used;
}

function repairModule(w: World, i: number, amount: number): void {
  const d = w.designs[w.design[i]];
  const start = w.modStart[i];
  let worst = -1;
  let worstRatio = 1;
  for (let k = 0; k < d.modules.length; k++) {
    const hp = w.mHp[start + k];
    if (hp <= 0) continue;
    const ratio = hp / d.modules[k].def.hp;
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worst = k;
    }
  }
  if (worst < 0) return;
  const m = start + worst;
  const used = Math.min(amount, d.modules[worst].def.hp - w.mHp[m], w.dcSupply[i]);
  w.mHp[m] += used;
  w.dcSupply[i] -= used;
}
