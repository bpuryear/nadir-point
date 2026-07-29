# Nadir Point — full audit

**Author:** independent reviewer. I did not build any of this and have no stake in defending it.
**Date:** pass 9.
**Scope:** the whole game — graphics, ships, modules, mechanics, systems, travel, UI, scale, and
what is absent.

---

## 0. Method, and one caveat

What I did:

- Ran `npm run capture -- --out docs/review/audit --width 1280 --height 720`. Under SwiftShader it
  completed `close` and `three-quarter` in eight minutes, then was killed at a 9.5-minute timeout
  while still on `wide`. **The capture harness cannot produce its own committed shot list in this
  environment** — which means no review pass since the shot list was written has ever seen `wide`,
  `cinematic` and `engagement` from the current build. That is itself a finding, and it is why the
  Scale row in `acceptance.md` has read UNVERIFIED for three passes. For the framings I could not
  reach I used
  the most recent committed captures — `docs/review/look-surface/*` (19:29–19:32, current) and
  `docs/review/look3/*` (04:43, pre-lighting-fix, flagged as such wherever I lean on it).
- Read every PNG in `docs/probes/` (45 images) and every PNG in `docs/review/`.
- Read the simulation, world, UI, input, camera and VFX source rather than only the pixels.
- Read `ARCHITECTURE.md`, `docs/design/controls.md`, `docs/design/ship-language.md`,
  `docs/design/scope-decision.md`, `docs/design/integration-decisions.md`,
  `docs/design/reference-ui-language.md`, `docs/review/acceptance.md`, `docs/review/defects.md`,
  `docs/review/benchmark.md`.

**The headline of this audit is not a graphics finding.** The graphics are the most finished part
of the project. The headline is that a large fraction of the systems this repository has built,
documented, measured and celebrated **cannot be reached by a player**, and the ones that can be
reached do not, on a fresh boot, constitute a game. I will justify that in §4 and §9 and I will not
soften it, because two review passes have now been spent arguing about the value curve on a hull
while the ship has had no weapons on it the entire time.

### Severity key

- **CRITICAL** — breaks the experience. The player either cannot do the thing, or the thing is
  actively misleading.
- **MAJOR** — visibly short of AAA. A reviewer would name it in a paragraph.
- **MINOR** — polish. Real, worth fixing, not load-bearing.

### Count

| | CRITICAL | MAJOR | MINOR |
|---|---|---|---|
| 1 Graphics | 2 | 7 | 5 |
| 2 Ship design | 1 | 5 | 3 |
| 3 Modular system | 3 | 4 | 2 |
| 4 Mechanics | 4 | 3 | 2 |
| 5 Subsystems | 4 | 3 | 1 |
| 6 Travel | 1 | 2 | 1 |
| 7 UI / UX / controls | 3 | 8 | 4 |
| 8 Scale | 1 | 4 | 2 |
| 9 Missing | 5 | 4 | — |
| **Total** | **24** | **40** | **20** |

---

# 1. GRAPHICS

## What exists

A genuinely well-built renderer for a browser game. Two-scene split (`renderer.scene` in metres,
`renderer.far` for celestials with its own camera and `FAR_SCENE.parallax = 2.2e-4`) so a gas giant
can fill a third of the frame while a fighter forty metres away still z-sorts against a hull. A
full post chain in `src/render/postfx.js`: far pass → main pass → GTAO (radius 60 m, authored in
world units, which is correct and unusual) → screen-space godrays → UnrealBloom → ACES →
a bespoke lift/gain/vignette/grain/Bayer-dither grade → SMAA, on a 4× MSAA half-float target.
Every texture is generated at runtime; no binary assets. Per-POI lighting rigs in
`src/world/lighting/poi.js`. Two committed measurement tools (`tools/surface.mjs`,
`tools/shadowcheck.mjs`) that settled arguments the prose could not.

## What is good

- **The grade is the right idea and it works.** The `lift`/`gain` pair tinting toe and shoulder
  towards the POI's shadow and key colours is the single highest-leverage coherence trick available
  and the comment explaining why it runs in LDR after `OutputPass` is correct and hard-won.
- **The MSAA-on-the-HDR-target reasoning is right.** SMAA alone genuinely cannot reconstruct a
  two-pixel step between a lit plate and literal zero. That note should be kept.
- **`docs/review/audit/three-quarter.png` is a good frame.** The banded giant, the ring shadow
  raking across the hull, the specular hit on the bridge tower, the debris at three depths. If the
  whole game looked like this frame the graphics section would be two paragraphs long.
- **GTAO radius in metres.** Almost everyone gets this wrong.

## What is weak

### G1 · The triangle budget is 6% consumed and the "plastic model" complaint is a direct consequence — **CRITICAL**

`docs/review/benchmark.json`: peak **113,233 triangles** against a committed ceiling of
**1,900,000**. The full benchmark scene — one fully-fitted capital, twelve combat ships, 930
instanced objects, full post chain — uses **six per cent** of its own triangle budget.

Meanwhile the player cruiser is **1,989 triangles at 1,403 m** (`docs/probes/cruiser.png`). At the
`close` framing the hull covers roughly 700 × 250 px = 175,000 pixels. That is **88 pixels per
triangle** — a flat-shaded facet every 9 × 9 px. Look at `docs/review/audit/close.png`: the
forebody chine is four straight segments, the bridge tower is six boxes, the sponson truss is
literally rectangular prisms. No amount of lighting, panel-line or grade work fixes that, and three
review passes have now been spent trying.

`ARCHITECTURE.md` non-negotiable #4 caps the cruiser core at 2,000 tris. That number was chosen to
protect a draw-call budget it does not actually protect (draw calls are 499 against 320 — see G2 —
and they come from *mesh count*, not *triangle count*). The cap is costing the game its entire
surface read and buying nothing.

**Fix (priority 1):** raise `BUDGET.cruiserCoreTris` from 2,000 to **24,000** and `moduleTris`
from 400 to **3,000**, keep the *draw-call* and *mesh-count* budgets exactly where they are, and
spend the new triangles on (a) chamfers on every silhouette edge — a 3-segment bevel at 0.4 m is
the highest-value spend, it turns every hard edge into a specular line; (b) real bulkhead frames
at the 180 m rhythm §3 of `ship-language.md` asks for and D45 admits is still a value band;
(c) subdivided hull loft so the forebody's diamond shading (an open round-two finding) has vertex
normals to work with. This is one geometry change that closes four open defects at once.

### G2 · Draw calls fail their own committed ceiling and the diagnosis is half-measured — **MAJOR**

499 against 320. `docs/review/benchmark.md` ranks three geometry merges. The acceptance doc
correctly raises that GTAO's depth-normal prepass is a second full render of the scene and that
nobody has run `--quality medium` to subtract it. **That measurement has still not been taken.**
Take it before merging a single mesh; it may be that a third of the overage is one scene counted
twice and the actual gap is ~150 calls, not 179.

### G3 · The close framing is blown out; the "solved" key light over-corrected — **CRITICAL**

`docs/review/audit/close.png`. The lit decks read as near-white plastic — I sample the forebody
upper deck at roughly sRGB 0.85–0.93 and the *shadow* flank at ~0.50. That is a value range of
0.43 across the whole hull with the top of the curve clipped, on a ship the brief wants defined by
extreme contrast and rim light.

The acceptance doc claims this criterion PASS on the basis of a crop: "the bridge tower's
key-facing face reads median 0.669, p95 0.749, inside the 0.72–0.80 target." That measurement was
taken on `look-surface/close.png`, and it measured **one face of one tower**. The key going
6.8 → 14.0 doubled the light on *everything*, and at the `close` distance the bloom threshold
(1.05) is being cleared across most of the upper hull, which is why the frame reads chalky rather
than metallic. The three-quarter frame at the same key looks correct. **The key is now tuned for
one distance.**

**Fix (priority 2):** stop tuning the key against a crop. Run `tools/surface.mjs` over the whole
hull mask on *all five* shot framings and hold the p95 to ≤ 0.80 in every one of them. If close
and three-quarter cannot both be satisfied by one key value, the problem is the bloom threshold
and the exposure, not the key — drop `baseExposure` for `giant-orbit` by ~0.3 stop and raise
`UnrealBloomPass` threshold from 1.05 to ~1.35 so only genuine emissives bloom.

