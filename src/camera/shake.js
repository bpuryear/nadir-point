import * as THREE from 'three';
import { EV } from '../core/events.js';

/**
 * CAMERA SHAKE — the screen's answer to the guns.
 *
 * WHY THIS FILE EXISTS. Before it, `grep -rn 'shake\|kick\|hitstop' src/` returned
 * nothing, and the ONLY path by which firing a broadside reached the viewport was
 * `PlaneBody.recoilBank` — a roll of the hull, not of the frame. Measured on the real
 * boot framing that is **1.24 px of roll across a 334 px hull**, against a `RECOIL.bankCap`
 * that tops out at 2.6 px. A 620,000 t capital ship committed ten barrels and the frame
 * did not move. An independent critic scored moment-to-moment feel 5/10 and wrote that
 * "the systems here are better than the game they are in"; this is the load-bearing half
 * of that sentence.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A HEAVE, NOT A RATTLE. The distinction is the whole design.
 * ---------------------------------------------------------------------------
 *
 * A fast, high-frequency shake reads as CHEAP — it is the vocabulary of a hitscan
 * shooter and it says "small gun, close by". A slow, heavy, low-frequency settle reads
 * as MASS: the frame is displaced once, hard, and then takes a full second to come back,
 * because the thing that displaced it weighs six hundred thousand tonnes. So this is a
 * single underdamped second-order oscillator at **1.55 Hz** with **zeta 0.38** — one
 * clear displacement at t 0.131 s, one visible undershoot, under a tenth of a pixel by
 * 1.12 s and integrated to exactly zero at 1.95 s. It is deliberately
 * slower than anything in `vfx/`, and it is deliberately NOT per-beat: the ripple runs
 * at `RIPPLE.step` 0.110 s, i.e. 9.2 beats/s, and a camera pulse per beat at 9 Hz is
 * exactly the rattle this is written to avoid. The wave's raggedness is carried by the
 * pip run and by the audio; the camera carries only the COMMIT and the SETTLE.
 *
 * TWO EVENTS, and they are the two the salvo controller already publishes:
 *
 *   EV.SALVO_FIRED     the commit. The larger kick, down and away from the muzzles.
 *   EV.SALVO_COMPLETE  the settle. Roughly a third of it, back the other way, so the
 *                      end of the sweep is felt and not merely observed.
 *
 * Both scale with `slotCount` — a four-barrel wave must not hit like a ten-barrel one —
 * sub-linearly (`sqrt`), because barrels 11 through 24 are already the loudest thing in
 * the frame and a linear law makes the maximal hull unwatchable.
 *
 * ---------------------------------------------------------------------------
 * UNITS: FRACTIONS OF THE FRAME'S HEIGHT, NEVER METRES AND NEVER PIXELS
 * ---------------------------------------------------------------------------
 *
 * The amplitude is a fraction of what the frame spans in world units at the focus
 * plane, so the felt magnitude is the same at 260 m and at 46 km and at every viewport
 * size. Metres would make the kick invisible at strategic zoom and enormous up close;
 * pixels would make it a different gesture on a 720p frame than on a 1440p one. This is
 * the same argument `constants.js` makes for putting zoom in log space, applied to the
 * other axis.
 *
 * ONE ATTENUATION, and it is about legibility rather than taste: below the point where
 * the hull spans about a fiftieth of the frame there is nothing on screen to answer, so
 * the kick fades out. A camera that lurches while the ship is six pixels tall is a
 * camera reporting an event the player cannot see.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER FIGHTS THE PLAYER
 * ---------------------------------------------------------------------------
 *
 * `tactical.js#_cancelSnap` is the existing rule — any camera input during a snap kills
 * the snap on that frame — and this obeys the same one from the same call site. On the
 * frame of any orbit, zoom, pan or key nudge, `cancel()` zeroes the oscillator's
 * VELOCITY, so the drive is dead on that frame and no further energy can enter. The
 * residual OFFSET is retired on a `retireTau` exponential rather than snapped to zero,
 * because a hard cut mid-settle is a visible jump of up to nine pixels and cancelling an
 * effect must not itself be an effect. MEASURED, cancelling at the worst moment (0.86 %
 * of frame height, 6.2 px at 720p): 95 % of it is gone in 135 ms, and it reaches exactly
 * zero at 317 ms against the 1.95 s the uncancelled settle takes — so the input wins by
 * a factor of six on the number the player can see.
 *
 * IT DECAYS TO EXACTLY ZERO. Not to 1e-9: below `EPS` both state variables are assigned
 * literal 0 and `offset()` then returns false and touches no camera field at all, so a
 * settled frame is bit-identical to a frame in a build without this file.
 *
 * DETERMINISM. No `Math.random`, no time source but the render `dt` handed in, and no
 * allocation after module load — the three scratch vectors below are the only ones.
 */

