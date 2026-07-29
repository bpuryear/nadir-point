/**
 * HEADLESS SILHOUETTE COHERENCE AUDIT.
 *
 *     node tools/silhouette.mjs
 *     node tools/silhouette.mjs --sheet docs/probes/audit-silhouette.pbm
 *
 * Two questions the existing audits cannot answer, both of which are judged from
 * the BLACK SHAPE ALONE and are therefore this stream's to close:
 *
 *  1. DOES THE SILHOUETTE READ AS ONE OBJECT?  `ships/audit.mjs` and
 *     `modules/audit.mjs` both bin the outline along z, and a per-bin top/bottom
 *     envelope cannot see a hole: a part floating forty metres clear of the hull
 *     lands in the same bin as the hull and simply widens that bin's range. It
 *     scores as MORE silhouette, not as a defect. `probes/cruiser.js#floatingParts`
 *     catches the 3-D case with a union-find over bounding boxes, but a module can
 *     be perfectly well connected in 3-D through a strut whose PROJECTION is hidden
 *     behind the part it holds up, and it can be genuinely detached in projection
 *     while its boxes overlap. The rendered sheet is where these show, which is why
 *     they were found by looking at `loadouts.png` and not by any tool.
 *
 *     So: rasterise the outline the reviewer actually judges, in the same three
 *     orthographic views the silhouette sheets use, and count 4-connected
 *     components. Anything past the first is a piece of the ship that a player at
 *     four kilometres sees floating in space.
 *
 *  2. DOES EVERY LOD READ AS THE SAME SHIP?  ship-language.md §7 says to author
 *     every LOD inward from LOD0's silhouette, and D9 is exactly what happens when
 *     nobody measures it - LOD2 carried a prow that existed at no other level. IoU
 *     of the LOD_n mask against LOD0's, in a raster fixed to LOD0's bounding box so
 *     a level that shrinks is penalised rather than rescaled into agreement.
 *
 * Neither number is a substitute for looking at the picture. They are what stops a
 * defect that was found by looking at the picture from coming back after the next
 * edit, which is the standard the rest of the audits in this tree are held to.
 *
 * THRESHOLDS, and why they are what they are.  The review scale is the 30 px read
 * (ship-language.md §0): 43.4 m per pixel at max zoom on a 1400 m hull, i.e. a
 * fragment reads as a separate object only once it is a couple of pixels across.
 * MIN_FRAGMENT is set at 0.15% of the silhouette's own area, which on the cruiser's
 * side view is about 2.4 px at the max-zoom read and about a third of a percent of
 * the black shape - small enough to catch the 41 m gap under the hangar deck, large
 * enough not to fire on a rasterisation sliver at the tip of a radiator fin.
 */
import * as THREE from 'three';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RNG } from '../src/core/rng.js';
import { buildCruiser } from '../src/art/geometry/cruiser.js';
import { attachModule } from '../src/art/geometry/hardpoints.js';
import { modulesForHardpoint } from '../src/art/geometry/modules/index.js';
import { ALL_SHIP_CLASSES } from '../src/art/geometry/ships/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RES = 384;                 // raster edge, px
const MIN_FRAGMENT = 0.0015;     // of total silhouette area
const LOD_IOU_FLOOR = 0.72;      // an LOD below this is a different ship

const stub = new THREE.MeshBasicMaterial();
const materials = { get: () => stub, has: () => true };

/** Lamps and plumes are light, not outline — the same exclusion the sheets use. */
function isOutline(o) {
  if (!o.isMesh || !o.visible) return false;
  if (o.isInstancedMesh) return false;
  if (o.userData?.isRunningLight || o.userData?.isGlow) return false;
  if (typeof o.name === 'string' && (o.name.includes('runningLights') || o.name.includes('Glow'))) return false;
  return true;
}

/**
 * Collect world-space triangles from a list of roots. Returns a flat Float64Array
 * of 9 numbers per triangle, which is the only shape the rasteriser wants.
 */
function triangles(roots) {
  const out = [];
  const v = new THREE.Vector3();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!isOutline(o)) return;
      const geo = o.geometry;
      const pos = geo?.getAttribute('position');
      if (!pos) return;
      const idx = geo.index;
      const n = idx ? idx.count : pos.count;
      const m = o.matrixWorld;
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k++) {
          const j = idx ? idx.getX(i + k) : i + k;
          v.fromBufferAttribute(pos, j).applyMatrix4(m);
          out.push(v.x, v.y, v.z);
        }
      }
    });
  }
  return out;
}

