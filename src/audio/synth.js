/**
 * SYNTHESIS PRIMITIVES.
 *
 * Nadir Point ships no audio files. Every sound in the game is built here, at
 * runtime, out of oscillators, filters, delay lines and noise that this file
 * generates sample by sample from a seeded RNG. There is nothing to load, nothing
 * to decode and nothing to commit as a binary asset.
 *
 * TWO LAYERS, and the split is the whole performance story:
 *
 *   1. SAMPLE-LEVEL SYNTHESIS (`gen*`, `loopBuffer`). Plain JavaScript writing into
 *      Float32Arrays. Runs ONCE, at install, from `world.rng`. This is where the
 *      expensive textures live - granular rumble, debris tick fields, structural
 *      groans - baked into seamless loops so that at run time they cost exactly one
 *      AudioBufferSourceNode and no CPU scheduling at all. The Web Audio equivalent
 *      of "upload the attributes once and animate in the vertex shader".
 *
 *   2. NODE-GRAPH INSTRUMENTS (`fmVoice`, `resonator`, `createFDN`, envelopes).
 *      Built per event. Web Audio nodes are one-shot by design - a stopped
 *      AudioBufferSourceNode cannot be restarted - so a voice is a small graph that
 *      is constructed, scheduled entirely in the future, and swept when it expires.
 *      Nothing here is touched per frame.
 *
 * REVERB IS CONVOLUTION-FREE. A feedback delay network (`createFDN`) - four delay
 * lines cross-mixed through a Hadamard matrix with a damping lowpass in the loop.
 * An impulse response would be a binary asset or a several-second offline render;
 * an FDN is twenty-six nodes and it can change size per point of interest live.
 *
 * Everything takes an explicit `BaseAudioContext`, so every instrument in this
 * stream renders identically into a live AudioContext and into the probe's
 * OfflineAudioContext. That is what makes the audio verifiable without ears.
 */

// ---------------------------------------------------------------------------
// scalar helpers
// ---------------------------------------------------------------------------

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Decibels to linear gain. -60 dB is our practical floor. */
export const dbToGain = (db) => Math.pow(10, db / 20);
/** Linear gain to decibels, floored so log(0) never escapes. */
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-6, g));

/** Semitone/cent ratio, for driving `detune` and `playbackRate` from a time scale. */
export const centsOf = (ratio) => 1200 * Math.log2(Math.max(1e-6, ratio));

// ---------------------------------------------------------------------------
// 1. SAMPLE-LEVEL SYNTHESIS
// ---------------------------------------------------------------------------

/** White noise, flat spectrum. The raw material for almost everything percussive. */
export function genWhite(n, rng, out = new Float32Array(n)) {
  for (let i = 0; i < n; i++) out[i] = rng.signed();
  return out;
}

/**
 * Pink noise, -3 dB/octave. Paul Kellet's refined filter bank.
 * Pink is what "air" and "distant roar" are made of; white noise used as a bed
 * always reads as tape hiss because our hearing expects energy per octave, not
 * per hertz.
 */
export function genPink(n, rng, out = new Float32Array(n)) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.signed();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/**
 * Brown noise, -6 dB/octave: leaky-integrated white. This is the mass. A capital
 * ship drive bed and a detonation tail are both mostly brown noise under a
 * resonant lowpass, because that is the only noise colour with real sub energy.
 */
export function genBrown(n, rng, out = new Float32Array(n)) {
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.signed();
    last = (last + 0.02 * w) / 1.02;
    out[i] = last * 3.4;
  }
  return out;
}

/**
 * A granular cloud, baked. Thousands of short windowed grains scattered across the
 * buffer, each a sine at a random frequency crossfaded with noise.
 *
 * This is how salvage cutting and belt dust get their texture without a per-frame
 * grain scheduler: the grains are already in the buffer, so playback is one node.
 * `grainsPerSec` past a few hundred stops sounding like grains and starts sounding
 * like a material - which is exactly what an industrial grind is.
 */
