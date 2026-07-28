/**
 * DEATH.
 *
 * A capital ship dying has to be an EVENT. It is the loudest thing that happens in a
 * run and it is also a piece of information: the player has to be able to tell, from
 * the explosion alone and without reading a number, whether they just took a hull
 * apart or whether they popped its reactor and burned the salvage they came for.
 *
 * So there are two grammars, and they are deliberately not the same effect at
 * different scales:
 *
 *   HULL KILL          A hard white flash, one dominant shockwave and a lazier
 *                      second one on another plane, a slow amber fireball, a large
 *                      quantity of BIG tumbling wreckage, atmosphere venting from
 *                      the hull for several seconds, and secondary detonations
 *                      walking through the wreck for four seconds afterwards. It
 *                      looks like something came apart. There is a wreck at the end.
 *
 *   CATASTROPHIC KILL  Faster, whiter, and it CONSUMES. A containment failure flash
 *                      at three times the intensity, a white core that swells past
 *                      the hull's own silhouette and engulfs it, three shockwaves in
 *                      the time the hull kill spends on one, and wreckage that is
 *                      small, fast, numerous and already burnt black. The whole thing
 *                      is over in half the time. It reads as annihilation, and that
 *                      is the honest picture of a 0.15 salvage integrity.
 *
 * Wreckage is real geometry: three low-poly silhouettes (torn plate, severed spar,
 * fragment) in three pooled InstancedMeshes sharing one registry `debris` material,
 * tinted per instance. Integration runs on the fixed step so wreckage freezes with
 * the rest of the sim at pause.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { getFactionPalette, mix, shade, NEUTRAL } from '../art/palette.js';
import { FIRE, hullRadius } from './common.js';
import { PKIND } from './particles.js';

// ---------------------------------------------------------------------------
// Wreckage geometry - small, hard-edged, and only three of them
// ---------------------------------------------------------------------------

/**
 * Give a geometry a flat white `color` attribute.
 *
 * This is load-bearing, not decoration. In three r185 `color_fragment` only applies
 * `vColor` when `USE_COLOR` is defined, and `USE_COLOR` comes from
 * `material.vertexColors` alone - an `instanceColor` on its own is written in the
 * vertex shader and then thrown away in the fragment shader. So per-instance tinting
 * of a registry material requires BOTH `{ vertexColors: true }` and a real `color`
 * attribute on the geometry, or the mesh renders black. Wreckage that could not be
 * tinted per instance would lose the hull-kill / reactor-kill colour read, which is
 * the whole point of this file.
 */
function whiteVertexColors(geometry) {
  const n = geometry.attributes.position.count;
  const col = new Float32Array(n * 3).fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geometry;
}

function metreUV(geometry) {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
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

/** Torn hull plate: buckled irregular prism, thin. Catches the key light on one face. */
function plateGeometry(rng, size = 1) {
  const n = rng.int(6, 8);
  const th = size * 0.045;
  const top = [], bot = [];
  let a = rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    a += (Math.PI * 2 / n) * (0.6 + rng.next() * 0.85);
    const rad = size * (0.4 + rng.next() * 0.7);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad * (0.5 + rng.next() * 0.6);
    const y = (rng.next() - 0.5) * size * 0.14;
    top.push([x, y + th, z]);
    bot.push([x, y - th, z]);
  }
  const pos = [];
  const push = (p, q, s) => pos.push(p[0], p[1], p[2], q[0], q[1], q[2], s[0], s[1], s[2]);
  for (let i = 1; i < n - 1; i++) { push(top[0], top[i], top[i + 1]); push(bot[0], bot[i + 1], bot[i]); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    push(top[i], bot[i], bot[j]);
    push(top[i], bot[j], top[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return whiteVertexColors(metreUV(g));
}

/** Severed structural framing: a heavy spine with two off-centre collars. */
function sparGeometry(rng, size = 1) {
  const w = size * 0.09;
  const verts = [];
  const box = (cx, cy, cz, hx, hy, hz) => {
    const p = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ].map(([x, y, z]) => [x + cx, y + cy, z + cz]);
    const F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const [a, b, c, d] of F) {
      verts.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[d]);
    }
  };
  box(0, 0, 0, w, w * 1.4, size);
  box(w * 2.0, w * 0.3, rng.range(-size * 0.2, size * 0.2), w * 0.55, w * 0.55, size * 0.55);
  box(w * 0.4, 0, rng.range(-size * 0.5, -size * 0.1), w * 2.1, w * (1.1 + rng.next()), w * 0.5);
  box(w * 0.4, 0, rng.range(size * 0.05, size * 0.5), w * 1.7, w * (1.0 + rng.next()), w * 0.45);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return whiteVertexColors(metreUV(g));
}

