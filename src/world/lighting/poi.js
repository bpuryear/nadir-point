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
 * 1b. A RIM, and it tracks the camera. This is the one light here that is not
 *    physical, and it earns its place: in vacuum, against a starfield, a grey hull
 *    with no rim has no silhouette — the moment the key is on the far side, the
 *    outline dissolves into black. Every reference frame worth copying puts a
 *    cold or warm kicker along the upper edge of the hull. It sits BEHIND the
 *    subject from the camera's point of view, tilted up and away from the key, so
 *    the band it lights is the silhouette rather than a second broad light.
 *    Because the camera moves, the light has to move with it or the rim wanders
 *    off the edge it exists to describe.
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
 * SHADOWS are configured for a 1.4 km ship. The box is deliberately only a little
 * larger than the hull plus its escorts, because the normal-offset bias scales with
 * texel size and the bias is what decides whether self-shadowing exists at all: a
 * 6.8 km box at 2048 gave 3.3 m texels and a 13 m normal offset, which is a fifth of
 * the truss height — every contact shadow under the ventral truss and the dorsal
 * overhang was being pushed clean off the geometry that cast it. Halving the box
 * quarters the bias and the mass cues come back.
 */

import * as THREE from 'three';
import { getPOIPalette, NEUTRAL, mix, shade } from '../../art/palette.js';
import { CELESTIAL_SPECS } from '../celestials/index.js';
import { markCelestial, col } from '../celestials/common.js';

/** Brightest channel of a linear THREE.Color. */
const peak = (c) => Math.max(c.r, c.g, c.b);

/**
 * STATED STRENGTH -> three.js INTENSITY, AND WHY IT IS PEAK AND NOT LUMINANCE.
 *
 * The palette states fill / bounce / rim as the peak channel of the irradiance they
 * should contribute, so `hexColor * returned` has its brightest channel equal to
 * `stated`. That is the whole reason the terminator exists.
 *
 * The previous version normalised by LUMINANCE instead, reasoning that a stated 6:1
 * key:fill ratio should survive three's colour x intensity model. It does — in
 * luminance. But these fills are saturated by design: giant-orbit's planetshine
 * 0x3f63b4 has Y=0.134 and a blue channel of 0.45, so dividing by luminance
 * multiplied it by 6.2 and handed three a fill light of intensity 10.0 against a key
 * of 9.5. In the channel that actually carried it, the "6:1 fill" was 1.45:1. Every
 * face of the player cruiser then returned the same value regardless of which way it
 * pointed, the hull rendered as saturated cobalt with no light direction, and the
 * frame lost the two-temperature read this whole file exists to produce.
 *
 * Peak normalisation keeps the hue and keeps the ratio. It is the boring answer and
 * it is the correct one.
 */
