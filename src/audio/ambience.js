/**
 * AMBIENCE.
 *
 * One bed per point of interest, and the range between them is the whole argument:
 *
 *   near-star   ROAR. Ninety per cent of the bus, a wall of low-passed brown noise
 *               with slow surges and an occasional flare. It is uncomfortable and
 *               it is supposed to be.
 *   belt        TICKING. Rock and hull plate knocking together somewhere out in
 *               the dark, over a dust rumble you feel more than hear.
 *   graveyard   NEAR-SILENCE. The quietest bed by a factor of three, mostly gaps,
 *               with a distant structural groan every ten or fifteen seconds and
 *               a 26 Hz bed at the very edge of audibility. Silence is a choice
 *               here, and it is the strongest one in the file: after the near-star
 *               the graveyard should feel like your ears have stopped working.
 *   giant-orbit MAGNETOSPHERE. A whistler sweeping slowly through a filtered bed.
 *   station     MACHINERY. A hum bank on 49.5 Hz and its harmonics, plus air.
 *   yard        WORK. Hum plus intermittent metallic clanks from the gantries.
 *
 * The temporal structure of each bed - where the surges are, where the gaps are,
 * which second the groan happens in - is BAKED INTO THE BUFFER at install, from a
 * seeded RNG. At run time a bed is two or three looping sources through fixed
 * filters and nothing schedules anything. Ambience costs no CPU.
 *
 * Each POI also retunes the reverb, because the reverb in this game is the player's
 * own hull ringing, and it rings very differently when you are parked inside a dead
 * fleet than when you are two million kilometres from a star.
 */

import {
  clamp, lerp, gain as mkGain, biquad, osc, bufferSource, startAt,
  loopData, dataToBuffer, genBrown, genTicks, genGroans, normalise, NOMINAL_RATE,
} from './synth.js';

/**
 * Reverb character per POI. `wet` is the return level, not a send.
 *
 * LENGTH COMES FROM `size`, NEVER FROM `feedback`. Feedback is the per-pass loop
 * gain and it is capped at FDN_MAX_FEEDBACK in synth.js; pushing it toward one to
 * buy a long tail is what makes a delay network ring forever instead of decaying.
 * A long graveyard tail is long DELAY LINES at a safe gain: size 1.9 puts them at
 * 56-83 ms and gives roughly three seconds of RT60.
 */
const SPACE = {
  'near-star': { feedback: 0.30, damp: 2600, size: 0.7, wet: 0.22 },
  belt: { feedback: 0.52, damp: 3400, size: 1.15, wet: 0.55 },
  graveyard: { feedback: 0.70, damp: 2300, size: 1.9, wet: 0.85 },
  'giant-orbit': { feedback: 0.46, damp: 4200, size: 1.0, wet: 0.42 },
  station: { feedback: 0.58, damp: 4800, size: 1.25, wet: 0.60 },
  yard: { feedback: 0.62, damp: 3600, size: 1.45, wet: 0.66 },
};

/**
 * Overall bed level per POI. These are the numbers that make the game's dynamic
 * range: 0.95 against 0.26 is eleven decibels between the loudest place in the
 * system and the quietest, and the player will feel every one of them.
 */
const LEVEL = {
  'near-star': 1.85,
  belt: 0.40,
  graveyard: 0.12,
  'giant-orbit': 0.36,
  station: 0.34,
  yard: 0.40,
};

const FALLBACK = 'giant-orbit';

/** POI kinds from `world/system.js` mapped onto the palette ids that name a bed. */
const KIND_TO_BED = {
  star: 'near-star', belt: 'belt', graveyard: 'graveyard',
  giant: 'giant-orbit', station: 'station', yard: 'yard',
  battlefield: 'graveyard',
};

export function bedIdFor(idOrKind) {
  if (!idOrKind) return FALLBACK;
  if (SPACE[idOrKind]) return idOrKind;
  return KIND_TO_BED[idOrKind] ?? FALLBACK;
}

// ---------------------------------------------------------------------------
// baked buffers - built once per POI, on first entry, then cached
// ---------------------------------------------------------------------------

/**
 * A star's output, as heard through a hull: a bed that surges on two slow periods
 * with occasional flares folded on top. All of it is in the buffer, so the run-time
 * cost is one AudioBufferSourceNode.
 */
