/**
 * ENGINE PLUMES.
 *
 * This is a GAMEPLAY READ, not decoration. Plume length and brightness are driven by
 *
 *     throttle  x  engine-subsystem health  x  engine power channel
 *
 * so a destroyer whose drives you have shot out visibly stops burning, and you can
 * tell a stranded hull from a running one across two kilometres without a UI element.
 * The whole point of subsystem targeting is that the consequences are legible in the
 * world; a plume that keeps burning on a dead engine silently deletes that.
 *
 * One instanced ribbon for every drive on every ship in the scene. The ribbon is
 * rebuilt to face the camera per vertex, tapers along its length in the fragment
 * shader, and carries shock diamonds whose spacing tightens as the drive spools up.
 * A cold engine emits a short, dim idle glow; a dead one emits nothing at all.
 */

import * as THREE from 'three';
import { scratch } from '../core/world.js';
import {
  instancedQuad, markVFXMaterial, factionVFX, FACTION_ORDER, shipForward, shipLocalToWorld,
  RangeUploader,
} from './common.js';

const VERT = /* glsl */ `
  uniform float uTime;

  attribute vec3 aOrigin;
  attribute vec3 aDir;      // unit, points AFT - the way the plume extends
  attribute vec4 aParams;   // length, radius, intensity, seed
  attribute vec3 aColor;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vIntensity;
  varying float vSeed;

  void main() {
    vUv = uv;
    vColor = aColor;
    vIntensity = aParams.z;
    vSeed = aParams.w;

    vec3 a = aOrigin;
    vec3 b = aOrigin + normalize(aDir) * aParams.x;

    vec3 av = (modelViewMatrix * vec4(a, 1.0)).xyz;
    vec3 bv = (modelViewMatrix * vec4(b, 1.0)).xyz;
    vec3 axis = bv - av;
    float len = length(axis);
    vec3 d = len > 1e-4 ? axis / len : vec3(0.0, 1.0, 0.0);

    vec3 mid = mix(av, bv, position.y + 0.5);
    vec3 toEye = normalize(-mid);
    vec3 side = cross(d, toEye);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);

    // The quad is authored at the widest section; the taper is done in the fragment
    // so the silhouette stays soft instead of showing a hard triangular edge.
    vec3 p = mid + side * (position.x * aParams.y * 2.0);
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vIntensity;
  varying float vSeed;

  void main() {
    // 0 at the bell, 1 at the tail.
    //
    // THE CLAMP IS LOAD-BEARING. It used to be a bare vUv.y, and the pow(t, 0.72) a few
    // lines down is undefined for a negative base in GLSL -- it returns NaN. A NaN in an
    // additively-blended plume poisons everything composited after it, so the whole frame
    // went black rather than the plume merely looking wrong.
    //
    // That is defect D67, and it is why the 'close' shot in tools/shots.json -- the frame
    // the hull's surface is judged from, and the evidence for D-INT1 -- rendered at
    // contrast 0.0129 with 99.31% near-black pixels for two full waves of work. That
    // framing contains no visible engine plume at all, which is exactly why nobody looked
    // here: the geometry at fault is off-screen and it still took the picture down.
    //
    // Measured by: node tools/widediag.mjs close --assert
    // which patches this one line into the live material at runtime and re-measures.
    // Guards fired without it: FRAME IS FLAT OR EMPTY, FRAME IS ESSENTIALLY BLACK.
    // Guards fired with it: none.
    float t = clamp(vUv.y, 0.0, 1.0);
    float across = abs(vUv.x * 2.0 - 1.0);

    // Bell-mouth flare then a long taper. Fully parabolic looks like a cone of
    // light; the small flare at t=0 is what makes it read as coming OUT of something.
    float flare = 0.55 + 0.45 * smoothstep(0.0, 0.10, t);
    float halfW = flare * (1.0 - pow(t, 0.72)) + 0.02;
    float edge = 1.0 - across / max(halfW, 1e-3);
    if (edge <= 0.0) discard;

    float core = pow(edge, 6.0);
    float glow = pow(edge, 1.7);

    // Shock diamonds - the tell that this is a throttled drive and not a lamp.
    float diamonds = 0.82 + 0.18 * sin(t * 34.0 - uTime * 2.2 + vSeed * 6.28);
    // Combustion flicker, low amplitude; big flicker reads as a broken shader.
    float flicker = 0.93 + 0.07 * sin(uTime * 23.0 + vSeed * 51.0);

    float along = pow(1.0 - t, 1.10);

    vec3 col = vColor * (glow * 0.55 + core * 1.25) * along * diamonds * flicker;
    // White-hot throat: hottest right at the bell, gone by a third of the way down.
    col += vec3(1.0, 0.97, 0.93) * core * pow(1.0 - t, 4.5) * 1.7 * flicker;

    gl_FragColor = vec4(col * vIntensity, 1.0);
  }
`;

