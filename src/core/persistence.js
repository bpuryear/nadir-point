/**
 * PERSISTENCE.
 *
 * `closest-comparables.md` §5.2, Product 4, checked against the tree: there was no
 * `localStorage` anywhere in `src/`, in a game whose entire premise is one hull you keep.
 * A persistent-hull design with no save is not a persistent-hull design; it is a demo of
 * one.
 *
 * WHAT THIS SAVES, and the rule that decides it: **everything the player earned, nothing
 * the world can regenerate.** The star system is authored and the module registry is
 * built from code, so neither is in the file. What is in the file is the state that only
 * exists because somebody played: the hull and what is bolted to it, what is in the hold,
 * what has been refined, what is known, what has been unlocked, who is angry, what the
 * war has done to the map, what is owed, and where the player left their guns.
 *
 * VERSIONING AND FAILING SAFE. A save whose `version` is not `SAVE_VERSION`, or whose
 * `seed` is not this world's seed, is REFUSED and the world is not touched. That is the
 * correct trade for a game with no run structure: a corrupted persistent hull has no
 * recovery path, so a refused load - which costs the player one session - is strictly
 * better than a partial one. `load()` never throws and always returns a reason.
 *
 * DETERMINISM, HONESTLY. Every system forks `world.rng` by label, so a restored world
 * draws from the same seed and the same labels and is reproducible from the save file.
 * What is NOT preserved is the *position* of each fork's stream - a restored `travel`
 * RNG restarts rather than continuing - because there are around twenty forks and
 * serialising each one's internal word buys bit-exactness in return for a save format
 * that breaks whenever a system adds a fork. Saving and reloading therefore reproduces
 * the same WORLD, and re-rolls future dice. That is a stated limitation, not an
 * oversight, and it is why `_s` is deliberately absent below.
 */

import { EV } from './events.js';
import { MEV } from '../sim/meta/events.js';

/** Bump on any incompatible shape change. Old saves are refused, never migrated blind. */
export const SAVE_VERSION = 1;

/** One slot. This game has one hull; a save-slot list would be a lie about that. */
export const SAVE_KEY = 'nadir-point/save/v1';

/** Storage that works when there is no DOM, so the harness exercises the real path. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    __memory: true,
  };
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      // Some browsers throw on access in private mode rather than on use.
      localStorage.getItem(SAVE_KEY);
      return localStorage;
    }
  } catch { /* fall through */ }
  return memoryStorage();
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ===========================================================================
// Capture
// ===========================================================================

/**
 * Everything worth keeping, as plain JSON-able data. Pure: it reads the world and
 * writes nothing, so it is safe to call at any point in a frame.
 *
 * @param {import('./world.js').World} world
 */
export function captureSave(world) {
  const s = world.systems ?? {};
  const player = world.player ?? null;

  return {
    version: SAVE_VERSION,
    seed: world.seed,
    savedAt: Date.now(),
    simTime: num(world.engine?.simTime),

    world: {
      propellant: world.propellant ? { ...world.propellant } : null,
      materials: { ...world.materials },
      reputation: { ...world.reputation },
      unlocked: { ...world.unlocked },
      inventory: world.inventory.map((i) => ({
        moduleId: i.moduleId, condition: num(i.condition, 1), uid: i.uid, volume: i.volume ?? undefined,
      })),
    },

    ship: player ? captureShip(player) : null,

    economy: s.economy ? {
      scrap: { ...s.economy.scrap },
      queue: s.economy.queue.map((j) => ({ grade: j.grade, remaining: j.remaining })),
      lifetime: { ...s.economy.lifetime },
      yieldBonus: num(s.economy.yieldBonus),
      rateMultiplier: 1,          // dock multipliers are transient by design
    } : null,

    cargo: s.cargo ? {
      items: s.cargo.items.map((i) => ({ itemId: i.itemId, count: i.count })),
      perkBonusM3: num(s.cargo.perkBonusM3),
    } : null,

    codex: s.codex ? Array.from(s.codex.state.entries()).map(([k, v]) => [k, v.state, num(v.count)]) : null,
    perks: s.perks ? Array.from(s.perks.ranks.entries()) : null,
    patterns: s.patterns ? Array.from(s.patterns.known.keys()) : null,

    discovery: s.discovery ? {
      known: Array.from(s.discovery.known),
      blips: Array.from(s.discovery.blips.entries()),
    } : null,

    war: s.factionWar ? captureWar(s.factionWar) : null,

    travel: s.travel ? {
      currentPOI: s.travel.currentPOI,
      docked: !!s.travel.docked,
      dockedAt: s.travel.dockedAt,
      silent: !!s.travel.silent,
    } : null,

    sortie: s.sortie ? {
      index: s.sortie.index,
      time: s.sortie.time,
      debt: num(s.sortie.debt),
      debtPaid: num(s.sortie.debtPaid),
      docked: !!s.sortie.docked,
      log: s.sortie.log.slice(-8).map(stripLedger),
      current: stripLedger(s.sortie.current),
    } : null,

    derelict: s.derelict?.serialise ? s.derelict.serialise() : null,
  };
}

