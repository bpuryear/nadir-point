/**
 * WORLD SIM PROBE — the faction war, run at speed and then looked at.
 *
 *   node tools/probe.mjs worldsim --out docs/probes/worldsim.png
 *
 * Two things have to be true for this stream to be finished, and this probe tests
 * both:
 *
 *   1. THE WAR RUNS WITHOUT THE PLAYER. Ninety minutes of world time are simulated
 *      with the player parked in empty space. Battles are scheduled, fought and
 *      resolved; control moves; the front line moves with it; wreckage accumulates
 *      where the fighting was. The console table below the render is that history.
 *
 *   2. A BATTLE THE PLAYER IS STANDING IN IS REAL. The player is then moved onto the
 *      hottest contested POI and a battle is forced. Real hulls spawn, real fleets
 *      form, the ship AI turns them broadside-on, and the salvage system makes real
 *      wrecks out of the losers. The cluster of contact ticks in the frame is those
 *      ships, at their true relative positions.
 *
 * WHAT THE FRAME IS
 * The system map as it would be drawn on the tactical overlay, in world space at
 * 1:13.3, over the live 3D backdrop. It is deliberately near-black with very few
 * bright things in it: control is a soft faction wash, heat is a ring of hard red
 * ticks, the front line is the one bone-white graphic in the frame, and an active
 * battle is a column of light standing off the plane. If you cannot tell who is
 * winning from six metres away, the overlay has failed.
 */

import * as THREE from 'three';
import { createMaterialRegistry } from '../art/materials/index.js';
import { NEUTRAL, getFactionPalette, getPOIPalette, mix } from '../art/palette.js';
import { buildCelestials } from '../world/celestials/index.js';
import { buildPOILighting } from '../world/lighting/poi.js';
import { CombatSystem } from '../sim/combat.js';
import { SalvageSystem } from '../sim/salvage.js';
import { Ship } from '../sim/ship.js';
import { installWorldSim } from '../world/index.js';
import { legProfile, TRANSIT } from '../world/travel.js';
import { usingFallbackRoster } from '../sim/ai/roster.js';
import { effectiveRange } from '../sim/ai/shipAI.js';
import { KM } from '../core/units.js';
import { angleDelta, yawOf } from '../sim/physics.js';
import { registerPlayerCruiser, applyClassHandling } from '../camera/feel.js';

/** World metres per map unit is 1/MAP_SCALE. 1640 km of system inside 123 km of map. */
const MAP_SCALE = 0.075;
/** Live ships are drawn around their POI at this extra magnification, so a 15 km
 *  engagement resolves into individual contacts instead of one dot. */
const CONTACT_INSET = 16;

/**
 * The backdrop is the GRAVEYARD rig, not the gas giant, and that is a composition
 * decision rather than a convenience: a planet filling a third of the frame is
 * gorgeous and it sits directly behind the overlay, where it destroys exactly the
 * value separation the overlay needs. The graveyard is a pinprick sun, a dense
 * starfield and a vignette that crushes the corners - which leaves the map as the
 * only bright thing in the frame, which is the point.
 */
const POI_ID = 'graveyard';
const PAL = getPOIPalette(POI_ID);
const COALITION = getFactionPalette('coalition');
const CONCORD = getFactionPalette('concord');
/** Cold neutral for structure lines. The POI accent is green here and a green grid
 *  competes with the faction hues that are carrying the actual information. */
const STRUCTURE = NEUTRAL.ice;

// ---------------------------------------------------------------------------
// Geometry helpers. Everything in the overlay is a hard-edged quad or a low-poly
// solid; nothing here is a line primitive, because a line has no width in world
// space and this map is looked at from 125 km away.
// ---------------------------------------------------------------------------

/** Accumulates flat quads into one buffer. One mesh, one draw call. */
class QuadSheet {
  constructor() { this.pos = []; this.col = []; }

