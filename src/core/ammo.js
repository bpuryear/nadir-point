/**
 * Ammunition classes and magazine data.
 *
 * WHY THIS IS IN core/ AND NOT IN sim/stores.js, WHERE IT USED TO LIVE.
 *
 * `core/contracts.js` validates at registration time that a weapon's ready rounds can
 * cover its burst — a launcher that declares `shotsPerBurst: 6` against a 4-round ready
 * magazine fires four and silently drops two. To check that, the validator needs the
 * magazine defaults, and it reached across into `sim/stores.js` to get them.
 *
 * That import closed a cycle:
 *
 *     core/contracts.js -> sim/stores.js -> sim/condition.js
 *                       -> sim/meta/materials.js -> core/contracts.js
 *
 * It was recorded in a comment as having no cycle, on the strength of enumerating
 * stores.js's DIRECT imports and stopping one hop short; `condition.js:27` imports
 * `./meta/materials.js`, whose first line imports `getModule` from this file's consumer.
 * Importing stores.js standalone cannot detect that — it traverses the whole cycle and
 * completes silently — so the stated verification could never have found it.
 *
 * The cycle was latent rather than live only because `getModule` is used inside a
 * function body. `contracts.js` declares it `export const`, which is a temporal-dead-zone
 * binding, so the first top-level use added anywhere inside the loop would have thrown
 * "Cannot access getModule before initialization" at boot — a long way from its cause.
 *
 * Duplicating these numbers to avoid the import would be worse: two sources of truth for
 * the exact figure the validator exists to check against. So the data moves down to the
 * layer that both callers may depend on. This module imports nothing, which is what makes
 * it safe to depend on from either direction.
 */

/** Weapon archetype -> ammunition class. Absent means energy-fed. */
export const AMMO_FOR_TYPE = {
  cannon: 'shell',
  rail: 'railslug',
  missile: 'missile',
  flak: 'flakcan',
  pd: 'pdslug',
};

/**
 * Per-class magazine data.
 *
 * `fab` is what a round costs to manufacture from materials. It is deliberately in the
 * same units as repair, because ammunition and repair are the same alloy: reloading the
 * rail battery is materials you cannot spend fixing the shield pylons.
 */
export const AMMO_SPEC = {
  shell:    { label: 'SHELL',   capacity: 420, ready: 24, reload: 6.0,  fabAlloy: 1.0, fabComposite: 0.0, salvagePer: 34 },
  railslug: { label: 'SLUG',    capacity: 90,  ready: 6,  reload: 9.0,  fabAlloy: 3.5, fabComposite: 0.6, salvagePer: 9 },
  missile:  { label: 'MISSILE', capacity: 48,  ready: 4,  reload: 11.0, fabAlloy: 5.0, fabComposite: 2.0, salvagePer: 5 },
  flakcan:  { label: 'FLAK',    capacity: 300, ready: 20, reload: 5.0,  fabAlloy: 0.8, fabComposite: 0.2, salvagePer: 28 },
  pdslug:   { label: 'PD',      capacity: 900, ready: 60, reload: 4.0,  fabAlloy: 0.3, fabComposite: 0.0, salvagePer: 90 },
};

/** Rounds a wreck section of this ammunition class is worth. */
export function ammoSalvage(cls) {
  return AMMO_SPEC[cls]?.salvagePer ?? 0;
}

export function ammoClassOf(weaponDef) {
  if (weaponDef.ammoClass !== undefined) return weaponDef.ammoClass;
  return AMMO_FOR_TYPE[weaponDef.type] ?? null;
}

export const isEnergyWeapon = (weaponDef) => ammoClassOf(weaponDef) === null;
