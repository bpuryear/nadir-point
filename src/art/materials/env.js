/**
 * PROCEDURAL ENVIRONMENT MAPS.
 *
 * A metal surface with no environment is black. That is physically correct and
 * visually useless: the whole reason metal reads as metal is that it shows you a
 * distorted picture of its surroundings. In vacuum that picture is mostly nothing,
 * a hard sun, and one enormous coloured object - which is exactly what this builds.
 *
 * The map is a small equirectangular half-float image built from the POI palette
 * (zenith / horizon / ground / sun), then run through PMREM so roughness-correct
 * mip selection works. 128x64 is enough: it is only ever seen as a blurred
 * reflection, and PMREM's own filtering dominates the result.
 *
 * The lighting stream owns real lighting. This exists so that materials look
 * correct in isolation and so a POI that has not shipped its IBL yet still renders
 * believable metal rather than black spheres.
 */

import * as THREE from 'three';
import { getPOIPalette } from '../palette.js';

const WIDTH = 128;
const HEIGHT = 64;

function toHalf(v) { return THREE.DataUtils.toHalfFloat(Math.min(65504, Math.max(0, v))); }

/**
 * Equirectangular sky from an ibl spec.
 * @returns {THREE.DataTexture}
 */
export function equirectFromPalette(ibl, { width = WIDTH, height = HEIGHT, sunDir = null } = {}) {
  const zenith = new THREE.Color().setHex(ibl.zenith, THREE.SRGBColorSpace);
  const horizon = new THREE.Color().setHex(ibl.horizon, THREE.SRGBColorSpace);
  const ground = new THREE.Color().setHex(ibl.ground, THREE.SRGBColorSpace);
  const sun = new THREE.Color().setHex(ibl.sun, THREE.SRGBColorSpace);
  const gain = ibl.intensity ?? 1;

  // Default sun placement matches the probe/POI key direction closely enough that
  // the specular highlight and the key light agree about where the light is.
  const sd = sunDir ?? new THREE.Vector3(-0.72, 0.42, 0.55).normalize();
  const cosSize = Math.cos(Math.max(0.02, ibl.sunSize ?? 0.06) * Math.PI);

  const data = new Uint16Array(width * height * 4);
  const dir = new THREE.Vector3();

  for (let y = 0; y < height; y++) {
    const theta = (y + 0.5) / height * Math.PI;       // 0 at +Y
    const sy = Math.cos(theta);
    const st = Math.sin(theta);
    for (let x = 0; x < width; x++) {
      const phi = (x + 0.5) / width * Math.PI * 2;
      dir.set(st * Math.cos(phi), sy, st * Math.sin(phi));

      const h = dir.y;
      const up = smooth(0, 0.55, h);
      const down = smooth(0, -0.45, h);
      let r = horizon.r + (zenith.r - horizon.r) * up;
      let g = horizon.g + (zenith.g - horizon.g) * up;
      let b = horizon.b + (zenith.b - horizon.b) * up;
      r += (ground.r - r) * down;
      g += (ground.g - g) * down;
      b += (ground.b - b) * down;

      // The sun. Small, very bright: this is what puts a hard specular dot on a
      // sphere and what makes brushed metal look brushed.
      const d = dir.dot(sd);
      if (d > cosSize) {
        const t = (d - cosSize) / (1 - cosSize);
        const k = 60 * gain * (0.35 + t * 0.65);
        r += sun.r * k; g += sun.g * k; b += sun.b * k;
      } else if (d > cosSize - 0.25) {
        // A soft corona so roughness 0.4 surfaces get a broad highlight, not a dot.
        const t = (d - (cosSize - 0.25)) / 0.25;
        const k = 2.2 * gain * t * t;
        r += sun.r * k; g += sun.g * k; b += sun.b * k;
      }

      const o = (y * width + x) * 4;
      data[o] = toHalf(r * gain);
      data[o + 1] = toHalf(g * gain);
      data[o + 2] = toHalf(b * gain);
      data[o + 3] = toHalf(1);
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  tex.name = 'poi-equirect';
  return tex;
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}

/**
 * Cache of PMREM environments, one per POI. Owns its GPU resources; dispose with
 * the registry.
 */
export class EnvironmentCache {
  constructor(gl) {
    this.gl = gl ?? null;
    this.pmrem = null;
    this.map = new Map();
    this.sources = new Map();
  }

  /** @returns {THREE.Texture|null} PMREM-filtered environment, or null with no GL. */
  get(poiId) {
    if (this.map.has(poiId)) return this.map.get(poiId);
    const pal = getPOIPalette(poiId);
    const src = equirectFromPalette(pal.ibl);
    this.sources.set(poiId, src);

    let out = null;
    if (this.gl) {
      try {
        if (!this.pmrem) {
          this.pmrem = new THREE.PMREMGenerator(this.gl);
          this.pmrem.compileEquirectangularShader();
        }
        const rt = this.pmrem.fromEquirectangular(src);
        out = rt.texture;
        out.name = `env:${poiId}`;
      } catch (err) {
        console.warn('[materials] PMREM unavailable, falling back to raw equirect', err);
        out = src;
      }
    } else {
      out = src;
    }
    this.map.set(poiId, out);
    return out;
  }

  dispose() {
    for (const t of this.map.values()) t?.dispose?.();
    for (const t of this.sources.values()) t?.dispose?.();
    this.map.clear();
    this.sources.clear();
    this.pmrem?.dispose?.();
    this.pmrem = null;
  }
}
