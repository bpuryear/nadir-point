/**
 * RINGS: expanding shockwaves and fixed-radius progress arcs.
 *
 * One instanced quad system, two fragment modes.
 *
 * SHOCKWAVE. A detonation in vacuum has no atmosphere to carry a blast front, so the
 * ring is honestly a convention - but it is the convention that makes a kill read as
 * an EVENT at tactical zoom, where the fireball itself is only forty pixels across.
 * It expands with a hard ease-out (fast, then decelerating), thins as it grows and
 * dies before it becomes a hoop. Two rings on different planes per capital kill: one
 * ring reads as a decal, two read as a detonation.
 *
 * PROGRESS ARC. The salvage cut needs a read the player can check at a glance without
 * looking at a UI panel, so the contact point wears a ring that fills clockwise. Same
 * geometry, same shader, different branch - a second program for one arc would be a
 * waste of the 90-program budget.
 */

import * as THREE from 'three';
import { instancedQuad, markVFXMaterial, DirtyRange } from './common.js';

export const RING_MODE = { SHOCKWAVE: 0, ARC: 1 };

const VERT = /* glsl */ `
  uniform float uTime;

  attribute vec3 aCentre;
  attribute vec3 aNormal;
  attribute vec4 aTime;    // birth, life, r0, r1
  attribute vec4 aColor;   // linear rgb, intensity
  attribute vec4 aParams;  // mode, progress, thickness, seed

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vT;
  varying float vMode;
  varying float vProgress;
  varying float vThickness;
  varying float vSeed;

  void main() {
    float age = uTime - aTime.x;
    float life = max(aTime.y, 1e-3);
    if (age < 0.0 || age > life) {
      vColor = vec3(0.0); vUv = vec2(0.0); vT = 1.0;
      vMode = 0.0; vProgress = 0.0; vThickness = 1.0; vSeed = 0.0;
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }

    float t = age / life;
    vT = t;
    vUv = uv;
    vColor = aColor.rgb * aColor.a;
    vMode = aParams.x;
    vProgress = aParams.y;
    vThickness = aParams.z;
    vSeed = aParams.w;

    // Hard ease-out. A blast front decelerates; a linear ring reads as an animation.
    float grow = 1.0 - pow(1.0 - t, 2.6);
    float radius = aParams.x < 0.5 ? mix(aTime.z, aTime.w, grow) : aTime.w;

    vec3 n = normalize(aNormal);
    vec3 ref = abs(n.y) < 0.88 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t1 = normalize(cross(ref, n));
    vec3 t2 = cross(n, t1);

    vec3 wp = aCentre + (t1 * position.x + t2 * position.y) * radius * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vT;
  varying float vMode;
  varying float vProgress;
  varying float vThickness;
  varying float vSeed;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;

    vec3 col;
    if (vMode < 0.5) {
      // SHOCKWAVE: a thin blast front, brightest while it is still small, and
      // gone well before it becomes a hoop. A ring that lingers stops reading as a
      // pressure wave and starts reading as an orbit diagram - the single easiest
      // way to make an explosion look like a shader demo.
      float w = vThickness * (1.0 - vT * 0.5);
      float d = abs(r - (1.0 - w)) / max(w, 1e-3);
      float band = exp(-d * d * 2.4);
      // Azimuthal irregularity. A perfectly even annulus reads as an orbit diagram;
      // a real blast front is lumpy because the hull that made it was.
      float ang = atan(p.y, p.x);
      float wobble = 0.58 + 0.42 * sin(ang * 5.0 + vSeed * 23.0) * sin(ang * 2.0 - vSeed * 11.0);
      float fade = pow(1.0 - vT, 3.2) * smoothstep(0.0, 0.035, vT);
      col = vColor * band * fade * wobble;
      col += vec3(1.0) * pow(band, 1.7) * pow(1.0 - vT, 5.0) * 0.26 * wobble;
    } else {
      // ARC: fixed radius, filled clockwise from 12 o'clock.
      float w = vThickness;
      float d = abs(r - (1.0 - w)) / max(w, 1e-3);
      float band = exp(-d * d * 6.0);
      float ang = atan(p.x, p.y);              // 0 at +Y, growing clockwise
      float frac = ang < 0.0 ? (ang + 6.2831853) / 6.2831853 : ang / 6.2831853;
      float filled = step(frac, vProgress);
      // The unfilled remainder stays faintly visible so the ring is a gauge, not a wedge.
      float amount = mix(0.13, 1.0, filled);
      // Leading pip
      float pip = exp(-pow((frac - vProgress) * 42.0, 2.0));
      col = vColor * band * (amount + pip * 1.6);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class RingSystem {
  /**
   * @param {Object} p
   * @param {number} [p.capacity]  total slots
   * @param {number} [p.arcSlots]  slots reserved for long-lived progress gauges.
   *   Arcs hold their slot for as long as the cut lasts, so they cannot share the
   *   shockwave ring buffer - the cursor would eventually wrap onto a live gauge and
   *   the two would overwrite each other every frame.
   */
  constructor({ capacity = 96, arcSlots = 12, rng } = {}) {
    this.capacity = capacity;
    this.arcSlots = Math.min(arcSlots, capacity - 1);
    this.rng = rng;
    this._head = this.arcSlots;   // shockwaves cycle above the reserved arc block
    this._arcHead = 0;
    this._time = 0;

    this.centre = new Float32Array(capacity * 3);
    this.normal = new Float32Array(capacity * 3);
    this.timing = new Float32Array(capacity * 4);
    this.color = new Float32Array(capacity * 4);
    this.params = new Float32Array(capacity * 4);

    const geo = instancedQuad(capacity);
    this.aCentre = new THREE.InstancedBufferAttribute(this.centre, 3);
    this.aNormal = new THREE.InstancedBufferAttribute(this.normal, 3);
    this.aTime = new THREE.InstancedBufferAttribute(this.timing, 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.color, 4);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    geo.setAttribute('aCentre', this.aCentre);
    geo.setAttribute('aNormal', this.aNormal);
    geo.setAttribute('aTime', this.aTime);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aParams', this.aParams);

    for (let i = 0; i < capacity; i++) {
      this.timing[i * 4] = -1e6;
      this.timing[i * 4 + 1] = 0.001;
      this.normal[i * 3 + 1] = 1;
    }

    this.material = markVFXMaterial(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }), 'rings');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:rings';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;

    this._dirty = new DirtyRange([this.aCentre, this.aNormal, this.aTime, this.aColor, this.aParams]);
    /** Slot handles for arcs that need to be re-driven (salvage progress). */
    this._arcs = new Map();
  }

  /**
   * @param {number} nx,ny,nz  plane normal. Pass a jittered vector - a ring exactly
   *                           on the combat plane looks like a debug gizmo.
   */
  shockwave(x, y, z, nx, ny, nz, r0, r1, life, color, intensity = 1, thickness = 0.06) {
    return this._write(x, y, z, nx, ny, nz, r0, r1, life, color, intensity,
      RING_MODE.SHOCKWAVE, 0, thickness);
  }

  /** A progress gauge that must be refreshed every frame it is wanted. */
  arc(key, x, y, z, nx, ny, nz, radius, progress, color, intensity = 1, thickness = 0.055) {
    let slot = this._arcs.get(key);
    if (slot === undefined) {
      slot = this._arcHead;
      this._arcHead = (this._arcHead + 1) % this.arcSlots;
      this._arcs.set(key, slot);
    }
    this._writeAt(slot, x, y, z, nx, ny, nz, radius, radius, 0.25, color, intensity,
      RING_MODE.ARC, progress, thickness);
    return slot;
  }

  releaseArc(key) { this._arcs.delete(key); }

  _write(x, y, z, nx, ny, nz, r0, r1, life, color, intensity, mode, progress, thickness) {
    const i = this._head;
    this._head = this._head + 1 >= this.capacity ? this.arcSlots : this._head + 1;
    this._writeAt(i, x, y, z, nx, ny, nz, r0, r1, life, color, intensity, mode, progress, thickness);
    return i;
  }

  _writeAt(i, x, y, z, nx, ny, nz, r0, r1, life, color, intensity, mode, progress, thickness) {
    const i3 = i * 3, i4 = i * 4;
    this.centre[i3] = x; this.centre[i3 + 1] = y; this.centre[i3 + 2] = z;
    this.normal[i3] = nx; this.normal[i3 + 1] = ny; this.normal[i3 + 2] = nz;
    this.timing[i4] = this._time;
    this.timing[i4 + 1] = life;
    this.timing[i4 + 2] = r0;
    this.timing[i4 + 3] = r1;
    this.color[i4] = color.r; this.color[i4 + 1] = color.g;
    this.color[i4 + 2] = color.b; this.color[i4 + 3] = intensity;
    this.params[i4] = mode;
    this.params[i4 + 1] = progress;
    this.params[i4 + 2] = thickness;
    this.params[i4 + 3] = this.rng ? this.rng.next() : 0.5;
    this._dirty.touch(i);
  }

  update(time) {
    this._time = time;
    this.material.uniforms.uTime.value = time;
    this._dirty.flush();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
