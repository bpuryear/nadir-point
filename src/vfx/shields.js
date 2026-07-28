/**
 * SHIELD IMPACTS.
 *
 * There is no shield bubble in this game. A permanently visible sphere around every
 * hull would erase the one thing the whole art direction is built on - the SILHOUETTE
 * - and it would do it at exactly the zoom level where silhouette is the only cue the
 * player has. So the shield only exists at the instant it does something.
 *
 * What you see on a hit is a hexagonal ripple propagating outward from the contact
 * point across an invisible sphere: a hard bright wavefront, a lattice that lights up
 * as the wave passes over it, a fresnel term so the sphere reads as curved, and a
 * roughly half-second life. Ripples stick to the hull in LOCAL space, so a ship that
 * yaws under fire carries its impact marks around with it.
 *
 * One instanced icosphere, one draw call, additive, no depth write.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { markVFXMaterial, factionVFX, FACTION_ORDER, hullRadius } from './common.js';

const VERT = /* glsl */ `
  uniform float uTime;

  attribute vec3 aCentre;
  attribute vec3 aDir;      // impact direction, unit, world space
  attribute vec4 aParams;   // birth, life, radius, seed
  attribute vec4 aColor;

  varying vec3 vN;
  varying vec3 vDir;
  varying vec3 vB1;
  varying vec3 vB2;
  varying vec3 vView;
  varying vec3 vColor;
  varying float vT;

  void main() {
    float age = uTime - aParams.x;
    float life = max(aParams.y, 1e-3);
    if (age < 0.0 || age > life) {
      vN = vec3(0.0, 1.0, 0.0); vDir = vN; vB1 = vN; vB2 = vN; vView = vN;
      vColor = vec3(0.0); vT = 1.0;
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }

    vT = age / life;
    vN = normalize(position);
    vDir = normalize(aDir);
    vColor = aColor.rgb * aColor.a;

    vec3 ref = abs(vDir.y) < 0.88 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vB1 = normalize(cross(ref, vDir));
    vB2 = cross(vDir, vB1);

    // The shell swells very slightly as the wave crosses it - reads as give.
    float swell = 1.0 + 0.035 * sin(vT * 3.14159) ;
    vec3 wp = aCentre + vN * aParams.z * swell;
    vView = normalize(cameraPosition - wp);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vN;
  varying vec3 vDir;
  varying vec3 vB1;
  varying vec3 vB2;
  varying vec3 vView;
  varying vec3 vColor;
  varying float vT;

  vec2 hexLocal(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 hC = floor(p / s) + 0.5;
    vec2 o1 = p - hC * s;
    vec2 o2 = p - (hC + vec2(0.5)) * s;
    return dot(o1, o1) < dot(o2, o2) ? o1 : o2;
  }

  float hexEdge(vec2 p) {
    vec2 o = abs(hexLocal(p));
    const vec2 k = vec2(0.5, 0.8660254);
    float d = max(dot(o, k), o.x);
    return smoothstep(0.34, 0.5, d);
  }

  void main() {
    // Angular distance from the impact point, in radians. 0 at the hit, pi opposite.
    float ang = acos(clamp(dot(vN, vDir), -1.0, 1.0));

    // Wavefront sweeps out with a decelerating profile.
    float front = 0.14 + 2.55 * pow(vT, 0.60);
    float d = (ang - front) / 0.20;
    float band = exp(-d * d);

    vec2 hp = vec2(dot(vN, vB1), dot(vN, vB2)) * 14.0;
    float lattice = hexEdge(hp);

    float fres = pow(1.0 - abs(dot(vN, vView)), 2.0);
    float impact = exp(-pow(ang / 0.28, 2.0)) * pow(1.0 - vT, 2.4);

    float a = band * (0.18 + 0.82 * lattice) * (0.34 + 0.80 * fres);
    a = (a + impact * 1.05) * pow(1.0 - vT, 1.05);

    vec3 col = vColor * a;
    col += vec3(1.0, 1.0, 1.0) * impact * impact * 0.7;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class ShieldVFX {
  constructor(world, { capacity = 16, rng } = {}) {
    this.world = world;
    this.capacity = capacity;
    this.rng = rng;
    this._head = 0;
    this.life = 0.72;

    this.centre = new Float32Array(capacity * 3);
    this.dir = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 4);

    /** CPU-side book-keeping so a ripple follows its hull. */
    this.slots = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = { ship: null, lx: 0, ly: 0, lz: 1, birth: -1e6, life: 0.001, radius: 1 };
      this.params[i * 4] = -1e6;
      this.params[i * 4 + 1] = 0.001;
    }

    const base = new THREE.IcosahedronGeometry(1, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(base.getIndex());
    geo.setAttribute('position', base.getAttribute('position'));
    geo.instanceCount = capacity;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
    this._base = base;

    this.aCentre = new THREE.InstancedBufferAttribute(this.centre, 3);
    this.aDir = new THREE.InstancedBufferAttribute(this.dir, 3);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.col, 4);
    geo.setAttribute('aCentre', this.aCentre);
    geo.setAttribute('aDir', this.aDir);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aColor', this.aColor);

    this.material = markVFXMaterial(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }), 'shields');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:shields';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;

    this.palettes = Object.create(null);
    for (const f of FACTION_ORDER) this.palettes[f] = factionVFX(f);

    this._time = 0;
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();

    this._off = world.bus.on(EV.SHIELD_IMPACT, (e) => this.onImpact(e));
  }

  /**
   * @param {{ship:Object, point:THREE.Vector3, amount:number}} e
   */
  onImpact({ ship, point, amount = 1 }) {
    if (!ship) return;
    const r = hullRadius(ship);

    // Direction from hull centre to the contact, stored in HULL LOCAL space so the
    // ripple travels with the ship rather than sliding across it as she turns.
    let dx = 0, dy = 0, dz = 1;
    if (point) {
      dx = point.x - ship.position.x;
      dy = point.y - ship.position.y;
      dz = point.z - ship.position.z;
      const l = Math.hypot(dx, dy, dz);
      if (l > 1e-4) { dx /= l; dy /= l; dz /= l; } else { dx = 0; dy = 0; dz = 1; }
    }

    const slot = this.slots[this._head];
    if (ship.planeLocked !== false && ship.body?.heading !== undefined) {
      const h = -(ship.body.heading);
      const s = Math.sin(h), c = Math.cos(h);
      slot.lx = dx * c + dz * s;
      slot.ly = dy;
      slot.lz = dz * c - dx * s;
    } else if (ship.body?.quaternion) {
      this._v.set(dx, dy, dz).applyQuaternion(this._q.copy(ship.body.quaternion).invert());
      slot.lx = this._v.x; slot.ly = this._v.y; slot.lz = this._v.z;
    } else {
      slot.lx = dx; slot.ly = dy; slot.lz = dz;
    }

    slot.ship = ship;
    slot.birth = this._time;
    slot.life = this.life;
    slot.radius = r * 1.06;
    slot.intensity = Math.min(2.2, 0.55 + Math.sqrt(Math.max(0, amount)) * 0.12);

    const pal = this.palettes[ship.faction] ?? this.palettes.player;
    const i4 = this._head * 4;
    this.col[i4] = pal.shield.r; this.col[i4 + 1] = pal.shield.g;
    this.col[i4 + 2] = pal.shield.b; this.col[i4 + 3] = slot.intensity;

    this._head = (this._head + 1) % this.capacity;
  }

  /** Rebuild the whole (tiny) buffer each frame so ripples track their hulls. */
  update(time) {
    this._time = time;
    this.material.uniforms.uTime.value = time;

    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      const i3 = i * 3, i4 = i * 4;
      const age = time - s.birth;
      if (!s.ship || age < 0 || age > s.life) {
        this.params[i4] = -1e6;
        this.params[i4 + 1] = 0.001;
        continue;
      }
      any = true;
      const ship = s.ship;
      this.centre[i3] = ship.position.x;
      this.centre[i3 + 1] = ship.position.y;
      this.centre[i3 + 2] = ship.position.z;

      if (ship.planeLocked !== false && ship.body?.heading !== undefined) {
        const h = ship.body.heading;
        const sn = Math.sin(h), c = Math.cos(h);
        this.dir[i3] = s.lx * c + s.lz * sn;
        this.dir[i3 + 1] = s.ly;
        this.dir[i3 + 2] = s.lz * c - s.lx * sn;
      } else if (ship.body?.quaternion) {
        this._v.set(s.lx, s.ly, s.lz).applyQuaternion(ship.body.quaternion);
        this.dir[i3] = this._v.x; this.dir[i3 + 1] = this._v.y; this.dir[i3 + 2] = this._v.z;
      } else {
        this.dir[i3] = s.lx; this.dir[i3 + 1] = s.ly; this.dir[i3 + 2] = s.lz;
      }

      this.params[i4] = s.birth;
      this.params[i4 + 1] = s.life;
      this.params[i4 + 2] = s.radius;
      this.params[i4 + 3] = i * 0.191;
    }

    this.aCentre.needsUpdate = true;
    this.aDir.needsUpdate = true;
    this.aParams.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.mesh.visible = any;
  }

  dispose() {
    this._off?.();
    this._base.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
