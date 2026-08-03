# Handoff

State of the branch `claude/nadir-point-roguelike-yfh6qh` at a deliberate stopping
point, written so the work can be picked up on another machine without reconstructing
context from commit archaeology.

---

## Verify it in five commands

```bash
npm install
npx playwright install chromium   # the browser path used to be a dead container path
npm run smoke                     # boot check — exits non-zero on any console error
npm run uicheck                   # contrast + panel layout audit
node src/sim/selftest.mjs         # 51 headless checks over the whole sim stream
```

`smoke` reports: boot ok, 119 draw calls, 93,357 triangles, 58 programs.
`uicheck` reports: contrast ok, layout ok, 376 boxes across 6 panels.
`selftest` reports 51 of 51. `node src/sim/meta/sortieHarness.js` covers the sortie loop
end to end, including a 16-field save/load round trip and its fail-safe paths.

---

## Read this before you trust anything below it

This document was written against a GPU-less container. On a machine with a GPU three of
its statements do not survive contact, and one of them would have sent someone to break
working geometry. They are corrected in place below, but the general lesson is the one
this project keeps relearning: **re-run the tool before acting on the prose, including
this prose.**

| what this doc said | what measures today |
|---|---|
| benchmark draw calls **499** | **423**, and 192 of those are GTAO's prepass drawing the scene twice — real scene geometry is **231**, inside the 320 ceiling |
| 60 fps and 1% lows **UNVERIFIED** | **82.8 fps mean, 68.5 fps 1% low** at 2560×1440, both PASS, measured on hardware |
| four pieces of core hull **float unattached** | **false positive of the detector**, which shrank every box 0.5 m before testing intersection, so anything bolted flat to a deck read as floating. Nothing was ever detached. |

---

## What is actually built

The vertical slice is playable end to end. A run is: arrive at a battle site, fight or
wait out what is still moving, cut wrecks apart, carry parts home in a hold with real
volume, and refit at an anchorage into a ship with a different outline.

| layer | where | state |
|---|---|---|
| Engine, fixed-step sim, seeded RNG | `src/core/`, `src/sim/` | solid |
| Two-scene renderer (far celestials, near gameplay in metres) | `src/render/` | solid |
| Cruiser, 13 faction classes, module geometry | `src/art/geometry/` | solid; **colour identity open** |
| Combat, power, heat, salvage, crippling | `src/sim/` | solid |
| **Ripple broadside** — salvo, side-select, charge-and-release | `src/sim/salvo.js` | **new, gated by `tools/ripple.mjs`** |
| Items, materials, refit economy, perks, objectives | `src/sim/meta/` | solid, wired |
| UI: HUD plus seven panels | `src/ui/` | solid |
| Camera, controls, VFX | `src/camera/`, `src/input/`, `src/vfx/` | solid |

### The gates, and what each is for

Every one of these exits non-zero on a regression. Run them before you believe anything.

| command | asserts | today |
|---|---|---|
| `npm run smoke` | boots with no console error | ok, 114 draws |
| `node src/sim/selftest.mjs` | the whole sim stream, incl. determinism over 167 files | 54/54 |
| `node tools/ripple.mjs` | the broadside fires in hull order and keeps its gaps | 17/17 |
| `node tools/flight.mjs` | the handling curve is the documented one | 20/20 |
| `node src/sim/meta/economyAudit.mjs` | scrap rates agree, no free loops, exotic reachable | 21/21 |
| `node tools/poicheck.mjs` | three POIs really have three different suns **on the live path** | 16/16 |
| `npm run uicheck` | panel layout, contrast, and HUD frame coverage | 598 boxes / 30 regions |
| `node tools/widediag.mjs close --assert` | the art-review frame actually renders | 1/1 |

Four of those eight did not exist two waves ago. The pattern this project keeps
rediscovering is that **a criterion only moves when somebody writes forty lines of tool
instead of another paragraph** — and it now cuts both ways, because a tool was also the
thing that was wrong twice (see the correction table above, and D67 below).

Conventions every stream codes against are in `ARCHITECTURE.md`. Read it before
touching anything shared — the ownership table exists because twelve parallel streams
wrote this and it is what kept them compatible.

---

## What is open, in the order I would take it

### 1. Draw calls — settled, and it was never a geometry problem

