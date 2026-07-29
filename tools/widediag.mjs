/**
 * Why is the `wide` shot black?
 *
 * `tools/shots.json` calls wide "the shot that sells the game", and it renders as an
 * almost empty black frame: no gas giant, no star, no nebula, just the cruiser as a
 * speck. The row it is evidence for -- "cruiser reads as kilometres long in a wide
 * shot" -- sat UNVERIFIED because under software rasterisation the capture timed out
 * before it rendered at all, so nobody had ever seen the failure.
 *
 * This reproduces the shot's own camera setup and reports where the celestials actually
 * are relative to the frame, rather than guessing from the code.
 *
 *   node tools/widediag.mjs
 */
import { startServer, stopServer, launchBrowser, openGame } from './harness.mjs';

const port = Number(process.env.PORT || 5193);
let server, browser;
try {
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();
  const { page, booted, bootError } = await openGame(browser, server.url, {
    width: 2560, height: 1440, query: 'capture=1', settleFrames: 40,
  });
  if (!booted) { console.error('BOOT FAILED\n' + bootError); process.exit(1); }

  // Apply the exact setup string from shots.json#wide, then settle.
  await page.evaluate(() => {
    const N = window.__NADIR;
    const t = N.world.systems.tactical;
    t.mode = 'LOCKED';
    t.lockTarget = N.world.player;
    const g = N.world.systems.celestials?.parts?.giant?.object;
    let yaw = 1.7;
    if (g) { const p = g.position; const h = Math.hypot(p.x, p.z) || 1; yaw = Math.atan2(-p.x / h, -p.z / h); }
    t.yaw = t._yawTarget = yaw;
    t.pitchOffset = t._pitchTarget = 0.16;
    t.zoomT = t._zoomTTarget = 0.86;
  });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => {
    const THREE = window.__NADIR.THREE;
    const N = window.__NADIR;
    const w = N.world;
    const r = w.renderer;

    const report = { poi: w.poiId ?? '(unknown)', celestials: [], farChildren: 0 };

    // The far camera is what actually draws celestials. Its projection is what decides
    // whether the giant is in frame, not the main camera's.
    const cam = r.farCamera;
    cam.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    );

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();

    r.far.traverse((o) => {
      if (o === r.far) return;
      report.farChildren++;
    });

    const parts = w.systems.celestials?.parts ?? {};
    for (const [name, part] of Object.entries(parts)) {
      const obj = part?.object;
      if (!obj) { report.celestials.push({ name, present: false }); continue; }
      obj.updateMatrixWorld(true);
      const wp = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
      const toObj = wp.clone().sub(cam.position);
      const dist = toObj.length();
      const angleDeg = THREE.MathUtils.radToDeg(fwd.angleTo(toObj.clone().normalize()));

      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) * 0.5;
      // angular radius as seen from the camera
      const angularRadiusDeg = THREE.MathUtils.radToDeg(Math.atan2(radius, Math.max(1, dist)));

      const ndc = wp.clone().project(cam);

      report.celestials.push({
        name,
        present: true,
        visible: obj.visible,
        inFrustum: frustum.intersectsBox(box),
        worldPos: wp.toArray().map((n) => Math.round(n)),
        distance: Math.round(dist),
        radius: Math.round(radius),
        offAxisDeg: +angleDeg.toFixed(1),
        angularRadiusDeg: +angularRadiusDeg.toFixed(1),
        ndc: ndc.toArray().map((n) => +n.toFixed(2)),
        onScreen: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1,
      });
    }

    report.farCam = {
      pos: cam.position.toArray().map((n) => Math.round(n)),
      fov: cam.fov, near: cam.near, far: Math.round(cam.far),
      halfFovDeg: +(cam.fov / 2).toFixed(1),
      fwd: fwd.toArray().map((n) => +n.toFixed(3)),
    };
    const mc = r.camera;
    report.mainCam = {
      pos: mc.position.toArray().map((n) => Math.round(n)),
      near: mc.near, far: Math.round(mc.far),
      distToPlayer: Math.round(mc.position.distanceTo(w.player.body.position)),
    };
    report.farSceneBackground = r.far.background ? 'set' : 'null';
    return report;
  });

  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.error('WIDEDIAG ERROR:', err);
  process.exit(1);
} finally {
  await browser?.close();
  await stopServer(server);
}
