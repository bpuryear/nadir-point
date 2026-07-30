## Nadir Point — procedural nebulae and starfields: why the current field is invisible, and the maths that would fix it

Everything below is measured on this repo at HEAD unless it carries a citation. Scripts are in `/private/tmp/claude-501/-Users-blake-Development-Nadir-Point/ef50457e-6329-46b1-bb55-d61bacf495f5/scratchpad/` (`neb-alpha.mjs`, `neb-frame.mjs`, `neb-radiance.mjs`, `neb-premul.mjs`, `neb-cost2.mjs`, `neb-proto2.mjs`, `neb-variants.png`).

---

# PART 1 — Why the 14-layer nebula does not read

There are **three independent causes, each of which alone is sufficient**. Fixing any one of them will not produce a visible nebula.

## 1.1 The calibration: what R1 actually asks for, in linear radiance

I implemented three r185's `ACESFilmicToneMapping` verbatim (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js` — note `color *= toneMappingExposure / 0.6` and `RRTAndODTFit`) plus the sRGB OETF, and solved backwards.

| linear scene radiance | display luma after ACES + sRGB |
|---|---|
| 1.0e-3 | 0.0000 |
| 6.0e-3 | 0.0136 |
| 1.0e-2 | 0.0314 |
| 2.0e-2 | 0.0805 |
| **2.45e-2** | **0.100 ← R1 threshold** |
| 5.0e-2 | 0.1954 |

**The field must emit ≈ 0.0245 in linear scene radiance for `reference-frames.md` R1 to pass.** That is the single most useful number in this report; every technique below should be judged against it.

What the nebula emits today, computed through the actual fragment shader (`src/world/celestials/nebula.js:127`, `c = vColor * (0.55 + 0.45*s.g) * s.a * uOpacity`) with the graveyard tint and `intensity: 1.15`:

| case | linear radiance | display luma |
|---|---|---|
| `neb-a` mean alpha, 3 overlapping layers | **2.57e-4** | 0.00000 |
| `neb-b` mean alpha, 3 overlapping layers | **1.53e-3** | 0.00000 |
| `neb-b` single brightest texel, 1 layer | 1.05e-1 | 0.349 |

**A 16× to 95× shortfall, landing at a display value that rounds to zero at 8 bits.** Only the handful of texels near `neb-b`'s maximum are visible at all — which is exactly what you see in `docs/probes/poi_graveyard.png`: three or four faint grey wisps and nothing else.

Calibration anchor, for reference: `far.background = 0x1b3550` (a flat clear colour, **zero draw calls**) measures display luma 0.125 and chroma 0.257 — it passes both R1 and R2 on its own. That is not the recommendation, it is the scale of the gap.

## 1.2 Cause A — the sheet alpha is 100–1000× too low, and it is a multiplicative attenuation chain

I ran `sheetTexture()`'s pixel loop verbatim (pure maths lifted from `src/world/celestials/nebula.js:39-98` and `common.js#planarFbm`):

```
{"name":"neb-a","meanAlpha":0.00022,"maxAlpha":0.0456,"pctAlphaGt0_05":0,   "pctAlphaGt0_2":0}
{"name":"neb-b","meanAlpha":0.00131,"maxAlpha":0.2697,"pctAlphaGt0_05":0.83,"pctAlphaGt0_2":0.01}
{"name":"neb-c","meanAlpha":0.00103,"maxAlpha":0.0727,"pctAlphaGt0_05":0.1, "pctAlphaGt0_2":0}
```

**`neb-a`'s brightest texel in the whole 256² sheet is 4.6% opaque. Its mean is 0.022%.** Traced through the chain, for `neb-a`:

| stage | median value | multiplier |
|---|---|---|
| base fbm after ridge mix | 0.5514 (σ≈0.092, **max 0.837**) | — |
| `× smoothstep(0.30,0.62, hole+0.133)` | 0.373 | ×0.68 |
| `× smoothstep(1.02, 0.18, rr)` | **0.0665** | **×0.18** |
| `(n − 0.46)/0.54` | 0 (p99 = 0.11) | kills ~95% |
| `pow(a, 1+0.42*3)` = `pow(a, 2.26)` | p99 → 0.0068 | ×0.06 at a=0.11 |

Two specific defects:

