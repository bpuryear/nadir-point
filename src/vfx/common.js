/**
 * VFX SHARED FOUNDATION.
 *
 * Three rules drive every file in this directory and they are worth stating once
 * rather than re-arguing per effect:
 *
 * 1. THE POST CHAIN MAKES THE GLOW, NOT US. `render/postfx.js` runs UnrealBloom at a
 *    threshold of 1.05 luminance over a HalfFloat linear buffer, then ACES. So the
 *    correct way to make something look hot is to WRITE A GENUINELY BRIGHT LINEAR
 *    VALUE - 8, 20, 40 - and let bloom find it. Drawing a soft glow sprite around a
 *    dull core is the thing that produces washed-out, low-contrast sci-fi VFX, and
 *    it is banned here. Every colour below is a palette hue multiplied hard.
 *
 *    (Materials render into the composer's render target, and three only applies
 *    in-material tone mapping when the target is the canvas. So a ShaderMaterial in
 *    this directory writes LINEAR values and must not tone map them itself.)
 *
 * 2. EVERYTHING IS ONE DRAW CALL PER EFFECT CLASS. Every system here is an
 *    `InstancedBufferGeometry` on a single `Mesh`, or a real `InstancedMesh` where
 *    lighting is needed. Nothing spawns an Object3D per event.
 *
 * 3. EVERYTHING RUNS ON SIM TIME. The time uniform is `engine.simTime + alpha*dt`,
 *    never wall clock. Pause freezes the battle including its explosions; 4x speeds
 *    them up. A VFX layer on wall clock would keep burning while the player is
 *    stopped reading a subsystem ring, which instantly reads as broken.
 *
 * COLOUR. Everything comes from `art/palette.js`. Fire is chemistry, not faction, so
 * explosions share one ramp (white-hot -> amber -> deep red -> carbon) regardless of
 * whose ship it was; faction identity is carried by tracers, beams and engine plumes.
 */

import * as THREE from 'three';
import { getFactionPalette, NEUTRAL, assertPaletteColor } from '../art/palette.js';

/**
 * Order bands, per ARCHITECTURE.md.
 *   fixedUpdate 80-99 : salvage, damage, cleanup  -> VFX simulation sits at 92
 *   render     200-299: VFX, audio
 */
export const VFX_ORDER = {
  sim: 92,       // explosion sequencing, debris integration, sustained emitters
  sample: 202,   // read sim state into GPU buffers (projectiles, beams, plumes)
  upload: 208,   // advance time uniforms, flush dirty ranges
};

/**
 * Linear-space HDR colour from a palette hex. Allocates a THREE.Color, so this is a
 * build-time call - never touch it inside an update.
 */
export function hdr(hex, intensity = 1, where = 'vfx') {
  assertPaletteColor(hex, where);
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(intensity);
}

/**
 * Stamp a material so `palette.auditMaterials` can tell a deliberate VFX shader from
 * somebody's stray `new THREE.MeshStandardMaterial`. The registry owns hull surfaces;
 * these are GPU-animated additive shaders it has no key for, and they carry palette
 * colours in through `hdr()` above. Same convention the material probe uses for its
 * own chrome.
 */
export function markVFXMaterial(material, name) {
  material.name = `vfx:${name}`;
  material.userData.__paletteKey = `vfx:${name}`;
  material.userData.materialKey = 'vfx';
  return material;
}

/**
 * A unit quad as raw attributes. Every billboard/ribbon system in here shares this
 * shape and differs only in what its vertex shader does with `position` and `uv`.
 * Built by hand rather than from PlaneGeometry so that no system can dispose a
 * geometry another system is still sharing attributes with.
 */
export function quadAttributes() {
  return {
    position: new THREE.BufferAttribute(new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
    ]), 3),
    uv: new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
    index: new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
  };
}

/** An instanced quad geometry with a bounding sphere that never culls. */
export function instancedQuad(capacity) {
  const q = quadAttributes();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(q.index);
  geo.setAttribute('position', q.position);
  geo.setAttribute('uv', q.uv);
  geo.instanceCount = capacity;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return geo;
}

/**
 * Partial upload of a run of instances across several parallel attributes.
 *
 * `attribute.updateRanges` is read LAZILY, at buffer-update time, not when you push
 * to it. So one shared `{start, count}` object handed to several attributes ends up
 * describing whichever attribute wrote to it last - and since an itemSize-3 attribute
 * and an itemSize-4 attribute need different offsets for the same instance range, that
 * silently uploads the wrong slice of the wrong buffer. It cost an afternoon; hence
 * one range object PER attribute, allocated once at construction.
 */
export class RangeUploader {
  /** @param {THREE.BufferAttribute[]} attributes indexed identically, one per instance */
  constructor(attributes) {
    this.attributes = attributes;
    this.ranges = attributes.map(() => ({ start: 0, count: 0 }));
  }

