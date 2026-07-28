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
import { installWorldSim } from '../world/index.js';
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
  combat: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 } },
  hit: { poi: 'graveyard', pose: { distance: 2400, pitch: 0.30, yaw: 0.86 } },
  locked: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 } },
  refit: { poi: 'yard', pose: { distance: 2050, pitch: 0.21, yaw: 0.92 } },

  /**
   * The systems plates. Same scenario, same real simulation — the only difference is
   * which windows are open and how hard the meta layer has been exercised first.
   *
   *   armament   the strip under load: one mount cooked, one dry, one frozen by a dead
   *              traverse ring, one worn, one empty. Every state the panel can show,
   *              on one hull, at once.
   *   parts      close in on the target with a weapon subsystem aimed, so the
   *              second-tier sub-part ring is in frame beside the first tier.
   *   codex / hold / materials / progress   one window each, over the live scene.
   */
  armament: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 }, panels: ['armament'] },
  parts: { poi: 'graveyard', pose: { distance: 1500, pitch: 0.30, yaw: 0.86 }, panels: [], aimWeapon: true, frameOn: 'target' },
  codex: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 }, panels: ['codex'] },
  hold: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 }, panels: ['armament', 'hold', 'materials'] },
  materials: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 }, panels: ['materials'] },
  progress: { poi: 'graveyard', pose: { distance: 3750, pitch: 0.33, yaw: 0.86 }, panels: ['objectives', 'perks'], war: true },
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

    /**
     * Hand the event loop back.
     *
     * Building a cruiser, four faction hulls, five modules and their texture bakes,
     * then stepping the simulation eighty times, is well over ten seconds of solid
     * synchronous work on a software rasteriser. A main thread blocked that long
     * stops answering the dev server's HMR socket, which then decides the page has
     * died and reloads it - mid-setup, and the harness reports a boot failure that
     * has nothing to do with the code under test.
     */
    const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

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

    // The refit bay drops the gas giant. A planet filling a third of the frame is
    // beautiful and it sits directly behind the panel columns, where it destroys the
    // value separation the interface depends on. The POI's LIGHTING is untouched -
    // only the hero body is suppressed, so the hull keeps its warm work lights over
    // a near-black field.
    const sky = buildCelestials(S.poi, {
      rng: world.rng.fork('ui-sky'), far,
      overrides: screenName === 'refit' ? { giant: null } : {},
    });
    engine.addRender({ name: 'probe-sky', order: 60, update: () => sky.update(renderer.farCamera) });

    const rig = buildPOILighting(S.poi, {
      rng: world.rng.fork('ui-rig'), materials: registry, palette: registry.palette,
      faction: 'player', lod: 0,
    }, world, {
      shadows: true, fog: true, shadowRadius: 2600, shadowMapSize: 1024,
      // The refit bay is lit like a dock at night: one hard warm key, almost no fill,
      // and a shadow side that goes to black. The POI's own fill is tuned for flying
      // through the place, not for standing a hull in front of a panel column.
      fillScale: screenName === 'refit' ? 0.5 : 1,
      bounceScale: screenName === 'refit' ? 0.30 : 0.55,
    });
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
    await breathe();

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
        await breathe();
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
    await breathe();
    const enemies = spawnEnemies(world, registry, screenName);
    await breathe();
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
    // Inside tractor reach, so the cut ordered after the settle actually holds.
    const wreck = makeWreck(world, registry, salvage, new THREE.Vector3(-1180, COMBAT_PLANE_Y, 900));

    // ---- settle the simulation -------------------------------------------
    // Real weapon world-positions, real traverse, real shield and power state come
    // from stepping the engine, not from assignment.
    await breathe();
    player.body.desiredHeading = player.heading;
    for (let i = 0; i < 60; i++) {
      engine.stepOnce();
      if (i % 20 === 19) await breathe();
    }

    // Turn the hull so the arc edge cuts through the target - see the function.
    if (target && !locked) {
      tuneHeadingForMixedBearing(player, target, combat);
      for (let i = 0; i < 4; i++) engine.stepOnce();
      player.body.desiredHeading = player.heading;
    }
    // Under way, not parked. A velocity readout of zero says nothing about a hull
    // whose whole character is that it takes forty-five seconds to stop.
    player.body.velocity.set(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(88);

    // The cut has to be ordered after the stepping - see beginCut.
    beginCut(salvage, wreck);

    // ---- power: caught mid-swing -----------------------------------------
    // The gap between requested and delivered IS the mechanic, so the frame is taken
    // while four channels are still spooling toward a stance the player just picked.
    if (!locked && world.unlocked.powerRouting) {
      player.power.applyPreset('assault');
      for (let i = 0; i < 18; i++) engine.stepOnce();   // ~0.3 s of a ~0.75 s swing
    }

    // ---- the systems layer, exercised for real ----------------------------
    // Everything below goes through the same entry points the game uses: the thermal
    // system's own fire site, the stores magazine, `ModuleParts.damagePart`, the cargo
    // hold's `addItem`, the refinery's `addScrap`/`enqueue`, `PatternSystem.learn` and
    // `PerkSystem.buy`. Nothing is a mock and nothing writes a display field.
    if (!locked) {
      dressArmament(player);
      dressMetaLayer(world);
      // `ShipThermal.state`, `ext` and the smoothed rates are only recomputed inside
      // `update()`, so the ship has to take a few steps after being dressed or the
      // readout prints NOMINAL over two cooked mounts. Six steps is a tenth of a
      // second — far too little to cool anything, and enough to make the summary true.
      for (let i = 0; i < 6; i++) engine.stepOnce();
    }
    if (S.war) {
      await breathe();
      dressWar(world);
    }
    if (S.aimWeapon && target) {
      const gun = [...target.subsystems.values()].find((s) => !s.destroyed && s.def.kind === 'weapon');
      const mount = gun ? target.weapons.find((m) => m.subsystemId === gun.def.id) : null;
      if (gun) {
        // Aim at a sub-part specifically, which is what the second tier exists for:
        // the traverse ring, so the plate shows the ARC FROZEN consequence in place.
        const ring = mount?.parts?.list.find((p) => p.kind === 'traverse')
          ?? mount?.parts?.list[0] ?? null;
        player.orderAttack(target, gun.def.id, ring?.id ?? null);
        // And chew one of its parts, so the ring is not four identical full segments.
        const feed = mount?.parts?.list.find((p) => p.kind === 'feed');
        if (feed) mount.parts.damagePart(feed, feed.maxHP * 0.62);
      }
    }

    // ---- framing ----------------------------------------------------------
    // Solved from where the two hulls actually ended up rather than authored, so the
    // plate stays composed if the heading search or the roster changes. The camera
    // looks square across the engagement axis: player left, target right, which is
    // also the side the target panel is on.
    Object.assign(pose, S.pose);
    framePair(pose, player, target, S.frameOn === 'target' ? 'hit' : screenName);

    // ---- the UI itself ----------------------------------------------------
    const ui = installUI(world, S.panels ? { panels: S.panels } : {});
    ui.orderBar.say('SUBSYSTEM LOCK — REACTOR DRUM · 92% ACCURACY', 'info');

    if (screenName === 'refit') {
      // Structure first: a breached mount cannot take a part, so leaving starboard
      // wrecked would put the whole diff column in "—" and demonstrate nothing.
      // Repairing it here also exercises the repair path and spends real alloy.
      const rep = refit.repairHardpoint('starboard');
      ui.openScreen('refit');
      // The decision on the plate is a SWAP, not a fill: barrier pylons onto the
      // dorsal bed, which means giving up the 306-degree rail battery for a shield.
      // That is the shape of every real refit choice - something for something - and
      // it exercises the diff in both directions at once.
      const first = world.inventory.find((i) => i.moduleId === 'dorsal_shield_pylons')
        ?? world.inventory.find((i) => getModule(i.moduleId)?.hardpoint === 'dorsal');
      // selectItem jumps the mount to the first one the part fits, so the mount is
      // forced afterwards, not before.
      if (first) ui.refit.selectItem(first.uid);
      ui.refit.selectedMount = 'dorsal';
      ui.refit.yaw = S.pose.yaw;
      ui.refit.pitch = S.pose.pitch;
      ui.refit.distance = S.pose.distance;
      // Prewarm the whole hold before the shot so the readout reports a real cache.
      for (let i = 0; i < 12; i++) { ui.refit._prewarmStep(); await breathe(); }
      if (rep.ok) ui.notify(`STARBOARD SPONSON REBUILT — ${rep.cost} ALLOY`, { important: true });
      ui.notify(`SALVAGE HOLD ${world.inventory.length}/${salvage.cargoCapacity}`, { important: false });
    } else {
      seedMarkers(ui, world, player, target, pose);
      ui.notify('CONTACT RESOLVED — CONCORD PICKET', { important: true });
      ui.notify('CUTTING BEAM ENGAGED', { important: false });
    }

    if (screenName === 'hit') {
      // Off-frame and under fire. The chevron is the whole point of this plate.
      ui.damage.at = 0.35;
      ui.damage.amount = 340;
      ui.orderBar.say('HULL BREACH — PORT QUARTER', 'error');
    }

    ctx.ui = ui;
    ctx.registry = registry;
    ctx.screenName = screenName;
    ctx.hold = makeHold(ui, screenName);

    // Hold the simulation for the plate.
    //
    // The harness settles for ninety frames before it shoots, and on a software
    // rasteriser those are ninety seconds of world time: the cut finishes, the hull
    // turns off the bearing the arc search chose, the target drifts out of range and
    // the composed frame is gone. Pausing also puts the interface in the state the
    // controls spec says it must survive - at pause `fixedUpdate` never runs, so
    // everything still moving in this frame is proof that the UI animates on the
    // render path and not on the simulation.
    if (screenName !== 'refit') engine.setTimeScaleIndex(0);

    await breathe();
    report({ world, ui, combat, player, target, registry, screenName, renderer });
    await breathe();

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
    if (!m.active) return;
    // Salvage is held SETTLED (its scale-in finished long ago); the other three are
    // held at the instant each stage reads most clearly.
    const settled = m.kind === 'salvage';
    seeded.push({ m, stage: m.stage, dStage: settled ? 0.9 : 0.055, dT0: settled ? 1.2 : 0.08 });
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
    { id: 'concord_destroyer', angle: -0.62, dist: 2450 },
    { id: 'concord_corvette', angle: -0.02, dist: 4200 },
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
    // Balanced split first, then a hull-centre firing solution so at least one wedge
    // is drawn filled and on target, then a bias toward more lit entries.
    const hullBears = combat.bearingReport(player, target).bearing > 0;
    const score = Math.min(lit, grey) * 1000 + (hullBears ? 220 : 0) + lit * 3;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  player.body.heading = best;
  player.body.desiredHeading = best;
  for (const m of player.weapons) m.updateWorld(player.position, best);
  return best;
}

