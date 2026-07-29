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
 *   5. CHROME COVERAGE, AT SEVERAL VIEWPORTS. What share of the frame the always-on
 *      welded layer stands on. See `checkChrome`.
 *
 * THE WELDED LAYER USED TO BE EXEMPT FROM ALL OF THIS.
 *
 * `owned = boxes.filter((b) => b.owner && rects.has(b.owner))` plus a `Painter.owner`
 * that was set only inside `PanelHost._drawOne` meant every string the HUD, the power
 * panel and the tactical overlay drew carried `owner === ''` and was filtered straight
 * out. Measured on the commit before this one: 376 boxes asserted on out of 597 drawn.
 * 221 boxes — 37 % of the frame's type — were asserted on by nothing, and they are the
 * 37 % where every historical collision in this project lived: `STARBOARD NACELLEENGINE`
 * was `hud.js#_drawTargetPanel`, and the REACTOR ROUTING banner that erased the WEAPONS
 * row was `power.js`. A green check over 63 % of the frame is the same class of vacuity
 * as the green check over 0 % of it that this tool shipped with for months.
 *
 * The blocks now tag `P.owner` with the ids `src/ui/layout.js` publishes, and this file
 * builds its rectangles from `ui._weldedRegions(P)` as well as from the open windows.
 * That coupling is deliberate and load-bearing in both directions: a block drawn under
 * an id with no rectangle is invisible to the audit again, and a rectangle that does not
 * match what the block draws produces false ESCAPEs. They are one commit or neither.
 *
 * Usage:  node tools/uicheck.mjs [--screen combat|armament|hold|progress|codex|locked]
 *                                [--no-chrome]
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

