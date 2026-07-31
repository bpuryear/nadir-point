/**
 * Single-variable frame-time attribution on the committed benchmark scene.
 *
 *   NP_RASTER=hardware node tools/perfattrib.mjs
 *   NP_RASTER=hardware node tools/perfattrib.mjs --only post: --frames 240
 *   NP_RASTER=hardware node tools/perfattrib.mjs --quality medium
 *
 * A draw-call count tells you how many times the driver was asked to draw. It tells
 * you NOTHING about a full-screen procedural shader, a 4x multisampled half-float
 * target, or a shadow map — three things that in this project cost more than the
 * geometry does. This tool measures the only currency that matters: milliseconds,
 * one variable at a time, in one page, against a baseline measured immediately
 * before and immediately after the sweep.
 *
 * METHOD, and why each part of it is there:
 *
 *   ONE PAGE, MANY PROBES. Rebooting per probe would re-seed the RNG, re-JIT, and
 *   re-warm the GPU, and the difference between two boots is larger than several of
 *   the effects being measured. Every probe mutates the live scene and reverts it.
 *
 *   BASELINE TWICE. Frame time on a laptop drifts with thermals over a multi-minute
 *   sweep. The first and last rows are the SAME configuration; the gap between them
 *   is the drift, and it is printed. Any probe whose delta is smaller than the drift
 *   is reported as unresolved rather than as a result.
 *
 *   SETTLE BEFORE SAMPLING. The render loop is rAF-driven and three.js compiles
 *   programs lazily, so the first frames after a mutation are not representative.
 *   Every probe settles `--settle` frames (default 30) before the first sample.
 *
 *   REVERT AND PROVE IT. Every probe restores what it changed. The closing baseline
 *   is what proves the reverts worked: if it does not land on the opening baseline,
 *   some probe leaked and the whole sweep is void.
 *
 * NEVER RUN THIS UNDER SWIFTSHADER. A software rasteriser's cost model is not the
 * GPU's; it would rank fill-rate effects far too cheaply relative to draw calls.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, ROOT, rasterMode, fpsIsMeaningful, frameRateUncapped } from './harness.mjs';

/*
 * This tool measures milliseconds and advances no game progress by frame count, so it is
 * the one place the refresh-rate cap should always be off. See `harness.mjs#UNCAP_ARGS`:
 * with the cap on, five different configurations here reported "8.33 ms" — 1/120 s — and
 * the cap, not the GPU, was the thing being measured.
 */
if (!frameRateUncapped()) process.env.NP_UNCAP_FPS = '1';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const frames = Number(arg('frames', 240));
const settle = Number(arg('settle', 30));
const width = Number(arg('width', 2560));
const height = Number(arg('height', 1440));
const scene = arg('scene', 'benchmark');
const quality = arg('quality', 'high');
const only = arg('only', null);       // comma-separated substrings of probe ids
const repeats = Number(arg('repeats', 1));
const outJson = arg('out', null);
const port = Number(process.env.PORT || 5192);

/**
 * `--page game` boots index.html instead of the probe, which is the ONLY way to see
 * what the player's frame costs. The benchmark probe is not the game: `src/probes/
 * benchmark.js` never imports `world/factionWar.js` or `world/travel.js`, so the
 * seeded hulks, the strays and the arrival fit are absent from every number
 * `npm run bench` has ever printed.
 */
const pageKind = arg('page', 'probe');
const poi = arg('poi', null);

if (!fpsIsMeaningful()) {
  console.error(`[perfattrib] raster mode is "${rasterMode()}". Milliseconds measured under a`);
  console.error('[perfattrib] software rasteriser attribute cost to the CPU, not to the GPU this');
  console.error('[perfattrib] game runs on. Re-run with NP_RASTER=hardware.');
  process.exit(2);
}

/**
 * The probe table, built in the page.
 *
 * Each probe is `{ id, note, apply, revert }`. `apply` must be idempotent and
 * `revert` must restore exactly. Probes that cannot be built (a system that is not
 * installed in this scene) are simply absent, which is why the printed table is the
 * authority on what was actually measured rather than this list.
 */
