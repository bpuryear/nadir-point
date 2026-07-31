# Ship redesign — the hull language, second edition

**Supersedes parts of `docs/design/ship-language.md`. Read §12 of this file before you
treat any rule in that one as law.**

The owner has changed two standing constraints:

1. `core/units.js#BUDGET.cruiserCoreTris` (2000) is lifted. "Ignore the 2000 geometry
   side. We can go way higher. Let us just figure out performance balance."
2. A full hull and silhouette redesign is approved and is "the single most important
   thing we do. They have to look cool."

The reference is EVE Online, Homeworld and EVE Frontier. The brief is four words:
**flat, angular, sleek, realistic.**

This document turns those four words into numbers a build agent executes, states what
the redesign costs against the one budget that is actually tight (draw calls), and lists
by name what must not be touched because it already passes a gate.

Everything measured below was measured **in this tree at `37252e9`** with the commands
shown. Where a figure comes from my own knowledge of the reference fleets rather than
from a measurement, it is marked **[recalled]** and treated as a direction, not a datum.

---

## 1. What we have, measured

### 1.1 The cruiser is the boxiest capital in its own fleet, and that is measurable

`docs/probes/cruiser.png` and `docs/review/wave2/close.png` read as a stack of
rectangular prisms. That is not a matter of taste; it is a property of the surface
normals, and it can be counted.

Method: for every LOD0 triangle of every hull, take the face normal, weight by triangle
area, and report (a) the fraction of area whose normal is within 5° of ±X, ±Y or ±Z,
(b) the number of distinct normal directions holding ≥1% of area, (c) the share held by
the six largest normal directions. A stack of axis-aligned boxes is ~100% / 6 / ~100%.

```
AXIS-ALIGNED TRIANGLE AREA  (face normal within 5 deg of +-X/+-Y/+-Z)
clusters = distinct normal directions holding >=1% of surface area
top6     = area share held by the six largest normal directions

  player_cruiser           tris  1849  axis  74.0%  clusters  10  top6  71.6%  buckets 10
  coalition_corvette       tris   490  axis  44.9%  clusters  29  top6  44.9%  buckets 11
  coalition_frigate        tris   900  axis  52.3%  clusters  20  top6  49.5%  buckets 11
  coalition_monitor        tris   844  axis  57.0%  clusters  19  top6  54.1%  buckets 11
  coalition_destroyer      tris  1576  axis  50.8%  clusters  19  top6  48.4%  buckets 11
  coalition_carrier        tris  1592  axis  69.7%  clusters  18  top6  66.1%  buckets 12
  coalition_strikecraft    tris   138  axis  82.5%  clusters  13  top6  71.2%  buckets 5
  concord_corvette         tris   358  axis  55.3%  clusters  17  top6  59.3%  buckets 7
  concord_frigate          tris   616  axis  57.8%  clusters  20  top6  57.2%  buckets 9
  concord_escort           tris   532  axis  66.2%  clusters  13  top6  66.1%  buckets 8
  concord_destroyer        tris   832  axis  51.3%  clusters  23  top6  47.4%  buckets 12
  concord_tender           tris   648  axis  29.6%  clusters  16  top6  28.9%  buckets 9
  concord_strikecraft      tris   122  axis  74.2%  clusters  16  top6  68.2%  buckets 4
  derelict_ancient_hulk    tris  1734  axis  52.3%  clusters  13  top6  51.4%  buckets 10
```

The `tris` and `buckets` columns reproduce `ships/audit.mjs`'s LOD0 figures exactly
(490 / 900 / 844 / 1576 / 1592 / 138 / 358 / 616 / 532 / 832 / 648 / 122 / 1734), which
is the check that the script is building the same geometry the gate builds. It is worth
recording that the first run of this script did **not** match: it called
`def.partsFor(rng, lod)` positionally where the contract is `partsFor({ rng, lod })`
(`ships/common.js:417-418`), so every faction hull was built with an undefined RNG and
came out 20–40% light. The numbers below are from the corrected run.

The player cruiser — the hull the player looks at for the entire game — is at **74.0%
axis-aligned with 10 normal directions**, worse than every faction capital in the fleet
(worst faction capital: `coalition_carrier`, 69.7% / 18). `concord_tender` at 29.6% / 16
is what a faceted hull looks like in this codebase today, and it proves the machinery
can already do it.

The script is ~70 lines, imports `ships/index.js` and `cruiser.js#hullParts` directly and
needs no browser. It was written to scratch for this analysis and is **not committed** —
it belongs in `ships/audit.mjs` as a gate, and §13 says so.

### 1.2 The mean piece of this ship is an eighteen-triangle box

```
lod 0  buckets 10  separate primitives 99  tris 1849  tris/primitive 18.7
lod 1  buckets 10  separate primitives 77  tris 1414  tris/primitive 18.4
lod 2  buckets  3  separate primitives 23  tris  370  tris/primitive 16.1
```

Ninety-nine separate primitives averaging **18.7 triangles each**. A plain rectangular
prism is 12 triangles; an 8-gon prism is 20. That number *is* the diagnosis: the mean
piece of this ship is a box, there are ninety-nine of them, and the loft they are stuck
onto is 8-sided.

Note also that the header burned into `docs/probes/cruiser.png` — `LOD0 1989 TRIS / 11
DRAWS` — is **stale**. The live tree measures 1,849 / 10. The probe PNGs are evidence of
shape, not of counts.

### 1.3 The section is four big flat planes and four thin chamfers

`src/art/geometry/cruiser.js:223-259` — `HULL_STATIONS`, eleven rows, run through
`greeble.js#hullProfile` which returns exactly **eight points**
(`src/art/geometry/greeble.js:215-231`).

```
  z      beam  depth   B:H   perim  largest facet  chamfer share  facets
   -700   300   166   1.81    820    31.2%         13.7%        8
   -540   248   152   1.63    705    30.1%         13.4%        8
   -470   188   114   1.65    536    29.8%         14.0%        8
   -400   200   112   1.79    554    31.0%         13.5%        8
   -260   256   140   1.83    701    32.0%         12.0%        8
    -40   240   140   1.71    668    30.9%         12.9%        8
    300   208   142   1.46    640    28.1%         11.9%        8
    460   176   136   1.29    597    25.5%         11.5%        8
    540   172   100   1.72    502    28.9%         13.1%        8
    630   108    66   1.64    321    28.2%         14.4%        8
    700    32    18   1.78     92    28.4%         23.6%        8
```

