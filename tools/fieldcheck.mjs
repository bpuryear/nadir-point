/**
 * FIELDCHECK — the only thing in this repository that can measure R1 and R2.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 *
 * `docs/design/space-backgrounds.md` §0.3, verified against the tree on 2026-07-30:
 *
 *   * `tools/capture.mjs:109-132` computes `meanLuma`, `contrast`, `clippedPct` and
 *     `nearBlackPct` over a 160x90 = 14400 px downscale. No median. No chroma. No hue.
 *   * No tool in `tools/` hides `world.scene`. I grepped all twenty-one:
 *       grep -l 'scene.visible' tools/*.mjs   -> nothing
 *     `widediag.mjs` hides VFX groups and post passes; it never hides the gameplay
 *     scene, so every pixel statistic in this repo is a statistic of hull + debris +
 *     plumes + field, not of the field.
 *   * R2 ("median chroma >= 0.18") has no metric definition anywhere in `src/` or
 *     `tools/`. A target measured with an undefined metric is not a target.
 *
 * So every number the background plan rests on — the 0.0261 engagement background
 * median, the 0.3777 that triggered the graveyard gain re-solve, the 0.1225 the
 * shipped gains were solved toward — came from scratchpad scripts that no longer
 * exist. This tool makes those numbers reproducible, or refutes them.
 *
 * ===========================================================================
 * WHAT IT MEASURES, AND HOW THE BACKGROUND IS ISOLATED
 * ===========================================================================
 *
 * Per shot, four renders of the same settled pose:
 *
 *   A0  the frame as HEAD renders it
 *   A1  the same frame again, nothing changed          -> the NOISE FLOOR control
 *   B   the same frame with `world.scene.visible=false` -> THE FIELD, ALONE
 *   C   the same frame with the scene restored          -> the RESIDUE control
 *
 * `world.scene` is `renderer.scene` (`src/core/world.js:15`), and `PostChain`'s
 * `mainPass` (`src/render/postfx.js:235`) is the only pass that draws it, so hiding
 * its root removes the hull, the debris, the wrecks and every VFX layer from the
 * frame while `farPass` (`postfx.js:230`) still draws `renderer.far` — dome,
 * starfield, nebula, star, gas giant — through the identical post chain: GTAO,
 * godrays, bloom, ACES, the POI grade with its vignette, SMAA. B is therefore the
 * field EXACTLY as the player sees it, not the field in some idealised pipeline.
 * That matters here: the graveyard vignette runs at 0.50, and a measurement that
 * skipped the grade would over-report the field by the vignette's own falloff.
 *
 * The HUD is DOM (`#ui-root`), not canvas, so sampling `#viewport` never contains
 * it. That is why this tool does not bother hiding it and `page.screenshot()` is
 * never used as a measurement source.
 *
 * B is the primary. The A0-vs-B difference mask is reported as a SECONDARY number —
 * "how much of the real frame the field actually reaches" — with the A0-vs-A1 noise
 * floor printed beside it, because a mask threshold nobody calibrated is a mask
 * nobody should trust. Film grain (`postfx.js:164`) is time-varying, so two
 * identical renders are not identical images.
 *
 * The sim is paused (`engine.setTimeScaleIndex(0)`) for the whole measurement and
 * restored afterwards, so A0/A1/B/C differ by the one variable each names. Render
 * systems still run while paused (`loop.js:92`), so the camera and the far scene are
 * live; only the fight is frozen.
 *
 * ===========================================================================
 * THE CHROMA METRIC. I AM CHOOSING IT. HERE IS WHAT AND WHY.
 * ===========================================================================
 *
 *     chroma C = max(R,G,B) - min(R,G,B)
 *
 * on DISPLAY-REFERRED, tone-mapped, sRGB-encoded pixel values in [0,1] — i.e. the
 * 8-bit values read straight off the canvas and divided by 255, the same pixels and
 * the same space in which `capture.mjs:120` computes luma. This is the chroma of the
 * HSL/HSV cylinder: the diameter of the RGB cube's cross-section at that pixel.
 *
 * FOUR REASONS, and the third is the one that settles it:
 *
 * 1. It is measured in the same space as the luma it is graded beside. R1 and R2 are
 *    a pair of thresholds on one pixel; expressing one in display sRGB and the other
 *    in CIELAB or Oklab means no single pixel can be reasoned about.
 *
 * 2. It is the only chroma whose units make `>= 0.12` and `>= 0.18` sane numbers
 *    without a normalising constant nobody wrote down. CIELAB C* would put the same
 *    targets at 12 and 18 on a 0..130 scale; Oklab chroma tops out near 0.4 for
 *    display-representable colours. Either would have needed a conversion factor
 *    that reference-frames.md does not contain.
 *
 * 3. IT IS THE METRIC UNDER WHICH `reference-frames.md` §2's CORRECTION IS
 *    ARITHMETICALLY TRUE, which is the strongest evidence available about what its
 *    author meant. That correction says a green field "reaches R1's median luma of
 *    0.10 at roughly G ~= 0.14 with R and B near zero, which caps its chroma at
 *    about 0.12-0.14". With R=B=0 and G=0.14: max-min = 0.14 - 0 = 0.14. Exact.
 *    And "a red-dominant field ... reaches luma 0.10 at R ~= 0.47 and has enormous
 *    chroma headroom": max-min = 0.47. Exact. No other candidate metric reproduces
 *    both numbers. (Check the luma too: 0.10/0.7152 = 0.1398 and 0.10/0.2126 =
 *    0.4704 — so that document also applies the Rec.709 weights to DISPLAY values,
 *    exactly as `capture.mjs` does. The two choices are one choice.)
 *
 * 4. It is monotone in what the eye calls saturation at fixed luma and it is
 *    invariant to the two achromatic noise sources in this pipeline: film grain
 *    (`postfx.js:165`, a scalar added to all three channels) and the Bayer dither
 *    (`postfx.js:167`, likewise). Adding the same constant to R, G and B leaves
 *    max-min unchanged. So chroma here is not a noise measurement.
 *
 * WHAT IT IS NOT. It is not perceptually uniform: C = 0.12 in yellow and C = 0.12 in
 * blue do not look equally colourful. R2 is already stated per-hue, so this does not
 * bite — but nobody should later average this chroma across hues and call the result
 * a saturation.
 *
 * HUE is the matching HSV hue in degrees, from the same max/min, undefined and
 * skipped where C = 0. The "hue band" is the NARROWEST CONTIGUOUS ARC containing 80%
 * of the frame's total chroma mass (each pixel contributes its own C as weight), so
 * a huge population of near-grey pixels cannot vote a hue band into existence. R2's
 * "<= 60 degrees wide" is read against that arc.
 *
 * ===========================================================================
 * USAGE
 * ===========================================================================
 *
 *   node tools/fieldcheck.mjs                      all shots; GATE (exit 1 on a miss)
 *   node tools/fieldcheck.mjs engagement
 *   node tools/fieldcheck.mjs engagement,wide,close
 *   node tools/fieldcheck.mjs engagement --report  measure only, always exit 0
 *   node tools/fieldcheck.mjs engagement --dome    + F2, the dome elevation probe
 *   node tools/fieldcheck.mjs engagement --alpha   + F5, the nebula alpha readback
 *   node tools/fieldcheck.mjs engagement --attrib + which far-scene object carries it
 *   node tools/fieldcheck.mjs engagement --no-pause    leave the sim running
 *   node tools/fieldcheck.mjs engagement --json
 *   node tools/fieldcheck.mjs engagement --width 2560 --height 1440
 *
 * It is a GATE by default: any shot missing R1 or R2 sets exit code 1. On HEAD it is
 * EXPECTED TO FAIL — that is the wave's whole premise. It is a TARGET gate, not a
 * regression gate, and it must not be wired into `npm run smoke` until the targets
 * are met.
 *
 * THE SHOT'S OWN QUERY IS HONOURED. `widediag.mjs`'s header records what happens
 * otherwise: it hard-coded `capture=1` while `shots.json` pins five shots to
 * `poi=giant-orbit`, so every number it printed for those five was measured at the
 * boot-default POI under a different key light, a different palette and a different
 * celestial set. Same construction as `widediag.mjs:272` and `capture.mjs:49`.
 */
