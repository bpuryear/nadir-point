/**
 * THE ARMAMENT STRIP — weapon mounts, ship thermal state, and the device hotbar.
 *
 * This is the densest new readout in the game and it exists because four systems
 * landed with real consequences and no way to see any of them:
 *
 *   sim/heat.js      per-mount thermal load, a soft cap that widens dispersion, a trip
 *                    that takes the mount offline AND damages the hardpoint under it
 *   sim/condition.js one 0..1 number that costs rate of fire, traverse, muzzle energy
 *                    and cooling, and decides what the mount is worth when cut off
 *   sim/stores.js    finite rounds, a ready feed, a reload clock, and a charge buffer
 *   sim/subparts.js  barrels / feed / traverse ring / cooling / pad, each failing in
 *                    its own legible way — a dead traverse ring FREEZES the arc
 *
 * `docs/design/scope-decision.md`'s fourth test is "can the player see it? Hidden state
 * that changes outcomes is a bug, not depth." Every one of the above changed outcomes
 * and none of it was on screen. This file is that bug's fix.
 *
 * THE ONE RULE OF THIS PANEL: A MOUNT THAT IS FROZEN, STARVED, COOKING OR WORN MUST BE
 * DISTINGUISHABLE AT A GLANCE. So each cell carries a single solid state chip — the
 * reference's loudest primitive (`reference-ui-language.md` §4) — chosen by urgency,
 * and the states that persist underneath it (a frozen ring, a worn barrel) get their
 * own outlined chip below rather than being hidden by the louder one. Value and
 * pattern carry the distinction, never hue: the interface is monochrome plus amber,
 * and amber means "this is costing you something right now".
 *
 * THERMAL is drawn in the reference's own idiom, transcribed from its frame: the word
 * `STATUS NOMINAL` flipping to `STATUS OVERHEATED`, an `EXT 87.8 / 94.4` figure, a large
 * vertical bar, and a signed rate chip (`2.4%/s`). Those are its numbers, wired to ours.
 */

import * as THREE from 'three';
import { HARDPOINTS, allItems } from '../core/contracts.js';
import { THERMAL, thermalReport } from '../sim/heat.js';
import { storesReport, AMMO_SPEC } from '../sim/stores.js';
import { CONDITION } from '../sim/condition.js';
import { C, F, TRACK, factionInk, fmtPct } from './theme.js';
import { Panel, PAD, TITLE_H } from './panels.js';
import { moduleName, itemName, MOUNT_EMPTY } from './names.js';

const CELL_W = 98;
const CELL_H = 130;
const THERM_W = 152;
const HOTBAR_H = 36;
const BODY_H = CELL_H + 18 + 14 + HOTBAR_H + 8;

/** Abbreviated to fit the cell header beside the weapon archetype. */
const MOUNT_LABEL = {
  bow: 'BOW', dorsal: 'DORSAL', ventral: 'VENT',
  port: 'PORT', starboard: 'STBD', engine: 'ENG',
};

/** Sub-part kind → the single letter drawn inside its square, and the legend text. */
const PART_LETTER = { output: 'O', feed: 'F', traverse: 'T', cooling: 'C', mount: 'M' };
const PART_LEGEND = 'O OUTPUT · F FEED · T TRAVERSE · C COOLING · M PAD';

/** Device hotbar keys. 1–3 are the time scale and ] [ step it; 4–8 are free. */
const HOTBAR_KEYS = ['4', '5', '6', '7', '8'];
const HOTBAR_CODES = ['digit4', 'digit5', 'digit6', 'digit7', 'digit8'];

/**
 * Mount states, most urgent first. The first one that matches becomes the solid chip.
 *
 * `tone` is how loud the chip is, not what colour: `alarm` is a filled amber plate with
 * dark text (unmissable), `warn` is amber type on the plate, `idle` is dim. There is no
 * third hue anywhere in here — see the header.
 */
