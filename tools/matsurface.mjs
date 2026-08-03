/**
 * MATERIAL SURFACE MEASUREMENT — the generated maps, without booting the game.
 *
 *   node tools/matsurface.mjs                        # the six rows the fleet uses
 *   node tools/matsurface.mjs --rows module          # hull vs the salvaged module
 *   node tools/matsurface.mjs --mpp 1.556            # metres per pixel of the read
 *   node tools/matsurface.mjs --ablate pit           # zero one wear layer and re-run
 *   node tools/matsurface.mjs --json out.json
 *
 * WHY THIS EXISTS, AND WHY IT REPORTS A TAIL AND AN ORM COLUMN
 * ===========================================================
 * A tool by this name existed once, in `4e646df`. It measured MEAN albedo and a
 * frequency split, it was right about both, and the commit it justified was reverted
 * eleven minutes later for blowing the graveyard out — `bca5d10`. The reason the tool
 * did not see that coming is written into its column list here rather than into a
 * commit message, because a column list is what the next pass will actually read:
 *
 *   THE MEAN WAS HELD AND THE FRAME STILL BLEW OUT. That commit solved the derelict
 *   palette so its `meanY` column landed within 0.05 stops of where it started (it
 *   quotes 0.0621 -> 0.0600 on the module tier and 0.0562 -> 0.0577 on the debris
 *   tier). And the derelict probe's lit area still went 16.2% -> 37.6%, because BLOOM
 *   IS SOURCED BY A THRESHOLD ON THE BRIGHT TAIL and a mean is free to sit still while
 *   the tail moves. `p99` and `hotPct` are that tail. Anything that changes a wear
 *   layer's COVERAGE moves them without moving `meanY`.
 *
 *   THIS TOOL DOES NOT REPRODUCE THAT TOOL'S ABSOLUTE FIGURES AND IS NOT TRYING TO.
 *   Two deliberate differences: the maps are built through `TextureFactory` so the rng
 *   is the one the game uses rather than a seed the tool invented, and the frequency
 *   pass tiles the map up to clear `surface.mjs`'s own 120-tile floor. Both change the
 *   absolute numbers. Every figure quoted anywhere in this file was measured on THIS
 *   tool, and a row from the old one must not be compared against a row from this one.
 *
 *   AND THE ORM COLUMNS ARE HERE BECAUSE THE ORM WAS THE PRIME SUSPECT AND WAS
 *   INNOCENT. `bca5d10`'s parting diagnosis was "most likely the ORM generator in
 *   hullMaps.js dropping roughness and making fragments specular-bright". It is
 *   testable and it is false — the measurement is in the ablation table at the bottom
 *   of this header. `rough` and `metal` are printed every run so the next person can
 *   check that claim in one command instead of guessing again.
 *
 * WHAT A ROW IS
 * =============
 * One call into `hullMaps()` with the arguments a real caller passes, named after that
 * caller. Nothing here invents a material configuration: `src/art/geometry/ships/
 * common.js:99`, `src/art/geometry/modules/kit.js:90` and `src/art/geometry/ships/
 * derelict.js:1386` are quoted in the ROWS table with their line numbers, and if one of
 * them changes its arguments this tool is measuring a material nobody renders.
 *
 * THE FREQUENCY COLUMN, AND WHY IT IS RESAMPLED
 * =============================================
 * `tools/surface.mjs`'s operator — luma, central-difference gradient, 8x8 tiles,
 * calm < 0.045 / dense > 0.14 — run over the generated albedo canvas rather than over a
 * render. Its thresholds are PER PIXEL, so a tile of 512 texels covering 115.6 m and a
 * tile of 512 texels covering 16.1 m are not comparable until both are resampled to the
 * same metres per pixel. `--mpp` is that resample and it defaults to 1.556 m/px, which
 * is ship-language.md §3's own read scale (1400 m of ship across 900 px).
 *
 * The canvas is laid out 2x2 before resampling. These maps tile by construction, so
 * that is four legitimate repeats rather than a padded image, and it takes the tile
 * count over `surface.mjs`'s own 120-tile floor: a 115.6 m tile at 1.556 m/px is 74 px,
 * which alone gives 81 tiles and would report noise as art direction.
 *
 * WHAT THIS TOOL IS NOT
 * =====================
 * It is not a gate and it exits 0 on anything it can measure. The graveyard's gate is
 * `tools/derelictcheck.mjs` and it measures a RENDER; this measures the texture that
 * goes into one. A number here moving is a lead, not a verdict — see the ablation
 * below, where three of four sub-changes moved this tool's columns and only one of them
 * moved the frame.
 *
 * THE ABLATION THAT LOCATED THE 4e646df REGRESSION
 * ================================================
 * That commit was FOUR separable sub-changes landed as one. Each was applied ALONE to a
 * clean checkout of `a22dad3` in its own worktree, then run through
 * `node tools/derelictcheck.mjs` — hero shot, 1280x720, hardware raster:
 *
 *   sub-change (applied alone)                        maskLift  maskPct  dark%  gate
 *   pit size stated in metres        wear.js + tileM     2.96     38.40   1.60   1/6
 *   pit banded by the detail field   PIT_BAND            1.29     16.83   3.86   6/6
 *   pit albedo floor -> oxide        PIT_FLOOR_MIX       1.31     16.82   4.10   6/6
 *   derelict base x0.82 sRGB         palette.js          1.29     16.36   6.73   6/6
 *   ---------------------------------------------------------------------------------
 *   clean a22dad3                                        1.30     16.54   4.68   6/6
 *   all four together (= 4e646df)                        2.87     37.36   1.78   2/6
 *
 * ONE of the four is the entire regression and the other three are clean. It is also
 * WORSE ALONE (2.96) than in company (2.87) — the palette darkening was partly masking
 * it, which is exactly how a pass that landed all four could believe the palette had
 * paid for it.
 *
 * Splitting that one change by CONSUMER settles the question `bca5d10` left open. The
 * pit field feeds three things; each in turn was given the new metre-stated field while
 * the other two kept the old texel-rule field. Two `wear()` calls off the same forked
 * rng — `RNG.fork` is pure (src/core/rng.js:24) — so the two fields differ in the
 * pitting and in nothing else:
 *
 *   the new pit field reaches...                      maskLift  maskPct  dark%  gate
 *   the ALBEDO term only                                 2.62     34.05   1.83   2/6
 *   the ORM generator only (rough +0.34, metal -0.16)    1.30     16.59   4.84   6/6
 *   the height/normal field only (-0.30 indent)          1.31     16.66   4.27   6/6
 *
 * IT IS THE ALBEDO, AND `bca5d10`'s PARTING DIAGNOSIS IS WRONG. That commit reverted
 * rather than guessed and said so, and named the ORM generator as the likely mechanism.
 * The ORM path is inert to a tenth of a point on every column of the exact frame the
 * regression was found in. Anyone who had "fixed" the roughness would have measured
 * nothing and shipped the same render.
 *
 * WHY THE PIT'S SIZE IN METRES IS NOT COMING BACK, which is the uncomfortable half
 * ============================================================================
 * The finding underneath `4e646df` is a true measurement: `cellularField({ cells })`
 * divides THE TILE, so `cells: 26` over a 115.6 m hulk tile is a corrosion pit 4.45 m
 * across and the same constant over a 21.1 m greeble tile is 0.81 m. One number, two
 * tiers, and it can only be right on one of them. Stating it in metres is obviously
 * correct engineering. It is also, measured, the thing that breaks the graveyard, and
 * not because 13 m was the wrong number to pick. Seven settings, each metre-stated,
 * each applied alone to a clean `a22dad3`, coarse and fine octave in metres:
 *
 *   coarse / fine (m)                    maskLift  maskPct  dark%  gate   mod meanTile
 *   4.45 / 2.22  (what the texel rule
 *                 already gives on the
 *                 hulk tile)                 1.30    16.54   4.68   6/6      0.0742
 *   2.9  / 1.45                              1.30    16.79   4.01   6/6      0.0698
 *   2.2  / 1.1                               1.41    18.20   3.30   6/6
 *   1.6  / 0.8                               2.80    36.24   1.60   2/6
 *   13   / 2.2                               4.42    57.51   0.59   1/6
 *   13   / 2.2, fine octave at full weight   4.42    57.37   0.63   1/6
 *   13   / 1.1   (what 4e646df chose)        2.96    38.40   1.60   1/6      0.0522
 *
 * The window that survives is roughly 2.2-4.5 m for the coarse octave, and INSIDE that
 * window the frequency does not move: 0.0698 against 0.0742, a 6% change on a number
 * that is 9x the fleet's. Coarser than the window and the un-corroded plate between the
 * blooms is a contiguous bright region that crosses the bloom threshold together;
 * finer, and the mask falls under the mip footprint and stops darkening anything. Both
 * ends of that are measured above, and the failure is NOT monotonic in feature size,
 * which is why picking a better number is not the fix that was missing.
 *
 * IT CANNOT BE PAID FOR IN PAINT EITHER. The regressed tree is 16-21% DARKER than
 * `a22dad3` at the read scale on every derelict row of this tool's MINIFIED section,
 * and still runs maskLift 2.87. A 36% linear darkening of `derelict.base` applied alone
 * moves `maskPct` by 0.18 of a point. The pit field's read-scale frequency is a
 * graveyard exposure control, and no amount of albedo substitutes for it.
 *
 * WHAT SHIPPED INSTEAD, and it delivers more of the finding than the size change did:
 * the three clean sub-changes together. They alter the corrosion layer's AMPLITUDE and
 * DISTRIBUTION and leave its feature size exactly where it is.
 *
 *   tree                              maskLift  maskPct  dark%  gate   mod meanTile
 *   a22dad3                              1.30    16.54    4.68   6/6      0.0742
 *   4e646df's size change alone          2.96    38.40    1.60   1/6      0.0522
 *   band + floor + palette (SHIPPED)     1.30    16.90    5.15   6/6      0.0356
 *
 * A frame indistinguishable from HEAD on every gated column, MORE shadow than HEAD, and
 * twice the frequency reduction the size change bought. The pit's size in metres is
 * left as a stated, unfixed defect; the stream report says so in as many words.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer, stopServer, launchBrowser, ROOT } from './harness.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

/** Metres per pixel of the read. §3's scale: 1400 m of ship across 900 px. */
const MPP = Number(arg('mpp', 1.556));
/** Zero exactly one wear layer before generating. For isolating a layer's cost. */
const ABLATE = arg('ablate', '');
const ROWSET = arg('rows', 'fleet');
const JSON_OUT = arg('json', null);
const SIZE = Number(arg('size', 512));

