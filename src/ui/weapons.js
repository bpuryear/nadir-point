/**
 * THE ARMAMENT STRIP — weapon mounts, ship thermal state, and the device hotbar.
 *
 * This is the densest new readout in the game and it exists because four systems
 * landed with real consequences and no way to see any of them:
 *
 *   sim/heat.js      per-mount thermal load, a soft cap that widens dispersion, a trip
 *                    that takes the mount offline AND damages the hardpoint under it
 *   sim/condition.js one 0..1 number that costs rate of fire, traverse, muzzle energy
 *                    and cooling, and decides what the mount is worth when cut off
 *   sim/stores.js    finite rounds, a ready feed, a reload clock, and a charge buffer
 *   sim/subparts.js  barrels / feed / traverse ring / cooling / pad, each failing in
 *                    its own legible way — a dead traverse ring FREEZES the arc
 *
 * `docs/design/scope-decision.md`'s fourth test is "can the player see it? Hidden state
 * that changes outcomes is a bug, not depth." Every one of the above changed outcomes
 * and none of it was on screen. This file is that bug's fix.
 *
 * THE ONE RULE OF THIS PANEL: A MOUNT THAT IS FROZEN, STARVED, COOKING OR WORN MUST BE
 * DISTINGUISHABLE AT A GLANCE. So each cell carries a single solid state chip — the
 * reference's loudest primitive (`reference-ui-language.md` §4) — chosen by urgency,
 * and the states that persist underneath it (a frozen ring, a worn barrel) get their
 * own outlined chip below rather than being hidden by the louder one. Value and
 * pattern carry the distinction, never hue: the interface is monochrome plus amber,
 * and amber means "this is costing you something right now".
 *
 * THERMAL is drawn in the reference's own idiom, transcribed from its frame: the word
 * `STATUS NOMINAL` flipping to `STATUS OVERHEATED`, an `EXT 87.8 / 94.4` figure, a large
 * vertical bar, and a signed rate chip (`2.4%/s`). Those are its numbers, wired to ours.
 *
 * ---------------------------------------------------------------------------
 * THE FLANK BAND — the one axis six hardpoint cells cannot express
 * ---------------------------------------------------------------------------
 *
 * `sim/salvo.js` made the broadside a per-SIDE event that spans several mounts and
 * several barrels within a mount, and every cell in this panel is keyed by hardpoint.
 * So the wave itself — the thing the player commits to with one key — had no readout at
 * all. Two rows above the cells fix that, and the pip run is the whole point:
 *
 *   ONE PIP PER SLOT, IN HULL ORDER FORE TO AFT, so the row you read left-to-right is
 *   spatially the same wave the guns fire and in the same order they fire it.
 *
 * The pip vocabulary is value and pattern, never hue, and it is one sentence long:
 *
 *   solid            a round leaves this barrel
 *   hollow, bright   scheduled, not resolved yet
 *   hollow, amber    FROZEN — it will fire down a dead bearing, spending the round and
 *                    the heat and landing nothing (`salvo.js` schedules it on purpose)
 *   hollow, dim      DROPPED — it was in the wave and it did not go
 *   a strike, no box DEAD barrel. A hole. The slot count does NOT go down, which is the
 *                    entire mechanic: `tools/ripple.mjs` check 4 asserts 10 -> 10.
 *
 * WHAT IS A PREVIEW AND WHAT IS A MEASUREMENT, because they must not look alike.
 * Before the first wave, `salvoPreview` publishes a COUNT and no per-slot identity, so
 * the band draws that many solid pips and says so with `READY n/m`. From the moment a
 * wave is armed, `salvoReport().slots` carries the real thing — hardpoint, order, dead,
 * frozen, state — and the row switches to drawing it, and keeps drawing the LAST wave
 * after it completes, because a battery's last broadside is its damage report.
 *
 * THIS PANEL READS `salvoReport` / `salvoPreview` AND NOTHING ELSE OUT OF `salvo.js`.
 * The controller's underscored fields are scheduler working state. Both reports are
 * cached-and-mutated objects whose rows are REUSED, so every field this file wants to
 * hold across a frame is copied into the preallocated rows below, at 5 Hz.
 */

import * as THREE from 'three';
import { HARDPOINTS, allItems } from '../core/contracts.js';
import { THERMAL, SALVO_THERMAL, thermalReport } from '../sim/heat.js';
import { salvoReport, salvoPreview } from '../sim/salvo.js';
import { angleDelta } from '../sim/physics.js';
import { storesReport, AMMO_SPEC } from '../sim/stores.js';
import { CONDITION } from '../sim/condition.js';
import { C, F, TRACK, factionInk, fmtPct } from './theme.js';
import { Panel, PAD, TITLE_H } from './panels.js';
import { moduleName, itemName, MOUNT_EMPTY } from './names.js';

/**
 * THE FLANK BAND IS PAID FOR, NOT ADDED.
 *
 * The project owner's standing note on this interface is "that UI looks very messy and
 * condensed at that screen resolution… otherwise the game becomes more UI than
 * graphics", so a new readout that simply grew the window would be answering a
 * measurement with a shrug. Three sizes came down to pay for the band:
 *
 *   CELL_H     130 -> 124   the dead strip between the persistent-chip row (its glyph
 *                           box ends at y+99.5) and the sub-part squares, which sit at
 *                           `y + h - sq - 5`. MEASURED `sq`: 9 at 1280x720, 11 at
 *                           1600x900, 10 at 1920x1080. Its ceiling is 15, not the 16 in
 *                           the `Math.min` — `baseW` caps the body at 746 px, so `cellW`
 *                           cannot exceed 98 — and at `sq` 15 the squares start at y+104
 *                           with the chip row's glyphs ending at y+99.5. 4.5 px of air
 *                           at the worst case this window can reach.
 *   HOTBAR_H    36 -> 32    the slot's two baselines are 12 px apart; 32 is the height
 *                           at which they stop having 8 px of air between them
 *   legend band 34 -> 24    one label, one rule and the gap to the hotbar
 *
 * MEASURED, before and after, on the real frame: the window goes from 597x261 to
 * 597x267 at 1280x720 — width unchanged — which is 17.19 % of the frame to 17.45 %,
 * 25.55 % of the central half to 26.05 %, and 0 % of the ship's box to 0 %. Note that
 * `tools/uicheck.mjs#checkChrome` rasters `ui._weldedRegions(P)` ONLY, so it cannot see
 * a floating window at all and reports all three of its percentages unchanged. Quoting
 * that as evidence would be quoting a check that did not measure the thing that moved.
 */
const CELL_W = 98;
const CELL_H = 124;
const THERM_W = 152;
const HOTBAR_H = 32;
/** One row per flank. 13 px: a 10 px box plus 2.5 px of air, so the audit stays quiet. */
const FLANK_ROW_H = 13;
const FLANK_H = FLANK_ROW_H * 2;
/** SUB-PARTS label, its rule, and the gap down to the device hotbar. */
const LEGEND_H = 24;
const BODY_H = FLANK_H + CELL_H + LEGEND_H + HOTBAR_H + 6;

/** Abbreviated to fit the cell header beside the weapon archetype. */
const MOUNT_LABEL = {
  bow: 'BOW', dorsal: 'DORSAL', ventral: 'VENT',
  port: 'PORT', starboard: 'STBD', engine: 'ENG',
};

/** Sub-part kind → the single letter drawn inside its square, and the legend text. */
const PART_LETTER = { output: 'O', feed: 'F', traverse: 'T', cooling: 'C', mount: 'M' };
const PART_LEGEND = 'O OUTPUT · F FEED · T TRAVERSE · C COOLING · M PAD';

/** Device hotbar keys. 1–3 are the time scale and ] [ step it; 4–8 are free. */
const HOTBAR_KEYS = ['4', '5', '6', '7', '8'];
const HOTBAR_CODES = ['digit4', 'digit5', 'digit6', 'digit7', 'digit8'];