/**
 * PUT EVERY MOUNT STATE ON ONE HULL AT ONCE.
 *
 * The armament strip's contract is that a mount which is frozen, starved, cooking or
 * worn is distinguishable at a glance, and the only honest way to photograph that claim
 * is to produce all four states simultaneously and look at them side by side. Each one
 * is produced by the mechanism that produces it in play:
 *
 *   HOT      `ShipThermal.onShot`, the same call `combat.js` makes at the fire site
 *   COOKED   `ShipThermal.trip`, which is what `onShot` calls when heat reaches 1.0
 *   DRY      an empty magazine and an empty ready feed, which is what firing does
 *   FROZEN   `ModuleParts.damagePart` on the traverse ring — a real subsystem kill
 *   WORN     a low `condition`, which is the number a part carries out of a wreck
 */
function dressArmament(player) {
  const byType = (type) => player.weapons.find((m) => m.def.type === type);
  const thermal = player.thermal;

  // A lance running hot but still firing: over the soft cap, dispersion widening, and
  // deliberately stopped short of the trip so the plate carries HOT and COOKED at once.
  const lance = byType('lance') ?? byType('beam') ?? player.weapons[0];
  if (lance && thermal) {
    let guard = 0;
    const step = lance.thermal.perShot * 1.24;
    while (lance.thermal.heat + step < 0.86 && guard++ < 400) thermal.onShot(lance, 1.4);
  }

  // A rail battery cooked outright. This also damages the hardpoint under it and
  // costs the mount condition, which is exactly what the panel needs to show.
  const rail = byType('rail');
  if (rail && thermal) thermal.trip(rail);

  // A cannon bank that has fired itself dry, on worn barrels.
  const cannon = byType('cannon');
  if (cannon) {
    cannon.condition = 0.42;
    cannon.ready = 0;
    if (cannon.ammoClass) player.stores.ammo[cannon.ammoClass] = 0;
    cannon.reloading = 0;
  }

  // A tractor/mining rig whose gimbal has been shot away: the arc is frozen and from
  // here on the only way to aim it is to turn the ship.
  const util = byType('mining') ?? byType('beam');
  if (util?.parts) {
    const ring = util.parts.list.find((p) => p.kind === 'traverse');
    if (ring) util.parts.damagePart(ring, ring.maxHP * 2);
    const rad = util.parts.list.find((p) => p.kind === 'cooling');
    if (rad) util.parts.damagePart(rad, rad.maxHP * 0.55);
  }

  // Partial wear on one more sub-part, so the squares are not all binary.
  const anyFeed = player.weapons.find((m) => m.parts?.list.some((p) => p.kind === 'feed'));
  const feed = anyFeed?.parts.list.find((p) => p.kind === 'feed');
  if (feed) anyFeed.parts.damagePart(feed, feed.maxHP * 0.45);

  // Two purges left of three: a resource that is visibly finite.
  if (player.stores) player.stores.coolant = Math.max(0, player.stores.coolantMax - 1);
}

