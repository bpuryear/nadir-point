/**
 * Why is a look-review shot black?
 *
 * `tools/shots.json` calls `wide` "the shot that sells the game", and it used to render
 * as an almost empty black frame. That one is fixed. `close` is still black, and this
 * tool is what settles which of the many plausible causes is the real one.
 *
 * It reproduces a shot's OWN setup string out of tools/shots.json and reports where
 * everything actually is, rather than guessing from the code.
 *
 *   node tools/widediag.mjs close
 *   node tools/widediag.mjs close,wide --bisect
 *   node tools/widediag.mjs close --assert        # a GATE: exits 1 while D67 is live
 *
 * ---------------------------------------------------------------------------
 * THREE THINGS THIS TOOL GOT WRONG BEFORE, WRITTEN DOWN SO THEY STAY FIXED
 *
 * 1. IT IGNORED THE SHOT'S OWN `query`.
 *    `openGame` was called with a hard-coded `capture=1` while `tools/shots.json`
 *    pins `close`, `wide`, `three-quarter`, `hud-close` and `hud-three-quarter` to
 *    `poi=giant-orbit`. The boot default is START_POI ('graveyard'). So every number
 *    this tool has ever printed for those five shots was measured AT THE WRONG PLACE,
 *    under a different key light, a different palette, a different exposure and a
 *    different celestial set. The evidence is in its own output: the previous run's
 *    lighting block is named `poi-key:graveyard` for a shot that says poi=giant-orbit.
 *    That is how "the key is FRONTAL, dot +0.978" got recorded for a frame whose key
 *    is, at the graveyard, on the SHADOW side at dot -0.864.
 *    A diagnostic that boots somewhere other than the thing it is diagnosing is worse
 *    than no diagnostic, because its numbers get quoted.
 *
 * 2. IT MEASURED NO PIXELS.
 *    It reported geometry, framing, culling and lighting - everything except whether
 *    the frame was actually bright. The question being asked is "why is it black" and
 *    the tool never once looked at the black. It now measures the canvas with the same
 *    statistic `tools/capture.mjs` gates on, so the two agree by construction, and it
 *    prints the SAMPLE SIZE, because a check that measures nothing also prints "ok".
 *
 * 3. IT COULD NOT ISOLATE A CAUSE.
 *    `--bisect` turns one thing off at a time - each VFX layer, each post pass, the
 *    composer's MSAA, the composer itself - and re-measures. A cause is not "the frame
 *    got brighter when I changed six things"; it is one named toggle with a number
 *    beside it. Every probe is reverted before the next one runs, and the baseline is
 *    re-measured at the end to prove the sequence left no residue.
 *
 * 4. IT WAS A REPORT, NOT A GATE.
 *    D67 has now survived two waves as prose - a paragraph in this header, a paragraph
 *    in `tools/shots.json`, a section in `docs/review/defects.md` - and prose does not
 *    go red. `--assert` does. It measures the frame, then asks the ONE question that
 *    separates the three possible states of this defect, and exits non-zero for two of
 *    them with different text:
 *
 *      frame renders                     -> PASS, and it also checks the clamp is inert
 *      frame black AND the clamp fixes it-> FAIL "the fix is NOT LANDED", + the patch
 *      frame black AND the clamp doesn't -> FAIL "the diagnosis no longer holds"
 *
 *    A gate that cannot tell "not landed" from "landed and insufficient" is the reason
 *    this defect needed re-diagnosing from scratch twice. This one is told by the tool.
 */
import { readFile } from 'node:fs/promises';
import { startServer, stopServer, launchBrowser, openGame, rasterMode } from './harness.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const shotIds = (positional[0] ?? 'wide').split(',').map((s) => s.trim()).filter(Boolean);
const wantBisect = flags.has('--bisect');
const wantJSON = !flags.has('--quiet');
/**
 * `--with-fix` ALSO writes the counterfactual frame: the same shot with the proposed
 * one-line change to src/vfx/engines.js:76 patched into the live material at runtime.
 *
 * It exists because the `close` shot has been unrenderable for two waves and the art
 * review needs to see the hull, while the fix lives in a file no reviewing stream owns.
 * The output is written under a DIFFERENT name (`-clamped.png`) and the provenance is
 * printed every time, because a frame that HEAD cannot produce must never be filed
 * where a frame HEAD produced would go. It is not evidence about this commit. It is
 * evidence about what one line would buy.
 */