function bakeStar(rng, sr) {
  return loopData(16, 2.5, sr, 2, (sr2, n, c) => {
    const r = rng.fork(`star${c}`);
    const d = genBrown(n, r);
    const ph1 = r.next() * Math.PI * 2;
    const ph2 = r.next() * Math.PI * 2;
    // Flares: fast rise, long fall, a few per loop.
    const flares = [];
    for (let i = 0; i < 3; i++) {
      flares.push({ at: r.next() * n, rise: (0.35 + r.next() * 0.5) * sr2, fall: (3 + r.next() * 4) * sr2, amp: 0.5 + r.next() });
    }
    for (let i = 0; i < n; i++) {
      const t = i / sr2;
      let env = 0.46 + 0.32 * Math.sin(2 * Math.PI * 0.055 * t + ph1)
        + 0.18 * Math.sin(2 * Math.PI * 0.021 * t + ph2);
      for (const f of flares) {
        const dt = i - f.at;
        if (dt > -f.rise && dt < f.fall) {
          const e = dt < 0 ? 1 + dt / f.rise : Math.exp(-dt / (f.fall * 0.35));
          env += f.amp * e;
        }
      }
      d[i] *= clamp(env, 0, 3);
    }
    normalise(d, 0.95);
    return d;
  });
}

/** Rock knocking on rock. Sparse, irregular, and never quite rhythmic. */
function bakeBelt(rng, sr) {
  return loopData(19, 1.5, sr, 2, (sr2, n, c) => {
    const d = genTicks(n, sr2, rng.fork(`belt${c}`), {
      ticksPerSec: 2.1, fLo: 260, fHi: 3400, ringMsLo: 18, ringMsHi: 210, partials: 3,
    });
    normalise(d, 0.9);
    return d;
  });
}

/**
 * A dead fleet settling. Five events in twenty-six seconds; the rest is nothing.
 * The gaps are the content.
 */
function bakeGraveyard(rng, sr) {
  return loopData(22, 3.0, sr, 2, (sr2, n, c) => {
    const d = genGroans(n, sr2, rng.fork(`grave${c}`), {
      events: 5, fLo: 24, fHi: 84, durLo: 3.2, durHi: 8.5,
    });
    // A very occasional far-off tick, so the silence has a floor to sit on.
    const t = genTicks(n, sr2, rng.fork(`graveTick${c}`), {
      ticksPerSec: 0.34, fLo: 180, fHi: 900, ringMsLo: 60, ringMsHi: 420, amp: 0.5,
    });
    for (let i = 0; i < n; i++) d[i] += t[i] * 0.30;
    normalise(d, 0.9);
    return d;
  });
}

/** Planetary magnetosphere: a bed that swells on a very long period. */
function bakeGiant(rng, sr) {
  return loopData(14, 2.0, sr, 2, (sr2, n, c) => {
    const r = rng.fork(`giant${c}`);
    const d = genBrown(n, r);
    const ph = r.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const t = i / sr2;
      d[i] *= 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.037 * t + ph);
    }
    normalise(d, 0.92);
    return d;
  });
}

/** Gantry work: heavier, slower clanks than the belt's rock. */
function bakeYard(rng, sr) {
  return loopData(16, 1.5, sr, 2, (sr2, n, c) => {
    const d = genTicks(n, sr2, rng.fork(`yard${c}`), {
      ticksPerSec: 1.05, fLo: 120, fHi: 1100, ringMsLo: 45, ringMsHi: 480, partials: 3,
    });
    normalise(d, 0.9);
    return d;
  });
}

const BAKERS = {
  'near-star': bakeStar,
  belt: bakeBelt,
  graveyard: bakeGraveyard,
  'giant-orbit': bakeGiant,
  yard: bakeYard,
  station: null,           // station is oscillators and shared noise; nothing to bake
};

// ---------------------------------------------------------------------------

