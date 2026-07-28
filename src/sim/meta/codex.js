import { allModules, allShipClasses, allItems, getModule, getShipClass, getItem } from '../../core/contracts.js';
import { EV } from '../../core/events.js';
import { MEV } from './events.js';
import { moduleVolume, volumeClassOf } from './cargo.js';
import { MATERIAL_DEFS } from './materials.js';
import { patternCost } from './patterns.js';

/**
 * THE CODEX — the data layer.
 *
 * `beta-decay-systems.md` #2 calls this the highest knowledge-per-cost item in the
 * document, and the reason is §3.3: Beta Decay has no skill trees, and it publishes a
 * 289-entry database, and *those two facts are the same fact*. The player's power curve
 * is what they own and what they know. Our brief rules out character progression
 * separate from the ship; the codex is what makes that a design position instead of an
 * absence.
 *
 * This file is DATA AND A READ API ONLY. It draws no pixels. A later UI pass renders
 * `entries()` as cards; the card discipline it should adopt is Beta Decay's exactly -
 * fixed frame, variable slots, one-sentence functional description, `--` where a value
 * does not apply rather than a hidden row.
 *
 * DISCOVERY STATES, in strictly increasing order of knowledge:
 *
 *   unknown    never encountered. The entry exists, the fields are masked.
 *   seen       observed on a hull, in a wreck, or in a hold. Class and origin known.
 *   scanned    resolved by a survey pulse or by targeting. Full statistics known.
 *   salvaged   you have physically held one. Salvage and pattern data known.
 *   installed  you have flown with one. Everything known.
 *
 * A state never regresses. That monotonicity is what makes it progression rather than
 * a cache of what is on screen.
 *
 * The perk layer reads `count('salvaged')`-style figures as its knowledge gates, which
 * is the interlock that stops this being an encyclopaedia nobody has a reason to open.
 */

export const DISCOVERY_STATES = ['unknown', 'seen', 'scanned', 'salvaged', 'installed'];
const RANK = Object.fromEntries(DISCOVERY_STATES.map((s, i) => [s, i]));

/** Entry categories. Every registry in the game shows up in exactly one of these. */
export const CODEX_CATEGORIES = ['module', 'ship', 'item', 'material'];

