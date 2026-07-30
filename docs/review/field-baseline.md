# The field, measured — the baseline every downstream item is graded against

**W6-0. Written 2026-07-30 against HEAD `4edef63`, unmodified. No `src/` file was changed to
produce any number in this document.**

Everything here comes from `node tools/fieldcheck.mjs`, which is new in this commit and is the
first thing in the repository that can measure R1 or R2. Command lines and raw output are quoted
verbatim. Where a number contradicts `docs/design/space-backgrounds.md` or
`docs/design/reference-frames.md`, **this document wins and the plan is wrong**, because those
documents' numbers came from scratchpad scripts that no longer exist (`space-backgrounds.md`
§0.3, which I verified: `grep -l 'scene.visible' tools/*.mjs` matched nothing before this
commit).

Read §1 first. It changes the wave.

---

## 0. What the instrument does, in one paragraph, so the numbers can be checked

For a named shot, `fieldcheck.mjs` boots the real game through `tools/harness.mjs` honouring the
shot's **own** query string out of `tools/shots.json`, runs the shot's setup, pauses the sim, and
takes four full-resolution renders of the same settled pose: `A0` as HEAD renders it, `A1` the
same frame again (the noise-floor control), `B` with `world.scene.visible = false` — **the field
alone** — and `C` with the scene restored (the residue control). `world.scene` is
`renderer.scene` (`src/core/world.js:15`) and `PostChain.mainPass` (`src/render/postfx.js:235`)
is the only pass that draws it, so `B` is `renderer.far` — dome, starfield, nebula, star, gas
giant — through the **identical** post chain including the POI grade and its vignette. R1 and R2
are graded on `B`.

Sample size is the whole canvas at 1:1, **1 440 000 px per statistic** at the default 1600x900,
printed on every run. `capture.mjs` measures 14 400 px of a 1/10 box-filtered downscale, which
is why it can report a mean but not a chroma median.

### The chroma metric, chosen and defended

R2 had no metric definition anywhere in the tree. I am choosing:

> **chroma `C = max(R,G,B) − min(R,G,B)`, on display-referred, tone-mapped, sRGB-encoded pixel
> values in [0,1]** — the same pixels and the same space in which `capture.mjs:120` computes
> luma.

The decisive reason is that **it is the metric under which `reference-frames.md` §2's correction
is arithmetically true.** That correction says a green field "reaches R1's median luma of 0.10 at
roughly `G ≈ 0.14` with R and B near zero, which caps its chroma at about 0.12–0.14": with
`R=B=0, G=0.14`, `max−min = 0.14`. Exact. And "a red-dominant field … reaches luma 0.10 at
`R ≈ 0.47` and has enormous chroma headroom": `max−min = 0.47`. Exact. It also confirms that
document applies the Rec.709 weights to *display* values (`0.10/0.7152 = 0.1398`,
`0.10/0.2126 = 0.4704`), exactly as `capture.mjs` does — so the luma space and the chroma space
are one choice, not two. No other candidate (CIELAB C\*, Oklab chroma, HSV S) reproduces both
numbers without a normalising constant nobody wrote down. Full argument and the caveats are in
the file header of `tools/fieldcheck.mjs`.

Hue is the matching HSV hue. **The "hue band" is the narrowest contiguous arc containing 80% of
the frame's chroma mass**, each pixel weighted by its own C, so a large population of near-grey
pixels cannot vote a band into existence.

### Three checks that the instrument is not lying

| check | result |
|---|---|
| Does it reproduce `capture.mjs`? | `capture.mjs` whole-frame `meanLuma`: close 0.204, wide 0.154, engagement 0.129. `fieldcheck` full-frame mean on a 100× larger sample: **0.2034, 0.1542, 0.1281.** |
| Is it resolution-dependent? | engagement field median luma **0.1283 at 1600x900** (N=1 440 000) and **0.1283 at 2560x1440** (N=3 686 400). Chroma 0.1451 both. |
| Is it raster-dependent? | engagement field, `NP_RASTER=swiftshader`: median luma **0.1283**, chroma **0.1490**, above-0.06 **97.85%**, against hardware ANGLE/Metal 0.1283 / 0.1451 / 97.82%. Unlike D67, **this finding is not raster-dependent.** |

