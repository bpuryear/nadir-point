# Where the frame time went

**A-0. Bisect, attribution, and a ranked list of fixes.**

Every number here was measured on this tree, on hardware rasterisation (ANGLE/Metal,
Apple M5, 10 GPU cores), at 2560×1440, with `NP_RASTER=hardware`. Tools written for this
pass: `tools/perfbisect.mjs`, `tools/perfattrib.mjs`, `tools/gates.mjs`. One existing
tool was changed, `tools/harness.mjs`, for the reason in §1.4.

Measured against `37252e9`. `ec0af68` landed underneath me while this ran and is
`docs/design/ship-redesign.md` alone — `git diff --stat 37252e9..ec0af68` is one file,
858 insertions, no `src/` — so every figure below still describes the current tree.

---

## 0. Four things that are not what the brief says

The brief asked me to bisect **423 draw calls / 82.8 fps** at `c9bfd00` down to
**506 / 29.2 fps** at HEAD: *"+86 draw calls for +7k triangles, and frame time went
12.1 ms to 34.2 ms."* I bisected it. All four of those quantities are wrong, and the
corrections change what this wave should do.

### 0.1 There was no draw-call regression. There was never even a change.

Interleaved A/B, three pairs, `c9bfd00` against HEAD, idle machine:

```
$ NP_RASTER=hardware node tools/perfbisect.mjs --ab c9bfd00,37252e9 --repeats 3
[perfbisect] interleaved A/B: A=c9bfd00 B=37252e9, 3 pair(s), 420 frames each
  pair 0   A 11.27 ms (419 calls)   B 14.08 ms (419 calls)   B-A +2.81 ms   B/A 1.249x
  pair 1   A 11.26 ms (419 calls)   B 14.09 ms (419 calls)   B-A +2.83 ms   B/A 1.251x
  pair 2   A 11.26 ms (419 calls)   B 14.11 ms (419 calls)   B-A +2.85 ms   B/A 1.253x

  median B-A  +2.83 ms   range 2.81 .. 2.85
  median B/A  1.251x   range 1.249 .. 1.253
```

**419 draw calls at both ends of the range.** Not 423 → 509. The 45-commit table in §2.1
never leaves the 504–511 band. The "+86 draw calls" does not exist at any commit.

### 0.2 The frame-time regression is real, it is +25%, and it is one commit.

`c9bfd00` **11.26 ms** → HEAD **14.09 ms**. Not 12.1 → 34.2. And ~all of it lands on one
commit, `6ae7df9`, "The field is lit and the giant is in the sky, and it overshot":

```
$ NP_RASTER=hardware node tools/perfbisect.mjs --ab ff46b6f,6ae7df9 --repeats 3
  pair 0   A 11.75 ms (422 calls)   B 15.28 ms (424 calls)   B-A +3.53 ms   B/A 1.300x
  pair 1   A 11.76 ms (422 calls)   B 15.30 ms (424 calls)   B-A +3.54 ms   B/A 1.301x
  pair 2   A 11.77 ms (422 calls)   B 15.27 ms (424 calls)   B-A +3.50 ms   B/A 1.297x

  median B-A  +3.53 ms   median B/A  1.300x   range 1.297 .. 1.301
```

**+30% of frame time for +2 draw calls and +32 triangles.** `033ea90` (W7 — the warp
amplitude fix, taps 19 → 10, nebula deleted) later gave back ×0.941. 1.300 × 0.941 =
1.223 against 1.251 measured end to end; the residue is the sub-noise drift of the other
forty-three commits.

### 0.3 `npm run bench` PASSES both frame-rate criteria at HEAD. It fails only draw calls.

Four consecutive runs, idle machine, nothing else on the GPU:

```
  FAIL  draw calls (peak)  419  ceiling 320   mean 14.0 ms  71.2 fps   p99 15.3 ms  65.4 fps
  FAIL  draw calls (peak)  419  ceiling 320   mean 14.1 ms  71.0 fps   p99 15.4 ms  64.9 fps
  FAIL  draw calls (peak)  419  ceiling 320   mean 14.1 ms  71.0 fps   p99 15.3 ms  65.4 fps
  FAIL  draw calls (peak)  419  ceiling 320   mean 14.1 ms  71.0 fps   p99 15.3 ms  65.4 fps

  PASS  60 fps @ 2560x1440        measured 71.0 fps mean
  PASS  1% lows above 50 fps      measured 65.4 fps at p99
```

And at `--quality medium`, **BUDGET: PASS** outright: 227 calls, 78,071 triangles,
11.3 ms / 88.2 fps mean, 12.7 ms / 78.7 fps at p99.

### 0.4 The "29.2 fps" is another agent's benchmark running on the same GPU.

Partway through my first attribution sweep the idle baseline stepped from ~34 ms to
~21 ms and stayed there. `ps` found why:

```
98.8 0.8 node /tmp/np-spec-hi.mjs
14.9 0.4 .../chrome-headless-shell --type=gpu-process
 8.6 1.0 .../chrome-headless-shell --type=renderer
```

Another stream was running its own headless GPU benchmark. **The same commit, same tool,
same machine, measured 34.2 ms contended and 14.1 ms idle — a factor of 2.4.** The
attribution sweep's baseline series moved between 20.7 ms and 38.8 ms inside one run.

