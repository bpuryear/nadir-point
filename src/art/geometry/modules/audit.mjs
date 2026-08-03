/**
 * HEADLESS MODULE AUDIT — triangles, and whether the library reads.
 *
 *     node src/art/geometry/modules/audit.mjs
 *
 * Builds all twenty-four modules at LOD0 and LOD1 and prints the count table, then
 * FITS every module of a mount to a real cruiser and measures whether the fitted
 * outlines are actually tellable apart. Exits non-zero if any module is over
 * units.js#BUDGET.moduleTris or if a pair on one mount is too close to separate.
 *
 * FOUR SECTIONS, and the last two are the adaptation contract:
 *   triangles + LOD0/LOD1 counts
 *   fitted silhouette separation, and M7 tag sets
 *   FIT DECLARATIONS - every `ModuleDef.fit` measured against the geometry it describes,
 *                      plus the three properties that decide whether adaptation can do
 *                      anything at all: mass-band coverage, service spread, and the seat
 *                      equivalence classes the hull's determinism test must reproduce
 *   THE VALIDATOR HAS TEETH - seven malformed declarations, seven throws
 *
 * The material registry is stubbed, deliberately: geometry does not care what
 * material it is handed, and stubbing it is what lets this run in node instead of
 * only inside the probe harness. The PROBE is what proves the materials are real -
 * see src/probes/modules.js, which runs the same audit against the live registry.
 *
 * WHY THE SECOND HALF EXISTS. The acceptance criterion "every module identifiable
 * from silhouette alone at max tactical zoom" was recorded PARTIAL with the honest
 * note that the evidence was a contact sheet rather than a measurement, and the
 * three failures it named (armour belt, flak cluster, torpedoes vs breaching prow)
 * were argued closed in prose. Prose does not survive the next edit. This does.
 */
import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { buildCruiser } from '../cruiser.js';
import { attachModule } from '../hardpoints.js';
import { auditModules, auditTable, modulesForHardpoint, modulesInMountOrder } from './index.js';
import { fitProfile, fitKey, registerModule } from '../../../core/contracts.js';
import { outlineSignatures, outlineDivergence, MODULE_DIVERGENCE } from './kit.js';

const stub = new THREE.MeshBasicMaterial();
const materials = { get: () => stub, has: () => true };

const report = auditModules((def, lod) => ({
  rng: new RNG(`audit:${def.id}:${lod}`),
  materials,
  palette: {},
  faction: def.faction,
  lod,
}));

console.log(auditTable(report));

// ---------------------------------------------------------------------------
// FITTED SILHOUETTE SEPARATION, one mount at a time
// ---------------------------------------------------------------------------

/**
 * LOD0 of a bare cruiser, plus whatever is hanging on its hardpoints.
 *
 * `hull.root.updateMatrixWorld(true)` IS LOad-BEARING and it is worth saying why,
 * because it cost this audit its first set of numbers. A module is a child of a
 * SOCKET, and the socket carries the whole mount offset - [0, 94, -40] for the
 * dorsal, [0, 32, 420] for the bow. Until something updates the hierarchy those
 * sockets' world matrices are identity, and `Box3.setFromObject` does not fix that:
 * it updates the object's ANCESTOR CHAIN's local matrices, not their world
 * matrices, so a bow module measures as if it were bolted to the middle of the ship
 * and a dorsal turret as if it stood on the keel. The first run of this audit
 * measured the rail battery topping out at y = 142 when it really reaches 236, and
 * every "too close" verdict it printed was against the wrong geometry.
 */
function fitted(hardpoint, def) {
  const hull = buildCruiser({
    rng: new RNG(`fit:${def ? def.id : 'bare'}`), materials, palette: {}, faction: 'player', lod: 0,
  });
  if (def) {
    attachModule(hull, hardpoint, def, {
      rng: new RNG(`fit:mod:${def.id}`), materials, palette: {}, faction: def.faction, lod: 0,
    });
  }
  hull.root.updateMatrixWorld(true);
  const out = [hull.lod.levels[0].object];
  for (const e of hull.hardpoints.values()) if (e.object) out.push(e.object);
  return out;
}

let sepFailed = false;
console.log('\nFITTED SILHOUETTE SEPARATION  (module vs module on the same mount, on a real'
  + '\n1400 m hull, binned over the union of the fitted envelopes)');
console.log(`  peak >= ${MODULE_DIVERGENCE.max} m somewhere on the outline (3 px at the 30 px read)`);
console.log(`  mean >= ${MODULE_DIVERGENCE.mean} m over the bins the two modules actually touch (1 px)\n`);