/**
 * Ship-local bearing of each flank's beam, and the arc test that decides whether a gun
 * is ON that flank at all.
 *
 * THIS IS THE ONE PIECE OF ARITHMETIC THIS PANEL DOES NOT ASK THE SIM FOR, and it is
 * deliberate rather than lazy. The published read API answers "how many barrels would
 * fire RIGHT NOW" (`salvoPreview().slots`) and nothing answers "how many does this
 * flank own when everything works" — which is the denominator in `READY 6/10`, and
 * without it the numerator is a number with no scale. `yawCentre` and `yawWidth` are
 * `WeaponMount` fields that `ui/tactical.js` already draws firing arcs from; they are
 * not salvo state. The rule below is the same one `sim/salvo.js#bearsOnFlank` uses,
 * measured against the AUTHORED `yawWidth` and never against `halfArc` — `halfArc`
 * collapses to 0.07 rad when the traverse ring is destroyed (`ship.js:192-194`), so
 * using it would quietly drop every frozen gun out of the flank it is still bolted to.
 *
 * THE DRIFT GUARD: every count this band PRINTS as a numerator comes from the sim.
 * The local walk only ever produces the capacity, and `_refreshFlank` raises that
 * capacity to the sim's own number if the two ever disagree, so `READY n/m` cannot
 * print n > m no matter which side rots first.
 */
const BEAM = { port: -Math.PI * 0.5, starboard: Math.PI * 0.5 };

/**
 * How many barrels one mount puts into a wave.
 *
 * ModuleDef data, not salvo state: `muzzles` is declared statically on the def (never
 * read off the built mesh, which is LOD-gated and would make a sim quantity depend on
 * the graphics setting), and `tools/ripple.mjs` check 13 asserts every weapon module
 * declares exactly `shotsPerBurst` of them. The `min` is therefore an identity today
 * and a safety net if that ever stops being true.
 */
function emittersOf(mount) {
  const declared = mount.moduleDef?.muzzles?.length ?? 1;
  return Math.max(1, Math.min(declared, mount.def.shotsPerBurst ?? 1));
}

/**
 * Pips this band will draw for one flank before it stops and prints the remainder.
 *
 * A UI capacity, NOT the sim's. `salvo.js` exports `MAX_SLOTS` and exports it for the
 * tools and the input layer explicitly — not for a panel — so importing it here to size
 * an array would be this file quietly acquiring a second dependency on the scheduler's
 * shape. 24 is generous against the 18-slot worst case `tools/ripple.mjs` prints over
 * the whole registry, and overflow is SAID (`+n`) rather than silently dropped.
 */
const PIP_CAP = 24;
const PIP_W = 5;
const PIP_PITCH = 7;
/** Left lane for the side name. `STBD` measures 30.5 px at micro with TRACK.label. */
const FLANK_LABEL_W = 36;

/** One flank row, allocated once per panel. Nothing below ever allocates again. */
function makeFlankRow(side, name) {
  const pips = [];
  for (let i = 0; i < PIP_CAP; i++) pips.push({ state: 'pending', dead: false, frozen: false });
  return {
    side,
    name,
    /** What the row is showing: a live/last WAVE, or a PREVIEW count. */
    live: false,
    /** True only while the sweep is actually running. See `_drawFlankRow`. */
    active: false,
    pips,
    n: 0,
    overflow: 0,
    /** Barrels that would fire now, and what the flank owns when nothing is wrong. */
    ready: 0,
    capacity: 0,
    guns: 0,
    /** Seconds until `ready` could become non-zero. 0 means press it. */
    wait: 0,
    /** Resolved counts, only meaningful while `live`. */
    fired: 0,
    dropped: 0,
    dead: 0,
    frozen: 0,
    /** Projected peak mount heat on this flank after a full wave. See `_refreshFlank`. */
    proj: 0,
    cooks: false,
    /** No gun on the hull covers this beam at all. */
    bears: false,
    /** True when this row is standing in for the no-target `all` case. */
    noFlank: false,
  };
}

/**
 * Mount states, most urgent first. The first one that matches becomes the solid chip.
 *
 * `tone` is how loud the chip is, not what colour: `alarm` is a filled amber plate with
 * dark text (unmissable), `warn` is amber type on the plate, `idle` is dim. There is no
 * third hue anywhere in here — see the header.
 */
const STATE = {
  // STRUCTURAL LOSS. The only states in this panel that get hostile red, and the
  // only ones the player cannot undo by waiting or by pressing something.
  BREACHED: { tone: 'lost', note: 'MOUNT LOST' },
  DETACHED: { tone: 'lost', note: 'PAD GONE' },

  // HEAT. Amber, escalating by VALUE — HOT is the low amber, COOKED is the full
  // one. The panel used to carry the same saturated red for thermal state, empty
  // magazines, structural failure, disabled subsystems AND an alert count at the
  // same value, so the eye had nowhere to look first.
  COOKED: { tone: 'heat', note: 'THERMAL TRIP' },
  HOT: { tone: 'heatLow', note: 'OVER SOFT CAP' },

  // ABSENCES. Out of rounds, out of charge, feeding, jammed, unpowered, worn past
  // use: none of these is on fire and none of them is red. Neutral ink and a struck
  // bar say "there is nothing here" without competing with the emergency.
  DRY: { tone: 'starved', note: 'MAGAZINE EMPTY' },
  'NO CHG': { tone: 'starved', note: 'BUFFER EMPTY' },
  JAM: { tone: 'starved', note: 'MISFEED' },
  RELOAD: { tone: 'starved', note: 'FEEDING' },
  OFFLINE: { tone: 'starved', note: 'SUBSYSTEM DOWN' },
  INERT: { tone: 'starved', note: 'WILL NOT FIRE' },

  // COMMANDED. Four states that exist only because there is now something to command:
  // a gun can be winding up, sitting out by the player's own order, cooling from the
  // last wave, or loaded and waiting for the next one.
  //
  // `HOLD` MUST NOT BE `starved`. theme.js:166-168 defines starved as an ABSENCE — out
  // of rounds, out of charge, out of power, drawn in neutral ink with a struck bar to
  // say "there is nothing here". A loaded gun waiting for an order is the opposite of
  // an absence, and drawing it as one would tell the player their battery was empty at
  // the exact moment it was ready. It gets its own tone: an outlined chip with a solid
  // left cap, at full ink. Present, inert, and unmistakably loaded.
  //
  // `short` IS A WIDTH BUDGET, NOT A STYLE, and the budget is measured rather than
  // guessed. `COOLDOWN` at `F.microBold` with `TRACK.label` is 60.96 px. A cell is 65 px
  // wide at 1280x720, 73 at 1600x900 and 68 at 1920x1080 — so the long word does fit at
  // all three gate viewports, by two pixels a side at the narrowest. It stops fitting
  // the moment `cellW` reaches its own `Math.max(52, …)` floor, which happens below
  // roughly 500 logical px of frame (a small window, or a high `UI_SCALES` step on a
  // small one): the cell is then 48 px of drawing and two adjacent 8-letter words
  // OVERLAP BY 9 PX ON A SHARED BASELINE. That is not overflow into nothing, it is the
  // `STARBOARD NACELLEENGINE` defect `tools/uicheck.mjs` was written to catch. Four
  // letters is 30.5 px and clears the 52 px floor whatever the frame does. The long key
  // is what a click reads out, so nothing is lost.
  CHARGING: { tone: 'heatLow', note: 'WINDING UP', short: 'WIND' },
  // EXCLUDED OUTRANKS HOLD, against the brief's own ordering, and the reason is
  // mechanical rather than aesthetic: HOLD asserts "this gun answers the salvo key",
  // and `salvo.js#salvoPreview` skips `mount.excluded` outright. An excluded mount
  // that printed HOLD would be the one lie this ladder is not allowed to tell.
  EXCLUDED: { tone: 'out', note: 'HELD OUT OF THE SALVO', short: 'OUT' },
  COOLDOWN: { tone: 'hold', note: 'RECOVERING', short: 'COOL' },
  HOLD: { tone: 'hold', note: 'AWAITING ORDER' },

  READY: { tone: 'ok', note: '' },
  PASSIVE: { tone: 'idle', note: 'NO WEAPON' },
  EMPTY: { tone: 'idle', note: 'NOTHING FITTED' },
};