And one that matters more than all three, in §2.

---

## 1. F1 — CAPTURE HEAD. **THE DOME THAT LANDED AT `0d4d18e` ALREADY CLOSED R1.**

```
$ node tools/fieldcheck.mjs
fieldcheck  raster=hardware  viewport=1600x900  shots=close,three-quarter,wide,cinematic,engagement,hud-close,hud-three-quarter,hud-engagement

FIELDCHECK SUMMARY  7/8 shot(s) meet R1 and R2   raster=hardware  viewport=1600x900
  close              PASS  median luma 0.1053  above0.06  85.32%  chroma 0.2941  hue 217.7 deg  band   4 deg  [N=1440000]
  three-quarter      PASS  median luma 0.1190  above0.06   82.9%  chroma 0.2706  hue 216.3 deg  band   6 deg  [N=1440000]
  wide               PASS  median luma 0.1437  above0.06  87.43%  chroma 0.3058  hue 215.2 deg  band   5 deg  [N=1440000]
  cinematic          FAIL  median luma 0.0936  above0.06  88.92%  chroma 0.1019  hue 100.1 deg  band   9 deg  [N=1440000]
  engagement         PASS  median luma 0.1281  above0.06  97.84%  chroma 0.1451  hue  94.4 deg  band   5 deg  [N=1440000]
  hud-close          PASS  median luma 0.1053  above0.06  85.41%  chroma 0.2941  hue 217.7 deg  band   4 deg  [N=1440000]
  hud-three-quarter  PASS  median luma 0.1190  above0.06  82.89%  chroma 0.2706  hue 216.3 deg  band   6 deg  [N=1440000]
  hud-engagement     PASS  median luma 0.1283  above0.06  97.81%  chroma 0.1451  hue  94.4 deg  band   5 deg  [N=1440000]

1 shot(s) miss R1 or R2. This is a TARGET gate, not a regression gate:
on HEAD it is expected to fail, and it must not be wired into npm run smoke until the targets are met.
EXIT=1
```

**Run-to-run stability**, from an earlier eight-shot run on the same tree: every median luma
within **0.0003**, every median chroma **identical**, every coverage figure within **0.16
percentage points**, every hue within **0.1°**. The `hud-*` shots are the same poses with the
DOM HUD visible; the HUD is not in the canvas, so they act as a fourth control and reproduce
their non-HUD twins to within the same tolerance.

`space-backgrounds.md` §6/F1: *"Falsifies the plan if: the graveyard `engagement` background
already reads median luma ≥ 0.10 with ≥ 40% above 0.06."*

**It reads median luma 0.1281 with 97.81% above 0.06.** R1 asks for 0.10 and 40%.

### Which world are we in — stated plainly

**We are in the falsifying world, and not marginally.** The graveyard `engagement` field is at
**128% of R1's luminance target** and at **244% of its coverage target**. `wide` and `close` at
giant-orbit clear it as well. R1 is not the problem. It has not been the problem since 13:19 on
2026-07-30; nobody had measured it.

R2 is also met, everywhere it is measurable. Under the corrected per-hue target
(≥ 0.12 green-dominant, ≥ 0.18 otherwise) the graveyard reads **0.1451** against 0.12, and
giant-orbit reads **0.2706–0.3058** against 0.18. Every hue band is **4–9° wide** against a 60°
ceiling.

The single failing shot, `cinematic`, misses by 6% on luma (0.0936 vs 0.10) and 15% on chroma
(0.1019 vs 0.12) — and §4 explains exactly why, in one number.

### The number that should have been in the plan

`index.js:218-226` records that the graveyard dome's author measured **0.3777** at the previous
gains, fitted the response `out = 1.111·L^0.643`, re-solved the gains for a predicted median of
**0.1225**, and then never re-measured. **Measured today: 0.1281.** Their forward prediction was
right to within 4.6%. The plan is built on the assumption that this solve was never validated;
it validates.

