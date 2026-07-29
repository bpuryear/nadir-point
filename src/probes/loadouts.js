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
 *
 * THE NUMBER IS THE SAME ON EVERY SHEET, AND THAT IS WORTH KNOWING BEFORE YOU READ
 * ONE. The signature is three channels of SHIP-SPACE outline per z-bin - half-beam,
 * top and bottom - taken in the hull's own frame by `getSilhouetteSignature` and by
 * `fittedSignatures` below. It does not depend on `view`, which only moves the
 * camera and the row spread. So `loadouts.png` and `loadouts-top.png` carry
 * identical divergence captions and differ only in the PICTURE, and the top sheet is
 * a plan-view eyeball check rather than a second measurement.
 *
 * This cost a pass. `loadouts-top.png` sat in the tree printing "WORST PAIR: MEAN
 * 26.4 (TARGET >= 45) FAIL" long after the side sheet printed PASS, and it was read
 * as "the criterion passes in profile and fails in plan" - a plausible, specific and
 * completely wrong diagnosis that sends someone off to widen modules in x. The two
 * sheets were simply rendered from different code states, months of edits apart. If
 * the two sheets in front of you disagree, ONE OF THEM IS STALE; re-render both
 * before believing either.
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

/**
 * Row layout. `axis` is the world axis the three hulls are spread along and `sign`
 * makes A land at the TOP OF THE FRAME in every view.
 *
 * That sign is not cosmetic. The probe's camera is built by probe.js as
 * `pos = target + (cos p sin y, sin p, cos p cos y) d`, so in the side view
 * (pitch ~0) screen-up is world +Y, while in the top view (pitch ~PI/2) screen-up is
 * world -X. Spreading both views along a POSITIVE offset therefore prints the rows
 * in opposite orders, which is exactly what happened: the side probe showed A/B/C
 * top to bottom and the top probe showed C/B/A, so the jump ring described for C
 * appeared in row 1 of one image and row 3 of the other. An audit whose rows do not
 * match its own legend cannot be read, and its divergence figures cannot be trusted.
 *
 * Rows are also labelled INLINE now (see `rowLabels`), projected from each hull's
 * own world position, so the picture carries its own key and this class of bug
 * cannot come back silently.
 */
/**
 * ROW SPACING IS DERIVED FROM THE ENVELOPE, NOT GUESSED.
 *
 * The gaps used to be 660 m in the side view, which was comfortable when a fitted
 * hull was 614 m tall. The ventral and engine modules are now cantilevered far
 * enough to satisfy the divergence criterion (ship-language.md §6 M2), and a fitted
 * hull spans roughly 950 m vertically and 850 m across, so at the old spacing the
 * three rows overlapped and the probe's own picture became unreadable - which would
 * be the same class of defect as D15, an audit you cannot read.
 *
 * These are the measured envelope plus a 200 m margin. If a module grows past them
 * the rows will touch again and that is the signal to re-measure, not to nudge.
 */
const VIEWS = {
  // Bow points screen-left in the side view; that is the Homeworld ship-portrait
  // convention and it is worth matching because it is what the eye is trained on.
  side: { yaw: Math.PI * 0.5, pitch: 0.002, dist: 4400, axis: 'y', sign: 1, gap: 1180, target: [0, -110, 0] },
  top: { yaw: Math.PI * 0.5, pitch: 1.5, dist: 4600, axis: 'x', sign: -1, gap: 1120, target: [0, 0, 0] },
  quarter: { yaw: Math.PI * 0.62, pitch: 0.30, dist: 4600, axis: 'y', sign: 1, gap: 1240, target: [0, -110, 0] },
};

/**
 * Bin every visible mesh under each holder into a signature, over ONE z range
 * shared by all of them - the union of their fitted envelopes. A shared axis is
 * the whole point: three signatures binned over three different ranges are not
 * comparable bin for bin, which is the bug this exists to route around.
 */
