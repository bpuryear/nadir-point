/**
 * THE HOLD, IN CUBIC METRES — and the material chain that shares it.
 *
 * `reference-ui-language.md` §8 reads `2 620,0/5 000,0 m³` off the reference inventory
 * and says plainly what a six-slot array costs us: a salvaged destroyer reactor and a
 * sensor mast are the same object to a slot count, and they are obviously not the same
 * object. `sim/meta/cargo.js` implemented volume; nothing showed it. Until it is on
 * screen, "what do I leave behind" is not a decision the player is able to make — they
 * discover it as a `WILL NOT FIT` toast after the cut, which is the worst possible
 * moment to learn a constraint.
 *
 * TWO PANELS, because they answer two different questions:
 *
 *   HOLD       what is aboard, what each thing costs to carry, and what is left.
 *              Modules, devices and material stock share one number and compete.
 *
 *   MATERIALS  the two-tier chain — three grades of scrap refining into four pools —
 *              what each tier is FOR, the refinery queue and its clock, and, most
 *              importantly, WHAT YOU CANNOT CURRENTLY AFFORD. Scarcity is only a
 *              system if the player can see which of the competing claims on the same
 *              pool they are currently short for.
 *
 * Both read APIs allocate (they build arrays of row objects), so both are cached here
 * and refreshed on the economy's own change events plus a slow floor. Nothing in this
 * file runs work per rendered frame that it does not have to.
 */

import { getModule } from '../core/contracts.js';
import { MEV } from '../sim/meta/events.js';
import { MATERIAL_DEFS, MATERIAL_VOLUME, SCRAP_GRADES, REFINED_POOLS } from '../sim/meta/materials.js';
import { moduleVolume } from '../sim/meta/cargo.js';
import { CONDITION, conditionLabel } from '../sim/condition.js';
import { C, F, TRACK, factionInk, fmtPct, fmtMass } from './theme.js';
import { Panel, PAD, TITLE_H, tableHead, rowBack, fmtClock } from './panels.js';

const ROW_H = 15;

/** m3, printed the way the reference prints it: one decimal, always with the unit. */
const fmtM3 = (v) => `${(Math.round(v * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m3`;

// ===========================================================================
// HOLD
// ===========================================================================

export class HoldPanel extends Panel {
  constructor(ui) {
    super({
      id: 'hold',
      title: 'HOLD',
      hint: 'G',
      w: 470,
      h: 318,
      place: (P) => ({ x: P.w - 470 - 30, y: 118 }),
    });
    this.ui = ui;
    this.world = ui.world;
    this._snap = null;
    this._at = -1;
    this._dirty = true;
    this._off = ui.bus.on(MEV.CARGO_CHANGED, () => { this._dirty = true; });
  }

  onOpen() { this._dirty = true; }
  dispose() { this._off?.(); }

  _data(now) {
    const cargo = this.world.systems?.cargo;
    if (!cargo) return null;
    if (this._snap && !this._dirty && now - this._at < 0.5) return this._snap;
    this._at = now;
    this._dirty = false;
    this._snap = cargo.describe();
    return this._snap;
  }

