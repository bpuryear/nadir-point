/**
 * THE STAR SYSTEM.
 *
 * Fourteen hand-placed points of interest in one continuous coordinate space, real
 * metres, no map screen and no node graph the player has to obey. The graph in here
 * exists for the WAR, not for travel: the factions push along it, the player flies
 * wherever they like.
 *
 * Spacing is authored at 166-546 km between nearest neighbours, which is the band the
 * travel model in docs/design/controls.md 5.5.3 is tuned for: a 166 km hop is a
 * two-minute burn and a 546 km crossing is five, before compression. Anything closer
 * and transit is a formality; anything further and it is a chore.
 *
 * The layout is a diagonal war. Coalition holds the north-west (Ironhold, Cinderport,
 * Marrow Shoal), Concord holds the south-east (Meridian Gate, Perihelion, Tallow), and
 * the middle - the Graveyard, the Nail, Deepwell - changes hands. The front line the
 * overlay draws is that diagonal, and it MOVES, because the war is simulated whether
 * anyone is watching or not.
 *
 * WHAT THIS FILE OWNS
 *   - the authored POI table (position, kind, identity, initial control)
 *   - registration of the POIs the environment stream has not already registered
 *   - the adjacency graph and distance queries the faction war pushes along
 *
 * It does NOT own lighting or celestials. Those come from the environment stream via
 * `world/poi/index.js`, which is the one place a POI turns into geometry.
 */

import * as THREE from 'three';
import { registerPOI, getPOI } from '../core/contracts.js';
import { getPOIPalette } from '../art/palette.js';
import { KM } from '../core/units.js';
import { buildPOIInstance } from './poi/index.js';

/** How far apart two POIs can be and still be adjacent for the war's purposes. */
export const LINK_RANGE = 620 * KM;

/**
 * TERRAIN IS A SENSOR PARTICIPANT.
 *
 * `src/world/celestials/` and `src/world/fields/` are ~2,600 lines of finished art that
 * changed exactly zero gameplay numbers. This table is the fix, and it is the whole fix:
 * every place in the system declares what its rock, dust, glare and wreckage do to
 * SEEING and to BEING SEEN, and `discovery.js` and `travel.js` read it.
 *
 * Three numbers per terrain, all multipliers on an open-space baseline of 1:
 *
 *   signature  what YOU look like to somebody else. Below 1 you are hidden; above 1
 *              you are lit up. Feeds `discovery.signatureMultiplier`, which feeds the
 *              transit interception roll, so hiding is a plotting decision.
 *   sensor     how far YOUR sensors reach here. Below 1 you are half blind.
 *   clutter    0..1 how much this place slows CONTACT RESOLUTION. Clutter does not stop
 *              you detecting something, it stops you identifying it - which is why a
 *              graveyard is the worst place in the system to work out what just arrived.
 *
 * The four fingerprints are deliberately different, so "where do I sit" is a real
 * question with four different right answers:
 *
 *   GAS GIANT   the best mask in the game and you can still see out. The ambush spot.
 *   CORONA      hides you and blinds you equally. Nobody finds anybody at Perihelion.
 *   BELT/NEBULA hide well, see poorly, and confuse classification. The escape route.
 *   DEBRIS      barely hides you at all and wrecks identification. Reads as structure
 *               on a bad sensor - The Lattice's blurb, made mechanical.
 *   ANCHORAGE   the inversion, and the important one: the places that will service your
 *               ship are the places you are MOST visible and they see furthest. Docking
 *               is exposure, so the sortie has a cost at both ends.
 *
 * `reach` is how far the effect extends from the POI centre; between POIs the terrain
 * is open space and every multiplier is 1. Nothing here is simulated volumetrically -
 * see docs/design/sensor-terrain.md for what is abstracted and why.
 */
