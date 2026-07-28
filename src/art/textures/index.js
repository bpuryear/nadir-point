/**
 * TEXTURE FACTORY.
 *
 * One cache, keyed by (kind, seed, parameters). Two calls with the same arguments
 * return the same object, always - not an equal one, the same one. That matters
 * for more than memory: three batches by material identity, and a material's
 * identity is partly its textures, so a duplicated texture is a duplicated
 * material is an extra draw call.
 *
 * Determinism: the factory forks its RNG by the cache key, so the texture you get
 * for a given key is the same whether it was the first thing built or the
 * four-hundredth. Generation order never leaks into the output.
 *
 * Everything is generated at runtime. No image is ever fetched.
 */

import * as THREE from 'three';
import { RNG } from '../../core/rng.js';

import { panelLines, panelField, panelLayout, PANEL_DEFAULTS } from './panelLines.js';
import { greebleMap, detailNormal, GREEBLE_DEFAULTS } from './greeble.js';
import { wear, WEAR_DEFAULTS } from './wear.js';
import { scorch, makeScorchStamp, applyScorchStamp, SCORCH_DEFAULTS } from './scorch.js';
import { decals, textTexture, textCanvas, drawText, factionSigil, hazardStripes, chevrons, hullCode, DECAL_GRID } from './decals.js';
import {
  runningLights, glowSprite,
  RUNNING_LIGHT_SPACING_M, RUNNING_LIGHT_TILE_M, LIGHTS_PER_TILE,
} from './runningLights.js';
import { hullMaps, rockMaps } from './hullMaps.js';
import { macroField, MACRO_DEFAULTS, MACRO_DEFAULT_M, MACRO_REGION } from './macro.js';
import { fbmField, cellularField, streakField, fieldOps } from './noise.js';
import * as canvas2d from './canvas2d.js';

export {
  panelLines, panelField, panelLayout,
  greebleMap, detailNormal,
  wear, scorch, makeScorchStamp, applyScorchStamp,
  decals, textTexture, textCanvas, drawText, factionSigil, hazardStripes, chevrons, hullCode, DECAL_GRID,
  runningLights, glowSprite,
  hullMaps, rockMaps,
  macroField, MACRO_DEFAULT_M, MACRO_REGION,
  fbmField, cellularField, streakField, fieldOps,
  canvas2d,
  RUNNING_LIGHT_SPACING_M, RUNNING_LIGHT_TILE_M, LIGHTS_PER_TILE,
};

/**
 * Real-world scale constants that other streams must honour. These are the numbers
 * that make a 1400 m hull read as 1400 m.
 */
export const SCALE = {
  /** UV units are metres. One unit of U or V is one metre of hull. */
  uvUnit: 'metre',
  /** Running lights, everywhere in the game, forever. */
  runningLightSpacingM: RUNNING_LIGHT_SPACING_M,
  runningLightTileM: RUNNING_LIGHT_TILE_M,
  /** Fallback plate tile if a faction palette does not state one. */
  defaultTileM: 16,
};

const GENERATORS = {
  panelLines: { fn: panelLines, defaults: PANEL_DEFAULTS },
  greeble: { fn: greebleMap, defaults: GREEBLE_DEFAULTS },
  detailNormal: { fn: (o) => ({ texture: detailNormal(o) }), defaults: GREEBLE_DEFAULTS },
  wear: { fn: wear, defaults: WEAR_DEFAULTS },
  scorch: { fn: scorch, defaults: SCORCH_DEFAULTS },
  scorchStamp: { fn: (o) => makeScorchStamp(o.rng, o), defaults: SCORCH_DEFAULTS },
  decals: { fn: decals, defaults: { faction: 'player', size: 512 } },
  runningLights: { fn: runningLights, defaults: { faction: 'player' } },
  glow: { fn: glowSprite, defaults: { faction: 'player', size: 128 } },
  hull: { fn: hullMaps, defaults: {} },
  macro: { fn: macroField, defaults: MACRO_DEFAULTS },
  rock: { fn: rockMaps, defaults: {} },
};

export const TEXTURE_KINDS = Object.keys(GENERATORS);

/** Deterministic, stable, human-readable cache key. Objects and functions dropped. */
export function textureKey(kind, opts = {}) {
  const parts = [];
  for (const k of Object.keys(opts).sort()) {
    const v = opts[k];
    if (v === undefined || v === null) continue;
    const t = typeof v;
    if (t === 'function' || t === 'object' || t === 'symbol') continue;
    parts.push(`${k}=${t === 'number' ? round4(v) : String(v)}`);
  }
  return `${kind}(${parts.join(',')})`;
}

