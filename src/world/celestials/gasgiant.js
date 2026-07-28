/**
 * GAS GIANT — the hero object of the 'giant-orbit' point of interest.
 *
 * Its whole job is to make everything else feel small, so every decision here is
 * about scale legibility rather than about the planet being pretty:
 *
 * BANDS, NOT STRIPES. The albedo is an equirectangular canvas built from a set of
 * explicit latitude bands (zones and belts, narrower near the equator) whose
 * boundaries are then DOMAIN WARPED by anisotropic noise — many cells in latitude,
 * few in longitude — so turbulence smears into ribbons that curl along the flow
 * instead of into clouds. Each band carries its own differential-rotation shear, so
 * the turbulence in adjacent bands leans in different directions. That shear is the
 * thing that reads as "this is a fluid moving at hundreds of metres per second".
 *
 * ONE STORM. An elliptical vortex with a spiral coordinate twist and a wake. One,
 * not six: a storm is a landmark, and landmarks stop working when they repeat.
 *
 * TERMINATOR. Shaded in the planet's own LOCAL space with an explicit sun direction
 * uniform rather than with a light, because the far scene has no lights and the
 * terminator has to agree with the POI key direction exactly. It is hard-ish — a
 * smoothstep about 7 degrees wide — with a thin forward-scattering rim on the lit
 * limb and an additive back-face halo shell that extends the atmosphere past the
 * silhouette.
 *
 * NIGHT SIDE. Never pure black: the bands stay faintly readable in a cold reflected
 * tone, with an auroral term at the poles. Black would flatten the sphere into a
 * disc with a bite out of it.
 *
 * RINGS. Real cast shadows in both directions: the ring shadow on the planet comes
 * from intersecting the sun ray with the ring plane in local space; the planet
 * shadow on the rings comes from the closest approach of the ring point's sun ray
 * to the planet's (oblate) body. Those two lines are most of why a ringed planet
 * reads as a solid object in space instead of as a decal.
 */

import * as THREE from 'three';
import {
  ORDER, markCelestial, col, cylFbm, cylRidged, clamp01, smoothstep,
} from './common.js';
import { makeCanvas, ctx2d } from '../../art/textures/canvas2d.js';

// ---------------------------------------------------------------------------
// Banded albedo
// ---------------------------------------------------------------------------

/**
 * Lay out latitude bands. Narrow near the equator, wide towards the poles, and
 * alternating zone/belt with occasional doubled belts so it never looks periodic.
 */
function layoutBands(rng, ramp) {
  const bands = [];
  let v = 0;
  let parity = 0;
  while (v < 1) {
    // |latitude| from the equator drives band width
    const eq = Math.abs(v - 0.5) * 2;
    const w = (0.019 + eq * 0.048) * (0.60 + rng.next() * 0.95);
    const v1 = Math.min(1, v + w);
    // zones (bright) and belts (dark) alternate, with a 1-in-5 repeat
    const repeat = rng.next() < 0.20;
    if (!repeat) parity ^= 1;
    const bright = parity === 0;
    const idx = bright
      ? rng.int(0, 1)                       // ramp[0..1] are the bright zones
      : rng.int(2, ramp.length - 1);        // ramp[2..] the belts
    bands.push({
      v0: v,
      v1,
      idx,
      bright,
      // belts are turbulent, zones are calm
      turb: bright ? 0.25 + rng.next() * 0.30 : 0.62 + rng.next() * 0.38,
      // differential rotation: fastest at the equator, retrograde in some belts
      shear: (1 - eq * eq) * (bright ? 1 : -0.75) * (0.55 + rng.next() * 0.9),
      value: 0.86 + rng.next() * 0.28,
    });
    v = v1;
  }
  return bands;
}

function bandAt(bands, v) {
  // bands are contiguous and sorted; linear scan is 15-20 steps, and this runs
  // once per texel at build time only.
  for (let i = 0; i < bands.length; i++) {
    if (v < bands[i].v1) return i;
  }
  return bands.length - 1;
}

/**
 * @returns {THREE.CanvasTexture} equirectangular albedo, row 0 = north pole
 */
