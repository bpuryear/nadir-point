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
 *
 * THE CONTRAST FLOOR IS A HARD RULE, NOT A PREFERENCE.
 *
 * The previous ramp put `inkFaint` at alpha 0.38 and `inkGhost` at 0.17 of a bone
 * white over near-black. Measured against the panel plate those are 2.91:1 and
 * 1.42:1. WCAG AA body text is 4.5:1 and the loosest game-HUD floor anyone defends
 * is 3:1, so every disabled row, every legend and every unit caption in this
 * interface was below the floor BY CONSTRUCTION - no amount of care at the call
 * site could have saved them.
 *
 * So the ramp now has exactly THREE text values and they are all above 4.5:1, and
 * the old ghost value survives under a name that says what it is for:
 *
 *   ink       0.96  14.7:1   values, headlines, anything being read
 *   inkDim    0.80   9.7:1   labels and secondary figures
 *   inkFaint  0.64   6.6:1   the dimmest thing allowed to carry a glyph
 *   track     0.17   1.4:1   BAR TRACKS, EMPTY PIPS, INERT CHIP FILLS. NEVER TEXT.
 *
 * `TEXT_INK` below is the enforced whitelist and `Painter.text` audits against it,
 * so a colour that has no business under a glyph is caught in the probe rather than
 * in a review. Disabled state is signalled by `Painter.struck` - a leading dash and
 * a strike rule at full ink - not by fading a row until it disappears.
 */
const INK_BASE = mix(NEUTRAL.select, NEUTRAL.ice, 0.74);
const STRUCT_BASE = shade(NEUTRAL.ice, 0.55);

export const C = {
  ink: rgba(INK_BASE, 0.96),
  inkStrong: rgba(mix(INK_BASE, NEUTRAL.ice, 0.4), 1),
  inkDim: rgba(INK_BASE, 0.80),
  inkFaint: rgba(INK_BASE, 0.64),

  /**
   * NOT A TEXT COLOUR. 1.42:1 against the plate. Bar tracks, empty pips, the fill
   * behind an inert chip, hatch ink. `Painter.text` will flag it if it ever ends up
   * under a glyph again.
   */
  track: rgba(INK_BASE, 0.17),

  rule: rgba(STRUCT_BASE, 0.52),
  ruleDim: rgba(STRUCT_BASE, 0.30),
  ruleBright: rgba(STRUCT_BASE, 0.80),

  /** Panel scrims. Near-black, because the frame behind them is near-black. */
  scrim: rgba(NEUTRAL.spaceBlack, 0.72),
  scrimHard: rgba(NEUTRAL.spaceBlack, 0.90),
  scrimSoft: rgba(NEUTRAL.spaceBlack, 0.42),
  /**
   * THE PLATE. reference-ui-language.md §3 is explicit that the reference's dense
   * small type is legible over a bright nebula BECAUSE the plate behind it is
   * near-opaque, not because the type is large.
   *
   * This was 0.955 and that last 4.5 % was not free: a near-white hull behind the
   * ARMAMENT window printed through at rgb(13,14,21) against the panel's own
   * rgb(2,3,10), which is a visible shape on a black plate. It is 1.0 now. A window
   * is a window; if it needed to feel like it was sitting ON the frame rather than
   * cut out of it, that is the border's job and the border does it.
   */
  panel: rgba(NEUTRAL.spaceBlack, 1),
  /**
   * The title band is a LIFT DRAWN OVER THE PLATE, not a colour of its own.
   *
   * It used to be `mix(spaceBlack, ice, 0.045)`, and `mix` lerps in LINEAR space —
   * so a 4.5 % blend toward a near-white came out at rgb(47,53,58), a mid grey. That
   * is a visibly different band from the one intended AND it dropped hostile red on
   * a title bar to 3.62:1. Compositing a 5 % ink over the opaque plate is
   * deterministic in sRGB and lands where it was meant to: rgb(13,14,21).
   */
  panelTitle: rgba(INK_BASE, 0.05),
  void: rgba(NEUTRAL.void, 1),

  hostile: rgba(NEUTRAL.hostile, 1),
  hostileDim: rgba(NEUTRAL.hostile, 0.90),
  hostileGhost: rgba(NEUTRAL.hostile, 0.16),
  friendly: rgba(NEUTRAL.friendly, 1),
  friendlyDim: rgba(NEUTRAL.friendly, 0.80),
  salvage: rgba(NEUTRAL.salvage, 1),
  salvageDim: rgba(NEUTRAL.salvage, 0.80),
  salvageGhost: rgba(NEUTRAL.salvage, 0.14),
  select: rgba(NEUTRAL.select, 1),
  selectDim: rgba(NEUTRAL.select, 0.80),

  warn: rgba(getFactionPalette('player').warn, 1),
  /**
   * THE HEAT RAMP. Heat escalates by VALUE, not by hue - see the house rule below.
   * `warnLow` is the same amber at a lower value, so a mount going warm and a mount
   * that has tripped are the same colour at two different brightnesses and the eye
   * reads the ORDER rather than hunting for a second meaning.
   */
  warnLow: rgba(mix(getFactionPalette('player').warn, NEUTRAL.spaceBlack, 0.42), 1),
  warnDim: rgba(getFactionPalette('player').warn, 0.90),
  warnGhost: rgba(getFactionPalette('player').warn, 0.15),

  shield: rgba(NEUTRAL.shieldHit, 1),
  shieldDim: rgba(NEUTRAL.shieldHit, 0.80),
};

