/**
 * HULL PERKS, AND THE PATTERNS THAT KNOWLEDGE BUYS.
 *
 * `docs/design/scope-decision.md` is precise: progression attaches to the SHIP, never to
 * a separate character sheet. There is no pilot, no XP and no level anywhere in this
 * panel — what there is, is one specific cruiser accumulating work that was paid for in
 * materials that could have been repairs.
 *
 * The two currencies are the whole design and the panel is laid out around them:
 *
 *   MATERIALS decide whether you can AFFORD it. Every rank competes directly with hull
 *             repair, mount repair, pattern rebuilds and device fabrication for the same
 *             four pools, so the cost is drawn beside a live shortfall rather than as a
 *             price tag you discover you cannot pay after clicking.
 *
 *   KNOWLEDGE decides whether it is OFFERED. `PerkSystem.unlocked` reads the codex, so a
 *             locked perk is drawn with its gate as a PROGRESS BAR — `3 of 5 modules
 *             installed` — not as a grey row with a padlock. A gate you can see yourself
 *             closing is a goal; a gate you cannot is a wall.
 *
 * PATTERNS share the panel because they are the other thing knowledge converts into: a
 * pattern turns "the RNG will not give me that part" from a luck problem into a
 * materials problem, and the rebuild cost belongs beside the perk costs it competes with.
 */

import { MEV } from '../sim/meta/events.js';
import { C, F, TRACK, factionInk } from './theme.js';
import { moduleName } from './names.js';
import { Panel, PAD, tableHead, rowBack } from './panels.js';

/**
 * THE STATUS LANE.
 *
 * Every row in this panel ends in a chip — BUY, SHORT, AT MAXIMUM, a gate fraction —
 * and the chip used to be drawn from the right edge ON TOP of whatever the row had
 * already written there. `BOARDING CHARGE 22 ALLO 10 COMP 8 ELE[C]` lost its last
 * glyph to an AFFORDABLE chip that way. The lane is measured once from the widest
 * chip the panel can emit and every other column is laid out inside what is left.
 */
const CHIP_FLOOR = ['AT MAXIMUM', 'BUILD', 'LOCKED'];
/**
 * …AND THE WIDEST CHIP IS MEASURED FROM THE REAL STRINGS, not from four samples.
 *
 * It used to measure `['AT MAXIMUM', 'SHORT 999 ELEC', 'BUY · 160 ALLO · 55 COMP',
 * 'BUILD']`, which is a fixed column offset wearing a measurement's clothes — the same
 * failure mode the paragraph above says this lane exists to end. The real strings
 * outgrew the samples and the panel clipped the PRICE out of its own BUY button:
 * `BUY · 120 ALLO · 60 COMP · 3…`, `FIELD REFINERY +60% REFINING RATE AND +5% YIELD
 * PER …`, `4 MATERIAL ENTRIES AT SA…`. A buy button that does not show what it costs
 * is the one clipping case with a mechanical consequence.
 *
 * Capped at 46 % of the row: a lane wide enough for every possible cost string is a
 * lane with no room left for the perk's name, and a name is worth more than a
 * three-pool cost the player can also read off the chip once it is short.
 */
function statusLane(P, perks, patterns, w) {
  let out = 0;
  const take = (s) => { if (s) out = Math.max(out, P.measure(s, F.microBold, TRACK.label) + 10); };
  for (const s of CHIP_FLOOR) take(s);
  for (const p of perks ?? []) {
    if (p.gate && !p.gate.met) take(`${p.gate.have}/${p.gate.need}`);
    else if (p.affordable) take(`BUY · ${costText(p.cost)}`);
    else if (p.rank < p.maxRank) take(`SHORT ${costText(p.shortfall)}`);
  }
  for (const pt of patterns ?? []) {
    take(pt.affordable ? `BUILD · ${costText(pt.cost)}` : `SHORT ${costText(pt.shortfall)}`);
  }
  return Math.min(out, Math.round((w || 520) * 0.46));
}

export class PerksPanel extends Panel {
  constructor(ui) {
    super({
      id: 'perks',
      title: 'HULL · PERKS AND PATTERNS',
      hint: 'P',
      w: 556,
      h: 470,
      maxH: 640,
    });
    this.ui = ui;
    this.world = ui.world;
    this._perks = [];
    this._patterns = [];
    this._at = -1;
    this._dirty = true;
    this._offs = [
      ui.bus.on(MEV.PERK_PURCHASED, () => { this._dirty = true; }),
      ui.bus.on(MEV.PATTERN_LEARNED, () => { this._dirty = true; }),
      ui.bus.on(MEV.PATTERN_BUILT, () => { this._dirty = true; }),
      ui.bus.on(MEV.CARGO_CHANGED, () => { this._dirty = true; }),
      ui.bus.on(MEV.CODEX_UPDATED, () => { this._dirty = true; }),
    ];
  }

