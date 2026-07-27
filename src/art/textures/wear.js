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
};

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
    for (let i = 0; i < n; i++) {
      // Bright where the plate lip is (edge proximity) but not down in the groove.
      const lip = panel.edge[i] * smoothstep(0.15, 0.45, panel.height[i]);
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
  const pit = new Float32Array(n);
  if (o.pit > 0) {
    const c1 = cellularField(rng.fork('wear-pit-a'), size, { cells: 26, jitter: 1.0, invert: true });
    const c2 = cellularField(rng.fork('wear-pit-b'), size, { cells: 52, jitter: 1.0, invert: true });
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