  drawBody(P, x, y, w, h, hit, clip) {
    const d = this._data(this.ui.time);
    if (!d) {
      P.text('NO HOLD', x, y + 14, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }

    // --- the headline figure ------------------------------------------------
    const full = d.fraction >= 0.995;
    const tight = d.fraction >= 0.9;
    P.label('VOLUME', x, y + 8, { color: C.inkFaint });
    P.text(`${fmtM3(d.usedM3)} / ${fmtM3(d.capacityM3)}`, x + w, y + 8, {
      font: F.midBold, color: full ? C.warn : tight ? C.ink : C.inkStrong, align: 'right',
    });

    // A stacked bar, because the three claimants on the hold are the system: the parts
    // you came for, the scrap that accumulates while you cut, and the devices that get
    // you out. Which one is eating the bay is the decision.
    const cap = Math.max(1, d.capacityM3);
    const bx = x;
    const bw = w;
    P.fill(bx, y + 14, bw, 11, C.inkGhost);
    let seg = 0;
    const stack = [
      ['MODULES', d.breakdown.modulesM3, C.ink],
      ['MATERIALS', d.breakdown.materialsM3, C.inkDim],
      ['DEVICES', d.breakdown.itemsM3, C.salvageDim],
    ];
    for (const [, v, col] of stack) {
      const sw = (v / cap) * bw;
      if (sw > 0.5) P.fill(bx + seg, y + 14, sw, 11, col);
      seg += sw;
      P.rule(bx + seg, y + 12, P.hair, 15, C.scrimHard);
    }
    P.frame(bx, y + 14, bw, 11, C.ruleDim);

    let lx = x;
    for (const [label, v, col] of stack) {
      P.fill(lx, y + 32, 6, 6, col);
      P.label(`${label} ${Math.round(v)}`, lx + 9, y + 38, { color: C.inkFaint });
      lx += 12 + P.measure(`${label} ${Math.round(v)}`, F.micro, TRACK.label) + 14;
    }
    P.text(`${fmtM3(d.freeM3)} FREE`, x + w, y + 38, {
      font: F.bodyBold, color: full ? C.warn : C.inkDim, align: 'right',
    });

    // --- the table ----------------------------------------------------------
    // Real column headers, the way every table in the reference has them.
    let cy = tableHead(P, x, y + 54, w, [
      ['NAME', 0], ['ORIGIN', 150], ['MOUNT', 216], ['COND', 268],
      ['MASS', 350, 'right'], ['VOLUME', w, 'right'],
    ]) + 12;

    const rows = [];
    for (const m of d.modules) rows.push({ t: 'module', m });
    for (const it of d.items) rows.push({ t: 'item', it });

    if (!rows.length) {
      P.text('HOLD EMPTY', x, cy + 4, { font: F.small, color: C.inkGhost, track: TRACK.label });
      P.text('CUT SECTIONS OFF A HULK TO FILL IT', x, cy + 18,
        { font: F.micro, color: C.inkGhost, track: TRACK.label });
    }

    for (const row of rows) {
      if (cy > clip.clipBottom + ROW_H || cy < clip.clipTop - ROW_H) { cy += ROW_H; continue; }
      if (row.t === 'module') {
        const m = row.m;
        const fi = factionInk(getModule(m.moduleId)?.faction ?? 'player');
        const sel = this.selected === m.uid;
        rowBack(P, x, cy - 10, w, ROW_H - 1, { selected: sel });
        P.fill(x, cy - 9, 2, ROW_H - 3, fi.stripe);
        P.text(P.clip(m.name.toUpperCase(), F.small, 142), x + 6, cy, { font: F.small, color: C.ink });
        P.text(fi.name.toUpperCase(), x + 150, cy, { font: F.micro, color: fi.dim, track: TRACK.label });
        P.label(m.hardpoint, x + 216, cy, { color: C.inkFaint });
        const cond = m.condition ?? 1;
        P.bar(x + 268, cy - 7, 34, 5, cond, {
          color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.inkGhost,
        });
        P.text(conditionLabel(cond), x + 306, cy, { font: F.micro, color: cond < CONDITION.worn ? C.warn : C.inkFaint });
        P.text(fmtMass(m.massT), x + 350, cy, { font: F.micro, color: C.inkFaint, align: 'right' });
        P.text(fmtM3(m.volumeM3), x + w, cy, { font: F.small, color: C.ink, align: 'right' });
        if (hit) hit.push({ kind: 'hold:module', panel: this.id, uid: m.uid, x, y: cy - 10, w, h: ROW_H - 1 });
      } else {
        const it = row.it;
        const each = it.count > 0 ? it.volumeM3 / it.count : it.volumeM3;
        rowBack(P, x, cy - 10, w, ROW_H - 1, { selected: this.selected === it.itemId });
        P.fill(x, cy - 9, 2, ROW_H - 3, C.salvageDim);
        P.text(P.clip(`${it.name.toUpperCase()} ×${it.count}`, F.small, 142), x + 6, cy,
          { font: F.small, color: C.inkDim });
        P.label('DEVICE', x + 150, cy, { color: C.salvageDim });
        P.label('--', x + 216, cy, { color: C.inkGhost });
        P.text(`${each} m3 EACH`, x + 268, cy, { font: F.micro, color: C.inkGhost });
        P.text('--', x + 350, cy, { font: F.micro, color: C.inkGhost, align: 'right' });
        P.text(fmtM3(it.volumeM3), x + w, cy, { font: F.small, color: C.inkDim, align: 'right' });
        if (hit) hit.push({ kind: 'hold:item', panel: this.id, itemId: it.itemId, x, y: cy - 10, w, h: ROW_H - 1 });
      }
      cy += ROW_H;
    }

    // Material stock gets one summary row rather than seven: it is bulk, it has its own
    // panel, and listing it here would bury the parts the player actually chose to keep.
    const econ = this.world.systems?.economy;
    if (econ) {
      P.hline(x, cy - 8, w, C.ruleDim);
      cy += 6;
      let scrapUnits = 0;
      for (const g of SCRAP_GRADES) scrapUnits += econ.scrap[g];
      P.fill(x, cy - 9, 2, ROW_H - 3, C.inkDim);
      P.text(`MATERIAL STOCK — ${Math.round(scrapUnits)} SCRAP`, x + 6, cy, { font: F.small, color: C.inkDim });
      P.label('K FOR DETAIL', x + 150, cy, { color: C.inkGhost });
      P.text(fmtM3(d.breakdown.materialsM3), x + w, cy, { font: F.small, color: C.inkDim, align: 'right' });
      cy += ROW_H;
    }

    // --- what will still fit -------------------------------------------------
    // The forward-looking half. A number for what is free is only half an answer; the
    // useful half is "and is that enough for the thing I am about to cut".
    P.hline(x, cy - 6, w, C.rule);
    cy += 10;
    const biggest = this._largestKnownModule();
    if (biggest) {
      const fits = biggest.volumeM3 <= d.freeM3;
      P.label('LARGEST PART ON RECORD', x, cy, { color: C.inkGhost });
      P.text(`${biggest.name.toUpperCase()} · ${fmtM3(biggest.volumeM3)}`, x + 160, cy,
        { font: F.micro, color: C.inkFaint });
      P.chip(fits ? 'WOULD FIT' : 'WOULD NOT FIT', x + w, cy - 9, {
        fill: fits ? C.inkGhost : C.warn, color: fits ? C.inkDim : C.void, align: 'right', h: 12,
      });
    }

    const content = cy + 14 - (y);
    this.scrollMax = Math.max(0, content - (this.bodyH - PAD * 2));
    void h;
  }

  /** The bulkiest module the codex has ever seen. Cached; the registry never changes. */
  _largestKnownModule() {
    if (this._biggest !== undefined) return this._biggest;
    const codex = this.world.systems?.codex;
    let best = null;
    for (const it of this.world.inventory ?? []) {
      const def = getModule(it.moduleId);
      if (!def) continue;
      const v = moduleVolume(def);
      if (!best || v > best.volumeM3) best = { name: def.name, volumeM3: v };
    }
    if (!best && codex) {
      for (const e of codex.entries({ category: 'module', minState: 'seen' })) {
        const def = getModule(e.id);
        if (!def) continue;
        const v = moduleVolume(def);
        if (!best || v > best.volumeM3) best = { name: def.name, volumeM3: v };
      }
    }
    this._biggest = best;
    return best;
  }

  onClick(region) {
    if (region.kind === 'hold:module') {
      this.selected = this.selected === region.uid ? null : region.uid;
      const it = (this.world.inventory ?? []).find((i) => i.uid === region.uid);
      const def = it ? getModule(it.moduleId) : null;
      if (def) {
        this.ui.orderBar.say(
          `${def.name.toUpperCase()} — ${moduleVolume(def)} m3 · ${conditionLabel(it.condition ?? 1)} · M TO FIT`,
          'info',
        );
      }
      return true;
    }
    if (region.kind === 'hold:item') {
      this.selected = this.selected === region.itemId ? null : region.itemId;
      return true;
    }
    return false;
  }
}

// ===========================================================================
// MATERIALS
// ===========================================================================

export class MaterialsPanel extends Panel {
  constructor(ui) {
    super({
      id: 'materials',
      title: 'MATERIALS',
      hint: 'K',
      w: 486,
      h: 430,
      // Left of frame. HOLD opens on the right and the two are read together — what is
      // aboard, and what it can be turned into — so they must not default to the same
      // rectangle and hide one another.
      place: (P) => ({ x: 30, y: Math.max(40, Math.min(118, P.h - 470)) }),
    });
    this.ui = ui;
    this.world = ui.world;
    this._snap = null;
    this._demands = [];
    this._at = -1;
    this._dirty = true;
    this._offs = [
      ui.bus.on(MEV.CARGO_CHANGED, () => { this._dirty = true; }),
      ui.bus.on(MEV.REFINED, () => { this._dirty = true; }),
      ui.bus.on(MEV.PATTERN_LEARNED, () => { this._dirty = true; }),
    ];
  }

