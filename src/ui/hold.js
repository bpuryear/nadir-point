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
import { moduleName, itemName } from './names.js';
import { Panel, PAD, TITLE_H, tableHead, rowBack, fmtClock } from './panels.js';

/**
 * Widest status chip the MATERIALS table can emit — measured from the REAL demands,
 * not from three samples. See perks.js for the argument; the failure is identical, and
 * here it printed the shortfall chip straight over the cost it is a shortfall against
 * (`140 ALLO · 16…` under `SHORT 56 ALLO · 160 ELEC · 1…`, a measured 20.1 x 10.0 px).
 * Capped at 46 % of the row so the lane cannot eat the item name.
 */
const CLAIM_FLOOR = ['AFFORDABLE', 'LOCKED'];
function claimLane(P, demands, w) {
  let out = 0;
  const take = (s) => { if (s) out = Math.max(out, P.measure(s, F.microBold, TRACK.label) + 12); };
  for (const s of CLAIM_FLOOR) take(s);
  for (const dm of demands ?? []) {
    if (!dm.ok && dm.shortfall && Object.keys(dm.shortfall).length) {
      take(`SHORT ${costText(dm.shortfall)}`);
    }
  }
  return Math.min(out, Math.round((w || 500) * 0.46));
}

const ROW_H = 15;