for (const hp of ['bow', 'dorsal', 'ventral', 'port', 'engine']) {
  const mods = modulesForHardpoint(hp);
  const entries = [{ id: '<bare>', objects: fitted(hp, null) }]
    .concat(mods.map((def) => ({ id: def.id, objects: fitted(hp, def) })));
  const sigs = outlineSignatures(entries);
  const bare = sigs[0];
  const fits = sigs.slice(1);

  // Which bins does a module change at all? Anything within a metre of the bare
  // hull is hull, not module, and averaging over it would score a mount by how
  // much of the ship it is NOT on.
  const touched = fits.map((s) => s.bins.map((b, i) => {
    const r = bare.bins[i];
    return Math.abs(b.halfWidth - r.halfWidth) > 1
      || Math.abs(b.top - r.top) > 1 || Math.abs(b.bottom - r.bottom) > 1;
  }));

  const rows = [];
  for (let i = 0; i < fits.length; i++) {
    for (let j = i + 1; j < fits.length; j++) {
      const d = outlineDivergence(fits[i], fits[j]);
      // Mean restricted to the union of the two modules' footprints, and taken as
      // the PER-BIN MAXIMUM across the three channels rather than their average.
      //
      // Averaging the three is right for a whole loadout, where mounts on the beam,
      // the keel and the deck all move. It is wrong for one mount: two dorsal
      // modules can only move the TOP of the outline - half-beam and keel are the
      // hull's and identical by construction - so averaging in two channels that
      // are structurally pinned to zero divides every dorsal score by three and
      // measures the mount's position rather than the modules' difference. The
      // per-bin maximum answers the question actually being asked: at this station,
      // how far did the outline move?
      let s = 0, n = 0;
      for (let k = 0; k < fits[i].bins.length; k++) {
        if (!touched[i][k] && !touched[j][k]) continue;
        const a = fits[i].bins[k], b = fits[j].bins[k];
        s += Math.max(
          Math.abs(a.halfWidth - b.halfWidth),
          Math.abs(a.top - b.top),
          Math.abs(a.bottom - b.bottom),
        );
        n += 1;
      }
      const local = n ? s / n : 0;
      const ok = d.max >= MODULE_DIVERGENCE.max && local >= MODULE_DIVERGENCE.mean;
      if (!ok) sepFailed = true;
      rows.push({ a: fits[i].id, b: fits[j].id, local, max: d.max, ok });
    }
  }
  rows.sort((x, y) => (x.local + x.max) - (y.local + y.max));
  const worst = rows[0];
  const bad = rows.filter((r) => !r.ok);
  console.log(`  ${hp.toUpperCase().padEnd(8)} ${rows.length} pairs   closest: `
    + `${worst.a.replace(hp + '_', '')} / ${worst.b.replace(hp + '_', '')}`.padEnd(42)
    + `mean ${worst.local.toFixed(0).padStart(4)}  peak ${worst.max.toFixed(0).padStart(4)}  `
    + `${bad.length ? `*** ${bad.length} PAIR(S) TOO CLOSE ***` : 'all separated'}`);
  for (const r of bad.slice(bad[0] === worst ? 1 : 0)) {
    console.log(`      also: ${r.a} / ${r.b}  mean ${r.local.toFixed(0)}  peak ${r.max.toFixed(0)}`);
  }
}

// ---------------------------------------------------------------------------
// M7 — SILHOUETTE TAGS ARE A CONTRACT, AND THIS IS THE GATE
// ---------------------------------------------------------------------------
//
// ship-language.md §6 M7: "Two modules on the same hardpoint must not share their
// full tag set; the refit screen and the audit should both be able to fail on that."
// It has been declared since the contracts file was written and never enforced, and
// an unenforced contract is a comment. Round-one blind review found ten of the
// twenty-four modules "visually interchangeable when fitted ... every one reads as
// the hull with a long thin tube pointing forward", which is exactly the failure the
// tag set exists to name: the tags ARE the designer's own claim about what shape
// this thing is, so two modules that make the same claim are the same module.
//
// The measurement above is the outline; this is the intent. They fail differently
// and they are both worth having - the outline audit passes two tubes of different
// lengths, and this one does not.
const TAG_MIN_DIFF = 2;
let tagFailed = false;

console.log('\nM7 — SILHOUETTE TAG SETS  (two modules on one mount may not make the same'
  + `\nclaim about their shape; at least ${TAG_MIN_DIFF} tags must differ)\n`);

