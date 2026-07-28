import * as THREE from 'three';
import { CAMERA } from '../core/units.js';
import { ORBIT, damp, dampVec, smoothstep, smootherstep, shortestArc } from './constants.js';

/**
 * The tactical camera.
 *
 * Detached, never anchored to the hull, orbiting a focus point on the combat plane.
 * Three rules carry the whole thing, and all three come from the acceptance criterion
 * "no input that requires the player to fight the camera":
 *
 *   1. A mouse drag is applied DIRECTLY. No smoothing, no acceleration, no flick
 *      momentum. Smoothed drag is the single most common reason an RTS camera feels
 *      like it is arguing with you.
 *   2. Zoom lives in log space. A constant ratio per notch is a constant perceived
 *      rate, so the same wheel flick feels the same at 260 m and at 46 km.
 *   3. The camera only changes pitch when the player operates the zoom - the control
 *      whose entire job is changing framing. It never re-frames in response to
 *      translation, which is what made Homeworld 3's auto-elevation read as hostile.
 */
export class TacticalCamera {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;

    this.focus = new THREE.Vector3(0, 0, 0);
    this._focusTarget = new THREE.Vector3(0, 0, 0);
    this.yaw = 0.7;
    this.pitchOffset = ORBIT.defaultPitchOffset;
    this.zoomT = 0.42;
    this._zoomTTarget = 0.42;
    this._yawTarget = 0.7;
    this._pitchTarget = ORBIT.defaultPitchOffset;

    /** 'FREE' | 'LOCKED' */
    this.mode = 'LOCKED';
    this.lockTarget = null;

    this.sensScale = 1;
    this.enabled = true;

    this._snap = null;
    this._idleTime = 0;
    this._dragging = false;