class Bed {
  constructor(audio, bedId, baked) {
    const A = this.A = audio;
    const ctx = A.ctx;
    this.id = bedId;
    this.level = LEVEL[bedId] ?? 0.4;

    // Ambience is not positional - it is the place, not a thing in it. So the
    // proximity filter is bypassed and the stereo image is whatever the baked
    // buffers carry, which is genuinely wide because each channel was generated
    // from its own RNG fork.
    const h = A.sustain('ambience', A.here(), { reverb: 1, filter: false });
    this.handle = h;
    if (!h) { this.dead = true; return; }
    const d = h.input;
    const t = A.now;
    const P = A.pitch;

    const add = (node) => { h.sources.push(node); return node; };
    const loopSrc = (buf, rate) => {
      const s = bufferSource(ctx, buf, { loop: true, rate: rate * P });
      startAt(s, t, A.rng.next() * buf.duration);
      return add(s);
    };

    switch (bedId) {
      case 'near-star': {
        // THE ROAR. Almost all of it below 200 Hz, with a resonant peak so it has
        // a note you can almost name - which is what makes it oppressive rather
        // than merely loud.
        const s = loopSrc(baked, 1);
        const lp = biquad(ctx, 'lowpass', 190 * P, 2.6);
        const g1 = mkGain(ctx, 0.90);
        s.connect(lp); lp.connect(g1); g1.connect(d);

        const bp = biquad(ctx, 'bandpass', 3400 * P, 0.75);
        const g2 = mkGain(ctx, 0.15);
        s.connect(bp); bp.connect(g2); g2.connect(d);

        const c = loopSrc(A.buffers.pink, 1);
        const hp = biquad(ctx, 'highpass', 6200 * P, 0.6);
        const g3 = mkGain(ctx, 0.055);
        c.connect(hp); hp.connect(g3); g3.connect(d);
        break;
      }
      case 'belt': {
        const s = loopSrc(baked, 1);
        const bp = biquad(ctx, 'bandpass', 1150 * P, 0.8);
        const g1 = mkGain(ctx, 0.55);
        s.connect(bp); bp.connect(g1); g1.connect(d);

        const dust = loopSrc(A.buffers.brown, 0.8);
        const lp = biquad(ctx, 'lowpass', 58 * P, 1.9);
        const g2 = mkGain(ctx, 0.34);
        dust.connect(lp); lp.connect(g2); g2.connect(d);

        const air = loopSrc(A.buffers.pink, 1);
        const bp2 = biquad(ctx, 'bandpass', 430 * P, 0.6);
        const g3 = mkGain(ctx, 0.06);
        air.connect(bp2); bp2.connect(g3); g3.connect(d);
        break;
      }
      case 'graveyard': {
        // Structural groans and nothing else. No air, no hiss, no hum.
        const s = loopSrc(baked, 1);
        const lp = biquad(ctx, 'lowpass', 240 * P, 1.7);
        const g1 = mkGain(ctx, 0.62);
        s.connect(lp); lp.connect(g1); g1.connect(d);

        // A 26 Hz bed at the threshold. You cannot hear it; you can tell when it
        // stops.
        const sub = loopSrc(A.buffers.brown, 0.55);
        const slp = biquad(ctx, 'lowpass', 31 * P, 3.4);
        const g2 = mkGain(ctx, 0.16);
        sub.connect(slp); slp.connect(g2); g2.connect(d);
        break;
      }
      case 'giant-orbit': {
        const s = loopSrc(baked, 1);
        const lp = biquad(ctx, 'lowpass', 300 * P, 1.5);
        const g1 = mkGain(ctx, 0.55);
        s.connect(lp); lp.connect(g1); g1.connect(d);
        // The whistler: a band sweeping very slowly through the bed.
        const bp = biquad(ctx, 'bandpass', 1400 * P, 3.2);
        const g2 = mkGain(ctx, 0.16);
        s.connect(bp); bp.connect(g2); g2.connect(d);
        const lfo = add(osc(ctx, 'sine', 0.041 * P));
        const lfoG = mkGain(ctx, 900 * P);
        lfo.connect(lfoG); lfoG.connect(bp.frequency);
        startAt(lfo, t);
        break;
      }
      case 'station': {
        // Machinery. 49.5 Hz and harmonics, all slightly flat of each other so the
        // hum crawls instead of sitting still.
        const humG = mkGain(ctx, 0.30);
        humG.connect(d);
        const partials = [[49.5, 1], [99.2, 0.42], [148.3, 0.2], [232.7, 0.08]];
        for (const [f, lv] of partials) {
          const o = add(osc(ctx, 'sine', f * P));
          const g = mkGain(ctx, lv);
          o.connect(g); g.connect(humG);
          startAt(o, t);
        }
        const air = loopSrc(A.buffers.pink, 1);
        const bp = biquad(ctx, 'bandpass', 880 * P, 0.7);
        const g2 = mkGain(ctx, 0.075);
        air.connect(bp); bp.connect(g2); g2.connect(d);

        const low = loopSrc(A.buffers.brown, 0.9);
        const lp = biquad(ctx, 'lowpass', 130 * P, 1.4);
        const g3 = mkGain(ctx, 0.24);
        low.connect(lp); lp.connect(g3); g3.connect(d);

        const clunk = loopSrc(A.buffers.debris, 0.34);
        const clp = biquad(ctx, 'lowpass', 620 * P, 1.1);
        const g4 = mkGain(ctx, 0.10);
        clunk.connect(clp); clp.connect(g4); g4.connect(d);
        break;
      }
      case 'yard':
      default: {
        const s = loopSrc(baked ?? A.buffers.debris, 1);
        const bp = biquad(ctx, 'bandpass', 700 * P, 0.8);
        const g1 = mkGain(ctx, 0.34);
        s.connect(bp); bp.connect(g1); g1.connect(d);

        const hum = loopSrc(A.buffers.brown, 0.85);
        const lp = biquad(ctx, 'lowpass', 145 * P, 1.6);
        const g2 = mkGain(ctx, 0.32);
        hum.connect(lp); lp.connect(g2); g2.connect(d);

        const air = loopSrc(A.buffers.pink, 1);
        const bp2 = biquad(ctx, 'bandpass', 1500 * P, 0.7);
        const g3 = mkGain(ctx, 0.055);
        air.connect(bp2); bp2.connect(g3); g3.connect(d);
        break;
      }
    }

    h.setGain(0, 0.001);
  }

