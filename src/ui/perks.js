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
import { Panel, PAD, tableHead, rowBack } from './panels.js';

export class PerksPanel extends Panel {
  constructor(ui) {
    super({
      id: 'perks',
      title: 'HULL · PERKS AND PATTERNS',
      hint: 'P',
      w: 500,
      h: 400,
      // Right of frame: OBJECTIVES opens on the left and these two are the pair the
      // player reads together — what the world is asking, and what the hull can buy.
      place: (P) => ({ x: P.w - 530, y: Math.max(40, Math.min(118, P.h - 440)) }),
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
      P.text('NO PROGRESSION LAYER', x, y + 14, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }
    this._refresh(this.ui.time);

    let cy = y + 8;
    P.label('PERMANENT WORK ON THIS HULL', x, cy, { color: C.inkFaint });
    P.label('PAID FOR OUT OF THE SAME POOLS AS REPAIRS', x + w, cy,
      { color: C.inkGhost, align: 'right' });
    P.hline(x, cy + 5, w, C.rule);
    cy += 16;

    for (const p of this._perks) {
      const rowH = 40;
      if (cy > clip.clipBottom + rowH || cy + rowH < clip.clipTop) { cy += rowH; continue; }
      cy = this._drawPerk(P, x, cy, w, p, hit);
    }

    // --- patterns -----------------------------------------------------------
    cy += 10;
    P.label('PATTERNS HELD', x, cy, { color: C.inkFaint });
    P.label('A REBUILD COMES OUT AT 85% CONDITION — FINDING THE REAL THING IS STILL BETTER',
      x + w, cy, { color: C.inkGhost, align: 'right' });
    P.hline(x, cy + 5, w, C.rule);
    cy += 15;
    cy = tableHead(P, x, cy, w, [['MODULE', 0], ['MOUNT', 168], ['COST', 226], ['', w, 'right']]) + 13;

    if (!this._patterns.length) {
      P.text('NONE RECOVERED', x, cy, { font: F.small, color: C.inkGhost, track: TRACK.label });
      P.text('CUTTING AN INTACT SECTION SOMETIMES TEACHES ITS PATTERN', x, cy + 13,
        { font: F.micro, color: C.inkGhost, track: TRACK.label });
      cy += 28;
    }

    for (const r of this._patterns) {
      if (cy > clip.clipBottom + 16 || cy + 16 < clip.clipTop) { cy += 16; continue; }
      const fi = factionInk(r.faction);
      rowBack(P, x, cy - 11, w, 15, { selected: this.selected === r.moduleId });
      P.fill(x, cy - 10, 2, 13, fi.stripe);
      P.text(P.clip(String(r.name).toUpperCase(), F.small, 158), x + 6, cy,
        { font: F.small, color: r.buildable ? C.ink : C.inkFaint });
      P.label(r.hardpoint, x + 168, cy, { color: C.inkGhost });
      P.text(costText(r.cost), x + 226, cy, { font: F.micro, color: r.affordable ? C.inkDim : C.inkFaint });
      if (r.buildable) {
        P.chip('BUILD', x + w, cy - 10, { fill: C.ink, color: C.void, h: 13, align: 'right' });
      } else {
        P.chipOutline(P.clip(String(r.reason ?? 'BLOCKED').toUpperCase(), F.microBold, 130),
          x + w, cy - 10, { color: C.warnDim, h: 13, align: 'right' });
      }
      if (hit) hit.push({ kind: 'perk:pattern', panel: this.id, moduleId: r.moduleId, x, y: cy - 11, w, h: 15 });
      cy += 16;
    }

    this.scrollMax = Math.max(0, (cy + 10) - y - (this.bodyH - PAD * 2));
    void h;
  }

  _drawPerk(P, x, y, w, p, hit) {
    const maxed = p.rank >= p.maxRank;
    const locked = !!(p.gate && !p.gate.met);
    const col = maxed ? C.inkDim : p.buyable ? C.inkStrong : locked ? C.inkFaint : C.ink;

    rowBack(P, x, y, w, 38, { selected: this.selected === p.id });

    // Rank pips first: this hull has had this work done to it N times.
    P.pips(x, y + 6, p.maxRank, p.rank, {
      size: 6, gap: 3, color: maxed ? C.ink : C.inkDim, empty: C.inkGhost,
    });
    P.text(P.clip(String(p.name).toUpperCase(), F.bodyBold, 200), x + p.maxRank * 9 + 8, y + 12, {
      font: F.bodyBold, color: col, track: TRACK.label,
    });
    P.text(P.clip(String(p.effect).toUpperCase(), F.micro, w - 210), x + p.maxRank * 9 + 8, y + 24, {
      font: F.micro, color: C.inkGhost, track: TRACK.label,
    });

    if (maxed) {
      P.chipOutline('AT MAXIMUM', x + w, y + 4, { color: C.inkDim, h: 13, align: 'right' });
    } else if (locked) {
      // The gate as a progress bar. `3/5 MODULE INSTALLED` with a bar is a goal.
      const g = p.gate;
      P.chipOutline(`${g.have}/${g.need}`, x + w, y + 4, { color: C.warnDim, h: 13, align: 'right' });
      P.bar(x + w - 168, y + 22, 120, 5, g.need > 0 ? g.have / g.need : 0,
        { color: C.warnDim, track: C.inkGhost, segments: Math.min(8, g.need) });
      P.text(P.clip(String(g.text).toUpperCase(), F.micro, 164), x + w, y + 34,
        { font: F.micro, color: C.inkGhost, align: 'right', track: TRACK.label });
    } else if (p.affordable) {
      P.chip(`BUY · ${costText(p.cost)}`, x + w, y + 4, {
        fill: C.ink, color: C.void, h: 13, align: 'right',
      });
    } else {
      P.chip(`SHORT ${costText(p.shortfall)}`, x + w, y + 4, {
        fill: C.warn, color: C.void, h: 13, align: 'right',
      });
      P.text(costText(p.cost), x + w, y + 30, {
        font: F.micro, color: C.inkFaint, align: 'right',
      });
    }

    if (hit) hit.push({ kind: 'perk:buy', panel: this.id, perkId: p.id, x, y, w, h: 38 });
    return y + 40;
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
