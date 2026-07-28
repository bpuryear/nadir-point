/**
 * UNIVERSAL CONDITION.
 *
 * One number, 0..1, on every physical thing that can be owned: a wreck section, a
 * stored part, an installed module, a hull section. It survives the whole chain -
 * shot at -> cut free -> stowed -> installed -> shot at again -> repaired - and it
 * is the same number the whole way.
 *
 * Before this file the game had three separate quality numbers that never spoke:
 * `WreckSection.integrity`, `Ship.salvageIntegrity`, and nothing at all on an
 * installed module. Unifying them is what makes "how you killed it" reach forward
 * into "how well the gun you took off it works", which is the premise of the game.
 *
 * Condition is never decoration. Every function below is consumed by combat, refit
 * or salvage, and each one is a multiplier on a value that already existed.
 */

/**
 * The four bands. Thresholds come from beta-decay-systems.md §6.1 and are the same
 * thresholds the HUD colours against, so the number and the word never disagree.
 */
export const CONDITION_BANDS = [
  { id: 'nominal', min: 0.80, label: 'NOMINAL' },
  { id: 'worn', min: 0.50, label: 'WORN' },
  { id: 'degraded', min: 0.20, label: 'DEGRADED' },
  { id: 'inert', min: 0.00, label: 'INERT' },
];

export const CONDITION = {
  nominal: 0.80,
  worn: 0.50,
  degraded: 0.20,
  /** Below this a module will not run at all until repaired. Still installable. */
  inert: 0.20,
  /** Below this a wreck section is scrap only - no part comes out of it. */
  scrap: 0.20,
};

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** @returns {'nominal'|'worn'|'degraded'|'inert'} */
export function conditionBand(c) {
  const v = clamp01(c);
  for (const band of CONDITION_BANDS) if (v >= band.min) return band.id;
  return 'inert';
}

export function conditionLabel(c) {
  const id = conditionBand(c);
  return CONDITION_BANDS.find((b) => b.id === id).label;
}

/**
 * Salvage vocabulary. Deliberately a different, coarser three-word scale from the
 * module bands: when you are shooting at a hostile you are asking "is that battery
 * still worth cutting", not "what is its exact percentage".
 */
export function salvageState(c) {
  if (c >= 0.62) return 'INTACT';
  if (c >= CONDITION.scrap) return 'DAMAGED';
  return 'SCRAP';
}

// ---------------------------------------------------------------------------
// What condition DOES. Every one of these multiplies an existing value.
// ---------------------------------------------------------------------------

/** Rate of fire. Above 0.80 a module is nominal; below it the feed gets tired. */
export function fireRateMul(c) {
  const v = clamp01(c);
  if (v >= CONDITION.nominal) return 1;
  if (v < CONDITION.inert) return 0;
  return 0.6 + 0.5 * v;
}

/** Traverse rate. A worn ring tracks a fast target badly - a spatial consequence. */
export function traverseMul(c) {
  const v = clamp01(c);
  if (v >= CONDITION.nominal) return 1;
  if (v < CONDITION.inert) return 0;
  return Math.min(1, 0.5 + 0.6 * v);
}

/** Muzzle energy. Worn barrels hit softer; this is the quiet half of the tax. */
export function damageMul(c) {
  const v = clamp01(c);
  if (v >= CONDITION.nominal) return 1;
  if (v < CONDITION.inert) return 0;
  return 0.65 + 0.35 * v;
}

/**
 * Chance of a misfeed stall, rolled ONCE PER BURST rather than per shot.
 *
 * The research proposed `1 - c` per shot; at condition 0.4 and a six-shot burst that
 * is a 95% chance of stalling every burst, which reads as a broken gun rather than a
 * worn one. Per burst, scaled, it reads as "this thing jams sometimes" - the intended
 * feeling at a tenth of the frustration.
 */
export function misfeedChance(c) {
  const v = clamp01(c);
  if (v >= CONDITION.worn) return 0;
  return Math.min(0.45, (CONDITION.worn - v) * 1.2);
}

export const MISFEED_STALL = 2.0; // seconds

/** Passive grants: power output, shield capacity, thrust, cargo, sensor range. */
export function grantMul(c) {
  const v = clamp01(c);
  if (v >= 0.85) return 1;
  if (v < CONDITION.inert) return 0;
  return Math.min(1, 0.35 + 0.75 * v);
}

/** Worn radiators shed heat slower, so a bad part runs hot as well as slow. */
export function coolingMul(c) {
  const v = clamp01(c);
  if (v >= CONDITION.nominal) return 1;
  return 0.6 + 0.4 * v;
}

/** True when the module is too far gone to operate at all. Still salvageable. */
export function isInert(c) {
  return clamp01(c) < CONDITION.inert;
}

// ---------------------------------------------------------------------------
// Costs. Repair and scrap are competing claims on the same materials.
// ---------------------------------------------------------------------------

/**
 * Materials to lift a part from `from` to `to`.
 *
 * The surcharge below 0.35 is the whole decision: restoring a nearly-dead module is
 * disproportionately expensive, so at some point scrapping it and fitting something
 * else is correct. Without the surcharge repair is always right and there is no choice.
 */
export function repairCost(massT, from, to = 1) {
  const span = Math.max(0, clamp01(to) - clamp01(from));
  if (span <= 0) return { alloy: 0, composite: 0, exotic: 0, span: 0 };
  const surcharge = from < 0.35 ? 1 + (0.35 - from) * 2.2 : 1;
  const base = (massT ?? 200) * 0.05 * span * surcharge;
  return {
    alloy: Math.ceil(base),
    composite: Math.ceil(base * 0.35),
    // Fire control and servos need something you cannot make out of hull plate.
    exotic: from < 0.25 && span > 0.3 ? 1 : 0,
    span,
  };
}

/**
 * What a part yields when broken down.
 *
 * The alloy and composite rates are bit-for-bit the rates `salvage.scrapInventoryItem`
 * already used, so the inventory screen's published arithmetic stays true. The exotic
 * bonus is new and is deliberately only available on a clean part: cutting carefully
 * pays a second time even when you intend to melt the thing down.
 */
export function scrapYield(massT, c) {
  const v = clamp01(c);
  const value = Math.round((massT ?? 200) * 0.4 * v);
  return {
    alloy: value,
    composite: Math.round(value * 0.35),
    exotic: v >= 0.75 ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

/**
 * Damage -> condition loss.
 *
 * `toughness` is the amount of damage that would take a pristine thing to scrap. It
 * comes from subsystem HP for a subsystem section and from hull HP share for plating,
 * so a destroyer's armoured reactor housing degrades slower than its sensor mast
 * without anyone hand-authoring a table.
 */
export function degrade(current, amount, toughness) {
  if (!(amount > 0)) return current;
  const t = Math.max(1, toughness);
  return clamp01(current - amount / t);
}

/**
 * Quality of a section as it comes off the wreck.
 *
 * Three inputs, all visible to the player before they commit:
 *   - what the section's condition already was, which they decided by how they fought
 *   - how hot the wreck still is: a burning hull cooks what you cut out of it
 *   - whether they chose the fast cut, which is quicker and worse
 *
 * This is the line that makes "a part cut from a burning wreck is visibly worse".
 */
export function cutQuality(sectionCondition, wreckHeat, fast = false) {
  const burn = clamp01(wreckHeat) * 0.35;
  const haste = fast ? 0.12 : 0;
  return clamp01(sectionCondition - burn - haste);
}

/** Condition loss per second of cutting while the wreck is still burning. */
export function burnRate(wreckHeat) {
  return clamp01(wreckHeat) * 0.045;
}
