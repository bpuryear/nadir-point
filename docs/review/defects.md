# Defect log

Running list from visual review. Each entry has a location, a specific description and
a state. This file is the input to the review passes and is not allowed to be empty
just because a pass produced no new findings — an empty pass means look harder.

State: `OPEN` · `FIXED` · `ACCEPTED` (understood, deliberately not fixed, with a reason)

---

## Pass 0 — first art output (integration review)

### D1 · Cruiser hull value range is flat — `docs/probes/cruiser.png` · PARTIAL
The hull sits at an even mid-grey across almost every surface. There is no rim light
and the shadow side is nowhere near black. §4 of the brief calls for extreme value
contrast with ships defined by rim light and silhouette, because that is the single
highest-leverage technique for hiding polygon and texture limits. Right now the ship
reads as a grey model rather than a lit object.
**Fix direction:** raise the key/fill ratio hard, add a rim/kicker from behind, crush
the shadow end of the curve. This is a lighting fix, not a geometry fix.

**Moved, not closed.** The key was solved analytically once (13.5 → 4.6) and that solve
dropped two terms: a painted hull is metalness 0.18, so only 82% of the albedo reaches
the diffuse lobe, and three's ACES pre-scales by exposure/0.6 before `RRTAndODTFit`.
Carried through properly for albedo 0x666d75 on a face at NdotL = 1, 4.6 puts that face
at sRGB **0.465**, not the 0.57 the palette claimed — which is why the frame still
measured dark. The key is now 6.8, which lands a fully-lit face at 0.572, inside the
0.55–0.62 target band, and the ambient terms were not raised with it so the
key-to-fill ratio went 11:1 → 17:1.

Measured on the hull mask of `docs/review/look-surface/close.png` at 1280×720, against
the same crop of the pre-pass frame:

| | before | after |
|---|---|---|
| bridge lit face, median | 0.379 | **0.430** |
| whole hull, median | 0.320 | **0.357** |
| whole hull, 90th pct | 0.403 | **0.446** |
| frame contrast (capture harness) | 0.129 | **0.143** |
| clipped | 0% | **0%** |
| saturated albedo (HSV S > 0.5) | 2.4% | **2.0%** |

Still PARTIAL: the *fully lit* face is calibrated, but a face at NdotL ≈ 0.7 measures
0.43 rather than the ~0.5 the three-value read wants, and the deck/flank split is still
weaker than the reference. The remaining lever is geometric (tumblehome, §2 of
ship-language.md) rather than photometric.

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

**The lighting half is addressed; see D24 and D25.** Three separate causes, all in the
rig rather than in albedo: the probe was using the raw belt colour where the game
broadens it (D24), the rim was acting as a broad top light on every upward face (D25),
and `fill.broad` at 0.42 was not broadening far enough — it is now 0.62, and the rim
takes a `broad` of its own at 0.30. Measured saturated albedo on the hull mask of
`close` is 2.0%, inside §4's 3.5% budget; the reference range quoted in §4 is 1.8–7.0%.
What remains is that the faces the key misses are still lit by one hue at one value,
because there is nothing else out there to light them — that is a property of vacuum,
not a defect, and the fix for it is the recess-colour trick in §4, which is geometry.

## Pass 6 — faction fleet and modular loadouts

### D17 · The fleet was still built to the pre-rebuild ship language · FIXED
The cruiser was rebuilt to `docs/design/ship-language.md` and the nine faction hulls
were not, so the player's own ship and the ships it fought no longer looked like they
came from the same game. Four corrections went across every hull:

- **`Lines` carries a keel half-beam per station** (`ships/common.js`, eighth column).
  Tumblehome 0.78–0.86 aft, flare 1.05–1.12 forward. The whole fleet was a plain
  `octProfile` — vertical flanks, no two-value split, no flare — because the class
  could not express anything else.
- **Every station table now has a waist and a shoulder** and a chisel prow whose tip
  centre is below the axis. `Lines#audit()` measures R2.1 flat run, R2.2 extrema,
  R2.3 waist depth and R2.5 tip offset, and `probes/ships.js` prints the result on
  the silhouette sheet: **10 of 10 tables pass**, two of them marked exempt from R2.2
  *with the reason stated* (the Bulwark's and the Whipcord's waists are open voids,
  not stations, and cannot be expressed in a table that describes one of two pieces).
- **LODs are picked by hand, not decimated.** `Lines#loftPick(zs)` replaced
  `decimate(rows, 2)` at every call site. Blind decimation is what made the cruiser
  read as three different classes at three ranges (D9); the fleet had the same bug.
- **Damage groups collapse to one past LOD0** (`buildShip`). Nothing is destroyed
  independently at 5 km and the groups were costing a draw call per group × surface.

### D18 · Ardent vs Bulwark separated only by a 26 m waist notch · FIXED
Both classes read as a cross in plan, because the Bulwark carried two 15 × 15 × 74 m
broadside boxes standing off its flanks at exactly the place the Ardent has its
sponsons. The boxes are gone; the Bulwark's guns are now recessed casemates flush in
the flank (a recess deeper than 8 m, so the greeble inside self-shadows, §3), and the
Ardent's sponsons moved outboard to x = ±40 against a 21.5 m shoulder half-beam and
stand on **two open trusses** with 40 m of sky inside each arm of the cross.
**The rule, stated so it cannot drift: the Ardent is solid in the middle and wide at
the edges; the Bulwark is empty in the middle and narrow at the edges.** Verified in
`ships-silhouette-top.png`.

