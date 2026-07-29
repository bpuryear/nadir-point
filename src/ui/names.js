/**
 * DISPLAY NAMES — AUTHORED, NOT TRUNCATED.
 *
 * One ARMAMENT panel used to carry NINE ellipses at once: `CONCORD SIE…`,
 * `COALITION R…`, `DERELICT TR…`, `COALITION H…`, `CONCORD FUS…`, `COOLANT PU…`,
 * `BOARDING C…`, `SURVEY PUL…`, and in the ship block `COALITION RAIL BAT…`,
 * `DERELICT TRACTOR Y…`, `COALITION HEAVY BR…`. In a game whose entire premise is
 * bolting salvaged parts onto your own hull, the player could not tell WHICH rail
 * battery or WHICH lance they were looking at. The default no-module state was worse:
 * `PORT SPONSON - EMP…`, `MAIN DRIVE WELL - …`.
 *
 * Truncating a long name at paint time is the wrong layer to solve this at, and it is
 * not what the games this interface is measured against do — NEBULOUS prints `CL-141`,
 * `Mk66`, `R-2`. So every part gets a SHORT NAME authored here, at or under twelve
 * characters, and the panels ask for the short one. The full name still exists and is
 * printed wherever there is room for it — the codex card, the hold table, the refit
 * screen — and `twoLine` wraps rather than clips where a cell has vertical room.
 *
 * THE FACTION WORD IS NEVER PART OF THE SHORT NAME. Every module in the game is
 * `<Faction> <Thing>` and the faction is already carried twice over: as the coloured
 * identity stripe beside the row and, where it matters, as its own column. Spending
 * nine characters of a twelve-character budget re-printing `COALITION` is what forced
 * the ellipsis in the first place.
 */

import { getModule, getItem } from '../core/contracts.js';

/** Words that are only ever the faction prefix. Stripped before anything else. */
const FACTION_WORDS = new Set(['COALITION', 'CONCORD', 'DERELICT', 'ANCIENT', 'PLAYER']);

/**
 * Authored short names, by module id. Twelve characters or fewer, and each one is
 * the noun a player would actually say out loud: "the rail battery", "the lance".
 */
const MODULE_ABBR = {
  bow_siege_lance: 'SIEGE LANCE',
  bow_breaching_prow: 'BREACH PROW',
  bow_mining_array: 'CUT ARRAY',
  bow_torpedo_tubes: 'TORPEDOES',
  bow_prow_spike: 'INTERFEROM',

  port_cannon_bank: 'CANNON BANK',
  port_beam_array: 'BEAM ARRAY',
  port_flak_cluster: 'FLAK',
  port_broadside_battery: 'BROADSIDE',
  port_gauss_outrigger: 'GAUSS RAIL',

  dorsal_rail_battery: 'RAIL BATTERY',
  dorsal_sensor_mast: 'SURVEY MAST',
  dorsal_missile_cells: 'VLS CELLS',
  dorsal_pd_ring: 'PD RING',
  dorsal_shield_pylons: 'BARRIER',

  engine_thruster_upgrade: 'MAIN DRIVE',
  engine_reactor_uprate: 'FUSION CORE',
  engine_jump_drive: 'JUMP RING',
  engine_armour_belt: 'STERN ARMR',

  ventral_hangar_deck: 'HANGAR DECK',
  ventral_salvage_tractor: 'TRACTOR',
  ventral_cargo_expansion: 'CARGO PODS',
  ventral_repair_bay: 'FIELD DOCK',
  ventral_drone_bay: 'DRONE BAY',
};

/** Authored short names for carried devices. Same twelve-character budget. */
const ITEM_ABBR = {
  coolant_purge: 'COOLANT',
  decoy: 'DECOY',
  boarding_charge: 'BOARD CHG',
  scan_pulse: 'SURVEY PULSE',
  jury_rig: 'JURY-RIG',
};

