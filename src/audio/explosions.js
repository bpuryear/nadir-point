/**
 * EXPLOSIONS.
 *
 * The most important sound in the game and the one with the least margin for
 * error, because the difference between the two kinds of kill is the difference
 * between the two ways to play:
 *
 *   HULL KILL         you shot the ship apart. Loud, low, over in three seconds.
 *   CATASTROPHIC KILL you popped the reactor. Everything you came for is gone.
 *
 * They are not the same sound at different volumes. A reactor kill has:
 *   - a pre-collapse: two tenths of a second of RISING energy before the blast,
 *     the only upward gesture in the entire explosion vocabulary;
 *   - a whiter, harder transient with real content above 4 kHz;
 *   - an inharmonic FM scream layered into the body - something that should not
 *     be making a noise, making one;
 *   - a sub tail three to four times as long, an octave lower at the bottom.
 *
 * SCALE IS PITCH. `f0` falls with the cube-ish root of the hull radius, so a
 * 1.4 km cruiser detonates around 39 Hz and an 18 m fighter around 90. Nothing
 * about a large explosion is "the same thing, louder" - large things are lower and
 * they take longer to finish, and both of those are visible on the probe plot.
 */

import { clamp, gain as mkGain, biquad, osc, bufferSource, shaper, fmVoice, ringMod, percEnv, sweep, startAt, stopAt } from './synth.js';
import { noiseBurst, subThump, metalRing, chirp } from './parts.js';

/** Reference radius: a destroyer. Everything is expressed relative to this. */
const REF_RADIUS = 200;