function fittedSignatures(holders, bins = 32) {
  for (const h of holders) h.updateMatrixWorld(true);
  const boxes = holders.map((h) => new THREE.Box3().setFromObject(h));
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < holders.length; i++) {
    zMin = Math.min(zMin, boxes[i].min.z - holders[i].position.z);
    zMax = Math.max(zMax, boxes[i].max.z - holders[i].position.z);
  }
  const span = Math.max(1e-6, zMax - zMin);
  const v = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const local = new THREE.Matrix4();

  return holders.map((holder) => {
    holder.updateMatrixWorld(true);
    inv.copy(holder.matrixWorld).invert();
    const out = [];
    for (let i = 0; i < bins; i++) out.push({ halfWidth: 0, top: -Infinity, bottom: Infinity, count: 0 });
    holder.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
      const pos = o.geometry?.getAttribute('position');
      if (!pos) return;
      local.multiplyMatrices(inv, o.matrixWorld);
      const step = pos.count > 3000 ? 3 : 1;
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(local);
        let k = Math.floor(((v.z - zMin) / span) * bins);
        if (k < 0) k = 0; else if (k >= bins) k = bins - 1;
        const bin = out[k];
        const ax = Math.abs(v.x);
        if (ax > bin.halfWidth) bin.halfWidth = ax;
        if (v.y > bin.top) bin.top = v.y;
        if (v.y < bin.bottom) bin.bottom = v.y;
        bin.count++;
      }
    });
    for (const bin of out) if (!bin.count) { bin.top = 0; bin.bottom = 0; }
    return { bins: out };
  });
}

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
    const holders = [];
    for (let i = 0; i < LOADOUTS.length; i++) {
      const L = LOADOUTS[i];
      const holder = new THREE.Group();
      const off = ((LOADOUTS.length - 1) / 2 - i) * view.gap * view.sign;
      if (view.axis === 'y') holder.position.set(0, off, 0);
      else holder.position.set(off, 0, 0);
      scene.add(holder);
      holders.push({ L, holder });

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
      // THE FITTED ENVELOPE, measured on the assembled object.
      //
      // `getSilhouetteSignature` reports length/beam/height off `hullResult.bounds`,
      // which is the BARE hull - so all three rows of this sheet printed
      // "1403 x 396 x 614 m" under three visibly different ships, and the row that
      // hangs a 300 m jump ring off the stern claimed the same length as the one
      // that does not. A picture whose own caption contradicts it cannot be used to
      // judge anything (this is D15 again), and the numbers being wrong in the
      // CONSERVATIVE direction does not make them true.
      // updateMatrixWorld FIRST. Modules hang off SOCKETS that carry the mount
      // offset, and Box3.setFromObject does not refresh an ancestor's world
      // matrix - it refreshes local matrices up the chain and world matrices down
      // from the object it was handed. Measure without this and every module is
      // measured as though it were bolted to the origin.
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const size = box.getSize(new THREE.Vector3());
      sigs.push({
        L,
        sig: getSilhouetteSignature(hull),
        fitted: { length: Math.round(size.z), beam: Math.round(size.x), height: Math.round(size.y) },
      });
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
    //
    // MEAN AND MAX, because they fail differently. A low mean says the two builds are
    // the same ship wearing different hats. A low MAX says worse: there is no single
    // place on the outline where the difference is big enough to see at a glance, so
    // even a player who knows what to look for cannot find it. The targets are the
    // ones in docs/design/ship-language.md §6 M2: mean >= 45 m per z-bin, max >= 120 m.
    const diff = (a, b) => {
      let s = 0, n = 0, mx = 0;
      for (let i = 0; i < a.bins.length; i++) {
        const d = [
          Math.abs(a.bins[i].halfWidth - b.bins[i].halfWidth),
          Math.abs(a.bins[i].top - b.bins[i].top),
          Math.abs(a.bins[i].bottom - b.bins[i].bottom),
        ];
        for (const v of d) { s += v; if (v > mx) mx = v; }
        n += 3;
      }
      return { mean: s / n, max: mx };
    };
    const pairs = [
      ['A/B', diff(sigs[0].sig, sigs[1].sig)],
      ['A/C', diff(sigs[0].sig, sigs[2].sig)],
      ['B/C', diff(sigs[1].sig, sigs[2].sig)],
    ];
    const worstMean = Math.min(...pairs.map(([, v]) => v.mean));
    const worstMax = Math.min(...pairs.map(([, v]) => v.max));

    // ---- the same measurement over the FITTED envelope ---------------------
    //
    // `getSilhouetteSignature` bins over the BARE hull's z range, so every module
    // that overhangs the stem or the transom is clamped into the first or last bin.
    // That is not a small correction: the captions above measure loadout A at
    // 1913 m against a 1403 m hull, so five hundred metres - a third of the fitted
    // length, and precisely the cantilever that M3 exists to demand - is scored in
    // two bins out of thirty-two.
    //
    // The criterion is the one the probe already prints and it passes on that
    // metric. This is the same metric taken over the union of the three FITTED
    // envelopes, so overhang is scored where it actually is. It is reported
    // alongside rather than instead: a measurement that only ever moves in the
    // direction its author wants is not a measurement.
    const fit = fittedSignatures(holders.map((h) => h.holder));
    const fitPairs = [
      ['A/B', diff(fit[0], fit[1])],
      ['A/C', diff(fit[0], fit[2])],
      ['B/C', diff(fit[1], fit[2])],
    ];
    const fitMean = Math.min(...fitPairs.map(([, v]) => v.mean));
    const fitMax = Math.min(...fitPairs.map(([, v]) => v.max));

    const el = document.getElementById('label');
    if (el) {
      el.textContent = [
        `LOADOUT SILHOUETTES  view=${viewName}${silhouette ? '  BLACK ON WHITE' : '  LIT'}`,
        `outline divergence per z-bin, metres:  ${pairs.map(([k, v]) => `${k} mean ${v.mean.toFixed(1)} max ${v.max.toFixed(0)}`).join('   ')}`,
        `worst pair: mean ${worstMean.toFixed(1)} (target >= 45)   max ${worstMax.toFixed(0)} (target >= 120)`
          + `   ${worstMean >= 45 && worstMax >= 120 ? 'PASS' : 'FAIL'}`,
        `same measure binned over the FITTED envelope, not the bare hull's z range:`
          + `  worst mean ${fitMean.toFixed(1)}  max ${fitMax.toFixed(0)}`
          + `   ${fitMean >= 45 && fitMax >= 120 ? 'PASS' : 'FAIL'}`,
      ].join('\n');
      el.style.whiteSpace = 'pre';
      el.style.color = silhouette ? '#2a3a44' : '#6f8ea0';
      // Out of the way: the top of the frame belongs to the tallest loadout.
      el.style.top = 'auto';
      el.style.bottom = '10px';
    }

    // ---- inline row labels -------------------------------------------------
    // Each row names itself, projected from the hull's own world position. A legend
    // in the corner is a second source of truth about row order, and a second source
    // of truth is a defect waiting to happen - which is precisely how the top view
    // came to be labelled back to front. These cannot disagree with the picture
    // because they ARE the picture.
    ctx.rowLabels = holders.map(({ L, holder }) => {
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;z-index:11;font:11px/1.4 ui-monospace,Menlo,monospace;'
        + `letter-spacing:.1em;text-transform:uppercase;pointer-events:none;white-space:pre;color:${silhouette ? '#2a3a44' : '#7d97a8'}`;
      const e = sigs.find((x) => x.L === L);
      div.textContent = `${L.name}\nfitted ${e.fitted.length} x ${e.fitted.beam} x ${e.fitted.height} m`
        + `  (bare hull ${e.sig.length} x ${e.sig.beam} x ${e.sig.height})\n${L.blurb}`;
      document.body.appendChild(div);
      return { div, holder };
    });
    for (const { L, sig } of sigs) console.log('[probe:loadouts]', L.id, sig.length, sig.beam, sig.height, sig.hash);
    console.log('[probe:loadouts] divergence', pairs, 'worstMean', worstMean, 'worstMax', worstMax);
    console.log('[probe:loadouts] materials outside registry:', registry.auditScene(scene));
    ctx.sigs = sigs;
  },

  /**
   * Park each row's caption beside its own hull. Runs every frame because the
   * harness applies the camera pose AFTER setup, so a one-shot projection in setup
   * would land against the default pose and be wrong in every captured frame.
   */
  update(dt, ctx) {
    if (!ctx.rowLabels) return;
    const cam = ctx.camera;
    const v = new ctx.THREE.Vector3();
    const h = window.innerHeight;
    for (const { div, holder } of ctx.rowLabels) {
      v.copy(holder.position).project(cam);
      // Left margin, vertically aligned to the row. Overlaying the caption on the
      // hull would put text inside the outline the probe exists to judge.
      div.style.left = '14px';
      div.style.top = `${Math.round((-v.y * 0.5 + 0.5) * h) - 22}px`;
      div.style.display = Math.abs(v.z) > 1 ? 'none' : 'block';
    }
  },
};
