/**
 * Boot check. Loads the game headlessly, confirms it reaches a ready state, and
 * reports anything the console said. Exits non-zero on failure so it can gate work.
 *
 *   npm run smoke
 */
import { startServer, stopServer, launchBrowser, openGame } from './harness.mjs';

const port = Number(process.env.PORT || 5178);
let server, browser;
let failed = false;

try {
  server = await startServer({ port });
  browser = await launchBrowser();
  const { page, consoleErrors, pageErrors, booted, bootError } = await openGame(browser, server.url, {
    width: 1280, height: 720, settleFrames: 60,
  });

  if (!booted) {
    console.error('BOOT FAILED\n' + bootError);
    failed = true;
  } else {
    const stats = await page.evaluate(() => window.__NADIR.stats());
    console.log('boot           : ok');
    console.log('draw calls     :', stats.calls);
    console.log('triangles      :', stats.triangles?.toLocaleString?.() ?? stats.triangles);
    console.log('programs       :', stats.programs);
    console.log('geometries     :', stats.geometries);
    console.log('textures       :', stats.textures);
  }

  if (pageErrors.length) {
    failed = true;
    console.error('\nPAGE ERRORS');
    for (const e of pageErrors) console.error('  ' + e.split('\n')[0]);
  }
  const realErrors = consoleErrors.filter((e) => e.startsWith('[error]'));
  if (realErrors.length) {
    failed = true;
    console.error('\nCONSOLE ERRORS');
    for (const e of realErrors.slice(0, 20)) console.error('  ' + e);
  }
  const warnings = consoleErrors.filter((e) => e.startsWith('[warning]'));
  if (warnings.length) {
    console.warn(`\n${warnings.length} console warning(s)`);
    for (const w of warnings.slice(0, 10)) console.warn('  ' + w);
  }
} catch (err) {
  failed = true;
  console.error('SMOKE HARNESS ERROR:', err);
} finally {
  await browser?.close();
  await stopServer(server);
}

process.exit(failed ? 1 : 0);