import { readFile } from 'node:fs/promises';
import { startServer, stopServer, launchBrowser, openGame, rasterMode } from './harness.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
}

const WIDTH = Number(opt('width', 1600));
const HEIGHT = Number(opt('height', 900));
const wantJSON = flags.has('--json');
const wantDome = flags.has('--dome');
const wantAlpha = flags.has('--alpha');
const wantAttrib = flags.has('--attrib');
const noPause = flags.has('--no-pause');
const reportOnly = flags.has('--report');

/**
 * Difference threshold for the A-vs-B occlusion mask, in 8-bit levels, on the
 * largest of the three channel differences.
 *
 * NOT GUESSED. Film grain is `+- 0.028 * 0.5` at black (`postfx.js:93,165`) which is
 * +-3.6/255, and the ordered dither adds up to 1/255 (`postfx.js:167`) — but the
 * dither is a function of `gl_FragCoord` alone and so is identical between two
 * renders, while the grain is a function of `fract(time)` and is not. Two renders of
 * an unchanged frame therefore differ by up to ~7 levels from grain alone. 12 sits
 * above that with margin, and the A0-vs-A1 control PRINTS the residual so the choice
 * is auditable rather than asserted.
 */
const DIFF_THRESHOLD = 12;

/** R1 and R2, transcribed from docs/design/reference-frames.md §2 and its correction. */
const TARGETS = {
  medianLuma: 0.10,
  pctAbove: 40,          // percent of frame above luma 0.06
  lumaFloor: 0.06,
  chromaGreen: 0.12,     // green-dominant field
  chromaOther: 0.18,     // red / blue / magenta / teal-dominant field
  hueBandDeg: 60,
  hueBandMass: 0.80,     // the arc must contain this share of total chroma mass
  /** Green-dominant means the chroma-weighted circular mean hue lands in here. */
  greenBand: [75, 165],
};

/**
 * THE PAGE-SIDE INSTRUMENT.
 *
 * Installed once per page. Everything expensive happens here; only aggregates cross
 * the bridge, so a 1.44 Mpx frame costs one small JSON round trip and not 5.7 MB.
 *
 * Full canvas resolution, no downscale, no filtering: `drawImage` at 1:1 into a 2D
 * canvas and `getImageData`. `capture.mjs` box-filters 1600x900 down to 160x90,
 * which averages 100 source pixels into one and pulls chroma toward grey; that is
 * fine for its contrast guard and wrong for a chroma median.
 */
