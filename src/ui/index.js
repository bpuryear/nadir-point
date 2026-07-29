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
import { getItem } from '../core/contracts.js';
import {
  Surface, Painter, Projector, C, F, TRACK,
  UI_SCALES, setUIScale, uiScale, defaultUIScale,
} from './theme.js';
import { HUD, BREACH_WARN_FRACTION } from './hud.js';
import { TacticalOverlay, bearingAdvice } from './tactical.js';
import { PowerPanel } from './power.js';
import { RefitScreen } from './refit.js';
import { InventoryPanel } from './inventory.js';
import { PanelHost, TITLE_H } from './panels.js';
import { ArmamentPanel } from './weapons.js';
import { HoldPanel, MaterialsPanel } from './hold.js';
import { CodexPanel } from './codex.js';
import { ObjectivesPanel } from './objectives.js';
import { PerksPanel } from './perks.js';

export { HUD, TacticalOverlay, PowerPanel, RefitScreen, InventoryPanel };
export { PanelHost, ArmamentPanel, HoldPanel, MaterialsPanel, CodexPanel, ObjectivesPanel, PerksPanel };
export { C as UI_COLORS, F as UI_FONTS, BREACH_WARN_FRACTION };

/**
 * PANEL TOGGLE KEYS.
 *
 * Every one of these was checked against `src/input/controls.js` before it was claimed:
 * that file owns space, 1–3, [ ], HOME, F, V, H, ESC, Z, F1–F5 and WASD/QE for the
 * camera, and `UILayer` already owned M and backquote. Nothing below collides, so no
 * flight control had to be moved to make room for a readout.
 */
const PANEL_KEYS = {
  keyx: 'armament',
  keyc: 'codex',
  keyj: 'objectives',
  keyg: 'hold',
  keyk: 'materials',
  keyp: 'perks',
};

/**
 * HOLD TO SEE THE SHIP.
 *
 * Even with every window closed and a solver keeping the rest off the hull, there is
 * one thing an interface owes the player of a game about a ship they have built: a
 * way to look at it with nothing in front of it at all. Held, not toggled, so it
 * cannot be left on by accident and so the reflex is "press it, look, let go".
 *
 * BACKSLASH is free: controls.js owns space, 1-3, [ ], HOME, F, V, H, ESC, Z, F1-F5
 * and WASD/QE, and this layer owns M, backquote, X, C, J, G, K, P and 4-8.
 */
const HIDE_KEY = 'backslash';

