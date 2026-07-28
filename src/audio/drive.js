/**
 * DRIVES.
 *
 * THE MASS. If one thing in this stream is allowed to be expensive it is this,
 * because a capital ship that sounds like a fighter is a failed capital ship and
 * no amount of good weapon design recovers from it.
 *
 * The bed is six layers and only two of them are above 300 Hz:
 *
 *   1. FUNDAMENTAL   two sines a few thousandths apart, 30-44 Hz on a capital.
 *                    The detune gives a beat under half a hertz - you do not hear
 *                    it as pitch, you hear it as the plant not being quite steady.
 *   2. HARMONIC      2f, quiet. Adds body without raising the perceived pitch.
 *   3. TORCH         brown noise through a resonant lowpass that OPENS with
 *                    throttle. This is the exhaust.
 *   4. TURBINE       a narrow band of pink around 260 Hz. Machinery.
 *   5. PLASMA        a whisper of white at 2.8 kHz. Only audible from close, and
 *                    the proximity lowpass in engine.js removes it at range for
 *                    free - which is exactly the behaviour we want.
 *   6. BREATH        a 0.13 Hz swell on the whole bed. Nothing this big is steady.
 *
 * FUNDAMENTAL FREQUENCY IS HULL LENGTH. 1400 m cruiser: 31 Hz. 480 m destroyer:
 * 38 Hz. 18 m fighter: 148 Hz, with the layer balance inverted so it is nearly all
 * turbine and almost no sub. That contrast is the point of the whole file: when a
 * fighter crosses in front of the cruiser you should be able to hear the size
 * difference without looking.
 */

import { clamp, lerp, gain as mkGain, biquad, osc, bufferSource, startAt } from './synth.js';

/** Maximum simultaneous drive beds. Beyond this the mix is mud, not scale. */
const MAX_DRIVES = 6;

/** How often the "which ships get a voice" pass runs, seconds of wall clock. */
const SELECT_INTERVAL = 0.22;

/**
 * Fundamental from hull length. Anchored so the reference hulls in `units.js`
 * land on deliberate numbers rather than wherever a formula happened to put them.
 */
function fundamentalFor(length) {
  const L = clamp(length, 8, 4000);
  // 31 Hz at 1400 m, 38 at 480, 55 at 95, 148 at 18.
  return clamp(31 * Math.pow(1400 / L, 0.34), 26, 190);
}

class DriveVoice {
  constructor(audio, ship, spat) {
    const A = this.A = audio;
    const ctx = A.ctx;
    this.ship = ship;
    this.dead = false;

    const length = ship.classDef?.length ?? 400;
    const f0 = fundamentalFor(length);
    this.f0 = f0;
    // Everything shorter than a corvette is a different instrument: less sub, far
    // more turbine, and a torch that is bright rather than felt.
    const small = clamp((150 - f0) / 100, 0, 1);   // 1 = capital, 0 = fighter
    this.small = small;

    const h = A.sustain('engines', spat, { reverb: 0.5, filter: true });
    this.handle = h;
    if (!h) { this.dead = true; return; }
    const d = h.input;
    const t = A.now;
    const P = A.pitch;

    // --- 1 fundamental ------------------------------------------------------
    this.fundG = mkGain(ctx, 0.9 * lerp(0.28, 1, small));
    this.fundG.connect(d);
    this.oscA = osc(ctx, 'sine', f0 * P);
    this.oscB = osc(ctx, 'sine', f0 * 1.0075 * P);
    const ga = mkGain(ctx, 0.55);
    const gb = mkGain(ctx, 0.45);
    this.oscA.connect(ga); ga.connect(this.fundG);
    this.oscB.connect(gb); gb.connect(this.fundG);

    // --- 2 harmonic ---------------------------------------------------------
    this.harm = osc(ctx, 'sine', f0 * 2.004 * P);
    this.harmG = mkGain(ctx, 0.22 * lerp(0.5, 1, small));
    this.harm.connect(this.harmG);
    this.harmG.connect(d);

    // --- 3 torch ------------------------------------------------------------
    const bbuf = A.buffers.brown;
    this.torchSrc = bufferSource(ctx, bbuf, { loop: true, rate: P });
    this.torchLP = biquad(ctx, 'lowpass', 90 * P, 3.2);
    this.torchG = mkGain(ctx, 0.0);
    this.torchSrc.connect(this.torchLP);
    this.torchLP.connect(this.torchG);
    this.torchG.connect(d);

    // --- 4 turbine ----------------------------------------------------------
    const pbuf = A.buffers.pink;
    this.turbSrc = bufferSource(ctx, pbuf, { loop: true, rate: P });
    this.turbBP = biquad(ctx, 'bandpass', lerp(760, 262, small) * P, 1.7);
    this.turbG = mkGain(ctx, 0);
    this.turbSrc.connect(this.turbBP);
    this.turbBP.connect(this.turbG);
    this.turbG.connect(d);

    // --- 5 plasma -----------------------------------------------------------
    const wbuf = A.buffers.white;
    this.plasmaSrc = bufferSource(ctx, wbuf, { loop: true, rate: P });
    this.plasmaBP = biquad(ctx, 'bandpass', 2800 * P, 1.1);
    this.plasmaG = mkGain(ctx, 0);
    this.plasmaSrc.connect(this.plasmaBP);
    this.plasmaBP.connect(this.plasmaG);
    this.plasmaG.connect(d);

    // --- 6 breath -----------------------------------------------------------
    // A slow swell on the fundamental's gain. Rate scales with time compression
    // so the plant breathes faster when the world does.
    this.breath = osc(ctx, 'sine', 0.13 * A.pitch);
    this.breathG = mkGain(ctx, 0.16);
    this.breath.connect(this.breathG);
    this.breathG.connect(this.fundG.gain);

    for (const n of [this.oscA, this.oscB, this.harm, this.breath]) startAt(n, t);
    startAt(this.torchSrc, t, A.rng.next() * bbuf.duration);
    startAt(this.turbSrc, t, A.rng.next() * pbuf.duration);
    startAt(this.plasmaSrc, t, A.rng.next() * wbuf.duration);
    h.sources.push(this.oscA, this.oscB, this.harm, this.breath,
      this.torchSrc, this.turbSrc, this.plasmaSrc);

    this.throttle = -1;
    h.setGain(0, 0.001);
    this._masterLevel = 0;
  }

