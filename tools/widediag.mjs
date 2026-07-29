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
import { readFile } from 'node:fs/promises';
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

  // Apply the shot's OWN setup string out of tools/shots.json, so this diagnoses the
  // real shot rather than a paraphrase of it that might not reproduce the failure.
  const shotId = process.argv[2] ?? 'wide';
  const shots = JSON.parse(await readFile(new URL('./shots.json', import.meta.url), 'utf8'));
  const list = Array.isArray(shots) ? shots : (shots.shots ?? []);
  const shot = list.find((s) => s.id === shotId);
  if (!shot) { console.error(`no shot "${shotId}" in tools/shots.json`); process.exit(1); }
  console.log(`shot ${shotId}: ${shot.description?.slice(0, 90) ?? ''}\n`);

  if (shot.setup) {
    await page.evaluate((src) => new Function('N', `return (async () => { ${src} })()`)(window.__NADIR), shot.setup);
    await page.evaluate((n) => new Promise((resolve) => {
      let i = 0;
      const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    }), shot.settleAfterSetup ?? 45);
  }

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

    // The player against the MAIN camera. For a close shot this is the whole question:
    // celestials are irrelevant if the hull itself is not in frame.
    const p = w.player;
    if (p) {
      mc.updateMatrixWorld(true);
      const pp = p.body?.position ?? p.position;
      const ndc = pp.clone().project(mc);
      const fwdM = new THREE.Vector3(0, 0, -1).applyQuaternion(mc.quaternion).normalize();
      const toP = pp.clone().sub(mc.position);
      report.player = {
        worldPos: pp.toArray().map((n) => Math.round(n)),
        distance: Math.round(toP.length()),
        offAxisDeg: +THREE.MathUtils.radToDeg(fwdM.angleTo(toP.clone().normalize())).toFixed(1),
        ndc: ndc.toArray().map((n) => +n.toFixed(2)),
        onScreen: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1,
        behindCamera: ndc.z > 1,
      };
    }

    // Where is the key relative to the camera? A frame can be perfectly composed and
    // still render black if it is looking at the side the key is not on. With a
    // key-to-fill ratio in the tens, the shadow side has nowhere to go but black.
    const keys = [];
    w.scene.traverse((o) => { if (o.isLight && /key|fill|rim/.test(o.name ?? '')) keys.push(o); });
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mc.quaternion).normalize();
    report.lighting = keys.map((L) => {
      L.updateMatrixWorld(true);
      const lp = new THREE.Vector3().setFromMatrixPosition(L.matrixWorld);
      const tp = L.target ? new THREE.Vector3().setFromMatrixPosition(L.target.matrixWorld) : new THREE.Vector3();
      // direction the light TRAVELS
      const dir = tp.clone().sub(lp).normalize();
      // +1 means the light travels the same way the camera looks => we see the lit face
      // -1 means the light comes toward the camera => we see the shadow side
      return {
        name: L.name, intensity: +L.intensity.toFixed(3),
        travelDir: dir.toArray().map((n) => +n.toFixed(3)),
        dotWithCameraForward: +camFwd.dot(dir).toFixed(3),
        facing: camFwd.dot(dir) > 0.15 ? 'LIT SIDE' : (camFwd.dot(dir) < -0.15 ? 'SHADOW SIDE' : 'edge-on'),
      };
    });

    // What is actually being drawn, and where does it land on screen? When the numbers
    // and the picture disagree this is the question that settles it.
    // Effective visibility, not own visibility. three.js skips a whole subtree when an
    // ANCESTOR is hidden, so a mesh with visible:true under a hidden group is counted by
    // a naive traverse and never actually drawn.
    const effectivelyVisible = (o) => {
      for (let n = o; n && n !== w.scene; n = n.parent) if (!n.visible) return false;
      return true;
    };
    const hiddenBranches = [];
    w.scene.traverse((o) => {
      if (!o.visible && o.children.length) {
        hiddenBranches.push({ name: o.name || '(unnamed)', type: o.type, children: o.children.length });
      }
    });
    report.hiddenBranches = hiddenBranches.slice(0, 12);

    const drawn = [];
    w.scene.traverse((o) => {
      if (!o.isMesh || !effectivelyVisible(o)) return;
      const box = new THREE.Box3().setFromObject(o);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const ndc = c.clone().project(mc);
      drawn.push({
        name: o.name || o.parent?.name || '(unnamed)',
        centre: c.toArray().map((n) => Math.round(n)),
        sizeM: Math.round(Math.max(size.x, size.y, size.z)),
        dist: Math.round(mc.position.distanceTo(c)),
        ndc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2)],
        onScreen: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1,
      });
    });
    drawn.sort((a, b) => b.sizeM - a.sizeM);
    report.drawnTop = drawn.slice(0, 12);
    report.drawnCount = drawn.length;
    report.drawnOnScreen = drawn.filter((d) => d.onScreen).length;

    const tac = w.systems.tactical;
    if (tac) {
      report.tactical = {
        mode: tac.mode,
        hasLockTarget: !!tac.lockTarget,
        lockIsPlayer: tac.lockTarget === w.player,
        yaw: +tac.yaw.toFixed(3), yawTarget: +tac._yawTarget.toFixed(3),
        pitchOffset: +tac.pitchOffset.toFixed(3), pitchTarget: +tac._pitchTarget.toFixed(3),
        zoomT: +tac.zoomT.toFixed(3), zoomTarget: +tac._zoomTTarget.toFixed(3),
        distance: Math.round(tac.distance),
        focus: tac.focus.toArray().map((n) => Math.round(n)),
        snapActive: !!tac._snap,
      };
    }
    return report;
  });

  // Screenshot from inside the SAME run that produced the numbers above. Comparing a
  // diagnosis to a frame captured by a different process invites exactly the kind of
  // "the tool and the picture disagree" round this project keeps paying for.
  if (shot.hud === false) {
    await page.evaluate(() => {
      const root = document.getElementById('ui-root');
      if (root) root.style.visibility = 'hidden';
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const outPng = `docs/review/widediag-${shotId}.png`;
  await page.screenshot({ path: outPng, type: 'png' });
  console.log(`wrote ${outPng}`);

  // CONTROL: same frame with frustum culling switched off. If the hull appears only
  // here, the geometry is being culled at close range -- which means a bounding volume
  // that does not describe the mesh it belongs to, not a camera or a lighting fault.
  const cull = await page.evaluate(() => {
    const w = window.__NADIR.world;
    let meshes = 0, culled = 0, noSphere = 0;
    const cam = w.renderer.camera;
    cam.updateMatrixWorld(true);
    const THREE = window.__NADIR.THREE;
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
    );
    w.scene.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      if (!g.boundingSphere) { g.computeBoundingSphere(); noSphere++; }
      if (o.frustumCulled && !frustum.intersectsObject(o)) culled++;
      o.frustumCulled = false;
    });
    return { meshes, culledByFrustum: culled, hadNoBoundingSphere: noSphere };
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const ctlPng = `docs/review/widediag-${shotId}-nocull.png`;
  await page.screenshot({ path: ctlPng, type: 'png' });
  console.log(`wrote ${ctlPng}   ${JSON.stringify(cull)}\n`);

  console.log(JSON.stringify(out, null, 2));
} catch (err) {
  console.error('WIDEDIAG ERROR:', err);
  process.exit(1);
} finally {
  await browser?.close();
  await stopServer(server);
}