### G4 · Four colour temperatures in one frame, in a project whose own reference doc says one — **MAJOR**

`docs/design/reference-ui-language.md` §1 states this plainly and has not been acted on: "our
frames carry neutral-grey hull, blue planet, warm-brown asteroids and cobalt accents — four
temperatures. This reference carries one." `docs/review/audit/three-quarter.png` confirms it
exactly: white-grey hull, cobalt giant, warm-brown asteroid at frame-left, cyan HUD, amber-red HUD.
`docs/probes/poi_giant.png` adds an olive-green shard and a tan rock in the same frame.

`gainAmount` is 0.10 and `liftAmount` is 0.03. Those are cosmetic weights. The reference this
project chose to imitate is black + one accent + bone.

**Fix (priority 3):** raise `liftAmount` to ~0.12 and `gainAmount` to ~0.28 for `giant-orbit`, and
drop `saturation` from 1.04 to ~0.86, then re-authorise the asteroid albedo towards the POI's
shadow hue rather than towards brown. Faction hue (Coalition olive, Concord white-navy) is the only
permitted exception and it should live in a narrow accent band, not in the base albedo.

### G5 · The signature location is unreadable — **MAJOR**

`docs/probes/poi_graveyard.png`: 95% of the frame is within a few values of black. The only things
above 0.15 are an overexposed white placeholder box and some acid-yellow wreck panels. There is no
composition, no depth, no readable silhouette, no sense that this is a place. The Graveyard is the
POI the entire salvage fantasy is named after and it is the worst-looking frame in the project.

**Fix:** the graveyard needs a *source of light inside it* — a burning hulk, a still-running reactor
glow, a distant star behind the wreck field to backlight silhouettes. Right now the only light is a
distant hard key and the field eats it.

### G6 · The wide shot is empty — **MAJOR**

`docs/review/look3/wide.png` (pre-lighting-fix, but the composition problem is not a lighting
problem): at `zoomT = 0.86` the cruiser is a ~40 px smudge in a black rectangle with a dozen brown
pebbles. No celestial in frame, no nebula band, no volumetrics, no distant structure. `shots.json`
calls this "the shot that sells the game." It does not.

The far scene contains the giant, but at `yaw = 1.7` it is behind the camera and there is nothing
else in the sky. **A backdrop with exactly one object in it has a 50% chance of being empty.**

**Fix:** the far scene needs (a) a nebula band that wraps ≥ 180° of the sky rather than a single
sheet, (b) a second, small, distinctly-coloured celestial (a moon, a second giant, a distant star)
on the opposite hemisphere so no yaw produces an empty sky, (c) faint volumetric dust in the near
scene so the camera-to-cruiser distance is *visible* as attenuation.

### G7 · VFX are functional and nowhere near AAA — **MAJOR**

Reading `docs/probes/vfx.png` and `docs/probes/vfx-explosion.png` against the code in `src/vfx/`:

- **Tracers** render as *dotted lines*. A dashed stroke does not read as ordnance; it reads as a
  UI leader line. Needs a bright core with a soft falloff, a velocity-stretched sprite, and a
  muzzle flash that actually lights the plating around the barrel.
- **Beams** are uniform-width white lines with no core/halo separation, no thickness variation
  along their length and no impact bloom at the far end.
- **Shield impact** is a visibly faceted icosphere. You can count the triangles. It reads as a
  bubble, not as a field.
- **Hull kill** is a dark grey puffball with almost no emission — the least energetic explosion I
  have seen in a space game. No flash, no expanding shock ring, no ejecta streaks, no light cast
  onto neighbouring hulls.
- **Reactor kill** is better (a warm ring plus a white core) but the ring reads as Saturn, not as a
  detonation — it needs to expand and thin, not sit.
- **Engine plumes** are cones with bloom. No shock diamonds, no heat distortion, no throttle-linked
  turbulence, no interaction with nearby geometry.

**Absent entirely:** screen shake, hull venting, sustained fires, spark showers off armour,
decompression jets, debris spalling on impact, missile exhaust trails, muzzle recoil on the mount.

**Fix (priority 4):** one explosion is worth more than six. Rebuild the capital-ship death as a
three-stage event — (1) a 60 ms white core with a real `PointLight` that visibly lights every hull
within 2 km, (2) an expanding-and-thinning shock ring plus 12–20 velocity-stretched ejecta streaks
on the GPU, (3) a 4 s burn with venting jets from the breach points. That single effect will do
more for the game's perceived production value than any other VFX work.

### G8 · Bloom is doing the job the geometry should do — **MINOR**

The bright bar on the bridge tower in `audit/three-quarter.png` is the most eye-catching thing on
the hull and it is a bloomed emissive strip, not a form. When the strongest read on a 1.4 km
warship is a glowing rectangle, the silhouette is not carrying its weight.

### G9 · Debris shards read as paper — **MINOR**

`docs/probes/poi_giant.png`, left edge and right: several debris instances are single-quad-thin and
show through as unlit flat facets. At `close` framing (`audit/close.png`, top-left) the green shard
shows visible edge aliasing and no thickness. Give the debris instance set a minimum thickness and
a two-sided-with-normals material.

### G10 · No emissive/lit-window language at all — **MINOR**

`SCALE_CUE.runningLightSpacingM = 40` is a good idea. But at every framing I looked at, on the
player hull, I cannot see the running lights. In `audit/close.png` — a shot whose entire purpose is
surface read — I count zero discrete navigation beacons on the cruiser. The one cue in the game
whose whole job is to be a ruler is invisible at the framing where it would matter most.

### G11 · Godray threshold is 1.05 against a near-black frame — **MINOR**

`GodRaysShader.threshold = 1.05` with `intensity = 0.42`. In the graveyard and wide frames almost
nothing clears that luminance, so the pass costs 24 texture fetches per pixel and returns nothing.
Gate it per-POI.

### G12 · No screen-space reflections, no contact hardening on shadows, no dirt/AO in the albedo — **MINOR**

Not necessarily wrong for the budget. Noted because a reviewer comparing against the named
references will register the absence.

---

# 2. SHIP DESIGN — the whole fleet

## What exists

Thirteen registered hull classes across three factions plus a hero derelict
(`docs/probes/ships.png`): Coalition corvette / frigate / monitor / destroyer / carrier /
strikecraft (Lancet, Ardent, Sledge, Bulwark, Anvil, Bolt); Concord corvette / frigate / escort /
destroyer / tender / strikecraft (Whipcord, Meridian, Halcyon, Peregrine, Solace, Shrike); and the
3,403 m `derelict_ancient_hulk`. An 804-line design language document. A committed pairwise
silhouette audit (`src/art/geometry/ships/audit.mjs`) that normalises every hull to 200 m and holds
all 78 pairs apart at a 30 px read.

## What is good

- **The silhouette audit is the right kind of work.** Normalising to 200 m so the metric is about
  *shape* and not about *size* is exactly correct, and the note that a fleet of thirteen identical
  shapes at thirteen sizes would fail it shows the author understood what they were measuring.
  Worst pair 8.8 m against a 6.7 m floor. That is a real pass.
- **Faction reads at a glance in colour.** Coalition olive-drab, Concord white-and-navy. In
  `docs/probes/ships.png` you can sort the fleet by faction from a hundred pixels away.
- **The Coalition line is coherent.** Rows 1 of `ships-silhouette-side.png` — Lancet, Ardent,
  Sledge, Bulwark, Anvil — read as five ships from one yard: boxy superstructure, exposed truss,
  weapons on top, industrial. That is a navy.

## What is weak

### S1 · The 3.4 km ancient derelict is never instantiated by the game — **CRITICAL**

`derelict_ancient_hulk` is registered with `role: 'hulk'`. Every spawn path filters it out:
`src/sim/ai/roster.js:258` (`c.role !== 'hulk'`), `src/sim/ai/shipAI.js:250` (`if (role === 'hulk'
|| role === 'fighter') return null`). `src/world/factionWar.js` spawns via `pickClass`. Nothing
else constructs it. **Grep the whole tree: outside `src/probes/derelict.js`, no code path puts the
ancient hulk in the world.**

The single largest, most bespoke, most thematically loaded object in the game — 1,734 triangles of
hand-authored alien architecture, its own material, its own probe, its own section of the design
doc — does not appear in the game. And because it never dies, the six derelict-faction modules that
`src/sim/salvage.js:92` can only source from a derelict-faction hull are also unobtainable
(see M2).

