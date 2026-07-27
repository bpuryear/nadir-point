/**
 * BATTLE DAMAGE.
 *
 * A hit does three things to a surface and they need to be separated or it looks
 * like a sticker:
 *
 *   1. Carbon deposits. Near-black, opaque at the centre, feathered out, with
 *      directional spatter tendrils from the blast.
 *   2. The coating burns back before the metal does, so there is a ring of
 *      oxidised bare metal just outside the carbon - the "bloom". Without it the
 *      scorch has no edge and reads as a smudge.
 *   3. The surface response changes: roughness up, metalness down where the
 *      carbon sits, and up again in the bloom where bare metal is exposed.
 *
 * Composability is the point. A hardpoint takes a hit at a known UV, and the hull's
 * albedo and ORM canvases get stamped in place and re-uploaded. Stamps are built
 * once per (seed, severity) and reused, so a hundred hits cost a hundred
 * drawImage calls, not a hundred procedural bakes.
 */

import * as THREE from 'three';
import { makeCanvas, ctx2d, canvasTexture, css, saturate01, lerp } from './canvas2d.js';
import { NEUTRAL, getFactionPalette } from '../palette.js';

export const SCORCH_DEFAULTS = {
  size: 256,
  severity: 0.6,
  faction: 'player',
};

/**
 * Build the three stamp layers for one blast.
 * @returns {{albedo:HTMLCanvasElement, ormMul:HTMLCanvasElement, ormAdd:HTMLCanvasElement, size:number}}
 */
export function makeScorchStamp(rng, opts = {}) {
  const o = { ...SCORCH_DEFAULTS, ...opts };
  const size = o.size;
  const sev = saturate01(o.severity);
  const pal = getFactionPalette(o.faction);
  const c = size * 0.5;

  const core = lerp(0.16, 0.34, sev) * size;   // opaque carbon
  const soot = lerp(0.30, 0.48, sev) * size;   // feathered halo
  const bloom = core * lerp(1.10, 1.30, sev);

  // ---------- albedo ----------
  const albedo = makeCanvas(size);
  const a = ctx2d(albedo);
  a.clearRect(0, 0, size, size);

  // spatter tendrils first, so the core covers their roots
  const spokes = 9 + Math.round(sev * 13);
  for (let i = 0; i < spokes; i++) {
    const ang = (i / spokes) * Math.PI * 2 + rng.next() * 0.4;
    const len = soot * (0.75 + rng.next() * 1.05);
    const wid = (0.05 + rng.next() * 0.09) * size * (0.5 + sev * 0.8);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const g = a.createLinearGradient(c, c, c + ca * len, c + sa * len);
    g.addColorStop(0, css(NEUTRAL.scorchCore, 0.85 * sev + 0.1));
    g.addColorStop(0.55, css(NEUTRAL.scorchCore, 0.28 * sev));
    g.addColorStop(1, css(NEUTRAL.scorchCore, 0));
    // Built in world space rather than with a transform, so the gradient (which is
    // resolved against the current CTM at paint time) stays aligned with the wedge.
    const pt = (fwd, side) => [c + ca * fwd - sa * side, c + sa * fwd + ca * side];
    const p0 = pt(0, -wid * 0.5), p1 = pt(len, -wid * 0.12);
    const p2 = pt(len, wid * 0.12), p3 = pt(0, wid * 0.5);
    a.fillStyle = g;
    a.beginPath();
    a.moveTo(p0[0], p0[1]);
    a.lineTo(p1[0], p1[1]);
    a.lineTo(p2[0], p2[1]);
    a.lineTo(p3[0], p3[1]);
    a.closePath();
    a.fill();
  }

  // oxidised bloom ring
  const ring = a.createRadialGradient(c, c, core * 0.85, c, c, bloom * 1.25);
  ring.addColorStop(0, css(pal.bare, 0));
  ring.addColorStop(0.35, css(NEUTRAL.scorchRim, 0.55 * sev + 0.15));
  ring.addColorStop(0.7, css(pal.wear.oxide, 0.30 * sev));
  ring.addColorStop(1, css(pal.wear.oxide, 0));
  a.fillStyle = ring;
  a.beginPath(); a.arc(c, c, bloom * 1.25, 0, Math.PI * 2); a.fill();

  // soot halo
  const halo = a.createRadialGradient(c, c, core * 0.5, c, c, soot);
  halo.addColorStop(0, css(pal.burn, 0.9 * sev + 0.05));
  halo.addColorStop(0.5, css(pal.burn, 0.42 * sev));
  halo.addColorStop(1, css(pal.burn, 0));
  a.fillStyle = halo;
  a.beginPath(); a.arc(c, c, soot, 0, Math.PI * 2); a.fill();

  // carbon core
  const cg = a.createRadialGradient(c, c, 0, c, c, core);
  cg.addColorStop(0, css(NEUTRAL.scorchCore, 0.55 + 0.44 * sev));
  cg.addColorStop(0.62, css(NEUTRAL.scorchCore, 0.45 + 0.4 * sev));
  cg.addColorStop(1, css(NEUTRAL.scorchCore, 0));
  a.fillStyle = cg;
  a.beginPath(); a.arc(c, c, core, 0, Math.PI * 2); a.fill();

  // spatter dots - a few, hard-edged, so the eye has something to focus on
  const dots = 10 + Math.round(sev * 22);
  for (let i = 0; i < dots; i++) {
    const ang = rng.next() * Math.PI * 2;
    const r = core * (0.9 + rng.next() * 1.9);
    if (r > size * 0.48) continue;
    const rr = (0.006 + rng.next() * 0.018) * size;
    a.fillStyle = css(NEUTRAL.scorchCore, 0.35 + rng.next() * 0.5 * sev);
    a.beginPath();
    a.arc(c + Math.cos(ang) * r, c + Math.sin(ang) * r, rr, 0, Math.PI * 2);
    a.fill();
  }

  // ---------- ORM multiply layer: darken AO (R) and metalness (B) ----------
  const ormMul = makeCanvas(size);
  const m = ctx2d(ormMul);
  const mg = m.createRadialGradient(c, c, 0, c, c, soot);
  mg.addColorStop(0, `rgba(70,255,40,${0.55 + 0.4 * sev})`);
  mg.addColorStop(0.45, `rgba(120,255,90,${0.4 * sev + 0.1})`);
  mg.addColorStop(1, 'rgba(255,255,255,0)');
  m.fillStyle = mg;
  m.beginPath(); m.arc(c, c, soot, 0, Math.PI * 2); m.fill();

  // ---------- ORM additive layer: raise roughness (G) ----------
  const ormAdd = makeCanvas(size);
  const d = ctx2d(ormAdd);
  const dg = d.createRadialGradient(c, c, 0, c, c, soot);
  dg.addColorStop(0, `rgba(0,${Math.round(110 * (0.4 + sev))},0,1)`);
  dg.addColorStop(0.55, `rgba(0,${Math.round(70 * (0.4 + sev))},0,1)`);
  dg.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = dg;
  d.beginPath(); d.arc(c, c, soot, 0, Math.PI * 2); d.fill();

  return { albedo, ormMul, ormAdd, size };
}

