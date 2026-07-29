/**
 * THE POWER ROUTING PANEL.
 *
 * The mechanic is not "four sliders". The mechanic is that reallocation is NOT
 * INSTANT: `PowerPlant.update` walks `actual` toward `target` at 0.34 of full scale
 * per second, so a full swing takes about three seconds. Panic-switching mid-fight
 * leaves you with neither the shields you gave up nor the guns you asked for.
 *
 * THE GAP BETWEEN REQUESTED AND DELIVERED IS THE ENTIRE SYSTEM, so the panel draws
 * both values on the same track and hatches the distance between them in the warn
 * colour, animated, for exactly as long as the channel is still spooling. A panel
 * that showed only the requested value would be a lie, and a panel that showed only
 * the delivered value would hide the decision the player just made.
 *
 * The second rule the panel has to carry: damage lowers the CEILING, not the
 * allocation. A wounded reactor means every channel gets less for the rest of the
 * fight. So capacity is drawn as its own bar above the four channels, with the
 * healthy ceiling ghosted behind the damaged one.
 *
 * LOCKED STATE. `world.unlocked.powerRouting` is false until the player installs a
 * reactor module (sim/refit.js sets it). Until then the whole panel is drawn at low
 * value under a hatch with the reason on it - present, legible, and visibly not
 * yours yet. Hiding it would make the unlock a surprise instead of a goal.
 */

import * as THREE from 'three';
import { POWER_CHANNELS } from '../core/contracts.js';
import { C, F, TRACK, fmtPct } from './theme.js';

const PRESET_KEYS = [
  ['balanced', 'F1'], ['assault', 'F2'], ['run', 'F3'], ['turtle', 'F4'], ['scan', 'F5'],
];

const CHANNEL_NOTE = {
  shields: 'ABSORB · REGEN',
  weapons: 'RATE OF FIRE',
  engines: 'THRUST · TURN',
  sensors: 'RESOLVE · SIGNATURE',
};

export class PowerPanel {
  constructor(ui) {
    this.ui = ui;
    this.world = ui.world;
    this.width = 356;
    this.rowH = 30;
  }

  get height() { return 46 + POWER_CHANNELS.length * this.rowH + 26; }

