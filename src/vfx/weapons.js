/**
 * WEAPON FIRE.
 *
 * Four things, three of them one draw call each:
 *
 *   TRACERS   every live projectile in `CombatSystem.projectiles`, drawn straight out
 *             of the pool's flat typed arrays. Each one is stretched along its own
 *             velocity in the vertex shader, so a 1400 m/s rail slug is a 120 m streak
 *             and a lazy 400 m/s shell is a fat bolt. Without the stretch a fast slug
 *             is a dot that teleports and the frame stops reading as gunfire.
 *
 *   BEAMS     `CombatSystem.activeBeams`, rebuilt every frame. A beam is a ribbon
 *             quad whose width axis is re-derived per vertex to face the camera, with
 *             a very tight white core inside a coloured falloff. Mining and salvage
 *             beams take a different branch on purpose: thicker, slower, visibly
 *             MODULATED rather than steady, so the industrial tool never gets mistaken
 *             for a weapon at a glance.
 *
 *   MUZZLE    a bright short flash plus a spatter of sparks at the mount, in the
 *             firing faction's emissive. 60-100 ms. Any longer and a burst weapon
 *             smears into a continuous glow.
 *
 *   MISSILES  instanced lit bodies (so they are objects, not sprites) with a GPU
 *             exhaust trail spawned behind them.
 *
 * The tracer and beam buffers are rewritten from scratch every frame and uploaded as
 * one contiguous range. There is no per-projectile object anywhere in this file.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { PROJECTILE_KINDS } from '../sim/combat.js';
import {
  instancedQuad, markVFXMaterial, factionVFX, FACTION_ORDER, FIRE, RangeUploader,
} from './common.js';
import { PKIND } from './particles.js';

// ---------------------------------------------------------------------------
// Tracers
// ---------------------------------------------------------------------------

const TRACER_VERT = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec3 aColor;
  attribute vec3 aShape;   // halfWidth, stretchSeconds, maxLength

  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    vUv = uv;
    vColor = aColor;

    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    vec3 velView = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
    float speed = length(velView);
    vec3 dir = speed > 1e-3 ? velView / speed : vec3(0.0, 1.0, 0.0);

    // Perpendicular to travel AND to the eye ray: the streak keeps its width no
    // matter where the camera is, including looking straight down the barrel.
    vec3 toEye = normalize(-mv.xyz);
    vec3 side = cross(dir, toEye);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);

    float halfLen = 0.5 * clamp(speed * aShape.y, aShape.x * 2.2, aShape.z);
    mv.xyz += dir * (position.y * halfLen * 2.0) + side * (position.x * aShape.x * 2.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const TRACER_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    float across = abs(vUv.x * 2.0 - 1.0);
    float along = vUv.y;                       // 0 tail, 1 head
    float edge = 1.0 - across;
    if (edge <= 0.0) discard;

    float core = pow(edge, 7.0);
    float glow = pow(edge, 1.8);
    // Comet profile: the head carries the energy, the tail bleeds out.
    float taper = pow(along, 1.35);
    float head = smoothstep(0.72, 1.0, along);

    vec3 col = vColor * (glow * 0.42 + core * 1.6) * taper;
    col += vec3(1.0, 0.98, 0.95) * core * (0.45 + head * 1.5) * taper;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Per projectile kind: half-width in metres, seconds of travel to stretch, cap. */
const TRACER_SHAPE = {
  slug: [2.6, 0.085, 340],
  shell: [4.0, 0.085, 380],
  railslug: [2.2, 0.145, 1300],
  missile: [3.4, 0.016, 52],
  flak: [4.2, 0.034, 150],
  pdslug: [1.6, 0.038, 110],
};

class TracerSystem {
  constructor(capacity) {
    this.capacity = capacity;
    this.count = 0;

    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.shape = new Float32Array(capacity * 3);

    const geo = instancedQuad(capacity);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3);
    this.aVel = new THREE.InstancedBufferAttribute(this.vel, 3);
    this.aColor = new THREE.InstancedBufferAttribute(this.col, 3);
    this.aShape = new THREE.InstancedBufferAttribute(this.shape, 3);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aShape', this.aShape);
    geo.instanceCount = 0;

