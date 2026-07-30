/**
 * HULL PLATING — STRAKES, NOT MASONRY.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACED, AND WHY IT HAD TO GO
 * ---------------------------------------------------------------------------
 * The previous generator was a recursive rectangular subdivision (a BSP over the
 * unit tile) whose leaves were rasterised with a wide bevel up from a dark groove.
 * Blind review named the result exactly: "bevelled rectangular blocks in running
 * bond at the SAME block scale on every part — ashlar masonry", and it was right.
 * Three properties of a BSP make that outcome unavoidable:
 *
 *   1. A BSP has no preferred direction. Every leaf is bounded on four sides by a
 *      seam of equal weight, so the field is isotropic. Real plating is strongly
 *      anisotropic: strake seams run the length of the hull for hundreds of metres
 *      and butt joints are short, subordinate and staggered.
 *   2. Every leaf carried a bevel from groove height up to plate height on all four
 *      sides. Under any key that is a bright rim on two sides and a dark rim on the
 *      other two — a highlight ring around every block, which is the single loudest
 *      "masonry" cue available.
 *   3. Recursive subdivision concentrates leaves at one characteristic size. The
 *      "calm" reserve §3 demands cannot exist, because the recursion always fills
 *      the tile.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL NOW: STRAKES AND BUTTS
 * ---------------------------------------------------------------------------
 * A welded hull is built from STRAKES — long bands of plate running fore-and-aft,
 * each a few metres tall and as long as the yard can roll them, joined end to end at
 * BUTT joints. The seam hierarchy is not symmetric and neither is this:
 *
 *   strake seam   runs the full length of the tile in U, and because the tile
 *                 repeats in U, it runs the full length of the HULL. On a 1400 m
 *                 ship that is one continuous line from stem to stern. This is the
 *                 dominant read and it is what makes a surface look plated.
 *   butt joint    perpendicular, one per plate, PHASE-OFFSET PER STRAKE so no two
 *                 strakes butt at the same station. Never a continuous line.
 *
 * Both are flush. `grooveM` is stated in METRES (default 0.26 m, i.e. under the
 * 0.3 m the review demanded) and converted against the tile, so a seam is a thin
 * dark line at every tile size rather than a canyon that scales with the plate.
 * There is no bevel: the plate is flat right up to the groove and the groove has
 * hard walls. Relief comes from three things that are actually on a ship —
 *
 *   weld bead   a proud rounded bead, ~0.5 m, on a MINORITY of seams. This is the
 *               only thing here that reads as "welded" rather than "cut".
 *   plate lip   a small number of plates step proud or sunk by `stepM` metres, and
 *               because neighbouring plates are flush the step is a real edge with
 *               a real thickness rather than one more bevel in a field of bevels.
 *   fasteners   rivet rows along strake seams ONLY, inset from the seam, never
 *               ringing a plate. A ring of rivets around every rectangle is the
 *               second-loudest masonry cue after the bevel.
 *
 * ---------------------------------------------------------------------------
 * CALM IS A SETTING, NOT AN ACCIDENT
 * ---------------------------------------------------------------------------
 * `strakes` and `plateAspect` set the two frequencies independently, and the calm
 * armour tier (see textures/hullMaps.js) runs 3 strakes over a 94 m tile with a
 * 3.4:1 plate aspect — a 31 m x 106 m plate, which is a discrete object at the
 * 3200 m camera and repeats 15 times over 1400 m rather than 40-90. `step` and
 * `rivets` go to zero there. That surface is genuinely "one value with lines in
 * it", which is what §3 means by the calm reserve.
 *
 * Outputs (unchanged contract — hullMaps.js and the material registry read these):
 *   height / tone / roughVar / edge / ao float fields, plus `layout` for the
 *   marking stamper.
 */

import {
  saturate01, field, blurField, heightToNormalBytes,
  bytesToCanvas, packORM, canvasTexture,
} from './canvas2d.js';

/** Height levels the rasteriser writes. Absolute, so steps are consistent. */
const H = {
  flat: 0.58,
  /** How far a groove cuts below the plate it borders, in height units. */
  groove: 0.20,
};

/**
 * THE PLATE HEIGHT, EXPORTED, BECAUSE TWO CALLERS WERE GUESSING IT.
 *
 * `wear.js` gated edge wear with `smoothstep(0.15, 0.45, panel.height)` and its own
 * comment said that meant "not down in the groove". It did not. A groove floor is
 * `H.flat - grooveDepth`, and `grooveDepth` is derived from the tile — 0.071 on the
 * 109 m armour tile — so the floor sits at 0.509, which is ABOVE 0.45 and therefore
 * took FULL edge wear. Measured by ablation on the generated albedo (player, hull,
 * tier 2): with the wear layer on, the map's 5th percentile is 0.382 against a plate
 * median of 0.394; with `pal.wear.edge = 0` it is 0.311. The layer was filling the
 * albedo groove back in with bare metal to within 3% of the plate value.
 *
 * The only correct test is against the plate plane itself, so it is published rather
 * than reconstructed: proud of `flat` is a lip, below it is a groove.
 */