export const TERRAIN = {
  open:      { id: 'open',      name: 'OPEN SPACE',          signature: 1.00, sensor: 1.00, clutter: 0.00, reach: 0 },
  belt:      { id: 'belt',      name: 'ASTEROID BELT',       signature: 0.62, sensor: 0.55, clutter: 0.55, reach: 150 * KM },
  nebula:    { id: 'nebula',    name: 'DUST NEBULA',         signature: 0.45, sensor: 0.50, clutter: 0.70, reach: 165 * KM },
  gasgiant:  { id: 'gasgiant',  name: 'GAS GIANT SHADOW',    signature: 0.35, sensor: 0.72, clutter: 0.40, reach: 210 * KM },
  corona:    { id: 'corona',    name: 'STELLAR CORONA',      signature: 0.40, sensor: 0.30, clutter: 0.85, reach: 190 * KM },
  debris:    { id: 'debris',    name: 'DEBRIS FIELD',        signature: 0.75, sensor: 0.68, clutter: 0.80, reach: 140 * KM },
  anchorage: { id: 'anchorage', name: 'PATROLLED ANCHORAGE', signature: 1.35, sensor: 1.15, clutter: 0.10, reach: 60 * KM },
};

/** Default terrain by POI kind. A place may override it with `terrain:` in the table. */
const TERRAIN_BY_KIND = {
  belt: 'belt',
  giant: 'gasgiant',
  star: 'corona',
  graveyard: 'debris',
  station: 'anchorage',
  yard: 'anchorage',
};

/**
 * ANCHORAGES — the places that service a ship.
 *
 * `closest-comparables.md` §3.5 names this as the reason the map has no shape: repair,
 * refit, refining and refuelling all worked anywhere, instantly, forever, and
 * `travel.refuel()` was called by nobody. A game where every service is available
 * everywhere gives you no reason to go anywhere.
 *
 * So the five station and yard POIs that already existed - and they are five, not the
 * six the research counted; `vault-nine` is a graveyard with a yard's blurb and nobody
 * runs it - become the only places the ship can be serviced. Everything below is a
 * DEFAULT that the per-POI `anchorage` block in the table overrides, because the point
 * is that they are not interchangeable: Cinderport sells cheap propellant and cannot
 * touch your hardpoints, Ironhold rebuilds a hull and charges like a dry well, Tallow
 * turns a fit around in a fifth of the time, and Hollow Anchor is close to the fighting
 * and will not serve somebody Concord dislikes.
 *
 * Numbers are per-unit costs in REFINED ALLOY, which is the same alloy that repairs and
 * ammunition come out of. That is deliberate: propellant is now a fourth claim on the
 * pool the scope decision asked to keep scarce.
 */
export const ANCHORAGE_DEFAULTS = {
  station: {
    kindLabel: 'ANCHORAGE',
    propellantPerUnit: 0.9,
    repairSubsidy: 0.20,
    repairRateMul: 2.2,
    refineRateMul: 3.0,
    refitSpeedMul: 2.0,
    heavyRefit: false,
    berthFee: 16,
    minStanding: -30,
  },
  yard: {
    kindLabel: 'REPAIR YARD',
    propellantPerUnit: 1.20,
    repairSubsidy: 0.45,
    repairRateMul: 4.0,
    refineRateMul: 2.0,
    refitSpeedMul: 4.0,
    heavyRefit: true,
    berthFee: 30,
    minStanding: -20,
  },
};

/** How close the cruiser has to be to a berth to be handled by it. */
export const DOCK_RANGE = 9 * KM;

/** And how slowly. You do not arrive at a gantry at three kilometres a second. */
export const DOCK_SPEED = 90;

/**
 * The authored table.
 *
 * `pos` is [x, z] in KILOMETRES, converted to metres on load - authoring 1640000 by
 * hand is how a typo becomes a 1640 km error nobody notices.
 *
 * `control` is the state at t=0: -1 is wholly Concord, +1 is wholly Coalition.
 * `value` is strategic weight; it drives garrison size, how often the war schedules a
 * battle here, and how hard each side fights to keep it.
 * `sun` is [azimuthDeg, elevationDeg] for this location's key light. Two POIs sharing
 * a palette are told apart by where their light comes from, so this is authored per
 * place rather than derived.
 */
