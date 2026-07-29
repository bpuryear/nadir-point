/**
 * WEAPONS.
 *
 * One instrument per entry in `WEAPON_TYPES`, and they have to be separable with
 * your eyes shut, because in a fleet action the mix is the only readout that tells
 * you what is being fired at you. The design brief for each:
 *
 *   cannon   percussive crack over a swept body. A mass driver is a controlled
 *            explosion behind a slug; the crack is the breach, the body is the gas.
 *   beam     sustained, harmonic, with a slow amplitude beat from two emitters
 *            that are not quite in phase. Held for as long as the trigger is.
 *   rail     charge, then snap. The charge is short - the event arrives at the
 *            instant of firing, so the wind-up has to live inside the shot.
 *   missile  a soft chuff, then a band of moving air that sweeps up as it leaves
 *            and drops as it goes away. Panned from the launcher toward the target.
 *   flak     a stutter. Six bursts inside a quarter of a second, then shrapnel.
 *   pd       fast dry ticks. Almost no tail, no sub, barely any reverb: point
 *            defence must never mask the thing it is shooting at.
 *   lance    the beam, an octave down, distorted, with real sub under it.
 *   mining   a cutter. Narrow band, hard amplitude modulation, industrial.
 *
 * FACTION COLOUR. Coalition weapons are lower, rougher and more saturated;
 * Concord's are higher, cleaner and tighter; derelict weapons are detuned into
 * ratios nobody would choose. Same instruments, different tuning - exactly how the
 * palette handles hulls.
 *
 * ===========================================================================
 * THE RIPPLE — and why its wiring is where it is
 * ===========================================================================
 *
 * `sim/salvo.js` walks a wave of single shots down one flank. Each of those shots
 * arrives here as an ordinary `WEAPON_FIRED` through `audio/index.js` and gets its
 * ordinary instrument, and left at that a ten-slot broadside is four identical cannon
 * reports and six identical launches with gaps in them. Two things turn that into one
 * event with a shape:
 *
 *   THE CONTOUR   slot k of n is answered by the MOUNT's own structure ringing, at
 *                 `size x (1 + (k - (n-1)/2) x 0.018)` per `firing-feel.md` §5.5.2 —
 *                 so the wave DESCENDS in pitch as it runs aft, and the ear can hear
 *                 which way it is travelling with the screen off. It is a layer under
 *                 the guns, not a modulation of them, deliberately: the gun voices are
 *                 opened by `audio/index.js`, which is a different stream's file.
 *
 *   THE FULL STOP one `subThump` at 38 Hz on `EV.SALVO_COMPLETE`, once per wave and
 *                 never per shot (§5.5.3). A wave that put NOTHING downrange gets the
 *                 dry mechanical settle without the sub — a battery that fired six
 *                 holes must not land like one that fired six rounds.
 *
 * WHY `listen(bus)` EXISTS AND IS PUBLIC. `installAudio` constructs `new
 * WeaponAudio(core)` (`audio/index.js:94`) and dispatches every audio event in the
 * game itself. `core` is an `AudioEngine`; it has an rng and three camera callbacks
 * and no world, no bus, no ships. So this file has NO ROUTE to `EV.SALVO_FIRED`,
 * `EV.WEAPON_FIRED` or `EV.SALVO_COMPLETE` on its own, and the installer that does is
 * not this stream's file. `listen(bus)` is therefore the seam: it is idempotent, it
 * owns its own unsubscribes, and it is called today from `vfx/weapons.js#_wireAudio`
 * for want of anywhere better. The correct home is one line inside `installAudio`, and
 * it is filed as a request; when it lands, nothing in THIS file changes.
 *
 * ONE THING THE SPEC ASKS FOR THAT IS NOT DONE, AND WHY. `firing-feel.md` §5.5 item 1
 * wants the gate key made per-mount so guns in a battery stop suppressing each other.
 * It is already per-mount: `audio/index.js:139-158` passes `key: mountKey(ship, mount)`
 * from a `WeakMap` keyed on the mount object (`:54-64`), and `fire()` gates on
 * `w:${type}:${key}`. And the gate cannot bite anyway — `AudioEngine.gate` compares
 * against `minInterval * this.stretch` (`engine.js:537`), and `stretch` is `1/timeScale`
 * (`:422`), so `GATE.cannon` 0.030 s scales with the clock exactly as `RIPPLE.stepMin`
 * 0.070 s does and stays 2.33x under it at every time scale the game offers. The spec
 * is describing a problem that does not exist.
 */

