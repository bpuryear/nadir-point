/**
 * THE WELDED LAYOUT — one authority for where the always-on chrome lives.
 *
 * WHY THIS FILE EXISTS. The welded blocks were laid out in FIXED LOGICAL PIXELS while
 * the frame is not fixed at all, and `UILayer._weldedRegions` carried a SECOND,
 * hand-written copy of the same numbers. Both facts were measured, not assumed:
 *
 *   welded chrome, screen=combat, target locked, before this file
 *     1280x720   50.1 % of the frame   16.4 % of the central half   13.8 % of the ship
 *     1366x768   44.0 %                 9.6 %                        8.8 %
 *     1600x900   32.5 %                 0.0 %                        1.1 %
 *
 * Half a 720p frame is chrome. That is not a styling problem and no amount of
 * restyling fixes it — the same 456,024 logical px² of block is drawn onto a frame
 * that is 921,600 px² at 720p and 2,359,296 px² at 1440p. The interface has to be a
 * function of the frame.
 *
 * `defaultUIScale` cannot be the answer on its own. It scales TYPE as well as layout,
 * and `theme.js`'s type ladder has a hard 10 px floor ("9 px lost the counters in 8, 6
 * and 0" — that is a missing glyph, not an opinion). Taking a 720p frame to 0.85 would
 * render the whole interface at 8.5 px. So the scale ladder stays where it is and the
 * BLOCKS get smaller instead: narrower columns, tighter row pitch, and the dead
 * furniture dropped rather than shrunk.
 *
 * THREE RULES, applied in one place:
 *
 *   1. WIDTH IS A FRACTION OF THE FRAME, capped at what was authored. A block never
 *      grows past its authored width — the reference's density is deliberate — but it
 *      shrinks on a frame that cannot afford it.
 *   2. A BLOCK'S RECTANGLE IS WHAT IT DRAWS. The `time` region used to reserve
 *      560 x 150 px for a strip that draws about 250 x 40, which is 5.8 % of a 1600x900
 *      frame claimed by nothing. A region that over-claims lies to the panel solver,
 *      to `Painter.claim` and to any tool that measures coverage.
 *   3. AN ABSENT READOUT IS A LINE, NOT A PLATE. `NO LOCK` on a 372 x 48 plate and two
 *      `NONE FITTED` rows with their own empty bars are three pieces of furniture
 *      holding prime frame for information that does not exist yet. The words stay —
 *      a player has to learn the layer exists — but they stop costing a block each.
 *
 * NO ALLOCATION. One module-scoped object, mutated in place, returned every frame.
 * `UILayer._render` computes it once and hud.js, power.js, tactical.js and the panel
 * solver all read the same instance, so they cannot disagree the way the two copies of
 * the numbers used to.
 */

import { HARDPOINTS, POWER_CHANNELS } from '../core/contracts.js';

/**
 * Below this logical height the frame is COMPACT: row pitch tightens and every
 * optional line is dropped.
 *
 * 940 is picked off the measured ladder, not by eye. `defaultUIScale` divides the
 * viewport, so the LOGICAL frame — the one the blocks are laid out in — is:
 *
 *   1280x720  -> 1280x720    2560x1440 -> 2048x1152
 *   1600x900  -> 1600x900    3840x2160 -> 2560x1440
 *   1920x1080 -> 1536x864
 *
 * so 940 makes everything up to and including 1080p compact and 1440p up roomy. That
 * is deliberate: 1600x900 is the frame the owner's note was written against, and it
 * measured 32.5 % welded chrome. The authored density is kept for the frames that can
 * actually afford it and nowhere else.
 */
const COMPACT_H = 940;
/** …and below this logical width, for a wide-but-short or narrow-but-tall frame. */
const COMPACT_W = 1450;

/** Gutter from the frame edge. Scales a little so a big frame does not look pinched. */
const GUTTER_FRAC = 0.009;
const GUTTER_MIN = 8;
const GUTTER_MAX = 16;

/**
 * Authored widths — the ceiling, never exceeded — and the fraction of the frame each
 * block is allowed. The fractions are the authored width over 1600, so a 1600-wide
 * frame reproduces the authored layout exactly and anything narrower shrinks.
 */
const BLOCK = {
  ship: { max: 346, frac: 346 / 1600, min: 282 },
  target: { max: 372, frac: 372 / 1600, min: 296 },
  power: { max: 380, frac: 380 / 1600, min: 304 },
  stores: { max: 206, frac: 206 / 1600, min: 168 },
};

