/**
 * MATERIAL-LEVEL SURFACE MEASUREMENT — the frequency and value of a MATERIAL,
 * before any geometry, any light or any camera.
 *
 *   node tools/matsurface.mjs
 *   node tools/matsurface.mjs --mpx 1.556
 *
 * WHY THIS EXISTS, AND WHY tools/surface.mjs COULD NOT ANSWER IT
 *
 * `tools/surface.mjs` measures a PNG of a lit ship, and its own header is emphatic
 * that the framing decides the answer. That is the right tool for "does this SHIP
 * read", and it is useless for "does this MATERIAL clash with that one", because
 * a rendered number folds the material together with the light, the pose, the tone
 * map and whatever the surface happens to be facing. When the integration critic
 * wrote that a salvaged module's material "value and texture clash with bone
 * plating far more violently than its silhouette", there was nothing in the tree
 * that could confirm or refute it without also moving four other variables.
 *
 * ONE PIXEL IS THE SAME NUMBER OF METRES ON EVERY ROW. THAT IS THE WHOLE TRICK.
 *
 * Two tiles cannot be compared for frequency at their own resolutions. The armour
 * tier's tile is 109 m over 512 texels and the machinery tier's is 16 m over the
 * same 512, so the identical canvas statistic means two different things. Every
 * row below is therefore resampled so one output pixel is `--mpx` metres — default
 * 1.556, which is §3's stated 1400 m hull across 900 px — and then tiled up to at
 * least 256 px so the operator always sees a comparable amount of surface.
 *
 * The gradient operator, the 8x8 tiling, and the 0.045 / 0.14 thresholds are
 * lifted from `tools/surface.mjs` unchanged, so a number here and a number there
 * are the same number. `node tools/surface.mjs --calibrate` calibrates both.
 *
 * WHAT THE COLUMNS ARE
 *
 *   meanY     mean LINEAR luminance of the albedo canvas. This is the number a
 *             value ladder is authored in; palette.js states its tiers this way.
 *   p05..p95  sRGB luma quantiles, and IQR. A tier with a near-zero IQR is the
 *             "97.8% of texels in one 0.05 bin" defect hullMaps.js documents.
 *   warm      mean sRGB R minus B. Identity, in the albedo rather than in the key.
 *   mottle    value SD after downsampling to ~8 m per pixel: blotchiness at the
 *             scale of a hull feature, as opposed to detail. A corrosion bloom
 *             lives here; a corrosion PIT should not.
 *   calm/med/dense, meanTile
 *             §3's frequency split at the ship read. `meanTile` is the raw mean
 *             per-pixel luma slope and is the more sensitive of the two — a tier
 *             can be 100% calm and still be three times another tier's meanTile.
 *
 * REPRODUCING THE ABLATIONS QUOTED IN textures/wear.js AND textures/hullMaps.js
 *
 * There are no ablation flags here on purpose; every one of them is a named
 * constant in the file it belongs to, and the honest way to re-derive a row is to
 * change that constant and re-run this tool.
 *
 *   the layer decomposition   zero one of `pal.wear.{edge,streak,grime,pit}` at
 *                             the `wear()` call in textures/hullMaps.js
 *   the banding table         PIT_BAND_MIN / PIT_BAND_MAX in textures/hullMaps.js
 *   the small-tile table      PIT_MIN_BLOOMS in textures/wear.js
 *   the pit floor             PIT_FLOOR_MIX in textures/hullMaps.js
 *
 * NOISE FLOOR, AND IT IS NOT THE SAME ON BOTH AXES. The RNG seed is fixed per
 * (faction, variant) so two runs of this tool are byte-identical, but a DIFFERENT
 * seed moves `meanY` by up to about 0.014 (0.16 stops) and `meanTile` by under
 * 0.0006. Value differences under a sixth of a stop are not findings; frequency
 * differences are trustworthy to the third decimal. Compare rows within one run.
 */
import { launchBrowser, startServer, stopServer } from './harness.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const M_PER_PX = Number(arg('mpx', 1400 / 900));

/**
 * Every (key, args) pair the game actually asks for, named by its call site. A
 * material nobody builds is not worth a row, and a row whose arguments do not
 * match a real call site measures a material that does not exist.
 */
