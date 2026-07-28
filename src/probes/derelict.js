/**
 * ANCIENT HULK PROBE — 3.4 km of derelict in the Graveyard.
 *
 *   node tools/probe.mjs derelict --out docs/probes/derelict.png
 *   node tools/probe.mjs derelict --seed 'd#view=breach' --out docs/probes/derelict-breach.png
 *   node tools/probe.mjs derelict --seed 'd#view=axis'   --out docs/probes/derelict-axis.png
 *   node tools/probe.mjs derelict --seed 'd#sil=1'       --out docs/probes/derelict-silhouette.png
 *
 * WHAT THIS FRAME HAS TO PROVE
 *   1. It does not belong in the same war as the other two navies. No bridge, no
 *      engine, no deck, five-fold instead of bilateral, and a ring at an angle
 *      nothing else on the object agrees with.
 *   2. It is BROKEN OPEN. The 240 m gap in the spine has to read as a wound with
 *      structure inside it, not as two objects that happen to be near each other.
 *   3. IT IS ENORMOUS. The 1400 m cruiser reference is in frame on purpose. If the
 *      hulk does not dwarf it, the scale cues have failed.
 *
 * Options (after a '#' in --seed, exactly as the cruiser probe does):
 *   view=hero|breach|axis|crown|ring    camera preset
 *   sil=1                               black on white silhouette
 *   lod=0|1|2                           force an LOD
 *   debris=0                            hide the drifting debris
 */

import * as THREE from 'three';
import { setupPOIProbe } from './poi_common.js';
import { getFactionPalette, NEUTRAL } from '../art/palette.js';
import { ANCIENT_HULK, HULK_NODE_SPACING_M } from '../art/geometry/ships/index.js';
import { auditParts } from '../art/geometry/ships/common.js';
import { SCALE } from '../art/materials/index.js';

/**
 * The graveyard's key comes from `sunDir = (-0.905, 0.145, 0.400)` — azimuth -66
 * degrees, elevation 8. Every camera here is placed so that key rakes ACROSS the
 * object rather than down the lens: `hero` sits 98 degrees off the sun, which is
 * the angle that puts a hard edge on every vane and drops the far side into the
 * near-black this POI is authored for.
 */
const VIEWS = {
  hero: { distance: 4900, pitch: 0.26, yaw: -2.15, target: [0, 0, 60], fov: 34, ref: true },
  breach: { distance: 1150, pitch: 0.18, yaw: -1.45, target: [0, 20, 250], fov: 42 },
  axis: { distance: 3600, pitch: 0.09, yaw: 0.12, target: [0, 0, 500], fov: 32 },
  crown: { distance: 2000, pitch: 0.22, yaw: -1.55, target: [0, 0, 1380], fov: 40 },
  ring: { distance: 2600, pitch: 0.48, yaw: -2.20, target: [0, 0, -380], fov: 38 },
};

