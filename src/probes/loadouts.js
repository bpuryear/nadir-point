/**
 * LOADOUT SILHOUETTE PROBE — the pass/fail test for the whole module library.
 *
 *   node tools/probe.mjs loadouts --out docs/probes/loadouts.png
 *   node tools/probe.mjs loadouts --seed 'l#view=top' --out docs/probes/loadouts-top.png
 *   node tools/probe.mjs loadouts --seed 'l#lit=1'    --out docs/probes/loadouts-lit.png
 *
 * THE CRITERION, stated so it cannot be fudged: three complete loadouts of the SAME
 * hull, rendered as flat black on white with every light, glow and post effect off,
 * must be tellable apart from OUTLINE ALONE. Not "you can see they are different if
 * you look" - a player glancing at a contact at four kilometres has an outline and
 * nothing else, and if two builds of this ship produce the same outline then the
 * modules are decoration and the refit screen is a menu of numbers.
 *
 * Options (URL params, or after a '#' in --seed):
 *   view=side|top|quarter
 *   lit=1     render normally instead of as a silhouette, for a sanity check that
 *             the black shapes belong to real geometry
 *
 * The probe also prints a numeric divergence between the three silhouette
 * signatures (hardpoints.js#getSilhouetteSignature). The picture is the judgement;
 * the number is what stops a later change quietly flattening one of them.
 */

import * as THREE from 'three';
import { createMaterialRegistry } from '../art/materials/index.js';
import { getPOIPalette, getFactionPalette, NEUTRAL } from '../art/palette.js';
import { buildCruiser } from '../art/geometry/cruiser.js';
import { attachModule, getSilhouetteSignature } from '../art/geometry/hardpoints.js';
import { getModule } from '../core/contracts.js';
import '../art/geometry/modules/index.js';

const POI = 'giant-orbit';

/**
 * Three builds a player would actually make. Each one is a different ANSWER to the
 * same ship, and each answer changes a different part of the outline: A grows
 * forward and up, B grows down, C grows up and out.
 */
const LOADOUTS = [
  {
    id: 'sniper',
    name: 'A — STANDOFF',
    blurb: 'lance forward, mast up, rails outboard. Long, thin, top-heavy.',
    fit: {
      bow: 'bow_siege_lance',
      dorsal: 'dorsal_sensor_mast',
      ventral: 'ventral_cargo_expansion',
      port: 'port_gauss_outrigger',
      starboard: 'port_gauss_outrigger',
      engine: 'engine_reactor_uprate',
    },
  },
  {
    id: 'carrier',
    name: 'B — CARRIER',
    blurb: 'hangar deck below, claw forward, nothing tall. Deep-bellied and low.',
    fit: {
      bow: 'bow_mining_array',
      dorsal: 'dorsal_pd_ring',
      ventral: 'ventral_hangar_deck',
      port: 'port_flak_cluster',
      starboard: 'port_flak_cluster',
      engine: 'engine_thruster_upgrade',
    },
  },
  {
    id: 'line',
    name: 'C — LINE',
    blurb: 'ram forward, rail turret up, open dock below, jump ring astern.',
    fit: {
      bow: 'bow_breaching_prow',
      dorsal: 'dorsal_rail_battery',
      ventral: 'ventral_repair_bay',
      port: 'port_broadside_battery',
      starboard: 'port_broadside_battery',
      engine: 'engine_jump_drive',
    },
  },
];

const VIEWS = {
  // Bow points screen-left in the side view; that is the Homeworld ship-portrait
  // convention and it is worth matching because it is what the eye is trained on.
  side: { yaw: Math.PI * 0.5, pitch: 0.002, dist: 2800, axis: 'y', gap: 660, target: [0, -50, 0] },
  top: { yaw: Math.PI * 0.5, pitch: 1.5, dist: 3350, axis: 'x', gap: 830, target: [190, 0, 0] },
  quarter: { yaw: Math.PI * 0.62, pitch: 0.30, dist: 2900, axis: 'y', gap: 800, target: [0, -60, 0] },
};