Nothing in this repo detects that. `tools/bench.mjs` will print a frame rate and a
PASS/FAIL under either condition with equal confidence, and this project runs several
agents on one laptop by design. **Every absolute millisecond recorded in this repo is
suspect unless the run is known to have been alone on the GPU.** §7 proposes the guard.

---

## 1. Method

### 1.1 One detached sparse worktree per candidate

`docs/` is 240 MB of review captures against a 3.5 MB `src/`; a full worktree per commit
is 8.6 GB for this range. `tools/perfbisect.mjs` creates ONE detached worktree with the
sparse spec `/*` minus `/docs/` — everything the bundle needs — symlinks `node_modules`
back to the main tree, and moves it between commits with `git checkout --detach`. The
shared main tree, which other streams are writing to right now, is never touched.

### 1.2 The measurement harness is single-variable across the whole range

Not assumed. Checked:

```
$ git log --oneline c9bfd00~1..HEAD -- tools/bench.mjs tools/harness.mjs probe.html
c9bfd00 Measure on real hardware, and fix the quality flag that made it impossible
```

`bench.mjs`, `harness.mjs` and `probe.html` have not been touched since the commit that
introduced hardware rasterisation. Every row in §2.1 is the same tool measuring a
different `src/`.

### 1.3 Interleaving, and A-B-A, because this machine is not stable

`--ab A,B --repeats N` alternates A,B,A,B,… and reports the median per-pair difference
and the **ratio**. The ratio is what to quote on a contended machine: it survives a clock
change that a millisecond difference does not. The three pairs in §0.2 span 0.004 of a
ratio.

The attribution sweep's first version measured one baseline at the top and subtracted it
from every row. It reported that **hiding the player's cruiser made the frame 3.90 ms
slower** and hiding all twelve hostiles 4.51 ms slower. Drawing less cannot cost more, so
that was the rig, not the scene. Every probe now sits between two baseline measurements
and is scored against their mean, the baseline series is printed, and its spread is
reported as the noise floor. After the change every geometry row lands within 0.19 ms of
zero — which is the answer that is physically possible.

### 1.4 The change to `tools/harness.mjs`, and the evidence it is safe

`tools/perfattrib.mjs` reported **five different configurations at exactly "8.33 ms"** —
three post-chain combinations and two render scales, which have no reason to cost the
same. They did not. 8.333 ms is 1/120 s. Chromium drives `requestAnimationFrame` from a
BeginFrame source at the display's refresh rate, and this panel is 120 Hz, so **no
rAF-timed tool in this repo could ever report a frame faster than 8.33 ms.** A benchmark
whose job is to find headroom must not be capped at the refresh rate, because headroom is
the region above it.

`--disable-gpu-vsync --disable-frame-rate-limit` removes it. **My first version put those
two flags straight into `HARDWARE_ARGS`, and that broke a gate silently — which is the
exact failure mode this repo keeps writing comments about, so it is recorded here rather
than quietly fixed.**

```
  flags in HARDWARE_ARGS:   node tools/poicheck.mjs  →  FAIL: only 0 of 3 POIs were reached on the live path
  flags removed:            node tools/poicheck.mjs  →  poicheck ok
```

Nothing about the POIs changed. **The tools that drive the game advance it by counting
frames.** Uncapping the frame rate makes one frame worth several times less wall clock
and therefore several times less simulated time, so a settle loop that used to cover a
journey now covers a fraction of one. Every frame-counting tool in `tools/` has that
shape, and none of them would have said so — `poicheck` would simply have started
reporting that the game does not travel.

So it is **opt-in**: `NP_UNCAP_FPS=1`, off by default, exported as
`harness.mjs#frameRateUncapped()`. `tools/perfattrib.mjs` sets it for itself, because it
measures milliseconds and advances no game progress by frame count. Everything else is
bit-for-bit unchanged.

Verified after the change:

```
  poicheck  (default, cap on)      poicheck ok
  bench     (default, cap on)      419 draw calls   mean 14.1 ms   71.0 fps
  bench     (NP_UNCAP_FPS=1)       419 draw calls   mean 14.1 ms   71.0 fps
  perfattrib (self-uncaps)         res:scale=0.5  3.66 ms  vs local base 13.79   -10.13 ms
```

`bench` is identical either way — the frame is well above the cap, so no number already
recorded is invalidated. The last line is a measurement that was impossible an hour ago.

---

## 2. The bisect

### 2.1 Per-commit table

`NP_RASTER=hardware node tools/perfbisect.mjs --from c9bfd00 --to 37252e9`, 420 frames,
quality=high, 2560×1440, one run each, 45 commits.

**These absolute values were taken while the other stream's benchmark was running**
(§0.4). The *deltas between adjacent rows* are what this table is for; §2.2 re-measures
the rows that matter on an idle machine, interleaved.

