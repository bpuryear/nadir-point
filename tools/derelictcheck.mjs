/**
 * THE GRAVEYARD HAS AN APPEARANCE GATE NOW.
 *
 *   node tools/derelictcheck.mjs                  # gate. exit 1 on any failure
 *   node tools/derelictcheck.mjs --repeat 3       # re-measure 3x, print the run-to-run spread
 *   node tools/derelictcheck.mjs --json out.json  # every column of every run, as JSON
 *   node tools/derelictcheck.mjs --width 1600 --height 900   # NOT CALIBRATED, see below
 *
 * There is no quiet mode. Every column it computes is printed on every run, gated or
 * not, because the columns it declines to gate are as much of the finding as the ones
 * it does.
 *
 * WHY IT EXISTS. `4e646df` blew out every drifting debris fragment on the graveyard --
 * soft bloom halos, the facet read and the shadow terminator washed to flat white --
 * and FOURTEEN OF FOURTEEN GATES PASSED WITH IT IN PLACE. The owner saw it before any
 * tool did. It was reverted as `bca5d10`, whose message carries the full measurement.
 * The graveyard is where the entire salvage loop happens and it was the one place in
 * the game with no appearance gate at all.
 *
 * WHY A MEAN-BRIGHTNESS GATE WOULD HAVE PASSED IT, so nobody builds that one instead.
 * The palette moved DARKER in that commit -- `derelictHull` base 0x836b3c -> 0x6b5831,
 * an exact 0.82 sRGB hold of chromaticity. Mean luma over the whole frame is a number
 * that a regression like this can move in EITHER direction, and here it moved the
 * comfortable way. Three separate things changed that are not mean brightness:
 *
 *   1. BLOOM SPILL INTO EMPTY SPACE. Pixels that were deep void before rose +1040 % at
 *      10-20 px from a bright source and decayed monotonically to +207 % at 160 px+.
 *      Monotonic decay with distance from a bright source is the signature of bloom,
 *      and only of bloom: re-lighting geometry cannot raise empty space 160 px away.
 *   2. THE SUBJECT MASK BALLOONING. `surface.mjs --frame scene`: mask 16.2 % -> 37.6 %,
 *      calm 52.9 -> 77.0, subject tiles 955 -> 2254.
 *   3. LOSS OF THE FACET READ. Crisp, countable facets and a shadow terminator became
 *      flat white.
 *
 * HOW THIS FILE MEASURES SPILL WITHOUT A COMMITTED BEFORE-FRAME.
 *
 * The critic's measurement was a DELTA between two trees. A gate cannot be a delta
 * against a tree that no longer exists, and it must not be a delta against a committed
 * PNG either -- `ARCHITECTURE.md:22` forbids image files, and `tools/surface.mjs`'s own
 * header documents at length what happens when a stale committed blob becomes a
 * reference (the `close.png` captured on another machine at another commit under
 * SwiftShader, still quoted as "the game frame").
 *
 * So the reference is rendered in the same process, from the same tree, one frame
 * apart: THE SAME POSE WITH `post.bloom.enabled = false`. That gives a bloom-free plate
 * B0 and the shipped frame B1. Everything geometric, every light, every material is
 * identical between them by construction. The chamfer distance transform then runs from
 * B0's bright pixels, and the lift of B0's deep-void pixels in B1 is binned by distance.
 * That is not an approximation of the critic's test -- it is the same quantity, sourced
 * so that it is reproducible from any checkout forever.
 *
 * WHAT THE BOUNDS ARE, AND WHERE EACH ONE CAME FROM. Every threshold in `LIMITS` was
 * measured on two trees that differ ONLY in the three material files of `4e646df`
 * (`src/art/palette.js`, `src/art/textures/hullMaps.js`, `src/art/textures/wear.js`),
 * geometry held constant, exactly as the critic held it. The measured pair and the
 * chosen bound are written next to each limit. Nothing here is a taste judgement and
 * nothing here was moved to make a run comfortable.
 *
 * THIS GATE HAS BEEN SHOWN TO FAIL. On that worktree it exits 1, with four of its six
 * assertions red; on a clean checkout it exits 0 with six of six. A gate that has never
 * been shown red is not a gate, and this project has shipped that exact mistake four
 * times (a UI audit measuring zero panels, a regex matching its own doc comment, a
 * harness certifying a system that had never run, and a loadout probe printing PASS into
 * a PNG with no exit code). Reproducing it takes two commands:
 *
 *     git worktree add /tmp/bad HEAD --detach && ln -s "$PWD/node_modules" /tmp/bad/
 *     for f in src/art/palette.js src/art/textures/hullMaps.js src/art/textures/wear.js; \
 *       do git show 4e646df:$f > /tmp/bad/$f; done
 *     cd /tmp/bad && node tools/derelictcheck.mjs; echo $?
 *
 * THE BOUNDS ARE CALIBRATED AT 1280x720 ON HARDWARE RASTER. `--width`/`--height` exist
 * for looking, not for gating: `maskPct` in particular is a fraction of the frame and
 * moves with framing (measured: hero mask 16.56 % at 1280x720, 15.69 % at 1600x900 on
 * the same tree). The runner never passes them.
 *
 * WHAT IT CANNOT CATCH -- the tool prints a NOT GATED block every run, and there is a
 * longer list at the very bottom of this file. Read one of them before assuming the
 * graveyard is covered.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, openGame, rasterMode, ROOT } from './harness.mjs';

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const WIDTH = Number(arg('width', 1280));
const HEIGHT = Number(arg('height', 720));
const REPEAT = Math.max(1, Number(arg('repeat', 1)));

/**
 * THE SHOTS.
 *
 * Two framings, because the two failure modes live at different scales: `hero` is where
 * halos in empty space are visible at all (most of the frame IS empty space, and the 30
 * drifting fragments that blew out are scattered right across it), `breach` is 1150 m
 * off the wound, where the facet read and the shadow terminator are the whole point of
 * the shot.
 *
 * Poses are copied from `VIEWS` in src/probes/derelict.js. They are duplicated rather
 * than imported because that module is a browser probe that imports three.js; a gate
 * that has to boot a bundler to know where its camera goes is a gate that breaks for
 * reasons unrelated to what it measures. `tools/silhouette.mjs` duplicates poses for
 * the same reason.
 */
