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
import { moduleVolume } from '../sim/meta/cargo.js';
import { C, F, TRACK, factionInk, fmtMass, fmtPct } from './theme.js';

export const ROW_H = 54;

/** m3, printed the way hold.js prints it. One vocabulary for one quantity. */
const fmtM3 = (v) => `${(Math.round(v * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m3`;

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

  /**
   * VOLUME, NOT SLOTS — the last of three places that had not been converted.
   *
   * `reference-ui-language.md:114` names slots-versus-volume explicitly as a thing to
   * change, and `hold.js:4-11` claims it WAS changed. It was changed in two of three
   * places: the always-on strip (`hud.js`) and the HOLD window both print cubic metres
   * off `world.systems.cargo`, and this panel still read `salvage.cargoCapacity ?? 6`,
   * printed `4/6` and drew `EMPTY CRADLE` placeholders. This is the screen where "what
   * do I leave behind" is actually decided, and it was the one still lying — two
   * screens showing contradictory numbers for the same hold is worse than either
   * number alone.
   *
   * `cargo` is the authority when it is installed; the slot count remains only as a
   * pre-cargo fallback, because this panel boots before the progression layer does.
   */
  get cargo() { return this.world.systems?.cargo ?? null; }
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
    const cargo = this.cargo;
    const capM3 = cargo ? Math.max(1, cargo.capacityM3) : 0;
    const usedM3 = cargo ? cargo.usedM3() : 0;
    const full = cargo ? usedM3 / capM3 >= 0.995 : items.length >= 6;

    P.label('SALVAGE HOLD', x, y, { color: C.inkDim });
    P.text(cargo ? `${fmtM3(usedM3)} / ${fmtM3(capM3)}` : `${items.length}/6`, x + w, y, {
      font: F.bodyBold, color: full ? C.warn : C.ink, align: 'right',
    });
    P.hline(x, y + 5, w, C.rule);
    let cy = y + 12;

    if (!items.length) {
      P.text('HOLD EMPTY', x, cy + 16, { font: F.small, color: C.inkFaint, track: TRACK.label });
      P.text('CUT SECTIONS OFF A HULK TO FILL IT', x, cy + 30,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
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

      /**
       * BOTH LINES LAID OUT FROM THE RIGHT, at measured widths.
       *
       * The comment this replaces was correct about the danger and wrong about the
       * cure: a "fixed four-column grid" at +84 / +168 / +178 / +250 is a fixed offset,
       * and the moment the row gained the composite half of the scrap value and a
       * volume figure the fixed columns met in the middle. Measuring from the right and
       * clipping the name to what remains is the discipline `panels.js#columns` exists
       * to enforce, and nothing can then be pushed into anything else.
       */
      const v = scrapValue(item);
      const volStr = cargo ? fmtM3(moduleVolume(def)) : '';
      const scrapStr = `↓${v.alloy} AL · ${v.composite} CO`;
      const scrapW = P.measure(scrapStr, F.micro, TRACK.value) + 8;
      const pctW = P.measure('100%', F.micro, TRACK.value) + 8;
      const barW = 52;
      const massW = P.measure('999.9 KT', F.micro, TRACK.value) + 8;
      const volW = volStr ? P.measure(volStr, F.micro, TRACK.value) + 8 : 0;
      const tier = def?.tier ?? 1;

      const name = (def?.name ?? item.moduleId).toUpperCase();
      P.text(clip(P, name, F.bodyBold, w - volW - tier * 7 - 24), x + 9, cy + 14,
        { font: F.bodyBold, color: sel ? C.inkStrong : C.ink });
      // What this part costs to carry, in the same unit as the header, with the tier
      // pips moved clear of it rather than stacked on the same six pixels.
      if (volStr) {
        P.text(volStr, x + w, cy + 14, { font: F.micro, color: C.inkFaint, align: 'right' });
      }
      P.pips(x + w - volW - 3 - tier * 7, cy + 6, 3, tier,
        { size: 4, gap: 3, color: C.ink, empty: C.track });

      /**
       * THREE LINES, NOT TWO. The arithmetic decides this, not taste: origin (70) +
       * mount (66) + mass (56) + condition bar (40) + percentage (34) + both halves of
       * the scrap value (100) is 366 px of content in a 330 px column. Squeezing six
       * lanes into two lines is what produced `C…PORT` and `D…DORS…` — a faction name
       * clipped to one letter in the panel whose entire first job, per this file's own
       * header, is to make the part's origin visible.
       */
      const hpW = P.measure('STARBOARD', F.micro, TRACK.label) + 10;
      const colHp = w - massW - hpW;
      P.text(fi.name.toUpperCase(), x + 9, cy + 26,
        { font: F.micro, color: fi.hue, track: TRACK.label, maxW: Math.max(24, colHp - 15) });
      P.label(def?.hardpoint ?? '?', x + colHp, cy + 26, { color: C.inkFaint, maxW: hpW });
      P.text(fmtMass(def?.mass ?? 0), x + w, cy + 26,
        { font: F.micro, color: C.inkFaint, align: 'right' });

      const cond = item.condition ?? 1;
      P.bar(x + 9, cy + 34, barW, 4, cond, { color: cond < 0.5 ? C.warn : C.inkDim, track: C.track });
      P.text(fmtPct(cond), x + 9 + barW + pctW, cy + 38,
        { font: F.micro, color: C.inkFaint, align: 'right' });
      // BOTH halves of the scrap value. `scrapValue` returns alloy AND composite and
      // the row printed only the alloy, so the trade the player is being asked to
      // judge was quoted at about three-quarters of what it actually pays.
      P.text(scrapStr, x + w, cy + 38,
        { font: F.micro, color: C.salvageDim, align: 'right', maxW: Math.max(40, scrapW) });

      if (hit) {
        hit.push({ kind: 'inventory', uid: item.uid, x: x - 8, y: cy, w: w + 16, h: ROW_H - 4 });
      }
      cy += ROW_H;
    }

    // The free volume, which is what an `EMPTY CRADLE` placeholder was standing in for.
    // A physical space with a limit is still legible as m3 — more legible, in fact,
    // because "two cradles left" and "18 m3 left" are different answers to "will the
    // next thing fit" and only one of them is true.
    if (cargo) {
      P.frame(x, cy + 4, w, 18, C.ruleDim);
      P.label('FREE', x + 9, cy + 17, { color: C.inkFaint });
      P.text(fmtM3(Math.max(0, capM3 - usedM3)), x + w - 8, cy + 17,
        { font: F.micro, color: full ? C.warn : C.inkDim, align: 'right' });
      cy += 26;
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
