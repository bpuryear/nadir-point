/** Minimal synchronous event bus. Systems talk through this, not through each other. */
export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(type, fn) {
    let set = this._handlers.get(type);
    if (!set) this._handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    this._handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[events] handler for "${type}" threw`, err);
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}

/**
 * Canonical event names. Systems must use these constants, never raw strings,
 * so a typo is a reference error rather than a silently dead listener.
 */
export const EV = {
  // simulation
  SHIP_SPAWNED: 'ship:spawned',
  SHIP_DESTROYED: 'ship:destroyed',
  SHIP_DISABLED: 'ship:disabled',
  SUBSYSTEM_HIT: 'subsystem:hit',
  SUBSYSTEM_DESTROYED: 'subsystem:destroyed',
  HARDPOINT_BREACH_WARNING: 'hardpoint:breach-warning',
  HARDPOINT_BREACHED: 'hardpoint:breached',
  MODULE_LOST: 'module:lost',
  MODULE_INSTALLED: 'module:installed',
  MODULE_REMOVED: 'module:removed',

  // combat
  WEAPON_FIRED: 'weapon:fired',
  WEAPON_CHARGING: 'weapon:charging',
  SALVO_FIRED: 'salvo:fired',
  SALVO_COMPLETE: 'salvo:complete',
  PROJECTILE_IMPACT: 'projectile:impact',
  SHIELD_IMPACT: 'shield:impact',
  EXPLOSION: 'vfx:explosion',

  // salvage
  SALVAGE_CUT_START: 'salvage:cut-start',
  SALVAGE_CUT_STOP: 'salvage:cut-stop',
  SALVAGE_ACQUIRED: 'salvage:acquired',
  SALVAGE_TOW_START: 'salvage:tow-start',

  // power
  POWER_ROUTED: 'power:routed',
  POWER_CAPACITY_CHANGED: 'power:capacity-changed',

  // orders / player
  ORDER_MOVE: 'order:move',
  ORDER_ATTACK: 'order:attack',
  ORDER_SALVAGE: 'order:salvage',
  ORDER_STRIKECRAFT: 'order:strikecraft',
  SELECTION_CHANGED: 'selection:changed',

  // world
  POI_ENTERED: 'world:poi-entered',
  POI_LEFT: 'world:poi-left',
  BATTLE_STARTED: 'world:battle-started',
  BATTLE_RESOLVED: 'world:battle-resolved',
  REPUTATION_CHANGED: 'world:reputation-changed',

  // meta
  TIME_SCALE_CHANGED: 'time:scale-changed',
  UI_SCREEN_CHANGED: 'ui:screen-changed',
  REFIT_PREVIEW: 'ui:refit-preview',
  NOTIFY: 'ui:notify',
};

/**
 * ===========================================================================
 * ARMAMENT PAYLOAD SHAPES — pinned, because two streams build against them at
 * the same time and neither can see the other's file.
 * ===========================================================================
 *
 * These typedefs are the contract. The salvo controller (`sim/salvo.js`) emits
 * them; `vfx/weapons.js`, `audio/weapons.js` and `ui/weapons.js` consume them. A
 * field added here without a note is a field a consumer will not know exists.
 *
 * THE PAYLOAD OBJECT IS NOT RETAINED. `EventBus.emit` is synchronous and the
 * emitter is free to reuse it, and the vectors on it are live simulation state —
 * `origin` is a `Vector3` the mount owns and rewrites every tick. A listener that
 * wants a value past the end of its handler must COPY it. This is not a style
 * preference; the alternative is one allocation per shot inside a fixed-step
 * system, against a rule that says nothing per-frame allocates.
 */

/**
 * `EV.WEAPON_FIRED` — one shot left one barrel. Already emitted by `sim/combat.js`.
 *
 * `origin` exists TODAY but is always `mount.worldPosition`: the centre of a
 * casemate whose barrels can span two hundred metres, so all four shots of a burst
 * currently spawn from the same point. Once the salvo controller lands it becomes
 * the world-space position of the specific muzzle that fired, taken from the
 * module's declared `muzzles` (see `core/contracts.js#ModuleDef`) — the field does
 * not change shape, only its accuracy. Consumers should treat it as per-emitter now.
 *
 * @typedef {Object} WeaponFiredPayload
 * @property {import('../sim/ship.js').Ship} ship
 * @property {Object} mount                    the WeaponMount that fired
 * @property {import('three').Vector3} origin  world position of the muzzle. LIVE — copy it.
 * @property {import('three').Vector3} aimPoint world position aimed at. LIVE — copy it.
 * @property {string} type                     WeaponDef.type: cannon|beam|rail|missile|flak|pd|lance|mining
 * @property {number} heat                     mount thermal load, 0..1, at the moment of firing
 * @property {number} [emitter]                index into `moduleDef.muzzles`; absent for
 *                                             AUTO fire, which does not choose a barrel
 */

/**
 * `EV.WEAPON_CHARGING` — a CHARGE-archetype mount has begun its spool-up and will
 * fire in `time` seconds unless it is aborted.
 *
 * This event exists to close a coupling `audio/weapons.js#_rail` explicitly refused
 * to take: a real pre-charge needs combat to say a shot is COMING, and nothing did.
 * It is emitted once at the start of the charge, not per tick — `charge` is polled
 * off the mount for the continuous read.
 *
 * `aborted: true` is emitted a second time on the same mount if the player releases
 * early; `time` is then the elapsed charge rather than the remaining charge, and
 * consumers should stop whatever they started rather than resolve it.
 *
 * @typedef {Object} WeaponChargingPayload
 * @property {import('../sim/ship.js').Ship} ship
 * @property {Object} mount
 * @property {number} time                     seconds to release (or elapsed, if aborted)
 * @property {number} charge                   0..1 at the moment of emission
 * @property {boolean} [aborted]               true when the charge was released early
 */

/**
 * `EV.SALVO_FIRED` — a ripple has been armed and its first slot is about to release.
 *
 * Emitted ONCE per salvo, at arm time, before any `WEAPON_FIRED`. `slotCount` is the
 * number of slots the controller actually scheduled, which is NOT the number of guns
 * on the flank: a dead barrel or a frozen traverse ring still occupies a slot (it is
 * a hole in the wave, and removing it would destroy the mechanic), but a mount that
 * is offline, excluded, or already cooling is never scheduled at all.
 *
 * @typedef {Object} SalvoFiredPayload
 * @property {import('../sim/ship.js').Ship} ship
 * @property {string} side                     'port' | 'starboard' | 'all'
 * @property {number} slotCount                slots scheduled, including dead and frozen ones
 */

/**
 * `EV.SALVO_COMPLETE` — the last slot in the ripple has resolved.
 *
 * Emitted once, on exhaustion, whether or not every slot fired. `fired + dropped`
 * equals the `slotCount` from the matching `SALVO_FIRED`, which is what lets the HUD
 * print "SALVO 6/8 · 2 DEAD" without a second traversal of the weapon list.
 *
 * `reasons` counts WHY slots did not fire, so a consumer can say which failure it
 * was without re-deriving it. Keys are the controller's vocabulary and a consumer
 * must tolerate unknown ones:
 *
 *   dead      the mount's output sub-part is destroyed — the barrel is gone
 *   frozen    the traverse ring is destroyed; the gun fired where it was stuck
 *   dry       the ready feed emptied mid-ripple
 *   jammed    a misfeed roll failed on a worn mount
 *   cooked    the mount tripped thermally partway down the wave
 *   nobear    the target left the arc before this slot's turn came round
 *
 * @typedef {Object} SalvoCompletePayload
 * @property {import('../sim/ship.js').Ship} ship
 * @property {string} side                     'port' | 'starboard' | 'all'
 * @property {number} fired                    slots that put a round downrange
 * @property {number} dropped                  slots that did not
 * @property {Object<string, number>} reasons  reason -> count; keys as above
 */
