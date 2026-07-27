/**
 * MATERIAL PROBE.
 *
 * The whole material system in one frame: every registry key, every faction, under
 * a single hard key light against near-black, plus the raw generated texture maps
 * on flat quads so the panel layout, the wear, the scorch and the decals can be
 * inspected directly rather than guessed at from a sphere.
 *
 *   node tools/probe.mjs materials --out docs/probes/materials.png --width 1600 --height 1000
 *
 * Rows are factions. Columns are material keys. Two keys use the row axis for a
 * second parameter because they are faction-independent:
 *   derelictHull  rows are wear 0.15 / 0.4 / 0.65 / 0.95
 *   asteroid      rows are ore content 0.05 / 0.15 / 0.25 / 0.35
 *
 * Labels are drawn with the generated 5x7 block glyph set from
 * art/textures/decals.js. No DOM text, no fonts, nothing that can be missing on
 * someone else's machine.
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

const CELL = 108;
const COL_X = (c) => (c - (COLUMNS.length - 1) / 2) * CELL;
const ROW_Y = (r) => 250 - r * CELL;

// ---------------------------------------------------------------------------
// UV helpers. The registry's whole contract is "one UV unit is one metre", so the
// probe has to honour it or every plate will be the wrong size.
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
  camera: { distance: 1180, pitch: 0.10, yaw: 0.085, target: new THREE.Vector3(0, 60, 0) },

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

    // --- backdrop: near-black, not black. Pure 0 kills the dither's job. -----
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
    scene.background = null;

    // --- one hard key, one whisper of fill, one procedural environment ------
    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), 3.6,
    );
    key.position.set(-0.55, 0.62, 0.86).normalize().multiplyScalar(4000);
    scene.add(key);
    scene.add(key.target);

    const fill = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace), 0.55,
    );
    fill.position.set(0.75, -0.25, -0.5).normalize().multiplyScalar(4000);
    scene.add(fill);

    scene.add(new THREE.AmbientLight(
      new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 1.2,
    ));

    registry.applyEnvironment(scene, 'station', 0.55);

    // Volumetrics aimed at nothing would radially smear the chart from the frame
    // centre; a material read has to be clean.
    renderer.post.godrays.enabled = false;
    renderer.post.gtao.updateGtaoMaterial({ radius: 9.0, thickness: 4.0, distanceExponent: 1.4, samples: 12 });
    renderer.renderer.toneMappingExposure = 1.06;

    // --- shared geometry ----------------------------------------------------
    const R = 30;
    const sphereGeo = metreUVSphere(new THREE.SphereGeometry(R, 40, 28), R);
    const plainSphereGeo = new THREE.SphereGeometry(R, 40, 28);
    const slabGeo = metreUV(new THREE.BoxGeometry(76, 20, 46));
    // Running lights: U in metres along the strip (so the 6 m spacing is real),
    // V left at 0..1 across the strip's width.
    const stripGeo = new THREE.PlaneGeometry(84, 11);
    {
      const uv = stripGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 84);
      uv.needsUpdate = true;
    }
    const bellGeo = metreUV(new THREE.CylinderGeometry(14, 30, 44, 20, 1, true));
    const shardGeo = metreUV(new THREE.IcosahedronGeometry(11, 0));

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

        if (mkey === 'debris') {
          // Proves the contract that matters most for this key: one InstancedMesh,
          // one draw call, four factions' worth of wreckage.
          const mat = registry.get('debris', { faction, wear: 0.7, instanced: true });
          const inst = new THREE.InstancedMesh(shardGeo, mat, 7);
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const s = new THREE.Vector3();
          const p = new THREE.Vector3();
          const rr = world.rng.fork(`debris:${r}`);
          const col = new THREE.Color();
          for (let i = 0; i < 7; i++) {
            p.set(rr.signed() * 30, rr.signed() * 26, rr.signed() * 22);
            q.setFromEuler(new THREE.Euler(rr.next() * 6.28, rr.next() * 6.28, rr.next() * 6.28));
            const k = 0.5 + rr.next() * 0.9;
            s.set(k, k * (0.35 + rr.next() * 0.5), k * (0.7 + rr.next() * 0.6));
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

        let material;
        let useMetreUV = true;
        switch (mkey) {
          case 'damaged': material = registry.get('damaged', { faction, severity: 0.25 + r * 0.25 }); break;
          case 'derelictHull': material = registry.get('derelictHull', { wear: 0.15 + r * 0.27, tier: 1 + (r % 3) }); break;
          case 'asteroid': material = registry.get('asteroid', { ore: 0.05 + r * 0.10 }); break;
          case 'glass': material = registry.get('glass', { faction }); useMetreUV = false; break;
          case 'emissive': material = registry.get('emissive', { faction }); useMetreUV = false; break;
          case 'engineGlow': material = registry.get('engineGlow', { faction }); useMetreUV = false; break;
          case 'runningLights': material = registry.get('runningLights', { faction }); useMetreUV = false; break;
          default: material = registry.get(mkey, { faction, wear, tier: 1 + (r % 3) }); break;
        }

        if (mkey === 'engineGlow') {
          const bell = new THREE.Mesh(bellGeo, registry.get('hullDark', { faction, wear: 0.5 }));
          bell.rotation.x = Math.PI * 0.5;
          put(bell, x, y - 4, 0);
          const glow = new THREE.Mesh(new THREE.SphereGeometry(20, 20, 14), material);
          put(glow, x, y - 4, 20);
          continue;
        }

        if (mkey === 'runningLights') {
          const back = new THREE.Mesh(slabGeo, registry.get('hull', { faction, wear: 0.4 }));
          put(back, x, y - 6, -14);
          const strip = new THREE.Mesh(stripGeo, material);
          put(strip, x, y + 16, 10);
          continue;
        }

        const sphere = new THREE.Mesh(useMetreUV ? sphereGeo : plainSphereGeo, material);
        put(sphere, x, y + 12, 26);
        const slab = new THREE.Mesh(slabGeo, material);
        slab.rotation.y = -0.34;
        slab.rotation.x = 0.12;
        put(slab, x, y - 28, -16);
      }
    }

    // -----------------------------------------------------------------------
    // Raw generated maps, flat and unlit, so they can be read as images.
    // -----------------------------------------------------------------------
    const tex = registry.textures;
    const coalitionHull = tex.get('hull', { faction: 'coalition', variant: 'hull', wear: 0.5, tier: 2, size: 512, scale: 1, markings: true });
    const concordHull = tex.get('hull', { faction: 'concord', variant: 'hull', wear: 0.25, tier: 2, size: 512, scale: 1, markings: true });
    const derelictHullMaps = tex.get('hull', { faction: 'derelict', variant: 'hull', wear: 0.85, tier: 2, size: 512, scale: 1, markings: true });
    const greeb = tex.get('greeble', { size: 512, density: 1.3 });
    const wearMask = tex.get('wear', {
      size: 512, amount: 0.85, panel: coalitionHull.panel,
      edge: 0.8, streak: 0.75, grime: 0.6, pit: 0.2,
    });
    const scorchTex = tex.get('scorch', { faction: 'coalition', severity: 0.85, size: 256 });
    const decalSheet = tex.get('decals', { faction: 'coalition', size: 512 });
    const lights = tex.get('runningLights', { faction: 'concord' });

    const STRIP = [
      [coalitionHull.map, 'CLN ALBEDO'],
      [coalitionHull.normalMap, 'NORMAL'],
      [coalitionHull.ormMap, 'AO/ROUGH/METAL'],
      [concordHull.map, 'CNC ALBEDO'],
      [derelictHullMaps.map, 'DERELICT'],
      [greeb.normal, 'GREEBLE'],
      [wearMask.texture, 'WEAR RGB'],
      [scorchTex.texture, 'SCORCH'],
      [decalSheet.texture, 'DECALS'],
      [lights.texture, 'LIGHTS 6M'],
    ];

    const quad = new THREE.PlaneGeometry(1, 1);
    const stripY = ROW_Y(FACTION_ROWS.length - 1) - 132;
    const stripW = 118;
    for (let i = 0; i < STRIP.length; i++) {
      const [src, label] = STRIP[i];
      const t = src.clone();
      t.needsUpdate = true;
      t.repeat.set(1, 1);
      t.offset.set(0, 0);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      // Display exactly what was authored: decode as sRGB so the output transform
      // is an identity rather than a gamma lift.
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
      m.userData.__paletteKey = 'probe:chrome';
      const mesh = new THREE.Mesh(quad, m);
      const aspect = (src.image?.width ?? 1) / (src.image?.height ?? 1);
      const w = stripW;
      const h = aspect > 2 ? w / aspect : w;
      mesh.scale.set(w, h, 1);
      const x = (i - (STRIP.length - 1) / 2) * (stripW + 12);
      mesh.position.set(x, stripY, 0);
      scene.add(mesh);
      addLabel(scene, label, x, stripY - (h * 0.5) - 13, 96, NEUTRAL.select);
    }

    // -----------------------------------------------------------------------
    // Labels: generated block glyphs on emissive quads.
    // -----------------------------------------------------------------------
    for (let c = 0; c < COLUMNS.length; c++) {
      addLabel(scene, COLUMNS[c].label, COL_X(c), ROW_Y(0) + 74, 92, poi.accent);
    }
    for (let r = 0; r < FACTION_ROWS.length; r++) {
      const pal = getFactionPalette(FACTION_ROWS[r]);
      addLabel(scene, FACTION_ROWS[r], COL_X(0) - 108, ROW_Y(r), 128, pal.emissive, 1.35);
    }
    addLabel(scene, 'NADIR POINT / MATERIAL REGISTRY', 0, ROW_Y(0) + 132, 420, NEUTRAL.select, 1.1);
    addLabel(scene, `RUNNING LIGHT SPACING ${SCALE.runningLightSpacingM}M / UV UNIT = 1M`,
      0, stripY - 108, 380, poi.accent, 0.9);

    // -----------------------------------------------------------------------
    const audit = registry.audit();
    const offenders = registry.auditScene(scene);
    console.log('[probe:materials] registry audit', audit);
    console.log('[probe:materials] palette audit', registry.paletteAudit().foreign);
    console.log('[probe:materials] materials outside registry:', offenders.length, offenders.slice(0, 5));
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
