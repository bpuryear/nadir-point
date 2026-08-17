/**
 * Hull plus installed modules, flattened to one buffer.
 *
 * This is the function the refit screen calls on every install, and the one the
 * rotation baker consumes. It is also where the game's central promise either
 * holds or does not: three loadouts of the same cruiser have to be tellable
 * apart by outline alone, which is only true if every module reaches past the
 * hull edge and the canvas grows to let it.
 *
 * The canvas is recomputed from the union of the hull and every module's placed
 * bounds. Cropping to the hull would silently clip exactly the overhang that
 * makes an upgrade visible.
 */

import {
  blit, createBuf, opaqueBounds, type PixBuf,
} from './pixbuf.js';
import type { HardpointId, Hull } from './hull.js';
import type { ModuleSprite } from './module.js';

export type Loadout = { readonly [K in HardpointId]?: ModuleSprite };

export interface CompositeShip {
  buf: PixBuf;
  /** Where the hull's centreline sits in the composited buffer. */
  centreX: number;
  centreY: number;
  hull: Hull;
  installed: readonly HardpointId[];
}

/**
 * Draw order. The ventral bay hangs under the hull, so it goes down first and
 * the hull covers its inboard edge; everything else bolts on over the plating.
 */
export const Z_ORDER: readonly HardpointId[] = [
  'ventral', 'bow', 'dorsal', 'port', 'starboard', 'engine',
];

interface Placement {
  sprite: ModuleSprite;
  /** Top-left corner of the module in hull coordinates. */
  x: number;
  y: number;
}

export function compositeShip(hull: Hull, loadout: Loadout): CompositeShip {
  const placements: Placement[] = [];
  const installed: HardpointId[] = [];

  for (const id of Z_ORDER) {
    const sprite = loadout[id];
    if (sprite === undefined) continue;

    const hp = hull.hardpoints[id];
    placements.push({
      sprite,
      x: hp.x - sprite.anchorX,
      y: hp.y - sprite.anchorY,
    });
    installed.push(id);
  }

  // Union bounds in hull coordinates, so nothing gets clipped.
  let minX = 0, minY = 0, maxX = hull.buf.w - 1, maxY = hull.buf.h - 1;
  for (const p of placements) {
    const b = opaqueBounds(p.sprite.buf);
    if (b === null) continue;
    minX = Math.min(minX, p.x + b.x0);
    minY = Math.min(minY, p.y + b.y0);
    maxX = Math.max(maxX, p.x + b.x1);
    maxY = Math.max(maxY, p.y + b.y1);
  }

  const offsetX = -minX;
  const offsetY = -minY;
  const buf = createBuf(maxX - minX + 1, maxY - minY + 1);

  // Ventral goes under the hull; the rest go over it.
  for (const p of placements) {
    if (p.sprite.def.hardpoint !== 'ventral') continue;
    blit(buf, p.sprite.buf, p.x + offsetX, p.y + offsetY);
  }

  blit(buf, hull.buf, offsetX, offsetY);

  for (const p of placements) {
    if (p.sprite.def.hardpoint === 'ventral') continue;
    blit(buf, p.sprite.buf, p.x + offsetX, p.y + offsetY);
  }

  return {
    buf,
    centreX: hull.centreX + offsetX,
    centreY: Math.floor(hull.buf.h / 2) + offsetY,
    hull,
    installed: installed.sort(),
  };
}

/**
 * A stable fingerprint of the outline, ignoring colour entirely.
 *
 * Encodes the opaque/transparent mask as a run-length string. Used by the tests
 * that enforce "every module changes the silhouette" and by the contact sheet's
 * loadout comparison — both of which are asking about shape, not paint.
 */
export function silhouetteKey(buf: PixBuf): string {
  const runs: number[] = [];
  let current = false;
  let run = 0;

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const opaque = buf.data[(y * buf.w + x) * 4 + 3]! !== 0;
      if (opaque === current) {
        run++;
      } else {
        runs.push(run);
        current = opaque;
        run = 1;
      }
    }
  }
  runs.push(run);

  return `${buf.w}x${buf.h}:${runs.join('.')}`;
}
