import * as THREE from 'three';
import { Engine } from './core/loop.js';
import { World } from './core/world.js';
import { Renderer } from './render/renderer.js';
import { WORLD_SEED } from './core/rng.js';
import { bootGame } from './game.js';

/**
 * Bootstrap. Keep this thin - it wires the three long-lived objects together and
 * hands off to game.js, which owns what actually gets built.
 */
async function main() {
  const canvas = document.getElementById('viewport');
  const params = new URLSearchParams(location.search);

  const engine = new Engine();
  const renderer = new Renderer(canvas, {
    quality: params.get('quality') ?? 'high',
    preserveDrawingBuffer: params.has('capture'),
  });
  renderer.observeCanvasSize();

  const world = new World({
    engine,
    renderer,
    seed: params.get('seed') ?? WORLD_SEED,
  });

  // Render is the last thing that happens each frame, always.
  engine.addRender({
    name: 'present',
    order: 1000,
    update: () => renderer.render(),
  });

  await bootGame(world, params);

  engine.start();

  // Handles for the capture, benchmark and smoke tooling. Also handy in the console.
  window.__NADIR = {
    THREE,
    engine,
    renderer,
    world,
    version: '0.1.0',
    ready: true,
    stats: () => ({ ...engine.stats, ...renderer.frameStats }),
  };

  document.getElementById('boot')?.classList.add('hidden');
}

main().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.textContent = `FAILED: ${err.message}`;
    boot.style.color = '#ff6b6b';
    boot.style.letterSpacing = '0.1em';
  }
  window.__NADIR = { ready: false, error: String(err && err.stack || err) };
});
