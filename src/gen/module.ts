/**
 * The module catalogue: 24 modules across six hardpoints and three tiers.
 *
 * Modules are built from seven shape archetypes rather than drawn one at a
 * time, so a faction's visual identity is a palette lock plus an archetype
 * choice rather than 24 hand-authored sprites per faction. Six of the seven
 * (`barrel`, `boom`, `block`, `pod`, `nozzle`, `array`) are pure one-line
 * half-width rules over the module's reach. The seventh, `dock`, is a
 * one-off for `hangar-deck` alone — the spec calls the hangar deck the
 * structural pivot of the whole game, and a plain filled shape read as a
 * disc rather than as hardware, so it gets a launch slot and a deck line
 * carved in as a small post-process rather than trying to force that read
 * out of a single half-width formula.
 *
 * The anchor is the pixel that lands on the hull's hardpoint. Everything else
 * extends *outward* from it, which is the property that makes an installed
 * module change the ship's outline. A module drawn inboard of its anchor would
 * be swallowed by the hull and invisible in silhouette, and an invisible upgrade
 * is the one failure the whole salvage loop cannot survive.
 */

import type { Rng } from '../sim/rng.js';
import {
  createBuf, EMPTY, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import {
  EMISSIVE, FACTION_PALETTE, rampOf, shadeStep, type FactionId,
} from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import {
  clearDitherPlan, createDitherPlan, ditherMask, setDitherPlan, type DitherPlan,
} from './grammar/plates.js';
import type { HardpointId } from './hull.js';

export type ModuleArchetype = 'barrel' | 'boom' | 'block' | 'pod' | 'nozzle' | 'array' | 'dock';

export type ModuleId =
  | 'siege-lance' | 'breaching-prow' | 'mining-array' | 'ram-spike'
  | 'rail-battery' | 'sensor-mast' | 'missile-cells' | 'spinal-coil'
  | 'salvage-tractor' | 'cargo-expansion' | 'hangar-deck' | 'repair-bay'
  | 'cannon-bank' | 'beam-array' | 'flak-cluster' | 'torpedo-rack'
  | 'cannon-bank-sb' | 'beam-array-sb' | 'flak-cluster-sb' | 'torpedo-rack-sb'
  | 'thruster-uprate' | 'reactor-uprate' | 'jump-drive' | 'vector-nozzles';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  hardpoint: HardpointId;
  archetype: ModuleArchetype;
  tier: 1 | 2 | 3;
  /** Sprite extent along the hull axis. */
  length: number;
  /** Sprite extent across the hull axis. */
  width: number;
}