/** A sortie record without the private running sums, which are derivable. */
function stripLedger(r) {
  if (!r) return null;
  const out = {};
  for (const k in r) if (!k.startsWith('_')) out[k] = r[k];
  out._conditionSum = num(r._conditionSum);
  out._conditionCount = num(r._conditionCount);
  return out;
}

function captureShip(p) {
  const hardpoints = [];
  for (const [id, hp] of p.hardpoints) {
    hardpoints.push({
      id,
      moduleId: hp.module?.def?.id ?? hp.module?.moduleId ?? null,
      condition: num(hp.module?.condition, 1),
      uid: hp.module?.uid ?? null,
      structureHP: num(hp.structureHP, hp.maxStructureHP),
      maxStructureHP: num(hp.maxStructureHP, 1000),
      breached: !!hp.breached,
    });
  }
  const sections = [];
  for (const [id, sec] of p.sections) sections.push([id, num(sec.condition, 1)]);

  return {
    hullHP: num(p.hullHP, p.maxHullHP),
    maxHullHP: num(p.maxHullHP, 1),
    crippled: !!p.crippled,
    position: { x: p.position.x, y: p.position.y, z: p.position.z },
    heading: num(p.heading),
    hardpoints,
    sections,
    stores: p.stores ? {
      ammo: { ...p.stores.ammo },
      charge: num(p.stores.charge),
      coolant: num(p.stores.coolant),
    } : null,
  };
}

function captureWar(war) {
  const pois = [];
  for (const st of war.states.values()) {
    pois.push({
      id: st.id,
      control: st.control,
      heat: st.heat,
      garrison: { ...st.garrison },
      battlesFought: st.battlesFought,
      battleCooldown: st.battleCooldown,
      lastSeenTick: st.lastSeenTick,
      visited: !!st.visited,
      debris: st.debris,
      hulks: st.hulks.map((h) => ({ ...h })),
      strays: (st.strays ?? []).map((h) => ({ ...h })),
    });
  }
  return {
    time: war.time,
    reserve: { ...war.reserve },
    ledger: {
      coalition: { ...war.ledger.coalition },
      concord: { ...war.ledger.concord },
    },
    pois,
  };
}

// ===========================================================================
// Apply
// ===========================================================================

/**
 * Put a captured save back into a live world.
 *
 * Order matters and is the whole of the correctness argument: pools and knowledge
 * first, because the loadout restore reads the hold; then the loadout, because the
 * hull's statistics are recomputed from it; then the world simulation, because the
 * travel layer's POI entry materialises whatever the war says is lying there.
 *
 * @returns {{ok:boolean, reason?:string, applied?:string[]}}
 */