export function genGrains(n, sr, rng, {
  grainsPerSec = 260, grainMs = 26, jitterMs = 12,
  fLo = 180, fHi = 1400, noisiness = 0.45, decay = 2.2, amp = 1,
} = {}) {
  const out = new Float32Array(n);
  const count = Math.max(1, Math.round((n / sr) * grainsPerSec));
  for (let g = 0; g < count; g++) {
    const start = Math.floor(rng.next() * n);
    const durMs = Math.max(2, grainMs + rng.signed() * jitterMs);
    const len = Math.min(n - start, Math.floor((durMs / 1000) * sr));
    if (len < 4) continue;
    // Log-uniform frequency: octaves are perceptually even, hertz are not.
    const f = fLo * Math.pow(fHi / fLo, rng.next());
    const w = (2 * Math.PI * f) / sr;
    const phase = rng.next() * Math.PI * 2;
    const level = amp * (0.25 + 0.75 * rng.next()) * (1 / Math.sqrt(grainsPerSec / 60));
    const nz = noisiness;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Hann window times an exponential body: the attack is soft, the decay is not.
      const win = (0.5 - 0.5 * Math.cos(2 * Math.PI * t)) * Math.exp(-decay * t);
      const s = Math.sin(w * i + phase) * (1 - nz) + rng.signed() * nz;
      out[start + i] += s * win * level;
    }
  }
  return out;
}

/**
 * A field of sparse resonant ticks: chunks of rock and hull plate knocking against
 * each other somewhere out in the dark. Each tick is the impulse response of a
 * two-pole resonator, written directly rather than filtered - cheaper and it gives
 * exact control over the ring time, which is the whole character of the sound.
 */
export function genTicks(n, sr, rng, {
  ticksPerSec = 3.4, fLo = 420, fHi = 5200, ringMsLo = 14, ringMsHi = 130,
  amp = 1, partials = 2,
} = {}) {
  const out = new Float32Array(n);
  const count = Math.max(1, Math.round((n / sr) * ticksPerSec));
  for (let k = 0; k < count; k++) {
    const start = Math.floor(rng.next() * n);
    const f0 = fLo * Math.pow(fHi / fLo, rng.next());
    const ring = (ringMsLo + rng.next() * (ringMsHi - ringMsLo)) / 1000;
    const len = Math.min(n - start, Math.floor(ring * 4 * sr));
    if (len < 8) continue;
    const level = amp * (0.12 + 0.88 * Math.pow(rng.next(), 2.2));
    for (let p = 0; p < partials; p++) {
      // Inharmonic partials. A struck metal plate is not a harmonic series, and
      // making it one is why synthesised "clanks" so often sound like marimbas.
      const f = f0 * (1 + p * (1.41 + rng.next() * 0.9));
      if (f > sr * 0.45) continue;
      const w = (2 * Math.PI * f) / sr;
      const tau = ring * (1 / (1 + p * 0.7)) * sr;
      const ph = rng.next() * Math.PI * 2;
      const pl = level / (1 + p * 1.5);
      for (let i = 0; i < len; i++) {
        out[start + i] += Math.sin(w * i + ph) * Math.exp(-i / tau) * pl;
      }
    }
  }
  return out;
}

/**
 * Structural groans. A kilometre of dead hull settling: a very low resonance whose
 * frequency drifts by a few per cent over several seconds while friction modulates
 * it. Mostly silence, which is the point - in a graveyard the gaps carry more than
 * the sounds do.
 */
export function genGroans(n, sr, rng, {
  events = 5, fLo = 28, fHi = 96, durLo = 2.4, durHi = 7.5, amp = 1,
} = {}) {
  const out = new Float32Array(n);
  for (let e = 0; e < events; e++) {
    const dur = durLo + rng.next() * (durHi - durLo);
    const len = Math.floor(dur * sr);
    const start = Math.floor(rng.next() * Math.max(1, n - len));
    const f0 = fLo * Math.pow(fHi / fLo, rng.next());
    const drift = 0.86 + rng.next() * 0.34;    // ends up to 34% higher or 14% lower
    const level = amp * (0.35 + 0.65 * rng.next());
    // Slow friction modulation - a stick-slip creak, not a tone.
    const modHz = 0.6 + rng.next() * 2.8;
    const modPh = rng.next() * Math.PI * 2;
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const f = f0 * lerp(1, drift, t);
      phase += (2 * Math.PI * f) / sr;
      // Asymmetric envelope: slow swell, slower release. Nothing in a dead hull
      // happens fast.
      const env = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 1.7);
      const fric = 0.62 + 0.38 * Math.sin(2 * Math.PI * modHz * (i / sr) + modPh);
      // A little odd-harmonic bite so it reads as metal rather than as an organ.
      const s = Math.sin(phase) + 0.22 * Math.sin(phase * 3) + 0.08 * Math.sin(phase * 5);
      out[start + i] += s * env * fric * level;
    }
  }
  return out;
}

