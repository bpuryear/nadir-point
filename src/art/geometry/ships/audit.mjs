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
import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import * as G from '../greeble.js';
import { hullParts, HULL_STATIONS as CRUISER_HULL_STATIONS } from '../cruiser.js';
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

// ---------------------------------------------------------------------------
// INTRA-FACTION DIVERGENCE, AND A HIGHER BAR FOR IT
// ---------------------------------------------------------------------------
//
// Round-one blind review, on docs/probes/ships.png: "Concord fails class-vs-class
// silhouette distinguishability. Destroyer, escort, frigate and corvette are four
// sizes of the same swept arrowhead ... The faction split is excellent; the
// intra-faction split is not." The audit above passed every one of those pairs,
// and both things were true at once, because the whole-fleet gate is set at ONE
// PIXEL at the 30 px read - which is the floor for "these are not literally the
// same shape", not for "a player can tell these apart in a fleet".
//
// The distinction that matters: a Coalition hull next to a Concord hull is
// separated by design philosophy before it is separated by outline - slab armour
// and external structure against swept continuous surfaces - so a one-pixel
// outline gap there is backed up by everything else in the frame. Two Concord
// hulls have none of that backing. They share faction hue, faction material,
// faction surface treatment and faction plate language, so the OUTLINE IS THE
// ONLY CHANNEL LEFT, and it has to carry the whole load on its own.
//
// So the bar inside a faction is half a pixel more of mean and twice the peak, and
// it is reported per faction so a regression names a navy rather than a fleet.
// Strike craft are excluded HERE and only here. The fleet-wide table above keeps
// them, because a 200 m-normalised fighter against a 200 m-normalised frigate is a
// comparison the silhouette sheet genuinely makes. But an 18 m fighter is never the
// contact a player mistakes for a 480 m destroyer in a fleet - the thing this gate
// exists to prevent - and holding a four-part fighter to a warship's outline budget
// buys nothing that a reviewer would ever see.
const INTRA = { mean: CLASS_DIVERGENCE.mean * 1.5, max: CLASS_DIVERGENCE.max * 2 };
let intraFailed = false;

console.log('\nINTRA-FACTION DIVERGENCE  (two hulls of the same navy share hue, material and'
  + '\nplate language, so the outline is the only channel left and the bar is raised)');
console.log(`  mean >= ${(INTRA.mean * REF).toFixed(1)} m    max >= ${(INTRA.max * REF).toFixed(1)} m   at the 200 m reference length\n`);

for (const faction of ['coalition', 'concord']) {
  const own = sigs.filter((x) => x.faction === faction && !x.id.endsWith('strikecraft'));
  const rows2 = [];
  for (let i = 0; i < own.length; i++) {
    for (let j = i + 1; j < own.length; j++) {
      const d = silhouetteDivergence(own[i].sig, own[j].sig, REF);
      rows2.push({
        pair: `${own[i].id.replace(faction + '_', '')} / ${own[j].id.replace(faction + '_', '')}`,
        mean: +d.mean.toFixed(1), max: +d.max.toFixed(1),
        ok: d.mean >= INTRA.mean * REF && d.max >= INTRA.max * REF,
      });
    }
  }
  rows2.sort((x, y) => x.mean - y.mean);
  const bad2 = rows2.filter((r) => !r.ok);
  if (bad2.length) { intraFailed = true; failed = true; }
  console.log(`  ${faction.toUpperCase()}  ${rows2.length} pairs, three closest:`);
  for (const r of rows2.slice(0, 3)) {
    console.log(`    ${r.pair.padEnd(34)} mean ${String(r.mean).padStart(5)}  max ${String(r.max).padStart(5)}  ${r.ok ? 'ok' : 'TOO CLOSE'}`);
  }
  for (const r of bad2.slice(3)) {
    console.log(`    ${r.pair.padEnd(34)} mean ${String(r.mean).padStart(5)}  max ${String(r.max).padStart(5)}  TOO CLOSE`);
  }
}
if (intraFailed) console.log('  *** INTRA-FACTION SEPARATION FAILED ***');

