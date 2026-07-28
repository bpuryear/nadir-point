# Acceptance criteria — status

Every item from §9 of the brief, with an honest state. `UNVERIFIED` means it was not
measured, not that it failed. Nothing here is marked PASS on the strength of intent.

Last updated: after wave 3 integration, before the visual fix pass.

---

## Performance

| Criterion | State | Evidence |
|---|---|---|
| 60 fps at 1440p on an Apple laptop | **UNVERIFIED** | No GPU in this environment. See below. |
| 1% lows above 50 fps | **UNVERIFIED** | Same. |
| Benchmark scene: 200+ debris, 12 combat ships, 1 capital, full post chain | **PARTIAL** | Debris fields and ships exist and instance correctly; the committed benchmark probe still needs assembling and running. |
| Draw calls under a committed ceiling, measured and reported | **PASS** | Ceiling committed at 320 in `core/units.js#BUDGET`. Assembled game measures **143 draw calls / 90,469 triangles / 58 programs**. |

### Why frame rate is unverified, stated plainly

The build environment has no GPU. Headless Chromium runs ANGLE over SwiftShader, a
software rasteriser. Draw calls, triangle counts, shader program counts, geometry and
texture counts, and CPU-side simulation cost are hardware-independent and are real
measurements. **Wall-clock frame rate is not.**

`tools/bench.mjs` deliberately refuses to print an fps pass/fail and says why, rather
than emitting a number that would be quoted back as if it meant something. Closing this
criterion requires running `npm run bench` on the target machine.

---

## Silhouette

| Criterion | State | Evidence |
|---|---|---|
| Every module identifiable from silhouette alone at max tactical zoom | **PARTIAL** | Most read. Self-reported failures: `engine_armour_belt` reads only as "the stern is slightly bigger"; `port_flak_cluster` merges into a lump when a barrel is occluded; `bow_torpedo_tubes` vs `bow_breaching_prow` separate only by a 17° droop. |
| Three loadouts of the same cruiser distinguishable in silhouette | **PASS** | `docs/probes/loadouts.png`, black-on-white. Forward lance + mast vs deep hangar belly vs jump ring astern. Outline divergence measured per z-bin: A/B 25.8 m, A/C 29.0 m, B/C 22.3 m. |
| Every faction ship class distinguishable from every other | **PARTIAL** | Cross-faction: pass, and clearly. Within-faction: Coalition Ardent vs Bulwark is the weakest pair, separating mainly on a 26 m waist notch that is ~13 px at review scale. Concord Peregrine reads as a horizontal smear with little vertical event. |

## Lighting

| Criterion | State | Evidence |
|---|---|---|
| Single consistent key direction per POI across every object | **FAIL** | `docs/review/pass1/three-quarter.png`: the cruiser renders near-uniform white with no readable key direction while the gas giant behind it carries a correct terminator. Open as defect D1/D3. |
| Shadowed regions retain readable value separation without ambient wash | **FAIL** | Same frame. Faces pointing in completely different directions read at nearly the same value, which is the signature of an IBL/ambient wash. |
| No object lit from a direction contradicting the POI key | **FAIL** | Same frame. |

These three are the highest-priority open work and are the subject of the current fix
pass. They are lighting and material calibration failures, not geometry failures.

## Scale

| Criterion | State | Evidence |
|---|---|---|
| Cruiser reads as kilometres long in a wide shot | **UNVERIFIED** | The wide capture timed out under software rasterisation before it rendered. Needs a clean capture run. |
| At least three independent scale cues in any wide frame | **PARTIAL** | Built and present: running lights at a single game-wide 40 m spacing, parallax debris at multiple altitudes, celestial bodies at true angular size, atmospheric perspective. Not yet confirmed in a rendered wide frame. |
| Zooming close to max distance never breaks the sense of size | **UNVERIFIED** | Needs the close/wide capture pair. |

## Feel

| Criterion | State | Evidence |
|---|---|---|
| The cruiser cannot change heading instantly at any speed | **PASS** | Turn rate degrades with the square of speed. Measured on the tuned figures: 14.9 s for 180° from rest, 9.9 s to shed cruise speed, and turn authority visibly lower at speed. |
| Every order produces visible feedback within 100 ms | **PASS by construction** | Order acknowledgement is emitted synchronously from `input/controls.js` in the same call stack as the DOM event, before any simulation step. |
| No input requires fighting the camera | **PASS (design), UNVERIFIED (hands)** | Drags are applied with zero smoothing; zoom is geometric in log space; pitch changes only when the player operates the zoom, never in response to translation. Not tested by a human hand. |

## Cohesion

| Criterion | State | Evidence |
|---|---|---|
| A salvaged module from every faction reads as intentional on the player hull | **UNVERIFIED** | Requires a render of a mixed-faction loadout on the player hull. Not yet captured. |
| No surface exceeds the established detail density | **FAIL** | Self-reported: a ~16 m plate tile on a 1400 m hull repeats ~87 times with high panel-to-panel albedo variance, reading as noise rather than plating. Open as defect D4. |
| The refit screen updates the 3D model live with no visible hitch | **UNVERIFIED** | Refit install/uninstall rebuilds the model synchronously in the same call, but this has not been measured for hitch under a real bake. |

---

## Summary

| | count |
|---|---|
| PASS | 5 |
| PARTIAL | 5 |
| FAIL | 4 |
| UNVERIFIED | 5 |

The four outright failures cluster into two root causes: **lighting/exposure calibration
on gameplay-scene objects**, and **surface detail density on large hulls**. Both are
being worked. The unverified items are mostly blocked on capture throughput in a
software-rasterised environment rather than on missing work.
