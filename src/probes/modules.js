/**
 * MODULE PROBE — every module in the library, one at a time, on a bare cruiser.
 *
 *   node tools/probe.mjs modules --out docs/probes/modules.png
 *   node tools/probe.mjs modules --seed 'm#set=bow'      --out docs/probes/modules-bow.png
 *   node tools/probe.mjs modules --seed 'm#set=bow&bare=1' --out docs/probes/modules-bow-bare.png
 *
 * Options (URL params on probe.html?p=modules, or after a '#' in --seed, because
 * tools/probe.mjs only forwards --seed and the harness belongs to integration):
 *
 *   set=all|bow|dorsal|ventral|port|engine
 *       `all` is a contact sheet: all twenty-four modules, five rows of hulls, one
 *       row per mount. Use it to check nothing is missing or grossly misplaced.
 *       A named set puts that mount's modules on five hulls in a row and frames the
 *       mount, which is what you actually critique against.
 *   bare=1
 *       Modules with NO HULL, in a row, close up. This is where you judge the
 *       geometry itself; the on-hull views are where you judge whether it reads at
 *       ship scale. Both matter and they fail differently.
 *   lod=0|1
 *       Which module LOD to build. Modules ship two.
 *   audit=1
 *       Print the full triangle table into the label instead of just the summary.
 *
 * The port set installs each broadside module on BOTH sponsons from its single
 * port-authored definition. If the starboard copy is inside-out, that is the mirror
 * contract broken and it will be obvious here (hardpoints.js §3).
 */

import * as THREE from 'three';
import { createMaterialRegistry } from '../art/materials/index.js';
import { getPOIPalette, NEUTRAL } from '../art/palette.js';
import { buildCruiser } from '../art/geometry/cruiser.js';
import { attachModule } from '../art/geometry/hardpoints.js';
import {
  modulesForHardpoint, auditModules, auditTable, MODULE_TRI_BUDGET, MODULE_LIGHT_SPACING_M,
} from '../art/geometry/modules/index.js';

const POI = 'giant-orbit';
const SETS = ['bow', 'dorsal', 'ventral', 'port', 'engine'];

/**
 * Where to stand to look at each mount.
 *
 * Rows are laid out along the CAMERA'S RIGHT VECTOR, not along world X. Laying a
 * row along a fixed world axis and then orbiting the camera turns the row into a
 * queue receding into the distance, where the far end is small, half-occluded and
 * useless to critique. Deriving the row axis from the yaw means every set is a
 * clean left-to-right row whatever angle it is best viewed from.
 */
const SET_VIEWS = {
  // Spacing has to clear the ship's PROJECTED width, which for a 1400 x 390 m hull
  // is 1400*|sin yaw| + 390*|cos yaw|. Five cruisers in one frame are never going to
  // be large; these views exist to check that a module sits right on the hull and
  // breaks the outline. Judging the geometry itself is what bare=1 is for.
  bow: { yaw: 0.60, pitch: 0.28, target: [0, 70, 380], dist: 4600, spacing: 1360 },
  dorsal: { yaw: 0.52, pitch: 0.44, target: [0, 190, 170], dist: 4000, spacing: 1220 },
  ventral: { yaw: -0.62, pitch: -0.38, target: [0, -140, -20], dist: 4400, spacing: 1220 },
  port: { yaw: -0.46, pitch: 0.32, target: [-70, 60, 90], dist: 3850, spacing: 1180, key: [-0.72, 0.60, 0.34] },
  engine: { yaw: Math.PI - 0.55, pitch: 0.26, target: [0, 10, -680], dist: 4000, spacing: 1220 },
  all: { yaw: 0.42, pitch: 0.62, target: [0, 0, 0], dist: 13500, spacing: 1400, rowGap: 2600 },
};