/** Peak-normalise in place to `target`. Returns the gain that was applied. */
export function normalise(data, target = 0.9) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = data[i] < 0 ? -data[i] : data[i];
    if (a > peak) peak = a;
  }
  if (peak < 1e-9) return 0;
  const g = target / peak;
  for (let i = 0; i < data.length; i++) data[i] *= g;
  return g;
}

/**
 * Turn `data` (length n) into a seamless loop of length n - fadeN by crossfading
 * the tail back over the head. Without this every ambient bed clicks once per
 * cycle, which is the single most recognisable "programmer audio" artefact there is.
 */
export function crossfadeLoop(data, fadeN) {
  const n = data.length;
  const f = Math.min(fadeN, Math.floor(n / 3));
  const outLen = n - f;
  const out = new Float32Array(outLen);
  out.set(data.subarray(0, outLen));
  for (let i = 0; i < f; i++) {
    // Equal-power crossfade; a linear one dips 3 dB in the middle of the seam.
    const t = i / f;
    const a = Math.cos(t * Math.PI * 0.5);
    const b = Math.sin(t * Math.PI * 0.5);
    out[i] = out[i] * b + data[outLen + i] * a;
  }
  return out;
}

/**
 * THE RATE THE TEXTURES ARE AUTHORED AT.
 *
 * Sample generation is the expensive part of this stream - a couple of hundred
 * milliseconds of it - and it has to happen BEFORE the first user gesture, or the
 * player's first click costs them twenty frames. But there is no AudioContext
 * before that gesture, and therefore no known sample rate.
 *
 * So the textures are generated as plain Float32Arrays at this nominal rate during
 * boot, and re-interpreted at whatever rate the context turns out to run at. On a
 * 44.1 kHz device that stretches every bed by 9% and drops it 1.5 semitones, which
 * for noise, rumble and debris is not merely acceptable - it is undetectable. It
 * would matter for a tuned instrument; there are none here.
 */
export const NOMINAL_RATE = 48000;

/**
 * Generate a seamless loop as raw channel data. `seconds + fadeSeconds` is
 * generated and the overlap is folded back, so the result is exactly `seconds`.
 */
export function loopData(seconds, fadeSeconds, sr, channels, fill) {
  const nRaw = Math.max(2, Math.floor((seconds + fadeSeconds) * sr));
  const fadeN = Math.max(1, Math.floor(fadeSeconds * sr));
  const chans = [];
  for (let c = 0; c < channels; c++) chans.push(crossfadeLoop(fill(sr, nRaw, c), fadeN));
  return chans;
}

/** Wrap raw channel data as an AudioBuffer at the context's rate. A memcpy. */
export function dataToBuffer(ctx, chans) {
  const buf = ctx.createBuffer(chans.length, chans[0].length, ctx.sampleRate);
  for (let c = 0; c < chans.length; c++) buf.copyToChannel(chans[c], c);
  return buf;
}

/** Build a seamless looping AudioBuffer directly. */
export function loopBuffer(ctx, seconds, fadeSeconds, channels, fill) {
  return dataToBuffer(ctx, loopData(seconds, fadeSeconds, ctx.sampleRate, channels, fill));
}

/**
 * The shared noise bank, as raw data. One forked RNG, so a seeded run has
 * byte-identical noise. Everything percussive in the game reads out of these at a
 * random offset rather than generating fresh noise per shot.
 *
 * Call this at install; call `bankFromData` at unlock.
 */
