/**
 * LOCKED PALETTES.
 *
 * Every colour in Nadir Point comes from this file. Not "mostly" - every one. The
 * reason is not tidiness: the game's whole visual proposition is that a hull built
 * from mismatched salvage still reads as one object. That only survives if the
 * number of hues in frame is small and deliberate. One stream picking a nice blue
 * by eye is how a game ends up looking like a parts bin.
 *
 * Three faction identities that must be separable at a glance by hue, by material
 * behaviour and by emissive colour - all three, not just hue, because half the time
 * the ship is a silhouette against a gas giant:
 *
 *   coalition  heavy industrial. Warm grey-green steel, orange-amber emissives,
 *              riveted and utilitarian, wide roughness variance so it never reads
 *              as one clean surface.
 *   concord    sleek. Pale blue-white ceramic over metal, cyan-white emissives,
 *              larger cleaner panels, low roughness, tight variance.
 *   derelict   ancient. Desaturated bronze and oxide, sickly green-gold emissives,
 *              pitted and eroded, panel layout that does not obey human right
 *              angles.
 *   player     neutral gunmetal. Deliberately hue-free so bolted-on salvage from
 *              any faction sits on it without a fight.
 *
 * ENFORCEMENT
 *   isPaletteColor(hex)      - is this exact colour legal?
 *   assertPaletteColor(...)  - throw (strict) or record (dev) when it is not
 *   paletteAudit()           - everything illegal that has been seen this session
 *   auditMaterials(root)     - materials in a scene graph not stamped by the
 *                              material registry, i.e. built with `new THREE.…`
 *
 * Derived colours are legal, but only through `shade`/`mix`/`saturate` here, which
 * record their provenance. That way the audit can say "this near-black came from
 * derelict.baseDark darkened 0.4" rather than shrugging.
 */

import * as THREE from 'three';
import { FACTIONS } from '../core/contracts.js';

export const PALETTE_VERSION = 'nadir-point/palette/1';

// ---------------------------------------------------------------------------
// Faction palettes
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SurfaceSpec
 * @property {number} metalness   base metalness, 0..1
 * @property {number} roughness   base roughness, 0..1
 * @property {number} variance    how far roughness swings panel-to-panel, 0..1
 */

