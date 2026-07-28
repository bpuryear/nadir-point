/**
 * THE TACTICAL OVERLAY.
 *
 * This layer exists to make ONE idea visible: on a plane-locked warship, facing and
 * subsystem targeting are the same problem. Everything drawn here serves that.
 *
 *   FIRING ARCS are drawn as real wedges on the combat plane, projected through the
 *   live camera, at their true range in metres. Not a schematic in a corner - on the
 *   ground, where the target is, so the player can see the enemy sitting eleven
 *   degrees outside the port battery and understand instantly that the answer is to
 *   turn, not to click harder.
 *
 *   THE SUBSYSTEM RING greys every entry that `combat.canAnyWeaponBear()` returns
 *   false for. That grey-out is the teaching mechanism. Without it the ring is a
 *   decorative list of parts and the spatial layer never lands - which is exactly
 *   what docs/design/controls.md §1.7 says, and it is the reason `canAnyWeaponBear`
 *   was asked of the combat stream in the first place.
 *
 *   THE BEARING READOUT turns `combat.bearingReport()` into a sentence. Six arc
 *   wedges are a diagram; "TURN TO PORT 47°" is an instruction. The player needs
 *   both, and needs them to agree.
 *
 * Zero draw calls in the 3D scene. Every wedge, ring and bracket is a projected
 * polygon on the 2D overlay.
 */

import * as THREE from 'three';
import { RANGE } from '../core/units.js';
import { angleDelta, yawOf } from '../sim/physics.js';
import {
  C, F, TRACK, screenPointRing, fmtRange, fmtPct, smoothstep, arcUnion,
} from './theme.js';

const ARC_SEGS = 40;
const RING_SEGS = 72;

/**
 * Arc-centre bearings named the way hardpoints.js names them: +PI/2 is the PORT
 * sponson, -PI/2 is starboard, 0 is the bow, PI is astern. Turn direction in the
 * readout uses the SAME sign convention, so "turn to port" always means the
 * rotation that walks a mount centred at +PI/2 onto the target. The interface is
 * internally consistent even where two upstream documents disagree about which
 * world axis carries which name.
 */
