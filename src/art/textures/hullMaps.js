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
import { getFactionPalette, saturate as desat, shade, NEUTRAL } from '../palette.js';

export const HULL_MAP_DEFAULTS = {
  size: 512,
  variant: 'hull',
  faction: 'player',
  wear: 0.45,
  tier: 1,
  markings: true,
  /**
   * Relief, not paint, is what a plate seam is. This was 0.85 and the resulting
   * normal map was strong enough that at hero distance the eye read the tile as an
   * embossed surface pattern rather than as flat plating with lines in it.
   */
  normalStrength: 0.52,
  /** Multiplies the faction's plate size. 1 = plates are the real-world size. */
  scale: 1,
};

/**
 * DETAIL HIERARCHY.
 *
 * Reference warship hulls are roughly 60% calm plate, 30% medium, 10% dense, and it
 * is the calm 60% that makes the dense 10% worth looking at. This tile was 100%
 * medium: greeble, wear and seams at one density over every square metre, which is
 * why a 1.4 km hull, a 400 m derelict and a 40 m module all carried an identical
 * surface and none of them had a scale.
 *
 * `busyField` is a low-frequency mask built at 2 cells over the tile - so its
 * features are half a tile across, i.e. tens of metres of hull - which gates the
 * mechanical and weathering layers. Below `calm` it is zero and the plate is bare;
 * above it, it ramps to a dense band. The bands land on structure because the same
 * field is what the streaks and grime already key off.
 */
function busyField(fbm, calm) {
  const n = fbm.length;
  const out = new Float32Array(n);
  const lo = saturate01(calm);
  const hi = Math.min(1, lo + 0.30);
  for (let i = 0; i < n; i++) out[i] = smoothstep(lo, hi, fbm[i]);
  return out;
}

/**
 * FREQUENCY HIERARCHY — three genuinely different KINDS of surface.
 *
 * Round-one review, measured: "There is no calm square metre on the ship. The same
 * medium block field covers the 700 m flank belts, the dorsal armour spine, the prow
 * and the superstructure — every surface ship-language.md §3 names as calm reserve."
 * The tiers below existed then, but they differed only in tile SIZE, and the same
 * block field at two sizes is still one kind of surface. They now differ in the two
 * things that decide what a surface IS: how many seams it has, and in which
 * direction they run.
 *
 *   hull     CALM ARMOUR      tile x3.6 -> 94 m on the player hull, 15 repeats over
 *                             1400 m. THREE strakes over that tile, i.e. a 31 m
 *                             strake, and a 3.4:1 plate aspect, i.e. a 31 x 106 m
 *                             plate. Zero greeble, zero rivets, zero steps. This
 *                             surface is a flat plate with two long lines across it
 *                             and nothing else, and it is what everything else is
 *                             detail AGAINST.
 *   plating  MEDIUM           tile x1.15 -> 30 m, five strakes, some steps and welds.
 *                             Plate breaks, hatches, belt edges.
 *   greeble  DENSE MACHINERY  tile x0.5 -> 13 m, eight strakes, full greeble.
 *                             This is where detail is ALLOWED, and the geometry
 *                             stream places it in bands at mass joints, inside
 *                             recesses and around machinery.
 *
 * The calm tile is 7.2x the dense tile and carries roughly a twentieth of the seam
 * length per square metre. That is what makes them read as different materials
 * rather than as one material at two zooms.
 *
 * `tileMul` also feeds the shader: hullShader.js expresses its domain-warp period
 * and amplitude against the tile, so the warp stays proportional on all three tiers.
 */
