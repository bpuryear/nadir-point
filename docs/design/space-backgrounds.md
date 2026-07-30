# Space backgrounds — the diagnosis, the recommendation, and what would prove it wrong

**Integration document. Written 2026-07-30 against HEAD `0d4d18e`.**

Three researchers investigated how shipped space games build nebula and starfield
backgrounds. Their reports are at `docs/design/research/backgrounds-{shipped-games,
threejs,procedural}.md` and every number below that carries a citation comes from one of
them. This document is the single implementable answer, and it is written so that an
implementer never has to open the three reports.

The problem, restated from `docs/design/reference-frames.md` §0: **in all six of the
owner's reference frames the background is a large, saturated, luminous object, and in
ours it is black.** `docs/review/arrival/engagement.png` measures **85% near-black at
luma 0.031**. The standard shipped-game answer — author a cubemap, ship six 2048² PNGs,
as EVE does at roughly 1.7 GB of source pixels across 68 backdrops — is closed to us by
`ARCHITECTURE.md` non-negotiable 5.

---

## 0. Three things the researchers could not know, and one of them changes the plan

**These findings are mine, not theirs.** All three reports were written against a tree
that moved under them. I checked what actually landed.

### 0.1 The fix for Cause B is already committed — in the same commit as the research

`git log` puts `src/world/celestials/skydome.js` and the rewritten
`src/world/celestials/index.js` in commit **`0d4d18e`, 2026-07-30 13:19:37** — *the same
commit that added the three research reports*. The three.js researcher noticed the tree
move mid-pass (their §0) and rewrote against it. The procedural researcher did not: their
Cause B priority-1 action ("move the band below the horizon; every nebula `centre[1]`
should be negative, around −0.20 to −0.35") **is already done at HEAD**:

| POI | `index.js` line | centre at HEAD | elevation |
|---|---|---|---|
| `giant-orbit` | `index.js:100` | `[0.2094, -0.20, -0.9572]` | **−11.5°** |
| `graveyard` | `index.js:165` | `[0.0890, -0.2419, -0.9662]` | **−14.0°** |
| `near-star` | `index.js:274` | `[0.2951, -0.24, -0.9245]` | **−13.9°** |

An implementer taking the procedural report at face value will spend a wave re-doing its
single highest-value change. **Do not.** The remaining elevation problem is different and
smaller, and it is §6.

### 0.2 The sky dome inherited the exact disease it was written to cure — and this one is load-bearing

`skydome.js:128` builds the field's floor as an ecliptic band:

```glsl
float b = 1.0 - smoothstep(0.06, 0.92, abs(d.y));
vec3 base = mix(uGround, uZenith, smoothstep(-0.55, 0.55, d.y));
vec3 c = base * (0.30 + 0.70 * b * b) * uBase;
```

That term **peaks at `d.y = 0`, the far-scene horizon** — and the horizon is precisely
the elevation the tactical camera structurally cannot look at during play. Evaluating
that expression across the shipped `engagement` frame (`tools/shots.json`: zoomT 0.48,
pitchOffset 0.42 → view elevation −35.88°, frame spanning −12.88° to −58.88°):

| position in frame | `d.y` | `0.30 + 0.70·b²` | share of the band's own peak |
|---|---|---|---|
| top edge (−12.9°) | −0.2229 | 0.874 | 87% |
| centre (−35.9°) | −0.5862 | 0.379 | **38%** |
| bottom edge (−58.9°) | −0.8559 | 0.300 | **30% — the floor term, nothing else** |

**Over the bottom two-thirds of the everyday combat frame the dome is delivering its
constant 0.30 residual and essentially none of its band.** The one object that covers
100% of the frame — the only object that can move a whole-frame median — is spending its
brightness on sky the game does not point at. `skydome.js:40-47` correctly diagnosed that
a vertical `mix(ground, zenith, y)` ramp "delivered 68% of its value range to sky the
frame does not contain", replaced it with a band centred on the plane, and centred it on
the one elevation with the same defect.

This is why §3's first build item is a dome edit and not a nebula edit.

### 0.3 Nothing in the repository can measure R1 or R2

`tools/capture.mjs:128-135` computes `meanLuma`, `contrast`, `nearBlackPct` and
`clippedPct`. It does not compute a median, it does not compute chroma, and **no tool in
`tools/` hides `world.scene`** — I checked all twenty-one. The background-isolation
method described in `skydome.js:6-10` and `index.js:29-31` ("rendering each pose twice,
once with `world.scene` hidden, so the pixels that do not change ARE the background")
exists only in scratchpad scripts that are already gone.

So every number this entire debate rests on — the 0.0261 engagement background median,
the 0.3777 that triggered the gain re-solve, the 0.1225 the shipped gains were solved
toward, the 38.6% above 0.06 on the graveyard probe — **is unreproducible from the repo
today.** R2's "median chroma ≥ 0.18" does not even have a metric definition anywhere in
the tree; there is no committed answer to *which* chroma.

That is why build item 0 is a tool, and why the falsification section leads with a
measurement rather than a build.

---

## 1. The diagnosis, consolidated

### 1.1 The calibration — the one number to grade everything against

Both the procedural researcher (§1.1) and the three.js researcher (§1a) independently
transcribed three r185's `ACESFilmicToneMapping`
(`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js`,
including the `color *= toneMappingExposure / 0.6` pre-scale and the AP1 matrices) plus
the sRGB OETF, and solved backwards. **They agree to three significant figures**, which
is the strongest cross-check in the whole research set:

| target display luma | required scene-linear radiance in `renderer.far` |
|---|---|
| 0.06 — R1's "≥40% of frame above this" | **0.0156** |
| **0.10 — R1's "background median ≥"** | **0.0245** |
| 0.15 | 0.0372 |
| 0.20 | 0.0514 |

**The field must emit ≈ 0.0245 in linear scene radiance for R1 to pass.** Every technique
below is graded against that number.

Calibration anchor, for scale: `far.background = 0x1b3550` — a flat clear colour, **zero
draw calls** — measures display luma 0.125 and chroma 0.257, and passes both R1 and R2 on
its own (procedural §1.1). That is not the recommendation. It is the size of the gap.

### 1.2 What the nebula actually emits

Computed through the real fragment shader at `nebula.js:127`
(`c = vColor * (0.55 + 0.45*s.g) * s.a * uOpacity`) with the shipped graveyard tints:

| case | linear radiance | display luma | 8-bit code |
|---|---|---|---|
| `neb-a` mean alpha, 3 overlapping layers | **2.57e-4** | 0.00000 | **0** |
| `neb-b` mean alpha, 3 overlapping layers | **1.53e-3** | 0.00000 | **0** |
| mean texel, 3 layers (three.js researcher, `intensity 1.30`) | 2.1e-3 | 0.0009 | **0** |
| top-5% texel (α=0.05), 2 layers | 0.0232 | 0.092 | 24 |
| `neb-b` single brightest texel, 1 layer | 1.05e-1 | 0.349 | 89 |

**A 16× to 95× shortfall against 0.0245, landing at a display value that rounds to zero
at 8 bits.** Fourteen layers of code 0 is code 0. This is not fixable by adding layers,
by moving them closer, or by re-aiming the band — re-aiming only decides *which* zeros
are on screen.

### 1.3 Cause A — the sheet alpha is 100–1000× too low, and it is a multiplicative chain

`nebula.js:39-98`. Running the pixel loop verbatim (procedural §1.2):

```
{"name":"neb-a","meanAlpha":0.00022,"maxAlpha":0.0456,"pctAlphaGt0_05":0,   "pctAlphaGt0_2":0}
{"name":"neb-b","meanAlpha":0.00131,"maxAlpha":0.2697,"pctAlphaGt0_05":0.83,"pctAlphaGt0_2":0.01}
{"name":"neb-c","meanAlpha":0.00103,"maxAlpha":0.0727,"pctAlphaGt0_05":0.1, "pctAlphaGt0_2":0}
```

**`neb-a`'s brightest texel in the whole 256² sheet is 4.6% opaque. Its mean is 0.022%.**
The attenuation chain, traced for `neb-a`:

| stage | source | median value | multiplier |
|---|---|---|---|
| base fbm after ridge mix | `nebula.js:62-63` | 0.5514 (σ≈0.092, **max 0.837**) | — |
| `× smoothstep(0.30, 0.62, hole+0.133)` | `nebula.js:67` | 0.373 | ×0.68 |
| `× smoothstep(1.02, 0.18, rr)` | **`nebula.js:72`** | **0.0665** | **×0.18** |
| `(n − 0.46)/0.54` | `nebula.js:74` | 0 (p99 = 0.11) | kills ~95% |
| `pow(a, 1 + 0.42·3)` = `pow(a, 2.26)` | `nebula.js:75` | p99 → 0.0068 | ×0.06 at a=0.11 |

Two named defects:

- **`nebula.js:72` — `n *= smoothstep(1.02, 0.18, rr)`.** `rr` is 0 at the quad centre and
  √2 at the corners. The falloff only reaches 1.0 inside `rr ≤ 0.18`, i.e. **2.5% of the
  quad area**. The comment says this exists "so the quad edge is never visible"; measured,
  it is the single largest attenuator in the chain. The three.js researcher measured the
  same term independently and got the same answer by a different route: `n` has median
  **0.454 before** the radial term and **0.059 after** — a cost of **85–87% of the
  median**. Two researchers, two methods, one culprit.
- **`nebula.js:74-75` — an absolute threshold, then a `pow`.** `planarFbm`
  (`common.js:155-174`) is a weighted sum of many independent uniform lattice values, so
  it is approximately Gaussian — Lagae et al. state the mechanism directly ("the pdf of a
  sum of random variables is the convolution of the pdf of the individual random variables,
  the resulting pdf rapidly [converges]",
  [CGF 2010](https://www.cs.umd.edu/~zwicker/publications/SurveyProceduralNoise-CGF10.pdf)).
  Measured here it is **N(0.55, 0.09) with a maximum of 0.837 — it never approaches 1.0.**
  Thresholds of 0.38/0.46/0.50 (`nebula.js:182-184`) against a distribution like that are
  a coin-flip you cannot predict from the parameter, and `pow(·, 2.26)` crushes whatever
  survives. **Threshold at a percentile of the field's own histogram, not at a constant.**

### 1.4 Cause B — the band was not in the frame the game renders (largely fixed at HEAD)

`src/camera/tactical.js:95-101` raises `pitchFloor` with zoom
(`ORBIT.pitchFloorMax = 0.95` over `smoothstep(0.30, 1.00, zoomT)`,
`camera/constants.js:27-29`). With `CAMERA.fov = 46` at 16:9 the frame half-angles are
23.0° vertical, 37.0° horizontal, 40.9° corner. The elevation band the frame can cover:

| zoomT | pitchOffset | frame top | frame centre | frame bottom |
|---|---|---|---|---|
| 0.02 (`close`) | 0.18 | **+9.2°** | −13.8° | −36.8° |
| 0.26 (`three-quarter`) | 0.30 | +2.4° | −20.6° | −43.6° |
| 0.42 (default) | 0.30 | −1.6° | −24.6° | −47.6° |
| 0.48 (`engagement`) | 0.42 | **−12.9°** | **−35.9°** | −58.9° |
| 0.86 | 0.30 | −43.3° | −66.3° | −89.3° |
| 1.00 | 0.30 | −48.6° | −71.6° | −94.6° |

I re-derived this table from `tactical.js` and `constants.js` and it is arithmetically
correct. I can sharpen one figure the procedural report left approximate: it says "above
zoomT ≈ 0.55 the frame never contains anything above the far-scene horizon". **At the
default pitch offset of 0.30 the horizon leaves the top of the frame at zoomT ≈ 0.39**;
0.55–0.60 is the figure with the offset dragged to its minimum of 0. Either way the
`engagement` pose at zoomT 0.48 is above it.

**The control that proves the mechanism is the gas giant.** `giant-orbit`'s giant sits at
`[-0.6007, -0.2603, -0.7559]` — **15.1° *below* the horizon** (`index.js:123`) — and it
reads perfectly. The graveyard's new giant is at −28.0° (`index.js:254`), and
`index.js:236-240` states the reasoning outright: "the tactical camera pitches 12-36
degrees DOWN, so a body on the horizon leaves the top of the frame; at -28 it lands at
NDC (0.61, 0.20)". **The one celestial class placed below the horizon is the one you can
see.**

At HEAD the nebula centres have been moved to −11.5°/−14.0°/−13.9° (§0.1). That is a real
fix and it is **under-corrected**: the modal gameplay frame centre over zoomT 0.26–0.48
is −20.6° to −35.9°, so the band is still 7–22° above where the frame is looking, and at
the `engagement` pose the band centre sits 1.1° outside the frame's top edge. And per
§0.2 the dome that was added to cover the yaws a band cannot reach has its own bright
region at 0° — above the frame at every gameplay zoom.

### 1.5 Cause C — the CanvasTexture premultiply round-trip destroys the colour of every faint texel

`nebula.js:81-89` writes `R=255, G=150+hot·105, B=110+hot·145, A=a·255` through
`createImageData`/`putImageData`, then wraps the canvas in a `THREE.CanvasTexture`. The 2D
canvas backing store is premultiplied; `getImageData` un-premultiplies, and WebGL
un-premultiplies again on upload with `UNPACK_PREMULTIPLY_ALPHA_WEBGL` false, which three
leaves false. The round trip is `round(round(255·c·α)/α)`. Measured in Chromium
(procedural §1.4):

| alpha byte | written RGB | read back RGB |
|---|---|---|
| 1 | 255, 150, 110 | **255, 255, 0** — blue annihilated, reads pure yellow |
| 3 | 255, 150, 110 | 255, 170, 85 |
| 6 | 255, 150, 110 | 255, 170, 128 |
| 12 | 255, 150, 110 | 255, 149, 106 ✓ |

**Colour only survives above alpha ≈ 12/255 = 0.047, and `neb-a`'s maximum alpha is
0.0456 — every texel in that sheet is inside the corrupted regime**, with 98.6% at alpha
byte ≤ 1.

The three.js researcher (§6) adds the generalisation and it is the more useful form:
*if RGB and A carry independent signals, it must be a `DataTexture`; `CanvasTexture` is
only safe when α is 255 everywhere, or when RGB is meaningless where α is small.*
`nebula.js:82` packs a hot-core signal into G that `nebula.js:127` reads independently, so
that G channel is quantised to steps of `1/(255α)` wherever the sheet is faint — at
α = 0.02, five distinct values. `softPointTexture` and `glowTexture`
(`common.js:195, 233`) write neutral white and are in the safe category; they should carry
a comment saying why, and they should not be "fixed".

### 1.6 What was ruled out — do not re-investigate these

The procedural researcher (§1.5) closed all of these with evidence:

- **Not stale depth.** `farPass.clear = true` → `renderer.clear(...)`; colour *and* depth
  are cleared before the far pass even though `renderer.autoClear = false`
  (`renderer.js:39`).
- **Not render order.** `ORDER.stars 0 → backGlow 1 → star 2 → planet 5 → frontGlow 20 →
  dust 24` (`common.js:41-56`), `depthTest: order >= ORDER.frontGlow`, `depthWrite: false`
  throughout. Correct.
- **Not clipping.** `farCamera` far plane is `FAR_SCENE.radius * 4 = 36000`
  (`renderer.js`, `units.js:71-74`); the graveyard band sits at 20000, the starfield at
  30000, the dome at 28000. All inside.
- **Not the tint colour space.** `col()` decodes with `SRGBColorSpace` (`common.js:72`);
  `toneMapped: true` is correct.
- **Not the draw budget.** The far scene is 17 draw calls against a 320 ceiling. Enormous
  headroom.
- **Not additive-vs-normal.** `AdditiveBlending` with `gl_FragColor.a = 1.0` gives
  `SRC_ALPHA(=1)·src + dst`, which is correct additive.

And one measured falsehood in the code's own comments: `nebula.js:36` claims the ridged
field "is what gives the thin bright strands". At matched 42% lit coverage, using
density-weighted structure-tensor coherence: plain fbm 0.450, **ridged fbm 0.458**.
**Ridged noise does not produce filaments.** It changes the profile of the blobs, not
their alignment.

---

## 2. Where the researchers disagree — and which disagreement is cheapest to settle

These are not smoothed over, because each one is a decision an implementer will otherwise
make by accident.

### D1 — Should we bake to a cubemap, and when? *(the important one)*

| researcher | position |
|---|---|
| **three.js** §4 | The cubemap bake **is** the recommendation. "Delete the dome mesh." |
| **procedural** §3.3 | Priority **7 of 8** — "once 2–6 are proven in the quad path". |
| **shipped-games** §12 | **Tier B #7** — "Useful only if the per-frame dome shader turns out to be fill-rate bound; otherwise it buys nothing #1 doesn't." |

This is a real three-way split on a decision worth several days. **It is settled by one
measurement, and that measurement costs one shader edit and one bench run:** put the full
field shader into the existing dome as a live full-screen fragment shader and measure the
frame-time delta on **hardware** at 2560×1440. Under 0.5 ms, shipped-games is right and
the bake is unnecessary. Over 2 ms, three.js is right and the bake is mandatory. See F3.

My prior, stated so it can be checked rather than assumed: the dome draws first with
`depthTest: false` (`skydome.js:142-143`), so it is **full-screen with full overdraw and
no early-Z relief** — 3.7 M fragment invocations at 1440p, each running a 2-level domain
warp at ~40 noise taps. That is the shape of a 1.5–6 ms shader, not a 0.5 ms one. But it
is a prior, not a measurement, and the measurement is cheap.

### D2 — What carries the floor: a vertex-coloured mesh, or a texture?

shipped-games ranks the Homeworld vertex-colour mesh **Tier S #1** ("the only technique
here whose *shipped* form has no texture at all"). three.js and procedural both assume a
texture.

**This is resolvable by band-limit arithmetic and it is not actually a contradiction.**
Homeworld's own vertex counts, from `img2sky`, are **1,656 to 30,055 vertices for an
entire sky** — at most ~0.7 vertices per square degree. The content we need to carry is
band-limited at **4.6–12.8 source texels per degree** (three.js §3, from 256² sheets
subtending 20°–56°). A vertex mesh at Homeworld's density is two orders of magnitude short
of the nebula's structure and exactly right for the low-frequency floor R1 and R2 ask for.

So: **the mesh is right for the floor and cannot carry the band.** A reader who picks one
report and follows it will lose the other half. The chosen approach carries both in one
representation.

### D3 — The sheet alpha numbers themselves differ by 5–20×

| | `neb-a` max α | `neb-a` mean α |
|---|---|---|
| procedural §1.2 (single seed, maths lifted verbatim) | 0.0456 | 0.00022 |
| three.js §1b (5 seeds, real fork chain `rng.fork('celestials:graveyard').fork('nebula')`) | 0.094 – 0.286 | 0.0014 – 0.0062 |

Both conclude the sheet is effectively transparent and both land far below the 0.047
premultiply floor, so **the diagnosis does not depend on which is right** — but the *size
of the fix* does. **Cheapest to settle:** instantiate the real `buildNebula()` in a
headless page, read the shipped `CanvasTexture` back through `getImageData`, and print the
histogram. Half an hour, and it settles D3 and re-confirms Cause C in the same run. Do it
inside build item 0.

### D4 — The draw-call baseline is quoted two different ways in the repo

`ARCHITECTURE.md:223-233` reports **423 high / 231 medium** measured on hardware at
2560×1440, and instructs: "Read the ceiling against the medium figure ... 192 draw calls —
45% of the high count — are GTAO's depth-normal prepass". `docs/review/benchmark.md`
reports **499 peak, FAIL** at 1600×900 under SwiftShader, and the three.js report repeats
that 499. Different resolutions, different rasterisers, different quality presets, never
reconciled.

Nothing in this plan depends on the difference — the far scene is 17 draws and goes to 11
— but an implementer reading `benchmark.md` believes they are 179 over budget and one
reading `ARCHITECTURE.md` believes they have 89 to spare. **Neither should merge geometry
to chase a number until `npm run bench -- --quality medium` has been run once**, which
`benchmark.md` itself says nobody has done.

### D5 — The three.js report's dome brightness figures are stale, but its clipping finding is not

three.js §1c computed the graveyard dome at display luma **0.591**, 8-bit `(128, 171, 14)`
— "a mid-chartreuse sky, not coloured darkness". That was measured against the 12:53
version of `skydome.js` with `gain 0.17 / baseGain 1.05`. **HEAD has `gain: 0.049,
baseGain: 0.170` (`index.js:226`)**, roughly a 6× reduction the dome author made after
measuring 0.3777 on a live frame (`index.js:218-226`). §1c's headline number does not
describe the shipped tree.

**What is *not* stale from §1c, and is worse at HEAD:** `palette.js:1447-1456` clamps each
channel in linear after the lerp, so `saturate()` stops being hue-preserving past a
per-colour threshold and becomes a clip. I computed the thresholds for the three graveyard
dome hexes:

| `index.js` | expression | blue clips at amount | **authored amount** |
|---|---|---|---|
| `:214` `core` | `saturate(0x8fb04a, 1.50)` | **1.224** | 1.50 |
| `:215` `zenith` | `saturate(mix(0x4c6a4a, 0x8fb04a, 0.70), 1.50)` | **1.298** | 1.50 |
| `:216` `ground` | `saturate(mix(0x4c6a4a, 0x8fb04a, 0.45), 1.55)` | **1.409** | 1.55 |

**All three graveyard dome colours have blue clipped to exactly zero.** `core` resolves to
≈ `0x82b500`. The entire graveyard sky is a two-channel R,G field, and `index.js:179-181`'s
claim that "`saturate` is luminance-preserving and hue-preserving by construction" is false
above those thresholds. It is not a brightness bug — a zero-blue field maximises chroma, so
it is arguably *helping* R2 — but it means 22% of the authored amount is doing nothing, the
control is silently saturated, and once `scene.environment` is fed from this field (item 5)
every hull's shadow side reflects a sky with no blue in it at all.

### D6 — Whether the premultiply corruption is catastrophic

procedural §1.4 treats it as one of three independently sufficient causes. three.js §6 is
more careful: "not catastrophic the way D35 was — the shader multiplies by `s.a` anyway,
so where G is worst the contribution is smallest". **three.js is right on severity and
procedural is right that it must be fixed**: the corruption does not explain the blackness
(Cause A does), but it does explain why the little that survives reads as the wrong hue,
and it makes the sheet's two-tone core/edge — the whole reason `nebula.js:77-84` exists —
not survive to the GPU. Fix it, but do not expect it to move R1.

---

## 3. The recommendation

> **One direction-space field function, authored once, baked once per POI into a
> `WebGLCubeRenderTarget` (512²/face, `HalfFloatType`, `LinearSRGBColorSpace`), assigned
> to `far.background`, and PMREM'd from that same cube into `scene.environment`.
> The starfield, the star, the gas giant and three to four dust / front-glow quads stay
> live geometry in front of it.**

All three researchers converge on the same first half of this — **evaluate the field in
3D direction space, do not sample an image of it.** They arrive independently:
shipped-games §5 via EF-Map, an unaffiliated three.js team building for EVE Frontier who
"tried nebula textures, fought UV seams and pole pinching" and found procedural noise
"delivered the best results, killing the seam and pole problems outright"; procedural §2.1
via Inigo Quilez's domain warp; three.js §3 via the observation that a direction-space
field has no seams to fix, which is what CCP paid a full resolution doubling for
([Building the future of EVE](https://www.eveonline.com/news/view/building-the-future-of-eve)).

They diverge only on where the evaluation result *lands*. This recommendation lands it in
a cube, for the reasons in D1 and §4 item 4 — and **subject to the F3 measurement, which
can overturn it before a wave is spent.**

### It survives all four constraints

**1. No image files.** The cube is produced by *rendering* runtime-generated geometry
through a runtime-generated shader into a render target. Nothing is fetched; nothing is
committed as a binary asset. `ARCHITECTURE.md` non-negotiable 5 names `DataTexture` and
`CanvasTexture` as the sanctioned forms; a render-target texture is the same claim with
the generator moved onto the GPU. Precedent at exactly our stack:
[wwwtyro/space-3d](https://github.com/wwwtyro/space-3d) generates its entire star-and-nebula
sky in GLSL and bakes it once into a cubemap through a framebuffer, seeded and
reproducible, at 1024/face by default. three's own `webgl_shaders_sky` example is the same
shape: `WebGLCubeRenderTarget(256, {type: HalfFloatType})` + `CubeCamera(1, 1000, rt)` +
`cubeCamera.update(renderer, scene)`.

**2. Generated at runtime.** The bake runs inside `buildCelestials()`
(`index.js:309`), i.e. at POI entry. This is the Elite Dangerous amortisation model
stated outright: *"During the jump, your system generates the next system's skybox"*
([80.lv](https://80.lv/articles/generating-the-universe-in-elite-dangerous)). Generation
cost is paid inside a transition the player already accepts as a beat, and the result is
then static.

**3. Deterministic, seeded RNG only.** The field's noise comes from CPU-side lattices
built with `lattice(rng, w, h)` (`common.js:83`) from a fork of `world.rng`, uploaded as
one small `DataTexture` and sampled in the shader, plus a seed uniform. **No
`Math.random` in JavaScript.** The scanner that enforces this is
`src/sim/selftest.mjs:753-783` — regex `/Math\.random\s*\(/` and an alias form, walked
recursively over all of `src` and `tools`, ≥100 files, offenders printed by name. It
cannot fire on GLSL and will not fire on this. Note what the determinism contract actually
guarantees: `selftest.mjs:706-731` fingerprints *simulation state*, not pixels. Bit-exact
pixels across GPU vendors are not required and were never claimed.

**4. Inside the 320 draw-call ceiling.** `BUDGET.drawCalls = 320` (`units.js:76`). The far
scene goes **17 → 11**, and the field's internal complexity becomes free:

| far-scene contents (graveyard) | today | with the bake |
|---|---|---|
| sky dome | 1 | — |
| starfield | 1 | 1 |
| nebula (3 back / 3 front / 3 dust merged meshes) | 9 | — |
| `scene.background` box | — | 1 |
| front glow + dust, kept live for occlusion | — | 3 |
| star (3 corona shells) | 3 | 3 |
| gas giant (planet + halo + rings) | 3 | 3 |
| **total** | **17** | **11** |

Verified against r185 source: `scene.background = cubeTexture` pushes exactly one
`boxMesh` into the render list — **1 draw call, 12 triangles, zero overdraw** — and
`WebGLBackground.js` `renderList.unshift(...)` puts it at the front of the pre-sorted
opaque list, with `onBeforeRender` copying the camera position into `matrixWorld` so it is
nailed to the camera for free.

**Nine fewer draw calls is not the win.** The win is that the field's internal complexity
becomes free: 60 nebula sheets, a full 2-level domain warp per texel, coloured absorption
lanes — all of it costs the same one draw call per frame, forever.

### Two live knobs you get for nothing

`scene.backgroundIntensity` and `scene.backgroundRotation` are live uniforms
(`Scene.js`). **The whole field can be re-graded or re-aimed per POI, per travel leg, or
during a jump, without rebaking anything.** Given that the three POIs' domes are today
three independently hand-solved `gain`/`baseGain` pairs — and that three.js §1c measured
an 11× spread between them before the graveyard was re-solved — a single
`backgroundIntensity` per POI is a strictly better control surface than what
`index.js:118, 226, 292` currently carries.

### What I am deliberately not choosing

**Authored cubemap** (EVE, KSP `GalaxyCubeMap`, Freelancer starspheres, FreeSpace
`starfield.tbl`, Everspace backdrops). ❌ Non-negotiable 5. For scale: EVE's 2022 pass
doubled every nebula's resolution to 2048/face across 68 regional backdrops — roughly
**1.7 GB of source pixels** before compression. This is the shipped-game answer and it is
correctly closed to us.

**Vertex-coloured background mesh** (Homeworld `.btg`/`.hod`; shipped-games Tier S #1).
Genuinely elegant — a Homeworld background vertex has no Z at all, it is authored in 2D
"page" space and unprojected onto a sphere at the far clip plane
([`btg.h`](https://raw.githubusercontent.com/aheadley/homeworld/master/src/Game/btg.h)) —
and we are in the unusual position of already owning the function Relic had to encode into
a bitmap and reverse-engineer back out. But per D2 it is band-limited two orders of
magnitude below the nebula's structure, and keeping it *plus* something that can carry
filaments means maintaining two field systems for one sky. **The cube subsumes it:** bake
the same analytic floor into the cube's low frequencies and get the mesh's result for
free. Worth noting Relic authored their source at half brightness (Photoshop output levels
255 → 128) — the background is a **floor, not a subject**, and that instinct is right and
is preserved here.

**A live full-screen procedural dome** — which is what shipped at 13:19 and what
shipped-games' Tier-B ranking would keep. It is the correct *authoring* form and, on my
prior, the wrong *deployment* form once the field has structure: every pixel of structure
is a fragment shader that runs every frame forever, at full overdraw, because the dome
draws first with `depthTest: false`. **Do not delete `skydome.js`** — it becomes the bake's
input and it remains the cheapest way to author the floor. If F3 measures under 0.5 ms,
this option wins and the bake is dropped; that is a real possibility and it is why F3 is
the gate.

**CPU-generated `DataTexture` cube** (Spacescape's model). Survives the letter of the rule,
and the measured cost is the problem — procedural §3.1, on this machine, 11.5 ns per
octave-sample through a real texture loop:

| bake | measured / projected |
|---|---|
| 3 × 256² nebula sheets (**today**) | **45 ms, measured** |
| 1024×512 gas giant albedo (**today**) | ~51–90 ms |
| 6 × 256², 40 oct/px (2-level warp) | ~180 ms |
| 6 × 512², 24 oct/px | ~430 ms |
| 6 × 512², 40 oct/px (2-level warp) | ~720 ms |
| 6 × 1024², 24 oct/px | **~1.7 s** |

Single-threaded JS on the main thread at POI entry. The only viable size is 6 × 256², and
that is the size three.js §3 measures at 2.8 px/degree — "loses the filaments". **Keep this
as the documented fallback if the GPU path fails on a target machine, at 256/face, and
know that it is soft.**

**Volumetric raymarch** (Star Citizen; Guerrilla's Nubis). The noise generation is free —
128³ RGBA + 32³ + 128² curl into `Data3DTexture` is 8 MB and well within our means. The
rendering is not. Quoting Schneider & Vos directly: *"The approach that I have described
so far costs around 20 milliseconds. (pause for laughter)"*, reaching a 2 ms target only
via quarter-res, 1-in-16 temporal updating, motion-vector reprojection and a bespoke
upscale filter, on PS4 in PSSL. We have none of that plumbing, and our far scene has its
own camera, so reprojection would have to cross the `FAR_SCENE.parallax` split. Budget
**3–6 ms half-res unreprojected** and treat that as a hard number. Viable one day as an
optional near-dust volume behind a quality flag; never as the field.

**More nebula quad layers.** Measured dead end. Fourteen layers of 8-bit code 0 is code 0.

### One thing the bake costs us, stated plainly

Baking the nebula into `scene.background` forfeits `ORDER.frontGlow` (20) and `ORDER.dust`
(24) — the layers that pass *in front of* the gas giant and the near-black lanes that eat
the glow behind them. `common.js:18-27` calls that occlusion "the strongest depth cue the
backdrop has" and it is right. **That is why 3–4 live quads stay.** Two profiles:

- **`giant-orbit` — partial bake.** Bake dome + back glow; keep front glow and dust live
  (`depthTest: true`, unchanged). Far total ≈ 11–14. The planet is the subject here.
- **`graveyard` / `near-star` — fuller bake.** The graveyard's giant is 3.9° across and
  parallaxes 2 px; there is nothing to lose by baking it. Far total ≈ 5, and the giant's
  512² procedural texture can be disposed after the bake.

### And one thing that is not a cost, which changes how freely you may bake

`FAR_SCENE.parallax = 2.2e-4` (`units.js:73`) is worth, measured, **0.14 px** of angular
shift on the gas giant at the default 3200 m camera distance and **2.0 px** at the 46000 m
maximum; against the nebula shell at r = 20000 the maximum is 0.9 px. **The two-scene split
earns its keep entirely on depth precision, not on parallax** — everything in `far` can be
baked without losing anything a player can see.

The converse is the interesting half, and it is shipped-games §13.3's best idea: a
far-scene object at radius `R` with parallax factor `p` is optically a main-scene object at
`R/p`. So `frontRadius = 4200` at a *per-layer* `p = 0.02` reads as a bank **210 km away** —
genuinely finite, genuinely parallaxing. That is the Everspace answer (their planet limb and
nebula bank are finite-distance level actors, which is why the limb crops against the frame
edge) available for zero extra draw calls, and it applies to exactly the live quads we are
keeping. Not in this wave, but note it where the quads are defined.

---

## 4. Build order — cheapest credible win first

Every item names its files, its expected *measured* movement, and a time estimate. Items 0
and 1 are the ones that matter; everything after item 2 is gated on a measurement.

### Item 0 — Commit the measurement. `tools/fieldcheck.mjs`

**Files:** new `tools/fieldcheck.mjs` (integration-owned tooling). **No `src/` change.**

Render each shot twice — once normally, once with `world.scene.visible = false` — and
build the background mask from the pixels that do not change. That is the method
`skydome.js:6-10` describes and that no committed tool implements. Report, per shot per
POI: background **median** luma, **% of frame above luma 0.06**, background median chroma,
and the width of the hue band containing the chroma mass. Pin the chroma metric in a
comment — R2's "≥ 0.18" is not a testable number until someone says which chroma.

While the harness is up, settle **D3** in the same run: instantiate the real
`buildNebula()`, read the shipped `CanvasTexture` back through `getImageData`, and print
the alpha histogram. That re-confirms Cause C on the live path at the same time.

**Expected movement: none, by design.** **Time: 2–3 h.**

**Why this is first and not second.** Per §0.3, nothing in the repo can measure R1 or R2
today, and per §0.1 the tree changed under all three researchers. It is entirely possible
that the dome which landed at 13:19 already moved R1 — its author solved the graveyard's
gains toward a predicted median of **0.1225** (`index.js:218-226`) through a fitted
response `out = 1.111·L^0.643`, having *measured* 0.3777 at the previous gains, and then
**never re-measured the shipped ones**. If item 0 reports ≥ 0.10 already, the whole
programme changes from a luminance problem to a chroma-and-structure problem and items 1–2
get re-scoped. **This project's stated failure mode is confident prose that the first
measurement contradicts. Take the measurement first.**

### Item 1 — Re-centre the dome's band on the frame, and un-clip the blue

**This is the smallest change that measurably moves R1.**

**Files:** `src/world/celestials/skydome.js:128` (one line, plus one new uniform);
`src/world/celestials/index.js:114-119, 195-227, 287-293` (gains, and the three `saturate`
amounts).

**(a)** Replace the horizon-locked band

```glsl
float b = 1.0 - smoothstep(0.06, 0.92, abs(d.y));
```

with a band centred on an authored elevation `uBandY`, defaulting to **≈ −0.50 (−30°)** —
the modal frame centre across zoomT 0.26–0.48 — e.g.
`float b = 1.0 - smoothstep(0.10, 0.95, abs(d.y - uBandY));`. Expose `uBandY` per POI in
`CELESTIAL_SPECS.dome` so it can be solved rather than guessed, and keep the existing
`mix(uGround, uZenith, smoothstep(-0.55, 0.55, d.y))` hue lean unchanged.

**(b)** Cap the `saturate()` amounts at the per-colour clip thresholds computed in **D5**
(1.224 / 1.298 / 1.409 for the three graveyard hexes), so the authored number means what
it says. If the chroma loss is unacceptable, that is a signal to change the *hue*, not to
push a control that stopped responding — see **F6**.

**Expected measured movement.** From §0.2, the dome today delivers **87% → 38% → 30%** of
its own band peak from the top to the bottom of the `engagement` frame. Re-centred at
−30° it delivers **≥ 70% over the middle two-thirds**. At unchanged gains that is a
**≈ 2.0–2.3× lift in background median luma**, and the dome is the *only* object in the
frame that can move a whole-frame median because it is the only one that covers the whole
frame. Concretely: if item 0 measures 0.05, this lands near 0.11 and R1 is met; if item 0
measures 0.12, this lands near 0.26 and the gains come **down** instead. Either way it is
one line plus a solve.

**Time: 2–4 h**, including one `npm run capture` + `fieldcheck` cycle.

**Risk, and it has already happened once.** The graveyard dome overshot to a measured
0.3777 — "a lit room, not a graveyard" — at `gain 0.17 / baseGain 1.05`. **Solve, measure,
re-solve. Do not ship the first solve.**

### Item 2 — Repair the sheet alpha

**Files:** `src/world/celestials/nebula.js:39-98` only. Land as **four separate commits**
with a `fieldcheck` run between each — the researchers disagree 5–20× on the starting
alpha (D3), so you want to know which edit did what.

**(a)** `:72` — `smoothstep(1.02, 0.18, rr)` → `smoothstep(1.20, 0.55, rr)`. Removes the
largest single attenuator: ×0.18 at the median (procedural), 85–87% of the median
(three.js).

**(b)** `:74` — absolute threshold → **percentile threshold on the field's own histogram**
(one extra pass over the 256² buffer, or a 64-bin histogram). The field is N(0.55, 0.09)
with max 0.837; a constant of 0.38/0.46/0.50 against that is unpredictable from the
parameter, which is why three sheets authored to look different mostly differ in how
invisible they are.

**(c)** `:75` — `pow(a, 1 + sharpness*3)` = `pow(a, 2.26)` applied to a field whose 99th
percentile is 0.66. Apply the exponent to the **core only**, or drop `sharpness` to ≤ 0.15.

**(d)** `:87-89` — `CanvasTexture` → **`DataTexture`**. This is the Cause C fix and it is
what non-negotiable 5 explicitly names. **`DataTexture` defaults are hostile and silent**
(three.js §6): `flipY` **false** (vs true), `magFilter`/`minFilter` **`NearestFilter`** (vs
`LinearFilter`/`LinearMipmapLinearFilter`), `generateMipmaps` **false** (vs true),
`unpackAlignment` **1** (vs 4), and `needsUpdate` is not set for you. Taking the defaults
will change every sheet's appearance while appearing to fix a colour bug.
`src/art/materials/env.js` already does this correctly (`Uint16Array` +
`THREE.DataUtils.toHalfFloat` + explicit `LinearFilter`) — **that file is the template.**

**Expected measured movement.** Procedural prototyped (a) + (b) together at
**mean alpha 0.0022 → 0.1515, a 69× lift at no extra cost**. That moves the 3-layer mean
linear radiance from 2.57e-4 to ≈ 1.8e-2 — from **95× short** of R1's 0.0245 to **1.4×
short**. The sheets stop being invisible and start being a contributor. (d) recovers the
colour of every texel below alpha 0.047, which is currently 100% of `neb-a`.

**Time: 1 day.**

### Item 3 — Fold the band into direction space, and prove the fill cost. **This is the arbitration.**

**Files:** new `src/world/celestials/field.glsl.js` (the shared field function, exported as
a GLSL string), consumed by `skydome.js`. Owned by Environment & celestials.

Build it as a **live shader first** and measure it on hardware. Contents, in measured
order of value:

- **A 2-level IQ domain warp** ([iquilezles.org/articles/warp](https://iquilezles.org/articles/warp/)),
  verbatim:
  ```glsl
  vec2 q = vec2( fbm(p), fbm(p + vec2(5.2,1.3)) );
  vec2 r = vec2( fbm(p + 4.0*q + vec2(1.7,9.2)), fbm(p + 4.0*q + vec2(8.3,2.8)) );
  return fbm( p + 4.0*r );
  ```
  Measured: coherence **0.450 → 0.747**, stringiness **22.9 → 666**, for 2.2× the cost.
  `nebula.js:59-60` already *has* a domain warp, but it is one level at amplitude 0.34, and
  0.34 of a unit-domain UV is a nudge, not a warp. **Three levels over-curls into an
  intestinal look; stop at two.**
- **On an anisotropically stretched domain.** For a *band* — R2's "one hue owns the field"
  — the measured winner is the warp composited on an 4:1 stretched domain: **0.850
  coherence at 12.6 ms/256²**, long directional strands. `common.js:105-126` (`cylFbm`)
  already knows this trick and says why ("`aspect > 1` stretches features along longitude,
  which is the whole reason gas giant turbulence reads as ribbons rather than as clouds").
  The nebula does not use it. Independently confirmed by Leria/Neyret's `stretch()`.
- **Hue ramped by optical depth, not by `r.int()`.** `nebula.js:216` picks a random tint per
  layer. Instead index a 2–3 stop ramp by accumulated density: thin → the [O III] teal end,
  thick → the Hα / [S II] warm end. Physically that ordering is real (Leria: the first dust
  shell emits "blue", the deeper one "green", a last thin shell "red"); as art direction the
  famous gold-and-teal look is a **mapping decision, not a photograph** — the Hubble/SHO
  palette maps S II→R, Hα→G, O III→B because "two of them are red, one is green and none is
  blue". **This costs one `mix()` chain and it is what makes chroma rise with luma** —
  Frontier measures 0.107 → 0.292 → 0.580 across luma bands; we measure 0.026 → 0.036 →
  0.039, i.e. flat.
- **Coloured absorption for the dust lanes.** Not black paint. `blendEquation: ADD,
  blendSrc: ZERO, blendDst: ONE_MINUS_SRC_COLOR` gives a *coloured* multiply — real dust
  reddens what is behind it. Same draw call, same cost, and it is the difference between
  dust reading as *dust in front of light* and as *holes cut in the image*. And generate the
  lane mask from the **same noise field, offset in the domain**, so the lane threads through
  the glow instead of landing next to it — `nebula.js:237` currently draws a fresh random
  position, which is why the lanes never sit on the emission they are supposed to obscure.

**Do not use curl noise as the shape generator.** Measured trap, and the paper warns about
it: advecting through a **4-octave** potential gives coherence **0.161** and salt-and-pepper
mush at 265 ms/256²; the identical code with a **1-octave** potential gives **0.892** at
28.4 ms. Bridson states the mechanism (velocities scale as O(1/L), so the finest octave
dominates). Guerrilla use curl exactly this way — a small 2D texture "used to distort our
cloud shapes and add a sense of turbulence", not as the shape source. Worley F2−F1 is the
cheapest filament source measured (0.808 coherence, 7.0 ms/256²) but reads as an obvious
Voronoi web alone; use it as a **multiplier** on the warped fbm if you want knotted gas.

**Expected measured movement: R2, not R1.** Chroma and structure. Do not expect this to
move the median luma; item 1 does that.

**Time: 2–3 days.**

**⛔ GATE.** Before going further, measure the frame-time delta of the live field shader on
**hardware** at 2560×1440. See **F3**. Under 0.5 ms → stop here, ship the live shader, skip
item 4 entirely and bank 12.6 MB. Over 2 ms → item 4 is mandatory.

### Item 4 — Bake to a cubemap. **Only if item 3's gate says so.**

**Files:** new `src/world/celestials/bake.js`; `index.js#buildCelestials`; **one proposed
change** to `src/render/renderer.js`.

Three landmines, all silent, all verified in r185 source:

1. **`renderer.autoClear = false` is pinned at `renderer.js:39`**, and `CubeCamera.update()`
   calls `renderer.render()` six times relying on `autoClear` to clear each face. Without
   restoring it, **the six faces accumulate on top of each other.**
2. **`renderer.info.autoReset = false` at `renderer.js:40`.** The bake's six draws land in
   whatever frame's counters follow it and can surface in `tools/bench.mjs`. Call
   `gl.info.reset()` after. Bake only inside `buildCelestials`, **never lazily mid-frame** —
   `bench.mjs` takes the *peak* over frames.
3. **`toneMapping` is already forced to `NoToneMapping` for non-XR render targets**
   (`WebGLRenderer.js:2349`), so the cube comes out linear for free. State it anyway so the
   bake does not silently depend on it.

The wrapper belongs in `src/render/**`, which is **Lighting & post's** file — *propose it,
do not make it*:

```js
/** Run `fn(gl)` with the renderer in a state safe for one-shot offscreen bakes. */
withBakeState(fn) {
  const gl = this.renderer;
  const s = { autoClear: gl.autoClear, tone: gl.toneMapping, rt: gl.getRenderTarget() };
  gl.autoClear = true; gl.toneMapping = THREE.NoToneMapping;
  try { return fn(gl); }
  finally { gl.autoClear = s.autoClear; gl.toneMapping = s.tone; gl.setRenderTarget(s.rt); gl.info.reset(); }
}
```

Two colour-space rules that will bite otherwise:

- **Tag the cube `LinearSRGBColorSpace`, never `SRGBColorSpace`.** `WebGLBackground.js` sets
  `boxMesh.material.toneMapped = ColorManagement.getTransfer(background.colorSpace) !==
  SRGBTransfer` — an sRGB tag turns tone mapping **off for the sky alone** while leaving it
  on for everything else, *and* applies an sRGB→linear decode to values that were never
  encoded, crushing the whole field into the toe. This is the exact mechanism behind "the
  sky is blown out and nothing else is".
- **`HalfFloatType`, not `UnsignedByteType`.** The field's linear range is 0.002–0.35,
  entirely below 1.0; stored as linear 8-bit, 0.002 is code 0.5/255 and quantises to
  nothing. `RGBA32F` is not worth considering — 2× the memory and
  `OES_texture_float_linear` is not universal, so you would lose bilinear filtering on the
  one texture that is always magnified.

`rt.texture.isRenderTargetTexture === true` suppresses the legacy left-handed px/nx flip, and
`WebGLBackground` honours it — **a cube you bake needs no mirroring; a cube built from six
`DataTexture`s does.**

Then set `far.background = cube.texture` — replacing `index.js:396`'s
`new THREE.Color().setHex(spec.background ?? NEUTRAL.spaceBlack, SRGBColorSpace)`, which
with `background: 0x000000` at graveyard and near-star is **a literal black clear under
everything**, and is the R1 floor until the cube replaces it.

**Expected measured movement: none to R1 or R2.** This is a cost change, not a look change.
**Say so in the commit message**, or someone will "improve the look" inside the bake and
nobody will be able to tell the two apart afterwards.

**Time: 2 days.**

### Item 5 — PMREM the field into `scene.environment`. This is R3.

**Files:** `src/world/lighting/poi.js:104-262`.

Delete `envSky` (`:104`), `envGiant` (`:144`), `envSun` (`:176`), `envNebula` (`:191`) and
the whole invented IBL scene assembled at `:223-239`, and feed `buildPOIEnvironment` from
the baked cube via `pmrem.fromCubemap(cube.texture)` (or `pmrem.fromScene(world.far, 0, 1,
FAR_SCENE.radius * 4)` if item 4 was skipped — the defaults `near=0.1, far=100` are useless
here and must be passed).

**The project already calls `PMREMGenerator.fromScene` — on the wrong scene.**
`poi.js:94-99` states the requirement out loud: *"if the visible sky is a coloured dome and
the environment map is still built from three near-black `ibl` hexes, the shadow side of
every hull reflects a room the player cannot see."* The file identified the defect and then
built a **third** room. This item collapses it.

This is EVE's answer verbatim — *"Most ships in EVE reflect the nebula of the area of space
they are in"* — and HWRM's, which ships reflection cubemaps derived from its backgrounds.

**Expected measured movement.** `reference-frames.md` §4.3: at engagement range the ship
reads mean RGB **0.216 / 0.244 / 0.238** — cool — because it is lit almost entirely by blue
fill and rim. With the field in `scene.environment`, the hull variants'
`envMapIntensity` (`materials/index.js:94-109`, 0.30–0.85, canopy glass 2.2) sample a
*coloured* environment instead of a near-black gradient. **Re-measure R3's hull/field hue
separation after this lands, not before.**

**Notes:** `PMREMGenerator._allocateTargets()` produces `3 × max(cubeSize,112)` ×
`4 × cubeSize` `HalfFloatType` `LinearSRGBColorSpace` — at the default 256 that is
768×1024 RGBA16F ≈ **6.3 MB per environment**, plus one instance ping-pong target of the
same size. Documented ideal input is **256/face for `fromCubemap`**, so a 512 cube is
comfortably above it. **The `dispose()` warning in the docs is stale for r185** — all of
`_pingPongRenderTarget`, `_blurMaterial`, `_ggxMaterial`, `_lodMeshes`, `_backgroundBox` are
*instance* fields, so the two generators this project creates (`art/materials/env.js` and one
per call in `poi.js:246`) do not corrupt each other. **Collapse to one anyway** — that is
6.3 MB back.

**Time: 1 day.**

### Item 6 — Starfield and dither. Cheap, independent, do any time.

**`src/world/celestials/starfield.js:32` — `MAG_SLOPE = 0.58 → ≈0.47.`** 0.58 is the
*Euclidean* slope (`d log N/dm = 0.6`, valid "in an Euclidean universe uniformly populated
by sources with the same intrinsic luminosity"). The real sky is a disc. From combined
Tycho-2 / UCAC4 counts the slope over the file's own `MAG_MIN −1.4 … MAG_MAX 6.7` range is
**≈ 0.47**:

| to magnitude | total stars | implied slope over previous 5 mag |
|---|---|---|
| 5 | 1,744 | 0.553 |
| 10 | 382,925 | **0.468** |
| 15 | 39,387,795 | **0.402** |

A too-high slope pushes the inverse CDF toward `MAG_MAX`, **over-producing near-threshold
specks and under-producing bright anchors** — precisely the "flat, grey, static sky" the
file's header exists to avoid. The count (7,200 ≈ a naked-eye sky) is right; the
distribution within it is skewed faint.

**Harden the galactic band.** `starfield.js:80`'s `keep = 1 - bandDensity·clamp01((t-0.12)/0.88)`
is a gentle linear gradient. The Milky Way's thin disc is ~270 pc scale height against a
~2.6 kpc scale length — near 10:1 — which is why the naked-eye band is a hard, narrow,
*structured* stripe with visible rifts. Use an exponential in sin(galactic latitude), and
**give the band an unresolved luminous component**, because 7,200 point sprites contribute
effectively nothing to a frame median.

**Leave `STELLAR_RAMP` alone** (`common.js:271-278`). Building it from palette hexes rather
than blackbody, with the stated reason "the sky must not introduce hues the ships cannot
answer", is correct for R2 and real star colours are far less saturated than people expect.
Likewise **leave the mipmap decision alone** (`common.js:218-227`) — a 2 px quad selecting
the bottom of the mip chain and losing 85% of its alpha is a correct and non-obvious
diagnosis.

**`src/render/postfx.js:167` — Bayer → IGN triangular.** Placement is already right
(half-float composer at `:221`, dither immediately before the 8-bit write, which is what
Gjøl's *Banding in Games: A Noisy Rant* asks for). Three problems for a full-frame sky
gradient: ±0.5 LSB uniform is under-amplitude against Gjøl's ~1 LSB triangular
recommendation; a 4×4 Bayer has a 4-pixel period that reads as visible cross-hatch on the
largest smooth gradient in the frame; and the `for(i<16) if(i==idx)` lookup is 16 iterations
per pixel to read a constant.

```glsl
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float t = ign(gl_FragCoord.xy) - ign(gl_FragCoord.xy + vec2(17.0, 23.0));  // TPDF in [-1,1]
col += t * (dither / 255.0);
```

Also **move `this.smaa` before `this.grade`** (`postfx.js:283-284`) so the last thing
touching the pixels is the quantiser's own noise, rather than an edge filter running over
the dither.

**`src/render/postfx.js` is Lighting & post's file — propose, do not take.**
**Time: half a day each.**

---

## 5. The cost, honestly

### 5.1 Bake time at boot — and the number nobody has

**On hardware: negligible.** 6 faces × 512² × ~40 noise taps ≈ **63 M taps**, one time.
The scaling reference is matusnovak's C++ port of space-3d, which bakes a full procedural
nebula at **4096/face in "slightly more than a second" on a GTX 1070 Ti** — 64× our pixel
count, which puts 512/face in the **low single-digit milliseconds**. three's own
`webgl_shaders_sky` example does 256/face without anyone noticing.

**On SwiftShader: unmeasured, and this is the real risk.** `npm run smoke`, `npm run
capture` and `npm run bench` all run under ANGLE/SwiftShader unless `NP_RASTER=hardware`
(`tools/harness.mjs#rasterMode()`). The same 63 M taps executed in software is plausibly
**0.3–3 s**, added to boot, on the path CI actually uses. That is a real problem for a
game and it is stated as unknown rather than assumed small.

**Mitigation, and it should be in the first version:** gate face size on the quality
preset — **256 on `low` and in CI, 512 shipped, 1024 on `ultra`.** 256/face is 4× cheaper
and, per three.js §3, is *not a downgrade on today's nebula*, because the source sheets are
256² and are already being magnified.

**The honest answer to "if an approach costs 4 seconds of boot, say so":** the **CPU**
path does, or near enough. 6 × 1024² is **~1.7 s** and 6 × 512² with a 2-level warp is
**~720 ms**, single-threaded JS on the main thread at POI entry, on top of the ~45 ms
nebula bake and ~51–90 ms gas-giant albedo we already pay. **That is why the CPU cube is
the fallback and not the plan.** The GPU path exists precisely to avoid that number, and
its SwiftShader cost is **F4** — measure it before item 4 ships, not after.

### 5.2 Texture memory

| | change |
|---|---|
| 6 × 512² RGBA16F cube, no mips | **+12.6 MB** |
| PMREM output (768×1024 RGBA16F at 256 input) | +6.3 MB |
| PMREM ping-pong, collapsing two generators to one | **−6.3 MB** |
| three 256² RGBA nebula sheets + mips, disposed | −1.0 MB |
| graveyard giant's 512² albedo, disposable after a full bake | −0.8 MB |
| **net** | **≈ +11 MB** |

Against a current `info.memory.textures` of **150 objects** (`docs/review/benchmark.md`).
For reference, 1024/face would be **50.3 MB** — available on `ultra`, not the default.

### 5.3 Draw calls, triangles, programs

- **Draw calls:** far scene **17 → 11** (or ~5 at graveyard with a full bake). Against
  `BUDGET.drawCalls = 320`.
- **Triangles:** −1024 (the dome sphere, `skydome.js:91`), +12 (the background box), −~48
  (nebula quads). Irrelevant against a 1,900,000 ceiling and a measured 113,233.
- **Programs:** net **−1** (the nebula sheet program and the dome program out, three's own
  `ShaderLib.backgroundCube` in). 63 today against a ceiling of 90.

**None of this fixes the draw-call failure, and it is not offered as a remedy.** Per **D4**
the baseline is quoted two ways — 499 peak/FAIL at 1600×900 SwiftShader in
`benchmark.md`, 423 high / 231 medium on hardware in `ARCHITECTURE.md:228` — and the far
scene is 17 draws either way. The −6 is a rounding error against a gap of 179 or a headroom
of 89. The draw-call work is hull merging, LOD distances and module instancing, and it is
someone else's item.

### 5.4 What it does to `npm run smoke`

`tools/smoke.mjs` builds and serves the **preview** bundle (deliberately, not the dev
server), boots at 1280×720, settles 60 frames, and **exits non-zero on any `[error]`
console line**; warnings are printed and do not fail.

| risk | assessment |
|---|---|
| Boot time | The bake runs inside `buildCelestials`, inside `bootGame`, **before the first frame**. A 1–3 s SwiftShader bake extends boot and could push `openGame`'s settle budget. **This is the most likely way this plan breaks smoke.** Gate face size on quality (§5.1). |
| `HalfFloatType` cube RT | Needs `EXT_color_buffer_half_float`; core in WebGL2, supported by SwiftShader. **Verify in F4's run, do not assume.** A missing extension throws a console error and fails smoke outright. |
| `CubeCamera` + `autoClear` | If `withBakeState` is missed, the six faces accumulate — a *visual* failure that produces no console error and **will not fail smoke.** This is exactly why item 0 exists. |
| Counters | Smoke already prints `draw calls / triangles / programs / geometries / textures`. The −6 draws and +11 MB show up there for free. |

**No new smoke assertions are needed.** Smoke is a boot gate; `fieldcheck` is the look gate.

### 5.5 What it does to `npm run bench`

- **Peak draw calls −6.** No triangle or program pressure.
- **No fps claim is meaningful under SwiftShader** — `fpsIsMeaningful()` is the predicate
  and `bench.mjs` deliberately refuses to print a pass/fail for it. Do not quote one.
- **`bench.mjs` runs the DEV server**, and HMR full-reloads the page whenever anything
  writes to the source tree. `benchmark.md` records three consecutive benchmark runs
  destroyed by exactly this, reported as `Execution context was destroyed…` and looking
  like a crash. **Do not edit source while a bench is running.** The three-character fix
  (`startServer({ port, mode: 'preview' })`) belongs to the Performance stream.
- **The one bench run that matters for this plan is the item-3 gate**, and it must be
  `NP_RASTER=hardware` at 2560×1440. While you are there, run `npm run bench -- --quality
  medium` once: it separates GTAO's 192-draw depth-normal prepass from scene complexity in
  a single command, which `benchmark.md` says nobody has done and which settles **D4**.

### 5.6 Per-frame cost, which is the actual point

**Zero.** After the bake the field is one `boxMesh` with `depthTest: false`, `depthWrite:
false`, no overdraw, one `textureCube()` fetch per pixel. Today it is a 1024-triangle
inverted sphere running a live fragment shader over the full frame with full overdraw, plus
24 large additive quads with full-screen-scale fill on a 4× MSAA half-float target. **The
fill-rate saving is the real win — not the draw calls.**

---

## 6. What would falsify this — measure these BEFORE spending a wave

This project has repeatedly spent rounds on confident prose that the first measurement
contradicted. Two examples are in the tree right now: the graveyard dome was solved to a
gain that measured **0.3777** when it was predicted to be far lower, and three.js §1c's
headline dome figure describes a version of the file that was superseded before the report
was filed. **Every item below is cheaper than the work it gates.**

### F1 — Capture the current tree. *(gates everything; cost: one run)*

Run item 0's `fieldcheck` on HEAD, unmodified, before touching a line of `src/`.

**Falsifies the plan if:** the graveyard `engagement` background already reads **median
luma ≥ 0.10 with ≥ 40% above 0.06**. Then the dome that landed at `0d4d18e` already closed
R1, the problem is chroma and structure only, and **items 1 and 2 get re-scoped or
dropped**. This is not a remote possibility — the shipped gains were never measured
(§0.3), and the previous gains overshot to 0.3777.

**Also falsifies if:** the number is *far* below 0.05, which would mean the dome is
contributing almost nothing and something else is eating it (vignette at 0.50 for
graveyard, or the Grade pass) — in which case item 1's 2.0–2.3× lift is being applied to a
number that cannot reach 0.10 and the gains, not the geometry, are the problem.

### F2 — The dome elevation probe. *(gates item 1; cost: ~20 lines of Node)*

My §0.2 claim is arithmetic on a shader I read, not a captured frame. Evaluate
`skydome.js`'s fragment body along the `engagement` view direction across the frame's
elevation window (−12.88° to −58.88°) and confirm the **87% → 38% → 30%** profile.

**Falsifies item 1 if:** the dome delivers **≥ 70% of its band peak across the frame**.
Then the band is not mis-centred, my finding is wrong, and item 1 collapses to just the
`saturate` un-clip. Say so and move to item 2.

### F3 — The fill-cost gate. *(arbitrates D1; cost: one shader edit + one bench run)*

**This is the single most important measurement in the document**, because it settles a
three-way disagreement worth several days.

Put item 3's full field shader into the existing dome as a live full-screen fragment
shader. Measure the frame-time delta on **hardware** at 2560×1440 —
`NP_RASTER=hardware npm run bench -- --width 2560 --height 1440`.

| result | verdict |
|---|---|
| **< 0.5 ms** | **shipped-games was right.** The bake "buys nothing" — ship the live shader, skip item 4, bank 12.6 MB and two days. My prior in §3 is wrong and this document should be amended. |
| 0.5 – 2 ms | Judgement call. Bake if `ultra` is a real target; otherwise defer. |
| **> 2 ms** | **three.js was right.** The bake is mandatory. Proceed to item 4. |

Do **not** run this under SwiftShader — the answer will be meaningless and will look
catastrophic.

### F4 — The bake-time falsifier. *(gates item 4; cost: one instrumented smoke run)*

Time `cam.update(gl, bakeScene)` at 512²/face **inside the smoke harness**, i.e. under
SwiftShader, and confirm `EXT_color_buffer_half_float` is present.

**Falsifies the 512 default if:** the bake exceeds ~400 ms → drop CI and `low` to 256.
**Falsifies the GPU bake entirely if:** it exceeds ~2 s even at 256/face, or the half-float
extension is unavailable → fall back to the CPU `DataTexture` cube at 256/face and accept
a soft field, per §3.

### F5 — The alpha reconciliation. *(settles D3; cost: half an hour, inside item 0)*

The two reports differ **5–20×** on `neb-a`'s mean alpha and **2–6×** on its max. Read the
real shipped `CanvasTexture` back through `getImageData`.

**Falsifies item 2's sizing if:** the true mean alpha is at the three.js end (0.0062, not
0.00022). The 69× prototyped lift would then overshoot by an order of magnitude and the
sheets would blow out. **Item 2 must not be tuned against a number nobody has re-measured.**

### F6 — R2 may be unreachable at the graveyard by construction. *(gates the whole chroma programme; escalate to the owner)*

`index.js:206-213` already records the arithmetic and it deserves to be read as a finding,
not a footnote: **green carries a 0.7152 luminance weight, so a pure green field at median
luma 0.10 tops out at chroma ≈ 0.14, and a realistic one at ≈ 0.12** — against R2's
**0.18**. Measured on the two candidate hues: the field built from `graveyard.fill`
(`0x4c6a4a`, whose r and b are within 2/255 of each other) reached **chroma 0.0863 at luma
0.0911**, within 1% of the arithmetic ceiling for that colour's own channel ratios; built
from `graveyard.accent` (`0x8fb04a`) it reached **0.114 at luma 0.12**.

**If the owner holds R2 at 0.18 literally, the graveyard's hue must leave green** — and
"derelict green owns this field" is that location's whole identity (`index.js:189-194`).
The alternatives are a lower-luminance-weight hue (teal, cyan, magenta — note that every
Everspace and Homeworld reference frame uses exactly those) or restating R2 per-hue.

**And R2 is not yet a testable number at all**, because no committed tool defines "chroma"
(§0.3). Item 0 must pin the metric. **A wave spent chasing 0.18 in green will fail by
construction, and it will fail after the work, not before.** Put this in front of the owner
with F1's measurement attached.

### F7 — The R3 direction check. *(gates item 5's value)*

After item 5, re-measure hull mean RGB at engagement range against the current
**0.216 / 0.244 / 0.238**. **Falsifies item 5 if** the hull does not warm — which would
mean `envMapIntensity` (0.30–0.85) is too low for the environment to matter, and the fix is
in the material registry rather than the sky.

---

## 7. The elevation question — this is the owner's call, not ours

**The fork, stated plainly.** The tactical camera's frame does not occupy one elevation.
It sweeps from **[+9.2°, −36.8°]** at zoomT 0.02 down to **[−48.6°, −94.6°]** at zoomT
1.00 — a **104° sweep** covered by a **46° frame** — and the far-scene horizon leaves the
top of the frame entirely at **zoomT ≈ 0.39** at the default pitch offset. **No fixed
elevation is in frame across the zoom range.** So "where does the sky go" is not a solve;
it is a choice about what the game looks at, with three answers that produce different
games in the same code.

### Option A — Move the celestials further to where the camera already looks

Pick the modal gameplay window (zoomT 0.26–0.48, frame centres **−20.6° to −35.9°**) and
put both the nebula centres and the dome's ecliptic band at **y ≈ −0.45 to −0.50 (−27° to
−30°)**. HEAD is at −11.5°/−14.0°/−13.9° and the dome's band is at 0°.

- **Cost:** two numbers per POI in `index.js`, one line plus one uniform in `skydome.js`.
  **Hours.**
- **Consequence for the tactical read: none.** The field moves; the game does not. This is
  the only option with zero gameplay cost.
- **Consequence for fiction:** the bright band sits ~30° below the combat plane at all
  times, which reads as *we are above the ecliptic, looking down into it*. For a salvage
  game working a debris plane that is defensible and arguably good — but it **is a claim
  about where we are**, and it should be made deliberately rather than fall out of a solve.
- **Precedent, and it is the strongest evidence in the whole diagnosis:** this is exactly
  what the gas giant already does and exactly why it reads. `giant-orbit`'s giant is at
  **−15.1°**, the graveyard's at **−28.0°**, and `index.js:236-240` states the reasoning
  outright. **The one celestial class placed below the horizon is the one you can see.**

### Option B — Change what the camera can look at

Lower `ORBIT.pitchFloorMax` (0.95, `camera/constants.js:27`) or shorten the
`pitchFloorT0/T1` ramp, so the plan view is less severe at strategic zoom and the horizon
stays in frame further up the range.

- **Cost:** one or two numbers — but in `src/camera/**`, owned by **Camera & controls**, and
  `constants.js:4-5` points at `docs/design/controls.md §2` as the derivation.
- **Consequence for the tactical read: real and negative.** The pitch floor exists to
  *enforce* a plan view at strategic range. Every capital ship is plane-locked to y = 0
  (`ARCHITECTURE.md` §1 conventions), so a plan view is what makes relative positions,
  ranges and formations legible — which is the entire purpose of zooming out. **Flattening
  the camera at strategic zoom trades tactical legibility for sky. Do not pay that for a
  backdrop.**

**Option B′ — the interesting variant, and nobody has costed it.**
`renderer.js:94-95` copies the main camera's quaternion to the far camera **outright**.
Applying a compression factor to the far camera's *pitch only* — e.g. far pitch = main
pitch × 0.6 — keeps the sky's interesting band in frame at every zoom while the gameplay
camera is untouched.

- **Cost:** ~3 lines in `renderer.js` (Lighting & post's file — propose it).
- **Consequence:** the sky stops tracking the camera rigidly, so tilting slides the sky at
  a different rate than the world. At 46° FOV that is a visible effect and it may well read
  as "the sky is on rails". **But it is the only option that puts the field in frame at
  every zoom level**, it is an afternoon to prototype and measure, and it should be
  prototyped before it is dismissed on taste.

### Option C — Make the field non-directional so elevation stops mattering

This is what the dome that landed today is *for*, and `skydome.js:20-31` argues it well:
re-aiming the band "fixes the framings it can reach, but it cannot fix all of them at once,
because the tactical camera's yaw is free and a band is directional by design". So the dome
carries R1/R2 at every yaw and elevation, and the band carries structure wherever it happens
to land.

- **Cost:** nothing new. It is the current architecture, correctly stated.
- **Consequence:** the sky has no strong directional read — which is precisely the "flat
  coloured gradient painted across the whole sky" failure `nebula.js:4-7` is explicitly
  written against, and which `full-audit.md#G6` names as the wide shot being empty.
- **And there is a real tension in the brief here worth surfacing:** R2 asks for *one hue
  owning the field* (non-directional), while `reference-frames.md` §0 asks for *a large,
  saturated, luminous object* (directional). Those are two different readings of the same
  six references — **Homeworld's red field is Option C; Everspace's cropped planet limb is
  Option A.** The owner supplied both and they pull opposite ways.

### Recommendation

**Take A, keep C as the floor, and prototype B′ before ruling it out. Do not take B.**

Concretely: re-centre the dome's ecliptic band and the nebula centres to ≈ −30° (A applied
to both — this is build item 1); keep the dome carrying R1/R2 at all yaws so no camera
angle produces an empty sky (C, already built); and spend one afternoon measuring far-camera
pitch compression (B′), because it is the only thing that rescues the zoom-out frames.
Leave `ORBIT.pitchFloorMax` alone — **the plan view is a gameplay guarantee and the
backdrop is not allowed to buy from it.**

### The layer this question is really about

Everspace's structure, which is what the owner's two Everspace frames actually show, is
**three layers**: (1) a quiet coloured sky — R1/R2, the floor; (2) **one large
finite-distance hero body breaking the frame edge** — "the large, saturated, luminous
object"; (3) dark local geometry carrying warm emissive accents — R5. In their frames the
planet limb and nebula bank are **not the sky at all**; they are finite-distance level
actors, which is why the limb crops against the frame edge and parallaxes as you fly.

`CELESTIAL_SPECS` has slots for all three. **Layer 2 is the one we underweight:**
`near-star` has `giant: null` (`index.js:294`) and the graveyard's giant is **3.9° of
angular radius** — deliberately small, and the reasoning at `index.js:242-248` is sound for
that location. `reference-frames.md` §4.1 names layer 2 as the single highest-value open
change.

**And layer 2 is an elevation question too**, which is why it belongs here rather than in a
separate document: a hero body only reads if it is placed where the camera looks, and the
two that work are at −15.1° and −28.0°. Whatever the owner decides about the field's
elevation applies to the hero body first, because the hero body is the thing the references
actually put in the frame.

---

## Sources

Every URL below appears because a researcher cited it and a number in this document depends
on it.

**Shipped games**
- [Homeworld 1 source — `btg.c`](https://github.com/aheadley/homeworld/blob/master/src/Game/btg.c) · [`btg.h`](https://raw.githubusercontent.com/aheadley/homeworld/master/src/Game/btg.h) — vertex-colour background format, no Z per vertex
- [Simon Schreibt — Homeworld 2: Backgrounds](https://simonschreibt.de/gat/homeworld-2-backgrounds/) · [Backgrounds Tech](https://simonschreibt.de/gat/homeworld-2-backgrounds-tech/) — 1024×512 source, output levels 255→128, contrast-driven tessellation
- [r-lyeh/img2sky](https://github.com/r-lyeh-archived/img2sky) — 1,656–30,055 vertices for a full sky
- [CCP — Introducing New Nebulae into EVE](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve) · [Building the future of EVE](https://www.eveonline.com/news/view/building-the-future-of-eve) — 68 backdrops, resolution doubled, "most ships in EVE reflect the nebula of the area of space they are in"
- [EF-Map (third-party three.js, EVE Frontier)](https://ef-map.com/blog/) — textures → procedural noise; 24,000 instanced stars; starfield 500 ms → 4 ms
- [80.lv — Generating the Universe in Elite: Dangerous](https://80.lv/articles/generating-the-universe-in-elite-dangerous) — "during the jump, your system generates the next system's skybox"
- [80.lv — Everspace (Michael Schade)](https://80.lv/articles/everspace-proper-german-space-game) — the three-layer composition
- [Schneider & Vos — Real-time Volumetric Cloudscapes of Horizon Zero Dawn, SIGGRAPH 2015](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf) — 128³/32³/128² generated noise; "around 20 milliseconds. (pause for laughter)"
- [GDC 2015 — Visual Effects in Star Citizen](https://www.gdcvault.com/play/1021768/Advanced-Visual-Effects-With-DirectX) — volumetrics as local objects, not as the sky
- [Children of a Dead Earth](https://childrenofadeadearth.wordpress.com/) — the anti-reference; R1 is art direction, not physics

**Technique**
- [Inigo Quilez — Domain warping](https://iquilezles.org/articles/warp/) · [fBM](https://iquilezles.org/articles/fbm/)
- [Bridson, Hourihan, Nordenstam — Curl-Noise for Procedural Fluid Flow, SIGGRAPH 2007](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf) — velocities O(1/L); the finest octave dominates
- [Lagae et al. — A Survey of Procedural Noise Functions, CGF 2010](https://www.cs.umd.edu/~zwicker/publications/SurveyProceduralNoise-CGF10.pdf) — fbm output is approximately Gaussian
- [Leria (Neyret lab, INRIA) — Procedural 3D dust and nebulas](https://evasion.inrialpes.fr/Membres/Fabrice.Neyret/Etudiants/rapports/rapportM2-2020_Erwan_LERIA.pdf) — per-channel absorption `a_rgb`; anisotropic `stretch()`; radial hue shells
- [Max — Optical Models for Direct Volume Rendering, IEEE TVCG 1995](https://dl.acm.org/doi/10.1109/2945.468400) — emission-only flattens; absorption produces depth
- [Worley noise / F2−F1](https://en.wikipedia.org/wiki/Worley_noise) · [Variations of cellular noise](https://sangillee.com/2025-04-18-cellular-noises/)
- [Mikkel Gjøl — Banding in Games: A Noisy Rant](https://loopit.dk/banding_in_games.pdf) — ~1 LSB triangular dither, at the point of quantisation
- [Jorge Jimenez — Next Generation Post Processing in CoD:AW](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/) · [frost.kiwi — fixing colour banding](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/) — interleaved gradient noise
- [AstroBackyard — narrowband primer](https://astrobackyard.com/narrowband-imaging/) · [The Astro Manual — Hubble palette](https://theastromanual.com/narrowband-astrophotography-ha-oiii-sii/) — Hα 656.3, [O III] 500.7, [S II] 672.4; SHO is a mapping decision
- [HNSky — star counts by magnitude (Tycho-2/UCAC4)](https://www.hnsky.org/star_count.htm) · [UCO/Lick — Euclidean number counts](https://www.ucolick.org/~simard/phd/root/node8.html) — real slope ≈0.47, not 0.58
- [Jurić et al. — Milky Way Tomography I (SDSS)](https://arxiv.org/pdf/astro-ph/0510520) — ~270 pc scale height vs ~2.6 kpc scale length

**three.js r185 (verified against `node_modules/three/src/`)**
- [`WebGLBackground.js`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLBackground.js) — one `boxMesh`, `renderList.unshift`, `toneMapped = getTransfer(colorSpace) !== SRGBTransfer`
- [`WebGLRenderer.js` 2342 / 2349](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js) — non-XR render targets force linear output and `NoToneMapping`
- [`CubeCamera.js`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/CubeCamera.js) — six `render()` calls, relies on `autoClear`
- [`WebGLCubeRenderTarget` docs](https://threejs.org/docs/api/en/renderers/WebGLCubeRenderTarget.html) — `isRenderTargetTexture` and the px/nx handedness note
- [`PMREMGenerator` docs](https://threejs.org/docs/pages/PMREMGenerator.html) · [source](https://github.com/mrdoob/three.js/blob/dev/src/extras/PMREMGenerator.js) — ideal input 256/face; instance-scoped `_dispose` in r185
- [Colour Management manual](https://threejs.org/manual/en/color-management.html) — sRGB for colour, `LinearSRGBColorSpace` for radiance
- [`webgl_shaders_sky` example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_shaders_sky.html) — the canonical bake shape
- [wwwtyro/space-3d](https://github.com/wwwtyro/space-3d) · [matusnovak/space-3d](https://github.com/matusnovak/space-3d) — seeded GLSL sky baked to a cubemap; 4096/face in "slightly more than a second" on a GTX 1070 Ti
- [WHATWG HTML #5365](https://github.com/whatwg/html/issues/5365) · [WebGL spec — `UNPACK_PREMULTIPLY_ALPHA_WEBGL`](https://registry.khronos.org/webgl/specs/latest/1.0/) — canvas backing stores are premultiplied; the round trip is lossy