const STATE = {
  // STRUCTURAL LOSS. The only states in this panel that get hostile red, and the
  // only ones the player cannot undo by waiting or by pressing something.
  BREACHED: { tone: 'lost', note: 'MOUNT LOST' },
  DETACHED: { tone: 'lost', note: 'PAD GONE' },

  // HEAT. Amber, escalating by VALUE — HOT is the low amber, COOKED is the full
  // one. The panel used to carry the same saturated red for thermal state, empty
  // magazines, structural failure, disabled subsystems AND an alert count at the
  // same value, so the eye had nowhere to look first.
  COOKED: { tone: 'heat', note: 'THERMAL TRIP' },
  HOT: { tone: 'heatLow', note: 'OVER SOFT CAP' },

  // ABSENCES. Out of rounds, out of charge, feeding, jammed, unpowered, worn past
  // use: none of these is on fire and none of them is red. Neutral ink and a struck
  // bar say "there is nothing here" without competing with the emergency.
  DRY: { tone: 'starved', note: 'MAGAZINE EMPTY' },
  'NO CHG': { tone: 'starved', note: 'BUFFER EMPTY' },
  JAM: { tone: 'starved', note: 'MISFEED' },
  RELOAD: { tone: 'starved', note: 'FEEDING' },
  OFFLINE: { tone: 'starved', note: 'SUBSYSTEM DOWN' },
  INERT: { tone: 'starved', note: 'WILL NOT FIRE' },

  READY: { tone: 'ok', note: '' },
  PASSIVE: { tone: 'idle', note: 'NO WEAPON' },
  EMPTY: { tone: 'idle', note: 'NOTHING FITTED' },
};

/** tone -> the ink it is allowed. See SEMANTIC in theme.js. */
const TONE_INK = {
  lost: C.hostile,
  heat: C.warn,
  heatLow: C.warnLow,
  starved: C.inkFaint,
  ok: C.inkDim,
  idle: C.inkFaint,
};

export class ArmamentPanel extends Panel {
  constructor(ui) {
    super({
      id: 'armament',
      title: 'ARMAMENT · THERMAL · DEVICES',
      hint: 'X',
      w: PAD * 2 + THERM_W + 6 + HARDPOINTS.length * CELL_W,
      h: TITLE_H + PAD * 2 + BODY_H + 15,
    });
    this.ui = ui;
    this.world = ui.world;

    /** Preallocated cell rows: one per hardpoint, reused every frame. */
    this._cells = HARDPOINTS.map((id) => ({ id, hp: null, mount: null, module: null }));
    /** Device rows, rebuilt at 5 Hz because `canUse` allocates and this is per frame. */
    this._devices = [];
    this._devicesAt = -1;
  }

  // =========================================================================

