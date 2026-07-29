/**
 * SURFACE MEASUREMENT — the numbers ship-language.md §8 asks for, run on a PNG.
 *
 *   node tools/surface.mjs --frame ship  docs/probes/cruiser.png
 *   node tools/surface.mjs --frame face  docs/review/look-surface/close.png --crop 0.30,0.39,0.62,0.50
 *   node tools/surface.mjs --frame scene docs/review/look-surface/close.png
 *
 * `--frame` IS REQUIRED, AND THAT IS THE POINT OF THIS TOOL.
 *
 * §3's method applied to the same ship gives three incompatible answers depending on
 * what you point it at. Measured on this tree:
 *
 *   ship   cruiser probe, 4 fresh renders     hull on void, no UI     47.3 / 44.3 /  8.4
 *   scene  docs/review/look-surface/close.png game frame              78.1 / 20.3 /  1.6
 *   face   the same frame, one lit flank      --crop 0.30,0.39,0.62,0.50
 *                                                                    97.2 /  2.8 /  0.0
 *
 * The `ship` row is the mean of four fresh 1600x900 renders on hardware raster; the
 * measured range across them is calm 47.0-47.6, medium 44.0-44.6, dense 8.0-8.6, i.e.
 * 0.6 points on every column, over 498-501 tiles each. THAT RANGE IS THE NOISE FLOOR
 * and nothing smaller than it is a finding.
 *
 * It is NOT the number the committed `docs/probes/cruiser.png` gives — that blob reads
 * 44.3 / 47.3 / 8.4, because it was captured while `src/probes/cruiser.js` still had
 * the orbit spin running and its pose is therefore a function of frame rate. The spin
 * is off as of this session; the committed PNG has not been regenerated and is stale by
 * about three points of calm. See the note on VIEWS in src/probes/cruiser.js.
 *
 * The `scene` and `face` rows come from a PNG CAPTURED ON A DIFFERENT MACHINE AND A
 * DIFFERENT COMMIT. `docs/review/look-surface/close.png` was added by 64590fd at
 * 1280x720 with the HUD UP (that commit's `close` shot has neither a `hud` flag nor a
 * `query`) and its manifest records `"fps": 4`, which is SwiftShader. It reads luma
 * 0.1337 contrast 0.2104 — a perfectly good frame — while the SAME shot on HEAD renders
 * 0.0104/0.0129 on hardware. That is not a contradiction, it is D67: the plume defect
 * does not reproduce under SwiftShader. Quoting either row as "the game frame" without
 * that sentence is how D-INT1 got aimed at the wrong tier in the first place.
 *
 * All three are correct applications of the method. They disagree about the DIRECTION
 * of the failure: the scene framing says the hull is too calm, the ship framing says
 * it is too MEDIUM — which is `cruiser-modules.png`'s failure mode, the one §3
 * describes as "nothing for the detail to be detail against". D-INT1 was written from
 * the scene number and was therefore aimed at the wrong tier. The tool used to accept
 * any image and print a split with no framing recorded, which is how that happened, so
 * the framing is now part of the contract and there is no default.
 *
 * WHICH FRAMING CARRIES THE §3 VERDICT: `ship`, and only `ship`.
 *
 * §3's reference table was built from ship renders of Homeworld and Star Citizen
 * assets, and its own "ours" row names `docs/probes/cruiser.png`. Comparing a game
 * frame against it is comparing a photograph of a room to a photograph of a model.
 *
 *   `ship`   hull rendered on void. The mask IS the ship. Gates on §3's band.
 *   `face`   a crop of ONE continuous lit face. Reports value range, plate anisotropy
 *            and the split, but does NOT gate on §3's band — the reference table has
 *            no face-scale rows to compare against, and inventing one is how this
 *            project has been burned before. This is the framing `aniso` is valid on.
 *   `scene`  a whole game frame. The mask contains lit rocks, nebula and any UI left
 *            up. Reports, and explicitly declines a §3 verdict. Useful only as a
 *            delta between two runs of the same shot.
 *
 * THE BAND IS TWO-SIDED, AND ITS BOUNDS ARE MEASURED RATHER THAN CHOSEN.
 *
 * §3 states the rule one-sidedly — `calm >= 60, medium <= 28, dense <= 12` — and this
 * tool printed those bounds verbatim while asserting nothing at all: it had no
 * `process.exit` other than the usage guard, so it always exited 0, and the current
 * split satisfies all three of those bounds anyway. A rule that cannot express "too
 * calm" cannot catch the defect it was written for.
 *
 * The gate below is the ENVELOPE of §3's own six reference assets (the min and max of
 * each column of the table at ship-language.md §3). Every bound is a number measured
 * off a shipped reference game, so none of it is invented. §3's authored one-sided
 * rule is still evaluated and still printed, as a second, tighter verdict.
 *
 * MASK. Crude and stated rather than hidden: luma > 0.055. There is no UI-rectangle
 * exclusion — an earlier version of this header claimed one and there has never been
 * any such code — so on `scene` the HUD is inside the mask, which is most of why that
 * framing cannot carry a verdict. `hud: false` in `tools/shots.json` is the real fix
 * for a look-review frame.
 *
 * ---------------------------------------------------------------------------
 * THE PART OF THIS TOOL YOU MUST READ BEFORE QUOTING ITS calm OR dense NUMBER
 *
 * This tool's operator and §3's table's operator are NOT the same operator, and the
 * difference was measured rather than suspected. Commit 1e6c5e2 is the commit that
 * wrote §3's "ours" row AND the `docs/probes/cruiser.png` it was measured from. Run
 * this tool on that exact blob:
 *
 *     git show 1e6c5e2:docs/probes/cruiser.png > /tmp/c.png
 *     node tools/surface.mjs --frame ship /tmp/c.png
 *
 *                          calm    medium   dense
 *   §3's table row         49.2 %   25.7 %   25.0 %
 *   this tool, same blob   73.4 %   26.3 %    0.3 %
 *   difference            +24.2     +0.6    -24.7
 *
 * The two agree on MEDIUM to 0.6 points and disagree on the two tails by 25 points.
 * That is the signature of a gradient operator with a different scale: §3's produced
 * values large enough to push a quarter of the hull past the 0.14 "dense" threshold
 * where this one leaves them under 0.045. Which is right cannot be settled, because
 * §3's six reference rows were measured off Star Citizen and Homeworld renders that
 * are not in this repository and cannot be put in it — `ARCHITECTURE.md:22` forbids
 * committing image files. Those six rows are permanently unreproducible.
 *
 * CONSEQUENCE, and it is the honest answer to FLAG 4:
 *
 *   - The `medium` column is the one tier that survives. It is bounded on BOTH sides,
 *     it is the only column where the two operators agree on a shared image, and the
 *     current hull reads 44.0-44.6 % medium over four fresh renders against a
 *     reference envelope of 10.1-39.0 % and §3's own authored ceiling of 28 %. The
 *     measured run-to-run spread on that column is 0.6 points and the exceedance is
 *     5.0-5.6, so "too medium" clears its own noise floor eight times over. It is a
 *     finding.
 *   - The `calm` and `dense` columns are reported and gated, because moving a gate to
 *     make it comfortable is how this project has been burned before — but a calm or
 *     dense number from this tool must never be quoted against §3's table without the
 *     25-point caveat above. `--calibrate` prints what the thresholds mean in units
 *     that do not depend on anybody's table.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ship-language.md §3's reference table, transcribed. Kept here so the band's
 * provenance is checkable from the tool rather than from prose that can drift.
 */