const INSTRUMENT_SRC = String.raw`() => {
  const LW = [0.2126, 0.7152, 0.0722];   // capture.mjs:120, applied to display values
  const LBINS = 4096;
  const CBINS = 4096;
  const store = {};

  function surface() {
    const src = document.getElementById('viewport');
    const w = src.width, h = src.height;
    let t = store.__scratch;
    if (!t || t.width !== w || t.height !== h) {
      t = document.createElement('canvas');
      t.width = w; t.height = h;
      store.__scratch = t;
      store.__scratchCtx = t.getContext('2d', { willReadFrequently: true });
    }
    const g = store.__scratchCtx;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    g.drawImage(src, 0, 0);
    return { data: g.getImageData(0, 0, w, h).data, w, h };
  }

  /**
   * The camera pose is recorded WITH every snapshot. Two frames of a moving camera
   * are two different pictures, and a difference mask between them measures the
   * camera, not the hull. The cinematic shot chases the player at render rate, and
   * render systems keep running while the sim is paused (loop.js:92), so this is not
   * hypothetical: it is the one shot in shots.json where the mask must be discarded.
   */
  function pose() {
    const c = window.__NADIR.renderer.farCamera;
    return {
      q: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
      p: [c.position.x, c.position.y, c.position.z],
    };
  }

  function snap(key) {
    const s = surface();
    s.pose = pose();
    store[key] = s;
    return { key, w: s.w, h: s.h, samples: s.w * s.h };
  }

  /** Angle between two recorded poses, in degrees. */
  function drift(ka, kb) {
    const a = store[ka].pose.q, b = store[kb].pose.q;
    let d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    if (d > 1) d = 1;
    return +(2 * Math.acos(d) * 180 / Math.PI).toFixed(4);
  }

  function pct(hist, total, q) {
    const want = total * q;
    let acc = 0;
    for (let i = 0; i < hist.length; i++) {
      acc += hist[i];
      if (acc >= want) return (i + 0.5) / hist.length;
    }
    return 1;
  }

  /**
   * @param key       which snapshot
   * @param maskKeys  optional [a,b,thr] -> only count pixels where a and b agree
   */
  function stats(key, maskKeys) {
    const s = store[key];
    if (!s) throw new Error('no snapshot ' + key);
    const d = s.data;
    let mask = null, ma = null, mb = null, thr = 0;
    if (maskKeys) { ma = store[maskKeys[0]].data; mb = store[maskKeys[1]].data; thr = maskKeys[2]; mask = true; }

    const lhist = new Float64Array(LBINS);
    const chist = new Float64Array(CBINS);
    const hhist = new Float64Array(360);   // chroma-weighted
    const hcount = new Float64Array(360);  // population, for reference
    let n = 0, above = 0, lsum = 0, csum = 0, cmass = 0, hx = 0, hy = 0;
    let rsum = 0, gsum = 0, bsum = 0;

    for (let i = 0; i < d.length; i += 4) {
      if (mask) {
        const dr = Math.abs(ma[i] - mb[i]);
        const dg = Math.abs(ma[i + 1] - mb[i + 1]);
        const db = Math.abs(ma[i + 2] - mb[i + 2]);
        if (dr > thr || dg > thr || db > thr) continue;   // occluded by the gameplay scene
      }
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const l = LW[0] * R + LW[1] * G + LW[2] * B;
      const mx = R > G ? (R > B ? R : B) : (G > B ? G : B);
      const mn = R < G ? (R < B ? R : B) : (G < B ? G : B);
      const c = mx - mn;

      n++;
      lsum += l; csum += c;
      rsum += R; gsum += G; bsum += B;
      if (l > 0.06) above++;
      let li = (l * LBINS) | 0; if (li >= LBINS) li = LBINS - 1; if (li < 0) li = 0;
      lhist[li]++;
      let ci = (c * CBINS) | 0; if (ci >= CBINS) ci = CBINS - 1;
      chist[ci]++;

      if (c > 0) {
        let hdeg;
        if (mx === R) hdeg = 60 * (((G - B) / c) % 6);
        else if (mx === G) hdeg = 60 * ((B - R) / c + 2);
        else hdeg = 60 * ((R - G) / c + 4);
        if (hdeg < 0) hdeg += 360;
        let hi = hdeg | 0; if (hi >= 360) hi = 359;
        hhist[hi] += c;
        hcount[hi]++;
        cmass += c;
        const rad = hdeg * Math.PI / 180;
        hx += c * Math.cos(rad); hy += c * Math.sin(rad);
      }
    }

    if (n === 0) return { samples: 0, empty: true };

    // Narrowest contiguous arc holding a given share of the chroma mass.
    function arc(share) {
      const want = cmass * share;
      let best = 361, bestStart = 0;
      let acc = 0, j = 0;
      for (let i = 0; i < 360; i++) {
        if (j < i) { j = i; acc = 0; }
        while (acc < want && j - i < 360) { acc += hhist[j % 360]; j++; }
        if (acc >= want && (j - i) < best) { best = j - i; bestStart = i; }
        acc -= hhist[i % 360];
      }
      return { widthDeg: best > 360 ? 360 : best, startDeg: bestStart % 360 };
    }

    let peak = 0, peakBin = 0;
    for (let i = 0; i < 360; i++) if (hhist[i] > peak) { peak = hhist[i]; peakBin = i; }

    let meanHue = null;
    if (cmass > 0) {
      meanHue = Math.atan2(hy, hx) * 180 / Math.PI;
      if (meanHue < 0) meanHue += 360;
    }

    const r4 = (v) => +v.toFixed(4);
    return {
      samples: n,
      medianLuma: r4(pct(lhist, n, 0.50)),
      meanLuma: r4(lsum / n),
      pctAbove006: +(above / n * 100).toFixed(2),
      ladder: {
        p05: r4(pct(lhist, n, 0.05)), p25: r4(pct(lhist, n, 0.25)),
        p50: r4(pct(lhist, n, 0.50)), p75: r4(pct(lhist, n, 0.75)),
        p95: r4(pct(lhist, n, 0.95)),
      },
      medianChroma: r4(pct(chist, n, 0.50)),
      meanChroma: r4(csum / n),
      chromaLadder: {
        p05: r4(pct(chist, n, 0.05)), p25: r4(pct(chist, n, 0.25)),
        p50: r4(pct(chist, n, 0.50)), p75: r4(pct(chist, n, 0.75)),
        p95: r4(pct(chist, n, 0.95)),
      },
      meanRGB: [r4(rsum / n), r4(gsum / n), r4(bsum / n)],
      hueMeanDeg: meanHue === null ? null : +meanHue.toFixed(1),
      hueModeDeg: peakBin + 0.5,
      hueBand80: arc(0.80),
      hueBand90: arc(0.90),
      chromaMass: r4(cmass / n),
    };
  }

  /**
   * HUE AND CHROMA BY VALUE TIER.
   *
   * The owner's ruling on the hue fork is "blend rust and green, SEPARATED BY VALUE
   * AND STRUCTURE - not mixed", with green as the luminous core and rust as the dark
   * occluding dust in front of it. The failure mode named is mud: two hues at similar
   * value averaging to grey. A single frame-wide hue mean cannot see that at all - a
   * perfectly separated field and a perfectly muddy one can report the same mean.
   *
   * So the field is cut at its own p33 and p67 luma and each tier is reported
   * separately. A field that obeys the ruling shows two hue clusters far apart with
   * the warm one in the DARK tier; a muddy one shows one hue in all three. This is
   * also the only readout that can grade R5 ("dark masses carry the warm accent").
   */
  function tiers(key, maskKeys) {
    const s = store[key];
    const d = s.data;
    let ma = null, mb = null, thr = 0, mask = false;
    if (maskKeys) { ma = store[maskKeys[0]].data; mb = store[maskKeys[1]].data; thr = maskKeys[2]; mask = true; }
    const keep = (i) => {
      if (!mask) return true;
      return !(Math.abs(ma[i] - mb[i]) > thr || Math.abs(ma[i + 1] - mb[i + 1]) > thr || Math.abs(ma[i + 2] - mb[i + 2]) > thr);
    };
    const lum = (i) => (LW[0] * d[i] + LW[1] * d[i + 1] + LW[2] * d[i + 2]) / 255;

    const lhist = new Float64Array(LBINS);
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!keep(i)) continue;
      let li = (lum(i) * LBINS) | 0; if (li >= LBINS) li = LBINS - 1; if (li < 0) li = 0;
      lhist[li]++; n++;
    }
    if (!n) return { empty: true };
    const at = (q) => { const want = n * q; let acc = 0; for (let i = 0; i < LBINS; i++) { acc += lhist[i]; if (acc >= want) return (i + 0.5) / LBINS; } return 1; };
    const t1 = at(1 / 3), t2 = at(2 / 3);

    const T = [0, 1, 2].map(() => ({ n: 0, l: 0, c: 0, cm: 0, hx: 0, hy: 0, ch: new Float64Array(CBINS) }));
    for (let i = 0; i < d.length; i += 4) {
      if (!keep(i)) continue;
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const l = LW[0] * R + LW[1] * G + LW[2] * B;
      const k = l < t1 ? 0 : (l < t2 ? 1 : 2);
      const t = T[k];
      const mx = R > G ? (R > B ? R : B) : (G > B ? G : B);
      const mn = R < G ? (R < B ? R : B) : (G < B ? G : B);
      const c = mx - mn;
      t.n++; t.l += l; t.c += c;
      let ci = (c * CBINS) | 0; if (ci >= CBINS) ci = CBINS - 1;
      t.ch[ci]++;
      if (c > 0) {
        let hdeg;
        if (mx === R) hdeg = 60 * (((G - B) / c) % 6);
        else if (mx === G) hdeg = 60 * ((B - R) / c + 2);
        else hdeg = 60 * ((R - G) / c + 4);
        if (hdeg < 0) hdeg += 360;
        const rad = hdeg * Math.PI / 180;
        t.cm += c; t.hx += c * Math.cos(rad); t.hy += c * Math.sin(rad);
      }
    }
    const r4 = (v) => +v.toFixed(4);
    return {
      thresholds: [r4(t1), r4(t2)],
      tiers: ['dark', 'mid', 'bright'].map((name, k) => {
        const t = T[k];
        if (!t.n) return { name, samples: 0 };
        let h = null;
        if (t.cm > 0) { h = Math.atan2(t.hy, t.hx) * 180 / Math.PI; if (h < 0) h += 360; }
        let acc = 0, med = 0;
        for (let i = 0; i < CBINS; i++) { acc += t.ch[i]; if (acc >= t.n * 0.5) { med = (i + 0.5) / CBINS; break; } }
        return {
          name, samples: t.n,
          sharePct: +(t.n / n * 100).toFixed(2),
          meanLuma: r4(t.l / t.n),
          medianChroma: r4(med),
          meanChroma: r4(t.c / t.n),
          hueMeanDeg: h === null ? null : +h.toFixed(1),
        };
      }),
    };
  }

  /** Fraction of pixels where two snapshots disagree by more than thr on any channel. */
  function diff(ka, kb, thr) {
    const a = store[ka].data, b = store[kb].data;
    let n = 0, changed = 0, maxd = 0, sumd = 0;
    for (let i = 0; i < a.length; i += 4) {
      const dr = Math.abs(a[i] - b[i]), dg = Math.abs(a[i + 1] - b[i + 1]), db = Math.abs(a[i + 2] - b[i + 2]);
      const m = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
      n++; sumd += m; if (m > maxd) maxd = m;
      if (m > thr) changed++;
    }
    return {
      samples: n,
      changedPct: +(changed / n * 100).toFixed(2),
      meanAbsDiff: +(sumd / n).toFixed(3),
      maxAbsDiff: maxd,
      thresholdLevels: thr,
    };
  }

  window.__FC = { snap, stats, tiers, diff, drift, store };
  return true;
}`;

