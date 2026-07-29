/**
 * THE HUD — the always-on layer.
 *
 * Five things live here and every one of them is load-bearing:
 *
 *   1. HULL AND STRUCTURE. Per-hardpoint structural state with the breach threshold
 *      DRAWN ON THE BAR. `Ship#applyDamage` warns at 35 % of a mount's structure and
 *      takes the module at 0. If the player has never seen that 35 % line before the
 *      warning fires, losing a tier-3 part they spent an hour earning is the game
 *      cheating. So the line is on every mount bar from the first frame, labelled
 *      once in the panel header, and the row goes to the warn colour the moment it
 *      is crossed.
 *
 *   2. THE TARGET, its subsystems, and which are gone. Destroyed entries stay in the
 *      list, struck through - a subsystem you killed is information, and deleting the
 *      row throws it away.
 *
 *   3. SELECTION BRACKETS AND ORDER MARKERS, with the three-stage acceptance
 *      animation from controls.md §4.2: provisional on the input tick, committed with
 *      a 120 ms scale-in, rejected as a 200 ms dissolve to the warn colour with a
 *      specific reason in the order bar. Everything here animates on WALL CLOCK, not
 *      sim time, because at pause the fixed step never runs and feedback that waits
 *      for it waits forever.
 *
 *   4. TIME CONTROL, including the transit compression band. The band is drawn as a
 *      separate bracketed group so it is visibly a different thing that is sometimes
 *      available, rather than four more numbers on the same strip.
 *
 *   5. THE DIRECTIONAL DAMAGE CHEVRON. If the cruiser takes hull damage while
 *      off-screen, a chevron pins to the screen edge pointing at it with the range.
 *      The camera does not move - controls.md §2.7 is explicit that an automatic
 *      camera move is worse than the problem, and that this readout is the whole
 *      mitigation.
 */

import * as THREE from 'three';
import { HARDPOINTS } from '../core/contracts.js';
import { TIME_SCALES_COMBAT } from '../core/units.js';
import {
  C, F, TRACK, Painter, screenPointRing, fmtRange, fmtPct, fmtSigned,
  factionInk, smootherstep, smoothstep, projectedSalvageState, projectedYieldsModule,
} from './theme.js';
import { moduleName, MOUNT_EMPTY } from './names.js';

const RING_SEGS = 44;
const MOUNT_LABEL = {
  bow: 'BOW', dorsal: 'DORSAL', ventral: 'VENTRAL',
  port: 'PORT', starboard: 'STBD', engine: 'ENGINE',
};

/** The structural fraction at which sim/ship.js fires HARDPOINT_BREACH_WARNING. */
export const BREACH_WARN_FRACTION = 0.35;

export class HUD {
  constructor(ui) {
    this.ui = ui;
    this.world = ui.world;
    this._ring = screenPointRing(RING_SEGS + 1);
    this._pt = { x: 0, y: 0, z: 0, ok: false };
    this._pt2 = { x: 0, y: 0, z: 0, ok: false };
    this._dash8 = [7, 6];
    this._dash4 = [3, 5];
  }

  // =========================================================================
  draw(P) {
    const world = this.world;
    const player = world.player;

    this._drawWorldLayer(P, player);
    this._drawTimeStrip(P);
    this._drawPanelTabs(P);
    this._drawShipPanel(P, player);
    this._drawTargetPanel(P, player);
    this._drawHoldStrip(P);
    this._drawNotifications(P);
    this._drawOrderBar(P);
    this._drawDamageChevron(P, player);
  }

  // =========================================================================
  // World-anchored marks: selection, target bracket, order markers
  // =========================================================================

  _drawWorldLayer(P, player) {
    const ui = this.ui;
    const proj = ui.projector;
    const world = this.world;

    // --- standing move order: a thin persistent ring, distinct from the
    //     acknowledgement animation that fired when the order was given.
    if (player?.order?.type === 'move' && player.order.point) {
      const p = player.order.point;
      this._planeRing(P, p.x, p.z, 220, C.friendlyDim, 1, null);
      if (proj.point(p.x, 0, p.z, this._pt) && this._pt.ok) {
        P.leader(this._pt.x, this._pt.y - 26, this._pt.x, this._pt.y - 8, C.friendlyDim, 1);
        // A filled chip, not light ink on nothing: reference-ui-language.md §4.
        P.worldLabel('ORDERED', this._pt.x, this._pt.y - 40, { fill: C.friendly, color: C.void });
      }
    }

    // --- selection brackets
    for (const s of world.selection) {
      if (!s || s.dead) continue;
      if (!proj.vec(s.position, this._pt)) continue;
      const r = Math.max(16, proj.radiusAt(s.position, s.radius ?? 60));
      const age = (P.t - (ui.selectionAt ?? 0)) / 0.08;
      const k = smootherstep(age);
      const scale = 1.22 - 0.22 * k;
      const col = s === player ? C.friendly : C.select;
      P.corners(this._pt.x, this._pt.y, r * scale, r * scale * 0.72, Math.min(14, r * 0.5), col, 1);
    }

    // --- order markers
    ui.markers.forEach((m) => this._drawMarker(P, m, player));
  }

  /** A circle of radius `metres` on the combat plane, drawn in perspective. */
  _planeRing(P, cx, cz, metres, color, weight = 1, fill = null, dash = null) {
    const proj = this.ui.projector;
    let any = false;
    for (let i = 0; i <= RING_SEGS; i++) {
      const a = (i / RING_SEGS) * Math.PI * 2;
      const ok = proj.point(cx + Math.cos(a) * metres, 0, cz + Math.sin(a) * metres, this._ring[i]);
      any = any || ok;
    }
    if (!any) return false;
    P.polyline(this._ring, RING_SEGS + 1, { stroke: color, weight, close: true, fill, dash });
    return true;
  }

