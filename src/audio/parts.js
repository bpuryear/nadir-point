/**
 * INSTRUMENT PARTS.
 *
 * The four gestures every sound in this game is assembled from. Keeping them here
 * rather than inline in each layer is what makes a cannon and a hull impact sound
 * like they were built in the same factory, which is the audio equivalent of the
 * palette lock in `art/palette.js`.
 *
 *   noiseBurst   filtered noise with a percussive envelope - the transient
 *   subThump     a pitch-swept sine below 90 Hz - the weight
 *   metalRing    high-Q resonators struck by an impulse - the material
 *   chirp        a swept oscillator - energy, charge, discharge
 *
 * Every one of them takes `A` (the AudioEngine) and reads `A.stretch` and `A.pitch`
 * so time compression is applied in exactly one place per gesture and never
 * forgotten. Every one returns the absolute time at which it goes silent, so a
 * caller can size the voice it opened.
 */

import {
  clamp, gain as mkGain, biquad, osc, bufferSource, shaper,
  percEnv, sweep, startAt, stopAt, DECAY_TAUS,
} from './synth.js';

/**
 * The lowest frequency anything in this stream is allowed to reach.
 *
 * Below about 22 Hz nothing reproduces on any speaker a player owns, but the
 * energy is real and it eats the limiter's headroom, which quietly makes
 * everything else quieter. Sweeps clamp here rather than running to 8 Hz because
 * they can.
 */
const SUB_FLOOR = 23;

/**
 * BANDWIDTH COMPENSATION, and why `peak` means level rather than amplitude.
 *
 * A filter throws away most of a noise source's energy. A bandpass at 2.4 kHz with
 * Q 0.9 passes about a tenth of white noise's power; the same filter on brown
 * noise passes a thousandth. So a "crack" authored at peak 0.85 and a sub sine
 * authored at peak 1.0 are not remotely the same loudness - the sub is twenty
 * decibels ahead, which is exactly the failure mode where every weapon in a game
 * turns into the same distant thud.
 *
 * Rather than hand-tune sixty call sites against each other, `peak` on a filtered
 * noise part is treated as a LEVEL and compensated by the fraction of source power
 * the filter actually passes, modelled as a power-law spectrum per noise colour.
 * The result is that 0.5 means the same loudness whatever it is filtered to, which
 * is the only way a mix stays balanced when somebody retunes a filter later.
 */
const SLOPE = { white: 0, pink: -1, brown: -2, grind: -0.7, sparkle: -0.3, debris: -0.9 };

function powerIntegral(beta, a, b) {
  if (b <= a) return 1e-9;
  if (Math.abs(beta + 1) < 1e-6) return Math.log(b / a);
  return (Math.pow(b, beta + 1) - Math.pow(a, beta + 1)) / (beta + 1);
}

function bandCompensation(bufferKey, type, fc, q, nyquist) {
  const beta = SLOPE[bufferKey] ?? 0;
  const lo = 20;
  const hi = Math.max(lo * 2, nyquist);
  const total = powerIntegral(beta, lo, hi);
  let passed;
  if (type === 'bandpass' || type === 'peaking' || type === 'notch') {
    const bw = Math.max(20, fc / Math.max(0.3, q));
    passed = powerIntegral(beta, clamp(fc - bw / 2, lo, hi - 1), clamp(fc + bw / 2, lo + 1, hi));
  } else if (type === 'highpass') {
    passed = powerIntegral(beta, clamp(fc, lo, hi - 1), hi);
  } else {
    passed = powerIntegral(beta, lo, clamp(fc, lo + 1, hi));
  }
  const frac = clamp(passed / total, 1e-5, 1);
  // The 0.85 exponent softens the correction: full compensation makes very narrow
  // bands unnaturally forward, because the ear does not integrate power that way.
  return clamp(Math.pow(1 / Math.sqrt(frac), 0.85), 1, 9);
}

/**
 * A burst of filtered noise. The transient of almost everything.
 *
 * @param {import('./engine.js').AudioEngine} A
 * @param {AudioNode} dest
 * @param {number} t0        absolute context time
 * @param {Object} o
 * @param {string} [o.buffer]  key into the noise bank: white | pink | brown | grind | sparkle | debris
 * @param {string} [o.type]    filter type
 * @param {number} [o.freq]    filter frequency at t0
 * @param {number} [o.sweepTo] filter frequency at the end, if it should move
 * @param {number} [o.q]
 * @param {number} [o.peak]
 * @param {number} [o.attack]
 * @param {number} [o.tau]     exponential decay time constant
 * @param {number} [o.hold]
 * @returns {number} time at which this part is silent
 */