async function checkFrame(screen) {
  // A fixed start, not a guess. This line used to pick a random port and hand it
  // straight to startServer, which is the one thing harness.mjs exists to prevent:
  // guessing a port can collide with a server nobody is reading from, and the poll
  // then succeeds against THAT server, testing a stale bundle. startServer probes
  // upward from here for a genuinely bindable port. It was also the only Math.random
  // left in the repo, against a rule ARCHITECTURE.md states unqualified.
  const port = 5400;
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

      // THE REFIT SCREEN IS A MODAL SCREEN, NOT A SET OF WINDOWS. It suppresses the
      // whole panel layer, so the loop below would open seven windows nobody draws and
      // audit nothing at all — which is how `docs/review/recon-briefs.json` came to
      // record the refit bay as "the screen with the least test coverage" in the same
      // breath as "the plate conversion touches every block in it".
      if (ui.screen === 'refit') {
        const P0 = ui.painter;
        ui._render(1 / 60);
        P0.audit = true;
        P0.violations.length = 0;
        ui._render(1 / 60);
        const out0 = [];
        for (const v of P0.violations.slice(0, 12)) {
          out0.push(`ILLEGAL INK ${v.color} under "${v.str}" (${v.owner || 'welded'})`);
        }
        const boxes0 = P0.boxes.filter((b) => b.owner === 'refit-screen');
        const SLACK0 = 1.5;
        for (let i = 0; i < boxes0.length; i++) {
          const a = boxes0[i];
          if (a.x < -1 || a.y < -2 || a.x + a.w > P0.w + 1 || a.y + a.h > P0.h + 2) {
            out0.push(`ESCAPED refit: "${a.s}" at ${Math.round(a.x)},${Math.round(a.y)}`);
          }
          for (let j = i + 1; j < boxes0.length; j++) {
            const b = boxes0[j];
            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (ox > SLACK0 && oy > SLACK0) {
              out0.push(`COLLIDE refit: "${a.s}" [${a.x.toFixed(0)}+${a.w.toFixed(0)} y${a.y.toFixed(0)}] x "${b.s}" [${b.x.toFixed(0)}+${b.w.toFixed(0)} y${b.y.toFixed(0)}] (${ox.toFixed(1)}x${oy.toFixed(1)} px)`);
            }
          }
        }
        if (!boxes0.length) out0.push('EMPTY AUDIT: the refit screen drew no attributed text');
        out0.push(`#sampled ${boxes0.length} boxes on the refit screen, ${P0.boxes.length} drawn`);
        return out0.slice(0, 40);
      }

      // OPEN EVERY PANEL FIRST. Every panel constructs closed, so an audit of the
      // default combat screen measured 191 boxes and attributed none of them: the
      // escape and collide checks below only consider boxes owned by an OPEN panel,
      // and there were none. The check reported `ok` for months while asserting
      // nothing about the thing it was written to catch — the HULL window slicing
      // its own header. Five more panels have been added since, none ever audited.
      // Iterate a COPY: `toggle` calls `raise`, which splices the panel to the end of
      // this very array, so walking the live one skips every other panel. The first
      // version of this loop opened three of six and looked like a gameplay gate.
      for (const p of [...ui.panels.panels]) if (!p.open) ui.panels.toggle(p.id);

      // Lay out unaudited: `toggle` clears x/y, and the placement solver runs inside
      // draw(), so the first frame is where panels acquire their rects.
      ui._render(1 / 60);

      P.audit = true;
      P.violations.length = 0;
      // The audited frame. `_render` is the same path the game runs.
      ui._render(1 / 60);
      const boxes = P.boxes;
      const out = [];

      for (const v of P.violations.slice(0, 12)) {
        out.push(`ILLEGAL INK ${v.color} under "${v.str}" (${v.owner || 'welded'})`);
      }

      // Panel inner rects, from the live host.
      // Panel rects come from what the panel DREW (`panel._drawn`, published by
      // `PanelHost._drawOne`), not from `panel.x/y/w/h` after the fact: the grow pass
      // mutates the height mid-draw, so recomputing them here disagreed with the draw
      // and reported two windows' own footers as escaping their own windows.
      const rects = new Map();
      for (const p of ui.panels.panels) {
        if (!p.open || p.x === null || !p._drawn) continue;
        const d = p._drawn;
        rects.set(p.id, { x: d.body.x, y: d.body.y, w: d.body.w, h: d.body.h });
        // The title bar is its own region: it draws above the body's inner rect, and
        // its four strings — title, key hint, collapse, close — were 28 of the boxes
        // this tool used to drop as unattributed.
        rects.set(`${p.id}:title`, d.title);
        // …and the overflow footer, which draws below it for the same reason.
        rects.set(`${p.id}:foot`, d.foot);
      }

      // WELDED rects, from the layout the blocks themselves drew against. Padded by 3:
      // these are plates, and a glyph box may legitimately sit a hair over a border.
      const welded = new Set();
      for (const r of ui._weldedRegions(P)) {
        rects.set(r.id, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
        welded.add(r.id);
      }
      // The world-anchored layer is anchored to the CAMERA, not to the layout, so it
      // has no rectangle of its own — its rectangle is the frame. It counts toward the
      // sample and toward ESCAPED (a caption drawn off-frame is a defect) but it is
      // exempt from COLLIDE below, because two world labels are allowed to converge as
      // the objects they name converge.
      rects.set('world', { x: -8, y: -8, w: P.w + 16, h: P.h + 16 });
      welded.add('world');
      const NO_COLLIDE = new Set(['world']);

      const owned = boxes.filter((b) => b.owner && rects.has(b.owner));
      for (const b of owned) {
        const r = rects.get(b.owner);
        if (b.x < r.x - 1 || b.x + b.w > r.x + r.w + 1 || b.y < r.y - 2 || b.y + b.h > r.y + r.h + 2) {
          out.push(`ESCAPED ${b.owner}: "${b.s}" at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`);
        }
      }

      // A glyph box is a bounding box, not a hull, so a hairline of touching is fine.
      // 1.5 px, unchanged: the nine false 2.0 px reports that appeared the moment
      // welded auditing was switched on were fixed at the source — `Painter._auditText`
      // was inventing 2 px of descender under every uppercase string. See theme.js.
      const SLACK = 1.5;
      for (let i = 0; i < owned.length; i++) {
        for (let j = i + 1; j < owned.length; j++) {
          const a = owned[i];
          const b = owned[j];
          if (a.owner !== b.owner) continue;
          if (NO_COLLIDE.has(a.owner)) continue;
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > SLACK && oy > SLACK) {
            out.push(`COLLIDE ${a.owner}: "${a.s}" [${a.x.toFixed(0)}+${a.w.toFixed(0)} y${a.y.toFixed(0)}] x "${b.s}" [${b.x.toFixed(0)}+${b.w.toFixed(0)} y${b.y.toFixed(0)}] (${ox.toFixed(1)}x${oy.toFixed(1)} px)`);
          }
        }
      }
      // A silent pass because nothing was measured is worse than a failure. Reporting
      // the sample size was not enough — it printed `0 boxes in 0 panel(s)` next to an
      // `ok` and nobody read it. An empty sample is now a FAIL, so the check cannot
      // pass by measuring nothing. And an UNATTRIBUTED share is now printed beside it,
      // because "376 of 597" is the number that would have shown the exemption.
      const unowned = boxes.length - owned.length;
      if (owned.length === 0 || rects.size === 0) {
        out.push(`EMPTY AUDIT: ${owned.length} attributed boxes in ${rects.size} region(s) `
          + `(${boxes.length} drawn) — the layout assertions ran against nothing`);
      }
      out.push(`#sampled ${owned.length} boxes in ${rects.size} region(s) `
        + `(${welded.size} welded, ${rects.size - welded.size} windows), ${boxes.length} drawn, `
        + `${unowned} unattributed (${(unowned / Math.max(1, boxes.length) * 100).toFixed(1)}%)`);
      return out.slice(0, 40);
    });
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

