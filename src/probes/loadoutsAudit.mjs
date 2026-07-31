/**
 * THE LOADOUT SEPARATION GATE — headless, two seconds, and it can FAIL.
 *
 *     node src/probes/loadoutsAudit.mjs
 *
 * THE CRITERION: three complete loadouts of the same cruiser must be tellable apart
 * from OUTLINE ALONE. A player glancing at a contact at four kilometres has an
 * outline and nothing else; if two builds of this ship produce the same one, the
 * modules are decoration and the refit screen is a menu of numbers.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHY IT IS NOT `src/probes/loadouts.js`
 * ---------------------------------------------------------------------------
 * `loadouts.js` computed exactly this number and wrote PASS/FAIL into a PNG. It set
 * no process exit code - it cannot, it runs in Chromium - `tools/probe.mjs` only
 * fails on a console error, and `loadouts` was not in `tools/gates.mjs`. So the
 * criterion was enforced by a human opening an image and reading a caption.
 * `docs/review/acceptance.md` records that pattern producing a false PASS once
 * already, off a stale sheet. A gate that cannot fail is not a gate.
 *
 * ONE SOURCE OF TRUTH. The loadout table, the divergence maths and the targets are
 * all imported from `loadouts.js`. This file adds a stub material registry, the
 * headless build, the per-channel report and `process.exit`. There is no second copy
 * of anything, so the picture and the gate cannot drift the way the two sheets did.
 *
 * THE STUB REGISTRY is the same trick `src/art/geometry/modules/audit.mjs` uses and
 * it is sound for exactly one reason: this is a measurement of GEOMETRY. Every vertex
 * binned below comes out of the same `buildCruiser` / `attachModule` calls the game
 * makes, and a vertex does not care what material it is handed. What the stub cannot
 * check is that the materials are real; `src/probes/materials.js` and the lit sheet
 * do that.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT PRINTS AND WHY THE PER-CHANNEL BREAKDOWN IS MANDATORY
 * ---------------------------------------------------------------------------
 * Three channels per z-bin: half-beam, top and bottom. They are not interchangeable.
 * `halfWidth` is what the two sponsons move, `top` is the dorsal and the bow, and
 * `bottom` is the ventral AND NOTHING ELSE - with the ventral mount emptied the
 * keel-line divergence across the three pairs measures 0.1 / 4.6 / 4.8 m. So any
 * change to the ventral spends one channel of three, and a worst-pair mean quoted on
 * its own cannot distinguish a redesign that survives from one that has quietly
 * deleted a third of the criterion. `--empty ventral` reproduces that measurement.
 *
 * FLAGS
 *   --empty <mount>   leave one mount unfitted in all three loadouts, and report
 *                     without gating. This is the counterfactual that tells you what
 *                     a mount is actually carrying.
 *   --json            machine-readable, for a bisect.
 */
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { buildCruiser } from '../art/geometry/cruiser.js';
import { attachModule, getSilhouetteSignature } from '../art/geometry/hardpoints.js';
import { getModule } from '../core/contracts.js';
import { LOADOUTS, LOADOUT_TARGETS, diff } from './loadouts.js';
import '../art/geometry/modules/index.js';

const stub = new THREE.MeshBasicMaterial();
const materials = { get: () => stub, has: () => true };

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null;
};
const empty = flag('empty');
const asJson = !!flag('json');

/**
 * Build one loadout and return its signature.
 *
 * `getSilhouetteSignature` calls `root.updateMatrixWorld(true)` itself, which is the
 * step that cost `modules/audit.mjs` its first set of numbers: a module is a child of
 * a SOCKET carrying the whole mount offset, and until the hierarchy is updated those
 * sockets are at the origin. Measured without it, every module reads as bolted to the
 * middle of the ship.
 */
function build(L) {
  const hull = buildCruiser({
    rng: new RNG(`loadout:${L.id}`), materials, palette: {}, faction: 'player', lod: 0,
  });
  hull.lod.levels.forEach((l, i) => { l.object.visible = i === 0; });
  for (const [hp, id] of Object.entries(L.fit)) {
    if (empty && hp === empty) continue;
    const def = getModule(id);
    if (!def) throw new Error(`[loadoutsAudit] loadout "${L.id}" wants unknown module "${id}"`);
    attachModule(hull, hp, def, {
      rng: new RNG(`loadout:${L.id}:${hp}`), materials, palette: {}, faction: def.faction, lod: 0,
    });
  }
  return getSilhouetteSignature(hull);
}

const sigs = LOADOUTS.map(build);
const KEY = ['A', 'B', 'C'];
const pairs = [[0, 1], [0, 2], [1, 2]].map(([i, j]) => ({
  id: `${KEY[i]}/${KEY[j]}`,
  ...diff(sigs[i], sigs[j]),
}));

const worstMean = Math.min(...pairs.map((p) => p.mean));
const worstMax = Math.min(...pairs.map((p) => p.max));
const ok = worstMean >= LOADOUT_TARGETS.mean && worstMax >= LOADOUT_TARGETS.max;

if (asJson) {
  console.log(JSON.stringify({ empty: empty ?? null, pairs, worstMean, worstMax, ok }, null, 2));
} else {
  console.log('\nLOADOUT SEPARATION  (three complete fits of one cruiser, outline binned over 28'
    + '\nz-bins of the bare hull, three channels per bin, metres)');
  if (empty) console.log(`  *** COUNTERFACTUAL: the "${empty}" mount is EMPTY on all three. Reported, not gated. ***`);
  console.log('');
  for (const p of pairs) {
    console.log(`  ${p.id}  mean ${p.mean.toFixed(1).padStart(6)}  max ${p.max.toFixed(0).padStart(4)}`
      + `   [per-channel mean: halfWidth ${p.per.halfWidth.toFixed(1).padStart(6)}`
      + `  top ${p.per.top.toFixed(1).padStart(6)}`
      + `  bottom ${p.per.bottom.toFixed(1).padStart(6)}]`);
  }
  console.log('');
  console.log(`  WORST PAIR  mean ${worstMean.toFixed(1)} (target >= ${LOADOUT_TARGETS.mean})`
    + `   max ${worstMax.toFixed(0)} (target >= ${LOADOUT_TARGETS.max})`
    + `   ${ok ? 'PASS' : '*** FAIL ***'}`);
  console.log(`  margin      mean ${(worstMean / LOADOUT_TARGETS.mean).toFixed(2)}x`
    + `   max ${(worstMax / LOADOUT_TARGETS.max).toFixed(2)}x`);
  if (!ok && !empty) {
    console.log('\n  Three loadouts of this hull are no longer tellable apart from outline alone.');
    console.log('  The bottom channel is the ventral mount and nothing else; run');
    console.log('  `node src/probes/loadoutsAudit.mjs --empty ventral` to see what it carries.');
  }
}

// A counterfactual run is a question, not a verdict. Only the real fit gates.
process.exit(empty || ok ? 0 : 1);