import { EV } from '../core/events.js';
import { clamp, gain as mkGain, biquad, osc, bufferSource, shaper, sweep, percEnv, startAt, stopAt } from './synth.js';
import { noiseBurst, subThump, metalRing, chirp, beatingPair } from './parts.js';

/** Per-faction tuning: pitch multiplier, saturation, and how ragged the ring is. */
const VOICE = {
  coalition: { f: 0.88, drive: 2.6, q: 0.85, ratio: 1.00 },
  concord: { f: 1.16, drive: 1.5, q: 1.45, ratio: 1.00 },
  derelict: { f: 0.97, drive: 2.1, q: 1.05, ratio: 1.07 },
  player: { f: 1.00, drive: 2.0, q: 1.00, ratio: 1.00 },
};

const voiceOf = (faction) => VOICE[faction] ?? VOICE.player;

/** A destructurable stand-in, so a payload-less emit cannot throw inside a handler. */
const EMPTY_EVENT = Object.freeze({});

/**
 * How big the WAVE is, which is not how big any one gun in it is.
 *
 * Deliberately hull-only and deliberately NOT `audio/index.js#weaponSize`: that helper
 * is private to the installer and it mixes weapon damage into the answer, which is
 * correct for a gun's own voice and wrong here. Every slot in one ripple must share one
 * size or the contour is riding on two variables at once and stops being a direction cue.
 * Computed once per wave, at arm time.
 */
const waveSize = (ship) => clamp(
  0.70 + 0.55 * Math.min(1.8, (ship?.classDef?.length ?? 400) / 900), 0.70, 1.65,
);

/** Minimum seconds between two voices of the same weapon type, before time scaling. */
const GATE = {
  cannon: 0.030, rail: 0.055, missile: 0.070, flak: 0.075, pd: 0.045,
  beam: 0, lance: 0, mining: 0,
};

/** How long a beam voice survives without a refresh before it releases. */
const BEAM_HOLD = 0.16;

/**
 * THE WAVE. Every number here is `firing-feel.md` §6.6, or is derived from one that is.
 *
 * `sizeExp` is not a new constant: it is the 0.55 that `_cannon` already raises `size`
 * to inside `_cannon` (`k = v.f / Math.pow(size, 0.55)`). §5.5 specifies the contour as a
 * multiplier on `size`, so the frequency it actually produces is `size^-0.55` and that
 * is what `salvoPitch` returns. Naming it here rather than re-deriving it means the
 * contour cannot silently invert if that exponent is ever retuned.
 */
export const SALVO_AUDIO = {
  pitchWalk: 0.018,    // per slot from the centre of the wave (§6.6 `pitchWalk`)
  sizeExp: 0.55,       // `_cannon`'s own size->pitch exponent, quoted not invented
  terminalHz: 38,      // (§6.6 `terminalSub`)
  terminalTo: 30,      // where the sub settles; SUB_FLOOR in parts.js is 23
  terminalTau: 0.42,   // s (§6.6)
  thinAbove: 2.0,      // time scale above which the contour thins (§5.5, §6.6)
  thinSize: 1.15,      // the survivors get heavier, so the wave keeps its weight
  slotPeak: 0.34,
  slotTau: 0.058,
};

/**
 * The `size` multiplier for slot k of n, verbatim from `firing-feel.md` §5.5 item 2.
 * Centred, so a wave's mean size is unchanged and only its SHAPE is added.
 */
export function salvoSize(index, slotCount) {
  const n = Math.max(1, slotCount | 0);
  return 1 + (index - (n - 1) / 2) * SALVO_AUDIO.pitchWalk;
}

/**
 * ...and the frequency multiplier that size produces. Bigger gun, lower everything —
 * so this DESCENDS across the wave, which is the direction cue: the ripple runs from
 * the bow aft and the pitch falls as it goes.
 */
export function salvoPitch(index, slotCount) {
  return Math.pow(salvoSize(index, slotCount), -SALVO_AUDIO.sizeExp);
}

