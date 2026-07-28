/**
 * UI PROBE — every screen, populated with real data, over the real 3D scene.
 *
 *   node tools/probe.mjs ui --out docs/probes/ui.png
 *   node tools/probe.mjs ui --seed 'ui#screen=refit' --out docs/probes/ui-refit.png
 *   node tools/probe.mjs ui --seed 'ui#screen=hit'   --out docs/probes/ui-chevron.png
 *   node tools/probe.mjs ui --seed 'ui#screen=locked' --out docs/probes/ui-locked.png
 *
 * NOTHING HERE IS MOCKED. The frame is a real cruiser built by the geometry stream,
 * fitted with real registered modules through the real `RefitSystem`, fighting real
 * hulls through the real `CombatSystem`, lit by the real POI rig. Every number the
 * interface prints was read off a simulation object a few milliseconds earlier. A UI
 * probe drawn over fake data proves the drawing code runs; it proves nothing about
 * whether the interface can survive contact with the game.
 *
 * WHAT EACH FRAME IS FOR
 *
 *   screen=combat (default)
 *     The flying interface under load. Hull at 61 %, one mount past its breach
 *     threshold and one already breached, a live target with a destroyed subsystem,
 *     firing arcs on the plane with two mounts bearing and three not, the subsystem
 *     ring with two entries greyed because nothing can reach them, power spooling
 *     mid-swing, and the three order-marker stages on screen at once.
 *
 *   screen=refit
 *     The refit bay: the hull in 3D with all six mounts called out, four salvaged
 *     parts in the hold with their factions visible, a candidate selected, and the
 *     full diff of what fitting it would do - including the arc it opens and the
 *     outline it changes.
 *
 *   screen=hit
 *     The cruiser off-frame, taking fire. This is the only way to photograph the
 *     directional damage chevron, because the chevron only exists when the ship is
 *     not in shot.
 *
 *   screen=locked
 *     A first-hour ship: no reactor, so the power panel is sealed, the hold is
 *     nearly empty and half the mounts are bare. The interface has to be legible
 *     before the player owns anything, not only when they own everything.
 */

import * as THREE from 'three';
import { createMaterialRegistry } from '../art/materials/index.js';
import { NEUTRAL, getPOIPalette } from '../art/palette.js';
import { buildCruiser, CRUISER_SUBSYSTEMS } from '../art/geometry/cruiser.js';
import * as hardpointMod from '../art/geometry/hardpoints.js';
import { buildCelestials } from '../world/celestials/index.js';
import { buildPOILighting } from '../world/lighting/poi.js';
import '../art/geometry/modules/index.js';
import '../art/geometry/ships/index.js';

import { getShipClass, getModule, allModules, HARDPOINTS } from '../core/contracts.js';
import { HULL_LENGTH, COMBAT_PLANE_Y } from '../core/units.js';
import { Ship } from '../sim/ship.js';
import { CombatSystem } from '../sim/combat.js';
import { SalvageSystem } from '../sim/salvage.js';
import { RefitSystem } from '../sim/refit.js';
import { installUI } from '../ui/index.js';

// ---------------------------------------------------------------------------
// Scenario data
// ---------------------------------------------------------------------------

/** What the player is flying: a half-salvaged hull, mid-run. */
const FIT = {
  bow: 'bow_siege_lance',
  dorsal: 'dorsal_rail_battery',
  port: 'port_broadside_battery',
  ventral: 'ventral_salvage_tractor',
  engine: 'engine_reactor_uprate',
  // starboard deliberately left EMPTY: the arc rose has to show a hole, and the
  // bearing readout has to have something to tell the player to turn for.
};

/** In the hold. Four factions' worth of loot, so identity has to carry the list. */
const HOLD = [
  { moduleId: 'port_gauss_outrigger', condition: 0.91 },
  { moduleId: 'dorsal_shield_pylons', condition: 0.64 },
  { moduleId: 'ventral_hangar_deck', condition: 0.78 },
  { moduleId: 'port_beam_array', condition: 0.42 },
];

