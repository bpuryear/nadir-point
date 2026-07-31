# MODULE INTEGRATION — making the bolt-ons belong to the hull

*Design spec. Supersedes nothing; it adds a layer between `ship-language.md` §6 (which
says modules must BREAK the silhouette, and is right) and the module stream (which
executed that and produced scaffolding). It is written to be built from: every number
is metres, every rule is checkable, and every claim about the current tree is output I
re-ran rather than a figure I copied out of a report.*

---

## 0. THE OWNER'S THREE ASKS ARE ONE PROBLEM

> "It looks like trash strewn on a decent hull … like I designed a hull, designed some
> modules, and then placed them together."

> "The worst looking part of the ship is the box on the bottom. Can we redesign that
> module to be internal?"

These are the same defect at three scales. The hull is a lofted faceted plate family;
the modules are tubes and axis-aligned prisms; and there is no geometry anywhere that
transitions between them. The ventral box is simply the largest instance — it is the
one module big enough that "no transition" reads from four kilometres.

The fix has three parts and they must land together, because any one alone makes it
worse. Recess the ventral without giving the modules the hull's form language and you
get a hull with a hole in it and five sticks on top. Give the modules the form language
without a seat and you get well-shaded scaffolding. Build the seat without recessing
the ventral and the ship's worst feature keeps its size and gains a collar.

---

## 1. WHAT IS ACTUALLY WRONG, AS A COUNT

The hull's shape-makers are three functions in `greeble.js`: `facetProfile` (the plate
family, line 308), `bevelBox` (the drafted, canted, chamfered mass that replaced the
box, line 523) and `recess` (subtractive detail, line 900). The census across the five
module files — `bow.js`, `dorsal.js`, `broadside.js`, `ventral.js`, `engine.js`:

```
=== primitive census across the 5 module files ===
  G.panelledSlab  46
  G.bevelBox  0
  G.facetProfile  0
  G.loft  5
  G.taperedWedge  7
  G.hexStrut  41
  G.pipeRun  18
  G.cappedConduit  5
  G.antennaMast  1
  G.recess  0
  G.armourBelt  3
  G.octProfile  2
```

**Zero uses of all three.** Forty-six uses of `panelledSlab`, about which
`greeble.js:490-497` is explicit:

> "A `panelledSlab` is a rectangular prism. Even chamfered it keeps its two ENDS as flat
> ±Z rectangles and its four long faces exactly on ±X / ±Y, so 100% of its surface area
> is axis-aligned. Ninety-nine of those in a stack is what `docs/probes/cruiser.png`
> was."

And sixty-five uses of `hexStrut` / `pipeRun` / `cappedConduit` / `antennaMast` — the
tubes and sticks.

So the modules are built out of the exact two things the hull redesign spent five
thousand triangles removing. That is the "different game's budget" read, stated as a
count rather than as taste. It is also why the fix is cheap: the vocabulary already
exists, in the same file, and no module calls it.

**The budget is already authorised and unspent.** `src/core/units.js:119` sets
`BUDGET.moduleTris` to 1200. `node src/art/geometry/modules/audit.mjs` prints:

```
24 modules   worst 398 / 1200   ALL WITHIN BUDGET
```

Note that the sheet in `docs/probes/modules.png` still reads `WORST 398 / 400 TRIS`.
The sheet is stale, not the budget. Re-render it in the same wave.

---

## 2. THE MODULE FORM LANGUAGE

### 2.1 The hull's rules, read off the hull

Every number below is from `src/art/geometry/cruiser.js` or `greeble.js#facetProfile`
and is reproduced by `node src/art/geometry/ships/audit.mjs`.

