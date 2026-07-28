/**
 * UI THEME AND PAINTER.
 *
 * The whole HUD is ONE 2D canvas. Not a canvas per panel, not a DOM tree, and above
 * all not geometry in the 3D scene: the draw-call ceiling in units.js is 320 and
 * committed, and a UI that spends thirty of them on brackets and bars is a UI that
 * has taken them from the ships. One overlay canvas costs the 3D renderer exactly
 * nothing.
 *
 * CRISPNESS AT ANY DPR
 * The backing store is sized in DEVICE pixels and the context is scaled by the
 * device pixel ratio, so every coordinate below is in CSS pixels and every glyph is
 * rendered at native resolution. Rules and borders are drawn as `fillRect` snapped
 * to the device pixel grid rather than as strokes - a 1 px stroke centred on an
 * integer coordinate straddles two device rows and comes out as two half-lit greys,
 * which is exactly the mush this game's visual language cannot afford.
 *
 * COLOUR
 * Every colour comes from art/palette.js, either declared or derived through
 * `mix`/`shade`, so `paletteAudit()` stays clean. The rules of the house style:
 *
 *   - The interface is MONOCHROME. Value carries hierarchy, not hue.
 *   - Hostile red, salvage cyan, friendly green and warn orange are the only
 *     non-neutral colours, and each one means exactly one thing.
 *   - FACTION HUES APPEAR ON FACTION THINGS ONLY: a salvaged part's identity stripe,
 *     a contact's classification. Never on a bar, never on a rule, never as decor.
 *   - No rounded corners, no drop shadows, no gradients used as decoration. The one
 *     gradient in the file is the scrim behind dense text, and it is there so black
 *     text panels do not cut a rectangle out of space.
 */

import * as THREE from 'three';
import { NEUTRAL, getFactionPalette, mix, shade } from '../art/palette.js';
import { salvageState, CONDITION } from '../sim/condition.js';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const R = (v) => (v >> 16) & 0xff;
const G = (v) => (v >> 8) & 0xff;
const B = (v) => v & 0xff;

/** CSS colour from a palette hex. Allocates a string - call at build time. */
export function rgba(hex, alpha = 1) {
  return alpha >= 1
    ? `rgb(${R(hex)},${G(hex)},${B(hex)})`
    : `rgba(${R(hex)},${G(hex)},${B(hex)},${alpha.toFixed(3)})`;
}

/**
 * The interface's value ramp, derived once from the neutral palette.
 *
 * `ink` is a cool bone-white: the bright end of the ramp and the only thing in the
 * frame allowed to be near-white apart from a firing solution. Everything below it
 * is the same colour at lower value, which is what keeps forty readouts on screen
 * from turning into forty competing objects.
 */
const INK_BASE = mix(NEUTRAL.select, NEUTRAL.ice, 0.74);
const STRUCT_BASE = shade(NEUTRAL.ice, 0.55);

export const C = {
  ink: rgba(INK_BASE, 0.96),
  inkStrong: rgba(mix(INK_BASE, NEUTRAL.ice, 0.4), 1),
  inkDim: rgba(INK_BASE, 0.62),
  inkFaint: rgba(INK_BASE, 0.38),
  inkGhost: rgba(INK_BASE, 0.17),

  rule: rgba(STRUCT_BASE, 0.42),
  ruleDim: rgba(STRUCT_BASE, 0.20),
  ruleBright: rgba(STRUCT_BASE, 0.80),

  /** Panel scrims. Near-black, because the frame behind them is near-black. */
  scrim: rgba(NEUTRAL.spaceBlack, 0.72),
  scrimHard: rgba(NEUTRAL.spaceBlack, 0.90),
  scrimSoft: rgba(NEUTRAL.spaceBlack, 0.42),
  /**
   * The floating-panel backing. reference-ui-language.md §3 is explicit that the
   * reference's dense small type is legible over a bright nebula BECAUSE the plate
   * behind it is near-opaque, not because the type is large. 0.955 is as far as this
   * can go and still read as a window sitting on the frame rather than a hole cut
   * out of it; the 1 px border does the rest of the work.
   */
  panel: rgba(NEUTRAL.spaceBlack, 0.955),
  panelTitle: rgba(NEUTRAL.spaceBlack, 0.99),
  void: rgba(NEUTRAL.void, 1),

  hostile: rgba(NEUTRAL.hostile, 1),
  hostileDim: rgba(NEUTRAL.hostile, 0.44),
  hostileGhost: rgba(NEUTRAL.hostile, 0.16),
  friendly: rgba(NEUTRAL.friendly, 1),
  friendlyDim: rgba(NEUTRAL.friendly, 0.46),
  salvage: rgba(NEUTRAL.salvage, 1),
  salvageDim: rgba(NEUTRAL.salvage, 0.44),
  salvageGhost: rgba(NEUTRAL.salvage, 0.14),
  select: rgba(NEUTRAL.select, 1),
  selectDim: rgba(NEUTRAL.select, 0.50),

  warn: rgba(getFactionPalette('player').warn, 1),
  warnDim: rgba(getFactionPalette('player').warn, 0.48),
  warnGhost: rgba(getFactionPalette('player').warn, 0.15),

  shield: rgba(NEUTRAL.shieldHit, 1),
  shieldDim: rgba(NEUTRAL.shieldHit, 0.42),
};

