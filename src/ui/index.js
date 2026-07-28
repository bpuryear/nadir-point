/**
 * UI INSTALLER.
 *
 * One entry point, idempotent, and safe to call before anything it draws exists.
 * It is invoked from `bootGame` before the player has a hull, before a single
 * module is registered and possibly before the material registry has been built, so
 * every read below is defensive and every panel degrades to "draws its own empty
 * state" rather than throwing.
 *
 * TWO ENGINE SYSTEMS:
 *
 *   order  95  (fixed)   ui-watch   Samples the things that must not be missed
 *                                   BETWEEN rendered frames - hull damage on the
 *                                   player, structural warnings on a mount. At 4x
 *                                   with a 30 fps frame, eight sim steps pass per
 *                                   frame; a hull hit sampled on the render path
 *                                   would be invisible whenever it mattered most.
 *
 *   order 320  (render)  ui-draw    Everything visible. On the render path, every
 *                                   frame, INCLUDING WHILE PAUSED - which is the
 *                                   whole reason order feedback is specified to be
 *                                   render-side. At pause the fixed step never runs,
 *                                   so any acknowledgement gated on the simulation
 *                                   would take infinite time to appear.
 *
 * THE 100 ms ORDER CRITERION IS MET BY CONSTRUCTION. `src/input/controls.js` emits
 * `EV.NOTIFY` with `kind: 'order:*'` synchronously inside the DOM event handler. The
 * handler below spawns the marker in that same call stack, and the next rendered
 * frame draws it: <= 16.7 ms at 60 fps, <= 6.9 ms at 144. Nothing here waits for a
 * simulation tick, and nothing here is allowed to.
 *
 * COST. Everything is drawn onto ONE 2D overlay canvas at the device pixel ratio.
 * The 3D scene gains zero draw calls, zero geometries, zero programs and zero
 * materials from this stream - which is checked by the probe.
 */

import * as THREE from 'three';
import { EV } from '../core/events.js';
import { ActiveSet } from '../core/pool.js';
import { Surface, Painter, Projector, C, F, TRACK } from './theme.js';
import { HUD, BREACH_WARN_FRACTION } from './hud.js';
import { TacticalOverlay, bearingAdvice } from './tactical.js';
import { PowerPanel } from './power.js';
import { RefitScreen } from './refit.js';
import { InventoryPanel } from './inventory.js';

export { HUD, TacticalOverlay, PowerPanel, RefitScreen, InventoryPanel };
export { C as UI_COLORS, F as UI_FONTS, BREACH_WARN_FRACTION };

/** Order-band slots this stream occupies. Both inside the documented UI band. */
export const UI_ORDER = { watch: 95, draw: 320 };

const MARKER_CAPACITY = 24;
const NOTIFY_CAPACITY = 6;

const MARKER_TTL = { move: 9, attack: 6.5, salvage: 6.5, hold: 2.5, power: 2.5 };

/** Scratch for the reservation pass. Never allocated per frame. */
const _reserveP = { x: 0, y: 0, z: 0, ok: false };

