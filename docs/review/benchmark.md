# Benchmark result

Scene: `src/probes/benchmark.js`, run by `npm run bench`.
Command: `npm run bench -- --frames 120 --width 1600 --height 900`

## Scene contents

Fixed by the brief. Not reduced to make a number look better.

| | |
|---|---|
| capital ships | 1 (all six hardpoints fitted) |
| combat ships | 12, actively engaging each other |
| instanced objects | 930 (requirement was 200+) |
| distinct meshes | 392 |
| post chain | full, `high` quality preset |

The ships are fighting rather than parked. Idle ships understate cost: no projectiles in
flight, no beams resolving, no engine plumes at throttle, no impact VFX. The capital ship
carries a full loadout because that is the most expensive silhouette a player can
actually produce.

## Hardware-independent budgets

These are real measurements and do not depend on the GPU.

| Metric | Measured | Ceiling | Result |
|---|---|---|---|
| draw calls (peak) | **499** | 320 | **FAIL** |
| triangles (peak) | 113,233 | 1,900,000 | PASS |
| shader programs | 63 | 90 | PASS |
| geometries | 201 | — | — |
| textures | 150 | — | — |
| simulation step cost | **0.80 ms** | — | CPU-only, meaningful |

Re-run after the cruiser rebuild and the surface/shader pass. Draw calls 650 → **499**
and distinct meshes 392 → **259**, from fix (1) below landing on the capital hull.
Still a FAIL: it needs the same merge applied to the faction hulls and the module
library.

**The surface pass was draw- and program-neutral, deliberately.** The macro layer
(`art/materials/hullShader.js`) patches every hull material through `onBeforeCompile`,
and its `customProgramCacheKey` returns a CONSTANT because the emitted GLSL does not
depend on any uniform — so three groups all of them onto one program. Programs went
64 → 63 and the extra cost is one texture per faction and one texture fetch per
fragment. A per-material shader here would have been the obvious implementation and
would have put dozens of programs against the 90 ceiling.

### NOT RE-MEASURED AFTER THE SURFACE PASS — and why, stated rather than hidden

The figures in this file are from the run before the round-two surface pass. That pass
tried three times to re-measure and failed three times to the same cause, which is worth
recording because it will keep happening:

**`tools/bench.mjs` runs the DEV server, and the dev server's HMR full-reloads the page
whenever anything writes to the source tree.** The benchmark needs ~10 minutes of
software-rasterised settle and frames; a stream iterating on the code writes to the tree
several times in ten minutes; each write destroys the execution context mid-run and the
harness reports `Execution context was destroyed, most likely because of a navigation`,
which looks exactly like a benchmark crash. `capture.mjs` already solved this by serving
a built bundle, and `probe.mjs` was moved to the same footing in this pass (D46).

The three-character fix is `startServer({ port })` -> `startServer({ port, mode:
'preview' })`. It was NOT made here because `tools/bench.mjs` belongs to the performance
stream (ARCHITECTURE.md) and unilaterally editing another stream's tooling is what that
table exists to prevent.

**What did change, and what it should do to these numbers.** The surface pass was
draw-neutral by construction — no new material keys, no new meshes, the macro atlas went
from a `CanvasTexture` to a `DataTexture` (same texture count), and the hull shader patch
still returns a constant `customProgramCacheKey`. `npm run smoke` on the assembled game
measured **115 draws / 58 programs** before and after, unchanged. The one thing that
should move is FRAME COST, not counts: the composer's HDR target now carries 4x MSAA
(D44), which is per-sample fill on a half-float target and is therefore very expensive
under SwiftShader specifically and cheap on the GPU this is aimed at. Read the software
timings below as even less meaningful than usual.

### One measurement to take before anyone re-merges a hull to chase the draw count

`renderer.info` counts **GTAO's depth-normal prepass, which is a second full render of
the scene**. At `high` quality the reported 499 is therefore roughly one scene counted
twice, and the three merge fixes below are being sized against a number that includes an
AO pass. Running `npm run bench -- --quality medium` disables GTAO and would separate the
two in one command. That is cheap and nobody has done it.

### The draw-call failure

We committed to 320 and measured 650, now 499. That is a real miss, reported as a miss.

Cause is 392 distinct meshes across thirteen ships plus a fully-fitted capital. LOD is
wired correctly — `buildCruiser` puts its `THREE.LOD` inside the returned root, and the
cruiser does switch levels — but each hull is still assembled from many separately
materialled sub-meshes, and the module library adds several draws per mount. At the
benchmark's 7.2 km camera distance most of that detail is not resolvable and is being
drawn anyway.

Three fixes, in order of expected return:

1. **Merge static sub-parts per material at build time.** Each hull currently keeps
   sub-meshes separate for damage state, but only a handful are ever damaged
   independently. Merging the rest into one geometry per material per hull should take
   a destroyer from ~20 draws to ~5.
2. **Pull the LOD switch distances in.** LOD1 currently begins at 4.2 km. At tactical
   zoom almost every ship in frame is beyond that, so the mid LOD is doing most of the
   work — it should be cheaper than it is, and LOD2 should engage sooner.
3. **Instance the modules.** Twenty-four module types across six mounts are currently
   individual meshes. Modules of the same type on different hulls could share an
   `InstancedMesh`.

None of this is speculative — the counters above say exactly where the calls are going.

## Software-rasteriser timings

| | |
|---|---|
| mean frame | 805.7 ms |
| median frame | 799.9 ms |
| p95 frame | 906.1 ms |
| p99 frame | 928.2 ms |

**These are not a frame rate and are not presented as one.** This environment has no GPU;
headless Chromium runs ANGLE over SwiftShader. Software rasterisation of a 1600×900 frame
with a full post chain costs ~800 ms and tells you nothing about a machine with a GPU.

`tools/bench.mjs` deliberately refuses to print an fps pass/fail for this reason, rather
than emitting a number that would be repeated as if it meant something.

The one timing that *is* meaningful is **simulation step cost: 0.60 ms**. That is pure
CPU — fixed-step physics, combat resolution, AI and salvage for thirteen ships with
projectiles in flight — and it is hardware-independent enough to be useful. At a 16.7 ms
frame budget the simulation is using under 4% of it, so the frame cost on real hardware
will be dominated by rendering, which is where the draw-call number matters.

## Status against the acceptance criteria

| Criterion | Result |
|---|---|
| 60 fps at 1440p on an Apple laptop | **UNVERIFIED** — not measurable here, not claimed |
| 1% lows above 50 fps | **UNVERIFIED** — same |
| Benchmark scene contains 200+ debris, 12 combat ships, 1 capital, full post chain | **PASS** |
| Draw calls under a committed ceiling, measured and reported | **FAIL** — 650 against a committed 320, reported |

Closing the first two requires running `npm run bench` on the target machine. Closing the
fourth requires the merge work above; it is understood, not mysterious.