/**
 * Faction identity. Two values each: the hue itself, and a dim version for a
 * stripe that has to sit next to text without shouting over it. This is the ONLY
 * place the interface is allowed to be chromatic, and it is spent on the one thing
 * the game is about - where a part came from.
 */
export const FACTION_INK = {};
for (const id of ['coalition', 'concord', 'derelict', 'player']) {
  const p = getFactionPalette(id);
  FACTION_INK[id] = {
    id,
    name: p.name,
    hue: rgba(p.emissive, 1),
    stripe: rgba(p.emissive, 0.85),
    dim: rgba(p.emissive, 0.34),
    ghost: rgba(p.emissive, 0.13),
    trim: rgba(p.trim, 0.9),
  };
}
export const factionInk = (id) => FACTION_INK[id] ?? FACTION_INK.player;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

const STACK = 'ui-monospace, "SF Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

export const F = {
  micro: `9px ${STACK}`,
  microBold: `600 9px ${STACK}`,
  small: `10px ${STACK}`,
  body: `11px ${STACK}`,
  bodyBold: `600 11px ${STACK}`,
  mid: `13px ${STACK}`,
  midBold: `600 13px ${STACK}`,
  large: `600 17px ${STACK}`,
  huge: `600 26px ${STACK}`,
};

/** Tracking, in em, applied through ctx.letterSpacing where the engine has it. */
export const TRACK = { label: '0.16em', head: '0.24em', value: '0.02em', none: '0em' };

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtRange(metres) {
  if (!Number.isFinite(metres)) return '---';
  if (metres < 1000) return `${Math.round(metres)} M`;
  if (metres < 10000) return `${(metres / 1000).toFixed(2)} KM`;
  return `${(metres / 1000).toFixed(1)} KM`;
}