### S2 · The Concord fleet reads as aircraft, not as warships — **MAJOR**

`docs/probes/ships-silhouette-side.png`, row 2: Whipcord, Meridian, Halcyon, Peregrine, Solace.
Four of the five are swept-delta planforms with a dorsal fin. In profile they are indistinguishable
in *kind* from an F-117, an SR-71 and a Vulcan bomber. The Concord destroyer is 480 m long and it
is shaped like a fighter jet.

The silhouette audit passes because it measures pairwise divergence between Concord hulls. It does
not and cannot measure *design-language plausibility*. Nothing in a 480 m vacuum warship should be
a wing, and a fleet of five wings does not read as a navy — it reads as a squadron rendered at five
scales. In `docs/probes/ships.png` the Concord ships additionally read as white-and-blue racing
yachts, which is the same failure in colour.

**Fix:** Concord needs a structural idea that is not aerodynamic. The doc's own material — "clean
plate, cold light, gun batteries pointed outward" — suggests it: give Concord *monolithic slabs
with recessed geometry*, keel-mounted spinal weapons and a flush-plated skin, against Coalition's
exposed truss and bolted-on masses. Two structural philosophies, not two outlines. At minimum,
delete the dorsal fins: a fin has no function in vacuum and it is the single strongest "this is an
aeroplane" signal on every one of those hulls.

### S3 · The derelict does not read as derelict — **MAJOR**

`docs/probes/derelict.png`: a clean, bilaterally symmetric, undamaged tan hull with *lit green
running lights* and no breaches visible in the hero framing. It reads as an intact ship in a
different colourway. The only unusual element is the hoop.

An ancient hulk should read, in one glance and at silhouette-only, as: (a) enormous, (b) dead, (c)
not built by anyone in this war. Right now it scores only (a). Give it asymmetry from structural
failure — a section rotated 4° out of true on a broken spine, ribs exposed where plating is gone,
one whole flank missing. Kill the green lamps or reduce them to two, flickering, wrong-coloured.
Push the albedo far darker so it is defined by rim light, which is the whole point of putting it
next to a light source.

### S4 · Every hull is the same value — **MAJOR**

Across `ships.png`, `derelict.png`, `cruiser.png` and both game captures, every hull sits in a
narrow mid-to-light band with no dark. The `ship-language.md` §4 discussion of accent-as-structure
is good writing and I cannot see it in a single rendered frame. There is no near-black anywhere on
any hull. A warship silhouette against space should be mostly dark with a lit edge; these are
mostly lit with a slightly less lit edge.

### S5 · The player cruiser reads as a wet-navy destroyer at 1/10 scale — **MAJOR**

`docs/probes/cruiser.png` and `audit/close.png`: knife bow, flared forebody, a bridge *tower* with
a mast on top, a flat foredeck, hull number in Latin characters at the bow. Every one of those is a
surface-ship cue and they all carry the surface ship's *size* with them, which is 150 m. The
things that would say "1.4 km spacecraft" — repeated structural bays, multiple decks visible in
section, radiator area proportional to reactor output, docking features sized for other ships,
hull curvature over a length that needs frames — are absent or invisible.

### S6 · Strike craft are 18 m / 138 tris and are never seen — **MAJOR**