/** Fragment: a squashed low-poly rock. Fills volume without adding silhouette noise. */
function shardGeometry(rng, size = 1) {
  const g = new THREE.IcosahedronGeometry(size * 0.55, 0);
  const pos = g.attributes.position;
  const sx = 0.6 + rng.next() * 0.8, sy = 0.4 + rng.next() * 0.6, sz = 0.7 + rng.next() * 0.9;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * sx, pos.getY(i) * sy, pos.getZ(i) * sz);
  }
  g.computeVertexNormals();
  return whiteVertexColors(metreUV(g));
}

// ---------------------------------------------------------------------------
// Pooled tumbling wreckage
// ---------------------------------------------------------------------------

const POOL_FIELDS = [
  'px', 'py', 'pz', 'vx', 'vy', 'vz', 'ax', 'ay', 'az',
  'spin', 'angle', 'scale', 'age', 'life', 'hot', 'emit',
];
const _swapColor = new THREE.Color();

class DebrisPool {
  /**
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Material} material  the shared registry `debris` instance
   */
  constructor(geometry, material, capacity) {
    this.capacity = capacity;
    this.count = 0;

    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = 'vfx:wreckage';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;

    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.ax = new Float32Array(capacity);
    this.ay = new Float32Array(capacity);
    this.az = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.angle = new Float32Array(capacity);
    this.scale = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.hot = new Float32Array(capacity);   // >0 means it trails fire
    this.emit = new Float32Array(capacity);
  }

  spawn(x, y, z, vx, vy, vz, scale, life, spinAxis, spinRate, hot) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.ax[i] = spinAxis.x; this.ay[i] = spinAxis.y; this.az[i] = spinAxis.z;
    this.spin[i] = spinRate;
    this.angle[i] = 0;
    this.scale[i] = scale;
    this.age[i] = 0;
    this.life[i] = life;
    this.hot[i] = hot;
    this.emit[i] = 0;
    return i;
  }

  kill(i) {
    const last = --this.count;
    if (i !== last) {
      for (let f = 0; f < POOL_FIELDS.length; f++) {
        const arr = this[POOL_FIELDS[f]];
        arr[i] = arr[last];
      }
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(last, _swapColor);
        this.mesh.setColorAt(i, _swapColor);
      }
    }
  }

  dispose() { this.mesh.geometry.dispose(); }
}

// ---------------------------------------------------------------------------

const MAX_EVENTS = 12;

export class ExplosionVFX {
  constructor(world, particles, rings, { rng, materials } = {}) {
    this.world = world;
    this.particles = particles;
    this.rings = rings;
    this.rng = rng;
    this.group = new THREE.Group();
    this.group.name = 'vfx:explosions';

    // --- wreckage --------------------------------------------------------
    this.pools = [];
    if (materials?.get) {
      const mat = materials.get('debris', {
        instanced: true, vertexColors: true, flatShading: true, faction: 'player', wear: 0.875, scale: 1,
      });
      const gr = rng.fork('wreckage');
      const specs = [
        { make: plateGeometry, cap: 72 },
        { make: sparGeometry, cap: 40 },
        { make: shardGeometry, cap: 96 },
      ];
      for (const s of specs) {
        const pool = new DebrisPool(s.make(gr, 1), mat, s.cap);
        this.pools.push(pool);
        this.group.add(pool.mesh);
      }
    }

    // --- explosion sequencer ---------------------------------------------
    this.events = new Array(MAX_EVENTS);
    for (let i = 0; i < MAX_EVENTS; i++) {
      this.events[i] = {
        active: false, t: 0, duration: 0,
        x: 0, y: 0, z: 0, radius: 1, catastrophic: false,
        root: null, secTimer: 0, secLeft: 0, ventTimer: 0, ventLeft: 0,
        tint: new THREE.Color(),
      };
    }

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._scl = new THREE.Vector3();
    this._col = new THREE.Color();

    this._offShip = world.bus.on(EV.SHIP_DESTROYED, (e) => this.onShipDestroyed(e));
    this._offSub = world.bus.on(EV.SUBSYSTEM_DESTROYED, (e) => this.onSubsystemDestroyed(e));
  }

