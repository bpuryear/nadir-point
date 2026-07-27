/**
 * THE MATERIAL REGISTRY.
 *
 * This is a contract. Three other streams code against it without talking to me,
 * so the shape below is fixed:
 *
 *     const registry = createMaterialRegistry({ renderer, rng });
 *     const mat = registry.get('hull', { faction: 'coalition', wear: 0.6, tier: 2 });
 *     registry.audit();      // { materials, textures, byKey }
 *     registry.dispose();
 *
 * `get` is memoised. Identical arguments return the IDENTICAL instance, not an
 * equal one, because three batches by material identity - two equal-but-distinct
 * materials are two draw calls and two shader programs, and the draw-call ceiling
 * in units.js is 320 and committed.
 *
 * WHY NOBODY MAY CALL `new THREE.MeshStandardMaterial` DIRECTLY
 *   - palette enforcement stops working (see palette.js#auditMaterials)
 *   - the texture cache stops working, and every hull bakes its own 512x512s
 *   - batching stops working, and the draw-call budget goes with it
 * `BuildContext.materials` in core/contracts.js is this object. Use it.
 *
 * UV CONVENTION - not negotiable, everything here assumes it:
 *   * ONE UV UNIT IS ONE METRE. The registry sets texture.repeat from the
 *     faction's real plate size, so plates are physically the same size on a
 *     fighter and on a cruiser. If you author 0..1 UVs, every hull will look like
 *     a different scale and the game's entire sense of size goes with it.
 *   * +V POINTS UP THE HULL. Streaks run down, stencilled markings are upright.
 *
 * INSTANCING - read this before you use an InstancedMesh
 *   Pass `{ instanced: true }`. That gives you a separate cached instance so an
 *   InstancedMesh and a plain Mesh never share a material (sharing one forces
 *   three to recompile the program every frame as the instancing flag flips).
 *   It does NOT set `vertexColors`, deliberately: three already defines USE_COLOR
 *   when an InstancedMesh has an instanceColor, and setting `vertexColors` on
 *   geometry that has no `color` attribute makes the mesh render BLACK. Only pass
 *   `{ vertexColors: true }` when your geometry really carries per-vertex colour.
 */

import * as THREE from 'three';
import { RNG } from '../../core/rng.js';
import { FACTIONS } from '../../core/contracts.js';
import {
  getFactionPalette, getPOIPalette, DEFAULT_POI,
  assertPaletteColor, emissiveColor, auditMaterials, paletteAudit, NEUTRAL,
} from '../palette.js';
import { TextureFactory, SCALE, RUNNING_LIGHT_SPACING_M, RUNNING_LIGHT_TILE_M } from '../textures/index.js';
import { applyScorchStamp } from '../textures/scorch.js';
import { ctx2d } from '../textures/canvas2d.js';
import { EnvironmentCache } from './env.js';

export { SCALE, RUNNING_LIGHT_SPACING_M, RUNNING_LIGHT_TILE_M };

/** Every key the registry answers to. */
export const MATERIAL_KEYS = [
  'hull', 'hullDark', 'plating', 'greeble', 'trim',
  'emissive', 'engineGlow', 'glass', 'damaged',
  'asteroid', 'debris', 'derelictHull',
  // beyond the required set, because somebody has to own them:
  'runningLights', 'decal',
];

const quantize = (v, step) => Math.round(v / step) * step;

/** Hull-ish keys share one normalisation and one build path. */
const HULL_VARIANTS = {
  hull: { variant: 'hull', normalScale: 1.0, envMapIntensity: 1.15 },
  hullDark: { variant: 'hullDark', normalScale: 0.9, envMapIntensity: 0.8 },
  plating: { variant: 'plating', normalScale: 1.0, envMapIntensity: 1.2 },
  greeble: { variant: 'greeble', normalScale: 1.15, envMapIntensity: 1.35 },
  trim: { variant: 'trim', normalScale: 0.7, envMapIntensity: 0.9 },
  derelictHull: { variant: 'derelictHull', normalScale: 1.3, envMapIntensity: 0.85 },
  debris: { variant: 'debris', normalScale: 1.0, envMapIntensity: 1.0 },
};