  _drawMarker(P, m, player) {
    if (!m.active) return;
    const ui = this.ui;
    const proj = ui.projector;

    // Stage → alpha, scale, colour. controls.md §4.2.
    let alpha = 0.6;
    let scale = 1;
    let fillA = 0;
    let color = m.kind === 'attack' ? C.hostile : m.kind === 'salvage' ? C.salvage : C.friendly;

    if (m.stage === 'committed') {
      const k = smootherstep((P.t - m.stageAt) / 0.12);
      alpha = 0.6 + 0.4 * k;
      scale = 1.15 - 0.15 * k;
      fillA = 0.13 * k;
    } else if (m.stage === 'rejected') {
      const k = THREE.MathUtils.clamp((P.t - m.stageAt) / 0.2, 0, 1);
      alpha = 1 - k;
      scale = 1 + 0.3 * k;
      color = C.warn;
    }
    // Tail-off so a stale marker leaves rather than blinking out.
    const life = P.t - m.t0;
    if (m.stage !== 'rejected' && life > m.ttl - 0.5) {
      alpha *= THREE.MathUtils.clamp((m.ttl - life) / 0.5, 0, 1);
    }
    if (alpha <= 0.01) return;

    const c = P.ctx;
    c.globalAlpha = alpha;

    if (m.kind === 'move') {
      // Dashed path from the bow, ticked, so the order reads as a distance and not
      // just as a destination.
      if (player && proj.point(m.x, 0, m.z, this._pt)) {
        const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
        const bowX = player.position.x + fx * (player.radius ?? 700) * 0.9;
        const bowZ = player.position.z + fz * (player.radius ?? 700) * 0.9;
        if (proj.point(bowX, 0, bowZ, this._pt2)) {
          P.leader(this._pt2.x, this._pt2.y, this._pt.x, this._pt.y, C.friendlyDim, 1, this._dash8);
        }
        const dist = player ? Math.hypot(m.x - player.position.x, m.z - player.position.z) : 0;
        P.worldLabel(fmtRange(dist), this._pt.x + 12, this._pt.y - 20, { fill: color, color: C.void, align: 'left' });
        if (m.stage === 'rejected' && m.reason) {
          // On its own plate. A rejection reason is the one string in the interface
          // that has to survive being drawn over a starfield, a hull or an arc.
          const tw = P.measure(m.reason, F.microBold, TRACK.label);
          P.plate(this._pt.x + 8, this._pt.y - 4, tw + 12, 15, { border: null });
          P.fill(this._pt.x + 8, this._pt.y - 4, 2, 15, C.warn);
          P.text(m.reason, this._pt.x + 14, this._pt.y + 7,
            { font: F.microBold, color: C.warn, track: TRACK.label });
        }
      }
      this._planeRing(P, m.x, m.z, 220 * scale, color, m.stage === 'provisional' ? 1 : 1.5,
        fillA > 0 ? rgbaFill(color, fillA) : null);
      this._planeRing(P, m.x, m.z, 60 * scale, color, 1);
    } else if (m.kind === 'attack') {
      const t = m.target;
      if (t && !t.dead && proj.vec(t.position, this._pt)) {
        // Corner ticks animate INWARD over 90 ms: the reticle closing on the hull.
        const k = smootherstep((P.t - m.t0) / 0.09);
        const r = Math.max(18, proj.radiusAt(t.position, t.radius ?? 60));
        const grow = 1.9 - 0.9 * k;
        P.corners(this._pt.x, this._pt.y, r * grow * scale, r * grow * scale * 0.74,
          Math.min(18, r * 0.55), color, 1.5);
        P.worldLabel(m.subsystem ? `AIM · ${String(m.subsystem).toUpperCase()}` : 'ENGAGE',
          this._pt.x, this._pt.y - r * grow * 0.74 - 20, { fill: color, color: C.void });
      }
    } else if (m.kind === 'salvage') {
      const s = m.section;
      const wp = s?.worldPosition;
      if (wp && proj.vec(wp, this._pt)) {
        const r = Math.max(14, proj.radiusAt(wp, (s.radius ?? 40) * 1.6)) * scale;
        P.corners(this._pt.x, this._pt.y, r, r, r * 0.5, color, 1.5);
        P.worldLabel(String(s.label ?? 'SECTION').toUpperCase(), this._pt.x, this._pt.y - r - 18,
          { fill: color, color: C.void });
        if (s.cutProgress > 0) {
          P.bar(this._pt.x - r, this._pt.y + r + 4, r * 2, 3, s.cutProgress,
            { color: C.salvage, track: C.salvageGhost });
        }
      }
    } else if (m.kind === 'hold' || m.kind === 'power') {
      // Non-spatial acknowledgements live in the order bar; nothing to draw.
    }

    c.globalAlpha = 1;
  }

  // =========================================================================
  // Time control
  // =========================================================================

