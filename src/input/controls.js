import * as THREE from 'three';
import { EV } from '../core/events.js';
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

/**
 * THE THREE ARMAMENT VERBS, AND WHERE THEIR KEYS CAME FROM.
 *
 *   R          SALVO. Ripple the engaged flank - whichever side the target is on.
 *              Shift+R arms guns that do not bear YET, betting the hull will have
 *              turned by their turn in the wave.
 *   , and .    SIDE-SELECT. Ripple port, ripple starboard, explicitly. The keys read
 *              as < and > on every keyboard layout this game will see, which is the
 *              only mnemonic in the set that needs no learning.
 *   L (held)   CHARGE AND RELEASE. Winds up every CHARGE mount; letting go fires.
 *
 * Middle-click also salvos. `_onPointerUp` dispatched only buttons 0 and 2, so a
 * button-1 click that moved less than 6 px was being swallowed entirely; MMB-DRAG
 * still pans and is untouched.
 *
 * ALL FOUR KEYS COME OFF `ui/index.js:105#FREE_KEYS` — `I L N O R T U Y , .` — which is
 * the list W1-E derived by grepping the two files that own bindings, not a design
 * document. `docs/design/firing-feel.md:420,425` assigns M-hold to `fire.charge` and
 * justifies it on "the tactical view ... is a separate screen context". BOTH HALVES ARE
 * FALSE, re-checked against the code on this commit:
 *
 *   - M is claimed at `ui/index.js:321` from a listener registered in the CAPTURE phase
 *     (`ui/index.js:376`) that calls `stopPropagation`. A second handler here would
 *     never fire at all, so M-hold would be a dead binding, not a contested one.
 *   - `Controls` is one flat `_onKeyDown` with no screen or context scoping of any kind.
 *     There is no "tactical view" to be separate from; MMB-drag pans in the only view
 *     there is, which is why MMB-CLICK — a distinct gesture — is what got the verb.
 *
 * ONE OVERLAP THE PUBLISHED LIST DOES NOT MENTION, measured rather than assumed:
 * `ui/refit.js:345` also answers `keyr`, for REPAIR MOUNT. It is reachable only through
 * `ui/index.js:317`, which consults it exclusively while `screen === 'refit'` and then
 * stops propagation — so R repairs while the refit screen is open and salvos while it
 * is not, and the two can never both fire. That is a real division of one key between
 * two verbs by screen state, and it lives in W1-E's file, not this one. Anyone moving
 * either binding should read both sites; `FREE_KEYS` alone will not tell them.
 */
/**
 * TWO VERBS THAT WERE DECLARED AND UNREACHABLE, NOW BOUND HERE.
 *
 * Both were found by grepping for callers rather than by reading a design document,
 * and both were the same defect wearing different clothes: a system published a verb,
 * the UI drew its state, and no input path existed to reach it. That is worse than an
 * absent feature, because the interface makes a promise the player cannot cash.
 *
 *   T          PURGE COOLANT. `sim/heat.js#purge` had ONE caller in the entire tree,
 *              `src/sim/selftest.mjs:279`. `ui/weapons.js:764` has always drawn
 *              `stores.coolant` as a row of pips — three of them, from
 *              `STORES.coolantBase` — and in a real game they could never move.
 *              `T` for THERMAL; it is on `ui/index.js#FREE_KEYS`, re-grepped on this
 *              commit rather than trusted, and `Controls` has no screen scoping so
 *              there is nothing for it to collide with.
 *
 *   Shift+Z    FAST CUT, and Shift + right-click likewise. `salvage.js#setCutMode` and
 *   Shift+RMB  the third parameter of `orderCut(wreck, section, mode)` had no caller
 *              at all: `_rightClick` and the `Z` handler below both passed two
 *              arguments, so `cutMode` was permanently `'clean'` and `fastCutRate`
 *              1.75 was dead data.
 *
 *              A MODIFIER, NOT A MODE TOGGLE, and that is a design choice rather than
 *              a shortage of keys. `orderCut` takes the mode per order, so binding it
 *              to Shift makes the decision at the moment it is made — with the burning
 *              wreck and the second contact both on screen — instead of storing a
 *              sticky state the player set a minute ago and has since forgotten. The
 *              acknowledgement line carries the mode, so the choice is echoed back.
 */