/** Row pitches, regular and compact. */
const PITCH = {
  mount: [17, 15],
  layer: [15, 14],
  sub: [14, 12],
  power: [30, 26],
  powerLocked: 20,
};

/** The sealed banner's own row. See power.js — it used to be drawn as an overlay. */
export const SEALED_ROW_H = 40;

/** The arc rose hangs this far above the own-ship block. Read by tactical.js too. */
export const ARC_BASE = 26;

/**
 * The expanded rose's plate width. Wide enough for its OWN CAPTIONS, which the
 * previous `R * 2 + 24 = 96` was not: `ARC COVERAGE` measures 104 px and
 * `100% OF CIRCLE` 122 px centred. Both escaped, invisibly, for the same reason
 * everything else in this file escaped invisibly — welded chrome had no owner and the
 * audit filtered it out.
 */
export const ROSE_PLATE_W = 140;

const _rect = () => ({ id: '', x: 0, y: 0, w: 0, h: 0, hard: false });

/** The one instance. Mutated in place every frame; never replaced. */
const L = {
  compact: false,
  gutter: 14,
  mountRowH: 17,
  layerRowH: 15,
  subRowH: 14,
  powerRowH: 30,
  /** True when SHIELD and ARMOUR are both absent and collapse to one line. */
  layersCollapsed: false,
  /** How many rows the layer stack actually draws. */
  layerRows: 3,
  ship: _rect(),
  target: _rect(),
  power: _rect(),
  stores: _rect(),
  tabs: _rect(),
  time: _rect(),
  arc: _rect(),
  notify: _rect(),
  /** Live rects this frame, in draw order. Rebuilt in place; never reallocated. */
  regions: [],
};
for (const id of ['time', 'notify', 'tabs', 'stores', 'ship', 'power', 'target', 'arc']) L[id].id = id;

const clampW = (spec, frameW) => Math.round(Math.min(spec.max, Math.max(spec.min, frameW * spec.frac)));

/**
 * Recompute the frame layout.
 *
 * @param {import('./theme.js').Painter} P
 * @param {Object} s frame state read off the sim, all optional
 * @param {boolean} s.locked        a live target is held
 * @param {boolean} s.shieldFitted  a shield layer exists
 * @param {boolean} s.armourFitted  an armour layer exists
 * @param {boolean} s.powerSealed   the reactor governor is not the player's yet
 * @param {number}  s.subsystems    rows the target panel will draw
 * @param {boolean} s.arcCollapsed  the coverage rose has no arc and draws one line
 * @param {number}  s.tabsW         measured width of the window tab row
 * @param {number}  s.timeW         measured width of the time strip
 * @param {number}  s.notifyBottom  lowest y the notify column reaches, 0 when silent
 * @param {number}  s.notifyL       left edge of the notify column, relative to centre
 * @param {number}  s.notifyR       right edge of the notify column, relative to centre
 * @returns {typeof L} the shared instance
 */