/**
 * Below this the cooldown is ordinary operation and not a state worth a word.
 *
 * Without it an AUTO mount firing steadily would flip READY/COOLDOWN at its own rate of
 * fire — a cell strobing at 3 Hz, which is noise dressed as information. COOLDOWN is
 * only ever shown on a COMMANDABLE mount, where the clock is the thing standing between
 * the player and the next order.
 */
const COOLDOWN_FLOOR = 0.25;

/** tone -> the ink it is allowed. See SEMANTIC in theme.js. */
const TONE_INK = {
  lost: C.hostile,
  heat: C.warn,
  heatLow: C.warnLow,
  starved: C.inkFaint,
  hold: C.ink,
  out: C.inkDim,
  ok: C.inkDim,
  idle: C.inkFaint,
};

/**
 * The word under the fire-mode chip, per archetype.
 *
 * `LOCKED` IS PD AND ONLY PD. The recon brief asks for it on mining too; the code
 * disagrees and the code wins — `ship.js:170-176` pins the getter to AUTO and makes the
 * setter a no-op for `type === 'pd'` alone, and `salvo.js#schedulable` refuses `pd`
 * alone. A mining mount can be put in SALVO and will be scheduled, so labelling it
 * LOCKED would describe a restriction that does not exist.
 */
const MODE_LABEL = { AUTO: 'AUTO', SALVO: 'SALVO', CHARGE: 'CHARGE' };

export class ArmamentPanel extends Panel {
  constructor(ui) {
    super({
      id: 'armament',
      title: 'ARMAMENT · THERMAL · DEVICES',
      hint: 'X',
      w: PAD * 2 + THERM_W + 6 + HARDPOINTS.length * CELL_W,
      h: TITLE_H + PAD * 2 + BODY_H + 15,
    });
    this.ui = ui;
    this.world = ui.world;

    /** Preallocated cell rows: one per hardpoint, reused every frame. */
    this._cells = HARDPOINTS.map((id) => ({ id, hp: null, mount: null, module: null }));
    /** Device rows, rebuilt at 5 Hz because `canUse` allocates and this is per frame. */
    this._devices = [];
    this._devicesAt = -1;

    /**
     * THE TWO FLANK ROWS, ALLOCATED ONCE.
     *
     * `salvoReport().slots[i]` hands back objects the controller OWNS and rewrites
     * every wave — W2-A's note is explicit that a caller may not retain a row — so the
     * five fields this band draws are copied into these pips at 5 Hz. That is also the
     * whole of the caching the wave plan asks for: the reports themselves allocate
     * nothing, but `_capacity` walks the weapon list and this draws every frame.
     */
    this._flank = [makeFlankRow('port', 'PORT'), makeFlankRow('starboard', 'STBD')];
    this._flankAt = -1;

    /**
     * Does this hull have a salvo controller at all?
     *
     * `HOLD` is a claim that a loaded gun is waiting for an ORDER, and that is only true
     * once something exists to give one. `salvo.js` is explicit that attaching a
     * controller is what withholds a SALVO mount from the automatic firing path — with
     * no controller the gun fires itself and `READY` is the honest word. The published
     * API answers this without a second entry point: `salvoPreview().side` is `null`
     * exactly when there is no controller, and a flank name otherwise.
     */
    this._commanded = false;
  }

  // =========================================================================