export function generateBankData(rng, sr = NOMINAL_RATE) {
  const L = (seconds, fade, fill) => loopData(seconds, fade, sr, 2, fill);
  return {
    /** Broadband. Cracks, transients, hiss. */
    white: L(2.0, 0.05, (sr2, n, c) => genWhite(n, rng.fork(`white${c}`))),
    /** Air and roar. */
    pink: L(4.0, 0.25, (sr2, n, c) => genPink(n, rng.fork(`pink${c}`))),
    /** Mass. Drive beds, detonation tails. */
    brown: L(4.0, 0.4, (sr2, n, c) => {
      const d = genBrown(n, rng.fork(`brown${c}`));
      normalise(d, 0.95);
      return d;
    }),
    /** Coarse metallic grind - salvage cutting, hull failure. */
    grind: L(2.6, 0.25, (sr2, n, c) => {
      const d = genGrains(n, sr2, rng.fork(`grind${c}`), {
        grainsPerSec: 420, grainMs: 22, jitterMs: 14,
        fLo: 120, fHi: 2600, noisiness: 0.55, decay: 2.6,
      });
      normalise(d, 0.9);
      return d;
    }),
    /** Fine sparkle - electrical arcing, containment failure shimmer. */
    sparkle: L(1.6, 0.15, (sr2, n, c) => {
      const d = genGrains(n, sr2, rng.fork(`sparkle${c}`), {
        grainsPerSec: 900, grainMs: 5, jitterMs: 4,
        fLo: 1800, fHi: 11000, noisiness: 0.3, decay: 5.5,
      });
      normalise(d, 0.85);
      return d;
    }),
    /** Debris impacting debris, out in the dark. */
    debris: L(6.0, 0.5, (sr2, n, c) => {
      const d = genTicks(n, sr2, rng.fork(`debris${c}`), {
        ticksPerSec: 5.5, fLo: 380, fHi: 4800, ringMsLo: 10, ringMsHi: 110,
      });
      normalise(d, 0.85);
      return d;
    }),
  };
}

/** Turn generated bank data into AudioBuffers. Pure memcpy; safe on a gesture. */
export function bankFromData(ctx, data) {
  const bank = {};
  for (const key of Object.keys(data)) bank[key] = dataToBuffer(ctx, data[key]);
  return bank;
}

/** Generate and wrap in one call. Used by the probe, which has a context already. */
export function createBufferBank(ctx, rng) {
  return bankFromData(ctx, generateBankData(rng, ctx.sampleRate));
}

// ---------------------------------------------------------------------------
// 2. NODE-GRAPH INSTRUMENTS
// ---------------------------------------------------------------------------

export function gain(ctx, v = 1) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

export function biquad(ctx, type, freq, Q = 0.707, gainDb = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = clamp(freq, 10, ctx.sampleRate * 0.48);
  f.Q.value = Q;
  if (gainDb) f.gain.value = gainDb;
  return f;
}

export function osc(ctx, type, freq, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = clamp(freq, 0.01, ctx.sampleRate * 0.48);
  o.detune.value = detune;
  return o;
}

export function bufferSource(ctx, buffer, { loop = false, rate = 1, offset = 0 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = loop;
  s.playbackRate.value = rate;
  s._offset = offset;
  return s;
}

/** tanh saturation. Glue for detonations and the grit on a mass driver's body. */
export function shaper(ctx, drive = 2.4, samples = 1024) {
  const w = ctx.createWaveShaper();
  const c = new Float32Array(samples);
  const k = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    c[i] = Math.tanh(drive * x) / k;
  }
  w.curve = c;
  w.oversample = '2x';
  return w;
}

/**
 * A bandpass resonator. High Q turns an impulse into a ringing tone, which is the
 * entire difference between a shield hit and a hull hit: one rings, one thuds.
 */
export function resonator(ctx, freq, q = 18, level = 1) {
  const f = biquad(ctx, 'bandpass', freq, q);
  const g = gain(ctx, level);
  f.connect(g);
  return { input: f, output: g, filter: f, gain: g };
}

/**
 * A two-operator FM pair. `ratio` is the modulator's frequency as a multiple of the
 * carrier; `index` is the modulation depth in hertz of carrier deviation.
 *
 * Non-integer ratios give inharmonic, metallic spectra - which is what a rail
 * accelerator's ring and a reactor losing containment both are.
 */
export function fmVoice(ctx, {
  carrierHz = 220, ratio = 1.41, index = 400, carrierType = 'sine', modType = 'sine',
} = {}) {
  const carrier = osc(ctx, carrierType, carrierHz);
  const mod = osc(ctx, modType, carrierHz * ratio);
  const modGain = gain(ctx, index);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);
  return {
    carrier, mod, modGain,
    output: carrier,
    start(t) { mod.start(t); carrier.start(t); },
    stop(t) { try { mod.stop(t); carrier.stop(t); } catch { /* already stopped */ } },
  };
}

/**
 * Ring modulation: multiply two signals by driving a gain's audio-rate parameter.
 * Produces sum and difference frequencies with no fundamental, which is why it
 * sounds like something has gone badly wrong with a power plant.
 */
