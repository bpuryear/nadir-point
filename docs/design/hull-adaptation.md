# Procedural hull adaptation

**How the Nadir's own geometry changes to accommodate what is bolted to it, while still
reading as one ship.**

This is the spec for §3 of `armament-brief.md`. It is written against the code as it
stands on 2026-07-29 — every triangle count, draw count and timing below was **measured**
by building the real geometry, not read off a comment. Where a number in an existing
comment disagrees with the measurement, the measurement is quoted and the discrepancy is
recorded in §11.

Companion documents: `scope-decision.md` (binding), `look-target.md` (art-style hybrid;
lighting deferred), `ship-language.md` (the rules the hull already passes),
`fun-systems.md` (why the 5-second decision tier is empty).

---

## 0. The one-paragraph answer

The brief's hypothesis is **confirmed, with one inversion and one addition.**

Confirmed: a hardpoint publishes an *adaptation* — a small procedural change to the
hull's own geometry at that station, generated at build time from the fitted module's
declared needs, merged into the hull's existing buckets, adding zero draw calls.

**The inversion:** the module declares a *need*, never a *shape*. The hull owns every
line of adaptation geometry. This is the whole difference between a ship that reads as
designed and one that reads as a parts bin (§2), and it is not negotiable.

**The addition:** the silhouette-bearing half of an adaptation is expressed as an **edit
to the hull's station table**, not as added geometry. `HULL_STATIONS` is data shared by
all three LODs through `sectionAt()`, so a station edit propagates to LOD2 for free and
cannot make the far LOD a different ship. Added primitives are the LOD0/LOD1 detail *on
top of* a silhouette change that already happened in the table. This is what makes §6
(LOD) and §5 (budget) tractable at all.

Measured cost of the whole system on a fully fitted hull: **+6 triangles and 0 draw
calls**, because adaptation is funded by deleting furniture the hull no longer needs and
by moving `ModuleBuilder.graft()` off twenty-four modules and onto the hull. §5 shows the
arithmetic.

---

## 1. Research

### 1.1 Why a gun is never bolted on — real warship structure

A naval mount is the visible top of a vertical assembly that goes down through the ship.
Four elements, and all four are load-bearing for *how it looks*:

- **The barbette** is the non-rotating armoured drum beneath the rotating gunhouse and
  above the armoured deck. Its job is to protect the upper ends of the hoists. It is a
  structural cylinder built into the hull, not a fitting attached to it.
  ([Barbette, Wikipedia](https://en.wikipedia.org/wiki/Barbette))
- **The hoists and the working chamber** run up through the barbette from the magazine
  below, delivering charge and projectile at the breech. The working chamber and the main
  trunk rotate *inside* the fixed barbette.
  ([Main Battery Turret, GlobalSecurity](https://www.globalsecurity.org/military/systems/ship/turrets.htm))
- **The magazine** sits low and centreline-ish, because it is the thing you least want
  hit. The distance between magazine and mount is therefore always non-zero and always
  vertical — which is why every real capital ship has *something* running from its gun
  positions down into its middle.
- **The casemate** is the older answer: guns set into the ship's side inside armoured
  boxes, with the plating built around each embrasure. Casemates were abandoned because
  they sat near the waterline and flooded, and were replaced by the hybrid
  barbette-turret system by the late 1880s.
  ([Casemate ironclad](https://en.wikipedia.org/wiki/Casemate_ironclad),
  [Turret ship](https://en.wikipedia.org/wiki/Turret_ship))

**The design conclusion, and it is the single most valuable line of research in this
document:** the visual signature of "this hull was built for this weapon" is not the gun.
It is that **something goes down and inward from the mount**. A barrel on a pad reads as
a fitting. A barrel on a pad with a trunk disappearing into the deck behind it reads as a
weapon system the ship was built around, and it costs twelve triangles.

That is why `trunk` is one of only seven primitives in §3, and why it is mandatory for
every weapon-class adaptation.

Second conclusion: **an embrasure is a hole in armour, and armour steps around holes.**
The casemate read comes from the plating discontinuity as much as from the aperture. Our
`armourBelt()` currently runs 640 m of unbroken flank belt straight through both sponson
stations. Making it *break* around a casemate is the cheapest "built for" cue available
and it is a parameter change, not new geometry (§3.4).

### 1.2 How games do modular ships, and which read as designed

The deliverable here is the *why*, so this table leads with it.

| Game | Mechanism | Reads as | Why |
|---|---|---|---|
| **Star Citizen** | "Itemports": every attachment point declares a **type** and a **size**; an item mounts only if both match. Weapon hardpoints are restricted to a **single size**, not a range, so a Size 3 port takes a Size 3 gun and nothing else. Gimbals occupy space and therefore take a weapon *one size smaller*. Multi-link mounts were deleted outright because two guns on one mount "was often significantly larger than the base weapon… and caused visual or physical clipping". ([The Shipyard: Weapon Hardpoints, RSI](https://robertsspaceindustries.com/en/comm-link/engineering/16181-The-Shipyard-Weapon-Hardpoints)) | **Designed** | One authority — CIG — hand-authors every hull *around a known maximum envelope*. The itemport does not make the hull coherent; it makes the hull **authorable**, by guaranteeing the artist knows the largest thing that will ever appear there. Coherence is then bought with artist hours. |
| **Falling Frontier** | Ship designer with internal and external modules; the developer's own framing is that changing modules "can also change the ship's silhouette", and turrets ship with **distinct turret-base geometry** rather than being decals on a slot. Plus a global semantic colour rule: **white = sensors, orange = maintenance and access**, applied across every hull. ([PCGamesN on the ship designer](https://www.pcgamesn.com/falling-frontier/ship-builder); dev diary quoted at length in our own `closest-comparables.md` §3.6) | **Designed**, and it is the closest comparable to what we want | Two things do the work. (a) The **turret base** is authored per hull family — the hull provides the joint, the module provides the gun. (b) The **colour rule is global and semantic**, so however you configure a ship, function is legible before you read a label. A rule that survives every permutation is worth more than any amount of per-permutation art. |
| **Homeworld** | Fixed fleet, no player composition. Family resemblance comes from a shared shape language maintained by the same people across decades — "the shape language we developed, how shapes feel and how lines flow"; the HW3 Mothership "retains so much of the core idea, but feels like a flying knife chiselled out of stealth angles". ([Aftermath, *From the Sketchbook to the Stars*](https://aftermath.site/homeworld-3-concept-art-making-of/)) | **Designed** | One shape language, one authority, zero player composition. It is the ceiling, and it is not a mechanism we can copy — it is a *constraint* we can copy: **a small closed vocabulary, applied by one authority.** |
| **Space Engineers**, **From the Depths** | Grid of blocks. The block is the vocabulary and there is no joint logic at all: every junction is a right angle between two cubes. The From the Depths community's own guidance is that builders "start by constructing the core with core components first, and only after all the core functions are working do they start building the aesthetics" — producing what the same forums call block monstrosities. ([From the Depths — how do you make nice looking creations?](https://steamcommunity.com/app/268650/discussions/0/528398719800148070/)) | **Parts bin** | Coherence is delegated to the player, who is optimising function. There is no authority owning the joint, so there is no joint. |
| **Avorion** | Blocks that are freely scalable rather than voxel-quantised — "not bound to the standard voxel style… you can scale them very extremely". ([Avorion on Steam](https://store.steampowered.com/app/445220/Avorion/)) | **Parts bin, but a better one** | Scaling removes the cube tell and nothing else. The authority is still the player and the joint is still unowned. |
| **Cosmoteer** | 2D grid, function-first tiles. | **Parts bin, deliberately** | It is a systems diagram you can see, and it is honest about that. Worth naming because it shows the failure mode is a *choice*, not an accident. |

**The finding, stated as a rule we will obey:**

> Coherence is a property of the **authoring system**, not of the parts.
> Every system that reads as designed has exactly **one authority deciding how a joint
> looks**. Every system that reads as a parts bin has as many authorities as it has parts
> (or players).

Applied here: today `ModuleBuilder.graft()` puts a cut plate, a bolt ring and two weld
beads on every module — i.e. **the module authors the joint**. That was the right call
when the hull could not respond. With adaptation it becomes the wrong call, because it
means twenty-four authorities each deciding what a weld looks like. **The joint moves to
the hull.** This is not a stylistic preference; it is the mechanism that makes the whole
feature work, and it also happens to pay for itself in triangles (§5).

Second applied finding, from Falling Frontier: **adopt the semantic colour rule as an
adaptation-level rule, not a decoration.** Adaptation is the only system in the codebase
that *knows where the access points are*, so it is the only system that can apply
`white = sensors / orange = access` semantically rather than at random. Our palette
already has both colours and already documents this intent — `palette.js` declares
`marking.hazardA = 0xc4671b` as "access orange on every faction" and
`marking.sensor = 0xe9e3d6` as "bone-white, for arrays and apertures" — but the only
consumer today is `hullMaps.js:781`, which stamps a hazard patch onto **a random leaf of
the panel field at tier ≥ 2**. The colours exist; the semantics do not. §4.3 closes that.

### 1.3 Procedural technique, within our constraints

Our constraints are: low-poly, hard-edged, runtime-generated, merged per material,
strict triangle and draw budgets, no GPU required for the audits.

- **No CSG. Ever.** Boolean cutting is out on three counts: it is expensive, it produces
  triangles we cannot budget in advance, and it destroys the hard-edged normal treatment
  `G.hard()`/`normalizeAttrs()` depend on. The technique that replaces it is already in
  the codebase and already works: **sink a lined tunnel into a closed shell and let the
  shell be the tunnel's floor.** `G.recess()` is documented as "deliberately bottomless…
  the hull's own skin is what you see at the end of the tunnel", and the 54 × 34 m hangar
  mouth on the port flank is built exactly this way. Every aperture in this spec is that
  technique.
- **Annulus-between-profiles for real holes.** Where a hole must actually pass through —
  the drive well, a muzzle aperture at the stem — `G.ringFace(outer, inner, z)` builds
  the flat annulus and a flipped `G.prism()` builds the inward shell. `buildStern()`
  already does this, and its comment records the bug you get if you also let the loft cap
  the face: two coplanar faces 0 m apart, which reviewed as two separate defects that
  were one z-fight. **Adaptation must never place a face coplanar with the loft skin.**
- **Station-table editing beats geometry addition.** The hull is a loft over a table of
  eight-number stations. Changing `top`, `bottom` or a chamfer at a station changes the
  silhouette at **every LOD simultaneously and for zero triangles**, because LOD1 and
  LOD2 are `pick()`s from the same table. This is the technique the whole spec is built
  on and it is unique to loft-based hulls; it is not available to anyone shipping a mesh.
- **Merge by material at build time, and cache the invariant half.** `Buckets` +
  `mergeParts()` already collapse the hull to 10 draws at LOD0 and 6 at LOD1. Adaptation
  must feed the *same* buckets. Caching the bare-hull placed geometries so only the
  adapted parts are regenerated is what makes live refit cost 3 ms instead of 20 (§7).
- **Determinism.** Everything seeded from `rng.fork()`, never `Math.random`, exactly as
  `greebleBand()` already enforces with a runtime throw. A refit that produces different
  geometry on reload is a bug the player will see the second time they dock.

---

## 2. The mechanism, and the data contract

### 2.1 Shape of the system

```
ModuleDef.adapt          declares NEEDS, in metres and counts. No geometry.
        |
        v
core/contracts.js        validates the declaration (closed kind list, budget ceiling)
        |
        v
art/geometry/adapt.js    NEW FILE. The single authority. Turns needs into
                         (a) station-table deltas and (b) placed geometries,
                         using the station's real section from sectionAt()/chineAt().
        |
        v
art/geometry/cruiser.js  hullParts({rng, lod, fit}) applies the deltas to
                         HULL_STATIONS before lofting, and B.add()s the geometries
                         into the EXISTING buckets. Nothing new is created.
        |
        v
buildCruiser / reskinHull   merges, uploads, recomputes bounds + silhouette signature.
```

Three properties fall out of this and each one is a requirement:

1. **The module never sees a `THREE` type in its adaptation declaration.** It is pure
   data. This is what stops twenty-four dialects.
2. **The hull generates from its own section at that z.** `sectionAt(z)` and `chineAt(z)`
   already exist and return the real half-beam, deck height, chamfer and tumblehome.
   A casemate generated this way sits on the actual flank with the actual rake. This is
   the difference between "built in" and "stuck on", and it is also why **adaptation is
   never mirrored** (§4.2).
3. **Adaptation is a build input, not a post-process.** `hullParts` gains a `fit`
   argument. A bare hull is `fit = {}` and produces byte-identical output to today.

### 2.2 The contract, in code

Additions to `src/core/contracts.js`:

```js
/**
 * THE ADAPTATION VOCABULARY. Seven primitives, and the list is CLOSED.
 *
 * It is closed for the same reason the cruiser has three surfaces and not six: a hull
 * assembled from other people's parts reads as one object exactly as long as the number
 * of distinct kinds of thing on it stays small. A module that needs an eighth kind does
 * not get an eighth kind; it gets told to express itself in these seven or to carry the
 * feature on its own body inside its own 340 triangles.
 *
 *   port      an aperture in the skin: gun port, missile hatch, bay mouth, muzzle ring
 *   blister   a chamfered swelling the skin steps around: casemate, magazine, housing
 *   trunk     structure running INTO the ship from the mount: recoil brace, hoist, plumbing
 *   step      a plating discontinuity: belt break, coaming, splinter screen
 *   vane      a flat plate on a root fairing: radiator, blast baffle, spar
 *   hatch     a small ACCESS feature. Carries the orange semantic (see §4.3).
 *   lens      a small SENSOR/EMITTER face. Carries the white semantic. Emissive.
 */
export const ADAPT_KINDS = ['port', 'blister', 'trunk', 'step', 'vane', 'hatch', 'lens'];

/** What a trunk connects to. The hull decides where that is; the module only names it. */
export const ADAPT_SERVICES = ['magazine', 'reactor', 'coolant', 'hangar', 'sensor', 'hold'];

/**
 * @typedef {Object} AdaptNeed
 * @property {string}  kind        one of ADAPT_KINDS
 * @property {number}  [count=1]   1..4. The HULL varies their sizes and spacing; a module
 *                                 that asks for four equal ports gets four unequal ones,
 *                                 because a repeated element the eye can count adds
 *                                 nothing after the second one (cruiser.js, FINS).
 * @property {number}  sizeM       governing dimension, metres: bore, mouth width, span.
 * @property {number}  [depthM]    how far INTO the hull it reaches. `port`, `trunk`.
 * @property {number}  [runM]      how far ALONG the hull the feature spreads. `port`,
 *                                 `step`, `vane`. Defaults to the mount's own band.
 * @property {number}  [lift]      metres the local DECK or KEEL line must move to
 *                                 accommodate this. Signed; +up. This is the
 *                                 station-table edit and it is the silhouette (§6).
 * @property {string}  [service]   one of ADAPT_SERVICES. `trunk` only, and required there.
 * @property {'out'|'fwd'|'aft'|'up'|'down'} [face]  which way it opens.
 *                                 Defaults to the hardpoint's own `normal`.
 */

/**
 * @typedef {Object} AdaptationDecl
 * @property {AdaptNeed[]} needs   1..6 needs. More than six is a module pretending to
 *                                 be a refit.
 * @property {number} triBudget    LOD0 ceiling for the geometry the hull generates on
 *                                 this module's behalf. <= BUDGET.hullAdaptTris.
 * @property {number} [silhouetteM] the outline change the module CLAIMS, metres. The
 *                                 audit measures the real one and fails on a lie; this
 *                                 exists so the refit screen can say "this widens your
 *                                 port flank by 30 m" before the player commits.
 */

// ModuleDef gains exactly one optional field:
/** @property {AdaptationDecl} [adapt] */
```

Validation, added to `validate('module', def)` alongside the existing `parts` checks:

```js
if (def.adapt) {
  const a = def.adapt;
  if (!Array.isArray(a.needs) || a.needs.length < 1 || a.needs.length > 6) {
    throw new Error(`[contracts] module "${def.id}" adapt.needs must be 1..6`);
  }
  if (!(a.triBudget > 0) || a.triBudget > BUDGET.hullAdaptTris) {
    throw new Error(`[contracts] module "${def.id}" adapt.triBudget ${a.triBudget} outside 1..${BUDGET.hullAdaptTris}`);
  }
  let trunks = 0;
  for (const n of a.needs) {
    if (!ADAPT_KINDS.includes(n.kind)) {
      throw new Error(`[contracts] module "${def.id}" adapt kind "${n.kind}" is not an ADAPT_KIND`);
    }
    if ((n.count ?? 1) < 1 || (n.count ?? 1) > 4) {
      throw new Error(`[contracts] module "${def.id}" adapt "${n.kind}" count outside 1..4`);
    }
    if (!(n.sizeM > 0)) {
      throw new Error(`[contracts] module "${def.id}" adapt "${n.kind}" needs a positive sizeM`);
    }
    if (n.kind === 'trunk') {
      trunks++;
      if (!ADAPT_SERVICES.includes(n.service)) {
        throw new Error(`[contracts] module "${def.id}" trunk service "${n.service}" is not an ADAPT_SERVICE`);
      }
    }
  }
  // §1.1: the read is that something goes down and inward. A weapon whose adaptation
  // has no trunk is a gun on a pad, which is the thing this whole system exists to stop.
  if (def.weapon && trunks < 1) {
    throw new Error(`[contracts] weapon module "${def.id}" declares an adaptation with no trunk`);
  }
}
```

`src/core/units.js` gains three budget lines (§5):

```js
export const BUDGET = {
  // ... existing ...
  cruiserCoreTris: 2000,       // the BARE hull. Unchanged.
  cruiserFittedTris: 2400,     // NEW: bare hull + six adaptations, LOD0
  hullAdaptTris: 90,           // NEW: per occupied hardpoint, LOD0
  hullAdaptTrisLod1: 40,       // NEW: per occupied hardpoint, LOD1
  moduleTris: 340,             // WAS 400. graft() moved to the hull; see §5.2
};
```

### 2.3 What the hull does with it

New file `src/art/geometry/adapt.js`. It exports exactly two functions, because the
adaptation splits in two along the LOD line and those two halves must not be able to
drift apart.

```js
/**
 * PART ONE — the station-table edit. This is the SILHOUETTE, and it is free.
 *
 * Returns a NEW station table. Never mutates HULL_STATIONS.
 *
 * WHAT MAY BE EDITED, and this list is the whole safety argument for §6:
 *   top, bottom          the deck and keel lines            -> silhouette in side view
 *   chamW, chamTop, chamBot   the chamfer facets            -> the chine highlight
 *   keelRatio            tumblehome / flare                 -> the flank rake
 *   inserted stations    interpolated from the existing curve
 *
 * WHAT MAY NEVER BE EDITED:
 *   deckHalf             the plan half-beam curve.
 *
 * deckHalf is frozen because ship-language.md's R2.1 (no contiguous +-4% run over
 * 160 m), R2.2 (exactly one interior minimum and one interior maximum) and R2.3 (waist
 * <= 0.70x shoulder section area) are all stated over THIS CURVE. A blister at z = +130
 * that widened deckHalf would create a second interior maximum and silently fail R2.2,
 * and nobody would find it until the next silhouette audit. Beam growth is therefore
 * expressed as a `blister` — a separate mass outboard of the skin — which is both what a
 * real casemate is and what keeps the audit's guarantees intact. The silhouette
 * signature bins over |x| across ALL geometry, so a blister widens the MEASURED outline
 * without touching the curve the rules are about.
 *
 * @param {number[][]} rows            HULL_STATIONS
 * @param {Object<string, ModuleDef>} fit    hardpoint id -> fitted module (or absent)
 * @returns {number[][]} a new table, same column order
 */
export function adaptStations(rows, fit) { /* ... */ }

/**
 * PART TWO — the geometry, at LOD0 and LOD1 only.
 *
 * Adds into the caller's Buckets using ONLY surfaces the hull already draws
 * ('hull', 'plating', 'greeble', 'radiator') and the raw 'engineGlow' bucket. An
 * adaptation that needs a surface the hull does not already have is not an adaptation.
 * That single rule is what guarantees §5's "zero new draw calls".
 *
 * @param {Buckets} B
 * @param {Object} p
 * @param {string} p.hardpoint
 * @param {AdaptationDecl} p.decl
 * @param {(z:number)=>Object} p.sectionAt   the hull's own interpolator
 * @param {(z:number)=>Object} p.chineAt
 * @param {number} p.detail                  greeble.js DETAIL tier
 * @param {boolean} p.full                   LOD0 only
 * @param {RNG} p.rng                        forked as `adapt:<hardpoint>`
 * @returns {{tris:number, band:{z0:number,z1:number}}}  audited against decl.triBudget
 */
export function adaptationParts(B, p) { /* ... */ }
```

`cruiser.js` changes in three places and nowhere else:

```js
export function hullParts({ rng, lod = 0, fit = {} }) {
  // ...
  const STATIONS = adaptStations(HULL_STATIONS, fit);   // was: HULL_STATIONS
  // ... every existing use of HULL_STATIONS and sectionAt() reads STATIONS ...

  // §6 THE SIX MOUNTS. Occupied mounts get an adaptation instead of empty furniture.
  for (const id of HARDPOINTS) {
    const def = fit[id];
    if (!def) { emptyMount(B, id, CRUISER_ANCHORS[id], { /* as today */ }); continue; }
    if (def.adapt) adaptationParts(B, { hardpoint: id, decl: def.adapt, sectionAt, chineAt, detail: D, full, rng: r });
  }
}
```

Note what that does to the empty-mount furniture: **an occupied mount stops drawing its
plinth, bolt ring and conduits**, because the adaptation replaces them. That is 29
triangles per mount reclaimed (32 at the engine well) and it is half of how adaptation
pays for itself.

### 2.4 Why not the alternatives

Three mechanisms were considered and rejected; recording them so they do not come back.

- **The module carries the adaptation geometry.** Rejected: it is the parts-bin failure
  mode from §1.2 with extra steps. Twenty-four authors deciding what a weld looks like,
  and none of them can see the hull's section at their station.
- **A prefabricated hull variant per fit.** Six mounts × up to five modules is over
  15 000 combinations. Not a real option, and it is what Star Citizen's artist-hours
  answer degenerates into once you allow composition.
- **Vertex displacement in the shader.** Rejected: the silhouette audit
  (`tools/silhouette.mjs`) rasterises CPU-side geometry and would never see it; the
  physics bounds would not see it; and the whole art direction is hard edges, which a
  displaced continuous surface is not.

---

## 3. The adaptation vocabulary

Seven primitives. Each maps to a call that exists in `greeble.js` today, except one small
addition noted in §3.1. Triangle counts are **measured**, at `DETAIL.FULL` unless stated.

### 3.1 `port` — an aperture in the skin

*Gun ports, missile hatches, torpedo mouths, launch throats, the muzzle aperture at the
stem, the drive-bell throats in the transom.*

Built as a coaming annulus plus an inward-facing tunnel, sunk into the closed loft, with
no back plate — the hull's own skin is the floor. Never a boolean, never a quad on the
skin.

| build | tris |
|---|---|
| `G.recess({w,h,depth,wall})` — the existing 54 × 34 m hangar mouth primitive | **24** |
| proposed `G.aperture()` — the same minus the outward housing walls, 4-sided | **16** |
| 6-sided variant, for round bores (lance muzzle, drive throat) | **24** |

`G.aperture({width, height, depth, coaming, sides, detail})` is ~20 lines in
`greeble.js`: `ringFace(outer, inner, 0)` plus a flipped `prism(inner, -depth, 0)` with
no caps. It exists so a four-gun battery costs 64 triangles instead of 96.

**Rules.** Ports are never evenly spaced and never the same size. The hull varies both
from `rng.fork('adapt:' + hardpoint)`: pitch jittered ±14%, size ±10%, and `count` is
capped at 4 regardless of how many guns the module has — three ports on a four-gun
battery reads as a battery, and it is on-brand for a ship that has been repaired.

### 3.2 `blister` — a swelling the skin steps around

*Casemates, magazine boxes, reactor housings, sensor housings, the shoulder around a
recoil structure.*

| build | tris |
|---|---|
| `G.panelledSlab({..., chamfer})` | **28** |
| `G.panelledSlab({...})` unchamfered | **12** |
| `G.taperedWedge({...})` | **12** |

**Rules.** A blister is positioned from `sectionAt(z)` and `chineAt(z)` so it sits on the
real flank with the real rake, and it is **sunk at least one third of its own depth into
the loft** — the same rule LOD2 already uses for its mass proxies ("a block that merely
touches the hull reads as a detached slab floating alongside it the moment shading
flattens out"). Never coplanar with the skin: ≥ 0.5 m proud or ≥ 0.5 m sunk.

A blister always comes with a `step` (§3.4). A swelling with the belt running straight
through it is a bump; a swelling the belt breaks around is a casemate.

### 3.3 `trunk` — structure running into the ship

*Recoil braces, ammunition hoists, coolant runs, hangar throats, power plumbing.*

| build | tris |
|---|---|
| `G.panelledSlab({...})` | **12** |
| `G.hexStrut({length, radius})` | **20** |
| `G.pipeRun({length, radius, sides:6})` | **20** |
| `beam(a, b, r)` (cruiser.js, aimed strut) | **20** |

**This is the mandatory element for every weapon adaptation** (§1.1, and enforced in the
contract validator). It is what turns a gun on a pad into a weapon system.

**Rules.** A trunk must terminate at a **named service** the hull actually has: the
reactor at `[0, -10, 220]`, the salvage bay at `[0, -156, 0]`, the sensor mast at
`[-18, 300, -208]` — these are the real `CRUISER_SUBSYSTEMS` positions and the trunk aims
at them. It is only *drawn* where the hull is already open: the dorsal cutaway at
z ≈ −392, the salvage bay throat, the drive well, the port rib section, the flank gap in
the armour belt. Elsewhere it is invisible and costs nothing — but it still exists in the
data, because it is what tells `adaptStations` to lift the deck line over its route
(§3.8). A trunk you cannot see still changes the ship's back.

### 3.4 `step` — the plating discontinuity

*Belt breaks around a casemate, coamings, splinter screens, deck edge changes.*

This is the glue primitive and the one that does the most for the "built for it" read per
triangle. Its main job is **re-parameterising the flank belt**, which is a data change:

```js
// today, cruiser.js:
G.armourBelt({ length: 640, height: 54, thickness: 12, plates: 2, gap: 74, chamfer: 8 })
//   -> 640 m of unbroken belt running straight through BOTH sponson stations.

// proposed: armourBelt() gains `cuts`, a list of [z0, z1] spans in belt-local metres
//   where the belt is absent. adapt.js supplies one cut per blister on that flank.
G.armourBelt({ length: 640, ..., cuts: [[124, 216]] })
```

That is ~15 lines in `greeble.js` and it is the single highest-value change in this
document, because the port sponson band (z +60…+200) sits **inside** the belt's current
z −400…+240 run. Cost: a 2-plate belt is 24 tris; a 3-plate belt is 36. **+12 triangles
buys the entire casemate read on that flank.**

Other `step` builds: a coaming ring (`ringFace` + short wall) at **16 tris**; a raised
sill (`panelledSlab`) at **12**.

### 3.5 `vane` — a plate on a root fairing

*Radiator banks, blast baffles, antenna spars, splinter shields.*

| build | tris |
|---|---|
| `G.radiatorFin({chord, span, thickness, sweep, tipChord, rim})` | **28** (LOD1: 20) |
| same without `rim` | **12** |
| root fairing, `G.panelledSlab` | **12** |

**Rules.** Never a bare plate: "a fin that grows straight out of a flat is a decal, a fin
that grows out of a housing is hardware" (cruiser.js, `buildStern`). Sizes within a bank
must differ by ≥ 1.4× — the hull's existing bank is 200 / 140 / 92 m for exactly this
reason. Vanes on the `radiator` surface only when they are heat rejection; a blast baffle
is `plating`, because a heat-rejection panel is not armour and the material must not lie
about which it is.

### 3.6 `hatch` — access, and it is orange

*Service doors, loading hatches, magazine access, umbilical panels.*

| build | tris |
|---|---|
| `G.blastDoor({width, height, depth, seam:false})` | **24** |
| plain coaming + door, `prism` + `panelledSlab` | **12** |

Carries the **orange** half of the semantic colour rule (§4.3). LOD0 only.

### 3.7 `lens` — sensors and emitters, and it is white

*Directors, illuminators, rangefinders, seeker windows, bay floodlights.*

Built as a `glowQuad` / `glowDisc` into the **existing** `engineGlow#raw` bucket:
**2 tris** for a quad, 8 for a disc, and **zero new draw calls** because that bucket
already exists at LOD0 and LOD1.

Carries the **white** half of the semantic colour rule. Requires one addition to
`art/materials/index.js`: an `emissive`/`engineGlow` variant tinted with
`palette.marking.sensor` (0xe9e3d6) rather than the amber `emissive` (0xff9126). That is
a material *variant*, not a new key — the registry already quantises and shares — but it
does cost one extra draw at LOD0 if a fit uses both amber and white on the hull. Budget
for it in §5.4.

### 3.8 The `lift` field — the silhouette half

Every need may carry `lift`, in metres, which is not geometry at all. It is a signed
delta applied to the `top` (or `bottom`, for ventral mounts) column of the station table
over the mount's band, tapered to zero over 80 m at each end so the deck line stays fair.

This is where the ship's shape actually changes, and it is the only part of an adaptation
that survives to LOD2. Examples, all free:

| adaptation | table edit | what you see at 14 km |
|---|---|---|
| heavy broadside, port | `top += 18` over z +40…+220 | the port deck edge lifts; the sheer gains a shoulder |
| spinal lance, bow | `top -= 10, bottom -= 26` over z +380…+700 | the forefoot deepens; the prow gets heavier under the axis, reinforcing R2.5 |
| heavy drive, engine | `bottom -= 22, top += 12` over z −700…−540 | the stern block visibly grows |
| hangar deck, ventral | `bottom -= 30` over z −120…+140 | the keel drops; the bay throat gets taller |

**Constraint.** `adaptStations` must re-run the R2.1–R2.5 checks after editing and throw
in dev builds if any fails. Since `deckHalf` is frozen, R2.1/R2.2/R2.3 are safe by
construction; R2.4 (prow convergence ≥ 90 m over the forward 200 m, deck-to-keel fall
ratio ≥ 1.6 : 1) and R2.5 (tip centre ≥ 14 m below the axis) are the two a bow adaptation
can genuinely break, so those two are asserted. That assertion belongs in
`tools/silhouette.mjs` and in `probes/cruiser.js`, run over the full loadout matrix.

### 3.9 The vocabulary is small on purpose

Seven primitives, shared across weapons and non-weapons, is the entire point. A broadside
battery and a hangar deck use the *same* `port`, the *same* `step`, the *same* `trunk`.
That is what makes mismatched salvage read as intentional: the ship has one way of
opening a hole, one way of breaking a belt, one way of running structure inward, and it
applies it to everything regardless of who built the thing that needed it.

The failure mode to guard against is the one `cruiser.js` already learned the hard way
with five identical radiator fins — "a repeated element the eye can count adds nothing
after the second one". A closed vocabulary applied *identically* six times is a picket
fence. So the vocabulary is closed **and** every instance is varied by the hull: size,
spacing, count and rake all jittered deterministically per station.

---

## 4. Cohesion rules

Six rules. Each is checkable, and each names what it protects against.

### 4.1 One authority owns the joint

The hull generates all adaptation geometry. `ModuleBuilder.graft()` is **deleted** and
its work — cut plate, bolt ring, weld beads — moves into `adapt.js` as the default
`step` every occupied mount gets. Modules stop authoring the joint entirely.

*Protects against:* the parts-bin failure mode (§1.2), twenty-four dialects of weld.
*Bonus:* 60 triangles per module reclaimed, and up to two draw calls per module where the
graft was the only user of that module's `dark` or `trim` surface (§5.2).

### 4.2 Adaptation is never mirrored

Module *bodies* are mirrored port↔starboard by `mirrorX()` and that stays. Adaptation is
**generated per station from that station's own section** and must never be mirrored,
because the two sponsons are deliberately at different z: port owns z +60…+200,
starboard z −60…+80.

Computed from `HULL_STATIONS`, the two stations are genuinely different ships' worth of
different:

| | port, z = +130 | starboard, z = +10 |
|---|---|---|
| deck half-beam | 125.3 m | 132.9 m |
| deck height | +65.6 m | +68.8 m |
| keel ratio (tumblehome) | 0.804 | 0.786 |

So **fitting the same battery to both sponsons produces two visibly different casemates
for free** — different width, different flank rake, different belt cut. That is the
strongest single anti-symmetry result in this spec and it costs nothing, because
`sectionAt()` already exists.

*Protects against:* "mirror-matched greeble is the strongest single tell of procedural
placement, and a hull that is bilaterally symmetric cannot read as repaired"
(`cruiser.js`, §SURFACE).

### 4.3 The semantic colour rule, applied where it means something

Copied verbatim from Falling Frontier, per `closest-comparables.md` §3.6 and Tier-1
recommendation 4:

> **White = sensors. Orange = maintenance and access.**

The colours already exist in `palette.js` (`marking.sensor = 0xe9e3d6`,
`marking.hazardA = 0xc4671b`) and are already documented with that intent. What is
missing is the semantics: today the only consumer is `hullMaps.js:781`, which stamps a
hazard patch onto a random panel-field leaf at tier ≥ 2.

Adaptation fixes this because adaptation is the only system that knows where the access
points are. Concretely:

- **`hatch` is the only geometry on the ship allowed to carry access orange**, and it is
  placed at real access points: the magazine door at the foot of a trunk, the umbilical
  panel beside a drive, the loading hatch on a missile blister.
- **`lens` is the only geometry allowed to carry sensor white**, and it is placed at real
  apertures: directors, illuminators, seeker windows.
- The existing random hazard stamp in `hullMaps.js` should be **removed or dropped to
  tier 3**, so orange on this ship means one thing. A colour that appears both
  semantically and decoratively is not a semantic colour.

*Protects against:* the cheapest legibility win available at tactical zoom going unspent,
and against orange meaning nothing.

### 4.4 The greeble kit is the only source of form

Every adaptation primitive in §3 is a call into `greeble.js`. `adapt.js` may compose and
place them; it may not author vertices. If an adaptation needs a shape the kit does not
have, the shape is added *to the kit* — where the hull, the faction ships and the modules
all get it — and never to `adapt.js`.

*Protects against:* a second detail vocabulary growing inside the adaptation system,
which is the same failure as §4.1 wearing a different hat.

### 4.5 No new surfaces, no new materials, no new maps

An adaptation may use only `hull`, `plating`, `greeble`, `radiator` and the raw
`engineGlow` bucket — the surfaces the cruiser already draws. It may not introduce a
material key and **may not trigger a texture bake**. The hull maps are procedural canvas
bakes (`art/textures/hullMaps.js`) costing tens of milliseconds; a refit that re-baked
one would hitch visibly and §7 would be unachievable.

*Protects against:* the draw-call ceiling (already breached at 499 measured against 320)
and the live-refit hitch.

### 4.6 Hard edges and the 60/30/10 discipline hold

Adaptation geometry passes through `normalizeAttrs()` like everything else: non-indexed,
per-face normals, hard edges. And it obeys the hull's own rule about *where* dense detail
is allowed — a joint between two masses, a recess deeper than 8 m, machinery, or
functional edge structure. An adaptation is by definition one of the first three, so it
qualifies; but the corollary bites: **adaptation may not place detail on the calm
reserve.** The two 640 m flank belts, the dorsal armour spine, the foredeck and the
forward 200 m stay calm except where a mount actually is.

The bow mount at z = +420 sits inside the forward-200 m calm zone's neighbour. A bow
adaptation is therefore allowed exactly one aperture (the muzzle) and one trunk, and no
hatches, lenses or vanes forward of z = +500. *"The prow's job is convergence and detail
there fights it."*

---

## 5. Budget compliance, in numbers

### 5.1 Where we actually are (measured, 2026-07-29)

Built via `hullParts({rng, lod})` and counted with `G.triCount`:

| LOD | bucket tris | running lights | **total** | merged draws |
|---|---|---|---|---|
| 0 | 1869 | 70 × 2 = 140 | **2009** | **10** |
| 1 | 1374 | 140 | **1514** | **6** |
| 2 | 214 | 0 | **214** | **2** |

`BUDGET.cruiserCoreTris` is 2000. **The bare hull is already 9 triangles over**, and the
LOD0/LOD1/LOD2 draw counts are 10/6/2 where the file header claims 9/5/1. See §11.

The benchmark measures **499 draws against a ceiling of 320**, with the camera at 7.2 km
— which is **LOD1**. That is the single most useful fact in this section: *the budget
that is failing is the LOD1 budget.* Spend at LOD0 if you must spend at all.

### 5.2 How adaptation is funded

Two sources, both measured:

| source | per mount | six mounts |
|---|---|---|
| empty-mount furniture deleted when a mount is occupied (`mountPad` 13 + `dockingCollar` 16) | **29** (engine: 32) | **174** |
| `ModuleBuilder.graft()` removed from the module (cut plate 20 + collar 24 + 2 beads 16) | **60** | **360** |
| | | **534 triangles freed** |

So `BUDGET.hullAdaptTris = 90` per mount — 540 triangles at a full fit — is funded almost
exactly, and the module budget drops from 400 to **340**.

### 5.3 The arithmetic on a fully fitted hull

| | today | with adaptation |
|---|---|---|
| hull LOD0 | 2009 | 2009 − 174 (furniture) + 540 (adaptation) = **2375** |
| six modules | 6 × 400 = 2400 | 6 × 340 = **2040** |
| **whole ship** | **4409** | **4415** |

**Net: +6 triangles on a fully fitted cruiser**, against a scene budget of 1 900 000. The
new `BUDGET.cruiserFittedTris = 2400` has 25 triangles of headroom over the worst case.

### 5.4 Draw calls

**Zero added**, because §4.5 confines adaptation to buckets that already exist. All six
mounts' adaptation geometry merges into `core/hull`, `core/plating`, `core/greeble`,
`core/engineGlow#raw` and — for the engine mount only — the `engine/*` pair.

Two possible additions, both optional and both LOD0-only:

- **the white sensor emissive** (§3.7). If a fit uses both amber and white on the hull,
  that is one extra merged mesh: **+1 draw at LOD0, 0 at LOD1, 0 at LOD2.**
- **a `decal` mesh** for stencilled markings around apertures, using the existing
  `materials.get('decal')` key and the 4×4 atlas in `textures/decals.js`:
  **+1 draw at LOD0 only.** Recommended, because the semantic colour rule pays for
  itself, and because LOD0 is 0–4.2 km and is not the range the benchmark fails at.

Against those, adaptation is **draw-negative on the module side**: removing `graft()`
removes the `dark` and `trim` surfaces from every module where the graft was their only
user, at up to −2 draws per module. `auditModules()` in `modules/index.js` should report
that number before and after; the expected win is between −6 and −12 draws at LOD0.

### 5.5 What one adaptation actually costs — worked example

**Heavy Broadside, port sponson.** Declaration:

```js
adapt: {
  triBudget: 90,
  silhouetteM: 30,
  needs: [
    { kind: 'blister', sizeM: 92, runM: 160, lift: 18 },              // the casemate
    { kind: 'port',    count: 3, sizeM: 26, depthM: 18, runM: 140 },  // gun ports
    { kind: 'step',    sizeM: 92, runM: 160 },                        // belt breaks around it
    { kind: 'trunk',   sizeM: 22, depthM: 130, service: 'magazine' }, // the hoist
    { kind: 'hatch',   sizeM: 14 },                                   // magazine access, orange
    { kind: 'lens',    sizeM: 6 },                                    // the director, white
  ],
}
```

| element | build | tris |
|---|---|---|
| casemate blister | `panelledSlab` chamfered, sunk 1/3 into the flank | 28 |
| 3 gun ports | `aperture()` 4-sided, sizes jittered ±10% | 3 × 16 = 48 |
| belt break | `armourBelt` 2 plates → 3 | +12 |
| magazine trunk | `panelledSlab` aimed at the reactor, drawn only in the belt gap | 12 |
| access hatch | plain coaming + door | 12 |
| director lens | `glowQuad` into `engineGlow#raw` | 2 |
| **subtotal** | | **114** |
| less: empty-mount furniture no longer drawn | | −29 |
| **net on the hull** | | **85** ✔ under 90 |
| deck lift +18 m over z +40…+220 | station table | **0** |

And LOD1: ports drop their tunnels (8 tris each), the hatch and lens drop entirely, the
blister and belt survive. 28 + 24 + 12 + 12 = **76**, less 29 furniture = **47**. Slightly
over `hullAdaptTrisLod1 = 40`, so the LOD1 rule drops to **two** ports: **39** ✔.

---

## 6. LOD and silhouette

### 6.1 The three-tier rule

| LOD | range | m/px | what an adaptation contributes |
|---|---|---|---|
| 0 | 0–4.2 km | ∞ → 4.0 | everything in §3 |
| 1 | 4.2–14 km | 4.0 → 13.2 | station edits + features ≥ 12 m; ports lose their tunnels; hatches, lenses, weld beads and coamings drop |
| 2 | 14–46 km | 13.2 → 43.4 | **station edits only**, plus at most two mass proxies (§6.3) |

The 12 m floor at LOD1 is not new — it is `ship-language.md` §7's existing LOD table. Each
adaptation primitive declares its governing dimension, and `adapt.js` drops it when
`sizeM < 3 × metresPerPixel` at that LOD's near switch distance.

### 6.2 Why adaptations survive LOD reduction: they are in the table

This is the load-bearing idea and it is worth stating flatly.

LOD1 and LOD2 are not separate models. They are `pick(HULL_STATIONS, [...])` — literally
the same rows, thinned by hand. So **any edit to the station table appears at every LOD
automatically, in exactly the right proportion, with no possibility of the levels
disagreeing.** A heavy drive that deepens the stern block deepens it at 30 px just as it
does at 3000 px, because it is the same eight numbers.

That is a categorical guarantee, not a discipline anyone has to maintain. It is why §3.8
insists that the silhouette half of every adaptation be a `lift`, and why a module that
declares six needs and no `lift` should be treated as a smell — it has changed the hull's
detail without changing its shape, which is decoration.

### 6.3 LOD2, precisely

LOD2 is 214 triangles and "the 30 pixel read". Adaptation gets almost none of it:

- **Station edits: unlimited, free.** They are already in the loft.
- **Mass proxies: at most two per hull, 12 triangles each, 24 total (11% of LOD2).**
  A mount qualifies for a proxy only if its adaptation moves the measured outline by
  **≥ 45 m** — one pixel at max zoom, and the same threshold `kit.js#MODULE_DIVERGENCE`
  already uses. If more than two qualify, the two with the largest measured change win,
  ties broken by hardpoint order. Deterministic, so a seed reproduces.
- **Nothing else.** No ports, no hatches, no lenses, no vanes. At 43 m/px a 26 m gun port
  is 0.6 px.

### 6.4 The silhouette audit must not regress, and here is how it is held

`tools/silhouette.mjs` already measures the two things that matter and both must be run
over the **loadout matrix**, not just the bare hull:

- **Connected components** in three orthographic views, with `MIN_FRAGMENT = 0.0015` of
  silhouette area. Adaptation is *generated on the skin from `sectionAt()`* and sunk ≥ 1/3
  of its depth into the loft, so it cannot float — but the audit is what proves it, and
  it is the audit that found the floating-slab defects last time.
- **LOD IoU against LOD0**, floor 0.72. Because LOD2's shape is a `pick()` of the adapted
  table, the IoU is structurally protected. The failure mode to watch is the opposite one:
  a `lift` large enough that LOD0's *added geometry* diverges from LOD2's *table-only*
  read. That is what the 45 m proxy threshold in §6.3 exists to catch.

Three checks to add, all in `tools/silhouette.mjs` and `probes/cruiser.js`:

1. **R2.4 / R2.5 assertion after `adaptStations`**, over every fit that touches the bow.
2. **Adaptation divergence.** `getSilhouetteSignature` before and after adaptation on the
   same fit; report mean and peak change. A module whose `adapt.silhouetteM` claim
   exceeds the measured value by more than 20% fails the audit. The refit screen quotes
   that claim to the player (§7.3), so it must be true.
3. **`hullAdaptTris` per mount**, asserted from `adaptationParts`' returned `tris`.

---

## 7. Live refit

### 7.1 Measured cost of regeneration

All timings on the dev container, warm (post-JIT), pure geometry with no materials:

| operation | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| `hullParts()` generation | 11.46 ms | 3.69 ms | 0.73 ms |
| merge, all buckets | 2.99 ms | ~2.5 ms | ~0.2 ms |
| **full rebuild, one LOD** | **~14.5 ms** | ~6 ms | ~0.9 ms |
| **full rebuild, all three LODs** | | **~21 ms** | |

Cold (first build of the session, before JIT) it is roughly 35–40 ms. A full rebuild is
therefore **one to two dropped frames** — noticeable, and not acceptable for a screen
where the player is clicking modules on and off.

### 7.2 So: cache the invariant half. No bake step.

**Adaptation is cheap enough to run on install, and does not need a bake step.** The
mechanism:

```js
/**
 * `buildCruiser` stores, per LOD, the placed geometries of everything that CANNOT
 * change with a fit — the bay, the yoke, the stern, the bridge, the sponsons, the
 * bolted-on salvage. Only three things vary: the spine loft (because the station table
 * moved), the flank belts (because a step may cut them), and the adaptation parts
 * themselves.
 */
hullResult._bare = [ /* per lod: Map<bucketKey, placedParts[]> */ ];

/**
 * Re-skin the hull for a new fit, in place. Replaces geometry on the existing meshes;
 * does not touch materials, does not create meshes, does not add draw calls.
 */
export function reskinHull(hullResult, fit) { /* ... */ }
```

Costs, measured against the same numbers:

| step | cost |
|---|---|
| `adaptStations()` — eight-number table, six mounts | < 0.05 ms |
| regenerate the spine loft (7 parts, 412 tris) | ~0.4 ms |
| regenerate the flank belts | ~0.05 ms |
| generate adaptation parts, six mounts, ~10 primitives each | ~0.3 ms |
| re-merge touched buckets: `core/hull` 0.33 + `core/plating` 0.59 + `core/greeble` 0.42 + `core/engineGlow#raw` 1.06 | 2.40 ms |
| **LOD0 total** | **~3.2 ms** |
| LOD1 (same shape, fewer parts) | ~2.0 ms |
| LOD2 (`core/hull` only) | ~0.3 ms |
| **all three LODs** | **~5.5 ms** |
| GPU re-upload, ~2400 tris × 3 LODs ≈ 700 KB | sub-ms |
| `getSilhouetteSignature` (one pass over ~4k verts, already called on install) | ~1 ms |

**Under 7 ms.** Inside one 16.7 ms frame, so `RefitSystem.install()` can call it
synchronously and keep the promise its own comment makes: *"The model updates in the same
call — a refit screen that shows the change a frame later than the click reads as
broken."*

One optimisation is worth doing at the same time, because it is over a third of the cost:
`core/engineGlow#raw` merges **17 parts for 58 triangles in 1.06 ms**, which is
disproportionate — the raw path re-normalises indexed `CircleGeometry`/`PlaneGeometry`
per part. Caching that bucket's bare merge and merging only `[cachedGlow, adaptGlow]`
drops it to ~0.1 ms and takes the LOD0 reskin to **~2.3 ms**.

### 7.3 What this means for the refit screen

- **Anchorage refit** (`look-target.md` §2): full adaptation, applied synchronously on
  every install/uninstall/swap. The screen already renders the live `world.hullResult`
  and already measures the outline (`ui/refit.js:314`), so adaptation shows up for free
  in the preview and in the "this module changes your outline HERE" readout.
- **Add the claim to the module card.** `adapt.silhouetteM` and the list of `needs`
  translate directly into one line of player-facing text: *"Opens three gun ports and a
  magazine trunk in your port flank. +30 m beam."* That is the "can the player see it"
  question from `scope-decision.md` answered before the player commits, not after.
- **Field hot-swap** is deliberately worse and has `installTime = 2.5 s` declared and
  never consumed (`sim/refit.js:82`). That 2.5 s is where the adaptation **forms**: run
  one stage per frame across the weld — coamings first, then the belt cut, then the ports
  opening, then the trunk. It costs the same total work spread over 150 frames, it makes
  the field weld feel like work, and it visibly distinguishes a field weld from a yard
  weld, which is exactly what the condition penalty is trying to say in numbers.
- **Crippling** (`look-target.md` §3): a breached hardpoint ejects its module intact, so
  its adaptation must revert to the empty-mount furniture. That is the same `reskinHull`
  call with the mount removed from `fit`, and it means **a crippled hull visibly loses its
  gun ports** — the flank closes back up to bare plating, the belt runs unbroken again.
  Going back for your own guns now has a visual before-and-after that costs nothing.

### 7.4 What must never happen on install

- No texture bake. §4.5.
- No new material key. §4.5.
- No mesh creation or destruction — replace `mesh.geometry`, dispose the old one.
- No LOD level rebuild. The `THREE.LOD` node and its three level groups persist.
- No socket disturbance. Sockets hang off `root`, not off a level, precisely so modules
  survive an LOD switch; adaptation must not change that.

---

## 8. The same treatment for non-weapons

The owner's closing point. Same seven primitives, same budget, same rules.

| mount | class | adaptation the hull grows | primitives | what the player sees |
|---|---|---|---|---|
| **engine** | heavy drive | stern block deepens (`bottom −22`, `top +12` over z −700…−540); two bell throats cut into the transom around the well; a radiator vane added to the bank; coolant plumbing along the pylons | `port` ×2, `vane`, `trunk`(coolant), `step`, `lift` | the aft third gets visibly heavier; the empty drive well stops being empty |
| **engine** | jump ring | the transom's octagonal well rim gains a stepped collar; the ring's field structure trunks forward into the reactor | `step`, `trunk`(reactor), `lens` | the transom reads as a machine, not a hole |
| **engine** | fusion core | a reactor blister on the stern block; **two** radiator vanes added, both larger than the existing three, so the bank re-ranks; access hatches at the roots | `blister`, `vane` ×2, `hatch`, `lift` | the radiator bank changes shape — the single most visible non-weapon change on the ship |
| **dorsal** | sensor mast | the armour spine gains a housing under the mast foot; the mast's stays trunk down into the spine; white lenses on the array faces | `blister`, `trunk`(sensor), `lens` ×2 | the tallest thing on the ship gets a foot instead of standing on a plate |
| **dorsal** | shield pylons | the spine's dorsal cutaway ribs gain cross-bracing; emitter apertures along the spine top | `port` ×3, `trunk`(reactor), `step` | the exposed frames over the waist get *used* |
| **ventral** | hangar deck | the salvage bay throat opens **aft and down**: keel drops 30 m, the bay mouth widens, the reactor bulkhead gains a personnel hatch and floodlight lenses | `port`(large), `step`, `hatch`, `lens` ×2, `lift` | the bay throat — the ship's one unique silhouette feature — visibly becomes a hangar |
| **ventral** | cargo frame | the bay's five frames gain a sixth; the tow track lengthens; container lock hatches down the rails | `step`, `trunk`(hold), `hatch` ×2 | the salvager identity gets *more* salvager |
| **ventral** | tractor | emitter aperture in the bay roof; power trunk to the reactor | `port`, `trunk`(reactor), `lens` | |
| **bow** | spinal lance | **the recoil structure.** A trunk running 260 m back into the spine from the stem, visible where the foredeck plating is absent; a muzzle ring that is part of the bow; the forefoot deepens (`bottom −26` over z +380…+700) | `port`(6-sided muzzle), `trunk`(reactor), `blister`, `step`, `lift` | the prow becomes a gun barrel's front end rather than a chisel with a gun on it — the single most dramatic adaptation in the game |
| **bow** | torpedo tubes | three tube mouths in the forefoot below the chine, loading hatches behind them | `port` ×3, `trunk`(magazine), `hatch` | |
| **port / starboard** | broadside battery | §5.5 | | |
| **port / starboard** | gauss outrigger | a high blister on the sponson shelf, capacitor trunk to the reactor, belt cut, one large rail aperture | `blister`, `port`, `trunk`(reactor), `step`, `lift +26` | the deck edge lifts noticeably on that side only |

### 8.1 The four-question test (`scope-decision.md`)

Adaptation is a *visual* system, so it must still answer all four.

1. **What decision does it create?** Adaptation makes the loadout **legible from
   outside**, which turns the refit screen's abstract stat comparison into a shape the
   player recognises in combat. Concretely it creates the decision the `sortie-loop.md`
   commitment needs: *what do I want this ship to look like it is for*, because you will
   be living with the flank you opened until the next anchorage. It also creates a real
   tactical decision via the crippling loop — a hull whose gun ports have closed up is
   visibly disarmed, to you and to anyone who finds it.
2. **What does it interlock with?** The refit system (`sim/refit.js`), the crippling
   handler (`look-target.md` §3), the field-swap `installTime`, the silhouette audit, the
   damage model (an adaptation is *where* the module's sub-parts physically are, so
   `subparts.js`' aim points can move onto it), and the semantic colour rule.
3. **What does it abstract?** Deliberately not simulated: internal volume, magazine
   capacity as a spatial quantity, structural load, where the trunk *actually* runs
   between its two endpoints, and anything below 12 m at range. The trunk is the *claim*
   that a path exists; the game never checks it. That is the right line because the read
   is entirely about the visible top and bottom of the path, and simulating the middle
   would cost triangles inside a closed hull where nobody can see them.
4. **Can the player see it?** That is the entire feature. And it is measurable: the refit
   screen quotes `adapt.silhouetteM`, and the audit fails a module that lies about it.

---

## 9. What this does NOT do

Recorded so scope does not creep.

- It does not adapt the **faction hulls** (`art/geometry/ships/`). They are not
  player-configurable and their fits are fixed at build time. If they ever need it,
  `adapt.js` is hull-agnostic apart from the service anchor list, but that is not this
  work.
- It does not change **firing behaviour**. The ripple, the cooldown, the committed
  broadside — that is the other half of `armament-brief.md` and it belongs to the combat
  stream. Adaptation should be built so the ripple has ports to come out of, and the
  `port` positions returned by `adaptationParts` should be published on the hull result
  as muzzle anchors for `vfx/weapons.js`. That handshake is one field; it is not a
  dependency in either direction.
- It does not touch **lighting or post**, per `look-target.md` §1.
- It adds no crew, no officers, no personnel (`scope-decision.md`).

---

## 10. Implementation plan

Priority order. "Cost" is an estimate of new/changed lines plus the audit work, on the
assumption the person doing it has read this document.

| # | Item | File that owns it | Cost | Why this order |
|---|---|---|---|---|
| 1 | **`adaptStations()` + the `lift` field.** The station-table edit, R2.4/R2.5 assertions, and `hullParts({fit})` threading. No new geometry at all. | `src/art/geometry/adapt.js` (new), `src/art/geometry/cruiser.js` | ~180 lines | This alone delivers §6 — the silhouette changes at every LOD, for zero triangles and zero draws. It is the highest value-per-line item in the document and it can ship before any primitive exists. |
| 2 | **The contract.** `ADAPT_KINDS`, `AdaptNeed`, `AdaptationDecl`, validator, budget lines. | `src/core/contracts.js`, `src/core/units.js` | ~90 lines | Nothing else can be written against a contract that does not exist, and the "weapon with no trunk" throw is what enforces §1.1 forever. |
| 3 | **`G.aperture()` and `armourBelt({cuts})`.** The two kit additions §3 depends on. | `src/art/geometry/greeble.js` | ~55 lines | `cuts` is the "plating steps around it" mechanism and is 12 triangles for the whole casemate read. `aperture()` saves 8 tris per port over `recess()`. |
| 4 | **`adaptationParts()` — the seven primitives.** Placement from `sectionAt`/`chineAt`, deterministic jitter, the ≥1/3-buried and never-coplanar rules, per-LOD dropping, returned tri count. | `src/art/geometry/adapt.js` | ~320 lines | The body of the feature. Depends on 1–3. |
| 5 | **Empty-mount replacement + `graft()` removal.** Occupied mounts stop drawing furniture; `ModuleBuilder.graft()` deleted and its 24 call sites removed; module `triBudget` drops to 340. | `src/art/geometry/cruiser.js`, `src/art/geometry/modules/kit.js`, `modules/*.js` | ~60 lines changed, 24 call sites | This is what pays for items 1–4. Do it in the same PR as 4 so the budget never goes red. Expect −6 to −12 draws. |
| 6 | **`reskinHull()` + the bare-part cache.** In-place geometry replacement, bounds and signature recompute, the `engineGlow` merge fix. | `src/art/geometry/cruiser.js` | ~130 lines | Turns a 21 ms rebuild into a 2.3 ms one and makes §7 true. |
| 7 | **Refit wiring.** `RefitSystem.install/uninstall` call `reskinHull`; crippling reverts a breached mount; the field swap stages the weld over `installTime`. | `src/sim/refit.js` | ~40 lines | Small, and it is where the player actually meets the feature. |
| 8 | **Audit extensions.** Per-mount `hullAdaptTris` assertion; `adapt.silhouetteM` truth check; R2.4/R2.5 over the loadout matrix; connected-components and LOD-IoU run over fits, not just the bare hull. | `tools/silhouette.mjs`, `src/probes/cruiser.js`, `src/art/geometry/modules/index.js` | ~150 lines | Without this the budgets are aspirations. Note the existing audits already have the machinery; this is mostly widening their input set. |
| 9 | **Declarations for all 24 modules.** One `adapt` block each, ~8 lines. | `src/art/geometry/modules/{bow,dorsal,ventral,broadside,engine}.js` | ~200 lines total | Mechanical once 1–8 land. Do the port broadside and the bow lance first — they are the two the brief names and the two with the most dramatic result. |
| 10 | **The semantic colour rule.** White emissive variant for `lens`; orange restricted to `hatch`; remove or demote the random hazard stamp in `hullMaps.js:781`. | `src/art/materials/index.js`, `src/art/textures/hullMaps.js` | ~50 lines | Last because it is orthogonal, and because it should be judged on a hull that already has real access points to mark. |
| 11 | **Muzzle-anchor handshake.** Publish `port` positions from `adaptationParts` onto the hull result so the ripple's flashes come out of the actual gun ports. | `src/art/geometry/adapt.js`, `src/vfx/weapons.js` | ~30 lines | The payoff. A broadside ripple whose flashes emerge from ports the hull grew for it is the entire brief in one shot, and it is thirty lines once everything above exists. |

**Suggested first slice** (items 1, 2, 3, 5 for the port sponson only): the flank deck
line lifts, the armour belt breaks around the casemate, and it is visible at 14 km. That
is a demonstrable result in one sitting and it validates the whole approach before item 4
gets written.

---

## 11. Defects found while measuring

Reported, not fixed — this stream is documentation-only and two other workflows are in
the tree.

1. **`BUDGET.cruiserCoreTris` is breached.** Measured LOD0 total is **2009** triangles
   (1869 in buckets + 140 in running lights) against a ceiling of 2000. The `cruiser.js`
   header claims 1989. The likely cause is the window-band pane change recorded in that
   same header as "+32 triangles"; the header's total was not re-measured after it.
   *This must be resolved before adaptation lands*, because §5 spends the headroom.
2. **Draw counts in the `cruiser.js` header are one low at every LOD.** Measured merged
   draws are **10 / 6 / 2** at LOD0 / LOD1 / LOD2; the header claims 9 / 5 / 1. The
   `engineGlow#raw` bucket is the uncounted one — it exists at LOD0 and LOD1 and is not
   in the "THREE surfaces" tally.
3. **`core/engineGlow#raw` merges 17 parts for 58 triangles in 1.06 ms**, roughly a third
   of the hull's entire merge cost. The raw path re-normalises indexed
   `CircleGeometry`/`PlaneGeometry` per part. Cheap to fix and item 6 above depends on it.
4. **The semantic colour rule is declared in `palette.js` and applied nowhere
   semantically.** `marking.hazardA` is documented as "access orange on every faction"
   and `marking.sensor` as "bone-white, for arrays and apertures", but the only consumer
   is `hullMaps.js:781`, which stamps a hazard patch at 30% alpha onto a random leaf of
   the panel field at tier ≥ 2. That is decoration wearing a semantic colour, and it will
   actively undermine §4.3 until it is removed or demoted.
5. **`ModuleBuilder.graft()` is the module authoring the joint** (§1.2, §4.1). It is good
   work and it was the right answer before the hull could respond; it is now the main
   structural obstacle to coherence, and it is also 60 triangles × 24 modules of budget
   sitting in the wrong place.

---

## Sources

- [Barbette — Wikipedia](https://en.wikipedia.org/wiki/Barbette)
- [Main Battery Turret — GlobalSecurity.org](https://www.globalsecurity.org/military/systems/ship/turrets.htm)
- [Casemate ironclad — Wikipedia](https://en.wikipedia.org/wiki/Casemate_ironclad)
- [Turret ship — Wikipedia](https://en.wikipedia.org/wiki/Turret_ship)
- [The Shipyard: Weapon Hardpoints — Roberts Space Industries](https://robertsspaceindustries.com/en/comm-link/engineering/16181-The-Shipyard-Weapon-Hardpoints)
- [Design Notes: Weapons Mount Updates — Roberts Space Industries](https://robertsspaceindustries.com/en/comm-link/transmission/14570-Design-Weapons-Mount-Updates)
- [Weapon hardpoints — Star Citizen Wiki](https://starcitizen.tools/Ship_components)
- [Stunning space RTS Falling Frontier shows off its ship designer — PCGamesN](https://www.pcgamesn.com/falling-frontier/ship-builder)
- [Falling Frontier — Ship Components, Official Wiki](https://wiki.hoodedhorse.com/Falling_Frontier/Ship_Components)
- [From the Sketchbook to the Stars: The Art of Homeworld 3 — Aftermath](https://aftermath.site/homeworld-3-concept-art-making-of/)
- [How do you make nice looking creations? — From The Depths, Steam Community](https://steamcommunity.com/app/268650/discussions/0/528398719800148070/)
- [Avorion — Steam store page](https://store.steampowered.com/app/445220/Avorion/)
- Falling Frontier November 2025 developer diary, quoted at length in this repository's own `docs/design/closest-comparables.md` §3.6 and Tier-1 recommendation 4.