Both strikecraft classes exist and are within budget. They are also never launched (see K4), so
their design quality is untested in the only context that matters — beside a 1,400 m hull, which is
where the whole sense of scale is supposed to come from (`ARCHITECTURE.md`: "Strike craft,
missiles, debris and celestials are not plane-locked and should use the vertical volume freely —
this is where the sense of scale comes from"). That sentence describes a thing the game does not
currently do.

### S7 · Faction hull variety is one-deep in practice — **MINOR**

`roster.js#pickClass` returns `exact[0]` — the *first* registered class matching a faction and
role. Every Coalition frigate the war ever spawns is the same Ardent. Thirteen hulls exist; a
player will routinely see four. Randomise within role, weighted by POI value.

### S8 · The lineup sheet contradicts itself on scale — **MINOR**

`docs/probes/ships.png` lists the ancient hulk at 3,402.7 m — larger than everything else by 3.8× —
yet in the rendered lineup it is not the largest object. Either the sheet renders per-hull scale
normalised (in which case say so, because the caption implies otherwise) or the hulk is not being
drawn. Fix the sheet; a scale reference that lies is worse than no reference.

### S9 · Hull numbering is oversized — **MINOR**

`PT-8789` in `cruiser.png` spans roughly 8% of a 1,403 m hull, i.e. ~110 m tall characters. Real
hull numbers are 2–3 m. This is a cheap, high-value scale cue being used backwards: at 110 m it
actively shrinks the ship.

---

# 3. THE MODULAR SYSTEM

## What exists

Six hardpoints (`bow`, `dorsal`, `ventral`, `port`, `starboard`, `engine`) with per-mount arc
centres, arc widths and tier caps in `src/art/geometry/hardpoints.js`. Twenty-four registered
modules across three factions and three tiers. `RefitSystem` (`src/sim/refit.js`) with live model
rebuild. A genuinely excellent refit screen (`docs/probes/ui-refit.png`). A committed module
silhouette audit holding all 46 same-mount pairs apart.

## What is good

- **Loadouts genuinely change the silhouette, and it is measured.** `docs/probes/loadouts.png`
  prints PASS with worst-pair mean 78.5 m against a 45 m target. Standoff / Carrier / Line read as
  three different ships from the outline alone. This is the single strongest piece of work in the
  project.
- **The refit screen is close to shippable.** Live 3D, mount callouts pinned to the hull, a
  what-changes diff with before/after columns, the arc rose showing coverage going 313° → 160°,
  a ghost silhouette of the previous fit, per-part alloy scrap value in the hold row, and an
  explicit "THIS SWAP COSTS THE DORSAL BATTERY" line. That is better information design than most
  shipped games manage.
- **Arcs are a property of the mount, not the weapon.** `WeaponMount.canBear` reads `yawCentre`
  from hardpoint data. This is the correct architecture and it is what makes the whole spatial game
  possible.

## What is weak

### M1 · The player starts with every mount empty and no way to fill them for a long time — **CRITICAL**

`src/game.js:128` — `getShipClass('player_cruiser') ?? synthesisePlayerClass(hullResult)`. **No
code anywhere registers `player_cruiser`.** So the fallback always runs, and the fallback has
`weapons: []`. `Ship`'s constructor gives the player six hardpoints all with `module: null`. No
boot path calls `refit.install`.

The first frame of the game, verbatim from `docs/review/audit/close.png`:

```
BOW      FORWARD BED · EMPTY          100%
DORSAL   DORSAL BED · EMPTY           100%
VENTRAL  SALVAGE CRADLE · E…          100%
PORT     PORT SPONSON · EMP…          100%
STBD     STARBOARD SPONSON …          100%
ENGINE   MAIN DRIVE WELL · …          100%
ARC COVERAGE  0% OF CIRCLE
HOLD 0/6   ALLOY 0   COMP 0   EXOTIC 0
REACTOR GOVERNOR SEALED
```

Zero weapons, zero shields (`shields.max` only ever set from `shieldCapacity` grants), zero power
routing, zero hangar, zero materials, zero cargo. The tactical overlay's firing-arc layer —
the thing `src/ui/tactical.js`'s entire header explains is the point of the game — returns early at
`_drawArcs` because `arcs.length === 0`.

**Fix (priority 1, and it is thirty lines):** register a real `player_cruiser` class, and in
`bootGame` fit a **starting loadout** — a tier-1 cannon bank on port, a tier-1 PD ring dorsal, a
salvage tractor ventral, a thruster upgrade on engine. That gives the new player arcs to look at,
a broadside to swing, a salvage beam to use, and leaves bow and starboard empty so the first
salvaged module has somewhere obvious to go. Everything else in this audit gets easier once the
first frame is a *ship* instead of a *hull*.

### M2 · A quarter of the module library is unobtainable — **CRITICAL**

`src/sim/salvage.js:92` sources a section's `moduleId` from
`pool.filter(m => m.faction === this.faction && matchesKind(m, sub.def.kind))`. Faction must match
the dead hull. Six of the twenty-four modules are `faction: 'derelict'` (Ancient Cutting Array,
Barrier Pylons, Tractor Yoke, Drone Foundry, Flak Cluster, Jump Ring). The only derelict-faction
hull is `derelict_ancient_hulk`, which is never spawned (S1) and could not be killed if it were.

So 25% of the library — including the salvage tractor yoke, which is the *salvager's signature
part* — can never enter the player's hold.

### M3 · Cutting a named section gives you an unrelated random module — **CRITICAL**

`_buildSections` labels a section from the subsystem it came from (`Main Drive`, `Port Nacelle`,
`Forward Blister`) but assigns `moduleId` by `rng.pick(candidates)` across *every* module of that
faction and kind, ignoring hardpoint and ignoring which subsystem it actually was. Cut the
`MAIN DRIVE` off a Coalition destroyer and you may receive a bow torpedo battery.

The file's own header says: "Yields PARTS, not currency. A cannon bank you cut off a wreck is a
cannon bank, and it is the same object when it ends up on your hull." It is not. The section label,
the subsystem you carefully shot around, and the reward are three unrelated things. **This
decouples the entire salvage-targeting fantasy from its payoff** — the reason to shoot out engines
instead of the reactor is supposed to be that you get *that specific part*.

**Fix (priority 2):** put an explicit `yieldsModule` field on `SubsystemDef` and author it per
ship class. `Port Nacelle` → `engine_thruster_upgrade`. `Forward Blister` → `port_cannon_bank`.
Where a subsystem has no natural module, it yields materials and the section reads "SCRAP" in the
UI so the player can *plan the cut*.

### M4 · Cargo pods grant 600 cargo slots against a base of 6 — **MAJOR (balance-breaking)**

`src/art/geometry/modules/ventral.js:324`: `grants: { cargo: 600 }`.
`src/sim/refit.js:139,168`: `let cargo = 6; … cargo += g.cargo ?? 0;` → `606`.
`src/sim/salvage.js` then reads `cargoCapacity = 606` for the hold-full check.

One tier-1 module removes hold scarcity permanently. The units are inconsistent — `cargo` is a slot
count everywhere else and the module author wrote a volume. This is a one-character fix (`6`) and
it currently deletes one of the four things the scope decision names as a source of tension.

### M5 · Three module grants are dead — no consumer exists — **MAJOR**

Grep the tree for the consumer of each `grants` key:

| grant | module | consumed by |
|---|---|---|
| `armour: 3600` | `engine_armour_belt` (T1) | **nothing** |
| `repairRate: 26` | `ventral_repair_bay` (T2) | **nothing** |
| `jumpRange: 3` | `engine_jump_drive` (T3) | **nothing** |

`_applyModuleEffects` reads `powerOutput`, `thrust`, `turnRate`, `hangarBays`, `cargo`,
`sensorRange`, `shieldCapacity`, `salvageRate` and nothing else. The armour belt is a pure `-12%`
thrust penalty. The repair bay is a pure `-8` power penalty. **The tier-3 jump drive — the top of
one of six progression trees — does nothing at all except cost you 24 power.** A player who spends
a run earning it has been lied to.

### M6 · Salvaged `condition` is cosmetic — **MAJOR**

`condition` is set from section integrity, stored, shown as a bar in `ui/inventory.js`, and used in
exactly one place that matters: scrap value. A 42%-condition beam array performs identically to a
100% one. The refit screen draws the bar (`ui-refit.png` shows 64%, 78%, 42%, 91%) which *promises*
it matters. Either make condition scale the module's headline stat (damage, capacity, rate) or stop
drawing it.

### M7 · Tiers are strictly vertical, so the refit loop is a shopping list — **MAJOR**

Every tier-3 module is simply better than the tier-1 in the same mount. There are no opportunity
costs *within* a tier, no "this is worse in every way except one", no build-defining trade. The
scope decision's own design test asks "what decision does this create?" — the honest answer for
most mounts is "install the highest tier you own." The port sponson is the exception and shows what
the rest should look like: cannon bank (short, cheap) vs beam array (precise, salvager's weapon)
vs flak (anti-strike) vs heavy broadside (huge, slow) is a real four-way choice.

### M8 · Install is instant despite the system claiming otherwise — **MINOR**

`RefitSystem` declares `installTime = 2.5` and `this.pending = null`. Neither is ever read.
`install()` completes synchronously. There is no field-refit-vs-dock distinction, no vulnerability
window, and therefore no reason not to hot-swap your entire loadout mid-fight if the screen is
reachable (it is — `M` works while flying).

### M9 · Port and starboard share one module pool — **MINOR**

`canInstall` mirrors port↔starboard. Correct and economical, but it means the two most important
mounts on a broadside ship draw from the same five modules, so the interesting asymmetric fit
(cannon to port, beam to starboard) is available but has no mechanical reason to exist — no order
lets you fight one side deliberately.

---

# 4. GAME MECHANICS

## What exists

Arc-based combat (`WeaponMount.canBear` with real `yawCentre`/`yawWidth` per mount), lead-solved
projectiles in a flat pooled array, hitscan beams, point defence that picks its own targets,
subsystem HP with kind-specific consequences (`stranded`, `defanged`), hardpoint structural damage
with a breach threshold, and `salvageIntegrity` as a single number expressing how you killed
something.

## What is good

- **The salvage-integrity idea is genuinely excellent.** One float. Reactor kill clamps it to 0.15
  and simultaneously deletes 95% of the hull HP, so the *easy* kill is the *poor* kill. That is a
  tension that reaches back into how you aim, which is exactly what the scope decision's design
  test asks for. It is the best idea in the design.
- **The AI is written against the arc system, not against a distance.** `shipAI.js`'s header — a
  frigate slews broadside-on and slides sideways because that is the only heading that lets it
  shoot; a ship whose engines are gone cannot run and knows it — is the correct thing to build and
  the profiles are three numbers each rather than thirty.
- **Damage bleed-through** (`remaining *= 0.35` after a subsystem hit) means stripping a ship still
  eventually kills it. Right call.

## What is weak

### K1 · The player is hostile to nobody, so combat cannot start — **CRITICAL**

`src/core/world.js:88`:

```js
areHostile(a, b) {
  if (a === 'player' || b === 'player') {
    const other = a === 'player' ? b : a;
    return (this.reputation[other] ?? 0) < 0;
  }
  ...
}
```

`world.reputation = { coalition: 0, concord: 0 }` at construction. Nothing sets either negative at
boot. Consequences, all verified in code:

- `Controls._rightClick` will not issue an attack order (`this.world.areHostile(...)` guard).
- `ShipAISystem` acquisition filters on `areHostile` — **no AI ship will ever target the player**.
- `CombatSystem._updateProjectiles` and `_resolveHitscan` both filter on `areHostile` — even a
  manually forced attack order produces projectiles that pass through the target.

The only path to hostility is salvaging a faction's wreck (`-1.1`) or killing one of their ships
(`-9`, unreachable). So the player's first act of aggression must be theft, and until they commit
it the game contains no combat in either direction. Combined with M1 (no weapons), **the fresh boot
of this game is a stationary unarmed ship that nothing will shoot and that can shoot nothing.**

`docs/review/look3/engagement.png` is the proof: the shot's setup explicitly orders the player to
attack a hostile and the hostile to attack the player. The resulting frame contains no weapons
fire, no arcs, no target lock, and reads `VELOCITY 0 M/S`.

**Fix (priority 1):** the player should start at war with somebody. Give the run a *starting
posture* — e.g. Concord at −25 because you stripped one of their tenders before the run began —
and put it in the fiction. Additionally implement `Ctrl+RMB` force-attack (already in
`controls.md` §1.2, unimplemented) so declaring war is a *player choice with a visible cost*
rather than an accident of the salvage system.

### K2 · Subsystem targeting has no interface — **CRITICAL**

`controls.md` §1.7 specifies a held-`Ctrl` ring of segments around the target, one per subsystem,
each showing label, HP bar, salvage value pip, and — "critically" — greyed out when no installed
weapon can bear from the current relative bearing. `CombatSystem.canAnyWeaponBear` was built
specifically to serve it, and `integration-decisions.md` §3 records the cross-stream agreement.

**The ring does not exist.** `src/input/controls.js` has no `Ctrl` handling. `_rightClick` calls
`_pickSubsystem(enemy)` with a 26 px radius and silently uses whatever it finds — so the player
aims at a subsystem *by accident*, with no ring, no labels, no HP, no salvage-value pip, and no
grey-out. The one mechanism the design says teaches the player that facing and subsystem targeting
are the same problem is absent.

Everything downstream is built: `applyDamage(subsystemId, accuracy)`, per-kind consequences,
`bearingReport`, `canAnyWeaponBear`. The teaching layer is the missing 5%.

### K3 · The salvage-integrity tension is invisible before the kill — **MAJOR**

`salvageIntegrity` starts at 1 and is only ever clamped to 0.15 by a reactor kill. So it is a
binary, revealed after the fact, and the player has no live readout of "how much of this hull am I
currently ruining." The target panel in `docs/probes/ui.png` does show a `SALVAGE 58%` bar — good —
but nothing shows the *projected* yield of the shot you are about to take, and nothing shows which
sections are already scrap.

**Fix:** show, on the subsystem ring (once K2 exists), a per-section salvage-value pip that greys
as its integrity falls, plus a single "PROJECTED YIELD" figure on the target panel that moves in
real time as you damage it. The tension only exists if it is legible *during* the fight.

### K4 · Strike craft never launch — **CRITICAL**

`Squadron.launch()` in `src/sim/strikecraft.js:64` is called from **nowhere**. `_syncCapacity`
constructs a squadron when `hangarBays > 0` and emits "Squadron Alpha ready", and that is the end
of it. There is no `L` binding (spec §1.9), no group assignment, no stance control, no engagement
band, no launch order from any UI.

The header calls this "a genuine change of genre partway through a run." It is 240 lines of
unreachable code. Secondary bugs in the same file: docked craft are removed from `world.ships` but
remain in `squad.craft` forever with `state: 'docked'`, so they keep integrating physics invisibly;
and `launch()`'s loop condition (`i = this.craft.length; i < this.size`) means once craft exist,
launching again never re-launches the docked ones.

### K5 · The core loop does not currently produce a decision — **CRITICAL**

Walk the loop as it actually runs. Boot at `giant-orbit`. You have no weapons, no shields, no
routing, no hangar, no materials, no hold, and no enemies. The faction war runs in the background
and eventually makes wrecks. You fly to one at 140 m/s, press `Z` to cut the nearest section, wait
for `cutRate 0.34/s`, receive a random module, press `M`, install it. Repeat.

There is no pressure (nothing shoots you), no cost (no fuel drain in combat, no time limit, no
decay), no scarcity (cargo pods make the hold infinite, M4), no risk in salvaging (the cut is free
and the wreck cannot fight back), and no alternative use for the thing you just got. **The only
decision available is "which of these two identical wrecks do I fly to first."**

The parts that would create decisions are all built and all unreachable: salvage-under-fire needs
K1; the integrity trade needs K2 and K3; the travel risk trade needs T1; hold scarcity needs M4;
and progression choice needs M7.

### K6 · Weapon variety does not produce tactical variety — **MAJOR**

Eight `WEAPON_TYPES`, and the differences that reach the simulation are `range`, `damage`,
`cooldown`, `spread`, `projectileSpeed`, `tracking`, `subsystemAccuracy`. There is no armour model
(M5 — `armour` is dead), no shield-vs-hull damage typing (shields absorb everything flatly at
`applyDamage`), no penetration, no falloff with range, no overheating, no ammunition. So a beam
and a cannon differ by two numbers and a hitscan flag. The design's claim that "beams are the
salvager's weapon" is carried entirely by `subsystemAccuracy 0.92` vs `0.65` — one number.

### K7 · Point defence cannot be commanded and cannot be seen working — **MINOR**

`_nearestIncoming` only engages `tracking > 0` projectiles (missiles) and fighter-role hostiles.
Since no missiles are fired at the player (K1) and no fighters exist (K4), PD has nothing to do in
a normal session and the player will never learn what it is for.

### K8 · The hardpoint breach mechanic can silently eat a rare module — **MINOR**

`applyDamage` warns at 35% structure and destroys the module at 0. The HUD draws the 35% threshold
on every mount bar from the first frame, which is good and deliberate. But `_hardpointNear` picks
the *nearest hardpoint with an object* and accepts it if within `radius * 0.6` — on a 1,403 m hull
that is a 420 m acceptance sphere, so damage anywhere near the middle of the ship is attributed to
whichever mount happens to be closest, including mounts on the far side. Module loss is therefore
partly arbitrary.

---

# 5. SUBSYSTEMS AND GAME SYSTEMS

## Power routing

**Built well, mostly unreachable.** `PowerPlant` (`src/sim/power.js`) has the two rules that matter:
reallocation spools at 0.34/s so panic-switching leaves you with neither, and reactor damage lowers
the *ceiling* rather than the allocation. `factor()` feeds weapon rate of fire, engine efficiency
and shield regen. That is a real system.

### P1 · The reactor panel is dead UI occupying 20% of the frame from the first frame — **MAJOR**

`world.unlocked.powerRouting` is set only by `_applyModuleEffects` when `powerBonus > 0` — i.e.
after you install a reactor module. With M1 unfixed that is never, so in every game capture the
lower-centre of the screen is a hatched, greyed, non-functional panel reading REACTOR GOVERNOR
SEALED, drawn *over the ship* (see `audit/three-quarter.png`). Gating the system is right; drawing
a full-size dead panel for it is not. Collapse it to a one-line stub until unlocked.

### P2 · The power UI is the wrong shape — **MAJOR**

`controls.md` §1.8 specifies a held-`C` radial of four quadrants with integer pips, plus four
stance hotkeys with a shared 6 s cooldown lifted from BFGA2 — the cooldown being the thing that
stops routing degenerating into per-second fiddling. What shipped is five continuous presets on
F1–F5 with **no cooldown at all** and no per-channel control whatsoever. The player cannot move a
single pip; they can only pick one of five fixed splits, instantly, as often as they like.

### P3 · `POWER_CHANNELS` includes `sensors`, which does almost nothing — **MINOR**

`sensors` feeds only `DiscoverySystem.sensorRange()` and the survey pip requirement — both of which
are unreachable (see D1). So one of four channels is a decoy.

## Shields

### SH1 · Shields do not exist until a specific tier-3 derelict module is installed — **CRITICAL**

`ship.shields = { current: 0, max: 0 }` and `max` is only ever written from summed
`grants.shieldCapacity`. Exactly **one** module in the entire library grants it:
`dorsal_shield_pylons`, tier 3, faction `derelict` — which per M2 is unobtainable. Every faction
ship also has `shields.max = 0` (nothing calls `_applyModuleEffects` for them). **Nothing in the
game has shields.** `src/vfx/shields.js` (277 lines), the shield impact VFX, the shield power
channel, `EV.SHIELD_IMPACT`, the shield row in the refit diff, and the BRACE stance are all built
against a mechanic that can never fire.

## Repair

### R1 · There is no in-flight repair of any kind — **CRITICAL**

`RefitSystem.repairHull(amount)` exists and is called by nothing. `repairHardpoint` is reachable
from the refit screen's `R` key. `ventral_repair_bay.grants.repairRate` is dead (M5). So: hull
damage is permanent for the run, there is no repair over time, no damage control, no field repair,
no drone. A single unlucky fight permanently reduces the ship with no recovery mechanism. For a
roguelike that is not difficulty, it is a dead end.

## Strike craft

Covered at K4. **CRITICAL**, unreachable.

## Reputation

### RP1 · Reputation is a hidden one-way ratchet with two thresholds — **MAJOR**

Two floats, −100..100. It gates hostility at 0 and picket deployment at −40. Every event moves it
down (`kill −9`, `salvage −1.1`, `intercepted −4`) except `enemy-of-my-enemy +3`. There is no way to
*repair* a reputation — no bribe, no favour, no contract, no decay toward neutral. Once you have
salvaged forty wrecks you are permanently at war with everyone, and there is no UI showing the
number, the threshold, or the trend. `EV.REPUTATION_CHANGED` is emitted and nothing in `src/ui/`
listens to it.

## Faction war

### FW1 · The best-simulated system in the game is completely invisible — **MAJOR**

`src/world/factionWar.js` (984 lines) is excellent: per-POI control, heat and garrison; battles
scheduled with a warning period; resolved with real ships if you are present and in one arithmetic
step if you are not; **persistent hulks that survive you leaving and coming back**; heat decay;
front-line queries. The header's argument — "a world that only moves when it is being watched is a
stage set, and the player can always tell" — is right, and the implementation honours it.

The player can see **none of it**. There is no map (§6), no faction standing readout, no battle
notification beyond a one-line toast, no control overlay, no front line, no heat display. A player
will finish a session without ever learning there is a war.

`docs/probes/worldsim.png` renders a beautiful strategic map with control colours, patrol heat
rings, front-line columns, live battle markers, a plotted course and an intercept percentage. **It
is a debug probe.** The single highest-value UI work available in this project is promoting that
probe into a screen.

---

# 6. TRAVEL — Plot-and-Burn

## What exists

`src/world/travel.js`, 704 lines, and it is the most faithful spec implementation in the repository.
Four visible phases (turn → 25 s spool → burn at 30 m/s² to 3,600 m/s → symmetric brake).
Closed-form `legProfile` producing trapezoid or triangle. Propellant with a 40-unit reserve that a
plotted course cannot spend, so a stranding course is **rejected at plot time with a reason string**
rather than accepted and failed 200 km out. Per-leg interception odds computed by sampling patrol
heat at nine points along the leg, times a signature multiplier that SILENT mode divides by four.
Interception drops you out where it happened, spawns a picket ahead on your velocity bearing, and
brings weapons back over 12 s. A transit time-compression band that widens `TIME_SCALES` to 64× and
**slams shut the instant a contact resolves inside sensor range**, clamping the current index down.
Fourteen hand-placed POIs at 166–546 km spacing in one continuous coordinate space, with a boot-
content handover so entering the first real POI does not leave two skies behind.

The arithmetic checks out: 120 km = 151 s, 300 km = 225 s, 600 km = 312 s, matching §5.5.3.

## What is good

Nearly all of it. This is a thoughtful, honest travel model — a burn you watch, that costs
something, that is interruptible, and whose danger is drawn on the leg before you commit. It is
the correct answer to "is travel fun or is it a wait": it is a *bet*, and the compression band
means it is a ten-second bet rather than a three-minute one.

## What is weak

### T1 · Nothing in the game can plot a course — **CRITICAL**

`travel.plot()`, `plotTo()` and `commit()` are called from exactly one place in the repository:
`src/probes/worldsim.js`. Not from `src/ui/`, not from `src/input/`, not from `src/game.js`.

There is no Tactical View. `UILayer.openScreen` accepts exactly one value, `'refit'`
(`src/ui/index.js:241`). `Tab` is bound to nothing anywhere in the codebase. `src/ui/tactical.js` is
the *in-world* overlay (arcs, rings, target brackets), not the strategic map, despite the name.
`TacticalCamera` has a `strategicBlend` that ramps across `zoomT` 1.0→1.35 and its only effect is
`renderer.post.setExposureScale(1 - blend * 0.78)` — **zooming past maximum dims the scene by 78%
and reveals nothing.**

So the player cannot leave the starting POI except by flying there at 140 m/s combat speed. The
nearest neighbour is 166 km away: **19 minutes of real time at 1×, 5 minutes at 4×,** with no
compression band (that only opens in transit state) and nothing to look at. Fourteen POIs, a
simulated war moving across all of them, persistent hulks accumulating at each — all of it behind
a door with no handle.

**Fix (priority 1, and it is the single highest-value change in this document):** promote
`src/probes/worldsim.js`'s system map into a real screen. Bind `Tab`. Draw POI nodes with control
colour, heat rings and battle markers; RMB to add a leg; `Backspace` to remove; `Enter` to commit;
`Esc` to discard. The overlay already has everything it needs — `travel.plot()` returns
`{legs, totalTime, totalPropellant, ok, reason, interceptChance}` per leg, ready to draw.

### T2 · Time compression is unreachable for the same reason — **MAJOR**

`TIME_SCALES_TRANSIT` up to 64× opens only when `state !== 'idle'`, i.e. only under a committed
course. With T1 unfixed, the player is permanently capped at 4× and every distance in the game is
priced at combat speed.

### T3 · SILENT mode has no control — **MINOR**

`setSilent(on)` is public and called by nobody. The whole risk/time trade (signature 6.0 vs 1.5,
propellant 0.8 vs 0.5/km, roughly +45% travel time) is a boolean the player cannot touch.

---

# 7. MENUS, UI, UX, CONTROLS

## What exists

A single 2D overlay canvas rendered at device pixel ratio, adding **zero** draw calls, geometries,
programs or materials to the 3D scene. `Painter` with hairline snapping to the device pixel grid, a
`claim`/`textIfClear` reservation system that turns label placement into a priority order rather
than a race, a locked colour/typography theme, projected world-space brackets and plane rings, a
three-stage order-acknowledgement animation on wall clock (so it works at pause), and a directional
damage chevron. Plus the refit screen.

## What is good

- **The visual language is genuinely distinctive and well-executed.** Dense monospace, hairline
  rules, small caps, no rounding, no gradients. `docs/probes/ui.png` and `docs/probes/ui-refit.png`
  are the two best-looking things in the project.
- **Order feedback is instant by construction.** `Controls._feedback` emits synchronously inside
  the DOM handler; `UILayer` spawns the marker in the same call stack; the next frame draws it.
  ≤16.7 ms at 60 fps. The reasoning in the header is correct and the 100 ms criterion is genuinely
  met, including at pause.
- **`_reserveFrame` is a real idea.** Claiming the non-negotiable panels before the opportunistic
  captions are placed is why the display stays readable across the zoom range.

## What is weak

### U1 · The implemented control scheme contradicts its own spec's founding axiom — **CRITICAL**

`controls.md` axiom 1: "Buttons get one job each," justified at length with Homeworld 3 player
complaints about RMB doing two things. What shipped (`src/input/controls.js:103`):

```js
if (d.button === 0) this.tactical.orbit(dx, dy);       // LMB drag = camera orbit
```

with `_onPointerUp` treating `moved < 6` as a click → select. **LMB now both selects and moves the
camera.** The exact defect the document exists to avoid, transplanted from the right button to the
left. Spec says MMB-drag orbits, Alt+LMB is the laptop alternative, and LMB-drag on empty is a band
box. Band-box selection does not exist. Meanwhile MMB-drag pans (spec: *Shift*+MMB) and screen-exact
pan has no modifier at all.

### U2 · Roughly 22 of ~74 specified bindings exist — **CRITICAL**

`controls.md` is 1,289 lines. `src/input/controls.js` is 335. Missing, all specified, all
unimplemented:

| Missing | Spec | Consequence |
|---|---|---|
| `RMB press-drag` arrival heading | §1.2 — "the single most important order in the game for a broadside ship" | You cannot tell a broadside ship which way to face when it arrives |
| `Shift+RMB` order queue | §1.2 | No waypoints |
| `Ctrl+RMB` force attack / subsystem commit | §1.2, §1.7 | Cannot declare hostility; cannot commit an aim point |
| `Alt+RMB` tow whole | §1.2 | Towing does not exist |
| `Ctrl` hold subsystem ring | §1.7 | See K2 |
| `C` hold power radial | §1.8 | See P2 |
| `Tab` Tactical View | §1.3 | See T1 |
| `B` broadside stance | §1.5 | The one order a broadside ship most wants |
| `O` keep-at-range | §1.5 | No standoff |
| `A` attack-move | §1.5 | — |
| `X` all-stop, `R` reverse | §1.5 | Cannot stop or back off |
| `Z` hard burn | §1.5 | **`Z` is rebound to "cut nearest section"** |
| `T` / `Shift+T` cycle hostile / wreck | §1.5 | No target cycling at all |
| `L`, `Ctrl+1..5`, `G`/`I`/`D`, Alt+Wheel band | §1.9 | See K4 |
| Edge scroll, `Shift+Z` frame engagement, `Ctrl+Home` reset, `Ctrl+V` cycle shot | §1.3 | — |

Also inverted from spec: `F` snaps to the player rather than focusing the *selection*;
`1`/`2`/`3` set the time scale (spec puts time on `Alt+1/2/3` and reserves the number row for
subsystem, power and squad selection — so the number row is permanently burned); `Alt` is the
slow-pan modifier where the spec says `Ctrl`; `Esc` clears armed order, widget and selection in one
press rather than popping one context per press.

And `controls.md` §1.1 mandates that bindings are **data** in `src/input/bindings.js`, keyed by
action id, resolved through a context stack, and rebindable from options. **That file does not
exist.** Bindings are a hard-coded `switch` on `e.code`. Nothing is rebindable and there is no
context stack.

### U3 · There is no menu, no options, no key reference, no pause screen, no save — **CRITICAL**

`index.html` is a canvas, a UI div and a boot splash. `src/main.js` boots straight into play. There
is no title screen, no new-run screen, no settings, no key list, no audio volume, no quality
selector (it is a URL parameter), no accessibility options, no pause menu, no quit. There is no
`localStorage` write anywhere in `src/`. **Closing the tab discards the run.** For a roguelike,
whose entire structure is runs, that is not a missing feature — it is a missing genre.

A new player is dropped into a 3D scene with no instruction and no discoverable way to learn that
`M` opens the refit bay, `Z` cuts salvage, `` ` `` toggles the overlay, or that F1–F5 are power
presets. Two of those four keys (`` ` `` and `M`) are handled in `src/ui/index.js` and appear in no
document at all.

### U4 · Panels are welded to the screen edges and occlude the ship at the most common framing — **MAJOR**

`audit/three-quarter.png`: the reactor panel's hatched scrim sits directly over the cruiser's
ventral and the target panel sits over the gas giant. `audit/close.png` is worse — the reactor panel
covers the hull's entire lower third and the "RMB A CONTACT TO ENGAGE" line is grey text drawn over
white plating.

`docs/design/reference-ui-language.md` §2 already prescribes the fix — "our HUD is currently fixed,
welded panels that overlap the ship at common framings. Moving to independent closable panels
solves the occlusion complaint directly" — and §3 identifies why the reference stays legible:
near-opaque black panel fills. Our panels use a hatched scrim at partial alpha and lose.

### U5 · Text collides with its own widgets — **MAJOR**

In the reactor panel, the sub-labels (`ABSORB`, `REGEN`, `RATE OF FIRE`, `THRUST`, `TURN`,
`SIGNATURE`, `STRUCTURE`) are drawn *underneath and overlapping* the channel bars in every single
frame I have — `probes/ui.png`, `audit/close.png`, `audit/three-quarter.png`,
`look3/engagement.png`. This is not an occlusion-priority miss; it is a layout bug and it is in the
committed art.

### U6 · No information hierarchy — **MAJOR**

Every number on screen is the same size, weight and colour family. Hull integrity — the one number
whose change should be viscerally alarming — is 11 px, the same as `HDG 000°`. `docs/probes/ui.png`
shows `HULL INTEGRITY 61%` and `PORT · BREACHED — MOUNT L… LOST` rendered at identical prominence
to `VELOCITY 86 M/S`. Density is a valid aesthetic (the reference doc is right about that) but
density without hierarchy is a wall.

### U7 · Red means three different things — **MAJOR**

In `probes/ui.png`, red/amber simultaneously marks: the player's own weapon range rings (the huge
ellipses), a breached mount, a destroyed subsystem, and the cut-target bracket. The player must
learn from context which red is *their* capability and which is *their* damage. The reference
language is one accent for "selected, owned, targeted or warning" — that works when there is only
one thing to say at a time. Here there are four.

