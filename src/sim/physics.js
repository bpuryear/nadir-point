import * as THREE from 'three';
import { COMBAT_PLANE_Y, SIM } from '../core/units.js';
import { scratch } from '../core/world.js';
// controls.md:1035 describes CRUISER_FEEL as "camera/controls-stream constants that
// the physics stream consumes", so this import is the documented direction. `feel.js`
// imports only `core/units.js` and `core/contracts.js`, neither of which imports
// anything at all, so there is no cycle and no bundle cost.
import { CRUISER_FEEL } from '../camera/feel.js';

/**
 * Motion.
 *
 * Two body types, deliberately different:
 *
 *   PLANE-LOCKED bodies (capital ships) live on y = 0 and have one rotational degree
 *   of freedom, yaw. This is not a simplification for its own sake - firing arcs are
 *   the primary combat skill in this game, and an arc is unreadable on a sphere.
 *
 *   FREE bodies (strike craft, missiles, debris, wreck chunks) use the whole volume.
 *   They are what make the plane feel like it sits inside something.
 *
 * The capital ship model is assisted flight, not Newtonian drift. A pure vacuum
 * integrator gives you a ship that is either uncontrollable or has to be flown with
 * retro-burns, and neither reads as "a captain giving orders to a crew". What we want
 * is mass that you can feel: commands are requests, the hull takes seconds to comply,
 * and momentum carries you past the point you asked for.
 */

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Recoil, as a purely ROTATIONAL tell. (Cross-stream block, landed here for armament.)
 *
 * `docs/design/firing-feel.md` §5.2 asks for a lateral shove on the hull when a
 * broadside fires. That term is provably inert against this file: `integrate` is a
 * velocity SERVO, not a force integrator. It computes `diff = target - velocity` where
 * `target` is a PURE FORWARD vector, clamps `diff` to `maxDv`, and adds it — so any
 * lateral component of `velocity` is overwritten before the 0.55/s lateral bleed below
 * ever sees it. Measured headless at rest, half throttle and flank: peak |vx| =
 * 0.000e+0 m/s, net lateral displacement 0.000 m.
 *
 * So the recoil couples through the cosmetic bank channel and through nothing else.
 * NOTHING MAY BE ADDED TO `body.velocity`: it would be deleted on the same step, and
 * if it ever survived, `stores.js` bills propellant against measured velocity change,
 * so a shove that ran after the ships system (order 60) would be billed as thrust.
 *
 *   bank      radians of roll per shot, before the damage/300 scale the caller applies
 *   rise      1/s. Rate at which a kick is delivered into the bank. A kick of `b`
 *             radians delivers EXACTLY `b` in total (the rate decays at `rise`, and
 *             the integral of `b*rise*e^{-rise*t}` is `b`), spread over ~1/14 s so a
 *             single step never snaps the hull.
 *   bankDecay 1/s. Rate the accumulated roll bleeds back to zero.
 *   bankCap   radians. Ceiling, so a 20-slot ripple cannot roll the hull onto its side.
 *
 * For scale: the cosmetic turn bank reaches CRUISER_FEEL.bankMax = 0.12 rad (6.9 deg),
 * and a four-gun broadside accumulates 0.012 * 1.133 * (1 + e^-0.242 + e^-0.484 +
 * e^-0.726) = 0.039 rad = 2.25 deg — about 30% of a hard turn, in the right channel.
 */
export const RECOIL = {
  bank: 0.012,
  rise: 14.0,
  bankDecay: 2.2,
  bankCap: 0.075,
};

/**
 * Cosmetic turn bank. Read off CRUISER_FEEL rather than restated as bare literals —
 * the previous 0.13 and the `min(1, dt*1.6)` lerp were the only two numbers in this
 * file that no document could be checked against.
 */
const BANK_MAX = CRUISER_FEEL.bankMax;
const BANK_TAU = CRUISER_FEEL.bankTau;

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Yaw of a direction vector, measured from +Z (ship forward), CCW looking down. */
export function yawOf(x, z) {
  return Math.atan2(x, z);
}