---

## 2. Attribution — **the sky dome is the entire field. The nebula contributes nothing.**

```
$ node tools/fieldcheck.mjs engagement --attrib --report

ATTRIBUTION  which object in renderer.far carries the field (gameplay scene hidden throughout)
  probe               medLuma    dLuma   >0.06%  medChroma     hue
  (field baseline)     0.1281              97.8     0.1451    94.4
  far:dome             0.0280  -0.1001     2.04     0.0079   114.8
  far:starfield        0.1283  +0.0002     97.8     0.1451    94.4
  far:nebula           0.1278  -0.0003    97.82     0.1451    94.5
  far:star             0.1281  +0.0000    97.82     0.1451    94.4
  far:giant            0.1295  +0.0014    98.39     0.1490    94.2
  dome:gains=0         0.0280  -0.1001     2.04     0.0079   114.8
  dome:lobe=0          0.0831  -0.0450     77.9     0.0863   101.7
  (baseline again)     0.1283  +0.0002   (clean)
```

Single-variable sweep, each probe applied alone and reverted, baseline re-measured at the end
(residue +0.0002). Read it row by row:

* **Hide the dome and the field collapses to median luma 0.0280 with 2.04% above 0.06.**
  `skydome.js:12` records the pre-dome measurement as *"engagement background median luma
  0.0261, 2.1% of frame above luma 0.06"*. **A different tool, on a different tree, reproduced
  to 0.002 and 0.06 percentage points.** That is the strongest evidence available that this
  instrument is correct, and it is independent of everything in §0.
* **The 14-layer nebula moves the median by −0.0003 and the coverage by +0.02 pp.** It is 33.4°
  off the view axis at this pose, i.e. in frame, and it contributes nothing measurable. Cause A
  is confirmed on the live frame, at full strength.
* 7 200 stars move it by +0.0002. The star by 0.0000.
* Hiding the gas giant *raises* the median by +0.0014 — it is darker than the dome behind it. It
  occludes field rather than adding to it.
* Of the dome's 0.1001, the ecliptic band carries **0.0551** and the lobe **0.0450**.

---

## 3. F2 — the dome elevation probe. **Confirmed at `engagement`, to three significant figures.
Refuted at `close` and `wide`. It is a property of the pose, not of the dome.**

```
$ node tools/fieldcheck.mjs engagement --dome --report

F2  DOME ELEVATION PROBE  (skydome.js:128 evaluated against the live far camera)
  view forward -0.3155, -0.5861, -0.7463  elevation -35.88 deg  zoomT 0.48  pitchOffset 0.42
  uGain 0.049  uBase 0.17  uAxis 0.089, -0.2419, -0.9662
  uCore(linear)   0.22697 / 0.46208 / 0
  uZenith(linear) 0.16827 / 0.37124 / 0
  uGround(linear) 0.12214 / 0.29614 / 0
    ndcY     elev       d.y    band   %peak      lobe   linLuma
       1   -12.88    -0.223  0.8744   87.4%   0.04843  0.055696
       0   -35.88   -0.5861  0.3786   37.9%   0.04734  0.033231
      -1   -58.88   -0.8561  0.3002     30%   0.03991  0.027249
  FRAME over 289 grid samples: elevation -58.88..-10.55 deg
    share of band peak  min 30%  mean 50.2%  max 92.4%
```

§0.2 predicted **87% → 38% → 30%** across a frame spanning −12.88° to −58.88°. Measured, against
the live far camera and the live uniforms: **87.4% → 37.9% → 30.0%, over −12.88° to −58.88°.**
The claim is exactly right, including the frame's elevation window.

**And the underlying claim is confirmed too:** `skydome.js:128` builds `b = 1.0 -
smoothstep(0.06, 0.92, abs(d.y))`, which peaks at `d.y = 0` — the horizon. The `engagement`
frame's elevation window is −58.88° to −10.55°. **The peak elevation is not in the frame at
all**, and the frame-wide mean share of the band's own peak is **50.2%**.

