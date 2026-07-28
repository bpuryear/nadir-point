/**
 * PLOT AND BURN.
 *
 * The travel layer specified in docs/design/controls.md 5.5, implemented as written.
 * It is not a map screen and it is not a jump drive. It is a physical burn in the same
 * coordinate space as everything else, that you can watch, that costs propellant, that
 * is interruptible, and that is dangerous in proportion to how much of the faction war
 * you fly through.
 *
 * FOUR PHASES, ALL VISIBLE
 *   1. turn      the cruiser comes about at its normal, slow rate. You watch it.
 *   2. spool     25 s of the drive winding up. Weapons go offline, shields drop to a
 *                quarter, and that is not a penalty bolted on for balance - it is the
 *                whole reactor going to the drive, which is the same reason the burn
 *                gets 30 m/s^2 when combat gets 6.
 *   3. burn      30 m/s^2 to a 3600 m/s ceiling. 216 km of runway, so legs under
 *                430 km never reach the ceiling and run a pure triangular profile.
 *   4. brake     automatic, symmetric, computed to arrive at combat speed.
 *
 * The arithmetic is checked against the table in 5.5.3 and reproduces it exactly:
 * 120 km = 151 s, 300 km = 225 s, 600 km = 312 s, all including the spool; under
 * SILENT the same legs are 217 / 330 / 497 s.
 *
 * PROPELLANT has a floor. The cruiser always keeps a 40 unit reserve that a plotted
 * course cannot spend, so a course that would strand you is REJECTED AT PLOT TIME with
 * the reason on the leg, rather than accepted and then failed two hundred kilometres
 * from anywhere.
 *
 * RISK is the faction war made personal. Every 60 s of transit rolls against the patrol
 * heat of the segment you are on, times your signature - and your signature is 6x in a
 * normal burn and 1.5x under SILENT. The percentage is drawn on the leg before you
 * commit, so being intercepted is always something you agreed to.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { KM, RANGE, TIME_SCALES_COMBAT, TIME_SCALES_TRANSIT } from '../core/units.js';
import { scratch } from '../core/world.js';
import { Ship } from '../sim/ship.js';
import { pickClass } from '../sim/ai/roster.js';
import { enterPOI } from './poi/index.js';
import { DOCK_RANGE, DOCK_SPEED } from './system.js';
import { MEV } from '../sim/meta/events.js';

/**
 * Transit constants. These mirror `CRUISER_FEEL` in docs/design/controls.md 6.1; the
 * camera stream owns that block for the combat half, and the transit half has no home
 * outside this file yet.
 */
export const TRANSIT = {
  combatArrivalSpeed: 180,
  maxSpeed: 3600,
  accel: 30.0,
  spool: 25.0,
  turnMul: 0.30,
  signature: 6.0,
  silentMaxSpeed: 1800,
  silentAccel: 13.0,
  silentSignature: 1.5,
  propellantPerKm: 0.8,
  propellantPerKmSilent: 0.5,
  reserve: 40,
  heatK: 0.05,
  heatCap: 0.35,
  riskRollPeriod: 60.0,
  weaponSpinUp: 12.0,
  shieldFraction: 0.25,
  /** Cannot be lit inside this of a large mass; also the arrival boundary. */
  minLightRange: 40 * KM,
};

/**
 * Closed-form profile for one leg. Trapezoid when the leg is long enough to reach the
 * ceiling, triangle when it is not.
 *
 * @returns {{time:number, peak:number, accelDist:number, cruiseDist:number}}
 */
export function legProfile(distance, accel, vmax, arriveAt = 0) {
  if (!(distance > 0)) return { time: 0, peak: 0, accelDist: 0, cruiseDist: 0 };
  // Distance needed to accelerate to vmax and back down to the arrival speed.
  const upDist = (vmax * vmax) / (2 * accel);
  const downDist = (vmax * vmax - arriveAt * arriveAt) / (2 * accel);
  if (upDist + downDist <= distance) {
    const cruise = distance - upDist - downDist;
    const time = vmax / accel + cruise / vmax + (vmax - arriveAt) / accel;
    return { time, peak: vmax, accelDist: upDist, cruiseDist: cruise };
  }
  // Triangular: peak where the accelerate and brake curves meet.
  const peak = Math.sqrt((2 * accel * distance + arriveAt * arriveAt) / 2);
  const time = peak / accel + (peak - arriveAt) / accel;
  return { time, peak, accelDist: (peak * peak) / (2 * accel), cruiseDist: 0 };
}

/**
 * Steering for the burn.
 *
 * `Ship.fixedUpdate` calls `this.move.update(dt)` every step, and `MoveController`
 * with no order sets the throttle to ZERO - which is exactly right for a ship holding
 * station and exactly wrong for one under transit burn, because it erases whatever the
 * travel layer just asked for. Rather than fight it, the burn swaps in this: same three
 * methods, publishing the transit layer's intent instead of chasing a waypoint. The
 * player's own controller is put back the moment the burn ends.
 */
class TransitHelm {
  constructor(body) {
    this.body = body;
    this.throttle = 0;
    this.heading = body.heading ?? 0;
    this.active = false;
  }

  order(point) { this.heading = Math.atan2(point.x - this.body.position.x, point.z - this.body.position.z); }
  cancel() { this.throttle = 0; }
  update() {
    this.body.throttle = this.throttle;
    this.body.desiredHeading = this.heading;
  }
}

