import { HULL_BY_ID } from '../content/hulls.ts';
import { HULL_CLASSES, type Design } from '../content/types.ts';
import type { ShipPlacement } from './battle.ts';

export interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface FleetOrder {
  design: Design;
  count: number;
}

/**
 * Place a fleet in its zone: heavy hulls at the back, each class in its own
 * block of columns, rows centred. Deterministic, so check battles can use it.
 */
export function autoDeploy(orders: FleetOrder[], zone: Zone, side: 0 | 1): ShipPlacement[] {
  const ships = orders.flatMap((o) => Array.from({ length: o.count }, () => o.design));
  const clsOf = (d: Design): number => HULL_CLASSES.indexOf(HULL_BY_ID.get(d.hull)!.cls);
  const byClass = [2, 1, 0].map((c) => ships.filter((d) => clsOf(d) === c));

  const back = side === 0 ? zone.x0 : zone.x1;
  const dir = side === 0 ? 1 : -1;
  const midY = (zone.y0 + zone.y1) / 2;
  const height = zone.y1 - zone.y0;
  const out: ShipPlacement[] = [];
  let depth = 0;

  for (const group of byClass) {
    if (group.length === 0) continue;
    const radius = Math.max(...group.map((d) => HULL_BY_ID.get(d.hull)!.radius));
    const spacing = radius * 2.6;
    const perCol = Math.max(1, Math.floor(height / spacing));
    const cols = Math.ceil(group.length / perCol);
    for (let k = 0; k < group.length; k++) {
      const col = Math.floor(k / perCol);
      const row = k % perCol;
      const rowsInCol = Math.min(perCol, group.length - col * perCol);
      const x = back + dir * (depth + col * spacing + spacing / 2);
      const y = midY + (row - (rowsInCol - 1) / 2) * spacing;
      out.push({ design: group[k].id, x: clampTo(x, zone.x0, zone.x1), y });
    }
    depth += cols * spacing;
  }
  return out;
}

function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