export class PlaneBody {
  /**
   * @param {Object} spec
   * @param {number} spec.mass         tonnes; read ONLY by `resolveCollisions`, which
   *                                   has no callers — see the note on that function
   * @param {number} spec.maxSpeed     m/s
   * @param {number} spec.accel        m/s^2 forward
   * @param {number} spec.turnRate     rad/s at rest
   * @param {number} [spec.retroAccel] m/s^2 braking; defaults to `accel` (symmetric)
   * @param {number} [spec.angAccel]   rad/s^2 yaw spool; defaults to `maxRate * 2.4`
   * @param {number} [spec.radius]     collision radius, metres
   */
  constructor(spec) {
    this.mass = spec.mass ?? 1000;
    this.maxSpeed = spec.maxSpeed ?? 140;
    this.accel = spec.accel ?? 14;
    this.turnRate = spec.turnRate ?? 0.22;
    this.radius = spec.radius ?? 200;

    /**
     * Optional per-class handling, both defaulting to null so an undeclared class is
     * BIT-IDENTICAL to the behaviour before they existed.
     *
     * `angAccel` in particular must never become a global constant: controls.md:1063
     * declares a flat 0.030 rad/s^2, which measured against the 13 registered classes
     * gives coalition_corvette an 18.4 s yaw spool and coalition_strikecraft a 76.0 s
     * one. Every escort in the game would stop being able to turn.
     */
    this.retroAccel = spec.retroAccel ?? null;
    this.angAccel = spec.angAccel ?? null;

    this.position = new THREE.Vector3(0, COMBAT_PLANE_Y, 0);
    this.velocity = new THREE.Vector3();
    this.heading = 0;           // yaw, radians, 0 = +Z
    this.angularVelocity = 0;

    /** Throttle 0..1 requested by the order layer. */
    this.throttle = 0;
    /** Desired heading the steering controller is chasing. */
    this.desiredHeading = 0;
    /** Visual bank angle, purely cosmetic, driven by angular velocity. */
    this.bank = 0;
    /**
     * Recoil roll, and the rate feeding it. Written by the salvo controller through
     * `recoilKick()`, read only by `applyTo`. Cosmetic, like `bank`.
     */
    this.recoilBank = 0;
    this.recoilRate = 0;

    /** Multipliers the power routing and damage systems write into. */
    this.engineEfficiency = 1;  // 0..1.5, from power routing and engine subsystem health
    this.steeringEfficiency = 1;

    this._forward = new THREE.Vector3(0, 0, 1);
  }

  get speed() {
    return this.velocity.length();
  }

