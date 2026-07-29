/**
 * MODULE SUB-PARTS.
 *
 * A cannon bank is not one HP bar. It is barrels, a feed, a traverse ring and the pad
 * it is bolted to, and each of those fails in a different, legible way:
 *
 *   kill the BARRELS   -> the gun is inert
 *   kill the FEED      -> it fires at a third of the rate and reloads by hand
 *   kill the TRAVERSE  -> the arc freezes; the gun can no longer track, only the ship can
 *   kill the COOLING   -> it cooks itself in half the time
 *   kill the MOUNT     -> THE MODULE FALLS OFF, INTACT, AND YOU GO AND PICK IT UP
 *
 * That last row is the reason this system is worth building. It converts subsystem
 * targeting from a damage optimisation into a shopping mechanic, and it is the single
 * strongest expression of this game's premise: the enemy is carrying the upgrade, and
 * how you shoot at them decides whether you get it.
 *
 * Budget is 2..4 parts per module (enforced in contracts.js), because above four the
 * targeting ring becomes the fiddly thing the research warns about.
 */

import * as THREE from 'three';
import { PART_KINDS } from '../core/contracts.js';

export { PART_KINDS };

/** Multipliers each failure applies. All of them modify a value that already existed. */
export const PART_EFFECT = {
  feedFireRate: 0.35,
  feedReload: 3.5,
  coolingRate: 0.45,
  /** Radians of residual slop a frozen traverse ring keeps. */
  traverseFrozenArc: 0.07,
};

/**
 * Default part layout by weapon archetype, used when a ModuleDef does not declare its
 * own `parts`. Every weapon in the game gets sub-parts without any content change; a
 * module author overrides only when the geometry demands different anchors.
 *
 * Offsets are ship-local metres relative to the mount anchor. Modules project at least
 * 55 m beyond the bare hull (ship-language.md §6), so these anchors sit on geometry that
 * genuinely exists rather than inside the hull where the player cannot aim at them.
 */
const LAYOUTS = {
  cannon: [
    { id: 'barrels', label: 'BARRELS', kind: 'output', hpShare: 0.34, offset: [0, 2, 22], radius: 13, salvageValue: 0.35 },
    { id: 'feed', label: 'FEED', kind: 'feed', hpShare: 0.26, offset: [0, -4, -6], radius: 11, salvageValue: 0.2 },
    { id: 'ring', label: 'TRAVERSE RING', kind: 'traverse', hpShare: 0.22, offset: [0, -8, 4], radius: 12, salvageValue: 0.15 },
    { id: 'pad', label: 'MOUNT PAD', kind: 'mount', hpShare: 0.18, offset: [0, -13, -2], radius: 10, salvageValue: 0.3 },
  ],
  rail: [
    { id: 'rails', label: 'RAIL ASSEMBLY', kind: 'output', hpShare: 0.36, offset: [0, 3, 30], radius: 14, salvageValue: 0.4 },
    { id: 'capacitor', label: 'CAPACITOR', kind: 'feed', hpShare: 0.24, offset: [0, -3, -10], radius: 12, salvageValue: 0.2 },
    { id: 'ring', label: 'TRAVERSE RING', kind: 'traverse', hpShare: 0.2, offset: [0, -9, 2], radius: 12, salvageValue: 0.12 },
    { id: 'pad', label: 'MOUNT PAD', kind: 'mount', hpShare: 0.2, offset: [0, -14, -4], radius: 10, salvageValue: 0.28 },
  ],
  beam: [
    { id: 'emitter', label: 'EMITTER HEAD', kind: 'output', hpShare: 0.32, offset: [0, 4, 20], radius: 12, salvageValue: 0.4 },
    { id: 'radiator', label: 'RADIATOR FINS', kind: 'cooling', hpShare: 0.26, offset: [0, 10, -8], radius: 14, salvageValue: 0.15 },
    { id: 'gimbal', label: 'GIMBAL', kind: 'traverse', hpShare: 0.2, offset: [0, -6, 2], radius: 10, salvageValue: 0.15 },
    { id: 'pad', label: 'MOUNT PAD', kind: 'mount', hpShare: 0.22, offset: [0, -13, -4], radius: 10, salvageValue: 0.3 },
  ],
  missile: [
    { id: 'cells', label: 'LAUNCH CELLS', kind: 'output', hpShare: 0.38, offset: [0, 6, 8], radius: 15, salvageValue: 0.35 },
    { id: 'loader', label: 'LOADER', kind: 'feed', hpShare: 0.3, offset: [0, -4, -12], radius: 12, salvageValue: 0.25 },
    { id: 'pad', label: 'MOUNT PAD', kind: 'mount', hpShare: 0.32, offset: [0, -12, -2], radius: 10, salvageValue: 0.3 },
  ],
  pd: [
    { id: 'barrels', label: 'BARRELS', kind: 'output', hpShare: 0.4, offset: [0, 3, 8], radius: 7, salvageValue: 0.4 },
    { id: 'gimbal', label: 'GIMBAL', kind: 'traverse', hpShare: 0.28, offset: [0, -3, 0], radius: 6, salvageValue: 0.2 },
    { id: 'pad', label: 'MOUNT PAD', kind: 'mount', hpShare: 0.32, offset: [0, -7, -2], radius: 6, salvageValue: 0.3 },
  ],
};
LAYOUTS.lance = LAYOUTS.beam;
LAYOUTS.mining = LAYOUTS.beam;
LAYOUTS.flak = LAYOUTS.pd;