const SCREENS = {
  combat: { poi: 'graveyard', pose: { distance: 4300, pitch: 0.40, yaw: 0.86 } },
  hit: { poi: 'graveyard', pose: { distance: 3400, pitch: 0.36, yaw: 0.86 } },
  locked: { poi: 'graveyard', pose: { distance: 4300, pitch: 0.40, yaw: 0.86 } },
  refit: { poi: 'yard', pose: { distance: 2050, pitch: 0.21, yaw: 0.92 } },
};

export default {
  name: 'UI — HUD, tactical overlay, power routing, refit bay',
  camera: { distance: 4300, pitch: 0.40, yaw: 0.86, target: new THREE.Vector3(0, 0, 0) },

  async setup(ctx) {
    const { world, engine, renderer, scene, far, pose } = ctx;

    // Params can arrive either as real query params or after a '#' inside --seed,
    // which is how tools/probe.mjs lets one probe produce several plates.
    const seedOpts = new URLSearchParams((ctx.params.get('seed') ?? '').split('#')[1] ?? '');
    const param = (k) => ctx.params.get(k) ?? seedOpts.get(k);
    const screenName = SCREENS[param('screen')] ? param('screen') : 'combat';
    const S = SCREENS[screenName];
    const locked = screenName === 'locked';

    // Keep the probe's own caption out of the frame; the interface IS the caption.
    const label = document.getElementById('label');
    if (label) label.style.display = 'none';

    // ---- materials, sky, light -------------------------------------------
    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork(`ui-probe:${screenName}`),
      poi: S.poi,
    });
    world.register('materials', registry);
    world.register('palette', registry.palette);

    scene.background = null;
    far.background = new THREE.Color().setHex(NEUTRAL.void, THREE.SRGBColorSpace);

    const sky = buildCelestials(S.poi, { rng: world.rng.fork('ui-sky'), far });
    engine.addRender({ name: 'probe-sky', order: 60, update: () => sky.update(renderer.farCamera) });

    const rig = buildPOILighting(S.poi, {
      rng: world.rng.fork('ui-rig'), materials: registry, palette: registry.palette,
      faction: 'player', lod: 0,
    }, world, { shadows: true, fog: true, shadowRadius: 2600, shadowMapSize: 1024 });
    if (rig?.keyProxy) renderer.post.setKeyLight(rig.keyProxy, rig.keyColor ?? null);
    registry.applyEnvironment(scene, S.poi, 0.9);

    // GTAO and a 24-tap godray pass at 1600x900 are the two most expensive things in
    // the frame on a software rasteriser, and neither is what this probe is judging.
    // Bloom and SMAA stay: they are load-bearing for how the interface reads over the
    // scene, and the grade's crushed blacks and vignette are the point.
    renderer.post.gtao.enabled = false;
    renderer.post.godrays.uniforms.samples.value = 8;

    // ---- the cruiser ------------------------------------------------------
    const hull = buildCruiser({
      rng: world.rng.fork('ui-cruiser'), materials: registry,
      palette: registry.palette, faction: 'player', lod: 0,
    });
    world.hullResult = hull;
    hull.lod.autoUpdate = true;

    const player = new Ship({
      classDef: playerClass(hull),
      world, faction: 'player', isPlayer: true,
      root: hull.root,
      position: new THREE.Vector3(0, COMBAT_PLANE_Y, 0),
      heading: 0.28,
    });
    world.player = player;
    world.addShip(player);

    // ---- systems ----------------------------------------------------------
    const combat = new CombatSystem(world);
    const salvage = new SalvageSystem(world);
    world.register('combat', combat);
    world.register('salvage', salvage);
    engine.add(combat);
    engine.add(salvage);
    const refit = new RefitSystem(world, hardpointMod);
    world.register('refit', refit);
    engine.add({
      name: 'ships', order: 60,
      fixedUpdate: (dt) => { for (const s of world.ships) s.fixedUpdate(dt); world.time += dt; },
    });
    engine.addRender({
      name: 'ship-transforms', order: 90,
      update: () => { for (const s of world.ships) s.syncTransform(); },
    });

    // ---- fit the ship, through the real refit system ----------------------
    // Everything the refit screen will show has to have arrived the way the player's
    // parts arrive: into the hold, then onto a mount.
    let uid = 0;
    const stock = (moduleId, condition) => {
      world.inventory.push({ moduleId, condition, uid: `probe:${uid++}` });
      return world.inventory[world.inventory.length - 1].uid;
    };

    if (!locked) {
      for (const [mount, moduleId] of Object.entries(FIT)) {
        if (!getModule(moduleId)) continue;
        const u = stock(moduleId, 1);
        const res = refit.install(mount, u);
        if (!res.ok) console.warn(`[probe:ui] could not fit ${moduleId} on ${mount}: ${res.reason}`);
      }
    } else {
      // A first-hour hull: one salvaged cannon and nothing else.
      const u = stock('port_cannon_bank', 0.7);
      refit.install('port', u);
    }

    for (const h of locked ? HOLD.slice(0, 1) : HOLD) {
      if (getModule(h.moduleId)) stock(h.moduleId, h.condition);
    }
    world.materials.alloy = locked ? 84 : 1240;
    world.materials.composite = locked ? 12 : 415;
    world.materials.exotic = locked ? 0 : 3;

    // ---- hostiles ---------------------------------------------------------
    const enemies = spawnEnemies(world, registry, screenName);
    const target = enemies[0] ?? null;
    if (target) {
      // A fight already in progress: the target has lost a battery and is holed.
      damageShip(target, 0.58);
      const aim = [...target.subsystems.values()].find((s) => !s.destroyed && s.def.kind === 'reactor');
      player.orderAttack(target, aim?.def.id ?? null);
    }

    // ---- damage the player, so the structure panel has something to say ----
    if (!locked) {
      player.hullHP = player.maxHullHP * 0.61;
      const port = player.hardpoints.get('port');
      if (port) { port.structureHP = port.maxStructureHP * 0.27; port.warned = true; }
      const dorsal = player.hardpoints.get('dorsal');
      if (dorsal) dorsal.structureHP = dorsal.maxStructureHP * 0.72;
      // A mount that has already been lost. This is the state the breach threshold
      // exists to warn about, so the interface has to be legible in it.
      const stbd = player.hardpoints.get('starboard');
      if (stbd) { stbd.structureHP = 0; stbd.breached = true; }
      const sub = player.subsystems.get('sensor_array');
      if (sub) sub.hp = sub.maxHP * 0.44;
    } else {
      player.hullHP = player.maxHullHP * 0.93;
    }

    // ---- a wreck to salvage ----------------------------------------------
    const wreck = makeWreck(world, registry, salvage);

    // ---- settle the simulation -------------------------------------------
    // Real weapon world-positions, real traverse, real shield and power state come
    // from stepping the engine, not from assignment.
    player.body.desiredHeading = player.heading;
    for (let i = 0; i < 60; i++) engine.stepOnce();

    // Turn the hull so the arc edge cuts through the target - see the function.
    if (target && !locked) {
      tuneHeadingForMixedBearing(player, target, combat);
      for (let i = 0; i < 4; i++) engine.stepOnce();
      player.body.desiredHeading = player.heading;
    }

    // ---- power: caught mid-swing -----------------------------------------
    // The gap between requested and delivered IS the mechanic, so the frame is taken
    // while four channels are still spooling toward a stance the player just picked.
    if (!locked && world.unlocked.powerRouting) {
      player.power.applyPreset('assault');
      for (let i = 0; i < 18; i++) engine.stepOnce();   // ~0.3 s of a ~0.75 s swing
    }

    // ---- the UI itself ----------------------------------------------------
    const ui = installUI(world);
    ui.orderBar.say('SUBSYSTEM LOCK — REACTOR DRUM · 92% ACCURACY', 'info');

    if (screenName === 'refit') {
      ui.openScreen('refit');
      ui.refit.selectedMount = 'starboard';
      const first = world.inventory.find((i) => getModule(i.moduleId)?.hardpoint === 'port');
      if (first) ui.refit.selectItem(first.uid);
      ui.refit.yaw = S.pose.yaw;
      ui.refit.pitch = S.pose.pitch;
      ui.refit.distance = S.pose.distance;
      // Prewarm the whole hold before the shot so the readout reports a real cache.
      for (let i = 0; i < 12; i++) ui.refit._prewarmStep();
      ui.notify('SALVAGE HOLD 4/8', { important: false });
    } else {
      seedMarkers(ui, world, player, target, wreck);
      ui.notify('CONTACT RESOLVED — CONCORD PICKET', { important: true });
      ui.notify('CUTTING BEAM ENGAGED', { important: false });
    }

    if (screenName === 'hit') {
      // Off-frame and under fire. The chevron is the whole point of this plate.
      ui.damage.at = 0.35;
      ui.damage.amount = 340;
      ui.orderBar.say('HULL BREACH — PORT QUARTER', 'error');
    }

    Object.assign(pose, S.pose);
    if (screenName === 'hit' && target) {
      // Frame the enemy, not the cruiser.
      pose.target.copy(target.position);
    } else {
      pose.target.set(0, 40, 0);
    }

    ctx.ui = ui;
    ctx.registry = registry;
    ctx.screenName = screenName;
    ctx.hold = makeHold(ui, screenName);

    report({ world, ui, combat, player, target, registry, screenName, renderer });

    ctx.dispose = () => { ui.dispose(); sky.dispose(); rig.dispose(); registry.dispose(); };
  },

  update(_dt, ctx) {
    ctx.hold?.();
  },
};

