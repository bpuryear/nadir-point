# Skybox specification — the value budget, the layer stack, and the ceiling the last brief lacked

**Design document. Written 2026-07-30 against HEAD `6ae7df9`. No `src/` file was changed to
produce any number in this document.** Every measurement below was taken by me on this tree,
on hardware ANGLE/Metal at 1600×900, N = 1 440 000 px per statistic, and the commands are
quoted verbatim. Where I quote an earlier document I say so and I re-measured it here.

This document supersedes `docs/design/space-backgrounds.md` §3 item 3 and the amplitude
half of `src/world/celestials/field.glsl.js`'s header. It does **not** supersede
`docs/review/field-baseline.md`, which is still the correct account of how to measure.

---

## 0. The finding, in two numbers and one sentence

```
$ node tools/fieldcheck.mjs engagement,close,wide,cinematic --report

FIELDCHECK SUMMARY  4/4 shot(s) meet R1 and R2   raster=hardware  viewport=1600x900
  engagement         PASS  median luma 0.1271  above0.06  89.88%  chroma 0.1373  hue  79.1 deg  band  32 deg  [N=1440000]
  close              PASS  median luma 0.1071  above0.06  86.49%  chroma 0.2784  hue 217.5 deg  band   5 deg  [N=1440000]
  wide               PASS  median luma 0.1405  above0.06  86.44%  chroma 0.3058  hue 215.1 deg  band   5 deg  [N=1440000]
  cinematic          PASS  median luma 0.1202  above0.06  94.36%  chroma 0.1295  hue  85.8 deg  band  29 deg  [N=1440000]
```

**Four of four shots pass every target, and `docs/review/wave6/engagement.png` looks like
green marble.** R1 asks for ≥ 40% of the frame above luma 0.06; the shipped frame delivers
**89.88%**. R1 asks for a median ≥ 0.10; it delivers **0.1271**. Both floors were cleared by
more than 2×, because they were floors and nothing above them was ever bounded.

The last brief was not wrong about the direction. It was missing a ceiling, and an agent
optimising an unbounded floor sails past it. **This document is the ceiling.**

### The acceptance test is not a number

The bar is the owner's: **the backdrop must beat plain stars on black in a blind
comparison.** I rendered that control and it is §1. A backdrop that is merely brighter, or
merely more colourful, or that merely satisfies R1/R2, fails.

---

## 1. The control, rendered, and the honest verdict

The dome and nebula can be hidden at runtime — `world.systems.celestials.parts.{dome,
nebula}.object.visible` — leaving the starfield, the star and the gas giant. I rendered
`engagement` and `wide` three ways at the identical settled pose with the sim paused:
**A** as HEAD ships it, **B** with the dome hidden, **C** with dome and nebula both hidden
(plain stars on black plus the celestials). Field statistics are taken with
`world.scene.visible = false`, the same method `fieldcheck.mjs` uses.

```
raster=hardware  1600x900
engagement  A-head        FULL med 0.1277 chroma 0.1333 >0.06 89.35% <0.02  0.14%  |  FIELD med 0.1269 chroma 0.1373 >0.06 89.78% <0.02  0.04%  p95 0.2566
engagement  B-nodome      FULL med 0.0280 chroma 0.0078 >0.06  3.99% <0.02 22.89%  |  FIELD med 0.0280 chroma 0.0078 >0.06  2.03% <0.02 23.68%  p95 0.0448
engagement  C-plainstars  FULL med 0.0280 chroma 0.0078 >0.06  3.02% <0.02 23.72%  |  FIELD med 0.0263 chroma 0.0078 >0.06  1.06% <0.02 24.34%  p95 0.0437
wide        A-head        FULL med 0.1435 chroma 0.3020 >0.06 85.37% <0.02  6.44%  |  FIELD med 0.1405 chroma 0.3059 >0.06 86.43% <0.02  5.59%  p95 0.3345
wide        B-nodome      FULL med 0.0154 chroma 0.0118 >0.06 19.17% <0.02 64.10%  |  FIELD med 0.0151 chroma 0.0118 >0.06 16.50% <0.02 66.98%  p95 0.2764
wide        C-plainstars  FULL med 0.0149 chroma 0.0118 >0.06 18.63% <0.02 67.36%  |  FIELD med 0.0123 chroma 0.0118 >0.06 15.96% <0.02 70.30%  p95 0.2743
```

**The instrument checks out against a number nobody involved in it wrote.**
`src/world/celestials/skydome.js:12` records the pre-dome measurement as *"engagement
background median luma 0.0261, 2.1% of frame above luma 0.06"*. My control C measures
**0.0263 and 1.06%** — a different script, a different tree, four months of commits later,
reproducing to **0.0002 of median luma**.

### The verdict, stated plainly

**The owner is right, and it is not close.** At `engagement` the control has the hull, the
debris and the gas giant reading as lit objects in depth; the shipped frame has a green wall
with grey objects on it. At `wide` the difference is worse and it is diagnostic: with the
dome on, the ringed gas giant — the one object in the entire game that is literally the
owner's reference frame — reads as **a dark hole punched in a blue sky**.

That is not a taste claim. It is §2.

### What the control genuinely lacks, so this is not just a revert

The control's field measures **median chroma 0.0078** at engagement and **0.0118** at wide.
It is colourless. `reference-frames.md`'s "space is never black" instinct is right and the
EVE Frontier "the darkness is coloured, not absent" lesson is right. **The control's darkness
is absent, not coloured, and that is the one thing this spec must add to it** — at roughly
one fifth of the amplitude the current tree uses.

---

## 2. THE VALUE BUDGET — this is the ceiling

All luma and chroma below are **display-referred, tone-mapped, sRGB-encoded values in
[0,1]**, luma by Rec.709 weights, chroma `C = max(R,G,B) − min(R,G,B)` — the metric
`field-baseline.md` §0 pinned and `fieldcheck.mjs` implements. Do not change the metric.

### 2.1 The post chain has its own black floor, and it is 0.026

The plain-stars control's field sits at **median 0.0263, p95 0.0437, 24.34% below 0.02**.
With no dome, no nebula and essentially no star pixels, the grade, the 0.50 vignette and the
film grain hold the frame at ≈0.026. **"Near-black" in this game means 0.015–0.045, not 0.**
Every band below is stated against that floor, not against zero.

### 2.2 Luminance bands and area budget

Measured directly on the **field** (`world.scene.visible = false`), not interpolated:

```
raster=hardware
=== engagement FIELD ONLY — value-band area ===
  A-head        VOID<0.045   2.57%  FAINT .045-.10  35.81%  STRUCT .10-.28  59.18%  HIGH>0.28  2.43%   C/L nonvoid 1.174  C/L void 1.275
  C-plainstars  VOID<0.045  96.79%  FAINT .045-.10   2.36%  STRUCT .10-.28   0.59%  HIGH>0.28  0.26%   C/L nonvoid 0.247  C/L void 0.328
=== wide FIELD ONLY — value-band area ===
  A-head        VOID<0.045   9.72%  FAINT .045-.10  19.06%  STRUCT .10-.28  62.44%  HIGH>0.28  8.78%   C/L nonvoid 2.097  C/L void 2.254
  C-plainstars  VOID<0.045  80.76%  FAINT .045-.10   7.90%  STRUCT .10-.28   6.46%  HIGH>0.28  4.88%   C/L nonvoid 0.922  C/L void 0.763
```