### D19 · Peregrine read as a horizontal smear · FIXED
The previous attempt bolted a 20 m spine slab and two tail fins onto a hull whose own
top line ran flat for 360 m, and a feature on a flat hull is still a flat hull. The
vertical event is now **in the hull lines**: the section top rises from +8 at the
transom to +98 at z = −30 and falls to −16 at the stem — 114 m of sweep, three
inflections, no horizontal anywhere — so the hull is 140 m deep against 40 m before,
i.e. 29% of its own length. That is also the faction-correct answer: Coalition builds
a vertical event by standing a blockhouse on a deck, Concord by sweeping the hull up.

### D20 · Modules were decoration, not silhouette · FIXED
The acceptance criterion "three loadouts distinguishable in silhouette" measured
26.5 m mean outline divergence against a target of 45. It now measures **76.5**, and
`probes/loadouts.js` prints PASS. The fix was the one the previous entry named:
ventral, engine and broadside modules that are far larger and genuinely cantilevered,
separated on three axes at once rather than on size alone. Two secondary defects fell
out of it and are recorded because they will come back otherwise:

- the loadout probe's own row spacing (660 m) was smaller than the new fitted
  envelope, so the three rows overlapped and the audit picture became unreadable —
  the same class of defect as D15. Spacing is now derived from the measured envelope.
- six modules breached the 400-triangle ceiling on the way (worst 538). All six were
  brought back by removing chamfers from Coalition boxes, uncapping struts whose ends
  are buried, and dropping a fourth outrigger bell to three. Worst is now **398**.

### D21 · The carrier's canyon had a floor, so it was not a hole · FIXED
First pass ran the Anvil's flight deck the full 560 m of the slot. A canyon with a
floor is a trench: from directly above the plan silhouette closed up solid and there
was no angle from which background passed through the ship. The deck now stops at
z = −170, leaving a 150 × 166 m through-hole open to the sky, the keel and astern,
framed by two transverse beams. Verified in `ships-silhouette-top.png`.

### D22 · Four new roles are registered but the war will never spawn them · OPEN
`sim/ai/roster.js#pickClass` resolves by `role` and its callers only ask for
corvette / frigate / destroyer, so `coalition_monitor`, `coalition_carrier`,
`concord_escort` and `concord_tender` are reachable from the probes and the registry
but never from the faction war. **Owned by the world-sim stream** — the fix is in
`sim/ai/roster.js` and `world/factionWar.js`, which this stream does not edit.
Proposed alongside it: add `monitor: 300`, `escort: 300`, `tender: 620` and
`carrier: 900` to `core/units.js#HULL_LENGTH`, which is shared foundation; the two
lengths are currently declared locally in `ships/coalition.js` and `ships/concord.js`.

---

## Pass 8 — fleet and modules, measured rather than argued

Every entry in this pass was found by a NUMBER, not by looking, and each one had
already been argued closed in prose in pass 6. That is the lesson of the pass: three
of the four criteria this stream owns were carrying claims that no tool checked.

### D28 · The scale cue disagreed with itself: fleet lights 6 m, cruiser 40 m · FIXED
Two constants in this codebase both call themselves the game-wide running-light
spacing, and they differ by a factor of six and a half:

| | value | used by |
|---|---|---|
| `core/units.js#SCALE_CUE.runningLightSpacingM` | **40** | cruiser, all 24 modules |
| `art/textures/runningLights.js#RUNNING_LIGHT_SPACING_M` | **6** | the faction fleet |

`ships/common.js#chineStrip` authored U straight in hull metres, and the texture lays
a lamp every 6 m of U, so every faction hull wore lamps at 6 m while the player's own
ship wore them at 40. The one repeating feature in the game whose entire job is to be
a ruler was lying by a factor of 6.5 about every enemy in the frame, and
`probes/ships.js` printed "running lights every 6 m on every hull" on the sheet, so
the picture asserted it too. §7 of ship-language.md is explicit: 40 m, game-wide,
never overridden.

**Fixed** in `ships/common.js`: `LIGHT_U_PER_M` converts hull metres into texture
metres for `chineStrip` and `lightRun`, so the fleet, the modules and the cruiser now
share one spacing. The probe's own 1400 m reference block was graduated in the same
wrong units and is fixed with it.

**Not fixed, and not this stream's to fix:** there are still two constants. One of
them should be deleted, and the survivor should live in `core/units.js`. Owned by
materials/textures — see the stream report.

### D29 · Two dorsal modules and two broadside modules were the same silhouette · FIXED
The acceptance criterion "every module identifiable from silhouette alone at max
tactical zoom" was PARTIAL with an honest note that the evidence was a contact sheet
rather than a measurement. It is now measured: `modules/audit.mjs` fits every module
of a mount to a real 1400 m cruiser, bins the whole fitted outline over the union of
the envelopes, and holds each pair to one and three pixels at the 30 px read (46.7 m
mean over the bins the two modules touch, 140 m peak). Of 46 pairs, four failed:

| pair | mean | peak | |
|---|---|---|---|
| `dorsal_rail_battery` / `dorsal_pd_ring` | 57 | **129** | both a cluster on a round pad |
| `dorsal_missile_cells` / `dorsal_pd_ring` | **30** | **78** | same bounding box, 215 m wide, both stopping near y 100 |
| `dorsal_rail_battery` / `dorsal_missile_cells` | 49 | **129** | |
| `port_cannon_bank` / `port_beam_array` | 63 | **91** | both a wedge reaching ~500 m outboard |

All four are closed by structure, not by size alone:

- **PD ring**: stalks 44 m → **150 m**, splayed 19° outboard so the four guns stand
  at a 102 m radius, outside the pad, with sky between them. The mount's TALL, OPEN
  fit. Zero triangles: a longer strut is the same eight triangles as a short one.
- **Missile raft**: 196 → **252 m wide**, and the crane that was setting its whole
  silhouette height came down 46 m. The mount's LOW, WIDE, SOLID fit.
- **Rail battery**: turret 16 m taller, rails and hoist up with it, so the 210 m of
  rail that overhangs the foredeck clears the raft's deck line by fifty metres along
  its whole length — the difference is where it is most visible, against sky.
- **Cannon bank**: the casemate now **hangs below the mount plane** on two visible
  brackets with the barrels canted 15° down, the four guns are **echeloned** on
  steps, and its reach drops from 486 to 290 m against the beam array's 548. The
  sign flip is the structural difference; the echelon is the half of it the plan
  view can see, because a sponson fitting cannot move the hull's deck or keel line
  and therefore scores nothing from abeam for hanging low.

Now: **46 pairs, every one separated**, worst `port_cannon_bank / port_beam_array`
at mean 95 peak 149.

### D30 · The loadout sheet's captions described a ship that was not in the picture · FIXED
All three rows of `loadouts.png` printed `1403 x 396 x 614 m` under three visibly
different ships, because `getSilhouetteSignature` reports length/beam/height off the
BARE hull's bounds. The row carrying a 300 m jump ring astern claimed the same length
as the row that has nothing there. The captions now carry the measured fitted
envelope **and** the bare hull, so the difference is the point rather than hidden:
A 1913 × 781 × 756, B 1674 × 1118 × 921, C 1777 × 966 × 861.

### D31 · `Box3.setFromObject` measured every module as if it were bolted to the origin · FIXED
A measurement bug that invalidated the first run of the audit in D29, recorded
because anyone measuring a fitted hull will hit it. A module is a child of a SOCKET
and the socket carries the entire mount offset — `[0, 94, -40]` dorsal, `[0, 32, 420]`
bow. `Box3.setFromObject` updates the object's ancestors' LOCAL matrices and its own
descendants' world matrices; it does not refresh an ancestor's WORLD matrix. Measure
a freshly built hull without calling `updateMatrixWorld(true)` on the root and every
socket is still identity, so a bow module is measured at the middle of the ship and a
dorsal turret at the keel. Measured, the rail battery topped out at y = 142; the real
figure is 236. Fixed in `modules/audit.mjs`, `modules/kit.js`, `probes/loadouts.js`
and `probes/modules.js`, each with the reason stated at the call site.

### D32 · The module contact sheets rendered subjects on top of each other · FIXED
`modules-engine-bare.png` had the 520 m stern armour belt standing in front of the
300 m jump ring, so the ring could not be critiqued at all. The bare-view grid was
authored at 470 m spacing when the biggest module was ~300 m across, and the modules
then doubled in size to satisfy the loadout divergence criterion. Backing the camera
off — which the framing block already did — does not separate two objects that
intersect in world space. The grid is now MEASURED off the built geometry, with the
authored spacing kept as a floor, and the framing now also backs off by the deepest
cell's half-extent along the view axis — without that term the 900 m siege lance, which
lies half along the line of sight, projected wider than the fit allowed and was clipped
by the left edge of the bow sheet. Same defect class as D15 and the loadout row spacing
in D20; a review picture whose subjects overlap proves nothing about either.

A second, quieter mismatch fell out of the rewrite and is fixed with it: on the
`set=all` contact sheet the legend numbered the mounts bow-first while the grid drew
bow LAST, so the numbered list and the picture disagreed about which row was which.
Row order now follows the legend.