But F2's falsifier is "≥ 70% of its band peak across the frame", and that depends entirely on
where the camera is pitched:

| shot | POI | view elevation | frame elevation window | mean share of band peak | F2 |
|---|---|---|---|---|---|
| `engagement` | graveyard | −35.88° | −58.88° … −10.55° | **50.2%** | CONFIRMED |
| `cinematic` | graveyard | −26.07° | −43.07° … −7.66° | **60.7%** | confirmed (marginal) |
| `close` | giant-orbit | −13.75° | −36.75° … +9.25° | **79.1%** | **REFUTED** |
| `wide` | giant-orbit | −11.46° | −34.46° … +11.54° | **81.5%** | **REFUTED** |

So the finding is real but it is **not a dome bug — it is the elevation question in §7 wearing a
different hat.** The band is correctly centred for any frame that can see the horizon, and
increasingly wasted as the tactical camera pitches down. This is a direct argument for the
owner's ruling on option B-prime (compress only the far camera's pitch): a far camera pitched
less steeply than the tactical camera puts the band's peak back in the frame **for free**, with
no dome edit at all.

---

## 4. Why `cinematic` is the only failing shot — and what it proves about the lobe

```
$ node tools/fieldcheck.mjs cinematic --dome --report
  view forward -0.7251, -0.4395, 0.5301  elevation -26.07 deg
    ndcY     elev       d.y    band   %peak      lobe   linLuma
       1    -9.08   -0.1577  0.9508   95.1%   0.00000  0.041416
       0   -26.07   -0.4395  0.5417   54.2%   0.00006  0.022083
      -1   -43.07   -0.6829  0.3242   32.4%   0.00065  0.013354
```

**The lobe term is 0.00000 to 0.00065 across the entire frame.** The cinematic camera looks
along `(-0.725, -0.440, +0.530)` and the dome's axis is `(0.089, -0.242, -0.966)` — **118° apart.**
The lobe is behind the camera, so the whole cinematic field is the ecliptic band alone, and the
band alone lands at median luma **0.0936**, 6% short of R1.

That is a clean, quantified statement of the thing `skydome.js:20-33` argues in prose: *"the
tactical camera's yaw is free and a band is directional by design."* The measurement now says
exactly how much: **the lobe is worth 0.045 of median luma (§2), and it is worth zero at any yaw
more than ~90° off the POI's bearing.** Everything above R1 at the graveyard is lobe; the
yaw-independent floor sits at 0.0831 (`dome:lobe=0`, §2) and 0.0936 (cinematic, measured).

**The yaw-independent floor is the real R1 gap, and it is 0.017 of median luma, not 0.10.**

---

## 5. **The field is a flat wash. That is what is actually wrong with it.**

R1 and R2 pass and the frames still do not look like the references, and the instrument says why.

```
  BY VALUE TIER    (cut at the field's own p33 / p67 luma)
engagement   p33 0.1117 / p67 0.1442
    dark     33.18%   mean luma 0.0889   median chroma 0.1019   hue  96.0 deg
    mid      33.48%   mean luma 0.1282   median chroma 0.1490   hue  94.1 deg
    bright   33.34%   mean luma 0.1641   median chroma 0.1842   hue  93.7 deg
    dark-to-bright hue separation 2.3 deg
wide         p33 0.1127 / p67 0.1764
    dark     33.30%   mean luma 0.0657   median chroma 0.1097   hue 217.4 deg
    mid      33.35%   mean luma 0.1444   median chroma 0.3217   hue 214.8 deg
    bright   33.35%   mean luma 0.2509   median chroma 0.4039   hue 214.7 deg
    dark-to-bright hue separation 2.7 deg
cinematic
    dark-to-bright hue separation 3.1 deg
```