for (const hp of ['bow', 'dorsal', 'ventral', 'port', 'engine']) {
  const defs = modulesForHardpoint(hp);
  const bad = [];
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const a = new Set(defs[i].silhouetteTags ?? []);
      const b = new Set(defs[j].silhouetteTags ?? []);
      if (!a.size || !b.size) { bad.push([defs[i].id, defs[j].id, 'a module with no tags']); continue; }
      let shared = 0;
      for (const t of a) if (b.has(t)) shared++;
      const diff = (a.size - shared) + (b.size - shared);
      if (diff < TAG_MIN_DIFF) bad.push([defs[i].id, defs[j].id, `${diff} tag(s) differ`]);
    }
  }
  if (bad.length) {
    tagFailed = true;
    for (const [x, y, why] of bad) console.log(`  *** ${x} / ${y}: ${why}`);
  } else {
    console.log(`  ${hp.toUpperCase().padEnd(8)} ${defs.length} modules, every tag set distinct`);
  }
}

// ---------------------------------------------------------------------------
// THE FIT DECLARATION — the adaptation contract, measured rather than believed
// ---------------------------------------------------------------------------
//
// `ModuleDef.fit` is two authored numbers and one authored enum, and the hull builds
// real geometry off all three. Authored data that nothing measures is authored data that
// drifts: the whole point of `footprintM` is that it is the module's ROOT and not its
// bounding box, and nothing about writing `[204, 820]` in a file makes that true.
//
// So this section BUILDS every module and measures the root the declaration claims,
// exactly as `FitDecl` defines it: the plan extent of the LOD0 geometry within the first
// sixteen metres outboard of the mount face, in the seat's own two in-plane axes. A
// declaration more than FIT_TOLERANCE away from the measurement fails the gate and prints
// the number that would be right.
//
// WHY 30% AND NOT 5%. The declaration has to survive an art retouch - a plate moved four
// metres must not fail a gate - while still catching the two errors that actually happen:
// the bounding box declared instead of the root (3-5x on this library, measured), and the
// two axes written the wrong way round (which on eighteen of twenty-four modules is a
// >30% swing). It is a lie detector, not a duplicate of the geometry.
//
// The measurement is LOD0-only and that is load-bearing: LOD1 roots differ from LOD0 by
// up to 78% (engine_armour_belt, 516 -> 116 m across), so a check that did not pin the
// LOD would pass or fail on which build it happened to look at. It is seed-independent -
// verified across two unrelated RNG seeds, byte-equal - so it is a property of the
// module and not of the run.
const FIT_TOLERANCE = 0.30;

/**
 * The seat's two in-plane axes per mount, and which way is outboard.
 *
 * This mirrors `cruiser.js#SEAT`'s `face` column and its "the tuples are written in
 * (across, along-ship) and mapped" rule. Five mounts present a pan whose plane is
 * (world X, world Z); the drive well faces aft, so its second axis is the vertical -
 * which is what the SEAT table's own engine tuples do.
 *
 * o = outward axis index and sign; a = the `across` axis; l = the `alongShip` axis.
 */
const SEAT_AXES = {
  bow: { o: [1, 1], a: 0, l: 2 },
  dorsal: { o: [1, 1], a: 0, l: 2 },
  ventral: { o: [1, -1], a: 0, l: 2 },
  port: { o: [1, 1], a: 0, l: 2 },
  starboard: { o: [1, 1], a: 0, l: 2 },
  engine: { o: [2, -1], a: 0, l: 1 },
};

/** Depth of the root band, metres outboard of the mount face. Part of FitDecl. */
const ROOT_BAND_M = 16;

/** Measured root plan extent of a module's LOD0 geometry. See FitDecl. */
function measureRoot(def) {
  const obj = def.build({
    rng: new RNG(`fit:${def.id}`), materials, palette: {}, faction: def.faction, lod: 0,
  });
  obj.updateMatrixWorld(true);
  const ax = SEAT_AXES[def.hardpoint];
  const v = new THREE.Vector3();
  const span = [Infinity, -Infinity, Infinity, -Infinity];
  const take = (m) => {
    const p = m.geometry?.getAttribute('position');
    if (!p) return;
    const mats = [];
    if (m.isInstancedMesh) {
      const im = new THREE.Matrix4();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, im);
        mats.push(new THREE.Matrix4().multiplyMatrices(m.matrixWorld, im));
      }
    } else mats.push(m.matrixWorld);
    for (const mat of mats) {
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k).applyMatrix4(mat);
        const c = [v.x, v.y, v.z];
        const out = c[ax.o[0]] * ax.o[1];
        if (out < 0 || out > ROOT_BAND_M) continue;
        if (c[ax.a] < span[0]) span[0] = c[ax.a];
        if (c[ax.a] > span[1]) span[1] = c[ax.a];
        if (c[ax.l] < span[2]) span[2] = c[ax.l];
        if (c[ax.l] > span[3]) span[3] = c[ax.l];
      }
    }
  };
  obj.traverse((o) => { if (o.isMesh) take(o); });
  obj.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  return Number.isFinite(span[0]) ? [span[1] - span[0], span[3] - span[2]] : null;
}