/**
 * THE CALLERS. Every row is a real `registry.get` in the geometry stream, quoted with
 * the file and line it is written on. `mod` and `debris` are the two derelict rows the
 * salvage loop actually renders and they are NOT the same material — different `wear`,
 * different `tier`, therefore a different strake count and a different tile.
 */
const ROWSETS = {
  fleet: [
    { id: 'player hull', faction: 'player', variant: 'hull', wear: 0.5, tier: 2, src: 'ships/cruiser.js' },
    { id: 'coalition hull', faction: 'coalition', variant: 'hull', wear: 0.5, tier: 2, src: 'ships/common.js' },
    { id: 'concord hull', faction: 'concord', variant: 'hull', wear: 0.5, tier: 2, src: 'ships/common.js' },
    { id: 'derelict mod', faction: 'derelict', variant: 'derelictHull', wear: 0.85, tier: 2, src: 'modules/kit.js:90' },
    { id: 'derelict hulk', faction: 'derelict', variant: 'derelictHull', wear: 0.875, tier: 1, src: 'ships/common.js:99' },
    { id: 'derelict debris', faction: 'derelict', variant: 'derelictHull', wear: 1.0, tier: 1, src: 'ships/derelict.js:1386' },
  ],
  /**
   * THE CLASH ROW SET. ARCHITECTURE.md wants a salvaged module to carry its faction's
   * identity onto your hull, so the acceptance test is not "the module matches" — it is
   * that the module is FOREIGN AND INSTALLED. The number that says which is the
   * module's frequency AGAINST the hull it is bolted to, not either one alone, so these
   * two rows are measured as a pair and the ratio is printed.
   */
  module: [
    { id: 'cruiser hull', faction: 'player', variant: 'hull', wear: 0.5, tier: 2, src: 'ships/cruiser.js' },
    { id: 'cruiser plating', faction: 'player', variant: 'plating', wear: 0.5, tier: 2, src: 'ships/cruiser.js' },
    { id: 'derelict mod', faction: 'derelict', variant: 'derelictHull', wear: 0.85, tier: 2, src: 'modules/kit.js:90' },
    { id: 'coalition mod', faction: 'coalition', variant: 'hull', wear: 0.6, tier: 2, src: 'modules/kit.js' },
    { id: 'concord mod', faction: 'concord', variant: 'hull', wear: 0.6, tier: 2, src: 'modules/kit.js' },
  ],
  derelict: [
    { id: 'derelict mod', faction: 'derelict', variant: 'derelictHull', wear: 0.85, tier: 2, src: 'modules/kit.js:90' },
    { id: 'derelict hulk', faction: 'derelict', variant: 'derelictHull', wear: 0.875, tier: 1, src: 'ships/common.js:99' },
    { id: 'derelict debris', faction: 'derelict', variant: 'derelictHull', wear: 1.0, tier: 1, src: 'ships/derelict.js:1386' },
    { id: 'derelict greeble', faction: 'derelict', variant: 'greeble', wear: 0.875, tier: 1, src: 'ships/common.js' },
    { id: 'derelict plating', faction: 'derelict', variant: 'derelictHull', wear: 0.75, tier: 2, src: 'ships/common.js:100' },
  ],
};