| commit | draw calls | triangles | mean ms | fps | delta ms | subject |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `c9bfd00` | 510 | 137,459 | 29.5 | 33.9 | — | Measure on real hardware, and fix the quality flag |
| `0c30f6c` | 510 | 137,459 | 29.4 | 34.1 | -0.1 | The detached-geometry defect was the detector |
| `692034b` | 510 | 137,459 | 29.6 | 33.7 | +0.3 | Make the ownership table name only files that exist |
| `05e8e08` | 510 | 137,459 | 29.2 | 34.2 | -0.4 | Diagnose the black wide shot **← the commit that wrote "82.8 fps"** |
| `c2fd32e` | 510 | 137,459 | 29.4 | 34.0 | +0.2 | Add tools/widediag.mjs |
| `72460bc` | 510 | 137,459 | 29.4 | 34.0 | +0.0 | Re-score the acceptance sheet against hardware measurements |
| `9eed69c` | 510 | 137,459 | 29.4 | 34.0 | -0.0 | Record the recon briefs and the parallel wave plan |
| `977e6ca` | 510 | 137,459 | 29.4 | 34.0 | +0.0 | Fix the refit double-mirror |
| `4b7c66d` | 510 | 137,459 | 29.3 | 34.1 | -0.1 | Register one player_cruiser |
| `34c6788` | 508 | 137,347 | 29.5 | 33.9 | +0.1 | Point every firing arc at its own flank, 13 muzzle sets |
| `752e34a` | 508 | 137,347 | 29.6 | 33.8 | +0.1 | W1-D systems depth |
| `2232a8e` | 508 | 137,347 | 29.4 | 34.0 | -0.2 | Three POIs measured to have three suns |
| `aefe2e2` | 508 | 137,347 | 29.3 | 34.1 | -0.1 | Record the noise floor on the cruiser probe |
| `2190a3b` | 510 | 137,347 | 29.3 | 34.1 | +0.0 | ui: make the welded layer a function of the frame |
| `30841d1` | 508 | 137,347 | 29.4 | 34.0 | +0.1 | Close the four defects the Wave 1 critics found |
| `be5f37b` | 510 | 137,347 | 29.7 | 33.7 | +0.3 | Ripple the battery fore-to-aft |
| `017a12c` | 508 | 137,347 | 29.3 | 34.1 | -0.4 | D67 is not landed, not insufficient, not misdiagnosed |
| `d7b81ce` | 508 | 137,347 | 29.4 | 34.0 | +0.1 | Make the ripple visible and audible |
| `a0d9d6d` | 508 | 137,347 | 29.6 | 33.8 | +0.2 | Make the ripple readable |
| `ed41c22` | 508 | 137,379 | 29.7 | 33.6 | +0.2 | D67: one unclamped varying was taking the whole frame to black |
| `14b4ecf` | 510 | 137,347 | 29.8 | 33.6 | +0.0 | Add the armament screen capture |
| `773e8c6` | 508 | 137,347 | 29.6 | 33.8 | -0.2 | Rewrite the handoff against what two waves actually landed |
| `a003fa9` | 510 | 137,347 | 29.6 | 33.8 | +0.0 | Re-score the two scale rows |
| `6f46385` | 508 | 137,347 | 29.5 | 33.9 | -0.1 | The hull read at one value: a shader constant lerped it to grey |
| `8e64709` | 508 | 137,347 | 29.6 | 33.8 | +0.1 | Give power a demand side |
| `3141290` | 510 | 137,347 | 29.6 | 33.8 | +0.0 | Bill the player's hangar deck to the player |
| `d3e1c07` | 510 | 137,347 | 29.5 | 33.9 | -0.1 | The screen did not answer the guns: five readouts |
| `888409e` | 508 | 137,347 | 29.5 | 33.9 | -0.0 | Record what the demand side did to every consumer |
| `e7821bf` | 510 | 137,347 | 29.8 | 33.6 | +0.3 | Attribute the 1.24 px roll figure to the review |
| `11b6b98` | 508 | 137,347 | 29.6 | 33.7 | -0.1 | The plate layout was normal-only |
| `f5ef075` | 508 | 137,347 | 29.6 | 33.8 | -0.1 | Give the player guns and the graveyard a past |
| `9772f51` | 510 | 137,347 | 29.7 | 33.7 | +0.1 | Record the owner's six reference frames |
| `9d662e1` | 508 | 137,347 | 29.6 | 33.8 | -0.1 | The escalation ladder had never once fired in a game |
| `49e0a3f` | 510 | 137,347 | 29.5 | 33.9 | -0.1 | Count the live responses instead of filtering for them |
| `0d4d18e` | 511 | 138,307 | 29.9 | 33.5 | +0.3 | Research: why the field is black, measured three ways |
| `d6ef334` | 509 | 138,307 | 30.2 | 33.2 | +0.3 | R2's chroma target was arithmetically impossible |
| `4edef63` | 509 | 138,307 | 30.2 | 33.2 | -0.0 | Guard the fleet anchor |
| `ea040ee` | 509 | 138,307 | 30.3 | 33.0 | +0.1 | Measure the field, and find R1 was closed a commit ago |
| `e86771a` | 509 | 138,307 | 30.0 | 33.3 | -0.3 | Pass 13 rotated R/B |
| `ff46b6f` | 511 | 138,303 | 30.1 | 33.2 | +0.1 | The drives were long only at flank |
| **`6ae7df9`** | **511** | **138,335** | **37.2** | **26.9** | **+7.1** | **The field is lit and the giant is in the sky, and it overshot** |
| `0d9d58e` | 511 | 138,343 | 37.2 | 26.9 | -0.0 | Every gate passes and it looks like green marble |
| **`033ea90`** | **504** | **138,275** | **34.3** | **29.2** | **-2.9** | **The wall came down, and the thing that made it was a warp amplitude** |
| `f63a15d` | 506 | 138,275 | 34.3 | 29.2 | -0.0 | Aim the galactic band 14 degrees off the subject |
| `37252e9` | 506 | 138,275 | 34.2 | 29.3 | -0.1 | Record that the rust pass failed |