export function noiseBurst(A, dest, t0, {
  buffer = 'white', type = 'bandpass', freq = 2400, sweepTo = null, q = 1.1,
  peak = 1, attack = 0.0015, tau = 0.05, hold = 0, duration = null, rate = 1, drive = 0,
} = {}) {
  const ctx = A.ctx;
  const bank = A.buffers;
  const buf = bank[buffer] ?? bank.white;
  const S = A.stretch;
  const P = A.pitch;

  const total = (duration ?? (attack + hold + tau * DECAY_TAUS)) * S;
  const src = bufferSource(ctx, buf, { loop: true, rate: rate * P });
  const f = biquad(ctx, type, freq * P, q);
  const g = mkGain(ctx, 0);

  // SATURATE, THEN FILTER. The other order looks equivalent and is not: tanh on a
  // band-limited signal generates harmonics ABOVE the band, with nothing left to
  // remove them, and they escape into the mix as fizz. With drive 3 on a
  // detonation that put three quarters of the sound's energy above 2 kHz - a
  // capital ship blowing up sounded like a cymbal. Distorting first and filtering
  // afterwards keeps the grit inside the band it belongs to.
  if (drive > 0) {
    const sh = shaper(ctx, drive);
    src.connect(sh);
    sh.connect(f);
  } else {
    src.connect(f);
  }
  f.connect(g);
  g.connect(dest);

  // Compensate for what the filter is about to throw away. Geometric mean of the
  // two ends when the filter sweeps, since it spends time at both.
  const nyq = ctx.sampleRate * 0.5;
  const cA = bandCompensation(buffer, type, clamp(freq * P, 20, nyq), q, nyq);
  const cB = sweepTo === null ? cA : bandCompensation(buffer, type, clamp(sweepTo * P, 20, nyq), q, nyq);
  const level = peak * Math.sqrt(cA * cB);

  if (sweepTo !== null) {
    sweep(f.frequency, t0, [[0, clamp(freq * P, 20, 20000)], [total, clamp(sweepTo * P, 20, 20000)]]);
  }
  percEnv(g.gain, t0, { peak: level, attack: attack * S, tau: tau * S, hold: hold * S, duration: total });

  // Read from a different point in the loop every time. The bank is only a couple
  // of seconds long and without this every cannon shot has an identical grain.
  startAt(src, t0, A.rng.next() * buf.duration);
  stopAt(src, t0 + total + 0.02);
  return t0 + total;
}

/**
 * The weight. A sine (or triangle, for a little more bite) swept downward below
 * 90 Hz with a long tail.
 *
 * This is the single most important part in the whole stream. A capital ship that
 * does not put energy below 60 Hz reads as a fighter no matter what else is on top
 * of it, and a detonation without one is a click.
 */
export function subThump(A, dest, t0, {
  f0 = 72, f1 = 32, sweepTime = 0.10, peak = 1, attack = 0.004, tau = 0.16,
  type = 'sine', duration = null, drive = 0,
} = {}) {
  const ctx = A.ctx;
  const S = A.stretch;
  const P = A.pitch;
  const total = (duration ?? (attack + tau * DECAY_TAUS)) * S;

  const o = osc(ctx, type, Math.max(SUB_FLOOR, f0 * P));
  const g = mkGain(ctx, 0);
  if (drive > 0) {
    const sh = shaper(ctx, drive);
    o.connect(sh); sh.connect(g);
  } else {
    o.connect(g);
  }
  g.connect(dest);

  sweep(o.frequency, t0, [
    [0, Math.max(SUB_FLOOR, f0 * P)],
    [Math.min(sweepTime * S, total), Math.max(SUB_FLOOR, f1 * P)],
  ]);
  percEnv(g.gain, t0, { peak, attack: attack * S, tau: tau * S, duration: total });

  startAt(o, t0);
  stopAt(o, t0 + total + 0.02);
  return t0 + total;
}

/**
 * The material. A short impulse struck through a bank of high-Q bandpasses.
 *
 * Inharmonic ratios, always. A struck hull plate is a plate, not a string, and a
 * harmonic series here is why so many synthesised "clanks" sound like a xylophone.
 */