const PROBES_SRC = `() => {
  const N = window.__NADIR;
  const THREE = N.THREE;
  const w = N.world;
  const r = N.renderer;            // the Renderer wrapper
  const gl = r.renderer;           // THREE.WebGLRenderer
  const post = r.post;
  const list = [];

  const byName = (root, name) => { let hit = null; root.traverse((o) => { if (!hit && o.name === name) hit = o; }); return hit; };

  const vis = (obj, id, note) => {
    if (!obj) return;
    list.push({ id, note, apply: () => { obj.visible = false; }, revert: () => { obj.visible = true; } });
  };
  const pass = (p, id, note) => {
    if (!p) return;
    list.push({ id, note, apply: () => { p.enabled = false; }, revert: () => { p.enabled = true; } });
  };

  // ---- post chain, one pass at a time -------------------------------------
  pass(post?.gtao,    'post:gtao=off',    'GTAO: a depth-normal prepass that redraws the whole gameplay scene');
  pass(post?.godrays, 'post:godrays=off', 'radial blur, ' + (post?.godrays?.uniforms?.samples?.value ?? '?') + ' taps over the full frame');
  pass(post?.bloom,   'post:bloom=off',   'UnrealBloom mip chain at bloomRes ' + (post?.preset?.bloomRes ?? '?'));
  pass(post?.smaa,    'post:smaa=off',    'SMAA, three full-screen passes');
  pass(post?.grade,   'post:grade=off',   'grade: aberration + grain + dither, one full-screen pass');

  // ---- MSAA on the HDR composer target ------------------------------------
  // The sample count is baked into the framebuffer, so it only changes on a dispose.
  const composer = post?.composer;
  if (composer?.renderTarget1) {
    const rt1 = composer.renderTarget1, rt2 = composer.renderTarget2;
    const was = rt1.samples;
    for (const s of [0, 2]) {
      list.push({
        id: 'msaa:samples=' + s,
        note: 'composer HDR target is HalfFloat ' + rt1.width + 'x' + rt1.height + ', shipped samples=' + was,
        apply: () => { rt1.samples = s; rt2.samples = s; rt1.dispose(); rt2.dispose(); },
        revert: () => { rt1.samples = was; rt2.samples = was; rt1.dispose(); rt2.dispose(); },
      });
    }
  }

  // ---- shadow map: a second rasterisation of every caster ------------------
  if (gl.shadowMap.enabled) {
    list.push({
      id: 'shadow:map=off',
      note: 'one directional key, shadow map ' + (() => { let s = '?'; w.scene.traverse((o) => { if (o.isLight && o.castShadow) s = o.shadow.mapSize.x + 'x' + o.shadow.mapSize.y; }); return s; })(),
      apply: () => {
        gl.shadowMap.enabled = false;
        w.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; for (const x of m) x.needsUpdate = true; } });
      },
      revert: () => {
        gl.shadowMap.enabled = true;
        w.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; for (const x of m) x.needsUpdate = true; } });
      },
    });
  }

  // ---- the far scene: dome, starfield, dust, giant -------------------------
  // The dome is the one to watch. It is a full-screen procedural evaluation, so its
  // cost is invisible in a draw-call count: it is ONE call covering 100% of the frame.
  const dome = byName(r.far, 'sky-dome');
  if (dome && dome.isMesh) {
    const orig = dome.material;
    const flat = new THREE.MeshBasicMaterial({ color: 0x0a1016, side: orig.side, depthWrite: false, depthTest: false, fog: false });
    list.push({
      id: 'far:dome-flat',
      note: 'sky dome drawn with a CONSTANT COLOUR instead of the procedural field. Same one draw call, same fill, zero noise taps — this isolates the shader from the geometry.',
      apply: () => { dome.material = flat; },
      revert: () => { dome.material = orig; },
    });
    vis(dome, 'far:dome-hidden', 'the dome not drawn at all');
  }
  vis(byName(r.far, 'starfield'), 'far:starfield-hidden', 'star points');
  vis(byName(r.far, 'dust-lanes'), 'far:dust-hidden', 'dust lane quads');
  vis(byName(r.far, 'gas-giant'), 'far:giant-hidden', 'gas giant body, halo and rings');
  if (r.far.children.length) {
    const kids = r.far.children.slice();
    list.push({
      id: 'far:ALL-hidden', note: 'the entire celestial backdrop',
      apply: () => { for (const k of kids) k.visible = false; },
      revert: () => { for (const k of kids) k.visible = true; },
    });
  }

  // ---- VFX ----------------------------------------------------------------
  const vfx = w.systems?.vfx;
  if (vfx) {
    vis(vfx.root, 'vfx:ALL-hidden', 'every VFX system');
    vis(vfx.engines?.mesh, 'vfx:plumes', 'engine plumes');
    vis(vfx.weapons?.group, 'vfx:weapons', 'tracers, beams, muzzle flashes');
    vis(vfx.particles?.mesh, 'vfx:particles', 'the particle pool');
    vis(vfx.rings?.mesh, 'vfx:rings', 'shockwave rings');
    vis(vfx.shields?.mesh, 'vfx:shields', 'shield impacts');
    vis(vfx.explosions?.group, 'vfx:explosions', 'explosion group');
    vis(vfx.damage?.group, 'vfx:damage', 'damage venting and spatter');
  }

  // ---- gameplay scene content ---------------------------------------------
  const fields = w.systems?.fields ?? null;
  vis(byName(w.scene, 'asteroid-field'), 'fields:asteroids', 'instanced asteroids');
  vis(byName(w.scene, 'debris-field'), 'fields:debris', 'instanced debris and plumes');

  if (w.ships && w.ships.length) {
    const others = [...w.ships].filter((s) => !s.isPlayer).map((s) => s.root).filter(Boolean);
    if (others.length) {
      list.push({
        id: 'ships:hostiles-hidden', note: others.length + ' non-player ships',
        apply: () => { for (const o of others) o.visible = false; },
        revert: () => { for (const o of others) o.visible = true; },
      });
    }
    const p = w.player?.root;
    if (p) vis(p, 'ships:player-hidden', 'the fitted player cruiser');
  }

  // ---- resolution: the test that separates fill-bound from draw-bound ------
  // If halving linear resolution (quartering pixels) recovers most of the frame, the
  // frame is fill-bound and no amount of draw-call merging will fix it.
  const w0 = window.innerWidth, h0 = window.innerHeight;
  for (const s of [0.75, 0.5]) {
    list.push({
      id: 'res:scale=' + s,
      note: 'render target ' + Math.round(w0 * s) + 'x' + Math.round(h0 * s) + ' (' + Math.round(s * s * 100) + '% of the pixels), everything else identical',
      apply: () => { r.setSize(Math.round(w0 * s), Math.round(h0 * s)); },
      revert: () => { r.setSize(w0, h0); },
    });
  }

  // ---- GTAO at half resolution -------------------------------------------
  // GTAO is the pass that redraws the scene, but its OTHER cost is the AO
  // resolve at full resolution. Halving the AO target keeps the prepass and
  // separates the two costs.
  if (post?.gtao) {
    const g = post.gtao;
    const w1 = post._w * post._pr, h1 = post._h * post._pr;
    list.push({
      id: 'gtao:half-res',
      note: 'GTAO target at ' + Math.round(w1 / 2) + 'x' + Math.round(h1 / 2) + ' instead of ' + Math.round(w1) + 'x' + Math.round(h1) + '; the depth-normal prepass still runs',
      apply: () => { g.setSize(Math.round(w1 / 2), Math.round(h1 / 2)); },
      revert: () => { g.setSize(Math.round(w1), Math.round(h1)); },
    });
  }

  /*
   * COMBINATIONS.
   *
   * Single-variable deltas do not add up, and on a fill-bound frame they can be
   * badly non-additive: two passes that each cost 5 ms alone may cost 8 ms together
   * because one of them is bandwidth-bound and they were queueing on the same
   * resource. A ranked list of fixes that was never measured TOGETHER is a
   * prediction, not a measurement. These rows are the measurement.
   */
  const combo = (id, note, parts) => {
    const chosen = parts.map((pid) => list.find((x) => x.id === pid)).filter(Boolean);
    if (chosen.length !== parts.length) return;
    list.push({
      id, note: note + '  [' + parts.join(' + ') + ']',
      apply: () => { for (const c of chosen) c.apply(); },
      revert: () => { for (const c of chosen.slice().reverse()) c.revert(); },
    });
  };
  combo('combo:msaa2+nosmaa', 'MSAA 4->2 and SMAA dropped', ['msaa:samples=2', 'post:smaa=off']);
  combo('combo:msaa2+nosmaa+domeflat', 'the two above plus a baked (constant) dome', ['msaa:samples=2', 'post:smaa=off', 'far:dome-flat']);
  combo('combo:all-post-fill', 'MSAA 4->2, SMAA off, dome baked, GTAO at half res', ['msaa:samples=2', 'post:smaa=off', 'far:dome-flat', 'gtao:half-res']);

  window.__PA_PROBES = list;
  return list.map((p) => ({ id: p.id, note: p.note ?? '' }));
}`;

