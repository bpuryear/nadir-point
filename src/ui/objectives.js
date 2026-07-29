/**
 * OBJECTIVES — what the world is asking of you, where, and the clock.
 *
 * `sim/meta/objectives.js` is careful about what it is not: there is no contract
 * terminal, no giver, no accept button. An objective is a READING of the faction war
 * that is already running — a place the simulation has made interesting, the clock the
 * simulation is already counting down, and what showing up is worth at each point on
 * that clock. If the player never opens this panel the payouts still land, because the
 * trigger is being there.
 *
 * Which is exactly why the panel has to exist. A reward that changes by 1.75× / 1.25× /
 * 0.55× depending on when you arrive is the single steepest decision in the game, and
 * until it is drawn the player cannot make it — they arrive whenever they arrive and
 * are paid a number they cannot account for. `docs/design/scope-decision.md` test four:
 * hidden state that changes outcomes is a bug.
 *
 * So THE ARRIVAL FORK IS THE PANEL. Every intercept row draws all three tiers with
 * their multipliers, marks which one you are currently standing in, and locks the mark
 * once you have arrived — because after arrival the tier is stamped and the row stops
 * being a choice and starts being a receipt.
 *
 * WHERE is answered in the interface's existing spatial vocabulary: a range and a
 * relative bearing off the bow, so the answer is "turn to port 40° and burn 12 km",
 * not a name the player has to go and find on a map.
 */

import { angleDelta, yawOf } from '../sim/physics.js';
import { ARRIVAL_TIERS } from '../sim/meta/objectives.js';
import { MEV } from '../sim/meta/events.js';
import { C, F, TRACK, fmtRange } from './theme.js';
import { Panel, PAD, fmtClock } from './panels.js';

const KIND_NOTE = {
  intercept: 'BE THERE BEFORE THE SHOOTING STOPS',
  strip: 'CUT IT BEFORE THE TENDERS DO',
  blockade: 'BREAK HULLS OF ONE FACTION, HERE',
  prospect: 'GO AND LOOK. QUIET, FOR NOW',
};

export class ObjectivesPanel extends Panel {
  constructor(ui) {
    super({
      id: 'objectives',
      title: 'OBJECTIVES',
      hint: 'J',
      w: 540,
      h: 460,
      maxH: 620,
    });
    this.ui = ui;
    this.world = ui.world;
    this._rows = [];
    this._at = -1;
    this._dirty = true;
    this._offs = [
      ui.bus.on(MEV.OBJECTIVE_OPENED, () => { this._dirty = true; }),
      ui.bus.on(MEV.OBJECTIVE_CLOSED, () => { this._dirty = true; }),
      ui.bus.on(MEV.OBJECTIVE_PROGRESS, () => { this._dirty = true; }),
    ];
  }

  onOpen() { this._dirty = true; }
  dispose() { for (const o of this._offs) o?.(); }

  _data(now) {
    const sys = this.world.systems?.objectives;
    if (!sys) return null;
    // `describe()` allocates a row and two cost objects per objective, and the clocks
    // inside it move every step, so it is refreshed twice a second: fast enough that a
    // countdown reads as a countdown, slow enough to cost nothing.
    if (!this._dirty && now - this._at < 0.5) return this._rows;
    this._at = now;
    this._dirty = false;
    this._rows = sys.describe();
    return this._rows;
  }