export const FACTION_PALETTES = {
  coalition: {
    id: 'coalition',
    name: 'Coalition',
    blurb: 'Heavy industrial. Built to be repaired in the field by someone angry.',

    // --- albedo ---
    base: 0x767a68,        // warm grey-green steel
    baseAlt: 0x646855,     // second plate tone, for panel-to-panel variance
    baseDark: 0x2e3129,    // recessed structure
    plating: 0x878a76,     // secondary armour, slightly brighter
    greeble: 0x4c5049,     // small mechanical detail
    trim: 0xc4671b,        // the identity carrier: safety orange
    glass: 0x0a0e11,
    burn: 0x171512,        // carbon scoring
    bare: 0xa9a396,        // bare metal revealed by edge wear

    // --- emissive ---
    emissive: 0xff9126,    // amber running lights and panel glow
    emissiveHot: 0xffc978,  // core of an emissive, hotter than the halo
    engine: 0xff6a12,      // thruster plume
    warn: 0xff3a18,

    // --- surface behaviour ---
    surface: {
      hull: { metalness: 0.80, roughness: 0.54, variance: 0.34 },
      hullDark: { metalness: 0.74, roughness: 0.70, variance: 0.24 },
      plating: { metalness: 0.86, roughness: 0.46, variance: 0.30 },
      greeble: { metalness: 0.94, roughness: 0.36, variance: 0.20 },
      trim: { metalness: 0.30, roughness: 0.46, variance: 0.14 },
    },

    // --- plating layout ---
    panel: {
      tileM: 14,           // metres of hull one texture tile covers
      minPanel: 0.155,     // smallest panel as a fraction of the tile
      gap: 0.0105,         // seam width, fraction of the tile
      bevel: 0.012,
      recess: 0.20,        // chance a panel is set into the hull
      raise: 0.16,         // chance a panel stands proud
      rivets: 0.9,         // 0..1 how riveted the seams are
      skew: 0.0,           // non-orthogonal panel bias; humans build square
      splits: 4,
    },

    // --- weathering ---
    wear: { edge: 0.80, streak: 0.72, grime: 0.58, pit: 0.18, oxide: 0x3a2c17 },

    // --- markings ---
    marking: { ink: 0xd9d3c3, inkDark: 0x161513, hazardA: 0xd6981c, hazardB: 0x191712 },
  },

  concord: {
    id: 'concord',
    name: 'Concord',
    blurb: 'Sleek. Ceramic over metal, built by people who never expect a boarding action.',

    base: 0xc6cfd6,
    baseAlt: 0xb0bcc6,
    baseDark: 0x333d47,
    plating: 0xd7dee3,
    greeble: 0x5c6773,
    trim: 0x2f7fa8,
    glass: 0x080d14,
    burn: 0x14161a,
    bare: 0x9aa6b0,

    emissive: 0x7fe4ff,
    emissiveHot: 0xd6f6ff,
    engine: 0x49c6ff,
    warn: 0xff5a4a,

    surface: {
      hull: { metalness: 0.34, roughness: 0.30, variance: 0.14 },
      hullDark: { metalness: 0.62, roughness: 0.44, variance: 0.14 },
      plating: { metalness: 0.26, roughness: 0.22, variance: 0.11 },
      greeble: { metalness: 0.92, roughness: 0.28, variance: 0.15 },
      trim: { metalness: 0.44, roughness: 0.26, variance: 0.09 },
    },

    panel: {
      tileM: 18,
      minPanel: 0.26,      // bigger, cleaner plates
      gap: 0.0062,
      bevel: 0.008,
      recess: 0.10,
      raise: 0.07,
      rivets: 0.0,         // no rivets. Concord does not admit to fasteners.
      skew: 0.0,
      splits: 3,
    },

    wear: { edge: 0.30, streak: 0.26, grime: 0.20, pit: 0.05, oxide: 0x2b3038 },

    marking: { ink: 0x223442, inkDark: 0x0d1319, hazardA: 0x39a0c8, hazardB: 0x101820 },
  },

  derelict: {
    id: 'derelict',
    name: 'Derelict',
    blurb: 'Ancient. Nothing about the panel layout was decided by a person.',

    base: 0x6d5c3c,
    baseAlt: 0x574a31,
    baseDark: 0x241f16,
    plating: 0x7d6b45,
    greeble: 0x3c3627,
    trim: 0x8f9a35,
    glass: 0x0b0f09,
    burn: 0x120f0b,
    bare: 0x8e8262,

    emissive: 0x9fbe33,    // sickly green-gold
    emissiveHot: 0xd8ea7a,
    engine: 0x86b02a,
    warn: 0xc4d24a,

    surface: {
      hull: { metalness: 0.72, roughness: 0.74, variance: 0.40 },
      hullDark: { metalness: 0.60, roughness: 0.86, variance: 0.30 },
      plating: { metalness: 0.78, roughness: 0.66, variance: 0.36 },
      greeble: { metalness: 0.84, roughness: 0.58, variance: 0.28 },
      trim: { metalness: 0.56, roughness: 0.60, variance: 0.22 },
    },

    panel: {
      tileM: 22,
      minPanel: 0.13,
      gap: 0.014,
      bevel: 0.020,
      recess: 0.30,
      raise: 0.22,
      rivets: 0.0,
      skew: 0.42,          // splits land off-centre and off-axis. Not human.
      splits: 5,
    },

    wear: { edge: 0.62, streak: 0.44, grime: 0.86, pit: 0.85, oxide: 0x2f2a12 },

    marking: { ink: 0x9aa14e, inkDark: 0x100e08, hazardA: 0x7f8a2c, hazardB: 0x14140c },
  },

  player: {
    id: 'player',
    name: 'Nadir',
    blurb: 'Neutral gunmetal. Whatever you bolt on has to look like it belongs.',

    base: 0x5f646a,
    baseAlt: 0x53585e,
    baseDark: 0x26292d,
    plating: 0x6d7278,
    greeble: 0x44484d,
    trim: 0xa8a294,        // bone, not a hue. Reads as "unfactioned".
    glass: 0x090c10,
    burn: 0x151517,
    bare: 0x9ea3a8,

    emissive: 0xd9e6ee,    // cool neutral white
    emissiveHot: 0xf4fbff,
    engine: 0xa9d4ee,
    warn: 0xff4a2a,

    surface: {
      hull: { metalness: 0.82, roughness: 0.48, variance: 0.26 },
      hullDark: { metalness: 0.76, roughness: 0.62, variance: 0.20 },
      plating: { metalness: 0.88, roughness: 0.40, variance: 0.24 },
      greeble: { metalness: 0.94, roughness: 0.32, variance: 0.18 },
      trim: { metalness: 0.40, roughness: 0.42, variance: 0.12 },
    },

    panel: {
      tileM: 16,
      minPanel: 0.185,
      gap: 0.0085,
      bevel: 0.010,
      recess: 0.16,
      raise: 0.12,
      rivets: 0.45,
      skew: 0.0,
      splits: 4,
    },

    wear: { edge: 0.55, streak: 0.48, grime: 0.40, pit: 0.12, oxide: 0x2b2a24 },

    marking: { ink: 0xc9ccd0, inkDark: 0x131417, hazardA: 0xbfa53a, hazardB: 0x16171a },
  },
};