| band | luma | **target % of field area** | shipped `engagement` | control | what lives here |
|---|---|---|---|---|---|
| **VOID** | < 0.045 | **55 – 70%** | **2.57%** | 96.79% | tinted darkness. The default state of the sky. |
| **FAINT FIELD** | 0.045 – 0.10 | **22 – 35%** | 35.81% | 2.36% | galactic band wings, outer wash, dust-lit edges |
| **STRUCTURE** | 0.10 – 0.28 | **5 – 12%** | **59.18%** | 0.59% | band core, hero body's lit face |
| **HIGHLIGHT** | > 0.28 | **0.3 – 1.5%** | 2.43% | 0.26% | stars, corona, specular limb |

*(The four bands partition the frame and must sum to 100%. A consistent midpoint set is
62 / 28 / 8.5 / 0.9.)*

**Read the STRUCTURE row.** Nearly **60% of the shipped field sits in the value band reserved
for a nebula core and a planet's lit face.** That is the wall, as one number: the band that is
supposed to be the subject is instead the background.

### 2.3 The percentile ladder — the same statement, unambiguously

| percentile | shipped | control | **TARGET** |
|---|---|---|---|
| p05 | 0.0511 | (whole field lies ≈0.015–0.045) | **0.012 – 0.020** |
| p25 | 0.0790 | — | **0.018 – 0.028** |
| **p50** | **0.1268** | **0.0263** | **0.028 – 0.045** |
| p75 | 0.1932 | — | **0.050 – 0.075** |
| p95 | 0.2565 | 0.0437 | **0.10 – 0.16** |
| p99.9 | — | — | **≥ 0.45** (stars) |

**Ladder ratio p95/p05: shipped 5.02, control ≈2.3, target ≈8.1.** Read that row twice. The
last pass widened the ladder by **lifting the top**; this widens it further by **dropping the
bottom**. The target frame has *more* dynamic range than the shipped one and *one third* of
its median.

The two tables are consistent by construction: a VOID share of 55–70% puts p50 below 0.045,
and a STRUCTURE + HIGHLIGHT share of 5–13% puts p95 near 0.13.

### 2.4 R1, restated with both bounds — **this is a change to a requirement the owner set**

R1 was written as *"background pixels: median luma ≥ 0.10, and ≥ 40% of frame above luma
0.06"* from `reference-frames.md` §0's observation that *"in all six of the owner's reference
frames the background is a large, saturated, luminous **object**, and in ours it is black."*

**R1 encoded that observation as a whole-field average, and that is the defect.** A frame
whose subject is a discrete luminous body has a *low* field median and a *bright* object; R1
cannot tell that frame apart from a uniform wash, and an optimiser handed R1 will always
build the wash because the wash is cheaper. My `wide` control is the proof: it **is** the
reference frame — an enormous ringed planet, luminous, against black — and it measures field
median luma **0.0123** with **70.30% of the field below 0.02**. It fails R1 by 8× and it is
the best frame in this document.

> **R1′ (field).** Field median luma **0.028 – 0.045**. Field area above luma 0.06
> **12 – 30%**. Field area below luma 0.045 **55 – 70%**. All three are two-sided.
>
> **R1″ (subject).** At least one **discrete** far-scene body subtends ≥ 6° of angular
> diameter in the modal gameplay frame and carries median luma ≥ 0.10 over its own footprint.
> The "large, saturated, luminous object" is an object. It is not the sky.

The control passes R1″ at `wide` (giant, 19.42% of frame, median luma 0.1287) and the shipped
tree fails it (same giant, median luma 0.0827 against a field of 0.1874). Under R1 as
written, that is backwards. Under R1′/R1″ it is right.

### 2.5 R2, restated — **as written it mathematically forces the wall**

R2 asks for field median chroma ≥ 0.12 on a green-dominant field. For a green-dominant pixel
with R and B at zero, `L = 0.7152·G` and `C = G`, so **`C = 1.398·L`** — the ceiling
`field-baseline.md` §7 derives and I am reusing. Invert it:

> **median chroma ≥ 0.12 ⟹ median luma ≥ 0.12 / 1.398 = 0.0858.**

**R2 and R1 are the same constraint wearing two hats, and together they make a dark sky
arithmetically impossible.** The last pass did not overshoot through carelessness; it was
*required* to build something at least 0.086 bright everywhere in order to pass R2 at all.
Any brief that keeps R2 in this form will produce another wall.

The fix is to stop measuring chroma over pixels whose luma cannot carry it:

> **R2′.** Over field pixels with **luma ≥ 0.045** only (the non-void field): median chroma
> ≥ 0.10, **and** median `C/L` ≥ **0.75**. Hue band containing 80% of chroma mass ≤ 60°,
> unchanged. Additionally the **void** (luma < 0.045) must carry median `C/L` ≥ **0.45** —
> the darkness is coloured, not absent, but it is dark first.

Sanity-check against the measured `C/L` medians in §2.2, which is why that column is there:

| | non-void `C/L` | void `C/L` | R2′ |
|---|---|---|---|
| shipped `engagement` | **1.174** | **1.275** | passes both, with 1.6× and 2.8× of margin |
| control `engagement` | **0.247** | **0.328** | **fails both** |
| shipped `wide` | 2.097 | 2.254 | passes |
| control `wide` | 0.922 | 0.763 | passes — because the *gas giant* is carrying the colour |

**The shipped field passes R2′ with margin and would still pass after a 3× luminance cut —
the colour is not what has to change.** The control fails it at `engagement`, which is exactly
the deficiency §1 identified. And the control *passes* at `wide` because a saturated blue
planet is in frame: **R2′ correctly accepts colour that comes from an object rather than from
a wash**, which is the distinction R2 could not make.

*(The "median chroma ≥ 0.10 over the non-void field" clause is not yet measured on either
variant — `fieldcheck` reports chroma over the whole field. Build item 0 must add it. The
`C/L` clauses above are measured and are the load-bearing half.)*

### 2.6 SHIP-TO-FIELD CONTRAST — the specific thing that broke, as a gate

Metric: build the occlusion mask `fieldcheck.mjs` already builds (pixels differing by more
than 12 levels between the normal render and the field-only render). For each masked pixel,
**margin = luma(subject) − luma(field behind that same pixel)**. Same pixel, both images, so
the statistic is paired.

