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
import { applyHullMacro, HULL_MACRO_DEFAULTS } from './hullShader.js';

export { SCALE, RUNNING_LIGHT_SPACING_M, RUNNING_LIGHT_TILE_M };

/** Every key the registry answers to. */
export const MATERIAL_KEYS = [
  'hull', 'hullDark', 'plating', 'greeble', 'trim',
  'emissive', 'engineGlow', 'glass', 'damaged',
  'asteroid', 'debris', 'derelictHull',
  // beyond the required set, because somebody has to own them:
  'runningLights', 'decal',
  /**
   * A HEAT-REJECTION PANEL IS NOT ARMOUR AND MUST NOT SHARE ITS MAP.
   *
   * Round-two review, BLOCKER: "It is also on the radiator fins, which are
   * heat-rejection panels and should never carry an armour-plate map." This key
   * routes to `textures/panelLines.js#radiatorField` — parallel coolant channels and
   * transverse manifolds, no strakes, no butts, no fasteners — over the darkest
   * albedo in the faction palette, because a radiator that reflects is a radiator
   * that is not working.
   */
  'radiator',
];

const quantize = (v, step) => Math.round(v / step) * step;

/**
 * Hull-ish keys share one normalisation and one build path.
 *
 * `normalScale` and `envMapIntensity` are both down across the board from where
 * they were authored, and for the same reason: between them they were overriding
 * the key light. A normal scale of 1.0 on a tile whose relief is a plate seam turns
 * a flat armour belt into an embossed pattern that shades independently of the hull
 * face it sits on, and an envMapIntensity above 1 on a surface that is 20-40% metal
 * means a good fraction of the response comes from a nearly uniform environment
 * rather than from a direction. Both flatten the terminator, which is the one thing
 * this project cannot afford to lose.
 */