// ---------------------------------------------------------------------------
// POI palettes
// ---------------------------------------------------------------------------

/**
 * One per point of interest. This is the whole lighting identity of a location:
 * a key, a bounce, a shadow floor, the tint the distance fades towards, and one
 * accent that everything artificial in the location is allowed to glow.
 *
 * `ibl` drives the procedurally generated environment map. `grade` is the post
 * chain's per-POI override, consumed by the lighting stream.
 */
export const POI_PALETTES = {
  'giant-orbit': {
    id: 'giant-orbit',
    name: 'Gas Giant Orbit',
    key: { color: 0xfff0d8, intensity: 3.4, angularRadius: 0.009 },
    fill: { color: 0x3f63b4, intensity: 0.55 },     // planetshine, enormous and blue
    bounce: { color: 0x6f8ed8, intensity: 0.30 },
    shadow: 0x050912,
    fog: { color: 0x16223c, density: 0.000012 },
    accent: 0x8fb4ff,
    ibl: { zenith: 0x0a1024, horizon: 0x24406e, ground: 0x070b16, sun: 0xfff3e0, sunSize: 0.055, intensity: 0.85 },
    grade: { exposure: 1.02, bloom: 0.62, godrays: 0.34, vignette: 0.42 },
  },

  belt: {
    id: 'belt',
    name: 'The Belt',
    key: { color: 0xffe2b6, intensity: 2.7, angularRadius: 0.014 },
    fill: { color: 0x6b5a44, intensity: 0.42 },     // dust bouncing off a million rocks
    bounce: { color: 0x8a7350, intensity: 0.26 },
    shadow: 0x0a0806,
    fog: { color: 0x2a2018, density: 0.000042 },
    accent: 0xd89a4a,
    ibl: { zenith: 0x0b0a08, horizon: 0x2e2418, ground: 0x100c08, sun: 0xffe6bc, sunSize: 0.07, intensity: 0.7 },
    grade: { exposure: 1.0, bloom: 0.5, godrays: 0.55, vignette: 0.46 },
  },

  graveyard: {
    id: 'graveyard',
    name: 'The Graveyard',
    key: { color: 0xb6c6da, intensity: 1.9, angularRadius: 0.006 },
    fill: { color: 0x1b2a3a, intensity: 0.32 },
    bounce: { color: 0x2b3c4e, intensity: 0.18 },
    shadow: 0x02040a,
    fog: { color: 0x0e1620, density: 0.000030 },
    accent: 0x8fb04a,                                // derelict light, leaking
    ibl: { zenith: 0x03060c, horizon: 0x14202e, ground: 0x04070c, sun: 0xc2d2e4, sunSize: 0.035, intensity: 0.5 },
    grade: { exposure: 0.96, bloom: 0.7, godrays: 0.24, vignette: 0.54 },
  },

  yard: {
    id: 'yard',
    name: 'Fitting Yard',
    key: { color: 0xffd9a0, intensity: 2.2, angularRadius: 0.02 },   // work lights, not a star
    fill: { color: 0x2b3442, intensity: 0.50 },
    bounce: { color: 0x4a5468, intensity: 0.30 },
    shadow: 0x05070c,
    fog: { color: 0x1a212c, density: 0.000022 },
    accent: 0xffa93c,
    ibl: { zenith: 0x060a12, horizon: 0x232c3a, ground: 0x0a0d14, sun: 0xffdcae, sunSize: 0.10, intensity: 0.8 },
    grade: { exposure: 1.05, bloom: 0.58, godrays: 0.30, vignette: 0.38 },
  },

  'near-star': {
    id: 'near-star',
    name: 'Near Star',
    key: { color: 0xfff6ea, intensity: 6.2, angularRadius: 0.05 },   // brutal
    fill: { color: 0x7a4226, intensity: 0.40 },
    bounce: { color: 0xa85c2e, intensity: 0.24 },
    shadow: 0x0c0603,
    fog: { color: 0x3c1e0e, density: 0.000055 },
    accent: 0xff7a2a,
    ibl: { zenith: 0x120804, horizon: 0x5a2c12, ground: 0x1a0c05, sun: 0xfffaf0, sunSize: 0.16, intensity: 1.4 },
    grade: { exposure: 0.88, bloom: 0.9, godrays: 0.72, vignette: 0.52 },
  },

  station: {
    id: 'station',
    name: 'Station Approach',
    key: { color: 0xdce8f4, intensity: 2.4, angularRadius: 0.008 },
    fill: { color: 0x27374e, intensity: 0.46 },
    bounce: { color: 0x3c5170, intensity: 0.26 },
    shadow: 0x04070e,
    fog: { color: 0x141e2c, density: 0.000018 },
    accent: 0x59c8ff,
    ibl: { zenith: 0x050912, horizon: 0x1c2c42, ground: 0x070b12, sun: 0xe6f0fa, sunSize: 0.04, intensity: 0.72 },
    grade: { exposure: 1.0, bloom: 0.6, godrays: 0.22, vignette: 0.40 },
  },
};

