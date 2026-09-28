import { TICK_HZ } from './constants.ts';
import type { CompiledModule } from './design.ts';
import { nextFloat } from './rng.ts';
import { ACTIVE, CRIPPLED, telemetryIndex, WITHDRAWING, type World } from './world.ts';

// Weapon fire, decided from start-of-tick state. Hits land in the resolve phase.
// docs/design/m1-rules.md §4.

const RAD_TO_DEG = 57.29577951308232;

export function reloadTicks(m: CompiledModule): number {
  return Math.max(1, Math.round(m.def.weapon!.reload * TICK_HZ));
}

export function fireWeapons(w: World, i: number): void {
  const status = w.status[i];
  const canFire = status === ACTIVE || status === WITHDRAWING;
  const d = w.designs[w.design[i]];
  const start = w.modStart[i];
  let lastShot = -1000;
  let longestReload = 0;

  for (const k of d.weapons) {
    const m = start + k;
    if (w.mHp[m] <= 0) continue;
    const mod = d.modules[k];
    longestReload = Math.max(longestReload, reloadTicks(mod));
    if (w.mCooldown[m] > 0) {
      w.mCooldown[m]--;
    } else if (canFire) {
      const t = chooseWeaponTarget(w, i, mod);
      if (t >= 0) {
        shoot(w, i, t, mod, m);
        w.mCooldown[m] = reloadTicks(mod);
      }
    }
    lastShot = Math.max(lastShot, w.mLastShot[m]);
  }

  // Idle: no weapon has fired within its longest reload plus a second.
  if (status === ACTIVE) {
    w.stats.activeTicks[i]++;
    if (w.tick - lastShot > longestReload + TICK_HZ) w.stats.idleTicks[i]++;
  }
}

function chooseWeaponTarget(w: World, i: number, mod: CompiledModule): number {
  const shipTarget = w.target[i];
  if (shipTarget >= 0 && inArcAndRange(w, i, shipTarget, mod)) return shipTarget;
  return nearestInArc(w, i, mod);
}

export function inArcAndRange(w: World, i: number, t: number, mod: CompiledModule): boolean {
  const s = w.status[t];
  if (!(s === ACTIVE || s === WITHDRAWING || s === CRIPPLED)) return false;
  const dx = w.x[t] - w.x[i];
  const dy = w.y[t] - w.y[i];
  const d2 = dx * dx + dy * dy;
  const range = mod.def.weapon!.range;
  if (d2 > range * range) return false;
  if (mod.arcCos <= -1) return true;
  const dist = Math.sqrt(d2);
  if (dist < 1e-6) return true;
  // Target direction in the ship frame, then against the mount facing.
  const lx = (dx * w.hx[i] + dy * w.hy[i]) / dist;
  const ly = (dy * w.hx[i] - dx * w.hy[i]) / dist;
  return lx * mod.fx + ly * mod.fy >= mod.arcCos;
}

function nearestInArc(w: World, i: number, mod: CompiledModule): number {
  const g = w.grid;
  const range = mod.def.weapon!.range;
  const enemy = 1 - w.side[i];
  const r = Math.ceil(range / g.cellSize);
  const cx = Math.floor(w.x[i] / g.cellSize);
  const cy = Math.floor(w.y[i] / g.cellSize);
  let best = -1;
  let bestD2 = range * range;
  for (let gy = cy - r; gy <= cy + r; gy++) {
    if (gy < 0 || gy >= g.rows) continue;
    for (let gx = cx - r; gx <= cx + r; gx++) {
      if (gx < 0 || gx >= g.cols) continue;
      const cell = gy * g.cols + gx;
      for (let k = g.cellStart[cell]; k < g.cellStart[cell + 1]; k++) {
        const j = g.items[k];
        if (w.side[j] !== enemy) continue;
        // Weapons of opportunity skip wrecks; only doctrine chooses to finish them.
        if (w.status[j] === CRIPPLED) continue;
        const dx = w.x[j] - w.x[i];
        const dy = w.y[j] - w.y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 >= bestD2) continue;
        if (!inArcAndRange(w, i, j, mod)) continue;
        bestD2 = d2;
        best = j;
      }
    }
  }
  return best;
}

/** Chance that one shot from `mod` on unit i hits unit t. */
export function hitChance(w: World, i: number, t: number, mod: CompiledModule): number {
  const wpn = mod.def.weapon!;
  const shooter = w.designs[w.design[i]];
  const rx = w.x[t] - w.x[i];
  const ry = w.y[t] - w.y[i];
  const d2 = rx * rx + ry * ry;
  const dist = Math.sqrt(d2);
  if (dist < 1e-6) return 1;
  const vx = w.hx[t] * w.speed[t] - w.hx[i] * w.speed[i];
  const vy = w.hy[t] * w.speed[t] - w.hy[i] * w.speed[i];
  const omega = (Math.abs(rx * vy - ry * vx) / d2) * RAD_TO_DEG;
  const tracking = wpn.tracking * shooter.trackingMul;
  const radius = w.designs[w.design[t]].hull.radius;
  const size = radius / (radius + dist * wpn.spread);
  return (size * tracking) / (tracking + omega);
}

function shoot(w: World, i: number, t: number, mod: CompiledModule, m: number): void {
  const p = hitChance(w, i, t, mod);
  const hit = nextFloat(w.rng) < p;
  const wpn = mod.def.weapon!;
  const ti = telemetryIndex(w.side[i], mod.defIndex, w.designs[w.design[t]].cls);
  w.stats.shots[ti]++;
  w.stats.expected[ti] += p;
  w.mLastShot[m] = w.tick;
  w.mTarget[m] = t;
  w.mHit[m] = hit ? 1 : 0;
  if (!hit) return;
  w.stats.hits[ti]++;
  w.stats.raw[ti] += wpn.damage;
  const h = w.hits;
  const n = h.n++;
  h.target[n] = t;
  h.shooter[n] = i;
  h.weapon[n] = mod.defIndex;
  h.damage[n] = wpn.damage;
  h.pen[n] = wpn.pen;
  h.fromX[n] = w.x[i];
  h.fromY[n] = w.y[i];
}
