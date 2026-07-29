/**
 * THE UI CHECK — contrast, escaped text boxes, and colliding text boxes.
 *
 * Every one of these was a review finding that a human had to measure off a
 * screenshot with an eyedropper. None of them should ever need measuring by hand
 * again, so all three are assertions:
 *
 *   1. CONTRAST. Walks every (font, colour, background) pair `src/ui/theme.js` can
 *      emit and asserts >= 3.0:1 for type at or under 11 px and >= 4.5:1 for body
 *      copy. The old ramp failed this by construction — `C.inkGhost` was alpha 0.17
 *      of a bone white on near-black, which is 1.42:1 and cannot clear 3:1 at any
 *      size — and the frames showed it: 'NO MODULE' at 1.38:1, the resource row at
 *      1.31:1, 'PWR SEALED' at 1.33:1, the sub-part legend at 1.34:1.
 *
 *   2. ESCAPED TEXT. Boots the UI probe with `Painter.audit` on, collects the
 *      rectangle of every string drawn, and asserts that no box drawn inside a panel
 *      extends past that panel's inner rect. The HULL window used to slice its
 *      `MODULE / MOUNT / COST` header in half with the panel border.
 *
 *   3. COLLIDING TEXT. Asserts that no two boxes inside one panel overlap by more
 *      than a hair. `STARBOARD NACELLEENGINE` and `BALANCEDF1` were both this.
 *
 *   4. ILLEGAL INK. `Painter.text` flags any colour that is not on the `TEXT_INK`
 *      whitelist, so a bar-track colour can never quietly end up under a glyph.
 *
 * Usage:  node tools/uicheck.mjs [--screen combat|armament|hold|progress|codex]
 * Exits non-zero on any failure, so it is a gate rather than a report.
 */

import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, ROOT } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ---------------------------------------------------------------------------
// 1. Contrast, computed in node against the real theme
// ---------------------------------------------------------------------------

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const ratio = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** `rgb(1,2,3)` / `rgba(1,2,3,0.5)` composited over an opaque backdrop. */
function parse(css, over = [0, 0, 0]) {
  const n = String(css).match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const a = n.length > 3 ? n[3] : 1;
  return [0, 1, 2].map((i) => Math.round(n[i] * a + over[i] * (1 - a)));
}

async function checkContrast() {
  const { C, F, TEXT_INK } = await import(path.join(ROOT, 'src/ui/theme.js'));
  const fails = [];

  // Every background a glyph is ever drawn on. Chip fills are included because a
  // chip's own text sits on the fill, not on the plate.
  // `C.panelTitle` is a translucent lift drawn over the plate, so the ground a glyph
  // on a title band actually sits on is the composite of the two.
  const panel = parse(C.panel);
  const grounds = {
    panel,
    panelTitle: parse(C.panelTitle, panel),
    scrimHard: parse(C.scrimHard, panel),
  };
  const chipFills = {
    ink: parse(C.ink, grounds.panel),
    warn: parse(C.warn, grounds.panel),
    hostile: parse(C.hostile, grounds.panel),
    salvage: parse(C.salvage, grounds.panel),
    friendly: parse(C.friendly, grounds.panel),
    inkFaint: parse(C.inkFaint, grounds.panel),
    track: parse(C.track, grounds.panel),
  };

  // Body copy is anything above 11 px; the rest is small type at the 3:1 floor.
  // The whitelist is held to the STRICTER floor throughout, because a colour on it
  // may be used at any size by any panel and tracking which is which per call site
  // is exactly the bookkeeping that let the old ramp rot.
  const sizeOf = (font) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '11');
  const floorFor = () => 4.5;

  for (const css of TEXT_INK) {
    // `C.void` is only ever legal on a chip fill; it is checked in the chip pass.
    if (css === C.void) continue;
    for (const [gname, ground] of Object.entries(grounds)) {
      const fg = parse(css, ground);
      const r = ratio(fg, ground);
      for (const [fname, font] of Object.entries(F)) {
        const floor = floorFor(font);
        if (r + 1e-6 < floor) {
          fails.push(`${css} on ${gname} at ${fname} (${sizeOf(font)}px): ${r.toFixed(2)}:1 < ${floor}`);
        }
      }
    }
  }

  // Dark text on a bright chip: the reference's loudest primitive, and it has to
  // clear the floor in the other direction.
  for (const [name, fill] of Object.entries(chipFills)) {
    if (name === 'track') continue;   // inert chips carry inkDim, checked below
    const r = ratio(parse(C.void, fill), fill);
    if (r < 4.5) fails.push(`C.void on chip fill ${name}: ${r.toFixed(2)}:1 < 4.5`);
  }
  const inertR = ratio(parse(C.inkDim, chipFills.track), chipFills.track);
  if (inertR < 3.0) fails.push(`C.inkDim on inert chip fill: ${inertR.toFixed(2)}:1 < 3.0`);

  return fails;
}

