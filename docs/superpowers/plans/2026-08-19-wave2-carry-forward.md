# Wave 2 — carry-forward to Plan 3

Written at the close of Wave 2 (renderer + sim core). Everything here outlived the
wave's own scratch workspace deliberately: these are open decisions, measured costs
and one unverified acceptance item, not a task list.

Branch state at close: 24 commits, 551 tests, typecheck/build/purity clean.

---

## 1. Open decision — how bloom identifies an emissive

**The spec's premise is false.** It states the 52-colour master palette was built so
every emissive sits above every hull value in luminance, letting a single threshold
separate them. Measured against the real palette:

| | luminance |
|---|---|
| Dimmest emissive (`EMISSIVE.red`) | 0.495 |
| Brightest hull (`NEUTRAL[7]`) | 0.895 |

The ranges overlap completely and **no threshold can separate them.** At the shipped
`BLOOM_THRESHOLD = 0.72`:

- **Five of eight emissives never bloom**: `red` 0.495, `blue` 0.556, `magenta` 0.575,
  `orange` 0.598, `green` 0.717 (missing by 0.0032).
- **Five non-emissive ramp entries haze**: `NEUTRAL[6]` 0.759, `NEUTRAL[7]` 0.895,
  `COALITION_RAMP[6]` 0.794, `CONCORD_RAMP[6]` 0.811, `UI[6]` 0.864.
- `EMISSIVE.amber` — the player ship's running lights — clears by 0.010.

Ramps named `SALVAGE`/`VERDANT` do **not** exist; an intermediate review invented them.

This was theoretical until Wave 2's final fix wave, because bloom was inert at display
scale ≥3 (see §4). It is now visible on screen.

**Two candidate remedies**, and the argument between them:

- **Bloom on palette membership.** Bake a second, emissive-only bin set through the
  existing `bakeRotations` machinery over a buffer masked by `isEmissive`, draw it to
  its own container, and attach bloom to that container alone, composited additively.
  The threshold leaves the design entirely. A single-channel R8 mask atlas costs about
  ¼ of a colour atlas. This finally gives `EMISSIVE_SET` a consumer.
  Note a cheaper-looking variant does **not** work: flagging emissives via a spare
  alpha value fails because the frame composites over an opaque background, so source
  alpha is gone by the time the filter samples.
- **Re-grade the palette's luminance ranges** so a threshold becomes valid again.
  Cheaper to write, but it re-tints 52 shipped colours and every generated asset
  downstream of them to serve one filter, and re-opens Wave 1's gate.

Wave 2's final reviewer argued for the mask. **The decision is the user's and is
still open.** Every emissive Plan 3 adds inherits it, so decide before combat VFX.

`src/render/post.ts` carries an accurate comment describing this; the threshold and
mechanism were deliberately left untouched pending the decision.

---

## 2. Unverified acceptance item — parallax crawl

Spec §11's *"no input that requires the player to fight the camera"* group includes
**"parallax layers move at different speeds and none crawls against another."**

It is the one Wave 2 acceptance item **not genuinely established.** The sandboxed
browser tab never fires `requestAnimationFrame` while hidden, so the checks were driven
by pumping the ticker directly. That is sound for the other ten — deterministic sim
math, or static single-frame checks a pumped tick reproduces faithfully — but crawl is
specifically an artifact of many small, independently-rounded per-layer offsets drifting
over a *continuous* pan, which a single coarse jump cannot exercise.

Structurally it should be impossible: `placeLayer` is memoryless and reads an
already-quantised camera centre. But that is an argument, not an observation.

**Needs a human at a real animation loop, in a focused non-sandboxed tab.** Do it after
the wrapping fix landed (it has), not before — previously the backdrop slid away first
and would have masked anything subtler.

---

## 3. Measured atlas cost, and the half nobody costed

**Texture memory** — measured, worst-case fully-fitted loadouts (an upper bound, not an
average):

| | atlas | size |
|---|---|---|
| Player cruiser, tier 0 | 4048 × 552 | 8.52 MiB |
| Capital, tier 0 | 4080 × 816 | 12.70 MiB |
| All four LOD tiers, per ship | — | ~9.19 MiB (+7.9%) |

Extrapolated to Plan 3's benchmark scene (12 combat ships + 1 capital): **~110–150 MB**
of hull-bin texture alone. A residency/sharing question, not an overflow one.

**Overflow is not a risk.** Atlas width is `Math.min(maxWidth, columns * cellW)` by
construction and *decreases* as cells grow; its closeness to 4096 is just
`4096 mod cellW`. Height is the dimension that can overflow and `packUniform` throws a
`RangeError` when it would. Real height usage is 13% (cruiser) and 20% (capital); the
layout holds ~484 cruiser-size bins against the 64 needed, so bake cells would have to
grow past ~512px from today's 184 before one ship approached the ceiling.

**The uncosted half — boot-time CPU.** `bakeRotations` runs 64 bins × 4 tiers per ship,
synchronously on the main thread, for a single cruiser today. Thirteen ships is a
multi-second freeze at load with no worker, no cache and no progress path. **This is a
Plan 3 architecture decision and is cheaper to make before the combat code assumes an
answer.**

---

## 4. Notes for whoever touches these next

- **Gas-giant and star POIs have a vertical wrap seam.** Their celestial layer is
  `round(min(w,h) * 1.4)` = 378px for a 480×270 frame. `padLayerBuffer` pads the width
  axis only; height already exceeds the frame, so a long enough vertical flight will
  show the tile's bottom edge meeting its top. Inherent to a single-tile background
  containing one large feature. The other six POIs build layers at exactly frame size,
  where padding is a documented no-op. Graveyard — all Wave 2 renders — is unaffected.
- **`pivotOffset` carries a second-order assumption.** It treats tier 3's baked pivot
  (drawn from `profile.halfWidth`, symmetric per row) as coinciding with `ship.centreX`
  (the *plated* hull centreline, which can differ port/starboard after plating erosion,
  `src/gen/hull.ts:150-158`). Any residual is a correction shortfall, not a regression.
  Worth a visual spot-check bundled with §2's human pass.
- **The post chain must stay at virtual resolution.** It renders into a fixed
  480×270 `RenderTexture` and the integer scale lives on the presenting sprite. Attaching
  filters to a scaled container instead makes bloom's radius depend on window size and
  injects grain *inside* each art pixel. This was a shipped Critical; do not undo it.
- **Four defects in this wave were code that ran happily and produced nothing** — a
  texture upload that silently no-op'd, GL-only filters skipped wholesale under WebGPU,
  LOD tiers baked and never used, and `crossfadeAlpha` computed and never read. Two more
  surfaced in final review. Assume the fifth exists; the tell is a tested export with no
  production caller.
