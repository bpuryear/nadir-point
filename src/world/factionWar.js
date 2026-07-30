/**
 * THE WORLD SIMULATION.
 *
 * Two factions fight each other on their own schedule. The player is not required,
 * not consulted, and not the reason any of it happens. That is the entire point: a
 * world that only moves when it is being watched is a stage set, and the player can
 * always tell.
 *
 * WHAT IS SIMULATED
 *   control  per POI, -1 (Concord) .. +1 (Coalition). Moved by battles, and drifting
 *            slowly toward whatever the neighbours hold, which is what makes a
 *            salient collapse instead of hanging in the air.
 *   heat     per POI, 0..1 patrol density. Spikes when a battle resolves, decays
 *            toward a baseline set by how contested the place is. The travel layer
 *            reads this and turns it into an interception percentage drawn on the
 *            course before the player commits.
 *   garrison per POI, per faction, in the same strength units the fleet AI uses, so a
 *            battle resolved abstractly and a battle fought for real are denominated
 *            in the same currency and cannot drift apart.
 *
 * BATTLES ARE SCHEDULED, NOT TRIGGERED
 * A battle is put on the clock with a warning period, then it starts, then it ends.
 * Where the player is standing when it starts decides only HOW it is computed:
 *
 *   player present -> real ships spawn, real fleets form, real combat resolves it, and
 *                     the wrecks are the ones the player watched being made
 *   player absent  -> it resolves in one arithmetic step, and leaves behind exactly
 *                     the same thing: changed control, raised heat, and a persistent
 *                     record of whose hulls are lying there
 *
 * The second path is what the player is buying when they choose a destination. Arrive
 * during the battle and it is the richest and most dangerous salvage in the game.
 * Arrive an hour later and it is a cold field with a lower yield and nobody shooting.
 * A travel system without a clock is a menu.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { KM } from '../core/units.js';
import { scratch } from '../core/world.js';
import { Ship } from '../sim/ship.js';
import { Wreck, DetachedModule } from '../sim/salvage.js';
import { pickClass, AI_ROLES } from '../sim/ai/roster.js';
import { shipStrength } from '../sim/ai/fleetAI.js';
import { MEV } from '../sim/meta/events.js';
import { getModule } from '../core/contracts.js';

/** Seconds of sim time per strategic step. Coarse on purpose - this is a war, not a tick. */
const STEP = 8;

const TUNING = {
  drift: 0.016,          // control diffusion toward the neighbourhood, per second
  battleRate: 0.0016,    // per second, before contest and value weighting
  battleCooldown: 240,   // per POI, seconds
  warnMin: 25, warnMax: 95,
  durationMin: 80, durationMax: 240,
  heatDecay: 0.012,
  heatPerBattle: 0.34,
  production: 34,        // strength points per strategic step at full control of a 1.0-value POI
  garrisonDecay: 0.0006,
  commitMin: 0.32, commitMax: 0.68,
  controlPerWin: 0.22,
  picketRep: -40,        // reputation at or below this and that faction runs pickets
  picketHeat: 0.25,
};

const OTHER = { coalition: 'concord', concord: 'coalition' };

/**
 * THE SALVAGE LEDGER, AND THE ESCALATION IT DRIVES.
 *
 * `closest-comparables.md` §5.2, Product 2. FTL's Rebel Fleet is the canonical version
 * of "a reason not to farm", and it works because it is *negotiable*: nebula beacons
 * halve its advance, so the pressure is something you spend against rather than
 * something that simply happens to you. What we had instead was the opposite of
 * pressure - the war advances and nothing in it converges on the player, and the entire
 * pursuit model was `reputation <= -40 starts pickets`.
 *
 * So: a per-faction claim, accrued by cutting THEIR hulls in THEIR space, decaying when
 * you work somewhere else. At thresholds the response escalates. This is better than a
 * timer for three reasons, all of which are properties of the ledger and not of the
 * table below:
 *
 *   EARNED       a cautious player is never punished. The number only moves because of
 *                something the player did, and the readout says which thing.
 *   SPATIAL      decay is multiplied by how far outside that faction's control you are
 *                working, so "go and strip Concord hulls for a while" is a real answer
 *                to Coalition attention, and it costs you the other side's berths.
 *   DIEGETIC     you are stealing. Eventually somebody notices, and the first thing they
 *                send is a tender to claim the field rather than a hunter to kill you.
 *
 * The escalation is a claim, not a vendetta: it does not touch reputation, so the
 * hostility system and the attention system stay separable. You can be on excellent
 * terms with Coalition and still have their recovery cutter turn up, because being on
 * good terms is not a licence to strip their dead.
 *
 * THE FOUR-QUESTION TEST (docs/design/scope-decision.md):
 *
 *  1. What decision does this create? When to leave a field that is still paying, and
 *     where to go next. Both were previously free.
 *  2. What does it interlock with? Salvage (accrual), the control field (accrual and
 *     decay), travel (a hunter plots to you mid-transit), the anchorages (docking with
 *     the faction you have been robbing buys the number down - you are paying them),
 *     and the fleet AI, which does all the actual fighting unchanged.
 *  3. What does it abstract? The bookkeeping. There is no insurance adjuster, no bounty
 *     board and no per-hull ownership record: one number per faction, and where you were
 *     standing when it moved.
 *  4. Can the player see it? `ledgerStatus()` gives the claim, the tier, the distance to
 *     the next one and the current decay rate, and the notifications fire at 70% of a
 *     threshold - before the response, not with it.
 */
export const ESCALATION = [
  {
    tier: 'tender', at: 110, cooldown: 200,
    roles: ['corvette', 'corvette'],
    text: 'RECOVERY TENDER INBOUND — they want the field back',
  },
  {
    tier: 'picket', at: 260, cooldown: 260,
    roles: ['frigate', 'corvette', 'corvette'],
    text: 'PICKET DETACHED — they are coming to move you on',
  },
  {
    tier: 'hunter', at: 480, cooldown: 340,
    roles: ['destroyer', 'frigate'],
    text: 'HUNTER-KILLER PLOTTING TO YOUR POSITION',
    plotsToPlayer: true,
  },
];

const LEDGER = {
  /** Claim shed per second at rest, before the spatial multiplier. */
  decay: 0.55,
  /** ...multiplied by up to this much when working outside their space entirely. */
  awayMul: 3.0,
  /** Claim charged for one cut section, scaled by how much of the place they hold. */
  perSection: 3.0,
  perModule: 16.0,
  perAmmo: 5.0,
  /** Killing one of their hulls is worth a lot of cutting. */
  perKill: 30.0,
  /** Docking at their berth buys this fraction of the claim off. You paid them. */
  dockRelief: 0.35,
  /** Warn the player at this fraction of the next threshold. */
  warnAt: 0.70,
  /** A response arriving discharges this fraction: they have made their point. */
  dischargeOnSpawn: 0.30,
};