One facet carries **25–32% of the section perimeter** at every station. The chamfers —
"where every rim light in the frame comes from", per that function's own doc comment —
carry **11.5–14.4%**. So 86% of the hull surface is four orthogonal planes. That is the
whole of the "chunky" read, and it is one function and one table away from being fixed.

Also note eleven stations over 1400 m: **one station every 127 m**. You cannot sweep or
taper a hull at that resolution. The section between z −260 and z −40 is a 220 m
straight-line interpolation between two nearly identical rectangles.

### 1.4 The envelope is taller than it is wide, and every reference is the opposite

`docs/probes/cruiser.png` header: `CRUISER 1402M X 490M X 618M`.

| | value | ratio |
|---|---|---|
| length | 1402 m | |
| envelope beam | 490 m | L : B = **2.86 : 1** |
| envelope height | 618 m | L : H = **2.27 : 1** |
| | | **B : H = 0.79 : 1** |

The height comes from the sensor mast (`y +366`) and the salvage bay floor (`y −252`).
`ship-language.md` §0 measured that mast itself as "a 2.7 px × 0.2 px hair and
effectively is not there" at max zoom — so 366 m of the 618 m envelope is bought by a
feature its own spec says does not read.

Every capital in the reference fleets is **wider than it is tall**, typically by 1.5–3×
**[recalled]** — an EVE battleship, a Homeworld carrier and an EVE Frontier hauler are
all read from above as a broad plate and from abeam as a thin one. Ours is a tower.

Fleet-wide, from `node src/art/geometry/ships/audit.mjs`:

| class | measured L × B × H | B : H | L : max(B,H) |
|---|---|---|---|
| coalition_corvette | 95 × 33.8 × 31.0 | 1.09 | 2.81 |
| coalition_frigate | 207.2 × 128 × 78.6 | 1.63 | 1.62 |
| coalition_monitor | 422 × 95 × 143 | **0.66** | 2.95 |
| coalition_destroyer | 490 × 106 × 175.8 | **0.60** | 2.79 |
| coalition_carrier | 900 × 482.5 × 376.3 | 1.28 | 1.87 |
| concord_corvette | 95.2 × 28.5 × 22.3 | 1.28 | 3.34 |
| concord_frigate | 210.4 × 72 × 65.1 | 1.11 | 2.92 |
| concord_escort | 300.2 × 190 × 122.5 | 1.55 | 1.58 |
| concord_destroyer | 480.4 × 202 × 165.7 | 1.22 | 2.38 |
| concord_tender | 625.2 × 268.4 × 258.8 | 1.04 | 2.33 |
| derelict_ancient_hulk | 3402.7 × 1347.3 × 1427.5 | 0.94 | 2.38 |
| **player cruiser** | **1402 × 490 × 618** | **0.79** | **2.27** |

Two coalition capitals are **taller than they are wide by 1.5×**. Nothing in the fleet
except `concord_strikecraft` is flat.

### 1.5 What is already good, and must survive

`node src/art/geometry/ships/audit.mjs` → `13 classes   ALL CLASSES WITHIN BUDGET AND ON
LINE`. All 78 class pairs separated; both factions clear the raised intra-faction bar.

`node src/art/geometry/modules/audit.mjs` → `every module on every mount is separable
from every other on that mount`. 46 same-mount pairs, five mounts, all clear.

`node tools/silhouette.mjs` → one connected piece per ship per view; cruiser enclosed
background side 6.47% / top 6.30% inside the 6–12% band; all four LOD2 identity features
present; LOD coherence cruiser LOD1 0.958, LOD2 0.811 against a 0.72 floor.

**These three outputs are the thing this redesign is most likely to break.** Faction
identity and module readability are already won and are not spendable.

### 1.6 The performance picture, and why triangles are not the constraint

`docs/review/benchmark.json`, hardware rasterisation, 2560×1440, 420 frames, quality
`high`:

```
peak.calls        506      ceiling 320     FAIL
peak.triangles    138315   ceiling 1900000 PASS   (7.3% used)
peak.programs     62       ceiling 90      PASS
fpsClaim.mean     29.21    low1pct 24.45
sceneCounts       1 capital, 12 combat, 930 instanced, 265 distinct meshes
```

I re-ran `npm run bench` once during this analysis. It reproduced **506 draw calls,
138,347 triangles, 62 programs** and reported 23.2 fps mean on a machine that was also
running this session — fps here is load-dependent, draw calls are not. The tool writes
`docs/review/benchmark.json`, which I do not own; I restored it with `git checkout --`
immediately and `git status` is clean for that path. Do not run `npm run bench --help`
expecting help: the flag is not recognised and it runs a full benchmark.

**Draw calls on a hull are (damage groups × surfaces), not primitives.** This is the
single most important fact for sizing the redesign and it is verifiable in code:

- `cruiser.js:571` — the bucket key is `` `${group}/${surface}` ``.
- `cruiser.js:1530-1546` — every bucket is re-keyed to `` `${group}/${surface}` `` and
  concatenated.
- `cruiser.js:1548-1563` — **one `THREE.Mesh` per key.** 99 primitives → 10 meshes.
- `ships/common.js:103-122` — the faction fleet does the same thing.

So adding facets, stations, recesses and primitives to an existing hull inside its
existing surfaces costs **exactly zero draw calls**. Adding a surface costs one draw per
damage group per hull, forever, at every LOD.

Where the draws actually go — measured this session with a ~25-line scratch script that
walks each `def.build()` result and counts meshes. Not committed; §13 asks for the module
half of it as a gate.

| | LOD0 | LOD1 (real) |
|---|---|---|
| cruiser hull | 10 buckets | 6 surfaces |
| 13 faction/derelict classes, summed | 120 | 71 |
| 24 modules, mean each | **6.3 meshes** | **6.0 meshes** |
| six fitted mounts on the cruiser | **38** | **36** |

A fully-fitted cruiser at the benchmark's 7.2 km camera costs **6 draws of hull and 36
draws of modules**. The module library costs six times the ship it hangs on, and it does
not shed a single draw between LOD0 and LOD1 — 150 meshes across 24 modules at LOD0,
145 at LOD1.

`docs/review/benchmark.md` notes that `renderer.info` counts GTAO's depth-normal
prepass, i.e. "roughly one scene counted twice" at `high`, and says plainly that nobody
has run `npm run bench -- --quality medium` to separate the two. **That measurement is
still not taken.** Nothing in this document depends on the doubling being exactly 2×;
where it matters I give both bounds.

---

## 2. What the four words mean geometrically