  onOpen() { this._dirty = true; }
  dispose() { for (const o of this._offs) o?.(); }

  _data(now) {
    const econ = this.world.systems?.economy;
    if (!econ) return null;
    if (this._snap && !this._dirty && now - this._at < 0.5) return this._snap;
    this._at = now;
    this._dirty = false;
    this._snap = econ.describe();
    this._rebuildDemands();
    return this._snap;
  }

  /**
   * WHAT YOU CANNOT CURRENTLY AFFORD.
   *
   * Every downstream consumer draws on the same four pools — repairing a breached
   * mount, rebuilding a module from a pattern, fabricating a device, buying a hull
   * perk. Scarcity is only a system when the competition between those claims is
   * visible, so this collapses all of them into one ranked list of "here is the thing
   * you are short for, and here is exactly what you are short by".
   */
  _rebuildDemands() {
    const out = this._demands;
    out.length = 0;
    const w = this.world;
    const econ = w.systems?.economy;
    if (!econ) return;

    for (const p of w.systems?.perks?.describe() ?? []) {
      if (!p.cost) continue;
      out.push({
        group: 'PERK', name: p.name, cost: p.cost,
        ok: p.buyable, shortfall: p.shortfall,
        note: p.gate && !p.gate.met ? `LOCKED · ${p.gate.have}/${p.gate.need} ${p.gate.text}` : p.effect,
      });
    }
    for (const r of w.systems?.patterns?.describeKnown() ?? []) {
      out.push({
        group: 'REBUILD', name: r.name, cost: r.cost,
        ok: r.buildable, shortfall: r.shortfall,
        note: r.reason ? r.reason.toUpperCase() : `${r.volumeM3} m3 · ${Math.round(r.condition * 100)}% CONDITION`,
      });
    }
    for (const it of w.systems?.items?.describeHotbar() ?? []) {
      if (!it.buildCost) continue;
      const short = econ.shortfall(it.buildCost);
      const ok = econ.canAfford(it.buildCost);
      out.push({
        group: 'DEVICE', name: it.name, cost: it.buildCost,
        ok, shortfall: ok ? null : short,
        note: `${it.volumeEachM3} m3 · CARRYING ${it.count}`,
      });
    }
    // Affordable first — the list's job is "what can I do right now", with the
    // unaffordable underneath so the shortfall is still legible as a goal.
    out.sort((a, b) => (a.ok === b.ok ? 0 : a.ok ? -1 : 1));
  }

