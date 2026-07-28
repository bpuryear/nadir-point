# Capital-ship design language

Research spec for the geometry and materials streams. Everything here is a number a
modeller can execute or a rule a reviewer can fail a build on. Where a rule came from
a measurement of reference art, the measurement is quoted.

This document does not change any code. It is the target the cruiser rebuild aims at,
and it is written against the defects already logged — **D2** (silhouette reads as a
long box), **D4** (plate tiling), and the acceptance-criteria FAIL on surface detail
density.

---

## 0. The pixel budget, because every rule below derives from it

The camera is `fov: 46`, `maxDistance: 46000`, LOD switches at 4200 and 14000
(`core/units.js`, `art/geometry/cruiser.js`). At a 1600-wide viewport the horizontal
half-FOV is 37.05°, so a 1400 m hull viewed broadside occupies:

| camera distance | hull width | metres per pixel | smallest feature that *reads* (3 px) |
|---|---|---|---|
| 260 m (min) | fills frame | — | — |
| 3 200 m (default) | 464 px | 3.0 m | 9 m |
| 4 200 m (LOD1 in) | 353 px | 4.0 m | 12 m |
| 14 000 m (LOD2 in) | 106 px | 13.2 m | 40 m |
| **46 000 m (max)** | **32 px** | **43.4 m** | **130 m** |

("30 px" is the shorthand; the real max-zoom figure is 32.3 px. Every number below
uses the measured 43.4 m/px.)

Three consequences that are not negotiable:

1. **"Readable at 30 px" is literally the max-zoom read, and at that distance the
   renderer is showing LOD2.** The mass hierarchy must be built into the ~150-triangle
   LOD2 proxy, not only into LOD0. If a mass is not in LOD2 it does not exist at the
   one zoom level where silhouette is the only information available.
2. **A feature smaller than 130 m in its silhouette dimension cannot be read at max
   zoom.** One pixel is 43 m. The bridge tower (144 m across) is a 3.3 px bump. The
   sensor mast (118 m tall, 8 m radius) is a 2.7 px × 0.2 px hair and effectively is
   not there.
3. **Anything authored below 12 m must not survive into LOD1.** At the LOD1 switch it
   is sub-3-pixel and is pure cost.

---

## 1. Mass hierarchy

### The rule

A capital ship reads as **three to five masses of clearly different size**. Not one
box with bumps, and not eight equal blocks. The eye resolves a silhouette by finding
the largest shape, then the next, then the next; if two masses are within ~25% of each
other in size the eye cannot rank them and the whole thing collapses into one blob.

**Measured from the references** (side/isometric extent, expressed as a fraction of
overall length L and of the side-view silhouette area):

| | UEE Stanton (SC Idris) | HW2 Hiigaran destroyer | HW1 Kushan Mothership | Javelin |
|---|---|---|---|---|
| primary mass, length | 1.00 L | 1.00 L | 1.00 L | 1.00 L |
| primary, share of side-view area | ~62% | ~58% | ~68% | ~55% |
| secondary (superstructure), length | 0.30 L | 0.34 L | 0.26 L | 0.22 L |
| secondary, share of area | ~20% | ~22% | ~16% | ~19% |
| tertiary (nacelles / legs / pods), length | 0.17 L | 0.13 L | 0.19 L | 0.16 L |
| tertiary, share of area | ~11% | ~12% | ~10% | ~15% |
| quaternary (masts, fins, gear) | ~0.08 L | ~0.07 L | ~0.06 L | ~0.09 L |

### What to commit to

**Area rule** (measure on an orthographic black-on-white side render, per mass):

```
primary    58 – 65 %  of silhouette area
secondary  18 – 24 %
tertiary    9 – 14 %
quaternary  3 –  6 %   (two of these at most)
```

**Size-step rule.** Sort the masses by their largest dimension. Each must be at least
**1.6×** the next one down. Nadir, with L = 1400:

**Four masses, and they all clear the 1.6 rule:**

| mass | z extent | largest dimension | ratio to the mass below |
|---|---|---|---|
| M1 main spine | −700 … +700 | **1400 m** | 1.63× ✔ |
| M2 ventral assembly (bay + cutter yoke) | −160 … +700 | **860 m** | 1.65× ✔ |
| M3 dorsal armour spine + superstructure | −480 … +40 | **520 m** | 1.73× ✔ |
| M4 stern block + drive array + radiators | −700 … −400 | **300 m** | — |

Four is enough. A fifth mass at ~190 m (the radiator bank, or the stowed grapple
cluster) would land at only 1.58× and start competing with M4 — leave those as
*surface* events on M4 and M2 rather than promoting them to masses.

**Why the current hull fails this.** The engine block (`ENGINE_STATIONS`, 230 m long ×
312 m wide × 166 m) and the salvage cradle (600 × 316 × 144) are within **1.1×** of
each other in projected side area, and both are "wide flat box" in proportion. Two
masses the eye cannot rank, so it stops trying and sees one lumpy object.

