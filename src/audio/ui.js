/**
 * UI.
 *
 * The only layer that is not in the world. It bypasses the reverb, bypasses the
 * ducking and bypasses the proximity filter, because the order bar is not a
 * physical object two kilometres away - it is in the room with the player.
 *
 * Two rules, both from `docs/design/controls.md` §4.5:
 *
 *   1. Audio SUPPLEMENTS the visual, it never carries it alone. Every one of these
 *      is short, quiet and skippable, and none of them is the only signal that
 *      something happened.
 *   2. The confirm at §4.2 is 90 ms. Not 200. An acknowledgement that arrives after
 *      the marker has already animated in reads as lag, not as feedback.
 *
 * Everything here is built from the same four parts as the weapons, deliberately.
 * A UI sound set drawn from a different palette than the world sounds is the audio
 * equivalent of an off-palette colour.
 */

import { clamp } from './synth.js';
import { noiseBurst, subThump, metalRing, chirp } from './parts.js';

export class UIAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
  }

  _v(duration, priority = 4) {
    const A = this.audio;
    if (!A.ready || A.paused) return null;
    // `filter:false` and `reverb:0` - the UI is not in the fiction.
    return A.voice('ui', A.here(), { duration, priority, reverb: 0, filter: false });
  }

  /** Order accepted. 90 ms, two partials, gone. */
  confirm() {
    const A = this.audio;
    if (!A.gate('ui:confirm', 0.04)) return false;
    const V = this._v(0.35);
    if (!V) return false;
    metalRing(A, V.input, V.t, {
      freqs: [906, 1359], q: 24, peak: 0.24, tau: 0.045, exciteMs: 1.2, spread: 0.55,
    });
    return true;
  }

  /** Order rejected, or an illegal action. Down, not up. */
  reject() {
    const A = this.audio;
    if (!A.gate('ui:reject', 0.08)) return false;
    const V = this._v(0.45);
    if (!V) return false;
    chirp(A, V.input, V.t, {
      f0: 420, f1: 190, duration: 0.11, peak: 0.20, type: 'square',
      attack: 0.004, tau: 0.05, lowpass: 1600,
    });
    return true;
  }

  /** Selection changed. Barely there - this fires constantly. */
  select() {
    const A = this.audio;
    if (!A.gate('ui:select', 0.05)) return false;
    const V = this._v(0.2, 2);
    if (!V) return false;
    metalRing(A, V.input, V.t, {
      freqs: [1720], q: 28, peak: 0.10, tau: 0.022, exciteMs: 0.8,
    });
    return true;
  }

  /**
   * A notification. `important` gets a lower, longer, two-stage tone; routine
   * traffic gets a single soft partial.
   */
  notify(important = false) {
    const A = this.audio;
    if (!A.gate('ui:notify', 0.12)) return false;
    const V = this._v(important ? 1.0 : 0.4);
    if (!V) return false;
    if (important) {
      metalRing(A, V.input, V.t, { freqs: [520, 782], q: 22, peak: 0.26, tau: 0.10, exciteMs: 2 });
      metalRing(A, V.input, V.t + 0.11, { freqs: [694, 1043], q: 22, peak: 0.22, tau: 0.16, exciteMs: 2 });
      subThump(A, V.input, V.t, { f0: 120, f1: 88, sweepTime: 0.05, peak: 0.14, tau: 0.07 });
    } else {
      metalRing(A, V.input, V.t, { freqs: [1180], q: 20, peak: 0.13, tau: 0.05, exciteMs: 1.2 });
    }
    return true;
  }

  /**
   * Breach warning. The one UI sound allowed to be unpleasant: three hard pulses
   * on an interval nobody uses for anything friendly.
   */
  alarm() {
    const A = this.audio;
    if (!A.gate('ui:alarm', 0.9)) return false;
    const V = this._v(1.4, 8);
    if (!V) return false;
    const S = A.stretch;
    for (let i = 0; i < 3; i++) {
      const at = V.t + i * 0.19 * S;
      chirp(A, V.input, at, {
        f0: i % 2 ? 587 : 440, f1: i % 2 ? 587 : 440, duration: 0.11, peak: 0.30,
        type: 'square', attack: 0.006, tau: 0.035, lowpass: 2200, partials: 2, detune: 5,
      });
      subThump(A, V.input, at, { f0: 96, f1: 72, sweepTime: 0.04, peak: 0.18, tau: 0.06 });
    }
    return true;
  }

  /** A module seating on a hardpoint. Mechanical, two-stage, final. */
  install() {
    const A = this.audio;
    const V = this._v(1.0, 5);
    if (!V) return false;
    metalRing(A, V.input, V.t, { freqs: [214, 348], q: 7, peak: 0.34, tau: 0.075, exciteMs: 3 });
    subThump(A, V.input, V.t, { f0: 88, f1: 44, sweepTime: 0.05, peak: 0.42, tau: 0.11, drive: 1.8 });
    metalRing(A, V.input, V.t + 0.13, { freqs: [880, 1330, 1980], q: 19, peak: 0.20, tau: 0.11, exciteMs: 1.4 });
    return true;
  }

  /** A module coming off. The install, in reverse order and lighter. */
  uninstall() {
    const A = this.audio;
    const V = this._v(0.7, 5);
    if (!V) return false;
    metalRing(A, V.input, V.t, { freqs: [980, 1470], q: 18, peak: 0.16, tau: 0.06, exciteMs: 1.2 });
    metalRing(A, V.input, V.t + 0.09, { freqs: [230, 372], q: 7, peak: 0.24, tau: 0.09, exciteMs: 3 });
    return true;
  }

  /** Reactor output rerouted: a relay bank throwing, then the channels spooling. */
  power() {
    const A = this.audio;
    if (!A.gate('ui:power', 0.10)) return false;
    const V = this._v(0.8, 4);
    if (!V) return false;
    noiseBurst(A, V.input, V.t, {
      buffer: 'white', type: 'bandpass', freq: 2600, q: 2.2, peak: 0.18, attack: 0.001, tau: 0.012,
    });
    subThump(A, V.input, V.t, { f0: 74, f1: 52, sweepTime: 0.04, peak: 0.26, tau: 0.09 });
    chirp(A, V.input, V.t + 0.02, {
      f0: 118, f1: 172, duration: 0.28, peak: 0.11, type: 'triangle',
      attack: 0.12, tau: 0.14, partials: 2, detune: 7, lowpass: 900,
    });
    return true;
  }

  /**
   * Time scale changed. Pause gets a downward wipe; unpause gets the same thing
   * upward. Fires from the render path so it works while the sim is stopped -
   * which is the whole reason `_v` is allowed to run when `A.paused` is about to
   * become true.
   */
  timeScale(scale, previous) {
    const A = this.audio;
    if (!A.ready) return false;
    // Pause has already begun fading the master; this rides out on the tail,
    // which is exactly the wipe we want.
    const V = A.voice('ui', A.here(), { duration: 0.5, priority: 9, reverb: 0, filter: false });
    if (!V) return false;
    const up = scale > previous;
    chirp(A, V.input, V.t, {
      f0: up ? 300 : 900, f1: up ? 900 : 260, duration: 0.13, peak: 0.16,
      type: 'triangle', attack: 0.006, tau: 0.05, lowpass: 3200, partials: 2, detune: 9,
    });
    return true;
  }

  /** A new point of interest resolving on sensors. */
  discovery() {
    const A = this.audio;
    const V = this._v(1.6, 6);
    if (!V) return false;
    chirp(A, V.input, V.t, {
      f0: 380, f1: 1240, duration: 0.26, peak: 0.16, type: 'sine', attack: 0.10, tau: 0.10,
    });
    metalRing(A, V.input, V.t + 0.20, {
      freqs: [1240, 1860, 2790], q: 26, peak: 0.20, tau: 0.24, exciteMs: 2, spread: 0.6,
    });
    return true;
  }
}
