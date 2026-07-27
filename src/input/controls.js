import * as THREE from 'three';
import { EV } from '../core/events.js';
import { TIME_SCALES } from '../core/units.js';
import { ORBIT } from '../camera/constants.js';
import { scratch } from '../core/world.js';

/**
 * Input and order issuing.
 *
 * The binding table lives in docs/design/controls.md §1. The hard rule from the
 * acceptance criteria is that EVERY order produces visible feedback within 100 ms.
 * That is not a rendering concern - it is enforced here, by emitting the feedback
 * event in the same call stack as the input, before the simulation has run at all.
 * The ship then takes as many seconds as its mass demands to actually comply, which
 * is the point: acknowledgement is instant, execution is heavy.
 */
export class Controls {
  constructor(world, { tactical, cinematic, domElement }) {
    this.world = world;
    this.bus = world.bus;
    this.engine = world.engine;
    this.tactical = tactical;
    this.cinematic = cinematic;
    this.dom = domElement;

    this.name = 'controls';
    this.order = 0;

    this.keys = new Set();
    this.pointer = new THREE.Vector2();   // NDC
    this.pointerPx = new THREE.Vector2();
    this.hovered = null;

    /** Set when the player is choosing a subsystem to target. */
    this.targetingMode = false;

    this._drag = null;
    this._resumeScaleIndex = 1;
    this._lastOrderAt = 0;

    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
  }

  dispose() {
    const el = this.dom;
    el.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    el.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  // --- pointer --------------------------------------------------------------

  _updatePointer(e) {
    const r = this.dom.getBoundingClientRect();
    this.pointerPx.set(e.clientX - r.left, e.clientY - r.top);
    this.pointer.set(
      (this.pointerPx.x / r.width) * 2 - 1,
      -(this.pointerPx.y / r.height) * 2 + 1,
    );
  }

  _onPointerDown = (e) => {
    this._updatePointer(e);
    this.dom.setPointerCapture?.(e.pointerId);

    if (e.button === 0) {
      this._drag = { button: 0, x: e.clientX, y: e.clientY, moved: 0 };
    } else if (e.button === 2) {
      this._drag = { button: 2, x: e.clientX, y: e.clientY, moved: 0 };
    } else if (e.button === 1) {
      this._drag = { button: 1, x: e.clientX, y: e.clientY, moved: 0 };
      this.tactical.setDragging(true);
    }
  };

  _onPointerMove = (e) => {
    this._updatePointer(e);
    const d = this._drag;
    if (!d) { this._updateHover(); return; }

    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);

    // LMB drag orbits, MMB drag pans. RMB drag sets a heading for the move order.
    if (d.button === 0) {
      this.tactical.orbit(dx, dy);
    } else if (d.button === 1) {
      this.tactical.pan(dx, dy, this.dom.clientHeight);
    }
  };

  _onPointerUp = (e) => {
    const d = this._drag;
    this._drag = null;
    this.tactical.setDragging(false);
    if (!d) return;

    const wasClick = d.moved < 6;
    if (!wasClick) return;

    if (e.button === 0) this._leftClick();
    else if (e.button === 2) this._rightClick();
  };

  _onWheel = (e) => {
    e.preventDefault();
    const notches = Math.sign(e.deltaY) * Math.min(3, Math.max(1, Math.abs(e.deltaY) / 100));
    const modifier = this.keys.has('shiftleft') || this.keys.has('shiftright') ? 'fine'
      : this.keys.has('controlleft') || this.keys.has('controlright') ? 'coarse' : 'none';
    const planePoint = this.tactical.screenToPlane(this.pointer.x, this.pointer.y, scratch.v1);
    this.tactical.zoom(notches, planePoint ? scratch.v1.clone() : null, modifier);
  };

  // --- selection and orders -------------------------------------------------

  _pickShip(maxScreenDist = 34) {
    // Screen-space pick. At tactical zoom a 1400 m cruiser is a handful of pixels, so
    // picking against projected centres with a generous radius beats a mesh raycast
    // both in feel and in cost.
    let best = null;
    let bestD = maxScreenDist;
    const r = this.dom.getBoundingClientRect();
    for (const ship of this.world.ships) {
      if (ship.dead) continue;
      scratch.v2.copy(ship.position).project(this.tactical.camera);
      if (scratch.v2.z > 1) continue;
      const sx = (scratch.v2.x * 0.5 + 0.5) * r.width;
      const sy = (-scratch.v2.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - this.pointerPx.x, sy - this.pointerPx.y);
      // Big things are easier to click, as they should be.
      const generosity = Math.max(0, Math.min(60, ship.radius / Math.max(1, this.tactical.distance) * r.height * 0.5));
      if (d < bestD + generosity) { bestD = d - generosity; best = ship; }
    }
    return best;
  }

  _pickWreckSection(maxScreenDist = 30) {
    const r = this.dom.getBoundingClientRect();
    let best = null;
    let bestD = maxScreenDist;
    for (const wreck of this.world.wrecks) {
      for (const s of wreck.sections) {
        if (!s.cuttable) continue;
        scratch.v2.copy(s.worldPosition).project(this.tactical.camera);
        if (scratch.v2.z > 1) continue;
        const sx = (scratch.v2.x * 0.5 + 0.5) * r.width;
        const sy = (-scratch.v2.y * 0.5 + 0.5) * r.height;
        const d = Math.hypot(sx - this.pointerPx.x, sy - this.pointerPx.y);
        if (d < bestD) { bestD = d; best = { wreck, section: s }; }
      }
    }
    return best;
  }

  _updateHover() {
    this.hovered = this._pickShip() ?? null;
  }