/**
 * ATTRIBUTION. Which object in `renderer.far` is actually carrying the field?
 *
 * "R1 is closed" and "R1 is closed BY THE DOME" are different findings and they gate
 * different build items. This is a single-variable sweep over the far scene with the
 * gameplay scene already hidden: each celestial part is switched off alone, the field
 * is re-measured, and the part is switched back on. The dome gets a second probe that
 * zeroes its two gain uniforms rather than hiding the mesh, because `uGain` and
 * `uBase` are what item 1 proposes to change.
 *
 * Same discipline as `widediag.mjs --bisect`: one named toggle, one number, reverted
 * before the next, and a baseline re-measured at the end to prove no residue.
 */
const ATTRIB_SRC = String.raw`() => {
  const N = window.__NADIR;
  const parts = N.world.systems.celestials?.parts ?? {};
  const list = [];
  const vis = (o, id) => { if (o) list.push({ id, apply: () => { o.visible = false; }, revert: () => { o.visible = true; } }); };
  vis(parts.dome?.object, 'far:dome');
  vis(parts.starfield?.object, 'far:starfield');
  vis(parts.nebula?.object, 'far:nebula');
  vis(parts.star?.object, 'far:star');
  vis(parts.giant?.object, 'far:giant');
  const dm = parts.dome?.material;
  if (dm) {
    let g0 = 0, b0 = 0;
    list.push({
      id: 'dome:gains=0',
      apply: () => { g0 = dm.uniforms.uGain.value; b0 = dm.uniforms.uBase.value; dm.uniforms.uGain.value = 0; dm.uniforms.uBase.value = 0; },
      revert: () => { dm.uniforms.uGain.value = g0; dm.uniforms.uBase.value = b0; },
    });
    list.push({
      id: 'dome:lobe=0',
      apply: () => { g0 = dm.uniforms.uGain.value; dm.uniforms.uGain.value = 0; },
      revert: () => { dm.uniforms.uGain.value = g0; },
    });
  }
  window.__FC_ATTRIB = list;
  return list.map((p) => p.id);
}`;

/**
 * F2 — THE DOME ELEVATION PROBE.
 *
 * `space-backgrounds.md` §0.2 claims `skydome.js:128`'s floor term peaks at the
 * horizon — the one elevation the tactical camera cannot see at gameplay zoom — and
 * predicts an 87% -> 38% -> 30% share-of-peak profile across the `engagement` frame.
 * That claim is arithmetic on a shader someone read. This evaluates the SHIPPED
 * fragment body against the LIVE far camera and the LIVE uniforms.
 *
 * It reads uniforms rather than re-deriving colours, so a POI retune cannot silently
 * invalidate it, and it reports linear scene radiance so the answer is directly
 * comparable to §1.1's calibration (0.0245 linear = display luma 0.10).
 *
 * `col()` (`celestials/common.js:72`) builds THREE.Color from an sRGB hex under
 * three.js colour management, so `uCore/uZenith/uGround` .r/.g/.b ARE linear.
 */
const DOME_SRC = String.raw`() => {
  const N = window.__NADIR, THREE = N.THREE;
  const r = N.world.renderer;
  const dome = N.world.systems.celestials?.parts?.dome;
  if (!dome) return { present: false };
  const u = dome.material.uniforms;
  const cam = r.farCamera;
  cam.updateMatrixWorld(true);

  const smoothstep = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const axis = u.uAxis.value, lobe = u.uLobe.value;
  const core = u.uCore.value, zen = u.uZenith.value, gnd = u.uGround.value;
  const gain = u.uGain.value, base = u.uBase.value;

  const dirAt = (ndcX, ndcY) => {
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
    return v;
  };

  /** The shipped fragment body, term by term. */
  const evalDome = (d) => {
    const b = 1.0 - smoothstep(0.06, 0.92, Math.abs(d.y));
    const bandTerm = 0.30 + 0.70 * b * b;             // peaks at 1.00 when d.y = 0
    const m = smoothstep(-0.55, 0.55, d.y);
    const bx = gnd.r + (zen.r - gnd.r) * m;
    const by = gnd.g + (zen.g - gnd.g) * m;
    const bz = gnd.b + (zen.b - gnd.b) * m;
    let cr = bx * bandTerm * base, cg = by * bandTerm * base, cb = bz * bandTerm * base;
    const dot = d.x * axis.x + d.y * axis.y + d.z * axis.z;
    const t = smoothstep(lobe.x, lobe.y, dot);
    const lt = t * t * gain;
    cr += core.r * lt; cg += core.g * lt; cb += core.b * lt;
    return {
      dy: +d.y.toFixed(4),
      elevationDeg: +(Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI).toFixed(2),
      bandTerm: +bandTerm.toFixed(4),
      shareOfBandPeak: +(bandTerm / 1.0 * 100).toFixed(1),
      lobeTerm: +lt.toFixed(5),
      linearLuma: +(0.2126 * cr + 0.7152 * cg + 0.0722 * cb).toFixed(6),
      linearRGB: [+cr.toFixed(5), +cg.toFixed(5), +cb.toFixed(5)],
    };
  };

  // The vertical centre column, top edge to bottom edge: the profile §0.2 predicts.
  const column = [];
  for (let i = 0; i <= 20; i++) {
    const ndcY = 1 - (i / 20) * 2;
    column.push({ ndcY: +ndcY.toFixed(2), ...evalDome(dirAt(0, ndcY)) });
  }

  // The whole frame, on a grid: a share-of-peak number for the frame, not a line.
  const grid = [];
  for (let iy = 0; iy <= 16; iy++) {
    for (let ix = 0; ix <= 16; ix++) {
      grid.push(evalDome(dirAt(-1 + ix / 8, 1 - iy / 8)));
    }
  }
  const shares = grid.map((g) => g.shareOfBandPeak);
  const elevs = grid.map((g) => g.elevationDeg);
  const lin = grid.map((g) => g.linearLuma);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
  const tac = N.world.systems.tactical;

  return {
    present: true,
    uniforms: {
      uGain: gain, uBase: base,
      uAxis: axis.toArray().map((v) => +v.toFixed(4)),
      uLobe: [+lobe.x.toFixed(4), +lobe.y.toFixed(4)],
      uCoreLinear: [core.r, core.g, core.b].map((v) => +v.toFixed(5)),
      uZenithLinear: [zen.r, zen.g, zen.b].map((v) => +v.toFixed(5)),
      uGroundLinear: [gnd.r, gnd.g, gnd.b].map((v) => +v.toFixed(5)),
    },
    camera: {
      fov: cam.fov, aspect: +cam.aspect.toFixed(4),
      forward: fwd.toArray().map((v) => +v.toFixed(4)),
      viewElevationDeg: +(Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180 / Math.PI).toFixed(2),
      zoomT: tac ? +tac.zoomT.toFixed(3) : null,
      pitchOffset: tac ? +tac.pitchOffset.toFixed(3) : null,
    },
    column,
    frame: {
      gridSamples: grid.length,
      elevationDegMin: +Math.min(...elevs).toFixed(2),
      elevationDegMax: +Math.max(...elevs).toFixed(2),
      shareOfBandPeakMin: +Math.min(...shares).toFixed(1),
      shareOfBandPeakMean: +avg(shares).toFixed(1),
      shareOfBandPeakMax: +Math.max(...shares).toFixed(1),
      linearLumaMin: +Math.min(...lin).toFixed(6),
      linearLumaMean: +avg(lin).toFixed(6),
      linearLumaMax: +Math.max(...lin).toFixed(6),
    },
  };
}`;