export function ringMod(ctx, modulatorNode) {
  const g = ctx.createGain();
  g.gain.value = 0;                  // fully modulated; the carrier alone is silent
  modulatorNode.connect(g.gain);
  return g;
}

/**
 * FEEDBACK DELAY NETWORK REVERB.
 *
 * Four delay lines, each damped by a lowpass, cross-mixed through a 4x4 Hadamard
 * matrix scaled by feedback/2. Hadamard/2 is orthogonal, so the mixing preserves
 * energy exactly and `feedback` alone decides the decay time - the network cannot
 * run away as long as feedback < 1.
 *
 * There is no convolver and no impulse response, so nothing has to be loaded or
 * pre-rendered, and `set()` can retune the whole space live when the player enters
 * a different point of interest.
 *
 * Space does not reverberate. What this models is the player's own hull: every
 * sound in this game is heard through a kilometre and a half of structure, and the
 * graveyard's long tail is that structure ringing.
 */
/**
 * The maximum per-pass loop gain the network is allowed. Measured, not derived:
 * the four delay lines are close in length, so the network's real loop gain runs
 * about 25% above the nominal matrix scale and it goes unstable somewhere between
 * 0.75 and 0.84. Reverb LENGTH is bought with `size` - longer delay lines, same
 * gain - rather than by pushing feedback toward one, which is the operation that
 * turns a reverb into an oscillator. `docs/probes/audio.png` is where this gets
 * re-verified: an FDN that is growing shows up as an ambience bed whose envelope
 * rises.
 */
export const FDN_MAX_FEEDBACK = 0.70;