    this.material = markVFXMaterial(new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: TRACER_VERT,
      fragmentShader: TRACER_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }), 'tracers');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:tracers';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this._upload = new RangeUploader([this.aPos, this.aVel, this.aColor, this.aShape]);
  }

  begin() { this.count = 0; }

  push(x, y, z, vx, vy, vz, color, boost, shape) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = color.r * boost; this.col[i3 + 1] = color.g * boost; this.col[i3 + 2] = color.b * boost;
    this.shape[i3] = shape[0]; this.shape[i3 + 1] = shape[1]; this.shape[i3 + 2] = shape[2];
  }

  commit() {
    this.mesh.geometry.instanceCount = this.count;
    if (this.count === 0) return;
    this._upload.upload(0, this.count - 1);
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

// ---------------------------------------------------------------------------
// Beams
// ---------------------------------------------------------------------------

const BEAM_VERT = /* glsl */ `
  uniform float uTime;

  attribute vec3 aA;
  attribute vec3 aB;
  attribute vec3 aColor;
  attribute vec4 aParams;  // halfWidth, style, birth, seed

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStyle;
  varying float vSeed;
  varying float vAge;
  varying float vLength;

  void main() {
    vUv = uv;
    vColor = aColor;
    vStyle = aParams.y;
    vSeed = aParams.w;
    vAge = uTime - aParams.z;

    vec3 av = (modelViewMatrix * vec4(aA, 1.0)).xyz;
    vec3 bv = (modelViewMatrix * vec4(aB, 1.0)).xyz;
    vec3 axis = bv - av;
    float len = length(axis);
    vLength = len;
    vec3 dir = len > 1e-4 ? axis / len : vec3(0.0, 1.0, 0.0);

    vec3 mid = mix(av, bv, position.y + 0.5);
    vec3 toEye = normalize(-mid);
    vec3 side = cross(dir, toEye);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);

    vec3 p = mid + side * (position.x * aParams.x * 2.0);
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStyle;
  varying float vSeed;
  varying float vAge;
  varying float vLength;

  void main() {
    float across = abs(vUv.x * 2.0 - 1.0);
    float t = vUv.y;                       // 0 at the muzzle, 1 at the impact
    float edge = 1.0 - across;
    if (edge <= 0.0) discard;

    float core = pow(edge, 9.0);
    float glow = pow(edge, 2.2);
    float amp = 1.0;
    vec3 col;

    if (vStyle < 0.5) {
      // WEAPON BEAM - dead steady, needle-thin core, faint high-frequency jitter.
      amp = 0.92 + 0.08 * sin(vAge * 61.0 + vSeed * 37.0);
      col = vColor * (glow * 0.60 + core * 2.0) * amp;
      col += vec3(1.0, 0.99, 0.97) * core * core * 2.2 * amp;
    } else {
      // MINING / SALVAGE BEAM - slow travelling pulses down the shaft, a visible
      // duty cycle and a much softer core. It should look like a tool with a power
      // supply behind it, not like something that was fired.
      float travel = sin(t * 26.0 - vAge * 7.0 + vSeed * 6.28);
      float duty = 0.70 + 0.30 * sin(vAge * 4.4 + vSeed * 3.1);
      amp = duty * (0.80 + 0.20 * travel);
      col = vColor * (glow * 0.85 + core * 1.15) * amp;
      col += vec3(1.0, 0.95, 0.86) * core * 1.0 * amp;
      // Cooler outer sheath so the beam has a rim rather than a soft edge
      col += vColor * pow(edge, 0.7) * 0.10 * amp;
    }

    // Impact bloom where it lands, and a muzzle bloom where it leaves the mount.
    col *= 1.0 + 1.9 * smoothstep(0.955, 1.0, t) * edge;
    col *= 1.0 + 0.9 * smoothstep(0.03, 0.0, t) * edge;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const BEAM_STYLE = { WEAPON: 0, INDUSTRIAL: 1 };

class BeamSystem {
  constructor(capacity, rng) {
    this.capacity = capacity;
    this.rng = rng;
    this.count = 0;

    this.a = new Float32Array(capacity * 3);
    this.b = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
    /** Stable per-slot seed so a sustained beam does not re-roll its noise each frame. */
    this.seeds = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.seeds[i] = rng ? rng.next() : i * 0.137;

    const geo = instancedQuad(capacity);
    this.aA = new THREE.InstancedBufferAttribute(this.a, 3);
    this.aB = new THREE.InstancedBufferAttribute(this.b, 3);
    this.aColor = new THREE.InstancedBufferAttribute(this.col, 3);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    geo.setAttribute('aA', this.aA);
    geo.setAttribute('aB', this.aB);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aParams', this.aParams);
    geo.instanceCount = 0;

    this.material = markVFXMaterial(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    }), 'beams');

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'vfx:beams';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this._upload = new RangeUploader([this.aA, this.aB, this.aColor, this.aParams]);
  }

  begin() { this.count = 0; }

  push(ax, ay, az, bx, by, bz, width, style, color, boost) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    const i3 = i * 3, i4 = i * 4;
    this.a[i3] = ax; this.a[i3 + 1] = ay; this.a[i3 + 2] = az;
    this.b[i3] = bx; this.b[i3 + 1] = by; this.b[i3 + 2] = bz;
    this.col[i3] = color.r * boost; this.col[i3 + 1] = color.g * boost; this.col[i3 + 2] = color.b * boost;
    this.params[i4] = width;
    this.params[i4 + 1] = style;
    this.params[i4 + 2] = 0;
    this.params[i4 + 3] = this.seeds[i];
    return i;
  }

  commit(time) {
    this.material.uniforms.uTime.value = time;
    this.mesh.geometry.instanceCount = this.count;
    if (this.count === 0) return;
    this._upload.upload(0, this.count - 1);
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

// ---------------------------------------------------------------------------
// Missile bodies
// ---------------------------------------------------------------------------

/** A stubby eight-sided body with a flared tail. 96 tris, seen at 12 m long. */
function missileGeometry() {
  const body = new THREE.CylinderGeometry(0.9, 1.35, 9.5, 8, 1, false);
  body.rotateX(Math.PI * 0.5);
  const nose = new THREE.ConeGeometry(0.9, 3.2, 8);
  nose.rotateX(Math.PI * 0.5);
  nose.translate(0, 0, 6.3);
  const merged = new THREE.BufferGeometry();
  // Cheap manual merge: both are non-indexed after toNonIndexed().
  const a = body.toNonIndexed();
  const b = nose.toNonIndexed();
  const pa = a.attributes.position.array;
  const pb = b.attributes.position.array;
  const na = a.attributes.normal.array;
  const nb = b.attributes.normal.array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa, 0); pos.set(pb, pa.length);
  const nor = new Float32Array(na.length + nb.length);
  nor.set(na, 0); nor.set(nb, na.length);
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  // Metre UVs: the registry authors its maps at one UV unit per metre.
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uv[i * 2] = pos[i * 3];
    uv[i * 2 + 1] = pos[i * 3 + 2];
  }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  body.dispose(); nose.dispose(); a.dispose(); b.dispose();
  return merged;
}

// ---------------------------------------------------------------------------

export class WeaponVFX {
  /**
   * @param {import('../core/world.js').World} world
   * @param {import('./particles.js').ParticleSystem} particles
   * @param {import('./rings.js').RingSystem} rings
   */
  constructor(world, particles, rings, { rng, materials }) {
    this.world = world;
    this.particles = particles;
    this.rings = rings;
    this.rng = rng;

    this.tracers = new TracerSystem(2048);
    this.beams = new BeamSystem(64, rng.fork('beams'));

    this.group = new THREE.Group();
    this.group.name = 'vfx:weapons';
    this.group.add(this.tracers.mesh);
    this.group.add(this.beams.mesh);

    // Faction colour sets, resolved once.
    this.palettes = Object.create(null);
    for (const f of FACTION_ORDER) this.palettes[f] = factionVFX(f);

    // --- missile bodies ----------------------------------------------------
    this.missiles = null;
    if (materials?.get) {
      const geo = missileGeometry();
      const mat = materials.get('greeble', { faction: 'player', instanced: true, wear: 0.5 });
      const inst = new THREE.InstancedMesh(geo, mat, 128);
      inst.name = 'vfx:missiles';
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.frustumCulled = false;
      inst.count = 0;
      this.missiles = inst;
      this.group.add(inst);
    }

    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._fwd = new THREE.Vector3(0, 0, 1);
    this._v = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this._trailAccum = 0;

    this._offFired = world.bus.on(EV.WEAPON_FIRED, (e) => this.onWeaponFired(e));
    this._offImpact = world.bus.on(EV.PROJECTILE_IMPACT, (e) => this.onImpact(e));
  }

  palette(factionId) { return this.palettes[factionId] ?? this.palettes.player; }

  // -------------------------------------------------------------------- events

  /**
   * Muzzle flash. Brief, bright, faction-coloured, plus a small spatter of sparks
   * thrown down the bore. Beam weapons get a charge bloom instead of a spatter -
   * a lance that spits shrapnel reads as a cannon.
   */
  onWeaponFired({ ship, mount, origin, type }) {
    if (!origin) return;
    const pal = this.palette(ship?.faction ?? 'player');
    const p = this.particles;

    const x = origin.x, y = origin.y, z = origin.z;
    let fx = 0, fy = 0, fz = 1;
    if (mount?.worldForward) { fx = mount.worldForward.x; fy = mount.worldForward.y; fz = mount.worldForward.z; }

    const beamish = type === 'beam' || type === 'lance' || type === 'mining';
    const heavy = type === 'rail' || type === 'lance' || type === 'cannon';

    // The flash itself
    p.begin(PKIND.FIRE);
    p.setColor(pal.muzzle, heavy ? 1.0 : 0.6);
    p.spec.life = beamish ? 0.16 : 0.085;
    p.spec.size0 = heavy ? 26 : 14;
    p.spec.size1 = heavy ? 54 : 28;
    p.spec.drag = 6;
    p.spawn(x + fx * 6, y + fy * 6, z + fz * 6, fx * 90, fy * 90, fz * 90);

    if (!beamish) {
      p.begin(PKIND.SPARK);
      p.setColor(FIRE.spark, heavy ? 0.85 : 0.5);
      p.spec.life = 0.10 + this.rng.next() * 0.16;
      p.spec.size0 = heavy ? 5.5 : 3.0;
      p.spec.size1 = 0.5;
      p.spec.drag = 5.5;
      p.burst(heavy ? 12 : 6, x, y, z, fx, fy, fz, 0.10, 220, 900);
    }

    if (heavy) {
      // A tight muzzle blast ring. Small - this is a gun, not a detonation.
      this.rings.shockwave(
        x + fx * 12, y + fy * 12, z + fz * 12, fx, fy, fz,
        4, 46, 0.18, pal.muzzle, 0.26, 0.18,
      );
    }
  }

  /**
   * Impact. Sparks spray back along the incoming vector, a short white flash marks
   * the contact, and a tiny ring sells the hit at tactical range where the sparks
   * are sub-pixel.
   */
  onImpact({ point, target, type }) {
    if (!point) return;
    const p = this.particles;
    const x = point.x, y = point.y, z = point.z;

    // Back-scatter direction: away from the target centre, so debris comes off the
    // hull rather than through it.
    let nx = 0, ny = 1, nz = 0;
    if (target?.position) {
      nx = x - target.position.x; ny = y - target.position.y; nz = z - target.position.z;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
    }

    const big = type === 'missile' || type === 'railslug' || type === 'lance' || type === 'shell';

    p.begin(PKIND.FIRE);
    p.setColor(FIRE.hot, big ? 0.95 : 0.5);
    p.spec.life = big ? 0.28 : 0.14;
    p.spec.size0 = big ? 22 : 11;
    p.spec.size1 = big ? 96 : 40;
    p.spec.drag = 3.5;
    p.spawn(x, y, z, nx * 30, ny * 30, nz * 30);

    p.begin(PKIND.SPARK);
    p.setColor(FIRE.spark, 0.95);
    p.spec.life = 0.16;
    p.spec.size0 = big ? 5.5 : 3.2;
    p.spec.size1 = 0.4;
    p.spec.drag = 3.2;
    p.spec.turbulence = 6;
    p.burst(big ? 26 : 12, x, y, z, nx, ny, nz, 0.55, 120, 900);

    if (big) {
      p.begin(PKIND.EMBER);
      p.setColor(FIRE.slag, 0.8);
      p.spec.life = 1.1 + this.rng.next() * 0.7;
      p.spec.size0 = 4.0;
      p.spec.size1 = 1.4;
      p.spec.drag = 0.55;
      p.spec.turbulence = 3;
      p.burst(10, x, y, z, nx, ny, nz, 0.75, 40, 260);

      this.rings.shockwave(x, y, z, nx, ny, nz, 6, 105, 0.24, FIRE.hot, 0.24, 0.16);
    }
  }

  // ------------------------------------------------------------------- per frame

  /** Rebuild the tracer, missile and beam buffers from the combat system. */
  sample(combat, time) {
    const tr = this.tracers;
    tr.begin();

    let missileCount = 0;
    const inst = this.missiles;

    if (combat?.projectiles) {
      const pool = combat.projectiles;
      for (let i = 0; i < pool.count; i++) {
        const kind = PROJECTILE_KINDS[pool.kind[i]] ?? 'slug';
        const shape = TRACER_SHAPE[kind] ?? TRACER_SHAPE.slug;
        const faction = pool.sourceRef[i]?.faction ?? 'player';
        const pal = this.palette(faction);
        const color = kind === 'railslug' ? pal.tracerHot : pal.tracer;
        const boost = kind === 'pdslug' ? 0.55 : kind === 'flak' ? 0.8 : 1;

        const px = pool.px[i], py = pool.py[i], pz = pool.pz[i];
        const vx = pool.vx[i], vy = pool.vy[i], vz = pool.vz[i];
        tr.push(px, py, pz, vx, vy, vz, color, boost, shape);

        if (kind === 'missile' && inst && missileCount < inst.instanceMatrix.count) {
          const speed = Math.hypot(vx, vy, vz) || 1;
          this._v.set(vx / speed, vy / speed, vz / speed);
          this._q.setFromUnitVectors(this._fwd, this._v);
          this._m4.compose(scratch.v1.set(px, py, pz), this._q, this._one);
          inst.setMatrixAt(missileCount++, this._m4);
        }
      }
    }

    tr.commit();
    if (inst) {
      inst.count = missileCount;
      if (missileCount) inst.instanceMatrix.needsUpdate = true;
    }

    // --- beams ------------------------------------------------------------
    const bs = this.beams;
    bs.begin();
    const active = combat?.activeBeams;
    if (active) {
      for (let i = 0; i < active.length; i++) {
        const b = active[i];
        this.pushBeam(b, time);
      }
    }
    return bs;
  }

  /** Draw one hitscan beam. Public so the salvage layer can add its cutting beam. */
  pushBeam(b, time) {
    const pal = this.palette(b.faction ?? 'player');
    const industrial = b.type === 'mining';
    const color = industrial ? FIRE.mining : (b.type === 'lance' ? pal.lance : pal.beam);
    const width = industrial ? 9.0 : (b.type === 'lance' ? 5.0 : 3.2);
    const style = industrial ? BEAM_STYLE.INDUSTRIAL : BEAM_STYLE.WEAPON;
    this.beams.push(
      b.origin.x, b.origin.y, b.origin.z,
      b.end.x, b.end.y, b.end.z,
      width, style, color, industrial ? 0.9 : 1.0,
    );

    // Impact flash at the far end. Rate-limited by the caller's frame, and cheap.
    if (b.hit) {
      const p = this.particles;
      p.begin(PKIND.SPARK);
      p.setColor(industrial ? FIRE.slag : FIRE.spark, industrial ? 0.7 : 1.0);
      p.spec.life = 0.10 + this.rng.next() * 0.12;
      p.spec.size0 = 3.4;
      p.spec.size1 = 0.4;
      p.spec.drag = 4.0;
      const dx = b.origin.x - b.end.x, dy = b.origin.y - b.end.y, dz = b.origin.z - b.end.z;
      p.burst(industrial ? 3 : 5, b.end.x, b.end.y, b.end.z, dx, dy, dz, 0.85, 60, 420);
    }
  }

  /** Called at sim rate: exhaust trails behind guided munitions. */
  emitMissileTrails(combat, dt) {
    if (!combat?.projectiles) return;
    this._trailAccum += dt;
    if (this._trailAccum < 1 / 45) return;
    this._trailAccum = 0;

    const pool = combat.projectiles;
    const p = this.particles;
    for (let i = 0; i < pool.count; i++) {
      if (pool.tracking[i] <= 0) continue;
      const vx = pool.vx[i], vy = pool.vy[i], vz = pool.vz[i];
      const speed = Math.hypot(vx, vy, vz) || 1;
      const bx = -vx / speed, by = -vy / speed, bz = -vz / speed;
      const x = pool.px[i] + bx * 7, y = pool.py[i] + by * 7, z = pool.pz[i] + bz * 7;

      p.begin(PKIND.FIRE);
      p.setColor(FIRE.body, 0.45);
      p.spec.life = 0.30;
      p.spec.size0 = 5;
      p.spec.size1 = 16;
      p.spec.drag = 4.5;
      p.spawn(x, y, z, bx * 120, by * 120, bz * 120);

      p.begin(PKIND.GAS);
      p.setColor(FIRE.smoke, 1.0);
      p.spec.life = 1.5;
      p.spec.size0 = 8;
      p.spec.size1 = 46;
      p.spec.drag = 2.2;
      p.spec.turbulence = 2.5;
      p.spawn(x, y, z, bx * 40, by * 40, bz * 40);
    }
  }

  commitBeams(time) { this.beams.commit(time); }

  dispose() {
    this._offFired?.();
    this._offImpact?.();
    this.tracers.dispose();
    this.beams.dispose();
    this.missiles?.geometry.dispose();
  }
}
