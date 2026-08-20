/**
 * The 52-colour master palette and the locks that carve it up.
 *
 * Palette discipline is the entire art budget. Because every sprite is drawn
 * from this list and every faction is locked to a subset of it, a Coalition
 * cannon bank bolted onto a Concord hull reads as deliberate assembly rather
 * than as a rendering bug — the mismatch is a designed signal, and it only
 * works because the vocabulary is small and closed.
 *
 * Ramps run dark to light with strictly increasing luminance so shading code
 * can index them as steps rather than choosing colours.
 */

import {
  blueOf, EMPTY, fromHex, greenOf, isOpaque, redOf, type Rgba,
} from './pixbuf.js';

/** Cold steel. The player's structural hull and every faction's shared plating. */
export const NEUTRAL: readonly Rgba[] = Object.freeze([
  fromHex('#0a0d12'), fromHex('#161c26'), fromHex('#26303f'), fromHex('#3c4a5c'),
  fromHex('#5a6b80'), fromHex('#8496ab'), fromHex('#b6c4d4'), fromHex('#dce6f0'),
]);

/** Rust and bronze. Derelict hulls, oxidised salvage, scorch. */
export const WARM: readonly Rgba[] = Object.freeze([
  fromHex('#1a120c'), fromHex('#2e2015'), fromHex('#4a3320'), fromHex('#6b4a2c'),
  fromHex('#91663a'), fromHex('#b98a52'), fromHex('#d9ab73'),
]);

/** Faction A — cold blue-white. Disciplined, uniform, navy. */
export const CONCORD_RAMP: readonly Rgba[] = Object.freeze([
  fromHex('#0c1622'), fromHex('#16293f'), fromHex('#234460'), fromHex('#356585'),
  fromHex('#4f8cae'), fromHex('#7fb8d4'), fromHex('#a8dcf0'),
]);

/** Faction B — olive and ochre. Industrial, welded, agricultural-machinery green. */
export const COALITION_RAMP: readonly Rgba[] = Object.freeze([
  fromHex('#14170c'), fromHex('#242a12'), fromHex('#3c451e'), fromHex('#5a6630'),
  fromHex('#7f8c44'), fromHex('#a8b263'), fromHex('#ccd68a'),
]);

export type EmissiveName =
  | 'cyan' | 'blue' | 'amber' | 'red' | 'green' | 'white' | 'magenta' | 'orange';

/** The only colours permitted to bloom. Everything else is matte by rule. */
export const EMISSIVE: Readonly<Record<EmissiveName, Rgba>> = Object.freeze({
  cyan: fromHex('#5ff2e6'),
  blue: fromHex('#4a9df2'),
  amber: fromHex('#ffb03a'),
  red: fromHex('#ff4a3a'),
  green: fromHex('#6cf24a'),
  white: fromHex('#f2f7ff'),
  magenta: fromHex('#d45ff2'),
  orange: fromHex('#ff7a29'),
});

/** Deep space and nebula. Cold at the bottom, drifting warm-violet at the top. */
export const SPACE: readonly Rgba[] = Object.freeze([
  fromHex('#04050a'), fromHex('#080b14'), fromHex('#0e1322'), fromHex('#161d33'),
  fromHex('#221a3a'), fromHex('#33224a'), fromHex('#4a2e52'), fromHex('#6b3d55'),
]);

/** Panel chrome. Phosphor green — the terminal register the UI speaks in. */
export const UI: readonly Rgba[] = Object.freeze([
  fromHex('#0a0f0c'), fromHex('#12211a'), fromHex('#1e3a2c'), fromHex('#2f5c45'),
  fromHex('#468a66'), fromHex('#7fd4a0'), fromHex('#b8f2cc'),
]);

export const MASTER_PALETTE: readonly Rgba[] = Object.freeze([
  ...NEUTRAL, ...WARM, ...CONCORD_RAMP, ...COALITION_RAMP,
  ...Object.values(EMISSIVE), ...SPACE, ...UI,
]);

const PALETTE_SET: ReadonlySet<Rgba> = new Set(MASTER_PALETTE);

export const EMISSIVE_SET: ReadonlySet<Rgba> = new Set(Object.values(EMISSIVE));

export type FactionId = 'concord' | 'coalition' | 'derelict' | 'player';

/**
 * Each faction's locked subset. Shared neutrals are what let salvaged parts sit
 * on a foreign hull at all; the ramp is what keeps their origin legible.
 */
