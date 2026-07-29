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
import { SEALED_ROW_H } from './layout.js';

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
  }

  /** The plate's rect, from the frame layout. */
  get rect() { return this.ui.layout?.power ?? { x: 0, y: 0, w: 380, h: 218 }; }
  get width() { return this.rect.w - 24; }
  get height() { return this.rect.h - 26; }

  draw(P) {
    const world = this.world;
    const player = world.player;
    const plant = player?.power;
    const unlocked = !!world.unlocked?.powerRouting;

    const rect = this.rect;
    const w = rect.w - 24;
    const h = rect.h - 26;
    const rowH = this.ui.layout?.powerRowH ?? 30;
    const px = rect.x;
    const py = rect.y;
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

    /**
     * THE SEALED BANNER IS A LAYOUT ROW. IT WAS AN OVERLAY, AND IT ERASED A CHANNEL.
     *
     * Measured off the code, then confirmed in a rendered frame
     * (`docs/review/w1e-before/engagement-1600x900.png`): with `h = 46 + 4*30 + 26 =
     * 192` the old banner spanned `py+89 .. py+129` while the four channel rows start
     * at `y + 52 = py + 66` on a 30 px pitch. WEAPONS, at `py+96 .. py+116`, was
     * ENTIRELY INSIDE the banner and simply gone; ENGINES, whose label baseline is
     * `py+135` with a 12 px glyph box reaching up to `py+123`, was sliced through the
     * middle of its glyphs by the banner's bottom edge at `py+129`.
     *
     * So a first-hour player — the only player who ever sees this state — could not
     * learn that a weapons channel exists, which is the exact opposite of the reason
     * the header at lines 71-83 gives for drawing a locked panel at all. And
     * `panels.js:38-42` separately names a hard edge through a row of type as reading
     * like a rendering fault rather than as information.
     *
     * The fix is not a smaller banner or a moved banner. It is that the banner OCCUPIES
     * SPACE: `layout.js` adds `SEALED_ROW_H` to the block's height when the governor is
     * sealed and drops the channel pitch to 20 px for the same total height, so the
     * block is the same size it always was, the banner sits between the OUTPUT bar and
     * the first channel, and every channel reads at full ink over the hatch — which is
     * what the header says the design is.
     */
    let cy = y + 52;
    if (!unlocked) {
      const bandY = y + 46;
      // OPAQUE. `C.panelTitle` is a translucent lift meant to be composited over an
      // existing plate, not a ground of its own — using it here let the WEAPONS and
      // ENGINES rows read straight through the banner that is explaining them.
      P.plate(x - 6, bandY, w + 12, SEALED_ROW_H - 6, { border: C.warnDim });
      P.text('REACTOR GOVERNOR SEALED', x + w * 0.5, bandY + 14, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.head,
      });
      P.text('INSTALL A REACTOR MODULE TO ROUTE POWER', x + w * 0.5, bandY + 27, {
        font: F.micro, color: C.inkDim, align: 'center', track: TRACK.label,
      });
      cy = y + 46 + SEALED_ROW_H;
    }

    // --- channels -----------------------------------------------------------
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

      // The channel's note and its delivered PU. Dropped at the 20 px sealed pitch:
      // there is no room for a sub-line, and `ABSORB · REGEN` is flavour about a
      // channel the player cannot route yet. The banner is the information in that
      // state, and it now has its own row to say it in.
      //
      // The note is CLIPPED to the lane the PU figure leaves it. `RESOLVE · SIGNATURE`
      // is 145 px and the whole track is 122 px on a 1280-wide frame, so it printed
      // straight through `22 PU`.
      if (rowH >= 26) {
        const puW = P.measure('000 PU', F.micro, TRACK.value) + 8;
        P.label(CHANNEL_NOTE[ch] ?? '', trackX, cy + 20,
          { color: C.inkFaint, maxW: Math.max(20, trackW - puW) });
        P.text(`${e.power.toFixed(0)} PU`, trackX + trackW, cy + 20, {
          font: F.micro, color: C.inkFaint, align: 'right',
        });
      }

      cy += rowH;
    }

    // --- presets ------------------------------------------------------------
    cy += 6;
    P.hline(x, cy - 8, w, C.ruleDim);
    const active = this._activePreset(plant);
    const list = this._presets(plant);
    // Measured, not divided: `BALANCED F1` and `ASSAULT F2` printed as `BALANCEDF1`
    // and `ASSAULTF2` because an equal split gave a nine-character name the same
    // width as a three-character one.
    /**
     * FIVE BUTTONS THAT FIT, OR FIVE ABBREVIATIONS THAT FIT.
     *
     * The row measured each name and then laid them out with a MINIMUM gap of 3 — so
     * on a frame narrow enough that the five measured widths already exceeded the
     * block, `SCAN F5` was simply drawn past the plate's right edge and off the
     * panel. The stance buttons are the only control in this block; the one that must
     * not fall off is the last one.
     *
     * So the padding shrinks first, and if the names still do not fit they are cut to
     * their first four letters — `BALANCED`/`ASSAULT`/`TURTLE` stay unambiguous at
     * BALA/ASSA/TURT beside their own F-keys, and the F-key is the thing the player
     * actually presses.
     */
    let need = 0;
    let names = list.map(([name]) => name.toUpperCase());
    const keyW = list.map(([, key]) => P.measure(key, F.micro, TRACK.none));
    const measure = (pad) => {
      let total = 0;
      for (let i = 0; i < list.length; i++) {
        total += P.measure(names[i], F.micro, TRACK.none) + keyW[i] + pad;
      }
      return total;
    };
    let padX = 20;
    need = measure(padX);
    if (need > w) { padX = 12; need = measure(padX); }
    if (need > w) {
      names = names.map((n) => n.slice(0, 4));
      need = measure(padX);
    }
    const widths = [];
    for (let i = 0; i < list.length; i++) {
      widths.push(P.measure(names[i], F.micro, TRACK.none) + keyW[i] + padX);
    }
    const gap = list.length > 1 ? Math.max(2, (w - need) / (list.length - 1)) : 0;
    let bx = x;
    for (let i = 0; i < list.length; i++) {
      const [name, key] = list[i];
      const bw = widths[i];
      const on = name === active;
      if (on) P.fill(bx, cy, bw, 16, C.ink);
      else { P.fill(bx, cy, bw, 16, C.panel); P.frame(bx, cy, bw, 16, C.rule); }
      P.text(names[i], bx + padX * 0.3, cy + 12, {
        font: F.micro, color: on ? C.void : dim, track: TRACK.none, onFill: on,
      });
      P.text(key, bx + bw - padX * 0.3, cy + 12, {
        font: F.micro, color: on ? C.void : C.inkFaint, align: 'right', track: TRACK.none, onFill: on,
      });
      bx += bw + gap;
    }
    // The sealed banner is drawn ABOVE, as its own row between the OUTPUT bar and the
    // first channel. Nothing is overlaid onto this block any more.
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