export const MODULE_CATALOGUE: readonly ModuleDef[] = [
  // Bow — forward weapons, ramming, cutting
  { id: 'ram-spike',       name: 'RAM SPIKE',       hardpoint: 'bow',        archetype: 'boom',   tier: 1, length: 20, width: 8 },
  { id: 'mining-array',    name: 'MINING ARRAY',    hardpoint: 'bow',        archetype: 'array',  tier: 1, length: 18, width: 16 },
  { id: 'breaching-prow',  name: 'BREACHING PROW',  hardpoint: 'bow',        archetype: 'block',  tier: 2, length: 22, width: 18 },
  { id: 'siege-lance',     name: 'SIEGE LANCE',     hardpoint: 'bow',        archetype: 'boom',   tier: 3, length: 40, width: 12 },

  // Dorsal spine — heavy weapons, sensors.
  //
  // Dorsal mounts near HARDPOINT_AT.dorsal in hull.ts (t=0.30). The player
  // hull is pinched there deliberately (see the PLAYER_HULL control polygon
  // in grammar/profile.ts) so it is no longer the hull that sets this width:
  // a beamy coalition capital hull is now the binding case, reaching a local
  // half-width around 25px at that station. `width` is the reach for a
  // lateral module (see `buildModule`), so these stay just wide enough to
  // clear the widest hull at that station with margin to spare, not wide
  // enough to swallow the player hull whole the way the old flat-plateau
  // profile forced them to be.
  { id: 'sensor-mast',     name: 'SENSOR MAST',     hardpoint: 'dorsal',     archetype: 'boom',   tier: 1, length: 16, width: 32 },
  { id: 'missile-cells',   name: 'MISSILE CELLS',   hardpoint: 'dorsal',     archetype: 'pod',    tier: 2, length: 18, width: 30 },
  { id: 'rail-battery',    name: 'RAIL BATTERY',    hardpoint: 'dorsal',     archetype: 'barrel', tier: 2, length: 20, width: 32 },
  { id: 'spinal-coil',     name: 'SPINAL COIL',     hardpoint: 'dorsal',     archetype: 'boom',   tier: 3, length: 18, width: 36 },

  // Ventral bay — utility, capacity.
  //
  // Same reach reasoning as dorsal, and the same relief: HARDPOINT_AT.ventral
  // (t=0.66) sits on the player hull just aft of the waist pinch, where the
  // hull is still climbing back out toward the engine block rather than at
  // its widest, so the coalition capital hull is again the binding case
  // rather than player. hangar-deck keeps its long footprint (length=38) so
  // it stays the largest ventral module by a wide margin even at a narrower
  // width than before.
  { id: 'salvage-tractor', name: 'SALVAGE TRACTOR', hardpoint: 'ventral',    archetype: 'array',  tier: 1, length: 16, width: 34 },
  { id: 'cargo-expansion', name: 'CARGO EXPANSION', hardpoint: 'ventral',    archetype: 'block',  tier: 2, length: 20, width: 34 },
  { id: 'repair-bay',      name: 'REPAIR BAY',      hardpoint: 'ventral',    archetype: 'block',  tier: 2, length: 18, width: 34 },
  { id: 'hangar-deck',     name: 'HANGAR DECK',     hardpoint: 'ventral',    archetype: 'dock',   tier: 3, length: 38, width: 36 },

  // Port sponson — broadside
  { id: 'flak-cluster',    name: 'FLAK CLUSTER',    hardpoint: 'port',       archetype: 'pod',    tier: 1, length: 16, width: 16 },
  { id: 'cannon-bank',     name: 'CANNON BANK',     hardpoint: 'port',       archetype: 'barrel', tier: 2, length: 22, width: 20 },
  { id: 'beam-array',      name: 'BEAM ARRAY',      hardpoint: 'port',       archetype: 'array',  tier: 2, length: 24, width: 18 },
  { id: 'torpedo-rack',    name: 'TORPEDO RACK',    hardpoint: 'port',       archetype: 'pod',    tier: 3, length: 30, width: 26 },

  // Starboard sponson — mirrors port, upgraded independently
  { id: 'flak-cluster-sb', name: 'FLAK CLUSTER',    hardpoint: 'starboard',  archetype: 'pod',    tier: 1, length: 16, width: 16 },
  { id: 'cannon-bank-sb',  name: 'CANNON BANK',     hardpoint: 'starboard',  archetype: 'barrel', tier: 2, length: 22, width: 20 },
  { id: 'beam-array-sb',   name: 'BEAM ARRAY',      hardpoint: 'starboard',  archetype: 'array',  tier: 2, length: 24, width: 18 },
  { id: 'torpedo-rack-sb', name: 'TORPEDO RACK',    hardpoint: 'starboard',  archetype: 'pod',    tier: 3, length: 30, width: 26 },

  // Engine block — mobility, power
  { id: 'vector-nozzles',  name: 'VECTOR NOZZLES',  hardpoint: 'engine',     archetype: 'nozzle', tier: 1, length: 16, width: 20 },
  { id: 'thruster-uprate', name: 'THRUSTER UPRATE', hardpoint: 'engine',     archetype: 'nozzle', tier: 2, length: 22, width: 26 },
  { id: 'reactor-uprate',  name: 'REACTOR UPRATE',  hardpoint: 'engine',     archetype: 'block',  tier: 2, length: 20, width: 24 },
  { id: 'jump-drive',      name: 'JUMP DRIVE',      hardpoint: 'engine',     archetype: 'pod',    tier: 3, length: 28, width: 32 },
];

export function modulesFor(hardpoint: HardpointId): readonly ModuleDef[] {
  return MODULE_CATALOGUE.filter((m) => m.hardpoint === hardpoint);
}

