import { damageControl, resolveHits } from './damage.ts';
import { rebuildGrid } from './grid.ts';
import { checkEscapes, move, steer } from './movement.ts';
import { acquireTarget } from './targeting.ts';
import { fireWeapons } from './weapons.ts';
import { ACTIVE, DESTROYED, WINNER_DRAW, WITHDRAWING, type World } from './world.ts';

/** A side breaks when its combat-ready value falls below this fraction of what it deployed. */
export const BREAK_FRACTION = 0.4;

/**
 * Advance the battle by one fixed tick.
 *
 * 1. Decide: every unit picks targets, a heading and its shots from start-of-tick state.
 * 2. Move: all units move together.
 * 3. Resolve: hits land, modules fail, reactors breach.
 * 4. Repair, then check for broken fleets and the end of the battle.
 *
 * Unit index order therefore cannot favour either side.
 */
export function step(w: World): void {
  if (w.ended) return;
  w.events.length = 0;
  w.targetPrev.set(w.target);
  rebuildGrid(w.grid, w.count, presentMask(w), w.x, w.y);

  for (let i = 0; i < w.count; i++) {
    if (w.status[i] >= DESTROYED) continue;
    acquireTarget(w, i);
    steer(w, i);
    fireWeapons(w, i);
  }

  move(w);
  checkEscapes(w);
  resolveHits(w);
  damageControl(w);
  w.tick++;
  updateMorale(w);
  checkEnd(w);
}

/** Grid membership: everything still on the map, including drifting wrecks. */
function presentMask(w: World): Uint8Array {
  for (let i = 0; i < w.count; i++) w.present[i] = w.status[i] < DESTROYED ? 1 : 0;
  return w.present;
}

function updateMorale(w: World): void {
  w.activeValue[0] = 0;
  w.activeValue[1] = 0;
  for (let i = 0; i < w.count; i++) {
    if (w.status[i] === ACTIVE) w.activeValue[w.side[i]] += w.designs[w.design[i]].cost;
  }
  for (let s = 0; s < 2; s++) {
    if (w.broken[s] || w.activeValue[s] >= BREAK_FRACTION * w.deployedValue[s]) continue;
    w.broken[s] = 1;
    for (let i = 0; i < w.count; i++) if (w.side[i] === s && w.status[i] === ACTIVE) w.status[i] = WITHDRAWING;
  }
}

function onField(w: World, side: number): number {
  let n = 0;
  for (let i = 0; i < w.count; i++) {
    const s = w.status[i];
    if (w.side[i] === side && (s === ACTIVE || s === WITHDRAWING)) n++;
  }
  return n;
}

function checkEnd(w: World): void {
  const a = onField(w, 0);
  const b = onField(w, 1);
  if (a > 0 && b > 0 && w.tick < w.maxTicks) return;
  w.ended = true;
  w.winner = holder(w, a, b);
}

/** Which side holds the field. docs/design/m1-rules.md §7. */
function holder(w: World, a: number, b: number): number {
  const brokeA = w.broken[0] === 1;
  const brokeB = w.broken[1] === 1;
  if (brokeA !== brokeB) return brokeA ? 1 : 0;
  if (a === 0 && b > 0) return 1;
  if (b === 0 && a > 0) return 0;
  const fa = w.activeValue[0] / w.deployedValue[0];
  const fb = w.activeValue[1] / w.deployedValue[1];
  if (fa === fb) return WINNER_DRAW;
  return fa > fb ? 0 : 1;
}
