/**
 * READING A HULL'S SYSTEMS, AND KNOWING WHAT TO DO ABOUT THEM.
 *
 * THE MEASUREMENT THIS FILE EXISTS TO ANSWER:
 *
 *     grep -rn "power\.|thermal|stores\.|salvo" src/sim/ai/*.js
 *     -> zero hits across 1131 lines
 *
 * The ship AI solved one problem — bearing — and solved it well, and then simply did
 * not know that the ship it was fighting had a heat budget, a magazine, a coolant
 * reserve, a propellant reserve and a reactor that could be oversubscribed. Every one
 * of those is a clock the player is already watching. An enemy that cannot see any of
 * them is not a second clock; it is a bearing problem with hit points.
 *
 * So this file is one pure function, `readSystems`, and the profile table that decides
 * what to do with what it returns. It reads only PUBLISHED state — `ship.thermal`,
 * `ship.stores`, `ship.power` — never private fields, and it writes NOTHING, so it is
 * safe to call on the player, on a target, or on yourself.
 *
 * THE FOUR THINGS IT LOOKS FOR, and what each one means to the ship holding the gun:
 *
 *   COOKING    the target's mounts are over the thermal soft cap or tripped. Its guns
 *              are about to stop. Close, and stay closed — every second it spends over
 *              the cap is a second of its battery you get for free. This is the exact
 *              inverse of the player's own decision at `heat.js`: "should I fire all
 *              four?" now has somebody on the other side betting that you will.
 *   DRY        magazines empty or the charge buffer flat. It cannot answer. Press.
 *   STRAINED   its reactor is oversubscribed (`power.strain > 1`) or a channel is
 *              browned out. Shoot the REACTOR: capacity multiplies straight through
 *              every channel now (`power.js#factor`), so taking 30% off the reactor
 *              takes 30% off its rate of fire, its thrust AND its shield regeneration
 *              at once. That is the highest-leverage subsystem on a strained hull and
 *              the lowest-leverage one on a slack hull, which is why it is conditional.
 *   PINNED     propellant at the reserve floor (`stores.starved`) or the drive shot
 *              out. It cannot leave. Take the time to aim.
 *
 * WHAT IS DELIBERATELY NOT MODELLED: the AI does not simulate the player's decisions,
 * predict a purge, or plan more than one think-tick ahead. It reads four booleans off
 * state the game already keeps and changes what it does. That is the whole line —
 * anything past it is a planner, and a planner is a system the player cannot see.
 */

/**
 * Reused per-caller scratch. `readSystems` is called at most a few times per think
 * tick per ship at 6 Hz; returning a fresh object each call would be an allocation in
 * a loop, which this project treats as a defect. The caller owns the record.
 */
export function makeSystemsRead() {
  return {
    valid: false,
    heat: 0,           // 0..1, hottest mount
    tripped: 0,        // mounts offline for heat right now
    cooking: false,    // over the soft cap or already tripping
    coolant: 0,        // purges left, when known
    dry: false,        // no rounds and no charge worth the name
    ammoFrac: 1,       // 0..1 rounds remaining over capacity, across every class
    chargeFrac: 1,     // 0..1 energy buffer
    strained: false,   // reactor oversubscribed or a channel browned out
    strain: 0,         // demand / capacity, 0 when the hull has no routing
    brownouts: 0,
    pinned: false,     // cannot run: at the propellant floor, or no drive
    shieldFrac: 1,     // 0..1 shields up
    /** 0..1 how much of a hurry the reader should be in. Drives every consumer. */
    pressure: 0,
  };
}

/** Above this a mount is cooking rather than merely warm. Mirrors THERMAL.softCap. */
const COOKING_AT = 0.70;
/** Below this fraction of a magazine a hull is running out rather than shooting. */
const DRY_AT = 0.12;
/** Below this fraction of the charge buffer an energy fit has stopped answering. */
const FLAT_AT = 0.18;

/**
 * Read a hull's systems into `out`. Pure, allocation-free, tolerant of every hull that
 * does not have one of these systems (strike craft, hulks, a headless fixture).
 *
 * @param {Object} ship
 * @param {ReturnType<makeSystemsRead>} out
 * @returns {ReturnType<makeSystemsRead>} `out`
 */