/**
 * Axis pair per view: [horizontal, vertical] indices into (x, y, z).
 *
 * SIDE AND TOP GATE THE BUILD; FRONT IS REPORTED AND DOES NOT FAIL, and the reason
 * is a real property of the measurement rather than a convenience. Those are the two
 * views every silhouette sheet in this repo is drawn in and the two the acceptance
 * criteria are judged from, but more importantly the bow-on view is DEGENERATE for
 * anything whose axis points down z. A `pipeRun` flange is a wall with no thickness
 * — `capFront: false, capBack: false`, deliberately, because it is normally seen
 * against the tube it rings — so viewed at exactly 0 degrees off its own axis it
 * projects to a hexagonal outline floating 30 m clear of the pod body, and the
 * component counter is right to call that two pieces. At one degree off axis it is
 * one piece again, and no camera in the game sits at exactly zero.
 *
 * So the front figures stay printed, because a large one still means something (it
 * is how the carrier build's outboard engine pod was found hanging 26 m below its
 * spar), and they are read by a person rather than by the exit code.
 */
const VIEWS = { side: [2, 1], top: [2, 0], front: [0, 1] };
const GATED = new Set(['side', 'top']);

/**
 * Rasterise into a fixed world window so two masks are comparable pixel for pixel.
 * `win` is {u0, v0, u1, v1}; omit it and the window is fitted to the geometry with
 * a 2% margin.
 */
function rasterise(tris, view, win = null) {
  const [A, B] = VIEWS[view];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  if (win) ({ u0, v0, u1, v1 } = win);
  else {
    for (let i = 0; i < tris.length; i += 3) {
      const u = tris[i + A], v = tris[i + B];
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const mu = (u1 - u0) * 0.02 + 1e-6, mv = (v1 - v0) * 0.02 + 1e-6;
    u0 -= mu; u1 += mu; v0 -= mv; v1 += mv;
  }
  // ONE SCALE FOR BOTH AXES. Fitting each axis independently would stretch a long
  // thin hull to a square and make a 40 m gap in y look like a 400 m one.
  const span = Math.max(u1 - u0, v1 - v0);
  const cu = (u0 + u1) * 0.5, cv = (v0 + v1) * 0.5;
  const s = (RES - 2) / span;
  const mask = new Uint8Array(RES * RES);

  const px = (u) => (u - cu) * s + RES * 0.5;
  const py = (v) => RES * 0.5 - (v - cv) * s;

  for (let i = 0; i < tris.length; i += 9) {
    const ax = px(tris[i + A]), ay = py(tris[i + B]);
    const bx = px(tris[i + 3 + A]), by = py(tris[i + 3 + B]);
    const cx = px(tris[i + 6 + A]), cy = py(tris[i + 6 + B]);
    let x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    let x1 = Math.min(RES - 1, Math.ceil(Math.max(ax, bx, cx)));
    let y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    let y1 = Math.min(RES - 1, Math.ceil(Math.max(ay, by, cy)));
    if (x1 < x0 || y1 < y0) continue;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) {
      // Degenerate in projection — an edge-on plate. Stamp its bounding line so a
      // radiator fin seen edge-on still joins the thing it is bolted to.
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * RES + x] = 1;
      continue;
    }
    for (let y = y0; y <= y1; y++) {
      const fy = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const fx = x + 0.5;
        const l1 = ((by - cy) * (fx - cx) + (cx - bx) * (fy - cy)) / d;
        const l2 = ((cy - ay) * (fx - cx) + (ax - cx) * (fy - cy)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) mask[y * RES + x] = 1;
      }
    }
  }
  return { mask, window: { u0: cu - span * 0.5, v0: cv - span * 0.5, u1: cu + span * 0.5, v1: cv + span * 0.5 }, metresPerPx: 1 / s };
}

/** 4-connected components, largest first, each with its pixel count and bbox. */
function components(mask) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const out = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let sp = 0, count = 0;
    let x0 = RES, x1 = -1, y0 = RES, y1 = -1;
    stack[sp++] = i;
    seen[i] = 1;
    while (sp) {
      const p = stack[--sp];
      count++;
      const x = p % RES, y = (p / RES) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < RES - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - RES] && !seen[p - RES]) { seen[p - RES] = 1; stack[sp++] = p - RES; }
      if (y < RES - 1 && mask[p + RES] && !seen[p + RES]) { seen[p + RES] = 1; stack[sp++] = p + RES; }
    }
    out.push({ count, x0, x1, y0, y1 });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) uni++;
    if (a[i] && b[i]) inter++;
  }
  return uni ? inter / uni : 1;
}

