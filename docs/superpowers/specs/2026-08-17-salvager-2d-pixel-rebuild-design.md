# Salvager — 2D Pixel Rebuild

Design specification. Written 2026-08-17 against the build prompt of the same date.

This supersedes the 3D presentation of `claude/nadir-point-roguelike-yfh6qh`. The game
design survives; the presentation does not.

---

## 1. What is being built

One capital ship — a star cruiser — in a single star system where two factions fight a war
the player is not part of. The player is a scavenger: arrive at battles during or after
them, cut apart the wrecks, bolt the pieces onto the hull. Every upgrade is a physical
module on a hardpoint, so the ship visibly changes silhouette and looks assembled out of
other people's ships.

No campaign, no missions, no runs, no permadeath. One sandbox, one system, one ship, one
loop:

```
find a fight → survive it → strip the dead → change your silhouette → survive a harder fight
```

**Presentation:** top-down 2D, real-time with pause, pixel art.

- *FTL* supplies the systems language: power allocation, targetable subsystems, damage
  states read at a glance, dense flat panels.
- *Deck & Conn* supplies the presentation attitude: hand-crafted pixel art in the early-90s
  MicroProse tradition, instrument-panel chrome, commanding a warship through its consoles.
- Neither supplies the combat model. Combat is **spatial** — the cruiser moves through the
  world, momentum matters, firing arcs are the primary skill. Starsector's combat
  readability, wearing FTL's panels, drawn in Deck & Conn's pixels.

Shape language inherits from the 3D spec in translated form: hard-edged, faceted,
silhouette-first. Chunky plating, no greeble soup, no anti-aliased softness on hulls.
Clean pixel art under a disciplined grade — not a fake-CRT nostalgia filter.

---

## 2. Decisions locked before implementation

These four were decided in brainstorming and are not open during the build.

### 2.1 Greenfield rebuild — delete all of `src/`, keep `docs/`

The existing tree is 85,625 LOC of three.js work. All of `src/` and all three.js-based
`tools/` are deleted in a single commit. `docs/design/` (22 documents), `docs/review/`,
and git history are kept.

**Why the sim is not ported.** `src/sim/` looks like a reusable pure core and is not:
`physics.js`, `ship.js`, `combat.js`, `salvo.js`, `strikecraft.js` and ten others
`import * as THREE from 'three'`. Positions are `THREE.Vector3`, orientation is
`THREE.Quaternion`, and a `COMBAT_PLANE_Y` constant with `planeLocked` flags papers a 2D
game onto 3D bodies. Separately, `sim/meta/` encodes a sortie/perk/objective roguelike loop
that §1 of this spec retires. Porting costs roughly what rewriting costs and leaves dead
concepts embedded in the foundation.

**What is mined rather than ported.** Tuned values — weapon tables, module stats, damage
thresholds, salvage economy ratios — are read out of git history as reference when the
corresponding system is built. The code is not resurrected; the numbers are consulted.

Nothing is unrecoverable: the tree is committed and clean before deletion.

### 2.2 Gate policy

- **Milestone 0 is gated by the user.** The sprite generator is built alone, produces a
  contact sheet, and the build stops. Nothing downstream starts until the user passes it.
  Rationale: every stream depends on generator output, and §2.2 of the build prompt makes
  the art direction a design requirement rather than a taste question.
- **Everything after M0 is gated by the critic sub-agent**, which shares no context with
  builders and scores only the pass/fail list in §11 of this document.

### 2.3 Rotation: pre-rendered bins, 64 steps

Every rotating object on screen uses pre-rendered rotation bins. No live sprite rotation
anywhere. See §5.3.

### 2.4 Scope: full spec, 8 POIs, 4 LOD tiers, discrete zoom

All six hardpoints, ~24 modules across three tiers, both factions, derelicts, the faction
war running unobserved, the hangar deck and its RTS command layer, save/load, all four UI
screens. POI count is 8 — the bottom of the build prompt's 8–15 range — so each receives a
full parallax stack, locked palette, and composed celestial. The criterion is
"identifiable from a single screenshot," which is per-POI quality, not count.

Zoom is **four discrete levels**, each bound 1:1 to an LOD tier. Not continuous. See §5.4.

---

## 3. Constraints that override everything else

