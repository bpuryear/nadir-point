/**
 * THE CODEX SCREEN.
 *
 * `beta-decay-systems.md` §3.3 makes the argument this screen is built on, and it is the
 * single most transferable idea in the research: Beta Decay has no skill trees, and it
 * publishes a 289-entry database, and THOSE TWO FACTS ARE THE SAME FACT. The player's
 * power curve is what they own and what they know. Our scope decision rules out
 * character progression separate from the ship; the codex is what makes that a design
 * position instead of an absence — and `sim/meta/perks.js` gates real, purchasable hull
 * upgrades on `codex.count(...)`, so reading is mechanically load-bearing.
 *
 * `sim/meta/codex.js` shipped as data and a read API with a note asking for exactly this
 * screen and naming the discipline it should adopt: "fixed frame, variable slots,
 * one-sentence functional description, `--` where a value does not apply RATHER THAN A
 * HIDDEN ROW." That last clause is the whole design. An entry you have only seen shows
 * the same twelve rows as one you have flown with, with `--` in the ones you have not
 * earned — so the SHAPE OF WHAT YOU DO NOT KNOW is itself visible, and the entry is a
 * thing to fill in rather than a thing that appears.
 *
 * The five discovery states are drawn as a ladder on every row, because they are
 * ordered and monotonic: unknown → seen → scanned → salvaged → installed. A state never
 * regresses, which is what makes the ladder progression rather than a cache of what is
 * on screen right now.
 *
 * CROSS-LINKS ARE CLICKABLE. `_moduleLinks` already answers "which hulls carry one of
 * these", which turns an entry into a shopping list: read it, learn where to go and what
 * to shoot carefully. A link you cannot follow is a footnote; a link you can follow is
 * the reason the screen is worth opening.
 */

import { CODEX_CATEGORIES, DISCOVERY_STATES } from '../sim/meta/codex.js';
import { MEV } from '../sim/meta/events.js';
import { C, F, TRACK, factionInk } from './theme.js';
import { Panel, PAD, tableHead, rowBack } from './panels.js';

/**
 * The index column. Wide enough for the longest module name in the registry —
 * `COALITION BREACHING PROW` — because an index that abbreviates the thing you are
 * looking for is an index you have to read twice. The card beside it still gets 470 px.
 */
const LIST_W = 296;
const ROW_H = 20;
const TABS = ['module', 'ship', 'item', 'material'];
const TAB_LABEL = { module: 'MODULES', ship: 'HULLS', item: 'DEVICES', material: 'MATERIALS' };

/** Rank of each state, so the ladder can be drawn from a string. */
const RANK = Object.fromEntries(DISCOVERY_STATES.map((s, i) => [s, i]));

export class CodexPanel extends Panel {
  constructor(ui) {
    super({
      id: 'codex',
      title: 'CODEX',
      hint: 'C',
      w: 820,
      h: 470,
      maxH: 470,
    });
    this.ui = ui;
    this.world = ui.world;
    this.tab = 'module';
    /** `{category, id}` of the open card. */
    this.selected = null;
    this._list = [];
    this._progress = null;
    this._dirty = true;
    this._off = ui.bus.on(MEV.CODEX_UPDATED, () => { this._dirty = true; });
  }

  onOpen() { this._dirty = true; }
  dispose() { this._off?.(); }

  get codex() { return this.world.systems?.codex ?? null; }

  _refresh() {
    const codex = this.codex;
    if (!codex) return;
    if (!this._dirty && this._list.length && this._tabAt === this.tab) return;
    this._dirty = false;
    this._tabAt = this.tab;
    // `entries()` builds a card per definition, so it is emphatically not a per-frame
    // call. It runs on a discovery event or a tab change and nowhere else.
    this._list = codex.entries({ category: this.tab });
    this._list.sort((a, b) => {
      const d = (RANK[b.state] ?? 0) - (RANK[a.state] ?? 0);
      return d !== 0 ? d : String(a.name).localeCompare(String(b.name));
    });
    this._progress = codex.progress();
    if (!this.selected || this.selected.category !== this.tab) {
      const first = this._list.find((e) => e.state !== 'unknown') ?? this._list[0];
      this.selected = first ? { category: first.category, id: first.id } : null;
    }
  }

  // =========================================================================

