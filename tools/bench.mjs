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
import { startServer, stopServer, launchBrowser, openGame, ROOT, rasterMode, fpsIsMeaningful, frameRateUncapped } from './harness.mjs';

/**
 * IS THIS RUN MEASURING THE FRAME, OR THE PANEL?
 *
 * Chromium drives requestAnimationFrame from the display's refresh source, so with the
 * cap on NOTHING here can report a frame faster than the refresh interval —
 * `harness.mjs`'s `UNCAP_ARGS` note records `tools/perfattrib.mjs` measuring FIVE
 * unrelated configurations at "8.33 ms" to the hundredth before anyone noticed.
 *
 * That floor reached THIS tool the moment the post-chain wave landed. The run that took
 * the benchmark from FAIL to PASS printed **8.3 ms / 120.0 fps mean, 8.3 ms median** with
 * the cap on, and **7.7 ms / 129.4 fps mean, 7.5 ms median** with `NP_UNCAP_FPS=1` — same
 * commit, same machine, minutes apart. 120.0 fps was the panel. A tool that disclaims
 * real numbers (the honesty note at the top of this file) and then asserts a fake one is
 * the same defect seen from the other side.
 *
 * THIS IS A FLAG, NOT A CLASSIFIER, AND THE FIRST VERSION OF IT WAS A CLASSIFIER THAT
 * DID NOT WORK. It tried `median <= min * 1.06`, on the theory that vsync piles the
 * samples onto one quantum. Checked against all eight runs on hand before shipping it,
 * and it fired on NONE of them, including the two that are unambiguously capped: `min`
 * is 0.5-1.8 ms in most runs, because a handful of samples come back near-instantly and
 * `min` is an outlier statistic. Against `GATE-capped` — median 8.30, genuinely pinned —
 * the test computed 8.30 <= 0.74 and said no.
 *
 * So it asserts only what is true by construction and needs no detection: WITH VSYNC ON,
 * A MEASURED FRAME TIME IS AN UPPER BOUND AND THE fps IS A LOWER BOUND, always, at every
 * frame rate. That downgrades a claim to a bound and can never produce a false failure,
 * which matters because this is a gate other streams run. When the bound is far from the
 * criterion (HEAD reads 71 fps against a 60 fps target on a 120 Hz panel) it costs the
 * reader nothing; when it is near the panel's own rate it is the only warning that the
 * number means nothing.
 *
 * A real classifier wants the quantisation test — what share of samples sit within a
 * tolerance of an integer multiple of a fitted quantum — plus a per-sample array this
 * tool does not currently keep. Filed rather than guessed at.
 */
