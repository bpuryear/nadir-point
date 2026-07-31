/**
 * ONE-SHOT OFFSCREEN BAKES.
 *
 * `docs/design/space-backgrounds.md` item 4, unblocked by F3.
 *
 * ===========================================================================
 * WHY THIS IS IN `src/render/` AND NOT `src/world/celestials/bake.js`
 * ===========================================================================
 *
 * Item 4's file plan says "new `src/world/celestials/bake.js`", and then says of the
 * `withBakeState` wrapper: "The wrapper belongs in `src/render/**`". Splitting the two
 * would have put the queue and the renderer-state guard in different layers for a file
 * this size, and — the part that actually decides it — `renderer.js` has to drain the
 * queue, so a queue living under `world/` would make `src/render` import `src/world`.
 * Checked: `grep -rn "from '.*render/" src/world/` and the reverse both return NOTHING
 * on this tree. There is no edge between those two directories in either direction
 * today, and the first one should not point downwards from the renderer into the world.
 *
 * Everything here is a renderer concern: the state a one-shot offscreen render needs,
 * a queue the render loop drains, and "render a direction-only material into a cube".
 * `skydome.js` imports it, which points world -> render, the direction that already
 * makes sense because `world` is handed a renderer and `render` is not handed a world.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS: F3 WAS ANSWERED AND THE ANSWER WAS "BAKE"
 * ===========================================================================
 *
 * `space-backgrounds.md:1015` calls F3 "the single most important measurement in the
 * document" and states the rule as a threshold, not an opinion: **under 0.5 ms ship the
 * live shader and skip the cubemap entirely; over 2 ms the bake is mandatory.** It also
 * specifies the exact experiment — swap the dome for a constant colour and diff the
 * frame time on hardware at 2560x1440.
 *
 * `docs/review/perf-bisect.md` §4.3 ran it:
 *
 *     far:dome-flat     13.32 ms   -2.44 ms   (same draw, same fill, zero noise taps)
 *     far:dome-hidden   14.29 ms   -2.32 ms   (the dome not drawn at all)
 *
 * **2.44 ms, 4.9x over the "ship it live" line.** And the second row is the finding
 * inside the finding: NOT DRAWING THE DOME AT ALL recovers LESS than drawing it with a
 * constant colour. The two are within 0.12 ms, which says the sphere, its one draw call
 * and its full-screen fill are all free and 100% of the cost is the fragment shader's
 * ten noise evaluations. A bake keeps the fill and deletes the taps, so a bake captures
 * essentially the whole 2.44 ms — this is the one fix in the wave whose ceiling and
 * whose measured value are the same number.
 *
 * `field.glsl.js:120-124` had already closed the other escape route: the cost is linear
 * in the tap count to 3%, and a 2-level IQ domain warp costs six fbm calls before it
 * draws anything, so the cheapest possible form of this construction is 8 evaluations
 * and there is no octave setting that reaches 0.5 ms.
 *
 * ===========================================================================
 * WHAT IS BAKED, AND WHY IT IS EXACT RATHER THAN APPROXIMATE
 * ===========================================================================
 *
 * `skydome.js`'s fragment shader is a pure function of ONE input: `normalize(vDir)`,
 * where `vDir` is the interpolated object-space vertex direction. No time, no camera,
 * no screen position. A function of direction alone is exactly what a cube map stores.
 *
 * So the dome keeps its mesh, its `ORDER.dome`, its `frustumCulled = false`, its one
 * draw call and its `vDir` varying, and only the FRAGMENT changes: ten noise evaluations
 * become one `textureCube`. Three consequences worth stating because each one is a way
 * this could have gone wrong and did not:
 *
 *   1. **The far camera's parallax is preserved for free.** `renderer.js#syncFarCamera`
 *      offsets the far camera by `FAR_SCENE.parallax` (2.2e-4) of the main camera's
 *      position, so the camera is not exactly at the dome's centre. A cube sampled by
 *      VIEW direction would quietly drop that; a cube sampled by the mesh's own `vDir`
 *      cannot, because it is the same varying the live shader used.
 *   2. **Every probe that hides the dome still works.** `index.js#setFieldControl` —
 *      the blind-comparison control the whole backdrop wave is graded against — toggles
 *      `parts.dome.object.visible`. There is still an object to toggle. Setting
 *      `far.background` to the cube instead, which is what item 4 suggests, would have
 *      deleted that control.
 *   3. **The bake is sampled at the same directions it was authored at.** The bake
 *      renders the source material on a FINE sphere (`BAKE_SEGMENTS`), so each texel
 *      holds the field at its own true direction; the dome then fetches it at
 *      `normalize(vDir)`, the same value the live shader evaluated at. The coarse
 *      dome's vertex interpolation error is therefore unchanged rather than doubled.
 *
 * ===========================================================================
 * RESOLUTION: 512/FACE IS NOT A GUESS, IT IS THE FIELD'S OWN BAND LIMIT
 * ===========================================================================
 *
 * `field.glsl.js:147-151` states the rule the whole octave cut was made to satisfy:
 * **"the field must contain no feature smaller than 8 degrees of arc"**, and anyone
 * raising the octave count has to show a 78-pixel blur test. The narrowest feature the
 * dome carries at all is the galactic band's core, `0.82*exp(-|sin b|/0.13)`, which is
 * about 5-7 degrees across.
 *
 * A cube face is 90 degrees over `size` texels. At 512 that is 5.69 texels per degree,
 * so an 8-degree feature is 45 texels and the band core is 30-40. Nyquist wants two.
 * The store is oversampled by more than an order of magnitude, which is why §"measured"
 * in the commit shows `fieldcheck` moving by less than its own run-to-run noise on all
 * four shots. 12.6 MB at `HalfFloatType`, which is the figure `space-backgrounds.md`
 * §5.2 budgeted.
 *
 * `HalfFloatType` AND NOT `UnsignedByteType`, for the reason item 4 gives: the field's
 * linear range is 0.002-0.35, entirely inside the toe. Stored as linear 8-bit, 0.002 is
 * code 0.5/255 and quantises to nothing.
 *
 * `LinearSRGBColorSpace` AND NEVER `SRGBColorSpace`: the cube is sampled inside the HDR
 * chain, before `OutputPass`, so it must hold the same linear radiance the live shader
 * wrote. An sRGB tag would apply a decode to values that were never encoded.
 */