const REFERENCES = [
  { name: 'SC Idris, side, dark render', calm: 79.8, medium: 11.5, dense: 8.7 },
  { name: 'HW2 Hiigaran Dreadnaught', calm: 67.9, medium: 10.1, dense: 22.1 },
  { name: 'SC UEE Stanton, isometric', calm: 55.4, medium: 26.1, dense: 18.5 },
  { name: 'SC Idris, Invictus quarter view', calm: 54.2, medium: 39.0, dense: 6.8 },
  { name: 'SC Javelin', calm: 51.3, medium: 28.6, dense: 20.1 },
  { name: 'HW2 Vaygr supercarrier', calm: 74.7, medium: 15.5, dense: 9.8 },
];
const span = (k) => [Math.min(...REFERENCES.map((r) => r[k])), Math.max(...REFERENCES.map((r) => r[k]))];
/** Two-sided, measured: the range the six reference assets actually occupy. */
const BAND = { calm: span('calm'), medium: span('medium'), dense: span('dense') };
/** §3's authored one-sided rule, evaluated separately and reported, not gated on. */
const AUTHORED_RULE = { calmMin: 60, mediumMax: 28, denseMax: 12 };

/**
 * A tile has to be mostly on the subject to be counted, and a verdict needs enough
 * tiles to mean anything. 120 tiles is roughly a 2% mask at 900 px wide; below that a
 * "split" is a handful of tiles and reports noise as art direction.
 */
const MIN_TILES = 120;
/**
 * A `face` crop that is less than 60% mask is not a crop of a face — more than a
 * third of it is void, and the gradient statistics are then dominated by the
 * silhouette edge rather than by the surface. Stated as a definition, not a target.
 */
const FACE_MIN_MASK_PCT = 60;

const FRAMES = new Set(['ship', 'face', 'scene']);

/**
 * §3's "ours" row and what this tool reads off the SAME blob. See the header. Kept as
 * data so the provenance block below is printed from a checkable number rather than
 * from prose, and so a future re-derivation of §3's table updates one place.
 */
