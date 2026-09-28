import type { Criterion } from '../content/types.ts';
import { ACTIVE, CRIPPLED, REASON_NEAREST, REASON_NONE, WITHDRAWING, type World } from './world.ts';

// Ship-level target choice. docs/design/m1-rules.md §6.

export const RETARGET_TICKS = 30;
const LINE_SEARCH_FACTOR = 2.5;

/** Keep the current target unless it is gone or the re-check is due. */
export function acquireTarget(w: World, i: number): void {
  if (w.status[i] !== ACTIVE) {
    w.target[i] = -1;
    w.targetReason[i] = REASON_NONE;
    return;
  }
  const t = w.target[i];
  const due = --w.retarget[i] <= 0;
  if (t >= 0 && canStillTarget(w, i, t) && !due) return;
  if (due) w.retarget[i] = RETARGET_TICKS;
  pickTarget(w, i);
}

function canStillTarget(w: World, i: number, t: number): boolean {
  const s = w.status[t];
  if (s === ACTIVE || s === WITHDRAWING) return true;
  return s === CRIPPLED && w.designs[w.design[i]].design.doctrine.priority.includes('crippled');
}

function pickTarget(w: World, i: number): void {
  const d = w.designs[w.design[i]];
  const doctrine = d.design.doctrine;
  const reach = doctrine.role === 'strike' ? Infinity : d.engageRange * LINE_SEARCH_FACTOR;
  const reach2 = reach * reach;
  const wantsCrippled = doctrine.priority.includes('crippled');

  for (let c = 0; c < doctrine.priority.length; c++) {
    const t = nearestMatching(w, i, doctrine.priority[c], reach2, wantsCrippled);
    if (t >= 0) {
      w.target[i] = t;
      w.targetReason[i] = c;
      return;
    }
  }
  const t = nearestMatching(w, i, null, Infinity, false);
  w.target[i] = t;
  w.targetReason[i] = t >= 0 ? REASON_NEAREST : REASON_NONE;
}

function nearestMatching(w: World, i: number, criterion: Criterion | null, maxD2: number, allowCrippled: boolean): number {
  const enemy = 1 - w.side[i];
  let best = -1;
  let bestD2 = maxD2;
  for (let j = 0; j < w.count; j++) {
    if (w.side[j] !== enemy) continue;
    const s = w.status[j];
    const targetable = s === ACTIVE || s === WITHDRAWING || (allowCrippled && s === CRIPPLED);
    if (!targetable) continue;
    if (criterion !== null && !matches(w, i, j, criterion)) continue;
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

export function matches(w: World, i: number, j: number, c: Criterion): boolean {
  switch (c) {
    case 'frigate':
      return w.designs[w.design[j]].cls === 0;
    case 'destroyer':
      return w.designs[w.design[j]].cls === 1;
    case 'cruiser':
      return w.designs[w.design[j]].cls === 2;
    case 'crippled':
      return w.status[j] === CRIPPLED;
    case 'threat':
      return w.targetPrev[j] === i;
    case 'armourBroken': {
      const plan = w.designs[w.design[j]].design.armour;
      for (let f = 0; f < 4; f++) if (plan[f] > 0 && w.armour[j * 4 + f] <= 0) return true;
      return false;
    }
  }
}
