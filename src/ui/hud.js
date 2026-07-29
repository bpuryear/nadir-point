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
  /**
   * WELDED ATTRIBUTION. `Painter.owner` was set only inside `PanelHost._drawOne`, so
   * every string this file draws recorded `owner === ''` and `tools/uicheck.mjs`
   * filtered it straight out: 376 boxes asserted on out of 597 drawn — 37 % of the
   * frame's type, and the 37 % where every historical collision lived
   * (`STARBOARD NACELLEENGINE` was `_drawTargetPanel`). A green check over 63 % of the
   * frame is the same class of vacuity as a green check over 0 % of it.
   *
   * The ids are the SAME ids `layout.js` publishes, because the tool builds its
   * rectangles from that list. A block that draws under an id with no rectangle is
   * invisible to the audit again, so the two must be edited together.
   */
  draw(P) {
    const world = this.world;
    const player = world.player;

    P.owner = 'world';
    this._drawWorldLayer(P, player);
    P.owner = 'time';
    this._drawTimeStrip(P);
    P.owner = 'tabs';
    this._drawPanelTabs(P);
    P.owner = 'ship';
    this._drawShipPanel(P, player);
    P.owner = 'target';
    this._drawTargetPanel(P, player);
    P.owner = 'stores';
    this._drawHoldStrip(P);
    P.owner = 'notify';
    this._drawNotifications(P);
    this._drawOrderBar(P);
    P.owner = 'world';
    this._drawDamageChevron(P, player);
    P.owner = '';
  }

  /** The layout this frame. Never null on the draw path; defaults are for safety. */
  get L() { return this.ui.layout; }

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
          // On its own plate, and CLAIMED as a whole. A rejection reason is the one
          // string that has to survive being drawn over a starfield, a hull or an
          // arc — but a rejection reason sliced in half by a window's edge is worse
          // than none, so if the space is taken it is not drawn at all.
          const tw = P.measure(m.reason, F.microBold, TRACK.label);
          if (P.claim(this._pt.x + 8, this._pt.y - 4, tw + 12, 15, 2)) {
            P.plate(this._pt.x + 8, this._pt.y - 4, tw + 12, 15, { border: null });
            P.fill(this._pt.x + 8, this._pt.y - 4, 2, 15, C.warn);
            P.text(m.reason, this._pt.x + 14, this._pt.y + 7,
              { font: F.microBold, color: C.warn, track: TRACK.label });
          }
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

  /**
   * The strip's own width, so `layout.js` can reserve WHAT IT DRAWS.
   *
   * The `time` region used to be declared as a 560 x 150 rectangle for a strip that
   * draws about 250 x 40 — 5.8 % of a 1600x900 frame claimed by nothing, held against
   * the panel solver and against every world-anchored caption in the frame. `measure`
   * is cached per (font, tracking, string), so calling this once a frame is free.
   */
  measureTimeStrip(P) {
    const table = this.world.engine?.scaleTable ?? TIME_SCALES_COMBAT;
    const combatCount = TIME_SCALES_COMBAT.length;
    const extra = table.length > combatCount ? table.length - combatCount : 0;
    const totalW = combatCount * 39 - 3 + (extra ? 14 + extra * 39 - 3 : 0);
    void P;
    return totalW + 48;
  }

  _drawTimeStrip(P) {
    const engine = this.world.engine;
    const table = engine.scaleTable ?? TIME_SCALES_COMBAT;
    const idx = engine.timeScaleIndex;
    const transitBand = table.length > TIME_SCALES_COMBAT.length;

    const cellW = 36, cellH = 18, gap = 3;
    const combatCount = TIME_SCALES_COMBAT.length;
    const extra = transitBand ? table.length - combatCount : 0;
    const totalW = combatCount * (cellW + gap) - gap + (extra ? 14 + extra * (cellW + gap) - gap : 0);
    // Placed from the layout rect, not from the frame centre, so the block and the
    // rectangle reserved for it are the same rectangle.
    const rect = this.L?.time;
    const plateX = rect ? rect.x : Math.round(P.w * 0.5 - (totalW + 48) * 0.5);
    let x = plateX + 40;
    const y = (rect ? rect.y : 38) + 8;

    // On its own plate, below the window tab row rather than sharing its band — the
    // tab row's plate used to be drawn afterwards and clip the word TIME to `IME`.
    P.plate(plateX, y - 6, totalW + 48, cellH + 12, { border: C.ruleDim });
    P.label('TIME', plateX + 6, y + 12, { color: C.inkDim });

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
  get shipPanelW() { return this.L?.ship.w ?? 346; }
  get shipPanelH() { return this.L?.ship.h ?? HARDPOINTS.length * 17 + 196; }

  _drawShipPanel(P, player) {
    const L = this.L;
    const rect = L.ship;
    const w = rect.w;
    const h = rect.h;
    const px = rect.x;
    const py = rect.y;
    const x = px + 12;
    const iw = w - 24;

    P.plate(px, py, w, h, { border: C.rule });

    if (!player) {
      P.label('NO HULL', x, py + 20, { color: C.inkFaint });
      return;
    }

    let y = py + 18;
    const cls = player.classDef;
    P.text(P.clip((cls?.name ?? 'CRUISER').toUpperCase(), F.midBold, iw, TRACK.head), x, y,
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

    /**
     * TWO ABSENT LAYERS ARE ONE LINE, NOT TWO PLATES.
     *
     * The empty row exists so a player who has never owned a shield learns the layer
     * is there — `reference-ui-language.md` §5, and the reference prints `NO ARMOR 0%`
     * for the same reason. That argument buys the WORDS. It does not buy two struck
     * bars, two `NONE FITTED` strings and two `--` rates: 30 logical px of the most
     * valuable block in the frame spent saying nothing, twice. Collapsed, both names
     * are still on screen and the teaching still happens.
     */
    if (L.layersCollapsed) {
      P.struck('NO SHIELD · NO ARMOUR', x, y + 8, { font: F.small, color: C.inkFaint });
      P.text('--', x + iw, y + 8, { font: F.small, color: C.inkFaint, align: 'right' });
      y += L.layerRowH;
    } else {
      y = this._layerRow(P, x, y, iw, 'SHIELD',
        shieldMax > 0 ? (player.shields.current / shieldMax) : null,
        shieldMax > 0 ? `${Math.round(player.shields.current)}/${Math.round(shieldMax)}` : 'NONE FITTED',
        shieldMax > 0 ? v.shieldRate : 0, C.shield);
      y = this._layerRow(P, x, y, iw, 'ARMOUR', null, 'NONE FITTED', 0, C.inkDim);
    }

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

    const rowH = L.mountRowH;
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

    /**
     * MOTION — three lanes measured off `iw`, not six literals measured off 322.
     *
     * These x-offsets were `x + 96`, `x + 100`, `x + 128`, `x + 232`, `x + 142`,
     * `x + 220` and `x + 236`: correct at exactly one panel width and silently
     * overlapping at any other. The block is now a fraction of the width it is handed,
     * which is what makes the panel able to shrink on a frame that cannot afford 346.
     */
    P.hline(x, cy - 2, iw, C.ruleDim);
    cy += 13;
    const speed = player.body?.speed ?? 0;
    const maxSpeed = Math.max(1, player.body?.maxSpeed ?? player.classDef?.maxSpeed ?? 180);
    const wVel = P.measure('VELOCITY', F.micro, TRACK.label);
    const wNum = P.measure('000', F.bodyBold, TRACK.value);
    const wMs = P.measure('M/S', F.micro, TRACK.label);
    const wHdg = P.measure('HDG', F.micro, TRACK.label) + P.measure('000°', F.small, TRACK.value) + 10;
    const laneA = wVel + 8 + wNum;                 // right edge of the speed figure
    const bx = x + laneA + 6 + wMs + 8;            // the bar starts past `M/S`
    const bw = Math.max(40, x + iw - wHdg - 8 - bx);
    P.label('VELOCITY', x, cy, { color: C.inkFaint });
    P.text(`${speed.toFixed(0)}`, x + laneA, cy, { font: F.bodyBold, color: C.ink, align: 'right' });
    P.label('M/S', x + laneA + 6, cy, { color: C.inkFaint });
    P.bar(bx, cy - 8, bw, 9, speed / maxSpeed, { color: C.inkDim, track: C.track, segments: 6 });
    // The maximum, printed ON the fill the way the reference does it. Without the
    // anchor the number and the bar are both meaningless.
    P.text(`MAX ${Math.round(maxSpeed)}`, bx + bw - 3, cy - 1,
      { font: F.micro, color: C.inkStrong, align: 'right', track: TRACK.none });
    const hdg = ((player.heading * 180) / Math.PI + 360) % 360;
    P.label('HDG', x + iw - wHdg + 4, cy, { color: C.inkFaint });
    P.text(`${hdg.toFixed(0).padStart(3, '0')}°`, x + iw, cy, { font: F.small, color: C.ink, align: 'right' });

    /**
     * What the fitted mass is actually costing. Both figures are read straight off the
     * sim: refit.js sets `body.accel = classDef.accel * thrust / massLoad`.
     *
     * THREE MEASURED CELLS, laid out from the right. The first version of this row
     * used `x + iw/3` and `x + iw*2/3` and printed `FITTED MAS×1.00 ACCEL` at 346 px —
     * exactly the fixed-offset failure `panels.js#columns` was written to end, made by
     * hand in the one file that does not use it.
     */
    cy += 15;
    const load = player.massLoad ?? 1;
    const accelPct = player.classDef?.accel ? player.body.accel / player.classDef.accel : 1;
    const turnPct = player.classDef?.turnRate ? player.body.turnRate / player.classDef.turnRate : 1;
    const wPct = P.measure('−100%', F.small, TRACK.value);
    const wTurnCell = P.measure('TURN', F.micro, TRACK.label) + 6 + wPct;
    const wAccelCell = P.measure('ACCEL', F.micro, TRACK.label) + 6 + wPct;
    const xTurn = x + iw - wTurnCell;
    const xAccel = xTurn - 10 - wAccelCell;
    const wMass = P.measure('×0.00', F.small, TRACK.value);
    P.label('FITTED MASS', x, cy, { color: C.inkFaint, maxW: xAccel - x - wMass - 14 });
    P.text(`×${load.toFixed(2)}`, xAccel - 10, cy,
      { font: F.small, color: load > 1.25 ? C.warn : C.inkDim, align: 'right' });
    P.label('ACCEL', xAccel, cy, { color: C.inkFaint });
    P.text(fmtSigned((accelPct - 1) * 100), xAccel + wAccelCell, cy,
      { font: F.small, color: accelPct < 0.9 ? C.warn : C.inkDim, align: 'right' });
    P.label('TURN', xTurn, cy, { color: C.inkFaint });
    P.text(fmtSigned((turnPct - 1) * 100), x + iw, cy,
      { font: F.small, color: turnPct < 0.9 ? C.warn : C.inkDim, align: 'right' });
  }

  /** One row of the layer stack: name, bar, figure, and its own signed rate. */
  _layerRow(P, x, y, w, name, frac, figure, rate, color) {
    const pitch = this.L?.layerRowH ?? 15;
    const absent = frac === null;
    P.label(name, x, y + 8, { color: absent ? C.inkFaint : C.inkDim });
    const bx = x + 54;
    /**
     * The figure and the rate get MEASURED lanes, not a fixed 116 px off a 322 px
     * panel and not a fraction of it either. `13004/21320` is 75 px on its own and a
     * 0.36 fraction of a 258 px block leaves 93 for the figure AND the rate together,
     * which printed `13004/21320` straight through `0.0`.
     */
    const figW = P.measure('88888/88888', F.small, TRACK.value);
    const rateW = P.measure('−88.8', F.bodyBold, TRACK.value);
    const tail = Math.min(Math.round(w * 0.62), figW + rateW + 22);
    const bw = Math.max(24, w - 54 - tail);
    const figX = bx + bw + 7;
    const figMax = Math.max(20, x + w - rateW - 10 - figX);
    if (absent) {
      // An absent layer is an absent layer: an empty track with a strike through it
      // and the words at full ink. Not a faded row nobody can read.
      P.bar(bx, y + 1, bw, 8, 0, { track: C.track, struck: true });
      P.text(figure, figX, y + 8, { font: F.small, color: C.inkFaint, maxW: figMax });
      P.text('--', x + w, y + 8, { font: F.small, color: C.inkFaint, align: 'right' });
      return y + pitch;
    }
    P.bar(bx, y + 1, bw, 8, frac, { color, track: C.track, segments: 10 });
    P.text(figure, figX, y + 8, { font: F.small, color: C.inkDim, maxW: figMax });
    const rising = rate > 0.05;
    const falling = rate < -0.05;
    P.text(`${rising ? '+' : falling ? '−' : ''}${Math.abs(rate).toFixed(1)}`, x + w, y + 8, {
      font: F.bodyBold, color: falling ? C.warn : rising ? C.friendly : C.inkDim, align: 'right',
    });
    return y + pitch;
  }

  // =========================================================================
  // Target
  // =========================================================================

  get targetPanelW() { return this.L?.target.w ?? 372; }

  _drawTargetPanel(P, player) {
    const world = this.world;
    const combat = world.systems?.combat;
    const target = player?.target && !player.target.dead ? player.target : null;
    const L = this.L;
    const rect = L.target;

    const w = rect.w;
    const px = rect.x;
    const x = px + 12;
    const iw = w - 24;

    /**
     * NO LOCK IS ONE LINE.
     *
     * It was a 372 x 48 plate carrying the word `NO LOCK` and a hint — 17,856 logical
     * px², 1.2 % of a 1600x900 frame and 2.4 % of a 1280x720 one, held permanently by
     * a readout with nothing in it, in the corner a window would otherwise dock into.
     * The three-line version's own comment already argued this once ("a large black
     * rectangle with one word in it reads as a panel that has failed to load") and
     * then drew a smaller black rectangle with two words in it. The prompt is worth
     * keeping; the plate around it is not.
     */
    if (!target) {
      const py0 = rect.y;
      const end = P.struck('NO LOCK', x, py0 + 15, { font: F.micro, color: C.inkFaint });
      P.text('RIGHT-CLICK A CONTACT', end + 10, py0 + 15,
        { font: F.micro, color: C.inkDim, track: TRACK.label });
      return;
    }

    const py = rect.y;
    P.plate(px, py, w, rect.h, { border: C.rule });
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
    const roleX = x + Math.max(72, Math.round(iw * 0.28));
    P.text(`${(target.classDef.role ?? '').toUpperCase()} · ${target.classDef.length} M`,
      roleX, y + 15, {
        font: F.micro, color: C.inkFaint, track: TRACK.label,
        maxW: iw - (roleX - x) - P.measure('88.8 KM', F.bodyBold, TRACK.value) - 10,
      });
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
    const gaugeW = Math.max(40, iw - 106);
    const hullFrac = target.maxHullHP > 0 ? target.hullHP / target.maxHullHP : 1;
    P.label('HULL', x, y, { color: C.inkFaint });
    P.bar(x + 58, y - 7, gaugeW, 7, hullFrac, { color: C.hostile, track: C.hostileGhost, segments: 10 });
    P.text(fmtPct(hullFrac), x + iw, y, { font: F.bodyBold, color: C.ink, align: 'right' });
    y += 15;
    P.label('SALVAGE', x, y, { color: C.salvageDim });
    P.bar(x + 58, y - 7, gaugeW, 7, target.salvageIntegrity ?? 1,
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
    // On a frame that cannot afford the block, the legend is ONE line. The three
    // encodings still have to be named — an unexplained mark is decoration — but two
    // full lines of legend on a 720p frame is 24 px of the densest block in the HUD.
    if (L.compact) {
      P.label('DIM = OUT OF ARC · STRUCK = DEAD · ● = PART', x, cy,
        { color: C.inkFaint, maxW: iw });
      cy += 15;
    } else {
      P.label('DIM = OUT OF ARC · STRUCK = DESTROYED', x, cy, { color: C.inkFaint, maxW: iw });
      cy += 12;
      P.label('● = A WHOLE PART STILL COMES OUT OF THIS SECTION', x, cy,
        { color: C.inkFaint, maxW: iw });
      cy += 15;
    }

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
      cy += L.subRowH;
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
      // Right-aligning the state inside its own lane stopped the state words running
      // into each other, but not the state running into its OWN name: `INTACT` is
      // 46 px and a lane is 66 px on a narrow frame, so `FORE` and `INTACT` shared
      // 18 px of the same lane. The name is now clipped to what the state leaves.
      for (let i = 0; i < plates.length; i++) {
        const row = plates[i];
        const state = projectedSalvageState(row.condition, false);
        const ink = state === 'INTACT' ? C.salvage : state === 'DAMAGED' ? C.salvageDim : C.warn;
        const short = String(row.label).replace(' PLATING', '').slice(0, 4);
        const plateX = x + headW + i * stride;
        // Measured against THIS row's state word, not against the longest one the
        // column can hold: budgeting for `DAMAGED` everywhere clipped `FORE` to `FO…`
        // beside an `INTACT` that left 45 px of the lane empty.
        const shortMax = Math.max(14, stride - P.measure(state, F.micro, TRACK.label) - 10);
        P.text(short, plateX, cy,
          { font: F.micro, color: C.inkDim, track: TRACK.label, maxW: shortMax });
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

    const rect = this.L.stores;
    const w = rect.w;
    const px = rect.x;
    const py = rect.y;
    const h = rect.h;
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
      // Clipped to the strip: at 168 px of plate the full string is 168 px of type and
      // ran 10 px past its own border into the frame edge.
      P.struck(P.clip('POWER ROUTING SEALED', F.micro, iw - 14, TRACK.label), x, y + 8,
        { font: F.micro, color: C.inkFaint });
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
  /** The tab row's own width, so `layout.js` reserves what the row actually draws. */
  measureTabs(P) {
    const host = this.ui.panels;
    if (!host) return 0;
    let total = 0;
    for (const panel of host.panels) {
      total += P.measure(`${panel.hint} ${shortTitle(panel.title)}`, F.microBold, TRACK.label) + 16;
    }
    return total + P.measure('\\ HIDE', F.micro, TRACK.label) + 28;
  }

  _drawPanelTabs(P) {
    const host = this.ui.panels;
    if (!host) return;
    const rect = this.L.tabs;
    const y = rect.y + 6;
    // Measured, then plated, so the row is legible over a planet like everything else.
    let total = 0;
    for (const panel of host.panels) {
      total += P.measure(`${panel.hint} ${shortTitle(panel.title)}`, F.microBold, TRACK.label) + 16;
    }
    const hintW = P.measure('\\ HIDE', F.micro, TRACK.label) + 14;
    P.plate(rect.x, y - 4, total + hintW + 14, 24, { border: C.ruleDim });
    let x = rect.x + 6;
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