export class TravelSystem {
  /**
   * @param {import('../core/world.js').World} world
   * @param {import('./system.js').StarSystem} system
   * @param {import('./factionWar.js').FactionWarSystem} war
   */
  constructor(world, system, war, deps = {}) {
    this.world = world;
    this.bus = world.bus;
    this.system = system;
    this.war = war;
    this.fleetAI = deps.fleetAI ?? null;
    this.shipAI = deps.shipAI ?? null;

    this.rng = world.rng.fork('travel');
    this.interceptRng = world.rng.fork('transit-intercept');
    this.ambushRng = world.rng.fork('transit-ambush');

    this.name = 'travel';
    this.order = 26;

    /** idle | turning | spooling | burning | ambush */
    this.state = 'idle';
    this.course = null;
    this.legIndex = 0;
    this.phaseTimer = 0;
    this.riskTimer = 0;
    this.weaponsOnlineIn = 0;
    this._silent = false;

    /** Where the player currently is, as far as the world is concerned. */
    this.currentPOI = null;

    /** Berthed at an anchorage. See the DOCKING block below. */
    this.docked = false;
    this.dockedAt = null;
    this._dockSaved = null;

    this._saved = null;
    this._transitBand = false;
    this._pendingCourse = null;

    if (!world.propellant) {
      world.propellant = { current: 640, max: 640, reserve: TRANSIT.reserve };
    }
  }

  // =========================================================================
  // Plotting
  // =========================================================================

  get silent() { return this._silent; }
  setSilent(on) { this._silent = !!on; }

  get accel() { return this._silent ? TRANSIT.silentAccel : TRANSIT.accel; }
  get maxSpeed() { return this._silent ? TRANSIT.silentMaxSpeed : TRANSIT.maxSpeed; }
  get signature() { return this._silent ? TRANSIT.silentSignature : TRANSIT.signature; }
  get propellantPerKm() { return this._silent ? TRANSIT.propellantPerKmSilent : TRANSIT.propellantPerKm; }

  get inTransit() { return this.state === 'spooling' || this.state === 'burning' || this.state === 'turning'; }

  /** Plot a single leg from where the player is to a POI. */
  plotTo(poiId) {
    const node = this.system.get(poiId);
    if (!node) return { ok: false, reason: `unknown destination "${poiId}"`, legs: [] };
    return this.plot([node.position], [poiId]);
  }

  /**
   * Plot a course through a list of world points.
   *
   * Returns a full description whether or not it is legal, because the overlay draws
   * an illegal course in warn colour with the reason on it - a course that silently
   * fails to appear teaches the player nothing.
   */
  plot(points, poiIds = []) {
    const player = this.world.player;
    const origin = player ? player.position : this.system.nodes[0].position;
    const legs = [];
    let cursorX = origin.x;
    let cursorZ = origin.z;
    let totalTime = 0;
    let totalPropellant = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const dx = p.x - cursorX;
      const dz = p.z - cursorZ;
      const distance = Math.hypot(dx, dz);
      if (distance < 1) continue;

      // Quoted against a full stop at the marker, which is what the table in 5.5.3 is
      // computed from. The burn actually brakes to combat speed and coasts the last
      // few hundred metres, so a leg arrives a few seconds inside its own estimate -
      // an ETA that is pessimistic by 3% is a good ETA.
      const profile = legProfile(distance, this.accel, this.maxSpeed);
      const time = profile.time + TRANSIT.spool;
      const propellant = (distance / KM) * this.propellantPerKm;

      // Heat along the leg. Sampled rather than taken at the endpoints, because a leg
      // that starts and ends in quiet space can still run straight down a front.
      let heatSum = 0;
      let heatPeak = 0;
      const SAMPLES = 9;
      for (let s = 0; s < SAMPLES; s++) {
        const t = (s + 0.5) / SAMPLES;
        const h = this.war ? this.war.heatAtPoint(cursorX + dx * t, cursorZ + dz * t) : 0;
        heatSum += h;
        if (h > heatPeak) heatPeak = h;
      }
      const heat = heatSum / SAMPLES;
      const rolls = Math.floor(time / TRANSIT.riskRollPeriod);
      const perRoll = Math.min(TRANSIT.heatCap, Math.max(0, heat * TRANSIT.heatK * this.signature));
      const interceptChance = 1 - Math.pow(1 - perRoll, rolls);

      legs.push({
        index: legs.length,
        from: new THREE.Vector3(cursorX, 0, cursorZ),
        to: new THREE.Vector3(p.x, 0, p.z),
        poiId: poiIds[i] ?? this.system.containing(p.x, p.z)?.id ?? null,
        distance, time, propellant, heat, heatPeak, rolls, perRoll, interceptChance,
        profile,
      });

      cursorX = p.x;
      cursorZ = p.z;
      totalTime += time;
      totalPropellant += propellant;
    }

    const prop = this.world.propellant;
    const spendable = prop.current - prop.reserve;
    const ok = legs.length > 0 && totalPropellant <= spendable;
    const reason = legs.length === 0
      ? 'no legs plotted'
      : (ok ? null
        : `INSUFFICIENT PROPELLANT — course needs ${Math.ceil(totalPropellant)}, `
          + `${Math.max(0, Math.floor(spendable))} available above the ${prop.reserve} unit reserve`);