// ---------------------------------------------------------------------------
// SECTION AND SURFACE — the measurement that says "box stack" as a number
// ---------------------------------------------------------------------------
//
// `docs/probes/cruiser.png` read as a stack of rectangular prisms for four art rounds
// and every review said so in prose. Prose does not survive the next edit. This does.
//
// Weight every LOD0 triangle by AREA and bin its face normal. A stack of axis-aligned
// boxes is ~100% within 5 degrees of a cardinal axis with six normal directions; a
// faceted hull is far lower with many more. Two supporting columns:
//
//   prims  separate primitives in the build, and tris/prim. NOT a draw count - draws
//          are (damage group x surface) and every one of these merges into a bucket -
//          but the mean piece of the old cruiser was 18.7 triangles, i.e. a box, and
//          there were ninety-nine of them. That number IS the diagnosis.
//   top6   area share held by the six largest normal directions.
//
// ONE IMPLEMENTATION NOTE, because it changes every figure. The normals are taken from
// the MERGED geometry, i.e. AFTER each part's `pos`/`rot`/`scale` has been applied.
// A prototype of this script measured `bucket.parts[].geo` directly, which is the
// primitive in its own local frame before placement, so every part placed with a `rot`
// scored as axis-aligned. On the same tree that reads the player cruiser at 74.0% and
// `derelict_ancient_hulk` - which is built almost entirely from rotated pieces - at
// 52.3%. Measured after placement they are 67.8% and 7.2%. The post-placement figure
// is the one that describes what is on screen.
//
// REPORTING ONLY. The bars are printed and flagged; they do not set the exit code,
// because eleven of the fourteen hulls in this fleet fail them today and the wave that
// lands the faction redesigns is the wave that flips this to fail. The red baseline is
// the point: it is written down here so it cannot be quietly forgotten.

const BOX = { axis: 0.45, cruiserAxis: 0.40, clusters: 24, top6: 0.45 };

function surfaceStats(buckets) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const AXIS_COS = Math.cos(5 * Math.PI / 180);
  let total = 0, axis = 0, tris = 0, prims = 0;
  const bins = new Map();
  for (const bk of buckets) {
    prims += bk.parts.length;
    const geo = G.mergeParts(bk.parts, { uv: bk.uv });
    if (!geo) continue;
    const pos = geo.getAttribute('position');
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      const twice = n.length();
      if (twice <= 1e-9) continue;
      n.divideScalar(twice);
      const area = twice * 0.5;
      total += area; tris++;
      if (Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)) >= AXIS_COS) axis += area;
      // 1/8 quantisation of the unit normal: about 7 degrees, which is fine enough to
      // separate two facets of one plate family and coarse enough that a loft's own
      // sweep does not shatter one plane into twenty directions.
      const k = `${Math.round(n.x * 8)},${Math.round(n.y * 8)},${Math.round(n.z * 8)}`;
      bins.set(k, (bins.get(k) ?? 0) + area);
    }
    geo.dispose();
  }
  const sorted = [...bins.values()].sort((x, y) => y - x);
  return {
    tris,
    prims,
    perPrim: prims ? tris / prims : 0,
    axisFrac: total ? axis / total : 0,
    clusters: sorted.filter((v) => v / total >= 0.01).length,
    top6: sorted.slice(0, 6).reduce((s2, v) => s2 + v, 0) / (total || 1),
  };
}

console.log('\nSECTION AND SURFACE  (LOD0, area-weighted face normals, measured AFTER placement)');
console.log(`  axis  fraction of surface area within 5 deg of +-X/+-Y/+-Z.`
  + `  bar <= ${(BOX.axis * 100).toFixed(0)}% (cruiser ${(BOX.cruiserAxis * 100).toFixed(0)}%)`);
console.log(`  clus  distinct normal directions holding >= 1% of area.   bar >= ${BOX.clusters}`);
console.log(`  top6  area share of the six largest normal directions.    bar <= ${(BOX.top6 * 100).toFixed(0)}%`);
console.log('  REPORTING ONLY — see the note in this file. A "!" is a hull still to be redesigned.\n');