const SHOTS = [
  { id: 'hero', distance: 4900, pitch: 0.26, yaw: -2.15, target: [0, 0, 60], fov: 34 },
  { id: 'breach', distance: 1150, pitch: 0.18, yaw: -1.45, target: [0, 20, 250], fov: 42 },
];

/**
 * NO `seed` IS PASSED, AND THAT IS LOAD-BEARING. This cost an hour, so it is written
 * down rather than left as a bare omission.
 *
 * `src/probe.js` feeds the `seed` query parameter straight into `new World({ seed })`,
 * and the derelict probe ALSO parses its own options out of the fragment of that same
 * string. So `--seed 'd#field=1'` does not just switch the debris field on, it reseeds
 * the entire world — every `world.rng.fork`, including the one the material registry
 * generates its maps from. Measured on the regressed tree at 1280x720:
 *
 *   seed (default `probe:derelict`)   mask 37.30 %      <- the regression, reproduced
 *   seed 'd#field=1'                  mask 17.78 %      <- invisible
 *
 * A gate whose shot is seeded differently from the probe everyone else looks at is a
 * gate measuring a frame nobody has ever seen. This one runs the probe exactly as
 * `node tools/probe.mjs derelict` does.
 */
const QUERY = 'p=derelict&quality=high';

/** surface.mjs's operator, verbatim (tools/surface.mjs:446,468,502). Same numbers, same meaning. */
const MASK_LUMA = 0.055;
/**
 * A pixel is treated as a BLOOM SOURCE at 8-bit sRGB >= 0.60 in the bloom-free plate.
 * This is a SEED FOR THE DISTANCE TRANSFORM, nothing more, and it is deliberately not
 * gated on. The pass thresholds in HDR at 1.05 (`UnrealBloomPass(..., 0.62, 0.34,
 * 1.05)`, src/render/postfx.js:430) and this file only ever sees the tone-mapped 8-bit
 * frame, where everything past the shoulder is already clamped together.
 *
 * MEASURED, so nobody builds a gate on it by mistake: across the two calibration trees
 * `hot%` moves 7.48 -> 7.90 on `hero` and 22.36 -> 22.88 on `breach`. That is a 5.6 %
 * move for a regression that more than doubled the lit area of the frame, and it is the
 * whole reason a bright-pixel-counting gate would have passed `4e646df`. Tone mapping
 * had already compressed the difference away before this file could see it; the energy
 * was still there in HDR, and the bloom pass is what put it back on screen.
 */
