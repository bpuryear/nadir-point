import * as THREE from 'three';
import { EV } from './core/events.js';
import { COMBAT_PLANE_Y, HULL_LENGTH } from './core/units.js';
import { Ship } from './sim/ship.js';
import { CombatSystem } from './sim/combat.js';
import { SalvageSystem } from './sim/salvage.js';
import { RefitSystem } from './sim/refit.js';
import { StrikeCraftSystem } from './sim/strikecraft.js';
import { TacticalCamera } from './camera/tactical.js';
import { CinematicCamera } from './camera/cinematic.js';
import { Controls } from './input/controls.js';
import { getShipClass, allShipClasses, registryReport } from './core/contracts.js';

/**
 * Game assembly. This is the single seam every stream plugs into.
 *
 * Streams land independently and at different times, so every optional stream is
 * imported defensively: if it is not there yet, the game still boots and says so in
 * the console rather than dying with a module resolution error. That property is what
 * lets twelve parallel work streams share one runnable build instead of one broken one.
 */

/**
 * Stream entry points, resolved lazily.
 *
 * These are declared through `import.meta.glob` rather than as bare dynamic imports
 * because the bundler resolves a literal `import('./path.js')` at BUILD time, so a
 * stream that has not landed yet fails the build instead of degrading. A glob only
 * maps files that actually exist, and each value is a loader that runs on demand.
 */
const STREAM_MODULES = {
  ...import.meta.glob('./art/materials/index.js'),
  ...import.meta.glob('./art/geometry/*.js'),
  ...import.meta.glob('./art/geometry/*/index.js'),
  ...import.meta.glob('./world/lighting/*.js'),
  ...import.meta.glob('./world/*/index.js'),
  ...import.meta.glob('./world/index.js'),
  ...import.meta.glob('./sim/ai/index.js'),
  ...import.meta.glob('./vfx/index.js'),
  ...import.meta.glob('./ui/index.js'),
  ...import.meta.glob('./audio/index.js'),
};

/** Load a stream that may not exist yet. Returns null instead of throwing. */
async function optional(path, label) {
  const loader = STREAM_MODULES[path];
  if (!loader) {
    console.info(`[game] stream "${label}" not present yet - skipping`);
    return null;
  }
  try {
    return await loader();
  } catch (err) {
    // Missing is expected. Present-but-broken is a defect and must be loud.
    console.error(`[game] stream "${label}" failed to load:`, err);
    return null;
  }
}