**Aspect rule.** No two masses may share an aspect ratio within ±20%. Under the table
above: M1 is 10.7 : 2.0 : 1 (long thin), M2 is 5.4 : 1.3 : 1 (long wide shallow), M3
is 2.7 : 1.4 : 1 (blocky), M4 is 1.0 : 1.9 : 1 (short and wide). No two alike.

**Vertical stacking.** Homeworld's readability trick is that the masses above the main
hull stack in a **stepped ziggurat in profile**, each step shorter than the one below:

```
deck 3  superstructure / bridge      190 m long,  y +66 → +250
deck 2  raised dorsal armour spine   520 m long,  y +40 → +80
deck 1  main hull                   1220 m long,  y -72 → +66
```

Each deck **above the main hull** is **≤ 0.5×** the length of the one below it
(190/520 = 0.37; 520/1220 = 0.43), and its footprint is **inset from the deck below on
at least three sides** by ≥ 25 m. That inset is what produces the horizontal shadow
lines that make a hull read as layered rather than extruded.

The ventral assembly is exempt from the ziggurat rule: it *hangs*, it does not stack,
and at 860 m it is deliberately longer than half the spine. That length is the read —
a salvager's working gear runs most of the ship.

---

## 2. The spine problem

### The measured defect

`HULL_STATIONS` holds half-beam ≈ 112–116 m from z = −330 to z = +180. That is **510 m
of constant section on a 1400 m ship — 36% of the length within a ±2% beam band.** The
top line moves from y = +52 to +58 over the same 510 m: 6 m of variation, which at max
zoom is 0.13 px. It is a rectangular prism, and no amount of surface treatment will
rescue it.

The prow fails the same test. Between z = +400 and z = +700 the total silhouette height
(including the cutter blade) goes from 170 m to 144 m — **26 m of convergence over
300 m of length, 0.55 px at max zoom.** The blade is doing all the work and the hull
itself is a truncated slab.

### Rules

**R2.1 — No constant section.** No **contiguous run** of stations longer than 160 m
(11% of L) may stay within ±4% of the run's starting half-beam. (Stated as "no two
stations anywhere" it would be unsatisfiable — any curve that comes back down through
a value would fail it. The constraint is on flats, not on repeated values.)

**R2.2 — One waist, one shoulder.** The **plan half-beam curve** along z must have
exactly two interior extrema: one minimum (the waist) and one maximum (the shoulder).
Three or more read as corrugation; zero reads as a tube. This rule is on the plan
curve only — the *profile* is allowed extra events, and §2's sheer deliberately adds
one.

**R2.3 — Waist depth ≥ 30%.** The waist's section area must be ≤ 0.70× the shoulder's.

**R2.4 — Prow convergence.** Over the forward 200 m the hull's silhouette height must
fall by **≥ 90 m** (2 px at max zoom), and the fall must be **asymmetric**: upper edge
descending at **≥ 14°** from horizontal, lower edge rising at **≤ 10°**, with the
ratio of the two **≥ 1.4 : 1**. Symmetric convergence reads as a needle or a cone.
Asymmetric convergence reads as a *bow*, because it puts the point below the axis,
which is what every ship's stem has done since antiquity.

**R2.5 — Prow tip offset.** At the forwardmost station the section centre must sit
≥ 14 m **below** the hull's y = 0 axis. This is the single cheapest change that makes
a nose read as a prow rather than as the end of a pipe.

### The station table

`[z, halfWidth, top, bottom]` in metres, ship space, +Z forward. Chamfers as in the
existing `octProfile` convention; five zones, none of them constant.

```
ZONE E — STERN BLOCK          widest point on the ship, at the transom
  -700   156    76   -84      <- maximum beam 156, an ENDPOINT not a bump
  -660   152    78   -88
  -600   146    76   -86
  -540   128    72   -76      <- step in begins

ZONE W — WAIST                the ship is visibly pinched here
  -470    96    56   -58      <- minimum beam 96.  32 m lost in 70 m of length
  -400   102    50   -62      <- deck dips: this is the dorsal cutaway

ZONE M — MIDBODY              rises to the shoulder
  -260   118    72   -68      <- deck high point, under the superstructure
   -40   134    68   -72      <- shoulder, maximum hull beam 134
  +120   128    64   -70

ZONE F — FOREBODY             continuous taper, no flats
  +260   104    58   -64
  +400    74    48   -66
  +500    58    34   -70      <- forefoot deepens: the cutter-yoke root

ZONE P — PROW                 asymmetric convergence to a chisel
  +560    46    16   -50
  +640    26    -6   -40
  +700     8   -24   -34      <- tip centre at y = -29, i.e. 29 m below axis
```

Check against the rules:

- Half-beam range 156 → 8 m, ratio 19.5 : 1. Longest contiguous ±4% run is **60 m**
  (z −660 to −600, 152→146), well inside the 160 m limit. Compare the current hull's
  510 m. **R2.1 pass.**
- Plan-curve extrema: exactly one interior minimum at z = −470 (96) and one interior
  maximum at z = −40 (134). The 156 at z = −700 is an *endpoint*. **R2.2 pass.**
