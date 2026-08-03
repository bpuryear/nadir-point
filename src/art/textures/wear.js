/**
 * WEATHERING.
 *
 * Three separable layers, because they come from three different physical causes
 * and behave differently:
 *
 *   edgeWear  paint and coating gone from plate edges and raised lips, exposing
 *             bare metal. Follows the panel layout exactly - it is caused by the
 *             panel layout.
 *   streak    directional. Something leaked, condensed or vented and ran DOWN the
 *             hull. Anchored to seams and recesses, never floating in a plate
 *             centre. This is the layer that says "gravity had an opinion here",
 *             and it is the one most often faked with a noise overlay, which is
 *             why so much sci-fi art reads as static.
 *   grime     accumulation in cavities. Low-frequency, pools in recesses, absent
 *             on proud surfaces.
 *
 * "Down the hull" is +row in canvas space. three flips textures on upload, so the
 * top of the canvas is v=1 and streaks drawn downward run downward on the model,
 * provided the geometry stream keeps +V pointing up. That convention is documented
 * in the material registry and it is not optional.
 */

import { saturate01, smoothstep, blurField, bytesToCanvas, canvasTexture } from './canvas2d.js';
import { fbmField, cellularField, streakField, fieldOps } from './noise.js';

export const WEAR_DEFAULTS = {
  size: 512,
  amount: 0.5,       // master 0..1
  edge: 0.6,
  streak: 0.6,
  grime: 0.5,
  pit: 0.0,
  anchorBias: 0.75,  // how strongly streaks must start at a seam or recess
  /**
   * HOW MANY METRES THIS TILE COVERS. 0 means "not stated", which keeps the old
   * texel-space behaviour exactly. See the PITTING block below — this is the only
   * layer in this file whose feature size was a texel count rather than a length,
   * and on the largest tile in the game that was worth a 5.9x frequency error.
   */
  tileM: 0,
};