/** The layout for a weapon: declared parts win, archetype default otherwise. */
export function partsFor(weaponDef, moduleDef = null) {
  if (moduleDef?.parts?.length) return moduleDef.parts;
  return LAYOUTS[weaponDef?.type] ?? LAYOUTS.cannon;
}

/** One live sub-part. Positions are cached buffers; nothing here allocates per step. */
class ModulePart {
  constructor(def, containerHP) {
    this.def = def;
    this.id = def.id;
    this.label = def.label ?? def.id;
    this.kind = def.kind;
    this.maxHP = Math.max(1, containerHP * (def.hpShare ?? 0.25));
    this.hp = this.maxHP;
    this.destroyed = false;
    this.localOffset = new THREE.Vector3(...(def.offset ?? [0, 0, 0]));
    this.worldPosition = new THREE.Vector3();
    this.radius = def.radius ?? 10;
  }

  get health() { return this.maxHP > 0 ? this.hp / this.maxHP : 0; }
}

/**
 * The live sub-part set for one weapon mount.
 *
 * Consequences are cached as multipliers rather than recomputed at every read, because
 * combat asks for them once per mount per step and a branch chain there is a waste.
 */
export class ModuleParts {
  /**
   * @param {Object} mount        the WeaponMount that owns them
   * @param {Array} defs          PartDef[]
   * @param {number} containerHP  the HP pool the parts divide up
   */
  constructor(mount, defs, containerHP) {
    this.mount = mount;
    /** @type {ModulePart[]} */
    this.list = [];
    for (const def of defs) {
      if (!PART_KINDS.includes(def.kind)) continue;
      this.list.push(new ModulePart(def, containerHP));
    }
    this.fireRateMul = 1;
    this.reloadMul = 1;
    this.coolingMul = 1;
    this.traverseFrozen = false;
    this.frozenAt = 0;
    this.inert = false;
    this.detached = false;
    this._report = [];
  }

  get(id) {
    for (const p of this.list) if (p.id === id) return p;
    return null;
  }

  /** World positions for the second-tier aim ring. Called from Ship.fixedUpdate. */
  updateWorld(mountWorldPosition, heading) {
    const s = Math.sin(heading), c = Math.cos(heading);
    for (const p of this.list) {
      const { x, y, z } = p.localOffset;
      p.worldPosition.set(
        mountWorldPosition.x + x * c + z * s,
        mountWorldPosition.y + y,
        mountWorldPosition.z + z * c - x * s,
      );
    }
  }