- Waist full section 192 × 114 = 21 900 m²; shoulder 268 × 140 = 37 500 m².
  Ratio **0.58**. **R2.3 pass** (target ≤ 0.70).
- Prow: hull silhouette height is 104 m at z = +500 and 10 m at z = +700 — a fall of
  **94 m over 200 m**, against the 90 m requirement. Upper edge from +16 (z +560) to
  −24 (z +700) is 40 m over 140 m = **15.9°**; lower edge from −50 to −34 is 16 m over
  140 m = **6.5°**; ratio **2.45 : 1**. **R2.4 pass on all three clauses.** The cutter
  yoke below adds a further 170 m of outline fall on top of this.
- Tip centre y = −29. **R2.5 pass** (requirement ≥ 14 m below axis).

### Where to cut away to negative space

The current hull has essentially no through-holes: the only enclosed void in
`cruiser-silhouette-side.png` is the cradle's leg bays, roughly 3% of the bounding-box
area. The references sit at 6–12%. The Kushan Mothership's belly gap is ~8%; the
Idris's fore-aft flight-deck throat is ~7%; the Javelin's engine outriggers ~6%.

**R2.6 — Hole budget.** In an orthographic side render, background visible *through*
the hull must be **6–12% of the bounding-box area**. Below 6% the ship is a solid and
scale collapses; above 12% it stops reading as armoured.

**R2.7 — Hole minimum dimension.** A void reads at max zoom only if its narrowest clear
span is ≥ **87 m** (2 px at 43.4 m/px). Anything narrower is a slot, not negative
space, and only counts at LOD0/LOD1.

Three voids, all of which also *remove* triangles:

| void | extent (m) | clear span | opens onto | reads at |
|---|---|---|---|---|
| **Salvage bay throat** | z −160…+160, x ±105, y −72…−240 | 210 × 168 | ventral **and** aft face | max zoom |
| **Dorsal cutaway** | z −480…−300, x ±78, y +50…+96 | 156 × 46 | sky, between 5 ribs | LOD2 (3.5 px) |
| **Drive outrigger gaps** | z −700…−580, between block and 2 aux pylons | 96 × 120 | astern | max zoom |

The bay is open on **two** faces, not one. That is what makes it a hole rather than a
recess: as the camera orbits, stars pass through it. A one-sided cavity always reads as
a dark patch of hull.

### Sheer, tumblehome, flare

Naval architecture gives three curves that cost nothing and read at every distance.

- **Sheer** — the deck line is not straight. From the table: **−24** at the stem,
  rising steadily to **+72** at z = −260 (the high point, under the superstructure),
  **dropping 22 m to +50** at z = −400 where the deck plating is missing, then rising
  again to **+78** at the stern block. Three inflections, so the profile is never one
  horizontal — which is exactly what D2 asks for. The −400 dip is 22 m: 0.5 px at max
  zoom, but 5.5 px at the LOD1 switch and 7 px at the default camera, and the raised
  armour spine running over it doubles the apparent step.
- **Tumblehome** — the flanks slope **inward** going down. Set the chamfer so the
  maximum beam is at the deck chine and the keel half-beam is **0.78×** the chine
  half-beam. The Idris and the Stanton both do this; it makes the upper flank catch
  the key while the lower flank falls into shadow, giving a free two-value split on
  what is geometrically one surface.
- **Flare** — forward of z = +400, reverse it: the keel half-beam becomes **1.15×** the
  deck half-beam, so the cutter yoke's shoulders are the widest part of the bow. Flare
  forward + tumblehome aft is the difference between "a ship" and "an extrusion".

---

## 3. Frequency hierarchy for surface

### Measured

Method: render to 900 px wide, compute per-pixel luminance gradient magnitude, average
over 8×8 tiles inside the hull mask, classify tiles as **calm** (< 0.045), **medium**
(0.045–0.14), **dense** (> 0.14). Same thresholds for every image.

| asset | calm | medium | dense |
|---|---|---|---|
| SC Idris, side, dark render | 79.8% | 11.5% | 8.7% |
| HW2 Hiigaran Dreadnaught | 67.9% | 10.1% | 22.1% |
| SC UEE Stanton, isometric | 55.4% | 26.1% | 18.5% |
| SC Idris, Invictus quarter view | 54.2% | 39.0% | 6.8% |
| SC Javelin | 51.3% | 28.6% | 20.1% |
| HW2 Vaygr supercarrier | 74.7% | 15.5% | 9.8% |
| **reference median** | **62%** | **21%** | **14%** |
| — | | | |
| **ours: `docs/probes/cruiser.png`** | **49.2%** | 25.7% | **25.0%** |
| **ours: `docs/probes/cruiser-modules.png`** | **15.7%** | **67.9%** | 16.3% |

The module probe is the acceptance doc's "100% medium" finding, measured: 68% of the
surface sits in the middle band and only 16% is calm. There is nothing for the detail
to be *detail against*.

### The rule

```
calm    >= 60 %   large armour faces, panel-line grooves only
medium  <= 28 %   plate breaks, shallow steps, hatches, belt edges
dense   <= 12 %   struts, conduits, ribs, machinery, greeble clusters
```