  /** Forward unit vector for the current heading. Reused buffer - copy if you keep it. */
  forward() {
    return this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /**
   * Turn rate degrades with speed. This one line is most of why the ship reads as
   * kilometres long: a stationary cruiser can pivot, a cruiser at flank speed
   * carves a wide arc and cannot cut a corner. It also makes "kill the engines,
   * then circle at leisure" a real tactic rather than a slogan.
   *
   * The coefficient is CRUISER_FEEL.turnFalloff: 0.72 makes the flank/rest ratio
   * exactly 0.28, which is what controls.md:1202's verification row asks for. The
   * exponent stays 2 — controls.md §6.3 argues for 1.35 against exp 1.0, but the
   * baseline here is exp 2.0, so adopting 1.35 would make the 25-50% positioning band
   * WORSE (multiplier 0.9550 -> 0.8892 at 25%, 0.8200 -> 0.7175 at 50%), the opposite
   * of what its own paragraph argues for. It also keeps acceptance.md:64's sentence
   * "degrades with the square of speed" literally true.
   *
   * This constant is shared with all 11 registered capital NPC classes. A/B measured
   * headless over 8 seeds x 600 s of real ShipAI combat, ships made invulnerable so
   * both runs keep the same population (56,205 / 57,600 samples): mean order-lag
   * 9.881 deg at 0.62 vs 9.923 deg at 0.72, mean broadside-bearing 40.8% vs 39.4%,
   * both inside the per-seed spread (4.2-20.2 deg, 27.6-53.8%). Note the AI does NOT
   * sit at the 0.26-0.40 throttle its PROFILE table suggests: measured mean throttle
   * is 0.54, with 9-13% of samples at flank.
   */
  effectiveTurnRate() {
    const speedFrac = Math.min(1, this.speed / this.maxSpeed);
    const degraded = 1 - 0.72 * speedFrac * speedFrac;
    return this.turnRate * degraded * this.steeringEfficiency;
  }

  /**
   * Seconds to come to a stop from the current speed at full retro authority.
   *
   * This MUST use `retroAccel`, not `accel`. `MoveController.update` budgets its brake
   * point from `stoppingDistance()`, so with retro 5.5 against accel 8.0 an unfixed
   * version under-predicts the brake distance by 45% and the ship sails past every
   * move marker: measured 413 m of overshoot on a 12 km order, against 219 m when
   * this reads `retroAccel`. Nothing else in the tree would catch it — smoke passes,
   * selftest passes.
   */
  stoppingTime() {
    return this.speed / Math.max(1e-3, (this.retroAccel ?? this.accel) * this.engineEfficiency);
  }

  /** Distance covered while stopping. Used by the move controller to stop on target. */
  stoppingDistance() {
    const t = this.stoppingTime();
    return 0.5 * this.speed * t;
  }

  integrate(dt) {
    // --- rotation -------------------------------------------------------------
    const maxRate = this.effectiveTurnRate();
    const delta = angleDelta(this.heading, this.desiredHeading);

    // Angular acceleration toward the target rate, so heading changes ease in and out
    // instead of snapping to full rate. A capital ship cannot begin turning instantly
    // any more than it can begin moving instantly.
    // A declared angAccel makes the loop UNDER-damped, which is the point: the P gain
    // below stays 1.9 while the decel arc grows to w0^2/(2*angAccel), so an ordered
    // heading is overshot and settled back into. controls.md:1093-1096 asks for that
    // explicitly ("Ship the overshoot"); measured 6.24 deg for the player cruiser and
    // 0.00 deg for every class that leaves this at the default.
    const angAccel = this.angAccel ?? maxRate * 2.4;
    const desiredRate = THREE.MathUtils.clamp(delta * 1.9, -maxRate, maxRate);
    const rateDelta = desiredRate - this.angularVelocity;
    this.angularVelocity += THREE.MathUtils.clamp(rateDelta, -angAccel * dt, angAccel * dt);
    this.heading += this.angularVelocity * dt;

    // Cosmetic bank into the turn. Reads as mass without affecting the sim. The
    // exponential form is frame-rate independent; the `min(1, dt*1.6)` lerp it replaced
    // had an effective tau of 0.617 s at the fixed 1/60 step and a different one at any
    // other step. CRUISER_FEEL.bankTau 1.4 s is the lag controls.md:1181 calls "the
    // tonnage". Nothing reads `bank` except `applyTo`.
    const targetBank = THREE.MathUtils.clamp(-this.angularVelocity / Math.max(1e-3, this.turnRate), -1, 1) * BANK_MAX;
    this.bank += (targetBank - this.bank) * (1 - Math.exp(-dt / BANK_TAU));

    // Recoil roll: rate decays at RECOIL.rise, bank at RECOIL.bankDecay, so one kick
    // of `b` radians delivers exactly `b` and then bleeds off. Purely visual.
    if (this.recoilRate !== 0 || this.recoilBank !== 0) {
      this.recoilBank += this.recoilRate * dt;
      this.recoilRate *= Math.exp(-RECOIL.rise * dt);
      this.recoilBank *= Math.exp(-RECOIL.bankDecay * dt);
      this.recoilBank = THREE.MathUtils.clamp(this.recoilBank, -RECOIL.bankCap, RECOIL.bankCap);
      if (Math.abs(this.recoilRate) < 1e-6) this.recoilRate = 0;
      if (Math.abs(this.recoilBank) < 1e-6) this.recoilBank = 0;
    }

    // --- translation ----------------------------------------------------------
    const fwd = this.forward();
    const targetSpeed = this.maxSpeed * this.throttle * this.engineEfficiency;
    const target = scratch.v1.copy(fwd).multiplyScalar(targetSpeed);

    // Approach the target velocity at bounded acceleration. The gap between the
    // velocity we have and the velocity we asked for IS the feeling of displacement.
    //
    // Braking is a separate authority from accelerating: a hull that stops as hard as
    // it starts does not read as heavy. `retroAccel` defaults to `accel`, so a class
    // that does not declare it integrates identically to before.
    const diff = scratch.v2.copy(target).sub(this.velocity);
    const braking = target.lengthSq() < this.velocity.lengthSq();
    const authority = braking ? (this.retroAccel ?? this.accel) : this.accel;
    const maxDv = authority * this.engineEfficiency * dt;
    if (diff.lengthSq() > maxDv * maxDv) diff.setLength(maxDv);
    this.velocity.add(diff);

    // Lateral drift bleeds off slowly, so a hard turn visibly slides. Weak on purpose:
    // kill this and the ship snaps onto its new heading like a cursor.
    const alongF = this.velocity.dot(fwd);
    const lateral = scratch.v3.copy(this.velocity).addScaledVector(fwd, -alongF);
    lateral.multiplyScalar(Math.max(0, 1 - 0.55 * dt));
    this.velocity.copy(fwd).multiplyScalar(alongF).add(lateral);

    this.position.addScaledVector(this.velocity, dt);
    this.position.y = COMBAT_PLANE_Y;
  }

  /** Point the steering controller at a world position. */
  faceTowards(point) {
    this.desiredHeading = yawOf(point.x - this.position.x, point.z - this.position.z);
  }

  /**
   * One gun fired. Rolls the hull away from the muzzle.
   *
   * @param {number} radians  signed roll to deliver in total; sign is the flank
   *                          (positive rolls one way, negative the other). The salvo
   *                          controller supplies `RECOIL.bank * damage / 300 * side`.
   *
   * MUST be called BEFORE the ships system (order 60) so the kick is integrated on the
   * same step it was ordered. It touches no velocity, so `stores.js` bills nothing.
   */
  recoilKick(radians) {
    this.recoilRate += radians * RECOIL.rise;
  }

  /** Write this body's state onto a three.js object. */
  applyTo(object3D) {
    object3D.position.copy(this.position);
    object3D.rotation.set(0, this.heading, this.bank + this.recoilBank, 'YXZ');
  }
}

/**
 * Free bodies: strike craft, missiles, tumbling wreckage. Full six degrees of freedom,
 * integrated with quaternions so nothing gimbal-locks when a chunk tumbles end over end.
 */
export class FreeBody {
  constructor(spec = {}) {
    this.mass = spec.mass ?? 8;
    this.maxSpeed = spec.maxSpeed ?? 420;
    this.accel = spec.accel ?? 260;
    this.turnRate = spec.turnRate ?? 2.6;
    this.radius = spec.radius ?? 9;

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.angularVelocity = new THREE.Vector3(); // rad/s in world space
    this.angularDamping = spec.angularDamping ?? 0;
    this.linearDamping = spec.linearDamping ?? 0;

    this._fwd = new THREE.Vector3();
  }

