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
      w: 452,
      h: 384,
      place: (P) => ({ x: 30, y: Math.max(40, Math.min(118, P.h - 420)) }),
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
      P.text('NO WAR TO READ', x, y + 14, { font: F.small, color: C.inkGhost, track: TRACK.label });
      return;
    }
    const rows = this._data(this.ui.time);
    const player = this.world.player;

    let cy = y + 8;
    P.label('OPEN', x, cy, { color: C.inkFaint });
    P.text(String(rows.length), x + 42, cy, { font: F.bodyBold, color: C.ink });
    P.label('GENERATED FROM THE FACTION WAR · IGNORING THEM CHANGES NOTHING BUT YOUR PAY',
      x + 62, cy, { color: C.inkGhost });
    P.hline(x, cy + 5, w, C.rule);
    cy += 18;

    if (!rows.length) {
      P.text('NOTHING OPEN', x, cy + 6, { font: F.small, color: C.inkGhost, track: TRACK.label });
      P.text('THE WAR WILL MAKE SOMEWHERE INTERESTING SHORTLY', x, cy + 20,
        { font: F.micro, color: C.inkGhost, track: TRACK.label });
      cy += 40;
    }

    for (const o of rows) {
      const rowH = o.clock ? 96 : 78;
      if (cy > clip.clipBottom + rowH || cy + rowH < clip.clipTop) { cy += rowH + 6; continue; }
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
        P.label(e.kind, x, cy, { color: C.inkGhost });
        P.text(P.clip(String(e.poiName).toUpperCase(), F.micro, 150), x + 66, cy,
          { font: F.micro, color: C.inkFaint });
        P.text(e.outcome.toUpperCase(), x + 230, cy, {
          font: F.micro, color: good ? C.inkDim : C.warnDim, track: TRACK.label,
        });
        if (e.tier) P.label(e.tier, x + w, cy, { color: C.inkGhost, align: 'right' });
        cy += 12;
      }
    }

    this.scrollMax = Math.max(0, (cy + 10) - y - (this.bodyH - PAD * 2));
    void h;
  }

  _drawRow(P, x, y, w, o, player, hit) {
    const here = o.here;
    const top = y;
    const rowH = o.clock ? 90 : 72;

    P.fill(x - 4, y, w + 8, rowH, here ? C.scrimHard : C.scrimSoft);
    P.frame(x - 4, y, w + 8, rowH, here ? C.rule : C.ruleDim);
    if (here) P.fill(x - 4, y, 2, rowH, C.ink);

    // Kind chip, then the headline. The chip is the sort key the eye uses.
    const cx = P.chip(o.kind, x + 4, y + 5, {
      fill: here ? C.ink : C.inkGhost, color: here ? C.void : C.inkDim, h: 13,
    });
    P.text(P.clip(String(o.title).toUpperCase(), F.bodyBold, w - (cx - x) - 96), cx + 6, y + 15, {
      font: F.bodyBold, color: C.inkStrong, track: TRACK.label,
    });
    if (here) {
      P.chip('YOU ARE HERE', x + w, y + 5, { fill: C.ink, color: C.void, h: 13, align: 'right' });
    }

    // WHERE, in the spatial vocabulary the rest of the interface already uses.
    P.text(P.clip(String(o.poiName).toUpperCase(), F.small, 150), x + 4, y + 28,
      { font: F.small, color: C.inkDim, track: TRACK.label });
    if (player && !here) {
      const dx = o.position.x - player.position.x;
      const dz = o.position.z - player.position.z;
      const rel = angleDelta(player.heading, yawOf(dx, dz));
      const deg = Math.round((Math.abs(rel) * 180) / Math.PI);
      const side = rel > 0 ? 'PORT' : 'STBD';
      P.text(fmtRange(Math.hypot(dx, dz)), x + 160, y + 28, { font: F.small, color: C.ink });
      P.text(deg < 3 ? 'DEAD AHEAD' : `${side} ${deg}°`, x + 232, y + 28,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
    }

    // Progress against the stated target, in the objective's own words.
    P.bar(x + w - 128, y + 22, 84, 6, o.target > 0 ? o.progress / o.target : 0, {
      color: o.progress >= o.target ? C.friendly : C.inkDim, track: C.inkGhost, segments: o.target,
    });
    P.text(`${o.progress}/${o.target}`, x + w, y + 28, { font: F.small, color: C.ink, align: 'right' });

    P.text(P.clip(String(o.targetText ?? '').toUpperCase(), F.micro, w - 120), x + 4, y + 40,
      { font: F.micro, color: C.inkFaint, track: TRACK.label });
    P.text(fmtClock(o.secondsLeft), x + w, y + 40, {
      font: F.bodyBold, color: o.secondsLeft < 60 ? C.warn : C.inkDim, align: 'right',
    });
    P.label('WINDOW', x + w - 60, y + 40, { color: C.inkGhost, align: 'right' });

    let cy = y + 52;

    // --- the battle clock, for an intercept ---------------------------------
    if (o.clock) {
      const phase = o.clock.phase;
      P.label('BATTLE', x + 4, cy + 8, { color: C.inkGhost });
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
      P.fill(tx, cy + 1, tw, 6, C.inkGhost);
      const seg = tw / 3;
      for (let i = 0; i < 3; i++) {
        const on = (phase === 'pending' && i === 0) || (phase === 'active' && i === 1) || (phase === 'over' && i === 2);
        if (on) P.fill(tx + i * seg, cy + 1, seg, 6, i === 2 ? C.inkFaint : C.ink);
        P.rule(tx + i * seg, cy - 1, P.hair, 10, C.ruleDim);
      }
      cy += 16;
    }

    // --- the fork -----------------------------------------------------------
    // All three tiers, always, with the multiplier on each. This is the only place in
    // the game where being early is priced, and a player who cannot see the price
    // cannot choose to pay it.
    P.label(o.arrival.locked ? 'ARRIVAL · LOCKED' : 'ARRIVAL IF YOU GO NOW', x + 4, cy + 9,
      { color: o.arrival.locked ? C.inkFaint : C.inkGhost });
    let ax = x + 128;
    for (const tier of ARRIVAL_TIERS) {
      const on = tier.id === o.arrival.tier;
      const label = `${tier.label} ×${tier.multiplier.toFixed(2)}`;
      const scales = o.arrival.multiplier !== 1 || o.arrival.tier === tier.id;
      if (on) ax = P.chip(label, ax, cy, { fill: C.ink, color: C.void, h: 13 }) + 4;
      else ax = P.chipOutline(label, ax, cy, { color: scales ? C.inkFaint : C.inkGhost, h: 13 }) + 4;
    }
    cy += 17;

    P.text(P.clip(String(o.arrival.note ?? '').toUpperCase(), F.micro, 250), x + 4, cy + 8,
      { font: F.micro, color: C.inkGhost, track: TRACK.label });
    P.text(rewardText(o.projectedReward), x + w, cy + 8, {
      font: F.small, color: C.ink, align: 'right',
    });

    if (hit) hit.push({ kind: 'objective:row', panel: this.id, objId: o.id, x: x - 4, y: top, w: w + 8, h: rowH });
    return top + rowH;
  }

  onClick(region) {
    if (region.kind !== 'objective:row') return false;
    const o = this._rows.find((r) => r.id === region.objId);
    if (o) this.ui.orderBar.say(`${o.title} — ${String(o.detail ?? '').toUpperCase()}`, 'info');
    return true;
  }
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