/** Sample n frames of wall-clock frame interval plus the peak renderer counters. */
const SAMPLE_SRC = `(n, settleN) => new Promise((resolve) => {
  const N = window.__NADIR;
  let i = 0;
  const warm = () => {
    if (++i >= settleN) { i = 0; go(); return; }
    requestAnimationFrame(warm);
  };
  let last = 0;
  const samples = [];
  const peak = { calls: 0, triangles: 0, programs: 0 };
  const go = () => {
    last = performance.now();
    const step = () => {
      const now = performance.now();
      samples.push(now - last);
      last = now;
      const s = N.stats();
      if (s.calls > peak.calls) peak.calls = s.calls;
      if (s.triangles > peak.triangles) peak.triangles = s.triangles;
      if (s.programs > peak.programs) peak.programs = s.programs;
      if (++i >= n) {
        samples.sort((a, b) => a - b);
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const at = (p) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
        resolve({ mean, median: at(0.5), p95: at(0.95), p99: at(0.99), peak });
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  requestAnimationFrame(warm);
})`;

let server, browser, bad = false;
try {
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();
  const isGame = pageKind === 'game';
  const url = server.url + (isGame ? '' : 'probe.html');
  const query = isGame
    ? `quality=${quality}&capture=1${poi ? `&poi=${poi}` : ''}`
    : `p=${scene}&quality=${quality}`;
  const { page, booted, bootError } = await openGame(
    browser, url, { width, height, query, settleFrames: 150, timeout: 180000 },
  );
  if (!booted) { console.error(`scene "${scene}" failed to boot:\n${bootError}`); process.exit(1); }

  const declared = await page.evaluate((src) => (new Function('return ' + src))()(), PROBES_SRC);
  const sample = (n = frames, s = settle) => page.evaluate(
    ([src, a, b]) => (new Function('return ' + src))()(a, b), [SAMPLE_SRC, n, s],
  );

  console.log(`\nPERF ATTRIBUTION  page=${pageKind}${isGame ? '' : ` scene="${scene}"`}  ${width}x${height}  quality=${quality}  raster=${rasterMode()}`);
  console.log(`${frames} sampled frames per row, ${settle} settle frames before each`);

  // The scene census. Printed on every run because the single most misleading thing
  // about a draw-call table is not knowing what was in the scene that produced it.
  const census = await page.evaluate(() => {
    const N = window.__NADIR, w = N.world;
    let meshes = 0, instanced = 0, instances = 0, casters = 0, farMeshes = 0;
    w.scene.traverse((o) => {
      if (o.isInstancedMesh) { instanced++; instances += o.count; }
      else if (o.isMesh) meshes++;
      if (o.isMesh && o.castShadow) casters++;
    });
    N.renderer.far.traverse((o) => { if (o.isMesh || o.isPoints) farMeshes++; });
    return {
      systems: Object.keys(w.systems ?? {}).join(', '),
      ships: w.ships?.length ?? 0,
      wrecks: w.wrecks?.length ?? 0,
      meshes, instanced, instances, shadowCasters: casters, farObjects: farMeshes,
      pixelRatio: N.renderer.renderer.getPixelRatio(),
      drawingBuffer: N.renderer.renderer.getContext().drawingBufferWidth + 'x' + N.renderer.renderer.getContext().drawingBufferHeight,
      composerSamples: N.renderer.post?.composer?.renderTarget1?.samples ?? null,
      quality: N.renderer.post?.quality,
      presetMsaa: N.renderer.post?.preset?.msaa ?? null,
      presetRenderScale: N.renderer.post?.preset?.renderScale ?? null,
    };
  });
  console.log('\nSCENE CENSUS');
  for (const [k, v] of Object.entries(census)) console.log(`  ${k.padEnd(20)} ${v}`);

  /*
   * THE DRAW-CALL LEDGER.
   *
   * `npm run bench` prints ONE number for the whole frame, and every argument about
   * the 320 ceiling has been conducted against that one number. It is the wrong
   * granularity: a draw call issued by the GTAO prepass and a draw call issued by a
   * newly bolted-on greeble are the same integer and completely different problems.
   *
   * This wraps each composer pass's `render` and reads `renderer.info.render.calls`
   * either side of it, so the frame's 500-odd calls are attributed to the pass that
   * issued them. Shadow-map draws land inside whichever RenderPass triggered them,
   * which is exactly where they belong.
   */
  const ledger = await page.evaluate(() => new Promise((resolve) => {
    const N = window.__NADIR;
    const gl = N.renderer.renderer;
    const post = N.renderer.post;
    const passes = post.composer.passes;
    // Identity, not `constructor.name`: the production bundle is minified, so class
    // names come back as `Sl` and `e` and the ledger is unreadable.
    const known = new Map([
      [post.farPass, 'farPass (celestials)'], [post.mainPass, 'mainPass (gameplay+shadow)'],
      [post.gtao, 'gtao'], [post.godrays, 'godrays'], [post.bloom, 'bloom'],
      [post.output, 'output (ACES)'], [post.grade, 'grade'], [post.smaa, 'smaa'],
    ]);
    const names = passes.map((p, i) => known.get(p) ?? `pass[${i}]`);
    const originals = passes.map((p) => p.render.bind(p));
    // Per-FRAME totals, then keep the single busiest frame. Summing per-pass maxima
    // taken on different frames would produce a total no frame ever issued.
    let best = null;
    let cur = null;
    passes.forEach((p, i) => {
      p.render = (...a) => {
        const c0 = gl.info.render.calls, t0 = gl.info.render.triangles;
        originals[i](...a);
        cur.calls[i] = gl.info.render.calls - c0;
        cur.tris[i] = gl.info.render.triangles - t0;
      };
    });
    let n = 0;
    const step = () => {
      if (cur) {
        cur.total = cur.calls.reduce((a, b) => a + b, 0);
        if (!best || cur.total > best.total) best = cur;
      }
      if (++n >= 90) {
        passes.forEach((p, i) => { p.render = originals[i]; });
        resolve({ names, enabled: passes.map((p) => p.enabled), ...best });
        return;
      }
      cur = { calls: passes.map(() => 0), tris: passes.map(() => 0), total: 0 };
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
  console.log('\nDRAW-CALL LEDGER (the busiest single frame of 90, attributed to the pass that issued them)');
  ledger.names.forEach((nm, i) => {
    console.log(`  ${nm.padEnd(28)} ${ledger.enabled[i] ? 'on ' : 'OFF'}  calls ${String(ledger.calls[i]).padStart(4)}   triangles ${String(ledger.tris[i]).padStart(8)}`);
  });
  console.log(`  ${'TOTAL'.padEnd(28)}       calls ${String(ledger.total).padStart(4)}`);
  console.log('');

  /*
   * A-B-A. The first version of this sweep measured one baseline at the top and
   * subtracted it from every row, and the result was arithmetically impossible:
   * hiding the player's cruiser and all twelve hostiles each made the frame ~4 ms
   * SLOWER. Drawing less cannot cost more, so the difference was the rig, not the
   * scene — the GPU's clock state, which moves over a nine-minute sweep and does not
   * move monotonically, so an open-and-close baseline pair can agree while everything
   * between them is off.
   *
   * Every probe now sits BETWEEN two baseline measurements and is scored against
   * their mean. `noise` is the spread of the baseline series itself, and it is what
   * decides whether a row is a result or a shrug.
   */
  const wants = only ? only.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const wanted = declared.filter((p) => !wants || wants.some((w) => p.id.includes(w)));
  const bases = [await sample()];
  const acc = new Map();
  for (let rep = 0; rep < repeats; rep++) {
    if (repeats > 1) console.log(`  --- pass ${rep + 1} of ${repeats} ---`);
    for (const p of wanted) {
      await page.evaluate((id) => window.__PA_PROBES.find((x) => x.id === id).apply(), p.id);
      const m = await sample();
      await page.evaluate((id) => window.__PA_PROBES.find((x) => x.id === id).revert(), p.id);
      const after = await sample();
      bases.push(after);
      const local = (bases[bases.length - 2].mean + after.mean) / 2;
      const d = m.mean - local;
      if (!acc.has(p.id)) acc.set(p.id, { ...p, deltas: [], means: [], calls: m.peak.calls });
      const a = acc.get(p.id);
      a.deltas.push(d); a.means.push(m.mean); a.calls = Math.max(a.calls, m.peak.calls);
      console.log(
        `  ${p.id.padEnd(24)} mean ${m.mean.toFixed(2).padStart(6)} ms  vs local base ${local.toFixed(2)}  `
        + `${(d >= 0 ? '+' : '')}${d.toFixed(2).padStart(6)} ms  calls ${String(m.peak.calls).padStart(4)}`,
      );
    }
  }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  const rows = [...acc.values()].map((a) => ({
    ...a,
    mean: med(a.means),
    delta: med(a.deltas),
    spread: Math.max(...a.deltas) - Math.min(...a.deltas),
    peak: { calls: a.calls },
    baseline: med(a.means) - med(a.deltas),
  }));

  const bmeans = bases.map((b) => b.mean);
  const bmin = Math.min(...bmeans), bmax = Math.max(...bmeans);
  const bmean = bmeans.reduce((a, b) => a + b, 0) / bmeans.length;
  const noise = bmax - bmin;
  console.log(`\nBASELINE SERIES  ${bases.length} measurements   mean ${bmean.toFixed(2)} ms   `
    + `min ${bmin.toFixed(2)}   max ${bmax.toFixed(2)}   spread ${noise.toFixed(2)} ms`);
  console.log('The spread is this rig\'s noise floor. Any row inside it is not a result.');

  console.log(`\n| variable removed | mean ms | local baseline | delta ms | run spread | ms recovered | draw calls | what it is |`);
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  const floor = repeats > 1 ? 0 : noise / 2;
  for (const r of [...rows].sort((a, b) => a.delta - b.delta)) {
    const resolved = Math.abs(r.delta) > Math.max(floor, r.spread / 2);
    console.log(`| \`${r.id}\` | ${r.mean.toFixed(2)} | ${r.baseline.toFixed(2)} | ${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(2)} | ${r.spread.toFixed(2)} | ${resolved ? (-r.delta).toFixed(2) : 'in the noise'} | ${r.peak.calls} | ${r.note} |`);
  }
  const base0 = bases[0], base1 = bases[bases.length - 1], drift = Math.abs(base1.mean - base0.mean);

  if (outJson) {
    const p = path.resolve(ROOT, outJson);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify({
      page: pageKind, scene, width, height, quality, frames, settle, raster: rasterMode(),
      census, ledger, baselines: bmeans, noise, baselineOpen: base0, baselineClose: base1, drift, rows,
    }, null, 2));
    console.log(`\nwrote ${outJson}`);
  }
} catch (err) {
  bad = true;
  console.error('PERFATTRIB HARNESS ERROR:', err);
} finally {
  await browser?.close();
  await stopServer(server);
}
process.exit(bad ? 1 : 0);
