import { DT } from './constants.ts';
import type { CompiledDesign } from './design.ts';
import { ACTIVE, CRIPPLED, ESCAPED, WITHDRAWING, type World } from './world.ts';

// Decide a heading and speed for each unit from start-of-tick state; move all
// units afterwards. docs/design/m1-rules.md §6.

const EDGE_MARGIN = 400;
const ESCAPE_DISTANCE = 200;
const CLOSE_FACTOR = 1.15;
/** Line ships stop at this fraction of engagement range. */
const LINE_STANDOFF = 0.9;
const LINE_HOLD_SPEED = 0.5;
/** A bearing whose cosine exceeds this closes the range when the ship moves. */
const CLOSING_BEARING = 0.3;
/** Strike ships break off an attack run inside this fraction of engagement range... */
const BREAK_FACTOR = 0.6;
/** ...and turn back for the next run beyond this one. */
const EXTEND_FACTOR = 1.3;
/** While breaking off, the target sits 150° off the bow. */
const BREAK_X = -0.8660254037844386;
const BREAK_Y = 0.5;
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
  return d.design.doctrine.role === 'strike' ? planRun(w, i, d, dist, ux, uy) : planHold(w, i, d, dist, ux, uy);
}

/**
 * Line ships close to engagement range and hold there on the firing bearing. Ships
 * have no reverse thrust, so they brake early enough to stop at the standoff
 * distance instead of turning away and showing the stern.
 */
function planHold(w: World, i: number, d: CompiledDesign, dist: number, ux: number, uy: number): Plan {
  const range = d.engageRange;
  const max = w.maxSpeed[i];
  const brake = max > 0 ? Math.sqrt(2 * w.accel[i] * Math.max(0, dist - range * LINE_STANDOFF)) / max : 0;
  if (dist > range * CLOSE_FACTOR) return { x: ux, y: uy, speed: Math.min(1, brake) };
  const b = bearingToward(w, i, d.bearingX, d.bearingY, ux, uy, firesBothSides(d));
  // A bearing that closes the range brakes to a stop; a broadside bearing circles.
  const speed = d.bearingX > CLOSING_BEARING ? Math.min(LINE_HOLD_SPEED, brake) : LINE_HOLD_SPEED;
  return { x: b.x, y: b.y, speed };
}

/**
 * Strike ships make attack runs: in on the strafe bearing at full speed, break off
 * before they reach the target, extend, then turn back for the next run.
 */
function planRun(w: World, i: number, d: CompiledDesign, dist: number, ux: number, uy: number): Plan {
  const range = d.engageRange;
  if (w.run[i] === 0 && dist < range * BREAK_FACTOR) w.run[i] = 1;
  else if (w.run[i] === 1 && dist > range * EXTEND_FACTOR) w.run[i] = 0;
  if (w.run[i] === 1) {
    const b = bearingToward(w, i, BREAK_X, BREAK_Y, ux, uy, true);
    return { x: b.x, y: b.y, speed: 1 };
  }
  if (dist > range * CLOSE_FACTOR) return { x: ux, y: uy, speed: 1 };
  const b = bearingToward(w, i, d.bearingX, d.bearingY, ux, uy, firesBothSides(d));
  return { x: b.x, y: b.y, speed: 1 };
}

/**
 * The heading that puts the target at bearing (bx, by). With keepSide, the target
 * stays on the side it is already on, rather than the ship swinging across.
 */
function bearingToward(w: World, i: number, bx: number, by: number, ux: number, uy: number, keepSide: boolean): { x: number; y: number } {
  if (by !== 0 && keepSide) {
    const lateral = uy * w.hx[i] - ux * w.hy[i];
    if ((lateral > 0) !== (by > 0)) by = -by;
  }
  return { x: bx * ux + by * uy, y: bx * uy - by * ux };
}

/** True when the design fires as well at the mirror of its bearing as at the bearing. */
function firesBothSides(d: CompiledDesign): boolean {
  const dps = d.dpsByBearing;
  const n = dps.length;
  const k = (((d.bearingDeg / 30) % n) + n) % n;
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