export function bearingName(yawCentre) {
  const a = ((yawCentre % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI * 0.25 || a > Math.PI * 1.75) return 'BOW';
  if (a < Math.PI * 0.75) return 'PORT';
  if (a < Math.PI * 1.25) return 'ASTERN';
  return 'STARBOARD';
}

export class TacticalOverlay {
  constructor(ui) {
    this.ui = ui;
    this.world = ui.world;
    this.enabled = true;

    this._arc = screenPointRing(ARC_SEGS + 2);
    this._ring = screenPointRing(RING_SEGS + 1);
    this._pt = { x: 0, y: 0, z: 0, ok: false };
    this._pt2 = { x: 0, y: 0, z: 0, ok: false };
    this._subs = [];
    for (let i = 0; i < 16; i++) {
      this._subs.push({ sub: null, x: 0, y: 0, ok: false, angle: 0, bears: false });
    }
    this._dash = [4, 5];
    this._rings = [];
    this._cov = [];
  }

  draw(P) {
    if (!this.enabled) return;
    const world = this.world;
    const player = world.player;
    if (!player || player.dead) return;
    const combat = world.systems?.combat;

    // Arcs are the floor of the overlay; contacts and the target ring sit on them.
    if (combat) this._drawArcs(P, player, combat);
    this._drawRangeRings(P, player);
    this._drawContacts(P, player);
    const target = player.target && !player.target.dead ? player.target : null;
    if (target) this._drawTargetRing(P, player, target, combat);
    this._drawCoverageRose(P, player, combat);
  }

  // =========================================================================
  // Firing arcs, on the plane, in metres
  // =========================================================================

  /**
   * TWO RADII PER ARC, and the split is the whole reason this reads.
   *
   * A rail battery reaches 9.5 km. At any tactical framing that circle is off the
   * frame, so drawing the wedge at true range gives you nothing but two enormous
   * straight lines crossing the picture from corner to corner - which is noise, not
   * information, and it buries the one wedge that is actually on target.
   *
   * So each mount is drawn twice:
   *   - a NEAR ROSE, filled, out to a radius set by the camera distance. This is the
   *     angular information, which is what facing is about, and it nests all six
   *     mounts into one readable figure around the hull.
   *   - the TRUE RANGE arc, one hairline, no radial edges, wherever it lands. Often
   *     off-frame, which is itself the correct statement: this mount outranges what
   *     you are looking at. The dashed range rings and the wedge label carry the
   *     metres.
   */
  _drawArcs(P, player, combat) {
    const proj = this.ui.projector;
    const arcs = combat.describeArcs(player);
    if (!arcs.length) return;

    // The rose is deliberately SMALL. It sits around the hull like a compass drawn on
    // the plane; grown any larger the wide mounts (the dorsal bed is 306 degrees)
    // become a translucent disc over half the frame and the negative space that makes
    // this game legible is gone.
    // Clear of the hull by a wide margin: an arc boundary drawn ACROSS the ship reads
    // as damage, not as a limit.
    const camDist = proj.camera ? proj.camera.position.distanceTo(player.position) : 4000;
    const hullR = player.radius ?? 600;
    const roseR = Math.max(hullR * 3.0, Math.min(camDist * 0.34, 3600));

    // Bearing wedges last, so a live firing solution is never drawn under a wedge
    // that cannot reach the target.
    arcs.sort((a, b) => (a.bearing === b.bearing ? 0 : a.bearing ? 1 : -1));

    for (const a of arcs) {
      const range = Math.min(a.range, 14000);
      const ox = a.origin.x;
      const oz = a.origin.z;
      const bearing = a.bearing && a.online;
      const stroke = !a.online ? C.inkGhost : bearing ? C.hostile : C.inkFaint;

      // A 2*PI "arc" is a utility mount - the salvage cradle is declared full-circle
      // by hardpoints.js - not a firing arc. It gets a bare range circle.
      if (a.width >= Math.PI * 1.98) {
        this._planeRing(P, ox, oz, range, C.salvageGhost, 1, this._dash);
        continue;
      }

      const near = Math.min(range, roseR);
      // Fill only what is ON TARGET, and only when the wedge is narrow enough for a
      // fill to read as a wedge. Everything else is an outline. One filled shape in
      // the frame means the eye finds the firing solution without being told.
      const fillA = bearing && a.width < Math.PI * 1.15 ? 0.10 : 0;
      const n = ARC_SEGS;
      const count = n + 2;

      // --- near rose --------------------------------------------------------
      let allOk = proj.point(ox, 0, oz, this._arc[0]);
      for (let i = 0; i <= n; i++) {
        const ang = a.centre - a.width * 0.5 + a.width * (i / n);
        const ok = proj.point(ox + Math.sin(ang) * near, 0, oz + Math.cos(ang) * near, this._arc[i + 1]);
        allOk = allOk && ok;
      }
      if (allOk && fillA > 0) {
        P.polyline(this._arc, count, { stroke: null, close: true, fill: wedgeFill(bearing, fillA) });
      }
      // The outer arc is the graphic. The two radial limits are drawn dashed and
      // faint: at this scale they are hundreds of pixels long, and solid they read as
      // two lines slashed across the frame rather than as the edges of a wedge.
      P.ctx.globalAlpha = bearing ? 0.72 : 0.5;
      P.polyline(this._arc, count, {
        stroke, weight: bearing ? 1.3 : 1, close: false, dash: a.online ? null : this._dash,
      });
      if (this._arc[0].ok) {
        P.ctx.globalAlpha = bearing ? 0.4 : 0.28;
        const first = this._arc[1], last = this._arc[n + 1];
        if (first.ok) P.leader(this._arc[0].x, this._arc[0].y, first.x, first.y, stroke, 1, this._dash);
        if (last.ok) P.leader(this._arc[0].x, this._arc[0].y, last.x, last.y, stroke, 1, this._dash);
      }
      P.ctx.globalAlpha = 1;

      // --- true range arc ---------------------------------------------------
      if (range > near * 1.02) {
        for (let i = 0; i <= n; i++) {
          const ang = a.centre - a.width * 0.5 + a.width * (i / n);
          proj.point(ox + Math.sin(ang) * range, 0, oz + Math.cos(ang) * range, this._arc[i]);
        }
        P.polyline(this._arc, n + 1, {
          stroke: bearing ? C.hostileDim : C.inkGhost, weight: 1, close: false, dash: this._dash,
        });
      }

      // Label sits on the near rose, where the eye already is, and yields to
      // anything the frame has already reserved.
      const mid = a.centre;
      if (proj.point(ox + Math.sin(mid) * near * 0.84, 0, oz + Math.cos(mid) * near * 0.84, this._pt)
        && this._pt.x > 130 && this._pt.x < P.w - 130 && this._pt.y > 40 && this._pt.y < P.h - 40) {
        P.textIfClear(`${a.type.toUpperCase()} ${fmtRange(a.range)}`, this._pt.x, this._pt.y, {
          font: F.micro, color: bearing ? C.hostile : C.inkFaint,
          align: 'center', track: TRACK.label,
        });
      }
    }
  }

  // =========================================================================
  // Range rings
  // =========================================================================

  _drawRangeRings(P, player) {
    const rings = this._rings;
    rings.length = 0;
    const seen = new Set();
    for (const m of player.weapons ?? []) {
      // Point defence and the salvage cutter are not engagement envelopes. A mining
      // ring at 1.8 km next to a tractor ring at 2.4 km is two labels for one fact.
      if (!m.online || m.def.type === 'pd' || m.def.type === 'mining') continue;
      const r = Math.round(m.def.range);
      if (seen.has(r)) continue;
      seen.add(r);
      rings.push({ r, label: m.def.type.toUpperCase() });
    }
    rings.sort((a, b) => a.r - b.r);
    const salvage = this.world.systems?.salvage;
    if (salvage) {
      const r = Math.round(RANGE.salvageBeam * (1 + (salvage.tractorRating ?? 0) * 0.4));
      rings.push({ r, label: 'TRACTOR', salvage: true, alwaysLabel: true });
    }

    const shown = rings.slice(0, 5);
    for (let k = 0; k < shown.length; k++) {
      const ring = shown[k];
      this._planeRing(P, player.position.x, player.position.z, ring.r,
        ring.salvage ? C.salvageGhost : C.inkGhost, 1, this._dash);
      // Only the outermost weapon envelope and the tractor get a caption. The rest
      // are already named by their arc wedge, and five captions round five ellipses
      // is how a tactical display becomes wallpaper.
      const isOuter = k === shown.length - 1 || (k === shown.length - 2 && shown[shown.length - 1].salvage);
      if (!ring.alwaysLabel && !isOuter) continue;
      const start = Math.round(((k * 2 + 1) / (shown.length * 2)) * RING_SEGS);
      for (let step = 0; step < RING_SEGS; step++) {
        const i = (start + (step % 2 ? -1 : 1) * Math.ceil(step / 2) + RING_SEGS * 2) % RING_SEGS;
        const p = this._ring[i];
        if (!p.ok || p.x < 150 || p.x > P.w - 150 || p.y < 40 || p.y > P.h - 130) continue;
        if (!P.textIfClear(`${ring.label} ${fmtRange(ring.r)}`, p.x, p.y - 4, {
          font: F.micro, color: ring.salvage ? C.salvageDim : C.inkGhost,
          align: 'center', track: TRACK.label,
        })) continue;
        break;
      }
    }
  }

  _planeRing(P, cx, cz, metres, color, weight, dash) {
    const proj = this.ui.projector;
    let any = false;
    for (let i = 0; i <= RING_SEGS; i++) {
      const a = (i / RING_SEGS) * Math.PI * 2;
      any = proj.point(cx + Math.cos(a) * metres, 0, cz + Math.sin(a) * metres, this._ring[i]) || any;
    }
    if (any) P.polyline(this._ring, RING_SEGS + 1, { stroke: color, weight, close: true, dash });
    return any;
  }

  // =========================================================================
  // Contacts
  // =========================================================================

  _drawContacts(P, player) {
    const proj = this.ui.projector;
    const world = this.world;

    for (const s of world.ships) {
      if (s === player || s.dead) continue;
      if (!proj.vec(s.position, this._pt)) continue;
      if (this._pt.x < -60 || this._pt.x > P.w + 60 || this._pt.y < -40 || this._pt.y > P.h + 40) continue;
      const hostile = world.areHostile(player.faction, s.faction);
      const col = hostile ? C.hostileDim : C.friendlyDim;
      const r = Math.max(7, proj.radiusAt(s.position, s.radius ?? 40));
      // A hard tick, not a circle. Circles read as soft; this is a warship display.
      P.rule(this._pt.x - r, this._pt.y - r, r * 2, P.hair, col);
      P.rule(this._pt.x - r, this._pt.y + r, r * 2, P.hair, col);
      if (r > 12) {
        P.textIfClear(s.classDef.name.toUpperCase(), this._pt.x, this._pt.y + r + 12,
          { font: F.micro, color: col, align: 'center', track: TRACK.label });
      }
    }

    for (const wreck of world.wrecks) {
      if (!wreck.body || !proj.vec(wreck.body.position, this._pt)) continue;
      if (this._pt.x < -60 || this._pt.x > P.w + 60) continue;
      const r = Math.max(9, proj.radiusAt(wreck.body.position, wreck.body.radius ?? 60));
      P.diamond(this._pt.x, this._pt.y, r * 0.5, { stroke: C.salvageDim, weight: 1 });
      const live = wreck.sections.filter((s) => s.cuttable).length;
      P.textIfClear(`HULK · ${live} SECTIONS`, this._pt.x, this._pt.y - r * 0.5 - 7,
        { font: F.micro, color: C.salvageDim, align: 'center', track: TRACK.label });
    }
  }

  // =========================================================================
  // Target ring and subsystem segments
  // =========================================================================

  _drawTargetRing(P, player, target, combat) {
    const proj = this.ui.projector;
    if (!proj.vec(target.position, this._pt)) return;
    const cx = this._pt.x;
    const cy = this._pt.y;

    const hullR = Math.max(22, proj.radiusAt(target.position, target.radius ?? 60));
    const ringR = Math.max(82, hullR * 1.7);

    // Hard bracket on the hull.
    P.corners(cx, cy, hullR, hullR * 0.74, Math.min(16, hullR * 0.5), C.hostile, 1.5);

    // Ring track.
    const c = P.ctx;
    c.beginPath();
    c.arc(cx, cy, ringR, 0, Math.PI * 2);
    c.strokeStyle = C.hostileGhost;
    c.lineWidth = 1;
    c.stroke();

    // Place each subsystem segment at the angle of its ACTUAL screen offset, so the
    // ring is anchored to the geometry rather than being an arbitrary pie chart.
    const subs = this._subs;
    let n = 0;
    const aimed = player.targetSubsystem;
    for (const s of target.subsystems.values()) {
      if (n >= subs.length) break;
      const e = subs[n];
      e.sub = s;
      e.ok = proj.vec(s.worldPosition, this._pt2);
      e.x = this._pt2.x;
      e.y = this._pt2.y;
      const dx = e.x - cx, dy = e.y - cy;
      e.angle = Math.hypot(dx, dy) > 5 ? Math.atan2(dy, dx) : (n / Math.max(1, target.subsystems.size)) * Math.PI * 2;
      e.bears = !s.destroyed && !!combat && combat.canAnyWeaponBear(player, s);
      n++;
    }

    const halfSpan = Math.min(0.34, (Math.PI * 2) / Math.max(4, n) * 0.40);
    for (let i = 0; i < n; i++) {
      const e = subs[i];
      const s = e.sub;
      const dead = s.destroyed;
      const frac = s.maxHP > 0 ? s.hp / s.maxHP : 0;
      const isAim = aimed === s.def.id;

      // GREY = no installed weapon can bear from this relative bearing. This is the
      // teaching mechanism; it is deliberately the loudest state change on the ring.
      const col = dead ? C.inkGhost : e.bears ? C.hostile : C.inkFaint;
      const track = dead ? C.inkGhost : e.bears ? C.hostileGhost : C.inkGhost;

      const a0 = e.angle - halfSpan;
      const a1 = e.angle + halfSpan;
      c.lineWidth = isAim ? 6 : 4;
      c.beginPath();
      c.arc(cx, cy, ringR, a0, a1);
      c.strokeStyle = track;
      c.stroke();
      if (!dead && frac > 0) {
        c.beginPath();
        c.arc(cx, cy, ringR, a0, a0 + (a1 - a0) * frac);
        c.strokeStyle = col;
        c.stroke();
      }
      if (isAim) {
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx, cy, ringR + 6, a0, a1);
        c.strokeStyle = C.hostile;
        c.stroke();
        c.beginPath();
        c.arc(cx, cy, ringR - 6, a0, a1);
        c.stroke();
      }

      // Leader from the segment to the part it is describing.
      const lx = cx + Math.cos(e.angle) * (ringR - 8);
      const ly = cy + Math.sin(e.angle) * (ringR - 8);
      if (e.ok) P.leader(lx, ly, e.x, e.y, dead ? C.inkGhost : e.bears ? C.hostileDim : C.inkGhost, 1);

      // A cross on the part itself. Hollow when it is gone.
      if (e.ok) {
        const k = dead ? 3 : 4;
        P.rule(e.x - k, e.y, k * 2, P.hair, col);
        P.rule(e.x, e.y - k, P.hair, k * 2, col);
      }

    }

    // --- labels, de-overlapped ---------------------------------------------
    // Nine subsystems on one ring will always collide if each label is drawn at its
    // own angle. Split by side, sort down the screen and push apart to a minimum
    // pitch, keeping a leader back to the segment so the association survives.
    for (const side of [-1, 1]) {
      const list = [];
      for (let i = 0; i < n; i++) {
        const e = subs[i];
        if ((Math.cos(e.angle) >= 0 ? 1 : -1) !== side) continue;
        list.push({ e, y: cy + Math.sin(e.angle) * (ringR + 12) });
      }
      list.sort((a, b) => a.y - b.y);
      const pitch = 21;
      // Centre the stack on the group's own mean so it does not drift off the hull.
      let mean = 0;
      for (const it of list) mean += it.y;
      mean = list.length ? mean / list.length : cy;
      let yCursor = mean - ((list.length - 1) * pitch) / 2;
      for (const it of list) {
        it.ly = Math.max(yCursor, it.y - pitch * 1.5);
        yCursor = it.ly + pitch;
      }

      for (const it of list) {
        const e = it.e;
        const s = e.sub;
        const dead = s.destroyed;
        const frac = s.maxHP > 0 ? s.hp / s.maxHP : 0;
        const isAim = aimed === s.def.id;
        const tx = cx + side * (ringR + 16);
        const align = side < 0 ? 'right' : 'left';
        const anchorX = cx + Math.cos(e.angle) * (ringR + 3);
        const anchorY = cy + Math.sin(e.angle) * (ringR + 3);
        P.leader(anchorX, anchorY, tx - side * 4, it.ly - 3,
          dead ? C.inkGhost : e.bears ? C.hostileGhost : C.inkGhost, 1);

        const name = (s.def.label ?? s.def.id).toUpperCase();
        P.text(dead ? `${name} ✕` : name, tx, it.ly, {
          font: isAim ? F.microBold : F.micro,
          color: dead ? C.inkGhost : e.bears ? C.ink : C.inkFaint,
          align, track: TRACK.label,
        });
        P.text(dead ? 'DESTROYED' : fmtPct(frac), tx, it.ly + 10, {
          font: F.micro,
          color: dead ? C.inkGhost : e.bears ? C.hostileDim : C.inkGhost,
          align,
        });
      }
    }

    // --- the sentence -------------------------------------------------------
    if (combat) {
      const rep = combat.bearingReport(player, target);
      const advice = this.ui.bearingAdvice(player, target, rep);
      const y = cy + ringR + 34;
      const txt = `${rep.bearing}/${rep.total} MOUNTS BEAR`;
      P.text(txt, cx, y, {
        font: F.microBold, color: rep.bearing > 0 ? C.friendly : C.warn,
        align: 'center', track: TRACK.head,
      });
      P.text(advice, cx, y + 13, {
        font: F.micro, color: rep.bearing > 0 ? C.inkFaint : C.warn,
        align: 'center', track: TRACK.label,
      });
    }
  }

  // =========================================================================
  // Coverage rose: which bearings this hull can currently answer
  // =========================================================================

  _drawCoverageRose(P, player, combat) {
    const R = 36;
    const cx = 404;
    const cy = P.h - 76;
    const c = P.ctx;

    P.label('ARC COVERAGE', cx - R, cy - R - 14, { color: C.inkFaint });

    // Ship-relative: bow at the top. This is the one place in the interface that is
    // NOT world-oriented, because the question it answers is "where do my guns
    // point relative to my nose".
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.strokeStyle = C.ruleDim;
    c.lineWidth = 1;
    c.stroke();

    const mounts = player.weapons ?? [];
    this._cov.length = 0;
    for (const m of mounts) {
      if (!m.online || m.def.type === 'pd') continue;
      const w = Math.min(m.yawWidth, Math.PI * 2);
      // Utility mounts are declared full-circle and would report 100 % coverage on a
      // hull with a hole in it. They are not weapons; they do not count.
      if (w < Math.PI * 1.98) this._cov.push({ centre: m.yawCentre, width: w });
      // Screen angle: bow (+Z, yaw 0) is up, and yaw increases clockwise on screen
      // so the rose matches the arcs drawn on the plane under a top-down camera.
      const a0 = -Math.PI * 0.5 + m.yawCentre - w * 0.5;
      const a1 = -Math.PI * 0.5 + m.yawCentre + w * 0.5;
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, R - 3, a0, a1);
      c.closePath();
      c.fillStyle = C.inkGhost;
      c.fill();
      c.beginPath();
      c.arc(cx, cy, R - 3, a0, a1);
      c.strokeStyle = C.inkFaint;
      c.lineWidth = 1;
      c.stroke();
    }

    // The bow tick and the hull axis. Hard marks, no chrome.
    P.rule(cx, cy - R - 5, P.hair, 10, C.ink);
    P.rule(cx - R - 5, cy, 10, P.hair, C.ruleDim);
    P.rule(cx + R - 5, cy, 10, P.hair, C.ruleDim);

    // Target bearing needle.
    const target = player.target && !player.target.dead ? player.target : null;
    if (target) {
      const rel = angleDelta(player.heading,
        yawOf(target.position.x - player.position.x, target.position.z - player.position.z));
      const a = -Math.PI * 0.5 + rel;
      const bears = !!combat && combat.bearingReport(player, target).bearing > 0;
      P.leader(cx, cy, cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9),
        bears ? C.friendly : C.warn, 1.5);
      P.diamond(cx + Math.cos(a) * (R + 9), cy + Math.sin(a) * (R + 9), 3,
        { fill: bears ? C.friendly : C.warn });
    }

    const pct = arcUnion(this._cov) / (Math.PI * 2);
    P.text(`${Math.round(pct * 100)}% OF CIRCLE`, cx, cy + R + 15, {
      font: F.micro, color: pct > 0.92 ? C.inkFaint : C.warnDim, align: 'center', track: TRACK.label,
    });
  }
}