export interface ModuleSprite {
  def: ModuleDef;
  buf: PixBuf;
  /** The pixel that lands on the hull's hardpoint. */
  anchorX: number;
  anchorY: number;
  faction: FactionId;
  /** Which pixels of `buf` were resolved by the interior dither, and how. */
  plan: DitherPlan;
}

/** Emissive accent each faction lights its modules with. */
const ACCENT: Readonly<Record<FactionId, number>> = {
  concord: EMISSIVE.cyan,
  coalition: EMISSIVE.orange,
  derelict: EMISSIVE.green,
  player: EMISSIVE.amber,
};

/**
 * Archetype silhouettes, drawn in a local frame where +y is outward from the
 * hull. `outward(t)` gives the half-width at each step along the module's reach,
 * so an archetype is a one-line shape rule rather than a bitmap.
 */
const SHAPE: Readonly<Record<ModuleArchetype, (t: number) => number>> = {
  // A gun barrel: broad breech, narrow muzzle. `paintBarrelLanes` below cuts
  // this wedge into 2-3 separate barrels — the wedge alone was reading as a
  // solid pennant, not a bank of guns.
  barrel: (t) => 1 - 0.62 * t,
  // A mast or lance: a flared mount collar at the hull, a near-constant
  // shaft, then a taper to a point at the tip. The old version held 0.4 —
  // "near-constant" — for the whole run apart from a taper in the last 18%;
  // on a 12px-wide module (siege-lance) that rounds to a 3px hairline, which
  // is what read as an antenna rather than a weapon. BASE now carries enough
  // mass on its own, and the mount flare gives the breech end extra bulk on
  // top of that so the shape reads as "gun", not "mast", while still tapering
  // to a point at the working end the way a lance or sensor mast should.
  boom: (t) => {
    const BASE = 0.5;
    const FLARE = 0.3;
    const MOUNT = 0.16;
    const TIP = 0.18;
    if (t > 1 - TIP) return BASE * (1 - (t - (1 - TIP)) / TIP);
    if (t < MOUNT) return BASE + FLARE * (1 - t / MOUNT);
    return BASE;
  },
  // A bolted-on box: square, full width the whole way.
  block: () => 1,
  // An ordnance rack: a flat-topped hexagon — chamfered shoulders at the
  // mount and the muzzle, full width for the run between. The previous shape
  // was a smooth lens (0.55 + 0.45*sin(pi*t)), and a pair of those mounted
  // port and starboard read as matched round discs — porthole or coin
  // shapes, "Mickey-Mouse-adjacent", per review — even after `paintPodBands`
  // below rings the bulge with dark seams; a round outline reads round no
  // matter what is painted inside it. Ordnance needs corners: chamfered
  // shoulders, not a curve, so the silhouette itself reads as a canister of
  // launch cells rather than a ball.
  pod: (t) => {
    const CHAMFER = 0.22;
    const SHOULDER = 0.58;
    if (t < CHAMFER) return SHOULDER + (1 - SHOULDER) * (t / CHAMFER);
    if (t > 1 - CHAMFER) return SHOULDER + (1 - SHOULDER) * ((1 - t) / CHAMFER);
    return 1;
  },
  // An exhaust bell: narrow throat flaring to a wide mouth.
  nozzle: (t) => 0.45 + 0.55 * t,
  // A flat panel bank: full width, squared off, shallow.
  array: (t) => (t > 0.9 ? 0.8 : 1),
  // A flight deck: full width, same as `block`. `paintFlightDeck` below is
  // what actually makes this a dock rather than a crate — it carves the
  // launch slot and paints the deck line as a post-process, because neither
  // an opening nor a runway stripe is expressible as a single half-width
  // value per row.
  dock: () => 1,
};

/** Maps a module-local (reach, span) pair to buffer (x, y), honouring flip/lateral. */
interface Frame {
  reach: number;
  span: number;
  lateral: boolean;
  flip: boolean;
  toXY(r: number, s: number): readonly [number, number];
}