{
  const measured = [];
  const cr = hullParts({ rng: new RNG('audit:cruiser:0'), lod: 0 });
  measured.push({ id: 'player_cruiser', bar: BOX.cruiserAxis, ...surfaceStats(cr.buckets) });
  for (const def of ALL_SHIP_CLASSES) {
    const p = def.partsFor({ rng: new RNG(`audit:${def.id}:0`), lod: 0 });
    measured.push({ id: def.id, bar: BOX.axis, ...surfaceStats(p.buckets) });
  }
  for (const m of measured) {
    const f = (ok) => (ok ? ' ' : '!');
    console.log(`  ${m.id.padEnd(24)} tris ${String(m.tris).padStart(5)}`
      + `  prims ${String(m.prims).padStart(4)} at ${m.perPrim.toFixed(1).padStart(5)} each`
      + `  axis ${(m.axisFrac * 100).toFixed(1).padStart(5)}%${f(m.axisFrac <= m.bar)}`
      + ` clus ${String(m.clusters).padStart(3)}${f(m.clusters >= BOX.clusters)}`
      + ` top6 ${(m.top6 * 100).toFixed(1).padStart(5)}%${f(m.top6 <= BOX.top6)}`);
  }
}

// ---------------------------------------------------------------------------
// THE PLAYER CRUISER'S OWN LINES — station count, flatness, sweep, non-parallel
// ---------------------------------------------------------------------------
//
// The cruiser is not in `ALL_SHIP_CLASSES` (it is not a faction class and it has its
// own builder), so nothing in this file used to look at it at all. These are the four
// numbers `docs/design/ship-redesign.md` §3-§4 turns the words "flat" and "sleek" into,
// checked straight off the station table with no rendering.

console.log('\nPLAYER CRUISER LINES  (ship-redesign.md §3 S4, §4 L1/L2/L5)');
{
  const T = CRUISER_HULL_STATIONS;
  const bh = T.map((r) => (2 * r[1]) / (r[2] - r[3]));
  const worstBH = Math.min(...bh);
  const meanBH = bh.reduce((a2, b2) => a2 + b2, 0) / bh.length;

  let worstPara = Infinity, worstParaZ = 0;
  // L2: the half-beam must change by >= 0.8% of the local half-beam per 10 m of z,
  // EXCEPT inside at most two declared calm runs of <= 120 m. The exception is the
  // whole point of the rule: a hull with no calm anywhere has no rest in it, and a
  // hull with one 500 m calm run is the prismatic barge this redesign replaced. So
  // count the runs rather than the worst single pair.
  const calm = [];
  let run = null;
  for (let i = 0; i < T.length - 1; i++) {
    const dz = T[i + 1][0] - T[i][0];
    const dTop = (T[i + 1][2] - T[i][2]) / dz;
    const dBot = (T[i + 1][3] - T[i][3]) / dz;
    const para = Math.abs(dTop - dBot);
    if (para < worstPara) { worstPara = para; worstParaZ = T[i][0]; }
    const rate = Math.abs((T[i + 1][1] - T[i][1]) / T[i][1]) / (dz / 10);
    if (rate < 0.008) {
      if (run && run.z1 === T[i][0]) run.z1 = T[i + 1][0];
      else { run = { z0: T[i][0], z1: T[i + 1][0] }; calm.push(run); }
    } else run = null;
  }
  const longestCalm = calm.length ? Math.max(...calm.map((c2) => c2.z1 - c2.z0)) : 0;
  const calmDesc = calm.length
    ? `${calm.length} calm run(s), longest ${longestCalm} m at z ${calm.find((c2) => c2.z1 - c2.z0 === longestCalm).z0}`
    : 'no calm runs';

  const checks = [
    ['L1  stations >= 26', T.length >= 26, `${T.length}`],
    ['S4  section B:H >= 1.70 worst', worstBH >= 1.70, `worst ${worstBH.toFixed(2)}  mean ${meanBH.toFixed(2)}`],
    ['L2  <= 2 calm runs, each <= 120 m', calm.length <= 2 && longestCalm <= 120, calmDesc],
    ['L5  deck and keel never parallel', worstPara >= 0.04, `closest ${worstPara.toFixed(3)} at z ${worstParaZ}`],
  ];
  for (const [name, ok, detail] of checks) {
    if (!ok) failed = true;
    console.log(`  ${name.padEnd(34)} ${ok ? 'PASS' : 'FAIL'}   ${detail}`);
  }
}

console.log(`\n${rows.length} classes   ${failed ? '*** AUDIT FAILED ***' : 'ALL CLASSES WITHIN BUDGET AND ON LINE'}`);
process.exit(failed ? 1 : 0);
