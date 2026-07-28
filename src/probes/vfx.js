/**
 * VFX PROBE.
 *
 * Every effect the VFX stream owns, running at once, against placeholder hulls, on a
 * looping deterministic script so any single frame of the sequence shows all of them.
 *
 *   node tools/probe.mjs vfx --out docs/probes/vfx.png --width 1800 --height 1000
 *
 * Eight stations on the combat plane:
 *
 *   1 TRACERS      slug and rail fire between two hulls, with muzzle flashes and
 *                  impact spatter, plus guided munitions crossing with GPU trails
 *   2 BEAMS        a lance and a cannon beam held on target, hot cores and impacts
 *   3 SHIELDS      hex ripples propagating from moving impact points
 *   4 SALVAGE      the cutting beam, slag, contact spatter, the progress gauge, and
 *                  a section under tow
 *   5 HULL KILL    a destroyer coming apart: flash, shockwaves, wreckage, venting,
 *                  secondaries
 *   6 REACTOR KILL the same hull losing containment - brighter, faster, whiter, and
 *                  it consumes the wreck. This pair is the whole salvage read.
 *   7 ENGINES      three identical hulls at full burn / part burn / dead drives
 *   8 DAMAGE       persistent scorch, venting atmosphere, sparking, dead emissives
 *
 * The hulls are deliberately crude - hard-edged boxes with the registry's real
 * materials. They exist to give the effects a silhouette to sit against and to prove
 * the gameplay reads (a dark stern, a burnt hull); they are not this stream's work.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMaterialRegistry } from '../art/materials/index.js';
import { getPOIPalette, NEUTRAL, getFactionPalette, auditMaterials as registryAudit } from '../art/palette.js';
import { textCanvas } from '../art/textures/decals.js';
import { EV } from '../core/events.js';
import { Engine } from '../core/loop.js';
import { World } from '../core/world.js';
import { Ship } from '../sim/ship.js';
import { ProjectilePool, PROJECTILE_KINDS } from '../sim/combat.js';
import { installVFX } from '../vfx/index.js';

const POI = 'giant-orbit';

// ---------------------------------------------------------------------------
// Placeholder hull
// ---------------------------------------------------------------------------

function metreUV(geometry) {
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
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function subsystemsFor(L) {
  return [
    { id: 'engine_port', kind: 'engine', hp: 900, position: [-L * 0.105, L * 0.012, -L * 0.415], radius: L * 0.075, salvageValue: 0.12, label: 'Port Drive' },
    { id: 'engine_stbd', kind: 'engine', hp: 900, position: [L * 0.105, L * 0.012, -L * 0.415], radius: L * 0.075, salvageValue: 0.12, label: 'Stbd Drive' },
    { id: 'reactor', kind: 'reactor', hp: 1600, position: [0, 0, -L * 0.06], radius: L * 0.09, salvageValue: 0.28, label: 'Reactor' },
    { id: 'sensor', kind: 'sensor', hp: 400, position: [0, L * 0.085, L * 0.33], radius: L * 0.055, salvageValue: 0.10, label: 'Sensors' },
    { id: 'mount_port', kind: 'weapon', hp: 700, position: [-L * 0.135, L * 0.02, L * 0.09], radius: L * 0.06, salvageValue: 0.09, label: 'Port Battery' },
  ];
}

/**
 * A crude but hard-edged hull: long spine, chamfered bow block, dorsal fin, stern
 * engine housing, sponsons. Two merged geometries plus a handful of small emissive
 * panels sitting close enough to each subsystem for the damage layer to bind them.
 */
