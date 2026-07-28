/**
 * FACTION SHIP PROBE — every class at once, under one hard key.
 *
 *   node tools/probe.mjs ships --out docs/probes/ships.png
 *   node tools/probe.mjs ships --seed 'ships#sil=1&view=side' --out docs/probes/ships-silhouette-side.png
 *   node tools/probe.mjs ships --seed 'ships#sil=1&view=top'  --out docs/probes/ships-silhouette-top.png
 *   node tools/probe.mjs ships --seed 'ships#view=coalition'  --out docs/probes/ships-coalition.png
 *   node tools/probe.mjs ships --seed 'ships#view=concord'    --out docs/probes/ships-concord.png
 *
 * `tools/probe.mjs` only forwards `--seed`, so - exactly as the cruiser probe does -
 * options are read from the seed string after a '#'. (Requested upstream: a
 * `--query` pass-through on tools/probe.mjs.)
 *
 * OPTIONS
 *   view=lineup    default. Every faction class in a row at TRUE RELATIVE SCALE with
 *                  a 1400 m cruiser reference beside them. If a 95 m corvette does
 *                  not look 95 m next to it, the lineup has failed.
 *   view=beam      the same row seen from the beam, near-orthographic.
 *   view=coalition | view=concord    one navy, close enough to read the greeble.
 *   sil=1          SILHOUETTE SHEET: nine classes as black shapes on white in a
 *                  3x3 grid, every one scaled to the SAME length so the audit is
 *                  about shape and not about size. Combine with view=side (profile)
 *                  or view=top (plan). This is a pass/fail test: if two classes are
 *                  not tellable apart here, no amount of shading will save them.
 *   lod=0|1|2      force an LOD on every hull. Default 0.
 *   spin=0|1       slow orbit.
 */

import * as THREE from 'three';
import { createMaterialRegistry, SCALE } from '../art/materials/index.js';
import { getPOIPalette, getFactionPalette, NEUTRAL } from '../art/palette.js';
import { HULL_LENGTH } from '../core/units.js';
import { ALL_SHIP_CLASSES } from '../art/geometry/ships/index.js';
import { auditParts } from '../art/geometry/ships/common.js';

const POI = 'giant-orbit';

/**
 * Row order. The 1400 m cruiser reference anchors the LEFT end and then the two
 * navies run small-to-large and large-to-small, so the reader's eye crosses every
 * size step twice and meets the two design languages back to back in the middle.
 */
const LINEUP = [
  '<cruiser>',
  'coalition_strikecraft', 'coalition_corvette', 'coalition_frigate', 'coalition_destroyer',
  'concord_destroyer', 'concord_frigate', 'concord_corvette', 'concord_strikecraft',
];

/** Silhouette sheet, row-major. Nine cells, nine classes. */
const SHEET = [
  ['coalition_corvette', 'coalition_frigate', 'coalition_destroyer'],
  ['concord_corvette', 'concord_frigate', 'concord_destroyer'],
  ['coalition_strikecraft', 'concord_strikecraft', 'derelict_ancient_hulk'],
];

/** Every silhouette is drawn at this length. The audit is about shape. */
const SHEET_LENGTH = 250;
const SHEET_COL = 330;
const SHEET_ROW = 175;

/**
 * `lineup` is a near-plan view on purpose: length differences are the point, and a
 * three-quarter camera foreshortens exactly the axis being compared. It is tipped
 * 24 degrees off vertical so the key still finds the flanks.
 */
const VIEWS = {
  lineup: { distance: 3300, pitch: 1.14, yaw: 0.0, fov: 32 },
  beam: { distance: 4600, pitch: 0.06, yaw: -Math.PI * 0.5, fov: 30 },
};

const byId = (id) => ALL_SHIP_CLASSES.find((c) => c.id === id);

/** Bounds of a class at LOD0, measured from the pure parts - no GPU needed. */
function measure(def, rng) {
  const a = auditParts(def.partsFor, rng, 0);
  const b = a.bounds;
  return {
    tris: a.triangles,
    draws: a.draws,
    length: b.max.z - b.min.z,
    beam: b.max.x - b.min.x,
    height: b.max.y - b.min.y,
  };
}

/**
 * The 1400 m player cruiser, as a plain box with the mandatory 6 m running lights.
 * It is deliberately NOT the real cruiser hull: this probe is a test of the faction
 * ships' scale, and a detailed cruiser beside them would be the thing being looked
 * at. A box that is honestly 1400 x 300 x 200 m is the reference.
 */