export const PANEL_FLAT = H.flat;

/**
 * ---------------------------------------------------------------------------
 * A SEAM IS A STEP, NOT A SCRIBED LINE, AND THE OLD ONE WAS SUB-PIXEL
 * ---------------------------------------------------------------------------
 * Round-two review: "the calm armour tier is a 93.6 m tile carrying three hairline
 * seams and a flat normal map at roughly 1% albedo contrast, i.e. a blank tile."
 *
 * That was arithmetic, not taste. `grooveM` was a flat 0.26 m on EVERY tier. On the
 * 93.6 m calm tile at 512 texels that is 1.4 texels; the tile covers 93.6 m, which at
 * the default 3200 m camera is 31 screen pixels, so the groove rendered **0.08 px
 * wide**. It could not be seen at any distance the game is ever played at, and the
 * armour tier was therefore a flat grey with nothing on it — which is exactly what
 * the review measured as 93-97% calm and 0% dense.
 *
 * ship-language.md §0 states the floor plainly: at the default camera one pixel is
 * 3.0 m and the smallest feature that reads is 9 m. A plate outline on a 1400 m ship
 * must therefore be METRES wide, and it is: on real capital armour the joint between
 * two 30 x 190 m slabs is a shadow gap with a chamfer either side, and the whole dark
 * band is a few metres across. `grooveM` is now set per tier against the STRAKE
 * HEIGHT (hullMaps.js), so it scales with the surface it sits on — which is the
 * "cell size must scale with the surface" rule, applied to the seam rather than only
 * to the plate.
 *
 * THE PROFILE IS ASYMMETRIC, and that is what makes it survive a raking key:
 *
 *        lip  ___                      proud lip, one side only  (+lipHM)
 *            /   \____ flat plate
 *   ________/
 *   \______/  <- groove floor                                    (-grooveDepthM)
 *      ramp   <- chamfer back up on the other side
 *
 * A symmetric V-groove shades identically on both sides and averages back to the
 * plate value as soon as it drops below a pixel. A step with a lit lip and a dark
 * floor keeps a light side and a dark side at every angle and every mip level, and
 * that is a value EVENT rather than a line.
 */

/**
 * ---------------------------------------------------------------------------
 * PASS 10: THE MASONRY WAS STILL THERE, AND `tools/maps.mjs` SHOWS EXACTLY WHY
 * ---------------------------------------------------------------------------
 * The strake rewrite fixed the DIRECTION of the field and was still failed on the
 * masonry read. Rendering the generated maps at 1:1 (docs/probes/hullmaps.png,
 * before this pass) shows three mechanisms, none of which the previous pass touched
 * because all three of them survive the move from BSP leaves to strakes:
 *
 * 1. ONE BUTT PER STRAKE PER TILE, AT A JITTERED PHASE, IS RUNNING BOND. That is the
 *    textbook definition of the pattern, and it is what the generator was producing:
 *    `nPlates = round(strakes / plateAspect)` came out as exactly 1 on both the calm
 *    and the medium tier, so every strake carried exactly one vertical break, offset
 *    from its neighbours. A brick wall. Real plating does not lay one butt per strake
 *    per hundred metres on a regular offset - most of a strake is uninterrupted, and
 *    the butts that exist are rare and irregular. `buttChance` now GATES each butt, so
 *    on the calm tier four strakes in five have no visible break in the tile at all.
 *
 * 2. THE LIP WAS A 7 m SOFT BEVEL. `hullMaps.js` derives `lipM = seamM * 2.1`, and on
 *    the calm tier seamM was 3.37 m, so the lip was 7.1 m - nineteen texels - and it
 *    was drawn as a squared falloff, i.e. a smooth ramp up on one side of every seam
 *    and a smooth ramp down on the other. That is a BEVEL. It is the same "bright rim
 *    on two sides, dark rim on the other two" this file's own header identifies as
 *    "the single loudest masonry cue available", reintroduced as a soft gradient
 *    instead of a hard one. A plate lap on a real hull is the THICKNESS OF THE PLATE -
 *    a few tens of centimetres - and it is a step, not a ramp. `lipM` is now clamped
 *    hard (see `lipPx` below) and the falloff is linear over at most two texels.
 *
 * 3. PER-PLATE ROUGHNESS WAS A UNIFORM RANDOM CONSTANT PER RECTANGLE. `plate.rough`
 *    was `(rng - 0.5) * 2` - the full ±1 - multiplied downstream by `variance * 0.55`,
 *    which on the hull tier is a ±8.8 point roughness step at every plate boundary.
 *    Albedo variance was correctly capped at ±4% by D41 and then the SAME defect was
 *    left standing in the ORM map, where under a key it reads as a value step just
 *    like albedo does. The maps sheet shows it plainly: the ORM panel is a field of
 *    visibly different-toned rectangles while the albedo panel beside it is nearly
 *    flat. Roughness variation is now mostly PER STRAKE (paint is applied a strake at
 *    a time, and so is the wear that dulls it) with a small per-plate residue.
 */