export const FACTION_PALETTE: Readonly<Record<FactionId, readonly Rgba[]>> = Object.freeze({
  concord: Object.freeze([
    ...CONCORD_RAMP, ...NEUTRAL,
    EMISSIVE.blue, EMISSIVE.cyan, EMISSIVE.white,
  ]),
  coalition: Object.freeze([
    ...COALITION_RAMP, ...NEUTRAL.slice(0, 5), ...WARM.slice(0, 4),
    EMISSIVE.amber, EMISSIVE.orange, EMISSIVE.red,
  ]),
  derelict: Object.freeze([
    ...WARM, ...NEUTRAL.slice(0, 4),
    EMISSIVE.green, EMISSIVE.red,
  ]),
  player: Object.freeze([
    ...NEUTRAL, ...WARM.slice(2, 5),
    EMISSIVE.amber, EMISSIVE.white, EMISSIVE.red,
  ]),
});

export type PoiId =
  | 'gasgiant' | 'belt' | 'station' | 'graveyard'
  | 'yard' | 'star' | 'deepfield' | 'wreckreef';

/**
 * Each POI locks to a subset so a single screenshot identifies where you are.
 * The star's lock is deliberately the harshest: blown-out warm values with the
 * cold end of the palette withheld entirely.
 */
export const POI_PALETTE: Readonly<Record<PoiId, readonly Rgba[]>> = Object.freeze({
  gasgiant: Object.freeze([...SPACE.slice(0, 6), ...WARM.slice(2, 6), ...NEUTRAL.slice(1, 6), EMISSIVE.amber]),
  belt: Object.freeze([...SPACE.slice(0, 4), ...NEUTRAL, ...WARM.slice(1, 4), EMISSIVE.white]),
  station: Object.freeze([...SPACE.slice(0, 5), ...NEUTRAL.slice(1, 7), EMISSIVE.amber, EMISSIVE.red, EMISSIVE.cyan]),
  graveyard: Object.freeze([...SPACE.slice(0, 4), ...NEUTRAL.slice(0, 5), ...WARM.slice(0, 5), EMISSIVE.green]),
  yard: Object.freeze([...SPACE.slice(1, 5), ...NEUTRAL.slice(2, 8), ...CONCORD_RAMP.slice(1, 5), EMISSIVE.blue, EMISSIVE.white]),
  star: Object.freeze([...WARM.slice(1, 7), ...NEUTRAL.slice(4, 8), EMISSIVE.orange, EMISSIVE.amber, EMISSIVE.white]),
  deepfield: Object.freeze([...SPACE, ...NEUTRAL.slice(0, 4), EMISSIVE.cyan]),
  wreckreef: Object.freeze([...SPACE.slice(2, 8), ...WARM.slice(0, 4), ...NEUTRAL.slice(1, 5), EMISSIVE.magenta, EMISSIVE.red]),
});

/** Transparency is a valid state, not an off-palette colour. */
export function isInPalette(c: Rgba): boolean {
  if (!isOpaque(c)) return c === EMPTY;
  return PALETTE_SET.has(c);
}

export function isEmissive(c: Rgba): boolean {
  return EMISSIVE_SET.has(c);
}

/** Nearest palette entry by squared RGB distance. Transparency passes through. */
export function snapToPalette(c: Rgba, allowed: readonly Rgba[] = MASTER_PALETTE): Rgba {
  if (!isOpaque(c)) return EMPTY;

  const r = redOf(c), g = greenOf(c), b = blueOf(c);
  let best = allowed[0]!;
  let bestDist = Infinity;

  for (const candidate of allowed) {
    const dr = r - redOf(candidate);
    const dg = g - greenOf(candidate);
    const db = b - blueOf(candidate);
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

const HULL_RAMP: Readonly<Record<FactionId, readonly Rgba[]>> = Object.freeze({
  concord: CONCORD_RAMP,
  coalition: COALITION_RAMP,
  derelict: WARM,
  player: NEUTRAL,
});

export function rampOf(faction: FactionId): readonly Rgba[] {
  return HULL_RAMP[faction];
}

/** Clamped ramp index. Shading code walks steps; it never picks colours. */
export function shadeStep(ramp: readonly Rgba[], step: number): Rgba {
  const i = Math.round(step);
  if (i <= 0) return ramp[0]!;
  if (i >= ramp.length) return ramp[ramp.length - 1]!;
  return ramp[i]!;
}
