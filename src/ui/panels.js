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

export const TITLE_H = 20;
export const PAD = 10;

/**
 * Height reserved at the bottom of every panel body for the overflow footer.
 *
 * Content used to be clipped by the panel's own border, which sliced glyphs in half:
 * the HULL window's `MODULE / MOUNT / COST` header was cut through the middle with
 * the whole table body missing below it, and MATERIALS lost its last claims row the
 * same way. A hard border through a row of type reads as a rendering fault, not as
 * "there is more". So content clips ABOVE this strip and the strip says what is left.
 */
const FOOT_H = 15;

/** Scroll wheel step, in logical pixels of content. */
const WHEEL_STEP = 46;

export class Panel {
  /**
   * @param {Object} opts
   * @param {string} opts.id        stable id; also the toggle key's payload
   * @param {string} opts.title     shown in the title bar, small caps
   * @param {number} opts.w @param {number} opts.h
   * @param {string} [opts.hint]    key hint drawn at the right of the title bar
   * @param {number} [opts.maxH]    grow to this if the content needs it
   */
  constructor({ id, title, w, h, hint = '', maxH = 0 }) {
    this.id = id;
    this.title = title;
    this.w = w;
    this.h = h;
    /**
     * The panel grows toward this when its content overflows and the frame has the
     * room, rather than silently cutting the last row. Defaults to half again.
     */
    this.maxH = maxH || Math.round(h * 1.5);
    this.baseH = h;
    this.hint = hint;
    this.open = false;
    this.collapsed = false;
    /** null until the solver places it. */
    this.x = null;
    this.y = null;
    /** True once the player has dragged it: the solver stops moving it. */
    this.pinned = false;
    this.scroll = 0;
    this.scrollMax = 0;
    /** Rows still below the fold, published by the body for the footer. */
    this.hidden = 0;
    /** Per-panel selection state, owned by the subclass. */
    this.selected = null;
  }

  /** Panel body, in panel-local content coordinates. Override. */
  drawBody(/* P, x, y, w, h, hit */) {}

  /** Called when a hit region belonging to this panel is clicked. Override. */
  onClick(/* region */) { return false; }

  /** Called once each time the panel is opened. Override for cache invalidation. */
  onOpen() {}

  get bodyH() { return this.h - TITLE_H - FOOT_H; }
}

/**
 * THE SPAWN SOLVER.
 *
 * The standing review finding on this interface is that the chrome sits on the
 * cruiser: measured by diffing one pose with the HUD on and off, 99.0 % of the
 * ship's pixels were altered by the HUD at the everyday three-quarter view, and the
 * concentration was worst exactly where the subject is - 15.5 % of the frame overall
 * but 36.3 % of the central half. Homeworld and NEBULOUS both push chrome to the
 * edges and keep the centre empty, and reference-ui-language.md item 4 prescribes
 * floating closable panels for precisely this reason.
 *
 * A closable panel is only half the fix, because a panel that OPENS on the ship is
 * still a panel that covered the ship. So a window is never placed at a fixed anchor
 * any more. It is scored against the frame:
 *
 *   - overlapping the ship's projected bounding box is enormously expensive
 *   - overlapping a reserved region (the player-state block, the target block, the
 *     time strip) is expensive
 *   - overlapping another open window is expensive, and overlapping another
 *     window's TITLE BAR is worse, because a buried title bar takes the close
 *     button with it
 *   - being far from the frame edge costs a little, which breaks ties toward the
 *     margins the way the reference frames do
 *
 * The search is a coarse grid - 24 logical pixels - which is a few hundred boxes and
 * costs nothing at the rate windows are opened. It re-runs when the ship's box moves
 * far enough to matter, and it never touches a window the player has dragged.
 */
const GRID = 24;

function overlap(ax, ay, aw, ah, b) {
  if (!b) return 0;
  const w = Math.min(ax + aw, b.x + b.w) - Math.max(ax, b.x);
  if (w <= 0) return 0;
  const h = Math.min(ay + ah, b.y + b.h) - Math.max(ay, b.y);
  return h > 0 ? w * h : 0;
}

