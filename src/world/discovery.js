/**
 * DISCOVERY.
 *
 * How the map fills in. Three channels, in ascending order of importance, exactly as
 * specified in docs/design/controls.md 5.6:
 *
 *   1. PASSIVE CONTACT. Anything inside sensor range resolves by itself, named and
 *      classified. This covers where you already are and nothing else.
 *
 *   2. LONG-RANGE SURVEY. A 35 degree cone out to 300 km over 30 s of sim time,
 *      requiring three sensor pips. It returns UNRESOLVED BLIPS - bearing, rough mass,
 *      rough range, no name - so a sweep tells you something hulk-sized is out there
 *      and nothing else. And it is not free: an active sweep triples your own
 *      signature for its duration and both factions get a fix on you, which is a heat
 *      spike on every POI in reach. Looking costs.
 *
 *   3. INTEL - the primary channel. Salvaged nav computers and transponder caches.
 *      Roughly one wreck in three yields an exact fix on one or two further POIs:
 *      name, coordinates, kind. That is the load-bearing coupling in the whole game -
 *      the exploration layer and the salvage layer are the SAME LOOP. You find the
 *      next place by taking apart this one.
 *
 * Start state is one known POI and two blips. Everything else is dark, and stays dark
 * until the player earns it.
 */

import { EV } from '../core/events.js';
import { KM, RANGE } from '../core/units.js';

const SURVEY = {
  coneRad: (35 * Math.PI) / 180,
  range: 300 * KM,
  duration: 30,
  pipsRequired: 3,
  signatureMul: 3,
  heatSpikePeriod: 6,
  heatSpike: 0.03,
};

/** Rough mass class from hull-ish scale, for an unresolved signature label. */
function massClass(node) {
  switch (node.kind) {
    case 'station': return 2600;
    case 'yard': return 3400;
    case 'giant': return 9000;
    case 'star': return 12000;
    case 'graveyard': return 3400;
    default: return 1800;
  }
}

export class DiscoverySystem {
  constructor(world, system, war, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.system = system;
    this.war = war;
    this.rng = world.rng.fork('discovery');
    this.intelRng = this.rng.fork('intel');

    this.name = 'discovery';
    this.order = 28;

    /** @type {Set<string>} POIs the player can name and plot to. */
    this.known = new Set();
    /**
     * Unresolved mass signatures. Keyed by POI id but deliberately NOT admitting it -
     * the overlay renders them as `MASS SIG · ~3400 m · UNRESOLVED · brg 214`.
     * @type {Map<string, Object>}
     */
    this.blips = new Map();

    this.survey = { active: false, bearing: 0, remaining: 0, spikeIn: 0, found: 0 };
    this._intelRolled = new Set();
    this._lastCutWreck = null;
    this._passiveIn = 0;

    this._bind();
    this._seed(opts.startPOI ?? system.nodes[0].id, opts.startBlips ?? 2);
  }

  // --- queries --------------------------------------------------------------

  isKnown(id) { return this.known.has(id); }
  isBlip(id) { return this.blips.has(id); }

  /** Everything the overlay may draw: named POIs first, then anonymous signatures. */
  contacts() {
    const out = [];
    for (const id of this.known) {
      const node = this.system.get(id);
      if (node) out.push({ id, resolved: true, node });
    }
    for (const [id, blip] of this.blips) {
      out.push({ id, resolved: false, ...blip });
    }
    return out;
  }

  /** POIs the travel layer will accept as a destination. */
  destinations() {
    const out = [];
    for (const id of this.known) {
      const node = this.system.get(id);
      if (node) out.push(node);
    }
    return out;
  }

  // --- channels -------------------------------------------------------------