import * as THREE from 'three';

/**
 * Sphere tessellation used for the BAKE ONLY. Nothing to do with the dome's own 32
 * segments: this one exists so `vDir` at a fragment is within a fraction of a degree of
 * the true ray direction through that texel, which is what makes the stored cube the
 * field itself rather than the field seen through a coarse sphere.
 */
const BAKE_SEGMENTS = 128;

/**
 * Bakes queued by `requestBake` and not yet run.
 *
 * A module-level queue rather than a scene traversal, and that is deliberate: the
 * renderer drains this once per frame and the steady state has to be a length check on
 * an empty array, not a `traverse` over the far scene. Nothing here allocates after the
 * queue is empty.
 */
const PENDING = [];

/**
 * Ask for `fn(renderer)` to run once, before the next frame is composed.
 *
 * `buildCelestials` has no renderer — it is called from `world/poi/index.js`,
 * `world/lighting/pois.js` and four probes, none of which hold one — so the bake cannot
 * happen where `space-backgrounds.md` item 4 puts it without changing files this stream
 * does not own. It happens at the top of `Renderer#render` instead, which reaches every
 * one of those paths uniformly and, importantly, BEFORE `renderer.info.reset()`, so the
 * bake's six draws are wiped from the counters rather than landing in whatever frame
 * follows. That is item 4's landmine 2, and `tools/bench.mjs` takes the PEAK over
 * frames, so a bake that leaked into one frame would be a permanent +6 on the budget.
 *
 * Filed as a request: this belongs inside `buildCelestials`.
 */