const TABLE = [
  {
    id: 'ironhold', name: 'Ironhold Repair Yard', kind: 'yard', paletteId: 'yard',
    pos: [-880, -690], control: 0.95, heat: 0.16, value: 0.95, sun: [212, 24],
    blurb: 'Coalition heavy repair. Gantries the length of a frigate, lit around the clock.',
    field: 'yard-heavy',
    // The best hull work in the system, and it charges for propellant like a place that
    // does not sell propellant. You come here to be rebuilt, not to be topped up.
    anchorage: {
      berth: 'IRONHOLD GANTRY 4',
      propellantPerUnit: 1.35, repairSubsidy: 0.50, repairRateMul: 4.5,
      refineRateMul: 1.8, refitSpeedMul: 4.0, heavyRefit: true, berthFee: 34,
      minStanding: -20,
    },
  },
  {
    id: 'cinderport', name: 'Cinderport Anchorage', kind: 'station', paletteId: 'station',
    pos: [-540, -880], control: 0.88, heat: 0.22, value: 0.80, sun: [166, 17],
    blurb: 'A tender anchorage. Everything here is waiting for something else to break.',
    field: 'station-quiet',
    // Cheapest propellant in the system and a refinery running day and night, because
    // everything moored here is already waiting. Nobody will rebuild your hardpoints.
    anchorage: {
      berth: 'CINDERPORT OUTER RING',
      propellantPerUnit: 0.62, repairSubsidy: 0.18, repairRateMul: 2.0,
      refineRateMul: 3.6, refitSpeedMul: 1.8, heavyRefit: false, berthFee: 10,
      minStanding: -40,
    },
  },
  {
    id: 'marrow-shoal', name: 'Marrow Shoal', kind: 'belt', paletteId: 'belt',
    pos: [-430, -430], control: 0.62, heat: 0.34, value: 0.55, sun: [58, 12],
    blurb: 'Shallow rock. Coalition mining tenders work it under escort and always have.',
    field: 'belt-dense',
  },
  {
    // Registered by the environment stream as 'giant-orbit'.
    id: 'giant-orbit', name: 'Marrow Belt, High Orbit', kind: 'giant', paletteId: 'giant-orbit',
    pos: [-120, -700], control: 0.30, heat: 0.46, value: 0.85, sun: null,
    blurb: 'High orbit over the banded giant. A shattered fleet still holds its formation.',
    field: null,
  },
  {
    id: 'hollow-anchor', name: 'Hollow Anchor', kind: 'station', paletteId: 'station',
    pos: [160, -330], control: -0.44, heat: 0.58, value: 0.78, sun: [318, 9],
    blurb: 'A Concord forward picket built into a hollowed tender. Nothing docks by accident.',
    field: 'station-picket',
    // The nearest berth to the contested middle, and the one that will actually check
    // who you are. Forward pickets do not extend credit and do not do favours.
    anchorage: {
      berth: 'HOLLOW ANCHOR, INNER CRADLE',
      propellantPerUnit: 1.10, repairSubsidy: 0.12, repairRateMul: 2.4,
      refineRateMul: 2.2, refitSpeedMul: 1.6, heavyRefit: false, berthFee: 22,
      minStanding: 0,
    },
  },
  {
    id: 'the-nail', name: 'The Nail', kind: 'belt', paletteId: 'belt',
    pos: [250, -190], control: -0.10, heat: 0.40, value: 0.30, sun: [104, 31],
    blurb: 'One rock, four kilometres long, drifting alone. Everyone uses it to hide behind.',
    field: 'belt-sparse',
  },
  {
    id: 'saltpan', name: 'The Saltpan', kind: 'belt', paletteId: 'belt',
    pos: [380, -60], control: -0.58, heat: 0.44, value: 0.50, sun: [274, 14],
    blurb: 'Ice and salt dust. The reason Concord can keep a fleet this far forward.',
    field: 'belt-ice',
    // Not rock: a standing cloud of ice and salt fines. It masks better than a belt and
    // blinds harder, which is precisely why a fleet can sit this far forward in it.
    terrain: 'nebula',
  },
  {
    id: 'meridian-gate', name: 'Meridian Gate', kind: 'station', paletteId: 'station',
    pos: [760, -140], control: -0.96, heat: 0.20, value: 0.98, sun: [22, 21],
    blurb: 'Concord fleet base. Clean plate, cold light, and gun batteries pointed outward.',
    field: 'station-fortress',
    // Everything, well, at a fleet base's prices, at the far end of Concord space, and
    // only for somebody Concord is not currently shooting at.
    anchorage: {
      berth: 'MERIDIAN GATE, CIVIL BERTH 12',
      propellantPerUnit: 0.85, repairSubsidy: 0.34, repairRateMul: 3.4,
      refineRateMul: 3.0, refitSpeedMul: 2.6, heavyRefit: false, berthFee: 26,
      minStanding: 5,
    },
  },
  {
    id: 'vault-nine', name: 'Vault Nine', kind: 'graveyard', paletteId: 'graveyard',
    pos: [620, 240], control: -0.20, heat: 0.30, value: 0.62, sun: [140, 6],
    blurb: 'A derelict yard nobody built. Both fleets scavenge it and neither admits to it.',
    field: 'graveyard-ancient',
  },
  {
    // Registered by the environment stream as 'near-star'.
    id: 'near-star', name: 'Perihelion Shoal', kind: 'star', paletteId: 'near-star',
    pos: [540, 700], control: -0.80, heat: 0.26, value: 0.68, sun: null,
    blurb: 'Six stops brighter than anywhere else. Sensors are useless and everyone knows it.',
    field: null,
  },
  {
    id: 'tallow-yard', name: 'Tallow Fitting Yard', kind: 'yard', paletteId: 'yard',
    pos: [140, 640], control: -0.72, heat: 0.24, value: 0.72, sun: [246, 27],
    blurb: 'Concord refit slips. Half-built hulls hang in the frames with their frames open.',
    field: 'yard-light',
    // A fitting yard, not a repair yard: the fastest module work in the system and only
    // adequate at putting a hull back together.
    anchorage: {
      berth: 'TALLOW SLIP 9',
      propellantPerUnit: 1.05, repairSubsidy: 0.22, repairRateMul: 2.6,
      refineRateMul: 2.0, refitSpeedMul: 5.0, heavyRefit: true, berthFee: 24,
      minStanding: -15,
    },
  },
  {
    id: 'the-lattice', name: 'The Lattice', kind: 'belt', paletteId: 'belt',
    pos: [-260, 540], control: 0.05, heat: 0.36, value: 0.42, sun: [190, 8],
    blurb: 'Rubble in a resonance, strung out in lines. Reads as structure on a bad sensor.',
    field: 'belt-dense',
    // "Reads as structure on a bad sensor" is a classification failure, not a hiding
    // place, so the Lattice takes the dust profile's clutter rather than the belt's.
    terrain: 'nebula',
  },
  {
    id: 'deepwell', name: 'Deepwell', kind: 'graveyard', paletteId: 'graveyard',
    pos: [-700, 180], control: 0.34, heat: 0.28, value: 0.46, sun: [86, 5],
    blurb: 'The first battle of the war is still here. Nobody has come back for it.',
    field: 'graveyard-cold',
  },
  {
    // Registered by the environment stream as 'graveyard'. The contested centre.
    id: 'graveyard', name: 'The Graveyard', kind: 'graveyard', paletteId: 'graveyard',
    pos: [-190, 60], control: 0.0, heat: 0.72, value: 0.90, sun: null,
    blurb: 'The centre of the war. It has changed hands eleven times and shows all eleven.',
    field: null,
  },
];