/**
 * THE COLOUR CONTRACT, ENFORCED.
 *
 * theme.js's house rule has always said each non-neutral colour means exactly one
 * thing. The frame did not honour it: one ARMAMENT panel carried the same saturated
 * red-orange for thermal state, out-of-ammunition, structural failure, subsystem
 * disabled AND an alert count, at the same value, so the eye had no way to find the
 * emergency. The split is now written down and the call sites read from here:
 *
 *   HEAT / COST         C.warnLow -> C.warn.  Amber. Escalates by VALUE.
 *                       "This is costing you something right now."
 *   STARVED             C.inkFaint + a struck bar. Out of rounds, out of charge and
 *                       out of power are ABSENCES, not alarms, and they are drawn as
 *                       absences: neutral ink, nothing burning.
 *   STRUCTURAL LOSS     C.hostile. Red. BREACHED / LOST / DESTROYED and the hostile
 *                       contact himself. Nothing else in the frame is allowed red.
 *   SALVAGE             C.salvage. Cyan. Yield, condition, what you get to keep.
 *   FRIENDLY / SOLUTION C.friendly. Green. A firing solution and your own orders.
 */
export const SEMANTIC = {
  heat: C.warn,
  heatLow: C.warnLow,
  starved: C.inkFaint,
  lost: C.hostile,
  lostDim: C.hostileDim,
  salvage: C.salvage,
  solution: C.friendly,
};

/**
 * Colours allowed under a glyph, with the minimum size each one is cleared for.
 * Everything here was measured against `C.panel` with the ratio function in
 * `tools/uicontrast.mjs`, which is run as part of the UI check.
 */
export const TEXT_INK = new Set([
  C.ink, C.inkStrong, C.inkDim, C.inkFaint,
  C.hostile, C.hostileDim, C.friendly, C.friendlyDim,
  C.salvage, C.salvageDim, C.select, C.selectDim,
  C.warn, C.warnDim, C.shield, C.shieldDim, C.void,
  C.ruleBright,
]);

/**
 * Faction identity. Two values each: the hue itself, and a dim version for a
 * stripe that has to sit next to text without shouting over it. This is the ONLY
 * place the interface is allowed to be chromatic, and it is spent on the one thing
 * the game is about - where a part came from.
 */
export const FACTION_INK = {};
for (const id of ['coalition', 'concord', 'derelict', 'player']) {
  const p = getFactionPalette(id);
  // `dim` used to be 0.34 and it was being used for the origin column in the HOLD
  // table - a faction NAME the player is meant to read, at well under 2:1. A stripe
  // can be quiet; a word cannot.
  const dim = rgba(p.emissive, 0.78);
  FACTION_INK[id] = {
    id,
    name: p.name,
    hue: rgba(p.emissive, 1),
    stripe: rgba(p.emissive, 0.85),
    dim,
    ghost: rgba(p.emissive, 0.13),
    trim: rgba(p.trim, 0.9),
  };
  TEXT_INK.add(rgba(p.emissive, 1));
  TEXT_INK.add(dim);
}
export const factionInk = (id) => FACTION_INK[id] ?? FACTION_INK.player;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

const STACK = 'ui-monospace, "SF Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';