export default {
  name: 'Loadout silhouettes',
  camera: { distance: 3150, pitch: 0.002, yaw: Math.PI * 0.5, target: new THREE.Vector3(0, 0, 0) },

  async setup(ctx) {
    const { scene, far, world, renderer, pose } = ctx;

    const seedOpts = new URLSearchParams((ctx.params.get('seed') ?? '').split('#')[1] ?? '');
    const params = { get: (k) => ctx.params.get(k) ?? seedOpts.get(k) };

    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('loadout-probe-materials'),
      poi: POI,
    });
    world.systems.materials = registry;

    const poi = getPOIPalette(POI);
    const viewName = VIEWS[params.get('view')] ? params.get('view') : 'side';
    const view = VIEWS[viewName];
    const silhouette = params.get('lit') !== '1';

    // ---- build the three ships --------------------------------------------
    const sigs = [];
    for (let i = 0; i < LOADOUTS.length; i++) {
      const L = LOADOUTS[i];
      const holder = new THREE.Group();
      const off = ((LOADOUTS.length - 1) / 2 - i) * view.gap;
      if (view.axis === 'y') holder.position.set(0, off, 0);
      else holder.position.set(off, 0, 0);
      scene.add(holder);

      const hull = buildCruiser({
        rng: world.rng.fork(`loadout:${L.id}`),
        materials: registry, palette: poi, faction: 'player', lod: 0,
      });
      hull.lod.autoUpdate = false;
      hull.lod.levels.forEach((l, li) => { l.object.visible = li === 0; });
      holder.add(hull.root);

      for (const [hp, id] of Object.entries(L.fit)) {
        const def = getModule(id);
        if (!def) throw new Error(`[probe:loadouts] loadout "${L.id}" wants unknown module "${id}"`);
        attachModule(hull, hp, def, {
          rng: world.rng.fork(`loadout:${L.id}:${hp}`),
          materials: registry, palette: poi, faction: def.faction, lod: 0,
        });
      }
      sigs.push({ L, sig: getSilhouetteSignature(hull) });
    }

    // ---- presentation ------------------------------------------------------
    if (silhouette) {
      // Flat black, still stamped by the registry so the material audit stays clean.
      const black = registry.get('emissive', { faction: 'player', color: NEUTRAL.void, intensity: 0 });
      scene.traverse((o) => {
        if (!o.isMesh) return;
        if (o.isInstancedMesh || o.name?.includes('runningLights')
          || o.userData.isRunningLight || o.userData.isGlow) {
          o.visible = false;   // lamps are not outline
          return;
        }
        o.material = black;
        o.castShadow = false;
        o.receiveShadow = false;
      });
      const white = new THREE.Color()
        .setHex(getFactionPalette('player').emissiveHot, THREE.SRGBColorSpace)
        .multiplyScalar(4.0);           // survives ACES and lands near 1.0
      far.background = white;
      scene.background = null;
      scene.environment = null;
      renderer.post.bloom.enabled = false;
      renderer.post.gtao.enabled = false;
      renderer.post.godrays.enabled = false;
      const gu = renderer.post.grade.uniforms;
      gu.vignette.value = 0;
      gu.grain.value = 0;
      gu.aberration.value = 0;
      gu.saturation.value = 1;
      renderer.renderer.toneMappingExposure = 1.0;
    } else {
      far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
      scene.background = null;
      const key = new THREE.DirectionalLight(
        new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), 6.2,
      );
      key.position.set(-0.5, 0.62, 0.55).normalize().multiplyScalar(8000);
      scene.add(key);
      scene.add(key.target);
      scene.add(new THREE.AmbientLight(new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 0.5));
      registry.applyEnvironment(scene, POI, 0.22);
      renderer.post.godrays.enabled = false;
      renderer.renderer.toneMappingExposure = 0.94;
    }

    Object.assign(pose, { distance: view.dist, pitch: view.pitch, yaw: view.yaw });
    pose.target.set(view.target[0], view.target[1], view.target[2]);

    // ---- divergence --------------------------------------------------------
    // Mean absolute difference per bin of (halfWidth, top, bottom), in metres.
    // Two loadouts that produce the same outline score ~0; anything the eye can
    // separate at a glance scores in the tens of metres.
    const diff = (a, b) => {
      let s = 0, n = 0;
      for (let i = 0; i < a.bins.length; i++) {
        s += Math.abs(a.bins[i].halfWidth - b.bins[i].halfWidth)
          + Math.abs(a.bins[i].top - b.bins[i].top)
          + Math.abs(a.bins[i].bottom - b.bins[i].bottom);
        n += 3;
      }
      return s / n;
    };
    const pairs = [
      ['A/B', diff(sigs[0].sig, sigs[1].sig)],
      ['A/C', diff(sigs[0].sig, sigs[2].sig)],
      ['B/C', diff(sigs[1].sig, sigs[2].sig)],
    ];

    const el = document.getElementById('label');
    if (el) {
      el.textContent = [
        `LOADOUT SILHOUETTES  view=${viewName}${silhouette ? '  BLACK ON WHITE' : '  LIT'}`,
        '',
        ...sigs.map(({ L, sig }) => `${L.name.padEnd(14)} ${String(sig.length).padStart(4)} x `
          + `${String(sig.beam).padStart(3)} x ${String(sig.height).padStart(3)} m   ${L.blurb}`),
        '',
        `outline divergence (mean metres per bin):  ${pairs.map(([k, v]) => `${k} ${v.toFixed(1)}`).join('   ')}`,
      ].join('\n');
      el.style.whiteSpace = 'pre';
      el.style.color = silhouette ? '#2a3a44' : '#6f8ea0';
      // Out of the way: the top of the frame belongs to the tallest loadout.
      el.style.top = 'auto';
      el.style.bottom = '10px';
    }
    for (const { L, sig } of sigs) console.log('[probe:loadouts]', L.id, sig.length, sig.beam, sig.height, sig.hash);
    console.log('[probe:loadouts] divergence', pairs);
    console.log('[probe:loadouts] materials outside registry:', registry.auditScene(scene));
    ctx.sigs = sigs;
  },
};
