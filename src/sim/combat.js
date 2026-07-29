import * as THREE from 'three';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { interceptPoint, raySphere } from './physics.js';
import { fireRateMul, damageMul, misfeedChance, MISFEED_STALL } from './condition.js';
import { THERMAL } from './heat.js';
import { attachSalvo, salvoOf, hasSalvo, salvoPreview, CHARGE } from './salvo.js';

/**
 * Combat resolution.
 *
 * The spatial layer: every weapon has a real arc anchored to where it physically sits
 * on the hull, so bringing guns to bear is a manoeuvring problem, not a targeting one.
 * Turning a 1.4 km ship to open a broadside takes seconds, and those seconds are the
 * decision. A ship that could fire everything in every direction would have no combat
 * depth at all, regardless of how many weapons it had.
 *
 * Projectiles live in flat arrays and cycle through a fixed pool. Nothing here
 * allocates per shot.
 */

const MAX_PROJECTILES = 2048;

export class ProjectilePool {
  constructor(capacity = MAX_PROJECTILES) {
    this.capacity = capacity;
    this.count = 0;

    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.damage = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);       // index into KINDS
    this.faction = new Uint8Array(capacity);
    this.tracking = new Float32Array(capacity); // >0 means it steers (missiles)
    this.targetRef = new Array(capacity).fill(null);
    this.subsystemRef = new Array(capacity).fill(null);
    /** Second-tier aim point: which sub-part of the aimed module this shot wants. */
    this.partRef = new Array(capacity).fill(null);
    this.sourceRef = new Array(capacity).fill(null);
    this.accuracy = new Float32Array(capacity);
  }

  spawn() {
    if (this.count >= this.capacity) return -1;
    return this.count++;
  }

  kill(i) {
    const last = --this.count;
    if (i !== last) {
      this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
      this.life[i] = this.life[last];
      this.damage[i] = this.damage[last];
      this.kind[i] = this.kind[last];
      this.faction[i] = this.faction[last];
      this.tracking[i] = this.tracking[last];
      this.accuracy[i] = this.accuracy[last];
      this.targetRef[i] = this.targetRef[last];
      this.subsystemRef[i] = this.subsystemRef[last];
      this.partRef[i] = this.partRef[last];
      this.sourceRef[i] = this.sourceRef[last];
    }
    this.targetRef[last] = null;
    this.subsystemRef[last] = null;
    this.partRef[last] = null;
    this.sourceRef[last] = null;
  }
}

export const PROJECTILE_KINDS = ['slug', 'shell', 'railslug', 'missile', 'flak', 'pdslug'];

/** Which weapon types resolve instantly rather than travelling. */
const HITSCAN = new Set(['beam', 'lance', 'mining']);

export class CombatSystem {
  constructor(world) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('combat');
    this.projectiles = new ProjectilePool();
    this.order = 40;
    this.name = 'combat';