* **One hue at every value.** Dark-to-bright hue separation is **2.3° to 4.0° across all eight
  shots**, at both POIs. The
  owner's ruling — *green in the luminous core, rust and amber in the dust lanes and outer
  bands, separated on the value axis* — is **not started**. There is no second hue anywhere in
  any frame.
* **The luma ladder is a smooth ramp with no structure.** engagement: p05 0.0697, p25 0.1034,
  p50 0.1281, p75 0.1522, p95 0.1754 — a p05→p95 spread of **0.106** with an interquartile range
  of **0.049**, monotone from the top of the frame to the bottom. That is a gradient, and
  `nebula.js:3-7` says in its own header that a flat coloured gradient across the sky is the
  exact failure the file exists to avoid.
* **The hue band is 4–9° wide.** R2 asks for ≤ 60° and reads this as a pass, but 5° is not
  "one hue owns the field at real saturation" — it is one hue and *nothing else*. **R2 as
  written cannot distinguish a disciplined palette from a monochrome wash**, and downstream must
  not treat a narrow band as evidence of quality.

### The tension the owner has to see

The owner ruled for a **rust-and-green blend**. Rust/amber sits near hue 20–40°; the graveyard
green measures 94.4°. A field genuinely carrying both cannot fit inside R2's **60° band** if both
hues carry comparable chroma mass. It *can* if the rust lives in dark, low-chroma dust lanes —
which is exactly what the ruling specifies — because the band is chroma-mass weighted. **So the
ruling and R2 are compatible only in the specific form the owner stated**, and the by-value-tier
readout above is the metric that tells the two apart. Grade the blend on tier hue separation, not
on the band width.

---

## 6. F5 — the alpha reconciliation. **three.js was right. procedural was wrong. And there is a
third finding neither report has.**

Read back from the real shipped `CanvasTexture` in the live game, through the source canvas's own
2D context (not by re-drawing it, which would round-trip the premultiply a second time and
manufacture damage the GPU never sees).

```
$ node tools/fieldcheck.mjs engagement --alpha --report

  neb-a  256x256 = 65536 texels
    mean alpha 0.001246  (0.3176/255)   max alpha 0.1451 (37/255)
    zero-alpha 96.16%   mean over non-zero 0.032434
    alpha percentiles /255: p50 0  p90 0  p99 12  p99.9 28
  neb-b  256x256 = 65536 texels
    mean alpha 0.0019  (0.4845/255)   max alpha 0.3529 (90/255)
    zero-alpha 94.94%   mean over non-zero 0.037582
    alpha percentiles /255: p50 0  p90 0  p99 16  p99.9 46
  neb-c  256x256 = 65536 texels
    mean alpha 0.000018  (0.0047/255)  max alpha 0.0118 (3/255)
    zero-alpha 99.67%
```

| `neb-a` | max α | mean α |
|---|---|---|
| procedural §1.2 | 0.0456 | 0.00022 |
| three.js §1b | 0.094 – 0.286 | 0.0014 – 0.0062 |
| **MEASURED, shipped texture** | **0.1451** | **0.001246** |

**D3 is settled for three.js on both figures.** The max lands inside three.js's range and is
3.2× procedural's; the mean is 5.7× procedural's and just below three.js's low end.
`space-backgrounds.md` F5: *"Falsifies item 2's sizing if the true mean alpha is at the three.js
end. The 69× prototyped lift would then overshoot by an order of magnitude."* **It is at the
three.js end. Item 2's 69× must be re-derived from 0.001246, not from 0.00022.**

### Cause C, quantified — and a bigger finding on top of it

`nebula.js:83-88` authors, for every texel: `R = 255`, `G = 150 + hot·105`, `B = 110 + hot·145`,
with `hot = clamp01((a − 0.30) / 0.70)`. Read back:

```
    Cause C (nebula.js:86 authors R = 255 for EVERY texel):
      alpha       texels   meanR   minR   meanG   meanB
      1-4           1069     255    255   184.8    70.6      <- authored G 150, B 110
      5-8            527     255    255   156.3   108.8
      9-16           534     255    255   147.1   110.2
      17-32          361     255    255     151   109.4
      33-64           26     255    255   149.6   110.2
```