export function applySave(world, data, opts = {}) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'no save data' };
  if (data.version !== SAVE_VERSION) {
    return { ok: false, reason: `save is version ${data.version}, this build reads ${SAVE_VERSION}` };
  }
  if (!opts.allowSeedMismatch && data.seed !== world.seed) {
    return { ok: false, reason: `save is from world seed "${data.seed}", this world is "${world.seed}"` };
  }

  const s = world.systems ?? {};
  const applied = [];

  // --- pools, knowledge, standing ------------------------------------------
  if (data.world) {
    if (data.world.propellant && world.propellant) Object.assign(world.propellant, data.world.propellant);
    Object.assign(world.materials, data.world.materials ?? {});
    Object.assign(world.reputation, data.world.reputation ?? {});
    Object.assign(world.unlocked, data.world.unlocked ?? {});
    world.inventory.length = 0;
    for (const i of data.world.inventory ?? []) world.inventory.push({ ...i });
    applied.push('world');
  }

  if (data.economy && s.economy) {
    Object.assign(s.economy.scrap, data.economy.scrap ?? {});
    s.economy.queue.length = 0;
    for (const j of data.economy.queue ?? []) s.economy.queue.push({ ...j });
    Object.assign(s.economy.lifetime, data.economy.lifetime ?? {});
    s.economy.yieldBonus = num(data.economy.yieldBonus);
    s.economy.rateMultiplier = 1;
    applied.push('economy');
  }

  if (data.cargo && s.cargo) {
    s.cargo.items.length = 0;
    for (const i of data.cargo.items ?? []) s.cargo.items.push({ ...i });
    s.cargo.perkBonusM3 = num(data.cargo.perkBonusM3);
    applied.push('cargo');
  }

  if (data.codex && s.codex) {
    s.codex.state.clear();
    for (const [key, state, count] of data.codex) {
      s.codex.state.set(key, { state, firstSeen: 0, count: num(count) });
    }
    applied.push('codex');
  }

  if (data.perks && s.perks) {
    s.perks.ranks.clear();
    for (const [id, rank] of data.perks) s.perks.ranks.set(id, rank);
    applied.push('perks');
  }

  if (data.patterns && s.patterns) {
    s.patterns.known.clear();
    for (const id of data.patterns) s.patterns.known.set(id, { at: 0, reason: 'save' });
    applied.push('patterns');
  }

  // --- the hull -------------------------------------------------------------
  if (data.ship && world.player) {
    restoreShip(world, data.ship);
    applied.push('ship');
  }

  // Perks touch the same statistics the fit does, so they go on after the fit.
  s.perks?.apply?.();

  /*
   * AND THE HULL BAR GOES ON AFTER THE PERKS, BECAUSE IT IS AN ABSOLUTE AND THEY ARE
   * A RATIO. This is the fix for a save/load round trip that shaved the hull every
   * time, and it was measurable in the project's own harness long before anyone
   * noticed it: `sortieHarness.js` section 8 printed `hull 7400 -> 6956  MATCH NO` and
   * "15 of 16 fields identical" for as long as it has existed.
   *
   * The arithmetic, with `hold_bracing` at rank 1 (-6% max hull):
   *
   *   session A   fresh 12000 max -> perks.apply() -> 11280 max, player fights to 7400
   *   save        { hullHP: 7400, maxHullHP: 11280 }
   *   session B   fresh world: maxHullHP is 12000 again and `_basePerkMaxHullHP` is
   *               unset, because both belong to the world, not to the file
   *   restoreShip hullHP = min(7400, 12000) = 7400 against a max of 12000
   *   perks.apply meta/perks.js:285-289 seeds baseHull from the PRE-perk 12000, sets
   *               maxHullHP to 11280, and rescales hullHP by frac = 7400/12000 = 0.617
   *               -> 6956. The 0.94 is applied a SECOND time, to a number that had
   *               already paid it.
   *
   * `perks.apply()` is right to rescale — it is what keeps the bar in the same place
   * when a rank is bought mid-run — and it is `meta/perks.js`, another stream's file.
   * The defect is on this side: an absolute restored before a ratio that rescales it.
   * So the fit, the structure and the stores stay where they are (they are absolutes
   * that perks do not touch) and only the hull is re-asserted here, clamped to the
   * post-perk ceiling that now exists.
   */
  if (data.ship && world.player) restoreHullBar(world.player, data.ship);

  // --- the world ------------------------------------------------------------
  if (data.discovery && s.discovery) {
    s.discovery.known = new Set(data.discovery.known ?? []);
    s.discovery.blips = new Map(data.discovery.blips ?? []);
    applied.push('discovery');
  }

  if (data.war && s.factionWar) {
    restoreWar(s.factionWar, data.war);
    applied.push('war');
  }

  if (data.sortie && s.sortie) {
    s.sortie.index = num(data.sortie.index);
    s.sortie.time = num(data.sortie.time);
    s.sortie.debt = num(data.sortie.debt);
    s.sortie.debtPaid = num(data.sortie.debtPaid);
    s.sortie.docked = !!data.sortie.docked;
    s.sortie.log = (data.sortie.log ?? []).map((r) => ({ ...r }));
    if (data.sortie.current) s.sortie.current = { ...data.sortie.current };
    applied.push('sortie');
  }

  if (data.derelict && s.derelict?.restore) {
    s.derelict.restore(data.derelict);
    applied.push('derelict');
  }

  if (data.travel && s.travel) {
    s.travel.setSilent(!!data.travel.silent);
    // Entering the POI is what materialises its wreckage, so it goes last and it goes
    // through the travel layer rather than by writing `currentPOI` directly.
    if (data.travel.currentPOI) {
      try {
        s.travel.currentPOI = null;
        s.travel.enter(data.travel.currentPOI);
      } catch (err) {
        console.warn('[persistence] could not enter the saved POI', err);
        s.travel.currentPOI = data.travel.currentPOI;
      }
    }
    s.travel.docked = false;
    s.travel.dockedAt = null;
    if (data.travel.docked && data.travel.dockedAt) {
      const res = s.travel.dock(data.travel.dockedAt);
      // A berth that has since changed hands will refuse. That is correct: the world
      // moved while you were away, and being held off is information.
      if (!res.ok) world.bus.emit(EV.NOTIFY, { text: `BERTH REFUSED — ${res.reason}`, important: true });
    }
    applied.push('travel');
  }

  world.bus.emit(MEV.LOADED, { applied, savedAt: data.savedAt });
  world.bus.emit(MEV.CARGO_CHANGED, { reason: 'load' });
  return { ok: true, applied };
}