export const PANEL_DEFAULTS = {
  size: 512,
  /**
   * Metres of hull the tile covers. Everything below that is stated in metres is
   * converted against this, so a seam is 0.26 m whether the tile is 14 m or 94 m.
   * hullMaps.js passes the real figure; the default is only for direct callers.
   */
  tileM: 26,
  /** Strakes per tile height. 3 on armour, 5-6 on machinery. */
  strakes: 4,
  /** Plate length / strake height. Real hull plate runs long and narrow. */
  plateAspect: 2.6,
  /**
   * FRACTION OF PLATE BOUNDARIES THAT ARE ACTUALLY A VISIBLE BUTT JOINT.
   *
   * The single number that separates plating from running bond. At 1.0 every strake
   * carries its break and the field is a brick wall; at 0.20 four strakes in five run
   * unbroken across the tile and the eye reads long plate, which is what the calm
   * reserve is FOR. hullMaps.js sets it per frequency tier - 0.20 calm, 0.62 medium,
   * 1.0 dense machinery - so the tiers differ in whether they have butts at all,
   * rather than only in how big they are.
   */
  buttChance: 0.62,
  /**
   * How much of the per-plate variation budget goes on the PLATE rather than on the
   * STRAKE, for roughness. 0.25 means three quarters of it is a whole-strake shift.
   * See mechanism 3 in the header: a uniform random constant per rectangle is a
   * masonry cue whichever map it is written into.
   */
  roughPlateShare: 0.25,
  /**
   * How much of the per-plate VALUE budget goes on the plate rather than the strake.
   * The inverse split to roughness, and the note on `plate.val` says why.
   */
  valPlateShare: 0.70,
  /**
   * Seam width, METRES — the flat dark floor of the groove, before the lip and the
   * chamfer either side. hullMaps.js sets this from the strake height so it scales
   * with the surface; the default here is only for direct callers.
   */
  grooveM: 0.26,
  /** How deep the groove floor sits below the plate, metres of apparent relief. */
  grooveDepthM: 0.5,
  /** Width of the proud lip on the upper side of a strake seam, metres. */
  lipM: 0.9,
  /** Height of that lip, metres of apparent relief. */
  lipHM: 0.28,
  /** Chance a seam is a proud weld bead instead of a groove. */
  weld: 0.34,
  /** Bead width, metres. */
  weldM: 0.55,
  /** Chance a plate steps proud or sunk of its neighbours. */
  step: 0.10,
  /** Step height, metres of apparent relief. */
  stepM: 0.35,
  /** 0..1, how many strake seams carry a visible fastener row. */
  rivets: 0.4,
  /** Fastener pitch, metres. */
  rivetPitchM: 2.4,
  /**
   * PER-PLATE ALBEDO VARIANCE, and it is capped low on purpose. Round-one review:
   * "random light/dark scatter between adjacent blocks ... some plates read a full
   * step brighter than their neighbours in no discernible pattern", and required
   * <= +/-4%. A painted hull is one paint job; the value variation the eye should
   * see comes from the macro layer's object-space drift, not from here.
   */
  toneSpread: 0.035,
  /** Non-orthogonal bias. Humans build square; the derelict faction does not. */
  skew: 0.0,
  /** Kept for API compatibility with callers that still pass the old names. */
  minPanel: 0.19,
  gap: 0.008,
  bevel: 0.010,
  recess: 0.0,
  raise: 0.0,
  splits: 4,
  rivetSpacing: 0.026,
};

/**
 * Partition 0..1 into `n` bands whose widths vary by +/- `jitter`, summing to
 * exactly 1 so the tile still wraps. Returns the n+1 cumulative edges.
 */
function partition(rng, n, jitter) {
  const w = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    w[i] = 1 + (rng.next() - 0.5) * 2 * jitter;
    sum += w[i];
  }
  const edges = new Float32Array(n + 1);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += w[i] / sum; edges[i + 1] = acc; }
  edges[n] = 1;
  return edges;
}

/**
 * The plating layout.
 *
 * @param {import('../../core/rng.js').RNG} rng
 * @returns {{strakes:Array, leaves:Array, opts:Object}}
 *   `leaves` is the flat list of plates, kept because hullMaps.js#stampMarkings
 *   picks the largest one to letter. Its members carry the same x0/y0/x1/y1/kind
 *   shape the BSP leaves used to, so that caller did not have to change.
 */