export const POI_IDS = Object.keys(POI_PALETTES);
export const DEFAULT_POI = 'giant-orbit';

/**
 * Colours that belong to no faction and no location: pure structural values, the
 * UI's hostile red, the salvage cyan. Kept short on purpose.
 */
export const NEUTRAL = {
  void: 0x000000,
  spaceBlack: 0x02030a,
  hostile: 0xff4433,
  friendly: 0x54e08a,
  salvage: 0x39d7d0,
  select: 0xf2e9c8,
  shieldHit: 0x76c6ff,
  scorchCore: 0x0d0b09,
  scorchRim: 0x3a2a1c,
  ice: 0xcfe4f2,
  rock: 0x6a6459,
  rockDark: 0x2c2a26,
  rockOre: 0x8a6a3c,
};

// ---------------------------------------------------------------------------
// Indexing + validation
// ---------------------------------------------------------------------------

/**
 * Leaf keys that hold a colour. Explicit rather than inferred: a heuristic that
 * guesses "integers over 0x100000 are probably colours" is the kind of thing that
 * silently stops enforcing anything the day someone adds `hp: 2400000`.
 */
const COLOR_KEYS = new Set([
  'base', 'baseAlt', 'baseDark', 'plating', 'greeble', 'trim', 'glass', 'burn', 'bare',
  'emissive', 'emissiveHot', 'engine', 'warn', 'oxide',
  'ink', 'inkDark', 'hazardA', 'hazardB',
  'color', 'shadow', 'accent',
  'zenith', 'horizon', 'ground', 'sun',
  'void', 'spaceBlack', 'hostile', 'friendly', 'salvage', 'select', 'shieldHit',
  'scorchCore', 'scorchRim', 'ice', 'rock', 'rockDark', 'rockOre',
]);