| # | rule | the hull's number | source |
|---|---|---|---|
| F1 | Section is a **12-gon, six facets per side** | facet angles 14 / 24 / 64 / 116 / 152 / 169° before the section's aspect ratio squashes them; **8.1 / 14.3 / 49.6 / 130.4 / 163.1 / 173.7°** after | `greeble.js:268-275` |
| F2 | **No dihedral in the 12–28° band.** Every edge is either a fair panel break or a chine | dihedrals **6.2 / 35.3 / 80.8 / 32.6 / 10.6°** | `greeble.js:271-273` |
| F3 | **No facet within 5° of an axis** | closest is 5.7°, at the transom | `greeble.js:274-275` |
| F4 | The **widest point is a knuckle**, not the deck edge | 0.53 of section depth below the deck at the transom, 0.47 amidships, 0.34 at the bow; bounded 0.30–0.55 | `cruiser.js:228-230` |
| F5 | Deck is **cambered**, keel has **deadrise** | camber 0.0679 of depth, deadrise 0.0486 | `greeble.js:309-310` |
| F6 | Largest facet carries **11.0%** of section perimeter; the four chamfer/knuckle facets carry **65.8%** | | `greeble.js:277-280` |
| F7 | Plan, sheer and keel lines are **piecewise linear with named breaks**, never fair curves | foredeck 0.136 m of half-beam per metre to z +100, then 0.156; knuckle break at z +460 | `cruiser.js:286-292, 301-307` |
| F8 | **Structural frames** are 6 m steps in the section, at 180 m nominal, jittered | z −590, −430, −300, −160, −20, 140, 290, 430; profile at that z scaled **1.04** with the deck/keel pushed ±40×(k−1) | `cruiser.js:913-928` |
| F9 | **Strakes** lie ON the surface, cut from the surface's own facet | three a side, **13 m proud**, **14 m gaps**, inset **6%** at each end of the facet, stopping **at** the knuckle and never wrapping over it | `cruiser.js:578-605, 893-897` |
| F10 | **Value split at the knuckle**: bone above, near-black (`hullDark`, 0x2b2722) below | everything on `dark` is below the knuckle; the ridge is deliberately not dark because it is above it | `cruiser.js:653-675` |
| F11 | Detail is **subtractive**: cut a recess ≥ 8 m first, put the machinery in it second | | `cruiser.js:148-152, 997-1001` |
| F12 | **Calm reserve** carries nothing | deck flats, ridge crown, the four knuckle planes over their full length, bay rails' outboard faces, forward 200 m | `cruiser.js:155-156` |
| F13 | **Nothing dense is mirrored** | port sponson z +18…+102, starboard z −152…−68; ridge 16 m to port; hangar port-only | `cruiser.js:158-162` |
| F14 | A mass grown out of the hull uses **the hull's own profile function** | the ridge is a second `facetProfile` loft; the drive-well outline is the transom's own section scaled 0.36 × 0.55; the outrigger pods are `facetProfile` | `cruiser.js:348-352, 451-454, 1473-1481` |
| F15 | Running lights at **exactly 40 m**, on the knuckle chine, scale 4, every fifth 7 | `SCALE_CUE.runningLightSpacingM` | `cruiser.js:1216-1232` |

**One defect found while reading.** `cruiser.js:526-527` and `:889` both describe the
knuckle as "a hard 44-degree chine". The dihedral at the knuckle is the third one in
F2 — **80.8°**, not 44. The 44 is stale from the eight-facet build. Modules must echo
80.8; fix the two comments in passing.

### 2.2 The rules a module must obey

**M-F1 — THE PRIMARY MASS IS A LOFT, NOT A PRISM.** Every module's largest single mass
is built as a `loft` of **at least three stations** of `facetProfile`, or, where the
mass is genuinely a beam rather than a body, as `bevelBox` with `cant ≥ 0.09 rad` and
`draft ≥ 6 m`. `panelledSlab` is permitted only for a mass under **40 m in its longest
dimension**. Forty-six call sites move; the count of `G.panelledSlab` on masses over
40 m goes to zero and is checkable by grep.