* **Cause C is real and it is confined to α ≤ 4/255.** In that bucket the authored (255, 150,
  110) comes back as (255, 184.8, 70.6). At α = 1/255 the arithmetic is exact and brutal: G=150
  premultiplies to `round(150/255) = 1` and unpremultiplies back to 255; B=110 premultiplies to
  `round(110/255) = 0` and never comes back. Above α = 5/255 the round trip is faithful to within
  4%. **D6 is settled for three.js on severity, by a wider margin than they claimed** — this is
  a low-α artefact, not a whole-texture corruption. R is never damaged, because it is already the
  maximum channel.
* **THE FINDING NEITHER REPORT HAS: the two-tone core/edge has never once rendered.** `hot`
  requires α ≥ 0.30. The shipped sheets max out at α = **0.1451 / 0.3529 / 0.0118**. On `neb-a`
  and `neb-c` `hot` is **identically zero at every texel**; on `neb-b` it is non-zero for at most
  ~65 texels of 65 536 (p99.9 is α = 0.18). So RGB is the constant (255, 150, 110) across
  essentially the whole texture, and `sheetMaterial`'s `(0.55 + 0.45 * s.g)` interior lift is a
  constant 0.815. **The "hot interior rather than one flat colour" that `nebula.js:77-84` exists
  to produce is dead code, and it is dead because of Cause A, not Cause C.** Anyone fixing the
  premultiply and expecting the two-tone to appear will get nothing until alpha crosses 0.30.

---

## 7. The two spot-checks I was asked to verify

### §0.2 — does `skydome.js:128` peak at the horizon?

**YES, confirmed.** `float b = 1.0 - smoothstep(0.06, 0.92, abs(d.y));` is a function of
`abs(d.y)` and is maximal at `d.y = 0`. `d.y = 0` is the far-scene horizon. Measured across the
`engagement` frame the band term runs 0.8744 at the top edge (−12.88°) to 0.3002 at the bottom
(−58.88°), and the horizon is **10.55° above the top of the frame**. The one object that covers
100% of the frame spends its peak on an elevation the frame does not contain. See §3 for the
qualification that matters: this is true at `engagement` and false at `close` and `wide`.

### §3 / D5 — is blue clipped to exactly zero in all three graveyard dome colours?

**YES, confirmed, and D5's clip thresholds reproduce exactly.** Two independent reads.

Live uniforms, straight off the shipped material (`--dome`, §3 above):

```
  uCore(linear)   0.22697 / 0.46208 / 0
  uZenith(linear) 0.16827 / 0.37124 / 0
  uGround(linear) 0.12214 / 0.29614 / 0
```

And re-deriving `saturate()` (`src/art/palette.js:1447-1456`, which operates on a `THREE.Color`
set from an sRGB hex and therefore lerps in the **linear** working space):

| `index.js` | base | blue reaches 0 at amount | authored | resolves to |
|---|---|---|---|---|
| `:214` core | `#8fb04a` | **1.224** | 1.50 | `#83b500` — 18.4% of the amount does nothing |
| `:215` zenith | `#7f9f4a` | **1.298** | 1.50 | `#72a400` — 13.4% does nothing |
| `:216` ground | `#708f4a` | **1.409** | 1.55 | `#629400` — 9.1% does nothing |

D5 predicted 1.224 / 1.298 / 1.409 and `core ≈ 0x82b500`. Measured: 1.224 / 1.298 / 1.409 and
`#83b500`. **The entire graveyard sky is a two-channel R,G field** — the rendered frame agrees:
field mean RGB **0.0725 / 0.1551 / 0.0109**.

`index.js:179-181`'s claim that *"saturate is luminance-preserving and hue-preserving by
construction"* is false above those thresholds, exactly as D5 says.