/** Where the player starts. Known from the first frame; everything else is dark. */
export const START_POI = 'graveyard';

/**
 * One POI node. Positions are metres on the combat plane, so a leg length in here is
 * the same number the transit burn integrates.
 */
export class POINode {
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name;
    this.kind = spec.kind;
    this.paletteId = spec.paletteId;
    this.blurb = spec.blurb;
    this.value = spec.value;
    this.field = spec.field ?? null;
    this.sun = spec.sun ?? null;

    /** World-space centre, metres. The travel layer plots to this. */
    this.position = new THREE.Vector3(spec.pos[0] * KM, 0, spec.pos[1] * KM);
    /** Arrival boundary: inside this the POI's content is loaded and lit. */
    this.radius = 26 * KM;

    this.initialControl = spec.control;
    this.initialHeat = spec.heat;

    /**
     * Service profile, or null for the nine POIs that are rock, wreckage and light.
     * Merged from the kind default and the per-POI override so a reader can see the
     * whole contract in one object and no caller has to know about the default.
     */
    this.anchorage = (spec.anchorage || ANCHORAGE_DEFAULTS[spec.kind])
      ? { ...(ANCHORAGE_DEFAULTS[spec.kind] ?? {}), ...(spec.anchorage ?? {}), poiId: spec.id, kind: spec.kind }
      : null;