  forward() {
    return this._fwd.set(0, 0, 1).applyQuaternion(this.quaternion);
  }

  /** Steer toward a point and run the throttle up. Used by strike craft and missiles. */
  seek(point, dt, throttle = 1) {
    const toTarget = scratch.v1.copy(point).sub(this.position);
    const dist = toTarget.length();
    if (dist < 1e-3) return dist;
    toTarget.divideScalar(dist);

    const desired = scratch.q1.setFromUnitVectors(scratch.v2.set(0, 0, 1), toTarget);
    // Rotate toward the desired orientation at a bounded rate.
    const maxStep = this.turnRate * dt;
    this.quaternion.rotateTowards(desired, maxStep);

    const fwd = this.forward();
    const target = scratch.v3.copy(fwd).multiplyScalar(this.maxSpeed * throttle);
    const diff = scratch.v4.copy(target).sub(this.velocity);
    const maxDv = this.accel * dt;
    if (diff.lengthSq() > maxDv * maxDv) diff.setLength(maxDv);
    this.velocity.add(diff);
    return dist;
  }

  integrate(dt) {
    if (this.linearDamping) this.velocity.multiplyScalar(Math.max(0, 1 - this.linearDamping * dt));
    this.position.addScaledVector(this.velocity, dt);

    const av = this.angularVelocity;
    if (av.lengthSq() > 1e-10) {
      const angle = av.length() * dt;
      scratch.q1.setFromAxisAngle(scratch.v1.copy(av).normalize(), angle);
      this.quaternion.premultiply(scratch.q1).normalize();
      if (this.angularDamping) av.multiplyScalar(Math.max(0, 1 - this.angularDamping * dt));
    }
  }