### D33 · The Whipcord carried its whole read in one view · FIXED
Recorded in the acceptance doc as the remaining PARTIAL on class separation ("a
twin-boom is a razor edge-on"). Now measured: `ships/audit.mjs` compares all 78 pairs
of the thirteen classes, normalised to a common 200 m so the comparison is about
shape and not size, and the Whipcord was the closest class to two others — 7.1 m from
the Concord strike craft and 7.5 m from the Meridian against a 6.7 m floor.

**Fixed in the hull lines, not by bolting something on:** the wing has 32° of
dihedral, the booms ride at its knuckle 4.6 m above the nacelle, the fins are canted
with the wing, and a 7.4 m keel blade hangs under the belly. Height 12.6 → 22.3 m on
a 95 m hull (aspect 0.13 → 0.23), three profile events where there were none, and the
plan-view read is untouched: the knuckle is placed so the booms are still 9.4 m off
the centreline and the rectangular hole in the tail is exactly as wide as it was.
Worst pair now 8.8 m; all 78 pairs separated.

### D34 · The silhouette sheet's new audit block printed over the ships · FIXED
Appending the pairwise-divergence table to the existing top-left label ran it
straight through row 1 of the sheet. It is a separate bottom-anchored block now. The
rule this keeps breaking: text on a review sheet exists to be read *against* the
picture, so it may never be *on* it.

---

### D3 · Placeholder hull blows out and contradicts the key — `docs/probes/poi_giant.png` · OPEN
The stand-in box renders near-white with no readable key direction while the gas giant
behind it is correctly dark on its unlit side. This is an explicit acceptance-criteria
violation ("no object lit from a direction that contradicts the POI's key light").
Partly a placeholder artefact, but it also suggests near-camera objects are receiving
far more light than the POI rig intends.

### D4 · Panel tiling repeats visibly along a 1400 m hull · FIXED
*Self-reported by the materials stream.* A 17–20 m plate tile repeats roughly 75 times
along the cruiser. `opts.seed` gives genuinely different layouts but each seed is a
full triple bake, so it is a 2–3 variant budget rather than a solution.
**Fix direction:** a second detail-tiling frequency, UV randomisation per panel region,
or a stochastic sampler. Cheapest real win is the second frequency.

**Closed by three changes, in `art/textures/hullMaps.js`, `art/textures/macro.js` and
`art/materials/hullShader.js`.** All three were needed; none of them alone is enough.

1. **The tile got bigger, per frequency tier.** `variantSpec` now carries a `tileMul`,
   so `hull` is the CALM ARMOUR tier at 2.2× (57 m on the player hull — 24 repeats over
   1400 m, against §7's "largest plate module ≥ 55 m, ≤ 26 repeats"), `plating` stays
   medium at 26 m, and `greeble` is dense machinery at 0.55× (14 m). A 4 : 1 ratio
   between the calm tile and the dense one, which is what makes them read as different
   kinds of surface rather than the same surface at two sizes.
2. **A domain warp on the detail UVs**, analytic two-octave value noise at a 68 m
   period and 5.2 m amplitude, both stated in metres and converted against the tile so
   the warp stays proportional on all three tiers. The plate grid stops being a
   lattice: seam rows bow and drift by a few metres, so no repeat lines up with the one
   before it. This is what kills the LATTICE as opposed to hiding it.
3. **A second, non-tiling frequency** — `macro.js`, sampled in OBJECT space through a
   six-region atlas, so it is sampled once from stem to stern. Its low-frequency value
   drift (±15%) means no two repeats of the plate tile are ever the same patch, which
   is how the eye detects tiling at all.

Cost: one texture per faction, one extra texture fetch, and **zero extra draw calls or
shader programs** — `customProgramCacheKey` is a constant so every hull material in the
game shares one program. `npm run smoke` measures 58 programs, unchanged.

**A regression this caused, and its fix.** Raising the calm tile to 57 m also made
`hullMaps.stampMarkings`' tiling stencil 2.2× larger, and the first capture after the
change had the same hull code and the same hazard bar printed a dozen times down the
starboard flank — the exact defect this entry is about, in a louder form. Tiling
stencils are now OFF by default (`tilingMarks`); the macro layer draws those marks once,
in object space, at a size stated in metres.

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

### D8 · Texture memory is unmeasured and likely too high · PARTIAL — now measured
*Self-reported by the materials stream.* No per-distance map-size reduction, no
atlasing, no cap. Needs a measurement once real content lands, and probably 256² maps
at LOD 1–2.

**Half closed: it is measured.** `TextureFactory.bytes()` sums width × height × 4 × 4/3
over every live texture and `registry.audit()` reports `textureMemoryMB` and a
per-generator breakdown. Every generator here produces 8-bit RGBA with mipmaps on, so
this is an upper bound on the GPU-side cost.

**Still open: nothing has been reduced.** There is still no per-distance map-size
reduction and no cap, and the macro layer added a 1152 × 768 RGBA atlas per faction
(4.7 MB with mips, ~19 MB across the four factions) on top. That was a deliberate
trade — it removed the tiling read, which is what the review actually failed the build
on — but it is a debit against this entry, not a credit.

---

## Pass 7 — surface treatment, shading and lighting calibration

### D23 · `shadow.bias` was set in metres but is a fraction of the depth range · FIXED
The acceptance doc recorded "cast shadows are still not visible on hulls despite 37
casters / 41 receivers live", and the reason was a units error in two places.

three adds `shadow.bias` to the NORMALISED depth of the shadow comparison, so for an
orthographic shadow camera it is a fraction of (far − near). Both rigs were carrying
values chosen as if it were metres:

| | depth range | bias | peter-panning |
|---|---|---|---|
| `world/lighting/poi.js`, at `shadowRadius` 3600 | 17 280 m | −0.0004 | **6.9 m** |
| `probes/cruiser.js` | 6 500 m | −0.0012 | **7.8 m** |

On top of that, `pois.js` overrode `shadowRadius` to 3600/3800/3200 against poi.js's own
note that the box had been *halved* to 1750 specifically to get the normal offset down.
At 3600 m over a 2048 map a texel is 3.5 m and `normalBias` was 4.9 m. Between the two
terms, every self-shadow was displaced 8–12 m from the geometry that cast it, which is
more than the depth of most of the contact shadows on this hull.

**Fixed:** both biases are now stated in metres and divided by the depth range
(−0.35 m); `normalBias` is 1.35 texels; and the three POI shadow boxes are 2000 m,
sized to the hull plus its immediate escorts. Inter-ship shadows in vacuum land on
nothing and are never seen, so the box has no reason to be larger.

### D24 · The cruiser probe lit the hull with a more saturated fill than the game · FIXED
Blind review cited `docs/probes/cruiser.png` for "saturated cobalt-blue as flat
full-face fills". The probe was building its fill light from `poi.fill.color` raw — the
gas giant's *deepest belt* — where the game's own rig averages it towards neutral by
`fill.broad`, because the light off a disc thirty degrees across is the average of the
whole disc. The probe was therefore showing a defect the shipped rig did not have, and
hiding whatever the shipped rig did have. It now broadens the fill exactly as
`world/lighting/poi.js` does.

### D25 · The rim light was a top light at the tactical camera's pitch · FIXED
`_rimDir` was `cameraForward + 0.42 × up`. At the tactical camera's 10–25° downward
pitch that is enough to flip the rim's elevation POSITIVE, so the "kicker" sat above
the ship shining down and lit every deck, sponson top and fin at one constant cold
value across its whole area. That is a second key with a hue, and a broad
constant-value light on upward faces is precisely the "flat full-face fill on
apparently arbitrary panels" finding. Lift is now 0.28.

### D26 · Marks were sized in region fractions, not metres · FIXED
The first macro layer sized its hazard patches as fractions of a region — "0.13 × 0.042"
reads modest, and lands on the foredeck as a **208 × 67 m** yellow smear once multiplied
by the 1600 m region. Every mark is now stated in metres against §4's caps, and the
region resolution went 256 → 384 px (4.17 m/texel) because a 5×7 block glyph needs seven
texel rows and at 6.3 m/texel that forced a 44 m character before it resolved at all.

### D27 · Macro marks were placed where the hull is not · FIXED
A region maps ±800 m to 0..1 on both axes, but a capital hull is 1400 × 330 × 490 m and
does not fill one squarely. On a flank region — projection (z, y) — the hull occupies v
from 0.355 to 0.645 and nothing else. Placement was uniform over 0.10–0.90, so roughly
three quarters of the flank marks were drawn on empty texture and never appeared. Each
region now has an explicit placement band matching the hull's real extent, and `place()`
returns null rather than falling back to a bad spot.

---

## Pass 9 — surface treatment, round two

Round one of this stream scored 3/10 in a blind comparison against real Homeworld and
Star Citizen frames. Every entry below is one of that review's findings, and each one
is closed against a NUMBER produced by a tool that did not exist when the finding was
written. Three new tools were needed and are the durable part of this pass:

| tool | answers |
|---|---|
| `tools/maps.mjs` | what the plate layout actually is, at 1:1, with a metre ruler, without booting the game |
| `tools/surface.mjs` | p05/p25/median/p95/max on the hull mask, calm/medium/dense per §3, saturated fraction, and gradient anisotropy |
| `tools/shadowcheck.mjs` | does the ship self-shadow — by diffing the frame against itself with `castShadow` off |

### D35 · The macro atlas was losing three of its four channels to premultiplied alpha · FIXED

**The most consequential find of the pass, and nothing in the render loop was wrong.**

`macroField` packs four channels — R value drift, G roughness drift, B soot, A marks —
and built the texture with `bytesToCanvas` + `CanvasTexture`. A 2D canvas backing store
is **premultiplied**. Alpha is 0 over ~99% of this atlas (marks are sparse by design),
so every one of the other three channels was multiplied by zero on the way in.

Measured, in the same browser the game runs in (`tools/maps.mjs` prints it on the
sheet):

```
canvas alpha round-trip: wrote RGB(200,150,100) at A=0, read back RGB(0,0,0)
                         at A=255 read back RGB(200,150,100)
```

So D4 was closed on a mechanism that could not have been working. The macro layer's
value drift — the thing the entry calls "the cheap half of the D4 fix and the half that
does most of the work" — was a constant, and its only effect was a flat −15% albedo
offset. The soot channel was empty. This is why round two's review found "no macro value
drift survives the mip drop": there was none to survive.

**Fixed** by building the atlas as a `THREE.DataTexture`, which hands the bytes to the
driver untouched. Every other generator in the directory writes alpha 255 everywhere and
was never at risk. Cost: zero.

*Honest scope note:* what was measured is the canvas round-trip, which is the path the
atlas was built through. The GPU upload was not separately read back. The fix removes
the failure mode rather than instrumenting it.

### D36 · The plate generator was a masonry generator · FIXED
Blind review: "bevelled rectangular blocks in running bond at the SAME block scale on
every part — ashlar masonry", "not one weld bead, fastener, hatch outline or plate lip
with thickness anywhere on the hull".

Three properties of the old recursive-subdivision (BSP) generator made that outcome
unavoidable, and none of them were tuning:

1. **A BSP has no preferred direction.** Every leaf is bounded on four sides by a seam
   of equal weight. Real plating is strongly anisotropic — strake seams run the length
   of the hull for hundreds of metres and butt joints are short and subordinate.
2. **Every leaf ramped from groove height to plate height on all four sides.** That is a
   bright rim on two sides and a dark rim on the other two: a highlight ring around
   every block, which is the loudest masonry cue available.
3. **Recursion concentrates leaves at one characteristic size**, so the calm reserve §3
   demands cannot exist — the recursion always fills the tile.

`panelLines.js` is rewritten around **strakes and butts**. Strake seams run the full
width of the tile and, because the tile repeats along the hull, run stem to stern
continuously. Butt joints are perpendicular, one per plate, and **phase-offset per
strake** so no two strakes butt at the same station — that phase is the single line that
stops it being a grid. Both joints are flush; `grooveM` is stated in metres (0.26,
under the 0.3 the review demanded) and converted against the tile. Relief now comes from
three things a ship actually has: proud **weld beads** on a minority of seams, **plate
lips** with real thickness on the few plates that step, and **fastener rows along strake
seams only** — never ringing a plate, which was the second-loudest masonry cue.

Measured on `docs/probes/hullmaps.png`:

| tier | tile | repeats over 1400 m | strakes | plate |
|---|---|---|---|---|
| calm armour | **93.6 m** | **15.0** | 3 | **93.6 x 31.2 m** |
| medium plating | 29.9 m | 46.8 | 3 | 29.9 x 10.0 m |
| dense machinery | 13.0 m | 107.7 | 4 | 6.5 x 3.3 m |

§7 requires the largest plate module ≥ 55 m and ≤ 26 repeats over 1400 m. It is 93.6 m
and 15.0. Round one measured 16–35 m plate courses and 40–90 repeats.

### D37 · There was no calm square metre on the ship · FIXED
The three frequency tiers existed but differed only in tile SIZE, and the same block
field at two sizes is still one kind of surface. They now differ in the two things that
decide what a surface IS — **how many seams it has and in which direction they run**.
The calm armour tier is a 93.6 m tile with three strakes, **zero greeble, zero
fasteners, zero plate steps**: a flat plate with two long lines across it and one
staggered butt per strake. The calm tile is **7.2x** the dense tile and carries roughly
a twentieth of the seam length per square metre.

### D38 · The radiator speck field was arithmetic, not taste · FIXED
"A uniform regular grid of bright specks that aliases into visible moire at 1280x720."
`greebleCanvas` draws a hatch 26–70 px on a 512 px canvas; on the dense tier that canvas
covered a 13 m tile, i.e. 39 px per metre, so a "hatch" was **0.7–1.8 metres** across —
smaller than the crew that would open it and repeated forty times per tile. Feature size
is now stated in metres (`TARGET_FEATURE_M = 3.2`) and converted against whatever tile
the tier uses, and the count came down with it. The same hatch is 3.2 m on the 13 m
machinery tile and 3.2 m on the 30 m plating tile, which is what a metre-based UV
convention is for.

### D39 · Marks were placed at random, which is why none of them was structural · FIXED
"Accent colour does not follow structure. The yellow patches sit mid-face, cross plate
boundaries, start and stop nowhere structural... Quantity is not the problem — placement
is the entire failure."

The cause was mechanical: `place()` drew a uniform random point inside a band and
dropped a rectangle on it. **Nothing in the generator knew where the deck chine, the bay
mouth or the drive well were**, so nothing could possibly land on them. `macro.js` now
carries a `SHIP` table of named features in ship metres, taken from ship-language.md §5
and §7, and every mark is anchored to one: the deck-chine and keel-chine edge stripes,
the bay door swing arc traced along its real 210 x 320 m opening, the drive-well rim as
an eight-bar ring at its real 62 m radius, hazard patches at the grapple pivots (at
DIFFERENT z port and starboard, §5), hull numbers on both flanks and the stern block,
the 7-degree off-grid captured armour plate as an OUTLINE with a fastener row, and the
exposed rib section on the port flank. Region 4 (the bow) still carries nothing, per §3.

### D40 · Hull numbers were painted in safety amber · FIXED
The macro layer had one ink colour, so §4(c) functional markings and §4(a)/(b) accent
came out the same hue. A stencilled registry number is paint and a hazard band is a
warning. The atlas's one free channel now encodes the family in its VALUE — ink at 0.42,
hazard at 1.0 — and `hullShader.js#nadirMark` classifies with a smoothstep, for two
uniforms and about five ALU. **Stated cost:** across the outer edge of a hazard patch the
filtered value passes through the ink band for well under one texel, so a hazard patch
carries a sub-4 m lighter edging. Real placards have that border; a second sampler to
avoid it was not worth it.

### D41 · Per-plate albedo variance was saturating its own normalisation · FIXED
"Random light/dark scatter between adjacent blocks... some plates read a full step
brighter than their neighbours in no discernible pattern", required ≤ ±4%.

Not a taste problem: plate tone and strake tone are multiplied together and `hullMaps`
normalises the PRODUCT against `toneSpread`. Drawing both at the full spread made the
product range ~1.8x `toneSpread`, so any plate near either end **saturated the
normalisation and jumped the whole way to the alt colour**. One budget, split 0.6/0.4,
and `toneSpread` is 0.035 across the factions. ±4% authored is now ±4% rendered.

### D42 · The value range used the bottom two thirds of the curve · FIXED
Measured on the hull mask of `close.png` (`tools/surface.mjs --crop`): p25 0.226,
median 0.360, p95 0.481. Over matched crops the SC Stanton hull runs 0.28 → 0.744 and
HW3 0.182 → 0.681. The frame was not too dark — 41% near-black against Stanton's 48% —
the **top two stops were simply unused**.

The palette's own solve was already correct and its TARGET was wrong: 0.55–0.62 for a
fully lit face was chosen to leave headroom that nothing then used. Carried through
three's ACES (which pre-scales by exposure/0.6) for albedo 0x666d75 at metalness 0.18:

```
I = 8 -> 0.623   I = 12 -> 0.729   I = 14 -> 0.765   I = 16 -> 0.793   I = 20 -> 0.835
```

`giant-orbit` key 6.8 → **14.0**, which lands 0.765. **Fill, bounce and rim are
unchanged**, so the key-to-fill ratio goes 17:1 → 35:1 and the shadow end stays exactly
where the review said it should. The other POIs are raised by the same solve, except
`near-star`, which grades at exposure 0.86 and was already on the shoulder.

This also buys the **deck/flank split** that no geometry change could. `sunDir` at
giant-orbit is 20 degrees of elevation, so a starboard flank returns NdotL 0.78 against
the deck's 0.35. At I = 6.8 those landed at 0.51 and 0.36 — fifteen points apart in the
compressive toe, reading as one value. At I = 14 they land at 0.70 and 0.51.

### D43 · Self-shadowing: the ship DID shadow itself, and it did not read · FIXED
Two passes argued about this from screenshots. `tools/shadowcheck.mjs` settles it by
posing the close shot, shooting it, setting `key.castShadow = false`, shooting it again
and diffing:

```
before:  5.3% of lit pixels change,  mean delta 51/255,  worst 166
```

So cast shadows were live and were landing on the hull. Round one's "the ship does not
self-shadow at all" and the acceptance doc's "cast shadows are still not visible on
hulls" are both wrong as absolutes, and D23's bias fix did work. What was true is that
5.3% coverage on a hull whose lit deck measured 0.36 is a small absolute step in a dark
frame.

Two changes make it read. The key doubling (D42) doubles the absolute contrast of every
shadow already there. And the box comes in from 1750 m to **1200 m** (and pois.js's
2000 → 1400), which takes the texel from 1.71 m to 1.17 m and the normal offset — stated
in texels, because that is what it is physically about — from **2.31 m to 1.58 m**. A
2.3 m offset was eroding the near end of every contact shadow, which is exactly where a
contact shadow does its work. The depth range came in with it: it was 8400 m for a
1400 m ship, which is depth precision spent on empty space.

### D44 · Stair-stepped silhouettes: SMAA cannot fix a two-pixel step against black · FIXED
SMAA was already in the chain and is a post filter on the RESOLVED image — it
reconstructs an edge from neighbouring pixels, and a lit plate against literal zero has
nothing in between to infer a gradient from. The composer's HDR target now carries
**4x MSAA**, which supersamples coverage at the rasteriser. It goes on the composer's
target rather than on the `WebGLRenderer`, whose `antialias: false` note stays true:
MSAA on the BACKBUFFER does not survive HDR; MSAA on the HDR target does.

### D45 · The 180 m structural rhythm was invisible at every distance · PARTIAL
"At the everyday playing view all surface detail has vanished... §3's second, coarser
180 m structural frequency is not visible in the render at any distance I looked at."

The review's own fix — make it geometry, a real proud frame ring at each station — is
right and is **the geometry stream's to make**; it is raised in this stream's report and
nothing here substitutes for it.

What this stream can do, and did: the rhythm is now in the macro layer rather than in
the tiling detail map. The tiling map is addressed at metres/tileM and mips away as soon
as a tile falls under a few pixels; the macro layer is object-space at 4.17 m/texel and
is sampled once stem to stern, so a 180 m feature in it is 43 texels wide **at every
LOD**. A shallow per-bay ramp plus a 5 m darker line on each station. Visible in the R
channel of `docs/probes/hullmaps.png` as vertical banding on the two flank regions and
horizontal banding on the deck and belly, and absent on the bow and stern faces where
"along the ship" is out of the page.

Still PARTIAL until the geometry lands: a value band survives mips, but it cannot cast a
shadow, and at 14 km what carries a frame ring is its shadow.

### D48 · Raising the key blew out an entire faction · FIXED
Caught by the material chart acting as the canary it exists to be: one render after the
key solve, the whole **Concord** row of `docs/probes/materials.png` was clipped white
with no gradient in it.

Concord's hull albedo was `0xc6cfd6` — 78% reflectance, near-white paint. That was
survivable only because the keys were two stops low. Carried through ACES at the solved
key of 14.0, a fully lit Concord face lands at sRGB **0.955** against the player hull's
0.765: not "pale ceramic" but a white silhouette with no form in it.

The lesson is the one already at the top of `palette.js` about metal albedo, running the
other way — **what the player sees is the RENDERED value, and the authored hex only gets
there through the light.** Solved for 0.88: `base` 0x868c91, `baseAlt` 0x7b8185,
`plating` 0x8f969b, with the original's blue-white hue ratio (198 : 207 : 214) preserved
exactly. Concord is still comfortably the palest faction in the game and now holds a
gradient. `greeble` and `bare` are deliberately NOT brought down — both are metals, where
albedo is F0 reflectance and darkening it makes a black hole.

**And the same measurement caught a second error in this pass's own work.** The five
non-hero POI keys had been *scaled* by giant-orbit's factor rather than solved. Solving
each one against its own key COLOUR and its own grade exposure gives belt 15.9 (had been
set to 20.0), graveyard 20.0 (15.0), yard 17.3 (17.0), near-star 20.3 (26.0) and station
15.5 (19.0) — **four of the five wrong by 20–30%**, because a 0xb6c6da key and a
0xfff0d8 key do not deliver the same irradiance at the same intensity.

### D47 · The hull number rendered as a mirror image · FIXED
Found by this stream in its own output, in `docs/probes/cruiser.png`, one render after
D39 put the marks where they belong: the registry code on the starboard flank read
backwards. A backwards glyph is worse than no glyph, because it reads as a rendering
bug rather than as paint.

The cause is handedness. A macro region projects two object-space axes onto a face, and
for lettering to read left-to-right when you are looking AT that face,
(axis1, axis2, outwardNormal) has to be a RIGHT-handed triple. Three of the six were
not — +X starboard, +Y deck and −Z stern — because the projection was written for the
positive-facing case and reused verbatim for its opposite.

Fixed in `hullShader.js#nadirMacroUV` by negating the first axis on those three
regions, with the same three signs in `macro.js#AXIS_FLIP` so a mark authored at a
station in ship metres still lands at that station. Without the second half, un-mirroring
the text would have moved every starboard mark to the opposite end of the ship — a
subtler and more expensive bug than the one being fixed. `frameRhythm` takes the same
flip for the same reason.

### D46 · `tools/probe.mjs` reported HMR reloads as probe crashes · FIXED
The probe harness ran the dev server, whose HMR full-reloads the page whenever anything
writes to the tree — which is constantly, because iterating IS writing to the tree. The
failure surfaces as `Execution context was destroyed, most likely because of a
navigation`, which looks exactly like a probe crash and gets debugged as one. It cost
about forty minutes of this pass before it was recognised. Now `mode: 'preview'`, the
same fix and the same reasoning `capture.mjs` already carried; `probe.html` is already a
rollup input so preview serves it.

**`tools/bench.mjs` has the identical bug and is deliberately NOT fixed here** — it is
the performance stream's file per ARCHITECTURE.md, and unilaterally editing another
stream's tooling is what that ownership table exists to prevent. It cost this pass one
wasted benchmark run, which is the honest reason it is being raised rather than
shrugged at. Proposed change, three characters: `startServer({ port })` becomes
`startServer({ port, mode: 'preview' })`.

---

## Pass 10 — silhouette coherence

### D49 · Six modules had parts that touched nothing — `tools/silhouette.mjs` · FIXED
Found by rasterising the outline a reviewer actually judges and counting 4-connected
components, which is a thing no audit in this tree did. The list, with the world-space
extent of each detached piece as the tool prints it:

| module | view | detached | what it was |
|---|---|---|---|
| `ventral_hangar_deck` | side | 215 m | the landing platform, hung at y −432 with a 46 m section, so its top edge was −409 against a hangar block whose bottom is −368 |
| `port_flak_cluster` | top | 167 m + two 40 m | the hub, all six barrels and both hoppers |
| `ventral_drone_bay` | side | 45 m | a coolant conduit struck from above the neck and outboard of the collar |
| `bow_breaching_prow` | top | two 34 m | the two outboard teeth, set at the ram's 40 m-wide tip at x −38 and +40 |
| `engine_thruster_upgrade` | bow | 73 m | the outboard drive pod, 26 m below the spar it hangs from |
| `ventral_repair_bay` | bow | 274 m | the entire 940 m dock cage |

**The flak cluster is the instructive one.** Its trunnion arms *splayed* outboard at
dz = ±0.28 per unit of reach from roots at z ±44, so they finished at z ±78 while the hub
they carry ends at z ±30 — 48 m of clear sky at the joint — the barrels were struck from
x −168 against a hub whose outboard face is −158, and each hopper stalk was a hand-typed
74 m aimed at a box 129–154 m away. Four separate pieces of one module, all floating.

**Why nothing caught it.** `modules/audit.mjs` and `ships/audit.mjs` bin the outline
along z and record a top/bottom envelope per bin; a detached part lands in the same bin
as the hull and *widens* that bin's range, so it scores as MORE silhouette, not as a
defect. `probes/cruiser.js#floatingParts` runs a union-find over part bounding boxes, and
every one of these pieces is merged into a per-surface mesh whose box spans the whole
module. Both tools were measuring something real and neither could see this.

Fixed structurally, not by nudging: the arms converge instead of splaying, the barrels
are struck inside the hub, both stalk lengths are **computed** from the distance to the
box they carry, the repair bay grew three centreline king posts and legs that run spine
→ beam → rail rather than stopping at the beam, and the engine bracket's height is
derived from the spar's underside. Two figures are still typed by hand where the shape
demanded it; everything else follows its neighbour.

Draw calls unchanged — every added part went into a surface bucket its module already
had, so the per-material merge count is identical. `ventral_repair_bay` went 366 → 402
tris and was brought back to 386 by uncapping two arm struts that are buried at both
ends; the library's worst is 398/400 as before.

### D50 · The bow-on view is degenerate for anything axial — ACCEPTED, with the reason
`tools/silhouette.mjs` still reports two fragments in the bow view that it deliberately
does not fail on: a 24 m sliver at each cargo pod and a 31 m one at the starboard cannon
bank. `pipeRun` builds its flanges as `capFront: false, capBack: false` walls — correct,
because a flange is normally seen against the tube it rings — so viewed at *exactly* zero
degrees off its own axis a flange projects to a hexagonal outline floating 30 m clear of
the pod body, and the component counter is right to call that two pieces. One degree off
axis it is one piece, and no camera in the game sits at exactly zero.

Side and top gate the exit code; the bow figures stay printed and are read by a person,
because a large one still means something — it is how the carrier build's outboard engine
pod was found. Recorded rather than suppressed so the next person does not rediscover it.

### D51 · LOD coherence was never measured — now it is, and it passes
D9 closed "the cruiser read as three different ship classes across its three LODs" by
authoring every level inward from LOD0 and writing that down as a rule in the file
header. A rule in a header is not a measurement. `tools/silhouette.mjs` now takes the IoU
of each level's side mask against LOD0's, rasterised in **LOD0's own window** so a level
that shrinks is penalised rather than rescaled into agreement.

Fourteen subjects, floor 0.72. Worst LOD1 is `concord_escort` at 0.900; worst LOD2 is the
bare cruiser at **0.764**, which is the tightest margin in the set and the number to watch
— it is the 150-triangle proxy at the one distance where silhouette is the only
information available. Everything else sits at 0.795–0.982.

---

## Deferred / accepted

### A1 · Frame rate is unverified — ACCEPTED (environmental)
No GPU in the build environment; headless Chromium runs ANGLE over SwiftShader. Draw
calls, triangles, programs and CPU step cost are measured and enforced. No fps figure
is asserted anywhere. Requires a run on target hardware to close.

### A2 · WebGPU path unverified — ACCEPTED (environmental)
`navigator.gpu` is unavailable here, so a `WebGPURenderer` path could not be validated
at build time. §5 of the brief permits shipping WebGL2 and saying so.