```
=== engagement ===
A-head       HULL+DEBRIS  coverage 2.71%  subject med 0.1401  field-behind med 0.1193  MARGIN med  0.0233 [p10 -0.1039 p90 0.2342]  darker-than-field 43.5%
C-plainstars HULL+DEBRIS  coverage 1.96%  subject med 0.1858  field-behind med 0.0291  MARGIN med  0.1541 [p10  0.0449 p90 0.3411]  darker-than-field  1.0%
=== wide ===
A-head       HULL+DEBRIS  coverage 4.39%  subject med 0.1184  field-behind med 0.0846  MARGIN med  0.0221 [p10 -0.0742 p90 0.1243]  darker-than-field 42.0%
A-head       GAS GIANT    coverage 32.36% subject med 0.0827  field-behind med 0.1874  MARGIN med -0.0988 [p10 -0.1871 p90 0.1610]  darker-than-field 78.8%
C-plainstars HULL+DEBRIS  coverage 3.12%  subject med 0.1495  field-behind med 0.0081  MARGIN med  0.1360 [p10  0.0406 p90 0.2181]  darker-than-field  4.8%
C-plainstars GAS GIANT    coverage 19.42% subject med 0.1287  field-behind med 0.0079  MARGIN med  0.1183 [p10  0.0373 p90 0.4570]  darker-than-field  0.2%
```

*(The masks differ slightly between variants — 2.71% vs 1.96% — because a bright field makes
more edge pixels cross the 12-level threshold. The **margin** is computed per pixel across
both images and is unaffected.)*

Three findings, and the third is the whole problem:

* **The hull's separation from its background collapsed 6.6×**, from a median margin of
  0.1541 to **0.0233**.
* **43.5% of hull pixels at `engagement` and 42.0% at `wide` are now DARKER than the sky
  behind them**, against 1.0% and 4.8% in the control. The ship is not lit against a
  backdrop; it is a mid-grey stencil on a mid-green field.
* **78.8% of the gas giant is darker than the sky behind it**, median margin **−0.0988**.
  The hero body is a silhouette. `field-baseline.md` §2 saw the shadow of this — *"hiding the
  gas giant raises the median by +0.0014 — it occludes field rather than adding to it"* — and
  did not draw the conclusion. The conclusion is that **the field has been made brighter than
  the objects it is supposed to sit behind.**

> **R7 — SUBJECT SEPARATION. New, and it is a gate.**
>
> | | requirement | shipped | control |
> |---|---|---|---|
> | hull + debris, median margin | **≥ 0.10** | 0.0233 ✗ | 0.1541 ✓ |
> | hull + debris, % darker than field | **≤ 10%** | 43.5% ✗ | 1.0% ✓ |
> | any far-scene body meant to read as luminous, median margin | **≥ +0.06** | −0.0988 ✗ | +0.1183 ✓ |
> | that body, % darker than field | **≤ 15%** | 78.8% ✗ | 0.2% ✓ |
>
> R7 is measured on `engagement` and `wide`. **No layer may be brightened past the point
> where R7 fails**, and R7 outranks R1′ and R2′ when they conflict.

R7 is the requirement whose absence caused this. It is cheap to measure — the mask already
exists in `fieldcheck.mjs` — and it is the only requirement in the set that is *about the
relationship between the sky and the game*, which is the thing that actually broke.

---

## 3. THE LAYER STACK

Draw order uses the existing `ORDER` constants in `src/world/celestials/common.js:41-56`.
Each layer states its job, its **luminance ceiling as a contribution to field median**
(measurable by hiding that layer alone, the `--attrib` method), and what it must not do.

Baseline for the contribution column: `field-baseline.md` §2 measured, by single-variable
probe, that the **dome carries 0.1001 of the field's 0.1281 median** (ecliptic band 0.0551,
lobe 0.0450), the starfield **+0.0002**, and the whole 14-layer nebula **−0.0003**.

**The contribution column is a delta, not an absolute**, measured the way `--attrib` measures:
hide that layer alone and record how far the field median moves. It is stated against the
**control's floor of 0.0263** (§1) — the median the post chain produces with no dome, no
nebula and no meaningful star pixels. The layers add to that floor; they do not replace it.

