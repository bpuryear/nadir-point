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
  /** Seam width, METRES. ship-language review: groove <= 0.3 m, no bevel. */
  grooveM: 0.26,
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
        rough: (sr.next() - 0.5) * 2,
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
  const roughVar = field(size, 0);
  const edge = field(size, 0);

  // --- everything below in TILE FRACTIONS, converted from metres once -------
  const tileM = Math.max(1e-3, o.tileM);
  const px = size / tileM;                       // texels per metre
  const halfGroove = Math.max(0.55, o.grooveM * 0.5 * px);   // texels
  const halfWeld = Math.max(0.8, o.weldM * 0.5 * px);
  const seamReach = Math.max(halfGroove, halfWeld) + 1;
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
  const rowSeamDist = new Float32Array(size);    // texels to the nearest strake seam
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
    // Distance to this strake's two edges, wrapped.
    const d0 = wrapDist(v, strakes[idx].y0) * size;
    const nxt = (idx + 1) % strakes.length;
    const d1 = wrapDist(v, strakes[nxt].y0) * size;
    rowSeamDist[y] = Math.min(d0, d1);
    rowSeamWeld[y] = (d0 <= d1 ? strakes[idx].weld : strakes[nxt].weld) ? 1 : 0;
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
        const d0 = wrapDist(v, s.y0) * size;
        const nxt = (idx + 1) % strakes.length;
        const d1 = wrapDist(v, strakes[nxt].y0) * size;
        dSeam = Math.min(d0, d1);
        seamIsWeld = (d0 <= d1 ? s.weld : strakes[nxt].weld);
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
      if (dButt < seamReach) {
        if (buttWeld) {
          const t = saturate01(1 - dButt / (halfWeld + 1));
          h += t * t * stepH * 0.55;
          e = Math.max(e, t * 0.5);
        } else {
          const t = saturate01(1 - dButt / (halfGroove + 1));
          h -= t * H.groove * 0.85;
          e = Math.max(e, t);
        }
      }
      if (dSeam < seamReach) {
        if (seamIsWeld) {
          const t = saturate01(1 - dSeam / (halfWeld + 1));
          h = H.flat + t * t * stepH * 0.7;
          e = Math.max(e, t * 0.6);
        } else {
          const t = saturate01(1 - dSeam / (halfGroove + 1));
          h = H.flat - t * H.groove;
          e = Math.max(e, t);
        }
      }

      height[i] = h;
      edge[i] = e;
      tone[i] = plate.tone * s.tone;
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

  return { height, tone, roughVar, edge, ao, size, layout: lay.layout, strakes };
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