  _leftClick() {
    const ship = this._pickShip();
    this.world.selection.clear();
    if (ship) this.world.selection.add(ship);
    this.bus.emit(EV.SELECTION_CHANGED, { selection: [...this.world.selection] });
  }

  /**
   * The smart order. One button, context sensitive:
   *   hostile ship  -> attack (subsystem if one is under the cursor)
   *   wreck section -> cut
   *   empty plane   -> move
   */
  _rightClick() {
    const player = this.world.player;
    if (!player || player.dead) return;

    const enemy = this._pickShip();
    if (enemy && enemy !== player && this.world.areHostile(player.faction, enemy.faction)) {
      const sub = this._pickSubsystem(enemy);
      player.orderAttack(enemy, sub?.def.id ?? null);
      this._feedback('attack', { target: enemy, subsystem: sub?.def.id ?? null });
      return;
    }

    const cut = this._pickWreckSection();
    if (cut) {
      this.world.systems.salvage?.orderCut(cut.wreck, cut.section);
      this._feedback('salvage', { section: cut.section });
      return;
    }

    const point = this.tactical.screenToPlane(this.pointer.x, this.pointer.y, scratch.v1);
    if (point) {
      const p = point.clone();
      player.orderMove(p);
      this._feedback('move', { point: p });
    }
  }

  _pickSubsystem(ship, maxScreenDist = 26) {
    const r = this.dom.getBoundingClientRect();
    let best = null;
    let bestD = maxScreenDist;
    for (const s of ship.subsystems.values()) {
      if (s.destroyed) continue;
      scratch.v2.copy(s.worldPosition).project(this.tactical.camera);
      if (scratch.v2.z > 1) continue;
      const sx = (scratch.v2.x * 0.5 + 0.5) * r.width;
      const sy = (-scratch.v2.y * 0.5 + 0.5) * r.height;
      const d = Math.hypot(sx - this.pointerPx.x, sy - this.pointerPx.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /**
   * Order acknowledgement. Emitted synchronously with the input so the UI can put a
   * marker on screen this frame - the acceptance criterion is 100 ms and this path
   * costs microseconds. Execution then takes as long as the hull's mass demands.
   */
  _feedback(kind, payload) {
    this._lastOrderAt = performance.now();
    this.bus.emit(EV.NOTIFY, { kind: `order:${kind}`, ...payload, transient: true });
  }

  // --- keyboard -------------------------------------------------------------

  _onKeyDown = (e) => {
    const code = e.code.toLowerCase();
    if (e.repeat) return;
    this.keys.add(code);

    switch (code) {
      case 'space':
        e.preventDefault();
        this.engine.setTimeScaleIndex(this.engine.paused ? this._resumeScaleIndex : 0);
        if (!this.engine.paused) this._resumeScaleIndex = this.engine.timeScaleIndex;
        break;
      case 'digit1': this._setScale(1); break;
      case 'digit2': this._setScale(2); break;
      case 'digit3': this._setScale(3); break;
      case 'bracketright': this._setScale(this.engine.timeScaleIndex + 1); break;
      case 'bracketleft': this._setScale(this.engine.timeScaleIndex - 1); break;

      case 'home':
      case 'keyf':
        this.tactical.snapToPlayer();
        break;
      case 'keyv':
        this.cinematic.toggle(this.world.player);
        break;
      case 'keyh':
        this.world.player?.orderHold();
        this._feedback('hold', {});
        break;
      case 'escape':
        this.world.systems.salvage?.cancelCut();
        this.world.selection.clear();
        this.bus.emit(EV.SELECTION_CHANGED, { selection: [] });
        break;
      case 'keyz': {
        // Nearest cuttable section, one key. Salvage is the loop; make it cheap.
        const near = this.world.systems.salvage?.findNearestSection();
        if (near) {
          this.world.systems.salvage.orderCut(near.wreck, near.section);
          this._feedback('salvage', { section: near.section });
        }
        break;
      }
      default: break;
    }

    // Power routing presets, gated until the player owns a reactor.
    if (this.world.unlocked.powerRouting) {
      const presets = { f1: 'balanced', f2: 'assault', f3: 'run', f4: 'turtle', f5: 'scan' };
      const preset = presets[code];
      if (preset) {
        e.preventDefault();
        this.world.player?.power.applyPreset(preset);
        this._feedback('power', { preset });
      }
    }
  };

  _onKeyUp = (e) => {
    this.keys.delete(e.code.toLowerCase());
  };

  _setScale(i) {
    const clamped = Math.max(0, Math.min(TIME_SCALES.length - 1, i));
    this.engine.setTimeScaleIndex(clamped);
    if (clamped > 0) this._resumeScaleIndex = clamped;
  }

  // --- per-frame ------------------------------------------------------------

  update(dt) {
    const k = this.keys;
    const modifier = (k.has('shiftleft') || k.has('shiftright')) ? 'fast'
      : (k.has('altleft') || k.has('altright')) ? 'slow' : 'none';

    let px = 0, pz = 0;
    if (k.has('keyw') || k.has('arrowup')) pz += 1;
    if (k.has('keys') || k.has('arrowdown')) pz -= 1;
    if (k.has('keyd') || k.has('arrowright')) px += 1;
    if (k.has('keya') || k.has('arrowleft')) px -= 1;
    if (px || pz) this.tactical.keyPan(px, pz, dt, modifier);

    let yaw = 0;
    if (k.has('keyq')) yaw += 1;
    if (k.has('keye')) yaw -= 1;
    if (yaw) this.tactical.keyYaw(yaw, dt);

    this._updateHover();
  }
}
