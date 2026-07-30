/**
 * DISCOVERY — CONTACT RESOLUTION, TERRAIN AND PROBES.
 *
 * This file used to be binary. Anything inside `sensorRange()` snapped from nothing to
 * fully named; a survey sweep produced a `blip` that could never be sharpened except by
 * flying to it; and the terrain the environment stream had already built - 2,600 lines
 * of nebula, gas giant, belt and debris - changed no number in here at all.
 * `closest-comparables.md` §3.2 and §3.3 call both of those out, and this is the fix.
 *
 * ONE NUMBER CARRIES IT: `resolution`, 0..1, per contact.
 *
 *   < 0.15   nothing. There is no contact.
 *   < 0.45   MASS SIGNATURE. A bearing, a rough range, and an estimated tonnage with
 *            a visible error band. No name, no kind.
 *   < 0.80   CLASSIFIED. Kind is known ("STATION"), the tonnage band has tightened,
 *            the position fix is close. Still no name and still not plottable.
 *   >= 0.80  RESOLVED. Named, plottable, written into the codex.
 *
 * Resolution is earned by four things and lost to one:
 *
 *   RANGE      closeness^1.5 against your terrain-modified sensor reach
 *   DWELL      it accumulates per second, so sitting still and watching is a tactic
 *   SENSORS    the reactor channel scales the gain 0.55x (0 pips) to 1.45x (6 pips)
 *   PROBES     a deployed probe resolves from where IT is, not from where you are
 *   CLUTTER    terrain multiplies the gain down, to as little as 15% in a corona
 *
 * That last one is what gives the SENSORS power channel a combat purpose it did not
 * have. Before this change the channel bought a slightly larger passive-contact circle
 * and a permission check on the sweep, and nothing else - a quarter of the marquee power
 * system was strictly dominated. Now it decides how fast an unknown hull in a debris
 * field becomes a hull you can name, target by subsystem, and look up in the codex.
 *
 * Resolution NEVER regresses, for the same reason the codex's discovery states never do:
 * that monotonicity is what makes it progression instead of a cache of what is on screen.
 * What does go stale is the position fix, and `staleness` publishes that honestly.
 *
 * THE THREE CHANNELS from docs/design/controls.md 5.6 all survive, re-expressed:
 *
 *   1. PASSIVE   continuous resolution gain inside your reach. Free, slow, and the
 *                only channel terrain can shut off completely.
 *   2. SURVEY    a 35 degree cone to 300 km over 30 s, three sensor pips. It no longer
 *                creates a blip; it grants a lump of resolution to everything in the
 *                cone, so a second sweep on the same bearing is worth running. Still
 *                triples your signature and still spikes patrol heat everywhere in reach.
 *   3. INTEL     salvaged nav computers. Unchanged: one wreck in three names one or two
 *                unvisited places outright. The exploration layer IS the salvage layer.
 *
 *   4. PROBES    new. See the PROBE block below.
 */

import { EV } from '../core/events.js';
import { MEV } from '../sim/meta/events.js';
import { KM, RANGE } from '../core/units.js';
import { registerItem } from '../core/contracts.js';

const SURVEY = {
  coneRad: (35 * Math.PI) / 180,
  range: 300 * KM,
  duration: 30,
  pipsRequired: 3,
  signatureMul: 3,
  heatSpikePeriod: 6,
  heatSpike: 0.03,
  /** Resolution granted at the cone's centre-line, at zero range, in clear space. */
  resolveGain: 0.46,
};

const RESOLVE = {
  /** Seconds between resolution passes. Coarse: this is not a per-frame quantity. */
  period: 1.0,
  /** Resolution per second at point blank, three sensor pips, no clutter. */
  rate: 0.22,
  contact: 0.15,
  classified: 0.45,
  resolved: 0.80,
  pipBase: 0.55,
  pipStep: 0.15,
  /** Clutter 1.0 still leaves this fraction of the gain. Nothing is ever truly opaque. */
  clarityFloor: 0.15,
  /** Mass estimate error at zero resolution, as a fraction. */
  massBand: 0.55,
  /** Position fix error at zero resolution, metres. */
  posError: 38 * KM,
  /** Hulls resolve faster than places: they are radiating, and they are close. */
  shipRate: 0.30,
  shipReach: 1.35,
};

/**
 * Resolution a squawking escalation group is seeded at: a MASS SIGNATURE with a bearing
 * and an error band, deliberately below `RESOLVE.classified` so naming the thing is
 * still the sensor channel's job. See the `MEV.ESCALATION` binding in `_bind`.
 */
const SQUAWK = 0.30;

/**
 * PROBES, and the enemy-probe dilemma.
 *
 * A probe is a sensor you SPEND. It flies a bearing, it resolves contacts from where it
 * is rather than where you are, and it dies on a timer. Two modes, and the choice is the
 * whole point:
 *
 *   PASSIVE  half gain, silent. Nothing knows it is there.
 *   ACTIVE   full gain, and it pulses - which raises patrol heat AROUND THE PROBE, not
 *            around you. An active probe is a sensor and a lure in the same object.
 *
 * The counterpart is the decision `closest-comparables.md` §3.4 calls one of the best in
 * Falling Frontier's design. A faction that has heat on you drops a probe of its own.
 * While it is watching, your signature is multiplied - so every transit risk percentage
 * you are quoted goes up, and it is not a hidden modifier: `sensorProfile()` names it.
 *
 * You may kill it. You have to close to rail range to do it, and killing it:
 *   + cracks its recorder, which is a large resolution grant on everything it had seen
 *   - spikes patrol heat at every POI within survey range, because it stopped reporting
 *   - costs standing with its owner, who now knows exactly where you were
 *
 * Or you leave it, and stay watched, and it eventually expires on its own. There is no
 * right answer, which is the test a decision has to pass.
 */