const SALVO_KEY = 'keyr';
const SALVO_PORT_KEY = 'comma';
const SALVO_STARBOARD_KEY = 'period';
const CHARGE_KEY = 'keyl';
const PURGE_KEY = 'keyt';
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
    /** Last polled state of the hold-to-charge key. See `update`. */
    this._chargeHeld = false;

    this._bind();

    /*
     * ATTACH BEFORE THE ENGINE STARTS, NOT ON THE FIRST RENDER FRAME.
     *
     * `bootGame` constructs this object at `game.js:262`, after `world.register('combat')`
     * at `:199` and after `world.player` is set at `:192`, and only starts the loop once
     * it returns — so this runs strictly before the first `fixedUpdate`. Attaching from
     * `update()` alone would not: `update` is a RENDER callback, so between the first
     * simulation step and the first frame the player's SALVO battery would fire one
     * uncommanded burst, spend its cooldown and be unschedulable when the player finally
     * pressed the key. Measured in `tools/ripple.mjs`, where the fixture settles for 120
     * steps before commanding anything: unattached, the first wave came back 6 slots
     * instead of 10 and the worst-case sweep dropped from 20 slots to 14.
     *
     * `update()` repeats it because a hull swap or a respawn replaces `world.player`.
     */
    this._armSalvo();
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
    // MMB-click salvos. A middle click that moved was a pan, and returns above.
    else if (e.button === 1) this._salvo('auto', false);
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
      this._cut(cut.wreck, cut.section);
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
   * PUT THE PLAYER'S HULL UNDER SALVO COMMAND.
   *
   * THIS FILE IS WHERE THE ATTACH BELONGS AND THE REASON IS NOT ORGANISATIONAL.
   * Attaching a controller is what withholds a SALVO mount from firing itself
   * (`combat.js#_updateShipWeapons`), and `DEFAULT_FIRE_MODE` (`ship.js:36-45`) puts
   * every cannon, rail and missile in the game into SALVO. So attaching to a hull that
   * nothing can command DISARMS it. The only honest place to declare "something can
   * command this hull" is inside the object that owns the keys, which is this one.
   *
   * Measured consequence of getting it wrong: an earlier revision attached from
   * `combat.fixedUpdate` on `ship.isPlayer`. `src/sim/selftest.mjs` drives
   * `CombatSystem` directly against a `{ player: true }` cruiser with no input layer,
   * so its cannon was held with nothing to release it and the harness fell from 54/54
   * to 49/54.
   *
   * Idempotent, and re-run every frame from `update()` so a hull swap or a respawn
   * does not leave the new ship uncommanded — `attachSalvo` is a `WeakMap` get on the
   * already-attached path, which is the whole cost.
   */
  _armSalvo() {
    const player = this.world.player;
    if (!player || player.dead) return false;
    return this.world.systems?.combat?.armSalvo?.(player) === true;
  }

  /**
   * COMMIT A RIPPLE.
   *
   * Armed synchronously with the press, like every other order in this file: `arm()`
   * only SCHEDULES - not one round leaves a barrel until the combat system's next
   * fixed step - so nothing here runs simulation outside the step. The charge key is
   * different and goes through an intent flag instead; see `update()`.
   *
   * A refusal is never silent. "I pressed fire and nothing happened" is the single
   * worst thing a committed-fire verb can do, so the reason is printed from the
   * published `bearingReport` fields rather than guessed at.
   *
   * @param {'port'|'starboard'|'all'|'auto'} side
   * @param {boolean} immediate  arm guns that do not bear yet (the Shift variant)
   */
  _salvo(side, immediate) {
    const player = this.world.player;
    const combat = this.world.systems?.combat;
    if (!player || player.dead || !combat?.fireSalvo) return 0;
    this._armSalvo();

    const slots = combat.fireSalvo(player, side, immediate ? { immediate: true } : undefined);
    if (slots > 0) {
      this._feedback('salvo', { side, slots, immediate });
      return slots;
    }

    const rep = combat.bearingReport(player, player.target ?? null);
    const why = rep.total === 0 ? 'NO ARMAMENT FITTED'
      : rep.salvoIn > 0.05 ? `BATTERY COOLING — ${rep.salvoIn.toFixed(1)}s`
        : 'NO MOUNTS BEAR';
    this.bus.emit(EV.NOTIFY, { text: why, kind: 'order:salvo-refused', transient: true });
    return 0;
  }

  /** True while either shift key is down. The one modifier this file reads. */
  get _shift() {
    return this.keys.has('shiftleft') || this.keys.has('shiftright');
  }

  /**
   * ORDER A CUT, CLEAN OR FAST.
   *
   * The single site both cut orders go through, so the mode cannot be bound to one and
   * not the other. `orderCut`'s third argument sets `cutMode`, which `_updateCut` reads
   * for BOTH the rate (`fastCutRate` 1.75) and the quality (`cutQuality(..., fast)` plus
   * a 1.4x burn multiplier while the wreck is still hot). One press, two consequences
   * pulling opposite ways — a hot wreck cools over about ninety seconds, so waiting is
   * the third option and the reason the mode is a decision at all.
   */
  _cut(wreck, section) {
    const salvage = this.world.systems.salvage;
    if (!salvage?.orderCut) return false;
    const mode = this._shift ? 'fast' : 'clean';
    if (!salvage.orderCut(wreck, section, mode)) return false;
    this._feedback('salvage', { section, mode });
    return true;
  }

  /**
   * DUMP COOLANT.
   *
   * Refused BEFORE the charge is spent — there are three of them in the whole hold
   * (`STORES.coolantBase`) and a wasted one is a real loss. `purgeRefusal()` is the
   * published predicate for that, so this cannot drift out of step with what `purge()`
   * will actually do.
   */
  _purge() {
    const player = this.world.player;
    const thermal = player?.thermal;
    if (!player || player.dead || !thermal?.purge) return false;
    const refusal = thermal.purgeRefusal?.();
    if (refusal) {
      this.bus.emit(EV.NOTIFY, { text: refusal, kind: 'order:purge-refused', transient: true });
      return false;
    }
    const before = thermal.peak;
    if (!thermal.purge()) {
      this.bus.emit(EV.NOTIFY, { text: 'PURGE FAILED', kind: 'order:purge-refused', transient: true });
      return false;
    }
    this._feedback('purge', {
      before, after: thermal.peak, remaining: player.stores?.coolant ?? 0,
    });
    return true;
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
      // --- armament. See the header block for where these four keys came from. ---
      case SALVO_KEY:
        this._salvo('auto', this._shift);
        break;
      case SALVO_PORT_KEY:
        this._salvo('port', this._shift);
        break;
      case SALVO_STARBOARD_KEY:
        this._salvo('starboard', this._shift);
        break;
      // Coolant purge. See the header block: this method had one caller in the tree
      // and it was the self-test.
      case PURGE_KEY:
        this._purge();
        break;

      case 'keyz': {
        // Nearest cuttable section, one key. Salvage is the loop; make it cheap.
        // Shift is the FAST cut — see the header block.
        const near = this.world.systems.salvage?.findNearestSection();
        if (near) this._cut(near.wreck, near.section);
        break;
      }
      default: break;
    }

    /*
     * Power routing presets, gated until the player owns a reactor.
     *
     * F6 IS NEW AND IT IS THE ONE THE NEW SYSTEM NEEDS. The other five are fixed
     * shares — they were written when the four channels always summed to 1 and there
     * was nothing else they could be. `power.js` now publishes a DEMAND per channel
     * derived from the fit, so `applyPreset('demand')` routes in proportion to what
     * the hull is actually asking for. On a slack hull that feeds everything; on an
     * oversubscribed one it spreads the shortfall evenly instead of choosing a victim,
     * which is the right default for a player who has not decided yet.
     *
     * It also stops `demandRouting()` being the same defect this commit is fixing
     * elsewhere: a published method with no caller.
     */
    if (this.world.unlocked.powerRouting) {
      const presets = {
        f1: 'balanced', f2: 'assault', f3: 'run', f4: 'turtle', f5: 'scan', f6: 'demand',
      };
      const preset = presets[code];
      if (preset) {
        e.preventDefault();
        const plant = this.world.player?.power;
        plant?.applyPreset(preset);
        this._feedback('power', {
          preset,
          strain: plant?.strain ?? 0,
          deficit: plant?.deficit ?? 0,
        });
      }
    }
  };

  _onKeyUp = (e) => {
    this.keys.delete(e.code.toLowerCase());
  };

  _setScale(i) {
    // Clamp against the engine's ACTIVE table, not the combat one - transit widens it
    // to 64x and ] must be able to reach that tail.
    const clamped = Math.max(0, Math.min(this.engine.scaleTable.length - 1, i));
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

    // The player's hull is under salvo command for as long as this object is alive to
    // command it. Idempotent; see `_armSalvo` for why it lives here and not in combat.
    this._armSalvo();

    /*
     * HOLD TO CHARGE, POLLED.
     *
     * Not keydown/keyup, for two reasons that both bite in practice: `_onKeyDown`
     * returns early on `e.repeat` (line 247 above), and a window blur calls
     * `this.keys.clear()` without ever delivering a keyup - so an alt-tab mid-charge
     * would leave a mount wound up and traverse-locked for the rest of the run.
     * Polling the set makes both cases release the charge, and the flag is consumed on
     * the transition inside the fixed step rather than fired from this render callback.
     */
    const wantsCharge = k.has(CHARGE_KEY);
    if (wantsCharge !== this._chargeHeld) {
      this._chargeHeld = wantsCharge;
      this.world.systems?.combat?.setChargeIntent?.(this.world.player, wantsCharge);
    }

    this._updateHover();
  }
}