/** Hardpoint labels, short enough to sit in a 60 px cell header. */
export const MOUNT_SHORT = {
  bow: 'BOW', dorsal: 'DORSAL', ventral: 'VENTRAL',
  port: 'PORT', starboard: 'STBD', engine: 'ENGINE',
};

/** The empty state of each mount, said as a place rather than as an absence. */
export const MOUNT_EMPTY = {
  bow: 'BOW SOCKET', dorsal: 'DORSAL BED', ventral: 'VENTRAL BAY',
  port: 'PORT SPONSON', starboard: 'STBD SPONSON', engine: 'DRIVE WELL',
};

/**
 * Strip the faction word and squeeze what is left. The fallback for anything that
 * has not been authored above — a salvaged part from a hull this build does not
 * know about still gets a usable name rather than an ellipsis.
 */
function derive(name, budget) {
  const words = String(name ?? '').toUpperCase().split(/[\s-]+/).filter(Boolean);
  while (words.length > 1 && FACTION_WORDS.has(words[0])) words.shift();
  let out = words.join(' ');
  if (out.length <= budget) return out;
  // Drop adjectives from the front before mangling the noun: `HEAVY BROADSIDE` is
  // still a broadside, but `HEAVY BROADS` is nothing.
  while (words.length > 1 && words.join(' ').length > budget) words.shift();
  out = words.join(' ');
  return out.length <= budget ? out : out.slice(0, budget);
}

/**
 * The short name for a module. Accepts a def, an id, or anything with `.id`/`.name`.
 * @returns {string} uppercase, <= budget characters
 */
export function moduleName(def, budget = 12) {
  if (!def) return '';
  const id = typeof def === 'string' ? def : def.id;
  const authored = MODULE_ABBR[id];
  if (authored) return authored;
  const full = typeof def === 'string' ? getModule(def)?.name : (def.name ?? getModule(id)?.name);
  return derive(full ?? id, budget);
}

/** The short name for a carried device. Same contract as `moduleName`. */
export function itemName(def, budget = 12) {
  if (!def) return '';
  const id = typeof def === 'string' ? def : def.id;
  const authored = ITEM_ABBR[id];
  if (authored) return authored;
  const full = typeof def === 'string' ? getItem(def)?.name : (def.name ?? getItem(id)?.name);
  return derive(full ?? id, budget);
}

/** The full name, uppercased, for the places that have room for it. */
export function fullName(def) {
  if (!def) return '';
  const d = typeof def === 'string' ? (getModule(def) ?? getItem(def)) : def;
  return String(d?.name ?? def).toUpperCase();
}

/**
 * WRAP RATHER THAN CLIP.
 *
 * Where a cell has vertical room, the full name goes onto two lines instead of losing
 * its last word to an ellipsis. Returns at most two lines and never returns an empty
 * second line, so the caller can lay out on `lines.length` without a special case.
 *
 * @returns {string[]} one or two lines, both within `maxW`
 */
const _two = [];
export function twoLine(P, str, font, maxW, track) {
  _two.length = 0;
  const s = String(str ?? '').toUpperCase();
  if (P.measure(s, font, track) <= maxW) { _two.push(s); return _two; }
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 2) { _two.push(P.clip(s, font, maxW, track)); return _two; }
  // Break at the point that leaves the two halves closest in width — a first line
  // holding one short word over a long second line reads as a mistake.
  let bestAt = 1;
  let bestErr = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = P.measure(words.slice(0, i).join(' '), font, track);
    const b = P.measure(words.slice(i).join(' '), font, track);
    if (a > maxW || b > maxW) continue;
    const err = Math.abs(a - b);
    if (err < bestErr) { bestErr = err; bestAt = i; }
  }
  if (bestErr === Infinity) {
    _two.push(P.clip(words.slice(0, -1).join(' '), font, maxW, track));
    _two.push(P.clip(words[words.length - 1], font, maxW, track));
    return _two;
  }
  _two.push(words.slice(0, bestAt).join(' '));
  _two.push(words.slice(bestAt).join(' '));
  return _two;
}
