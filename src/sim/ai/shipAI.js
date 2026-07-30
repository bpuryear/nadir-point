/**
 * PER-SHIP COMBAT BEHAVIOUR.
 *
 * The one thing this AI must do, above everything else: FIGHT THE ARC SYSTEM.
 *
 * Every weapon on every hull in this game is bolted to a place on that hull and can
 * only fire through the wedge that place can see (`WeaponMount.canBear`). A frigate
 * whose guns are on its flanks and which drives at you nose-first is an AI that has
 * not read its own ship. So the core of every decision in here is one question asked
 * of the combat system - `bearingReport(ship, target)`, "how many mounts bear, and if
 * none, how far off is the closest one" - and one answer: turn until they do.
 *
 * That produces the behaviour the game is about without scripting any of it:
 *
 *   - a frigate slews broadside-on and slides sideways down the engagement, because
 *     that is the only heading that lets it shoot;
 *   - it SLOWS DOWN to turn, because `PlaneBody.effectiveTurnRate` degrades with
 *     speed and the AI can see that it is not going to get on bearing at flank;
 *   - a corvette, whose one arc is on its bow, points at you and orbits instead;
 *   - a destroyer commits, because its bow lance gives it something to do on the way
 *     in and its heavy broadsides pay for arriving.
 *
 * And the disengage rule is what makes subsystem targeting matter. A ship losing
 * badly runs. A ship whose engines have been shot out CANNOT run, and knows it, and
 * keeps firing whatever still bears. "Kill the engines first" is not a tip printed on
 * a loading screen; it is the difference between a fight that ends and a fight that
 * leaves you a hull to take apart.
 *
 * SECOND: IT NOW FIGHTS THE OTHER FOUR SYSTEMS TOO.
 *
 * A grep for `power\.|thermal|stores\.|salvo` across this directory used to return
 * ZERO hits over 1131 lines. Everything above was true and none of it touched heat,
 * stores or power — so the player could cook their battery, empty their magazines and
 * oversubscribe their reactor with nobody on the other side of the table noticing. The
 * enemy was a bearing problem. It is now a bearing problem AND a clock:
 *
 *   - it reads the target's heat, stores and reactor strain every think tick
 *     (`pressure.js#readSystems`) and PRESSES a hull in trouble: closes the range,
 *     holds instead of breaking off, and shoots the subsystem with the most leverage
 *     on the specific trouble it can see;
 *   - it reads its OWN, and a ship that has cooked its mounts routes power away from
 *     weapons to buy radiator margin, exactly as `heat.js` asks the player to;
 *   - a ship that has shot itself dry goes home, which is what makes "outlast them" an
 *     available tactic rather than a line in `stores.js`'s header;
 *   - and it routes its reactor, inside the same demand budget the player has, so
 *     shooting an enemy reactor now slows its guns, its thrust and its shields at once.
 *
 * THIRD: IT SAYS SO.
 *
 * All of that changed four behaviours off state only the simulation could see, which
 * fails `scope-decision.md`'s fourth test — "hidden state that changes outcomes is a
 * bug, not depth" — for the whole model. A hull that commits to pressing the PLAYER now
 * names the tell it is pressing, once, through the same notification column that
 * carries `_withdraw`'s "is breaking off". See `_tell`, and `pressure.js#pressReason`
 * for why the sentence is derived from the same branches as the shot.
 *
 * NOTHING IN HERE ALLOCATES. Per-ship state is created once on adoption; the solver
 * uses module-level scratch buffers; positions come from `core/world.js#scratch`; the
 * systems reads are two records per ship, made on adoption and mutated in place.
 */

import * as THREE from 'three';
import { scratch } from '../../core/world.js';
import { angleDelta, yawOf } from '../physics.js';
import { EV } from '../../core/events.js';
import { makeSystemsRead, readSystems, aimFor, biasFor, routeFor, pressReason } from './pressure.js';

const TAU = Math.PI * 2;