### U8 · The order marker vocabulary is thin — **MAJOR**

Three marker kinds (move, attack, salvage) with 6–9 s TTLs and one live marker per kind. There is
no queue visualisation, no path preview through waypoints, no arrival-heading arrow (U2), no
projected-intercept marker, no turn-radius preview. For a ship that takes 14.9 s to reverse
heading, **the interface never shows you the turn you are about to make.**

### U9 · The target panel says "NO LOCK / RMB A CONTACT TO ENGAGE" in low-contrast grey over the brightest object in frame — **MAJOR**

`audit/three-quarter.png`, right side, over the gas giant. Unreadable. It is also the only tutorial
text in the game, so the one instruction a new player gets is the one they cannot read.

### U10 · The arc coverage rose is unlabelled and reads 0% — **MAJOR**

Bottom-centre-left of every game frame: a small circle, a needle, and `0% OF CIRCLE` in red. With
no modules fitted (M1) it is permanently zero and permanently red, so the new player's first
impression includes a red zero they cannot act on and no legend explaining what a "circle" is.

### U11 · `snapTo` has a dead line — **MINOR**

`src/camera/tactical.js:227`: `this.yaw = s.fromYaw + shortestArc(s.fromYaw, this._yawTarget) * 0;`
Multiplying by zero. Yaw is frozen at `fromYaw` for the snap duration instead of interpolating, and
the intent is clearly the opposite. Either finish it or delete it.