1. **Sprites are chunky and hard-edged; presentation is modern and clean.** World sprites
   drawn at 1x on a fixed virtual pixel grid, integer-scaled to the display. No mixed pixel
   densities. Cruiser core sprite 96–128 px long; modules 16–48 px; fighters 8–12 px;
   faction capitals up to 160 px. No CRT curvature, no heavy scanlines, no chromatic smear.
   Restrained post only.
2. **The art direction is a design requirement, not a cost concession.** Pixel art at
   locked scale and locked palettes makes mismatched salvaged parts read as deliberate
   assembly. Added detail density actively breaks the core system: if a module needs close
   inspection to identify, the silhouette economy is dead. Do not "improve" ships by adding
   detail.
3. **60 fps at native resolution on an Apple M-series laptop, 1% lows above 55**, enforced
   against the committed benchmark scene (§11). No unbounded particle spawning, no
   per-frame allocation storms, no full-scene redraws of static layers.
4. **One runnable project, one command to launch.** Every sprite, palette, and background
   generated procedurally or committed. No external art dependencies, no asset downloads,
   no API calls for assets.

---

## 4. Repository layout and module boundaries

```
src/
  sim/          Pure TypeScript. Fixed-step tick, 2D momentum, collision, combat,
                power, salvage, refit, faction war, save/load.
    math/       vec2, angle helpers
    rng.ts      seeded splittable PRNG
  gen/          Pure TypeScript. Emits raw RGBA buffers.
    palette.ts  master palette, POI locks, faction locks
    grammar/    shape grammar: spine, plates, greebles
    hull.ts module.ts debris.ts celestial.ts
    damage.ts   intact / damaged / critical / destroyed frames
    lod.ts      four-tier generation
    rotate.ts   64-bin rotation baker
    qc.ts       off-palette and light-direction checks
  render/       PixiJS v8. Reads sim state, mutates nothing.
    atlas.ts    composite bake → dynamic atlas
    layers.ts   parallax stack, cached RenderTextures
    post/       bloom → dither → grain → vignette
  ui/           Pixi-native panels, pixel font, four screens
  app/          boot, main loop, time control, input
tools/
  contactsheet.ts   Milestone 0, runs in Node
  qc.ts             palette + light-direction check, runs in CI
  bench.ts          benchmark scene
  purity.ts         import-graph check
docs/
  design/           inherited design documents (kept)
  superpowers/specs/  this document
```

### 4.1 The purity rule

`sim/` and `gen/` are both pure and headless. Neither imports PixiJS. Neither touches the
DOM. `sim/` may import only from `sim/math` and `sim/rng`.

This is **enforced by `tools/purity.ts` in CI**, not by discipline. The old repo's failure
mode was exactly this: the sim quietly grew a dependency on the renderer's math library and
stopped being portable. A lint-level check makes the regression impossible rather than
unlikely.

The payoff for `gen/` being headless is concrete: the contact sheet renders to a PNG in
Node with no browser and no GPU, so Milestone 0 is deliverable as a file, and the automated
palette QC runs in CI without a display.

### 4.2 Determinism

One master seed, split into independent named streams: `sprites`, `layout`, `factionwar`,
`combat`. Streams are split, never shared, so consuming randomness in one system cannot
shift another. Without this, firing a gun changes the shape of the nebula and "any bug is
reproducible from a seed" is false.

### 4.3 Simulation and render separation

Fixed-timestep simulation decoupled from render. The renderer and UI read sim state; all
mutation flows through the tick. Time controls (pause, 1x, 2x, 4x) change how many ticks
run per frame, never the tick duration. Orders can be issued while paused.

---

## 5. Presentation architecture

### 5.1 Palette

One master palette of 48–64 colors. Each POI locks to a subset. Each faction locks to a
subset. Emissives are the only colors permitted to bloom.

Palette enforcement is automated: `tools/qc.ts` fails the build if any composited scene
sprite contains an off-palette pixel.

### 5.2 Shape language and lighting

Hard-edged, faceted, plated — as if low-poly 3D ancestors were photographed from above.
Big flat plate reads with single-pixel panel seams, 2–3 value dithered shading, and one
global light direction (**top-left**) baked into every sprite. The light direction is
locked project-wide and enforced in the generator, with an automated check plus visual spot
verification.