**M-F2 — THE MODULE CARRIES ITS OWN KNUCKLE.** One continuous chine at **80 ± 6°** of
dihedral, running the module's full length, sitting **0.42–0.50 of the module's own
section depth below its top face** (F4's band). `dark` below it, `hull`/`plating`
above. This single line is the strongest identity cue the hull has and no module has
one. It is free: `facetProfile` produces it by construction.

**M-F3 — NO DIHEDRAL IN THE 12–28° BAND, ANYWHERE.** This is F2 and it is the rule
that separates "faceted" from "modelling accident". A module whose edges land in the
band reads as a mistake under every key. `facetProfile` satisfies it automatically;
hand-built profiles must be checked.

**M-F4 — SECTION BEAM : DEPTH ≥ 1.6 : 1** on any module mass over 80 m long. The hull
holds ≥ 1.96 at every station and averages 2.27 (`ships/audit.mjs`, PLAYER CRUISER
LINES, S4). A module that is taller than it is wide is from a different ship in the
literal sense.

**M-F5 — STRUCTURAL FRAMES, AT THE HULL'S RHYTHM.** Two to four 4 m steps in the
module's own section, spaced **90–140 m and never evenly**, built exactly as F8 does
it: the module's own profile at that station scaled 1.04. This is the cue that says
"cut off a capital ship" rather than "modelled at 60 m scale".

**M-F6 — ONE STRAKE, MINIMUM, LYING ON THE MODULE'S OWN FLANK.** Same construction as
F9: sampled at the module's own stations, offset along the local facet normal, 8–13 m
proud, 6% inset at each end, stopping at the module's knuckle. A plate that is a
straight bar at a fixed x on a body whose section moves is the defect `cruiser.js:876-880`
describes; do not reintroduce it.

**M-F7 — SUBTRACTIVE DETAIL ONLY.** No greeble on a proud face. Two to three recesses
≥ 8 m deep per module, machinery inside them. `G.recess` is used zero times in the
module stream today.

**M-F8 — THE MODULE'S LONG AXIS AGREES WITH THE HULL'S PLATE GRID, OR DISAGREES BY
MORE THAN 7°.** The hull's captured armour plate is wired on at **7° off the grid**
(`cruiser.js:1176-1180`) precisely because that reads as repair. Between 0 and 7° is
the same failure as F2's dead band: it reads as a build error. Note this is a rule
about the module's *authored* geometry; the system's own 3–7° seated misalignment
(`hardpoints.js:450`) is applied on top and is not a substitute.

**M-F9 — NOTHING MIRRORED WITHIN A MODULE.** F13. A module's recesses, beads, chocks
and machinery may not appear at ±x at the same z.

---

## 3. THE SEAT — the highest-value item, and it is small

Today a mount is a pad and a bolt ring (`cruiser.js#emptyMount`, line 1573): a
`mountPad` 9 m tall and a `dockingCollar` 7 m deep, and nothing else. The module then
stands a further **7 m proud** on top of that (`hardpoints.js:430`). So a module meets
the hull at a 32–44 m disc, 16 m clear of the skin, with no geometry carrying its mass
outward. That is the "attaches at a point" defect exactly.

**A seat is what a hull grows so that a module lands INTO something.** Six elements,
built at every mount whether or not it is occupied:

### 3.1 The parts

| part | geometry | surface | tris | survives to |
|---|---|---|---|---|
| **APRON** | An irregular hexagonal pan cut **9 m** into the hull skin, outline radius **1.9 × padRadius** (61 m at bow/port/starboard, 84 m at dorsal/ventral/engine), wall **4 m** proud. Built from the hull's local facet normal at that station, not from world axes. | floor `dark`, wall `plating` | ~34 | **LOD1** |
| **PAD** | Unchanged radius, but its top face sits **flush to 3 m proud of the surrounding hull skin** because it now stands on the apron floor rather than on the skin. | `plating` | 22 | LOD1 |
| **COLLAR** | Unchanged. `dockingCollar`, radius × 0.74, inner × 0.5, depth 7, 4-sided. | `greeble` | 30 | LOD0 |
| **PLATE RUN** | **The load-bearing item.** Two to four plates running OFF the apron rim and lying ON the hull skin, built by the same maths as `cruiser.js#flankStrake` (line 578) so they are parallel to the surface at every station by construction. Lengths **90 / 150 / 210 m**, **3 m proud**, **26–40 m wide**, at **0° / 7° / 16°** to the z axis. Never mirrored port to starboard. `dark` below the knuckle, `plating` above. | `dark` / `plating` | ~40 each | **LOD1** |
| **CHOCKS** | Two or three `taperedWedge` blocks standing off the apron rim **under the module's overhanging side**, 40–70 m long, 18–30 m tall, unequally spaced. A cantilevered mass with nothing under it is what the eye reads as unattached. | `plating` | 12 each | LOD1 |
| **SERVICE RUN** | One `pipeRun` and two `cappedConduit` leaving the apron and disappearing under a plate 60–120 m away. | `greeble` | ~40 | LOD0 |

**Cost:** ≈ 266 triangles per mount, ≈ **1600 for all six**. Against
`BUDGET.cruiserCoreTris` 9000 and a measured LOD0 of 5241 that lands at ~6840.
**Zero new draw calls**: every part goes into `hull` / `plating` / `dark` / `greeble`,
four buckets the hull already owns, and `cruiser.js:129-134` guarantees that primitives
inside an existing surface are free.

### 3.2 The standoff drops from 7 m to 3 m

`SEAT_STANDOFF = 7` exists to create "a dark line separating the module's value from
the hull's" (`hardpoints.js:412-416`). A 9 m apron does that better and it does it
*around* the module instead of *under* it. Change `SEAT_STANDOFF` to **3** — or, better,
make it a per-mount table so a future mount with a deeper apron can differ.

**Re-measure obligation:** this moves every module 4 m along its mount normal. Re-run
`src/art/geometry/modules/audit.mjs` (46 pairs) and the loadout gate. Predicted
movement is under 2 m in any mean, because 4 m along one normal touches ~6 of 28 bins.

### 3.3 Per-mount notes, from the real anchors

`CRUISER_ANCHORS`, `hardpoints.js:157-172`. **Five of the six anchors do not move.**

- **bow `[0, 32, 420]`** — sits between the structural frames at z 430 and z 290 (F8).
  Land the apron's **aft rim on the z 430 frame** so the frame becomes its coaming:
  that is "the hull acknowledges the module" for thirty triangles. Pull the forward rim
  to **z 458**, short of the prow knuckle break at z +460 (`cruiser.js:301-307`). The
  forward 200 m is calm reserve (F12), so **the plate run goes aft**, never forward.
- **dorsal `[0, 124, −40]`** — already sits on a barbette (92 × 30 × 116 at
  `[−6, 109, −40]`, `cruiser.js:988`). This is the one mount that has a seat, and it is
  not a coincidence that it is the one the module audit had to fix structurally rather
  than metrically. Add a 6 m apron recessed into the barbette's top face. The ridge
  crown is calm reserve, so the plate run goes on the **ridge flanks**, below the crown,
  fore and aft, at the ridge's own rake (71° forward, 54° aft).
- **port `[−158, 46, 60]` / starboard `[158, 46, −110]`** — on the sponson shelf
  (84 × 28 × 88 `bevelBox`, `cruiser.js:1138`). Apron recessed 7 m into the shelf top.
  The existing outboard bracket grows a **second, shorter mate 46 m aft**. One 150 m
  plate runs inboard from the shelf onto the upper flank at the local facet angle.
  **The two sides' plate runs must differ** — the 170 m z offset between the sponsons is
  a deliberate asymmetry (F13) and mirroring the seat would undo it.
- **engine `[0, 0, −624]`** — the drive well's end plate. The well outline is the
  transom's own section scaled 0.36 × 0.55 and lifted 4 m (`WELL`, `cruiser.js:456`).
  Seat = six bolt bosses **at the well profile's own vertex positions**, plus four
  longitudinal ribs on the well's inner wall running mouth to back. A drive that plugs
  in then sits in a socket with visible keyways instead of touching a flat annulus.
- **ventral `[0, −78, 0]`** — see §4. **This is the one anchor that moves**, 26 m in y,
  and nothing else.

### 3.4 A defect the seat work will run into at the ventral

Arithmetic from the cited lines, worth 10 minutes of verification before building:

- `emptyMount` places the ventral pad (`radius 44, height 9`) at the anchor with
  `rot [π,0,0]`, so it spans **y −78 … −87** (`cruiser.js:1591-1593`).
- The collar is placed at `[ax, ay + sign·padH, az]` with `sign = −1`, i.e.
  **y −87**, facing down, depth 7 → it spans **y −87 … −94** (`cruiser.js:1595-1600`).
- The module's origin is the anchor plus `SEAT_STANDOFF · normal` = **y −85**
  (`hardpoints.js:453`), and its graft plate grows *downward* from there —
  `plateH = max(4, 44·0.14) = 6.2` → **y −85 … −91.2** (`kit.js:359-365`).

So the hull's own bolt ring occupies y −87…−94 while the module's cut plate occupies
y −85…−91.2. **The hull furniture passes through the module.** Nothing renders it
visible today because the module is opaque and enormous, but it is two interpenetrating
solids at the one mount the owner is complaining about.

---

## 4. THE VENTRAL BAY — taking the box inside

### 4.1 The constraint, measured, not assumed

I re-ran the probe rather than quoting the doc. `node tools/probe.mjs loadouts`,
reading `docs/probes/loadouts.png`:

```
OUTLINE DIVERGENCE PER Z-BIN, METRES:  A/B MEAN 87.0 MAX 355   A/C MEAN 97.6 MAX 364   B/C MEAN 84.5 MAX 458
WORST PAIR: MEAN 84.5 (TARGET >= 45)   MAX 355 (TARGET >= 120)   PASS
SAME MEASURE BINNED OVER THE FITTED ENVELOPE, NOT THE BARE HULL'S Z RANGE:  WORST MEAN 83.9  MAX 345   PASS
```

Then I reproduced that measurement headlessly and asked the question the design
actually needs answered — **what is the ventral carrying?** Same maths as
`src/probes/loadouts.js#diff`, stub material registry exactly as
`modules/audit.mjs` does it:

```
ALL SIX MOUNTS FITTED (reproduces docs/probes/loadouts.png)
  A/B  mean 87.0  max 355   [per-channel mean: halfWidth 86.2  top 77.8  bottom 97.0]
  A/C  mean 97.6  max 364   [per-channel mean: halfWidth 64.8  top 110.5  bottom 117.4]
  B/C  mean 84.4  max 459   [per-channel mean: halfWidth 78.3  top 67.4  bottom 107.5]
  WORST PAIR  mean 84.4 (target >= 45)   max 355 (target >= 120)   PASS

VENTRAL MOUNT LEFT EMPTY, other five unchanged
  A/B  mean 54.7  max 260   [per-channel mean: halfWidth 86.2  top 77.8  bottom 0.1]
  A/C  mean 61.3  max 248   [per-channel mean: halfWidth 68.7  top 110.5  bottom 4.6]
  B/C  mean 42.4  max 305   [per-channel mean: halfWidth 54.9  top 67.4  bottom 4.8]
  WORST PAIR  mean 42.4 (target >= 45)   max 248 (target >= 120)   FAIL

ONLY THE VENTRAL FITTED (the other five mounts empty)
  A/B  mean 37.6  max 355   [per-channel mean: halfWidth 16.0  top 0.0  bottom 96.9]
  A/C  mean 52.4  max 364   [per-channel mean: halfWidth 44.4  top 0.0  bottom 112.7]
  B/C  mean 48.6  max 459   [per-channel mean: halfWidth 42.9  top 0.0  bottom 102.8]
  WORST PAIR  mean 37.6 (target >= 45)   max 355 (target >= 120)   FAIL

ventral's share of the worst-pair mean: 50%
five other mounts alone clear the mean bar by 0.94x and the max bar by 2.06x
```

**Four findings, and they determine the whole design:**

1. **Delete the ventral's outline contribution and the criterion FAILS at 42.4
   against 45.** Not "gets tight" — fails. Option "move distinguishability onto
   dorsal/engine/broadside" is refuted by measurement, not by argument.
2. **The threatened quantity is the MEAN, not the MAX.** With the ventral empty the
   worst max is still 248 against a bar of 120 — 2.06×. The mean is what "difference
   along most of the length" means, and the ventral is the only mount that can change
   the outline along most of the length.
3. **The ventral IS the `bottom` channel.** With it empty, bottom-channel mean
   divergence is **0.1 / 4.6 / 4.8 m**. Nothing else on the ship moves the keel line.
4. **The binding pair is B/C** (carrier vs line) at 42.4. A/B and A/C survive on their
   own at 54.7 and 61.3.

From the per-bin table, the exact requirement:

```
With the ventral EMPTY (the five other mounts only):
  B/C  halfWidth 54.9  top 67.4  bottom 4.8  -> 3-channel mean 42.4
       to reach a worst-pair mean of 55, this pair needs bottom-channel mean >= 42.7 m
       to reach a worst-pair mean of 60, this pair needs bottom-channel mean >= 57.7 m
       to reach a worst-pair mean of 70, this pair needs bottom-channel mean >= 87.7 m
```

**So: whatever the ventral does after the redesign, the B and C fits must still differ
in keel line by a mean of ≥ 58 m across all twenty-eight bins.** Today that figure is
107.5. The redesign may give back about **46% of it** and still land at a 1.33× margin.

Bins are 28 over the bare hull's 1402 m, i.e. **50.1 m of ship per bin.** A difference
held over only the 445 m bay (9 bins) would need 180 m of depth difference per bin;
held over 850 m (17 bins) it needs 95 m. **The mechanism must be long before it is
deep.** That single sentence is what kills every "make it a shallow reveal in the bay
floor" idea, and it is not obvious without the measurement.

### 4.2 The design: THE BAY IS A BERTH, AND ONLY THE WORK HANGS

**Chosen mechanism: partial recession.** The module's *body* goes inside the hull. What
stays outside is the module's *deployed working gear*, which is long, open and
structural — and the three fits are separated by **depth band**, not by mass.

This is the only option that survives §4.1. It is also the one the fiction wants: a
salvager's ventral fitting is a *berth* with gear working out of it, not a container
strapped to the keel.

#### (a) The hull grows the berth

- **The bay floor drops from y −202 to y −222**, `BAY.chordBot` −180 → −200.
  Clear depth between the chords **92 → 112 m**.
  *Why exactly 20 m:* the hull's envelope is 1402 × 562 × 348 and its brief requires
  **beam : height ≥ 1.5 : 1** (`cruiser.js:37-38`; currently 1.615). 562 / 1.5 = 374.7,
  so there are 26.7 m of height available and not one metre more. Twenty spends most of
  it and leaves slack: predicted envelope **1402 × 562 × 368, B:H 1.527**.
  This *helps* R2.7 — `tools/silhouette.mjs` currently measures the bay's narrowest
  clear span at 91 m side / 103 m top against an 87 m floor, and both grow.
  **`BAY.throat`, `railIn`, `railOut`, `chordIn`, `chordOut` and the five frame z
  values do not move.** Widening the rails would change the hull form.

- **A KEEL PAN around the ventral anchor.** An irregular pan cut into the keel skin,
  **240 m in x × 300 m in z**, floor at **y −52**, wall 5 m proud, floor on `dark`.
  The hull's keel crown at z = 0 sits at about y −75 (`sectionAt(0)` gives bot ≈ −69,
  plus 0.0486 of section depth of deadrise), so the pan is cut **23 m up into the keel**
  and everything in it is inside the hull's own keel line.

