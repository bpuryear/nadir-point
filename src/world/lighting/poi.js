/**
 * THE PER-POI LIGHTING RIG. This is where the look lives.
 *
 * A point of interest is not a place with some props in it. It is a LIGHTING SETUP
 * that the player should be able to name from a single frame, and everything else —
 * the debris, the rocks, the sky — is there to be lit by it. So the rig is one
 * object with one direction and no ambiguity about where the light comes from.
 *
 * FIVE PARTS, IN ORDER OF HOW MUCH THEY MATTER:
 *
 * 1. ONE key. A single directional light, colour and intensity from the POI palette,
 *    direction from `CELESTIAL_SPECS[poi].sunDir` — the SAME vector the visible star
 *    is drawn along and the same vector the gas giant's terminator is computed from.
 *    A second "just to lift that side a bit" key is how a scene stops reading.
 *
 * 2. IBL, generated at runtime. Metal with no environment is black, and a scene lit
 *    only by directionals has flat, dead shadow sides. The environment here is a
 *    PMREM cube built from an actual generated SCENE — sky gradient, the sun disc at
 *    the key direction, the gas giant at its real angular size and phase, the nebula
 *    where the nebula is. So a hull's shadow side reflects the planet it is orbiting,
 *    and it does it directionally. That directionality is what gives shadowed regions
 *    readable value separation.
 *
 * 3. A WEAK fill from the opposite side, tinted with the POI's bounce colour. Its job
 *    is to keep the terminator on a hull from going to a hard black edge, not to
 *    light anything.
 *
 * 4. A hemisphere term, not an ambient one. `AmbientLight` adds a constant to every
 *    surface, which is precisely the "mid-grey mush" failure: it raises the black
 *    point everywhere and removes the value separation the IBL just created. A
 *    hemisphere light at low intensity keeps a top-to-bottom gradient, so the
 *    underside of a hull still goes near-black.
 *
 * 5. Post overrides from `POI_PALETTES[poi].grade`, plus a key-light proxy the
 *    god-ray pass aims at. The proxy tracks the camera along the key direction,
 *    because the visible star lives in the FAR scene (whose camera does not
 *    translate) while the god-ray pass projects with the MAIN camera; without that
 *    tracking the shafts point somewhere the sun is not.
 *
 * SHADOWS are configured for a 1.4 km ship: a 2048 map over a 6.8 km ortho box is
 * 3.3 m per texel, which resolves a cruiser's sponsons and its shadow across a debris
 * field without the peter-panning a looser box gives.
 */

import * as THREE from 'three';
import { getPOIPalette, NEUTRAL, mix, shade } from '../../art/palette.js';
import { CELESTIAL_SPECS } from '../celestials/index.js';
import { markCelestial, col } from '../celestials/common.js';

/** Rec.709 relative luminance of a linear THREE.Color. */
const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

const ENV_R = 60;           // radius the env-scene props sit at
const KEY_DISTANCE = 14000; // metres; only affects the shadow camera placement
const PROXY_DISTANCE = 90000;

/** Vertical gradient sky for the environment scene. */
function envSky(ibl) {
  const geo = new THREE.SphereGeometry(ENV_R * 1.6, 24, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: col(ibl.zenith) },
      uHorizon: { value: col(ibl.horizon) },
      uGround: { value: col(ibl.ground) },
    },
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uGround;
      varying vec3 vP;
      void main() {
        float h = normalize(vP).y;
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.62, h));
        c = mix(c, uGround, smoothstep(0.0, -0.5, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  markCelestial(mat, 'ibl-sky');
  const m = new THREE.Mesh(geo, mat);
  m.name = 'ibl-sky';
  return m;
}

/** A half-lit sphere at a real angular size. The planetshine source. */
function envGiant(dir, angularRadius, lit, dark, sunDir) {
  const radius = Math.sin(angularRadius) * ENV_R;
  const geo = new THREE.SphereGeometry(Math.max(0.5, radius), 24, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sunDir.clone() },
      uLit: { value: col(lit) },
      uDark: { value: col(dark) },
      uCentre: { value: dir.clone().multiplyScalar(ENV_R) },
    },
    vertexShader: /* glsl */`
      varying vec3 vN;
      void main() { vN = normalize(normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uLit, uDark;
      varying vec3 vN;
      void main() {
        float d = smoothstep(-0.10, 0.18, dot(normalize(vN), normalize(uSun)));
        gl_FragColor = vec4(mix(uDark, uLit, d), 1.0);
      }
    `,
    toneMapped: false,
    fog: false,
  });
  markCelestial(mat, 'ibl-giant');
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(dir).multiplyScalar(ENV_R);
  m.name = 'ibl-giant';
  return m;
}

