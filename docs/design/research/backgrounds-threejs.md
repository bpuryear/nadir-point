## `three.js` / WebGL implementation report — getting a lit, coloured field into `renderer.far` under the no-image-files rule

### 0. Note first: the tree moved under me

`src/world/celestials/skydome.js` and a rewritten `src/world/celestials/index.js` (415 lines, up from 271) landed at **12:53–12:58 today**, mid-research. A parallel stream has already shipped the "large inverted sphere" answer: one `SphereGeometry(28000, 32, 16)`, `BackSide`, `depthTest:false`, `renderOrder = ORDER.dome = -1`, gradient + one angular lobe, no texture. Everything below is written against **that** tree, not the one in the task brief. Several of my findings are about the dome that just landed.

---

## 1. Measurements I took before recommending anything

All of these are computed from the shipped source, in Node, using the project's own `RNG`, `planarFbm`, `palette.mix/saturate`, and a JS transcription of three r185's exact `ACESFilmicToneMapping` (`node_modules/three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js:46–74`, including the `color *= toneMappingExposure / 0.6` pre-scale and the AP1 in/out matrices). Scripts are in `/private/tmp/claude-501/-Users-blake-Development-Nadir-Point/ef50457e-6329-46b1-bb55-d61bacf495f5/scratchpad/` (`neb3.mjs`, `aces.mjs`).

### 1a. What R1 actually costs in scene-linear radiance