const rows = ROWSETS[ROWSET];
if (!rows) {
  console.error(`unknown --rows "${ROWSET}". one of: ${Object.keys(ROWSETS).join(', ')}`);
  process.exit(2);
}

const port = Number(process.env.PORT || 5319);
let server, browser, out = null;
try {
  server = await startServer({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });

  out = await page.evaluate(async ({ rows, MPP, ABLATE, SIZE }) => {
    /**
     * BUILT THROUGH THE REGISTRY, NOT BY CALLING `hullMaps` WITH A SEED THIS TOOL
     * INVENTED. `TextureFactory` derives the rng as `new RNG('textures').fork(key)`
     * where `key` is the full argument set (textures/index.js:99,123), so a tool that
     * makes up its own seed measures a plate layout the game never renders. This asks
     * for exactly what `materials/index.js#hullMapsFor` asks for, including the
     * `markings: false` that `tilingMarks` defaults to.
     */
    const { createTextureFactory } = await import('/src/art/textures/index.js');
    const { getFactionPalette } = await import('/src/art/palette.js');

    /**
     * ABLATION. The wear layer is zeroed in the FACTION PALETTE before `hullMaps` reads
     * it, which is the same edit an agent would make by hand and therefore measures the
     * same thing. It is restored afterwards so rows do not contaminate each other.
     */
    function withAblation(faction, layer, fn) {
      if (!layer) return fn();
      const pal = getFactionPalette(faction);
      const keep = pal.wear[layer];
      if (keep === undefined) throw new Error(`no wear layer "${layer}"`);
      pal.wear[layer] = 0;
      try { return fn(); } finally { pal.wear[layer] = keep; }
    }

    const SRGB2LIN = new Float32Array(256);
    for (let v = 0; v < 256; v++) {
      const c = v / 255;
      SRGB2LIN[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /**
     * `surface.mjs`'s frequency pass, verbatim in its arithmetic: luma on sRGB bytes,
     * central-difference gradient, 8x8 tiles, a tile needs 48 of its 64 pixels in the
     * mask, calm < 0.045 and dense > 0.14. The only difference is the resample target:
     * `surface.mjs` fixes the WIDTH at 900 px because it is looking at a frame, this
     * fixes the METRES PER PIXEL because it is looking at tiles of different physical
     * size and a per-pixel threshold cannot compare them otherwise.
     */
    function frequency(canvas, tileM, mpp) {
      /**
       * REPEATS ARE CHOSEN SO THE TILE COUNT CLEARS surface.mjs's OWN FLOOR, and that
       * floor is 120 tiles (MIN_TILES, surface.mjs:149 — "below that a split is a
       * handful of tiles and reports noise as art direction"). 144 px is 18x18 = 324
       * 8x8 tiles. Fixing `reps` at 2 instead left the derelict's 21.1 m greeble tier
       * on NINE tiles, i.e. a three-decimal calm percentage computed from nine numbers.
       * These maps tile by construction, so a repeat is a real repeat and not padding.
       */
      const reps = Math.max(2, Math.min(12, Math.ceil((144 * mpp) / tileM)));
      const W = Math.max(16, Math.round((tileM * reps) / mpp));
      const c2 = document.createElement('canvas');
      c2.width = W; c2.height = W;
      const g2 = c2.getContext('2d', { willReadFrequently: true });
      for (let ry = 0; ry < reps; ry++) {
        for (let rx = 0; rx < reps; rx++) {
          g2.drawImage(canvas, (rx * W) / reps, (ry * W) / reps, W / reps, W / reps);
        }
      }
      const d = g2.getImageData(0, 0, W, W).data;
      const lum = new Float32Array(W * W);
      const mask = new Uint8Array(W * W);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        lum[p] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        mask[p] = lum[p] > 0.055 ? 1 : 0;
      }
      const gx = new Float32Array(W * W), gy = new Float32Array(W * W);
      for (let y = 1; y < W - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          gx[p] = Math.abs(lum[p + 1] - lum[p - 1]) * 0.5;
          gy[p] = Math.abs(lum[p + W] - lum[p - W]) * 0.5;
        }
      }
      let calm = 0, med = 0, dense = 0, tiles = 0, sumTile = 0;
      for (let ty = 0; ty + 8 <= W; ty += 8) {
        for (let tx = 0; tx + 8 <= W; tx += 8) {
          let sum = 0, n = 0, inMask = 0;
          for (let y = ty; y < ty + 8; y++) {
            for (let x = tx; x < tx + 8; x++) {
              const p = y * W + x;
              if (!mask[p]) continue;
              inMask++; sum += Math.hypot(gx[p], gy[p]); n++;
            }
          }
          if (inMask < 48) continue;
          tiles++;
          const v = sum / n;
          sumTile += v;
          if (v < 0.045) calm++; else if (v < 0.14) med++; else dense++;
        }
      }
      return {
        px: W,
        tiles,
        calm: tiles ? +(calm / tiles * 100).toFixed(1) : 0,
        medium: tiles ? +(med / tiles * 100).toFixed(1) : 0,
        dense: tiles ? +(dense / tiles * 100).toFixed(1) : 0,
        meanTile: tiles ? +(sumTile / tiles).toFixed(4) : 0,
      };
    }

    /**
     * THE TAIL. `hotPct` is the fraction of texels whose LINEAR luminance is above
     * `HOT`, and `HOT` is stated as a multiple of the row's own mean rather than as an
     * absolute, because "how much of this surface is far brighter than the rest of it"
     * is the quantity that decides whether a lit facet crosses a bloom threshold. The
     * absolute p99 is printed next to it so a reader can check the two against each
     * other; a change that lifts `hotPct` while `meanY` sits still is the shape of the
     * defect this tool was rebuilt for.
     */
    const HOT_MUL = 4.0;

    /**
     * =========================================================================
     * THE MINIFIED READ, AND IT IS THE COLUMN THE LAST PASS NEEDED AND DID NOT HAVE
     * =========================================================================
     * A box downsample of the albedo canvas IN LINEAR LIGHT to a stated metres per
     * pixel, i.e. what a screen pixel at that range actually integrates.
     *
     * WHY IT IS NOT REDUNDANT WITH THE TEXEL HISTOGRAM. Measured, the metre-stated pit
     * field of `4e646df` against a clean `a22dad3`, derelict debris, texel scale:
     *
     *                   meanY     p95     p99
     *   a22dad3        0.0512  0.1165  0.1394
     *   + metre pits   0.0513  0.1165  0.1336
     *
     * Nothing moved. The pit MASK itself does not move either: mean 0.3836 -> 0.3842,
     * coverage above 0.05 88-89% on both. And the frame's lit area went 16.5% -> 38.4%
     * and the bloom-free subject's blown pixels 1.75% -> 4.14%. The whole difference is
     * SPATIAL, and a histogram cannot see space. Box-filtered to the read scale the
     * same mask goes from 16.5% of screen pixels seeing essentially no corrosion to
     * 28.9%, and its variance INSIDE one screen pixel halves, 0.0343 -> 0.0169.
     * Redistributing corrosion is not free even when its total is held to four decimal
     * places, and the mean cannot see the bill.
     *
     * TWO FILTERS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE MECHANISM.
     *
     *   mMean   box filter in LINEAR light. What a colour-correct sampler does.
     *   eMean   box filter on the ENCODED sRGB bytes, decoded afterwards. What a mip
     *           chain generated on an SRGB8 texture does.
     *
     * They are not the same number and the gap between them is not a rounding error.
     * Decoding is convex (x^2.2), so by Jensen decode-then-average is always >=
     * average-then-decode: encoded-space minification DARKENS, and it darkens in
     * proportion to how much encoded contrast sits inside the footprint. A dark mask
     * scattered fine enough to fall inside one footprint is therefore worth real
     * brightness, and the SAME MASK, SAME MEAN, SAME HISTOGRAM, collected into blooms
     * larger than the footprint is not.
     *
     * `eGap` is `eMean / mMean` — how much of this surface's rendered value is being
     * paid for by encoded-space filtering rather than by paint. A surface whose eGap
     * moves has changed brightness on screen without changing any texel. On the 4e646df
     * pair, `derelict hulk` goes 0.9375 -> 0.9634, i.e. 2.8% of that surface's darkness
     * stopped being free.
     *
     * IT IS A LEAD, NOT A VERDICT, and this is stated because the last two passes both
     * quoted a texture column as if it settled something. The fully regressed tree has
     * an eGap of 0.9841 AND a minified linear read 16-21% darker than HEAD, and it
     * fails the graveyard gate anyway. No column in this file is the frame.
     */
    function minified(canvas, tileM, mpp) {
      const src = canvas.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height).data;
      const S = canvas.width;
      const W = Math.max(4, Math.round(tileM / mpp));
      const box = S / W;
      const ys = new Float32Array(W * W);
      let sum = 0, encSum = 0;
      for (let oy = 0; oy < W; oy++) {
        for (let ox = 0; ox < W; ox++) {
          const x0 = Math.floor(ox * box), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * box));
          const y0 = Math.floor(oy * box), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * box));
          let acc = 0, cnt = 0, er = 0, eg = 0, eb = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const i = (y * S + x) * 4;
              acc += 0.2126 * SRGB2LIN[src[i]] + 0.7152 * SRGB2LIN[src[i + 1]] + 0.0722 * SRGB2LIN[src[i + 2]];
              er += src[i]; eg += src[i + 1]; eb += src[i + 2];
              cnt++;
            }
          }
          const v = acc / cnt;
          ys[oy * W + ox] = v; sum += v;
          // Average the ENCODED bytes first, then decode — a mip generated on SRGB8.
          const lin = (b) => { const c = b / cnt / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
          encSum += 0.2126 * lin(er) + 0.7152 * lin(eg) + 0.0722 * lin(eb);
        }
      }
      const n = W * W;
      const mean = sum / n;
      const encMean = encSum / n;
      const sorted = Float32Array.from(ys).sort();
      const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
      let hot = 0;
      const cut = mean * 1.6;
      for (let i = 0; i < n; i++) if (ys[i] > cut) hot++;
      return {
        mPx: W,
        mMean: +mean.toFixed(4),
        mP50: +q(0.50).toFixed(4),
        mP95: +q(0.95).toFixed(4),
        mP99: +q(0.99).toFixed(4),
        /** Fraction of screen-scale pixels more than 1.6x the surface's own mean. */
        mHotPct: +(hot / n * 100).toFixed(2),
        eMean: +encMean.toFixed(4),
        eGap: +(encMean / mean).toFixed(4),
      };
    }

    function albedoStats(canvas) {
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      const n = canvas.width * canvas.height;
      const ys = new Float32Array(n);
      let sum = 0;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const y = 0.2126 * SRGB2LIN[d[i]] + 0.7152 * SRGB2LIN[d[i + 1]] + 0.0722 * SRGB2LIN[d[i + 2]];
        ys[p] = y; sum += y;
      }
      const mean = sum / n;
      const sorted = Float32Array.from(ys).sort();
      const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
      let hot = 0;
      const cut = mean * HOT_MUL;
      for (let i = 0; i < n; i++) if (ys[i] > cut) hot++;
      return {
        meanY: +mean.toFixed(4),
        p05: +q(0.05).toFixed(4), p50: +q(0.50).toFixed(4),
        p95: +q(0.95).toFixed(4), p99: +q(0.99).toFixed(4),
        hotPct: +(hot / n * 100).toFixed(2),
        hotCut: +cut.toFixed(4),
      };
    }

    /** G is roughness, B is metalness — hullMaps.js:997-999. */
    function ormStats(canvas) {
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
      const n = canvas.width * canvas.height;
      let sr = 0, sm = 0, sao = 0;
      const rs = new Float32Array(n);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        sao += d[i] / 255; rs[p] = d[i + 1] / 255; sr += rs[p]; sm += d[i + 2] / 255;
      }
      const sorted = Float32Array.from(rs).sort();
      return {
        ao: +(sao / n).toFixed(4),
        rough: +(sr / n).toFixed(4),
        metal: +(sm / n).toFixed(4),
        /**
         * The smoothest 5% of the surface. A specular highlight is made by the
         * SMOOTHEST texels, not by the average ones, so a mean roughness that holds
         * while this drops is a surface that has grown a hot spot.
         */
        roughP05: +sorted[Math.floor(0.05 * n)].toFixed(4),
      };
    }

    const results = [];
    for (const r of rows) {
      // A fresh factory per row so the ablated and un-ablated builds cannot share a
      // cache entry, and so the rng is derived exactly as the game derives it.
      const maps = withAblation(r.faction, ABLATE, () => createTextureFactory({ anisotropy: 8 }).get('hull', {
        faction: r.faction,
        variant: r.variant,
        wear: r.wear,
        tier: r.tier,
        size: SIZE,
        scale: 1,
        seed: 0,
        surfaceM: 0,
        markings: false,
      }));
      results.push({
        ...r,
        tileM: +maps.tileM.toFixed(1),
        mPerTexel: +(maps.tileM / SIZE).toFixed(4),
        ...albedoStats(maps.albedoCanvas),
        ...minified(maps.albedoCanvas, maps.tileM, MPP),
        ...ormStats(maps.ormCanvas),
        freq: frequency(maps.albedoCanvas, maps.tileM, MPP),
      });
    }
    return results;
  }, { rows, MPP, ABLATE, SIZE });

  if (errors.length) {
    console.error('page errors:');
    for (const e of errors) console.error('  ' + e);
    process.exitCode = 2;
  }
} finally {
  if (browser) await browser.close();
  if (server) await stopServer(server);
}