const wantFix = flags.has('--with-fix');
const wantAssert = flags.has('--assert');

/**
 * capture.mjs's OWN guards, copied deliberately rather than imported, because the point
 * of `--assert` is to predict what `npm run capture` will do. If these two ever drift
 * the gate is lying, so they are named here where a diff shows them side by side.
 * tools/capture.mjs: contrast < 0.02 | nearBlack > 97% | clipped > 4%.
 */
const CAPTURE_GUARDS = { minContrast: 0.02, maxNearBlackPct: 97, maxClippedPct: 4 };
function captureVerdict(m) {
  const fired = [];
  if (m.contrast < CAPTURE_GUARDS.minContrast) fired.push(`FRAME IS FLAT OR EMPTY (contrast ${m.contrast} < ${CAPTURE_GUARDS.minContrast})`);
  if (m.nearBlackPct > CAPTURE_GUARDS.maxNearBlackPct) fired.push(`FRAME IS ESSENTIALLY BLACK (${m.nearBlackPct}% > ${CAPTURE_GUARDS.maxNearBlackPct}% near-black)`);
  if (m.clippedPct > CAPTURE_GUARDS.maxClippedPct) fired.push(`HIGHLIGHT CLIPPING (${m.clippedPct}% > ${CAPTURE_GUARDS.maxClippedPct}%)`);
  return fired;
}

/** The one line D67 is about. Stated once, used by both the probe and the gate. */
const D67 = {
  file: 'src/vfx/engines.js',
  line: 76,
  from: 'float t = vUv.y;',
  to: 'float t = clamp(vUv.y, 0.0, 1.0);',
};
let assertFailures = 0;

// The frame sample. Stated as a constant and printed with every measurement, because
// "luma 0.010" means nothing without N, and a resolution of zero prints a clean pass.
const SAMPLE_W = 320;
const SAMPLE_H = 180;

const port = Number(process.env.PORT || 5193);
let server, browser;

/** The per-page frame statistic. Same luminance weights and same thresholds as capture.mjs. */
const MEASURE_SRC = `(w, h) => {
  const src = document.getElementById('viewport');
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  const g = t.getContext('2d');
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const n = w * h;
  let sum = 0, sum2 = 0, clipped = 0, dark = 0, maxL = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    sum += l; sum2 += l * l;
    if (l > maxL) maxL = l;
    if (l > 0.97) clipped++;
    if (l < 0.02) dark++;
  }
  const mean = sum / n;
  return {
    samples: n,
    meanLuma: +mean.toFixed(4),
    contrast: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(4),
    maxLuma: +maxL.toFixed(4),
    clippedPct: +(clipped / n * 100).toFixed(2),
    nearBlackPct: +(dark / n * 100).toFixed(2),
  };
}`;