Nadir's authored exterior is roughly **1.2 × 10⁶ m²** (the 1220 m spine alone is
~910 000 m²: a 748 m octagonal section perimeter at the shoulder × 1220 m). That makes
the budget **≥ 720 000 m² calm** and **≤ 144 000 m² dense**.

### Where dense belongs

Dense greeble is **concentrated in bands**, never scattered. Budget: **8 to 11 bands**
on the whole ship, each roughly **55 m × 200 m ≈ 11 000 m²**. A band qualifies only if
it satisfies one of these four justifications:

1. **At a joint between two masses.** Within 30 m of the step where one mass meets
   another — the waist/stern-block step at z ≈ −500, the bay rail meeting the keel,
   the superstructure footing. This is where a real structure has fasteners, cable
   runs and transition framing, and it is where the eye already expects an event.
2. **Inside a recess deeper than 8 m.** Greeble in a recess is self-shadowing, so it
   reads as depth even under a flat key. Greeble on a proud face reads as noise.
   Corollary: **if you want greeble somewhere, cut a recess for it first.**
3. **Around machinery.** The drive-well rim, the aux-bell collars, the radiator roots,
   the six mount pads, the grapple arm pivots. Machinery is allowed to look busy
   because machinery *is* busy.
4. **On functional edge structure.** Bay door tracks, rail stanchion feet, the truss
   diagonals. Not on the plate the track is bolted to.

### Where dense is forbidden

- **Any continuous armour face larger than 60 m × 120 m.** These are the calm reserve
  and they are what make the bands read. The two 700 m flank belts, the dorsal armour
  spine, the prow's outer plates, the bay's outboard rail faces.
- **The forward 200 m.** The prow's job is convergence; detail there fights it and it
  is the region most often silhouetted against a celestial.
- **Anywhere within 40 m of another dense band.** Two bands 40 m apart merge into one
  wide medium band at any distance past 3 km.
- **Symmetrically.** If a band appears at port x = −114, it must **not** appear at
  starboard x = +114 at the same z. Mirror-matched greeble is the strongest single
  tell of procedural placement. Offset the starboard equivalent by ≥ 60 m in z or omit
  it entirely.

### The plate-tiling fix (D4)

The current 17–20 m plate tile repeats ~75× along the hull. Two changes:

- **Largest plate module ≥ 55 m**, so it repeats ≤ 26× over 1400 m. Below ~25
  repetitions the eye stops reading a texture as a pattern.
- **A second, coarser frequency at 180 m** — the structural bay spacing. Every plate
  break must align to a multiple of 45 m (¼ bay), and every fourth break is a full
  structural frame that is *geometry*, not texture. This gives the flank a 180 m rhythm
  and a 45 m rhythm rather than one 18 m rhythm, and the 180 m one survives to 14 km.

The running-light spacing stays at 40 m game-wide (`SCALE_CUE`) and must **not** be
made a multiple of the plate rhythm — the two rhythms beating against each other is
what stops either from reading as tiling.

---

## 4. Structural logic for colour

### Why flat accent fills read as a plastic model kit

Three reasons, all mechanical:

1. **A painted quad has no thickness.** Real colour changes on hardware happen at a
   material boundary, and material boundaries on a spacecraft are almost always also
   *geometric* boundaries — a plate edge, a weld, a coating that stops where the heat
   shield starts. A fill that stops in the middle of a face has no shadow at its
   border, so at every lighting angle it stays perfectly flat, which is exactly the
   signature of a decal on styrene.
2. **It cancels the lighting.** The lighting rig is calibrated (`art/palette.js`) to
   put a key face at sRGB ~0.78, a 45° face at ~0.62 and shadow at ~0.25. That
   three-value read is the ship's form. A saturated fill applied across faces at
   different angles overrides the value difference with a hue that is constant, so the
   form flattens precisely where the fill is largest.
3. **It has no reason.** The player cannot invent a story for a blue rectangle on the
   side of a sponson. They can instantly invent one for a hazard stripe around a door
   that moves.

**Measured**: saturated albedo (HSV S > 0.5) covers **1.8–7.0%** of hull area on the
Star Citizen renders. `docs/probes/cruiser.png` measures **23.8%** and
`docs/probes/ships.png` **24.3%** — roughly 4–13× the reference. *Caveat, stated
honestly:* our probe's blue is partly the saturated planetshine fill described in
`palette.js`, not albedo, so the true albedo-accent figure is lower than 23.8%. The
comparison is still directionally right — the sponson tops, flank slabs and bay
members in `cruiser.png` carry a flat blue that does not change value across facets,
which is the diagnostic — but the number should be re-measured on an albedo-only
render before it is quoted as a delta.

### What accent must follow instead

**Budget: saturated accent ≤ 3.5% of hull surface area.** Emissive is counted
separately and is not part of this budget.

Only four categories are legal.