// ---------------------------------------------------------------------------

const _wedgeCache = new Map();
function wedgeFill(bearing, alpha) {
  const key = `${bearing}|${alpha.toFixed(3)}`;
  let v = _wedgeCache.get(key);
  if (v === undefined) {
    const src = bearing ? C.hostile : C.ink;
    const nums = src.match(/[\d.]+/g) ?? ['255', '255', '255'];
    v = `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha.toFixed(3)})`;
    _wedgeCache.set(key, v);
  }
  return v;
}

/**
 * The sentence form of `combat.bearingReport()`.
 *
 * Returns which way to turn and how far, named after the mount that opens first.
 * Sign convention is documented on `bearingName` above.
 */
export function bearingAdvice(player, target, report, combat) {
  if (!player || !target) return '';
  if (report.bearing > 0) return 'FIRING SOLUTION';
  let best = null;
  let bestErr = Infinity;
  for (const m of player.weapons ?? []) {
    // Point defence is reactive, and a tractor beam on a full-circle utility mount
    // is never off bearing, so it would win this search every time and tell the
    // player to close to 1.8 km with a salvage arm. Neither is a commandable weapon.
    if (!m.online || m.def.type === 'pd' || m.def.type === 'mining') continue;
    if (m.yawWidth >= Math.PI * 1.98) continue;
    const dx = target.position.x - m.worldPosition.x;
    const dz = target.position.z - m.worldPosition.z;
    const rel = angleDelta(player.heading + m.yawCentre, yawOf(dx, dz));
    const err = Math.max(0, Math.abs(rel) - m.yawWidth * 0.5);
    if (err < bestErr) { bestErr = err; best = { m, rel }; }
  }
  if (!best) return 'NO WEAPONS INSTALLED';
  const dist = player.position.distanceTo(target.position);
  if (bestErr <= 1e-3 && dist > best.m.def.range) {
    return `CLOSE TO ${fmtRange(best.m.def.range)} — OUT OF RANGE`;
  }
  const side = best.rel > 0 ? 'PORT' : 'STARBOARD';
  const mount = bearingName(best.m.yawCentre);
  return `TURN TO ${side} ${Math.round((bestErr * 180) / Math.PI)}° — OPENS ${mount}`;
}

export { smoothstep, THREE };