| word | what it is NOT | what it IS, as a number |
|---|---|---|
| **flat** | tall superstructures, stacked decks, masts | envelope B : H ≥ 1.5 : 1; hull-section B : H ≥ 1.7 : 1 at every station; nothing above the deck taller than 0.12 L |
| **angular** | rounded lofts, but also **orthogonal boxes** | ≤ 45% of surface area axis-aligned; ≥ 24 normal directions ≥ 1% each; no facet > 18% of section perimeter; every dihedral either < 12° (a fair panel break) or > 28° (a hard chine), never between |
| **sleek** | prismatic runs, constant section | ≥ 26 stations on a capital; section area strictly monotone forward of the shoulder; plan tangent ≥ 6° mean and ≥ 14° peak forward of the shoulder; deck line and keel line never parallel |
| **realistic** | more greeble | every feature ≥ 20 m names a function from the §7 inventory; detail is subtractive; no unexplained antennae, no chrome, no glowing panel lines other than the 40 m running lights |

"Angular" is the word that does the most work and it is the one most easily
misread. **Our hull is already angular in the sense of having hard edges; it is angular
in the wrong way — orthogonally.** EVE, Homeworld and EVE Frontier hulls are angular in
the sense of *many large planes meeting at many different angles*. The metric that
separates the two is normal-direction count, not edge sharpness. Adding more boxes
increases edges and does not increase normal directions; that is exactly what has been
happening for four art rounds.

---

## 3. The section — topology rules

These are checkable straight from a station table with no rendering, and they belong in
`Lines.audit()` (`ships/common.js:244-272`).

**S1 — Cardinality.** The hull section is a **14-gon**, up from 8. Named facets, in
order from the deck going clockwise on the starboard side:

```
  1  deck flat            ±deckFlatHalf,  top
  2  deck chamfer         ±deckHalf,      top − chamTop
  3  upper flank          ±shoulderHalf,  shoulderY
  4  knuckle              ±maxHalf,       knuckleY        <- the widest point
  5  lower flank          ±keelHalf,      bottom + chamBot
  6  keel chamfer         ±keelFlatHalf,  bottom
  7  keel flat            (spans the centreline)
```

Seven per side plus the two centreline spans = 14 points. Same winding and the same
`loft()` contract as `hullProfile`, so the two are interchangeable inside one loft — this
matters because the faction fleet and every module still use `hullProfile` and must keep
working unchanged.

**S2 — No dominant facet.** No single segment of the section may exceed **18%** of the
section perimeter. Current worst: 32.0% at z −260.

**S3 — Chamfers carry the read.** The four chamfer/knuckle segments (2, 4, 6 and their
mirrors) must together hold **≥ 34%** of the section perimeter. Current: 11.5–14.4%.

**S4 — Flat.** Section beam : depth **≥ 1.7 : 1** at every station of a hull ≥ 300 m.
Current cruiser worst: 1.29 at z +460, which is why the forebody reads as a blob.

**S5 — The knuckle is not on the deck.** The widest point of the section
(`maxHalf`) must sit between **0.30 and 0.55 of the section depth below the deck**, never
at the deck and never at the keel. A hull whose widest point is its deck edge is a box
with a lid; a hull whose widest point is a knuckle a third of the way down reads as a
plated hull with a beltline, which is the EVE/Homeworld read and it is one number.

**S6 — Dihedral band.** Between adjacent facets the dihedral is either **< 12°** (a fair
panel break within one plane family) or **> 28°** (a hard chine that catches a rim
light). Nothing between 12° and 28°: that band reads as a modelling accident under any
key, and it is what makes a low-poly loft look unfinished rather than faceted.

**S7 — Tumblehome and flare survive.** `keelRatio` (`common.js:145-166`) stays. 0.72–0.84
aft of the forefoot; 1.05–1.15 forward of it. This rule is already in the tree, already
correct, and is now expressed through facet 5 rather than through the whole flank.

**S8 — No two stations share a section shape.** Normalise each station's 14 points by its
own beam and depth; no two stations may agree to within 2% on all 14. This is the
generalisation of R2.1 that actually forbids prismatic runs, and unlike R2.1 it cannot be
satisfied by moving a beam number up and back down again.

---

## 4. The spine — one body, not a stack

**L1 — Station count.** A capital ≥ 300 m carries **≥ 26 stations**; the cruiser carries
**28**. Mean spacing on the cruiser 50 m, minimum 20 m through the prow and the knuckle
break, maximum 90 m in the two declared calm runs.

**L2 — Sweep rate.** Between adjacent stations the deck half-beam must change by
**≥ 0.8% of the local half-beam per 10 m of z**, except inside at most **two declared
calm runs of ≤ 120 m each** per hull. This replaces R2.1's "no ±4% run longer than 160 m"
with a rule that bites everywhere rather than only on long flats.