const HOT_LUMA = 0.60;
/** DEEP void. Well under the mask floor, so "this pixel was empty space" is not arguable. */
const VOID_LUMA = 0.02;
/** Blown out: no facet read is possible above this. */
const BLOWN_LUMA = 0.85;

/** The critic's bins, in pixels, on a 1280x720 frame. */
const BINS = [
  { lo: 10, hi: 20 }, { lo: 20, hi: 40 }, { lo: 40, hi: 80 },
  { lo: 80, hi: 160 }, { lo: 160, hi: Infinity },
];

/**
 * THE BOUNDS, AND EVERY NUMBER BEHIND THEM.
 *
 * `head` is `bca5d10`. `bad` is the SAME tree with `4e646df`'s three material files
 * dropped over it -- `src/art/palette.js`, `src/art/textures/hullMaps.js`,
 * `src/art/textures/wear.js` -- so geometry, lighting and camera are identical by
 * construction, exactly as the critic held them. Both trees measured with
 * `--repeat 3`, hardware raster, 1280x720; `head` and `bad` below are the WORST value
 * seen in the direction of the bound ACROSS EVERY RUN, including separate processes on
 * separate worktrees, and `noise` is the full observed spread. Cross-process matters:
 * `hero/darkPct` never moved more than 0.05 within one process and moved 0.14 between
 * them, so a within-process spread would have understated it by three times.
 *
 * Independently confirmed outside this tool: `node tools/probe.mjs derelict` in the two
 * worktrees, measured with `node tools/surface.mjs --frame scene`, gives mask 16.2 % vs
 * 37.4 % -- the critic's 16.2 -> 37.6 reproduced to a tenth of a point.
 *
 *   kind: 'discriminator'  the measured pair separates on this, and by how much is
 *                          written down. These are the assertions that would have
 *                          turned `4e646df` red.
 *   kind: 'guard'          the pair does NOT separate on this. It is a loose ceiling so
 *                          that the framing is not silently unmeasured, and it is
 *                          labelled rather than counted as evidence of anything.
 *
 * Every bound is placed so HEAD keeps at least 20 % headroom, because a gate with no
 * headroom gets switched off the first time it goes red for an unrelated reason.
 */
const LIMITS = {
  hero: {
    /**
     * THE HEADLINE. Bloom is 30 % of the lit area of this frame on HEAD and 188 % of it
     * with the regression in. A pure within-frame ratio: exposure, key intensity and
     * palette all cancel, which is why it is the one number to read first.
     */
    maskLift: { max: 1.75, head: 1.30, bad: 2.86, noise: 0.00, kind: 'discriminator' },
    /**
     * THE CRITIC'S SIGNATURE, at the distance where it stops being arguable. Bloom close
     * to a source is authored and wanted; bloom still lifting deep void 80-160 px away
     * is a halo, and re-lighting geometry cannot do it.
     *
     * The 160 px+ bin is measured and printed but NOT gated: it separates 1.59 -> 1.90,
     * and a bound between those leaves HEAD about 10 % of headroom. That is too little
     * to survive an unrelated art change, and a bound nobody trusts is a bound that gets
     * commented out. The 80-160 bin carries the assertion; the full decay curve is
     * printed for the human, because MONOTONIC DECAY is the diagnosis, not any one bin.
     */
    spill80: { max: 2.05, head: 1.70, bad: 2.61, noise: 0.03, kind: 'discriminator' },
    /**
     * The critic's own number, reproduced inside the gate: `surface.mjs --frame scene`
     * mask on the shipped frame. Absolute rather than differential, so it also catches a
     * blowout that arrives some way other than bloom.
     */
    maskPct: { max: 24.0, head: 16.59, bad: 37.19, noise: 0.05, kind: 'discriminator' },
    /**
     * THE SHADOW TERMINATOR, as a floor. "The facet read and the shadow terminator,
     * crisp and countable before, washed to flat white" is a statement about the DARK
     * side, and the dark side is what collapsed: 4.68 % of the subject still in shadow
     * became 1.77 %. This is the only two-sided-ish bound here and the only one that
     * fails when the frame gets brighter without getting bigger.
     */
    darkPct: { min: 3.20, head: 4.58, bad: 1.84, noise: 0.14, kind: 'discriminator' },
  },
  breach: {
    /**
     * GUARD, not a discriminator: 1.14 -> 1.16, no separation. At 1150 m the hulk fills
     * 77 % of the frame before bloom, so there is almost no void left for a halo to land
     * in and this framing simply cannot see the defect that happened. It is bounded
     * anyway so that a future blowout confined to the close read is not invisible.
     */
    maskLift: { max: 1.35, head: 1.14, bad: 1.16, noise: 0.00, kind: 'guard' },
    /** GUARD: 2.40 -> 1.97. Real movement, but only 1.2x, and too close to gate on. */
    darkPct: { min: 1.60, head: 2.37, bad: 2.00, noise: 0.06, kind: 'guard' },
  },
};