export class UILayer {
  constructor(world, opts = {}) {
    this.world = world;
    this.bus = world.bus;
    this.rng = world.rng.fork('ui');
    this.time = 0;
    this.frame = 0;

    this.surface = new Surface({ mount: opts.mount ?? null, zIndex: opts.zIndex ?? 12 });
    this.painter = new Painter(this.surface);
    this.projector = new Projector();

    this.hud = new HUD(this);
    this.tactical = new TacticalOverlay(this);
    this.power = new PowerPanel(this);
    this.refit = new RefitScreen(this);
    this.inventory = new InventoryPanel(this);

    /** null while flying; a string while a modal screen owns the frame. */
    this.screen = null;
    this.selectionAt = 0;

    /** controls.md §8.6: one method the input stream writes rejection strings into. */
    this.orderBar = {
      text: '', severity: 'info', t0: -100,
      say: (text, severity = 'info') => {
        this.orderBar.text = String(text ?? '');
        this.orderBar.severity = severity;
        this.orderBar.t0 = this.time;
      },
    };

    this.notifications = { items: [], count: 0 };
    for (let i = 0; i < NOTIFY_CAPACITY; i++) {
      this.notifications.items.push({ text: '', important: false, t0: -100, ttl: 5 });
    }

    this.markers = new ActiveSet(MARKER_CAPACITY, () => ({
      active: false, kind: 'move', x: 0, y: 0, z: 0,
      target: null, section: null, subsystem: null,
      t0: 0, frame0: -1, stage: 'provisional', stageAt: 0, ttl: 6, reason: null,
    }));

    /** Directional damage chevron state. Written from the fixed watcher. */
    this.damage = { at: -100, lastHull: -1, amount: 0 };

    this.hit = [];
    this.pointer = { x: -1, y: -1, down: false };

    this._offs = [];
    this._bindEvents();
    this._bindInput();

    // The two engine systems, declared as objects so the installer can register
    // them and a caller can inspect their order without reading this file.
    this.watcher = {
      name: 'ui-watch',
      order: UI_ORDER.watch,
      fixedUpdate: (dt) => this._fixedUpdate(dt),
    };
    this.renderSystem = {
      name: 'ui-draw',
      order: UI_ORDER.draw,
      update: (dt) => this._render(dt),
    };
  }

  // =========================================================================
  // Events
  // =========================================================================

  _on(type, fn) { this._offs.push(this.bus.on(type, fn)); }

  _bindEvents() {
    this._on(EV.NOTIFY, (p) => {
      if (!p) return;
      if (typeof p.kind === 'string' && p.kind.startsWith('order:')) {
        this.spawnOrderMarker(p.kind.slice(6), p);
        return;
      }
      if (p.text) this.notify(p.text, p);
    });

    this._on(EV.SELECTION_CHANGED, () => { this.selectionAt = this.time; });

    this._on(EV.HARDPOINT_BREACH_WARNING, ({ hardpoint }) => {
      this.notify(`${String(hardpoint?.id ?? 'mount').toUpperCase()} STRUCTURE CRITICAL`, { important: true });
      this.orderBar.say(`STRUCTURE CRITICAL — ${String(hardpoint?.id ?? '').toUpperCase()} MOUNT AT ${Math.round(BREACH_WARN_FRACTION * 100)}%`, 'error');
    });
    this._on(EV.HARDPOINT_BREACHED, ({ hardpoint }) => {
      this.notify(`${String(hardpoint?.id ?? 'mount').toUpperCase()} MOUNT BREACHED`, { important: true });
    });
    this._on(EV.MODULE_LOST, ({ hardpoint, module }) => {
      this.orderBar.say(`MODULE LOST — ${String(module?.def?.name ?? module?.name ?? '').toUpperCase()} OFF ${String(hardpoint).toUpperCase()}`, 'error');
    });
    this._on(EV.MODULE_INSTALLED, ({ module }) => {
      this.notify(`FITTED ${module?.name ?? ''}`, { important: false });
    });
    this._on(EV.SUBSYSTEM_DESTROYED, ({ ship, subsystem }) => {
      if (ship === this.world.player) {
        this.notify(`${(subsystem?.def?.label ?? 'SUBSYSTEM').toUpperCase()} DESTROYED`, { important: true });
      }
    });
    this._on(EV.SALVAGE_ACQUIRED, (p) => {
      if (p?.kind === 'module') this.notify(`RECOVERED ${p.module?.name ?? 'PART'}`, { important: true });
      else if (p?.amount) this.notify(`+${p.amount} MATERIALS`, { important: false });
    });
    this._on(EV.SHIP_DESTROYED, ({ ship, catastrophic }) => {
      if (ship === this.world.player) return;
      this.notify(catastrophic
        ? `${ship?.classDef?.name ?? 'CONTACT'} DESTROYED — SALVAGE LOST`
        : `${ship?.classDef?.name ?? 'CONTACT'} DISABLED — HULK ADRIFT`,
      { important: !!catastrophic });
    });
    // Deliberately NOT bound to the order bar. The time strip is already the readout
    // for the time scale, and echoing it into the status line stacks two identical
    // strings in the same column and pushes the last real order off the screen.
    // EV.TIME_SCALE_CHANGED is a state change, not an order acknowledgement.
  }