**L3 — Monotone forebody.** Forward of the shoulder, section area is **strictly
decreasing**. No station forward of the shoulder may be larger than the one behind it.
(Aft of the shoulder R2.2's single waist and single maximum still apply.)

**L4 — Plan sweep.** Over the run from shoulder to tip the plan tangent must average
**≥ 6° off the centreline** with a peak of **≥ 14°**. A taper that never exceeds 6°
reads as a cone; a leading edge that hits 14° reads as swept, and swept is the single
strongest EVE/Homeworld plan cue **[recalled]**.

**L5 — Nothing parallel.** At every adjacent station pair,
`|d(top)/dz − d(bottom)/dz| ≥ 0.04`. The deck line and the keel line are never parallel
anywhere on the ship. This is what "the section changes along the length" means when you
have to check it.

**L6 — The superstructure is faired in, not stacked on.** This is the rule that replaces
`ship-language.md` §1's stepped-ziggurat rule, which is the direct cause of the box stack
in `docs/review/wave2/close.png`.

- The island is **one loft sharing the hull's station z values**, not a set of boxes. It
  rises out of the deck plane and falls back into it.
- Maximum height above the deck plane: **0.12 L** (168 m on the cruiser, against the
  current 258 m of bridge plus 366 m of mast).
- Minimum length: **0.24 L** (336 m on the cruiser, against the current 190 m). Long and
  low, not short and tall.
- Its leading edge is **raked ≥ 22° from vertical** and its trailing edge ≥ 12°.
- Where it meets the deck there is a **fillet station** — one extra station 12–20 m out
  from the join on each side, so the join is a chamfer and not a right angle. This costs
  28 triangles and it is the difference between "grown out of the hull" and "sat on top
  of it".
- **The free-standing sensor mast is deleted.** It is 366 m of envelope height buying
  0.2 px at max zoom. Sensors become flush apertures (§7).

**L7 — Appendages are lofts too.** The bay rails, the drive pylons, the radiator roots
and the cutter yoke arms are all currently boxes or hex struts. Each becomes a loft of
≥ 4 stations with its own taper. A strut with a constant section is the same defect as a
hull with a constant section, at a smaller scale.

---

## 5. Proportion — the per-class table

Declared lengths do **not** change. `ships/audit.mjs:58-62` fails a class whose measured
length drifts more than 5% from its declared length, and the sim, the AI and the economy
all key off `def.length`. Only beam and height move.

Two ratios govern:

- **envelope B : H** — the "flat" test.
- **L : B** — how much of the length reads as length.

Faction philosophy stays split, because that split is what the intra-faction gate is
already resting on (`ships/audit.mjs:152-210`):

- **Coalition — flat, angular, SLAB.** Wide planar armour rafts, hard 30–45° chamfers,
  exposed flat trusses, structure on the outside. EVE Amarr/Minmatar-industrial, Homeworld
  Vaygr **[recalled]**. "Sleek" here means *one continuous faceted object*, not
  aerodynamic.
- **Concord — flat, angular, SLEEK.** Swept continuous surfaces, long uninterrupted
  leading edges, few breaks, structure inside. EVE Gallente/Caldari, Homeworld Hiigaran
  **[recalled]**.

| class | L (fixed) | B now | H now | **B target** | **H target** | B:H | L:B | plan-view signature (the thing that separates it) |
|---|---|---|---|---|---|---|---|---|
| coalition_corvette (Lancet) | 95 | 33.8 | 31.0 | **44** | **17** | 2.59 | 2.16 | rectangular raft, blunt bow, two outboard boom rails aft |
| coalition_frigate (Ardent) | 210 | 128 | 78.6 | **138** | **44** | 3.14 | 1.52 | wide diamond, two full-length sponson slabs, square transom |
| coalition_monitor (Sledge) | 420 | 95 | 143 | **140** | **72** | 1.94 | 3.00 | long narrow wedge, one enormous forward barbette breaking the outline to starboard |
| coalition_destroyer (Bulwark) | 480 | 106 | 175.8 | **200** | **74** | 2.70 | 2.40 | split hull — an open centreline gap amidships at z ±40, which is why the line audit exempts it from R2.2 by name |
| coalition_carrier (Anvil) | 900 | 482.5 | 376.3 | **470** | **168** | 2.80 | 1.91 | catamaran: two full-length hulls, open deck between them |
| coalition_strikecraft (Bolt) | 18 | 8.6 | 8.2 | **13** | **3.4** | 3.82 | 1.38 | cruciform |
| concord_corvette (Whipcord) | 95 | 28.5 | 22.3 | **30** | **13** | 2.31 | 3.17 | needle with two tail booms and a rectangular void between them |
| concord_frigate (Meridian) | 210 | 72 | 65.1 | **78** | **24** | 3.25 | 2.69 | narrow arrowhead, unbroken leading edge tip to transom |
| concord_escort (Halcyon) | 300 | 190 | 122.5 | **176** | **50** | 3.52 | 1.70 | broad delta with a notched trailing edge |
| concord_destroyer (Peregrine) | 480 | 202 | 165.7 | **210** | **72** | 2.92 | 2.29 | forward-swept twin leading edges meeting on a long centre spike |
| concord_tender (Solace) | 620 | 268.4 | 258.8 | **250** | **112** | 2.23 | 2.48 | lenticular ring — a closed loop with an interior void |
| concord_strikecraft (Shrike) | 18 | 12.8 | 4.1 | **12.8** | **4.1** | 3.12 | 1.41 | swept cross — **already flat, do not touch** |
| derelict_ancient_hulk | 3400 | 1347.3 | 1427.5 | **exempt** | **exempt** | 0.94 | 2.38 | it is an alien wreck and its wrongness is the point. Faceting yes; proportion no. |

### The player cruiser

| | now | target | note |
|---|---|---|---|
| length | 1402 | **1400 ± 10** | fiction: it is 1.4 km |
| hull-only beam (the loft) | 300 | **330** | |
| hull-only depth | 166 | **150** | |
| hull section B : H | 1.29–1.83 | **≥ 1.90 mean, ≥ 1.70 worst** | S4 |
| envelope beam | 490 | **560** | bay rails move outboard, x ±280 |
| envelope height | 618 | **330** | see the height ledger below |
| envelope B : H | **0.79** | **1.70** | the headline change |
| L : envelope B | 2.86 | 2.50 | |
| L : envelope H | 2.27 | **4.24** | |

Height ledger — where the 288 m comes from:

| feature | now | target | why |
|---|---|---|---|
| sensor mast tip | +366 | **deleted** | 0.2 px at max zoom by §0's own maths; replaced by flush apertures (§7) |
| bridge/island top | +258 | **+150** | island becomes 336 m long instead of 190 m tall (L6) |
| deck plane | +64…+80 | unchanged | mount pads live here; moving it re-fits 24 modules |
| keel | −86 | −75 | |
| salvage bay floor | −252 | **−160** | bay gets **wider and shallower**: clear span 210 → 300 m, depth 168 → 85 m. Void area is preserved; the through-read is preserved; 92 m of height is not |
| cutter yoke deepest | −228 | **−180** | |

The bay trade is the one to think hardest about. It is the salvager identity and it is
the one feature nothing else in the game has. Widening it while flattening it **keeps the
enclosed-background fraction inside R2.6's 6–12% band and improves the plan-view read**
(currently 6.30%, the weaker of the two views), while removing the single largest
contributor to a 618 m envelope height. If the build agent cannot hold 6% enclosed
background at the new depth, the correct fix is to widen further, never to deepen back.

### The warning about spending divergence

Every hull gets flatter. That means the **profile view loses discriminating power across
the whole fleet at once**, and the profile is where the current gates have the most
margin. Two consequences:

1. **Separation is bought in PLAN from here on.** That is why the table above assigns
   every class a named plan signature. `docs/probes/ships-silhouette-top.png` is the
   sheet that matters now.
2. **Change one class at a time and re-run `node src/art/geometry/ships/audit.mjs` after
   each.** If a pair drops below the bar, the fix is to change that class's *plan shape*,
   never to revert its proportion. The current closest coalition pair is
   `monitor / destroyer` at mean 10.2 against a 10.0 bar — that pair has **2% of margin**
   and both classes are in the table above with large height changes. Do those two last,
   and do them together.

---

## 6. Where detail lives — subtractive, not additive

This is the topology change, and it is the reason the redesign is affordable.

**D1 — Additive primitives are capped, hard.** The cruiser LOD0 goes from **99 separate
primitives at 18.7 triangles each** to **≤ 55 primitives at ≥ 160 triangles each**. Not a
suggestion: it is the mechanical expression of "stop adding boxes". Faction capitals:
≤ 34 primitives, ≥ 100 triangles each.

**D2 — Detail inside the silhouette.** A feature may sit outside the hull loft's outline
only if it is one of the **six declared appendages**: salvage bay, cutter yoke, radiator
bank, drive pods, the six mount pads, and the island. Everything else — panel breaks,
intakes, service gaps, hatches, conduit runs, greeble clusters — lives **at or below the
surrounding surface**.

**D3 — Cut the recess first.** `ship-language.md` §3's best sentence survives verbatim
and is promoted to the governing rule: *if you want greeble somewhere, cut a recess for
it first.* A recess ≥ 8 m deep self-shadows, so it reads under a flat key; greeble on a
proud face reads as noise. With the triangle budget lifted this is now cheap: a
rectangular recess in a lofted face is 16 triangles and it **removes** the face it
replaces.

**D4 — Trough greeble.** Dense clusters go in troughs between raised armour planes, never
on top of them. Budget raised from §3's 8–11 bands to **12–16 bands** on the cruiser,
each ~55 × 200 m, because a band in a trough costs triangles we now have and buys
self-shadowing we did not have. Every band still claims one of §3's four justifications
(mass joint / recess ≥ 8 m / machinery / functional edge structure) and none is mirrored.

**D5 — Panel breaks are geometry now.** §3's 180 m structural frame / 45 m plate break
rhythm stands, but with the budget lifted the **180 m frames become real geometry** — a
6 m step in the plane, 24 triangles each, eight of them on the spine — rather than
texture. That step is what survives to LOD1 and it is what makes a 1.4 km hull read as
1.4 km.

**D6 — Nothing bolted on symmetrically.** `ship-language.md` §5's asymmetry rules survive
in full and are the reason a bare hull cannot be mistaken for a line ship.

---

## 7. What "realistic" buys — the functional inventory

Every feature ≥ 20 m on the cruiser must appear in this table with a function you can
name in one clause. If it is not here, it does not go on the ship.

| feature | count | size | where | function |
|---|---|---|---|---|
| radiator panels | 3 | spans 200 / 140 / 92 m | 2 port, 1 starboard, four different z | heat rejection. **Re-plane as flat raked panels, not ribbed fins.** A radiator is a flat plate; ribs on one are a lie |
| main drive well | 1 | 108 m across | transom, z −700 | an obvious empty socket. Keep |
| outrigger drive pods | 2 | 60 m across | x ±212 on single pylons | the ship lost its main drive and limps on two |
| **exposed thrust frame** | 2 | 120 m long | from each pod root forward into the flank | **new.** The load path from a bell into the hull, visible. This is the single most convincing "real machine" cue the references share **[recalled]** and we have none of it |
| **flush sensor apertures** | 3 | 44 × 18 m, recessed 3 m | island flanks and foredeck | **new, replaces the mast.** Phased arrays are flat panels. This is a proportion fix and a realism fix in one |
| **RCS quads** | 8 | 12 m | four at the envelope corners, four amidships | **new.** Attitude control. Eight 12 m clusters at the extremes tell the eye where the ship's corners are, which is exactly what a flattened silhouette needs |
| docking collar | 1 | 34 m | port flank at the bay mouth | crew transfer |
| hangar throat | 1 | 54 × 34 m | port flank | three fighters wide — an existing scale cue, keep |
| boat-bay hatch | 1 | 26 × 18 m | starboard foredeck | exactly one fighter — keep |
| cutter heads | 2 | 96 m, tips 36 m apart in z | ventral A-frame | the tool the ship leads with. Mismatched on purpose |
| grapple arms | 4 | 96 m stowed / 190 m extended | along the bay rails, pivots at different z port and starboard | tow |
| airlocks | 4 | 8 m | beside each mount pad | service access. Below the 12 m LOD1 floor: LOD0 only |
| running lights | every 40 m | — | upper chine, whole hull | the ruler. `SCALE_CUE.runningLightSpacingM`, never overridden |

Forbidden under "realistic": chrome or mirror finishes; glowing panel lines other than
the running lights; windows larger than 5 m; visible crew decks; antennae without a
mount; anything that repeats more than twice at even spacing.

---

## 8. Budget

### 8.1 Triangles — spend freely

| | measured now | **new ceiling** |
|---|---|---|
| cruiser LOD0 | 1,849 | **9,000** |
| cruiser LOD1 | 1,414 | **3,600** |
| cruiser LOD2 | 370 | **800** |
| capital class ≥ 300 m, LOD0 | 532–1,592 | **5,000** |
| escort class 95–210 m, LOD0 | 358–900 | **2,000** |
| strikecraft LOD0 | 122–138 | **400** |
| derelict LOD0 | 1,734 | **6,000** |
| module LOD0 | ≤ 400 | **1,200** |

Sanity check on the scene. Force **every** hull in the benchmark to LOD0 at its new
ceiling: 1 cruiser 9,000 + 6 modules × 1,200 = 7,200 + 12 combat ships × 5,000 = 60,000
→ **76,200 triangles of ship geometry**. The whole scene today peaks at 138,315 including
930 instanced debris objects, the skybox and the post chain, of which ships are a small
minority. The redesign therefore cannot plausibly take the scene past **~210,000
triangles, 11% of the 1,900,000 ceiling.** Triangles remain a non-issue by a factor of
nine. This is the whole argument for why the redesign is affordable and it is worth
restating to anyone who flinches at a 5× triangle count.

Where the triangles go on the cruiser, as a plan:

| | triangles |
|---|---|
| spine loft, 28 stations × 14-gon (27 bays × 28 + 2 caps × 12) | 780 |
| island loft, 12 stations × 14-gon, faired in | 340 |
| salvage bay: rails, 5 frames, 2 chords, all as lofts | 1,400 |
| cutter yoke, 2 heads + A-frame, as lofts | 700 |
| stern: transom, drive well, 2 pods, 2 thrust frames | 1,100 |
| 3 radiator panels as flat raked planes | 300 |
| 8 structural frames as real 6 m steps | 200 |
| 12–16 recessed greeble bands | 1,900 |
| 6 mount assemblies | 900 |
| flush apertures, RCS quads, collar, hatches, airlocks | 600 |
| running lights and emissive | 180 |
| **total** | **8,400 of 9,000** |

### 8.2 Draw calls — spend almost nothing

| | measured now | **budget after** | change |
|---|---|---|---|
| cruiser hull LOD0 | 10 | **≤ 10** | 0 |
| cruiser hull LOD1 | 6 | **≤ 6** | 0 |
| cruiser hull LOD2 | 3 | **≤ 3** | 0 |
| damage groups (`GROUPS`) | 2 | **2** | 0 |
| cruiser surfaces | 5 in `SURFACE` + `engineGlow` raw = 10 buckets | **same 5 + raw** | 0 |
| faction surfaces per hull (`SURFACES`) | 6 | **6** | 0 |
| 13 faction classes, LOD0 summed | 120 | **≤ 120** | 0 |
| 13 faction classes, LOD1-real summed | 71 | **≤ 71** | 0 |
| **24 modules, meshes each** | **6.3 / 6.0** | **≤ 3 / ≤ 2** | **−3.3 / −4.0** |
| **six fitted mounts** | **38 / 36** | **≤ 18 / ≤ 12** | **−20 / −24** |
| shader programs | 62 | **≤ 62** | 0 |

**The hull redesign is draw-neutral by construction** — proven at `cruiser.js:1530-1563`,
where every bucket collapses to one mesh per `group/surface`. Facets, stations, recesses
and primitives are free. The redesign is only draw-negative because it is the natural
moment to merge the module library, which is the one place a real saving exists.

Expected benchmark movement: **506 → 458** if GTAO doubles as `benchmark.md` suspects
(24 module draws saved × 2), or **506 → 482** if it does not. Either way the benchmark
still fails 320, and **the redesign is not asked to fix it**. The remaining gap is scene
furniture, LOD switch distances and the GTAO prepass, all of which belong to the
performance stream. Say so in the report rather than letting the redesign be blamed for
a number it did not cause.

### 8.3 The three hard rules of the draw budget

1. **No new surface names.** Not on the cruiser, not on a faction, not on a module. A
   sixth cruiser surface costs 2 draws at LOD0 and 1 at every other LOD, forever.
2. **No new damage groups.** `GROUPS = ['core', 'engine']` (`cruiser.js:563`). A third
   group multiplies every surface.
3. **No off-grid material options.** `wear` is quantised to 0.125 by the registry
   (`ships/common.js:63-68`). A hull that authors `wear: 0.55` where another authors
   `0.5` gets a second material and a second draw and nobody notices for a month.

---

## 9. LOD — how a faceted hull decimates

A box stack decimates by deleting boxes, which is why LOD2 kept "inventing a downward
spike prow" until it was rebuilt (`cruiser.js:626-651`). A faceted loft decimates on
**three axes**, in this order.

**Axis 1 — stations, by name.** `Lines.pick` already exists and its doc comment
(`common.js:201-215`) already records why blind every-other decimation is wrong. That
rule is unchanged and now matters more: 28 → **13 named** → **7 named**. The waist, the
shoulder, the knuckle break and all three prow stations survive to LOD2.

**Axis 2 — profile cardinality. This is new.** 14-gon → 10-gon → 8-gon, by a **fixed
index map authored per hull**, not by a generic algorithm.

- Never collapsed: the deck flat, both knuckles, the keel flat. Those four are the
  silhouette.
- Collapsed first: the deck chamfer into the upper flank (10-gon), then the keel chamfer
  into the lower flank (8-gon).
- A collapse moves the outline by at most half a chamfer width — 8–11 m on the cruiser,
  which is **0.25 px at the max-zoom read**. That is why this axis is safe and station
  deletion is not.

**Axis 3 — primitives, last.** Recesses are the **last** thing to go, ahead of even the
frames, because they cost almost nothing and they are the read. Anything authored below
12 m does not survive into LOD1 (`ship-language.md` §0, unchanged and correct).

Cost model for the cruiser spine:

| LOD | stations | bays | cardinality | spine triangles |
|---|---|---|---|---|
| 0 | 28 | 27 | 14 | 756 + caps |
| 1 | 13 | 12 | 10 | 240 + caps |
| 2 | 7 | 6 | 8 | 96 + caps |

**The coherence gate is the one that catches a bad decimation.** `node
tools/silhouette.mjs` measures each level's side mask against LOD0's, floor 0.72; the
cruiser is at **LOD1 0.958, LOD2 0.811** today. After the redesign: **LOD1 ≥ 0.94, LOD2 ≥
0.80**. If LOD2 drops below 0.80 the cause is a dropped *station*, not a dropped facet —
check axis 1 before you touch axis 2.

Three of the four LOD2 identity features stay exactly as they are and remain
unspendable: the bay as a genuine through-void, the cutter yoke's hook, the stern-block
step. `tools/silhouette.mjs` checks each by name and it exists because IoU cannot see a
hole being filled in.

**The fourth one conflicts with L6 and the conflict is stated rather than hidden.**
`tools/silhouette.mjs` currently checks `island is a stepped stack` and today reports
`5 plateaux over the island`. L6 deletes the stepped stack on purpose — it is the rule
that produced the box. So that one check **must be amended**, and it is the only place in
this document where an existing green gate is asked to change:

```
  was:  island is a stepped stack        >= 3 plateaux over the island
  now:  island is a distinct raked ridge  one continuous run over >= 0.24 L of the
                                          outline, leading edge raked >= 22 deg,
                                          peak >= 0.06 L above the deck plane
```

Amend it in the same commit that lands L6, not before and not after, and paste both the
old and the new output into the report. An identity check that is quietly relaxed is
exactly the failure mode the original comment in that file was written to prevent.

---

## 10. What changes in `src/art/geometry/**`

| file | change | risk |
|---|---|---|
| `greeble.js` | **ADD** `facetProfile()` — the 14-point section of §3. **ADD** `bevelBox()` — a 12- or 18-facet chamfered box to replace `panelledSlab` on large masses. **ADD** `recessPanel()` — cut a recess into a lofted face, subtractive. **DO NOT REMOVE OR CHANGE** `hullProfile`, `octProfile`, `panelledSlab`: the faction fleet, the derelict and all 24 modules call them. ~150 new lines, zero edits to existing exports. | low |
| `ships/common.js` | `Lines` gains the extra per-station columns `facetProfile` needs, defaulting to the current 8-point behaviour when absent (exactly how `keelRatio` was added — `common.js:145-166`). `Lines.audit()` gains S2/S3/S4/S5/S8 and L2/L3/L5. `stations()`/`loft()` gain a `cardinality` option for §9 axis 2. **`SURFACES` is not touched.** | medium — `Lines.audit()` is consumed by `ships/audit.mjs` and by `probes/ships.js` |
| `cruiser.js` | The big one. `HULL_STATIONS` 11 rows → 28, 8-gon → 14-gon. `BRIDGE_DECKS` (3 boxes) → one faired island loft. `SPINE_STATIONS` folds into the island. The mast is deleted. `BAY` floor −252 → −160, rails ±242 → ±280, throat 105 → 150. `YOKE` deepest −228 → −180. `FINS` keep count and asymmetry, become flat raked planes. `POD` gains the two thrust frames. Every surviving additive box is re-authored as a loft. **`SURFACE`, `GROUPS`, `CRUISER_LENGTH` and the LOD switch distances `[0, 4200, 14000]` are not touched.** | high |
| `ships/coalition.js` | Five capital tables re-authored to the §5 proportions and §3 cardinality, in the slab idiom. | high |
| `ships/concord.js` | Five capital tables likewise, in the swept idiom. `concord_strikecraft` is already flat — leave it alone. | high |
| `ships/derelict.js` | Faceting yes, proportions exempt. Lowest priority. | low |
| `ships/audit.mjs` | **EXTEND, do not rewrite.** Add the boxiness gate (§1.1), the section-topology gate (§3), the envelope-proportion gate (§5). The existing 78-pair and intra-faction blocks are load-bearing and stay byte-identical. | medium |
| `modules/*.js` | **No silhouette change.** The 46 same-mount pairs are already separated and that is not spendable. The only change is **merge each module's 5–7 meshes down to ≤ 3 at LOD0 and ≤ 2 at LOD1**, which is worth 20–24 draws on a fitted cruiser and is the only real draw saving in the project. | medium |
| `hardpoints.js` | `CRUISER_ANCHORS` moves **only** where the new deck heights force it — realistically just `dorsal`, which sits on the armour spine top. **Move one anchor, re-run `modules/audit.mjs`, then move the next.** | high |

### Requests to files this stream does not own

1. `src/core/units.js#BUDGET` — `cruiserCoreTris: 2000 → 9000`; `moduleTris: 400 → 1200`;
   `fighterTris: 150 → 400`; add `capitalTris: 5000` and `escortTris: 2000`. Without
   this, `ships/audit.mjs` fails the moment the first hull is re-authored.
2. `tools/bench.mjs` — run once at `--quality medium` and record the number, so the
   GTAO share of the 506 stops being a guess. `benchmark.md` has asked for this for two
   waves. It is one command.
3. `docs/design/ship-language.md` — needs the header amendment in §12 below. Whoever owns
   that file, not me.

---

## 11. What must NOT change

An explicit list, because the fastest way to lose this wave is to win the silhouette and
break a gate that was already green.

1. **`SCALE_CUE.runningLightSpacingM = 40` and `LIGHT_U_PER_M`.** The one feature in the
   game whose entire job is to be a ruler. `ships/common.js:20-46` records what happened
   the last time two constants both claimed to be it.
2. **Every declared class length**, and `CRUISER_LENGTH = 1400`. `ships/audit.mjs:58-62`
   fails at 5% drift, and the sim/AI/economy key off `def.length`.
3. **`CRUISER_ANCHORS`**, except `dorsal`, and that one moves alone.
4. **`GROUPS = ['core', 'engine']` and the `SURFACE` / `SURFACES` tables.** Two groups ×
   five (or six) surfaces *is* the draw budget.
5. **Material option grids** — `wear` on 0.125 steps, faction and tier as authored.
6. **The salvager fiction, entire.** `ship-language.md` §5 survives without amendment:
   the through-bay, the mismatched cutter heads, the asymmetric radiator bank, the
   port/starboard mounts at different z, the 7°-off captured plate, the exposed rib
   section, and the five things the ship must never have. If a bare-hull render could be
   mistaken for a line ship, the design has failed.
7. **The 78-pair and intra-faction divergence gates**, and the 46 same-mount module
   pairs. Faction identity and module readability are won. Do not spend them to buy a
   silhouette.
8. **`Lines.pick` LOD authoring** — LODs are authored inward by naming the stations that
   *are* the silhouette, never by dropping every second one. `common.js:201-215`.
9. **The four LOD2 identity features** and the 6–12% enclosed-background band.
10. **The project non-negotiables**: no image files, textures generated at runtime; no
    `Math.random`, seeded RNG only, scanned tree-wide; no allocation in hot loops;
    1 unit = 1 metre; never construct materials directly; three LODs per ship, two per
    module.

---

## 12. Verdict on `docs/design/ship-language.md`

804 lines written for the old brief. It is better than its outcome — most of it is right
and a small, specific part of it is what produced the box stack.

### Survives unchanged and remains binding

- **§0, the pixel budget, entire.** 43.4 m/px at max zoom, the 12 m LOD1 floor, the
  130 m max-zoom floor, "if a mass is not in LOD2 it does not exist". Every rule in this
  document derives from it too.
- **§2 R2.1–R2.7**, the hull-line rules. Already enforced by `Lines.audit()` and
  `ships/audit.mjs`; §3 and §4 of this document *tighten* them, they do not replace them.
- **§2's sheer / tumblehome / flare.** Correct, in the tree, and more important now.
- **§3's frequency hierarchy** (calm ≥ 60%, medium ≤ 28%, dense ≤ 12%) and the four
  justifications for a dense band, and above all *"if you want greeble somewhere, cut a
  recess for it first"* — promoted to the governing rule of §6 here.
- **§3's plate rhythm** (180 m frame, 45 m break, ≥ 55 m module) and the instruction that
  the 40 m light spacing must never be a multiple of it.
- **§4 entire** — the accent budget ≤ 3.5%, the four legal accent categories, the
  recess-colour trick. Nothing about colour changes.
- **§5 entire** — salvager identity.
- **§6 M1–M7** — module rules. Already measured and passing.
- **§8** — the verification method, including "and then read the PNGs".

### Now wrong, and named as wrong

- **§1's "Vertical stacking" rule (lines 104–121).** *"Homeworld's readability trick is
  that the masses above the main hull stack in a stepped ziggurat in profile, each step
  shorter than the one below."* This is the single rule that produced the object in
  `docs/review/wave2/close.png`. It is a WWII battleship island. EVE, Homeworld and EVE
  Frontier capitals fair the superstructure **into** a raked spine; they do not stack
  inset decks on it. **Replaced by L6.**
- **§1's masses-as-separate-volumes framing (lines 46–102).** The area bands
  (58–65 / 18–24 / 9–14 / 3–6%) and the 1.6× size-step rule are good and survive — but
  a "mass" is now a **zone of one continuous body**, not a box you can point at. Read the
  bands as a distribution over one hull, not as a parts list.
- **§7's envelope table (lines 601–623)**, and specifically its own conclusion:
  *"Nadir at 5.2 : 1 and 1.6 : 1 is the opposite [of a wide flat frigate]: long and
  near-square in section. That is the salvage-hauler read."* **That was a deliberate
  choice and it is now the wrong one.** The salvager read comes from the gear, not from a
  square section. Replaced by §5 of this document.
- **§7's triangle and draw-call allocation (lines 683–701)** and every "the rebuild must
  be draw-negative / the spine changes are triangle-negative" argument in the file. The
  triangle constraint is lifted. Worse, that framing is *why* the spine has eleven
  stations: an 8-gon through 11 stations is what a 2000-triangle budget buys.
- **§2's station table (lines 165–195).** Superseded by a 28-station, 14-gon table.
- **§3's "8 to 11 dense bands"** — the count was set by a triangle budget. Raised to
  12–16 in §6 here, with the placement rules unchanged.
- **§1's "Four is enough" (lines 91–93).** The reasoning (a fifth mass would compete with
  M4) was about separable boxes. Under a single-body reading it no longer applies.

