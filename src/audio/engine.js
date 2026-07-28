/**
 * THE AUDIO GRAPH.
 *
 *   sources -> per-voice [ lowpass -> panner -> gain ] -> bus -> master -> out
 *                                                     \-> reverb send -> FDN -/
 *
 * Five buses (weapons, engines, impacts, ambience, ui), one reverb send, one
 * saturator and one limiter on the master. Everything here is built once, in
 * whatever `BaseAudioContext` it is handed, which is what lets the probe render the
 * identical graph offline and plot it.
 *
 * FOUR THINGS THIS FILE IS RESPONSIBLE FOR AND NOTHING ELSE IS
 *
 * 1. IT DOES NOT EXIST UNTIL THE PLAYER TOUCHES SOMETHING. Browsers refuse to start
 *    an AudioContext without a user gesture, and a suspended context that silently
 *    swallows a hundred scheduled voices is worse than no audio. So there is no
 *    context until `unlock()`, every play call before that is a cheap no-op, and if
 *    `AudioContext` does not exist at all - a headless renderer, a locked-down
 *    embed - the whole stream degrades to nothing without a single throw.
 *
 * 2. IT FOLLOWS TIME COMPRESSION. `setTimeScale` sets two numbers: `stretch`
 *    (1/scale, applied to every scheduled duration, because an event that takes two
 *    seconds of simulation time takes half a second of wall clock at 4x) and
 *    `pitch` (sqrt of scale, applied to detune and playbackRate). Full linear pitch
 *    at 4x is a chipmunk; no pitch change at all makes compression read as a bug.
 *    The square root is the compromise every game that ships time controls makes.
 *
 * 3. IT SILENCES CLEANLY WHEN PAUSED. Not "stops spawning" - a 6 second reactor
 *    tail would keep playing over a paused frame. The master fades to zero in 60 ms
 *    and the context is suspended shortly after, so pause costs nothing and resumes
 *    exactly where it left off.
 *
 * 4. IT IS THE ONLY PLACE THAT KNOWS WHERE THE EAR IS. Distance attenuation, the
 *    proximity lowpass and stereo placement are computed here, once per event, on
 *    the CPU - not with PannerNodes, which cost a HRTF convolution per voice and
 *    whose distance model cannot be scaled by camera zoom.
 *
 * THE ZOOM RULE, which is most of why this reads as a big game: the ear is the
 * camera, and as the camera pulls back the reference distance grows and the master
 * drops. At 46 km a battle is a quiet, filtered rumble. Volume is a scale cue.
 */

import { RNG } from '../core/rng.js';
import {
  clamp, lerp, dbToGain, gain as mkGain, biquad, createFDN, createBufferBank, shaper, rampTo,
} from './synth.js';

export const BUSES = ['weapons', 'engines', 'impacts', 'ambience', 'ui'];

/** Committed mix. Linear gains; see `gainToDb` if you want these in decibels. */
export const MIX = {
  master: 0.82,
  bus: {
    weapons: 0.60,
    engines: 0.52,
    impacts: 0.72,
    ambience: 0.44,
    ui: 0.50,
  },
  /** How much of each bus goes to the reverb. UI is dry: it is not in the world. */
  send: {
    weapons: 0.15,
    engines: 0.05,
    impacts: 0.30,
    ambience: 0.07,
    ui: 0.0,
  },
};

/**
 * Distance model. Metres, because everything in this project is metres.
 *
 * `ref` is the radius inside which a sound is at full level; past it the level
 * follows an inverse-distance law softened by `rolloff`. `airTau` drives the
 * proximity lowpass: cutoff decays exponentially with distance from `cutoffHi` to
 * `cutoffLo`, so a detonation 12 km away is a dull thump and the same detonation at
 * 400 m has teeth. That single filter is the strongest distance cue we have.
 */
export const SPACE = {
  ref: 340,
  rolloff: 0.55,
  maxDistance: 34000,
  airTau: 2700,
  cutoffLo: 210,
  cutoffHi: 19000,
  panWidth: 0.92,
  /** Camera distance at which zoom compensation starts, and how far it goes. */
  zoomRef: 3200,
  zoomMax: 11,
  zoomExp: 0.7,
};

/** Voice budget. Past this, new one-shots are dropped quietest-first. */
const MAX_VOICES = 44;

/** How long after entering pause the context is suspended, seconds of wall clock. */
const SUSPEND_DELAY = 0.45;