// ---------------------------------------------------------------------------
// measurement
// ---------------------------------------------------------------------------

/**
 * Two-pass chamfer distance transform, 3-4 weights over a 3x3 neighbourhood, divided
 * by 3 at the end so the unit is pixels. Max error against true Euclidean is about
 * 8 %, which is far inside bins that double in width.
 */
function chamfer(seed, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : INF;
  const at = (x, y) => d[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (y > 0) {
        if (x > 0) v = Math.min(v, at(x - 1, y - 1) + 4);
        v = Math.min(v, at(x, y - 1) + 3);
        if (x < w - 1) v = Math.min(v, at(x + 1, y - 1) + 4);
      }
      if (x > 0) v = Math.min(v, at(x - 1, y) + 3);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (y < h - 1) {
        if (x < w - 1) v = Math.min(v, at(x + 1, y + 1) + 4);
        v = Math.min(v, at(x, y + 1) + 3);
        if (x > 0) v = Math.min(v, at(x - 1, y + 1) + 4);
      }
      if (x < w - 1) v = Math.min(v, at(x + 1, y) + 3);
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/**
 * Interior gradient energy on the subject: the facet read, as a number.
 *
 * Central differences, but only on pixels whose 4-neighbours are ALL subject, so the
 * silhouette against void contributes nothing. A hull of countable flat facets has a
 * high interior gradient (every facet boundary is a step); the same hull washed to flat
 * white has almost none, because a blown region is by definition without slope.
 */
function interiorGradient(lum, mask, w, h) {
  let sum = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) continue;
      const gx = (lum[i + 1] - lum[i - 1]) * 0.5;
      const gy = (lum[i + w] - lum[i - w]) * 0.5;
      sum += Math.hypot(gx, gy);
      n++;
    }
  }
  return { mean: n ? sum / n : 0, n };
}

/**
 * Box-downsample luma and mask by `k`. A tile is subject only if EVERY pixel in it is
 * subject, so the coarse mask never straddles the silhouette.
 *
 * This exists so the facet read can be measured at a scale that surface NOISE cannot
 * reach. `4e646df` deliberately changed the pit frequency (4.45 m pits to 1.1 m), and a
 * full-resolution gradient cannot tell "the facets went flat" from "the noise got
 * finer" — it would fall for both. At k=4 the 1.1 m pitting is far below the sampling
 * limit and what is left is the value steps between facets, which is what "countable
 * facets and a shadow terminator" means.
 */
function downsample(lum, mask, w, h, k) {
  const W = Math.floor(w / k), H = Math.floor(h / k);
  const dl = new Float32Array(W * H);
  const dm = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      let s = 0, all = 1;
      for (let y = 0; y < k; y++) {
        for (let x = 0; x < k; x++) {
          const p = (Y * k + y) * w + (X * k + x);
          s += lum[p];
          if (!mask[p]) all = 0;
        }
      }
      dl[Y * W + X] = s / (k * k);
      dm[Y * W + X] = all;
    }
  }
  return { lum: dl, mask: dm, w: W, h: H };
}

function luma(rgba, w, h) {
  const lum = new Float32Array(w * h);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
  }
  return lum;
}