/** Per-POI simulation state. */
export class POIWarState {
  constructor(node) {
    this.id = node.id;
    this.node = node;
    this.control = node.initialControl;
    this.heat = node.initialHeat;
    this.garrison = {
      coalition: node.value * 2400 * Math.max(0.08, (node.initialControl + 1) * 0.5),
      concord: node.value * 2400 * Math.max(0.08, (1 - node.initialControl) * 0.5),
    };
    /** @type {null|Object} */
    this.battle = null;
    this.battleCooldown = 0;
    this.battlesFought = 0;
    /** Sim time the player last had eyes on it. Negative means never. */
    this.lastSeenTick = -1;
    /**
     * Persistent wreckage. Each entry is a hull that died here and has not been fully
     * stripped. They survive the player leaving and coming back, which is what makes
     * the war a salvage crop rather than a set of numbers.
     * @type {{faction:string, role:string, integrity:number, seed:number, age:number}[]}
     */
    this.hulks = [];
    /**
     * STRAYS. Modules that came off a hull intact - shot off a mount pad, or ejected by
     * the player's own crippling - and were left lying here.
     *
     * Before this existed, `dematerialise` folded them into `hulks` through the generic
     * fallback branch, which had no `sourceClass`, so a cannon bank you shot free and
     * did not collect came back as a whole frigate hulk the next time you visited. They
     * need their own list because they are a different noun.
     * @type {{moduleId:string, name:string, faction:string, condition:number, x:number, y:number, z:number}[]}
     */
    this.strays = [];
    /** Background debris the field builder scatters, in pieces. */
    this.debris = 0;
    this.materialised = false;
    this.visited = false;
  }

  /**
   * GIVE THIS PLACE A PAST.
   *
   * `hulks` is filled by battles the war has FOUGHT, so at t = 0 every node in the system
   * is spotless. The player's first frame was therefore an empty one: The Graveyard, whose
   * own blurb reads "the centre of the war, it has changed hands eleven times and shows
   * all eleven", materialised as open space with nothing in it. Measured on the shipped
   * page before this existed: 1 ship, 0 hostiles, 0 wrecks.
   *
   * The fiction and the simulation simply disagreed, and the fiction was right. A war that
   * has been running long enough to have a graveyard has left wreckage in it.
   *
   * The count is derived, not authored per node, so it stays true if the system table is
   * edited: `heat` is how hard this place is fought over and `value` is how much is worth
   * fighting for, and their product is how much has died here. The graveyard (heat 0.72,
   * value 0.90) seeds the most; a quiet anchorage seeds none.
   *
   * Age matters and is not cosmetic. `integrity` is what a hull yields when cut, so old
   * wrecks are picked-over and poor while recent ones are rich — which is the reason to
   * chase a fresh battle rather than farm the graveyard forever. Everything is forked off
   * the node id so a seed reproduces exactly.
   */
  seedHistory(rng) {
    if (this.hulks.length) return 0;
    const pressure = this.node.initialHeat * this.node.value;
    const count = Math.round(pressure * 9);
    if (count <= 0) return 0;

    const r = rng.fork(`history:${this.id}`);
    for (let i = 0; i < count; i++) {
      // Older wrecks sit at the back of the queue and have been stripped hardest.
      const age = (i + 1) / count;
      const faction = r.next() < (this.control + 1) * 0.5 ? 'concord' : 'coalition';
      this.hulks.push({
        faction,
        role: r.next() < 0.22 ? 'capital' : r.next() < 0.55 ? 'line' : 'escort',
        // 0.18 at the oldest, 0.72 at the freshest, with real spread inside that.
        integrity: 0.18 + (1 - age) * 0.42 + r.next() * 0.12,
        seed: r.int(0, 1 << 28),
        age,
      });
    }
    this.battlesFought = Math.max(this.battlesFought, Math.round(count * 0.6));
    return count;
  }

  get contested() {
    return Math.abs(this.control) < 0.45
      && this.garrison.coalition > 120 && this.garrison.concord > 120;
  }

  get owner() {
    return this.control > 0.15 ? 'coalition' : this.control < -0.15 ? 'concord' : 'contested';
  }
}

export class FactionWarSystem {
  /**
   * @param {import('../core/world.js').World} world
   * @param {import('./system.js').StarSystem} system
   * @param {Object} deps  { fleetAI, shipAI }
   */
  constructor(world, system, deps = {}) {
    this.world = world;
    this.bus = world.bus;
    this.system = system;
    this.fleetAI = deps.fleetAI ?? null;
    this.shipAI = deps.shipAI ?? null;

    this.rng = world.rng.fork('faction-war');
    this._battleRng = this.rng.fork('battles');
    this._spawnRng = this.rng.fork('spawn');
    this._escalationRng = this.rng.fork('escalation');

    /**
     * The salvage ledger. One claim per faction, plus which rung of the escalation
     * table has already been answered and when they may answer again.
     */
    this.ledger = {
      coalition: { claim: 0, tier: -1, cooldown: 0, warned: -1, lastPOI: null, responses: 0 },
      concord: { claim: 0, tier: -1, cooldown: 0, warned: -1, lastPOI: null, responses: 0 },
    };
    /** @type {Object[]} live escalation groups, for the read API. */
    this.responses = [];

    this.name = 'faction-war';
    this.order = 20;

    this.time = 0;
    this._stepAccum = 0;
    this._battleSeq = 0;

    /** @type {Map<string, POIWarState>} */
    this.states = new Map();
    /*
     * Seeded at construction rather than on first visit, so the war's history is a
     * property of the seed and not of the order the player happens to travel in. Two
     * runs of the same seed put the same wrecks in the same places whether or not
     * anybody went and looked.
     */
    const historyRng = this.rng.fork('history');
    for (const node of system.nodes) {
      const st = new POIWarState(node);
      st.seedHistory(historyRng);
      this.states.set(node.id, st);
    }

    /** Strategic reserves waiting to be committed somewhere. */
    this.reserve = { coalition: 900, concord: 900 };

    /** @type {Object[]} live and pending battles, newest last. */
    this.battles = [];
    /** @type {Object[]} resolved battles, capped. The overlay reads this for history. */
    this.log = [];
    /** Survivors on their way out of a resolved engagement. */
    this._leaving = [];

    // --- front line cache -------------------------------------------------
    this._front = [];
    this._frontDirty = true;
    this._frontAge = 0;
    this._frontGrid = 40;
    this._frontField = new Float32Array((this._frontGrid + 1) * (this._frontGrid + 1));

    this._bindReputation();
  }

  // =========================================================================
  // Public surface. docs/design/controls.md 5.7 pins this down: read only, tiny.
  // =========================================================================

  /** @returns {{control:number, heat:number, contested:boolean, lastSeenTick:number}} */
  poiState(poiId) {
    const st = this.states.get(poiId);
    if (!st) return { control: 0, heat: 0, contested: false, lastSeenTick: -1 };
    return {
      control: st.control,
      heat: st.heat,
      contested: st.contested,
      lastSeenTick: st.lastSeenTick,
      owner: st.owner,
      garrison: st.garrison,
      battle: st.battle,
      hulks: st.hulks.length,
      visited: st.visited,
    };
  }