  drawBody(P, x, y, w, h, hit) {
    const player = this.world.player;
    if (!player) {
      P.text('NO HULL', x, y + 14, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }

    const therm = thermalReport(player);
    const stores = storesReport(player);

    /**
     * THE MOUNT CELLS ARE A FRACTION OF THE WIDTH HANDED IN. THE THERMAL COLUMN IS NOT.
     *
     * `PanelHost._layout` now clamps every window against the frame, because a 766 px
     * ARMAMENT on a 1280 px frame covered 31 % of the central half on its own. A body
     * that laid out at `THERM_W + 6 * CELL_W` regardless would have its last two mounts
     * clipped off by the panel's own border — `panels.js:38-42`'s named defect, a hard
     * edge through a row of type reading as a rendering fault.
     *
     * The thermal column does NOT scale, and that is deliberate: its content is fixed
     * strings at fixed lanes (`EXT 94.0 / 94.4` is 75 px on its own against a 32 px
     * value lane at `w * 0.204` on a narrow frame — measured, it printed straight
     * through the BOW cell's `HEAT` row). A column whose content cannot shrink is a
     * column that does not get to shrink; the give comes out of the six cells, which
     * degrade legibly.
     */
    const thermW = THERM_W;
    const cellW = Math.max(52, Math.floor((w - thermW - 6) / HARDPOINTS.length));

    // THE FLANK BAND SITS ABOVE EVERYTHING, at full body width, because it is the
    // summary of the row underneath it: two rows that say what one key does, over six
    // cells that say why. Reading downward is reading from the decision to its causes.
    this._drawFlank(P, x, y, w, player, hit);
    const cy0 = y + FLANK_H;

    this._drawThermal(P, x, cy0, thermW, CELL_H, therm, stores);
    P.vline(x + thermW + 2, cy0, CELL_H, C.ruleDim);

    this._collect(player);
    let cx = x + thermW + 6;
    for (const cell of this._cells) {
      this._drawCell(P, cx, cy0, cellW - 4, CELL_H, cell, player, stores, hit);
      cx += cellW;
    }

    // The sub-part legend. Five letters carrying five different failure modes is a
    // vocabulary, and an unexplained vocabulary is just noise.
    P.label('SUB-PARTS', x, cy0 + CELL_H + 12, { color: C.inkDim });
    P.label(PART_LEGEND, x + thermW + 6, cy0 + CELL_H + 12,
      { color: C.inkFaint, maxW: w - thermW - 6 });

    P.hline(x, cy0 + CELL_H + 17, w, C.rule);
    this._drawHotbar(P, x, cy0 + CELL_H + 24, w, HOTBAR_H, hit);
    void h;
  }

  // =========================================================================
  // The flank band
  // =========================================================================

  /**
   * Rebuild both rows from the published salvo read API. 5 Hz.
   *
   * ORDER OF PREFERENCE, and it is the whole design: a REAL wave beats a preview. From
   * the moment one is armed until the next one replaces it, `salvoReport` carries the
   * hardpoint, the hull order, the dead barrels and the frozen rings, so the row shows
   * the thing that actually happened. Only a hull that has not fired yet shows a count.
   */
  _refreshFlank(now) {
    const rows = this._flank;
    if (now - this._flankAt < 0.2) return rows;
    this._flankAt = now;

    const player = this.world.player;
    for (const row of rows) {
      row.live = false; row.active = false; row.n = 0; row.overflow = 0;
      row.ready = 0; row.capacity = 0; row.guns = 0; row.wait = 0;
      row.fired = 0; row.dropped = 0; row.dead = 0; row.frozen = 0;
      row.proj = 0; row.cooks = false; row.bears = false; row.noFlank = false;
      row.name = row.side === 'port' ? 'PORT' : 'STBD';
    }
    if (!player) return rows;

    // `salvoPreview` returns ONE shared object and rewrites it on every call, so the
    // four fields are copied out before the second call is made. Reading them in the
    // other order would have both rows reporting the starboard flank.
    this._commanded = false;
    for (const row of rows) {
      const pv = salvoPreview(player, row.side);
      if (pv.side !== null) this._commanded = true;
      row.ready = pv.slots;
      row.guns = pv.mounts;
      row.wait = pv.wait;
      this._capacity(player, row);
    }

    const rep = salvoReport(player);
    if (rep.slotCount > 0 && rep.side) {
      // `side === 'all'` is not a third flank: `salvo.js#engagedFlank` returns it when
      // there is NO TARGET, so there is no engaged side to speak of. The band says that
      // in words rather than splitting a wave across two rows it does not belong to.
      const target = rep.side === 'starboard' ? rows[1] : rows[0];
      this._fillWave(target, rep);
      if (rep.side === 'all') {
        target.name = 'ALL';
        const other = target === rows[0] ? rows[1] : rows[0];
        other.noFlank = true;
      }
    }
    return rows;
  }

  /**
   * Copy one wave's slots into a row. Every field is copied, never referenced: the rows
   * `salvoReport` hands back belong to the controller and are rewritten in place.
   */
  _fillWave(row, rep) {
    row.live = true;
    row.active = rep.active;
    row.fired = rep.fired;
    row.dropped = rep.dropped;
    const n = Math.min(rep.slotCount, PIP_CAP);
    row.overflow = rep.slotCount - n;
    for (let i = 0; i < n; i++) {
      const src = rep.slots[i];
      const pip = row.pips[i];
      pip.state = src.state;
      pip.dead = src.dead;
      pip.frozen = src.frozen;
      if (src.dead) row.dead++;
      else if (src.frozen) row.frozen++;
    }
    row.n = n;
    // A wave that is still in flight has its own clock: nothing else can be armed
    // until the lockout runs out, and that is the number the player is waiting on.
    if (rep.active || rep.lockout > 0) row.wait = Math.max(row.wait, rep.lockout);
  }

  /**
   * What this flank owns, and what a full wave off it would cost thermally.
   *
   * The heat projection is the UPPER BOUND — every mount on the flank firing every
   * barrel — and it is deliberately the upper bound, because the decision it informs is
   * "will this broadside cook a gun", and a warning that errs low is not a warning. The
   * arithmetic is `heat.js`'s own, term for term (`MountThermal.onShot`):
   *
   *     heat += perShot * (0.75 + 0.35 * powerFactorWeapons) * SALVO_THERMAL.heatMul
   *
   * with `powerFactorWeapons` read exactly as `combat.js:180` reads it. Nothing here is
   * a transcribed constant; `perShot` and both multipliers come out of `sim/`.
   */
  _capacity(player, row) {
    const beam = BEAM[row.side];
    const pf = player.power?.unlocked ? Math.max(0.25, player.power.factor('weapons')) : 1;
    const mul = (0.75 + 0.35 * pf) * SALVO_THERMAL.heatMul;
    let slots = 0;
    let proj = 0;
    for (const mount of player.weapons) {
      if (mount.def.type === 'pd') continue;
      if (mount.fireMode !== 'SALVO') continue;
      // The AUTHORED arc, not `halfArc`. See BEAM above.
      if (Math.abs(angleDelta(mount.yawCentre, beam)) > mount.yawWidth * 0.5 + 1e-6) continue;
      // An EXCLUDED mount stays in the capacity on purpose: `READY 6/10` is then the
      // player reading back their own decision, which is the point of the control.
      const emitters = emittersOf(mount);
      slots += emitters;
      /**
       * THE PROJECTION IS NOT THE CAPACITY, and conflating them printed a false alarm.
       *
       * Measured in the UI probe before this guard existed: the cruiser's dorsal rail
       * is already COOKED, `heat` pinned at `tripAt`, and adding two more rounds to it
       * put `PROJ COOK` on BOTH flanks — off a mount `salvo.js#schedulable` refuses to
       * put in either wave, because a mount that is offline for heat never gets a slot.
       * A warning that fires on rounds that will not be fired is worse than no warning.
       *
       * `usable` is `online && !inert && !detached && condition >= 0.2` (`ship.js:207`),
       * which drops the tripped, the detached and the wrecked — and also drops a mount
       * whose OUTPUT sub-part is destroyed (`offlineReason 'output'`). That last one is
       * scheduled by the ripple and is right to leave out anyway: dead barrels put no
       * round downrange, so they cost no heat. They are the holes in the pip run.
       */
      const th = mount.thermal;
      if (th && mount.usable && !mount.excluded) {
        const after = th.heat + emitters * th.perShot * mul;
        if (after > proj) proj = after;
      }
    }
    // THE DRIFT GUARD. The numerator is the sim's; if the local arc walk ever disagrees
    // with it the sim wins, so this cannot print `READY 12/10` while someone works out
    // which of the two rules moved — and `NO MOUNTS BEAR` is decided by the guarded
    // number, so the row can never claim nothing bears while it is offering barrels.
    row.capacity = Math.max(slots, row.ready);
    row.bears = row.capacity > 0;
    row.proj = proj;
    row.cooks = proj >= THERMAL.tripAt;
  }

  _drawFlank(P, x, y, w, player, hit) {
    const rows = player ? this._refreshFlank(this.ui.time) : this._flank;
    for (let i = 0; i < rows.length; i++) {
      this._drawFlankRow(P, x, y + i * FLANK_ROW_H, w, rows[i], hit);
    }
  }

  _drawFlankRow(P, x, y, w, row, hit) {
    const by = y + 9;
    if (hit) hit.push({ kind: 'armament:flank', panel: this.id, side: row.side, x, y, w, h: FLANK_ROW_H });

    P.label(row.name, x, by, { color: row.bears ? C.inkDim : C.inkFaint });

    // A flank with nothing on it is SAID, at full ink and struck, never faded away.
    // `theme.js#struck` exists because the old idiom — fade it until it disappears —
    // put `NO MODULE` at 1.38:1 and made a first-hour player's screen unreadable.
    if (row.noFlank) {
      P.struck('NO ENGAGED FLANK — NO TARGET', x + FLANK_LABEL_W, by,
        { font: F.micro, color: C.inkFaint });
      return;
    }
    if (!row.bears && row.n === 0) {
      P.struck('NO MOUNTS BEAR', x + FLANK_LABEL_W, by, { font: F.micro, color: C.inkFaint });
      return;
    }

    // --- the figures, right to left, each dropped if it does not fit ---------
    // Same degradation rule the mount cells use: measure, and drop whole rather than
    // squeeze. A clipped figure is a figure that reads as a different number.
    let right = x + w;
    // The cooldown clock. Neutral ink, not amber: waiting for a battery is an ABSENCE
    // under theme.js's colour contract, and amber is reserved for what is costing the
    // player something this second. (`C.warnLow` is also not on the TEXT_INK whitelist
    // — it is a bar fill — so it could not go under a glyph even if it were right.)
    const clock = row.wait > 0.05 ? `${row.wait.toFixed(1)}S` : '';
    if (clock) {
      P.text(clock, right, by, { font: F.microBold, color: C.inkDim, align: 'right', track: TRACK.label });
      right -= P.measure(clock, F.microBold, TRACK.label) + 10;
    }

    const projStr = row.proj > 0 ? (row.cooks ? 'PROJ COOK' : `PROJ ${row.proj.toFixed(2)}`) : '';
    /**
     * `k/n OUT` ONLY WHILE THE SWEEP IS RUNNING.
     *
     * Measured in the probe: a completed wave keeps its slots on the controller — that
     * is deliberate, and it is why the pip run can go on being the battery's damage
     * report — but keying the FIGURE off `live` meant that from the first salvo onward
     * the row printed the last wave's tally forever and `READY n/m` was never seen
     * again. The pips answer "what did the last one do"; the figure answers "what
     * happens if I press it now", and only during the sweep are those the same question.
     */
    const countStr = row.active
      ? `${row.fired}/${row.n + row.overflow} OUT`
      : `READY ${row.ready}/${row.capacity}`;
    const countW = P.measure(countStr, F.micro, TRACK.label);
    const projW = projStr ? P.measure(projStr, F.micro, TRACK.label) + 10 : 0;

    // The pip run gets whatever the figures leave, and the figures are laid out from
    // the right edge inward, so the run never has to guess where it ends. PROJ is the
    // first thing dropped when the window is narrow: it is the only figure here that is
    // a projection rather than a measurement, and the run and the count are both.
    const pipLeft = x + FLANK_LABEL_W;
    const showProj = projW > 0 && (right - pipLeft - countW - projW - 8) >= PIP_PITCH * 2;
    if (showProj) {
      P.text(projStr, right - countW - 10, by, {
        font: F.micro, color: row.cooks || row.proj > THERMAL.softCap ? C.warn : C.inkDim,
        align: 'right', track: TRACK.label,
      });
    }
    const lane = right - pipLeft - countW - (showProj ? projW : 0) - 8;
    P.text(countStr, right, by, {
      font: F.micro, color: row.ready > 0 || row.active ? C.inkDim : C.inkFaint,
      align: 'right', track: TRACK.label,
    });

    // --- the pips -----------------------------------------------------------
    let room = Math.max(0, Math.floor((lane + PIP_PITCH - PIP_W) / PIP_PITCH));
    const n = row.live ? row.n : Math.min(row.ready, PIP_CAP);
    // The `+n` tail shares this baseline with the figures, so its width comes OUT of
    // the run rather than out of the gap. Four pips is 28 px against 23 px for `+99`.
    if (n > room) room = Math.max(0, room - 4);
    const shown = Math.min(n, room);
    const py = y + 3;
    for (let i = 0; i < shown; i++) {
      const px = pipLeft + i * PIP_PITCH;
      if (row.live) this._pip(P, px, py, row.pips[i]);
      // A preview has no per-slot identity to draw — `salvoPreview` publishes a count
      // and nothing else — so every pip is a round going out, which is exactly what the
      // count means. The moment a wave is armed this row stops guessing.
      else P.fill(px, py, PIP_W, PIP_W, C.ink);
    }
    const over = (row.live ? row.overflow : 0) + (n - shown);
    if (over > 0) {
      P.text(`+${over}`, pipLeft + shown * PIP_PITCH, by,
        { font: F.micro, color: C.inkFaint, track: TRACK.label });
    }
  }

  /** One slot. The vocabulary is written out in this file's header. */
  _pip(P, x, y, pip) {
    if (pip.dead) {
      // A HOLE. No box at all, and the count did not go down — that identity is the
      // feature (`tools/ripple.mjs` check 4: slots 10 -> 10, four of them dead).
      P.rule(x, y + PIP_W * 0.5 - P.hair, PIP_W, P.hair * 2, C.inkFaint);
      return;
    }
    if (pip.state === 'fired') { P.fill(x, y, PIP_W, PIP_W, C.ink); return; }
    if (pip.state === 'dropped') { P.frame(x, y, PIP_W, PIP_W, C.ruleDim); return; }
    // Pending. A frozen ring still fires — down a dead bearing, spending the round and
    // the heat — so it is amber and hollow rather than absent.
    P.frame(x, y, PIP_W, PIP_W, pip.frozen ? C.warnDim : C.ruleBright);
  }

  // =========================================================================
  // Thermal — reference-ui-language.md §5, transcribed
  // =========================================================================

  _drawThermal(P, x, y, w, h, therm, stores) {
    if (!therm) {
      P.label('THERMAL', x, y + 7, { color: C.inkFaint });
      P.text('NO DATA', x, y + 22, { font: F.small, color: C.inkFaint, track: TRACK.label });
      return;
    }

    const over = therm.state === 'OVERHEATED';
    const elevated = therm.state === 'ELEVATED';
    // Escalation by VALUE, not hue: nominal is neutral, elevated is the low amber,
    // overheated is the full one on a filled plate. One colour, three brightnesses.
    const stateCol = over ? C.warn : elevated ? C.warn : C.inkDim;
    const barCol = over ? C.warn : elevated ? C.warnLow : C.inkDim;

    // The large vertical bar sits on the LEFT edge of the column, hard against the
    // panel border, with everything else set beside it. That is the reference's own
    // composition and it is the reason the figures have room: a bar tucked into the
    // right margin leaves every value fighting it for the last thirty pixels.
    const barY = y + 4;
    const barH = h - 20;
    P.vbar(x, barY, 20, barH, therm.peak, {
      color: barCol,
      track: C.track,
      segments: 8,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });
    P.frame(x, barY, 20, barH, C.ruleBright);
    P.label('PEAK', x + 10, y + h - 5, { color: C.inkDim, align: 'center' });

    const tx = x + 30;
    const vx = x + 72;
    const right = x + w;
    P.label('THERMAL', tx, y + 7, { color: C.inkFaint });

    // STATUS <WORD>, on its own line at full column width. The word is the readout;
    // the bar only says how far along it is.
    P.label('STATUS', tx, y + 20, { color: C.inkFaint });
    if (over) {
      // A trip is the one state in this panel allowed to pulse. It costs the player a
      // mount and structural HP on the hardpoint, and it is recoverable — which makes
      // it exactly the case a static readout under-sells.
      const pulse = 0.75 + 0.25 * Math.sin(P.t * 6.0);
      P.ctx.globalAlpha = pulse;
      P.chip(therm.state, tx, y + 24, { fill: C.warn, color: C.void, h: 15, minW: right - tx });
      P.ctx.globalAlpha = 1;
    } else {
      P.text(therm.state, tx, y + 36, { font: F.bodyBold, color: stateCol, track: TRACK.label });
    }

    // EXT, over its ceiling. The reference prints both halves and so do we: a figure
    // with no ceiling beside it is not a measurement.
    P.label('EXT', tx, y + 50, { color: C.inkFaint });
    P.text(`${therm.ext.toFixed(1)} / ${therm.extMax.toFixed(1)}`, vx, y + 50, {
      font: F.small, color: over ? C.warn : C.ink,
    });

    // Signed rate. `0.12/s` in the reference; ours is a percentage of capacity per
    // second, which is the number that says whether you are winning the race.
    const rate = therm.rate * 100;
    const rising = rate > 0.05;
    P.label('RATE', tx, y + 62, { color: C.inkFaint });
    P.text(`${rising ? '+' : rate < -0.05 ? '−' : ' '}${Math.abs(rate).toFixed(1)}%/s`, vx, y + 62, {
      font: F.small, color: rising ? C.warn : C.inkDim,
    });

    // Load is what the reactor is dumping into the hull; radiate is what is left over
    // to shed it. The two bars ARE the power interlock — route to weapons and the top
    // bar grows while the bottom one shrinks.
    P.label('LOAD', tx, y + 74, { color: C.inkFaint });
    P.bar(vx, y + 68, right - vx, 5, therm.load, { color: C.inkDim, track: C.track, segments: 4 });
    P.label('RAD', tx, y + 86, { color: C.inkFaint });
    // THE SHIP-LEVEL PRICE OF A BROADSIDE, drawn with no words at all. For
    // `SALVO_THERMAL.surchargeTime` after a wave is armed, `heat.js` multiplies the
    // radiator budget by `1 - radiatorSurcharge` — so the ghost marker is where the bar
    // WOULD be standing, and the gap between the marker and the fill is what the salvo
    // took. A marker costs no height and no glyph, which is the only reason it fits.
    P.bar(vx, y + 80, right - vx, 5, therm.radiate, {
      color: C.inkDim,
      track: C.track,
      segments: 4,
      ghost: therm.surcharge > 0
        ? Math.min(1, therm.radiate / (1 - SALVO_THERMAL.radiatorSurcharge))
        : null,
      ghostColor: C.warnDim,
    });

    // Coolant purges. Small, finite, and the thing you press when the bar is climbing.
    const coolant = stores ? stores.coolant : therm.coolant;
    const coolantMax = Math.max(1, stores ? stores.coolantMax : therm.coolantMax);
    P.label('PURGE', tx, y + 100, { color: C.inkFaint });
    P.pips(vx, y + 94, coolantMax, coolant, {
      size: 8, gap: 3, color: coolant > 0 ? C.ink : C.inkFaint, empty: C.track,
    });
    if (therm.tripped > 0) {
      // Its own line. Right-aligning it against the purge pips put a five-word figure
      // through a three-pip row, which is how a warning becomes unreadable.
      P.text(`${therm.tripped} MOUNT${therm.tripped > 1 ? 'S' : ''} TRIPPED`, tx, y + 114, {
        font: F.microBold, color: C.warn, track: TRACK.label,
      });
    }
  }

  // =========================================================================
  // Mount cells
  // =========================================================================

  /** Fill the preallocated cell rows from the hull. No allocation. */
  _collect(player) {
    for (const cell of this._cells) {
      cell.hp = player.hardpoints?.get(cell.id) ?? null;
      cell.module = cell.hp?.module?.def ?? null;
      cell.mount = null;
    }
    for (const m of player.weapons) {
      if (!m.hardpoint) continue;
      for (const cell of this._cells) {
        if (cell.id === m.hardpoint && !cell.mount) { cell.mount = m; break; }
      }
    }
  }

  /**
   * Resolve the one state word this mount gets. Order is urgency, and urgency is
   * "how soon does this stop me putting rounds on a target".
   */
  _stateOf(cell, player) {
    const { hp, mount, module } = cell;
    if (hp?.breached) return 'BREACHED';
    if (!module && !mount) return 'EMPTY';
    if (!mount) return 'PASSIVE';
    const parts = mount.parts;
    if (parts?.detached || parts?.wantsDetach) return 'DETACHED';
    if (parts?.inert || mount.condition < CONDITION.inert) return 'INERT';
    if (mount.thermal?.tripped) return 'COOKED';
    if (mount.stall > 0) return 'JAM';
    const blocked = player.stores ? player.stores.blockedReason(mount) : null;
    if (blocked === 'DRY') return 'DRY';
    if (blocked === 'CHARGE') return 'NO CHG';
    if (blocked === 'RELOAD') return 'RELOAD';
    if (!mount.online) return 'OFFLINE';
    if (mount.thermal && mount.thermal.heat > THERMAL.softCap) return 'HOT';

    // COMMANDED STATES. Everything above this line is a fault or a heat warning; these
    // four are what a working gun is doing about the player's orders. They sit below
    // the faults because a cooked mount is not "on cooldown", it is cooked.
    if (mount.charging || mount.charge > 0) return 'CHARGING';
    if (mount.excluded) return 'EXCLUDED';
    const commandable = mount.fireMode !== 'AUTO';
    if (commandable && mount.cooldown > COOLDOWN_FLOOR) return 'COOLDOWN';
    // A SALVO gun that is ready is not READY, it is HOLDING: it will not fire until the
    // player commits, which `salvo.js` enforces by withholding an attached mount from
    // the automatic path entirely. Printing READY on it would describe an AUTO mount.
    if (mount.fireMode === 'SALVO' && this._commanded) return 'HOLD';
    return 'READY';
  }

  _drawCell(P, x, y, w, h, cell, player, stores, hit) {
    const { hp, mount, module } = cell;
    const state = this._stateOf(cell, player);
    const spec = STATE[state] ?? STATE.READY;
    const ink = TONE_INK[spec.tone] ?? C.inkDim;

    P.frame(x, y, w, h, C.rule);

    // Header: which mount, and what archetype sits on it. The archetype is DROPPED,
    // not squeezed, once the cell is too narrow for both — `DORSAL` and `RAIL` are
    // 46 and 30 px against a 66 px cell, and the two printed as `DORSALRAIL`. The
    // mount name is the one that has to survive; the archetype is repeated by the
    // module name on the line below it.
    const typeStr = mount ? String(mount.def.type).toUpperCase() : '';
    const typeW = typeStr ? P.measure(typeStr, F.micro, TRACK.label) : 0;
    const showType = !!typeStr && w >= typeW
      + P.measure(MOUNT_LABEL[cell.id] ?? cell.id, F.micro, TRACK.label) + 16;
    P.label(MOUNT_LABEL[cell.id] ?? cell.id, x + 4, y + 10,
      { color: C.inkDim, maxW: Math.max(12, w - 8 - (showType ? typeW + 6 : 0)) });
    if (showType) {
      P.label(mount.def.type, x + w - 4, y + 10, { color: C.inkFaint, align: 'right' });
    }

    // Faction identity stripe. The one chromatic mark in this panel, spent on the one
    // thing the game is about: where the part came from.
    if (module) {
      const fi = factionInk(module.faction);
      P.fill(x + 4, y + 14, 2, 10, hp?.breached ? C.hostileDim : fi.stripe);
      // The AUTHORED short name. This cell used to print `CONCORD SIE…` and
      // `COALITION R…`, so the player could not tell which lance or which battery
      // they were looking at — in a game about which parts you bolted on.
      P.text(moduleName(module), x + 10, y + 23,
        { font: F.micro, color: hp?.breached ? C.hostileDim : C.ink, track: TRACK.value, maxW: w - 14 });
    } else {
      // Full ink, leading dash, and the NAME OF THE SOCKET rather than a fading
      // `— NO MODULE —` at 1.38:1. An empty mount is information. Clipped to the
      // cell: `STBD SPONSON` used to run out of its own box and into the next one.
      P.struck(P.clip(MOUNT_EMPTY[cell.id] ?? 'EMPTY', F.micro, w - 22), x + 4, y + 23,
        { font: F.micro, color: C.inkFaint });
    }

    // --- the state chip ----------------------------------------------------
    const chipY = y + 28;
    const word = spec.short ?? state;
    if (spec.tone === 'lost' || spec.tone === 'heat') {
      // A filled plate with dark text. Reserved for the two categories that are
      // actually costing the player something this second.
      let label = state;
      if (state === 'COOKED' && mount?.thermal?.tripRemaining > 0) {
        label = `COOKED ${mount.thermal.tripRemaining.toFixed(1)}`;
      }
      const pulse = spec.tone === 'lost' ? 1 : 0.82 + 0.18 * Math.sin(P.t * 6);
      P.ctx.globalAlpha = pulse;
      // Clipped to the cell. `P.chip` sizes itself to `max(minW, measure + pad)`, so
      // `BREACHED` at 69 px grew a 62 px cell's chip past its own border and into the
      // neighbouring mount's `PASSIVE`.
      P.chip(P.clip(label, F.microBold, w - 16, TRACK.label), x + 4, chipY,
        { fill: ink, color: C.void, h: 15, minW: w - 8 });
      P.ctx.globalAlpha = 1;
    } else if (spec.tone === 'heatLow') {
      P.fill(x + 4, chipY, w - 8, 15, C.panel);
      // CHARGING fills its own outline as the lance winds up, the same way RELOAD does
      // below. The wind-up is the number the shot is scaled by — `salvo.js` measured a
      // half-wound lance at 0.6792 of full damage — so a bare word would be throwing
      // away the one quantity the player is deciding about while they hold the key.
      if (state === 'CHARGING' && mount) {
        const k = THREE.MathUtils.clamp(mount.charge ?? 0, 0, 1);
        if (k > 0) P.fill(x + 5, chipY + 1, (w - 10) * k, 13, C.warnGhost);
      }
      P.frame(x + 4, chipY, w - 8, 15, ink);
      P.text(word, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.warn, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'hold') {
      // HOLD / COOLDOWN. An outlined chip with a SOLID LEFT CAP and full ink — present,
      // inert and unmistakably loaded. It must not look like the starved branch below,
      // which is the same outline in dimmer ink: the two mean opposite things, and
      // theme.js's contract is that value and pattern carry that, never hue.
      P.frame(x + 4, chipY, w - 8, 15, C.ruleBright);
      if (state === 'COOLDOWN' && mount) {
        // Fills back up as the gun recovers, so a mount coming back reads as one.
        const total = Math.max(0.001, mount.def.cooldown ?? 1);
        const k = 1 - THREE.MathUtils.clamp(mount.cooldown / total, 0, 1);
        P.fill(x + 5, chipY + 1, (w - 10) * k, 13, C.track);
      } else {
        P.fill(x + 5, chipY + 1, 3, 13, ink);
      }
      P.text(word, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: state === 'HOLD' ? C.ink : C.inkDim,
        align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'out') {
      // EXCLUDED. The player took this gun out of the wave themselves, so the chip is
      // hatched — and hatched through `hatchUnder`, which punches the glyph box back
      // out of the pattern. The sealed-banner defect this file's neighbours spent a
      // wave fixing was a hatch drawn straight over a row of type; a texture may say
      // "inert" and may not make the word it is describing unreadable.
      const exW = P.measure(word, F.microBold, TRACK.label);
      P.hatchUnder(x + 5, chipY + 1, w - 10, 13, C.track,
        [{ x: x + w * 0.5 - exW * 0.5, y: chipY + 2, w: exW, h: 11 }], { spacing: 4, weight: 1 });
      P.frame(x + 4, chipY, w - 8, 15, C.ruleDim);
      P.text(word, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'starved') {
      // An outline and a strike, in neutral ink. RELOAD fills the outline as it
      // feeds, so a mount that is coming back reads as a thing that is coming back.
      P.frame(x + 4, chipY, w - 8, 15, C.ruleBright);
      if (state === 'RELOAD' && mount) {
        const total = mount.def.reload ?? AMMO_SPEC[mount.ammoClass]?.reload ?? 6;
        const k = 1 - THREE.MathUtils.clamp(mount.reloading / Math.max(0.001, total), 0, 1);
        P.fill(x + 5, chipY + 1, (w - 10) * k, 13, C.track);
      }
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else if (spec.tone === 'ok') {
      P.text('READY', x + w * 0.5, chipY + 11, {
        font: F.microBold, color: C.inkDim, align: 'center', track: TRACK.label,
      });
    } else {
      P.text(state, x + w * 0.5, chipY + 11, {
        font: F.micro, color: C.inkFaint, align: 'center', track: TRACK.label,
      });
    }

    if (!mount) {
      // A passive module still has a condition and it still decides what the module
      // grants — `condition.grantMul` scales power output, shields, thrust and cargo.
      if (module && hp) {
        const cond = hp.module?.condition ?? 1;
        P.label('COND', x + 4, y + 60, { color: C.inkFaint });
        P.bar(x + 4, y + 64, w - 8, 7, cond, {
          color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.track,
        });
        const pctW = P.measure('100%', F.micro, TRACK.value) + 6;
        P.text(fmtPct(cond), x + w - 4, y + 84, { font: F.micro, color: C.inkDim, align: 'right' });
        P.label('GRANTS', x + 4, y + 84, { color: C.inkFaint, maxW: Math.max(10, w - 8 - pctW) });
      }
      if (hit) hit.push({ kind: 'armament:mount', panel: this.id, mount: cell.id, x, y, w, h });
      return;
    }

    // --- heat and condition -------------------------------------------------
    // Two labelled bars on their own rows. `H` and `C` beside a bar was a private
    // code; the words fit and they cost nothing.
    const th = mount.thermal;
    const heat = th ? th.heat : 0;
    const barX = x + 32;
    const barW = w - 36;
    P.label('HEAT', x + 4, y + 54, { color: C.inkFaint });
    P.bar(barX, y + 48, barW, 7, heat, {
      color: heat > THERMAL.softCap ? C.warn : C.warnLow,
      track: C.track,
      threshold: THERMAL.softCap,
      thresholdColor: C.warnDim,
    });

    const cond = mount.condition ?? 1;
    P.label('COND', x + 4, y + 66, { color: C.inkFaint });
    P.bar(barX, y + 60, barW, 7, cond, {
      color: cond < CONDITION.worn ? C.warn : C.inkDim, track: C.track,
    });

    // --- stores -------------------------------------------------------------
    // Kinetic mounts print `ready/readyMax` and the magazine behind them; energy
    // mounts print the shared charge buffer. Two currencies, said in two ways, and
    // an empty one is neutral ink and a struck bar rather than an alarm.
    const cls = mount.ammoClass;
    if (cls) {
      const mag = player.stores ? player.stores.rounds(cls) : 0;
      const dry = mag <= 0 && mount.ready <= 0;
      // Two lanes, measured. `6/6` and `MAG 90` were drawn left and right with nothing
      // between them, and at 62 px of cell they met in the middle.
      const magStr = `MAG ${mag}`;
      const magW = P.measure(magStr, F.micro, TRACK.value);
      P.text(`${mount.ready}/${mount.readyMax}`, x + 4, y + 82, {
        font: F.micro, color: dry ? C.inkFaint : C.inkDim, maxW: Math.max(10, w - 12 - magW),
      });
      P.text(magStr, x + w - 4, y + 82, {
        font: F.micro, color: dry ? C.inkFaint : C.inkDim, align: 'right',
      });
      if (dry) P.rule(x + 4, y + 79, w - 8, P.hair, C.inkFaint);
    } else {
      const chg = stores ? stores.charge / Math.max(1, stores.chargeMax) : 0;
      P.label('CHG', x + 4, y + 82, { color: C.inkFaint });
      P.bar(x + 32, y + 76, w - 36, 7, chg, {
        color: C.inkDim, track: C.track, struck: chg < 0.02,
      });
    }

    // --- persistent structural states ---------------------------------------
    // These survive underneath whatever the loud chip says. A frozen traverse ring is
    // permanent until it is repaired and it changes how the ship must be flown, so it
    // may not be hidden by a transient RELOAD.
    let sx = x + 4;
    if (mount.parts?.traverseFrozen) {
      sx = P.chipOutline('FROZEN', sx, y + 88, { color: C.inkDim, border: C.ruleBright, h: 13, padX: 3 }) + 2;
    }
    if (cond < CONDITION.worn && cond >= CONDITION.inert) {
      sx = P.chipOutline('WORN', sx, y + 88, { color: C.inkDim, border: C.ruleBright, h: 13, padX: 3 }) + 2;
    }
    if (th && th.trips > 0 && sx < x + w - 20) {
      sx = P.chipOutline(`×${th.trips}`, sx, y + 88, { color: C.warn, border: C.warnDim, h: 13, padX: 3 }) + 2;
    }

    /**
     * THE FIRE-MODE CHIP — which key, if any, fires this gun.
     *
     * It comes LAST on this row, after the structural chips, and it is drawn only if it
     * still fits. That order is this file's existing rule and it is the right one: a
     * frozen ring is permanent and changes how the ship must be flown, while the mode is
     * recoverable in one keystroke — and on the cell where the mode is squeezed out, the
     * state chip has already said HOLD or WIND or OUT, which is the same answer.
     *
     * MEASURED, so the fit rule is not a guess. The chip lane between this row's
     * margins is 57 px at 1280x720, 65 at 1600x900 and 60 at 1920x1080. `SALVO` is
     * 38.10 px of glyph and `CHARGE`/`LOCKED` are 45.72, so at `padX: 2` every mode
     * word fits at every gate viewport with the row otherwise empty — which is the
     * common case, because the structural chips only appear on a hurt mount. With a
     * `FROZEN` chip already on the row (45.72 + 6 + 2 = 53.7 px) nothing else fits at
     * any of the three, and the mode is the thing that yields. That is the intended
     * order and it is why this is a measured test rather than a fixed offset.
     *
     * LOCKED is point defence and only point defence — see MODE_LABEL.
     */
    const modeStr = mount.def.type === 'pd' ? 'LOCKED' : (MODE_LABEL[mount.fireMode] ?? mount.fireMode);
    const modeW = P.measure(modeStr, F.microBold, TRACK.label) + 4;
    if (sx + modeW <= x + w - 4) {
      P.chipOutline(modeStr, sx, y + 88, {
        // Neutral, always: the mode is a setting, not a cost. Amber in this panel means
        // "this is burning you right now" and a gun sitting in SALVO is not.
        color: mount.fireMode === 'AUTO' ? C.inkFaint : C.inkDim,
        border: C.ruleDim, h: 13, padX: 2,
      });
    }

    // --- sub-parts ----------------------------------------------------------
    // One square per part, in the layout's own order, carrying its kind letter. A
    // destroyed part is hatched and struck; a damaged one is partly filled from the
    // bottom. This is the readout the second-tier aim ring aims INTO.
    const parts = mount.parts?.list ?? [];
    const n = parts.length;
    if (n > 0) {
      const sq = Math.min(16, Math.floor((w - 8) / n) - 2);
      let px2 = x + 4;
      for (const part of parts) {
        const py2 = y + h - sq - 5;
        // The square fills from the bottom with the part's remaining health, so a
        // half-shot feed reads as half a square. A healthy part is a SOLID block —
        // a near-black fill made every live part look like an empty slot.
        P.fill(px2, py2, sq, sq, C.track);
        if (!part.destroyed && part.health > 0) {
          P.fill(px2, py2 + sq * (1 - part.health), sq, sq * part.health,
            part.health < 0.5 ? C.warn : C.inkDim);
        }
        P.frame(px2, py2, sq, sq, part.destroyed ? C.hostile : C.ruleBright);
        if (part.destroyed) {
          // Hatch first, glyph second: the letter is never crossed by the pattern.
          P.hatch(px2 + 1, py2 + 1, sq - 2, sq - 2, C.hostileDim, { spacing: 4, weight: 1 });
        }
        P.text(PART_LETTER[part.kind] ?? '?', px2 + sq * 0.5, py2 + sq - 4, {
          font: F.microBold,
          color: part.destroyed ? C.hostile : part.health > 0.4 ? C.void : C.ink,
          align: 'center', track: TRACK.none, onFill: !part.destroyed && part.health > 0.4,
        });
        if (hit) {
          hit.push({
            kind: 'armament:part', panel: this.id, mount: cell.id, partId: part.id,
            x: px2, y: py2, w: sq, h: sq,
          });
        }
        px2 += sq + 2;
      }
    }

    if (hit) {
      hit.push({ kind: 'armament:mount', panel: this.id, mount: cell.id, x, y, w, h });
    }
  }

  // =========================================================================
  // Device hotbar
  // =========================================================================

  _devicesFor(now) {
    // `canUse` allocates a result object per call and `describeHotbar` allocates a row
    // per item; neither belongs on a 60 Hz path. Five per second is well inside human
    // reaction time for a readout whose contents change on pickup and on use.
    if (now - this._devicesAt < 0.2 && this._devices.length) return this._devices;
    this._devicesAt = now;
    const items = this.world.systems?.items;
    const hold = this.world.systems?.cargo;
    const rows = this._devices;
    rows.length = 0;
    const defs = allItems();
    for (let i = 0; i < defs.length && i < HOTBAR_KEYS.length; i++) {
      const def = defs[i];
      const count = hold?.itemCount(def.id) ?? 0;
      let active = false;
      if (items) {
        for (const e of items.active) if (e.itemId === def.id) { active = true; break; }
      }
      let remaining = 0;
      if (active && items) {
        for (const e of items.active) if (e.itemId === def.id) remaining = Math.max(remaining, e.remaining);
      }
      const check = items ? items.canUse(def.id) : { ok: false, reason: 'no system' };
      rows.push({
        id: def.id, name: def.name, kind: def.kind, count, active, remaining,
        ready: check.ok, reason: check.ok ? null : check.reason, volume: def.volume,
      });
    }
    return rows;
  }

  _drawHotbar(P, x, y, w, h, hit) {
    P.label('DEVICES', x, y + 9, { color: C.inkDim });
    P.label('PRESS 4-8', x, y + 23, { color: C.inkFaint });
    const rows = this._devicesFor(this.ui.time);
    if (!rows.length) {
      P.struck('NONE REGISTERED', x + 70, y + 9, { font: F.micro, color: C.inkFaint });
      return;
    }
    const slotW = Math.floor((w - 70) / rows.length);
    let sx = x + 70;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const usable = r.ready;
      const sy = y;
      const sh = h - 4;

      // The plate first, then the hatch, then the type. The hatch used to be drawn
      // OVER the finished slot, so `NONE CARRIED` — the one line telling the player
      // why the device will not fire — was struck through by it.
      P.fill(sx, sy, slotW - 4, sh, C.panel);
      if (!usable && !r.active) P.hatch(sx, sy, slotW - 4, sh, C.track, { spacing: 6, weight: 1 });
      if (r.active) {
        P.fill(sx, sy, slotW - 4, sh, C.warnGhost);
        P.frame(sx, sy, slotW - 4, sh, C.warn);
      } else {
        P.frame(sx, sy, slotW - 4, sh, usable ? C.ruleBright : C.rule);
      }

      // The key cap, drawn as a chip so it reads as a thing you press. The reference
      // does exactly this: `E Open Cargo`, keycap first.
      P.chip(HOTBAR_KEYS[i], sx + 3, sy + 3, {
        fill: usable ? C.ink : C.inkFaint, color: C.void, h: 11, padX: 4, font: F.micro,
      });

      // The AUTHORED short name — `COOLANT`, `BOARD CHG` — not `COOLANT PU…`. Clipped
      // to the lane the count leaves: at five slots on a narrowed panel `SURVEY PULSE`
      // ran through its own `×0` and into the next slot's name.
      const cntW = P.measure('×88', F.microBold, TRACK.value) + 8;
      P.text(itemName(r.id), sx + 22, sy + 12, {
        font: F.micro, color: usable ? C.ink : C.inkDim, track: TRACK.label,
        maxW: Math.max(16, slotW - 32 - cntW),
      });

      P.text(`×${r.count}`, sx + slotW - 10, sy + 12, {
        font: F.microBold, color: r.count > 0 ? C.ink : C.inkFaint, align: 'right',
      });

      const sub = r.active ? `RUNNING ${r.remaining.toFixed(1)}s`
        : usable ? `${r.volume} m3 EACH` : (r.reason ?? '').toUpperCase();
      // On a strip of plate of its own so the hatch behind the slot cannot cross it.
      const subW = P.measure(sub, F.micro, TRACK.label);
      if (!usable && !r.active) P.fill(sx + 3, sy + sh - 13, Math.min(slotW - 8, subW + 4), 12, C.panel);
      P.text(sub, sx + 5, sy + sh - 4, {
        font: F.micro, color: r.active ? C.warn : usable ? C.inkFaint : C.inkDim, track: TRACK.label, maxW: slotW - 12 });

      if (hit) {
        hit.push({ kind: 'armament:device', panel: this.id, itemId: r.id, x: sx, y: sy, w: slotW - 4, h: sh });
      }
      sx += slotW;
    }
  }

  // =========================================================================

  onClick(region) {
    if (region.kind === 'armament:device') {
      this.ui.useDevice(region.itemId);
      return true;
    }
    if (region.kind === 'armament:flank') {
      // THE PIP LEGEND, ON DEMAND rather than printed as a permanent row of type. The
      // panel already teaches its sub-part letters this way and the owner's standing
      // note is that this interface is too dense, so a vocabulary that costs nothing
      // until it is asked for is the version that gets to exist.
      const row = this._flank.find((r) => r.side === region.side);
      if (!row) return false;
      if (row.noFlank) {
        this.ui.orderBar.say('NO ENGAGED FLANK — SELECT A TARGET AND THE BATTERY PICKS ITS SIDE', 'info');
      } else if (!row.bears && row.n === 0) {
        this.ui.orderBar.say(`${row.name} — NO MOUNTS BEAR`, 'error');
      } else if (row.live) {
        const total = row.n + row.overflow;
        this.ui.orderBar.say(
          `${row.name} — ${total} SLOT${total === 1 ? '' : 'S'} · ${row.fired} OUT · ${row.dropped} DROPPED`
          + ` · ${row.dead} DEAD BARREL${row.dead === 1 ? '' : 'S'} · ${row.frozen} FROZEN`,
          row.dead + row.frozen > 0 ? 'error' : 'info',
        );
      } else {
        this.ui.orderBar.say(
          `${row.name} — ${row.ready} OF ${row.capacity} BARRELS READY ACROSS ${row.guns} GUN${row.guns === 1 ? '' : 'S'}`
          + (row.wait > 0.05 ? ` · ${row.wait.toFixed(1)}S` : ''),
          row.ready > 0 ? 'info' : 'error',
        );
      }
      return true;
    }
    if (region.kind === 'armament:mount' || region.kind === 'armament:part') {
      const label = MOUNT_LABEL[region.mount] ?? region.mount;
      const player = this.world.player;
      const mount = player?.weapons?.find((m) => m.hardpoint === region.mount) ?? null;
      if (region.partId && mount) {
        const part = mount.parts?.get(region.partId);
        if (part) {
          this.ui.orderBar.say(
            `${label} · ${part.label} — ${part.destroyed ? 'DESTROYED' : `${fmtPct(part.health)} INTACT`}`,
            part.destroyed ? 'error' : 'info',
          );
          return true;
        }
      }
      const state = this._stateOf(this._cells.find((c) => c.id === region.mount) ?? {}, player);
      const spec = STATE[state] ?? STATE.READY;
      // `'alarm'` is not a tone this ladder has ever emitted — TONE_INK has never
      // carried the key — so every click on a BREACHED or COOKED mount reported itself
      // as `info`. The severe tones are the two that get a filled plate.
      this.ui.orderBar.say(`${label} — ${state}${spec.note ? ` · ${spec.note}` : ''}`,
        spec.tone === 'lost' || spec.tone === 'heat' ? 'error' : 'info');
      return true;
    }
    return false;
  }

  /** Keyboard activation, wired from `UILayer`. Works whether the panel is open or not. */
  static keyIndex(code) {
    return HOTBAR_CODES.indexOf(code);
  }

  deviceIdAt(index) {
    const rows = this._devicesFor(this.ui.time);
    return rows[index]?.id ?? null;
  }
}

