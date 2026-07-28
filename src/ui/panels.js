/**
 * FLOATING PANELS.
 *
 * `docs/design/reference-ui-language.md` §2 read this off the reference frame directly:
 * every panel there is an independent window with a thin 1 px border, no rounding, no
 * shadow, no gradient, a title bar carrying the name in small caps with a ⋮ and an ×,
 * and a near-opaque black fill. They overlap freely and nothing is docked.
 *
 * That is not a style preference here, it is the fix for two named defects at once:
 *
 *   1. TEXT LEGIBILITY OVER A BRIGHT PLANET. §3: the reference's type is small, dense
 *      and readable because the plate behind it is near-opaque — not because the type
 *      is large. Every panel below fills `C.panel` first and draws afterwards.
 *
 *   2. THE HUD OCCLUDING THE SHIP. The audit's complaint is that welded chrome sits on
 *      the cruiser at common framings. A panel you can close, and drag, cannot.
 *
 * COST. Everything here is drawn onto the SAME single 2D overlay canvas as the rest of
 * the interface. Zero draw calls, zero geometries, zero programs and zero materials are
 * added to the 3D scene, which matters because the benchmark is already over its
 * committed 320-call ceiling and this stream is not allowed to make that worse.
 *
 * INPUT. The overlay canvas keeps `pointer-events: none` so the world still receives
 * every click that is not on a panel. `UILayer` runs window-level capture-phase pointer
 * handlers, asks this host whether the point is over anything, and only then stops the
 * event reaching the flight controls. A panel therefore costs the player nothing when
 * it is closed and takes exactly the pixels it occupies when it is open.
 */

import { C, F, TRACK } from './theme.js';

export const TITLE_H = 19;
export const PAD = 10;

/** Scroll wheel step, in CSS pixels of content. */
const WHEEL_STEP = 46;

export class Panel {
  /**
   * @param {Object} opts
   * @param {string} opts.id        stable id; also the toggle key's payload
   * @param {string} opts.title     shown in the title bar, small caps
   * @param {number} opts.w @param {number} opts.h
   * @param {string} [opts.hint]    key hint drawn at the right of the title bar
   * @param {(P:Object)=>{x:number,y:number}} opts.place  default position, from the frame
   */
  constructor({ id, title, w, h, hint = '', place }) {
    this.id = id;
    this.title = title;
    this.w = w;
    this.h = h;
    this.hint = hint;
    this._place = place;
    this.open = false;
    this.collapsed = false;
    /** null until first shown, then sticky: a dragged panel stays where it was put. */
    this.x = null;
    this.y = null;
    this.scroll = 0;
    this.scrollMax = 0;
    /** Per-panel selection state, owned by the subclass. */
    this.selected = null;
  }

  /** Panel body, in panel-local content coordinates. Override. */
  drawBody(/* P, x, y, w, h, hit */) {}

  /** Called when a hit region belonging to this panel is clicked. Override. */
  onClick(/* region */) { return false; }

  /** Called once each time the panel is opened. Override for cache invalidation. */
  onOpen() {}

  get bodyH() { return this.h - TITLE_H; }
}

export class PanelHost {
  constructor(ui) {
    this.ui = ui;
    /** @type {Panel[]} draw order: last is on top. */
    this.panels = [];
    this.drag = null;
    this.hover = null;
  }

  add(panel) {
    this.panels.push(panel);
    return panel;
  }

  get(id) {
    for (const p of this.panels) if (p.id === id) return p;
    return null;
  }

  /** True when at least one panel is open — used to decide whether to hit-test at all. */
  get anyOpen() {
    for (const p of this.panels) if (p.open) return true;
    return false;
  }

  toggle(id) {
    const p = this.get(id);
    if (!p) return null;
    p.open = !p.open;
    if (p.open) {
      p.onOpen();
      this.raise(p);
    }
    return p;
  }

  close(id) {
    const p = this.get(id);
    if (p) p.open = false;
    return p;
  }

  closeAll() {
    let n = 0;
    for (const p of this.panels) if (p.open) { p.open = false; n++; }
    return n;
  }

  raise(panel) {
    const i = this.panels.indexOf(panel);
    if (i < 0 || i === this.panels.length - 1) return;
    this.panels.splice(i, 1);
    this.panels.push(panel);
  }

  // =========================================================================
  // Draw
  // =========================================================================

  draw(P, hit) {
    for (const panel of this.panels) {
      if (!panel.open) continue;
      this._layout(P, panel);
      this._drawOne(P, panel, hit);
    }
  }

  /** Resolve a default position on first show, then keep the panel inside the frame. */
  _layout(P, panel) {
    if (panel.x === null || panel.y === null) {
      const at = panel._place ? panel._place(P) : { x: 40, y: 40 };
      panel.x = at.x;
      panel.y = at.y;
    }
    const h = panel.collapsed ? TITLE_H : panel.h;
    panel.x = Math.max(4, Math.min(P.w - panel.w - 4, panel.x));
    panel.y = Math.max(4, Math.min(P.h - h - 4, panel.y));
  }