  _drawTimeStrip(P) {
    const engine = this.world.engine;
    const table = engine.scaleTable ?? TIME_SCALES_COMBAT;
    const idx = engine.timeScaleIndex;
    const transitBand = table.length > TIME_SCALES_COMBAT.length;

    const cellW = 36, cellH = 18, gap = 3;
    const combatCount = TIME_SCALES_COMBAT.length;
    const extra = transitBand ? table.length - combatCount : 0;
    const totalW = combatCount * (cellW + gap) - gap + (extra ? 14 + extra * (cellW + gap) - gap : 0);
    let x = Math.round(P.w * 0.5 - totalW * 0.5);
    const y = 46;

    // On its own plate, below the window tab row rather than sharing its band — the
    // tab row's plate used to be drawn afterwards and clip the word TIME to `IME`.
    P.plate(x - 40, y - 6, totalW + 48, cellH + 12, { border: C.ruleDim });
    P.label('TIME', x - 34, y + 12, { color: C.inkDim });

    for (let i = 0; i < table.length; i++) {
      if (i === combatCount) {
        // The compression band is bracketed off: it is a different privilege, not
        // four more numbers on the same strip.
        P.label('TRANSIT', x + 4, y - 2, { color: C.salvageDim });
        P.vline(x + 5, y, cellH, C.salvageDim);
        x += 14;
      }
      const active = i === idx;
      const v = table[i];
      const paused = v === 0;
      const inBand = i >= combatCount;
      if (active) {
        P.fill(x, y, cellW, cellH, paused ? C.warn : (inBand ? C.salvage : C.ink));
      } else {
        P.frame(x, y, cellW, cellH, inBand ? C.salvageDim : C.ruleDim);
      }
      const txt = paused ? 'HOLD' : `${v}×`;
      P.text(txt, x + cellW * 0.5, y + 13, {
        font: F.microBold,
        color: active ? C.void : (inBand ? C.salvageDim : C.inkDim),
        align: 'center', track: TRACK.label, onFill: active,
      });
      x += cellW + gap;
    }

    if (engine.paused) {
      const pulse = 0.55 + 0.45 * Math.sin(P.t * 3.4);
      P.hline(0, 0, P.w, C.warn, 2);
      // Its own plate, clear of the strip's. A pulsing string half-behind a border
      // reads as a glitch rather than as the most important state in the game.
      const tw = P.measure('SIMULATION HELD', F.microBold, TRACK.head);
      P.ctx.globalAlpha = pulse;
      P.plate(P.w * 0.5 - tw * 0.5 - 10, y + cellH + 8, tw + 20, 18, { border: C.warnDim });
      P.text('SIMULATION HELD', P.w * 0.5, y + cellH + 21,
        { font: F.microBold, color: C.warn, align: 'center', track: TRACK.head });
      P.ctx.globalAlpha = 1;
    }

    const travel = this.world.systems?.travel;
    const st = travel?.status?.();
    if (st && st.state && st.state !== 'idle') {
      const line = st.state === 'spooling'
        ? `TRANSIT SPOOL ${st.spoolRemaining.toFixed(0)} S`
        : `TRANSIT ${st.state.toUpperCase()} · LEG ${st.leg + 1}/${st.legs}`;
      const tw = P.measure(line, F.microBold, TRACK.head);
      P.plate(P.w * 0.5 - tw * 0.5 - 10, y + cellH + 8, tw + 20, 18, { border: C.salvageGhost });
      P.text(line, P.w * 0.5, y + cellH + 21,
        { font: F.microBold, color: C.salvage, align: 'center', track: TRACK.head });
    }
  }

  // =========================================================================
  // Own ship
  // =========================================================================

  /**
   * THE PLAYER-STATE BLOCK — layered, with rates, and on a real plate.
   *
   * `reference-ui-language.md` §5 and §9 read three things off the reference's own
   * hull block that ours did not have:
   *
   *   1. THE MODEL IS LAYERED. `NO SHIELD 0%` / `NO ARMOR 0%` / a hull figure are
   *      three separate tracked things, each with its own percentage. Ours printed
   *      one hull bar and, when a shield module happened to be fitted, one thin
   *      unlabelled strip. The layers are now a stack that is ALWAYS three rows tall,
   *      because the shape of what you do not have is information: a player who has
   *      never seen an armour row does not know there is armour to go and find. The
   *      reference prints `NO ARMOR 0%` for exactly the same reason.
   *
   *   2. A RATE PER LAYER. `0.0 HP/s` is called out in our own transcription as the
   *      single number carrying the most decision weight, and it did not exist here.
   *      It is sampled on the fixed step — see `UILayer.vitals`.
   *
   *   3. AN ANCHOR ON THE VELOCITY BAR. The reference prints `MAX 290 m/s` over the
   *      fill. Ours printed `87 M/S` against a bar with no maximum, so neither the
   *      number nor the bar meant anything. The max is printed, and beside it what
   *      the fitted mass is costing in acceleration and turn — which is the honest
   *      answer to "what does the weight cost you", because `refit.js` divides accel
   *      by `massLoad` and turn by its square root and NOTHING in the sim makes hull
   *      mass reduce top speed. Printing a falling maximum would have been a lie.
   */
  get shipPanelW() { return 346; }
  get shipPanelH() { return HARDPOINTS.length * 17 + 196; }

