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
 */

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

/** Minimum seconds between two voices of the same weapon type, before time scaling. */
const GATE = {
  cannon: 0.030, rail: 0.055, missile: 0.070, flak: 0.075, pd: 0.045,
  beam: 0, lance: 0, mining: 0,
};

/** How long a beam voice survives without a refresh before it releases. */
const BEAM_HOLD = 0.16;

export class WeaponAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    /** @type {Map<string, {handle:Object, until:number, type:string}>} */
    this.held = new Map();
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
        peak: 0.92 * fall, attack: 0.0008, tau: 0.016,
      });
      subThump(A, d, at, {
        f0: 92 * k, f1: 44 * k, sweepTime: 0.05, peak: 0.17 * fall, tau: 0.038,
      });
    }
    // Airburst shrapnel: the reason flak sounds like weather rather than gunfire.
    noiseBurst(A, d, t + 0.11 * S, {
      buffer: 'debris', type: 'highpass', freq: 820 * k, q: 0.7,
      peak: 0.30, attack: 0.02, tau: 0.24,
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
      ? { f: 112, beat: 1.05, band: 640, q: 2.6, sub: 41, subLvl: 0.45, drive: 3.2, noise: 0.16, am: 0, level: 1.55 }
      : type === 'mining'
        ? { f: 186, beat: 3.1, band: 820, q: 3.4, sub: 62, subLvl: 0.18, drive: 2.2, noise: 0.42, am: 26, level: 1.25 }
        : { f: 268, beat: 1.9, band: 1180, q: 2.1, sub: 67, subLvl: 0.20, drive: 1.6, noise: 0.22, am: 0, level: 1.50 };

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
      const amBias = mkGain(ctx, 1);
      // Drive the body's own gain: bias 1 plus a +/-0.42 square = a 58% duty chop.
      am.connect(amG);
      amG.connect(body.gain);
      startAt(am, t);
      handle.sources.push(am, amBias);
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
  }
}