  /**
   * @param {Object} spat
   * @param {number} throttle 0..1
   * @param {number} health   0..1 engine subsystem health; dead drives go silent
   * @param {number} [when]   absolute time to schedule at; offline renders need it
   */
  update(spat, throttle, health, when = null) {
    if (this.dead || !this.handle) return;
    const A = this.A;
    const ctx = A.ctx;
    const t = when ?? ctx.currentTime;
    const P = A.pitch;
    const thr = clamp(throttle, 0, 1) * clamp(health, 0, 1);

    this.handle.follow(spat, 0.10, t);
    // Idle is audible: a capital ship's plant never actually stops. 18% at rest.
    // The 0.42 is bed headroom - measured against the weapons and impacts in
    // docs/probes/audio.png, this puts the drive about 9 dB under a cannon, which
    // is where a continuous layer has to sit or it swallows the transients.
    const lvl = 0.42 * (0.18 + 0.82 * Math.pow(thr, 0.7)) * lerp(0.55, 1, this.small);
    this.handle.setGain(lvl * spat.gain, 0.14, t);

    if (Math.abs(thr - this.throttle) > 0.01) {
      this.throttle = thr;
      const tau = 0.30;
      // Under load the plant strains upward - a tenth of a semitone, no more.
      this.oscA.frequency.setTargetAtTime(this.f0 * (1 + 0.10 * thr) * P, t, tau);
      this.oscB.frequency.setTargetAtTime(this.f0 * 1.0075 * (1 + 0.10 * thr) * P, t, tau);
      this.harm.frequency.setTargetAtTime(this.f0 * 2.004 * (1 + 0.10 * thr) * P, t, tau);
      // The torch opens. This is the loudest single cue that a ship is burning.
      this.torchLP.frequency.setTargetAtTime(lerp(88, 240, thr) * P, t, tau);
      this.torchG.gain.setTargetAtTime(lerp(0.16, 0.72, thr) * lerp(0.4, 1, this.small), t, tau);
      this.turbG.gain.setTargetAtTime(lerp(0.03, 0.20, thr) * lerp(1.6, 1, this.small), t, tau);
      this.plasmaG.gain.setTargetAtTime(lerp(0.004, 0.045, thr) * lerp(2.2, 1, this.small), t, tau);
    }
  }

  stop(fade = 0.35) {
    if (this.dead) return;
    this.dead = true;
    this.handle?.stop(fade);
    this.handle = null;
  }
}

