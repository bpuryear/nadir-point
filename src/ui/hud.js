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
  C, F, TRACK, Painter, screenPointRing, fmtRange, fmtPct,
  factionInk, smootherstep, smoothstep, projectedSalvageState, projectedYieldsModule,
} from './theme.js';

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
        P.label('ORDERED', this._pt.x, this._pt.y - 30, { color: C.friendlyDim, align: 'center' });
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
        P.text(fmtRange(dist), this._pt.x + 12, this._pt.y - 10,
          { font: F.small, color, track: TRACK.value });
        if (m.stage === 'rejected' && m.reason) {
          // On its own plate. A rejection reason is the one string in the interface
          // that has to survive being drawn over a starfield, a hull or an arc.
          const tw = P.measure(m.reason, F.microBold, TRACK.label);
          P.scrim(this._pt.x + 8, this._pt.y - 4, tw + 12, 15, { alpha: 0.86 });
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
        P.label(m.subsystem ? `AIM · ${m.subsystem}` : 'ENGAGE',
          this._pt.x, this._pt.y - r * grow * 0.74 - 8, { color, align: 'center' });
      }
    } else if (m.kind === 'salvage') {
      const s = m.section;
      const wp = s?.worldPosition;
      if (wp && proj.vec(wp, this._pt)) {
        const r = Math.max(14, proj.radiusAt(wp, (s.radius ?? 40) * 1.6)) * scale;
        P.corners(this._pt.x, this._pt.y, r, r, r * 0.5, color, 1.5);
        P.label(s.label ?? 'SECTION', this._pt.x, this._pt.y - r - 7, { color, align: 'center' });
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

    const cellW = 34, cellH = 17, gap = 3;
    const combatCount = TIME_SCALES_COMBAT.length;
    const extra = transitBand ? table.length - combatCount : 0;
    const totalW = combatCount * (cellW + gap) - gap + (extra ? 14 + extra * (cellW + gap) - gap : 0);
    let x = Math.round(P.w * 0.5 - totalW * 0.5);
    const y = 22;

    P.label('TIME', x, y - 7, { color: C.inkFaint });

    for (let i = 0; i < table.length; i++) {
      if (i === combatCount) {
        // The compression band is bracketed off: it is a different privilege, not
        // four more numbers on the same strip.
        P.label('TRANSIT', x + 4, y - 7, { color: C.salvageDim });
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
      P.text(txt, x + cellW * 0.5, y + 12, {
        font: F.microBold,
        color: active ? C.void : (inBand ? C.salvageDim : C.inkFaint),
        align: 'center', track: TRACK.label,
      });
      x += cellW + gap;
    }

    if (engine.paused) {
      const pulse = 0.55 + 0.45 * Math.sin(P.t * 3.4);
      P.hline(0, 0, P.w, C.warn, 2);
      P.text('SIMULATION HELD', P.w * 0.5, y + 32,
        { font: F.microBold, color: C.warn, align: 'center', track: TRACK.head, alpha: pulse });
    }

    const travel = this.world.systems?.travel;
    const st = travel?.status?.();
    if (st && st.state && st.state !== 'idle') {
      const line = st.state === 'spooling'
        ? `TRANSIT SPOOL ${st.spoolRemaining.toFixed(0)} S`
        : `TRANSIT ${st.state.toUpperCase()} · LEG ${st.leg + 1}/${st.legs}`;
      P.text(line, P.w * 0.5, y + 32,
        { font: F.microBold, color: C.salvage, align: 'center', track: TRACK.head });
    }
  }

  // =========================================================================
  // Own ship
  // =========================================================================

  _drawShipPanel(P, player) {
    const x = 28;
    const w = 306;
    const rows = HARDPOINTS.length;
    const rowH = 17;
    const blockH = rows * rowH + 34;
    let y = P.h - blockH - 92;

    P.scrim(x - 12, y - 26, w + 24, blockH + 108, { alpha: 0.62, fadeRight: true });

    if (!player) {
      P.label('NO HULL', x, y, { color: C.inkFaint });
      return;
    }

    const cls = player.classDef;
    P.text((cls?.name ?? 'CRUISER').toUpperCase(), x, y - 12,
      { font: F.midBold, color: C.inkStrong, track: TRACK.head });

    // --- hull ---------------------------------------------------------------
    const hullFrac = player.maxHullHP > 0 ? player.hullHP / player.maxHullHP : 1;
    const hullCrit = hullFrac < 0.3;
    P.label('HULL INTEGRITY', x, y + 4, { color: C.inkFaint });
    P.text(fmtPct(hullFrac), x + w, y + 4,
      { font: F.bodyBold, color: hullCrit ? C.warn : C.inkStrong, align: 'right' });
    P.bar(x, y + 9, w, 9, hullFrac, {
      color: hullCrit ? C.warn : C.ink, track: C.inkGhost, segments: 10, frame: false,
    });
    P.hline(x, y + 19, w, C.ruleDim);

    let cy = y + 34;

    if (player.shields?.max > 0) {
      P.label('SHIELD', x, cy, { color: C.inkFaint });
      P.bar(x + 52, cy - 6, w - 52, 5, player.shields.current / player.shields.max,
        { color: C.shield, track: C.inkGhost, segments: 8 });
      cy += 14;
    }

    // --- hardpoint structure ------------------------------------------------
    P.label('MOUNT STRUCTURE', x, cy, { color: C.inkFaint });
    P.label(`BREACH AT ${Math.round(BREACH_WARN_FRACTION * 100)}%`, x + w, cy,
      { color: C.warnDim, align: 'right' });
    P.hline(x, cy + 5, w, C.rule);
    cy += 16;

    const hullRes = this.world.hullResult;
    for (const id of HARDPOINTS) {
      const hp = player.hardpoints?.get(id);
      const frac = hp ? hp.structureHP / Math.max(1, hp.maxStructureHP) : 1;
      const breached = !!hp?.breached;
      const critical = !breached && !!hp?.module && frac <= BREACH_WARN_FRACTION;
      const def = hullRes?.hardpoints?.get(id)?.def;
      const mod = hp?.module?.def ?? hullRes?.hardpoints?.get(id)?.module ?? null;

      // A critical mount pulses, but never below three quarters. A warning that is
      // invisible at the trough of its own animation is not a warning.
      const pulse = critical ? 0.78 + 0.22 * Math.sin(P.t * 6.2) : 1;
      const nameCol = breached ? C.warn : critical ? C.warn : mod ? C.ink : C.inkGhost;

      P.label(MOUNT_LABEL[id] ?? id, x, cy + 8, { color: breached || critical ? C.warnDim : C.inkFaint });

      // Faction identity stripe: the one chromatic mark on this panel.
      if (mod) {
        const fi = factionInk(mod.faction);
        P.fill(x + 46, cy + 1, 2, 9, breached ? C.warnDim : fi.stripe);
      }

      const label = breached ? 'BREACHED — MOUNT LOST'
        : mod ? mod.name.toUpperCase()
          : (def?.label ? `${def.label.toUpperCase()} · EMPTY` : 'EMPTY');
      P.ctx.globalAlpha = pulse;
      P.text(clip(P, label, F.small, 120), x + 53, cy + 9,
        { font: F.small, color: nameCol, track: TRACK.value });
      P.ctx.globalAlpha = 1;

      const barX = x + w - 92;
      P.bar(barX, cy + 2, 62, 7, breached ? 0 : frac, {
        color: breached ? C.warnGhost : critical ? C.warn : C.inkDim,
        track: C.inkGhost,
        threshold: BREACH_WARN_FRACTION,
        thresholdColor: critical || breached ? C.warn : C.warnDim,
      });
      P.text(breached ? 'LOST' : fmtPct(frac), x + w, cy + 9, {
        font: F.small, color: breached || critical ? C.warn : C.inkDim, align: 'right',
      });

      cy += rowH;
    }

    // --- motion -------------------------------------------------------------
    P.hline(x, cy + 2, w, C.ruleDim);
    cy += 16;
    const speed = player.body?.speed ?? 0;
    const maxSpeed = Math.max(1, player.classDef?.maxSpeed ?? 180);
    P.label('VELOCITY', x, cy, { color: C.inkFaint });
    P.text(`${speed.toFixed(0)} M/S`, x + 78, cy, { font: F.small, color: C.ink });
    P.bar(x + 140, cy - 6, 90, 5, speed / maxSpeed, { color: C.inkDim, track: C.inkGhost, segments: 6 });
    const hdg = ((player.heading * 180) / Math.PI + 360) % 360;
    P.label('HDG', x + 240, cy, { color: C.inkFaint });
    P.text(`${hdg.toFixed(0).padStart(3, '0')}°`, x + w, cy, { font: F.small, color: C.ink, align: 'right' });
  }

  // =========================================================================
  // Target
  // =========================================================================

  _drawTargetPanel(P, player) {
    const world = this.world;
    const combat = world.systems?.combat;
    const target = player?.target && !player.target.dead ? player.target : null;

    const w = 322;
    const x = P.w - 28 - w;
    const y = P.h - 322;

    P.scrim(x - 14, y - 30, w + 28, 300, { alpha: 0.62, fadeLeft: true });
    P.label('TARGET', x, y - 14, { color: C.inkFaint });
    P.hline(x, y - 9, w, C.rule);

    if (!target) {
      P.text('NO LOCK', x, y + 8, { font: F.small, color: C.inkGhost, track: TRACK.label });
      P.text('RMB A CONTACT TO ENGAGE', x, y + 24,
        { font: F.micro, color: C.inkGhost, track: TRACK.label });
      return;
    }

    const fi = factionInk(target.faction);
    P.text(target.classDef.name.toUpperCase(), x, y + 10,
      { font: F.midBold, color: C.hostile, track: TRACK.head });
    P.fill(x, y + 16, 2, 10, fi.stripe);
    P.text(fi.name.toUpperCase(), x + 8, y + 25, { font: F.micro, color: fi.hue, track: TRACK.label });
    const dist = player ? player.position.distanceTo(target.position) : 0;
    P.text(`${(target.classDef.role ?? '').toUpperCase()} · ${target.classDef.length} M`,
      x + 92, y + 25, { font: F.micro, color: C.inkFaint, track: TRACK.label });
    P.text(fmtRange(dist), x + w, y + 25, { font: F.bodyBold, color: C.ink, align: 'right' });

    const hullFrac = target.maxHullHP > 0 ? target.hullHP / target.maxHullHP : 1;
    P.bar(x, y + 32, w, 6, hullFrac, { color: C.hostile, track: C.hostileGhost, segments: 10 });
    P.label('HULL', x, y + 48, { color: C.inkFaint });
    P.text(fmtPct(hullFrac), x + w, y + 48, { font: F.small, color: C.ink, align: 'right' });

    // Salvage integrity: the number the whole game is about.
    P.label('SALVAGE', x + 60, y + 48, { color: C.salvageDim });
    P.bar(x + 116, y + 42, 90, 4, target.salvageIntegrity ?? 1,
      { color: C.salvage, track: C.salvageGhost });

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

    let cy = y + 66;
    P.label('SUBSYSTEMS', x, cy, { color: C.inkFaint });
    P.label('GREY = NO MOUNT BEARS', x + 116, cy, { color: C.inkGhost });
    P.label('YIELD', x + w, cy, { color: C.salvageDim, align: 'right' });
    P.hline(x, cy + 5, w, C.ruleDim);
    cy += 16;

    const aimed = player?.targetSubsystem;
    for (const s of target.subsystems.values()) {
      const bears = !!(combat && player && !s.destroyed && combat.canAnyWeaponBear(player, s));
      const isAim = aimed === s.def.id;
      const dead = s.destroyed;
      const col = dead ? C.inkGhost : bears ? C.ink : C.inkFaint;

      if (isAim) {
        P.fill(x - 6, cy - 8, 3, 11, C.hostile);
        P.fill(x - 6, cy - 8, w + 6, 11, C.hostileGhost);
      }
      P.text((s.def.label ?? s.def.id).toUpperCase(), x, cy,
        { font: F.small, color: col, track: TRACK.value });
      if (dead) {
        // Struck through, not deleted. A subsystem you killed is information.
        const tw = P.measure((s.def.label ?? s.def.id).toUpperCase(), F.small, TRACK.value);
        P.rule(x, cy - 4, tw, P.hair, C.inkFaint);
      }
      P.label(s.def.kind, x + 108, cy, { color: dead ? C.inkGhost : C.inkFaint });

      const frac = s.maxHP > 0 ? s.hp / s.maxHP : 0;
      P.bar(x + 156, cy - 7, 44, 5, frac, {
        color: dead ? C.inkGhost : bears ? C.hostile : C.inkFaint,
        track: C.inkGhost,
      });
      P.text(dead ? 'DEST' : fmtPct(frac), x + 236, cy,
        { font: F.small, color: dead ? C.inkFaint : col, align: 'right' });

      const row = projection ? findSection(projection, s.def.id) : null;
      if (row) {
        const state = projectedSalvageState(row.condition, dead);
        const ink = state === 'INTACT' ? C.salvage : state === 'DAMAGED' ? C.salvageDim : C.warn;
        P.text(state, x + w, cy, { font: F.microBold, color: ink, align: 'right', track: TRACK.label });
        // A part only comes out of a section that is a module-bearing kind AND has not
        // been shot past scrap. The dot is the difference between "materials" and "the
        // thing you came for", and it disappears while the player watches.
        if (projectedYieldsModule(row, dead)) P.fill(x + 244, cy - 5, 4, 4, C.salvage);
      }
      cy += 14;
    }

    // Hull plating: three runs of structure that are not subsystems and never appeared
    // in this panel, yet carry a real share of what a hulk is worth.
    if (projection) {
      P.hline(x, cy - 6, w, C.ruleDim);
      cy += 8;
      P.label('PLATING', x, cy, { color: C.inkGhost });
      let plateX = x + 52;
      for (const row of projection) {
        if (row.kind !== 'hull') continue;
        const state = projectedSalvageState(row.condition, false);
        const ink = state === 'INTACT' ? C.salvage : state === 'DAMAGED' ? C.salvageDim : C.warn;
        const short = String(row.label).replace(' PLATING', '').slice(0, 4);
        P.text(short, plateX, cy, { font: F.micro, color: C.inkFaint, track: TRACK.label });
        P.text(state, plateX + 34, cy, { font: F.micro, color: ink, track: TRACK.label });
        plateX += 90;
      }
      cy += 12;
    }

    // --- bearing report -----------------------------------------------------
    cy += 6;
    P.hline(x, cy - 8, w, C.ruleDim);
    if (combat && player) {
      const rep = combat.bearingReport(player, target);
      const bearing = rep.bearing > 0;
      P.label('BEARING', x, cy + 6, { color: C.inkFaint });
      P.text(`${rep.bearing}/${rep.total}`, x + 66, cy + 6,
        { font: F.bodyBold, color: bearing ? C.friendly : C.warn });
      P.pips(x + 100, cy - 1, Math.max(1, rep.total), rep.bearing,
        { size: 5, gap: 3, color: bearing ? C.friendly : C.warn, empty: C.inkGhost });

      // Clipped to the space left by the pip row. An advice string that grows into
      // its own readout is worse than one that ends in an ellipsis.
      const advice = clip(P, this.ui.bearingAdvice(player, target, rep), F.microBold, w - 132);
      P.text(advice, x + w, cy + 6, {
        font: F.microBold, color: bearing ? C.friendlyDim : C.warn, align: 'right', track: TRACK.label,
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

    const x = P.w - 28;
    let y = 30;

    if (cargo) {
      const cap = Math.max(1, cargo.capacityM3);
      const used = cargo.usedM3();
      const frac = used / cap;
      const full = frac >= 0.995;
      P.label('HOLD', x - 152, y, { color: C.inkFaint });
      P.text(`${Math.round(used)} / ${Math.round(cap)} m3`, x, y, {
        font: F.bodyBold, color: full ? C.warn : frac > 0.9 ? C.ink : C.inkDim, align: 'right',
      });
      P.bar(x - 152, y + 4, 152, 5, frac, {
        color: full ? C.warn : C.salvage, track: C.inkGhost, segments: 8,
      });
      y += 20;
    } else {
      const cap = world.systems?.salvage?.cargoCapacity ?? 6;
      const held = world.inventory?.length ?? 0;
      P.label('HOLD', x - 152, y, { color: C.inkFaint });
      P.text(`${held}/${cap}`, x, y, { font: F.bodyBold, color: held >= cap ? C.warn : C.ink, align: 'right' });
      y += 15;
    }
    P.hline(x - 152, y - 6, 152, C.ruleDim);

    // Four pools now, not three: `electronics` landed with the material chain and was
    // never printed anywhere, which meant every cost quoted in it read as unpayable.
    // Two rows of two, on a fixed grid — a variable-width count followed by the next
    // label on the same line is the collision this panel had before.
    const mats = [['ALLOY', m.alloy], ['COMP', m.composite], ['ELEC', m.electronics], ['EXOTIC', m.exotic]];
    for (let i = 0; i < mats.length; i++) {
      const [k, v] = mats[i];
      const col = i % 2;
      const mx = x - 152 + col * 78;
      const my = y + 6 + Math.floor(i / 2) * 13;
      P.label(k, mx, my, { color: C.inkGhost });
      P.text(String(Math.round(v ?? 0)), mx + 68, my, {
        font: F.small, color: (v ?? 0) > 0 ? C.inkDim : C.inkGhost, align: 'right',
      });
    }
    y += 26;

    if (world.unlocked?.powerRouting === false) {
      P.label('PWR SEALED', x, y + 6, { color: C.inkGhost, align: 'right' });
    }
  }

  /**
   * WINDOW TABS.
   *
   * `reference-ui-language.md` §7 observed mode tabs along the top of the reference
   * frame — `B Build`, `F1 CAM`, `F2 TAC`, `F3 SYS` — keycap first, inline and
   * diegetic. Six systems that landed with no UI now have windows, and a window nobody
   * knows the key for is a window nobody opens. Open ones invert, which makes this a
   * state readout as well as a menu.
   */
  _drawPanelTabs(P) {
    const host = this.ui.panels;
    if (!host) return;
    let x = 24;
    const y = 16;
    P.label('WINDOWS', x, y - 6, { color: C.inkGhost });
    for (const panel of host.panels) {
      const label = `${panel.hint} ${shortTitle(panel.title)}`;
      const w = P.measure(label, F.microBold, TRACK.label) + 12;
      if (panel.open) P.fill(x, y, w, 14, C.ink);
      else P.frame(x, y, w, 14, C.ruleDim);
      P.text(label, x + 6, y + 10, {
        font: F.microBold, color: panel.open ? C.void : C.inkFaint, track: TRACK.label,
      });
      this.ui.hit.push({ kind: 'panel:tab', panelId: panel.id, x, y, w, h: 14 });
      x += w + 4;
    }
  }

  // =========================================================================
  // Notifications and the order bar
  // =========================================================================

  _drawNotifications(P) {
    const list = this.ui.notifications;
    let y = 112;
    for (let i = 0; i < list.count; i++) {
      const n = list.items[i];
      const age = P.t - n.t0;
      const a = THREE.MathUtils.clamp(1 - (age - n.ttl + 0.8) / 0.8, 0, 1) * smoothstep(age / 0.12);
      if (a <= 0.01) continue;
      const col = n.important ? C.select : C.inkDim;
      P.ctx.globalAlpha = a;
      P.fill(P.w * 0.5 - 190, y - 10, 3, 12, col);
      P.text(n.text.toUpperCase(), P.w * 0.5 - 180, y,
        { font: n.important ? F.bodyBold : F.small, color: col, track: TRACK.label });
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
    const y = 88;
    P.ctx.globalAlpha = a;
    const tw = P.measure(bar.text.toUpperCase(), F.bodyBold, TRACK.label);
    const x0 = P.w * 0.5 - tw * 0.5;
    P.scrim(x0 - 22, y - 14, tw + 44, 22, { alpha: 0.80 });
    P.fill(x0 - 12, y - 11, 3, 14, col);
    P.rule(x0 - 22, y - 14, tw + 44, P.hair, C.ruleDim);
    P.rule(x0 - 22, y + 7, tw + 44, P.hair, C.ruleDim);
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
    c.globalAlpha = 1;

    const camDist = proj.camera ? proj.camera.position.distanceTo(player.position) : 0;
    const tx = cx - dx * 46;
    const ty = cy - dy * 46;
    P.ctx.globalAlpha = THREE.MathUtils.clamp(1 - age / 3.2, 0, 1);
    P.text('HULL HIT', tx, ty - 5, { font: F.microBold, color: C.warn, align: 'center', track: TRACK.label });
    P.text(fmtRange(camDist), tx, ty + 8, { font: F.micro, color: C.warnDim, align: 'center' });
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