| # | order | layer | job | **Δ field median** | area ceiling | must NOT |
|---|---|---|---|---|---|---|
| — | — | *(post chain floor — grade, 0.50 vignette, film grain)* | *not a layer; it is the baseline* | *0.0263 measured* | — | — |
| 0 | — | **VOID FLOOR** (`far.background`, or the dome's base term) | tint the darkness so it is coloured, not absent | **+0.004 – 0.010** | 100% | be black; carry any feature smaller than the whole frame |
| 1 | `stars` 0 | **GALACTIC BAND** (dome, additive) | one flat low-frequency stripe, mostly unresolved starlight | **+0.003 – 0.008** | ≤ 40% of frame above 0.045; peak luma ≤ 0.09 | read as swirl; have more than two luma lobes across the frame |
| 2 | `stars` 0 | **STARFIELD** | **THE SUBJECT** | **+0.001 – 0.004** | 0.4 – 1.5% of frame above luma 0.06 | live below the film grain floor (it does today — §4) |
| 3 | `star` 2 / `planet` 5 | **DISCRETE BODIES** — star, gas giant, distant hulk | the "large, saturated, luminous object" of R1″ | may be **negative**; must satisfy R7 on its own footprint | 5 – 35% of frame | be darker than the field behind it |
| 4 | `dust` 24 | **DUST LANES** — 2–4 quads, coloured absorption, in front | subtract; carry the rust hue; occlude the bodies for depth | **−0.002 – −0.005** | ≤ 25% of frame | add light (it is a multiply, not an add) |
| — | — | ~~emission nebula sheets~~ | **DELETED — §5** | ~~−0.0017 measured~~ | — | — |

**Reconciliation: 0.0263 + [+0.003 … +0.020] = 0.029 – 0.046**, against R1′'s 0.028 – 0.045.
The budget closes.

**Read the dome's two rows against what it does today.** `field-baseline.md` §2 measured the
dome at **+0.1001** of field median (ecliptic band 0.0551, lobe 0.0450). Layers 0 and 1 give
it **+0.007 to +0.018** combined. That is a **6–14× reduction in the dome's contribution**,
and it is the single largest change in this document.

### 3.1 The dome's luminance must fall to ≈14% of its linear output, not to 30%

This is the arithmetic that produced two overshoots in a row and it must be in the
implementer's hands. `src/world/celestials/index.js:218-226` fitted the dome's tone-mapped
response as **`out = 1.111 · L^0.643`**, where `L` is scene-linear radiance and `out` is
display median luma. That fit is self-consistent with `space-backgrounds.md` §1.1's
independent solve (display 0.10 ← linear 0.0245: `1.111 · 0.0245^0.643 = 0.1023` ✓).

Invert it at the two points that matter:

| | display median | ⟹ scene-linear radiance | ratio to shipped |
|---|---|---|---|
| shipped today | 0.1268 | **0.03420** | 1.000× |
| R1′ top | 0.045 | 0.00683 | 0.200× |
| **R1′ mid** | **0.036** | **0.00483** | **0.141×** |
| R1′ bottom | 0.028 | 0.00327 | 0.096× |

**A 3.5× reduction in display median needs a 7× reduction in linear output.** Halving the
gain lands at `1.111 · 0.0171^0.643 = 0.0812` — still **1.8× over the top of the target band**
and it will look like a smaller wall. ACES compresses hard in this range, and every intuition
about "turn it down a bit" is wrong by a factor of two here. **This is the specific trap that
produced two overshoots in a row.**

**The shipped gains, read off the live material on this tree** — not from any earlier
document, because the wave-6 pass moved all three POIs and `field-baseline.md`'s
`uGain 0.049 uBase 0.17` is stale:

```
$ node tools/fieldcheck.mjs engagement --dome --report
  uGain 0.092  uBase 0.318  uAxis 0.089, -0.2419, -0.9662
  dome linear luma    min 0.036865  mean 0.068539  max 0.109574
```

| POI | `index.js` | shipped `gain, baseGain` | **0.14× starting point** |
|---|---|---|---|
| `graveyard` | `:319` | `0.092, 0.318` | **`0.092, 0.045`** |
| `giant-orbit` | `:118` | `0.276, 1.35` | **`0.276, 0.19`** |
| `near-star` | `:512` | `0.489, 1.78` | **`0.489, 0.25`** |

Scale `baseGain` and leave `gain` alone: `baseGain` is the multiplier on the whole field
(`skydome.js:128`'s `uBase`), so scaling it alone is the uniform linear scale §6.2 requires,
and it preserves every channel ratio and therefore every hue exactly.

**These are starting points to be re-solved against `fieldcheck`, not values to ship as
guessed.** The previous author of this file overshot to a measured 0.3777 once and to 0.1271
twice. **Solve, measure, re-solve. Do not ship the first solve.** And note `near-star` is
still completely unmeasured — no shot in `tools/shots.json` visits it — so its row is
arithmetic, exactly as `index.js:277-286` already admits.

### 3.2 A consequence worth banking: `cinematic` and option B′ both dissolve

`field-baseline.md` §4 established that the dome's directional lobe is worth 0.045 of median
luma and **zero at any yaw more than ~90° off the POI bearing** (at `cinematic` the axis is
118° off the view and the lobe measures 0.00000–0.00065 across the whole frame), so the
yaw-independent floor was 0.0831–0.0936 against R1's 0.10. That 0.017 shortfall was the
entire remaining R1 gap, and it drove `space-backgrounds.md` §7's option B′ — compressing the
far camera's pitch so a bright band stays in frame at every zoom.

Under this spec the lobe is ~45% of the dome's much smaller contribution, so dropping it moves
the field median from ≈0.036 to ≈0.031 — **still inside R1′'s 0.028–0.045 band.** The
`cinematic` failure cannot recur, because the requirement no longer sits above the
yaw-independent floor. **B′ buys nothing.** Do not spend an afternoon on it; leave
`renderer.js:94-95` alone.

This is the general shape of the change: **most of the previous two waves' difficulty was
caused by R1's floor being set above what a dark sky can reach, not by any defect in the
sky.**

---

## 4. STAR TREATMENT

### 4.1 The starfield is not misbuilt. It is under-amplitude by an order of magnitude.

Measured with the dome, nebula, gas giant and star all hidden — the starfield **alone**, at
`engagement`:

```
  starfield count = 7200 points, frame 1440000 px
  frame area above luma:
    > 0.02    75.3937 %   (1085669 px)      <- this is the grain floor, not stars
    > 0.04    10.5481 %   (151893 px)       <- still the grain floor
    > 0.06     0.0846 %   (1218 px)         <- THIS is the starfield
    > 0.10     0.0615 %   (886 px)
    > 0.20     0.0313 %   (451 px)
    > 0.40     0.0055 %   (79 px)
    > 0.70          0 %   (0 px)
  DIM star pixels  (0.065 < L <= 0.15): N=475  median chroma 0.0980
  BRIGHT star pixels (L > 0.35):        N=126  median chroma 0.1569
```

**7 200 stars produce 1 218 pixels above luma 0.06 — 0.17 pixels per star, 0.085% of the
frame.** With `starfield.js:102` flooring point size at 2.4 px, 7 200 sprites cover at
minimum ~32 000 px of geometry. So **the overwhelming majority of the starfield renders below
the post chain's own film-grain floor** and is invisible as stars, contributing only to the
75.4%-above-0.02 haze that the control's 0.0263 median is made of.

`starfield.js` was never the problem and `field-baseline.md` §2's "+0.0002" was read as "the
starfield doesn't matter". It doesn't matter *to the median* — by area it never could. It is
the subject of the frame and it is turned almost all the way down.

### 4.2 Decisions

**(a) Amplitude — the only change that matters.** `starfield.js:146` reads
`float amp = mix(0.30, 2.80, pow(vFlux, 0.85));`. Raise the floor and the ceiling:
**target `mix(0.85, 4.0, pow(vFlux, 0.85))` as a starting point**, solved against the area
budget below, which is the gate:

| | shipped | **target** |
|---|---|---|
| frame area above luma 0.06 | 0.0846% | **0.40 – 1.50%** |
| frame area above luma 0.20 | 0.0313% | **≥ 0.12%** |
| frame area above luma 0.40 | 0.0055% | **≥ 0.03%** |
| brightest star display luma | < 0.70 | **0.75 – 0.90, and not clipping** |

**(b) Count: 7 200 → 12 000 – 16 000** at `graveyard` and `giant-orbit`; leave `near-star` at
2 600 (a star-washed sky legitimately has fewer visible stars). One draw call, one program,
one buffer; EF-Map's shipped three.js starfield runs 24 000 instanced stars. **Do this
second, after amplitude** — more stars at the current amplitude is more grey haze, which is
the failure `starfield.js:6-13`'s own header is written against.

**(c) `MAG_SLOPE` 0.58 → 0.47** (`starfield.js:32`). 0.58 is the Euclidean slope, valid for a
uniformly populated infinite universe. `space-backgrounds.md` §4 item 6 measured the real
Tycho-2/UCAC4 slope over this file's own `MAG_MIN −1.4 … MAG_MAX 6.7` window at **≈0.468**
(1 744 stars to mag 5; 382 925 to mag 10). A too-high slope pushes the inverse CDF toward
`MAG_MAX`, over-producing near-threshold specks and under-producing bright anchors — which
is precisely what §4.1 measures (**79 px above luma 0.40 in the entire frame**).

**(d) Size floor: keep 2.4 px** (`starfield.js:102`). The ramp `2.4 + 9.6·fn^0.62` gives a
5.7:1 diameter range from mag 6.7 to mag −1.4, which is right. **Leave the mipmap decision at
`common.js:218-227` alone** — a 2 px quad selecting the bottom of the mip chain and losing
85% of its alpha is a correct and non-obvious diagnosis, and re-deriving it will cost a day.

**(e) COLOUR — and here the guides point the right way but our measured failure is a
different one. I am not going to pretend otherwise.**

The KSP guide sets "desaturate dim stars" to its lowest value so faint stars keep a tint and
calls that the source of a colourful sky; CoreGames picks "Full Spectrum" for the same
reason. `starfield.js:96-97` biases temperature hot with flux, which reads like the exact
inversion of that advice — and it is, *in temperature space*. **But it is not what reaches
the screen.** Measured above: dim star pixels (0.065 < L ≤ 0.15) carry median chroma
**0.0980**; bright star pixels (L > 0.35) carry **0.1569**. Normalised by their own luma —
the only fair comparison, since chroma is luma-bounded — the dim stars sit at **C/L ≈ 1.09**
and the bright at **≈ 0.35**. *Our dim stars are already the more saturated population.* The
bright ones desaturate by **clipping** through ACES and the 1.05 bloom threshold, not by
authoring.

> **Ruling: KEEP the flux-biased temperature draw at `starfield.js:96-97`.** It is physically
> defensible, it is not costing us dim-star colour on screen, and changing it chases a
> failure we do not have. Read `starfield.js:97` before changing it: a low-flux star already
> draws `temp` uniformly over the full [0,1] ramp — the file is already "Full Spectrum" for
> dim stars, which is the guides' actual ask.
>
> **What to change instead: stop the bright end clipping to white.** Cap the amp ramp per
> (a) so the brightest star lands at display luma 0.75–0.90 rather than saturating all three
> channels. Target: dim-star median chroma **held at ≥ 0.09**, bright-star median chroma
> **raised from 0.157 to ≥ 0.22**.
>
> **Leave `STELLAR_RAMP` alone** (`common.js:271-278`). Building it from locked palette hexes
> rather than a blackbody curve, so the sky introduces no hue the ships cannot answer, is
> correct for R2′ — and real star colours are far less saturated than people expect.

**(f) The galactic band gets an unresolved luminous component.** `starfield.js:80`'s
`keep = 1 - bandDensity·clamp01((t-0.12)/0.88)` is a gentle linear rejection gradient and
7 200 point sprites cannot make a band read. The Milky Way's thin disc is ~270 pc scale
height against a ~2.6 kpc scale length — near 10:1 — which is why the naked-eye band is a
hard, narrow, structured stripe. Use an exponential in sin(galactic latitude) for the
rejection, and put the band's **diffuse** component in layer 1 (the dome), not in the point
sprites, under layer 1's ceiling of +0.008–0.015 and peak luma 0.09.

---

## 5. THE NEBULA — DELETE IT

### 5.1 The evidence, measured on this tree

From §1's control, isolating the nebula as the single variable between probes B and C:

| | field median luma | field median chroma | field > 0.06 |
|---|---|---|---|
| B — dome hidden, **nebula on** | 0.0280 | **0.0078** | 2.03% |
| C — dome hidden, **nebula off** | 0.0263 | **0.0078** | 1.06% |
| **the entire nebula is worth** | **0.0017** | **0.0000** | 0.97 pp |

**Nineteen layers — 14 emission behind, 5 dust in front at `graveyard` (`index.js:227`) —
are worth 0.0017 of median luma and, to four decimal places, exactly zero chroma.**
`field-baseline.md` §2 measured **−0.0003** on the previous tree with a different probe
method. Two instruments, two trees, same answer.

Three defects, all still present verbatim on `6ae7df9`:

* **`nebula.js:72`** — `n *= smoothstep(1.02, 0.18, rr)` reaches 1.0 only inside `rr ≤ 0.18`,
  **2.5% of the quad area**. Measured as the single largest attenuator: ×0.18 at the median
  by one researcher, 85–87% of the median by another, independently.
* **`nebula.js:74-75`** — an absolute threshold (0.38/0.46/0.50) then `pow(a, 2.26)` applied
  to a `planarFbm` field that is approximately **N(0.55, 0.09) with a maximum of 0.837**. A
  constant threshold against a Gaussian is a coin flip you cannot predict from the parameter.
* **`nebula.js:79`** — the two-tone core/edge gates on `hot = clamp01((a − 0.30)/0.70)`.
  Re-measured by me on this tree, read back from the live shipped `CanvasTexture`:

  ```
  $ node tools/fieldcheck.mjs engagement --alpha --report
    neb-a  256x256 = 65536 texels
      mean alpha 0.001246  (0.3176/255)   max alpha 0.1451 (37/255)
      zero-alpha 96.16%   mean over non-zero 0.032434
      alpha percentiles /255: p50 0  p90 0  p99 12  p99.9 28
  ```

  **`hot` requires α ≥ 0.30 and `neb-a`'s brightest texel of 65 536 is α = 0.1451.** On
  `neb-a` and `neb-c` (max α 0.0118) `hot` is **identically zero at every texel**; on `neb-b`
  (max α 0.3529, p99.9 = 0.18) it is non-zero for at most ~65 of 65 536. **The feature
  `nebula.js:77-84` exists to produce has never once rendered**, and these figures reproduce
  `field-baseline.md` §6 exactly, so it still hasn't after two waves of work on this system.
* **`nebula.js:87`** — `CanvasTexture` with independent RGB and A signals. Defect D35, second
  occurrence in this project. Confined to α ≤ 4/255 but real: authored (255,150,110) reads
  back as (255,184.8,70.6).

It costs up to **9 draw calls** (3 sheets × back/front/dust, `nebula.js:263-265`), 3 × 256²
`CanvasTexture` with mips ≈ 1.0 MB, and 9 materials.

### 5.2 The decision, and why delete beats repair

> **DELETE `src/world/celestials/nebula.js` and every `CELESTIAL_SPECS.*.nebula` block.
> Replace the one capability it uniquely has — front-of-body occlusion — with a new, small
> dust-lane system of 2–4 quads. Net far-scene draw calls 17 → 10.**

**Deleting a system that does nothing is the correct answer here, and these are the reasons,
not the excuse:**

1. **Everything it was built for is now done better by the dome.** `field-baseline.md` §2
   established that the dome is the entire field. `field.glsl.js` already implements the
   emission structure *and* the dust lanes as **one noise field read twice at a domain
   offset** — which is `backgrounds-procedural.md` §2.6.1 verbatim, and is precisely what
   `nebula.js:237` gets wrong by construction: it draws a fresh random position for each dust
   lane, "which is why the lanes never sit on the emission they are supposed to obscure."
   Repairing nebula.js means building a second, worse copy of a system that already exists.
2. **Repair is four independent fixes to reach parity with zero draw calls.** Each of :72,
   :74, :75 and :87 must land separately with a measurement between them — a full day by
   `space-backgrounds.md` item 2's own estimate — and the outcome is a layer that duplicates
   the dome at 9 draw calls.
3. **Its sizing is unknowable in advance.** The two research reports disagreed 5–20× on the
   starting alpha; the measured answer (mean α **0.001246**, max **0.1451**) landed at the
   three.js end, invalidating the 69× lift the plan was sized for. Any repair is a solve
   against a number that has moved twice.

**What is genuinely lost, and what to keep.** `common.js:18-27` calls front-layer occlusion
of the gas giant *"the strongest depth cue the backdrop has"* and it is right — a dome cannot
pass in front of a body. So keep **2–4 normal-blended dust quads at `ORDER.dust`**, coloured
absorption (`blendSrc: ZERO, blendDst: ONE_MINUS_SRC_COLOR`, so dust *reddens* what is behind
it rather than cutting holes in it), generated from **the same field function as the dome,
offset in the domain**, as a new ~60-line module. That is layer 4 of §3. It is a new small
file, not a rescue of a 277-line one.

`softPointTexture` and `glowTexture` (`common.js:195, 233`) write neutral white and are in
the `CanvasTexture`-safe category. **They are not affected by D35 and must not be "fixed".**

---

## 6. THE HUE RULING, AT THE RIGHT AMPLITUDE

The owner's ruling: **sick green in the luminous core, rust and amber in the dust lanes,
separated by VALUE and STRUCTURE so they cannot average to mud.**

### 6.1 The last pass got this right and must not be re-litigated

```
  BY VALUE TIER   (engagement, cut at the field's own p33 0.0907 / p67 0.1718 luma)
    dark      33.3% of field   mean luma 0.0671   median chroma 0.0707   hue 45.6 deg   [N=479487]
    mid       33.4% of field   mean luma 0.1281   median chroma 0.1373   hue 76.4 deg   [N=480921]
    bright    33.3% of field   mean luma 0.2205   median chroma 0.2550   hue 89.1 deg   [N=479592]
    dark-to-bright hue separation 43.5 deg  -> the tiers carry different hues
```

**Rust at 45.6° in the dark tier, green at 89.1° in the bright tier, 43.5° apart, and the
whole thing inside a 32° chroma-mass band.** That is the ruling, implemented, and it took the
hue separation from `field-baseline.md`'s measured 2.3° to 43.5°. **Keep the hues. Keep the
absorption model that produces them. Change nothing about the structure.**

### 6.2 The amplitude, which is the entire error

The amplitude target is the §2.2 band table, restated here with the hue each band must carry.
Note that `fieldcheck`'s tiers are cut at the field's **own** p33/p67 and therefore always
split 33/33/33 — they measure hue and relative value, never absolute value. **Read the
shipped luma column as "what the middle of each third measured", not as a band share.**

| band | **target luma** | shipped tier mean | **target median chroma** | shipped | **target hue** | shipped |
|---|---|---|---|---|---|---|
| **VOID** (< 0.045) | 0.012 – 0.040 | 0.0671 (dark tier) | **0.012 – 0.035** | 0.0707 | 30 – 50° rust | 45.6° ✓ |
| **FAINT** (0.045–0.10) | 0.045 – 0.100 | 0.1281 (mid tier) | **0.045 – 0.085** | 0.1373 | 55 – 75° | 76.4° ✓ |
| **STRUCTURE** (0.10–0.28) | 0.100 – 0.280 | 0.2205 (bright tier) | **0.100 – 0.220** | 0.2550 | 85 – 100° green | 89.1° ✓ |
| **HIGHLIGHT** (> 0.28) | > 0.28 | — | **≥ 0.20** | — | 85–100° or star temp | — |

**Every hue is already correct.** The failure is that the shipped field's *thirds* land on
0.067 / 0.128 / 0.221 when the *bands* they are supposed to occupy are centred on roughly
0.026 / 0.072 / 0.19 — so the darkest third of the sky is sitting inside the FAINT band and
the middle third is sitting inside STRUCTURE. **The dark tier at mean luma 0.0671 with chroma
0.0707 is not a dust lane, it is a mid-tone.** A dust lane in a real frame is *dark*, and its
rust is a tint on darkness, not a colour at half brightness.

**The amplitude instruction, in one line:** apply §3.1's **0.14× linear reduction** to the
whole dome — floor, band, lobe, absorption and all — as a **single uniform scale**, then
re-solve only the absorption coefficients if the tier hue separation drops below 30°. A
uniform linear scale preserves every hue and every channel ratio exactly; only the absolute
values move. **Do not re-tune the hues while changing the amplitude**, or the two changes
cannot be told apart afterwards — which is how this file's predecessor ended up with three
independently hand-solved gain pairs and an 11× spread between them.

### 6.3 Why value-and-structure separation is what stops the mud

Both hues are allowed inside R2′'s 60° band **only** because the band is chroma-mass
weighted: the rust lives in dark, low-chroma pixels and therefore votes weakly. If the rust
is lifted to comparable luma and chroma — which is what shipped — the band widens toward 60°
and the two hues begin to average. The shipped band is already **32°** at `engagement`
against 5° at `close`/`wide`. **Grade the blend on tier hue separation (≥ 30°), never on band
width**, exactly as `field-baseline.md` §5 warns: *"R2 as written cannot distinguish a
disciplined palette from a monochrome wash."*

---

## 7. FREQUENCY — why it reads as marble

### 7.1 Measured

I built an octave-band pyramid on the field's luma: successive separable box blurs, each band
being the RMS of the difference between consecutive blur levels. Feature size is quoted in
degrees using the shot's own 46° vertical FOV over 900 px.

**Full resolution, star band and DC** (`engagement`, field only):

| band | feature size | **A (dome+nebula)** RMS | share | **C (plain stars)** RMS | share |
|---|---|---|---|---|---|
| r=1 | 0.10° (≈2 px) | 0.00779 | **8.3%** | 0.00935 | **20.8%** |
| r=2 | 0.20° | 0.00331 | 3.5% | 0.00365 | 8.1% |
| r=4 | 0.41° | 0.00427 | 4.5% | 0.00403 | 9.0% |
| r=8 | 0.82° | 0.00605 | 6.4% | 0.00464 | 10.3% |
| r=16 | 1.64° | 0.00886 | 9.4% | 0.00528 | 11.8% |
| DC | whole frame | 0.06399 | **67.9%** | 0.01795 | **40.0%** |

**4× downsampled, mid and low bands** (same pose, same method):

| band | feature size | A share | C share |
|---|---|---|---|
| r=1,2 | ≤ 0.8° | **11.1%** | **24.9%** |
| r=4 | 1.64° | 7.1% | 10.5% |
| r=8 | 3.27° | 9.0% | 8.7% |
| r=16 | 6.54° | 10.5% | 12.3% |
| r=32 | 13.08° | 10.4% | 16.4% |
| r=64 | 26.17° | 11.0% | 14.8% |
| DC | whole frame | 40.9% | 12.5% |
| **absolute mid, r=4…64** | 1.6–26° | **0.05603** | **0.02695** |

### 7.2 The two numbers that name the failure

* **Mid-frequency contrast energy at 1.6°–26° is 2.08× the control's** (0.05603 vs 0.02695).
  That band is the marble. Nothing in a real sky lives there except a nebula's outer edge and
  a body's limb, and ours is full of domain-warp swirl.
* **The star band's share of total field contrast falls from 20.8% to 8.3%** when the dome is
  on — a **2.5× loss** — and its *absolute* energy falls too, 0.00935 → 0.00779 (**−17%**),
  because the dome raises the local floor around every star and tone mapping then compresses
  the difference.

> **"The stars are the subject and the nebula is the backdrop; ours is the exact inversion of
> that" — measured. The subject lost 2.5× of its share of the frame's structure to the
> backdrop.**

### 7.3 The target spectrum

Measured with the same pyramid on `engagement`, field only, as **share of total field
contrast RMS**:

| band | feature size | shipped | **TARGET** |
|---|---|---|---|
| r=1,2 — **stars** | ≤ 0.8° | 11.1% | **≥ 20%** |
| r=4,8,16 — **the marble zone** | 1.6° – 6.5° | **26.6%** | **≤ 15%** |
| r=32,64 + DC — **the broad gradient and the band** | ≥ 13° | 62.3% | **55 – 70%** |

A real skybox is dominated by very low frequency plus very high frequency with little in
between. Ours currently has a quarter of its energy in the middle.

### 7.4 How to get there — concrete

1. **Delete the emission nebula** (§5). Removes 19 quads of mid-scale additive noise.
2. **Band-limit the field function.** `field.glsl.js` exports `FIELD_TAPS = { warp: 2, shape:
   4, lane: 3 }`, giving `noiseEvals = 6·warp + shape + lane = 19` taps per pixel. Cut to
   **`{ warp: 1, shape: 2, lane: 2 }` = 10 taps.** Octaves 3 and 4 of the shape field *are*
   the r=4…r=16 bands.
3. **State the band limit as a hard rule, because octave counts drift:** **the field must
   contain no feature smaller than 8° of arc.** At 46°/900 px that is 156 px, i.e. it must
   survive a blur of radius ≥ 78 px essentially unchanged. Verify by rendering the field,
   blurring at r=78, and confirming the difference RMS is ≤ 15% of the field's total.
4. **Keep the 2-level domain warp.** It is what makes the lanes thread the emission rather
   than land beside it, and at `warp: 1` octave it is a low-frequency displacement, which is
   all a warp should ever be. **Three levels over-curls into an intestinal look; stop at two.**
   Do **not** substitute curl noise as the shape source — measured trap, coherence 0.161 at
   4 octaves versus 0.892 at 1, because velocities scale as O(1/L) and the finest octave
   dominates.
5. **Spend the removed energy on the star band** (§4.2a). The r=1 band should roughly double
   in absolute RMS, from 0.00779 to ≈0.015.

**The rule of thumb, so this is checkable without the tool:** *if you can see a shape in the
sky that is smaller than the gas giant and bigger than a star, it is wrong.*

### 7.5 What band-limiting does to the cost, and to the bake decision

F3 is already answered and the answer does not change: `field.glsl.js`'s header records
`NP_RASTER=hardware npm run bench -- --width 2560 --height 1440` at **+3.4 ms** for the live
field (11.8 → 15.2 ms mean, reproducing to 0.1 ms over two runs per side), against F3's 2 ms
line. **The bake is still mandatory.**

Band-limiting helps it twice. Taps fall 19 → 10, so a live fallback lands near 1.8 ms; and
because nothing in the field is smaller than 8°, **a 256²/face cube is lossless** — 90°/256 =
0.35° per texel, so an 8° feature spans 23 texels. Bake at **256/face, `HalfFloatType`,
`LinearSRGBColorSpace`**, and bank the 12.6 MB that 512/face would have cost. The three
landmines in `space-backgrounds.md` item 4 (`renderer.autoClear = false` pinned at
`renderer.js:39`; `renderer.info.autoReset = false` at `:40`; tag the cube
`LinearSRGBColorSpace` and never `SRGBColorSpace`) all still apply verbatim.

---

## 8. The acceptance test, as a procedure

**This is the gate. It outranks every number in this document.**

1. Render `engagement`, `wide`, `cinematic`, `close` in two configurations at the identical
   settled pose with the sim paused: **as built**, and **with
   `parts.dome.object.visible = false` and the dust quads hidden** (the plain-stars control).
2. Present the eight frames unlabelled, in randomised order, to a critic who has not read
   this document.
3. **The build fails if the critic prefers the control on two or more of the four poses.**

**Add a `--control` flag to `tools/fieldcheck.mjs`** that hides the dome and dust and writes
both PNGs, so this is reproducible rather than a scratchpad script. It is tooling, not `src/`.

### Numeric gates, all two-sided

| | requirement | measured today (`engagement`) |
|---|---|---|
| **R1′** field median luma | 0.028 – 0.045 | 0.1271 ✗ |
| **R1′** field % above 0.06 | 12 – 30% | 89.88% ✗ |
| **R1′** field % below 0.045 | 55 – 70% | **2.57%** ✗ |
| **R1′** field % in 0.10–0.28 | 5 – 12% | **59.18%** ✗ |
| **R1″** a discrete body ≥ 6°, median luma ≥ 0.10 on its footprint | pass | 0.0827 at `wide` ✗ |
| **R2′** median chroma over luma ≥ 0.045 | ≥ 0.10 | not yet instrumented |
| **R2′** median C/L over luma ≥ 0.045 | ≥ 0.75 | **1.174** ✓ |
| **R2′** median C/L in the void | ≥ 0.45 | **1.275** ✓ |
| **R2′** hue band (80% chroma mass) | ≤ 60° | 32° ✓ |
| **R7** hull median margin | ≥ 0.10 | 0.0233 ✗ |
| **R7** hull % darker than field | ≤ 10% | 43.5% ✗ |
| **R7** luminous body median margin | ≥ +0.06 | −0.0988 ✗ |
| **R7** that body % darker | ≤ 15% | 78.8% ✗ |
| tier hue separation dark→bright | ≥ 30° | 43.5° ✓ |
| star area above luma 0.06 | 0.40 – 1.50% | 0.0846% ✗ |
| mid-band (1.6–6.5°) share | ≤ 15% | 26.6% ✗ |
| star band (≤0.8°) share | ≥ 20% | 11.1% ✗ |

**Note what passes.** Chroma, hue, hue separation and band width are all already correct.
**This is not a colour problem and it must not be worked as one.** It is a luminance
amplitude problem and a frequency problem, and the hues survive both fixes untouched.

---

## 9. What would falsify this spec — measure before spending a wave

**F8 — the control may not survive the star fix.** §4.2's amplitude raise is applied to the
control as much as to the field. Re-render the control *after* the starfield change and
before judging the dome, or §8's comparison grades the wrong pair. **If the fixed starfield
alone beats the built backdrop, ship the starfield and cut the dome further.**

**F9 — R7 may be unreachable at `wide` by construction.** The gas giant's median footprint
luma is **0.0827**. R1″ asks for ≥ 0.10 on its own footprint and R7 asks for +0.06 over the
field. At a field median of 0.042 the second is satisfied by arithmetic, but the first needs
the giant itself brightened — which is `gasgiant.js`, not the sky. **If the giant cannot
reach 0.10 without blowing its terminator, R1″ drops to ≥ 0.08 and this spec is amended.**
Measure the giant before assuming the sky is the whole job.

**F10 — the 0.14× dome reduction may undershoot R2′'s void clause.** Scaling linear output by
0.14 scales chroma with it. The void's `C/L ≥ 0.45` is a *ratio* and should survive a uniform
scale, but ACES is not a uniform scale near the toe. **Measure the void tier's C/L
immediately after the amplitude change**; if it falls below 0.45, the recovery is to push the
void's hue further from grey, **not** to put the luminance back.

**F11 — deleting the nebula may cost occlusion depth that the 2–4 dust quads do not recover.**
`common.js:18-27` calls front-of-body occlusion "the strongest depth cue the backdrop has".
Land the delete and the dust replacement as **two separate commits** with a `--control` render
between them, so if the frame loses depth it is attributable.

**F12 — this document's frequency targets come from one pose.** All spectra are `engagement`.
`close` and `wide` at `giant-orbit` are a blue field with a 5° hue band and a very different
composition, and their mid-band share is unmeasured. **Run the pyramid on `wide` before
applying §7.3's targets to `giant-orbit`.**

---

## 10. Build order

| # | item | files | expected measured movement |
|---|---|---|---|
| 0 | `--control` flag + R7 margin + octave-band spectrum in `fieldcheck.mjs` | `tools/fieldcheck.mjs` | none, by design. Makes §8 and R7 reproducible. |
| 1 | **Starfield amplitude, then count, then `MAG_SLOPE`** | `starfield.js:32, 102, 146`; `index.js` counts | star area above 0.06: 0.0846% → 0.40–1.50%. Star band share 11.1% → ≥20%. **Do this before touching the dome** — per F8 it changes what the control is. |
| 2 | **Dome amplitude to 0.14× linear** | `index.js` dome `baseGain` at `:118, :319, :512` | field median 0.1271 → 0.028–0.045; VOID share 2.57% → 55–70%; STRUCTURE share 59.18% → 5–12%. R7 hull margin 0.0233 → ≥0.10. Solve, measure, re-solve. |
| 3 | **Band-limit the field** to `{warp:1, shape:2, lane:2}` | `field.glsl.js` `FIELD_TAPS` | mid-band share 26.6% → ≤15%. Live cost +3.4 ms → ≈1.8 ms. |
| 4 | **Delete the nebula** | remove `nebula.js`, `CELESTIAL_SPECS.*.nebula` | field median −0.0017, chroma 0.0000. Far draw calls 17 → 8. |
| 5 | **Dust-lane quads** (2–4, coloured absorption, same field function) | new small module at `ORDER.dust` | field median −0.003 to −0.010. Far draw calls 8 → 10. |
| 6 | **Bake to a 256/face cube** | `space-backgrounds.md` item 4, unchanged | cost change only. **Say so in the commit message** or someone will improve the look inside the bake and nobody will be able to tell the two apart. |

Items 1 and 2 are the ones that matter. If only those two land, §8's comparison should already
be winnable.

---

## Appendix A — what I did not change, and why

* **The chroma metric.** `C = max−min` on display-referred sRGB, pinned by
  `field-baseline.md` §0 because it is the metric under which `reference-frames.md` §2's
  arithmetic is exactly true. Changing it invalidates every number in both documents.
* **`STELLAR_RAMP`** (`common.js:271-278`) — palette-locked, correct for R2′.
* **The star sprite mipmap decision** (`common.js:218-227`) — correct and non-obvious.
* **The tier hue values** — 45.6° / 76.4° / 89.1° are the owner's ruling, implemented.
* **`ORBIT.pitchFloorMax`** (`camera/constants.js:27`) — the plan view is a gameplay
  guarantee and the backdrop is not allowed to buy from it.
* **Far-camera pitch compression (option B′)** — dissolved by R1′, see §3.2.
* **The blue clip in the graveyard dome hexes.** All three `saturate()` amounts clip blue to
  exactly zero (thresholds 1.224 / 1.298 / 1.409 against authored 1.50 / 1.50 / 1.55), and
  the live uniforms confirm it: `uCore(linear) 0.22697 / 0.46208 / 0`. It is a real defect and
  it is **not urgent** — zero blue is what makes the graveyard's chroma pass, and R2′ passes
  today with margin. **Do not un-clip it in the same wave as the amplitude change.**

## Appendix B — reproducing every number here

```
# §0, §2, §6.1 — the shipped field
node tools/fieldcheck.mjs engagement,close,wide,cinematic --report
node tools/fieldcheck.mjs engagement --report          # the BY VALUE TIER block

# §5.1 — the nebula sheets, read back from the live shipped CanvasTexture
node tools/fieldcheck.mjs engagement --alpha --report

# §3 baseline — which far-scene object carries the field
node tools/fieldcheck.mjs engagement --attrib --report
```

§1 (the control), §2.6 (R7 margins), §4.1 (starfield alone) and §7 (the octave-band pyramid)
were measured with scratchpad scripts that boot the game through `tools/harness.mjs`, pose it
from `tools/shots.json`, pause the sim, and toggle
`world.systems.celestials.parts.{dome,nebula,giant,star}.object.visible` and
`world.scene.visible`. **Build item 0 folds all four into `fieldcheck.mjs` so they stop being
scratchpad.** Until it lands, these four are the only numbers in this document that are not
reproducible from a committed tool — which is exactly the condition `field-baseline.md` §0.3
was written to end, and it should not be allowed to persist for more than one wave.

## Appendix C — gates

`git status` on the tree that produced this document:

```
$ git status --porcelain
 M docs/review/widediag-close-nocull.png
 M docs/review/widediag-close.png
?? docs/review/wave6/

$ git diff --stat src/
(no output — no src/ file was touched)
```

This document changes no code, so the gate set is green exactly as it is on `6ae7df9`. **It
is the implementer of items 1–6 who must run and paste it**, and regressing any of it is a
failure:

```
rm -rf dist && npm run smoke
node src/sim/selftest.mjs                  # 54/54
node tools/poicheck.mjs                    # 16/16
node tools/fieldcheck.mjs engagement,close,wide,cinematic
node tools/widediag.mjs close --assert
node src/sim/ai/escalationHarness.mjs      # 28/28
npm run uicheck
```

**Note for whoever wires the gates:** `fieldcheck.mjs` is a **target** gate and exits 1 when a
shot misses. Under R1′ it will exit 1 on every shot from the moment this spec is adopted until
item 2 lands, because the tree currently overshoots the new ceiling on all four. **That is
correct behaviour and it must not be "fixed" by widening the bounds.** Do not wire
`fieldcheck` into `npm run smoke` until §8's comparison has been won.
