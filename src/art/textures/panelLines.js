/**
 * PANEL PLATING.
 *
 * Recursive rectangular subdivision, not noise. A ship hull is a manufactured
 * object: it is divided into plates because plates are what a yard can weld, and
 * the plates get smaller where the structure is complicated. Noise cannot produce
 * that, and every hull textured with noise reads as rock.
 *
 * The layout is a BSP over the unit tile. Each split picks the longer axis most of
 * the time and a ratio drawn from a distribution with real tails, so a tile
 * contains a couple of large plates, a scatter of medium ones and a knot of small
 * ones - which is what plating actually looks like. Leaves are then rasterised with
 * a seam gap and a chamfer, so the height field has hard edges with a readable
 * bevel rather than a blurred groove.
 *
 * Tiling is free: the tile border is itself a seam, so the repeat lands on a panel
 * line and disappears.
 *
 * Outputs:
 *   field  - height / tone / roughness-variation / edge-proximity float fields
 *   normal - tangent-space normal map derived from the height field
 *   orm    - R: ambient occlusion, G: roughness, B: metalness
 */

import {
  saturate01, smoothstep, field, blurField, heightToNormalBytes,
  bytesToCanvas, packORM, canvasTexture,
} from './canvas2d.js';

/** Height levels the rasteriser writes. Absolute, so bevels are consistent. */
const H = {
  groove: 0.06,
  recess: 0.34,
  flat: 0.58,
  raise: 0.80,
};

export const PANEL_DEFAULTS = {
  size: 512,
  minPanel: 0.18,
  gap: 0.009,
  bevel: 0.011,
  recess: 0.16,
  raise: 0.12,
  rivets: 0.5,
  rivetSpacing: 0.026,
  skew: 0.0,
  splits: 4,
  toneSpread: 0.10,
};

/**
 * Subdivide the unit tile. Returns leaf rectangles in 0..1 space.
 * @param {import('../../core/rng.js').RNG} rng
 */
export function panelLayout(rng, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const leaves = [];

  const split = (x0, y0, x1, y1, depth) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const canSplitX = w > o.minPanel * 2;
    const canSplitY = h > o.minPanel * 2;

    // Stop deterministically on size, probabilistically on depth. The probabilistic
    // stop is what produces neighbouring plates of genuinely different sizes.
    const forcedStop = (!canSplitX && !canSplitY) || depth >= o.splits;
    if (forcedStop || (depth >= 2 && rng.next() < 0.16)) {
      leaves.push(makeLeaf(rng, x0, y0, x1, y1, depth, o));
      return;
    }

    let vertical;
    if (canSplitX && canSplitY) vertical = w >= h ? rng.next() < 0.86 : rng.next() < 0.14;
    else vertical = canSplitX;

    // Ratio: mostly near the middle, with a long tail so strakes and thin belts appear.
    let t;
    const roll = rng.next();
    if (roll < 0.24) t = 0.12 + rng.next() * 0.16;        // thin strip off one side
    else if (roll < 0.34) t = 0.72 + rng.next() * 0.16;
    else t = 0.38 + rng.next() * 0.24;
    if (o.skew > 0) t = t * (1 - o.skew) + (0.5 + (rng.next() - 0.5) * 0.9) * o.skew;

    if (vertical) {
      const xm = x0 + w * t;
      if (xm - x0 < o.minPanel || x1 - xm < o.minPanel) { leaves.push(makeLeaf(rng, x0, y0, x1, y1, depth, o)); return; }
      split(x0, y0, xm, y1, depth + 1);
      split(xm, y0, x1, y1, depth + 1);
    } else {
      const ym = y0 + h * t;
      if (ym - y0 < o.minPanel || y1 - ym < o.minPanel) { leaves.push(makeLeaf(rng, x0, y0, x1, y1, depth, o)); return; }
      split(x0, y0, x1, ym, depth + 1);
      split(x0, ym, x1, y1, depth + 1);
    }
  };

  split(0, 0, 1, 1, 0);
  return { leaves, opts: o };
}

function makeLeaf(rng, x0, y0, x1, y1, depth, o) {
  const roll = rng.next();
  let kind = 'flat';
  let h = H.flat;
  if (roll < o.recess) { kind = 'recess'; h = H.recess; }
  else if (roll < o.recess + o.raise) { kind = 'raise'; h = H.raise; }

  // Big plates sit at the reference height; the eye needs a stable datum.
  const area = (x1 - x0) * (y1 - y0);
  if (area > 0.22 && kind !== 'flat') { kind = 'flat'; h = H.flat; }

  // A slight per-plate height jitter keeps rows of plates from looking extruded
  // from one block, without adding a second visual frequency.
  h += (rng.next() - 0.5) * 0.05;

  const leaf = {
    x0, y0, x1, y1, depth, kind,
    height: h,
    tone: 1 + (rng.next() - 0.5) * 2 * o.toneSpread,
    rough: (rng.next() - 0.5) * 2,
    rivets: kind !== 'recess' && rng.next() < o.rivets,
    cut: null,
  };

  // Derelict plates get a chamfered corner. Cheap to rasterise, and it is the
  // single strongest "no human drew this" signal available in a rectangle.
  if (o.skew > 0 && rng.next() < o.skew) {
    leaf.cut = {
      corner: rng.int(0, 3),
      amount: Math.min(x1 - x0, y1 - y0) * (0.25 + rng.next() * 0.45),
    };
  }
  return leaf;
}