export function createFDN(ctx, {
  times = [0.0297, 0.0371, 0.0411, 0.0437], feedback = 0.52,
  damp = 4200, preDelay = 0.012, size = 1,
} = {}) {
  feedback = clamp(feedback, 0, FDN_MAX_FEEDBACK);
  const input = gain(ctx, 1);
  const hp = biquad(ctx, 'highpass', 140, 0.6);   // keep the sub out of the tail
  const pre = ctx.createDelay(0.5);
  pre.delayTime.value = clamp(preDelay, 0, 0.5);

  const delays = [];
  const damps = [];
  for (let i = 0; i < 4; i++) {
    const d = ctx.createDelay(1.0);
    d.delayTime.value = clamp(times[i] * size, 0.001, 0.99);
    // Q IS IN DECIBELS for lowpass and highpass in the Web Audio API, not a
    // linear Q. `0.5` here does not mean a gentle filter, it means a +1.6 dB
    // resonant peak - INSIDE THE FEEDBACK LOOP, where it multiplied the loop gain
    // by 1.2 and turned the reverb into a slowly rising oscillator. -3 dB is the
    // Butterworth point: monotonic, peak gain exactly 0 dB, nothing to accumulate.
    const f = biquad(ctx, 'lowpass', damp, -3);
    d.connect(f);
    delays.push(d);
    damps.push(f);
  }

  const H = [[1, 1, 1, 1], [1, -1, 1, -1], [1, 1, -1, -1], [1, -1, -1, 1]];
  const k = feedback / 2;
  const fbs = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const g = gain(ctx, H[i][j] * k);
      damps[i].connect(g);
      g.connect(delays[j]);
      fbs.push(g);
    }
  }

  input.connect(hp);
  hp.connect(pre);
  // Alternating input signs so the four lines are decorrelated from the first pass
  // rather than waiting for the matrix to do it.
  const inGains = [];
  for (let i = 0; i < 4; i++) {
    const g = gain(ctx, (i % 2 === 0 ? 0.5 : -0.5));
    pre.connect(g);
    g.connect(delays[i]);
    inGains.push(g);
  }

  const merger = ctx.createChannelMerger(2);
  const l = gain(ctx, 0.5);
  const r = gain(ctx, 0.5);
  damps[0].connect(l); damps[3].connect(l);
  damps[1].connect(r); damps[2].connect(r);
  l.connect(merger, 0, 0);
  r.connect(merger, 0, 1);
  const output = gain(ctx, 1);
  merger.connect(output);

  return {
    input, output, delays, damps, fbs,
    /** Retune the space. `when` lets a POI transition ramp rather than jump. */
    set({ feedback: fb, damp: dz, size: sz } = {}, when = 0, tau = 0.4) {
      if (fb !== undefined) {
        const kk = clamp(fb, 0, FDN_MAX_FEEDBACK) / 2;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            fbs[i * 4 + j].gain.setTargetAtTime(H[i][j] * kk, when, tau);
          }
        }
      }
      if (dz !== undefined) for (const f of damps) f.frequency.setTargetAtTime(clamp(dz, 200, 18000), when, tau);
      if (sz !== undefined) {
        for (let i = 0; i < 4; i++) delays[i].delayTime.setTargetAtTime(clamp(times[i] * sz, 0.001, 0.99), when, tau);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// envelopes
// ---------------------------------------------------------------------------

/**
 * How many time constants a percussive decay runs before it is cut to silence.
 * 6.0 tau is -52 dB, which is inaudible under anything else in the mix and keeps
 * the longest capital-ship tail inside ten seconds instead of twenty.
 */
export const DECAY_TAUS = 6.0;

/**
 * A percussive envelope on an AudioParam.
 *
 * READ THIS BEFORE CHANGING IT. `linearRampToValueAtTime` following a
 * `setTargetAtTime` does NOT continue from where the exponential approach got to:
 * per the automation rules the ramp begins at the PREVIOUS EVENT'S time and value,
 * so a `setTarget(0, t, tau)` followed by `linearRamp(0, t + total)` silently
 * replaces the entire exponential decay with a straight line from the peak. Every
 * sound in this stream was a long linear fade until this was found, and the sound
 * that gave it away was a beam that ramped from 0 to 0 and rendered pure silence.
 *
 * So the shape here is built from ramps only: linear up over the attack,
 * EXPONENTIAL down to a -52 dB floor, then four milliseconds of linear ramp to
 * true zero, because an exponential can never reach it and a bus that never
 * reaches zero carries DC.
 */
export function percEnv(param, t0, {
  peak = 1, attack = 0.002, tau = 0.12, hold = 0, duration = null,
} = {}) {
  const p = Math.max(1e-4, peak);
  const floor = p * 0.0025;                       // -52 dB
  const a = Math.max(0.0002, attack);
  const start = t0 + a + Math.max(0, hold);
  const natural = start + tau * DECAY_TAUS;
  const end = duration !== null ? Math.max(start + 0.003, t0 + duration) : natural;

  param.cancelScheduledValues(t0);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(p, t0 + a);
  if (hold > 0) param.setValueAtTime(p, start);
  param.exponentialRampToValueAtTime(floor, end);
  param.linearRampToValueAtTime(0, end + 0.004);
  return end + 0.004 - t0;
}

/**
 * Cancel whatever an AudioParam was doing, HOLD the value it had reached, and ramp
 * from there. The hold is the whole point: without it the ramp inherits the
 * previous event's start value and jumps.
 */
export function rampTo(param, t0, target, duration) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t0);
  } else {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(param.value, t0);
  }
  if (duration <= 0) param.setValueAtTime(target, t0);
  else param.linearRampToValueAtTime(target, t0 + duration);
  return t0 + Math.max(0, duration);
}

/** Attack / sustain envelope for a held voice. Pair with `releaseEnv`. */
export function attackEnv(param, t0, { peak = 1, attack = 0.03 } = {}) {
  return rampTo(param, t0, peak, attack);
}

/** Release a held voice. Returns the time at which it is silent. */
export function releaseEnv(param, t0, { release = 0.18 } = {}) {
  return rampTo(param, t0, 0, release);
}

/**
 * Sweep an AudioParam through a series of [offsetSeconds, value] points.
 * Exponential where both ends are positive (pitch, filter cutoff - both are
 * perceived logarithmically), linear otherwise.
 */
export function sweep(param, t0, points) {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(Math.max(points[0][1], 1e-4), t0);
  for (let i = 1; i < points.length; i++) {
    const [dt, v] = points[i];
    const prev = points[i - 1][1];
    if (v > 0 && prev > 0) param.exponentialRampToValueAtTime(v, t0 + dt);
    else param.linearRampToValueAtTime(v, t0 + dt);
  }
  return t0 + points[points.length - 1][0];
}

/** Start a node, tolerating a context that has already been torn down. */
export function startAt(node, t, offset) {
  try {
    if (offset !== undefined && node.buffer) node.start(t, offset % node.buffer.duration);
    else node.start(t);
  } catch { /* context closed or already started */ }
}

export function stopAt(node, t) {
  try { node.stop(t); } catch { /* already stopped */ }
}
