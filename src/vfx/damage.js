/**
 * PERSISTENT DAMAGE.
 *
 * Everything else in this directory is transient. This file is the part that STAYS,
 * and it is the part that makes a hull tell its own story: where it has been hit,
 * what is still burning, and what no longer works.
 *
 * Four mechanisms, in increasing order of how much they matter:
 *
 *   SCORCH        Carbon decals stamped at real impact points, built from the scorch
 *                 generator in art/textures/scorch.js, carried in ship-LOCAL space so
 *                 they turn with the hull. One instanced quad batch for every hull in
 *                 the scene. They only ever darken, which is the correct behaviour for
 *                 carbon and also means they never fight the lighting.
 *
 *   VENTING       A breached section bleeds atmosphere in a tight cone for half a
 *                 minute, then seals. Gas is dim, has no hot core and expands; if it
 *                 read as a light source it would look like a second engine.
 *
 *   SPARKING      Irregular electrical spatter at the breach. Short, hot, quiet.
 *
 *   DEAD EMISSIVES  The one that actually changes how the game plays. Every emissive
 *                 mesh on a hull is bound to its nearest subsystem at registration
 *                 time. Kill the subsystem and those lights GO OUT and stay out. A
 *                 destroyer that has lost its drives is visibly dark at the stern from
 *                 two kilometres away, which is the whole promise of a game about
 *                 shooting specific pieces off a ship. A wreck goes fully dark.
 *
 *                 InstancedMesh light strips are bound to the hull rather than to a
 *                 subsystem, because a running-light batch spans the whole ship and
 *                 hiding it for one dead engine would black out the entire hull.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { markVFXMaterial, FIRE, hullRadius } from './common.js';
import { PKIND } from './particles.js';

const EMISSIVE_KEYS = new Set(['emissive', 'engineGlow', 'runningLights']);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class DamageVFX {
  constructor(world, { particles, rings, materials, rng, decalCapacity = 96, ventCapacity = 24 }) {
    this.world = world;
    this.particles = particles;
    this.rings = rings;
    this.rng = rng;
    this.group = new THREE.Group();
    this.group.name = 'vfx:damage';

    // --- scorch decals ----------------------------------------------------
    this.decals = null;
    this.decalCapacity = decalCapacity;
    if (materials?.textures?.get) {
      const scorch = materials.textures.get('scorch', {
        faction: 'player', severity: 0.85, size: 256,
      });
      const tex = scorch.texture;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      // A pure DARKENING blend: dst *= (1 - srcAlpha). Carbon deposits subtract
      // light and never add any, so the decal's own near-black RGB is irrelevant -
      // only its coverage matters. Straight alpha blending made the stain almost
      // invisible against an already dark hull; this cannot fail to read, and it
      // cannot brighten a shadow, which a lit decal on an unlit quad would.
      const mat = markVFXMaterial(new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }), 'scorch-decal');
      const quad = new THREE.PlaneGeometry(1, 1);
      const inst = new THREE.InstancedMesh(quad, mat, decalCapacity);
      inst.name = 'vfx:scorch';
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.count = 0;
      inst.renderOrder = 4;
      this.decals = inst;
      this.group.add(inst);
    }

    this.dCount = 0;
    this.dShip = new Array(decalCapacity).fill(null);
    this.dLocal = new Float32Array(decalCapacity * 3);
    this.dNormal = new Float32Array(decalCapacity * 3);
    this.dRoll = new Float32Array(decalCapacity);
    this.dSize = new Float32Array(decalCapacity);

    // --- vents ------------------------------------------------------------
    this.ventCapacity = ventCapacity;
    this.vents = new Array(ventCapacity);
    for (let i = 0; i < ventCapacity; i++) {
      this.vents[i] = {
        ship: null, lx: 0, ly: 0, lz: 0, nx: 0, ny: 1, nz: 0,
        scale: 20, remaining: 0, gasTimer: 0, sparkTimer: 0,
      };
    }
    this._ventHead = 0;

    // --- emissive bookkeeping --------------------------------------------
    /** @type {Map<Object, {sub: Map<string, THREE.Object3D[]>, hull: THREE.Object3D[]}>} */
    this._known = new Map();

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qr = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._scl = new THREE.Vector3();
    this._inv = new THREE.Matrix4();
    this._ray = new THREE.Raycaster();
    this._rayOrigin = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();

    this._offImpact = world.bus.on(EV.PROJECTILE_IMPACT, (e) => this.onImpact(e));
    this._offSubHit = world.bus.on(EV.SUBSYSTEM_HIT, (e) => this.onSubsystemHit(e));
    this._offSub = world.bus.on(EV.SUBSYSTEM_DESTROYED, (e) => this.onSubsystemDestroyed(e));
    this._offDead = world.bus.on(EV.SHIP_DESTROYED, (e) => this.onShipDestroyed(e));
    this._offSpawn = world.bus.on(EV.SHIP_SPAWNED, (s) => this.registerShip(s));
    this._offBreach = world.bus.on(EV.HARDPOINT_BREACHED, (e) => this.onHardpointBreached(e));

    for (const s of world.ships) this.registerShip(s);
  }

  // ------------------------------------------------------------- registration

  /** Idempotent. Buckets a hull's emissive meshes by the subsystem nearest to them. */
  registerShip(ship) {
    if (!ship?.root || this._known.has(ship)) return;
    const rec = { sub: new Map(), hull: [], box: new THREE.Box3() };
    this._known.set(ship, rec);

    ship.root.updateWorldMatrix(true, true);
    this._inv.copy(ship.root.matrixWorld).invert();

    // Hull-local bounding box, used to lay decals ON the plating instead of
    // floating them in the vacuum beside it.
    rec.box.setFromObject(ship.root);
    if (!rec.box.isEmpty()) rec.box.applyMatrix4(this._inv);

    const subs = [];
    if (ship.subsystems) for (const s of ship.subsystems.values()) subs.push(s);

    ship.root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let emissive = false;
      for (const m of mats) if (m && EMISSIVE_KEYS.has(m.userData?.materialKey)) emissive = true;
      if (!emissive) return;

      // Batched light strips span the whole hull; they belong to the hull, not to
      // one subsystem, or a single dead engine would black out every running light.
      if (o.isInstancedMesh || subs.length === 0) { rec.hull.push(o); return; }

      o.getWorldPosition(this._v);
      this._v.applyMatrix4(this._inv);
      let best = null;
      let bestD2 = Infinity;
      for (const s of subs) {
        const [px, py, pz] = s.def.position;
        const d2 = (this._v.x - px) ** 2 + (this._v.y - py) ** 2 + (this._v.z - pz) ** 2;
        const reach = (s.def.radius * 2.4) ** 2;
        if (d2 < reach && d2 < bestD2) { bestD2 = d2; best = s; }
      }
      if (best) {
        let list = rec.sub.get(best.def.id);
        if (!list) rec.sub.set(best.def.id, (list = []));
        list.push(o);
      } else {
        rec.hull.push(o);
      }
    });
  }

  // -------------------------------------------------------------------- events

  onImpact({ point, target, type }) {
    if (!point || !target?.root) return;
    // Point defence chatter would carpet a hull in decals within a minute.
    if (type === 'pdslug' || type === 'flak') return;
    const size = type === 'missile' || type === 'railslug' || type === 'lance'
      ? 70 + this.rng.next() * 70
      : 34 + this.rng.next() * 46;
    this.addScorch(target, point, size);
  }

  onSubsystemHit({ ship, subsystem, point }) {
    if (!point || !ship) return;
    // A subsystem taking a real hit sparks even when it survives.
    const P = this.particles;
    P.begin(PKIND.SPARK);
    P.setColor(FIRE.spark, 0.45);
    P.spec.life = 0.2;
    P.spec.size0 = 3.0;
    P.spec.size1 = 0.4;
    P.spec.drag = 3.2;
    P.burst(5, point.x, point.y, point.z, 0, 1, 0, 1.0, 40, 260);
  }

  onSubsystemDestroyed({ ship, subsystem, point }) {
    if (!ship) return;
    const rec = this._known.get(ship);
    if (rec) {
      const list = rec.sub.get(subsystem?.def?.id);
      if (list) for (const m of list) m.visible = false;
    }

    const [lx, ly, lz] = subsystem?.def?.position ?? [0, 0, 0];
    const r = subsystem?.def?.radius ?? 40;
    this.addVent(ship, lx, ly, lz, r);
    if (point) this.addScorch(ship, point, r * 1.8);
  }

  onHardpointBreached({ ship, hardpoint }) {
    const obj = hardpoint?.object;
    if (!obj) return;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && EMISSIVE_KEYS.has(m.userData?.materialKey)) { o.visible = false; break; }
      }
    });
    obj.getWorldPosition(this._v);
    this.addVent(ship, 0, 0, 0, hullRadius(ship) * 0.2, this._v);
  }

  /** A dead hull is a dark hull. Every light on it goes out, permanently. */
  onShipDestroyed({ ship }) {
    const rec = this._known.get(ship);
    if (rec) {
      for (const list of rec.sub.values()) for (const m of list) m.visible = false;
      for (const m of rec.hull) m.visible = false;
    }
    // Stop venting from a hull that no longer exists; the explosion owns it now.
    for (const v of this.vents) if (v.ship === ship) v.remaining = 0;
  }

  // -------------------------------------------------------------------- API

  /** Stamp a carbon decal at a world-space point on `ship`. */
  addScorch(ship, point, size) {
    if (!this.decals || !ship?.root) return;
    this.registerShip(ship);
    const i = this.dCount < this.decalCapacity ? this.dCount++ : (this._decalHead = ((this._decalHead ?? 0) + 1) % this.decalCapacity);

    // Children too: the raycast below needs every mesh's matrixWorld, and an impact
    // can arrive from a fixed step that ran after the last render.
    ship.root.updateWorldMatrix(true, true);
    this._inv.copy(ship.root.matrixWorld).invert();
    this._v.copy(point).applyMatrix4(this._inv);

    /*
     * Find the actual plating.
     *
     * A carbon stain is near-black. Put it one metre off the hull and it is a black
     * quad against a black starfield - invisible, which is exactly what the first two
     * versions of this looked like. So we cast a ray from outside the hull, straight
     * down the line from the hull centre through the impact, and take the first real
     * surface it meets. That is a handful of triangle tests per HIT, not per frame,
     * and it is the difference between damage you can see and damage you cannot.
     *
     * The bounding-box projection below is the fallback for a ray that misses (thin
     * or open geometry).
     */
    const rec = this._known.get(ship);
    const box = rec?.box;
    this._v2.set(0, 1, 0);

    let landed = false;
    {
      const reach = hullRadius(ship) * 1.7;
      this._v3.copy(point).sub(ship.position);
      if (this._v3.lengthSq() < 1e-6) this._v3.set(0, 1, 0);
      this._v3.normalize();
      this._rayOrigin.copy(ship.position).addScaledVector(this._v3, reach);
      this._rayDir.copy(this._v3).negate();
      this._ray.set(this._rayOrigin, this._rayDir);
      this._ray.far = reach * 2.4;
      const hits = this._ray.intersectObject(ship.root, true);
      for (const h of hits) {
        if (!h.object?.visible) continue;
        this._v.copy(h.point).applyMatrix4(this._inv);
        if (h.normal) {
          this._v2.copy(h.normal);
          // face normal is in the hit object's local space; bring it to hull space
          this._v2.transformDirection(h.object.matrixWorld).transformDirection(this._inv);
          if (this._v2.dot(this._v3) < 0) this._v2.negate();
        } else {
          this._v2.copy(this._v3);
        }
        this._v2.normalize();
        landed = true;
        break;
      }
    }

    if (landed) {
      // nothing further to do - the ray gave us both point and normal
    } else if (box && !box.isEmpty()) {
      box.getCenter(this._v3);
      const hx = Math.max(1e-3, (box.max.x - box.min.x) * 0.5);
      const hy = Math.max(1e-3, (box.max.y - box.min.y) * 0.5);
      const hz = Math.max(1e-3, (box.max.z - box.min.z) * 0.5);
      const dx = (this._v.x - this._v3.x) / hx;
      const dy = (this._v.y - this._v3.y) / hy;
      const dz = (this._v.z - this._v3.z) / hz;
      const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
      const m = size * 0.35;
      const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
      if (ax >= ay && ax >= az) {
        const sgn = dx >= 0 ? 1 : -1;
        this._v.set(this._v3.x + sgn * hx,
          clamp(this._v.y, box.min.y + m, box.max.y - m),
          clamp(this._v.z, box.min.z + m, box.max.z - m));
        this._v2.set(sgn, 0, 0);
      } else if (ay >= az) {
        const sgn = dy >= 0 ? 1 : -1;
        this._v.set(clamp(this._v.x, box.min.x + m, box.max.x - m),
          this._v3.y + sgn * hy,
          clamp(this._v.z, box.min.z + m, box.max.z - m));
        this._v2.set(0, sgn, 0);
      } else {
        const sgn = dz >= 0 ? 1 : -1;
        this._v.set(clamp(this._v.x, box.min.x + m, box.max.x - m),
          clamp(this._v.y, box.min.y + m, box.max.y - m),
          this._v3.z + sgn * hz);
        this._v2.set(0, 0, sgn);
      }
    } else {
      this._v2.copy(this._v);
      if (this._v2.lengthSq() < 1e-6) this._v2.set(0, 1, 0);
      this._v2.normalize();
    }

    const i3 = i * 3;
    this.dShip[i] = ship;
    this.dLocal[i3] = this._v.x; this.dLocal[i3 + 1] = this._v.y; this.dLocal[i3 + 2] = this._v.z;
    this.dNormal[i3] = this._v2.x; this.dNormal[i3 + 1] = this._v2.y; this.dNormal[i3 + 2] = this._v2.z;
    this.dRoll[i] = this.rng.next() * Math.PI * 2;
    this.dSize[i] = size;
  }

  /**
   * Open a breach that vents atmosphere and sparks. Thirty seconds, then it seals -
   * a hull that vents forever eventually owns the whole particle budget.
   */
  addVent(ship, lx, ly, lz, scale, worldPoint = null) {
    const v = this.vents[this._ventHead];
    this._ventHead = (this._ventHead + 1) % this.ventCapacity;
    if (worldPoint && ship?.root) {
      ship.root.updateWorldMatrix(true, false);
      this._inv.copy(ship.root.matrixWorld).invert();
      this._v.copy(worldPoint).applyMatrix4(this._inv);
      lx = this._v.x; ly = this._v.y; lz = this._v.z;
    }
    v.ship = ship;
    v.lx = lx; v.ly = ly; v.lz = lz;
    const l = Math.hypot(lx, ly, lz) || 1;
    v.nx = lx / l; v.ny = ly / l; v.nz = lz / l;
    v.scale = Math.max(8, scale);
    v.remaining = 30;
    v.gasTimer = 0;
    v.sparkTimer = this.rng.next() * 0.8;
  }

  // ---------------------------------------------------------------- per step

  fixedUpdate(dt) {
    const P = this.particles;
    for (const v of this.vents) {
      if (!v.ship || v.remaining <= 0) continue;
      if (v.ship.dead) { v.remaining = 0; continue; }
      v.remaining -= dt;

      const root = v.ship.root;
      if (!root) { v.remaining = 0; continue; }
      root.updateWorldMatrix(true, false);
      this._v.set(v.lx, v.ly, v.lz).applyMatrix4(root.matrixWorld);
      this._v2.set(v.nx, v.ny, v.nz).transformDirection(root.matrixWorld);

      // Rate falls off as the compartment empties.
      const pressure = Math.max(0.12, Math.min(1, v.remaining / 12));

      v.gasTimer -= dt;
      if (v.gasTimer <= 0) {
        v.gasTimer = 0.06 / pressure;
        P.begin(PKIND.GAS);
        P.setColor(FIRE.vent, 0.7 * pressure + 0.12);
        P.spec.life = 1.6 + this.rng.next() * 1.4;
        P.spec.size0 = v.scale * 0.16;
        P.spec.size1 = v.scale * 2.2;
        P.spec.drag = 1.6;
        P.spec.turbulence = v.scale * 0.06;
        P.burst(2, this._v.x, this._v.y, this._v.z,
          this._v2.x, this._v2.y, this._v2.z, 0.18,
          v.scale * 2.0 * pressure, v.scale * 6.0 * pressure);

        // A thin hot jet right at the lip, so the breach has a source.
        P.begin(PKIND.FIRE);
        P.setColor(FIRE.ventHot, 0.35 * pressure);
        P.spec.life = 0.22;
        P.spec.size0 = v.scale * 0.20;
        P.spec.size1 = v.scale * 0.6;
        P.spec.drag = 5;
        P.spawn(this._v.x, this._v.y, this._v.z,
          this._v2.x * v.scale * 2, this._v2.y * v.scale * 2, this._v2.z * v.scale * 2);
      }

      v.sparkTimer -= dt;
      if (v.sparkTimer <= 0) {
        v.sparkTimer = 0.45 + this.rng.next() * 1.5;
        P.begin(PKIND.SPARK);
        P.setColor(FIRE.spark, 0.55);
        P.spec.life = 0.16 + this.rng.next() * 0.16;
        P.spec.size0 = v.scale * 0.10;
        P.spec.size1 = 0.4;
        P.spec.drag = 3.6;
        P.spec.turbulence = 4;
        P.burst(6, this._v.x, this._v.y, this._v.z,
          this._v2.x, this._v2.y, this._v2.z, 0.9, 30, 220);
      }
    }
  }

  /** Rebuild decal transforms. Cheap: bounded by `decalCapacity`. */
  update() {
    const inst = this.decals;
    if (!inst || this.dCount === 0) return;
    let live = 0;
    for (let i = 0; i < this.dCount; i++) {
      const ship = this.dShip[i];
      if (!ship?.root?.parent) continue;
      const i3 = i * 3;
      this._v.set(this.dLocal[i3], this.dLocal[i3 + 1], this.dLocal[i3 + 2]);
      this._v2.set(this.dNormal[i3], this.dNormal[i3 + 1], this.dNormal[i3 + 2]);
      // Lift off the plating so the decal is not fighting the hull's own depth.
      this._v.addScaledVector(this._v2, 2.0);

      ship.root.updateWorldMatrix(true, false);
      this._v.applyMatrix4(ship.root.matrixWorld);
      this._v2.transformDirection(ship.root.matrixWorld);

      this._q.setFromUnitVectors(Z_AXIS, this._v2);
      this._qr.setFromAxisAngle(Z_AXIS, this.dRoll[i]);
      this._q.multiply(this._qr);

      const s = this.dSize[i];
      this._scl.set(s, s, s);
      this._m4.compose(this._v, this._q, this._scl);
      inst.setMatrixAt(live++, this._m4);
    }
    inst.count = live;
    inst.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this._offImpact?.();
    this._offSubHit?.();
    this._offSub?.();
    this._offDead?.();
    this._offSpawn?.();
    this._offBreach?.();
    this.decals?.geometry.dispose();
    this.decals?.material.dispose();
  }
}
