import * as THREE from 'three';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { angleDelta, yawOf, interceptPoint, RECOIL } from './physics.js';
import { fireRateMul, misfeedChance, MISFEED_STALL } from './condition.js';

/**
 * THE SALVO CONTROLLER — the ripple broadside.
 *
 * The player commits once and the battery walks fore-to-aft down the engaged flank,
 * one barrel at a time, over roughly a third of a second to a second and a quarter.
 *
 * ===========================================================================
 * WHY THIS IS WORTH BUILDING, AND THE RULE THAT FOLLOWS FROM IT
 * ===========================================================================
 *
 * The shape of the wave is a live readout of state this game already simulates and has
 * never shown during a fight. Every irregularity in it is a fact, not a flourish:
 *
 *   a HOLE in the wave          the barrels on that mount are destroyed
 *                               (`subparts.js` output part -> `parts.inert`)
 *   a LATE BEAT                 that mount's feed is dead and it is loading by hand
 *                               (`PART_EFFECT.feedFireRate` 0.35 -> steps grow 1.69x)
 *   a gun firing into EMPTY SPACE  its traverse ring is destroyed and it is stuck
 *                               where it stood (`parts.traverseFrozen`, `frozenAt`)
 *   a wave that STOPS EARLY     that mount cooked, jammed, or ran its feed dry
 *   the whole wave COMPRESSING  power is routed to weapons; stretching, away from it
 *
 * THEREFORE: THERE IS NO RANDOM JITTER IN THIS FILE. The spec asked for +/-18 ms of it.
 * Random jitter would put noise on exactly the channel the information travels down,
 * and the player would learn — correctly — that the raggedness means nothing. The only
 * RNG draw here is the misfeed roll, which is the identical roll `combat.js:169` makes
 * on the AUTO path, and it is a fact about the mount's condition.
 *
 * The same rule is why a slot that CANNOT FIRE IS NEVER REMOVED FROM THE WAVE. It
 * occupies `deadPause` or `frozenPause` and stays in the sequence. Removing dead slots
 * would "clean up" the rhythm and destroy the mechanic, so `tools/ripple.mjs` asserts
 * the slot count is unchanged when a barrel dies. That assertion exists to stop a
 * future refactor from optimising the feature away.
 *
 * ===========================================================================
 * WHAT IT DOES NOT DO
 * ===========================================================================
 *
 * NO NEW SHIP STATE. `fireMode`, `charge`, `charging`, `traverseLocked` and `excluded`
 * are all already on `WeaponMount` (`sim/ship.js:105-131,170-184`), ticked by
 * `Ship.fixedUpdate` (`ship.js:1009-1011`) and persisted through refit. This file reads
 * them and writes them; it adds no field to `Ship` or `WeaponMount`. The controllers
 * themselves hang off a module-private `WeakMap` rather than a `ship.salvo` property,
 * so they cost nothing on the hulls that never salvo and need no teardown.
 *
 * NO ALLOCATION IN THE HOT LOOP. Every controller preallocates `MAX_SLOTS` slot objects
 * and the parallel per-mount arrays at construction. `arm()` fills a prefix and sets
 * `_n`; it never grows, never splices and never sorts a copy — the prefix is ordered by
 * an in-place insertion sort over at most 24 entries.
 *
 * NO SECOND RECOIL PATH. `PlaneBody.recoilKick()` (`physics.js:282`) is the one entry
 * point and it is rotational only. Nothing here touches `body.velocity`: the velocity
 * servo at `physics.js:131-134` deletes lateral components before they can integrate
 * (measured: 0.000e+0 m/s, 0.000 m over 360 steps, `tools/flight.mjs` check 11), and
 * `stores.js:246-278` bills propellant against measured velocity change, so a shove
 * that did survive would be billed to the player as thrust.
 */

/**
 * THE RIPPLE.
 *
 * `step` is the nominal beat between two barrels on the same mount at nominal cadence.
 * The real step is `step / cadence^cadenceExp`, clamped — which is the whole design:
 * the beat is DERIVED from the same expression `combat.js:150` uses to set rate of
 * fire, so power routing, module condition and feed health read out in the rhythm
 * without one new tuning number.
 *
 * `mount.parts.fireRateMul` IS COUNTED EXACTLY ONCE, inside `cadence`. The spec counts
 * it twice — §1.3 puts it in the cadence expression and §1.4 applies it a second time
 * as `step x min(1/mul, stutterMax)`. Counted once, a dead feed (0.35) gives
 * `0.110 / sqrt(0.35)` = 186 ms, which reproduces the spec's own §1.3 worked example.
 * Counted twice it gives 264 ms, past this table's own `stepMax` of 240 ms, so the
 * clamp would silently eat the difference and the stutter would stop scaling at all.
 */
export const RIPPLE = {
  /** Nominal beat between barrels, seconds, at cadence 1.0. */
  step: 0.110,
  /** Fastest a barrel can follow another. Below this the ear hears one event. */
  stepMin: 0.070,
  /** Slowest. Past this the wave stops reading as one act and becomes trickle fire. */
  stepMax: 0.240,
  /** Exponent on cadence. 0.5 makes a 4x power swing a 2x rhythm swing. */
  cadenceExp: 0.5,
  /** Extra beat when the wave crosses from one mount to the next. */
  mountGap: 0.090,
  /** Target ceiling on the whole sweep. Exceeded only when stepMin binds — see below. */
  sweepMax: 1.250,
  /**
   * A dead barrel's slot. SHORTER than `stepMin` on purpose: the wave skips a beat
   * where the gun should have been, and a skipped beat is audible as a hole where a
   * lengthened one would just read as a slow gun.
   */
  deadPause: 0.055,
  /**
   * A frozen traverse ring's slot: the normal step PLUS this. The gun still fires — it
   * just fires where it is pointing, which is usually nowhere. The extra beat is the
   * ship waiting on a gun that cannot help it.
   */
  frozenPause: 0.140,
};