  /** A flat quad from (ax,az) to (bx,bz), `width` across, at height y. */
  segment(ax, az, bx, bz, width, y, shade = 1, shadeB = null) {
    let dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    dx /= len; dz /= len;
    const nx = -dz * width * 0.5;
    const nz = dx * width * 0.5;
    const s2 = shadeB ?? shade;
    const p = this.pos, c = this.col;
    const v = [
      ax - nx, y, az - nz, shade,
      ax + nx, y, az + nz, shade,
      bx + nx, y, bz + nz, s2,
      ax - nx, y, az - nz, shade,
      bx + nx, y, bz + nz, s2,
      bx - nx, y, bz - nz, s2,
    ];
    for (let i = 0; i < v.length; i += 4) {
      p.push(v[i], v[i + 1], v[i + 2]);
      c.push(v[i + 3], v[i + 3], v[i + 3]);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }

  get empty() { return this.pos.length === 0; }
}

/** Glyph per POI kind. Hard-edged, low poly, readable as a shape at four pixels. */
function glyphGeometry(kind, r) {
  switch (kind) {
    case 'station': return new THREE.OctahedronGeometry(r, 0);
    case 'yard': return new THREE.BoxGeometry(r * 1.35, r * 0.34, r * 1.35);
    case 'belt': return new THREE.TorusGeometry(r * 0.92, r * 0.20, 3, 12).rotateX(Math.PI * 0.5);
    case 'graveyard': return new THREE.TetrahedronGeometry(r * 1.25, 0);
    case 'giant': return new THREE.IcosahedronGeometry(r * 1.05, 0);
    case 'star': return new THREE.OctahedronGeometry(r * 1.3, 1);
    default: return new THREE.OctahedronGeometry(r, 0);
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function place(mesh, i, x, y, z, scale, ry = 0) {
  _p.set(x, y, z);
  _q.setFromAxisAngle(UP, ry);
  _s.set(scale, scale, scale);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

// ---------------------------------------------------------------------------

export default {
  name: 'World sim — system map, faction war and a live battle',
  /**
   * Yaw 2.47 faces the graveyard's nebula, which then bleeds into the top edge of the
   * frame instead of sitting behind the map. Pitch 0.44 is low enough that the plane
   * recedes and 1600 km of system reads as depth rather than as a floor plan, and high
   * enough that fourteen markers do not stack on top of each other. Distance is not
   * authored - `fitPose` solves it from the actual extent of the POI cloud, so the
   * frame stays correct if the table is ever re-authored.
   */
  camera: {
    distance: 132000,
    pitch: 0.52,
    yaw: 2.47,
    target: new THREE.Vector3(0, 0, 0),
  },

  async setup(ctx) {
    const { world, engine, renderer, scene, far } = ctx;

    /**
     * Hand the event loop back periodically.
     *
     * This probe simulates about two hours of world time before it draws anything,
     * which is well over a minute of solid synchronous work. A main thread blocked
     * that long is a main thread the browser and the screenshot harness both consider
     * dead - the page stops answering, the boot poll cannot run, and the run is torn
     * down mid-setup. Yielding every few thousand steps costs nothing and keeps the
     * page alive and answering the whole way through.
     */
    const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

    // A 123 km map seen from 126 km needs a near plane that is not 2 metres, or the
    // depth buffer cannot separate two layers of the overlay a kilometre apart.
    world.camera.near = 900;
    world.camera.updateProjectionMatrix();

    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('probe:worldsim'),
      poi: POI_ID,
    });
    world.register('materials', registry);
    world.register('palette', registry.palette);
    ctx.registry = registry;

    scene.background = null;
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);

    // ---- backdrop --------------------------------------------------------
    const sky = buildCelestials(POI_ID, { rng: world.rng.fork('probe-sky'), far });
    const rig = buildPOILighting(POI_ID, {
      rng: world.rng.fork('probe-rig'), materials: registry, palette: registry.palette,
      faction: 'player', lod: 0,
    }, world, { fog: false, shadows: false, trackCamera: false });
    engine.addRender({ name: 'probe-sky', order: 60, update: () => sky.update(renderer.farCamera) });

    // ---- the sim ---------------------------------------------------------
    const playerClass = probePlayerClass();
    const player = new Ship({ classDef: playerClass, world, faction: 'player', isPlayer: true });
    applyClassHandling(player.body, playerClass);
    world.player = player;
    world.addShip(player);

    const combat = new CombatSystem(world);
    const salvage = new SalvageSystem(world);
    world.register('combat', combat);
    world.register('salvage', salvage);
    engine.add(combat);
    engine.add(salvage);
    engine.add({
      name: 'ships', order: 60,
      fixedUpdate: (dt) => { for (const s of world.ships) s.fixedUpdate(dt); world.time += dt; },
    });

    const ws = installWorldSim(world, { enterStart: false });
    const { war, system, travel, discovery } = ws;

    // ---- phase 1: ninety minutes with nobody watching --------------------
    let started = 0, resolved = 0, live = 0;
    world.bus.on('world:battle-started', (b) => { started++; if (b.live) live++; });
    world.bus.on('world:battle-resolved', () => { resolved++; });

    // Park the player between the stars so every battle resolves abstractly.
    player.body.position.set(0, 0, 1_400_000);
    const WATCHED = 5400;
    for (let t = 0; t < WATCHED; t += 0.5) {
      war.fixedUpdate(0.5);
      if (t % 240 < 0.5) await breathe();
    }

    const unwatched = { started, resolved };
    console.log(`[worldsim] ${WATCHED}s unobserved: ${started} battles started, ${resolved} resolved`);

    // ---- phase 2: a battle the player is standing in ---------------------
    const host = pickHostPOI(war, system);
    player.body.position.copy(host.node.position);
    player.body.heading = 0;

    const battle = forceBattle(war, host.state);
    const beforeShips = world.ships.length;
    let spawnedAt = -1;
    let spawnedCount = 0;

    // Instrument the arc system while the battle runs. This is the number that says
    // whether the ship AI is actually fighting the game it is in: a frigate whose guns
    // are on its flanks should be holding its target somewhere near the beam, and
    // should have something bearing most of the time.
    const arcs = new ArcMeter(combat);

    for (let i = 0; i < 60 * 95; i++) {
      engine.stepOnce();
      if (i % 900 === 0) await breathe();
      if (spawnedAt < 0 && world.ships.length > beforeShips) {
        spawnedAt = engine.simTime;
        spawnedCount = world.ships.length - beforeShips;
      }
      if (i % 45 === 0) arcs.sample(world);
      if (battle.phase === 'resolved') break;
    }

    const liveReport = {
      spawned: spawnedCount,
      spawnedAt: +spawnedAt.toFixed(1),
      phase: battle.phase,
      winner: battle.winner,
      wrecks: world.wrecks.length,
      shipsLeft: world.ships.filter((s) => !s.isPlayer && !s.dead).length,
      arcs: null,
    };

    // A second engagement, left running, so the frame has a live one in it.
    const host2 = pickHostPOI(war, system, host.node.id);
    if (host2) {
      player.body.position.copy(host2.node.position);
      forceBattle(war, host2.state);
      for (let i = 0; i < 60 * 38; i++) {
        engine.stepOnce();
        if (i % 45 === 0) arcs.sample(world);
        if (i % 900 === 0) await breathe();
      }
    }

    // Hide the real hulls: at 1:13.3 a 480 m destroyer is 36 units and would render
    // as a sub-pixel speck. The overlay draws them as contacts instead.
    for (const s of world.ships) if (s.root) s.root.visible = false;
    for (const w of world.wrecks) if (w.root) w.root.visible = false;

    // ---- discovery + a plotted course ------------------------------------
    discovery.reveal(host.node.id, 'intel');
    if (host2) discovery.reveal(host2.node.id, 'intel');
    for (const n of system.nodes.slice(0, 7)) discovery.reveal(n.id, 'intel');

    // Enough in the tank that the flagship course on the overlay is a legal one; the
    // reserve rejection path is exercised in the console table above.
    world.propellant.current = 1200;
    world.propellant.max = 1200;
    const destination = farthestKnown(system, discovery, player.position);
    const course = destination ? travel.plotTo(destination.id) : null;

    // ---- the overlay -----------------------------------------------------
    const overlay = buildOverlay({ world, registry, system, war, discovery, course, player });
    scene.add(overlay.root);
    ctx.overlay = overlay;

    fitPose(ctx.pose, system, world.camera);

    // ---- the report ------------------------------------------------------
    liveReport.arcs = arcs.result();
    const summary = report({ war, system, travel, discovery, unwatched, liveReport, host, host2, course });
    const label = typeof document !== 'undefined' ? document.getElementById('label') : null;
    if (label) label.innerText = summary;

    engine.addRender({
      name: 'worldsim-overlay', order: 70,
      update: () => overlay.refresh(),
    });

    ctx.dispose = () => { overlay.dispose(); sky.dispose(); rig.dispose(); registry.dispose(); };
  },
};

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------

function buildOverlay({ world, registry, system, war, discovery, course, player }) {
  const root = new THREE.Group();
  root.name = 'system-map';
  const M = MAP_SCALE;
  const mapX = (x) => x * M;
  const mapZ = (z) => z * M;

  const snapshot = war.snapshot();
  const nodes = system.nodes;

  // --- focus: the geometric centre of the POI cloud, which is what the grid is
  //     laid out around and what `fitPose` frames.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const node of nodes) {
    const x = mapX(node.position.x), z = mapZ(node.position.z);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const focus = new THREE.Vector3((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);

  const disposables = [];
  const keep = (g) => { disposables.push(g); return g; };

  // =========================================================================
  // 1. The plane grid. 50 km cells, one hairline, fading out toward the edge so
  //    the map has a horizon instead of a rectangle.
  // =========================================================================
  {
    const cell = 50 * KM * M;
    // Sized from the actual POI cloud, not from a hand-picked count: a grid that
    // stops short of the markers turns a map into a scatter of dots.
    const half = Math.ceil((Math.max(maxX - minX, maxZ - minZ) * 0.62) / cell) + 2;
    const extent = half * cell;
    const sheet = new QuadSheet();
    const fade = (d) => Math.max(0, 1 - Math.pow(d / extent, 1.25));
    for (let i = -half; i <= half; i++) {
      const o = i * cell;
      const major = i % 4 === 0;
      const w = major ? 210 : 105;
      const k = major ? 1.0 : 0.5;
      const steps = 16;
      for (let s = 0; s < steps; s++) {
        const a = -extent + (2 * extent * s) / steps;
        const b = -extent + (2 * extent * (s + 1)) / steps;
        sheet.segment(focus.x + a, focus.z + o, focus.x + b, focus.z + o, w, 0,
          k * fade(Math.hypot(a, o)), k * fade(Math.hypot(b, o)));
        sheet.segment(focus.x + o, focus.z + a, focus.x + o, focus.z + b, w, 0,
          k * fade(Math.hypot(o, a)), k * fade(Math.hypot(o, b)));
      }
    }
    const mat = registry.get('emissive', {
      faction: 'player', color: STRUCTURE, intensity: 0.20, vertexColors: true,
    });
    const mesh = new THREE.Mesh(keep(sheet.build()), mat);
    mesh.name = 'map-grid';
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  // =========================================================================
  // 1b. The adjacency lattice. This is the graph the faction war actually pushes
  //     along, and drawing it is what turns fourteen scattered markers into a
  //     structure you can read a front line across.
  // =========================================================================
  {
    const sheet = new QuadSheet();
    for (const link of system.links()) {
      const ax = mapX(link.a.position.x), az = mapZ(link.a.position.z);
      const bx = mapX(link.b.position.x), bz = mapZ(link.b.position.z);
      // Bright at the ends, dark in the middle: it reads as a relationship rather
      // than as another grid line.
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const k = (t) => 0.25 + 0.75 * Math.abs(t - 0.5) * 2;
        sheet.segment(ax + (bx - ax) * t0, az + (bz - az) * t0,
          ax + (bx - ax) * t1, az + (bz - az) * t1, 120, 60, k(t0) * 0.6, k(t1) * 0.6);
      }
    }
    const mat = registry.get('emissive', {
      faction: 'player', color: STRUCTURE, intensity: 0.45, vertexColors: true,
    });
    const mesh = new THREE.Mesh(keep(sheet.build()), mat);
    mesh.name = 'map-links';
    mesh.renderOrder = 2;
    root.add(mesh);
  }

  // =========================================================================
  // 2. Faction control. A soft additive wash, alpha = |control|. This is the only
  //    soft-edged thing in the overlay and it is the only one that should be.
  // =========================================================================
  // ONE MESH PER FACTION, not one mesh with per-instance hues: `instanceColor`
  // MULTIPLIES the material's own colour, so a Concord-cyan instance on an
  // amber-tinted material comes out black. Two draw calls, correct colour.
  for (const [faction, hex] of [['coalition', COALITION.emissive], ['concord', CONCORD.emissive]]) {
    const geo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI * 0.5));
    const mat = registry.get('engineGlow', { faction, color: hex, intensity: 0.22, instanced: true });
    const mesh = new THREE.InstancedMesh(geo, mat, nodes.length);
    mesh.name = `map-control:${faction}`;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    let n = 0;
    for (const node of nodes) {
      const st = war.states.get(node.id);
      const mine = faction === 'coalition' ? st.control >= 0 : st.control < 0;
      if (!mine) continue;
      const size = (95 * KM + node.value * 115 * KM) * M;
      place(mesh, n, mapX(node.position.x), 260, mapZ(node.position.z), size);
      mesh.setColorAt(n, _c.setRGB(1, 1, 1).multiplyScalar(0.16 + Math.min(1, Math.abs(st.control)) * 1.0));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    root.add(mesh);
  }

  // =========================================================================
  // 3. Patrol heat. A ring of hard ticks, count and length proportional to heat.
  //    Deliberately not a second glow: the frame can afford exactly one soft layer.
  // =========================================================================
  const TICKS = 16;
  const heatMesh = (() => {
    const geo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI * 0.5));
    const mat = registry.get('emissive', {
      faction: 'coalition', color: COALITION.warn, intensity: 1.5, instanced: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, nodes.length * TICKS);
    mesh.name = 'map-heat';
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  })();

