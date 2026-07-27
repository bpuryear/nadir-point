import * as THREE from 'three';
import { Engine } from './core/loop.js';
import { World } from './core/world.js';
import { Renderer } from './render/renderer.js';

/**
 * Isolation harness.
 *
 * Every stream can render and screenshot its own work without waiting for the rest
 * of the game to exist:
 *
 *   /probe.html?p=cruiser
 *
 * loads `src/probes/cruiser.js`, which default-exports:
 *
 *   export default {
 *     name: 'Cruiser hull',
 *     async setup(ctx) { ... },        // ctx: { world, scene, far, camera, renderer, engine, THREE, rng, params }
 *     update(dt, ctx) { ... },         // optional, per frame
 *     camera: { distance, pitch, yaw, target },   // optional initial pose
 *   }
 *
 * Probes are how the visual review pass looks at one thing at a time. Every stream
 * is expected to ship at least one.
 */
const probeModules = import.meta.glob('./probes/*.js');

async function main() {
  const params = new URLSearchParams(location.search);
  const name = params.get('p') || params.get('probe') || 'index';
  const canvas = document.getElementById('viewport');

  const engine = new Engine();
  const renderer = new Renderer(canvas, {
    quality: params.get('quality') ?? 'high',
    preserveDrawingBuffer: true,
  });
  renderer.observeCanvasSize();

  const world = new World({ engine, renderer, seed: params.get('seed') ?? `probe:${name}` });

  engine.addRender({ name: 'present', order: 1000, update: () => renderer.render() });

  const key = `./probes/${name}.js`;
  if (!probeModules[key]) {
    throw new Error(`no probe "${name}". available: ${Object.keys(probeModules)
      .map((k) => k.replace('./probes/', '').replace('.js', '')).join(', ') || '(none yet)'}`);
  }

  const probe = (await probeModules[key]()).default;
  document.getElementById('label').textContent = probe.name ?? name;

  const ctx = {
    world, engine, renderer,
    scene: world.scene, far: world.far, camera: world.camera,
    THREE, rng: world.rng, params,
  };

  // Default pose. A probe can override in setup or via its `camera` block.
  const pose = { distance: 3000, pitch: 0.42, yaw: 0.7, target: new THREE.Vector3(0, 0, 0), ...(probe.camera ?? {}) };
  ctx.pose = pose;
  const applyPose = () => {
    const { distance: d, pitch: p, yaw: y, target: t } = pose;
    world.camera.position.set(
      t.x + Math.cos(p) * Math.sin(y) * d,
      t.y + Math.sin(p) * d,
      t.z + Math.cos(p) * Math.cos(y) * d,
    );
    world.camera.lookAt(t);
  };
  ctx.applyPose = applyPose;

  await probe.setup?.(ctx);
  applyPose();

  if (probe.update) {
    engine.addRender({ name: 'probe', order: 50, update: (dt) => { probe.update(dt, ctx); applyPose(); } });
  }

  engine.start();

  window.__NADIR = {
    THREE, engine, renderer, world, probe, ctx, pose, applyPose,
    ready: true,
    isProbe: true,
    stats: () => ({ ...engine.stats, ...renderer.frameStats }),
    /** Reposition the camera from the capture tool without reloading. */
    setPose(p) { Object.assign(pose, p); if (p.target) pose.target.copy(p.target); applyPose(); },
  };
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('err');
  el.style.display = 'grid';
  el.textContent = String(err && err.stack || err);
  window.__NADIR = { ready: false, isProbe: true, error: String(err && err.stack || err) };
});