/**
 * ===========================================================================
 * A CORROSION PIT IS A LENGTH, AND THIS FILE WAS STATING IT AS A TEXEL COUNT
 * ===========================================================================
 * `cellularField({ cells })` divides THE TILE into `cells` cells, so a cell is
 * `tileM / cells` metres across and its physical size is a function of whichever
 * tier happens to be asking. Every other feature in this texture stack was
 * converted off that footing years ago and each conversion is written up where it
 * happened: grooves, welds and steps are `grooveM` / `weldM` / `stepM`
 * (panelLines.js), greeble is `TARGET_FEATURE_M = 3.2` solved through `metreScale`
 * (hullMaps.js, "FEATURE SIZE IS STATED IN METRES, AND THAT IS THE FIX FOR THE
 * SPECK FIELD"), radiator channels are a pitch in metres, running lights are a
 * spacing in metres. Pitting was missed, and it is the one layer that is turned all
 * the way up on the one variant that carries the biggest tile.
 *
 * MEASURED with `node tools/matsurface.mjs`, which reports the generated albedo
 * canvas under tools/surface.mjs's own frequency operator, resampled so one pixel
 * is 1.556 m on every row (§3's stated 1400 m over 900 px). Tiles of different
 * physical size cannot be compared for frequency any other way. Before this pass:
 *
 *   material            tile m   meanY   calm%  med%  dense%   meanTile
 *   player hull          109.2  0.1332  100.0   0.0     0.0     0.0099
 *   coalition hull        92.4  0.1438  100.0   0.0     0.0     0.0095
 *   concord hull         117.6  0.2484  100.0   0.0     0.0     0.0079
 *   derelictHull mod     115.6  0.0621    2.1  97.9     0.0     0.0592
 *
 * Three factions' armour tiers sit between 0.0079 and 0.0099 and are 100% calm.
 * The fourth is SIX TIMES that and is the only hull surface in the game with
 * essentially no calm reserve. Ablating one layer at a time — zero one of
 * `pal.wear.{edge,streak,grime,pit}` at the `wear()` call in hullMaps.js and re-run
 * the tool — everything else held, same tree, same seed:
 *
 *   derelictHull mod, all layers on   meanY 0.0621    2.1 / 97.9 / 0.0   0.0592
 *     minus edge wear                       0.0615    2.1 / 97.9 / 0.0   0.0589
 *     minus streaks                         0.0621    2.1 / 97.9 / 0.0   0.0592
 *     minus grime                           0.0667    0.9 / 99.1 / 0.0   0.0618
 *     minus PITTING                         0.1251  100.0 /  0.0 / 0.0   0.0111
 *
 * The pit row is the whole finding, and nothing else is within reach of it. Remove
 * pitting and the derelict armour tier lands at 0.0111 against the player hull's
 * 0.0099 — a twelve ten-thousandths difference on a column where it was six times
 * over — and its value gap against that hull collapses from 1.10 stops to 0.10.
 * Removing any other layer changes nothing, and removing grime makes it WORSE.
 *
 * WHY: `cells: 26` and `cells: 52` over `derelictHull`'s 115.6 m tile is a
 * corrosion pit 4.45 m and 2.22 m across. That is not corrosion, it is leopard
 * print, and at the ship read (1.56 m/px) it lands exactly in the two-to-three-
 * pixel alternation band that `tools/surface.mjs --calibrate` shows is the only way
 * to reach the "dense" tier at all. The same two constants on the player's 16.1 m
 * greeble tile give a 0.62 m pit, which is right. One number, two tiers, and it was
 * only ever correct on one of them.
 *
 * THE FIX IS NOT TO TURN PITTING DOWN, and that distinction is the whole judgement.
 * ARCHITECTURE.md's rule is that a salvaged module "carries this faction's visual
 * identity onto your hull", and corrosion IS the derelict's identity — the palette
 * gives it `pit: 0.85` against coalition's 0.18 and concord's 0.05 on purpose.
 * Deleting it would make a derelict module read as a repainted Coalition one. So
 * the pitting stays at full strength and gets its SIZE stated in metres instead,
 * which splits it into the two things corrosion actually is:
 *
 *   PIT_PATCH_M   a bloom of corrosion. Big enough to be a SHAPE at the ship read
 *                 (13 m is 8 px at 1.56 m/px) rather than an alternation, so it
 *                 survives as identity at the distance the game is played at.
 *   PIT_CELL_M    the pitting inside the bloom. Sub-pixel at the ship read, so it
 *                 averages into a darkening and a roughness rise exactly the way
 *                 real minification does, and resolves as corrosion up close.
 *
 * That is the same two-frequency structure `busyField` already gives the greeble,
 * and it is why a derelict hulk seen at 300 m still reads as ancient while a 40 m
 * bolt-on stops reading as a different game's asset.
 */