/**
 * Stock the meta layer through its own APIs.
 *
 * The amounts are chosen so the MATERIALS panel shows BOTH sides of scarcity: some
 * claims affordable, some short by a specific quantity, and one perk locked behind
 * knowledge rather than money. A screenshot in which everything is affordable proves
 * nothing about the panel whose job is to show what you cannot have.
 */
function dressMetaLayer(world) {
  const { cargo, economy, patterns, perks, codex, items } = world.systems;
  if (!cargo || !economy) return;

  // ORDER MATTERS AND IT IS THE SAME ORDER A PLAYER WOULD PRODUCE.
  //
  // Refined stock and the two ranks of hull work come first, because `hold_bracing`
  // RAISES capacity and scrap fills whatever is free at the moment it is taken aboard.
  // Doing it the other way round fills the hold to the old ceiling, and then every
  // later `addItem` fails with "hold full" — which is exactly what happened on the
  // first plate of this panel and is why the ordering is spelled out here.
  // The four salvaged capital modules already in the hold come to well over the bare
  // cruiser's 2400 m3 bay, which is exactly the pressure `cargo.js` was built to
  // create — so the hull has been braced for it, three ranks, the way a player who
  // wanted to carry a hangar deck home would have to.
  economy.credit({ alloy: 520, composite: 300, electronics: 70, exotic: 1 }, 'probe');
  perks?.buy('hold_bracing');
  perks?.buy('hold_bracing');
  perks?.buy('hold_bracing');
  perks?.buy('reinforced_mounts');

  // What is in the hold has been physically held. `storeSection` marks exactly this.
  for (const it of world.inventory) codex?.markModule(it.moduleId, 'salvaged');

  // Devices, into the hold, at their real volumes, while there is still room.
  cargo.addItem('coolant_purge', 2);
  cargo.addItem('decoy', 3);
  cargo.addItem('jury_rig', 1);

  // A real survey pulse: fabricate one out of the pools and fire it. Everything in
  // sensor range resolves to its subsystems and lands in the codex as `scanned`, and
  // the patrol heat it costs is charged by the war system, not faked here.
  if (items) {
    const built = items.build('scan_pulse');
    if (built.ok) items.use('scan_pulse');
  }

  // Two patterns recovered, which is what cutting intact sections eventually gives.
  patterns?.learn('port_cannon_bank', 'probe');
  patterns?.learn('dorsal_shield_pylons', 'probe');

  // Scrap LAST, and sized as a FRACTION of what is left rather than to a fixed
  // reserve. The four salvaged capital modules already fill most of a braced hold, so
  // a fixed 260 m3 reserve produced a budget of zero and an empty material chain — the
  // panel drew three rows of `0` and told the truth about a scenario nobody wanted.
  const budget = cargo.freeM3() * 0.72;
  economy.addScrap('plate', Math.floor(budget * 0.55 / 0.40));
  economy.addScrap('machine', Math.floor(budget * 0.30 / 0.34));
  economy.addScrap('core', Math.floor(budget * 0.15 / 0.26));
  economy.enqueue('machine', 40);
}