/**
 * F5 — THE ALPHA RECONCILIATION.
 *
 * Two research reports differ 5-20x on `neb-a`'s mean alpha and 2-6x on its max
 * (`space-backgrounds.md` D3). Both computed it; neither read it back off the shipped
 * texture. This reads the REAL `CanvasTexture` built by `buildNebula()` in the live
 * game, through the SOURCE canvas's own 2D context — not by re-drawing it into a
 * fresh canvas, which would round-trip the premultiply a second time and manufacture
 * damage that the GPU never sees.
 *
 * It also settles Cause C in the same read: `nebula.js:86` authors R = 255 for EVERY
 * texel, unconditionally. Anything less than 255 coming back is the canvas
 * premultiply round trip destroying colour at low alpha, and the size of the loss as
 * a function of alpha is printed rather than argued.
 */
const ALPHA_SRC = String.raw`() => {
  const N = window.__NADIR;
  const neb = N.world.systems.celestials?.parts?.nebula;
  if (!neb) return { present: false };

  const seen = new Map();
  for (const m of neb.materials) {
    const t = m.uniforms?.uMap?.value;
    if (t && !seen.has(t.name)) seen.set(t.name, t);
  }

  const out = [];
  for (const [name, tex] of seen) {
    const img = tex.image;
    if (!img || typeof img.getContext !== 'function') { out.push({ name, error: 'image is not a canvas' }); continue; }
    const w = img.width, h = img.height;
    const d = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;

    const n = w * h;
    const ahist = new Float64Array(256);
    let asum = 0, amax = 0, nonzero = 0;
    // Cause C: authored R is 255 everywhere. Bucket the returned R by alpha.
    const buckets = [[1, 4], [5, 8], [9, 16], [17, 32], [33, 64], [65, 128], [129, 255]];
    const bstat = buckets.map(() => ({ n: 0, rsum: 0, rmin: 255, gsum: 0, bsum: 0 }));

    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      ahist[a]++;
      asum += a;
      if (a > amax) amax = a;
      if (a > 0) {
        nonzero++;
        for (let k = 0; k < buckets.length; k++) {
          if (a >= buckets[k][0] && a <= buckets[k][1]) {
            const s = bstat[k];
            s.n++; s.rsum += d[i]; s.gsum += d[i + 1]; s.bsum += d[i + 2];
            if (d[i] < s.rmin) s.rmin = d[i];
            break;
          }
        }
      }
    }

    const q = (p) => {
      const want = n * p; let acc = 0;
      for (let a = 0; a < 256; a++) { acc += ahist[a]; if (acc >= want) return a; }
      return 255;
    };

    out.push({
      name, size: [w, h], texels: n,
      meanAlpha255: +(asum / n).toFixed(4),
      meanAlpha01: +(asum / n / 255).toFixed(6),
      maxAlpha255: amax,
      maxAlpha01: +(amax / 255).toFixed(4),
      zeroAlphaPct: +((n - nonzero) / n * 100).toFixed(2),
      meanAlphaOverNonZero01: nonzero ? +(asum / nonzero / 255).toFixed(6) : 0,
      alphaPercentiles255: { p50: q(0.5), p90: q(0.9), p99: q(0.99), p999: q(0.999) },
      // authored R = 255 for every texel (nebula.js:86)
      causeC: buckets.map((b, k) => ({
        alpha255: b[0] === b[1] ? String(b[0]) : b[0] + '-' + b[1],
        texels: bstat[k].n,
        meanR: bstat[k].n ? +(bstat[k].rsum / bstat[k].n).toFixed(1) : null,
        minR: bstat[k].n ? bstat[k].rmin : null,
        meanG: bstat[k].n ? +(bstat[k].gsum / bstat[k].n).toFixed(1) : null,
        meanB: bstat[k].n ? +(bstat[k].bsum / bstat[k].n).toFixed(1) : null,
      })).filter((r) => r.texels > 0),
    });
  }
  return { present: true, sheets: out };
}`;

