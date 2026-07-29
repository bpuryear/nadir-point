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
 *   ship   docs/probes/cruiser.png            hull on void, no UI     44.9 / 45.7 /  9.3
 *   scene  docs/review/look-surface/close.png game frame, HUD up      78.1 / 20.3 /  1.6
 *   face   the same frame, one lit flank      --crop 0.30,0.39,0.62,0.50
 *                                                                    97.2 /  2.8 /  0.0
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

const argv = process.argv.slice(2);
function opt(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
const frame = opt('frame');
const files = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));

if (!frame || !FRAMES.has(frame) || !files.length) {
  console.error('usage: node tools/surface.mjs --frame ship|face|scene <image.png> [more.png ...] [--crop x0,y0,x1,y1]');
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
  // SAMPLE SIZE FIRST. A check that measures nothing prints "ok".
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
console.log(`gate (--frame ship only): two-sided envelope of §3's six references — `
  + `calm ${BAND.calm[0]}-${BAND.calm[1]}  medium ${BAND.medium[0]}-${BAND.medium[1]}  dense ${BAND.dense[0]}-${BAND.dense[1]}`);
console.log(`reference median 62 / 21 / 14   |   sample: ${rows.length} image(s), `
  + `${rows.map((r) => r.tiles).join(' + ')} tiles on subject`);
for (const n of notes) console.log(`  note  ${n}`);
for (const f of failures) console.log(`  FAIL  ${f}`);

if (failures.length) {
  console.error(`\nFAIL: ${failures.length} finding(s)`);
  process.exit(1);
}
console.log('\nsurface ok');