// ---------------------------------------------------------------------------
// 2-4. Layout and ink, measured from a live frame
// ---------------------------------------------------------------------------

const OVERLAP_SLACK = 1.5;   // logical px; a glyph box is a bounding box, not a hull

async function checkFrame(screen) {
  const port = 5400 + Math.floor(Math.random() * 200);
  let server;
  let browser;
  try {
    server = await startServer({ port, mode: 'preview' });
    browser = await launchBrowser();
    const { page, booted, bootError } = await openGame(browser, `${server.url}probe.html`, {
      width: 1280, height: 720, settleFrames: 60,
      query: `p=ui&quality=high&seed=${encodeURIComponent(`c#screen=${screen}`)}`,
    });
    if (!booted) return [`probe failed to boot: ${String(bootError).split('\n')[0]}`];

    return await page.evaluate(() => {
      const ui = window.__NADIR?.world?.systems?.ui;
      if (!ui) return ['no ui layer'];
      const P = ui.painter;
      P.audit = true;
      P.violations.length = 0;
      // One audited frame. `_render` is the same path the game runs.
      ui._render(1 / 60);
      const boxes = P.boxes;
      const out = [];

      for (const v of P.violations.slice(0, 12)) {
        out.push(`ILLEGAL INK ${v.color} under "${v.str}" (${v.owner || 'welded'})`);
      }

      // Panel inner rects, from the live host.
      const rects = new Map();
      for (const p of ui.panels.panels) {
        if (!p.open || p.x === null) continue;
        rects.set(p.id, { x: p.x, y: p.y + 20, w: p.w, h: p.h - 20 - 15 });
      }

      const owned = boxes.filter((b) => b.owner && rects.has(b.owner));
      for (const b of owned) {
        const r = rects.get(b.owner);
        if (b.x < r.x - 1 || b.x + b.w > r.x + r.w + 1 || b.y < r.y - 2 || b.y + b.h > r.y + r.h + 2) {
          out.push(`ESCAPED ${b.owner}: "${b.s}" at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`);
        }
      }

      const SLACK = 1.5;
      for (let i = 0; i < owned.length; i++) {
        for (let j = i + 1; j < owned.length; j++) {
          const a = owned[i];
          const b = owned[j];
          if (a.owner !== b.owner) continue;
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > SLACK && oy > SLACK) {
            out.push(`COLLIDE ${a.owner}: "${a.s}" [${a.x.toFixed(0)}+${a.w.toFixed(0)} y${a.y.toFixed(0)}] x "${b.s}" [${b.x.toFixed(0)}+${b.w.toFixed(0)} y${b.y.toFixed(0)}] (${ox.toFixed(1)}x${oy.toFixed(1)} px)`);
          }
        }
      }
      // A silent pass because nothing was measured is worse than a failure: report
      // the sample size so an empty audit cannot be mistaken for a clean one.
      out.push(`#sampled ${owned.length} boxes in ${rects.size} panel(s), ${boxes.length} total`);
      return out.slice(0, 40);
    });
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

// ---------------------------------------------------------------------------

const screen = arg('screen', 'combat');
let failed = false;

const contrast = await checkContrast();
console.log(`contrast   : ${contrast.length ? `${contrast.length} FAIL` : 'ok'}`);
for (const f of contrast.slice(0, 20)) console.log(`  ${f}`);
if (contrast.length) failed = true;

const frame = await checkFrame(screen);
const notes = frame.filter((f) => f.startsWith('#'));
const fails = frame.filter((f) => !f.startsWith('#'));
console.log(`layout[${screen}] : ${fails.length ? `${fails.length} FAIL` : 'ok'}`);
for (const f of notes) console.log(`  ${f}`);
for (const f of fails) console.log(`  ${f}`);
if (fails.length) failed = true;

process.exit(failed ? 1 : 0);