- **THE VENTRAL ANCHOR MOVES FROM `[0, −78, 0]` TO `[0, −52, 0]`.** 26 m in y, nothing
  in x or z. This is the *only* anchor change in the wave and it follows the precedent
  `hardpoints.js:159-164` sets for the dorsal barbette exactly — *"moves 30 m up and not
  one metre in z or x. Moved alone, and re-measured alone."* Consequence: the pad spans
  y −52…−61, the collar y −61…−68, and the whole hull furniture is now **above** the
  keel crown at −75 instead of dangling 19 m below it, which also resolves §3.4.

- **TWO RUNNER RAILS.** `bevelBox`, x ±126, **22 m wide × 16 m deep**, running the full
  bay z −230…+215, `dark`, cant 0.10 rad. These are what a module's spine lands on
  along its whole length instead of at one disc, and they are the ventral's plate run.

Berth cost: pan ~34 + rails 2 × 60 + revised pad/collar ~52 ≈ **206 triangles**, zero
draw calls.

#### (b) Three rules on every ventral module

- **V1 — CONTAINMENT.** ≥ **60%** of a ventral module's LOD0 triangles must lie inside
  the bay volume: x ±226, y −34 … −222, z −230 … +215. Checkable headlessly by binning
  vertices; it is one loop in the module audit.