export function metalRing(A, dest, t0, {
  freqs = [430, 781, 1290], q = 16, peak = 0.5, tau = 0.28, exciteMs = 3,
  buffer = 'white', spread = 0.9, sweepOctaves = 0,
} = {}) {
  const ctx = A.ctx;
  const S = A.stretch;
  const P = A.pitch;
  const total = tau * DECAY_TAUS * S;

  const buf = A.buffers[buffer] ?? A.buffers.white;
  const src = bufferSource(ctx, buf, { loop: true, rate: P });
  const exc = mkGain(ctx, 0);
  src.connect(exc);
  // A high-Q bandpass has unity gain at its centre and near-zero everywhere else,
  // so a struck resonator bank comes out roughly 20 dB below a raw noise burst of
  // the same nominal peak. Compensate off Q so `peak` means the same thing here as
  // it does in noiseBurst.
  const qComp = clamp(Math.pow(q / 6, 0.6), 0.6, 4.5);
  percEnv(exc.gain, t0, {
    peak: 5.5 * qComp, attack: 0.0004,
    tau: (exciteMs / 1000) * S, duration: (exciteMs / 1000) * 7 * S,
  });

  const out = mkGain(ctx, 0);
  out.connect(dest);
  percEnv(out.gain, t0, { peak, attack: 0.001 * S, tau: tau * S, duration: total });

  for (let i = 0; i < freqs.length; i++) {
    const f = biquad(ctx, 'bandpass', clamp(freqs[i] * P, 20, 18000), q);
    const g = mkGain(ctx, Math.pow(spread, i));
    exc.connect(f);
    f.connect(g);
    g.connect(out);
    if (sweepOctaves) {
      // A collapsing structure drops in pitch as it loses tension.
      sweep(f.frequency, t0, [
        [0, clamp(freqs[i] * P, 20, 18000)],
        [total, clamp(freqs[i] * P * Math.pow(2, sweepOctaves), 20, 18000)],
      ]);
    }
  }

  startAt(src, t0, A.rng.next() * buf.duration);
  stopAt(src, t0 + total + 0.02);
  return t0 + total;
}

/**
 * A swept oscillator. Charge-up, discharge, shield energy, alarm.
 * `partials` stacks slightly detuned copies so it reads as a machine rather than
 * a test tone.
 */
export function chirp(A, dest, t0, {
  f0 = 220, f1 = 1800, duration = 0.2, peak = 0.4, type = 'sawtooth',
  attack = 0.01, tau = 0.05, partials = 1, detune = 7, lowpass = null, q = 1,
} = {}) {
  const ctx = A.ctx;
  const S = A.stretch;
  const P = A.pitch;
  const dur = duration * S;
  const total = dur + tau * DECAY_TAUS * S;

  const g = mkGain(ctx, 0);
  if (lowpass !== null) {
    const f = biquad(ctx, 'lowpass', lowpass * P, q);
    g.connect(f);
    f.connect(dest);
  } else {
    g.connect(dest);
  }
  percEnv(g.gain, t0, { peak, attack: attack * S, tau: tau * S, hold: Math.max(0, dur - attack * S), duration: total });

  for (let i = 0; i < partials; i++) {
    const o = osc(ctx, type, f0 * P, (i - (partials - 1) / 2) * detune);
    sweep(o.frequency, t0, [[0, clamp(f0 * P, 8, 20000)], [dur, clamp(f1 * P, 8, 20000)]]);
    const pg = mkGain(ctx, 1 / partials);
    o.connect(pg);
    pg.connect(g);
    startAt(o, t0);
    stopAt(o, t0 + total + 0.02);
  }
  return t0 + total;
}

/**
 * A held, beating pair of detuned oscillators through a bandpass. The core of
 * every energy weapon in the game.
 *
 * The detune is what makes a beam sound powered rather than synthesised: two
 * emitters that are almost, but not quite, in phase produce a slow amplitude beat
 * at their difference frequency, and the ear reads that as a physical machine.
 * `beatHz` names the beat directly instead of making the caller do the arithmetic.
 */
export function beatingPair(A, dest, {
  f = 240, beatHz = 1.6, type = 'sawtooth', level = 0.5, octave = true,
} = {}) {
  const ctx = A.ctx;
  const P = A.pitch;
  const base = f * P;
  const g = mkGain(ctx, level);
  g.connect(dest);

  const a = osc(ctx, type, base);
  const b = osc(ctx, type, base + beatHz);
  const ga = mkGain(ctx, 0.5);
  const gb = mkGain(ctx, 0.5);
  a.connect(ga); ga.connect(g);
  b.connect(gb); gb.connect(g);

  const nodes = [a, b];
  if (octave) {
    const c = osc(ctx, type === 'sawtooth' ? 'triangle' : type, base * 2 + beatHz * 1.7);
    const gc = mkGain(ctx, 0.22);
    c.connect(gc); gc.connect(g);
    nodes.push(c);
  }
  return { output: g, oscillators: nodes };
}