  drawBody(P, x, y, w, h, hit, clip) {
    const sys = this.world.systems?.objectives;
    if (!sys) {
      P.text('NO WAR TO READ', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }
    const rows = this._data(this.ui.time);
    const player = this.world.player;

    let cy = y + 8;
    P.label('OPEN', x, cy, { color: C.inkFaint });
    P.text(String(rows.length), x + 42, cy, { font: F.bodyBold, color: C.ink });
    P.label('READ OFF THE WAR · IGNORING THEM COSTS ONLY PAY', x + 62, cy, { color: C.inkFaint });
    P.hline(x, cy + 5, w, C.rule);
    cy += 18;

    if (!rows.length) {
      P.text('NOTHING OPEN', x, cy + 6, { font: F.small, color: C.inkFaint, track: TRACK.label });
      P.text('THE WAR WILL MAKE SOMEWHERE INTERESTING SHORTLY', x, cy + 20,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
      cy += 40;
    }

    for (const o of rows) {
      const rowH = rowHeight(o);
      if (cy + rowH > clip.clipBottom) { this.hidden++; cy += rowH + 6; continue; }
      if (cy + rowH < clip.clipTop) { cy += rowH + 6; continue; }
      cy = this._drawRow(P, x, cy, w, o, player, hit) + 6;
    }

    // --- what you left on the table -----------------------------------------
    const log = sys.log;
    if (log?.length) {
      P.hline(x, cy, w, C.rule);
      cy += 14;
      P.label('CLOSED', x, cy, { color: C.inkFaint });
      cy += 14;
      for (let i = log.length - 1; i >= 0 && i > log.length - 7; i--) {
        const e = log[i];
        const good = e.outcome === 'complete';
        P.label(e.kind, x, cy, { color: C.inkFaint });
        P.text(String(e.poiName).toUpperCase(), x + 66, cy,
          { font: F.micro, color: C.inkFaint, maxW: 150 });
        P.text(e.outcome.toUpperCase(), x + 230, cy, {
          font: F.micro, color: good ? C.inkDim : C.warnDim, track: TRACK.label,
        });
        if (e.tier) P.label(e.tier, x + w, cy, { color: C.inkFaint, align: 'right' });
        cy += 12;
      }
    }

    this.scrollMax = Math.max(0, (cy + 10) - y - (this.bodyH - PAD * 2));
    void h;
  }

  _drawRow(P, x, y, w, o, player, hit) {
    const here = o.here;
    const top = y;
    const rowH = rowHeight(o);

    P.fill(x - 4, y, w + 8, rowH, here ? C.scrimHard : C.scrimSoft);
    P.frame(x - 4, y, w + 8, rowH, here ? C.rule : C.ruleDim);
    if (here) P.fill(x - 4, y, 2, rowH, C.ink);

    // Kind chip, then the headline. The chip is the sort key the eye uses.
    const cx = P.chip(o.kind, x + 4, y + 5, {
      fill: here ? C.ink : C.track, color: here ? C.void : C.inkDim, h: 13,
    });
    P.text(String(o.title).toUpperCase(), cx + 6, y + 15, {
      font: F.bodyBold, color: C.inkStrong, track: TRACK.label, maxW: w - (cx - x) - 96 });
    if (here) {
      P.chip('YOU ARE HERE', x + w, y + 5, { fill: C.ink, color: C.void, h: 13, align: 'right' });
    }

    // WHERE, in the spatial vocabulary the rest of the interface already uses.
    // Lanes measured from the right so a long POI name cannot run into its range —
    // `TALLOW FITTING YAR667.3 KM` was two columns sharing the same pixels.
    const bearW = P.measure('DEAD AHEAD', F.micro, TRACK.label) + 12;
    const rangeW = P.measure('999.9 KM', F.small, TRACK.value) + 14;
    const progW = 132;
    const colBear = w - progW - bearW;
    const colRange = colBear - rangeW;
    P.text(String(o.poiName).toUpperCase(), x + 4, y + 28,
      { font: F.small, color: C.inkDim, track: TRACK.label, maxW: colRange - 12 });
    if (player && !here) {
      const dx = o.position.x - player.position.x;
      const dz = o.position.z - player.position.z;
      const rel = angleDelta(player.heading, yawOf(dx, dz));
      const deg = Math.round((Math.abs(rel) * 180) / Math.PI);
      const side = rel > 0 ? 'PORT' : 'STBD';
      P.text(fmtRange(Math.hypot(dx, dz)), x + colRange, y + 28, { font: F.small, color: C.ink });
      P.text(deg < 3 ? 'DEAD AHEAD' : `${side} ${deg}°`, x + colBear, y + 28,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
    }

    // Progress against the stated target, in the objective's own words.
    P.bar(x + w - 128, y + 22, 84, 6, o.target > 0 ? o.progress / o.target : 0, {
      color: o.progress >= o.target ? C.friendly : C.inkDim, track: C.track, segments: o.target,
    });
    P.text(`${o.progress}/${o.target}`, x + w, y + 28, { font: F.small, color: C.ink, align: 'right' });

    const clockW = P.measure('99:99', F.bodyBold, TRACK.value) + 8;
    const winW = P.measure('WINDOW', F.micro, TRACK.label) + 12;
    P.text(String(o.targetText ?? '').toUpperCase(),
      x + 4, y + 41, { font: F.micro, color: C.inkFaint, track: TRACK.label, maxW: w - clockW - winW - 12 });
    P.text(fmtClock(o.secondsLeft), x + w, y + 41, {
      font: F.bodyBold, color: o.secondsLeft < 60 ? C.warn : C.inkDim, align: 'right',
    });
    P.label('WINDOW', x + w - clockW, y + 41, { color: C.inkFaint, align: 'right' });

    let cy = y + 52;

    // --- the battle clock, for an intercept ---------------------------------
    if (o.clock) {
      const phase = o.clock.phase;
      P.label('BATTLE', x + 4, cy + 8, { color: C.inkFaint });
      const startsIn = o.clock.startsIn;
      const endsIn = o.clock.endsIn;
      const text = phase === 'pending' ? `OPENS IN ${fmtClock(startsIn)}`
        : phase === 'active' ? `UNDER WAY · ENDS IN ${fmtClock(endsIn)}`
          : 'OVER · FIELD IS COLD';
      P.text(text, x + 48, cy + 8, {
        font: F.microBold, color: phase === 'active' ? C.warn : phase === 'pending' ? C.ink : C.inkFaint,
        track: TRACK.label,
      });
      // A three-segment timeline: before / during / after, with a head marking now.
      const tx = x + w - 170;
      const tw = 170;
      P.fill(tx, cy + 1, tw, 6, C.track);
      const seg = tw / 3;
      for (let i = 0; i < 3; i++) {
        const on = (phase === 'pending' && i === 0) || (phase === 'active' && i === 1) || (phase === 'over' && i === 2);
        if (on) P.fill(tx + i * seg, cy + 1, seg, 6, i === 2 ? C.inkFaint : C.ink);
        P.rule(tx + i * seg, cy - 1, P.hair, 10, C.ruleDim);
      }
      cy += 16;
    }

    // --- the fork -----------------------------------------------------------
    // All three tiers, always, with the multiplier on each, on their OWN line. This is
    // the only place in the game where being early is priced, and a player who cannot
    // see the price cannot choose to pay it — so the three chips get the width they
    // need rather than being squeezed in beside a label and clipped.
    /**
     * THE ARRIVAL FORK, WITH AN ACTUAL ARRIVAL ON IT.
     *
     * `ARRIVAL IF YOU GO NOW` was an orphaned label: the only number on its line was
     * the reward, which belongs to the payout, not to the arrival. The ETA is
     * computable from what this panel already has — the range it prints two lines up
     * and the hull's own top speed — so it is printed, and the reward is labelled as
     * a reward so the two cannot be read as one figure.
     */
    const eta = this._etaSeconds(o, player);
    P.label(o.arrival.locked ? 'ARRIVAL · LOCKED' : 'ARRIVAL', x + 4, cy + 8, { color: C.inkFaint });
    if (!o.arrival.locked && eta !== null) {
      P.text(`${fmtClock(eta)} AT BEST BURN`, x + 62, cy + 8,
        { font: F.small, color: eta > o.secondsLeft ? C.warn : C.ink, track: TRACK.label });
    } else if (o.arrival.locked) {
      P.text('YOU ARE COMMITTED — TIER IS STAMPED', x + 76, cy + 8,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
    }
    const payTxt = rewardText(o.projectedReward);
    const payW = P.measure(payTxt, F.small, TRACK.value) + 10;
    P.label('PAYS', x + w - payW, cy + 8, { color: C.inkFaint, align: 'right' });
    P.text(payTxt, x + w, cy + 8, { font: F.small, color: C.ink, align: 'right' });
    cy += 14;

    let ax = x + 4;
    for (const tier of ARRIVAL_TIERS) {
      const on = tier.id === o.arrival.tier;
      const label = `${tier.label} ×${tier.multiplier.toFixed(2)}`;
      const scales = o.arrival.multiplier !== 1 || o.arrival.tier === tier.id;
      if (on) ax = P.chip(label, ax, cy, { fill: C.ink, color: C.void, h: 13 }) + 5;
      else ax = P.chipOutline(label, ax, cy, { color: scales ? C.inkFaint : C.inkFaint, h: 13 }) + 5;
    }
    cy += 17;

    // Above the row's closing edge and at full ink. It used to sit at about 1.5:1
    // with the row divider running straight through the centre of its glyphs.
    P.text(String(o.arrival.note ?? '').toUpperCase(), x + 4, cy + 9,
      { font: F.micro, color: C.inkDim, track: TRACK.label, maxW: w - 12 });

    if (hit) hit.push({ kind: 'objective:row', panel: this.id, objId: o.id, x: x - 4, y: top, w: w + 8, h: rowH });
    return top + rowH;
  }

  /**
   * Seconds to be there, from the range this row already prints and the hull's own
   * maximum. Deliberately optimistic and labelled as such — it is the number that
   * decides whether the early tier is still reachable, and a pessimistic estimate
   * would tell the player to give up on windows they could still make.
   */
  _etaSeconds(o, player) {
    if (!player || o.here) return o.here ? 0 : null;
    const dx = o.position.x - player.position.x;
    const dz = o.position.z - player.position.z;
    const v = Math.max(1, player.body?.maxSpeed ?? player.classDef?.maxSpeed ?? 180);
    return Math.hypot(dx, dz) / v;
  }

  onClick(region) {
    if (region.kind !== 'objective:row') return false;
    const o = this._rows.find((r) => r.id === region.objId);
    if (o) this.ui.orderBar.say(`${o.title} — ${String(o.detail ?? '').toUpperCase()}`, 'info');
    return true;
  }
}

/**
 * ONE height function, used by both the culling test and the drawing code.
 *
 * They were two constants and they disagreed by six pixels, which put every row's
 * closing note into the top of the row below it. A row height that is computed in two
 * places is a row height that will eventually be wrong in one of them.
 */
function rowHeight(o) {
  return o.clock ? 110 : 94;
}

function rewardText(reward) {
  if (!reward) return '--';
  const parts = [];
  for (const k in reward) {
    const v = reward[k];
    if (typeof v !== 'number' || v <= 0) continue;
    parts.push(`${v} ${k.slice(0, 4).toUpperCase()}`);
  }
  return parts.length ? parts.join(' · ') : '--';
}
