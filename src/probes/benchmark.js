import * as THREE from 'three';
import { COMBAT_PLANE_Y } from '../core/units.js';
import { Ship } from '../sim/ship.js';
import { CombatSystem } from '../sim/combat.js';
import { allShipClasses } from '../core/contracts.js';
import { registerPlayerCruiser, applyClassHandling } from '../camera/feel.js';

/**
 * THE COMMITTED BENCHMARK SCENE.
 *
 * Contents are fixed by the brief and must not be quietly reduced to make a number
 * look better: 200+ debris objects, 12 combat ships, 1 capital ship, full post chain.
 * `tools/bench.mjs` runs this and enforces the draw-call and triangle budgets from
 * core/units.js#BUDGET against it.
 *
 * Ships are actively fighting rather than parked, because idle ships understate the
 * cost: no projectiles in flight, no beams, no engine plumes at throttle, no impact
 * VFX. A benchmark that measures the cheapest possible frame is not a benchmark.
 */
export default {
  name: 'Benchmark scene',
  camera: { distance: 7200, pitch: 0.34, yaw: 0.85, target: new THREE.Vector3(0, 0, 0) },

  async setup(ctx) {
    const { world, engine, renderer } = ctx;
    const rng = world.rng.fork('benchmark');
    const poiId = 'giant-orbit';

    // --- materials, lighting, celestials, fields (the same path game.js uses) ---
    const matMod = await import('../art/materials/index.js');
    const materials = matMod.createMaterialRegistry({
      renderer: renderer.renderer, rng: world.rng.fork('materials'), poi: poiId,
    });
    world.register('materials', materials);
    if (materials.palette) world.register('palette', materials.palette);

    const bctx = () => ({
      rng: world.rng.fork('build'), materials,
      palette: materials.palette, faction: 'player', lod: 0,
    });

    const lightMod = await import('../world/lighting/poi.js');
    const lighting = lightMod.buildPOILighting(poiId, bctx(), world);
    world.register('lighting', lighting);
    if (lighting?.keyProxy) renderer.post.setKeyLight(lighting.keyProxy, lighting.keyColor ?? null);

    const celMod = await import('../world/celestials/index.js');
    celMod.installCelestials?.(world, poiId, bctx());

    const fieldMod = await import('../world/fields/index.js');
    fieldMod.installFields?.(world, poiId, bctx());

    await import('../art/geometry/modules/index.js');
    await import('../art/geometry/ships/index.js');

    // --- 1 capital ship: the player cruiser, fully fitted ---
    const cruiserMod = await import('../art/geometry/cruiser.js');
    const hullResult = cruiserMod.buildCruiser(bctx());
    world.hullResult = hullResult;

    // The registered class, not a literal. This file used to carry its own
    // 62000/140/14/0.22 fallback while probes/ui.js and probes/worldsim.js carried
    // 620000/180/6.0/0.085 — so the benchmark was measuring a different ship from the
    // UI probe, and both from the game. There is one class now and it is this one.
    const playerClass = registerPlayerCruiser({
      root: hullResult.root, subsystems: hullResult.subsystems ?? null,
    });
    const player = new Ship({
      classDef: playerClass, world, faction: 'player', isPlayer: true,
      root: hullResult.root, position: new THREE.Vector3(0, COMBAT_PLANE_Y, 0),
    });
    applyClassHandling(player.body, playerClass);
    world.player = player;
    world.addShip(player);

    // Fit every hardpoint so the benchmark measures a late-game silhouette, which is
    // the most expensive one the player can actually produce.
    try {
      const hpMod = await import('../art/geometry/hardpoints.js');
      const { RefitSystem } = await import('../sim/refit.js');
      const refit = new RefitSystem(world, hpMod);
      world.register('refit', refit);
      const { modulesForHardpoint, HARDPOINTS } = await import('../core/contracts.js');
      for (const hp of HARDPOINTS) {
        const choices = modulesForHardpoint(hp === 'starboard' ? 'port' : hp);
        if (!choices.length) continue;
        const pick = choices[choices.length - 1];
        world.inventory.push({ moduleId: pick.id, condition: 1, uid: `bench:${hp}` });
        refit.install(hp, `bench:${hp}`);
      }
    } catch (err) {
      console.warn('[benchmark] could not fit modules:', err.message);
    }

    // --- 12 combat ships, two factions, actively engaged ---
    const combat = new CombatSystem(world);
    world.register('combat', combat);
    engine.add(combat);

    const classes = allShipClasses().filter((c) => c.faction !== 'player' && c.role !== 'fighter');
    const combatants = [];
    for (let i = 0; i < 12; i++) {
      const def = classes.length ? classes[i % classes.length] : null;
      if (!def) break;
      const angle = (i / 12) * Math.PI * 2;
      const dist = 2600 + (i % 3) * 900;
      const ship = new Ship({
        classDef: def, world, faction: def.faction,
        position: new THREE.Vector3(Math.sin(angle) * dist, COMBAT_PLANE_Y, Math.cos(angle) * dist),
        heading: angle + Math.PI,
        root: def.build ? def.build({ rng: rng.fork(`bench${i}`), materials, palette: materials.palette, faction: def.faction, lod: 0 }) : undefined,
      });
      world.addShip(ship);
      combatants.push(ship);
    }
    // Everyone shoots someone hostile, so projectiles and beams are live.
    for (const s of combatants) {
      const foe = combatants.find((o) => o !== s && world.areHostile(s.faction, o.faction));
      if (foe) s.orderAttack(foe, [...foe.subsystems.keys()][0] ?? null);
      s.body.throttle = 0.7;
    }
    if (combatants[0]) player.orderAttack(combatants[0]);

    engine.add({
      name: 'bench-ships', order: 60,
      fixedUpdate: (dt) => { for (const s of world.ships) s.fixedUpdate(dt); },
    });
    engine.addRender({
      name: 'bench-transforms', order: 90,
      update: () => { for (const s of world.ships) s.syncTransform(); },
    });

    // --- VFX, so the post chain and particle systems are actually exercised ---
    try {
      const vfxMod = await import('../vfx/index.js');
      vfxMod.installVFX?.(world);
    } catch (err) {
      console.warn('[benchmark] vfx unavailable:', err.message);
    }

    // --- counts for the report ---
    let instancedObjects = 0;
    let meshes = 0;
    world.scene.traverse((o) => {
      if (o.isInstancedMesh) instancedObjects += o.count;
      else if (o.isMesh) meshes++;
    });
    ctx.counts = {
      capitalShips: 1,
      combatShips: combatants.length,
      instancedObjects,
      distinctMeshes: meshes,
      totalShips: world.ships.length,
      postChain: renderer.post.quality,
    };
    window.__NADIR_BENCH_COUNTS = ctx.counts;

    console.info('[benchmark]', JSON.stringify(ctx.counts));
  },

  update(dt, ctx) {
    // Slow orbit so the frame is not a still life and culling is exercised.
    ctx.pose.yaw += dt * 0.05;
  },
};
