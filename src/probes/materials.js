/**
 * MATERIAL PROBE.
 *
 * The whole material system in one frame: every registry key, every faction, under
 * a single hard key light against near-black, plus the raw generated texture maps
 * on flat quads so the panel layout, the wear, the scorch and the decals can be
 * inspected directly rather than guessed at from a sphere.
 *
 *   node tools/probe.mjs materials --out docs/probes/materials.png --width 1800 --height 950
 *
 * Rows are factions. Columns are material keys. Two keys use the row axis for a
 * second parameter because they are faction-independent:
 *   derelictHull  rows are wear 0.15 / 0.42 / 0.69 / 0.96
 *   asteroid      rows are ore content 0.05 / 0.15 / 0.25 / 0.35
 *
 * Every emissive object is deliberately SMALL. Bloom responds to area at least as
 * much as to intensity, and a 30 m glowing sphere floods the frame and destroys
 * exactly the near-black the rest of the chart is being judged against.
 *
 * Labels use the generated 5x7 block glyph set from art/textures/decals.js. No DOM
 * text, no fonts, nothing that can be missing on someone else's machine.
 */

import * as THREE from 'three';
import { createMaterialRegistry } from '../art/materials/index.js';
import { textCanvas } from '../art/textures/decals.js';
import { getPOIPalette, getFactionPalette, NEUTRAL } from '../art/palette.js';
import { SCALE } from '../art/textures/index.js';

const FACTION_ROWS = ['coalition', 'concord', 'derelict', 'player'];

const COLUMNS = [
  { key: 'hull', label: 'HULL' },
  { key: 'hullDark', label: 'HULLDARK' },
  { key: 'plating', label: 'PLATING' },
  { key: 'greeble', label: 'GREEBLE' },
  { key: 'trim', label: 'TRIM' },
  { key: 'damaged', label: 'DAMAGED' },
  { key: 'derelictHull', label: 'DERELICT' },
  { key: 'debris', label: 'DEBRIS' },
  { key: 'asteroid', label: 'ASTEROID' },
  { key: 'glass', label: 'GLASS' },
  { key: 'emissive', label: 'EMISSIVE' },
  { key: 'engineGlow', label: 'ENGINE' },
  { key: 'runningLights', label: 'LIGHTS' },
];

const CELL = 96;
const COL_X = (c) => (c - (COLUMNS.length - 1) / 2) * CELL;
const ROW_Y = (r) => 215 - r * CELL;
const SPHERE_R = 26;

// ---------------------------------------------------------------------------
// UV helpers. The registry's contract is "one UV unit is one metre", so the probe
// has to honour it or every plate renders at the wrong physical size.
// ---------------------------------------------------------------------------

/** Box/triplanar projection in metres, from the dominant vertex normal. */
function metreUV(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; }
    else if (ny >= nz) { u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Spheres get their analytic UVs rescaled to metres so plates wrap correctly. */
function metreUVSphere(geometry, radius) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * Math.PI * 2 * radius, uv.getY(i) * Math.PI * radius);
  }
  uv.needsUpdate = true;
  return geometry;
}

// ---------------------------------------------------------------------------

