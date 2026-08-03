/**
 * THE SORTIE WINDOW — the largest "a system the player cannot read" in the build.
 *
 * FOUR REGISTERED, LIVE SYSTEMS HAD ZERO REFERENCES ANYWHERE IN `src/ui`. Verified by
 * grep before this file existed: `sortie`, `refitGate`, `derelict` and `persistence`
 * are all installed at `src/sim/meta/index.js:72-75` off `src/game.js`, and eleven MEV
 * events — DOCKED, UNDOCKED, SORTIE_STARTED, SORTIE_ENDED, SERVICE_USED, DEBT_CHANGED,
 * LEDGER_CHANGED, ESCALATION, PLAYER_CRIPPLED, PLAYER_RECOVERED, WRECKSITE_MARKED —
 * were emitted with not one listener in this stream.
 *
 * That includes the mechanic `docs/design/look-target.md` §3 is proudest of: being
 * crippled EJECTS YOUR INSTALLED MODULES at the site, they stay there across sessions,
 * and going back for your own guns becomes its own sortie. `derelict.sites()`,
 * `derelict.reachability()`, `derelict.status()`, `sortie.live()`, `sortie.debrief()`
 * and `refitGate.status()` were every one of them written as READ APIs for a UI that
 * was never built. `docs/design/scope-decision.md:58` is unambiguous about what that
 * is: "Hidden state that changes outcomes is a bug, not depth." A materials debt, a
 * gated refit and a drifting wreck full of your own guns all change outcomes.
 *
 * FOUR SECTIONS, in the house idiom, in the order a player asks the questions:
 *
 *   STATE      how far into this sortie you are, in the two units that actually end it
 *              — the tank and the hold. `sortie.live()` names the limiter itself.
 *   LEDGER     what the last one earned and what it cost, plus the debt.
 *   REFIT      whether a swap is field-only right now, and the live job's clock.
 *   WRECKSITES every place you have left hardware, nearest first, with the range and
 *              relative bearing off the bow — the same WHERE vocabulary objectives.js
 *              uses, because the answer wanted is "turn to port 40° and burn 12 km",
 *              not a name to go and find on a map.
 *
 * KEY `B`. Free on this commit, checked against BOTH binding files rather than against
 * `docs/design/controls.md`, which lists B as taken and is wrong — see FREE_KEYS in
 * `./index.js`.
 */

import { angleDelta, yawOf } from '../sim/physics.js';
import { MEV } from '../sim/meta/events.js';
import { C, F, TRACK, fmtRange, factionInk } from './theme.js';
import { Panel, PAD, fmtClock, columns, columnHead, cell } from './panels.js';

/** Refresh rate for the read APIs that allocate. `debrief()` builds a fresh object. */
const SLOW_HZ = 2;

export class SortiePanel extends Panel {
  constructor(ui) {
    super({
      id: 'sortie',
      title: 'SORTIE · ATTENTION · LEDGER · WRECKSITES',
      hint: 'B',
      w: 520,
      h: 470,
      maxH: 640,
    });
    this.ui = ui;
    this.world = ui.world;
    this._debrief = null;
    this._sites = [];
    this._reach = null;
    this._at = -1;
    this._dirty = true;
    const bus = ui.bus;
    const touch = () => { this._dirty = true; };
    this._offs = [
      bus.on(MEV.SORTIE_STARTED, touch),
      bus.on(MEV.SORTIE_ENDED, touch),
      bus.on(MEV.DOCKED, touch),
      bus.on(MEV.UNDOCKED, touch),
      bus.on(MEV.DEBT_CHANGED, touch),
      bus.on(MEV.LEDGER_CHANGED, touch),
      bus.on(MEV.WRECKSITE_MARKED, touch),
      bus.on(MEV.PLAYER_CRIPPLED, touch),
      bus.on(MEV.PLAYER_RECOVERED, touch),
    ];
  }

  onOpen() { this._dirty = true; }
  dispose() { for (const o of this._offs) o?.(); this._offs.length = 0; }

  /**
   * The allocating reads, at 2 Hz. `debrief()` builds a fresh object with four nested
   * ones and `sites()` maps an array; `live()` and `status()` are cached by the sim and
   * are safe every frame. Drawing at 60 Hz through the allocating pair would put four
   * objects per frame on the render path for numbers that change once a minute.
   */
  _slow(now) {
    if (!this._dirty && now - this._at < 1 / SLOW_HZ) return;
    this._at = now;
    this._dirty = false;
    const sortie = this.world.systems?.sortie ?? null;
    const derelict = this.world.systems?.derelict ?? null;
    this._debrief = sortie?.lastDebrief?.() ?? null;
    this._sites = derelict?.sites?.() ?? [];
    this._reach = derelict?.reachability?.() ?? null;
  }