export function panelLayout(rng, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const nStrakes = Math.max(1, Math.round(o.strakes));
  const vEdges = partition(rng.fork('strakes'), nStrakes, 0.30);

  const strakes = [];
  const leaves = [];

  for (let s = 0; s < nStrakes; s++) {
    const y0 = vEdges[s];
    const y1 = vEdges[s + 1];
    const hBand = y1 - y0;
    const sr = rng.fork(`strake:${s}`);

    // Plate count from the target aspect, so a tall strake gets long plates and a
    // narrow one gets short plates automatically. Clamped to at least one, which is
    // the calm case: a strake with a single butt joint per tile.
    const nPlates = Math.max(1, Math.round(1 / Math.max(0.05, hBand * o.plateAspect)));
    const uEdges = partition(sr.fork('butts'), nPlates, 0.34);
    /**
     * THE PHASE OFFSET IS THE WHOLE REASON THIS IS NOT A GRID.
     *
     * Every strake shares the tile's U range, so without a phase every strake would
     * butt at u = 0 and the tile would carry one continuous vertical line across all
     * strakes, once per repeat — a lattice column every `tileM` metres, which is the
     * exact defect (D4) this file has been failed on twice. With a per-strake phase
     * the butts stagger and no vertical line is ever longer than one strake.
     */
    const phase = sr.next();

    // The strake's own roughness shift. This is the LOW-frequency three quarters of
    // the budget: a strake is painted, weathered and rubbed as one piece.
    const strakeRough = (sr.next() - 0.5) * 2;
    // The strake's own VALUE shift, the minority share of the plate-value budget.
    const strakeVal = (sr.next() - 0.5) * 2;

    const plates = [];
    for (let p = 0; p < nPlates; p++) {
      const roll = sr.next();
      let kind = 'flat';
      let step = 0;
      if (roll < o.step * 0.5) { kind = 'recess'; step = -1; }
      else if (roll < o.step) { kind = 'raise'; step = 1; }
      const u0 = (uEdges[p] + phase) % 1;
      const u1 = (uEdges[p + 1] + phase) % 1;
      const plate = {
        u0, u1, kind, step,
        /**
         * IS THE BUTT AT THE START OF THIS PLATE DRAWN AT ALL?
         *
         * A plate that steps proud or sunk ALWAYS shows its edge, because that edge
         * is a real thickness rather than a joint - so `kind !== 'flat'` forces it.
         * Everything else is gated by `buttChance`. Suppressing the line does not
         * merge the two plates: they keep separate tones, so the boundary survives as
         * a barely-there value change, which is what a dressed and painted-over butt
         * actually looks like.
         */
        butt: step !== 0 || sr.next() < o.buttChance,
        /**
         * PLATE AND STRAKE TONE ARE ONE BUDGET, NOT TWO.
         *
         * These are multiplied together downstream and hullMaps.js normalises the
         * product against `toneSpread` to pick a point between the base and alt
         * colours. Drawing both at the full spread makes the product range ~1.8x
         * `toneSpread`, so a plate that lands near either end of the combined range
         * SATURATES the normalisation and jumps the whole way to the alt colour —
         * which is exactly the round-one finding "some plates read a full step
         * brighter than their neighbours in no discernible pattern". Splitting one
         * budget 0.6 / 0.4 keeps the product inside the range the normalisation
         * assumes, so +/-4% authored is +/-4% rendered.
         */
        tone: 1 + (sr.next() - 0.5) * 2 * o.toneSpread * 0.6,
        /**
         * THE PER-PLATE VALUE STEP, AS A SIGNED -1..1 WEIGHT AND NOTHING ELSE.
         *
         * `tone` above cannot carry this and that is not a style preference. `tone` is
         * the parameter of a lerp between `base` and `alt`, so the value it can move a
         * plate by is bounded by how far apart those two colours are — on the player
         * hull `base` 0x716c63 and `baseAlt` 0x625e56 are 0.055 of sRGB value apart and
         * `plateContrast` spends only 0.40 of that, i.e. +/-0.011. Measured on the
         * generated map, the hull tier's albedo IQR was 0.0106 and 97.8% of its texels
         * sat inside ONE 0.05-wide value bin; `plating`'s IQR was exactly 0.0000.
         *
         * A separate signed weight lets `hullMaps.js` author the step in units of
         * VALUE, so "+/-0.05" means +/-0.05 whatever two colours the tier happens to
         * lerp between. `tone` keeps doing what it is for: the small HUE step between
         * two heats of the same paint.
         *
         * 0.70 of the budget on the plate and 0.30 on the strake. Roughness is split
         * the other way (0.25/0.75) on purpose — a whole strake is painted and rubbed
         * as one piece, so FINISH is coherent along it, but plate stock arrives from
         * different heats and it is the individual plate that carries the value.
         */
        val: (sr.next() - 0.5) * 2 * o.valPlateShare + strakeVal * (1 - o.valPlateShare),
        // Mechanism 3 in the header: mostly the strake's shift, with a small residue
        // per plate so the boundary is not perfectly invisible either.
        rough: strakeRough * (1 - o.roughPlateShare) + (sr.next() - 0.5) * 2 * o.roughPlateShare,
        // Butt at the START of this plate: groove or weld bead.
        weld: sr.next() < o.weld,
      };
      plates.push(plate);
      // Legacy leaf shape, for the marking stamper. A wrapped plate is reported at
      // its unwrapped extent so the caller sees a real rectangle.
      leaves.push({
        x0: u0, x1: u0 < u1 ? u1 : 1, y0, y1,
        kind, depth: 0, height: H.flat, tone: plate.tone, rough: plate.rough,
        rivets: false, cut: null,
      });
    }

    strakes.push({
      y0, y1, plates, uEdges, phase,
      // Strake seams are the long, continuous, dominant lines. They are grooves far
      // more often than butts are: a strake seam is usually a lapped or backed joint
      // with a visible line, where a butt is usually welded flush and dressed.
      weld: sr.next() < o.weld * 0.45,
      rivets: sr.next() < o.rivets,
      // The whole strake shifts a little in value. This is the LOW-frequency half of
      // the albedo variation, and it is what a real hull shows: paint is applied a
      // strake at a time, not a plate at a time. The other 0.6 of the budget is on
      // the plate — see the note there; the two must sum to 1.
      tone: 1 + (sr.next() - 0.5) * 2 * o.toneSpread * 0.4,
    });
  }

  return { strakes, leaves, opts: o, layout: { leaves } };
}

