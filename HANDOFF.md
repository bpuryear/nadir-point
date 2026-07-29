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

Committed ceiling 320, benchmark scene measured **499** (`docs/review/benchmark.json`).
The assembled game at boot framing measures **119** (`npm run smoke`, re-run on this
commit), so this is a benchmark-scene failure, not a game-wide one.

Three stale figures circulate for these two numbers — 650 for the benchmark and 143 for
the game. Both came from earlier runs and were copied forward. 499 and 119 are the ones
that reproduce today; `docs/review/benchmark.md` still carries 650 and disagrees with
`benchmark.json` on resolution, frame count and mesh count as well, because the `.md`
was written from a different run than the `.json` beside it.

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
real Homeworld and Star Citizen references every time. **Its verdict still stands — but
three of its four specific blockers were measured closed after it wrote them**, by the
art commits that were in flight when the container died. I originally copied all four
into this document as live. They are not, and I checked each rather than trusting either
the critic or the agent that contradicted it:

| critic's blocker | measured today | tool |
|---|---|---|
| plan view is a slug, 0.65% enclosed | **6.30%**, inside R2.6's 6–12% band | `node tools/silhouette.mjs` |
| LOD2 does not read as the same ship | LOD2 IDENTITY passes, all four features present, exit 0 | `node tools/silhouette.mjs` |
| hull is one material, 130 of 136 assignments | 99 assignments at LOD0: 38 hull+plating, 67 +greeble, 13 `dark`, 3 `radiator` | instrumented `hullParts()` |
| plate language is pillowy, not industrial | not measurable; **still open** | — |

So the honest statement is narrower and more useful than the one I first wrote: the
remaining art gap is **surface character**, not silhouette. The one number that supports
the critic rather than contradicting it is the frequency split — `node tools/surface.mjs
docs/review/look-surface/close.png` gives **78.1 / 20.3 / 1.6** calm/medium/dense against
the brief's 60/30/10 target. That is `D-INT1`, it is real, and it now has a number
instead of a screenshot argument.

Do not re-open the closed three on the strength of an older critic report. Re-run the
tools first — every one of them exits non-zero on a real regression.

Context that matters and cost a round to establish: the look target is **art style, not
lighting**. Bloom, exposure and shadow work are explicitly deferred to a later polish
pass — `docs/design/look-target.md` is authoritative and critics are barred from scoring
those. An earlier pass wasted effort on a zoom-driven grade before this was clear.

**Also open, and it is not cosmetic:** `node tools/probe.mjs cruiser` logs
`DETACHED GEOMETRY` — four pieces of the core hull float unattached in the bridge and
sensor-mast region (roughly x −51..16, y 177..366, z −281..−170), at all three LODs.
This is **not** a regression from the interrupted work: the identical bounding boxes
appear at commit `5ea20d8`, before those art commits, with only the part index shifted.
So it cannot be reverted away. It is the same class as `D49`, which was closed for
modules and never checked for the core hull.

### 3. Ripple broadside, weapon archetypes, hull adaptation

Fully specified, not yet implemented. `docs/design/firing-feel.md` and
`docs/design/hull-adaptation.md` are the specs — spinal forward guns versus hull-mounted
batteries, a broadside that ripples down the side on a cooldown, and a hull that adapts
its own plating to whatever is fitted so a heavily modified ship still reads as one
coherent object.

**There is no blocking triangle breach.** I previously recorded one here — 2009 against
a 2000 budget — carried forward from `docs/design/hull-adaptation.md:1047`, which
measured it before the last art commits. Re-measured from `hull.stats`: LOD0/1/2 are
**1989 / 1554 / 370** triangles and **11 / 6 / 3** draw calls, so the tree is inside
`BUDGET.cruiserCoreTris`. §5.3 of `hull-adaptation.md` budgets its adaptation work off
the stale 2009, and that arithmetic should be redone before it is trusted.

### 4. Visible damage

Specified in `docs/design/damage-model.md` as a zero-draw-call atlas approach so it does
not make item 1 worse. Not implemented.

---

## Two workflows were killed mid-flight

A container restart ended both. Their finished agents' edits are on disk and committed;
their unfinished agents produced nothing.

The tree builds, boots and passes its checks. But a cohesion audit run afterwards found
real drift, so the "nothing is half-applied" line I first wrote here was too confident.
What it actually found, beyond the items already folded in above:

