import { EV } from '../../core/events.js';
import { MEV } from './events.js';

/**
 * OBJECTIVES — systemic, generated, expiring. Not missions.
 *
 * `beta-decay-systems.md` #18 makes the argument this file is built on. Beta Decay's
 * own contract system is the least-developed thing on their board at 35%, and our brief
 * forbids hand-authored missions outright. But the research also points out that we
 * already have the in-scope version and have not surfaced it:
 *
 *     "That is a contract with no contract system: a place, a clock, and a reward that
 *      changes with when you arrive."
 *
 * So there is no contract terminal here, no giver, no accept button and no text. An
 * objective is a READING of the faction war that is already running - it names a place
 * the simulation has made interesting, states the clock the simulation is already
 * counting down, and prices what showing up is worth at each point on that clock. If
 * the player ignores every one of them, the war proceeds identically. If the player
 * never opens the panel, the payouts still land, because the trigger is being there.
 *
 * THE FOUR SHAPES, all derived from state `world/factionWar.js` already maintains:
 *
 *   intercept   a battle is scheduled at a POI. Arrive before it starts and you fight
 *               for the field; arrive during and you cut under fire; arrive after and
 *               it is a cold field at a third of the price. THE FORK IS THE OBJECTIVE.
 *   strip       a POI is holding wreckage. Cut N sections out of it before the window
 *               closes and the controlling faction's tenders have had their turn.
 *   blockade    a faction you have made an enemy of is running a POI hot. Break N of
 *               their hulls there.
 *   prospect    a valuable POI nobody has looked at. Go and look. Small, safe, and it
 *               is supposed to be - the reference's "the quiet version must still be
 *               worth doing".
 *
 * This system NEVER writes to the war. It reads `world.systems.factionWar` and pays out
 * of the materials economy, which is this stream's to spend.
 */

/** Sim seconds between generation passes. Coarse: this is a war, not a tick. */
const GEN_INTERVAL = 12;

/** Never more than this many open at once. A list you cannot read is not an objective. */
const MAX_ACTIVE = 4;

/**
 * Arrival tiers for `intercept`, and what each is worth.
 *
 * This table IS the design. It is the only place in the game where being early is
 * priced, and the numbers are deliberately steep enough that a player will divert.
 */
export const ARRIVAL_TIERS = [
  { id: 'ahead', label: 'AHEAD OF IT', multiplier: 1.75, note: 'in position before the first shot' },
  { id: 'during', label: 'UNDER FIRE', multiplier: 1.25, note: 'cutting while it is still being fought' },
  { id: 'cold', label: 'COLD FIELD', multiplier: 0.55, note: 'nobody shooting, and the good sections already gone' },
];

let SEQ = 0;