/** Committing costs a beat before you can commit again. */
export const SALVO = {
  /** Seconds after a sweep completes before another can be armed. */
  lockout: 0.35,
};

/**
 * THE CHARGE ARCHETYPE. One weapon in the game uses it: `bow_siege_lance`.
 *
 * Hold, and the mount stops tracking and winds up; release, and it fires at whatever
 * fraction of full charge it reached. Release early and you get a weak shot back and
 * part of the wind-up refunded. Hold past `holdMax` at full and it vents — you cannot
 * carry a charged lance around waiting for a perfect shot.
 */
export const CHARGE = {
  /** Seconds to full, when the weapon def does not declare `chargeTime`. */
  time: 2.60,
  /** Below this fraction of full, a release is an ABORT, not a shot. */
  minRelease: 1.20 / 2.60,
  /** Fraction of the built charge handed back on an abort. */
  abortRefund: 0.60,
  /** Seconds a full charge may be held before the mount vents it. */
  holdMax: 4.00,
  /** Thermal capacity a vent dumps into the mount. Holding is not free. */
  ventHeat: 0.25,
  /** Damage multiplier at `minRelease`, rising linearly to 1.0 at full charge. */
  dmgFloor: 0.35,
  /** Subsystem-accuracy multiplier over the same range. */
  accFloor: 0.55,
};

/**
 * Slots per ship. Preallocated, never grown.
 *
 * 24 is above the worst case any registered hull can produce and below the point where
 * the wave stops being one act: at `stepMin` alone, 24 slots is a 1.61 s sweep.
 * `tools/ripple.mjs` prints the real worst case over the registry rather than leaving
 * it to a playtest — see FLAG 12 in `docs/review/wave-plan.md`.
 */
export const MAX_SLOTS = 24;

/** Emitters one mount may contribute. Past eight the wave is one mount's private show. */
const MAX_EMITTERS_PER_MOUNT = 8;

/** Below this the mount is wreckage, matching `WeaponMount.usable` (`ship.js:208`). */
const WRECKED_CONDITION = 0.2;

/**
 * Ship-local bearing of each flank's beam. Port is -X and fires to -PI/2; starboard is
 * +X and fires to +PI/2. Both are read straight off `CRUISER_HARDPOINTS`
 * (`hardpoints.js:243,253`) under `yawOf = atan2(x, z)` (`physics.js:83`).
 */
const BEAM = { port: -Math.PI * 0.5, starboard: Math.PI * 0.5 };

/** Every reason a slot can fail to put a round downrange. See `EV.SALVO_COMPLETE`. */
const REASONS = ['dead', 'frozen', 'dry', 'jammed', 'cooked', 'nobear'];

/**
 * Controllers, keyed by ship.
 *
 * A `WeakMap` rather than a `ship.salvo` field for two reasons: `sim/ship.js` belongs
 * to another stream and this one may not add fields to it, and a hull that never fires
 * a ripple should not carry 24 slot objects it will never use. Entries disappear with
 * the ship, so there is no teardown to forget.
 */
const _controllers = new WeakMap();

/**
 * Does this mount's ARC cover the flank's beam?
 *
 * Deliberately measured against the AUTHORED `yawWidth`, never against `halfArc`.
 * `halfArc` collapses to `PART_EFFECT.traverseFrozenArc` (0.07 rad) when the traverse
 * ring is destroyed (`ship.js:192-194`), so using it would quietly drop every frozen
 * gun out of the flank — and a frozen gun firing into empty space is the single most
 * legible thing this feature does.
 */
function bearsOnFlank(mount, side) {
  if (side === 'all') return true;
  const beam = BEAM[side];
  if (beam === undefined) return false;
  return Math.abs(angleDelta(mount.yawCentre, beam)) <= mount.yawWidth * 0.5 + 1e-6;
}

/**
 * Is this module's geometry mirrored onto the opposite flank?
 *
 * The muzzle list is authored in module space for the module's OWN hardpoint. A
 * port-authored bank fitted to starboard has its mesh mirrored across YZ by
 * `hardpoints.js:524-526,536`, so its muzzles must be mirrored the same way or every
 * shot in the wave leaves from a point 300 m off the hull on the wrong side.
 */
function muzzleMirror(mount) {
  const md = mount.moduleDef;
  if (!md || md.noMirror) return 1;
  const hp = mount.hardpoint;
  const authored = md.hardpoint;
  if (hp === 'starboard' && authored === 'port') return -1;
  if (hp === 'port' && authored === 'starboard') return -1;
  return 1;
}

/**
 * How many barrels this mount contributes to a wave.
 *
 * Read off the ModuleDef's declared `muzzles` and NEVER off the built mesh: emitter
 * geometry is LOD-gated (`port_beam_array` draws three glow discs at LOD0 and one at
 * LOD1/2), so a mesh-derived count would be a simulation quantity that changes with
 * the graphics quality setting and a seeded run would stop reproducing between two
 * clients. See `core/contracts.js#ModuleDef.muzzles`.
 */
function emitterCount(mount) {
  const declared = mount.moduleDef?.muzzles?.length ?? 1;
  return Math.max(1, Math.min(declared, MAX_EMITTERS_PER_MOUNT, mount.def.shotsPerBurst ?? 1));
}

/** Compress a scheduled gap toward `k`, without ever LENGTHENING it. */
function squeeze(v, k) {
  if (k >= 1) return v;
  return Math.max(Math.min(v, RIPPLE.stepMin), v * k);
}

