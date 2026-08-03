/**
 * THE MODULE LIBRARY.
 *
 * Importing this file registers all twenty-four modules with the shared registry in
 * core/contracts.js. Nothing else needs wiring: the refit screen, the probes and the
 * geometry audit all read `allModules()`.
 *
 *     import '../art/geometry/modules/index.js';
 *     import { modulesForHardpoint } from '../core/contracts.js';
 *     modulesForHardpoint('bow');   // -> 5 ModuleDefs
 *
 * COVERAGE
 *   bow       5   siege lance T3 / breaching prow T2 / torpedoes T2 / cutting array T1 / spike T1
 *   dorsal    5   rail battery T3 / shield pylons T3 / missile raft T2 / mast T1 / PD ring T1
 *   ventral   5   hangar deck T3 / drone bay T2 / field dock T2 / tractor T1 / cargo T1
 *   port      5   heavy broadside T3 / gauss outrigger T3 / beam array T2 / cannon T1 / flak T1
 *   engine    4   jump ring T3 / fusion core T2 / main drive T1 / stern armour T1
 *
 * WHY THERE IS NO `starboard` LIST. hardpoints.js §3 is explicit: you author the
 * port version only and the attachment system mirrors it onto the starboard mount,
 * geometry winding and all. All five broadside modules are therefore installable on
 * either sponson, independently — ten broadside fittings from five definitions, and
 * exactly one copy of each to maintain. `modulesForHardpoint('starboard')` returning
 * an empty list is the contract working, not a gap; use `broadsideModules()`.
 */

import { allModules, modulesForHardpoint, HARDPOINTS, FIT_SERVICES } from '../../../core/contracts.js';
import { countTriangles, MODULE_TRI_BUDGET, MODULE_LIGHT_SPACING_M } from './kit.js';

import './bow.js';
import './dorsal.js';
import './ventral.js';
import './broadside.js';
import './engine.js';

// ---------------------------------------------------------------------------
// THE LIBRARY IS COMPLETE, OR IT DOES NOT LOAD.
//
// `core/contracts.js#validateFit` throws on a MALFORMED `fit` and only warns on a
// MISSING one, because `registerModule` runs at import time and `sim/selftest.mjs:70`
// registers three synthetic fixtures - built from an empty `THREE.Group`, never seated
// on a hull, with no geometry to have a root extent of. A blanket throw in the registry
// fails gate 1 of `tools/gates.mjs` (the whole sim stream) and the fix would have to be
// made in a file this stream does not own.
//
// The completeness rule belongs HERE instead, and it is stronger here, not weaker. This
// file IS the library: importing it registers all twenty-four modules, and the game, the
// probes, the refit screen and both audits all reach them through it. So a module added
// to `bow.js` without a `fit` does not boot, does not probe and does not audit - it fails
// at import, which is exactly what a hull that silently does not adapt is worth.
//
// The two registries provably do not overlap: `node -e "import('./src/sim/ship.js')"` and
// then `allModules().length` prints 0. The sim stream never loads this library, and this
// sweep runs at this file's own load time, before anything else can register.
for (const def of modulesInMountOrder()) {
  if (def.fit) continue;
  throw new Error(
    `[modules] "${def.id}" (${def.hardpoint}) declares no "fit", so the hull cannot adapt to `
    + 'it: it would get the same apron, coaming, plate runs, chocks and service bearing as an '
    + 'empty mount, whatever is standing in it. Add\n'
    + '    fit: { footprintM: [across, alongShip], service },\n'
    + 'next to `mass`. `footprintM` is the ROOT plan extent at the mount face in metres, not '
    + 'the bounding box; `node src/art/geometry/modules/audit.mjs` measures it for you and '
    + 'prints the number to put there. `service` is one of '
    + `${FIT_SERVICES.join(' / ')}. See FitDecl in core/contracts.js.`,
  );
}

export { MODULE_TRI_BUDGET, MODULE_LIGHT_SPACING_M };

/** The five broadside modules, installable on either sponson. */
export const broadsideModules = () => modulesForHardpoint('port');

/**
 * Every module, in the order the refit screen lays the mounts out, with the port
 * list standing in for both sponsons.
 */
export function modulesInMountOrder() {
  const out = [];
  for (const hp of HARDPOINTS) {
    if (hp === 'starboard') continue;
    for (const m of modulesForHardpoint(hp)) out.push(m);
  }
  return out;
}

/**
 * Build every module at both LODs and count its triangles.
 *
 * This is the acceptance test for units.js#BUDGET.moduleTris. It needs a real
 * BuildContext because materials come from the registry, but it never adds anything
 * to a scene, so it runs anywhere a build context can be made.
 *
 * @param {(def:Object, lod:number) => import('../../../core/contracts.js').BuildContext} makeCtx
 * @returns {{rows:Array, worst:number, over:Array, ok:boolean}}
 */
export function auditModules(makeCtx) {
  const rows = [];
  for (const def of modulesInMountOrder()) {
    const counts = [];
    for (const lod of [0, 1]) {
      const obj = def.build(makeCtx(def, lod));
      counts.push(countTriangles(obj));
      obj.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    rows.push({
      id: def.id,
      name: def.name,
      hardpoint: def.hardpoint,
      tier: def.tier,
      faction: def.faction,
      lod0: counts[0],
      lod1: counts[1],
      budget: def.triBudget,
      over: counts[0] > def.triBudget,
      weapon: def.weapon?.type ?? null,
    });
  }
  const over = rows.filter((r) => r.over);
  return {
    rows,
    worst: rows.reduce((m, r) => Math.max(m, r.lod0), 0),
    over,
    ok: over.length === 0,
    count: rows.length,
  };
}

/** A fixed-width table of the audit, for a probe label or a console. */
export function auditTable(report) {
  const head = 'ID                         HP     T FACTION    LOD0 LOD1';
  const lines = report.rows.map((r) => [
    r.id.padEnd(26),
    r.hardpoint.padEnd(6),
    String(r.tier),
    r.faction.padEnd(10),
    String(r.lod0).padStart(4),
    String(r.lod1).padStart(4),
    r.over ? ' *** OVER ***' : '',
  ].join(' '));
  return [head, ...lines,
    `${report.count} modules   worst ${report.worst} / ${MODULE_TRI_BUDGET}   ${report.ok ? 'ALL WITHIN BUDGET' : 'BUDGET BREACH'}`,
  ].join('\n');
}

export { allModules, modulesForHardpoint };
