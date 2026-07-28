import * as THREE from 'three';
import { EV } from '../core/events.js';
import { scratch } from '../core/world.js';
import { interceptPoint, raySphere } from './physics.js';

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
      this.sourceRef[i] = this.sourceRef[last];
    }
    this.targetRef[last] = null;
    this.subsystemRef[last] = null;
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
      this._updateShipWeapons(ship, dt);
    }
    this._updateProjectiles(dt);
  }

  _updateShipWeapons(ship, dt) {
    const target = ship.target;
    const hasTarget = target && !target.dead;

    for (const mount of ship.weapons) {
      if (!mount.online) continue;

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
      if (!mount.canBear(ship.position, ship.heading, lead)) continue;
      if (!onTarget) continue;

      // Weapons draw from the power pool. Starve them and they fire slowly.
      const powerFactor = ship.power.unlocked ? Math.max(0.25, ship.power.factor('weapons')) : 1;

      if (mount.burstRemaining > 0) {
        if (mount.burstTimer <= 0) {
          this._fire(ship, mount, lead, aimShip);
          mount.burstRemaining--;
          mount.burstTimer = mount.def.burstInterval / powerFactor;
        }
      } else if (mount.cooldown <= 0) {
        mount.burstRemaining = mount.def.shotsPerBurst;
        mount.burstTimer = 0;
        mount.cooldown = mount.def.cooldown / powerFactor;
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

  _fire(ship, mount, aimPoint, targetShip) {
    const def = mount.def;
    this.bus.emit(EV.WEAPON_FIRED, {
      ship, mount, origin: mount.worldPosition, aimPoint, type: def.type,
    });

    if (HITSCAN.has(def.type)) {
      this._resolveHitscan(ship, mount, aimPoint, targetShip);
      return;
    }

    const p = this.projectiles;
    const i = p.spawn();
    if (i < 0) return;

    const dir = scratch.v3.copy(aimPoint).sub(mount.worldPosition).normalize();
    // Dispersion: cheap weapons scatter, precision weapons do not.
    const spread = def.spread ?? 0.004;
    dir.x += this.rng.signed() * spread;
    dir.y += this.rng.signed() * spread * 0.6;
    dir.z += this.rng.signed() * spread;
    dir.normalize();

    p.px[i] = mount.worldPosition.x;
    p.py[i] = mount.worldPosition.y;
    p.pz[i] = mount.worldPosition.z;
    p.vx[i] = dir.x * def.projectileSpeed + ship.velocity.x;
    p.vy[i] = dir.y * def.projectileSpeed + ship.velocity.y;
    p.vz[i] = dir.z * def.projectileSpeed + ship.velocity.z;
    p.life[i] = def.range / def.projectileSpeed * 1.35;
    p.damage[i] = def.damage;
    p.kind[i] = PROJECTILE_KINDS.indexOf(def.type === 'missile' ? 'missile' : def.type === 'rail' ? 'railslug' : def.type === 'flak' ? 'flak' : def.type === 'pd' ? 'pdslug' : 'slug');
    p.faction[i] = this.factionId(ship.faction);
    p.tracking[i] = def.type === 'missile' ? (def.tracking ?? 1.2) : 0;
    p.accuracy[i] = def.subsystemAccuracy ?? 0.65;
    p.targetRef[i] = targetShip ?? null;
    p.subsystemRef[i] = ship.targetSubsystem ?? null;
    p.sourceRef[i] = ship;
  }

  _resolveHitscan(ship, mount, aimPoint, targetShip) {
    const origin = mount.worldPosition;
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
      hitShip.applyDamage(mount.def.damage, {
        subsystemId: hitSub,
        point: end,
        source: ship,
        accuracy: mount.def.subsystemAccuracy ?? 0.92,
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
      if (!m.online) continue;
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
    if (!point) return { bearing: 0, total: 0, minError: Infinity };
    let bearing = 0;
    let total = 0;
    let minError = Infinity;
    for (const m of fromShip.weapons) {
      if (!m.online || m.def.type === 'pd') continue;
      total++;
      if (m.canBear(fromShip.position, fromShip.heading, point)) bearing++;
      else minError = Math.min(minError, m.arcError(fromShip.heading, point));
    }
    return { bearing, total, minError: bearing > 0 ? 0 : minError };
  }

  /** For the tactical overlay: every arc on a ship, as world-space wedge descriptions. */
  describeArcs(ship) {
    const out = [];
    for (const m of ship.weapons) {
      out.push({
        origin: m.worldPosition,
        centre: ship.heading + m.yawCentre,
        width: m.yawWidth,
        range: m.def.range,
        type: m.def.type,
        online: m.online,
        bearing: !!(ship.target && !ship.target.dead && m.canBear(ship.position, ship.heading, ship.target.position)),
      });
    }
    return out;
  }
}