export class SalvoController {
  /**
   * @param {import('./ship.js').Ship} ship
   * @param {import('./combat.js').CombatSystem} combat
   */
  constructor(ship, combat) {
    this.ship = ship;
    this.combat = combat;
    this.bus = ship.bus ?? combat?.bus ?? null;

    /**
     * DETERMINISM OF THE FORK LABEL.
     *
     * NOT `ship.id`. `ship.js:291` builds that from `Ship._nextId`, a counter on the
     * class itself — it is not derived from the seed and it does not reset between
     * worlds, so two `World`s built from the same seed in the same process hand the
     * same ship two different ids and a replay would diverge. Measured: `tools/ripple.mjs`
     * check 9 builds the world twice in one process and asserts the released sequence
     * is identical, which a `ship.id` fork fails and this one passes.
     *
     * The spawn index is seed-stable for a given spawn order, which is exactly what a
     * seeded replay reproduces.
     */
    const spawnIndex = ship.world?.ships?.indexOf(ship) ?? -1;
    const root = ship.world?.rng ?? combat?.rng ?? null;
    const label = `salvo:${ship.classDef?.id ?? 'hull'}:${spawnIndex}`;
    this.rng = root ? root.fork(label) : null;
    this.rngLabel = label;

    // --- the pool. Everything below is allocated exactly once. ----------------
    /** @type {Array<Object>} */
    this._slots = new Array(MAX_SLOTS);
    for (let i = 0; i < MAX_SLOTS; i++) {
      this._slots[i] = {
        mount: null, mountIndex: -1, emitter: 0, declared: 0,
        localX: 0, localY: 0, localZ: 0,
        time: 0, dead: false, frozen: false, state: 'pending',
        _row: { hardpoint: null, label: '', emitter: 0, time: 0, dead: false, frozen: false, state: 'pending' },
      };
    }
    this._mounts = new Array(MAX_SLOTS).fill(null);
    this._mountCadence = new Float64Array(MAX_SLOTS);
    this._mountLast = new Float64Array(MAX_SLOTS);
    this._mountRolled = new Uint8Array(MAX_SLOTS);
    this._mountDropped = new Uint8Array(MAX_SLOTS);
    this._mountReason = new Array(MAX_SLOTS).fill(null);
    /** Seconds a CHARGE mount has been sitting at full charge, by weapon index. */
    this._holdFor = new Float64Array(MAX_SLOTS);

    this._n = 0;
    this._mountCount = 0;
    this._i = 0;
    this._t = 0;
    this._active = false;
    this._side = null;
    this._target = null;
    this._fired = 0;
    this._dropped = 0;
    this._lockout = 0;
    this._charging = false;
    /** Held-key intent from the input layer, and its edge. See `wantCharge`. */
    this._chargeWanted = false;
    this._chargeEdge = false;
    this._powerFactor = 1;

    /** Reason tally for `EV.SALVO_COMPLETE`. Reused; reset per salvo. */
    this._reasons = Object.create(null);
    for (const r of REASONS) this._reasons[r] = 0;

    /** World position of the muzzle that is firing. NOT a scratch vector — see `_release`. */
    this._muzzle = new THREE.Vector3();

    /**
     * The per-shot extras `combat._fire` reads. One object, reused, owned here.
     * Passing these as positional arguments would have made `_fire` an eight-parameter
     * function; passing a fresh object per shot would allocate inside a fixed step.
     */
    this._shot = { origin: null, emitter: 0, charge: 1, salvo: true };

    /** Reused read-API payloads. Never retained by a caller; see `salvoReport`. */
    this._report = {
      active: false, side: null, slotCount: 0, index: 0, fired: 0, dropped: 0,
      elapsed: 0, sweep: 0, lockout: 0, ready: false, slots: [],
    };
    this._eventFired = { ship, side: null, slotCount: 0 };
    this._eventComplete = { ship, side: null, fired: 0, dropped: 0, reasons: this._reasons };
    this._eventCharge = { ship, mount: null, time: 0, charge: 0, aborted: false };
  }

  get active() { return this._active; }
  get slotCount() { return this._n; }
  /** Seconds of lockout left. 0 means a fresh salvo can be armed right now. */
  get lockout() { return Math.max(0, this._lockout); }
  /** Total sweep length of the armed wave: first barrel to last, seconds. */
  get sweep() { return this._n > 0 ? this._slots[this._n - 1].time : 0; }

  // -------------------------------------------------------------------------
  // arming
  // -------------------------------------------------------------------------

  /**
   * Which flank is engaged: whichever side of the hull the current target is on.
   *
   * `angleDelta(heading, bearing)` is negative to port because port is -X and
   * `yawOf = atan2(x, z)`. With no target there is no engaged flank and the answer is
   * "everything that bears".
   */
  engagedFlank() {
    const t = this.ship.target;
    if (!t || t.dead) return 'all';
    const rel = angleDelta(this.ship.heading, yawOf(t.position.x - this.ship.position.x,
      t.position.z - this.ship.position.z));
    return rel < 0 ? 'port' : 'starboard';
  }

  /**
   * Can this mount be put in a wave at all?
   *
   * THE ONE SUBTLE LINE is the `offlineReason` test. A mount whose output sub-part is
   * destroyed is `online: false` with reason `'output'` (`ship.js:712-715`) — and it
   * MUST still be scheduled, because the hole it leaves is the entire point. Every
   * other offline reason (heat, detached, subsystem, scram, condition) keeps the mount
   * out of the wave entirely, which is what `EV.SALVO_FIRED`'s payload note means by
   * "a mount that is offline, excluded, or already cooling is never scheduled at all".
   *
   * @param {Object} mount
   * @param {boolean} immediate  skip the bear-at-arm-time test (the Shift variant)
   */
  schedulable(mount, immediate = false) {
    if (mount.def.type === 'pd') return false;           // reactive by definition
    if (mount.fireMode !== 'SALVO') return false;
    if (mount.excluded) return false;
    if (mount.parts.detached) return false;
    if (mount.condition < WRECKED_CONDITION) return false;
    if (!mount.online && mount.offlineReason !== 'output') return false;
    if (mount.thermal?.tripped) return false;
    if (mount.cooldown > 0) return false;
    if (mount.stall > 0) return false;
    if (mount.burstRemaining > 0) return false;          // mid-AUTO-burst; leave it alone
    if (this.ship.stores && this.ship.stores.blockedReason(mount)) return false;
    if (!immediate) {
      const t = this.ship.target;
      if (t && !t.dead && !mount.parts.traverseFrozen
        && !mount.canBear(this.ship.position, this.ship.heading, t.position)) return false;
    }
    return true;
  }

