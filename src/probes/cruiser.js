/**
 * CRUISER PROBE — the hull, on its own, under one hard light.
 *
 *   node tools/probe.mjs cruiser --out docs/probes/cruiser.png
 *
 * Query parameters (probe.html?p=cruiser&...):
 *
 *   lod=0|1|2|auto   force an LOD level. Default 0. `auto` restores distance-driven
 *                    switching so you can watch it pop.
 *   view=orbit|top|side|bow|stern|quarter|bay   camera preset. Default orbit.
 *                    `bay` sits BELOW the combat plane looking up into the salvage
 *                    bay. It exists because the one claim this hull makes that a
 *                    three-quarter render cannot check is that the bay is a THROUGH
 *                    SLOT rather than a recess, and the only proof of that is seeing
 *                    background come out the other side of it.
 *   spin=0|1         slow orbit. Default 1 for `orbit`, 0 for fixed views.
 *   dist=<metres>    camera distance override.
 *   sockets=1        draw the six hardpoint sockets as coloured markers with their
 *                    outward normals, so a module author can see exactly where the
 *                    origin of their build() output will land.
 *   modules=1        install four throwaway test modules built from the greeble kit.
 *                    The port cannon bank is installed on BOTH sponsons from a single
 *                    port-authored definition, which is the mirroring proof.
 *   sil=1            SILHOUETTE AUDIT: every material replaced with flat black,
 *                    background white, post effects off. Combine with view=top and
 *                    view=side. If the prow, the dorsal structure, the ventral cradle
 *                    and the engine block are not each identifiable in those two
 *                    images, the hull has failed and no amount of shading will save it.
 *
 * tools/probe.mjs only forwards `--seed`, not arbitrary query parameters, and the
 * harness is owned by integration. So this probe ALSO reads options from the seed
 * string after a '#', which keeps the screenshot loop usable from the CLI:
 *
 *   node tools/probe.mjs cruiser --seed 'cruiser#view=side&sil=1' \
 *        --out docs/probes/cruiser-silhouette-side.png
 *
 * (Requested upstream: let tools/probe.mjs pass through a --query flag.)
 */

import * as THREE from 'three';
import { createMaterialRegistry } from '../art/materials/index.js';
import { getPOIPalette, getFactionPalette, NEUTRAL } from '../art/palette.js';
import { BUDGET } from '../core/units.js';
import { buildCruiser, hullParts, RUNNING_LIGHT_AXIS_SPACING_M } from '../art/geometry/cruiser.js';
import {
  CRUISER_HARDPOINTS, attachModule, getSilhouetteSignature,
} from '../art/geometry/hardpoints.js';
import * as G from '../art/geometry/greeble.js';

const POI = 'giant-orbit';

/**
 * Camera presets. Pitch is radians above the combat plane; negative pitch is below it.
 *
 * The distances went up with the 2025 hull: the working envelope is 1400 x 396 x 616 m
 * once the cutter yoke and the outrigger pods are counted, and a camera at 1480 m was
 * cropping the ends off the ship in every fixed view.
 *
 * `bay` is BELOW the combat plane on purpose. The single claim this hull makes that a
 * lit three-quarter render cannot check is that the salvage bay is a THROUGH-SLOT and
 * not a recess, and the only way to check that is to put the camera under it and see
 * whether background comes through.
 */
const VIEWS = {
  orbit: { distance: 2050, pitch: 0.28, yaw: 0.95, spin: true },
  quarter: { distance: 1950, pitch: 0.34, yaw: 2.30, spin: false },
  top: { distance: 2100, pitch: 1.5, yaw: Math.PI * 0.5, spin: false },
  side: { distance: 2100, pitch: 0.002, yaw: Math.PI * 0.5, spin: false },
  bow: { distance: 1500, pitch: 0.16, yaw: 0.0, spin: false },
  stern: { distance: 1500, pitch: 0.20, yaw: Math.PI, spin: false },
  bay: { distance: 1500, pitch: -0.44, yaw: 1.90, spin: false },
};