  draw(P) {
    const world = this.world;
    const player = world.player;
    const plant = player?.power;
    const unlocked = !!world.unlocked?.powerRouting;

    const w = this.width;
    const h = this.height;
    const px = Math.round(P.w * 0.5 - w * 0.5) - 12;
    const py = P.h - h - 30 - 12;
    const x = px + 12;
    const y = py + 14;

    // THE PLATE. This block used to sit on a 0.70 gradient scrim and at a close
    // framing the white hull read straight through it: the row labels REACTOR
    // ROUTING / OUTPUT / SHIELDS / WEAPONS / ENGINES / SENSORS were simply gone, and
    // the stance buttons measured 2.14:1 over the hull. Only the floating windows
    // ever got the real plate; the welded chrome never did.
    P.plate(px, py, w + 24, h + 26, { border: C.rule });

    /**
     * THE SEALED HATCH, DRAWN AS A BACKGROUND.
     *
     * It used to be drawn OVER the finished panel, so every label in the block was
     * struck through by hatch lines and two full-width rules ran through the middle
     * of the WEAPONS and ENGINES rows. The result was that a first-hour player's very
     * first screen was a panel deliberately rendered unreadable — they could never
     * learn what it would do once they found a reactor, which is the exact opposite
     * of why a locked panel is shown at all.
     *
     * So the hatch goes down FIRST, on the plate, under everything; the content is
     * drawn on top at FULL INK; and "sealed" is said once, in words, by the banner.
     */
    if (!unlocked) P.hatch(px + 1, py + 1, w + 22, h + 24, C.track, { spacing: 9, weight: 1 });

    P.label('REACTOR ROUTING', x, y, { color: C.inkDim });
    P.hline(x, y + 5, w, C.rule);

    if (!plant) {
      P.struck('NO REACTOR', x, y + 24, { font: F.small, color: C.inkFaint });
      return;
    }

    const snap = plant.snapshot();
    // Locked does not mean illegible. The panel reads exactly as it will read once it
    // is the player's; the banner and the hatch carry the fact that it is not yet.
    const ink = C.ink;
    const dim = C.inkDim;

    // --- capacity -----------------------------------------------------------
    const healthy = (plant.baseOutput + plant.bonusOutput) || 1;
    const cap = snap.capacity;
    const damaged = snap.healthFactor < 0.999;
    P.label('OUTPUT', x, y + 20, { color: dim });
    P.text(`${cap.toFixed(0)} / ${healthy.toFixed(0)} PU`, x + w, y + 20, {
      font: F.bodyBold, color: damaged ? C.warn : ink, align: 'right',
    });
    P.bar(x, y + 25, w, 5, cap / healthy, {
      color: damaged ? C.warn : ink, track: C.track, segments: 8,
    });
    if (damaged) {
      P.label(`REACTOR DAMAGE — CEILING ${fmtPct(snap.healthFactor)}`, x, y + 41, { color: C.warn });
    }

    // --- channels -----------------------------------------------------------
    let cy = y + 52;
    const labelW = 62;
    const numW = 96;
    const trackX = x + labelW;
    const trackW = w - labelW - numW;

    for (const ch of POWER_CHANNELS) {
      const e = snap.channels[ch];
      const actual = e.actual;
      const target = e.target;
      const spooling = Math.abs(target - actual) > 0.004;

      P.label(ch, x, cy + 9, { color: spooling ? ink : dim });

      // Track, then the DELIVERED value solid.
      P.fill(trackX, cy, trackW, 11, C.track);
      P.fill(trackX, cy, trackW * actual, 11, ink);

      // The gap. Hatched, animated, in warn — because it is the cost of the
      // decision the player just made and it should be impossible to miss. It is
      // inside the track and no label shares its y.
      if (spooling) {
        const a = Math.min(actual, target);
        const b = Math.max(actual, target);
        const gx = trackX + trackW * a;
        const gw = trackW * (b - a);
        P.hatch(gx, cy, gw, 11, C.warn, { spacing: 5, weight: 1, phase: -P.t * 26 });
        P.frame(gx, cy, gw, 11, C.warnDim);
      }

      // The REQUEST, as a hard tick that stands proud of the track.
      const tx = trackX + trackW * target;
      P.rule(tx - P.hair, cy - 4, P.hair * 2, 19, C.select);
      P.rule(tx - 3, cy - 6, 6, P.hair * 2, C.select);

      // Even-split reference. `PowerPlant.factor()` is relative to this, so it is
      // the line that decides whether a channel is boosted or starved.
      const ex = trackX + trackW * (1 / POWER_CHANNELS.length);
      P.rule(ex, cy + 12, P.hair, 3, C.ruleDim);

      P.text(fmtPct(actual), x + w - 52, cy + 9, {
        font: F.bodyBold, color: spooling ? C.warn : ink, align: 'right',
      });
      P.text(`▸${fmtPct(target)}`, x + w, cy + 9, {
        font: F.small, color: C.selectDim, align: 'right',
      });

      P.label(CHANNEL_NOTE[ch] ?? '', trackX, cy + 20, { color: C.inkFaint });
      P.text(`${e.power.toFixed(0)} PU`, trackX + trackW, cy + 20, {
        font: F.micro, color: C.inkFaint, align: 'right',
      });

      cy += this.rowH;
    }

    // --- presets ------------------------------------------------------------
    cy += 6;
    P.hline(x, cy - 8, w, C.ruleDim);
    const active = this._activePreset(plant);
    const list = this._presets(plant);
    // Measured, not divided: `BALANCED F1` and `ASSAULT F2` printed as `BALANCEDF1`
    // and `ASSAULTF2` because an equal split gave a nine-character name the same
    // width as a three-character one.
    let need = 0;
    const widths = [];
    for (const [name, key] of list) {
      const bw = P.measure(name.toUpperCase(), F.micro, TRACK.none)
        + P.measure(key, F.micro, TRACK.none) + 20;
      widths.push(bw);
      need += bw;
    }
    const gap = list.length > 1 ? Math.max(3, (w - need) / (list.length - 1)) : 0;
    let bx = x;
    for (let i = 0; i < list.length; i++) {
      const [name, key] = list[i];
      const bw = widths[i];
      const on = name === active;
      if (on) P.fill(bx, cy, bw, 16, C.ink);
      else { P.fill(bx, cy, bw, 16, C.panel); P.frame(bx, cy, bw, 16, C.rule); }
      P.text(name.toUpperCase(), bx + 6, cy + 12, {
        font: F.micro, color: on ? C.void : dim, track: TRACK.none, onFill: on,
      });
      P.text(key, bx + bw - 6, cy + 12, {
        font: F.micro, color: on ? C.void : C.inkFaint, align: 'right', track: TRACK.none, onFill: on,
      });
      bx += bw + gap;
    }

    // --- lock ---------------------------------------------------------------
    // One band, two lines, its own opaque ground, and it is the ONLY thing in the
    // block that says "sealed". No rule shares a y with a baseline.
    if (!unlocked) {
      const bandY = py + Math.round((h + 26) * 0.5) - 20;
      P.plate(px + 1, bandY, w + 22, 40, { fill: C.panelTitle, border: C.warnDim });
      P.text('REACTOR GOVERNOR SEALED', px + (w + 24) * 0.5, bandY + 16, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.head,
      });
      P.text('INSTALL A REACTOR MODULE TO ROUTE POWER', px + (w + 24) * 0.5, bandY + 31, {
        font: F.micro, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    }
  }

  _presets(plant) {
    const have = plant?._presets instanceof Map ? plant._presets : null;
    if (!have) return PRESET_KEYS;
    return PRESET_KEYS.filter(([n]) => have.has(n));
  }

  /** Which stored stance the current REQUEST matches, if any. */
  _activePreset(plant) {
    const have = plant?._presets instanceof Map ? plant._presets : null;
    if (!have) return null;
    for (const [name, map] of have) {
      let total = 0;
      for (const ch of POWER_CHANNELS) total += Math.max(0, map[ch] ?? 0);
      if (total <= 1e-6) continue;
      let ok = true;
      for (const ch of POWER_CHANNELS) {
        if (Math.abs(Math.max(0, map[ch] ?? 0) / total - plant.target[ch]) > 0.012) { ok = false; break; }
      }
      if (ok) return name;
    }
    return null;
  }
}

export { THREE };