const CASES = [
  // geometry/cruiser.js#SURFACE — the player hull, which is the bar
  { label: 'player hull', faction: 'player', variant: 'hull', wear: 0.5, tier: 2 },
  { label: 'player plating', faction: 'player', variant: 'plating', wear: 0.5, tier: 2 },
  { label: 'player hullDark', faction: 'player', variant: 'hullDark', wear: 0.5, tier: 2 },
  { label: 'player greeble', faction: 'player', variant: 'greeble', wear: 0.55, tier: 1 },
  // geometry/modules/kit.js#materialFor — what a salvaged module wears
  { label: 'derelictHull mod', faction: 'derelict', variant: 'derelictHull', wear: 0.85, tier: 2 },
  // geometry/ships/derelict.js#buildHulkDebris — the drifting debris
  { label: 'derelictHull debr', faction: 'derelict', variant: 'derelictHull', wear: 1.0, tier: 1 },
  { label: 'derelict greeble', faction: 'derelict', variant: 'greeble', wear: 0.55, tier: 1 },
  { label: 'derelict trim', faction: 'derelict', variant: 'trim', wear: 0.45, tier: 1 },
  { label: 'derelict hull-var', faction: 'derelict', variant: 'hull', wear: 0.85, tier: 2 },
  { label: 'derelict debris-v', faction: 'derelict', variant: 'debris', wear: 0.85, tier: 2 },
  { label: 'coalition hull', faction: 'coalition', variant: 'hull', wear: 0.6, tier: 2 },
  { label: 'coalition greeble', faction: 'coalition', variant: 'greeble', wear: 0.55, tier: 1 },
  { label: 'concord hull', faction: 'concord', variant: 'hull', wear: 0.25, tier: 2 },
];