export function buildGiantTexture(rng, opts = {}) {
  const {
    width = 1024,
    height = 512,
    ramp,
    stormColor,
    storm = true,
    warpAmount = 0.072,
    name = 'gasgiant-albedo',
  } = opts;
  const r = rng.fork('giant-tex');
  const bands = layoutBands(r, ramp);

  // Anisotropic: few cells around the equator, many pole-to-pole. This is the
  // difference between ribbons and cotton wool.
  const warpA = cylFbm(r.fork('warpA'), { cellsU: 3, cellsV: 26, octaves: 4, gain: 0.55 });
  const warpB = cylFbm(r.fork('warpB'), { cellsU: 7, cellsV: 54, octaves: 4, gain: 0.5 });
  const detail = cylRidged(r.fork('detail'), { cellsU: 6, cellsV: 40, octaves: 4, gain: 0.5 });
  const mottle = cylFbm(r.fork('mottle'), { cellsU: 5, cellsV: 14, octaves: 3, gain: 0.55 });

  const rampC = ramp.map((h) => col(h));
  const stormC = col(stormColor);

  // One landmark storm, elongated in longitude. Its position is AIMED (see
  // buildGasGiant) rather than random: a storm on the far side is a storm nobody
  // will ever see, and this is the planet's only unique feature.
  const stormU = opts.stormU ?? r.next();
  const stormV = opts.stormV ?? (0.30 + r.next() * 0.12);
  const stormRU = 0.075 + r.next() * 0.030;
  const stormRV = 0.036 + r.next() * 0.014;
  const stormSpin = (r.bool() ? 1 : -1) * (2.4 + r.next() * 1.4);

  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(width, height);
  const c = new THREE.Color();

  for (let y = 0; y < height; y++) {
    // canvas row 0 is v = 1 (north pole) once three flips the texture
    const v = 1 - (y + 0.5) / height;
    const eq = Math.abs(v - 0.5) * 2;

    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;

      // --- storm: spiral-twist the sample coordinates inside the oval ------
      let su = u, sv = v, stormMask = 0;
      if (storm) {
        let du = u - stormU;
        if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
        const dv = v - stormV;
        const e = Math.sqrt((du / stormRU) ** 2 + (dv / stormRV) ** 2);
        if (e < 1.9) {
          const k = clamp01(1 - e / 1.9);
          const ang = stormSpin * k * k;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          // rotate in the ellipse's own metric so the vortex stays elliptical
          const nu = du / stormRU, nv = dv / stormRV;
          su = stormU + (nu * ca - nv * sa) * stormRU;
          sv = stormV + (nu * sa + nv * ca) * stormRV;
          su -= Math.floor(su);
          sv = clamp01(sv);
          stormMask = smoothstep(1.25, 0.35, e);
          // a wake trailing to one side, so the storm disturbs its band
          const wake = smoothstep(0.0, -3.0, du / stormRU) * smoothstep(1.5, 0.4, Math.abs(dv) / stormRV);
          stormMask = Math.max(stormMask, wake * 0.30);
        }
      }

      // --- band shear: offset longitude per band, then warp latitude --------
      const bi0 = bandAt(bands, sv);
      const shear = bands[bi0].shear;
      const uu = (su + shear * 0.11 + 1) % 1;

      const w1 = (warpA(uu, sv) - 0.5) * warpAmount * (0.45 + bands[bi0].turb);
      const w2 = (warpB(uu * 1.7, sv * 1.3) - 0.5) * warpAmount * 0.42 * bands[bi0].turb;
      const vw = clamp01(sv + w1 + w2);

      // --- band colour with a soft boundary ---------------------------------
      const bi = bandAt(bands, vw);
      const b = bands[bi];
      c.copy(rampC[b.idx]);

      // blend across the boundary by the local turbulence: calm zones have crisp
      // edges, turbulent belts have shredded ones
      const edgeLo = (vw - b.v0) / Math.max(1e-4, b.v1 - b.v0);
      const soft = 0.10 + b.turb * 0.28;
      if (edgeLo < soft && bi > 0) {
        const prev = bands[bi - 1];
        c.lerp(rampC[prev.idx], 0.5 * (1 - smoothstep(0, soft, edgeLo)));
      } else if (edgeLo > 1 - soft && bi < bands.length - 1) {
        const next = bands[bi + 1];
        c.lerp(rampC[next.idx], 0.5 * (1 - smoothstep(0, soft, 1 - edgeLo)));
      }

      // --- filaments and mottle ---------------------------------------------
      const fil = detail(uu * 1.15, vw);
      const mot = mottle(uu, vw);
      const bright = b.value * (0.90 + mot * 0.20) * (1 + (fil - 0.5) * 0.34 * b.turb);
      c.multiplyScalar(bright);

      // --- storm ink ---------------------------------------------------------
      if (stormMask > 0) {
        c.lerp(stormC, stormMask * 0.88);
        // bright eye wall
        c.multiplyScalar(1 + stormMask * 0.20);
      }

      // --- polar hood: darker, hazier, less contrast ------------------------
      // Also hides the equirectangular pole convergence, which otherwise smears
      // every band into a pinwheel at the top of the disc.
      const hood = smoothstep(0.58, 0.99, eq);
      if (hood > 0) {
        c.lerp(rampC[rampC.length - 1], hood * 0.80);
        c.multiplyScalar(1 - hood * 0.30);
      }

      const o = (y * width + x) * 4;
      img.data[o] = clamp01(c.r) * 255;
      img.data[o + 1] = clamp01(c.g) * 255;
      img.data[o + 2] = clamp01(c.b) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(canvas);
  t.name = name;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------

/** Radial density + colour, 512x4. Alpha is optical depth. */
function buildRingTexture(rng, { size = 512, dust, ice, gaps = true, name = 'ring-density' } = {}) {
  const r = rng.fork('rings');
  const fine = cylFbm(r, { cellsU: 64, cellsV: 2, octaves: 4, gain: 0.58 });
  const broad = cylFbm(r.fork('broad'), { cellsU: 9, cellsV: 2, octaves: 3, gain: 0.55 });

  const canvas = makeCanvas(size, 4);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(size, 4);
  const cDust = col(dust);
  const cIce = col(ice);
  const c = new THREE.Color();

  // named divisions so the ring has structure a viewer can navigate
  const divisions = gaps
    ? [[0.055, 0.078], [0.205, 0.222], [0.415, 0.478], [0.630, 0.646], [0.795, 0.822], [0.905, 0.921]]
    : [];

  for (let x = 0; x < size; x++) {
    const t = (x + 0.5) / size;
    let d = 0.30 + 0.42 * broad(t, 0.5);
    // inner edge ramps up fast, outer edge fades
    d *= smoothstep(0.0, 0.055, t) * smoothstep(1.0, 0.80, t);
    // ringlets
    d *= 0.45 + 0.80 * fine(t, 0.5);
    for (const [a, b] of divisions) {
      const mid = (a + b) * 0.5, half = (b - a) * 0.5;
      d *= 1 - 0.97 * smoothstep(half, half * 0.25, Math.abs(t - mid));
    }
    d = clamp01(d);

    c.copy(cDust).lerp(cIce, clamp01(0.25 + broad(t * 1.7, 0.5) * 0.9));
    for (let y = 0; y < 4; y++) {
      const o = (y * size + x) * 4;
      img.data[o] = clamp01(c.r) * 255;
      img.data[o + 1] = clamp01(c.g) * 255;
      img.data[o + 2] = clamp01(c.b) * 255;
      img.data[o + 3] = d * 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = name;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Annulus in the local XZ plane, so ring-local == planet-local. */
function annulusXZ(inner, outer, segments = 192) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.push(ca * inner, 0, sa * inner);
    pos.push(ca * outer, 0, sa * outer);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, cc = a + 2, d = a + 3;
    idx.push(a, b, cc, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.name = 'ring-annulus';
  return g;
}

// ---------------------------------------------------------------------------
// The planet
// ---------------------------------------------------------------------------

const PLANET_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vP;
  varying vec2 vUvw;
  void main() {
    vN = normalize(normal);
    vP = position;
    vUvw = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANET_FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform sampler2D uRingTex;
  uniform vec3 uSunL;        // toward the sun, planet local space
  uniform vec3 uCamL;        // camera position, planet local space
  uniform vec3 uSunColor;
  uniform vec3 uNightColor;
  uniform vec3 uRimColor;
  uniform vec3 uAuroraColor;
  uniform float uGain, uNightGain, uRimGain, uAuroraGain;
  uniform float uRingOn, uRingInner, uRingOuter, uRingShadow;
  uniform float uRadius, uOblate;
  varying vec3 vN;
  varying vec3 vP;
  varying vec2 vUvw;

  void main() {
    vec3 N = normalize(vN);
    vec3 L = normalize(uSunL);
    vec3 V = normalize(uCamL - vP);

    float ndl = dot(N, L);
    float ndv = max(dot(N, V), 0.0);

    // hard-ish terminator, a few degrees of atmospheric softening
    float day = smoothstep(-0.055, 0.075, ndl);

    vec3 albedo = texture2D(uMap, vUvw).rgb;

    // limb darkening: the disc edge is dimmer, which is most of what makes a
    // sphere read as a sphere rather than as a lit circle
    float limb = mix(0.42, 1.0, pow(ndv, 0.55));
    // TRUE Lambert. A gamma below 1 here flattens the whole lit hemisphere into
    // one value and the planet stops reading as a sphere at all.
    float diff = max(ndl, 0.0);

    // --- ring shadow on the planet ----------------------------------------
    float shadow = 1.0;
    if (uRingOn > 0.5 && abs(L.y) > 1e-4) {
      float t = -vP.y / L.y;
      if (t > 0.0) {
        vec3 h = vP + L * t;
        float rr = length(h.xz);
        float rn = (rr - uRingInner) / (uRingOuter - uRingInner);
        if (rn > 0.0 && rn < 1.0) {
          shadow = 1.0 - texture2D(uRingTex, vec2(rn, 0.5)).a * uRingShadow;
        }
      }
    }

    vec3 lit = albedo * uSunColor * diff * limb * uGain * day * shadow;

    // --- forward-scattered rim on the lit limb ----------------------------
    float fres = pow(1.0 - ndv, 5.0);
    float rimMask = smoothstep(-0.18, 0.34, ndl);
    vec3 rim = uRimColor * fres * rimMask * uRimGain;

    // --- night side: dark, not black --------------------------------------
    float night = 1.0 - day;
    float pole = pow(abs(N.y), 7.0);
    vec3 dark = albedo * uNightColor * uNightGain * night * (0.35 + 0.65 * limb)
              + uAuroraColor * pole * night * uAuroraGain;

    gl_FragColor = vec4(lit + rim + dark, 1.0);
  }
`;

const HALO_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normalize(normal);
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAG = /* glsl */`
  uniform vec3 uSunL;
  uniform vec3 uCamL;
  uniform vec3 uColor;
  uniform float uGain;
  uniform float uShellSin;   // sin of the max angle the annulus subtends
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    // We are drawing the BACK faces of a shell a couple of per cent larger than
    // the planet. The planet has already written depth, so the only fragments that
    // survive are the thin annulus outside its silhouette. Inside that annulus,
    // -dot(N,V) runs from 0 at the OUTER edge to uShellSin at the planet's edge,
    // which is exactly the falloff an atmosphere has: brightest against the limb,
    // gone a moment later. Getting this backwards gives a glass marble.
    vec3 N = normalize(vN);
    vec3 L = normalize(uSunL);
    vec3 V = normalize(uCamL - vP);
    float d = clamp(-dot(N, V), 0.0, 1.0) / max(uShellSin, 1e-3);
    float rim = pow(clamp(d, 0.0, 1.0), 0.75);
    float lit = smoothstep(-0.02, 0.30, dot(N, L));
    gl_FragColor = vec4(uColor * rim * lit * uGain, 1.0);
  }
`;

const RING_VERT = /* glsl */`
  varying vec3 vP;
  void main() {
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */`
  uniform sampler2D uRingTex;
  uniform vec3 uSunL, uCamL, uSunColor;
  uniform float uInner, uOuter, uRadius, uOblate, uGain, uAmbient, uTau;
  varying vec3 vP;
  void main() {
    float r = length(vP.xz);
    float rn = (r - uInner) / (uOuter - uInner);
    if (rn < 0.0 || rn > 1.0) discard;
    vec4 d = texture2D(uRingTex, vec2(rn, 0.5));
    if (d.a < 0.004) discard;

    vec3 L = normalize(uSunL);
    vec3 V = normalize(uCamL - vP);

    // --- planet shadow on the ring ----------------------------------------
    // Closest approach of the ring point's sun ray to the (oblate) body. This is
    // the line that tells you the planet is a solid object and not a decal.
    float sh = 1.0;
    float tStar = -dot(vP, L);
    if (tStar > 0.0) {
      vec3 c = vP + L * tStar;
      float dd = length(vec3(c.x, c.y / uOblate, c.z));
      sh = smoothstep(uRadius * 0.985, uRadius * 1.075, dd);
    }

    // Beer-Lambert through a slab: edge on you look through more particles, but
    // it saturates instead of clamping, so the rings never become a solid plate.
    float mu = max(abs(V.y), 0.035);
    float alpha = 1.0 - exp(-d.a * uTau / mu);

    // forward scattering: rings brighten sharply with the sun behind them
    float fwd = max(0.0, -dot(L, V));
    float bright = 0.30 + 0.95 * pow(fwd, 2.2);

    vec3 c = d.rgb * uSunColor * (bright * sh + uAmbient) * uGain;
    gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0) * (0.45 + 0.55 * sh));
  }
`;

/**
 * @param {Object} p
 * @param {import('../../core/rng.js').RNG} p.rng
 * @param {number} p.radius            far-scene units (equatorial)
 * @param {THREE.Vector3} p.direction  unit direction from the camera to the planet
 * @param {number} p.distance          far-scene distance
 * @param {THREE.Vector3} p.sunDir      unit direction toward the sun, far-scene space
 * @param {number[]} p.ramp            6 palette hexes, bright zones first
 * @param {Object} p.colors            {sun, night, rim, aurora, storm, ringDust, ringIce}
 * @param {boolean} [p.rings]
 * @param {number} [p.tilt]            axial tilt, radians
 * @param {number} [p.spin]            rotation about the axis, radians
 */
export function buildGasGiant({
  rng,
  radius = 3200,
  direction = new THREE.Vector3(-0.34, -0.10, -0.93),
  distance = 9000,
  sunDir = new THREE.Vector3(-0.72, 0.30, 0.62),
  ramp,
  colors,
  rings = true,
  ringInner = 1.32,
  ringOuter = 2.26,
  tilt = 0.29,
  spin = 0.6,
  /**
   * Spin-axis direction in far-scene space. Given, it wins over `tilt`. This is
   * how the ring plane gets aimed: the ring shadow only LANDS on the lit hemisphere
   * when the sun is well above the ring plane, and the rings only stay thin when
   * the plane is near edge on to the camera. Those two constraints have exactly one
   * solution and it is not "some tilt about X".
   */
  axis = null,
  oblate = 0.935,
  gain = 1.0,
  textureSize = 1024,
} = {}) {
  const r = rng.fork('gasgiant');

  const root = new THREE.Group();
  root.name = 'gas-giant';
  root.position.copy(direction).normalize().multiplyScalar(distance);

  // Tilt group: everything below it shares the planet's local frame, so ring
  // plane, band latitude and shadow maths all agree without extra basis maths.
  const body = new THREE.Group();
  body.name = 'gas-giant-body';
  if (axis) {
    body.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(axis[0] ?? axis.x, axis[1] ?? axis.y, axis[2] ?? axis.z).normalize(),
    );
    body.rotateY(spin);
  } else {
    body.rotation.set(tilt, spin, r.range(-0.10, 0.10));
  }
  root.add(body);

  // Local-space sun and camera. Derived BEFORE the texture is built, because the
  // storm's longitude is aimed at the visible lit hemisphere and that aim is only
  // knowable once the body's frame exists.
  const sunL = new THREE.Vector3();
  const camL = new THREE.Vector3();

  const _inv = new THREE.Matrix4();
  const _basis = new THREE.Matrix3();
  const _zero = new THREE.Vector3();

  /**
   * Re-derive the local-space sun and camera. Directions go through the linear
   * part only; the camera position is a real point and takes the full inverse.
   */
  function refresh(farCamera = null) {
    root.updateMatrixWorld(true);
    _inv.copy(body.matrixWorld).invert();
    _basis.setFromMatrix4(_inv);
    sunL.copy(sunDir).normalize().applyMatrix3(_basis).normalize();
    camL.copy(farCamera ? farCamera.position : _zero).applyMatrix4(_inv);
  }
  refresh();

  // Aim the storm between the sub-observer and sub-solar points so it is both
  // facing us and lit. three's SphereGeometry maps u -> phi with
  // x = -cos(phi) sin(theta), z = sin(phi) sin(theta), so phi = atan2(z, -x).
  const aim = camL.clone().normalize().multiplyScalar(0.62).addScaledVector(sunL, 0.55).normalize();
  const aimU = ((Math.atan2(aim.z, -aim.x) / (Math.PI * 2)) % 1 + 1) % 1;
  const aimV = 0.5 + Math.asin(Math.max(-1, Math.min(1, aim.y))) / Math.PI;

  const albedo = buildGiantTexture(r, {
    width: textureSize, height: textureSize / 2,
    ramp, stormColor: colors.storm,
    stormU: (aimU + 0.045) % 1,
    stormV: Math.max(0.17, Math.min(0.44, aimV - 0.155)),
  });

  // Oblateness baked into the geometry rather than into a mesh scale, so the
  // local-space normals stay correct for the terminator.
  const geo = new THREE.SphereGeometry(radius, 112, 72);
  {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * oblate);
    p.needsUpdate = true;
    geo.computeVertexNormals();     // genuinely curved: smooth normals, on purpose
    geo.computeBoundingSphere();
  }

  const ringTex = rings ? buildRingTexture(r, { dust: colors.ringDust, ice: colors.ringIce }) : null;
  const rIn = radius * ringInner;
  const rOut = radius * ringOuter;

  const planetMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: albedo },
      uRingTex: { value: ringTex ?? albedo },
      uSunL: { value: sunL },
      uCamL: { value: camL },
      uSunColor: { value: col(colors.sun) },
      uNightColor: { value: col(colors.night) },
      uRimColor: { value: col(colors.rim) },
      uAuroraColor: { value: col(colors.aurora) },
      uGain: { value: gain },
      uNightGain: { value: colors.nightGain ?? 0.075 },
      uRimGain: { value: colors.rimGain ?? 1.35 },
      uAuroraGain: { value: colors.auroraGain ?? 0.30 },
      uRingOn: { value: rings ? 1 : 0 },
      uRingInner: { value: rIn },
      uRingOuter: { value: rOut },
      uRingShadow: { value: 0.88 },
      uRadius: { value: radius },
      uOblate: { value: oblate },
    },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    toneMapped: true,
    fog: false,
  });
  markCelestial(planetMat, 'gasgiant');

  const planet = new THREE.Mesh(geo, planetMat);
  planet.name = 'gas-giant-surface';
  planet.renderOrder = ORDER.planet;
  body.add(planet);

  // --- atmospheric halo: back faces of a slightly larger shell -------------
  const shellK = 1.022;
  const haloGeo = new THREE.SphereGeometry(radius * shellK, 72, 44);
  {
    const p = haloGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * oblate);
    p.needsUpdate = true;
    haloGeo.computeVertexNormals();
  }
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunL: { value: sunL },
      uCamL: { value: camL },
      uColor: { value: col(colors.rim) },
      uGain: { value: colors.haloGain ?? 0.85 },
      uShellSin: { value: Math.sqrt(Math.max(1e-4, 1 - 1 / (shellK * shellK))) },
    },
    vertexShader: HALO_VERT,
    fragmentShader: HALO_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    toneMapped: true,
    fog: false,
  });
  markCelestial(haloMat, 'gasgiant-halo');
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.name = 'gas-giant-halo';
  halo.renderOrder = ORDER.planet + 0.5;
  body.add(halo);

  // --- rings ---------------------------------------------------------------
  let ringMesh = null;
  let ringMat = null;
  let ringGeo = null;
  if (rings) {
    ringGeo = annulusXZ(rIn, rOut, 224);
    ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uRingTex: { value: ringTex },
        uSunL: { value: sunL },
        uCamL: { value: camL },
        uSunColor: { value: col(colors.sun) },
        uInner: { value: rIn },
        uOuter: { value: rOut },
        uRadius: { value: radius },
        uOblate: { value: oblate },
        uGain: { value: (colors.ringGain ?? 0.62) * gain },
        uAmbient: { value: colors.ringAmbient ?? 0.055 },
        uTau: { value: colors.ringTau ?? 0.85 },
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      toneMapped: true,
      fog: false,
    });
    markCelestial(ringMat, 'gasgiant-rings');
    ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.name = 'gas-giant-rings';
    ringMesh.renderOrder = ORDER.rings;
    body.add(ringMesh);
  }

  return {
    object: root,
    body,
    planet,
    rings: ringMesh,
    halo,
    radius,
    /** Angular diameter in radians as seen from the far camera. */
    get angularDiameter() { return 2 * Math.asin(Math.min(1, radius / distance)); },
    materials: [planetMat, haloMat, ringMat].filter(Boolean),
    refresh,
    dispose() {
      geo.dispose();
      haloGeo.dispose();
      ringGeo?.dispose();
      planetMat.dispose();
      haloMat.dispose();
      ringMat?.dispose();
      albedo.dispose();
      ringTex?.dispose();
    },
  };
}
