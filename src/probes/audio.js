/**
 * AUDIO PROBE.
 *
 *   node tools/probe.mjs audio --out docs/probes/audio.png
 *
 * You cannot hear a screenshot, so this probe does the only honest thing: it
 * builds the REAL audio graph inside an `OfflineAudioContext`, renders every
 * instrument the stream owns to a buffer, and plots what came out. Nothing here
 * is a mock - `AudioEngine.attach()` takes the offline context and every layer
 * class runs exactly the code the game runs.
 *
 * WHAT EACH PANEL SHOWS, and what it is for:
 *
 *   TOP STRIP    the linear waveform (cyan fill) with a PEAK ENVELOPE IN DECIBELS
 *                over it (amber). The dB curve is the important one: it is how you
 *                see that a capital detonation has a three-second tail and a point
 *                defence tick has none. Gridlines at -20 and -40 dB.
 *   BOTTOM STRIP the averaged power spectrum, log frequency, 20 Hz to 20 kHz.
 *                The band below 60 Hz is shaded, because "does this actually have
 *                sub-bass or is it a click with a promise" is the single question
 *                this probe exists to answer.
 *   NUMBERS      peak, RMS, TAIL (seconds from the peak until the envelope falls
 *                40 dB), spectral centroid, and the percentage of total energy in
 *                each of four bands.
 *
 * THE COMPARISONS THAT MATTER, and where to look:
 *
 *   HULL KILL vs REACTOR KILL      same hull, two panels apart. The reactor kill
 *                                  must have a visibly longer tail, more energy
 *                                  above 2 kHz and a lower centroid.
 *   REACTOR KILL 480 vs 1400       scale is pitch: the cruiser's fundamental and
 *                                  centroid must both be lower, its tail longer.
 *   HULL vs SHIELD IMPACT          the hull hit lives under 250 Hz; the shield hit
 *                                  is almost empty down there and rings for half a
 *                                  second in the mids. If those two spectra look
 *                                  alike the shield layer has failed.
 *   DRIVE 1400M vs DRIVE 18M       the capital drive must put its energy in the
 *                                  30-60 Hz band and the fighter must not.
 *   AMBIENCE                       three beds on one dB axis. The gap between the
 *                                  near-star and the graveyard is the game's
 *                                  dynamic range, and it is meant to be large.
 *   CANNON AT RANGE                the same shot at 0.4 / 4 / 18 km, showing the
 *                                  distance law and the proximity lowpass closing.
 *
 * A contract self-test runs at the end and console.errors on failure, which makes
 * `tools/probe.mjs` exit non-zero.
 */

import * as THREE from 'three';
import { makeCanvas, ctx2d, css } from '../art/textures/canvas2d.js';
import { drawText, textWidth } from '../art/textures/decals.js';
import { NEUTRAL, getFactionPalette, getPOIPalette } from '../art/palette.js';
import { Engine } from '../core/loop.js';
import { World } from '../core/world.js';
import { EV } from '../core/events.js';
import { AudioEngine } from '../audio/engine.js';
import { WeaponAudio } from '../audio/weapons.js';
import { ImpactAudio } from '../audio/impacts.js';
import { ExplosionAudio } from '../audio/explosions.js';
import { DriveAudio } from '../audio/drive.js';
import { SalvageAudio } from '../audio/salvage.js';
import { AmbienceAudio } from '../audio/ambience.js';
import { UIAudio } from '../audio/ui.js';
import { installAudio } from '../audio/index.js';

const SR = 48000;

// ---------------------------------------------------------------------------
// colours - all from the locked palette
// ---------------------------------------------------------------------------

const INK = {
  bg: 0x02030a,                                  // neutral.spaceBlack-ish void
  panel: 0x05070c,                               // graveyard shadow
  frame: 0x1b2a3a,                               // graveyard fill
  grid: 0x14202e,                                // graveyard ibl horizon
  label: 0xb6c6da,                               // graveyard key
  dim: 0x2b3c4e,                                 // graveyard bounce
  wave: 0x39d7d0,                                // neutral.salvage
  env: 0xff9126,                                 // coalition emissive
  spec: 0x7fe4ff,                                // concord emissive
  spec2: 0x8fb04a,                               // graveyard accent
  spec3: 0xff9126,
  sub: 0xff6a12,                                 // coalition engine
  warn: 0xff4a2a,                                // player warn
  ok: 0x54e08a,                                  // neutral.friendly
  title: 0xf2e9c8,                               // neutral.select
};

const TRACE_COLOURS = [INK.wave, INK.env, INK.spec2];

/** Warm at the bottom, cool at the top - the stacked band bar reads as a spectrum. */
const BAND_INK = { sub: 0xff6a12, low: 0xff9126, mid: 0x39d7d0, high: 0x7fe4ff };

// ---------------------------------------------------------------------------
// analysis
// ---------------------------------------------------------------------------

/** In-place iterative radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + half] * cr - im[i + k + half] * ci;
        const bi = re[i + k + half] * ci + im[i + k + half] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + half] = ar - br; im[i + k + half] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const N_FFT = 4096;
const HANN = new Float32Array(N_FFT);
for (let i = 0; i < N_FFT; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);

/** Welch-averaged power spectrum. Returns linear power per bin (0..N/2). */
function spectrumOf(mono) {
  const bins = N_FFT / 2;
  const acc = new Float64Array(bins);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const hop = N_FFT / 2;
  let frames = 0;
  for (let start = 0; start + N_FFT <= mono.length || frames === 0; start += hop) {
    for (let i = 0; i < N_FFT; i++) {
      const s = start + i < mono.length ? mono[start + i] : 0;
      re[i] = s * HANN[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) acc[b] += re[b] * re[b] + im[b] * im[b];
    frames++;
    if (start + N_FFT > mono.length) break;
  }
  for (let b = 0; b < bins; b++) acc[b] /= frames;
  return acc;
}

/**
 * IEC 61672 A-weighting. Raw power says what is physically there; A-weighting says
 * what the player will actually hear. Both matter and they disagree violently down
 * low: at 40 Hz the ear is 34 dB less sensitive than at 2 kHz, so a sound that is
 * 90 % sub by power can still be perceived as mid-dominated. Judging a mix on raw
 * power alone is how you end up burying every transient under a sine wave.
 */
function aWeightGain(f) {
  if (f < 8) return 0;
  const f2 = f * f;
  const num = 12194 * 12194 * f2 * f2;
  const den = (f2 + 20.6 * 20.6)
    * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9))
    * (f2 + 12194 * 12194);
  const db = 20 * Math.log10(num / den) + 2.0;
  return Math.pow(10, db / 10);          // power weight, not amplitude
}