    /** Live hitscan beams, for the VFX layer to draw this frame. */
    this.activeBeams = [];
    this._factionIndex = new Map();
  }

  factionId(name) {
    if (!this._factionIndex.has(name)) this._factionIndex.set(name, this._factionIndex.size);
    return this._factionIndex.get(name);
  }

  fixedUpdate(dt) {
    this.activeBeams.length = 0;
    for (const ship of this.world.ships) {
      if (ship.dead) continue;
      // THE RIPPLE RUNS FIRST, inside the same loop, so the ordering is explicit and
      // the system stays at order 40 — ahead of ships at order 60, which is what
      // `physics.js:279-280` requires of the recoil kick.
      //
      // THIS TICKS A CONTROLLER; IT NEVER CREATES ONE. `salvoOf` is the non-creating
      // accessor and the distinction is load-bearing. A mount whose `fireMode` is not
      // AUTO is withheld from the automatic path below the moment a controller exists,
      // and `DEFAULT_FIRE_MODE` (`ship.js:36-45`) puts every cannon, rail and missile
      // in the game into SALVO — NPCs included. Attaching here on `ship.isPlayer` would
      // therefore disarm any player hull that has no input layer: measured, it takes
      // `src/sim/selftest.mjs` from 54/54 to 49/54, starting at "kinetic fire consumes
      // finite rounds  0 rounds spent". `src/input/controls.js` attaches, because it
      // owns the keys that release it. See `salvo.js#attachSalvo`.
      salvoOf(ship)?.fixedUpdate(dt);
      this._updateShipWeapons(ship, dt);
    }
    this._updateProjectiles(dt);
  }

  _updateShipWeapons(ship, dt) {
    const target = ship.target;
    const hasTarget = target && !target.dead;
    /** True when something on this hull can release a mount the salvo controller holds. */
    const commanded = hasSalvo(ship);

    for (const mount of ship.weapons) {
      if (!mount.online || !mount.usable) continue;
      // A misfeed from a worn feed is a stall you can watch on the weapon strip.
      if (mount.stall > 0) continue;

      // Point defence picks its own target - it is reactive, not commanded.
      const isPD = mount.def.type === 'pd' || mount.def.type === 'flak';
      let aimAt = null;
      let aimShip = null;

      if (isPD) {
        const threat = this._nearestIncoming(ship, mount);
        if (threat) { aimAt = threat.point; aimShip = threat.ship; }
      } else if (hasTarget) {
        aimShip = target;
        const sub = ship.targetSubsystem ? target.subsystems.get(ship.targetSubsystem) : null;
        aimAt = sub && !sub.destroyed ? sub.worldPosition : target.position;
      }

      if (!aimAt) continue;

      // Lead the target. A slow mass driver genuinely cannot hit a fast corvette at
      // range, which is what makes weapon choice a real decision.
      const speed = mount.def.projectileSpeed;
      const lead = Number.isFinite(speed)
        ? interceptPoint(mount.worldPosition, speed, aimAt, aimShip ? aimShip.velocity : scratch.v4.set(0, 0, 0), scratch.v1)
        : scratch.v1.copy(aimAt);
      if (!lead) continue;

      const onTarget = mount.trackTowards(ship.heading, lead, dt);

      /*
       * A MOUNT THE SALVO CONTROLLER OWNS STILL TRACKS. IT JUST DOES NOT FIRE ITSELF.
       *
       * The armament spec puts this test at the top of the loop, before `trackTowards`.
       * That is wrong and it is not a small wrongness: a SALVO mount would then never
       * traverse at all, so it would sit at traverse 0 for the whole fight, its
       * `worldForward` would point along the arc centre forever, and the frozen-traverse
       * tell — a gun visibly stuck while its neighbours slew — would be indistinguishable
       * from every other gun on the ship. Tracking is also what makes committing cheap:
       * the battery is already on the target when the player presses.
       *
       * `commanded` is the second half of the rule. Without it, `fireMode !== 'AUTO'`
       * would silently disarm every NPC cannon in the game.
       */
      if (commanded && mount.fireMode !== 'AUTO') continue;

      if (!mount.canBear(ship.position, ship.heading, lead)) continue;
      if (!onTarget) continue;

      // Weapons draw from the power pool. Starve them and they fire slowly.
      const powerFactor = ship.power.unlocked ? Math.max(0.25, ship.power.factor('weapons')) : 1;

      // Three multipliers on the same cadence, from three different systems:
      // power routing, the module's condition, and whether its feed still works.
      const cadence = Math.max(0.05, powerFactor * fireRateMul(mount.condition) * mount.parts.fireRateMul);

      if (mount.burstRemaining > 0) {
        if (mount.burstTimer <= 0) {
          // Stores are checked per shot, not per burst: running dry mid-burst is a
          // thing that happens and the player should see the burst cut short.
          if (!ship.stores || ship.stores.consumeShot(mount)) {
            this._fire(ship, mount, lead, aimShip, powerFactor);
            mount.burstRemaining--;
            mount.burstTimer = mount.def.burstInterval / cadence;
          } else {
            mount.burstRemaining = 0;
            mount.cooldown = Math.max(mount.cooldown, 0.5);
          }
        }
      } else if (mount.cooldown <= 0) {
        if (ship.stores && ship.stores.blockedReason(mount)) continue;
        // Worn feeds jam. Rolled once per burst so it reads as "this gun jams
        // sometimes" rather than "this gun is broken" - see condition.js.
        const jam = misfeedChance(mount.condition);
        if (jam > 0 && this.rng.next() < jam) {
          mount.stall = MISFEED_STALL;
          mount.cooldown = MISFEED_STALL;
          this.bus.emit(EV.NOTIFY, { text: `${mount.def.name ?? 'MOUNT'} MISFEED`, ship, mount });
          continue;
        }
        mount.burstRemaining = mount.def.shotsPerBurst;
        mount.burstTimer = 0;
        mount.cooldown = mount.def.cooldown / cadence;
      }
    }
  }

  _nearestIncoming(ship, mount) {
    // PD shoots missiles first, then anything small and hostile in bubble range.
    const p = this.projectiles;
    let bestI = -1;
    let bestD2 = mount.range * mount.range;
    const myFaction = this.factionId(ship.faction);
    for (let i = 0; i < p.count; i++) {
      if (p.faction[i] === myFaction) continue;
      if (p.tracking[i] <= 0) continue; // only guided munitions are worth the ammo
      const dx = p.px[i] - mount.worldPosition.x;
      const dy = p.py[i] - mount.worldPosition.y;
      const dz = p.pz[i] - mount.worldPosition.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; bestI = i; }
    }
    if (bestI >= 0) {
      return { point: scratch.v2.set(p.px[bestI], p.py[bestI], p.pz[bestI]), ship: null, projectileIndex: bestI };
    }

    const hostile = this.world.nearest(mount.worldPosition, mount.range, (s) =>
      s !== ship && this.world.areHostile(ship.faction, s.faction) && s.classDef.role === 'fighter');
    return hostile ? { point: hostile.position, ship: hostile } : null;
  }

  /**
   * One shot.
   *
   * Heat is added here and nowhere else, so "how much did that burst cost me" has
   * exactly one answer. Condition scales muzzle energy; heat scales dispersion and
   * ruins the fire solution, which means a mount held past its soft cap stops being a
   * precision instrument - it still does damage, it just stops hitting what you aimed
   * at. That is the interlock that makes overheating cost you SALVAGE, not just DPS.
   *
   * @param {Object} [shot]  per-shot extras, supplied only by `sim/salvo.js`:
   *        `origin`  Vector3 world position of the SPECIFIC muzzle that fired. Without
   *                  it every shot in a burst leaves from `mount.worldPosition`, the
   *                  centre of a casemate whose barrels span two hundred metres.
   *        `emitter` index into `moduleDef.muzzles`; rides out on `EV.WEAPON_FIRED`.
   *        `charge`  0..1 wind-up of a CHARGE mount. Scales damage from `CHARGE.dmgFloor`
   *                  and subsystem accuracy from `CHARGE.accFloor` up to full.
   *        `salvo`   true when the shot is part of a committed ripple; costs more heat.
   *        The controller OWNS and REUSES this object — read it, never retain it.
   */
  _fire(ship, mount, aimPoint, targetShip, powerFactor = 1, shot = null) {
    const def = mount.def;
    ship.thermal?.onShot(mount, powerFactor, shot?.salvo === true);
    const stress = mount.thermal ? mount.thermal.stress : 0;

    // An under-charged lance throws a weaker, sloppier shot rather than nothing at all.
    const q = shot?.charge ?? 1;
    const chargeDmg = q >= 1 ? 1 : CHARGE.dmgFloor + (1 - CHARGE.dmgFloor) * q;
    const chargeAcc = q >= 1 ? 1 : CHARGE.accFloor + (1 - CHARGE.accFloor) * q;

    const damage = def.damage * damageMul(mount.condition) * chargeDmg;
    const from = shot?.origin ?? mount.worldPosition;

    this.bus.emit(EV.WEAPON_FIRED, {
      ship, mount, origin: from, aimPoint, type: def.type,
      heat: mount.thermal ? mount.thermal.heat : 0,
      emitter: shot ? shot.emitter : undefined,
    });

    if (HITSCAN.has(def.type)) {
      this._resolveHitscan(ship, mount, aimPoint, targetShip, damage, stress, from, chargeAcc);
      return;
    }

    const p = this.projectiles;
    const i = p.spawn();
    if (i < 0) return;

    const dir = scratch.v3.copy(aimPoint).sub(from).normalize();
    // Dispersion: cheap weapons scatter, precision weapons do not, and a mount held
    // above its thermal soft cap scatters like a cheap one however good it is.
    const spread = (def.spread ?? 0.004) * (1 + stress * 2.4);
    dir.x += this.rng.signed() * spread;
    dir.y += this.rng.signed() * spread * 0.6;
    dir.z += this.rng.signed() * spread;
    dir.normalize();

    p.px[i] = from.x;
    p.py[i] = from.y;
    p.pz[i] = from.z;
    p.vx[i] = dir.x * def.projectileSpeed + ship.velocity.x;
    p.vy[i] = dir.y * def.projectileSpeed + ship.velocity.y;
    p.vz[i] = dir.z * def.projectileSpeed + ship.velocity.z;
    p.life[i] = def.range / def.projectileSpeed * 1.35;
    p.damage[i] = damage;
    p.kind[i] = PROJECTILE_KINDS.indexOf(def.type === 'missile' ? 'missile' : def.type === 'rail' ? 'railslug' : def.type === 'flak' ? 'flak' : def.type === 'pd' ? 'pdslug' : 'slug');
    p.faction[i] = this.factionId(ship.faction);
    p.tracking[i] = def.type === 'missile' ? (def.tracking ?? 1.2) : 0;
    p.accuracy[i] = (def.subsystemAccuracy ?? 0.65) * (1 - stress * 0.6) * chargeAcc;
    p.targetRef[i] = targetShip ?? null;
    p.subsystemRef[i] = ship.targetSubsystem ?? null;
    p.partRef[i] = ship.targetPart ?? null;
    p.sourceRef[i] = ship;
  }

  _resolveHitscan(ship, mount, aimPoint, targetShip, damage, stress, from = null, chargeAcc = 1) {
    const origin = from ?? mount.worldPosition;
    const dir = scratch.v3.copy(aimPoint).sub(origin);
    const maxDist = Math.min(dir.length(), mount.def.range);
    dir.normalize();

    let hitShip = null;
    let hitDist = maxDist;
    let hitSub = null;

    for (const other of this.world.ships) {
      if (other === ship || other.dead) continue;
      if (!this.world.areHostile(ship.faction, other.faction)) continue;
      const d = raySphere(origin, dir, other.position, other.radius);
      if (d >= 0 && d < hitDist) { hitDist = d; hitShip = other; }
    }

    const end = scratch.v2.copy(origin).addScaledVector(dir, hitDist);

    if (hitShip) {
      // Beams are precise: they hit what they were aimed at far more reliably than
      // a shell does, which is why they are the salvager's weapon.
      hitSub = ship.targetSubsystem;
      hitShip.applyDamage(damage, {
        subsystemId: hitSub,
        partId: ship.targetPart ?? null,
        point: end,
        source: ship,
        accuracy: (mount.def.subsystemAccuracy ?? 0.92) * (1 - stress * 0.6) * chargeAcc,
        rng: this.rng,
      });
      this.bus.emit(EV.PROJECTILE_IMPACT, { point: end.clone(), target: hitShip, type: mount.def.type, source: ship });
    }

    this.activeBeams.push({
      origin: origin.clone(), end: end.clone(), type: mount.def.type,
      faction: ship.faction, hit: !!hitShip,
    });
  }

  _updateProjectiles(dt) {
    const p = this.projectiles;
    for (let i = p.count - 1; i >= 0; i--) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) { p.kill(i); continue; }

      // Guided munitions steer. Everything else is ballistic and can be dodged.
      if (p.tracking[i] > 0) {
        const tgt = p.targetRef[i];
        if (tgt && !tgt.dead) {
          const dx = tgt.position.x - p.px[i];
          const dy = tgt.position.y - p.py[i];
          const dz = tgt.position.z - p.pz[i];
          const d = Math.hypot(dx, dy, dz) || 1;
          const speed = Math.hypot(p.vx[i], p.vy[i], p.vz[i]) || 1;
          const rate = p.tracking[i] * dt;
          p.vx[i] += ((dx / d) * speed - p.vx[i]) * rate;
          p.vy[i] += ((dy / d) * speed - p.vy[i]) * rate;
          p.vz[i] += ((dz / d) * speed - p.vz[i]) * rate;
        }
      }

      const nx = p.px[i] + p.vx[i] * dt;
      const ny = p.py[i] + p.vy[i] * dt;
      const nz = p.pz[i] + p.vz[i] * dt;

      // Swept test against ship spheres so fast slugs cannot tunnel through a hull.
      let hit = null;
      const srcFaction = p.faction[i];
      for (const ship of this.world.ships) {
        if (ship.dead) continue;
        if (this.factionId(ship.faction) === srcFaction) continue;
        const src = p.sourceRef[i];
        if (src && !this.world.areHostile(src.faction, ship.faction)) continue;

        scratch.v1.set(p.px[i], p.py[i], p.pz[i]);
        scratch.v2.set(nx - p.px[i], ny - p.py[i], nz - p.pz[i]);
        const segLen = scratch.v2.length();
        if (segLen < 1e-5) continue;
        scratch.v2.divideScalar(segLen);
        const d = raySphere(scratch.v1, scratch.v2, ship.position, ship.radius);
        if (d >= 0 && d <= segLen) {
          hit = { ship, point: scratch.v3.copy(scratch.v1).addScaledVector(scratch.v2, d).clone() };
          break;
        }
      }

      if (hit) {
        hit.ship.applyDamage(p.damage[i], {
          subsystemId: p.subsystemRef[i],
          partId: p.partRef[i],
          point: hit.point,
          source: p.sourceRef[i],
          accuracy: p.accuracy[i],
          rng: this.rng,
        });
        this.bus.emit(EV.PROJECTILE_IMPACT, {
          point: hit.point, target: hit.ship, type: PROJECTILE_KINDS[p.kind[i]], source: p.sourceRef[i],
        });
        p.kill(i);
        continue;
      }

      p.px[i] = nx; p.py[i] = ny; p.pz[i] = nz;
    }
  }

  /**
   * Can anything on `fromShip` currently bring fire onto this point or subsystem?
   *
   * The subsystem targeting ring greys out entries this returns false for, which is
   * the mechanism that teaches the player that facing and subsystem targeting are the
   * same problem. Without it the ring is decorative and the spatial layer never lands.
   */
  canAnyWeaponBear(fromShip, target) {
    const point = target?.worldPosition ?? target?.position ?? target;
    if (!point) return false;
    for (const m of fromShip.weapons) {
      if (!m.usable) continue;
      if (m.def.type === 'pd') continue; // point defence is not a commandable weapon
      if (m.canBear(fromShip.position, fromShip.heading, point)) return true;
    }
    return false;
  }

  /**
   * How far off bearing the nearest capable mount is, in radians, and how much of the
   * ship's armament could engage. The HUD turns this into "turn to port to open your
   * broadside" without the player having to read six separate arc wedges.
   */
  bearingReport(fromShip, target) {
    const point = target?.worldPosition ?? target?.position ?? target;
    // THE NO-TARGET RETURN CARRIES THE SAME KEYS AS THE REAL ONE. It used to be three
    // fields, and a consumer that reads `report.salvoIn` with no target selected would
    // have got `undefined` and compared it against a number — silently false, forever.
    // Two shapes out of one function is how a readout ends up lying only sometimes.
    if (!point) {
      // `total` counts commandable mounts, skipping PD, exactly as the loop below does.
      let n = 0;
      for (const m of fromShip?.weapons ?? []) if (m.def.type !== 'pd') n++;
      return {
        bearing: 0, ready: 0, hot: 0, dry: 0, total: n,
        minError: Infinity, salvoReady: 0, salvoIn: 0, side: null,
      };
    }
    let bearing = 0;
    let total = 0;
    let minError = Infinity;
    let ready = 0;
    let hot = 0;
    let dry = 0;
    for (const m of fromShip.weapons) {
      if (m.def.type === 'pd') continue;
      total++;
      if (!m.usable) {
        if (m.offlineReason === 'heat') hot++;
        continue;
      }
      const blocked = fromShip.stores ? fromShip.stores.blockedReason(m) : null;
      if (blocked === 'DRY') dry++;
      if (m.canBear(fromShip.position, fromShip.heading, point)) {
        bearing++;
        if (!blocked) ready++;
      } else {
        minError = Math.min(minError, m.arcError(fromShip.heading, point));
      }
    }
    /*
     * THE SALVO PREVIEW, published here so the HUD needs no second traversal.
     *
     *   salvoReady  slots the ripple WOULD schedule on the engaged flank right now,
     *               including the dead and frozen ones — they are part of the wave
     *   salvoIn     seconds until that count could become non-zero. 0 means "press it"
     *   side        'port' | 'starboard' | 'all' | null; which flank `salvoReady` counted
     *
     * Zero and null on any hull with no salvo controller, which is every NPC. Reading
     * them costs one WeakMap lookup on that path, so the AI's per-step call to this
     * function does not pay for a second walk of the weapon list.
     */
    let salvoReady = 0;
    let salvoIn = 0;
    let side = null;
    if (hasSalvo(fromShip)) {
      const pv = salvoPreview(fromShip, 'auto');
      salvoReady = pv.slots;
      salvoIn = pv.wait;
      side = pv.side;
    }

    // `bearing` is how many mounts can SEE it; `ready` is how many can actually shoot
    // it right now. The gap between those two numbers is the stores and heat systems
    // showing up in the one readout the player already watches.
    return {
      bearing, ready, hot, dry, total, minError: bearing > 0 ? 0 : minError,
      salvoReady, salvoIn, side,
    };
  }

  // -------------------------------------------------------------------------
  // THE SALVO COMMAND SURFACE
  //
  // `src/input/controls.js` calls these and nothing else. The controller itself lives
  // in `sim/salvo.js` and is reached through a WeakMap, so no other stream needs a
  // reference to it and `sim/ship.js` gains no field.
  //
  // `armSalvo` MUST be called before any of the rest will do anything. That is not
  // ceremony: attaching is what withholds a SALVO mount from the automatic path, so it
  // has to be an act by something that can also release it. See `salvo.js#attachSalvo`.
  // -------------------------------------------------------------------------

  /**
   * Put this hull under salvo command. Idempotent; returns true once it is.
   *
   * Called by the input layer for the player and by nothing else. An NPC that is
   * attached stops firing its cannons, because nothing will ever press the key.
   */
  armSalvo(ship) {
    if (!ship || ship.dead) return false;
    return !!attachSalvo(ship, this);
  }

  /**
   * Commit a ripple.
   *
   * @param {import('./ship.js').Ship} ship
   * @param {'port'|'starboard'|'all'|'auto'} [side]
   * @param {{immediate?: boolean}} [opts]
   * @returns {number} slots scheduled; 0 when nothing could fire
   */
  fireSalvo(ship, side = 'auto', opts = undefined) {
    if (!ship || ship.dead) return 0;
    return salvoOf(ship)?.arm(side, opts) ?? 0;
  }

  /** Begin the wind-up on every CHARGE mount. Returns how many started. */
  beginCharge(ship) {
    if (!ship || ship.dead) return 0;
    return salvoOf(ship)?.beginCharge() ?? 0;
  }

  /** Let go. Returns how many mounts actually fired; the rest aborted. */
  releaseCharge(ship) {
    return salvoOf(ship)?.releaseCharge() ?? 0;
  }

  /**
   * Poll the hold-to-charge key. Safe to call every frame from a render system: it
   * writes an intent flag and the edge is consumed inside the fixed step.
   */
  setChargeIntent(ship, held) {
    if (!ship || ship.dead) return;
    salvoOf(ship)?.wantCharge(held);
  }

  /** For the tactical overlay: every arc on a ship, as world-space wedge descriptions. */
  describeArcs(ship) {
    const out = [];
    for (const m of ship.weapons) {
      out.push({
        origin: m.worldPosition,
        centre: ship.heading + m.yawCentre + m.arcOffset,
        width: m.halfArc * 2,
        range: m.def.range,
        type: m.def.type,
        online: m.online,
        usable: m.usable,
        offlineReason: m.offlineReason,
        frozen: m.parts.traverseFrozen,
        heat: m.thermal ? m.thermal.heat : 0,
        condition: m.condition,
        blocked: ship.stores ? ship.stores.blockedReason(m) : null,
        bearing: !!(ship.target && !ship.target.dead && m.canBear(ship.position, ship.heading, ship.target.position)),
      });
    }
    return out;
  }
}