async function settle(page, frames = 6) {
  await page.evaluate((n) => new Promise((resolve) => {
    let i = 0;
    const step = () => (++i >= n ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), frames);
}

function greenDominant(hue) {
  return hue !== null && hue >= TARGETS.greenBand[0] && hue < TARGETS.greenBand[1];
}

function grade(s) {
  const fails = [];
  const green = greenDominant(s.hueMeanDeg);
  const chromaTarget = green ? TARGETS.chromaGreen : TARGETS.chromaOther;
  if (s.medianLuma < TARGETS.medianLuma) fails.push(`R1 median luma ${s.medianLuma.toFixed(4)} < ${TARGETS.medianLuma}`);
  if (s.pctAbove006 < TARGETS.pctAbove) fails.push(`R1 above-${TARGETS.lumaFloor} ${s.pctAbove006}% < ${TARGETS.pctAbove}%`);
  if (s.medianChroma < chromaTarget) fails.push(`R2 median chroma ${s.medianChroma.toFixed(4)} < ${chromaTarget} (${green ? 'green-dominant' : 'non-green'})`);
  if (s.hueBand80.widthDeg > TARGETS.hueBandDeg) fails.push(`R2 hue band ${s.hueBand80.widthDeg} deg > ${TARGETS.hueBandDeg} deg`);
  return { fails, green, chromaTarget };
}

const port = Number(process.env.PORT || 5197);
let server, browser, failures = 0;
const summary = [];

try {
  const shots = JSON.parse(await readFile(new URL('./shots.json', import.meta.url), 'utf8'));
  const list = Array.isArray(shots) ? shots : (shots.shots ?? []);
  const shotIds = positional.length
    ? positional[0].split(',').map((s) => s.trim()).filter(Boolean)
    : list.map((s) => s.id);

  server = await startServer({ port, mode: 'preview' });
  browser = await launchBrowser();

  console.log(`fieldcheck  raster=${rasterMode()}  viewport=${WIDTH}x${HEIGHT}  shots=${shotIds.join(',')}`);
  console.log(`chroma metric: C = max(R,G,B) - min(R,G,B) on display-referred sRGB in [0,1]. See the header.`);

  for (const shotId of shotIds) {
    const shot = list.find((s) => s.id === shotId);
    if (!shot) { console.error(`no shot "${shotId}" in tools/shots.json`); process.exit(1); }

    // The shot's OWN query. capture=1 only, for preserveDrawingBuffer.
    const query = (shot.query ? shot.query + '&' : '') + 'capture=1';
    const { page, booted, bootError, consoleErrors, pageErrors } = await openGame(browser, server.url, {
      width: WIDTH, height: HEIGHT, query, settleFrames: shot.settle ?? 40,
    });
    if (!booted) { console.error(`shot ${shotId}: BOOT FAILED\n${bootError}`); process.exit(1); }

    if (shot.setup) {
      await page.evaluate((src) => new Function('N', `return (async () => { ${src} })()`)(window.__NADIR), shot.setup);
      await settle(page, shot.settleAfterSetup ?? 45);
    }

    await page.evaluate((src) => (new Function('return ' + src))()(), INSTRUMENT_SRC);

    // Which POI did this page actually boot at? Two independent reads, as widediag does.
    const where = await page.evaluate(() => {
      const w = window.__NADIR.world;
      const qp = new URLSearchParams(location.search).get('poi');
      let keyName = null;
      w.scene.traverse((o) => { if (o.isLight && o.name?.startsWith('poi-key:')) keyName = o.name.slice(8); });
      return {
        requestedByShot: qp ?? '(none - boot default)',
        fromKeyLightName: keyName ?? '(no poi key light)',
        canvas: [document.getElementById('viewport').width, document.getElementById('viewport').height],
        pixelRatio: window.devicePixelRatio,
        exposure: +(w.renderer.renderer.toneMappingExposure ?? 0).toFixed(4),
        vignette: +(w.renderer.post?.grade?.uniforms?.vignette?.value ?? 0).toFixed(4),
        farBackground: w.renderer.far.background ? '#' + w.renderer.far.background.getHexString() : 'null',
      };
    });

    // Freeze the fight. Render systems keep running while paused (loop.js:92), so the
    // camera and the far scene stay live; only the sim stops, which is what makes
    // A0/A1/B/C differ by one variable each.
    const paused = await page.evaluate((skip) => {
      const e = window.__NADIR.engine;
      const before = e.timeScaleIndex;
      if (!skip) e.setTimeScaleIndex(0);
      return { before, now: e.timeScale, paused: e.paused, skipped: !!skip };
    }, noPause);
    await settle(page, 6);

    const snapA0 = await page.evaluate(() => window.__FC.snap('A0'));
    await settle(page, 4);
    await page.evaluate(() => window.__FC.snap('A1'));

    // ---- THE ISOLATION -------------------------------------------------------
    const hidden = await page.evaluate(() => {
      const w = window.__NADIR.world;
      const was = w.scene.visible;
      w.scene.visible = false;
      return { was, now: w.scene.visible, sceneIsRendererScene: w.scene === w.renderer.scene };
    });
    await settle(page, 8);
    await page.evaluate(() => window.__FC.snap('B'));

    await page.evaluate(() => { window.__NADIR.world.scene.visible = true; });
    await settle(page, 8);
    await page.evaluate(() => window.__FC.snap('C'));

    const [full, field, fieldVisible, noise, occl, residue, drift, tiers] = await Promise.all([
      page.evaluate(() => window.__FC.stats('A0')),
      page.evaluate(() => window.__FC.stats('B')),
      page.evaluate((thr) => window.__FC.stats('B', ['A0', 'B', thr]), DIFF_THRESHOLD),
      page.evaluate((thr) => window.__FC.diff('A0', 'A1', thr), DIFF_THRESHOLD),
      page.evaluate((thr) => window.__FC.diff('A0', 'B', thr), DIFF_THRESHOLD),
      page.evaluate((thr) => window.__FC.diff('A0', 'C', thr), DIFF_THRESHOLD),
      page.evaluate(() => ({
        A1: window.__FC.drift('A0', 'A1'),
        B: window.__FC.drift('A0', 'B'),
        C: window.__FC.drift('A0', 'C'),
      })),
      page.evaluate(() => window.__FC.tiers('B')),
    ]);
    /**
     * A mask built between two different camera poses measures the camera. Anything
     * past a tenth of a degree and the mask, the noise floor and the residue are all
     * meaningless — the field statistics from B are still valid for B's own pose.
     */
    const CAMERA_STABLE_DEG = 0.1;
    const cameraStable = drift.A1 <= CAMERA_STABLE_DEG && drift.B <= CAMERA_STABLE_DEG && drift.C <= CAMERA_STABLE_DEG;

    const g = grade(field);
    if (g.fails.length) failures++;

    // ---- report --------------------------------------------------------------
    console.log(`\n=== ${shotId} ===`);
    console.log(`query="${query}"  POI: shot asked "${where.requestedByShot}", key light says "${where.fromKeyLightName}"`
      + (where.requestedByShot !== '(none - boot default)' && where.requestedByShot !== where.fromKeyLightName ? '  !! MISMATCH' : ''));
    console.log(`canvas ${where.canvas[0]}x${where.canvas[1]} (dpr ${where.pixelRatio})  exposure ${where.exposure}  vignette ${where.vignette}  far.background ${where.farBackground}`);
    console.log(`sim paused: timeScaleIndex ${paused.before} -> ${paused.now}x   world.scene === renderer.scene: ${hidden.sceneIsRendererScene}`);
    console.log(`SAMPLE  N = ${field.samples} px per statistic (full canvas, 1:1, no downscale)`);
    console.log('');
    console.log(`FULL FRAME (HEAD, hull + debris + VFX + field)`);
    console.log(`  median luma ${full.medianLuma.toFixed(4)}   mean ${full.meanLuma.toFixed(4)}   above 0.06 ${full.pctAbove006}%   median chroma ${full.medianChroma.toFixed(4)}`);
    console.log('');
    console.log(`FIELD ONLY (world.scene hidden; renderer.far through the full post chain)   <- R1/R2 ARE GRADED HERE`);
    console.log(`  median luma      ${field.medianLuma.toFixed(4)}   target >= ${TARGETS.medianLuma}    ${field.medianLuma >= TARGETS.medianLuma ? 'PASS' : 'FAIL'}`);
    console.log(`  % above 0.06     ${String(field.pctAbove006).padStart(6)}%   target >= ${TARGETS.pctAbove}%    ${field.pctAbove006 >= TARGETS.pctAbove ? 'PASS' : 'FAIL'}`);
    console.log(`  median chroma    ${field.medianChroma.toFixed(4)}   target >= ${g.chromaTarget}   ${field.medianChroma >= g.chromaTarget ? 'PASS' : 'FAIL'}  (${g.green ? 'green-dominant' : 'non-green'})`);
    console.log(`  hue band (80%)   ${String(field.hueBand80.widthDeg).padStart(6)} deg   target <= ${TARGETS.hueBandDeg} deg  ${field.hueBand80.widthDeg <= TARGETS.hueBandDeg ? 'PASS' : 'FAIL'}   [${field.hueBand80.startDeg}..${(field.hueBand80.startDeg + field.hueBand80.widthDeg) % 360}]`);
    console.log(`  hue mean ${field.hueMeanDeg} deg   hue mode ${field.hueModeDeg} deg   90% arc ${field.hueBand90.widthDeg} deg`);
    console.log(`  luma ladder      p05 ${field.ladder.p05.toFixed(4)}  p25 ${field.ladder.p25.toFixed(4)}  p50 ${field.ladder.p50.toFixed(4)}  p75 ${field.ladder.p75.toFixed(4)}  p95 ${field.ladder.p95.toFixed(4)}`);
    console.log(`  chroma ladder    p05 ${field.chromaLadder.p05.toFixed(4)}  p25 ${field.chromaLadder.p25.toFixed(4)}  p50 ${field.chromaLadder.p50.toFixed(4)}  p75 ${field.chromaLadder.p75.toFixed(4)}  p95 ${field.chromaLadder.p95.toFixed(4)}`);
    console.log(`  mean RGB         ${field.meanRGB.map((v) => v.toFixed(4)).join(' / ')}`);
    console.log(`  BY VALUE TIER    (cut at the field's own p33 ${tiers.thresholds[0]} / p67 ${tiers.thresholds[1]} luma) - this is what grades the owner's rust/green ruling and R5`);
    for (const t of tiers.tiers) {
      console.log(`    ${t.name.padEnd(7)} ${String(t.sharePct).padStart(6)}% of field   mean luma ${t.meanLuma.toFixed(4)}   median chroma ${t.medianChroma.toFixed(4)}   hue ${t.hueMeanDeg} deg   [N=${t.samples}]`);
    }
    const hues = tiers.tiers.map((t) => t.hueMeanDeg).filter((h) => h !== null);
    if (hues.length === 3) {
      const sep = Math.min(...[[0,2]].map(([a,b]) => { let d = Math.abs(hues[a]-hues[b]); return d > 180 ? 360-d : d; }));
      console.log(`    dark-to-bright hue separation ${sep.toFixed(1)} deg  ${sep < 15 ? '-> ONE HUE AT ALL VALUES: the field is a flat wash, not a value-separated blend' : '-> the tiers carry different hues'}`);
    }
    console.log('');
    console.log(`OCCLUSION MASK (secondary; how much of the real frame the field reaches)`);
    console.log(`  camera drift from A0:  A1 ${drift.A1} deg   B ${drift.B} deg   C ${drift.C} deg   -> ${cameraStable ? 'STATIC, mask is valid' : '!! CAMERA MOVED BETWEEN SNAPSHOTS - EVERY MASK NUMBER BELOW IS MEANINGLESS'}`);
    console.log(`  noise floor  A0 vs A1, nothing changed: ${noise.changedPct}% of px differ by > ${DIFF_THRESHOLD} levels (mean abs diff ${noise.meanAbsDiff}, max ${noise.maxAbsDiff})`);
    console.log(`  occluded     A0 vs B,  scene hidden:    ${occl.changedPct}% of px differ  ->  field unoccluded over ${(100 - occl.changedPct).toFixed(2)}% of frame`);
    console.log(`  residue      A0 vs C,  scene restored:  ${residue.changedPct}% of px differ  ${residue.changedPct <= noise.changedPct + 0.5 ? '(clean)' : '!! THE PROBE LEFT RESIDUE'}`);
    if (!fieldVisible.empty) {
      console.log(`  field restricted to the unoccluded mask: median luma ${fieldVisible.medianLuma.toFixed(4)}, above 0.06 ${fieldVisible.pctAbove006}%, median chroma ${fieldVisible.medianChroma.toFixed(4)}   [N=${fieldVisible.samples} px]`);
    }
    console.log('');
    if (g.fails.length) {
      console.log(`  VERDICT  FAIL`);
      for (const f of g.fails) console.log(`    ${f}`);
    } else {
      console.log(`  VERDICT  PASS  R1 and R2 both met on the field.`);
    }

    const row = { id: shotId, query, where, paused, sample: snapA0, full, field, fieldVisible, noise, occl, residue, drift, cameraStable, tiers, verdict: g.fails.length ? 'FAIL' : 'PASS', fails: g.fails, chromaTarget: g.chromaTarget, greenDominant: g.green };

    if (wantAttrib) {
      const ids = await page.evaluate((src) => (new Function('return ' + src))()(), ATTRIB_SRC);
      await page.evaluate(() => { window.__NADIR.world.scene.visible = false; });
      await settle(page, 8);
      await page.evaluate(() => window.__FC.snap('AT0'));
      const base = await page.evaluate(() => window.__FC.stats('AT0'));
      const rows = [];
      console.log(`\nATTRIBUTION  which object in renderer.far carries the field (gameplay scene hidden throughout)`);
      console.log(`  ${'probe'.padEnd(18)} ${'medLuma'.padStart(8)} ${'dLuma'.padStart(8)} ${'>0.06%'.padStart(8)} ${'medChroma'.padStart(10)} ${'hue'.padStart(7)}`);
      console.log(`  ${'(field baseline)'.padEnd(18)} ${base.medianLuma.toFixed(4).padStart(8)} ${''.padStart(8)} ${String(base.pctAbove006).padStart(8)} ${base.medianChroma.toFixed(4).padStart(10)} ${String(base.hueMeanDeg).padStart(7)}`);
      for (let i = 0; i < ids.length; i++) {
        await page.evaluate((idx) => window.__FC_ATTRIB[idx].apply(), i);
        await settle(page, 8);
        await page.evaluate(() => window.__FC.snap('AT1'));
        const m = await page.evaluate(() => window.__FC.stats('AT1'));
        await page.evaluate((idx) => window.__FC_ATTRIB[idx].revert(), i);
        await settle(page, 6);
        const d = +(m.medianLuma - base.medianLuma).toFixed(4);
        rows.push({ probe: ids[i], ...m, dMedianLuma: d });
        console.log(`  ${ids[i].padEnd(18)} ${m.medianLuma.toFixed(4).padStart(8)} ${((d >= 0 ? '+' : '') + d.toFixed(4)).padStart(8)} ${String(m.pctAbove006).padStart(8)} ${m.medianChroma.toFixed(4).padStart(10)} ${String(m.hueMeanDeg).padStart(7)}`);
      }
      await page.evaluate(() => window.__FC.snap('AT2'));
      const after = await page.evaluate(() => window.__FC.stats('AT2'));
      const res = +(after.medianLuma - base.medianLuma).toFixed(4);
      console.log(`  ${'(baseline again)'.padEnd(18)} ${after.medianLuma.toFixed(4).padStart(8)} ${((res >= 0 ? '+' : '') + res.toFixed(4)).padStart(8)}`
        + (Math.abs(res) > 0.002 ? '   !! PROBES LEFT RESIDUE - the deltas above are not single-variable' : '   (clean)'));
      await page.evaluate(() => { window.__NADIR.world.scene.visible = true; });
      await settle(page, 4);
      row.attribution = { base, rows, after, residue: res };
    }

    if (wantDome) {
      const dome = await page.evaluate((src) => (new Function('return ' + src))()(), DOME_SRC);
      row.dome = dome;
      console.log(`\nF2  DOME ELEVATION PROBE  (skydome.js:128 evaluated against the live far camera)`);
      if (!dome.present) {
        console.log(`  no dome at this POI.`);
      } else {
        console.log(`  view forward ${dome.camera.forward.join(', ')}  elevation ${dome.camera.viewElevationDeg} deg  zoomT ${dome.camera.zoomT}  pitchOffset ${dome.camera.pitchOffset}`);
        console.log(`  uGain ${dome.uniforms.uGain}  uBase ${dome.uniforms.uBase}  uAxis ${dome.uniforms.uAxis.join(', ')}`);
        console.log(`  uCore(linear)   ${dome.uniforms.uCoreLinear.join(' / ')}`);
        console.log(`  uZenith(linear) ${dome.uniforms.uZenithLinear.join(' / ')}`);
        console.log(`  uGround(linear) ${dome.uniforms.uGroundLinear.join(' / ')}`);
        console.log(`  ${'ndcY'.padStart(6)} ${'elev'.padStart(8)} ${'d.y'.padStart(9)} ${'band'.padStart(7)} ${'%peak'.padStart(7)} ${'lobe'.padStart(9)} ${'linLuma'.padStart(9)}`);
        for (const c of dome.column) {
          console.log(`  ${String(c.ndcY).padStart(6)} ${String(c.elevationDeg).padStart(8)} ${String(c.dy).padStart(9)} ${c.bandTerm.toFixed(4).padStart(7)} ${String(c.shareOfBandPeak).padStart(6)}% ${c.lobeTerm.toFixed(5).padStart(9)} ${c.linearLuma.toFixed(6).padStart(9)}`);
        }
        const f = dome.frame;
        console.log(`  FRAME over ${f.gridSamples} grid samples: elevation ${f.elevationDegMin}..${f.elevationDegMax} deg`);
        console.log(`    share of band peak  min ${f.shareOfBandPeakMin}%  mean ${f.shareOfBandPeakMean}%  max ${f.shareOfBandPeakMax}%`);
        console.log(`    dome linear luma    min ${f.linearLumaMin}  mean ${f.linearLumaMean}  max ${f.linearLumaMax}   (0.0245 linear = display luma 0.10, space-backgrounds.md 1.1)`);
        console.log(`  F2 VERDICT: ${f.shareOfBandPeakMean >= 70 ? 'REFUTED - the dome delivers >= 70% of its band peak across the frame; item 1 collapses to the un-clip' : 'CONFIRMED - the band is mis-centred on the frame'}`);
      }
    }

    if (wantAlpha) {
      const alpha = await page.evaluate((src) => (new Function('return ' + src))()(), ALPHA_SRC);
      row.alpha = alpha;
      console.log(`\nF5  NEBULA SHEET ALPHA, READ BACK FROM THE SHIPPED CanvasTexture`);
      if (!alpha.present) {
        console.log(`  no nebula at this POI.`);
      } else {
        for (const s of alpha.sheets) {
          if (s.error) { console.log(`  ${s.name}: ${s.error}`); continue; }
          console.log(`  ${s.name}  ${s.size[0]}x${s.size[1]} = ${s.texels} texels`);
          console.log(`    mean alpha ${s.meanAlpha01}  (${s.meanAlpha255}/255)   max alpha ${s.maxAlpha01} (${s.maxAlpha255}/255)`);
          console.log(`    zero-alpha ${s.zeroAlphaPct}%   mean over non-zero ${s.meanAlphaOverNonZero01}`);
          console.log(`    alpha percentiles /255: p50 ${s.alphaPercentiles255.p50}  p90 ${s.alphaPercentiles255.p90}  p99 ${s.alphaPercentiles255.p99}  p99.9 ${s.alphaPercentiles255.p999}`);
          console.log(`    Cause C (nebula.js:86 authors R = 255 for EVERY texel):`);
          console.log(`      ${'alpha'.padEnd(9)} ${'texels'.padStart(8)} ${'meanR'.padStart(7)} ${'minR'.padStart(6)} ${'meanG'.padStart(7)} ${'meanB'.padStart(7)}`);
          for (const b of s.causeC) {
            console.log(`      ${b.alpha255.padEnd(9)} ${String(b.texels).padStart(8)} ${String(b.meanR).padStart(7)} ${String(b.minR).padStart(6)} ${String(b.meanG).padStart(7)} ${String(b.meanB).padStart(7)}`);
          }
        }
      }
    }

    row.consoleErrors = (consoleErrors ?? []).filter((e) => e.startsWith('[error]')).slice(0, 10);
    row.pageErrors = (pageErrors ?? []).slice(0, 3);
    if (row.consoleErrors.length) console.log(`\nconsole errors: ${row.consoleErrors.length}\n  ${row.consoleErrors.join('\n  ')}`);
    if (row.pageErrors.length) console.log(`\npage errors:\n${row.pageErrors.join('\n')}`);

    summary.push(row);
    await page.close();
  }

  console.log(`\nFIELDCHECK SUMMARY  ${shotIds.length - failures}/${shotIds.length} shot(s) meet R1 and R2`
    + `   raster=${rasterMode()}  viewport=${WIDTH}x${HEIGHT}`);
  for (const r of summary) {
    console.log(`  ${r.id.padEnd(18)} ${r.verdict.padEnd(5)} median luma ${r.field.medianLuma.toFixed(4)}  above0.06 ${String(r.field.pctAbove006).padStart(6)}%  chroma ${r.field.medianChroma.toFixed(4)}  hue ${String(r.field.hueMeanDeg).padStart(5)} deg  band ${String(r.field.hueBand80.widthDeg).padStart(3)} deg  [N=${r.field.samples}]`);
  }

  if (wantJSON) console.log('\n' + JSON.stringify(summary.length === 1 ? summary[0] : summary, null, 2));

  if (failures && !reportOnly) {
    console.log(`\n${failures} shot(s) miss R1 or R2. This is a TARGET gate, not a regression gate:`);
    console.log(`on HEAD it is expected to fail, and it must not be wired into npm run smoke until the targets are met.`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('FIELDCHECK ERROR:', err);
  process.exit(1);
} finally {
  await browser?.close();
  await stopServer(server);
}