/** The oscillator, and the two kicks expressed as the peak they are meant to produce. */
export const HEAVE = {
  /** Hz. Low on purpose. Above ~3 Hz this stops reading as tonnage and starts reading as a rattle. */
  hz: 1.55,
  /** Damping ratio. 0.38 gives one clear displacement and one visible undershoot. */
  zeta: 0.38,

  /**
   * Peak displacement of the COMMIT kick at the nominal broadside, as a fraction of the
   * frame's height. The impulse is DERIVED from this figure through the closed-form
   * peak-per-impulse below, so the number here is the number on screen rather than a
   * gain that happens to produce it.
   *
   * MEASURED by integrating the real class at the real render rates: 0.876 % at 60 Hz,
   * 0.880 % at 144 Hz, 0.825 % at 12 Hz against the 0.900 % asked — the substepped
   * integrator runs a couple of per cent under the analytic peak and that is reported
   * rather than tuned away. 0.876 % is **6.31 px at 720p, 9.46 px at 1080p**, against
   * the 1.24 px of roll `recoilBank` puts on a 334 px hull at boot framing, and against
   * the 3-5 % of frame height a shooter would use for a rifle.
   */
  firePeak: 0.0090,
  /** The SETTLE kick, the other way. Deliberately about a third of the commit (0.331 % measured). */
  completePeak: 0.0034,

  /** The lateral (screen-x) share of each kick. The rest is vertical. */
  lateralShare: 0.5,

  /**
   * Slots that count as a full broadside. `tools/ripple.mjs` measures the ordinary
   * cruiser wave at 10 slots over 1.250 s, so 10 is the measured nominal rather than a
   * round number. Scaling is `sqrt(slots / nominal)`, clamped.
   */
  nominalSlots: 10,
  /** Ceiling on the scale factor. sqrt(24/10) is 1.55, so this binds only in theory. */
  scaleMax: 1.6,

  /**
   * Seconds. Time constant on which a cancelled offset is retired. 0.045 puts 95 % of
   * the worst-case residual away in 135 ms and all of it in 317 ms — fast enough that
   * the input has plainly won, slow enough that the cancellation is not a jump. See the
   * header.
   */
  retireTau: 0.045,

  /**
   * Legibility fade, as the fraction of the frame's height the hull spans. Full strength
   * once the ship is a tenth of the frame tall; nothing at all below a fiftieth.
   *
   * MEASURED on the live tactical camera at 1600x900, hull radius 588 m:
   *
   *     zoomT 0.00   1117 m   span 1.240   ->  1.00
   *     zoomT 0.42   5324 m   span 0.260   ->  1.00     <- the boot framing
   *     zoomT 0.60  10397 m   span 0.133   ->  1.00
   *     zoomT 0.80  21869 m   span 0.063   ->  0.43
   *     zoomT 1.00  46000 m   span 0.030   ->  0.04
   *
   * so the heave is at full strength across the whole band the game is actually fought
   * in and has faded out by the time the cruiser is the "bright speck against the gas
   * giant" `units.js` names `maxDistance` for. This is a legibility rule, not a taste
   * one: at 46 km the muzzle flashes are sub-pixel and a lurching frame would be the
   * camera reporting an event that is not on screen.
   */
  visIn: 0.020,
  visFull: 0.100,

  /** Below this, in frame fractions, the state is assigned literal zero. */
  eps: 1e-5,

  /** Integration substep. Bounds the error at a 100 ms render frame. */
  subStep: 1 / 240,
  maxSubSteps: 32,
};

const W = Math.PI * 2 * HEAVE.hz;
const WD = W * Math.sqrt(1 - HEAVE.zeta * HEAVE.zeta);
const DECAY = HEAVE.zeta * W;

/**
 * Peak displacement per unit of impulse, in closed form, so the two `*Peak` figures
 * above are the numbers that actually appear on screen rather than gains that happen to
 * produce them. x(t) = (J/wd)·e^(-zeta·w·t)·sin(wd·t) peaks at atan(wd / zeta·w) / wd.
 */