  /**
   * Resolve a POI outright. `source` is carried into the notification because "a nav
   * computer told you" and "you flew close enough to see it" should not read the same.
   */
  reveal(id, source = 'sensors') {
    if (this.known.has(id)) return false;
    const node = this.system.get(id);
    if (!node) return false;
    this.known.add(id);
    this.blips.delete(id);
    this.bus.emit(EV.NOTIFY, {
      text: source === 'intel'
        ? `INTEL — ${node.name} located`
        : `CONTACT RESOLVED — ${node.name}`,
      important: true,
    });
    return true;
  }

  /** Register an unresolved signature. Silently ignored for anything already named. */
  contact(id, fromPosition = null) {
    if (this.known.has(id) || this.blips.has(id)) return false;
    const node = this.system.get(id);
    if (!node) return false;
    const origin = fromPosition ?? this.world.player?.position ?? this.system.nodes[0].position;
    const dx = node.position.x - origin.x;
    const dz = node.position.z - origin.z;
    this.blips.set(id, {
      bearing: (Math.atan2(dx, dz) * 180) / Math.PI,
      range: Math.hypot(dx, dz),
      mass: massClass(node),
      x: node.position.x,
      z: node.position.z,
      at: this.war?.time ?? 0,
    });
    return true;
  }

  /**
   * Begin a directional sweep. Fails loudly and specifically - "not enough sensor
   * pips" is actionable, "cannot survey" is not.
   */
  beginSurvey(bearingRad) {
    if (this.survey.active) return { ok: false, reason: 'sweep already running' };
    const pips = this.sensorPips();
    if (pips < SURVEY.pipsRequired) {
      return { ok: false, reason: `NEEDS ${SURVEY.pipsRequired} SENSOR PIPS — have ${pips}` };
    }
    this.survey.active = true;
    this.survey.bearing = bearingRad;
    this.survey.remaining = SURVEY.duration;
    this.survey.spikeIn = 0;
    this.survey.found = 0;
    this.bus.emit(EV.NOTIFY, {
      text: `ACTIVE SWEEP — brg ${((bearingRad * 180) / Math.PI + 360) % 360 | 0} — SIGNATURE x${SURVEY.signatureMul}`,
      important: true,
    });
    return { ok: true };
  }

  cancelSurvey() {
    if (!this.survey.active) return;
    this.survey.active = false;
    this.survey.remaining = 0;
  }

  /** Reactor pips currently on the sensor channel. Four channels, twelve pips. */
  sensorPips() {
    const power = this.world.player?.power;
    if (!power) return SURVEY.pipsRequired;      // no ship yet: do not block the UI
    if (!power.unlocked) return SURVEY.pipsRequired;
    return Math.round((power.actual.sensors ?? 0.25) * 12);
  }

  /** Sensor reach, in metres, including whatever the fit grants. */
  sensorRange() {
    const player = this.world.player;
    const base = RANGE.sensorBase;
    if (!player) return base;
    const pips = player.power?.unlocked ? Math.round((player.power.actual.sensors ?? 0.25) * 12) : 3;
    return base * (0.7 + pips * 0.1);
  }

  /** The player's current sensor signature multiplier. Travel and the war read this. */
  get signatureMultiplier() {
    return this.survey.active ? SURVEY.signatureMul : 1;
  }

  // --- simulation -----------------------------------------------------------

  fixedUpdate(dt) {
    this._passiveIn -= dt;
    if (this._passiveIn <= 0) {
      this._passiveIn = 1;
      this._passive();
    }
    if (this.survey.active) this._updateSurvey(dt);
  }

  _passive() {
    const player = this.world.player;
    if (!player || player.dead) return;
    const reach = this.sensorRange();
    for (const node of this.system.nodes) {
      if (this.known.has(node.id)) continue;
      const d = node.position.distanceTo(player.position);
      // A POI is a big object; you see it from further away than you see a frigate.
      if (d <= reach + node.radius) this.reveal(node.id, 'sensors');
    }
  }