async function settle(page, frames = 3) {
  await page.evaluate((n) => new Promise((resolve) => {
    let i = 0;
    const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), frames);
}

async function measure(page) {
  return page.evaluate(
    ([src, w, h]) => (new Function('return ' + src))()(w, h),
    [MEASURE_SRC, SAMPLE_W, SAMPLE_H]
  );
}

/**
 * The single-variable sweep.
 *
 * Each probe is `{ id, apply, revert }` evaluated in the page. Between apply and
 * measure the loop waits 3 frames: the render loop is rAF-driven, so one frame is not
 * enough to be sure the mutation was in effect for the frame that got sampled.
 */
const PROBES_SRC = `() => {
  const N = window.__NADIR;
  const w = N.world;
  const r = w.renderer;
  const post = r.post;
  const vfx = w.systems.vfx;
  const list = [];

  const vis = (obj, id) => {
    if (!obj) return;
    list.push({ id, was: obj.visible, apply: () => { obj.visible = false; }, revert: () => { obj.visible = true; } });
  };
  const pass = (p, id) => {
    if (!p) return;
    list.push({ id, was: p.enabled, apply: () => { p.enabled = false; }, revert: (v) => { p.enabled = v; } });
  };

  if (vfx) {
    vis(vfx.root, 'vfx:ALL');
    vis(vfx.engines?.mesh, 'vfx:plumes');
    vis(vfx.weapons?.group, 'vfx:weapons');
    vis(vfx.shields?.mesh, 'vfx:shields');
    vis(vfx.explosions?.group, 'vfx:explosions');
    vis(vfx.damage?.group, 'vfx:damage');
    vis(vfx.rings?.mesh, 'vfx:rings');
    vis(vfx.particles?.mesh, 'vfx:particles');
  }
  if (post) {
    pass(post.bloom, 'post:bloom');
    pass(post.gtao, 'post:gtao');
    pass(post.godrays, 'post:godrays');
    pass(post.grade, 'post:grade');
    pass(post.smaa, 'post:smaa');
    pass(post.output, 'post:output');
  }

  /*
   * THE TWO PROBES THAT NAME A MECHANISM RATHER THAN A LAYER.
   *
   * Hiding vfx:plumes tells you the plume mesh is responsible. It does not tell you
   * WHY, and "turn the feature off" is not a fix. These two separate the two competing
   * explanations for a plume that poisons the whole frame:
   *
   *   msaa:samples=0   If the composer's multisampled target is what pushes an
   *                    interpolated varying outside its authored [0,1] range on
   *                    partially-covered edge fragments, dropping to a single sample
   *                    per pixel removes the extrapolation and the frame comes back
   *                    with the plumes still drawn. If the frame stays black, the bad
   *                    value is in the instance buffers and MSAA is a bystander.
   *
   *   fix:clamp-vUv.y  The proposed one-line change to src/vfx/engines.js:76, applied
   *                    to the live material and recompiled. This is the counterfactual
   *                    frame. Any number quoted off it must be labelled as such: it is
   *                    NOT what HEAD renders.
   */
  const composer = post?.composer;
  if (composer?.renderTarget1) {
    const rt1 = composer.renderTarget1, rt2 = composer.renderTarget2;
    const was = rt1.samples;
    list.push({
      id: 'msaa:samples=0', was,
      apply: () => {
        rt1.samples = 0; rt2.samples = 0;
        // Framebuffers are built once and cached; disposing is what forces three.js to
        // rebuild them with the new sample count on the next bind.
        rt1.dispose(); rt2.dispose();
      },
      revert: (v) => { rt1.samples = v; rt2.samples = v; rt1.dispose(); rt2.dispose(); },
    });
  }
  const pm = vfx?.engines?.material;
  if (pm && pm.fragmentShader.includes('float t = vUv.y;')) {
    const original = pm.fragmentShader;
    list.push({
      id: 'fix:clamp-vUv.y', was: 'unclamped',
      apply: () => {
        pm.fragmentShader = original.replace('float t = vUv.y;', 'float t = clamp(vUv.y, 0.0, 1.0);');
        pm.needsUpdate = true;
      },
      revert: () => { pm.fragmentShader = original; pm.needsUpdate = true; },
    });
  } else if (pm) {
    list.push({ id: 'fix:clamp(ALREADY)', was: 'clamped-on-disk', apply: () => {}, revert: () => {} });
  }

  window.__WD_PROBES = list;
  return list.map((p) => ({ id: p.id, was: p.was }));
}`;

try {
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();

  const shots = JSON.parse(await readFile(new URL('./shots.json', import.meta.url), 'utf8'));
  const list = Array.isArray(shots) ? shots : (shots.shots ?? []);

  const summary = [];

  for (const shotId of shotIds) {
    const shot = list.find((s) => s.id === shotId);
    if (!shot) { console.error(`no shot "${shotId}" in tools/shots.json`); process.exit(1); }

    /*
     * THE SHOT'S OWN QUERY. This is defect #1 in the header comment. `capture=1` is
     * appended because this tool samples the drawing buffer and main.js only sets
     * preserveDrawingBuffer when that parameter is present; everything else -
     * `poi=giant-orbit` above all - comes from the shot.
     */
    const query = (shot.query ? shot.query + '&' : '') + 'capture=1';

    const { page, booted, bootError, consoleErrors, pageErrors } = await openGame(browser, server.url, {
      width: 2560, height: 1440, query, settleFrames: shot.settle ?? 40,
    });
    if (!booted) { console.error(`shot ${shotId}: BOOT FAILED\n${bootError}`); process.exit(1); }

    console.log(`\n=== shot ${shotId} ===`);
    console.log(`raster=${rasterMode()}  query="${query}"  viewport=2560x1440  sample=${SAMPLE_W}x${SAMPLE_H} (${SAMPLE_W * SAMPLE_H} px)`);
    console.log(`${shot.description?.slice(0, 100) ?? ''}\n`);

    if (shot.setup) {
      await page.evaluate((src) => new Function('N', `return (async () => { ${src} })()`)(window.__NADIR), shot.setup);
      await settle(page, shot.settleAfterSetup ?? 45);
    }
    if (shot.hud === false) {
      await page.evaluate(() => {
        const root = document.getElementById('ui-root');
        if (root) root.style.visibility = 'hidden';
      });
      await settle(page, 2);
    }

    const out = await page.evaluate(() => {
      const THREE = window.__NADIR.THREE;
      const N = window.__NADIR;
      const w = N.world;
      const r = w.renderer;

      const report = { celestials: [], farChildren: 0 };

      // Which POI did this page ACTUALLY boot at? Read two independent ways and
      // report both, so a mismatch between what the shot asked for and what it got
      // is visible instead of implied.
      const qp = new URLSearchParams(location.search).get('poi');
      const lightNames = [];
      w.scene.traverse((o) => { if (o.isLight && o.name) lightNames.push(o.name); });
      const keyName = lightNames.find((n) => n.startsWith('poi-key:'));
      report.poi = {
        requestedByShot: qp ?? '(none - boot default)',
        fromKeyLightName: keyName ? keyName.slice('poi-key:'.length) : '(no poi key light)',
      };

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

      /*
       * EXPOSURE. A perfectly composed, perfectly lit frame renders black if the tone
       * mapper is being multiplied by something near zero, and nothing else in this
       * report would show it. `game.js` drives `setExposureScale` every frame off the
       * tactical overlay blend, so this is a live value, not a constant.
       */
      const post = r.post;
      report.exposure = {
        base: +(post?.baseExposure ?? 0).toFixed(4),
        scale: +(post?.exposureScale ?? 0).toFixed(4),
        effective: +(r.renderer.toneMappingExposure ?? 0).toFixed(4),
        toneMapping: r.renderer.toneMapping,
      };
      /*
       * IS THE BAD VALUE IN THE DATA? The plume instance buffers are CPU-side
       * Float32Arrays rebuilt every frame from live ship state. If a NaN reaches the
       * GPU through them, the fault is in `engines.pushShip` or in the ship state it
       * reads, and no amount of shader clamping fixes it. Scanning the live prefix
       * (instanceCount, not capacity) settles which half of the pipe to look in.
       */
      const eng = w.systems.vfx?.engines;
      if (eng) {
        const n = eng.mesh?.geometry?.instanceCount ?? 0;
        const bad = { origin: 0, dir: 0, params: 0, col: 0 };
        const scan = (arr, stride, key) => {
          for (let i = 0; i < n * stride; i++) if (!Number.isFinite(arr[i])) bad[key]++;
        };
        scan(eng.origin, 3, 'origin'); scan(eng.dir, 3, 'dir');
        scan(eng.params, 4, 'params'); scan(eng.col, 3, 'col');
        report.plumeBuffers = {
          liveInstances: n,
          capacity: eng.capacity,
          nonFiniteFloats: bad,
          total: bad.origin + bad.dir + bad.params + bad.col,
        };
      }

      report.passes = post ? {
        gtao: !!post.gtao?.enabled,
        godrays: !!post.godrays?.enabled,
        bloom: !!post.bloom?.enabled,
        smaa: !!post.smaa?.enabled,
        composerSamples: post.composer?.renderTarget1?.samples ?? null,
      } : null;

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

    // ---------------------------------------------------------------- the pixels
    const baseline = await measure(page);
    out.frame = baseline;
    console.log(`FRAME  luma=${baseline.meanLuma.toFixed(4)}  contrast=${baseline.contrast.toFixed(4)}`
      + `  max=${baseline.maxLuma.toFixed(4)}  nearBlack=${baseline.nearBlackPct}%  clipped=${baseline.clippedPct}%`
      + `   [N=${baseline.samples} px]`);
    console.log(`POI    shot asked for "${out.poi.requestedByShot}"; key light says "${out.poi.fromKeyLightName}"`
      + (out.poi.requestedByShot !== out.poi.fromKeyLightName && out.poi.requestedByShot !== '(none - boot default)'
        ? '   !! MISMATCH' : ''));
    console.log(`EXPO   base=${out.exposure.base} scale=${out.exposure.scale} effective=${out.exposure.effective}`);

    // ------------------------------------------------------------------- assert
    /*
     * THE GATE. Two measurements, one conclusion, no prose.
     *
     * It runs BEFORE --bisect and before the cull control on purpose: the cull control
     * permanently clears `frustumCulled` on every mesh, so anything measured after it
     * is measuring a scene this game never renders.
     */
    if (wantAssert) {
      const onDisk = await page.evaluate((from) => {
        const m = window.__NADIR.world.systems.vfx?.engines?.material;
        if (!m) return 'no-plume-material';
        return m.fragmentShader.includes(from) ? 'unclamped' : 'clamped';
      }, D67.from);

      // The counterfactual, measured rather than assumed. If the material is already
      // clamped on disk there is nothing to apply and the answer is the baseline.
      let clamped = baseline;
      if (onDisk === 'unclamped') {
        await page.evaluate(([from, to]) => {
          const m = window.__NADIR.world.systems.vfx.engines.material;
          m.fragmentShader = m.fragmentShader.replace(from, to);
          m.needsUpdate = true;
        }, [D67.from, D67.to]);
        await settle(page, 8);
        clamped = await measure(page);
        await page.evaluate(([from, to]) => {
          const m = window.__NADIR.world.systems.vfx.engines.material;
          m.fragmentShader = m.fragmentShader.replace(to, from);
          m.needsUpdate = true;
        }, [D67.from, D67.to]);
        await settle(page, 6);
      }

      const fired = captureVerdict(baseline);
      const firedClamped = captureVerdict(clamped);
      const pb = out.plumeBuffers;

      console.log(`\nASSERT  shot "${shotId}" against tools/capture.mjs's own three guards`);
      console.log(`  ${D67.file}:${D67.line} on disk: ${onDisk.toUpperCase()}`);
      if (pb) {
        console.log(`  plume instance buffers: ${pb.liveInstances} live of ${pb.capacity}, `
          + `${pb.total} non-finite floats  -> the bad value is ${pb.total === 0 ? 'NOT in the CPU data' : 'IN THE CPU DATA, not the shader'}`);
      }
      console.log(`  HEAD          luma=${baseline.meanLuma.toFixed(4)} contrast=${baseline.contrast.toFixed(4)} nearBlack=${baseline.nearBlackPct}%  [N=${baseline.samples} px]`);
      if (onDisk === 'unclamped') {
        console.log(`  + clamp       luma=${clamped.meanLuma.toFixed(4)} contrast=${clamped.contrast.toFixed(4)} nearBlack=${clamped.nearBlackPct}%  [N=${clamped.samples} px]`);
      }

      if (!fired.length) {
        console.log(`  PASS  the frame renders. npm run capture -- --shots ${shotId} will exit 0.`);
        /*
         * A green frame is not the end of the check, and on SwiftShader it is close to
         * meaningless. MEASURED: `close` renders 0.1692/0.2631 under NP_RASTER=
         * swiftshader and 0.0104/0.0129 under hardware ANGLE/Metal, with the clamp a
         * no-op on the first and a full recovery on the second — and `composerSamples`
         * reads 4 on BOTH, so the difference is what the driver does with a varying at
         * a partially covered fragment, which GLSL leaves undefined outside the
         * primitive. A green gate here must never be read as "D67 is closed".
         */
        if (onDisk === 'unclamped') {
          console.log(`  WARN  but ${D67.file}:${D67.line} is still unclamped, so D67 is LATENT, not fixed.`);
          if (rasterMode() === 'swiftshader') {
            console.log(`        AND YOU ARE ON SWIFTSHADER, WHERE THIS DEFECT DOES NOT REPRODUCE AT ALL.`);
            console.log(`        The same shot measures 0.0104/0.0129 on hardware ANGLE/Metal. Re-run with`);
            console.log(`        NP_RASTER=hardware before concluding anything about this shot.`);
          } else {
            console.log(`        This pose simply does not produce a partially covered plume edge. Another will.`);
          }
        }
      } else if (onDisk === 'unclamped' && !firedClamped.length) {
        assertFailures++;
        console.log(`  FAIL  the frame is unusable and ONE LINE FIXES IT. D67 IS NOT LANDED.`);
        for (const f of fired) console.log(`        capture guard: ${f}`);
        console.log(`        With the clamp applied at runtime the same frame measures`);
        console.log(`        ${clamped.meanLuma.toFixed(4)}/${clamped.contrast.toFixed(4)}, clearing all three guards.`);
        console.log(`        THE PATCH, ${D67.file} line ${D67.line}:`);
        console.log(`          -  ${D67.from}`);
        console.log(`          +  ${D67.to}`);
        console.log(`        Not applied here: src/vfx/** is the VFX stream's file. Filed as a request.`);
      } else if (onDisk === 'unclamped') {
        assertFailures++;
        console.log(`  FAIL  the frame is unusable AND the clamp does not recover it.`);
        for (const f of fired) console.log(`        capture guard: ${f}`);
        console.log(`        THE D67 DIAGNOSIS NO LONGER EXPLAINS THIS FRAME. Re-run with --bisect`);
        console.log(`        before quoting any of D67's numbers; something else changed.`);
      } else {
        assertFailures++;
        console.log(`  FAIL  the frame is unusable and ${D67.file} IS ALREADY CLAMPED on disk.`);
        for (const f of fired) console.log(`        capture guard: ${f}`);
        console.log(`        So the fix landed and is INSUFFICIENT. Re-run with --bisect.`);
      }
      out.assert = { onDisk, head: baseline, clamped, guardsFired: fired, guardsFiredWithClamp: firedClamped };
    }

    // ------------------------------------------------------------------- bisect
    if (wantBisect) {
      const declared = await page.evaluate((src) => (new Function('return ' + src))()(), PROBES_SRC);
      const rows = [];
      console.log(`\nBISECT  ${declared.length} single-variable probes, each applied alone and reverted`);
      console.log(`  ${'probe'.padEnd(18)} ${'luma'.padStart(8)} ${'contrast'.padStart(9)} ${'max'.padStart(8)}  ${'dLuma'.padStart(9)}`);
      console.log(`  ${'(baseline)'.padEnd(18)} ${baseline.meanLuma.toFixed(4).padStart(8)} ${baseline.contrast.toFixed(4).padStart(9)} ${baseline.maxLuma.toFixed(4).padStart(8)}`);
      for (let i = 0; i < declared.length; i++) {
        await page.evaluate((idx) => window.__WD_PROBES[idx].apply(), i);
        await settle(page, 6);
        const m = await measure(page);
        await page.evaluate((idx) => window.__WD_PROBES[idx].revert(window.__WD_PROBES[idx].was), i);
        await settle(page, 6);
        const d = +(m.meanLuma - baseline.meanLuma).toFixed(4);
        rows.push({ probe: declared[i].id, ...m, dLuma: d });
        console.log(`  ${declared[i].id.padEnd(18)} ${m.meanLuma.toFixed(4).padStart(8)} ${m.contrast.toFixed(4).padStart(9)} ${m.maxLuma.toFixed(4).padStart(8)}  ${(d >= 0 ? '+' : '') + d.toFixed(4).padStart(8)}`);
      }
      // Residue check. If the sequence left the frame somewhere other than where it
      // started, every delta above is suspect and the tool says so instead of me.
      const after = await measure(page);
      const residue = +(after.meanLuma - baseline.meanLuma).toFixed(4);
      console.log(`  ${'(baseline again)'.padEnd(18)} ${after.meanLuma.toFixed(4).padStart(8)} ${after.contrast.toFixed(4).padStart(9)} ${after.maxLuma.toFixed(4).padStart(8)}  ${(residue >= 0 ? '+' : '') + residue.toFixed(4).padStart(8)}`
        + (Math.abs(residue) > 0.002 ? '   !! PROBES LEFT RESIDUE - deltas above are not single-variable' : '   (clean)'));
      out.bisect = { baseline, rows, baselineAfter: after, residue };
    }

    // Screenshot from inside the SAME run that produced the numbers above. Comparing a
    // diagnosis to a frame captured by a different process invites exactly the kind of
    // "the tool and the picture disagree" round this project keeps paying for.
    const outPng = `docs/review/widediag-${shotId}.png`;
    await page.screenshot({ path: outPng, type: 'png' });
    console.log(`\nwrote ${outPng}   (HEAD, unmodified)`);

    if (wantFix) {
      const applied = await page.evaluate(() => {
        const m = window.__NADIR.world.systems.vfx?.engines?.material;
        if (!m) return 'no plume material';
        if (!m.fragmentShader.includes('float t = vUv.y;')) return 'already clamped on disk';
        m.fragmentShader = m.fragmentShader.replace('float t = vUv.y;', 'float t = clamp(vUv.y, 0.0, 1.0);');
        m.needsUpdate = true;
        return 'patched';
      });
      await settle(page, 8);
      const m = await measure(page);
      const fixPng = `docs/review/widediag-${shotId}-clamped.png`;
      await page.screenshot({ path: fixPng, type: 'png' });
      out.withFix = { applied, frame: m };
      console.log(`wrote ${fixPng}   (${applied}: src/vfx/engines.js:76 clamp applied AT RUNTIME)`);
      console.log(`  luma=${m.meanLuma.toFixed(4)} contrast=${m.contrast.toFixed(4)} nearBlack=${m.nearBlackPct}%  [N=${m.samples} px]`);
      console.log(`  !! NOT A FRAME OF THIS COMMIT. HEAD renders ${baseline.meanLuma.toFixed(4)}/${baseline.contrast.toFixed(4)}.`);
      console.log(`  !! Do not file this where a capture.mjs frame goes, and do not quote it without this line.`);
      // Put the tree back, so the cull control below measures HEAD and not the patch.
      await page.evaluate(() => {
        const mm = window.__NADIR.world.systems.vfx?.engines?.material;
        if (mm) { mm.fragmentShader = mm.fragmentShader.replace('float t = clamp(vUv.y, 0.0, 1.0);', 'float t = vUv.y;'); mm.needsUpdate = true; }
      });
      await settle(page, 6);
    }

    // CONTROL: same frame with frustum culling switched off. If the hull appears only
    // here, the geometry is being culled at close range -- which means a bounding volume
    // that does not describe the mesh it belongs to, not a camera or a lighting fault.
    // Runs LAST because it permanently clears frustumCulled on every mesh.
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
    await settle(page, 3);
    const ctlPng = `docs/review/widediag-${shotId}-nocull.png`;
    await page.screenshot({ path: ctlPng, type: 'png' });
    out.cull = cull;
    console.log(`wrote ${ctlPng}   ${JSON.stringify(cull)}`);

    out.consoleErrors = (consoleErrors ?? []).filter((e) => e.startsWith('[error]')).slice(0, 20);
    out.pageErrors = (pageErrors ?? []).slice(0, 5);
    if (out.consoleErrors.length) console.log(`console errors: ${out.consoleErrors.length}`);
    if (out.pageErrors.length) console.log(`page errors:\n${out.pageErrors.join('\n')}`);

    summary.push({ id: shotId, ...out });
    await page.close();
  }

  if (wantJSON) console.log('\n' + JSON.stringify(summary.length === 1 ? summary[0] : summary, null, 2));

  if (wantAssert) {
    console.log(`\nASSERT SUMMARY  ${shotIds.length - assertFailures}/${shotIds.length} shot(s) render`
      + `   sample ${SAMPLE_W * SAMPLE_H} px per shot at 2560x1440, raster=${rasterMode()}`);
    if (assertFailures) process.exitCode = 1;
  }
} catch (err) {
  console.error('WIDEDIAG ERROR:', err);
  process.exit(1);
} finally {
  await browser?.close();
  await stopServer(server);
}