/** Corrosion bloom, metres across. A legible shape at the ship read. */
export const PIT_PATCH_M = 13;
/** Pitting within the bloom, metres. Sub-pixel at the ship read, on purpose. */
export const PIT_CELL_M = 1.1;
/**
 * A BLOOM NEEDS A SURFACE BIG ENOUGH TO BLOOM ON, and clamping is the wrong tool.
 *
 * The obvious implementation — clamp the patch field's cell count to some floor —
 * is wrong in a way that only shows up in the measurement. A floor puts the patch
 * at a size the tile did not ask for, and on a small tile that size lands straight
 * in the two-to-three-pixel alternation band this whole change exists to get out
 * of. Worse, a patch that is a large FRACTION of a small tile stops being a
 * scattered feature and becomes a motif that repeats at the tile frequency.
 * Measured with `node tools/matsurface.mjs`, set `PIT_MIN_BLOOMS` to 0 to disable
 * the degeneration below and re-run:
 *
 *   variant, tile          patch cell        calm%   meanTile
 *   derelict greeble       0.81 m (26 cells) 100.0     0.0183   before this pass
 *     21.1 m               10.6 m (2 cells)   88.0     0.0354   <- WORSE than before
 *                          degenerate        100.0     0.0280
 *   derelict debris-v      1.11 m (26 cells) 100.0     0.0205   before this pass
 *     28.9 m               14.5 m (2 cells)  100.0     0.0249
 *                          degenerate        100.0     0.0231
 *   derelictHull mod       4.45 m (26 cells)   2.1     0.0592   before this pass
 *     115.6 m              12.8 m (9 cells)  100.0     0.0218   <- the fix
 *
 * The 21.1 m row is the one that decides it: a bloom the tile cannot hold takes
 * that variant from 100% calm to 88%, i.e. the metre rule made a small surface
 * WORSE than the texel rule it replaced. Below about four blooms to a tile the
 * patch field has nowhere to go, and the correct answer is the one the small tiles
 * already had: no bloom, just the sub-pixel pitting. `PIT_MIN_BLOOMS` is that
 * threshold and the fallback runs BOTH octaves at `PIT_CELL_M`, which is what a
 * surface too small to have weather patterns of its own should look like.
 *
 * `PIT_CELLS_MAX` is the other end: 112 cells over 512 texels leaves 4.6 texels per
 * cell, which is above the map's own Nyquist. Below that the field is texel noise
 * rather than a shape, whatever it is called.
 */
const PIT_MIN_BLOOMS = 4;
const PIT_CELLS_MAX = 112;

/**
 * @param {Object} opts
 * @param {import('../../core/rng.js').RNG} opts.rng
 * @param {Object} [opts.panel]  panel field from panelLines.panelField - streaks and
 *                               edge wear are meaningless without it
 * @returns {{edgeWear:Float32Array, streak:Float32Array, grime:Float32Array,
 *            pit:Float32Array, size:number, texture:THREE.Texture}}
 */