function makeFrame(reach: number, span: number, lateral: boolean, flip: boolean): Frame {
  return {
    reach,
    span,
    lateral,
    flip,
    toXY(r, s) {
      const rr = flip ? reach - 1 - r : r;
      return lateral ? [rr, s] : [s, rr];
    },
  };
}

/**
 * Cuts a solid barrel wedge into 2-3 separate barrels: a dark seam running
 * the length of the reach at each lane boundary, plus one muzzle accent per
 * lane instead of one centred accent. Without this a cannon bank is just a
 * tapered triangle — correct in outline, but a solid wedge of one colour
 * reads as a pennant, not "a bank of guns cut off a wreck".
 */
function paintBarrelLanes(
  buf: PixBuf, plan: DitherPlan, ramp: readonly Rgba[],
  accent: number, frame: Frame, shape: (t: number) => number,
): void {
  const { reach, span } = frame;
  const lanes = span >= 15 ? 3 : 2;
  const seam = shadeStep(ramp, 0);

  const dividers: number[] = [];
  for (let i = 1; i < lanes; i++) dividers.push(Math.round((span * i) / lanes));

  for (let r = 0; r < reach; r++) {
    for (const d of dividers) {
      const [x, y] = frame.toXY(r, d);
      if (!isOpaque(getPx(buf, x, y))) continue;
      setPx(buf, x, y, seam);
      clearDitherPlan(plan, x, y);
    }
  }

  // One muzzle accent per lane, positioned proportionally within whatever
  // the wedge's actual half-width is at that row — a fixed absolute offset
  // would fall outside the silhouette once the wedge has tapered this far.
  const tipT = 0.88;
  const r = Math.round((reach - 1) * tipT);
  const localHalf = Math.max(1, Math.round((shape(tipT) * span) / 2) - 1);
  const centre = Math.floor(span / 2);
  for (let i = 0; i < lanes; i++) {
    const frac = (i + 0.5) / lanes;
    const s = centre - localHalf + Math.round(frac * 2 * localHalf);
    const [x, y] = frame.toXY(r, s);
    if (!isOpaque(getPx(buf, x, y))) continue;
    setPx(buf, x, y, accent);
    clearDitherPlan(plan, x, y);
  }
}

/**
 * Rings a pod with two dark seams, splitting the smooth bulge into three
 * segments, and punches three dark tube-mouth pits into its outward face —
 * a canister of launch tubes with joints, not a plain ball. `torpedo-rack`
 * mounted port and starboard was the case this fixes: two identical,
 * featureless circles flanking the hull read as a cartoon animal's ears, not
 * hardware. The tube mouths are unlit (dark bore holes), unlike the emissive
 * accent every other archetype gets, since a torpedo tube reads as a hole cut
 * into the hull, not a light.
 */
function paintPodBands(
  buf: PixBuf, plan: DitherPlan, ramp: readonly Rgba[],
  frame: Frame, shape: (t: number) => number,
): void {
  const { reach, span } = frame;
  const dark = shadeStep(ramp, 1);
  const bore = shadeStep(ramp, 0);
  const centre = Math.floor(span / 2);

  for (const t of [0.35, 0.65]) {
    const r = Math.round((reach - 1) * t);
    const half = Math.max(0, Math.round((shape(t) * span) / 2) - 1);
    for (let s = centre - half; s <= centre + half; s++) {
      const [x, y] = frame.toXY(r, s);
      if (!isOpaque(getPx(buf, x, y))) continue;
      setPx(buf, x, y, dark);
      clearDitherPlan(plan, x, y);
    }
  }

  const tipT = 0.82;
  const r = Math.round((reach - 1) * tipT);
  const localHalf = Math.max(1, Math.round((shape(tipT) * span) / 2) - 1);
  const lanes = 3;
  for (let i = 0; i < lanes; i++) {
    const frac = (i + 0.5) / lanes;
    const s = centre - localHalf + Math.round(frac * 2 * localHalf);
    const [x, y] = frame.toXY(r, s);
    if (!isOpaque(getPx(buf, x, y))) continue;
    setPx(buf, x, y, bore);
    clearDitherPlan(plan, x, y);
  }
}