function envSun(dir, angularRadius, color, gain) {
  const radius = Math.max(0.25, Math.sin(Math.max(0.01, angularRadius)) * ENV_R);
  const geo = new THREE.SphereGeometry(radius, 16, 12);
  const mat = new THREE.MeshBasicMaterial({
    color: col(color).multiplyScalar(gain),
    toneMapped: false,
    fog: false,
  });
  markCelestial(mat, 'ibl-sun');
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(dir).multiplyScalar(ENV_R);
  m.name = 'ibl-sun';
  return m;
}

function envNebula(dir, tint, gain, spread) {
  const geo = new THREE.SphereGeometry(ENV_R * spread, 16, 12);
  const mat = new THREE.MeshBasicMaterial({
    color: col(tint).multiplyScalar(gain),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  markCelestial(mat, 'ibl-nebula');
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(dir).multiplyScalar(ENV_R * 0.75);
  m.name = 'ibl-nebula';
  return m;
}

/**
 * Build the environment map for a POI out of a generated scene.
 * @returns {{texture:THREE.Texture|null, dispose:Function}}
 */
export function buildPOIEnvironment(poiId, renderer, { spec = null } = {}) {
  const pal = getPOIPalette(poiId);
  const s = spec ?? CELESTIAL_SPECS[poiId] ?? CELESTIAL_SPECS['giant-orbit'];
  const gl = renderer?.isWebGLRenderer ? renderer : (renderer?.renderer ?? null);

  const scene = new THREE.Scene();
  const disposables = [];
  const add = (o) => { scene.add(o); disposables.push(o); return o; };

  add(envSky(pal.ibl));
  add(envSun(s.sunDir, s.star?.angularRadius ?? pal.key.angularRadius ?? 0.02, pal.ibl.sun, 26 * (pal.ibl.intensity ?? 1)));

  if (s.giant) {
    const ang = Math.asin(Math.min(1, s.giant.radius / s.giant.distance));
    add(envGiant(
      s.giant.direction,
      ang,
      mix(pal.fill.color, NEUTRAL.ice, 0.22),
      shade(pal.shadow, 1.6),
      s.sunDir,
    ));
  }

  if (s.nebula) {
    const dir = new THREE.Vector3(s.nebula.centre[0], s.nebula.centre[1], s.nebula.centre[2]).normalize();
    add(envNebula(dir, mix(pal.accent, pal.fill.color, 0.4), 0.35 * (s.nebula.intensity ?? 1), 0.55));
  }

  let texture = null;
  let pmrem = null;
  if (gl) {
    try {
      pmrem = new THREE.PMREMGenerator(gl);
      pmrem.compileCubemapShader();
      const rt = pmrem.fromScene(scene, 0, 1, ENV_R * 2.4);
      texture = rt.texture;
      texture.name = `poi-env:${poiId}`;
    } catch (err) {
      console.warn('[poi-lighting] PMREM from scene failed, falling back to palette env', err);
      texture = null;
    }
  }

  const dispose = () => {
    for (const o of disposables) {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m?.dispose?.();
    }
    scene.clear();
    pmrem?.dispose?.();
    texture?.dispose?.();
  };

  return { texture, dispose };
}

/**
 * THE RIG.
 *
 * @param {string} poiId                        a POI_PALETTES id
 * @param {import('../../core/contracts.js').BuildContext} ctx
 * @param {Object} world                        needs {scene, far, camera, renderer, engine}
 * @param {Object} [opts]
 * @param {number} [opts.shadowRadius]          half-extent of the shadow box, metres
 * @param {number} [opts.shadowMapSize]
 * @param {boolean} [opts.fog]
 * @param {boolean} [opts.applyGrade]           push the POI's post overrides
 * @param {number} [opts.envIntensity]
 * @returns {{key:THREE.DirectionalLight, fill:THREE.DirectionalLight,
 *            ambient:THREE.HemisphereLight, envMap:THREE.Texture|null,
 *            sunDir:THREE.Vector3, keyProxy:THREE.Object3D, grade:Object,
 *            dispose:Function}}
 */
export function buildPOILighting(poiId, ctx, world, opts = {}) {
  const pal = getPOIPalette(poiId);
  const spec = opts.spec ?? CELESTIAL_SPECS[poiId] ?? CELESTIAL_SPECS['giant-orbit'];
  const scene = world.scene;
  const renderer = world.renderer;

  const sunDir = (opts.sunDir ?? spec.sunDir).clone().normalize();

  const shadowRadius = opts.shadowRadius ?? 3400;
  const shadowMapSize = opts.shadowMapSize ?? 2048;

  // --- 1. the key ----------------------------------------------------------
  const key = new THREE.DirectionalLight(col(pal.key.color), pal.key.intensity);
  key.name = `poi-key:${poiId}`;
  key.position.copy(sunDir).multiplyScalar(KEY_DISTANCE);
  key.target.position.set(0, 0, 0);
  key.castShadow = opts.shadows !== false;
  key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  key.shadow.camera.near = KEY_DISTANCE - shadowRadius * 2.2;
  key.shadow.camera.far = KEY_DISTANCE + shadowRadius * 2.6;
  key.shadow.camera.left = -shadowRadius;
  key.shadow.camera.right = shadowRadius;
  key.shadow.camera.top = shadowRadius;
  key.shadow.camera.bottom = -shadowRadius;
  // At 3.3 m/texel a constant bias cannot cover both a flat plate and a grazing
  // hull, so most of the work is done by the normal offset, in metres.
  key.shadow.bias = -0.00045;
  key.shadow.normalBias = Math.max(2, shadowRadius / 420);
  key.shadow.camera.updateProjectionMatrix();
  scene.add(key);
  scene.add(key.target);

  // --- 3. the fill ---------------------------------------------------------
  /**
   * WHERE THE FILL COMES FROM IS NOT A FREE CHOICE.
   *
   * If this POI has a gas giant filling a third of the sky, that planet IS the
   * second light source — it is an area light thirty degrees across reflecting its
   * star straight back at you. Pointing the fill at the anti-sun instead leaves
   * every hull facing the planet in flat black while the planet behind it is bright,
   * which reads instantly as wrong even to someone who could not say why.
   *
   * With no giant, the fill falls back to the opposite hemisphere, pushed below the
   * plane so it separates undersides rather than washing the whole shadow side.
   */
  const fillDir = (opts.fillDir
    ? opts.fillDir.clone().normalize()
    : spec.giant
      ? spec.giant.direction.clone().normalize()
      : new THREE.Vector3(-sunDir.x, -Math.abs(sunDir.y) * 0.55 - 0.25, -sunDir.z).normalize());
  /**
   * INTENSITY IS NOT THE SAME THING AS BRIGHTNESS.
   *
   * The palette states each light as a HUE plus a strength relative to the key —
   * giant-orbit is key 3.4, fill 0.55, a textbook 6:1 ratio. Handing those numbers
   * to three.js raw does not produce a 6:1 ratio, because three multiplies colour by
   * intensity and the two colours have wildly different luminance: the cream key
   * (0xfff0d8) is Y=0.88, the planetshine blue (0x3f63b4) is Y=0.13. The stated 6:1
   * silently becomes 41:1 and every shadow side in the POI goes to flat black.
   *
   * So the rig normalises by luminance. `pal.fill.intensity / pal.key.intensity` is
   * then the ratio you actually see, which is what the palette author meant.
   */
  const keyY = luminance(col(pal.key.color));
  const fillY = luminance(col(pal.fill.color));
  const fillScale = opts.fillScale ?? 1;
  const fillIntensity = pal.fill.intensity * (keyY / Math.max(1e-3, fillY)) * fillScale;
  const fill = new THREE.DirectionalLight(col(pal.fill.color), fillIntensity);
  fill.name = `poi-fill:${poiId}`;
  fill.position.copy(fillDir).multiplyScalar(KEY_DISTANCE);
  fill.castShadow = false;
  scene.add(fill);
  scene.add(fill.target);

  // --- 4. hemisphere, NOT ambient -----------------------------------------
  // Same luminance normalisation, then damped: a hemisphere term is the closest
  // thing here to an ambient wash, so it is deliberately run under its nominal
  // strength and left to do nothing but keep undersides off pure black.
  const bounceY = luminance(col(pal.bounce.color));
  const ambient = new THREE.HemisphereLight(
    col(pal.bounce.color),
    col(shade(pal.shadow, 0.85)),
    pal.bounce.intensity * (keyY / Math.max(1e-3, bounceY)) * (opts.bounceScale ?? 0.55),
  );
  ambient.name = `poi-bounce:${poiId}`;
  scene.add(ambient);

  // --- 2. IBL --------------------------------------------------------------
  const env = buildPOIEnvironment(poiId, renderer, { spec });
  const envIntensity = opts.envIntensity ?? (pal.ibl.intensity ?? 1) * 0.85;
  if (env.texture) {
    scene.environment = env.texture;
    scene.environmentIntensity = envIntensity;
  }

  // --- fog: distance haze, tinted by the POI -------------------------------
  const previousFog = scene.fog;
  if (opts.fog !== false && pal.fog) {
    scene.fog = new THREE.FogExp2(col(pal.fog.color), pal.fog.density);
  }

  // --- 5. post overrides + god-ray anchor ----------------------------------
  const grade = { ...pal.grade, ...(opts.grade ?? {}) };
  const post = renderer?.post ?? null;
  const previousGrade = post ? {
    exposure: post.baseExposure,
    bloom: post.bloom.strength,
    godrays: post.godrayIntensity,
    vignette: post.grade.uniforms.vignette.value,
  } : null;

  const keyProxy = new THREE.Object3D();
  keyProxy.name = `poi-key-proxy:${poiId}`;
  keyProxy.position.copy(sunDir).multiplyScalar(PROXY_DISTANCE);
  scene.add(keyProxy);

  if (post && opts.applyGrade !== false) {
    post.setExposure(grade.exposure ?? 1);
    post.bloom.strength = grade.bloom ?? post.bloom.strength;
    post.godrayIntensity = grade.godrays ?? 0.4;
    post.grade.uniforms.vignette.value = grade.vignette ?? 0.42;
    post.setKeyLight(keyProxy, col(pal.key.color));
  }

  /**
   * Two jobs per frame, both about the fact that this rig lights a moving camera:
   *
   * 1. The god-ray proxy sits along the key direction FROM THE CAMERA, because the
   *    star it stands in for lives in the far scene (whose camera does not
   *    translate) while the god-ray pass projects with the MAIN camera. Anchored at
   *    a fixed world point instead, the shafts drift as the camera moves, which is
   *    the tell that they are a screen effect.
   *
   * 2. The shadow box follows where the camera is LOOKING, not where it is. An
   *    orbit camera 4 km back from its target would otherwise push a 6.8 km box
   *    right off the ship it is supposed to be shadowing. The focus point is the
   *    camera ray's intersection with the combat plane — for a plane-locked RTS
   *    that is by definition where the action is — snapped to the shadow map's texel
   *    grid so the shadow edges do not crawl as the camera pans.
   */
  const _fwd = new THREE.Vector3();
  const _focus = new THREE.Vector3();
  const texelWorld = (shadowRadius * 2) / shadowMapSize;

  const system = {
    name: `poi-lighting:${poiId}`,
    order: 140,
    update() {
      const cam = world.camera;
      keyProxy.position.copy(cam.position).addScaledVector(sunDir, PROXY_DISTANCE);

      cam.getWorldDirection(_fwd);
      let t = shadowRadius;
      if (_fwd.y < -1e-3) t = Math.min(-cam.position.y / _fwd.y, shadowRadius * 4);
      _focus.copy(cam.position).addScaledVector(_fwd, Math.max(0, t));
      _focus.y = 0;
      _focus.x = Math.round(_focus.x / texelWorld) * texelWorld;
      _focus.z = Math.round(_focus.z / texelWorld) * texelWorld;

      key.position.copy(_focus).addScaledVector(sunDir, KEY_DISTANCE);
      key.target.position.copy(_focus);
      key.target.updateMatrixWorld();
    },
  };
  if (opts.trackCamera !== false) world.engine?.addRender(system);

  return {
    key,
    fill,
    ambient,
    envMap: env.texture,
    envIntensity,
    sunDir,
    keyProxy,
    /** For `post.setKeyLight(proxy, tint)` — game.js reads this. */
    keyColor: col(pal.key.color),
    grade,
    palette: pal,
    /** Point the rig somewhere else without rebuilding it. */
    fillDir,
    setSunDir(v) {
      sunDir.copy(v).normalize();
      key.position.copy(sunDir).multiplyScalar(KEY_DISTANCE);
      keyProxy.position.copy(sunDir).multiplyScalar(PROXY_DISTANCE);
    },
    dispose() {
      scene.remove(key, key.target, fill, fill.target, ambient, keyProxy);
      key.dispose?.();
      fill.dispose?.();
      ambient.dispose?.();
      if (scene.environment === env.texture) scene.environment = null;
      scene.fog = previousFog;
      env.dispose();
      if (post && previousGrade) {
        post.setExposure(previousGrade.exposure);
        post.bloom.strength = previousGrade.bloom;
        post.godrayIntensity = previousGrade.godrays;
        post.grade.uniforms.vignette.value = previousGrade.vignette;
      }
      const list = world.engine?.renderSystems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
    },
  };
}