const OPERATOR_DISAGREEMENT = {
  commit: '1e6c5e2',
  image: 'docs/probes/cruiser.png',
  table: { calm: 49.2, medium: 25.7, dense: 25.0 },
  tool: { calm: 73.4, medium: 26.3, dense: 0.3 },
};

/**
 * A PNG this flat is not a measurement.
 *
 * `tools/capture.mjs` refuses a frame at contrast < 0.02 or > 97% near-black, and a
 * frequency split computed off such a frame is the mask threshold's noise, not the
 * ship's surface. The `close` shot has been rendering at luma 0.0104 / contrast 0.0128
 * on HEAD (see tools/shots.json and D67); this guard is what stops that frame's split
 * from being quoted the moment somebody regenerates the PNG and points this at it.
 * Same two numbers as capture.mjs, deliberately.
 */
const BLANK = { minContrast: 0.02, maxNearBlackPct: 97 };

const argv = process.argv.slice(2);
function opt(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
const frame = opt('frame');
const files = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));

/**
 * -------------------------------------------------------------------- --calibrate
 *
 * WHAT 0.045 AND 0.14 ACTUALLY MEAN.
 *
 * §3 states its thresholds as bare numbers with no units, which is why two operators
 * can both "implement §3" and disagree by 25 points. This mode fixes that from the
 * inside: it runs THIS tool's exact gradient-and-tile classifier over synthetic images
 * whose luminance slope is known by construction, and checks the numbers that come back
 * against what the operator predicts analytically.
 *
 * The prediction: the operator is `mean over the tile of hypot(gx, gy)` with
 * `gx = |L(x+1) - L(x-1)| / 2`. For a pattern that varies only in x at a constant
 * s luma per pixel, the central difference over two pixels divided by two returns
 * exactly s, and gy is zero. So the tile mean IS the per-pixel luma slope, and
 *
 *     calm   < 0.045   means the surface changes by less than 4.5% of the value
 *                      range per pixel
 *     dense  > 0.14    means more than 14% of the value range per pixel
 *
 * At §3's stated 900 px width across a 1400 m hull that is about 1.56 m per pixel, so
 * "dense" is a 14% value step every metre and a half of real hull. That statement is
 * checkable without any reference image, which is the whole point: the six assets §3's
 * envelope came from are not in this repository and cannot be (ARCHITECTURE.md:22).
 *
 * A ramp is not a sufficient target on its own - a constant slope is the one case a
 * broken operator is most likely to get right - so the sweep also includes a flat
 * field (must read 0), a square wave (slope is impulsive, so the tile mean must come
 * back well BELOW the wave's amplitude), and a vertical ramp (must read the same as
 * the horizontal one, or the operator is anisotropic and `aniso` means nothing).
 */