  /**
   * Patrol heat. Accepts a POI id, or an (x, z) world point sampled along a plotted
   * leg. One function because the travel layer wants both and two names for the same
   * quantity is how they end up disagreeing.
   */
  heatAt(a, b) {
    if (typeof a === 'string') return this.states.get(a)?.heat ?? 0;
    return this.heatAtPoint(a, b);
  }

  /** Faction control. POI id, or an (x, z) point interpolated from the control field. */
  controlAt(a, b) {
    if (typeof a === 'string') return this.states.get(a)?.control ?? 0;
    return this.controlAtPoint(a, b);
  }

  /**
   * Heat at a world point: the strongest influence of any POI reaching it, plus a flat
   * picket penalty inside the space of a faction the player has made an enemy of.
   * Reputation narrowing the map is the point of reputation.
   */
  heatAtPoint(x, z) {
    let best = 0;
    for (const st of this.states.values()) {
      const n = st.node;
      const d = Math.hypot(n.position.x - x, n.position.z - z);
      const reach = n.radius + 260 * KM;
      if (d > reach) continue;
      const w = 1 - Math.max(0, d - n.radius) / (reach - n.radius);
      const h = st.heat * w * w;
      if (h > best) best = h;
    }
    const control = this.controlAtPoint(x, z);
    if (control > 0.25 && (this.world.reputation.coalition ?? 0) <= TUNING.picketRep) best += TUNING.picketHeat;
    if (control < -0.25 && (this.world.reputation.concord ?? 0) <= TUNING.picketRep) best += TUNING.picketHeat;
    return Math.min(1, best);
  }

  /** Inverse-square-weighted control field. The front line is its zero contour. */
  controlAtPoint(x, z) {
    let num = 0;
    let den = 0;
    const soft = (90 * KM) * (90 * KM);
    for (const st of this.states.values()) {
      const n = st.node;
      const dx = n.position.x - x;
      const dz = n.position.z - z;
      const w = 1 / (dx * dx + dz * dz + soft);
      num += st.control * w * (0.5 + n.value);
      den += w * (0.5 + n.value);
    }
    return den > 0 ? num / den : 0;
  }

  /**
   * The front line, as a flat list of segment endpoints [a0,b0,a1,b1,...] in
   * THREE.Vector2. Marching squares over the control field's zero contour, recomputed
   * lazily - it only moves when a battle resolves, and the overlay reads it every
   * frame.
   */
  frontLine() {
    if (this._frontDirty) this._rebuildFront();
    return this._front;
  }

  /**
   * Raise patrol heat somewhere. The discovery layer calls this when the player runs
   * an active sweep: looking is not free, and this is the bill.
   */
  bumpHeat(poiId, amount) {
    const st = this.states.get(poiId);
    if (!st) return 0;
    st.heat = THREE.MathUtils.clamp(st.heat + amount, 0, 1);
    return st.heat;
  }

  /** Everything the overlay and the probe need, in one object. */
  snapshot() {
    const pois = [];
    for (const st of this.states.values()) {
      pois.push({
        id: st.id,
        name: st.node.name,
        kind: st.node.kind,
        x: st.node.position.x,
        z: st.node.position.z,
        control: st.control,
        heat: st.heat,
        owner: st.owner,
        contested: st.contested,
        garrison: { ...st.garrison },
        battle: st.battle ? { phase: st.battle.phase, live: st.battle.live, endsAt: st.battle.endsAt } : null,
        hulks: st.hulks.length,
        battlesFought: st.battlesFought,
        lastSeenTick: st.lastSeenTick,
      });
    }
    return {
      time: this.time,
      reputation: { ...this.world.reputation },
      reserve: { ...this.reserve },
      ledger: this.ledgerStatus(),
      pois,
      battles: this.battles.map((b) => ({ ...b, fleets: undefined, ships: undefined })),
      resolved: this.log.slice(-12),
    };
  }

  // =========================================================================
  // Simulation
  // =========================================================================

  fixedUpdate(dt) {
    this.time += dt;

    this._stepAccum += dt;
    // Cap the catch-up: at 64x transit compression a long leg would otherwise run
    // dozens of strategic steps inside one frame.
    let steps = 0;
    while (this._stepAccum >= STEP && steps < 8) {
      this._stepAccum -= STEP;
      steps++;
      this._strategicStep(STEP);
    }
    if (steps >= 8) this._stepAccum = 0;

    this._updateBattles(dt);
    this._retireLeavers();
    this._observe(dt);

    this._frontAge += dt;
    if (this._frontAge > 3) { this._frontAge = 0; this._frontDirty = true; }
  }

  /** Slow layer: production, drift, heat, and the decision to schedule a battle. */
  _strategicStep(dt) {
    const rng = this.rng;

    // --- production -------------------------------------------------------
    let prodC = 0, prodN = 0;
    for (const st of this.states.values()) {
      const share = (st.control + 1) * 0.5;
      prodC += TUNING.production * st.node.value * share;
      prodN += TUNING.production * st.node.value * (1 - share);
    }
    this.reserve.coalition += prodC;
    this.reserve.concord += prodN;

    // --- reinforcement ----------------------------------------------------
    // Both sides pour into whatever is closest to flipping. That is what produces a
    // front rather than an even smear of garrisons.
    for (const faction of ['coalition', 'concord']) {
      let total = 0;
      for (const st of this.states.values()) total += this._reinforceWeight(st, faction);
      if (total <= 0) continue;
      const budget = this.reserve[faction] * 0.35;
      this.reserve[faction] -= budget;
      for (const st of this.states.values()) {
        const w = this._reinforceWeight(st, faction);
        if (w <= 0) continue;
        st.garrison[faction] += (w / total) * budget;
      }
    }

    // --- drift, decay, heat ----------------------------------------------
    for (const st of this.states.values()) {
      const node = st.node;

      let sum = 0;
      let weight = 0;
      for (const nb of node.neighbours) {
        const other = this.states.get(nb.id);
        if (!other) continue;
        const d = node.distanceTo(nb);
        const w = 1 / (1 + d / (180 * KM));
        sum += other.control * w;
        weight += w;
      }
      // Garrison balance is the local term; the neighbourhood is the strategic one.
      const g = st.garrison.coalition + st.garrison.concord;
      const local = g > 1 ? (st.garrison.coalition - st.garrison.concord) / g : st.control;
      const target = weight > 0 ? (sum / weight) * 0.45 + local * 0.55 : local;
      st.control += (target - st.control) * TUNING.drift * dt;
      st.control = THREE.MathUtils.clamp(st.control, -1, 1);

      st.garrison.coalition *= 1 - TUNING.garrisonDecay * dt;
      st.garrison.concord *= 1 - TUNING.garrisonDecay * dt;

      // Heat baseline: contested space is patrolled, settled space is not.
      const baseline = 0.10 + (1 - Math.abs(st.control)) * 0.55 * (0.4 + node.value * 0.6);
      st.heat += (baseline - st.heat) * TUNING.heatDecay * dt;
      st.heat = THREE.MathUtils.clamp(st.heat, 0, 1);

      if (st.battleCooldown > 0) st.battleCooldown -= dt;
      for (const h of st.hulks) h.age += dt;
    }

    this._updateLedger(dt);

    // --- schedule --------------------------------------------------------
    // Anything ON THE FRONT is attackable, not just anything currently balanced. A war
    // in which a POI stops being fought over the moment one side gets a firm grip on it
    // freezes solid inside an hour, and a frozen front is not a simulation.
    for (const st of this.states.values()) {
      if (st.battle || st.battleCooldown > 0) continue;
      if (!this._onFront(st)) continue;
      const contest = 1 - Math.abs(st.control) * 0.7;
      const p = TUNING.battleRate * contest * (0.4 + st.node.value) * dt;
      if (rng.next() < p) this._schedule(st);
    }
    this._frontDirty = true;
  }