  applyTo(object3D) {
    object3D.position.copy(this.position);
    object3D.quaternion.copy(this.quaternion);
  }
}

/**
 * Move-order controller for plane-locked ships.
 *
 * Deliberately dumb about pathfinding and deliberately careful about arrival. It
 * turns toward the destination, runs the throttle up, and starts shedding speed early
 * enough that the ship coasts to a halt roughly on the marker instead of braking hard
 * at the last second. Overshoot is allowed and expected on a tight approach - that is
 * the ship telling you it is heavy.
 */
export class MoveController {
  constructor(body) {
    this.body = body;
    this.target = new THREE.Vector3();
    this.active = false;
    this.arrivalRadius = 0;
    /** Set by an order that wants a specific final heading (docking, broadside setup). */
    this.finalHeading = null;
  }

  order(point, arrivalRadius = 0) {
    this.target.copy(point);
    this.target.y = COMBAT_PLANE_Y;
    this.active = true;
    this.arrivalRadius = arrivalRadius;
    this.finalHeading = null;
  }

  cancel() {
    this.active = false;
    this.body.throttle = 0;
  }

  update(dt) {
    const b = this.body;
    if (!this.active) {
      // No order: the crew holds station. Throttle zero means the assisted-flight
      // model brakes toward rest rather than drifting forever - a ship you have to
      // manually null out after every order is a flight sim, not a command game.
      // It still takes ~10 s to shed cruise speed, so the momentum is not free.
      b.throttle = 0;
      return;
    }

    const to = scratch.v1.copy(this.target).sub(b.position);
    to.y = 0;
    const dist = to.length();

    if (dist <= Math.max(this.arrivalRadius, b.radius * 0.35) && b.speed < b.maxSpeed * 0.06) {
      this.active = false;
      b.throttle = 0;
      if (this.finalHeading !== null) b.desiredHeading = this.finalHeading;
      return;
    }

    b.desiredHeading = yawOf(to.x, to.z);

    // Do not pour on thrust while badly misaligned - a capital ship that accelerates
    // hard through a 140 degree turn slews sideways and looks like it is on ice.
    const misalign = Math.abs(angleDelta(b.heading, b.desiredHeading));
    const alignment = Math.max(0, Math.cos(misalign));

    const braking = b.stoppingDistance() + b.speed * 0.35;
    const approach = dist < braking ? THREE.MathUtils.clamp(dist / Math.max(1, braking), 0, 1) : 1;

    b.throttle = alignment * alignment * approach;
  }
}

/**
 * Broad-phase collision for the handful of large bodies that matter. At this entity
 * count a uniform grid is a rounding error against the pair test, so we keep it simple
 * and spend the budget on making the response feel right instead.
 *
 * Capital ships do not bounce. They shoulder each other aside and both lose way -
 * an elastic response on a million-tonne hull reads as a bug every time.
 *
 * MEASURED, THIS SESSION: THIS FUNCTION HAS NO CALLERS.
 * `grep -rn "resolveCollisions" src tools` returns one hit, this definition. Nothing
 * imports it, no system iterates bodies for overlap, and no `onImpact` consumer exists
 * anywhere in the tree. Two consequences that were being reasoned about as if they were
 * live, and are not:
 *
 *   - Raising the player hull's mass cannot make ramming dominant, because there is no
 *     ram: `onImpact` passes `(a, b, |closing|, nx, ny, nz)` and nobody receives it.
 *   - "A 1.4 km hull gets shoved around by 480 m destroyers" is not happening either.
 *     `PlaneBody.mass` is read here and nowhere else in `src/`.
 *
 * Leaving it in place: it is correct code and the response model is the one this game
 * wants. But nobody may cite it as live behaviour until something calls it, and
 * whoever wires it up must pass mass through to `onImpact` before a damage model reads
 * closing speed alone.
 */
export function resolveCollisions(bodies, onImpact = null) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a || a.noCollide) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b || b.noCollide) continue;

      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;
      const rsum = a.radius + b.radius;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rsum * rsum || d2 < 1e-6) continue;

      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const overlap = rsum - d;

      // Separate proportionally to inverse mass.
      const ma = a.mass, mb = b.mass;
      const total = ma + mb;
      const pushA = (mb / total) * overlap;
      const pushB = (ma / total) * overlap;
      a.position.x -= nx * pushA; a.position.y -= ny * pushA; a.position.z -= nz * pushA;
      b.position.x += nx * pushB; b.position.y += ny * pushB; b.position.z += nz * pushB;

      // Kill the closing component of relative velocity, keep the tangential part.
      const rvx = b.velocity.x - a.velocity.x;
      const rvy = b.velocity.y - a.velocity.y;
      const rvz = b.velocity.z - a.velocity.z;
      const closing = rvx * nx + rvy * ny + rvz * nz;
      if (closing < 0) {
        const restitution = 0.08; // almost none - this is a shove, not a bounce
        const impulse = (-(1 + restitution) * closing) / (1 / ma + 1 / mb);
        a.velocity.x -= (impulse / ma) * nx;
        a.velocity.y -= (impulse / ma) * ny;
        a.velocity.z -= (impulse / ma) * nz;
        b.velocity.x += (impulse / mb) * nx;
        b.velocity.y += (impulse / mb) * ny;
        b.velocity.z += (impulse / mb) * nz;

        onImpact?.(a, b, Math.abs(closing), nx, ny, nz);
      }

      if (a.position.y !== undefined && a.planeLocked) a.position.y = COMBAT_PLANE_Y;
      if (b.position.y !== undefined && b.planeLocked) b.position.y = COMBAT_PLANE_Y;
    }
  }
}