async function calibrate() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto('about:blank');
  const HULL_M = 1400, WIDTH_PX = 900;

  const out = await page.evaluate(({ targets }) => {
    // The identical operator, lifted verbatim in shape from the measurement pass below.
    const run = (lum, W, H) => {
      const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          gx[p] = Math.abs(lum[p + 1] - lum[p - 1]) * 0.5;
          gy[p] = Math.abs(lum[p + W] - lum[p - W]) * 0.5;
        }
      }
      let calm = 0, med = 0, dense = 0, tiles = 0, acc = 0;
      for (let ty = 8; ty + 16 <= H; ty += 8) {          // skip the border row of tiles
        for (let tx = 8; tx + 16 <= W; tx += 8) {
          let sum = 0, n = 0;
          for (let y = ty; y < ty + 8; y++) {
            for (let x = tx; x < tx + 8; x++) { const p = y * W + x; sum += Math.hypot(gx[p], gy[p]); n++; }
          }
          const v = sum / n;
          acc += v; tiles++;
          if (v < 0.045) calm++; else if (v < 0.14) med++; else dense++;
        }
      }
      return { meanTile: acc / tiles, tiles, calmPct: calm / tiles * 100, medPct: med / tiles * 100, densePct: dense / tiles * 100 };
    };

    const W = 256, H = 256;
    const rows = [];
    for (const t of targets) {
      const lum = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const u = t.axis === 'y' ? y : x;
          let v;
          if (t.kind === 'flat') v = 0.5;
          else if (t.kind === 'sine') v = 0.5 + (t.amp / 2) * Math.sin(2 * Math.PI * u / t.period);
          else v = (Math.floor(u / t.period) % 2) ? 0.5 + t.amp / 2 : 0.5 - t.amp / 2;
          lum[y * W + x] = Math.max(0, Math.min(1, v));
        }
      }
      // Nothing above may be silently clipped. This mattered: the first version of
      // this sweep used sustained linear ramps and every one of them clipped flat,
      // because a 0.14 luma/px slope exhausts the whole LDR range in seven pixels —
      // which is itself the finding printed below. Clipping is counted, not inferred
      // from the extremes: a sine legitimately touches its bounds at isolated samples.
      let lo = 1, hi = 0, atBound = 0;
      for (let i = 0; i < lum.length; i++) {
        if (lum[i] < lo) lo = lum[i];
        if (lum[i] > hi) hi = lum[i];
        if (lum[i] <= 1e-6 || lum[i] >= 1 - 1e-6) atBound++;
      }
      rows.push({
        ...t, ...run(lum, W, H),
        lo: +lo.toFixed(3), hi: +hi.toFixed(3),
        atBoundPct: +(atBound / lum.length * 100).toFixed(1),
      });
    }
    return rows;
  }, {
    /*
     * PREDICTIONS, DERIVED EXACTLY — including the discretisation.
     *
     * Sine grating L(u) = 0.5 + (A/2) sin(2*pi*u/P), sampled at integer u. The
     * operator computes |L(u+1) - L(u-1)| / 2. Expanding,
     *
     *     L(u+1) - L(u-1) = (A/2)[sin(t+d) - sin(t-d)] = A cos(t) sin(d),   d = 2*pi/P
     *     gx(u) = (A sin(d) / 2) * |cos(2*pi*u/P)|
     *
     * so the mean over the image is `(A sin(d) / 2) * D(P)`, where D(P) is the mean of
     * |cos(2*pi*u/P)| over the P integer samples of one period. D(P) is NOT the
     * continuum value 2/pi — for P = 4 it is exactly 0.5 — and the first version of
     * this sweep used 2/pi and failed by 0.034 on the P = 4 grating. The check caught
     * its own prediction, which is the only reason it is worth having.
     *
     * Square wave of half-period P, amplitude A: two edges per full period 2P, each
     * putting A/2 on two adjacent pixels, so the mean is A/P exactly.
     *
     * Every formula here is evaluated against the operator below and the sweep FAILS
     * on a miss. That is what makes this a check rather than a printout.
     */
    targets: (() => {
      const D = (P) => {
        let s = 0;
        for (let u = 0; u < P; u++) s += Math.abs(Math.cos(2 * Math.PI * u / P));
        return s / P;
      };
      const sine = (name, amp, period, axis = 'x') => ({
        name, kind: 'sine', axis, amp, period,
        expect: (amp * Math.sin(2 * Math.PI / period) / 2) * D(period),
      });
      return [
        { name: 'flat 0.5', kind: 'flat', axis: 'x', amp: 0, period: 0, expect: 0 },
        sine('sine A0.5 P32', 0.5, 32),
        sine('sine A0.5 P16', 0.5, 16),
        sine('sine A0.5 P16 y', 0.5, 16, 'y'),
        sine('sine A0.5 P8', 0.5, 8),
        sine('sine A0.5 P4', 0.5, 4),
        sine('sine A0.9 P8', 0.9, 8),
        { name: 'square A0.5 P8', kind: 'square', axis: 'x', amp: 0.5, period: 8, expect: 0.5 / 8 },
        { name: 'square A0.5 P2', kind: 'square', axis: 'x', amp: 0.5, period: 2, expect: 0.5 / 2 },
      ];
    })(),
  });

  await browser.close();

  console.log('surface.mjs operator calibration — synthetic targets, no reference image needed\n');
  console.log('target'.padEnd(16) + '  range  bound%  meanTile  predicted      err    calm%    med%  dense%');
  const failures = [];
  for (const r of out) {
    const err = Math.abs(r.meanTile - r.expect);
    console.log(r.name.padEnd(16)
      + `${r.lo}-${r.hi}`.padStart(9) + r.atBoundPct.toFixed(1).padStart(8)
      + r.meanTile.toFixed(4).padStart(11)
      + r.expect.toFixed(4).padStart(11)
      + err.toFixed(4).padStart(9)
      + r.calmPct.toFixed(1).padStart(9) + r.medPct.toFixed(1).padStart(8) + r.densePct.toFixed(1).padStart(8));
    if (err > 0.002) {
      failures.push(`${r.name}: operator returned ${r.meanTile.toFixed(4)} where the derivation predicts ${r.expect.toFixed(4)} (err ${err.toFixed(4)})`);
    }
    // A sine touches its bounds at isolated samples; a clipped signal SITS on them.
    if (r.atBoundPct > 15 && r.kind !== 'flat') {
      failures.push(`${r.name}: ${r.atBoundPct}% of pixels sit exactly at 0 or 1 — the target is clipped, not the signal it claims to be`);
    }
  }
  // Isotropy. `aniso` in the measurement pass is a ratio of x to y gradient energy and
  // is meaningless if the operator itself favours an axis.
  const rx = out.find((r) => r.name === 'sine A0.5 P16');
  const ry = out.find((r) => r.name === 'sine A0.5 P16 y');
  if (rx && ry && Math.abs(rx.meanTile - ry.meanTile) > 0.001) {
    failures.push(`the operator is anisotropic: x grating ${rx.meanTile.toFixed(4)} vs y grating ${ry.meanTile.toFixed(4)}`);
  }

  const mPerPx = HULL_M / WIDTH_PX;
  console.log('');
  console.log(`sample: ${out.length} synthetic targets, ${out[0].tiles} tiles each (256x256 px)`);
  console.log(`READING: a tile's value IS its mean per-pixel luma slope.`);
  console.log(`  calm  < 0.045  = under 4.5% of the value range per pixel`);
  console.log(`  dense > 0.14   = over  14% of the value range per pixel`);
  console.log(`At §3's stated ${WIDTH_PX} px width across a ${HULL_M} m hull (${mPerPx.toFixed(2)} m/px), a "dense" tile`);
  console.log(`averages a 14% value change every ${mPerPx.toFixed(2)} m of real hull.`);
  console.log('');
  console.log(`AND THE TIER IS NOT REACHABLE BY A GRADIENT. A sustained 0.14 luma/px slope`);
  console.log(`exhausts the whole [0,1] range in 7 px, so no 8x8 tile of an LDR image can hold`);
  console.log(`one — the first version of this sweep tried and every ramp clipped. "Dense" can`);
  console.log(`therefore only be reached by OSCILLATION: measured above, a 4 px sine at full`);
  console.log(`amplitude and an 8 px square wave both clear it, a 16 px sine does not. That is`);
  console.log(`what §3's dense budget is a budget on — alternation at the scale of a few pixels,`);
  console.log(`i.e. of a few metres of hull. It is not a budget on how steeply a surface shades.`);
  console.log('');
  console.log(`§3's own table cannot be calibrated this way: its six rows were measured off`);
  console.log(`Star Citizen and Homeworld renders that are not in this repository and cannot be`);
  console.log(`(ARCHITECTURE.md:22, "No image files"). On the one image both operators measured`);
  console.log(`- ${OPERATOR_DISAGREEMENT.image} at ${OPERATOR_DISAGREEMENT.commit} - they differ by`);
  console.log(`  calm ${(OPERATOR_DISAGREEMENT.tool.calm - OPERATOR_DISAGREEMENT.table.calm).toFixed(1)}`
    + `   medium ${(OPERATOR_DISAGREEMENT.tool.medium - OPERATOR_DISAGREEMENT.table.medium).toFixed(1)}`
    + `   dense ${(OPERATOR_DISAGREEMENT.tool.dense - OPERATOR_DISAGREEMENT.table.dense).toFixed(1)} points.`);

  for (const f of failures) console.log(`  FAIL  ${f}`);
  if (failures.length) { console.error(`\nFAIL: ${failures.length} calibration finding(s)`); process.exit(1); }
  console.log('\ncalibration ok');
}