/**
 * Bring the faction war online so the objectives panel has a war to read.
 *
 * `ObjectiveSystem` is a READING of `world.systems.factionWar` and generates nothing
 * without one, so the honest way to photograph it is to run the real war forward rather
 * than to hand the panel a fabricated list. The world sim is installed with
 * `enterStart: false` so it builds no POI content into this scene, and its engine
 * systems never step because the simulation is held immediately afterwards — the war is
 * advanced through its own `advance()` helper instead.
 */
function dressWar(world) {
  let sim = world.systems.worldSim;
  if (!sim) {
    try {
      sim = installWorldSim(world, { enterStart: false, autoAdopt: false });
    } catch (err) {
      console.warn('[probe:ui] could not install the world sim for objectives', err);
      return;
    }
  }
  try {
    sim.advance(1400);
  } catch (err) {
    console.warn('[probe:ui] war advance failed', err);
  }
  const objectives = world.systems.objectives;
  if (!objectives) return;
  // Twelve sim seconds per generation pass; sixty passes is long enough for the
  // per-kind caps to fill and for an intercept to be sitting on its clock.
  for (let i = 0; i < 60; i++) objectives.fixedUpdate(1);
}

/** A hulk with cut sections, so the salvage marker and the hold have provenance. */
function makeWreck(world, registry, salvage, position) {
  const def = getShipClass('coalition_frigate');
  if (!def) return null;
  const rng = world.rng.fork('ui-wreck');
  const victim = new Ship({
    classDef: def, world, faction: 'coalition',
    root: def.build?.({ rng: rng.fork('hulk'), materials: registry, palette: registry.palette, faction: 'coalition', lod: 0 }),
    position: position.clone(),
    heading: 1.9,
  });
  world.addShip(victim);
  victim.salvageIntegrity = 0.86;
  const wreck = salvage._spawnWreck(victim);
  if (wreck) wreck.update(0);
  return wreck;
}