**(a) Structural edge.** A 2–4 m stripe running *along* a real geometric edge —
a chine, a plate lip, a frame flange. It starts and ends at a structural break and
never crosses one. Length 40–260 m. This is the Hiigaran destroyer's long stripe: it
follows the chine for 300 m and stops dead at the superstructure footing. Maximum four
on the ship, and they must all follow the same *kind* of edge.

**(b) Hazard zone.** 45° bars, 6 m pitch, amber on dark, **only where something moves,
opens, fires or gets hot**:

| location | why |
|---|---|
| bay door swing arc, ventral | doors move |
| grapple arm travel envelope, both rails | arms move |
| drive-well rim, z = −700 | exhaust |
| radiator root fairings | hot |
| cutter yoke shoulders | the cutting head traverses |

Each patch ≤ 40 m × 60 m. Total hazard area ≤ 1.2% of hull. On the Vaygr supercarrier
the hazard band is the *only* marking that survives to a 30 px read (measured in §8),
which is the argument for concentrating it rather than sprinkling it.

**(c) Functional marking.** Hull number, mount identifier, docking target, draught
marks. Single value, no outline, glyph height **≥ 12 m** so it is legible at the
default 3200 m camera (4 px) and disappears cleanly at LOD1. Maximum six markings.
Place them where a crew would need to read them: beside each mount pad, at the bay
mouth, on the stern block.

**(d) Emissive.** Running lights (40 m spacing, mandatory), drive bells, bay interior
lighting, cutter-head glow. Emissive is the one thing that may be saturated and small
and everywhere, because it is *light*, so the eye reads it as a source rather than as
paint.

### The recess-colour trick

Both the HW2 Hiigaran Dreadnaught and the SC Idris put their warmest colour **inside
recesses** — the Dreadnaught's ochre maw throat, the Idris's blue louvred vents. The
exterior stays neutral; the interior is warm and lit. This costs one extra material at
most and gives every deep cut on the hull a payoff.

**Rule:** any recess deeper than 12 m gets the interior surface, not the exterior one.
On Nadir: drive well, bay interior, dorsal cutaway between the ribs, the six empty
mount sockets. An empty socket that is *warm inside* is a far stronger "something goes
here" signal than a bolt ring.

---

## 5. Salvager identity

The player ship must be legible as a machine that grapples and cuts apart wrecks, and
must be **impossible to mistake for a purpose-built warship**. The reference for this
is the Nostromo far more than the Idris: a small command block, a big spine, huge
functional gear hanging off it, and tow hardware that is exposed because it has to be
serviced.

### The five reads, in the order the eye gets them

**1. Forward cutting gear — the ship leads with a tool, not a gun.**

A **cutter yoke**: two independent heads on a ventral A-frame forward of z = +380.

| | port head | starboard head |
|---|---|---|
| tip z | +690 | +656 (34 m aft — never level) |
| tip y | −186 | −172 |
| head length | 96 m | 96 m |
| head section | 26 m hex | 26 m hex |
| yoke arm root | z +400, y −62 | z +400, y −62 |
| deepest point of assembly | y = −230 at z = +540 | |

The two heads at different z is the whole point: a matched pair reads as a weapon
mount, a mismatched pair reads as tooling. The yoke's shoulders are the widest part of
the bow (flare, §2), which means the forward silhouette is a **claw, not a ram**.

Emissive: a 4 m disc at each head tip, warm white, on only while cutting.

**2. A genuinely open bay you can see through.**

Not a hangar door, not a recess. A through-slot:

```
extent          z −160 … +160   (320 m)
clear width     210 m  (x ±105)
clear height    168 m  (y −72 … −240)
open faces      ventral (full) and aft (full)
forward face    closed — the reactor bulkhead
rails           2, at x ±160, i.e. 26 m outboard of the 134 m half-beam at the shoulder
frames          4 uneven bays: 96 m, 62 m, 104 m, 58 m  (sum 320, never equal)
```

The 26 m rail overhang is what makes the bay a readable mass in plan view instead of
something hidden under the keel. The uneven bay spacing is what stops it reading as a
road bridge; every frame is where a load path is, and load paths are not evenly
spaced.

Verification: from a camera at 25° elevation abeam, **≥ 4% of the ship's bounding-box
area must be background seen through the bay.**

**3. External claws.**

Four grapple arms, **two per side**, stowed folded along the bay rails.

| | |
|---|---|
| stowed length | 96 m |
| extended length | 190 m |
| section | hex, 11 m radius |
| pivot positions (z) | +112, −38 port; +64, −96 starboard |
| stowed attitude | folded up against the rail, 12° off parallel |

The pivots are at **different z port and starboard**. Deliberate: symmetric grapples
read as landing gear.

**4. Asymmetric add-ons — 8–14% of hull volume is bolted-on kit that does not match.**

Keep what already works and add three:

| item | side | why it reads |
|---|---|---|
| 3 radiators port / 2 starboard | asymmetric | the ship lost one and the crew rebalanced |
| salvaged fuel cylinder, 250 m × 40 m | starboard flank | nothing about it matches the hull |
| cargo derrick over the bow | port | a crane nobody unbolted |
| **spare drive bell, lashed** | dorsal aft deck, x +48 | the crew is carrying a spare because they expect to need it |
| **captured armour plate, wired on** | port flank, z −180, at **7° off** the hull's plate grid | a repair made with someone else's plate |
| **exposed rib section, skin missing** | port **flank**, z −400 (distinct from the dorsal cutaway above it) | the ship is not finished and never will be |

The 7° mismatch is the load-bearing detail. A patch that aligns to the hull grid reads
as design; a patch 7° off reads as *repair*.

**5. What it must never have.**

- A symmetric forward gun battery.
- A smooth, continuous armoured prow.
- Turret barbettes in a regularly spaced line.
- Matched port/starboard sponsons with matched contents.
- Anything that looks like it left a yard as a set.

If a bare-hull render could be mistaken for a Coalition or Concord line ship with the
faction paint removed, the design has failed.

---

## 6. Loadout and modularity

### The measured problem

`docs/probes/loadouts.png` reports outline divergence between the three loadouts of
**21.7 – 25.1 m mean per z-bin** — about 5% of the 480 m envelope height specified in
§7, or 0.5 px at max zoom. Every module is a small growth
sitting on top of an unchanged mass. The loadouts are distinguishable, but they are
distinguishable the way two people with different hats are — the body is identical.

### The rule

**Modules must break the silhouette, not decorate it.**

**M1 — Projection.** Every module's bounding box must extend **≥ 55 m beyond the bare
hull's silhouette** in at least one of the three orthographic views, in a direction the
bare hull has no feature. A module entirely inside the bare hull's convex outline is
not a module, it is a texture.

**M2 — Divergence target.** Mean outline divergence between any two full loadouts
**≥ 45 m** per z-bin (currently 22–25), maximum divergence **≥ 120 m**.

**M3 — Cantilever.** A module's centre of mass must sit **≥ 0.45 × its own length**
outboard of its mount-pad centre. A module centred on its pad reads as a bump; a
module hanging off its pad reads as something that was bolted on afterwards and this
is the whole visual thesis of the ship.

**M4 — Overhang.** At least **two** of the six fitted modules must extend past the
hull's plan outline by ≥ 40 m. The plan view is where the current ship reads worst
(`cruiser-silhouette-top.png` is a slug); overhanging modules are the cheapest fix.

**M5 — Seeded misalignment.** Each socket applies a fixed per-socket rotation of
**3–7°** about an axis perpendicular to the mount normal, drawn from
`rng.fork('mount:' + id)`. Deterministic, so a seed reproduces; never zero, so nothing
lines up perfectly. This one rule does more for "welded on by a crew" than any amount
of surface detail.

**M6 — Band separation.** The six mounts must occupy six distinct silhouette bands so
no two modules stack into a single lump. Using the existing anchors:

| mount | anchor (m) | silhouette band it owns |
|---|---|---|
| bow | (0, 100, 470) | forward-upper, z +380…+620 |
| dorsal | (0, 130, 270) | upper-mid, y +130…+300 |
| ventral | (0, −66, −10) | below keel, y −66…−260 |
| port | (−152, 22, 48) | port beam, x −152…−260 |
| starboard | (152, 22, 48) | starboard beam, x +152…+260 |
| engine | (0, 0, −624) | astern, z −624…−820 |

No two bands may overlap by more than 25% of the smaller one's extent. Currently port
and starboard are exact mirrors, which satisfies the letter of this but violates §5 —
give them **different z extents** (port owns z +48…+180, starboard z −40…+96) so a
fully fitted hull is never bilaterally symmetric.

**M7 — Silhouette tags are a contract.** `ModuleDef.silhouetteTags` already exists in
`core/contracts.js`. Two modules on the same hardpoint must not share their full tag
set; the refit screen and the audit should both be able to fail on that. This is the
mechanism that fixes the acceptance doc's `bow_torpedo_tubes` vs `bow_breaching_prow`
failure, where the two separate only by a 17° droop.

### Attachment vocabulary

All six sockets already share one vocabulary — plinth, bolt ring, hex struts, capped
conduits (`emptyMount()` in `cruiser.js`). Keep it. Add one element: **a visible
service gap.** The module does not sit flush on its pad; it stands **6–10 m proud** on
four visible feet, with the gap open so you can see under it. That gap is a dark line
that separates the module's value from the hull's, which is what makes it read as a
separate object at 3 km, and it costs eight triangles.

---

## 7. Numbers a modeller executes directly

### Overall envelope

| | value |
|---|---|
| length | 1400 m (z −700 … +700) |
| maximum beam | 312 m (stern block, x ±156) |
| maximum hull beam | 268 m (shoulder at z −40, x ±134) |
| waist beam | 192 m (z −470, x ±96) |
| height, hull only | 166 m (y −88 … +78) |
| height, with superstructure | 338 m (y −88 … +250) |
| height, with bay and cutter | 490 m (y −240 … +250) |
| height, including sensor mast | 608 m (y −240 … +368) |
| **length : maximum beam** | **4.5 : 1** (1400 : 312, at the stern block) |
| **length : hull beam** | **5.2 : 1** (1400 : 268, at the shoulder) |
| **length : height incl. superstructure** | **4.1 : 1** (1400 : 338) |
| **length : working envelope height** | **2.9 : 1** (1400 : 490) |
| **hull beam : hull height** | **1.6 : 1** (268 : 166) |

