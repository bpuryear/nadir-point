/**
 * Screenshot harness for the visual review pass.
 *
 * Shots are declared in tools/shots.json so the critic and the builders are looking
 * at the same framings every pass. A shot may pose the camera, set the time scale,
 * force a loadout, or run an arbitrary setup snippet against window.__NADIR.
 *
 *   npm run capture -- --out docs/review/pass1 --shots wide,close,silhouette
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, ROOT } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = path.resolve(ROOT, arg('out', 'docs/review/latest'));
const only = arg('shots', null)?.split(',').map((s) => s.trim());
const width = Number(arg('width', 1600));
const height = Number(arg('height', 900));
const port = Number(process.env.PORT || 5179);

let shots;
try {
  shots = JSON.parse(await fs.readFile(path.join(ROOT, 'tools/shots.json'), 'utf8'));
} catch {
  shots = [{ id: 'default', description: 'default view', settle: 90 }];
}
if (only) shots = shots.filter((s) => only.includes(s.id));

await fs.mkdir(outDir, { recursive: true });

let server, browser;
const manifest = [];
try {
  // Preview mode, for the same reason as the smoke test: the dev server's HMR
  // full-reloads the page whenever anything writes to the tree, which destroys the
  // execution context mid-settle and aborts the shot. Serving a built bundle is
  // immune, and it means review frames come from the artefact that actually ships.
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();

  for (const shot of shots) {
    const { page, consoleErrors, pageErrors, booted, bootError } = await openGame(browser, server.url, {
      width, height,
      // preserveDrawingBuffer so the frame can be sampled after render
      query: (shot.query ? shot.query + '&' : '') + 'capture=1',
      settleFrames: shot.settle ?? 90,
    });

    if (!booted) {
      console.error(`shot ${shot.id}: BOOT FAILED\n${bootError}`);
      manifest.push({ id: shot.id, ok: false, error: bootError });
      await page.close();
      continue;
    }

    if (shot.setup) {
      await page.evaluate((src) => {
        // eslint-disable-next-line no-new-func
        return new Function('N', `return (async () => { ${src} })()`)(window.__NADIR);
      }, shot.setup);
      await page.evaluate((n) => new Promise((resolve) => {
        let i = 0;
        const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }), shot.settleAfterSetup ?? 45);
    }

    const stats = await page.evaluate(() => window.__NADIR.stats());

    /**
     * Measure the frame we just took.
     *
     * The review pass previously green-lit an empty frame: the shot the manifest
     * described as "cruiser a bright speck against the gas giant" contained neither,
     * and was recorded as ok:true because the screenshot call succeeded. A harness
     * that only checks "did a PNG get written" cannot catch the defect that matters.
     *
     * Two cheap statistics catch most of it. Contrast (standard deviation of
     * luminance) near zero means an empty or flat frame. A high clipped fraction
     * means the top of the value curve is blown out, which is the exact failure the
     * critic found on every hull.
     */
    const frame = await page.evaluate(() => {
      const src = document.getElementById('viewport');
      const w = 160, h = 90;
      const t = document.createElement('canvas');
      t.width = w; t.height = h;
      const g = t.getContext('2d');
      g.drawImage(src, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const n = w * h;
      let sum = 0, sum2 = 0, clipped = 0, dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        sum += l; sum2 += l * l;
        if (l > 0.97) clipped++;
        if (l < 0.02) dark++;
      }
      const mean = sum / n;
      return {
        meanLuma: +mean.toFixed(4),
        contrast: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(4),
        clippedPct: +(clipped / n * 100).toFixed(2),
        nearBlackPct: +(dark / n * 100).toFixed(2),
      };
    });

    const warnings = [];
    if (frame.contrast < 0.02) warnings.push('FRAME IS FLAT OR EMPTY (contrast < 0.02)');
    if (frame.nearBlackPct > 97) warnings.push('FRAME IS ESSENTIALLY BLACK (>97% near-black)');
    if (frame.clippedPct > 4) warnings.push(`HIGHLIGHT CLIPPING (${frame.clippedPct}% of frame at/above 0.97)`);

    const file = path.join(outDir, `${shot.id}.png`);
    await page.screenshot({ path: file, type: 'png' });

    manifest.push({
      id: shot.id,
      ok: warnings.length === 0,
      warnings,
      frame,
      description: shot.description ?? '',
      file: path.relative(ROOT, file),
      stats,
      consoleErrors: consoleErrors.filter((e) => e.startsWith('[error]')),
      pageErrors,
    });
    console.log(`shot ${shot.id.padEnd(14)} calls=${String(stats.calls).padStart(4)} tris=${String(stats.triangles).padStart(8)}`
      + `  luma=${frame.meanLuma.toFixed(3)} contrast=${frame.contrast.toFixed(3)} clipped=${String(frame.clippedPct).padStart(5)}%`
      + `  -> ${path.relative(ROOT, file)}`);
    for (const w of warnings) { console.warn(`   !! ${w}`); process.exitCode = 1; }
    await page.close();
  }

  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
} catch (err) {
  console.error('CAPTURE ERROR:', err);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer(server);
}