function buildHull(registry, faction, L) {
  const g = new THREE.Group();
  const W = L * 0.19, H = L * 0.10;

  const light = [
    box(W, H, L * 0.62, 0, 0, -L * 0.02),                       // spine
    box(W * 0.62, H * 0.78, L * 0.26, 0, H * 0.06, L * 0.40),   // bow block
    box(W * 0.30, H * 1.55, L * 0.30, 0, H * 0.95, -L * 0.06),  // dorsal fin
    box(W * 0.42, H * 0.55, L * 0.20, -W * 0.72, L * 0.02, L * 0.09), // port sponson
    box(W * 0.42, H * 0.55, L * 0.20, W * 0.72, L * 0.02, L * 0.09),  // stbd sponson
  ];
  const dark = [
    box(W * 1.06, H * 0.9, L * 0.16, 0, L * 0.012, -L * 0.40),  // engine housing
    box(W * 0.34, H * 0.42, L * 0.13, -W * 0.55, L * 0.012, -L * 0.415),
    box(W * 0.34, H * 0.42, L * 0.13, W * 0.55, L * 0.012, -L * 0.415),
    box(W * 0.72, H * 0.44, L * 0.20, 0, -H * 0.62, -L * 0.02), // ventral cradle
    box(W * 0.16, H * 0.5, L * 0.10, 0, H * 1.95, -L * 0.02),   // mast
  ];

  const gl = metreUV(mergeGeometries(light, false));
  const gd = metreUV(mergeGeometries(dark, false));
  for (const p of light) p.dispose();
  for (const p of dark) p.dispose();

  const mHull = registry.get('hull', { faction, wear: 0.5, tier: 2, flatShading: true });
  const mDark = registry.get('hullDark', { faction, wear: 0.625, tier: 2, flatShading: true });

  const a = new THREE.Mesh(gl, mHull);
  a.castShadow = true; a.receiveShadow = true;
  const b = new THREE.Mesh(gd, mDark);
  b.castShadow = true; b.receiveShadow = true;
  g.add(a); g.add(b);

  // Emissive panels, positioned inside each subsystem's binding radius so that
  // knocking a subsystem out puts these lights out for good.
  const emat = registry.get('emissive', { faction, intensity: 2.4 });
  const panel = new THREE.PlaneGeometry(1, 1);
  const put = (w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(panel, emat);
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
    return m;
  };
  // stern drive glow (binds to the engine subsystems)
  put(L * 0.045, L * 0.045, -L * 0.105, L * 0.012, -L * 0.474, Math.PI);
  put(L * 0.045, L * 0.045, L * 0.105, L * 0.012, -L * 0.474, Math.PI);
  // reactor vents amidships
  put(L * 0.13, L * 0.008, 0, H * 0.35, -L * 0.06 + W * 0.5 * 0, 0);
  put(L * 0.008, L * 0.05, -W * 0.505, 0, -L * 0.06, Math.PI * 0.5);
  put(L * 0.008, L * 0.05, W * 0.505, 0, -L * 0.06, -Math.PI * 0.5);
  // bridge / sensor
  put(L * 0.055, L * 0.010, 0, L * 0.085, L * 0.33 + L * 0.001, 0);

  return g;
}

function makeShip(world, registry, { faction, length, x, z, heading = 0, role = 'destroyer' }) {
  const root = buildHull(registry, faction, length);
  const classDef = {
    id: `probe_${faction}_${role}_${Math.round(x)}_${Math.round(z)}`,
    name: 'Probe Hull',
    faction,
    role,
    length,
    mass: length * 40,
    maxSpeed: 160,
    accel: 14,
    turnRate: 0.2,
    hullHP: 6000,
    triBudget: 2000,
    planeLocked: true,
    build: () => root,
    subsystems: subsystemsFor(length),
    weapons: [],
  };
  const ship = new Ship({
    classDef, world, faction, root,
    position: new THREE.Vector3(x, 0, z),
    heading,
  });
  ship.body.throttle = 0;
  world.addShip(ship);
  return ship;
}