  // =========================================================================
  // 4. The front line. One bone-white polyline where control crosses zero. It is
  //    the brightest graphic in the frame on purpose - it is the only thing that
  //    answers "who is winning" without being read.
  // =========================================================================
  const frontHolder = new THREE.Group();
  root.add(frontHolder);
  let frontMesh = null;
  const frontMat = registry.get('emissive', {
    faction: 'player', color: NEUTRAL.select, intensity: 1.75,
  });
  const rebuildFront = () => {
    const segs = war.frontLine();
    const sheet = new QuadSheet();
    // Clipped to the neighbourhood of the POI cloud. The control field is defined
    // everywhere, so the raw contour runs out to the padded bounds and draws a dead
    // straight line along the edge of the map that reads as an artefact.
    const CLIP = 240 * KM;
    for (let i = 0; i + 1 < segs.length; i += 2) {
      const midX = (segs[i].x + segs[i + 1].x) * 0.5;
      const midZ = (segs[i].y + segs[i + 1].y) * 0.5;
      const d = system.nearest(midX, midZ).distance;
      if (d > CLIP) continue;
      // Fade the contour out as it leaves the fought-over space, so the line ends by
      // dissolving into black rather than by being chopped off mid-stroke.
      const k = Math.max(0.04, 1 - Math.pow(d / CLIP, 1.4));
      sheet.segment(mapX(segs[i].x), mapZ(segs[i].y), mapX(segs[i + 1].x), mapZ(segs[i + 1].y), 265, 1400, k);
    }
    if (sheet.empty) return;
    if (frontMesh) { frontHolder.remove(frontMesh); frontMesh.geometry.dispose(); }
    frontMesh = new THREE.Mesh(sheet.build(), frontMat);
    frontMesh.name = 'map-front';
    frontMesh.renderOrder = 6;
    frontHolder.add(frontMesh);
  };
  rebuildFront();