  _updateSurvey(dt) {
    const player = this.world.player;
    if (!player || player.dead) { this.cancelSurvey(); return; }

    this.survey.remaining -= dt;
    this.survey.spikeIn -= dt;

    // An active sweep is a shout. Both sides hear it, and heat is the shape that
    // takes: patrols move toward whatever just lit them up.
    if (this.survey.spikeIn <= 0 && this.war) {
      this.survey.spikeIn = SURVEY.heatSpikePeriod;
      for (const node of this.system.nodes) {
        if (node.position.distanceTo(player.position) > SURVEY.range) continue;
        this.war.bumpHeat(node.id, SURVEY.heatSpike);
      }
    }

    if (this.survey.remaining > 0) return;
    this.survey.active = false;

    const half = SURVEY.coneRad * 0.5;
    for (const node of this.system.nodes) {
      if (this.known.has(node.id) || this.blips.has(node.id)) continue;
      const dx = node.position.x - player.position.x;
      const dz = node.position.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d > SURVEY.range) continue;
      let rel = Math.atan2(dx, dz) - this.survey.bearing;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > half) continue;
      if (this.contact(node.id, player.position)) this.survey.found++;
    }

    this.bus.emit(EV.NOTIFY, {
      text: this.survey.found > 0
        ? `SWEEP COMPLETE — ${this.survey.found} unresolved mass signature${this.survey.found > 1 ? 's' : ''}`
        : 'SWEEP COMPLETE — nothing out there',
      important: true,
    });
  }

  // --- intel ----------------------------------------------------------------

  _bind() {
    this._offCut = this.bus.on(EV.SALVAGE_CUT_START, ({ wreck }) => {
      this._lastCutWreck = wreck ?? null;
    });

    this._offSalvage = this.bus.on(EV.SALVAGE_ACQUIRED, ({ section }) => {
      let wreck = this._lastCutWreck;
      if (section) {
        for (const w of this.world.wrecks) {
          if (w.sections.includes(section)) { wreck = w; break; }
        }
      }
      if (!wreck || this._intelRolled.has(wreck.id)) return;
      this._intelRolled.add(wreck.id);
      this._rollIntel(wreck);
    });

    // Cutting a place open resolves it whether or not it was on the map.
    this._offEnter = this.bus.on(EV.POI_ENTERED, ({ id }) => this.reveal(id, 'sensors'));
  }

  /**
   * One wreck in three carries something worth reading. When it does, it names the
   * nearest one or two places the player has not been - so intel points OUTWARD from
   * where the player already is, and the map opens in a broadly authored order without
   * anybody being railroaded.
   */
  _rollIntel(wreck) {
    if (this.intelRng.next() > 0.34) return;
    const origin = wreck.body?.position ?? this.world.player?.position;
    if (!origin) return;

    const candidates = [];
    for (const node of this.system.nodes) {
      if (this.known.has(node.id)) continue;
      candidates.push({ node, d: node.position.distanceTo(origin) });
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.d - b.d);

    const count = this.intelRng.bool(0.4) ? 2 : 1;
    let granted = 0;
    for (let i = 0; i < candidates.length && granted < count; i++) {
      // Weighted toward the nearest, but not deterministic - two identical runs of the
      // same POI should not hand out the same two destinations.
      if (i > 0 && this.intelRng.next() > 0.55) continue;
      if (this.reveal(candidates[i].node.id, 'intel')) granted++;
    }
    if (granted > 0) {
      this.bus.emit(EV.SALVAGE_ACQUIRED, { kind: 'intel', count: granted, source: wreck.name });
    }
  }

  _seed(startId, blipCount) {
    this.known.add(startId);
    const start = this.system.get(startId);
    if (!start) return;
    const ordered = this.system.nodes
      .filter((n) => n.id !== startId)
      .map((n) => ({ n, d: n.distanceTo(start) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(blipCount, ordered.length); i++) {
      this.contact(ordered[i].n.id, start.position);
    }
  }

  dispose() {
    this._offCut?.();
    this._offSalvage?.();
    this._offEnter?.();
  }
}