/**
 * Carves a launch slot into the outward tip of a `dock` block and paints a
 * bright deck line down the middle of the run leading to it, then places twin
 * "approach light" accents flanking the slot's mouth instead of the one
 * accent every other archetype gets centred on the tip (which would land
 * inside the slot's opening and read as a stray floating pixel).
 *
 * Returns the accent positions actually painted, so the caller can skip the
 * generic single-accent placement for this archetype.
 */
function paintFlightDeck(
  buf: PixBuf, plan: DitherPlan, ramp: readonly Rgba[],
  accent: number, frame: Frame,
): void {
  const { reach, span } = frame;
  const centre = Math.floor(span / 2);
  const notchStart = Math.round(reach * 0.68);
  const baseSlotHalf = Math.max(2, Math.round(span * 0.14));
  const runwayBright = shadeStep(ramp, 6);

  // Deck line: a bright centreline stripe from the hull mount up to where the
  // slot opens, reading as a runway leading out to the bay mouth.
  for (let r = 0; r < notchStart; r++) {
    const [x, y] = frame.toXY(r, centre);
    if (!isOpaque(getPx(buf, x, y))) continue;
    setPx(buf, x, y, runwayBright);
    clearDitherPlan(plan, x, y);
  }

  // Launch slot: an open channel down the centre of the outward tip, flaring
  // wider as it nears the mouth — the opening a strike craft would leave
  // through, flanked by two solid rails.
  let slotHalfAtTip = baseSlotHalf;
  for (let r = notchStart; r < reach; r++) {
    const frac = reach - 1 > notchStart ? (r - notchStart) / (reach - 1 - notchStart) : 1;
    const slotHalf = Math.round(baseSlotHalf + frac * baseSlotHalf * 0.8);
    slotHalfAtTip = slotHalf;
    for (let s = centre - slotHalf; s <= centre + slotHalf; s++) {
      const [x, y] = frame.toXY(r, s);
      if (!isOpaque(getPx(buf, x, y))) continue;
      setPx(buf, x, y, EMPTY);
      clearDitherPlan(plan, x, y);
    }
  }

  // Twin approach lights, just outside the slot mouth on each rail's inner edge.
  const tipR = reach - 1;
  for (const s of [centre - slotHalfAtTip - 1, centre + slotHalfAtTip + 1]) {
    const [x, y] = frame.toXY(tipR, s);
    if (!isOpaque(getPx(buf, x, y))) continue;
    setPx(buf, x, y, accent);
    clearDitherPlan(plan, x, y);
  }
}

/**
 * The default single emissive accent at the working end — a muzzle, a lens,
 * an exhaust — so the module reads as powered and gives bloom something to
 * key on. Used by every archetype that doesn't paint its own accents.
 */
function paintCentreAccent(buf: PixBuf, plan: DitherPlan, accent: number, frame: Frame): void {
  const tipT = 0.86;
  const r = Math.round((frame.reach - 1) * tipT);
  const centre = Math.floor(frame.span / 2);
  const [x, y] = frame.toXY(r, centre);
  setPx(buf, x, y, accent);
  clearDitherPlan(plan, x, y);
}