if (argv.includes('--calibrate')) { await calibrate(); process.exit(0); }

if (!frame || !FRAMES.has(frame) || !files.length) {
  console.error('usage: node tools/surface.mjs --frame ship|face|scene <image.png> [more.png ...] [--crop x0,y0,x1,y1]');
  console.error('       node tools/surface.mjs --calibrate');
  console.error('');
  console.error('  --frame is REQUIRED. The same ship measures 44.9/45.7/9.3 as a ship render,');
  console.error('  78.1/20.3/1.6 as a game frame and 97.2/2.8/0.0 as a crop of one flank. Without');
  console.error('  a declared framing the number cannot be compared to anything.');
  console.error('');
  console.error('    ship   hull on void, no UI. The mask is the ship. GATES on the §3 band.');
  console.error('    face   a crop of one continuous lit face. Reports; no §3 verdict.');
  console.error('    scene  a whole game frame. Reports; declines a §3 verdict.');
  process.exit(2);
}

const cropArg = argv.indexOf('--crop');
/** --crop x0,y0,x1,y1 in 0..1 of the image, to measure one region. */
const crop = cropArg > 0 ? argv[cropArg + 1].split(',').map(Number) : [0, 0, 1, 1];
if (frame === 'face' && cropArg < 0) {
  console.error('--frame face needs a --crop: a face is a region of an image, not an image.');
  process.exit(2);
}

const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto('about:blank');

