/**
 * GREEBLE / DETAIL RELIEF.
 *
 * Hatches, louvred vents, conduit runs, junction boxes. Everything here is a small
 * mechanical object with a purpose you could name, at a density low enough that
 * you can still count them. That is the whole discipline: greeble that reads as
 * "lots of stuff" is noise, greeble that reads as "an access hatch, a vent, a cable
 * run" is scale.
 *
 * Output is a height field plus a normal map and a coverage mask. The mask is what
 * lets the hull composer make greebled areas slightly dirtier and slightly less
 * painted without a second texture fetch.
 */

import {
  makeCanvas, ctx2d, canvasToField, blurField, heightToNormalBytes,
  bytesToCanvas, canvasTexture, drawWrapped, roundRect, saturate01,
} from './canvas2d.js';

export const GREEBLE_DEFAULTS = {
  size: 512,
  density: 1.0,      // multiplier on feature count
  scale: 1.0,        // multiplier on feature size
  vents: true,
  conduits: true,
  hatches: true,
  amplitude: 1.0,
};

const GREY = (v) => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;

/** A louvred vent: recessed frame with raised slats. */
function vent(ctx, x, y, w, h, slats, vertical) {
  ctx.fillStyle = GREY(0.30);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = GREY(0.72);
  const n = Math.max(2, slats);
  if (vertical) {
    const s = w / n;
    for (let i = 0; i < n; i++) ctx.fillRect(x + i * s + s * 0.22, y + h * 0.10, s * 0.56, h * 0.80);
  } else {
    const s = h / n;
    for (let i = 0; i < n; i++) ctx.fillRect(x + w * 0.10, y + i * s + s * 0.22, w * 0.80, s * 0.56);
  }
  ctx.strokeStyle = GREY(0.20);
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeRect(x, y, w, h);
}

/** An access hatch: raised plate, recessed seam, four bolts. */
function hatch(ctx, x, y, w, h, r) {
  ctx.fillStyle = GREY(0.26);
  roundRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 2); ctx.fill();
  ctx.fillStyle = GREY(0.74);
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.fillStyle = GREY(0.42);
  roundRect(ctx, x + w * 0.16, y + h * 0.16, w * 0.68, h * 0.68, r * 0.6); ctx.fill();
  const b = Math.max(1.2, Math.min(w, h) * 0.07);
  ctx.fillStyle = GREY(0.92);
  for (const [bx, by] of [[0.10, 0.10], [0.90, 0.10], [0.10, 0.90], [0.90, 0.90]]) {
    ctx.beginPath();
    ctx.arc(x + w * bx, y + h * by, b, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A conduit run: raised pipe with clamps at intervals. */
function conduit(ctx, x, y, len, thick, horizontal) {
  const w = horizontal ? len : thick;
  const h = horizontal ? thick : len;
  ctx.fillStyle = GREY(0.34);
  ctx.fillRect(x - thick * 0.28, y - thick * 0.28, w + thick * 0.56, h + thick * 0.56);
  ctx.fillStyle = GREY(0.78);
  roundRect(ctx, x, y, w, h, thick * 0.45); ctx.fill();
  ctx.fillStyle = GREY(0.94);
  if (horizontal) ctx.fillRect(x, y + thick * 0.30, w, thick * 0.22);
  else ctx.fillRect(x + thick * 0.30, y, thick * 0.22, h);

  const step = thick * 3.4;
  ctx.fillStyle = GREY(0.50);
  for (let d = step * 0.5; d < len; d += step) {
    if (horizontal) ctx.fillRect(x + d, y - thick * 0.22, thick * 0.42, thick * 1.44);
    else ctx.fillRect(x - thick * 0.22, y + d, thick * 1.44, thick * 0.42);
  }
}

/** A junction box: small hard block. */
function box(ctx, x, y, w, h) {
  ctx.fillStyle = GREY(0.28);
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = GREY(0.82);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = GREY(0.44);
  ctx.fillRect(x + w * 0.2, y + h * 0.55, w * 0.6, h * 0.3);
}

/**
 * Build the greeble height field on a canvas (0.5 = flat hull).
 * @param {import('../../core/rng.js').RNG} rng
 */
export function greebleCanvas(rng, opts = {}) {
  const o = { ...GREEBLE_DEFAULTS, ...opts };
  const size = o.size;
  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = GREY(0.5);
  ctx.fillRect(0, 0, size, size);

  const S = size / 512;
  const place = (fn) => {
    const x = rng.next() * size;
    const y = rng.next() * size;
    drawWrapped(ctx, size, (c) => fn(c, x, y));
  };

  if (o.hatches) {
    const n = Math.round(5 * o.density);
    for (let i = 0; i < n; i++) {
      const w = (26 + rng.next() * 44) * S * o.scale;
      const h = w * (0.6 + rng.next() * 0.8);
      place((c, x, y) => hatch(c, x, y, w, h, Math.min(w, h) * 0.14));
    }
  }
  if (o.vents) {
    const n = Math.round(4 * o.density);
    for (let i = 0; i < n; i++) {
      const w = (24 + rng.next() * 40) * S * o.scale;
      const h = (14 + rng.next() * 26) * S * o.scale;
      const vertical = rng.bool(0.4);
      place((c, x, y) => vent(c, x, y, w, h, rng.int(3, 6), vertical));
    }
  }
  if (o.conduits) {
    const n = Math.round(3 * o.density);
    for (let i = 0; i < n; i++) {
      const len = (70 + rng.next() * 190) * S * o.scale;
      const thick = (4 + rng.next() * 5) * S * o.scale;
      const horizontal = rng.bool(0.55);
      place((c, x, y) => conduit(c, x, y, len, thick, horizontal));
    }
  }
  const nb = Math.round(6 * o.density);
  for (let i = 0; i < nb; i++) {
    const w = (7 + rng.next() * 16) * S * o.scale;
    const h = (6 + rng.next() * 12) * S * o.scale;
    place((c, x, y) => box(c, x, y, w, h));
  }

  return canvas;
}

/**
 * Height + mask + normal for the greeble layer.
 * @returns {{height:Float32Array, mask:Float32Array, size:number, normal:THREE.Texture}}
 */
export function greebleMap(opts = {}) {
  const o = { ...GREEBLE_DEFAULTS, ...opts };
  const { rng } = o;
  if (!rng) throw new Error('[greebleMap] needs an rng');
  const size = o.size;
  const canvas = greebleCanvas(rng, o);
  let height = canvasToField(canvas, size);
  height = blurField(height, size, 1, 1); // kill single-pixel aliasing, keep the edges

  const mask = new Float32Array(size * size);
  for (let i = 0; i < mask.length; i++) mask[i] = saturate01(Math.abs(height[i] - 0.5) * 4);

  return {
    height, mask, size,
    normal: canvasTexture(bytesToCanvas(heightToNormalBytes(height, size, o.amplitude), size), { name: 'greeble-normal' }),
  };
}

/**
 * Just the tangent-space detail normal, for surfaces that want relief without the
 * albedo/roughness consequences (interiors of recesses, structural members).
 */
export function detailNormal(opts = {}) {
  return greebleMap(opts).normal;
}
