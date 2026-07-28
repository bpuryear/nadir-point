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

const CELL_W = 66;
const CELL_H = 96;
const THERM_W = 118;
const HOTBAR_H = 30;
const BODY_H = CELL_H + 8 + HOTBAR_H + 6 + 10;

const MOUNT_LABEL = {
  bow: 'BOW', dorsal: 'DORSAL', ventral: 'VENTRAL',
  port: 'PORT', starboard: 'STBD', engine: 'ENGINE',
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
    P.label(PART_LEGEND, x, y + CELL_H + 10, { color: C.inkGhost });

    P.hline(x, y + CELL_H + 15, w, C.ruleDim);
    this._drawHotbar(P, x, y + CELL_H + 22, w, HOTBAR_H, hit);
    void h;
  }

  // =========================================================================
  // Thermal — reference-ui-language.md §5, transcribed
  // =========================================================================

  _drawThermal(P, x, y, w, h, therm, stores) {
    P.label('THERMAL', x, y + 7, { color: C.inkFaint });

    if (!therm) {
      P.text('NO DATA', x, y + 22, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }

    const over = therm.state === 'OVERHEATED';
    const elevated = therm.state === 'ELEVATED';
    const stateCol = over ? C.warn : elevated ? C.ink : C.inkDim;

    // STATUS <WORD>. The word is the readout; the bar only says how far along it is.
    P.label('STATUS', x, y + 22, { color: C.inkGhost });
    if (over) {
      // A trip is the one state in this panel that is allowed to pulse. It costs the
      // player a mount and structural HP on the hardpoint, and it is recoverable —
      // which makes it exactly the case a static readout under-sells.
      const pulse = 0.75 + 0.25 * Math.sin(P.t * 6.0);
      P.ctx.globalAlpha = pulse;
      P.chip(therm.state, x + 34, y + 12, { fill: C.warn, color: C.void, h: 13 });
      P.ctx.globalAlpha = 1;
    } else {
      P.text(therm.state, x + 34, y + 22, { font: F.bodyBold, color: stateCol, track: TRACK.label });
    }

    // EXT, over its ceiling. The reference prints both halves and so do we: a figure
    // with no ceiling beside it is not a measurement.
    P.label('EXT', x, y + 36, { color: C.inkGhost });
    P.text(`${therm.ext.toFixed(1)} / ${therm.extMax.toFixed(1)}`, x + 34, y + 36, {
      font: F.small, color: over ? C.warn : C.ink,
    });

    // The large vertical bar, with the soft cap marked. Above the soft cap dispersion
    // widens — the player has to have SEEN that line before it costs them a shot.
    const barX = x + w - 22;
    const barY = y + 4;
    const barH = h - 22;
    P.vbar(barX, barY, 16, barH, therm.peak, {
      color: over ? C.warn : elevated ? C.ink : C.inkDim,
      track: C.inkGhost,
      segments: 8,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });
    P.frame(barX, barY, 16, barH, C.ruleDim);
    P.label('PEAK', barX + 8, y + h - 4, { color: C.inkGhost, align: 'center' });

    // Signed rate. `0.12/s` in the reference; ours is a percentage of capacity per
    // second, which is the number that tells you whether you are winning the race.
    const rate = therm.rate * 100;
    const rising = rate > 0.05;
    P.label('RATE', x, y + 50, { color: C.inkGhost });
    P.text(`${rising ? '+' : rate < -0.05 ? '−' : ' '}${Math.abs(rate).toFixed(1)}%/s`, x + 34, y + 50, {
      font: F.small, color: rising ? C.warn : C.inkDim,
    });

    P.label('LOAD', x, y + 62, { color: C.inkGhost });
    P.bar(x + 34, y + 56, 40, 5, therm.load, { color: C.inkDim, track: C.inkGhost, segments: 4 });
    P.label('RAD', x, y + 74, { color: C.inkGhost });
    P.bar(x + 34, y + 68, 40, 5, therm.radiate, { color: C.inkDim, track: C.inkGhost, segments: 4 });

    // Coolant purges. Small, finite, and the thing you press when the bar is climbing.
    const coolant = stores ? stores.coolant : therm.coolant;
    const coolantMax = Math.max(1, stores ? stores.coolantMax : therm.coolantMax);
    P.label('PURGE', x, y + 88, { color: C.inkGhost });
    P.pips(x + 34, y + 82, coolantMax, coolant, {
      size: 6, gap: 3, color: coolant > 0 ? C.ink : C.inkGhost, empty: C.inkGhost,
    });
    if (therm.tripped > 0) {
      P.text(`${therm.tripped} TRIPPED`, x + w, y + 88, {
        font: F.microBold, color: C.warn, align: 'right', track: TRACK.label,
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
      P.fill(x + 3, y + 12, 2, 9, hp?.breached ? C.warnDim : fi.stripe);
      P.text(P.clip((module.name ?? '').toUpperCase(), F.micro, w - 12), x + 8, y + 20,
        { font: F.micro, color: hp?.breached ? C.warnDim : C.inkDim, track: TRACK.value });
    } else {
      P.text('— NO MODULE —', x + 3, y + 20, { font: F.micro, color: C.inkGhost, track: TRACK.label });
    }

    // --- the state chip ----------------------------------------------------
    const chipY = y + 24;
    if (spec.tone === 'alarm') {
      let label = state;
      if (state === 'COOKED' && mount?.thermal?.tripRemaining > 0) {
        label = `COOKED ${mount.thermal.tripRemaining.toFixed(1)}`;
      }
      P.chip(label, x + 3, chipY, { fill: C.warn, color: C.void, h: 13, minW: w - 6 });
    } else if (spec.tone === 'warn') {
      P.frame(x + 3, chipY, w - 6, 13, C.warnDim);
      if (state === 'RELOAD' && mount) {
        // The reload clock drawn as a fill INSIDE the chip: the chip is the progress
        // bar, so a feeding mount reads as a thing that is coming back.
        const total = mount.def.reload ?? AMMO_SPEC[mount.ammoClass]?.reload ?? 6;
        const k = 1 - THREE.MathUtils.clamp(mount.reloading / Math.max(0.001, total), 0, 1);
        P.fill(x + 4, chipY + 1, (w - 8) * k, 11, C.warnGhost);
      }
      P.text(state, x + w * 0.5, chipY + 10, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'ok') {
      P.text('READY', x + w * 0.5, chipY + 10, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else {
      P.hatch(x + 3, chipY, w - 6, 13, C.inkGhost, { spacing: 5, weight: 1 });
      P.text(state, x + w * 0.5, chipY + 10, {
        font: F.micro, color: C.inkFaint, align: 'center', track: TRACK.label,
      });
    }

    if (!mount) {
      // A passive module still has a condition and it still decides what the module
      // grants — `condition.grantMul` scales power output, shields, thrust and cargo.
      if (module && hp) {
        const cond = hp.module?.condition ?? 1;
        P.label('C', x + 3, y + 53, { color: C.inkGhost });
        P.bar(x + 12, y + 47, w - 18, 5, cond, {
          color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.inkGhost,
        });
        P.text(fmtPct(cond), x + w - 3, y + 64, { font: F.micro, color: C.inkFaint, align: 'right' });
      }
      return;
    }

    // --- heat and condition -------------------------------------------------
    const th = mount.thermal;
    const barX = x + 12;
    const barW = w - 18;
    const heat = th ? th.heat : 0;
    P.label('H', x + 3, y + 46, { color: C.inkGhost });
    P.bar(barX, y + 40, barW, 6, heat, {
      color: heat > THERMAL.softCap ? C.warn : C.inkDim,
      track: C.inkGhost,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });

    const cond = mount.condition ?? 1;
    P.label('C', x + 3, y + 55, { color: C.inkGhost });
    P.bar(barX, y + 50, barW, 5, cond, {
      color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.inkGhost,
    });

    // --- stores -------------------------------------------------------------
    // Kinetic mounts print `ready/readyMax` and the magazine behind them; energy
    // mounts print the shared charge buffer. Two currencies, said in two ways.
    const cls = mount.ammoClass;
    if (cls) {
      const mag = player.stores ? player.stores.rounds(cls) : 0;
      const dry = mag <= 0 && mount.ready <= 0;
      P.text(`${mount.ready}/${mount.readyMax}`, x + 3, y + 66, {
        font: F.micro, color: dry ? C.warn : C.inkDim,
      });
      P.text(String(mag), x + w - 3, y + 66, {
        font: F.micro, color: dry ? C.warn : C.inkGhost, align: 'right',
      });
    } else {
      const chg = stores ? stores.charge / Math.max(1, stores.chargeMax) : 0;
      P.label('CHG', x + 3, y + 66, { color: C.inkGhost });
      P.bar(barX + 10, y + 61, barW - 10, 5, chg, {
        color: chg < 0.15 ? C.warn : C.inkDim, track: C.inkGhost,
      });
    }

    // --- persistent structural states ---------------------------------------
    // These survive underneath whatever the loud chip says. A frozen traverse ring is
    // permanent until it is repaired, and it changes how the ship must be flown, so it
    // may not be hidden by a transient RELOAD.
    let sx = x + 3;
    if (mount.parts?.traverseFrozen) {
      sx = P.chipOutline('FROZEN', sx, y + 70, { color: C.warn, h: 11, padX: 3 }) + 2;
    }
    if (cond < CONDITION.worn && cond >= CONDITION.inert) {
      sx = P.chipOutline('WORN', sx, y + 70, { color: C.inkFaint, h: 11, padX: 3 }) + 2;
    }
    if (th && th.trips > 0 && sx < x + w - 16) {
      P.chipOutline(`×${th.trips}`, sx, y + 70, { color: C.warnDim, h: 11, padX: 3 });
    }

    // --- sub-parts ----------------------------------------------------------
    // One square per part, in the layout's own order, carrying its kind letter. A
    // destroyed part is hatched and struck; a damaged one is partly filled from the
    // bottom. This is the readout the second-tier aim ring aims INTO.
    const parts = mount.parts?.list ?? [];
    const n = parts.length;
    if (n > 0) {
      const sq = Math.min(12, Math.floor((w - 6) / n) - 2);
      let px = x + 3;
      for (const part of parts) {
        const py = y + h - sq - 3;
        P.fill(px, py, sq, sq, C.inkGhost);
        if (!part.destroyed && part.health > 0) {
          P.fill(px, py + sq * (1 - part.health), sq, sq * part.health,
            part.health < 0.5 ? C.warnGhost : C.scrimSoft);
        }
        P.frame(px, py, sq, sq, part.destroyed ? C.warn : C.ruleDim);
        P.text(PART_LETTER[part.kind] ?? '?', px + sq * 0.5, py + sq - 2.5, {
          font: F.micro, color: part.destroyed ? C.warn : part.health < 0.5 ? C.ink : C.inkFaint,
          align: 'center', track: TRACK.none,
        });
        if (part.destroyed) {
          P.leader(px + 1, py + 1, px + sq - 1, py + sq - 1, C.warn, 1);
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
    P.label('DEVICES', x, y - 2, { color: C.inkFaint });
    const rows = this._devicesFor(this.ui.time);
    if (!rows.length) {
      P.text('NONE REGISTERED', x + 60, y - 2, { font: F.micro, color: C.inkGhost, track: TRACK.label });
      return;
    }
    const slotW = Math.floor((w - 58) / rows.length);
    let sx = x + 58;
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

      // Short name. Devices have long names and a 90 px slot; the codex carries the
      // full one and the tooltip line below carries the reason it cannot fire.
      P.text(P.clip(shortName(r.name), F.micro, slotW - 30), sx + 18, sy + 10, {
        font: F.micro, color: usable ? C.ink : C.inkFaint, track: TRACK.label,
      });

      P.text(`×${r.count}`, sx + slotW - 6, sy + 10, {
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