export class CodexSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.name = 'codex';

    /** @type {Map<string, {state:string, firstSeen:number, count:number}>} */
    this.state = new Map();

    this._offs = [];
    this._bind();
  }

  // --- writing --------------------------------------------------------------

  _key(category, id) { return `${category}:${id}`; }

  /** Raise an entry's discovery state. Never lowers it. Returns true if it moved. */
  mark(category, id, state) {
    if (!id || !RANK[state]) return false;
    const key = this._key(category, id);
    let rec = this.state.get(key);
    if (!rec) {
      rec = { state: 'unknown', firstSeen: this.world.time ?? 0, count: 0 };
      this.state.set(key, rec);
    }
    rec.count++;
    if (RANK[state] <= RANK[rec.state]) return false;
    const from = rec.state;
    rec.state = state;
    this.bus?.emit(MEV.CODEX_UPDATED, { category, id, from, to: state });
    return true;
  }

  markModule(id, state) { return this.mark('module', id, state); }
  markShipClass(id, state) { return this.mark('ship', id, state); }
  markItem(id, state) { return this.mark('item', id, state); }
  markMaterial(id, state) { return this.mark('material', id, state); }

  stateOf(category, id) {
    return this.state.get(this._key(category, id))?.state ?? 'unknown';
  }

  /** How many entries in a category are at least this well known. */
  count(category, atLeast = 'seen') {
    let n = 0;
    const floor = RANK[atLeast] ?? 1;
    for (const [key, rec] of this.state) {
      if (!key.startsWith(`${category}:`)) continue;
      if (RANK[rec.state] >= floor) n++;
    }
    return n;
  }

  /** 0..1 completion, for a progress readout and for perk gates. */
  completion(category = 'module') {
    const total = this._total(category);
    if (!total) return 0;
    return this.count(category, 'seen') / total;
  }

  _total(category) {
    switch (category) {
      case 'module': return allModules().length;
      case 'ship': return allShipClasses().length;
      case 'item': return allItems().length;
      case 'material': return MATERIAL_DEFS.length;
      default: return 0;
    }
  }

  // --- listening ------------------------------------------------------------

  /**
   * Everything that teaches the player something raises an entry. All of it comes off
   * events that already exist, which is why this system costs nothing to keep true.
   */
  _bind() {
    const on = (type, fn) => this._offs.push(this.bus.on(type, fn));

    on(EV.SHIP_SPAWNED, (ship) => {
      if (!ship || ship.isPlayer) return;
      this.markShipClass(ship.classDef?.id, 'seen');
    });

    on(EV.SHIP_DESTROYED, ({ ship }) => {
      this.markShipClass(ship?.classDef?.id, 'scanned');
    });

    on(EV.SALVAGE_CUT_START, ({ wreck, section }) => {
      this.markShipClass(wreck?.sourceClass?.id, 'scanned');
      if (section?.moduleId) this.markModule(section.moduleId, 'seen');
    });

    on(EV.SALVAGE_ACQUIRED, ({ kind, module, section }) => {
      if (kind === 'module' && module) this.markModule(module.id, 'salvaged');
      if (section?.moduleId) this.markModule(section.moduleId, 'seen');
    });

    on(EV.MODULE_INSTALLED, ({ module }) => {
      this.markModule(module?.id, 'installed');
    });

    on(MEV.ITEM_ACQUIRED, ({ itemId }) => this.markItem(itemId, 'salvaged'));
    on(MEV.ITEM_USED, ({ itemId }) => this.markItem(itemId, 'installed'));
    on(MEV.SCRAP_ACQUIRED, ({ grade }) => this.markMaterial(grade, 'salvaged'));
    on(MEV.REFINED, (yields) => {
      for (const k in yields) this.markMaterial(k, 'salvaged');
    });
  }

  // =========================================================================
  // READ API. This is the whole surface a codex screen needs.
  // =========================================================================

  /**
   * One entry, in Beta Decay's card shape: a name, a one-sentence functional
   * description, and a fixed set of labelled slots that read `--` when they do not
   * apply. Fields above the entry's discovery state are masked rather than omitted, so
   * the shape of what you do not know is itself visible.
   *
   * @returns {{id, category, name, description, state, known, fields:Array<{label,value}>,
   *            links:Array<{category,id,name,relation}>}}
   */
  entry(category, id) {
    switch (category) {
      case 'module': return this._moduleEntry(getModule(id));
      case 'ship': return this._shipEntry(getShipClass(id));
      case 'item': return this._itemEntry(getItem(id));
      case 'material': return this._materialEntry(MATERIAL_DEFS.find((m) => m.id === id));
      default: return null;
    }
  }

  /**
   * Every entry, optionally filtered.
   * @param {Object} [opts] {category, hardpoint, faction, minState, includeUnknown}
   */
  entries(opts = {}) {
    const cats = opts.category ? [opts.category] : CODEX_CATEGORIES;
    const out = [];
    for (const cat of cats) {
      const defs = cat === 'module' ? allModules()
        : cat === 'ship' ? allShipClasses()
          : cat === 'item' ? allItems()
            : MATERIAL_DEFS;
      for (const def of defs) {
        const e = this.entry(cat, def.id);
        if (!e) continue;
        if (opts.hardpoint && e.hardpoint !== opts.hardpoint) continue;
        if (opts.faction && e.faction !== opts.faction) continue;
        if (opts.minState && RANK[e.state] < RANK[opts.minState]) continue;
        if (opts.includeUnknown === false && e.state === 'unknown') continue;
        out.push(e);
      }
    }
    return out;
  }

  /** Headline numbers for a codex header and for the perk gates. */
  progress() {
    const out = {};
    for (const cat of CODEX_CATEGORIES) {
      out[cat] = {
        total: this._total(cat),
        seen: this.count(cat, 'seen'),
        scanned: this.count(cat, 'scanned'),
        salvaged: this.count(cat, 'salvaged'),
        installed: this.count(cat, 'installed'),
      };
    }
    out.knowledge = this._knowledgeScore();
    return out;
  }

  /**
   * One number that stands for "how much this player knows". Perk gates read it, and
   * because it weights holding and flying a thing above seeing it, it cannot be farmed
   * by flying past things.
   */
  _knowledgeScore() {
    let score = 0;
    for (const rec of this.state.values()) score += RANK[rec.state];
    return score;
  }

  // --- card builders --------------------------------------------------------

  _mask(state, atLeast, value) {
    return RANK[state] >= RANK[atLeast] ? value : '--';
  }

  _moduleEntry(def) {
    if (!def) return null;
    const state = this.stateOf('module', def.id);
    const w = def.weapon;
    const g = def.grants ?? {};
    const cost = patternCost(def);
    const known = state !== 'unknown';
    const grants = Object.keys(g).length
      ? Object.entries(g).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' · ')
      : '--';
    return {
      id: def.id,
      category: 'module',
      name: known ? def.name : 'UNIDENTIFIED FITTING',
      description: known ? (def.description ?? '') : 'No survey data. Cut one free, or run a survey pulse.',
      state,
      known,
      hardpoint: def.hardpoint,
      faction: def.faction,
      tier: def.tier,
      fields: [
        { label: 'Class', value: `${def.hardpoint} · tier ${def.tier}` },
        { label: 'Origin', value: def.faction },
        { label: 'Mass', value: this._mask(state, 'scanned', `${def.mass ?? '--'} t`) },
        { label: 'Volume', value: this._mask(state, 'scanned', `${moduleVolume(def)} m3`) },
        { label: 'Stows as', value: this._mask(state, 'scanned', volumeClassOf(def)) },
        { label: 'Weapon', value: this._mask(state, 'scanned', w ? `${w.name} (${w.type})` : '--') },
        { label: 'Range', value: this._mask(state, 'scanned', w ? `${w.range} m` : '--') },
        { label: 'Damage', value: this._mask(state, 'scanned', w ? `${w.damage} × ${w.shotsPerBurst}` : '--') },
        { label: 'Arc', value: this._mask(state, 'scanned', w?.yawWidth ? `${Math.round((w.yawWidth * 180) / Math.PI)}°` : '--') },
        { label: 'Grants', value: this._mask(state, 'scanned', grants) },
        { label: 'Pattern', value: this._mask(state, 'salvaged', this._costText(cost)) },
        { label: 'Seen', value: state },
      ],
      links: this._moduleLinks(def, state),
    };
  }

  _moduleLinks(def, state) {
    const links = [];
    // Which hulls carry one. This is the cross-link that turns the codex into a
    // shopping list: read the entry, learn where to go and what to shoot carefully.
    if (RANK[state] >= RANK.scanned) {
      for (const ship of allShipClasses()) {
        if (ship.faction !== def.faction) continue;
        const carries = (ship.weapons ?? []).some((sw) => def.weapon && sw.type === def.weapon.type);
        if (carries) links.push({ category: 'ship', id: ship.id, name: ship.name, relation: 'carried by' });
      }
    }
    // What it is made of, and therefore what breaking one down would give you.
    const grade = def.weapon ? 'machine' : (def.grants?.powerOutput || def.grants?.sensorRange) ? 'core' : 'plate';
    links.push({ category: 'material', id: grade, name: `${grade} scrap`, relation: 'breaks down into' });
    return links;
  }

  _shipEntry(def) {
    if (!def) return null;
    const state = this.stateOf('ship', def.id);
    const known = state !== 'unknown';
    const subs = def.subsystems ?? [];
    const reactor = subs.filter((s) => s.kind === 'reactor').length;
    return {
      id: def.id,
      category: 'ship',
      name: known ? def.name : 'UNKNOWN HULL',
      description: known
        ? `${def.faction} ${def.role}, ${def.length} m, ${subs.length} targetable subsystems.`
        : 'Mass signature only. No classification.',
      state,
      known,
      faction: def.faction,
      role: def.role,
      fields: [
        { label: 'Class', value: `${def.role} · ${def.faction}` },
        { label: 'Length', value: this._mask(state, 'seen', `${def.length} m`) },
        { label: 'Mass', value: this._mask(state, 'scanned', `${def.mass} t`) },
        { label: 'Hull', value: this._mask(state, 'scanned', String(def.hullHP)) },
        { label: 'Max speed', value: this._mask(state, 'scanned', `${def.maxSpeed} m/s`) },
        { label: 'Turn rate', value: this._mask(state, 'scanned', `${def.turnRate} rad/s`) },
        { label: 'Subsystems', value: this._mask(state, 'scanned', subs.map((s) => s.label ?? s.id).join(' · ') || '--') },
        { label: 'Reactors', value: this._mask(state, 'scanned', reactor ? `${reactor} — a reactor kill floors salvage to 15%` : '--') },
        { label: 'Weapons', value: this._mask(state, 'scanned', (def.weapons ?? []).map((w) => w.type).join(' · ') || '--') },
        { label: 'Seen', value: state },
      ],
      links: subs.map((s) => ({
        category: 'material',
        id: s.kind === 'weapon' || s.kind === 'engine' ? 'machine' : s.kind === 'hangar' || s.kind === 'reactor' || s.kind === 'sensor' ? 'core' : 'plate',
        name: `${s.label ?? s.id}`,
        relation: 'section yields',
      })),
    };
  }

  _itemEntry(def) {
    if (!def) return null;
    const state = this.stateOf('item', def.id);
    return {
      id: def.id,
      category: 'item',
      name: def.name,
      description: def.description,
      state,
      known: true,   // items are documented equipment, not field discoveries
      fields: [
        { label: 'Class', value: def.kind },
        { label: 'Volume', value: `${def.volume} m3` },
        { label: 'Stack', value: String(def.maxStack ?? 1) },
        { label: 'Requires', value: def.requires ?? '--' },
        { label: 'Fabricate', value: this._costText(def.buildCost) },
        { label: 'Seen', value: state },
      ],
      links: Object.keys(def.buildCost ?? {}).map((k) => ({
        category: 'material', id: k, name: k, relation: 'fabricated from',
      })),
    };
  }

  _materialEntry(def) {
    if (!def) return null;
    const state = this.stateOf('material', def.id);
    const fields = [
      { label: 'Class', value: `tier ${def.tier} · ${def.tier === 0 ? 'scrap' : 'refined'}` },
      { label: 'Source', value: def.source },
    ];
    if (def.refinesTo) {
      fields.push({
        label: 'Refines to',
        value: Object.entries(def.refinesTo).map(([k, v]) => `${k} ${v.toFixed(2)}/unit`).join(' · '),
      });
    }
    if (def.consumedBy) fields.push({ label: 'Consumed by', value: def.consumedBy });
    fields.push({ label: 'Seen', value: state });
    return {
      id: def.id,
      category: 'material',
      name: def.name,
      description: def.description,
      state,
      known: true,
      fields,
      links: def.refinesTo
        ? Object.keys(def.refinesTo).map((k) => ({ category: 'material', id: k, name: k, relation: 'refines to' }))
        : [],
    };
  }

  _costText(cost) {
    if (!cost) return '--';
    const parts = Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`);
    return parts.length ? parts.join(' · ') : '--';
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
  }
}