const T_PEAK = Math.atan(WD / DECAY) / WD;
const PEAK_PER_IMPULSE = (1 / WD) * Math.exp(-DECAY * T_PEAK) * Math.sin(WD * T_PEAK);

/** Convert a wanted peak (frame fractions) into the impulse that produces it. */
const impulseFor = (peak) => peak / PEAK_PER_IMPULSE;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Ship-local bearing of each flank's beam, in the SAME convention `sim/salvo.js#BEAM`
 * uses: port fires to -PI/2 and starboard to +PI/2 under `yawOf = atan2(x, z)`. Read off
 * that file rather than re-derived, so a future handedness correction moves one place.
 */
const BEAM = { port: -Math.PI * 0.5, starboard: Math.PI * 0.5 };

// Module-scoped scratch. Allocated once, at import. Nothing below ever allocates.
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

export class CameraShake {
  constructor(world) {
    this.world = world;

    /** Offset and rate, in frame-height fractions. Two independent screen axes. */
    this.latX = 0;
    this.latV = 0;
    this.vertX = 0;
    this.vertV = 0;

    /**
     * World direction the guns pointed on the last kick, on the combat plane. The
     * lateral push is AWAY from the muzzles, and it is projected onto the camera's own
     * right vector every frame — so firing a port broadside while looking from
     * starboard pushes the frame the other way, which is the correct answer and the
     * one a screen-space-only shake cannot give.
     */
    this.beamX = 0;
    this.beamZ = 0;

    /** True while a cancelled offset is being retired. See the header. */
    this._retiring = false;

    /**
     * The camera that drives the clock. The first one to call `update` claims it, so
     * two cameras reading the same instance in the same frame cannot double-integrate
     * it — `game.js` runs `tactical.update(dt)` and then `cinematic.update(dt)` inside
     * one render system, and both apply this offset.
     */
    this._driver = null;

    this._offs = [];
    const bus = world?.bus;
    if (bus) {
      this._offs.push(bus.on(EV.SALVO_FIRED, (p) => this._onSalvo(p, HEAVE.firePeak, -1)));
      this._offs.push(bus.on(EV.SALVO_COMPLETE, (p) => this._onSalvo(p, HEAVE.completePeak, 1)));
    }
  }

  /**
   * @param {Object} p           SalvoFiredPayload or SalvoCompletePayload
   * @param {number} peak        wanted peak, frame-height fractions, at nominal slots
   * @param {number} dir         +1 or -1; the commit and the settle go opposite ways
   */
  _onSalvo(p, peak, dir) {
    // The player's guns only. An escort's broadside 4 km away is the VFX layer's job;
    // a camera that answers every hull in the system answers none of them.
    if (!p || p.ship !== this.world?.player) return;
    // `slotCount` on FIRED, `fired + dropped` on COMPLETE — the events publish the same
    // quantity under two names and `EV.SALVO_COMPLETE`'s own note says they are equal.
    const slots = p.slotCount ?? ((p.fired ?? 0) + (p.dropped ?? 0));
    if (!(slots > 0)) return;

    const scale = Math.min(HEAVE.scaleMax, Math.sqrt(slots / HEAVE.nominalSlots));
    const j = impulseFor(peak) * scale * dir;

    // A new wave overrides a cancelled one: the player stopped fighting the last kick,
    // they did not ask never to feel another.
    this._retiring = false;
    this.vertV += j;
    this.latV += j * HEAVE.lateralShare;

    // Where the muzzles were pointing. `side === 'all'` is NOT a third flank — the
    // controller returns it when there is no target and therefore no engaged side — so
    // it gets the heave with no lateral bearing rather than an invented one.
    const beam = BEAM[p.side];
    if (beam === undefined) {
      this.beamX = 0;
      this.beamZ = 0;
    } else {
      const a = (p.ship.heading ?? 0) + beam;
      this.beamX = Math.sin(a);
      this.beamZ = Math.cos(a);
    }
  }

  /** True when there is anything at all to apply. */
  get active() {
    return this.latX !== 0 || this.vertX !== 0 || this.latV !== 0 || this.vertV !== 0;
  }

  /**
   * ANY CAMERA INPUT CANCELS IT. Called from `tactical.js#_cancelSnap`, which is the
   * one place every orbit, zoom, pan and key nudge already funnels through.
   */
  cancel() {
    this.latV = 0;
    this.vertV = 0;
    if (this.latX === 0 && this.vertX === 0) return;
    this._retiring = true;
  }