const HULL_VARIANTS = {
  // `hull` is the CALM ARMOUR tier (textures/hullMaps.js#variantSpec): a 57 m plate
  // tile with almost no greeble. Its relief is dropped to match - a big armour face
  // has plate steps of a few centimetres over tens of metres, and carrying the old
  // 0.62 across a tile 2.2x larger turned an armour belt into corrugation.
  hull: { variant: 'hull', normalScale: 0.40, envMapIntensity: 0.70, macro: 1.0 },
  hullDark: { variant: 'hullDark', normalScale: 0.54, envMapIntensity: 0.55, macro: 0.9 },
  plating: { variant: 'plating', normalScale: 0.62, envMapIntensity: 0.75, macro: 0.85 },
  // Greeble is genuinely bare hardware, so it keeps a strong relief and a real
  // environment response. It is the frequency contrast against the calm hull, and it
  // takes only a whisper of macro - machinery is not where soot and stencils live.
  greeble: { variant: 'greeble', normalScale: 1.0, envMapIntensity: 0.85, macro: 0.35 },
  trim: { variant: 'trim', normalScale: 0.45, envMapIntensity: 0.60, macro: 0.5 },
  // The fin's own relief IS the surface, so it keeps a strong normal. It takes the
  // macro layer's drift and soot (a radiator gets filthy) but no marks worth the name.
  radiator: { variant: 'radiator', normalScale: 0.9, envMapIntensity: 0.35, macro: 0.55 },
  derelictHull: { variant: 'derelictHull', normalScale: 0.80, envMapIntensity: 0.60, macro: 0.9 },
  // Debris is instanced, so every fragment shares one object space and would carry
  // one identical macro layer. It gets none; `instanceColor` is its variation.
  debris: { variant: 'debris', normalScale: 0.75, envMapIntensity: 0.70, macro: 0 },
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
      // A tiling texture on a 1400 m hull repeats ~80 times and the eye finds the
      // repeat. `seed` buys a genuinely different plate layout at the same faction,
      // tier and wear, so a big hull can be built from 2-3 tiles that read as one
      // material. Each distinct seed is a real extra bake - use 2 or 3, not 20.
      o.seed = Math.max(0, Math.round(o.seed ?? 0));
      // Part of the cache key: a hull with the macro layer and one without are two
      // different materials and must not share an instance.
      o.macro = o.macro !== false;
      if (key === 'derelictHull') o.faction = 'derelict';
    }
    if (key === 'damaged') {
      o.seed = Math.max(0, Math.round(o.seed ?? 0));
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
      size: o.size, scale: o.scale, seed: o.seed ?? 0,
      /**
       * TILING STENCILS ARE OFF, AND THIS IS THE POINT OF THE MACRO LAYER.
       *
       * `hullMaps.stampMarkings` puts a hull code and a hazard patch into the TILING
       * map at alpha 0.34, with a comment saying it can only ever be faint because
       * whatever it draws repeats every `tileM` metres. Raising the calm tile to 57 m
       * made that stencil 2.2x larger and it stopped being faint: the first capture
       * after the frequency change had the same "XXX" code and the same hazard bar
       * printed a dozen times down the starboard flank.
       *
       * The macro layer draws those marks ONCE, in object space, at a size stated in
       * metres. It is a strictly better version of the same idea, so the tiling one
       * is switched off rather than left to fight it. Pass `tilingMarks: true` to get
       * the old behaviour for a surface that has no macro layer.
       */
      markings: o.tilingMarks === true,
    };
    return cached ? textures.get('hull', args) : textures.build('hull', args);
  }

  /**
   * THE NON-TILING SECOND FREQUENCY.
   *
   * Everything above this line tiles. `macroField` does not: it is addressed in
   * object space and sampled once from stem to stern, which is the only way to get
   * a value drift that defeats repeat-detection, soot that knows which way is down,
   * and marks that are not stamped fifty times along a cruiser. See
   * textures/macro.js and hullShader.js.
   *
   * One atlas per faction, shared by every material of that faction, so this adds
   * one texture and zero draw calls. Materials that opt out (`macro: 0`, instanced
   * uses) never touch it and never pay for the fetch.
   */
  function attachMacro(material, spec, o, maps) {
    if (!spec.macro || o.instanced || o.macro === false) return material;
    const pal = getFactionPalette(o.faction ?? 'player');
    // Deliberately NOT keyed by `o.seed`. `seed` varies the tiling PLATE LAYOUT per
    // surface - the cruiser's plating carries seed 1 so its plates differ from its
    // armour - but the macro layer is the ship's own soot and stencilling, and the
    // soot on the armour has to be in the same place as the soot on the plating next
    // to it. One atlas per faction, shared across all three frequency tiers.
    const { texture } = textures.get('macro', {
      faction: o.faction ?? 'player',
      seed: o.macroSeed ?? 0,
      marks: o.marks === false ? 0 : 1,
    });
    applyHullMacro(material, {
      macroTexture: texture,
      tileM: maps.tileM,
      /**
       * TWO mark colours, because there are two mark families and they mean
       * different things (see hullShader.js#nadirMark).
       *
       * `hazardA` is the ONLY saturated albedo on the hull: ship-language.md §4 caps
       * saturated accent at 3.5% of hull area and allows it in four places, and every
       * accent mark macro.js draws is either a stripe following a real geometric edge
       * or a hazard zone on something that moves, opens or gets hot.
       *
       * `ink` is a near-neutral and carries the functional markings — hull numbers,
       * the sigil, the repair-patch outline. Those used to be drawn in hazardA too,
       * which is how the round-one frames ended up with amber lettering floating
       * mid-face: the wrong colour AND the wrong place. Both are fixed, separately.
       */
      inkColor: pal.marking.ink,
      hazardColor: pal.marking.hazardA,
      sootColor: pal.burn,
      drift: HULL_MACRO_DEFAULTS.drift * spec.macro,
      roughDrift: HULL_MACRO_DEFAULTS.roughDrift * spec.macro,
      soot: HULL_MACRO_DEFAULTS.soot * spec.macro,
      ink: HULL_MACRO_DEFAULTS.ink * spec.macro,
    });
    return material;
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
    return attachMacro(m, spec, o, maps);
  }

  const BUILDERS = {
    hull: (o) => standardFromMaps(hullMapsFor(o, 'hull'), HULL_VARIANTS.hull, o),
    hullDark: (o) => standardFromMaps(hullMapsFor(o, 'hullDark'), HULL_VARIANTS.hullDark, o),
    plating: (o) => standardFromMaps(hullMapsFor(o, 'plating'), HULL_VARIANTS.plating, o),
    greeble: (o) => standardFromMaps(hullMapsFor(o, 'greeble'), HULL_VARIANTS.greeble, o),
    trim: (o) => standardFromMaps(hullMapsFor(o, 'trim'), HULL_VARIANTS.trim, o),
    derelictHull: (o) => standardFromMaps(hullMapsFor(o, 'derelictHull'), HULL_VARIANTS.derelictHull, o),
    radiator: (o) => standardFromMaps(hullMapsFor(o, 'radiator'), HULL_VARIANTS.radiator, o),

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

    /**
     * A lit panel or, when instanced, a lamp.
     *
     * The instanced variant gets a soft radial falloff and additive blending,
     * because every instanced use of this key in the game is a camera-facing quad
     * standing in for a point of light - running lights along a spine, station
     * beacons. Rendered as a bare untextured quad it is a hard-edged square that
     * aliases badly at distance and reads as a machine-made strip rather than as a
     * ship's lighting; running lights are the game's only real scale cue and they
     * have to survive being looked at. Non-instanced uses are flat emissive FACES
     * and must stay opaque, so they are left alone.
     */
    emissive: (o) => {
      if (o.instanced) {
        const glow = textures.get('glow', { faction: o.faction, size: 128, falloff: 2.6 });
        return new THREE.MeshBasicMaterial({
          map: glow.texture,
          color: emissiveColor(o.color, o.intensity, 'materials.emissive'),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
          fog: false,
          vertexColors: o.vertexColors,
        });
      }
      return new THREE.MeshBasicMaterial({
        color: emissiveColor(o.color, o.intensity, 'materials.emissive'),
        toneMapped: true,
        fog: false,
        vertexColors: o.vertexColors,
      });
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
        // Canopy glass is nothing but reflection. With a dark environment the only
        // things it shows are the sun and whatever is nearby, so the env has to be
        // pushed or the canopy is a black hole in the hull - but not so far that a
        // window becomes the most saturated thing on the ship. At 3.4 against a blue
        // POI environment every canopy on the cruiser rendered as primary cobalt.
        envMapIntensity: 2.2,
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
        // Tiling stencils off, same as hullMapsFor: this builder bypasses that
        // helper, and leaving it at `true` here would have left exactly one material
        // key still printing a 57 m hull code down the length of every damaged wreck.
        tier: o.tier, size: o.size, scale: o.scale, seed: o.seed ?? 0, markings: false,
      });
      const m = standardFromMaps(maps, HULL_VARIANTS.hull, o);
      // Forked, never drawn from the root stream: material build order must not
      // leak into what the damage looks like.
      const dr = rng.fork(`damaged:${o.faction}:${o.severity}:${o.tier}`);
      attachDamage(m, maps, o.faction, dr);
      // Few, and small. This is a TILING texture: every blast baked in here repeats
      // across the whole hull. For real per-hit damage use registry.damageable(),
      // which owns its canvases and takes hits where they actually landed.
      const blasts = 1 + Math.round(o.severity * 3);
      for (let i = 0; i < blasts; i++) {
        m.userData.applyScorch({
          u: dr.next(), v: dr.next(),
          radius: 0.11 + dr.next() * 0.22 * (0.4 + o.severity),
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
        /** Upper-bound resident texture bytes, mips included. Defect D8. */
        textureMemoryMB: ts.memory.megabytes,
        textureMemoryByKindMB: ts.memory.byKindMB,
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