// ---------------------------------------------------------------------------
// 5. Chrome coverage, at more than one viewport
// ---------------------------------------------------------------------------

/**
 * WHAT SHARE OF THE FRAME IS INTERFACE?
 *
 * The project owner's note on the combat HUD was "that UI looks very messy and
 * condensed at that screen resolution… otherwise the game becomes more UI than
 * graphics". That is a measurable claim and nothing in the repo measured it, because
 * the one instrument that existed ran at a SINGLE viewport — which is exactly how the
 * finding came to read as closed. Measured on the commit before the layout system:
 *
 *   welded chrome, screen=combat, target locked
 *   1280x720   50.1 % of frame   16.4 % of central half   13.8 % of the ship's box
 *   1366x768   44.0 %             9.6 %                     8.8 %
 *   1600x900   32.5 %             0.0 %                     1.1 %
 *
 * Half a 720p frame. The blocks were fixed logical pixels and the frame was not.
 *
 * THREE NUMBERS, NOT ONE. Total coverage says how busy the frame is; the central half
 * says whether the chrome has stayed at the edges the way the reference frames do; and
 * the ship's own projected box is the one the standing review finding is about — a HUD
 * standing on the subject. A block can be large and blameless at the edge, and small
 * and unforgivable on the hull.
 *
 * The ceilings are set just above what the layout system actually achieves, so they
 * are a ratchet: they cannot be met by accident and any regression trips them.
 */
const CHROME_VIEWPORTS = [
  { w: 1280, h: 720, frame: 38, central: 9, ship: 9 },
  { w: 1600, h: 900, frame: 29, central: 5, ship: 5 },
  { w: 1920, h: 1080, frame: 30, central: 5, ship: 5 },
];