### U12 · Hover picking runs a full O(ships) screen projection every frame — **MINOR**

`Controls.update` calls `_updateHover()` unconditionally, which projects every live ship. Cheap at
this entity count, but it also runs while a modal screen is open and while dragging.

### U13 · The notification ring and time strip share the top-centre column — **MINOR**

`_reserveFrame` claims one box for "time strip, order bar, toasts". In `probes/ui.png` three toasts
stack directly under the time control and the last real order is pushed toward the ship.

### U14 · No mouse cursor states — **MINOR**

Nothing changes the cursor over a hostile, a wreck section, a UI region, or during an armed order.
`controls.md`'s armed-order context assumes one.

---

# 8. SCALE AND SENSE OF UNIVERSE

## What exists

Honest units throughout — one world unit is one metre, the cruiser is 1,403 m and nothing is
rescaled for convenience. A single game-wide running-light spacing (40 m) as a learnable ruler,
which was genuinely broken (faction ships wore 6 m spacing, lying by 6.5× about every enemy in
frame — D28) and has been fixed. A two-scene split allowing true angular sizes for celestials.
Fourteen POIs 166–546 km apart in one continuous coordinate space with no map-screen abstraction.
A zoom range of 260 m to 46 km.

## What is weak

### C1 · The cruiser does not read as 1.4 km at any framing I have seen — **CRITICAL**