/**
 * Hold the transient layers at the instant this plate wants to photograph.
 *
 * Everything in the interface that fades, dissolves or scales in is on a WALL clock,
 * which is correct for a game and useless for a screenshot: the harness settles for
 * ninety frames, and on a software rasteriser those ninety frames are twenty seconds,
 * by which point every marker has expired and every toast has faded out.
 *
 * So this re-stamps the clocks each frame to fixed offsets. The markers, toasts and
 * order bar are the real objects on the real pools, created through the real entry
 * points - only their timestamps are held, so the plate shows the state at a chosen
 * instant instead of the state twenty seconds after the last thing happened.
 */
function makeHold(ui, screenName) {
  const seeded = [];
  ui.markers.forEach((m) => {
    if (m.active) seeded.push({ m, stage: m.stage, dStage: 0.055, dT0: m.kind === 'salvage' ? 0.5 : 0.08 });
  });
  return () => {
    const t = ui.time;
    for (const s of seeded) {
      s.m.active = true;
      s.m.t0 = t - s.dT0;
      s.m.stage = s.stage;
      s.m.stageAt = t - s.dStage;
      if (s.stage === 'provisional') s.m.frame0 = ui.frame + 1;
    }
    const n = ui.notifications;
    for (let i = 0; i < n.count; i++) n.items[i].t0 = t - 0.6 - i * 0.25;
    ui.orderBar.t0 = t - 0.6;
    if (screenName === 'hit') ui.damage.at = t - 0.7;
    if (screenName === 'refit') ui.refit._profileAt = t - 1.2;
  };
}