function cruiserReference(registry) {
  const g = new THREE.Group();
  g.name = 'cruiser-reference';
  const L = HULL_LENGTH.cruiser, W = 300, H = 200;
  const box = (w, h, d, mat) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    // Metre UVs, same contract as the registry's maps.
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if (nx >= ny && nx >= nz) { u = z; v = y; } else if (ny >= nz) { u = x; v = z; } else { u = x; v = y; }
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  // One dark surface for the whole reference. It is a RULER, not a ship: giving it
  // the bright hull material makes the thing being measured with compete with the
  // things being measured.
  const hull = registry.get('hullDark', { faction: 'player', wear: 0.625 });
  const dark = hull;
  g.add(box(W, H, L * 0.7, hull));
  const dorsal = box(W * 0.5, H * 0.8, L * 0.3, dark);
  dorsal.position.set(0, H * 0.8, -L * 0.2);
  g.add(dorsal);
  const prow = box(W * 0.55, H * 0.5, L * 0.3, dark);
  prow.position.set(0, -H * 0.2, L * 0.44);
  g.add(prow);

  const lightMat = registry.get('runningLights', { faction: 'player', intensity: 2.2 });
  const stripLen = L * 0.92;
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(stripLen, 8);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * stripLen);
    uv.needsUpdate = true;
    const strip = new THREE.Mesh(geo, lightMat);
    strip.rotation.y = side * Math.PI * 0.5;
    strip.position.set(side * (W * 0.5 + 0.8), H * 0.25, 0);
    strip.renderOrder = 4;
    g.add(strip);
  }
  return g;
}

/** Force one LOD level on every THREE.LOD under `root`. */
function forceLod(root, want) {
  root.traverse((o) => {
    if (!o.isLOD) return;
    o.autoUpdate = false;
    o.levels.forEach((l, i) => { l.object.visible = i === Math.min(want, o.levels.length - 1); });
  });
}