  _drawShipPanel(P, player) {
    const w = this.shipPanelW;
    const h = this.shipPanelH;
    const px = 14;
    const py = P.h - h - 14;
    const x = px + 12;
    const iw = w - 24;

    P.plate(px, py, w, h, { border: C.rule });

    if (!player) {
      P.label('NO HULL', x, py + 20, { color: C.inkFaint });
      return;
    }

    let y = py + 18;
    const cls = player.classDef;
    P.text((cls?.name ?? 'CRUISER').toUpperCase(), x, y,
      { font: F.midBold, color: C.inkStrong, track: TRACK.head });

    // --- the layer stack ----------------------------------------------------
    const v = this.ui.vitals;
    y += 15;
    P.label('LAYERS', x, y, { color: C.inkFaint });
    P.label('HP/S', x + iw, y, { color: C.inkFaint, align: 'right' });
    P.hline(x, y + 4, iw, C.rule);
    y += 15;

    const shieldMax = player.shields?.max ?? 0;
    const hullFrac = player.maxHullHP > 0 ? player.hullHP / player.maxHullHP : 1;
    const hullCrit = hullFrac < 0.3;

    y = this._layerRow(P, x, y, iw, 'SHIELD',
      shieldMax > 0 ? (player.shields.current / shieldMax) : null,
      shieldMax > 0 ? `${Math.round(player.shields.current)}/${Math.round(shieldMax)}` : 'NONE FITTED',
      shieldMax > 0 ? v.shieldRate : 0, C.shield);

    // ARMOUR is an empty row, deliberately. There is no armour layer in this build;
    // drawing the empty slot is how the player learns the layer exists at all.
    y = this._layerRow(P, x, y, iw, 'ARMOUR', null, 'NONE FITTED', 0, C.inkDim);

    y = this._layerRow(P, x, y, iw, 'HULL', hullFrac,
      `${Math.round(player.hullHP)}/${Math.round(player.maxHullHP)}`,
      v.hullRate, hullCrit ? C.warn : C.ink);

    // The net figure, in the reference's own form. One number, and it is the one the
    // player is actually asking: am I winning this or losing it.
    const net = v.hullRate + v.shieldRate;
    P.hline(x, y - 2, iw, C.ruleDim);
    P.label('NET', x, y + 11, { color: C.inkDim });
    P.text(`${net > 0.05 ? '+' : net < -0.05 ? '−' : ''}${Math.abs(net).toFixed(1)} HP/S`, x + iw, y + 11, {
      font: F.bodyBold, color: net < -0.05 ? C.warn : net > 0.05 ? C.friendly : C.inkDim, align: 'right',
    });
    y += 34;

    // --- hardpoint structure ------------------------------------------------
    P.label('MOUNT STRUCTURE', x, y, { color: C.inkFaint });
    P.label(`BREACH AT ${Math.round(BREACH_WARN_FRACTION * 100)}%`, x + iw, y,
      { color: C.warnDim, align: 'right' });
    P.hline(x, y + 4, iw, C.rule);
    let cy = y + 16;

    const rowH = 17;
    const hullRes = this.world.hullResult;
    const barX = x + iw - 92;
    // Measured, not guessed: `DORSAL` used to run straight into `RAIL BATTERY` and
    // `VENTRAL` into `TRACTOR` because the name column started at a fixed +51.
    let mountW = 0;
    for (const id of HARDPOINTS) {
      mountW = Math.max(mountW, P.measure(MOUNT_LABEL[id] ?? id, F.micro, TRACK.label));
    }
    const nameX = x + mountW + 16;
    const nameW = barX - nameX - 8;
    for (const id of HARDPOINTS) {
      const hp = player.hardpoints?.get(id);
      const frac = hp ? hp.structureHP / Math.max(1, hp.maxStructureHP) : 1;
      const breached = !!hp?.breached;
      const critical = !breached && !!hp?.module && frac <= BREACH_WARN_FRACTION;
      const mod = hp?.module?.def ?? hullRes?.hardpoints?.get(id)?.module ?? null;

      // A critical mount pulses, but never below four fifths. A warning that is
      // invisible at the trough of its own animation is not a warning.
      const pulse = critical ? 0.82 + 0.18 * Math.sin(P.t * 6.2) : 1;

      P.label(MOUNT_LABEL[id] ?? id, x, cy + 8, { color: breached ? C.hostileDim : C.inkFaint });

      // Faction identity stripe: the one chromatic mark on this panel.
      if (mod) {
        const fi = factionInk(mod.faction);
        P.fill(nameX - 8, cy + 1, 2, 9, breached ? C.hostileDim : fi.stripe);
      }

      P.ctx.globalAlpha = pulse;
      if (breached) {
        // STRUCTURAL LOSS is the one thing in this block allowed hostile red.
        P.text('BREACHED', nameX, cy + 9, { font: F.small, color: C.hostile, track: TRACK.value });
      } else if (mod) {
        // The AUTHORED short name, not a name with its tail cut off. See ui/names.js.
        P.text(moduleName(mod), nameX, cy + 9,
          { font: F.small, color: critical ? C.warn : C.ink, track: TRACK.value, maxW: nameW });
      } else {
        P.struck(P.clip(MOUNT_EMPTY[id] ?? 'EMPTY', F.small, nameW - 14), nameX, cy + 9,
          { font: F.small, color: C.inkFaint });
      }
      P.ctx.globalAlpha = 1;

      P.bar(barX, cy + 2, 58, 7, breached ? 0 : frac, {
        color: breached ? C.hostileGhost : critical ? C.warn : C.inkDim,
        track: C.track,
        threshold: BREACH_WARN_FRACTION,
        thresholdColor: critical ? C.warn : C.warnDim,
        struck: breached,
      });
      P.text(breached ? 'LOST' : fmtPct(frac), x + iw, cy + 9, {
        font: F.small, color: breached ? C.hostile : critical ? C.warn : C.inkDim, align: 'right',
      });

      cy += rowH;
    }

    // --- motion -------------------------------------------------------------
    P.hline(x, cy - 2, iw, C.ruleDim);
    cy += 13;
    const speed = player.body?.speed ?? 0;
    const maxSpeed = Math.max(1, player.body?.maxSpeed ?? player.classDef?.maxSpeed ?? 180);
    P.label('VELOCITY', x, cy, { color: C.inkFaint });
    P.text(`${speed.toFixed(0)}`, x + 96, cy, { font: F.bodyBold, color: C.ink, align: 'right' });
    P.label('M/S', x + 100, cy, { color: C.inkFaint });
    const bw = 92;
    const bx = x + 128;
    P.bar(bx, cy - 8, bw, 9, speed / maxSpeed, { color: C.inkDim, track: C.track, segments: 6 });
    // The maximum, printed ON the fill the way the reference does it. Without the
    // anchor the number and the bar are both meaningless.
    P.text(`MAX ${Math.round(maxSpeed)}`, bx + bw - 3, cy - 1,
      { font: F.micro, color: C.inkStrong, align: 'right', track: TRACK.none });
    const hdg = ((player.heading * 180) / Math.PI + 360) % 360;
    P.label('HDG', x + 232, cy, { color: C.inkFaint });
    P.text(`${hdg.toFixed(0).padStart(3, '0')}°`, x + iw, cy, { font: F.small, color: C.ink, align: 'right' });

    // What the fitted mass is actually costing. Both figures are read straight off
    // the sim: refit.js sets body.accel = classDef.accel * thrust / massLoad.
    cy += 15;
    const load = player.massLoad ?? 1;
    const accelPct = player.classDef?.accel ? player.body.accel / player.classDef.accel : 1;
    const turnPct = player.classDef?.turnRate ? player.body.turnRate / player.classDef.turnRate : 1;
    P.label('FITTED MASS', x, cy, { color: C.inkFaint });
    P.text(`×${load.toFixed(2)}`, x + 128, cy,
      { font: F.small, color: load > 1.25 ? C.warn : C.inkDim, align: 'right' });
    P.label('ACCEL', x + 142, cy, { color: C.inkFaint });
    P.text(fmtSigned((accelPct - 1) * 100), x + 220, cy,
      { font: F.small, color: accelPct < 0.9 ? C.warn : C.inkDim, align: 'right' });
    P.label('TURN', x + 236, cy, { color: C.inkFaint });
    P.text(fmtSigned((turnPct - 1) * 100), x + iw, cy,
      { font: F.small, color: turnPct < 0.9 ? C.warn : C.inkDim, align: 'right' });
  }

