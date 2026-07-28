/**
 * THE SALVAGE HOLD.
 *
 * Salvage yields PARTS, not currency. There is no market and nothing to sell to, so
 * this list is not a shop inventory - it is the physical contents of the ventral
 * cradle, and every row is a thing that came off a specific hull.
 *
 * Two jobs:
 *
 *   1. MAKE THE PART'S ORIGIN VISIBLE. A Coalition cannon bank must look like a
 *     Coalition cannon bank in the list, because the entire progression fantasy is
 *     that you can see where your ship came from. That is the one place in this
 *     interface where a faction hue is allowed, and it is spent here.
 *
 *   2. MAKE SCRAPPING AN HONEST TRADE. `SalvageSystem.scrapInventoryItem` turns a
 *      part into `mass * 0.4 * condition` alloy and 35 % of that in composite. The
 *      row shows exactly that number before the player commits, because repairs are
 *      priced in materials and the choice between "install it" and "melt it" is the
 *      whole economy.
 */

import { getModule } from '../core/contracts.js';
import { C, F, TRACK, factionInk, fmtMass, fmtPct } from './theme.js';

export const ROW_H = 42;

/** What `scrapInventoryItem` will actually pay, computed the same way it does. */
export function scrapValue(item) {
  const def = getModule(item.moduleId);
  const alloy = Math.round((def?.mass ?? 200) * 0.4 * (item.condition ?? 1));
  return { alloy, composite: Math.round(alloy * 0.35) };
}

export class InventoryPanel {
  constructor(ui) {
    this.ui = ui;
    this.world = ui.world;
  }

  get capacity() { return this.world.systems?.salvage?.cargoCapacity ?? 6; }
  get items() { return this.world.inventory ?? []; }

  /**
   * @param {import('./theme.js').Painter} P
   * @param {number} x @param {number} y @param {number} w
   * @param {Object} opts { selectedUid, hoverUid, hit, compact }
   * @returns {number} the y below the list
   */
  draw(P, x, y, w, opts = {}) {
    const { selectedUid = null, hoverUid = null, hit = null } = opts;
    const items = this.items;
    const cap = this.capacity;

    P.label('SALVAGE HOLD', x, y, { color: C.inkDim });
    P.text(`${items.length}/${cap}`, x + w, y, {
      font: F.bodyBold, color: items.length >= cap ? C.warn : C.ink, align: 'right',
    });
    P.hline(x, y + 5, w, C.rule);
    let cy = y + 12;

    if (!items.length) {
      P.text('HOLD EMPTY', x, cy + 16, { font: F.small, color: C.inkGhost, track: TRACK.label });
      P.text('CUT SECTIONS OFF A HULK TO FILL IT', x, cy + 30,
        { font: F.micro, color: C.inkGhost, track: TRACK.label });
      return cy + 44;
    }

    for (const item of items) {
      const def = getModule(item.moduleId);
      const fi = factionInk(def?.faction ?? 'player');
      const sel = item.uid === selectedUid;
      const hov = item.uid === hoverUid;

      if (sel) {
        P.fill(x - 8, cy, w + 16, ROW_H - 4, C.scrimHard);
        P.fill(x - 8, cy, 3, ROW_H - 4, C.select);
        P.frame(x - 8, cy, w + 16, ROW_H - 4, C.ruleBright);
      } else if (hov) {
        P.fill(x - 8, cy, w + 16, ROW_H - 4, C.scrimSoft);
      }

      // The identity stripe. Full row height, two pixels, faction emissive.
      P.fill(x, cy + 4, 2, ROW_H - 14, fi.stripe);

      const name = (def?.name ?? item.moduleId).toUpperCase();
      P.text(clip(P, name, F.bodyBold, w - 46), x + 9, cy + 14,
        { font: F.bodyBold, color: sel ? C.inkStrong : C.ink });

      // Tier pips, right-aligned on the first line.
      const tier = def?.tier ?? 1;
      P.pips(x + w - 3 - tier * 7, cy + 6, 3, tier, { size: 4, gap: 3, color: C.ink, empty: C.inkGhost });

      // Line two is a fixed four-column grid, because a variable-width faction name
      // followed by a variable-width mass will always eventually collide with the
      // condition bar, and the day it does is the day the hold becomes unreadable.
      P.text(fi.name.toUpperCase(), x + 9, cy + 26, { font: F.micro, color: fi.hue, track: TRACK.label });
      P.label(def?.hardpoint ?? '?', x + 84, cy + 26, { color: C.inkFaint });
      P.text(fmtMass(def?.mass ?? 0), x + 168, cy + 26, { font: F.micro, color: C.inkFaint, align: 'right' });

      const cond = item.condition ?? 1;
      P.bar(x + 178, cy + 20, 40, 4, cond, { color: cond < 0.5 ? C.warn : C.inkDim, track: C.inkGhost });
      P.text(fmtPct(cond), x + 250, cy + 26, { font: F.micro, color: C.inkFaint, align: 'right' });

      const v = scrapValue(item);
      P.text(`↓${v.alloy} AL`, x + w, cy + 26, { font: F.micro, color: C.salvageDim, align: 'right' });

      if (hit) {
        hit.push({ kind: 'inventory', uid: item.uid, x: x - 8, y: cy, w: w + 16, h: ROW_H - 4 });
      }
      cy += ROW_H;
    }

    // Empty slots, so the hold reads as a physical space with a limit.
    for (let i = items.length; i < cap; i++) {
      P.frame(x, cy + 4, w, ROW_H - 14, C.ruleDim);
      P.label('EMPTY CRADLE', x + 9, cy + 18, { color: C.inkGhost });
      cy += ROW_H * 0.55;
    }

    return cy;
  }

  /** Break a part down. Returns the materials gained, or null. */
  scrap(uid) {
    const salvage = this.world.systems?.salvage;
    const item = this.items.find((i) => i.uid === uid);
    if (!salvage || !item) return null;
    const v = scrapValue(item);
    const ok = salvage.scrapInventoryItem(uid);
    return ok ? v : null;
  }
}

function clip(P, str, font, maxW) {
  if (P.measure(str, font, TRACK.value) <= maxW) return str;
  let s = str;
  while (s.length > 1 && P.measure(`${s}…`, font, TRACK.value) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