  // =========================================================================
  // 5. POI markers. A metal glyph floating above the plane at a height set by the
  //    place's strategic value, a stalk down to a footprint tick, and an emissive
  //    outline in the controlling faction's colour. The stalks are what give a
  //    plane-locked map any verticality at all, and the height ordering is a
  //    hierarchy you read before you read anything else.
  // =========================================================================
  const markerHeight = (node) => (10 * KM + node.value * 26 * KM) * M;

  {
    const stalk = new QuadSheet();
    for (const node of nodes) {
      const x = mapX(node.position.x);
      const z = mapZ(node.position.z);
      const h = markerHeight(node);
      // Two crossed vertical ribbons so the stalk reads from any azimuth.
      const w = 130;
      const push = (ox, oz) => {
        stalk.pos.push(x - ox, 0, z - oz, x + ox, 0, z + oz, x + ox, h, z + oz);
        stalk.pos.push(x - ox, 0, z - oz, x + ox, h, z + oz, x - ox, h, z - oz);
        for (let i = 0; i < 3; i++) stalk.col.push(0.10, 0.10, 0.10);
        for (let i = 0; i < 3; i++) stalk.col.push(0.9, 0.9, 0.9);
      };
      push(w, 0);
      push(0, w);
    }
    const mat = registry.get('emissive', {
      faction: 'player', color: STRUCTURE, intensity: 0.75, vertexColors: true,
    });
    const mesh = new THREE.Mesh(keep(stalk.build()), mat);
    mesh.name = 'map-stalks';
    mesh.renderOrder = 5;
    root.add(mesh);
  }