Look at `audit/close.png` without the HUD. It reads as a 120–180 m naval destroyer. The reasons are
identifiable and each is fixable:

1. **No repeated element at a known size is visible.** Running lights are invisible at close
   framing (G10). There are no lifeboats, no airlocks, no ladders, no handrails, no visible decks,
   no windows, no docking collars.
2. **Every form is a single unbroken mass.** A 1.4 km hull would show *frames* — structural
   repetition at a rhythm the eye can count. §3 of `ship-language.md` asks for a 180 m rhythm and
   D45 admits it is currently "a value band rather than the geometry §3 asks for."
3. **The surface detail frequency is uniform.** A big object shows detail at three or four
   frequencies simultaneously (plate seams, hatches, greeble, stains). This hull shows one.
4. **The hull number is 110 m tall** (S9), which reads the ship as small.
5. **Nothing else in frame is a known size.** Debris chunks near the camera render *larger* than
   the cruiser (`look3/engagement.png`, lower left), so the frame contains no size anchor.

### C2 · At maximum zoom the universe is an empty black rectangle — **MAJOR**

Covered as G6. The vastness read fails not because the numbers are small but because the volume is
*empty*: no dust, no distant traffic, no station lights, no second celestial, no volumetric depth.
Vast requires something far away that you can see is far away.

### C3 · Engagement volume is tiny relative to the ship — **MAJOR**

`RANGE.cannon = 5,200 m` = 3.7 cruiser lengths. `RANGE.sensorBase = 14,000 m` = 10 lengths. So an
entire engagement fits inside a box ten ships wide, and at any moderate zoom the whole battle is on
screen at once. That is excellent for readability (and I would not raise the ranges), but it means
the *game* never occupies a large volume. The 166 km between POIs is the only large number in the
game and it is unreachable (T1).

### C4 · Nothing is ever above or below you — **MAJOR**

`ARCHITECTURE.md` is explicit that vertical volume is where scale comes from, and that strike
craft, missiles and debris should use it. In practice: strike craft never launch (K4), missiles are
rare (few missile modules fitted, and M1), and the debris field is thin. Every game frame I have is
functionally a plane with some pebbles. The strongest available scale cue in this design is unused.

### C5 · The far scene has one object in it — **MAJOR**

Covered at G6. Worth restating under scale because it is a *scale* failure as much as a
composition one: a sky with one thing in it cannot express distance.

### C6 · Velocity reads 0 M/S in every committed frame — **MINOR**

