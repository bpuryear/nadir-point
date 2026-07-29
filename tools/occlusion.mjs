/**
 * HOW MUCH OF THE SHIP IS THE INTERFACE STANDING ON?
 *
 * The review measured this by hand — rendering one pose twice, with the HUD up and
 * with it suppressed, and diffing the ship's pixels — and found 99.0 % of the hull
 * altered by the chrome at the everyday three-quarter view, 80.3 % at the close view,
 * and 36.3 % chrome coverage of the central half of the frame against 15.5 % overall.
 * Homeworld and NEBULOUS both push chrome to the edges and keep the centre empty.
 *
 * It is a number, so it is a test. This boots one page per pose, grabs the composited
 * frame twice (interface up, interface hidden), and reports:
 *
 *   HULL COVERED    share of bright ship pixels the interface changed
 *   FRAME COVERED   share of the whole frame the interface occupies
 *   CENTRE COVERED  the same for the central half, where the subject is
 *
 * Both frames come from the SAME rendered scene — the second is taken with the
 * overlay canvas hidden, so nothing about the 3D pass differs and every changed pixel
 * is genuinely chrome.
 *
 * Usage: node tools/occlusion.mjs [--shots three-quarter,close] [--max 25]
 * Exits non-zero if any pose covers more of the hull than `--max` per cent.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, ROOT } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const shotsPath = path.join(ROOT, 'tools/shots.json');
const all = JSON.parse(await fs.readFile(shotsPath, 'utf8'));
const want = String(arg('shots', 'three-quarter,close,engagement')).split(',').map((s) => s.trim());
const maxHull = Number(arg('max', 25));
/**
 * The centre gate is the one that matters most and it is the one the review
 * measured: "strictly-thresholded HUD coverage is 15.5 % of the frame but 36.3 % of
 * the central half - the chrome is concentrated exactly where the subject is".
 * A HUD can be large and still be good if it stays out of the middle.
 */
const maxCentre = Number(arg('maxCentre', 20));
const width = Number(arg('width', 1280));
const height = Number(arg('height', 720));

const chosen = want.map((id) => all.find((s) => s.id === id)).filter(Boolean);
if (!chosen.length) {
  console.error(`no shots matched ${want.join(',')}`);
  process.exit(1);
}

let server;
let browser;
let failed = false;
try {
  server = await startServer({ port: 5600, mode: 'preview' });
  browser = await launchBrowser();

  for (const shot of chosen) {
    const { page, booted, bootError } = await openGame(browser, server.url, {
      width, height, settleFrames: shot.settle ?? 30,
    });
    if (!booted) {
      console.error(`${shot.id}: failed to boot — ${String(bootError).split('\n')[0]}`);
      failed = true;
      await page.close();
      continue;
    }
    if (shot.setup) {
      await page.evaluate((code) => {
        // eslint-disable-next-line no-new-func
        new Function('N', code)(window.__NADIR);
      }, shot.setup);
      await page.evaluate((n) => new Promise((r) => {
        let i = 0;
        const step = () => (i++ < n ? requestAnimationFrame(step) : r());
        step();
      }), shot.settleAfterSetup ?? 30);
    }

    const res = await page.evaluate(async () => {
      /**
       * Grab INSIDE a rAF callback, in the same frame the renderer just painted.
       * A WebGL canvas without `preserveDrawingBuffer` is cleared as soon as the
       * frame is composited, so a `drawImage` taken outside that window returns a
       * black rectangle and the ship appears to have no pixels at all.
       */
      const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
      const grab = () => {
        const src = document.getElementById('viewport');
        const ui = document.getElementById('nadir-ui');
        const W = 480;
        const H = Math.round((src.height / src.width) * W) || 270;
        const t = document.createElement('canvas');
        t.width = W; t.height = H;
        const g = t.getContext('2d');
        g.drawImage(src, 0, 0, W, H);
        if (ui && ui.style.visibility !== 'hidden') g.drawImage(ui, 0, 0, W, H);
        return { data: g.getImageData(0, 0, W, H).data, W, H };
      };
      const ui = document.getElementById('nadir-ui');
      await nextFrame();
      const withHud = grab();
      ui.style.visibility = 'hidden';
      await nextFrame();
      const bare = grab();
      ui.style.visibility = '';

      const { W, H } = bare;
      const luma = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      let ship = 0; let hit = 0; let chrome = 0; let cc = 0; let cn = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const la = luma(bare.data, i);
          const lb = luma(withHud.data, i);
          const diff = Math.abs(la - lb) > 0.02;
          if (diff) chrome++;
          if (x > W * 0.25 && x < W * 0.75 && y > H * 0.25 && y < H * 0.75) {
            cn++;
            if (diff) cc++;
          }
          if (la > 0.30) { ship++; if (diff) hit++; }
        }
      }
      let mean = 0;
      for (let i = 0; i < bare.data.length; i += 4) mean += luma(bare.data, i);
      mean /= (W * H);
      return {
        meanLuma: mean,
        shipPx: ship,
        hullCovered: ship ? (hit / ship) * 100 : 0,
        frameCovered: (chrome / (W * H)) * 100,
        centreCovered: cn ? (cc / cn) * 100 : 0,
      };
    });

    const overHull = res.hullCovered > maxHull;
    const overCentre = res.centreCovered > maxCentre;
    const bad = overHull || overCentre;
    if (bad) failed = true;
    console.log(
      `${shot.id.padEnd(16)} hull ${res.hullCovered.toFixed(1).padStart(5)}%`
      + `  frame ${res.frameCovered.toFixed(1).padStart(5)}%`
      + `  centre ${res.centreCovered.toFixed(1).padStart(5)}%`
      + `  (${res.shipPx} ship px, scene luma ${res.meanLuma.toFixed(3)})`
      + `${overHull ? `   !! hull over ${maxHull}%` : ''}${overCentre ? `   !! centre over ${maxCentre}%` : ''}`,
    );
    await page.close();
  }
} catch (err) {
  console.error('OCCLUSION ERROR:', err);
  failed = true;
} finally {
  await browser?.close();
  await stopServer(server);
}

process.exit(failed ? 1 : 0);