  /** Does this POI border anything the other side holds, or anything up for grabs? */
  _onFront(st) {
    const mine = Math.sign(st.control);
    for (const nb of st.node.neighbours) {
      const other = this.states.get(nb.id);
      if (!other) continue;
      if (Math.abs(other.control) < 0.35) return true;
      if (Math.sign(other.control) !== mine) return true;
    }
    return false;
  }

  _reinforceWeight(st, faction) {
    const mine = st.garrison[faction];
    const theirs = st.garrison[OTHER[faction]];
    const contest = 1 - Math.abs(st.control);
    const push = faction === 'coalition' ? (st.control + 1) * 0.5 : (1 - st.control) * 0.5;
    // Weight what is winnable, not what is already won.
    return st.node.value * (0.25 + contest * 1.6) * (0.3 + push) * (mine + 250) / (mine + theirs + 500);
  }

  /**
   * Put a battle on the clock.
   *
   * The attacker draws on the strategic reserve as well as on whatever it already has
   * here - that is what an offensive IS, and it is the mechanism by which a front
   * actually moves rather than oscillating around wherever the garrisons happened to
   * settle. The reserve is debited now and the force arrives now; the battle merely
   * decides what is left of it.
   */
  _schedule(st) {
    const rng = this._battleRng;
    const attacker = st.control >= 0 ? 'concord' : 'coalition';
    const push = Math.min(this.reserve[attacker] * 0.45, 2400);
    this.reserve[attacker] -= push;
    st.garrison[attacker] += push;

    const battle = {
      id: `battle:${st.id}:${this._battleSeq++}`,
      poiId: st.id,
      node: st.node,
      attacker,
      defender: OTHER[attacker],
      phase: 'pending',
      live: false,
      startsAt: this.time + rng.range(TUNING.warnMin, TUNING.warnMax),
      endsAt: 0,
      duration: rng.range(TUNING.durationMin, TUNING.durationMax),
      push,
      committed: {
        [attacker]: st.garrison[attacker] * rng.range(0.45, 0.85),
        [OTHER[attacker]]: st.garrison[OTHER[attacker]] * rng.range(TUNING.commitMin, TUNING.commitMax),
      },
      fleets: { coalition: null, concord: null },
      ships: [],
      winner: null,
    };
    st.battle = battle;
    this.battles.push(battle);
    return battle;
  }

  _updateBattles(dt) {
    for (let i = this.battles.length - 1; i >= 0; i--) {
      const b = this.battles[i];
      const st = this.states.get(b.poiId);
      if (!st) { this.battles.splice(i, 1); continue; }

      if (b.phase === 'pending') {
        if (this.time >= b.startsAt) this._begin(st, b);
        continue;
      }

      if (b.phase !== 'active') { this.battles.splice(i, 1); continue; }

      if (b.live) {
        let coalitionLeft = 0;
        let concordLeft = 0;
        for (const s of b.ships) {
          if (s.dead) continue;
          const str = shipStrength(s);
          if (s.faction === 'coalition') coalitionLeft += str; else concordLeft += str;
        }
        b.remaining = { coalition: coalitionLeft, concord: concordLeft };
        const oneSideGone = coalitionLeft <= 0 || concordLeft <= 0;
        if (oneSideGone || this.time >= b.endsAt) {
          this._resolveLive(st, b);
          this.battles.splice(i, 1);
        }
      } else if (this.time >= b.endsAt) {
        this._resolveAbstract(st, b);
        this.battles.splice(i, 1);
      }
    }
  }

  _begin(st, b) {
    b.phase = 'active';
    b.endsAt = this.time + b.duration;
    const player = this.world.player;
    const atPOI = !!player && !player.dead
      && player.position.distanceTo(b.node.position) <= b.node.radius;

    b.live = atPOI && !!this.fleetAI && !!this.shipAI;
    if (b.live) this._spawnBattle(st, b);

    st.heat = Math.min(1, st.heat + 0.18);
    this.bus.emit(EV.BATTLE_STARTED, {
      poiId: st.id,
      name: b.node.name,
      live: b.live,
      attacker: b.attacker,
      endsAt: b.endsAt,
      duration: b.duration,
      committed: { ...b.committed },
    });
  }

  /**
   * Real ships, real fleets, real combat. Two lines forming up on opposite sides of the
   * POI at the range broadside ships actually open fire at, so the first thing the
   * player sees is two formations turning to present.
   */
  _spawnBattle(st, b) {
    const rng = this._spawnRng.fork(b.id);
    const world = this.world;
    const centre = b.node.position;
    const axis = rng.range(0, Math.PI * 2);
    // Opening range. Cannon reach is 5.2 km and a frigate closes at 155 m/s, so a
    // 16 km separation buys ninety seconds of two formations driving at each other
    // with nothing to do. Open just outside effective range and let the manoeuvring
    // start immediately - that manoeuvring is the fight.
    const separation = rng.range(7000, 11000);

    for (const faction of ['coalition', 'concord']) {
      const strength = b.committed[faction];
      if (strength < 120) continue;
      const count = THREE.MathUtils.clamp(Math.round(strength / 420), 1, 5);
      const side = faction === b.attacker ? 1 : -1;

      const anchor = new THREE.Vector3(
        centre.x + Math.sin(axis) * separation * 0.5 * side,
        0,
        centre.z + Math.cos(axis) * separation * 0.5 * side,
      );
      const fleet = this.fleetAI.create({ faction, anchor, poiId: st.id });
      fleet.stance = 'engage';
      b.fleets[faction] = fleet;

      // Facing: toward the enemy line.
      const facing = Math.atan2(centre.x - anchor.x, centre.z - anchor.z);
      const perpX = Math.cos(facing);
      const perpZ = -Math.sin(facing);

      for (let i = 0; i < count; i++) {
        const role = this._roleFor(rng, i, count);
        const classDef = pickClass(faction, role);
        const lateral = (i - (count - 1) * 0.5) * 1100;
        const ship = new Ship({
          classDef,
          world,
          faction,
          position: new THREE.Vector3(
            anchor.x + perpX * lateral + rng.signed() * 220,
            0,
            anchor.z + perpZ * lateral + rng.signed() * 220,
          ),
          heading: facing + rng.signed() * 0.18,
          root: this._buildRoot(classDef, faction, rng),
        });
        world.addShip(ship);
        const ai = ship.ai ?? this.shipAI.adopt(ship, { fleet, anchor });
        if (ai) ai.fleet = fleet;
        fleet.add(ship);
        b.ships.push(ship);
      }
    }
  }

