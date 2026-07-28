import * as THREE from 'three';
import { CINE, damp, dampVec } from './constants.js';
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

    // Roll into the turn. The tactical camera never rolls; this one does, and that
    // difference is most of what separates the two.
    const angVel = s.body?.angularVelocity;
    const rollTarget = typeof angVel === 'number'
      ? THREE.MathUtils.clamp(-angVel * 2.2, -CINE.rollMax, CINE.rollMax)
      : 0;
    this.roll = damp(this.roll, rollTarget, 0.8, dt);

    this.camera.position.copy(this.position);
    this.camera.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.camera.lookAt(this.aim);
  }
}