| target (display luma, post-ACES, exposure 1.0) | required scene-linear radiance in `renderer.far` |
|---|---|
| 0.06 (R1's "≥40% of frame above this") | **0.0156** |
| 0.10 (R1's "background median ≥") | **0.0245** |
| 0.15 | 0.0372 |
| 0.20 | 0.0514 |

That is the number every celestial should be graded against. It is small. It is also ~10× what the nebula delivers.

### 1b. The nebula sheets are, measured, essentially transparent

`nebula.js#sheetTexture` at the shipped `size:256`, over five different world seeds, driving the real fork chain (`rng.fork('celestials:graveyard').fork('nebula')`):

```
seed      neb-a                              neb-b                              neb-c
nadir-1   max=0.286 mean=0.0062 %>0.05=5.2   max=0.294 mean=0.0041 %>0.05=3.2   max=0.109 mean=0.0017 %>0.05=1.2
nadir-2   max=0.136 mean=0.0016 %>0.05=1.5   max=0.400 mean=0.0037 %>0.05=2.4   max=0.067 mean=0.0006 %>0.05=0.1
nadir-3   max=0.094 mean=0.0014 %>0.05=0.5   max=0.299 mean=0.0018 %>0.05=1.1   max=0.255 mean=0.0133 %>0.05=10.1
alpha     max=0.113 mean=0.0014 %>0.05=0.6   max=0.302 mean=0.0031 %>0.05=2.2   max=0.080 mean=0.0008 %>0.05=0.3
beta      max=0.106 mean=0.0010 %>0.05=0.4   max=0.327 mean=0.0052 %>0.05=3.6   max=0.064 mean=0.0016 %>0.05=0.1
```

**Peak alpha never exceeds 0.40 anywhere in any sheet. Mean alpha is 0.001–0.013. Between 0.1% and 10% of texels clear alpha 0.05.**

The cause is arithmetic, not art direction. Before the threshold, the field is `fbm × holeMask × radialFalloff`. The radial falloff `smoothstep(1.02, 0.18, r)` alone costs the median ~85%: measured, `n` has median **0.454 before** the radial term and **0.059 after** (neb-a). Thresholds of 0.38–0.50 are then applied to a field whose post-falloff median is ~0.06 and whose 99th percentile is ~0.66, and the result is raised to `pow(·, 1 + 0.42×3) = pow(·, 2.26)`. The sheet is a few filaments over nothing.

Pushed through the shipped graveyard tints (`saturate(mix(0x8fb04a, ice, 0.32), 1.30)` etc., mean linear Y 0.277), `intensity: 1.30`, the `dim` term, the shader's `(0.55 + 0.45·s.g)`, and three's ACES:

| | scene-linear Y | display luma | 8-bit |
|---|---|---|---|
| mean texel (α=0.003), 3 layers overlapping | 0.0021 | **0.0009** | 0 |
| top-5% texel (α=0.05), 2 layers | 0.0232 | 0.092 | 24 |
| peak texel (α=0.30), 1 layer | 0.0695 | 0.253 | 64 |

**The nebula's typical pixel is 8-bit code 0.** Fourteen layers of code 0 is code 0. That is why 14 layers at radius 20000 do not read, and it is not fixable by adding layers, by moving them closer, or by re-aiming the band — re-aiming (which the new `index.js` did, correctly) only decides *which* zeros are on screen.

### 1c. The sky dome that just landed is 3–7× brighter than its own docstring, and inconsistent between POIs

`skydome.js:38–41` states the intent: *"The lobe peak is authored to land near sRGB 0.16 and the anti-lobe near 0.03 after ACES and the POI grade."* Computed through three's real ACES at each POI's own `grade.exposure`:

| POI | floor @ zenith (display luma / 8-bit RGB) | lobe peak |
|---|---|---|
| **graveyard** (exp 1.0) | **0.591** — `(128, 171, 14)` | **0.649** — `(145, 185, 29)` |
| giant-orbit (exp 1.0) | 0.088 — `(0, 24, 71)` | 0.265 — `(24, 73, 143)` |
| near-star (exp 0.86) | 0.052 — `(41, 7, 0)` | 0.148 — `(99, 23, 0)` |

Three findings in one table:

1. **The graveyard dome renders a mid-chartreuse sky at 8-bit `(128,171,14)`.** That is not "coloured darkness", it is a lit field brighter than most of the hull, and it will make R3 (hull ≥0.25 luma above field median) unsatisfiable at that POI.
2. **The blue channel is clipped to zero by `saturate()`.** `palette.js:1413` clamps per-channel in linear after the lerp; `saturate(0x8fb04a, 1.45)` computes b′ = 0.3696 + (0.0265 − 0.3696)×1.45 = **−0.128 → 0**, giving `0x84b500`. `saturate(mix(0x4c6a4a,0x8fb04a,0.55), 1.35)` → `0x6e9902`. Past roughly amount 1.30 on an already-chromatic hue, `saturate()` stops being hue-preserving and becomes a clip.
3. **The three POIs are 11× apart in field luma** (0.052 / 0.088 / 0.591) with no shared solve. R1 is a single measurable target; three hand-authored `gain`/`baseGain` pairs will not converge on it.

*(Caveat, stated: these are analytic, from the shipped constants through the shipped tone-map. They do not include the Grade pass's vignette — 0.50 at graveyard, which darkens frame edges — nor bloom. Confirm with `npm run capture` before acting. The relative ordering between POIs is not sensitive to either.)*

### 1d. The far-scene parallax is worth 0.14–2.0 pixels, so nothing in `far` needs to be geometry

`FAR_SCENE.parallax = 2.2e-4`, `CAMERA.fov = 46`, `CAMERA.maxDistance = 46000`, bench at 1440 px tall → **31.3 px per degree**.

| camera distance | farCamera translation | angular shift of the giant (r=9000) | pixels |
|---|---|---|---|
| 3200 (default) | 0.70 u | 0.0045° | **0.14 px** |
| 46000 (max) | 10.1 u | 0.064° | **2.0 px** |

Against the nebula shell at r=20000 the maximum is 0.9 px. **The two-scene split earns its keep entirely on depth precision, not on parallax.** Everything in `far` can be baked without losing anything a player can see.

---

## 2. `scene.background` vs a skybox mesh vs `scene.environment` — in r185, verified against source

These are three different jobs and you want all three.

| | what it is | draw cost | r185 mechanics |
|---|---|---|---|
| `scene.background = CubeTexture` | full-screen sky | **1 draw call**, no depth test, no depth write | `WebGLBackground.js:88` builds a unit `BoxGeometry` with `ShaderLib.backgroundCube`, `side: BackSide`, `depthTest:false`, `depthWrite:false`, and `renderList.unshift(...)` — pushed to the *front* of the pre-sorted opaque list, so it draws first and everything else overdraws it. `onBeforeRender` copies the camera position into `matrixWorld`, so it is nailed to the camera for free. |
| skybox mesh (what `skydome.js` does today) | full-screen sky | **1 draw call + 1024 tris + 1 program** | Identical fill cost. Buys you a live shader (parameters can animate) and costs you a geometry, a program, and a material to keep in the palette audit. |
| `scene.environment` | IBL for `MeshStandardMaterial` | **0 draw calls** | Requires `CubeUVReflectionMapping`, i.e. PMREM output. This is what makes the nebula *light the hull*. |

Three concrete gotchas found in the r185 source that will bite:

**(a) The background's tone-mapping flag is chosen by the texture's colour space, not by you.**
`WebGLBackground.js:1445` (build) / `addToRenderList`:
```js
boxMesh.material.toneMapped = ColorManagement.getTransfer( background.colorSpace ) !== SRGBTransfer;
```
Tag the cube `SRGBColorSpace` and three turns tone mapping **off** for the sky while leaving it on for everything else. In this project that particular consequence is masked (see (b)), but it is exactly the mechanism behind "the sky is blown out and nothing else is".

**(b) In this codebase the entire scene already renders with tone mapping off, by design.** `WebGLRenderer.js:2349`:
```js
let toneMapping = NoToneMapping;
if ( material.toneMapped ) {
  if ( _currentRenderTarget === null || _currentRenderTarget.isXRRenderTarget === true ) {
    toneMapping = _this.toneMapping;
  }
}
```
Every pass draws into the `EffectComposer`'s `HalfFloatType` target, so `_currentRenderTarget !== null` and ACES is applied exactly once, by `OutputPass`. Same rule (`WebGLRenderer.js:2342`) forces the output colour space to `workingColorSpace` (linear) for any non-XR render target. **This is why a boot-time cube bake into a `WebGLCubeRenderTarget` is automatically linear and automatically un-tone-mapped — you do not have to fight the renderer.** It also means `toneMapped: true` on every celestial material today is a no-op.

**(c) `scene.background = <equirectangular texture>` is not the cheap option people assume.** `WebGLEnvironments.js#getCube` silently allocates `new WebGLCubeRenderTarget( image.height )` and runs `fromEquirectangularTexture` on first use, caching in a `WeakMap`. An equirect background *is* a cubemap; you just don't control its size. `image.height` for a 2048×1024 source gives a 1024/face cube.

**Recommendation:** `far.background = <baked CubeTexture>`, tagged `LinearSRGBColorSpace`. Delete the dome mesh. Keep `scene.environment` for the main scene, fed from the *same* bake.

---

## 3. CubeTexture vs equirectangular vs inverted sphere

- **Inverted sphere** (today): fine for a 2-parameter analytic gradient, wrong the moment the field has structure, because every pixel of structure costs you a fragment shader that runs every frame forever.
- **Equirectangular `DataTexture`**: convenient to author on the CPU, but three converts it to a cube anyway (§2c), pole density is wasted (a 2:1 equirect spends 2× the texels at the poles it spends at the equator, and our band is equatorial), and you pay a hidden cube RT you didn't size.
- **CubeTexture from `WebGLCubeRenderTarget`**: uniform angular density, one texture object, `textureCube()` is a single hardware fetch, and — the point — **it is generated by rendering, so the generator can be as expensive as you like.**

**Resolution, from measurement not taste.** The screen is 31.3 px/degree at 1440p/46°. A cube face of *N* is `N/90` px/degree. The *content* we would bake is band-limited at:
- dome: ~1 cycle over the sphere — anything ≥64/face is exact;
- nebula sheets: 256² textures stretched over quads subtending **20°–56°**, i.e. **4.6–12.8 source texels per degree**.

| face size | px/degree | verdict | RGBA16F memory (no mips) |
|---|---|---|---|
| 256 | 2.8 | loses the filaments | 3.1 MB |
| **512** | **5.7** | **matches typical shipped content** | **12.6 MB** |
| 1024 | 11.4 | matches the sharpest shipped quad; headroom to author more | 50.3 MB |
| 2818 | 31.3 | screen-exact — not achievable | 380 MB |

**Ship 512, expose 1024 on the `ultra` preset.** Note that a 512 cube is *not a downgrade on today's nebula* — the source sheets are 256² and are already being magnified.

**Do not bake the starfield.** `starfield.js:19–22` argues correctly that a star must be a constant-pixel-size point sprite or it scintillates. A 512 cube gives it 0.18 px/texel-degree; the entire magnitude distribution the file goes to such trouble to build would be resampled into mush. The starfield stays as one `THREE.Points`, one draw call, forever.

---

## 4. The recommendation: bake once into a `WebGLCubeRenderTarget` at boot

This survives non-negotiable 5 completely: nothing is fetched, nothing is a binary asset, the cube is produced by rendering runtime-generated geometry and runtime-generated `DataTexture`s through the GPU. Cost: **one texture, one draw call per frame, zero per-frame shader work.**

New file, owned by Environment & celestials — `src/world/celestials/bake.js`:

```js
import * as THREE from 'three';
import { FAR_SCENE } from '../../core/units.js';

/**
 * Render `source` once into a cube map. `source` is a throwaway Scene holding the
 * sky dome, the nebula sheets and the dust lanes — everything at infinity that has
 * no per-frame state. The result is HDR radiance in linear-sRGB.
 */
export function bakeSkyCube(gl, source, { size = 512 } = {}) {
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,               // see §7
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,  // radiance, not a colour image — see §6
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,           // RenderTarget defaults to LinearFilter
    generateMipmaps: false,                  // we only ever magnify — see §3
    depthBuffer: true,                       // dust lanes must sort against the glow
  });
  rt.texture.name = 'sky-cube';

  const cam = new THREE.CubeCamera(1, FAR_SCENE.radius * 4, rt);

  /* THREE GOTCHAS SPECIFIC TO THIS RENDERER, ALL THREE OF WHICH ARE SILENT.
   *
   * 1. CubeCamera.update() calls renderer.render() six times and relies on
   *    renderer.autoClear to clear each face (CubeCamera.js:220-247). This project
   *    pins autoClear = false permanently in render/renderer.js:39, so without this
   *    the six faces accumulate on top of each other.
   * 2. renderer.info.autoReset is false (renderer.js:40). The bake would otherwise
   *    be counted in the first frame's draw calls and land in tools/bench.mjs.
   * 3. toneMapping is already forced to NoToneMapping when the current render target
   *    is a non-XR RT (WebGLRenderer.js:2349) — but stating it makes the bake
   *    independent of that behaviour.
   */
  const prevAutoClear = renderer.autoClear;
  const prevTone = gl.toneMapping;
  const prevTarget = gl.getRenderTarget();

  gl.autoClear = true;
  gl.toneMapping = THREE.NoToneMapping;
  cam.update(gl, source);
  gl.autoClear = prevAutoClear;
  gl.toneMapping = prevTone;
  gl.setRenderTarget(prevTarget);
  gl.info.reset();

  return rt;   // rt.texture.isRenderTargetTexture === true → no px/nx swap needed
}
```

That last comment matters: `WebGLCubeRenderTarget.js:3803–3811` documents that `isRenderTargetTexture = true` suppresses the legacy left-handed px/nx flip, and `WebGLBackground` honours it (`if (background.isCubeTexture && background.isRenderTargetTexture === false) premultiply(_m)`). A cube you bake yourself needs no mirroring; a cube you build from six `DataTexture`s does.

Then in `buildCelestials`:

```js
// build the at-infinity layers into a throwaway scene instead of into `root`
const bakeScene = new THREE.Scene();
if (spec.dome)   bakeScene.add(buildSkyDome(spec.dome).object);
if (spec.nebula) bakeScene.add(parts.nebula.object);

const cube = bakeSkyCube(gl, bakeScene, { size: quality === 'ultra' ? 1024 : 512 });
far.background          = cube.texture;
far.backgroundIntensity = 1.0;              // live knob, no rebake — Scene.js
far.backgroundRotation.set(0, 0, 0);        // live knob, no rebake

// the source geometry and its three 256² sheet textures are now dead weight
disposeBakeScene(bakeScene);
```

`backgroundIntensity` and `backgroundRotation` are the two things you get for free that the dome mesh does not give you: **you can re-grade or re-aim the whole field at zero cost, per POI, per frame, without rebuilding anything.** Given §1c's 11× spread between POIs, a single `backgroundIntensity` per POI is a better control surface than three hand-tuned `gain`/`baseGain` pairs.

**Draw-call accounting, graveyard:**

| | today | with the bake |
|---|---|---|
| dome | 1 | — |
| starfield | 1 | 1 |
| nebula (3 back / 3 front / 3 dust) | 9 | — |
| `scene.background` box | — | 1 |
| star (3 corona shells) | 3 | 3 |
| gas giant (planet + halo + rings) | 3 | 3 |
| **far scene total** | **17** | **8** |

Nine draw calls against a 320 ceiling is not the win. The win is that the bake makes the sky's *internal* complexity free — you can run 60 nebula sheets, a raymarched dust volume, or a full domain-warped fBm per cube texel, and the per-frame cost is still 1 draw call.

**The one thing you give up, stated plainly.** Baking the nebula into `scene.background` forfeits `ORDER.frontGlow` (20) and `ORDER.dust` (24) — the layers that pass *in front of* the gas giant and the near-black lanes that eat the glow behind them. `common.js:18–27` calls that occlusion "the strongest depth cue the backdrop has" and it is right. Two options:

- **(a) partial bake** — bake `dome + backGlow` only; keep `frontGlow` and `dust` as live quads (3–6 draws, `depthTest: true`, unchanged). Far total ≈ 11–14. Recommended for `giant-orbit`, where the planet is the subject.
- **(b) full bake including the giant** — the graveyard's giant is 3.9° across and parallaxes 2 px; there is nothing to lose. Far total = 5, and the giant's 512² procedural texture can be disposed after the bake. Recommended for `graveyard` and `near-star`.

Precedent for the technique: `wwwtyro/space-3d` generates its entire star-and-nebula sky in GLSL and **bakes it once into a cubemap through a framebuffer, seeded and reproducible**, at a default 1024/face. The C++ port reports a 4096/face bake at "slightly more than a second" on a GTX 1070 Ti — which puts a 512/face bake in the low single-digit milliseconds. three's own `webgl_shaders_sky` example uses exactly this shape: `new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType })` + `new THREE.CubeCamera(1, 1000, cubeRenderTarget)` + `cubeCamera.update(renderer, scene)`.

And the closest artistic precedent in the reference set is not a cubemap at all: **Homeworld 2's backgrounds are tessellated spheres carrying vertex colours, built from a 1024×512 source by `HW2BGBuilder`, with no background texture** — the `img2sky` tool exists specifically to reproduce that format. The dome that landed today is closer to Homeworld than a cubemap is. What Homeworld's approach cannot do, and ours must, is carry the nebula's filament structure — which is why the bake is the right upgrade rather than a replacement of the idea.

---

## 5. PMREM: making the field actually light the hull (R3 item 3)

`reference-frames.md` §4 item 3: *"at engagement range the ship reads mean RGB 0.216/0.244/0.238 — cool — because it is lit almost entirely by blue fill/rim."* The fix is not a light; it is that the thing filling the sky should be in `scene.environment`.

**The project already calls `PMREMGenerator.fromScene` — on the wrong scene.** `src/world/lighting/poi.js:211–262` builds a *second, invented* sky (a `SphereGeometry` gradient, a `MeshBasicMaterial` sun ball, a half-lit giant ball, one additive nebula ball at `ENV_R × 0.55`) and PMREMs *that*. `poi.js:94–99` says so out loud: *"if the visible sky is a coloured dome and the environment map is still built from three near-black `ibl` hexes, the shadow side of every hull reflects a room the player cannot see."* The file identified the defect and then built a third room instead of using the first one.

**Collapse it. PMREM the thing you baked:**

```js
const pmrem = new THREE.PMREMGenerator(gl);
pmrem.compileCubemapShader();                    // pre-warm, cheap
const envRT = pmrem.fromCubemap(cube.texture);   // 256 default; docs: ideal input is 256/face
scene.environment          = envRT.texture;      // CubeUVReflectionMapping
scene.environmentIntensity = pal.ibl.intensity ?? 1;
scene.environmentRotation.set(0, 0, 0);
pmrem.dispose();
```

Notes, all verified in r185 source:

- `PMREMGenerator._allocateTargets()` produces `3 × max(cubeSize, 112)` × `4 × cubeSize`, `HalfFloatType`, `RGBAFormat`, `colorSpace: LinearSRGBColorSpace`, `generateMipmaps:false`, `mapping: CubeUVReflectionMapping`. At the default 256 that is 768×1024 RGBA16F ≈ **6.3 MB per environment**, plus one shared ping-pong target of the same size.
- Documented ideal input sizes: **256×256/face for `fromCubemap`, 1024×512 for `fromEquirectangular`** (min 16/face and 64×32 respectively). A 512 cube is comfortably above the ideal.
- `fromScene(scene, sigma, near, far, {size, position})` is the alternative if you'd rather PMREM `world.far` directly. It sets `renderer.toneMapping = NoToneMapping` and `renderer.autoClear = false` itself and restores both (`PMREMGenerator.js#_sceneToCubeUV`), and it draws an internal `_backgroundBox` as the clear **only when `scene.background` is null or a `Color`** — with a texture background it relies on `WebGLBackground` covering the frame, which it does. Defaults `near=0.1, far=100` are useless here; pass `1, FAR_SCENE.radius * 4`.
- **The `dispose()` warning in the docs is stale for r185.** The docs still say *"PMREMGenerator is a static class… calling `dispose()` on one of them will cause any others to also become unusable."* In r185 all of `_pingPongRenderTarget`, `_blurMaterial`, `_ggxMaterial`, `_lodMeshes`, `_backgroundBox` are **instance** fields (`src/extras/PMREMGenerator.js:2670–2689`, `_dispose()` at 235). So the two generators this project currently creates — one in `art/materials/env.js#EnvironmentCache` and one per call in `world/lighting/poi.js#buildPOIEnvironment` — do not corrupt each other. They do each hold a ~6.3 MB ping-pong target. Collapse to one anyway.
- With the field in `scene.environment`, `envMapIntensity` on the hull variants (`materials/index.js:94–109`, currently 0.30–0.85, with canopy glass at 2.2) is now sampling a *coloured* environment rather than the near-black `ibl` gradient. Expect the hull to warm/cool toward the field. Re-measure the R3 hull/field hue separation after this lands, not before.

---

## 6. `DataTexture` vs `CanvasTexture` — and the D35 mechanism, generalised

D35 was not a one-off. **A 2D canvas backing store is premultiplied in every implementation**; `getImageData` un-premultiplies (dividing RGB by α), and WebGL un-premultiplies again on upload when `UNPACK_PREMULTIPLY_ALPHA_WEBGL` is false — which three leaves false. The round trip is `round(round(255·c·α)/α)`.

Consequences, which are different from "three channels lost":

- **α = 0 → RGB is destroyed.** This is exactly D35: the macro atlas had α = 0 over ~99% of texels.
- **α small but non-zero → RGB is quantised to steps of `1/(255α)`.** At α = 0.02 the RGB channels carry ~5 distinct values.

`nebula.js#sheetTexture` writes an α that is 0 over most of the tile and packs a *hot-core signal into G* (`img.data[o+1] = 150 + hot*105`) which the fragment shader then reads independently: `vec3 c = vColor * (0.55 + 0.45 * s.g) * s.a`. **That G channel is quantised to a handful of levels everywhere the sheet is faint, and undefined where α = 0.** It is not catastrophic the way D35 was — the shader multiplies by `s.a` anyway, so where G is worst the contribution is smallest — but the two-tone core/edge that lines 78–84 exist to produce is not surviving intact. Same mechanism, same file family, not yet fixed.

**The rule, stated so it is testable:** *if RGB and A carry independent signals, it must be a `DataTexture`. `CanvasTexture` is only safe when α is 255 everywhere, or when RGB is meaningless where α is small.* `softPointTexture` and `glowTexture` (`common.js:187, 225`) write RGB = 255 with varying α and are in the second category — they are fine, and should carry a comment saying why.

Defaults differ and both sets are wrong for somebody:

| | `CanvasTexture` | `DataTexture` |
|---|---|---|
| `flipY` | **true** (inherits `Texture`) | **false** (`DataTexture.js:71`) |
| `magFilter` / `minFilter` | `LinearFilter` / `LinearMipmapLinearFilter` | **`NearestFilter` / `NearestFilter`** (constructor defaults) |
| `generateMipmaps` | `true` | **`false`** (`DataTexture.js:60`) |
| `unpackAlignment` | 4 | **1** (`DataTexture.js:81`) |
| `needsUpdate` | set true in ctor | you must set it |
| premultiply hazard | **yes** | **no** — bytes go to the driver untouched |
| half/float storage | impossible | **yes** — this is the only path to an HDR CPU-side texture |

`art/materials/env.js` already does this correctly (`Uint16Array` + `THREE.DataUtils.toHalfFloat` + `HalfFloatType` + explicit `LinearFilter`). That file is the template; `celestials/*` should follow it.

---

## 7. Colour space and HDR format

Three rules, and the project is currently 2-for-3.

1. **A texture that holds *colour* is `SRGBColorSpace`. A texture that holds *data or radiance* is `NoColorSpace`/`LinearSRGBColorSpace`.** three's own manual: sRGB for `.map`/`.emissiveMap`; `LinearSRGBColorSpace` for HDR sources which "may contain values in the open domain [0,∞]". The celestial sheets are correctly `NoColorSpace` — they are masks. The **baked cube must be `LinearSRGBColorSpace`, not `SRGBColorSpace`**: tagging it sRGB makes three apply an sRGB→linear decode to values that were never encoded, crushing the whole field into the toe, *and* flips `boxMesh.material.toneMapped` to false (§2a).

2. **Palette hexes are decoded, once, at build time.** `common.js#col` does `setHex(hex, SRGBColorSpace)` — correct. Note the one deliberate exception, `postfx.js#setColorGrade`, which decodes hexes to *raw 0–1 sRGB components* precisely because the Grade pass runs after `OutputPass` on display-encoded pixels. That comment is right and should not be "fixed".

3. **Format for the bake: `HalfFloatType`.** The field's linear range is 0.002–0.35, entirely below 1.0. Stored as `UnsignedByteType` *linear*, 0.002 is code 0.5/255 — it quantises to nothing. Stored as `UnsignedByteType` *sRGB-tagged*, you get ~2.4× more codes in the toe and could get away with it (25 MB at 1024, 6.3 MB at 512) **but only because the star stays live geometry** — the star's `coreGain: 30` and `haloGain: 2.0` would clip instantly if baked into 8-bit. Half-float is 2× the memory and removes the entire class of question. At 512/face that is 12.6 MB, against a current `info.memory.textures` of 150 objects. Take the half-float.

`RGBA32F` is not worth considering: 2× the memory of half-float, and `OES_texture_float_linear` is not universal, so you would lose bilinear filtering on the one texture that is always magnified.

---

## 8. Dithering — the sky *is* the banding case, and the current dither is not sized for it

`postfx.js#GradeShader` already has a 4×4 ordered Bayer at `col += bayer(gl_FragCoord.xy) * (dither/255.0)` with `bayer` returning `v/16 − 0.5`, i.e. **amplitude ±0.5 LSB**. Placement is right — after `OutputPass`, immediately before the 8-bit write, which is what Gjøl's *Banding in Games: A Noisy Rant* asks for (dither in the space you are quantising into). Three problems for a full-frame sky gradient:

1. **±0.5 LSB uniform is under-amplitude.** Gjøl's recommendation is ~**1 LSB triangular (TPDF)**; ±0.5 uniform leaves residual contouring on very smooth ramps. Concretely: `giant-orbit`'s dome runs blue from 8-bit **39 to 143** across the sky — 104 steps over ~2560 px, i.e. **one visible step every ~25 px**, on the largest smooth gradient in the frame.
2. **A 4×4 Bayer has 16 levels and a 4-pixel period.** On a gradient this smooth the cross-hatch is legible, and the `for (int i=0;i<16;i++) if (i==idx)` lookup is 16 iterations per pixel to read a constant.
3. **`SMAAPass` runs *after* the dither** (`postfx.js:284`). SMAA's default luma edge threshold is well above 1/255 so it will not *detect* the dither as edges, but running an edge filter over your dither is the wrong order and will partially average it wherever a real edge coincides.

**Fix, three lines, no new passes.** Replace the Bayer with interleaved gradient noise (Jimenez, *Next Generation Post Processing in Call of Duty: Advanced Warfare*), made triangular by differencing two offset taps:

```glsl
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// TPDF: two independent uniforms differenced -> triangular in [-1, 1]
float t = ign(gl_FragCoord.xy) - ign(gl_FragCoord.xy + vec2(17.0, 23.0));
col += t * (dither / 255.0);
```

IGN is aperiodic (no 4-px lattice), costs two `fract`s and a `dot` instead of a 16-iteration loop, and the differenced form gives the ±1 LSB triangular distribution the reference asks for. Then move `this.smaa` **before** `this.grade` in the pass list, so the last thing touching the pixels is the quantiser's own noise.

Independently: **the HDR composer target already is half-float** (`postfx.js:220–226`), so there is no banding *inside* the chain. All of this is about the single final 8-bit write, which is exactly where it should be.

---

## 9. What has to change, file by file

**`src/world/celestials/nebula.js`** — the sheet generator is the root cause (§1b).
- The radial falloff `smoothstep(1.02, 0.18, rr)` costs the median 87% *before* the threshold is applied. Either move the threshold below the post-falloff median (0.06, not 0.38–0.50) or move the falloff after the threshold.
- `pow(a, 1 + sharpness*3)` = `pow(a, 2.26)` on a field whose 99th percentile is 0.66 crushes what survives. `sharpness` wants to be ≤0.15 or the exponent wants to apply to the *core* only.
- Move the hot-core signal out of the G channel of a `CanvasTexture` (§6). Either build the sheet as a `DataTexture` or derive the core term from `s.a` in the shader, which costs nothing and is immune.
- Once the sheets are baked (§4) the *number* of layers stops being a budget item — 40 sheets with a proper alpha distribution costs the same as 3.

**`src/world/celestials/skydome.js`** — keep the idea, retarget the numbers.
- Solve `gain`/`baseGain` against §1a's table (scene-linear ≥0.0245 for R1's median) instead of authoring per POI. Graveyard is currently 24× over that (`0.274` vs `0.0245`).
- `saturate(hex, 1.45)` clips blue to zero (§1c). Cap `saturate` amount at ~1.25 on already-chromatic hues, or add a hue-preserving clamp to `palette.js#saturate`.
- Once §4 lands, this file's *output* becomes bake input and its mesh leaves the frame budget entirely. Do not delete it — it is the cheapest way to author the floor.

**`src/world/celestials/index.js`** — add the bake step to `buildCelestials`, split `parts` into "baked" and "live", set `far.background` to the cube instead of `new THREE.Color()`. Note the current line `far.background = new THREE.Color().setHex(spec.background ?? NEUTRAL.spaceBlack, SRGBColorSpace)` with `background: 0x000000` at graveyard and near-star: **that is a literal black clear under everything**, and it is the R1 floor until the cube replaces it.

**`src/render/renderer.js`** — needs one thing: a hook the celestial stream can call at boot that borrows `this.renderer` safely. `autoClear = false` (line 39) and `info.autoReset = false` (line 40) are both invisible landmines for `CubeCamera.update()` (§4). Add:
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
This is a `src/render/**` change and belongs to Lighting & post, not to celestials — propose it, don't make it unilaterally.

**`src/render/postfx.js`** — the dither swap and the SMAA/Grade reorder (§8). Also worth knowing: the `farPass` is `RenderPass(far, farCamera)` with `clear:true, clearDepth:false`. `RenderPass.render()` sets `renderer.autoClear = false` locally and calls `renderer.clear(...)` explicitly, then `renderer.render()`; `WebGLBackground.render()` will *additionally* force a clear when the background is a `Color` (`forceClear = true`). With a `CubeTexture` background there is no second clear and none is needed — the box covers every pixel with `depthTest:false`.

**`src/world/lighting/poi.js`** — delete `envSky`/`envGiant`/`envSun`/`envNebula` and the whole invented IBL scene (§5); feed `buildPOIEnvironment` from the baked cube via `pmrem.fromCubemap`. This removes 4 shader materials, 4 geometries and a second `PMREMGenerator`, and it is the only way `poi.js:94–99`'s own stated requirement is actually met.

**`src/art/materials/env.js`** — `EnvironmentCache` becomes the *fallback* path only (used when no POI sky has been baked yet, e.g. isolated probes). It is already correct code; it just should not be what the game uses.

---

## 10. What I did not verify

- **The §1c dome numbers are analytic**, not captured. I transcribed three's ACES exactly and used the shipped constants, but I did not run `npm run capture` — no frames were rendered during this pass. The *relative* 11× spread between POIs is robust; the absolute display luma could move under vignette (0.38–0.52 by POI) and bloom.
- **I did not measure the bake's wall-clock cost.** The only external number I have is 4096/face in "slightly more than a second" on a GTX 1070 Ti for a full procedural nebula shader, which scales to low-single-digit ms at 512/face for content this simple — but that is inference, not measurement.
- **The G-channel quantisation in `sheetTexture` is a mechanism, not a measurement.** D35 measured the α=0 case in a real browser; I did not re-run `tools/maps.mjs`-style instrumentation for the small-α case.
- **`npm run bench` currently FAILS at 499 draws against the 320 ceiling** (`docs/review/benchmark.md`) and the file says it has not been re-measured since the round-two surface pass. The −9 far-scene draws from §4 do not fix that; nothing in this report is a draw-call remedy.

---

## Sources

- [three.js — `WebGLBackground.js` (r185, `node_modules/three/src/renderers/webgl/WebGLBackground.js`)](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLBackground.js) — `addToRenderList`, `boxMesh` / `planeMesh`, `toneMapped = getTransfer(colorSpace) !== SRGBTransfer`, `renderList.unshift`
- [three.js — `WebGLRenderer.js` lines 2342 / 2349](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js) — render-target output colour space and automatic `NoToneMapping` for non-XR render targets
- [three.js — `WebGLEnvironments.js`](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLEnvironments.js) — equirect backgrounds silently allocate `new WebGLCubeRenderTarget(image.height)`
- [three.js — `CubeCamera.js` `update()`](https://github.com/mrdoob/three.js/blob/dev/src/cameras/CubeCamera.js) — six `renderer.render()` calls, reliance on `autoClear`, mipmap deferral to the sixth face
- [three.js — `WebGLCubeRenderTarget` docs](https://threejs.org/docs/api/en/renderers/WebGLCubeRenderTarget.html) and [`fromEquirectangularTexture`](https://threejs.org/docs/#api/en/renderers/WebGLCubeRenderTarget.fromEquirectangularTexture) — `isRenderTargetTexture` and the px/nx handedness note
- [three.js — `PMREMGenerator` docs](https://threejs.org/docs/pages/PMREMGenerator.html) — `fromScene(scene, sigma=0, near=0.1, far=100, {size=256})`, ideal input sizes 1024×512 equirect / 256×256 cube, minimums 64×32 / 16×16
- [three.js — `PMREMGenerator.js` source](https://github.com/mrdoob/three.js/blob/dev/src/extras/PMREMGenerator.js) — `_allocateTargets` (HalfFloat, `3×max(cubeSize,112)` × `4×cubeSize`, LinearSRGB), `_sceneToCubeUV` (`NoToneMapping`, `_backgroundBox` clear), instance-scoped `_dispose`
- [three.js — `Scene` docs](https://threejs.org/docs/pages/Scene.html) — `background`, `backgroundBlurriness`, `backgroundIntensity`, `backgroundRotation`, `environment`, `environmentIntensity`, `environmentRotation`
- [three.js — Color Management manual](https://threejs.org/manual/en/color-management.html) — sRGB for colour maps, `LinearSRGBColorSpace` for HDR/open-domain data
- [three.js — Backgrounds and Skyboxes manual](https://threejs.org/manual/en/backgrounds.html) — cube vs equirect vs mesh, and the note that only three.js-drawn backgrounds are affected by post-processing
- [three.js — `webgl_shaders_sky` example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_shaders_sky.html) — `WebGLCubeRenderTarget(256, {type: HalfFloatType})` + `CubeCamera(1, 1000, rt)` + `cubeCamera.update(renderer, scene)`
- [wwwtyro/space-3d](https://github.com/wwwtyro/space-3d) and the [live tool](https://tools.wwwtyro.net/space-3d/index.html) — seeded procedural star/nebula sky baked once into a cubemap via a framebuffer; 1024/face default
- [matusnovak/space-3d](https://github.com/matusnovak/space-3d) — C++/OpenGL port; 4096×4096 cubemap bake in "slightly more than a second" on a GTX 1070 Ti
- [Homeworld 2 — Backgrounds Tech, Simon Schreibt](https://simonschreibt.de/gat/homeworld-2-backgrounds-tech/) and [Backgrounds](https://simonschreibt.de/gat/homeworld-2-backgrounds/) — backgrounds are tessellated spheres with vertex colours, built from a 1024×512 24-bit source; "1 vertex needs a position (XYZ) *and* a vertex colour (RGB)"
- [r-lyeh/img2sky](https://github.com/r-lyeh-archived/img2sky) — vertex-colour mesh skybox builder "as seen in Homeworld 2 .HOD files"
- [CCP — Introducing New Nebulae into EVE](https://www.eveonline.com/article/introducing-new-nebulae-into-eve/) — 30 → 68 nebula backdrops, resolution doubled (pixel count quadrupled), seams removed by the higher-resolution cubemap; "most ships in EVE reflect the nebula of the area of space they are in"
- [Mikkel Gjøl (Playdead) — *Banding in Games: A Noisy Rant*](https://loopit.dk/banding_in_games.pdf) — ~1 LSB dither amplitude, triangular-distribution noise preferred, dither at the point of quantisation
- [Jorge Jimenez — *Next Generation Post Processing in Call of Duty: Advanced Warfare* (SIGGRAPH 2014)](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/) — interleaved gradient noise, `magic = float3(0.06711056, 0.00583715, 52.9829189)`
- [frost.kiwi — *How to (and how not to) fix color banding*](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/) — the IGN one-liner and the `(1/255)·ign − (0.5/255)` offset that preserves mean brightness
- [WHATWG HTML issue #5365 — ImageData alpha premultiplication](https://github.com/whatwg/html/issues/5365) — canvas backing stores are premultiplied; `getImageData` after `putImageData` need not return what was written
- [WebGL Specification — `UNPACK_PREMULTIPLY_ALPHA_WEBGL`](https://registry.khronos.org/webgl/specs/latest/1.0/) and [WebGL2 Fundamentals — WebGL2 and Alpha](https://webgl2fundamentals.org/webgl/lessons/webgl-and-alpha.html) — canvas→texture un-premultiplication is lossy