  _roleFor(rng, i, count) {
    // One heavy anchors the line; the rest is escort. A five-hull line that is five
    // destroyers is not a fleet, it is a wall.
    if (i === 0) return count >= 3 ? 'destroyer' : 'frigate';
    if (i === count - 1 && count >= 3) return 'corvette';
    return rng.bool(0.65) ? 'frigate' : 'corvette';
  }

  _buildRoot(classDef, faction, rng) {
    const materials = this.world.systems?.materials;
    if (!classDef.build) return undefined;
    try {
      return classDef.build({
        rng: rng.fork(classDef.id),
        materials,
        palette: materials?.palette ?? null,
        faction,
        lod: 0,
      });
    } catch (err) {
      console.warn(`[faction-war] could not build ${classDef.id}`, err);
      return undefined;
    }
  }

  // --- resolution ----------------------------------------------------------

  /**
   * The abstract path. One roll, weighted by committed strength, with enough noise
   * that a 60/40 fight is not a foregone conclusion. Everything it writes - control,
   * heat, garrisons, wreckage - is the same state the live path writes.
   */
  _resolveAbstract(st, b) {
    const rng = this._battleRng;
    const a = b.committed.coalition * rng.range(0.70, 1.34);
    const c = b.committed.concord * rng.range(0.70, 1.34);
    const winner = a >= c ? 'coalition' : 'concord';
    const loser = OTHER[winner];
    const margin = Math.abs(a - c) / Math.max(1, a + c);

    const loserLoss = b.committed[loser] * rng.range(0.62, 0.96);
    const winnerLoss = b.committed[winner] * rng.range(0.18, 0.55) * (1 - margin * 0.5);

    st.garrison[loser] = Math.max(0, st.garrison[loser] - loserLoss);
    st.garrison[winner] = Math.max(0, st.garrison[winner] - winnerLoss);

    const dir = winner === 'coalition' ? 1 : -1;
    st.control = THREE.MathUtils.clamp(
      st.control + dir * TUNING.controlPerWin * (0.45 + margin), -1, 1,
    );
    st.heat = Math.min(1, st.heat + TUNING.heatPerBattle);

    this._depositWreckage(st, loser, loserLoss, rng);
    this._depositWreckage(st, winner, winnerLoss, rng);

    this._finish(st, b, winner, false);
  }

  /** The live path. Whatever survived is the answer; the arithmetic just records it. */
  _resolveLive(st, b) {
    const left = b.remaining ?? { coalition: 0, concord: 0 };
    const winner = left.coalition >= left.concord ? 'coalition' : 'concord';
    const loser = OTHER[winner];

    // Return survivors to the garrison, and count what did not come back as losses.
    for (const faction of ['coalition', 'concord']) {
      const committed = b.committed[faction];
      const survived = left[faction] ?? 0;
      st.garrison[faction] = Math.max(0, st.garrison[faction] - committed + Math.min(committed, survived));
    }

    const total = (left.coalition + left.concord) || 1;
    const margin = Math.abs(left.coalition - left.concord) / total;
    const dir = winner === 'coalition' ? 1 : -1;
    st.control = THREE.MathUtils.clamp(st.control + dir * TUNING.controlPerWin * (0.45 + margin), -1, 1);
    st.heat = Math.min(1, st.heat + TUNING.heatPerBattle);

    // The wrecks are already in `world.wrecks` - the salvage system made them from the
    // ships the player watched die. All we record is that this place is now a field.
    st.debris += Math.round(b.ships.length * 26);

    // Survivors leave. They are somebody's reinforcements somewhere else, and they are
    // despawned once they are far enough out that nobody watches them evaporate.
    for (const f of ['coalition', 'concord']) {
      const fleet = b.fleets[f];
      if (fleet) fleet.stance = 'withdraw';
    }
    for (const s of b.ships) {
      if (s.dead) continue;
      s.__leaveAt = this.time + 150;
      s.__leavePOI = st.id;
      this._leaving.push(s);
    }
    this._finish(st, b, winner, true);
  }

  /**
   * Retire withdrawing survivors. Ships are removed once they are outside the player's
   * useful view or have been running long enough, and their strength goes back into the
   * garrison they came from - so a fleet that survives a battle is a fleet that is
   * still there next time.
   */
  _retireLeavers() {
    if (this._leaving.length === 0) return;
    const player = this.world.player;
    for (let i = this._leaving.length - 1; i >= 0; i--) {
      const s = this._leaving[i];
      if (!s || s.dead) { this._leaving.splice(i, 1); continue; }
      const far = !player || player.dead
        || s.position.distanceTo(player.position) > 30000;
      if (!far && this.time < s.__leaveAt) continue;
      const st = this.states.get(s.__leavePOI);
      if (st) st.garrison[s.faction] = (st.garrison[s.faction] ?? 0) + shipStrength(s);
      this.shipAI?.release?.(s);
      this.world.removeShip(s);
      this._leaving.splice(i, 1);
    }
  }

  _finish(st, b, winner, live) {
    b.phase = 'resolved';
    b.winner = winner;
    // Only clear the POI's pointer if it is still pointing at us. Anything that forced
    // a second battle onto this POI must not have its reference torn out by the first
    // one finishing.
    if (st.battle === b) st.battle = null;
    st.battlesFought++;
    st.battleCooldown = TUNING.battleCooldown;

    const record = {
      id: b.id, poiId: st.id, name: b.node.name, winner, live,
      at: this.time, control: st.control, heat: st.heat,
    };
    this.log.push(record);
    if (this.log.length > 64) this.log.shift();

    this.bus.emit(EV.BATTLE_RESOLVED, record);
  }

  /**
   * Convert losses into hulls lying at the POI. Persistent: they survive the player
   * flying away and coming back, and they are what the salvage layer eats when the
   * player finally turns up.
   */
  _depositWreckage(st, faction, lost, rng) {
    let remaining = lost;
    let guard = 0;
    while (remaining > 200 && st.hulks.length < 14 && guard++ < 12) {
      const role = remaining > 900 ? 'destroyer' : remaining > 420 ? 'frigate' : 'corvette';
      const cost = role === 'destroyer' ? 900 : role === 'frigate' ? 420 : 200;
      remaining -= cost;
      st.hulks.push({
        faction,
        role,
        // How it died decides what is left of it. Most of a fleet action is not a
        // careful engine kill.
        integrity: rng.range(0.12, 0.62),
        seed: rng.int(0, 1e6),
        age: 0,
      });
    }
    st.debris += Math.round(lost / 12);
  }