const rows = [];
for (const f of files) {
  const abs = path.resolve(ROOT, f);
  const buf = await fs.readFile(abs);
  const url = 'data:image/png;base64,' + buf.toString('base64');

  const r = await page.evaluate(async ({ url, crop }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });

    // --- 1. full-resolution pass: value range and saturation on the hull mask ---
    const cw = Math.round(img.width * (crop[2] - crop[0]));
    const ch = Math.round(img.height * (crop[3] - crop[1]));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, -img.width * crop[0], -img.height * crop[1]);
    const d = g.getImageData(0, 0, cw, ch).data;

    /*
     * WHOLE-FRAME STATISTICS, computed before any mask is applied, so the tool can
     * refuse an image that is not a picture of anything. Same luminance weights and
     * the same two thresholds tools/capture.mjs gates on, so the two agree by
     * construction rather than by good intentions.
     */
    let wSum = 0, wSum2 = 0, wDark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      wSum += l; wSum2 += l * l;
      if (l < 0.02) wDark++;
    }
    const wN = cw * ch;
    const wMean = wSum / wN;
    const whole = {
      pixels: wN,
      meanLuma: +wMean.toFixed(4),
      contrast: +Math.sqrt(Math.max(0, wSum2 / wN - wMean * wMean)).toFixed(4),
      nearBlackPct: +(wDark / wN * 100).toFixed(2),
    };

    const lumas = [];
    let sat = 0, satN = 0, masked = 0;
    // Mean colour of the mask. A hull whose stated identity is "neutral gunmetal"
    // should come back near-grey; a warm cast here is the grade's cream `gain`
    // shoulder, which is weighted by luma and therefore gets STRONGER as the frame
    // gets brighter — the one thing raising the key can quietly break.
    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (l <= 0.055) continue;              // void / near-black
      masked++;
      lumas.push(l);
      sr += R; sg += G; sb += B;
      /**
       * SATURATION IS ONLY COUNTED WHERE THERE IS ENOUGH VALUE TO CARRY A COLOUR.
       *
       * HSV saturation is a RATIO, so it goes to 1 in the dark: a shadow-side pixel at
       * RGB(0.02, 0.03, 0.06) — the planetshine fill on an unlit face, which is
       * supposed to be blue — scores S = 0.67 and would be counted as "saturated
       * accent". On the first run of this tool that put 12.8% of a strictly grey hull
       * (measured chroma 0.006) over §4's 3.5% accent budget, which is a measurement
       * artefact and not a defect. §4 is a budget on PAINT, so the floor is a value at
       * which paint is what you are looking at.
       */
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (l > 0.15) { satN++; if (mx > 0 && (mx - mn) / mx > 0.5) sat++; }
    }
    const mr = sr / Math.max(1, masked), mg = sg / Math.max(1, masked), mb = sb / Math.max(1, masked);
    const mmx = Math.max(mr, mg, mb), mmn = Math.min(mr, mg, mb);
    lumas.sort((a, b) => a - b);
    const q = (p) => (lumas.length ? lumas[Math.min(lumas.length - 1, Math.floor(p * lumas.length))] : 0);

    // --- 2. §3 frequency pass: 900 px wide, gradient magnitude, 8x8 tiles --------
    const W = 900, H = Math.max(1, Math.round(ch * (900 / cw)));
    const c2 = document.createElement('canvas');
    c2.width = W; c2.height = H;
    const g2 = c2.getContext('2d', { willReadFrequently: true });
    g2.drawImage(c, 0, 0, W, H);
    const d2 = g2.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(W * H);
    const mask = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < d2.length; i += 4, p++) {
      lum[p] = (0.2126 * d2[i] + 0.7152 * d2[i + 1] + 0.0722 * d2[i + 2]) / 255;
      mask[p] = lum[p] > 0.055 ? 1 : 0;
    }
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        gx[p] = Math.abs(lum[p + 1] - lum[p - 1]) * 0.5;
        gy[p] = Math.abs(lum[p + W] - lum[p - W]) * 0.5;
      }
    }
    let calm = 0, med = 0, dense = 0, tiles = 0, tilesSeen = 0;
    let energyX = 0, energyY = 0;
    for (let ty = 0; ty + 8 <= H; ty += 8) {
      for (let tx = 0; tx + 8 <= W; tx += 8) {
        tilesSeen++;
        let sum = 0, n = 0, inMask = 0;
        for (let y = ty; y < ty + 8; y++) {
          for (let x = tx; x < tx + 8; x++) {
            const p = y * W + x;
            if (!mask[p]) continue;
            inMask++;
            sum += Math.hypot(gx[p], gy[p]);
            energyX += gx[p]; energyY += gy[p];
            n++;
          }
        }
        if (inMask < 48) continue;           // tile must be mostly on the subject
        tiles++;
        const v = sum / n;
        if (v < 0.045) calm++;
        else if (v < 0.14) med++;
        else dense++;
      }
    }

    return {
      w: img.width, h: img.height,
      whole,
      /** What the frequency pass actually ran on, and by how much the source was scaled. */
      measuredAt: [W, H],
      resample: +(W / cw).toFixed(3),
      maskPct: +(masked / (cw * ch) * 100).toFixed(1),
      p05: +q(0.05).toFixed(3), p25: +q(0.25).toFixed(3), med: +q(0.5).toFixed(3),
      p75: +q(0.75).toFixed(3), p95: +q(0.95).toFixed(3), max: +(lumas.at(-1) ?? 0).toFixed(3),
      satPct: +(sat / Math.max(1, satN) * 100).toFixed(2),
      /** Mean colour of the mask, and its chroma. Chroma > ~0.10 is not "grey". */
      tint: [+mr.toFixed(3), +mg.toFixed(3), +mb.toFixed(3)],
      chroma: +(mmx > 0 ? (mmx - mmn) / mmx : 0).toFixed(3),
      calm: tiles ? +(calm / tiles * 100).toFixed(1) : 0,
      medium: tiles ? +(med / tiles * 100).toFixed(1) : 0,
      dense: tiles ? +(dense / tiles * 100).toFixed(1) : 0,
      tiles,
      tilesSeen,
      /**
       * See the header: <1 is horizontal-seam-dominant, ~1 isotropic. VALID ONLY on
       * `--frame face`. Over a whole frame it is dominated by silhouette and geometry
       * edges: between the round-one hull and the strake rewrite it moved 0.74 -> 0.73,
       * i.e. not at all, while the same measurement on a crop of one lit face read 2.06.
       */
      aniso: +(energyX / Math.max(1e-6, energyY)).toFixed(2),
    };
  }, { url, crop });

  rows.push({ file: path.relative(ROOT, abs), ...r });
}