/** Fold an angle into (-PI, PI]. */
function wrap(a) {
  let d = a % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Steering the AI writes into, standing in for `MoveController` on an AI hull.
 *
 * `Ship.fixedUpdate` calls `this.move.update(dt)` and `MoveController` zeroes the
 * throttle every step when it has no order, which would erase anything the AI wrote.
 * Rather than fight that, an adopted ship gets this instead: same three methods, but
 * it publishes the AI's intent rather than chasing a waypoint. Releasing a ship puts
 * the original controller back.
 */
export class AIHelm {
  constructor(body) {
    this.body = body;
    this.throttle = 0;
    this.heading = body.heading ?? 0;
    /** Fallback path so an `orderMove` issued by anything else still works. */
    this.active = false;
    this.target = new THREE.Vector3();
    this.arrivalRadius = 0;
  }

  order(point, arrivalRadius = 0) {
    this.target.copy(point);
    this.target.y = 0;
    this.active = true;
    this.arrivalRadius = arrivalRadius;
  }

  cancel() {
    this.active = false;
    this.throttle = 0;
  }

  update() {
    this.body.throttle = this.throttle;
    this.body.desiredHeading = this.heading;
  }
}

/**
 * Role profiles. These are the whole personality of each hull class, and they are
 * short on purpose - three numbers that differ is a role, thirty numbers that differ
 * is a tuning problem nobody can hold in their head.
 *
 *   rangeK      preferred engagement range as a fraction of the ship's own reach
 *   station     throttle held while trading, once on station
 *   orbitRate   how fast it walks around the target, rad/s of bearing
 *   breakPoint  hull fraction below which it tries to leave
 *   aim         which subsystem kind it shoots at by preference
 */
const PROFILE = {
  corvette: { rangeK: 0.52, station: 0.92, orbitRate: 0.11, breakPoint: 0.32, aim: 'engine', reacquire: 6.5 },
  frigate: { rangeK: 0.84, station: 0.26, orbitRate: 0.030, breakPoint: 0.34, aim: 'weapon', reacquire: 10 },
  destroyer: { rangeK: 0.55, station: 0.40, orbitRate: 0.022, breakPoint: 0.16, aim: 'weapon', reacquire: 13 },
  cruiser: { rangeK: 0.70, station: 0.30, orbitRate: 0.018, breakPoint: 0.20, aim: 'weapon', reacquire: 14 },
  station: { rangeK: 1.0, station: 0.0, orbitRate: 0, breakPoint: 0.0, aim: 'weapon', reacquire: 9 },
  default: { rangeK: 0.72, station: 0.34, orbitRate: 0.04, breakPoint: 0.30, aim: 'weapon', reacquire: 9 },
};

/**
 * PRESSURE CONSTANTS. Four numbers, stated here rather than buried as literals so the
 * behaviour can be tuned without reading the whole state machine.
 */
export const PRESS = {
  /** `readSystems().pressure` at or above which the target is worth closing on. */
  at: 0.34,
  /** Preferred range is multiplied by this while pressing. Their guns are down. */
  rangeK: 0.55,
  /** Break point is multiplied by this while pressing. They smell it. */
  breakK: 0.55,
  /** Break point is multiplied by this when THIS ship has shot itself dry. */
  spentBreakK: 1.7,
  /** Seconds before one hull will say out loud what it is pressing again. */
  tellCooldown: 22,
};

// Solver scratch. Single-threaded; reused by every ship, every tick.
const _cand = new Float64Array(24);
/** Scratch systems read for target SELECTION, which scores several hulls per tick. */
const _pick = makeSystemsRead();

/**
 * The heading that brings the most guns onto a bearing.
 *
 * For every mount, the heading that centres THAT mount on the target is
 * `bearing - yawCentre` (because `canBear` tests `shipHeading + yawCentre` against the
 * bearing). Score each of those candidate headings by how many other mounts would also
 * bear there, and take the winner, breaking ties by the smallest turn from where we
 * are now. On a frigate that resolves to "show it your port side"; on a corvette it
 * resolves to "point at it"; and it does so without either case being written down.
 *
 * @returns {number} heading in radians, or NaN when the ship has no commandable mount
 */
export function bestArcHeading(ship, bearing) {
  let n = 0;
  for (const m of ship.weapons) {
    if (!m.online) continue;
    const t = m.def.type;
    if (t === 'pd' || t === 'flak') continue;
    if (n >= _cand.length) break;
    _cand[n++] = wrap(bearing - m.yawCentre);
  }
  if (n === 0) return NaN;

  let best = NaN;
  let bestScore = -1;
  let bestTurn = Infinity;
  for (let i = 0; i < n; i++) {
    const h = _cand[i];
    let score = 0;
    for (const m of ship.weapons) {
      if (!m.online) continue;
      const t = m.def.type;
      if (t === 'pd' || t === 'flak') continue;
      if (Math.abs(angleDelta(h + m.yawCentre, bearing)) <= m.yawWidth * 0.5 - 0.03) score++;
    }
    const turn = Math.abs(angleDelta(ship.heading, h));
    if (score > bestScore || (score === bestScore && turn < bestTurn)) {
      bestScore = score;
      bestTurn = turn;
      best = h;
    }
  }
  return best;
}

/** Longest reach of any commandable mount. PD is not a reason to approach anything. */
export function effectiveRange(ship) {
  let r = 0;
  for (const m of ship.weapons) {
    if (!m.online) continue;
    const t = m.def.type;
    if (t === 'pd' || t === 'flak') continue;
    if (m.def.range > r) r = m.def.range;
  }
  return r;
}

/** Per-ship controller. One of these lives on `ship.ai`. */
export class ShipAI {
  constructor(ship, { rng, fleet = null, role = null } = {}) {
    this.ship = ship;
    this.rng = rng;
    this.fleet = fleet;
    this.role = role ?? ship.classDef?.role ?? 'frigate';
    this.profile = PROFILE[this.role] ?? PROFILE.default;

    this.state = 'patrol';
    this.stateTime = 0;
    this.target = null;
    this.aimId = null;

    /** Which way round the target it walks. Flipped occasionally so fights move. */
    this.orbitSign = rng.bool() ? 1 : -1;
    this.orbitFlipIn = rng.range(14, 32);

    /** Decision cadence, staggered so a fleet does not think in lockstep. */
    this.thinkPeriod = 1 / 6;
    this.thinkIn = rng.range(0, this.thinkPeriod);
    this.reacquireIn = rng.range(0, this.profile.reacquire);

    /** Where it holds station when it has nothing to fight. */
    this.anchor = new THREE.Vector3().copy(ship.position);
    this.anchorRadius = 2600;

    this.helm = new AIHelm(ship.body);
    this._originalMove = ship.move;
    ship.move = this.helm;

    /** Diagnostics the probe and the UI read. */
    this.bearingCount = 0;
    this.bearingError = 0;

    /**
     * What its target's systems are doing, and what its own are. Made once, mutated in
     * place by `pressure.js#readSystems` every think tick. Both are readable from
     * outside — `tools/systems.mjs` asserts against them and the UI could show the
     * enemy's tell without any new plumbing.
     */
    this.read = makeSystemsRead();
    this.selfRead = makeSystemsRead();
    /** True while the target is in enough trouble to be worth closing on. */
    this.pressing = false;
    /** Last routing bias applied, for the diagnostic. */
    this.routing = 'patrol';
    /**
     * The sentence this hull would say about why it is pressing, or null. Published so
     * a UI stream can render the enemy's read against the contact without any new
     * plumbing, and so a tool can assert that the tell and the shot agree.
     */
    this.tell = null;
    this._toldWhat = null;
    this._toldAt = -1e9;
  }

  release() {
    if (this.ship.move === this.helm) this.ship.move = this._originalMove;
    this.ship.ai = null;
  }

  get hullFraction() {
    return this.ship.maxHullHP > 0 ? this.ship.hullHP / this.ship.maxHullHP : 0;
  }

  /** Can it leave? A ship with no drive has exactly one option and it is not running. */
  get canManoeuvre() {
    return !this.ship.disabled && !this.ship.stranded;
  }
}

/**
 * The system. Order 24: inside the AI band, after fleet-level decisions at 22 and well
 * before combat resolves at 40.
 */
export class ShipAISystem {
  constructor(world, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('ship-ai');
    this.name = 'ship-ai';
    this.order = 24;

    /** @type {import('../ship.js').Ship[]} */
    this.controlled = [];
    this._nextId = 0;
    this.autoAdopt = opts.autoAdopt !== false;
    /**
     * GIVE AI HULLS THE POWER WIDGET.
     *
     * `refit.js:375` sets `power.unlocked` for the PLAYER only, off `powerBonus > 0`,
     * so every hostile in the game ran its reactor at a fixed even split and every
     * `power.unlocked ? factor : 1` guard in `combat.js`, `ship.js` and `vfx/` took the
     * constant branch. That is why shooting an enemy reactor out did nothing you could
     * see: `setHealthFactor` moved a capacity nobody was reading.
     *
     * Unlocking it is what makes the enemy subject to the same budget — `power.js`
     * bills their fit too, `strain` climbs when their reactor is hurt, and a strained
     * hull cannot reach 1.0 on anything. The rate-of-fire side is bounded by
     * `pressure.js#AI_OVERROUTE`; see that file for the arithmetic that keeps this from
     * being a blanket buff.
     *
     * Opt-out rather than opt-in so it cannot be forgotten, but nameable, because a
     * harness that wants the old fixed-split hostile can ask for one.
     */
    this.routePower = opts.routePower !== false;

    this._offSpawn = this.bus.on(EV.SHIP_SPAWNED, (ship) => {
      if (!this.autoAdopt) return;
      this.adopt(ship);
    });
    this._offDead = this.bus.on(EV.SHIP_DESTROYED, ({ ship }) => this.release(ship));

    // Adopt anything already in the world when we install late.
    for (const ship of world.ships) this.adopt(ship);
  }

  /** Take a hull under AI control. Ignores the player, strike craft and hulks. */
  adopt(ship, opts = {}) {
    if (!ship || ship.isPlayer || ship.ai) return null;
    if (ship.squad) return null;                    // strike craft fly themselves
    if (!ship.planeLocked) return null;
    const role = opts.role ?? ship.classDef?.role;
    if (role === 'hulk' || role === 'fighter') return null;

    ship.ai = new ShipAI(ship, {
      rng: this.rng.fork(`${ship.id}:${this._nextId++}`),
      fleet: opts.fleet ?? null,
      role,
    });
    // The player's plant is unlocked by `refit.js` off a reactor module. An AI hull has
    // no refit screen, so this is where its reactor comes online. Never touches a
    // player hull: `adopt` returns above on `ship.isPlayer`.
    if (this.routePower && ship.power) ship.power.unlocked = true;
    if (opts.anchor) ship.ai.anchor.copy(opts.anchor);
    this.controlled.push(ship);
    return ship.ai;
  }

  release(ship) {
    const i = this.controlled.indexOf(ship);
    if (i >= 0) this.controlled.splice(i, 1);
    ship?.ai?.release?.();
  }

  dispose() {
    this._offSpawn?.();
    this._offDead?.();
    for (const s of this.controlled.slice()) this.release(s);
  }

  fixedUpdate(dt) {
    const world = this.world;
    const combat = world.systems.combat ?? null;

    for (let i = this.controlled.length - 1; i >= 0; i--) {
      const ship = this.controlled[i];
      if (!ship || ship.dead) { this.controlled.splice(i, 1); ship?.ai?.release?.(); continue; }
      const ai = ship.ai;
      if (!ai) { this.controlled.splice(i, 1); continue; }

      ai.stateTime += dt;
      ai.thinkIn -= dt;
      ai.reacquireIn -= dt;
      ai.orbitFlipIn -= dt;
      if (ai.thinkIn > 0) continue;
      ai.thinkIn += ai.thinkPeriod;

      this._think(ship, ai, combat);
    }
  }

  // -------------------------------------------------------------------------

  _think(ship, ai, combat) {
    const world = this.world;

    if (ai.orbitFlipIn <= 0) {
      ai.orbitFlipIn = ai.rng.range(16, 38);
      ai.orbitSign = -ai.orbitSign;
    }

    // --- who ---------------------------------------------------------------
    if (!ai.target || ai.target.dead || ai.reacquireIn <= 0) {
      ai.reacquireIn = ai.profile.reacquire * ai.rng.range(0.8, 1.25);
      ai.target = this._selectTarget(ship, ai);
    }
    const target = ai.target;
    ship.target = target && !target.dead ? target : null;

    // --- what its systems and the target's are doing -------------------------
    // Read BOTH before any branch below, so every decision in this method sees the
    // same snapshot. Allocation-free: both records were made on adoption.
    readSystems(ship, ai.selfRead);
    readSystems(ship.target, ai.read);
    ai.pressing = ai.read.valid && ai.read.pressure >= PRESS.at;
    this._tell(ship, ai);

    if (!ship.target) {
      ship.targetSubsystem = null;
      this._patrol(ship, ai);
      this._route(ship, ai, 'patrol');
      return;
    }

    // --- geometry ----------------------------------------------------------
    const dx = target.position.x - ship.position.x;
    const dz = target.position.z - ship.position.z;
    const dist = Math.hypot(dx, dz);
    const bearing = yawOf(dx, dz);

    const reach = effectiveRange(ship);
    // A hull whose battery is cooking, whose magazines are empty or whose reactor is
    // oversubscribed cannot punish you for being close. So get close. This one line is
    // the difference between an enemy that trades at its own comfortable range whatever
    // happens and an enemy that notices.
    const preferred = Math.max(600, reach * ai.profile.rangeK * (ai.pressing ? PRESS.rangeK : 1));

    // The one question. Everything below is the answer to it.
    const report = combat
      ? combat.bearingReport(ship, target)
      : { bearing: 0, total: ship.weapons.length, minError: Math.abs(angleDelta(ship.heading, bearing)) };
    ai.bearingCount = report.bearing;
    ai.bearingError = Number.isFinite(report.minError) ? report.minError : 0;

    // --- what --------------------------------------------------------------
    /*
     * THE BREAK POINT IS NO LONGER A CONSTANT, AND BOTH TERMS ARE SYSTEMS READS.
     *
     * It moves DOWN when the target is in trouble — a ship that can see your battery
     * offline holds on through damage it would otherwise run from, so cooking your
     * mounts to force a kill has a price and the price is that they stay.
     *
     * It moves UP when THIS ship has shot itself dry. A hull with nothing left to
     * shoot with is not in the fight whatever its hull bar says, and going home is the
     * correct move. That is what makes "outlast them" a tactic: `stores.js`'s header
     * has claimed since it was written that "a long fight genuinely dries an enemy up
     * and 'outlast them' is an available tactic rather than a fiction", and until this
     * line nothing in the AI read `stores` at all, so it was a fiction.
     */
    const breakPoint = ai.profile.breakPoint
      * (ai.pressing ? PRESS.breakK : 1)
      * (ai.selfRead.dry ? PRESS.spentBreakK : 1);
    // A fleet withdraws as a fleet. Five separate panics is not a retreat.
    const losing = ai.hullFraction < breakPoint || ai.fleet?.stance === 'withdraw';
    const toothless = reach <= 0;
    // Dry AND unable to make the target pay for it: leave, whatever the hull says.
    const spent = ai.selfRead.dry && !ai.pressing;

    if (losing || toothless || spent) {
      if (ai.canManoeuvre) {
        this._withdraw(ship, ai, bearing);
        ship.targetSubsystem = null;
        this._route(ship, ai, 'withdraw');
        return;
      }
      // Cornered: it cannot leave. It fights with whatever still bears, and this is
      // exactly the state the player creates by shooting the drive off first.
      ai.state = 'cornered';
      ai.helm.throttle = 0;
      const h = bestArcHeading(ship, bearing);
      ai.helm.heading = Number.isFinite(h) ? h : bearing;
      ship.targetSubsystem = this._pickSubsystem(ship, ai, target, dist, reach);
      this._route(ship, ai, 'cornered');
      return;
    }

    if (!ai.canManoeuvre) {
      ai.state = 'cornered';
      ai.helm.throttle = 0;
      const h = bestArcHeading(ship, bearing);
      ai.helm.heading = Number.isFinite(h) ? h : bearing;
      ship.targetSubsystem = this._pickSubsystem(ship, ai, target, dist, reach);
      this._route(ship, ai, 'cornered');
      return;
    }

    ship.targetSubsystem = this._pickSubsystem(ship, ai, target, dist, reach);

    if (dist > reach * 1.02) this._approach(ship, ai, target, bearing, dist, preferred);
    else if (ai.role === 'corvette') this._harass(ship, ai, target, bearing, dist, preferred, report);
    else this._trade(ship, ai, target, bearing, dist, preferred, report);

    // `press` is not a separate steering state — it is `broadside`/`flank` run against a
    // closed-up preferred range, so the arc solver still owns the heading and a pressing
    // frigate still has to show its flank. Naming it separately would duplicate the
    // steering; naming it at all is what lets the UI and the tool see the decision.
    if (ai.pressing) ai.state = 'press';
    this._route(ship, ai, ai.pressing ? 'press' : (ai.state === 'approach' ? 'approach' : 'trade'));
  }

  /**
   * SAY IT OUT LOUD.
   *
   * The pressure model changed four behaviours — range, break point, target choice and
   * subsystem choice — off state only the simulation could see. From the cockpit that
   * reads as the fight arbitrarily getting harder, which fails `scope-decision.md`'s
   * fourth test ("hidden state that changes outcomes is a bug, not depth") for the
   * whole system. So when a hull commits to pressing the PLAYER it names the tell it is
   * pressing, once, through the same `EV.NOTIFY` column that already carries
   * `_withdraw`'s "is breaking off" — the symmetric message, and the one that turns
   * "why am I losing" into a sentence.
   *
   * Only ever about the player's own hull: a frigate pressing another frigate across
   * the field is not the player's business and would bury the column. Bounded by
   * `PRESS.tellCooldown` per hull and by the tell not having changed, so a player
   * oscillating around the thermal cap gets one line, not forty.
   */
  _tell(ship, ai) {
    const reason = ai.pressing && ship.target?.isPlayer ? pressReason(ai.read) : null;
    ai.tell = reason;
    if (!reason) { if (!ai.pressing) ai._toldWhat = null; return; }
    if (ai._toldWhat === reason && ai.stateTime - ai._toldAt < PRESS.tellCooldown) return;
    ai._toldWhat = reason;
    ai._toldAt = ai.stateTime;
    this.bus.emit(EV.NOTIFY, {
      text: `${(ship.classDef?.name ?? 'CONTACT').toUpperCase()} IS PRESSING — ${reason}`,
      ship, important: true, faction: ship.faction,
    });
  }

  /**
   * ROUTE THE REACTOR.
   *
   * The AI's half of the power widget. `pressure.js#routeFor` solves a bias against the
   * hull's own published demand and clamps it at `AI_OVERROUTE`, so an AI hull can
   * never feed a channel much past what that channel asks for — see the block in that
   * file for the arithmetic and for why an absolute share table would have handed every
   * hostile in the game a 52% rate-of-fire increase as a side effect.
   *
   * `setAll` renormalises and emits `EV.POWER_ROUTED`, and the plant spools toward it at
   * `spoolRate` like anybody else's, so an AI that changes its mind mid-fight pays the
   * same three seconds the player does. Skipped entirely when the hull has no routing
   * (`unlocked` false), which is every hull until `ShipAISystem.routePower` says
   * otherwise — see `adopt()`.
   */
  _route(ship, ai, state) {
    const plant = ship.power;
    if (!plant?.unlocked) return;
    // Resolve the cooling override FIRST, then compare, so a hull that is cooking does
    // not re-solve and re-emit `EV.POWER_ROUTED` six times a second for the whole time
    // it is over the cap. `mounts` is in the key because losing a mount changes the
    // demand shares this was solved against.
    const want = ai.selfRead.cooking ? 'cool' : state;
    const mounts = ship.weapons.length;
    if (ai.routing === want && ai._routedMounts === mounts) return;
    ai.routing = want;
    ai._routedMounts = mounts;
    plant.setAll(routeFor(plant, biasFor(want, null)));
  }

  // --- states ---------------------------------------------------------------

  /**
   * No target: hold the fleet's station. Ships parked on a marker with the throttle
   * nulled look abandoned, so it drifts in slowly rather than stopping dead.
   */
  _patrol(ship, ai) {
    ai.state = 'patrol';
    const anchor = ai.fleet?.slotFor(ship) ?? ai.anchor;
    const dx = anchor.x - ship.position.x;
    const dz = anchor.z - ship.position.z;
    const d = Math.hypot(dx, dz);
    if (d < ai.anchorRadius) {
      ai.helm.throttle = 0;
      return;
    }
    ai.helm.heading = yawOf(dx, dz);
    const misalign = Math.abs(angleDelta(ship.heading, ai.helm.heading));
    const alignment = Math.max(0, Math.cos(misalign));
    ai.helm.throttle = 0.28 + 0.5 * alignment * alignment;
  }

  /**
   * Out of reach. Close, but not stupidly: a capital that pours on thrust through a
   * 140 degree turn slews sideways, and turn rate degrades with speed, so a badly
   * aligned ship accelerates itself out of its own turn.
   */
  _approach(ship, ai, target, bearing, dist, preferred) {
    ai.state = 'approach';
    // Arrive already angled. Driving at the exact centre means arriving nose-on and
    // spending the first ten seconds of the fight unable to shoot.
    const lead = ai.role === 'frigate' ? 0.42 : ai.role === 'destroyer' ? 0.24 : 0.10;
    ai.helm.heading = wrap(bearing + ai.orbitSign * lead);
    const misalign = Math.abs(angleDelta(ship.heading, ai.helm.heading));
    const alignment = Math.max(0, Math.cos(misalign));
    ai.helm.throttle = 0.30 + 0.70 * alignment * alignment;
  }

  /**
   * Broadside trade. Frigates and destroyers.
   *
   * Heading comes from the arc solver, then gets a range-correction bias: rotating the
   * held heading a little toward the target closes, a little away opens, and both stay
   * inside the arc because the bias is clamped well under a battery's half-width.
   *
   * The throttle is the interesting half. If nothing bears and the nearest mount is
   * badly off, it BACKS OFF THE THROTTLE - because `effectiveTurnRate` falls with
   * speed, slowing down is the fastest way to get on bearing. That single line is the
   * AI demonstrating the ship's own physics back at the player.
   */
  _trade(ship, ai, target, bearing, dist, preferred, report) {
    ai.state = 'broadside';
    let h = bestArcHeading(ship, bearing);
    if (!Number.isFinite(h)) h = bearing;

    const rel = angleDelta(h, bearing);
    const err = (dist - preferred) / preferred;          // >0 too far, <0 too close
    const closeBias = THREE.MathUtils.clamp(err, -1, 1) * 0.42;
    // sign(rel) rotates the heading toward the target's side of the nose.
    const sign = rel >= 0 ? 1 : -1;
    h = wrap(h + sign * closeBias);

    // Walk around the target so a broadside duel is not two ships in a car park.
    h = wrap(h + ai.orbitSign * ai.profile.orbitRate * 4.0);

    ai.helm.heading = h;

    const onBearing = report.bearing > 0;
    const turning = !onBearing && ai.bearingError > 0.12;
    let throttle = ai.profile.station + Math.min(0.55, Math.abs(err) * 0.8);
    if (turning) throttle = Math.min(throttle, 0.10);     // slow down to come about
    if (dist < preferred * 0.45) throttle = Math.max(throttle, 0.45); // do not get rammed
    ai.helm.throttle = THREE.MathUtils.clamp(throttle, 0, 1);
  }

  /**
   * Harass. Corvettes have one bow arc, so they cannot trade; what they can do is stay
   * off the beam of something that has to turn a kilometre of hull to answer, and shoot
   * its engines while it tries.
   */
  _harass(ship, ai, target, bearing, dist, preferred, report) {
    ai.state = 'flank';

    // Aim at a point on the flank circle, walked around fast.
    const centre = Math.atan2(ship.position.x - target.position.x, ship.position.z - target.position.z);
    const walk = centre + ai.orbitSign * 0.55;
    scratch.v1.set(
      target.position.x + Math.sin(walk) * preferred,
      0,
      target.position.z + Math.cos(walk) * preferred,
    );
    const mx = scratch.v1.x - ship.position.x;
    const mz = scratch.v1.z - ship.position.z;
    const moveHeading = yawOf(mx, mz);

    // A bow gun still has to point. Inside reach, the arc solver wins; outside it, the
    // flank position does.
    const arcH = bestArcHeading(ship, bearing);
    const wantArc = dist < preferred * 1.35 && Number.isFinite(arcH);
    // Blend through the SHORTEST ARC, never by averaging the two numbers - a weighted
    // mean of +3.0 and -3.0 radians is 0.9, which points at nothing.
    ai.helm.heading = wantArc
      ? wrap(moveHeading + angleDelta(moveHeading, arcH) * 0.65)
      : moveHeading;

    const err = (dist - preferred) / preferred;
    ai.helm.throttle = THREE.MathUtils.clamp(
      ai.profile.station * (report.bearing > 0 ? 0.8 : 1) + Math.min(0.3, Math.abs(err) * 0.5), 0.25, 1,
    );
  }

  /**
   * Leave. Away from the threat, flat out. Withdrawal is what makes an engagement have
   * an end state other than a wreck, and what makes shooting the drives off a decision
   * rather than a flourish.
   */
  _withdraw(ship, ai, bearing) {
    if (ai.state !== 'withdraw') {
      ai.state = 'withdraw';
      this.bus.emit(EV.NOTIFY, {
        text: `${ship.classDef.name} is breaking off`,
        ship, important: false, faction: ship.faction,
      });
    }
    ai.helm.heading = wrap(bearing + Math.PI);
    const misalign = Math.abs(angleDelta(ship.heading, ai.helm.heading));
    const alignment = Math.max(0, Math.cos(misalign));
    // Run, but do not try to run and turn at the same time - that just carves a wide
    // arc back across the enemy's guns.
    ai.helm.throttle = 0.35 + 0.65 * alignment * alignment;
    ship.target = null;
  }

  // --- helpers --------------------------------------------------------------

  /**
   * Target selection. Closest is wrong, biggest is wrong; what a warship shoots at is
   * the thing that is both dangerous and reachable, with a bias toward whatever the
   * fleet has already committed to so a squadron concentrates instead of scattering.
   */
  _selectTarget(ship, ai) {
    const world = this.world;
    const focus = ai.fleet?.focus;
    if (focus && !focus.dead && world.areHostile(ship.faction, focus.faction)) {
      const d = focus.position.distanceTo(ship.position);
      if (d < effectiveRange(ship) * 2.6) return focus;
    }

    let best = null;
    let bestScore = -Infinity;
    const reach = Math.max(1200, effectiveRange(ship));
    // Acquisition reach has a floor: an engagement is 12-17 km across at spawn and a
    // corvette whose guns only reach 3.7 km would otherwise decide there was nobody
    // here and go and stand on its formation slot.
    const acquire = Math.max(26000, reach * 4.5);
    for (const other of world.ships) {
      if (other === ship || other.dead) continue;
      if (!world.areHostile(ship.faction, other.faction)) continue;
      const d = other.position.distanceTo(ship.position);
      if (d > acquire) continue;
      const hpFrac = other.maxHullHP > 0 ? other.hullHP / other.maxHullHP : 1;
      /*
       * THREAT IS NOT A MOUNT COUNT. A four-gun battery that is tripped offline for
       * heat, or dry, or hanging off a browned-out reactor is not four guns pointed at
       * you this second. `readSystems` is the same read the pressing behaviour uses,
       * so target selection and engagement agree about who is in trouble instead of
       * one of them chasing a hull the other has written off.
       */
      readSystems(other, _pick);
      const threat = other.weapons.length * (other.defanged ? 0.15 : 1)
        * (1 - _pick.pressure * 0.5);
      // Cripples are finished, healthy threats are engaged, distance is a tax, and a
      // hull whose systems are failing is the cheapest kill on the board.
      const score = (threat * 1.6 + (1 - hpFrac) * 2.4 + (other.stranded ? 1.2 : 0)
        + _pick.pressure * 2.2)
        - (d / reach) * 1.8;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    return best;
  }

  /**
   * What to shoot at on it.
   *
   * Aimed shots only inside the band where `subsystemAccuracy` is worth having - at
   * long range against a moving hull the aimed shot mostly hits plating and the AI is
   * better off not pretending otherwise. A nearly-dead target gets the reactor,
   * because the AI is trying to kill it, not to salvage it.
   */
  _pickSubsystem(ship, ai, target, dist, reach) {
    if (dist > reach * 0.62) return null;
    if (target.subsystems.size === 0) return null;

    const hpFrac = target.maxHullHP > 0 ? target.hullHP / target.maxHullHP : 1;
    let want = ai.profile.aim;
    if (hpFrac < 0.28) want = 'reactor';
    else if (this._isOpening(ship, target)) want = 'engine';
    /*
     * AND THEN THE SYSTEMS READ OVERRIDES BOTH, because it is better information.
     *
     * `pressure.js#aimFor` maps trouble to leverage: a STRAINED reactor gets shot,
     * because `power.js#factor` is supply over demand and capacity multiplies through
     * every channel — taking a third off an oversubscribed reactor takes a third off
     * the target's rate of fire, thrust and shield regeneration simultaneously, while
     * the same shot into a slack reactor buys almost nothing. A COOKING battery gets
     * shot, to finish it while it is offline. A DRY hull gets its engines shot, so it
     * cannot leave and re-arm.
     *
     * It does not override the two rules above it by accident: `hpFrac < 0.28` already
     * says reactor, and `aimFor` only ever returns something when it has seen a
     * specific, published failure. When it has seen nothing it returns null and the
     * profile keeps its default.
     */
    const smart = aimFor(ai.read);
    if (smart) want = smart;

    let chosen = null;
    for (const sub of target.subsystems.values()) {
      if (sub.destroyed) continue;
      if (sub.def.kind !== want) continue;
      if (!chosen || sub.hp < chosen.hp) chosen = sub;
    }
    if (!chosen) {
      for (const sub of target.subsystems.values()) {
        if (sub.destroyed) continue;
        if (!chosen || sub.hp < chosen.hp) chosen = sub;
      }
    }
    return chosen?.def.id ?? null;
  }

  /** Is the target running? Radial velocity away from us. */
  _isOpening(ship, target) {
    const dx = target.position.x - ship.position.x;
    const dz = target.position.z - ship.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return (target.velocity.x * dx + target.velocity.z * dz) / d > 12;
  }
}