const round4 = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(4));

export class TextureFactory {
  /**
   * @param {Object} p
   * @param {import('../../core/rng.js').RNG} [p.rng]
   * @param {THREE.WebGLRenderer} [p.renderer]  used only for max anisotropy
   */
  constructor({ rng = new RNG('textures'), renderer = null, anisotropy = null } = {}) {
    this.rng = rng;
    this.renderer = renderer;
    this.anisotropy = anisotropy ?? Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() ?? 8);
    /** @type {Map<string, any>} */
    this.cache = new Map();
    /** @type {Set<THREE.Texture>} */
    this.textures = new Set();
    this.byKind = Object.create(null);
    this.builds = 0;
    this.hits = 0;
  }

  /** Cached build. Identical (kind, opts) always returns the identical object. */
  get(kind, opts = {}) {
    const gen = GENERATORS[kind];
    if (!gen) throw new Error(`[textures] unknown generator "${kind}" (have: ${TEXTURE_KINDS.join(', ')})`);
    const key = textureKey(kind, { ...gen.defaults, ...opts });
    const hit = this.cache.get(key);
    if (hit) { this.hits++; return hit; }

    const result = gen.fn({ ...gen.defaults, ...opts, rng: this.rng.fork(key) });
    this._register(kind, key, result);
    this.cache.set(key, result);
    this.builds++;
    this.byKind[kind] = (this.byKind[kind] ?? 0) + 1;
    return result;
  }

  /** Uncached build - for per-entity maps that will be written to at runtime. */
  build(kind, opts = {}) {
    const gen = GENERATORS[kind];
    if (!gen) throw new Error(`[textures] unknown generator "${kind}"`);
    const key = textureKey(kind, { ...gen.defaults, ...opts });
    const result = gen.fn({ ...gen.defaults, ...opts, rng: opts.rng ?? this.rng.fork(key) });
    this._register(kind, key, result);
    this.builds++;
    this.byKind[kind] = (this.byKind[kind] ?? 0) + 1;
    return result;
  }

  _register(kind, key, result) {
    const visit = (v) => {
      if (!v) return;
      if (v.isTexture) {
        v.anisotropy = Math.min(this.anisotropy, 16);
        if (!v.name) v.name = key;
        this.textures.add(v);
      } else if (typeof v === 'object' && !ArrayBuffer.isView(v)) {
        for (const k of Object.keys(v)) if (k !== 'rng') visit(v[k]);
      }
    };
    visit(result);
  }

  /**
   * Resident texture bytes, counting the mip chain.
   *
   * Defect D8 is "texture memory is unmeasured and likely too high", and the first
   * half of that is fixable in twenty lines. Every generator here produces 8-bit
   * RGBA, so the size is width x height x 4, and `generateMipmaps` is on for all of
   * them, which is the familiar 4/3 series. This is an upper bound on the GPU-side
   * cost: a driver may store an sRGB8 albedo more cheaply, and none of them will
   * store it more expensively.
   */
  bytes() {
    let total = 0;
    const byKind = Object.create(null);
    for (const t of this.textures) {
      const img = t.image;
      const w = img?.width ?? 0;
      const h = img?.height ?? 0;
      if (!w || !h) continue;
      const b = w * h * 4 * (t.generateMipmaps ? 4 / 3 : 1);
      total += b;
      const kind = (t.name || 'unknown').split(':')[0];
      byKind[kind] = (byKind[kind] ?? 0) + b;
    }
    for (const k of Object.keys(byKind)) byKind[k] = +(byKind[k] / 1048576).toFixed(2);
    return { megabytes: +(total / 1048576).toFixed(2), byKindMB: byKind };
  }

  stats() {
    return {
      cached: this.cache.size,
      textures: this.textures.size,
      builds: this.builds,
      hits: this.hits,
      byKind: { ...this.byKind },
      memory: this.bytes(),
      keys: Array.from(this.cache.keys()),
    };
  }

  dispose() {
    for (const t of this.textures) t.dispose();
    this.textures.clear();
    this.cache.clear();
    this.byKind = Object.create(null);
  }
}

/** Convenience for one-off tools and probes that do not want to hold a factory. */
export function createTextureFactory(opts) { return new TextureFactory(opts); }