/** Wrapped distance from `a` to `b` on the unit circle. */
const wrapDist = (a, b) => {
  let d = Math.abs(a - b);
  return d > 0.5 ? 1 - d : d;
};

/** Wrapped SIGNED offset from `b` to `a` on the unit circle, in (-0.5, 0.5]. */
const wrapSigned = (a, b) => {
  let d = a - b;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
};

/**
 * Rasterise a layout into float fields.
 * @returns {{height:Float32Array, tone:Float32Array, roughVar:Float32Array,
 *            edge:Float32Array, ao:Float32Array, size:number, layout:Object}}
 */
export function panelField(rng, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const size = o.size;
  const lay = panelLayout(rng.fork('panel-layout'), o);
  const strakes = lay.strakes;

  const height = field(size, H.flat);
  const tone = field(size, 1);
  const plateVal = field(size, 0);
  const roughVar = field(size, 0);
  const edge = field(size, 0);

  // --- everything below in TILE FRACTIONS, converted from metres once -------
  const tileM = Math.max(1e-3, o.tileM);
  const px = size / tileM;                       // texels per metre
  const halfGroove = Math.max(0.55, o.grooveM * 0.5 * px);   // texels
  const halfWeld = Math.max(0.8, o.weldM * 0.5 * px);
  /**
   * ONE HEIGHT UNIT IS ABOUT `tileM * 0.09` METRES of apparent relief once
   * heightToNormalBytes has run at strength 1 (see the note on `stepH` below, which
   * has always used this conversion). Every relief figure in this file is authored in
   * METRES and converted here, so a groove is physically the same depth on the 187 m
   * armour tile and the 30 m machinery tile even though it is a wildly different
   * number of texels on each.
   */
  const relief = (metres) => saturate01(metres / (tileM * 0.09));
  /**
   * THE LIP IS CLAMPED TO TWO TEXELS, AND THAT CLAMP IS THE ANTI-BEVEL RULE.
   *
   * `hullMaps.js` asks for `lipM = seamM * 2.1`, which on a big tier is metres of
   * ramp - and metres of ramp on both sides of every seam is a bevel, whatever it is
   * called in the caller. A plate lap is the thickness of the plate; nothing about it
   * is a gradient. Two texels is the width at which a step is still antialiased
   * rather than jagged, and it is the widest a step may be before it starts shading
   * like a chamfer. The metre figure is kept as a FLOOR for the small tiers, where two
   * texels really is a few tens of centimetres.
   */
  const lipPx = Math.min(2.0, Math.max(1.0, o.lipM * px));
  const grooveDepth = relief(o.grooveDepthM) * 0.5;
  const lipH = relief(o.lipHM) * 0.5;
  const seamReach = Math.max(halfGroove + lipPx, halfWeld) + 1;
  // A step of `stepM` metres of relief, expressed in the height field's units. The
  // field's 0..1 range is mapped by heightToNormalBytes against the tile, so one
  // height unit is about `tileM * 0.09` metres of apparent relief at strength 1.
  const stepH = saturate01(o.stepM / (tileM * 0.09)) * 0.5;
  const rivetPitch = Math.max(3, o.rivetPitchM * px);
  const rivetR = Math.max(0.9, rivetPitch * 0.16);
  const rivetInset = Math.max(2, 1.1 * px);

  /**
   * THE DERELICT'S STRAKES ARE NOT STRAIGHT, AND THEY STILL TILE.
   *
   * `skew` is the "nothing about this panel layout was decided by a person" dial
   * (palette.js, derelict at 0.42). The obvious implementation — shear the strake
   * stack — cannot tile: at u = 0 and u = 1 the shear differs, so the repeat seams.
   * A PERIODIC offset does tile, because sin(2*pi*u) is the same at both edges.
   *
   * All strake boundaries undulate together by the same amount, so no boundary can
   * ever cross a neighbour however large the amplitude, and the strakes stay a
   * partition. The read is that the lines were cut by something that did not use a
   * straight edge, which is what the faction is for.
   *
   * Amplitude is capped at a third of the narrowest strake for the same reason.
   */
  let waveAmp = 0;
  if (o.skew > 0) {
    let minBand = 1;
    for (const s of strakes) minBand = Math.min(minBand, s.y1 - s.y0);
    waveAmp = Math.min(o.skew * 0.18, minBand * 0.33);
  }
  const waveTurns = 2;                            // integer, or it would not tile

  // Per-row strake lookup, so the inner loop does no searching. Only valid when the
  // boundaries are straight; the skewed path recomputes per pixel.
  const rowStrake = new Int16Array(size);
  /**
   * SIGNED texels to the nearest strake seam. Positive means "above the seam", i.e.
   * on the +v side of it, and the sign is the whole reason the profile can be
   * asymmetric — see the note at the top of the file. The old field was unsigned, so
   * the only profile it could express was a symmetric V.
   */
  const rowSeamDist = new Float32Array(size);
  const rowSeamWeld = new Uint8Array(size);
  const strakeAt = (v) => {
    for (let s = 0; s < strakes.length; s++) {
      if (v >= strakes[s].y0 && v < strakes[s].y1) return s;
    }
    return strakes.length - 1;
  };
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    const idx = strakeAt(v);
    rowStrake[y] = idx;
    const nxt = (idx + 1) % strakes.length;
    const s0 = wrapSigned(v, strakes[idx].y0) * size;   // this strake's lower edge
    const s1 = wrapSigned(v, strakes[nxt].y0) * size;   // its upper edge
    const nearer0 = Math.abs(s0) <= Math.abs(s1);
    rowSeamDist[y] = nearer0 ? s0 : s1;
    rowSeamWeld[y] = (nearer0 ? strakes[idx].weld : strakes[nxt].weld) ? 1 : 0;
  }

  for (let y = 0; y < size; y++) {
    const row = y * size;
    const vRow = (y + 0.5) / size;
    let s = strakes[rowStrake[y]];
    let dSeam = rowSeamDist[y];
    let seamIsWeld = rowSeamWeld[y] === 1;

    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;

      if (waveAmp > 0) {
        const v = (vRow + waveAmp * Math.sin(u * Math.PI * 2 * waveTurns) + 1) % 1;
        const idx = strakeAt(v);
        s = strakes[idx];
        const nxt = (idx + 1) % strakes.length;
        const s0 = wrapSigned(v, s.y0) * size;
        const s1 = wrapSigned(v, strakes[nxt].y0) * size;
        const nearer0 = Math.abs(s0) <= Math.abs(s1);
        dSeam = nearer0 ? s0 : s1;
        seamIsWeld = (nearer0 ? s.weld : strakes[nxt].weld);
      }

      // Which plate, and how far to the nearest butt. Plates are few (1-6 per
      // strake), so a linear scan is cheaper than any structure.
      let plate = s.plates[0];
      let dButt = size;
      let buttWeld = false;
      for (let i = 0; i < s.plates.length; i++) {
        const p = s.plates[i];
        const inside = p.u0 <= p.u1 ? (u >= p.u0 && u < p.u1) : (u >= p.u0 || u < p.u1);
        if (inside) plate = p;
        // A suppressed butt is not a candidate for the nearest-seam test at all, so
        // the plate to either side of it runs on unbroken. See `plate.butt`.
        if (!p.butt) continue;
        const d = wrapDist(u, p.u0) * size;
        if (d < dButt) { dButt = d; buttWeld = p.weld; }
      }

      const i = row + x;
      let h = H.flat + plate.step * stepH;
      let e = 0;

      // --- the two seams -----------------------------------------------------
      // A butt joint is SUBORDINATE: it is written first so that where a butt meets
      // a strake seam, the strake seam wins and stays continuous. That priority is
      // the difference between a plated hull and a grid.
      // The test is against the WIDER of the two, because a weld bead is wider than a
      // groove (0.55 m against 0.26 m on the player hull) and testing against the
      // groove alone silently clipped every bead to the groove's width — which made
      // the one feature in here that reads as "welded" instead read as a thin ridge.
      // A butt is SUBORDINATE: narrower groove, no lip, and it is overwritten where
      // it meets a strake seam.
      if (dButt < seamReach) {
        if (buttWeld) {
          const t = saturate01(1 - dButt / (halfWeld + 1));
          h += t * t * stepH * 0.55;
          e = Math.max(e, t * 0.5);
        } else {
          const a = dButt;
          if (a <= halfGroove * 0.7) { h -= grooveDepth; e = Math.max(e, 1); }
          else {
            const t = saturate01(1 - (a - halfGroove * 0.7) / (lipPx * 0.7));
            h -= grooveDepth * t * t;
            e = Math.max(e, t * 0.7);
          }
        }
      }
      if (Math.abs(dSeam) < seamReach) {
        if (seamIsWeld) {
          const t = saturate01(1 - Math.abs(dSeam) / (halfWeld + 1));
          h = H.flat + t * t * stepH * 0.7;
          e = Math.max(e, t * 0.6);
        } else {
          /**
           * THE ASYMMETRIC STEP. Groove floor in the middle, a proud lip on the +v
           * side, a chamfer ramp on the -v side. Written ABSOLUTELY (h = H.flat + ...)
           * rather than added, so the strake seam always wins over a butt that crosses
           * it and the long line stays continuous — that priority is what separates a
           * plated hull from a grid.
           */
          const a = Math.abs(dSeam);
          if (a <= halfGroove) {
            h = H.flat - grooveDepth;
            e = Math.max(e, 1);
          } else {
            /**
             * LINEAR OVER AT MOST TWO TEXELS, NOT A SQUARED FALLOFF OVER NINETEEN.
             *
             * `t * t` over a `lipPx` measured in metres is a smooth ramp, i.e. a
             * chamfer, i.e. the bevel this generator exists to have got rid of. `t`
             * over two texels is an antialiased STEP: the lit lip and the dark floor
             * are each one flat value with a hard boundary between them, which is
             * what a lapped plate edge is and what survives a mip drop as a line
             * rather than dissolving into a soft band.
             */
            const t = saturate01(1 - (a - halfGroove) / lipPx);
            if (dSeam > 0) {
              // Upper side: the plate above laps over, so its edge stands proud and
              // catches the key. This is the light half of the pair.
              h = H.flat + lipH * t;
              e = Math.max(e, t * 0.30);
            } else {
              // Lower side: the groove wall. One texel of ramp, then plate.
              h = H.flat - grooveDepth * t;
              e = Math.max(e, t * 0.75);
            }
          }
        }
      }

      height[i] = h;
      edge[i] = e;
      tone[i] = plate.tone * s.tone;
      plateVal[i] = plate.val;
      roughVar[i] = plate.rough;
    }
  }

  // --- fasteners: along strake seams only, never around a plate -------------
  if (o.rivets > 0) {
    for (let s = 0; s < strakes.length; s++) {
      if (!strakes[s].rivets) continue;
      const yEdge = strakes[s].y0 * size;
      for (const side of [-1, 1]) {
        const cy = yEdge + side * rivetInset;
        for (let d = 0; d < size; d += rivetPitch) {
          stampDot(height, size, d, cy, rivetR, 0.10);
        }
      }
    }
  }

  // Cavity AO: a seam is dark because there is a hole there, not because of a filter.
  const ao = field(size, 1);
  const blurred = blurField(Float32Array.from(height), size, Math.max(2, Math.round(size / 96)), 2);
  for (let i = 0; i < ao.length; i++) {
    ao[i] = saturate01(0.62 + (height[i] - blurred[i]) * 2.4 + height[i] * 0.28);
  }

  return {
    height, tone, plateVal, roughVar, edge, ao, size, layout: lay.layout, strakes,
    // The plate plane and the groove depth, in the height field's own units, so a
    // caller can tell a proud lip from a groove floor without guessing. See PANEL_FLAT.
    flat: H.flat, grooveH: grooveDepth,
  };
}