/**
 * Rasterise a layout into float fields.
 * @returns {{height:Float32Array, tone:Float32Array, roughVar:Float32Array,
 *            edge:Float32Array, ao:Float32Array, size:number, layout:Object}}
 */
export function panelField(rng, opts = {}) {
  const o = { ...PANEL_DEFAULTS, ...opts };
  const size = o.size;
  const layout = panelLayout(rng.fork('panel-layout'), o);

  const height = field(size, H.flat);
  const tone = field(size, 1);
  const roughVar = field(size, 0);
  const edge = field(size, 0);   // 1 at a seam, 0 in the middle of a plate

  const gapPx = Math.max(1.0, o.gap * size * 0.5);
  const bevelPx = Math.max(1.0, o.bevel * size);

  for (const leaf of layout.leaves) {
    const px0 = Math.round(leaf.x0 * size);
    const py0 = Math.round(leaf.y0 * size);
    const px1 = Math.round(leaf.x1 * size);
    const py1 = Math.round(leaf.y1 * size);

    let cutA = 0, cdx = 0, cdy = 0, cx0 = 0, cy0 = 0;
    if (leaf.cut) {
      cutA = leaf.cut.amount * size;
      // corner 0: -x-y, 1: +x-y, 2: +x+y, 3: -x+y
      cdx = (leaf.cut.corner === 1 || leaf.cut.corner === 2) ? -1 : 1;
      cdy = (leaf.cut.corner === 2 || leaf.cut.corner === 3) ? -1 : 1;
      cx0 = cdx > 0 ? px0 : px1;
      cy0 = cdy > 0 ? py0 : py1;
    }

    for (let y = py0; y < py1; y++) {
      const row = y * size;
      const dyTop = y - py0;
      const dyBot = py1 - 1 - y;
      for (let x = px0; x < px1; x++) {
        let d = Math.min(x - px0, px1 - 1 - x, dyTop, dyBot);
        if (cutA > 0) {
          const dc = (((x - cx0) * cdx) + ((y - cy0) * cdy) - cutA) * 0.70710678;
          if (dc < d) d = dc;
        }
        const i = row + x;
        if (d < 0) { height[i] = H.groove; edge[i] = 1; continue; }
        const t = smoothstep(gapPx, gapPx + bevelPx, d);
        height[i] = H.groove + (leaf.height - H.groove) * t;
        edge[i] = 1 - smoothstep(gapPx, gapPx + bevelPx * 2.4, d);
        tone[i] = leaf.tone;
        roughVar[i] = leaf.rough;
      }
    }

    if (leaf.rivets && o.rivets > 0) {
      stampRivets(height, size, leaf, o, gapPx + bevelPx);
    }
  }

  // Cavity AO: seams are dark because they are holes, not because of a filter.
  const ao = field(size, 1);
  const blurred = blurField(Float32Array.from(height), size, Math.max(2, Math.round(size / 96)), 2);
  for (let i = 0; i < ao.length; i++) {
    ao[i] = saturate01(0.55 + (height[i] - blurred[i]) * 2.6 + height[i] * 0.35);
  }

  return { height, tone, roughVar, edge, ao, size, layout };
}

/**
 * Rivet heads along a plate border. Coalition hulls are held together with
 * fasteners you can see from a hundred metres, and at 512 px over a 14 m tile a
 * rivet is about two pixels - it survives as a specular sparkle rather than as
 * geometry, which is exactly right.
 */
function stampRivets(height, size, leaf, o, inset) {
  const px0 = leaf.x0 * size + inset + 2;
  const py0 = leaf.y0 * size + inset + 2;
  const px1 = leaf.x1 * size - inset - 2;
  const py1 = leaf.y1 * size - inset - 2;
  if (px1 - px0 < 8 || py1 - py0 < 8) return;

  const step = Math.max(5, o.rivetSpacing * size);
  const r = Math.max(1.0, step * 0.17);
  const amp = 0.16;

  const dot = (cx, cy) => {
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
  };

  const nx = Math.max(2, Math.floor((px1 - px0) / step));
  const ny = Math.max(2, Math.floor((py1 - py0) / step));
  for (let i = 0; i <= nx; i++) {
    const x = px0 + (px1 - px0) * (i / nx);
    dot(x, py0); dot(x, py1);
  }
  for (let j = 1; j < ny; j++) {
    const y = py0 + (py1 - py0) * (j / ny);
    dot(px0, y); dot(px1, y);
  }
}

/**
 * The public generator. Produces the two maps the material registry needs from a
 * panel layout: a normal map and a packed ORM map.
 *
 * @param {Object} opts
 * @param {import('../../core/rng.js').RNG} opts.rng
 * @param {number} [opts.size]           texture resolution, 512 or 1024
 * @param {Object} [opts.surface]        { metalness, roughness, variance }
 * @param {number} [opts.normalStrength]
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
    // Seams are raw weld, so they are rougher and slightly less metallic.
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