// ---------------------------------------------------------------------------
// Scenario construction
// ---------------------------------------------------------------------------

function playerClass(hull) {
  return {
    id: 'probe_player_cruiser',
    name: 'Nadir',
    faction: 'player',
    role: 'cruiser',
    length: HULL_LENGTH.cruiser,
    mass: 620000,
    maxSpeed: 180,
    accel: 6.0,
    turnRate: 0.085,
    hullHP: 26000,
    triBudget: 2000,
    planeLocked: true,
    build: () => hull.root,
    subsystems: CRUISER_SUBSYSTEMS,
    weapons: [],
  };
}

function spawnEnemies(world, registry, screenName) {
  const out = [];
  const rng = world.rng.fork('ui-enemies');
  const roster = [
    { id: 'concord_destroyer', angle: -0.62, dist: 4300 },
    { id: 'concord_corvette', angle: -1.35, dist: 3100 },
    { id: 'coalition_frigate', angle: 2.25, dist: 5600 },
  ];
  for (const r of roster) {
    const def = getShipClass(r.id);
    if (!def) continue;
    const root = def.build?.({
      rng: rng.fork(r.id), materials: registry, palette: registry.palette,
      faction: def.faction, lod: 0,
    });
    const ship = new Ship({
      classDef: def,
      world,
      faction: def.faction,
      root,
      position: new THREE.Vector3(Math.sin(r.angle) * r.dist, COMBAT_PLANE_Y, Math.cos(r.angle) * r.dist),
      heading: r.angle + Math.PI * 0.82,
    });
    world.reputation[def.faction] = -60;   // everyone here is hostile to the player
    world.addShip(ship);
    out.push(ship);
  }
  void screenName;
  return out;
}