  // --- observation ---------------------------------------------------------

  /** The player having eyes on a place is what makes its data fresh. */
  _observe() {
    const player = this.world.player;
    if (!player || player.dead) return;
    for (const st of this.states.values()) {
      const d = st.node.position.distanceTo(player.position);
      if (d <= st.node.radius) {
        st.lastSeenTick = this.time;
        st.visited = true;
      }
    }
  }

  // =========================================================================
  // Materialising a POI's wreckage
  // =========================================================================

  /**
   * Turn the persistent hulk records at a POI into real, cuttable `Wreck` objects.
   * Called by the travel layer on arrival. This is the difference between "the war
   * changed a number" and "there is a Coalition destroyer here with its spine open".
   */
  materialise(poiId, ctx) {
    const st = this.states.get(poiId);
    if (!st || st.materialised) return [];
    const world = this.world;
    const rng = this.rng.fork(`materialise:${poiId}:${st.battlesFought}`);
    const centre = st.node.position;
    const made = [];

    for (const record of st.hulks) {
      const classDef = pickClass(record.faction, record.role);
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(1800, 11000);
      const ghost = new Ship({
        classDef,
        world,
        faction: record.faction,
        position: new THREE.Vector3(centre.x + Math.sin(a) * r, rng.signed() * 900, centre.z + Math.cos(a) * r),
        heading: rng.range(0, Math.PI * 2),
        root: this._buildRoot(classDef, record.faction, rng.fork(String(record.seed))),
      });
      ghost.salvageIntegrity = record.integrity;
      // Kill off a plausible share of its subsystems so the sections it yields match
      // how badly it died, exactly as a live kill would have.
      for (const sub of ghost.subsystems.values()) {
        if (rng.next() > record.integrity) { sub.hp = 0; sub.destroyed = true; }
      }
      ghost.root.quaternion.setFromEuler(new THREE.Euler(
        rng.signed() * 0.5, rng.range(0, Math.PI * 2), rng.signed() * 0.4, 'YXZ',
      ));

      const wreck = new Wreck({ ship: ghost, root: ghost.root, rng: rng.fork(`w${record.seed}`) });
      wreck.body.angularVelocity.set(rng.signed() * 0.02, rng.signed() * 0.015, rng.signed() * 0.02);
      wreck.__warRecord = record;
      wreck.__warPOI = poiId;
      world.addWreck(wreck);
      made.push(wreck);
    }

    // Anything intact that was left lying here comes back as exactly what it was.
    for (const stray of st.strays) {
      const detached = new DetachedModule({
        id: `stray:${poiId}:${stray.moduleId}:${made.length}`,
        name: stray.name ?? getModule(stray.moduleId)?.name ?? 'MODULE',
        faction: stray.faction ?? 'derelict',
        moduleId: stray.moduleId,
        condition: stray.condition,
        position: new THREE.Vector3(stray.x, stray.y ?? 0, stray.z),
        velocity: null,
        radius: 26,
        rng: rng.fork(`stray:${stray.moduleId}:${made.length}`),
      });
      detached.residualHeat = 0;        // it has been out here since you left
      detached.__warPOI = poiId;
      detached.__stray = stray;
      world.addWreck(detached);
      made.push(detached);
    }

    st.materialised = true;
    return made;
  }

  /**
   * Reverse of `materialise`. Anything the player stripped is gone for good; anything
   * they left is written back so it is still here next time.
   *
   * It adopts EVERY un-spent wreck inside the POI boundary, not just the ones it put
   * there - a hull the player watched die in a live battle and could not be bothered to
   * finish cutting is exactly as persistent as one the abstract resolver invented.
   */
  dematerialise(poiId) {
    const st = this.states.get(poiId);
    if (!st) return;
    const world = this.world;
    const node = st.node;
    const kept = [];
    const strays = [];
    for (let i = world.wrecks.length - 1; i >= 0; i--) {
      const w = world.wrecks[i];
      const here = w.__warPOI === poiId
        || (w.body?.position && w.body.position.distanceTo(node.position) <= node.radius);
      if (!here) continue;
      // Hardware the player lost when their own hull went is owned by
      // `sim/meta/derelict.js`, which keeps it by distance rather than by POI. Touching
      // it here would record it twice and hand it back twice.
      if (w.__ownedBySite) continue;
      // A loose module is not a hull. Recording it as one is how a cannon bank you shot
      // free became a frigate hulk on your next visit; it keeps its own identity now,
      // including the condition it was in when you walked away from it.
      if (w.detachedModule) {
        const sec = w.sections[0];
        if (!w.spent && sec?.moduleId) {
          strays.push({
            moduleId: sec.moduleId,
            name: w.name,
            faction: w.faction,
            condition: sec.condition,
            x: w.body.position.x, y: w.body.position.y, z: w.body.position.z,
          });
        }
        world.removeWreck(w);
        continue;
      }
      if (!w.spent) {
        kept.push(w.__warRecord ?? {
          faction: w.faction === 'coalition' || w.faction === 'concord' ? w.faction : 'coalition',
          role: w.sourceClass?.role ?? 'frigate',
          integrity: Math.max(0.08, w.integrity ?? 0.3),
          seed: this.rng.int(0, 1e6),
          age: 0,
        });
      }
      world.removeWreck(w);
    }
    st.hulks = kept.slice(0, 14);
    st.strays = strays.slice(0, 12);
    st.materialised = false;
  }

  /**
   * Background debris for a POI build. A place that has been fought over eleven times
   * is visibly fuller than one that has not - the field is the war's receipt.
   */
  debrisSpecFor(poiId) {
    const st = this.states.get(poiId);
    if (!st || st.debris <= 0) return null;
    const factions = [];
    if (st.control < 0.55) factions.push('concord');
    if (st.control > -0.55) factions.push('coalition');
    if (!factions.length) factions.push('coalition');
    const age = st.battlesFought > 0 ? THREE.MathUtils.clamp(1 - st.heat, 0.15, 0.95) : 0.6;
    return {
      count: THREE.MathUtils.clamp(80 + st.debris, 80, 520),
      factions,
      scorched: THREE.MathUtils.clamp(0.2 + st.battlesFought * 0.06, 0.2, 0.7),
      age,
      plumes: st.heat > 0.5 ? 22 : 8,
    };
  }

  // =========================================================================
  // Reputation
  // =========================================================================