  /** One row of the layer stack: name, bar, figure, and its own signed rate. */
  _layerRow(P, x, y, w, name, frac, figure, rate, color) {
    const absent = frac === null;
    P.label(name, x, y + 8, { color: absent ? C.inkFaint : C.inkDim });
    const bx = x + 54;
    const bw = w - 54 - 116;
    if (absent) {
      // An absent layer is an absent layer: an empty track with a strike through it
      // and the words at full ink. Not a faded row nobody can read.
      P.bar(bx, y + 1, bw, 8, 0, { track: C.track, struck: true });
      P.text(figure, bx + bw + 7, y + 8, { font: F.small, color: C.inkFaint });
      P.text('--', x + w, y + 8, { font: F.small, color: C.inkFaint, align: 'right' });
      return y + 15;
    }
    P.bar(bx, y + 1, bw, 8, frac, { color, track: C.track, segments: 10 });
    P.text(figure, bx + bw + 7, y + 8, { font: F.small, color: C.inkDim });
    const rising = rate > 0.05;
    const falling = rate < -0.05;
    P.text(`${rising ? '+' : falling ? '−' : ''}${Math.abs(rate).toFixed(1)}`, x + w, y + 8, {
      font: F.bodyBold, color: falling ? C.warn : rising ? C.friendly : C.inkDim, align: 'right',
    });
    return y + 15;
  }

  // =========================================================================
  // Target
  // =========================================================================

  get targetPanelW() { return 372; }

