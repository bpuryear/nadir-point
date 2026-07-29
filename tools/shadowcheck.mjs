/**
 * DOES THE SHIP SHADOW ITSELF? Answered with a number, not by squinting.
 *
 * Round-one review recorded the same finding the acceptance doc did: "The ship does
 * not self-shadow at all ... the bridge tower, the raised dorsal spine, the deck
 * boxes and the bay truss all lay zero shadow on the deck directly beneath them",
 * and D23 had already recorded a bias-units fix that was supposed to close it. Two
 * passes have now argued about this from screenshots.
 *
 * The experiment is trivial and settles it: pose the close shot, screenshot, then
 * turn `key.castShadow` OFF, screenshot again, and diff. If the two frames are the
 * same image, no shadow is reaching any hull and every explanation involving bias
 * is beside the point. If they differ, the diff IS the shadow and its area says how
 * much of the ship it covers.
 *
 *   node tools/shadowcheck.mjs
 */
import { startServer, stopServer, launchBrowser, openGame } from './harness.mjs';

const port = Number(process.env.PORT || 5193);
let server, browser;
try {
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();
  const { page, booted, bootError } = await openGame(browser, server.url, {
    width: 1280, height: 720, query: 'capture=1', settleFrames: 40,
  });
  if (!booted) { console.error('BOOT FAILED\n' + bootError); process.exit(1); }

  // The close shot, same pose tools/shots.json uses.
  await page.evaluate(() => {
    const t = window.__NADIR.world.systems.tactical;
    t.mode = 'LOCKED';
    t.lockTarget = window.__NADIR.world.player;
    t.yaw = t._yawTarget = 2.35;
    t.pitchOffset = t._pitchTarget = 0.18;
    t.zoomT = t._zoomTTarget = 0.02;
  });
  const settle = (n) => page.evaluate((k) => new Promise((res) => {
    let i = 0;
    const step = () => (++i >= k ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);
  await settle(45);

  const grab = () => page.evaluate(() => {
    const src = document.getElementById('viewport');
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, 640, 360);
    return Array.from(g.getImageData(0, 0, 640, 360).data);
  });

  const rig = await page.evaluate(() => {
    const l = window.__NADIR.world.systems?.lighting ?? window.__NADIR.world.lighting;
    const key = l?.key;
    if (!key) return { found: false };
    const cam = key.shadow.camera;
    const p = window.__NADIR.world.player?.object3d ?? window.__NADIR.world.player?.root;
    const pw = p ? p.getWorldPosition(new window.__NADIR.THREE.Vector3()) : null;
    return {
      found: true,
      castShadow: key.castShadow,
      mapSize: [key.shadow.mapSize.x, key.shadow.mapSize.y],
      bias: key.shadow.bias,
      normalBias: key.shadow.normalBias,
      camBox: [cam.left, cam.right, cam.bottom, cam.top, cam.near, cam.far],
      lightPos: key.position.toArray().map((v) => +v.toFixed(1)),
      target: key.target.position.toArray().map((v) => +v.toFixed(1)),
      player: pw ? pw.toArray().map((v) => +v.toFixed(1)) : null,
      shadowMapEnabled: window.__NADIR.renderer.renderer.shadowMap.enabled,
      shadowMapType: window.__NADIR.renderer.renderer.shadowMap.type,
    };
  });
  console.log('rig:', JSON.stringify(rig, null, 2));

  const withShadow = await grab();
  await page.evaluate(() => {
    const l = window.__NADIR.world.systems?.lighting ?? window.__NADIR.world.lighting;
    if (l?.key) l.key.castShadow = false;
    window.__NADIR.renderer.renderer.shadowMap.needsUpdate = true;
  });
  await settle(12);
  const without = await grab();

  let changed = 0, lit = 0, sum = 0, worst = 0;
  for (let i = 0; i < withShadow.length; i += 4) {
    const a = (withShadow[i] + withShadow[i + 1] + withShadow[i + 2]) / 3;
    const b = (without[i] + without[i + 1] + without[i + 2]) / 3;
    if (b > 14) lit++;                       // pixel is on something lit
    const d = Math.abs(a - b);
    if (d > 6) { changed++; sum += d; if (d > worst) worst = d; }
  }
  console.log(`\nlit pixels        : ${lit}`);
  console.log(`pixels changed    : ${changed}  (${(changed / Math.max(1, lit) * 100).toFixed(1)}% of lit)`);
  console.log(`mean delta        : ${changed ? (sum / changed).toFixed(1) : 0} / 255   worst ${worst}`);
  if (changed / Math.max(1, lit) < 0.01) {
    console.log('\nVERDICT: NO CAST SHADOW IS REACHING THE SUBJECT.');
    process.exitCode = 1;
  } else {
    console.log('\nVERDICT: cast shadows are live and are covering that fraction of the lit subject.');
  }
} catch (e) {
  console.error('SHADOWCHECK ERROR', e);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer(server);
}
