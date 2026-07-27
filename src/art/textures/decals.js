/**
 * MARKINGS.
 *
 * Hull numbers, faction sigils, chevrons, hazard striping, stencilled warnings.
 *
 * Every glyph is drawn as filled rectangles from a 5x7 bitmap defined in this file.
 * No font is loaded and none is named, because a missing font is a silent failure
 * that only shows up on someone else's machine, and because stencilled hull
 * markings are blocky anyway - a real one is cut from a mask, not typeset.
 *
 * Markings are the second-strongest scale cue after running lights. A three-metre
 * hull number on a plate tells you the plate is bigger than a person.
 */

import * as THREE from 'three';
import { makeCanvas, ctx2d, canvasTexture, css, roundRect } from './canvas2d.js';
import { getFactionPalette } from '../palette.js';

/** 5 wide, 7 tall, row-major, '1' = ink. Drawn as rectangles. */
const GLYPHS = {
  A: '01110,10001,10001,11111,10001,10001,10001',
  B: '11110,10001,10001,11110,10001,10001,11110',
  C: '01110,10001,10000,10000,10000,10001,01110',
  D: '11110,10001,10001,10001,10001,10001,11110',
  E: '11111,10000,10000,11110,10000,10000,11111',
  F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111',
  H: '10001,10001,10001,11111,10001,10001,10001',
  I: '11111,00100,00100,00100,00100,00100,11111',
  J: '00111,00010,00010,00010,00010,10010,01100',
  K: '10001,10010,10100,11000,10100,10010,10001',
  L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001',
  N: '10001,11001,10101,10011,10001,10001,10001',
  O: '01110,10001,10001,10001,10001,10001,01110',
  P: '11110,10001,10001,11110,10000,10000,10000',
  Q: '01110,10001,10001,10001,10101,10010,01101',
  R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110',
  T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110',
  V: '10001,10001,10001,10001,10001,01010,00100',
  W: '10001,10001,10001,10101,10101,11011,01010',
  X: '10001,10001,01010,00100,01010,10001,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100',
  Z: '11111,00001,00010,00100,01000,10000,11111',
  0: '01110,10001,10011,10101,11001,10001,01110',
  1: '00100,01100,00100,00100,00100,00100,01110',
  2: '01110,10001,00001,00010,00100,01000,11111',
  3: '11111,00010,00100,00010,00001,10001,01110',
  4: '00010,00110,01010,10010,11111,00010,00010',
  5: '11111,10000,11110,00001,00001,10001,01110',
  6: '00110,01000,10000,11110,10001,10001,01110',
  7: '11111,00001,00010,00100,01000,01000,01000',
  8: '01110,10001,10001,01110,10001,10001,01110',
  9: '01110,10001,10001,01111,00001,00010,01100',
  '-': '00000,00000,00000,11111,00000,00000,00000',
  '.': '00000,00000,00000,00000,00000,01100,01100',
  ':': '00000,01100,01100,00000,01100,01100,00000',
  '/': '00001,00010,00010,00100,01000,01000,10000',
  '+': '00000,00100,00100,11111,00100,00100,00000',
  ' ': '00000,00000,00000,00000,00000,00000,00000',
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/**
 * Draw text as rectangles. Returns the advance width in pixels.
 * @param {number} cell  pixel size of one bitmap cell
 */
export function drawText(ctx, text, x, y, cell, { tracking = 1, align = 'left', baseline = 'top' } = {}) {
  const s = String(text).toUpperCase();
  const advance = (GLYPH_W + tracking) * cell;
  const width = s.length * advance - tracking * cell;
  const height = GLYPH_H * cell;
  let ox = x;
  if (align === 'center') ox = x - width * 0.5;
  else if (align === 'right') ox = x - width;
  let oy = y;
  if (baseline === 'middle') oy = y - height * 0.5;
  else if (baseline === 'bottom') oy = y - height;

  for (let i = 0; i < s.length; i++) {
    const rows = (GLYPHS[s[i]] ?? GLYPHS[' ']).split(',');
    for (let r = 0; r < GLYPH_H; r++) {
      const row = rows[r];
      let run = -1;
      for (let c = 0; c <= GLYPH_W; c++) {
        const on = c < GLYPH_W && row[c] === '1';
        if (on && run < 0) run = c;
        if (!on && run >= 0) {
          // Fill whole runs rather than per-cell: fewer, larger rects, no seams.
          ctx.fillRect(ox + i * advance + run * cell, oy + r * cell, (c - run) * cell, cell);
          run = -1;
        }
      }
    }
  }
  return width;
}

export function textWidth(text, cell, tracking = 1) {
  return String(text).length * (GLYPH_W + tracking) * cell - tracking * cell;
}

/**
 * A transparent canvas containing one line of text. Used for probe labels and for
 * any UI that wants in-world lettering without a font.
 */
export function textCanvas(text, { cell = 6, pad = 4, ink = 0xffffff, tracking = 1, bg = null } = {}) {
  const w = Math.ceil(textWidth(text, cell, tracking) + pad * 2);
  const h = Math.ceil(GLYPH_H * cell + pad * 2);
  const canvas = makeCanvas(Math.max(2, w), Math.max(2, h));
  const ctx = ctx2d(canvas);
  if (bg !== null) { ctx.fillStyle = css(bg); ctx.fillRect(0, 0, w, h); }
  ctx.fillStyle = css(ink);
  drawText(ctx, text, pad, pad, cell, { tracking });
  return canvas;
}

export function textTexture(text, opts = {}) {
  const t = canvasTexture(textCanvas(text, opts), { srgb: true, name: `text:${text}` });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Vector marks
// ---------------------------------------------------------------------------

/** Stacked chevrons pointing +x. */
export function chevrons(ctx, x, y, w, h, count = 3, thickness = 0.28) {
  const step = w / count;
  const t = h * thickness;
  for (let i = 0; i < count; i++) {
    const x0 = x + i * step;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + step * 0.62, y + h * 0.5);
    ctx.lineTo(x0, y + h);
    ctx.lineTo(x0 + t, y + h);
    ctx.lineTo(x0 + step * 0.62 + t, y + h * 0.5);
    ctx.lineTo(x0 + t, y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Diagonal hazard striping inside a rectangle. */
export function hazardStripes(ctx, x, y, w, h, { a, b, period = 18, angle = Math.PI / 4 } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = css(b);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(a);
  const diag = Math.abs(w) + Math.abs(h);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let d = -diag; d < diag; d += period * 2) {
    ctx.beginPath();
    ctx.moveTo(x + d * dx - dy * diag, y + d * dy + dx * diag);
    ctx.lineTo(x + (d + period) * dx - dy * diag, y + (d + period) * dy + dx * diag);
    ctx.lineTo(x + (d + period) * dx + dy * diag, y + (d + period) * dy - dx * diag);
    ctx.lineTo(x + d * dx + dy * diag, y + d * dy - dx * diag);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Faction sigils. Each is a shape, not a letter, and each has a different symmetry
 * so it survives being 8 pixels across on a distant hull:
 *   coalition  bracketed hexagon, 6-fold, heavy
 *   concord    open ring with three spokes, 3-fold, thin
 *   derelict   trefoil with an offset centre, deliberately not symmetric
 *   player     an open square bracket pair, 2-fold
 */
export function factionSigil(ctx, faction, cx, cy, r, ink) {
  ctx.save();
  ctx.fillStyle = css(ink);
  ctx.strokeStyle = css(ink);
  ctx.lineWidth = r * 0.20;
  ctx.lineJoin = 'miter';

  if (faction === 'coalition') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(cx - r * 0.20, cy - r * 0.52, r * 0.40, r * 1.04);
    ctx.fillRect(cx - r * 0.58, cy - r * 0.13, r * 1.16, r * 0.26);
  } else if (faction === 'concord') {
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.20, cy + Math.sin(a) * r * 0.20);
      ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else if (faction === 'derelict') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.42;
      const ox = cx + Math.cos(a) * r * 0.42;
      const oy = cy + Math.sin(a) * r * 0.42;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a + 0.9) * r * 0.66, oy + Math.sin(a + 0.9) * r * 0.66);
      ctx.lineTo(ox + Math.cos(a - 0.3) * r * 0.92, oy + Math.sin(a - 0.3) * r * 0.92);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx - r * 0.08, cy + r * 0.06, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.18, cy - r * 0.78);
    ctx.lineTo(cx - r * 0.74, cy - r * 0.78);
    ctx.lineTo(cx - r * 0.74, cy + r * 0.78);
    ctx.lineTo(cx - r * 0.18, cy + r * 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.18, cy - r * 0.78);
    ctx.lineTo(cx + r * 0.74, cy - r * 0.78);
    ctx.lineTo(cx + r * 0.74, cy + r * 0.78);
    ctx.lineTo(cx + r * 0.18, cy + r * 0.78);
    ctx.stroke();
  }
  ctx.restore();
}