export class ExplosionAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
  }

  /**
   * @param {Object} spat
   * @param {Object} opts
   * @param {number} [opts.radius]        hull radius in metres
   * @param {boolean}[opts.catastrophic]  reactor containment loss
   * @param {string} [opts.faction]
   */
  detonate(spat, { radius = REF_RADIUS, catastrophic = false, faction = 'player' } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('x:det', 0.045)) return false;
    // s > 1 means bigger than a destroyer. Compress hard: a cruiser is only about
    // three times a destroyer's radius but must not be three times as long.
    const s = clamp(Math.pow(radius / REF_RADIUS, 0.62), 0.35, 3.4);
    return catastrophic ? this._reactor(spat, s, faction) : this._hull(spat, s, faction);
  }

  // ------------------------------------------------------------- hull kill

  _hull(spat, s, faction) {
    const A = this.audio;
    const f0 = 62 / Math.pow(s, 0.62);
    // Size scales PITCH linearly and TIME by its square root. A cruiser is three
    // times a destroyer's radius; if its tail were three times as long it would
    // still be sounding when the next engagement started.
    const ts = Math.sqrt(s);
    const dur = 2.4 * ts + 1.4;
    const V = A.voice('impacts', spat, {
      duration: dur, priority: 6 + s, reverb: 1.35, level: 1.0,
    });
    if (!V) return false;
    const { input: d, t } = V;

    // 1. FLASH. Wideband, collapsing downward within a tenth of a second.
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'lowpass', freq: 7200, sweepTo: 620, q: 1.1,
      peak: 0.55, attack: 0.0018, tau: 0.085 * ts, drive: 2.2,
    });
    // 2. BODY. The fireball: brown noise driven hard through a lowpass that shuts.
    noiseBurst(A, d, t + 0.004, {
      buffer: 'brown', type: 'lowpass', freq: 2300, sweepTo: 95, q: 1.7,
      peak: 0.60, attack: 0.008, tau: 0.42 * ts, drive: 3.0,
    });
    // 3. SUB. The part you feel. Two layers, the second slower and lower.
    subThump(A, d, t, {
      f0, f1: f0 * 0.42, sweepTime: 0.5 * ts, peak: 0.95,
      attack: 0.004, tau: 0.40 * ts, drive: 1.6,
    });
    subThump(A, d, t + 0.05, {
      f0: f0 * 0.66, f1: f0 * 0.40, sweepTime: 0.9 * ts, peak: 0.50,
      attack: 0.03, tau: 0.62 * ts,
    });
    // 4. The hull coming apart - resonance falling as the structure opens.
    metalRing(A, d, t + 0.02, {
      freqs: [f0 * 3.1, f0 * 5.4, f0 * 8.3], q: 9, peak: 0.55,
      tau: 0.5 * ts, sweepOctaves: -0.7,
    });
    // 5. Debris and grind, arriving late and running long.
    noiseBurst(A, d, t + 0.09, {
      buffer: 'grind', type: 'lowpass', freq: 1500, sweepTo: 240, q: 1.2,
      peak: 0.32, attack: 0.05, tau: 0.62 * ts, drive: 2.0,
    });
    noiseBurst(A, d, t + 0.16, {
      buffer: 'debris', type: 'bandpass', freq: 950, sweepTo: 330, q: 0.9,
      peak: 0.34, attack: 0.16, tau: 0.85 * ts,
    });

    A.duck(0.30 * clamp(s, 0.4, 1.4), 0.30, 1.1);
    return true;
  }

  // ---------------------------------------------------- catastrophic kill

  _reactor(spat, s, faction) {
    const A = this.audio;
    const ctx = A.ctx;
    const S = A.stretch;
    // Lower than a hull kill of the same size, and much longer.
    const f0 = 48 / Math.pow(s, 0.66);
    const ts = Math.sqrt(s);
    const pre = 0.21 * ts;
    const dur = 5.0 * ts + 2.6;
    const V = A.voice('impacts', spat, {
      duration: dur, priority: 12 + s, reverb: 1.6, level: 1.05,
    });
    if (!V) return false;
    const { input: d, t } = V;

    // --- PRE-COLLAPSE. The only rising gesture in the vocabulary. -----------
    chirp(A, d, t, {
      f0: 165, f1: 2700, duration: pre, peak: 0.26, type: 'sawtooth',
      attack: pre * 0.85, tau: 0.02, partials: 3, detune: 19, lowpass: 5600,
    });
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'bandpass', freq: 520, sweepTo: 4600, q: 3.2,
      peak: 0.16, attack: pre * 0.9, tau: 0.025, duration: pre + 0.06,
    });

    const b = t + pre * S;

    // --- BLAST -------------------------------------------------------------
    // Whiter and harder than a hull kill: the containment field goes before the
    // fuel does, so the first thing out is not fire, it is light.
    noiseBurst(A, d, b, {
      buffer: 'white', type: 'lowpass', freq: 14000, sweepTo: 1500, q: 0.9,
      peak: 0.70, attack: 0.0009, tau: 0.12 * ts, drive: 3.4,
    });
    noiseBurst(A, d, b + 0.006, {
      buffer: 'brown', type: 'lowpass', freq: 3200, sweepTo: 62, q: 1.9,
      peak: 0.72, attack: 0.006, tau: 0.9 * ts, drive: 3.6,
    });

    // --- THE TAIL. This is what separates the two kills on a spectrum plot. --
    subThump(A, d, b, {
      f0, f1: f0 * 0.40, sweepTime: 1.4 * ts, peak: 1.00,
      attack: 0.003, tau: 0.70 * ts, drive: 1.8,
    });
    subThump(A, d, b + 0.08, {
      f0: f0 * 0.58, f1: f0 * 0.36, sweepTime: 2.2 * ts, peak: 0.55,
      attack: 0.05, tau: 1.02 * ts,
    });

    // --- CONTAINMENT SHIMMER ------------------------------------------------
    // Ring modulation: a field oscillating at a frequency that has no business
    // existing, chopping a bright noise bed. Sum and difference tones, no
    // fundamental. Nothing else in the game sounds like this.
    {
      const modOsc = osc(ctx, 'sine', 47 * A.pitch);
      const rm = ringMod(ctx, modOsc);
      const src = bufferSource(ctx, A.buffers.sparkle, { loop: true, rate: A.pitch });
      const hp = biquad(ctx, 'highpass', 1400 * A.pitch, 0.7);
      const g = mkGain(ctx, 0);
      src.connect(hp); hp.connect(rm); rm.connect(g); g.connect(d);
      const total = 2.4 * ts * S;
      percEnv(g.gain, b, { peak: 0.46, attack: 0.02 * S, hold: 0.15 * S, tau: 0.62 * ts * S, duration: total });
      sweep(modOsc.frequency, b, [[0, 47 * A.pitch], [total, 12 * A.pitch]]);
      startAt(modOsc, b);
      startAt(src, b, A.rng.next() * A.buffers.sparkle.duration);
      stopAt(modOsc, b + total + 0.05);
      stopAt(src, b + total + 0.05);
    }

    // --- THE SCREAM ---------------------------------------------------------
    // Two-operator FM at an irrational ratio. Inharmonic, unstable, and it falls
    // for two seconds. This is the sound of the thing you were trying to salvage.
    {
      const fm = fmVoice(ctx, {
        carrierHz: 88 * A.pitch / Math.pow(s, 0.4), ratio: 1.4142, index: 900 * A.pitch,
      });
      const bp = biquad(ctx, 'bandpass', 700 * A.pitch, 1.1);
      const g = mkGain(ctx, 0);
      fm.output.connect(bp); bp.connect(g); g.connect(d);
      const total = 2.2 * ts * S;
      percEnv(g.gain, b + 0.02, { peak: 0.38, attack: 0.04 * S, hold: 0.2 * S, tau: 0.55 * ts * S, duration: total });
      sweep(fm.carrier.frequency, b, [
        [0, 88 * A.pitch / Math.pow(s, 0.4)],
        [total, 26 * A.pitch / Math.pow(s, 0.4)],
      ]);
      sweep(fm.modGain.gain, b, [[0, 900 * A.pitch], [total, 60 * A.pitch]]);
      fm.start(b);
      fm.stop(b + total + 0.05);
    }

    // --- WRECKAGE -----------------------------------------------------------
    noiseBurst(A, d, b + 0.18, {
      buffer: 'grind', type: 'lowpass', freq: 1800, sweepTo: 190, q: 1.3,
      peak: 0.34, attack: 0.08, tau: 1.0 * ts, drive: 2.2,
    });
    noiseBurst(A, d, b + 0.34, {
      buffer: 'debris', type: 'bandpass', freq: 880, sweepTo: 280, q: 0.85,
      peak: 0.34, attack: 0.3, tau: 1.5 * ts,
    });

    A.duck(0.52 * clamp(s, 0.5, 1.3), 0.55, 1.9);
    return true;
  }

  /** A small secondary going off inside a wreck. Cheap, and there are many. */
  secondary(spat, { radius = 30 } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('x:sec', 0.09)) return false;
    const s = clamp(Math.pow(radius / REF_RADIUS, 0.6), 0.2, 1);
    const V = A.voice('impacts', spat, { duration: 1.1, priority: 1.4, reverb: 1.0 });
    if (!V) return false;
    const { input: d, t } = V;
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'lowpass', freq: 4200, sweepTo: 500, q: 1.0,
      peak: 0.55, attack: 0.0015, tau: 0.05, drive: 2.0,
    });
    subThump(A, d, t, {
      f0: 96 / Math.pow(s, 0.5), f1: 38, sweepTime: 0.18, peak: 0.7, tau: 0.22, drive: 1.6,
    });
    noiseBurst(A, d, t + 0.02, {
      buffer: 'grind', type: 'lowpass', freq: 1100, sweepTo: 260, q: 1.1,
      peak: 0.3, attack: 0.02, tau: 0.28,
    });
    return true;
  }
}
