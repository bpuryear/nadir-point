/**
 * HEADLESS TRIANGLE AUDIT.
 *
 *     node src/art/geometry/modules/audit.mjs
 *
 * Builds all twenty-four modules at LOD0 and LOD1 and prints the count table.
 * Exits non-zero if any module is over units.js#BUDGET.moduleTris, so it is usable
 * as a regression check without a browser or a GPU.
 *
 * The material registry is stubbed, deliberately: geometry does not care what
 * material it is handed, and stubbing it is what lets this run in node instead of
 * only inside the probe harness. The PROBE is what proves the materials are real -
 * see src/probes/modules.js, which runs the same audit against the live registry.
 */
import * as THREE from 'three';
import { RNG } from '../../../core/rng.js';
import { auditModules, auditTable } from './index.js';

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
process.exit(report.ok ? 0 : 1);