function refreshCapped() {
  return fpsIsMeaningful() && !frameRateUncapped();
}

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

  // Whether a frame rate may be read off these numbers is a property of the RASTERISER,
  // not of the tool. The original version hard-coded the software-rasteriser disclaimer,
  // so a run on a real GPU printed real timings under a banner saying they were not real.
  const hardware = fpsIsMeaningful();
  const fpsMean = 1000 / result.frameMs.mean;
  const fpsLow = 1000 / result.frameMs.p99;   // p99 frame time is the 1% low

  if (hardware && refreshCapped()) {
    // The old banner said "these ARE frame rates" unconditionally, which is half true
    // under vsync and would have sat directly above the NOTE below contradicting it.
    console.log(`\nFRAME TIMINGS (real GPU, ${rasterMode()} rasterisation — real, but vsync-BOUNDED; see the note)`);
  } else if (hardware) {
    console.log(`\nFRAME TIMINGS (real GPU, ${rasterMode()} rasterisation, refresh cap off — these ARE frame rates)`);
  } else {
    console.log('\nSOFTWARE-RASTERISER TIMINGS (NOT a frame rate on target hardware)');
  }
  console.log(`  mean frame     ${result.frameMs.mean.toFixed(1)} ms${hardware ? `   ${fpsMean.toFixed(1)} fps` : ''}`);
  console.log(`  median frame   ${result.frameMs.median.toFixed(1)} ms${hardware ? `   ${(1000 / result.frameMs.median).toFixed(1)} fps` : ''}`);
  console.log(`  p95 frame      ${result.frameMs.p95.toFixed(1)} ms${hardware ? `   ${(1000 / result.frameMs.p95).toFixed(1)} fps` : ''}`);
  console.log(`  p99 frame      ${result.frameMs.p99.toFixed(1)} ms${hardware ? `   ${fpsLow.toFixed(1)} fps  (1% low)` : ''}`);
  console.log(`  sim step cost  ${result.stepMs?.toFixed?.(2) ?? '?'} ms  <- this one IS meaningful, it is CPU only`);

  const capped = refreshCapped();

  if (hardware) {
    const meanOk = fpsMean >= 60;
    const lowOk = fpsLow >= 50;
    console.log(`\n  ${meanOk ? 'PASS' : 'FAIL'}  60 fps @ ${width}x${height}        measured ${fpsMean.toFixed(1)} fps mean`);
    console.log(`  ${lowOk ? 'PASS' : 'FAIL'}  1% lows above 50 fps        measured ${fpsLow.toFixed(1)} fps at p99`);
    if (!meanOk || !lowOk) failed = true;
    if (capped) {
      // Not a failure, and it cannot become one: vsync only makes a frame look SLOWER,
      // so both criteria above are still honestly passed. It downgrades the FIGURE from
      // a measurement to a bound. See `refreshCapped`.
      console.log('');
      console.log(`  NOTE  vsync is on, so ${fpsMean.toFixed(1)} fps is a LOWER BOUND, not the frame rate.`);
      console.log('        No rAF-timed tool can read a frame faster than the display refreshes.');
      console.log('        If this figure is anywhere near the panel\'s own rate it is the PANEL.');
      console.log('        Re-run with NP_UNCAP_FPS=1 for the real cost, and quote that number.');
    }
  } else {
    console.log('\n  These are SwiftShader numbers. This environment has no GPU.');
    console.log('  The 60 fps @ 1440p / 1% low > 50 target was NOT measured here and is NOT claimed.');
    console.log('  Run this on the target machine with a real GPU to validate that criterion.');
  }

  const errs = [...pageErrors, ...consoleErrors.filter((e) => e.startsWith('[error]'))];
  if (errs.length) {
    failed = true;
    console.error('\nCONSOLE ERRORS DURING BENCHMARK');
    for (const e of errs.slice(0, 15)) console.error('  ' + e.split('\n')[0]);
  }

  const payload = {
    scene, width, height, frames, quality,
    measuredAt: fpsIsMeaningful()
      ? `hardware rasterisation (${rasterMode()}) on ${process.platform}`
      : 'software-rasteriser (SwiftShader), no GPU present',
    budgets: { drawCalls: BUDGET.drawCalls, triangles: BUDGET.triangles, programs: BUDGET.programs },
    peak: result.peak,
    counters: b,
    frameMs: result.frameMs,
    sceneCounts: result.sceneCounts,
    fpsClaim: fpsIsMeaningful()
      ? { mean: 1000 / result.frameMs.mean, low1pct: 1000 / result.frameMs.p99, refreshCapped: capped }
      : null,
    fpsNote: !fpsIsMeaningful()
      ? 'Frame rate not measurable in this environment. No fps figure is asserted.'
      : capped
        ? 'Measured on hardware rasterisation with vsync ON, so these are a LOWER BOUND on the frame rate at the stated resolution, not the frame rate. A figure near the display refresh rate is the display. Re-run with NP_UNCAP_FPS=1 for the unbounded cost.'
        : 'Measured on hardware rasterisation with the refresh cap removed (NP_UNCAP_FPS=1). These are real frame rates at the stated resolution.',
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