- **V2 — NO BOX.** No element below **y −240** may present a face whose normal is
  within 10° of −Y with an area over **12 000 m²** (e.g. 120 × 100 m). This is the rule
  that kills the flat slab underside the owner is looking at. It uses exactly the
  area-weighted normal binning `ships/audit.mjs` already runs.
- **V3 — DEPTH BANDS.** Three bands, and a fit must **hold its band over ≥ 12 of the 28
  z-bins**, i.e. over ≥ 600 m of ship:

  | band | deepest sustained y | fit | what is actually down there |
  |---|---|---|---|
  | shallow | **−270 ± 20** | `ventral_cargo_expansion` | two 620 m pod bellies half-buried in the keel pan, only their lower 40% proud; one mismatched container slung under the aft frame |
  | mid | **−370 ± 20** | `ventral_repair_bay` | two 940 m open drydock rails and three portal frames — a cage you see stars through, not a body |
  | deep | **−470 ± 20** | `ventral_hangar_deck` | the landing deck lowered on four legs, **with an open centre well**: max 120 m of solid deck per side, so it is a frame, not the 286 × 540 m slab it is today |

  Adjacent bands are 100 m apart, which is the depth difference §4.1 requires. The two
  ventral modules outside the probe's three loadouts take shallow
  (`ventral_salvage_tractor`) and deep (`ventral_drone_bay`); their pair separation has
  enormous headroom today (closest ventral pair `salvage_tractor / drone_bay`, mean 147
  peak 251, against bars of 46.7 and 140).

  Note that this brings every ventral module **up**: today's depths are −356 / −487 /
  −540. The fitted ships get shorter as well as tidier, which the loadouts probe's own
  row-spacing comment (`loadouts.js:115-127`) will be glad of.