  /**
   * Commit. Returns the number of slots scheduled; 0 means nothing happened.
   *
   * @param {'port'|'starboard'|'all'|'auto'} [side]
   * @param {{immediate?: boolean}} [opts]  `immediate` arms guns that do not bear yet,
   *                                        betting the hull will have turned by their
   *                                        turn in the wave. It is the Shift variant.
   */
  arm(side = 'auto', opts = undefined) {
    const ship = this.ship;
    if (ship.dead || ship.crippled || ship.scrammed) return 0;
    if (this._active || this._lockout > 0) return 0;

    const immediate = opts?.immediate === true;
    let resolved = side === 'auto' ? this.engagedFlank() : side;
    let n = this._fill(resolved, immediate);
    // A flank with nothing left on it should not eat the press. Fall back to every gun
    // that bears rather than making the player work out which side is empty.
    if (n === 0 && side === 'auto' && resolved !== 'all') {
      resolved = 'all';
      n = this._fill(resolved, immediate);
    }
    if (n === 0) return 0;

    this._n = n;
    this._side = resolved;
    this._target = ship.target && !ship.target.dead ? ship.target : null;
    this._i = 0;
    this._t = 0;
    this._fired = 0;
    this._dropped = 0;
    this._active = true;
    for (const r of REASONS) this._reasons[r] = 0;

    this._sort(n);
    let sweep = this._walk(n, 1);
    // FLAG 12: `stepMin` wins over `sweepMax`, so a maximally-armed hull genuinely
    // overshoots the ceiling. `squeeze` never lengthens a gap, so this compresses what
    // it can and leaves the rest honest instead of pretending.
    if (sweep > RIPPLE.sweepMax) sweep = this._walk(n, RIPPLE.sweepMax / sweep);

    // Commit the guns. A mount that has been told to fire stops tracking, and that
    // visible freeze is the anticipation tell the whole firing feel rests on.
    for (let i = 0; i < n; i++) {
      const s = this._slots[i];
      if (s.time > this._mountLast[s.mountIndex]) this._mountLast[s.mountIndex] = s.time;
    }
    for (let mi = 0; mi < this._mountCount; mi++) {
      const m = this._mounts[mi];
      if (m) m.traverseLocked = this._mountLast[mi] + SALVO.lockout;
    }

    ship.thermal?.beginSalvoSurcharge?.();

    const ev = this._eventFired;
    ev.ship = ship; ev.side = resolved; ev.slotCount = n;
    this.bus?.emit(EV.SALVO_FIRED, ev);
    return n;
  }

  /** Walk the weapons and fill the slot prefix. Returns the count. No allocation. */
  _fill(side, immediate) {
    const ship = this.ship;
    this._powerFactor = ship.power?.unlocked ? Math.max(0.25, ship.power.factor('weapons')) : 1;

    let n = 0;
    let mounts = 0;
    for (const mount of ship.weapons) {
      if (!this.schedulable(mount, immediate)) continue;
      if (!bearsOnFlank(mount, side)) continue;

      const count = emitterCount(mount);
      if (n + count > MAX_SLOTS || mounts >= MAX_SLOTS) break;

      const mi = mounts++;
      this._mounts[mi] = mount;
      this._mountCadence[mi] = this.cadence(mount);
      this._mountLast[mi] = 0;
      this._mountRolled[mi] = 0;
      this._mountDropped[mi] = 0;
      this._mountReason[mi] = null;

      const mirror = muzzleMirror(mount);
      const muzzles = mount.moduleDef?.muzzles;
      for (let e = 0; e < count; e++) {
        const s = this._slots[n];
        const m = muzzles?.[e];
        s.mount = mount;
        s.mountIndex = mi;
        s.emitter = e;
        s.declared = n;
        s.localX = mount.localPosition.x + (m ? m[0] * mirror : 0);
        s.localY = mount.localPosition.y + (m ? m[1] : 0);
        s.localZ = mount.localPosition.z + (m ? m[2] : 0);
        s.dead = mount.parts.inert;
        s.frozen = mount.parts.traverseFrozen;
        s.state = 'pending';
        s.time = 0;
        n++;
      }
    }
    this._mountCount = mounts;
    return n;
  }

  /**
   * Order the wave FORE TO AFT by where each barrel physically is on the hull.
   *
   * Ship forward is +Z, so descending z is bow to stern. Barrels from different mounts
   * INTERLEAVE — a dorsal launcher's forward cell can fire between two sponson guns —
   * because the wave is a property of the hull, not of the module list. Ties break on
   * distance from the centreline (outboard first, so the widest gun leads) and then on
   * declaration order, which makes the sort total and therefore deterministic.
   *
   * Insertion sort, in place, over at most 24 entries: `Array.prototype.sort` cannot
   * sort a prefix without a copy, and a copy per salvo is an allocation in a fixed step.
   */
  _sort(n) {
    const slots = this._slots;
    for (let i = 1; i < n; i++) {
      const s = slots[i];
      let j = i - 1;
      while (j >= 0 && this._after(slots[j], s)) { slots[j + 1] = slots[j]; j--; }
      slots[j + 1] = s;
    }
  }

