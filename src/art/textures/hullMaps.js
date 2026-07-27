/**
 * HULL MAP COMPOSITION.
 *
 * Takes the structural layer (panel subdivision), the mechanical layer (greeble)
 * and the weathering layers, and bakes them into the three maps a
 * MeshStandardMaterial actually samples:
 *
 *   map          sRGB albedo
 *   normalMap    tangent space, panels + greeble + corrosion
 *   ormMap       R ambient occlusion / G roughness / B metalness, one texture
 *                bound to aoMap, roughnessMap and metalnessMap at once
 *
 * The albedo canvas and the ORM canvas are kept on the result so battle damage can
 * be stamped into them at runtime and re-uploaded. That is the whole reason this is
 * canvas-based rather than DataTexture-based.
 *
 * UV CONVENTION - every stream depends on this:
 *   * one UV unit is ONE METRE
 *   * +V points UP the hull (so streaks run down, markings are upright)
 * The material registry sets texture.repeat from the faction's tile size in metres,
 * so a plate is the same physical size on a fighter and on a cruiser.
 */

import {
  ctx2d, canvasTexture, saturate01, smoothstep, lerp,
  hexBytes, heightToNormalBytes, bytesToCanvas, css,
} from './canvas2d.js';
import { panelField } from './panelLines.js';
import { greebleMap } from './greeble.js';
import { wear } from './wear.js';
import { drawText, factionSigil, hullCode, hazardStripes } from './decals.js';
import { fbmField, cellularField } from './noise.js';
import { getFactionPalette, saturate as desat, NEUTRAL } from '../palette.js';

export const HULL_MAP_DEFAULTS = {
  size: 512,
  variant: 'hull',
  faction: 'player',
  wear: 0.45,
  tier: 1,
  markings: true,
  normalStrength: 0.85,
  /** Multiplies the faction's plate size. 1 = plates are the real-world size. */
  scale: 1,
};

/** Which palette entries and surface spec each material variant pulls from. */
function variantSpec(pal, variant) {
  switch (variant) {
    case 'hullDark': return { base: pal.baseDark, alt: pal.base, surface: pal.surface.hullDark, greeble: 1.4, markings: false, wearMul: 1.15 };
    case 'plating': return { base: pal.plating, alt: pal.base, surface: pal.surface.plating, greeble: 0.55, markings: true, wearMul: 0.85 };
    case 'greeble': return { base: pal.greeble, alt: pal.baseDark, surface: pal.surface.greeble, greeble: 2.2, markings: false, wearMul: 1.0 };
    case 'trim': return { base: pal.trim, alt: pal.base, surface: pal.surface.trim, greeble: 0.25, markings: false, wearMul: 1.25 };
    case 'debris': return { base: desat(pal.base, 0.15), alt: desat(pal.baseDark, 0.15), surface: pal.surface.hull, greeble: 0.8, markings: false, wearMul: 1.6 };
    case 'hull':
    case 'derelictHull':
    default: return { base: pal.base, alt: pal.baseAlt, surface: pal.surface.hull, greeble: 1.0, markings: true, wearMul: 1.0 };
  }
}

/**
 * @param {Object} opts
 * @param {import('../../core/rng.js').RNG} opts.rng
 * @returns {{map, normalMap, ormMap, albedoCanvas, ormCanvas, panel, size, tileM, surface}}
 */
