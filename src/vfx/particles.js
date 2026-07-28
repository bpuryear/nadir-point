/**
 * GPU PARTICLE SYSTEM.
 *
 * One `Mesh`, one `InstancedBufferGeometry`, one draw call, for every spark, ember,
 * fireball, gas plume and slag droplet in the game.
 *
 * THE CPU NEVER TOUCHES A LIVE PARTICLE. Attributes are written exactly once, at
 * spawn, into a ring buffer, and only the dirty slice is uploaded. From then on the
 * vertex shader integrates the whole thing analytically from a single time uniform:
 *
 *     x(t) = origin + v * (1 - e^(-k t)) / k        (exponential drag, closed form)
 *
 * That closed form matters. A per-frame Euler step would need the CPU to own the
 * state; solving the drag ODE means a particle's position at any time is a pure
 * function of its spawn parameters, so ten thousand of them cost one uniform write.
 *
 * Time is SIM time, so particles pause when the game pauses and run at 4x when the
 * game does. Expired slots collapse to a degenerate vertex behind the far plane and
 * are clipped before rasterisation, which is cheaper than any CPU compaction.
 */

import * as THREE from 'three';
import { instancedQuad, markVFXMaterial, DirtyRange } from './common.js';

/** Fragment behaviour selector. Four looks is enough; more would be noise. */
export const PKIND = {
  SPARK: 0,     // hard, tiny, snappy - shrapnel and welding spatter
  FIRE: 1,      // soft core, cools white -> amber -> red over its life
  GAS: 2,       // no core at all, expands, dim; venting atmosphere and smoke
  EMBER: 3,     // cooling metal; starts white, ends a dull glowing orange
};

const VERT = /* glsl */ `
  uniform float uTime;

  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute vec4 aTime;    // birth, life, size0, size1
  attribute vec4 aColor;   // linear rgb, intensity
  attribute vec4 aParams;  // drag, turbulence, seed, kind

  varying vec3 vColor;
  varying float vT;
  varying float vKind;
  varying vec2 vUv;

  void main() {
    float age = uTime - aTime.x;
    float life = max(aTime.y, 1e-3);

    // Dead or not yet born: collapse behind the far plane so it is clipped.
    if (age < 0.0 || age > life) {
      vColor = vec3(0.0); vT = 1.0; vKind = 0.0; vUv = vec2(0.0);
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }

    float t = age / life;
    vT = t;
    vKind = aParams.w;
    vColor = aColor.rgb * aColor.a;
    vUv = uv;

    // Closed-form exponential drag. k -> 0 degenerates to ballistic motion.
    float k = aParams.x;
    float disp = k > 1e-3 ? (1.0 - exp(-k * age)) / k : age;
    vec3 wp = aOrigin + aVel * disp;

    // Turbulence grows with age so a burst starts coherent and comes apart.
    float s = aParams.z;
    wp += aParams.y * age * vec3(
      sin(age * 1.71 + s * 6.28),
      sin(age * 2.13 + s * 11.3),
      cos(age * 1.93 + s * 4.11)
    );

    float size = mix(aTime.z, aTime.w, t);

    // View-space billboard, rotated per-particle so bursts do not read as a grid.
    vec4 mv = modelViewMatrix * vec4(wp, 1.0);
    float rot = s * 6.2831 + age * (s - 0.5) * 3.4;
    float cr = cos(rot), sr = sin(rot);
    vec2 corner = position.xy * size;
    mv.xy += vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr);

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vT;
  varying float vKind;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float edge = 1.0 - sqrt(r2);

    float core = edge * edge * edge * edge;
    float halo = pow(edge, 1.6);

    vec3 col;
    float fade;

    if (vKind < 0.5) {
      // SPARK - almost all core, gone fast, no soft skirt to muddy the frame.
      fade = pow(1.0 - vT, 2.4);
      col = vColor * (core * 2.4 + halo * 0.22);
    } else if (vKind < 1.5) {
      // FIRE - white-hot at birth, amber through the middle, dull red at death.
      fade = smoothstep(0.0, 0.04, vT) * pow(1.0 - vT, 1.25);
      float heat = pow(1.0 - vT, 2.2);
      col = mix(vColor * 0.26, vColor + vec3(1.0, 0.62, 0.26) * 0.85, heat);
      col *= (core * 1.0 + halo * 0.50);
    } else if (vKind < 2.5) {
      // GAS - no core. Escaping atmosphere is a volume, not a light source.
      fade = smoothstep(0.0, 0.16, vT) * pow(1.0 - vT, 1.5);
      col = vColor * pow(edge, 1.1) * 0.30;
    } else {
      // EMBER - cooling metal. Bright white at first, then it just sits there glowing.
      float heat = pow(1.0 - vT, 3.2);
      fade = pow(1.0 - vT, 0.9);
      col = mix(vColor, vec3(1.0, 0.94, 0.84) * 1.5, heat);
      col *= (core * 1.5 + halo * 0.20);
    }

    gl_FragColor = vec4(col * fade, 1.0);
  }
`;