function analyse(off, on, w, h) {
  const N = w * h;
  const hot = new Uint8Array(N);
  const voidPx = new Uint8Array(N);
  const subj = new Uint8Array(N);
  let hotN = 0, voidN = 0, subjN = 0, maskOnN = 0;
  for (let p = 0; p < N; p++) {
    if (off[p] >= HOT_LUMA) { hot[p] = 1; hotN++; }
    if (off[p] <= VOID_LUMA) { voidPx[p] = 1; voidN++; }
    if (off[p] > MASK_LUMA) { subj[p] = 1; subjN++; }
    if (on[p] > MASK_LUMA) maskOnN++;
  }

  // --- spill: void pixels of the bloom-free plate, binned by distance to a source ---
  const bins = BINS.map((b) => ({ ...b, n: 0, sOff: 0, sOn: 0 }));
  if (hotN > 0) {
    const dist = chamfer(hot, w, h);
    for (let p = 0; p < N; p++) {
      if (!voidPx[p]) continue;
      const d = dist[p];
      for (const b of bins) {
        if (d >= b.lo && d < b.hi) { b.n++; b.sOff += off[p]; b.sOn += on[p]; break; }
      }
    }
  }
  for (const b of bins) {
    b.meanOff = b.n ? b.sOff / b.n : 0;
    b.meanOn = b.n ? b.sOn / b.n : 0;
    b.ratio = b.meanOff > 0 ? b.meanOn / b.meanOff : (b.n ? Infinity : 1);
  }

  // --- facet read, on the shipped frame, over the bloom-free subject mask ---
  let blown = 0, dark = 0;
  for (let p = 0; p < N; p++) {
    if (!subj[p]) continue;
    if (on[p] > BLOWN_LUMA) blown++;
    if (on[p] < 0.10) dark++;
  }
  const grad = interiorGradient(on, subj, w, h);
  const lo = downsample(on, subj, w, h, 4);
  const gradLo = interiorGradient(lo.lum, lo.mask, lo.w, lo.h);

  const pct = (a, b) => +((a / Math.max(1, b)) * 100).toFixed(2);
  return {
    maskPct: pct(maskOnN, N),
    maskOffPct: pct(subjN, N),
    /**
     * THE HEADLINE NUMBER. How much of the lit area of the shipped frame is the bloom
     * pass rather than the scene: mask(B1) / mask(B0). It is a pure ratio inside one
     * render, so exposure, palette and key intensity cancel out of it exactly.
     */
    maskLift: +(maskOnN / Math.max(1, subjN)).toFixed(3),
    hotPct: pct(hotN, N),
    voidPct: pct(voidN, N),
    blownPct: pct(blown, subjN),
    darkPct: pct(dark, subjN),
    facetGrad: +grad.mean.toFixed(5),
    facetN: grad.n,
    /** The same, at 1/4 resolution: facet steps with the surface noise sampled away. */
    facetGradLo: +gradLo.mean.toFixed(5),
    facetLoN: gradLo.n,
    bins: bins.map((b) => ({
      label: b.hi === Infinity ? `${b.lo}+` : `${b.lo}-${b.hi}`,
      n: b.n,
      off: +b.meanOff.toFixed(5),
      on: +b.meanOn.toFixed(5),
      ratio: +b.ratio.toFixed(3),
    })),
  };
}

// ---------------------------------------------------------------------------
// capture
// ---------------------------------------------------------------------------