### Stale, and it matters that it is stale

- §7 states LOD0 "spends 1956 across **14 draws**" and §0's budget block assumes 2000
  triangles. The live tree measures **1,849 across 10**. `cruiser.js`'s own header says
  9 draws in one place and the probe PNG says 11. **Three different numbers for one
  measurable quantity in one repository.** The redesign should land the boxiness gate and
  the primitive-count gate in `ships/audit.mjs` precisely so this stops being possible.
- §4's saturated-albedo figure (23.8%) carries its own caveat that it was measured on a
  render contaminated by a saturated fill light and must be re-taken on an albedo-only
  render. **That has still not been done.** It is not this wave's job, but do not quote
  the number.

---

## 13. New gates

All of these are pure geometry, none goes near a hot path, and every one of them is a
number this document already commits to.

**In `src/art/geometry/ships/audit.mjs`** — extend, never rewrite:

1. **Boxiness.** Per class at LOD0: axis-aligned area fraction ≤ 45% (cruiser ≤ 40%);
   normal clusters ≥ 1% of area, count ≥ 24; top-6 share ≤ 45%. Prototype:
   `scratchpad/a1-boxiness.mjs`, ~70 lines, no browser.
   **Nothing in the fleet passes this today** except `coalition_corvette` (44.9% / 29)
   and `concord_tender` (29.6% but only 16 clusters). That is the point of the gate and
   it is why step 3 of §14 lands it in warn mode with the red baseline written down.
