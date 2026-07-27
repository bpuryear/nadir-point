/**
 * Shared scaffolding for the three POI probes. Not a probe itself — `probe.js`
 * only imports a module when it is asked for by name, so a helper can live here.
 *
 * The scale reference is a plain 1400 x 180 x 260 m box on the combat plane with
 * running lights at the mandatory 6 m spacing along its flanks. It is deliberately
 * NOT a nice ship: this probe is a test of the ENVIRONMENT, and a detailed hull
 * would let a flat backdrop hide behind it. If the box does not read as 1.4 km
 * against the sky, the sky is wrong.
 */

import * as THREE from 'three';
import { createMaterialRegistry, SCALE } from '../art/materials/index.js';
import { getPOI } from '../core/contracts.js';
import { NEUTRAL } from '../art/palette.js';
import '../world/lighting/pois.js';   // side effect: registers the three POIs

export const CRUISER = { length: 1400, height: 180, beam: 260 };

/** Box/triplanar projection in metres — the registry authors its maps that way. */
export function metreUV(geometry) {
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

/**
 * The scale reference. Forward is +Z, plane-locked to y = 0, running lights down
 * both flanks and along the spine at RUNNING_LIGHT_SPACING_M.
 */
export function buildScaleReference(registry, { yaw = 0, position = new THREE.Vector3() } = {}) {
  const root = new THREE.Group();
  root.name = 'scale-reference-cruiser';
  root.position.copy(position);
  root.rotation.y = yaw;

  const hullMat = registry.get('hull', { faction: 'player', wear: 0.45, tier: 2 });
  const body = new THREE.Mesh(
    metreUV(new THREE.BoxGeometry(CRUISER.beam, CRUISER.height, CRUISER.length)),
    hullMat,
  );
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // Two secondary masses so the silhouette is not a single rectangle — the probe
  // still has to be able to tell you which way the thing is pointing.
  const darkMat = registry.get('hullDark', { faction: 'player', wear: 0.55 });
  const dorsal = new THREE.Mesh(
    metreUV(new THREE.BoxGeometry(CRUISER.beam * 0.62, CRUISER.height * 0.8, CRUISER.length * 0.30)),
    darkMat,
  );
  dorsal.position.set(0, CRUISER.height * 0.78, -CRUISER.length * 0.22);
  dorsal.castShadow = true;
  dorsal.receiveShadow = true;
  root.add(dorsal);

  const prow = new THREE.Mesh(
    metreUV(new THREE.BoxGeometry(CRUISER.beam * 0.55, CRUISER.height * 0.52, CRUISER.length * 0.24)),
    darkMat,
  );
  prow.position.set(0, -CRUISER.height * 0.16, CRUISER.length * 0.56);
  prow.castShadow = true;
  prow.receiveShadow = true;
  root.add(prow);

  // --- running lights: the mandatory constant-spacing scale cue -------------
  const lightMat = registry.get('runningLights', { faction: 'player', intensity: 2.4 });
  const stripLen = CRUISER.length * 0.94;
  const makeStrip = () => {
    const g = new THREE.PlaneGeometry(stripLen, 7);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * stripLen); // U in metres
    uv.needsUpdate = true;
    return g;
  };
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(makeStrip(), lightMat);
    strip.rotation.y = side * Math.PI * 0.5;
    strip.position.set(side * (CRUISER.beam * 0.5 + 0.7), CRUISER.height * 0.22, 0);
    strip.renderOrder = 4;
    root.add(strip);
  }
  root.userData.lightSpacingM = SCALE.runningLightSpacingM;
  return root;
}

/**
 * Boot a POI probe: registry, POI build, scale reference, and a per-frame refresh of
 * the celestial view-dependent uniforms.
 */
export async function setupPOIProbe(ctx, poiId, { yaw = 0.22, position = new THREE.Vector3(0, 0, 0), extraShips = 0 } = {}) {
  const { world, renderer, scene, far } = ctx;

  const registry = createMaterialRegistry({
    renderer: renderer.renderer,
    rng: world.rng.fork(`probe:${poiId}`),
    poi: poiId,
  });
  world.systems.materials = registry;
  ctx.registry = registry;

  scene.background = null;
  far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);

  const def = getPOI(poiId);
  if (!def) throw new Error(`[probe] POI "${poiId}" is not registered`);

  const buildCtx = {
    rng: world.rng.fork(`poi:${poiId}`),
    materials: registry,
    palette: registry.palette,
    faction: 'player',
    lod: 0,
  };
  const poi = def.build(buildCtx, world);
  ctx.poi = poi;

  const ref = buildScaleReference(registry, { yaw, position });
  scene.add(ref);
  ctx.scaleReference = ref;

  // A couple more hulls at distance: two identical boxes at different ranges are
  // the cheapest possible proof that the depth in the frame is real.
  for (let i = 0; i < extraShips; i++) {
    const r = world.rng.fork(`probe-extra:${poiId}:${i}`);
    const extra = buildScaleReference(registry, {
      yaw: r.range(-Math.PI, Math.PI),
      position: new THREE.Vector3(
        r.range(-9000, 9000),
        r.range(-900, 1400),
        r.range(-11000, 5000),
      ),
    });
    extra.scale.setScalar(r.range(0.55, 1.05));
    scene.add(extra);
  }

  ctx.world.engine.addRender({
    name: 'poi-probe-celestials',
    order: 60,
    update() { poi.sky.update(renderer.farCamera); },
  });

  console.log(`[probe:${poiId}] sun`, poi.sunDir.toArray().map((n) => n.toFixed(3)).join(', '),
    '| asteroids', poi.asteroids?.count ?? 0, '| debris', poi.debris?.count ?? 0,
    '| env', poi.rig.envMap ? 'PMREM' : 'none');

  return { registry, poi, ref };
}