/** Refresh cached subsystem world positions without running the move controller. */
function parkShip(ship) {
  const s = Math.sin(ship.heading), c = Math.cos(ship.heading);
  for (const sub of ship.subsystems.values()) {
    const [lx, ly, lz] = sub.def.position;
    sub.worldPosition.set(
      ship.position.x + lx * c + lz * s,
      ship.position.y + ly,
      ship.position.z + lz * c - lx * s,
    );
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const GLYPH_PX = 6;
function addLabel(scene, text, x, y, z, cellM, colorHex, brightness = 1) {
  const canvas = textCanvas(text, { cell: GLYPH_PX, pad: 4, ink: 0xffffff, tracking: 1 });
  const width = (canvas.width / GLYPH_PX) * cellM;
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({
    map: t, transparent: true, depthWrite: false, depthTest: false,
    color: new THREE.Color().setHex(colorHex, THREE.SRGBColorSpace).multiplyScalar(brightness),
  });
  mat.userData.__paletteKey = 'probe:chrome';
  const h = width * (canvas.height / canvas.width);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, h), mat);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 40;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------

const S = 2150;              // station pitch in X
const ROW = 3500;            // station pitch in Z
const station = (col, row) => new THREE.Vector3((col - 1.5) * S, 0, (row - 0.5) * ROW);

export default {
  name: 'VFX — weapons, engines, shields, explosions, salvage, damage',
  camera: { distance: 7300, pitch: 0.55, yaw: 0.10, target: new THREE.Vector3(280, 120, 120) },

  async setup(ctx) {
    const { scene, far, world, renderer, engine } = ctx;

    const registry = createMaterialRegistry({
      renderer: renderer.renderer,
      rng: world.rng.fork('vfx-probe-materials'),
      poi: POI,
    });
    world.register('materials', registry);
    ctx.registry = registry;

    const poi = getPOIPalette(POI);

    // --- backdrop and lighting -------------------------------------------
    far.background = new THREE.Color().setHex(NEUTRAL.spaceBlack, THREE.SRGBColorSpace);
    scene.background = null;

    const key = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.key.color, THREE.SRGBColorSpace), poi.key.intensity,
    );
    key.position.set(-0.62, 0.48, 0.62).normalize().multiplyScalar(20000);
    key.castShadow = false;
    scene.add(key);
    scene.add(key.target);

    const fill = new THREE.DirectionalLight(
      new THREE.Color().setHex(poi.fill.color, THREE.SRGBColorSpace), poi.fill.intensity * 0.75,
    );
    fill.position.set(0.7, -0.25, -0.62).normalize().multiplyScalar(20000);
    scene.add(fill);

    scene.add(new THREE.AmbientLight(
      new THREE.Color().setHex(poi.shadow, THREE.SRGBColorSpace), 1.1,
    ));
    registry.applyEnvironment(scene, POI, 0.85);

    // Volumetrics need a key light in frame; aimed at nothing they smear the whole
    // chart radially from screen centre. GTAO costs a depth prepass and contributes
    // nothing to separated objects on a software rasteriser.
    renderer.post.godrays.enabled = false;
    renderer.post.gtao.enabled = false;
    renderer.renderer.toneMappingExposure = 1.0;
    renderer.post.grade.uniforms.vignette.value = 0.44;

    // --- combat and salvage stand-ins -------------------------------------
    const pool = new ProjectilePool(512);
    const combat = { projectiles: pool, activeBeams: [] };
    world.register('combat', combat);

    const cutSection = {
      radius: 90, cutProgress: 0, detached: false,
      worldPosition: new THREE.Vector3(),
    };
    const towed = {
      section: { radius: 55 },
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    };
    const salvageStub = { cutting: null, inTow: [towed] };
    world.register('salvage', salvageStub);

    // --- hulls -------------------------------------------------------------
    const P = station;
    const D = 480;    // destroyer
    const C = 1400;   // cruiser

    // 1 tracers
    const s1 = P(0, 0);
    const gunA = makeShip(world, registry, { faction: 'coalition', length: D, x: s1.x - 620, z: s1.z + 480, heading: -0.55 });
    const gunB = makeShip(world, registry, { faction: 'concord', length: D, x: s1.x + 640, z: s1.z - 500, heading: 2.35 });
    gunA.body.throttle = 0.7; gunB.body.throttle = 0.5;

    // 2 beams
    const s2 = P(1, 0);
    const beamA = makeShip(world, registry, { faction: 'concord', length: D, x: s2.x - 640, z: s2.z + 430, heading: -0.62 });
    const beamB = makeShip(world, registry, { faction: 'coalition', length: D, x: s2.x + 620, z: s2.z - 450, heading: 2.3 });
    beamA.body.throttle = 0.35; beamB.body.throttle = 0.2;

    // 3 shields
    const s3 = P(2, 0);
    const shielded = makeShip(world, registry, { faction: 'concord', length: D * 1.3, x: s3.x, z: s3.z, heading: 0.9 });
    shielded.body.throttle = 0.6;
    shielded.shields.max = 4000; shielded.shields.current = 4000;

    // 4 salvage: the player cruiser and a hulk to strip
    const s4 = P(3, 0);
    const cruiser = makeShip(world, registry, { faction: 'player', length: C, x: s4.x - 250, z: s4.z + 520, heading: -0.75, role: 'cruiser' });
    cruiser.isPlayer = true;
    cruiser.body.throttle = 0.12;
    world.player = cruiser;
    const hulk = makeShip(world, registry, { faction: 'derelict', length: D * 1.25, x: s4.x + 760, z: s4.z - 500, heading: 1.9 });
    hulk.dead = true;      // a hulk does not burn

    // 5 hull kill / 6 reactor kill
    const s5 = P(0, 1);
    const victimA = makeShip(world, registry, { faction: 'coalition', length: D, x: s5.x, z: s5.z, heading: 0.5 });
    const s6 = P(1, 1);
    const victimB = makeShip(world, registry, { faction: 'concord', length: D, x: s6.x, z: s6.z, heading: -0.4 });

    // 7 engines: full burn / part burn / dead drives
    const s7 = P(2, 1);
    const EH = Math.PI * 0.5;   // bow to starboard: the plume runs across the frame
    const eFull = makeShip(world, registry, { faction: 'coalition', length: D, x: s7.x - 300, z: s7.z + 780, heading: EH });
    const eHalf = makeShip(world, registry, { faction: 'coalition', length: D, x: s7.x - 300, z: s7.z, heading: EH });
    const eDead = makeShip(world, registry, { faction: 'coalition', length: D, x: s7.x - 300, z: s7.z - 780, heading: EH });
    eFull.body.throttle = 1.0;
    eHalf.body.throttle = 0.42;
    eDead.body.throttle = 1.0;   // ordering flank speed with no drives left

    // 8 damage
    const s8 = P(3, 1);
    const hurt = makeShip(world, registry, { faction: 'coalition', length: D * 1.1, x: s8.x, z: s8.z, heading: 0.75 });
    hurt.body.throttle = 0.3;

    for (const s of world.ships) {
      parkShip(s);
      s.syncTransform();
    }
    // Damage seeding below raycasts against the hulls, so the scene graph has to be
    // current before the first frame has ever been drawn.
    scene.updateMatrixWorld(true);

    // Named close-up poses, so a reviewer can look at one effect at gameplay
    // range instead of judging the whole chart from 7 km:
    //   /probe.html?p=vfx&shot=kill|salvage|damage|guns
    const SHOTS = {
      kill: { distance: 2500, pitch: 0.26, yaw: 0.22, target: new THREE.Vector3(-2150, 80, 1750) },
      salvage: { distance: 2300, pitch: 0.30, yaw: 0.55, target: new THREE.Vector3(3225, 60, -1750) },
      damage: { distance: 1250, pitch: 0.22, yaw: 0.05, target: new THREE.Vector3(3225, 40, 1750) },
      guns: { distance: 2400, pitch: 0.20, yaw: 0.15, target: new THREE.Vector3(-3225, 60, -1750) },
      plumes: { distance: 2200, pitch: 0.26, yaw: 0.10, target: new THREE.Vector3(775, 60, 1750) },
    };
    const shotName = ctx.params?.get?.('shot');
    if (shotName && SHOTS[shotName]) Object.assign(ctx.pose, SHOTS[shotName]);

    // --- install the stream under test ------------------------------------
    const vfx = installVFX(world);
    ctx.vfx = vfx;

    // --- seeded persistent damage on station 8 ----------------------------
    {
      const r = world.rng.fork('probe-damage');
      const L = D * 1.1;
      for (let i = 0; i < 14; i++) {
        const sp = { x: 0, y: 0, z: 0 };
        r.onSphere(sp);
        // Bias toward the camera-facing flank so the chart actually shows them.
        if (sp.z < 0) sp.z = -sp.z * 0.4;
        const p = new THREE.Vector3(
          hurt.position.x + sp.x * L * 0.30,
          hurt.position.y + sp.y * L * 0.16,
          hurt.position.z + sp.z * L * 0.45,
        );
        vfx.scorch(hurt, p, 34 + r.next() * 52);
      }
      // Knock out one drive and the sensor mast: the lights on both go dark.
      for (const id of ['engine_stbd', 'sensor']) {
        const sub = hurt.subsystems.get(id);
        if (!sub) continue;
        sub.destroyed = true;
        sub.hp = 0;
        world.bus.emit(EV.SUBSYSTEM_DESTROYED, { ship: hurt, subsystem: sub, point: sub.worldPosition });
      }
      vfx.vent(hurt, L * 0.05, L * 0.04, L * 0.10, L * 0.055);
      vfx.vent(hurt, -L * 0.09, -L * 0.02, -L * 0.16, L * 0.05);
    }

    // Station 7's dead-drive hull: kill both engines so it visibly stops burning.
    for (const id of ['engine_port', 'engine_stbd']) {
      const sub = eDead.subsystems.get(id);
      if (!sub) continue;
      sub.destroyed = true;
      sub.hp = 0;
      world.bus.emit(EV.SUBSYSTEM_DESTROYED, { ship: eDead, subsystem: sub, point: sub.worldPosition });
    }

    // --- labels ------------------------------------------------------------
    const accent = poi.accent;
    const LY = 640;
    const labels = [];
    const lab = (text, st, dy = 0, colour = accent, cell = 12) => {
      labels.push(addLabel(scene, text, st.x, LY + dy, st.z, cell, colour, 1.1));
    };
    lab('1 TRACERS + MUZZLE', P(0, 0));
    lab('2 BEAMS', P(1, 0));
    lab('3 SHIELD IMPACT', P(2, 0));
    lab('4 SALVAGE CUT', P(3, 0));
    lab('5 HULL KILL', P(0, 1), 0, getFactionPalette('coalition').emissive);
    lab('6 REACTOR KILL', P(1, 1), 0, getFactionPalette('coalition').warn);
    lab('7 PLUMES  FULL / PART / DEAD', P(2, 1));
    lab('8 DAMAGE STATE', P(3, 1));
    labels.push(addLabel(scene, 'NADIR POINT / VFX', 0, 1600, -3200, 26, NEUTRAL.select, 0.85));
    ctx.labels = labels;

    // ------------------------------------------------------------------
    // The script. Fixed step, so it is deterministic and it pauses with the sim.
    // ------------------------------------------------------------------
    const rng = world.rng.fork('probe-script');
    const bus = world.bus;
    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const fakeMount = { worldForward: new THREE.Vector3(0, 0, 1) };

    let t = 0;
    let fireTimer = 0;
    let missileTimer = 0.4;
    let shieldTimer = 0.20;
    let killTimerA = 0.35;
    let killTimerB = 0.70;
    let firstKillDone = false;
    let cutPhase = 0;

    const fire = (from, to, kind, faction, speed, spread) => {
      const i = pool.spawn();
      if (i < 0) return;
      tmpA.copy(from);
      tmpB.copy(to).sub(tmpA).normalize();
      tmpB.x += rng.signed() * spread;
      tmpB.y += rng.signed() * spread * 0.5;
      tmpB.z += rng.signed() * spread;
      tmpB.normalize();
      pool.px[i] = tmpA.x; pool.py[i] = tmpA.y; pool.pz[i] = tmpA.z;
      pool.vx[i] = tmpB.x * speed; pool.vy[i] = tmpB.y * speed; pool.vz[i] = tmpB.z * speed;
      pool.life[i] = 1.5;
      pool.damage[i] = 40;
      pool.kind[i] = PROJECTILE_KINDS.indexOf(kind);
      pool.faction[i] = faction === 'coalition' ? 0 : 1;
      pool.tracking[i] = kind === 'missile' ? 1 : 0;
      pool.sourceRef[i] = faction === 'coalition' ? gunA : gunB;
      pool.targetRef[i] = faction === 'coalition' ? gunB : gunA;
      fakeMount.worldForward.copy(tmpB);
      bus.emit(EV.WEAPON_FIRED, {
        ship: pool.sourceRef[i], mount: fakeMount, origin: tmpA,
        aimPoint: to, type: kind === 'railslug' ? 'rail' : kind === 'missile' ? 'missile' : 'cannon',
      });
      return i;
    };

    engine.add({
      name: 'probe:vfx-script',
      order: 10,
      fixedUpdate(dt) {
        t += dt;

        // -------------------------------------------------- 1 tracers
        fireTimer -= dt;
        if (fireTimer <= 0) {
          fireTimer = 0.085;
          const heavy = rng.next() < 0.3;
          fire(gunA.position, gunB.position, heavy ? 'railslug' : 'slug', 'coalition',
            heavy ? 2600 : 1100, 0.012);
          if (rng.next() < 0.7) {
            fire(gunB.position, gunA.position, 'slug', 'concord', 1250, 0.014);
          }
        }
        missileTimer -= dt;
        if (missileTimer <= 0) {
          missileTimer = 0.55;
          fire(gunB.position, gunA.position, 'missile', 'concord', 420, 0.05);
        }

        // step the stand-in projectiles
        for (let i = pool.count - 1; i >= 0; i--) {
          pool.life[i] -= dt;
          if (pool.tracking[i] > 0 && pool.targetRef[i]) {
            const tgt = pool.targetRef[i].position;
            const dx = tgt.x - pool.px[i], dy = tgt.y - pool.py[i], dz = tgt.z - pool.pz[i];
            const d = Math.hypot(dx, dy, dz) || 1;
            const sp = Math.hypot(pool.vx[i], pool.vy[i], pool.vz[i]) || 1;
            const rate = 1.6 * dt;
            pool.vx[i] += ((dx / d) * sp - pool.vx[i]) * rate;
            pool.vy[i] += ((dy / d) * sp - pool.vy[i]) * rate;
            pool.vz[i] += ((dz / d) * sp - pool.vz[i]) * rate;
          }
          pool.px[i] += pool.vx[i] * dt;
          pool.py[i] += pool.vy[i] * dt;
          pool.pz[i] += pool.vz[i] * dt;

          const tgtShip = pool.targetRef[i];
          const r = tgtShip ? tgtShip.radius * 0.6 : 60;
          const dx = pool.px[i] - tgtShip.position.x;
          const dy = pool.py[i] - tgtShip.position.y;
          const dz = pool.pz[i] - tgtShip.position.z;
          if (dx * dx + dy * dy + dz * dz < r * r || pool.life[i] <= 0) {
            if (pool.life[i] > 0) {
              tmpA.set(pool.px[i], pool.py[i], pool.pz[i]);
              bus.emit(EV.PROJECTILE_IMPACT, {
                point: tmpA, target: tgtShip,
                type: PROJECTILE_KINDS[pool.kind[i]], source: pool.sourceRef[i],
              });
            }
            pool.kill(i);
          }
        }

        // -------------------------------------------------- 2 beams
        combat.activeBeams.length = 0;
        const lanceEnd = tmpA.copy(beamB.position).addScaledVector(
          tmpB.set(rng.signed(), 0.15, rng.signed()).normalize(), beamB.radius * 0.55);
        combat.activeBeams.push({
          origin: beamA.position.clone(),
          end: lanceEnd.clone(),
          type: 'lance', faction: 'concord', hit: true,
        });
        combat.activeBeams.push({
          origin: beamB.position.clone(),
          end: beamA.position.clone(),
          type: 'beam', faction: 'coalition', hit: true,
        });

        // -------------------------------------------------- 3 shields
        shieldTimer -= dt;
        if (shieldTimer <= 0) {
          shieldTimer = 0.24 + rng.next() * 0.18;
          const sp = { x: 0, y: 0, z: 0 };
          rng.onSphere(sp);
          // bias the hits toward the camera-facing hemisphere so they are visible
          if (sp.z < 0) sp.z = -sp.z;
          tmpA.set(
            shielded.position.x + sp.x * shielded.radius,
            shielded.position.y + sp.y * shielded.radius,
            shielded.position.z + sp.z * shielded.radius,
          );
          bus.emit(EV.SHIELD_IMPACT, { ship: shielded, point: tmpA, amount: 60 + rng.next() * 220 });
        }

        // -------------------------------------------------- 4 salvage
        cutPhase += dt * 0.28;
        if (cutPhase > 1) cutPhase -= 1;
        cutSection.cutProgress = cutPhase;
        const s = Math.sin(hulk.heading), c = Math.cos(hulk.heading);
        const lx = -hulk.classDef.length * 0.10;
        const lz = hulk.classDef.length * 0.24;
        cutSection.worldPosition.set(
          hulk.position.x + lx * c + lz * s,
          hulk.position.y + hulk.classDef.length * 0.05,
          hulk.position.z + lz * c - lx * s,
        );
        salvageStub.cutting = { wreck: hulk, section: cutSection };

        // a section under tow, drifting home and looping
        const towT = (t * 0.16) % 1;
        towed.position.copy(cutSection.worldPosition).lerp(cruiser.position, towT);
        towed.position.y += Math.sin(towT * Math.PI) * 120;

        // -------------------------------------------------- 5/6 kills
        killTimerA -= dt;
        if (killTimerA <= 0) {
          killTimerA = 1.4;
          if (!firstKillDone) {
            // Once, through the real event, to prove the wiring end to end.
            firstKillDone = true;
            victimA.dead = true;
            bus.emit(EV.SHIP_DESTROYED, {
              ship: victimA, catastrophic: false, salvageIntegrity: 0.8, source: null,
            });
          } else {
            vfx.detonate(victimA.position.x, victimA.position.y, victimA.position.z,
              victimA.radius, { catastrophic: false, faction: 'coalition', root: null });
          }
        }
        killTimerB -= dt;
        if (killTimerB <= 0) {
          killTimerB = 1.4;
          victimB.dead = true;
          vfx.detonate(victimB.position.x, victimB.position.y, victimB.position.z,
            victimB.radius, { catastrophic: true, faction: 'concord', root: null });
        }

        // -------------------------------------------------- 8 damage top-up
        if (rng.next() < dt * 0.8) {
          const sp = { x: 0, y: 0, z: 0 };
          rng.onSphere(sp);
          tmpA.set(
            hurt.position.x + sp.x * hurt.radius * 0.5,
            hurt.position.y + sp.y * hurt.radius * 0.2,
            hurt.position.z + sp.z * hurt.radius * 0.9,
          );
          bus.emit(EV.PROJECTILE_IMPACT, { point: tmpA, target: hurt, type: 'shell', source: null });
        }

        for (const sh of world.ships) parkShip(sh);
      },
    });

    engine.addRender({
      name: 'probe:vfx-transforms',
      order: 90,
      update: () => {
        for (const sh of world.ships) sh.syncTransform();
      },
    });

    ctx.report = () => ({ ...vfx.stats(), projectiles: pool.count });
    ctx.audit = contractSelfTest(world, vfx);
  },

  update(dt, ctx) {
    // Labels face the camera. The rig is static in the probe, so this is one call.
    if (!ctx.labels) return;
    for (const l of ctx.labels) l.quaternion.copy(ctx.camera.quaternion);
  },
};

