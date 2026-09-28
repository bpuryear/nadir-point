import { DT } from './constants.ts';
import { ACTIVE, CRIPPLED, ESCAPED, WITHDRAWING, type World } from './world.ts';

// Decide a heading and speed for each unit from start-of-tick state; move all
// units afterwards. docs/design/m1-rules.md §6.

const EDGE_MARGIN = 400;
const ESCAPE_DISTANCE = 200;
const CLOSE_FACTOR = 1.15;
const DRIFT_DECAY_TICKS = 90;

export function steer(w: World, i: number): void {
  const status = w.status[i];
  const max = w.maxSpeed[i];
  w.nextHx[i] = w.hx[i];
  w.nextHy[i] = w.hy[i];

  if (status === CRIPPLED) {
    w.nextSpeed[i] = Math.max(0, w.speed[i] - max / DRIFT_DECAY_TICKS - 0.5);
    return;
  }

  let dirX: number;
  let dirY: number;
  let want: number;
  if (status === WITHDRAWING) {
    dirX = w.side[i] === 0 ? -1 : 1;
    dirY = 0;
    want = max;
  } else {
    const plan = planApproach(w, i);
    dirX = plan.x;
    dirY = plan.y;
    want = plan.speed * max;
  }

  const sep = separation(w, i);
  dirX += sep.x * 1.5;
  dirY += sep.y * 1.5;
  if (status === ACTIVE) {
    const edge = edgePush(w, i);
    dirX += edge.x;
    dirY += edge.y;
  }

  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  if (len > 1e-9) turnToward(w, i, dirX / len, dirY / len);

  // Slow for hard turns.
  if (len > 1e-9 && w.nextHx[i] * dirX + w.nextHy[i] * dirY < 0) want *= 0.5;
  const dv = w.accel[i] * DT;
  const s = w.speed[i];
  w.nextSpeed[i] = s < want ? Math.min(s + dv, want) : Math.max(s - dv, want);
}

interface Plan {
  x: number;
  y: number;
  speed: number;
}

function planApproach(w: World, i: number): Plan {
  const t = w.target[i];
  if (t < 0) return { x: w.side[i] === 0 ? 1 : -1, y: 0, speed: 0.6 };
  const d = w.designs[w.design[i]];
  const dx = w.x[t] - w.x[i];
  const dy = w.y[t] - w.y[i];
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return { x: w.hx[i], y: w.hy[i], speed: 0.5 };
  const ux = dx / dist;
  const uy = dy / dist;
  const range = d.engageRange;
  if (dist > range * CLOSE_FACTOR) return { x: ux, y: uy, speed: 1 };

  // Inside range, hold the firing bearing. Ships have no reverse thrust; turning away
  // to open the range would show the stern and mask the bow guns.
  // Choose a heading that puts the target at bearing b.
  const bx = d.bearingX;
  let by = d.bearingY;
  if (by !== 0 && isMirrorEqual(d.dpsByBearing, d.bearingDeg)) {
    // Keep the target on whichever side it already is, rather than swinging across.
    const lateral = uy * w.hx[i] - ux * w.hy[i];
    if ((lateral > 0) !== (by > 0)) by = -by;
  }
  // Line ships hold station; strike ships keep their speed up while they circle.
  const holdSpeed = d.design.doctrine.role === 'strike' ? 1 : 0.5;
  return { x: bx * ux + by * uy, y: bx * uy - by * ux, speed: holdSpeed };
}

function isMirrorEqual(dps: number[], bearingDeg: number): boolean {
  const n = dps.length;
  const k = (((bearingDeg / 30) % n) + n) % n;
  const mirror = (n - k) % n;
  return dps[mirror] >= dps[k] - 1e-9;
}

function separation(w: World, i: number): { x: number; y: number } {
  const g = w.grid;
  const ri = w.designs[w.design[i]].hull.radius;
  let sx = 0;
  let sy = 0;
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
        const dx = w.x[i] - w.x[j];
        const dy = w.y[i] - w.y[j];
        const d2 = dx * dx + dy * dy;
        const touch = ri + w.designs[w.design[j]].hull.radius;
        const keep = touch * 1.8;
        if (d2 >= keep * keep || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (keep - d) / keep;
        sx += (dx / d) * push;
        sy += (dy / d) * push;
        if (d < touch) {
          // Hard collision: this unit moves half the overlap; the other moves the rest.
          const overlap = (touch - d) * 0.5;
          w.corrX[i] += (dx / d) * overlap;
          w.corrY[i] += (dy / d) * overlap;
        }
      }
    }
  }
  return { x: sx, y: sy };
}

function edgePush(w: World, i: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (w.x[i] < EDGE_MARGIN) x += (EDGE_MARGIN - w.x[i]) / EDGE_MARGIN;
  if (w.x[i] > w.width - EDGE_MARGIN) x -= (w.x[i] - (w.width - EDGE_MARGIN)) / EDGE_MARGIN;
  if (w.y[i] < EDGE_MARGIN) y += (EDGE_MARGIN - w.y[i]) / EDGE_MARGIN;
  if (w.y[i] > w.height - EDGE_MARGIN) y -= (w.y[i] - (w.height - EDGE_MARGIN)) / EDGE_MARGIN;
  return { x, y };
}

function turnToward(w: World, i: number, dx: number, dy: number): void {
  const hx = w.hx[i];
  const hy = w.hy[i];
  const tc = w.turnCos[i];
  if (hx * dx + hy * dy >= tc) {
    w.nextHx[i] = dx;
    w.nextHy[i] = dy;
    return;
  }
  const ts = hx * dy - hy * dx >= 0 ? w.turnSin[i] : -w.turnSin[i];
  const nx = hx * tc - hy * ts;
  const ny = hx * ts + hy * tc;
  const len = Math.sqrt(nx * nx + ny * ny);
  w.nextHx[i] = nx / len;
  w.nextHy[i] = ny / len;
}

/** Apply every unit's decided heading and speed, then collision corrections. */
export function move(w: World): void {
  for (let i = 0; i < w.count; i++) {
    if (w.status[i] > CRIPPLED) continue;
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

/** Withdrawing units that clear their own edge have escaped. */
export function checkEscapes(w: World): void {
  for (let i = 0; i < w.count; i++) {
    if (w.status[i] !== WITHDRAWING) continue;
    const out = w.side[i] === 0 ? w.x[i] < -ESCAPE_DISTANCE : w.x[i] > w.width + ESCAPE_DISTANCE;
    if (out) {
      w.status[i] = ESCAPED;
      w.stats.fateTick[i] = w.tick;
    }
  }
}