/** hex -> dotted provenance path, e.g. 12345 -> 'coalition.trim'. */
const _index = new Map();
/** hex -> provenance for colours produced by shade/mix/saturate. */
const _derived = new Map();
/** Illegal colours seen this session: [{hex, where}]. */
const _foreign = [];
let _strict = false;

function indexTree(obj, path, out) {
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object') {
      indexTree(v, p, out);
    } else if (COLOR_KEYS.has(k)) {
      if (!Number.isInteger(v) || v < 0 || v > 0xffffff) {
        throw new Error(`[palette] "${p}" is declared a colour key but holds ${JSON.stringify(v)}`);
      }
      if (!out.has(v)) out.set(v, p);
    } else if (Number.isInteger(v) && v >= 0x100000 && v <= 0xffffff) {
      // Almost certainly a colour under a key nobody added to COLOR_KEYS.
      throw new Error(`[palette] "${p}" looks like a colour (0x${v.toString(16)}) but "${k}" is not in COLOR_KEYS`);
    }
  }
}

indexTree(FACTION_PALETTES, '', _index);
indexTree(POI_PALETTES, '', _index);
indexTree(NEUTRAL, 'neutral', _index);

/** Every faction in the shared contract must actually have a palette. */
for (const f of FACTIONS) {
  if (!FACTION_PALETTES[f]) throw new Error(`[palette] contracts declares faction "${f}" with no palette`);
}

export const PALETTE_COLOR_COUNT = _index.size;

export function getFactionPalette(id) {
  const p = FACTION_PALETTES[id];
  if (!p) throw new Error(`[palette] unknown faction "${id}" (have: ${Object.keys(FACTION_PALETTES).join(', ')})`);
  return p;
}

export function getPOIPalette(id = DEFAULT_POI) {
  const p = POI_PALETTES[id];
  if (!p) throw new Error(`[palette] unknown POI palette "${id}" (have: ${POI_IDS.join(', ')})`);
  return p;
}

/** Look a colour up by dotted path: paletteColor('coalition.trim'). Throws if absent. */
export function paletteColor(path) {
  const roots = { ...FACTION_PALETTES, ...POI_PALETTES, neutral: NEUTRAL };
  let node = roots;
  for (const part of path.split('.')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`[palette] no colour at path "${path}"`);
  }
  if (!Number.isInteger(node)) throw new Error(`[palette] path "${path}" is not a colour`);
  return node;
}

export function isPaletteColor(hex) {
  const v = hex | 0;
  return _index.has(v) || _derived.has(v);
}

export function paletteProvenance(hex) {
  const v = hex | 0;
  return _index.get(v) ?? _derived.get(v) ?? null;
}

/**
 * Dev-mode gate. In strict mode an off-palette colour throws where it was used,
 * which is the only time that information is cheap to act on. Otherwise it is
 * recorded for `paletteAudit()`.
 */
export function assertPaletteColor(hex, where = '<unknown>') {
  if (isPaletteColor(hex)) return hex;
  const rec = { hex, hexString: '#' + (hex >>> 0).toString(16).padStart(6, '0'), where };
  _foreign.push(rec);
  if (_strict) {
    throw new Error(`[palette] off-palette colour ${rec.hexString} used at ${where}`);
  }
  return hex;
}

export function setStrict(on) { _strict = !!on; }
export function isStrict() { return _strict; }
export function resetAudit() { _foreign.length = 0; }

// ---------------------------------------------------------------------------
// Derivation - the only legal way to make a colour that is not literally listed
// ---------------------------------------------------------------------------

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function register(hex, provenance) {
  const v = hex | 0;
  if (!_index.has(v) && !_derived.has(v)) _derived.set(v, provenance);
  return v;
}