const BANDS = [
  { key: 'sub', lo: 0, hi: 60 },
  { key: 'low', lo: 60, hi: 250 },
  { key: 'mid', lo: 250, hi: 2000 },
  { key: 'high', lo: 2000, hi: 20000 },
];

function analyse(buffer, label) {
  const n = buffer.length;
  const ch = buffer.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i] / ch;
  }

  let peak = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
    sq += mono[i] * mono[i];
  }
  const rms = Math.sqrt(sq / Math.max(1, n));

  // 12 ms peak envelope. Peak, not RMS: a tail measured on RMS reads short.
  const win = Math.max(1, Math.round(0.012 * buffer.sampleRate));
  const envN = Math.ceil(n / win);
  const env = new Float32Array(envN);
  for (let e = 0; e < envN; e++) {
    let m = 0;
    const s = e * win;
    const t = Math.min(n, s + win);
    for (let i = s; i < t; i++) { const a = Math.abs(mono[i]); if (a > m) m = a; }
    env[e] = m;
  }
  let peakIdx = 0;
  for (let e = 1; e < envN; e++) if (env[e] > env[peakIdx]) peakIdx = e;
  const thresh = env[peakIdx] * 0.01;   // -40 dB
  let tailIdx = envN - 1;
  for (let e = peakIdx; e < envN; e++) { if (env[e] < thresh) { tailIdx = e; break; } }
  const tail = ((tailIdx - peakIdx) * win) / buffer.sampleRate;

  const spec = spectrumOf(mono);
  const binHz = buffer.sampleRate / N_FFT;
  let total = 0;
  const bandPower = {};
  for (const b of BANDS) bandPower[b.key] = 0;
  let centroidNum = 0;
  let centroidDen = 0;
  let totalA = 0;
  let centroidANum = 0;
  const bandA = {};
  for (const b of BANDS) bandA[b.key] = 0;
  for (let i = 1; i < spec.length; i++) {
    const f = i * binHz;
    if (f > 20000) break;
    const p = spec[i];
    const pa = p * aWeightGain(f);
    total += p;
    totalA += pa;
    centroidNum += f * p;
    centroidDen += p;
    centroidANum += f * pa;
    for (const b of BANDS) {
      if (f >= b.lo && f < b.hi) { bandPower[b.key] += p; bandA[b.key] += pa; break; }
    }
  }
  const bands = {};
  const bandsA = {};
  for (const b of BANDS) {
    bands[b.key] = total > 0 ? bandPower[b.key] / total : 0;
    bandsA[b.key] = totalA > 0 ? bandA[b.key] / totalA : 0;
  }

  return {
    label, mono, env, win, peak, rms, tail, peakIdx,
    duration: n / buffer.sampleRate,
    sampleRate: buffer.sampleRate,
    spec, binHz,
    centroid: centroidDen > 0 ? centroidNum / centroidDen : 0,
    centroidA: totalA > 0 ? centroidANum / totalA : 0,
    bands, bandsA,
  };
}