2. **Primitives.** Separate primitives ≤ 55 (cruiser) / ≤ 34 (faction capital); mean
   triangles per primitive ≥ 160 / ≥ 100.
3. **Section topology**, from the station table alone: cardinality ≥ 14; largest facet
   ≤ 18% of perimeter; chamfer share ≥ 34%; B : H ≥ 1.7; knuckle depth 0.30–0.55; no two
   normalised sections within 2%.
4. **Envelope proportion**: measured B : H against the §5 table, ±8%; measured L within
   5% of declared (already there).
5. **Longitudinal**: station count ≥ 26; sweep rate L2; monotone forebody L3; non-parallel
   deck and keel L5.

**In `src/art/geometry/modules/audit.mjs`**: mesh count per module ≤ 3 at LOD0, ≤ 2 at
LOD1. Everything else stays.

**In `tools/silhouette.mjs`**: raise the cruiser's coherence floor to LOD1 ≥ 0.94,
LOD2 ≥ 0.80. Keep three of the four LOD2 identity checks byte-identical; replace the
`island is a stepped stack` check with the raked-ridge check written out in §9, in the
same commit that lands L6.

The full green set that must still pass at the end of the wave, unchanged:

```
rm -rf dist && npm run smoke         node src/sim/selftest.mjs            54/54
node tools/ripple.mjs                17/17
node tools/flight.mjs                20/20
node src/sim/ai/escalationHarness.mjs 28/28
node src/sim/meta/economyAudit.mjs   21/21
node tools/poicheck.mjs              16/16
npm run uicheck
node tools/widediag.mjs close --assert
node src/art/geometry/ships/audit.mjs
node src/art/geometry/modules/audit.mjs
node tools/silhouette.mjs
```

