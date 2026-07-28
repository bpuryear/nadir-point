/**
 * Event names for the progression, economy and objective layer.
 *
 * These are deliberately NOT in `core/events.js`: that file is owned by integration
 * and this stream may not edit it. They follow the same discipline - constants, never
 * raw strings, so a typo is a reference error rather than a dead listener - and they
 * are namespaced `meta:` so they can be lifted into `EV` wholesale when integration
 * wants them there.
 */
export const MEV = {
  // economy
  SCRAP_ACQUIRED: 'meta:scrap-acquired',
  SCRAP_VENTED: 'meta:scrap-vented',
  REFINED: 'meta:refined',
  MATERIALS_SPENT: 'meta:materials-spent',
  CARGO_CHANGED: 'meta:cargo-changed',

  // items
  ITEM_ACQUIRED: 'meta:item-acquired',
  ITEM_USED: 'meta:item-used',
  ITEM_EXPIRED: 'meta:item-expired',
  ITEM_BUILT: 'meta:item-built',

  // progression
  PERK_PURCHASED: 'meta:perk-purchased',
  PERK_UNLOCKED: 'meta:perk-unlocked',
  PATTERN_LEARNED: 'meta:pattern-learned',
  PATTERN_BUILT: 'meta:pattern-built',
  CODEX_UPDATED: 'meta:codex-updated',

  // objectives
  OBJECTIVE_OPENED: 'meta:objective-opened',
  OBJECTIVE_CLOSED: 'meta:objective-closed',
  OBJECTIVE_PROGRESS: 'meta:objective-progress',
};