if (!out) process.exit(2);

const pad = (s, w) => String(s).padEnd(w);
const num = (v, w, dp = 4) => String(typeof v === 'number' ? v.toFixed(dp) : v).padStart(w);

console.log('');
console.log(`MATSURFACE  rows=${ROWSET}  size=${SIZE}  read scale ${MPP} m/px`
  + (ABLATE ? `  ABLATED: pal.wear.${ABLATE} = 0` : ''));
console.log('');
console.log('ALBEDO  linear luminance of the generated albedo canvas');
console.log('  ' + pad('material', 17) + pad('tile m', 8) + '   meanY     p50     p95     p99   hot%   (hot = 4x mean)');
for (const r of out) {
  console.log('  ' + pad(r.id, 17) + num(r.tileM, 6, 1) + '  '
    + num(r.meanY, 8) + num(r.p50, 8) + num(r.p95, 8) + num(r.p99, 8) + num(r.hotPct, 7, 2));
}
console.log('');
console.log(`MINIFIED  the same canvas box-filtered to ${MPP} m/px, i.e. one screen pixel of read`);
console.log('  ' + pad('material', 17) + '  px    linear     p50     p95     p99   hot%   encoded    eGap');
for (const r of out) {
  console.log('  ' + pad(r.id, 17) + String(r.mPx).padStart(4) + '  '
    + num(r.mMean, 8) + num(r.mP50, 8) + num(r.mP95, 8) + num(r.mP99, 8) + num(r.mHotPct, 7, 2)
    + num(r.eMean, 10) + num(r.eGap, 8));
}
console.log('  eGap = encoded/linear. Below 1 by construction; how far below is how much');
console.log('  of this surface\'s darkness is filtering rather than paint. A surface that');
console.log('  changes eGap changes brightness on screen without changing one texel.');
console.log('');
console.log('FREQUENCY  surface.mjs operator, each tile resampled to the same metres per pixel');
console.log('  ' + pad('material', 17) + '  px  tiles     calm%    med%  dense%   meanTile');
for (const r of out) {
  const f = r.freq;
  console.log('  ' + pad(r.id, 17) + String(f.px).padStart(4) + String(f.tiles).padStart(7)
    + num(f.calm, 10, 1) + num(f.medium, 8, 1) + num(f.dense, 8, 1) + num(f.meanTile, 11));
}
console.log('');
console.log('ORM  R ambient occlusion / G roughness / B metalness (hullMaps.js:997)');
console.log('  ' + pad('material', 17) + '      ao   rough   metal   roughP05');
for (const r of out) {
  console.log('  ' + pad(r.id, 17) + num(r.ao, 8) + num(r.rough, 8) + num(r.metal, 8) + num(r.roughP05, 11));
}