  _drawTargetPanel(P, player) {
    const world = this.world;
    const combat = world.systems?.combat;
    const target = player?.target && !player.target.dead ? player.target : null;

    const w = this.targetPanelW;
    const px = P.w - w - 14;
    const x = px + 12;
    const iw = w - 24;

    // With no lock the block is a two-line prompt, not a 360 px empty plate. A large
    // black rectangle with one word in it reads as a panel that has failed to load,
    // and it was leaving a full-width rule drawn across empty space with nothing
    // attached to it.
    if (!target) {
      const py0 = P.h - 62;
      P.plate(px, py0, w, 48, { border: C.rule });
      P.label('TARGET', x, py0 + 16, { color: C.inkFaint });
      P.hline(x, py0 + 20, iw, C.rule);
      P.struck('NO LOCK', x, py0 + 36, { font: F.small, color: C.inkFaint });
      P.text('RIGHT-CLICK A CONTACT TO ENGAGE', x + 90, py0 + 36,
        { font: F.micro, color: C.inkDim, track: TRACK.label });
      return;
    }

    const py = P.h - 372;
    P.plate(px, py, w, 360, { border: C.rule });
    let y = py + 16;
    P.label('TARGET', x, y, { color: C.inkFaint });
    P.hline(x, y + 4, iw, C.rule);

    const fi = factionInk(target.faction);
    y += 22;
    P.text(target.classDef.name.toUpperCase(), x, y,
      { font: F.midBold, color: C.hostile, track: TRACK.head });
    P.fill(x, y + 6, 2, 10, fi.stripe);
    P.text(fi.name.toUpperCase(), x + 8, y + 15, { font: F.micro, color: fi.hue, track: TRACK.label });
    const dist = player ? player.position.distanceTo(target.position) : 0;
    P.text(`${(target.classDef.role ?? '').toUpperCase()} · ${target.classDef.length} M`,
      x + 96, y + 15, { font: F.micro, color: C.inkFaint, track: TRACK.label });
    P.text(fmtRange(dist), x + iw, y + 15, { font: F.bodyBold, color: C.ink, align: 'right' });

    /**
     * HULL AND SALVAGE, ON THEIR OWN LINES.
     *
     * These used to share one: `HULL   SALVAGE [bar] 58%`, two labels and two bars
     * with a single number at the right, and it was not determinable which of the two
     * the 58 % belonged to. They are the two questions this whole game is built on
     * pulling against each other; they get a line and a number each.
     */
    y += 28;
    const hullFrac = target.maxHullHP > 0 ? target.hullHP / target.maxHullHP : 1;
    P.label('HULL', x, y, { color: C.inkFaint });
    P.bar(x + 58, y - 7, iw - 106, 7, hullFrac, { color: C.hostile, track: C.hostileGhost, segments: 10 });
    P.text(fmtPct(hullFrac), x + iw, y, { font: F.bodyBold, color: C.ink, align: 'right' });
    y += 15;
    P.label('SALVAGE', x, y, { color: C.salvageDim });
    P.bar(x + 58, y - 7, iw - 106, 7, target.salvageIntegrity ?? 1,
      { color: C.salvage, track: C.salvageGhost, segments: 10 });
    P.text(fmtPct(target.salvageIntegrity ?? 1), x + iw, y,
      { font: F.bodyBold, color: C.salvage, align: 'right' });

    /**
     * PER-SECTION SALVAGE PROJECTION, LIVE.
     *
     * `fun-systems.md` P3: the player should be steering the salvage outcome during
     * the fight rather than discovering it at death. `Ship.salvageProjection()` has
     * published a per-section condition since sections started carrying the damage
     * that actually landed near them — this column is that data, in the panel the
     * player is already reading while choosing what to shoot next.
     *
     * The three words are the SAME three `salvage.describeWrecks()` uses on the hulk
     * afterwards, so nothing has to be relearned once the thing is dead.
     */
    const projection = typeof target.salvageProjection === 'function' ? target.salvageProjection() : null;

    /**
     * THE LEGEND, WITH THE STATES SEPARATED.
     *
     * It said `GREY = NO MOUNT BEARS` while the grey rows were ALSO struck through and
     * ALSO reading DEST — three encodings on the same two rows, none of which could be
     * isolated. They are now one encoding each and the legend says all three:
     *
     *   dim ink       nothing you have fitted can reach this bearing
     *   strikethrough this subsystem is destroyed
     *   cyan dot      a whole installable part still comes out of this section
     */
    let cy = y + 20;
    P.label('SUBSYSTEMS', x, cy, { color: C.inkFaint });
    P.label('YIELD', x + iw, cy, { color: C.salvageDim, align: 'right' });
    P.hline(x, cy + 4, iw, C.rule);
    cy += 13;
    P.label('DIM = OUT OF ARC · STRUCK = DESTROYED', x, cy, { color: C.inkFaint });
    cy += 12;
    P.label('● = A WHOLE PART STILL COMES OUT OF THIS SECTION', x, cy, { color: C.inkFaint });
    cy += 15;

    /**
     * COLUMNS ANCHORED FROM THE RIGHT, NAME CLIPPED TO WHAT IS LEFT.
     *
     * `STARBOARD NACELLE` used to run straight into its type column and print
     * `STARBOARD NACELLEENGINE` with no gap at all. Measuring the name and starting
     * the next column past it only works while the names are short; the moment one
     * is long, either it collides or the fixed columns on its right go off the panel.
     *
     * So the four right-hand columns — kind, bar, percentage, yield — are laid out
     * from the RIGHT EDGE at their own measured widths, and the name gets whatever
     * remains and is clipped to it. Nothing can ever be pushed into anything else.
     */
    let kindW = 0;
    for (const s of target.subsystems.values()) {
      kindW = Math.max(kindW, P.measure(String(s.def.kind).toUpperCase(), F.micro, TRACK.label));
    }
    const yieldW = P.measure('DAMAGED', F.microBold, TRACK.label) + 14;
    const pctW = P.measure('100%', F.small, TRACK.value) + 12;
    const barW = 46;
    const colPct = iw - yieldW;
    const colBar = colPct - pctW - barW;
    const colKind = colBar - kindW - 10;
    const nameW = colKind - 8;

    const aimed = player?.targetSubsystem;
    for (const s of target.subsystems.values()) {
      const bears = !!(combat && player && !s.destroyed && combat.canAnyWeaponBear(player, s));
      const isAim = aimed === s.def.id;
      const dead = s.destroyed;
      // OUT OF ARC is dim ink; DESTROYED is the strike. Two states, two encodings.
      const col = bears || dead ? C.ink : C.inkFaint;

      if (isAim) {
        P.fill(x - 6, cy - 8, 3, 11, C.hostile);
        P.fill(x - 6, cy - 8, iw + 6, 11, C.hostileGhost);
      }
      const name = P.clip((s.def.label ?? s.def.id).toUpperCase(), F.small, nameW);
      P.text(name, x, cy, { font: F.small, color: dead ? C.inkDim : col, track: TRACK.value });
      if (dead) {
        P.rule(x, cy - 4, P.measure(name, F.small, TRACK.value), P.hair, C.inkDim);
      }
      P.label(s.def.kind, x + colKind, cy, { color: C.inkFaint });

      const frac = s.maxHP > 0 ? s.hp / s.maxHP : 0;
      P.bar(x + colBar, cy - 7, barW - 6, 6, frac, {
        color: dead ? C.track : bears ? C.hostile : C.inkFaint,
        track: C.track, struck: dead,
      });
      P.text(dead ? 'DEST' : fmtPct(frac), x + colPct, cy,
        { font: F.small, color: dead ? C.inkDim : col, align: 'right' });

      const row = projection ? findSection(projection, s.def.id) : null;
      if (row) {
        const state = projectedSalvageState(row.condition, dead);
        const ink = state === 'INTACT' ? C.salvage : state === 'DAMAGED' ? C.salvageDim : C.warn;
        P.text(state, x + iw, cy, { font: F.microBold, color: ink, align: 'right', track: TRACK.label });
        // A part only comes out of a section that is a module-bearing kind AND has not
        // been shot past scrap. The dot is the difference between "materials" and "the
        // thing you came for", and it disappears while the player watches. It is
        // legended above; an unexplained mark is decoration.
        if (projectedYieldsModule(row, dead)) P.fill(x + colPct + 5, cy - 5, 4, 4, C.salvage);
      }
      cy += 14;
    }

    // Hull plating: three runs of structure that are not subsystems and never appeared
    // in this panel, yet carry a real share of what a hulk is worth.
    if (projection) {
      P.hline(x, cy - 6, iw, C.ruleDim);
      cy += 9;
      P.label('PLATING', x, cy, { color: C.inkFaint });
      const plates = [];
      for (const row of projection) if (row.kind === 'hull') plates.push(row);
      const headW = P.measure('PLATING', F.micro, TRACK.label) + 14;
      const stride = plates.length ? (iw - headW) / plates.length : 0;
      for (let i = 0; i < plates.length; i++) {
        const row = plates[i];
        const state = projectedSalvageState(row.condition, false);
        const ink = state === 'INTACT' ? C.salvage : state === 'DAMAGED' ? C.salvageDim : C.warn;
        const short = String(row.label).replace(' PLATING', '').slice(0, 4);
        const plateX = x + headW + i * stride;
        P.text(short, plateX, cy, { font: F.micro, color: C.inkDim, track: TRACK.label });
        // Right-aligned inside its own lane, so a long state word cannot run into the
        // next section's name — `FORE INTACTMIDS INTACTAFT` was exactly that.
        P.text(state, plateX + stride - 8, cy,
          { font: F.micro, color: ink, track: TRACK.label, align: 'right' });
      }
      cy += 12;
    }

    // --- bearing report -----------------------------------------------------
    cy += 8;
    P.hline(x, cy - 8, iw, C.ruleDim);
    if (combat && player) {
      const rep = combat.bearingReport(player, target);
      const bearing = rep.bearing > 0;
      P.label('BEARING', x, cy + 6, { color: C.inkFaint });
      P.text(`${rep.bearing}/${rep.total}`, x + 66, cy + 6,
        { font: F.bodyBold, color: bearing ? C.friendly : C.warn });
      P.pips(x + 104, cy - 1, Math.max(1, rep.total), rep.bearing,
        { size: 5, gap: 3, color: bearing ? C.friendly : C.warn, empty: C.track });

      // On its own line at full width. Squeezed in beside the pip row it was clipped
      // to an ellipsis, and the advice is the only instruction in the block.
      const advice = this.ui.bearingAdvice(player, target, rep);
      P.text(clip(P, advice, F.microBold, iw), x, cy + 20, {
        font: F.microBold, color: bearing ? C.friendly : C.warn, track: TRACK.label,
      });
    }
  }