export const fmtPct = (v) => `${Math.round(THREE.MathUtils.clamp(v, 0, 1) * 100)}%`;
export const fmtDeg = (rad) => `${Math.round((rad * 180) / Math.PI)}°`;
export const fmtSigned = (v, unit = '%') => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}${unit}`;

export function fmtMass(tonnes) {
  if (tonnes >= 1000) return `${(tonnes / 1000).toFixed(1)} KT`;
  return `${Math.round(tonnes)} T`;
}

// ---------------------------------------------------------------------------
// Salvage projection
// ---------------------------------------------------------------------------

/**
 * `Wreck._buildSections` floors a DESTROYED subsystem's section to this, whatever
 * condition the section had accumulated: "a destroyed subsystem is scrap".
 *
 * The live projection has to apply the same floor or it lies. A player who watches a
 * weapon battery read `84% INTACT` right up until they kill it, and then finds SCRAP in
 * the hulk, has been told two different things by two parts of the same interface — and
 * the whole reason the projection exists is so the outcome is not a surprise.
 */
export const DESTROYED_SECTION_CONDITION = 0.18;

/** The condition this section will actually come off the wreck at. */
export function projectedCondition(condition, destroyed) {
  return destroyed ? Math.min(condition ?? 0, DESTROYED_SECTION_CONDITION) : (condition ?? 0);
}

/** INTACT | DAMAGED | SCRAP, honouring the destroyed floor. */
export function projectedSalvageState(condition, destroyed) {
  return salvageState(projectedCondition(condition, destroyed));
}

/** Will a whole installable part still come out of this section? */
export function projectedYieldsModule(row, destroyed) {
  return !!row?.moduleLikely && projectedCondition(row.condition, destroyed) >= CONDITION.scrap;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

const _v4 = new THREE.Vector4();
const _mvp = new THREE.Matrix4();
/** How far outside the frame a projected vertex is allowed to land, in viewports. */
const CLAMP_SCREENS = 6;

/**
 * World point to CSS pixels, with an honest behind-the-camera test.
 *
 * `Vector3.project` silently mirrors points behind the eye, which is how an arc
 * wedge ends up drawn as a bow-tie across the frame the first time the camera drops
 * below the plane. Carrying w through and rejecting w <= 0 is the fix.
 */
export class Projector {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.camera = null;
  }

  begin(camera, width, height) {
    this.camera = camera;
    this.width = width;
    this.height = height;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }

  /**
   * @returns {boolean} true when the point is in front of the eye.
   *
   * Two guards, both of which exist because a firing arc is nine kilometres wide and
   * parts of it are behind the camera:
   *   - `w <= 1e-3` rejects anything at or behind the eye plane outright.
   *   - coordinates are clamped to a few screen-widths. A vertex at w = 1e-4 lands
   *     at 10^7 px, and asking a software rasteriser to scan-convert a polygon that
   *     size is how a 2 ms overlay becomes a 2 s one. Clamping this far outside the
   *     frame cannot move where an edge crosses it by a visible amount.
   */
  point(x, y, z, out) {
    _v4.set(x, y, z, 1).applyMatrix4(_mvp);
    const w = _v4.w;
    if (w <= 1e-3) { out.ok = false; return false; }
    const iw = 1 / w;
    const lx = this.width * CLAMP_SCREENS;
    const ly = this.height * CLAMP_SCREENS;
    const px = (_v4.x * iw * 0.5 + 0.5) * this.width;
    const py = (-_v4.y * iw * 0.5 + 0.5) * this.height;
    out.x = px < -lx ? -lx : px > lx ? lx : px;
    out.y = py < -ly ? -ly : py > ly ? ly : py;
    out.z = _v4.z * iw;
    out.ok = true;
    return true;
  }

  vec(v, out) { return this.point(v.x, v.y, v.z, out); }

  /** Screen radius, in CSS px, of a sphere of `radius` metres at `worldPos`. */
  radiusAt(worldPos, radius) {
    const cam = this.camera;
    const d = cam.position.distanceTo(worldPos);
    if (d < 1e-3) return this.height;
    const halfFov = (cam.fov * Math.PI) / 360;
    return (radius / d) * (this.height * 0.5) / Math.tan(halfFov);
  }
}

/** Preallocated screen points. The UI never allocates one per frame. */
export function screenPointRing(n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = { x: 0, y: 0, z: 0, ok: false };
  return out;
}

// ---------------------------------------------------------------------------
// Surface: the overlay canvas
// ---------------------------------------------------------------------------

/**
 * Owns the DOM. One absolutely positioned canvas over the viewport, resized to the
 * device pixel grid on every layout change.
 */
export class Surface {
  constructor({ mount = null, zIndex = 12 } = {}) {
    const doc = typeof document !== 'undefined' ? document : null;
    this.available = !!doc;
    if (!doc) { this.canvas = null; this.ctx = null; return; }

    this.host = mount ?? doc.getElementById('ui-root') ?? doc.body;
    this.canvas = doc.createElement('canvas');
    this.canvas.id = 'nadir-ui';
    const s = this.canvas.style;
    s.position = 'fixed';
    s.left = '0'; s.top = '0'; s.right = '0'; s.bottom = '0';
    s.width = '100%'; s.height = '100%';
    s.display = 'block';
    s.zIndex = String(zIndex);
    s.pointerEvents = 'none';
    this.host.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d', { alpha: true, desynchronized: false });
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  /** Let a modal screen take the mouse. Nothing else in the UI ever does. */
  setInteractive(on) {
    if (this.canvas) this.canvas.style.pointerEvents = on ? 'auto' : 'none';
  }

  _resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    if (dpr === this.dpr && w === this.width && h === this.height) return;
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  begin() {
    if (!this.ctx) return null;
    this._resize();
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.textBaseline = 'alphabetic';
    c.lineCap = 'butt';
    c.lineJoin = 'miter';
    return c;
  }

  dispose() {
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this.canvas?.parentNode?.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
  }
}

// ---------------------------------------------------------------------------
// Painter: every mark the interface is allowed to make
// ---------------------------------------------------------------------------

const _widthCache = new Map();

export class Painter {
  constructor(surface) {
    this.surface = surface;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.hair = 1;
    this.t = 0;          // wall-clock seconds since install; UI animates on this
    this._track = TRACK.none;
    /** Frame-scoped occupancy for world-anchored labels. See `claim`. */
    this._claims = [];
    this._claimCount = 0;
    for (let i = 0; i < 256; i++) this._claims.push({ x: 0, y: 0, w: 0, h: 0 });
  }

  begin(t) {
    const c = this.surface.begin();
    this.ctx = c;
    if (!c) return null;
    this.w = this.surface.width;
    this.h = this.surface.height;
    this.dpr = this.surface.dpr;
    this.hair = 1 / this.dpr;
    this.t = t;
    this._claimCount = 0;
    this.setTrack(TRACK.none);
    return c;
  }

  /**
   * Reserve a rectangle for a world-anchored label.
   *
   * Range rings, arc wedges, contacts, hulks and order markers all want to write a
   * caption beside a projected point, and where those points land is the camera's
   * business, not the layout's. With no occupancy test they pile into the same forty
   * pixels and the frame turns to mush the instant the player zooms.
   *
   * First writer wins, which makes drawing order into priority order: the locked
   * target's readouts take their space before the ambient captions get a look.
   * Fixed panels do not use this - their layout is known in advance.
   *
   * @returns {boolean} true when the space was free and has now been taken
   */
  claim(x, y, w, h, pad = 2) {
    const n = this._claimCount;
    for (let i = 0; i < n; i++) {
      const r = this._claims[i];
      if (x - pad < r.x + r.w && x + w + pad > r.x && y - pad < r.y + r.h && y + h + pad > r.y) return false;
    }
    if (n >= this._claims.length) return true;   // out of slots: draw rather than drop
    const r = this._claims[n];
    r.x = x; r.y = y; r.w = w; r.h = h;
    this._claimCount = n + 1;
    return true;
  }

  /** Text that yields to anything already claimed near it. False if it was dropped. */
  textIfClear(str, x, y, opts = {}) {
    const font = opts.font ?? F.body;
    const track = opts.track ?? TRACK.value;
    const w = this.measure(str, font, track);
    const align = opts.align ?? 'left';
    const left = align === 'right' ? x - w : align === 'center' ? x - w * 0.5 : x;
    const lh = opts.lineHeight ?? 11;
    if (!this.claim(left, y - lh + 2, w, lh, opts.pad ?? 2)) return false;
    this.text(str, x, y, opts);
    return true;
  }

  /** Snap a coordinate to the device pixel grid so a hairline stays a hairline. */
  snap(v) { return Math.round(v * this.dpr) / this.dpr; }

  setTrack(track) {
    const c = this.ctx;
    if (!c) return;
    if (this._track === track) return;
    this._track = track;
    if ('letterSpacing' in c) c.letterSpacing = track;
  }

  // --- structure ----------------------------------------------------------

  /** A filled rule. Always fillRect, never stroke - see the header. */
  rule(x, y, w, h, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.fillRect(this.snap(x), this.snap(y), Math.max(this.hair, w), Math.max(this.hair, h));
  }

  hline(x, y, w, color, weight = 1) { this.rule(x, y, w, weight * this.hair * this.dpr, color); }
  vline(x, y, h, color, weight = 1) { this.rule(x, y, weight * this.hair * this.dpr, h, color); }

  /** A hard-cornered box outline. */
  frame(x, y, w, h, color, weight = 1) {
    const t = weight * this.hair * this.dpr;
    this.rule(x, y, w, t, color);
    this.rule(x, y + h - t, w, t, color);
    this.rule(x, y, t, h, color);
    this.rule(x + w - t, y, t, h, color);
  }

  fill(x, y, w, h, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  /**
   * The panel scrim. A flat near-black plate would cut a rectangle out of space;
   * fading it out along one edge lets the panel sit ON the frame instead of in
   * front of it. This is the only gradient in the interface and it is structural.
   */
  scrim(x, y, w, h, { alpha = 0.78, fadeRight = false, fadeLeft = false } = {}) {
    const c = this.ctx;
    if (fadeRight || fadeLeft) {
      const g = c.createLinearGradient(x, 0, x + w, 0);
      const a = rgba(NEUTRAL.spaceBlack, alpha);
      const z = rgba(NEUTRAL.spaceBlack, 0);
      g.addColorStop(0, fadeLeft ? z : a);
      g.addColorStop(fadeLeft ? 0.55 : 0.45, a);
      g.addColorStop(1, fadeRight ? z : a);
      c.fillStyle = g;
    } else {
      c.fillStyle = rgba(NEUTRAL.spaceBlack, alpha);
    }
    c.fillRect(x, y, w, h);
  }

  /** Corner ticks. The selection and target primitive; never a full box. */
  corners(cx, cy, halfW, halfH, len, color, weight = 1) {
    const t = weight * this.hair * this.dpr;
    const x0 = cx - halfW, x1 = cx + halfW, y0 = cy - halfH, y1 = cy + halfH;
    const L = Math.min(len, halfW, halfH);
    this.rule(x0, y0, L, t, color); this.rule(x0, y0, t, L, color);
    this.rule(x1 - L, y0, L, t, color); this.rule(x1 - t, y0, t, L, color);
    this.rule(x0, y1 - t, L, t, color); this.rule(x0, y1 - L, t, L, color);
    this.rule(x1 - L, y1 - t, L, t, color); this.rule(x1 - t, y1 - L, t, L, color);
  }

  /** A small hard diamond. Used for mounts, waypoints and map nodes. */
  diamond(cx, cy, r, { fill = null, stroke = null, weight = 1 } = {}) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = weight; c.stroke(); }
  }

  /** Screen-space polyline through preallocated points. Skips invalid ones. */
  polyline(points, count, { stroke, weight = 1, close = false, fill = null, dash = null }) {
    const c = this.ctx;
    let started = false;
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const p = points[i];
      if (!p.ok) { started = false; continue; }
      if (!started) { c.moveTo(p.x, p.y); started = true; } else c.lineTo(p.x, p.y);
    }
    if (close && started) c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) {
      if (dash) c.setLineDash(dash);
      c.strokeStyle = stroke;
      c.lineWidth = weight;
      c.stroke();
      if (dash) c.setLineDash(EMPTY_DASH);
    }
  }

  /** A straight leader line. Callouts, tow lines, chevron stems. */
  leader(x0, y0, x1, y1, color, weight = 1, dash = null) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    if (dash) c.setLineDash(dash);
    c.strokeStyle = color;
    c.lineWidth = weight;
    c.stroke();
    if (dash) c.setLineDash(EMPTY_DASH);
  }

  /** Diagonal hatch inside a rect. The spool gap and threat corridors use this. */
  hatch(x, y, w, h, color, { spacing = 5, weight = 1, phase = 0 } = {}) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    c.strokeStyle = color;
    c.lineWidth = weight;
    c.beginPath();
    const start = x - h - ((phase % spacing) + spacing) % spacing;
    for (let i = start; i < x + w + h; i += spacing) {
      c.moveTo(i, y + h);
      c.lineTo(i + h, y);
    }
    c.stroke();
    c.restore();
  }

  // --- type ---------------------------------------------------------------

  measure(str, font, track) {
    const key = `${font}|${track}|${str}`;
    let v = _widthCache.get(key);
    if (v === undefined) {
      const c = this.ctx;
      const prevFont = c.font;
      const prevTrack = this._track;
      c.font = font;
      this.setTrack(track);
      v = c.measureText(str).width;
      c.font = prevFont;
      this.setTrack(prevTrack);
      if (_widthCache.size < 4000) _widthCache.set(key, v);
    }
    return v;
  }

  text(str, x, y, { font = F.body, color = C.ink, align = 'left', track = TRACK.value, alpha = 1 } = {}) {
    const c = this.ctx;
    c.font = font;
    this.setTrack(track);
    c.fillStyle = color;
    let px = x;
    if (align !== 'left') {
      const w = this.measure(str, font, track);
      px = align === 'right' ? x - w : x - w * 0.5;
    }
    if (alpha < 1) { c.globalAlpha = alpha; c.fillText(str, px, y); c.globalAlpha = 1; }
    else c.fillText(str, px, y);
    return px;
  }

  /** Section label: uppercase, micro, widely tracked, dim. The whole UI's spine. */
  label(str, x, y, { color = C.inkFaint, align = 'left', font = F.micro } = {}) {
    return this.text(str.toUpperCase(), x, y, { font, color, align, track: TRACK.label });
  }

  /** Panel heading with its rule. Returns the y below the rule. */
  heading(str, x, y, w, { color = C.inkDim, ruleColor = C.rule } = {}) {
    this.label(str, x, y, { color });
    this.hline(x, y + 5, w, ruleColor);
    return y + 5;
  }

  // --- meters -------------------------------------------------------------

  /**
   * A segmented bar. Segmentation is not decoration: a continuous bar at 12 px tall
   * is unreadable at a glance, and ticks give the eye something to count.
   *
   * `threshold` draws a hard marker at a fraction of full scale - this is how the
   * hardpoint breach threshold becomes something the player has SEEN before it
   * costs them a module.
   */
  bar(x, y, w, h, value, {
    color = C.ink, track = C.inkGhost, segments = 0, threshold = null,
    thresholdColor = C.warn, ghost = null, ghostColor = C.selectDim, frame = false,
  } = {}) {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    this.fill(x, y, w, h, track);
    if (ghost !== null) {
      const gv = THREE.MathUtils.clamp(ghost, 0, 1);
      this.rule(x + w * gv - this.hair, y - 2, this.hair * 2, h + 4, ghostColor);
    }
    if (v > 0) this.fill(x, y, w * v, h, color);
    if (segments > 1) {
      for (let i = 1; i < segments; i++) {
        this.rule(x + (w * i) / segments, y, this.hair, h, C.scrimHard);
      }
    }
    if (threshold !== null) {
      const tx = x + w * THREE.MathUtils.clamp(threshold, 0, 1);
      this.rule(tx - this.hair, y - 3, this.hair * 2, h + 6, thresholdColor);
    }
    if (frame) this.frame(x, y, w, h, C.ruleDim);
  }

  /**
   * A vertical bar. Same contract as `bar` but filling upward from the bottom, which
   * is the reference's thermal readout (reference-ui-language.md §5: "a large vertical
   * orange bar"). Growing downward would read as a drain, and heat is not a drain.
   */
  vbar(x, y, w, h, value, {
    color = C.ink, track = C.inkGhost, segments = 0, threshold = null, thresholdColor = C.warn,
  } = {}) {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    this.fill(x, y, w, h, track);
    if (v > 0) this.fill(x, y + h * (1 - v), w, h * v, color);
    if (segments > 1) {
      for (let i = 1; i < segments; i++) {
        this.rule(x, y + (h * i) / segments, w, this.hair, C.scrimHard);
      }
    }
    if (threshold !== null) {
      const ty = y + h * (1 - THREE.MathUtils.clamp(threshold, 0, 1));
      this.rule(x - 3, ty - this.hair, w + 6, this.hair * 2, thresholdColor);
    }
  }

  /**
   * A SOLID FILLED LABEL CHIP with dark text — the reference's single loudest
   * primitive (§4: "a solid filled label chip above the target, in accent colour with
   * dark text"). It is reserved for states the player must not be able to miss, so it
   * is deliberately expensive-looking and deliberately rare.
   *
   * @returns {number} the x past the right edge of the chip
   */
  chip(str, x, y, {
    fill = C.ink, color = C.void, font = F.microBold, padX = 4, h = 12,
    align = 'left', track = TRACK.label, minW = 0, hatched = null,
  } = {}) {
    const s = String(str);
    const w = Math.max(minW, this.measure(s, font, track) + padX * 2);
    const left = align === 'right' ? x - w : align === 'center' ? x - w * 0.5 : x;
    this.fill(left, y, w, h, fill);
    if (hatched) this.hatch(left, y, w, h, hatched, { spacing: 4, weight: 1 });
    this.text(s, left + padX, y + h - 3.5, { font, color, track });
    return left + w;
  }

  /** The hollow form: 1 px border, no fill. For a state that is present but inert. */
  chipOutline(str, x, y, {
    color = C.inkFaint, border = null, font = F.microBold, padX = 4, h = 12,
    align = 'left', track = TRACK.label, minW = 0,
  } = {}) {
    const s = String(str);
    const w = Math.max(minW, this.measure(s, font, track) + padX * 2);
    const left = align === 'right' ? x - w : align === 'center' ? x - w * 0.5 : x;
    this.frame(left, y, w, h, border ?? color);
    this.text(s, left + padX, y + h - 3.5, { font, color, track });
    return left + w;
  }

  /** A row of pips. Tier, hardpoint count, cargo slots. */
  pips(x, y, n, filled, { size = 4, gap = 3, color = C.ink, empty = C.inkGhost } = {}) {
    for (let i = 0; i < n; i++) {
      this.fill(x + i * (size + gap), y, size, size, i < filled ? color : empty);
    }
    return x + n * (size + gap) - gap;
  }

  /** Truncate to a pixel width with an ellipsis. Cached through `measure`. */
  clip(str, font, maxW, track = TRACK.value) {
    const s = String(str);
    if (this.measure(s, font, track) <= maxW) return s;
    let out = s;
    while (out.length > 1 && this.measure(`${out}…`, font, track) > maxW) out = out.slice(0, -1);
    return `${out}…`;
  }

  /** Push a clip rectangle. Every floating panel body draws inside one. */
  pushClip(x, y, w, h) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
  }

  popClip() { this.ctx.restore(); }
}

const EMPTY_DASH = [];

/**
 * Total angle covered by a set of {centre, width} arcs, unioned, in radians.
 *
 * Summing widths is wrong and the error is not small: the dorsal bed alone is 306
 * degrees and the ventral utility mount is declared full-circle, so a naive sum
 * reports "100% of circle" on a hull with a hole in its starboard quarter you could
 * fly a frigate through. Sampled rather than swept because arcs wrap.
 */
export function arcUnion(arcs, samples = 360) {
  return arcCoverage(arcs, samples).union;
}

/**
 * Coverage AND depth.
 *
 * Union alone is a blunt instrument on this hull: the dorsal bed is 306 degrees on
 * its own, so a player who bolts a battery onto a bare sponson sees the union move
 * by nothing and concludes the module did nothing. What actually changed is how many
 * mounts can answer that bearing at once, which is what a broadside IS. `doubled` is
 * the share of the circle two or more mounts cover, and it is the number that moves.
 *
 * @returns {{union:number, doubled:number, max:number}} radians, radians, count
 */
export function arcCoverage(arcs, samples = 360) {
  if (!arcs || !arcs.length) return { union: 0, doubled: 0, max: 0 };
  let hit = 0;
  let deep = 0;
  let max = 0;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    let n = 0;
    for (const arc of arcs) {
      let d = (a - arc.centre) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d <= -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) <= arc.width * 0.5) n++;
    }
    if (n > 0) hit++;
    if (n > 1) deep++;
    if (n > max) max = n;
  }
  const k = (Math.PI * 2) / samples;
  return { union: hit * k, doubled: deep * k, max };
}

/** Frame-rate independent damping, the same form the camera stream uses. */
export const damp = (cur, target, tau, dt) =>
  (tau <= 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt / tau)));

export const smoothstep = (t) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const smootherstep = (t) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
