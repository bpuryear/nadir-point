/**
 * VFX INSTALLER.
 *
 * One entry point, idempotent, tolerant of a world that has almost nothing in it yet.
 * It is called during boot before there is a player, before any module is registered
 * and possibly before the material registry exists, so every dependency here is read
 * defensively and every subsystem degrades to "draws nothing" rather than throwing.
 *
 * FOUR ENGINE SYSTEMS, and the ordering of them is the whole design:
 *
 *   order   1  (fixed)   vfx-clock    stamps the spawn clock BEFORE any simulation
 *                                     system runs, so a muzzle flash emitted by combat
 *                                     at order 40 is born at this step's sim time and
 *                                     not at the previous frame's.
 *   order  92  (fixed)   vfx-sim      explosion sequencing, wreckage integration,
 *                                     sustained venting, cutting spatter. On the fixed
 *                                     step so all of it pauses and time-scales with
 *                                     the simulation.
 *   order 202  (render)  vfx-sample   rebuild the tracer, beam, plume and shield
 *                                     buffers from live state, every frame, so they
 *                                     stay smooth between sim steps.
 *   order 208  (render)  vfx-commit   advance time uniforms and flush dirty ranges.
 *
 * TIME. Everything animates from `engine.simTime + alpha * SIM.dt`. That single choice
 * gives correct behaviour at 0x, 1x and 4x for free, and it is why nothing in this
 * directory reads the render dt except to decide nothing at all.
 */

import * as THREE from 'three';
import { SIM } from '../core/units.js';
import { VFX_ORDER } from './common.js';
import { ParticleSystem } from './particles.js';
import { RingSystem } from './rings.js';
import { WeaponVFX } from './weapons.js';
import { EngineVFX } from './engines.js';
import { ShieldVFX } from './shields.js';
import { ExplosionVFX } from './explosions.js';
import { SalvageVFX } from './salvage.js';
import { DamageVFX } from './damage.js';

export { ParticleSystem, PKIND } from './particles.js';
export { RingSystem } from './rings.js';
export { VFX_ORDER, FIRE, factionVFX } from './common.js';

/**
 * @param {import('../core/world.js').World} world
 * @param {Object} [opts]
 * @param {number} [opts.particleCapacity]
 * @returns {Object} the VFX facade, also parked on `world.systems.vfx`
 */
export function installVFX(world, opts = {}) {
  if (world.systems?.vfx) return world.systems.vfx;

  const rng = world.rng.fork('vfx');
  const materials = world.systems?.materials ?? null;

  const root = new THREE.Group();
  root.name = 'vfx';
  world.scene.add(root);

  const particles = new ParticleSystem({
    capacity: opts.particleCapacity ?? 4096,
    rng: rng.fork('particles'),
  });
  const rings = new RingSystem({ capacity: 96, rng: rng.fork('rings') });

  const weapons = new WeaponVFX(world, particles, rings, {
    rng: rng.fork('weapons'), materials,
  });
  const engines = new EngineVFX(world, { rng: rng.fork('engines') });
  const shields = new ShieldVFX(world, { rng: rng.fork('shields') });
  const explosions = new ExplosionVFX(world, particles, rings, {
    rng: rng.fork('explosions'), materials,
  });
  const salvage = new SalvageVFX(world, {
    particles, rings, weapons, rng: rng.fork('salvage'),
  });
  const damage = new DamageVFX(world, {
    particles, rings, materials, rng: rng.fork('damage'),
  });

  // Draw order within the additive layer: plumes and shields sit under the hot
  // stuff, beams and tracers on top, particles on top of everything.
  root.add(engines.mesh);
  root.add(shields.mesh);
  root.add(explosions.group);
  root.add(damage.group);
  root.add(weapons.group);
  root.add(rings.mesh);
  root.add(particles.mesh);

  const vfx = {
    root, rng,
    particles, rings, weapons, engines, shields, explosions, salvage, damage,

    /** Sim time used by every shader this frame. */
    time: 0,

    /** Convenience for other streams and for the probe. */
    detonate(...args) { return explosions.detonate(...args); },
    shieldImpact(ship, point, amount) { shields.onImpact({ ship, point, amount }); },
    scorch(ship, point, size) { damage.addScorch(ship, point, size); },
    vent(ship, lx, ly, lz, scale) { damage.addVent(ship, lx, ly, lz, scale); },

    stats() {
      return {
        beams: weapons.beams.count,
        tracers: weapons.tracers.count,
        plumes: engines.count,
        wreckage: explosions.liveWreckage,
        decals: damage.decals?.count ?? 0,
      };
    },

    dispose() {
      weapons.dispose(); engines.dispose(); shields.dispose();
      explosions.dispose(); salvage.dispose(); damage.dispose();
      particles.dispose(); rings.dispose();
      root.parent?.remove(root);
      if (world.systems.vfx === vfx) delete world.systems.vfx;
    },
  };

  world.register('vfx', vfx);

  const engine = world.engine;

  // 1. Spawn clock. Must run before anything that can emit an event this step.
  engine.add({
    name: 'vfx-clock',
    order: 1,
    fixedUpdate: (dt, eng) => {
      const t = eng.simTime;
      particles._time = t;
      rings._time = t;
      shields._time = t;
    },
  });

  // 2. Simulation-rate VFX.
  engine.add({
    name: 'vfx-sim',
    order: VFX_ORDER.sim,
    fixedUpdate: (dt) => {
      explosions.fixedUpdate(dt);
      damage.fixedUpdate(dt);
      salvage.fixedUpdate(dt);
      weapons.emitMissileTrails(world.systems?.combat, dt);
    },
  });

  // 3. Read live state into GPU buffers.
  engine.addRender({
    name: 'vfx-sample',
    order: VFX_ORDER.sample,
    update: (dt, eng) => {
      const time = eng.simTime + eng.alpha * SIM.dt;
      vfx.time = time;
      weapons.sample(world.systems?.combat, time);
      salvage.sample(world.camera);
      engines.sample(time);
      shields.update(time);
      damage.update();
    },
  });

  // 4. Flush.
  engine.addRender({
    name: 'vfx-commit',
    order: VFX_ORDER.upload,
    update: () => {
      weapons.commitBeams(vfx.time);
      particles.update(vfx.time);
      rings.update(vfx.time);
    },
  });

  return vfx;
}

export default installVFX;