  _freeEvent() {
    for (let i = 0; i < MAX_EVENTS; i++) if (!this.events[i].active) return this.events[i];
    // Everything busy: recycle the oldest.
    let best = this.events[0];
    for (const e of this.events) if (e.t > best.t) best = e;
    return best;
  }

  // ------------------------------------------------------------------ events

  onShipDestroyed({ ship, catastrophic }) {
    if (!ship) return;
    const R = hullRadius(ship);
    const p = ship.position;
    this.detonate(p.x, p.y, p.z, R, {
      catastrophic: !!catastrophic,
      faction: ship.faction,
      root: ship.root ?? null,
      velocity: ship.velocity,
    });
  }

  onSubsystemDestroyed({ ship, subsystem, point }) {
    const r = subsystem?.def?.radius ?? 40;
    const src = point ?? subsystem?.worldPosition ?? ship?.position;
    if (!src) return;
    const P = this.particles;

    P.begin(PKIND.FIRE);
    P.setColor(FIRE.hot, 0.85);
    P.spec.life = 0.55;
    P.spec.size0 = r * 0.5;
    P.spec.size1 = r * 3.2;
    P.spec.drag = 3.2;
    P.spawn(src.x, src.y, src.z, 0, 0, 0);

    P.begin(PKIND.FIRE);
    P.setColor(FIRE.core, 0.7);
    P.spec.life = 0.16;
    P.spec.size0 = r * 0.3;
    P.spec.size1 = r * 1.5;
    P.spawn(src.x, src.y, src.z, 0, 0, 0);

    P.begin(PKIND.SPARK);
    P.setColor(FIRE.spark, 1.0);
    P.spec.life = 0.4;
    P.spec.size0 = r * 0.10;
    P.spec.size1 = 0.5;
    P.spec.drag = 2.2;
    P.spec.turbulence = 4;
    P.burst(26, src.x, src.y, src.z, 0, 1, 0, 1.0, 60, 420);

    P.begin(PKIND.EMBER);
    P.setColor(FIRE.slag, 0.9);
    P.spec.life = 2.4;
    P.spec.size0 = r * 0.09;
    P.spec.size1 = r * 0.03;
    P.spec.drag = 0.5;
    P.spec.turbulence = 4;
    P.burst(14, src.x, src.y, src.z, 0, 1, 0, 1.0, 20, 160);

    const n = this.rng.signed(), n2 = this.rng.signed();
    this.rings.shockwave(src.x, src.y, src.z, n, 1, n2, r * 0.4, r * 4.0, 0.40, FIRE.hot, 0.30, 0.09);

    this._spawnWreckage(src.x, src.y, src.z, r, 0, 0, 0, 4, 1.0, 0.30, this._col.setHex(
      mix(NEUTRAL.scorchCore, NEUTRAL.rockDark, 0.4), THREE.SRGBColorSpace,
    ));
  }