export async function bootGame(world, params) {
  const { scene, far, renderer, engine } = world;
  const report = { streams: [], missing: [] };
  const note = (name, ok) => (ok ? report.streams : report.missing).push(name);

  // ---------------------------------------------------------------- materials
  const materialsMod = await optional('./art/materials/index.js', 'materials');
  const poiId = params.get('poi') ?? 'giant-orbit';
  let materials = null;
  if (materialsMod?.createMaterialRegistry) {
    materials = materialsMod.createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('materials'),
      poi: poiId,
    });
    world.register('materials', materials);
    // The registry owns the active POI palette. Register it so BuildContext.palette
    // is populated - without this every build(ctx) in the game receives palette:null
    // and streams silently fall back to their own colours, defeating palette lock.
    if (materials.palette) world.register('palette', materials.palette);
  }
  note('materials', !!materials);

  const ctx = () => ({
    rng: world.rng.fork('build'),
    materials,
    palette: materials?.palette ?? world.systems.palette ?? null,
    faction: 'player',
    lod: 0,
  });

  // --------------------------------------------------------------- environment
  const lightingMod = await optional('./world/lighting/poi.js', 'poi-lighting');
  let lighting = null;
  if (lightingMod?.buildPOILighting) {
    lighting = lightingMod.buildPOILighting(poiId, ctx(), world);
    world.register('lighting', lighting);
    if (lighting?.keyProxy) renderer.post.setKeyLight(lighting.keyProxy, lighting.keyColor ?? null);
  }
  note('poi-lighting', !!lighting);

  const celestialsMod = await optional('./world/celestials/index.js', 'celestials');
  if (celestialsMod?.installCelestials) celestialsMod.installCelestials(world, poiId, ctx());
  note('celestials', !!celestialsMod?.installCelestials);

  const fieldsMod = await optional('./world/fields/index.js', 'fields');
  if (fieldsMod?.installFields) fieldsMod.installFields(world, poiId, ctx());
  note('fields', !!fieldsMod?.installFields);

  // If nothing lit the scene, put in a defensible key so the build is never a black
  // screen. This is a fallback, not a lighting design.
  if (!lighting) installFallbackLighting(world);

  // ------------------------------------------------------------------- cruiser
  const cruiserMod = await optional('./art/geometry/cruiser.js', 'cruiser-geometry');
  const hardpointMod = await optional('./art/geometry/hardpoints.js', 'hardpoints');

  // Pull in module and ship-class registrations. Importing them is what registers them.
  await optional('./art/geometry/modules/index.js', 'modules');
  await optional('./art/geometry/ships/index.js', 'faction-ships');

  let hullResult = null;
  if (cruiserMod?.buildCruiser) {
    hullResult = cruiserMod.buildCruiser(ctx());
    world.hullResult = hullResult;
  }
  note('cruiser-geometry', !!hullResult);

  const playerClass = getShipClass('player_cruiser') ?? synthesisePlayerClass(hullResult);
  const player = new Ship({
    classDef: playerClass,
    world,
    faction: 'player',
    isPlayer: true,
    root: hullResult?.root ?? placeholderHull(materials),
    position: new THREE.Vector3(0, COMBAT_PLANE_Y, 0),
  });
  world.player = player;
  world.addShip(player);

  // -------------------------------------------------------------- sim systems
  const combat = new CombatSystem(world);
  const salvage = new SalvageSystem(world);
  const strike = new StrikeCraftSystem(world);
  world.register('combat', combat);
  world.register('salvage', salvage);
  world.register('strikecraft', strike);
  engine.add(combat);
  engine.add(salvage);
  engine.add(strike);

  if (hardpointMod?.attachModule) {
    const refit = new RefitSystem(world, hardpointMod);
    world.register('refit', refit);
    note('refit', true);
  } else {
    note('refit', false);
  }

  /*
   * The progression and economy layer: volume-based cargo, tiered materials, the
   * codex, salvaged patterns, items, hull perks and objectives.
   *
   * This is installed AFTER salvage and refit because CargoHold and EconomySystem
   * take over stores those two already own - the hold stops being a six-slot array
   * and becomes cubic metres, and materials stop being three flat pools. Installing
   * it earlier would have salvage write into a hold that is about to be replaced.
   *
   * It is loaded through `optional()` like every other stream so a partial build
   * still boots; the systems stream that wrote it was not allowed to edit this file,
   * which is why the wiring lands here rather than there.
   */
  const metaMod = await optional('./sim/meta/index.js', 'progression');
  if (metaMod?.installProgression) metaMod.installProgression(world, { salvage });
  note('progression', !!metaMod?.installProgression);

  // Ships integrate themselves; one system drives them all so ordering is explicit.
  engine.add({
    name: 'ships',
    order: 60,
    fixedUpdate: (dt) => {
      for (const ship of world.ships) ship.fixedUpdate(dt);
      world.time += dt;
    },
  });
  engine.addRender({
    name: 'ship-transforms',
    order: 90,
    update: () => {
      for (const ship of world.ships) ship.syncTransform();
    },
  });

  // ------------------------------------------------------------- world sim / AI
  const worldSimMod = await optional('./world/index.js', 'world-sim')
    ?? await optional('./sim/ai/index.js', 'world-sim-alt');
  if (worldSimMod?.installWorldSim) worldSimMod.installWorldSim(world);
  note('world-sim', !!worldSimMod?.installWorldSim);

  // -------------------------------------------------------- camera and controls
  const tactical = new TacticalCamera(world, world.camera);
  const cinematic = new CinematicCamera(world, world.camera);
  tactical.lockTarget = player;
  tactical.snapToPlayer({ durationMs: 1 });
  world.register('tactical', tactical);
  world.register('cinematic', cinematic);

  const controls = new Controls(world, {
    tactical, cinematic, domElement: renderer.canvas,
  });
  world.register('controls', controls);

  engine.addRender(controls);
  engine.addRender({
    name: 'camera',
    order: 100,
    update: (dt) => {
      // The cinematic camera is a viewing mode, not a control mode: the tactical
      // camera keeps updating underneath it so orders still route normally and
      // leaving cinematic never costs the player their framing.
      tactical.update(dt);
      cinematic.update(dt);
      // Dim the live 3D scene as the strategic overlay fades in.
      const blend = tactical.strategicBlend;
      renderer.post.setExposureScale(1 - blend * 0.78);
    },
  });

  // ------------------------------------------------------------------ vfx / ui
  const vfxMod = await optional('./vfx/index.js', 'vfx');
  if (vfxMod?.installVFX) vfxMod.installVFX(world);
  note('vfx', !!vfxMod?.installVFX);

  const uiMod = await optional('./ui/index.js', 'ui');
  if (uiMod?.installUI) uiMod.installUI(world);
  note('ui', !!uiMod?.installUI);

  const audioMod = await optional('./audio/index.js', 'audio');
  if (audioMod?.installAudio) audioMod.installAudio(world);
  note('audio', !!audioMod?.installAudio);

  // ---------------------------------------------------------------- encounters
  // Seed something to fight and something to strip, so a fresh boot is never an
  // empty plane. The world sim replaces this once it is driving encounters.
  if (!worldSimMod?.installWorldSim && params.get('encounter') !== 'none') {
    seedFallbackEncounter(world);
  }

  world.report = report;
  console.info(
    `[game] booted POI "${poiId}" | streams: ${report.streams.join(', ') || 'none'}`
    + (report.missing.length ? ` | missing: ${report.missing.join(', ')}` : ''),
    registryReport(),
  );
  return report;
}