let fitFailed = false;
console.log('\nFIT DECLARATIONS  (ModuleDef.fit — what the hull reads to adapt to a fit)'
  + `\n  footprintM is the ROOT plan extent at the mount face; measured within ${ROOT_BAND_M} m of it,`
  + `\n  at LOD0, and failed if the declaration is more than ${(FIT_TOLERANCE * 100).toFixed(0)}% off the measurement.`
  + '\n  norm is that footprint as 0..1 in the mount\'s frozen reference span (units.js#FIT).\n');
console.log('ID                          MASS CL  DECLARED     MEASURED     ERR     NORM       SERVICE   SEAT KEY');

const fits = [];
for (const def of modulesInMountOrder()) {
  const m = measureRoot(def);
  const p = fitProfile(def);
  const d = def.fit.footprintM;
  const err = m ? [Math.abs(d[0] - m[0]) / m[0], Math.abs(d[1] - m[1]) / m[1]] : [1, 1];
  const worst = Math.max(err[0], err[1]);
  const bad = !m || worst > FIT_TOLERANCE;
  if (bad) fitFailed = true;
  fits.push({ def, p, measured: m });
  console.log(
    def.id.padEnd(26),
    String(def.mass).padStart(5), String(p.massClass).padStart(2), ' ',
    `${String(d[0]).padStart(4)}x${String(d[1]).padStart(4)}`,
    m ? `${m[0].toFixed(0).padStart(5)}x${m[1].toFixed(0).padStart(4)}` : '   no root  ',
    `${(worst * 100).toFixed(0).padStart(4)}%`,
    `${p.norm[0].toFixed(2)} ${p.norm[1].toFixed(2)}`,
    p.service.padEnd(9),
    fitKey(def),
    bad ? `  *** DECLARE [${m ? `${m[0].toFixed(0)}, ${m[1].toFixed(0)}` : '?'}] ***` : '',
  );
}

// ---- The three properties that decide whether adaptation can do anything ----
//
// A contract can be perfectly well-formed and still be inert. These are the checks that
// ask whether the DATA has any range in it, because a library where every module is the
// same load, the same size and plumbed to the same place produces six identical seats and
// the feature is decoration with a validator on it.

// 1. MASS-BAND COVERAGE. The coaming height and the plate-run count ride on massClass, so
//    a mount whose modules are all one class has a seat that never moves.
//    The engine mount is exempt and `units.js#FIT.massClassT` explains why in full: its
//    lightest fit is 720 t, no threshold pair can give it a class 1 without emptying
//    class 3 elsewhere, and its seat is a socket rather than a pan.
console.log('\n  MASS-CLASS COVERAGE PER MOUNT   (the coaming and the plate runs ride on this)');
for (const hp of ['bow', 'dorsal', 'ventral', 'port', 'engine']) {
  const rows = fits.filter((f) => f.def.hardpoint === hp);
  const byClass = [1, 2, 3].map((c) => rows.filter((f) => f.p.massClass === c).map((f) => f.def.mass));
  const empty = byClass.filter((b) => !b.length).length;
  const exempt = hp === 'engine';
  if (empty && !exempt) fitFailed = true;
  console.log(`  ${hp.toUpperCase().padEnd(8)} `
    + byClass.map((b, i) => `c${i + 1}: ${(b.join(' ') || '--').padEnd(11)}`).join(' ')
    + (empty ? (exempt ? '  (no class 1 — expected, see units.js#FIT.massClassT)' : '  *** A BAND IS EMPTY ***') : ''));
}

// 2. SERVICE SPREAD. The trunk's bearing is the only thing `service` moves. One service
//    across a whole mount family means one bearing, and element five of §B.2 is dead.
console.log('\n  SERVICE SPREAD PER MOUNT        (the trunk bearing is the only thing this moves)');
for (const hp of ['bow', 'dorsal', 'ventral', 'port', 'engine']) {
  const svc = fits.filter((f) => f.def.hardpoint === hp).map((f) => f.p.service);
  const distinct = new Set(svc);
  if (distinct.size < 2) fitFailed = true;
  console.log(`  ${hp.toUpperCase().padEnd(8)} ${distinct.size} distinct: ${[...distinct].join(', ')}`
    + (distinct.size < 2 ? '   *** ONE BEARING FOR THE WHOLE MOUNT ***' : ''));
}