  _drawOne(P, panel, hit) {
    const { x, y, w } = panel;
    const collapsed = panel.collapsed;
    const h = collapsed ? TITLE_H : panel.h;

    // Near-opaque plate first. This is the whole legibility mechanism.
    P.fill(x, y, w, h, C.panel);
    P.fill(x, y, w, TITLE_H, C.panelTitle);
    P.hline(x, y + TITLE_H - 1, w, C.rule);
    P.frame(x, y, w, h, C.rule);

    P.label(panel.title, x + PAD, y + 13, { color: C.inkDim, font: F.micro });
    if (panel.hint) {
      P.label(panel.hint, x + w - 44, y + 13, { color: C.inkGhost, align: 'right', font: F.micro });
    }

    // ⋮ collapse and × close, in the reference's own order.
    const bx = x + w - 34;
    P.text('⋮', bx + 5, y + 13, { font: F.body, color: C.inkFaint, align: 'center' });
    P.text('×', bx + 22, y + 13, { font: F.mid, color: C.inkFaint, align: 'center' });

    if (hit) {
      hit.push({ kind: 'panel:collapse', panel: panel.id, x: bx - 3, y: y + 2, w: 16, h: 15 });
      hit.push({ kind: 'panel:close', panel: panel.id, x: bx + 14, y: y + 2, w: 16, h: 15 });
      // The title bar is the drag handle, and it is claimed AFTER the two buttons so
      // the later-pushed buttons win the pick (UILayer._pick walks backward).
      hit.push({ kind: 'panel:title', panel: panel.id, x, y, w: w - 38, h: TITLE_H });
    }

    if (collapsed) return;

    const bodyX = x;
    const bodyY = y + TITLE_H;
    const bodyH = h - TITLE_H;

    // Everything the body draws is clipped to the panel, so a long table scrolls
    // rather than bleeding across the frame.
    P.pushClip(bodyX, bodyY, w, bodyH);
    try {
      panel.drawBody(P, bodyX + PAD, bodyY + PAD - panel.scroll, w - PAD * 2, bodyH - PAD * 2, hit, {
        clipTop: bodyY, clipBottom: bodyY + bodyH,
      });
    } finally {
      P.popClip();
    }

    // Scrollbar. A hairline track with a proportional thumb — present only when the
    // content genuinely overflows, so it doubles as the "there is more" cue.
    if (panel.scrollMax > 1) {
      const trackH = bodyH - 8;
      const frac = trackH / (trackH + panel.scrollMax);
      const thumbH = Math.max(18, trackH * frac);
      const t = panel.scroll / panel.scrollMax;
      P.fill(x + w - 4, bodyY + 4, 2, trackH, C.inkGhost);
      P.fill(x + w - 4, bodyY + 4 + (trackH - thumbH) * t, 2, thumbH, C.inkFaint);
    }

    if (hit) hit.push({ kind: 'panel:body', panel: panel.id, x, y: bodyY, w, h: bodyH });
  }

  // =========================================================================
  // Input
  // =========================================================================

  /** @returns {boolean} true when the host consumed the event. */
  onPointerDown(region, x, y) {
    if (!region || !region.panel) return false;
    const panel = this.get(region.panel);
    if (!panel) return false;
    this.raise(panel);
    if (region.kind === 'panel:close') { panel.open = false; return true; }
    if (region.kind === 'panel:collapse') { panel.collapsed = !panel.collapsed; return true; }
    if (region.kind === 'panel:title') {
      this.drag = { panel, dx: x - panel.x, dy: y - panel.y };
      return true;
    }
    if (panel.onClick(region)) return true;
    // A click that landed on the panel but on nothing interactive is still consumed:
    // clicking a window must never also order the ship somewhere behind it.
    return region.kind === 'panel:body' || String(region.kind).startsWith('panel:');
  }

  onPointerMove(x, y) {
    if (!this.drag) return false;
    this.drag.panel.x = x - this.drag.dx;
    this.drag.panel.y = y - this.drag.dy;
    return true;
  }

  onPointerUp() {
    const was = !!this.drag;
    this.drag = null;
    return was;
  }

  /** @returns {boolean} true when a panel took the wheel. */
  onWheel(region, delta) {
    if (!region || !region.panel) return false;
    const panel = this.get(region.panel);
    if (!panel || panel.collapsed || panel.scrollMax <= 0) return false;
    panel.scroll = Math.max(0, Math.min(panel.scrollMax, panel.scroll + Math.sign(delta) * WHEEL_STEP));
    return true;
  }
}

// ---------------------------------------------------------------------------
// Shared row furniture. Every panel in this stream draws its tables the same way,
// because the reference's tables all have real column headers and hard rules.
// ---------------------------------------------------------------------------

/**
 * A table header row: labels at fixed column x-offsets, with a rule under it.
 * @param {Array<[string, number, ('left'|'right')?]>} cols
 * @returns {number} the y below the rule
 */
export function tableHead(P, x, y, w, cols) {
  for (const [label, cx, align] of cols) {
    P.label(label, x + cx, y, { color: C.inkGhost, align: align ?? 'left' });
  }
  P.hline(x, y + 4, w, C.rule);
  return y + 4;
}

/** The zebra/selection backing for one row. Returns nothing; draw content after. */
export function rowBack(P, x, y, w, h, { selected = false, hover = false } = {}) {
  if (selected) {
    P.fill(x - 4, y, w + 8, h, C.scrimHard);
    P.fill(x - 4, y, 2, h, C.select);
    P.frame(x - 4, y, w + 8, h, C.ruleDim);
  } else if (hover) {
    P.fill(x - 4, y, w + 8, h, C.scrimSoft);
  }
}

/** `mm:ss` from seconds. Objectives and reload timers both read as clocks. */
export function fmtClock(seconds) {
  if (!Number.isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** A cost object rendered as `12 ALLOY · 4 EXOTIC`, with shortfalls called out. */
export function fmtCost(cost) {
  if (!cost) return '--';
  const parts = [];
  for (const k in cost) {
    const v = cost[k];
    if (typeof v !== 'number' || v <= 0) continue;
    parts.push(`${v} ${k.slice(0, 4).toUpperCase()}`);
  }
  return parts.length ? parts.join(' · ') : '--';
}