/** A defensible key light so a partially-integrated build is never a black screen. */
function installFallbackLighting(world) {
  const key = new THREE.DirectionalLight(0xffe6c4, 3.0);
  key.position.set(-1, 0.55, 0.7).normalize().multiplyScalar(8000);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 100;
  key.shadow.camera.far = 20000;
  const s = 3200;
  key.shadow.camera.left = -s; key.shadow.camera.right = s;
  key.shadow.camera.top = s; key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0008;
  world.scene.add(key);
  world.scene.add(new THREE.AmbientLight(0x101a26, 0.55));

  const proxy = new THREE.Object3D();
  proxy.position.copy(key.position);
  world.scene.add(proxy);
  world.renderer.post.setKeyLight(proxy, new THREE.Color(1.0, 0.9, 0.74));
}

/** Stand-in hull so the sim can be exercised before the real geometry lands. */
function placeholderHull(materials) {
  const g = new THREE.Group();
  const mat = materials?.get?.('hull', { faction: 'player' })
    ?? new THREE.MeshStandardMaterial({ color: 0x6e7681, metalness: 0.85, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(180, 150, HULL_LENGTH.cruiser), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  return g;
}

/**
 * Minimal class definition for the player cruiser when the geometry stream has not
 * registered one. Numbers match the feel tuning in docs/design/controls.md.
 */
function synthesisePlayerClass(hullResult) {
  return {
    id: 'player_cruiser_fallback',
    name: 'Salvager Cruiser',
    faction: 'player',
    role: 'cruiser',
    length: HULL_LENGTH.cruiser,
    mass: 62000,
    maxSpeed: 140,
    accel: 14,
    turnRate: 0.22,
    hullHP: 12000,
    triBudget: 2000,
    planeLocked: true,
    build: () => hullResult?.root ?? new THREE.Group(),
    subsystems: hullResult?.subsystems ?? [
      { id: 'engine_main', kind: 'engine', hp: 1400, position: [0, 0, -560], radius: 150, salvageValue: 0.2, label: 'Main Drive' },
      { id: 'reactor', kind: 'reactor', hp: 1800, position: [0, 20, -60], radius: 130, salvageValue: 0.3, label: 'Reactor' },
      { id: 'sensor', kind: 'sensor', hp: 700, position: [0, 90, 320], radius: 90, salvageValue: 0.1, label: 'Sensor Mast' },
    ],
    weapons: [],
  };
}

/**
 * A small fallback engagement: one hostile and one derelict hulk within tow range, so
 * a fresh boot always has the full loop available to exercise.
 */
function seedFallbackEncounter(world) {
  const classes = allShipClasses().filter((c) => c.faction !== 'player' && c.role !== 'fighter');
  if (!classes.length) return;
  const rng = world.rng.fork('fallback-encounter');

  for (let i = 0; i < 3; i++) {
    const def = rng.pick(classes);
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(5200, 9000);
    const ship = new Ship({
      classDef: def,
      world,
      faction: def.faction,
      position: new THREE.Vector3(Math.sin(angle) * dist, COMBAT_PLANE_Y, Math.cos(angle) * dist),
      heading: angle + Math.PI,
      root: def.build ? def.build({ rng: rng.fork(`enc${i}`), materials: world.systems.materials, faction: def.faction, lod: 0 }) : undefined,
    });
    world.addShip(ship);
  }
  world.bus.emit(EV.NOTIFY, { text: 'Contacts on sensors', important: false });
}