export class PanelHost {
  constructor(ui) {
    this.ui = ui;
    /** @type {Panel[]} draw order: last is on top. */
    this.panels = [];
    this.drag = null;
    this.hover = null;
    /**
     * Rectangles the solver treats as occupied. `ship` is rebuilt every frame from
     * the player's projected bounding sphere; the rest are the welded readouts, and
     * the player-state block in particular is a region NO WINDOW MAY ENTER - the
     * OBJECTIVES window used to cover its top three rows and take HULL INTEGRITY and
     * the BOW mount off the screen entirely.
     */
    this.ship = null;
    this.reserved = [];
    this._shipAt = { x: -1e9, y: -1e9 };
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
      // A window opened by hand is placed fresh: the ship has moved, the other
      // windows have moved, and the position that was free last time may be on the
      // hull now. Only a DRAGGED window keeps its place.
      if (!p.pinned) { p.x = null; p.y = null; }
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
    // The ship's box moving is what invalidates a placement, so it is checked once
    // per frame rather than per panel. A slow camera drift must not make the windows
    // hop about: only a move of more than a third of the ship's own width re-solves.
    const ship = this.ship;
    if (ship) {
      const moved = Math.abs(ship.x - this._shipAt.x) + Math.abs(ship.y - this._shipAt.y);
      if (moved > Math.max(60, ship.w * 0.34)) {
        this._shipAt.x = ship.x;
        this._shipAt.y = ship.y;
        for (const p of this.panels) {
          if (p.open && !p.pinned && overlap(p.x ?? 0, p.y ?? 0, p.w, p.h, ship) > 0) {
            p.x = null; p.y = null;
          }
        }
      }
    }

    for (const panel of this.panels) {
      if (!panel.open) continue;
      this._layout(P, panel);
    }
    // A title bar may never be covered - it carries the close button, and a window
    // whose close button is under another window is a window the player cannot get
    // rid of. Anything whose title strip is buried comes to the top.
    this._raiseBuriedTitles();
    for (const panel of this.panels) {
      if (!panel.open) continue;
      this._drawOne(P, panel, hit);
    }
  }

  /** Resolve a position on first show, then keep the panel inside the frame. */
  _layout(P, panel) {
    if (panel.x === null || panel.y === null) {
      const at = this.solve(P, panel);
      panel.x = at.x;
      panel.y = at.y;
    }
    // A panel may never be taller than the frame it lives in: growth toward `maxH`
    // is only worth having while the extra rows are still on screen.
    panel.h = Math.min(panel.h, Math.max(TITLE_H + FOOT_H + 40, P.h - 8));
    const h = panel.collapsed ? TITLE_H : panel.h;
    panel.x = Math.max(4, Math.min(P.w - panel.w - 4, panel.x));
    panel.y = Math.max(4, Math.min(P.h - h - 4, panel.y));
  }

  /**
   * Score every grid position and take the cheapest. See the header for the weights.
   * @returns {{x:number, y:number}}
   */
  solve(P, panel) {
    const w = Math.min(panel.w, P.w - 8);
    const h = Math.min(panel.collapsed ? TITLE_H : panel.h, P.h - 8);
    const maxX = Math.max(4, P.w - w - 4);
    const maxY = Math.max(4, P.h - h - 4);

    let bestX = maxX;
    let bestY = 4;
    let best = Infinity;

    for (let y = 4; y <= maxY; y += GRID) {
      for (let x = 4; x <= maxX; x += GRID) {
        let cost = 0;
        cost += overlap(x, y, w, h, this.ship) * 14;
        for (const r of this.reserved) {
          // HARD regions - the player-state block and the target block - are readouts
          // the player is steering by and a window may not enter them at any price.
          // SOFT ones are welded chrome that can be covered when the frame is full;
          // burying a sibling WINDOW is worse than covering the time strip.
          cost += overlap(x, y, w, h, r) * (r.hard ? 14 : 1.5);
        }
        for (const other of this.panels) {
          if (other === panel || !other.open || other.x === null) continue;
          const oh = other.collapsed ? TITLE_H : other.h;
          cost += overlap(x, y, w, h, { x: other.x, y: other.y, w: other.w, h: oh }) * 3;
          // Burying somebody's title bar is a category worse than merely overlapping.
          cost += overlap(x, y, w, h, { x: other.x, y: other.y, w: other.w, h: TITLE_H }) * 40;
        }
        // Tie-break toward the margins: the reference keeps the centre of the frame
        // for the world and this is what reproduces that without hard-coding anchors.
        const cx = x + w * 0.5 - P.w * 0.5;
        const cy = y + h * 0.5 - P.h * 0.5;
        cost += (Math.max(0, 1 - Math.abs(cx) / (P.w * 0.5)) + Math.max(0, 1 - Math.abs(cy) / (P.h * 0.5))) * 900;
        if (cost < best) { best = cost; bestX = x; bestY = y; if (cost === 0) return { x, y }; }
      }
    }
    return { x: bestX, y: bestY };
  }