Reference check: the Idris-M is stated as 240 × 125 × 45 m (`starcitizen.tools`),
i.e. L:B 1.9 : 1 and B:H 2.8 : 1 — a wide, flat frigate. Nadir at 5.2 : 1 and 1.6 : 1
is the opposite: long and near-square in section. That is the salvage-hauler read — a
spine with things hung off it — rather than the flat-carrier read. (Javelin figures
were not verified against a citable source and are deliberately not quoted here.)

### Zone lengths as fractions of L

| zone | z range | length | fraction |
|---|---|---|---|
| stern block | −700 … −540 | 160 m | 11% |
| waist | −540 … −400 | 140 m | 10% |
| midbody | −400 … +120 | 520 m | 37% |
| forebody | +120 … +500 | 380 m | 27% |
| prow | +500 … +700 | 200 m | 14% |

These are *section* zones. They are not the same as the four **masses** in §1 — M4
(stern block + drive array + radiators) spans z −700 … −400, i.e. the stern-block and
waist zones together, because the radiator bank trails forward over the waist.

### Deck heights

| deck | y | purpose |
|---|---|---|
| keel | −72 amidships, −88 at the stern block | hull bottom |
| bay floor plane | −240 | grapple rails, cutter clearance |
| main deck | +64 … +72 (it has sheer, see §2) | mount pads sit here |
| armour spine top | +80 | raised dorsal, 520 m long |
| bridge deck | +176 | bridge wings overhang here |
| bridge top | +250 | |
| mast tip | +368 | tallest point, fixes "up" from any angle |

### Chamfers and edges

Values are `octProfile`'s `chamW` at the shoulder station; scale them with the local
half-beam everywhere else.

| edge | chamfer width | why |
|---|---|---|
| deck chine (upper) | 28 m | carries the 40 m running lights; wide enough to be its own value at 3 km |
| keel chine (lower) | 20 m | tumblehome transition |
| prow edges | 6 m at z +560, scaling with the section to 2 m at the tip | tight, so the bow stays sharp; a chamfer cannot exceed the 8 m half-beam at z +700 |
| stern block edges | 34 m | heavy, so the stern reads as blunt against the sharp bow |

The bow/stern chamfer contrast (6 m vs 34 m) is a free front/back cue at every zoom:
sharp forward, soft aft.

### Panel and rhythm

| element | spacing |
|---|---|
| running lights | **40 m** (game-wide, `SCALE_CUE`, never overridden) |
| beacon every | 200 m (every 5th light) |
| structural frame (geometry) | **180 m** |
| plate break (texture) | 45 m, aligned to ¼ frame |
| largest plate module | **≥ 55 m** (≤ 26 repeats over L) |
| dense greeble band | 55 × 200 m, 8–11 of them |
| minimum gap between dense bands | 40 m |

The 180 m frame spacing governs the **spine's** plating rhythm. The salvage bay's four
frames are deliberately *not* on it (96 / 62 / 104 / 58 m, §5) — the bay is a separate
structure carrying a different load, and a regular rhythm there is what made the first
pass read as a road bridge.

### Triangle and draw-call allocation

`BUDGET.cruiserCoreTris` is 2000 and the current LOD0 spends 1956 across **14 draws**.
The benchmark is at 650 draws against a ceiling of 320, so the rebuild must be
draw-negative.

| | current | target | how |
|---|---|---|---|
| damage groups | 3 (core, dorsal, engine) | **2** (core, engine) | the bridge tower does not need independent damage geometry; it needs an independent *material swap* |
| surfaces in use | 6 | **4** (hull, plating, greeble, trim) | fold `hullDark` into `plating` with a value-varied map; keep `glass` as part of `trim` |
| merged meshes at LOD0 | 14 | **8** | 2 groups × 4 surfaces |
| instanced sets | 1 (running lights) | **4** — lights; bay ribs + rail stanchions together; radiator fins; mount furniture | 3 new `InstancedMesh`, replacing ~14 individual sub-meshes |
| **LOD0 draws** | **14** | **≤ 12** | 8 merged + 4 instanced. Net **−2** |
| LOD1 draws | 12 | **≤ 5** | one damage group × 3 surfaces + lights; drop everything authored below 12 m |
| LOD2 draws | 1 | 1 | unchanged |

**The spine changes are triangle-negative.** Adding stations to an existing loft costs
~8 triangles per station; the three voids *remove* capped faces. The waist, the sheer
and the prow taper are free — they are different numbers in the same table.

### LOD content, keyed to the pixel budget from §0

| LOD | switch | hull px | must contain | must not contain |
|---|---|---|---|---|
| 0 | 0–4200 m | ∞ → 353 | everything | — |
| 1 | 4200–14000 | 353 → 106 | anything ≥ 12 m | conduits, bolt rings, struts, glazing, mast spars |
| 2 | 14000–46000 | 106 → 32 | the 4 masses from §1, the prow taper, the bay void, the stern step | anything else at all |