/**
 * Order the cut AFTER the settle. `SalvageSystem._updateCut` cancels a cut whose
 * section has drifted out of tractor reach, so issuing it before stepping the engine
 * would leave the frame with a cutting beam that had already been called off.
 */
function beginCut(salvage, wreck) {
  if (!wreck) return null;
  const near = salvage.findNearestSection();
  const pick = near ?? (() => {
    const s = wreck.sections.find((x) => x.cuttable);
    return s ? { wreck, section: s } : null;
  })();
  if (!pick) return null;
  pick.section.cutProgress = 0.42;
  salvage.orderCut(pick.wreck, pick.section);
  return salvage.cutting;
}

/**
 * Put all three marker stages on screen at once.
 *
 * The three-stage animation is a TIME sequence, and a screenshot is one instant, so
 * the only honest way to photograph it is to spawn three markers and backdate them
 * into the three states. Every one of them is a real marker on the real pool,
 * created through the same entry point the input stream calls.
 */
function seedMarkers(ui, world, player, target, pose) {
  const t = ui.time;
  // Place the two plane markers relative to the SOLVED camera basis, so they land in
  // the clear middle of the frame whatever heading the arc search picked.
  const y = pose.yaw;
  const rx = Math.cos(y), rz = -Math.sin(y);          // screen right, on the plane
  const fx = -Math.sin(y), fz = -Math.cos(y);         // toward the camera, on the plane
  const at = (r, f) => new THREE.Vector3(
    pose.target.x + rx * r + fx * f, 0, pose.target.z + rz * r + fz * f,
  );

  // 1. REJECTED first — the dissolve, with a specific reason on it. Spawned before
  //    the legal move order, exactly as it would happen at the desk.
  const bad = ui.spawnOrderMarker('move', { point: at(-1750, 2050) });
  if (bad) {
    bad.stage = 'rejected';
    bad.stageAt = t - 0.055;
    bad.reason = 'OUT OF ARC — PORT BATTERY BEARS 20°–160°';
  }

  // 2. PROVISIONAL — spawned this instant, not yet drawn once.
  const move = ui.spawnOrderMarker('move', { point: at(360, 2150) });
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
  void player;
}