  _raiseBuriedTitles() {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < this.panels.length; i++) {
        const a = this.panels[i];
        if (!a.open || a.x === null) continue;
        for (let j = i + 1; j < this.panels.length; j++) {
          const b = this.panels[j];
          if (!b.open || b.x === null) continue;
          const bh = b.collapsed ? TITLE_H : b.h;
          if (overlap(a.x, a.y, a.w, TITLE_H, { x: b.x, y: b.y, w: b.w, h: bh }) > 0) {
            this.raise(a);
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
      if (!moved) return;
    }
  }

  _drawOne(P, panel, hit) {
    const { x, y, w } = panel;
    const collapsed = panel.collapsed;
    const h = collapsed ? TITLE_H : panel.h;

    // THE OPAQUE PLATE. This is the whole legibility mechanism - see theme.js C.panel.
    P.plate(x, y, w, h, { title: TITLE_H });

    P.label(panel.title, x + PAD, y + 14, { color: C.inkDim, font: F.micro });
    // The key hint sits LEFT of the two buttons, not under them: at x+w-40 the chip
    // and the ⋮ at x+w-34 were drawn into the same six pixels.
    if (panel.hint) {
      P.chipOutline(panel.hint, x + w - 44, y + 4, {
        color: C.inkFaint, h: 13, padX: 4, align: 'right',
      });
    }

    // ⋮ collapse and × close, in the reference's own order.
    const bx = x + w - 34;
    P.text('⋮', bx + 5, y + 14, { font: F.body, color: C.inkDim, align: 'center' });
    P.text('×', bx + 22, y + 14, { font: F.mid, color: C.inkDim, align: 'center' });

    if (hit) {
      hit.push({ kind: 'panel:collapse', panel: panel.id, x: bx - 3, y: y + 2, w: 16, h: 16 });
      hit.push({ kind: 'panel:close', panel: panel.id, x: bx + 14, y: y + 2, w: 16, h: 16 });
      // The title bar is the drag handle, and it is claimed AFTER the two buttons so
      // the later-pushed buttons win the pick (UILayer._pick walks backward).
      hit.push({ kind: 'panel:title', panel: panel.id, x, y, w: w - 38, h: TITLE_H });
    }

    if (collapsed) return;

    const bodyX = x;
    const bodyY = y + TITLE_H;
    const bodyH = h - TITLE_H - FOOT_H;
    const footY = y + h - FOOT_H;

    panel.hidden = 0;
    P.owner = panel.id;
    // Everything the body draws is clipped ABOVE the footer strip, so an overflowing
    // table is cut by a deliberate edge with a count beside it rather than by the
    // panel's own border through the middle of a word.
    P.pushClip(bodyX, bodyY, w, bodyH);
    try {
      panel.drawBody(P, bodyX + PAD, bodyY + PAD - panel.scroll, w - PAD * 2, bodyH - PAD * 2, hit, {
        clipTop: bodyY, clipBottom: bodyY + bodyH,
      });
    } finally {
      P.popClip();
      P.owner = '';
    }

    /**
     * GROW BEFORE YOU SCROLL.
     *
     * A panel that is three rows short of fitting should be three rows taller, not
     * scrollable. It grows toward `maxH` while the frame has the room and shrinks
     * back when the content does, damped to one step a frame so a table whose last
     * row appears and disappears cannot make the window flutter.
     */
    if (panel.scrollMax > 0 && panel.h < panel.maxH) {
      panel.h = Math.min(panel.maxH, panel.h + Math.min(48, panel.scrollMax + FOOT_H));
      if (panel.y + panel.h > P.h - 4) panel.y = Math.max(4, P.h - panel.h - 4);
    } else if (panel.scrollMax === 0 && panel.h > panel.baseH) {
      panel.h = Math.max(panel.baseH, panel.h - 24);
    }
    panel.scroll = Math.min(panel.scroll, panel.scrollMax);

    // --- the footer ---------------------------------------------------------
    P.fill(x, footY, w, FOOT_H, C.panelTitle);
    P.hline(x, footY, w, C.rule);
    if (panel.scrollMax > 0.5) {
      const rows = panel.hidden || Math.ceil(panel.scrollMax / 15);
      const atEnd = panel.scroll >= panel.scrollMax - 0.5;
      P.label(atEnd ? `▲ ${rows} ABOVE · SCROLL` : `▼ ${rows} MORE · SCROLL`, x + PAD, footY + 11,
        { color: C.inkDim });
      // Scrollbar: a hairline track with a proportional thumb.
      const trackH = bodyH - 8;
      const frac = trackH / (trackH + panel.scrollMax);
      const thumbH = Math.max(18, trackH * frac);
      const t = panel.scroll / panel.scrollMax;
      P.fill(x + w - 5, bodyY + 4, 2, trackH, C.track);
      P.fill(x + w - 5, bodyY + 4 + (trackH - thumbH) * t, 2, thumbH, C.inkDim);
    } else {
      P.label(panel.footNote ?? '', x + PAD, footY + 11, { color: C.inkFaint });
    }
    P.frame(x, y, w, h, C.rule);

    if (hit) hit.push({ kind: 'panel:body', panel: panel.id, x, y: bodyY, w, h: bodyH + FOOT_H });
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
    // Once a window has been placed by hand, the solver leaves it alone for good.
    this.drag.panel.pinned = true;
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
    if (!label) continue;
    P.label(label, x + cx, y, { color: C.inkFaint, align: align ?? 'left' });
  }
  P.hline(x, y + 4, w, C.rule);
  return y + 4;
}

/**
 * COLUMN ORIGINS MEASURED FROM THE CONTENT, NOT GUESSED.
 *
 * Fixed offsets are how `STARBOARD NACELLE` came to print as `STARBOARD NACELLEENGINE`
 * with no gap at all, and how the ARMAMENT panel got `GRANTS` and `100%` overlapping in
 * one cell. The widest string a column will hold is knowable before the column is
 * placed, so it is measured and the next origin starts past it.
 *
 * A `flex` column takes what is left; a `right` column is measured too, which is what
 * reserves a fixed lane for a status chip so a cost string can never be drawn under it.
 *
 * @param {Array<{key:string,label?:string,items?:string[],min?:number,font?:string,
 *                align?:'left'|'right',flex?:boolean,pad?:number}>} spec
 * @returns {Object} key -> {x, w, align, label}, plus `_total`
 */
export function columns(P, spec, w) {
  const out = {};
  const widths = [];
  let fixed = 0;
  for (const col of spec) {
    if (col.flex) { widths.push(0); continue; }
    const font = col.font ?? F.small;
    let cw = col.label ? P.measure(String(col.label), F.micro, TRACK.label) : 0;
    for (const s of col.items ?? []) {
      const m = P.measure(String(s), font, TRACK.value);
      if (m > cw) cw = m;
    }
    cw = Math.max(col.min ?? 0, cw) + (col.pad ?? 12);
    widths.push(cw);
    fixed += cw;
  }
  const flexN = spec.reduce((n, c) => n + (c.flex ? 1 : 0), 0);
  const flexW = flexN ? Math.max(56, (w - fixed) / flexN) : 0;
  let cx = 0;
  for (let i = 0; i < spec.length; i++) {
    const col = spec[i];
    const cw = col.flex ? flexW : widths[i];
    out[col.key] = { x: cx, w: cw, align: col.align ?? 'left', label: col.label ?? '' };
    cx += cw;
  }
  out._total = cx;
  return out;
}

/** Draw a `columns()` result as a header row. Returns the y below the rule. */
export function columnHead(P, cols, spec, x, y, w) {
  for (const col of spec) {
    const c = cols[col.key];
    if (!c || !c.label) continue;
    P.label(c.label, x + (c.align === 'right' ? c.x + c.w - 4 : c.x), y,
      { color: C.inkFaint, align: c.align });
  }
  P.hline(x, y + 4, w, C.rule);
  return y + 4;
}

/** Text placed inside a measured column, clipped to that column and never past it. */
export function cell(P, cols, key, x, y, str, opts = {}) {
  const c = cols[key];
  if (!c) return;
  const font = opts.font ?? F.small;
  const track = opts.track ?? TRACK.value;
  const inner = Math.max(8, c.w - 8);
  const s = P.clip(String(str), font, inner, track);
  P.text(s, x + (c.align === 'right' ? c.x + c.w - 4 : c.x), y, { ...opts, font, track, align: c.align });
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