/** Ray/sphere test used by subsystem targeting and hitscan weapons. */
export function raySphere(origin, dir, centre, radius) {
  const ox = centre.x - origin.x;
  const oy = centre.y - origin.y;
  const oz = centre.z - origin.z;
  const proj = ox * dir.x + oy * dir.y + oz * dir.z;
  if (proj < 0) return -1;
  const d2 = ox * ox + oy * oy + oz * oz - proj * proj;
  const r2 = radius * radius;
  if (d2 > r2) return -1;
  return proj - Math.sqrt(r2 - d2);
}

/**
 * Lead a moving target for a projectile of finite speed. Returns the intercept point
 * or null when the projectile is simply too slow to catch it. Used by turret aiming
 * and by the AI, so a fast corvette genuinely is hard to hit with a slow mass driver.
 */
export function interceptPoint(shooterPos, projectileSpeed, targetPos, targetVel, out) {
  if (!Number.isFinite(projectileSpeed)) return out.copy(targetPos); // hitscan

  const rx = targetPos.x - shooterPos.x;
  const ry = targetPos.y - shooterPos.y;
  const rz = targetPos.z - shooterPos.z;

  const a = targetVel.lengthSq() - projectileSpeed * projectileSpeed;
  const b = 2 * (rx * targetVel.x + ry * targetVel.y + rz * targetVel.z);
  const c = rx * rx + ry * ry + rz * rz;

  let t;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return out.copy(targetPos);
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    t = Math.min(t1, t2);
    if (t < 0) t = Math.max(t1, t2);
    if (t < 0) return null;
  }

  return out.set(
    targetPos.x + targetVel.x * t,
    targetPos.y + targetVel.y * t,
    targetPos.z + targetVel.z * t,
  );
}

export const PHYSICS_STEP = SIM.dt;