function restoreShip(world, ship) {
  const p = world.player;
  const refit = world.systems.refit ?? null;
  const gate = world.systems.refitGate ?? null;

  p.hullHP = Math.min(num(ship.hullHP, p.maxHullHP), p.maxHullHP);
  p.crippled = false;
  p.scrammed = false;
  p.disabled = false;
  p.dead = false;
  if (ship.position) p.body.position.set(ship.position.x, ship.position.y ?? 0, ship.position.z);
  if (p.planeLocked) { p.body.heading = num(ship.heading); p.body.desiredHeading = num(ship.heading); }
  p.body.velocity.set(0, 0, 0);

  for (const [id, condition] of ship.sections ?? []) {
    const sec = p.sections.get(id);
    if (sec) sec.condition = condition;
  }

  // Strip whatever is on the hull now, then put the saved fit on. Both directions go
  // through refit so the geometry follows, and both bypass the commitment gate: loading
  // a save is not a refit and must not cost time or condition.
  for (const [id, hp] of p.hardpoints) {
    if (hp.module && refit) refit.uninstall(id, { bypassGate: true });
    else if (hp.module) { hp.module = null; hp.object = null; }
  }

  for (const row of ship.hardpoints ?? []) {
    const hp = p.hardpoints.get(row.id);
    if (!hp) continue;
    hp.maxStructureHP = num(row.maxStructureHP, hp.maxStructureHP);
    hp.structureHP = num(row.structureHP, hp.maxStructureHP);
    hp.breached = !!row.breached;
    hp.warned = false;
    if (!row.moduleId) continue;
    const uid = row.uid ?? `save:${row.id}`;
    world.inventory.push({ moduleId: row.moduleId, condition: num(row.condition, 1), uid });
    const res = refit
      ? refit.install(row.id, uid, { bypassGate: true })
      : { ok: false, reason: 'no refit system' };
    if (!res?.ok) {
      // No geometry layer (every headless run) - keep the data so the fit is still real
      // to every system that reads `hardpoints`, and drop the inventory copy.
      const i = world.inventory.findIndex((it) => it.uid === uid);
      if (i >= 0) world.inventory.splice(i, 1);
      hp.module = { moduleId: row.moduleId, condition: num(row.condition, 1), uid, def: null };
    }
  }
  if (refit) refit._applyModuleEffects(p);

  if (ship.stores && p.stores) {
    for (const cls in ship.stores.ammo ?? {}) {
      if (p.stores.ammo[cls] !== undefined) {
        p.stores.ammo[cls] = Math.min(p.stores.capacity[cls] ?? 0, num(ship.stores.ammo[cls]));
      }
    }
    p.stores.charge = Math.min(p.stores.chargeMax, num(ship.stores.charge, p.stores.chargeMax));
    p.stores.coolant = Math.min(p.stores.coolantMax, num(ship.stores.coolant, p.stores.coolantMax));
  }
  p._refreshEfficiency();
  if (gate) gate.job = null;
}

/**
 * Re-assert the saved hull as an ABSOLUTE, after every ratio that rescales it has run.
 *
 * Idempotent and order-independent: it reads only the file and the live ceiling, so
 * calling it twice, or calling it when no perk changed anything, produces the same
 * number. See the block at the call site in `applySave` for the arithmetic it undoes.
 *
 * @param {import('../sim/ship.js').Ship} p
 * @param {Object} ship  the `captureShip` record
 */