/** m3, printed the way the reference prints it: one decimal, always with the unit. */
/** `-18%` / `+4%`, or a dash when the ratio is effectively one. */
function fmtSignedPct(ratio) {
  const d = Math.round((ratio - 1) * 100);
  return d === 0 ? '--' : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`;
}

/** Total mass of everything aboard, from the cargo snapshot. */
function massOf(d) {
  let t = 0;
  for (const m of d.modules ?? []) t += m.massT ?? 0;
  return t;
}

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
      w: 578,
      h: 340,
      maxH: 520,
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
    // The codex grows and the hold changes, so the "largest part on record" figure is
    // invalidated with the snapshot rather than memoised forever - a cached answer to
    // "will the next thing fit" that never updates is worse than no answer.
    this._biggest = undefined;
    this._snap = cargo.describe();
    return this._snap;
  }

  drawBody(P, x, y, w, h, hit, clip) {
    const d = this._data(this.ui.time);
    if (!d) {
      P.text('NO HOLD', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
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
    P.fill(bx, y + 14, bw, 11, C.track);
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

    /**
     * WHAT THE WEIGHT COSTS, IN THE HEADER.
     *
     * This panel printed `4.2 KT` of cargo mass and connected it to nothing — no
     * speed penalty, no turn penalty, no signature — so the answer to "what does your
     * cargo cost you" was "space in a box". The honest coupling is the one the sim
     * actually has: `refit.js` divides acceleration by `massLoad` and turn rate by
     * its square root, and `stores.js` multiplies propellant burn by it. So the panel
     * states the penalty the FITTED mass is already imposing, and says plainly that
     * anything in the hold joins it the moment it goes on a mount. Inventing a top
     * speed that falls would have been a readout that lies.
     */
    const player = this.world.player;
    if (player?.classDef) {
      const load = player.massLoad ?? 1;
      const accelPct = player.classDef.accel ? player.body.accel / player.classDef.accel : 1;
      const turnPct = player.classDef.turnRate ? player.body.turnRate / player.classDef.turnRate : 1;
      const holdTxt = `+${fmtMass(massOf(d))} WHEN FITTED`;
      const holdW = P.measure(holdTxt, F.micro, TRACK.label) + 14;
      const costTxt = `ACCEL ${fmtSignedPct(accelPct)} · TURN ${fmtSignedPct(turnPct)} · BURN ×${load.toFixed(2)}`;
      const fmW = P.measure('FITTED MASS', F.micro, TRACK.label) + 12;
      P.label('FITTED MASS', x, y + 52, { color: C.inkFaint });
      P.text(`×${load.toFixed(2)}`, x + fmW + 40, y + 52, {
        font: F.small, color: load > 1.25 ? C.warn : C.inkDim, align: 'right',
      });
      P.text(costTxt, x + fmW + 50, y + 52,
        { font: F.micro, color: C.inkFaint, track: TRACK.label, maxW: w - holdW - fmW - 54 });
      P.text(holdTxt, x + w, y + 52,
        { font: F.micro, color: C.inkFaint, align: 'right', track: TRACK.label });
    }

    // --- the table ----------------------------------------------------------
    // Real column headers, the way every table in the reference has them.
    // Column origins. Every one of these is a fixed offset because the alternative -
    // laying a variable-width name out and letting the next column start where it
    // finished - is what produced `NOMINAKT` and `WORN40 T` in the first plate of
    // this panel: two columns writing into the same forty pixels.
    // Column origins laid out from the RIGHT for everything numeric, so the name
    // column takes what is left and is clipped to it. Fixed offsets are what produced
    // `NOMINAKT` and `WORN40 T` here: two columns writing into the same forty pixels.
    const volW = P.measure('9,999.9 m3', F.small, TRACK.value) + 12;
    const massW = P.measure('999.9 KT', F.micro, TRACK.value) + 12;
    const condW = 96;
    const mountW = P.measure('STARBOARD', F.micro, TRACK.label) + 14;
    const originW = P.measure('COALITION', F.micro, TRACK.label) + 14;
    const COL = {};
    COL.vol = w;
    COL.mass = w - volW;
    COL.cond = COL.mass - massW - condW;
    COL.condWord = COL.cond + 42;
    COL.mount = COL.cond - mountW;
    COL.origin = COL.mount - originW;
    COL.nameW = COL.origin - 12;
    let cy = tableHead(P, x, y + 70, w, [
      ['NAME', 0], ['ORIGIN', COL.origin], ['MOUNT', COL.mount], ['CONDITION', COL.cond],
      ['MASS', COL.mass, 'right'], ['VOLUME', COL.vol, 'right'],
    ]) + 13;

    const rows = [];
    for (const m of d.modules) rows.push({ t: 'module', m });
    for (const it of d.items) rows.push({ t: 'item', it });

    if (!rows.length) {
      P.text('HOLD EMPTY', x, cy + 4, { font: F.small, color: C.inkFaint, track: TRACK.label });
      P.text('CUT SECTIONS OFF A HULK TO FILL IT', x, cy + 18,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
    }

    for (const row of rows) {
      if (cy + 6 > clip.clipBottom) { this.hidden++; cy += ROW_H; continue; }
      if (cy < clip.clipTop - ROW_H) { cy += ROW_H; continue; }
      if (row.t === 'module') {
        const m = row.m;
        const fi = factionInk(getModule(m.moduleId)?.faction ?? 'player');
        const sel = this.selected === m.uid;
        rowBack(P, x, cy - 10, w, ROW_H - 1, { selected: sel });
        P.fill(x, cy - 9, 2, ROW_H - 3, fi.stripe);
        // The faction is already the very next column AND the stripe on the left, so
        // spending the name column re-printing `CONCORD` is what forced
        // `CONCORD GAUSS OUTRI…`. `moduleName` drops it.
        P.text(moduleName(m.moduleId), x + 6, cy,
          { font: F.small, color: C.ink, maxW: COL.nameW });
        P.text(fi.name.toUpperCase(), x + COL.origin, cy, { font: F.micro, color: fi.dim, track: TRACK.label });
        P.label(m.hardpoint, x + COL.mount, cy, { color: C.inkFaint });
        const cond = m.condition ?? 1;
        P.bar(x + COL.cond, cy - 7, 36, 5, cond, {
          color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.track,
        });
        P.text(conditionLabel(cond), x + COL.condWord, cy,
          { font: F.micro, color: cond < CONDITION.worn ? C.warn : C.inkFaint });
        P.text(fmtMass(m.massT), x + COL.mass, cy, { font: F.micro, color: C.inkFaint, align: 'right' });
        P.text(fmtM3(m.volumeM3), x + COL.vol, cy, { font: F.small, color: C.ink, align: 'right' });
        if (hit) hit.push({ kind: 'hold:module', panel: this.id, uid: m.uid, x, y: cy - 10, w, h: ROW_H - 1 });
      } else {
        const it = row.it;
        const each = it.count > 0 ? it.volumeM3 / it.count : it.volumeM3;
        rowBack(P, x, cy - 10, w, ROW_H - 1, { selected: this.selected === it.itemId });
        P.fill(x, cy - 9, 2, ROW_H - 3, C.salvageDim);
        P.text(`${itemName(it.itemId)} ×${it.count}`, x + 6, cy,
          { font: F.small, color: C.inkDim, maxW: COL.nameW });
        P.label('DEVICE', x + COL.origin, cy, { color: C.salvageDim });
        P.label('--', x + COL.mount, cy, { color: C.inkFaint });
        P.text(`${each} m3 EACH`, x + COL.cond, cy, { font: F.micro, color: C.inkFaint });
        P.text('--', x + COL.mass, cy, { font: F.micro, color: C.inkFaint, align: 'right' });
        P.text(fmtM3(it.volumeM3), x + COL.vol, cy, { font: F.small, color: C.inkDim, align: 'right' });
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
      // Clipped to the lane before the MOUNT column, the same discipline every other
      // row in this table follows. It ran 12.7 px into `PRESS K FOR THE CHAIN`.
      P.text(`MATERIAL STOCK — ${Math.round(scrapUnits)} SCRAP`, x + 6, cy,
        { font: F.small, color: C.inkDim, maxW: Math.max(40, COL.mount - 14) });
      P.label('PRESS K FOR THE CHAIN', x + COL.mount, cy,
        { color: C.inkFaint, maxW: Math.max(20, COL.cond - COL.mount - 6) });
      P.text(fmtM3(d.breakdown.materialsM3), x + COL.vol, cy, { font: F.small, color: C.inkDim, align: 'right' });
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
      const chipW = P.measure('WOULD NOT FIT', F.microBold, TRACK.label) + 20;
      // The value starts past where the label actually FINISHED, not past a second
      // measurement of it or a hard-coded 160. See Painter.label.
      const hx = P.label('LARGEST PART ON RECORD', x, cy, { color: C.inkFaint }) + 12;
      P.text(`${biggest.name.toUpperCase()} · ${fmtM3(biggest.volumeM3)}`, hx, cy,
        { font: F.micro, color: C.inkDim, maxW: x + w - chipW - hx - 10 });
      P.chip(fits ? 'WOULD FIT' : 'WOULD NOT FIT', x + w, cy - 10, {
        fill: fits ? C.track : C.warn, color: fits ? C.inkDim : C.void, align: 'right', h: 13,
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
      w: 540,
      h: 452,
      maxH: 620,
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
      P.text('NO REFINERY', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }

    // --- tier 0 -------------------------------------------------------------
    let cy = y + 8;
    P.label('TIER 0 · SCRAP', x, cy, { color: C.inkFaint });
    P.label('BULKY, USELESS UNTIL REFINED', x + w, cy, { color: C.inkFaint, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 16;

    for (const g of SCRAP_GRADES) {
      const def = MATERIAL_DEFS.find((m) => m.id === g);
      const units = d.scrap[g] ?? 0;
      const m3 = units * MATERIAL_VOLUME[g];
      P.fill(x, cy - 8, 2, 11, units > 0 ? C.inkDim : C.track);
      P.text((def?.name ?? g).toUpperCase(), x + 6, cy, {
        font: F.small, color: units > 0 ? C.ink : C.inkFaint,
      });
      P.text(String(Math.round(units)), x + 152, cy, {
        font: F.bodyBold, color: units > 0 ? C.ink : C.inkFaint, align: 'right',
      });
      P.text(fmtM3(m3), x + 214, cy, { font: F.micro, color: C.inkFaint, align: 'right' });
      // What it is FOR. For scrap that is what it refines into, at what rate.
      P.text(refineText(def), x + 224, cy,
        { font: F.micro, color: C.inkFaint, track: TRACK.value, maxW: w - 224 });
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
      P.text('IDLE', x, cy, { font: F.small, color: C.inkFaint, track: TRACK.label });
      // Clipped to the panel. 602 px of type inside a 512 px window drew through its
      // own right border and out into the frame.
      P.text('CLICK A SCRAP ROW TO QUEUE IT · REFINING IS LOSSY AND COMPRESSES ~6:1 BY VOLUME',
        x + 44, cy, { font: F.micro, color: C.inkFaint, track: TRACK.label, maxW: w - 48 });
    }
    cy += 18;

    // --- tier 1 -------------------------------------------------------------
    P.label('TIER 1 · REFINED', x, cy, { color: C.inkFaint });
    P.label('WHAT EVERYTHING IS PAID FOR IN', x + w, cy, { color: C.inkFaint, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 16;

    for (const p of REFINED_POOLS) {
      const def = MATERIAL_DEFS.find((m) => m.id === p);
      const units = d.refined[p] ?? 0;
      P.fill(x, cy - 8, 2, 11, units > 0 ? C.ink : C.track);
      P.text((def?.name ?? p).toUpperCase(), x + 6, cy, {
        font: F.small, color: units > 0 ? C.ink : C.inkFaint,
      });
      P.text(String(Math.round(units)), x + 152, cy, {
        font: F.bodyBold, color: units > 0 ? C.inkStrong : C.warn, align: 'right',
      });
      P.text(fmtM3(units * MATERIAL_VOLUME[p]), x + 214, cy,
        { font: F.micro, color: C.inkFaint, align: 'right' });
      P.text((def?.consumedBy ?? '--').toUpperCase(), x + 224, cy,
        { font: F.micro, color: C.inkFaint, track: TRACK.value, maxW: w - 224 });
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
    // Right-aligned in sequence, measuring the first before placing the second: two
    // chips laid out from fixed offsets is two chips that eventually overlap.
    const shortTxt = `${this._demands.length - affordable} SHORT`;
    const shortW = P.measure(shortTxt, F.microBold, TRACK.label) + 8;
    P.chip(shortTxt, x + w, cy - 9, { fill: C.warn, color: C.void, h: 12, align: 'right' });
    P.chip(`${affordable} AFFORDABLE`, x + w - shortW - 5, cy - 9, {
      fill: C.track, color: C.inkDim, h: 12, align: 'right',
    });
    P.hline(x, cy + 4, w, C.rule);
    cy += 15;
    const lane = claimLane(P, this._demands, w);
    const colCost = Math.max(200, w - lane - 190);
    cy = tableHead(P, x, cy, w, [['GROUP', 0], ['ITEM', 66], ['COST', colCost]]) + 13;

    for (const dm of this._demands) {
      if (cy + ROW_H + 12 > clip.clipBottom) { this.hidden++; cy += ROW_H + 12; continue; }
      if (cy < clip.clipTop - ROW_H) { cy += ROW_H + 12; continue; }
      const col = dm.ok ? C.ink : C.inkDim;
      P.label(dm.group, x, cy, { color: C.inkFaint });
      P.text(dm.name.toUpperCase(), x + 66, cy, { font: F.small, color: col, maxW: colCost - 72 });
      // Inside the lane boundary. `BOARDING CHARGE 22 ALLO 10 COMP 8 ELE[C]` used to
      // lose its last glyph to an AFFORDABLE chip drawn straight over it.
      P.text(costText(dm.cost), x + colCost, cy,
        { font: F.micro, color: dm.ok ? C.inkDim : C.inkFaint, maxW: w - lane - colCost - 8 });
      if (dm.ok) {
        P.chipOutline('AFFORDABLE', x + w, cy - 10, { color: C.inkDim, align: 'right', h: 13 });
      } else if (dm.shortfall && Object.keys(dm.shortfall).length) {
        // CLIPPED AT THE TRACKING IT IS DRAWN AT. `P.clip` defaults to `TRACK.value`
        // at 0.02em while the chip draws at `TRACK.label` 0.16em, so a string "clipped"
        // to 216 px came out at 251 and ran back over the cost it is a shortfall
        // against. theme.js:820-825 documents this exact class; this was another of it.
        P.chip(P.clip(`SHORT ${costText(dm.shortfall)}`, F.microBold, lane - 10, TRACK.label), x + w, cy - 10, {
          fill: C.warn, color: C.void, align: 'right', h: 13,
        });
      } else {
        P.chipOutline('LOCKED', x + w, cy - 10, { color: C.warnDim, align: 'right', h: 13 });
      }
      P.text((dm.note ?? '').toUpperCase(), x + 66, cy + 11,
        { font: F.micro, color: C.inkFaint, track: TRACK.label, maxW: w - 72 });
      cy += ROW_H + 12;
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
