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
 *
 * WHY THIS FILE IMPORTS THE MATERIAL TABLE. `scrapYield` below is the published
 * preview of what breaking a part down pays, and it is read on every repair-plan row
 * (`refit.js:552`) so the player can compare "restore it" against "melt it". It used
 * to compute its own rate — `mass * 0.4 * condition` of finished stock — while the
 * path that actually runs, `meta/index.js#breakDownItem`, produced `mass * 0.10 *
 * condition` of GRADED SCRAP which then refines lossily. Measured on the same module,
 * the two disagreed by 14x. A preview that is wrong by 14x is worse than no preview,
 * so this file now derives its answer from the one rate and the one refining table.
 */

import { REFINE_YIELD, MATERIAL_VOLUME, gradeForModule } from './meta/materials.js';

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
  const surcharge = from < CONDITION.worn ? 1 + (CONDITION.worn - from) * 2.6 : 1;
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
 * Scrap units a part of `massT` tonnes at condition `c` tears down into.
 *
 * THE ONE RATE. `meta/index.js#breakDownItem` and `refit.js#scrapInstalled` both go
 * through here, so there is no second implementation to diverge from.
 */
export const SCRAP_UNITS_PER_TONNE = 0.10;

export function scrapUnits(massT, c) {
  return Math.max(1, Math.round((massT ?? 200) * SCRAP_UNITS_PER_TONNE * clamp01(c)));
}

/**
 * What a part yields when broken down, in REFINED units — i.e. after the scrap it
 * actually produces has been through the refinery.
 *
 * Two things changed here and both were printers.
 *
 *   1. The rate. This used to pay `mass * 0.4 * condition` of finished alloy straight
 *      into `world.materials`, bypassing the hold, the queue and the refining loss.
 *      The path the game actually runs pays `mass * 0.10 * condition` of graded scrap.
 *      Same 340 t cannon bank: 168 alloy one way, 12 the other. It now computes the
 *      second answer, so the repair-versus-scrap comparison on every refit row is a
 *      comparison between two real numbers.
 *   2. The exotic. `exotic: v >= 0.75 ? 1 : 0` MINTED exotic out of a clean part, which
 *      closed a loop with `patterns.build`: build a module for 147 alloy + 34
 *      electronics, install it, scrap it for 143 alloy + 50 composite + 1 exotic. Seven
 *      turns of that crank bought the entire perk tree's exotic demand for 28 alloy.
 *      Exotic now comes only out of refining core scrap, at 0.015 per unit, which is
 *      what makes an intact reactor section worth going out of your way for.
 *
 * @param {number} massT
 * @param {number} c        condition 0..1
 * @param {string|Object} [grade]  scrap grade, or the ModuleDef to derive it from
 */
export function scrapYield(massT, c, grade = 'machine') {
  const g = typeof grade === 'string' ? grade : gradeForModule(grade);
  const units = scrapUnits(massT, c);
  const table = REFINE_YIELD[g] ?? REFINE_YIELD.machine;
  const out = {
    alloy: 0, composite: 0, electronics: 0, exotic: 0,
    /** What actually lands in the hold, before any refining. */
    scrapUnits: units,
    grade: g,
    /** Cubic metres that scrap occupies on the way to the crucible. */
    m3: units * (MATERIAL_VOLUME[g] ?? 0.34),
  };
  for (const k in table) out[k] = Math.floor(table[k] * units);
  return out;
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
 *
 * `beamPenalty` is the fourth input and it is a PERK DRAWBACK, not an accident of the
 * situation: `cutting_optics` collimates the torch harder, sections come free faster,
 * and every one of them comes off scorched. It is passed in by `salvage.js` from
 * `SalvageSystem.cutConditionPenalty` so the projection the cut panel already draws
 * (`cutStatus().projected`) shows the cost of the perk before the cut, not after.
 */
export function cutQuality(sectionCondition, wreckHeat, fast = false, beamPenalty = 0) {
  const burn = clamp01(wreckHeat) * 0.35;
  const haste = fast ? 0.12 : 0;
  return clamp01(sectionCondition - burn - haste - Math.max(0, beamPenalty));
}

/** Condition loss per second of cutting while the wreck is still burning. */
export function burnRate(wreckHeat) {
  return clamp01(wreckHeat) * 0.045;
}