  /**
   * The core routine. Everything visible at t=0 happens here, synchronously with the
   * kill, and the sequencer below carries the next four seconds.
   */
  detonate(x, y, z, R, { catastrophic = false, faction = 'player', root = null, velocity = null } = {}) {
    const P = this.particles;
    const rng = this.rng;
    const cat = catastrophic;

    const pal = getFactionPalette(faction);
    // A hull kill leaves recognisable wreckage in the ship's own livery. A reactor
    // kill leaves carbon. That colour difference is the salvage read, in one line.
    const tint = this._col.setHex(
      cat ? mix(NEUTRAL.scorchCore, pal.baseDark, 0.28)
        : mix(shade(pal.base, 0.72), NEUTRAL.scorchRim, 0.30),
      THREE.SRGBColorSpace,
    );

    const vx = velocity ? velocity.x * 0.55 : 0;
    const vy = velocity ? velocity.y * 0.55 : 0;
    const vz = velocity ? velocity.z * 0.55 : 0;

    // --- the flash ---------------------------------------------------------
    P.begin(PKIND.FIRE);
    P.setColor(FIRE.core, cat ? 1.25 : 0.80);
    P.spec.life = cat ? 0.42 : 0.30;
    P.spec.size0 = R * (cat ? 0.9 : 0.45);
    P.spec.size1 = R * (cat ? 2.1 : 1.5);
    P.spec.drag = 5.0;
    P.spawn(x, y, z, vx, vy, vz);

    // --- the body of the fireball -----------------------------------------
    P.begin(PKIND.FIRE);
    P.setColor(cat ? FIRE.hot : FIRE.body, cat ? 0.85 : 0.80);
    P.spec.life = cat ? 1.15 : 1.9;
    P.spec.size0 = R * (cat ? 0.75 : 0.45);
    P.spec.size1 = R * (cat ? 2.3 : 1.5);
    P.spec.drag = cat ? 3.2 : 1.9;
    P.spawn(x, y, z, vx, vy, vz);

    // Cloud of burning gas. Catastrophic pushes it out fast and wide enough to
    // swallow the hull silhouette - that IS "it consumed the wreck".
    P.begin(PKIND.FIRE);
    P.setColor(cat ? FIRE.hot : FIRE.body, cat ? 0.72 : 0.52);
    P.spec.life = cat ? 1.35 : 2.2;
    P.spec.size0 = R * 0.22;
    P.spec.size1 = R * (cat ? 1.5 : 0.95);
    P.spec.drag = cat ? 2.4 : 1.5;
    P.spec.turbulence = R * 0.09;
    P.burst(cat ? 38 : 26, x, y, z, 0, 1, 0, 1.0,
      R * (cat ? 0.8 : 0.30), R * (cat ? 2.3 : 1.3));

    // --- shrapnel ----------------------------------------------------------
    P.begin(PKIND.SPARK);
    P.setColor(FIRE.spark, cat ? 0.9 : 0.7);
    P.spec.life = cat ? 0.5 : 0.75;
    P.spec.size0 = R * 0.055;
    P.spec.size1 = 0.6;
    P.spec.drag = 1.4;
    P.spec.turbulence = R * 0.04;
    P.burst(cat ? 78 : 50, x, y, z, 0, 1, 0, 1.0, R * 1.2, R * (cat ? 9 : 5.5));

    // --- glowing slag ------------------------------------------------------
    P.begin(PKIND.EMBER);
    P.setColor(FIRE.slag, 1.0);
    P.spec.life = cat ? 3.0 : 4.5;
    P.spec.size0 = R * 0.05;
    P.spec.size1 = R * 0.014;
    P.spec.drag = 0.28;
    P.spec.turbulence = R * 0.05;
    P.burst(cat ? 34 : 24, x, y, z, 0, 1, 0, 1.0, R * 0.3, R * (cat ? 3.2 : 1.9));

    // --- cold smoke, the value floor under all that brightness -------------
    P.begin(PKIND.GAS);
    P.setColor(FIRE.smoke, 1.0);
    P.spec.life = cat ? 3.0 : 5.5;
    P.spec.size0 = R * 0.45;
    P.spec.size1 = R * (cat ? 3.0 : 2.3);
    P.spec.drag = 1.1;
    P.spec.turbulence = R * 0.1;
    P.burst(cat ? 16 : 20, x, y, z, 0, 1, 0, 1.0, R * 0.2, R * 1.0);

    // --- shockwaves --------------------------------------------------------
    const n1x = rng.signed() * 0.45, n1z = rng.signed() * 0.45;
    this.rings.shockwave(x, y, z, n1x, 1, n1z,
      R * 0.25, R * (cat ? 3.0 : 2.2), cat ? 0.48 : 0.60,
      cat ? FIRE.core : FIRE.hot, cat ? 0.40 : 0.28, cat ? 0.05 : 0.06);
    // Second front on a NEARLY coplanar axis. Two rings on very different planes
    // cross in silhouette and the eye reads Saturn, not a detonation.
    this.rings.shockwave(x, y, z, n1x * 1.6 + rng.signed() * 0.2, 1, n1z * 1.6 + rng.signed() * 0.2,
      R * 0.2, R * (cat ? 2.0 : 1.5), cat ? 0.45 : 0.55,
      FIRE.body, cat ? 0.18 : 0.13, 0.11);

    // --- wreckage ----------------------------------------------------------
    this._spawnWreckage(
      x, y, z, R, vx, vy, vz,
      cat ? 42 : 26,
      cat ? 0.55 : 1.0,             // catastrophic shreds: smaller pieces
      cat ? 1.45 : 1.0,             // ...moving faster
      tint,
    );

    // --- the four seconds after --------------------------------------------
    const e = this._freeEvent();
    e.active = true;
    e.t = 0;
    e.duration = cat ? 2.6 : 4.6;
    e.x = x; e.y = y; e.z = z;
    e.radius = R;
    e.catastrophic = cat;
    e.root = root;
    e.secTimer = cat ? 0.09 : 0.26;
    e.secLeft = cat ? 10 : 9;
    e.ventTimer = 0.2;
    e.ventLeft = cat ? 8 : 26;
    e.tint.copy(tint);
  }

