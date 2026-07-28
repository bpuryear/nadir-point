import { getModule, getItem } from '../../core/contracts.js';
import { MEV } from './events.js';

/**
 * THE HOLD, MEASURED IN CUBIC METRES.
 *
 * `reference-ui-language.md` §8 reads `2 620,0/5 000,0 m3` off the reference frame and
 * says plainly what it costs us to keep a six-slot array: a salvaged destroyer reactor
 * and a sensor mast are the same object to a slot count, and they are obviously not the
 * same object. Volume is what turns "cut everything" into "what do I leave".
 *
 * Three things share the hold, and that sharing is the system:
 *
 *   modules    bulky, and the reason you came
 *   scrap      bulky per unit of value, and it accumulates while you cut
 *   items      small, but they are the things that get you out alive
 *
 * Refined stock is dense, so refining is also a volume operation - roughly a six-to-one
 * compression. That is why the refinery is worth running mid-field and not only at rest.
 *
 * SLOT COMPATIBILITY. `salvage.js` and `refit.js` both still hold a `cargoCapacity`
 * slot count. It is left alone and kept as a secondary ceiling (a hold is a hold, not a
 * warehouse); volume is the binding constraint in every realistic case.
 */

/**
 * Cubic metres per tonne, by what the module actually is.
 *
 * Armour is a solid slab and stows like one. A reactor is mostly shielding and standoff
 * and stows terribly. These are the numbers that make the choice interesting, and they
 * are derived rather than authored so that all twenty-four existing modules get a
 * sensible volume without the geometry stream having to touch a file.
 */
export const DENSITY_M3_PER_TONNE = {
  armour: 0.22,
  weapon: 0.38,
  sensor: 0.75,
  reactor: 1.00,
  hangar: 0.90,
  cargo: 0.50,
  drive: 0.55,
  default: 0.55,
};

/** Which density class a module falls into. One place, so the numbers are auditable. */
export function volumeClassOf(def) {
  const g = def?.grants ?? {};
  if (g.hangarBays) return 'hangar';
  if ((g.powerOutput ?? 0) > 0) return 'reactor';
  if (g.armour) return 'armour';
  if (g.cargo) return 'cargo';
  if (def?.weapon) return 'weapon';
  if (g.sensorRange) return 'sensor';
  if (g.thrust || g.jumpRange) return 'drive';
  return 'default';
}

/**
 * Cubic metres this module occupies in the hold.
 * `ModuleDef.volume` overrides; otherwise it is derived from mass and class.
 */
export function moduleVolume(def) {
  if (!def) return 0;
  if (def.volume > 0) return def.volume;
  const cls = volumeClassOf(def);
  const density = DENSITY_M3_PER_TONNE[cls] ?? DENSITY_M3_PER_TONNE.default;
  return Math.round((def.mass ?? 200) * density);
}

/**
 * The hold.
 *
 * Capacity is base + whatever the fit grants + whatever the hull has been permanently
 * braced for. `ModuleDef.grants.cargo` was already authored as `600` on the Coalition
 * cargo pods, which reads directly as +600 m3 - the existing content needed no change.
 */
export class CargoHold {
  constructor(world, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.name = 'cargo';

    /** Cubic metres in the cruiser's own bay before any fit. */
    this.baseM3 = opts.baseM3 ?? 2400;
    /** Raised by installed modules; recomputed by `setFitBonus`. */
    this.fitBonusM3 = 0;
    /** Raised permanently by hull perks. */
    this.perkBonusM3 = 0;

    /**
     * Carried items, `{itemId, count}`. Distinct from `world.inventory`, which holds
     * modules: an item is not a module and conflating them would be the first step
     * back toward an inventory grid, which is explicitly not wanted.
     */
    this.items = [];
    world.items = this.items;
  }

  get capacityM3() {
    return this.baseM3 + this.fitBonusM3 + this.perkBonusM3;
  }