/**
 * Fragments: components past the first that are big enough to read. Returned as a
 * fraction of total area and as an approximate metre extent, because "0.4% of the
 * shape" means nothing to a modeller and "a 90 m bar" means everything.
 */
function fragments(tris, view) {
  const r = rasterise(tris, view);
  const comps = components(r.mask);
  const total = comps.reduce((s, c) => s + c.count, 0);
  if (!total) return { n: 0, worst: 0, metres: 0, total: 0, where: [] };
  const loose = comps.slice(1).filter((c) => c.count / total >= MIN_FRAGMENT);
  const worst = loose.length ? loose[0].count : 0;
  const [A, B] = VIEWS[view];
  const AX = 'xyz'[A], BX = 'xyz'[B];
  const w = r.window;
  const u = (px) => w.u0 + (px / (RES - 1)) * (w.u1 - w.u0);
  const v = (py) => w.v1 - (py / (RES - 1)) * (w.v1 - w.v0);
  return {
    n: loose.length,
    worst: worst / total,
    metres: Math.sqrt(worst) * r.metresPerPx,
    total,
    // World-space extent of every loose piece, so the report names geometry rather
    // than percentages. This is the difference between a tool that says something
    // is wrong and one that says what to edit.
    where: loose.map((c) => `${AX}[${u(c.x0).toFixed(0)}..${u(c.x1).toFixed(0)}] `
      + `${BX}[${v(c.y1).toFixed(0)}..${v(c.y0).toFixed(0)}]`),
  };
}

// ---------------------------------------------------------------------------
// SUBJECTS
// ---------------------------------------------------------------------------

function cruiserWith(fits, lod = 0) {
  const hull = buildCruiser({
    rng: new RNG(`sil:${JSON.stringify(fits)}`), materials, palette: {}, faction: 'player', lod,
  });
  for (const [hp, def] of Object.entries(fits)) {
    attachModule(hull, hp, def, {
      rng: new RNG(`sil:mod:${def.id}`), materials, palette: {}, faction: def.faction, lod,
    });
  }
  hull.root.updateMatrixWorld(true);
  const roots = [hull.lod.levels[Math.min(lod, hull.lod.levels.length - 1)].object];
  for (const e of hull.hardpoints.values()) if (e.object) roots.push(e.object);
  return roots;
}

let failed = false;
const rows = [];

console.log('SILHOUETTE COHERENCE  (raster ' + RES + ' px, 4-connected, fragment floor '
  + (MIN_FRAGMENT * 100).toFixed(2) + '% of the black shape)\n');
console.log('DETACHED FRAGMENTS — every module fitted alone to a bare cruiser, three ortho views');
console.log('  a module whose parts do not touch in projection reads as debris beside the ship\n');

for (const hp of ['bow', 'dorsal', 'ventral', 'port', 'starboard', 'engine']) {
  for (const def of modulesForHardpoint(hp === 'starboard' ? 'port' : hp)) {
    const roots = cruiserWith({ [hp]: def });
    const tris = triangles(roots);
    const bad = [];
    for (const view of ['side', 'top', 'front']) {
      const f = fragments(tris, view);
      if (!f.n) continue;
      bad.push(`${view}${GATED.has(view) ? '' : '(fyi)'} ${f.n}x ~${f.metres.toFixed(0)} m at ${f.where.join(' + ')}`);
      if (GATED.has(view)) failed = true;
    }
    if (bad.length) rows.push(`  ${(hp + ' / ' + def.id).padEnd(44)} ${bad.join('   ')}`);
  }
  if (hp === 'starboard') break;   // same library as port; one pass is enough
}
if (rows.length) rows.forEach((r) => console.log(r));
else console.log('  every module hangs together in all three views');
console.log('  (side and top gate the exit code; front is printed and does not — see VIEWS)');