export function requestBake(fn) {
  PENDING.push(fn);
}

/** True when there is work queued. Cheap enough to call every frame. */
export function bakesPending() {
  return PENDING.length > 0;
}

/**
 * Run every queued bake. Called by `Renderer#render`; safe to call when empty.
 *
 * @param {THREE.WebGLRenderer} renderer
 */
export function runPendingBakes(renderer) {
  if (PENDING.length === 0) return 0;
  const n = PENDING.length;
  for (let i = 0; i < n; i++) {
    try {
      PENDING[i](renderer);
    } catch (err) {
      // A failed bake must not take the frame with it: the dome keeps its live shader,
      // which is slower and correct. Loud, because `tools/smoke.mjs` fails on a console
      // error and a silently un-baked sky is a 2.4 ms regression nobody would see.
      console.error('[celestials] sky bake failed, keeping the live shader:', err);
    }
  }
  PENDING.length = 0;
  return n;
}

/**
 * Run `fn(renderer)` with the renderer in a state safe for a one-shot offscreen bake.
 *
 * This is `space-backgrounds.md` item 4's proposed `withBakeState`, and all three of the
 * landmines it lists are r185-verified and handled here:
 *
 *   1. `renderer.js` pins `autoClear = false` and `CubeCamera#update` calls
 *      `renderer.render()` six times relying on `autoClear` to clear each face. Without
 *      restoring it the six faces accumulate on top of each other — a purely visual
 *      failure that raises no console error and would pass smoke.
 *   2. `renderer.js` pins `info.autoReset = false`, so the bake's draws would otherwise
 *      be added to whatever frame's counters come next. `info.reset()` in the `finally`.
 *   3. `toneMapping` is already forced to `NoToneMapping` for non-XR render targets
 *      (`WebGLRenderer.js:2351-2357`), so the cube comes out linear whatever the game's
 *      tone mapping is. It is set explicitly anyway so the bake does not silently depend
 *      on an internal.
 *
 * Also restores the bound render target, because `CubeCamera` restores it to what it was
 * when IT started and this runs mid-composition on some paths.
 */
export function withBakeState(renderer, fn) {
  const prevAutoClear = renderer.autoClear;
  const prevTone = renderer.toneMapping;
  const prevTarget = renderer.getRenderTarget();
  renderer.autoClear = true;
  renderer.toneMapping = THREE.NoToneMapping;
  try {
    return fn(renderer);
  } finally {
    renderer.autoClear = prevAutoClear;
    renderer.toneMapping = prevTone;
    renderer.setRenderTarget(prevTarget);
    renderer.info.reset();
  }
}

/**
 * Render a direction-only material into a cube map.
 *
 * The material must shade from `normalize(position)` in object space and nothing else.
 * It is rendered on the inside of a unit sphere from a `CubeCamera` at the origin, so
 * each texel ends up holding the material's output for that texel's own direction.
 *
 * `rt.texture.isRenderTargetTexture === true` — which three sets — suppresses the legacy
 * left-handed px/nx flip, so the cube needs no mirroring at sample time. A cube built
 * from six `DataTexture`s would.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Material} material  direction-only, `side: BackSide`
 * @param {number} size              texels per face
 * @returns {{target: THREE.WebGLCubeRenderTarget, ms: number}}
 */
export function bakeDirectionCube(renderer, material, size = 512) {
  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.name = 'sky-dome-bake';

  const geo = new THREE.SphereGeometry(1, BAKE_SEGMENTS, BAKE_SEGMENTS >> 1);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const cam = new THREE.CubeCamera(0.05, 4, target);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  withBakeState(renderer, (gl) => cam.update(gl, scene));
  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;

  scene.remove(mesh);
  geo.dispose();
  return { target, ms };
}