export function frameLayout(P, s = {}) {
  const fw = P.w;
  const fh = P.h;
  const compact = fh < COMPACT_H || fw < COMPACT_W;
  L.compact = compact;
  const i = compact ? 1 : 0;
  L.gutter = Math.round(Math.min(GUTTER_MAX, Math.max(GUTTER_MIN, fw * GUTTER_FRAC)));
  L.mountRowH = PITCH.mount[i];
  L.layerRowH = PITCH.layer[i];
  L.subRowH = PITCH.sub[i];
  L.powerRowH = s.powerSealed ? PITCH.powerLocked : PITCH.power[i];

  const g = L.gutter;

  // --- the layer stack ------------------------------------------------------
  // Two absent layers are two empty bars, two `NONE FITTED` strings and two `--`
  // rates: 30 px of prime frame saying nothing twice. Collapsed they are one line
  // that still names both, which is the whole reason the empty row was drawn.
  const shield = !!s.shieldFitted;
  const armour = !!s.armourFitted;
  L.layersCollapsed = !shield && !armour;
  L.layerRows = L.layersCollapsed ? 2 : 3;

  // --- own-ship block -------------------------------------------------------
  // Every constant below is the sum the draw actually walks, not a round number:
  //   48  name + LAYERS heading + the gap to the first layer row
  //   50  the NET figure and its rules, plus MOUNT STRUCTURE's heading
  //   28  the VELOCITY and FITTED MASS lines
  // At the authored 1600x900 with three layer rows this comes to 298, which is what
  // `HARDPOINTS.length * 17 + 196` produced — so a large frame is unchanged and only
  // a frame that cannot afford the block gets a smaller one.
  const shipW = clampW(BLOCK.ship, fw);
  const shipH = 48 + L.layerRows * L.layerRowH + 50
    + HARDPOINTS.length * L.mountRowH + 28 + (compact ? 14 : 25);
  set(L.ship, g, fh - shipH - g, shipW, shipH, true);

  // --- target block ---------------------------------------------------------
  //  101  heading, class + faction block, HULL and SALVAGE rows, SUBSYSTEMS heading
  //   21  the plating strip     28  the bearing report
  // Unlocked it is ONE struck line. A 372 x 48 plate carrying the word `NO LOCK` is
  // 1.2 % of a 1600x900 frame spent saying that a readout has nothing in it.
  const targetW = clampW(BLOCK.target, fw);
  const subs = Math.max(1, s.subsystems ?? 8);
  const targetH = s.locked
    ? 101 + (compact ? 13 : 25) + 15 + subs * L.subRowH + 21 + 28 + (compact ? 16 : 42)
    : 22;
  set(L.target, fw - targetW - g, fh - targetH - g, targetW, targetH, !!s.locked);

  // --- power block ----------------------------------------------------------
  // The rect is the OUTER plate. Inner = outer - 26.
  //   46  heading + OUTPUT bar    26  the stance buttons
  // SEALED_ROW_H is a LAYOUT ROW, not an overlay. See power.js.
  const powerW = clampW(BLOCK.power, fw);
  const powerH = 46 + (s.powerSealed ? SEALED_ROW_H : 0)
    + POWER_CHANNELS.length * L.powerRowH + 26 + 26;
  set(L.power, Math.round(fw * 0.5 - powerW * 0.5), fh - powerH - g - 4, powerW, powerH, false);

  // --- stores strip ---------------------------------------------------------
  const storesW = clampW(BLOCK.stores, fw);
  const storesH = compact ? 84 : 96;
  set(L.stores, fw - storesW - g, g + 22, storesW, storesH, false);

  // --- top strips -----------------------------------------------------------
  const tabsW = Math.min(fw - g * 2, Math.max(120, s.tabsW ?? 620));
  set(L.tabs, g - 6, 2, tabsW, 24, false);
  // 54 not 32: the paused / in-transit banner sits under the strip on its own plate,
  // and a region that does not cover what the block draws is the same lie in the
  // other direction.
  const timeW = Math.max(120, s.timeW ?? 250);
  set(L.time, Math.round(fw * 0.5 - timeW * 0.5), 38, timeW, 54, false);
  // The notification column and the order bar, claimed ONLY while something is in
  // them, and only as tall as what is actually in them. This band used to be folded
  // into a permanent 560 x 150 `time` region — 5.8 % of a 1600x900 frame held for text
  // that is on screen for four seconds at a time, and mis-shaped besides: it stopped
  // at y 150 while the sixth notification draws its baseline at y 221.
  const notifyH = Math.max(0, (s.notifyBottom ?? 0) - 94);
  if (notifyH > 0) {
    const nl = fw * 0.5 + (s.notifyL ?? -200);
    const nr = fw * 0.5 + (s.notifyR ?? 200);
    set(L.notify, Math.max(0, nl - 4), 94, Math.min(fw, nr - nl + 8), notifyH, false);
  } else set(L.notify, 0, 0, 0, 0, false);

  // --- arc dial -------------------------------------------------------------
  // The collapsed rose is a line of type. Reserving a 130 x 106 square for it was
  // 1.0 % of a 1600x900 frame claimed by a string. Both forms are the rectangle the
  // rose actually plates — see tactical.js#_drawCoverageRose, which reads the same
  // `ARC_BASE` so the block and its reservation cannot drift apart.
  const arcBase = L.ship.y - ARC_BASE;
  if (s.arcCollapsed) set(L.arc, L.ship.x + 52, arcBase - 14, 230, 20, false);
  else set(L.arc, L.ship.x + 14, arcBase - 112, ROSE_PLATE_W, 126, false);

  // --- the live list --------------------------------------------------------
  const r = L.regions;
  r.length = 0;
  r.push(L.tabs, L.time, L.stores, L.ship, L.power, L.target, L.arc);
  if (notifyH > 0) r.push(L.notify);
  return L;
}

function set(rect, x, y, w, h, hard) {
  rect.x = Math.round(x);
  rect.y = Math.round(y);
  rect.w = Math.round(w);
  rect.h = Math.round(h);
  rect.hard = !!hard;
  return rect;
}

/** The last computed layout, for a caller that cannot pass `P`. */
export function currentLayout() { return L; }