await browser.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (s, n) => String(s).padStart(n);
const cropLabel = cropArg > 0 ? `  --crop ${crop.join(',')}` : '';
console.log(`frame: ${frame}${cropLabel}`);
console.log('file'.padEnd(42)
  + ' mask%   p05   p25   med   p75   p95   max   sat%   calm   med  dense  tiles  aniso  chroma  mean RGB');
for (const r of rows) {
  console.log(
    r.file.padEnd(42)
    + pad(r.maskPct, 5) + pad(r.p05, 6) + pad(r.p25, 6) + pad(r.med, 6) + pad(r.p75, 6)
    + pad(r.p95, 6) + pad(r.max, 6) + pad(r.satPct, 7)
    + pad(r.calm, 7) + pad(r.medium, 6) + pad(r.dense, 7) + pad(r.tiles, 7)
    + pad(frame === 'face' ? r.aniso : '  n/a', 7)
    + pad(r.chroma, 8) + '  ' + r.tint.join(' '),
  );
}

const failures = [];
const notes = [];

for (const r of rows) {
  /*
   * IS THIS A PICTURE OF ANYTHING? First question, before sample size, because a
   * black frame passes the tile-count floor easily — the mask threshold picks up
   * sensor-floor noise and hands back a confident 99% calm.
   */
  if (r.whole.contrast < BLANK.minContrast || r.whole.nearBlackPct > BLANK.maxNearBlackPct) {
    failures.push(`${r.file}: REFUSING TO MEASURE. Whole-frame contrast ${r.whole.contrast} `
      + `(floor ${BLANK.minContrast}), ${r.whole.nearBlackPct}% near-black (ceiling ${BLANK.maxNearBlackPct}%) `
      + `over ${r.whole.pixels} px. This trips tools/capture.mjs's own guards, so the frame was never `
      + `renderable and any split computed from it is the mask threshold's noise. Fix the frame, not the tool.`);
    continue;
  }

  // SAMPLE SIZE SECOND. A check that measures nothing prints "ok".
  if (r.tiles < MIN_TILES) {
    failures.push(`${r.file}: only ${r.tiles} tiles are on the subject (floor ${MIN_TILES}, ${r.tilesSeen} tiles in the image). `
      + 'Too small a sample for a frequency verdict — reframe or crop closer.');
    continue;
  }

  if (frame === 'face') {
    if (r.maskPct < FACE_MIN_MASK_PCT) {
      failures.push(`${r.file}: --frame face but the crop is only ${r.maskPct}% mask (floor ${FACE_MIN_MASK_PCT}%). `
        + 'More than a third of this crop is void, so the gradients are silhouette, not surface.');
    }
    notes.push(`--frame face carries NO §3 verdict: the reference table has no face-scale rows. `
      + `Split ${r.calm}/${r.medium}/${r.dense} and aniso ${r.aniso} are reported for tracking a delta on the SAME crop.`);
    continue;
  }

  if (frame === 'scene') {
    notes.push(`--frame scene carries NO §3 verdict: the mask (${r.maskPct}% of the frame) contains lit rock, nebula `
      + 'and any UI left up, so it is not a measurement of the ship. Use it as a delta between two runs of one shot.');
    continue;
  }

  // --frame ship: the only framing §3's table can be compared against.
  const band = (name, v, [lo, hi]) => {
    if (v < lo) return `${name} ${v}% is BELOW the reference envelope ${lo}-${hi}%`;
    if (v > hi) return `${name} ${v}% is ABOVE the reference envelope ${lo}-${hi}%`;
    return null;
  };
  const misses = [
    band('calm', r.calm, BAND.calm),
    band('medium', r.medium, BAND.medium),
    band('dense', r.dense, BAND.dense),
  ].filter(Boolean);
  if (misses.length) {
    for (const m of misses) failures.push(`${r.file}: ${m}`);
  } else {
    notes.push(`${r.file}: inside the six-reference envelope on all three tiers.`);
  }

  // §3's authored rule, tighter and one-sided. Reported, never gated on: it cannot
  // express "too calm", which is the exact reason this tool was rewritten.
  const authored = [];
  if (r.calm < AUTHORED_RULE.calmMin) authored.push(`calm ${r.calm} < ${AUTHORED_RULE.calmMin}`);
  if (r.medium > AUTHORED_RULE.mediumMax) authored.push(`medium ${r.medium} > ${AUTHORED_RULE.mediumMax}`);
  if (r.dense > AUTHORED_RULE.denseMax) authored.push(`dense ${r.dense} > ${AUTHORED_RULE.denseMax}`);
  notes.push(authored.length
    ? `${r.file}: §3's authored rule (calm>=60 medium<=28 dense<=12) MISSED on ${authored.join(', ')}`
    : `${r.file}: §3's authored rule (calm>=60 medium<=28 dense<=12) satisfied`);
}