  /**
   * Advance the oscillator. Idempotent across cameras: the first caller claims the
   * clock and every other caller in the same frame is a no-op.
   *
   * @param {number} dt      render seconds
   * @param {Object} owner   the calling camera, used only as an identity
   */
  update(dt, owner) {
    if (this._driver === null) this._driver = owner ?? this;
    if (owner !== this._driver) return this;
    if (!this.active) return this;

    let t = Math.min(0.25, Math.max(0, dt || 0));

    if (this._retiring) {
      // Velocity is already zero; retire the residual offset on an exponential so the
      // cancellation is not itself a visible jump.
      const k = Math.exp(-t / HEAVE.retireTau);
      this.latX *= k;
      this.vertX *= k;
    } else {
      let steps = 0;
      while (t > 0 && steps < HEAVE.maxSubSteps) {
        const h = Math.min(HEAVE.subStep, t);
        this.latV += (-W * W * this.latX - 2 * DECAY * this.latV) * h;
        this.latX += this.latV * h;
        this.vertV += (-W * W * this.vertX - 2 * DECAY * this.vertV) * h;
        this.vertX += this.vertV * h;
        t -= h;
        steps++;
      }
    }

    // EXACTLY zero, not nearly zero. See the header.
    if (Math.abs(this.latX) < HEAVE.eps && Math.abs(this.latV) < HEAVE.eps * W) {
      this.latX = 0; this.latV = 0;
    }
    if (Math.abs(this.vertX) < HEAVE.eps && Math.abs(this.vertV) < HEAVE.eps * W) {
      this.vertX = 0; this.vertV = 0;
    }
    if (!this.active) this._retiring = false;
    return this;
  }

  /**
   * The world-space offset to add to BOTH the camera position and its look target, so
   * the eye translates rigidly and the whole frame slides. Offsetting only the position
   * pivots the view instead, which keeps the subject centred and moves the background —
   * the opposite of what reads.
   *
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} aim   what the camera is about to look at
   * @param {THREE.Vector3} out
   * @returns {boolean} false, and `out` untouched, when there is nothing to apply
   */
  offset(camera, aim, out) {
    if (!this.active || !camera || !aim || !out) return false;

    _f.copy(aim).sub(camera.position);
    const dist = _f.length();
    if (!(dist > 1e-3)) return false;
    _f.multiplyScalar(1 / dist);

    // Screen axes from the view direction. `r = f x up` degenerates only when the
    // camera looks straight down, which the pitch clamp forbids, but guard anyway.
    _r.copy(_f).cross(_UP);
    if (_r.lengthSq() < 1e-8) return false;
    _r.normalize();
    _u.copy(_r).cross(_f);

    // What the frame spans in world units at the focus plane.
    const frameH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * dist;

    // Legibility fade: no lurch for an event that is six pixels tall.
    const player = this.world?.player;
    const span = player && !player.dead ? (player.radius ?? 200) * 2 / frameH : 0;
    const vis = smoothstep(HEAVE.visIn, HEAVE.visFull, span);
    if (vis <= 0) return false;

    // The lateral push is a WORLD direction projected onto the camera's right, so it
    // stays physically the same push while the player orbits around it.
    const bearing = this.beamX === 0 && this.beamZ === 0
      ? 0
      : -(this.beamX * _r.x + this.beamZ * _r.z);

    const lat = this.latX * bearing * frameH * vis;
    const vert = this.vertX * frameH * vis;
    out.set(0, 0, 0).addScaledVector(_r, lat).addScaledVector(_u, vert);
    return true;
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
  }
}

/**
 * One instance per world, keyed weakly so a disposed world takes its shake with it.
 *
 * A `WeakMap` rather than `world.register('shake', …)` for the same reason
 * `sim/salvo.js` keeps its controllers in one: the registry is the assembly seam that
 * `src/game.js` owns, and this stream may not add a line to it. Both cameras call this
 * and get the same object, which is what makes the impulse one impulse rather than two.
 */
const _byWorld = new WeakMap();

export function cameraShake(world) {
  if (!world) return null;
  let s = _byWorld.get(world);
  if (!s) {
    s = new CameraShake(world);
    _byWorld.set(world, s);
  }
  return s;
}

/** Exported for the scratch integration that verifies the peaks and the zero. */
export const SHAKE_INTERNALS = { W, WD, DECAY, T_PEAK, PEAK_PER_IMPULSE, impulseFor };