  /** Called by the refit hook whenever the fit changes. */
  setFitBonus(m3) {
    if (this.fitBonusM3 === m3) return;
    this.fitBonusM3 = m3;
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'fit' });
  }

  // --- accounting -----------------------------------------------------------

  modulesM3() {
    let v = 0;
    for (const it of this.world.inventory) {
      v += it.volume ?? moduleVolume(getModule(it.moduleId));
    }
    return v;
  }

  itemsM3() {
    let v = 0;
    for (const st of this.items) {
      v += (getItem(st.itemId)?.volume ?? 0) * st.count;
    }
    return v;
  }

  materialsM3() {
    return this.world.systems.economy?.volumeM3() ?? 0;
  }

  usedM3() {
    return this.modulesM3() + this.itemsM3() + this.materialsM3();
  }

  freeM3() {
    return Math.max(0, this.capacityM3 - this.usedM3());
  }

  fits(m3) {
    return m3 <= this.freeM3() + 1e-6;
  }

  /** Would this module fit, and if not, by how much is it over? */
  canTakeModule(def) {
    const v = moduleVolume(def);
    const free = this.freeM3();
    if (v <= free) return { ok: true, volume: v, free };
    return { ok: false, volume: v, free, over: v - free, reason: `needs ${v} m3, ${Math.round(free)} m3 free` };
  }

  // --- items ----------------------------------------------------------------

  itemCount(itemId) {
    return this.items.find((s) => s.itemId === itemId)?.count ?? 0;
  }

  addItem(itemId, count = 1) {
    const def = getItem(itemId);
    if (!def) return { ok: false, reason: `unknown item "${itemId}"` };
    const need = def.volume * count;
    if (!this.fits(need)) {
      return { ok: false, reason: `hold full - ${itemId} needs ${need.toFixed(1)} m3`, free: this.freeM3() };
    }
    const stack = this.items.find((s) => s.itemId === itemId);
    if (stack) stack.count += count;
    else this.items.push({ itemId, count });
    this.bus?.emit(MEV.ITEM_ACQUIRED, { itemId, count, def });
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'item' });
    return { ok: true, count: this.itemCount(itemId) };
  }

  removeItem(itemId, count = 1) {
    const i = this.items.findIndex((s) => s.itemId === itemId);
    if (i < 0 || this.items[i].count < count) return false;
    this.items[i].count -= count;
    if (this.items[i].count <= 0) this.items.splice(i, 1);
    this.bus?.emit(MEV.CARGO_CHANGED, { reason: 'item' });
    return true;
  }

  // --- read API -------------------------------------------------------------

  /**
   * Everything a hold panel needs.
   * @returns {{capacityM3:number, usedM3:number, freeM3:number, fraction:number,
   *            breakdown:Object, modules:Array, items:Array}}
   */
  describe() {
    const modules = this.world.inventory.map((it) => {
      const def = getModule(it.moduleId);
      return {
        uid: it.uid,
        moduleId: it.moduleId,
        name: def?.name ?? it.moduleId,
        hardpoint: def?.hardpoint ?? '--',
        tier: def?.tier ?? 0,
        condition: it.condition ?? 1,
        volumeM3: it.volume ?? moduleVolume(def),
        massT: def?.mass ?? 0,
      };
    });
    const items = this.items.map((s) => {
      const def = getItem(s.itemId);
      return {
        itemId: s.itemId,
        name: def?.name ?? s.itemId,
        count: s.count,
        volumeM3: (def?.volume ?? 0) * s.count,
        description: def?.description ?? '',
      };
    });
    const capacity = this.capacityM3;
    const used = this.usedM3();
    return {
      capacityM3: capacity,
      usedM3: Math.round(used * 10) / 10,
      freeM3: Math.round((capacity - used) * 10) / 10,
      fraction: capacity > 0 ? used / capacity : 1,
      breakdown: {
        modulesM3: Math.round(this.modulesM3()),
        itemsM3: Math.round(this.itemsM3() * 10) / 10,
        materialsM3: Math.round(this.materialsM3() * 10) / 10,
      },
      modules,
      items,
    };
  }
}