- **`nebula.js:72` — `n *= smoothstep(1.02, 0.18, rr)`.** `rr` is 0 at the quad centre and √2 at the corners. The falloff only reaches 1.0 inside `rr ≤ 0.18`, i.e. **2.5% of the quad area**. The comment says this is "so the quad edge is never visible"; measured, it is the single largest attenuator in the chain, costing 5.6× at the median.
- **`nebula.js:74-75` — absolute threshold then `pow`.** `planarFbm` is a weighted sum of many independent uniform lattice values. Lagae et al.: *"Most noises have an approximately Gaussian intensity distribution … Since the pdf of a sum of random variables is the convolution of the pdf of the individual random variables, the resulting pdf rapidly [converges]"* ([A Survey of Procedural Noise Functions, CGF 2010](https://www.cs.umd.edu/~zwicker/publications/SurveyProceduralNoise-CGF10.pdf)). Measured here: N(0.55, 0.09), **maximum 0.837 — it never approaches 1.0**. An absolute threshold of 0.46–0.50 against a distribution like that is a coin-flip whose outcome you cannot predict from the parameter, and `pow(·, 2.26)` then crushes whatever survives. **Threshold at a percentile of the field's own histogram, not at a constant.**

## 1.3 Cause B — the band is not in the frame the game renders

`src/camera/tactical.js` positions the camera at `focus + (cosP·sin yaw, sinP, cosP·cos yaw)·d` and looks at `focus`. `pitchFloor` rises with zoom (`ORBIT.pitchFloorMax 0.95` over `smoothstep(0.30, 1.00, zoomT)`). With `CAMERA.fov 46` at 16:9 the frame half-angles are 23.0° vertical, 37.0° horizontal, **40.9° corner**.

Elevation band the frame can cover, above the far-scene horizon:

| zoomT | pitchOffset | frame top | frame bottom |
|---|---|---|---|
| 0.02 | 0.18 | **+9.2°** | −36.8° |
| 0.48 | 0.42 | **−12.9°** | −58.9° |
| 0.86 | 0.30 | **−43.3°** | −89.3° |
| 1.00 | 0.30 | **−48.6°** | −94.6° |

**Above zoomT ≈ 0.55 the frame never contains anything above the far-scene horizon at all**, and even at maximum zoom-in it reaches only +9.2°.

Now the nebula centres in `src/world/celestials/index.js`:

| POI | centre | elevation |
|---|---|---|
| `giant-orbit` | `[0.21, 0.19, -0.96]` | **+11.0°** |
| `graveyard` | `[-0.62, 0.10, 0.78]` | **+5.7°** |
| `near-star` | `[0.30, -0.10, -0.95]` | −5.8° |

Against the shipped shots in `tools/shots.json`:

| shot | band centre off view axis | nearest band member | nearest quad edge | verdict |
|---|---|---|---|---|
| `engagement` (graveyard, unpinned) | 116.4° | 67.4° | 49.1° | **entirely off screen** |
| `close` (giant-orbit) | 147.7° | 105.5° | 89.4° | **entirely off screen** |
| `three-quarter` (giant-orbit) | 70.3° | 27.5° | 11.4° | clips in at a corner |

**The control that proves this is the gas giant.** Its direction is `[-0.6007, -0.2603, -0.7559]` — **15.1° *below* the horizon** — and it sits 13.6° off the `three-quarter` view axis and reads perfectly. The one celestial that was placed below the horizon is the one you can see. The band occupies ~10.6% of the celestial sphere, and it is in the 10.6% the camera structurally cannot look at.

This is also `docs/review/full-audit.md#G6` ("at yaw = 1.7 it is behind the camera and there is nothing else in the sky") restated with the pitch axis added: **it is not only a yaw problem, it is an elevation problem, and the elevation problem is not fixable by the player.**

The graveyard *probe* camera (`src/probes/poi_graveyard.js`, pitch 0.16, yaw 2.30) points 17.8° off the band — the band **is** in frame there, and it still measures:

```
docs/probes/poi_graveyard.png: medianLuma 0.0544  pctAbove0.06 38.6%  medianChroma 0.0196
```
R1 wants median ≥ 0.10 (we have 0.054) and R2 wants chroma ≥ 0.18 (we have **0.0196 — 9× short**). That frame is the clean isolation of Cause A from Cause B: put the band in shot and it is still grey.

## 1.4 Cause C — the CanvasTexture premultiply round-trip destroys the colour of every faint texel

`sheetTexture` writes `R=255, G=150+hot·105, B=110+hot·145, A=a·255` via `createImageData`/`putImageData`. The 2D canvas backing store is premultiplied. I measured the actual round trip in Chromium (`neb-premul.mjs`), through `putImageData → getImageData` and again through `texImage2D` with `UNPACK_PREMULTIPLY_ALPHA_WEBGL = false`:

| alpha byte | written RGB | read back RGB |
|---|---|---|
| 1 | 255, 150, 110 | **255, 255, 0** |
| 3 | 255, 150, 110 | 255, 170, 85 |
| 6 | 255, 150, 110 | 255, 170, 128 |
| 12 | 255, 150, 110 | 255, 149, 106 ✓ |

Colour only survives above alpha ≈ 12/255 = 0.047. **`neb-a`'s maximum alpha is 0.0456 — every texel in that sheet is inside the corrupted regime**, and 98.6% of it sits at alpha byte ≤ 1 where the blue channel is annihilated and the texel reads pure yellow. `softPointTexture` and `glowTexture` in `common.js` are immune only because they write neutral white.

**Fix:** `THREE.DataTexture` with a `Uint8Array` (or `HalfFloatType`) has no canvas and no premultiply step. This is not a workaround for non-negotiable 5 — a DataTexture is explicitly what that rule names.

## 1.5 What I ruled out

- **Not stale depth.** `farPass.clear = true` → `renderer.clear(autoClearColor, autoClearDepth, autoClearStencil)`; those three remain `true` even though `renderer.autoClear = false` (`src/render/renderer.js:39`). Colour *and* depth are cleared before the far pass.
- **Not render order.** `ORDER.stars 0 → backGlow 1 → star 2 → planet 5 → frontGlow 20 → dust 24`, `depthTest: order >= ORDER.frontGlow`, `depthWrite: false` throughout. Correct.
- **Not clipping.** `farCamera` far plane is `FAR_SCENE.radius * 4 = 36000`; the graveyard band sits at 20000 with corners out to ~22300, the starfield at 30000, the star at 30000. All inside.
- **Not the tint colour space.** `col()` decodes with `SRGBColorSpace`, tints are correct, `toneMapped: true` is correct.
- **Not the draw budget.** The far scene is ~18 draw calls (starfield 1, nebula 9, star ~5, giant 3) against a 320 ceiling with a scene complexity of 231. There is enormous headroom here.
- **Not additive-vs-normal.** `AdditiveBlending` with `gl_FragColor.a = 1.0` gives `SRC_ALPHA(=1)·src + dst`, which is correct additive.

## 1.6 One more measured falsehood in the code's own comments

`nebula.js:36` says *"`filament` mixes in a ridged field, which is what gives the thin bright strands"*. Measured, at matched 42% lit coverage, using density-weighted structure-tensor coherence (0 = isotropic blobs, 1 = perfectly aligned filaments):

| | coherence | stringiness (P²/4πA) |
|---|---|---|
| plain fbm, 6 octaves | 0.450 | 22.9 |
| **ridged fbm** | **0.458** | 55.5 |

**Ridged noise does not produce filaments.** It changes the profile of the blobs, not their alignment. See `neb-variants.png`.

---

# PART 2 — The maths, ranked by measured filament quality per millisecond

All variants at 256², matched to 42% lit coverage so the metric measures shape and not sparsity. Rendered comparison: `scratchpad/neb-variants.png`.

| technique | coherence | stringiness | ms / 256² | survives NO IMAGE FILES? |
|---|---|---|---|---|
| plain fbm, 6 oct | 0.450 | 22.9 | 5.3 | yes — this is what we ship |
| ridged fbm | 0.458 | 55.5 | 3.2 | yes |
| anisotropic fbm, 8:1 stretch | **0.960** | 1.3 | 3.1 | yes |
| **IQ domain warp, 2 levels** | **0.747** | **665.9** | **11.4** | **yes** |
| IQ warp, 1 level | 0.840 | 70.9 | 8.0 | yes |
| IQ warp, 3 levels | 0.563 | 1426.9 | 15.5 | yes |
| **IQ warp × anisotropic 4:1** | **0.850** | 64.5 | 12.6 | **yes** |
| curl advect, 4-octave potential | 0.161 | 4795 | 265 | yes, but see below |
| **curl advect, 1-octave potential, 8 steps** | **0.892** | 20.1 | 28.4 | yes |
| curl advect, 2-octave potential, 8 steps | 0.743 | 56.9 | 43.5 | yes |
| Worley F2−F1 | 0.808 | 317.1 | 7.0 | yes |
| IQ warp × Worley F2−F1 | 0.622 | 256.2 | 29.7 | yes |

## 2.1 Domain warping — the answer to "long wispy filaments, not cottony blobs"

Inigo Quilez's construction, verbatim ([iquilezles.org/articles/warp](https://iquilezles.org/articles/warp/)):

```glsl
float pattern( in vec2 p ) {
  vec2 q = vec2( fbm( p + vec2(0.0,0.0) ), fbm( p + vec2(5.2,1.3) ) );
  vec2 r = vec2( fbm( p + 4.0*q + vec2(1.7,9.2) ), fbm( p + 4.0*q + vec2(8.3,2.8) ) );
  return fbm( p + 4.0*r );
}
```

This is **the single highest-value change to the noise**: coherence 0.450 → 0.747 and stringiness 22.9 → 666 for a 2.2× cost increase. `nebula.js:59-60` already *has* a domain warp, but it is a single level at amplitude 0.34, and 0.34 of a unit-domain UV is a nudge, not a warp — one level at full amplitude measures coherence 0.840 / stringiness 70.9, two levels 0.747 / 666. **Three levels over-curls into an intestinal look; stop at two.**

For a *band* — the thing R2 actually wants, one hue running across the sky — the winner is **IQ warp composited on an anisotropically stretched domain**: 0.850 coherence at 12.6 ms, long directional strands. `common.js#cylFbm` already knows this trick (`aspect > 1 stretches features along longitude, which is the whole reason gas giant turbulence reads as ribbons rather than as clouds`) and the nebula does not use it.

On fbm itself, IQ's article ([iquilezles.org/articles/fbm](https://iquilezles.org/articles/fbm/)) gives `G = exp2(-H)`, gain and lacunarity self-similarly linked, and — as noted above — **says nothing about normalisation**, which is exactly the trap `planarFbm` fell into.

## 2.2 Curl noise — what it is actually for, and the trap

Bridson, Hourihan & Nordenstam, *Curl-Noise for Procedural Fluid Flow*, SIGGRAPH 2007 ([PDF](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf)). From the paper text:

- 2D: **ψ = N** (one scalar noise), **v = ∇×ψ**. 3D needs a *vector* potential — "three apparently uncorrelated noise functions … which in practice can be the same noise function evaluated at large offsets."
- Finite differences with "a displacement 10⁻⁴ times smaller than the domain, which works fine in single precision."
- **The trap, stated in the paper:** "if the noise function … smoothly varies in the range [−1,1], then the partial derivatives of the scaled N(x/L) will vary over a length-scale L with values approximately in the range O([−1/L, 1/L]). This means we can expect vortices of diameter approximately L and **speeds up to approximately O(1/L)**." Add octaves with equal potential amplitude and **the finest octave dominates the velocity field**. Bridson says to use "a power law to reduce the magnitude of velocities from smaller-scale vortices, as in the Kolmogorov turbulence spectrum."

I measured that trap directly. Advecting an fbm through the curl of a **4-octave** potential gives coherence **0.161** and salt-and-pepper mush at 265 ms/256². The **same code with a 1-octave potential** gives coherence **0.892** and beautiful smooth shear and vortices at 28.4 ms. (See panels 8–10 of `neb-variants.png`.)

**Recommendation on curl noise: use it, but for the large-scale sweep only (1–2 octave potential), and know that it costs 2.5–4× a domain warp for a *static* texture.** Its real value — divergence-free advection so particles do not pile into gutters — is a *temporal* property we do not need in a baked backdrop. Guerrilla use it exactly this way: in Horizon Zero Dawn the curl-noise texture is the small 2D one, "used to distort our cloud shapes and add a sense of turbulence" ([Schneider & Vos, SIGGRAPH 2015 Advances](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)) — not as the shape generator.

## 2.3 Worley / cellular for filament structure

Worley 1996 cellular texture basis, F1 = distance to nearest feature point, F2 = second nearest ([Lagae survey](https://www.cs.umd.edu/~zwicker/publications/SurveyProceduralNoise-CGF10.pdf); [Wikipedia](https://en.wikipedia.org/wiki/Worley_noise)). **F2−F1 lights the cell walls** — a connected network of thin lines, "useful for creating veins, cracks, or network-like structures" ([overview](https://sangillee.com/2025-04-18-cellular-noises/)).

Measured: coherence 0.808, stringiness 317, **7.0 ms/256²** — the cheapest filament source on the table. But look at the image: it is a Voronoi web, obviously artificial on its own. Use it as a **multiplier** on a warped fbm (`density × (0.30 + 0.70·F2F1)`), which measured 0.622/256 at 29.7 ms and looks like knotted gas.

Guerrilla's other Worley use is the inversion trick, quoted from the slides: *"Worley noise … If it is inverted as you see here: It makes tightly packed billow shapes. We layered it like the standard Perlin fBm approach. Then we used it as an offset to dilate Perlin noise. This allowed us to keep the connectedness of Perlin noise but add some billowy shapes to it. We referred to this as `Perlin-Worley` noise."* That remap gives billows, not filaments — right for clouds, wrong for a nebula.

## 2.4 Emission and absorption, and why alpha blending is not it

Nelson Max, *Optical Models for Direct Volume Rendering*, IEEE TVCG 1995 ([ACM](https://dl.acm.org/doi/10.1109/2945.468400)) is the canonical statement: emission-only accumulates and can only ever get brighter; emission **with** absorption attenuates everything behind by `exp(−∫τ ds)`, and that attenuation is what produces depth.

`nebula.js` does something close but not equivalent: additive emission layers (`ORDER.backGlow`, `ORDER.frontGlow`) plus **separate, hard-coded near-black `NormalBlending` dust quads** (`ORDER.dust`, `dustTint = shade(pal.shadow, 0.75)`). The header comment identifies the right principle — *"An additive-only nebula can only ever get brighter, so it flattens"* — but implements it as a black overlay, which multiplies everything toward the same neutral black.

The stronger, still-cheap version is **per-channel absorption**. From Leria's report under Neyret (Grenoble/INRIA, [PDF](https://evasion.inrialpes.fr/Membres/Fabrice.Neyret/Etudiants/rapports/rapportM2-2020_Erwan_LERIA.pdf)):

> "For both the bubble and the cloud we define absorption coefficients a_rgb for each color component (red, green and blue). These coefficients affect the local transparency equation. These coefficients are used like an absorption spectrum of wavelength. … for the local transparency at each voxel we have this: `e^(−a_rgb · τ(n(stretch(x))) · compress(m(x)) · Δl)`, which is finally `e^(−σ_t·Δl)`."

In a single blend that is `blendEquation: ADD, blendSrc: ZERO, blendDst: ONE_MINUS_SRC_COLOR` — a **coloured multiply** rather than a black one. Interstellar dust reddens what is behind it (short wavelengths scatter first); an `a_rgb` weighted blue-heavy makes your dust lanes read as *dust in front of light* rather than as *holes cut in the image*. Same draw call, same cost, and it is the difference between a nebula reading as depth and reading as a gradient with stencils.

Note the same report's `stretch()` — an anisotropic scaling of the noise domain — "Our stretching is sufficient to extend the anisotropic look of our nebula." Independent confirmation of §2.1.

## 2.5 Why nebulae read as multi-hue, and how to fake it for the cost of a ramp lookup

The physics, not the art direction:

- **Hα 656.3 nm** (red), **[O III] 500.7 nm** (blue-green/teal), **[S II] 672.4 nm** (deep red) are the three lines everything is built from ([narrowband primer](https://astrobackyard.com/narrowband-imaging/); [The Astro Manual](https://theastromanual.com/narrowband-astrophotography-ha-oiii-sii/)).
- The Hubble/SHO palette maps S II→R, Hα→G, O III→B — false colour, adopted because "two of them are red, one is green and none is blue." **The famous gold-and-teal look is a mapping decision, not a photograph.** That matters for us: we are equally free to choose, and `palette.js` should own the choice.
- **The multi-hue is radially structured, not random.** Leria: *"theory as well as observation tells that the first dust shell illuminated by the star emits 'blue' light (in fact, O III emission peak that is usually mapped as blue), then the slightly deeper one emits 'green' (Hα), then a last thin shell emits 'red' (S II)."*

**The cheap fake, and it is what to do here:** do not pick a random tint per layer (`nebula.js:216` — `tintColors[r.int(0, tintColors.length - 1)]`). Instead index a 2-stop-to-3-stop ramp by **optical depth** — accumulated density along the view, or simply the local density value. Hot/thin → the O III teal end, deep/thick → the Hα/S II warm end. One `texture2D` into a 1D ramp, or a two-`mix()` chain in the fragment shader. **Zero extra cost, and it is why every reference frame has a hue that shifts with brightness rather than a field of confetti.** This also directly answers `docs/design/visual-direction.md`'s finding that "chroma rises with luma in every reference and is flat in ours" (Frontier 0.107 → 0.292 → 0.580 across luma bands; ours 0.026 → 0.036 → 0.039).

CCP say the same thing about location identity out loud: *"the dominant stellar phenomenon of each race happens to be in the same color palette as the ships of that race"* ([Introducing New Nebulae into EVE](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve)). One temperature per location is the house rule, and `index.js`'s per-POI palette derivation is already the right architecture for it — it just has nothing bright enough to colour.

## 2.6 Dust lanes as dark structure

The thing that makes a real nebula read as depth rather than as a gradient is that **the dark structure is in front of the glow and is itself lit**. Three properties the current 4–5 dust quads do not have:

1. **They must be spatially correlated with the glow, not independently placed.** `place(1.05, frontRadius*1.35, 0.22)` draws a fresh random position; a real dust lane sits *on* the emission it obscures, because it is the same cloud. Generate the lane mask from the **same noise field**, offset in the domain — e.g. lane = `smoothstep(a, b, warpedFbm(p + offset))`, so the lane threads through the glow instead of landing next to it.
2. **They must be coloured absorption, not black paint** (§2.4).
3. **They must have a hard-ish edge on the lit side and a soft one on the dark side.** A symmetric falloff reads as fog. One-sided: `edge = smoothstep(t, t+w, n)` with `w` small on the side facing the emission.

## 2.7 Starfield — what is right, what is wrong, and why uniform looks wrong

`src/world/celestials/starfield.js` gets the *structure* of the problem right and I want to be explicit about that: magnitude by inverse CDF, flux `10^(-0.4m)`, temperature biased hot for the bright, constant `gl_PointSize` in pixels with a flat sprite core and mipmaps deliberately off. That last one — the note at `common.js:210-216` about a 2 px quad selecting the bottom of the mip chain and losing 85% of its alpha — is a correct and non-obvious diagnosis and should not be touched.

Three corrections:

**(a) `MAG_SLOPE = 0.58` is the Euclidean slope, and the sky is not Euclidean.** `d log N / dm = 0.6` holds "in an Euclidean universe uniformly populated by [sources] with the same intrinsic luminosity" ([UCO/Lick](https://www.ucolick.org/~simard/phd/root/node8.html)). The real sky is a disc. From the combined Tycho-2/UCAC4 counts ([hnsky.org](https://www.hnsky.org/star_count.htm)):

| to magnitude | total stars | implied slope over the previous 5 mag |
|---|---|---|
| 0 | 3 | — |
| 5 | 1,744 | 0.553 |
| 10 | 382,925 | **0.468** |
| 15 | 39,387,795 | **0.402** |
| 16 | 88,896,114 | 0.354 |

Over the code's `MAG_MIN −1.4 … MAG_MAX 6.7` range the real slope is ≈ 0.47, not 0.58. A too-high slope pushes the inverse CDF toward `MAG_MAX`, **over-producing near-threshold specks and under-producing bright anchors** — which is precisely the "flat, grey, static sky" the file's own header says it exists to avoid. 7,200 stars is about a naked-eye sky (~9,100 to mag 6.5); the count is right, the *distribution within it* is skewed faint.

**(b) The galactic band is far too soft.** `keep = 1 - bandDensity * clamp01((t - 0.12)/0.88)` with `bandDensity 0.62` and rejection capped at 6 tries produces a gentle gradient. The Milky Way's thin disc has a stellar scale height of ~270 pc against a ~2.6 kpc scale length ([SDSS Tomography I](https://arxiv.org/pdf/astro-ph/0510520)) — an aspect ratio near 10:1, which is why the naked-eye band is a hard, narrow, *structured* stripe with visible dark rifts, not a haze. Two changes: (i) use an exponential in the sine of galactic latitude rather than a linear ramp, and (ii) **give the band an unresolved luminous component** — a broad, dim, dust-lane-cut glow along the band, not just more point sprites. That component is what actually contributes luma; 7,200 points contribute effectively nothing to the frame median.

**(c) The stellar ramp is a deliberate, defensible restriction — leave it.** `STELLAR_RAMP` is built from palette hexes rather than blackbody, with the stated reason "the sky must not introduce hues the ships cannot answer." That is correct for R2 (one hue owns the field) and I would not change it. Real star colours are also far less saturated than people expect, so a blackbody curve would buy little.

**Why a uniform random starfield looks wrong**, stated compactly: uniform-in-brightness sampling gives every star the same weight, so the eye finds no anchors and no hierarchy; uniform-on-sphere placement removes the band, which is the only large-scale structure in the real sky; and uniform colour removes the correlation between brightness and temperature. All three are already handled in the file — the slope and the band strength are the tuning errors.

---

# PART 3 — What I would build, with costs

## 3.1 Cost of runtime generation, measured

Value-noise fbm on this machine, warmed: **6.5 ns per octave-sample** for a bare fbm loop, **11.5 ns** including the smoothstep/pow/write of a real texture loop.

| bake | octave-samples | measured / projected |
|---|---|---|
| 3 × 256² nebula sheets (**today**) | 3.93 M | **45 ms, measured** |
| 1024×512 gas giant albedo (**today**) | 7.86 M | ~51–90 ms |
| 6 × 256² cubemap, 40 oct/px (2-level warp) | 15.7 M | ~180 ms |
| 6 × 512² cubemap, 24 oct/px | 37.7 M | ~430 ms |
| 6 × 512² cubemap, 40 oct/px (2-level warp) | 62.9 M | ~720 ms |
| 6 × 1024² cubemap, 24 oct/px | 151 M | ~1.7 s |

**So: the current nebula is 45 ms and free. A 6×512² warped-fbm cubemap on the CPU is ~430–720 ms and is a problem.** The same thing in a fragment shader is a few ms.

## 3.2 The architecture: bake the sky to a cubemap on the GPU, once, at POI entry

Verified against three r185 source (`node_modules/three/src/renderers/webgl/WebGLBackground.js`):

- `scene.background = cubeTexture` pushes exactly one `boxMesh` into the render list (line 168) — **1 draw call, 12 triangles, zero overdraw**, versus the current 9 nebula meshes drawing 24 large additive quads with full-screen-scale fill on a 4× MSAA half-float target. The fill-rate saving is the real win, not the draw calls.
- `boxMesh.material.toneMapped = ColorManagement.getTransfer(background.colorSpace) !== SRGBTransfer` (line 151) — a `LinearSRGBColorSpace` render-target cube **is** tone-mapped, so it goes through ACES and the grade with everything else. Correct for us.
- `scene.backgroundIntensity` and `scene.backgroundRotation` are live uniforms (lines 137–142). **You can retint the exposure and rotate the whole sky per POI, per travel leg, or during a jump, without rebaking.**

Pipeline: build a `WebGLCubeRenderTarget` (both it and `CubeCamera` exist in r185), render 6 faces of an inverted sphere carrying the noise fragment shader, assign to `far.background`, dispose the scratch scene. Six draw calls, once. **This is a shader, not an asset — non-negotiable 5 is satisfied in letter and spirit.** Reference for scale: EVE ships authored `.dds` cubemaps and "the resolution of every nebula background in-game has been doubled, quadrupling the pixel count" ([Building the future of EVE](https://www.eveonline.com/news/view/building-the-future-of-eve)); we get the same result from a 200-line shader.

**Keep as geometry, in front of the cubemap:** the dust lanes and one or two front-glow sheets, at `frontRadius`, so they parallax against the giant and are occluded by it. That occlusion is the strongest depth cue the backdrop has and `common.js`'s header is right to spend far-scene depth on it. But 3–4 quads, not 24.

If you would rather not write a cubemap bake: **the CPU fallback that fits inside 45 ms is 6 × 256² DataTextures with a 2-level IQ warp at ~180 ms**, which is at the edge. A 128² cube is 45 ms and would be soft but is a legitimate starting point, because the cubemap is a *background* and can be blurry — the sharpness budget belongs to the front sheets.

## 3.3 Priority order

1. **Move the band below the horizon.** Every nebula `centre[1]` should be negative, around −0.20 to −0.35, matching the gas giant's −0.26 which demonstrably works. `[-0.62, 0.10, 0.78]` → `[-0.62, -0.28, 0.74]`. **One character per POI, and it is the difference between the field existing and not.** Widen `spread` so the band wraps ≥ 180° of the sky, per `full-audit.md#G6`.
2. **Delete the radial falloff's `0.18` inner stop** (`nebula.js:72` → `smoothstep(1.20, 0.55, rr)`) and **replace the absolute threshold with a percentile threshold** on the field's own histogram. Prototyped: mean alpha 0.0022 → 0.1515, 69×, at no extra cost.
3. **Move `sheetTexture` from `CanvasTexture` to `DataTexture`.** Recovers the colour of every texel below alpha 0.047 — currently 100% of `neb-a`.
4. **Two-level IQ domain warp on an anisotropically stretched domain.** +7 ms, coherence 0.45 → 0.85, and it is the only change that turns cotton into filaments.
5. **Ramp the hue by optical depth, not by `r.int()`.** Free. This is what makes chroma rise with luma.
6. **Coloured absorption for dust lanes**, generated from the same noise field as the glow. Free.
7. **Bake to a cubemap** once 2–6 are proven in the quad path.
8. **Starfield:** `MAG_SLOPE` 0.58 → 0.47, harden the band profile, and add an unresolved band glow.

---

## Sources

- [Inigo Quilez — Domain warping](https://iquilezles.org/articles/warp/)
- [Inigo Quilez — fBM](https://iquilezles.org/articles/fbm/)
- [Inigo Quilez — Voronoise](https://iquilezles.org/articles/voronoise/) · [Smooth Voronoi](https://iquilezles.org/articles/smoothvoronoi/)
- [Bridson, Hourihan, Nordenstam — Curl-Noise for Procedural Fluid Flow, SIGGRAPH 2007 (PDF)](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf) · [SIGGRAPH history entry](https://history.siggraph.org/learning/curl-noise-for-procedural-fluid-flow-by-bridson-houriham-and-nordenstam/)
- [Lagae et al. — A Survey of Procedural Noise Functions, CGF 2010 (PDF)](https://www.cs.umd.edu/~zwicker/publications/SurveyProceduralNoise-CGF10.pdf)
- [Schneider & Vos — The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn, SIGGRAPH 2015 Advances (PDF)](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf) · [Guerrilla publication page](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn)
- [Leria (Neyret lab, INRIA) — Procedural generation of 3D realistic dust and nebulas (PDF)](https://evasion.inrialpes.fr/Membres/Fabrice.Neyret/Etudiants/rapports/rapportM2-2020_Erwan_LERIA.pdf)
- [Max — Optical Models for Direct Volume Rendering, IEEE TVCG 1995](https://dl.acm.org/doi/10.1109/2945.468400)
- [CCP — Introducing New Nebulae into EVE](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve) · [Building the future of EVE](https://www.eveonline.com/news/view/building-the-future-of-eve)
- [SpaceEngine devblog — ray-marched nebulae](https://spaceengine.org/news/blog170729/)
- [HNSky — star counts by magnitude (Tycho-2 / UCAC4)](https://www.hnsky.org/star_count.htm) · [UCO/Lick — Euclidean number counts](https://www.ucolick.org/~simard/phd/root/node8.html)
- [Jurić et al. — Milky Way Tomography with SDSS I: Stellar Number Density Distribution](https://arxiv.org/pdf/astro-ph/0510520)
- [AstroBackyard — Narrowband imaging primer (Hα 656.3, O III 500.7, S II 672.4)](https://astrobackyard.com/narrowband-imaging/) · [The Astro Manual — Hubble palette](https://theastromanual.com/narrowband-astrophotography-ha-oiii-sii/)
- [Worley noise / F2−F1](https://en.wikipedia.org/wiki/Worley_noise) · [Variations of cellular noise](https://sangillee.com/2025-04-18-cellular-noises/)
- [three.js — WebGLRenderer.premultipliedAlpha](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.premultipliedAlpha)