  /** True when `a` should come after `b` in the wave. */
  _after(a, b) {
    if (a.localZ !== b.localZ) return a.localZ < b.localZ;
    const ax = Math.abs(a.localX), bx = Math.abs(b.localX);
    if (ax !== bx) return ax < bx;
    return a.declared > b.declared;
  }

  /**
   * Lay the beats out. `k` < 1 compresses toward `sweepMax`. Returns the sweep length,
   * measured first barrel to last — the number the design's "0.33 to 1.25 s" refers to.
   */
  _walk(n, k) {
    const slots = this._slots;
    let t = 0;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const s = slots[i];
      if (s.mountIndex !== prev) {
        if (i > 0) t += squeeze(RIPPLE.mountGap, k);
        prev = s.mountIndex;
      }
      s.time = t;
      t += squeeze(this.stepFor(s), k);
    }
    return n > 0 ? slots[n - 1].time : 0;
  }

  /**
   * THE ONE PLACE `mount.parts.fireRateMul` IS COUNTED.
   *
   * Character for character the expression at `combat.js:150`. Three multipliers from
   * three different systems land on the same number: power routing, the module's
   * universal condition, and whether its feed still works.
   */
  cadence(mount) {
    return Math.max(0.05,
      this._powerFactor * fireRateMul(mount.condition) * mount.parts.fireRateMul);
  }

  /** Seconds from this slot to the next one. See RIPPLE for what each case means. */
  stepFor(slot) {
    if (slot.dead) return RIPPLE.deadPause;
    const cadence = this._mountCadence[slot.mountIndex] || this.cadence(slot.mount);
    const step = Math.min(RIPPLE.stepMax,
      Math.max(RIPPLE.stepMin, RIPPLE.step / Math.pow(cadence, RIPPLE.cadenceExp)));
    return slot.frozen ? step + RIPPLE.frozenPause : step;
  }

  // -------------------------------------------------------------------------
  // release
  // -------------------------------------------------------------------------

  /** Driven from `CombatSystem.fixedUpdate` at order 40, before ships integrate at 60. */
  fixedUpdate(dt) {
    if (this._lockout > 0) this._lockout -= dt;

    /*
     * THE HOLD KEY IS AN INTENT FLAG, NOT A CALL.
     *
     * `Controls.update` is a RENDER system (`game.js:267`) and runs while the game is
     * paused. Arming a ripple from there is fine — it only schedules, and every other
     * order in `controls.js` is issued synchronously with the input on purpose. But
     * RELEASING a charge fires a shot, and a shot spawned from a render callback is
     * simulation running outside the fixed step. So the key writes a flag and the edge
     * is consumed here, at 60 Hz, inside the step.
     */
    if (this._chargeWanted !== this._chargeEdge) {
      this._chargeEdge = this._chargeWanted;
      if (this._chargeWanted) this.beginCharge(); else this.releaseCharge();
    }

    this._updateCharge(dt);
    if (!this._active) return;

    this._t += dt;
    while (this._i < this._n && this._slots[this._i].time <= this._t) {
      this._release(this._slots[this._i]);
      this._i++;
    }
    if (this._i >= this._n) this._complete();
  }

  _release(slot) {
    const mi = slot.mountIndex;
    const mount = slot.mount;

    // The mount already fell out of this wave: cooked, jammed or dry. Every remaining
    // slot on it is still a slot — the wave stops early and the player sees where.
    if (this._mountDropped[mi]) return this._drop(slot, this._mountReason[mi]);

    // A destroyed barrel. The hole in the wave.
    if (slot.dead) return this._drop(slot, 'dead');

    // Misfeed, rolled ONCE per mount at its first live slot, exactly as `combat.js:169`
    // rolls it once per burst — so a worn mount reads as "this gun jams sometimes"
    // rather than "this gun is broken".
    if (!this._mountRolled[mi]) {
      this._mountRolled[mi] = 1;
      const jam = misfeedChance(mount.condition);
      if (jam > 0 && this.rng && this.rng.next() < jam) {
        mount.stall = MISFEED_STALL;
        mount.cooldown = MISFEED_STALL;
        this.bus?.emit(EV.NOTIFY, { text: `${mount.def.name ?? 'MOUNT'} MISFEED`, ship: this.ship, mount });
        this._dropMount(mi, 'jammed');
        return this._drop(slot, 'jammed');
      }
    }

    const target = this._target && !this._target.dead ? this._target : null;

    // AIM. Everything below writes `scratch.v1` and NOTHING is held across `_fire`:
    // `_fire` writes `scratch.v3` and `_resolveHitscan` writes v2 and v3
    // (`combat.js:236,265,280`), so a controller that computed a lead, did something
    // else, then fired would read a clobbered vector. Recomputed here, immediately
    // before the call, every time.
    let hitting = true;
    if (slot.frozen) {
      // A dead traverse ring: the gun fires where it is stuck. If the target is not in
      // that direction the round and the heat are spent for nothing, which is precisely
      // the information the wave is carrying. `worldForward` and `worldPosition` are one
      // step stale here (ships integrate at order 60, this runs at 40) — the identical
      // staleness the AUTO path at `combat.js:137` already works against.
      scratch.v1.copy(mount.worldPosition).addScaledVector(mount.worldForward, mount.def.range);
      hitting = !!target && mount.canBear(this.ship.position, this.ship.heading, target.position);
    } else {
      if (!target) return this._drop(slot, 'nobear');
      const sub = this.ship.targetSubsystem ? target.subsystems.get(this.ship.targetSubsystem) : null;
      const aimAt = sub && !sub.destroyed ? sub.worldPosition : target.position;
      const speed = mount.def.projectileSpeed;
      const lead = Number.isFinite(speed)
        ? interceptPoint(mount.worldPosition, speed, aimAt, target.velocity, scratch.v1)
        : scratch.v1.copy(aimAt);
      if (!lead) return this._drop(slot, 'nobear');
      // THE BEARING IS RE-TESTED AT THIS SLOT'S TURN, NOT AT ARM TIME. This one line is
      // the whole fire-early mechanic: commit while the hull is still swinging and the
      // guns that come to bear during the sweep fire, while the ones that do not, do not.
      if (!mount.canBear(this.ship.position, this.ship.heading, lead)) return this._drop(slot, 'nobear');
    }

    if (this.ship.stores && !this.ship.stores.consumeShot(mount)) {
      // Ran dry mid-ripple. Same consequence the AUTO path applies at `combat.js:160-162`.
      mount.cooldown = Math.max(mount.cooldown, 0.5);
      this._dropMount(mi, 'dry');
      return this._drop(slot, 'dry');
    }

    // The emitter's world position. Same rotation `WeaponMount.updateWorld` uses; a
    // dedicated vector rather than a scratch one because `_fire` reads it alongside the
    // aim point in `scratch.v1`.
    const h = this.ship.heading;
    const sinH = Math.sin(h), cosH = Math.cos(h);
    this._muzzle.set(
      this.ship.position.x + slot.localX * cosH + slot.localZ * sinH,
      this.ship.position.y + slot.localY,
      this.ship.position.z + slot.localZ * cosH - slot.localX * sinH,
    );

    const shot = this._shot;
    shot.origin = this._muzzle;
    shot.emitter = slot.emitter;
    shot.charge = 1;
    shot.salvo = true;
    this.combat._fire(this.ship, mount, scratch.v1, hitting ? target : null, this._powerFactor, shot);

    // RECOIL. Rotational only. The sign is the direction the gun is actually pointing
    // in ship space, so a dorsal turret traversed to port rolls the hull the same way a
    // port sponson does, and a bow gun on the centreline rolls it not at all.
    const lateral = Math.sin(mount.yawCentre + mount.traverse);
    if (lateral !== 0) {
      this.ship.body?.recoilKick?.(RECOIL.bank * ((mount.def.damage ?? 40) / 300) * lateral);
    }

    slot.state = 'fired';
    this._fired++;

    // `reasons.frozen` is the one key that counts a slot which DID fire: per the
    // `EV.SALVO_COMPLETE` payload note it means "the gun fired where it was stuck".
    // Counted only when the shot was wasted, so `fired + dropped === slotCount` still
    // holds and a frozen gun that happens to still bear is just a normal shot.
    if (slot.frozen && !hitting) this._reasons.frozen++;

    // `_fire` -> `thermal.onShot` may have tripped the mount inside that call. If it
    // did, the rest of this mount's wave is gone and the player watches it stop.
    if (mount.thermal?.tripped) this._dropMount(mi, 'cooked');
  }

  /** Record a slot that did not fire. The slot is NOT removed; it kept its beat. */
  _drop(slot, reason) {
    slot.state = 'dropped';
    this._dropped++;
    if (reason in this._reasons) this._reasons[reason]++;
    else this._reasons[reason] = 1;
  }

  /** Every remaining slot on this mount is lost, for one recorded reason. */
  _dropMount(mi, reason) {
    this._mountDropped[mi] = 1;
    this._mountReason[mi] = reason;
  }

  _complete() {
    this._active = false;
    this._lockout = SALVO.lockout;

    // Every mount that took part now cools. Same expression as `combat.js:178`, and the
    // cadence is the one the wave was scheduled against, so a starved battery pays a
    // longer cooldown as well as a longer sweep.
    for (let mi = 0; mi < this._mountCount; mi++) {
      const m = this._mounts[mi];
      if (!m) continue;
      const cd = (m.def.cooldown ?? 2) / (this._mountCadence[mi] || 1);
      if (m.cooldown < cd) m.cooldown = cd;
    }

    const ev = this._eventComplete;
    ev.ship = this.ship;
    ev.side = this._side;
    ev.fired = this._fired;
    ev.dropped = this._dropped;
    ev.reasons = this._reasons;
    this.bus?.emit(EV.SALVO_COMPLETE, ev);
  }

  // -------------------------------------------------------------------------
  // charge and release
  // -------------------------------------------------------------------------

  /** True while the player is holding the charge key and a mount is winding up. */
  get charging() { return this._charging; }

  /**
   * The held-key intent. Called from the input layer every frame with the current state
   * of the charge key; the transition is acted on inside `fixedUpdate`. Idempotent, so
   * polling it at frame rate costs nothing, and a window blur that clears the key set
   * releases the charge rather than leaving a gun wound up forever.
   */
  wantCharge(held) {
    this._chargeWanted = held === true;
  }

  /** Start winding up every CHARGE mount that can take it. */
  beginCharge() {
    const ship = this.ship;
    if (ship.dead || ship.crippled || ship.scrammed) return 0;
    let n = 0;
    for (const mount of ship.weapons) {
      if (mount.fireMode !== 'CHARGE') continue;
      if (mount.charging) continue;
      if (!mount.online || mount.parts.inert || mount.parts.detached) continue;
      if (mount.thermal?.tripped || mount.stall > 0 || mount.cooldown > 0) continue;
      if (ship.stores && ship.stores.blockedReason(mount)) continue;
      mount.charging = true;
      // Committing locks the mount for the whole wind-up plus a beat, refreshed each
      // step by `_updateCharge` so a long hold never runs out of lock.
      mount.traverseLocked = mount.chargeTime * (1 - mount.charge) + SALVO.lockout;
      const ev = this._eventCharge;
      ev.ship = ship; ev.mount = mount; ev.aborted = false;
      ev.charge = mount.charge;
      ev.time = mount.chargeTime * (1 - mount.charge);
      this.bus?.emit(EV.WEAPON_CHARGING, ev);
      n++;
    }
    this._charging = n > 0;
    return n;
  }

  /**
   * Let go.
   *
   * Below `CHARGE.minRelease` this is an ABORT: part of the wind-up is refunded and
   * nothing leaves the tube. At or above it the mount fires, with damage and subsystem
   * accuracy scaled from the floors to full by how far the charge got.
   */
  releaseCharge() {
    this._charging = false;
    let fired = 0;
    for (const mount of this.ship.weapons) {
      if (!mount.charging) continue;
      mount.charging = false;
      const q = mount.charge;
      const ev = this._eventCharge;
      ev.ship = this.ship; ev.mount = mount; ev.charge = q;

      if (q < CHARGE.minRelease) {
        mount.charge = q * CHARGE.abortRefund;
        ev.aborted = true;
        ev.time = q * mount.chargeTime;
        this.bus?.emit(EV.WEAPON_CHARGING, ev);
        continue;
      }
      if (this._fireCharged(mount, q)) fired++;
      mount.charge = 0;
    }
    return fired;
  }

  /** Tick the hold timer. A full charge cannot be carried around indefinitely. */
  _updateCharge(dt) {
    const ship = this.ship;
    const weapons = ship.weapons;
    for (let i = 0; i < weapons.length && i < MAX_SLOTS; i++) {
      const mount = weapons[i];
      if (!mount.charging) { this._holdFor[i] = 0; continue; }
      // Keep the commitment lock alive for as long as the gun is winding up.
      if (mount.traverseLockFor < SALVO.lockout) mount.traverseLocked = SALVO.lockout;
      if (mount.charge < 1) { this._holdFor[i] = 0; continue; }
      this._holdFor[i] += dt;
      if (this._holdFor[i] < CHARGE.holdMax) continue;
      // Vented. The charge is gone and the mount is hot for having held it.
      this._holdFor[i] = 0;
      mount.charging = false;
      mount.charge = 0;
      if (mount.thermal) {
        mount.thermal.heat += CHARGE.ventHeat;
        if (mount.thermal.heat >= 1 && !mount.thermal.tripped) ship.thermal?.trip(mount);
      }
      const ev = this._eventCharge;
      ev.ship = ship; ev.mount = mount; ev.charge = 1; ev.aborted = true; ev.time = CHARGE.holdMax;
      this.bus?.emit(EV.WEAPON_CHARGING, ev);
      this.bus?.emit(EV.NOTIFY, { text: `${mount.def.name ?? 'MOUNT'} VENTED`, ship, mount });
      this._charging = false;
    }
  }

  _fireCharged(mount, q) {
    const ship = this.ship;
    const target = ship.target && !ship.target.dead ? ship.target : null;
    if (!target) return false;
    if (ship.stores && ship.stores.blockedReason(mount)) return false;

    const sub = ship.targetSubsystem ? target.subsystems.get(ship.targetSubsystem) : null;
    const aimAt = sub && !sub.destroyed ? sub.worldPosition : target.position;
    const speed = mount.def.projectileSpeed;
    const lead = Number.isFinite(speed)
      ? interceptPoint(mount.worldPosition, speed, aimAt, target.velocity, scratch.v1)
      : scratch.v1.copy(aimAt);
    if (!lead) return false;
    if (!mount.canBear(ship.position, ship.heading, lead)) return false;
    if (ship.stores && !ship.stores.consumeShot(mount)) return false;

    const muzzles = mount.moduleDef?.muzzles;
    const mirror = muzzleMirror(mount);
    const m = muzzles?.[0];
    const lx = mount.localPosition.x + (m ? m[0] * mirror : 0);
    const ly = mount.localPosition.y + (m ? m[1] : 0);
    const lz = mount.localPosition.z + (m ? m[2] : 0);
    const sinH = Math.sin(ship.heading), cosH = Math.cos(ship.heading);
    this._muzzle.set(
      ship.position.x + lx * cosH + lz * sinH,
      ship.position.y + ly,
      ship.position.z + lz * cosH - lx * sinH,
    );

    const shot = this._shot;
    shot.origin = this._muzzle;
    shot.emitter = 0;
    shot.charge = q;
    shot.salvo = false;
    this.combat._fire(ship, mount, scratch.v1, target, this._powerFactor, shot);

    const lateral = Math.sin(mount.yawCentre + mount.traverse);
    if (lateral !== 0) {
      ship.body?.recoilKick?.(RECOIL.bank * ((mount.def.damage ?? 40) / 300) * lateral);
    }
    mount.cooldown = Math.max(mount.cooldown, mount.def.cooldown ?? 2);
    return true;
  }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