**Do not do the three geometry-side merges `docs/review/benchmark.md` ranks.** They were
ranked against a number inflated by 45%.

Measured on hardware at 2560×1440:

| quality | draw calls | triangles | mean | 1% low |
|---|---|---|---|---|
| high | 423 | 131,003 | 82.8 fps | 68.5 fps |
| medium (GTAO off) | **231 — PASS** | 75,901 | 102.1 fps | 78.1 fps |

**192 draw calls, 45% of the high count, are GTAO's depth-normal prepass rendering the
whole scene a second time.** `acceptance.md` suspected exactly this and could not test it,
because `?quality=` had never worked: `Renderer` built `PostChain` *before* resolving
`opts.quality`, so the constructor default of `'high'` always won and `renderer.quality`
was read by nothing. Fixed in `src/render/renderer.js`.

The 320 ceiling was written to bound scene complexity. Scene complexity is 231. What is
left is a rendering-architecture question — whether the AO prepass should count against a
scene-complexity ceiling, and whether it can reuse the main depth buffer — not a case for
merging hulls.

Frame rate is no longer unverified. `tools/harness.mjs#rasterMode()` selects hardware
rasterisation on darwin, `fpsIsMeaningful()` gates every fps claim, and `npm run bench`
now asserts the two performance criteria instead of declining them. Under
`NP_RASTER=swiftshader` it declines them again, correctly.

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
remaining art gap is **surface character**, not silhouette.

**But every surface number quoted before now was measured on a black image.** `D67`: one
unclamped varying in `src/vfx/engines.js` fed `pow(t, 0.72)`, which is undefined for a
negative base in GLSL and returns NaN; the plume is additively blended, so the NaN poisoned
the composite and took the whole frame to black. The `close` shot — the frame the hull's
surface is judged from, and the sole evidence for `D-INT1` — rendered at **contrast 0.013
with 99.31% near-black pixels**. It now reads **luma 0.169, contrast 0.262**.

Two things hid it, and both are worth remembering:

- **The framing contains no visible plume.** The geometry at fault is off-screen at that
  camera. Every investigation looked at what was *in* the frame — framing, key direction,
  frustum culling, LOD — and correctly ruled each one out.
- **The diagnostic was measuring somewhere else.** `tools/widediag.mjs` hard-coded
  `capture=1` while `shots.json` pins `close` to `poi=giant-orbit`, so it booted at the
  graveyard. That is how "the key is frontal, dot +0.978" got recorded for a frame whose
  key at the graveyard is on the shadow side at −0.864. **A diagnostic that boots somewhere
  other than the thing it diagnoses is worse than none, because its numbers get quoted.**

`node tools/widediag.mjs close --assert` is now a gate, and it distinguishes "not landed"
from "landed and insufficient" — the ambiguity that made this defect need re-diagnosing
from scratch twice.

**So D-INT1 is only now honestly measurable, and the frame says the gap is colour, not
density.** The hull reads as flat, light, cool bone-grey: near-uniform mid-to-high value,
essentially no near-black anywhere, and no warm accent — against `look-target.md`'s binding
"warm amber / bone / near-black". Two of the three named colours are simply absent.

Note also that the two surface measurements **disagree about the direction of the failure**:
78.1/20.3/1.6 on a game frame with the HUD inside the mask says too calm; 44.9/45.7/9.3 on
a ship render — the framing `ship-language.md` §3 built its table from — says too *medium*.
`tools/surface.mjs` now requires a `--frame ship|face|scene` argument so a number can never
again be quoted without saying what it framed.

Do not re-open the closed three on the strength of an older critic report. Re-run the
tools first — every one of them exits non-zero on a real regression.

Context that matters and cost a round to establish: the look target is **art style, not
lighting**. Bloom, exposure and shadow work are explicitly deferred to a later polish
pass — `docs/design/look-target.md` is authoritative and critics are barred from scoring
those. An earlier pass wasted effort on a zoom-driven grade before this was clear.