function variantSpec(pal, variant) {
  switch (variant) {
    case 'hullDark': return {
      base: pal.baseDark, alt: pal.base, surface: pal.surface.hullDark,
      greeble: 1.0, markings: false, wearMul: 1.15,
      tileMul: 1.6, calmAdd: 0.06, contrastMul: 0.92, rivetMul: 0.7,
      strakes: 4, plateAspect: 2.8, stepMul: 0.9,
    };
    case 'plating': return {
      base: pal.plating, alt: pal.base, surface: pal.surface.plating,
      greeble: 0.45, markings: true, wearMul: 0.85,
      tileMul: 1.15, calmAdd: 0.04, contrastMul: 0.95, rivetMul: 0.9,
      strakes: 3, plateAspect: 3.2, stepMul: 1.0,
    };
    case 'greeble': return {
      base: pal.greeble, alt: pal.baseDark, surface: pal.surface.greeble,
      greeble: 0.90, markings: false, wearMul: 1.0,
      tileMul: 0.50, calmAdd: -0.26, contrastMul: 1.0, rivetMul: 1.0,
      strakes: 4, plateAspect: 2.2, stepMul: 1.4,
      // The greeble variant's own base IS the machinery colour and its `alt` is
      // already baseDark, so tinting the mechanical mask towards baseDark a second
      // time drove whole bands to near-black. Every other variant needs the full tint
      // because on those the greeble is a different part from the plate it sits on.
      greebleTint: 0.16,
    };
    // Trim's second tone must be a darker TRIM, not the hull grey - blending an
    // accent band towards the hull colour is how a faction's identity colour ends
    // up as beige.
    case 'trim': return {
      base: pal.trim, alt: shade(pal.trim, 0.78), surface: pal.surface.trim,
      greeble: 0.20, markings: false, wearMul: 1.25,
      tileMul: 1.0, calmAdd: 0.10, contrastMul: 0.85, rivetMul: 0.3,
      strakes: 3, plateAspect: 3.0, stepMul: 0.6,
    };
    // Debris albedo is deliberately near-neutral and light. An InstancedMesh tints
    // each fragment with setColorAt, and instanceColor MULTIPLIES the map - so if
    // the map already carried the faction hue the wreckage would be double-tinted
    // and end up nearly black.
    case 'debris': return {
      base: desat(pal.bare, 0.18), alt: desat(pal.base, 0.18), surface: pal.surface.hull,
      greeble: 0.8, markings: false, wearMul: 1.3,
      tileMul: 0.85, calmAdd: -0.05, contrastMul: 1.0, rivetMul: 1.0,
      strakes: 3, plateAspect: 2.6, stepMul: 1.2,
    };
    // A 3.4 km hulk needs the largest tile in the game or the whole thing is one
    // weave at one density, which is exactly what defect D5 describes.
    case 'derelictHull': return {
      base: pal.base, alt: pal.baseAlt, surface: pal.surface.hull,
      greeble: 0.8, markings: true, wearMul: 1.0,
      tileMul: 2.6, calmAdd: 0.14, contrastMul: 0.86, rivetMul: 1.0,
      strakes: 3, plateAspect: 2.2, stepMul: 1.3,
    };
    case 'hull':
    default: return {
      base: pal.base, alt: pal.baseAlt, surface: pal.surface.hull,
      /**
       * §3's calm reserve: the two 700 m flank belts, the dorsal armour spine, the
       * prow. Every number here is zero or near it, and that is the point — round
       * one was failed because "there is not one calm square metre on the ship".
       * Greeble, steps and fasteners are all switched OFF on this tier; the only
       * events on a 94 m tile are two strake seams and one butt joint per strake.
       */
      greeble: 0.0, markings: true, wearMul: 0.7,
      tileMul: 3.6, calmAdd: 0.34, contrastMul: 0.62, rivetMul: 0.0,
      strakes: 3, plateAspect: 3.4, stepMul: 0.0,
    };
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
  /**
   * The tile size is resolved BEFORE the plate field is built, because everything
   * that decides what a seam looks like is stated in METRES and has to be converted
   * against it. That ordering is the fix for the "same block scale on every part"
   * finding: a groove is 0.26 m on the 13 m machinery tile and 0.26 m on the 94 m
   * armour tile, so the armour reads as one big plate with a hairline in it while
   * the machinery reads as a dense assembly, from the same generator.
   */
  const tileM = pal.panel.tileM * o.scale * spec.tileMul;
  const panelOpts = {
    ...pal.panel,
    size,
    tileM,
    /**
     * Tier raises the seam count only slightly. It used to feed `splits` on a
     * recursive subdivision, where +1 doubled the leaf count; here it is a strake
     * count and a 5 -> 6 step turns a 10 m strake into an 8 m plank, which is what
     * made the medium tier read as running-bond brick on the first sheet.
     */
    strakes: Math.max(1, Math.round(spec.strakes * (tier === 3 ? 1.34 : tier === 2 ? 1.0 : 0.8))),
    plateAspect: spec.plateAspect,
    step: (pal.panel.step ?? 0.10) * spec.stepMul,
    rivets: pal.panel.rivets * spec.rivetMul,
  };
  const panel = panelField(rng.fork(`panel:${o.variant}`), panelOpts);

  // --- density hierarchy ----------------------------------------------------
  // Built before the mechanical layer because everything below is gated by it.
  const calm = saturate01((pal.panel.calm ?? 0.55) + spec.calmAdd);
  const busy = busyField(
    fbmField(rng.fork(`density:${o.variant}`), size, { baseCells: 2, octaves: 3, gain: 0.55 }),
    calm,
  );

  // --- mechanical layer -----------------------------------------------------
  // Density is raised because the field now removes most of it again: the same
  // number of features end up in the frame, concentrated into bands instead of
  // spread evenly, which is the difference between "a vent run" and "noise".
  /**
   * FEATURE SIZE IS STATED IN METRES, AND THAT IS THE FIX FOR THE SPECK FIELD.
   *
   * Round-one review: "The radiator surface is a uniform regular grid of bright
   * specks over its entire area and aliases into visible moire at 1280x720."
   *
   * It was, and here is the arithmetic. `greebleCanvas` draws a hatch 26-70 px wide
   * on a 512 px canvas. On the dense tier that canvas covered a 13 m tile, i.e.
   * 39 px per metre, so a "hatch" was 0.7-1.8 METRES across — smaller than the crew
   * that would open it, far below the 3 m that resolves at any playing distance, and
   * repeated forty times per tile. That is not machinery, it is noise, and noise at
   * exactly the frequency that aliases.
   *
   * `metreScale` converts the generator's canvas-pixel vocabulary into metres
   * against whatever tile this tier uses, so a hatch is ~3.2 m on the 13 m machinery
   * tile and ~3.2 m on the 30 m plating tile — the same physical object either way,
   * which is the whole point of a metre-based UV convention. Count comes down with
   * it: fewer, larger, countable parts.
   */
  const MEAN_FEATURE_PX = 48;      // mean base size greebleCanvas draws at scale 1
  const TARGET_FEATURE_M = 3.2;    // an access hatch a person could open
  const metreScale = (TARGET_FEATURE_M * 512) / (MEAN_FEATURE_PX * tileM);
  const greeb = greebleMap({
    rng: rng.fork(`greeble:${o.variant}`),
    size,
    density: spec.greeble * (0.7 + tier * 0.25),
    scale: metreScale,
    amplitude: 1,
  });
  for (let i = 0; i < n; i++) {
    const g = busy[i];
    greeb.mask[i] *= g;
    greeb.height[i] = 0.5 + (greeb.height[i] - 0.5) * g;
  }

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
  // Streaks and grime are also part of the detail budget, so they live in the same
  // bands as the greeble rather than covering the whole hull evenly. Edge wear is
  // NOT gated: it is caused by the plate layout and it has to follow it everywhere,
  // or plate edges stop reading as plate edges.
  for (let i = 0; i < n; i++) {
    const g = 0.28 + 0.72 * busy[i];
    wr.streak[i] *= g;
    wr.grime[i] *= g;
  }

  // --- albedo ---------------------------------------------------------------
  const [br, bg, bb] = hexBytes(spec.base);
  const [ar, ag, ab] = hexBytes(spec.alt);
  const [wr_, wg_, wb_] = hexBytes(pal.bare);
  const [or_, og_, ob_] = hexBytes(pal.wear.oxide);
  const [dr, dg, db] = hexBytes(pal.baseDark);
  const spread = Math.max(1e-4, panelOpts.toneSpread ?? 0.1);

  /**
   * THE SINGLE NUMBER THAT DECIDED WHETHER THIS READ AS PLATING OR AS MASONRY.
   *
   * Three separate terms below darken the albedo per plate: the base/alt tone step,
   * the seam, and the recess "cavity". At full strength a recessed plate came out at
   * 55% of its neighbour's albedo with a 45% dark border around it, and on a 1.4 km
   * hull carrying seventy repeats of that the eye stopped seeing a ship and started
   * seeing a brick wall. Real plating is very nearly one value with thin lines in
   * it; the relief and the light do the work, not the paint. `plateContrast` scales
   * all three together so the relationship between them stays intact.
   */
  const contrast = (pal.panel.plateContrast ?? 0.45) * spec.contrastMul;
  const seamK = 0.55 * contrast;
  const cavityK = 0.45 * contrast;

  const bytes = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const t0 = saturate01((panel.tone[i] - (1 - spread)) / (2 * spread));
    const t = 0.5 + (t0 - 0.5) * contrast;
    let r = lerp(br, ar, t), g = lerp(bg, ag, t), b = lerp(bb, ab, t);

    // Greeble is a different part with a different finish, not the same paint.
    const gm = greeb.mask[i];
    if (gm > 0.01) {
      const k = gm * (spec.greebleTint ?? 0.35);
      r = lerp(r, dr, k); g = lerp(g, dg, k); b = lerp(b, db, k);
    }

    // Bare metal at plate edges.
    const ew = wr.edgeWear[i];
    if (ew > 0.01) { r = lerp(r, wr_, ew); g = lerp(g, wg_, ew); b = lerp(b, wb_, ew); }

    // Grime pools, then streaks run over the top of everything.
    const gr = wr.grime[i] * 0.85;
    if (gr > 0.01) { r = lerp(r, or_, gr * 0.42) * (1 - gr * 0.26); g = lerp(g, og_, gr * 0.42) * (1 - gr * 0.26); b = lerp(b, ob_, gr * 0.42) * (1 - gr * 0.30); }

    const st = wr.streak[i];
    if (st > 0.01) { r = lerp(r, or_ * 0.55, st * 0.7); g = lerp(g, og_ * 0.55, st * 0.7); b = lerp(b, ob_ * 0.55, st * 0.7); }

    // Corrosion pits eat through to dark substrate.
    const pt = wr.pit[i];
    if (pt > 0.01) { r = lerp(r, dr * 0.7, pt); g = lerp(g, dg * 0.7, pt); b = lerp(b, db * 0.7, pt); }

    // Seams are dark because there is a hole there; do not rely on AO alone,
    // which under a hard key with almost no ambient contributes nothing.
    const seamDark = 1 - panel.edge[i] * seamK * smoothstep(0.0, 0.35, 1 - panel.height[i]);
    const cavity = (1 - cavityK) + cavityK * smoothstep(0.02, 0.5, panel.height[i]);

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
  // `tileMul` is the frequency tier: see variantSpec. `tileM` was resolved above,
  // before the plate field, because the field needs it to convert its metres.
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

  // Alpha is low on purpose. This is a TILING map, so whatever is stamped here
  // repeats every `tileM` metres - fifty times along a cruiser. A hull number the
  // eye can actually read would therefore appear fifty times, which is worse than
  // no hull number at all. Real one-off markings need a decal mesh placed by the
  // geometry stream against `materials.get('decal')`; what lives here is the faint
  // stencilling that survives repetition.
  ctx.save();
  ctx.globalAlpha = 0.34;
  if (rng.bool(0.55)) {
    const code = hullCode(rng, faction);
    const cell = Math.max(2, Math.min(ph * 0.13 / 7, pw * 0.40 / (code.length * 6)));
    ctx.fillStyle = css(pal.marking.ink);
    drawText(ctx, code, px + pw * 0.5, py + ph * 0.5, cell, { align: 'center', baseline: 'middle' });
  } else {
    ctx.fillStyle = css(pal.marking.ink);
    factionSigil(ctx, faction, px + pw * 0.5, py + ph * 0.5, Math.min(pw, ph) * 0.16, pal.marking.ink);
  }
  ctx.restore();

  if (tier >= 2 && leaves.length > 2) {
    const strip = leaves[leaves.length - 1];
    const sx = strip.x0 * size, sy = strip.y0 * size;
    const sw = (strip.x1 - strip.x0) * size, sh = (strip.y1 - strip.y0) * size;
    ctx.save();
    ctx.globalAlpha = 0.30;
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
    // The range is deliberately low and wide rather than high and narrow: at
    // 0.30-1.15 (clamped) most of a rock sat at full tint, so a field of asteroids
    // was a field of flat warm-brown blobs brighter than the ship they surrounded,
    // and nothing in the frame shared a grade with anything else.
    const shade = saturate01(0.16 + lump[i] * 0.46 + fine[i] * 0.24);
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
