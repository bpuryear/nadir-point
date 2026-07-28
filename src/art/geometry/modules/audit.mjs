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
import { auditModules, auditTable, modulesForHardpoint } from './index.js';
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

console.log(`\n${sepFailed ? '*** MODULE SEPARATION FAILED ***' : 'every module on every mount is separable from every other on that mount'}`);
process.exit(report.ok && !sepFailed ? 0 : 1);