export default {
  name: 'Faction ships',
  camera: { distance: 2500, pitch: 0.92, yaw: 0.16, target: new THREE.Vector3(0, 0, 0) },

  async setup(ctx) {
    const { scene, far, world, renderer, pose, camera } = ctx;
    const seedOpts = new URLSearchParams((ctx.params.get('seed') ?? '').split('#')[1] ?? '');
    const params = { get: (k) => ctx.params.get(k) ?? seedOpts.get(k) };

    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('ships-probe-materials'),
      poi: POI,
    });
    world.systems.materials = registry;
    ctx.registry = registry;

    const poi = getPOIPalette(POI);
    const silhouette = params.get('sil') === '1';
    const viewName = params.get('view') ?? (silhouette ? 'side' : 'lineup');
    const lodWant = Math.max(0, Math.min(2, Number(params.get('lod') ?? 0) | 0));

    const buildCtxFor = (id) => ({
      rng: world.rng.fork(`ships:${id}`),
      materials: registry,
      palette: poi,
      faction: byId(id)?.faction ?? 'player',
      lod: 0,
    });

    // ---- measurements, printed either way --------------------------------
    const table = [];
    for (const def of ALL_SHIP_CLASSES) {
      const m = measure(def, world.rng.fork(`measure:${def.id}`));
      table.push({
        id: def.id, role: def.role, declared: def.length,
        measured: +m.length.toFixed(1), beam: +m.beam.toFixed(1), height: +m.height.toFixed(1),
        tris: m.tris, budget: def.triBudget, draws: m.draws,
        over: m.tris > def.triBudget ? 'OVER' : '',
      });
    }
    console.table(table);
    ctx.table = table;

    // =====================================================================
    // SILHOUETTE SHEET
    // =====================================================================
    if (silhouette) {
      const black = registry.get('emissive', { faction: 'player', color: NEUTRAL.void, intensity: 0 });
      // Camera sits at -X, so ship +Z maps to screen RIGHT and every hull points
      // the way a reader expects. For the plan view a +90 degree roll about Z puts
      // the dorsal surface toward the lens.
      const roll = viewName === 'top' ? Math.PI * 0.5 : 0;

      for (let r = 0; r < SHEET.length; r++) {
        for (let c = 0; c < SHEET[r].length; c++) {
          const id = SHEET[r][c];
          const def = byId(id);
          if (!def) continue;
          const holder = new THREE.Group();
          const inner = def.build(buildCtxFor(id));
          forceLod(inner, lodWant);
          inner.traverse((o) => {
            if (!o.isMesh) return;
            // Additive strips and glow discs are not silhouette; they would only
            // add white specks to a black shape.
            if (o.name?.includes('runningLights') || o.name?.includes('engineGlow')
              || o.name?.includes('emissive') || o.isInstancedMesh) { o.visible = false; return; }
            o.material = black;
            o.castShadow = false;
            o.receiveShadow = false;
          });
          inner.rotation.z = roll;
          holder.add(inner);
          holder.scale.setScalar(SHEET_LENGTH / def.length);
          holder.position.set(
            0,
            (1 - r) * SHEET_ROW,
            (c - 1) * SHEET_COL,
          );
          scene.add(holder);
        }
      }

      // Near-orthographic: a silhouette audit judged through a 46 degree lens is
      // judging the lens. 9 degrees at 6 km is close enough to parallel.
      camera.fov = 9;
      camera.updateProjectionMatrix();
      Object.assign(pose, { distance: 6200, pitch: 0.0, yaw: -Math.PI * 0.5 });
      pose.target.set(0, 0, 0);
      ctx.spin = false;

      const white = new THREE.Color()
        .setHex(getFactionPalette('player').emissiveHot, THREE.SRGBColorSpace).multiplyScalar(4.0);
      far.background = white;
      scene.background = null;
      scene.environment = null;
      renderer.post.bloom.enabled = false;
      renderer.post.gtao.enabled = false;
      renderer.post.godrays.enabled = false;
      const gu = renderer.post.grade.uniforms;
      gu.vignette.value = 0; gu.grain.value = 0; gu.aberration.value = 0; gu.saturation.value = 1;

      label(ctx, [
        `SILHOUETTE SHEET — ${viewName === 'top' ? 'PLAN' : 'PROFILE'} — all hulls at ${SHEET_LENGTH} m`,
        'row 1  Lancet / Ardent / Bulwark        (Coalition)',
        'row 2  Whipcord / Meridian / Peregrine  (Concord)',
        'row 3  Bolt / Shrike / Ancient Hulk',
      ]);
      return;
    }

    // =====================================================================
    // LIT LINEUP
    // =====================================================================
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
    scene.background = null;

    // One hard key, low and off the starboard bow. A 0.18-albedo hull needs
    // irradiance around 8 to land mid-frame after ACES - see palette.js.
    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), 6.8,
    );
    key.position.set(0.62, 0.52, 0.58).normalize().multiplyScalar(8000);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 2000;
    key.shadow.camera.far = 16000;
    const S = 1500;
    key.shadow.camera.left = -S; key.shadow.camera.right = S;
    key.shadow.camera.top = S; key.shadow.camera.bottom = -S;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 1.4;
    scene.add(key);
    scene.add(key.target);

    const fill = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace), 0.35,
    );
    fill.position.set(-0.7, -0.3, -0.55).normalize().multiplyScalar(8000);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(
      new THREE.Color().setHex(poi.bounce.color, THREE.SRGBColorSpace),
      new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 0.55,
    ));
    registry.applyEnvironment(scene, POI, 0.32);

    const keyProxy = new THREE.Object3D();
    keyProxy.position.copy(key.position);
    scene.add(keyProxy);
    renderer.post.setKeyLight(keyProxy, new THREE.Color(1.0, 0.94, 0.82));
    renderer.post.godrays.enabled = false;
    renderer.renderer.toneMappingExposure = 1.0;

    // Row layout: pack by beam so nothing overlaps and nothing floats in a void.
    const widths = LINEUP.map((id) => (id === '<cruiser>' ? 300 : byId(id)
      ? measure(byId(id), world.rng.fork(`w:${id}`)).beam : 40));
    const GAP = 260;
    const total = widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
    const placed = Object.create(null);
    const placedObjects = Object.create(null);
    let x = -total * 0.5;
    for (let i = 0; i < LINEUP.length; i++) {
      const id = LINEUP[i];
      x += widths[i] * 0.5;
      let obj;
      if (id === '<cruiser>') {
        obj = cruiserReference(registry);
      } else {
        const def = byId(id);
        if (!def) { x += widths[i] * 0.5 + GAP; continue; }
        obj = def.build(buildCtxFor(id));
        forceLod(obj, lodWant);
      }
      obj.position.set(x, 0, 0);
      placed[id] = x;
      placedObjects[id] = obj;
      scene.add(obj);
      x += widths[i] * 0.5 + GAP;
    }

    // A view named after a class frames that class alone; anything else uses the
    // named presets. One rule, so every hull can be looked at without new code.
    ctx.subjects = Object.values(placedObjects);

    let view = VIEWS[viewName];
    if (!view && byId(viewName)) {
      const def = byId(viewName);
      view = {
        distance: def.length * 1.9, pitch: 0.26, yaw: 0.92, fov: 40,
        target: [placed[viewName] ?? 0, def.length * 0.03, 0],
      };
    }
    view = view ?? VIEWS.lineup;
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    Object.assign(pose, { distance: Number(params.get('dist') ?? view.distance), pitch: view.pitch, yaw: view.yaw });
    pose.target.set(...(view.target ?? [0, 0, 0]));
    ctx.spin = params.get('spin') === '1';

    // FRAMING. The lineup used to be posed by a hand-tuned distance, and the row's
    // left end - the 1400 m cruiser ruler, by a factor of three the largest object
    // in the shot - ran off the bottom of the frame AND sat under the readout, so
    // the first subject in the sheet could not be evaluated at all. A review frame
    // whose subject is cropped is a review frame that proves nothing, so the pose is
    // now derived from the subjects' real bounds rather than guessed.
    // Only for the whole-row views; a view named after one class is meant to frame
    // that class and nothing else.
    if (!params.get('dist') && VIEWS[viewName] && ctx.subjects?.length) {
      fitToSubjects(camera, pose, ctx.subjects, { margin: 1.16 });
    }

    const worst = table.filter((t) => t.over).map((t) => t.id);
    label(ctx, [
      `FACTION SHIPS — view=${viewName} lod=${lodWant}`,
      `running lights every ${SCALE.runningLightSpacingM} m on every hull`,
      ...table.map((t) => `${t.id.padEnd(24)} ${String(t.measured).padStart(6)} m  ${String(t.tris).padStart(5)}/${t.budget} tris  ${t.draws} draws`),
      worst.length ? `OVER BUDGET: ${worst.join(', ')}` : 'all classes inside budget',
      '',
      'left-hand block is the 1400 m CRUISER RULER, not a hull. See cruiserReference().',
    ], { align: 'right' });

    console.log('[probe:ships] materials outside registry:', registry.auditScene(scene));
    console.log('[probe:ships] off-palette colours:', registry.paletteAudit().foreign);
  },

  update(dt, ctx) {
    if (ctx.spin) ctx.pose.yaw += dt * 0.08;
  },
};

