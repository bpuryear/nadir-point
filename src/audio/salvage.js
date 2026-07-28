/**
 * SALVAGE.
 *
 * Cutting is the only sustained sound in the game the player deliberately turns on
 * and holds, so it has to survive being listened to for thirty seconds at a time.
 * That rules out a static loop and it rules out anything with a strong pitch.
 *
 * What it is: a granular grind bed (pre-baked, so playback is one node), a narrow
 * moving band, a chopped cutter tone, and slag. Four things, all of them wandering
 * slowly against each other so the texture never repeats audibly.
 *
 * MATERIAL MATTERS. The character comes from the faction whose hull is being cut,
 * because that is what the player is actually deciding between when they pick a
 * wreck:
 *
 *   coalition  heavy steel. Low band, hard chop, a lot of sub, plenty of slag.
 *   concord    ceramic over alloy. High band, clean, a ringing overtone, little sub.
 *   derelict   old bronze. Mid band, ragged irregular chop, the most sparks.
 *   player     between the two, because the player's hull is field repairs.
 *
 * Progress is audible: as the cut breaks through, the band opens upward and the
 * slag increases. You can hear a section about to come free.
 */

import { clamp, lerp, gain as mkGain, biquad, osc, bufferSource, shaper, startAt } from './synth.js';
import { noiseBurst, subThump, metalRing, chirp } from './parts.js';

const MATERIAL = {
  coalition: { band: 380, q: 1.5, tone: 196, am: 13, amDepth: 0.55, sub: 0.50, slag: 0.28, drive: 2.9, ring: 0.06, ringF: 720 },
  concord: { band: 980, q: 2.3, tone: 344, am: 22, amDepth: 0.32, sub: 0.20, slag: 0.15, drive: 1.4, ring: 0.20, ringF: 1520 },
  derelict: { band: 620, q: 1.2, tone: 258, am: 9, amDepth: 0.70, sub: 0.36, slag: 0.44, drive: 2.3, ring: 0.10, ringF: 940 },
  player: { band: 540, q: 1.7, tone: 232, am: 16, amDepth: 0.48, sub: 0.34, slag: 0.24, drive: 2.1, ring: 0.10, ringF: 1080 },
};