#### (c) The predicted numbers, and the margin declared

Modelling the bands against the measured per-bin keel table (bare keel ≈ −200 through
the bay), with A over 17 bins, B over 13 and C over 19:

| pair | predicted bottom-channel mean | predicted 3-channel mean |
|---|---|---|
| A/B | ~103 | ~89 |
| A/C | ~73 | ~84 |
| B/C | ~83 | **~68** |

**Predicted worst pair: mean ≈ 62–72 against a bar of 45; max ≥ 250 against a bar of
120.** Today: mean 84.4 (1.88×), max 355 (2.96×).

**Declared spend: roughly 40% of the mean margin, and none of the max margin.** The max
is untouched because it comes from bins where one fit hangs and another does not, and
that structure is preserved.

**If the build measures below 55, the fix is to widen the depth bands to 110 m of
separation — never to re-hang the box.** If it measures below 50, the next lever is to
lengthen the shallow fit's z run, because §4.1 shows length buys mean more cheaply than
depth does.

### 4.3 Why not the other options

- **Full recession, distinguishability moved to dorsal/engine/broadside** — refuted by
  measurement: 42.4 against 45.
- **A recessed bay whose contents read through an open throat** — the contents are
  inside the keel line, so they contribute nothing to the `bottom` channel, which is
  the only channel the ventral moves. It is the full-recession option wearing a hat.
- **Doors or gantries that differ per fit** — good, and it is folded into (b): the
  hangar's landing deck and the dock's portal frames *are* the differing gear. On their
  own, though, doors sit within ~40 m of the keel line and span only the bay's 9 bins;
  §4.1 says that is worth ~13 m of mean, not 58.

---

## 5. THE TRIANGLE PLAN

`BUDGET.moduleTris` is **1200**. The worst module is **398**. That is **~800 free per
module** and the library has not spent one of them.

At LOD1's 4.2 km switch the hull is 353 px across 1402 m — **4.0 m per pixel**
(`cruiser.js:1746-1748`). At max tactical zoom it is ~30 px, **46.7 m per pixel**
(`kit.js:564-575`). So a feature needs to be **≥ 12 m to be three pixels at the
tactical camera's working range**, and ≥ 140 m to be three pixels at max zoom. Spend
accordingly: **form and shading, not mechanism.**

Priority order. Each entry says what it buys and at what range.