**But note what un-clipping would cost, which D5 does not.** Zero blue is what makes the
graveyard's chroma pass. For a green-dominant pixel the chroma ceiling at display luma `L` is
`L / 0.7152 = 1.398·L` — at the measured `L = 0.1281` that is **0.179**, and the field measures
**0.1451**, i.e. **81% of its own ceiling**, with the remaining 19% spent on the R channel.
Restoring blue moves `min(R,G,B)` off zero and takes chroma down one-for-one. There is 0.025 of
margin over the 0.12 target. **The un-clip must be re-measured with `fieldcheck` before it is
called free.**

*(Aside, and it corrects `reference-frames.md`: the green chroma ceiling is not fixed at 0.14. It
is `1.398 × median luma`, so it is 0.140 at luma 0.10 and 0.179 at the luma this field actually
runs at. R2's literal 0.18 is within 0.035 of reach in green — it would need R pushed to zero,
producing a pure chartreuse, which conflicts with the owner's rust ruling. The per-hue restatement
remains the right call, but the reason given for it was slightly too strong.)*

---

## 8. What the measurements KILL or RE-SCOPE

This is the section downstream agents should act on.

| item | status | why |
|---|---|---|
| **Item 0** — `tools/fieldcheck.mjs` | **DONE** | This commit. |
| **Item 1** — re-centre the dome's band | **RE-SCOPED, and de-prioritised** | The luminance half is **KILLED**: F1 says the field is at 0.1281 against a 0.10 target. The proposed 2.0–2.3× lift would put it at 0.26–0.29, i.e. back toward the **0.3777** the dome's own author already backed out of once (`index.js:218-226`). Do not lift the gains. The band-centring finding is **confirmed at `engagement` (§3)** but is a *pose* property, refuted at `close` and `wide`, and it is better answered by the far-camera pitch compression (option B-prime) than by a dome edit. What survives: the yaw-independent floor is 0.0831–0.0936 (§4), and that is the only place R1 is actually short. |
| **Item 1** — un-clip the blue | **SURVIVES, but it is now a RISK, not a win** | Confirmed exactly (§7). But zero blue is why chroma passes; un-clipping costs chroma one-for-one against a 0.025 margin. Land it behind `node tools/fieldcheck.mjs` and revert if chroma drops below 0.12. |
| **Item 2** — repair the sheet alpha | **KILLED as an R1 lever. SURVIVES, promoted, as the structure fix.** | The whole 14-layer nebula moves the field median by **−0.0003** (§2). It cannot be justified by luminance. It is now the **highest-value item in the wave** for a different reason: §5 shows the field is a single hue at every value with no structure, and the nebula — dust lanes in front of glow — is the only shipped mechanism that produces the value-and-structure separation the owner ruled for. **Re-derive the lift from the measured mean α 0.001246, not 0.00022** (§6). And do not expect the two-tone core/edge to appear until α crosses 0.30 (§6). |
| **Item 3** — direction-space field / fill-cost arbitration (F3) | **UNCHANGED, NOT MEASURED HERE** | F3 needs a shader edit and a hardware bench run; out of W6-0's scope. Note its premise has weakened: the live dome already delivers R1 at 1 draw call and 1 program. |
| **Item 4** — bake to a cubemap (F4) | **UNCHANGED, NOT MEASURED HERE** | Gated on item 3. |
| **Item 5** — PMREM into `scene.environment` (R3) | **UNCHANGED, and now better supported** | The field is bright and coloured enough to be worth reflecting. Flag: the graveyard environment would have **exactly zero blue** (§7), so every hull's shadow side would reflect a two-channel sky. |
| **Item 6** — starfield and dither | **RE-SCOPED** | The starfield moves the field median by **+0.0002** (§2). Whatever it is for, it is not the floor. |
| **F6** — "R2 may be unreachable in green" | **ANSWERED. Escalation withdrawn.** | The corrected per-hue target is met with 21% margin (0.1451 vs 0.12). The literal 0.18 is 0.035 away and would require a pure chartreuse. Keep the green; keep the per-hue restatement. |

### The one thing that is still short, stated as the new brief