/**
 * ATTACH A CONTROLLER. Idempotent — call it as often as you like.
 *
 * READ THIS BEFORE CALLING IT. Attaching is not free and it is not neutral: a mount
 * whose `fireMode` is not `AUTO` is WITHHELD from the automatic firing path the moment
 * a controller exists (`combat.js#_updateShipWeapons`), and `DEFAULT_FIRE_MODE`
 * (`ship.js:36-45`) puts every cannon, rail and missile mount in the game into SALVO —
 * NPCs included. So attaching to a hull that nothing can command does not "enable the
 * feature" on it, it DISARMS it.
 *
 * The rule, therefore: attach exactly where a releaser exists. `src/input/controls.js`
 * attaches to `world.player` because it owns the keys that release it, and nothing
 * else in the tree attaches at all.
 *
 * MEASURED, AND THIS IS WHY THE RULE IS PHRASED THAT WAY: an earlier revision attached
 * from `combat.fixedUpdate` on `ship.isPlayer` instead. `src/sim/selftest.mjs` builds a
 * `test_cruiser` with `{ player: true }` and drives `CombatSystem` directly with no
 * input layer at all, so its cannon was withheld with nothing to release it and the
 * harness went from 54/54 to 49/54 — "kinetic fire consumes finite rounds  0 rounds
 * spent", and four thermal and economy checks downstream of it. `isPlayer` is a fact
 * about whose hull it is; it is not evidence that a releaser exists.
 *
 * @param {import('./ship.js').Ship} ship
 * @param {import('./combat.js').CombatSystem} combat
 */
