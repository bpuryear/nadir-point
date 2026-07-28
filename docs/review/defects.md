# Defect log

Running list from visual review. Each entry has a location, a specific description and
a state. This file is the input to the review passes and is not allowed to be empty
just because a pass produced no new findings — an empty pass means look harder.

State: `OPEN` · `FIXED` · `ACCEPTED` (understood, deliberately not fixed, with a reason)

---

## Pass 0 — first art output (integration review)

### D1 · Cruiser hull value range is flat — `docs/probes/cruiser.png` · OPEN
The hull sits at an even mid-grey across almost every surface. There is no rim light
and the shadow side is nowhere near black. §4 of the brief calls for extreme value
contrast with ships defined by rim light and silhouette, because that is the single
highest-leverage technique for hiding polygon and texture limits. Right now the ship
reads as a grey model rather than a lit object.
**Fix direction:** raise the key/fill ratio hard, add a rim/kicker from behind, crush
the shadow end of the curve. This is a lighting fix, not a geometry fix.

### D2 · Cruiser silhouette reads as "long box with attachments" — `docs/probes/cruiser.png` · OPEN
The prow tapers but does not read as a prow at a glance, and the primary mass is close
to a constant-section rectangle over most of its length. The dorsal block, ventral bay
and engine fins all read well individually; the problem is the spine they hang off.
**Fix direction:** vary the section along the length, give the prow a committed shape,
and break the top line so the profile is not one continuous horizontal.

### D3 · Placeholder hull blows out and contradicts the key — `docs/probes/poi_giant.png` · OPEN
The stand-in box renders near-white with no readable key direction while the gas giant
behind it is correctly dark on its unlit side. This is an explicit acceptance-criteria
violation ("no object lit from a direction that contradicts the POI's key light").
Partly a placeholder artefact, but it also suggests near-camera objects are receiving
far more light than the POI rig intends.

### D4 · Panel tiling repeats visibly along a 1400 m hull · OPEN
*Self-reported by the materials stream.* A 17–20 m plate tile repeats roughly 75 times
along the cruiser. `opts.seed` gives genuinely different layouts but each seed is a
full triple bake, so it is a 2–3 variant budget rather than a solution.
**Fix direction:** a second detail-tiling frequency, UV randomisation per panel region,
or a stochastic sampler. Cheapest real win is the second frequency.

### D5 · Derelict faction reads "corroded", not "non-human" · OPEN
*Self-reported by the materials stream.* The ancient faction is currently a rectangular
BSP with skewed splits and an olive-gold palette — old and rusted rather than *not
designed by people*. The brief wants finding one to feel like an event.
**Fix direction:** a different subdivision primitive for derelict geometry, not a
different colour.

### D6 · `registry.get('damaged')` tiles its blast marks · OPEN
*Self-reported by the materials stream.* Battle damage is baked into a tiling texture,
so scorching repeats across the hull as a regular scatter. `registry.damageable()` is
the honest path but is uncached and costs a synchronous 100–200 ms triple bake per
call, so spawning a dozen damaged wrecks mid-combat will hitch.
**Fix direction:** a budgeted or deferred bake queue, amortised across frames.

### D7 · Seam shading is baked into albedo · OPEN
*Self-reported by the materials stream.* three's `aoMap` only affects indirect light, so
under a hard key with near-zero ambient it contributes almost nothing; cavity shading
was baked into albedo to make panel lines readable. Under an extreme grazing key or a
brighter IBL those seams will read as painted-on lines rather than as geometry.

### D8 · Texture memory is unmeasured and likely too high · OPEN
*Self-reported by the materials stream.* No per-distance map-size reduction, no
atlasing, no cap. Needs a measurement once real content lands, and probably 256² maps
at LOD 1–2.

---

## Deferred / accepted

### A1 · Frame rate is unverified — ACCEPTED (environmental)
No GPU in the build environment; headless Chromium runs ANGLE over SwiftShader. Draw
calls, triangles, programs and CPU step cost are measured and enforced. No fps figure
is asserted anywhere. Requires a run on target hardware to close.

### A2 · WebGPU path unverified — ACCEPTED (environmental)
`navigator.gpu` is unavailable here, so a `WebGPURenderer` path could not be validated
at build time. §5 of the brief permits shipping WebGL2 and saying so.