/**
 * @param {number} capacity  ring size. 4096 covers a cruiser detonation plus two
 *                           sustained cutting beams with room to spare.
 */
export class ParticleSystem {
  constructor({ capacity = 4096, rng } = {}) {
    this.capacity = capacity;
    this.rng = rng;
    this._head = 0;
    this._time = 0;

    this.origin = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.timing = new Float32Array(capacity * 4);
    this.color = new Float32Array(capacity * 4);
    this.params = new Float32Array(capacity * 4);

    const geo = instancedQuad(capacity);
    this.aOrigin = new THREE.InstancedBufferAttribute(this.origin, 3);
    this.aVel = new THREE.InstancedBufferAttribute(this.vel, 3);
    this.aTime = new THREE.InstancedBufferAttribute(this.timing, 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.color, 4);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    geo.setAttribute('aOrigin', this.aOrigin);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aTime', this.aTime);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aParams', this.aParams);

    // Everything starts dead: birth in the far past, zero life.
    for (let i = 0; i < capacity; i++) {
      this.timing[i * 4] = -1e6;
      this.timing[i * 4 + 1] = 0.001;
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
    }), 'particles');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:particles';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;

    this._dirty = new DirtyRange([this.aOrigin, this.aVel, this.aTime, this.aColor, this.aParams]);

    /**
     * The emission descriptor. Mutated in place and read by `spawn`, so a burst of
     * two hundred particles costs zero objects. Reset by `begin()`.
     */
    this.spec = {
      life: 1, size0: 6, size1: 6,
      r: 1, g: 1, b: 1, intensity: 1,
      drag: 0, turbulence: 0, kind: PKIND.SPARK,
    };
  }

  /** Reset the descriptor and return it for configuration. */
  begin(kind = PKIND.SPARK) {
    const s = this.spec;
    s.life = 1; s.size0 = 6; s.size1 = 6;
    s.r = 1; s.g = 1; s.b = 1; s.intensity = 1;
    s.drag = 0; s.turbulence = 0; s.kind = kind;
    return s;
  }

  /** Copy a linear THREE.Color into the descriptor. `scale` trims it per emission. */
  setColor(color, scale = 1) {
    const s = this.spec;
    s.r = color.r; s.g = color.g; s.b = color.b; s.intensity = scale;
    return s;
  }

  size(a, b = a) { this.spec.size0 = a; this.spec.size1 = b; return this.spec; }

  /** Emit one particle with the current descriptor. */
  spawn(x, y, z, vx, vy, vz) {
    const i = this._head;
    this._head = (this._head + 1) % this.capacity;
    const s = this.spec;

    const i3 = i * 3, i4 = i * 4;
    this.origin[i3] = x; this.origin[i3 + 1] = y; this.origin[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.timing[i4] = this._time;
    this.timing[i4 + 1] = s.life;
    this.timing[i4 + 2] = s.size0;
    this.timing[i4 + 3] = s.size1;
    this.color[i4] = s.r; this.color[i4 + 1] = s.g;
    this.color[i4 + 2] = s.b; this.color[i4 + 3] = s.intensity;
    this.params[i4] = s.drag;
    this.params[i4 + 1] = s.turbulence;
    this.params[i4 + 2] = this.rng ? this.rng.next() : 0.5;
    this.params[i4 + 3] = s.kind;

    this._dirty.touch(i);
    return i;
  }

  /**
   * A cone burst around (dx,dy,dz). `spread` is 0 for a laser-straight jet and 1 for
   * a full sphere. Speeds are sampled with a square bias so most of the burst is slow
   * and a few pieces fly - even spacing reads as a firework.
   */
  burst(count, x, y, z, dx, dy, dz, spread, speedMin, speedMax) {
    const rng = this.rng;
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    // An orthonormal basis around the cone axis.
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(ny) > 0.9) { ux = 1; uy = 0; uz = 0; }
    let ax = uy * nz - uz * ny, ay = uz * nx - ux * nz, az = ux * ny - uy * nx;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = ny * az - nz * ay, by = nz * ax - nx * az, bz = nx * ay - ny * ax;

    for (let i = 0; i < count; i++) {
      const theta = (rng ? rng.next() : 0.5) * Math.PI * 2;
      // cos of the polar angle, uniform over the cone cap
      const c = 1 - (rng ? rng.next() : 0.5) * 2 * spread;
      const s = Math.sqrt(Math.max(0, 1 - c * c));
      const ct = Math.cos(theta), st = Math.sin(theta);
      const dirX = nx * c + (ax * ct + bx * st) * s;
      const dirY = ny * c + (ay * ct + by * st) * s;
      const dirZ = nz * c + (az * ct + bz * st) * s;
      const u = rng ? rng.next() : 0.5;
      const speed = speedMin + (speedMax - speedMin) * u * u;
      this.spawn(x, y, z, dirX * speed, dirY * speed, dirZ * speed);
    }
  }

  /** Called once per frame by the VFX installer. `time` is sim time. */
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