export function hullMaps(opts = {}) {
  const o = { ...HULL_MAP_DEFAULTS, ...opts };
  const { rng } = o;
  if (!rng) throw new Error('[hullMaps] needs an rng');

  const pal = getFactionPalette(o.faction);
  const spec = variantSpec(pal, o.variant);
  const size = o.size;
  const n = size * size;
  const tier = Math.max(1, Math.min(3, o.tier | 0 || 1));

  // --- structural layer -----------------------------------------------------
  const panelOpts = {
    ...pal.panel,
    size,
    splits: pal.panel.splits + (tier - 1),
    minPanel: pal.panel.minPanel * (tier === 3 ? 0.78 : tier === 2 ? 0.9 : 1),
  };
  const panel = panelField(rng.fork(`panel:${o.variant}`), panelOpts);

  // --- mechanical layer -----------------------------------------------------
  const greeb = greebleMap({
    rng: rng.fork(`greeble:${o.variant}`),
    size,
    density: spec.greeble * (0.7 + tier * 0.25),
    scale: 0.85 + tier * 0.12,
    amplitude: 1,
  });

  // --- weathering -----------------------------------------------------------
  const amount = saturate01(o.wear * spec.wearMul);
  const wr = wear({
    rng: rng.fork(`wear:${o.variant}`),
    size,
    panel,
    amount,
    edge: pal.wear.edge,
    streak: pal.wear.streak,
    grime: pal.wear.grime,
    pit: o.variant === 'derelictHull' ? pal.wear.pit : pal.wear.pit * 0.35,
  });

  // --- albedo ---------------------------------------------------------------
  const [br, bg, bb] = hexBytes(spec.base);
  const [ar, ag, ab] = hexBytes(spec.alt);
  const [wr_, wg_, wb_] = hexBytes(pal.bare);
  const [or_, og_, ob_] = hexBytes(pal.wear.oxide);
  const [dr, dg, db] = hexBytes(pal.baseDark);
  const spread = Math.max(1e-4, panelOpts.toneSpread ?? 0.1);

  const bytes = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const t = saturate01((panel.tone[i] - (1 - spread)) / (2 * spread));
    let r = lerp(br, ar, t), g = lerp(bg, ag, t), b = lerp(bb, ab, t);

    // Greeble is a different part with a different finish, not the same paint.
    const gm = greeb.mask[i];
    if (gm > 0.01) {
      const k = gm * 0.35;
      r = lerp(r, dr, k); g = lerp(g, dg, k); b = lerp(b, db, k);
    }

    // Bare metal at plate edges.
    const ew = wr.edgeWear[i];
    if (ew > 0.01) { r = lerp(r, wr_, ew); g = lerp(g, wg_, ew); b = lerp(b, wb_, ew); }

    // Grime pools, then streaks run over the top of everything.
    const gr = wr.grime[i] * 0.85;
    if (gr > 0.01) { r = lerp(r, or_, gr * 0.55) * (1 - gr * 0.30); g = lerp(g, og_, gr * 0.55) * (1 - gr * 0.30); b = lerp(b, ob_, gr * 0.55) * (1 - gr * 0.34); }

    const st = wr.streak[i];
    if (st > 0.01) { r = lerp(r, or_ * 0.55, st * 0.7); g = lerp(g, og_ * 0.55, st * 0.7); b = lerp(b, ob_ * 0.55, st * 0.7); }

    // Corrosion pits eat through to dark substrate.
    const pt = wr.pit[i];
    if (pt > 0.01) { r = lerp(r, dr * 0.7, pt); g = lerp(g, dg * 0.7, pt); b = lerp(b, db * 0.7, pt); }

    // Seams are dark because there is a hole there; do not rely on AO alone,
    // which under a hard key with almost no ambient contributes nothing.
    const seamDark = 1 - panel.edge[i] * 0.55 * smoothstep(0.0, 0.35, 1 - panel.height[i]);
    const cavity = 0.55 + 0.45 * smoothstep(0.02, 0.5, panel.height[i]);

    const o4 = i * 4;
    bytes[o4] = r * seamDark * cavity;
    bytes[o4 + 1] = g * seamDark * cavity;
    bytes[o4 + 2] = b * seamDark * cavity;
    bytes[o4 + 3] = 255;
  }
  const albedoCanvas = bytesToCanvas(bytes, size);

  if (o.markings && spec.markings) {
    stampMarkings(ctx2d(albedoCanvas), size, panel, pal, o.faction, rng.fork(`marks:${o.variant}`), tier);
  }

  // --- ORM ------------------------------------------------------------------
  const ormBytes = new Uint8ClampedArray(n * 4);
  const S = spec.surface;
  for (let i = 0; i < n; i++) {
    const seam = panel.edge[i];
    const ew = wr.edgeWear[i];
    const gr = wr.grime[i];
    const st = wr.streak[i];
    const pt = wr.pit[i];
    const gm = greeb.mask[i];

    const ao = saturate01(panel.ao[i] * (1 - gr * 0.22) * (1 - gm * 0.12));
    let rough = S.roughness
      + panel.roughVar[i] * S.variance * 0.55
      + seam * 0.20
      + gr * 0.30
      + st * 0.16
      + pt * 0.34
      - ew * 0.22
      + (greeb.height[i] - 0.5) * -0.10;
    // Metalness is a material identity, not a dial: it should only move where the
    // material genuinely changes. It goes UP hard where the coating has worn off
    // (that is bare metal) and where unpainted hardware sits, and down where the
    // surface is covered in something that is not the surface.
    let metal = S.metalness
      - seam * 0.08
      - gr * 0.18
      - st * 0.12
      - pt * 0.16
      + ew * (0.92 - S.metalness) * 0.85
      + gm * 0.20;

    const o4 = i * 4;
    ormBytes[o4] = ao * 255;
    ormBytes[o4 + 1] = saturate01(rough) * 255;
    ormBytes[o4 + 2] = saturate01(metal) * 255;
    ormBytes[o4 + 3] = 255;
  }
  const ormCanvas = bytesToCanvas(ormBytes, size);

  // --- normal ---------------------------------------------------------------
  const h = new Float32Array(n);
  const greebAmp = o.variant === 'greeble' ? 0.55 : 0.34;
  for (let i = 0; i < n; i++) {
    h[i] = panel.height[i]
      + (greeb.height[i] - 0.5) * greebAmp
      - wr.pit[i] * 0.30;
  }
  const normalCanvas = bytesToCanvas(heightToNormalBytes(h, size, o.normalStrength), size);

  // UV units are metres, so the repeat is 1 / (plate tile in metres). This is what
  // keeps a plate the same physical size on an 18 m fighter and a 1400 m cruiser.
  const tileM = pal.panel.tileM * o.scale;
  const repeat = 1 / tileM;
  return {
    size, tileM, panel, surface: S, repeat,
    albedoCanvas, ormCanvas, normalCanvas,
    map: canvasTexture(albedoCanvas, { srgb: true, repeat, name: `${o.faction}:${o.variant}:albedo` }),
    ormMap: canvasTexture(ormCanvas, { repeat, name: `${o.faction}:${o.variant}:orm` }),
    normalMap: canvasTexture(normalCanvas, { repeat, name: `${o.faction}:${o.variant}:normal` }),
  };
}

