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
import { SCALE, TextureFactory } from '../art/textures/index.js';
import { RNG } from '../core/rng.js';

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
  camera: { distance: 985, pitch: 0.075, yaw: 0.065, target: new THREE.Vector3(0, 22, 0) },

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
    // Straight from the POI palette. If the chart looks wrong the palette is
    // wrong - the probe is not allowed its own private lighting.
    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), poi.key.intensity,
    );
    key.position.set(-0.55, 0.62, 0.86).normalize().multiplyScalar(4000);
    scene.add(key);
    scene.add(key.target);

    const rim = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace), poi.fill.intensity,
    );
    rim.position.set(0.8, -0.30, -0.5).normalize().multiplyScalar(4000);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(
      new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 1.4,
    ));

    registry.applyEnvironment(scene, 'station', 1.25);

    // Volumetrics aimed at nothing would radially smear the chart from the frame
    // centre; a material read has to be clean.
    renderer.post.godrays.enabled = false;
    // GTAO costs a full depth+normal prepass, which doubles the draw calls and,
    // on the SwiftShader review machine, the frame time. On a chart of separated
    // objects with no shared contact surfaces it contributes almost nothing - the
    // baked cavity AO in the ORM map is doing that work already.
    renderer.post.gtao.enabled = false;
    /**
     * EXPOSURE 1.0, NOT 1.18, AND IT MUST STAY THAT WAY.
     *
     * This was 1.18 to lift a chart that measured dark, which was the wrong lever:
     * the chart measured dark because the POI keys were calibrated to put a fully lit
     * face at 0.57 instead of 0.76 (see palette.js#giant-orbit). Now that the keys
     * are solved, a probe running its own exposure would be showing the material at a
     * stop the game never uses — and the whole reason this probe reads its light out
     * of the POI palette rather than making one up is that a probe which does not use
     * the game's numbers cannot verify anything.
     */
    renderer.renderer.toneMappingExposure = 1.0;
    // A chart is not a shot: the shipping vignette pulls the outer columns two
    // stops down and they cannot be compared with the middle ones.
    renderer.post.grade.uniforms.vignette.value = 0.16;
    renderer.post.grade.uniforms.grain.value = 0.014;

    // --- shared geometry ----------------------------------------------------
    const R = SPHERE_R;
    const sphereGeo = metreUVSphere(new THREE.SphereGeometry(R, 40, 28), R);
    const plainSphereGeo = new THREE.SphereGeometry(R, 40, 28);
    const slabGeo = metreUV(new THREE.BoxGeometry(70, 18, 40));
    const backGeo = metreUV(new THREE.BoxGeometry(74, 60, 12));
    const bellGeo = metreUV(new THREE.CylinderGeometry(13, 26, 40, 22, 1, true));
    const shardGeo = metreUV(new THREE.IcosahedronGeometry(17, 0));
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
        // Wear is held CONSTANT across the faction rows. Varying it here would
        // conflate "this faction looks like that" with "this sample is dirtier",
        // which is the single easiest way to misread a material chart. Wear gets
        // its own axis in the DAMAGED and DERELICT columns instead.
        const wear = 0.42;

        // --- debris: one InstancedMesh, one draw call, mixed faction colours ---
        if (mkey === 'debris') {
          const mat = registry.get('debris', { faction, wear: 0.5, instanced: true });
          const inst = new THREE.InstancedMesh(shardGeo, mat, 5);
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const e = new THREE.Euler();
          const s = new THREE.Vector3();
          const p = new THREE.Vector3();
          const rr = world.rng.fork(`debris:${r}`);
          const col = new THREE.Color();
          for (let i = 0; i < 5; i++) {
            p.set(rr.signed() * 20, rr.signed() * 20, rr.signed() * 14);
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

    // Scorch is only interesting composited. This one is an ordinary hull tile that
    // has had four blasts stamped into its live albedo canvas after the fact, which
    // is exactly what happens when a hardpoint takes a hit in game.
    const burnt = registry.damageable('hull', { faction: 'coalition', wear: 0.5, tier: 2 });
    const burnRng = world.rng.fork('probe-burn');
    for (let i = 0; i < 4; i++) {
      burnt.userData.applyScorch({
        u: 0.18 + burnRng.next() * 0.64,
        v: 0.18 + burnRng.next() * 0.64,
        radius: 0.10 + burnRng.next() * 0.16,
        severity: 0.45 + burnRng.next() * 0.5,
      });
    }

    const STRIP = [
      [coalitionHull.map, 'CLN ALBEDO'],
      [coalitionHull.normalMap, 'NORMAL'],
      [coalitionHull.ormMap, 'AO ROUGH METAL'],
      [concordHull.map, 'CNC ALBEDO'],
      [derelictMaps.map, 'DERELICT'],
      [greeb.normal, 'GREEBLE'],
      [wearMask.texture, 'WEAR RGB'],
      [scorchTex.texture, 'SCORCH STAMP'],
      [burnt.userData.maps.map, 'SCORCH ON HULL'],
      [decalSheet.texture, 'DECALS'],
      [lights.texture, 'LIGHTS 6M'],
    ];

    const quad = new THREE.PlaneGeometry(1, 1);
    const stripY = ROW_Y(FACTION_ROWS.length - 1) - 116;
    const stripW = 106;
    const cardMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHex(NEUTRAL.rockDark, THREE.SRGBColorSpace),
      toneMapped: false,
    });
    cardMat.userData.__paletteKey = 'probe:chrome';
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
      // transparent so the scorch stamp's alpha reads against the backdrop instead
      // of showing its RGB with the coverage thrown away.
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: true });
      m.userData.__paletteKey = 'probe:chrome';
      const mesh = new THREE.Mesh(quad, m);
      const aspect = (src.image?.width ?? 1) / (src.image?.height ?? 1);
      const h = aspect > 2 ? stripW / aspect : stripW;
      mesh.scale.set(stripW, h, 1);
      const x = (i - (STRIP.length - 1) / 2) * (stripW + 10);
      mesh.position.set(x, stripY, 0);
      // Backing card: the scorch stamp is black carbon with an alpha mask, and
      // against a black frame that is a black square. Everything gets the same
      // card so the tiles read as a strip.
      const card = new THREE.Mesh(quad, cardMat);
      card.scale.set(stripW + 4, h + 4, 1);
      card.position.set(x, stripY, -2);
      scene.add(card);
      scene.add(mesh);
      addLabel(scene, label, x, stripY - stripW * 0.5 - 16, 1.22, NEUTRAL.select);
    }

    // -----------------------------------------------------------------------
    // Labels: generated block glyphs on unlit quads.
    // -----------------------------------------------------------------------
    for (let c = 0; c < COLUMNS.length; c++) {
      addLabel(scene, COLUMNS[c].label, COL_X(c), ROW_Y(0) + 62, 1.7, poi.accent);
    }
    for (let r = 0; r < FACTION_ROWS.length; r++) {
      const pal = getFactionPalette(FACTION_ROWS[r]);
      addLabel(scene, FACTION_ROWS[r], COL_X(0) - 82, ROW_Y(r) - 2, 2.0, pal.emissive, 1.25);
    }
    addLabel(scene, 'NADIR POINT / MATERIAL REGISTRY', 0, ROW_Y(0) + 116, 2.3, NEUTRAL.select, 1.05);
    addLabel(scene,
      `ONE UV UNIT = ONE METRE   /   RUNNING LIGHT SPACING = ${SCALE.runningLightSpacingM} M   /   EVERY MAP GENERATED AT RUNTIME`,
      0, stripY - stripW * 0.5 - 44, 1.2, poi.accent, 0.9);

    // -----------------------------------------------------------------------
    ctx.audit = contractSelfTest(registry, scene);
  },
};

