/**
 * THE HUE AUDIT — MEASUREMENT ONLY, DELIBERATELY.
 *
 * `docs/design/look-target.md:46` is binding and says "UI and HUD: Beta Decay,
 * wholesale… one warm accent". Nothing in this repository measured that, so the claim
 * has been argued from screenshots for as long as it has existed. This tool turns it
 * into two numbers.
 *
 * WHY THIS EXITS 0 ON THE HUE-COUNT FINDING AND NOT ON THE COLLISION FINDING.
 *
 * The one-accent collapse is NOT a scheduling decision and it is NOT this stream's to
 * make. It lives in `src/art/palette.js`, which `ARCHITECTURE.md`'s ownership table
 * assigns to Materials, and `paletteAudit`'s provenance index (palette.js:960-975)
 * rejects a colour the UI derives locally. Moving `C.friendly`, `C.shield` and
 * `C.salvage` also risks the 4.5:1 floor `tools/uicheck.mjs` enforces. So the hue
 * CENSUS is reported and never gates: it is evidence for an owner decision.
 *
 * The SEMANTIC COLLISION check is different, and it does gate. Two colours that carry
 * DIFFERENT documented meanings and are indistinguishable are not an art-direction
 * question, they are a defect — the code is spending thirteen lines at
 * `src/ui/theme.js:160-172` defining a distinction the eye cannot make:
 *
 *     C.warn    #ff4a2a   hue 9.0    (HEAT / COST)
 *     C.hostile #ff4433   hue 5.0    (STRUCTURAL LOSS)
 *     4.0 degrees of hue apart, 1.02:1 in relative luminance
 *
 * That pair is the whole of the measurable defect inside the palette proposal, it is
 * separable from the eight-hue collapse, and `docs/probes/ui-armament.png` shows what
 * it costs: the DORSAL `COOKED` chip and the STBD `BREACHED` chip are adjacent and
 * indistinguishable, which is heat and structural loss reading as the same event.
 *
 *   node tools/uihue.mjs            census + the semantic-collision gate
 *   node tools/uihue.mjs --census   census only, always exits 0
 */

import path from 'node:path';
import { ROOT } from './harness.mjs';

const censusOnly = process.argv.includes('--census');

/** The reference's accent band, `reference-ui-language.md:19-27`: #c85a1e … #ff9126. */
const BAND = { lo: 21, hi: 30 };
/** Below this saturation a colour is on the bone ramp and carries no hue claim. */
const NEUTRAL_SAT = 0.14;

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
const contrast = (a, b) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** `rgb()` / `rgba()` composited over an opaque backdrop, the way it is drawn. */
function parse(css, over = [0, 0, 0]) {
  const n = String(css).match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  const a = n.length > 3 ? n[3] : 1;
  return [0, 1, 2].map((i) => Math.round(n[i] * a + over[i] * (1 - a)));
}