/**
 * THE TYPE LADDER, AND WHY IT IS NOT FIXED IN CSS PIXELS.
 *
 * The ladder used to start at 9 px and the painter scaled the backing store by the
 * device pixel ratio only - so the type stayed 9 CSS px whether the window was
 * 1280x720 or 3840x2160, and measured cap height on a shipped 4K frame was about
 * 7 device pixels, roughly 1.5 mm on a 27-inch panel. Homeworld Remastered shipped
 * four GUI scale steps for exactly this reason and it is still the most repeated
 * complaint about that release.
 *
 * Two changes. First, the floor is 10 px: at 9 px this monospace stack loses the
 * counters in 8, 6 and 0, which is not a legibility opinion, it is a missing glyph.
 * Second, `setUIScale` multiplies the whole overlay - type AND every layout constant
 * in this stream - by one number, because scaling the font without scaling the
 * column offsets is how a readable panel becomes an overlapping one.
 *
 * The mechanism is deliberately blunt: `Surface` scales the 2D context and reports a
 * SMALLER logical viewport, so `P.w`/`P.h` shrink and every panel, every offset and
 * every hit region follows without a single call site knowing about it.
 */
export const UI_SCALES = [0.85, 1.0, 1.25, 1.5];

/** Rebuilt in place by `setUIScale` so every `F.micro` read picks up the change. */
export const F = {};

let _fontScale = 1;

/**
 * The ladder is NOMINAL and never changes. The context transform multiplies every
 * drawn coordinate, so a font declared at 10 px comes out at 10 * dpr * uiScale
 * device pixels on its own, and `measure` keeps returning logical widths that stay
 * valid at every scale. One number, applied once, in one place.
 */
(function buildFonts() {
  const px = (v) => `${v}px ${STACK}`;
  const bold = (v) => `600 ${v}px ${STACK}`;
  F.micro = px(10);       // the floor. 9 px lost the counters in 8, 6 and 0.
  F.microBold = bold(10);
  F.small = px(11);
  F.body = px(12);
  F.bodyBold = bold(12);
  F.mid = px(14);
  F.midBold = bold(14);
  F.large = bold(18);
  F.huge = bold(26);
}());

/**
 * Set the interface scale. `Surface` divides the logical viewport by the same
 * number and scales the context by it, so type and layout move together.
 * @param {number} k one of UI_SCALES
 */
export function setUIScale(k) {
  _fontScale = Math.max(0.6, Math.min(2.5, k || 1));
  return _fontScale;
}

export function uiScale() { return _fontScale; }

/**
 * The default, off a viewport-height heuristic. A 1080p panel keeps the density the
 * interface was authored at; a 1440p or 4K one gets physically comparable glyphs.
 */
