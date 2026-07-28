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
import { HARDPOINTS, getItem, allItems } from '../core/contracts.js';
import { THERMAL, thermalReport } from '../sim/heat.js';
import { storesReport, AMMO_SPEC } from '../sim/stores.js';
import { CONDITION } from '../sim/condition.js';
import { C, F, TRACK, factionInk, fmtPct } from './theme.js';
import { Panel, PAD, TITLE_H } from './panels.js';

const CELL_W = 84;
const CELL_H = 116;
const THERM_W = 130;
const HOTBAR_H = 32;
const BODY_H = CELL_H + 16 + 12 + HOTBAR_H + 6;

/** Abbreviated to fit an 80 px cell beside the weapon archetype. */
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
  BREACHED: { tone: 'alarm', note: 'MOUNT LOST' },
  DETACHED: { tone: 'alarm', note: 'PAD GONE' },
  INERT: { tone: 'alarm', note: 'WILL NOT FIRE' },
  COOKED: { tone: 'alarm', note: 'THERMAL TRIP' },
  DRY: { tone: 'alarm', note: 'MAGAZINE EMPTY' },
  JAM: { tone: 'warn', note: 'MISFEED' },
  'NO CHG': { tone: 'warn', note: 'BUFFER EMPTY' },
  RELOAD: { tone: 'warn', note: 'FEEDING' },
  HOT: { tone: 'warn', note: 'OVER SOFT CAP' },
  OFFLINE: { tone: 'warn', note: 'SUBSYSTEM DOWN' },
  READY: { tone: 'ok', note: '' },
  PASSIVE: { tone: 'idle', note: 'NO WEAPON' },
  EMPTY: { tone: 'idle', note: 'NOTHING FITTED' },
};

export class ArmamentPanel extends Panel {
  constructor(ui) {
    super({
      id: 'armament',
      title: 'ARMAMENT · THERMAL · DEVICES',
      hint: 'X',
      w: PAD * 2 + THERM_W + 6 + HARDPOINTS.length * CELL_W,
      h: TITLE_H + PAD * 2 + BODY_H,
      // Directly above the reactor routing block, which is the other place the player
      // spends attention mid-fight. Keeping the two adjacent is the point: routing
      // power to weapons raises rate of fire AND heat, and the interlock only reads if
      // both readouts are in the same glance.
      place: (P) => ({ x: Math.round(P.w * 0.5 - (PAD * 2 + THERM_W + 6 + HARDPOINTS.length * CELL_W) * 0.5),
        y: P.h - 240 - (TITLE_H + PAD * 2 + BODY_H) }),
    });
    this.ui = ui;
    this.world = ui.world;
    this.open = true;

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
      P.text('NO HULL', x, y + 14, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }

    const therm = thermalReport(player);
    const stores = storesReport(player);

    this._drawThermal(P, x, y, THERM_W, CELL_H, therm, stores);
    P.vline(x + THERM_W + 2, y, CELL_H, C.ruleDim);

    this._collect(player);
    let cx = x + THERM_W + 6;
    for (const cell of this._cells) {
      this._drawCell(P, cx, y, CELL_W - 4, CELL_H, cell, player, stores, hit);
      cx += CELL_W;
    }

    // The sub-part legend. Five letters carrying five different failure modes is a
    // vocabulary, and an unexplained vocabulary is just noise.
    P.label(PART_LEGEND, x + THERM_W + 6, y + CELL_H + 12, { color: C.inkGhost });
    P.label('SUB-PARTS', x, y + CELL_H + 12, { color: C.inkFaint });

    P.hline(x, y + CELL_H + 18, w, C.ruleDim);
    this._drawHotbar(P, x, y + CELL_H + 32, w, HOTBAR_H, hit);
    void h;
  }

  // =========================================================================
  // Thermal — reference-ui-language.md §5, transcribed
  // =========================================================================