/** HSL, hue in degrees. */
function hsl([r, g, b]) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn);
  const mn = Math.min(rn, gn, bn);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (mx === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

const hueGap = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const { C, TEXT_INK, SEMANTIC, FACTION_INK } = await import(path.join(ROOT, 'src/ui/theme.js'));

const plate = parse(C.panel);
const seen = new Map();
const add = (name, css) => {
  if (!css || seen.has(name)) return;
  const rgbv = parse(css, plate);
  const { h, s, l } = hsl(rgbv);
  seen.set(name, { name, css, rgb: rgbv, h, s, l, lum: lum(rgbv) });
};

for (const [k, v] of Object.entries(C)) add(`C.${k}`, v);
for (const [k, v] of Object.entries(SEMANTIC)) add(`SEMANTIC.${k}`, v);
for (const [id, ink] of Object.entries(FACTION_INK)) {
  add(`FACTION_INK.${id}.hue`, ink.hue);
  add(`FACTION_INK.${id}.trim`, ink.trim);
}
let inkIndex = 0;
for (const css of TEXT_INK) add(`TEXT_INK[${inkIndex++}]`, css);

// ---------------------------------------------------------------------------
// 1. The census. Reported, never gated. See the header.
// ---------------------------------------------------------------------------

const chromatic = [...seen.values()].filter((e) => e.s >= NEUTRAL_SAT);
const families = new Map();
for (const e of chromatic) {
  // 12-degree bins: two colours inside one bin are the same family to an eye.
  const bin = Math.round(e.h / 12) * 12;
  if (!families.has(bin)) families.set(bin, []);
  families.get(bin).push(e);
}
const inBand = chromatic.filter((e) => e.h >= BAND.lo && e.h <= BAND.hi);

console.log(`census     : ${seen.size} colours, ${chromatic.length} chromatic (sat >= ${NEUTRAL_SAT})`);
console.log(`  hue families (12° bins): ${families.size}`);
for (const bin of [...families.keys()].sort((a, b) => a - b)) {
  const group = families.get(bin);
  const names = group.map((e) => e.name).slice(0, 4).join(', ');
  const band = bin >= BAND.lo - 6 && bin <= BAND.hi + 6 ? ' [in the reference band]' : '';
  console.log(`    ${String(bin).padStart(3)}°  ${String(group.length).padStart(2)}  ${names}${group.length > 4 ? ' …' : ''}${band}`);
}
console.log(`  in the reference band ${BAND.lo}-${BAND.hi}°: ${inBand.length} of ${chromatic.length}`);
console.log('  NOTE: the one-accent collapse lives in src/art/palette.js, which the UI');
console.log('        stream does not own. This census is evidence for that decision, not');
console.log('        a gate on it. See FLAG 10 in docs/review/wave-plan.md.');

// ---------------------------------------------------------------------------
// 2. The semantic-collision gate. This one is a defect, and it exits non-zero.
// ---------------------------------------------------------------------------

/**
 * Colours with DIFFERENT documented meanings. Taken from `theme.js`'s own SEMANTIC
 * block and the header above it, which is the contract the code claims to keep.
 */
const MEANINGS = [
  ['HEAT / COST', 'C.warn'],
  ['STRUCTURAL LOSS', 'C.hostile'],
  ['SALVAGE', 'C.salvage'],
  ['FRIENDLY / SOLUTION', 'C.friendly'],
  ['SELECTION', 'C.select'],
  ['SHIELD', 'C.shield'],
];

const HUE_FLOOR = 12;      // degrees
const LUM_FLOOR = 1.5;     // relative luminance ratio

const collisions = [];
for (let i = 0; i < MEANINGS.length; i++) {
  for (let j = i + 1; j < MEANINGS.length; j++) {
    const a = seen.get(MEANINGS[i][1]);
    const b = seen.get(MEANINGS[j][1]);
    if (!a || !b) continue;
    const dh = hueGap(a.h, b.h);
    const dl = contrast(a.rgb, b.rgb);
    if (dh < HUE_FLOOR && dl < LUM_FLOOR) {
      collisions.push(`${MEANINGS[i][0]} (${a.name} hue ${a.h.toFixed(1)}) vs `
        + `${MEANINGS[j][0]} (${b.name} hue ${b.h.toFixed(1)}): `
        + `${dh.toFixed(1)}° apart at ${dl.toFixed(2)}:1 — two meanings, one colour`);
    }
  }
}

console.log(`collision  : ${collisions.length ? `${collisions.length} FAIL` : 'ok'}`);
for (const c of collisions) console.log(`  ${c}`);

if (collisions.length) {
  console.log('');
  console.log('  PROPOSAL TO THE MATERIALS STREAM (src/art/palette.js is theirs, not UI\'s):');
  console.log('    move player.warn into the reference amber band, ~#e07a1e (hue 26), and');
  console.log('    pull NEUTRAL.hostile to a darker, less saturated red so VALUE separates');
  console.log('    it from amber. Re-run `npm run uicheck` on every substitution — the');
  console.log('    4.5:1 floor is computed against C.panel and is stricter than any');
  console.log('    reference game. Prefer changing SATURATION and keeping value.');
}

process.exit(censusOnly ? 0 : (collisions.length ? 1 : 0));