**Forty-three commits move the frame by less than the run-to-run noise. Two move it. Both
are the celestial field, and neither changes the draw-call count by more than seven.**
Waves 1–5 — the salvo, the ripple, thirteen muzzle sets, the power demand side, five HUD
readouts, the escalation ladder, the graveyard's past — cost nothing measurable at all.

### 2.2 `6ae7df9` shipped without the gate that would have caught it

Its own commit message lists what it ran:

> `Gates: smoke ok 269 calls | selftest 54/54 | poicheck 16/16 | escalation 28/28 | widediag close --assert 1/1 | fieldcheck 4/4.`

**`bench` is not in that list.** It is the only gate that measures a clock, and it is the
only one that was not run. Four commits later `033ea90` *did* run it and recorded
"36.6 ms mean vs HEAD's 39.2 ms measured by stashing `src/`" — the regression was plainly
visible to the first person who looked. It was not hidden; it was unmeasured.

### 2.3 The `82.8 fps` baseline is not a measurement of anything in this range

`HANDOFF.md:96`, repeated at `docs/review/acceptance.md:14-17`:

| quality | draw calls | triangles | mean | 1% low |
|---|---|---|---|---|
| high | 423 | 131,003 | 82.8 fps | 68.5 fps |
| medium (GTAO off) | 231 | 75,901 | 102.1 fps | 78.1 fps |

`git log -S "82.8 fps" -- HANDOFF.md` puts it at **`05e8e08`**, four commits into the
range — a commit this bisect measures at 510 calls and 29.2 ms.

**The medium row reproduces. The high row does not, and the medium row is what proves it.**

* medium, then: 231 calls, 75,901 tris, 9.8 ms — the run committed as
  `docs/review/benchmark.json`, unchanged from `c9bfd00` through HEAD.
* medium, now, this machine: **227 calls, 78,071 tris, 11.3 ms.** Same configuration,
  same class of number.
* high, then: 423 calls, 131,003 tris, 12.1 ms.
* high, now, this machine: **419 calls, 135,237 tris, 14.1 ms.**

If a faster machine explained the high row, it would have moved the medium row by the
same factor. It did not move it at all. 131,003 triangles does not occur anywhere in the
range (137,347 – 138,343), and neither does 423 calls. **The high row is not a
measurement of the high path**, and `acceptance.md:14` and `:15` — the two rows that moved
UNVERIFIED → PASS on the strength of it — rest on it. They happen to be true today
(§0.3), for different reasons, and they should be re-scored against a run that exists.

---

## 3. Where the frame time actually is

`NP_RASTER=hardware node tools/perfattrib.mjs --frames 300 --settle 60 --repeats 3`,
benchmark scene, 2560×1440, quality=high, idle machine, frame-rate ceiling removed.
Each row is A-B-A against local baselines; the figure is the median of three passes.

### 3.1 Scene census and draw-call ledger

```
SCENE CENSUS
  systems     materials, palette, lighting, celestials, fields, refit, combat, vfx
  ships       13          wrecks      0           meshes          265
  instanced   24          instances   963         shadowCasters   232
  farObjects  10          drawingBuffer 2560x1440 composerSamples 4
  quality     high        presetMsaa  4           presetRenderScale 1

DRAW-CALL LEDGER (the busiest single frame of 90, attributed to the pass that issued them)
  farPass (celestials)         on   calls   10   triangles    23518
  mainPass (gameplay+shadow)   on   calls  200   triangles    54628
  gtao                         on   calls  190   triangles    53764
  godrays                      on   calls    1   triangles        1
  bloom                        on   calls   13   triangles       13
  output (ACES)                on   calls    1   triangles        1
  grade                        on   calls    1   triangles        1
  smaa                         on   calls    3   triangles        3
  TOTAL                              calls  419
```

The historical claim — *"192 of the draw calls are GTAO's prepass drawing the scene
twice"* — **is correct and still true**: 190 of 419, 45%. The gameplay scene issues 200
including the shadow map, the backdrop 10, and the whole post chain after GTAO issues 19.

### 3.2 The frame is 99% fill-bound

Three resolution points, nothing else changed:

| render target | share of pixels | ms | ms ÷ baseline |
| --- | ---: | ---: | ---: |
| 2560×1440 | 100% | 14.08 | 1.000 |
| 1920×1080 | 56.3% | 7.82 | 0.555 |
| 1280×720 | 25% | 3.56 | 0.262 |

Least squares on the three: **frame ÷ baseline = 0.0102 + 0.9859 × (pixel share)**,
fitting all three points to within 0.0094. The intercept — everything that does *not* scale with pixels,
which is the CPU, the driver and all 419 draw submissions — is **1% of the frame, about
0.15 ms**.

**This is the single most important number for the redesign wave.** The frame is not
draw-call bound and it is not triangle bound. It is fragments, essentially all of it.

> `docs/review/benchmark.json` reports `cpuMs: 10.8`, which reads like a contradiction.
> It is not a CPU figure: `src/core/loop.js:154` computes it as wall-clock across the
> whole frame callback, which includes the driver blocking on GPU work. `stepMs` (0.0–0.2)
> is the honest CPU number and it is 1.4% of the frame.