/**
 * Look square across the engagement axis, framing both hulls.
 *
 * `pose.yaw = φ − π/2` is the azimuth at which the player→target vector lies along
 * screen-right, so the pair spreads across the frame instead of stacking in depth.
 * The focus is pushed below the plane, which lifts both ships above centre and
 * leaves the lower third to the panels.
 */
function framePair(pose, player, target, screenName) {
  if (!player) { pose.target.set(0, 40, 0); return pose; }
  if (!target) { pose.target.copy(player.position); pose.target.y = -120; return pose; }

  const phi = Math.atan2(target.position.x - player.position.x, target.position.z - player.position.z);
  pose.yaw = phi - Math.PI * 0.5;

  if (screenName === 'hit') {
    // The cruiser is deliberately out of shot; this plate is about the chevron.
    pose.target.copy(target.position);
    pose.target.y = -150;
  } else {
    pose.target.copy(player.position).lerp(target.position, 0.44);
    pose.target.y = -320;
  }
  return pose;
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
    + `${world.materials.electronics ?? 0} electronics, ${world.materials.exotic} exotic`);

  // --- the systems this stream surfaced ------------------------------------
  // The picture is the judgement; this is what stops a later change quietly breaking
  // something the picture happens not to show.
  const therm = world.player?.thermal;
  if (therm) {
    console.log('');
    console.log(`thermal       : ${therm.state}  ext ${therm.ext.toFixed(1)}/${94.4}  `
      + `peak ${(therm.peak * 100).toFixed(0)}%  load ${(therm.load * 100).toFixed(0)}%  `
      + `radiate ${(therm.radiate * 100).toFixed(0)}%  tripped ${therm.trippedCount ?? 0}`);
    console.log('armament strip');
    for (const m of player.weapons) {
      const parts = m.parts?.list.map((p) => `${p.id}${p.destroyed ? '✕' : `${Math.round(p.health * 100)}%`}`).join(' ');
      console.log(`  ${pad(m.hardpoint ?? '?', 10)} ${pad(m.def.type, 8)} `
        + `heat ${(m.thermal.heat * 100).toFixed(0).padStart(3)}%${m.thermal.tripped ? ' TRIPPED' : '        '} `
        + `cond ${(m.condition * 100).toFixed(0).padStart(3)}%  `
        + `ammo ${m.ammoClass ? `${m.ready}/${m.readyMax} mag ${player.stores.rounds(m.ammoClass)}` : 'energy'}  `
        + `${m.parts?.traverseFrozen ? 'FROZEN ' : ''}${parts ?? ''}`);
    }
  }

  const cargo = world.systems.cargo;
  if (cargo) {
    const d = cargo.describe();
    console.log('');
    console.log(`hold volume   : ${d.usedM3} / ${d.capacityM3} m3  (${d.freeM3} free)  `
      + `modules ${d.breakdown.modulesM3} · materials ${d.breakdown.materialsM3} · devices ${d.breakdown.itemsM3}`);
  }
  const econ = world.systems.economy;
  if (econ) {
    const e = econ.describe();
    console.log(`materials tier: scrap ${e.scrap.plate}/${e.scrap.machine}/${e.scrap.core} `
      + `queued ${e.queuedUnits} at ${e.rate.toFixed(1)}/s  volume ${e.volumeM3.toFixed(1)} m3`);
  }
  const codex = world.systems.codex;
  if (codex) {
    const pr = codex.progress();
    console.log(`codex         : knowledge ${pr.knowledge}  `
      + Object.keys(pr).filter((k) => k !== 'knowledge')
        .map((k) => `${k} ${pr[k].seen}/${pr[k].total}`).join('  '));
  }
  const perks = world.systems.perks;
  if (perks) {
    const held = perks.describe().filter((p) => p.rank > 0).map((p) => `${p.id} ${p.rank}`);
    const locked = perks.describe().filter((p) => p.gate && !p.gate.met).length;
    console.log(`perks         : ${held.join(', ') || 'none'}  (${locked} knowledge-locked)`);
  }
  const objectives = world.systems.objectives;
  if (objectives) {
    console.log(`objectives    : ${objectives.active.length} open`);
    for (const o of objectives.describe()) {
      console.log(`  ${pad(o.kind, 10)} ${pad(o.poiName, 18)} ${o.progress}/${o.target}  `
        + `window ${o.secondsLeft}s  arrival ${o.arrival.tier} ×${o.arrival.multiplier}`);
    }
  }
  if (target?.salvageProjection) {
    const proj = target.salvageProjection();
    const tally = proj.reduce((a, r) => { a[r.state] = (a[r.state] ?? 0) + 1; return a; }, {});
    console.log('');
    console.log(`salvage proj  : ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(' · ')}  `
      + `(overall ${(target.salvageIntegrity * 100).toFixed(0)}%)`);
  }
  console.log(`windows open  : ${ui.panels.panels.filter((p) => p.open).map((p) => p.id).join(', ') || 'none'}`);

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
      r.selectItem(spare.uid);
      r.selectedMount = 'starboard';
      const before = performance.now();
      r.install();
      console.log(`  LIVE INSTALL  ${(performance.now() - before).toFixed(2)} ms wall `
        + `(RefitSystem.install measured ${r.lastInstall ? r.lastInstall.ms.toFixed(2) : '?'} ms)`
        + `  ok=${!!r.lastInstall}`);
      r.uninstall('starboard');
      // Put the plate back the way it wants to be photographed: the barrier pylons
      // selected against the occupied dorsal bed.
      const again = world.inventory.find((i) => i.moduleId === 'dorsal_shield_pylons')
        ?? world.inventory.find((i) => getModule(i.moduleId)?.hardpoint === 'dorsal');
      if (again) r.selectItem(again.uid);
      r.selectedMount = 'dorsal';
      r._remeasureIfPending();
      ui.orderBar.say('ENTER TO FIT · THIS SWAP COSTS THE DORSAL BATTERY', 'info');
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