/**
 * Put one marking on the biggest available plate, and at most one hazard patch.
 * One. The temptation to letter every panel is exactly the detail-density trap the
 * project brief warns about, and stencils are the most expensive kind of detail
 * because the eye goes straight to them.
 */
function stampMarkings(ctx, size, panel, pal, faction, rng, tier) {
  const leaves = panel.layout.leaves
    .filter((l) => (l.x1 - l.x0) > 0.16 && (l.y1 - l.y0) > 0.10 && l.kind !== 'recess')
    .sort((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0)) - ((a.x1 - a.x0) * (a.y1 - a.y0)));
  if (!leaves.length) return;

  const plate = leaves[Math.min(leaves.length - 1, rng.int(0, 1))];
  const px = plate.x0 * size, py = plate.y0 * size;
  const pw = (plate.x1 - plate.x0) * size, ph = (plate.y1 - plate.y0) * size;

  ctx.save();
  ctx.globalAlpha = 0.80;
  if (rng.bool(0.55)) {
    const code = hullCode(rng, faction);
    const cell = Math.max(2, Math.min(ph * 0.34 / 7, pw * 0.72 / (code.length * 6)));
    ctx.fillStyle = css(pal.marking.ink);
    drawText(ctx, code, px + pw * 0.5, py + ph * 0.5, cell, { align: 'center', baseline: 'middle' });
  } else {
    ctx.fillStyle = css(pal.marking.ink);
    factionSigil(ctx, faction, px + pw * 0.5, py + ph * 0.5, Math.min(pw, ph) * 0.30, pal.marking.ink);
  }
  ctx.restore();

  if (tier >= 2 && leaves.length > 2) {
    const strip = leaves[leaves.length - 1];
    const sx = strip.x0 * size, sy = strip.y0 * size;
    const sw = (strip.x1 - strip.x0) * size, sh = (strip.y1 - strip.y0) * size;
    ctx.save();
    ctx.globalAlpha = 0.55;
    hazardStripes(ctx, sx + sw * 0.12, sy + sh * 0.36, sw * 0.76, sh * 0.26, {
      a: pal.marking.hazardA, b: pal.marking.hazardB, period: Math.max(4, sh * 0.16),
    });
    ctx.restore();
  }
}