  fadeIn(seconds = 2.4) { this.handle?.setGain(this.level, seconds / 3); }
  stop(seconds = 2.0) { this.handle?.stop(seconds); this.handle = null; }
}

export class AmbienceAudio {
  /** @param {import('./engine.js').AudioEngine} audio */
  constructor(audio) {
    this.audio = audio;
    this.current = null;
    this.currentId = null;
    /** bedId -> raw channel data, generated without a context. */
    this._data = new Map();
    /** bedId -> AudioBuffer, wrapped on first use. */
    this._baked = new Map();
  }

  /**
   * Generate a bed's samples ahead of time. Baking a graveyard on POI entry cost
   * about a hundred milliseconds of blocked main thread; doing it during boot or
   * during a transit burn costs nothing anybody can see. No context required.
   */
  prebake(idOrKind, sr = NOMINAL_RATE) {
    const bedId = bedIdFor(idOrKind);
    if (this._data.has(bedId)) return bedId;
    const bake = BAKERS[bedId];
    this._data.set(bedId, bake ? bake(this.audio.rng.fork(`bed:${bedId}`), sr) : null);
    return bedId;
  }

  /** Enter a point of interest. Crossfades; safe to call with the same id twice. */
  enter(idOrKind, { fade = 2.5 } = {}) {
    const A = this.audio;
    if (!A.ready) return false;
    const bedId = bedIdFor(idOrKind);
    if (bedId === this.currentId && this.current) return true;

    const prev = this.current;
    let baked = this._baked.get(bedId);
    if (baked === undefined) {
      this.prebake(bedId);
      const data = this._data.get(bedId);
      baked = data ? dataToBuffer(A.ctx, data) : null;
      this._baked.set(bedId, baked);
      // The AudioBuffer owns the samples now.
      this._data.set(bedId, null);
    }

    const bed = new Bed(A, bedId, baked);
    if (bed.dead) return false;
    this.current = bed;
    this.currentId = bedId;
    bed.fadeIn(fade);
    // Fade the old one out over a longer window than the new one comes up, so the
    // crossfade never dips through a hole in the middle.
    prev?.stop(fade * 1.25);

    A.mixer?.setSpace(SPACE[bedId] ?? SPACE[FALLBACK], A.now, fade * 0.4);
    return true;
  }

  leave(fade = 1.6) {
    this.current?.stop(fade);
    this.current = null;
    this.currentId = null;
  }

  stopAll(fade = 0.2) { this.leave(fade); }
}

export { SPACE as AMBIENCE_SPACE, LEVEL as AMBIENCE_LEVEL };