class Voice {
  constructor() {
    this.input = null;
    this.nodes = [];
    this.endTime = 0;
    this.priority = 0;
    this.active = false;
  }
}

/**
 * The mixer: buses, sends, master chain. Built into one context; disposable.
 * Kept separate from `AudioEngine` so the probe can construct one against an
 * OfflineAudioContext without any of the gesture or lifecycle machinery.
 */
export class AudioMixer {
  /**
   * @param {BaseAudioContext} ctx
   * @param {Object} opts
   * @param {RNG} opts.rng
   * @param {AudioNode} [opts.destination]
   */
  constructor(ctx, { rng, destination = null } = {}) {
    this.ctx = ctx;
    this.rng = rng ?? new RNG('audio');
    this.buffers = createBufferBank(ctx, this.rng.fork('buffers'));

    const out = destination ?? ctx.destination;

    // --- master chain, last to first -------------------------------------
    this.master = mkGain(ctx, MIX.master);
    // Brick-wall-ish limiter. A capital detonation peaks 20 dB over a cannon and
    // without this it either clips or forces the whole mix down to accommodate it.
    this.limiter = ctx.createDynamicsCompressor();
    // A SAFETY LIMITER, not a compressor. Threshold high, ratio brick: it should
    // only ever catch the first few milliseconds of a capital detonation. Set it
    // 3 dB lower and it stops being a limiter and starts being a level control -
    // the whole mix pumps down for two seconds after every explosion and the
    // dynamic range the ambience beds were built for disappears.
    this.limiter.threshold.value = -1.2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.10;
    // Barely-there glue. Anything harder here distorts the sub of a detonation
    // into the mids, where it is heard as fizz rather than felt as weight.
    this.glue = shaper(ctx, 1.1);
    // Nothing below 18 Hz is audible on any speaker and all of it eats headroom.
    this.dcBlock = biquad(ctx, 'highpass', 18, 0.6);

    this.sum = mkGain(ctx, 1);
    this.sum.connect(this.dcBlock);
    this.dcBlock.connect(this.glue);
    this.glue.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(out);

    // --- reverb ------------------------------------------------------------
    this.reverb = createFDN(ctx, { feedback: 0.52, damp: 3800, preDelay: 0.014, size: 1 });
    this.reverbReturn = mkGain(ctx, 0.5);
    this.reverb.output.connect(this.reverbReturn);
    this.reverbReturn.connect(this.sum);

    // --- buses -------------------------------------------------------------
    /** @type {Object<string, GainNode>} */
    this.buses = Object.create(null);
    /** Ducking applied to the world buses when something enormous happens. */
    this.duckGain = mkGain(ctx, 1);
    this.duckGain.connect(this.sum);

    for (const name of BUSES) {
      const g = mkGain(ctx, MIX.bus[name]);
      // Only the BEDS duck. Ducking the impacts bus would make a detonation duck
      // itself, which is both wrong and the classic way a big sound ends up
      // sounding small. UI sits outside it because it is not in the world at all.
      const ducked = name === 'ambience' || name === 'engines';
      g.connect(ducked ? this.duckGain : this.sum);
      this.buses[name] = g;
    }
    // NOTE: there is deliberately no bus-level reverb send. Every voice opens its
    // own, scaled by MIX.send for its bus, so a voice can ask for more or less
    // space than its neighbours. A bus send on top of that double-feeds the FDN -
    // which is how the reverb ended up louder than the dry signal.

    this._duckUntil = 0;
  }

  get now() { return this.ctx.currentTime; }

  bus(name) { return this.buses[name] ?? this.buses.weapons; }

  /**
   * Duck the world buses. Called by a capital detonation so the ambience and the
   * drive bed get out of the way of the thing the player is looking at.
   */
  duck(amount = 0.45, hold = 0.5, recover = 1.1, when = null) {
    const t = when ?? this.now;
    if (t < this._duckUntil) return;
    this._duckUntil = t + hold + recover;
    const g = this.duckGain.gain;
    const floor = clamp(1 - amount, 0.05, 1);
    rampTo(g, t, floor, 0.03);
    g.setValueAtTime(floor, t + hold);
    g.linearRampToValueAtTime(1, t + hold + recover);
  }

  /** Retune the reverb for a point of interest. */
  setSpace(spec, when = null, tau = 0.6) {
    const t = when ?? this.now;
    this.reverb.set(spec, t, tau);
    if (spec.wet !== undefined) {
      this.reverbReturn.gain.setTargetAtTime(clamp(spec.wet, 0, 2), t, tau);
    }
  }