/** One marker colour per mount, all from the locked palette. */
const SOCKET_COLORS = {
  bow: NEUTRAL.hostile,
  dorsal: NEUTRAL.select,
  ventral: NEUTRAL.salvage,
  port: NEUTRAL.friendly,
  starboard: getFactionPalette('coalition').trim,
  engine: getFactionPalette('concord').emissive,
};

export default {
  name: 'Cruiser hull',
  camera: { distance: 1480, pitch: 0.28, yaw: 0.95, target: new THREE.Vector3(0, 20, 0) },

  async setup(ctx) {
    const { scene, far, world, renderer, pose } = ctx;

    // URL params win; anything after a '#' in the seed is a fallback option string.
    const seedOpts = new URLSearchParams((ctx.params.get('seed') ?? '').split('#')[1] ?? '');
    const params = { get: (k) => ctx.params.get(k) ?? seedOpts.get(k) };

    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('cruiser-probe-materials'),
      poi: POI,
    });
    world.systems.materials = registry;
    ctx.registry = registry;

    const poi = getPOIPalette(POI);
    const silhouette = params.get('sil') === '1' || params.get('silhouette') === '1';
    const viewName = params.get('view') ?? 'orbit';
    const view = VIEWS[viewName] ?? VIEWS.orbit;

    Object.assign(pose, {
      distance: Number(params.get('dist') ?? view.distance),
      pitch: view.pitch,
      yaw: view.yaw,
    });
    pose.target.set(0, viewName === 'side' ? 0 : 20, 0);
    ctx.spin = params.get('spin') != null ? params.get('spin') === '1' : view.spin;

    // ---- environment -----------------------------------------------------
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
    scene.background = null;

    // One hard key. Low and off the port bow, so the chamfers on the starboard
    // flank rim-light and the port flank falls into near-black. Value contrast on
    // this ship is the lighting doing what the geometry set up.
    //
    // The INTENSITY is read from the POI palette, not written here. It used to be a
    // hardcoded 3.5, which is a pre-r155 number roughly a quarter of what the
    // palette states, and the probe only looked correct because the hull materials
    // of the day were bright enough and metallic enough to make up the difference
    // out of the environment map. The moment the materials were corrected the probe
    // rendered a near-black ship and blamed the material work for it. A probe that
    // does not use the game's own numbers cannot verify anything.
    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), poi.key.intensity,
    );
    key.position.set(0.62, 0.48, 0.62).normalize().multiplyScalar(4000);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 500;
    key.shadow.camera.far = 7000;
    const S = 1100;
    key.shadow.camera.left = -S; key.shadow.camera.right = S;
    key.shadow.camera.top = S; key.shadow.camera.bottom = -S;
    key.shadow.bias = -0.0012;
    key.shadow.normalBias = 2.0;
    scene.add(key);
    scene.add(key.target);

    // A whisper of planetshine so the shadow side is near-black rather than black.
    // Stated the way the POI rig states it: the peak channel of the irradiance it
    // contributes, so a saturated blue does not arrive with its blue channel
    // rivalling the key's. See world/lighting/poi.js.
    const fillColor = new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace);
    const fillPeak = Math.max(fillColor.r, fillColor.g, fillColor.b, 1e-3);
    const fill = new THREE.DirectionalLight(fillColor, (poi.fill.intensity * 0.5) / fillPeak);
    fill.position.set(-0.7, -0.35, -0.5).normalize().multiplyScalar(4000);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 0.7));
    registry.applyEnvironment(scene, POI, poi.ibl.intensity ?? 0.6);

    const keyProxy = new THREE.Object3D();
    keyProxy.position.copy(key.position);
    scene.add(keyProxy);
    renderer.post.setKeyLight(keyProxy, new THREE.Color(1.0, 0.94, 0.82));
    renderer.post.godrays.enabled = false;    // nothing to shaft through out here
    renderer.post.gtao.updateGtaoMaterial({ radius: 26.0, thickness: 10.0, distanceExponent: 1.5, samples: 12 });
    renderer.renderer.toneMappingExposure = 0.98;

    // ---- the ship --------------------------------------------------------
    const buildCtx = {
      rng: world.rng.fork('cruiser'),
      materials: registry,
      palette: poi,
      faction: 'player',
      lod: 0,
    };
    const hull = buildCruiser(buildCtx);
    scene.add(hull.root);
    world.hullResult = hull;
    ctx.hull = hull;

    // ---- forced LOD ------------------------------------------------------
    const lodParam = params.get('lod') ?? '0';
    if (lodParam !== 'auto') {
      const want = Math.max(0, Math.min(2, Number(lodParam) | 0));
      hull.lod.autoUpdate = false;
      hull.lod.levels.forEach((l, i) => { l.object.visible = i === want; });
      ctx.forcedLod = want;
    } else {
      ctx.forcedLod = null;
    }

    // ---- test modules ----------------------------------------------------
    if (params.get('modules') === '1') {
      const mctx = (label) => ({
        rng: world.rng.fork(`testmodule:${label}`),
        materials: registry,
        palette: poi,
        faction: 'player',
        lod: 0,
      });
      // One definition, installed twice: the starboard copy is mirrored by the
      // attachment system, not by the author.
      attachModule(hull, 'port', TEST_MODULES.cannonBank, mctx('port'));
      attachModule(hull, 'starboard', TEST_MODULES.cannonBank, mctx('starboard'));
      attachModule(hull, 'bow', TEST_MODULES.lance, mctx('bow'));
      attachModule(hull, 'dorsal', TEST_MODULES.turret, mctx('dorsal'));
      attachModule(hull, 'engine', TEST_MODULES.drive, mctx('engine'));
    }

    // ---- socket markers --------------------------------------------------
    if (params.get('sockets') === '1') {
      for (const def of CRUISER_HARDPOINTS) {
        const entry = hull.hardpoints.get(def.id);
        const mat = registry.get('emissive', {
          faction: 'player', color: SOCKET_COLORS[def.id], intensity: 2.4,
        });
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(17, 0), mat);
        entry.socket.add(marker);
        // A stub along the outward normal: this is the direction a module grows in.
        const stub = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 90), mat);
        stub.position.set(def.normal[0] * 45, def.normal[1] * 45, def.normal[2] * 45);
        if (def.normal[0]) stub.rotation.y = Math.PI * 0.5;
        else if (def.normal[1]) stub.rotation.x = Math.PI * 0.5;
        entry.socket.add(stub);
      }
    }

    // ---- silhouette audit ------------------------------------------------
    if (silhouette) {
      // Palette-legal pure black, still stamped by the registry so auditMaterials
      // stays clean while the audit runs.
      const black = registry.get('emissive', { faction: 'player', color: NEUTRAL.void, intensity: 0 });
      hull.root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.isInstancedMesh || o.name?.includes('runningLights')) { o.visible = false; return; }
        o.material = black;
        o.castShadow = false;
        o.receiveShadow = false;
      });
      const white = new THREE.Color().setHex(getFactionPalette('player').emissiveHot, THREE.SRGBColorSpace);
      far.background = white.multiplyScalar(4.0);   // survives ACES and lands near 1.0
      renderer.post.bloom.enabled = false;
      renderer.post.gtao.enabled = false;
      renderer.post.godrays.enabled = false;
      scene.environment = null;
      // The grade's vignette, grain and aberration all soften an edge. An audit of
      // an outline has to look at the outline, not at the photography.
      const gu = renderer.post.grade.uniforms;
      gu.vignette.value = 0;
      gu.grain.value = 0;
      gu.aberration.value = 0;
      gu.saturation.value = 1;
    }

    // ---- floating-geometry audit -----------------------------------------
    // Run at EVERY LOD, because the failure mode this catches is specifically an
    // LOD failure: a bracket or a diagonal gets dropped by the decimation and the
    // thing it was holding is left hanging in space. Two separate review findings -
    // "a small grey slab hangs in empty space 40 m above the superstructure" and
    // "a hole straight through the hull between the aft fins" - were this bug and
    // its coplanar-faces twin, and both were found by a human staring at a PNG.
    // A human should not be the check for something a bounding-box sweep does in
    // twenty milliseconds.
    const detached = [];
    for (const l of [0, 1, 2]) detached.push(...floatingParts(l, world.rng));
    if (detached.length) console.error('[probe:cruiser] DETACHED GEOMETRY', detached);
    else console.log('[probe:cruiser] attachment audit: every part connected at LOD 0/1/2');

    // ---- report ----------------------------------------------------------
    const sig = getSilhouetteSignature(hull);
    const t = hull.stats.triangles;
    const c = hull.stats.drawCalls;
    const over = t[0] > BUDGET.cruiserCoreTris ? '  *** OVER BUDGET ***' : '';
    const el = document.getElementById('label');
    if (el) {
      el.textContent = [
        `CRUISER  ${sig.length}m x ${sig.beam}m x ${sig.height}m`,
        `LOD0 ${t[0]} tris / ${c[0]} draws   LOD1 ${t[1]} / ${c[1]}   LOD2 ${t[2]} / ${c[2]}`,
        `budget ${BUDGET.cruiserCoreTris}${over}   running lights every ${RUNNING_LIGHT_AXIS_SPACING_M}m`,
        `view=${viewName} lod=${lodParam}${silhouette ? ' SILHOUETTE' : ''}`,
      ].join('\n');
      el.style.whiteSpace = 'pre';
    }
    console.log('[probe:cruiser] triangles', t, 'draws', c);
    console.log('[probe:cruiser] silhouette', sig);
    console.log('[probe:cruiser] materials outside registry:', registry.auditScene(scene));
    console.log('[probe:cruiser] off-palette colours:', registry.paletteAudit().foreign);
    ctx.signature = sig;
  },

  update(dt, ctx) {
    if (ctx.spin) ctx.pose.yaw += dt * 0.10;
  },
};