/**
 * The installer is a contract other streams and `game.js` code against, and it is
 * called during boot BEFORE there is a player, a combat system or a material
 * registry. Rendering it proves the pixels; this proves the promises. Anything that
 * fails here is a console.error, which makes tools/probe.mjs exit non-zero.
 */
function contractSelfTest(world, vfx) {
  const fails = [];
  const check = (name, ok) => { if (!ok) fails.push(name); };

  check('installVFX is idempotent', installVFX(world) === vfx);
  check('installVFX parks itself on world.systems.vfx', world.systems.vfx === vfx);

  const before = world.engine.systems.length + world.engine.renderSystems.length;
  installVFX(world);
  check('a repeat install registers no extra engine systems',
    world.engine.systems.length + world.engine.renderSystems.length === before);

  // A world with no player, no combat, no salvage and no material registry - which
  // is exactly the state game.js can be in when it calls us.
  let bare = null;
  let threw = null;
  try {
    const engine = new Engine();
    bare = new World({
      engine,
      renderer: {
        scene: new THREE.Scene(),
        far: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
      },
      seed: 'vfx-probe-bare',
    });
    const bareVfx = installVFX(bare);
    // Drive a full frame of it with nothing in the world at all.
    for (const s of engine.systems) s.fixedUpdate?.(1 / 60, engine);
    for (const s of engine.renderSystems) s.update?.(1 / 60, engine);
    // And make it do work with no hull, no target and no registry behind it.
    bare.bus.emit(EV.SHIP_DESTROYED, { ship: null, catastrophic: true });
    bare.bus.emit(EV.SHIELD_IMPACT, { ship: null, point: null, amount: 10 });
    bare.bus.emit(EV.PROJECTILE_IMPACT, { point: null, target: null, type: 'slug' });
    bareVfx.detonate(0, 0, 0, 200, { catastrophic: false, faction: 'coalition' });
    for (const s of engine.systems) s.fixedUpdate?.(1 / 60, engine);
    for (const s of engine.renderSystems) s.update?.(1 / 60, engine);
    bareVfx.dispose();
  } catch (err) {
    threw = err;
  }
  check(`installVFX survives a world with no player/combat/salvage/materials (${threw?.message ?? ''})`, !threw);

  const offenders = registryAudit(vfx.root);
  check(`every VFX material is stamped for the palette audit (saw ${offenders.length})`,
    offenders.length === 0);

  const stats = vfx.stats();
  check('stats() reports live counts',
    typeof stats.beams === 'number' && typeof stats.plumes === 'number'
    && typeof stats.wreckage === 'number');

  if (fails.length) {
    console.error('[probe:vfx] CONTRACT FAILURES:\n  ' + fails.join('\n  '));
  } else {
    console.log('[probe:vfx] contract self-test passed (7 checks)', JSON.stringify(stats));
  }
  return stats;
}