  dispose() {
    try {
      this.master.disconnect();
      this.sum.disconnect();
      for (const name of BUSES) this.buses[name].disconnect();
    } catch { /* context already gone */ }
  }
}

/**
 * The stream's public runtime. One per world. Owns the context lifecycle, the
 * listener, the time-scale response and the voice budget.
 */
export class AudioEngine {
  /**
   * @param {Object} opts
   * @param {RNG} opts.rng
   * @param {() => {x:number,y:number,z:number}|null} [opts.getCameraPosition]
   * @param {() => Float32Array|number[]|null} [opts.getCameraMatrix]  world matrix elements
   * @param {() => number} [opts.getFocusDistance]  camera distance to what it is watching
   */
  constructor({ rng, getCameraPosition = null, getCameraMatrix = null, getFocusDistance = null } = {}) {
    this.rng = rng ?? new RNG('audio');
    this.getCameraPosition = getCameraPosition;
    this.getCameraMatrix = getCameraMatrix;
    this.getFocusDistance = getFocusDistance;

    /** @type {BaseAudioContext|null} */
    this.ctx = null;
    /** @type {AudioMixer|null} */
    this.mixer = null;
    this.ready = false;
    /** Set when the environment simply has no Web Audio. Never retried. */
    this.unavailable = typeof globalThis.AudioContext !== 'function'
      && typeof globalThis.webkitAudioContext !== 'function';

    // --- listener basis, preallocated. Nothing in here allocates per frame. ---
    this.ear = { x: 0, y: 0, z: 0 };
    this.right = { x: 1, y: 0, z: 0 };
    this.forward = { x: 0, y: 0, z: -1 };
    this.zoom = 1;

    // --- time controls ---
    this.timeScale = 1;
    this.stretch = 1;      // multiply every scheduled duration by this
    this.pitch = 1;        // multiply every playbackRate / frequency by this
    this.paused = false;
    this._pausedAt = 0;
    this._suspended = false;
    this._suspendPending = false;

    /** Master trim the player controls, separate from the pause fader. */
    this.volume = 1;

    // --- voice budget ---
    this._voices = [];
    this._freeVoices = [];
    for (let i = 0; i < MAX_VOICES + 8; i++) this._freeVoices.push(new Voice());

    // --- rate limiting: one entry per gate key, never grows past a handful ---
    this._gates = new Map();

    /** Reused by `spatialAt`; callers must consume it before the next call. */
    this.spat = { gain: 0, pan: 0, cutoff: SPACE.cutoffHi, distance: 0, audible: false };

    this.stats = { voices: 0, dropped: 0, gated: 0, started: 0 };
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  /**
   * Bring the graph up inside a context we were handed. The probe uses this with an
   * OfflineAudioContext; `unlock()` uses it with a real one.
   */
  attach(ctx, { destination = null } = {}) {
    if (this.mixer) return this.mixer;
    this.ctx = ctx;
    this.mixer = new AudioMixer(ctx, { rng: this.rng.fork('mixer'), destination });
    this.ready = true;
    this._applyMasterGain(0);
    return this.mixer;
  }

  /**
   * Start real-time audio. Safe to call repeatedly and from any gesture handler.
   * Returns true if audio is (or already was) running.
   */
  unlock() {
    if (this.ready) {
      this._resumeContext();
      return true;
    }
    if (this.unavailable) return false;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    let ctx = null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      // Some environments expose the constructor and then refuse to build one.
      this.unavailable = true;
      return false;
    }
    this.attach(ctx);
    this._resumeContext();
    return true;
  }

  /** Install one-shot gesture listeners. Idempotent; returns a detach function. */
  attachGestures(target = globalThis) {
    if (this._detachGestures || !target?.addEventListener) return this._detachGestures ?? (() => {});
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    const on = () => {
      if (this.unlock()) detach();
    };
    const detach = () => {
      for (const e of events) {
        try { target.removeEventListener(e, on, true); } catch { /* detached already */ }
      }
      this._detachGestures = null;
    };
    for (const e of events) {
      try { target.addEventListener(e, on, { capture: true, passive: true }); } catch { /* no DOM */ }
    }
    this._detachGestures = detach;
    return detach;
  }