Every game capture in `docs/review/` shows `VELOCITY 0 M/S / HDG 000°`. The ship is never moving in
any evidence this project has produced of itself. Motion is a scale cue — a 1.4 km hull crossing a
starfield slowly is more convincing than any texture. Add a moving shot to `shots.json`.

### C7 · No atmospheric perspective in the near scene — **MINOR**

The acceptance doc lists "atmospheric perspective" among the built scale cues. I cannot see it: in
`look3/engagement.png` a debris chunk 20 km out and one 2 km out have the same contrast and
saturation. Whatever fog term exists is too weak to read.

---

# 9. WHAT IS MISSING ENTIRELY

Things a player of Everspace 2, Rebel Galaxy, Nebulous, FTL, Battlefleet Gothic or Homeworld will
reach for and not find.

### X1 · A run structure — **CRITICAL**

This is described as a roguelike. There is no run. No start-of-run choice, no seed display, no
death handling (`Ship._destroy` fires for the player and *nothing listens* — no game-over, no
summary, no restart), no meta-progression, no unlock persistence, no save. `SHIP_DESTROYED` is
consumed by UI toasts, VFX, audio and the faction war's reputation hook; none of them handles the
player case. The player simply becomes `dead: true` and the game continues around a corpse.

### X2 · Objectives — **CRITICAL** (and explicitly in scope)

`docs/design/scope-decision.md` puts "Objectives — repeatable, generated, systemic" **in scope**.
Grep: no objective, contract, bounty, mission or task system exists anywhere in `src/`. The player
is never asked for anything. Combined with X1, the game has no goal at any timescale.

### X3 · Items, equipment and consumables — **CRITICAL** (explicitly in scope)

Scope decision: "Consumables, one-shot devices, components that modify how a module behaves. The
Everspace-2 lesson: a device that *changes what you can do* is worth more than a device that adds
8% damage." `core/contracts.js` has three registries — modules, ship classes, POIs. There is no
item registry, no consumable, no device, no one-shot. Nothing in the game changes *what you can
do*; everything changes a number.

### X4 · Perks and hull progression — **CRITICAL** (explicitly in scope)

Scope decision: "Progression attaches to the ship, never to a separate character sheet. The hull
accumulates capability." Grep for `perk`: zero hits. The hull accumulates nothing. The only
progression vector is swapping one module for a higher-tier one.

### X5 · Any economy of scarcity — **CRITICAL**

Materials exist (`alloy`, `composite`, `exotic`) and are spent on exactly two things: hardpoint
structural repair and hull repair (the latter unreachable). Salvage yields materials with no cap,
the hold is infinite once you fit cargo pods (M4), and there is nothing to buy, no station
services, no refuel cost, no upkeep. The scope decision names scarcity as the thing that makes the
integrity tension pay off; there is no sink.

### X6 · Docking, stations and services — **MAJOR**

There are four `station` and two `yard` POIs in the system table with lovely blurbs ("Coalition
heavy repair. Gantries the length of a frigate, lit around the clock"). Nothing can be docked with.
`travel.refuel(amount)` exists and is called by nobody. `world.propellant` is never spent outside a
committed course and can never be replenished.

### X7 · Formations, fleet orders, or anything RTS — **MAJOR**

The game is described as an RTS. `world.selection` is a Set, band selection does not exist (U1),
group assignment does not exist, and the only commandable entity is the player's own ship. The
`FleetAISystem` builds formations for *AI* fleets only.

### X8 · Any tutorial, tooltip, or in-game explanation — **MAJOR**

One line of instructional text exists (`RMB A CONTACT TO ENGAGE`) and it is illegible (U9). No
tooltips, no hover explanations, no first-time hints, no glossary. A player will not discover
subsystem targeting, salvage integrity, arc mechanics, power stances or the refit bay.

### X9 · Audio integration is present but untested against play — **MAJOR**

`src/audio/` is 3,300 lines of procedural synthesis with a probe. It is bound to events that mostly
never fire — `ORDER_STRIKECRAFT` (K4), `SHIELD_IMPACT` (SH1), weapon fire (M1/K1). There is no
volume control (U3). I cannot evaluate the sound itself headlessly, but its *reachability* has the
same problem as everything else.

### X10 · Cast shadows read at 5.3% of lit pixels — **MINOR**

`tools/shadowcheck.mjs` measured this honestly and the tightened shadow box helped. It is still a
small absolute contribution. Worth revisiting once G3 fixes the value range, because a shadow on a
0.9 deck is invisible in a way a shadow on a 0.45 deck is not.

---

# THE TEN HIGHEST-VALUE CHANGES

Ordered. Each line is the justification.

1. **Fit the player cruiser with a starting loadout and register a real `player_cruiser` class.**
   *Thirty lines. Right now the first frame of the game is an unarmed hull with 0% arc coverage, and
   it invalidates every visual and mechanical review this project has run on itself.*

2. **Make the player hostile to somebody at boot, and implement `Ctrl+RMB` force-attack.**
   *`areHostile` returns false for the player against everything, so no AI will target you and your
   projectiles pass through hulls: the combat system — the largest system in the game — cannot
   currently execute a single exchange of fire.*

3. **Promote `src/probes/worldsim.js`'s system map into a real Tactical View on `Tab`, wired to
   `travel.plot`/`commit`.** *704 lines of excellent, spec-faithful travel code, 984 lines of
   simulated faction war, 14 POIs and a persistent hulk economy are all sealed behind a screen that
   was never built; this one screen unlocks more finished content than any other work available.*

4. **Build the held-`Ctrl` subsystem ring with `canAnyWeaponBear` grey-out.**
   *It is the specified teaching mechanism for the single idea the whole design rests on — that
   facing and subsystem targeting are the same problem — and every piece of it except the ring
   itself already exists.*

5. **Raise the triangle budget for the cruiser core to ~24k and modules to ~3k, and spend it on
   edge chamfers, structural frames and a subdivided loft.** *The scene uses 6% of its own triangle
   ceiling while the hero ship shows one flat facet every 9×9 pixels; three lighting passes have
   now failed to fix a geometry problem.*

6. **Fix the salvage reward chain: `yieldsModule` per subsystem, `cargo: 6` not `600`, and make
   derelict-faction modules obtainable.** *Cutting a named section currently returns a random
   module, one tier-1 pod makes the hold infinite, and 25% of the library can never be acquired —
   together these delete the payoff of the game's best idea.*

7. **Add a run structure: title screen, seed, death handling, summary, restart, and `localStorage`
   persistence.** *This is sold as a roguelike and it currently has no run, no end and no save;
   closing the tab is the only exit and it destroys everything.*

8. **Re-tune the key/exposure/bloom against the whole hull mask across all five shot framings, and
   pull the grade to one temperature.** *The close shot is blown to near-white while the
   three-quarter shot is correct — the key was solved against a crop of one tower — and the
   project's own reference doc has been telling it to lose three of its four colour temperatures
   for a pass and a half.*

9. **Reshape the UI: near-opaque panel fills, collapse the sealed reactor panel to a stub, fix the
   label/bar collision, and give hull integrity real typographic dominance.** *The interface is the
   best-looking thing in the project and it is currently drawn over the ship in translucent hatching
   with its labels overlapping its own widgets and no hierarchy at all.*

10. **Rebuild the capital-ship death as a three-stage event with a real light cast, an expanding
    shock ring and GPU ejecta.** *The most emotionally important moment in a salvage game is
    currently a grey puffball that emits no light, and one great explosion will move perceived
    production value further than any other single VFX task.*

---

## One closing observation

This repository is unusually good at measuring itself. `tools/surface.mjs`, `tools/shadowcheck.mjs`,
`modules/audit.mjs` and `ships/audit.mjs` are real instruments, and the acceptance document's habit
of writing "the tool disagreed with the prose on its first run" is the right instinct.

But every one of those instruments points at the *surface*. There is no tool that boots the game and
asserts that the player has weapons, that an enemy exists, that a course can be plotted, or that a
squadron can launch. That is why a project this careful can have spent two review passes arguing
about the value curve on a hull that has never had a gun on it.

**Write `tools/playable.mjs`.** Boot the built bundle, and fail loudly on: player weapon count is
zero; no ship is hostile to the player; `openScreen` cannot reach a travel screen; a registered
module is unreachable by any salvage path; a registered ship class is never instantiated; a
declared `grants` key has no consumer. Every CRITICAL in this document would have been caught on
its first run.