    return {
      legs, totalTime, totalPropellant, ok, reason,
      silent: this._silent,
      // Cumulative odds of being intercepted at least once anywhere on the course.
      interceptChance: 1 - legs.reduce((acc, l) => acc * (1 - l.interceptChance), 1),
    };
  }

  /**
   * Commit a plotted course. `Enter` on the tactical overlay lands here.
   * Rejections are returned, never thrown, and always carry a reason string.
   */
  commit(course) {
    const player = this.world.player;
    if (!player || player.dead) return { ok: false, reason: 'no ship' };
    if (!course?.ok) return { ok: false, reason: course?.reason ?? 'no course' };
    if (this.inTransit) return { ok: false, reason: 'already under way' };
    // Laying in a course IS letting go. Making the player press undock first would be
    // a modal step between two things that are the same decision.
    if (this.docked) this.undock('course laid in');

    this.course = course;
    this.legIndex = 0;
    this.state = 'turning';
    this.phaseTimer = 0;
    this.riskTimer = 0;
    this.bus.emit(EV.NOTIFY, {
      text: `COURSE LAID IN — ${(course.legs[0].distance / KM).toFixed(0)} km, `
        + `${formatTime(course.totalTime)}, ${Math.ceil(course.totalPropellant)} propellant`,
      important: true,
    });
    return { ok: true, course };
  }

  /** Abort. Cheap, always legal, and leaves the ship wherever it is. */
  abort(reason = 'course aborted') {
    if (this.state === 'idle') return;
    this._exitTransit();
    this.state = 'idle';
    this.course = null;
    this.bus.emit(EV.NOTIFY, { text: reason.toUpperCase(), important: true });
  }

  // =========================================================================
  // Simulation
  // =========================================================================

  fixedUpdate(dt) {
    const player = this.world.player;
    if (!player || player.dead) {
      if (this.state !== 'idle') this.abort('transit lost');
      return;
    }

    if (this.weaponsOnlineIn > 0) {
      this.weaponsOnlineIn -= dt;
      if (this.weaponsOnlineIn <= 0) { this.weaponsOnlineIn = 0; this._restoreWeapons(); }
    }

    switch (this.state) {
      case 'turning': this._updateTurning(player, dt); break;
      case 'spooling': this._updateSpooling(player, dt); break;
      case 'burning': this._updateBurning(player, dt); break;
      default: break;
    }

    if (this.inTransit) this._updateBand(player);
    this._updateArrivalTracking(player);
  }

  _leg() { return this.course?.legs[this.legIndex] ?? null; }

  _updateTurning(player, dt) {
    const leg = this._leg();
    if (!leg) { this.state = 'idle'; return; }
    const dx = leg.to.x - player.position.x;
    const dz = leg.to.z - player.position.z;
    const want = Math.atan2(dx, dz);
    player.body.desiredHeading = want;
    if (player.move) player.move.active = false;   // stop the move controller steering
    player.body.throttle = 0;

    const err = Math.abs(angleDiff(player.body.heading, want));
    if (err < 0.06) {
      this.state = 'spooling';
      this.phaseTimer = TRANSIT.spool;
      this.riskTimer = 0;
      this.bus.emit(EV.NOTIFY, { text: 'TRANSIT DRIVE SPOOLING', important: true });
    }
  }

  _updateSpooling(player, dt) {
    this.phaseTimer -= dt;
    this.riskTimer += dt;
    this._rollRisk(player, dt);
    if (this.phaseTimer <= 0) {
      this._enterTransit(player);
      this.state = 'burning';
    }
  }

  /**
   * The burn. Throttle full until the brake point, then throttle zero, which under the
   * assisted-flight model in `PlaneBody` decelerates at exactly the same rate - so the
   * profile is symmetric without a second controller.
   */
  _updateBurning(player, dt) {
    const leg = this._leg();
    if (!leg) { this._arrive(player); return; }

    const body = player.body;
    const dx = leg.to.x - body.position.x;
    const dz = leg.to.z - body.position.z;
    const remaining = Math.hypot(dx, dz);
    const helm = this._helm ?? body;
    helm.heading = Math.atan2(dx, dz);

    const v = body.speed;
    const arriveAt = this.legIndex === this.course.legs.length - 1 ? TRANSIT.combatArrivalSpeed : v;
    const brakeDist = Math.max(0, (v * v - arriveAt * arriveAt) / (2 * this.accel));
    // Throttle zero decelerates at exactly the same rate the assisted-flight model
    // accelerates, so the braking half of the profile is symmetric for free.
    helm.throttle = remaining > brakeDist ? 1 : 0;

    this.riskTimer += dt;
    this._rollRisk(player, dt);
    if (this.state !== 'burning') return;      // an ambush dropped us out

    const tolerance = Math.max(1200, v * 2.5);
    if (remaining <= tolerance) {
      if (this.legIndex < this.course.legs.length - 1) {
        this.legIndex++;
      } else {
        this._arrive(player);
      }
    }
  }

  _rollRisk(player, dt) {
    if (this.riskTimer < TRANSIT.riskRollPeriod) return;
    this.riskTimer -= TRANSIT.riskRollPeriod;
    const heat = this.war ? this.war.heatAtPoint(player.position.x, player.position.z) : 0;
    const p = Math.min(TRANSIT.heatCap, Math.max(0, heat * TRANSIT.heatK * this.signature));
    if (p <= 0) return;
    if (this.interceptRng.next() < p) this._intercepted(player, heat);
  }

  // --- transit mode ---------------------------------------------------------

  /**
   * The whole reactor goes to the drive. Everything this changes is restored on the
   * way out, from the same saved block, so an aborted transit cannot leave the ship
   * permanently faster or permanently unarmed.
   */
  _enterTransit(player) {
    if (this._saved) return;
    const body = player.body;
    this._saved = {
      maxSpeed: body.maxSpeed,
      accel: body.accel,
      turnRate: body.turnRate,
      shieldMax: player.shields.max,
      shieldCurrent: player.shields.current,
      weapons: player.weapons.map((m) => m.online),
    };
    body.maxSpeed = this.maxSpeed;
    body.accel = this.accel;
    body.turnRate = this._saved.turnRate * TRANSIT.turnMul;
    this._saved.move = player.move;
    this._helm = new TransitHelm(body);
    this._helm.heading = body.desiredHeading;
    player.move = this._helm;
    player.shields.max = this._saved.shieldMax * TRANSIT.shieldFraction;
    player.shields.current = Math.min(player.shields.current, player.shields.max);
    for (const m of player.weapons) m.online = false;
    this.bus.emit(EV.NOTIFY, { text: 'TRANSIT BURN — WEAPONS OFFLINE', important: true });
  }

  _exitTransit() {
    const player = this.world.player;
    if (!this._saved || !player) { this._saved = null; this._closeBand(); return; }
    const body = player.body;
    body.maxSpeed = this._saved.maxSpeed;
    body.accel = this._saved.accel;
    body.turnRate = this._saved.turnRate;
    player.shields.max = this._saved.shieldMax;
    if (player.move === this._helm) player.move = this._saved.move ?? null;
    this._helm = null;
    body.throttle = 0;
    this._pendingWeapons = this._saved.weapons;
    this._saved = null;
    this._closeBand();
  }

  _restoreWeapons() {
    const player = this.world.player;
    if (!player) return;
    const saved = this._pendingWeapons;
    for (let i = 0; i < player.weapons.length; i++) {
      player.weapons[i].online = saved ? (saved[i] ?? true) : true;
    }
    this._pendingWeapons = null;
    this.bus.emit(EV.NOTIFY, { text: 'WEAPONS ONLINE', important: true });
  }

  /**
   * The compression band. Transit widens the time controls to 64x; a resolved contact
   * inside sensor range slams it shut on the same tick, and `Engine.setScaleTable`
   * clamps the index down so a player sitting at 32x lands on 4x rather than on a
   * speed the new table does not contain.
   */
  _updateBand(player) {
    const contact = this._nearestContact(player);
    const wantOpen = this.state !== 'idle' && !contact;
    if (wantOpen && !this._transitBand) {
      this._transitBand = true;
      this.world.engine?.setScaleTable(TIME_SCALES_TRANSIT);
    } else if (!wantOpen && this._transitBand) {
      this._closeBand();
      if (contact) {
        this.bus.emit(EV.NOTIFY, { text: 'CONTACT RESOLVED — time compression lost', important: true });
      }
    }
  }

  _closeBand() {
    if (!this._transitBand) return;
    this._transitBand = false;
    this.world.engine?.setScaleTable(TIME_SCALES_COMBAT);
  }

  _nearestContact(player) {
    const range = RANGE.sensorBase;
    const r2 = range * range;
    for (const s of this.world.ships) {
      if (s === player || s.dead || s.isPlayer) continue;
      if (s.position.distanceToSquared(player.position) < r2) return s;
    }
    return null;
  }

  // --- interception ---------------------------------------------------------

  /**
   * Dropped out of transit at the point on the leg where it happened, into open space
   * with a patrol in it. No load, no transition - you were already there. Weapons come
   * back over 12 s, which is the price of having been fast.
   */
  _intercepted(player, heat) {
    const rng = this.ambushRng;
    this._exitTransit();
    this.state = 'ambush';
    this.weaponsOnlineIn = TRANSIT.weaponSpinUp;
    this.course = null;

    const control = this.war ? this.war.controlAtPoint(player.position.x, player.position.z) : 0;
    const faction = control >= 0 ? 'coalition' : 'concord';
    const count = 2 + (rng.next() < heat ? 1 : 0) + (rng.next() < heat * 0.6 ? 1 : 0);

    const fleet = this.fleetAI?.create({ faction, anchor: player.position.clone(), poiId: null }) ?? null;
    const bearing = Math.atan2(player.velocity.x, player.velocity.z);

    for (let i = 0; i < count; i++) {
      const role = i === 0 ? 'frigate' : 'corvette';
      const classDef = pickClass(faction, role);
      const spread = (i - (count - 1) * 0.5) * 1400;
      const ahead = rng.range(7000, 12000);
      const s = Math.sin(bearing), c = Math.cos(bearing);
      const ship = new Ship({
        classDef,
        world: this.world,
        faction,
        position: new THREE.Vector3(
          player.position.x + s * ahead + c * spread,
          0,
          player.position.z + c * ahead - s * spread,
        ),
        heading: bearing + Math.PI + rng.signed() * 0.2,
        root: this._buildRoot(classDef, faction, rng),
      });
      this.world.addShip(ship);
      const ai = ship.ai ?? this.shipAI?.adopt(ship, { fleet });
      if (ai && fleet) { ai.fleet = fleet; fleet.add(ship); }
    }

    // Being intercepted by a faction is not a friendly encounter, whatever the
    // reputation says. The picket has already decided.
    this.war?.adjustReputation(faction, -4, 'intercepted');

    this.bus.emit(EV.BATTLE_STARTED, {
      poiId: null, ambush: true, faction, live: true,
      name: 'Interception', endsAt: 0, duration: 0,
    });
    this.bus.emit(EV.NOTIFY, {
      text: `INTERCEPTED — ${faction.toUpperCase()} PICKET — weapons in ${TRANSIT.weaponSpinUp | 0}s`,
      important: true,
    });
  }

  _buildRoot(classDef, faction, rng) {
    if (!classDef.build) return undefined;
    const materials = this.world.systems?.materials;
    try {
      return classDef.build({
        rng: rng.fork(classDef.id),
        materials,
        palette: materials?.palette ?? null,
        faction,
        lod: 0,
      });
    } catch (err) {
      console.warn('[travel] hull build failed', err);
      return undefined;
    }
  }

  // --- arrival --------------------------------------------------------------

  _arrive(player) {
    const leg = this._leg();
    this._exitTransit();
    this.state = 'idle';
    this.course = null;
    this.weaponsOnlineIn = 2.5;      // short, because nobody shot at us
    player.body.throttle = 0;

    const spent = leg ? leg.propellant : 0;
    const prop = this.world.propellant;
    prop.current = Math.max(prop.reserve, prop.current - spent);

    const node = this.system.containing(player.position.x, player.position.z);
    if (node) this.enter(node.id);
    else this.bus.emit(EV.NOTIFY, { text: 'ARRIVED — open space', important: true });
  }

  /**
   * Track which POI the player is standing in, and load it when they cross the
   * boundary. This is what makes arrival seamless: there is no separate "load" step
   * for the player to wait through, only a boundary that content appears inside of.
   */
  _updateArrivalTracking(player) {
    const node = this.system.containing(player.position.x, player.position.z);
    const id = node?.id ?? null;
    if (id === this.currentPOI) return;
    if (this.inTransit && id) return;    // do not load a POI we are flying past
    if (id) this.enter(id);
    else if (this.currentPOI) this.leave();
  }

  /**
   * Enter a POI: hand back the last one's un-stripped wreckage, build this one's sky,
   * light and fields, and materialise whatever the war left lying here.
   */
  enter(poiId) {
    if (this.currentPOI === poiId) return this.world.poi;
    const node = this.system.get(poiId);
    if (!node) return null;

    this._releaseBootContent();
    if (this.currentPOI) this.war?.dematerialise(this.currentPOI);

    const materials = this.world.systems?.materials ?? null;
    const ctx = {
      rng: this.world.rng.fork(`poi-enter:${poiId}`),
      materials,
      palette: materials?.palette ?? this.world.systems?.palette ?? null,
      faction: 'player',
      lod: 0,
      poiOrigin: node.position,
      warDebris: this.war?.debrisSpecFor(poiId) ?? null,
    };

    const instance = materials ? enterPOI(this.world, poiId, ctx) : null;
    this.currentPOI = poiId;
    this.war?.materialise(poiId, ctx);

    const st = this.war?.poiState(poiId);
    // A berth announces itself, because the whole sortie loop is the player knowing
    // where the ways home are without having to open a screen to find out.
    const berth = node.anchorage
      ? (this.dockStatus(poiId).ok ? ' — BERTH AVAILABLE' : ' — BERTH CLOSED')
      : '';
    this.bus.emit(EV.NOTIFY, {
      text: `ARRIVED — ${node.name}${st?.contested ? ' — CONTESTED' : ''}${berth}`,
      important: true,
    });
    // `world/poi/index.js#enterPOI` emits POI_ENTERED when it builds an instance. When
    // it cannot - no material registry, which is every headless run - nothing else
    // does, and discovery, audio and the sortie ledger all listen for it. Emit exactly
    // in the gap rather than doubling the event in the real game.
    if (!instance) this.bus.emit(EV.POI_ENTERED, { id: poiId, node });
    return instance;
  }

  leave() {
    if (!this.currentPOI) return;
    this.war?.dematerialise(this.currentPOI);
    this.currentPOI = null;
  }

  /**
   * `game.js` lights and dresses the starting POI before this stream is even loaded,
   * through `installCelestials`, `installFields` and `buildPOILighting` directly. Those
   * are not owned by a POI instance, so the first time the player actually goes
   * somewhere they would be left behind: two skies, two fields, two key lights.
   *
   * So the first real POI change hands the boot content back. Once.
   */
  _releaseBootContent() {
    if (this._bootReleased) return;
    this._bootReleased = true;
    const s = this.world.systems;
    for (const key of ['fields', 'celestials', 'lighting']) {
      try {
        s[key]?.dispose?.();
      } catch (err) {
        console.warn(`[travel] could not release boot ${key}`, err);
      }
      delete s[key];
    }
  }

  /**
   * Adopt whatever integration already put on screen as this POI, without rebuilding
   * it. Used at install time so the first frame is not two copies of one place.
   */
  adoptCurrent(poiId) {
    this.currentPOI = poiId;
    this._bootReleased = false;
  }

  /** Refuelling. Yards and friendly stations; the amount is the caller's business. */
  refuel(amount) {
    const p = this.world.propellant;
    p.current = Math.min(p.max, p.current + amount);
    return p.current;
  }

  /**
   * `stores.js` asks `world.systems.travel.transiting` before charging manoeuvring
   * propellant, so that a transit leg is not billed twice - once at the published
   * 0.8/km and again per unit of commanded delta-v. That property did not exist, so
   * the check silently never fired and every burn was billed twice. This is the
   * property it was asking for.
   */
  get transiting() { return this.inTransit; }

  // =========================================================================
  // DOCKING
  //
  // The single highest-ratio change in `closest-comparables.md`: `refuel()` above
  // existed and was called by nobody, and five station and yard POIs sat in
  // `world/system.js` with written blurbs and no interaction. Everything below is
  // that one call, made.
  //
  // What docking gives, and why each one is here rather than everywhere:
  //
  //   PROPELLANT  bought with refined alloy, at a per-berth price. This is the whole
  //               point: propellant stops being a one-way ratchet toward immobility
  //               and becomes a clock you reset somewhere specific, at a cost that
  //               competes with repairs and ammunition for the same pool.
  //   REPAIR      the existing repair queue, subsidised and run two to four and a half
  //               times faster. Repair still works in the field; it is simply worse
  //               there, which is a reason to come in rather than a rule against
  //               staying out.
  //   REFINING    the backlog is queued on arrival and the refinery runs at up to 3.6x.
  //               Scrap is bulky; a berth is where the hold empties.
  //   REFIT       gated. See `sim/meta/refitGate.js`.
  //   DEBRIEF     `sim/meta/sortie.js`, closed and priced on the same call.
  //
  // Nothing here is a shop. There is no market, no price speculation and nothing to
  // sell to - materials remain a sink, exactly as the scope decision requires. What an
  // anchorage sells is SERVICE, and every price is a drain on the same four pools.
  // =========================================================================

  /** The anchorage profile of a POI, or null if it is rock, wreckage or light. */
  anchorageAt(poiId = this.currentPOI) {
    return this.system.get(poiId)?.anchorage ?? null;
  }

  /** Who runs this berth right now. Control moves, so this is read, never authored. */
  ownerOf(poiId) {
    return this.war?.poiState(poiId)?.owner ?? 'contested';
  }

  /**
   * Everything a docking prompt needs, whether or not docking is legal.
   *
   * Refusals carry a reason string that names the specific thing that is wrong, because
   * "cannot dock" teaches the player nothing and "MERIDIAN GATE WILL NOT BERTH YOU —
   * standing -12, minimum +5" teaches them the whole system in one line.
   */
  dockStatus(poiId = this.currentPOI) {
    const node = this.system.get(poiId);
    const a = node?.anchorage ?? null;
    if (!a) return { ok: false, anchorage: false, reason: 'no berth here', poiId };

    const player = this.world.player;
    const owner = this.ownerOf(poiId);
    const standing = this.world.reputation?.[owner] ?? 0;
    const distance = player ? player.position.distanceTo(node.position) : Infinity;
    const speed = player?.body?.speed ?? 0;
    const st = this.war?.poiState(poiId);

    const out = {
      anchorage: true,
      poiId,
      name: node.name,
      berth: a.berth ?? node.name,
      kind: node.kind,
      owner,
      standing,
      minStanding: a.minStanding ?? -100,
      distance,
      dockRange: DOCK_RANGE,
      speed,
      docked: this.docked && this.dockedAt === poiId,
      services: this.services(poiId),
      ok: false,
      reason: null,
    };

    if (out.docked) { out.ok = true; out.reason = 'berthed'; return out; }
    if (!player || player.dead) { out.reason = 'no ship'; return out; }
    if (this.inTransit) { out.reason = 'under way — abort the course first'; return out; }
    if (owner === 'contested' || st?.battle) {
      out.reason = `${node.name.toUpperCase()} IS CONTESTED — the berth is shut`;
      return out;
    }
    if (standing < (a.minStanding ?? -100)) {
      out.reason = `${owner.toUpperCase()} WILL NOT BERTH YOU — standing ${Math.round(standing)}, `
        + `minimum ${a.minStanding}`;
      return out;
    }
    if (distance > DOCK_RANGE) {
      out.reason = `${(distance / KM).toFixed(0)} km out — close to ${(DOCK_RANGE / KM).toFixed(0)} km`;
      return out;
    }
    if (speed > DOCK_SPEED) {
      out.reason = `${speed.toFixed(0)} m/s — come alongside under ${DOCK_SPEED}`;
      return out;
    }
    out.ok = true;
    return out;
  }

  /**
   * Price and capability of a berth, after standing.
   *
   * Standing is a discount, hostility is a surcharge, and the curve is deliberately
   * gentle: this is a supply relationship, not a reputation grind. The interesting
   * consequence of burning a faction is that half the map's berths close, not that the
   * remaining ones charge 40% more.
   */
  services(poiId = this.currentPOI) {
    const node = this.system.get(poiId);
    const a = node?.anchorage;
    if (!a) return null;
    const owner = this.ownerOf(poiId);
    const standing = this.world.reputation?.[owner] ?? 0;
    const priceMul = 1 + Math.max(0, -standing) / 100 * 0.8 - Math.max(0, standing) / 100 * 0.25;
    return {
      poiId,
      owner,
      priceMul,
      propellantPerUnit: a.propellantPerUnit * priceMul,
      berthFee: Math.ceil(a.berthFee * priceMul),
      repairSubsidy: a.repairSubsidy,
      repairRateMul: a.repairRateMul,
      refineRateMul: a.refineRateMul,
      refitSpeedMul: a.refitSpeedMul,
      heavyRefit: !!a.heavyRefit,
      kindLabel: a.kindLabel ?? (node.kind === 'yard' ? 'REPAIR YARD' : 'ANCHORAGE'),
    };
  }

  /**
   * Come alongside.
   *
   * The order of operations matters and is the design: the sortie closes and is priced
   * FIRST, then the yard takes what it is owed, then the berth fee, and only then does
   * anything become available to buy. A player therefore reads what the sortie earned
   * and what it cost in the same breath, which is the whole reason the debrief exists.
   */
  dock(poiId = this.currentPOI) {
    const status = this.dockStatus(poiId);
    if (!status.ok) return { ok: false, reason: status.reason, status };
    if (status.docked) return { ok: true, already: true, status };

    const player = this.world.player;
    const node = this.system.get(poiId);
    this._closeBand();
    player.body.throttle = 0;
    player.body.velocity.set(0, 0, 0);
    player.move?.cancel?.();
    if (this.weaponsOnlineIn > 0) { this.weaponsOnlineIn = 0; this._restoreWeapons(); }

    this.docked = true;
    this.dockedAt = poiId;

    const sortie = this.world.systems.sortie ?? null;
    const debrief = sortie ? sortie.end(poiId) : null;
    const settled = sortie ? sortie.settle() : { paid: 0, debt: 0 };

    const svc = this.services(poiId);
    const fee = this._charge(svc.berthFee, `berth fee at ${node.name}`);

    // Yard rates, saved so undocking cannot leave the field permanently fast.
    const refit = this.world.systems.refit ?? null;
    const economy = this.world.systems.economy ?? null;
    this._dockSaved = {
      repairRate: refit?.repairRate ?? null,
      rateMultiplier: economy?.rateMultiplier ?? null,
    };
    if (refit) refit.repairRate *= svc.repairRateMul;
    if (economy) economy.rateMultiplier *= svc.refineRateMul;

    // The backlog goes into the hopper the moment the lines are on. Nobody comes into
    // a refinery berth to press a button.
    const queued = economy ? economy.enqueueAll() : 0;

    this.bus.emit(MEV.DOCKED, {
      poiId, name: node.name, berth: svc.kindLabel, services: svc,
      debrief, settled, fee, queued,
    });
    this.bus.emit(EV.NOTIFY, {
      text: `BERTHED — ${(this.anchorageAt(poiId).berth ?? node.name).toUpperCase()}`
        + (queued > 0 ? ` — ${Math.round(queued)} units to the refinery` : ''),
      important: true,
    });
    this.world.systems.persistence?.autosave?.('dock');
    return { ok: true, status: this.dockStatus(poiId), debrief, settled, fee, queued, services: svc };
  }

  /** Let go. Opens a fresh sortie ledger; everything the berth was doing stops. */
  undock(reason = 'under way') {
    if (!this.docked) return { ok: false, reason: 'not docked' };
    const poiId = this.dockedAt;
    const refit = this.world.systems.refit ?? null;
    const economy = this.world.systems.economy ?? null;
    if (this._dockSaved) {
      if (refit && this._dockSaved.repairRate !== null) refit.repairRate = this._dockSaved.repairRate;
      if (economy && this._dockSaved.rateMultiplier !== null) economy.rateMultiplier = this._dockSaved.rateMultiplier;
    }
    this._dockSaved = null;
    this.docked = false;
    this.dockedAt = null;
    this.world.systems.sortie?.begin(poiId);
    this.bus.emit(MEV.UNDOCKED, { poiId, reason });
    this.bus.emit(EV.NOTIFY, { text: `LINES OFF — ${reason.toUpperCase()}`, important: true });
    return { ok: true, poiId };
  }

  /**
   * Buy propellant, in units, or `'full'`.
   *
   * THIS IS THE CALL THE WHOLE STREAM EXISTS FOR. `refuel()` above is four lines old and
   * had no caller; this is its caller, and it is what turns propellant from attrition
   * into a clock with a reset that lives in a specific place on the map.
   */
  buyPropellant(units = 'full') {
    if (!this.docked) return { ok: false, reason: 'not docked' };
    const p = this.world.propellant;
    const svc = this.services(this.dockedAt);
    const want = units === 'full' ? p.max - p.current : Math.min(units, p.max - p.current);
    if (want <= 0.5) return { ok: false, reason: 'tank full' };

    const price = want * svc.propellantPerUnit;
    const paid = this._charge(price, 'propellant');
    // Credit covers the shortfall, so a berth never strands a player who arrived broke.
    // It costs them the next sortie's take instead, which is the correct pressure.
    const before = p.current;
    const delivered = this.refuel(want) - before;
    this.bus.emit(MEV.SERVICE_USED, {
      service: 'propellant', poiId: this.dockedAt, units: want, cost: price, paid,
    });
    this.bus.emit(EV.NOTIFY, {
      text: `TAKING ON ${Math.round(want)} PROPELLANT — ${Math.ceil(price)} ALLOY`,
      important: true,
    });
    return { ok: true, units: want, cost: price, paid, propellant: p.current, delivered };
  }

  /**
   * Clear as much of the repair plan as the pools will carry, and hand back the yard's
   * subsidy. Every job goes through `refit.js`'s own queue, so nothing here duplicates
   * the repair model - it just makes doing it here cheaper and faster than doing it out
   * where somebody is shooting at you.
   */
  serviceRepair(limit = 24) {
    if (!this.docked) return { ok: false, reason: 'not docked' };
    const refit = this.world.systems.refit;
    if (!refit) return { ok: false, reason: 'no refit system' };
    const svc = this.services(this.dockedAt);
    const economy = this.world.systems.economy ?? null;

    const done = [];
    let subsidy = { alloy: 0, composite: 0, electronics: 0, exotic: 0 };
    let spent = 0;
    for (const row of refit.repairPlan().slice(0, limit)) {
      if (!row.affordable) continue;
      let res = null;
      if (row.kind === 'module') res = refit.repairModule(row.hardpoint, 1);
      else if (row.kind === 'part') res = refit.repairPart(row.hardpoint, row.partId);
      else if (row.kind === 'structure') res = refit.repairHardpoint(row.hardpoint);
      else if (row.kind === 'hull') res = refit.repairHull(Infinity);
      else if (row.kind === 'ammo') res = refit.fabricateAmmo(row.partId, Infinity);
      else if (row.kind === 'coolant') res = refit.refillCoolant();
      if (!res?.ok) continue;
      done.push(row.id);
      const cost = res.cost ?? { alloy: res.cost ?? 0 };
      for (const k of ['alloy', 'composite', 'electronics', 'exotic']) {
        const n = typeof cost === 'number' ? (k === 'alloy' ? cost : 0) : (cost[k] ?? 0);
        subsidy[k] += n * svc.repairSubsidy;
        spent += n;
      }
    }
    for (const k in subsidy) subsidy[k] = Math.floor(subsidy[k]);
    if (economy) economy.credit(subsidy, 'yard subsidy');
    else for (const k in subsidy) this.world.materials[k] = (this.world.materials[k] ?? 0) + subsidy[k];

    this.bus.emit(MEV.SERVICE_USED, { service: 'repair', poiId: this.dockedAt, jobs: done.length, subsidy, spent });
    return { ok: true, jobs: done, spent, subsidy, rate: refit.repairRate };
  }

  /** Push the whole scrap backlog into the refinery. Cheap, and the reason to be here. */
  serviceRefine() {
    if (!this.docked) return { ok: false, reason: 'not docked' };
    const economy = this.world.systems.economy;
    if (!economy) return { ok: false, reason: 'no economy' };
    const units = economy.enqueueAll();
    this.bus.emit(MEV.SERVICE_USED, { service: 'refine', poiId: this.dockedAt, units });
    return { ok: true, units, rate: economy.rate, etaSeconds: economy.describe().etaSeconds };
  }

  /** The debrief for the sortie this berth just closed. */
  debrief() {
    return this.world.systems.sortie?.lastDebrief() ?? null;
  }

  /**
   * Take refined alloy, and put whatever cannot be paid onto the slate.
   * @returns {{alloy:number, credit:number}}
   */
  _charge(alloy, reason) {
    if (!(alloy > 0)) return { alloy: 0, credit: 0 };
    const m = this.world.materials;
    const have = Math.max(0, m.alloy ?? 0);
    const taken = Math.min(have, alloy);
    m.alloy = have - taken;
    const short = alloy - taken;
    if (short > 0.5) this.world.systems.sortie?.borrow(short, reason);
    return { alloy: taken, credit: Math.max(0, short) };
  }

  /** Everything the tactical overlay draws, in one call. */
  status() {
    return {
      state: this.state,
      silent: this._silent,
      currentPOI: this.currentPOI,
      propellant: { ...this.world.propellant },
      leg: this.legIndex,
      legs: this.course?.legs.length ?? 0,
      spoolRemaining: this.state === 'spooling' ? this.phaseTimer : 0,
      weaponsOnlineIn: this.weaponsOnlineIn,
      compression: this._transitBand,
      docked: this.docked,
      dockedAt: this.dockedAt,
      berth: this.docked ? this.dockStatus(this.dockedAt) : null,
      /** Anchorages the player can name, nearest first. The sortie's list of ways home. */
      anchorages: this._anchorageRows(),
    };
  }

  /**
   * Every berth the player knows about, with the arithmetic that decides which one they
   * can actually reach. `reachable` is the load-bearing field: it is the sortie's
   * boundary condition, drawn before it bites.
   */
  _anchorageRows() {
    const rows = this._dockRows ?? (this._dockRows = []);
    rows.length = 0;
    const player = this.world.player;
    if (!player) return rows;
    const discovery = this.world.systems.discovery ?? null;
    const prop = this.world.propellant;
    const spendable = Math.max(0, prop.current - prop.reserve);
    for (const node of this.system.anchorages()) {
      if (discovery && !discovery.isKnown(node.id)) continue;
      const d = player.position.distanceTo(node.position);
      const cost = (d / KM) * this.propellantPerKm;
      const owner = this.ownerOf(node.id);
      rows.push({
        id: node.id,
        name: node.name,
        kind: node.kind,
        owner,
        standing: this.world.reputation?.[owner] ?? 0,
        minStanding: node.anchorage.minStanding ?? -100,
        km: d / KM,
        propellant: cost,
        reachable: cost <= spendable,
        heavyRefit: !!node.anchorage.heavyRefit,
        propellantPerUnit: node.anchorage.propellantPerUnit,
      });
    }
    rows.sort((a, b) => a.km - b.km);
    return rows;
  }
}

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