  // =========================================================================
  // Input
  // =========================================================================

  _bindInput() {
    if (typeof window === 'undefined') return;
    this._onKeyDown = (e) => {
      const code = String(e.code || '').toLowerCase();
      if (this.screen === 'refit') {
        if (code === 'escape') { this.openScreen(null); e.stopPropagation(); e.preventDefault(); return; }
        if (this.refit.onKey(code)) { e.stopPropagation(); e.preventDefault(); return; }
      }
      if (code === 'keym') {
        this.openScreen(this.screen === 'refit' ? null : 'refit');
        e.stopPropagation(); e.preventDefault();
      } else if (code === 'backquote') {
        this.tactical.enabled = !this.tactical.enabled;
        this.orderBar.say(this.tactical.enabled ? 'TACTICAL OVERLAY ON' : 'TACTICAL OVERLAY OFF', 'info');
        e.stopPropagation();
      }
    };
    // Capture phase so a modal screen wins the key before the flight controls see it.
    window.addEventListener('keydown', this._onKeyDown, true);

    const canvas = this.surface.canvas;
    if (!canvas) return;
    this._onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
      this.refit.hoverUid = null;
      this.refit.hoverMount = null;
      const region = this._pick(this.pointer.x, this.pointer.y);
      if (region?.kind === 'inventory') this.refit.hoverUid = region.uid;
      if (region?.kind === 'mount') this.refit.hoverMount = region.id;
    };
    this._onDown = (e) => {
      const r = canvas.getBoundingClientRect();
      const region = this._pick(e.clientX - r.left, e.clientY - r.top);
      if (!region) return;
      e.stopPropagation();
      e.preventDefault();
      if (this.screen === 'refit') this.refit.onClick(region);
    };
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerdown', this._onDown);
  }

  _pick(x, y) {
    for (let i = this.hit.length - 1; i >= 0; i--) {
      const r = this.hit[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  }

  // =========================================================================
  // Public surface
  // =========================================================================

  openScreen(name) {
    const next = name ?? null;
    if (next === this.screen) return;
    if (this.screen === 'refit') this.refit.close();
    this.screen = next;
    if (next === 'refit') this.refit.open();
    this.surface.setInteractive(!!next);
    this.bus.emit(EV.UI_SCREEN_CHANGED, { screen: next });
  }

  notify(text, { important = false, ttl = 5 } = {}) {
    const n = this.notifications;
    // Newest first, oldest pushed off the end. A fixed ring: no allocation.
    for (let i = Math.min(n.count, NOTIFY_CAPACITY - 1); i > 0; i--) {
      const a = n.items[i], b = n.items[i - 1];
      a.text = b.text; a.important = b.important; a.t0 = b.t0; a.ttl = b.ttl;
    }
    const head = n.items[0];
    head.text = String(text);
    head.important = !!important;
    head.t0 = this.time;
    head.ttl = ttl;
    n.count = Math.min(NOTIFY_CAPACITY, n.count + 1);
  }

  /**
   * Spawn an order acknowledgement. Called synchronously from the input stream's
   * event, so the marker exists before the frame it is drawn in - see the header.
   */
  spawnOrderMarker(kind, payload = {}) {
    // One live marker per kind: a second move order replaces the first rather than
    // leaving a trail of ghosts the player has to mentally discard. A REJECTED
    // marker is exempt - it is already dissolving, and the case the player most
    // needs to see is the illegal order flashing red beside the legal one that
    // replaced it.
    for (let i = this.markers.count - 1; i >= 0; i--) {
      const m = this.markers.items[i];
      if (m.active && m.kind === kind && m.stage !== 'rejected') { m.active = false; this.markers.kill(i); }
    }
    const m = this.markers.spawn();
    if (!m) return null;
    m.active = true;
    m.kind = kind;
    m.t0 = this.time;
    m.frame0 = this.frame;
    m.stage = 'provisional';
    m.stageAt = this.time;
    m.ttl = MARKER_TTL[kind] ?? 6;
    m.reason = null;
    m.target = payload.target ?? null;
    m.section = payload.section ?? null;
    m.subsystem = payload.subsystem ?? null;
    const p = payload.point ?? payload.section?.worldPosition ?? payload.target?.position ?? null;
    if (p) { m.x = p.x; m.y = p.y; m.z = p.z; }

    const label = kind === 'move' ? 'MOVE ORDER'
      : kind === 'attack' ? `ENGAGE${payload.subsystem ? ` · ${String(payload.subsystem).toUpperCase()}` : ''}`
        : kind === 'salvage' ? `CUT ${String(payload.section?.label ?? 'SECTION').toUpperCase()}`
          : kind === 'power' ? `POWER STANCE ${String(payload.preset ?? '').toUpperCase()}`
            : kind.toUpperCase();
    this.orderBar.say(label, 'info');
    return m;
  }

  /** controls.md §4.2: an illegal order gets a visible rejection with a reason. */
  rejectOrder(reason, kind = null) {
    for (let i = this.markers.count - 1; i >= 0; i--) {
      const m = this.markers.items[i];
      if (!m.active) continue;
      if (kind && m.kind !== kind) continue;
      m.stage = 'rejected';
      m.stageAt = this.time;
      m.reason = String(reason ?? '').toUpperCase();
      break;
    }
    this.orderBar.say(String(reason ?? 'ORDER REJECTED'), 'error');
  }

  setTacticalOverlay(on) { this.tactical.enabled = !!on; }

  /** The sentence form of combat.bearingReport(). Shared by the HUD and overlay. */
  bearingAdvice(player, target, report) {
    return bearingAdvice(player, target, report, this.world.systems?.combat);
  }

  // =========================================================================
  // Systems
  // =========================================================================

  _fixedUpdate() {
    const player = this.world.player;
    if (!player) return;
    // Hull damage is not an event, and it is the one thing the chevron needs. Sample
    // it on the fixed step so a hit landing between two rendered frames still counts.
    if (this.damage.lastHull < 0) this.damage.lastHull = player.hullHP;
    if (player.hullHP < this.damage.lastHull - 1e-3) {
      this.damage.amount = this.damage.lastHull - player.hullHP;
      this.damage.at = this.time;
    }
    this.damage.lastHull = player.hullHP;
  }

  _render(dt) {
    this.time += Math.min(0.1, dt || 0);
    this.frame++;

    if (this.screen === 'refit') this.refit.update(dt);

    const P = this.painter;
    if (!P.begin(this.time)) return;

    const camera = this.world.camera;
    if (camera) this.projector.begin(camera, P.w, P.h);

    this._updateMarkers();
    this.hit.length = 0;

    try {
      if (this.screen !== 'refit') this._reserveFrame(P);
      if (this.screen === 'refit') {
        this.refit.draw(P, this.hit);
        this.hud._drawNotifications(P);
        this.hud._drawOrderBar(P);
      } else {
        if (camera) this.tactical.draw(P);
        this.hud.draw(P);
        this.power.draw(P);
      }
    } catch (err) {
      // A UI that throws mid-frame must not take the game down with it. Say so once
      // and keep drawing the rest next frame.
      if (!this._threw) {
        this._threw = true;
        console.error('[ui] draw failed', err);
      }
    }
  }

  /**
   * Reserve the frame before anything opportunistic is drawn into it.
   *
   * The fixed panels and the locked target's readouts are not negotiable; the
   * ambient captions - range rings, arc wedges, contact names - are. Claiming the
   * non-negotiable space first turns `Painter.textIfClear` into a priority system
   * instead of a race, and it is the difference between a display that stays
   * readable at every zoom and one that only works at the zoom it was authored at.
   */
  _reserveFrame(P) {
    const claim = (x, y, w, h) => P.claim(x, y, w, h, 3);
    claim(P.w * 0.5 - 270, 0, 540, 142);            // time strip, order bar, toasts
    claim(P.w - 190, 6, 190, 96);                   // hold and materials
    claim(6, P.h - 336, 356, 336);                  // own-ship panel
    claim(352, P.h - 168, 116, 160);                // arc coverage rose
    claim(P.w * 0.5 - 196, P.h - 240, 392, 240);    // reactor routing
    claim(P.w - 376, P.h - 386, 376, 386);          // target panel

    const player = this.world.player;
    const proj = this.projector;
    if (!player || !proj.camera) return;

    // The locked target's ring owns a generous box: its subsystem labels fan out
    // sideways and a range-ring caption landing in that fan is unreadable.
    const target = player.target && !player.target.dead ? player.target : null;
    if (target && proj.vec(target.position, _reserveP)) {
      const hullR = Math.max(22, proj.radiusAt(target.position, target.radius ?? 60));
      const ringR = Math.max(82, hullR * 1.7);
      claim(_reserveP.x - ringR - 235, _reserveP.y - ringR - 72,
        (ringR + 235) * 2, (ringR + 72) * 2 + 66);
    }

    // Order markers carry the acknowledgement text; nothing may sit on top of it.
    this.markers.forEach((m) => {
      if (!m.active) return;
      const p = m.kind === 'salvage' ? m.section?.worldPosition
        : m.kind === 'attack' ? m.target?.position : null;
      const ok = p ? proj.vec(p, _reserveP) : proj.point(m.x, 0, m.z, _reserveP);
      if (!ok) return;
      claim(_reserveP.x - 30, _reserveP.y - 26, 300, 54);
    });
  }

  _updateMarkers() {
    for (let i = this.markers.count - 1; i >= 0; i--) {
      const m = this.markers.items[i];
      if (!m.active) { this.markers.kill(i); continue; }
      // Exactly one drawn frame of the provisional stage, then committed. The stage
      // clock is wall-clock so the animation runs identically at pause and at 4x.
      if (m.stage === 'provisional' && this.frame > m.frame0) {
        m.stage = 'committed';
        m.stageAt = this.time;
      }
      const life = this.time - m.t0;
      const done = m.stage === 'rejected' ? life > 0.4 + (m.stageAt - m.t0) : life > m.ttl;
      if (done) { m.active = false; this.markers.kill(i); }
    }
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs.length = 0;
    if (typeof window !== 'undefined' && this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown, true);
    }
    const canvas = this.surface.canvas;
    if (canvas) {
      if (this._onMove) canvas.removeEventListener('pointermove', this._onMove);
      if (this._onDown) canvas.removeEventListener('pointerdown', this._onDown);
    }
    this.surface.dispose();
  }
}

/**
 * @param {import('../core/world.js').World} world
 * @param {Object} [opts] { mount, zIndex, tacticalOverlay, screen }
 * @returns {UILayer} also parked on `world.systems.ui`
 */
export function installUI(world, opts = {}) {
  if (world?.systems?.ui) return world.systems.ui;
  if (!world?.engine) throw new Error('[ui] installUI needs a world with an engine');

  const ui = new UILayer(world, opts);
  world.register('ui', ui);

  world.engine.add(ui.watcher);
  world.engine.addRender(ui.renderSystem);

  if (opts.tacticalOverlay === false) ui.setTacticalOverlay(false);
  if (opts.screen) ui.openScreen(opts.screen);

  return ui;
}

export { THREE, TRACK };