export class DriveAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    /** @type {{ship:Object, voice:DriveVoice}[]} */
    this.voices = [];
    this._selectTimer = 0;
    // Preallocated scoring scratch. The selection pass runs a few times a second
    // and must not produce garbage.
    this._candShip = new Array(MAX_DRIVES).fill(null);
    this._candScore = new Float64Array(MAX_DRIVES);
    this._candCount = 0;
  }

  /**
   * @param {number} dt   render delta, seconds of wall clock
   * @param {Array}  ships
   * @param {Object} player
   */
  update(dt, ships, player) {
    const A = this.audio;
    if (!A.ready) return;
    if (A.paused) return;

    this._selectTimer -= dt;
    if (this._selectTimer <= 0) {
      this._selectTimer = SELECT_INTERVAL;
      this._select(ships, player);
    }

    for (let i = this.voices.length - 1; i >= 0; i--) {
      const rec = this.voices[i];
      const s = rec.ship;
      if (!s || s.dead || rec.voice.dead) {
        rec.voice.stop(0.25);
        const last = this.voices.length - 1;
        if (i !== last) this.voices[i] = this.voices[last];
        this.voices.pop();
        continue;
      }
      const p = s.position;
      const spat = A.spatialAt(p.x, p.y, p.z);
      rec.voice.update(spat, throttleOf(s), engineHealthOf(s));
    }
  }

  /**
   * Pick the ships worth hearing: the player always, then whichever hulls score
   * highest on "how loud would this be, times how big it is". Size matters in the
   * score because a distant capital ship is more interesting than a near fighter.
   */
  _select(ships, player) {
    const A = this.audio;
    this._candCount = 0;
    for (let i = 0; i < this._candShip.length; i++) this._candShip[i] = null;

    for (let i = 0; i < ships.length; i++) {
      const s = ships[i];
      if (!s || s.dead || !s.position) continue;
      const p = s.position;
      const spat = A.spatialAt(p.x, p.y, p.z);
      if (!spat.audible || spat.gain < 0.012) continue;
      const size = clamp((s.classDef?.length ?? 200) / 480, 0.2, 3);
      const score = (s === player ? 1e6 : 0) + spat.gain * Math.pow(size, 0.7);
      this._insert(s, score);
    }

    // Stop voices that fell out of the set.
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this._candIndex(this.voices[i].ship) >= 0) continue;
      this.voices[i].voice.stop(0.4);
      const last = this.voices.length - 1;
      if (i !== last) this.voices[i] = this.voices[last];
      this.voices.pop();
    }
    // Start voices that came into it.
    for (let i = 0; i < this._candCount; i++) {
      const s = this._candShip[i];
      if (this._voiceIndex(s) >= 0) continue;
      const p = s.position;
      const v = new DriveVoice(A, s, A.spatialAt(p.x, p.y, p.z));
      if (v.dead) continue;
      this.voices.push({ ship: s, voice: v });
    }
  }

  _insert(ship, score) {
    // Insertion sort into a fixed-size top-N. No allocation, no comparator closure.
    let pos = this._candCount < MAX_DRIVES ? this._candCount : -1;
    if (pos < 0) {
      if (score <= this._candScore[MAX_DRIVES - 1]) return;
      pos = MAX_DRIVES - 1;
    } else {
      this._candCount++;
    }
    while (pos > 0 && this._candScore[pos - 1] < score) {
      this._candScore[pos] = this._candScore[pos - 1];
      this._candShip[pos] = this._candShip[pos - 1];
      pos--;
    }
    this._candScore[pos] = score;
    this._candShip[pos] = ship;
  }

  _candIndex(ship) {
    for (let i = 0; i < this._candCount; i++) if (this._candShip[i] === ship) return i;
    return -1;
  }

  _voiceIndex(ship) {
    for (let i = 0; i < this.voices.length; i++) if (this.voices[i].ship === ship) return i;
    return -1;
  }

  stopAll(fade = 0.15) {
    for (const rec of this.voices) rec.voice.stop(fade);
    this.voices.length = 0;
  }

  get count() { return this.voices.length; }
}

function throttleOf(ship) {
  const b = ship.body;
  if (!b) return 0;
  if (b.throttle !== undefined && ship.planeLocked) return clamp(b.throttle, 0, 1);
  const sp = b.velocity ? Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) : 0;
  return clamp(sp / Math.max(1, b.maxSpeed ?? 400), 0, 1);
}

function engineHealthOf(ship) {
  if (typeof ship.kindHealth !== 'function') return 1;
  // A ship with no engine subsystems declared is not a damage model, it is a
  // stand-in hull - give it a working drive rather than silence.
  const engines = ship.subsystems?.size ? ship.kindHealth('engine') : 1;
  return clamp(engines, 0, 1);
}

export { fundamentalFor };