### 3.3 The single-variable table

Baseline 14–15 ms. "ms recovered" is what removing that one thing gives back.

| variable removed | ms | ms recovered | % of frame | draw calls | what it is |
| --- | ---: | ---: | ---: | ---: | --- |
| `res:scale=0.5` | 3.56 | **10.02** | 74% | 443 | 1280×720 — the fill-bound control |
| `combo:all-post-fill` | 5.40 | **9.44** | 64% | 481 | MSAA 4→2 + SMAA off + dome baked + GTAO half-res |
| `combo:msaa2+nosmaa+domeflat` | 5.51 | **9.12** | 62% | 448 | MSAA 4→2 + SMAA off + dome baked |
| `msaa:samples=0` | 5.92 | **8.29** | 58% | 406 | the 4× multisampled half-float composer target |
| `combo:msaa2+nosmaa` | 8.20 | **6.84** | 45% | 400 | MSAA 4→2 + SMAA off |
| `res:scale=0.75` | 7.82 | 6.26 | 44% | 458 | 1920×1080 |
| `msaa:samples=2` | 10.22 | **4.52** | 31% | 487 | MSAA 4 → 2 |
| `post:smaa=off` | 10.83 | **3.13** | 22% | 441 | SMAA, three full-screen passes |
| `far:ALL-hidden` | 11.73 | 3.01 | 20% | 477 | the entire celestial backdrop |
| `post:gtao=off` | 11.56 | **2.62** | 18% | 254 | GTAO — and 190 of the 419 draw calls |
| `far:dome-flat` | 13.32 | **2.44** | 16% | 455 | dome drawn with a CONSTANT COLOUR: same draw, same fill, zero noise taps |
| `far:dome-hidden` | 14.29 | 2.32 | 14% | 426 | the dome not drawn at all |
| `post:grade=off` | 12.76 | 1.94 | 13% | 390 | aberration + grain + dither |
| `post:bloom=off` | 12.60 | 1.44 | 10% | 466 | UnrealBloom mip chain at bloomRes 0.6 |
| `post:godrays=off` | 13.02 | 1.18 | 8% | 502 | radial blur, 24 taps |
| `gtao:half-res` | 13.98 | 0.31 | 2% | 399 | GTAO resolve at 1280×720, prepass unchanged |
| `far:dust-hidden` | 14.66 | 0.26 | — | 486 | dust lane quads |
| `ships:hostiles-hidden` | 14.78 | **0.19** | 1.3% | 269 | **all twelve non-player ships** |
| `fields:asteroids` | 14.91 | 0.18 | — | 376 | instanced asteroids |
| `shadow:map=off` | 14.92 | 0.17 | 1.1% | 328 | one directional key, 2048² shadow map |
| `ships:player-hidden` | 14.39 | **0.15** | 1.0% | 311 | **the entire fitted player cruiser** |
| `fields:debris` | 14.79 | 0.09 | — | 475 | instanced debris and plumes |
| `vfx:ALL-hidden` | 14.44 | **0.03** | 0.2% | 473 | **every VFX system at once** |
| `far:giant-hidden` | 14.89 | 0.04 | — | 485 | gas giant body, halo and rings |
| `far:starfield-hidden` | 15.46 | −0.01 | — | 396 | star points |
| `vfx:particles / shields / damage / weapons / explosions / rings / plumes` | | ≤0.07 | — | | each one, individually |

---

## 4. The four candidates, each isolated

### 4.1 GTAO — real, second-largest single pass, and the draw-call story is entirely its own

**2.62 ms, 18% of the frame, and 190 of the 419 draw calls.** `gtao:half-res` recovers
only 0.31 ms, so the cost is the **prepass redrawing the scene**, not the AO resolve —
halving the resolve target buys nothing.

Two consequences. First, the draw-call budget conversation is a GTAO conversation:
scene geometry issues 200 calls, inside the 320 ceiling, and has been the whole time.
Second, `--quality medium` already turns it off and lands the entire budget green
(§0.3), so there is a shipped configuration that passes today.

### 4.2 The salvo/VFX work — measurably free

**Every VFX system hidden at once: 0.03 ms.** Individually, plumes, weapons, particles,
rings, shields, explosions and damage are each within 0.08 ms of zero — below this rig's
resolution. Muzzle flashes, ember trails and dust lanes cost nothing. The suspicion in
the brief is wrong, and §2.1 agrees: the salvo and ripple commits (`be5f37b`, `d7b81ce`,
`a0d9d6d`, `34c6788`) move the frame by ±0.3 ms, i.e. noise.

### 4.3 The field shader — F3 is answered, and the answer is BAKE

`docs/design/space-backgrounds.md:1015` calls F3 *"the single most important measurement
in the document"* and sets the rule: **< 0.5 ms ship the live shader; > 2 ms the bake is
mandatory.** It specifies the exact experiment — swap the dome for a constant colour and
diff the frame time on hardware at 2560×1440. That is `far:dome-flat`.

```
  far:dome-flat     13.32 ms   -2.44 ms    (same one draw call, same fill, zero noise taps)
  far:dome-hidden   14.29 ms   -2.32 ms    (the dome not drawn at all)
```

**2.44 ms. Over the 2 ms line. The bake is mandatory.**