  _bindReputation() {
    const world = this.world;
    /** Remembered so a `SALVAGE_ACQUIRED` can be attributed to whose hull it came off. */
    this._lastCutFaction = null;

    this._offCut = this.bus.on(EV.SALVAGE_CUT_START, ({ wreck }) => {
      this._lastCutFaction = wreck?.faction ?? null;
    });

    this._offSalvage = this.bus.on(EV.SALVAGE_ACQUIRED, (e) => {
      const section = e?.section;
      let faction = this._lastCutFaction;
      if (section) {
        for (const w of world.wrecks) {
          if (w.sections.includes(section)) { faction = w.faction; break; }
        }
      }
      if (faction === 'coalition' || faction === 'concord') {
        // Stripping a hull is theft, and both sides know whose hull it was.
        this.adjustReputation(faction, -1.1, 'salvage');
        const weight = e?.kind === 'module' ? LEDGER.perModule
          : e?.kind === 'ammo' ? LEDGER.perAmmo
            : LEDGER.perSection;
        this.accrueClaim(faction, weight, 'salvage');
      }
    });

    // Paying a berth is how you buy attention down. It is not forgiveness, it is a
    // receipt: you turned up somewhere they run and settled a bill.
    this._offDock = this.bus.on(MEV.DOCKED, ({ services }) => {
      const owner = services?.owner;
      const entry = this.ledger[owner];
      if (!entry) return;
      const before = entry.claim;
      entry.claim *= 1 - LEDGER.dockRelief;
      if (before - entry.claim > 1) {
        this.bus.emit(MEV.LEDGER_CHANGED, {
          faction: owner, claim: entry.claim, delta: entry.claim - before, reason: 'berth',
        });
      }
    });

    this._offKill = this.bus.on(EV.SHIP_DESTROYED, ({ ship, source }) => {
      const killer = source?.isPlayer ? 'player' : source?.faction ?? null;
      if (killer !== 'player' && killer !== 'player_squadron') return;
      const victim = ship?.faction;
      if (victim !== 'coalition' && victim !== 'concord') return;
      this.adjustReputation(victim, -9, 'kill');
      this.adjustReputation(OTHER[victim], 3, 'enemy-of-my-enemy');
      this.accrueClaim(victim, LEDGER.perKill, 'kill');
    });
  }

  // =========================================================================
  // The salvage ledger
  // =========================================================================

  /**
   * Charge a faction's claim against the player.
   *
   * Scaled by how much of the place they hold: cutting a Coalition destroyer in
   * Coalition space is theft in front of them, and cutting the same hull in Concord
   * space is barely their business. That single multiplier is what makes the pressure
   * spatially negotiable rather than a timer with a skin on it.
   */
  accrueClaim(faction, base, reason = '') {
    const entry = this.ledger[faction];
    if (!entry || !(base > 0)) return 0;
    const player = this.world.player;
    const share = player ? this._controlShare(faction, player.position.x, player.position.z) : 0.5;
    const delta = base * (0.30 + 0.70 * share);
    entry.claim += delta;
    entry.lastPOI = this.system.containing(player?.position.x ?? 0, player?.position.z ?? 0)?.id ?? null;
    this.bus.emit(MEV.LEDGER_CHANGED, { faction, claim: entry.claim, delta, reason });
    return delta;
  }

  /** 0..1 how much of the control field at a point belongs to this faction. */
  _controlShare(faction, x, z) {
    const c = this.controlAtPoint(x, z);
    return faction === 'coalition' ? (c + 1) * 0.5 : (1 - c) * 0.5;
  }

  /**
   * Decay and thresholds. Runs on the strategic step, so it is coarse on purpose - a
   * response that could arrive on any frame would read as random.
   */
  _updateLedger(dt) {
    const player = this.world.player;
    // Nobody sends a hunter-killer into their own berth after a ship that is moored at
    // it. Attention still decays while docked; it just cannot be answered.
    const docked = !!this.world.systems.travel?.docked;
    const alive = !!player && !player.dead;
    const canRespond = alive && !player.crippled && !docked;

    for (const faction of ['coalition', 'concord']) {
      const entry = this.ledger[faction];
      if (entry.cooldown > 0) entry.cooldown -= dt;

      // Away from their space, attention fades fast. Sitting in it, it barely fades.
      const share = alive ? this._controlShare(faction, player.position.x, player.position.z) : 0;
      const mul = 1 + (1 - share) * (LEDGER.awayMul - 1);
      if (entry.claim > 0) {
        entry.claim = Math.max(0, entry.claim - LEDGER.decay * mul * dt);
      }

      // Re-arm a rung once the claim falls back through it, so the table is a ladder
      // you can climb twice rather than a set of one-shot triggers.
      while (entry.tier >= 0 && entry.claim < ESCALATION[entry.tier].at * 0.6) entry.tier--;
      if (entry.warned > entry.tier + 1) entry.warned = entry.tier;

      const next = ESCALATION[entry.tier + 1];
      if (!next || !canRespond) continue;

      if (entry.warned <= entry.tier && entry.claim >= next.at * LEDGER.warnAt) {
        entry.warned = entry.tier + 1;
        this.bus.emit(EV.NOTIFY, {
          text: `${faction.toUpperCase()} HAS NOTICED — ${next.tier.toUpperCase()} AT `
            + `${Math.round(next.at)} CLAIM, YOU ARE AT ${Math.round(entry.claim)}`,
          important: true,
        });
      }
      if (entry.claim >= next.at && entry.cooldown <= 0) {
        entry.tier++;
        entry.cooldown = next.cooldown;
        entry.responses++;
        entry.claim -= next.at * LEDGER.dischargeOnSpawn;
        this._spawnResponse(faction, next);
      }
    }
  }