export default {
  name: 'Ancient hulk',
  camera: { distance: 6200, pitch: 0.20, yaw: 2.05, target: new THREE.Vector3(0, 0, 120) },

  async setup(ctx) {
    const { scene, far, world, renderer, pose, camera } = ctx;
    const seedOpts = new URLSearchParams((ctx.params.get('seed') ?? '').split('#')[1] ?? '');
    const params = { get: (k) => ctx.params.get(k) ?? seedOpts.get(k) };

    const silhouette = params.get('sil') === '1';
    const viewName = params.get('view') ?? 'hero';
    const view = VIEWS[viewName] ?? VIEWS.hero;
    const lodWant = Math.max(0, Math.min(2, Number(params.get('lod') ?? 0) | 0));

    // Graveyard lighting, its debris field, its sick green nebula fill, and the
    // 1400 m scale reference - parked well clear of the hulk so the size
    // relationship is the thing the frame is about.
    // The 1400 m reference sits a third again further out than the hulk and off to
    // starboard. Closer than the hulk and it wins the frame; level with it and the
    // two compete; further out and slightly below, it is unarguably a whole cruiser
    // and unarguably a third of the length of the thing behind it.
    const { registry, poi, ref } = await setupPOIProbe(ctx, 'graveyard', {
      yaw: -1.2,
      position: new THREE.Vector3(0, 0, 0),   // repositioned from the camera below
      extraShips: 0,
    });

    /**
     * KEY BOOST, and it is a probe-local decision, not a change to the POI.
     *
     * The graveyard palette's key is 5.5, authored for frigate-sized wreckage seen
     * from a few hundred metres. A 3.4 km object of desaturated bronze at 0.875
     * wear, four kilometres out, lands two stops under that and the frame reads as
     * an empty nebula. The scale factor is here so the probe can show the hull;
     * the POI itself is untouched.
     *
     * REPORTED UPSTREAM (lighting stream): a graveyard hero POI probably wants
     * either a higher key or a dedicated derelict fill, because this object is the
     * reason to go there.
     */
    // Key UP, ambient DOWN. Raising both is how a frame ends up as mid-grey mush:
    // the environment lifts the shadow side by exactly as much as the key lifts
    // the lit one and the value range never widens.
    const keyScale = Number(params.get('keyScale') ?? 3.6);
    if (poi?.rig?.key) poi.rig.key.intensity *= keyScale;
    scene.environmentIntensity = (scene.environmentIntensity ?? 1) * 1.05;
    renderer.renderer.toneMappingExposure = 1.10;
    // The graveyard's own wreckage and rock are authored to be flown through, and
    // at hero framing their chunks land at the same apparent size as the hulk's
    // vanes - so the frame reads as rubble with something behind it. Off by
    // default here; `field=1` puts the location back around the object.
    if (params.get('field') !== '1') {
      if (poi?.debris?.object) poi.debris.object.visible = false;
      if (poi?.asteroids?.object) poi.asteroids.object.visible = false;
    }

    const hulk = ANCIENT_HULK.build({
      rng: world.rng.fork('ancient-hulk'),
      materials: registry,
      palette: registry.palette,
      faction: 'derelict',
      lod: 0,
    });
    // It has been turning for a very long time and nothing has stopped it.
    hulk.rotation.set(0.06, 0.0, 0.42);
    scene.add(hulk);
    ctx.hulk = hulk;

    hulk.traverse((o) => {
      if (!o.isLOD) return;
      o.autoUpdate = false;
      o.levels.forEach((l, i) => { l.object.visible = i === Math.min(lodWant, o.levels.length - 1); });
    });
    if (params.get('debris') === '0' && hulk.userData.debris) hulk.userData.debris.visible = false;

    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    Object.assign(pose, { distance: Number(params.get('dist') ?? view.distance), pitch: view.pitch, yaw: view.yaw });
    pose.target.set(...view.target);
    ctx.spin = params.get('spin') === '1';

    /**
     * Place the 1400 m reference FROM THE CAMERA, not in world space.
     *
     * Hand-picking a world position works for exactly one camera and silently
     * puts the reference behind the hulk the moment the view moves - which is
     * what happened twice. Derived from the view basis it lands in clear sky at a
     * known depth every time: 7.2 km out (so it is honestly further away than the
     * hulk) and 14 degrees off axis.
     */
    ctx.applyPose();
    if (view.ref) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      ref.position.copy(camera.position)
        .addScaledVector(fwd, 7200)
        .addScaledVector(right, 1750)
        .addScaledVector(up, -900);
      ref.rotation.y = -1.2;
    } else {
      ref.visible = false;
    }

    if (silhouette) {
      const black = registry.get('emissive', { faction: 'player', color: NEUTRAL.void, intensity: 0 });
      hulk.traverse((o) => {
        if (!o.isMesh) return;
        if (o.name?.includes('runningLights') || o.name?.includes('emissive') || o.isInstancedMesh) {
          o.visible = false; return;
        }
        o.material = black;
        o.castShadow = false; o.receiveShadow = false;
      });
      const white = new THREE.Color()
        .setHex(getFactionPalette('player').emissiveHot, THREE.SRGBColorSpace).multiplyScalar(4.0);
      far.background = white;
      far.children.forEach((c) => { c.visible = false; });
      scene.children.forEach((c) => { if (c !== hulk && !c.isLight) c.visible = false; });
      scene.background = null;
      scene.environment = null;
      scene.fog = null;
      renderer.post.bloom.enabled = false;
      renderer.post.gtao.enabled = false;
      renderer.post.godrays.enabled = false;
      const gu = renderer.post.grade.uniforms;
      gu.vignette.value = 0; gu.grain.value = 0; gu.aberration.value = 0; gu.saturation.value = 1;
      camera.fov = 12;
      camera.updateProjectionMatrix();
      Object.assign(pose, { distance: 18000, pitch: 0.0, yaw: Math.PI * 0.5 });
      pose.target.set(0, 0, 0);
    }

    // ---- report -----------------------------------------------------------
    const rows = [];
    for (let lod = 0; lod < 3; lod++) {
      const a = auditParts(ANCIENT_HULK.partsFor, world.rng.fork('hulk-audit'), lod);
      const b = a.bounds;
      rows.push({
        lod, tris: a.triangles, draws: a.draws,
        length: +(b.max.z - b.min.z).toFixed(0),
        span: +Math.max(b.max.x - b.min.x, b.max.y - b.min.y).toFixed(0),
      });
    }
    console.table(rows);
    const debrisCount = hulk.userData.debris?.count ?? 0;
    const el = document.getElementById('label');
    if (el) {
      el.style.whiteSpace = 'pre';
      el.textContent = [
        `ANCIENT HULK — ${rows[0].length} m long, ${rows[0].span} m across`,
        `LOD0 ${rows[0].tris}/${ANCIENT_HULK.triBudget} tris / ${rows[0].draws} draws   LOD1 ${rows[1].tris}   LOD2 ${rows[2].tris}`,
        `spine nodes every ${HULK_NODE_SPACING_M} m   vane seam lamps every ${SCALE.runningLightSpacingM} m`,
        `debris ${debrisCount} instances (1 draw, not counted against the hull budget)`,
        `view=${viewName} lod=${lodWant}${silhouette ? '  SILHOUETTE' : ''}   reference: 1400 m cruiser`,
      ].join('\n');
    }
    console.log('[probe:derelict] materials outside registry:', registry.auditScene(scene));
    console.log('[probe:derelict] off-palette colours:', registry.paletteAudit().foreign);
  },

  update(dt, ctx) {
    if (ctx.spin) ctx.pose.yaw += dt * 0.05;
  },
};
