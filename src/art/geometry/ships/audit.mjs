/**
 * HEADLESS FLEET AUDIT.
 *
 *     node src/art/geometry/ships/audit.mjs
 *
 * Builds every registered ship class at every LOD it declares and prints
 * triangles, draw buckets, and MEASURED extents against the declared length.
 * Then runs the hull-line rules from docs/design/ship-language.md §2 over every
 * primary station table. Exits non-zero on a triangle-budget breach, on a class
 * whose measured length disagrees with its declared length by more than 5%, or on
 * a hull-line rule failure that is not explicitly exempt.
 *
 * This is the sibling of modules/audit.mjs and it exists for the same reason: the
 * probe harness needs a browser, a server and about ninety seconds of software
 * rasterisation, so a change that quietly puts a hull over budget or straightens a
 * prow would otherwise only be caught the next time somebody looked at a picture.
 * Everything above `buildShip()` in common.js is pure geometry, which is what makes
 * this possible at all - see the header of that file.
 *
 * DRAW COUNTS HERE ARE LOD0's. `buildShip` collapses every damage group into one
 * past LOD0, so the real LOD1/LOD2 draw counts are lower than the numbers printed
 * here; this tool counts the buckets `partsFor` produces, which is the pessimistic
 * figure and the right one to hold a budget against.
 */
import { RNG } from '../../../core/rng.js';
import { ALL_SHIP_CLASSES } from './index.js';
import {
  auditParts, silhouetteSignature, silhouetteDivergence, CLASS_DIVERGENCE,
} from './common.js';
import { CV_HULL, FG_HULL, MN_HULL, DD_FORE, CR_SIDE } from './coalition.js';
import { CC_HULL, MR_HULL, HC_HULL, PG_HULL, SL_HULL } from './concord.js';

/** [label, Lines, hull length, exemption reason or null] */
const LINE_AUDIT = [
  ['Lancet', CV_HULL, 95, null],
  ['Ardent', FG_HULL, 210, null],
  ['Sledge', MN_HULL, 420, null],
  // R2.2 asks the plan half-beam curve for one interior minimum. On these two the
  // waist is not a station, it is a VOID, and a table describing one of the two
  // pieces cannot express it. Exempt WITH THE REASON rather than made to pass.
  ['Bulwark(fore)', DD_FORE, 480, 'waist is the open gap at z +-40'],
  ['Anvil(side)', CR_SIDE, 900, null],
  ['Whipcord', CC_HULL, 95, 'waist is the gap between the tail booms'],
  ['Meridian', MR_HULL, 210, null],
  ['Halcyon', HC_HULL, 300, null],
  ['Peregrine', PG_HULL, 480, null],
  ['Solace', SL_HULL, 620, null],
];

let failed = false;

const rows = [];
for (const def of ALL_SHIP_CLASSES) {
  const per = [];
  for (let lod = 0; lod < (def.lodLevels ?? 3); lod++) {
    per.push(auditParts(def.partsFor, new RNG(`audit:${def.id}:${lod}`), lod));
  }
  const b = per[0].bounds;
  const measured = b.max.z - b.min.z;
  const drift = Math.abs(measured - def.length) / def.length;
  const over = per[0].triangles > def.triBudget;
  if (over || drift > 0.05) failed = true;
  rows.push({
    id: def.id,
    declared: def.length,
    measured: +measured.toFixed(1),
    beam: +(b.max.x - b.min.x).toFixed(1),
    height: +(b.max.y - b.min.y).toFixed(1),
    tris: per.map((p) => p.triangles).join('/'),
    // `draws` is the raw (group x surface) bucket count. `real` is what buildShip
    // actually issues: LOD0 keeps its damage groups, everything past it collapses
    // into one group, so past LOD0 the draw count is just the number of distinct
    // surfaces. The gap between the two columns is what that collapse buys.
    draws: per.map((p) => p.draws).join('/'),
    real: per.map((p, i) => (i === 0 ? p.draws : Object.keys(p.bySurface).length)).join('/'),
    budget: def.triBudget,
    flag: [over ? 'OVER BUDGET' : '', drift > 0.05 ? `LENGTH ${(drift * 100).toFixed(0)}% OFF` : '']
      .filter(Boolean).join(' + '),
  });
}
console.table(rows);