export function wear(opts = {}) {
  const o = { ...WEAR_DEFAULTS, ...opts };
  const { rng, panel = null } = o;
  if (!rng) throw new Error('[wear] needs an rng');
  const size = o.size;
  const n = size * size;
  const amt = saturate01(o.amount);

  // --- breakup noise, shared so the three layers agree with each other ---
  const breakup = fbmField(rng.fork('wear-breakup'), size, { baseCells: 6, octaves: 4, gain: 0.55 });
  const macro = fbmField(rng.fork('wear-macro'), size, { baseCells: 2, octaves: 3, gain: 0.6 });

  // --- edge wear ---
  const edgeWear = new Float32Array(n);
  if (panel) {
    /**
     * "NOT DOWN IN THE GROOVE" IS NOW TRUE. IT USED TO BE A COMMENT.
     *
     * The gate was `smoothstep(0.15, 0.45, panel.height)` and the height field's plate
     * plane is 0.58, so a groove floor — plate minus the tier's groove depth, 0.509 on
     * the 109 m armour tile and 0.438 on the 16 m machinery tile — sat at or above the
     * upper edge of that ramp and took FULL edge wear. The layer whose job is to strip
     * the coating off PROUD metal was therefore lerping the bottom of every seam
     * towards `pal.bare` (Y 0.576), i.e. painting the plate joint back in at nearly the
     * plate's own value.
     *
     * Measured by ablation on the generated albedo canvas, player / hull / tier 2,
     * before this change: p05 0.382 against a plate median of 0.394 with the layer on,
     * and 0.311 with `pal.wear.edge = 0`. Seven tenths of the authored groove was being
     * refilled. On `hullDark` the seam was invisible outright — p01, p25 and p50 all
     * read 0.146.
     *
     * The test is against the plate plane the panel generator publishes, so it cannot
     * drift out of agreement with the tier's groove depth again: proud of `flat` is a
     * lip and gets wear, below it is a groove and does not. The 0.010 upper edge is
     * about a third of a strake-seam lip (0.025 on the armour tile), so a lip is fully
     * worn well before its crest.
     */
    const flat = panel.flat ?? 0.58;
    for (let i = 0; i < n; i++) {
      const lip = panel.edge[i] * smoothstep(-0.006, 0.010, panel.height[i] - flat);
      edgeWear[i] = saturate01(lip * (0.35 + breakup[i] * 1.5) * o.edge * amt * 1.9);
    }
  }

  // --- streaks ---
  let streak = streakField(rng.fork('wear-streak'), size, {
    count: Math.round(150 * o.streak * amt) + 8,
    lengthMin: 0.05,
    lengthMax: 0.40,
    width: 2.2,
    strength: 1,
  });
  if (panel && o.anchorBias > 0) {
    // Kill streaks that do not begin somewhere a fluid could actually come from.
    const anchor = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      anchor[i] = saturate01(panel.edge[i] * 1.4 + (1 - smoothstep(0.2, 0.5, panel.height[i])) * 0.8);
    }
    const spread = blurField(anchor, size, Math.max(3, size / 64), 2);
    for (let i = 0; i < n; i++) {
      const gate = 1 - o.anchorBias + o.anchorBias * saturate01(spread[i] * 3.2);
      streak[i] *= gate;
    }
  }
  streak = blurField(streak, size, 1, 1);
  fieldOps.mul(streak, fieldOps.remap(fieldOps.copy(macro), 0.35, 1.25));
  fieldOps.scale(streak, o.streak * amt * 1.35);
  fieldOps.clamp01(streak);

  // --- grime ---
  const grime = new Float32Array(n);
  const blotch = cellularField(rng.fork('wear-grime'), size, { cells: 5, jitter: 1.0, invert: true });
  for (let i = 0; i < n; i++) {
    const cavity = panel ? (1 - smoothstep(0.1, 0.62, panel.height[i])) : 0.5;
    const base = macro[i] * 0.55 + blotch[i] * 0.45;
    grime[i] = saturate01((base * 0.55 + cavity * 0.75) * o.grime * amt * 1.5);
  }

  // --- pitting (derelict corrosion) ---
  // Read the long block above this file's WEAR_DEFAULTS before changing either
  // constant: these two cell counts are a LENGTH divided by the tile, not a texel
  // budget, and the 26/52 fallback is what a caller that states no tile size gets.
  const pit = new Float32Array(n);
  if (o.pit > 0) {
    const cellsFor = (metres, fallback) => (o.tileM > 0
      ? Math.max(1, Math.min(PIT_CELLS_MAX, Math.round(o.tileM / metres)))
      : fallback);
    // A tile too small to hold PIT_MIN_BLOOMS blooms gets no bloom field; both
    // octaves run at the fine pit size. See the block above.
    const blooms = cellsFor(PIT_PATCH_M, 26);
    const patchCells = o.tileM > 0 && blooms < PIT_MIN_BLOOMS ? cellsFor(PIT_CELL_M, 26) : blooms;
    const c1 = cellularField(rng.fork('wear-pit-a'), size, { cells: patchCells, jitter: 1.0, invert: true });
    const c2 = cellularField(rng.fork('wear-pit-b'), size, { cells: cellsFor(PIT_CELL_M, 52), jitter: 1.0, invert: true });
    for (let i = 0; i < n; i++) {
      const v = Math.max(smoothstep(0.55, 1.0, c1[i]), smoothstep(0.65, 1.0, c2[i]) * 0.7);
      pit[i] = saturate01(v * o.pit * amt * 1.4 * (0.4 + breakup[i]));
    }
  }

  // Packed for inspection and for any stream that wants the raw masks:
  // R edge wear, G streak, B grime.
  const bytes = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    bytes[i * 4] = edgeWear[i] * 255;
    bytes[i * 4 + 1] = streak[i] * 255;
    bytes[i * 4 + 2] = grime[i] * 255;
    bytes[i * 4 + 3] = 255;
  }

  return {
    edgeWear, streak, grime, pit, size,
    texture: canvasTexture(bytesToCanvas(bytes, size), { name: 'wear-mask' }),
  };
}