/**
 * Every LOD-`lod` sub-part whose bounding box overlaps no other part's — i.e. every
 * piece of the ship that is not physically attached to the rest of it.
 *
 * Union-find over shrunk bounding boxes. The 0.5 m shrink is what makes it useful
 * rather than vacuous: two parts that merely ABUT, sharing a face at exactly one
 * coordinate, are reported as separate, because a shared face is a z-fight and a
 * truss whose members only kiss comes apart the moment an LOD drops the diagonal
 * that was quietly holding it. The shrink is clamped so a legitimately flat part is
 * not shrunk out of existence.
 *
 * Known and accepted: `core/hull#…`, the transom annulus, is a zero-depth plane
 * lying exactly on the hull loft's aft station, so no shrink can make it overlap
 * anything. Flat parts are therefore excluded.
 *
 * KNOWN LIMITATION, stated so nobody trusts this further than it goes. The spine's
 * bounding box is the whole ship, so any part inside that box counts as connected to
 * it whether or not it touches actual skin. This catches things OUTSIDE the hull
 * envelope - the bay, the yoke, the pods, the radiators, anything on the dorsal -
 * which is where every floating-geometry defect so far has been, but it cannot catch
 * a part buried in open interior volume. A real fix is a triangle-level proximity
 * test; that is a bigger tool than this probe should own.
 *
 * @returns {string[]} human-readable descriptions, empty when the hull is sound
 */