All sprites are generated procedurally and deterministically from seed: hulls, modules,
debris, backgrounds, decals, faction markings. The generator composes hulls from a shape
grammar — spine, plates, greebles budgeted per size class — so faction shape languages are
parameters, not hand-drawn one-offs.

### 5.3 Rotation bake

```
refit or damage-state change
  → composite(hull, modules[], damageStates[])    one 1x RGBA buffer
  → bakeRotations(buffer, 64)                     64 point-sampled frames,
                                                  integer pivot per frame
  → upload to dynamic atlas region

render: bin = round(heading / (2π/64)); blit unrotated at integer device pixels
```

Every frame on screen is a 1:1 unrotated blit, which makes "zero sub-pixel artifacts" a
structural property rather than something tuned toward. 64 bins is 5.6° apart and reads as
smooth on capital-ship yaw rates.

Bake cost is ~1–2 ms for a cruiser-size composite and runs only on refit or damage
transition, so the refit screen's instant update holds. Faction classes bake once at load
(they never refit). Damage-state frames bake lazily on first transition, then cache.

### 5.4 Zoom and LOD — four levels

Zoom does not scale sprites. Scaling a 128 px cruiser down to 4 px produces mush, and mush
at the far end kills the wide shot. Zoom instead changes world-units-per-virtual-pixel and
swaps LOD tiers.

| Level | Key | Scale | Cruiser | Purpose |
|---|---|---|---|---|
| 1 Close | `1` | 1/1 | 128 px | Damage states, module detail, hardpoint read |
| 2 Tactical | `2` | 1/4 | 32 px | Default combat; 12-ship engagement with legible arcs |
| 3 Operational | `3` | 1/8 | 16 px | Whole battle site — debris field, wrecks, approach |
| 4 Wide | `4` | 1/32 | 4 px | The speck against the gas giant |

The cruiser column assumes the top of the 96–128 px range in §3. Tier sizes are always
derived from each sprite's own tier-1 size by the scale column, so a 96 px hull yields
24/12/3 px. Tier 4 has a **floor of 3 px on any axis** — below that a silhouette cannot
encode a spine, and the sprite is clamped rather than allowed to degenerate to a dot.

Bound to scroll wheel (stepwise) and to keys `1`–`4` (direct jump, so Wide is reachable
without passing through the others).

**Tier 4 is generated, not reduced.** Box-reducing a 128 px hull to 4 px picks the wrong
four pixels. Tier 4 comes from the shape grammar's silhouette rule directly — the grammar
knows where the spine and the mass are — so a faction destroyer and the player cruiser
remain distinguishable at 4 px, which the silhouette criterion requires.

Tiers 2 and 3 are palette-snapped reductions, each QC'd independently. The reduction is not
a plain box filter: it weights **silhouette-edge pixels and emissive pixels above interior
plate detail**, so that as tiers shrink, the outline and the running lights are the last
things to survive. Interior panel seams are expected to vanish by tier 3; the outline is
not.

**Level changes swap instantly with an ~80 ms crossfade between the two rendered frames.**
Not an animated zoom — animating scale would put sprites at non-integer sizes mid-transition
and reintroduce the mush this design removes. Crossfading two correctly-rendered frames
keeps every pixel integral and lands inside the 100 ms feedback rule.

Camera position snaps to the virtual-pixel grid at every level.

### 5.5 Parallax and depth

Depth without a third axis; this is where the sense of scale now lives.

- 3–5 parallax background layers per POI: starfield, nebula/celestial, distant wreck, near
  debris. The gas giant occupies a background layer and dwarfs everything.
- A sparse **foreground** layer of debris silhouettes drifting *above* the play plane at
  higher parallax speed, partially occluding the action. Used sparingly — seasoning.
- Static layers render to cached textures, never redrawn per frame.

### 5.6 Scale cues, made checkable

Any wide frame must carry at least three independent scale cues. Made pass/fail rather than
aesthetic:

1. Running lights at fixed metre spacing baked into every capital hull at every LOD tier
   (single emissive pixels at tier 4 — this is what makes a speck read as kilometres long).
2. Strike craft pathing that crosses in front of large ships.
3. Parallax velocity gradient across debris layers.