async function checkChrome() {
  const port = 5460;
  let server;
  let browser;
  const out = [];
  try {
    server = await startServer({ port, mode: 'preview' });
    browser = await launchBrowser();
    for (const vp of CHROME_VIEWPORTS) {
      const { page, booted, bootError } = await openGame(browser, `${server.url}probe.html`, {
        width: vp.w, height: vp.h, settleFrames: 45,
        query: `p=ui&quality=high&seed=${encodeURIComponent('c#screen=combat')}`,
      });
      if (!booted) {
        out.push(`CHROME ${vp.w}x${vp.h}: probe failed to boot: ${String(bootError).split('\n')[0]}`);
        await page.close();
        continue;
      }
      const m = await page.evaluate(() => {
        const ui = window.__NADIR.world.systems.ui;
        const P = ui.painter;
        ui._render(1 / 60);
        // A 4 px raster, so overlapping rectangles are counted once. Summing areas
        // double-counts every shared pixel and would report over 100 % on a busy frame.
        const S = 4;
        const gw = Math.ceil(P.w / S);
        const gh = Math.ceil(P.h / S);
        const g = new Uint8Array(gw * gh);
        const stamp = (r, bit) => {
          const x0 = Math.max(0, Math.floor(r.x / S));
          const x1 = Math.min(gw - 1, Math.floor((r.x + r.w) / S));
          const y0 = Math.max(0, Math.floor(r.y / S));
          const y1 = Math.min(gh - 1, Math.floor((r.y + r.h) / S));
          for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) g[yy * gw + xx] |= bit;
        };
        for (const r of ui._weldedRegions(P)) stamp(r, 1);
        stamp({ x: P.w * 0.25, y: P.h * 0.25, w: P.w * 0.5, h: P.h * 0.5 }, 2);
        const shipOk = ui.shipBox.ok;
        if (shipOk) stamp(ui.shipBox, 4);
        let a = 0, hn = 0, hc = 0, sn = 0, sc = 0;
        for (let i = 0; i < g.length; i++) {
          const v = g[i];
          if (v & 1) a++;
          if (v & 2) { hn++; if (v & 1) hc++; }
          if (v & 4) { sn++; if (v & 1) sc++; }
        }
        return {
          logical: `${Math.round(P.w)}x${Math.round(P.h)}`,
          shipOk,
          frame: +(a / (gw * gh) * 100).toFixed(1),
          central: +(hc / Math.max(1, hn) * 100).toFixed(1),
          ship: shipOk ? +(sc / Math.max(1, sn) * 100).toFixed(1) : 0,
        };
      });
      out.push(`#chrome ${vp.w}x${vp.h} (logical ${m.logical}): `
        + `${m.frame}% frame / ${m.central}% central half / ${m.ship}% ship box`
        + `${m.shipOk ? '' : ' (ship off frame)'}`);
      if (m.frame > vp.frame) out.push(`CHROME ${vp.w}x${vp.h}: ${m.frame}% of frame > ${vp.frame}%`);
      if (m.central > vp.central) out.push(`CHROME ${vp.w}x${vp.h}: ${m.central}% of the central half > ${vp.central}%`);
      if (m.shipOk && m.ship > vp.ship) out.push(`CHROME ${vp.w}x${vp.h}: ${m.ship}% of the ship's box > ${vp.ship}%`);
      await page.close();
    }
  } finally {
    await browser?.close();
    await stopServer(server);
  }
  return out;
}

// ---------------------------------------------------------------------------

const screen = arg('screen', 'combat');
const wantChrome = !process.argv.includes('--no-chrome');
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

if (wantChrome) {
  const chrome = await checkChrome();
  const cnotes = chrome.filter((f) => f.startsWith('#'));
  const cfails = chrome.filter((f) => !f.startsWith('#'));
  console.log(`chrome     : ${cfails.length ? `${cfails.length} FAIL` : 'ok'}`);
  for (const f of cnotes) console.log(`  ${f}`);
  for (const f of cfails) console.log(`  ${f}`);
  if (cfails.length) failed = true;
}

process.exit(failed ? 1 : 0);