// The archetype grammar makes every module deterministic from its definition
// and faction alone, so this build takes no randomness — the parameter stays
// only to keep the signature `buildModule(def, faction, rng)` the catalogue's
// callers (and the determinism test) rely on.
export function buildModule(def: ModuleDef, faction: FactionId, _rng: Rng): ModuleSprite {
  const buf = createBuf(def.width, def.length);
  const plan = createDitherPlan(buf.w, buf.h);
  const ramp = rampOf(faction);
  const accent = ACCENT[faction];

  // Local frame: the module reaches along `reach` and spans `span`.
  //
  // Bow and engine sit at the hull's actual fore/aft extremities, so reaching
  // further along the hull axis (vertical here) is what pokes past the hull's
  // own silhouette there. Port, starboard, dorsal, and ventral all mount on or
  // near the centreline instead — nothing in the hull profile stops short of
  // them lengthwise, so only reaching *across* the hull axis (horizontal) can
  // change the outline at that row. That is why dorsal/ventral share the same
  // horizontal-reach frame as the sponsons rather than bow/engine's vertical one.
  const lateral =
    def.hardpoint === 'port' || def.hardpoint === 'starboard' ||
    def.hardpoint === 'dorsal' || def.hardpoint === 'ventral';
  const reach = lateral ? def.width : def.length;
  const span = lateral ? def.length : def.width;
  const shape = SHAPE[def.archetype];

  // Reverse the reach for hardpoints whose outward direction runs toward
  // decreasing coordinates, so `t = 0` is always the end that touches the hull.
  //
  // Dorsal and ventral are both centreline hardpoints — the hull is wide
  // enough there (up to H=25px on a player capital, see composite.test.ts)
  // that straddling the spine would need up to 66px of reach, well past the
  // 16-48px band the art direction sets for module detail density. So they
  // stay edge-anchored like the sponsons and lean to one side instead. Left
  // unflipped, both would reach toward increasing x (starboard) — the same
  // direction as the starboard sponson itself — making dorsal read as a
  // starboard sponson at a different station. Flipping dorsal only makes it
  // lean to port (decreasing x, the same direction `port` reaches) while
  // ventral leans to starboard, so the two centreline stations — and the two
  // sponsons — are each visually distinct from one another.
  const flip = def.hardpoint === 'port' || def.hardpoint === 'bow' || def.hardpoint === 'dorsal';

  for (let r = 0; r < reach; r++) {
    const t = reach === 1 ? 0 : r / (reach - 1);
    const halfSpan = Math.max(0, Math.round((shape(t) * span) / 2) - 1);
    if (halfSpan < 0) continue;

    const centre = Math.floor(span / 2);
    for (let s = centre - halfSpan; s <= centre + halfSpan; s++) {
      const rr = flip ? reach - 1 - r : r;
      const x = lateral ? rr : s;
      const y = lateral ? s : rr;

      // Shade from the top-left, matching the hull's baked light.
      const onLitEdge = s === centre - halfSpan || (!lateral && r === 0);
      const onShadowEdge = s === centre + halfSpan || (!lateral && r === reach - 1);

      let step = 3;
      if (onLitEdge && !onShadowEdge) {
        step += 2;
      } else if (onShadowEdge && !onLitEdge) {
        step -= 2;
      } else {
        // Interior plate: same dither-between-two-steps treatment as the
        // hull, and recorded in the plan before the mask is applied so the
        // rotation baker can re-evaluate it in the destination frame.
        setDitherPlan(plan, x, y, ramp, step);
        if (ditherMask(x, y)) step += 1;
      }

      setPx(buf, x, y, shadeStep(ramp, step));
    }
  }

  // Archetype-specific structure on top of the base silhouette: lanes and
  // muzzles for a barrel, segment rings for a pod, a launch slot and deck
  // line for a dock. These read from the silhouette that has already landed
  // in `buf`, so they only recolour or clear pixels the fill loop above
  // already painted — never touch anything outside it.
  const frame = makeFrame(reach, span, lateral, flip);

  if (def.archetype === 'barrel') {
    // Multiple muzzle accents, one per lane — replaces the single centred
    // accent every other archetype gets.
    paintBarrelLanes(buf, plan, ramp, accent, frame, shape);
  } else if (def.archetype === 'pod') {
    paintPodBands(buf, plan, ramp, frame, shape);
    paintCentreAccent(buf, plan, accent, frame);
  } else if (def.archetype === 'dock') {
    // Twin approach lights flanking the slot mouth — replaces the single
    // centred accent, which would otherwise land inside the open slot.
    paintFlightDeck(buf, plan, ramp, accent, frame);
  } else {
    paintCentreAccent(buf, plan, accent, frame);
  }

  // The anchor sits at the hull-side end of the reach, centred across the span.
  const centre = Math.floor(span / 2);
  const hullEnd = flip ? reach - 1 : 0;
  const anchorX = lateral ? hullEnd : centre;
  const anchorY = lateral ? centre : hullEnd;

  assertQc(qcSprite(`module:${def.id}:${faction}`, buf, FACTION_PALETTE[faction]));

  return { def, buf, anchorX, anchorY, faction, plan };
}