  // =========================================================================
  // Hold / materials
  // =========================================================================

  /**
   * THE HOLD, AS VOLUME.
   *
   * This strip used to print `4/6` slots, which is the readout `cargo.js` was written
   * to replace: a salvaged destroyer reactor and a sensor mast are the same object to
   * a slot count and they are obviously not the same object. The binding constraint is
   * cubic metres, so cubic metres is what the always-on strip prints — the detail, and
   * what each individual thing costs to carry, is one keystroke away in the HOLD panel.
   */
  _drawHoldStrip(P) {
    const world = this.world;
    const cargo = world.systems?.cargo ?? null;
    const m = world.materials ?? { alloy: 0, composite: 0, exotic: 0 };

    const w = 206;
    const px = P.w - w - 8;
    const py = 34;
    const h = 96;
    P.plate(px, py, w, h, { border: C.rule });
    const x = px + 10;
    const iw = w - 20;
    let y = py + 16;

    if (cargo) {
      const cap = Math.max(1, cargo.capacityM3);
      const used = cargo.usedM3();
      const frac = used / cap;
      const full = frac >= 0.995;
      P.label('HOLD', x, y, { color: C.inkFaint });
      P.text(`${Math.round(used)} / ${Math.round(cap)} m3`, x + iw, y, {
        font: F.bodyBold, color: full ? C.warn : C.ink, align: 'right',
      });
      P.bar(x, y + 4, iw, 6, frac, {
        color: full ? C.warn : C.salvage, track: C.track, segments: 8,
      });
      y += 22;
    } else {
      const cap = world.systems?.salvage?.cargoCapacity ?? 6;
      const held = world.inventory?.length ?? 0;
      P.label('HOLD', x, y, { color: C.inkFaint });
      P.text(`${held}/${cap}`, x + iw, y, { font: F.bodyBold, color: held >= cap ? C.warn : C.ink, align: 'right' });
      y += 17;
    }
    P.hline(x, y - 7, iw, C.ruleDim);

    // Four pools, not three: `electronics` landed with the material chain and was
    // never printed anywhere, which meant every cost quoted in it read as unpayable.
    // Two rows of two on a fixed grid — a variable-width count followed by the next
    // label on the same line is the collision this block had before.
    const mats = [['ALLOY', m.alloy], ['COMP', m.composite], ['ELEC', m.electronics], ['EXOTIC', m.exotic]];
    const colW = Math.floor(iw / 2);
    for (let i = 0; i < mats.length; i++) {
      const [k, v] = mats[i];
      const mx = x + (i % 2) * colW;
      const my = y + 6 + Math.floor(i / 2) * 14;
      P.label(k, mx, my, { color: C.inkFaint });
      P.text(String(Math.round(v ?? 0)), mx + colW - 10, my, {
        font: F.small, color: (v ?? 0) > 0 ? C.ink : C.inkFaint, align: 'right',
      });
    }
    y += 32;

    if (world.unlocked?.powerRouting === false) {
      // At full ink with a leading dash. It used to be drawn at 1.33:1 — a note about
      // a capability the player does not have yet, rendered so it could not be read.
      P.struck('POWER ROUTING SEALED', x, y + 8, { font: F.micro, color: C.inkFaint });
    }
  }

  /**
   * WINDOW TABS.
   *
   * `reference-ui-language.md` §7 observed mode tabs along the top of the reference
   * frame — `B Build`, `F1 CAM`, `F2 TAC`, `F3 SYS` — keycap first, inline and
   * diegetic. Six systems that landed with no UI have windows, and with nothing open
   * by default this row is the only thing that says they exist. Open ones invert,
   * which makes it a state readout as well as a menu.
   */
  _drawPanelTabs(P) {
    const host = this.ui.panels;
    if (!host) return;
    const y = 8;
    // Measured, then plated, so the row is legible over a planet like everything else.
    let total = 0;
    for (const panel of host.panels) {
      total += P.measure(`${panel.hint} ${shortTitle(panel.title)}`, F.microBold, TRACK.label) + 16;
    }
    const hintW = P.measure('\\ HIDE', F.micro, TRACK.label) + 14;
    P.plate(8, y - 4, total + hintW + 14, 24, { border: C.ruleDim });
    let x = 14;
    for (const panel of host.panels) {
      const label = `${panel.hint} ${shortTitle(panel.title)}`;
      const w = P.measure(label, F.microBold, TRACK.label) + 12;
      if (panel.open) P.fill(x, y, w, 15, C.ink);
      else P.frame(x, y, w, 15, C.rule);
      P.text(label, x + 6, y + 11, {
        font: F.microBold, color: panel.open ? C.void : C.inkDim, track: TRACK.label, onFill: panel.open,
      });
      this.ui.hit.push({ kind: 'panel:tab', panelId: panel.id, x, y, w, h: 15 });
      x += w + 4;
    }
    // The one control that is not a window, said in the same idiom.
    P.label('\\ HIDE', x + 4, y + 11, { color: C.inkFaint });
  }

  // =========================================================================
  // Notifications and the order bar
  // =========================================================================