export function readSystems(ship, out) {
  out.valid = false;
  out.heat = 0; out.tripped = 0; out.cooking = false; out.coolant = 0;
  out.dry = false; out.ammoFrac = 1; out.chargeFrac = 1;
  out.strained = false; out.strain = 0; out.brownouts = 0;
  out.pinned = false; out.shieldFrac = 1; out.pressure = 0;
  if (!ship || ship.dead) return out;
  out.valid = true;

  // --- heat ---------------------------------------------------------------
  const th = ship.thermal;
  if (th) {
    out.heat = th.peak ?? 0;
    out.tripped = th.trippedCount ?? 0;
    out.cooking = out.tripped > 0 || out.heat >= COOKING_AT;
  }

  // --- stores -------------------------------------------------------------
  const st = ship.stores;
  if (st) {
    out.coolant = st.coolant ?? 0;
    out.chargeFrac = st.chargeMax > 0 ? st.charge / st.chargeMax : 1;

    // Only classes this hull actually shoots count. A cruiser with no missile bay is
    // not "out of missiles"; counting empty classes it never had would report every
    // ship in the game as dry.
    let rounds = 0;
    let capacity = 0;
    let kinetic = false;
    let energy = false;
    for (const m of ship.weapons) {
      const cls = m.ammoClass;
      if (cls === null) { energy = true; continue; }
      kinetic = true;
      rounds += (st.ammo?.[cls] ?? 0) + (m.ready ?? 0);
      capacity += st.capacity?.[cls] ?? 0;
    }
    out.ammoFrac = capacity > 0 ? Math.min(1, rounds / capacity) : 1;
    // An all-energy fit is dry when the buffer is flat; an all-kinetic one when the
    // magazines are. A mixed fit needs BOTH to be gone before it stops answering.
    const kineticDry = kinetic ? out.ammoFrac <= DRY_AT : true;
    const energyDry = energy ? out.chargeFrac <= FLAT_AT : true;
    out.dry = (kinetic || energy) && kineticDry && energyDry;
    out.pinned = !!st.starved;
  }

  /*
   * --- power ---------------------------------------------------------------
   *
   * STRAINED MEANS OVERSUBSCRIBED, NOT MERELY UNBALANCED, and the distinction is the
   * whole value of the read. `strain > 1` is a STRUCTURAL fact about the hull: no
   * allocation feeds everything, so a shot into the reactor cannot be routed around.
   * A brownout is a CHOICE — the player decided sensors could wait — and treating it
   * as the same thing made `aimFor` return 'reactor' against any fitted cruiser at a
   * balanced routing, which collapses three decisions into one. Measured: on the
   * `working` fit at an even split, shields sit at 0.71 satisfaction, so every healthy
   * player would have read as strained.
   *
   * Brownouts still count, at a fifth of the weight, because a starved channel is a
   * real opening — it is just not the reactor's fault.
   */
  const pw = ship.power;
  if (pw && pw.unlocked) {
    out.strain = pw.strain ?? 0;
    out.brownouts = pw.brownoutCount ?? 0;
    out.strained = out.strain > 1;
  }

  // --- mobility and shields ----------------------------------------------
  if (ship.stranded || ship.disabled) out.pinned = true;
  const sh = ship.shields;
  if (sh && sh.max > 0) out.shieldFrac = Math.max(0, Math.min(1, sh.current / sh.max));

  /*
   * ONE NUMBER FOR "HOW MUCH TROUBLE IS THIS HULL IN", so a behaviour can read a
   * scalar instead of five booleans. Weighted by how long the trouble lasts: a tripped
   * mount is four and a half seconds of spin-down plus the cooling; an empty magazine
   * lasts until the ship goes home. Capped at 1 so the consumers can lerp against it.
   */
  out.pressure = Math.min(1,
    (out.cooking ? 0.34 : Math.max(0, out.heat - 0.35) * 0.5)
    + out.tripped * 0.14
    + (out.dry ? 0.30 : 0)
    + (out.strained ? 0.22 : 0)
    + out.brownouts * 0.05
    + (out.pinned ? 0.24 : 0)
    + (1 - out.shieldFrac) * 0.10);
  return out;
}