/** Bare (hull-less) views: close enough to see whether the geometry is any good. */
const BARE_VIEWS = {
  bow: { yaw: 1.05, pitch: 0.22, dist: 1420, spacing: 470, rowGap: 480, cols: 3, target: [0, 0, 0] },
  dorsal: { yaw: 1.05, pitch: 0.42, dist: 1460, spacing: 470, rowGap: 480, cols: 3, target: [0, 0, 0] },
  ventral: { yaw: -2.15, pitch: -0.22, dist: 1480, spacing: 490, rowGap: 500, cols: 3, target: [0, 0, 0] },
  port: { yaw: -2.30, pitch: 0.26, dist: 1380, spacing: 450, rowGap: 450, cols: 3, target: [0, 0, 0], key: [-0.70, 0.58, -0.42] },
  engine: { yaw: Math.PI - 0.95, pitch: 0.22, dist: 1420, spacing: 470, rowGap: 470, cols: 2, target: [0, 0, 0] },
  all: { yaw: 1.05, pitch: 0.30, dist: 3400, spacing: 470, rowGap: 560, cols: 5, target: [0, 0, 0] },
};

export default {
  name: 'Module library',
  camera: { distance: 2800, pitch: 0.35, yaw: 0.6, target: new THREE.Vector3(0, 0, 0) },

  async setup(ctx) {
    const { scene, far, world, renderer, pose } = ctx;

    const seedOpts = new URLSearchParams((ctx.params.get('seed') ?? '').split('#')[1] ?? '');
    const params = { get: (k) => ctx.params.get(k) ?? seedOpts.get(k) };

    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('module-probe-materials'),
      poi: POI,
    });
    world.systems.materials = registry;
    ctx.registry = registry;

    const poi = getPOIPalette(POI);
    const setName = SETS.includes(params.get('set')) ? params.get('set') : 'all';
    const bare = params.get('bare') === '1';
    const lod = Math.max(0, Math.min(1, Number(params.get('lod') ?? 0) | 0));

    const mctx = (label, faction) => ({
      rng: world.rng.fork(`module:${label}`),
      materials: registry,
      palette: poi,
      faction,
      lod,
    });

    // ---- environment: ONE key, a whisper of fill, near-black shadow ---------
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
    scene.background = null;

    // The key is deliberately on the OPPOSITE side of the subject from the camera's
    // shoulder, and high. A key that sits next to the lens lights every face the
    // same amount, which is the fastest way to make good geometry look like mush.
    const view0 = (bare ? BARE_VIEWS : SET_VIEWS)[SETS.includes(params.get('set')) ? params.get('set') : 'all'];
    const kx = -Math.cos(view0.yaw) * 0.62 + Math.sin(view0.yaw) * 0.42;
    const kz = Math.sin(view0.yaw) * 0.62 + Math.cos(view0.yaw) * 0.42;
    // Looking up at a ventral module from below means the key has to come from
    // below too, or the whole set renders as a black smear. Physically this is a
    // planetshine key rather than a stellar one, which is honest for the location.
    const ky = (view0.pitch ?? 0) < 0 ? -0.55 : 0.66;
    // Broadside modules all face -X. The generic rule above assumes the subject
    // faces the camera, so those sets name their key explicitly.
    const K = view0.key ?? [kx, ky, kz];

    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), 6.2,
    );
    key.position.set(K[0], K[1], K[2]).normalize().multiplyScalar(8000);
    scene.add(key);
    scene.add(key.target);

    const fill = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace), 0.30,
    );
    fill.position.set(-K[0], -K[1] * 0.45, -K[2]).normalize().multiplyScalar(8000);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 0.5));
    registry.applyEnvironment(scene, POI, 0.20);

    const keyProxy = new THREE.Object3D();
    keyProxy.position.copy(key.position);
    scene.add(keyProxy);
    renderer.post.setKeyLight(keyProxy, new THREE.Color(1.0, 0.94, 0.82));
    renderer.post.godrays.enabled = false;
    renderer.post.gtao.updateGtaoMaterial({ radius: 22.0, thickness: 9.0, distanceExponent: 1.5, samples: 12 });
    renderer.renderer.toneMappingExposure = 0.94;

    // ---- layout ------------------------------------------------------------
    const groups = setName === 'all' ? SETS : [setName];
    const view = (bare ? BARE_VIEWS : SET_VIEWS)[setName];
    const shown = [];

    // Shadows are worth their cost only when there are few enough hulls that the
    // shadow camera can actually cover them.
    const total = groups.reduce((n, g) => n + modulesForHardpoint(g).length, 0);
    const shadows = total <= 6 && !bare;
    if (shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1000;
      key.shadow.camera.far = 14000;
      const S = 3200;
      key.shadow.camera.left = -S; key.shadow.camera.right = S;
      key.shadow.camera.top = S; key.shadow.camera.bottom = -S;
      key.shadow.bias = -0.0012;
      key.shadow.normalBias = 2.0;
    }

    // Row axis = camera right; row-to-row axis = camera forward, flattened. Both
    // derived from the yaw so the grid is a grid from wherever we are standing.
    const rx = Math.cos(view.yaw), rz = -Math.sin(view.yaw);
    const fx = Math.sin(view.yaw), fz = Math.cos(view.yaw);

    /**
     * CELL SIZE IS MEASURED, NOT DECLARED.
     *
     * `view.spacing` was authored when the biggest module was about 300 m across.
     * The library's ventral, engine and broadside fits then grew by a factor of two
     * to satisfy the loadout divergence criterion (ship-language.md §6 M2) and
     * nobody moved the grid, so on `set=engine&bare=1` the 520 m stern armour
     * belt stood in front of the 300 m jump ring and the ring could not be
     * critiqued at all. Backing the camera off - which the framing block below
     * already did - does not separate two objects that intersect in world space.
     *
     * So the authored spacing is now a FLOOR and the real cell is whatever the
     * built geometry measures, plus a margin. Same principle as the loadout probe's
     * row spacing, and for the same reason: a review picture whose subjects overlap
     * proves nothing about either of them.
     */
    const cells = [];                 // { holder, col, row, half: {w, h} }
    const CELL_MARGIN = 110;
    const measureCell = (obj) => {
      // Sockets carry the mount offset and their world matrices are stale until
      // something walks the tree; Box3 will not do it for us. See loadouts.js.
      obj.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(obj);
      const s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      return {
        w: Math.abs(s.x * rx) + Math.abs(s.z * rz),      // across the row
        h: bare ? s.y : Math.abs(s.x * fx) + Math.abs(s.z * fz),
        // Toward the lens. A 900 m lance lying half along the view axis has its
        // near end a long way closer than the plane the framing is fitted to, and
        // projects wider than the fit allows; without this term the first cell in
        // the bow row was clipped by the left edge of the frame.
        d: Math.max(Math.abs(s.x * fx) + Math.abs(s.z * fz), s.y),
      };
    };

    for (let gi = 0; gi < groups.length; gi++) {
      const hp = groups[gi];
      const mods = modulesForHardpoint(hp);
      // A named set with `cols` wraps onto two rows so the camera can come closer;
      // the contact sheet puts each mount on its own row.
      const cols = groups.length > 1 ? mods.length : (view.cols ?? mods.length);
      const rows = Math.ceil(mods.length / cols);
      for (let i = 0; i < mods.length; i++) {
        const def = mods[i];
        const r = Math.floor(i / cols);
        const inRow = Math.min(cols, mods.length - r * cols);
        // Grid INDICES; the metres are applied once the cells have been measured.
        const col = (i % cols) - (inRow - 1) / 2;
        const row = groups.length > 1
          ? (groups.length - 1) / 2 - gi          // contact sheet: one row per mount
          : (rows - 1) / 2 - r;                   // one mount, wrapped onto `cols`
        const holder = new THREE.Group();
        scene.add(holder);

        if (bare) {
          const obj = def.build(mctx(`${def.id}:solo`, def.faction));
          obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
          holder.add(obj);
          // Centre each module on its own bounding box. Module origins sit at the
          // MOUNT POINT, which for a 400 m lance is at one end - laid out by origin
          // the row goes off the side of the frame.
          const box = new THREE.Box3().setFromObject(obj);
          obj.position.sub(box.getCenter(new THREE.Vector3()));
          // Marker at the mount point, so the author can see where the hull is.
          const mark = new THREE.Mesh(
            new THREE.OctahedronGeometry(7, 0),
            registry.get('emissive', { faction: 'player', color: NEUTRAL.select, intensity: 1.6 }),
          );
          mark.position.copy(obj.position);
          holder.add(mark);
          shown.push({ def, tris: obj.userData.triangles ?? 0 });
          cells.push({ holder, col, row, half: measureCell(holder) });
        } else {
          const hull = buildCruiser({
            rng: world.rng.fork(`hull:${def.id}`), materials: registry,
            palette: poi, faction: 'player', lod: 0,
          });
          hull.lod.autoUpdate = false;
          hull.lod.levels.forEach((l, li) => { l.object.visible = li === 0; });
          hull.root.traverse((o) => {
            if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; }
          });
          holder.add(hull.root);

          const inst = attachModule(hull, def.hardpoint, def, mctx(def.id, def.faction));
          // Prove the mirror: the same port-authored definition on both sponsons.
          if (def.hardpoint === 'port') {
            attachModule(hull, 'starboard', def, mctx(`${def.id}:stbd`, def.faction));
          }
          shown.push({ def, tris: inst.object.userData.triangles ?? 0 });
          cells.push({ holder, col, row, half: measureCell(holder) });
        }
      }
    }

    // Apply the measured grid. `view.spacing` / `view.rowGap` stay as floors so a
    // set of small modules keeps its authored, tighter framing.
    const cellW = Math.max(...cells.map((c) => c.half.w));
    const cellH = Math.max(...cells.map((c) => c.half.h));
    const spacing = Math.max(view.spacing, cellW * 2 + CELL_MARGIN);
    const rowGap = Math.max(view.rowGap ?? 0, cellH * 2 + CELL_MARGIN);
    for (const c of cells) {
      const col = c.col * spacing;
      const row = c.row * rowGap;
      // Bare modules stack in Y, which maps straight to screen vertical at any
      // pitch. Hulls stack along the camera's forward axis and are viewed from high
      // enough that that axis also maps to screen vertical - ships are plane-locked
      // and floating one above another would be a lie.
      if (bare) c.holder.position.set(rx * col, row, rz * col);
      else c.holder.position.set(rx * col - fx * row, 0, rz * col - fz * row);
    }
    ctx.grid = { spacing, rowGap, cellW, cellH };

    Object.assign(pose, { distance: view.dist, pitch: view.pitch, yaw: view.yaw });
    pose.target.set(view.target[0], view.target[1], view.target[2]);
    ctx.spin = false;

    // FRAMING. Every set's distance used to be a hand-tuned constant, and the fifth
    // subject in the port and ventral rows ran off the right-hand edge - so the last
    // item in each sheet could not be critiqued at all. Both the grid and the cell
    // size are now measured off the built geometry, so the extent is known rather
    // than assumed. Only ever increases the distance: a set that already fits keeps
    // its authored framing.
    {
      const maxCol = Math.max(...cells.map((c) => Math.abs(c.col)));
      const maxRow = Math.max(...cells.map((c) => Math.abs(c.row)));
      const halfW = maxCol * spacing + cellW;
      const halfH = maxRow * rowGap + cellH;
      const halfD = Math.max(...cells.map((c) => c.half.d));
      const tanV = Math.tan((ctx.camera.fov * Math.PI) / 180 * 0.5);
      const tanH = tanV * ctx.camera.aspect;
      pose.distance = Math.max(view.dist, (halfW / tanH) * 1.06 + halfD, (halfH / tanV) * 1.06 + halfD);
    }

    // ---- audit -------------------------------------------------------------
    const report = auditModules((def, l) => ({
      rng: world.rng.fork(`audit:${def.id}:${l}`),
      materials: registry, palette: poi, faction: def.faction, lod: l,
    }));

    const el = document.getElementById('label');
    if (el) {
      const head = [
        `MODULE LIBRARY  set=${setName}${bare ? ' BARE' : ' ON HULL'} lod=${lod}`,
        `${report.count} modules   worst ${report.worst} / ${MODULE_TRI_BUDGET} tris   `
        + `${report.ok ? 'ALL WITHIN BUDGET' : '*** BUDGET BREACH ***'}   lights every ${MODULE_LIGHT_SPACING_M}m`,
        '',
      ];
      const body = params.get('audit') === '1'
        ? auditTable(report).split('\n')
        : shown.map((s, i) => `${String(i + 1).padStart(2)}. ${s.def.name.padEnd(30)} `
          + `T${s.def.tier} ${s.def.faction.padEnd(10)} ${String(s.tris).padStart(4)} tris`);
      el.textContent = [...head, ...body].join('\n');
      el.style.whiteSpace = 'pre';
    }

    console.log('[probe:modules]', auditTable(report));
    console.log('[probe:modules] materials outside registry:', registry.auditScene(scene));
    console.log('[probe:modules] off-palette colours:', registry.paletteAudit().foreign);
    ctx.report = report;
  },
};