/**
 * A HEAT-REJECTION PANEL, WHICH IS NOT PLATING AND MUST NOT SHARE ITS GENERATOR.
 *
 * Round-two review: "It is also on the radiator fins, which are heat-rejection panels
 * and should never carry an armour-plate map." Correct, and the reason is functional:
 * a radiator is not built to stop a shell, it is built to move heat out of a working
 * fluid, so its surface is a dense run of parallel channels with transverse manifolds
 * — one strong direction at one fine frequency, and no plates, no butts, no fasteners
 * and no armour belt anywhere in it.
 *
 * The output shape is identical to `panelField`'s so the hull composer does not care
 * which one it got. `layout.leaves` is empty on purpose: nothing stencils a radiator.
 *
 * @returns {{height:Float32Array, tone:Float32Array, roughVar:Float32Array,
 *            edge:Float32Array, ao:Float32Array, size:number, layout:Object}}
 */
export function radiatorField(rng, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const size = o.size;
  const tileM = Math.max(1e-3, o.tileM);
  const px = size / tileM;
  const n = size * size;

  const height = field(size, H.flat);
  const tone = field(size, 1);
  const plateVal = field(size, 0);
  const roughVar = field(size, 0);
  const edge = field(size, 0);

  // Channel pitch in METRES, so the flutes are the same physical size whatever tile
  // the caller picked. 1.15 m is a coolant channel a person could straddle.
  const pitchM = o.flutePitchM ?? 1.15;
  // Whole texels per pitch, and an integer number of pitches across the tile, or the
  // repeat seams.
  const flutes = Math.max(4, Math.round(tileM / pitchM));
  // Manifolds: a transverse header every `manifoldM` metres, again an integer count.
  const manifolds = Math.max(1, Math.round(tileM / (o.manifoldM ?? 21)));

  const relief = (metres) => saturate01(metres / (tileM * 0.09)) * 0.5;
  const channelD = relief(o.channelDepthM ?? 0.42);
  const manifoldH = relief(o.manifoldHeightM ?? 0.55);
  const manifoldHalf = Math.max(1.2, (o.manifoldWidthM ?? 1.9) * 0.5 * px);

  const tr = rng.fork('radiator');
  // A few channels are blanked off — a repaired panel never has every tube live.
  const dead = new Uint8Array(flutes);
  for (let i = 0; i < flutes; i++) dead[i] = tr.next() < 0.06 ? 1 : 0;

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    // Position within one channel, 0..1.
    const fp = v * flutes;
    const fi = Math.floor(fp) % flutes;
    const f = fp - Math.floor(fp);
    // Rounded tube with a hard valley between tubes: cos gives the tube, the valley
    // is where it meets its neighbour and that is the line the eye reads.
    const tube = Math.sin(f * Math.PI);
    const hv = dead[fi] ? -channelD * 0.35 : (tube * tube * channelD - channelD * 0.5);
    const valley = saturate01(1 - Math.abs(f - 0.5) * 2);   // 1 at the valley
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let h = H.flat + hv;
      let e = (1 - valley) * 0.55;

      // Transverse manifold: a proud round bar across every channel.
      const mp = u * manifolds;
      const md = Math.abs((mp - Math.floor(mp)) - 0.5) * (size / manifolds);
      if (md < manifoldHalf) {
        const t = 1 - md / manifoldHalf;
        h = H.flat + manifoldH * Math.sqrt(saturate01(t));
        e = Math.max(e, 0.4);
      }

      const i = y * size + x;
      height[i] = h;
      edge[i] = e;
      // Very little tone variation: a radiator is one coating, applied once.
      tone[i] = 1 + (dead[fi] ? -o.toneSpread * 0.8 : 0);
      roughVar[i] = (valley - 0.5) * 0.6;
    }
  }

  const ao = field(size, 1);
  const blurred = blurField(Float32Array.from(height), size, Math.max(2, Math.round(size / 110)), 2);
  for (let i = 0; i < n; i++) {
    ao[i] = saturate01(0.58 + (height[i] - blurred[i]) * 2.6 + height[i] * 0.26);
  }

  return {
    height, tone, plateVal, roughVar, edge, ao, size, layout: { leaves: [] }, strakes: [],
    // A radiator has no plate seam, so its "groove" is the channel valley: the depth
    // the hull composer must not treat as a plate joint. Published for the same reason.
    flat: H.flat, grooveH: channelD * 0.5,
  };
}