/** Multiply value. shade(hex, 0.4) is 40% as bright, shade(hex, 1.6) is brighter. */
export function shade(hex, factor) {
  _c1.setHex(hex, THREE.SRGBColorSpace);
  _c1.multiplyScalar(factor);
  _c1.r = Math.min(1, _c1.r); _c1.g = Math.min(1, _c1.g); _c1.b = Math.min(1, _c1.b);
  return register(_c1.getHex(THREE.SRGBColorSpace), `shade(${paletteProvenance(hex) ?? hexStr(hex)}, ${factor})`);
}

/** Linear blend in sRGB. t=0 is a, t=1 is b. */
export function mix(a, b, t) {
  _c1.setHex(a, THREE.SRGBColorSpace);
  _c2.setHex(b, THREE.SRGBColorSpace);
  _c1.lerp(_c2, t);
  return register(_c1.getHex(THREE.SRGBColorSpace),
    `mix(${paletteProvenance(a) ?? hexStr(a)}, ${paletteProvenance(b) ?? hexStr(b)}, ${t})`);
}

/** Push saturation. amount < 1 desaturates towards luminance. */
export function saturate(hex, amount) {
  _c1.setHex(hex, THREE.SRGBColorSpace);
  const l = _c1.r * 0.2126 + _c1.g * 0.7152 + _c1.b * 0.0722;
  _c1.setRGB(
    Math.min(1, Math.max(0, l + (_c1.r - l) * amount)),
    Math.min(1, Math.max(0, l + (_c1.g - l) * amount)),
    Math.min(1, Math.max(0, l + (_c1.b - l) * amount)),
  );
  return register(_c1.getHex(THREE.SRGBColorSpace), `saturate(${paletteProvenance(hex) ?? hexStr(hex)}, ${amount})`);
}

export function hexStr(hex) { return '#' + ((hex >>> 0) & 0xffffff).toString(16).padStart(6, '0'); }

/** THREE.Color from a palette hex, validated. Allocates - not for hot loops. */
export function color(hex, where = 'palette.color') {
  assertPaletteColor(hex, where);
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

/**
 * An emissive colour scaled past 1.0 so the bloom threshold (1.05) actually
 * catches it. Returns a THREE.Color, allocating - call it at build time.
 */
export function emissiveColor(hex, intensity = 1, where = 'palette.emissiveColor') {
  assertPaletteColor(hex, where);
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return c.multiplyScalar(intensity);
}

// ---------------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------------

/**
 * Walk a scene graph and report every material that was not stamped by the
 * material registry. A material without `userData.__paletteKey` was built with a
 * bare `new THREE.MeshStandardMaterial`, which means it dodges palette
 * enforcement, dodges the texture cache and breaks instancing batching.
 */
export function auditMaterials(root) {
  const offenders = [];
  const seen = new Set();
  root?.traverse?.((o) => {
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      if (!m.userData?.__paletteKey) {
        offenders.push({
          uuid: m.uuid,
          type: m.type,
          name: m.name || '<unnamed>',
          on: o.name || o.type,
          color: m.color ? hexStr(m.color.getHex(THREE.SRGBColorSpace)) : null,
        });
      }
    }
  });
  return offenders;
}

/**
 * Everything the enforcement layer knows. Print this in dev before shipping a
 * stream; `foreign` and `materialsOutsideRegistry` must both be empty.
 */
export function paletteAudit(root = null) {
  return {
    version: PALETTE_VERSION,
    strict: _strict,
    colors: _index.size,
    derived: _derived.size,
    foreign: _foreign.slice(),
    materialsOutsideRegistry: root ? auditMaterials(root) : [],
    factions: Object.keys(FACTION_PALETTES),
    pois: POI_IDS,
  };
}

/** Human-readable one-liner list, for a console.table in dev. */
export function paletteTable() {
  const rows = [];
  for (const [hex, path] of _index) rows.push({ path, hex: hexStr(hex), kind: 'declared' });
  for (const [hex, path] of _derived) rows.push({ path, hex: hexStr(hex), kind: 'derived' });
  return rows;
}