/**
 * One line of block-glyph text on an unlit quad.
 *
 * Sized by METRES PER GLYPH CELL, not by a fixed quad width. With a fixed width
 * "HULL" renders at three times the size of "HULLDARK" and the chart reads like a
 * ransom note - which is exactly what the first version of this did.
 */
const GLYPH_PX = 6;
function addLabel(scene, text, x, y, cellM, colorHex, brightness = 1.0) {
  const canvas = textCanvas(text, { cell: GLYPH_PX, pad: 5, ink: 0xffffff, tracking: 1 });
  const width = (canvas.width / GLYPH_PX) * cellM;
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

/**
 * The registry is a contract three other streams code against. A probe that only
 * renders it proves the pixels; this proves the promises. Anything failing here is
 * a console.error, which makes tools/probe.mjs exit non-zero, so the guarantees
 * cannot rot silently.
 */
function contractSelfTest(registry, scene) {
  const fails = [];
  const check = (name, ok) => { if (!ok) fails.push(name); };

  // Memoisation: normalisation happens BEFORE the cache key, so explicitly passing
  // a default must land on the same instance.
  const a = registry.get('hull', { faction: 'coalition' });
  const b = registry.get('hull', { faction: 'coalition', wear: 0.45, tier: 1, scale: 1 });
  check('get() is memoised across default-filled opts', a === b);
  check('get() is memoised across repeat calls', a === registry.get('hull', { faction: 'coalition' }));
  check('different opts give different instances', a !== registry.get('hull', { faction: 'concord' }));
  check('instanced flag gives its own instance',
    a !== registry.get('hull', { faction: 'coalition', instanced: true }));
  check('instanced materials do NOT set vertexColors (would render black)',
    registry.get('debris', { faction: 'player', instanced: true }).vertexColors === false);
  check('textures are shared between materials that share maps',
    registry.get('hull', { faction: 'coalition' }).map
      === registry.get('hull', { faction: 'coalition', tier: 1 }).map);

  let threw = false;
  try { registry.get('nonsense'); } catch { threw = true; }
  check('unknown key throws', threw);
  threw = false;
  try { registry.get('hull', { faction: 'borg' }); } catch { threw = true; }
  check('unknown faction throws', threw);

  const audit = registry.audit();
  check('audit() has the contracted shape',
    typeof audit.materials === 'number' && typeof audit.textures === 'number' && !!audit.byKey);

  const dmg = registry.damageable('hull', { faction: 'coalition' });
  check('damageable() is uncached', dmg !== registry.damageable('hull', { faction: 'coalition' }));
  check('damageable() exposes applyScorch', typeof dmg.userData.applyScorch === 'function');
  check('damageable() has its own canvases',
    dmg.userData.maps.albedoCanvas !== registry.get('hull', { faction: 'coalition' }).userData.maps.albedoCanvas);

  // Determinism: two factories built from the same seed must produce byte-identical
  // output, and must not care what order things were asked for. Checked on a cheap
  // generator so the probe does not pay for a second full bake.
  {
    const f1 = new TextureFactory({ rng: new RNG('determinism') });
    const f2 = new TextureFactory({ rng: new RNG('determinism') });
    f2.get('glow', { faction: 'derelict' });            // different call order on purpose
    const a1 = f1.get('scorch', { faction: 'coalition', severity: 0.75 }).canvas;
    const a2 = f2.get('scorch', { faction: 'coalition', severity: 0.75 }).canvas;
    const d1 = a1.getContext('2d').getImageData(0, 0, a1.width, 4).data;
    const d2 = a2.getContext('2d').getImageData(0, 0, a2.width, 4).data;
    let same = d1.length === d2.length;
    for (let i = 0; same && i < d1.length; i++) if (d1[i] !== d2[i]) same = false;
    check('same seed + different call order gives identical textures', same);
    f1.dispose(); f2.dispose();
  }

  const pal = registry.paletteAudit();
  check(`no off-palette colours (saw ${pal.foreign.length})`, pal.foreign.length === 0);
  const offenders = registry.auditScene(scene);
  check(`no materials built outside the registry (saw ${offenders.length})`, offenders.length === 0);

  console.log('[probe:materials] audit', JSON.stringify(audit));
  if (fails.length) {
    console.error('[probe:materials] CONTRACT FAILURES:\n  ' + fails.join('\n  '));
  } else {
    console.log('[probe:materials] contract self-test passed (14 checks)');
  }
  return audit;
}
