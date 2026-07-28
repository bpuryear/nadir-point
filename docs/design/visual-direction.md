# Visual and graphics direction — the next art pass

**Status:** binding for the next graphics pass. Supersedes nothing; it sits on top of
`docs/design/reference-ui-language.md` (primary evidence) and inside the scope fence of
`docs/design/scope-decision.md`. Crew and officers are out; nothing in this document
depends on them.

**Method.** Every number below was measured, not eyeballed. Reference frames were
downloaded to a scratch directory, decoded, and reduced to luma percentiles, per-band
chroma and chroma-weighted hue histograms. Reference images are **not committed and must
never be** — the tables are the deliverable, the JPEGs are not. Our own frames were
measured the same way from `docs/review/look-surface/` and `docs/review/look-cruiser/`,
so the comparisons are like-for-like.

Where this document says "chroma" it means `max(R,G,B) − min(R,G,B)` on **display-encoded
sRGB** values, 0–1. Where it says "luma" it means `0.2126R + 0.7152G + 0.0722B` on the
same, which is what `tools/surface.mjs` reports.

---

## 0. What the measurement actually found

Two findings reframe everything else, and neither is what the brief assumed.

### 0.1 Our problem is not that we are too dark. It is that our dark is *empty*.

Threshold sweep, percentage of frame below each luma:

| frame | <0.02 | <0.04 | <0.06 | <0.10 | <0.15 | <0.20 |
|---|---|---|---|---|---|---|
| **ours** `look-surface/close.png` | **39.7** | 67.9 | 69.3 | 71.2 | 74.5 | 78.1 |
| **ours** `look-cruiser/close.png` | **40.5** | 68.2 | 69.6 | 73.6 | 79.9 | 83.0 |
| Frontier `The Frontier` | 0.4 | 6.4 | 26.0 | 49.7 | 79.5 | 90.9 |
| Frontier `Base in Flames` | 0.2 | 3.3 | 11.5 | 29.4 | 54.1 | 80.3 |
| Frontier key art | 1.6 | 7.4 | 25.6 | 51.3 | 62.4 | 66.5 |
| Frontier homepage hero | 25.1 | 44.5 | 60.7 | 76.2 | 84.9 | 89.4 |
| Homeworld 3 (Steam #1) | 0.1 | 0.4 | 0.8 | 5.0 | 21.1 | 32.8 |

Read the rows, not the totals. **Forty per cent of our frame is at literally dead zero**,
and between 0.04 and 0.15 there is almost nothing — five percentage points of frame across
that entire band. The reference frames put 0–2% at dead zero and then populate 50–80% of
the frame between 0.02 and 0.15. Their darkness is a **low, structured, occupied band**.
Ours is a **hole**.

That is the whole "diorama on black velvet" read, located mechanically. It is not an
exposure problem — our p95 (0.384) is close to `Base in Flames` (0.361). It is a *floor*
problem.

### 0.2 We do not have four temperatures. We have almost no temperature, weakly, in three directions.

Chroma-weighted hue mass concentrated in the single best 60° window, and mean chroma
per luma band:

| frame | hue mass in one 60° window | chroma in toe (<0.06) | 0.06–0.20 | 0.20–0.45 |
|---|---|---|---|---|
| EVE Frontier `The Frontier` | **100.0%** | 0.107 | 0.292 | 0.580 |
| EVE Frontier `Base in Flames` | **100.0%** | 0.102 | 0.272 | 0.438 |
| EVE Frontier `Hauler Caravan` | **100.0%** | 0.052 | 0.175 | 0.404 |
| EVE Frontier key art | 100.0% | — | — | — |
| Beta Decay (press kit, MCV) | 96.7% | 0.014 | 0.034 | 0.020 |
| Beta Decay (press kit, ruins) | 85.3% | 0.011 | 0.025 | 0.034 |
| Homeworld 3 (Steam #1) | 99.9% | 0.092 | 0.224 | 0.350 |
| Homeworld 3 (Steam #3) | 83.9% | — | — | — |
| **EVE Online** (2011 nebula plate) | **53.0%** | — | — | — |
| **EVE Online** (Steam #3) | **51.0%** | — | — | — |
| **ours** `look-surface/three-quarter` | 94.3% | 0.028 | 0.094 | 0.185 |
| **ours** `look-cruiser/close` | 85.2% | 0.025 | 0.034 | 0.035 |
| **ours** `look-surface/close` | **60.8%** | 0.026 | 0.036 | 0.039 |

Two things fall out.

1. **Chroma rises with luma in every reference and is flat in ours.** Frontier goes
   0.107 → 0.292 → 0.580 across the bands. We go 0.026 → 0.036 → 0.039. The references
   are not "desaturated"; they are *dark and deeply tinted*. Perceived desaturation is a
   consequence of low value, not of low chroma. We have achieved low value and *no* tint,
   which is grey.
2. **EVE Online is the loose end of the family, at 51–53%.** EVE Frontier is at 100%.
   Homeworld 3 is at 84–100%. Beta Decay is at 85–97%. Our worst frame, 60.8%, is closer
   to fifteen-year-old EVE Online than to any of the three games we are actually chasing.

CCP say this out loud in their own devblog: *"the dominant stellar phenomenon of each race
happens to be in the same color palette as the ships of that race"*, and lowsec/nullsec are
*"cooler"* and darker while *"Hisec will be warmer and more saturated"*
([Introducing New Nebulae into EVE](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve)).
One temperature per location is not a stylisation they invented for Frontier. It is the
house rule, and Frontier is the version of it with the volume at ten.

### 0.3 The ship and the backdrop are at the same value

Measured on crops:

| | subject mean luma | backdrop mean luma | Δ |
|---|---|---|---|
| Frontier `Base in Flames` | 0.233 (station band) | 0.065 (upper-left field) | **0.168** |
| Frontier `Hauler Caravan` | 0.216 (foreground hull) | 0.474 (lit structure behind) | **0.258** |
| **ours** `look-cruiser/three-quarter` | 0.168 (hull) | 0.157 (gas giant) | **0.011** |
| **ours** `look-surface/close` | 0.484 (hull) | 0.025 (void) | **0.459** |

The reference separates subject from field by 0.17–0.26 of luma, in either direction, every
time. We separate by **0.011** against the gas giant — the planet and the hull are the same
value, which is exactly why the planet eats the ship — and by **0.459** against the void,
which is a white cut-out on a black card with nothing in between to relate them.

---

## 1. Palette discipline — one temperature per frame

### 1.1 The rule

**Per frame, exactly one 60° hue window may hold ≥ 92% of the chroma-weighted mass.**
That window is the POI's, not the object's. There is exactly one licensed exception, below.

This is a measurable acceptance criterion, not a mood. It is the metric in §0.2 and it
should be added to `tools/surface.mjs` as `--hue` so it can be checked the way the key
intensity now is.

Targets by band, frame-wide:

| band | share of frame | mean chroma |
|---|---|---|
| toe, luma < 0.06 | 25–45% | **0.05–0.11** |
| low, 0.06–0.20 | **40–65%** | **0.14–0.29** |
| mid, 0.20–0.45 | 8–20% | 0.22–0.45 |
| high, > 0.45 | **0.5–3%** | unconstrained (these are light sources) |

Current: toe 69%/0.026, low 9%/0.036, mid 8%/0.039, high 13.6%. Every row is wrong, and
the high row is wrong by a factor of five.

### 1.2 The grade is a coherence tool, not a colour source — and only the toe is free

`src/render/postfx.js#GradeShader` does:

```glsl
float toe      = 1.0 - smoothstep(0.0, 0.42, lum);
float shoulder = smoothstep(0.24, 0.95, lum);
col += lift * (liftAmount * toe);
col  = mix(col, col * gain, gainAmount * shoulder);
```

`setColorGrade` normalises `lift` so its **peak channel is 1.0**, which means the lift hex's
absolute brightness is irrelevant — only its channel ratios matter. Do not waste time
brightening a lift hex.

**The toe is free.** At `lum = 0` the pixel is zero, so the lift *is* the colour there:
`floor luma = liftAmount × lumaCoef(lift)` and `toe chroma = liftAmount × chromaCoef(lift)`.
The model predicts our measurement to two decimals — `0x35558c` at `liftAmount 0.045` gives
floor luma 0.0264 and chroma 0.0280; measured 0.020 and 0.026, the shortfall being the
vignette (see §1.5).

**The shoulder is not free.** `mix(col, col*gain, …)` is a multiply toward a colour, so the
most chroma it can add is `(1 − minChannel(gain)) × gainAmount × luma`:

| gain, as shipped | min channel | max chroma injected |
|---|---|---|
| `giant-orbit` `0xffe8c8` @ 0.30 | 0.784 | 0.065 × luma → **0.019** at luma 0.30 |
| `station` `0xf0f6ff` @ 0.20 | 0.941 | 0.012 × luma → **0.004** |
| `graveyard` `0xdfeee0` @ 0.16 | 0.875 | 0.020 × luma → **0.006** |

Those gains are near-white creams and they are doing **nothing**. That is the measured
reason the mid band sits at 0.039. Even a fully committed gain caps out around 0.15 of
chroma at luma 0.30. **The mid-band chroma of 0.22–0.45 must be authored into the nebula,
the fog and the fill/rim light colours.** The grade cannot manufacture it. Say this once,
loudly, so nobody spends a pass tuning a constant that mathematically cannot reach.

### 1.3 Concrete per-POI grade

All lift hexes are produced through `saturate()`/`shade()` in `src/art/palette.js`, so
provenance is recorded and `paletteAudit()` stays clean. Owning file:
`src/art/palette.js#POI_PALETTES[*].grade`.

| POI | lift (was) | lift (target) | liftAmount was → target | floor luma | toe chroma |
|---|---|---|---|---|---|
| `giant-orbit` | `0x35558c` | `saturate(0x35558c, 1.7)` ≈ `#2157b4` | 0.045 → **0.085** | 0.0388 | **0.069** |
| `belt` | `0x6b5a44` | `saturate(0x7a4226, 1.6)` ≈ `#963c0f` | 0.040 → **0.075** | 0.0379 | **0.068** |
| `graveyard` | `0x4c6a4a` | `saturate(0x4c6a4a, 2.0)` ≈ `#377333` | 0.075 → **0.055** | 0.0467 | 0.031 |
| `yard` | `0x3c5170` | `saturate(shade(0xffa93c, 0.42), 1.5)` ≈ `#7b4500` | 0.042 → **0.062** | 0.0381 | **0.062** |
| `near-star` | `0x7a4226` | `saturate(0x7a4226, 1.6)` ≈ `#963c0f` | 0.036 → **0.070** | 0.0354 | 0.063 |
| `station` | `0x27374e` | `saturate(0x27374e, 1.9)` ≈ `#1a3964` | 0.042 → **0.072** | 0.0385 | 0.053 |

Two notes.

- **`belt`'s current lift `0x6b5a44` has a chromaCoef of 0.364 — it is nearly grey.** At
  `liftAmount 0.040` it delivers toe chroma **0.0146**, the weakest in the game, in the POI
  whose entire identity is warm dust. That is the single worst grade value in the file.
- **`yard` currently has a cold lift (`0x3c5170`) and a warm rim (`0xffa93c`).** That is two
  temperatures inside one POI, in a location lit by work lamps. Fix the lift, not the rim.
- **`graveyard`'s toe chroma cannot reach 0.05** because green sits high on the luma curve
  (lumaCoef 0.849) — pushing `liftAmount` to reach it would put the floor at 0.06 and
  wash the frame. Graveyard buys its chroma back in the 0.06–0.20 band from the nebula,
  which is that POI's declared fill anyway. Accept 0.031 there.

Gains, same file:

| POI | gain was | gain target | gainAmount was → target | chroma injected at luma 0.30 |
|---|---|---|---|---|
| `giant-orbit` | `0xffe8c8` @0.30 | `0x8fb4ff` (its own `accent`) | 0.30 → **0.50** | 0.019 → **0.066** |
| `belt` | `0xffe8c8` @0.26 | `0xd89a4a` (its own `accent`) | 0.26 → **0.55** | 0.013 → **0.117** |
| `graveyard` | `0xdfeee0` @0.16 | `0x8fb04a` (its own `accent`) | 0.16 → **0.42** | 0.006 → **0.107** |
| `yard` | `0xffe8c8` @0.26 | `0xffa93c` (its own `accent`) | 0.26 → **0.50** | 0.013 → **0.116** |
| `near-star` | `0xffe8c8` @0.24 | `0xff7a2a` (its own `accent`) | 0.24 → **0.60** | 0.012 → **0.150** |
| `station` | `0xf0f6ff` @0.20 | `0x59c8ff` (its own `accent`) | 0.20 → **0.45** | 0.004 → **0.076** |

The rule underneath: **`gain` is the POI's `accent`, `lift` is a saturated relative of the
POI's `shadow`/`fill`, and they are on the same side of the wheel.** A cream gain against a
blue lift is two temperatures written into the grade itself.

**This contradicts a comment in `palette.js` that must be updated, not ignored.** That
comment records a measurement — the hull crop reads chroma **0.006**, neutral to a quarter
of a percent — and argues from it that `gainAmount 0.30` is correct. The measurement is
right and the conclusion no longer is, because the goal has changed: a hull at chroma 0.006
in a frame whose mid band should be at 0.22–0.45 is not "neutral gunmetal", it is the only
grey object in a coloured world. See §4.3 for how the hull stays *relatively* the calm
object without being colourless.

Saturation: leave `saturation` at 1.02–1.06. Global saturation is the wrong tool — it lifts
the wrong hues as hard as the right ones and would make the third-hue problem worse.

### 1.4 The single licensed exception: faction hue

**One frame may carry exactly one chromatic exception to the POI window, and it is faction
emissive.** Not faction albedo — the trim paint and the plating tones must be graded onto
the POI hue like everything else. Only the *emissive* survives, because emissive is a light
source and light sources are the one thing the eye accepts as off-family.

Budget, and it is tight:

- **Total exception-hue pixels ≤ 2.0% of frame area.** In `Base in Flames` the only cool
  pixels in the entire frame are five hairline tractor beams. In `Hauler Caravan` it is one
  lit bay and a handful of crates.
- Exception pixels must sit **above luma 0.45**. A dim off-hue patch is a mistake; a bright
  one is a light.
- The exception is `coalition.emissive 0xff9126`, `concord.emissive 0x7fe4ff`,
  `derelict.emissive 0x9fbe33` or `player.emissive 0xd9e6ee` — never a fifth thing.
- In a POI whose accent is already the faction hue (Coalition amber in `yard`, `belt`,
  `near-star`), **there is no exception at all**. That frame is genuinely monochrome. Good.

Owning files: `src/art/palette.js` (the emissive hexes), `src/art/materials/**` (which
materials get one), `src/vfx/damage.js` (which ones go dark and stay dark — a killed
subsystem removes an exception-hue source, which is a real, free reduction in hue count).

### 1.5 The vignette is eating the floor — a shader-order bug in effect

In `GradeShader`, the order is lift → gain → **vignette** → grain → dither. `col *= vig`
scales the lifted floor down by up to `vignette` (0.38–0.52 depending on POI). At the corner
of a `giant-orbit` frame at `vignette 0.44`, a lifted floor of 0.026 arrives at **0.015** —
which is why the measured toe mean (0.020) undershoots the model (0.0264).

The vignette is dimming exactly the part of the frame the floor most needs to populate.
**Move the lift application below the vignette**, or make the vignette a multiply toward
the lift colour rather than toward zero:

```glsl
col = mix(lift * liftAmount, col, vig);   // instead of col *= vig
```

That keeps the darkening the vignette is for and stops it re-opening the hole in §0.1.
Owning file: `src/render/postfx.js`.

---

## 2. Value structure

### 2.1 Targets

| metric | now (`look-surface/close`) | target | reference band |
|---|---|---|---|
| mean luma | 0.134 | **0.11–0.17** | Frontier gameplay 0.11–0.24 |
| std dev (contrast) | 0.209 | **0.09–0.16** | Frontier 0.076–0.164 |
| **fraction below 0.02** | **39.7%** | **≤ 5%** | Frontier 0.2–1.6% (non-hero frames) |
| fraction below 0.06 | 69.3% | **25–45%** | Frontier 11.5–26.0% |
| fraction 0.06–0.20 | 8.7% | **40–65%** | Frontier 42–69% |
| fraction above 0.45 | **13.6%** | **1–4%** | Frontier 0.0–2.9% |
| fraction above 0.65 | 0.42% | **0.3–2.0%** | Frontier 0.04–2.1% |
| p95 | 0.384 | 0.26–0.42 | Frontier 0.20–0.60 |
| p99 | 0.512 | **≤ 0.72** | Frontier 0.36–0.69 |
| clipped (>0.98) | 0.00% | **≤ 0.25%** | Frontier 0.00–0.06% |

**So: is `meanLuma ~0.15, contrast ~0.23, 0% clipped, ~40% near-black` right?** Mean luma
yes. Zero clipping yes, and hold it — Homeworld Remastered clips **12.8%** of its frame and
that is the thing we are *not* copying. Contrast at 0.23 is **too high** and forty per cent
near-black is **wrong in the specific sense of §0.1**: not too much darkness, but too much
of it at absolute zero with nothing in the band above it. Both numbers move the same way if
the floor is lifted: raising the floor to 0.038 and populating 0.06–0.20 pulls std dev from
0.21 toward 0.13 automatically, because the bimodal distribution becomes unimodal.

### 2.2 Where the eye goes

One place, and it is not the hull. In every reference frame the brightest 1–3% of pixels is
a **light source or a lit gas volume**, and the subject is read off it. `Base in Flames`:
the eye lands on the fire, then reads the station as the black shape that occludes it.
`Exclave Frigate`: 81.7% of the frame is under 0.06, the whole ship is under p95 0.133, and
the eye lands on the single glancing rim.

Rules:

1. **The brightest thing in frame is never the hull.** Currently our close frame's hull
   crop has a median of **0.603** and p95 of **0.694** — it is not just the brightest thing,
   it is most of the frame's light.
2. **A frame gets one bright anchor.** Star, engine bell, breach fire, nebula core. Not two.
3. **The subject is found by silhouette against a value, not by being lit.** That is what
   drives the geometry work already logged as PASS in `docs/review/acceptance.md`.

### 2.3 Subject/backdrop separation, as a hard rule

**|mean luma(hull) − mean luma(backdrop within 300 px of the hull silhouette)| must be
0.10–0.26.** Below 0.10 the backdrop eats the ship (our gas giant, at 0.011). Above 0.26 the
ship is a cut-out on a card (our void shot, at 0.459). This should be a `tools/surface.mjs`
mode: mask the hull, dilate the mask by 300 px, subtract, compare means.

Direction is free — the ship may be lighter than its field (`Base in Flames`) or darker
(`Hauler Caravan`). Magnitude is not.

---

## 3. Nebula and backdrop

### 3.1 What the references do

- **`The Frontier`**: the backdrop *is* the frame. 100% of chroma in one window, mean luma
  0.114, 79.5% of frame under 0.15, and 64.9% of the frame in the 0.06–0.20 band at chroma
  0.292. It is a huge, dim, deeply-tinted volume with hard dark dust lanes cut through it,
  and the only things above 0.45 are 0.7% of the frame.
- **`Asteroid Debris Field`**: the opposite extreme, and instructive. Mean chroma **0.011** —
  achromatic — mean luma 0.102, 79.6% of frame in the 0.06–0.20 band. The nebula shell is
  visible only as a faint concentric value structure. The single lit rock at the centre is
  the *only* thing above 0.20, at 1.3% of frame. Total commitment to negative space.
- **EVE Online (2011)** is the counter-example. Its nebulae are brighter (mean 0.18–0.245),
  only 3.7–13.6% of frame under 0.06, and hue mass split 53%/47% across two or three
  windows. On the multi-hue plate the ship is genuinely hard to find. That is what a
  backdrop competing with a ship looks like, from the same studio, fourteen years earlier.

Our `src/world/celestials/nebula.js` already states the right principles in its header —
layers at different radii, dark dust in front of glow, emission confined to about one radian
of sky. The principles are correct and the *values* are not being hit: the nebula is
contributing essentially nothing to the 0.06–0.20 band.

### 3.2 Per-POI backdrop budget

Owning files: `src/world/celestials/nebula.js`, `starfield.js`, `gasgiant.js`, `star.js`;
`src/world/fields/asteroids.js`, `debris.js`.

| POI | one temperature | backdrop mean luma | backdrop chroma (0.06–0.20 band) | emission sky coverage | ship reads |
|---|---|---|---|---|---|
| `giant-orbit` | cold blue-white | 0.05–0.09 | 0.10–0.18 | giant ≤ 30% of frame area | **lighter** than field, Δ ≥ 0.12 |
| `belt` | warm ochre | 0.08–0.14 | 0.16–0.26 | dust band ~35% of sky | lighter, Δ ≥ 0.10 |
| `graveyard` | sick green-grey | 0.05–0.10 | 0.08–0.14 | nebula ~45% of sky (it *is* the fill) | lighter, Δ ≥ 0.12 |
| `yard` | warm amber | 0.06–0.11 | 0.12–0.20 | structure, not gas | either, Δ ≥ 0.10 |
| `near-star` | hot orange | 0.14–0.22 | 0.22–0.34 | star glare ~40% of frame | **darker** — silhouette, Δ ≥ 0.12 |
| `station` | cold blue | 0.05–0.09 | 0.10–0.16 | thin, ≤ 25% of sky | lighter, Δ ≥ 0.10 |

`near-star` is the one POI where the ship goes to silhouette. That is the `Base in Flames` /
Frontier key-art read and it is the most dramatic frame the game can produce. Build it
deliberately.

### 3.3 How to keep the backdrop from competing

Five mechanisms, in order of how much they buy:

1. **Negative space, enforced.** Emission must be confined to the sky coverage in the table
   and the rest of the sky must be at the floor. `nebula.js` already does this by design;
   the check is that the coverage numbers are actually met.
2. **Dark dust lanes in front of glow.** Already built. Push them: in `The Frontier` the
   dust lanes are 15–25 points of luma below the glow they cross, and they are what makes
   the field read as a volume rather than a gradient.
3. **The backdrop never occupies the subject's value band.** §2.3. If a gas giant's lit limb
   is going to land within 0.06 of the hull's median, the limb must be graded down or the
   framing must put the hull on the terminator side.
4. **Fog is the depth cue and ours is switched off in practice.** `THREE.FogExp2` gives
   `f = 1 − exp(−(d·ρ)²)`. At `giant-orbit`'s `ρ = 1.2e-5`, a contact at 3 km is fogged by
   **0.13%** — nothing. A 12 km contact gets 2.1%. Atmospheric perspective inside an
   engagement is effectively zero, and atmospheric perspective is listed in
   `docs/review/acceptance.md` as one of our three scale cues. Targets:

   | POI | ρ now | ρ target | f(3 km) | f(12 km) |
   |---|---|---|---|---|
   | `giant-orbit` | 1.2e-5 | **4.2e-5** | 1.6% | 22% |
   | `station` | 1.8e-5 | **4.2e-5** | 1.6% | 22% |
   | `yard` | 2.2e-5 | **6.0e-5** | 3.2% | 41% |
   | `graveyard` | 3.0e-5 | **7.0e-5** | 4.3% | 51% |
   | `belt` | 4.2e-5 | **1.1e-4** | 10.3% | 83% |
   | `near-star` | 5.5e-5 | **1.3e-4** | 14.1% | 91% |

   And the fog **colour** must be the POI's lift hue at the floor value, not a separate
   navy. `giant-orbit`'s `fog.color 0x16223c` is close; `belt`'s `0x2a2018` is nearly grey
   and needs the same saturation treatment as its lift.

5. **The starfield is currently a source of third hues and must be clamped.**
   `src/world/celestials/starfield.js` derives star colour from temperature through
   `common.js#STELLAR_RAMP`, biased by flux — which by construction puts blue-white and
   orange stars in the same sky. That is physically correct and it is the enemy of §1.1.
   Clamp the ramp to **the POI hue ±20° plus neutral bone**, and modulate star gain by the
   local nebula opacity so a star inside a lit lane is invisible. In `The Frontier` the
   stars are visible only in the thin unlit wedge at frame right.

---

## 4. Ship rendering

### 4.1 What the references do to a hull

- **`Exclave Frigate`** — mean luma **0.041**, p95 **0.133**, chroma **0.002**. The entire
  ship lives in the bottom eighth of the range and is described by one narrow rim from a
  light at frame top-right, plus a dozen 2 px cool emissive points that are the only
  saturated pixels in the frame. There is **no fill light at all**.
- **`Chumaq` / `Mining Frigate`** — the hull is rendered *entirely in the ambient hue*.
  Every plane of the ship is a value of the same orange; there is no neutral anywhere,
  including in the deepest shadow. Hue mass 97–98% in one bin.
- **`Synod Battleship`** on a neutral card — two clearly different materials (oxidised
  red-brown plate against pale structural members) at a whole-frame mean chroma of **0.030**.
  The material read is carried by **value and roughness**, not by hue.
- **`Base in Flames`** — the station is a near-black silhouette. Its form is described
  entirely by what it occludes.

### 4.2 Our hull, measured

`look-surface/close.png`, bridge/deck crop: mean **0.484**, median **0.603**, p95 **0.694**,
chroma **0.038**. Against a void at 0.025. This is white styrene on black card, and it is
the "plastic model kit" read the palette file's own comments are trying to avoid.

### 4.3 What to change, without breaking the calibration that was fought for

`docs/review/acceptance.md` marks the lighting key **PASS** on a measured target of
sRGB 0.72–0.80 for a *fully lit face* (`giant-orbit` key 14.0, measured 0.669/0.749 on the
bridge tower). **Do not touch that.** It is right and it was expensive.

The defect is not the intensity of the lit face. It is **how much of the visible hull is a
lit face**. Add two criteria that constrain area rather than intensity:

- **No more than 15% of the hull's visible area may exceed sRGB 0.55.**
- **The hull's visible median must sit at 0.18–0.32.** Currently 0.603.

Both are satisfied by **key azimuth**, not key intensity. `giant-orbit`'s `sunDir` is
(0.776, 0.347, −0.526) at 20° of elevation, and the standard tactical camera sits close
enough to that azimuth that most visible area returns a high NdotL. Rotate the key so the
default camera azimuth sees the **terminator**: key 100–140° off the camera's resting
bearing, three-quarter back. Every reference frame is lit that way. Owning file:
`src/world/lighting/poi.js` and the `sunDir` entries feeding it.

Hue: the hull's albedo stays neutral in `palette.js` — that is correct and it is what makes
mismatched salvage read as one object. What must change is that the *rendered* hull picks up
the POI. With §1.3's grade in place, a hull face at luma 0.28 receives roughly 0.07–0.15 of
chroma from the shoulder and more from the fill, landing it at **0.10–0.18** — visibly of
the location, still the calmest object in frame against a field at 0.22–0.45. That is the
`Synod Battleship` relationship: the ship is where the chroma *drops*, not where it
disappears.

### 4.4 Rim and kicker

`giant-orbit` rim is `0x8fb4ff` at intensity 0.82 against a key of 14.0 — a 17:1 ratio —
with `broad: 0.30`. Two changes:

- **Narrow it.** `broad` averages the rim toward neutral because the emitter is an area.
  For a *kicker* that is backwards: a kicker's job is a hard edge. Take `broad` to
  **0.10–0.15**. The wide version is a second fill wearing a rim's name, and it is part of
  why the shadow side has no separation.
- **Calibrate it against the floor, not against the key.** With the floor at 0.038, a
  rim-lit edge should land at **0.14–0.22** — three to six times the floor, which is what
  makes the `Exclave Frigate` read. Solve the intensity for that the way the key was solved,
  and record the solve in `palette.js` the way the key's is.

`graveyard` already has the strongest rim in the game (1.05) on the stated grounds that
"everything is silhouette". That instinct is right and should spread: **rim is the primary
form-describing light in this game, and fill is a necessary evil.**

### 4.5 Emissives, sparingly

- **Total emissive + bloom-triggering pixels ≤ 1.2% of frame area** at standard framing.
  This is the same budget as the exception-hue budget in §1.4 and they overlap almost
  completely.
- **Running lights read as points, not strips.** The 40 m game-wide spacing already fixed in
  `acceptance.md` is a ruler; it only works if each light is a discrete 2–3 px point. A
  continuous strip is a bright line and it destroys the count.
- **Keep the bloom threshold at 1.05 and the strength at ~0.4–0.46.** Reference clipping is
  0.00–0.06%; haze at the threshold would re-open the floor problem from the other end.
- `src/vfx/damage.js`'s DEAD EMISSIVES mechanism is the best emissive tool in the codebase
  and is currently under-used as an *art* device: every killed subsystem is a permanent
  reduction in the frame's light count and exception-hue count. A wreck going fully dark is
  a wreck that becomes pure silhouette, which is the `Base in Flames` read for free. Push
  the damage progression harder so that by mid-fight a destroyer is contributing three
  emissive points instead of thirty.

---

## 5. UI treatment

A direct translation of `docs/design/reference-ui-language.md` into values, against the
primitives already in `src/ui/theme.js`. Owning files: `src/ui/theme.js` (colours, type,
`Painter`), `src/ui/hud.js`, `tactical.js`, `inventory.js`, `power.js`, `refit.js`.

### 5.1 The colour reduction

`theme.js` states "the interface is MONOCHROME" and then licenses four chromatic colours
(hostile red, salvage cyan, friendly green, warn orange). Measured on `docs/probes/ui.png`,
the chroma mass splits **R 35% / Y 20% / C 16%** — a three-way split, exactly the defect.

Cut to **bone + one accent + red**:

| role | colour | notes |
|---|---|---|
| text, all of it | `C.ink` = `mix(NEUTRAL.select, NEUTRAL.ice, 0.74)` @ 0.96 | bone, never pure white. Unchanged. |
| structure, rules, inert | `C.rule` = `shade(NEUTRAL.ice, 0.55)` @ 0.42 | the "second, cooler grey for inert structures" in the transcription |
| **the accent** | the **active POI's `accent`** | selected, owned, targeted, warning. One hue on screen. |
| hostile | `NEUTRAL.hostile 0xff4433` | 1 px strokes and filled lock chips **only**. Never body text, never a bar fill. |
| **retired** | `NEUTRAL.salvage 0x39d7d0`, `NEUTRAL.friendly 0x54e08a` | salvage → bone chip with `Painter.hatch`; friendly → bone open chip. Glyph carries the meaning, not hue. |

Faction hue stays exactly where `theme.js` already puts it — on a part's identity stripe and
a contact's classification, nowhere else. That is already right; it is the only chromatic
thing in the UI that survives untouched.

The `REACTOR GOVERNOR SEALED` line in red across the centre of `look-surface/close.png` is
the abuse this rule exists to stop: it is body text, it is 13 px, it is red, and it is in
the middle of the frame.

### 5.2 Panels are windows

| property | value |
|---|---|
| backing | `rgba(NEUTRAL.spaceBlack, **0.94**)` flat. **0.97** when the panel overlaps anything with luma > 0.25. |
| backing when floating over pure void | 0.90 minimum |
| **no** | hatch behind text, gradient scrim behind text, rounded corners, drop shadow |
| border | **1 device pixel**, `Painter.frame(..., weight 1)`. `C.rule` (0.42) resting; `C.ruleBright` (0.80) focused. |
| title bar height | **16 px** |
| title text | `F.micro` (9px), uppercase, `TRACK.head` (0.24em), `C.inkDim` |
| rule under title | 1 device px, `C.ruleDim` |
| overflow `⋮` / close `×` | right-aligned, 12 × 16 px hit boxes, 4 px apart, `C.inkFaint` resting → `C.ink` hover |
| padding | 8 px left/right, 6 px below the title rule, 6 px bottom |
| row height | **13 px** for `F.body` (11px); **11 px** for `F.small` (10px) |
| column header | `F.micro`, `C.inkFaint`, `TRACK.label` (0.16em), 1 px `C.ruleDim` beneath |
| numeric columns | right-aligned, `TRACK.value` (0.02em), `C.ink` |

`theme.js#Painter.scrim()` currently defaults to `alpha 0.78` with an optional edge fade,
and its header calls the fade "the only gradient in the interface and it is structural".
**Retire the fade for any panel carrying text or a numeral.** The transcription is explicit
that the reference is legible because the panel is near-opaque, not because the type is
large. Keep the fade only for edge-of-frame status strips that carry no digits.

The panels in our shipped frame are welded, fixed, semi-transparent and hatched, and they
sit on top of the ship at the standard framing. Moving to **floating, independently
closable panels** is the fix the transcription ranks fourth and it solves the occlusion
complaint outright.

### 5.3 Type scale

Keep `micro 9 / small 10 / body 11 / mid 13`. **Density is the aesthetic** — the
transcription is explicit that nothing is enlarged for readability.

- `F.large` (17px) is permitted for **exactly one** thing: the transient state line under
  the crosshair (`APPROACHING / CARBONACEOUS ORE`).
- `F.huge` (26px) is **banned from the HUD**. Modal screens only.
- Tracking: `TRACK.head` for panel titles, `TRACK.label` for section and column labels,
  `TRACK.value` for numerals. Never track body prose.

### 5.4 World-space target brackets

The most transferable in-world element, and the one the reference does best. It also appears
in Frontier's star map — solid filled bone chips with dark micro-type over a black-and-red
starfield — so it is house language, not a Beta Decay quirk.

Anchor: `objectScreenY − screenRadius − 10 px`, clamped to a 12 px frame margin, allocated
through `Painter.claim()` so two brackets never collide.

```
        ┌──────────────────────────┐   label chip  — SOLID accent fill, dark text
        │ CARBONACEOUS ORE [ROCK]  │     h 14 px, pad-x 5 px
        └──────────────────────────┘     F.micro 9px UPPER, TRACK.label
              ┌──────────┐               text: rgba(NEUTRAL.spaceBlack, 1)
              │  13 KM   │           distance chip — 1 px gap below
              └──────────┘             h 12 px, fill rgba(spaceBlack, 0.94),
                                       1 px accent border, text in accent
              ┌╴      ╶┐
              ╷   ◆    ╵          reticle — 4 px gap below
              └╴      ╶┘            18 × 18 px, corner ticks 5 px, weight 1, accent
                   ╲                 centre glyph 3 px: ◆ ship · □ rock · ✕ hulk
                    ╲              leader — 1 px, accent @ 0.55,
                     ●               drawn only when displaced > 24 px
```

- **Distance is always present.** It is the cheapest scale cue in the game and it costs
  eleven characters.
- **Secondaries get an 8 × 8 px hatched square** (`Painter.hatch`, spacing 3, weight 1) at
  `C.inkFaint`. No label, no distance, until targeted.
- **This replaces the wireframe box.** It scales to any object size, which a box does not,
  and it stays legible over a bright limb because the chip is opaque.

### 5.5 Status readouts

Group by concern and pin to corners, per the transcription:

- **bottom-left, survival**: layered `SHIELD / ARMOUR / HULL`, each a segmented
  `Painter.bar` at 6 px tall with a **rate figure beside it** (`+0.0 HP/S`). The rate is
  what carries the decision weight; the bar is context. Velocity beneath, `236 / MAX 290 M/S`.
- **bottom-right, thermal and capacity**: `STATUS NOMINAL` / `STATUS OVERHEATED` as a
  single tracked word in `F.small`, plus one large vertical bar in the accent, plus the
  grid-of-squares capacity readout (4 px squares, 3 px gap, `Painter.pips` extended to a
  grid). Volume, not slots.
- **bottom-centre**: numbered hotbar, `1 2 3 4 5 6 7 8 9 0 - =`, 28 × 28 px cells,
  1 px `C.rule` border, charge count in `F.micro` bottom-right of the cell.
- **top-left**: POI identifier and sub-identifier, `ROUTE` block.

None of these overlap the centre 50% of the frame. That is the occlusion fix.

---

## 6. Scale and isolation

What the references do, and what we take:

1. **The subject is small.** In Frontier's homepage hero the ship occupies well under 2% of
   the frame; 60.7% of the frame is under 0.06 and **nothing** exceeds 0.65. Our close frame
   puts **13.6% of the frame above 0.45** — mostly hull. **Target: subject occupies 12–25%
   of frame area at the standard tactical framing, never above 45% at max zoom.** Owning
   file: `src/camera/**`.
2. **One object, one light, and a great deal of nothing between them.** `Asteroid Debris
   Field` is a single lit rock at 1.3% of frame in an achromatic field. Isolation is
   produced by *emptiness with structure in it*, which is precisely the 0.06–0.20 band from
   §0.1.
3. **Atmospheric perspective at engagement range.** §3.3 item 4. A contact at 3 km must be
   measurably hazier than one at 300 m or the frame has no depth.
4. **Distance on every bracket.** §5.4.
5. **The 40 m running-light ruler**, already fixed in `acceptance.md`, works only if the
   lights read as discrete points — §4.5.
6. **Vertical volume.** `ARCHITECTURE.md` already mandates that strike craft, debris and
   celestials are not plane-locked. In every reference wide shot the depth cue is objects at
   several distinct distances along the view ray, not objects spread across the frame.
7. **Silence in the frame.** No decorative UI, no ambient chatter overlays, no idle
   animation in the chrome. The reference frames are still.

---

## 7. Prioritised change list

Ranked by measured effect per unit of work. Each item names the owning file.

| # | change | target | owner |
|---|---|---|---|
| **1** | **Lift the floor off zero.** Per-POI `lift`/`liftAmount` per §1.3. | frame below 0.02: **39.7% → ≤ 5%**; floor luma 0.035–0.047 | `src/art/palette.js` |
| **2** | **Move the lift below the vignette** (or `mix(lift*liftAmount, col, vig)`). Without this, #1 is undone at the frame edge. | corner floor holds at ≥ 0.9× centre floor | `src/render/postfx.js` |
| **3** | **Make `gain` the POI's own `accent` and raise `gainAmount`** per §1.3. Current cream gains inject ≤ 0.019 chroma and are inert. | mid-band chroma **0.039 → 0.22–0.45** | `src/art/palette.js` |
| **4** | **Near-opaque panel backings**: 0.94/0.97, no hatch, no gradient behind text. Nearly free, fixes legibility outright. | text contrast ≥ 7:1 over any backdrop | `src/ui/theme.js`, `src/ui/hud.js` |
| **5** | **Rotate the key azimuth 100–140° off the resting camera bearing.** Do **not** change key intensity — that is calibrated and PASS. | hull visible median **0.603 → 0.18–0.32**; ≤ 15% of hull above 0.55 | `src/world/lighting/poi.js`, `pois.js` |
| **6** | **World-space target brackets** — chip / distance chip / reticle / leader, per §5.4. | replaces wireframe box everywhere | `src/ui/hud.js`, `src/ui/theme.js#Painter` |
| **7** | **Raise fog density 2.5–4×** and put the fog colour on the POI hue, per §3.3. | f(3 km) 0.13% → 1.6–14% by POI | `src/art/palette.js`, `src/world/lighting/poi.js` |
| **8** | **Cut UI to bone + one accent + red.** Retire salvage cyan and friendly green to glyph + value. | UI hue mass in one 60° window: **35% → ≥ 92%** | `src/ui/theme.js` |
| **9** | **Clamp the starfield ramp to POI hue ±20° + neutral**, and modulate gain by local nebula opacity. | removes the last systematic third-hue source | `src/world/celestials/starfield.js`, `common.js` |
| **10** | **Populate the 0.06–0.20 band from the nebula**: coverage and chroma per the §3.2 table. | 0.06–0.20 band: **8.7% → 40–65%** of frame | `src/world/celestials/nebula.js` |
| **11** | **Narrow the rim** (`broad` 0.30 → 0.10–0.15) and re-solve its intensity against the floor, not the key. | rim-lit edge lands 0.14–0.22 | `src/art/palette.js`, `src/world/lighting/poi.js` |
| **12** | **Floating, closable panels** replacing welded chrome. | zero panel pixels in the centre 50% of frame at rest | `src/ui/hud.js`, `src/ui/index.js` |
| **13** | **Enforce the subject-area budget** — 12–25% of frame at standard framing. | pull the default camera back | `src/camera/**` |
| **14** | **Push the damage progression** so a mid-fight hull sheds most of its emissives. Mechanism exists; drive is too soft. | emissive pixel count halves by 50% hull loss | `src/vfx/damage.js` |
| **15** | **Add `--hue` and `--separation` to the surface tool** so §1.1 and §2.3 become criteria that cannot rot back, the way the key and the shadow check did. | two new PASS/FAIL rows in `acceptance.md` | `tools/surface.mjs` |

Items 1–4 are one short pass and move six of the eleven metrics in §2.1. Item 5 is the
single largest visual change in the list and it costs one vector per POI.

---

## Sources

Primary evidence — Beta Decay in-build frames, transcribed first-hand by the project owner:
`docs/design/reference-ui-language.md`. I have not seen those images.

EVE Frontier:
- [EVE Frontier — official site](https://evefrontier.com/en)
- [EVE Frontier — media / wallpaper gallery](https://evefrontier.com/en/media) — `Chumaq`,
  `Omo`, `Exclave Frigate`, `Mining Frigate`, `Asteroid`, `Rider`, `Fabricator`,
  `Asteroid Debris Field`, `Synod Battleship`, reveal cinematic still, horizontal key art
- [EVE Frontier — Developer Diary: Visual Direction (CCP Maximum Cats)](https://www.youtube.com/watch?v=gQ2DxfZZgSU)
- [MMORPG.com — EVE Frontier preview](https://www.mmorpg.com/previews/preview-eve-frontier-is-a-brilliant-idea-with-a-huge-cause-for-concern-2000133600) — source of the `The Frontier`, `Base in Flames`, `Hauler Caravan`, `The Trinary` and `Star Map` frames measured above
- [PC Gamer — EVE Online's survival spinoff Frontier](https://www.pcgamer.com/games/mmo/eve-onlines-survival-spinoff-frontier-is-a-hardcore-space-sim-you-can-play-on-a-gamepad-thats-unlike-anything-else-out-there/)
- [IGN preview — "EVE Frontier is Leaning into Space Survival Horror"](https://store.steampowered.com/news/group/9869/view/711153447479542340)
- [Isomerc — EVE Frontier Cycle 3 roadmap notes](https://www.isomerc.com/posts/eve-frontier-cycle-3)

EVE Online, for the older and looser end of the same house style:
- [CCP — Introducing New Nebulae into EVE](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve) — the "cooler and darker vs warmer and more saturated" statement, and the race-palette-matches-nebula-palette statement
- [EVE Online on Steam](https://store.steampowered.com/app/8500/EVE_Online/) — eight store screenshots measured
- [CCP — Smoke, Fire & Smart Lights devblog](https://www.eveonline.com/news/view/smoke-fire-and-smart-lights)

Beta Decay:
- [Rotoscope Studios — press kit](https://www.rotoscopestudios.com/presskit) — states the palette as "Grey, Black, White"; twenty-one assets measured
- [beta decay — official site](https://www.rotoscopestudios.com/)
- [beta decay on Steam](https://store.steampowered.com/app/1416070/beta_decay/)

Homeworld, our previous benchmark:
- [Homeworld 3 on Steam](https://store.steampowered.com/app/1840080/) — eight store screenshots measured
- [Homeworld Remastered Collection on Steam](https://store.steampowered.com/app/244160/) — eight store screenshots measured

Ours:
`docs/review/look-surface/close.png`, `docs/review/look-surface/three-quarter.png`,
`docs/review/look-cruiser/close.png`, `docs/review/look-cruiser/three-quarter.png`,
`docs/probes/ui.png`, `docs/probes/poi_giant.png`, `docs/probes/poi_graveyard.png`,
`docs/probes/poi_star.png`.