And the second row is the finding inside the finding: **hiding the dome entirely recovers
*less* than replacing its shader with a constant.** The two are within 0.12 ms of each
other, which means the dome's geometry, its one draw call and its full-screen fill are all
free, and **100% of its cost is the fragment shader.** A bake keeps the fill and deletes
the taps, so a bake captures essentially the whole 2.44 ms.

This also names the mechanism of §0.2. The dome ships `FIELD_TAPS` = 10 noise
evaluations per pixel (`field.glsl.js:161-167`), and `far:dome-flat` prices all ten at
2.44 ms — **0.244 ms per evaluation**. `field.glsl.js:120` independently measured 0.185
and 0.179 ms per evaluation, on different hardware, by a different method (sweeping the
octave counts). Same order, same story: **the field's cost is linear in the tap count and
nothing else about the dome costs anything.**

`033ea90` is the third measurement of the same thing from the other direction — it cut
the taps 19 → 10 and gave back ×0.941 — though it also deleted the nebula and rebuilt the
starfield in the same commit, so it does not divide cleanly per tap and I am not going to
pretend it does.

The ten taps that ship are 2.44 ms, **4.9× F3's 0.5 ms "ship it live" threshold**.
`field.glsl.js:122-124` already concluded that the cheapest possible form of this
construction is 8 evaluations because a 2-level warp costs six fbm calls before it draws
anything. It is right, and the octave dial cannot reach the threshold from here.

### 4.4 The arrival fit and the six seeded wrecks — they do NOT reach the benchmark scene

They reach the game only. `src/probes/benchmark.js` imports materials, POI lighting,
celestials, fields, module and ship geometry, the cruiser, hardpoints, refit and VFX —
and nothing else. It never imports `world/index.js`, which is the only place
`FactionWarSystem` is constructed for the game (`src/world/index.js:56`), so
`POIWarState.seedHistory` never runs.

Measured both ways, `tools/perfattrib.mjs` prints the census on every run:

| | benchmark probe | game, graveyard POI |
| --- | ---: | ---: |
| `world.wrecks` | **0** | **6** |
| ships | 13 | 1 |
| meshes | 265 | 152 |
| shadow casters | 232 | 142 |
| draw calls (ledger total) | 419 | **262** |
| mean frame | 14.1 ms | **15.5 ms** |

Six is right: the graveyard is `heat 0.72, value 0.90` (`src/world/system.js:287`), and
`seedHistory` takes `round(heat × value × 9)` = 6.

So the benchmark **overstates** ship count and draw calls and **understates** wrecks.
Neither matters much, because the frame times are within 1.4 ms of each other — which is
§3.2 again: the content is not what costs. But the benchmark scene is not the player's
frame, and nobody should reason about the player's frame from it. Both are fill-bound and
both are dominated by the same post chain.

---

## 5. Two quality knobs that have never been read

`src/render/postfx.js:183-186` declares:

```js
low:    { gtao: false, godrays: false, bloom: true,  smaa: true,  msaa: 0, bloomRes: 0.5,  godraySamples: 0,  renderScale: 0.85 },
medium: { gtao: false, godrays: true,  bloom: true,  smaa: true,  msaa: 2, bloomRes: 0.5,  godraySamples: 16, renderScale: 1.0 },
high:   { gtao: true,  godrays: true,  bloom: true,  smaa: true,  msaa: 4, bloomRes: 0.6,  godraySamples: 24, renderScale: 1.0 },
ultra:  { gtao: true,  godrays: true,  bloom: true,  smaa: true,  msaa: 4, bloomRes: 0.75, godraySamples: 40, renderScale: 1.0 },
```

`setQuality` (`postfx.js:375-385`) reads `gtao`, `godrays`, `godraySamples`, `bloom`,
`smaa`. **It never reads `msaa` and never reads `renderScale`.** The sample count is
hard-coded at `postfx.js:223` (`samples: 4`), and `grep -rn "msaa\|renderScale" src/`
over the whole tree returns exactly five lines: the four declarations above and one
comment at `postfx.js:175` describing what `msaa` would do if anything read it.

So:

* **`low` and `medium` pay 4× MSAA on a 2560×1440 half-float target**, which the table
  says they should not, and which §3.3 prices at 4.52 ms for the first step down alone.
* **`low`'s `renderScale: 0.85` has never rendered a single frame at 0.85.** The
  measured value of a render scale on this frame is 6.26 ms at 0.75 (§3.3).

This is the same class of defect as the one `renderer.js:129-139` already documents in a
long comment — `?quality=` silently doing nothing for the life of the project because
`PostChain` was constructed before `opts.quality` was resolved. That one was found and
fixed at `c9bfd00`. **Two more knobs in the same table were left dead by the same fix.**

---

## 6. Ranked fixes

Baseline 14.1 ms / 71 fps at 2560×1440 quality=high, idle. `bench`'s own targets are
16.7 ms mean and 20 ms at p99, both of which already pass; the point of this list is the
**headroom the redesign wave gets to spend**, and combinations were measured together,
not summed.

