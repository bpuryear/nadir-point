/**
 * THE CUTTING BEAM.
 *
 * Salvage is the point of the game, so the cut cannot look like a weapon that happens
 * to be pointed at a corpse. Three things separate it and all three are deliberate:
 *
 *   COLOUR    The beam runs on the palette's salvage cyan, which is a TOOL colour -
 *             nothing shoots cyan except Concord, and Concord's beams are needle-thin
 *             and steady while this one is fat and visibly cycling. The heat at the
 *             contact is amber, because that is molten hull, not beam energy.
 *   RHYTHM    Travelling pulses run down the shaft at a few hertz and the whole beam
 *             breathes on a slow duty cycle. It reads as a machine with a power
 *             supply, not as a shot.
 *   RESIDUE   A weapon impact throws sparks and stops. A cut throws a continuous
 *             spray of spatter and sheds glowing slag that arcs away and cools over
 *             several seconds. That persistence is what says "this takes time".
 *
 * The progress gauge is drawn in the world at the contact point rather than in the
 * HUD, because the player's eyes are on the wreck, and a cut that drifts out of range
 * has to be legible without a glance away.
 *
 * The tow effect is the same beam family, wider and much dimmer, with a containment
 * ring around the section in transit so a part crossing the frame is unmistakable.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { NEUTRAL } from '../art/palette.js';
import { FIRE, hdr, shipLocalToWorld, hullRadius } from './common.js';
import { PKIND } from './particles.js';
import { BEAM_STYLE } from './weapons.js';

const CUT = hdr(NEUTRAL.salvage, 2.8, 'vfx.salvage.cut');
const TOW = hdr(NEUTRAL.salvage, 1.1, 'vfx.salvage.tow');

export class SalvageVFX {
  constructor(world, { particles, rings, weapons, rng }) {
    this.world = world;
    this.particles = particles;
    this.rings = rings;
    this.weapons = weapons;
    this.rng = rng;

    this._sparkTimer = 0;
    this._slagTimer = 0;
    this._armWorld = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._active = false;

    this._offStart = world.bus.on(EV.SALVAGE_CUT_START, (e) => this.onCutStart(e));
    this._offStop = world.bus.on(EV.SALVAGE_CUT_STOP, () => this.onCutStop());
    this._offGot = world.bus.on(EV.SALVAGE_ACQUIRED, (e) => this.onAcquired(e));
  }

  get salvage() { return this.world.systems?.salvage ?? null; }

  /**
   * Where the cutting arm sits on the player hull. Prefers the declared salvage
   * cradle so the beam comes out of the thing that is visibly a salvage cradle.
   */
  armPosition(ship, out) {
    if (!ship) return null;
    let lx = 0, ly = -hullRadius(ship) * 0.16, lz = hullRadius(ship) * 0.55;
    if (ship.subsystems) {
      for (const s of ship.subsystems.values()) {
        if (s.def.kind !== 'hangar') continue;
        lx = s.def.position[0]; ly = s.def.position[1]; lz = s.def.position[2];
        break;
      }
    }
    return shipLocalToWorld(ship, lx, ly, lz, out);
  }

  onCutStart({ section }) {
    this._active = true;
    const p = this.world.player;
    if (!p || !section) return;
    const a = this.armPosition(p, this._armWorld);
    // Pre-charge bloom at the arm. Reads as the tool spooling up.
    const P = this.particles;
    P.begin(PKIND.FIRE);
    P.setColor(CUT, 2.0);
    P.spec.life = 0.35;
    P.spec.size0 = 6;
    P.spec.size1 = 54;
    P.spec.drag = 5;
    P.spawn(a.x, a.y, a.z, 0, 0, 0);
  }

  onCutStop() {
    this._active = false;
    this.rings.releaseArc('salvage:cut');
  }

  onAcquired() {
    const p = this.world.player;
    if (!p) return;
    const a = this.armPosition(p, this._armWorld);
    const P = this.particles;
    P.begin(PKIND.FIRE);
    P.setColor(CUT, 1.5);
    P.spec.life = 0.5;
    P.spec.size0 = 10;
    P.spec.size1 = 120;
    P.spec.drag = 4;
    P.spawn(a.x, a.y, a.z, 0, 0, 0);
    this.rings.shockwave(a.x, a.y, a.z, 0, 1, 0, 20, 180, 0.6, CUT, 0.8, 0.13);
  }

  // -------------------------------------------------------------- per frame

  /** Push the cutting and tow beams. Runs in the same sample phase as weapons. */
  sample(camera) {
    const sys = this.salvage;
    const player = this.world.player;
    if (!sys || !player || !this.weapons) return;

    const arm = this.armPosition(player, this._armWorld);

    // --- the cut ---------------------------------------------------------
    const c = sys.cutting;
    if (c?.section) {
      const t = c.section.worldPosition;
      this.weapons.beams.push(
        arm.x, arm.y, arm.z, t.x, t.y, t.z,
        11.0, BEAM_STYLE.INDUSTRIAL, CUT, 1.0,
      );

      // Progress gauge, billboarded so it is always a circle to the player.
      const radius = Math.max(46, (c.section.radius ?? 40) * 1.7);
      if (camera) this._n.copy(camera.position).sub(t).normalize();
      else this._n.set(0, 1, 0);
      this.rings.arc(
        'salvage:cut', t.x, t.y, t.z, this._n.x, this._n.y, this._n.z,
        radius, Math.max(0, Math.min(1, c.section.cutProgress)),
        CUT, 1.35, 0.05,
      );
    } else {
      this.rings.releaseArc('salvage:cut');
    }

    // --- sections under tow ----------------------------------------------
    const tows = sys.inTow;
    if (tows) {
      for (let i = 0; i < tows.length && i < 8; i++) {
        const t = tows[i];
        this.weapons.beams.push(
          arm.x, arm.y, arm.z, t.position.x, t.position.y, t.position.z,
          22.0, BEAM_STYLE.INDUSTRIAL, TOW, 0.55,
        );
        const r = Math.max(34, (t.section?.radius ?? 30) * 1.5);
        if (camera) this._n.copy(camera.position).sub(t.position).normalize();
        else this._n.set(0, 1, 0);
        this.rings.arc(
          `salvage:tow${i}`, t.position.x, t.position.y, t.position.z,
          this._n.x, this._n.y, this._n.z, r, 1.0, CUT, 0.55, 0.055,
        );
      }
      for (let i = tows.length; i < 8; i++) this.rings.releaseArc(`salvage:tow${i}`);
    }
  }

  /** Contact-point spatter and slag. Sim rate, so it stops dead at pause. */
  fixedUpdate(dt) {
    const sys = this.salvage;
    const player = this.world.player;
    const c = sys?.cutting;
    if (!c?.section || !player) return;

    const arm = this.armPosition(player, this._armWorld);
    const t = c.section.worldPosition;

    // Back along the beam, so spatter comes off the cut towards the cutter.
    let bx = arm.x - t.x, by = arm.y - t.y, bz = arm.z - t.z;
    const l = Math.hypot(bx, by, bz) || 1;
    bx /= l; by /= l; bz /= l;

    const P = this.particles;
    const scale = Math.max(18, (c.section.radius ?? 40));

    this._sparkTimer -= dt;
    if (this._sparkTimer <= 0) {
      this._sparkTimer = 0.035;
      P.begin(PKIND.SPARK);
      P.setColor(FIRE.spark, 0.6);
      P.spec.life = 0.22 + this.rng.next() * 0.22;
      P.spec.size0 = scale * 0.075;
      P.spec.size1 = 0.4;
      P.spec.drag = 2.4;
      P.spec.turbulence = 3;
      P.burst(7, t.x, t.y, t.z, bx, by, bz, 0.85, 60, 420);

      // A steady white-hot bead sitting in the kerf.
      P.begin(PKIND.FIRE);
      P.setColor(FIRE.hot, 0.45);
      P.spec.life = 0.14;
      P.spec.size0 = scale * 0.30;
      P.spec.size1 = scale * 0.9;
      P.spec.drag = 6;
      P.spawn(t.x, t.y, t.z, 0, 0, 0);
    }

    this._slagTimer -= dt;
    if (this._slagTimer <= 0) {
      this._slagTimer = 0.16;
      P.begin(PKIND.EMBER);
      P.setColor(FIRE.slag, 0.9);
      P.spec.life = 2.6 + this.rng.next() * 1.8;
      P.spec.size0 = scale * 0.11;
      P.spec.size1 = scale * 0.035;
      P.spec.drag = 0.55;
      P.spec.turbulence = 4;
      P.burst(3, t.x, t.y, t.z, bx * 0.3, -1, bz * 0.3, 0.7, 25, 130);
    }
  }

  dispose() {
    this._offStart?.();
    this._offStop?.();
    this._offGot?.();
  }
}