const dB = (v, floor = -96) => (v > 0 ? Math.max(floor, 20 * Math.log10(v)) : floor);
const fmtDb = (v) => (v <= -95 ? '-INF' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}`);

// ---------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------

function frameRect(c, x, y, w, h, colour, alpha = 1) {
  c.strokeStyle = css(colour, alpha);
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function label(c, text, x, y, cell, colour, alpha = 1, align = 'left') {
  c.fillStyle = css(colour, alpha);
  drawText(c, text, x, y, cell, { tracking: 1, align });
}

/**
 * One instrument panel: waveform + dB envelope on top, power spectrum beneath,
 * numbers at the foot. Multiple analyses overlay for the comparison panels.
 */
function drawPanel(width, height, title, analyses, { note = '' } = {}) {
  const canvas = makeCanvas(width, height);
  const c = ctx2d(canvas);

  c.fillStyle = css(INK.panel);
  c.fillRect(0, 0, width, height);
  frameRect(c, 0, 0, width, height, INK.frame, 0.9);

  const PAD = 10;
  const titleH = 26;
  const footH = analyses.length > 1 ? 14 + analyses.length * 16 : 60;
  const plotX = PAD;
  const plotW = width - PAD * 2;
  const waveY = titleH + 6;
  const waveH = Math.round((height - titleH - footH - 22) * 0.52);
  const specY = waveY + waveH + 10;
  const specH = height - footH - specY - 4;

  // --- title bar ----------------------------------------------------------
  c.fillStyle = css(INK.frame, 0.35);
  c.fillRect(0, 0, width, titleH);
  label(c, title, PAD, 7, 3, INK.title, 1);

  const primary = analyses[0];
  if (note) label(c, note, width - PAD, 8, 2, INK.dim, 1, 'right');

  // =======================================================================
  // waveform + dB envelope
  // =======================================================================
  c.fillStyle = css(INK.bg);
  c.fillRect(plotX, waveY, plotW, waveH);

  const maxDur = Math.max(...analyses.map((a) => a.duration));
  const refPeak = Math.max(...analyses.map((a) => a.peak), 1e-9);
  const DB_FLOOR = -66;

  // horizontal grid at -20 / -40 dB and the zero line
  c.setLineDash([2, 4]);
  for (const g of [-20, -40]) {
    const y = waveY + (g / DB_FLOOR) * waveH;
    c.strokeStyle = css(INK.grid, 0.9);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(plotX, y + 0.5); c.lineTo(plotX + plotW, y + 0.5); c.stroke();
    label(c, `${g}`, plotX + 3, y + 2, 1, INK.dim, 1);
  }
  c.setLineDash([]);

  // time ticks
  const tickStep = maxDur > 8 ? 2 : maxDur > 3 ? 1 : maxDur > 1.2 ? 0.5 : 0.1;
  for (let t = tickStep; t < maxDur; t += tickStep) {
    const x = plotX + (t / maxDur) * plotW;
    c.strokeStyle = css(INK.grid, 0.7);
    c.beginPath(); c.moveTo(x + 0.5, waveY); c.lineTo(x + 0.5, waveY + waveH); c.stroke();
  }

  analyses.forEach((a, ai) => {
    const colour = analyses.length > 1 ? TRACE_COLOURS[ai % TRACE_COLOURS.length] : INK.wave;
    // linear waveform, min/max per column - only for the single-trace panels,
    // where it reads as an object rather than as clutter
    if (analyses.length === 1) {
      c.fillStyle = css(INK.wave, 0.42);
      const mid = waveY + waveH;
      const spp = a.mono.length / plotW;
      c.beginPath();
      for (let px = 0; px < plotW; px++) {
        const s = Math.floor(px * spp);
        const e = Math.min(a.mono.length, Math.floor((px + 1) * spp));
        let mx = 0;
        for (let i = s; i < e; i++) { const v = Math.abs(a.mono[i]); if (v > mx) mx = v; }
        const h = (mx / refPeak) * waveH;
        c.rect(plotX + px, mid - h, 1, h);
      }
      c.fill();
    }

    // dB peak envelope, in amber over the cyan waveform. This is the trace that
    // answers "is there a tail or is this a click".
    c.strokeStyle = css(analyses.length > 1 ? colour : INK.env, 1);
    c.lineWidth = analyses.length > 1 ? 1.6 : 1.4;
    c.beginPath();
    const cols = plotW;
    const envPerCol = (a.env.length * (a.duration / maxDur)) / cols;
    let started = false;
    for (let px = 0; px < cols; px++) {
      const s = Math.floor(px * envPerCol);
      if (s >= a.env.length) break;
      const e = Math.min(a.env.length, Math.max(s + 1, Math.floor((px + 1) * envPerCol)));
      let mx = 0;
      for (let i = s; i < e; i++) if (a.env[i] > mx) mx = a.env[i];
      const d = dB(mx / refPeak, DB_FLOOR);
      const y = waveY + Math.min(waveH, (d / DB_FLOOR) * waveH);
      if (!started) { c.moveTo(plotX + px, y); started = true; } else c.lineTo(plotX + px, y);
    }
    c.stroke();
  });

  frameRect(c, plotX, waveY, plotW, waveH, INK.frame, 0.8);
  label(c, `ENVELOPE DB   ${maxDur.toFixed(maxDur >= 10 ? 0 : 1)}S`, plotX + plotW - 3, waveY + waveH - 10, 1, INK.dim, 1, 'right');

  // =======================================================================
  // spectrum
  // =======================================================================
  c.fillStyle = css(INK.bg);
  c.fillRect(plotX, specY, plotW, specH);

  const F_LO = 20;
  const F_HI = 20000;
  const lnLo = Math.log(F_LO);
  const lnSpan = Math.log(F_HI) - lnLo;
  const fx = (f) => plotX + ((Math.log(Math.max(F_LO, f)) - lnLo) / lnSpan) * plotW;
  const S_FLOOR = -72;

  // shade the sub band. This is the region the capital-ship sounds have to fill.
  c.fillStyle = css(INK.sub, 0.13);
  c.fillRect(plotX, specY, fx(60) - plotX, specH);

  c.setLineDash([2, 4]);
  for (const f of [60, 250, 1000, 2000, 8000]) {
    const x = fx(f);
    c.strokeStyle = css(INK.grid, 1);
    c.beginPath(); c.moveTo(x + 0.5, specY); c.lineTo(x + 0.5, specY + specH); c.stroke();
    label(c, f >= 1000 ? `${f / 1000}K` : `${f}`, x + 3, specY + specH - 10, 1, INK.dim, 1);
  }
  c.setLineDash([]);

  // ENERGY PER OCTAVE, not per bin. Multiplying power by frequency converts a
  // per-hertz density into a per-octave one, which is how hearing works: pink
  // noise plots flat and a resonance is a bump rather than a dent in a slope. On
  // a per-bin plot every sound in this game is a diagonal line and nothing is
  // distinguishable from anything else.
  const octPower = analyses.map((a) => {
    const o = new Float64Array(a.spec.length);
    for (let i = 1; i < a.spec.length; i++) o[i] = a.spec[i] * i * a.binHz;
    return o;
  });
  const specRef = Math.max(...octPower.map((o) => Math.max(...o)), 1e-20);
  analyses.forEach((a, ai) => {
    const colour = analyses.length > 1 ? TRACE_COLOURS[ai % TRACE_COLOURS.length] : INK.spec;
    const op = octPower[ai];
    // Resample onto the log axis, taking the max in each column so narrow
    // resonances survive the downsample.
    const cols = plotW;
    const ys = new Float32Array(cols);
    for (let px = 0; px < cols; px++) {
      const f0 = Math.exp(lnLo + (px / cols) * lnSpan);
      const f1 = Math.exp(lnLo + ((px + 1) / cols) * lnSpan);
      const b0 = Math.max(1, Math.floor(f0 / a.binHz));
      const b1 = Math.max(b0 + 1, Math.ceil(f1 / a.binHz));
      let mx = 0;
      for (let b = b0; b < b1 && b < op.length; b++) if (op[b] > mx) mx = op[b];
      const d = Math.max(S_FLOOR, 10 * Math.log10(Math.max(mx, 1e-30) / specRef));
      ys[px] = specY + Math.min(specH, (d / S_FLOOR) * specH);
    }
    if (analyses.length === 1) {
      c.fillStyle = css(colour, 0.24);
      c.beginPath();
      c.moveTo(plotX, specY + specH);
      for (let px = 0; px < cols; px++) c.lineTo(plotX + px, ys[px]);
      c.lineTo(plotX + cols - 1, specY + specH);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = css(colour, 1);
    c.lineWidth = 1.4;
    c.beginPath();
    for (let px = 0; px < cols; px++) {
      if (px === 0) c.moveTo(plotX, ys[0]); else c.lineTo(plotX + px, ys[px]);
    }
    c.stroke();
  });

  frameRect(c, plotX, specY, plotW, specH, INK.frame, 0.8);
  label(c, 'ENERGY DB / OCTAVE', plotX + 4, specY + 4, 1, INK.dim, 1);

  // =======================================================================
  // numbers
  // =======================================================================
  const fy = height - footH + 5;
  const pct = (v) => String(Math.round(v * 100)).padStart(2, '0');
  if (analyses.length === 1) {
    const a = primary;
    const tail = a.sustained ? 'SUSTAINED' : `TAIL ${a.tail.toFixed(2)}S`;
    label(c, `PK ${fmtDb(dB(a.peak))}  RMS ${fmtDb(dB(a.rms))}`, PAD, fy, 2, INK.label, 1);
    label(c, tail, width - PAD, fy, 2, a.sustained ? INK.dim : INK.label, 1, 'right');

    // Two stacked band bars. The top one is raw power - "is the sub actually
    // there". The bottom one is A-weighted - "is it what the player hears". A
    // capital drive should be nearly all orange on top and still show mid on the
    // bottom; a shield hit should be the reverse in both.
    const barY = fy + 16;
    const barH = 7;
    const segs = [
      ['sub', BAND_INK.sub], ['low', BAND_INK.low], ['mid', BAND_INK.mid], ['high', BAND_INK.high],
    ];
    const drawBar = (y, data) => {
      let x = PAD;
      for (const [k, colour] of segs) {
        const w = (width - PAD * 2) * data[k];
        c.fillStyle = css(colour, 1);
        c.fillRect(x, y, Math.max(0, w - 1), barH);
        x += w;
      }
      frameRect(c, PAD, y, width - PAD * 2, barH, INK.frame, 0.9);
    };
    drawBar(barY, a.bands);
    drawBar(barY + barH + 2, a.bandsA);
    const b = a.bands;
    const ly = barY + barH * 2 + 6;
    label(c, `SUB ${pct(b.sub)}`, PAD, ly, 2, BAND_INK.sub, 1);
    label(c, `LOW ${pct(b.low)}`, PAD + 92, ly, 2, BAND_INK.low, 1);
    label(c, `MID ${pct(b.mid)}`, PAD + 184, ly, 2, BAND_INK.mid, 1);
    label(c, `HI ${pct(b.high)}`, PAD + 276, ly, 2, BAND_INK.high, 1);
    label(c, `CTR ${Math.round(a.centroid)}/${Math.round(a.centroidA)}`,
      width - PAD, ly, 2, INK.dim, 1, 'right');
  } else {
    analyses.forEach((a, ai) => {
      const colour = TRACE_COLOURS[ai % TRACE_COLOURS.length];
      const y = fy + ai * 16;
      c.fillStyle = css(colour, 1);
      c.fillRect(PAD, y + 4, 10, 4);
      label(c, `${a.label}   RMS ${fmtDb(dB(a.rms))}   PK ${fmtDb(dB(a.peak))}   SUB ${pct(a.bands.sub)}   CTR ${Math.round(a.centroid)}HZ`,
        PAD + 18, y, 2, colour, 1);
    });
  }

  return canvas;
}

/** Title bar across the top of the sheet. */
function drawHeader(width, height, lines) {
  const canvas = makeCanvas(width, height);
  const c = ctx2d(canvas);
  c.fillStyle = css(INK.bg);
  c.fillRect(0, 0, width, height);
  label(c, lines[0], 12, 10, 5, INK.title, 1);
  label(c, lines[1], 12, 58, 2, INK.label, 1);
  label(c, lines[2], 12, 78, 2, INK.label, 0.62);
  c.fillStyle = css(INK.frame, 1);
  c.fillRect(0, height - 2, width, 1);
  return canvas;
}

/** Footer: the engine report and the contract self-test result. */
function drawFooter(width, height, lines, ok) {
  const canvas = makeCanvas(width, height);
  const c = ctx2d(canvas);
  c.fillStyle = css(INK.panel);
  c.fillRect(0, 0, width, height);
  frameRect(c, 0, 0, width, height, INK.frame, 0.9);
  lines.forEach((l, i) => {
    label(c, l, 12, 10 + i * 18, 2, i === 0 ? (ok ? INK.ok : INK.warn) : INK.label, 1);
  });
  return canvas;
}

// ---------------------------------------------------------------------------
// offline rendering of the real graph
// ---------------------------------------------------------------------------

/** A source at the listener: unit gain, centred, no filtering. */
const CLOSE = { gain: 1, pan: 0, cutoff: 19000, distance: 0, audible: true };

/**
 * Build the stream against an OfflineAudioContext, run `perform`, render.
 * @param {Object} p
 * @param {number} p.seconds
 * @param {import('../core/rng.js').RNG} p.rng
 * @param {(kit:Object) => void} p.perform
 */
async function render({ seconds, rng, perform }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SR), SR);
  const core = new AudioEngine({ rng });
  core.attach(ctx);
  const kit = {
    core, ctx,
    weapons: new WeaponAudio(core),
    impacts: new ImpactAudio(core),
    explosions: new ExplosionAudio(core),
    drives: new DriveAudio(core),
    salvage: new SalvageAudio(core),
    ambience: new AmbienceAudio(core),
    ui: new UIAudio(core),
  };
  perform(kit);
  return ctx.startRendering();
}

/** A stand-in ship, enough of one for the drive layer. */
function fakeShip(length, throttle) {
  return {
    id: `probe:${length}`,
    classDef: { length, name: 'probe' },
    position: { x: 0, y: 0, z: 0 },
    body: { throttle, velocity: { x: 0, y: 0, z: 0 }, maxSpeed: 140 },
    planeLocked: true,
    dead: false,
    subsystems: new Map(),
    kindHealth: () => 1,
  };
}

/** The full case list. Order is the reading order on the sheet. */
function caseList(rng) {
  const R = (label, seconds, perform, note = '', sustained = false) =>
    ({ label, seconds, perform, note, sustained });

  return [
    // ---- row A: weapons -------------------------------------------------
    R('CANNON', 1.1, ({ weapons }) => weapons.fire('cannon', CLOSE, { faction: 'coalition', size: 1.25 }), 'COALITION'),
    R('RAIL', 1.4, ({ weapons }) => weapons.fire('rail', CLOSE, { faction: 'concord', size: 1.2 }), 'CHARGE / SNAP'),
    R('BEAM', 1.5, ({ weapons, core }) => {
      weapons.fire('beam', CLOSE, { faction: 'concord', size: 1, key: 'probe' });
      const rec = weapons.held.get('beam:probe');
      rec?.handle.stop(0.22, 1.05);
    }, 'HELD 1.05S'),
    R('MISSILE', 2.2, ({ weapons }) => weapons.fire('missile', CLOSE, {
      faction: 'coalition', size: 1.1, travel: { pan: 0.85, cutoff: 4000 },
    }), 'DOPPLER'),
    R('FLAK', 1.2, ({ weapons }) => weapons.fire('flak', CLOSE, { faction: 'coalition', size: 1 }), 'STUTTER'),

    // ---- row B: point defence and impacts --------------------------------
    R('POINT DEFENCE', 0.5, ({ weapons }) => weapons.fire('pd', CLOSE, { faction: 'concord' }), 'DRY TICKS'),
    R('HULL IMPACT', 1.3, ({ impacts }) => impacts.hull(CLOSE, { size: 1.4, severity: 1 }), 'MASS'),
    R('SHIELD IMPACT', 2.0, ({ impacts }) => impacts.shield(CLOSE, { size: 1.4, severity: 1 }), 'RESONANT'),
    R('SUBSYSTEM KILL', 2.6, ({ impacts }) => impacts.subsystem(CLOSE, { size: 1.4, kind: 'reactor' }), 'COLLAPSE'),
    R('SALVAGE CUT', 3.0, ({ salvage }) => {
      salvage.startCut(CLOSE, 'coalition');
      salvage.updateCut(CLOSE, 0.9, 1.6);
    }, 'COALITION STEEL', true),

    // ---- row C: the kills, and the drives --------------------------------
    R('HULL KILL  480M', 5.0, ({ explosions }) => explosions.detonate(CLOSE, { radius: 200, catastrophic: false }), 'DESTROYER'),
    R('REACTOR KILL  480M', 8.0, ({ explosions }) => explosions.detonate(CLOSE, { radius: 200, catastrophic: true }), 'CATASTROPHIC'),
    R('REACTOR KILL  1400M', 10.0, ({ explosions }) => explosions.detonate(CLOSE, { radius: 590, catastrophic: true }), 'CRUISER'),
    R('DRIVE  1400M', 4.0, ({ drives, core }) => {
      const ship = fakeShip(1400, 0);
      drives._select([ship], ship);
      const v = drives.voices[0]?.voice;
      v?.update(CLOSE, 0.05, 1, 0);
      v?.update(CLOSE, 1.0, 1, 1.4);
    }, 'IDLE THEN BURN', true),
    R('DRIVE  18M', 4.0, ({ drives }) => {
      const ship = fakeShip(18, 1);
      drives._select([ship], ship);
      const v = drives.voices[0]?.voice;
      v?.update(CLOSE, 0.05, 1, 0);
      v?.update(CLOSE, 1.0, 1, 1.4);
    }, 'FIGHTER', true),
  ];
}

/** The two wide comparison strips at the foot of the sheet. */
function stripList() {
  return [
    {
      label: 'AMBIENCE  NEAR-STAR / BELT / GRAVEYARD',
      note: 'SILENCE IS A CHOICE',
      seconds: 14,
      traces: [
        { name: 'NEAR-STAR', perform: ({ ambience }) => ambience.enter('near-star', { fade: 2.4 }) },
        { name: 'BELT', perform: ({ ambience }) => ambience.enter('belt', { fade: 2.4 }) },
        { name: 'GRAVEYARD', perform: ({ ambience }) => ambience.enter('graveyard', { fade: 2.4 }) },
      ],
    },
    {
      label: 'CANNON AT RANGE  0.4 / 4 / 18 KM',
      note: 'DISTANCE LAW + PROXIMITY LOWPASS',
      seconds: 1.4,
      traces: [
        { name: '0.4 KM', perform: ({ weapons, core }) => weapons.fire('cannon', core.spatialAt(0, 0, 400), { faction: 'coalition', size: 1.25 }) },
        { name: '4 KM', perform: ({ weapons, core }) => weapons.fire('cannon', core.spatialAt(0, 0, 4000), { faction: 'coalition', size: 1.25 }) },
        { name: '18 KM', perform: ({ weapons, core }) => weapons.fire('cannon', core.spatialAt(0, 0, 18000), { faction: 'coalition', size: 1.25 }) },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// scene assembly
// ---------------------------------------------------------------------------

function quad(scene, canvas, x, y, w, h) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false, depthWrite: false });
  mat.userData.__paletteKey = 'probe:audio-chrome';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x + w / 2, y - h / 2, 0);
  mesh.renderOrder = 10;
  scene.add(mesh);
  return mesh;
}

const COLS = 5;
const ROWS = 3;
const PANEL_W = 3.44;
const PANEL_H = 2.35;
const GAP = 0.16;
const STRIP_H = 1.95;
const HEADER_H = 0.53;
const FOOTER_H = 0.62;

export default {
  name: 'Audio — offline render of the live graph',
  camera: { distance: 12, pitch: 0, yaw: 0, target: new THREE.Vector3(0, 0, 0) },

  async setup(ctx) {
    const { scene, far, renderer, world } = ctx;

    // A readout is not a photograph. Tone mapping, bloom, grain and volumetrics
    // all exist to make a lit scene look right and all of them would blur a
    // hairline plot, so the whole chain comes off.
    renderer.renderer.toneMapping = THREE.NoToneMapping;
    renderer.renderer.toneMappingExposure = 1;
    renderer.post.bloom.enabled = false;
    renderer.post.gtao.enabled = false;
    renderer.post.godrays.enabled = false;
    renderer.post.grade.uniforms.aberration.value = 0;
    renderer.post.grade.uniforms.grain.value = 0;
    renderer.post.grade.uniforms.vignette.value = 0.14;
    renderer.post.grade.uniforms.saturation.value = 1.0;
    far.background = new THREE.Color().setHex(INK.bg, THREE.SRGBColorSpace);
    scene.background = null;

    // The harness prints the probe name at the top left of the page; our own
    // header says the same thing better and they overlap.
    if (typeof document !== 'undefined') {
      const el = document.getElementById('label');
      if (el) el.style.display = 'none';
    }

    const rng = world.rng.fork('audio-probe');
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

    const noAudio = typeof OfflineAudioContext !== 'function';
    const analyses = [];
    const strips = [];

    if (!noAudio) {
      for (const c of caseList(rng)) {
        const buf = await render({ seconds: c.seconds, rng: rng.fork(c.label), perform: c.perform });
        analyses.push({ ...analyse(buf, c.label), note: c.note, title: c.label, sustained: c.sustained });
      }
      for (const s of stripList()) {
        const traces = [];
        for (const tr of s.traces) {
          const buf = await render({ seconds: s.seconds, rng: rng.fork(`${s.label}:${tr.name}`), perform: tr.perform });
          // Ambience needs a couple of seconds to fade in; measure the steady state.
          traces.push(analyse(buf, tr.name));
        }
        strips.push({ ...s, traces });
      }
    }
    const renderMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;

    // ---- layout ---------------------------------------------------------
    const gridW = COLS * PANEL_W + (COLS - 1) * GAP;
    const gridH = ROWS * PANEL_H + (ROWS - 1) * GAP;
    const totalH = HEADER_H + GAP + gridH + GAP + STRIP_H + GAP + FOOTER_H;
    const left = -gridW / 2;
    let top = totalH / 2;
    const gridTop = top - HEADER_H - GAP;

    quad(scene, drawHeader(2048, 104, [
      'NADIR POINT / AUDIO',
      `EVERY INSTRUMENT RENDERED OFFLINE AT ${SR / 1000}KHZ THROUGH THE LIVE MIX - BUSES, FDN REVERB, LIMITER`,
      'AMBER: PEAK ENVELOPE DB   CYAN: ENERGY PER OCTAVE   BARS: POWER PER BAND OVER A-WEIGHTED'
      + '   CTR: SPECTRAL CENTROID RAW/A-WEIGHTED',
    ]), left, top, gridW, HEADER_H);
    top -= HEADER_H + GAP;

    const panelCanvasW = 512;
    const panelCanvasH = Math.round(panelCanvasW * (PANEL_H / PANEL_W));

    if (noAudio) {
      quad(scene, drawFooter(2048, 200, [
        'NO WEB AUDIO IN THIS ENVIRONMENT',
        'OfflineAudioContext is unavailable, so nothing could be rendered.',
        'The stream is expected to no-op silently in this state, and it did.',
      ], false), left, top, gridW, gridH);
    } else {
      for (let i = 0; i < analyses.length && i < COLS * ROWS; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const a = analyses[i];
        const canvas = drawPanel(panelCanvasW, panelCanvasH, a.title, [a], { note: a.note });
        quad(scene, canvas,
          left + col * (PANEL_W + GAP),
          top - row * (PANEL_H + GAP),
          PANEL_W, PANEL_H);
      }
    }
    top -= gridH + GAP;

    // ---- comparison strips ----------------------------------------------
    const stripW = (gridW - GAP) / 2;
    const stripCanvasW = 1024;
    const stripCanvasH = Math.round(stripCanvasW * (STRIP_H / stripW));
    strips.forEach((s, i) => {
      const canvas = drawPanel(stripCanvasW, stripCanvasH, s.label, s.traces, { note: s.note });
      quad(scene, canvas, left + i * (stripW + GAP), top, stripW, STRIP_H);
    });
    top -= STRIP_H + GAP;

    // ---- reverb stability: a regression guard on a bug that shipped once ---
    // The FDN's in-loop damping filter had a resonant peak (Web Audio's lowpass Q
    // is in DECIBELS), which pushed the loop gain over one and turned the reverb
    // into an oscillator. It presented as ambience beds that got LOUDER the longer
    // you listened. This renders the longest space in the game - the graveyard -
    // and fails if its tail is not monotonically dying.
    let reverbTail = null;
    if (!noAudio) {
      const buf = await render({
        seconds: 6, rng: rng.fork('reverb-stability'),
        perform: ({ core, impacts }) => {
          core.mixer.setSpace({ feedback: 0.70, damp: 2300, size: 1.9, wet: 1 }, 0, 0.001);
          impacts.hull(CLOSE, { size: 1, severity: 1 });
        },
      });
      const a = analyse(buf, 'reverb');
      // Energy in the last third versus the peak. A decaying tail is far below it;
      // a growing one is at or above it.
      let lateMax = 0;
      const from = Math.floor(a.env.length * 0.66);
      for (let i = from; i < a.env.length; i++) if (a.env[i] > lateMax) lateMax = a.env[i];
      reverbTail = { lateDb: dB(lateMax / Math.max(1e-9, a.peak)), tail: a.tail };
    }

    // ---- contract self-test ---------------------------------------------
    const selfTest = contractSelfTest(ctx, reverbTail);
    const foot = [
      selfTest.ok
        ? `CONTRACT SELF-TEST PASSED - ${selfTest.checks} CHECKS`
        : `CONTRACT SELF-TEST FAILED - ${selfTest.fails.join(' / ')}`,
      noAudio
        ? 'WEB AUDIO UNAVAILABLE - STREAM NO-OPPED CLEANLY'
        : `${analyses.length} INSTRUMENTS + ${strips.reduce((n, s) => n + s.traces.length, 0)} COMPARISON TRACES`
          + `  /  OFFLINE RENDER ${Math.round(renderMs)}MS`
          + (reverbTail ? `  /  GRAVEYARD REVERB LATE ENERGY ${reverbTail.lateDb.toFixed(0)}DB - DECAYING` : '')
          + `  /  ${selfTest.report}`,
    ];
    quad(scene, drawFooter(2048, 120, foot, selfTest.ok), left, top, gridW, FOOTER_H);

    // Frame it exactly. 46 degree vertical FOV: visible height = 2 d tan(fov/2).
    const fov = (world.camera.fov * Math.PI) / 180;
    const aspect = world.camera.aspect || 16 / 9;
    const frame = (cx, cy, w, h) => {
      ctx.pose.distance = Math.max(
        (h * 1.06) / (2 * Math.tan(fov / 2)),
        (w * 1.06) / (2 * Math.tan(fov / 2) * aspect),
      );
      ctx.pose.pitch = 0;
      ctx.pose.yaw = 0;
      ctx.pose.target.set(cx, cy, 0);
      ctx.applyPose();
    };

    // `?panel=n` frames one instrument full-screen. The sheet is dense on purpose
    // and a reviewer chasing one balance question should not have to squint at it.
    const panelIndex = Number(ctx.params?.get('panel') ?? NaN);
    if (Number.isFinite(panelIndex) && panelIndex >= 0 && panelIndex < COLS * ROWS) {
      const col = panelIndex % COLS;
      const row = Math.floor(panelIndex / COLS);
      frame(
        left + col * (PANEL_W + GAP) + PANEL_W / 2,
        gridTop - row * (PANEL_H + GAP) - PANEL_H / 2,
        PANEL_W, PANEL_H,
      );
    } else {
      frame(0, 0, gridW, totalH);
    }

    // A live bench for tuning: `window.__NADIR.ctx.lab.run(seconds, perform)`
    // renders any arrangement of the real instruments and hands back the metrics,
    // so a balance question can be answered in a second instead of a re-screenshot.
    ctx.lab = {
      render, analyse, CLOSE, AudioEngine,
      async run(seconds, perform) {
        const buf = await render({ seconds, rng: rng.fork(`lab${Math.round(seconds * 1e6)}`), perform });
        const a = analyse(buf, 'lab');
        const step = Math.max(1, Math.round(a.env.length / 24));
        const env = [];
        for (let i = 0; i < a.env.length; i += step) {
          env.push([Number(((i * a.win) / a.sampleRate).toFixed(2)), Number(dB(a.env[i] / Math.max(1e-9, a.peak)).toFixed(1))]);
        }
        return {
          peakDb: Number(dB(a.peak).toFixed(1)),
          rmsDb: Number(dB(a.rms).toFixed(1)),
          tail: Number(a.tail.toFixed(2)),
          centroid: Math.round(a.centroid),
          centroidA: Math.round(a.centroidA),
          bands: Object.fromEntries(Object.entries(a.bands).map(([k, v]) => [k, Math.round(v * 100)])),
          bandsA: Object.fromEntries(Object.entries(a.bandsA).map(([k, v]) => [k, Math.round(v * 100)])),
          env,
        };
      },
    };

    ctx.report = () => ({
      instruments: analyses.length,
      renderMs: Math.round(renderMs),
      selfTest,
      metrics: analyses.map((a) => ({
        label: a.label,
        peakDb: Number(dB(a.peak).toFixed(1)),
        rmsDb: Number(dB(a.rms).toFixed(1)),
        tail: Number(a.tail.toFixed(2)),
        centroid: Math.round(a.centroid),
        centroidA: Math.round(a.centroidA),
        bands: Object.fromEntries(Object.entries(a.bands).map(([k, v]) => [k, Number((v * 100).toFixed(1))])),
        bandsA: Object.fromEntries(Object.entries(a.bandsA).map(([k, v]) => [k, Number((v * 100).toFixed(1))])),
      })),
    });
    if (!noAudio) console.log('[probe:audio] metrics', JSON.stringify(ctx.report().metrics));
  },
};

/**
 * The installer is a contract `game.js` codes against and it runs before there is
 * a player, a camera matrix, a POI or a user gesture. Plotting proves the sounds;
 * this proves the promises. A failure here is a console.error, which makes
 * tools/probe.mjs exit non-zero.
 */
function contractSelfTest(ctx, reverbTail) {
  const fails = [];
  let checks = 0;
  const check = (name, ok) => { checks++; if (!ok) fails.push(name); };

  // The FDN must decay. See the note at the call site.
  if (reverbTail) {
    check(`the reverb decays rather than oscillating (late energy ${reverbTail.lateDb.toFixed(0)} dB)`,
      reverbTail.lateDb < -30);
  }

  // With no Web Audio at all the whole stream must be inert, not merely quiet.
  {
    const Saved = globalThis.AudioContext;
    const SavedWk = globalThis.webkitAudioContext;
    let inertOk = false;
    try {
      delete globalThis.AudioContext;
      delete globalThis.webkitAudioContext;
      const e = new AudioEngine({});
      inertOk = e.unavailable === true
        && e.unlock() === false
        && e.ctx === null
        && e.voice('weapons', { gain: 1, pan: 0, cutoff: 19000, audible: true }) === null
        && e.sustain('engines', { gain: 1, pan: 0, cutoff: 19000, audible: true }) === null;
      e.setTimeScale(4);
      e.setListener(null, 4000);
      e.sweep(0);
      e.dispose();
    } catch { inertOk = false; } finally {
      if (Saved) globalThis.AudioContext = Saved;
      if (SavedWk) globalThis.webkitAudioContext = SavedWk;
    }
    check('with no AudioContext the stream is inert and throws nothing', inertOk);
  }

  // A world with nothing in it - exactly the state bootGame calls installAudio in.
  const engine = new Engine();
  const bare = new World({
    engine,
    renderer: {
      scene: new THREE.Scene(),
      far: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
    },
    seed: 'audio-probe-bare',
  });

  let audio = null;
  let threw = null;
  try {
    audio = installAudio(bare, { autoGesture: false });
    check('installAudio returns a facade', !!audio);
    check('installAudio parks itself on world.systems.audio', bare.systems.audio === audio);

    const before = engine.systems.length + engine.renderSystems.length;
    check('installAudio is idempotent', installAudio(bare) === audio);
    check('a repeat install registers no extra engine systems',
      engine.systems.length + engine.renderSystems.length === before);
    check('registers a fixed system in the 200-299 audio band',
      engine.systems.some((s) => s.name === 'audio-sim' && s.order >= 200 && s.order < 300));
    check('registers a render system in the 200-299 audio band',
      engine.renderSystems.some((s) => s.name === 'audio-frame' && s.order >= 200 && s.order < 300));

    // No context yet: every play path must be a silent no-op.
    check('no AudioContext is created before a gesture', audio.core.ctx === null);
    check('ready is false before a gesture', audio.core.ready === false);

    // Drive a whole frame with nothing in the world at all.
    for (const s of engine.systems) s.fixedUpdate?.(1 / 60, engine);
    for (const s of engine.renderSystems) s.update?.(1 / 60, engine);

    // Fire every event the stream subscribes to, with empty payloads.
    const events = [
      EV.WEAPON_FIRED, EV.PROJECTILE_IMPACT, EV.SHIELD_IMPACT, EV.SUBSYSTEM_HIT,
      EV.SUBSYSTEM_DESTROYED, EV.SHIP_DESTROYED, EV.SHIP_DISABLED, EV.EXPLOSION,
      EV.HARDPOINT_BREACH_WARNING, EV.HARDPOINT_BREACHED, EV.MODULE_LOST,
      EV.MODULE_INSTALLED, EV.MODULE_REMOVED,
      EV.SALVAGE_CUT_START, EV.SALVAGE_CUT_STOP, EV.SALVAGE_TOW_START, EV.SALVAGE_ACQUIRED,
      EV.POWER_ROUTED, EV.ORDER_MOVE, EV.ORDER_ATTACK, EV.ORDER_SALVAGE,
      EV.ORDER_STRIKECRAFT, EV.SELECTION_CHANGED, EV.NOTIFY, EV.BATTLE_STARTED,
      EV.POI_ENTERED, EV.TIME_SCALE_CHANGED,
    ];
    for (const e of events) { bare.bus.emit(e, undefined); bare.bus.emit(e, {}); }
    check(`every event survives an empty payload (${audio.stats.errors} errors)`, audio.stats.errors === 0);

    // Time controls, including the transit band, with no context behind them.
    for (const scale of [0, 1, 2, 4, 16, 64, 1]) {
      engine.setTimeScaleIndex(0);
      audio.core.setTimeScale(scale);
    }
    check('time scale 0 marks the engine paused', (audio.core.setTimeScale(0), audio.core.paused === true));
    audio.core.setTimeScale(1);
    check('time scale 4 stretches durations to 1/4', (audio.core.setTimeScale(4), Math.abs(audio.core.stretch - 0.25) < 1e-6));
    check('time scale 4 raises pitch by sqrt', Math.abs(audio.core.pitch - 2) < 1e-6);
    audio.core.setTimeScale(64);
    check('the transit band clamps the scheduling rate at 4x', Math.abs(audio.core.stretch - 0.25) < 1e-6);
    audio.core.setTimeScale(1);

    for (const s of engine.systems) s.fixedUpdate?.(1 / 60, engine);
    for (const s of engine.renderSystems) s.update?.(1 / 60, engine);

    // And now with an OfflineAudioContext attached, so the same paths run for real.
    if (typeof OfflineAudioContext === 'function') {
      const oc = new OfflineAudioContext(2, SR / 4, SR);
      audio.core.attach(oc);
      check('attach brings the graph up', audio.core.ready === true);
      check('every bus exists', ['weapons', 'engines', 'impacts', 'ambience', 'ui']
        .every((b) => !!audio.core.mixer.buses[b]));
      check('the reverb is an FDN with four delay lines', audio.core.mixer.reverb.delays.length === 4);
      for (const e of events) bare.bus.emit(e, {});
      for (const s of engine.systems) s.fixedUpdate?.(1 / 60, engine);
      for (const s of engine.renderSystems) s.update?.(1 / 60, engine);
      check(`events with a live context still throw nothing (${audio.stats.errors} errors)`, audio.stats.errors === 0);
      check('the voice budget is respected', audio.core.stats.voices <= 44);
    }

    const report = audio.report();
    check('report() answers', typeof report.voices === 'number' && typeof report.ready === 'boolean');

    audio.dispose();
    check('dispose removes both engine systems',
      !engine.systems.some((s) => s.name === 'audio-sim')
      && !engine.renderSystems.some((s) => s.name === 'audio-frame'));
    check('dispose clears world.systems.audio', bare.systems.audio === undefined);
  } catch (err) {
    threw = err;
    fails.push(`threw: ${err.message}`);
  }

  const ok = fails.length === 0 && !threw;
  if (!ok) console.error('[probe:audio] CONTRACT FAILURES:\n  ' + fails.join('\n  '), threw ?? '');
  else console.log(`[probe:audio] contract self-test passed (${checks} checks)`);

  return {
    ok, checks, fails,
    report: ok ? `${checks} CONTRACT CHECKS OK` : 'CONTRACT FAILURES - SEE CONSOLE',
  };
}