/** Neutral rock maps for asteroids: no plating, no markings, no metal. */
export function rockMaps(opts = {}) {
  const {
    rng, size = 512, tint = NEUTRAL.rock, dark = NEUTRAL.rockDark,
    ore = NEUTRAL.rockOre, oreAmount = 0.18, tileM = 40,
  } = opts;
  if (!rng) throw new Error('[rockMaps] needs an rng');
  const n = size * size;
  const repeat = 1 / tileM;

  // Lumpy at two scales plus craters at two scales. Regularly spaced craters of
  // one size read as a golf ball, which is the failure mode every procedural
  // asteroid falls into; two scales with different jitter breaks it.
  const lump = fbmField(rng.fork('rock-lump'), size, { baseCells: 3, octaves: 5, gain: 0.58 });
  const fine = fbmField(rng.fork('rock-fine'), size, { baseCells: 14, octaves: 4, gain: 0.5 });
  const craterBig = cellularField(rng.fork('rock-crater-a'), size, { cells: 4, jitter: 1, invert: false });
  const craterSmall = cellularField(rng.fork('rock-crater-b'), size, { cells: 11, jitter: 1, invert: false });
  const veins = fbmField(rng.fork('rock-vein'), size, { baseCells: 5, octaves: 4, gain: 0.6, ridged: true });

  const h = new Float32Array(n);
  const bytes = new Uint8ClampedArray(n * 4);
  const orm = new Uint8ClampedArray(n * 4);
  const [tr, tg, tb] = hexBytes(tint);
  const [dr2, dg2, db2] = hexBytes(dark);
  const [er, eg, eb] = hexBytes(ore);

  for (let i = 0; i < n; i++) {
    const cb = smoothstep(0.0, 0.52, craterBig[i]);
    const cs = smoothstep(0.10, 0.60, craterSmall[i]);
    h[i] = lump[i] * 0.55 + fine[i] * 0.22 + cb * 0.34 + cs * 0.14;
    // Albedo variation in rock comes from composition, not from the shape. Baking
    // a lighting term into the albedo is what makes procedural rock look like clay.
    const shade = saturate01(0.30 + lump[i] * 0.55 + fine[i] * 0.30);
    const v = saturate01(veins[i] * veins[i] * 1.8) * oreAmount;
    const o4 = i * 4;
    bytes[o4] = lerp(lerp(dr2, tr, shade), er, v);
    bytes[o4 + 1] = lerp(lerp(dg2, tg, shade), eg, v);
    bytes[o4 + 2] = lerp(lerp(db2, tb, shade), eb, v);
    bytes[o4 + 3] = 255;
    orm[o4] = saturate01(0.30 + h[i] * 0.7) * 255;
    orm[o4 + 1] = saturate01(0.96 - v * 0.42 - fine[i] * 0.10) * 255;
    orm[o4 + 2] = saturate01(v * 0.70) * 255;
    orm[o4 + 3] = 255;
  }

  return {
    size, tileM, repeat,
    map: canvasTexture(bytesToCanvas(bytes, size), { srgb: true, repeat, name: 'rock:albedo' }),
    ormMap: canvasTexture(bytesToCanvas(orm, size), { repeat, name: 'rock:orm' }),
    normalMap: canvasTexture(bytesToCanvas(heightToNormalBytes(h, size, 1.5), size), { repeat, name: 'rock:normal' }),
  };
}