/**
 * THE PAIR THE ACCEPTANCE CRITERION IS ACTUALLY ABOUT. A whole-ship number hides a
 * clash: the module is a few percent of the pixels, so its frequency and value have to
 * be read AGAINST the hull it is bolted to or the average absorbs it.
 */
if (ROWSET === 'module') {
  const hull = out.find((r) => r.id === 'cruiser hull');
  console.log('');
  console.log('AGAINST THE HULL IT IS BOLTED TO  (foreign is the goal; pasted-in is not)');
  console.log('  ' + pad('module', 17) + '  freq x hull   value stops   verdict');
  for (const r of out) {
    if (r === hull) continue;
    const fx = r.freq.meanTile / hull.freq.meanTile;
    const stops = Math.log2(r.meanY / hull.meanY);
    console.log('  ' + pad(r.id, 17) + num(fx, 11, 2) + 'x' + num(stops, 14, 2)
      + `   ${Math.abs(stops) < 0.25 && Math.abs(fx - 1) < 0.25 ? 'INVISIBLE' : 'reads as foreign'}`);
  }
}

console.log('');
console.log('NOT MEASURED HERE, and each of these has burned this file already:');
console.log('  THE FRAME. Every column above is the TEXTURE. 4e646df held meanY to 0.05');
console.log('  stops and still took the derelict probe 16.2% -> 37.6%. The gate on the');
console.log('  render is tools/derelictcheck.mjs and it is 3.4 s.');
console.log('  MIP CHAIN AND LOD. These are the level-0 canvases. A high-frequency mask');
console.log('  that averages away by mip 3 measures the same here and renders differently.');
console.log('  THE MACRO LAYER. markings are off in every row so the tiling stencil does');
console.log('  not sit in the histogram; macro.js draws the real marks in object space.');
console.log('  LIGHTING. No key, no fill, no envmap, no tone map. Two materials with the');
console.log('  same meanY and different metalness do not render at the same value.');

if (JSON_OUT) {
  const p = path.resolve(ROOT, JSON_OUT);
  await fs.writeFile(p, JSON.stringify({ rows: ROWSET, mpp: MPP, ablate: ABLATE || null, out }, null, 2));
  console.log(`\nwrote ${p}`);
}
console.log('');