  /** Upload instances [lo, hi] inclusive. */
  upload(lo, hi) {
    if (hi < lo) return false;
    for (let i = 0; i < this.attributes.length; i++) {
      const attr = this.attributes[i];
      const r = this.ranges[i];
      r.start = lo * attr.itemSize;
      r.count = (hi - lo + 1) * attr.itemSize;
      attr.updateRanges.length = 0;
      attr.updateRanges.push(r);
      attr.needsUpdate = true;
    }
    return true;
  }
}

/** A RangeUploader plus a running dirty span, for ring-buffer style writers. */
export class DirtyRange {
  constructor(attributes) {
    this.lo = Infinity;
    this.hi = -Infinity;
    this.uploader = new RangeUploader(attributes);
  }

  touch(i) {
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  flush() {
    if (this.hi < this.lo) return false;
    this.uploader.upload(this.lo, this.hi);
    this.lo = Infinity;
    this.hi = -Infinity;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Palette-derived colour sets
// ---------------------------------------------------------------------------

/**
 * Faction identity for weapons and drives. Intensities are chosen against the 1.05
 * bloom threshold: a tracer core at 18 blooms into a hard streak, a plume body at 3
 * blooms only where it is dense.
 */
export function factionVFX(factionId) {
  const p = getFactionPalette(factionId);
  return {
    id: factionId,
    tracer: hdr(p.emissive, 2.8, `vfx.tracer.${factionId}`),
    tracerHot: hdr(p.emissiveHot, 5.0, `vfx.tracerHot.${factionId}`),
    beam: hdr(p.emissive, 3.0, `vfx.beam.${factionId}`),
    lance: hdr(p.emissiveHot, 4.0, `vfx.lance.${factionId}`),
    muzzle: hdr(p.emissiveHot, 6.0, `vfx.muzzle.${factionId}`),
    engine: hdr(p.engine, 2.9, `vfx.engine.${factionId}`),
    engineHot: hdr(p.emissiveHot, 4.0, `vfx.engineHot.${factionId}`),
    warn: hdr(p.warn, 3.0, `vfx.warn.${factionId}`),
    shield: hdr(NEUTRAL.shieldHit, 1.9, `vfx.shield.${factionId}`),
  };
}

export const FACTION_ORDER = ['coalition', 'concord', 'derelict', 'player'];

/**
 * Fire. One ramp for every explosion in the game.
 *
 * `core` is deliberately enormous. A capital ship detonation has to punch through
 * ACES at the frame's brightest point, and ACES rolls off hard - 26 linear lands as
 * clipped white with a wide bloom skirt, which is exactly the read we want.
 */
export const FIRE = {
  core: hdr(0xf4fbff, 8.0, 'vfx.fire.core'),        // player.emissiveHot, white-hot
  hot: hdr(0xffc978, 4.5, 'vfx.fire.hot'),          // coalition.emissiveHot
  body: hdr(0xff6a12, 2.4, 'vfx.fire.body'),         // coalition.engine, amber
  edge: hdr(0xff3a18, 1.4, 'vfx.fire.edge'),         // coalition.warn, deep red
  smoke: hdr(NEUTRAL.scorchRim, 0.30, 'vfx.fire.smoke'),
  spark: hdr(0xffc978, 6.0, 'vfx.fire.spark'),
  slag: hdr(0xc4671b, 3.5, 'vfx.fire.slag'),        // coalition.trim
  vent: hdr(NEUTRAL.ice, 0.75, 'vfx.fire.vent'),
  ventHot: hdr(0xd6f6ff, 2.0, 'vfx.fire.ventHot'),   // concord.emissiveHot
  salvage: hdr(NEUTRAL.salvage, 3.0, 'vfx.fire.salvage'),
  salvageHot: hdr(NEUTRAL.salvage, 6.0, 'vfx.fire.salvageHot'),
  mining: hdr(0xffa93c, 3.0, 'vfx.fire.mining'),     // yard accent, industrial amber
};

// ---------------------------------------------------------------------------
// Small shared maths, all zero-allocation
// ---------------------------------------------------------------------------

/** A ship's forward unit vector, written into `out`. Works for both body types. */
export function shipForward(ship, out) {
  if (ship.planeLocked || ship.body?.heading !== undefined) {
    const h = ship.body?.heading ?? 0;
    return out.set(Math.sin(h), 0, Math.cos(h));
  }
  return out.set(0, 0, 1).applyQuaternion(ship.body.quaternion);
}

/** Transform a hull-local offset to world space, written into `out`. */
export function shipLocalToWorld(ship, lx, ly, lz, out) {
  if (ship.body?.quaternion && !ship.planeLocked) {
    out.set(lx, ly, lz).applyQuaternion(ship.body.quaternion).add(ship.position);
    return out;
  }
  const h = ship.body?.heading ?? 0;
  const s = Math.sin(h), c = Math.cos(h);
  return out.set(
    ship.position.x + lx * c + lz * s,
    ship.position.y + ly,
    ship.position.z + lz * c - lx * s,
  );
}

/** Radius of a hull, tolerant of half-built ships in probes and tests. */
export function hullRadius(ship) {
  return ship?.radius ?? ship?.body?.radius ?? (ship?.classDef?.length ?? 200) * 0.42;
}