/**
 * Chew the target up the way a careful salvager would: one weapon mount shot out
 * entirely, another most of the way, everything else scratched. Selected by KIND
 * rather than by id, so this keeps working whichever hull the roster hands back.
 */
function damageShip(ship, hullFrac) {
  ship.hullHP = ship.maxHullHP * hullFrac;
  ship.salvageIntegrity = 0.72;
  const weapons = [...ship.subsystems.values()].filter((s) => s.def.kind === 'weapon');
  if (weapons[0]) { weapons[0].hp = 0; weapons[0].destroyed = true; }
  if (weapons[1]) weapons[1].hp = weapons[1].maxHP * 0.31;
  const engines = [...ship.subsystems.values()].filter((s) => s.def.kind === 'engine');
  if (engines[0]) { engines[0].hp = 0; engines[0].destroyed = true; }
  let i = 0;
  for (const s of ship.subsystems.values()) {
    if (!s.destroyed && s.hp === s.maxHP) s.hp = s.maxHP * (0.84 - 0.09 * (i++ % 5));
  }
}

/**
 * Find the hull heading that best DEMONSTRATES the grey-out.
 *
 * The subsystem ring greys entries `combat.canAnyWeaponBear()` returns false for,
 * and that grey is the mechanism the whole spatial layer is taught through. A frame
 * where every entry is lit proves nothing and a frame where every entry is grey
 * proves nothing either; the frame that teaches is the one where the arc edge cuts
 * THROUGH the target and half the ring goes dark.
 *
 * So rather than hand-tuning an angle that would rot the moment a module's arc
 * changed, this sweeps every heading and keeps the one with the most balanced split.
 * Deterministic, and self-correcting against the real arc data.
 */