function floatingParts(lod, rng) {
  const { buckets } = hullParts({ rng: rng.fork('cruiser'), lod });
  const items = [];
  for (const b of buckets) {
    if (b.surface === 'engineGlow') continue;           // additive decals touch nothing
    for (let i = 0; i < b.parts.length; i++) {
      const g = G.mergeParts([b.parts[i]], { uv: false });
      g.computeBoundingBox();
      const box = g.boundingBox.clone();
      let flat = false;
      for (const a of ['x', 'y', 'z']) {
        const d = Math.min(0.5, (box.max[a] - box.min[a]) * 0.49);
        if (d < 0.5) flat = true;
        box.min[a] += d;
        box.max[a] -= d;
      }
      items.push({ name: `${b.key}#${i}`, box, flat });
      g.dispose();
    }
  }
  const parent = items.map((_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].box.intersectsBox(items[j].box)) parent[find(i)] = find(j);
    }
  }
  const counts = new Map();
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  // The hull is one big component; anything in a component of its own is floating.
  const biggest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return items
    .filter((it, i) => find(i) !== biggest && !it.flat)
    .map((it) => `lod${lod} ${it.name} [${it.box.min.toArray().map(Math.round)} .. ${it.box.max.toArray().map(Math.round)}]`);
}

// ---------------------------------------------------------------------------
// Throwaway test modules. These are NOT registered and NOT shipping content -
// they exist so the attachment contract can be proven visually, and so the module
// stream has four worked examples of "author it in ship-space orientation with the
// origin at the mount point".
// ---------------------------------------------------------------------------