/**
 * @param {Object} p
 * @param {THREE.WebGLRenderer|{renderer:THREE.WebGLRenderer}} [p.renderer]
 * @param {RNG} [p.rng]
 * @param {string} [p.poi]  POI palette id driving the default environment
 */
export function createMaterialRegistry({ renderer = null, rng = new RNG('materials'), poi = DEFAULT_POI, size = 512 } = {}) {
  const gl = renderer?.isWebGLRenderer ? renderer : (renderer?.renderer ?? null);
  const textures = new TextureFactory({ rng: rng.fork('textures'), renderer: gl });
  const env = new EnvironmentCache(gl);

  /** @type {Map<string, THREE.Material>} */
  const materials = new Map();
  const byKey = Object.create(null);
  let activePOI = poi;
  let hits = 0;
  let uniqueCounter = 0;

  const defaultSize = size;

  // -------------------------------------------------------------------------
  // normalisation - runs BEFORE the cache key, so get('hull',{faction:'x'}) and
  // get('hull',{faction:'x', wear:0.45}) are the same material.
  // -------------------------------------------------------------------------
  function normalize(key, opts = {}) {
    const o = { ...opts };

    if (key !== 'asteroid') {
      o.faction = o.faction ?? 'player';
      if (!FACTIONS.includes(o.faction)) {
        throw new Error(`[materials] unknown faction "${o.faction}" for key "${key}" (have: ${FACTIONS.join(', ')})`);
      }
    }
    o.instanced = !!o.instanced;
    o.vertexColors = !!o.vertexColors;
    o.flatShading = !!o.flatShading;
    o.size = o.size ?? defaultSize;

    if (HULL_VARIANTS[key]) {
      o.wear = quantize(Math.min(1, Math.max(0, o.wear ?? 0.45)), 0.125);
      o.tier = Math.min(3, Math.max(1, Math.round(o.tier ?? 1)));
      o.scale = quantize(Math.max(0.25, o.scale ?? 1), 0.25);
      if (key === 'derelictHull') o.faction = 'derelict';
    }
    if (key === 'damaged') {
      o.severity = quantize(Math.min(1, Math.max(0, o.severity ?? 0.5)), 0.25);
      o.tier = Math.min(3, Math.max(1, Math.round(o.tier ?? 1)));
      o.scale = quantize(Math.max(0.25, o.scale ?? 1), 0.25);
    }
    if (key === 'emissive' || key === 'engineGlow' || key === 'runningLights') {
      const pal = getFactionPalette(o.faction);
      o.color = o.color ?? (key === 'engineGlow' ? pal.engine : pal.emissive);
      assertPaletteColor(o.color, `materials.get('${key}')`);
      // Bloom threshold in postfx.js is 1.05 on luminance. These defaults sit just
      // above it so a light glows, and well below the point where a large emissive
      // face floods the frame - area matters more than intensity for bloom.
      const dflt = key === 'engineGlow' ? 2.6 : key === 'runningLights' ? 2.0 : 1.9;
      o.intensity = quantize(Math.max(0, o.intensity ?? dflt), 0.05);
    }
    if (key === 'glass') {
      const pal = getFactionPalette(o.faction);
      o.tint = o.tint ?? pal.glass;
      assertPaletteColor(o.tint, "materials.get('glass')");
    }
    if (key === 'asteroid') {
      o.tint = o.tint ?? NEUTRAL.rock;
      assertPaletteColor(o.tint, "materials.get('asteroid')");
      o.ore = quantize(Math.max(0, Math.min(1, o.ore ?? 0.18)), 0.05);
      o.scale = quantize(Math.max(0.25, o.scale ?? 1), 0.25);
    }
    return o;
  }

  function cacheKey(key, o) {
    const parts = [];
    for (const k of Object.keys(o).sort()) {
      const v = o[k];
      if (v === undefined || v === null || typeof v === 'object' || typeof v === 'function') continue;
      parts.push(`${k}=${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(4) : v}`);
    }
    return `${key}[${parts.join(',')}]`;
  }

  // -------------------------------------------------------------------------
  // builders
  // -------------------------------------------------------------------------

  function hullMapsFor(o, variant, cached = true) {
    const args = {
      faction: o.faction, variant, wear: o.wear, tier: o.tier,
      size: o.size, scale: o.scale, markings: o.markings !== false,
    };
    return cached ? textures.get('hull', args) : textures.build('hull', args);
  }

  function standardFromMaps(maps, spec, o) {
    const m = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normalMap,
      aoMap: maps.ormMap,
      roughnessMap: maps.ormMap,
      metalnessMap: maps.ormMap,
      // Absolute values live in the map. The scalars are multipliers and must be 1
      // or the faction's carefully tuned roughness gets scaled twice.
      roughness: 1,
      metalness: 1,
      envMapIntensity: spec.envMapIntensity,
      flatShading: o.flatShading,
      vertexColors: o.vertexColors,
      side: o.side ?? THREE.FrontSide,
    });
    m.normalScale.set(spec.normalScale, spec.normalScale);
    m.userData.maps = maps;
    return m;
  }

  const BUILDERS = {
    hull: (o) => standardFromMaps(hullMapsFor(o, 'hull'), HULL_VARIANTS.hull, o),
    hullDark: (o) => standardFromMaps(hullMapsFor(o, 'hullDark'), HULL_VARIANTS.hullDark, o),
    plating: (o) => standardFromMaps(hullMapsFor(o, 'plating'), HULL_VARIANTS.plating, o),
    greeble: (o) => standardFromMaps(hullMapsFor(o, 'greeble'), HULL_VARIANTS.greeble, o),
    trim: (o) => standardFromMaps(hullMapsFor(o, 'trim'), HULL_VARIANTS.trim, o),
    derelictHull: (o) => standardFromMaps(hullMapsFor(o, 'derelictHull'), HULL_VARIANTS.derelictHull, o),

    /**
     * Torn hull fragment. The albedo is deliberately desaturated so an
     * InstancedMesh can tint each fragment with setColorAt and carry Coalition,
     * Concord and derelict wreckage in one draw call.
     */
    debris: (o) => {
      const m = standardFromMaps(hullMapsFor(o, 'debris'), HULL_VARIANTS.debris, o);
      m.side = THREE.DoubleSide;   // fragments are thin and seen from both faces
      m.color.setRGB(1, 1, 1);     // instanceColor multiplies this
      return m;
    },

    emissive: (o) => {
      const m = new THREE.MeshBasicMaterial({
        color: emissiveColor(o.color, o.intensity, 'materials.emissive'),
        toneMapped: true,
        fog: false,
        vertexColors: o.vertexColors,
      });
      return m;
    },

    engineGlow: (o) => {
      const glow = textures.get('glow', { faction: o.faction, size: 128 });
      return new THREE.MeshBasicMaterial({
        map: glow.texture,
        color: emissiveColor(o.color, o.intensity, 'materials.engineGlow'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: true,
        fog: false,
        vertexColors: o.vertexColors,
      });
    },

    runningLights: (o) => {
      const strip = textures.get('runningLights', { faction: o.faction });
      return new THREE.MeshBasicMaterial({
        map: strip.texture,
        color: emissiveColor(o.color, o.intensity, 'materials.runningLights'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: true,
        fog: false,
      });
    },

    glass: (o) => {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHex(o.tint, THREE.SRGBColorSpace),
        metalness: 1.0,
        roughness: 0.055,
        envMapIntensity: 2.0,
        flatShading: o.flatShading,
        side: THREE.FrontSide,
      });
      return m;
    },

    decal: (o) => {
      const sheet = textures.get('decals', { faction: o.faction, size: o.size });
      return new THREE.MeshStandardMaterial({
        map: sheet.texture,
        transparent: true,
        alphaTest: 0.04,
        roughness: 0.62,
        metalness: 0.06,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        depthWrite: false,
        envMapIntensity: 0.6,
      });
    },

    asteroid: (o) => {
      const maps = textures.get('rock', {
        size: o.size, tint: o.tint, oreAmount: o.ore, tileM: 40 * o.scale,
      });
      const m = new THREE.MeshStandardMaterial({
        map: maps.map,
        normalMap: maps.normalMap,
        aoMap: maps.ormMap,
        roughnessMap: maps.ormMap,
        metalnessMap: maps.ormMap,
        roughness: 1,
        metalness: 1,
        envMapIntensity: 0.55,
        flatShading: o.flatShading,
        vertexColors: o.vertexColors,
      });
      m.normalScale.set(1.4, 1.4);
      m.userData.maps = maps;
      return m;
    },

    /**
     * Pre-scorched hull. Built from uncached maps so the canvases belong to this
     * material and can be stamped again later without corrupting every other hull
     * of the same faction.
     */
    damaged: (o) => {
      const maps = textures.build('hull', {
        faction: o.faction, variant: 'hull',
        wear: Math.min(1, 0.55 + o.severity * 0.45),
        tier: o.tier, size: o.size, scale: o.scale, markings: true,
      });
      const m = standardFromMaps(maps, HULL_VARIANTS.hull, o);
      // Forked, never drawn from the root stream: material build order must not
      // leak into what the damage looks like.
      const dr = rng.fork(`damaged:${o.faction}:${o.severity}:${o.tier}`);
      attachDamage(m, maps, o.faction, dr);
      const blasts = 2 + Math.round(o.severity * 5);
      for (let i = 0; i < blasts; i++) {
        m.userData.applyScorch({
          u: dr.next(), v: dr.next(),
          radius: 0.06 + dr.next() * 0.13 * (0.4 + o.severity),
          severity: Math.min(1, o.severity * (0.6 + dr.next() * 0.7)),
        });
      }
      return m;
    },
  };

  /** Give a material its own writable maps plus a runtime scorch entry point. */
  function attachDamage(material, maps, faction, localRng) {
    const albedoCtx = ctx2d(maps.albedoCanvas);
    const ormCtx = ctx2d(maps.ormCanvas);
    material.userData.damageable = true;
    material.userData.applyScorch = ({ u = 0.5, v = 0.5, radius = 0.12, severity = 0.6, rotation = null } = {}) => {
      const sevKey = quantize(Math.min(1, Math.max(0.05, severity)), 0.25);
      const stamp = textures.get('scorchStamp', {
        faction, severity: sevKey, size: 256, variant: localRng.int(0, 3),
      });
      applyScorchStamp({
        albedoCtx, ormCtx, size: maps.size,
        u, v: 1 - v,   // callers think in UV space; canvas row 0 is v=1
        radius, stamp,
        rotation: rotation ?? localRng.next() * Math.PI * 2,
      });
      maps.map.needsUpdate = true;
      maps.ormMap.needsUpdate = true;
    };
    return material;
  }

  // -------------------------------------------------------------------------
  // public surface
  // -------------------------------------------------------------------------

  const registry = {
    /** Ids and constants other streams read. */
    keys: MATERIAL_KEYS.slice(),
    SCALE,
    textures,

    get poi() { return activePOI; },
    get palette() { return getPOIPalette(activePOI); },
    factionPalette: getFactionPalette,

    /**
     * The one call that matters.
     * @param {string} key   one of MATERIAL_KEYS
     * @param {Object} [opts]
     * @returns {THREE.Material} cached; identical args return the same instance
     */
    get(key, opts = {}) {
      const build = BUILDERS[key];
      if (!build) {
        throw new Error(`[materials] unknown key "${key}". Available: ${MATERIAL_KEYS.join(', ')}`);
      }
      const o = normalize(key, opts);
      const ck = cacheKey(key, o);
      const hit = materials.get(ck);
      if (hit) { hits++; return hit; }

      const m = build(o);
      m.name = ck;
      m.userData.__paletteKey = ck;
      m.userData.materialKey = key;
      m.userData.faction = o.faction ?? null;
      m.userData.opts = o;
      materials.set(ck, m);
      byKey[key] = (byKey[key] ?? 0) + 1;
      return m;
    },

    /** True if `key` is a real material key. Cheaper than a try/catch. */
    has(key) { return !!BUILDERS[key]; },

    /**
     * An UNCACHED hull material that owns its texture canvases, so battle damage
     * can be burnt into it without every other ship of that faction catching fire.
     * Use one per damageable hull section, not one per ship.
     */
    damageable(key = 'hull', opts = {}) {
      const spec = HULL_VARIANTS[key];
      if (!spec) throw new Error(`[materials] damageable() only accepts hull-family keys, got "${key}"`);
      const o = normalize(key, opts);
      const maps = hullMapsFor(o, spec.variant, false);
      const m = standardFromMaps(maps, spec, o);
      attachDamage(m, maps, o.faction, rng.fork(`dmg:${cacheKey(key, o)}:${uniqueCounter++}`));
      m.name = `${cacheKey(key, o)}#unique`;
      m.userData.__paletteKey = m.name;
      m.userData.materialKey = key;
      m.userData.faction = o.faction;
      byKey[key + ':unique'] = (byKey[key + ':unique'] ?? 0) + 1;
      return m;
    },

    /**
     * Burn a hit into a damageable material.
     * @param {THREE.Material} material  from registry.damageable() or get('damaged')
     * @param {{u:number,v:number,radius:number,severity:number}} hit
     */
    applyScorch(material, hit) {
      if (!material?.userData?.applyScorch) {
        console.warn('[materials] applyScorch on a material that is not damageable - use registry.damageable()');
        return false;
      }
      material.userData.applyScorch(hit);
      return true;
    },

    // --- environment ------------------------------------------------------
    /** PMREM environment for a POI. Null only if no renderer was supplied. */
    environment(poiId = activePOI) { return env.get(poiId); },

    /** Convenience: point a scene at this POI's environment and shadow floor. */
    applyEnvironment(scene, poiId = activePOI, intensity = 1) {
      const e = env.get(poiId);
      if (e) { scene.environment = e; scene.environmentIntensity = intensity; }
      return e;
    },

    setPOI(poiId) { getPOIPalette(poiId); activePOI = poiId; return activePOI; },

    // --- audit ------------------------------------------------------------
    /** @returns {{materials:number, textures:number, byKey:Object}} */
    audit() {
      const ts = textures.stats();
      return {
        materials: materials.size,
        textures: ts.textures,
        byKey: { ...byKey },
        cacheHits: hits,
        textureCache: { cached: ts.cached, builds: ts.builds, hits: ts.hits, byKind: ts.byKind },
        poi: activePOI,
        programsHint: materials.size,
      };
    },

    /** Dev mode: which materials in this scene graph dodged the registry? */
    auditScene(root) { return auditMaterials(root); },

    /** Dev mode: full palette + registry report. */
    paletteAudit(root = null) {
      const p = paletteAudit(root);
      p.registry = registry.audit();
      return p;
    },

    dispose() {
      for (const m of materials.values()) m.dispose();
      materials.clear();
      for (const k of Object.keys(byKey)) delete byKey[k];
      textures.dispose();
      env.dispose();
    },
  };

  return registry;
}