  /** Nearest part to an impact point, or null when the hit was not on a part. */
  nearest(point) {
    let best = null;
    let bestD2 = Infinity;
    for (const p of this.list) {
      if (p.destroyed) continue;
      const d2 = p.worldPosition.distanceToSquared(point);
      if (d2 < p.radius * p.radius * 4 && d2 < bestD2) { bestD2 = d2; best = p; }
    }
    return best;
  }

  /**
   * Apply damage to one part. Returns the overflow that should carry on into the
   * module/subsystem behind it, so shooting a part is never a way to make damage vanish.
   */
  damagePart(part, amount) {
    if (!part || part.destroyed) return amount;
    part.hp -= amount;
    if (part.hp > 0) return amount * 0.25;
    const overflow = -part.hp;
    part.hp = 0;
    part.destroyed = true;
    this.refresh();
    return overflow + amount * 0.15;
  }

  /** Recompute the cached consequences. Called on any part state change. */
  refresh() {
    let fire = 1, reload = 1, cool = 1, frozen = false, inert = false, detach = false;
    for (const p of this.list) {
      if (!p.destroyed) continue;
      switch (p.kind) {
        case 'output': inert = true; break;
        case 'feed': fire *= PART_EFFECT.feedFireRate; reload *= PART_EFFECT.feedReload; break;
        case 'traverse': frozen = true; break;
        case 'cooling': cool *= PART_EFFECT.coolingRate; break;
        case 'mount': detach = true; break;
        default: break;
      }
    }
    this.fireRateMul = fire;
    this.reloadMul = reload;
    this.coolingMul = cool;
    if (frozen && !this.traverseFrozen) this.frozenAt = this.mount.traverse;
    this.traverseFrozen = frozen;
    this.inert = inert;
    this.wantsDetach = detach;
    return this;
  }

  /** Restore one part. Refit pays for this in materials; it is cheaper than a new module. */
  repair(id) {
    const p = this.get(id);
    if (!p) return false;
    p.hp = p.maxHP;
    p.destroyed = false;
    this.refresh();
    return true;
  }

  get destroyedCount() {
    let n = 0;
    for (const p of this.list) if (p.destroyed) n++;
    return n;
  }

  /** Mean part health, used as one input to the module's condition. */
  get health() {
    if (!this.list.length) return 1;
    let sum = 0;
    for (const p of this.list) sum += p.health;
    return sum / this.list.length;
  }
}

/**
 * READ API for the second-tier targeting ring.
 *
 * `partAimPoints(ship, out)` fills and returns `out` (an array you own and reuse) with
 * one row per aimable sub-part on the ship, including the world position the reticle
 * should sit on and what killing it would do. The UI needs no knowledge of the model.
 *
 *   [{ mountIndex, hardpoint, weapon, partId, label, kind, health, destroyed,
 *      worldPosition, consequence }]
 */
export function partAimPoints(ship, out = []) {
  out.length = 0;
  if (!ship?.weapons) return out;
  for (let i = 0; i < ship.weapons.length; i++) {
    const m = ship.weapons[i];
    if (!m.parts) continue;
    for (const p of m.parts.list) {
      out.push({
        mountIndex: i,
        hardpoint: m.hardpoint ?? null,
        weapon: m.def.name ?? m.def.id,
        partId: p.id,
        label: p.label,
        kind: p.kind,
        health: p.health,
        destroyed: p.destroyed,
        worldPosition: p.worldPosition,
        consequence: PART_CONSEQUENCE[p.kind],
      });
    }
  }
  return out;
}

/** One line of plain text per failure mode, for the ring tooltip. */
export const PART_CONSEQUENCE = {
  output: 'MODULE INERT',
  feed: 'RATE -65%',
  traverse: 'ARC FROZEN',
  cooling: 'COOKS IN HALF THE TIME',
  mount: 'MODULE DETACHES INTACT',
};