A tool asserts all three are present in the benchmark wide frame.

### 5.7 Post chain

In order, nothing else: emissive bloom (tight threshold, no haze) → ordered dither on
gradient regions → film grain (low opacity) → subtle vignette. No CRT bending, no
scanlines, no chromatic aberration.

---

## 6. Core game design

### 6.1 The cruiser

Mass and momentum are real. Full stop from cruise takes seconds. Turn rate is degrees per
second, never snapped. In 2D there is no visual mass to lean on, so the movement integrator
and the feel tuning pass must sell weight alone. Drift, overshoot, and turn commitment are
features.

No interior, no crew, no walking around. The ship is a single object with systems.

### 6.2 Camera and control

Detached tactical camera, top-down. Right-click issues move orders to a point; the ship
plots and executes with real turning physics rather than snapping heading. Time controls:
pause, 1x, 2x, 4x, with orders issuable while paused.

### 6.3 Combat — spatial layer

Weapons have real firing arcs anchored to their hardpoint's position on the hull sprite.
Broadside banks cover port or starboard; bow weapons cover a forward cone; point defense is
omnidirectional and short-ranged. Arcs render as clean overlay geometry when a weapon group
is selected. Positioning to bring the right arc to bear is the primary combat skill.

Enemy ships have targetable subsystems located on the sprite — engines, weapon mounts,
reactor, hangar. Click a subsystem to focus fire on it.

| Kill | Result |
|---|---|
| Engines | Target stranded, salvageable at leisure |
| Weapons | Target harmless but mobile |
| Reactor | Target explodes, **most salvage destroyed** |

That last row is the central tension of the game. The profitable kill is the difficult one.
Anyone can blow a ship up; taking one apart is a skill.

### 6.4 Combat — resource layer

Fixed reactor output reallocated live between shields, weapons, engines, and sensors.
Segmented pips, drag or click to reallocate, colors matched to system state.

Reallocation is not instant — a spool time makes panic-switching cost something. Damage
knocks capacity offline; a breached reactor module lowers the ceiling for the rest of the
fight.

**The two layers are introduced separately.** Power routing stays locked until the player
installs their first reactor module. A new player is never handed both at once.

### 6.5 Hardpoints and modules

Six hardpoints, roughly four modules each across three tiers, ~24 total.

| Hardpoint | Role | Example modules |
|---|---|---|
| Bow | Forward weapons, ramming, cutting | Siege lance, breaching prow, mining laser array |
| Dorsal spine | Heavy weapons, sensors | Rail battery, sensor mast, missile cells |
| Ventral bay | Utility, capacity | Salvage tractor, cargo expansion, **hangar deck** |
| Port sponson | Broadside | Cannon bank, beam array, flak cluster |
| Starboard sponson | Broadside | Mirrors port, independently upgradeable |
| Engine block | Mobility, power | Thruster upgrade, reactor uprate, jump drive |

In top-down view, dorsal and ventral render as centreline hardpoints (fore-centre and
aft-centre of the spine); port and starboard sponsons are literal. All six are visually
distinct positions on the sprite.

Hard requirements:

- Every module is a real sprite composited onto the hull that visibly changes the outline.
  **If a module cannot be identified from the ship's outline at tactical zoom (level 2), it
  is not finished.**
- Modules carry faction visual identity via the faction's locked palette and shape language.
  A part cut off a Faction A destroyer looks like Faction A on the player's hull. Asymmetry
  between port and starboard is expected and should look good.
- **The hangar deck is the structural pivot.** Installing it converts the game from
  single-ship tactics into small-scale RTS: 4–8 strike craft to select (click, box-select),
  order, and lose. Most expensive module; should feel like a different game afterward. The
  RTS command layer is built as a system that switches on, never bolted on later.

### 6.6 Salvage

Three sources, three risk profiles:

1. **Live faction battles.** Two NPC factions fight each other on their own schedule across
   the system without the player. Arrive mid-engagement and harvest under fire, or wait and
   take the field afterward — by which time the losing side's scavengers may be present.
   Highest reward, highest risk, and what makes the world feel alive unobserved.
2. **Your own kills.** Direct and reliable. Rewards subsystem-targeting skill, since a
   reactor kill destroys most of the prize.