function label(ctx, lines, { align = 'left' } = {}) {
  const el = document.getElementById('label');
  if (!el) return;
  el.textContent = lines.join('\n');
  el.style.whiteSpace = 'pre';
  // The readout goes on the side of the frame the subjects are NOT on. In the
  // lineup the row runs small-on-the-right, so a right-anchored block sits over
  // empty sky; left-anchored it sat on top of the biggest object in the shot.
  if (align === 'right') {
    el.style.left = 'auto';
    el.style.right = '12px';
    el.style.textAlign = 'right';
  } else {
    el.style.left = '12px';
    el.style.right = 'auto';
    el.style.textAlign = 'left';
  }
  void ctx;
}

/**
 * Point the pose at the subjects' real bounds and back off far enough that all of
 * them fit, with margin. Works off the camera basis implied by the pose, so it is
 * correct at any yaw/pitch and does not care which axis the row was laid along.
 */
function fitToSubjects(camera, pose, objects, { margin = 1.15 } = {}) {
  const box = new THREE.Box3();
  for (const o of objects) box.expandByObject(o);
  if (box.isEmpty()) return;

  const centre = box.getCenter(new THREE.Vector3());
  const p = pose.pitch, y = pose.yaw;
  // Camera sits at target + (sin y, tan-ish, cos y) * d and looks back at it.
  const fwd = new THREE.Vector3(
    -Math.cos(p) * Math.sin(y), -Math.sin(p), -Math.cos(p) * Math.cos(y),
  ).normalize();
  const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

  let hr = 0, hu = 0, hf = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      .sub(centre);
    hr = Math.max(hr, Math.abs(v.dot(right)));
    hu = Math.max(hu, Math.abs(v.dot(up)));
    hf = Math.max(hf, Math.abs(v.dot(fwd)));
  }

  const tanV = Math.tan((camera.fov * Math.PI) / 180 * 0.5);
  const tanH = tanV * camera.aspect;
  const d = Math.max(hu / tanV, hr / tanH) * margin + hf;
  pose.target.copy(centre);
  pose.distance = d;
}