    this.name = 'tactical-camera';
    this.order = 100;
  }

  // --- derived quantities ---------------------------------------------------

  /**
   * Minimum distance scales with what you are looking at. CAMERA.minDistance is right
   * for a fighter and puts you INSIDE a 1400 m cruiser, so the floor is per-target.
   */
  softMinDistance() {
    const r = this.lockTarget?.radius ?? this.world.player?.radius ?? 0;
    return Math.max(CAMERA.minDistance, r * ORBIT.minDistRadiusK);
  }

  /**
   * The far end of the zoom is an ABSOLUTE distance, not a multiple of the near end.
   *
   * The obvious formulation - softMin * exp(zoomT * lnZoomRange) - is wrong, and
   * wrong in a way that looks fine until you actually zoom out. lnZoomRange is the
   * ratio between the two constants in units.js (177x). Multiplying that ratio by a
   * per-target floor scales the CEILING as well: focusing the 1400 m cruiser raises
   * the floor to 1330 m and therefore pushes maximum zoom to 235 km rather than the
   * intended 46 km, where the ship is about six pixels tall. The "cruiser is a bright
   * speck against the gas giant" shot came out as an empty frame.
   *
   * So the range is recomputed per target: the floor scales with what you are looking
   * at, the ceiling does not move.
   */
  zoomRange() {
    const softMin = this.softMinDistance();
    const max = Math.max(softMin * 2, CAMERA.maxDistance);
    return { softMin, max, ln: Math.log(max / softMin) };
  }

  get distance() {
    const { softMin, ln } = this.zoomRange();
    return softMin * Math.exp(THREE.MathUtils.clamp(this.zoomT, 0, 1) * ln);
  }

  /** The floor rises with zoom: 3.4 degrees is usable up close and unreadable at 46 km. */
  pitchFloor(zoomT = this.zoomT) {
    return CAMERA.minPitch + (ORBIT.pitchFloorMax - CAMERA.minPitch)
      * smoothstep(ORBIT.pitchFloorT0, ORBIT.pitchFloorT1, zoomT);
  }

  get pitch() {
    return THREE.MathUtils.clamp(this.pitchFloor() + this.pitchOffset, CAMERA.minPitch, CAMERA.maxPitch);
  }

  /** 0 while the 3D view is live; ramps to 1 across the strategic overlay band. */
  get strategicBlend() {
    return smoothstep(ORBIT.strategicT0, ORBIT.strategicT1, this._zoomTTarget);
  }

  // --- input entry points ---------------------------------------------------

  /** Orbit drag. Applied directly - see rule 1. */
  orbit(dxPx, dyPx) {
    this._cancelSnap();
    this._idleTime = 0;
    this.yaw -= dxPx * ORBIT.yawSensRadPerPx * this.sensScale;
    const dy = (ORBIT.invertY ? -dyPx : dyPx) * ORBIT.pitchSensRadPerPx * this.sensScale;
    this.pitchOffset = THREE.MathUtils.clamp(this.pitchOffset + dy, 0, CAMERA.maxPitch - this.pitchFloor());
    this._yawTarget = this.yaw;
    this._pitchTarget = this.pitchOffset;
  }

  /**
   * @param {number} notches   wheel notches, positive zooms out
   * @param {THREE.Vector3|null} cursorPlanePoint  where the cursor hits the combat plane
   */
  zoom(notches, cursorPlanePoint = null, modifier = 'none') {
    this._cancelSnap();
    this._idleTime = 0;
    const scale = modifier === 'fine' ? ORBIT.fineScale : modifier === 'coarse' ? ORBIT.coarseScale : 1;
    const before = this._zoomTTarget;
    this._zoomTTarget = THREE.MathUtils.clamp(
      this._zoomTTarget + notches * ORBIT.stepT * scale, 0, ORBIT.strategicT1,
    );

    // Zoom to cursor, one directionally. Bidirectional bias makes the focus drift and
    // is a well known source of "where did my ship go".
    const zoomingIn = this._zoomTTarget < before;
    const bias = zoomingIn ? ORBIT.cursorBiasIn : ORBIT.cursorBiasOut;
    if (bias > 0 && cursorPlanePoint) {
      this.mode = 'FREE';
      this._focusTarget.lerp(cursorPlanePoint, bias * Math.abs(notches));
      this._focusTarget.y = 0;
    }
  }

  /** Screen-exact drag pan. Unsmoothed, because screen-exact means unsmoothed. */
  pan(dxPx, dyPx, viewportHeight) {
    this._cancelSnap();
    this._idleTime = 0;
    this.mode = 'FREE';

    // Convert pixels to world metres at the focus plane.
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const worldPerPx = (2 * Math.tan(vFov * 0.5) * this.distance) / viewportHeight;

    // At a grazing pitch the plane runs away toward the horizon; clamp so a pan near
    // the horizon does not throw the focus to infinity.
    const sinPitch = Math.max(ORBIT.grazingSinClamp, Math.sin(this.pitch));

    const right = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const fwd = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);

    const wx = -dxPx * worldPerPx;
    const wz = (dyPx * worldPerPx) / sinPitch;

    this._focusTarget.x += right * wx + fwd * wz;
    this._focusTarget.z += rightZ * wx + fwdZ * wz;
    this._focusTarget.y = 0;
    this.focus.copy(this._focusTarget);
  }

  keyPan(x, z, dt, modifier = 'none') {
    if (x === 0 && z === 0) return;
    this._cancelSnap();
    this._idleTime = 0;
    this.mode = 'FREE';
    const mul = modifier === 'fast' ? ORBIT.panFastMul : modifier === 'slow' ? ORBIT.panSlowMul : 1;
    const rate = ORBIT.keyPanRate * this.distance * mul * dt;
    const right = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const fwd = Math.sin(this.yaw), fwdZ = Math.cos(this.yaw);
    this._focusTarget.x += (right * x + fwd * z) * rate;
    this._focusTarget.z += (rightZ * x + fwdZ * z) * rate;
    this._focusTarget.y = 0;
  }

  keyYaw(dir, dt) {
    if (!dir) return;
    this._cancelSnap();
    this._idleTime = 0;
    this._yawTarget += dir * ORBIT.keyYawRate * dt;
  }

  /**
   * Hard snap to an entity. 450 ms of smootherstep, distance interpolated in log
   * space so a 260 m to 46 km move does not begin as a rocket launch.
   */
  snapTo(entity, { durationMs = ORBIT.snapMs, zoomT = null } = {}) {
    if (!entity) return;
    this._snap = {
      t: 0,
      duration: durationMs / 1000,
      fromFocus: this.focus.clone(),
      fromYaw: this.yaw,
      fromZoomT: this._zoomTTarget,
      toZoomT: zoomT ?? Math.min(this._zoomTTarget, 0.5),
      entity,
    };
  }

  snapToPlayer(opts) {
    this.snapTo(this.world.player, opts);
  }

  /** Any camera input during a snap cancels it that frame. Never fight the player. */
  _cancelSnap() {
    if (!this._snap) return;
    this._snap = null;
  }

  // --- per-frame ------------------------------------------------------------

  update(dt) {
    if (!this.enabled) return;
    this._idleTime += dt;

    if (this._snap) {
      const s = this._snap;
      s.t += dt;
      const k = smootherstep(s.t / s.duration);
      const dest = s.entity.position ?? s.entity;
      this.focus.lerpVectors(s.fromFocus, dest, k);
      this.focus.y = 0;
      this._focusTarget.copy(this.focus);
      // Yaw takes the shortest arc; zoom interpolates in log space.
      this.yaw = s.fromYaw + shortestArc(s.fromYaw, this._yawTarget) * 0;
      this._zoomTTarget = s.fromZoomT + (s.toZoomT - s.fromZoomT) * k;
      this.zoomT = this._zoomTTarget;
      if (s.t >= s.duration) {
        this.mode = 'LOCKED';
        this.lockTarget = s.entity;
        this._snap = null;
      }
    } else {
      if (this.mode === 'LOCKED') {
        const t = this.lockTarget ?? this.world.player;
        if (t) {
          // Lead the target so it reads as moving into space you can see, rather
          // than chasing the frame edge.
          this._focusTarget.copy(t.position);
          if (t.velocity) this._focusTarget.addScaledVector(t.velocity, ORBIT.followLead);
          this._focusTarget.y = 0;
        }
      }
      dampVec(this.focus, this._focusTarget, this._dragging ? 0 : ORBIT.tauFocusKey, dt);
      this.yaw = damp(this.yaw, this._yawTarget, ORBIT.tauOrbitKey, dt);
      this.pitchOffset = damp(this.pitchOffset, this._pitchTarget, ORBIT.tauOrbitKey, dt);
      this.zoomT = damp(this.zoomT, Math.min(this._zoomTTarget, 1), ORBIT.tauZoom, dt);
    }

    this._applyToCamera();
  }

  _applyToCamera() {
    const d = this.distance;
    const p = this.pitch;
    const cosP = Math.cos(p), sinP = Math.sin(p);
    this.camera.position.set(
      this.focus.x + cosP * Math.sin(this.yaw) * d,
      this.focus.y + sinP * d,
      this.focus.z + cosP * Math.cos(this.yaw) * d,
    );
    // Roll is unconditionally zero in tactical mode. Our fixed combat plane makes a
    // stable horizon free, and a free-flying camera is a documented disorientation
    // source in this genre. Take the free win.
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.focus);
  }

  /** World point where a screen ray meets the combat plane. Null if it never does. */
  screenToPlane(ndcX, ndcY, out = new THREE.Vector3()) {
    const ray = _ray;
    ray.origin.setFromMatrixPosition(this.camera.matrixWorld);
    out.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(ray.origin).normalize();
    ray.direction.copy(out);
    if (Math.abs(ray.direction.y) < 1e-5) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return null;
    return out.copy(ray.origin).addScaledVector(ray.direction, t);
  }

  setDragging(v) { this._dragging = v; }
}

const _ray = new THREE.Ray();