// 3. SEAT EQUIVALENCE CLASSES. Two modules with the same key must produce byte-identical
//    seat geometry - that is the determinism rule, and it is what makes this adaptation
//    rather than a lookup table. THIS IS NOT A FAILURE. It is the expected-set for the
//    hull-side half of the test, which needs `hullParts({ fit })` and therefore lives with
//    the cruiser: whatever else changes, these pairs must hash equal and every other pair
//    on a mount must not.
const byKey = new Map();
for (const f of fits) {
  const k = fitKey(f.def);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(f.def.id);
}
const shared = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
console.log(`\n  SEAT EQUIVALENCE CLASSES        ${byKey.size} distinct seats over ${fits.length} modules`);
if (!shared.length) console.log('  every module resolves to its own seat');
for (const [k, ids] of shared) console.log(`  ${k}  ->  ${ids.join('  ')}   (must hash equal)`);

// ---------------------------------------------------------------------------
// THE VALIDATOR HAS TEETH — seven defects, seven throws
// ---------------------------------------------------------------------------
//
// The same argument the M7 block above makes: an unenforced contract is a comment. A
// validator is worse than a comment, because it LOOKS enforced. `validateFit` throws on
// six kinds of malformed declaration and it took two edits to write; the way it stops
// throwing is that somebody wraps it in a try/catch, or reorders `validate()` so the fit
// branch is unreachable, or "temporarily" demotes it during a merge and forgets. None of
// those show up in a diff review of a 700-line file.
//
// So the throws are asserted here, against defs that never enter the registry - a def
// that throws in `validate()` is rejected before `_modules.set`, so this pollutes nothing
// and needs no teardown. It costs no geometry and about a millisecond.
//
// The last case is the interesting one and it is why this is not just a shape check: a
// cannon fed `shell` out of the ship's magazine cannot declare that its trunk runs to the
// reactor, because BOTH HALVES ARE ALREADY ON THE SAME DEFINITION and disagree.
const badFits = [
  ['a bounding box declared as a root', { fit: { footprintM: [1200, 40], service: 'reactor' } }],
  ['a footprint with one number', { fit: { footprintM: [40], service: 'reactor' } }],
  ['a NaN footprint', { fit: { footprintM: [40, NaN], service: 'reactor' } }],
  ['a service that is not a service', { fit: { footprintM: [40, 40], service: 'plumbing' } }],
  ['no service at all', { fit: { footprintM: [40, 40] } }],
  ['a fit with no mass to derive a class from', { mass: undefined, fit: { footprintM: [40, 40], service: 'reactor' } }],
  ['a shell-fed gun plumbed to the reactor', {
    fit: { footprintM: [40, 40], service: 'reactor' },
    muzzles: [[0, 0, 0]],
    weapon: {
      id: 'w_neg', name: 'neg', type: 'cannon', range: 1, damage: 1, shotsPerBurst: 1,
      burstInterval: 0, cooldown: 1, projectileSpeed: 1, tracking: 1, powerDraw: 1,
    },
  }],
];
let teethFailed = false;
console.log('\n  THE VALIDATOR HAS TEETH         (contracts.js#validateFit, against defs that are never kept)');
for (const [label, extra] of badFits) {
  const def = {
    id: `_negative_${label.replace(/\W+/g, '_')}`, name: 'negative', hardpoint: 'port', tier: 1,
    faction: 'coalition', description: 'never registered', triBudget: 400, mass: 300,
    build: () => new THREE.Group(), ...extra,
  };
  let threw = false;
  try { registerModule(def); } catch { threw = true; }
  if (!threw) teethFailed = true;
  console.log(`  ${threw ? 'rejects ' : '*** ACCEPTS'} ${label}`);
}
if (teethFailed) fitFailed = true;

console.log(`\n${sepFailed ? '*** MODULE SEPARATION FAILED ***' : 'every module on every mount is separable from every other on that mount'}`);
if (tagFailed) console.log('*** M7 TAG CONTRACT FAILED ***');
if (fitFailed) console.log('*** FIT DECLARATION CONTRACT FAILED ***');
process.exit(report.ok && !sepFailed && !tagFailed && !fitFailed ? 0 : 1);