    /**
     * SENSOR TERRAIN. What this place does to seeing and to being seen. Authored per
     * POI where the blurb demands it, defaulted from `kind` otherwise, so a new POI is
     * never silently sensor-neutral.
     */
    this.terrainId = spec.terrain ?? TERRAIN_BY_KIND[spec.kind] ?? 'open';
    this.terrain = TERRAIN[this.terrainId] ?? TERRAIN.open;

    /** @type {POINode[]} filled by buildSystem() */
    this.neighbours = [];
  }

  distanceTo(other) {
    return this.position.distanceTo(other.position);
  }
}

/**
 * The system: nodes, adjacency, and the queries the war and the travel layer need.
 * Pure data and geometry - no simulation state lives here, that is `factionWar.js`.
 */
export class StarSystem {
  constructor(nodes) {
    /** @type {POINode[]} */
    this.nodes = nodes;
    /** @type {Map<string, POINode>} */
    this.byId = new Map(nodes.map((n) => [n.id, n]));

    // Bounds, used by the overlay and by the front-line contour.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x); maxX = Math.max(maxX, n.position.x);
      minZ = Math.min(minZ, n.position.z); maxZ = Math.max(maxZ, n.position.z);
    }
    const pad = 90 * KM;
    this.bounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    this.centre = new THREE.Vector3((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    this.span = Math.max(maxX - minX, maxZ - minZ);

    /**
     * ONE shared result object for `terrainAt`. Discovery samples terrain every second
     * and the travel plotter samples it nine times per leg; neither may allocate. A
     * caller that wants to keep a reading copies the four numbers out of it.
     */
    this._terrain = {
      id: 'open', name: TERRAIN.open.name, poiId: null, weight: 0,
      signature: 1, sensor: 1, clutter: 0,
    };

    this._linkNeighbours();
  }

  /**
   * Terrain at a world point: the strongest single influence, faded in by distance.
   *
   * Strongest-wins rather than summed, because two overlapping masks should not stack
   * into a place where nobody can be seen at all - and because "which place am I hiding
   * in" is a thing the player must be able to name.
   *
   * @param {number} x
   * @param {number} z
   * @param {Object} [out] destination; defaults to a shared scratch object
   * @returns {{id:string,name:string,poiId:string|null,weight:number,
   *            signature:number,sensor:number,clutter:number}}
   */
  terrainAt(x, z, out = this._terrain) {
    let best = null;
    let bestW = 0;
    for (const n of this.nodes) {
      const t = n.terrain;
      if (t.reach <= n.radius) continue;
      const dx = n.position.x - x;
      const dz = n.position.z - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= t.reach) continue;
      // Full strength inside the arrival boundary, smoothstepped to nothing at `reach`.
      const lin = d <= n.radius ? 1 : 1 - (d - n.radius) / (t.reach - n.radius);
      const w = lin * lin * (3 - 2 * lin);
      if (w > bestW) { bestW = w; best = n; }
    }
    const t = best ? best.terrain : TERRAIN.open;
    out.id = bestW > 0 ? t.id : 'open';
    out.name = bestW > 0 ? t.name : TERRAIN.open.name;
    out.poiId = bestW > 0 ? best.id : null;
    out.weight = bestW;
    out.signature = 1 + (t.signature - 1) * bestW;
    out.sensor = 1 + (t.sensor - 1) * bestW;
    out.clutter = t.clutter * bestW;
    return out;
  }

  /** The terrain profile of a named POI, at full strength. Read-only. */
  terrainOf(poiId) {
    return this.byId.get(poiId)?.terrain ?? TERRAIN.open;
  }

  /**
   * Adjacency for the war's front. Every node keeps its neighbours inside LINK_RANGE,
   * and always at least two, so an outlying base is never cut out of the simulation by
   * a distance threshold.
   */
  _linkNeighbours() {
    for (const a of this.nodes) {
      const scored = [];
      for (const b of this.nodes) {
        if (b === a) continue;
        scored.push({ node: b, d: a.distanceTo(b) });
      }
      scored.sort((p, q) => p.d - q.d);
      a.neighbours.length = 0;
      for (let i = 0; i < scored.length; i++) {
        if (scored[i].d <= LINK_RANGE || a.neighbours.length < 2) a.neighbours.push(scored[i].node);
        else break;
      }
    }
  }

  get(id) { return this.byId.get(id) ?? null; }

