/**
 * IMPACTS.
 *
 * Three sounds that must never be confused with each other, because between them
 * they carry the whole damage read:
 *
 *   hull      MASS. Sub-heavy, short, dull. Something solid stopped something fast.
 *   shield    ENERGY. Almost no sub at all; instead a bank of very high-Q
 *             resonators that ring for the better part of a second. If you can
 *             hear whether your shields are up without looking, the shield layer
 *             has done its job.
 *   subsystem LOSS. The hull impact, plus a resonance that collapses downward as
 *             the structure loses tension, plus arcing.
 *
 * The hull/shield contrast is deliberately extreme in the spectrum, not just in
 * the timbre - a hull hit puts most of its energy under 120 Hz and a shield hit
 * puts almost none there. That is visible in the probe's spectrum plot, which is
 * how it gets verified without ears.
 */

import { clamp, gain as mkGain, biquad, osc, bufferSource, startAt, stopAt, percEnv } from './synth.js';
import { noiseBurst, subThump, metalRing, chirp } from './parts.js';

const GATE = { hull: 0.018, shield: 0.028, subsystem: 0.05, breach: 0.1 };

export class ImpactAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
  }

  /**
   * A round stopping against armour.
   * @param {Object} spat
   * @param {Object} [opts]
   * @param {number} [opts.size]     0.4 fighter .. 1.8 capital
   * @param {number} [opts.severity] 0..1, scales the transient and the tail
   */
  hull(spat, { size = 1, severity = 0.6, faction = 'player' } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('i:hull', GATE.hull)) return false;
    const k = 1 / Math.pow(size, 0.5);
    const sev = clamp(severity, 0.15, 1);
    const V = A.voice('impacts', spat, { duration: 0.9 * size, priority: 1.0 + sev, reverb: 1.0 });
    if (!V) return false;
    const { input: d, t } = V;

    // The contact itself: brief, mid, and gone.
    noiseBurst(A, d, t, {
      buffer: 'white', type: 'bandpass', freq: 1450 * k, q: 0.9,
      peak: 0.80 * sev, attack: 0.0008, tau: 0.014,
    });
    // The mass. Two sub layers so the hit has both a punch and a body.
    subThump(A, d, t, {
      f0: 82 * k, f1: 36 * k, sweepTime: 0.06 * size, peak: 0.38 * sev,
      attack: 0.0025, tau: 0.082 * size, drive: 2.0, type: 'triangle',
    });
    subThump(A, d, t + 0.004, {
      f0: 48 * k, f1: 26 * k, sweepTime: 0.2 * size, peak: 0.15 * sev,
      attack: 0.010, tau: 0.145 * size,
    });
    // Armour flexing.
    noiseBurst(A, d, t + 0.002, {
      buffer: 'brown', type: 'lowpass', freq: 560 * k, sweepTo: 150 * k, q: 1.2,
      peak: 0.34 * sev, attack: 0.003, tau: 0.072 * size, drive: 1.8,
    });
    // Plate resonance - the only thing that says which faction's armour this is.
    metalRing(A, d, t + 0.006, {
      freqs: [318 * k, 561 * k, 903 * k], q: 12, peak: 0.85 * sev, tau: 0.115 * size,
    });
    // Spall.
    noiseBurst(A, d, t + 0.012, {
      buffer: 'debris', type: 'highpass', freq: 1300, q: 0.7,
      peak: 0.24 * sev, attack: 0.012, tau: 0.11,
    });
    return true;
  }

  /**
   * A round stopping against a shield. Resonant and ringing - the opposite of the
   * hull hit in every respect that matters.
   */
  shield(spat, { size = 1, severity = 0.6, faction = 'player' } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('i:shield', GATE.shield)) return false;
    const sev = clamp(severity, 0.2, 1);
    const k = 1 / Math.pow(size, 0.25);
    // Generous reverb: a shield impact is the one thing in the game that is
    // allowed to bloom.
    const V = A.voice('impacts', spat, { duration: 1.5, priority: 1.1 + sev, reverb: 1.5 });
    if (!V) return false;
    const { input: d, t } = V;

    // The strike flashes UP the spectrum. Everything else in this file falls.
    chirp(A, d, t, {
      f0: 480 * k, f1: 2450 * k, duration: 0.045, peak: 0.22 * sev,
      type: 'sine', attack: 0.002, tau: 0.03,
    });
    // The ring. Four inharmonic partials at very high Q, decaying for most of a
    // second. This is the entire identity of the sound.
    metalRing(A, d, t, {
      freqs: [642 * k, 971 * k, 1489 * k, 2216 * k], q: 27, peak: 0.60 * sev,
      tau: 0.40, exciteMs: 2.4, spread: 0.78,
    });
    metalRing(A, d, t + 0.03, {
      freqs: [1187 * k, 1823 * k, 3040 * k], q: 34, peak: 0.26 * sev,
      tau: 0.40, exciteMs: 3.5, spread: 0.7,
    });
    // Field bloom: a narrow band of noise swelling and dying, no transient.
    noiseBurst(A, d, t + 0.005, {
      buffer: 'white', type: 'bandpass', freq: 1750 * k, sweepTo: 900 * k, q: 4.5,
      peak: 0.24 * sev, attack: 0.02, tau: 0.22,
    });
    // A token amount of low end so it still connects to the hull. Deliberately
    // tiny - one fifth of what a hull hit puts down there.
    subThump(A, d, t, {
      f0: 108, f1: 78, sweepTime: 0.05, peak: 0.13 * sev, attack: 0.006, tau: 0.055,
    });
    return true;
  }

  /**
   * A round landing on the subsystem the player aimed at, rather than on hull.
   * Deliberately tiny and bright: it has to cut through a hull impact happening in
   * the same millisecond without competing with it, because its only job is to say
   * "that one counted".
   */
  graze(spat, { kind = 'weapon' } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('i:graze', 0.09)) return false;
    const V = A.voice('impacts', spat, { duration: 0.35, priority: 1.3, reverb: 0.5 });
    if (!V) return false;
    metalRing(A, V.input, V.t, {
      freqs: [1980, 2970, 4210], q: 24, peak: 0.20, tau: 0.075, exciteMs: 1.2, spread: 0.6,
    });
    return true;
  }

  /** A subsystem going offline: the hit, then the structure letting go. */
  subsystem(spat, { size = 1, kind = 'weapon' } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('i:sub', GATE.subsystem)) return false;
    const V = A.voice('impacts', spat, { duration: 2.2 * size, priority: 2.4, reverb: 1.2 });
    if (!V) return false;
    const { input: d, t } = V;
    const k = 1 / Math.pow(size, 0.4);

    noiseBurst(A, d, t, {
      buffer: 'white', type: 'bandpass', freq: 1900 * k, q: 0.8,
      peak: 0.90, attack: 0.001, tau: 0.02,
    });
    subThump(A, d, t, {
      f0: 74 * k, f1: 28 * k, sweepTime: 0.18 * size, peak: 0.55, attack: 0.003,
      tau: 0.19 * size, drive: 2.4, type: 'triangle',
    });
    // The collapse: resonators sweeping down an octave as the mount loses tension.
    metalRing(A, d, t + 0.01, {
      freqs: [712 * k, 1131 * k, 1793 * k], q: 15, peak: 0.68,
      tau: 0.34 * size, sweepOctaves: -1.1,
    });
    // Arcing. A reactor or a sensor mast sparks a lot more than a gun mount does.
    const arc = kind === 'reactor' || kind === 'sensor' ? 0.42 : 0.20;
    noiseBurst(A, d, t + 0.04, {
      buffer: 'sparkle', type: 'highpass', freq: 2100, q: 0.7,
      peak: arc * 1.3, attack: 0.01, tau: 0.30 * size,
    });
    noiseBurst(A, d, t + 0.02, {
      buffer: 'grind', type: 'lowpass', freq: 1200 * k, sweepTo: 220 * k, q: 1.1,
      peak: 0.34, attack: 0.03, tau: 0.30 * size, drive: 2.0,
    });
    return true;
  }

  /** A hardpoint tearing off the player's hull. Big, structural, and personal. */
  breach(spat, { size = 1.4 } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('i:breach', GATE.breach)) return false;
    const V = A.voice('impacts', spat, { duration: 3.2, priority: 3.5, reverb: 1.3, level: 1.1 });
    if (!V) return false;
    const { input: d, t } = V;

    subThump(A, d, t, {
      f0: 58, f1: 19, sweepTime: 0.5, peak: 1.2, attack: 0.006, tau: 0.62, drive: 2.2,
    });
    noiseBurst(A, d, t, {
      buffer: 'grind', type: 'lowpass', freq: 2400, sweepTo: 180, q: 1.4,
      peak: 0.85, attack: 0.008, tau: 0.55, drive: 2.8,
    });
    // Structure shearing: long, downward, ugly.
    metalRing(A, d, t + 0.02, {
      freqs: [214, 347, 588, 941], q: 9, peak: 0.5, tau: 0.9, sweepOctaves: -1.6,
    });
    noiseBurst(A, d, t + 0.25, {
      buffer: 'debris', type: 'bandpass', freq: 700, sweepTo: 260, q: 1.0,
      peak: 0.40, attack: 0.14, tau: 0.8,
    });
    A.duck(0.24, 0.2, 0.9);
    return true;
  }
}