/**
 * WHICH SUBSYSTEM TO SHOOT, given what its systems say.
 *
 * Returns a subsystem KIND, or null to leave the caller's default alone. This is where
 * the read turns into a decision the player can feel and, crucially, can PREDICT: the
 * rule is short enough to be learned in one fight.
 *
 *   strained  -> reactor. Capacity multiplies every channel; a strained hull has no
 *                slack to absorb the loss and its guns, thrust and shields all sag at
 *                once. Against a slack hull the same shot buys almost nothing.
 *   cooking   -> weapon. Finish the battery while it is offline and cannot answer.
 *   dry       -> engine. It has nothing left to shoot with, so stop it leaving.
 *
 * The ordering is by leverage, not by drama, and it is deliberately NOT randomised —
 * a player who works out "they go for my reactor when I am oversubscribed" has learned
 * something true about the game, and a die roll would take that away.
 */
export function aimFor(read) {
  if (!read?.valid) return null;
  if (read.strained) return 'reactor';
  if (read.cooking) return 'weapon';
  if (read.dry) return 'engine';
  return null;
}

/**
 * THE SAME DECISION, AS A SENTENCE THE PLAYER CAN READ.
 *
 * `scope-decision.md`'s fourth test is "can the player see it?", and until this existed
 * the answer for the whole pressure model was no. The AI read four booleans off the
 * player's own systems, closed the range, held through damage it would otherwise have
 * run from, and re-aimed at the subsystem with the most leverage — and every part of
 * that was invisible. The player experienced "the fight got harder around the time my
 * battery tripped" and had no way to connect the two, which makes a good system read as
 * bad luck.
 *
 * IT IS DERIVED FROM THE SAME BRANCHES IN THE SAME ORDER AS `aimFor`, deliberately, so
 * the sentence and the shot can never disagree. A tell that says "it is shooting your
 * reactor" while the solver aims somewhere else is worse than silence — it teaches the
 * player a rule the game does not follow. `escalationHarness.mjs` asserts the pairing
 * case by case rather than trusting this comment.
 *
 * `pinned` has no `aimFor` branch — a hull that cannot run is not a leverage point, it
 * is an opportunity — so its sentence names no subsystem.
 *
 * @returns {string|null} a clause for `EV.NOTIFY`, or null when nothing is visibly wrong
 */
export function pressReason(read) {
  if (!read?.valid) return null;
  if (read.strained) return 'YOUR REACTOR IS OVERSUBSCRIBED — IT IS SHOOTING THE REACTOR';
  if (read.cooking) return 'YOUR MOUNTS ARE OVER THE CAP — IT IS SHOOTING THE BATTERY';
  if (read.dry) return 'YOUR MAGAZINES ARE FLAT — IT IS SHOOTING THE DRIVE';
  if (read.pinned) return 'YOU CANNOT RUN — IT IS CLOSING TO POINT BLANK';
  return null;
}

/**
 * POWER ROUTING FOR AN AI HULL — BIASES ON ITS OWN DEMAND, NOT ABSOLUTE SHARES.
 *
 * These are MULTIPLIERS applied to the hull's `demandRouting()` — the allocation that
 * feeds every channel in proportion to what the fit actually asks for. That choice is
 * the difference between a system and a stealth buff, and the arithmetic is worth
 * stating because it is the only thing standing between "the enemy manages power" and
 * "every enemy in the game got 50% faster for free".
 *
 * An NPC frigate carries two mounts of `powerDraw` 8 against an 80 PU reactor. Its
 * weapons demand is `6 + 2 x 8 x 0.55 = 14.8` PU while an even split hands it 20 PU, so
 * ANY absolute weapons-heavy routing — 0.40, say — would put it at 32 PU on a 14.8 PU
 * demand: satisfaction 2.16, and `power.js#factor` returns 1.52. That is a 52% rate of
 * fire increase over the shipped behaviour, applied to every hostile in the game,
 * arriving as a side effect of a file nobody would think to read for balance.
 *
 * So the routing is expressed relative to demand and CLAMPED at `AI_OVERROUTE` times
 * each channel's demand share. The worst case an AI hull can reach is therefore
 * `AI_OVERROUTE / strain` satisfaction — +15% on that frigate, and it has to give up
 * thrust and shields to get it. When its reactor is shot out, strain climbs above 1
 * and it cannot reach 1.0 on anything: the enemy is inside the same budget the player
 * is, which is the whole reason the budget exists.
 *
 * `approach` and `withdraw` buy thrust; `press` buys guns; `cool` deliberately gives
 * the weapons channel away to buy radiator margin, which is the enemy doing exactly
 * what `heat.js` asks the player to do, and is the visible tell that it is cooking.
 */