**The `DETACHED GEOMETRY` report was the checker, not the hull.** `floatingParts()` shrank
every bounding box by up to 0.5 m per axis before testing intersection, which demands more
than a metre of mutual interpenetration before two parts count as joined — so anything
bolted flat to a deck read as floating, which is how a bridge tower is built. Measured on
the unshrunk boxes, `core/hull#3` sits on `core/hull#2` with a separation of **0.000 m**
and overlap on both other axes. Nothing was ever detached. The check now expands by a
0.25 m tolerance and the audit passes at all three LODs with no geometry moved. This
document previously recorded it as real, "not cosmetic", and impossible to revert away.

### 3. The ripple broadside — BUILT. Hull adaptation — still open.

**The broadside is in.** `src/sim/salvo.js`, gated by `tools/ripple.mjs` (17 assertions).
The player commits once and the battery ripples fore-to-aft down the engaged flank, one
barrel at a time. Three verbs: salvo, side-select, charge-and-release.

Measured on the real registry: an ordinary broadside is **10 slots over 1.250 s**,
interleaving two modules **by hull position** — 3 mount crossings, z from +188.0 m to
−90.0 m. So the wave is a property of the hull, not of the module list.

The idea worth protecting: **the raggedness carries information the game already simulated
and never showed.** A dead barrel leaves a **0.055 s hole and the slot count does not
change** (10 → 10). A worn feed is a late beat; a frozen traverse ring is a gun firing into
empty space. One assertion in `ripple.mjs` exists solely to stop a future refactor
"optimising away" the gaps — if the wave ever shortens when a gun dies, the mechanic is
gone and the gate goes red.

Recoil is **rotational**: 2.01° of roll, and exactly **0.000 m/s** of lateral velocity
added, because `PlaneBody`'s servo (`physics.js:131-134`) deletes lateral components — a
translational recoil measures 0.000 m of displacement and is therefore not a recoil.

Two prerequisites had to be fixed first, and both were real bugs nobody had noticed:

- **Every beam mount had its firing arc centred on the opposite flank.** `mount: [-48,5,12]`
  with `yawCentre: +PI*0.5`, against `ship.js:141`'s `worldForward.set(sin(aim),0,cos(aim))`
  — so `+π/2` points at `+X`. Fixed by negating 14 `yawCentre` literals; the geometry was
  correct and was **not** moved. Nothing exposed it because `_fire` spawns from
  `mount.worldPosition`, which is on the right side, and `worldForward` had one consumer.
- **`refit.js` double-mirrored the starboard mount**, so a port-authored module fitted to
  starboard simulated at the port position with the port arc. **Both flanks resolved to
  port**, which makes "two broadsides" — one of the two archetypes the spec exists to
  differentiate — impossible.

**Hull adaptation is still not implemented** and is the first thing to take next run. It
was cut deliberately: it writes the same five module files the armament work needed, plus
`cruiser.js`, `contracts.js` and `units.js`, and nothing in it is on the critical path.

**There is no blocking triangle breach**, but the headroom is now the constraint:
LOD0/1/2 are **1989 / 1554 / 370** triangles against `BUDGET.cruiserCoreTris` 2000 —
**11 triangles of headroom.** §5.3 of `hull-adaptation.md` budgets its work off a stale
2009 and that arithmetic must be redone first. Anything that wants geometry needs an
owner decision on the budget, not a quiet overrun.

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

- **Parallel agents share ONE git repository, and git is not lane-aware.** File ownership
  keeps their *edits* apart; it does nothing about their *commits*. Both of these have now
  happened:
  - `git add -A` swept eight source files of another agent's in-flight work into a commit
    whose message described only research documents.
  - `git commit --amend`, run by an agent intending to amend its own commit, **amended a
    different agent's commit instead** and overwrote its message. `fb1acf5` is `f1cdd61`
    amended: the gate agent's content survived, its message — "Correct four figures in the
    derelict gate that no run of it produces" — did not. Nothing was lost (`f1cdd61` is
    still reachable by hash) but `git log` misattributes that work.

  **So: `git add <paths>` by name, never `-A`; and never `--amend` while other agents are
  running.** An agent cannot assume `HEAD` is its own.

- **Measurements taken in the shared working tree are not measurements of your commit.**
  Three benchmark figures in this history match no clean checkout of the repository,
  because several agents write to the tree while the bench reads it. One frame-time
  regression was reported to the owner that was half another agent's load. Take
  performance numbers from `git worktree add` on your own commit with `node_modules`
  symlinked, and say that you did.

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
