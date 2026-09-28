# Research report: renderer, tilt-shift, 2.5D ships, AI art pipeline and simulation for a browser space autobattler (as of 2026-09-28)

**How this was checked:**
- Library versions and dates come from the npm registry.
- Browser support comes from caniuse data (updated 2026-09-28) and MDN browser-compat-data 8.1.3 (2026-09-24).
- I measured bundle sizes myself: esbuild, minified plus gzip -9, on minimal test scenes.
- Items marked **UNVERIFIED** are secondary-source claims or my own design judgment.
- Vendor or SEO blogs (utsubo, cinevva, sprite-ai, terms.law and similar) are lower reliability and are flagged where used.

---

## 1. Renderer choice

### WebGPU browser support, Sept 2026

| Browser | Status | Source |
|---|---|---|
| Chrome / Edge desktop | Win/macOS/ChromeOS since 113. Linux since 144 only on Intel Gen12+; wiki says NVIDIA on Wayland 147+; other Linux GPUs behind a flag. Windows ARM64 behind a flag. | [gpuweb wiki, edited 2026-08-13](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status), [Chrome 144 blog](https://developer.chrome.com/blog/new-in-webgpu-144) |
| Chrome Android | 121+ (ARM/Qualcomm), 139+ (Imagination). Samsung Xclipse expected in 154. | gpuweb wiki |
| Firefox | Windows 141 (July 2025). macOS Apple Silicon 145+. Linux only in Nightly, "expected 2026". Android behind a flag. The wiki also says "macOS other 147+", but caniuse note 8 says only Windows and macOS 26+ on Apple Silicon are enabled by default. | gpuweb wiki, [Mozilla gfx blog, 2025-07-15](https://mozillagfx.wordpress.com/2025/07/15/shipping-webgpu-on-windows-in-firefox-141/) |
| Safari | 26 on macOS Tahoe 26, iOS/iPadOS 26 and visionOS 26. caniuse marks desktop Safari "partial" because it is only on by default on macOS 26+. | caniuse, gpuweb wiki |
| Global | WebGPU: 85.72% full + 3.05% partial. WebGL2: 96.44%. | caniuse feature data (Fyrd/caniuse) |

**Device bugs still happen.** PlayCanvas forces WebGL2 on the Pixel 10 (PowerVR) because compute fails in Chrome there ([playcanvas#8874](https://github.com/playcanvas/engine/issues/8874), opened 2026-06-11, still open).

**Conclusion:** a WebGL2 fallback is still required for roughly 11–14% of users.

### Engines

**three.js**
- Latest is r186 (0.186.1, 2026-09-24). Releases come every 2–3 months: r183 Feb, r184 Apr, r185 Jun/Jul, r186 Sep 2026.
- `WebGPURenderer` uses WebGPU and falls back to a WebGL 2 backend automatically; `forceWebGL` forces WebGL ([docs](https://threejs.org/docs/pages/WebGPURenderer.html)).
- TSL shaders compile to WGSL or GLSL depending on the backend.
- **Post-processing** is node-based through `RenderPipeline`. It was called `PostProcessing` until r183, per [utsubo, Sept 2026, vendor blog](https://www.utsubo.com/blog/threejs-2026-what-changed); my build confirms the `RenderPipeline` export exists.
  - I confirmed these r186 display nodes in the package: `DepthOfFieldNode` (bokeh), `BloomNode`, `FilmNode` (grain), `ChromaticAberrationNode`, `RGBShiftNode`, `GaussianBlurNode`, `hashBlur`, `boxBlur`, `Lut3DNode`, `SMAA`/`FXAA`/`TRAA`, `MotionBlur`, `LensflareNode`, `OutlineNode`, `SSAO`/`GTAO`/`SSGI`/`SSR`.
  - Relevant examples: `webgpu_postprocessing_dof_basic` (cheap box blur), `webgpu_postprocessing_dof`, `webgpu_postprocessing_ca`, `webgpu_postprocessing_bloom*`.
- **Instancing:** `InstancedMesh`, instanced sprites, and `BatchedMesh`. BatchedMesh draws different geometries in one draw call when they share a material, and supports per-instance matrix, colour and visibility ([docs](https://threejs.org/docs/pages/BatchedMesh.html)). The compute examples run 200k particles (`webgpu_compute_particles`) and 300k points (`webgpu_compute_points`).
- **Caveats:**
  - WebGPURenderer is much slower than WebGL when there are many *non-instanced* meshes. 20k meshes ran at 60 fps on WebGL and 15 fps on WebGPU ([#30560](https://github.com/mrdoob/three.js/issues/30560), Feb 2025, still open, high priority).
  - Material initialisation is 16–36x slower on WebGPU ([#33821](https://github.com/mrdoob/three.js/issues/33821), June 2026, open).
  - `pmndrs/postprocessing` runs only on `WebGLRenderer`; its WebGPU-capable v7 is still beta.
  - `ShaderMaterial` and `onBeforeCompile` reportedly don't work in WebGPURenderer (secondary sources, **UNVERIFIED**).
  - In r186, `PassNode.getViewZNode()` always uses `perspectiveDepthToViewZ` (I read the source). With an `OrthographicCamera` the `dof()` input would be wrong, so you would need your own orthographic viewZ.
  - The r185 `ClusteredLighting` (Forward+, up to 1024 point lights) is built on compute and storage buffers, so it is probably WebGPU-backend-only (**UNVERIFIED**).
- **Bundle (measured):**
  - WebGPURenderer + InstancedMesh + dof + bloom + film: 915 KB minified / **250 KB gz**.
  - WebGLRenderer + EffectComposer + BokehPass + UnrealBloom: 556 KB / **138 KB gz**.
- **Ecosystem:** 19.6M npm downloads/week.

**Babylon.js**
- 9.0 released 2026-03-26 ([MS blog](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)); latest is 9.28.0 (2026-09-24).
- WebGPU has been supported since 5.0 (May 2022), and core shaders were rewritten in WGSL in 2024.
- The status docs say the port is "complete" and nearly every feature works on both WebGPU and WebGL ([docs markdown](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUStatus.md)). Exceptions are point size ≠ 1, triangle fans and WebGPU-XR.
- 9.0 adds Frame Graph v1, clustered lighting on WebGPU and WebGL2, and a node particle editor.
- `DefaultRenderingPipeline` includes bloom, DOF, chromatic aberration, grain, sharpen and image processing (curves, grading, vignette) ([typedoc](https://doc.babylonjs.com/typedoc/classes/BABYLON.DefaultRenderingPipeline)). Thin instances and SpriteManager are also available.
- **Bundle (measured, tree-shaken):** WebGPUEngine + Engine + Scene + thin instances + DefaultRenderingPipeline is 1.98 MB / **456 KB gz**. The full UMD build is 1.85 MB gz.
- 425k npm downloads/week.

**PixiJS v8**
- Latest 8.21.0 (2026-09-17).
- The WebGPU renderer is "feature complete" but the official docs label it **Experimental** and recommend WebGL for production. The default preference switched to WebGL in 8.1 ([renderers guide](https://pixijs.com/8.x/guides/components/renderers)).
- The PixiJS blog claims ParticleContainer draws 1,000,000 particles at 60 fps and plain Sprites 200,000 at 60 fps ([blog](https://pixijs.com/blog/particlecontainer-v8); hardware not stated).
- It is 2D only: no depth buffer and no built-in normal-map lighting (I checked the typings). `PerspectiveMesh` does exist.
- `pixi-filters` 6.1.5 (2025-11-29) has `TiltShiftFilter` (a gradient blur between two points, ported from glfx.js), AdvancedBloom, RGBSplit (chromatic aberration), OldFilm (grain), CRT, KawaseBlur, Godray and Shockwave.
- **Bundle (measured):** Application + ParticleContainer + BlurFilter is 542 KB / **156 KB gz**.
- 1.24M npm downloads/week. It can share a WebGL context with three.js ([8.7 blog, Jan 2025](https://pixijs.com/blog/8.7.0)).

**PlayCanvas**
- Latest 2.22.6 (2026-09-28). The README says it is "built on WebGL2 and WebGPU", and `createGraphicsDevice` takes a `deviceTypes` fallback list.
- `CameraFrame` provides HDR bloom, SSAO, DOF, TAA, grading/LUT, vignette and fringing (chromatic aberration) ([docs](https://developer.playcanvas.com/user-manual/graphics/posteffects/)). Film grain is not listed (**UNVERIFIED**).
- **Bundle (measured):** 1.31 MB / **342 KB gz**.
- 116k npm downloads/week. Its strength is the cloud editor, which is of little use to a code-first team.

**Raw WebGPU**
- No fallback, so about 86% reach, and you would write batching, post-processing and tooling yourself.
- WGSL float rules: division is accurate to 2.5 ULP, transcendentals are only error-bounded, `fma` may not fuse, and some subnormals may flush to zero ([WGSL CRD, 2026-09-21](https://www.w3.org/TR/WGSL/)).

### Recommendation: three.js r186+ with `WebGPURenderer`, TSL and `RenderPipeline`
- **Confidence: moderate-high.**
- **Why:**
  - It is the only option with all three of: automatic WebGL2 fallback from a single TSL shader codebase, every post-process this look needs as first-party nodes, and real 3D depth for depth of field.
  - It is also the largest ecosystem.
- **Build rules:**
  - Architect for a small number of draw calls (InstancedMesh / BatchedMesh / instanced quads), because of #30560.
  - Test both backends in CI.
- **Alternatives:**
  - **Babylon.js** if you want the most complete out-of-the-box WebGPU and post-processing package. Moderate; it costs about 2x the bundle.
  - **PixiJS** only if the game stays strictly 2D sprites. You lose depth and lighting, and its WebGPU is officially experimental.

---

## 2. Tilt-shift technique

**The perceptual science supports a simple gradient blur for this game.** Held, Cooper, O'Brien & Banks, "Using Blur to Affect Perceived Distance and Size", ACM TOG 29(2), March 2010 ([PubMed abstract](https://pubmed.ncbi.nlm.nih.gov/21552429); full text PMC3088122; old but foundational). From the full text:
- "linear blur gradients do in fact yield close approximations of tilt-and-shift blur, provided that the scenes are roughly planar".
- "linear gradients and consistent blur were similarly effective at modulating perceived distance and size".
- Blur only works when it follows the distance gradient: a vertical gradient aligned with depth works, a horizontal one does not.
- A space battle on a plane is exactly the "roughly planar" case, so a screen-space vertical gradient is valid. Depth-based blur only matters for things with height (large hulls, debris thrown upward).

**Other cues that sell the miniature** ([Wikipedia: Miniature faking](https://en.wikipedia.org/wiki/Miniature_faking)): a high camera angle, more contrast, "darker, harder shadows", more saturation, and faster-than-real motion. For the game, that last one means a faster default battle speed.

**Implementation options, cheapest first:**
1. **Screen-space gradient blur, no depth.**
   - three.js has `HorizontalTiltShiftShader`/`VerticalTiltShiftShader` (a two-pass Gaussian modulated by screen y; WebGLRenderer only).
   - pixi-filters has `TiltShiftFilter`.
   - For Unity URP there is [Noveltech](https://www.noveltech.dev/tilt-shift-unity).
   - Works with an orthographic camera; it is wrong only for tall objects.
2. **Cheap depth-based blur.** three.js `webgpu_postprocessing_dof_basic` ("Performant Depth-of-Field effect with a simple box blur") mixes sharp and blurred images by `smoothstep(minDistance, maxDistance, |viewZ − focusZ|)`. The Godot [depth-based tilt-shift](https://godotshaders.com/shader/depth-based-tilt-shift/) (Dec 2023) does the same with a world-space focal band and a `vertical_bias` that tilts the focal plane.
3. **Bokeh DOF.** three.js `dof(color, viewZ, focusDistance, focalLength, bokehScale)`, based on the Doom 2016 and Pixel Mischief techniques. Using a *signed* circle of confusion (blur size) separates near blur from far blur and reads less flat ([taku25, Oct 2025, UE/HLSL](https://dev.to/taku25/unpacking-the-math-building-a-custom-miniature-style-dof-in-ue-with-hlsl-2118)).

**Examples:**
- [Codrops, Oct 2024 (Choffel)](https://tympanus.net/codrops/2024/10/30/interactive-3d-with-three-js-batchedmesh-and-webgpurenderer/): WebGPURenderer + BatchedMesh + TSL `dof` + AO + FXAA + vignette, with auto-focus lerped to 0.85 × camera distance.
- [Animal Crossing tilt-shift CodePen](https://codepen.io/mjurczyk/pen/LYNqzxa) (BokehShader, older).
- [tiltshift-in-html.ybouane.com](https://tiltshift-in-html.ybouane.com/) (technical details not retrievable).

**Camera:**
- On the [three.js forum (July 2022)](https://discourse.threejs.org/t/how-to-have-a-tilt-shift-effect-on-a-3d-scene/40606) the advice was DOF plus a "near-orthographic field-of-view perspective" plus a saturation pass.
- Over a flat plane, depth tracks screen y for both ortho and perspective cameras, so the approaches converge.
- If you use ortho in three.js, supply your own viewZ (see the pitfall in section 1).
- **UNVERIFIED design suggestion:** perspective FOV about 15–30°, pitched about 50–65° below horizontal; a sharp band covering the middle 30–40% of the screen; then saturation +10–20%, a contrast S-curve or LUT, light grain, slight chromatic aberration and a vignette.

---

## 3. 2.5D ships from generated art

**Sprites plus normal maps (the GSB2 approach).**
- [GSB2 lighting, 2014-02-19 (old)](https://www.positech.co.uk/cliffsblog/2014/02/19/gratuitous-space-battles-2-lighting/): ship sprites plus normal, specular and lightmaps, composited through render targets.
- Known problems: normals become unreliable on scaled alpha edges, and normals must be rotated in the shader.
- GSB2 modding needs a sprite plus a normal map per component, and the guides assume a 3D program ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=424475587)).
- [Cosmoteer part visuals](https://cosmoteer.wiki.gg/wiki/Making_Cosmoteer-style_visuals): layered part sprites with normal maps, "a day of drawing per part", and automatic normal generation (ModLab) described as lower quality.
- In a 3D engine, a quad with a tangent-space normal map rotates its normals automatically. That is standard engine behaviour, not re-verified here.

**Normal-map generation tools:**
- [Laigter](https://github.com/azagaya/laigter) (GPL-3.0, guesses shape from brightness).
- [SpriteIlluminator](https://www.codeandweb.com/spriteilluminator) (paint-based).
- NormalMap-Online (MIT, from 2014).
- ML normal estimators: Marigold normals ([lcm-v0-1 is Apache-2.0](https://huggingface.co/prs-eth/marigold-normals-lcm-v0-1); v1-1 is OpenRAIL++-M) and Depth Anything V2 (Small is Apache-2.0; Base/Large are CC-BY-NC).
- A [vendor comparison, Aug 2026](https://www.sprite-ai.art/blog/normal-map-generators-compared) says brightness-based tools misread implied geometry. The vendor sells a competing tool.

**Sprite stacking** (voxel slices drawn with offsets; [overview](https://thepixelnaut.com/articles/sprite-stacking-tutorial-create-3d-magic-from-2d-pixel-art/)) is tied to a pixel or voxel look, and cost scales with slice count. It is a poor fit for a dark, non-pixel style.

**Low-poly 3D rendered through a low-FOV camera** gives real silhouettes and parallax under tilt, real depth for DOF and real lighting. BatchedMesh lets every module on every ship share one draw call per material.

**Procedural composition references:**
- [Rahix, 2015 (old)](https://blog.rahix.de/004-spaceships/): mountpoint-based, seeded.
- [proceduro/spaceship-2d](https://github.com/proceduro/spaceship-2d): outputs diffuse, normal, depth and position sprites; Unlicense.
- [a1studmuffin SpaceshipGenerator](https://github.com/a1studmuffin/SpaceshipGenerator) (Blender, 2016, old).

**Best fit for a designer where installed modules must show** (moderate confidence; the design is my judgement):
- Put modules on a hull grid, like GSB2 and Cosmoteer.
- Build each module as a small **code-generated low-poly mesh** (extrusions, bevels, greebles, emissive strips) textured from a shared, AI-generated tileable panel/trim atlas.
- Render all modules through a few BatchedMesh or InstancedMesh draws.
- Draw fighters, missiles, bolts and debris as instanced quads or tiny meshes.
- As a far-zoom level of detail, or a Pixi-compatible fallback, bake each ship design once into albedo, normal and emissive atlas regions (the GSB2 method) and draw it as one quad.

---

## 4. AI and procedural art pipeline, 2026

**Image models:**
- **OpenAI GPT Image 2** (snapshot `gpt-image-2-2026-04-21`). Transparent-background output entered preview on 2026-08-20. Users report alpha values of 253–254 instead of 255 and a grey halo around subjects ([forum](https://community.openai.com/t/transparent-backgrounds-are-now-available-in-preview-for-gpt-image-2-in-the-api/1391541)).
- **Google Nano Banana 2** (`gemini-3.1-flash-image`, 2026-02-26):
  - up to 14 reference images (up to 10 objects and 4 characters);
  - output from 512 px to 4K.
- **Nano Banana Pro** (`gemini-3-pro-image`): 6 object, 5 character and 3 **style** references.
- All Gemini image models add a SynthID watermark ([docs](https://ai.google.dev/gemini-api/docs/image-generation), [TechCrunch](https://techcrunch.com/2026/02/26/google-launches-nano-banana-2-model-with-faster-image-generation/)).
- **FLUX.2** (2025-11-25) accepts up to 10 reference images.
  - **klein 4B** (2026-01-16) is **Apache-2.0**, runs in about 13 GB of VRAM, and supports multi-reference editing and hex colour control ([HF](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B), [VentureBeat](https://venturebeat.com/technology/black-forest-labs-launches-open-source-flux-2-klein-to-generate-ai-images-in)).
  - klein 9B and dev 32B use a non-commercial *model* licence. The licence text still says "You may use Output for any purpose (including for commercial purposes)", bans training a competing model on outputs, and requires content filtering or review ([licence](https://raw.githubusercontent.com/black-forest-labs/flux2/main/model_licenses/LICENSE-FLUX-DEV)).
- **Scenario** trains custom models from about 10 images on Flux 2, Z-Image, Qwen Image, Flux 1 Dev or Kontext. It offers style, character and *seamless texture* models ([page](https://www.scenario.com/features/train)). Its output ownership terms are **UNVERIFIED**.

**Commercial use terms:**
- OpenAI assigns its output rights "if any" ([terms](https://openai.com/policies/row-terms-of-use/)).
- Google does not claim ownership but may generate similar content for others; on the free tier your data is used for training ([terms](https://ai.google.dev/gemini-api/terms)).
- Midjourney paid plans own their assets, but companies with more than $1M revenue need Pro or Mega ([ToS](https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service)).

**Legal and platform constraints:**
- The US Copyright Office Part 2 report (2025-01-29) says prompts alone are not enough for human authorship, so purely AI-generated assets are likely not copyrightable ([report](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)).
- Steam revised its AI disclosure on 2026-01-16. Pre-generated content that players see must be disclosed; developer tools are exempt ([PC Gamer](https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/)).
- Genre precedent: Positech's *Ridiculous Space Battles* (the GSB successor; on Steam 2026-11-16) discloses that about 5% of its art is AI-generated, covering backgrounds and **ship module designs** ([Steam](https://store.steampowered.com/app/3607230/Ridiculous_Space_Battles/)).

**Keeping one style across hundreds of assets** (combining sources; approach is moderate confidence):
- Train a style LoRA or Scenario model on 10–50 curated seed images, or pass a fixed reference set every time (FLUX.2, Nano Banana).
- Use a locked prompt template: "top-down orthographic, centred, flat background".
- Normalise the palette in post, then let the in-engine LUT unify everything.

**Tileable output:**
- [ComfyUI seamless nodes](https://www.runcomfy.com/comfyui-nodes/ComfyUI-seamless-tiling): circular padding only works on convolutional models (SD1.5/SDXL); DiT models like Flux need latent rolling, e.g. Universal Seamless Tiles.
- [Tiled Diffusion (CVPR 2025)](https://madaror.github.io/tiled-diffusion.github.io/).
- The closed APIs have no native tiling option (**UNVERIFIED**); use offset plus inpaint instead.

**Text-to-3D, if you want module meshes:**
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2): MIT licence, 4B parameters, PBR output, needs an NVIDIA GPU with 24 GB or more.
- Hunyuan3D's licence excludes the EU, UK and South Korea ([LICENSE](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE)).
- Meshy: free tier is CC BY 4.0; paid tiers "you own all assets" ([pricing](https://www.meshy.ai/pricing)).
- Tripo: free tier is non-commercial (secondary sources).

**Procedural art:**
- Domain-warped fBm for nebulae ([Inigo Quilez](https://iquilezles.org/articles/warp/), classic).
- [marian42/starfield](https://github.com/marian42/starfield).
- [procedural-stars-threejs](https://github.com/CK42BB/procedural-stars-threejs) (WebGPU compute with WebGL2 fallback; date unknown).
- UI is best built procedurally in SVG/CSS (my judgement).

---

## 5. Simulation architecture

**Loop and replays:**
- Use a fixed timestep with an accumulator, and interpolate rendering between the previous and current state ([Fiedler, 2004, old but canonical](https://gafferongames.com/post/fix_your_timestep/)).
- A replay or challenge is just seed + inputs ([Gaffer lockstep, 2014](https://gafferongames.com/post/deterministic_lockstep/)).
- **Shipped precedent:** [OpenFront.io](https://github.com/openfrontio/OpenFrontIO) (TypeScript, AGPL). Its deterministic core lives in `src/core` and runs in a Web Worker (`src/core/worker/Worker.worker.ts`, confirmed). Replaying requires "the same commit". So stamp every replay or challenge file with a sim version hash.

**JavaScript float determinism:**
- ECMA-262 does not precisely specify acos, acosh, asin, asinh, atan, atanh, atan2, cbrt, cos, cosh, exp, expm1, hypot, log*, pow, random, sin, sinh, tan or tanh ([spec](https://tc39.es/ecma262/)).
- `+ − × ÷` and `sqrt` are exact IEEE operations.
- Engines really do diverge:
  - Chrome 148 (V8 14.8.57) moved `Math.tanh` to the platform library, so results now differ by OS ([scrapfly, 2026-07-12](https://scrapfly.dev/posts/browser-math-os-fingerprint/)).
  - Firefox moved sin/cos/tan to fdlibm ([intent, 2021](https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI/m/eEhjM9VsAgAJ)).
  - `Math.pow` and `tanh` changed between Node versions ([macwright, 2020](https://macwright.com/2020/02/14/math-keeps-changing.html)).
- **Rule:** in the sim use only basic operations and sqrt. Use your own trig (lookup table or polynomial), a seeded PRNG, and no `Math.random`. Alternatively use integer or fixed-point maths (`|0`, `Math.imul`).

**WASM:** floats are deterministic except for NaN sign and payload. Relaxed-SIMD is non-deterministic ([spec numerics](https://webassembly.github.io/spec/core/exec/numerics.html)). [`@dimforge/rapier2d-deterministic`](https://www.npmjs.com/package/@dimforge/rapier2d-deterministic) (0.21.0, 2026-09-25) guarantees cross-platform determinism if you need physics.

**Never run gameplay on the GPU.** Given the WGSL accuracy rules in section 1, use GPU compute only for cosmetic debris and particles.

**Spatial partitioning:**
- Rebuild a uniform grid or dense spatial hash every tick: a count array plus a sorted index array filled with a counting sort ([Ten Minute Physics](https://matthias-research.github.io/pages/tenMinutePhysics/11-hashing.html)).
- Grids win for uniformly sized objects, but fail badly on high-aspect-ratio boxes or clustered data ([0fps, 2015, old](https://0fps.net/2015/01/23/collision-detection-part-3-benchmarks/)).
- So insert capital ships by radius into several cells, or keep separate grids for fighters and capitals.
- Data layout matters more than algorithm ([dmurph.com, 2026-06-24, M4 Pro](https://www.dmurph.com/posts/2026/06/ecs_vs_oop_benchmark/ecs_vs_oop_benchmark.html)). Frame times for 15k erratic entities with sweep-and-prune:

  | Setup | Frame time |
  |---|---|
  | JS struct-of-arrays | 5.32 ms |
  | WASM | 2.14 ms |
  | bitECS | 9.69 ms |
  | OOP | 8.38 ms |

**Moving state from worker to renderer:**
- Structured-clone messages are fine up to about 10 KB per frame. Beyond that, use transferable ArrayBuffers, which cost nearly the same at any size ([Surma, 2019, old](https://surma.dev/things/is-postmessage-slow/)).
- SharedArrayBuffer needs HTTPS plus cross-origin isolation: COOP `same-origin` and COEP `require-corp` or `credentialless` ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)).
- `credentialless` is supported in Chrome 96 and Firefox 119 but **not Safari** (MDN compat data 8.1.3).
- itch.io has a "SharedArrayBuffer support" checkbox. It adds COOP, COEP `require-corp` and CORP headers and moves the game to html.itch.zone, which loses existing localStorage saves ([itch.io thread](https://itch.io/t/2025776/experimental-sharedarraybuffer-support)).
- GitHub Pages needs [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker), which costs a reload on first visit.
- **Advice:** make ping-pong transferable snapshots the baseline, so no isolation is needed; treat SharedArrayBuffer as optional.

---

## 6. Performance references

- **Ridiculous Space Battles** (native C++, [2025-05-18](https://www.positech.co.uk/cliffsblog/2025/05/18/optimising-ridiculous-space-battles/)): about 600 ships (20×20 grid, 25 per square) and 6,000–10,000 bullet and glow entries in the lightmap list. The bottlenecks were lightmap processing and O(n) list removal, fixed by caching iterators; it also uses sin/cos lookup tables.
- **Warzone 2100 Web Edition** ([2025-06-11](https://wz2100.net/news/journey-to-the-web-porting-warzone-2100-to-webassembly/)): Emscripten to WASM, WebGL2, instanced rendering, cascaded shadows; about a 60 MiB download.
- **Kiomet / Mk48.io**: Rust to WASM with WebGL, AGPL ([Softbear](https://github.com/SoftbearStudios)).
- **Vampire Survivors**: built on Phaser (JavaScript) before v1.6, then Unity ([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)).
- **Engine benchmarks**: the PixiJS 1M-particle and 200k-sprite claims, and the three.js WebGPU compute examples at 200k–300k.
- I found no public browser space-battle demo with 1000s of ships and published numbers.

---

## Recommended stack

| Layer | Choice | Confidence |
|---|---|---|
| Renderer | three.js r186+ `WebGPURenderer` with automatic WebGL2 fallback. TSL shaders. Everything through InstancedMesh / BatchedMesh / instanced quads. No per-object meshes. | Moderate-high |
| Post | `RenderPipeline`: depth-weighted box/Gaussian tilt-shift (the `dof_basic` pattern; bokeh `dof()` as a quality option) → bloom → LUT, saturation and contrast → film grain → light chromatic aberration → vignette. | Moderate-high |
| Camera | Perspective, low FOV, pitched toward top-down; focus plane on the battle plane; faster default battle speed. Exact angles are UNVERIFIED and need tuning. | Moderate |
| Ships | Module-grid designer. Modules are code-generated low-poly meshes with a shared AI-generated tileable trim and panel atlas plus emissive. Baked sprite + normal + emissive per design as far LOD. Additive "lightmap" pass for explosion light, like GSB2, because clustered lights may be WebGPU-only. | Moderate |
| Art pipeline | FLUX.2 klein 4B (Apache-2.0) locally with a style LoRA, or Nano Banana 2 / GPT Image 2 with a fixed reference set. ComfyUI seamless nodes for tiles. Shader-based nebula and starfields. Record provenance for the Steam disclosure. | Moderate-low (market moves monthly) |
| Simulation | TypeScript struct-of-arrays in a dedicated Worker, fixed tick. Seeded PRNG and custom trig, or fixed-point. Per-tick grid or spatial-hash rebuild. Transferable snapshots with render interpolation. Replay/challenge file = {simVersionHash, seed, fleets}. WASM (Rust or AssemblyScript) optional later for about 2.5x. | High (architecture), moderate (float strategy) |
| Hosting | No COOP/COEP needed by default. Enable SharedArrayBuffer (itch.io checkbox or your own headers) only if profiling demands it. | High |