const port = Number(process.env.PORT || 5377);
let server, browser, failed = false;
try {
  // Dev mode on purpose, same reason tools/maps.mjs gives: this imports SOURCE
  // modules by path because it is measuring the generator, not a bundle.
  server = await startServer({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  page.on('pageerror', (e) => { failed = true; console.error('PAGEERROR', String(e)); });
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });

  const rows = await page.evaluate(async ({ cases, mPerPx }) => {
    const { hullMaps } = await import('/src/art/textures/hullMaps.js');
    const { RNG } = await import('/src/core/rng.js');

    const lumaOf = (d, n) => {
      const L = new Float32Array(n);
      for (let i = 0; i < n; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
      return L;
    };
    const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

    /** tools/surface.mjs's operator, unchanged in shape and in thresholds. */
    const split = (lum, W, H) => {
      const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          gx[p] = Math.abs(lum[p + 1] - lum[p - 1]) * 0.5;
          gy[p] = Math.abs(lum[p + W] - lum[p - W]) * 0.5;
        }
      }
      let calm = 0, med = 0, dense = 0, tiles = 0, acc = 0;
      for (let ty = 8; ty + 16 <= H; ty += 8) {
        for (let tx = 8; tx + 16 <= W; tx += 8) {
          let sum = 0, n = 0;
          for (let y = ty; y < ty + 8; y++) {
            for (let x = tx; x < tx + 8; x++) { const p = y * W + x; sum += Math.hypot(gx[p], gy[p]); n++; }
          }
          const v = sum / n; acc += v; tiles++;
          if (v < 0.045) calm++; else if (v < 0.14) med++; else dense++;
        }
      }
      return { meanTile: acc / tiles, tiles, calm: calm / tiles * 100, med: med / tiles * 100, dense: dense / tiles * 100 };
    };

    const out = [];
    for (const c of cases) {
      // Seeded by (faction, variant), NOT by the row label, so renaming a row
      // cannot silently move a number by a sixth of a stop.
      const rng = new RNG(`matsurface:${c.faction}:${c.variant}`);
      // `markings: false` matches the registry (materials/index.js#hullMapsFor):
      // the tiling stencils are off in the game, the macro atlas draws them once.
      const maps = hullMaps({
        rng, faction: c.faction, variant: c.variant, tier: c.tier,
        wear: c.wear, size: 512, markings: false,
      });
      const src = maps.albedoCanvas;
      const tileM = maps.tileM;

      // --- value ladder, at the canvas's own resolution ---------------------
      const g0 = src.getContext('2d', { willReadFrequently: true });
      const d0 = g0.getImageData(0, 0, src.width, src.height).data;
      const n0 = src.width * src.height;
      const L0 = lumaOf(d0, n0);
      const sorted = Float32Array.from(L0).sort();
      const q = (f) => sorted[Math.min(n0 - 1, Math.floor(f * n0))];
      let linSum = 0, rSum = 0, bSum = 0;
      for (let i = 0; i < n0; i++) {
        linSum += 0.2126 * srgbToLin(d0[i * 4] / 255)
          + 0.7152 * srgbToLin(d0[i * 4 + 1] / 255)
          + 0.0722 * srgbToLin(d0[i * 4 + 2] / 255);
        rSum += d0[i * 4] / 255; bSum += d0[i * 4 + 2] / 255;
      }

      // --- frequency, resampled to a COMMON metres-per-pixel ----------------
      const tilePx = Math.max(4, Math.round(tileM / mPerPx));
      const reps = Math.ceil(256 / tilePx);
      const W = tilePx * reps;
      const cc = document.createElement('canvas');
      cc.width = W; cc.height = W;
      const gg = cc.getContext('2d', { willReadFrequently: true });
      gg.imageSmoothingEnabled = true;
      gg.imageSmoothingQuality = 'high';
      for (let ry = 0; ry < reps; ry++) {
        for (let rx = 0; rx < reps; rx++) gg.drawImage(src, rx * tilePx, ry * tilePx, tilePx, tilePx);
      }
      const s = split(lumaOf(gg.getImageData(0, 0, W, W).data, W * W), W, W);

      // --- mottle: value SD at ~8 m per pixel -------------------------------
      const mottlePx = Math.max(2, Math.round(tileM / 8));
      const mc = document.createElement('canvas');
      mc.width = mottlePx; mc.height = mottlePx;
      const mg = mc.getContext('2d', { willReadFrequently: true });
      mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high';
      mg.drawImage(src, 0, 0, mottlePx, mottlePx);
      const Lm = lumaOf(mg.getImageData(0, 0, mottlePx, mottlePx).data, mottlePx * mottlePx);
      let ms = 0, ms2 = 0;
      for (let i = 0; i < Lm.length; i++) { ms += Lm[i]; ms2 += Lm[i] * Lm[i]; }
      const mMean = ms / Lm.length;

      out.push({
        label: c.label,
        tileM: +tileM.toFixed(1),
        meanLin: +(linSum / n0).toFixed(4),
        p05: +q(0.05).toFixed(3), p50: +q(0.50).toFixed(3), p95: +q(0.95).toFixed(3),
        iqr: +(q(0.75) - q(0.25)).toFixed(4),
        warm: +((rSum - bSum) / n0).toFixed(3),
        calm: +s.calm.toFixed(1), med: +s.med.toFixed(1), dense: +s.dense.toFixed(1),
        meanTile: +s.meanTile.toFixed(4), tiles: s.tiles, px: W,
        mottle: +Math.sqrt(Math.max(0, ms2 / Lm.length - mMean * mMean)).toFixed(4),
      });
    }
    return out;
  }, { cases: CASES, mPerPx: M_PER_PX });

  console.log('MATERIAL SURFACE — generated albedo canvases, 512 px, no geometry and no light');
  console.log(`frequency at ${M_PER_PX.toFixed(3)} m/px; operator and thresholds from tools/surface.mjs\n`);
  console.log('material'.padEnd(20) + 'tile m'.padStart(8) + 'meanY'.padStart(9) + 'p05'.padStart(7)
    + 'p50'.padStart(7) + 'p95'.padStart(7) + 'IQR'.padStart(8) + 'warm'.padStart(7) + 'mottle'.padStart(8)
    + 'calm%'.padStart(8) + 'med%'.padStart(7) + 'dense%'.padStart(8) + 'meanTile'.padStart(10));
  for (const r of rows) {
    console.log(r.label.padEnd(20) + String(r.tileM).padStart(8) + r.meanLin.toFixed(4).padStart(9)
      + r.p05.toFixed(3).padStart(7) + r.p50.toFixed(3).padStart(7) + r.p95.toFixed(3).padStart(7)
      + r.iqr.toFixed(4).padStart(8) + r.warm.toFixed(3).padStart(7) + r.mottle.toFixed(4).padStart(8)
      + r.calm.toFixed(1).padStart(8) + r.med.toFixed(1).padStart(7) + r.dense.toFixed(1).padStart(8)
      + r.meanTile.toFixed(4).padStart(10));
  }

  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  const h = by['player hull'];
  console.log('');
  console.log('AGAINST THE PLAYER HULL — what a salvaged surface asks the eye to accept');
  console.log('  material'.padEnd(22) + 'value'.padStart(12) + 'frequency'.padStart(12) + 'split'.padStart(22));
  for (const key of ['derelictHull mod', 'derelictHull debr', 'coalition hull', 'concord hull']) {
    const r = by[key];
    if (!r) continue;
    console.log('  ' + key.padEnd(20)
      + `${Math.log2(r.meanLin / h.meanLin).toFixed(2)} st`.padStart(12)
      + `${(r.meanTile / h.meanTile).toFixed(2)}x`.padStart(12)
      + `${r.calm.toFixed(1)}/${r.med.toFixed(1)}/${r.dense.toFixed(1)}`.padStart(22));
  }
  console.log(`  ${'player hull itself'.padEnd(20)}${'0.00 st'.padStart(12)}${'1.00x'.padStart(12)}`
    + `${`${h.calm.toFixed(1)}/${h.med.toFixed(1)}/${h.dense.toFixed(1)}`.padStart(22)}`);
} catch (err) {
  failed = true;
  console.error('MATSURFACE HARNESS ERROR:', err);
} finally {
  await browser?.close();
  await stopServer(server);
}
process.exit(failed ? 1 : 0);
