/**
 * SURFACE MEASUREMENT — the numbers ship-language.md §8 asks for, run on a PNG.
 *
 *   node tools/surface.mjs docs/review/look-surface/close.png [...more]
 *
 * Reports, per image:
 *
 *   hull mask       pixels that are neither near-black void nor UI chrome
 *   value range     p05 / p25 / median / p75 / p95 / max of sRGB luma on that mask
 *   frequency       calm / medium / dense tile fractions, using the EXACT method in
 *                   §3 — resample to 900 px wide, per-pixel luminance gradient
 *                   magnitude, mean over 8x8 tiles, thresholds 0.045 and 0.14
 *   saturated       fraction of the mask ABOVE luma 0.15 with HSV S > 0.5 (the §4
 *                   accent budget). The value floor is not optional — see the note at
 *                   the counter; HSV saturation is a ratio and runs to 1 in the dark.
 *   chroma          mean colour of the mask and its chroma. A hull whose identity is
 *                   "neutral gunmetal" should come back under ~0.05.
 *   aniso           horizontal gradient energy / vertical gradient energy. CROSSING a
 *                   horizontal seam is a move in Y, so a surface of long horizontal
 *                   seams pushes this BELOW 1; an isotropic block field sits near 1.
 *
 *                   STATED LIMITATION, because the first version of this comment had
 *                   the sign backwards and the first reading of it was nearly quoted
 *                   as evidence: over a whole frame this number is dominated by
 *                   SILHOUETTE and geometry edges, not by surface. Between the
 *                   round-one hull and the strake rewrite it moved 0.74 -> 0.73, i.e.
 *                   not at all, while the same measurement on a crop of one lit face
 *                   read 2.06. Use it on a crop of a single continuous surface, or do
 *                   not use it. `tools/maps.mjs` is the honest place to judge whether
 *                   a plate layout is directional.
 *
 * WHY THIS IS A SEPARATE TOOL AND NOT PART OF capture.mjs
 * capture.mjs measures the WHOLE FRAME at 160x90 — enough to catch an empty or
 * blown-out shot and nothing else. Every finding in the round-one review was about
 * the hull specifically, and a whole-frame statistic on a frame that is 45% black
 * sky cannot see it. This masks the hull and measures only that.
 *
 * The mask is deliberately crude (luma > 0.055, and outside the UI's known rects)
 * and it is stated here rather than hidden: it will include lit rocks and exclude
 * the darkest hull. That is acceptable for tracking a delta between two runs of the
 * same shot, which is all it is used for, and it is NOT acceptable as an absolute
 * claim about the ship. Anything quoted from here should say "hull mask" out loud.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--crop');
if (!files.length) {
  console.error('usage: node tools/surface.mjs <image.png> [more.png ...]');
  process.exit(2);
}
const cropArg = process.argv.indexOf('--crop');
/** --crop x0,y0,x1,y1 in 0..1 of the image, to measure one region. */
const crop = cropArg > 0 ? process.argv[cropArg + 1].split(',').map(Number) : [0, 0, 1, 1];

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
    let calm = 0, med = 0, dense = 0, tiles = 0;
    let energyX = 0, energyY = 0;
    for (let ty = 0; ty + 8 <= H; ty += 8) {
      for (let tx = 0; tx + 8 <= W; tx += 8) {
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
      /** See the header: <1 is horizontal-seam-dominant, ~1 isotropic. Crop-only. */
      aniso: +(energyX / Math.max(1e-6, energyY)).toFixed(2),
    };
  }, { url, crop });

  rows.push({ file: path.relative(ROOT, abs), ...r });
}

await browser.close();

const pad = (s, n) => String(s).padStart(n);
console.log('file'.padEnd(42)
  + ' mask%   p05   p25   med   p75   p95   max   sat%   calm   med  dense  aniso  chroma  mean RGB');
for (const r of rows) {
  console.log(
    r.file.padEnd(42)
    + pad(r.maskPct, 5) + pad(r.p05, 6) + pad(r.p25, 6) + pad(r.med, 6) + pad(r.p75, 6)
    + pad(r.p95, 6) + pad(r.max, 6) + pad(r.satPct, 7)
    + pad(r.calm, 7) + pad(r.medium, 6) + pad(r.dense, 7) + pad(r.aniso, 7)
    + pad(r.chroma, 8) + '  ' + r.tint.join(' '),
  );
}
console.log('\ntargets: p95 0.72-0.80 on a fully lit face | calm >= 60 medium <= 28 dense <= 12 | sat <= 3.5');