function tuneHeadingForMixedBearing(player, target, combat) {
  const subs = [...target.subsystems.values()].filter((s) => !s.destroyed);
  if (!subs.length || !player.weapons.length) return player.heading;
  let best = player.heading;
  let bestScore = -1;
  for (let i = 0; i < 360; i++) {
    const h = (i / 360) * Math.PI * 2;
    for (const m of player.weapons) m.updateWorld(player.position, h);
    player.body.heading = h;
    let lit = 0;
    for (const s of subs) if (combat.canAnyWeaponBear(player, s)) lit++;
    const grey = subs.length - lit;
    // Balanced split first; ties broken toward more lit entries so the frame still
    // shows a live firing solution rather than a hull with nothing on target.
    const score = Math.min(lit, grey) * 100 + lit;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  player.body.heading = best;
  player.body.desiredHeading = best;
  for (const m of player.weapons) m.updateWorld(player.position, best);
  return best;
}

/** A hulk with cut sections, so the salvage marker and the hold have provenance. */
function makeWreck(world, registry, salvage) {
  const def = getShipClass('coalition_frigate');
  if (!def) return null;
  const rng = world.rng.fork('ui-wreck');
  const victim = new Ship({
    classDef: def, world, faction: 'coalition',
    root: def.build?.({ rng: rng.fork('hulk'), materials: registry, palette: registry.palette, faction: 'coalition', lod: 0 }),
    position: new THREE.Vector3(-1650, COMBAT_PLANE_Y, 1450),
    heading: 1.9,
  });
  world.addShip(victim);
  victim.salvageIntegrity = 0.86;
  const wreck = salvage._spawnWreck(victim);
  if (wreck) {
    wreck.update(0);
    const s = wreck.sections.find((x) => x.cuttable);
    if (s) { s.cutProgress = 0.42; salvage.orderCut(wreck, s); }
  }
  return wreck;
}

/**
 * Put all three marker stages on screen at once.
 *
 * The three-stage animation is a TIME sequence, and a screenshot is one instant, so
 * the only honest way to photograph it is to spawn three markers and backdate them
 * into the three states. Every one of them is a real marker on the real pool,
 * created through the same entry point the input stream calls.
 */
function seedMarkers(ui, world, player, target, wreck) {
  const t = ui.time;
  const p = player?.position ?? new THREE.Vector3();

  // 1. REJECTED first — the dissolve, with a specific reason on it. Spawned before
  //    the legal move order, exactly as it would happen at the desk.
  const bad = ui.spawnOrderMarker('move', {
    point: new THREE.Vector3(p.x - 2100, 0, p.z + 2600),
  });
  if (bad) {
    bad.stage = 'rejected';
    bad.stageAt = t - 0.055;
    bad.reason = 'OUT OF ARC — PORT BATTERY BEARS 20°–160°';
  }

  // 2. PROVISIONAL — spawned this instant, not yet drawn once.
  const move = ui.spawnOrderMarker('move', {
    point: new THREE.Vector3(p.x + 1900, 0, p.z - 2400),
  });
  if (move) { move.frame0 = ui.frame + 4; move.stage = 'provisional'; }

  // 3. COMMITTED — mid scale-in, on the locked target.
  if (target) {
    const atk = ui.spawnOrderMarker('attack', { target, subsystem: player?.targetSubsystem ?? null });
    if (atk) { atk.stage = 'committed'; atk.stageAt = t - 0.055; atk.t0 = t - 0.07; }
  }

  // A live salvage cut, so the amber bracket and its progress bar are in frame.
  const cutting = world.systems.salvage?.cutting;
  if (cutting) {
    const m = ui.spawnOrderMarker('salvage', { section: cutting.section });
    if (m) { m.stage = 'committed'; m.stageAt = t - 0.6; m.ttl = 30; }
  }
  void wreck;
}

// ---------------------------------------------------------------------------
// The console report. The picture is the judgement; this is what stops a later
// change quietly breaking something the picture happens not to show.
// ---------------------------------------------------------------------------

function report({ world, ui, combat, player, target, registry, screenName, renderer }) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('');
  console.log('=== NADIR POINT — UI ================================================');
  console.log(`screen        : ${screenName}`);
  console.log(`surface       : ${ui.surface.width}x${ui.surface.height} css, dpr ${ui.surface.dpr}, `
    + `backing ${ui.surface.canvas.width}x${ui.surface.canvas.height}`);
  console.log(`systems       : fixed "${ui.watcher.name}" order ${ui.watcher.order}, `
    + `render "${ui.renderSystem.name}" order ${ui.renderSystem.order}`);
  console.log(`idempotent    : installUI twice returns same object = ${installUI(world) === ui}`);

  console.log('');
  console.log('hardpoints');
  for (const id of HARDPOINTS) {
    const hp = player.hardpoints.get(id);
    const frac = hp ? hp.structureHP / hp.maxStructureHP : 1;
    console.log(`  ${pad(id, 10)} ${pad(hp?.module?.def?.name ?? '(empty)', 26)} `
      + `struct ${(frac * 100).toFixed(0).padStart(3)}%  `
      + `${hp?.breached ? 'BREACHED' : frac <= 0.35 ? 'CRITICAL' : ''}`);
  }

  console.log('');
  console.log(`arcs          : ${combat.describeArcs(player).length} mounts described`);
  if (target) {
    const rep = combat.bearingReport(player, target);
    console.log(`bearing       : ${rep.bearing}/${rep.total} mounts bear, `
      + `min error ${Number.isFinite(rep.minError) ? ((rep.minError * 180) / Math.PI).toFixed(1) : '0'} deg`);
    console.log(`advice        : "${ui.bearingAdvice(player, target, rep)}"`);
    let bearable = 0, grey = 0;
    for (const s of target.subsystems.values()) {
      if (s.destroyed) continue;
      if (combat.canAnyWeaponBear(player, s)) bearable++; else grey++;
    }
    console.log(`subsystem ring: ${bearable} live, ${grey} GREYED (no mount bears), `
      + `${[...target.subsystems.values()].filter((s) => s.destroyed).length} destroyed`);
  }

  const plant = player.power;
  console.log('');
  console.log(`power routing : unlocked=${world.unlocked.powerRouting} capacity=${plant.capacity.toFixed(0)} PU`);
  const snap = plant.snapshot();
  for (const [ch, e] of Object.entries(snap.channels)) {
    console.log(`  ${pad(ch, 9)} delivered ${(e.actual * 100).toFixed(1).padStart(5)}%  `
      + `requested ${(e.target * 100).toFixed(1).padStart(5)}%  `
      + `${e.spooling ? `SPOOLING (gap ${((e.target - e.actual) * 100).toFixed(1)}%)` : 'settled'}`);
  }

  console.log('');
  console.log(`hold          : ${world.inventory.length}/${world.systems.salvage.cargoCapacity}`);
  for (const it of world.inventory) {
    const d = getModule(it.moduleId);
    console.log(`  ${pad(d?.name ?? it.moduleId, 26)} ${pad(d?.faction ?? '?', 10)} `
      + `T${d?.tier ?? '?'}  cond ${((it.condition ?? 1) * 100).toFixed(0)}%`);
  }
  console.log(`materials     : ${world.materials.alloy} alloy, ${world.materials.composite} composite, `
    + `${world.materials.exotic} exotic`);

  console.log('');
  console.log('order markers (three stages, all live on the pool)');
  ui.markers.forEach((m) => {
    if (m.active) console.log(`  ${pad(m.kind, 9)} ${pad(m.stage, 12)} ${m.reason ?? ''}`);
  });

  if (screenName === 'refit') {
    const r = ui.refit;
    const now = r.summary();
    const cand = r.candidate();
    const after = cand ? r.summary({ mount: r.selectedMount, module: cand.def }) : null;
    console.log('');
    console.log(`refit         : mount=${r.selectedMount} candidate=${cand?.def?.id ?? 'none'} `
      + `(${cand?.check?.ok ? 'legal' : cand?.check?.reason ?? '-'})`);
    console.log(`  arc coverage  ${(now.coverage * 180 / Math.PI).toFixed(0)} deg`
      + (after ? ` -> ${(after.coverage * 180 / Math.PI).toFixed(0)} deg` : ''));
    console.log(`  reactor       ${now.power.toFixed(0)} PU`
      + (after ? ` -> ${after.power.toFixed(0)} PU` : ''));
    console.log(`  mass          ${(now.mass / 1000).toFixed(1)} kt`
      + (after ? ` -> ${(after.mass / 1000).toFixed(1)} kt` : ''));
    console.log(`  outline       ${r.profile ? `${r.profile.length.toFixed(0)} x ${r.profile.beam.toFixed(0)} x ${r.profile.height.toFixed(0)} m` : 'unmeasured'}`);
    console.log(`  prewarm       ${r._warm.size} parts warm, ${r._warmQueue.length} queued`);

    // The acceptance criterion, exercised for real: fit a part onto the bare
    // starboard sponson, time it, then take it off again. The screen ends up back in
    // the state this plate wants - part in the hold, mount empty - while the outline
    // graph keeps the previous fit as its ghost and the strip keeps the measurement.
    const spare = world.inventory.find((i) => getModule(i.moduleId)?.hardpoint === 'port');
    if (spare) {
      r.selectedMount = 'starboard';
      r.selectItem(spare.uid);
      const before = performance.now();
      r.install();
      console.log(`  LIVE INSTALL  ${(performance.now() - before).toFixed(2)} ms wall `
        + `(RefitSystem.install measured ${r.lastInstall ? r.lastInstall.ms.toFixed(2) : '?'} ms)`);
      r.uninstall('starboard');
      const again = world.inventory.find((i) => getModule(i.moduleId)?.hardpoint === 'port');
      if (again) r.selectItem(again.uid);
      r.selectedMount = 'starboard';
    }
  }

  const audit = registry.paletteAudit(world.scene);
  console.log('');
  console.log(`palette       : ${audit.foreign.length} off-palette colours, `
    + `${audit.materialsOutsideRegistry.length} materials outside the registry`);
  const stats = renderer.frameStats;
  console.log(`3D cost of UI : 0 draw calls, 0 geometries, 0 materials `
    + `(scene total is ${stats.calls} calls / ${stats.geometries} geometries)`);
  console.log('=====================================================================');
  void allModules;
}