| # | spend | per module | reads at | why it is first |
|---|---|---|---|---|
| 1 | **SECTION.** Replace every over-40 m `panelledSlab` with a 3–4 station `facetProfile` loft (~96 tris + caps) or a canted, drafted `bevelBox` (60). | **+180…260** | every range | It changes how the whole mass shades. This is the single item that makes a module look like it is made of the hull's material. |
| 2 | **THE JOIN.** A skirt flaring from the graft plate out to the mass over 20–40 m as a 3-station loft; weld beads raised from 2 to 4 and made to survive LOD1. | **+120…180** | 0–6 km | It is the exact place the eye looks for the lie, and today there is nothing there. |
| 3 | **THE KNUCKLE LINE** (M-F2): one continuous 80° chine, full length, with the value split on it. | **+80…140** | every range | Free identity. It is the hull's strongest single rule and no module has it. |
| 4 | **STRUCTURAL FRAMES** (M-F5): 2–4 unevenly spaced 4 m steps in the module's own section. | **+90…150** | 0–8 km | This is what makes a 300 m module read as 300 m instead of as a 60 m prop. |
| 5 | **RECESSES** (M-F7): 2–3 cuts ≥ 8 m deep with machinery inside, 24 tris each. | **+60…120** | 0–4 km | Subtractive detail self-shadows; additive greeble on a proud face does not. |
| 6 | **THE CUT EDGE:** raise `kit.js#cutOutline` from a 6-point hexagon to a 10-point torn outline and give the cut plate a 3 m raised lip. | **+40…70** | 0–2 km | Pure fiction, cheap, and it is the thing that says salvage. |
| 7 | **LOD1 PARITY.** Items 1–4 are all silhouette-and-shading and **must survive to LOD1**, which today runs 126–336 tris. The benchmark camera sits at 7.2 km, i.e. LOD1, so LOD1 is where the ship is actually seen. | **+100…200 at LOD1** | 4–14 km | An improvement that only exists at LOD0 is an improvement nobody sees. |

Total ≈ **970 added, landing near 1150 of 1200.**

**What NOT to buy:** more barrels, more struts, more pipes. Sixty-five tube-and-stick
primitives is the disease; the budget is not the cure for it.

**Draw calls are untouched.** A module merges to one mesh per surface used
(`kit.js#finish`), the five surfaces are fixed (`kit.js:70`), and geometry inside an
existing surface is free. **No module may introduce a sixth surface.** Benchmark peak
today is **231 draws of 320 and 79,471 triangles of 1,900,000** — draws at 72% of
budget, triangles at 4.2%.

---

## 6. THE FICTION

The Nadir is a salvage tug and its modules are cut off other ships, so "bolted on" is
the right story told with the wrong craft. A torch cut is not a disassembly: the crew
went aboard something dead, cut a gun and the piece of hull it was bolted through free
in one lump, brought it home, cut a matching hole in their own skin and **welded it
in**. So a graft has a *seam*, not a joint — a visible line where the donor's plate
grid meets ours at an angle that belongs to neither, with the donor's paint running up
to it and stopping dead, and our own plating laid over the join to carry the load.
Everything about it should look **competent and permanent and wrong-coloured**: the cut
edge irregular and off-centre because a torch is held by a person; the weld bead proud
2–3 m off both plates because nobody dressed it; the chocks unequal because they were
cut to fit what was actually there; the module's long axis 7° or more off our plate grid
because the hole was cut where the frame allowed, not where the drawing wanted. What it
must never look like is a clean collar and a flush face. **A module that meets the hull
at a perfect hexagonal ring came out of a catalogue, and this ship has never seen a
catalogue.** The current geometry throws all of that away by meeting the hull at a
32 m disc, 16 m clear of the skin, with nothing crossing the join — which is the one
place the whole character of the ship was available for free.

---

## 7. WHAT NOT TO CHANGE

The hull form was won by measurement and the module library is held apart by
measurement. Both are protected.

**The hull form — do not touch:**
- `HULL_STATIONS`, all thirty rows. `RIDGE_STATIONS`, all twelve. `LOD1_Z`, `LOD2_Z`,
  `RIDGE_LOD1_Z` and `FACET_LOD` — the LOD picks are by name and a blind decimation
  already cost this project a class-identity bug.
- `greeble.js#facetProfile`'s five `side` rows and its `camber` / `deadrise` defaults.
  Every hull in the game and all twenty-four modules go through this function.
- The five `SURFACE` entries and two `GROUPS` in `cruiser.js`. Draw counts **11 / 6 / 3**
  are byte-identical across the last redesign and any edit that raises one is a defect
  until it is argued for in that file's header.
- The measured character: **32.4% axis-aligned, 16 normal clusters, top6 34.2%**, and
  L1 / S4 / L2 / L5 all PASS in `ships/audit.mjs`.
  *(That audit prints 5101 tris where the probe prints 5241; the 140-triangle difference
  is the 70 running-light quads. The numbers agree.)*
- Envelope **1402 × 562 × 348** and **beam : height ≥ 1.5**. §4.1's bay deepening spends
  20 of the 26.7 m this leaves; nothing else may spend the rest without re-deriving it.

**The measured separations — re-run, never assume:**
- **78 class pairs** (`ships/audit.mjs`) and **46 same-mount module pairs**
  (`modules/audit.mjs`, 10 + 10 + 10 + 10 + 6). Both green today.
- The M7 tag sets: two modules on one mount must differ in at least 2 tags.
- `MODULE_DIVERGENCE` = mean 46.7, max 140. `ship-language.md` §6 M2 = mean 45, max 120.
- `tools/silhouette.mjs`'s LOD2 identity checks: bay as a through-void with a ≥ 87 m
  narrowest span, island as a stepped stack (5 plateaux), cutter-yoke hook, stern-block
  step. Measured today at side 91 m / top 103 m.