/**
 * §5.5's time-scale rule. Above 2x a 1.25 s sweep is under 310 ms of wall clock and
 * every beat in it lands on top of the last, so the contour thins to the first slot,
 * the last slot and every second slot between. The shape survives; the zip does not.
 *
 * Only the CONTOUR thins. The gun voices themselves are `audio/index.js`'s to thin and
 * they are not thinned today — see the note in the header about where this wiring lives.
 */
export function salvoThinned(index, slotCount, timeScale) {
  if (!(timeScale > SALVO_AUDIO.thinAbove)) return false;
  if (index <= 0 || index >= slotCount - 1) return false;
  return (index & 1) === 1;
}

export class WeaponAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    /** @type {Map<string, {handle:Object, until:number, type:string}>} */
    this.held = new Map();

    /**
     * The wave in flight. ONE record, mutated, never replaced. `lx/ly/lz` is a COPY of
     * the last slot's muzzle position because `EV.WEAPON_FIRED.origin` is a Vector3 the
     * salvo controller owns and rewrites every shot (`core/events.js:110-115`), and the
     * terminal thump is scheduled after the wave is over.
     */
    this.wave = {
      active: false, ship: null, side: null, n: 0, index: 0,
      faction: 'player', size: 1, lx: 0, ly: 0, lz: 0,
    };

    /**
     * Countable evidence that the wave was heard, for a headless harness that has no
     * AudioContext to render. `slots` counts wave slots recognised, `voiced` those that
     * actually opened a contour voice, `thinned` those the time-scale rule dropped.
     * `voiced + thinned === slots` whenever the engine was ready.
     */
    this.stats = { waves: 0, slots: 0, voiced: 0, thinned: 0, terminal: 0, silent: 0, errors: 0 };

    /** Scratch spatial record. Kept off `AudioEngine.spat`, which other handlers share. */
    this._spat = { gain: 0, pan: 0, cutoff: 19000, distance: 0, audible: false };

    this._bus = null;
    this._offs = [];
    // Bound once so `unlisten` can actually remove them.
    this._onSalvoFired = (e) => this._guard(this._salvoFired, e);
    this._onWeaponFired = (e) => this._guard(this._weaponFired, e);
    this._onSalvoComplete = (e) => this._guard(this._salvoComplete, e);
  }

  // ------------------------------------------------------------------- the wave

  /**
   * Subscribe to the ripple. Idempotent: called again with the same bus it returns
   * immediately, called with a different one it detaches the old first.
   *
   * @param {import('../core/events.js').EventBus} bus
   * @returns {WeaponAudio} this
   */
  listen(bus) {
    if (!bus || typeof bus.on !== 'function' || bus === this._bus) return this;
    this.unlisten();
    this._bus = bus;
    this._offs.push(bus.on(EV.SALVO_FIRED, this._onSalvoFired));
    this._offs.push(bus.on(EV.WEAPON_FIRED, this._onWeaponFired));
    this._offs.push(bus.on(EV.SALVO_COMPLETE, this._onSalvoComplete));
    return this;
  }

  /** Detach. Safe to call when never attached. */
  unlisten() {
    for (const off of this._offs) { try { off(); } catch { /* already detached */ } }
    this._offs.length = 0;
    this._bus = null;
    this.wave.active = false;
    this.wave.ship = null;
  }

  /**
   * `EventBus.emit` catches a throwing handler and `console.error`s it, and
   * `tools/smoke.mjs` fails the build on a console error. Audio is not worth failing
   * a boot gate over, so every handler is swallowed here and counted instead — the
   * same bargain `audio/index.js:110` already makes for its own listeners.
   */
  _guard(fn, e) {
    try { fn.call(this, e ?? EMPTY_EVENT); } catch { this.stats.errors++; }
  }

  /**
   * A ripple has been armed. Emitted ONCE, at arm time, strictly before any of its
   * `WEAPON_FIRED` — so there is no handler-ordering question between this and the
   * shots it describes, whatever order the installers ran in.
   */
  _salvoFired({ ship, side, slotCount }) {
    const w = this.wave;
    w.active = true;
    w.ship = ship ?? null;
    w.side = side ?? null;
    w.n = Math.max(1, slotCount | 0);
    w.index = 0;
    w.faction = ship?.faction ?? 'player';
    w.size = waveSize(ship);
    const p = ship?.position;
    if (p) { w.lx = p.x; w.ly = p.y; w.lz = p.z; }
    this.stats.waves++;
  }

  /**
   * One shot. Most of them are not ours: this handler runs for every gun in the battle.
   *
   * A shot belongs to the wave only if it came from the wave's hull AND names a barrel.
   * `emitter` is an index into the ModuleDef's static `muzzles` when `sim/salvo.js`
   * fired the shot and `undefined` on the automatic path (`combat.js:276`), so that one
   * test keeps an AUTO flak cluster on the same hull out of the contour — otherwise a
   * ten-slot broadside would sound like fourteen and the melody would be nonsense.
   */
  _weaponFired(e) {
    const w = this.wave;
    if (!w.active || e.ship !== w.ship) return;
    if (!Number.isFinite(e.emitter)) return;
    const k = w.index++;
    const o = e.origin;
    if (o && Number.isFinite(o.x)) { w.lx = o.x; w.ly = o.y; w.lz = o.z; }
    this.stats.slots++;

    const A = this.audio;
    if (!A.ready || A.paused) return;
    if (salvoThinned(k, w.n, A.timeScale)) { this.stats.thinned++; return; }
    const spat = A.spatialAt(w.lx, w.ly, w.lz, this._spat);
    if (!spat.audible) return;
    if (this._slot(k, w.n, spat, e.type)) this.stats.voiced++;
  }

  /**
   * The contour layer: the mount answering its own shot.
   *
   * Not a shell and not a report — those are the gun's instrument and they are already
   * playing. This is the structure the gun is bolted to, and it is inharmonic on
   * purpose (a struck plate, not a string). It is the layer that carries the pitch
   * walk, because it is the only layer this file gets to open per slot.
   */
  _slot(index, slotCount, spat, type) {
    const A = this.audio;
    const w = this.wave;
    const v = voiceOf(w.faction);
    const thin = A.timeScale > SALVO_AUDIO.thinAbove ? SALVO_AUDIO.thinSize : 1;
    // Bigger hull, lower structure; then the wave's own descent on top of it.
    const k = (v.f / Math.pow(w.size, 0.35)) * salvoPitch(index, slotCount);
    const soft = type === 'missile' ? 0.55 : 1;

    const V = A.voice('weapons', spat, { duration: 0.34, priority: 0.5, reverb: 0.85 });
    if (!V) return false;
    const { input: d, t } = V;

    metalRing(A, d, t, {
      freqs: [388 * k * v.ratio, 611 * k, 917 * k * v.ratio],
      q: 9 * v.q, peak: SALVO_AUDIO.slotPeak * thin * soft,
      tau: SALVO_AUDIO.slotTau, exciteMs: 1.4,
    });
    // A little air moving in the casemate under it, so the ring has a body and does
    // not read as a triangle-wave blip when six of them run past in a second.
    noiseBurst(A, d, t + 0.004, {
      buffer: 'brown', type: 'bandpass', freq: 250 * k, q: 1.2,
      peak: 0.19 * thin * soft, attack: 0.0025, tau: 0.048,
    });
    return true;
  }

  /**
   * The last slot has resolved. One sub, once, at the last muzzle that spoke.
   *
   * `fired === 0` gets the settle WITHOUT the sub. That distinction is the whole point
   * of `EV.SALVO_COMPLETE` carrying `fired`/`dropped` separately: a wave of holes is a
   * different event from a wave of rounds and it must not be given the same weight.
   */
  _salvoComplete({ ship, fired }) {
    const w = this.wave;
    if (!w.active) return;
    if (w.ship !== null && ship !== w.ship) return;
    w.active = false;
    w.ship = null;

    const A = this.audio;
    if (!A.ready || A.paused) return;
    const spat = A.spatialAt(w.lx, w.ly, w.lz, this._spat);
    if (!spat.audible) return;
    const V = A.voice('weapons', spat, { duration: 1.0, priority: 1.8, reverb: 1.25 });
    if (!V) return;
    const { input: d, t } = V;
    const v = voiceOf(w.faction);
    const k = v.f / Math.pow(w.size, 0.35);
    const landed = fired > 0;

    if (landed) {
      subThump(A, d, t, {
        f0: SALVO_AUDIO.terminalHz, f1: SALVO_AUDIO.terminalTo,
        sweepTime: 0.16, peak: 0.66, attack: 0.007,
        tau: SALVO_AUDIO.terminalTau, drive: v.drive * 0.45,
      });
      this.stats.terminal++;
    } else {
      this.stats.silent++;
    }

    // The battery going down together - the mechanical "clunk" of a whole flank
    // reaching its cooldown on one frame. Louder when nothing fired, because then it
    // is the ONLY thing the player gets and it has to be legible as a refusal.
    metalRing(A, d, t + 0.030, {
      freqs: [214 * k * v.ratio, 331 * k, 497 * k * v.ratio],
      q: 6 * v.q, peak: landed ? 0.22 : 0.40, tau: 0.11, exciteMs: 2.6,
    });
  }

  /**
   * @param {string} type      one of WEAPON_TYPES
   * @param {Object} spat      from AudioEngine.spatialAt
   * @param {Object} [opts]
   * @param {string} [opts.faction]
   * @param {number} [opts.size]   0.5 tiny .. 1.8 capital; scales pitch down and tail up
   * @param {string} [opts.key]    identity for sustained weapons (one per mount)
   * @param {Object} [opts.travel] { pan, cutoff } at the aim point, for missile doppler
   */
  fire(type, spat, opts = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;

    if (type === 'beam' || type === 'lance' || type === 'mining') {
      return this._sustain(type, spat, opts);
    }
    const g = GATE[type] ?? 0.03;
    if (g > 0 && !A.gate(`w:${type}:${opts.key ?? ''}`, g)) return false;

    switch (type) {
      case 'cannon': return this._cannon(spat, opts);
      case 'rail': return this._rail(spat, opts);
      case 'missile': return this._missile(spat, opts);
      case 'flak': return this._flak(spat, opts);
      case 'pd': return this._pd(spat, opts);
      default: return this._cannon(spat, opts);
    }
  }

  // ------------------------------------------------------------------ cannon

  _cannon(spat, { faction = 'player', size = 1 } = {}) {
    const A = this.audio;
    const v = voiceOf(faction);
    const k = v.f / Math.pow(size, 0.55);         // bigger gun, lower everything
    const V = A.voice('weapons', spat, { duration: 0.75 * size, priority: 1.2, reverb: 0.9 });
    if (!V) return false;
    const { input: d, t } = V;

    // 1. the breach crack - the only part above 1 kHz, and it is what carries at range
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'bandpass', freq: 2350 * k, q: 0.9 * v.q,
      peak: 1.45, attack: 0.0012, tau: 0.018 * size,
    });
    // 2. the gas body, saturated. This is the "crack" becoming a "boom".
    subThump(A, d, t + 0.002, {
      f0: 172 * k, f1: 47 * k, sweepTime: 0.075 * size, peak: 0.62,
      attack: 0.003, tau: 0.072 * size, type: 'triangle', drive: v.drive,
    });
    // 3. the weight underneath - sub only, no transient
    subThump(A, d, t + 0.006, {
      f0: 63 * k, f1: 27 * k, sweepTime: 0.16 * size, peak: 0.30,
      attack: 0.008, tau: 0.112 * size,
    });
    // 4. muzzle blast: low broadband collapsing downward
    noiseBurst(A, d, t + 0.004, {
      buffer: 'brown', type: 'lowpass', freq: 620 * k, sweepTo: 130 * k, q: 1.1,
      peak: 0.42, attack: 0.004, tau: 0.082 * size, drive: v.drive * 0.5,
    });
    // 5. the mount itself, ringing
    metalRing(A, d, t + 0.010, {
      freqs: [512 * k * v.ratio, 907 * k * v.ratio * 1.02, 1447 * k],
      q: 8 * v.q, peak: 0.48, tau: 0.062 * size,
    });
    return true;
  }

  // -------------------------------------------------------------------- rail

  _rail(spat, { faction = 'player', size = 1 } = {}) {
    const A = this.audio;
    const v = voiceOf(faction);
    const k = v.f / Math.pow(size, 0.5);
    const charge = 0.145 * size;
    const V = A.voice('weapons', spat, { duration: 1.0 * size, priority: 1.6, reverb: 1.15 });
    if (!V) return false;
    const { input: d, t } = V;

    // CHARGE. Accelerator coils spooling: a rising tone plus a rising band of noise,
    // both crescendoing into the release. It is short because the event arrives at
    // the moment of firing - a real pre-charge would need combat to tell us a shot
    // is coming, and that is a coupling this stream refuses to take.
    chirp(A, d, t, {
      f0: 118 * k, f1: 940 * k, duration: charge, peak: 0.20,
      type: 'sawtooth', attack: charge * 0.8, tau: 0.012, partials: 2, detune: 11,
      lowpass: 2600 * k,
    });
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'bandpass', freq: 420 * k, sweepTo: 3400 * k, q: 3.4,
      peak: 0.22, attack: charge * 0.9, tau: 0.02, duration: charge + 0.05,
    });

    const s = t + charge;
    // SNAP. Four hundredths of a second of very bright transient - this is the
    // loudest, shortest thing in the game.
    noiseBurst(A, d, s, {
      buffer: 'white', type: 'highpass', freq: 3100 * k, q: 0.7,
      peak: 1.25, attack: 0.0004, tau: 0.0095,
    });
    metalRing(A, d, s, {
      freqs: [1820 * k * v.ratio, 2780 * k, 4390 * k * v.ratio], q: 22 * v.q,
      peak: 0.52, tau: 0.135 * size, exciteMs: 1.6,
    });
    // The rail's own weight: much deeper and much longer than a cannon's.
    subThump(A, d, s, {
      f0: 98 * k, f1: 26 * k, sweepTime: 0.13 * size, peak: 0.60,
      attack: 0.0015, tau: 0.128 * size, drive: v.drive,
    });
    noiseBurst(A, d, s + 0.006, {
      buffer: 'brown', type: 'lowpass', freq: 900 * k, sweepTo: 95 * k, q: 1.3,
      peak: 0.34, attack: 0.003, tau: 0.115 * size,
    });
    return true;
  }

  // ----------------------------------------------------------------- missile

  _missile(spat, { faction = 'player', size = 1, travel = null } = {}) {
    const A = this.audio;
    const ctx = A.ctx;
    const v = voiceOf(faction);
    const k = v.f;
    const S = A.stretch;
    const flight = 1.55 * size;
    const V = A.voice('weapons', spat, { duration: flight + 0.4, priority: 1.0, reverb: 0.7 });
    if (!V) return false;
    const { input: d, t, pan } = V;

    // Launch: the rail chuff and the motor catching.
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'lowpass', freq: 1100 * k, sweepTo: 260 * k, q: 1.0,
      peak: 0.6, attack: 0.003, tau: 0.075,
    });
    subThump(A, d, t, { f0: 84 * k, f1: 38 * k, sweepTime: 0.08, peak: 0.42, tau: 0.10 });

    // WHOOSH. A band of moving air that opens as the motor comes up and closes as
    // the missile leaves: three-point sweep on both the filter and the source rate,
    // which is what makes it read as something passing rather than something firing.
    // PINK, not brown. A 2nd-order bandpass rolls off at 6 dB/octave and brown
    // noise rises at 6 dB/octave, so brown through a bandpass is flat below the
    // centre - i.e. it is not band-limited at all, and the whoosh comes out as a
    // rumble. Pink plus a highpass gives an actual band of moving air.
    const buf = A.buffers.pink;
    const src = bufferSource(ctx, buf, { loop: true, rate: A.pitch });
    const hp = biquad(ctx, 'highpass', 140 * k * A.pitch, 0.8);
    const bp = biquad(ctx, 'bandpass', 230 * k * A.pitch, 2.2);
    const g = mkGain(ctx, 0);
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(d);

    const dur = flight * S;
    sweep(bp.frequency, t, [
      [0, 230 * k * A.pitch],
      [dur * 0.34, 880 * k * A.pitch],
      [dur, 300 * k * A.pitch],
    ]);
    // Doppler: the motor's own note rises as it accelerates away then falls off.
    sweep(src.playbackRate, t, [
      [0, 0.9 * A.pitch],
      [dur * 0.3, 1.09 * A.pitch],
      [dur, 0.86 * A.pitch],
    ]);
    percEnv(g.gain, t, { peak: 2.4, attack: 0.09 * S, hold: dur * 0.45, tau: 0.26 * S, duration: dur + 0.3 * S });
    startAt(src, t, A.rng.next() * buf.duration);
    stopAt(src, t + dur + 0.35 * S);

    // Pan the whole voice from the launcher toward where it is going. This is the
    // only place in the stream where a voice moves, and it is worth it: a missile
    // crossing the frame is the clearest spatial cue we have.
    if (travel && Number.isFinite(travel.pan)) {
      pan.pan.setValueAtTime(clamp(spat.pan ?? 0, -1, 1), t);
      pan.pan.linearRampToValueAtTime(clamp(travel.pan, -1, 1), t + dur);
    }
    return true;
  }

  // -------------------------------------------------------------------- flak

  _flak(spat, { faction = 'player', size = 1 } = {}) {
    const A = this.audio;
    const v = voiceOf(faction);
    const k = v.f;
    const S = A.stretch;
    const V = A.voice('weapons', spat, { duration: 0.85, priority: 1.1, reverb: 1.0 });
    if (!V) return false;
    const { input: d, t } = V;

    // The stutter. Uneven spacing - a perfectly regular burst reads as a drum
    // machine, and the whole character of flak is that it is a ragged wall.
    const shots = 6;
    for (let i = 0; i < shots; i++) {
      const at = t + (i * 0.036 + (i > 0 ? A.rng.next() * 0.012 : 0)) * S;
      const fall = 1 - i * 0.09;
      noiseBurst(A, d, at, {
        buffer: 'white', type: 'bandpass', freq: (1500 + i * 90) * k, q: 1.3 * v.q,
        peak: 1.25 * fall, attack: 0.0008, tau: 0.016,
      });
      subThump(A, d, at, {
        f0: 92 * k, f1: 44 * k, sweepTime: 0.05, peak: 0.17 * fall, tau: 0.038,
      });
    }
    // Airburst shrapnel: the reason flak sounds like weather rather than gunfire.
    noiseBurst(A, d, t + 0.11 * S, {
      buffer: 'debris', type: 'highpass', freq: 820 * k, q: 0.7,
      peak: 0.42, attack: 0.02, tau: 0.24,
    });
    noiseBurst(A, d, t + 0.09 * S, {
      buffer: 'brown', type: 'lowpass', freq: 300 * k, q: 1.0,
      peak: 0.19, attack: 0.03, tau: 0.13,
    });
    return true;
  }

  // ---------------------------------------------------------------------- pd

  _pd(spat, { faction = 'player' } = {}) {
    const A = this.audio;
    const v = voiceOf(faction);
    const k = v.f;
    const S = A.stretch;
    // Dry, tight, cheap. Point defence runs constantly and must sit under
    // everything else; the moment it has a tail the mix turns to mush.
    const V = A.voice('weapons', spat, { duration: 0.22, priority: 0.35, reverb: 0.12 });
    if (!V) return false;
    const { input: d, t } = V;

    const ticks = 4;
    for (let i = 0; i < ticks; i++) {
      const at = t + i * 0.026 * S;
      const fall = 1 - i * 0.11;
      noiseBurst(A, d, at, {
        buffer: 'white', type: 'highpass', freq: 2300 * k, q: 0.6,
        peak: 0.85 * fall, attack: 0.0003, tau: 0.0055,
      });
      // A little body under the tick. Without it point defence is pure air and
      // disappears entirely the moment anything else is happening.
      noiseBurst(A, d, at, {
        buffer: 'white', type: 'bandpass', freq: 880 * k, q: 1.4,
        peak: 0.42 * fall, attack: 0.0004, tau: 0.007,
      });
      metalRing(A, d, at, {
        freqs: [1630 * k, 2410 * k], q: 11, peak: 0.30 * fall, tau: 0.016, exciteMs: 0.8,
      });
    }
    return true;
  }

  // --------------------------------------------------------- sustained beams

  _sustain(type, spat, { faction = 'player', size = 1, key = 'beam' } = {}) {
    const A = this.audio;
    const id = `${type}:${key}`;
    const now = A.now;
    const existing = this.held.get(id);
    if (existing) {
      existing.until = now + BEAM_HOLD;
      existing.handle.follow(spat);
      existing.handle.setGain(existing.level * spat.gain, 0.06);
      return true;
    }
    const h = this._buildBeam(type, spat, faction, size);
    if (!h) return false;
    this.held.set(id, { handle: h.handle, until: now + BEAM_HOLD, type, level: h.level });
    return true;
  }

  _buildBeam(type, spat, faction, size) {
    const A = this.audio;
    const ctx = A.ctx;
    const v = voiceOf(faction);
    const handle = A.sustain('weapons', spat, { reverb: type === 'mining' ? 0.5 : 0.9 });
    if (!handle) return null;
    const d = handle.input;
    const t = A.now;

    // Tuning per energy weapon. `beat` is the audible pulse from two emitters
    // running a hair apart, and it is the single detail that stops a sustained
    // tone sounding like a test signal.
    const spec = type === 'lance'
      ? { f: 112, beat: 1.05, band: 640, q: 2.6, sub: 41, subLvl: 0.45, drive: 3.2, noise: 0.16, am: 0, level: 1.00 }
      : type === 'mining'
        ? { f: 186, beat: 3.1, band: 820, q: 3.4, sub: 62, subLvl: 0.18, drive: 2.2, noise: 0.42, am: 26, level: 0.80 }
        : { f: 268, beat: 1.9, band: 1180, q: 2.1, sub: 67, subLvl: 0.20, drive: 1.6, noise: 0.22, am: 0, level: 0.95 };

    const k = v.f / Math.pow(size, 0.35);

    const body = mkGain(ctx, 1);
    const sat = shaper(ctx, spec.drive * (v.drive / 2));
    body.connect(sat);
    const band = biquad(ctx, 'bandpass', spec.band * k * A.pitch, spec.q * v.q);
    sat.connect(band);
    band.connect(d);

    const pair = beatingPair(A, body, {
      f: spec.f * k * v.ratio, beatHz: spec.beat, type: 'sawtooth', level: 0.5,
    });
    for (const o of pair.oscillators) { startAt(o, t); handle.sources.push(o); }

    // Sub layer, straight to the output: it must not go through the bandpass or
    // the weapon loses all its weight.
    const sub = osc(ctx, 'sine', spec.sub * k * A.pitch);
    const subG = mkGain(ctx, spec.subLvl);
    sub.connect(subG); subG.connect(d);
    startAt(sub, t);
    handle.sources.push(sub);

    // Plasma hiss.
    const nbuf = A.buffers.white;
    const nsrc = bufferSource(ctx, nbuf, { loop: true, rate: A.pitch });
    const nf = biquad(ctx, 'bandpass', 3200 * k * A.pitch, 1.4);
    const ng = mkGain(ctx, spec.noise);
    nsrc.connect(nf); nf.connect(ng); ng.connect(d);
    startAt(nsrc, t, A.rng.next() * nbuf.duration);
    handle.sources.push(nsrc);

    // A slow wander on the band so the tone breathes.
    const lfo = osc(ctx, 'sine', 0.37 * A.pitch);
    const lfoG = mkGain(ctx, spec.band * 0.16 * k * A.pitch);
    lfo.connect(lfoG); lfoG.connect(band.frequency);
    startAt(lfo, t);
    handle.sources.push(lfo);

    // Mining cutters chop. Hard, fast amplitude modulation is the difference
    // between "energy weapon" and "industrial tool".
    if (spec.am > 0) {
      const am = osc(ctx, 'square', spec.am * A.pitch);
      const amG = mkGain(ctx, 0.42);
      // Drive the body's own gain: its value of 1 plus a +/-0.42 square is a chop
      // between 58% and 142%, which is a tool biting rather than a tremolo.
      am.connect(amG);
      amG.connect(body.gain);
      startAt(am, t);
      handle.sources.push(am);
    }

    handle.setGain(spec.level * spat.gain, 0.045);
    return { handle, level: spec.level };
  }

  /** Release beams that stopped being refreshed. Called from the render system. */
  update() {
    const A = this.audio;
    if (!A.ready) return;
    const now = A.now;
    for (const [id, rec] of this.held) {
      if (rec.until > now) continue;
      rec.handle.stop(0.16);
      this.held.delete(id);
    }
  }

  stopAll(fade = 0.08) {
    for (const [, rec] of this.held) rec.handle.stop(fade);
    this.held.clear();
    // A wave in flight when the world goes away has no completion coming, and a stale
    // `active` would make the next hull's first shot slot 7 of a salvo nobody fired.
    this.wave.active = false;
    this.wave.ship = null;
    this.wave.index = 0;
  }

  /**
   * Release everything and stop listening. `installAudio.dispose()` calls `stopAll`
   * today and not this, so the bus subscriptions outlive a disposed audio stream —
   * harmless (every path early-returns on `!A.ready`) but it is a leak across an
   * install/dispose cycle, and moving that one call is part of the filed request.
   */
  dispose(fade = 0.02) {
    this.unlisten();
    this.stopAll(fade);
  }
}