  _spawnWreckage(x, y, z, R, vx, vy, vz, count, sizeMul, speedMul, tint) {
    if (!this.pools.length) return;
    const rng = this.rng;
    const s = { x: 0, y: 0, z: 0 };
    let hotLeft = 12;
    for (let i = 0; i < count; i++) {
      // Plates are the silhouette carriers, so they get the biggest share.
      const roll = rng.next();
      const pool = roll < 0.42 ? this.pools[0] : roll < 0.60 ? this.pools[1] : this.pools[2];
      rng.onSphere(s);
      const speed = (R * 0.24 + rng.next() * R * 0.85) * speedMul;
      const scale = R * (0.055 + Math.pow(rng.next(), 1.8) * 0.34) * sizeMul;
      this._axis.set(rng.signed(), rng.signed(), rng.signed()).normalize();
      const hot = hotLeft > 0 && rng.next() < 0.42 ? 1 : 0;
      if (hot) hotLeft--;
      const idx = pool.spawn(
        x + s.x * R * 0.35, y + s.y * R * 0.35, z + s.z * R * 0.35,
        vx + s.x * speed, vy + s.y * speed, vz + s.z * speed,
        scale, 4.5 + rng.next() * 5.5,
        this._axis, rng.signed() * 1.4, hot,
      );
      if (idx >= 0) {
        this._col.copy(tint).multiplyScalar(0.55 + rng.next() * 0.8);
        pool.mesh.setColorAt(idx, this._col);
      }
    }
    for (const pool of this.pools) {
      pool.mesh.count = pool.count;
      if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- sim step

  fixedUpdate(dt) {
    this._stepEvents(dt);
    this._stepWreckage(dt);
  }

  _stepEvents(dt) {
    const P = this.particles;
    const rng = this.rng;
    for (const e of this.events) {
      if (!e.active) continue;
      e.t += dt;
      if (e.t >= e.duration) { e.active = false; continue; }

      // The wreck drifts; the venting has to go with it.
      let cx = e.x, cy = e.y, cz = e.z;
      if (e.root) { cx = e.root.position.x; cy = e.root.position.y; cz = e.root.position.z; }
      const R = e.radius;

      // --- secondary detonations walking through the hull -------------------
      e.secTimer -= dt;
      if (e.secTimer <= 0 && e.secLeft > 0) {
        e.secLeft--;
        e.secTimer = e.catastrophic ? 0.08 + rng.next() * 0.14 : 0.22 + rng.next() * 0.40;
        const s = { x: 0, y: 0, z: 0 };
        rng.onSphere(s);
        const d = R * (0.15 + rng.next() * 0.85);
        const sx = cx + s.x * d, sy = cy + s.y * d * 0.6, sz = cz + s.z * d;
        const sr = R * (0.14 + rng.next() * 0.26) * (e.catastrophic ? 1.5 : 1);

        P.begin(PKIND.FIRE);
        P.setColor(e.catastrophic ? FIRE.core : FIRE.hot, e.catastrophic ? 1.0 : 0.7);
        P.spec.life = 0.34;
        P.spec.size0 = sr * 0.5;
        P.spec.size1 = sr * 4.0;
        P.spec.drag = 3.0;
        P.spawn(sx, sy, sz, 0, 0, 0);

        P.begin(PKIND.SPARK);
        P.setColor(FIRE.spark, 0.7);
        P.spec.life = 0.36;
        P.spec.size0 = sr * 0.16;
        P.spec.size1 = 0.5;
        P.spec.drag = 1.8;
        P.burst(20, sx, sy, sz, s.x, s.y, s.z, 0.9, R * 0.4, R * 2.4);

        this.rings.shockwave(sx, sy, sz, s.x, s.y + 0.4, s.z,
          sr * 0.4, sr * 4.0, 0.34, FIRE.hot, 0.24, 0.09);
      }

      // --- atmosphere venting -----------------------------------------------
      e.ventTimer -= dt;
      if (e.ventTimer <= 0 && e.ventLeft > 0) {
        e.ventLeft--;
        e.ventTimer = 0.09 + rng.next() * 0.1;
        const s = { x: 0, y: 0, z: 0 };
        rng.onSphere(s);
        const px = cx + s.x * R * 0.7, py = cy + s.y * R * 0.5, pz = cz + s.z * R * 0.7;

        P.begin(PKIND.GAS);
        P.setColor(FIRE.vent, 0.42);
        P.spec.life = 2.4 + rng.next() * 1.6;
        P.spec.size0 = R * 0.06;
        P.spec.size1 = R * 0.85;
        P.spec.drag = 1.4;
        P.spec.turbulence = R * 0.05;
        P.burst(4, px, py, pz, s.x, s.y, s.z, 0.16, R * 0.5, R * 1.6);
      }
    }
  }

  _stepWreckage(dt) {
    const P = this.particles;
    for (const pool of this.pools) {
      let anyColor = false;
      for (let i = pool.count - 1; i >= 0; i--) {
        pool.age[i] += dt;
        if (pool.age[i] >= pool.life[i]) { pool.kill(i); anyColor = true; continue; }

        pool.px[i] += pool.vx[i] * dt;
        pool.py[i] += pool.vy[i] * dt;
        pool.pz[i] += pool.vz[i] * dt;
        pool.angle[i] += pool.spin[i] * dt;

        // Burning wreckage trails fire for the first stretch of its flight. This is
        // where a lot of the "capital ship coming apart" read actually lives.
        if (pool.hot[i] > 0) {
          pool.emit[i] -= dt;
          if (pool.emit[i] <= 0) {
            pool.emit[i] = 0.10;
            const heat = Math.max(0, 1 - pool.age[i] / (pool.life[i] * 0.30));
            if (heat <= 0) {
              pool.hot[i] = 0;
            } else {
              P.begin(PKIND.FIRE);
              P.setColor(FIRE.body, 0.38 * heat);
              P.spec.life = 0.75;
              P.spec.size0 = pool.scale[i] * 1.1;
              P.spec.size1 = pool.scale[i] * 3.0;
              P.spec.drag = 2.5;
              P.spawn(pool.px[i], pool.py[i], pool.pz[i],
                pool.vx[i] * -0.12, pool.vy[i] * -0.12, pool.vz[i] * -0.12);
            }
          }
        }

        // Shrink away over the last fifth of life instead of vanishing on a frame.
        const tt = pool.age[i] / pool.life[i];
        const fade = tt > 0.8 ? Math.max(0, 1 - (tt - 0.8) / 0.2) : 1;
        const s = pool.scale[i] * fade;

        this._axis.set(pool.ax[i], pool.ay[i], pool.az[i]);
        this._q.setFromAxisAngle(this._axis, pool.angle[i]);
        this._pos.set(pool.px[i], pool.py[i], pool.pz[i]);
        this._scl.set(s, s, s);
        this._m4.compose(this._pos, this._q, this._scl);
        pool.mesh.setMatrixAt(i, this._m4);
      }
      pool.mesh.count = pool.count;
      pool.mesh.instanceMatrix.needsUpdate = true;
      if (anyColor && pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
    }
  }

  get liveWreckage() { return this.pools.reduce((a, p) => a + p.count, 0); }

  dispose() {
    this._offShip?.();
    this._offSub?.();
    for (const p of this.pools) p.dispose();
  }
}