  _drawThermal(P, x, y, w, h, therm, stores) {
    if (!therm) {
      P.label('THERMAL', x, y + 7, { color: C.inkFaint });
      P.text('NO DATA', x, y + 22, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }

    const over = therm.state === 'OVERHEATED';
    const elevated = therm.state === 'ELEVATED';
    const stateCol = over ? C.warn : elevated ? C.ink : C.inkDim;

    // The large vertical bar sits on the LEFT edge of the column, hard against the
    // panel border, with everything else set beside it. That is the reference's own
    // composition and it is the reason the figures have room: a bar tucked into the
    // right margin leaves every value fighting it for the last thirty pixels.
    const barY = y + 4;
    const barH = h - 20;
    P.vbar(x, barY, 18, barH, therm.peak, {
      color: over ? C.warn : elevated ? C.ink : C.inkDim,
      track: C.inkGhost,
      segments: 8,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });
    P.frame(x, barY, 18, barH, C.ruleDim);
    P.label('PEAK', x + 9, y + h - 6, { color: C.inkGhost, align: 'center' });

    const tx = x + 26;
    const vx = x + 62;
    const right = x + w;
    P.label('THERMAL', tx, y + 7, { color: C.inkFaint });

    // STATUS <WORD>, on its own line at full column width. The word is the readout;
    // the bar only says how far along it is.
    P.label('STATUS', tx, y + 20, { color: C.inkGhost });
    if (over) {
      // A trip is the one state in this panel allowed to pulse. It costs the player a
      // mount and structural HP on the hardpoint, and it is recoverable — which makes
      // it exactly the case a static readout under-sells.
      const pulse = 0.75 + 0.25 * Math.sin(P.t * 6.0);
      P.ctx.globalAlpha = pulse;
      P.chip(therm.state, tx, y + 24, { fill: C.warn, color: C.void, h: 14, minW: right - tx });
      P.ctx.globalAlpha = 1;
    } else {
      P.text(therm.state, tx, y + 35, { font: F.bodyBold, color: stateCol, track: TRACK.label });
    }

    // EXT, over its ceiling. The reference prints both halves and so do we: a figure
    // with no ceiling beside it is not a measurement.
    P.label('EXT', tx, y + 50, { color: C.inkGhost });
    P.text(`${therm.ext.toFixed(1)} / ${therm.extMax.toFixed(1)}`, vx, y + 50, {
      font: F.small, color: over ? C.warn : C.ink,
    });

    // Signed rate. `0.12/s` in the reference; ours is a percentage of capacity per
    // second, which is the number that says whether you are winning the race.
    const rate = therm.rate * 100;
    const rising = rate > 0.05;
    P.label('RATE', tx, y + 62, { color: C.inkGhost });
    P.text(`${rising ? '+' : rate < -0.05 ? '−' : ' '}${Math.abs(rate).toFixed(1)}%/s`, vx, y + 62, {
      font: F.small, color: rising ? C.warn : C.inkDim,
    });

    // Load is what the reactor is dumping into the hull; radiate is what is left over
    // to shed it. The two bars ARE the power interlock — route to weapons and the top
    // bar grows while the bottom one shrinks.
    P.label('LOAD', tx, y + 74, { color: C.inkGhost });
    P.bar(vx, y + 68, right - vx, 5, therm.load, { color: C.inkDim, track: C.inkGhost, segments: 4 });
    P.label('RAD', tx, y + 86, { color: C.inkGhost });
    P.bar(vx, y + 80, right - vx, 5, therm.radiate, { color: C.inkDim, track: C.inkGhost, segments: 4 });

    // Coolant purges. Small, finite, and the thing you press when the bar is climbing.
    const coolant = stores ? stores.coolant : therm.coolant;
    const coolantMax = Math.max(1, stores ? stores.coolantMax : therm.coolantMax);
    P.label('PURGE', tx, y + 100, { color: C.inkGhost });
    P.pips(vx, y + 94, coolantMax, coolant, {
      size: 7, gap: 3, color: coolant > 0 ? C.ink : C.inkGhost, empty: C.inkGhost,
    });
    if (therm.tripped > 0) {
      // Its own line. Right-aligning it against the purge pips put a five-word figure
      // through a three-pip row, which is how a warning becomes unreadable.
      P.text(`${therm.tripped} MOUNT${therm.tripped > 1 ? 'S' : ''} TRIPPED`, tx, y + 112, {
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

    P.frame(x, y, w, h, C.ruleDim);

    // Header: which mount, and what archetype sits on it.
    P.label(MOUNT_LABEL[cell.id] ?? cell.id, x + 3, y + 9, { color: C.inkFaint });
    if (mount) {
      P.label(mount.def.type, x + w - 3, y + 9, { color: C.inkGhost, align: 'right' });
    }

    // Faction identity stripe. The one chromatic mark in this panel, spent on the one
    // thing the game is about: where the part came from.
    if (module) {
      const fi = factionInk(module.faction);
      P.fill(x + 3, y + 13, 2, 9, hp?.breached ? C.warnDim : fi.stripe);
      P.text(P.clip((module.name ?? '').toUpperCase(), F.micro, w - 12), x + 8, y + 21,
        { font: F.micro, color: hp?.breached ? C.warnDim : C.inkDim, track: TRACK.value });
    } else {
      P.text('— NO MODULE —', x + 3, y + 21, { font: F.micro, color: C.inkGhost, track: TRACK.label });
    }

    // --- the state chip ----------------------------------------------------
    const chipY = y + 26;
    if (spec.tone === 'alarm') {
      let label = state;
      if (state === 'COOKED' && mount?.thermal?.tripRemaining > 0) {
        label = `COOKED ${mount.thermal.tripRemaining.toFixed(1)}`;
      }
      P.chip(label, x + 3, chipY, { fill: C.warn, color: C.void, h: 14, minW: w - 6 });
    } else if (spec.tone === 'warn') {
      P.frame(x + 3, chipY, w - 6, 14, C.warnDim);
      if (state === 'RELOAD' && mount) {
        // The reload clock drawn as a fill INSIDE the chip: the chip is the progress
        // bar, so a feeding mount reads as a thing that is coming back.
        const total = mount.def.reload ?? AMMO_SPEC[mount.ammoClass]?.reload ?? 6;
        const k = 1 - THREE.MathUtils.clamp(mount.reloading / Math.max(0.001, total), 0, 1);
        P.fill(x + 4, chipY + 1, (w - 8) * k, 12, C.warnGhost);
      }
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'ok') {
      P.text('READY', x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else {
      P.hatch(x + 3, chipY, w - 6, 14, C.inkGhost, { spacing: 5, weight: 1 });
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.micro, color: C.inkFaint, align: 'center', track: TRACK.label,
      });
    }

    if (!mount) {
      // A passive module still has a condition and it still decides what the module
      // grants — `condition.grantMul` scales power output, shields, thrust and cargo.
      if (module && hp) {
        const cond = hp.module?.condition ?? 1;
        P.label('C', x + 3, y + 57, { color: C.inkGhost });
        P.bar(x + 14, y + 51, w - 20, 6, cond, {
          color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.inkGhost,
        });
        P.text(fmtPct(cond), x + w - 3, y + 72, { font: F.micro, color: C.inkFaint, align: 'right' });
        P.label('GRANTS ONLY', x + 3, y + 72, { color: C.inkGhost });
      }
      return;
    }

    // --- heat and condition -------------------------------------------------
    const th = mount.thermal;
    const barX = x + 14;
    const barW = w - 20;
    const heat = th ? th.heat : 0;
    P.label('H', x + 3, y + 51, { color: C.inkGhost });
    P.bar(barX, y + 45, barW, 7, heat, {
      color: heat > THERMAL.softCap ? C.warn : C.inkDim,
      track: C.inkGhost,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });

    const cond = mount.condition ?? 1;
    P.label('C', x + 3, y + 62, { color: C.inkGhost });
    P.bar(barX, y + 56, barW, 6, cond, {
      color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.inkGhost,
    });

    // --- stores -------------------------------------------------------------
    // Kinetic mounts print `ready/readyMax` and the magazine behind them; energy
    // mounts print the shared charge buffer. Two currencies, said in two ways.
    const cls = mount.ammoClass;
    if (cls) {
      const mag = player.stores ? player.stores.rounds(cls) : 0;
      const dry = mag <= 0 && mount.ready <= 0;
      P.text(`${mount.ready}/${mount.readyMax}`, x + 3, y + 76, {
        font: F.micro, color: dry ? C.warn : C.inkDim,
      });
      P.text(`MAG ${mag}`, x + w - 3, y + 76, {
        font: F.micro, color: dry ? C.warn : C.inkGhost, align: 'right',
      });
    } else {
      const chg = stores ? stores.charge / Math.max(1, stores.chargeMax) : 0;
      P.label('CHG', x + 3, y + 76, { color: C.inkGhost });
      P.bar(x + 28, y + 70, w - 34, 6, chg, {
        color: chg < 0.15 ? C.warn : C.inkDim, track: C.inkGhost,
      });
    }

    // --- persistent structural states ---------------------------------------
    // These survive underneath whatever the loud chip says. A frozen traverse ring is
    // permanent until it is repaired, and it changes how the ship must be flown, so it
    // may not be hidden by a transient RELOAD.
    let sx = x + 3;
    if (mount.parts?.traverseFrozen) {
      sx = P.chipOutline('FROZEN', sx, y + 81, { color: C.warn, h: 12, padX: 3 }) + 2;
    }
    if (cond < CONDITION.worn && cond >= CONDITION.inert) {
      sx = P.chipOutline('WORN', sx, y + 81, { color: C.inkFaint, h: 12, padX: 3 }) + 2;
    }
    if (th && th.trips > 0 && sx < x + w - 18) {
      P.chipOutline(`×${th.trips}`, sx, y + 81, { color: C.warnDim, h: 12, padX: 3 });
    }

    // --- sub-parts ----------------------------------------------------------
    // One square per part, in the layout's own order, carrying its kind letter. A
    // destroyed part is hatched and struck; a damaged one is partly filled from the
    // bottom. This is the readout the second-tier aim ring aims INTO.
    const parts = mount.parts?.list ?? [];
    const n = parts.length;
    if (n > 0) {
      const sq = Math.min(15, Math.floor((w - 6) / n) - 2);
      let px = x + 3;
      for (const part of parts) {
        const py = y + h - sq - 4;
        // The square fills from the bottom with the part's remaining health, so a
        // half-shot feed reads as half a square. A healthy part is a SOLID block —
        // the previous near-black fill made every live part look like an empty slot.
        P.fill(px, py, sq, sq, C.inkGhost);
        if (!part.destroyed && part.health > 0) {
          P.fill(px, py + sq * (1 - part.health), sq, sq * part.health,
            part.health < 0.5 ? C.warn : C.inkDim);
        }
        P.frame(px, py, sq, sq, part.destroyed ? C.warn : C.ruleDim);
        P.text(PART_LETTER[part.kind] ?? '?', px + sq * 0.5, py + sq - 3.5, {
          font: F.microBold,
          color: part.destroyed ? C.warn : part.health > 0.35 ? C.void : C.ink,
          align: 'center', track: TRACK.none,
        });
        if (part.destroyed) {
          P.hatch(px + 1, py + 1, sq - 2, sq - 2, C.warn, { spacing: 4, weight: 1 });
        }
        if (hit) {
          hit.push({
            kind: 'armament:part', panel: this.id, mount: cell.id, partId: part.id,
            x: px, y: py, w: sq, h: sq,
          });
        }
        px += sq + 2;
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
    P.label('DEVICES', x, y + 8, { color: C.inkFaint });
    P.label('PRESS 4-8', x, y + 22, { color: C.inkGhost });
    const rows = this._devicesFor(this.ui.time);
    if (!rows.length) {
      P.text('NONE REGISTERED', x + 62, y + 8, { font: F.micro, color: C.inkGhost, track: TRACK.label });
      return;
    }
    const slotW = Math.floor((w - 62) / rows.length);
    let sx = x + 62;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const usable = r.ready;
      const sy = y;
      const sh = h - 4;

      if (r.active) {
        P.fill(sx, sy, slotW - 3, sh, C.warnGhost);
        P.frame(sx, sy, slotW - 3, sh, C.warn);
      } else {
        P.frame(sx, sy, slotW - 3, sh, usable ? C.rule : C.ruleDim);
      }

      // The key cap, drawn as a chip so it reads as a thing you press. The reference
      // does exactly this: `E Open Cargo`, keycap first.
      P.chip(HOTBAR_KEYS[i], sx + 2, sy + 2, {
        fill: usable ? C.ink : C.inkGhost, color: C.void, h: 10, padX: 3, font: F.micro,
      });

      // Short name. Devices have long names and a narrow slot; the codex carries the
      // full one and the line below carries the reason it cannot fire.
      P.text(P.clip(shortName(r.name), F.micro, slotW - 52), sx + 18, sy + 10, {
        font: F.micro, color: usable ? C.ink : C.inkFaint, track: TRACK.label,
      });

      P.text(`×${r.count}`, sx + slotW - 9, sy + 10, {
        font: F.microBold, color: r.count > 0 ? C.ink : C.warn, align: 'right',
      });

      const sub = r.active ? `RUNNING ${r.remaining.toFixed(1)}s`
        : usable ? `${r.volume} m3 EACH` : (r.reason ?? '').toUpperCase();
      P.text(P.clip(sub, F.micro, slotW - 10), sx + 4, sy + sh - 3, {
        font: F.micro, color: r.active ? C.warn : usable ? C.inkGhost : C.warnDim, track: TRACK.label,
      });

      if (!usable && !r.active) P.hatch(sx, sy, slotW - 3, sh, C.inkGhost, { spacing: 6, weight: 1 });

      if (hit) {
        hit.push({ kind: 'armament:device', panel: this.id, itemId: r.id, x: sx, y: sy, w: slotW - 3, h: sh });
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

/** `Emergency Coolant Purge` → `COOLANT PURGE`. Drops the adjective, keeps the noun. */
const SHORT = {
  coolant_purge: 'COOLANT PURGE',
  decoy: 'DECOY',
  boarding_charge: 'BOARDING CHG',
  scan_pulse: 'SURVEY PULSE',
  jury_rig: 'JURY-RIG',
};
function shortName(name) {
  const s = String(name ?? '').toUpperCase();
  for (const k in SHORT) if (getItem(k)?.name?.toUpperCase() === s) return SHORT[k];
  return s;
}