/** Runs in the page. Returns two base64 luma-source RGBA buffers for one pose. */
const CAPTURE = async ({ shot, frames }) => {
  const N = window.__NADIR;
  const wait = (n) => new Promise((res) => {
    let i = 0;
    const step = () => (++i >= n ? res() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

  N.world.camera.fov = shot.fov;
  N.world.camera.updateProjectionMatrix();
  Object.assign(N.pose, { distance: shot.distance, pitch: shot.pitch, yaw: shot.yaw });
  N.pose.target.set(shot.target[0], shot.target[1], shot.target[2]);
  N.applyPose();

  const grab = async (bloomOn) => {
    N.renderer.post.bloom.enabled = bloomOn;
    await wait(frames);
    const c = N.renderer.canvas;
    const oc = document.createElement('canvas');
    oc.width = c.width; oc.height = c.height;
    const g = oc.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, oc.width, oc.height).data;
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) s += String.fromCharCode.apply(null, d.subarray(i, i + CH));
    return { w: oc.width, h: oc.height, b64: btoa(s) };
  };

  const wasOn = N.renderer.post.bloom.enabled;
  const off = await grab(false);
  const on = await grab(true);
  N.renderer.post.bloom.enabled = wasOn;
  return { off, on };
};

async function measure(page) {
  const out = {};
  for (const shot of SHOTS) {
    const { off, on } = await page.evaluate(CAPTURE, { shot, frames: 6 });
    const w = off.w, h = off.h;
    const bOff = Buffer.from(off.b64, 'base64');
    const bOn = Buffer.from(on.b64, 'base64');
    out[shot.id] = { w, h, ...analyse(luma(bOff, w, h), luma(bOn, w, h), w, h) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const results = [];
const fails = [];
let server = null, browser = null;

function check(ok, label, detail) {
  if (!ok) fails.push({ label, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
}

try {
  console.log(`\nDERELICTCHECK  ${WIDTH}x${HEIGHT}  raster=${rasterMode()}`);
  server = await startServer({ port: Number(process.env.PORT || 5241), mode: 'preview' });
  browser = await launchBrowser();
  const { page, booted, bootError, pageErrors } = await openGame(browser, server.url + 'probe.html', {
    width: WIDTH,
    height: HEIGHT,
    query: QUERY,
    settleFrames: 60,
  });
  if (!booted) {
    console.error(`the derelict probe FAILED TO BOOT\n${bootError}\n${pageErrors.join('\n')}`);
    process.exitCode = 1;
  } else {
    for (let r = 0; r < REPEAT; r++) results.push(await measure(page));
    await page.close();
  }
} catch (err) {
  console.error('DERELICTCHECK HARNESS ERROR:', err);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch { /* gone */ }
  try { await stopServer(server); } catch { /* gone */ }
}

if (!results.length) {
  console.error('\nFAIL: no frames were measured. A check that measures nothing is not a pass.');
  process.exit(1);
}

const m = results[0];
const pad = (v, n) => String(v).padStart(n);

console.log('\nMEASURED  (bloom-off plate B0, shipped frame B1, same pose one frame apart)');
console.log('  shot      maskB0  maskB1  LIFT   hot%  void%  blown%  dark%   facet   facetLo  facetPx');
for (const shot of SHOTS) {
  const r = m[shot.id];
  console.log(`  ${shot.id.padEnd(9)}${pad(r.maskOffPct, 7)}${pad(r.maskPct, 8)}${pad(r.maskLift.toFixed(2), 7)}`
    + `${pad(r.hotPct, 7)}${pad(r.voidPct, 7)}`
    + `${pad(r.blownPct, 8)}${pad(r.darkPct, 7)}${pad(r.facetGrad.toFixed(5), 9)}${pad(r.facetGradLo.toFixed(5), 10)}${pad(r.facetN, 9)}`);
}

console.log('\nBLOOM SPILL  void pixels of B0, by chamfer distance to the nearest B0 source, lifted in B1');
for (const shot of SHOTS) {
  console.log(`  ${shot.id}`);
  for (const b of m[shot.id].bins) {
    const lift = b.ratio === Infinity ? 'inf' : `${((b.ratio - 1) * 100).toFixed(0)}%`;
    console.log(`    ${b.label.padEnd(9)} n=${pad(b.n, 7)}   ${b.off.toFixed(5)} -> ${b.on.toFixed(5)}   x${b.ratio.toFixed(2)}  ${lift}`);
  }
}

if (REPEAT > 1) {
  console.log('\nRUN-TO-RUN SPREAD  (nothing smaller than this is a finding)');
  for (const shot of SHOTS) {
    const cols = ['maskLift', 'maskPct', 'maskOffPct', 'blownPct', 'darkPct', 'facetGrad', 'facetGradLo'];
    const line = cols.map((c) => {
      const vs = results.map((r) => r[shot.id][c]);
      const dp = c.startsWith('facet') ? 5 : 2;
      return `${c} ${Math.min(...vs).toFixed(dp)}-${Math.max(...vs).toFixed(dp)}`;
    }).join('   ');
    const s80 = results.map((r) => r[shot.id].bins[3].ratio);
    const s160 = results.map((r) => r[shot.id].bins[4].ratio);
    console.log(`  ${shot.id.padEnd(8)} ${line}   spill80 ${Math.min(...s80).toFixed(2)}-${Math.max(...s80).toFixed(2)}   spill160 ${Math.min(...s160).toFixed(2)}-${Math.max(...s160).toFixed(2)}`);
  }
}

if (has('json')) {
  const out = path.resolve(ROOT, arg('json', 'docs/review/derelictcheck.json'));
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify({ width: WIDTH, height: HEIGHT, raster: rasterMode(), runs: results }, null, 2));
  console.log(`\njson: ${path.relative(ROOT, out)}`);
}

/**
 * NOT GATED, AND MEASURED SO THAT THE OMISSION IS A FINDING RATHER THAN AN OVERSIGHT.
 * Printed every run so nobody re-derives them and assumes they are covered.
 */
console.log('\nNOT GATED  (measured on the calibration pair; these did not earn an assertion)');
console.log(`  blownPct        hero 1.75 -> 1.80, breach 1.06 -> 0.78. Subject pixels past luma ${BLOWN_LUMA}`);
console.log('                  BARELY MOVES, and on breach it moves the WRONG WAY. "Washed to flat');
console.log('                  white" is about halos AROUND the fragments, which land outside the');
console.log('                  bloom-free subject mask this column is counted over.');
console.log('  facetGrad       breach 0.05091 -> 0.02415. Full-resolution interior gradient.');
console.log('                  Halves, but CONFOUNDED: 4e646df deliberately took corrosion pits from');
console.log('                  4.45 m to 1.1 m, which is sub-pixel at this range and drops this');
console.log('                  number on its own. bca5d10 says that part should come back, so a');
console.log('                  bound here would red-light the correct redo of the fix.');
console.log('  facetGradLo     breach 0.03945 -> 0.03619. The same at 1/4 resolution, where surface');
console.log('                  noise cannot reach. Moves 8 %. THE LOW-FREQUENCY FACET STRUCTURE DID');
console.log('                  NOT COLLAPSE — so "loss of the facet read" is, on this measurement,');
console.log('                  high-frequency detail and the terminator, and the terminator is what');
console.log('                  hero/darkPct gates.');
console.log(`  hotPct          hero 7.48 -> 7.90. Bright pixels in the tone-mapped plate: +5.6 % for a`);
console.log('                  regression that doubled the lit area. This is the gate not to build.');

/**
 * SAMPLE SIZE FIRST, AND AN EMPTY SAMPLE IS A FAILURE.
 *
 * Every ratio above is a mean over a population that this file itself selected, and each
 * one degenerates quietly if its population empties out. Work through what a black frame
 * does to them: `hotN` is 0, so the distance transform gets no seed, every spill bin gets
 * `n = 0` and `ratio = 1`, and `spill80 <= 2.05` passes. `maskOnN` is 0, so `maskPct`
 * passes its ceiling and `maskLift` is 0 and passes its ceiling. Four of six assertions
 * go green on a frame with nothing in it. (`darkPct` is the one that would still fail,
 * which is luck, not design.)
 *
 * That is precisely the shape of this project's four previous vacuous checks. So the
 * populations are asserted before the ratios computed from them are, with floors two
 * orders of magnitude under what a working frame produces:
 *
 *   hero    subject 12.7 % of frame, spill80 bin n = 70,860     floors 2 % and 2,000
 *   breach  subject 77.2 % of frame, spill80 bin n = 22,663     floors 2 % and 2,000
 */
console.log('\nSAMPLE');
let sampleBad = 0;
for (const shot of SHOTS) {
  const r = m[shot.id];
  const px = (r.maskOffPct / 100) * r.w * r.h;
  const okSubject = r.maskOffPct >= 2.0;
  const okBin = r.bins[3].n >= 2000;
  if (!okSubject) sampleBad++;
  if (!okBin) sampleBad++;
  check(okSubject, `${shot.id}: the bloom-free plate has a subject to measure`,
    `${r.maskOffPct}% of ${r.w}x${r.h} = ${Math.round(px)} px, floor 2%`);
  check(okBin, `${shot.id}: the 80-160 px spill bin has a population`,
    `n=${r.bins[3].n} deep-void pixels at that distance from a source, floor 2000`);
}
if (sampleBad) {
  console.error('\nFAIL: this run measured nothing. Every ratio below is computed over a population');
  console.error('that is empty or near-empty, and a ratio over an empty set passes any ceiling.');
  console.error('Fix the frame, not the tool — start with whether the probe rendered at all.');
  process.exit(1);
}

console.log('\nGATE');
let asserted = 0;
for (const shot of SHOTS) {
  const r = m[shot.id];
  const id = shot.id;
  const lim = LIMITS[id] ?? {};
  const rows = [
    ['maskLift', r.maskLift,
      `bloom multiplies the lit area of this frame by ${r.maskLift.toFixed(2)} (${r.maskOffPct}% -> ${r.maskPct}%)`],
    ['spill80', r.bins[3].ratio, `deep void 80-160 px from a bright source lifted x${r.bins[3].ratio.toFixed(2)} by bloom`],
    ['maskPct', r.maskPct, `${r.maskPct}% of the frame is above the ${MASK_LUMA} mask floor`],
    ['darkPct', r.darkPct, `${r.darkPct}% of the subject is still in shadow`],
  ];
  for (const [name, value, detail] of rows) {
    const L = lim[name];
    if (!L) continue;
    asserted++;
    const dir = L.max !== undefined ? 'max' : 'min';
    const bound = L.max ?? L.min;
    const ok = dir === 'max' ? value <= bound : value >= bound;
    const tag = L.kind === 'guard' ? 'guard ' : '';
    check(ok, `${tag}${id}/${name} ${dir === 'max' ? '<=' : '>='} ${bound}   [head ${L.head}  bad ${L.bad}]`, detail);
  }
}

/**
 * A CHECK THAT ASSERTS NOTHING PRINTS "ok". Not here. And it is not enough to assert
 * SOMETHING: at least one bound that was SHOWN TO SEPARATE the calibration pair has to
 * have run, or this file has quietly become a set of loose guards that would have let
 * `4e646df` through exactly as the other fourteen gates did.
 */
const discriminators = Object.values(LIMITS)
  .flatMap((s) => Object.values(s))
  .filter((L) => L.kind === 'discriminator').length;
if (asserted === 0 || discriminators === 0) {
  console.error(`\nFAIL: ${asserted} assertion(s), ${discriminators} of them shown to catch the known`);
  console.error('regression. A gate with no discriminating bound is not a gate.');
  process.exit(1);
}

console.log(`\n${asserted - fails.length} of ${asserted} assertions passed`);
if (fails.length) {
  console.error('\nFAIL — the graveyard render moved:');
  for (const f of fails) console.error(`  - ${f.label}   ${f.detail}`);
  console.error('\nSPILL is the one to read first. Monotonic decay with distance from a bright');
  console.error('source is bloom, and only bloom: re-lighting geometry cannot raise empty space');
  console.error('160 px away. If spill moved, look at what made surfaces specular-bright — the');
  console.error('ORM generator in src/art/textures/hullMaps.js is where this happened last time.');
  process.exit(1);
}
console.log('derelictcheck ok');

/**
 * WHAT THIS GATE CANNOT CATCH. Say it out loud so nobody assumes the graveyard is
 * covered:
 *
 *   - COLOUR. Every number here is luma. The derelict could turn magenta and every
 *     assertion would hold. `registry.paletteAudit()` is the tool for that and this
 *     file does not call it.
 *   - GEOMETRY. Two shots, one object, one lighting rig. A vane that vanished, a
 *     silhouette that changed, an LOD that popped — `tools/silhouette.mjs` and the
 *     ships audit own those and this file would not notice.
 *   - THE OTHER TWELVE POIs. Only `graveyard` is measured, and only through the
 *     `derelict` probe. The same material regression on `near-star` or `giant-orbit`
 *     passes here untouched.
 *   - THE GAME PATH. This is the PROBE, with the probe's `keyScale` boost and its
 *     exposure of 1.10 (src/probes/derelict.js). `poicheck.mjs`'s header explains why
 *     the probe and the assembled game are not the same lighting; a regression that
 *     only exists on the live path is out of scope here.
 *   - THE SALVAGE VFX. Cutting beams, sparks, the salvage HUD — none of it is in the
 *     probe frame, and all of it is emissive and therefore exactly the sort of thing
 *     that sources bloom.
 *   - A REGRESSION THAT DARKENS. Four of the six bounds are ceilings. `darkPct` is a
 *     floor on the SHADOW fraction, which a darkening change satisfies more easily, not
 *     less. A change that kills the key light leaves a frame that passes here.
 *     `tools/widediag.mjs --assert` is the black-frame gate; this one is not.
 *   - THE FACET READ AT HIGH FREQUENCY. `facetGrad` halved on the calibration pair and
 *     is deliberately NOT gated; see the NOT GATED block this file prints every run for
 *     why, and do not add a bound there without resolving the confound first.
 *   - BLOWN HIGHLIGHTS ON THE SUBJECT ITSELF. `blownPct` did not move. If a future
 *     change clips the LIT side to white without adding halos, nothing here fires.
 *   - ANYTHING SMALLER THAN THE RUN-TO-RUN SPREAD printed by `--repeat`.
 *   - ANY OF IT UNDER SWIFTSHADER. The bounds were measured on hardware raster. This
 *     file prints its raster mode; a number from the other one has not been calibrated
 *     and `tools/surface.mjs`'s header documents what happens when the two are mixed.
 */
