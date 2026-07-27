/**
 * RUNNING LIGHTS - the mandatory scale cue.
 *
 * A player cannot see that a hull is 1.4 km long. There is no horizon, no
 * atmosphere, no tree. The only thing that communicates size in vacuum is a
 * repeating feature at a size the player already believes, and running lights are
 * the cheapest and most legible one available.
 *
 * So the spacing is a CONSTANT, in metres, shared by every hull in the game:
 *
 *     RUNNING_LIGHT_SPACING_M = 6
 *
 * Six metres is roughly a first-floor window ledge. Put lights on a fighter and you
 * get two of them. Put the same strip on the cruiser and you get two hundred and
 * thirty, and the ship reads as enormous without a single number on screen.
 *
 * Every LIGHTS_PER_TILE-th light is a brighter beacon. That is still a constant
 * spacing (48 m), so it adds rhythm without lying about scale.
 *
 * DO NOT change the spacing per ship, per faction or per POI. If a hull needs
 * fewer lights, use a shorter strip.
 */

import * as THREE from 'three';
import { makeCanvas, ctx2d, canvasTexture, css, roundRect } from './canvas2d.js';
import { getFactionPalette } from '../palette.js';

export const RUNNING_LIGHT_SPACING_M = 6;
export const LIGHTS_PER_TILE = 8;
/** Metres of hull one texture repeat covers along the strip. */
export const RUNNING_LIGHT_TILE_M = RUNNING_LIGHT_SPACING_M * LIGHTS_PER_TILE;

export const RUNNING_LIGHT_DEFAULTS = {
  faction: 'player',
  cell: 64,        // px per light. tile width = cell * LIGHTS_PER_TILE
  height: 32,      // px
  beacon: true,
};

/**
 * Emissive strip. RGB carries the light colour, alpha carries coverage, so the
 * material can run additive (glow only) or alpha-blended (housing visible).
 *
 * @returns {{texture:THREE.Texture, canvas:HTMLCanvasElement, spacingM:number, tileM:number}}
 */
export function runningLights(opts = {}) {
  const o = { ...RUNNING_LIGHT_DEFAULTS, ...opts };
  const pal = getFactionPalette(o.faction);
  const w = o.cell * LIGHTS_PER_TILE;
  const h = o.height;
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < LIGHTS_PER_TILE; i++) {
    const cx = (i + 0.5) * o.cell;
    const cy = h * 0.5;
    const isBeacon = o.beacon && i === 0;
    const rGlow = (isBeacon ? 0.62 : 0.40) * o.cell;
    const lampW = (isBeacon ? 0.20 : 0.12) * o.cell;
    const lampH = h * (isBeacon ? 0.46 : 0.30);

    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rGlow);
    halo.addColorStop(0.0, css(pal.emissiveHot, isBeacon ? 0.95 : 0.8));
    halo.addColorStop(0.22, css(pal.emissive, isBeacon ? 0.72 : 0.5));
    halo.addColorStop(0.55, css(pal.emissive, 0.16));
    halo.addColorStop(1.0, css(pal.emissive, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, rGlow, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = css(pal.emissiveHot, 1);
    roundRect(ctx, cx - lampW * 0.5, cy - lampH * 0.5, lampW, lampH, lampW * 0.4);
    ctx.fill();
  }

  const texture = canvasTexture(canvas, { srgb: true, name: `running-lights:${o.faction}` });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return {
    texture, canvas,
    spacingM: RUNNING_LIGHT_SPACING_M,
    tileM: RUNNING_LIGHT_TILE_M,
    /** Repeat count for a strip of this length, so spacing stays honest. */
    repeatFor: (lengthM) => lengthM / RUNNING_LIGHT_TILE_M,
  };
}

/**
 * A single soft emissive dot. Used for viewport glows, sensor eyes, and by the VFX
 * stream for sprite-based lights. Kept here so there is exactly one place in the
 * game that decides what a point of light looks like.
 */
export function glowSprite(opts = {}) {
  const { faction = 'player', size = 128, color = null, falloff = 2.2 } = opts;
  const pal = getFactionPalette(faction);
  const hot = color ?? pal.emissiveHot;
  const warm = color ?? pal.emissive;
  const canvas = makeCanvas(size);
  const ctx = ctx2d(canvas);
  const c = size * 0.5;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = Math.pow(1 - t, falloff);
    g.addColorStop(t, css(t < 0.18 ? hot : warm, a));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = canvasTexture(canvas, { srgb: true, name: `glow:${faction}` });
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return { texture, canvas };
}