  // footprint ticks on the plane
  {
    const sheet = new QuadSheet();
    for (const node of nodes) {
      const x = mapX(node.position.x);
      const z = mapZ(node.position.z);
      const r = 620;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI * 0.25;
        sheet.segment(x + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5,
          x + Math.cos(a) * r, z + Math.sin(a) * r, 90, 30, 1);
      }
    }
    const mat = registry.get('emissive', {
      faction: 'player', color: STRUCTURE, intensity: 0.85, vertexColors: true,
    });
    const mesh = new THREE.Mesh(keep(sheet.build()), mat);
    mesh.renderOrder = 4;
    root.add(mesh);
  }

  // emissive glyphs, one instanced mesh per kind
  const glyphMeshes = [];
  {
    const byKind = new Map();
    for (const node of nodes) {
      if (!byKind.has(node.kind)) byKind.set(node.kind, []);
      byKind.get(node.kind).push(node);
    }
    const mat = registry.get('emissive', {
      faction: 'player', color: NEUTRAL.select, intensity: 1.25, instanced: true,
    });
    for (const [kind, list] of byKind) {
      const geo = keep(glyphGeometry(kind, 1450));
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = `map-glyph:${kind}`;
      mesh.renderOrder = 7;
      mesh.frustumCulled = false;
      mesh.userData.nodes = list;
      glyphMeshes.push(mesh);
      root.add(mesh);
    }
  }

  // =========================================================================
  // 6. Battles: a column of light standing off the plane, and a ring on it.
  // =========================================================================
  const columnMesh = (() => {
    const geo = keep(new THREE.PlaneGeometry(1, 1));
    const mat = registry.get('engineGlow', {
      faction: 'coalition', color: COALITION.warn, intensity: 1.9, instanced: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, nodes.length * 2);
    mesh.name = 'map-battle-columns';
    mesh.renderOrder = 9;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  })();

  const ringMesh = (() => {
    const geo = keep(new THREE.TorusGeometry(1, 0.045, 3, 28).rotateX(-Math.PI * 0.5));
    const mat = registry.get('emissive', {
      faction: 'coalition', color: COALITION.warn, intensity: 2.1, instanced: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, nodes.length);
    mesh.name = 'map-battle-rings';
    mesh.renderOrder = 8;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  })();

  // =========================================================================
  // 7. Live contacts. Every real hull in the world, drawn around its POI at extra
  //    magnification so an engagement resolves into individual ships.
  // =========================================================================
  const CONTACT_CAP = 48;
  const contactMesh = (() => {
    const geo = keep(new THREE.ConeGeometry(240, 820, 3).rotateX(Math.PI * 0.5));
    const mat = registry.get('emissive', {
      faction: 'player', color: NEUTRAL.select, intensity: 2.4, instanced: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, CONTACT_CAP);
    mesh.name = 'map-contacts';
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  })();

  // =========================================================================
  // 8. The player, and the plotted course.
  // =========================================================================
  {
    const sheet = new QuadSheet();
    if (course?.legs?.length) {
      for (const leg of course.legs) {
        const ax = mapX(leg.from.x), az = mapZ(leg.from.z);
        const bx = mapX(leg.to.x), bz = mapZ(leg.to.z);
        const dashes = 26;
        for (let i = 0; i < dashes; i++) {
          const t0 = i / dashes;
          const t1 = t0 + 0.58 / dashes;
          sheet.segment(ax + (bx - ax) * t0, az + (bz - az) * t0,
            ax + (bx - ax) * t1, az + (bz - az) * t1, 210, 900, 1);
        }
      }
    }
    if (!sheet.empty) {
      const mat = registry.get('emissive', {
        faction: 'player', color: NEUTRAL.salvage, intensity: 1.5, vertexColors: true,
      });
      const mesh = new THREE.Mesh(keep(sheet.build()), mat);
      mesh.name = 'map-course';
      mesh.renderOrder = 11;
      root.add(mesh);
    }
  }

  const playerMesh = (() => {
    const geo = keep(new THREE.ConeGeometry(700, 2200, 3).rotateX(Math.PI * 0.5));
    const mat = registry.get('emissive', { faction: 'player', color: NEUTRAL.friendly, intensity: 2.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'map-player';
    mesh.renderOrder = 12;
    root.add(mesh);
    return mesh;
  })();

  // =========================================================================
  // Per-frame refresh: heat, battles, contacts and the player marker. Everything
  // else is static geometry that only the simulation changes.
  // =========================================================================
  function refresh() {
    // Patrol heat: ticks spread evenly all the way round, so the ring reads as a
    // DENSITY rather than as an arc that happens to start at three o'clock.
    let ti = 0;
    for (const node of nodes) {
      const st = war.states.get(node.id);
      const x = mapX(node.position.x);
      const z = mapZ(node.position.z);
      const shown = Math.max(1, Math.round(st.heat * TICKS));
      const r0 = 3100;
      for (let k = 0; k < shown; k++) {
        const a = (k / shown) * Math.PI * 2;
        const len = 900 + st.heat * 1900;
        _p.set(x + Math.cos(a) * (r0 + len * 0.5), 120, z + Math.sin(a) * (r0 + len * 0.5));
        _q.setFromAxisAngle(UP, -a);
        _s.set(len, 1, 190);
        _m.compose(_p, _q, _s);
        heatMesh.setMatrixAt(ti, _m);
        heatMesh.setColorAt(ti, _c.setRGB(1, 1, 1).multiplyScalar(0.25 + st.heat * 0.75));
        ti++;
      }
    }
    heatMesh.count = ti;
    heatMesh.instanceMatrix.needsUpdate = true;
    if (heatMesh.instanceColor) heatMesh.instanceColor.needsUpdate = true;

    // battles
    let bi = 0;
    let ri = 0;
    for (const b of war.battles) {
      const node = b.node;
      const x = mapX(node.position.x);
      const z = mapZ(node.position.z);
      const pending = b.phase === 'pending';
      const h = pending ? 5200 : 13500;
      const w = pending ? 900 : 1700;
      // two crossed billboards so the column reads from any azimuth
      for (let k = 0; k < 2; k++) {
        _p.set(x, h * 0.5, z);
        _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * Math.PI * 0.5);
        _s.set(w, h, 1);
        _m.compose(_p, _q, _s);
        columnMesh.setMatrixAt(bi, _m);
        columnMesh.setColorAt(bi, _c.setRGB(1, 1, 1).multiplyScalar(pending ? 0.35 : 1));
        bi++;
      }
      if (!pending) {
        place(ringMesh, ri, x, 200, z, (30 * KM) * M);
        ringMesh.setColorAt(ri, _c.setRGB(1, 1, 1));
        ri++;
      }
    }
    columnMesh.count = bi;
    columnMesh.instanceMatrix.needsUpdate = true;
    if (columnMesh.instanceColor) columnMesh.instanceColor.needsUpdate = true;
    ringMesh.count = ri;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;

    // contacts
    let ci = 0;
    for (const ship of world.ships) {
      if (ship.isPlayer || ship.dead || ci >= CONTACT_CAP) continue;
      const near = system.nearest(ship.position.x, ship.position.z);
      const anchor = near.node.position;
      const x = mapX(anchor.x) + (ship.position.x - anchor.x) * MAP_SCALE * CONTACT_INSET;
      const z = mapZ(anchor.z) + (ship.position.z - anchor.z) * MAP_SCALE * CONTACT_INSET;
      place(contactMesh, ci, x, 2600, z, 1, ship.heading);
      const hex = ship.faction === 'coalition' ? COALITION.emissive : CONCORD.emissive;
      _c.setHex(hex, THREE.SRGBColorSpace);
      const hp = ship.maxHullHP > 0 ? ship.hullHP / ship.maxHullHP : 1;
      contactMesh.setColorAt(ci, _c.multiplyScalar(0.5 + hp * 0.9));
      ci++;
    }
    contactMesh.count = ci;
    contactMesh.instanceMatrix.needsUpdate = true;
    if (contactMesh.instanceColor) contactMesh.instanceColor.needsUpdate = true;

    // glyphs follow control colour
    for (const mesh of glyphMeshes) {
      const list = mesh.userData.nodes;
      for (let i = 0; i < list.length; i++) {
        const st = war.states.get(list[i].id);
        place(mesh, i, mapX(list[i].position.x), markerHeight(list[i]), mapZ(list[i].position.z), 1, i * 1.1);
        const hex = st.control >= 0 ? COALITION.emissive : CONCORD.emissive;
        _c.setHex(hex, THREE.SRGBColorSpace);
        const known = discovery.isKnown(list[i].id);
        contrast(_c, known ? 1 : 0.28);
        mesh.setColorAt(i, _c);
      }
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    playerMesh.position.set(mapX(player.position.x), 3400, mapZ(player.position.z));
    playerMesh.rotation.y = player.heading;
  }

  refresh();

  return {
    root, focus, refresh,
    dispose() {
      for (const g of disposables) g.dispose();
      root.clear();
    },
  };
}

function contrast(color, k) {
  color.multiplyScalar(k);
}

// ---------------------------------------------------------------------------
// Sim scaffolding
// ---------------------------------------------------------------------------

/**
 * Solve the camera distance and focus from the real extent of the map.
 *
 * The map is a flat sheet seen obliquely, so its screen extent is NOT its bounding
 * sphere: across the camera's right axis it is full size, and along the in-plane
 * forward axis it foreshortens by sin(pitch). Fitting the sphere would push the camera
 * two hundred kilometres back and throw the far edge of the system through the far
 * plane. Fitting the two axes separately puts all fourteen markers in frame at the
 * closest distance that works.
 *
 * The result is then slid to the right so the readout column sits over black.
 */
function fitPose(pose, system, camera) {
  const rx = Math.cos(pose.yaw), rz = -Math.sin(pose.yaw);   // camera right, on the plane
  const fx = -Math.sin(pose.yaw), fz = -Math.cos(pose.yaw);  // camera forward, on the plane

  let minR = Infinity, maxR = -Infinity, minF = Infinity, maxF = -Infinity;
  for (const node of system.nodes) {
    const x = node.position.x * MAP_SCALE;
    const z = node.position.z * MAP_SCALE;
    const r = x * rx + z * rz;
    const f = x * fx + z * fz;
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (f < minF) minF = f; if (f > maxF) maxF = f;
  }
  const cR = (minR + maxR) * 0.5;
  const cF = (minF + maxF) * 0.5;
  // Fit the MARKERS, not the points. A POI is a glyph plus a control wash plus a heat
  // ring; fitting the bare coordinate clips the two outermost every time.
  const MARKER = 9000;
  const halfR = (maxR - minR) * 0.5 + MARKER;
  const halfF = (maxF - minF) * 0.5 + MARKER;

  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * (camera.aspect || 16 / 9);
  const MARGIN = 1.30;
  const distance = Math.max(halfR / tanH, (halfF * Math.sin(pose.pitch)) / tanV) * MARGIN;

  // Push the map right of centre by 14% of the visible width.
  const shift = 2 * distance * tanH * 0.05;
  const R = cR - shift;

  pose.distance = distance;
  pose.target.set(R * rx + cF * fx, 0, R * rz + cF * fz);
  return pose;
}

/**
 * Measures whether the ship AI is using the arc system.
 *
 * `broadside` is the share of samples where a hull is holding its target between 57
 * and 123 degrees off its own nose - i.e. somewhere near the beam, where a flank
 * battery bears. `bearing` is the share where at least one commandable mount can
 * actually fire. If either number is low the AI is driving at things nose-first and
 * the whole spatial layer of the game is decorative.
 */
class ArcMeter {
  constructor(combat) {
    this.combat = combat;
    this.samples = 0;
    this.capSamples = 0;
    this.broadside = 0;
    this.bearing = 0;
    this.relSum = 0;
    this.tracked = 0;
    this.states = Object.create(null);
  }

  sample(world) {
    for (const s of world.ships) {
      if (s.isPlayer || s.dead || !s.ai) continue;
      this.states[s.ai.state] = (this.states[s.ai.state] ?? 0) + 1;
      const t = s.target;
      if (!t || t.dead) continue;
      this.tracked++;
      // Only count a hull that is actually in a position to shoot. Including the run-in
      // would measure how long the approach takes, not whether the AI understands its
      // own arcs, and the two answers are not the same question.
      const reach = effectiveRange(s);
      if (reach <= 0 || t.position.distanceTo(s.position) > reach * 1.05) continue;
      const rel = Math.abs(angleDelta(s.heading, yawOf(t.position.x - s.position.x, t.position.z - s.position.z)));
      this.samples++;
      this.relSum += rel;
      // The beam test only applies to hulls whose guns are ON the beam. A corvette
      // has one bow arc; pointing at the target is the right answer for it, and
      // counting that as a failure would be measuring the wrong thing.
      const role = s.classDef?.role;
      if (role === 'frigate' || role === 'destroyer' || role === 'cruiser') {
        this.capSamples++;
        if (rel > 1.0 && rel < 2.15) this.broadside++;
      }
      if (this.combat.bearingReport(s, t).bearing > 0) this.bearing++;
    }
  }

  result() {
    const n = Math.max(1, this.samples);
    return {
      samples: this.samples,
      inRangePct: Math.round((100 * this.samples) / Math.max(1, this.tracked)),
      broadsidePct: Math.round((100 * this.broadside) / Math.max(1, this.capSamples)),
      bearingPct: Math.round((100 * this.bearing) / n),
      meanRelDeg: Math.round(((this.relSum / n) * 180) / Math.PI),
      states: this.states,
    };
  }
}

/**
 * The registered player class. Was a local literal carrying 620000/180/6.0/0.085; the
 * broadside- and bearing-percentage numbers this probe publishes were therefore
 * measured on a hull with a 180 m/s ceiling the game's own player never had.
 */
function probePlayerClass() {
  return registerPlayerCruiser({
    root: new THREE.Group(),
    hullHP: 26000,
    subsystems: [
      { id: 'engine_main', kind: 'engine', hp: 3000, position: [0, 0, -560], radius: 150, salvageValue: 0.2, label: 'Main Drive' },
      { id: 'reactor', kind: 'reactor', hp: 4200, position: [0, 0, -60], radius: 130, salvageValue: 0.3, label: 'Reactor' },
    ],
  });
}

/** The hottest genuinely contested POI: the best place to stand to see a war. */
function pickHostPOI(war, system, exclude = null) {
  let best = null;
  let bestScore = -Infinity;
  for (const st of war.states.values()) {
    if (st.id === exclude) continue;
    const balance = 1 - Math.abs(st.control);
    const score = balance * 2 + st.heat + st.node.value;
    if (score > bestScore) { bestScore = score; best = st; }
  }
  return best ? { state: best, node: best.node } : null;
}

function forceBattle(war, st) {
  st.battle = null;
  st.battleCooldown = 0;
  st.garrison.coalition = Math.max(st.garrison.coalition, 2200);
  st.garrison.concord = Math.max(st.garrison.concord, 2200);
  const b = war._schedule(st);
  b.startsAt = war.time + 0.5;
  b.duration = 150;
  return b;
}

function farthestKnown(system, discovery, from) {
  let best = null;
  let bestD = -1;
  for (const node of system.nodes) {
    if (!discovery.isKnown(node.id)) continue;
    const d = node.position.distanceTo(from);
    if (d > bestD) { bestD = d; best = node; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The console report. This is how the simulation is judged; the render is how the
// overlay is judged. Both are required and neither substitutes for the other.
// ---------------------------------------------------------------------------

function report({ war, system, travel, discovery, unwatched, liveReport, host, host2, course }) {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (v, n, d = 2) => String(v.toFixed(d)).padStart(n);

  // The in-frame readout. Deliberately the same shape as the right-hand POI column
  // the tactical overlay is specified to carry, so the probe is testing something the
  // game will actually draw rather than a debug dump.
  const lines = [];
  let coalitionHeld = 0, concordHeld = 0, contested = 0, totalHulks = 0;
  for (const st of war.states.values()) {
    if (st.control >= 0) coalitionHeld++; else concordHeld++;
    if (st.contested) contested++;
    totalHulks += st.hulks.length;
  }
  lines.push('NADIR POINT / SYSTEM MAP');
  lines.push(`T+${(war.time / 60).toFixed(0)}M UNOBSERVED WAR`);
  lines.push(`${unwatched.started} BATTLES / ${unwatched.resolved} RESOLVED`);
  lines.push(`HELD  ${coalitionHeld} CO : ${concordHeld} CN : ${contested} CONTESTED`);
  lines.push(`HULKS ${totalHulks} AWAITING SALVAGE`);
  lines.push('');
  lines.push('POI            CTRL  HEAT  BTL');
  for (const node of system.nodes) {
    const st = war.states.get(node.id);
    const sign = st.control >= 0 ? '+' : '-';
    lines.push(
      `${pad(node.id.slice(0, 13), 14)}${sign}${Math.abs(st.control).toFixed(2)} `
      + ` ${st.heat.toFixed(2)}  ${String(st.battlesFought).padStart(2)}`,
    );
  }
  lines.push('');
  lines.push(`LIVE  ${host.node.name.slice(0, 22)}`);
  lines.push(`      ${liveReport.spawned} HULLS / ${liveReport.wrecks} WRECKS`);
  if (liveReport.arcs) {
    lines.push(`ARCS  ${liveReport.arcs.broadsidePct}% BEAM (CAPS)`
      + ` / ${liveReport.arcs.bearingPct}% BEARING`);
  }
  if (course?.legs?.length) {
    const dest = system.containing(course.legs.at(-1).to.x, course.legs.at(-1).to.z);
    lines.push('');
    lines.push(`COURSE ${(dest?.name ?? 'open space').slice(0, 20)}`);
    lines.push(`      ${(course.totalPropellant / TRANSIT.propellantPerKm).toFixed(0)} KM`
      + ` / ${(course.totalTime / 60).toFixed(1)} MIN`
      + ` / ${Math.ceil(course.totalPropellant)} PROP`);
    lines.push(`      INTERCEPT ${(course.interceptChance * 100).toFixed(0)}%`
      + `  ${course.ok ? 'CLEARED' : 'REJECTED'}`);
  }
  lines.push('');
  lines.push('AMBER COALITION  CYAN CONCORD');
  lines.push('RED RING PATROL HEAT');
  lines.push('WHITE LINE FRONT  COLUMN BATTLE');
  const summary = lines.join('\n');

  console.log('');
  console.log('=== NADIR POINT — WORLD SIM =========================================');
  console.log(`roster        : ${usingFallbackRoster() ? 'fallback hulls (geometry stream has not registered ship classes)' : 'registered ship classes'}`);
  const sp = system.spacingReport();
  console.log(`system        : ${sp.nodes} POIs, nearest-neighbour spacing ${sp.minKm.toFixed(0)}–${sp.maxKm.toFixed(0)} km`);
  console.log(`unobserved war: ${unwatched.started} battles started, ${unwatched.resolved} resolved, with the player 1400 km away`);
  console.log('');
  console.log('POI              kind        ctrl   heat  owner      fights hulks garrison C/N     seen');
  console.log('---------------------------------------------------------------------------------------');
  for (const node of system.nodes) {
    const st = war.states.get(node.id);
    const seen = st.lastSeenTick < 0 ? '  never' : `${(war.time - st.lastSeenTick).toFixed(0)}s ago`;
    console.log(
      `${pad(node.id, 16)} ${pad(node.kind, 11)}${num(st.control, 6)} ${num(st.heat, 6)}  `
      + `${pad(st.owner, 10)} ${pad(st.battlesFought, 6)} ${pad(st.hulks.length, 5)} `
      + `${pad(Math.round(st.garrison.coalition) + '/' + Math.round(st.garrison.concord), 12)} ${seen}`,
    );
  }
  console.log('');
  console.log(`front line    : ${war.frontLine().length / 2} segments across the zero contour`);
  console.log(`reserves      : coalition ${Math.round(war.reserve.coalition)}, concord ${Math.round(war.reserve.concord)}`);
  console.log(`reputation    : coalition ${war.world?.reputation?.coalition ?? 0}, concord ${war.world?.reputation?.concord ?? 0}`);
  console.log('');
  console.log('recent battles');
  for (const r of war.log.slice(-8)) {
    console.log(`  t=${pad(r.at.toFixed(0), 7)} ${pad(r.name, 24)} ${pad(r.live ? 'LIVE' : 'abstract', 9)} won by ${r.winner}`);
  }
  console.log('');
  console.log('live battle verification');
  console.log(`  host POI    : ${host.node.name} (${host.node.id})`);
  console.log(`  spawned     : ${liveReport.spawned} real hulls at t=${liveReport.spawnedAt}s`);
  console.log(`  outcome     : phase=${liveReport.phase} winner=${liveReport.winner}`);
  console.log(`  wrecks made : ${liveReport.wrecks}   hulls still flying: ${liveReport.shipsLeft}`);
  if (liveReport.arcs) {
    const a = liveReport.arcs;
    console.log(`  arc system  : ${a.samples} samples, mean relative bearing ${a.meanRelDeg} deg, `
      + `${a.broadsidePct}% of capitals held the target near the beam, ${a.bearingPct}% with a mount bearing `
      + `(${a.inRangePct}% of engaged time was inside weapons reach)`);
    console.log(`  ai states   : ${JSON.stringify(a.states)}`);
  }
  if (host2) console.log(`  second live engagement running at ${host2.node.name}`);

  console.log('');
  console.log('travel model — docs/design/controls.md 5.5.3, verified against the table');
  const rows = [120, 300, 600];
  for (const km of rows) {
    const normal = legProfile(km * KM, TRANSIT.accel, TRANSIT.maxSpeed).time + TRANSIT.spool;
    const silent = legProfile(km * KM, TRANSIT.silentAccel, TRANSIT.silentMaxSpeed).time + TRANSIT.spool;
    const prop = km * TRANSIT.propellantPerKm;
    const rolls = Math.floor(normal / TRANSIT.riskRollPeriod);
    const p = Math.min(TRANSIT.heatCap, 0.5 * TRANSIT.heatK * TRANSIT.signature);
    const ps = Math.min(TRANSIT.heatCap, 0.5 * TRANSIT.heatK * TRANSIT.silentSignature);
    const sRolls = Math.floor(silent / TRANSIT.riskRollPeriod);
    console.log(
      `  ${pad(km + ' km', 8)} ${num(normal, 7, 1)}s   SILENT ${num(silent, 7, 1)}s   `
      + `prop ${pad(prop.toFixed(0), 4)} rolls ${rolls}   `
      + `intercept@heat0.5 ${(100 * (1 - (1 - p) ** rolls)).toFixed(0)}% / silent ${(100 * (1 - (1 - ps) ** sRolls)).toFixed(0)}%`,
    );
  }

  console.log('');
  console.log(`discovery     : ${discovery.known.size} POIs known, ${discovery.blips.size} unresolved mass signatures`);
  console.log(`propellant    : ${Math.round(travel.world?.propellant?.current ?? 0)} of ${Math.round(travel.world?.propellant?.max ?? 0)} (reserve ${TRANSIT.reserve})`);
  if (course) {
    console.log(`plotted course: ${course.legs.length} leg(s), `
      + `${(course.legs.reduce((a, l) => a + l.distance, 0) / KM).toFixed(0)} km, `
      + `${course.totalTime.toFixed(0)}s, ${Math.ceil(course.totalPropellant)} propellant, `
      + `intercept ${(course.interceptChance * 100).toFixed(0)}%  ${course.ok ? 'OK' : 'REJECTED: ' + course.reason}`);
  }
  console.log('=====================================================================');
  return summary;
}