export function attachSalvo(ship, combat) {
  let c = _controllers.get(ship);
  if (!c && ship && combat) {
    c = new SalvoController(ship, combat);
    _controllers.set(ship, c);
  }
  return c ?? null;
}

/** The controller, if one exists. Never creates one. */
export function salvoOf(ship) {
  return _controllers.get(ship) ?? null;
}

/** True when something on this hull can release a SALVO or CHARGE mount. */
export function hasSalvo(ship) {
  return _controllers.has(ship);
}

// ---------------------------------------------------------------------------
// READ API
// ---------------------------------------------------------------------------

/**
 * Empty report handed back for a hull with no controller. Shared, never mutated.
 *
 * `ready: false`, not true. `ready` means "arm() would do something", and on a hull
 * with no controller there is nothing to arm — a HUD that read `true` here would print
 * SALVO READY on a ship that cannot salvo at all, which is the one lie this readout
 * must not tell. It is also what the player's own HUD reads on the boot frame, before
 * `Controls` has attached.
 */
const EMPTY_REPORT = Object.freeze({
  active: false, side: null, slotCount: 0, index: 0, fired: 0, dropped: 0,
  elapsed: 0, sweep: 0, lockout: 0, ready: false, slots: Object.freeze([]),
});

/**
 * READ API for the HUD, the VFX layer and the audio layer.
 *
 *   const s = salvoReport(world.player);
 *   s.active      a wave is in flight
 *   s.side        'port' | 'starboard' | 'all' | null
 *   s.slotCount   slots in the wave, INCLUDING dead and frozen ones
 *   s.index       how many slots have resolved
 *   s.fired / s.dropped
 *   s.elapsed / s.sweep     seconds into the wave, and its total length
 *   s.lockout     seconds before another can be armed
 *   s.ready       true when `arm()` would do something
 *   s.slots[i]    { hardpoint, label, emitter, time, dead, frozen, state }
 *                 in hull order, fore to aft. `state` is pending|fired|dropped.
 *
 * CACHED AND MUTATED. Safe to call every frame; do not retain the object or the rows.
 * Nothing in here allocates, so the UI may poll it without a rate limit — though
 * `docs/review/wave-plan.md` asks W3-A to cache it at 5 Hz anyway.
 *
 * THE UI MUST NOT REACH PAST THIS. `SalvoController`'s underscored fields are the
 * scheduler's working state and will change shape; this object is the contract.
 */