export class SalvageAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    this.cut = null;          // { handle, mat, band, slagG, faction }
    this.progress = 0;
  }

  /**
   * Start (or retune) the cutting bed.
   * @param {Object} spat
   * @param {string} faction  whose hull is under the beam
   */
  startCut(spat, faction = 'player') {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (this.cut) {
      if (this.cut.faction === faction) return true;
      this.stopCut(0.12);
    }
    const ctx = A.ctx;
    const mat = MATERIAL[faction] ?? MATERIAL.player;
    const handle = A.sustain('engines', spat, { reverb: 0.75 });
    if (!handle) return false;
    const d = handle.input;
    const t = A.now;
    const P = A.pitch;

    // --- grind bed: the baked granular cloud, band-limited and saturated ------
    const gbuf = A.buffers.grind;
    const src = bufferSource(ctx, gbuf, { loop: true, rate: 0.85 * P });
    const band = biquad(ctx, 'bandpass', mat.band * P, mat.q);
    const sat = shaper(ctx, mat.drive);
    const grindG = mkGain(ctx, 0.62);
    src.connect(band); band.connect(sat); sat.connect(grindG); grindG.connect(d);

    // A second, slower copy detuned against the first. Two grains clouds beating
    // against each other is what stops a loop from sounding like a loop.
    const src2 = bufferSource(ctx, gbuf, { loop: true, rate: 0.61 * P });
    const band2 = biquad(ctx, 'bandpass', mat.band * 1.47 * P, mat.q * 0.8);
    const grind2G = mkGain(ctx, 0.34);
    src2.connect(band2); band2.connect(grind2G); grind2G.connect(d);

    // Slow wander on the main band, so the cut sounds like it is moving through
    // material rather than sitting on one spot.
    const wander = osc(ctx, 'sine', 0.21 * P);
    const wanderG = mkGain(ctx, mat.band * 0.30 * P);
    wander.connect(wanderG); wanderG.connect(band.frequency);

    // --- cutter tone: a chopped saw. The tool itself. ------------------------
    const tone = osc(ctx, 'sawtooth', mat.tone * P);
    const toneLP = biquad(ctx, 'lowpass', mat.tone * 4.5 * P, 1.4);
    const toneG = mkGain(ctx, 0.16);
    tone.connect(toneLP); toneLP.connect(toneG); toneG.connect(d);
    // Hard amplitude modulation - the duty cycle of the cutting head.
    const chop = osc(ctx, 'square', mat.am * P);
    const chopG = mkGain(ctx, mat.amDepth * 0.16);
    chop.connect(chopG); chopG.connect(toneG.gain);

    // --- ringing overtone: ceramic sings, steel does not --------------------
    const ring = osc(ctx, 'sine', mat.ringF * P);
    const ringG = mkGain(ctx, mat.ring * 0.10);
    ring.connect(ringG); ringG.connect(d);

    // --- sub rumble: the wreck resisting -----------------------------------
    const rbuf = A.buffers.brown;
    const rsrc = bufferSource(ctx, rbuf, { loop: true, rate: 0.7 * P });
    const rlp = biquad(ctx, 'lowpass', 74 * P, 2.6);
    const rG = mkGain(ctx, mat.sub * 0.7);
    rsrc.connect(rlp); rlp.connect(rG); rG.connect(d);

    // --- slag: molten spatter ----------------------------------------------
    const sbuf = A.buffers.sparkle;
    const ssrc = bufferSource(ctx, sbuf, { loop: true, rate: 1.1 * P });
    const shp = biquad(ctx, 'highpass', 2400 * P, 0.7);
    const slagG = mkGain(ctx, mat.slag * 0.30);
    ssrc.connect(shp); shp.connect(slagG); slagG.connect(d);

    const nodes = [src, src2, wander, tone, chop, ring, rsrc, ssrc];
    for (const n of nodes) {
      if (n.buffer) startAt(n, t, A.rng.next() * n.buffer.duration);
      else startAt(n, t);
      handle.sources.push(n);
    }

    handle.setGain(0.85 * spat.gain, 0.09);
    this.cut = { handle, mat, band, slagG, toneG, faction, base: mat.band };
    this.progress = 0;

    // The beam striking the hull.
    const V = A.voice('impacts', spat, { duration: 0.5, priority: 1.0, reverb: 0.8 });
    if (V) {
      chirp(A, V.input, V.t, { f0: 180, f1: 900, duration: 0.09, peak: 0.24, type: 'sawtooth', lowpass: 3000 });
      noiseBurst(A, V.input, V.t, {
        buffer: 'sparkle', type: 'highpass', freq: 1800, peak: 0.30, attack: 0.006, tau: 0.14,
      });
    }
    return true;
  }

  /** Track the section as it tumbles, and let progress open the cut up. */
  updateCut(spat, progress = this.progress, when = null) {
    const c = this.cut;
    if (!c) return;
    const A = this.audio;
    const t = when ?? A.ctx.currentTime;
    this.progress = clamp(progress, 0, 1);
    c.handle.follow(spat, 0.12, t);
    c.handle.setGain(0.85 * spat.gain, 0.12, t);
    // Breaking through: the band opens and the slag comes up.
    c.band.frequency.setTargetAtTime(c.base * lerp(1, 1.55, this.progress) * A.pitch, t, 0.3);
    c.slagG.gain.setTargetAtTime(c.mat.slag * 0.30 * lerp(1, 2.1, this.progress), t, 0.3);
  }

  stopCut(fade = 0.18) {
    if (!this.cut) return;
    this.cut.handle.stop(fade);
    this.cut = null;
    this.progress = 0;
  }

  /** A section comes free: the last of the metal parting, then the tractor taking it. */
  sectionFree(spat, faction = 'player') {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    const mat = MATERIAL[faction] ?? MATERIAL.player;
    const V = A.voice('impacts', spat, { duration: 1.6, priority: 2.0, reverb: 1.1 });
    if (!V) return false;
    const { input: d, t } = V;
    // The parting: a downward tear, not an impact.
    metalRing(A, d, t, {
      freqs: [mat.ringF * 0.7, mat.ringF * 1.13, mat.ringF * 1.81], q: 11,
      peak: 0.36, tau: 0.34, sweepOctaves: -0.8,
    });
    noiseBurst(A, d, t, {
      buffer: 'grind', type: 'bandpass', freq: mat.band * 1.4, sweepTo: mat.band * 0.45,
      q: 1.1, peak: 0.42, attack: 0.008, tau: 0.26, drive: mat.drive * 0.6,
    });
    subThump(A, d, t + 0.01, { f0: 64, f1: 27, sweepTime: 0.16, peak: 0.5, tau: 0.24 });
    // Tractor engaging: a rising hum with no attack at all.
    chirp(A, d, t + 0.10, {
      f0: 70, f1: 190, duration: 0.42, peak: 0.20, type: 'triangle',
      attack: 0.30, tau: 0.22, partials: 2, detune: 9, lowpass: 900,
    });
    return true;
  }

  /** Part or materials arriving in the hold. Small, mechanical, satisfying. */
  acquired(spat, { module = false } = {}) {
    const A = this.audio;
    if (!A.ready || A.paused) return false;
    if (!A.gate('s:acq', 0.06)) return false;
    const V = A.voice('ui', A.here(), { duration: 0.7, priority: 1.5, reverb: 0.4, filter: false });
    if (!V) return false;
    const { input: d, t } = V;
    // A module landing in the rack is a two-stage latch; scrap is one dull clunk.
    metalRing(A, d, t, {
      freqs: module ? [520, 823, 1290] : [268, 412], q: module ? 14 : 8,
      peak: module ? 0.26 : 0.20, tau: module ? 0.13 : 0.09, exciteMs: 2,
    });
    if (module) {
      metalRing(A, d, t + 0.085, {
        freqs: [1180, 1770], q: 20, peak: 0.16, tau: 0.16, exciteMs: 1.5,
      });
    }
    subThump(A, d, t, { f0: 92, f1: 52, sweepTime: 0.04, peak: 0.22, tau: 0.06 });
    return true;
  }
}
