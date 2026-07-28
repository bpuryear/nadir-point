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

### D2 · Cruiser silhouette reads as "long box with attachments" — `docs/probes/cruiser.png` · FIXED
The prow tapers but does not read as a prow at a glance, and the primary mass is close
to a constant-section rectangle over most of its length. The dorsal block, ventral bay
and engine fins all read well individually; the problem is the spine they hang off.
**Fix direction:** vary the section along the length, give the prow a committed shape,
and break the top line so the profile is not one continuous horizontal.

**Closed by the round-two hull rebuild** (`src/art/geometry/cruiser.js`). The first
attempt at this closed the box but produced a *worse* failure, which blind review named
exactly: it collapsed the forebody to a 74 m half-beam and hung an open A-frame in front
of it, so the forward third was two sticks, all the mass was aft, and with the fins
covered a reviewer could not say which end was forward. Round two:

- the section is carried forward — 228 m across and 142 m deep at z = +300, i.e. 84% of
  the shoulder beam five hundred metres ahead of the bridge
- a hard **chine break at z = +460**: the deck falls at 3.4° over the foredeck and at
  21.8° over the eighty metres after it, so there is one readable edge the foredeck
  falls into rather than a fair curve with no event
- the prow is a **32 x 18 m chisel**, not a needle; forward-200 m silhouette fall is
  97 m (R2.4 needs 90), deck 18.2° against keel 9.6°, ratio 1.9 : 1, tip centre 45 m
  below the axis
- the **hull is the forwardmost thing on the ship at every LOD**; the cutter yoke stops
  36 m short of the stem and its stays now run up and forward to meet it
- longest contiguous ±4% half-beam run is 140 m against the 160 m limit (was 510)

Verified in `cruiser-silhouette-side.png`, `-top.png` and at 320 px in
`cruiser-sil-30px.png`, where heading is unambiguous from the black shape alone.

---

## Pass 5 — cruiser rebuild, round two

### D9 · Cruiser read as three different ship classes across its three LODs · FIXED
`cruiser-lod2.png` carried a solid downward spike prow that existed at no other level,
had no fins where LOD0 had four, and filled the ventral bay voids in with solid boxes —
deleting the one feature nothing else in the game has, at the one distance where
silhouette is the only information available. Any LOD transition popped hard.

**Fixed** by authoring every LOD inward from LOD0's silhouette and making that a rule in
the file header. LOD1's stations are now picked by hand rather than decimated
every-other, so the waist and all three prow stations survive; all five bay frames
survive to LOD1 (the four voids cost eight triangles each); the sensor mast pole
survives to LOD1 at 29 px; LOD2 is built from `pick(HULL_STATIONS, …)` plus proxies for
the same four masses, including the bay slot as a real hole and two of the three fins.

### D10 · Coplanar and abutting faces read as holes and wireframe at LOD1 · FIXED
Three review findings were one class of bug:

- the hull loft capped its own transom **and** a `ringFace` was drawn on top of it at
  exactly z = −700. Two coplanar faces 0 m apart. Reported as "a dark elliptical void
  between the aft fins" and "a grid of thin black lines on the bridge".
- the salvage bay's frames abutted their chords exactly at y = −96 and y = −222 rather
  than overlapping, so the truss was held together only by a diagonal that LOD1 dropped
- the bay rails started at x = 116 against a ~104 m keel half-beam: the whole 320 m
  assembly hung off the ship with a 10 m air gap

**Fixed**: loft is `capBack: false` and the ring is the transom; frames overlap both
chords by 8 m; `BAY.railIn` is 98 so the rail bites into the keel.

### D11 · Detached geometry at LOD1 · FIXED
A spare drive bell was pinned at y = +88 over a deck at +73 and hovered fifteen metres
above the ship. It also stood mouth-up with no interior shell, so it rendered as a 54 m
black ellipse in the aft deck. It now lies down on a visible cradle with its mouth
astern and `inner: true`.

**A regression guard went in with it.** `src/probes/cruiser.js#floatingParts` runs a
union-find over shrunk part bounding boxes at LOD 0/1/2 and `console.error`s any part in
its own component, which fails the probe. The 0.5 m shrink is deliberate: parts that
merely abut are reported, because abutting faces are the coplanar bug above. Stated
limitation, in the code: the spine's bounding box is the whole ship, so this catches
anything outside the hull envelope and cannot catch a part buried in interior volume.

### D12 · Eight features of near-equal visual weight; no first read · FIXED
Blind review counted four identical aft fins, three bone-coloured mount pads, a bridge,
a bow gantry and a ventral truss, all competing. Every change was subtractive: five
radiator fins to **three** at spans 200/140/92 m and four different z values, two port
one starboard; mount pads moved from the `hull` surface to `plating` so they stop
reading as bone patches; the port bow derrick **deleted**; two bridge wings to one;
and the `trim` surface deleted outright — it existed for six bolt rings and one hazard
patch and cost a whole draw call to put an out-of-family colour on a grey ship.

### D13 · Nothing on the hull said 1400 metres · FIXED
The only recurring element was the 40 m running-light spacing, which is not a size
anyone has stood next to. Three features now carry a size the player knows: a
**54 x 34 m hangar mouth** in the port flank (three 18 m fighters wide), a **26 x 18 m
boat-bay hatch** on the starboard foredeck (exactly one fighter), and **5 m emissive
window bands** on the bridge (one storey). The hangar uses a new `greeble.js#recess`
primitive that is deliberately bottomless — the hull's own tumblehome flank, sitting
17 m down the tunnel and not perpendicular to the mouth, is what you see at the end.

### D14 · Running lights were the brightest thing on the ship · FIXED
At 13 m and 7 m across they read as a string of white spheres along the deck edge and
were doing the job the key light is supposed to do. Halved to 7 m and 4 m.

### D15 · Loadout probe rows did not match its own legend · FIXED
`loadouts.png` printed A/B/C top to bottom and `loadouts-top.png` printed C/B/A, because
screen-up is world +Y in the side view and world −X in the top view while both spread
along a positive offset. Rows now carry a per-view `sign` and each row **labels itself
inline**, projected from its own hull's world position, so the picture carries its own
key. See also the acceptance-criteria correction: that criterion was recorded PASS
against figures below the probe's own targets while the probe printed FAIL. It is now
recorded FAIL at mean 26.5 against a target of 45.

### D16 · Radiator panels read as tarpaulin, not hardware · PARTIAL
The fins were bare 7 m slabs whose only thickness cue was two end caps facing away from
the camera. They now carry a **rim spar** on the tip and trailing edge
(`greeble.js#radiatorFin` `rim` option), 13 m thickness, and a root fairing each.
**Still open, and not a geometry fix:** the high-chroma cobalt on every surface facing
away from the key is the POI fill light in `art/palette.js` / `world/lighting/poi.js`,
not albedo. It is the highest-chroma element in every cruiser frame on a hull whose
stated identity is grey. Owned by the lighting and materials streams — see the report.

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