export function salvoReport(ship) {
  const c = _controllers.get(ship);
  if (!c) return EMPTY_REPORT;
  const r = c._report;
  r.active = c._active;
  r.side = c._side;
  r.slotCount = c._n;
  r.index = c._i;
  r.fired = c._fired;
  r.dropped = c._dropped;
  r.elapsed = c._active ? c._t : 0;
  r.sweep = c.sweep;
  r.lockout = c.lockout;
  r.ready = !c._active && c._lockout <= 0;

  const rows = r.slots;
  rows.length = 0;
  for (let i = 0; i < c._n; i++) {
    const s = c._slots[i];
    const row = s._row;
    row.hardpoint = s.mount?.hardpoint ?? null;
    row.label = s.mount?.def?.name ?? s.mount?.def?.id ?? '';
    row.emitter = s.emitter;
    row.time = s.time;
    row.dead = s.dead;
    row.frozen = s.frozen;
    row.state = s.state;
    rows.push(row);
  }
  return r;
}

/** Reused preview payload. See `salvoPreview`. */
const _preview = { side: null, slots: 0, mounts: 0, wait: 0 };

/**
 * What pressing the salvo key RIGHT NOW would do, without doing it.
 *
 * `slots` counts what would be scheduled — including the dead and frozen ones, because
 * they are part of the wave and the HUD should say so. `wait` is how many seconds until
 * that count could become non-zero: the lockout if one is running, otherwise the
 * shortest cooldown, reload, stall or thermal spin-down on the flank. 0 means now.
 *
 * Cached and mutated. Nothing allocates.
 */
export function salvoPreview(ship, side = 'auto') {
  const out = _preview;
  out.side = null; out.slots = 0; out.mounts = 0; out.wait = 0;
  const c = _controllers.get(ship);
  if (!c) return out;

  const resolved = side === 'auto' ? c.engagedFlank() : side;
  out.side = resolved;
  let wait = Infinity;
  let slots = 0;
  let mounts = 0;
  for (const mount of ship.weapons) {
    if (mount.def.type === 'pd' || mount.fireMode !== 'SALVO' || mount.excluded) continue;
    if (!bearsOnFlank(mount, resolved)) continue;
    if (c.schedulable(mount, false)) {
      slots += emitterCount(mount);
      mounts++;
      continue;
    }
    // Not now — but how long until it could be? Only counts mounts that still exist.
    if (mount.parts.detached || mount.condition < WRECKED_CONDITION) continue;
    if (!mount.online && mount.offlineReason !== 'output' && mount.offlineReason !== 'heat') continue;
    let t = Math.max(mount.cooldown, mount.stall, mount.reloading);
    if (mount.thermal?.tripped) t = Math.max(t, mount.thermal.tripTimer);
    if (t > 0 && t < wait) wait = t;
  }
  out.slots = slots;
  out.mounts = mounts;
  out.wait = slots > 0 ? c.lockout : (Number.isFinite(wait) ? Math.max(wait, c.lockout) : 0);
  return out;
}