  onOpen() { this._dirty = true; }
  dispose() { for (const o of this._offs) o?.(); }

  _refresh(now) {
    if (!this._dirty && now - this._at < 0.5) return;
    this._at = now;
    this._dirty = false;
    this._perks = this.world.systems?.perks?.describe() ?? [];
    this._patterns = this.world.systems?.patterns?.describeKnown() ?? [];
  }

  drawBody(P, x, y, w, h, hit, clip) {
    if (!this.world.systems?.perks) {
      P.text('NO PROGRESSION LAYER', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }
    this._refresh(this.ui.time);

    // Two headings on one line, each clipped to its own half. They were drawn left and
    // right with nothing between them and met in the middle the moment the window was
    // clamped to the frame — the same failure the status lane below fixes for chips.
    let cy = y + 8;
    const half = Math.max(60, Math.round(w * 0.44));
    P.label('PERMANENT WORK ON THIS HULL', x, cy, { color: C.inkFaint, maxW: half });
    P.label('PAID FOR OUT OF THE SAME POOLS AS REPAIRS', x + w, cy,
      { color: C.inkFaint, align: 'right', maxW: w - half - 10 });
    P.hline(x, cy + 5, w, C.rule);
    cy += 16;

    for (const p of this._perks) {
      const rowH = 48;
      if (cy + rowH > clip.clipBottom) { this.hidden++; cy += rowH; continue; }
      if (cy + rowH < clip.clipTop) { cy += rowH; continue; }
      cy = this._drawPerk(P, x, cy, w, p, hit);
    }

    // --- patterns -----------------------------------------------------------
    cy += 10;
    P.label('PATTERNS HELD', x, cy, { color: C.inkFaint, maxW: Math.max(40, w * 0.3) });
    P.label('REBUILDS COME OUT AT 85% — FINDING ONE IS STILL BETTER',
      x + w, cy, { color: C.inkFaint, align: 'right', maxW: Math.round(w * 0.66) });
    P.hline(x, cy + 5, w, C.rule);
    cy += 15;
    const lane = statusLane(P, this._perks, this._patterns, w);
    const colMount = Math.max(150, w - lane - 190);
    const colCost = colMount + 52;
    cy = tableHead(P, x, cy, w, [['MODULE', 0], ['MOUNT', colMount], ['COST', colCost]]) + 14;

    if (!this._patterns.length) {
      P.text('NONE RECOVERED', x, cy, { font: F.small, color: C.inkFaint, track: TRACK.label });
      P.text('CUTTING AN INTACT SECTION SOMETIMES TEACHES ITS PATTERN', x, cy + 13,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
      cy += 28;
    }

    for (const r of this._patterns) {
      if (cy + 8 > clip.clipBottom) { this.hidden++; cy += 17; continue; }
      if (cy + 17 < clip.clipTop) { cy += 17; continue; }
      const fi = factionInk(r.faction);
      rowBack(P, x, cy - 11, w, 16, { selected: this.selected === r.moduleId });
      P.fill(x, cy - 10, 2, 14, fi.stripe);
      // The AUTHORED short name. `DERELICT BARRIER PYL…` told the player nothing.
      P.text(moduleName(r.moduleId), x + 6, cy,
        { font: F.small, color: r.buildable ? C.ink : C.inkDim, maxW: colMount - 12 });
      P.label(r.hardpoint, x + colMount, cy, { color: C.inkFaint });
      P.text(costText(r.cost), x + colCost, cy,
        { font: F.micro, color: r.affordable ? C.inkDim : C.inkFaint, maxW: w - lane - colCost - 10 });
      if (r.buildable) {
        P.chip('BUILD', x + w, cy - 11, { fill: C.ink, color: C.void, h: 14, align: 'right' });
      } else {
        // Inside the reserved lane, so a rejection reason can never be drawn through
        // the price it is refusing.
        P.chipOutline(P.clip(String(r.reason ?? 'BLOCKED').toUpperCase(), F.microBold, lane - 10),
          x + w, cy - 11, { color: C.warnDim, h: 14, align: 'right' });
      }
      if (hit) hit.push({ kind: 'perk:pattern', panel: this.id, moduleId: r.moduleId, x, y: cy - 11, w, h: 16 });
      cy += 17;
    }

    this.scrollMax = Math.max(0, (cy + 10) - y - (this.bodyH - PAD * 2));
    void h;
  }

  _drawPerk(P, x, y, w, p, hit) {
    const maxed = p.rank >= p.maxRank;
    const locked = !!(p.gate && !p.gate.met);
    const col = maxed ? C.inkDim : p.buyable ? C.inkStrong : locked ? C.inkDim : C.ink;
    const lane = statusLane(P, this._perks, this._patterns, w);
    const textW = w - lane - 20;

    rowBack(P, x, y, w, 46, { selected: this.selected === p.id });

    // Rank pips first: this hull has had this work done to it N times.
    P.pips(x, y + 7, p.maxRank, p.rank, {
      size: 6, gap: 3, color: maxed ? C.ink : C.inkDim, empty: C.track,
    });
    const nx = x + p.maxRank * 9 + 10;
    P.text(String(p.name).toUpperCase(), nx, y + 14, {
      font: F.bodyBold, color: col, track: TRACK.label, maxW: textW - (nx - x) });
    P.text(String(p.effect).toUpperCase(), nx, y + 27, {
      font: F.micro, color: C.inkFaint, track: TRACK.label, maxW: textW - (nx - x) });

    const rx = x + w;
    if (maxed) {
      P.chipOutline('AT MAXIMUM', rx, y + 5, { color: C.inkDim, h: 14, align: 'right' });
    } else if (locked) {
      // The gate as a progress bar. `3/5 MODULES INSTALLED` with a bar is a goal, not
      // a padlock — but the bar and its caption live INSIDE the lane, under the chip,
      // so neither can be drawn through the perk's own effect line.
      const g = p.gate;
      P.chipOutline(`${g.have}/${g.need}`, rx, y + 5, { color: C.warnDim, h: 14, align: 'right' });
      // Under the chip, inside the lane, and clear of the effect line's baseline.
      P.bar(rx - lane, y + 26, lane, 5, g.need > 0 ? g.have / g.need : 0,
        { color: C.warnDim, track: C.track, segments: Math.min(8, g.need) });
      P.text(String(g.text).toUpperCase(), rx, y + 42,
        { font: F.micro, color: C.inkFaint, align: 'right', track: TRACK.label, maxW: lane });
    } else if (p.affordable) {
      // Clipped AT THE TRACKING IT IS DRAWN AT — `P.clip` defaults to `TRACK.value`
      // 0.02em and the chip draws at `TRACK.label` 0.16em, so a string clipped to the
      // lane came out 16 % wider than the lane. theme.js:820-825 names the class.
      P.chip(P.clip(`BUY · ${costText(p.cost)}`, F.microBold, lane - 10, TRACK.label), rx, y + 5, {
        fill: C.ink, color: C.void, h: 14, align: 'right',
      });
    } else {
      P.chip(P.clip(`SHORT ${costText(p.shortfall)}`, F.microBold, lane - 10, TRACK.label), rx, y + 5, {
        fill: C.warn, color: C.void, h: 14, align: 'right',
      });
      P.text(costText(p.cost), rx, y + 32, {
        font: F.micro, color: C.inkFaint, align: 'right', maxW: lane });
    }

    if (hit) hit.push({ kind: 'perk:buy', panel: this.id, perkId: p.id, x, y, w, h: 46 });
    return y + 48;
  }

  onClick(region) {
    if (region.kind === 'perk:buy') {
      this.selected = region.perkId;
      const res = this.world.systems?.perks?.buy(region.perkId);
      this._dirty = true;
      if (res?.ok) {
        this.ui.orderBar.say(`HULL UPGRADED — ${region.perkId.replace(/_/g, ' ').toUpperCase()} ${res.rank}`, 'good');
      } else {
        this.ui.orderBar.say(String(res?.reason ?? 'CANNOT BUY').toUpperCase(), 'error');
      }
      return true;
    }
    if (region.kind === 'perk:pattern') {
      this.selected = region.moduleId;
      const res = this.world.systems?.patterns?.build(region.moduleId);
      this._dirty = true;
      if (!res?.ok) this.ui.orderBar.say(String(res?.reason ?? 'CANNOT BUILD').toUpperCase(), 'error');
      return true;
    }
    return false;
  }
}

function costText(cost) {
  if (!cost) return '--';
  const parts = [];
  for (const k in cost) {
    const v = cost[k];
    if (typeof v !== 'number' || v <= 0) continue;
    parts.push(`${v} ${k.slice(0, 4).toUpperCase()}`);
  }
  return parts.length ? parts.join(' · ') : '--';
}