console.log('\nHULL LINES  (ship-language.md §2)');
console.log('  R2.1 longest contiguous +-4% half-beam run <= 11% of L');
console.log('  R2.2 exactly one interior minimum and one interior maximum in the plan curve');
console.log('  R2.3 smallest interior section <= 0.70 of the largest');
console.log('  R2.5 forwardmost station centre >= 1% of L below the axis\n');
for (const [name, lines, L, exempt] of LINE_AUDIT) {
  const a = lines.audit(L);
  const ok = [
    a.flatRunFrac <= 0.11,
    exempt ? true : a.minima === 1,
    a.maxima === 1,
    exempt ? true : a.waistRatio <= 0.70,
    a.tipBelowAxis >= L * 0.01,
  ];
  if (!ok.every(Boolean)) failed = true;
  console.log(
    `  ${name.padEnd(14)} flat ${(a.flatRunFrac * 100).toFixed(1).padStart(5)}%${ok[0] ? ' ' : '!'}`
    + `  min ${a.minima}${ok[1] ? ' ' : '!'} max ${a.maxima}${ok[2] ? ' ' : '!'}`
    + `  waist ${a.waistRatio.toFixed(2)}${ok[3] ? ' ' : '!'}`
    + `  tip -${a.tipBelowAxis.toFixed(1)}m${ok[4] ? ' ' : '!'}`
    + `  ${ok.every(Boolean) ? (exempt ? `PASS (exempt: ${exempt})` : 'PASS') : 'FAIL'}`,
  );
}

// ---------------------------------------------------------------------------
// PAIRWISE CLASS DIVERGENCE
//
// "Every faction ship class distinguishable from every other" was a PARTIAL in the
// acceptance doc for two passes running, held up by nothing but somebody looking at
// the silhouette sheet. Every pair of the thirteen classes is now measured against
// the 30 px read (see CLASS_DIVERGENCE in common.js). Strike craft are compared
// only with each other and with capitals of their own faction: a fighter next to a
// carrier is never the ambiguity anybody worries about, but a 200 m-normalised
// fighter against a 200 m-normalised frigate is a comparison the sheet does make,
// so it stays in.
// ---------------------------------------------------------------------------
const REF = 200;                                     // the silhouette sheet's length
const sigs = ALL_SHIP_CLASSES.map((def) => ({
  id: def.id,
  faction: def.faction,
  sig: silhouetteSignature(def.partsFor, new RNG(`sil:${def.id}`)),
}));

const pairs = [];
for (let i = 0; i < sigs.length; i++) {
  for (let j = i + 1; j < sigs.length; j++) {
    const d = silhouetteDivergence(sigs[i].sig, sigs[j].sig, REF);
    pairs.push({
      pair: `${sigs[i].id} / ${sigs[j].id}`,
      mean: +d.mean.toFixed(1),
      max: +d.max.toFixed(1),
      ok: d.mean >= CLASS_DIVERGENCE.mean * REF && d.max >= CLASS_DIVERGENCE.max * REF,
    });
  }
}
pairs.sort((a, b) => a.mean - b.mean);
const bad = pairs.filter((p) => !p.ok);
if (bad.length) failed = true;

console.log('\nPAIRWISE SILHOUETTE DIVERGENCE  (every hull normalised to 200 m, so this is'
  + '\nabout SHAPE and not about size; targets are one and three pixels at the 30 px read)');
console.log(`  mean >= ${(CLASS_DIVERGENCE.mean * REF).toFixed(1)} m    max >= ${(CLASS_DIVERGENCE.max * REF).toFixed(1)} m\n`);
console.log('  ten closest pairs of ' + pairs.length + ':');
for (const p of pairs.slice(0, 10)) {
  console.log(`  ${p.pair.padEnd(52)} mean ${String(p.mean).padStart(5)}  max ${String(p.max).padStart(5)}  ${p.ok ? 'ok' : 'TOO CLOSE'}`);
}
console.log(`  ${bad.length ? `*** ${bad.length} PAIR(S) TOO CLOSE ***` : 'every pair separated'}`);

console.log(`\n${rows.length} classes   ${failed ? '*** AUDIT FAILED ***' : 'ALL CLASSES WITHIN BUDGET AND ON LINE'}`);
process.exit(failed ? 1 : 0);