**R1 fails only where the dome's lobe is out of frame** — 0.0936 at `cinematic`, 0.0831 with the
lobe zeroed at `engagement`, against 0.10. The gap is **0.017 of median luma on the
yaw-independent floor**, not the 0.075 the plan is sized for. Everything else the plan proposes
to buy with luminance has already been bought.

**What is genuinely missing is structure and a second hue**, and §5 is the metric for both.

---

## 9. Gaps in this baseline — do not read past them

* **`near-star` is completely unmeasured.** No shot in `tools/shots.json` visits it, so
  `fieldcheck` cannot see it either. `index.js:277-286` already admits its dome numbers are
  arithmetic and were never shot. Nobody should quote a number for `near-star`.
* **`cinematic` is not a reproducible measurement.** Its camera chases the player at render rate
  and keeps moving while the sim is paused. `fieldcheck` detects and prints this:
  `camera drift from A0: A1 6.8416 deg  B 19.5779 deg  C 31.8248 deg -> !! CAMERA MOVED BETWEEN
  SNAPSHOTS - EVERY MASK NUMBER BELOW IS MEANINGLESS`. Its **field** statistics are a valid
  measurement of the field at whatever pose B landed on; its mask, noise floor and residue are
  not. Every other shot reports 0° drift on all three.
* **F3 and F4 were not run.** They need a shader edit and an instrumented smoke run respectively.
* **The occlusion mask is secondary and threshold-dependent.** It uses a 12/255 per-channel
  threshold, chosen above the film grain's ±7 levels and printed with the A0-vs-A1 control every
  run (engagement: 0.04% of pixels differ with nothing changed; 2.85% differ with the scene
  hidden). The R1/R2 grade does **not** use the mask.
* **`fieldcheck` is a TARGET gate, not a regression gate.** It exits 1 when a shot misses R1 or
  R2. On HEAD that is `cinematic`, and that is correct behaviour. **Do not wire it into
  `npm run smoke`** until the targets are met.

---

## 10. Gates, run on this tree

I changed `tools/fieldcheck.mjs` (new), `tools/capture.mjs` (comments, plus `samples` and
`sampleSize` in the frame block and `[N=…]` in the log line — the three guards are byte-identical)
and this file. No `src/` file. All gates run after those edits:

```
$ rm -rf dist && npm run smoke
boot           : ok
draw calls     : 269
triangles      : 102,539
programs       : 60
geometries     : 132
textures       : 133

$ node src/sim/selftest.mjs
   scanned 176 files across src and tools for Math.random (was 11, non-recursive, src/sim only)
   offenders: none
54 of 54 checks passed

$ node src/sim/ai/escalationHarness.mjs      28 of 28 escalation checks passed
$ node tools/ripple.mjs                      17 of 17 checks passed
$ node tools/flight.mjs                      20 of 20 checks passed
$ node src/sim/meta/economyAudit.mjs         21 of 21 economy checks passed
$ node tools/poicheck.mjs                    16 of 16 assertions passed
$ npm run uicheck
  #sampled 598 boxes in 30 region(s) (9 welded, 21 windows), 598 drawn, 0 unattributed (0.0%)
$ node tools/widediag.mjs close --assert
ASSERT SUMMARY  1/1 shot(s) render   sample 57600 px per shot at 2560x1440, raster=hardware
$ node src/sim/meta/sortieHarness.js         16 of 16 fields identical.
```

The determinism scanner covers `tools/fieldcheck.mjs` (it appears in the coverage list at
`tools/fieldcheck.mjs 1`) and reports no offenders. `capture.mjs` was re-run after the edit and
produces byte-identical guard behaviour: `engagement luma=0.128 contrast=0.041 clipped=0%
[N=14400 px, whole frame]`, `ok: true`.

**Raster:** every fieldcheck number in this document was measured on **hardware ANGLE/Metal**
(`rasterMode()` defaults to hardware on darwin). The SwiftShader control in §0 shows the finding
survives the change of rasteriser, which D67 did not.
