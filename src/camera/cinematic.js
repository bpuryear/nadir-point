import * as THREE from 'three';
import { CINE, damp, dampVec } from './constants.js';
import { cameraShake } from './shake.js';
import { scratch } from '../core/world.js';

/**
 * The cinematic chase camera.
 *
 * A VIEWING MODE, not a control mode - orders still route through the tactical layer
 * while it is active, so pressing V never costs the player command authority.
 *
 * The whole trick is that aim lags position (tau 0.75 vs 0.55). That lag is the
 * cinematography: the camera arrives, then finds the ship, the way an operator would.
 * Match them and it reads as a rigid boom arm welded to the hull.
 */
export class CinematicCamera {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.active = false;
    this.subject = null;

    this.position = new THREE.Vector3();
    this.aim = new THREE.Vector3();
    this.roll = 0;
    this._t = 0;
    this._savedFov = camera.fov;

    /** The recoil heave, shared with the tactical camera. That one advances it. */
    this.shake = cameraShake(world);

    this.name = 'cinematic-camera';
    this.order = 101;
  }

  enter(subject) {
    this.subject = subject ?? this.world.player;
    if (!this.subject) return false;
    this.active = true;
    this._savedFov = this.camera.fov;
    this.camera.fov = CINE.fov;
    this.camera.updateProjectionMatrix();
    // Start where the tactical camera left off so the cut is a move, not a jump.
    this.position.copy(this.camera.position);
    this.aim.copy(this.subject.position);
    return true;
  }

  exit() {
    this.active = false;
    this.camera.fov = this._savedFov;
    this.camera.updateProjectionMatrix();
  }

  toggle(subject) {
    return this.active ? (this.exit(), false) : this.enter(subject);
  }

  update(dt) {
    if (!this.active) return;
    const s = this.subject;
    if (!s || s.dead) { this.exit(); return; }
    this._t += dt;

    const len = s.classDef?.length ?? s.radius * 2 ?? 400;
    const heading = s.heading ?? 0;
    const fwd = scratch.v1.set(Math.sin(heading), 0, Math.cos(heading));
    const right = scratch.v2.set(Math.cos(heading), 0, -Math.sin(heading));

    // Sit back, up and off to one side. The side offset is what stops it reading as
    // a rear-view mirror.
    const desired = scratch.v3.copy(s.position)
      .addScaledVector(fwd, -len * CINE.back)
      .addScaledVector(right, len * CINE.side);
    desired.y += len * CINE.up;

    // Slow handheld drift so a static shot is never actually static.
    const drift = Math.sin(this._t * Math.PI * 2 * CINE.driftHz);
    desired.addScaledVector(right, drift * len * CINE.driftAmp);
    desired.y += Math.cos(this._t * Math.PI * 2 * CINE.driftHz * 0.7) * len * CINE.driftAmp;

    dampVec(this.position, desired, CINE.tauPos, dt);

    // Aim ahead of the ship, and let the aim lag the move.
    const aimTarget = scratch.v4.copy(s.position)
      .addScaledVector(fwd, len * CINE.aimAhead);
    if (s.velocity) aimTarget.addScaledVector(s.velocity, 0.4);
    dampVec(this.aim, aimTarget, CINE.tauAim, dt);

    /**
     * Roll into the turn - AND into the guns. The tactical camera never rolls; this one
     * does, and that difference is most of what separates the two.
     *
     * THE SECOND TERM IS THE DEFECT THIS BLOCK CARRIED. It read `angularVelocity` and
     * nothing else, so the ONE camera in the game that can roll showed nothing at all
     * when a broadside fired: `PlaneBody.recoilBank` (`physics.js:229-235`) is the
     * hull's own recoil roll, `tools/flight.mjs` check 11 measures it peaking at
     * 0.03508 rad = 2.01 deg and settling to exactly zero, and `applyTo` was its only
     * reader in the whole tree. The hull rolled and the camera did not know.
     *
     * `recoilRollK` 1.35 rather than the turn's 2.2, and the SUM is clamped rather than
     * each term: recoil and a hard turn in the same second must not add up to a horizon
     * past `rollMax`, which is the number that keeps this camera watchable. At the
     * measured 2.01 deg peak this contributes 2.71 deg of camera roll against a 5.16 deg
     * ceiling (`rollMax` 0.09 rad), so a broadside taken while already banked reads as a
     * deeper lean and never as a barrel roll.
     */
    const angVel = s.body?.angularVelocity;
    const recoil = s.body?.recoilBank;
    const turnRoll = typeof angVel === 'number' ? -angVel * 2.2 : 0;
    const gunRoll = typeof recoil === 'number' ? recoil * CINE.recoilRollK : 0;
    const rollTarget = THREE.MathUtils.clamp(turnRoll + gunRoll, -CINE.rollMax, CINE.rollMax);
    // The recoil term is deliberately NOT damped on the camera's 0.8 s tau alone: the
    // hull's own roll already has a rise and a decay authored into `RECOIL`, and
    // smoothing it a second time here would turn a kick into a slow lean.
    this.roll = damp(this.roll, rollTarget, gunRoll !== 0 ? CINE.tauRollGun : 0.8, dt);

    this.camera.position.copy(this.position);
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);

    // The recoil heave, rigidly translating the eye. Same instance the tactical camera
    // uses and applied the same way - position and look target together.
    if (this.shake?.offset(this.camera, this.aim, _shakeOff)) {
      this.camera.position.add(_shakeOff);
      _cineAim.copy(this.aim).add(_shakeOff);
      this.camera.lookAt(_cineAim);
      return;
    }
    this.camera.lookAt(this.aim);
  }
}

/** Heave scratch. Allocated once at import; `update` runs every frame. */
const _shakeOff = new THREE.Vector3();
const _cineAim = new THREE.Vector3();
