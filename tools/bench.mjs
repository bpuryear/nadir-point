/**
 * Benchmark and budget enforcement.
 *
 * Loads the committed benchmark scene (probe "benchmark": 200+ debris objects,
 * 12 combat ships, 1 capital ship, full post chain), samples frame times, and
 * checks the draw-call and triangle budgets from src/core/units.js#BUDGET.
 *
 *   npm run bench
 *   npm run bench -- --frames 600 --width 2560 --height 1440
 *
 * HONESTY NOTE, read before quoting any number this prints:
 * the review environment has no GPU. Chromium runs ANGLE over SwiftShader, a
 * software rasteriser. Draw calls, triangle counts, program counts, geometry and
 * texture counts and CPU-side frame cost are hardware independent and are real
 * measurements. FRAME RATE IS NOT. This tool refuses to report a pass/fail on the
 * 60 fps target and says so, rather than printing a number that would be quoted
 * back as if it meant something.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, ROOT } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const frames = Number(arg('frames', 420));
const width = Number(arg('width', 2560));
const height = Number(arg('height', 1440));
const scene = arg('scene', 'benchmark');
const quality = arg('quality', 'high');
const outJson = arg('json', 'docs/review/benchmark.json');
const port = Number(process.env.PORT || 5188);

const { BUDGET } = await import('../src/core/units.js');

let server, browser, failed = false;
try {
  // Preview mode, matching capture.mjs and probe.mjs.
  //
  // The benchmark needs ~10 minutes of software-rasterised settle and frames. The dev
  // server's HMR full-reloads the page whenever anything writes to the source tree, so
  // any stream iterating on code during that window destroys the execution context
  // mid-run, and the harness reports it as "Execution context was destroyed", which
  // looks exactly like a benchmark crash. Three separate re-measure attempts were lost
  // to this. Serving a built bundle is immune.
  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();
  const { page, consoleErrors, pageErrors, booted, bootError } = await openGame(
    browser, server.url + 'probe.html',
    { width, height, query: `p=${scene}&quality=${quality}`, settleFrames: 120, timeout: 180000 },
  );

  if (!booted) {
    console.error(`benchmark scene "${scene}" failed to boot:\n${bootError}`);
    process.exit(1);
  }

  // Sample per-frame CPU cost and renderer counters.
  const result = await page.evaluate(async (n) => {
    const N = window.__NADIR;
    const samples = [];
    const peak = { calls: 0, triangles: 0, programs: 0 };
    let last = performance.now();

    await new Promise((resolve) => {
      let i = 0;
      const step = () => {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        const s = N.stats();
        peak.calls = Math.max(peak.calls, s.calls);
        peak.triangles = Math.max(peak.triangles, s.triangles);
        peak.programs = Math.max(peak.programs, s.programs);
        if (++i >= n) resolve(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    const s = N.stats();
    samples.sort((a, b) => a - b);
    const pct = (p) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

    return {
      final: s,
      peak,
      frameMs: { mean, median: pct(0.5), p95: pct(0.95), p99: pct(0.99), min: samples[0], max: samples[samples.length - 1] },
      cpuMs: s.cpuMs,
      stepMs: s.stepMs,
      sceneCounts: window.__NADIR_BENCH_COUNTS ?? (N.benchmarkCounts ? N.benchmarkCounts() : null),
    };
  }, frames);

  const b = result.final;
  const lines = [];
  const check = (label, value, ceiling, unit = '') => {
    const ok = value <= ceiling;
    if (!ok) failed = true;
    lines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(22)} ${String(value).padStart(10)}${unit}  ceiling ${ceiling}${unit}`);
    return ok;
  };

  console.log(`\nBENCHMARK  scene="${scene}"  ${width}x${height}  ${frames} frames  quality=${quality}\n`);
  if (result.sceneCounts) {
    console.log('SCENE CONTENTS');
    for (const [k, v] of Object.entries(result.sceneCounts)) console.log(`  ${k.padEnd(24)} ${v}`);
    console.log('');
  }

  console.log('HARDWARE-INDEPENDENT BUDGETS (real measurements)');
  check('draw calls (peak)', result.peak.calls, BUDGET.drawCalls);
  check('triangles (peak)', result.peak.triangles, BUDGET.triangles);
  check('shader programs', result.peak.programs, BUDGET.programs);
  lines.push(`  ----  ${'geometries'.padEnd(22)} ${String(b.geometries).padStart(10)}`);
  lines.push(`  ----  ${'textures'.padEnd(22)} ${String(b.textures).padStart(10)}`);
  console.log(lines.join('\n'));

  console.log('\nSOFTWARE-RASTERISER TIMINGS (NOT a frame rate on target hardware)');
  console.log(`  mean frame     ${result.frameMs.mean.toFixed(1)} ms`);
  console.log(`  median frame   ${result.frameMs.median.toFixed(1)} ms`);
  console.log(`  p95 frame      ${result.frameMs.p95.toFixed(1)} ms`);
  console.log(`  p99 frame      ${result.frameMs.p99.toFixed(1)} ms`);
  console.log(`  sim step cost  ${result.stepMs?.toFixed?.(2) ?? '?'} ms  <- this one IS meaningful, it is CPU only`);
  console.log('\n  These are SwiftShader numbers. This environment has no GPU.');
  console.log('  The 60 fps @ 1440p / 1% low > 50 target was NOT measured here and is NOT claimed.');
  console.log('  Run this on the target machine with a real GPU to validate that criterion.');

  const errs = [...pageErrors, ...consoleErrors.filter((e) => e.startsWith('[error]'))];
  if (errs.length) {
    failed = true;
    console.error('\nCONSOLE ERRORS DURING BENCHMARK');
    for (const e of errs.slice(0, 15)) console.error('  ' + e.split('\n')[0]);
  }

  const payload = {
    scene, width, height, frames, quality,
    measuredAt: 'software-rasteriser (SwiftShader), no GPU present',
    budgets: { drawCalls: BUDGET.drawCalls, triangles: BUDGET.triangles, programs: BUDGET.programs },
    peak: result.peak,
    counters: b,
    frameMs: result.frameMs,
    sceneCounts: result.sceneCounts,
    fpsClaim: null,
    fpsNote: 'Frame rate not measurable in this environment. No fps figure is asserted.',
    pass: !failed,
  };
  await fs.mkdir(path.dirname(path.resolve(ROOT, outJson)), { recursive: true });
  await fs.writeFile(path.resolve(ROOT, outJson), JSON.stringify(payload, null, 2));
  console.log(`\nwrote ${outJson}`);
  console.log(failed ? '\nBUDGET: FAIL\n' : '\nBUDGET: PASS\n');
} catch (err) {
  failed = true;
  console.error('BENCH HARNESS ERROR:', err);
} finally {
  await browser?.close();
  await stopServer(server);
}

process.exit(failed ? 1 : 0);