/** Plausible hull registry codes, deterministic per rng. */
export function hullCode(rng, faction) {
  const prefix = {
    coalition: ['CLN', 'HVY', 'BLK', 'IRN'],
    concord: ['CNC', 'ARC', 'PAL', 'VEL'],
    derelict: ['—', 'XX', 'OO', 'VII'],
    player: ['NDR', 'SLV', 'PT'],
  }[faction] ?? ['NP'];
  const p = rng.pick(prefix).replace(/[^A-Z0-9]/g, 'X');
  return `${p}-${rng.int(100, 9999)}`;
}

/**
 * The decal sheet: an atlas of markings for one faction on a transparent canvas.
 * Layout is a fixed 4x4 grid so the geometry stream can address a cell by index
 * without asking anyone what is in it.
 *
 * cells 0-3   : hull codes
 * cells 4-5   : faction sigil (large, small)
 * cells 6-7   : chevron blocks
 * cells 8-9   : hazard stripe patches
 * cells 10-15 : stencilled warnings and numerals
 */
export const DECAL_GRID = 4;

export function decals(opts = {}) {
  const { rng, faction = 'player', size = 512 } = opts;
  if (!rng) throw new Error('[decals] needs an rng');
  const pal = getFactionPalette(faction);
  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  const cell = size / DECAL_GRID;
  const ink = pal.marking.ink;

  const at = (i) => [(i % DECAL_GRID) * cell, Math.floor(i / DECAL_GRID) * cell];

  for (let i = 0; i < 4; i++) {
    const [x, y] = at(i);
    ctx.fillStyle = css(ink);
    const code = hullCode(rng, faction);
    const c = Math.floor(cell / (code.length * 6.2));
    drawText(ctx, code, x + cell * 0.5, y + cell * 0.5, Math.max(2, c), { align: 'center', baseline: 'middle' });
  }

  {
    const [x, y] = at(4);
    factionSigil(ctx, faction, x + cell * 0.5, y + cell * 0.5, cell * 0.36, ink);
  }
  {
    const [x, y] = at(5);
    factionSigil(ctx, faction, x + cell * 0.5, y + cell * 0.5, cell * 0.20, ink);
  }
  {
    const [x, y] = at(6);
    ctx.fillStyle = css(ink);
    chevrons(ctx, x + cell * 0.14, y + cell * 0.30, cell * 0.72, cell * 0.40, 3);
  }
  {
    const [x, y] = at(7);
    ctx.fillStyle = css(pal.marking.hazardA);
    chevrons(ctx, x + cell * 0.14, y + cell * 0.30, cell * 0.72, cell * 0.40, 2, 0.36);
  }
  {
    const [x, y] = at(8);
    hazardStripes(ctx, x + cell * 0.10, y + cell * 0.34, cell * 0.80, cell * 0.32,
      { a: pal.marking.hazardA, b: pal.marking.hazardB, period: cell * 0.075 });
  }
  {
    const [x, y] = at(9);
    hazardStripes(ctx, x + cell * 0.10, y + cell * 0.30, cell * 0.80, cell * 0.40,
      { a: pal.marking.hazardA, b: pal.marking.hazardB, period: cell * 0.055, angle: -Math.PI / 4 });
  }

  const words = ['CAUTION', 'NO STEP', 'RCS', 'AIRLOCK 2', 'FUEL', 'GRAPPLE'];
  for (let i = 0; i < 6; i++) {
    const [x, y] = at(10 + i);
    ctx.fillStyle = css(i % 3 === 0 ? pal.marking.hazardA : ink);
    const w = words[i];
    const c = Math.max(2, Math.floor(cell / (w.length * 6.4)));
    drawText(ctx, w, x + cell * 0.5, y + cell * 0.5, c, { align: 'center', baseline: 'middle' });
  }

  const t = canvasTexture(canvas, { srgb: true, name: `decals:${faction}` });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { texture: t, canvas, grid: DECAL_GRID, size };
}