  drawBody(P, x, y, w, h, hit, clip) {
    const d = this._data(this.ui.time);
    if (!d) {
      P.text('NO REFINERY', x, y + 14, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }

    // --- tier 0 -------------------------------------------------------------
    let cy = y + 8;
    P.label('TIER 0 · SCRAP', x, cy, { color: C.inkFaint });
    P.label('BULKY, USELESS UNTIL REFINED', x + w, cy, { color: C.inkGhost, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 16;

    for (const g of SCRAP_GRADES) {
      const def = MATERIAL_DEFS.find((m) => m.id === g);
      const units = d.scrap[g] ?? 0;
      const m3 = units * MATERIAL_VOLUME[g];
      P.fill(x, cy - 8, 2, 11, units > 0 ? C.inkDim : C.inkGhost);
      P.text((def?.name ?? g).toUpperCase(), x + 6, cy, {
        font: F.small, color: units > 0 ? C.ink : C.inkFaint,
      });
      P.text(String(Math.round(units)), x + 152, cy, {
        font: F.bodyBold, color: units > 0 ? C.ink : C.inkGhost, align: 'right',
      });
      P.text(fmtM3(m3), x + 214, cy, { font: F.micro, color: C.inkGhost, align: 'right' });
      // What it is FOR. For scrap that is what it refines into, at what rate.
      P.text(P.clip(refineText(def), F.micro, w - 224), x + 224, cy,
        { font: F.micro, color: C.inkFaint, track: TRACK.value });
      if (hit) hit.push({ kind: 'materials:enqueue', panel: this.id, grade: g, x, y: cy - 10, w, h: 14 });
      cy += 15;
    }

    // --- the refinery -------------------------------------------------------
    cy += 4;
    P.label('REFINERY', x, cy, { color: C.inkFaint });
    P.hline(x, cy + 4, w, C.ruleDim);
    cy += 16;
    if (d.queuedUnits > 0) {
      P.text(`${d.queuedUnits} UNITS QUEUED`, x, cy, { font: F.small, color: C.ink });
      P.text(`${d.rate.toFixed(1)}/s`, x + 152, cy, { font: F.small, color: C.inkDim, align: 'right' });
      P.text(`ETA ${fmtClock(d.etaSeconds)}`, x + 214, cy, { font: F.small, color: C.inkDim, align: 'right' });
      // Head of the queue, being worked. FIFO, one job, no minigame.
      const head = d.queue[0];
      if (head) {
        P.text(`WORKING ${head.grade.toUpperCase()} ×${head.remaining}`, x + 224, cy,
          { font: F.micro, color: C.inkFaint, track: TRACK.label });
      }
    } else {
      P.text('IDLE', x, cy, { font: F.small, color: C.inkGhost, track: TRACK.label });
      P.text('CLICK A SCRAP ROW TO QUEUE IT · REFINING IS LOSSY AND COMPRESSES ~6:1 BY VOLUME',
        x + 44, cy, { font: F.micro, color: C.inkGhost, track: TRACK.label });
    }
    cy += 18;

    // --- tier 1 -------------------------------------------------------------
    P.label('TIER 1 · REFINED', x, cy, { color: C.inkFaint });
    P.label('WHAT EVERYTHING IS PAID FOR IN', x + w, cy, { color: C.inkGhost, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 16;

    for (const p of REFINED_POOLS) {
      const def = MATERIAL_DEFS.find((m) => m.id === p);
      const units = d.refined[p] ?? 0;
      P.fill(x, cy - 8, 2, 11, units > 0 ? C.ink : C.inkGhost);
      P.text((def?.name ?? p).toUpperCase(), x + 6, cy, {
        font: F.small, color: units > 0 ? C.ink : C.inkFaint,
      });
      P.text(String(Math.round(units)), x + 152, cy, {
        font: F.bodyBold, color: units > 0 ? C.inkStrong : C.warn, align: 'right',
      });
      P.text(fmtM3(units * MATERIAL_VOLUME[p]), x + 214, cy,
        { font: F.micro, color: C.inkGhost, align: 'right' });
      P.text(P.clip((def?.consumedBy ?? '--').toUpperCase(), F.micro, w - 224), x + 224, cy,
        { font: F.micro, color: C.inkFaint, track: TRACK.value });
      cy += 15;
    }

    // --- competing claims ---------------------------------------------------
    cy += 6;
    let affordable = 0;
    for (const dm of this._demands) if (dm.ok) affordable++;
    P.label('CLAIMS ON THE SAME POOLS', x, cy, { color: C.inkFaint });
    // The tally, up here, because the list is sorted affordable-first and is longer
    // than the window: without it a player who does not scroll concludes they can
    // afford everything, which is the opposite of what this panel is for.
    P.chip(`${affordable} AFFORDABLE`, x + w - 108, cy - 9, {
      fill: C.inkGhost, color: C.inkDim, h: 12,
    });
    P.chip(`${this._demands.length - affordable} SHORT`, x + w, cy - 9, {
      fill: C.warn, color: C.void, h: 12, align: 'right',
    });
    P.hline(x, cy + 4, w, C.rule);
    cy += 15;
    cy = tableHead(P, x, cy, w, [['', 0], ['ITEM', 62], ['COST', 250], ['', w, 'right']]) + 12;

    for (const dm of this._demands) {
      if (cy > clip.clipBottom + ROW_H) { cy += ROW_H + 11; continue; }
      if (cy < clip.clipTop - ROW_H) { cy += ROW_H + 11; continue; }
      const col = dm.ok ? C.ink : C.inkFaint;
      P.label(dm.group, x, cy, { color: dm.ok ? C.inkDim : C.inkGhost });
      P.text(P.clip(dm.name.toUpperCase(), F.small, 180), x + 62, cy, { font: F.small, color: col });
      P.text(costText(dm.cost), x + 250, cy, { font: F.micro, color: dm.ok ? C.inkDim : C.inkFaint });
      if (dm.ok) {
        P.chipOutline('AFFORDABLE', x + w, cy - 9, { color: C.inkDim, align: 'right', h: 12 });
      } else if (dm.shortfall && Object.keys(dm.shortfall).length) {
        P.chip(`SHORT ${costText(dm.shortfall)}`, x + w, cy - 9, {
          fill: C.warn, color: C.void, align: 'right', h: 12,
        });
      } else {
        P.chipOutline('LOCKED', x + w, cy - 9, { color: C.warnDim, align: 'right', h: 12 });
      }
      P.text(P.clip((dm.note ?? '').toUpperCase(), F.micro, w - 68), x + 62, cy + 10,
        { font: F.micro, color: C.inkGhost, track: TRACK.label });
      cy += ROW_H + 11;
    }

    this.scrollMax = Math.max(0, (cy + 8) - y - (this.bodyH - PAD * 2));
    void h;
  }

  onClick(region) {
    if (region.kind !== 'materials:enqueue') return false;
    const econ = this.world.systems?.economy;
    if (!econ) return true;
    const n = econ.enqueue(region.grade);
    this._dirty = true;
    this.ui.orderBar.say(n > 0
      ? `${n} ${region.grade.toUpperCase()} SCRAP QUEUED FOR REFINING`
      : `NO ${region.grade.toUpperCase()} SCRAP ABOARD`, n > 0 ? 'good' : 'error');
    return true;
  }
}

// ---------------------------------------------------------------------------

function refineText(def) {
  if (!def?.refinesTo) return (def?.consumedBy ?? '').toUpperCase();
  const parts = [];
  for (const k in def.refinesTo) parts.push(`${k.toUpperCase()} ${def.refinesTo[k].toFixed(2)}`);
  return `→ ${parts.join(' · ')} PER UNIT`;
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

export { fmtM3, fmtPct, TITLE_H };
