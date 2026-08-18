/**
 * The module catalogue: 24 modules across six hardpoints and three tiers.
 *
 * Modules are built from six shape archetypes rather than drawn one at a time,
 * so a faction's visual identity is a palette lock plus an archetype choice
 * rather than 24 hand-authored sprites per faction.
 *
 * The anchor is the pixel that lands on the hull's hardpoint. Everything else
 * extends *outward* from it, which is the property that makes an installed
 * module change the ship's outline. A module drawn inboard of its anchor would
 * be swallowed by the hull and invisible in silhouette, and an invisible upgrade
 * is the one failure the whole salvage loop cannot survive.
 */

import type { Rng } from '../sim/rng.js';
import {
  createBuf, setPx, type PixBuf,
} from './pixbuf.js';
import {
  EMISSIVE, FACTION_PALETTE, rampOf, shadeStep, type FactionId,
} from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import {
  clearDitherPlan, createDitherPlan, ditherMask, setDitherPlan, type DitherPlan,
} from './grammar/plates.js';
import type { HardpointId } from './hull.js';

export type ModuleArchetype = 'barrel' | 'boom' | 'block' | 'pod' | 'nozzle' | 'array';

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
  { id: 'hangar-deck',     name: 'HANGAR DECK',     hardpoint: 'ventral',    archetype: 'block',  tier: 3, length: 38, width: 36 },

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
  // A gun barrel: broad breech, narrow muzzle.
  barrel: (t) => 1 - 0.62 * t,
  // A mast or lance: thin, near-constant, tapering only at the tip. 0.4 is the
  // thinnest value that still clears a full pixel of half-width once rounded
  // and inset (see the `halfSpan` maths below) on the narrowest boom module in
  // the catalogue (ram-spike, 8px across) — any thinner and the mast degenerates
  // to a single-pixel hairline too sparse to read as a drawn module at all.
  boom: (t) => (t > 0.82 ? 0.4 * (1 - (t - 0.82) / 0.18) : 0.4),
  // A bolted-on box: square, full width the whole way.
  block: () => 1,
  // A cluster: bulges in the middle.
  pod: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))),
  // An exhaust bell: narrow throat flaring to a wide mouth.
  nozzle: (t) => 0.45 + 0.55 * t,
  // A flat panel bank: full width, squared off, shallow.
  array: (t) => (t > 0.9 ? 0.8 : 1),
};

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

  // One emissive accent at the working end — a muzzle, a lens, an exhaust —
  // so the module reads as powered and gives bloom something to key on.
  {
    const tipT = 0.86;
    const r = Math.round((reach - 1) * tipT);
    const rr = flip ? reach - 1 - r : r;
    const centre = Math.floor(span / 2);
    const x = lateral ? rr : centre;
    const y = lateral ? centre : rr;
    setPx(buf, x, y, accent);
    clearDitherPlan(plan, x, y);
  }

  // The anchor sits at the hull-side end of the reach, centred across the span.
  const centre = Math.floor(span / 2);
  const hullEnd = flip ? reach - 1 : 0;
  const anchorX = lateral ? hullEnd : centre;
  const anchorY = lateral ? centre : hullEnd;

  assertQc(qcSprite(`module:${def.id}:${faction}`, buf, FACTION_PALETTE[faction]));

  return { def, buf, anchorX, anchorY, faction, plan };
}
