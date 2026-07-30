# How shipped space games actually build their backgrounds

Research brief for Nadir Point. Every technique is tagged against **ARCHITECTURE.md non-negotiable 5 (no image files)**.

Local files read: `/Users/blake/Development/Nadir Point/ARCHITECTURE.md`, `/Users/blake/Development/Nadir Point/docs/design/reference-frames.md`, `/Users/blake/Development/Nadir Point/src/world/celestials/{index,nebula,starfield,skydome,common}.js`, `/Users/blake/Development/Nadir Point/src/render/postfx.js`, `/Users/blake/Development/Nadir Point/node_modules/three/src/extras/PMREMGenerator.js`.

---

## 0. The headline, stated first

**The single most relevant reference we have — Homeworld — does not use a texture for its background at all.** It uses an untextured, unlit, vertex-coloured triangle mesh on a sphere, plus a handful of textured star billboards. Relic's own reasoning, as reconstructed by Simon Schreibt: *"the Homeworld backgrounds consist mostly of colors and gradients, and only sometimes more detail."*

That is precisely the R1/R2 problem. R1 asks for **background median luma ≥ 0.10 with ≥ 40% of frame above 0.06**, and R2 for **one hue owning the field at chroma ≥ 0.18 in a ≤ 60° band**. Both are *low-frequency* requirements. Low-frequency signal is exactly what a vertex-colour mesh encodes for free and what a texture wastes memory on.

So the technique whose reference frames you are chasing hardest is also the one technique in this survey that **needs no image file by construction**. We do not even need the half of Relic's pipeline that would break the rule (paint a bitmap → vectorise it into a mesh), because we already own the function that the bitmap would have encoded — `skydome.js` evaluates it in a fragment shader today. Evaluating it per-vertex instead is a strictly cheaper, seam-free, pole-pinch-free version of the same thing.

---

## 1. Homeworld 1 (1999) — the primary reference, and the source is public

Relic's source release contains the actual renderer: [`src/Game/btg.c`](https://github.com/aheadley/homeworld/blob/master/src/Game/btg.c) and [`btg.h`](https://raw.githubusercontent.com/aheadley/homeworld/master/src/Game/btg.h).

**The format.** `BTG_FILE_VERSION 0x600`. Verbatim from `btg.h`:

```c
typedef struct btgHeader {
    udword btgFileVersion; udword numVerts; udword numStars; udword numPolys;
    sdword xScroll, yScroll; udword zoomVal;
    sdword pageWidth, pageHeight;
    sdword mRed, mGreen, mBlue;  sdword mBGRed, mBGGreen, mBGBlue;
    bool bVerts, bPolys, bStars, bOutlines, bBlends;  sdword renderMode;
} btgHeader;

typedef struct btgVertex {
    udword flags; real64 x, y;                     // 2D PAGE coords, not 3D
    sdword red, green, blue, alpha, brightness;
} btgVertex;

typedef struct btgPolygon { udword flags; udword v0, v1, v2; } btgPolygon;

typedef struct btgStar {
    udword flags; real64 x, y; sdword red, green, blue, alpha;
    char filename[48]; udword glhandle; sdword width, height;
} btgStar;
```

Read the vertex struct carefully. **A Homeworld background vertex has no Z.** It is authored in 2D equirectangular "page" space and unprojected at load time by `btgConvertAVert`:

```c
theta = 2.0f * M_PI_F * xFrac;
phi   = 1.0f * M_PI_F * yFrac;
radius = CAMERA_CLIP_FAR - 500.0f;
out->x = radius * cosTheta * sinPhi;
out->y = radius * sinTheta * sinPhi;
out->z = radius * cosPhi;
```

