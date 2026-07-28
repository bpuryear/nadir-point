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
    const x = Math.round(P.w * 0.5 - w * 0.5);
    const h = this.height;
    const y = P.h - h - 30;

    P.scrim(x - 14, y - 12, w + 28, h + 24, { alpha: 0.70 });

    P.label('REACTOR ROUTING', x, y, { color: unlocked ? C.inkDim : C.inkGhost });
    P.hline(x, y + 5, w, unlocked ? C.rule : C.ruleDim);

    if (!plant) {
      P.text('NO REACTOR', x, y + 22, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }

    const snap = plant.snapshot();
    const ink = unlocked ? C.ink : C.inkFaint;
    const dim = unlocked ? C.inkDim : C.inkGhost;

    // --- capacity -----------------------------------------------------------
    const healthy = (plant.baseOutput + plant.bonusOutput) || 1;
    const cap = snap.capacity;
    const damaged = snap.healthFactor < 0.999;
    P.label('OUTPUT', x, y + 20, { color: dim });
    P.text(`${cap.toFixed(0)} / ${healthy.toFixed(0)} PU`, x + w, y + 20, {
      font: F.bodyBold, color: damaged ? C.warn : ink, align: 'right',
    });
    P.bar(x, y + 25, w, 5, cap / healthy, {
      color: damaged ? C.warn : ink, track: C.inkGhost, segments: 8,
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
      P.fill(trackX, cy, trackW, 11, C.inkGhost);
      P.fill(trackX, cy, trackW * actual, 11, unlocked ? C.ink : C.inkFaint);

      // The gap. Hatched, animated, in warn — because it is the cost of the
      // decision the player just made and it should be impossible to miss.
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
      P.rule(tx - P.hair, cy - 4, P.hair * 2, 19, unlocked ? C.select : C.inkFaint);
      P.rule(tx - 3, cy - 6, 6, P.hair * 2, unlocked ? C.select : C.inkFaint);

      // Even-split reference. `PowerPlant.factor()` is relative to this, so it is
      // the line that decides whether a channel is boosted or starved.
      const ex = trackX + trackW * (1 / POWER_CHANNELS.length);
      P.rule(ex, cy + 12, P.hair, 3, C.ruleDim);

      P.text(fmtPct(actual), x + w - 52, cy + 9, {
        font: F.bodyBold, color: spooling ? C.warn : ink, align: 'right',
      });
      P.text(`▸${fmtPct(target)}`, x + w, cy + 9, {
        font: F.small, color: unlocked ? C.selectDim : C.inkGhost, align: 'right',
      });

      P.label(CHANNEL_NOTE[ch] ?? '', trackX, cy + 20, { color: C.inkGhost });
      P.text(`${e.power.toFixed(0)} PU`, trackX + trackW, cy + 20, {
        font: F.micro, color: C.inkGhost, align: 'right',
      });

      cy += this.rowH;
    }

    // --- presets ------------------------------------------------------------
    cy += 6;
    P.hline(x, cy - 8, w, C.ruleDim);
    const active = this._activePreset(plant);
    const list = this._presets(plant);
    const tw = Math.floor((w - (list.length - 1) * 6) / list.length);
    let px = x;
    for (const [name, key] of list) {
      const on = name === active;
      if (on) P.fill(px, cy, tw, 14, unlocked ? C.ink : C.inkGhost);
      else P.frame(px, cy, tw, 14, C.ruleDim);
      P.text(name.toUpperCase(), px + 5, cy + 10, {
        font: F.micro, color: on ? C.void : dim, track: TRACK.none,
      });
      P.text(key, px + tw - 5, cy + 10, {
        font: F.micro, color: on ? C.void : C.inkGhost, align: 'right',
      });
      px += tw + 6;
    }

    // --- lock ---------------------------------------------------------------
    if (!unlocked) {
      P.hatch(x - 14, y - 12, w + 28, h + 24, C.inkGhost, { spacing: 9, weight: 1 });
      const bandY = y + Math.round(h * 0.5) - 12;
      P.fill(x - 14, bandY, w + 28, 24, C.scrimHard);
      P.hline(x - 14, bandY, w + 28, C.warnDim);
      P.hline(x - 14, bandY + 23, w + 28, C.warnDim);
      P.text('REACTOR GOVERNOR SEALED', x + w * 0.5, bandY + 11, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.head,
      });
      P.text('INSTALL A REACTOR MODULE TO ROUTE POWER', x + w * 0.5, bandY + 34, {
        font: F.micro, color: C.inkFaint, align: 'center', track: TRACK.label,
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