3. **Ancient derelicts.** Static hulks from a war that ended long ago. No combat, but
   hazards: unstable reactors, drifting debris, automated defenses still running.
   Exploration pacing, and the source of the rarest modules.

Salvage yields **parts, not currency**. A cannon bank cut off a wreck is a cannon bank.
Parts break down into generic materials for repairs — the sink that makes material scarcity
bite. No trading economy, no commodity market.

### 6.7 Damage, loss, and repair

Persistent ship. No permadeath, no runs.

Damage is per-hardpoint and visible on the sprite: scorched pixels, blown plating frames,
spark particles, venting-atmosphere jets, dead emissives on a knocked-out module. Each
module sprite ships with intact / damaged / critical / destroyed frames.

Modules can be lost permanently, but **only through critical hardpoint breach** — never
through ordinary damage. The player must be able to see a hardpoint approaching critical
and react, both on the sprite and on the HUD hardpoint readout. Losing a rare module to a
threshold the player never saw coming is a bug, not difficulty.

Repair costs materials and time. Losing a fight means limping away with dead systems, not a
game over screen.

### 6.8 World

One star system, no loading screens, continuous 2D space. Eight hand-placed points of
interest, each visually distinct enough to navigate by — each a palette and a background
composition as much as a location. Examples: a gas giant with a shattered fleet in orbit;
a dense asteroid belt; a derelict station; a decades-old debris field; a faction staging
yard; a star close enough to force a hostile, blown-out palette.

### 6.9 Factions and AI

Two live factions plus derelict hazards. They fight each other on a simulated schedule
independent of the player, hold and lose territory, and react to the player based on whose
wrecks the player has been stripping. Each faction needs a distinct silhouette language and
a distinct locked palette, because the player will be wearing their parts.

### 6.10 UI and HUD

Four screens, one shared panel language: flat, dense, pixel-native chrome in the Deck & Conn
/ early-MicroProse instrument tradition. No smooth-scaled fonts anywhere; one committed
pixel font at integer scales only.

1. **Tactical overlay** — arcs, orders, subsystem callouts, threat markers. Diegetic where
   possible, legible always.
2. **Power routing panel** — the FTL bar. Always visible in combat once unlocked.
3. **Refit screen** — where the player spends the most emotional time. Cruiser sprite
   large, hardpoints called out console-style, composited sprite updating live and instantly
   on install. This screen is the payoff of the entire loop; polish it like it is the whole
   game.
4. **Salvage inventory** — parts as sprites, not icons of icons. The cannon bank in the hold
   is drawn as the cannon bank cut off the wreck.

---

## 7. Technical

- **TypeScript, PixiJS v8, Vite.** WebGPU with automatic WebGL2 fallback; the fallback path
  is verified at build time.
- Object pooling for projectiles, particles, and debris. Particle counts bounded per effect.
- Physics hand-rolled: 2D momentum integration, radial + polygon collision where it matters
  (ship vs ship, projectile vs subsystem region). No physics engine — it does not earn its
  cost in 2D.
- Save/load: full sim state serializable to a single JSON blob, localStorage, one autosave
  slot.

---

## 8. Testing strategy

| Layer | Method | Runs in |
|---|---|---|
| `sim/` | Headless unit tests, plus a replay harness: seed + input log → assert state hash | Node, CI |
| `gen/` | Golden-image tests, palette QC, light-direction check, LOD tier completeness | Node, CI |
| Boundaries | `tools/purity.ts` import-graph check | CI |
| `render/` | Critic sub-agent against §11, plus the benchmark | Manual + CI |

The replay harness is the load-bearing one: it catches feel regressions and desyncs without
a browser, and it is only possible because `sim/` is pure.

---

## 9. Build order

### Wave 0 — foundation (direct, not a stream)

Demolition commit. Scaffold: Vite + TypeScript + PixiJS v8. `sim/math`, `sim/rng`, and
`tools/purity.ts` wired into CI before any system is written.

### Wave 1 — sprite generator, alone

Stream 1 builds the shape grammar, palette and locks, faction parameters, damage frames,
four LOD tiers, the 64-bin rotation baker, the QC tooling, and the contact sheet.