**LOD2 is the 30 px read.** Its ~150 triangles must spend themselves on: the waist,
the shoulder, the asymmetric prow, the stern-block step, the bay throat as an actual
hole, and the superstructure as a distinct stack. Nothing else.

---

## 8. How to verify

Every rule above is checkable. Proposed additions to the review loop — none of these
are game code and none of them belong in a hot path.

**Silhouette rules (§1, §2, §6).** Extend the existing black-on-white ortho probes
(`cruiser-silhouette-side.png`, `-top.png`, `loadouts.png`) to also report:

- per-mass silhouette area share, against the 58–65 / 18–24 / 9–14 / 3–6 bands (R§1)
- the longest **contiguous** ±4% half-beam run, against the 160 m limit (R2.1)
- number of interior extrema in the plan half-beam curve, against exactly 2 (R2.2)
- hull silhouette height fall over the forward 200 m, against 90 m (R2.4)
- enclosed-background fraction, against 6–12% (R2.6)
- loadout outline divergence, against ≥ 45 m mean and ≥ 120 m max (M2)

**Surface rules (§3, §4).** A gradient-histogram pass over any probe PNG, using the
exact method and thresholds in §3 (900 px wide, 8×8 tiles, 0.045 / 0.14 boundaries),
reporting calm/medium/dense and saturated-albedo fraction. This is what produced the
table in §3 and it takes about 40 lines. It must be run on an **albedo-only** render
for the accent number, otherwise a saturated fill light contaminates it — see the
caveat in §4.

**The 30 px test.** Downsample any silhouette to 30 px wide and look at it. Applied to
the references and to our current hull, this is what it showed:

| | reads at 30 px? |
|---|---|
| HW2 Hiigaran destroyer | yes — pointed end, tall end, clear direction |
| HW1 Kushan Mothership | yes — light top / dark belly split, two legs below |
| HW2 Vaygr supercarrier | yes — one white hazard band survives, everything else dissolves |
| SC UEE Stanton | marginal — correct wedge, but one flat value |
| SC Javelin | **no** — dark on dark, too complex, illegible |
| **ours, side silhouette** | **partial** — the ventral bay reads, but both ends are blunt and direction is ambiguous |

Two lessons from that table. First, the assets that survive have a **value split
between top faces and side faces** — geometry alone is not enough, the lighting must
land differently on the deck than on the flank, which is what tumblehome buys. Second,
the *only* surface marking that survived to 30 px on any reference was the Vaygr
supercarrier's single concentrated hazard band. Evenly distributed detail always
dissolves. That is the entire argument for §3 and §4 in one observation.

Run order for a rebuild pass:

```
node tools/probe.mjs cruiser --out docs/probes/cruiser.png
node tools/probe.mjs cruiser --seed 'cruiser#view=side&sil=1' \
     --out docs/probes/cruiser-silhouette-side.png
node tools/probe.mjs cruiser --seed 'cruiser#view=top&sil=1' \
     --out docs/probes/cruiser-silhouette-top.png
node tools/probe.mjs loadouts --out docs/probes/loadouts.png
npm run bench -- --frames 60
npm run smoke
```

and then **read the PNGs**. Every rule in this document exists because someone looked
at a picture and it was worse than the reference.

---

## Appendix — references studied

Downloaded to scratch and inspected directly; none are committed to this repository
and none may be.

**Star Citizen (surface and structure at close range)** — Aegis Idris-M/P, Invictus
2954 fleet renders (side and rear quarter), Idris exterior concept sheets with
designer callouts, UEES Stanton isometric, Aegis Javelin ATV stills.
Source: `starcitizen.tools`.

**Homeworld (silhouette, tapering, spine architecture)** — HW2 Hiigaran destroyer,
Hiigaran Dreadnaught orthos, Hiigaran carrier, Vaygr flagship in dock, Vaygr
supercarrier side, Karos graveyard hulk, civilian tanker; HW1 Kushan Mothership and
carrier concepts. Sources: `videogamesartwork.com` (J. Aaron Kambeitz / Rob Cunningham
concept art), `well-of-souls.com/homeworld`.

**Alien (industrial towing rig)** — Ron Cobb's Nostromo design sketches and the
11-foot filming model. Source: `roncobb.net`. Cobb's stated method — design the ship
as if it were real, down to fuel tolerances and centres of gravity, and let form follow
from that — is the single most useful sentence for §5.

**Naval architecture** — sheer, tumblehome and flare as used in §2.

Not obtained: Bengal carrier and Hammerhead renders (no accessible source in this
environment), Expanse *Donnager* and BSG *Galactica* reference images (both wikis
returned 403/402 to automated fetch). The Galactica ribbed-spine point in §2 and §3 is
therefore argued from the general principle — a repeating structural rib exposed
between armoured sections — rather than from a measured image, and should be
re-checked against a real frame before it is leaned on hard.
