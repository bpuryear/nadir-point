# Handoff

State of the branch `claude/nadir-point-roguelike-yfh6qh` at a deliberate stopping
point, written so the work can be picked up on another machine without reconstructing
context from commit archaeology.

---

## Verify it in three commands

```bash
npm install
npm run smoke      # boot check — exits non-zero on any console error
npm run uicheck    # contrast + panel layout audit
```

`smoke` currently reports: boot ok, 119 draw calls, 93,357 triangles, 58 programs.
`uicheck` currently reports: contrast ok, layout ok, 376 boxes across 6 panels.

Both were re-run on this commit after a container restart, so they are current rather
than remembered.

---

## What is actually built

The vertical slice is playable end to end. A run is: arrive at a battle site, fight or
wait out what is still moving, cut wrecks apart, carry parts home in a hold with real
volume, and refit at an anchorage into a ship with a different outline.

| layer | where | state |
|---|---|---|
| Engine, fixed-step sim, seeded RNG | `src/core/`, `src/sim/` | solid |
| Two-scene renderer (far celestials, near gameplay in metres) | `src/render/` | solid |
| Cruiser, 13 faction classes, module geometry | `src/art/geometry/` | solid, art direction open |
| Combat, power, heat, salvage, crippling | `src/sim/` | solid |
| Items, materials, refit economy, perks, objectives | `src/sim/meta/` | solid, wired |
| UI: HUD plus six panels | `src/ui/` | solid |
| Camera, controls, VFX | `src/camera/`, `src/input/`, `src/vfx/` | solid |

Conventions every stream codes against are in `ARCHITECTURE.md`. Read it before
touching anything shared — the ownership table exists because twelve parallel streams
wrote this and it is what kept them compatible.

---

## What is open, in the order I would take it

### 1. Draw calls — the one outright FAIL

Committed ceiling 320, benchmark scene measured 650. The assembled game at normal play
framing measures 143, so this is a benchmark-scene failure, not a game-wide one.

`docs/review/benchmark.md` ranks three geometry-side merges. **Take the measurement
below before doing any of that work**: the count includes GTAO's depth-normal prepass,
which is a second full render of the scene, so an unknown fraction of the 650 is one
scene counted twice.

```bash
npm run bench -- --quality medium   # medium disables GTAO
```

This is slow here because there is no GPU — the review harness runs on SwiftShader
software rasterisation, and the run exceeded a 9-minute budget twice. On a machine with
a real GPU it is quick. **Never read a frame rate off this environment**; §5's 60fps
target is unverified for that reason and is recorded as such, not quietly claimed.

### 2. Art direction — the thing that keeps not passing

The blind critic has scored the hull 3–4/10 across several rounds and has picked the
real Homeworld and Star Citizen references every time. Its most recent blockers, which
I consider accurate:

- **The hull is one material.** 130 of 136 surface assignments go to hull/plating.
- **The plan view is a slug** — 0.65% enclosed background.
- **Plate language is pillowy, not industrial.**
- **LOD2 does not read as the same ship** (a regression; `D51` had this passing once).

The last one is a regression and is the cheapest to fix. The first is the deepest and
is the one I would put a dedicated pass on.

Context that matters and cost a round to establish: the look target is **art style, not
lighting**. Bloom, exposure and shadow work are explicitly deferred to a later polish
pass — `docs/design/look-target.md` is authoritative and critics are barred from scoring
those. An earlier pass wasted effort on a zoom-driven grade before this was clear.

`D-INT1` in `docs/review/defects.md` is open and related: the surface pass may have
overcorrected from "everything medium frequency" to "everything calm".

### 3. Ripple broadside, weapon archetypes, hull adaptation

Fully specified, not yet implemented. `docs/design/firing-feel.md` and
`docs/design/hull-adaptation.md` are the specs — spinal forward guns versus hull-mounted
batteries, a broadside that ripples down the side on a cooldown, and a hull that adapts
its own plating to whatever is fitted so a heavily modified ship still reads as one
coherent object.

**Blocking pre-work:** cruiser.js is at 2009 triangles against a stated 2000 budget.
Resolve that breach before adaptation lands, or adaptation will inherit it.

### 4. Visible damage

Specified in `docs/design/damage-model.md` as a zero-draw-call atlas approach so it does
not make item 1 worse. Not implemented.

---

## Two workflows were killed mid-flight

A container restart ended both. Their finished agents' edits are on disk and committed;
their unfinished agents produced nothing. Nothing is half-applied — the tree builds,
boots and passes both checks — but a cohesion audit was in progress when I stopped and
its findings are not yet folded in.

What was outstanding: a full-game critique (wave 4) and the last two agents of the
art-direction pass. Neither returned. Their inputs are the briefs in `docs/design/`,
so they can be re-run from scratch without loss.

---

## Traps this project already fell into

Each of these cost real time. They are fixed; this is so they are not re-introduced.

- **Never `spawn('npx', ['vite', ...])`.** It makes vite a grandchild, so `kill()` hits
  npx and leaves vite holding the port. Orphaned servers then answer the harness's
  health poll, and the harness happily drives a **zombie serving a stale bundle** — so
  agents test code that is not the code on disk. This cost five hours of silently dead
  agents. `tools/harness.mjs` spawns the binary directly, detached, and kills the
  process group. The comment block at the top of that file is the full account.
- **A check that measures nothing prints `ok`.** The UI layout audit ran for its whole
  life against zero panels, because every panel constructs closed. It now opens all six
  and fails on an empty sample. Assume any green check is vacuous until you have seen
  its sample size.
- **`CanvasTexture` premultiplies alpha.** A macro detail layer silently lost three of
  its four channels to this and had never worked (`D35`).
- **Don't iterate `panels.panels` while toggling** — `toggle` calls `raise`, which
  splices into that same array. Iterate a copy.
- **No `Math.random` anywhere in `src/`.** Everything seeds off the deterministic
  `mulberry32` forks; a stray random breaks reproducibility of an entire run.

---

## Honest status

`docs/review/acceptance.md` is the scorecard: **9 PASS, 5 PARTIAL, 1 FAIL, 4 UNVERIFIED**,
with the evidence for each. It is written so that PARTIAL means measured-and-short, not
not-yet-looked-at, and nothing is marked PASS on the strength of intent.

One correction is recorded there rather than buried: I previously reported the
loadout-silhouette criterion as PASS while its own probe printed FAIL. That row now
carries real numbers and passes honestly. The general lesson held three times since —
every criterion that moved off PARTIAL moved because someone wrote a measurement tool
instead of another paragraph, and in every case the tool disagreed with the prose on its
first run.
