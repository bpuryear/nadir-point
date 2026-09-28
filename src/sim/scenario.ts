import { CLASSES, CLASS_CRUISER, CLASS_DESTROYER, CLASS_FRIGATE } from './classes.ts';
import { TICK_HZ } from './constants.ts';
import { nextFloat, nextRange } from './rng.ts';
import { addUnit, createWorld, SIDE_A, SIDE_B, type World } from './world.ts';

export const TEST_MAP_W = 8000;
export const TEST_MAP_H = 5000;
const SPACING = 115;
const ZONE_DEPTH = 1400;

/** The M0 test battle: two fleets of placeholder hulls, deployed in facing zones. */
export function createTestBattle(seed: number, perSide = 250, maxSeconds = 600): World {
  const w = createWorld(perSide * 2, TEST_MAP_W, TEST_MAP_H, seed, maxSeconds * TICK_HZ);
  deploy(w, SIDE_A, perSide);
  deploy(w, SIDE_B, perSide);
  return w;
}

function rollClass(w: World): number {
  const r = nextFloat(w.rng);
  return r < 0.6 ? CLASS_FRIGATE : r < 0.9 ? CLASS_DESTROYER : CLASS_CRUISER;
}

function deploy(w: World, side: number, n: number): void {
  const classes: number[] = [];
  for (let k = 0; k < n; k++) classes.push(rollClass(w));
  // Heavy hulls deploy at the back of the zone.
  classes.sort((a, b) => b - a);

  const rows = Math.max(1, Math.floor((w.height - 1200) / SPACING));
  const facing = side === SIDE_A ? 1 : -1;
  const backX = side === SIDE_A ? 500 : w.width - 500;
  for (let k = 0; k < n; k++) {
    const col = Math.floor(k / rows);
    const row = k % rows;
    const depth = Math.min(col * SPACING, ZONE_DEPTH);
    const x = backX + facing * depth + nextRange(w.rng, -20, 20);
    const y = w.height / 2 + (row - rows / 2) * SPACING + nextRange(w.rng, -25, 25);
    const cls = classes[k];
    addUnit(w, side, cls, x, y, facing, 0, CLASSES[cls].hp);
  }
}