  drawBody(P, x, y, w, h, hit, clip) {
    const codex = this.codex;
    if (!codex) {
      P.text('NO CODEX', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }
    this._refresh();

    // The list scrolls; the header and the card do not. `y` arrives already shifted by
    // the panel scroll, so the fixed furniture is drawn from `baseY`.
    const baseY = y + this.scroll;

    const headH = this._drawHeader(P, x, baseY, w, hit);
    const listTop = baseY + headH;

    P.vline(x + LIST_W, listTop - 4, (clip.clipBottom - PAD) - (listTop - 4), C.ruleDim);

    // The card is drawn first and the list is clipped to the left column, so the two
    // sets of hit regions can never overlap even though the list is pushed later.
    this._drawCard(P, x + LIST_W + 14, listTop, w - LIST_W - 14, clip, hit);

    P.pushClip(x - 4, listTop - 4, LIST_W, clip.clipBottom - listTop);
    const used = this._drawList(P, x, listTop - this.scroll, w, hit, clip);
    P.popClip();

    this.scrollMax = Math.max(0, used - (clip.clipBottom - listTop - PAD));
    void h;
  }

  _drawHeader(P, x, y, w, hit) {
    const pr = this._progress;
    P.label('KNOWLEDGE', x, y + 8, { color: C.inkFaint });
    P.text(String(pr?.knowledge ?? 0), x + 78, y + 8, { font: F.midBold, color: C.inkStrong });
    P.label('PERKS READ THIS NUMBER — WHAT YOU KNOW IS WHAT YOU CAN BUY', x + 116, y + 8,
      { color: C.inkFaint });

    // Category tabs, each carrying its own completion. A tab with a count on it is a
    // to-do list; a tab without one is furniture.
    let tx = x;
    for (const cat of TABS) {
      const p = pr?.[cat] ?? { seen: 0, total: 0 };
      const on = this.tab === cat;
      const label = `${TAB_LABEL[cat]} ${p.seen}/${p.total}`;
      const tw = P.measure(label, F.microBold, TRACK.label) + 14;
      if (on) P.fill(tx, y + 16, tw, 15, C.ink);
      else P.frame(tx, y + 16, tw, 15, C.ruleDim);
      P.text(label, tx + 7, y + 27, {
        font: F.microBold, color: on ? C.void : C.inkFaint, track: TRACK.label,
      });
      if (hit) hit.push({ kind: 'codex:tab', panel: this.id, tab: cat, x: tx, y: y + 16, w: tw, h: 15 });
      tx += tw + 5;
    }

    // The discovery ladder, explained once, here, rather than in five tooltips. The
    // legend is DROPPED, not overlapped, when the tab row has already taken the width:
    // `MATERIALS 3/7` ran 64 px through `DISCOVERY` on a clamped window, and a caption
    // half-buried under a tab is worse than no caption.
    if (tx < x + w - 268) P.label('DISCOVERY', x + w - 262, y + 27, { color: C.inkFaint });
    let lx = x + w - 175;
    for (let i = 0; i < DISCOVERY_STATES.length; i++) {
      P.fill(lx, y + 20, 7, 7, i === 0 ? C.track : C.inkFaint);
      P.label(DISCOVERY_STATES[i].slice(0, 3), lx + 3.5, y + 36, { color: C.inkFaint, align: 'center' });
      lx += 35;
    }

    P.hline(x, y + 44, w, C.rule);
    return 56;
  }

  _drawList(P, x, y, w, hit, clip) {
    let cy = y + 10;
    const top = cy;
    for (const e of this._list) {
      if (cy + 6 > clip.clipBottom) { this.hidden++; cy += ROW_H; continue; }
      if (cy < clip.clipTop - ROW_H) { cy += ROW_H; continue; }
      const sel = this.selected && this.selected.id === e.id && this.selected.category === e.category;
      const unknown = e.state === 'unknown';
      rowBack(P, x, cy - 11, LIST_W - 12, ROW_H - 2, { selected: sel });

      if (e.faction) P.fill(x, cy - 10, 2, ROW_H - 4, factionInk(e.faction).stripe);

      P.text(String(e.name).toUpperCase(), x + 7, cy, {
        font: sel ? F.bodyBold : F.small,
        color: unknown ? C.inkFaint : sel ? C.inkStrong : C.ink, maxW: LIST_W - 92 });
      this._ladder(P, x + LIST_W - 82, cy - 8, e.state);
      P.label(e.state.slice(0, 3), x + LIST_W - 14, cy, {
        color: unknown ? C.inkFaint : C.inkFaint, align: 'right',
      });

      if (hit) {
        hit.push({
          kind: 'codex:entry', panel: this.id, entryId: e.id, entryCat: e.category,
          x: x - 4, y: cy - 11, w: LIST_W - 4, h: ROW_H - 2,
        });
      }
      cy += ROW_H;
    }
    if (!this._list.length) {
      P.text('NOTHING REGISTERED', x, cy, { font: F.small, color: C.inkFaint, track: TRACK.label });
    }
    return cy - top + 10;
  }

  /** Five squares, filled to the entry's rank. Ordered, monotonic, glanceable. */
  _ladder(P, x, y, state) {
    const r = RANK[state] ?? 0;
    for (let i = 0; i < DISCOVERY_STATES.length; i++) {
      P.fill(x + i * 8, y, 6, 7, i <= r && r > 0 ? (i === r ? C.ink : C.inkFaint) : C.track);
    }
  }

  // =========================================================================
  // The card
  // =========================================================================

  _drawCard(P, x, y, w, clip, hit) {
    const sel = this.selected;
    const entry = sel ? this.codex.entry(sel.category, sel.id) : null;
    if (!entry) {
      P.text('SELECT AN ENTRY', x, y + 20, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }

    const unknown = entry.state === 'unknown';

    // Name, and the faction it belongs to. A tier-3 Concord lance and a tier-1 derelict
    // mount are not interchangeable and the card must not make them look it.
    // Clipped to the card. `COALITION HEAVY BROADSIDE` is 379 px at F.large and the
    // card is narrower than that the moment the window is clamped to the frame — it
    // was drawn straight through the panel's own right border.
    P.text(String(entry.name).toUpperCase(), x, y + 12, {
      font: F.large, color: unknown ? C.inkFaint : C.inkStrong, track: TRACK.head,
      maxW: Math.max(60, w - 52),
    });
    if (entry.faction) {
      const fi = factionInk(entry.faction);
      P.fill(x, y + 18, 2, 11, fi.stripe);
      P.text(fi.name.toUpperCase(), x + 8, y + 27, { font: F.micro, color: fi.hue, track: TRACK.label });
    }
    this._ladder(P, x + w - 44, y + 4, entry.state);
    P.label(entry.state, x + w, y + 27, { color: unknown ? C.inkFaint : C.inkFaint, align: 'right' });

    // The one-sentence functional description. Not flavour: what it does.
    let cy = y + 44;
    for (const line of wrap(P, entry.description || '--', F.small, w)) {
      P.text(line, x, cy, { font: F.small, color: unknown ? C.inkFaint : C.inkDim });
      cy += 13;
    }

    cy += 6;
    cy = tableHead(P, x, cy, w, [['FIELD', 0], ['VALUE', 108]]) + 13;

    // Fixed frame, variable slots. Every row is drawn whether or not it has a value;
    // a masked row prints `--` and stays in place.
    for (const f of entry.fields) {
      if (cy + 6 > clip.clipBottom) break;
      const masked = f.value === '--' || f.value === undefined || f.value === null;
      P.label(f.label, x, cy, { color: C.inkFaint });
      // A masked row prints `--` at a legible value, not at ghost: the point of keeping
      // the row is that the player can SEE which slot they have not earned yet, and a
      // dash they cannot read is the hidden row this discipline exists to avoid.
      P.text(String(masked ? '--' : f.value).toUpperCase(), x + 108, cy, {
        font: F.small, color: masked ? C.inkFaint : C.ink, track: TRACK.value, maxW: w - 112 });
      P.hline(x, cy + 3, w, C.ruleDim);
      cy += 14;
    }

    if (entry.links?.length && cy < clip.clipBottom - 30) {
      cy += 8;
      P.label('CROSS-REFERENCE', x, cy, { color: C.inkFaint });
      P.hline(x, cy + 4, w, C.rule);
      cy += 15;
      for (const l of entry.links) {
        if (cy > clip.clipBottom - 6) break;
        const name = P.clip(String(l.name).toUpperCase(), F.small, w - 112);
        P.label(l.relation, x, cy, { color: C.inkFaint });
        P.text(name, x + 108, cy, { font: F.small, color: C.inkDim });
        // Underline: this is a thing you can follow, and the interface has no other
        // affordance for that (no hover cursor over a canvas with pointer-events off).
        P.rule(x + 108, cy + 2, P.measure(name, F.small, TRACK.value), P.hair, C.track);
        if (hit) {
          hit.push({
            kind: 'codex:link', panel: this.id, entryId: l.id, entryCat: l.category,
            x, y: cy - 10, w, h: 13,
          });
        }
        cy += 14;
      }
    }
  }

  onClick(region) {
    if (region.kind === 'codex:tab') {
      this.tab = region.tab;
      this.scroll = 0;
      this._dirty = true;
      return true;
    }
    if (region.kind === 'codex:entry' || region.kind === 'codex:link') {
      this.selected = { category: region.entryCat, id: region.entryId };
      if (region.kind === 'codex:link' && region.entryCat !== this.tab) {
        this.tab = region.entryCat;
        this.scroll = 0;
        this._dirty = true;
      }
      return true;
    }
    return false;
  }
}

/** Greedy word wrap against the painter's cached measurer. */
const _wrapOut = [];
function wrap(P, str, font, maxW) {
  _wrapOut.length = 0;
  const words = String(str).split(/\s+/);
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (P.measure(next, font, TRACK.value) > maxW && line) {
      _wrapOut.push(line);
      line = word;
      if (_wrapOut.length >= 4) break;
    } else {
      line = next;
    }
  }
  if (line && _wrapOut.length < 5) _wrapOut.push(line);
  return _wrapOut;
}

export { CODEX_CATEGORIES };