export function defaultUIScale(viewportH) {
  const h = Number(viewportH) || 900;
  if (h <= 1000) return 1.0;
  if (h <= 1500) return 1.25;
  return 1.5;
}

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
    this.scale = 1;
    this.cssWidth = 1;
    this.cssHeight = 1;
    if (!doc) { this.canvas = null; this.ctx = null; return; }
    if (typeof window !== 'undefined') setUIScale(defaultUIScale(window.innerHeight));

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

  /**
   * `width`/`height` are LOGICAL pixels: CSS pixels divided by the UI scale. Every
   * coordinate in this stream is expressed in them, so raising the scale shrinks the
   * frame every panel is laying itself out inside and the layout follows the type
   * without a single call site being aware of it.
   */
  _resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = Math.max(1, window.innerWidth);
    const cssH = Math.max(1, window.innerHeight);
    const k = uiScale();
    const w = Math.round(cssW / k);
    const h = Math.round(cssH / k);
    if (dpr === this.dpr && w === this.width && h === this.height && k === this.scale) return;
    this.dpr = dpr;
    this.scale = k;
    this.cssWidth = cssW;
    this.cssHeight = cssH;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  begin() {
    if (!this.ctx) return null;
    this._resize();
    const c = this.ctx;
    const s = this.dpr * this.scale;
    c.setTransform(s, 0, 0, s, 0, 0);
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

    /**
     * THE AUDIT. Off in a shipped frame, switched on by the probes.
     *
     * `violations` collects every glyph drawn in a colour that is not on the
     * `TEXT_INK` whitelist, and `boxes` collects the rectangle of every string drawn
     * this frame so a probe can assert that no text box escapes its panel and no two
     * boxes inside one panel intersect. Both were review findings that a human had
     * to measure off a screenshot; neither should ever need measuring again.
     */
    this.audit = false;
    this.violations = [];
    this._boxes = [];
    this._boxCount = 0;
    for (let i = 0; i < 2048; i++) this._boxes.push({ x: 0, y: 0, w: 0, h: 0, s: '', font: '', owner: '' });
    /** Set by PanelHost while a panel body is drawing, so boxes are attributable. */
    this.owner = '';
  }

  /** Rectangles of every string drawn this frame. Only populated when `audit`. */
  get boxes() { return this._boxes.slice(0, this._boxCount); }

  begin(t) {
    const c = this.surface.begin();
    this.ctx = c;
    if (!c) return null;
    this.w = this.surface.width;
    this.h = this.surface.height;
    this.dpr = this.surface.dpr;
    this.scale = this.surface.scale;
    // One DEVICE pixel expressed in logical units. A hairline must stay one device
    // row whatever the scale, or the interface's 1 px borders turn to grey mush the
    // moment somebody raises the UI size.
    this.hair = 1 / (this.dpr * this.scale);
    this.t = t;
    this._claimCount = 0;
    this._boxCount = 0;
    this.setTrack(TRACK.none);
    return c;
  }

  /**
   * CSS pixels to the logical coordinate system every hit region is expressed in.
   * Pointer events arrive in CSS pixels and the overlay is drawn in logical ones.
   */
  toLocal(v) { return v / (this.scale || 1); }

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

  /**
   * FORGET THE CACHED TRACKING. Call after any `ctx.restore()`.
   *
   * `letterSpacing` is part of the 2D context's saved state, so `restore()` silently
   * reverts it while `_track` goes on believing whatever was set last. Every
   * subsequent `measure` then returned a width for one tracking and `fillText` drew
   * at another — which is how `LARGEST PART ON RECORD` came to be measured at 138 px
   * and drawn at 168, and ran 8 px into the value beside it. The mismatch is silent,
   * it only appears after a clip or a hatch, and it moves as drawing order changes.
   */
  _forgetTrack() { this._track = null; }

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
   * THE PLATE. An opaque rectangle and a 1 px rule, and nothing else.
   *
   * This replaces `scrim` everywhere text is drawn. The welded HUD blocks used to
   * use a 0.62-0.70 gradient scrim while only the floating windows got the real
   * plate, and the result was measurable: at a close framing the white hull read
   * straight through the REACTOR ROUTING panel and its row labels were simply gone,
   * and the stance buttons measured 2.14:1 over the hull. reference-ui-language.md
   * §3 is explicit that the reference's small type is legible BECAUSE the plate
   * behind it is near-opaque. There is no version of this that a gradient survives.
   */
  plate(x, y, w, h, { fill = C.panel, border = C.rule, title = 0 } = {}) {
    this.fill(x, y, w, h, fill);
    if (title > 0) {
      // The lift goes ON the plate, so the band is the plate plus 5 % ink and not a
      // separate colour that has to be kept in step with it.
      this.fill(x, y, w, title, C.panelTitle);
      this.hline(x, y + title - this.hair, w, C.rule);
    }
    if (border) this.frame(x, y, w, h, border);
  }

  /**
   * The panel scrim. RESERVED FOR DECORATION THAT CARRIES NO TEXT - the fade behind
   * a world-space marker, the dim under a modal. If a glyph is going on it, it wants
   * `plate` instead; see the note there.
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
    this._forgetTrack();
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

  /**
   * @param {Object} [opts]
   * @param {number} [opts.maxW] clip to this width, MEASURED AT THE SAME TRACKING the
   *   string is about to be drawn with.
   *
   * That last clause is not pedantry, it is a bug class. Every call site used to read
   * `P.text(s, x, y, { track: TRACK.label, maxW: w })` — and `clip` defaults
   * to `TRACK.value` at 0.02em while `TRACK.label` is 0.16em, so a string "clipped"
   * to 180 px was drawn at well over 200 and ran into the next column. The UI check
   * caught three of these at once. Clipping through `maxW` cannot get it wrong,
   * because there is only one place the tracking is read from.
   */
  text(str, x, y, { font = F.body, color = C.ink, align = 'left', track = TRACK.value, alpha = 1, onFill = false, maxW = 0 } = {}) {
    const c = this.ctx;
    if (maxW > 0) str = this.clip(str, font, maxW, track);
    c.font = font;
    this.setTrack(track);
    c.fillStyle = color;
    const w = align === 'left' && !this.audit ? 0 : this.measure(str, font, track);
    const px = align === 'right' ? x - w : align === 'center' ? x - w * 0.5 : x;
    if (alpha < 1) { c.globalAlpha = alpha; c.fillText(str, px, y); c.globalAlpha = 1; }
    else c.fillText(str, px, y);
    if (this.audit) this._auditText(str, px, y, w, font, color, onFill);
    return px;
  }

  /**
   * Record a drawn string, and flag it if its colour is not cleared for text.
   * `onFill` means the glyph is sitting on a chip's own opaque fill rather than on
   * the panel plate, which is the only case where `C.void` is legitimate.
   */
  _auditText(str, x, y, w, font, color, onFill) {
    if (!onFill && !TEXT_INK.has(color)) {
      this.violations.push({ str: String(str), font, color, owner: this.owner });
    }
    const n = this._boxCount;
    if (n >= this._boxes.length) return;
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '11');
    const b = this._boxes[n];
    /**
     * `size + 0.5`, not `size + 2`.
     *
     * The box is [baseline − size, baseline + slop]. This interface is almost entirely
     * uppercase and digits, which have no descender, so 2 px of slop below the baseline
     * was 2 px of overlap invented by the measurement. Against the world-anchored label
     * stacks — a 10 px line pitch under a 12 px box — that manufactured NINE 2.0 px
     * COLLIDE reports the moment welded auditing was switched on, none of them real.
     * The honest fix is the box, not a looser slack: raising the tolerance to 2.5 px
     * would also have hidden a genuine 2 px collision, and 2 px on a 10 px glyph is a
     * fifth of the type. The one real overlap in that frame measured 15.9 x 6.0 px and
     * is still caught.
     */
    b.x = x; b.y = y - size; b.w = w; b.h = size + 0.5;
    b.s = String(str); b.font = font; b.owner = this.owner;
    this._boxCount = n + 1;
  }

  /** Section label: uppercase, micro, widely tracked, dim. The whole UI's spine. */
  /**
   * Section label: uppercase, micro, widely tracked. The whole UI's spine.
   *
   * @returns {number} THE RIGHT EDGE of what was drawn, not the left.
   *
   * Callers that place a value beside a label used to measure the label a second
   * time and start the value past it. That is one measurement too many: it is
   * possible for the two to disagree, and when they did (`LARGEST PART ON RECORD`
   * measured at 138 px and drawn at 168) the value was drawn 8 px inside the label.
   * Handing back the edge the draw actually reached removes the second measurement
   * and with it the whole class of bug.
   */
  label(str, x, y, { color = C.inkFaint, align = 'left', font = F.micro, maxW = 0 } = {}) {
    const s = str.toUpperCase();
    this.text(s, x, y, { font, color, align, track: TRACK.label, maxW });
    const w = this.measure(maxW > 0 ? this.clip(s, font, maxW, TRACK.label) : s, font, TRACK.label);
    return align === 'right' ? x : align === 'center' ? x + w * 0.5 : x + w;
  }

  /**
   * A DISABLED ROW, DRAWN AS A DISABLED ROW.
   *
   * The old idiom was to fade the text until it went away, which put `NO MODULE` at
   * 1.38:1, the sub-part legend at 1.34:1 and `PWR SEALED` at 1.33:1 - a first-hour
   * player's very first screen was a set of panels deliberately rendered unreadable,
   * so they could never learn what those panels would do once they found a reactor.
   *
   * Absence is signalled by a leading dash and a strike rule AT FULL INK instead. It
   * is unmistakably inert and it is unmistakably readable, which is the whole point:
   * an empty mount is information.
   */
  struck(str, x, y, { font = F.micro, color = C.inkFaint, align = 'left', track = TRACK.label, strike = true } = {}) {
    const s = `— ${String(str)}`;
    const w = this.measure(s, font, track);
    const px = this.text(s, x, y, { font, color, align, track });
    if (strike) this.rule(px, y - Math.round(parseFloat(/(\d+)/.exec(font)?.[1] ?? '10') * 0.3), w, this.hair, color);
    return px + w;
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
    color = C.ink, track = C.track, segments = 0, threshold = null,
    thresholdColor = C.warn, ghost = null, ghostColor = C.selectDim, frame = false, struck = false,
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
    // STARVED. A magazine at zero and a charge buffer at zero are absences, not
    // alarms - see SEMANTIC. A struck empty track says "there is nothing here" in
    // neutral ink and leaves the amber for the things that are actually burning.
    if (struck) this.rule(x, y + h * 0.5 - this.hair, w, this.hair * 2, C.inkFaint);
    if (frame) this.frame(x, y, w, h, C.ruleDim);
  }

  /**
   * A vertical bar. Same contract as `bar` but filling upward from the bottom, which
   * is the reference's thermal readout (reference-ui-language.md §5: "a large vertical
   * orange bar"). Growing downward would read as a drain, and heat is not a drain.
   */
  vbar(x, y, w, h, value, {
    color = C.ink, track = C.track, segments = 0, threshold = null, thresholdColor = C.warn,
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
    // The hatch goes UNDER the glyphs, never over them. See `hatchUnder`.
    if (hatched) this.hatch(left, y, w, h, hatched, { spacing: 4, weight: 1 });
    this.text(s, left + padX, y + h - 3.5, { font, color, track, onFill: true });
    return left + w;
  }

  /**
   * A HATCH THAT DOES NOT CROSS A GLYPH.
   *
   * The power panel's sealed overlay drew its diagonal hatch OVER the whole block,
   * so every label in the panel was struck through by it and two full-width rules
   * ran through the middle of the WEAPONS and ENGINES rows. A decorative texture is
   * allowed to say "inert"; it is not allowed to make the text it is describing
   * unreadable, and it must never share a y with a baseline.
   *
   * This draws the hatch and then punches the supplied glyph boxes back out of it
   * with the plate colour, so the pattern reads across the row and stops at the type.
   *
   * @param {Array<{x:number,y:number,w:number,h:number}>} holes glyph boxes to keep clear
   */
  hatchUnder(x, y, w, h, color, holes = null, opts = {}) {
    this.hatch(x, y, w, h, color, opts);
    if (!holes) return;
    const c = this.ctx;
    c.fillStyle = opts.plate ?? C.panel;
    for (const r of holes) {
      if (!r) continue;
      const rx = Math.max(x, r.x - 2);
      const ry = Math.max(y, r.y - 1);
      const rw = Math.min(x + w, r.x + r.w + 2) - rx;
      const rh = Math.min(y + h, r.y + r.h + 1) - ry;
      if (rw > 0 && rh > 0) c.fillRect(rx, ry, rw, rh);
    }
  }

  /** The hollow form: 1 px border, no fill. For a state that is present but inert. */
  chipOutline(str, x, y, {
    color = C.inkFaint, border = null, font = F.microBold, padX = 4, h = 12,
    align = 'left', track = TRACK.label, minW = 0,
  } = {}) {
    const s = String(str);
    const w = Math.max(minW, this.measure(s, font, track) + padX * 2);
    const left = align === 'right' ? x - w : align === 'center' ? x - w * 0.5 : x;
    // The plate under the outline too: an outlined chip drawn over a bright hull is
    // exactly as unreadable as a bare string, and this primitive is used for target
    // distances and hulk captions, which is where it happens.
    this.fill(left, y, w, h, C.panel);
    this.frame(left, y, w, h, border ?? color);
    this.text(s, left + padX, y + h - 3.5, { font, color, track });
    return left + w;
  }

  /**
   * THE WORLD-ANCHORED LABEL, WITH ITS OWN GROUND.
   *
   * `reference-ui-language.md` §4 observed that everything the reference writes into
   * the world sits on a solid filled chip with dark text. Ours wrote light ink onto
   * nothing, which measured 1.64:1 for `CONTACT TO ENGAGE` against a gas giant's limb
   * and 2.35:1 for `TRACTOR 1.80 KM` over the white hull. The fix is not a brighter
   * ink - there is no ink that survives an arbitrary backdrop - it is the chip.
   *
   * `claim` is honoured as a WHOLE-LABEL test: if the rectangle is taken the string is
   * dropped entirely rather than clipped, because a caption sliced to `...CK` by a
   * window edge is worse than no caption at all.
   *
   * @returns {boolean} true when it was drawn
   */
  worldLabel(str, x, y, {
    fill = C.ink, color = C.void, font = F.microBold, align = 'center', h = 13, pad = 2,
  } = {}) {
    const s = String(str);
    const w = this.measure(s, font, TRACK.label) + 8;
    const left = align === 'right' ? x - w : align === 'center' ? x - w * 0.5 : x;
    if (!this.claim(left, y, w, h, pad)) return false;
    this.chip(s, left, y, { fill, color, font, h, track: TRACK.label });
    return true;
  }

  /** A row of pips. Tier, hardpoint count, cargo slots. */
  pips(x, y, n, filled, { size = 4, gap = 3, color = C.ink, empty = C.track } = {}) {
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

  popClip() {
    this.ctx.restore();
    this._forgetTrack();
  }
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