  drawBody(P, x, y, w, h, hit) {
    const player = this.world.player;
    if (!player) {
      P.text('NO HULL', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }

    const therm = thermalReport(player);
    const stores = storesReport(player);

    /**
     * THE MOUNT CELLS ARE A FRACTION OF THE WIDTH HANDED IN. THE THERMAL COLUMN IS NOT.
     *
     * `PanelHost._layout` now clamps every window against the frame, because a 766 px
     * ARMAMENT on a 1280 px frame covered 31 % of the central half on its own. A body
     * that laid out at `THERM_W + 6 * CELL_W` regardless would have its last two mounts
     * clipped off by the panel's own border — `panels.js:38-42`'s named defect, a hard
     * edge through a row of type reading as a rendering fault.
     *
     * The thermal column does NOT scale, and that is deliberate: its content is fixed
     * strings at fixed lanes (`EXT 94.0 / 94.4` is 75 px on its own against a 32 px
     * value lane at `w * 0.204` on a narrow frame — measured, it printed straight
     * through the BOW cell's `HEAT` row). A column whose content cannot shrink is a
     * column that does not get to shrink; the give comes out of the six cells, which
     * degrade legibly.
     */
    const thermW = THERM_W;
    const cellW = Math.max(52, Math.floor((w - thermW - 6) / HARDPOINTS.length));

    this._drawThermal(P, x, y, thermW, CELL_H, therm, stores);
    P.vline(x + thermW + 2, y, CELL_H, C.ruleDim);

    this._collect(player);
    let cx = x + thermW + 6;
    for (const cell of this._cells) {
      this._drawCell(P, cx, y, cellW - 4, CELL_H, cell, player, stores, hit);
      cx += cellW;
    }

    // The sub-part legend. Five letters carrying five different failure modes is a
    // vocabulary, and an unexplained vocabulary is just noise.
    P.label('SUB-PARTS', x, y + CELL_H + 14, { color: C.inkDim });
    P.label(PART_LEGEND, x + thermW + 6, y + CELL_H + 14,
      { color: C.inkFaint, maxW: w - thermW - 6 });

    P.hline(x, y + CELL_H + 20, w, C.rule);
    this._drawHotbar(P, x, y + CELL_H + 34, w, HOTBAR_H, hit);
    void h;
  }

  // =========================================================================
  // Thermal — reference-ui-language.md §5, transcribed
  // =========================================================================

  _drawThermal(P, x, y, w, h, therm, stores) {
    if (!therm) {
      P.label('THERMAL', x, y + 7, { color: C.inkFaint });
      P.text('NO DATA', x, y + 22, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }

    const over = therm.state === 'OVERHEATED';
    const elevated = therm.state === 'ELEVATED';
    // Escalation by VALUE, not hue: nominal is neutral, elevated is the low amber,
    // overheated is the full one on a filled plate. One colour, three brightnesses.
    const stateCol = over ? C.warn : elevated ? C.warn : C.inkDim;
    const barCol = over ? C.warn : elevated ? C.warnLow : C.inkDim;

    // The large vertical bar sits on the LEFT edge of the column, hard against the
    // panel border, with everything else set beside it. That is the reference's own
    // composition and it is the reason the figures have room: a bar tucked into the
    // right margin leaves every value fighting it for the last thirty pixels.
    const barY = y + 4;
    const barH = h - 20;
    P.vbar(x, barY, 20, barH, therm.peak, {
      color: barCol,
      track: C.track,
      segments: 8,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });
    P.frame(x, barY, 20, barH, C.ruleBright);
    P.label('PEAK', x + 10, y + h - 5, { color: C.inkDim, align: 'center' });

    const tx = x + 30;
    const vx = x + 72;
    const right = x + w;
    P.label('THERMAL', tx, y + 7, { color: C.inkFaint });

    // STATUS <WORD>, on its own line at full column width. The word is the readout;
    // the bar only says how far along it is.
    P.label('STATUS', tx, y + 20, { color: C.inkFaint });
    if (over) {
      // A trip is the one state in this panel allowed to pulse. It costs the player a
      // mount and structural HP on the hardpoint, and it is recoverable — which makes
      // it exactly the case a static readout under-sells.
      const pulse = 0.75 + 0.25 * Math.sin(P.t * 6.0);
      P.ctx.globalAlpha = pulse;
      P.chip(therm.state, tx, y + 24, { fill: C.warn, color: C.void, h: 15, minW: right - tx });
      P.ctx.globalAlpha = 1;
    } else {
      P.text(therm.state, tx, y + 36, { font: F.bodyBold, color: stateCol, track: TRACK.label });
    }

    // EXT, over its ceiling. The reference prints both halves and so do we: a figure
    // with no ceiling beside it is not a measurement.
    P.label('EXT', tx, y + 50, { color: C.inkFaint });
    P.text(`${therm.ext.toFixed(1)} / ${therm.extMax.toFixed(1)}`, vx, y + 50, {
      font: F.small, color: over ? C.warn : C.ink,
    });

    // Signed rate. `0.12/s` in the reference; ours is a percentage of capacity per
    // second, which is the number that says whether you are winning the race.
    const rate = therm.rate * 100;
    const rising = rate > 0.05;
    P.label('RATE', tx, y + 62, { color: C.inkFaint });
    P.text(`${rising ? '+' : rate < -0.05 ? '−' : ' '}${Math.abs(rate).toFixed(1)}%/s`, vx, y + 62, {
      font: F.small, color: rising ? C.warn : C.inkDim,
    });

    // Load is what the reactor is dumping into the hull; radiate is what is left over
    // to shed it. The two bars ARE the power interlock — route to weapons and the top
    // bar grows while the bottom one shrinks.
    P.label('LOAD', tx, y + 74, { color: C.inkFaint });
    P.bar(vx, y + 68, right - vx, 5, therm.load, { color: C.inkDim, track: C.track, segments: 4 });
    P.label('RAD', tx, y + 86, { color: C.inkFaint });
    P.bar(vx, y + 80, right - vx, 5, therm.radiate, { color: C.inkDim, track: C.track, segments: 4 });

    // Coolant purges. Small, finite, and the thing you press when the bar is climbing.
    const coolant = stores ? stores.coolant : therm.coolant;
    const coolantMax = Math.max(1, stores ? stores.coolantMax : therm.coolantMax);
    P.label('PURGE', tx, y + 100, { color: C.inkFaint });
    P.pips(vx, y + 94, coolantMax, coolant, {
      size: 8, gap: 3, color: coolant > 0 ? C.ink : C.inkFaint, empty: C.track,
    });
    if (therm.tripped > 0) {
      // Its own line. Right-aligning it against the purge pips put a five-word figure
      // through a three-pip row, which is how a warning becomes unreadable.
      P.text(`${therm.tripped} MOUNT${therm.tripped > 1 ? 'S' : ''} TRIPPED`, tx, y + 114, {
        font: F.microBold, color: C.warn, track: TRACK.label,
      });
    }
  }

  // =========================================================================
  // Mount cells
  // =========================================================================

  /** Fill the preallocated cell rows from the hull. No allocation. */
  _collect(player) {
    for (const cell of this._cells) {
      cell.hp = player.hardpoints?.get(cell.id) ?? null;
      cell.module = cell.hp?.module?.def ?? null;
      cell.mount = null;
    }
    for (const m of player.weapons) {
      if (!m.hardpoint) continue;
      for (const cell of this._cells) {
        if (cell.id === m.hardpoint && !cell.mount) { cell.mount = m; break; }
      }
    }
  }

  /**
   * Resolve the one state word this mount gets. Order is urgency, and urgency is
   * "how soon does this stop me putting rounds on a target".
   */
  _stateOf(cell, player) {
    const { hp, mount, module } = cell;
    if (hp?.breached) return 'BREACHED';
    if (!module && !mount) return 'EMPTY';
    if (!mount) return 'PASSIVE';
    const parts = mount.parts;
    if (parts?.detached || parts?.wantsDetach) return 'DETACHED';
    if (parts?.inert || mount.condition < CONDITION.inert) return 'INERT';
    if (mount.thermal?.tripped) return 'COOKED';
    if (mount.stall > 0) return 'JAM';
    const blocked = player.stores ? player.stores.blockedReason(mount) : null;
    if (blocked === 'DRY') return 'DRY';
    if (blocked === 'CHARGE') return 'NO CHG';
    if (blocked === 'RELOAD') return 'RELOAD';
    if (!mount.online) return 'OFFLINE';
    if (mount.thermal && mount.thermal.heat > THERMAL.softCap) return 'HOT';
    return 'READY';
  }

  _drawCell(P, x, y, w, h, cell, player, stores, hit) {
    const { hp, mount, module } = cell;
    const state = this._stateOf(cell, player);
    const spec = STATE[state] ?? STATE.READY;
    const ink = TONE_INK[spec.tone] ?? C.inkDim;

    P.frame(x, y, w, h, C.rule);

    // Header: which mount, and what archetype sits on it. The archetype is DROPPED,
    // not squeezed, once the cell is too narrow for both — `DORSAL` and `RAIL` are
    // 46 and 30 px against a 66 px cell, and the two printed as `DORSALRAIL`. The
    // mount name is the one that has to survive; the archetype is repeated by the
    // module name on the line below it.
    const typeStr = mount ? String(mount.def.type).toUpperCase() : '';
    const typeW = typeStr ? P.measure(typeStr, F.micro, TRACK.label) : 0;
    const showType = !!typeStr && w >= typeW
      + P.measure(MOUNT_LABEL[cell.id] ?? cell.id, F.micro, TRACK.label) + 16;
    P.label(MOUNT_LABEL[cell.id] ?? cell.id, x + 4, y + 10,
      { color: C.inkDim, maxW: Math.max(12, w - 8 - (showType ? typeW + 6 : 0)) });
    if (showType) {
      P.label(mount.def.type, x + w - 4, y + 10, { color: C.inkFaint, align: 'right' });
    }

    // Faction identity stripe. The one chromatic mark in this panel, spent on the one
    // thing the game is about: where the part came from.
    if (module) {
      const fi = factionInk(module.faction);
      P.fill(x + 4, y + 14, 2, 10, hp?.breached ? C.hostileDim : fi.stripe);
      // The AUTHORED short name. This cell used to print `CONCORD SIE…` and
      // `COALITION R…`, so the player could not tell which lance or which battery
      // they were looking at — in a game about which parts you bolted on.
      P.text(moduleName(module), x + 10, y + 23,
        { font: F.micro, color: hp?.breached ? C.hostileDim : C.ink, track: TRACK.value, maxW: w - 14 });
    } else {
      // Full ink, leading dash, and the NAME OF THE SOCKET rather than a fading
      // `— NO MODULE —` at 1.38:1. An empty mount is information. Clipped to the
      // cell: `STBD SPONSON` used to run out of its own box and into the next one.
      P.struck(P.clip(MOUNT_EMPTY[cell.id] ?? 'EMPTY', F.micro, w - 22), x + 4, y + 23,
        { font: F.micro, color: C.inkFaint });
    }

    // --- the state chip ----------------------------------------------------
    const chipY = y + 28;
    if (spec.tone === 'lost' || spec.tone === 'heat') {
      // A filled plate with dark text. Reserved for the two categories that are
      // actually costing the player something this second.
      let label = state;
      if (state === 'COOKED' && mount?.thermal?.tripRemaining > 0) {
        label = `COOKED ${mount.thermal.tripRemaining.toFixed(1)}`;
      }
      const pulse = spec.tone === 'lost' ? 1 : 0.82 + 0.18 * Math.sin(P.t * 6);
      P.ctx.globalAlpha = pulse;
      // Clipped to the cell. `P.chip` sizes itself to `max(minW, measure + pad)`, so
      // `BREACHED` at 69 px grew a 62 px cell's chip past its own border and into the
      // neighbouring mount's `PASSIVE`.
      P.chip(P.clip(label, F.microBold, w - 16, TRACK.label), x + 4, chipY,
        { fill: ink, color: C.void, h: 15, minW: w - 8 });
      P.ctx.globalAlpha = 1;
    } else if (spec.tone === 'heatLow') {
      P.fill(x + 4, chipY, w - 8, 15, C.panel);
      P.frame(x + 4, chipY, w - 8, 15, ink);
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'starved') {
      // An outline and a strike, in neutral ink. RELOAD fills the outline as it
      // feeds, so a mount that is coming back reads as a thing that is coming back.
      P.frame(x + 4, chipY, w - 8, 15, C.ruleBright);
      if (state === 'RELOAD' && mount) {
        const total = mount.def.reload ?? AMMO_SPEC[mount.ammoClass]?.reload ?? 6;
        const k = 1 - THREE.MathUtils.clamp(mount.reloading / Math.max(0.001, total), 0, 1);
        P.fill(x + 5, chipY + 1, (w - 10) * k, 13, C.track);
      }
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'ok') {
      P.text('READY', x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else {
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.micro, color: C.inkFaint, align: 'center', track: TRACK.label,
      });
    }

    if (!mount) {
      // A passive module still has a condition and it still decides what the module
      // grants — `condition.grantMul` scales power output, shields, thrust and cargo.
      if (module && hp) {
        const cond = hp.module?.condition ?? 1;
        P.label('COND', x + 4, y + 60, { color: C.inkFaint });
        P.bar(x + 4, y + 64, w - 8, 7, cond, {
          color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.track,
        });
        const pctW = P.measure('100%', F.micro, TRACK.value) + 6;
        P.text(fmtPct(cond), x + w - 4, y + 84, { font: F.micro, color: C.inkDim, align: 'right' });
        P.label('GRANTS', x + 4, y + 84, { color: C.inkFaint, maxW: Math.max(10, w - 8 - pctW) });
      }
      if (hit) hit.push({ kind: 'armament:mount', panel: this.id, mount: cell.id, x, y, w, h });
      return;
    }

    // --- heat and condition -------------------------------------------------
    // Two labelled bars on their own rows. `H` and `C` beside a bar was a private
    // code; the words fit and they cost nothing.
    const th = mount.thermal;
    const heat = th ? th.heat : 0;
    const barX = x + 32;
    const barW = w - 36;
    P.label('HEAT', x + 4, y + 54, { color: C.inkFaint });
    P.bar(barX, y + 48, barW, 7, heat, {
      color: heat > THERMAL.softCap ? C.warn : C.warnLow,
      track: C.track,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });

    const cond = mount.condition ?? 1;
    P.label('COND', x + 4, y + 66, { color: C.inkFaint });
    P.bar(barX, y + 60, barW, 7, cond, {
      color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.track,
    });

    // --- stores -------------------------------------------------------------
    // Kinetic mounts print `ready/readyMax` and the magazine behind them; energy
    // mounts print the shared charge buffer. Two currencies, said in two ways, and
    // an empty one is neutral ink and a struck bar rather than an alarm.
    const cls = mount.ammoClass;
    if (cls) {
      const mag = player.stores ? player.stores.rounds(cls) : 0;
      const dry = mag <= 0 && mount.ready <= 0;
      // Two lanes, measured. `6/6` and `MAG 90` were drawn left and right with nothing
      // between them, and at 62 px of cell they met in the middle.
      const magStr = `MAG ${mag}`;
      const magW = P.measure(magStr, F.micro, TRACK.value);
      P.text(`${mount.ready}/${mount.readyMax}`, x + 4, y + 82, {
        font: F.micro, color: dry ? C.inkFaint : C.inkDim, maxW: Math.max(10, w - 12 - magW),
      });
      P.text(magStr, x + w - 4, y + 82, {
        font: F.micro, color: dry ? C.inkFaint : C.inkDim, align: 'right',
      });
      if (dry) P.rule(x + 4, y + 79, w - 8, P.hair, C.inkFaint);
    } else {
      const chg = stores ? stores.charge / Math.max(1, stores.chargeMax) : 0;
      P.label('CHG', x + 4, y + 82, { color: C.inkFaint });
      P.bar(x + 32, y + 76, w - 36, 7, chg, {
        color: C.inkDim, track: C.track, struck: chg < 0.02,
      });
    }

    // --- persistent structural states ---------------------------------------
    // These survive underneath whatever the loud chip says. A frozen traverse ring is
    // permanent until it is repaired and it changes how the ship must be flown, so it
    // may not be hidden by a transient RELOAD.
    let sx = x + 4;
    if (mount.parts?.traverseFrozen) {
      sx = P.chipOutline('FROZEN', sx, y + 88, { color: C.inkDim, border: C.ruleBright, h: 13, padX: 3 }) + 2;
    }
    if (cond < CONDITION.worn && cond >= CONDITION.inert) {
      sx = P.chipOutline('WORN', sx, y + 88, { color: C.inkDim, border: C.ruleBright, h: 13, padX: 3 }) + 2;
    }
    if (th && th.trips > 0 && sx < x + w - 20) {
      P.chipOutline(`×${th.trips}`, sx, y + 88, { color: C.warn, border: C.warnDim, h: 13, padX: 3 });
    }

    // --- sub-parts ----------------------------------------------------------
    // One square per part, in the layout's own order, carrying its kind letter. A
    // destroyed part is hatched and struck; a damaged one is partly filled from the
    // bottom. This is the readout the second-tier aim ring aims INTO.
    const parts = mount.parts?.list ?? [];
    const n = parts.length;
    if (n > 0) {
      const sq = Math.min(16, Math.floor((w - 8) / n) - 2);
      let px2 = x + 4;
      for (const part of parts) {
        const py2 = y + h - sq - 5;
        // The square fills from the bottom with the part's remaining health, so a
        // half-shot feed reads as half a square. A healthy part is a SOLID block —
        // a near-black fill made every live part look like an empty slot.
        P.fill(px2, py2, sq, sq, C.track);
        if (!part.destroyed && part.health > 0) {
          P.fill(px2, py2 + sq * (1 - part.health), sq, sq * part.health,
            part.health < 0.5 ? C.warn : C.inkDim);
        }
        P.frame(px2, py2, sq, sq, part.destroyed ? C.hostile : C.ruleBright);
        if (part.destroyed) {
          // Hatch first, glyph second: the letter is never crossed by the pattern.
          P.hatch(px2 + 1, py2 + 1, sq - 2, sq - 2, C.hostileDim, { spacing: 4, weight: 1 });
        }
        P.text(PART_LETTER[part.kind] ?? '?', px2 + sq * 0.5, py2 + sq - 4, {
          font: F.microBold,
          color: part.destroyed ? C.hostile : part.health > 0.4 ? C.void : C.ink,
          align: 'center', track: TRACK.none, onFill: !part.destroyed && part.health > 0.4,
        });
        if (hit) {
          hit.push({
            kind: 'armament:part', panel: this.id, mount: cell.id, partId: part.id,
            x: px2, y: py2, w: sq, h: sq,
          });
        }
        px2 += sq + 2;
      }
    }

    if (hit) {
      hit.push({ kind: 'armament:mount', panel: this.id, mount: cell.id, x, y, w, h });
    }
  }

  // =========================================================================
  // Device hotbar
  // =========================================================================

  _devicesFor(now) {
    // `canUse` allocates a result object per call and `describeHotbar` allocates a row
    // per item; neither belongs on a 60 Hz path. Five per second is well inside human
    // reaction time for a readout whose contents change on pickup and on use.
    if (now - this._devicesAt < 0.2 && this._devices.length) return this._devices;
    this._devicesAt = now;
    const items = this.world.systems?.items;
    const hold = this.world.systems?.cargo;
    const rows = this._devices;
    rows.length = 0;
    const defs = allItems();
    for (let i = 0; i < defs.length && i < HOTBAR_KEYS.length; i++) {
      const def = defs[i];
      const count = hold?.itemCount(def.id) ?? 0;
      let active = false;
      if (items) {
        for (const e of items.active) if (e.itemId === def.id) { active = true; break; }
      }
      let remaining = 0;
      if (active && items) {
        for (const e of items.active) if (e.itemId === def.id) remaining = Math.max(remaining, e.remaining);
      }
      const check = items ? items.canUse(def.id) : { ok: false, reason: 'no system' };
      rows.push({
        id: def.id, name: def.name, kind: def.kind, count, active, remaining,
        ready: check.ok, reason: check.ok ? null : check.reason, volume: def.volume,
      });
    }
    return rows;
  }

  _drawHotbar(P, x, y, w, h, hit) {
    P.label('DEVICES', x, y + 9, { color: C.inkDim });
    P.label('PRESS 4-8', x, y + 23, { color: C.inkFaint });
    const rows = this._devicesFor(this.ui.time);
    if (!rows.length) {
      P.struck('NONE REGISTERED', x + 70, y + 9, { font: F.micro, color: C.inkFaint });
      return;
    }
    const slotW = Math.floor((w - 70) / rows.length);
    let sx = x + 70;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const usable = r.ready;
      const sy = y;
      const sh = h - 4;

      // The plate first, then the hatch, then the type. The hatch used to be drawn
      // OVER the finished slot, so `NONE CARRIED` — the one line telling the player
      // why the device will not fire — was struck through by it.
      P.fill(sx, sy, slotW - 4, sh, C.panel);
      if (!usable && !r.active) P.hatch(sx, sy, slotW - 4, sh, C.track, { spacing: 6, weight: 1 });
      if (r.active) {
        P.fill(sx, sy, slotW - 4, sh, C.warnGhost);
        P.frame(sx, sy, slotW - 4, sh, C.warn);
      } else {
        P.frame(sx, sy, slotW - 4, sh, usable ? C.ruleBright : C.rule);
      }

      // The key cap, drawn as a chip so it reads as a thing you press. The reference
      // does exactly this: `E Open Cargo`, keycap first.
      P.chip(HOTBAR_KEYS[i], sx + 3, sy + 3, {
        fill: usable ? C.ink : C.inkFaint, color: C.void, h: 11, padX: 4, font: F.micro,
      });

      // The AUTHORED short name — `COOLANT`, `BOARD CHG` — not `COOLANT PU…`. Clipped
      // to the lane the count leaves: at five slots on a narrowed panel `SURVEY PULSE`
      // ran through its own `×0` and into the next slot's name.
      const cntW = P.measure('×88', F.microBold, TRACK.value) + 8;
      P.text(itemName(r.id), sx + 22, sy + 12, {
        font: F.micro, color: usable ? C.ink : C.inkDim, track: TRACK.label,
        maxW: Math.max(16, slotW - 32 - cntW),
      });

      P.text(`×${r.count}`, sx + slotW - 10, sy + 12, {
        font: F.microBold, color: r.count > 0 ? C.ink : C.inkFaint, align: 'right',
      });

      const sub = r.active ? `RUNNING ${r.remaining.toFixed(1)}s`
        : usable ? `${r.volume} m3 EACH` : (r.reason ?? '').toUpperCase();
      // On a strip of plate of its own so the hatch behind the slot cannot cross it.
      const subW = P.measure(sub, F.micro, TRACK.label);
      if (!usable && !r.active) P.fill(sx + 3, sy + sh - 13, Math.min(slotW - 8, subW + 4), 12, C.panel);
      P.text(sub, sx + 5, sy + sh - 4, {
        font: F.micro, color: r.active ? C.warn : usable ? C.inkFaint : C.inkDim, track: TRACK.label, maxW: slotW - 12 });

      if (hit) {
        hit.push({ kind: 'armament:device', panel: this.id, itemId: r.id, x: sx, y: sy, w: slotW - 4, h: sh });
      }
      sx += slotW;
    }
  }

  // =========================================================================

  onClick(region) {
    if (region.kind === 'armament:device') {
      this.ui.useDevice(region.itemId);
      return true;
    }
    if (region.kind === 'armament:mount' || region.kind === 'armament:part') {
      const label = MOUNT_LABEL[region.mount] ?? region.mount;
      const player = this.world.player;
      const mount = player?.weapons?.find((m) => m.hardpoint === region.mount) ?? null;
      if (region.partId && mount) {
        const part = mount.parts?.get(region.partId);
        if (part) {
          this.ui.orderBar.say(
            `${label} · ${part.label} — ${part.destroyed ? 'DESTROYED' : `${fmtPct(part.health)} INTACT`}`,
            part.destroyed ? 'error' : 'info',
          );
          return true;
        }
      }
      const state = this._stateOf(this._cells.find((c) => c.id === region.mount) ?? {}, player);
      const spec = STATE[state] ?? STATE.READY;
      this.ui.orderBar.say(`${label} — ${state}${spec.note ? ` · ${spec.note}` : ''}`,
        spec.tone === 'alarm' ? 'error' : 'info');
      return true;
    }
    return false;
  }

  /** Keyboard activation, wired from `UILayer`. Works whether the panel is open or not. */
  static keyIndex(code) {
    return HOTBAR_CODES.indexOf(code);
  }

  deviceIdAt(index) {
    const rows = this._devicesFor(this.ui.time);
    return rows[index]?.id ?? null;
  }
}