The background is therefore a **2D vector drawing that is wrapped onto a sphere at the far clip plane**. That is what `BTG.exe` — present in the shipped source tree at [`tools/bin`](https://github.com/timdetering/Homeworld/tree/master/tools/bin) — edits. Homeworld's "background editor" is a 2D triangle-mesh paint program with per-vertex RGB + alpha + brightness. Relic separately had a vectorisation tool that converted a painted bitmap into `.btg`, which they never published.

- **Cubemap / mesh / billboards / volumetric / post?** Mesh, plus separate textured billboards for stars.
- **Authored or generated?** Authored — but the *runtime representation* is entirely procedural-friendly.
- **Resolution?** No texture. `pageWidth × pageHeight` is authoring-canvas resolution only. Star bitmaps live in `btg\bitmaps\`.
- **Does it light ships?** **No.** `btgRender` disables `GL_DEPTH_TEST`, `GL_CULL_FACE`, `GL_TEXTURE_2D` and lighting, and draws with `glInterleavedArrays(GL_C4UB_V3F, ...)` + `glDrawElements`. The background is emissive-only and cannot occlude or be occluded. Ship lighting is a separate level light.
- **Parallax?** **None.** Camera-centred sphere at `CAMERA_CLIP_FAR - 500`, depth test off. Homeworld's depth comes from value and from the ships being lit while the sky is not.
- **Banding?** Handled at authoring time via the per-vertex `brightness` field and a global fade. Colours are premultiplied `(channel * alpha) >> 8`, and the final alpha is `a = (alpha * brightness * btgFade) >> 16`, with `btgFade` 0–255 set by `btgSetColourMultiplier(t) → btgFade = t * 255.0f`. There is no dither; on a 1999 target it did not matter, and on ours it will.

> **Survives no-image-files?** ✅ **Completely, and it is the best fit in the survey.** The mesh has zero texture dependency. The star billboards need a sprite, which `common.js#softPointTexture` already generates. The only part that dies is the authoring step, which we replace with direct evaluation.

---

## 2. Homeworld 2 / Remastered — the same idea, industrialised

Sources: [Simon Schreibt, "Homeworld 2: Backgrounds"](https://simonschreibt.de/gat/homeworld-2-backgrounds/) and ["Backgrounds Tech"](https://simonschreibt.de/gat/homeworld-2-backgrounds-tech/); [laanwj/hw2view](https://github.com/laanwj/hw2view); [r-lyeh/img2sky](https://github.com/r-lyeh-archived/img2sky).

The background is *"a highly tessellated sphere"* with vertex colours, stored in `.HOD`. hw2view describes them as *"tesselated spheres with vertex colors"* that are *"more finely tesselated in places where more precision is needed."*

**The generator is adaptive-density, driven by contrast.** `HW2BGBuilder` (command line, ships in the Homeworld Universe Mod Tools) *"scans every pixel of the image then based on contrast it decides whether or not to add a new vertex and color."* Real numbers from the tutorial workflow:

- Source texture **1024 × 512, 24-bit**.
- Photoshop output levels reduced from **255 to 128** before conversion (i.e. the background is authored at half brightness — it is a *floor*, not a subject).
- It emits a `_ref.TGA` edge map showing which quads got subdivided.
- Vertices are deliberately **sparse at the poles**, which is what produces smooth gradients there rather than the pinching a UV sphere gives you.
- The economic argument, quoted: *"1 Pixel needs 24 Bit/3 Bytes to be saved (RGB, every channel has 8 Bit)"* versus *"1 Vertex needs a position (XYZ) and a vertex color (RGB)."* For gradient-dominated imagery the mesh wins outright.

`img2sky`, which reimplements the idea, gives the only hard vertex counts I found: quality parameter **0–100 (default 50)**, a reported `error-threshold: 4.15888`, and sample outputs ranging **1,656 to 30,055 vertices** depending on quality. That is the honest scale: **a full-sky Homeworld background is a few thousand to a few tens of thousands of vertices.** For us that is nothing.

**Stars** are *not* in the mesh — they are separate *"single textures/billboards"*, which is how they stay sharp while the sphere stays coarse.

**Lighting.** HW2 background `.hod` files ship with companion **`_light.hod`** files *"that contain the position of the lights"* (e.g. `m01.hod` / `m01_light.hod`, `black.hod` / `black_light.hod`). So the background does **not** light the ships; a hand-placed lighting rig, authored alongside the background so the two agree, does. **This is exactly the contract `src/world/celestials/index.js` already implements** — `CELESTIAL_SPECS[poi].sunDir` is the single source of truth for both the drawn star and the lighting rig. Homeworld shipped that same decision as two files. Ours is better because it cannot desync.

**Remastered adds one thing worth stealing.** HWRM ships **reflection cubemaps derived from the backgrounds**. A Steam Workshop skybox author notes their mod *"Uses the lower-definition textures (the reflection cubemaps) found in the game's internal files"* and that *"Extracting the original, non-cubemap background files presently isn't possible."* So: **vertex-colour mesh for the backdrop, low-res cubemap of the same content for image-based lighting.** That is the single most directly actionable structural finding in this document — see §11.

> **Survives no-image-files?** ✅ for the runtime format. ❌ for the pipeline (the 1024×512 input is an image file). Take the output, drop the input.

---

## 3. Homeworld 3 (2024) — UE4, and the nebula became gameplay

Sources: [Worthplaying dev-diary writeup](https://worthplaying.com/article/2023/6/30/news/138095-homeworld-3-reveals-details-about-visuals-audio-design-pushing-the-unreal-engine-4-and-more-screens-trailer/), [GamingTrend](https://gamingtrend.com/news/massive-homeworld-3-dev-diary-showcases-huge-audio-and-visual-upgrades/).

Blackbird moved to Unreal Engine 4 with PBR, real-time GI, shadows and surface reflections (Technical Art Director Demetrius Apostolopoulos, Art Director Karl Gryc). The nebulae are described as **dynamically generated using "realistically-simulated gas"**, and they are gameplay objects — ships inside a cloud are hidden from enemy sensors.

Caveat, stated plainly: this is marketing-tier detail. I found **no** technical talk or postmortem giving resolutions, sample counts or frame cost for HW3's volumetrics. Treat "simulated gas" as a design claim, not a rendering spec.

The transferable point is directional, not numerical: **the series moved the nebula from "the sky" to "an object in the world you fly into."** That matches Everspace's structure below, and it matches what `nebula.js` already does with `frontRadius` sheets that the gas giant occludes.

> **Survives no-image-files?** ⚠️ Only if the volumetric noise is generated. See §8 for what raymarching actually costs.

---

## 4. EVE Online — the cubemap case, and the one that lights its ships

**2011, [Introducing New Nebulae into EVE](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve) (CCP t0rfifrans):**

- The nebulae are *"inspired by real world imagery but they are all computer generated, painstakingly rendered using state of the art hardware and software."* Offline rendering, not runtime.
- Granularity: **30 nebula backgrounds** at the time, selected by constellation; the new set is **68 unique backdrops**, one per region (there are **786 constellations** and **68 regions** in known space). CCP state this explicitly as *"a compromise… between granularity and quality."*
- Critically: **"Most ships in EVE reflect the nebula of the area of space they are in."** The background **is** the IBL source. This is the direct answer to reference-frames §4.3 ("Warm albedo under cool-only light is a cool ship").

**2022, [Building the future of EVE](https://www.eveonline.com/news/view/building-the-future-of-eve):**

- *"The resolution of every nebula background in-game has been doubled, quadrupling the pixel count."*
- *"The increased resolution of the cubemap also gave us the opportunity to remove unintended seam errors."*
- *"The colors of each nebula have been rebalanced."*

Community-extracted numbers ([EVE forum archive](https://forums-archive.eveonline.com/message/5129081/), and a [KSP tutorial repackaging EVE cubemaps](https://forum.kerbalspaceprogram.com/topic/138036-tutorial-setting-up-eve-cube-maps-24mb-dds-4-texture-maps/)) put the original cubemaps at **1024 px per face**, `.dds`, with visible dithering/banding and no preserved alpha — so the 2022 doubling lands at **2048 px per face**. Sixty-eight backdrops × six faces × 2048² is roughly **1.7 GB of source pixels** before compression. That is the price of the authored-cubemap answer, and it is the number that makes the answer unavailable to us.

Two honest lessons that *do* transfer:

1. **Seams are a cubemap-specific tax.** CCP had shipped seam errors for a decade and fixed them by throwing resolution at the problem. A direction-space procedural field has no seams to fix.
2. **Banding was visible in the shipped .dds.** Even a AAA offline-rendered 1024² cubemap bands on smooth nebula gradients once it is 8-bit. See §9.

> **Survives no-image-files?** ❌ Flatly. This is the shipped-game answer the brief correctly rules out.

---

## 5. EVE Frontier — generated universe, undocumented renderer

CCP's public material ([space.com exclusive](https://www.space.com/entertainment/space-games/eve-onlines-space-survival-spinoff-uses-realistic-simulations-and-algorithms-to-build-a-whole-new-universe-exclusive)) is about *world* generation, not rendering: Helgi Freyr Rúnarsson (PhD, computational astrophysics) leads world generation and resource design; Guðlaugur Jóhannesson (PhD, astrophysics) does physics and backend. One useful art-direction admission from the team: standing inside a nebula gives *"a very unrealistic image of what it would look like,"* because the gas is low-density and you would need enormous path lengths to accumulate that glow. **Frontier's nebulae are a deliberate lie, chosen for legibility.** That matters for us: R1 is not physics, it is composition, and the studio whose frame you cited as the "outlier, and the useful one" says so out loud.

I could not find a CCP technical devblog on Frontier's nebula renderer. **Do not let anyone tell you there is one.**

The closest public case study *at our exact technology stack* is third-party: **[EF-Map](https://ef-map.com/blog/)**, a community three.js/WebGL map tool for Frontier, explicitly **not CCP**. Their reported path is worth the citation precisely because they hit our constraints:

- They *"tried nebula textures, fought UV seams and pole pinching, built user-adjustable sliders"* — and then found that **procedural noise with the same controls delivered the best results**, killing the seam and pole problems outright.
- Simplex/fBm in WebGL shaders; **24,000+ instanced stars**.
- Starfield render time reduced **from 500 ms to 4 ms** through GPU-side work and spatial indexing.
- Depth via layered glow / parallax / desaturation rather than more geometry.

That is an independent WebGL team arriving at the same conclusion §1 arrives at from Homeworld: **for a space background, evaluate the field, do not sample an image of it.**

> **Survives no-image-files?** ✅ for the EF-Map procedural-noise approach. Unknown for CCP's actual pipeline.

---

## 6. Elite Dangerous — the skybox is generated, and generation is amortised into the jump

Sources: [80.lv, "Generating The Universe in Elite: Dangerous"](https://80.lv/articles/generating-the-universe-in-elite-dangerous), [Frontier forums "The Skybox"](https://forums.frontier.co.uk/threads/the-skybox.312978/), [Elite Dangerous Wiki: Galaxy](https://elite-dangerous.fandom.com/wiki/Galaxy).

- The skybox is **created dynamically**, and **every point of light in it is a star you can actually visit.** There is no painted sky anywhere in the game.
- The Stellar Forge is seeded and **deterministic** — *"there's far too much data to store, this requires that the generator be predictable and deterministic."* Same discipline as our `world.rng` rule, for the same reason.
- **Nebulae are entities in the forge**: *"nebulae are stars, from the point of view of the stellar forge and the position calculator for the galaxy map and the skybox generator."*
- **Timing is the technique.** *"During the jump, your system generates the next system's skybox."* Generation cost is paid inside a transition the player already accepts as a loading beat, and the result is then static.

That last bullet is the operationally important one for us. `buildCelestials()` runs at POI entry. **A CPU-side sky generation budget of 50–200 ms at POI load is not a performance problem; it is the Elite Dangerous model.** Anything you can move from per-frame shader work to per-POI generation, move.

Caveat: forum and press tier, not a dev talk. I found no Frontier engineering presentation on the skybox specifically.

> **Survives no-image-files?** ✅ Structurally — it is the canonical "generate at load, freeze until the next transition" pattern.

---

## 7. Everspace 1 & 2 — authored assets, procedurally *arranged*; and the composition lesson

Sources: [80.lv interview with Michael Schade](https://80.lv/articles/everspace-proper-german-space-game); [Unreal developer interview, Everspace 2](https://www.unrealengine.com/developer-interviews/everspace-2-delivers-a-handcrafted-universe-brimming-with-space-combat) (403 to fetch; content via search index); [ArtStation Art Blast](https://magazine.artstation.com/2023/12/rockfish-games-everspace-2-art-blast/) (403).

Schade, on the recipe:

> *"To create a nice space scene you don't actually need a lot of stuff: a skybox, some asteroids, a Sun, maybe a space station and a Nebula."*

and on the proceduralism:

> *"all the stuff we use during these generations was carefully constructed" … "you start to do the variations and make sure that these props they are super polished and they work well together."*

Everspace 2's jump-target levels are **procedurally assembled from authored backdrops, planets, nebulas, asteroids, stations, wrecks and POIs, combined under fairly strict rules**. Props ship with **five LODs each**. Lighting is a **precomputed GI solution plus SSGI**. Engine is UE4 → UE5; volumetric fog is used and behaved differently across the port. Lead VFX/Environment artist is Marco Unger.

**The compositional finding matters more than the tech here, and it is directly about your two Everspace reference frames.** In both, the planet limb and the nebula bank are *not the sky*. They are **finite-distance actors placed in the level** — which is why the limb sits bottom-left and gets cropped by the frame edge, and why it parallaxes as you fly. The skybox behind them is a comparatively quiet field. That is a three-layer structure:

1. quiet coloured sky (the floor — R1/R2),
2. **one large finite-distance hero body** breaking the frame edge (the "large, saturated, luminous object"),
3. dark local geometry carrying warm emissive accents (R5).

`CELESTIAL_SPECS` already has slots for all three (`dome`, `giant`, and the POI's own props). `near-star` and `graveyard` have `giant: null` and `giant` at only 3.9° angular radius respectively — **layer 2 is the layer we are underweighting**, and the reference frames doc says so at §4.1.

> **Survives no-image-files?** ❌ for their assets. ✅ for the three-layer composition and the "few polished pieces, strict combination rules" discipline — which `ARCHITECTURE.md` §6 already independently mandates.

---

## 8. Star Citizen — real volumetrics, but not as the sky

Source: [GDC 2015, *Advanced Visual Effects With DirectX 11 & 12: Visual Effects in Star Citizen*](https://www.gdcvault.com/play/1021768/Advanced-Visual-Effects-With-DirectX) (CIG). Abstract: *"the rendering and lighting of volumetric gases for everything from smoke trails and massive explosions to gas-clouds several hundred miles across,"* plus the ship damage system and shield rendering. CIG later added **hierarchical voxel support** to the gas cloud system; gas clouds shipped in Alpha 3.12 (2020) and the volumetric gas giant Crusader in Alpha 3.14 (2021).

Note the scoping. Even at Star Citizen's budget, the raymarched volumetric is a **local, traversable object at hundreds-of-km scale**, not the celestial sphere. The sky behind it is still a skybox.

**What raymarching actually costs, with real numbers.** The best-documented volumetric skybox in games is Guerrilla's Nubis, from [Andrew Schneider & Nathan Vos, *The Real-time Volumetric Cloudscapes of Horizon Zero Dawn*, SIGGRAPH 2015](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf). Quoting the deck directly:

- Noise is **generated, not painted**: custom **Perlin-Worley** (Worley used to dilate Perlin), stored as tiling 3D textures.
- Base texture: **128³**, RGBA — *"The first channel is the Perlin-Worley noise… The other 3 are Worley noise at increasing frequencies."*
- Detail texture: **32³**, Worley at increasing frequencies.
- Motion texture: **128²**, **curl noise**, *"non divergent and is used to fake fluid motion."*
- Marching: *"an initial potential 64 samples and end with a potential 128 at the horizon"*, plus **6 light samples per march in a cone**; a cheap/expensive sampler switch (cheap large steps until the iso-surface, then step back and switch to full detail; after several consecutive zero-density samples, switch back).
- **Cost: *"The approach that I have described so far costs around 20 milliseconds. (pause for laughter)"***
- The fix: *"Every frame we could use a quarter res buffer… to update 1 out of 16 pixels for each 4x4 pixel block within our final image. We reproject the previous frame…"* Result: *"Nathan's idea made the shader 10x faster or more when we render this at half res and use filters to upscale it… our target performance is around 2 milliseconds."* Captured on **PlayStation 4**, written in PSSL/C++.
- And the memory line that is the actual argument for volumetrics: *"our unique memory usage for the entire sky is limited to the cost of 2 3d textures and 1 2d texture instead of dozens of billboards or sky domes."*

**Translate that to us.** 128³ RGBA8 is 8 MB; 32³ is 128 KB; both are trivially generatable into a `Data3DTexture` at boot with our seeded RNG. The *rendering* is the problem. 20 ms naive → 2 ms required **quarter-res, 1-in-16 temporal updating, motion-vector reprojection, and a bespoke upscale filter**. We have none of that plumbing, our far scene has its own camera, and reprojection across the `FAR_SCENE.parallax` split is an additional wrinkle. Budget **3–6 ms at half resolution for a single unreprojected raymarched bank** in WebGL2 and treat that as a hard number, not a pessimistic one.

> **Survives no-image-files?** ✅ Technically — the noise is generated by definition. ❌ Practically as the *primary* sky. Viable only as one optional near-dust volume, and only after the cheap techniques have been exhausted.

---

## 9. Freelancer, FreeSpace 2, KSP — the cheap layered ancestors

**Freelancer (2003).** Layered starsphere meshes. Each system references multiple `.cmp` meshes — `basic_stars`, `complex_stars`, and nebula/rift layers — stacked as separate textured spheres ([SWAT Portal modding thread](https://swat-portal.com/forum/thread/37945-starsphere-background/), [Freelancer HD Edition](https://github.com/FLHDE/freelancer-hd-edition)). Vanilla starspheres carry *"additional layers for nebulas or rifts."* All camera-locked; no parallax between layers. It is the absolute cheapest structure that still reads as depth: **separate meshes at separate radii with separate blend modes**, which is precisely the `ORDER.backGlow / frontGlow / dust` stack `nebula.js` already builds.

**FreeSpace 2 / FSO.** [`starfield.tbl`](https://wiki.hard-light.net/index.php/FreeSpace_2_Mission_File_Format) holds background bitmaps and suns; suns carry angles and scale, background bitmaps carry angles, scale and `DivX`/`DivY` subdivision; [`nebula.tbl`](https://wiki.hard-light.net/index.php/Nebula.tbl) holds nebula bitmaps and "poofs". **FRED caps at 80 background bitmaps.** FSO adds true [POF skyboxes](https://wiki.hard-light.net/index.php/Skybox): a sphere with normals pointing inward, *"You can use as many textures as needed (2 to 6 are recommended). Additional textures will prevent stretching of the map across the sky, but it will render slower."*

The FreeSpace detail worth stealing: **the sun is simultaneously a drawn billboard and the scene's directional light.** [`lighting_profiles.tbl`](https://wiki.hard-light.net/index.php/Lighting_Profiles.tbl) exposes *"the brightness of directional lights such as level suns"*. One entity, two roles, no desync — the same invariant `CELESTIAL_SPECS.sunDir` enforces.

**Kerbal Space Program.** `GalaxyCubeMap`: a static six-face cubemap, community replacements at **4096²/face** and up to **16k**, swapped in via TextureReplacer. The galaxy map is *"rendered on a mesh object and uses a reflection probe."* Nothing generated. It is the purest example of the option we do not have.

> **Survives no-image-files?** Freelancer's *layer structure* ✅ (we already do it). FreeSpace's *sun-is-the-light* invariant ✅ (we already do it). All three games' textures ❌.

---

## 10. Children of a Dead Earth — the anti-reference, and it is instructive

[Q Switched Productions](https://childrenofadeadearth.wordpress.com/) built the physically honest version: no significant intervening medium, so *"targets stand out much more against the background"* and exhaust plumes fade almost immediately. The visual language is diffraction-spike lens flares emulating telescope optics, incandescent radiators, and propellant-dependent plume colour.

**CoDE deliberately fails R1.** Its background *is* black, on purpose, and the result reads as an instrument, not as Homeworld. It is the proof that R1 is an art-direction choice with no physical justification — which is fine, and which is why reference-frames §3 was right to lift the deferral for the field. Cite it when someone argues the nebula is unrealistic.

---

## 11. The three cross-cutting questions

### Parallax

| Game | Mechanism |
|---|---|
| Homeworld 1/2/RM | **None.** Sphere at `CAMERA_CLIP_FAR - 500`, depth test off, camera-centred. |
| Freelancer | None. Layered spheres, all camera-locked. |
| FreeSpace 2 | None. Angles-on-a-sphere. |
| EVE | None for the cubemap; parallax comes entirely from in-world grid objects. |
| Elite Dangerous | The skybox is infinite; parallax comes from real bodies in the system. |
| Everspace 1/2 | **Real.** The planet limb and nebula bank are finite-distance level actors. |
| Star Citizen | **Real** for gas clouds — they are world volumes you fly into. |

Our `FAR_SCENE.parallax` is the Everspace answer done cheaply, and it is worth stating the equivalence explicitly: **a far-scene object at radius `R` with parallax factor `p` behaves exactly like a main-scene object at radius `R/p`.** So `nebula.js`'s `frontRadius = 4200` at, say, `p = 0.02` reads as a bank 210 km away — genuinely finite, genuinely parallaxing. That is a knob with real compositional meaning, and it is currently a single global constant. **Per-layer parallax would give the back glow / front glow / dust stack actual depth separation for zero extra draw calls** — the one depth cue Homeworld never had.

### Image-based lighting — does the sky light the ships?

| Game | Answer |
|---|---|
| Homeworld 1 | **No.** Background is unlit, untextured, depth-off. Separate level lights. |
| Homeworld 2 / RM | **No** for the mesh — but ships reflect a **low-res cubemap derived from the background**, and each background ships with a companion `_light.hod`. |
| EVE Online | **Yes.** *"Most ships in EVE reflect the nebula of the area of space they are in."* |
| FreeSpace 2 | **No**, but the drawn sun *is* the directional light. |
| Everspace 2 | Precomputed GI + SSGI; UE Sky Light. |
| KSP | Reflection probe off the galaxy mesh. |

**This is our biggest cheap win, and three.js hands it to us.** From `node_modules/three/src/extras/PMREMGenerator.js`:

- `fromScene(scene, sigma, near, far, options)` with `options.size = 256` default.
- *"The ideal input cube size is 256 x 256, as this matches best with the 256 x 256 cubemap output."*
- `LOD_MIN = 4`; `EXTRA_LOD_SIGMA = [0.125, 0.215, 0.35, 0.446, 0.526, 0.582]`; `GGX_SAMPLES = 256`; `MAX_SAMPLES = 20`. Prefiltering uses GGX VNDF importance sampling (Heitz 2018).

So: **render `world.far` once per POI into a 256² PMREM and assign it to `world.scene.environment`.** That is EVE's ship-reflects-the-nebula and HWRM's reflection cubemap, obtained with **zero image files**, at **one-time cost at POI load** (the Elite Dangerous amortisation model), for **zero per-frame draw calls**. It directly attacks reference-frames §4.3 — the hull measuring 0.216/0.244/**0.238** (cool) because it is lit almost entirely by blue fill. Fill it from the actual green field and the graveyard hull warms up without touching albedo.

Caveat to verify before building: `MaterialRegistry` materials must be `MeshStandardMaterial`-family for `scene.environment` to apply, and `envMapIntensity` needs to sit in the palette so it is graded, not guessed.

### Banding

This is the one place where "generated smooth gradient" is *harder* than "sampled texture", because a texture carries its own noise and a procedural gradient is mathematically perfect until the framebuffer destroys it. The canonical source is [Mikkel Gjøl (Playdead), *Banding in Games: A Noisy Rant*](https://loopit.dk/banding_in_games.pdf).

His concluding recommendations, verbatim:

> *"Use highest affordable precision available (duh) · Use sRGB if feasible across target platforms · Dither using triangular noise [-0.5;1.0[ during quantisation (e.g. at tonemapping, or any write to an 8bit rt) · Add noise in the right color-space (the color-space your quantised values are stored in)"*
> **HINDSIGHT: GPUs round, so dither-range should be [-1;1[**

Specific, quotable rules that bear directly on `nebula.js`:

- **Dither before quantisation, never after.** *"Dithering after quantisation does not remove banding… Otherwise you are just adding noise on top of an already banding image."*
- The canonical snippet: `vec4 ditherRGBA(vec4 c, vec2 seed) { return c + hash42n(seed) / 255.0; }`
- **Additive blending is dither-safe; multiplicative is not.** *"adding / subtracting does not change the magnitude of LSB, so the dithering is fine… multiplying ruins the whole thing."*
- **Every additive layer needs its own seed.** For a many-layer stack he gives, verbatim, `vec2 UNIQUE_SEED = vec2(0.6849 + vspos.z);` — *"if blending multiple objects with the same shader, using a different noise-value for each layer helps reduce noise. E.g. a particle-system with many layers could use the viewspace-z as a seed on top of screenposition."* **Our graveyard nebula is 14 emission layers + 5 dust layers of exactly this shape.**
- **Prefer premultiplied alpha**, which *"allows to blend colors smaller than 1/255 (as they are dithered afterwards)."*
- Triangular dither clamps badly at 0 and 1; his fix, verbatim:
  ```glsl
  float dithertri  = (rnd.x + rnd.y - 1.0);  // triangular, [-1;1[
  float dithernorm = rnd.x - 0.5;            // uniform,    [-0.5;0.5[
  float sizt_lo = clamp( v/(0.5/7.0), 0.0, 1.0 );
  float sizt_hi = 1.0 - clamp( (v-6.5/7.0)/(1.0-6.5/7.0), 0.0, 1.0 );
  dither = lerp( dithernorm, dithertri, min(sizt_lo, sizt_hi) );
  ```
- And the note that stings for a dark game: *"If you use sRGB correctly, you're doing pretty well… **though dark areas remain**."* Our field is by design near-black-but-coloured. We are in the worst case.

The cheap alternative, [Jorge Jimenez, *Next Generation Post Processing in Call of Duty: Advanced Warfare*](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/), as applied to WebGL gradients by [frost.kiwi](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/):

```glsl
float gradientNoise(in vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}
bgcolor += (1.0 / 255.0) * gradientNoise(gl_FragCoord.xy) - (0.5 / 255.0);
```

**Where we stand today, checked in the repo.** `src/render/postfx.js:220` builds the composer with `THREE.HalfFloatType`, and line 167 applies `col += bayer(gl_FragCoord.xy) * (dither / 255.0)` at the end of the chain. **That placement is correct** — 16-bit float throughout, dithered immediately before the 8-bit backbuffer write. Good.

Two residual risks, both specific:

1. **Ordered Bayer is the weakest of the three options on exactly our content.** Gjøl ranks ordered dithering below random, and notes *"blue noise is less noticeable."* An 8×8 Bayer pattern across a full-frame, near-uniform, near-black dome gradient is the case where the cross-hatch becomes visible as structure. Swapping to triangular-PDF random (or IGN) is a one-line change in `postfx.js`.
2. **The dome and the 14 nebula layers are not dithered at the source.** Half-float intermediates mean this is mostly fine, but Gjøl's per-layer-unique-seed point applies to the additive stack regardless, and the dome is the single largest smooth gradient in the frame.

---

## 12. Ranked: what survives "generated at runtime, no image files"

Ranked by value-per-unit-risk for Nadir Point specifically. Every entry is generated on CPU into a `DataTexture`/`CanvasTexture`/`BufferAttribute`, or on GPU in a shader.

**Tier S — do these**

1. **Vertex-coloured background mesh (Homeworld BTG/HOD).** ✅ Survives outright, and is the only technique here whose *shipped* form has no texture at all. Generate an icosphere (no poles, no UV seam), evaluate the existing `skydome.js` field per-vertex, write a `COLOR` attribute. **Cost: 1 draw call, 0 bytes of texture, ~2.5k–40k verts** (Homeworld's own range, per `img2sky`: 1,656–30,055). Generation is a few ms of CPU at POI load. Risk: near-zero; it is strictly simpler than what `skydome.js` does now. Banding must be handled in the fragment shader regardless — interpolated vertex colours quantise exactly like everything else.
2. **Runtime PMREM → `scene.environment` (EVE's IBL, HWRM's reflection cubemap).** ✅ Survives outright. `PMREMGenerator.fromScene(world.far, ...)` at 256², once per POI. **Cost: one-time render at load, 0 per-frame draw calls.** Highest measurable payoff on the open R3/§4.3 defect. Risk: low, contained to the material registry.
3. **Procedural field evaluated in 3D direction space (EF-Map's conclusion).** ✅ Survives outright. Domain-warped fBm on the normalised view direction, not on UV. **No seams, no pole pinch, by construction** — the two problems EF-Map hit with textures and CCP paid a resolution doubling to fix. This is what `skydome.js` should evolve into, and #1 is its cheap per-vertex baking.

**Tier A — already ours, keep and extend**

4. **Layered camera-facing quads with generated `CanvasTexture` sheets** (Freelancer's structure, our `nebula.js`). ✅ Survives — the sheets are generated by `planarFbm`. **Cost: 3 shared 256² textures, 3–9 draw calls regardless of layer count.** Its unique contribution over a dome is *occlusion* — normal-blended dust in front of additive glow — which no dome can produce. Extension: per-layer parallax factors, and per-layer dither seeds (§11).
5. **Star billboards with a generated sprite** (HW1 `btgStar`, HW2 stars-as-billboards). ✅ Survives — `common.js#softPointTexture`. **1 draw call for 7,200 stars.** Already correct, including the constant-pixel-size anti-scintillation fix.
6. **Finite-distance hero body with real parallax** (Everspace's backdrop actors). ✅ Survives — `gasgiant.js` generates its own texture. This is the underweighted layer: `near-star` has `giant: null`, `graveyard` has one at 3.9°. Reference-frames §4.1 names this as the highest-value open change.

**Tier B — survives, but pay attention to the price**

7. **GPU-generated cubemap into `WebGLCubeRenderTarget`.** ✅ Survives. Render the #3 shader into six faces once at POI load, then use it as `far.background` and as PMREM input. **Cost: 6 × 512² × RGBA16F ≈ 12 MB, one-time.** Useful only if the per-frame dome shader turns out to be fill-rate bound; otherwise it buys nothing #1 doesn't.
8. **CPU-generated equirect/cube `DataTexture`** (Spacescape's model — [Alex Peterson, MIT](https://github.com/petrocket/spacescape)). ✅ Survives the letter of the rule. **But**: 6 × 2048²× 4 bytes ≈ **100 MB** and seconds of single-threaded JS. At 512²/face it is 6 MB and viable. Strictly worse than #7 in every respect except that it needs no render target.
9. **Volumetric raymarch** (Star Citizen, Nubis). ✅ Survives — 128³ + 32³ + 128² noise into `Data3DTexture` at boot is well within our means. ⚠️ **The rendering is the problem: 20 ms naive on PS4, reaching 2 ms only via quarter-res + 1-in-16 temporal + reprojection + custom upscale.** We have none of that. Budget 3–6 ms half-res for one bank, unreprojected. Recommend as an *optional* near-dust volume behind a quality flag, never as the field itself.

**Tier F — does not survive, do not propose**

10. **Authored cubemap / painted skybox** (EVE 68 × 6 × 2048², KSP `GalaxyCubeMap`, Freelancer starsphere textures, FreeSpace `starfield.tbl` bitmaps, Everspace's backdrops). ❌ Non-negotiable 5.
11. **Image → mesh vectorisation** (`HW2BGBuilder`, `img2sky`, Relic's unpublished BTG vectoriser). ❌ as a pipeline — the input is a 1024×512 24-bit file. ✅ as an output format, which is Tier S #1. **Take Relic's format, discard Relic's pipeline.** We are in the unusual position of having the source function they had to encode into a bitmap and then reverse-engineer back out.

---

## 13. Three specific, checkable findings about our code

1. **`src/render/postfx.js:167` uses an ordered 8×8 Bayer dither at `1/255`.** Placement is right (half-float composer at line 221, dither immediately before the 8-bit write). Pattern choice is the weakest of the three Gjøl evaluates, and our content — one huge near-black smooth dome gradient — is the exact case where ordered patterns read as visible cross-hatch. A triangular-PDF random or IGN swap is one line.

2. **`src/world/celestials/nebula.js` additively blends up to 14 emission sheets with `depthWrite: false` and no per-layer dither seed.** Gjøl's guidance for precisely this case is verbatim `vec2 UNIQUE_SEED = vec2(0.6849 + vspos.z);`. Half-float intermediates absorb most of it, but the graveyard is the worst-case stack in the project.

3. **`FAR_SCENE.parallax` is a single global.** A far-scene object at radius `R` and parallax `p` is optically a main-scene object at `R/p`. Per-layer parallax on the `backGlow` / `frontGlow` / `dust` stack would give us the one depth cue Homeworld, Freelancer, FreeSpace and EVE all lack, for zero additional draw calls — and it is the mechanism behind the Everspace reference frames' finite, croppable planet limb.

---

## Sources

**Homeworld**
- [Homeworld 1 source — `src/Game/btg.c`](https://github.com/aheadley/homeworld/blob/master/src/Game/btg.c) · [`btg.h`](https://raw.githubusercontent.com/aheadley/homeworld/master/src/Game/btg.h) · [shipped `tools/bin` incl. `BTG.exe`](https://github.com/timdetering/Homeworld/tree/master/tools/bin) · [videogamepreservation mirror](https://github.com/videogamepreservation/homeworld)
- [Simon Schreibt — Homeworld 2: Backgrounds](https://simonschreibt.de/gat/homeworld-2-backgrounds/) · [Backgrounds Tech](https://simonschreibt.de/gat/homeworld-2-backgrounds-tech/)
- [laanwj/hw2view](https://github.com/laanwj/hw2view) · [r-lyeh/img2sky](https://github.com/r-lyeh-archived/img2sky) · [Homeworld Universe Mod Tools](https://www.moddb.com/games/homeworld-2/downloads/homeworld-universe-mod-tools) · [HWRM/KarosGraveyard](https://github.com/HWRM/KarosGraveyard)
- [HWRM reflection-cubemap skybox mod](https://steamcommunity.com/sharedfiles/filedetails/?id=783281142) · [Gearbox "Background Hods" thread](https://forums.gearboxsoftware.com/t/background-hods/128409?page=2)
- [Homeworld 3 dev diary coverage — Worthplaying](https://worthplaying.com/article/2023/6/30/news/138095-homeworld-3-reveals-details-about-visuals-audio-design-pushing-the-unreal-engine-4-and-more-screens-trailer/) · [GamingTrend](https://gamingtrend.com/news/massive-homeworld-3-dev-diary-showcases-huge-audio-and-visual-upgrades/)

**EVE**
- [CCP t0rfifrans — Introducing New Nebulae into EVE (2011)](https://www.eveonline.com/news/view/introducing-new-nebulae-into-eve) · [Building the future of EVE (2022)](https://www.eveonline.com/news/view/building-the-future-of-eve)
- [EVE forum archive — nebula resolution](https://forums-archive.eveonline.com/message/5129081/) · [EVE cubemaps repackaged for KSP](https://forum.kerbalspaceprogram.com/topic/138036-tutorial-setting-up-eve-cube-maps-24mb-dds-4-texture-maps/)
- [space.com — EVE Frontier generation (CCP interview)](https://www.space.com/entertainment/space-games/eve-onlines-space-survival-spinoff-uses-realistic-simulations-and-algorithms-to-build-a-whole-new-universe-exclusive) · [EF-Map blog (third-party, three.js)](https://ef-map.com/blog/)

**Elite Dangerous · Everspace · Star Citizen · Freelancer · FreeSpace · KSP · CoDE**
- [80.lv — Generating the Universe in Elite: Dangerous](https://80.lv/articles/generating-the-universe-in-elite-dangerous) · [Frontier forums — The Skybox](https://forums.frontier.co.uk/threads/the-skybox.312978/) · [ED Wiki: Galaxy](https://elite-dangerous.fandom.com/wiki/Galaxy)
- [80.lv — Everspace: Proper German Space Game (Michael Schade)](https://80.lv/articles/everspace-proper-german-space-game) · [Unreal — Everspace 2 developer interview](https://www.unrealengine.com/developer-interviews/everspace-2-delivers-a-handcrafted-universe-brimming-with-space-combat) · [ArtStation Art Blast](https://magazine.artstation.com/2023/12/rockfish-games-everspace-2-art-blast/)
- [GDC 2015 — Visual Effects in Star Citizen](https://www.gdcvault.com/play/1021768/Advanced-Visual-Effects-With-DirectX) · [Star Engine, Star Citizen Wiki](https://starcitizen.tools/Star_Engine)
- [Freelancer starsphere modding](https://swat-portal.com/forum/thread/37945-starsphere-background/) · [Freelancer: HD Edition](https://github.com/FLHDE/freelancer-hd-edition)
- [FreeSpace Wiki: Skybox](https://wiki.hard-light.net/index.php/Skybox) · [Mission File Format / starfield.tbl](https://wiki.hard-light.net/index.php/FreeSpace_2_Mission_File_Format) · [Nebula.tbl](https://wiki.hard-light.net/index.php/Nebula.tbl) · [Lighting Profiles.tbl](https://wiki.hard-light.net/index.php/Lighting_Profiles.tbl) · [FSO `starfield.cpp`](https://scp.indiegames.us/fsodoc/starfield_8cpp_source.html)
- [KSP skybox creation tutorial](https://forum.kerbalspaceprogram.com/topic/164347-comprehensive-ksp-skybox-creation-tutorial/) · [RSS ultra-high-res galaxy cubemap](https://forum.kerbalspaceprogram.com/topic/166476-rss-correct-ultra-high-resolution-unique-galaxy-background-cubemap/)
- [Children of a Dead Earth dev blog](https://childrenofadeadearth.wordpress.com/) · [FAQ](https://www.childrenofadeadearth.com/FAQs.html)

**Technique**
- [Mikkel Gjøl (Playdead) — Banding in Games: A Noisy Rant (rev 5)](https://loopit.dk/banding_in_games.pdf)
- [Jorge Jimenez — Next Generation Post Processing in Call of Duty: Advanced Warfare](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/) · [frost.kiwi — How to (and how not to) fix color banding](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/)
- [Schneider & Vos — The Real-time Volumetric Cloudscapes of Horizon Zero Dawn, SIGGRAPH 2015](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)
- [Alex Peterson — Spacescape (MIT)](https://github.com/petrocket/spacescape)
- [Unreal Engine — Sky Lights](https://dev.epicgames.com/documentation/unreal-engine/sky-lights-in-unreal-engine) · [4.27 Sky Light docs](https://docs.unrealengine.com/4.27/en-US/BuildingWorlds/LightingAndShadows/LightTypes/SkyLight)
- three.js r185 `PMREMGenerator` source, read locally at `/Users/blake/Development/Nadir Point/node_modules/three/src/extras/PMREMGenerator.js`