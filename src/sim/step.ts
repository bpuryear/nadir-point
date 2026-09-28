import { CLASSES } from './classes.ts';
import { DT } from './constants.ts';
import { rebuildGrid } from './grid.ts';
import { nextFloat } from './rng.ts';
import { WINNER_DRAW, type World } from './world.ts';

const RETARGET_TICKS = 15;
const SEARCH_RINGS = 12;
const EDGE_MARGIN = 400;

/**
 * Advance the battle by one fixed tick.
 *
 * Every unit decides from the same start-of-tick state; then all units move and
 * all damage lands. Unit index order therefore cannot favour either side.
 */
export function step(w: World): void {
  if (w.ended) return;
  rebuildGrid(w.grid, w.count, w.alive, w.x, w.y);

  for (let i = 0; i < w.count; i++) {
    if (!w.alive[i]) continue;
    acquireTarget(w, i);
    steer(w, i);
    fire(w, i);
  }

  move(w);
  applyDamage(w);
  w.tick++;
  checkEnd(w);
}

function acquireTarget(w: World, i: number): void {
  const t = w.target[i];
  const due = --w.retarget[i] <= 0;
  if (t >= 0 && w.alive[t] && !due) return;
  if (due) w.retarget[i] = RETARGET_TICKS;
  w.target[i] = nearestEnemy(w, i);
}

function nearestEnemy(w: World, i: number): number {
  const g = w.grid;
  const enemy = 1 - w.side[i];
  const cx = Math.floor(w.x[i] / g.cellSize);
  const cy = Math.floor(w.y[i] / g.cellSize);
  let best = -1;
  let bestD2 = Infinity;
  for (let ring = 0; ring <= SEARCH_RINGS; ring++) {
    for (let gy = cy - ring; gy <= cy + ring; gy++) {
      if (gy < 0 || gy >= g.rows) continue;
      const edgeRow = gy === cy - ring || gy === cy + ring;
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        if (gx < 0 || gx >= g.cols) continue;
        if (!edgeRow && gx !== cx - ring && gx !== cx + ring) continue;
        const c = gy * g.cols + gx;
        for (let k = g.cellStart[c]; k < g.cellStart[c + 1]; k++) {
          const j = g.items[k];
          if (w.side[j] !== enemy) continue;
          const dx = w.x[j] - w.x[i];
          const dy = w.y[j] - w.y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = j;
          }
        }
      }
    }
    // Anything in a later ring is at least ring * cellSize away.
    if (best >= 0 && bestD2 <= ring * g.cellSize * (ring * g.cellSize)) return best;
  }
  if (best >= 0) return best;
  for (let j = 0; j < w.count; j++) {
    if (!w.alive[j] || w.side[j] !== enemy) continue;
    const dx = w.x[j] - w.x[i];
    const dy = w.y[j] - w.y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = j;
    }
  }
  return best;
}