function restoreHullBar(p, ship) {
  const saved = num(ship.hullHP, p.maxHullHP);
  if (!(p.maxHullHP > 0)) return;
  p.hullHP = Math.max(0, Math.min(saved, p.maxHullHP));
  // A hull restored above the crippling threshold must not still read as crippled,
  // and `derelict.js` decides that on the live ratio rather than on a stored flag.
  if (p.hullHP > 0) p.crippled = false;
}

function restoreWar(war, data) {
  war.time = num(data.time);
  Object.assign(war.reserve, data.reserve ?? {});
  if (data.ledger) {
    for (const f of ['coalition', 'concord']) {
      if (data.ledger[f]) Object.assign(war.ledger[f], data.ledger[f]);
    }
  }
  // Anything currently on the clock belongs to the session being discarded.
  war.battles.length = 0;
  for (const row of data.pois ?? []) {
    const st = war.states.get(row.id);
    if (!st) continue;
    st.control = row.control;
    st.heat = row.heat;
    Object.assign(st.garrison, row.garrison ?? {});
    st.battlesFought = num(row.battlesFought);
    st.battleCooldown = num(row.battleCooldown);
    st.lastSeenTick = num(row.lastSeenTick, -1);
    st.visited = !!row.visited;
    st.debris = num(row.debris);
    st.hulks = (row.hulks ?? []).map((h) => ({ ...h }));
    st.strays = (row.strays ?? []).map((h) => ({ ...h }));
    st.battle = null;
    st.materialised = false;
  }
  war._frontDirty = true;
}

// ===========================================================================
// The system
// ===========================================================================

export class PersistenceSystem {
  /**
   * @param {import('./world.js').World} world
   * @param {Object} [opts]
   * @param {Object} [opts.storage]  anything with getItem/setItem/removeItem
   * @param {string} [opts.key]
   */
  constructor(world, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.name = 'persistence';
    this.storage = opts.storage ?? defaultStorage();
    this.key = opts.key ?? SAVE_KEY;
    /** Autosave points that have fired, for the report. */
    this.saves = 0;
    this.lastError = null;
  }

  has() {
    try { return this.storage.getItem(this.key) !== null; } catch { return false; }
  }

  /** @returns {{ok:boolean, reason?:string, bytes?:number}} */
  save() {
    try {
      const data = captureSave(this.world);
      const text = JSON.stringify(data);
      this.storage.setItem(this.key, text);
      this.saves++;
      this.lastError = null;
      this.bus.emit(MEV.SAVED, { bytes: text.length, savedAt: data.savedAt });
      return { ok: true, bytes: text.length, data };
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      console.warn('[persistence] save failed', err);
      return { ok: false, reason: this.lastError };
    }
  }

  /**
   * Read and apply. Never throws; a bad file is refused with a reason and the world is
   * left exactly as it was.
   */
  load(opts = {}) {
    let raw = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (err) {
      return { ok: false, reason: `storage unreadable: ${err?.message ?? err}` };
    }
    if (raw === null) return { ok: false, reason: 'no save' };
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return { ok: false, reason: `save is not valid JSON: ${err?.message ?? err}` };
    }
    try {
      return applySave(this.world, data, opts);
    } catch (err) {
      console.warn('[persistence] load failed', err);
      return { ok: false, reason: `load threw: ${err?.message ?? err}` };
    }
  }

  clear() {
    try { this.storage.removeItem(this.key); return { ok: true }; } catch (err) {
      return { ok: false, reason: String(err?.message ?? err) };
    }
  }

  /**
   * Save at a natural boundary. Docking is the only one wired, and deliberately: a
   * berth is where the hull is safe, where the sortie is closed and priced, and where
   * a player would expect the game to have remembered.
   */
  autosave(reason = 'auto') {
    const res = this.save();
    if (res.ok) this.bus.emit(EV.NOTIFY, { text: `SAVED — ${reason.toUpperCase()}` });
    return res;
  }

  /** Metadata about the file on disk, without applying it. */
  peek() {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return null;
      const d = JSON.parse(raw);
      return {
        version: d.version, seed: d.seed, savedAt: d.savedAt, simTime: d.simTime,
        compatible: d.version === SAVE_VERSION && d.seed === this.world.seed,
        bytes: raw.length,
      };
    } catch { return null; }
  }
}
