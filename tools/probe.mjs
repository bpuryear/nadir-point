/**
 * Screenshot a single probe. This is how a stream looks at its own work.
 *
 *   node tools/probe.mjs cruiser
 *   node tools/probe.mjs cruiser --out shots/cruiser.png --width 1600 --height 900
 *   node tools/probe.mjs cruiser --pose '{"distance":900,"pitch":0.1,"yaw":1.57}'
 *   node tools/probe.mjs cruiser --frames 240        # let it run before shooting
 *
 * Exits non-zero if the probe throws or logs a console error, so it doubles as a
 * per-stream regression check.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, ROOT } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const name = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : arg('p', 'index');
const width = Number(arg('width', 1600));
const height = Number(arg('height', 900));
const frames = Number(arg('frames', 90));
const quality = arg('quality', 'high');
const seed = arg('seed', null);
const poseJson = arg('pose', null);
const outPath = path.resolve(ROOT, arg('out', `docs/probes/${name}.png`));
const port = Number(process.env.PORT || (5200 + Math.abs(hash(name)) % 300));

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

await fs.mkdir(path.dirname(outPath), { recursive: true });

let server, browser, failed = false;
try {
  /**
   * PREVIEW, NOT DEV, for the same reason capture.mjs already gives: the dev
   * server's HMR full-reloads the page whenever anything writes to the tree, which
   * destroys the execution context mid-settle and reports as "Execution context was
   * destroyed, most likely because of a navigation" — a harness failure that looks
   * exactly like a probe crash and gets debugged as one. It happens constantly while
   * a stream is iterating, because iterating IS writing to the tree. `probe.html` is
   * already a rollup input (vite.config.js), so preview serves it, and the frames
   * then come from the artefact that actually ships.
   */
  server = await startServer({ port, mode: 'preview' });
  const url = server.url + 'probe.html';
  browser = await launchBrowser();

  let query = `p=${encodeURIComponent(name)}&quality=${quality}`;
  if (seed) query += `&seed=${encodeURIComponent(seed)}`;

  const { page, consoleErrors, pageErrors, booted, bootError } = await openGame(browser, url, {
    width, height, query, settleFrames: frames,
  });

  if (!booted) {
    console.error(`probe "${name}" FAILED TO BOOT:\n${bootError}`);
    failed = true;
  } else {
    if (poseJson) {
      await page.evaluate((p) => window.__NADIR.setPose(JSON.parse(p)), poseJson);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    const stats = await page.evaluate(() => window.__NADIR.stats());
    await page.screenshot({ path: outPath, type: 'png' });
    console.log(`probe ${name}`);
    console.log(`  out       : ${path.relative(ROOT, outPath)}`);
    console.log(`  drawCalls : ${stats.calls}`);
    console.log(`  triangles : ${stats.triangles?.toLocaleString?.() ?? stats.triangles}`);
    console.log(`  programs  : ${stats.programs}`);
    console.log(`  geometries: ${stats.geometries}   textures: ${stats.textures}`);
  }

  const errs = [...pageErrors, ...consoleErrors.filter((e) => e.startsWith('[error]'))];
  if (errs.length) {
    failed = true;
    console.error('\nERRORS');
    for (const e of errs.slice(0, 15)) console.error('  ' + e.split('\n')[0]);
  }
} catch (err) {
  failed = true;
  console.error('PROBE HARNESS ERROR:', err);
} finally {
  await browser?.close();
  await stopServer(server);
}

process.exit(failed ? 1 : 0);