  /** Every POI that can service a ship. Five of the fourteen. */
  anchorages() {
    if (!this._anchorages) this._anchorages = this.nodes.filter((n) => !!n.anchorage);
    return this._anchorages;
  }

  isAnchorage(id) { return !!this.get(id)?.anchorage; }

  /**
   * Nearest berth to a point, optionally filtered - the recovery tender uses this with
   * a "will they have me" predicate so a player who has burned both factions is towed
   * to whoever is left rather than to the geometrically closest gun battery.
   */
  nearestAnchorage(x, z, accept = null) {
    let best = null;
    let bestD = Infinity;
    for (const n of this.anchorages()) {
      if (accept && !accept(n)) continue;
      const d = Math.hypot(n.position.x - x, n.position.z - z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best ? { node: best, distance: bestD } : null;
  }

  /** Nearest node to a world point, and how far away it is. */
  nearest(x, z) {
    let best = null;
    let bestD2 = Infinity;
    for (const n of this.nodes) {
      const dx = n.position.x - x;
      const dz = n.position.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = n; }
    }
    return { node: best, distance: Math.sqrt(bestD2) };
  }

  /** The node whose arrival boundary contains this point, if any. */
  containing(x, z) {
    const { node, distance } = this.nearest(x, z);
    return node && distance <= node.radius ? node : null;
  }

  /** Sorted [{a,b,distance}] for every adjacency, deduplicated. Used by the overlay. */
  links() {
    const out = [];
    const seen = new Set();
    for (const a of this.nodes) {
      for (const b of a.neighbours) {
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a, b, distance: a.distanceTo(b) });
      }
    }
    return out;
  }

  /** Diagnostics for the probe: min/max nearest-neighbour spacing, in km. */
  spacingReport() {
    let min = Infinity, max = 0;
    for (const n of this.nodes) {
      const d = n.neighbours.length ? n.distanceTo(n.neighbours[0]) : 0;
      if (d > 0) { min = Math.min(min, d); max = Math.max(max, d); }
    }
    return { minKm: min / KM, maxKm: max / KM, nodes: this.nodes.length };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let _registered = false;

/**
 * Register every POI the environment stream has not already registered.
 *
 * Idempotent, and deliberately tolerant: `giant-orbit`, `graveyard` and `near-star`
 * are owned by `world/lighting/pois.js` and are left exactly as that stream authored
 * them. We only fill the gaps.
 */
export function registerSystemPOIs() {
  if (_registered) return;
  _registered = true;

  for (const spec of TABLE) {
    if (getPOI(spec.id)) continue;
    const pal = getPOIPalette(spec.paletteId);
    const dir = sunVector(spec.sun ?? [200, 18]);
    registerPOI({
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      paletteId: spec.paletteId,
      keyLight: {
        direction: [dir.x, dir.y, dir.z],
        color: pal.key.color,
        intensity: pal.key.intensity,
        angularRadius: pal.key.angularRadius,
      },
      fill: pal.fill,
      ibl: pal.ibl,
      grade: pal.grade,
      systemPos: [spec.pos[0] / 900, spec.pos[1] / 900],
      build(ctx, world) {
        return buildPOIInstance({
          id: spec.id,
          paletteId: spec.paletteId,
          sunDir: sunVector(spec.sun ?? [200, 18]),
          field: spec.field,
        }, ctx, world);
      },
    });
  }
}

/** [azimuthDeg, elevationDeg] -> unit vector. Azimuth 0 is +Z, measured CCW. */
export function sunVector([azDeg, elDeg]) {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const c = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c).normalize();
}

/**
 * Build the system. Cheap; called once by installWorldSim.
 *
 * The whole map is recentred so that the starting POI sits on the world origin. The
 * table stays readable in absolute kilometres, and the player - who is spawned at the
 * origin by `game.js` before this stream is even loaded - is standing in a real place
 * on the first frame rather than in the middle of nowhere with a POI 200 km away.
 */
export function buildSystem(startId = START_POI) {
  registerSystemPOIs();
  const nodes = TABLE.map((spec) => new POINode(spec));
  const origin = nodes.find((n) => n.id === startId) ?? nodes[0];
  const ox = origin.position.x;
  const oz = origin.position.z;
  for (const n of nodes) {
    n.position.x -= ox;
    n.position.z -= oz;
  }
  return new StarSystem(nodes);
}

export const SYSTEM_TABLE = TABLE;
