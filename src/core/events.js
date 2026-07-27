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