| # | change | ms recovered | measured how | risk |
|---|---|---:|---|---|
| **1** | **Make `QUALITY_PRESETS[].msaa` actually be read, and set `high` to 2** | **4.52** | `msaa:samples=2`, 3 passes, spread 0.70 | SMAA is still in the chain behind it. The 4→2 step is the cheapest quality-per-millisecond trade in the frame. |
| **2** | **Drop SMAA while MSAA is on** | **3.13** | `post:smaa=off`, spread 0.40 | `postfx.js`'s own comment says once MSAA is in the chain SMAA "only has sub-pixel work left to do". Needs one A/B capture to confirm by eye. |
| **3** | **Bake the dome field to a cubemap (F3 item 4)** | **2.44** | `far:dome-flat`, spread 0.52 | None to the look — the bake is defined to reproduce it. Costs the bake path and, by `space-backgrounds.md`'s own sizing, 12.6 MB. F3 says mandatory above 2 ms. |
| **4** | **GTAO: reuse the main depth buffer instead of redrawing the scene** | **≤2.62** | `post:gtao=off` bounds it; `gtao:half-res` (0.31) proves the cost is the prepass | Real work. The 2.62 ms is the ceiling; sharing depth should recover most of it and also returns **190 draw calls**. |
| 5 | Grade: fold the dither/grain into `OutputPass` rather than a separate full-screen pass | ≤1.94 | `post:grade=off`, spread 0.19 | Merging passes on a fill-bound frame is a real saving; the grade itself must stay. |
| 6 | `bloomRes` 0.6 → 0.45 | ≲1.44 | `post:bloom=off` bounds it | Partial of the bound, not all of it. |
| 7 | `godraySamples` 24 → 16 | ≲1.18 | `post:godrays=off` bounds it | `medium` already runs 16. |
| — | *anything on the geometry side* | **≤0.19** | every geometry probe in §3.3 | **Do not do this.** |

**The single change that buys the most is #1**, and it is not a trade so much as a bug
fix: the preset table has said `msaa: 2` for `medium` since it was written, nothing has
ever read it, and reading it is worth 4.52 ms — 31% of the frame.

**Measured together, #1 + #2 + #3 give 9.12 ms: 14.63 ms → 5.51 ms, 2.7×, 182 fps.**
Adding a half-resolution GTAO resolve on top (`combo:all-post-fill`) reaches 5.40 ms.
That is where the headroom for the redesign is.

### What this means for the redesign wave

The owner's rule for the wave — *spend triangles freely, spend draw calls almost not at
all* — is right about triangles and **more generous than it needs to be about draw calls**:

* The entire fitted player cruiser costs **0.15 ms** of a 14.1 ms frame. Delete it and
  you cannot see the difference in the p99.
* All twelve hostile ships cost **0.19 ms**.
* The shadow map over 232 casters costs **0.17 ms**.
* 419 draw calls and everything else that does not scale with pixels cost **~0.15 ms**
  total (§3.2).

0.15 ms is the cruiser's **entire** cost — vertices, fragments, draw calls, shadow-map
pass, all of it. If cost scaled linearly with triangles, **ten times the geometry would be
about 1.5 ms**, against the 9.12 ms §6 #1–#3 hand back. That is the trade, stated as
arithmetic rather than as permission: the redesign can afford an order of magnitude more
geometry out of the post chain's pocket, and it would still be measurable, so it should
still be measured. (Linear-in-triangles is the pessimistic assumption; the cruiser's share
of the frame is small enough that it is not resolvable from these three resolution points.)

The one caution stands and is worth restating precisely: a new *material* costs a program
and a state change, and a new full-screen or large-area *transparent* surface costs fill,
which is the only currency this frame really spends. More faceted detail inside the same
merged meshes and the same materials is close to free.

The 320 draw-call ceiling should also be restated. It was written to bound scene
complexity; 190 of the 419 belong to a post-processing pass, and the scene's own 200 are
inside it. Either count the ceiling at `mainPass` — where §3.1's ledger now makes that
possible — or state it as 320 scene + whatever the post chain needs.

---

## 7. The gate

`npm run bench` was in no gate list. It is now `tools/gates.mjs`, which runs the whole
list as an array rather than as prose in three documents:

```
$ NP_RASTER=hardware node tools/gates.mjs
GATES  raster=hardware  frame time IS meaningful here
12 gate(s)

  selftest     … PASS  0.1s   headless checks over the whole sim stream
  ripple       … PASS  0.2s   salvo ripple wave
  flight       … PASS  0.1s   flight model
  escalation   … PASS  1.5s   escalation ladder actually fires
  economy      … PASS  0.1s   economy closure
  poicheck     … PASS  5.4s   POI lighting rigs
  ships-audit  … PASS  0.1s   class silhouettes held apart by measured outline distance
  mods-audit   … PASS  0.1s   same-mount module silhouettes held apart
  smoke        … PASS  4.6s   boots with no console error
  uicheck      … PASS  13.8s   contrast and panel layout
  widediag     … PASS  6.7s   the close shot is not black
  bench        … FAIL  12.2s   draw-call / triangle / program budgets AND frame time at 2560x1440

--- bench FAILED (exit 1) ---
  PASS  60 fps @ 2560x1440        measured 71.1 fps mean
  PASS  1% lows above 50 fps      measured 62.9 fps at p99
  BUDGET: FAIL

11/12 gates pass
A BUDGET GATE FAILED. This is the class of gate that goes stale when it is
not run every wave — do not defer it to a review pass.
```

That is the honest state of HEAD: **eleven green, and `bench` failing on the draw-call
ceiling alone while passing both frame-rate criteria.** The silhouette gates that protect
the redesign — `ships-audit` and `mods-audit` — are among the green.