/**
 * The named generator. A standalone scorch decal texture with alpha, for VFX and
 * for debris that spawns already burnt.
 */
export function scorch(opts = {}) {
  const o = { ...SCORCH_DEFAULTS, ...opts };
  if (!o.rng) throw new Error('[scorch] needs an rng');
  const stamp = makeScorchStamp(o.rng, o);
  const t = canvasTexture(stamp.albedo, { srgb: true, name: 'scorch' });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { texture: t, stamp, canvas: stamp.albedo, size: stamp.size };
}

/**
 * Stamp a blast onto live hull maps. Wraps across the tile border so a hit near a
 * seam does not get clipped.
 *
 * @param {Object} p
 * @param {CanvasRenderingContext2D} p.albedoCtx
 * @param {CanvasRenderingContext2D} [p.ormCtx]
 * @param {number} p.size        map resolution
 * @param {number} p.u           0..1
 * @param {number} p.v           0..1, in TEXTURE space (v=0 is canvas row 0)
 * @param {number} p.radius      0..1 fraction of the tile
 * @param {Object} p.stamp       from makeScorchStamp
 * @param {number} [p.rotation]  radians
 */
export function applyScorchStamp({ albedoCtx, ormCtx, size, u, v, radius, stamp, rotation = 0 }) {
  const px = u * size;
  const py = v * size;
  const d = Math.max(8, radius * size * 2);

  const blit = (ctx, img, op) => {
    if (!ctx || !img) return;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = op;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = px + ox * size;
        const cy = py + oy * size;
        if (cx < -d || cx > size + d || cy < -d || cy > size + d) continue;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.drawImage(img, -d * 0.5, -d * 0.5, d, d);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = prev;
  };

  blit(albedoCtx, stamp.albedo, 'source-over');
  blit(ormCtx, stamp.ormMul, 'multiply');
  blit(ormCtx, stamp.ormAdd, 'lighter');
}