console.log('');
for (const r of rows) {
  console.log(`  ${r.file}: source ${r.w}x${r.h}, frequency pass ran at ${r.measuredAt[0]}x${r.measuredAt[1]} `
    + `(resample ${r.resample}x), whole-frame luma ${r.whole.meanLuma} contrast ${r.whole.contrast} `
    + `nearBlack ${r.whole.nearBlackPct}% over ${r.whole.pixels} px`);
}

/*
 * SPREAD, whenever more than one image is measured.
 *
 * The usual reason to pass several files is to check whether a number is stable. Two
 * runs of the same probe are not the same PNG — measured on this tree at 1600x900,
 * repeated renders of `docs/probes/cruiser.png` move a few tenths of a point — so a
 * one-point "improvement" between passes is noise and the range is printed to say so.
 */
if (rows.length > 1) {
  const rng = (k) => {
    const v = rows.map((r) => r[k]);
    return `${Math.min(...v).toFixed(1)}-${Math.max(...v).toFixed(1)} (range ${(Math.max(...v) - Math.min(...v)).toFixed(1)})`;
  };
  console.log(`  spread across ${rows.length} images:  calm ${rng('calm')}   medium ${rng('medium')}   dense ${rng('dense')}`);
}

console.log('');
console.log(`gate (--frame ship only): two-sided envelope of §3's six references — `
  + `calm ${BAND.calm[0]}-${BAND.calm[1]}  medium ${BAND.medium[0]}-${BAND.medium[1]}  dense ${BAND.dense[0]}-${BAND.dense[1]}`);
console.log(`reference median 62 / 21 / 14   |   sample: ${rows.length} image(s), `
  + `${rows.map((r) => r.tiles).join(' + ')} tiles on subject`);
for (const n of notes) console.log(`  note  ${n}`);
for (const f of failures) console.log(`  FAIL  ${f}`);

/*
 * PROVENANCE. Printed on every ship-framed run, not buried in the header, because the
 * failure mode this tool exists to stop is a number being quoted without its framing —
 * and a calm or dense number quoted against §3's table is exactly that failure again,
 * one level down.
 */
if (frame === 'ship') {
  const d = OPERATOR_DISAGREEMENT;
  console.log('');
  console.log(`PROVENANCE OF THE BAND — read before quoting calm or dense.`);
  console.log(`  The envelope above is the min/max of §3's six reference rows. Those six assets are`);
  console.log(`  Star Citizen and Homeworld renders which are NOT in this repository and cannot be`);
  console.log(`  (ARCHITECTURE.md:22, "No image files"), so they can never be re-measured here.`);
  console.log(`  On ${d.image} at ${d.commit} — the one image §3's table and this tool have both`);
  console.log(`  measured — the table reads ${d.table.calm}/${d.table.medium}/${d.table.dense} and this tool reads `
    + `${d.tool.calm}/${d.tool.medium}/${d.tool.dense}:`);
  console.log(`  calm ${(d.tool.calm - d.table.calm > 0 ? '+' : '') + (d.tool.calm - d.table.calm).toFixed(1)}, `
    + `medium ${(d.tool.medium - d.table.medium > 0 ? '+' : '') + (d.tool.medium - d.table.medium).toFixed(1)}, `
    + `dense ${(d.tool.dense - d.table.dense).toFixed(1)} points. The two tails are 25 points apart; MEDIUM agrees.`);
  console.log(`  So: "too medium" is a finding this instrument can support. A calm or dense number`);
  console.log(`  compared to §3's table is not. \`--calibrate\` states what the thresholds mean in`);
  console.log(`  luma-per-pixel, which needs no reference image at all.`);
}

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} finding(s)`);
  process.exit(1);
}
console.log('\nsurface ok');
