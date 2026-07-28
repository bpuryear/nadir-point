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
      query: shot.query ?? '',
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
    const file = path.join(outDir, `${shot.id}.png`);
    await page.screenshot({ path: file, type: 'png' });

    manifest.push({
      id: shot.id,
      ok: true,
      description: shot.description ?? '',
      file: path.relative(ROOT, file),
      stats,
      consoleErrors: consoleErrors.filter((e) => e.startsWith('[error]')),
      pageErrors,
    });
    console.log(`shot ${shot.id.padEnd(18)} calls=${String(stats.calls).padStart(4)} tris=${String(stats.triangles).padStart(9)} -> ${path.relative(ROOT, file)}`);
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