function moduleMesh(ctx, parts, surface = 'plating') {
  const geo = G.mergeParts(parts);
  const opts = surface === 'greeble'
    ? { faction: ctx.faction, wear: 0.5, tier: 1 }
    : { faction: ctx.faction, wear: 0.42, tier: 2 };
  const mesh = new THREE.Mesh(geo, ctx.materials.get(surface, opts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const TEST_MODULES = {
  /**
   * PORT cannon bank. Authored looking outboard along -X, base at the origin.
   * Installed on 'starboard' it is mirrored for you - do not author a second copy.
   */
  cannonBank: {
    id: 'test_cannon_bank', name: 'Test Cannon Bank', hardpoint: 'port', tier: 2,
    faction: 'player', triBudget: 400,
    build(ctx) {
      const g = new THREE.Group();
      const body = [
        { geo: G.panelledSlab({ width: 74, height: 34, depth: 130, chamfer: 10 }), pos: [-14, 20, 0] },
        { geo: G.panelledSlab({ width: 40, height: 26, depth: 84, chamfer: 8 }), pos: [-52, 40, 0] },
      ];
      for (let i = 0; i < 3; i++) {
        body.push({
          geo: G.pipeRun({ length: 96, radius: 7, sides: 6, axis: 'x', flanges: 1 }),
          pos: [-56, 40, -34 + i * 34],
          rot: [0, Math.PI, 0],
        });
      }
      g.add(moduleMesh(ctx, body));
      return g;
    },
  },

  /** Bow lance. Grows forward along +Z from the origin. */
  lance: {
    id: 'test_bow_lance', name: 'Test Bow Lance', hardpoint: 'bow', tier: 2,
    faction: 'player', triBudget: 400,
    build(ctx) {
      const g = new THREE.Group();
      g.add(moduleMesh(ctx, [
        { geo: G.panelledSlab({ width: 62, height: 34, depth: 78, chamfer: 10 }), pos: [0, 18, 0] },
        { geo: G.taperedWedge({ length: 150, width0: 40, height0: 26, width1: 14, height1: 12, chamfer: 5 }), pos: [0, 22, 30] },
        { geo: G.dockingCollar({ radius: 26, depth: 10, sides: 8 }), pos: [0, 22, 24] },
      ]));
      return g;
    },
  },

  /** Dorsal turret. Ring at y=0, mass above it. */
  turret: {
    id: 'test_dorsal_turret', name: 'Test Dorsal Turret', hardpoint: 'dorsal', tier: 2,
    faction: 'player', triBudget: 400,
    build(ctx) {
      const g = new THREE.Group();
      g.add(moduleMesh(ctx, [
        { geo: G.dockingCollar({ radius: 54, depth: 14, sides: 8 }), pos: [0, 0, 0], rot: [-Math.PI * 0.5, 0, 0] },
        { geo: G.panelledSlab({ width: 88, height: 40, depth: 96, chamfer: 14 }), pos: [0, 34, -6] },
        { geo: G.pipeRun({ length: 86, radius: 8, sides: 6, axis: 'z', flanges: 1 }), pos: [-16, 40, 40] },
        { geo: G.pipeRun({ length: 86, radius: 8, sides: 6, axis: 'z', flanges: 1 }), pos: [16, 40, 40] },
      ]));
      return g;
    },
  },

  /** Main drive. Fills the empty well and protrudes aft along -Z. */
  drive: {
    id: 'test_main_drive', name: 'Test Main Drive', hardpoint: 'engine', tier: 2,
    faction: 'player', triBudget: 400,
    build(ctx) {
      const g = new THREE.Group();
      g.add(moduleMesh(ctx, [
        { geo: G.panelledSlab({ width: 118, height: 78, depth: 70, chamfer: 20 }), pos: [0, 0, -34] },
        { geo: G.thrusterBell({ throat: 40, mouth: 62, length: 76, sides: 8 }), pos: [0, 0, -70] },
      ], 'greeble'));
      return g;
    },
  },
};