  _resumeContext() {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.resume !== 'function') return;
    this._suspended = false;
    this._suspendPending = false;
    try { ctx.resume().catch(() => {}); } catch { /* offline contexts have no resume */ }
  }

  dispose() {
    this._detachGestures?.();
    this.stopAllVoices(0);
    this.mixer?.dispose();
    const ctx = this.ctx;
    this.ready = false;
    this.mixer = null;
    this.ctx = null;
    if (ctx && typeof ctx.close === 'function' && ctx.state !== 'closed') {
      try { ctx.close().catch(() => {}); } catch { /* offline */ }
    }
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get buffers() { return this.mixer?.buffers ?? null; }

  // -------------------------------------------------------------------------
  // time controls
  // -------------------------------------------------------------------------

  /**
   * @param {number} scale  `engine.timeScale`: 0 (paused), 1, 2, 4, or a transit
   *                        compression up to 64.
   */
  setTimeScale(scale) {
    if (scale === this.timeScale) return;
    this.timeScale = scale;
    const wasPaused = this.paused;
    this.paused = scale === 0;

    if (this.paused) {
      this._pausedAt = this.now;
      this._applyMasterGain(0.06);
      this._suspendPending = true;
    } else {
      // Combat tops out at 4x; transit runs to 64x, where per-shot detail is
      // meaningless. Clamp the scheduling rate so a transit burn does not turn
      // every sound into a click, and duck the combat buses instead.
      const sched = clamp(scale, 0.25, 4);
      this.stretch = 1 / sched;
      this.pitch = clamp(Math.sqrt(sched), 0.5, 2.2);
      if (wasPaused) this._resumeContext();
      this._applyMasterGain(0.09);
      this._suspendPending = false;
      if (this.mixer) {
        // Above 4x the player is travelling, not fighting: pull the combat layers
        // right down and leave the drive and the ambience carrying the scene.
        const t = this.now;
        const compressed = scale > 4;
        this.mixer.buses.weapons.gain.setTargetAtTime(MIX.bus.weapons * (compressed ? 0.14 : 1), t, 0.25);
        this.mixer.buses.impacts.gain.setTargetAtTime(MIX.bus.impacts * (compressed ? 0.18 : 1), t, 0.25);
      }
    }
  }

  _applyMasterGain(tau = 0.06) {
    if (!this.mixer) return;
    const target = this.paused ? 0 : MIX.master * this.volume * this._zoomGain();
    rampTo(this.mixer.master.gain, this.now, target, tau);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1.5);
    this._applyMasterGain(0.08);
  }

  _zoomGain() {
    // Pulling the camera out to 46 km should feel like altitude, not like a mute
    // button - hence a shallow curve that never falls below about -8 dB.
    return 1 / (1 + 0.22 * (this.zoom - 1));
  }

  // -------------------------------------------------------------------------
  // listener
  // -------------------------------------------------------------------------

  /**
   * Refresh the ear from the camera. Called once per rendered frame; touches only
   * preallocated fields.
   * @param {number[]|Float32Array} m  camera.matrixWorld.elements
   * @param {number} focusDistance     how far the camera is from what it watches
   */
  setListener(m, focusDistance) {
    if (m) {
      this.right.x = m[0]; this.right.y = m[1]; this.right.z = m[2];
      this.forward.x = -m[8]; this.forward.y = -m[9]; this.forward.z = -m[10];
      this.ear.x = m[12]; this.ear.y = m[13]; this.ear.z = m[14];
    }
    if (focusDistance > 0) {
      const z = clamp(focusDistance / SPACE.zoomRef, 1, SPACE.zoomMax);
      if (Math.abs(z - this.zoom) > 0.02) {
        this.zoom = z;
        if (!this.paused) this._applyMasterGain(0.25);
      }
    }
  }

  /**
   * Distance attenuation, proximity lowpass and stereo placement for a world point.
   * Writes into the shared `spat` record and returns it. Never allocates.
   */
  spatialAt(x, y, z, out = this.spat) {
    const dx = x - this.ear.x, dy = y - this.ear.y, dz = z - this.ear.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    out.distance = d;

    // Zoom compensation: the further the camera is from the action, the larger the
    // "full volume" bubble, so a fleet action stays audible from the tactical view
    // - just quieter and duller, because the master and the filter both follow.
    const zs = Math.pow(this.zoom, SPACE.zoomExp);
    const ref = SPACE.ref * zs;
    const far = SPACE.maxDistance * zs;

    if (d > far) {
      out.audible = false;
      out.gain = 0;
      out.pan = 0;
      out.cutoff = SPACE.cutoffLo;
      return out;
    }
    out.audible = true;
    const over = Math.max(0, d - ref);
    out.gain = ref / (ref + SPACE.rolloff * over);
    // Fade the last 25% of the range to zero so nothing pops out of existence.
    const edge = far * 0.75;
    if (d > edge) out.gain *= 1 - (d - edge) / (far - edge);

    out.cutoff = SPACE.cutoffLo
      + (SPACE.cutoffHi - SPACE.cutoffLo) * Math.exp(-d / (SPACE.airTau * zs));

    if (d < 1e-3) {
      out.pan = 0;
    } else {
      const lateral = (dx * this.right.x + dy * this.right.y + dz * this.right.z) / d;
      // Soft-knee panning: full hard-left/right only for something genuinely off to
      // the side. A linear map puts everything at the extremes the moment the camera
      // turns and it is exhausting.
      out.pan = clamp(SPACE.panWidth * (lateral / (Math.abs(lateral) + 0.42)), -1, 1);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // voices
  // -------------------------------------------------------------------------

  /**
   * Rate limiter. Point defence fires four times a second per mount and at 4x that
   * is sixteen; without a gate the mix is a buzzsaw and the voice budget is gone.
   * @returns {boolean} true if the caller may proceed
   */
  gate(key, minInterval) {
    const t = this.now;
    const prev = this._gates.get(key);
    if (prev !== undefined && t - prev < minInterval * this.stretch) {
      this.stats.gated++;
      return false;
    }
    this._gates.set(key, t);
    return true;
  }

  /**
   * Open a one-shot voice.
   *
   * @param {string} busName
   * @param {Object} spat            from `spatialAt`, or a literal for the probe
   * @param {Object} [opts]
   * @param {number} [opts.duration] seconds; the voice is swept after this
   * @param {number} [opts.level]    extra linear gain
   * @param {number} [opts.reverb]   0..2 multiplier on this voice's send
   * @param {boolean}[opts.filter]   set false to bypass the proximity lowpass
   * @param {number} [opts.priority] higher survives the budget cull
   * @returns {{input:AudioNode, t:number, ctx:BaseAudioContext}|null}
   */
  voice(busName, spat, {
    duration = 1, level = 1, reverb = 1, filter = true, priority = 0, when = null,
  } = {}) {
    if (!this.ready || this.paused) return null;
    if (spat && spat.audible === false) return null;
    const ctx = this.ctx;
    const mixer = this.mixer;
    const t = when ?? ctx.currentTime;

    if (!this._makeRoom(priority)) return null;

    const g = mkGain(ctx, clamp((spat?.gain ?? 1) * level, 0, 4));
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(spat?.pan ?? 0, -1, 1);

    let head = pan;
    let lp = null;
    if (filter) {
      lp = biquad(ctx, 'lowpass', spat?.cutoff ?? SPACE.cutoffHi, 0.7);
      lp.connect(pan);
      head = lp;
    }
    pan.connect(g);
    g.connect(mixer.bus(busName));

    let send = null;
    if (reverb > 0 && MIX.send[busName] > 0) {
      send = mkGain(ctx, reverb * MIX.send[busName]);
      g.connect(send);
      send.connect(mixer.reverb.input);
    }

    const v = this._freeVoices.pop() ?? new Voice();
    v.input = head;
    v.nodes.length = 0;
    v.nodes.push(g, pan);
    if (lp) v.nodes.push(lp);
    if (send) v.nodes.push(send);
    v.endTime = t + duration * this.stretch + 0.25;
    v.priority = priority + (spat?.gain ?? 1);
    v.active = true;
    this._voices.push(v);
    this.stats.started++;
    this.stats.voices = this._voices.length;

    return { input: head, gain: g, pan, lowpass: lp, t, ctx, voice: v };
  }

  /**
   * A voice that is held open until something stops it: a drive bed, a cutting
   * beam, an ambience layer, a beam weapon. The caller owns its lifetime.
   */
  sustain(busName, spat, { level = 1, reverb = 1, filter = true } = {}) {
    if (!this.ready) return null;
    const ctx = this.ctx;
    const mixer = this.mixer;

    const g = mkGain(ctx, 0);           // callers ramp this up; never start hot
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(spat?.pan ?? 0, -1, 1);
    let head = pan;
    let lp = null;
    if (filter) {
      lp = biquad(ctx, 'lowpass', spat?.cutoff ?? SPACE.cutoffHi, 0.7);
      lp.connect(pan);
      head = lp;
    }
    pan.connect(g);
    g.connect(mixer.bus(busName));
    let send = null;
    if (reverb > 0 && MIX.send[busName] > 0) {
      send = mkGain(ctx, reverb * MIX.send[busName]);
      g.connect(send);
      send.connect(mixer.reverb.input);
    }

    const handle = {
      input: head, gain: g, pan, lowpass: lp, ctx,
      level,
      /**
       * Track a moving emitter. Smoothed so a fast pass does not zipper.
       * `when` exists so an offline render can schedule a whole performance in
       * advance - in an OfflineAudioContext `currentTime` never advances.
       */
      follow(s, tau = 0.08, when = null) {
        const t = when ?? ctx.currentTime;
        if (lp) lp.frequency.setTargetAtTime(clamp(s.cutoff, 60, ctx.sampleRate * 0.48), t, tau);
        pan.pan.setTargetAtTime(clamp(s.pan, -1, 1), t, tau);
        handle.spatialGain = s.gain;
      },
      spatialGain: spat?.gain ?? 1,
      setGain(v, tau = 0.06, when = null) {
        g.gain.setTargetAtTime(clamp(v, 0, 4), when ?? ctx.currentTime, tau);
      },
      stop(fade = 0.15, when = null) {
        const t = when ?? ctx.currentTime;
        // cancelAndHold, not cancelScheduledValues: a bare linear ramp after a
        // setTarget inherits the setTarget's START value, which for a voice that
        // faded in from zero means ramping from zero to zero. See synth.percEnv.
        rampTo(g.gain, t, 0, fade);
        handle.sources.forEach((s) => { try { s.stop(t + fade + 0.02); } catch { /* done */ } });
        setTimeoutSafe(() => {
          try { g.disconnect(); pan.disconnect(); lp?.disconnect(); send?.disconnect(); } catch { /* gone */ }
        }, (fade + 0.1) * 1000);
      },
      sources: [],
    };
    return handle;
  }

  /** Free any voice whose scheduled life has ended. Called once per frame. */
  sweep(now = this.now) {
    const v = this._voices;
    for (let i = v.length - 1; i >= 0; i--) {
      if (v[i].endTime > now) continue;
      this._release(v[i]);
      const last = v.length - 1;
      if (i !== last) v[i] = v[last];
      v.pop();
    }
    this.stats.voices = v.length;

    // Deferred suspend: pause has already faded the master, so this is free.
    if (this._suspendPending && !this._suspended && this.ctx?.suspend
        && now - this._pausedAt > SUSPEND_DELAY) {
      this._suspended = true;
      this._suspendPending = false;
      try { this.ctx.suspend().catch(() => {}); } catch { /* offline */ }
    }
  }

  _release(v) {
    for (const n of v.nodes) {
      try { n.disconnect(); } catch { /* context torn down */ }
    }
    v.nodes.length = 0;
    v.input = null;
    v.active = false;
    if (this._freeVoices.length < MAX_VOICES + 8) this._freeVoices.push(v);
  }

  /** Enforce the budget by evicting the least important live voice. */
  _makeRoom(priority) {
    if (this._voices.length < MAX_VOICES) return true;
    let worst = -1;
    let worstP = priority;
    for (let i = 0; i < this._voices.length; i++) {
      if (this._voices[i].priority < worstP) { worstP = this._voices[i].priority; worst = i; }
    }
    if (worst < 0) { this.stats.dropped++; return false; }
    this._release(this._voices[worst]);
    const last = this._voices.length - 1;
    if (worst !== last) this._voices[worst] = this._voices[last];
    this._voices.pop();
    this.stats.dropped++;
    return true;
  }

  stopAllVoices() {
    for (const v of this._voices) this._release(v);
    this._voices.length = 0;
    this.stats.voices = 0;
  }

  /** Duck the world buses. Thin passthrough so layers need not know the mixer. */
  duck(amount, hold, recover) { this.mixer?.duck(amount, hold, recover); }

  /** Convenience: a spatial record for something at the listener's own position. */
  here(out = this.spat) {
    out.gain = 1; out.pan = 0; out.cutoff = SPACE.cutoffHi; out.distance = 0; out.audible = true;
    return out;
  }
}

/** setTimeout that does not explode in an environment without one. */
function setTimeoutSafe(fn, ms) {
  if (typeof setTimeout === 'function') setTimeout(fn, ms);
}

export { clamp, lerp, dbToGain };