export const AI_BIAS = {
  patrol:   { shields: 1.0, weapons: 0.7, engines: 1.2, sensors: 1.2 },
  approach: { shields: 0.9, weapons: 0.7, engines: 1.6, sensors: 0.8 },
  trade:    { shields: 1.2, weapons: 1.5, engines: 0.8, sensors: 0.7 },
  press:    { shields: 0.9, weapons: 1.7, engines: 1.1, sensors: 0.7 },
  cool:     { shields: 1.5, weapons: 0.45, engines: 1.2, sensors: 0.9 },
  withdraw: { shields: 1.3, weapons: 0.25, engines: 1.8, sensors: 0.8 },
  cornered: { shields: 1.0, weapons: 1.7, engines: 0.4, sensors: 1.2 },
};

/** Hard ceiling on how far past its own demand an AI hull will feed a channel. */
export const AI_OVERROUTE = 1.15;

/** Scratch for the routing solve. Single-threaded, reused by every ship, every think. */
const _share = { shields: 0, weapons: 0, engines: 0, sensors: 0 };
const _cap = { shields: 0, weapons: 0, engines: 0, sensors: 0 };
const _keys = ['shields', 'weapons', 'engines', 'sensors'];

/**
 * Solve a routing for one hull: demand shares, biased, normalised, then clamped so no
 * channel is fed more than `AI_OVERROUTE` times what it asks for. The excess goes to
 * whatever is still under its cap, in proportion to the headroom each has left.
 *
 * Convergent by construction: demand shares sum to 1 and every cap is `AI_OVERROUTE`
 * (> 1) times its share, so the caps always have room for the whole pool.
 *
 * Writes into module scratch and returns it — do not retain the object.
 *
 * @param {import('../power.js').PowerPlant} plant
 * @param {Object} bias  one of `AI_BIAS`
 */
export function routeFor(plant, bias) {
  plant.demandRouting(_cap);                       // demand share per channel
  let total = 0;
  for (const ch of _keys) {
    _share[ch] = Math.max(0, _cap[ch] * (bias[ch] ?? 1));
    _cap[ch] *= AI_OVERROUTE;
    total += _share[ch];
  }
  if (!(total > 1e-6)) { for (const ch of _keys) _share[ch] = 0.25; return _share; }
  for (const ch of _keys) _share[ch] /= total;

  // One redistribution pass is enough: the caps sum to AI_OVERROUTE > 1, so at most one
  // round of spill is ever needed to place the whole pool.
  let spill = 0;
  let headroom = 0;
  for (const ch of _keys) {
    if (_share[ch] > _cap[ch]) { spill += _share[ch] - _cap[ch]; _share[ch] = _cap[ch]; }
    else headroom += _cap[ch] - _share[ch];
  }
  if (spill > 1e-9 && headroom > 1e-9) {
    for (const ch of _keys) {
      const room = _cap[ch] - _share[ch];
      if (room > 0) _share[ch] += spill * (room / headroom);
    }
  }
  return _share;
}

/**
 * Which bias a state wants, given the hull's own read.
 *
 * One override on top of the table and it is the important one: a hull whose OWN
 * mounts are cooking routes to `cool` whatever else it is doing. That is what makes
 * the enemy a clock rather than a stream — its rate of fire visibly sags in the middle
 * of a long engagement, and it sags because of a decision the player can also make.
 */
export function biasFor(state, selfRead) {
  if (selfRead?.cooking) return AI_BIAS.cool;
  return AI_BIAS[state] ?? AI_BIAS.trade;
}