  _drawNotifications(P) {
    const list = this.ui.notifications;
    let y = 136;
    for (let i = 0; i < list.count; i++) {
      const n = list.items[i];
      const age = P.t - n.t0;
      const a = THREE.MathUtils.clamp(1 - (age - n.ttl + 0.8) / 0.8, 0, 1) * smoothstep(age / 0.12);
      if (a <= 0.01) continue;
      const col = n.important ? C.select : C.inkDim;
      const font = n.important ? F.bodyBold : F.small;
      const tw = P.measure(n.text.toUpperCase(), font, TRACK.label);
      P.ctx.globalAlpha = a;
      P.plate(P.w * 0.5 - 192, y - 11, tw + 22, 15, { border: null });
      P.fill(P.w * 0.5 - 190, y - 10, 3, 12, col);
      P.text(n.text.toUpperCase(), P.w * 0.5 - 180, y, { font, color: col, track: TRACK.label });
      P.ctx.globalAlpha = 1;
      y += 17;
    }
  }

  _drawOrderBar(P) {
    const bar = this.ui.orderBar;
    if (!bar.text) return;
    const age = P.t - bar.t0;
    const a = THREE.MathUtils.clamp(1 - (age - 4.2) / 0.9, 0, 1);
    if (a <= 0.01) return;
    const col = bar.severity === 'error' ? C.warn : bar.severity === 'good' ? C.friendly : C.inkDim;
    const y = 112;
    P.ctx.globalAlpha = a;
    const tw = P.measure(bar.text.toUpperCase(), F.bodyBold, TRACK.label);
    const x0 = P.w * 0.5 - tw * 0.5;
    // An opaque plate, not a scrim: this is the string that tells the player their
    // order was refused and why, and it has to survive being drawn over a planet.
    P.plate(x0 - 22, y - 15, tw + 44, 23, { border: C.ruleDim });
    P.fill(x0 - 12, y - 11, 3, 14, col);
    P.text(bar.text.toUpperCase(), x0, y, { font: F.bodyBold, color: col, track: TRACK.label });
    P.ctx.globalAlpha = 1;
  }

  // =========================================================================
  // Directional damage chevron
  // =========================================================================

  _drawDamageChevron(P, player) {
    const d = this.ui.damage;
    if (!player || d.at < 0) return;
    const age = P.t - d.at;
    if (age > 3.2) return;

    // Only when the ship is genuinely not in frame. The camera does not move.
    const proj = this.ui.projector;
    const onScreen = proj.vec(player.position, this._pt)
      && this._pt.x > -40 && this._pt.x < P.w + 40 && this._pt.y > -40 && this._pt.y < P.h + 40;
    if (onScreen) return;

    // Direction from frame centre toward the ship, in screen space. Behind the
    // camera the projection mirrors, so flip it back explicitly.
    let dx, dy;
    if (this._pt.ok) {
      dx = this._pt.x - P.w * 0.5;
      dy = this._pt.y - P.h * 0.5;
    } else {
      dx = -(this._pt.x - P.w * 0.5);
      dy = -(this._pt.y - P.h * 0.5);
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const marginX = P.w * 0.5 - 64;
    const marginY = P.h * 0.5 - 64;
    const s = Math.min(Math.abs(marginX / (dx || 1e-6)), Math.abs(marginY / (dy || 1e-6)));
    const cx = P.w * 0.5 + dx * s;
    const cy = P.h * 0.5 + dy * s;

    const pulse = THREE.MathUtils.clamp(1 - age / 3.2, 0, 1) * (0.55 + 0.45 * Math.sin(P.t * 7.5));
    const c = P.ctx;
    c.save();
    c.translate(cx, cy);
    c.rotate(Math.atan2(dy, dx));
    c.globalAlpha = pulse;
    c.strokeStyle = C.warn;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-14, -15); c.lineTo(9, 0); c.lineTo(-14, 15);
    c.stroke();
    c.beginPath();
    c.moveTo(-24, -11); c.lineTo(-3, 0); c.lineTo(-24, 11);
    c.globalAlpha = pulse * 0.5;
    c.stroke();
    c.restore();
    P._forgetTrack();   // restore() reverts letterSpacing; see Painter._forgetTrack
    c.globalAlpha = 1;

    const camDist = proj.camera ? proj.camera.position.distanceTo(player.position) : 0;
    const tx = cx - dx * 46;
    const ty = cy - dy * 46;
    P.ctx.globalAlpha = THREE.MathUtils.clamp(1 - age / 3.2, 0, 1);
    P.plate(tx - 34, ty - 16, 68, 26, { border: C.warnDim });
    P.text('HULL HIT', tx, ty - 5, { font: F.microBold, color: C.warn, align: 'center', track: TRACK.label });
    P.text(fmtRange(camDist), tx, ty + 6, { font: F.micro, color: C.inkDim, align: 'center' });
    P.ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------

/** `ARMAMENT · THERMAL · DEVICES` → `ARMAMENT`. The tab row has 24 px per word. */
function shortTitle(title) {
  return String(title).split('·')[0].trim();
}

/** Salvage-projection row by section id. Linear over <= 12 rows; no allocation. */
function findSection(rows, id) {
  for (let i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
  return null;
}

/** Truncate to a pixel width with an ellipsis. Cached through Painter.measure. */
function clip(P, str, font, maxW) {
  if (P.measure(str, font, TRACK.value) <= maxW) return str;
  let s = str;
  while (s.length > 1 && P.measure(`${s}…`, font, TRACK.value) > maxW) s = s.slice(0, -1);
  return `${s}…`;
}

/** rgb(...) or rgba(...) string with a new alpha. Cheap and cached by the caller. */
const _fillCache = new Map();
function rgbaFill(cssColor, alpha) {
  const key = `${cssColor}|${alpha.toFixed(2)}`;
  let v = _fillCache.get(key);
  if (v === undefined) {
    const nums = cssColor.match(/[\d.]+/g) ?? ['255', '255', '255'];
    v = `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha.toFixed(3)})`;
    if (_fillCache.size < 512) _fillCache.set(key, v);
  }
  return v;
}
