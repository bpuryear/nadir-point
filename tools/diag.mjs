/**
 * Runtime diagnostic. Answers "what is actually in the scene", which is a different
 * question from "what does the code say should be in the scene" - and the review pass
 * showed those two answers had diverged.
 *
 *   node tools/diag.mjs
 */
import { startServer, stopServer, launchBrowser, openGame } from './harness.mjs';

const port = Number(process.env.PORT || 5191);
let server, browser;
try {
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();
  const { page, booted, bootError } = await openGame(browser, server.url, {
    width: 800, height: 450, query: 'capture=1', settleFrames: 20,
  });
  if (!booted) { console.error('BOOT FAILED\n' + bootError); process.exit(1); }

  const out = await page.evaluate(() => {
    const N = window.__NADIR;
    const w = N.world;
    const lights = [];
    w.scene.traverse((o) => {
      if (o.isLight) {
        lights.push({
          type: o.type, name: o.name || '(unnamed)',
          intensity: +o.intensity.toFixed(3),
          color: '#' + o.color.getHexString(),
          castShadow: !!o.castShadow,
        });
      }
    });
    let meshes = 0, casters = 0, receivers = 0;
    w.scene.traverse((o) => {
      if (o.isMesh) { meshes++; if (o.castShadow) casters++; if (o.receiveShadow) receivers++; }
    });
    return {
      report: w.report,
      systems: Object.keys(w.systems),
      lights,
      envMap: !!w.scene.environment,
      envIntensity: w.scene.environmentIntensity,
      backgroundIntensity: w.scene.backgroundIntensity,
      exposure: N.renderer.renderer.toneMappingExposure,
      postBase: N.renderer.post.baseExposure,
      postScale: N.renderer.post.exposureScale,
      bloom: N.renderer.post.bloom?.strength,
      shadowMapEnabled: N.renderer.renderer.shadowMap.enabled,
      meshes, casters, receivers,
      ships: w.ships.length,
      wrecks: w.wrecks.length,
    };
  });

  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error('DIAG ERROR', e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer(server);
}