const statedToIntensity = (color, stated) => stated / Math.max(1e-3, peak(color));

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

  const shadowRadius = opts.shadowRadius ?? 1750;
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
  // A constant depth bias cannot cover both a flat plate and a hull at a grazing
  // angle to the light, so most of the work is done by the normal offset — which is
  // in METRES here, because the world is in metres. It is therefore tied to the
  // TEXEL SIZE and nothing else: about 1.4 texels is the smallest offset that kills
  // acne on this content, and anything much larger detaches contact shadows from the
  // geometry that casts them. At 1750 m / 2048 that is ~2.4 m, against the 13 m the
  // old `shadowRadius / 260` produced.
  const texelM = (shadowRadius * 2) / shadowMapSize;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = Math.max(1.2, texelM * 1.4);
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
   * The fill's COLOUR is not the POI's identity colour, and the difference matters.
   *
   * `pal.fill.color` is what the location is - the deep belt of the giant, the sick
   * green of the nebula - and the celestial shaders derive from it. But the light
   * arriving off a source thirty degrees across is the average of the whole disc,
   * bright zones and cream storm included, not the colour of its darkest band. Used
   * raw, a 0x3f63b4 belt turns every shadowed face on a neutral gunmetal hull into
   * saturated primary blue, which is the plastic-model-kit read. `fill.broad` says
   * how far to average towards neutral; the near-star's fill is nearly a point
   * source at this distance and barely broadens at all.
   */
  const fillColor = col(mix(pal.fill.color, NEUTRAL.ice, pal.fill.broad ?? 0.32));
  const fillScale = opts.fillScale ?? 1;
  const fillIntensity = statedToIntensity(fillColor, pal.fill.intensity * fillScale);
  const fill = new THREE.DirectionalLight(fillColor, fillIntensity);
  fill.name = `poi-fill:${poiId}`;
  fill.position.copy(fillDir).multiplyScalar(KEY_DISTANCE);
  fill.castShadow = false;
  scene.add(fill);
  scene.add(fill.target);

  // --- 1b. the rim / kicker ------------------------------------------------
  /**
   * Placed BEHIND the subject along the view axis, lifted, and pushed to the side
   * AWAY from the key so it is describing a different edge than the key already
   * describes. Surfaces facing away from the camera are the ones it lights, which
   * on a solid hull means the band you can see is the silhouette itself.
   *
   * It is updated every frame from the camera in the render system at the bottom of
   * this function. A rim anchored in world space is not a rim, it is a fourth key.
   */
  const rimSpec = pal.rim ?? { color: pal.accent, intensity: 0.9 };
  const rimColor = col(rimSpec.color);
  const rim = new THREE.DirectionalLight(
    rimColor,
    statedToIntensity(rimColor, rimSpec.intensity * (opts.rimScale ?? 1)),
  );
  rim.name = `poi-rim:${poiId}`;
  rim.castShadow = false;
  scene.add(rim);
  scene.add(rim.target);

  // --- 4. hemisphere, NOT ambient -----------------------------------------
  // A hemisphere term is the closest thing here to an ambient wash, so it is stated
  // low and left to do nothing but keep undersides off pure black. Anything more and
  // it raises the black point everywhere, which is the mid-grey mush failure.
  const bounceColor = col(pal.bounce.color);
  const ambient = new THREE.HemisphereLight(
    bounceColor,
    col(shade(pal.shadow, 0.85)),
    statedToIntensity(bounceColor, pal.bounce.intensity * (opts.bounceScale ?? 1)),
  );
  ambient.name = `poi-bounce:${poiId}`;
  scene.add(ambient);

  // --- 2. IBL --------------------------------------------------------------
  // The IBL's job is to give METAL something to reflect and to give the shadow side
  // its directional variation. It is NOT a fill: run hot, a near-uniform irradiance
  // over the whole sphere is indistinguishable from an AmbientLight and it flattens
  // exactly the faces the key is trying to separate.
  const env = buildPOIEnvironment(poiId, renderer, { spec });
  const envIntensity = opts.envIntensity ?? (pal.ibl.intensity ?? 1);
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
    colorGrade: post.getColorGrade(),
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
    // One grade for everything in frame. Rocks, hull and sky are lit by the same rig
    // but they do not share an albedo family, so without this the frame carries
    // three unrelated temperatures. Cold in the toe, the key's cream in the shoulder.
    post.setColorGrade({
      lift: grade.lift, liftAmount: grade.liftAmount,
      gain: grade.gain, gainAmount: grade.gainAmount,
      saturation: grade.saturation,
    });
    post.setKeyLight(keyProxy, col(pal.key.color));
  }

  /**
   * Three jobs per frame, all about the fact that this rig lights a moving camera:
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
   *
   * 3. The rim goes BEHIND the focus point along the view axis, lifted, and rolled
   *    towards whichever side the key is NOT on. Both of those matter: straight
   *    behind and level, it lights the whole far side and reads as a second key;
   *    on the key's side it just widens the key's terminator instead of drawing the
   *    opposite edge.
   */
  const _fwd = new THREE.Vector3();
  const _focus = new THREE.Vector3();
  const _rimDir = new THREE.Vector3();
  const _side = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
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

      // Screen-right, then bias away from the key's screen side.
      _side.crossVectors(_fwd, _up);
      if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
      _side.normalize();
      const keySide = _side.dot(sunDir);
      _rimDir.copy(_fwd)
        .addScaledVector(_up, 0.42)
        .addScaledVector(_side, keySide > 0 ? -0.40 : 0.40)
        .normalize();
      rim.position.copy(_focus).addScaledVector(_rimDir, KEY_DISTANCE);
      rim.target.position.copy(_focus);
      rim.target.updateMatrixWorld();
    },
  };
  // Run once immediately so a single-frame capture, or a probe that never starts the
  // engine, still gets a placed rim rather than one sitting at the origin.
  system.update();
  if (opts.trackCamera !== false) world.engine?.addRender(system);

  return {
    key,
    fill,
    rim,
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
      scene.remove(key, key.target, fill, fill.target, rim, rim.target, ambient, keyProxy);
      key.dispose?.();
      fill.dispose?.();
      rim.dispose?.();
      ambient.dispose?.();
      if (scene.environment === env.texture) scene.environment = null;
      scene.fog = previousFog;
      env.dispose();
      if (post && previousGrade) {
        post.setExposure(previousGrade.exposure);
        post.bloom.strength = previousGrade.bloom;
        post.godrayIntensity = previousGrade.godrays;
        post.grade.uniforms.vignette.value = previousGrade.vignette;
        post.setColorGrade(previousGrade.colorGrade);
      }
      const list = world.engine?.renderSystems;
      if (list) {
        const i = list.indexOf(system);
        if (i >= 0) list.splice(i, 1);
      }
    },
  };
}