  drawBody(P, x, y, w, h, hit, clip) {
    const sortie = this.world.systems?.sortie ?? null;
    const derelict = this.world.systems?.derelict ?? null;
    const gate = this.world.systems?.refitGate ?? null;
    if (!sortie && !derelict && !gate) {
      P.text('NO SORTIE LAYER INSTALLED', x, y + 14,
        { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }
    this._slow(this.ui.time);

    let cy = y + 8;
    cy = this._drawState(P, x, cy, w, sortie, derelict);
    cy = this._drawAttention(P, x, cy, w);
    cy = this._drawLedger(P, x, cy, w, sortie, derelict);
    cy = this._drawRefit(P, x, cy, w, gate);
    cy = this._drawSites(P, x, cy, w, clip);

    this.scrollMax = Math.max(0, (cy + 10) - y - (this.bodyH - PAD * 2));
    void h;
    void hit;
  }

  // =========================================================================

  _drawState(P, x, y, w, sortie, derelict) {
    let cy = y;
    P.label('STATE', x, cy, { color: C.inkFaint });
    P.hline(x, cy + 4, w, C.rule);
    cy += 18;

    if (!sortie) {
      P.struck('NO SORTIE LEDGER', x, cy, { font: F.small, color: C.inkFaint });
      return cy + 20;
    }
    const live = sortie.live();

    // Docked or under way, and how long. The elapsed clock is the one number that
    // makes a run feel like a run.
    P.chip(live.docked ? 'DOCKED' : `SORTIE ${live.index}`, x, cy - 10, {
      fill: live.docked ? C.track : C.ink, color: live.docked ? C.inkDim : C.void, h: 13,
    });
    P.text(fmtClock(live.seconds), x + w, cy, { font: F.bodyBold, color: C.ink, align: 'right' });
    P.label('ELAPSED', x + w - P.measure('00:00', F.bodyBold, TRACK.value) - 12, cy,
      { color: C.inkFaint, align: 'right' });
    cy += 16;

    P.label('CUT', x, cy, { color: C.inkFaint });
    P.text(`${live.sections} SECTIONS · ${live.modules} PARTS`, x + 44, cy,
      { font: F.small, color: C.inkDim, track: TRACK.label });
    cy += 16;

    /**
     * THE TWO CLOCKS, AND WHICH ONE IS ACTUALLY RUNNING.
     *
     * `sortie.live()` computes the limiter itself — whichever of range-remaining and
     * hold-remaining is closer to ending the run — so the panel does not get to have
     * its own opinion about it. Printing both bars without naming the limiter is the
     * failure this readout exists to avoid: the player reads two three-quarter-full
     * bars and cannot tell which one is going to stop them.
     */
    const barW = Math.max(60, w - 190);
    const rangeLimits = live.limiter === 'PROPELLANT';
    P.label('RANGE', x, cy, { color: rangeLimits ? C.inkDim : C.inkFaint });
    P.bar(x + 52, cy - 7, barW, 7, live.rangeFraction, {
      color: rangeLimits ? C.warn : C.inkDim, track: C.track, segments: 8,
    });
    P.text(`${live.rangeKm.toFixed(0)} KM`, x + w, cy,
      { font: F.bodyBold, color: rangeLimits ? C.warn : C.inkDim, align: 'right' });
    cy += 15;
    P.label('HOLD', x, cy, { color: rangeLimits ? C.inkFaint : C.inkDim });
    P.bar(x + 52, cy - 7, barW, 7, live.holdFraction, {
      color: rangeLimits ? C.inkDim : C.warn, track: C.track, segments: 8,
    });
    P.text(`${Math.round(live.holdFraction * 100)}%`, x + w, cy,
      { font: F.bodyBold, color: rangeLimits ? C.inkDim : C.warn, align: 'right' });
    cy += 16;
    P.label('LIMITER', x, cy, { color: C.inkFaint });
    P.chip(live.limiter, x + 52, cy - 10, { fill: C.warn, color: C.void, h: 13 });
    P.label(`${live.perKm.toFixed(2)} / KM AT THE CURRENT TRAVEL MODE`, x + 130, cy,
      { color: C.inkFaint, maxW: w - 130 });
    cy += 18;

    // Adrift. The one state in this panel that is happening TO the player.
    const drift = derelict?.status?.();
    if (drift) {
      P.fill(x - 4, cy - 12, w + 8, 32, C.scrimHard);
      P.frame(x - 4, cy - 12, w + 8, 32, C.warnDim);
      P.text(`ADRIFT — TENDER IN ${Math.ceil(drift.remaining)} S`, x + 4, cy,
        { font: F.microBold, color: C.warn, track: TRACK.head });
      P.text(`${String(drift.toName ?? 'NEAREST BERTH').toUpperCase()} · TOW ${Math.round(drift.bill?.alloy ?? drift.bill ?? 0)} ALLOY`,
        x + 4, cy + 13, { font: F.micro, color: C.inkDim, track: TRACK.label, maxW: w - 8 });
      cy += 36;
    } else if (this._reach && !this._reach.reachable) {
      // Stranded is not the same as adrift, and it is worse: nothing has happened yet.
      P.struck(`STRANDED — NOTHING IN ${this._reach.rangeKm.toFixed(0)} KM WILL TAKE YOU`,
        x, cy, { font: F.small, color: C.warn });
      cy += 18;
    }
    return cy + 6;
  }

  // =========================================================================

  /**
   * THE ATTENTION LEDGER, IN FULL.
   *
   * The welded block in `hud.js#_drawAttention` carries the live figure and the one word
   * that says whether it is falling, because that is all a 168 px strip can afford and
   * all a player mid-cut can read. This is where the system is LEARNED: both factions
   * whether or not they have a claim, the rung the claim is heading for, and — the part
   * the welded block cannot fit — the two halves of the spatial decision stated as
   * numbers rather than as a state word.
   *
   *   HELD is not "decay is off". It is "you are standing in the field you cut, and the
   *   moment you leave it this claim starts falling at `awayDecay` a second". So the row
   *   prints what leaving would buy, WHILE the claim is pinned, which is when the player
   *   is deciding whether to cut one more section.
   *
   *   Their space is a multiplier, not a place. `theirSpace` is the faction's control
   *   share where the player is standing, and `awayDecay` already has it folded in —
   *   0.55/s at full control of the ground under you, up to 1.65/s outside it entirely.
   *   Printing the share next to the rate is what makes "burn for neutral space" a move
   *   the player can choose rather than one they discover.
   *
   * Both factions always, even at zero: `docs/design/scope-decision.md` §4 is about
   * whether the player CAN see the state, and a section that appears only once you are
   * already being hunted teaches nothing before the fact. A zero row is one struck line.
   */
  _drawAttention(P, x, y, w) {
    let cy = y;
    P.label('ATTENTION', x, cy, { color: C.inkFaint });
    P.label('WHAT THEY WILL SEND', x + w, cy, { color: C.inkFaint, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 18;

    const rows = this.ui.ledger;
    if (!rows || !rows.length) {
      P.struck('NO FACTION WAR INSTALLED', x, cy, { font: F.small, color: C.inkFaint });
      return cy + 20;
    }

    const barW = Math.max(60, w - 190);
    for (const r of rows) {
      const fi = factionInk(r.faction);
      const hot = r.inField > 0;
      const warned = this.ui.warnedOf(r.faction);
      const key = hot ? C.hostile : warned ? C.warn : C.ink;

      P.fill(x - 6, cy - 9, 2, 40, fi.stripe);
      P.label(fi.name, x, cy, { color: fi.dim });
      if (r.tier) {
        // The rung they have ALREADY answered. A player who has taken a tender and shed
        // the claim still has that on their record, and the next rung is the picket.
        P.chip(String(r.tier).toUpperCase(), x + 76, cy - 10, {
          fill: C.warn, color: C.void, h: 13,
        });
      }
      P.text(r.nextAt ? `${Math.round(r.claim)} / ${r.nextAt}` : `${Math.round(r.claim)}`,
        x + w, cy, { font: F.bodyBold, color: key, align: 'right' });
      cy += 15;

      P.label(r.next ? `→ ${r.next}` : '→ ALL OUT', x, cy, { color: C.inkFaint });
      P.bar(x + 92, cy - 7, barW, 7, r.nextAt ? r.claim / r.nextAt : 1, {
        color: hot ? C.hostile : warned ? C.warn : C.salvage, track: C.track, segments: 4,
      });
      P.text(hot ? `${r.inField} IN FIELD` : warned ? 'WARNED' : 'QUIET', x + w, cy, {
        font: F.micro, color: hot ? C.hostile : warned ? C.warn : C.inkFaint,
        align: 'right', track: TRACK.label, maxW: 90,
      });
      cy += 15;

      // The spatial decision, as the two numbers it is actually made of.
      if (r.holding) {
        P.text(`HELD AT ${String(r.holdingAt ?? 'THIS FIELD').toUpperCase()}`
          + ` — LEAVING SHEDS ${r.awayDecay.toFixed(2)}/S`,
        x, cy, { font: F.micro, color: C.warn, track: TRACK.label, maxW: w });
      } else {
        const clear = r.decayPerSecond > 0 ? Math.ceil(r.claim / r.decayPerSecond) : 0;
        P.text(`SHEDDING ${r.decayPerSecond.toFixed(2)}/S · CLEAR IN ${clear} S`,
          x, cy, { font: F.micro, color: C.inkDim, track: TRACK.label, maxW: w });
      }
      cy += 13;

      P.label(`THEIR GROUND ${Math.round(r.theirSpace * 100)}%`, x, cy, { color: C.inkFaint });
      P.label(r.cooldown > 0 ? `NEXT NO SOONER THAN ${Math.ceil(r.cooldown)} S` : 'READY TO ANSWER',
        x + w, cy, { color: C.inkFaint, align: 'right' });
      cy += 18;
    }
    return cy + 2;
  }

  // =========================================================================

  _drawLedger(P, x, y, w, sortie, derelict) {
    let cy = y;
    P.label('LEDGER', x, cy, { color: C.inkFaint });
    P.label('LAST SORTIE', x + w, cy, { color: C.inkFaint, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 18;

    const debt = sortie?.debt ?? 0;
    if (debt > 0) {
      P.label('BORROWED', x, cy, { color: C.warnDim });
      P.text(`${Math.round(debt)} REFINED`, x + w, cy,
        { font: F.bodyBold, color: C.warn, align: 'right' });
      cy += 15;
    }

    const d = this._debrief;
    if (!d) {
      P.struck('NO SORTIE CLOSED YET', x, cy, { font: F.small, color: C.inkFaint });
      cy += 18;
    } else {
      const net = d.economy.net;
      const rows = [
        ['DURATION', fmtClock(d.seconds)],
        ['CUT', `${d.cut.sections} SECTIONS · ${d.cut.modules} PARTS`],
        ['REFINED', `${Math.round(d.economy.refinedUnits)}`],
        ['NET', `${net >= 0 ? '+' : '−'}${Math.abs(Math.round(net))}`],
        ['PROPELLANT', `${d.movement.propellantBurned.toFixed(0)} OVER ${d.movement.km.toFixed(0)} KM`],
      ];
      for (const [k, v] of rows) {
        P.label(k, x, cy, { color: C.inkFaint });
        P.text(v, x + w, cy, {
          font: F.small,
          color: k === 'NET' ? (net < 0 ? C.warn : C.friendly) : C.inkDim,
          align: 'right', maxW: w - 90,
        });
        cy += 13;
      }
      if (d.cut.best) {
        P.label('BEST PART', x, cy, { color: C.inkFaint });
        P.text(String(d.cut.best.name ?? '').toUpperCase(), x + 76, cy,
          { font: F.small, color: C.ink, track: TRACK.label, maxW: w - 80 });
        cy += 13;
      }
      if (d.cost.crippled) {
        P.struck('CRIPPLED — MODULES LEFT AT THE SITE', x, cy + 2,
          { font: F.micro, color: C.warn });
        cy += 14;
      }
    }

    // The tow quote, priced now rather than after the fact.
    const quote = derelict && typeof derelict._quoteTow === 'function' && this.world.player
      ? derelict._quoteTow(this.world.player.position.x, this.world.player.position.z)
      : null;
    if (quote) {
      P.label('TOW FROM HERE', x, cy + 2, { color: C.inkFaint });
      P.text(`${Math.round(quote.alloy ?? 0)} ALLOY · ${String(quote.name ?? '—').toUpperCase()}`,
        x + w, cy + 2, {
          font: F.micro, color: quote.hostile ? C.warnDim : C.inkDim,
          align: 'right', maxW: w - 120,
        });
      cy += 16;
    }
    return cy + 8;
  }

  // =========================================================================

  _drawRefit(P, x, y, w, gate) {
    let cy = y;
    P.label('REFIT', x, cy, { color: C.inkFaint });
    P.hline(x, cy + 4, w, C.rule);
    cy += 18;
    if (!gate) {
      P.struck('NO REFIT GATE', x, cy, { font: F.small, color: C.inkFaint });
      return cy + 20;
    }
    const st = gate.status();
    P.label('WHERE', x, cy, { color: C.inkFaint });
    P.text(String(st.where ?? '—').toUpperCase(), x + 52, cy,
      { font: F.small, color: C.ink, track: TRACK.label, maxW: w - 60 });
    cy += 15;

    // FIELD SWAP ONLY is the whole cost of the gate, and it was invisible.
    if (!st.docked) {
      P.struck('FIELD SWAP ONLY — ANCHORAGE FOR FULL REFIT', x, cy,
        { font: F.micro, color: C.warnDim });
      cy += 15;
    }
    if (st.heavy) {
      P.label('HEAVY WORK', x, cy, { color: C.inkFaint });
      P.text('AVAILABLE HERE', x + 76, cy, { font: F.micro, color: C.friendly, track: TRACK.label });
      cy += 15;
    }

    // The live job. `refitGate.js:250-252` says "pending is the field that tells the
    // truth"; this is the only place in the interface that draws that truth as a clock.
    if (st.job) {
      const frac = st.job.total > 0 ? 1 - st.job.remaining / st.job.total : 0;
      P.label('IN PROGRESS', x, cy, { color: C.inkDim });
      P.text(String(st.job.label ?? '').toUpperCase(), x + 84, cy,
        { font: F.small, color: C.ink, track: TRACK.label, maxW: w - 160 });
      P.text(`${st.job.remaining.toFixed(1)} S`, x + w, cy,
        { font: F.bodyBold, color: C.warn, align: 'right' });
      cy += 8;
      P.bar(x, cy, w, 7, frac, { color: C.warn, track: C.track, segments: 10 });
      cy += 18;
    }
    return cy + 6;
  }

  // =========================================================================

  _drawSites(P, x, y, w, clip) {
    let cy = y;
    const sites = this._sites;
    P.label('WRECKSITES', x, cy, { color: C.inkFaint });
    P.label('YOUR OWN HARDWARE, LEFT WHERE YOU FELL', x + w, cy,
      { color: C.inkFaint, align: 'right' });
    P.hline(x, cy + 4, w, C.rule);
    cy += 16;

    if (!sites.length) {
      P.struck('NOTHING LEFT BEHIND', x, cy + 6, { font: F.small, color: C.inkFaint });
      return cy + 24;
    }

    const cols = columns(P, [
      { key: 'name', label: 'SITE', flex: true },
      { key: 'mods', label: 'PARTS', items: ['4 PARTS'], align: 'right' },
      { key: 'range', label: 'RANGE', items: ['999.9 KM'], align: 'right' },
      { key: 'bear', label: 'BEARING', items: ['DEAD AHEAD'], align: 'right' },
    ], w);
    cy = columnHead(P, cols, [
      { key: 'name' }, { key: 'mods' }, { key: 'range' }, { key: 'bear' },
    ], x, cy, w) + 12;

    const player = this.world.player;
    for (const s of sites) {
      if (cy > clip.clipBottom) { this.hidden++; cy += 24; continue; }
      const label = s.modules.length
        ? String(s.modules[0].name ?? 'YOUR LOADOUT').toUpperCase()
        : 'MARKED SITE';
      cell(P, cols, 'name', x, cy, label, { color: C.ink, track: TRACK.label });
      cell(P, cols, 'mods', x, cy, `${s.modules.length} PARTS`,
        { color: s.modules.length ? C.salvage : C.inkFaint });
      cell(P, cols, 'range', x, cy, `${s.km.toFixed(1)} KM`, { color: C.inkDim });
      if (player) {
        const dx = s.x - player.position.x;
        const dz = s.z - player.position.z;
        const rel = angleDelta(player.heading, yawOf(dx, dz));
        const deg = Math.round((Math.abs(rel) * 180) / Math.PI);
        // Verbatim from objectives.js:162-171. One WHERE vocabulary, not two.
        cell(P, cols, 'bear', x, cy, deg < 3 ? 'DEAD AHEAD' : `${rel > 0 ? 'PORT' : 'STBD'} ${deg}°`,
          { color: C.inkFaint, font: F.micro, track: TRACK.label });
      }
      cy += 12;
      // What is actually sitting there. This is the line the mechanic exists for.
      const names = s.modules.slice(0, 3).map((m) => String(m.name ?? '').toUpperCase()).join(' · ');
      if (names) {
        P.text(P.clip(names, F.micro, w - 4), x + 8, cy,
          { font: F.micro, color: C.salvageDim, track: TRACK.label });
      }
      if (s.live) P.chip('IN SIGHT', x + w, cy - 10, { fill: C.salvage, color: C.void, h: 12, align: 'right' });
      cy += 14;
    }
    return cy;
  }
}