function steer(w: World, i: number): void {
  const c = CLASSES[w.cls[i]];
  let dirX = w.side[i] === 0 ? 1 : -1;
  let dirY = 0;
  let wantSpeed = c.maxSpeed * 0.6;

  const t = w.target[i];
  if (t >= 0) {
    const dx = w.x[t] - w.x[i];
    const dy = w.y[t] - w.y[i];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      const ideal = c.range * 0.75;
      const ux = dx / dist;
      const uy = dy / dist;
      if (dist > ideal * 1.1) {
        dirX = ux;
        dirY = uy;
        wantSpeed = c.maxSpeed;
      } else if (dist < ideal * 0.7) {
        dirX = -ux;
        dirY = -uy;
        wantSpeed = c.maxSpeed * 0.6;
      } else {
        // Circle the target; odd and even units circle opposite ways.
        const sgn = (i & 1) === 0 ? 1 : -1;
        dirX = -uy * sgn;
        dirY = ux * sgn;
        wantSpeed = c.maxSpeed * 0.5;
      }
    }
  }

  // Separation from nearby ships of any side.
  let sepX = 0;
  let sepY = 0;
  const g = w.grid;
  const cx = Math.floor(w.x[i] / g.cellSize);
  const cy = Math.floor(w.y[i] / g.cellSize);
  for (let gy = cy - 1; gy <= cy + 1; gy++) {
    if (gy < 0 || gy >= g.rows) continue;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      if (gx < 0 || gx >= g.cols) continue;
      const cell = gy * g.cols + gx;
      for (let k = g.cellStart[cell]; k < g.cellStart[cell + 1]; k++) {
        const j = g.items[k];
        if (j === i) continue;
        const ddx = w.x[i] - w.x[j];
        const ddy = w.y[i] - w.y[j];
        const d2 = ddx * ddx + ddy * ddy;
        const touch = c.radius + CLASSES[w.cls[j]].radius;
        const keep = touch * 1.8;
        if (d2 >= keep * keep || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (keep - d) / keep;
        sepX += (ddx / d) * push;
        sepY += (ddy / d) * push;
        if (d < touch) {
          // Hard collision: move half the overlap now, the other ship moves the rest.
          const overlap = (touch - d) * 0.5;
          w.corrX[i] += (ddx / d) * overlap;
          w.corrY[i] += (ddy / d) * overlap;
        }
      }
    }
  }

  // Keep off the map edges.
  if (w.x[i] < EDGE_MARGIN) dirX += (EDGE_MARGIN - w.x[i]) / EDGE_MARGIN;
  if (w.x[i] > w.width - EDGE_MARGIN) dirX -= (w.x[i] - (w.width - EDGE_MARGIN)) / EDGE_MARGIN;
  if (w.y[i] < EDGE_MARGIN) dirY += (EDGE_MARGIN - w.y[i]) / EDGE_MARGIN;
  if (w.y[i] > w.height - EDGE_MARGIN) dirY -= (w.y[i] - (w.height - EDGE_MARGIN)) / EDGE_MARGIN;

  let wantX = dirX + sepX * 1.5;
  let wantY = dirY + sepY * 1.5;
  const wantLen = Math.sqrt(wantX * wantX + wantY * wantY);
  w.nextHx[i] = w.hx[i];
  w.nextHy[i] = w.hy[i];
  if (wantLen > 1e-9) {
    wantX /= wantLen;
    wantY /= wantLen;
    turnToward(w, i, wantX, wantY, c.turnCos, c.turnSin);
  }

  const dot = w.nextHx[i] * wantX + w.nextHy[i] * wantY;
  if (dot < 0) wantSpeed *= 0.5;
  const s = w.speed[i];
  const dv = c.accel * DT;
  w.nextSpeed[i] = s < wantSpeed ? Math.min(s + dv, wantSpeed) : Math.max(s - dv, wantSpeed);
}

function turnToward(w: World, i: number, dx: number, dy: number, tc: number, ts: number): void {
  const hx = w.hx[i];
  const hy = w.hy[i];
  if (hx * dx + hy * dy >= tc) {
    w.nextHx[i] = dx;
    w.nextHy[i] = dy;
    return;
  }
  const s = hx * dy - hy * dx >= 0 ? ts : -ts;
  const nx = hx * tc - hy * s;
  const ny = hx * s + hy * tc;
  const len = Math.sqrt(nx * nx + ny * ny);
  w.nextHx[i] = nx / len;
  w.nextHy[i] = ny / len;
}

function fire(w: World, i: number): void {
  if (w.cooldown[i] > 0) {
    w.cooldown[i]--;
    return;
  }
  const t = w.target[i];
  if (t < 0 || !w.alive[t]) return;
  const c = CLASSES[w.cls[i]];
  const dx = w.x[t] - w.x[i];
  const dy = w.y[t] - w.y[i];
  if (dx * dx + dy * dy > c.range * c.range) return;
  const hit = nextFloat(w.rng) < c.hitChance;
  if (hit) w.pendingDamage[t] += c.damage;
  w.lastShotTick[i] = w.tick;
  w.shotTarget[i] = t;
  w.shotHit[i] = hit ? 1 : 0;
  w.cooldown[i] = c.reloadTicks;
}

function move(w: World): void {
  for (let i = 0; i < w.count; i++) {
    if (!w.alive[i]) continue;
    const hx = w.nextHx[i];
    const hy = w.nextHy[i];
    const v = w.nextSpeed[i];
    w.hx[i] = hx;
    w.hy[i] = hy;
    w.speed[i] = v;
    w.x[i] += hx * v * DT + w.corrX[i];
    w.y[i] += hy * v * DT + w.corrY[i];
    w.corrX[i] = 0;
    w.corrY[i] = 0;
  }
}

function applyDamage(w: World): void {
  for (let i = 0; i < w.count; i++) {
    const d = w.pendingDamage[i];
    if (d === 0) continue;
    w.pendingDamage[i] = 0;
    if (!w.alive[i]) continue;
    w.hp[i] -= d;
    if (w.hp[i] <= 0) {
      w.hp[i] = 0;
      w.alive[i] = 0;
      w.speed[i] = 0;
      w.aliveBySide[w.side[i]]--;
    }
  }
}

function checkEnd(w: World): void {
  const a = w.aliveBySide[0];
  const b = w.aliveBySide[1];
  if (a === 0 || b === 0) {
    w.ended = true;
    w.winner = a === 0 && b === 0 ? WINNER_DRAW : a === 0 ? 1 : 0;
  } else if (w.tick >= w.maxTicks) {
    w.ended = true;
    w.winner = a === b ? WINNER_DRAW : a > b ? 0 : 1;
  }
}