export default {
  name: 'Materials — registry, factions, generated maps',
  camera: { distance: 920, pitch: 0.085, yaw: 0.075, target: new THREE.Vector3(0, 25, 0) },

  async setup(ctx) {
    const { scene, far, world, renderer } = ctx;
    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('materials-probe'),
      poi: 'station',
    });
    world.systems.materials = registry;
    ctx.registry = registry;

    const poi = getPOIPalette('station');

    // --- backdrop: near-black, not black. Pure 0 gives the dither nothing to do.
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
    scene.background = null;

    // --- one hard key, one cold rim, one procedural environment --------------
    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), 3.5,
    );
    key.position.set(-0.55, 0.62, 0.86).normalize().multiplyScalar(4000);
    scene.add(key);
    scene.add(key.target);

    const rim = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace), 0.75,
    );
    rim.position.set(0.8, -0.30, -0.5).normalize().multiplyScalar(4000);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(
      new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 1.4,
    ));

    registry.applyEnvironment(scene, 'station', 1.0);

    // Volumetrics aimed at nothing would radially smear the chart from the frame
    // centre; a material read has to be clean.
    renderer.post.godrays.enabled = false;
    renderer.post.gtao.updateGtaoMaterial({ radius: 8.0, thickness: 4.0, distanceExponent: 1.4, samples: 12 });
    renderer.renderer.toneMappingExposure = 1.08;

    // --- shared geometry ----------------------------------------------------
    const R = SPHERE_R;
    const sphereGeo = metreUVSphere(new THREE.SphereGeometry(R, 40, 28), R);
    const plainSphereGeo = new THREE.SphereGeometry(R, 40, 28);
    const slabGeo = metreUV(new THREE.BoxGeometry(70, 18, 40));
    const backGeo = metreUV(new THREE.BoxGeometry(74, 60, 12));
    const bellGeo = metreUV(new THREE.CylinderGeometry(13, 26, 40, 22, 1, true));
    const shardGeo = metreUV(new THREE.IcosahedronGeometry(15, 0));
    const lampGeo = new THREE.SphereGeometry(9, 20, 14);
    const barGeo = new THREE.BoxGeometry(46, 4.5, 4.5);

    // Running lights: U in metres along the strip (so 6 m spacing is real),
    // V left at 0..1 across the strip's width.
    const stripGeo = new THREE.PlaneGeometry(78, 10);
    {
      const uv = stripGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 78);
      uv.needsUpdate = true;
    }

    const grid = new THREE.Group();
    scene.add(grid);
    const put = (obj, x, y, z = 0) => { obj.position.set(x, y, z); grid.add(obj); return obj; };

    for (let r = 0; r < FACTION_ROWS.length; r++) {
      const faction = FACTION_ROWS[r];
      const y = ROW_Y(r);

      for (let c = 0; c < COLUMNS.length; c++) {
        const { key: mkey } = COLUMNS[c];
        const x = COL_X(c);
        const wear = 0.18 + r * 0.24;

        // --- debris: one InstancedMesh, one draw call, mixed faction colours ---
        if (mkey === 'debris') {
          const mat = registry.get('debris', { faction, wear: 0.7, instanced: true });
          const inst = new THREE.InstancedMesh(shardGeo, mat, 5);
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const e = new THREE.Euler();
          const s = new THREE.Vector3();
          const p = new THREE.Vector3();
          const rr = world.rng.fork(`debris:${r}`);
          const col = new THREE.Color();
          for (let i = 0; i < 5; i++) {
            p.set(rr.signed() * 24, rr.signed() * 22, rr.signed() * 16);
            e.set(rr.next() * 6.28, rr.next() * 6.28, rr.next() * 6.28);
            q.setFromEuler(e);
            const k = 0.55 + rr.next() * 0.7;
            s.set(k, k * (0.35 + rr.next() * 0.45), k * (0.75 + rr.next() * 0.5));
            m.compose(p, q, s);
            inst.setMatrixAt(i, m);
            const f = getFactionPalette(FACTION_ROWS[(r + i) % FACTION_ROWS.length]);
            col.setHex(f.base, THREE.SRGBColorSpace);
            inst.setColorAt(i, col);
          }
          inst.instanceMatrix.needsUpdate = true;
          inst.instanceColor.needsUpdate = true;
          put(inst, x, y);
          continue;
        }

        // --- engine bell -----------------------------------------------------
        if (mkey === 'engineGlow') {
          const bell = new THREE.Mesh(bellGeo, registry.get('hullDark', { faction, wear: 0.5 }));
          bell.rotation.x = Math.PI * 0.5;
          put(bell, x, y - 2, -6);
          const glow = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 14),
            registry.get('engineGlow', { faction }));
          put(glow, x, y - 2, 12);
          continue;
        }

        // --- running lights on a hull strip -----------------------------------
        if (mkey === 'runningLights') {
          const back = new THREE.Mesh(backGeo, registry.get('hull', { faction, wear: 0.4 }));
          put(back, x, y - 4, -12);
          const strip = new THREE.Mesh(stripGeo, registry.get('runningLights', { faction }));
          put(strip, x, y + 6, 2);
          continue;
        }

        // --- emissive: a lamp and a light bar, at plausible physical size ------
        if (mkey === 'emissive') {
          const back = new THREE.Mesh(backGeo, registry.get('hullDark', { faction, wear: 0.5 }));
          put(back, x, y - 4, -12);
          const mat = registry.get('emissive', { faction });
          put(new THREE.Mesh(lampGeo, mat), x, y + 14, 2);
          put(new THREE.Mesh(barGeo, mat), x, y - 14, 0);
          continue;
        }

        let material;
        let useMetreUV = true;
        switch (mkey) {
          case 'damaged': material = registry.get('damaged', { faction, severity: 0.25 + r * 0.25 }); break;
          case 'derelictHull': material = registry.get('derelictHull', { wear: 0.15 + r * 0.27, tier: 1 + (r % 3) }); break;
          case 'asteroid': material = registry.get('asteroid', { ore: 0.05 + r * 0.10 }); break;
          case 'glass': material = registry.get('glass', { faction }); useMetreUV = false; break;
          default: material = registry.get(mkey, { faction, wear, tier: 1 + (r % 3) }); break;
        }

        if (mkey === 'glass') {
          // A canopy is only legible against the hull it is set into.
          const back = new THREE.Mesh(backGeo, registry.get('hull', { faction, wear: 0.35 }));
          put(back, x, y - 4, -18);
        }

        const sphere = new THREE.Mesh(useMetreUV ? sphereGeo : plainSphereGeo, material);
        put(sphere, x, y + 14, 24);
        const slab = new THREE.Mesh(slabGeo, material);
        slab.rotation.y = -0.34;
        slab.rotation.x = 0.14;
        put(slab, x, y - 26, -14);
      }
    }

    // -----------------------------------------------------------------------
    // Raw generated maps, flat and unlit, so they can be read as images.
    // -----------------------------------------------------------------------
    const tex = registry.textures;
    const hullArgs = (faction, w) => ({ faction, variant: 'hull', wear: w, tier: 2, size: 512, scale: 1, markings: true });
    const coalitionHull = tex.get('hull', hullArgs('coalition', 0.5));
    const concordHull = tex.get('hull', hullArgs('concord', 0.25));
    const derelictMaps = tex.get('hull', hullArgs('derelict', 0.875));
    const greeb = tex.get('greeble', { size: 512, density: 1.3 });
    const wearMask = tex.get('wear', {
      size: 512, amount: 0.85, panel: coalitionHull.panel,
      edge: 0.8, streak: 0.8, grime: 0.55, pit: 0.25,
    });
    const scorchTex = tex.get('scorch', { faction: 'coalition', severity: 0.85, size: 256 });
    const decalSheet = tex.get('decals', { faction: 'coalition', size: 512 });
    const lights = tex.get('runningLights', { faction: 'concord' });

    const STRIP = [
      [coalitionHull.map, 'CLN ALBEDO'],
      [coalitionHull.normalMap, 'NORMAL'],
      [coalitionHull.ormMap, 'AO ROUGH METAL'],
      [concordHull.map, 'CNC ALBEDO'],
      [derelictMaps.map, 'DERELICT'],
      [greeb.normal, 'GREEBLE'],
      [wearMask.texture, 'WEAR RGB'],
      [scorchTex.texture, 'SCORCH'],
      [decalSheet.texture, 'DECALS'],
      [lights.texture, 'LIGHTS 6M'],
    ];

    const quad = new THREE.PlaneGeometry(1, 1);
    const stripY = ROW_Y(FACTION_ROWS.length - 1) - 118;
    const stripW = 116;
    for (let i = 0; i < STRIP.length; i++) {
      const [src, label] = STRIP[i];
      const t = src.clone();
      t.needsUpdate = true;
      t.repeat.set(1, 1);
      t.offset.set(0, 0);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      // Display exactly what was authored: decode as sRGB so the output transform
      // becomes an identity rather than a gamma lift on the data maps.
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
      m.userData.__paletteKey = 'probe:chrome';
      const mesh = new THREE.Mesh(quad, m);
      const aspect = (src.image?.width ?? 1) / (src.image?.height ?? 1);
      const h = aspect > 2 ? stripW / aspect : stripW;
      mesh.scale.set(stripW, h, 1);
      const x = (i - (STRIP.length - 1) / 2) * (stripW + 12);
      mesh.position.set(x, stripY, 0);
      scene.add(mesh);
      addLabel(scene, label, x, stripY - h * 0.5 - 13, 100, NEUTRAL.select);
    }

    // -----------------------------------------------------------------------
    // Labels: generated block glyphs on unlit quads.
    // -----------------------------------------------------------------------
    for (let c = 0; c < COLUMNS.length; c++) {
      addLabel(scene, COLUMNS[c].label, COL_X(c), ROW_Y(0) + 64, 86, poi.accent);
    }
    for (let r = 0; r < FACTION_ROWS.length; r++) {
      const pal = getFactionPalette(FACTION_ROWS[r]);
      addLabel(scene, FACTION_ROWS[r], COL_X(0) - 66, ROW_Y(r) - 2, 112, pal.emissive, 1.2);
    }
    addLabel(scene, 'NADIR POINT / MATERIAL REGISTRY', 0, ROW_Y(0) + 120, 360, NEUTRAL.select, 1.05);
    addLabel(scene, `UV UNIT = 1 METRE / RUNNING LIGHT SPACING = ${SCALE.runningLightSpacingM} M`,
      0, stripY - 96, 400, poi.accent, 0.85);

    // -----------------------------------------------------------------------
    const audit = registry.audit();
    const offenders = registry.auditScene(scene);
    console.log('[probe:materials] registry audit', JSON.stringify(audit));
    console.log('[probe:materials] off-palette colours:', registry.paletteAudit().foreign.length);
    console.log('[probe:materials] materials outside registry:', offenders.length);
    ctx.audit = audit;
  },
};

/** One line of block-glyph text on an unlit quad. */
function addLabel(scene, text, x, y, width, colorHex, brightness = 1.0) {
  const canvas = textCanvas(text, { cell: 6, pad: 5, ink: 0xffffff, tracking: 1 });
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: t,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
    color: new THREE.Color().setHex(colorHex, THREE.SRGBColorSpace).multiplyScalar(brightness),
  });
  mat.userData.__paletteKey = 'probe:chrome';
  const h = width * (canvas.height / canvas.width);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
  mesh.position.set(x, y, 40);
  scene.add(mesh);
  return mesh;
}