**Milestone 0 gate.** Contact sheet — cruiser bare hull, six example modules installed,
three faction ship classes, debris set, one POI background stack, all at all four LOD tiers
— rendered to PNG and handed to the user. **The build stops here.** Nothing downstream
starts until the user passes it.

### Wave 2 — three parallel streams

Stream 2 (backgrounds & POIs), Stream 3 (simulation core), Stream 9 (post chain & QC).

### Wave 3 — four parallel streams

Stream 4 (combat systems), Stream 6 (camera, controls & feel), Stream 7 (UI & HUD),
Stream 8 (VFX & particles).

### Wave 4 — two parallel streams

Stream 5 (world sim & AI), Stream 10 (audio).

### Wave 5 — integration, slice, expansion, review

Integrate to the vertical slice: one POI fully composed, cruiser with 3 of 6 hardpoints
live and module compositing working, one faction with three ship classes, one derelict,
full combat loop, full salvage loop. **The slice is judged as if it were the finished
game** — final look, final frame rate.

Critic pass on the slice, then expansion to full scope (§2.4), then the bounded review loop
(§10).

Each stream reports what it built **and what is still weak**. A report claiming no
weaknesses is a report that failed to look.

---

## 10. Review loop

Bounded, not open-ended. Each pass:

1. Walk the world. Fly the ship. Fight a battle. Salvage a wreck. Refit the cruiser.
2. List **every** visible defect, specifically, with a location and a description.
3. Fix them.
4. Re-run.

Repeat until a pass produces zero defects, **or until 5 passes**. Report everything
unresolved either way. A pass producing zero defects on the first try has not looked hard
enough; make it look again.

The critic sub-agent runs the visual pass and shares no context with builders. Its rubric is
§11 and it scores against those items specifically. It is never asked whether the game
"looks good" — that question has no answer and produces infinite loops.

---

## 11. Acceptance criteria

Every item is pass/fail. No aesthetic judgement calls.

**Performance**
- 60 fps at native resolution on an Apple M-series laptop in the committed benchmark scene
- 1% lows above 55 fps
- Benchmark scene contains 300+ pooled debris/particle objects live, 12 combat ships,
  1 capital ship, full parallax stack, full post chain
- Draw calls under a committed ceiling, measured and reported. The ceiling is set at the
  **first benchmark run in Wave 5**, recorded in `docs/review/benchmark.md`, and enforced as
  a regression gate from that point on — it is a ratchet, and any later increase must be
  justified in writing rather than absorbed silently

**Sprite integrity**
- Zero off-palette pixels in any shipped sprite (automated, CI)
- Zero sub-pixel rendering artifacts at any of the four zoom levels
- Baked light direction consistent across every generated sprite (automated check, spot
  verified visually)
- All four LOD tiers present for every hull, module, and debris piece

**Silhouette**
- Every module identifiable from the ship's outline alone at tactical zoom (level 2)
- Three different loadouts of the same cruiser distinguishable by outline
- Every faction ship class distinguishable from every other by outline
- Player cruiser and faction destroyers distinguishable at LOD tier 4 (4 px)
- Each POI identifiable from a single screenshot with the HUD hidden

**Scale**
- The cruiser reads as kilometres long in a wide shot, carried by at least three independent
  scale cues present in any wide frame (§5.6)
- Moving across all four zoom levels never breaks the sense of size and never breaks pixel
  integrity

**Feel**
- The cruiser cannot change heading instantly at any speed
- Every order the player issues produces visible feedback within 100 ms
- No input that requires the player to fight the camera

**Cohesion**
- A salvaged module from every faction, installed on the player hull, reads as intentional
- No sprite exceeds the established detail density for its size class
- The refit screen updates the composited ship sprite instantly on install, no hitch
- All UI panels share one chrome language and one pixel font at integer scales

---

## 12. Out of scope

Campaign. Missions. Story. Ship interiors. Crew management. Trading and commodity markets.
Multiplayer. Procedural multi-system generation. Fleet construction and shipyards. Base
building. Character progression separate from the ship. Any 3D rendering. Any external art
generation service.

A stream owner who believes one of these is required reports it rather than building it.

---

## 13. Deliverable

One runnable project with launch instructions. A report per stream covering what was built,
what is weak, and what is unresolved. A benchmark result. The Milestone 0 contact sheet. A
defect list from the final review pass, whether or not it is empty.