  /**
   * Send it. Built on the same three calls the interception path in `travel.js` uses -
   * `pickClass`, `new Ship`, `fleetAI.create` - so an escalation group is not a special
   * kind of enemy, it is the fleet AI arriving with a reason.
   */
  _spawnResponse(faction, rung) {
    const player = this.world.player;
    if (!player) return null;
    const rng = this._escalationRng.fork(`${faction}:${rung.tier}:${this.ledger[faction].responses}`);

    // A tender or a picket comes to the FIELD; a hunter comes to YOU.
    const here = this.system.containing(player.position.x, player.position.z);
    const anchor = rung.plotsToPlayer || !here ? player.position : here.position;
    const bearing = rung.plotsToPlayer
      ? Math.atan2(player.velocity.x, player.velocity.z) + Math.PI
      : rng.range(0, Math.PI * 2);
    const standoff = rung.plotsToPlayer ? rng.range(11000, 16000) : rng.range(17000, 26000);

    const fleet = this.fleetAI?.create({
      faction, anchor: new THREE.Vector3(anchor.x, 0, anchor.z), poiId: here?.id ?? null,
    }) ?? null;
    if (fleet) fleet.stance = 'engage';

    const group = { faction, tier: rung.tier, at: this.time, poiId: here?.id ?? null, ships: [] };
    for (let i = 0; i < rung.roles.length; i++) {
      const classDef = pickClass(faction, rung.roles[i]);
      if (!classDef) continue;
      const spread = (i - (rung.roles.length - 1) * 0.5) * 1300;
      const s = Math.sin(bearing), c = Math.cos(bearing);
      const ship = new Ship({
        classDef,
        world: this.world,
        faction,
        position: new THREE.Vector3(
          anchor.x + s * standoff + c * spread,
          0,
          anchor.z + c * standoff - s * spread,
        ),
        heading: bearing + Math.PI + rng.signed() * 0.2,
        root: this._buildRoot(classDef, faction, rng),
      });
      ship.__escalation = rung.tier;
      this.world.addShip(ship);
      const ai = ship.ai ?? this.shipAI?.adopt(ship, { fleet });
      if (ai && fleet) { ai.fleet = fleet; fleet.add(ship); }
      group.ships.push(ship);
    }
    this.responses.push(group);
    if (this.responses.length > 8) this.responses.shift();

    // Somebody turning up to claim a field they own is a patrol, so it raises heat here.
    if (here) this.bumpHeat(here.id, 0.12);

    this.bus.emit(MEV.ESCALATION, {
      faction, tier: rung.tier, poiId: here?.id ?? null,
      ships: group.ships.length, claim: this.ledger[faction].claim,
    });
    this.bus.emit(EV.NOTIFY, { text: `${faction.toUpperCase()} — ${rung.text}`, important: true });
    return group;
  }

  /**
   * READ API — the attention panel.
   *
   * Everything the player needs to answer "how long can I keep working here": the claim,
   * what it is buying them, how far the next rung is, and - the useful one - how fast it
   * is currently falling, which is a direct readout of the spatial decision.
   */
  ledgerStatus() {
    const player = this.world.player;
    const out = [];
    for (const faction of ['coalition', 'concord']) {
      const entry = this.ledger[faction];
      const share = player ? this._controlShare(faction, player.position.x, player.position.z) : 0.5;
      const decayPerSecond = LEDGER.decay * (1 + (1 - share) * (LEDGER.awayMul - 1));
      const next = ESCALATION[entry.tier + 1] ?? null;
      out.push({
        faction,
        claim: entry.claim,
        tier: entry.tier >= 0 ? ESCALATION[entry.tier].tier : null,
        next: next ? next.tier : null,
        nextAt: next ? next.at : null,
        toNext: next ? Math.max(0, next.at - entry.claim) : null,
        secondsToNext: next && decayPerSecond > 0
          ? (entry.claim >= next.at ? 0 : null)
          : null,
        decayPerSecond,
        theirSpace: share,
        cooldown: Math.max(0, entry.cooldown),
        responses: entry.responses,
        /** The sentence a HUD prints verbatim. */
        text: next
          ? `${Math.round(entry.claim)} / ${next.at} to ${next.tier.toUpperCase()} `
            + `· shedding ${decayPerSecond.toFixed(2)}/s`
          : `${Math.round(entry.claim)} · everything they have is already out`,
      });
    }
    return out;
  }

  /**
   * Move a reputation. `World.areHostile` reads the sign of this, so crossing zero is
   * the moment a faction starts shooting at the player on sight - which is why the
   * step sizes are big enough to feel and the notification is loud.
   */
  adjustReputation(faction, delta, reason = '') {
    const rep = this.world.reputation;
    if (rep[faction] === undefined) return;
    const before = rep[faction];
    rep[faction] = THREE.MathUtils.clamp(before + delta, -100, 100);
    if (rep[faction] === before) return;

    this.bus.emit(EV.REPUTATION_CHANGED, {
      faction, value: rep[faction], delta: rep[faction] - before, reason,
    });
    if (before >= 0 && rep[faction] < 0) {
      this.bus.emit(EV.NOTIFY, { text: `${faction.toUpperCase()} FORCES NOW HOSTILE`, important: true });
    } else if (before < 0 && rep[faction] >= 0) {
      this.bus.emit(EV.NOTIFY, { text: `${faction.toUpperCase()} standing down`, important: true });
    }
    if (before > TUNING.picketRep && rep[faction] <= TUNING.picketRep) {
      this.bus.emit(EV.NOTIFY, { text: `${faction.toUpperCase()} pickets deployed — transit risk up`, important: true });
    }
  }

  dispose() {
    this._offCut?.();
    this._offSalvage?.();
    this._offKill?.();
    this._offDock?.();
  }

  // =========================================================================
  // Front line
  // =========================================================================

  _rebuildFront() {
    this._frontDirty = false;
    const g = this._frontGrid;
    const { minX, maxX, minZ, maxZ } = this.system.bounds;
    const dx = (maxX - minX) / g;
    const dz = (maxZ - minZ) / g;
    const f = this._frontField;

    for (let j = 0; j <= g; j++) {
      for (let i = 0; i <= g; i++) {
        f[j * (g + 1) + i] = this.controlAtPoint(minX + i * dx, minZ + j * dz);
      }
    }

    const out = this._front;
    out.length = 0;
    // Pooled Vector2s. This runs every three seconds, not every frame, but a contour
    // that reallocates two hundred vectors on a schedule is still garbage on a
    // schedule, and the pool costs one line.
    const pool = this._frontPool ?? (this._frontPool = []);
    let cursor = 0;
    const take = (x, z) => {
      const v = pool[cursor] ?? (pool[cursor] = new THREE.Vector2());
      cursor++;
      return v.set(x, z);
    };
    // Marching squares, linear interpolation on each crossed edge. Segments rather
    // than a stitched polyline: the contour can be several disjoint fronts and
    // pretending otherwise draws a line across the middle of the system.
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const x0 = minX + i * dx, z0 = minZ + j * dz;
        const a = f[j * (g + 1) + i];
        const b = f[j * (g + 1) + i + 1];
        const c = f[(j + 1) * (g + 1) + i + 1];
        const d = f[(j + 1) * (g + 1) + i];
        const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;

        const lerp = (p, q) => (0 - p) / (q - p || 1e-6);
        const top = () => take(x0 + dx * lerp(a, b), z0);
        const right = () => take(x0 + dx, z0 + dz * lerp(b, c));
        const bottom = () => take(x0 + dx * lerp(d, c), z0 + dz);
        const left = () => take(x0, z0 + dz * lerp(a, d));

        const push = (p, q) => { out.push(p, q); };
        switch (idx) {
          case 1: case 14: push(left(), top()); break;
          case 2: case 13: push(top(), right()); break;
          case 3: case 12: push(left(), right()); break;
          case 4: case 11: push(right(), bottom()); break;
          case 6: case 9: push(top(), bottom()); break;
          case 7: case 8: push(left(), bottom()); break;
          case 5: push(left(), top()); push(right(), bottom()); break;
          case 10: push(top(), right()); push(left(), bottom()); break;
          default: break;
        }
      }
    }
    return out;
  }
}

export { TUNING as WAR_TUNING };