- R2.6 enclosed background **6–12% in both views**; today LOD0 side 9.18% / top 8.44%.
- LOD coherence IoU floor 0.72; cruiser LOD1 0.954 / LOD2 0.787.

**The contract — do not touch:**
- Five of the six anchors. **Only `ventral` moves, 26 m in y**, per §4.2.
- `yawCentre` / `yawWidth`, `ARC_RATIONALE` and `assertMountArcsFaceOutboard`. The arcs
  tile the circle with 30–34° of overlap and were wrong on every flank mount once
  already.
- `mirrorX` and the port-authored-only rule. No hand-authored starboard copies.
- `SCALE_CUE.runningLightSpacingM` = 40 m, on hull and module alike.
- The bay's clear span. `cruiser.js:396-400`: if the ship must be shallower, widen the
  bay — never close the gap between the chords.
- Standing rules: 1 unit = 1 metre, no `Math.random`, no allocation in hot loops, no
  image files, two LODs per module, never construct a material directly.

---

## 8. THE GATES THIS WAVE MUST FIX

Two of them, and both are the same class of defect: **a check that cannot fail.**

### 8.1 The loadout criterion is not a gate

`src/probes/loadouts.js:364-365` computes PASS/FAIL and writes it into the PNG. It sets
**no process exit code**, and `loadouts` is absent from the `GATES` array in
`tools/gates.mjs` (12 entries; 8 non-browser, which is what `--fast` runs and what
prints "8 gate(s)"). `docs/review/acceptance.md` names this exact pattern as having
produced a false PASS once already, when a stale `loadouts-top.png` was read as a live
measurement.

**Fix:** add `src/probes/loadoutsAudit.mjs` — node, stub material registry, no browser,
the same `diff()` maths — and `process.exit(1)` on fail. **The scratch script behind
§4.1 is a working existence proof: it builds all three loadouts and prints the
divergence in about two seconds with no Chromium.** Then add to `GATES`:

```js
{ id: 'loadouts', cmd: ['node', 'src/probes/loadoutsAudit.mjs'],
  what: 'three loadouts separable in outline' },
```

Non-browser, so it runs under `--fast`, so it runs every wave. **Have it print the
per-channel breakdown** (halfWidth / top / bottom), because that decomposition is the
only reason this document could tell the difference between a design that survives
recession and one that does not.

### 8.2 The front view does not gate, and it has regressed

`node tools/silhouette.mjs`, re-run on the current tree:

```
  bow / bow_mining_array                       front(fyi) 1x ~67 m at x[82..262] y[72..188]
  dorsal / dorsal_sensor_mast                  front(fyi) 2x ~22 m at x[-51..-29] y[254..307] + x[29..46] y[224..260]
  dorsal / dorsal_shield_pylons                front(fyi) 1x ~69 m at x[-33..33] y[304..423]
  starboard / port_cannon_bank                 front(fyi) 1x ~31 m at x[264..295] y[15..87]
  (side and top gate the exit code; front is printed and does not — see VIEWS)
  ...
  A standoff   side one piece   top one piece   front(fyi) 1x ~22 m at x[-51..-30] y[253..306]
```

Four modules and one whole loadout show detached fragments in front view, worst at
**69 m** against a **26 m** precedent, and the exit code is 0.

**This is the same defect as an unseated module** — a lobe standing clear of the hull
crown with nothing crossing the gap — so it belongs in this wave and the seat is most
of the cure. The chocks and the plate run close the mounted end by construction. The
bow's 67 m needs the plate run to reach *under* the detached lobe specifically.

**Fix:** promote the front view to gating with a **26 m** fragment floor, in the same
commit as the seat, so the two land together and neither can be blamed for the other.

---

## 9. BUILD ORDER

Four steps, each independently measurable. Do not merge them.

1. **The seat** (§3) at all six mounts, plus the `SEAT_STANDOFF` 7 → 3 change.
   Re-run: `modules/audit.mjs`, `silhouette.mjs`, `probe.mjs cruiser`, `gates.mjs`.
   Expect the module audit's 46 pairs to move by < 2 m and stay green.
2. **The form language** (§2) and the triangle plan (§5), module by module, starting
   with the six that appear in the three probe loadouts.
   Re-run after each mount's set: `modules/audit.mjs`, and re-render
   `docs/probes/modules.png` — the sheet still claims a 400 ceiling.
3. **The loadout gate** (§8.1) **before** the ventral work, so the ventral change is
   measured by a check that can fail.
4. **The ventral** (§4): bay floor, keel pan, anchor move, runner rails, then the three
   modules' depth bands.
   Re-run: the new loadout gate, `silhouette.mjs` (R2.6, R2.7, LOD2 identity),
   `ships/audit.mjs` (B:H and the LINES block), `probe.mjs loadouts` for the picture.
   **Declare the measured worst-pair mean against the predicted 62–72 either way.**