const PROBE = {
  /**
   * Speed and life are sized against the authored map: 166-546 km between nearest
   * neighbours (`system.js`). 1800 m/s for 360 s is 648 km of travel plus a 110 km
   * reach, so ONE probe covers roughly ONE neighbouring POI and no more. That is the
   * granularity that makes it a decision - you are choosing a direction, not buying
   * omniscience - and it is why the item stacks to six rather than to one.
   */
  speed: 1800,
  life: 360,
  reach: 110 * KM,
  /** A probe's sensor is fixed: it does not benefit from your reactor routing. */
  pips: 3,
  activeGain: 1.0,
  passiveGain: 0.45,
  pulsePeriod: 10,
  pulseHeat: 0.014,

  enemyReach: 120 * KM,
  /** How much louder you are while an enemy probe has a fix on you. */
  watchedSignature: 1.7,
  enemyLife: 420,
  enemyCheckPeriod: 30,
  /** Local patrol heat below which nobody bothers spending a probe on you. */
  enemyHeatFloor: 0.28,
  enemySpeed: 260,

  killRange: RANGE.rail,
  killIntelGain: 0.5,
  killHeat: 0.09,
  killRep: -3,
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

/** MASS SIG / CLASSIFIED / RESOLVED, from one number. */
function tierOf(resolution) {
  if (resolution >= RESOLVE.resolved) return 'resolved';
  if (resolution >= RESOLVE.classified) return 'classified';
  if (resolution >= RESOLVE.contact) return 'signature';
  return 'none';
}

/**
 * One contact. Allocated once per POI at construction and never again, so the resolution
 * pass is a walk over fourteen objects with no garbage.
 *
 * The error terms are FIXED PER CONTACT. An estimate that re-rolled every second would
 * shimmer on the overlay and would let a patient player average the noise away, which is
 * exactly the wrong incentive - the way to sharpen an estimate is to look harder at it.
 */
class Contact {
  constructor(node, rng) {
    this.id = node.id;
    this.node = node;
    this.resolution = 0;
    this.trueMass = massClass(node);
    this._massJitter = rng.signed();
    this._posAngle = rng.next() * Math.PI * 2;
    this.bearing = 0;
    this.range = 0;
    this.firstSeen = -1;
    this.lastSeen = -1;
    this.observedFor = 0;
    this.source = 'sensors';
    /** Where the last gain came from: passive | survey | probe | intel | arrival. */
    this.via = 'passive';
    this._row = null;
  }

  get tier() { return tierOf(this.resolution); }
  get detected() { return this.resolution >= RESOLVE.contact; }
  get resolved() { return this.resolution >= RESOLVE.resolved; }

  /** Fraction of the true value the estimate may be out by, either way. */
  get errorFraction() {
    return RESOLVE.massBand * (1 - this.resolution) ** 1.5;
  }

  /** Estimated tonnage, rounded to a plausible reading rather than to the truth. */
  get massEstimate() {
    const est = this.trueMass * (1 + this._massJitter * this.errorFraction);
    return Math.round(est / 50) * 50;
  }

  get massError() {
    return Math.round((this.trueMass * this.errorFraction) / 50) * 50;
  }

  /** Radius of the position fix, metres. Zero once resolved. */
  get positionError() {
    return RESOLVE.posError * (1 - this.resolution) ** 2;
  }

  /** Estimated position: true position pushed off along a fixed bearing by the error. */
  get x() { return this.node.position.x + Math.cos(this._posAngle) * this.positionError; }
  get z() { return this.node.position.z + Math.sin(this._posAngle) * this.positionError; }

  /** What the overlay may say about it, by tier. */
  get label() {
    switch (this.tier) {
      case 'resolved': return this.node.name;
      case 'classified': return `UNIDENTIFIED ${String(this.node.kind).toUpperCase()}`;
      default: return 'MASS SIGNATURE';
    }
  }
}

/** A deployed probe, ours or theirs. */
class Probe {
  constructor({ id, faction, x, z, bearing, mode, life, speed, reach, owner }) {
    this.id = id;
    this.faction = faction;
    this.owner = owner;             // 'player' | 'hostile'
    this.x = x;
    this.z = z;
    this.bearing = bearing;
    this.mode = mode;               // 'passive' | 'active'
    this.speed = speed;
    this.reach = reach;
    this.life = life;
    this.remaining = life;
    this.pulseIn = 0;
    this.dead = false;
    /** Contacts this probe has contributed to. Cracked open on a kill. */
    this.seen = new Set();
    this._row = null;
  }

  get age() { return this.life - this.remaining; }
}

export class DiscoverySystem {
  constructor(world, system, war, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.system = system;
    this.war = war;
    this.rng = world.rng.fork('discovery');
    this.intelRng = this.rng.fork('intel');
    this.probeRng = this.rng.fork('probes');

    this.name = 'discovery';
    this.order = 28;

    /**
     * Every POI, always, from the first frame - at resolution 0. Pre-allocating the
     * whole table is what lets the resolution pass allocate nothing.
     * @type {Map<string, Contact>}
     */
    this.contactsById = new Map();
    for (const node of system.nodes) {
      this.contactsById.set(node.id, new Contact(node, this.rng.fork(`contact:${node.id}`)));
    }

    /**
     * LEGACY VIEWS. `known` and `blips` are what the probe tooling and any UI written
     * against the old file read. They are derived from `resolution` and kept in sync in
     * exactly one place (`_syncLegacy`), so they cannot drift.
     * @type {Set<string>}
     */
    this.known = new Set();
    /** @type {Map<string, Object>} */
    this.blips = new Map();

    /**
     * Hull contacts. Keyed by ship, pruned when a ship leaves the world. This is where
     * the sensors channel earns its combat keep: an unresolved hostile is a tonnage
     * estimate, and only a resolved one writes its class and its modules into the codex.
     * @type {Map<Object, Object>}
     */
    this.shipContacts = new Map();

    /** @type {Probe[]} live probes, ours and theirs. */
    this.probes = [];
    this._probeSeq = 0;
    this._enemyCheckIn = PROBE.enemyCheckPeriod;

    this.survey = { active: false, bearing: 0, remaining: 0, spikeIn: 0, found: 0, gained: 0 };
    this._intelRolled = new Set();
    this._lastCutWreck = null;
    this._sinceScan = 0;
    this._clock = 0;
    this._terrainAge = 1;

    /** Terrain reading at the player, refreshed on a short cadence. Never reallocated. */
    this.terrain = {
      id: 'open', name: 'OPEN SPACE', poiId: null, weight: 0,
      signature: 1, sensor: 1, clutter: 0,
    };
    /** Terrain scratch for probe sampling. Allocated here so the pass never allocates. */
    this._probeTerrain = {
      id: 'open', name: 'OPEN SPACE', poiId: null, weight: 0,
      signature: 1, sensor: 1, clutter: 0,
    };
    /** Set while seeding, so the opening state does not arrive as a wall of toasts. */
    this._quiet = false;

    this._contactRows = [];
    this._shipRows = [];
    this._probeRows = [];

    this._bind();
    this._seed(opts.startPOI ?? system.nodes[0].id, opts.startBlips ?? 2);
  }

  // --- queries --------------------------------------------------------------

  isKnown(id) { return this.known.has(id); }
  isBlip(id) { return this.blips.has(id); }

  /** 0..1. The one number the whole layer is built on. */
  resolutionOf(id) { return this.contactsById.get(id)?.resolution ?? 0; }

  /** Everything the overlay may draw. Detected contacts only, named ones first. */
  contacts() {
    const out = [];
    for (const c of this.contactsById.values()) {
      if (!c.detected) continue;
      out.push({
        id: c.id,
        resolved: c.resolved,
        resolution: c.resolution,
        tier: c.tier,
        label: c.label,
        bearing: c.bearing,
        range: c.range,
        mass: c.massEstimate,
        massError: c.massError,
        x: c.x,
        z: c.z,
        node: c.resolved ? c.node : null,
        at: c.firstSeen,
      });
    }
    out.sort((a, b) => b.resolution - a.resolution);
    return out;
  }

  /** POIs the travel layer will accept as a destination. Resolved only. */
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
    const c = this.contactsById.get(id);
    if (!c || c.resolved) return false;
    c.source = source;
    c.via = source === 'intel' ? 'intel' : 'arrival';
    this._gain(c, 1, source === 'intel' ? 'intel' : 'arrival');
    return true;
  }

  /**
   * Register an unresolved signature. Kept for callers that want to hand the player a
   * bare contact without saying what it is - it now sets a floor on resolution rather
   * than writing into a separate blip table.
   */
  contact(id, fromPosition = null, resolution = RESOLVE.contact + 0.1) {
    const c = this.contactsById.get(id);
    if (!c || c.resolution >= resolution) return false;
    const origin = fromPosition ?? this.world.player?.position ?? this.system.nodes[0].position;
    this._updateGeometry(c, origin.x, origin.z);
    this._gain(c, resolution - c.resolution, 'survey');
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
    this.survey.gained = 0;
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

  /**
   * Sensor reach, in metres, including whatever the fit grants AND whatever the terrain
   * takes away. A corona cuts this to 30% - "sensors are useless and everyone knows it"
   * is Perihelion's authored blurb and it is now a number.
   */
  sensorRange() {
    return this.baseSensorRange() * this.terrain.sensor;
  }

  /** Reach before terrain. Useful for a UI that wants to show what is being lost. */
  baseSensorRange() {
    const player = this.world.player;
    const base = RANGE.sensorBase;
    if (!player) return base;
    const pips = player.power?.unlocked ? Math.round((player.power.actual.sensors ?? 0.25) * 12) : 3;
    return base * (0.7 + pips * 0.1);
  }

  /**
   * The player's current sensor signature multiplier. Travel and the war read this, and
   * it is now the sum of three separate decisions rather than one flag: whether you are
   * sweeping, where you are sitting, and whether you have let a probe watch you.
   */
  get signatureMultiplier() {
    return this.emissionMultiplier * this.terrain.signature;
  }

  /**
   * The part of the signature that travels WITH the ship - sweeping and being watched -
   * with terrain factored out. The travel plotter needs this separately because it
   * samples terrain nine times along a leg and cannot use a figure taken at the origin.
   */
  get emissionMultiplier() {
    let m = this.survey.active ? SURVEY.signatureMul : 1;
    if (this.watched) m *= PROBE.watchedSignature;
    return m;
  }

  /** True while a hostile probe has a fix on the player. */
  get watched() {
    for (const p of this.probes) {
      if (p.owner === 'hostile' && !p.dead && p.hasFix) return true;
    }
    return false;
  }

  // --- simulation -----------------------------------------------------------

  fixedUpdate(dt) {
    this._clock += dt;

    // Terrain is sampled on a short cadence rather than per step. Fourteen distance
    // checks four times a second is free; doing it in `signatureMultiplier` - which the
    // travel plotter calls in a loop - would not be.
    this._terrainAge += dt;
    if (this._terrainAge >= 0.25) {
      this._terrainAge = 0;
      this._sampleTerrain();
    }

    this._updateProbes(dt);

    this._sinceScan += dt;
    if (this._sinceScan >= RESOLVE.period) {
      const step = this._sinceScan;
      this._sinceScan = 0;
      this._resolvePass(step);
      this._resolveShips(step);
    }

    if (this.survey.active) this._updateSurvey(dt);
  }

  _sampleTerrain() {
    const p = this.world.player;
    const t = this.terrain;
    if (!p) {
      t.id = 'open'; t.name = 'OPEN SPACE'; t.poiId = null;
      t.weight = 0; t.signature = 1; t.sensor = 1; t.clutter = 0;
      return;
    }
    this.system.terrainAt(p.position.x, p.position.z, t);
  }

  /**
   * The passive channel, once a second.
   *
   * Gain is `rate * closeness^1.5 * pipFactor * clarity`. The exponent is what makes
   * range matter: at the edge of your reach a contact creeps, at half reach it takes
   * about thirteen seconds, and sitting on top of it takes about five. Dwell is not a
   * separate term because dwell is what integrating a per-second rate MEANS.
   */
  _resolvePass(dt) {
    const player = this.world.player;
    if (!player || player.dead) return;

    const reach = this.sensorRange();
    const pipFactor = RESOLVE.pipBase + RESOLVE.pipStep * this.sensorPips();
    const clarity = Math.max(RESOLVE.clarityFloor, 1 - this.terrain.clutter);
    const px = player.position.x;
    const pz = player.position.z;

    for (const c of this.contactsById.values()) {
      if (c.resolved) continue;
      this._updateGeometry(c, px, pz);
      const span = reach + c.node.radius;
      if (c.range < span) {
        const closeness = 1 - c.range / span;
        const gain = RESOLVE.rate * closeness ** 1.5 * pipFactor * clarity * dt;
        if (gain > 0) {
          c.observedFor += dt;
          this._gain(c, gain, 'passive');
        }
      }
    }

    // Probes resolve from where THEY are, with their own terrain and their own clarity.
    for (const probe of this.probes) {
      if (probe.dead || probe.owner !== 'player') continue;
      const pt = this.system.terrainAt(probe.x, probe.z, this._probeTerrain);
      const pClarity = Math.max(RESOLVE.clarityFloor, 1 - pt.clutter);
      const pReach = probe.reach * pt.sensor;
      const modeGain = probe.mode === 'active' ? PROBE.activeGain : PROBE.passiveGain;
      const pPips = RESOLVE.pipBase + RESOLVE.pipStep * PROBE.pips;
      for (const c of this.contactsById.values()) {
        if (c.resolved) continue;
        const dx = c.node.position.x - probe.x;
        const dz = c.node.position.z - probe.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const span = pReach + c.node.radius;
        if (d >= span) continue;
        const closeness = 1 - d / span;
        const gain = RESOLVE.rate * closeness ** 1.5 * pPips * pClarity * modeGain * dt;
        if (gain <= 0) continue;
        probe.seen.add(c.id);
        this._gain(c, gain, 'probe');
      }
    }
  }

  /**
   * HULL CONTACTS — the sensors channel's combat purpose.
   *
   * A hostile inside reach resolves on the same curve a POI does. Below `classified` it
   * is a tonnage estimate; at `classified` its class goes into the codex as `seen`; at
   * `resolved` the class is `scanned` and every module bolted to it is `seen`, which is
   * exactly the state the wreck generator now biases toward. Route power to sensors and
   * the codex fills; route it away and you fight things you cannot name.
   */
  _resolveShips(dt) {
    const player = this.world.player;
    if (!player || player.dead) return;
    const codex = this.world.systems?.codex ?? null;
    const reach = this.sensorRange() * RESOLVE.shipReach;
    const pipFactor = RESOLVE.pipBase + RESOLVE.pipStep * this.sensorPips();
    const clarity = Math.max(RESOLVE.clarityFloor, 1 - this.terrain.clutter);

    // Prune anything that has left the world before adding this step's gains.
    for (const ship of this.shipContacts.keys()) {
      if (ship.dead || this.world.ships.indexOf(ship) < 0) this.shipContacts.delete(ship);
    }

    for (const ship of this.world.ships) {
      if (ship === player || ship.dead || ship.isPlayer) continue;
      const d = ship.position.distanceTo(player.position);
      if (d >= reach) continue;
      let rec = this.shipContacts.get(ship);
      if (!rec) {
        rec = {
          ship,
          resolution: 0,
          trueMass: ship.classDef?.mass ?? 1000,
          jitter: this.rng.signed(),
          firstSeen: this._clock,
          markedSeen: false,
          markedScanned: false,
        };
        this.shipContacts.set(ship, rec);
      }
      const closeness = 1 - d / reach;
      rec.resolution = Math.min(1, rec.resolution
        + RESOLVE.shipRate * closeness ** 1.5 * pipFactor * clarity * dt);

      if (!rec.markedSeen && rec.resolution >= RESOLVE.classified) {
        rec.markedSeen = true;
        codex?.markShipClass(ship.classDef?.id, 'seen');
      }
      if (!rec.markedScanned && rec.resolution >= RESOLVE.resolved) {
        rec.markedScanned = true;
        codex?.markShipClass(ship.classDef?.id, 'scanned');
        for (const hp of ship.hardpoints?.values?.() ?? []) {
          if (hp.module?.def) codex?.markModule(hp.module.def.id, 'seen');
        }
        this.bus.emit(EV.NOTIFY, {
          text: `CONTACT CLASSIFIED — ${ship.classDef?.name ?? 'unknown hull'}`,
          important: false,
        });
      }
    }
  }

  /** 0..1 for a hostile hull. 1 means the targeting readout may show everything. */
  shipResolution(ship) {
    return this.shipContacts.get(ship)?.resolution ?? 0;
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
    // A sweep is an active emission, so terrain clutter hurts it too - but less than it
    // hurts a passive listen, because you chose the pulse and you know what you sent.
    const clarity = Math.max(0.35, 1 - this.terrain.clutter * 0.6);
    for (const c of this.contactsById.values()) {
      if (c.resolved) continue;
      const dx = c.node.position.x - player.position.x;
      const dz = c.node.position.z - player.position.z;
      const d = Math.hypot(dx, dz);
      if (d > SURVEY.range) continue;
      let rel = Math.atan2(dx, dz) - this.survey.bearing;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) > half) continue;

      // Off-axis returns are weaker, and so are distant ones. A sweep that grazes a
      // contact at 290 km tells you something is there and nothing else.
      const axis = 1 - Math.abs(rel) / half;
      const reach = 1 - d / SURVEY.range;
      const gain = SURVEY.resolveGain * (0.35 + 0.65 * axis) * (0.30 + 0.70 * reach) * clarity;
      if (gain <= 0.005) continue;
      const wasNew = !c.detected;
      this._updateGeometry(c, player.position.x, player.position.z);
      this._gain(c, gain, 'survey');
      this.survey.gained += gain;
      if (wasNew && c.detected) this.survey.found++;
    }

    this.bus.emit(EV.NOTIFY, {
      text: this.survey.found > 0
        ? `SWEEP COMPLETE — ${this.survey.found} new mass signature${this.survey.found > 1 ? 's' : ''}`
        : (this.survey.gained > 0.02
          ? `SWEEP COMPLETE — no new contacts, ${Math.round(this.survey.gained * 100)}% sharper`
          : 'SWEEP COMPLETE — nothing out there'),
      important: true,
    });
  }

  // --- probes ---------------------------------------------------------------

  /**
   * Put a probe in the water. Called by the `recon_probe` item; callable directly by the
   * harness and by any UI that wants to spend one.
   *
   * @param {{bearing?:number, mode?:string}} opts
   */
  deployProbe({ bearing = null, mode = 'passive' } = {}) {
    const p = this.world.player;
    if (!p || p.dead) return null;
    const brg = bearing ?? p.heading ?? 0;
    const probe = new Probe({
      id: `probe:${this._probeSeq++}`,
      faction: 'player',
      owner: 'player',
      x: p.position.x,
      z: p.position.z,
      bearing: brg,
      mode: mode === 'active' ? 'active' : 'passive',
      speed: PROBE.speed,
      reach: PROBE.reach,
      life: PROBE.life,
    });
    this.probes.push(probe);
    this.bus.emit(EV.NOTIFY, {
      text: `PROBE AWAY — brg ${((brg * 180) / Math.PI + 360) % 360 | 0} — ${probe.mode.toUpperCase()}`,
      important: true,
    });
    return probe;
  }

  /**
   * Kill a probe. Ours is a recall and costs nothing; theirs is the dilemma.
   * Returns `{ok, reason}` so a UI can grey the button with the reason on it.
   */
  destroyProbe(probeOrId) {
    const probe = typeof probeOrId === 'string'
      ? this.probes.find((p) => p.id === probeOrId)
      : probeOrId;
    if (!probe || probe.dead) return { ok: false, reason: 'no such probe' };

    if (probe.owner === 'player') {
      this._retire(probe);
      return { ok: true, own: true };
    }

    const player = this.world.player;
    if (!player || player.dead) return { ok: false, reason: 'no ship' };
    const d = Math.hypot(probe.x - player.position.x, probe.z - player.position.z);
    if (d > PROBE.killRange) {
      return {
        ok: false,
        reason: `OUT OF REACH — ${Math.round(d / KM)} km, need ${Math.round(PROBE.killRange / KM)} km`,
      };
    }

    this._retire(probe);

    // The intel: it had been recording. Everything it had eyes on sharpens.
    let sharpened = 0;
    for (const id of probe.seen) {
      const c = this.contactsById.get(id);
      if (!c || c.resolved) continue;
      this._gain(c, PROBE.killIntelGain, 'probe');
      sharpened++;
    }

    // The bill: it stopped reporting, and they know exactly where that happened.
    if (this.war) {
      for (const node of this.system.nodes) {
        if (node.position.distanceTo(player.position) > SURVEY.range) continue;
        this.war.bumpHeat(node.id, PROBE.killHeat);
      }
      this.war.adjustReputation?.(probe.faction, PROBE.killRep, 'probe destroyed');
    }

    this.bus.emit(EV.NOTIFY, {
      text: `${probe.faction.toUpperCase()} PROBE DESTROYED — ${sharpened} contact${sharpened === 1 ? '' : 's'} sharpened — THEY KNOW`,
      important: true,
    });
    return { ok: true, own: false, sharpened };
  }

  /**
   * Take a probe out of the world NOW rather than at the next step. Every read API and
   * the one-hostile-probe-at-a-time rule count `this.probes`, so a dead probe left in
   * the list would block its own replacement and show on an overlay.
   */
  _retire(probe) {
    probe.dead = true;
    const i = this.probes.indexOf(probe);
    if (i >= 0) this.probes.splice(i, 1);
  }

  _updateProbes(dt) {
    const player = this.world.player;

    for (let i = this.probes.length - 1; i >= 0; i--) {
      const probe = this.probes[i];
      if (probe.dead) { this.probes.splice(i, 1); continue; }

      probe.remaining -= dt;
      if (probe.remaining <= 0) {
        probe.dead = true;
        this.bus.emit(EV.NOTIFY, {
          text: probe.owner === 'player' ? 'PROBE DARK — power exhausted' : 'HOSTILE PROBE DARK',
          important: false,
        });
        this.probes.splice(i, 1);
        continue;
      }

      if (probe.owner === 'player') {
        probe.x += Math.sin(probe.bearing) * probe.speed * dt;
        probe.z += Math.cos(probe.bearing) * probe.speed * dt;
        // An active probe pulses. The heat lands where the PROBE is, which is what makes
        // it a lure as well as a sensor.
        if (probe.mode === 'active' && this.war) {
          probe.pulseIn -= dt;
          if (probe.pulseIn <= 0) {
            probe.pulseIn = PROBE.pulsePeriod;
            for (const node of this.system.nodes) {
              const dx = node.position.x - probe.x;
              const dz = node.position.z - probe.z;
              if (Math.hypot(dx, dz) > probe.reach * 1.5) continue;
              this.war.bumpHeat(node.id, PROBE.pulseHeat);
            }
          }
        }
      } else if (player && !player.dead) {
        // Theirs shadows you: it closes slowly and then loiters at the edge of its reach.
        const dx = player.position.x - probe.x;
        const dz = player.position.z - probe.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d > PROBE.enemyReach * 0.6) {
          probe.x += (dx / d) * probe.speed * dt;
          probe.z += (dz / d) * probe.speed * dt;
        }
        probe.hasFix = d <= probe.reach;
      }
    }

    this._enemyCheckIn -= dt;
    if (this._enemyCheckIn <= 0) {
      this._enemyCheckIn = PROBE.enemyCheckPeriod;
      this._maybeSpawnEnemyProbe();
    }
  }

  /**
   * They look for you too. A faction with patrol heat on your position spends a probe,
   * and once it has a fix your signature is multiplied for as long as you allow it.
   *
   * Deliberately capped at one: two watchers would be an unreadable stack of modifiers,
   * and the decision this exists to create is binary anyway.
   */
  _maybeSpawnEnemyProbe() {
    const player = this.world.player;
    if (!player || player.dead || !this.war) return null;
    for (const p of this.probes) if (p.owner === 'hostile' && !p.dead) return null;

    const heat = this.war.heatAtPoint(player.position.x, player.position.z);
    if (heat < PROBE.enemyHeatFloor) return null;
    // Being quiet is a defence against being probed, not just against being intercepted.
    if (this.probeRng.next() > heat * this.signatureMultiplier * 0.5) return null;

    const control = this.war.controlAtPoint(player.position.x, player.position.z);
    const faction = control >= 0 ? 'coalition' : 'concord';
    const brg = this.probeRng.next() * Math.PI * 2;
    const dist = PROBE.enemyReach * this.probeRng.range(0.9, 1.6);
    const probe = new Probe({
      id: `probe:${this._probeSeq++}`,
      faction,
      owner: 'hostile',
      x: player.position.x + Math.sin(brg) * dist,
      z: player.position.z + Math.cos(brg) * dist,
      bearing: brg + Math.PI,
      mode: 'passive',
      speed: PROBE.enemySpeed,
      reach: PROBE.enemyReach,
      life: PROBE.enemyLife,
    });
    probe.hasFix = false;
    this.probes.push(probe);
    this.bus.emit(EV.NOTIFY, {
      text: `${faction.toUpperCase()} PROBE ON YOUR TRACK — kill it and they know, leave it and they watch`,
      important: true,
    });
    return probe;
  }

  // --- resolution bookkeeping ----------------------------------------------

  _updateGeometry(c, px, pz) {
    const dx = c.node.position.x - px;
    const dz = c.node.position.z - pz;
    c.bearing = (Math.atan2(dx, dz) * 180) / Math.PI;
    c.range = Math.hypot(dx, dz);
  }

  /**
   * The only place resolution is written. Monotonic by construction, publishes the two
   * threshold crossings that matter, and keeps the legacy views true.
   */
  _gain(c, amount, via) {
    if (!(amount > 0)) return false;
    const before = c.resolution;
    const after = Math.min(1, before + amount);
    if (after <= before) return false;
    c.resolution = after;
    c.via = via;
    c.lastSeen = this._clock;

    const crossedContact = before < RESOLVE.contact && after >= RESOLVE.contact;
    const crossedResolved = before < RESOLVE.resolved && after >= RESOLVE.resolved;

    if (crossedContact) {
      c.firstSeen = this._clock;
      if (!this._quiet) {
        this.bus.emit(EV.NOTIFY, {
          text: `MASS SIGNATURE — ~${c.massEstimate} t ±${c.massError} — brg ${((c.bearing + 360) % 360) | 0}`,
          important: false,
        });
      }
    }
    if (crossedResolved && !this._quiet) {
      this.bus.emit(EV.NOTIFY, {
        text: c.source === 'intel'
          ? `INTEL — ${c.node.name} located`
          : `CONTACT RESOLVED — ${c.node.name}`,
        important: true,
      });
    }
    this._syncLegacy(c);
    return true;
  }

  /** `known` and `blips` are views over `resolution`. Written here and nowhere else. */
  _syncLegacy(c) {
    if (c.resolved) {
      this.known.add(c.id);
      this.blips.delete(c.id);
      return;
    }
    this.known.delete(c.id);
    if (!c.detected) { this.blips.delete(c.id); return; }
    let blip = this.blips.get(c.id);
    if (!blip) { blip = {}; this.blips.set(c.id, blip); }
    blip.bearing = c.bearing;
    blip.range = c.range;
    blip.mass = c.massEstimate;
    blip.massError = c.massError;
    blip.resolution = c.resolution;
    blip.tier = c.tier;
    blip.x = c.x;
    blip.z = c.z;
    blip.at = c.firstSeen;
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

    /*
     * A RECOVERY TENDER HAILS. A HUNTER-KILLER DOES NOT.
     *
     * Measured on the live assembly: an escalation group opens 17.3 - 20.4 km from the
     * player, and the arrival fit's hull-contact reach in the graveyard's debris terrain
     * is 12.9 km (`RANGE.sensorBase` 14 km x 3 sensor pips x terrain.sensor 0.68 x
     * `RESOLVE.shipReach`). So the player read "RECOVERY TENDER INBOUND" and then looked
     * at an empty display for the forty seconds it took to close — a warning with no
     * bearing, which is a jump scare rather than a decision.
     *
     * The fix belongs here rather than in the war, because moving the spawn inside the
     * sensor envelope would couple the two layers' constants and would make every rung
     * arrive the same way. What actually differs between the rungs is INTENT, and that
     * is a sensor fact: a tender and a picket are announcing that the field is theirs,
     * so they squawk, and the player gets a bearing and a tonnage the moment they
     * launch. A hunter-killer is not announcing anything. It stays dark and you find it
     * on your own sensors, which is the whole reason the third rung is the frightening
     * one.
     *
     * Seeded at `SQUAWK`, deliberately below `RESOLVE.classified`: a MASS SIGNATURE with
     * a bearing and an error band, not a name. Naming it is still the sensor channel's
     * job and still costs power.
     */
    this._offEscalation = this.bus.on(MEV.ESCALATION, ({ faction, tier }) => {
      if (tier === 'hunter') return;
      const group = this._latestResponse(faction, tier);
      if (!group) return;
      let announced = 0;
      for (const ship of group.ships) {
        if (!ship || ship.dead) continue;
        if (this.markShipContact(ship, SQUAWK)) announced++;
      }
      if (announced > 0) {
        this.bus.emit(EV.NOTIFY, {
          text: `${faction.toUpperCase()} ${tier.toUpperCase()} SQUAWKING — `
            + `${announced} MASS SIGNATURE${announced === 1 ? '' : 'S'} ON YOUR SENSORS`,
          important: true,
        });
      }
    });
  }

  /** The group the war just launched, from its own published read API. */
  _latestResponse(faction, tier) {
    const list = this.war?.responses;
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].faction === faction && list[i].tier === tier) return list[i];
    }
    return null;
  }

  /**
   * Put a hull on the sensor board at a floor resolution, creating the record if it is
   * not there yet. Returns true when this call actually moved something.
   *
   * A floor rather than an assignment, for the same reason `contact()` above is: a hull
   * the player has already worked out must never be blurred by something announcing
   * itself.
   */
  markShipContact(ship, resolution) {
    if (!ship || ship.dead) return false;
    let rec = this.shipContacts.get(ship);
    if (!rec) {
      rec = {
        ship,
        resolution: 0,
        trueMass: ship.classDef?.mass ?? 1000,
        jitter: this.rng.signed(),
        firstSeen: this._clock,
        markedSeen: false,
        markedScanned: false,
      };
      this.shipContacts.set(ship, rec);
    }
    if (rec.resolution >= resolution) return false;
    rec.resolution = Math.min(1, resolution);
    return true;
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
    this._quiet = true;
    try {
      this._seedInner(startId, blipCount);
    } finally {
      this._quiet = false;
    }
  }

  _seedInner(startId, blipCount) {
    const start = this.system.get(startId);
    this.reveal(startId, 'sensors');
    if (!start) return;
    const ordered = this.system.nodes
      .filter((n) => n.id !== startId)
      .map((n) => ({ n, d: n.distanceTo(start) }))
      .sort((a, b) => a.d - b.d);
    // Two neighbours arrive as genuine mass signatures rather than as named places:
    // the player starts knowing that something is out there, not what.
    for (let i = 0; i < Math.min(blipCount, ordered.length); i++) {
      this.contact(ordered[i].n.id, start.position, 0.28);
    }
  }

  // =========================================================================
  // READ API. Data only - this file draws nothing.
  // =========================================================================

  /**
   * One row per detected contact, cached, for the tactical overlay.
   *
   *   { id, tier, label, resolution, bearing, rangeKm, mass, massError,
   *     positionErrorKm, x, z, kind, plottable, via, staleSeconds }
   *
   * `tier` is signature / classified / resolved and it is the ONLY thing a UI should
   * branch on. A contact below `classified` must not be drawn with its name, because
   * the whole point is that the player does not have it.
   */
  describeContacts() {
    const rows = this._contactRows;
    rows.length = 0;
    for (const c of this.contactsById.values()) {
      if (!c.detected) continue;
      let r = c._row;
      if (!r) r = c._row = {};
      r.id = c.id;
      r.tier = c.tier;
      r.label = c.label;
      r.resolution = c.resolution;
      r.bearing = c.bearing;
      r.rangeKm = c.range / KM;
      r.mass = c.massEstimate;
      r.massError = c.massError;
      r.positionErrorKm = c.positionError / KM;
      r.x = c.x;
      r.z = c.z;
      r.kind = c.resolution >= RESOLVE.classified ? c.node.kind : null;
      r.plottable = c.resolved;
      r.via = c.via;
      r.staleSeconds = c.lastSeen < 0 ? 0 : this._clock - c.lastSeen;
      rows.push(r);
    }
    rows.sort((a, b) => b.resolution - a.resolution);
    return rows;
  }

  /**
   * One row per hull contact. `label` is what the targeting readout may print: an
   * unresolved hostile is a tonnage estimate, not a class name.
   */
  describeShipContacts() {
    const rows = this._shipRows;
    rows.length = 0;
    for (const rec of this.shipContacts.values()) {
      let r = rec._row;
      if (!r) r = rec._row = {};
      const band = RESOLVE.massBand * (1 - rec.resolution) ** 1.5;
      r.shipId = rec.ship.id;
      r.ship = rec.ship;
      r.resolution = rec.resolution;
      r.tier = tierOf(rec.resolution);
      r.mass = Math.round((rec.trueMass * (1 + rec.jitter * band)) / 50) * 50;
      r.massError = Math.round((rec.trueMass * band) / 50) * 50;
      r.faction = rec.resolution >= RESOLVE.classified ? rec.ship.faction : null;
      r.label = rec.resolution >= RESOLVE.resolved
        ? (rec.ship.classDef?.name ?? 'HULL')
        : rec.resolution >= RESOLVE.classified
          ? `UNIDENTIFIED ${String(rec.ship.classDef?.role ?? 'HULL').toUpperCase()}`
          : 'MASS SIGNATURE';
      /** A UI must hide subsystem detail below this. */
      r.showSubsystems = rec.resolution >= RESOLVE.resolved;
      rows.push(r);
    }
    return rows;
  }

  /** Live probes, ours and theirs, for the overlay and for the kill decision. */
  describeProbes() {
    const rows = this._probeRows;
    rows.length = 0;
    const p = this.world.player;
    for (const probe of this.probes) {
      let r = probe._row;
      if (!r) r = probe._row = {};
      r.id = probe.id;
      r.owner = probe.owner;
      r.faction = probe.faction;
      r.mode = probe.mode;
      r.x = probe.x;
      r.z = probe.z;
      r.remaining = Math.max(0, probe.remaining);
      r.reachKm = probe.reach / KM;
      r.hasFix = !!probe.hasFix;
      r.contacts = probe.seen.size;
      r.rangeKm = p ? Math.hypot(probe.x - p.position.x, probe.z - p.position.z) / KM : Infinity;
      r.killable = probe.owner === 'hostile' && r.rangeKm * KM <= PROBE.killRange;
      rows.push(r);
    }
    return rows;
  }

  /**
   * THE ONE CALL A SENSOR PANEL NEEDS. Every modifier that is currently acting on the
   * player's ability to see and to be seen, with its cause named - hidden state that
   * changes outcomes is a bug, not depth.
   */
  sensorProfile() {
    const base = this.baseSensorRange();
    return {
      pips: this.sensorPips(),
      baseRangeKm: base / KM,
      rangeKm: (base * this.terrain.sensor) / KM,
      terrain: {
        id: this.terrain.id,
        name: this.terrain.name,
        poiId: this.terrain.poiId,
        weight: this.terrain.weight,
        sensorMul: this.terrain.sensor,
        signatureMul: this.terrain.signature,
        clutter: this.terrain.clutter,
      },
      signature: this.signatureMultiplier,
      sweeping: this.survey.active,
      sweepRemaining: this.survey.active ? this.survey.remaining : 0,
      watched: this.watched,
      probes: this.probes.length,
      resolvedPOIs: this.known.size,
      trackedPOIs: this.blips.size,
      hullContacts: this.shipContacts.size,
    };
  }

  dispose() {
    this._offCut?.();
    this._offSalvage?.();
    this._offEnter?.();
    this._offEscalation?.();
    this.probes.length = 0;
    this.shipContacts.clear();
  }
}