`bench` is marked `budget: true`; the run exits non-zero when it fails and says so
explicitly, because a budget gate is the class that goes stale when it is not run every
wave. `--fast` skips the four browser gates; `--only <id>` runs one. It does not stop at
the first failure — a run that dies on gate 2 of 12 tells you one thing, a run that
reports all twelve tells you what you broke and what you did not.

**It cannot be wired up from inside my write scope.** `package.json` needs one line, and
the three prose gate lists need to point at it. Those are in §8.

### And the gate needs a contention guard

§0.4 is not a one-off. This project runs several agents on one laptop and the same commit
measured 14.1 ms and 34.2 ms. A frame-rate gate that cannot tell those apart will fail
green work and pass regressions, in whichever direction the other agent happens to be
running. **`bench` should measure a fixed reference workload — a full-screen shader of
known cost, a few hundred frames — before and after the scene, and refuse to assert a
frame rate if the two disagree by more than a few percent.** That is a change to
`tools/bench.mjs`, which is a gate other streams are running right now; I have not made
it mid-wave. It is filed in §8.

Two smaller instrument defects found while measuring, both filed:

* **Peak draw calls are a function of frame rate.** `src/probes/benchmark.js:163` advances
  the camera by `dt * 0.05` — wall-clock — while `bench.mjs` takes the *peak* over
  `--frames` samples. A slower run sweeps further and catches a higher peak. Measured:
  `--frames 120` → **399** peak calls, `--frames 420` → **419**, same commit, same
  machine, same second. The peak triangle count moves the same way (135,237 idle vs
  138,315 contended). The sweep should advance by a fixed increment per frame.
* **`benchmark.json`'s `cpuMs` is not a CPU figure** (`src/core/loop.js:154`) and reads
  like one. §3.2.
* **`bench` overwrites `docs/review/benchmark.json` on every run**, so anything that runs
  the gate list rewrites a committed review artefact as a side effect. Every measurement
  in this document was taken with `--json` pointed at a scratch path for that reason, and
  the one run that went through `tools/gates.mjs` had the file restored byte-for-byte to
  the state it was in before this pass. `bench` should take `--json` or write nothing.

---

## 8. Requests — outside A-0's write scope

I write only `tools/**` and this file. These are the changes the measurements call for
and someone else must land.

1. **`package.json`** — add `"gates": "node tools/gates.mjs"`. Keep `"bench"`.
2. **`HANDOFF.md`, `ARCHITECTURE.md:205-210`, `README.md:42`** — the gate list must
   include `bench`, and should point at `npm run gates` so there is one list instead of
   three. `HANDOFF.md:96`'s high row (423 / 131,003 / 82.8 fps / 68.5 fps) does not
   reproduce at any commit in this range; replace it with §0.3's four runs or delete it.
3. **`src/render/postfx.js`** — `setQuality` must read `q.msaa` (rebuilding the composer
   targets, which needs a `dispose()`; `tools/perfattrib.mjs`'s `msaa:` probe has the
   working recipe) and `q.renderScale`. If either is not going to be honoured, delete it
   from the table rather than leave a knob that lies. **Fix #1 in §6 is this line.**
4. **`src/render/postfx.js`** — `high.msaa` 4 → 2 and drop `smaa` at `high`, per §6 #1
   and #2, with one before/after capture at the `close` pose for the owner to judge.
5. **`docs/design/space-backgrounds.md`** — record F3's answer: **2.44 ms, hardware,
   2560×1440, `far:dome-flat` against a local baseline, 3 passes, spread 0.52. Verdict
   BAKE.** Item 4 is unblocked, and D1 is settled against the live shader.
6. **`docs/review/acceptance.md:14-17`** — re-score. The two frame-rate rows are true
   today (71.0 fps mean, 65.4 fps p99, idle, four runs) but were passed on a number that
   does not reproduce; the draw-call row's "423 at high / 231 at medium" should read
   **419 / 227**, and the row should say the ceiling is failed by GTAO's prepass and not
   by scene geometry.
7. **`tools/bench.mjs`** — the contention guard in §7. Also `--frames` currently changes
   the answer; either fix `src/probes/benchmark.js:163` to advance per frame, or make
   `bench` report the peak over a fixed number of *simulated* frames.
8. **`src/core/units.js#BUDGET.drawCalls`** — restate the 320 ceiling against
   `mainPass` (200 today) rather than the whole frame, now that §3.1's ledger can
   measure the split.

---

## 9. What I changed

| file | what |
|---|---|
| `tools/perfbisect.mjs` | new. Per-commit walk in a detached sparse worktree; `--ab A,B --repeats N` for interleaved pairwise comparison. |
| `tools/perfattrib.mjs` | new. Single-variable and combination attribution in one page, A-B-A against local baselines, plus the scene census and the per-pass draw-call ledger. `--page game` for the player's frame. |
| `tools/gates.mjs` | new. The gate list as an array, with `bench` in it and marked as a budget gate. |
| `tools/harness.mjs` | opt-in `NP_UNCAP_FPS=1` removes Chromium's refresh-rate cap, plus `frameRateUncapped()`. §1.4 — default behaviour is unchanged, and it is opt-in *because* the non-opt-in version broke `poicheck`. |
| `docs/review/perf-bisect.md` | this. |

Raw measurement payloads are JSON from every run above (`--out`), and every table in this
document was produced by pasting a tool's own stdout.