export class EngineVFX {
  constructor(world, { capacity = 96, rng } = {}) {
    this.world = world;
    this.capacity = capacity;
    this.rng = rng;
    this.count = 0;

    this.origin = new Float32Array(capacity * 3);
    this.dir = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
    this.col = new Float32Array(capacity * 3);
    this.seeds = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.seeds[i] = rng ? rng.next() : i * 0.113;

    const geo = instancedQuad(capacity);
    this.aOrigin = new THREE.InstancedBufferAttribute(this.origin, 3);
    this.aDir = new THREE.InstancedBufferAttribute(this.dir, 3);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    this.aColor = new THREE.InstancedBufferAttribute(this.col, 3);
    geo.setAttribute('aOrigin', this.aOrigin);
    geo.setAttribute('aDir', this.aDir);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aColor', this.aColor);
    geo.instanceCount = 0;

    this.material = markVFXMaterial(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }), 'plumes');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:plumes';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;

    this.palettes = Object.create(null);
    for (const f of FACTION_ORDER) this.palettes[f] = factionVFX(f);

    this._upload = new RangeUploader([this.aOrigin, this.aDir, this.aParams, this.aColor]);
    this._fwd = new THREE.Vector3();
  }

  /**
   * Throttle demand, 0..1, from whichever body type the ship has. Plane-locked hulls
   * carry an explicit throttle; free bodies (strike craft, missiles) do not, so their
   * burn is inferred from how hard they are actually moving.
   */
  static throttleOf(ship) {
    const b = ship.body;
    if (!b) return 0;
    if (b.throttle !== undefined && ship.planeLocked) return Math.max(0, Math.min(1, b.throttle));
    const max = b.maxSpeed || 1;
    return Math.max(0, Math.min(1, b.velocity.length() / max));
  }

  /** 0..1 health of a ship's drives. Destroyed subsystems read exactly zero. */
  static engineHealth(ship) {
    if (!ship.subsystems || ship.subsystems.size === 0) return ship.dead ? 0 : 1;
    let hp = 0, max = 0, found = false;
    for (const s of ship.subsystems.values()) {
      if (s.def.kind !== 'engine') continue;
      found = true;
      hp += s.destroyed ? 0 : s.hp;
      max += s.maxHP;
    }
    if (!found) return ship.dead ? 0 : 1;
    return max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  }

  begin() { this.count = 0; }

  push(x, y, z, dx, dy, dz, length, radius, intensity, color) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const i3 = i * 3, i4 = i * 4;
    this.origin[i3] = x; this.origin[i3 + 1] = y; this.origin[i3 + 2] = z;
    this.dir[i3] = dx; this.dir[i3 + 1] = dy; this.dir[i3 + 2] = dz;
    this.params[i4] = length;
    this.params[i4 + 1] = radius;
    this.params[i4 + 2] = intensity;
    this.params[i4 + 3] = this.seeds[i];
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
  }

  /** Rebuild every plume in the scene from live ship state. */
  sample(time) {
    this.begin();
    const ships = this.world.ships;
    for (let s = 0; s < ships.length; s++) this.pushShip(ships[s]);
    this.commit(time);
  }

  pushShip(ship) {
    if (!ship || ship.dead) return;
    const pal = this.palettes[ship.faction] ?? this.palettes.player;

    const health = EngineVFX.engineHealth(ship);
    if (health <= 0.001) return;          // dead drives do not burn. This is the read.

    let throttle = EngineVFX.throttleOf(ship);
    // Power routing starves the drive as well as damaging it.
    if (ship.power?.unlocked) throttle *= Math.max(0.25, Math.min(1.4, ship.power.factor('engines')));

    const burn = Math.max(0, Math.min(1.25, throttle * health));
    // Idle glow: a live drive is never completely dark, but it is only a bell glow.
    const level = 0.12 + burn * 0.88;

    const fwd = shipForward(ship, this._fwd);
    const dx = -fwd.x, dy = -fwd.y, dz = -fwd.z;

    let found = false;
    if (ship.subsystems) {
      for (const sub of ship.subsystems.values()) {
        if (sub.def.kind !== 'engine' || sub.destroyed) continue;
        found = true;
        const subHealth = Math.max(0, Math.min(1, sub.hp / sub.maxHP));
        const r = sub.def.radius;
        // The cached world position is only refreshed on a sim step; recompute so
        // plumes do not lag the hull between steps.
        const [lx, ly, lz] = sub.def.position;
        shipLocalToWorld(ship, lx, ly, lz, scratch.v1);
        this.push(
          scratch.v1.x + dx * r * 0.4, scratch.v1.y + dy * r * 0.4, scratch.v1.z + dz * r * 0.4,
          dx, dy, dz,
          r * (1.3 + 11.5 * burn * subHealth),
          r * 1.05,
          (0.10 + 0.90 * burn) * (0.35 + 0.65 * subHealth),
          pal.engine,
        );
      }
    }

    if (!found) {
      // No declared drives (strike craft, probe stand-ins): one plume at the stern.
      const len = ship.classDef?.length ?? 60;
      shipLocalToWorld(ship, 0, 0, -len * 0.46, scratch.v1);
      this.push(
        scratch.v1.x, scratch.v1.y, scratch.v1.z, dx, dy, dz,
        len * (0.10 + 1.35 * burn), len * 0.10, level, pal.engine,
      );
    }
  }

  commit(time) {
    this.material.uniforms.uTime.value = time;
    this.mesh.geometry.instanceCount = this.count;
    if (this.count === 0) return;
    this._upload.upload(0, this.count - 1);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