/**
 * THE PROBE, as a fabricable item.
 *
 * Registered from here rather than from `sim/meta/items.js` for two reasons: the probe
 * IS the discovery layer, and `registerItem` is a no-op on a duplicate id, so nothing
 * breaks if the item library later wants to own it. `ItemSystem.use` finds it through
 * `allItems()` with no wiring at all.
 *
 * Cost is deliberately electronics-heavy: electronics is the pool the refinery is worst
 * at producing, so probes compete directly with repair and with ammunition fabrication.
 * A probe you spent is a repair you did not make.
 */
export const RECON_PROBE_ITEM = registerItem({
  id: 'recon_probe',
  name: 'Recon Probe',
  kind: 'device',
  description: 'A one-shot sensor you throw down a bearing. Passive it says nothing; active it pulses, and patrols come to the probe rather than to you.',
  volume: 5,
  maxStack: 6,
  buildCost: { alloy: 8, electronics: 14 },
  requires: 'a bearing',
  activate(ctx) {
    const discovery = ctx.world?.systems?.discovery;
    if (!discovery) return { ok: false, reason: 'no sensor suite' };
    const probe = discovery.deployProbe({
      bearing: ctx.params?.bearing ?? ctx.ship?.heading ?? 0,
      mode: ctx.params?.mode ?? 'passive',
    });
    if (!probe) return { ok: false, reason: 'no ship' };
    return { ok: true, probe: probe.id, mode: probe.mode, life: probe.life };
  },
});

export { RESOLVE, PROBE, SURVEY };