// The bare hull and the three probe loadouts, which is the sheet a reviewer reads.
console.log('\nDETACHED FRAGMENTS — bare hull and the three probe loadouts');
const byId = (id) => {
  for (const hp of ['bow', 'dorsal', 'ventral', 'port', 'engine']) {
    const d = modulesForHardpoint(hp).find((m) => m.id === id);
    if (d) return d;
  }
  throw new Error(`unknown module ${id}`);
};
const LOADOUTS = {
  '<bare>': {},
  'A standoff': {
    bow: byId('bow_siege_lance'), dorsal: byId('dorsal_sensor_mast'),
    ventral: byId('ventral_cargo_expansion'), port: byId('port_gauss_outrigger'),
    starboard: byId('port_gauss_outrigger'), engine: byId('engine_reactor_uprate'),
  },
  'B carrier': {
    bow: byId('bow_mining_array'), dorsal: byId('dorsal_pd_ring'),
    ventral: byId('ventral_hangar_deck'), port: byId('port_flak_cluster'),
    starboard: byId('port_flak_cluster'), engine: byId('engine_thruster_upgrade'),
  },
  'C line': {
    bow: byId('bow_breaching_prow'), dorsal: byId('dorsal_rail_battery'),
    ventral: byId('ventral_repair_bay'), port: byId('port_broadside_battery'),
    starboard: byId('port_broadside_battery'), engine: byId('engine_jump_drive'),
  },
};
for (const [name, fit] of Object.entries(LOADOUTS)) {
  const tris = triangles(cruiserWith(fit));
  const bits = [];
  for (const view of ['side', 'top', 'front']) {
    const f = fragments(tris, view);
    bits.push(`${view}${GATED.has(view) ? '' : '(fyi)'} `
      + `${f.n ? `${f.n}x ~${f.metres.toFixed(0)} m at ${f.where.join(' + ')}` : 'one piece'}`);
    if (f.n && GATED.has(view)) failed = true;
  }
  console.log(`  ${name.padEnd(12)} ${bits.join('   ')}`);
}

// ---------------------------------------------------------------------------
// LOD COHERENCE
// ---------------------------------------------------------------------------

console.log(`\nLOD COHERENCE  (IoU of each level's side mask against LOD0's, in LOD0's own`
  + `\nraster window so a level that shrinks is penalised; floor ${LOD_IOU_FLOOR})\n`);

function lodRow(label, forLod, levels) {
  const base = triangles(forLod(0));
  const r0 = rasterise(base, 'side');
  const out = [];
  for (let l = 1; l < levels; l++) {
    const t = triangles(forLod(l));
    const r = rasterise(t, 'side', r0.window);
    const v = iou(r0.mask, r.mask);
    if (v < LOD_IOU_FLOOR) failed = true;
    out.push(`LOD${l} ${v.toFixed(3)}${v < LOD_IOU_FLOOR ? '!' : ' '}`);
  }
  console.log(`  ${label.padEnd(26)} ${out.join('  ')}`);
}

lodRow('cruiser (bare)', (l) => cruiserWith({}, l), 3);
for (const def of ALL_SHIP_CLASSES) {
  const levels = def.lodLevels ?? 3;
  lodRow(def.id, (l) => {
    const { buckets } = def.partsFor({ rng: new RNG(`sil:${def.id}:${l}`), lod: l });
    const roots = [];
    for (const b of buckets) {
      if (b.surface === 'runningLights' || b.surface === 'engineGlow' || b.surface === 'emissive') continue;
      for (const p of b.parts) {
        const m = new THREE.Mesh(p.geo ?? p, stub);
        if (p.pos) m.position.fromArray(p.pos);
        if (p.rot) m.rotation.fromArray(p.rot);
        if (p.scale) m.scale.fromArray(p.scale);
        roots.push(m);
      }
    }
    return roots;
  }, levels);
}

// Optional visual: dump the loadout side masks as a PBM so a human can look at the
// exact bitmap the numbers came from rather than trusting the numbers.
const sheetArg = process.argv.indexOf('--sheet');
if (sheetArg >= 0 && process.argv[sheetArg + 1]) {
  const outPath = path.resolve(ROOT, process.argv[sheetArg + 1]);
  const names = Object.keys(LOADOUTS);
  const H = RES * names.length;
  const lines = [`P1\n${RES} ${H}\n`];
  for (const name of names) {
    const r = rasterise(triangles(cruiserWith(LOADOUTS[name])), 'side');
    for (let y = 0; y < RES; y++) {
      let s = '';
      for (let x = 0; x < RES; x++) s += r.mask[y * RES + x] ? '1 ' : '0 ';
      lines.push(s + '\n');
    }
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, lines.join(''));
  console.log(`\nwrote ${path.relative(ROOT, outPath)}`);
}

console.log(`\n${failed ? '*** SILHOUETTE COHERENCE FAILED ***' : 'silhouettes coherent: one piece per ship, every LOD the same ship'}`);
process.exit(failed ? 1 : 0);