export class ObjectiveSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('objectives');
    this.name = 'objectives';
    this.order = 30;

    this.time = 0;
    this._genAccum = GEN_INTERVAL;   // generate on the first step, not 12 s in

    /** @type {Object[]} */
    this.active = [];
    /** @type {Object[]} closed, capped. The panel reads this for history. */
    this.log = [];

    this._offs = [];
    this._bind();
  }

  get war() { return this.world.systems.factionWar ?? null; }

  // =========================================================================
  // Generation
  // =========================================================================

  fixedUpdate(dt) {
    this.time += dt;
    this._genAccum += dt;
    if (this._genAccum >= GEN_INTERVAL) {
      this._genAccum = 0;
      this._expire();
      this._generate();
    }
    this._trackPresence();
  }

  _expire() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (this.time < o.expiresAt) continue;
      this._close(o, o.progress >= o.target ? 'complete' : 'expired');
    }
  }

  /**
   * Look at the war and name what is interesting. Deterministic: everything random in
   * here draws from the forked stream, so a seed reproduces the same offers.
   */
  _generate() {
    const war = this.war;
    if (!war || this.active.length >= MAX_ACTIVE) return;
    let snap;
    try { snap = war.snapshot(); } catch { return; }

    const candidates = [];
    for (const poi of snap.pois) {
      if (this.active.some((o) => o.poiId === poi.id)) continue;

      if (poi.battle && poi.battle.phase !== 'resolved') {
        candidates.push({ weight: 5.0, make: () => this._makeIntercept(poi) });
      }
      if (poi.hulks >= 3) {
        candidates.push({ weight: 3.0 + poi.hulks * 0.25, make: () => this._makeStrip(poi) });
      }
      const hostileOwner = poi.owner !== 'contested'
        && (snap.reputation[poi.owner] ?? 0) < 0 && poi.heat > 0.45;
      if (hostileOwner) {
        candidates.push({ weight: 2.0, make: () => this._makeBlockade(poi) });
      }
      if (!poi.visited && poi.heat < 0.5) {
        candidates.push({ weight: 1.2, make: () => this._makeProspect(poi) });
      }
    }
    if (!candidates.length) return;

    const pick = this.rng.pickWeighted(candidates);
    const o = pick.make();
    if (!o) return;
    this.active.push(o);
    this.bus?.emit(MEV.OBJECTIVE_OPENED, o);
    this.bus?.emit(EV.NOTIFY, { text: `${o.title} — ${o.poiName}`, important: false });
  }

  _base(poi, kind, extra) {
    return {
      id: `obj:${kind}:${poi.id}:${SEQ++}`,
      kind,
      poiId: poi.id,
      poiName: poi.name,
      x: poi.x,
      z: poi.z,
      openedAt: this.time,
      state: 'open',
      progress: 0,
      target: 1,
      arrivalTier: null,
      arrived: false,
      ...extra,
    };
  }

  _makeIntercept(poi) {
    const war = this.war;
    const battle = war.states?.get(poi.id)?.battle;
    if (!battle) return null;
    const startsAt = battle.startsAt ?? 0;
    const endsAt = battle.endsAt || (startsAt + (battle.duration ?? 160));
    const value = 1 + (poi.contested ? 0.6 : 0);
    return this._base(poi, 'intercept', {
      title: 'ENGAGEMENT FORMING',
      detail: `${battle.attacker} is pushing ${poi.name}. Wreckage will be freshest while it is still being fought.`,
      // Sim-time landmarks lifted straight off the war's own clock.
      battleStartsAt: startsAt,
      battleEndsAt: endsAt,
      expiresAt: endsAt + 300,
      target: 3,
      targetText: 'cut 3 sections here',
      reward: { alloy: Math.round(70 * value), composite: Math.round(26 * value), electronics: Math.round(18 * value) },
      rewardScales: true,
    });
  }

  _makeStrip(poi) {
    const hulks = poi.hulks;
    const window = 420 + hulks * 40;
    return this._base(poi, 'strip', {
      title: 'FIELD UNCLAIMED',
      detail: `${hulks} hulls lying at ${poi.name}. Whoever holds this space will get round to them.`,
      expiresAt: this.time + window,
      target: Math.min(6, 2 + Math.floor(hulks / 3)),
      targetText: `cut ${Math.min(6, 2 + Math.floor(hulks / 3))} sections here`,
      reward: { alloy: 40 + hulks * 8, composite: 18 + hulks * 3 },
      rewardScales: false,
      patternChance: 0.35,
    });
  }

  _makeBlockade(poi) {
    return this._base(poi, 'blockade', {
      title: 'PICKET RUNNING HOT',
      detail: `${poi.owner} is patrolling ${poi.name} in strength and they already want you dead.`,
      expiresAt: this.time + 540,
      target: 2,
      targetText: `destroy 2 ${poi.owner} hulls here`,
      faction: poi.owner,
      reward: { alloy: 55, electronics: 40 },
      reputation: { faction: poi.owner === 'coalition' ? 'concord' : 'coalition', delta: 6 },
      rewardScales: false,
    });
  }

  _makeProspect(poi) {
    return this._base(poi, 'prospect', {
      title: 'UNSURVEYED',
      detail: `Nobody has had eyes on ${poi.name}. Quiet, for now.`,
      expiresAt: this.time + 900,
      target: 1,
      targetText: 'be there',
      reward: { alloy: 22, electronics: 14 },
      rewardScales: false,
    });
  }

  // =========================================================================
  // Tracking
  // =========================================================================

  /** POI geometry, from the world sim's own node table. Read-only. */
  _nodeFor(poiId) {
    const nodes = this.world.systems.system?.nodes;
    if (!nodes) return null;
    for (const n of nodes) if (n.id === poiId) return n;
    return null;
  }

  /** Is the player standing inside this objective's POI right now? */
  _playerAt(o) {
    const p = this.world.player;
    if (!p || p.dead) return false;
    const node = this._nodeFor(o.poiId);
    if (node) return p.position.distanceTo(node.position) <= node.radius;
    // Fall back to the snapshot's flat coordinates and a generous radius.
    const dx = p.position.x - o.x;
    const dz = p.position.z - o.z;
    return dx * dx + dz * dz <= 40000 * 40000;
  }

  /**
   * Presence is what stamps the arrival tier, and the arrival tier is what the whole
   * design rests on. It is stamped ONCE, the first time the player is actually there.
   */
  _trackPresence() {
    for (const o of this.active) {
      const here = this._playerAt(o);
      if (!here) continue;
      if (!o.arrived) {
        o.arrived = true;
        o.arrivedAt = this.time;
        o.arrivalTier = this._tierFor(o);
        this.bus?.emit(MEV.OBJECTIVE_PROGRESS, { objective: o, reason: 'arrived' });
      }
      if (o.kind === 'prospect' && o.progress < o.target) {
        this._advance(o, 1, 'surveyed');
      }
    }
  }

  _tierFor(o) {
    if (o.kind !== 'intercept') return ARRIVAL_TIERS[1];
    if (this.time < o.battleStartsAt) return ARRIVAL_TIERS[0];
    if (this.time <= o.battleEndsAt) return ARRIVAL_TIERS[1];
    return ARRIVAL_TIERS[2];
  }

  _advance(o, n, reason) {
    if (o.state !== 'open') return;
    o.progress = Math.min(o.target, o.progress + n);
    this.bus?.emit(MEV.OBJECTIVE_PROGRESS, { objective: o, reason, progress: o.progress });
    if (o.progress >= o.target) this._close(o, 'complete');
  }

  _bind() {
    const on = (type, fn) => this._offs.push(this.bus.on(type, fn));

    // Cutting a section advances any salvage objective at the place you are standing.
    on(EV.SALVAGE_ACQUIRED, () => {
      for (const o of this.active) {
        if (o.kind !== 'strip' && o.kind !== 'intercept') continue;
        if (!this._playerAt(o)) continue;
        this._advance(o, 1, 'section');
      }
    });

    on(EV.SHIP_DESTROYED, ({ ship, source }) => {
      if (!source?.isPlayer) return;
      for (const o of this.active) {
        if (o.kind !== 'blockade') continue;
        if (ship?.faction !== o.faction) continue;
        if (!this._playerAt(o)) continue;
        this._advance(o, 1, 'kill');
      }
    });
  }

  // =========================================================================
  // Payout
  // =========================================================================

  _close(o, outcome) {
    const i = this.active.indexOf(o);
    if (i >= 0) this.active.splice(i, 1);
    o.state = outcome;
    o.closedAt = this.time;

    if (outcome === 'complete') o.paid = this._pay(o);

    this.log.push({
      id: o.id, kind: o.kind, poiId: o.poiId, poiName: o.poiName,
      outcome, at: this.time, tier: o.arrivalTier?.id ?? null, paid: o.paid ?? null,
    });
    if (this.log.length > 32) this.log.shift();
    this.bus?.emit(MEV.OBJECTIVE_CLOSED, o);
    if (outcome === 'complete') {
      this.bus?.emit(EV.NOTIFY, {
        text: `${o.title} — ${o.poiName} · ${o.arrivalTier?.label ?? 'CLEARED'}`, important: true,
      });
    }
  }

  /**
   * Pay out. Everything here is materials, a pattern, or standing - the three things
   * this stream owns. Nothing is invented and nothing is a currency.
   */
  _pay(o) {
    const mul = o.rewardScales ? (o.arrivalTier?.multiplier ?? 1) : 1;
    const paid = {};
    for (const k in o.reward) paid[k] = Math.round(o.reward[k] * mul);

    const econ = this.world.systems.economy;
    econ?.credit(paid, `objective:${o.kind}`);

    // A field you stripped properly sometimes teaches you something, which is how an
    // objective feeds the pattern system rather than being a second currency faucet.
    if (o.patternChance && this.rng.next() < o.patternChance) {
      const patterns = this.world.systems.patterns;
      const codex = this.world.systems.codex;
      const seen = codex?.entries({ category: 'module', minState: 'seen' }) ?? [];
      const unknown = seen.filter((e) => patterns && !patterns.has(e.id));
      if (unknown.length && patterns) {
        const pick = this.rng.pick(unknown);
        if (patterns.learn(pick.id, 'objective')) paid.pattern = pick.id;
      }
    }

    if (o.reputation) {
      this.war?.adjustReputation?.(o.reputation.faction, o.reputation.delta, 'objective');
      paid.reputation = o.reputation;
    }
    return paid;
  }

  // =========================================================================
  // READ API
  // =========================================================================

  /**
   * Open objectives, each with its clock and - the important part - what showing up
   * right now would be worth versus what it would have been worth earlier.
   */
  describe() {
    return this.active.map((o) => {
      const tier = o.arrivalTier ?? this._tierFor(o);
      const mul = o.rewardScales ? tier.multiplier : 1;
      const projected = {};
      for (const k in o.reward) projected[k] = Math.round(o.reward[k] * mul);
      return {
        id: o.id,
        kind: o.kind,
        title: o.title,
        detail: o.detail,
        poiId: o.poiId,
        poiName: o.poiName,
        position: { x: o.x, z: o.z },
        progress: o.progress,
        target: o.target,
        targetText: o.targetText,
        secondsLeft: Math.max(0, Math.round(o.expiresAt - this.time)),
        // The fork, spelled out. This is what a UI should put on the map marker.
        clock: o.kind === 'intercept' ? {
          startsIn: Math.round(o.battleStartsAt - this.time),
          endsIn: Math.round(o.battleEndsAt - this.time),
          phase: this.time < o.battleStartsAt ? 'pending'
            : this.time <= o.battleEndsAt ? 'active' : 'over',
        } : null,
        arrival: {
          tier: tier.id,
          label: tier.label,
          note: tier.note,
          multiplier: mul,
          locked: !!o.arrived,
        },
        reward: o.reward,
        projectedReward: projected,
        here: this._playerAt(o),
      };
    });
  }

  /** Closed objectives, newest last. What the player left on the table. */
  history() { return this.log.slice(); }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
  }
}