/** One raised fastener head, wrapped. */
function stampDot(height, size, cx, cy, r, amp) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    const yy = ((y % size) + size) % size;
    for (let x = x0; x <= x1; x++) {
      const xx = ((x % size) + size) % size;
      const dx = (x - cx) / r, dy = (y - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      height[yy * size + xx] += amp * Math.sqrt(1 - d2);
    }
  }
}

/**
 * The public generator. Produces the two maps the material registry needs from a
 * plating layout: a normal map and a packed ORM map.
 *
 * @param {Object} opts
 * @param {import('../../core/rng.js').RNG} opts.rng
 * @returns {{normal:THREE.Texture, orm:THREE.Texture, field:Object}}
 */
export function panelLines(opts = {}) {
  const { rng, surface = { metalness: 0.8, roughness: 0.5, variance: 0.25 }, normalStrength = 1 } = opts;
  if (!rng) throw new Error('[panelLines] needs an rng');
  const f = panelField(rng, opts);
  const size = f.size;

  const rough = new Float32Array(size * size);
  const metal = new Float32Array(size * size);
  for (let i = 0; i < rough.length; i++) {
    const seam = f.edge[i];
    rough[i] = saturate01(surface.roughness + f.roughVar[i] * surface.variance * 0.5 + seam * 0.22);
    metal[i] = saturate01(surface.metalness - seam * 0.16);
  }

  const normalBytes = heightToNormalBytes(f.height, size, normalStrength);
  return {
    field: f,
    normal: canvasTexture(bytesToCanvas(normalBytes, size), { name: 'panel-normal' }),
    orm: canvasTexture(packORM(f.ao, rough, metal, size), { name: 'panel-orm' }),
  };
}