/** Cycle the interface scale. See theme.js UI_SCALES. */
const SCALE_KEY = 'equal';

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

    /**
     * THE FLOATING PANEL LAYER.
     *
     * Every system that landed with a read API and no UI gets a window here rather
     * than another welded strip: `reference-ui-language.md` §2 observed that the
     * reference has no docked chrome at all, and the audit's standing complaint is
     * that ours sits on the cruiser at ordinary framings. A panel you can close and
     * drag cannot occlude anything you did not choose to occlude.
     *
     * NOTHING OPENS BY DEFAULT.
     *
     * ARMAMENT used to, and it was measured landing dead centre at every one of five
     * camera poses: 99.0 % of the ship's pixels altered by the HUD at the everyday
     * three-quarter view, 36.3 % chrome coverage of the central half of the frame.
     * A window that is open before the player asked for it is welded chrome wearing a
     * close button. The tab row along the top says the windows exist and what key
     * opens them, which is the reference's own idiom (§7, `B Build`, `F1 CAM`), and
     * the always-on welded readouts carry what genuinely cannot wait for a keystroke.
     */
    this.panels = new PanelHost(this);
    this.armament = this.panels.add(new ArmamentPanel(this));
    this.holdPanel = this.panels.add(new HoldPanel(this));
    this.materialsPanel = this.panels.add(new MaterialsPanel(this));
    this.codexPanel = this.panels.add(new CodexPanel(this));
    this.objectivesPanel = this.panels.add(new ObjectivesPanel(this));
    this.perksPanel = this.panels.add(new PerksPanel(this));

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

    /**
     * LAYER RATES — the number the reference puts first.
     *
     * `reference-ui-language.md` §9 calls `0.0 HP/s` out as the single figure carrying
     * the most decision weight in the reference's whole hull block, because it is the
     * only one that says whether you are WINNING the repair race right now. A bar
     * says where you are; a rate says where you are going.
     *
     * Sampled on the FIXED step, not the render step, for the same reason the damage
     * chevron is: at 4x with a 30 fps frame eight sim steps pass per rendered frame,
     * and a rate differentiated across a rendered frame would read eight times the
     * true value at 4x and the correct value at 1x. Exponentially smoothed over about
     * a second so a single shell does not spike it to a meaningless number.
     */
    this.vitals = { hull: -1, shield: -1, hullRate: 0, shieldRate: 0, acc: 0 };

    this.hit = [];
    this.pointer = { x: -1, y: -1, down: false };
    /** True while the hide key is held. Suppresses everything but the hint line. */
    this.hideHUD = false;
    /** Welded-readout rectangles, rebuilt every frame. See `_weldedRegions`. */
    this._regions = [];
    /** The player's projected screen box. Drives the panel solver. */
    this.shipBox = { x: 0, y: 0, w: 0, h: 0, ok: false };

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
        return;
      }
      if (code === 'backquote') {
        this.tactical.enabled = !this.tactical.enabled;
        this.orderBar.say(this.tactical.enabled ? 'TACTICAL OVERLAY ON' : 'TACTICAL OVERLAY OFF', 'info');
        e.stopPropagation();
        return;
      }
      if (code === HIDE_KEY) {
        // Held, not toggled. `keyup` puts it back; see `_onKeyUp`.
        this.hideHUD = true;
        e.stopPropagation(); e.preventDefault();
        return;
      }
      if (code === SCALE_KEY) {
        const i = UI_SCALES.indexOf(uiScale());
        const next = UI_SCALES[(i + 1) % UI_SCALES.length] ?? 1;
        setUIScale(next);
        this.orderBar.say(`INTERFACE SCALE ${Math.round(next * 100)}%`, 'info');
        e.stopPropagation(); e.preventDefault();
        return;
      }
      if (this.screen) return;

      const panelId = PANEL_KEYS[code];
      if (panelId) {
        const p = this.panels.toggle(panelId);
        if (p) this.orderBar.say(`${p.title} ${p.open ? 'OPEN' : 'CLOSED'}`, 'info');
        e.stopPropagation(); e.preventDefault();
        return;
      }

      // Device hotbar. Deliberately independent of whether the armament panel is
      // open: a closed readout must never take a capability away from the player.
      const slot = ArmamentPanel.keyIndex(code);
      if (slot >= 0) {
        this.useDevice(this.armament.deviceIdAt(slot));
        e.stopPropagation(); e.preventDefault();
        return;
      }

      // ESC closes the topmost window before it reaches the flight controls, where it
      // would also cancel a cut and drop the selection. It only claims the key when
      // there is actually a window to close.
      if (code === 'escape' && this.panels.anyOpen) {
        for (let i = this.panels.panels.length - 1; i >= 0; i--) {
          if (this.panels.panels[i].open) { this.panels.panels[i].open = false; break; }
        }
        e.stopPropagation(); e.preventDefault();
      }
    };
    // Capture phase so a modal screen wins the key before the flight controls see it.
    window.addEventListener('keydown', this._onKeyDown, true);
    this._onKeyUp = (e) => {
      if (String(e.code || '').toLowerCase() === HIDE_KEY) this.hideHUD = false;
    };
    window.addEventListener('keyup', this._onKeyUp, true);
    // A window that loses focus mid-hold would otherwise never see the keyup and the
    // interface would stay hidden until the key was pressed and released again.
    this._onBlur = () => { this.hideHUD = false; };
    window.addEventListener('blur', this._onBlur);

    /**
     * POINTER, WITHOUT TAKING THE MOUSE AWAY FROM THE GAME.
     *
     * The overlay canvas keeps `pointer-events: none` while flying, so every click the
     * player makes still reaches `input/controls.js`. These listeners sit on `window`
     * in the CAPTURE phase, which runs before the game element's own target-phase
     * handlers; they hit-test this frame's regions and only call `stopPropagation`
     * when the point is genuinely over a panel. A closed panel therefore costs the
     * player nothing at all, and an open one costs exactly its own rectangle.
     */
    this._onWinMove = (e) => {
      if (this.screen) return;
      const px = this.painter.toLocal(e.clientX);
      const py = this.painter.toLocal(e.clientY);
      this.pointer.x = px;
      this.pointer.y = py;
      if (this.panels.onPointerMove(px, py)) {
        e.stopPropagation();
      }
    };
    this._onWinDown = (e) => {
      if (this.screen) return;
      const px = this.painter.toLocal(e.clientX);
      const py = this.painter.toLocal(e.clientY);
      const region = this._pick(px, py);
      if (!region) return;

      // The second-tier aim ring. Clicking a sub-part goes through the SAME public
      // order API the input stream uses - `Ship.orderAttack(target, subsystem, part)` -
      // so there is exactly one path by which an aim point is chosen, and the order
      // acknowledgement animation fires for it like any other order.
      if (region.kind === 'panel:tab') {
        this.panels.toggle(region.panelId);
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      if (region.kind === 'tactical:part') {
        const player = this.world.player;
        const target = player?.target;
        if (player && target && !target.dead) {
          player.orderAttack(target, region.subsystemId, region.partId);
          this.spawnOrderMarker('attack', { target, subsystem: region.subsystemId });
          this.orderBar.say(`AIM ${String(region.partId).toUpperCase()} · ${String(region.subsystemId).toUpperCase()}`, 'info');
        }
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      if (this.panels.onPointerDown(region, px, py)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    this._onWinUp = (e) => {
      if (this.panels.onPointerUp()) e.stopPropagation();
    };
    this._onWinWheel = (e) => {
      if (this.screen) return;
      const region = this._pick(this.painter.toLocal(e.clientX), this.painter.toLocal(e.clientY));
      if (!region) return;
      if (this.panels.onWheel(region, e.deltaY)) {
        e.stopPropagation();
        e.preventDefault();
      } else if (region.panel) {
        // Still swallow it: scrolling over a window must not zoom the camera behind it.
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('pointermove', this._onWinMove, true);
    window.addEventListener('pointerdown', this._onWinDown, true);
    window.addEventListener('pointerup', this._onWinUp, true);
    window.addEventListener('wheel', this._onWinWheel, { capture: true, passive: false });

    const canvas = this.surface.canvas;
    if (!canvas) return;
    this._onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = this.painter.toLocal(e.clientX - r.left);
      this.pointer.y = this.painter.toLocal(e.clientY - r.top);
      this.refit.hoverUid = null;
      this.refit.hoverMount = null;
      const region = this._pick(this.pointer.x, this.pointer.y);
      if (region?.kind === 'inventory') this.refit.hoverUid = region.uid;
      if (region?.kind === 'mount') this.refit.hoverMount = region.id;
    };
    this._onDown = (e) => {
      const r = canvas.getBoundingClientRect();
      const region = this._pick(this.painter.toLocal(e.clientX - r.left),
        this.painter.toLocal(e.clientY - r.top));
      if (!region) return;
      e.stopPropagation();
      e.preventDefault();
      if (this.screen === 'refit') this.refit.onClick(region);
    };
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerdown', this._onDown);
  }

  /**
   * Fire a carried device. One path, shared by the hotbar key and the hotbar click, so
   * the two can never disagree about whether a charge was spent — `ItemSystem.use`
   * only consumes on a successful activation, and the rejection reason it returns is
   * printed verbatim rather than being reduced to "cannot use".
   */
  useDevice(itemId) {
    if (!itemId) return null;
    const items = this.world.systems?.items;
    const name = String(getItem(itemId)?.name ?? itemId).toUpperCase();
    if (!items) { this.orderBar.say(`${name} — NO DEVICE SYSTEM`, 'error'); return null; }
    const res = items.use(itemId);
    if (res?.ok) {
      this.orderBar.say(`${name} — ACTIVATED`, 'good');
      this.notify(`${name} ACTIVATED`, { important: true });
    } else {
      this.orderBar.say(`${name} — ${String(res?.reason ?? 'FAILED').toUpperCase()}`, 'error');
    }
    return res;
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

  _fixedUpdate(dt) {
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

    const v = this.vitals;
    const step = dt || 1 / 60;
    const shield = player.shields?.current ?? 0;
    if (v.hull < 0) { v.hull = player.hullHP; v.shield = shield; return; }
    const k = 1 - Math.exp(-step / 0.9);
    v.hullRate += ((player.hullHP - v.hull) / step - v.hullRate) * k;
    v.shieldRate += ((shield - v.shield) / step - v.shieldRate) * k;
    v.hull = player.hullHP;
    v.shield = shield;
    // Below a tenth of a point per second the readout says 0.0 and means it: a rate
    // that jitters in the last digit while nothing is happening is noise pretending
    // to be information.
    if (Math.abs(v.hullRate) < 0.05) v.hullRate = 0;
    if (Math.abs(v.shieldRate) < 0.05) v.shieldRate = 0;
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
    this._measureShip(P);
    this.hit.length = 0;

    try {
      if (this.screen !== 'refit') this._reserveFrame(P);
      if (this.screen === 'refit') {
        this.refit.draw(P, this.hit);
        this.hud._drawNotifications(P);
        this.hud._drawOrderBar(P);
      } else if (this.hideHUD) {
        // Hold-to-look. One line, bottom-centre, on its own plate so it is legible
        // over whatever the player wanted to look at.
        const s = 'INTERFACE HIDDEN — RELEASE \\ TO RESTORE';
        const tw = P.measure(s, F.microBold, TRACK.label);
        P.plate(P.w * 0.5 - tw * 0.5 - 10, P.h - 34, tw + 20, 18, { border: C.ruleDim });
        P.text(s, P.w * 0.5, P.h - 21, {
          font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
        });
      } else {
        // The solver needs the ship's box and the welded rectangles before any window
        // is placed, and both are frame-local.
        this.panels.ship = this.shipBox.ok ? this.shipBox : null;
        this.panels.reserved = this._regions;
        if (camera) this.tactical.draw(P, this.hit);
        this.hud.draw(P);
        this.power.draw(P);
        // Windows last: they are opaque plates and they are meant to be on top of the
        // welded layer, not fighting it for the same pixels.
        this.panels.draw(P, this.hit);
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
  /**
   * The welded readouts' rectangles, rebuilt each frame in logical pixels.
   *
   * ONE list, read by three consumers: `Painter.claim` (so world-anchored captions
   * get out of the way), the panel solver (so a window never opens on top of the
   * hull-integrity block) and the HUD itself (so a block and its plate agree about
   * where the block is). They used to be three sets of numbers in three files and
   * they disagreed, which is how the OBJECTIVES window came to cover HULL INTEGRITY.
   */
  _weldedRegions(P) {
    const r = this._regions;
    r.length = 0;
    const shipW = this.hud.shipPanelW;
    const shipH = this.hud.shipPanelH;
    const tgtW = this.hud.targetPanelW;
    // `hard` regions are the two blocks the player is actually steering by. A window
    // that covers the hull-integrity stack or the target's salvage projection has
    // taken away the reason the player is looking at the screen; everything else here
    // is chrome that can be covered when the frame genuinely runs out of room.
    r.push({ id: 'time', x: P.w * 0.5 - 280, y: 0, w: 560, h: 150 });
    r.push({ id: 'tabs', x: 12, y: 2, w: Math.min(P.w - 24, 620), h: 30 });
    r.push({ id: 'stores', x: P.w - 214, y: 34, w: 206, h: 96 });
    r.push({ id: 'ship', x: 14, y: P.h - shipH - 14, w: shipW, h: shipH, hard: true });
    r.push({ id: 'power', x: P.w * 0.5 - 190, y: P.h - this.power.height - 30, w: 380, h: this.power.height + 26 });
    r.push({ id: 'target', x: P.w - tgtW - 14, y: P.h - 372, w: tgtW, h: 360, hard: true });
    // The arc dial's column, above the player-state block. Reserved even when the
    // dial is collapsed: the collapsed form is a line of type and it needs a ground.
    r.push({ id: 'arc', x: 24, y: P.h - shipH - 118, w: 130, h: 106 });
    return r;
  }

  _reserveFrame(P) {
    const claim = (x, y, w, h) => P.claim(x, y, w, h, 3);
    for (const r of this._weldedRegions(P)) claim(r.x, r.y, r.w, r.h);

    // Open windows are opaque. Claiming their rectangles here stops the world-anchored
    // caption layer - range rings, arc labels, contact names - from writing text that
    // is then painted over, which would show up as captions that flicker as a panel
    // moves rather than as captions that politely got out of the way.
    for (const panel of this.panels.panels) {
      if (!panel.open || panel.x === null) continue;
      claim(panel.x, panel.y, panel.w, panel.collapsed ? TITLE_H : panel.h);
    }

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

  /**
   * The player's projected screen box, from the hull's bounding sphere.
   *
   * This is the rectangle the interface is not allowed to build on. A sphere is used
   * rather than the eight corners of an oriented box because the cruiser is 340 m
   * long and its silhouette changes with every degree of yaw; the sphere is the
   * conservative answer and being slightly generous about where the ship is costs a
   * window a few pixels of margin, while being slightly mean costs the player the
   * sight of their own hull.
   */
  _measureShip(P) {
    const box = this.shipBox;
    box.ok = false;
    const player = this.world.player;
    const proj = this.projector;
    if (!player || player.dead || !proj.camera) return;
    if (!proj.vec(player.position, _reserveP)) return;
    const r = proj.radiusAt(player.position, player.radius ?? 200);
    // A speck at maximum zoom is not an occlusion problem and reserving 90 px around
    // it would push every window off a 1280-wide frame for no gain.
    if (r < 26) return;
    const pad = Math.min(64, r * 0.35);
    box.x = _reserveP.x - r - pad;
    box.y = _reserveP.y - r - pad;
    box.w = (r + pad) * 2;
    box.h = (r + pad) * 2;
    box.ok = true;
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
    for (const panel of this.panels.panels) panel.dispose?.();
    if (typeof window !== 'undefined') {
      if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown, true);
      if (this._onWinMove) window.removeEventListener('pointermove', this._onWinMove, true);
      if (this._onWinDown) window.removeEventListener('pointerdown', this._onWinDown, true);
      if (this._onWinUp) window.removeEventListener('pointerup', this._onWinUp, true);
      if (this._onWinWheel) window.removeEventListener('wheel', this._onWinWheel, true);
      if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp, true);
      if (this._onBlur) window.removeEventListener('blur', this._onBlur);
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
  // `panels: ['codex', 'hold']` — used by the probes to photograph a window, and by a
  // future save file to restore whatever the player had open.
  if (Array.isArray(opts.panels)) {
    ui.panels.closeAll();
    for (const id of opts.panels) {
      const p = ui.panels.get(id);
      if (p) { p.open = true; p.onOpen(); }
    }
  }

  return ui;
}

export { THREE, TRACK };