- **The progression layer's `game.js` seam was dead** — `STREAM_MODULES` had no glob
  matching `./sim/meta/`, so `optional()` returned null every boot and the boot report
  announced `missing: progression` for a layer that *was* installed, via a documented
  backstop in `SalvageSystem`'s constructor. Fixed on this commit; both seams are
  idempotent, so whichever runs first wins.
- **`src/world/lighting/pois.js` is never imported on the game path.** It authors
  art-directed versions of `giant-orbit`, `graveyard` and `near-star`, and
  `src/world/system.js:521` claims to defer to them — but only the probe tree imports
  it, so `system.js` registers its own generic versions and the authored POIs have no
  effect in the assembled game. **Not fixed:** wiring it changes what three POIs look
  like, which is a visual change that wants a capture pass behind it, not a stopping point.
- **`docs/design/controls.md` §6.1 specifies a handling model the code does not
  implement.** No `player_cruiser` class is registered, so `game.js:128` always takes
  the `synthesisePlayerClass` fallback: mass 62000 vs a specified 620000, accel 14 vs
  6.0, turnRate 0.22 vs 0.085. `turnFalloff`, `turnExp` and `turnRateFloorK` appear
  nowhere in `src/`. The ship flies well; it does not fly the documented curve.
  Relatedly `world/travel.js:51` hands the cruiser over at 180 m/s, 28% above the live
  hull's own 140 m/s ceiling.
- **`docs/review/defects.md` has duplicate IDs** — D49, D50 and D51 each appear twice
  under two sections both headed "Pass 10", so a reference to "D51" is ambiguous.
- `ARCHITECTURE.md`'s ownership table names five paths that do not exist and assigns no
  owner to `src/sim/meta/**` at all — the structural reason the progression layer had
  nowhere legitimate to wire itself.

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
- **No `Math.random` anywhere.** Everything seeds off the deterministic `mulberry32`
  forks; a stray random breaks reproducibility of an entire run. This applies to
  `tools/` too — `uicheck.mjs` was picking a random port and handing it to
  `startServer`, which is the exact guessing the first trap above exists to prevent.
  Use `findFreePort`, never a guess.
- **A rule enforced by an allowlist is not enforced.** The determinism scanner in
  `src/sim/selftest.mjs` tested for the bare string `Math.random`, then stripped two
  hard-coded strings before testing — one of them cut to fit a single no-op line in
  `strikecraft.js`. It now scans for calls and aliases, which is what actually breaks
  determinism, and prose about the rule no longer has to be smuggled past it.

---

## Honest status

`docs/review/acceptance.md` is the scorecard, with the evidence for each row. It is
written so that PARTIAL means measured-and-short, not not-yet-looked-at, and nothing is
marked PASS on the strength of intent.

Counting its 19 rows: **9 PASS, 3 PARTIAL, 1 FAIL, 6 UNVERIFIED**. Its own summary table
says 5 PARTIAL and 4 UNVERIFIED, and I repeated that wrong split here in the first draft
of this document. The table is corrected on this commit; the body was always right.

Two PASS rows do not reproduce as written and should be treated as unverified until
someone re-runs them:

- **Lighting / single consistent key direction.** The row claims `giant-orbit` key was
  raised to 14.0 for a 35:1 key-to-fill. The code says `key.intensity 11.5` against
  `fill 0.16` — 72:1 — and `palette.js:817` explains why (a later global "keys ×0.82"
  re-solve; 14.0 × 0.82 = 11.48). The row was never updated. Its hull-mask figure
  (p05 0.168) does not reproduce from the committed tool on the committed frame either,
  which gives 0.097, and the crop coordinates its bridge-tower reading depends on are
  not written down anywhere, so that number cannot be re-run at all.
- **Three loadouts distinguishable.** The verdict holds — the sheet still prints PASS —
  but every number in the row is stale (worst pair is mean 82.1 / max 382, not
  78.5 / 313), and the row conflates the sheet's two different measures. Note the
  structural weakness: this evidence is a rendered PNG and `src/probes/loadouts.js:365`
  prints PASS/FAIL into the image with **no process exit code**, so nothing gates it.
  That is the same setup as the false PASS below.

One correction is recorded rather than buried: I previously reported the
loadout-silhouette criterion as PASS while its own probe printed FAIL. That row now
carries real numbers and passes honestly. The general lesson held several times since —
every criterion that moved off PARTIAL moved because someone wrote a measurement tool
instead of another paragraph, and in every case the tool disagreed with the prose on its
first run.