---

## 14. Build order

Sequenced so that every step is separately revertable and every gate is re-run before the
next step depends on it.

| # | step | gate that must be green before moving on |
|---|---|---|
| 0 | `units.js` budget raise; `bench -- --quality medium` once | `ships/audit.mjs` still green with the new ceilings |
| 1 | `greeble.js`: `facetProfile`, `bevelBox`, `recessPanel`. **Nothing else changes.** | full green set — this step should move no pixel |
| 2 | `common.js`: `Lines` extra columns, `cardinality` option, new `audit()` clauses **reporting only, not failing** | full green set; new clauses print the current baseline |
| 3 | `ships/audit.mjs`: new gates added, **set to warn** | prints a red baseline for every hull; that baseline goes in the report |
| 4 | Cruiser spine: 28 stations, 14-gon, sweep, knuckle. Nothing else. | `ships/audit.mjs`, `silhouette.mjs`, `modules/audit.mjs` (the module gate fits to a real cruiser and **will** move) |
| 5 | Cruiser island: fair it in, delete the mast, the height ledger. **Amend `tools/silhouette.mjs`'s `island is a stepped stack` check to the raked-ridge check in §9, in this same commit**, and paste both outputs | as above + read `docs/probes/cruiser.png` |
| 6 | Cruiser bay: wider and shallower; yoke; thrust frames; apertures; RCS | R2.6 enclosed background 6–12% in **both** views |
| 7 | Cruiser detail pass: recesses, 12–16 trough bands, 8 real frames | boxiness gate ≤ 40%, primitive gate ≤ 55 |
| 8 | Module merge: 5–7 meshes → ≤ 3 / ≤ 2. **No silhouette change.** | `modules/audit.mjs` 46 pairs unchanged; `bench` draw delta recorded |
| 9 | Concord capitals, one class at a time | `ships/audit.mjs` after **each** class |
| 10 | Coalition capitals, one at a time, **`monitor` and `destroyer` last and together** | as above — that pair has 2% of margin |
| 11 | Derelict faceting | full green set |
| 12 | Gates flipped from warn to fail | full green set |

Steps 4–7 are the ones the owner will judge. Steps 9–10 are the ones most likely to break
a gate. Step 8 is the only one that helps the benchmark.

And then, per §8 of the old spec and it is still the best line in it: **read the PNGs.**
Every rule in both documents exists because somebody looked at a picture and it was worse
than the reference.
