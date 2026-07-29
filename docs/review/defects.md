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

**REOPENED AND CLOSED AGAIN, DIFFERENTLY — the gate was the wrong instrument.** Blind
round-one review looked at the LOD2 proxy this entry passed at 0.764 and called it "a
fish with a caudal fin": the ventral bay throat, the ship's single identifying feature,
had been closed into a solid rectangle, the superstructure deleted and the hooked cutter
yoke straightened into a spike. **IoU cannot see any of that, and not because 0.72 is too
low a floor.** Filling a hole adds the same pixels to the intersection and to the union,
so closing the one void nothing else in the game has moves the ratio by less than the gap
between two adjacent thresholds. A metric that is structurally blind to the defect it is
supposed to catch cannot be tuned into seeing it.

`tools/silhouette.mjs` still prints IoU — a level that shrinks or drifts is a real defect
and IoU catches that — but the **gate** is now four direct questions asked of the LOD2
mask itself, one per identity feature: the bay present as a through-void with its clear
span intact (114 m, against R2.7's 87 m), the island present as a stepped stack (counted
as plateaux along the mask's top edge, 5 against a floor of 3), the cutter yoke hooking
(the outline must come back UP forward of its lowest point, −234 m to −200 m), and the
stern block stepping in (transom half-beam against the waist's, 63 px to 28 px). The
proxy was rebuilt outward from those four rather than inward from LOD0's volume, at
214 → 370 triangles across the same two draw calls, and IoU rose to 0.811 as a side
effect rather than as a target.

---

## Pass 10 — surface and material identity, round three

Every entry below was found by rendering the generated maps at 1:1 with
`node tools/maps.mjs` or by reading the arithmetic, not by looking at a screenshot.
Three of the five had been argued closed in prose in pass 9.

**RENUMBERED — this section's first three entries used to be D49, D50 and D51, which
are also the ids of the three entries in the *silhouette coherence* section above.**
That is D62, and it is closed by this renumber. The silhouette set keeps its numbers
because it is the set with live external references — `HANDOFF.md:130` cites D49 for
detached module parts and `tools/silhouette.mjs:460` cites D51 for the LOD2 proxy —
so renaming those would have broken two working cross-references to fix an ambiguity
that only this section created. The three below are now **D64, D65 and D66**; their
old ids are recorded on each entry so an older reference can still be resolved.

### D64 (was the second D49) · The plate generator was still a masonry generator, in three places · FIXED
`docs/probes/hullmaps.png` before this pass shows the running bond plainly. The
strake rewrite (D36) changed the DIRECTION of the field and left three mechanisms
that produce ashlar regardless of direction:

1. **One butt per strake per tile at a jittered phase is running bond.** That is the
   definition of the pattern. `nPlates = round(strakes / plateAspect)` resolved to
   exactly 1 on both the calm and the medium tier, so every strake carried exactly
   one vertical break offset from its neighbours' — a brick wall with a 6:1 brick.
   `panelLines.js#buttChance` now GATES each butt: 0.20 on the calm tier, so four
   strakes in five run unbroken across the tile.
2. **The lip was a 7 m soft bevel.** `hullMaps.js` derives `lipM = seamM * 2.1`, and
   seamM on the calm tier was 3.37 m, so every strake seam had a nineteen-texel
   squared falloff up one side and down the other. That is the "bright rim on two
   sides, dark rim on the other two" this generator's own header calls the loudest
   masonry cue, reintroduced as a gradient instead of a hard edge. `lipPx` is now
   clamped to **two texels** and the falloff is linear, so a plate lap is a step.
3. **Per-plate roughness was a uniform random constant per rectangle.** D41 capped
   per-plate ALBEDO at ±4% and left the identical defect standing in the ORM map,
   where `plate.rough` ran the full ±1 into a ±8.8-point roughness step at every
   plate boundary. Under a key that reads as a value step exactly like albedo does,
   and the maps sheet showed it: a field of visibly different-toned rectangles in
   ORM beside a nearly flat albedo. Roughness is now 75% per-STRAKE.

### D65 (was the second D50) · The three frequency tiers were one surface at three sizes · FIXED
Pass 9 claimed the tiers "differ in how many seams they have and in which direction
they run". True of the strake count, false of everything the eye uses: all three laid
running bond. They now differ in **whether they have butts at all**, which is a
difference of kind:

| tier | tile | strakes | strake h | butts | greeble | rivets | steps | repeats/1400 m |
|---|---|---|---|---|---|---|---|---|
| hull (calm) | **109.2 m** | 6 | 18.2 m | **0.20** | 0 | 0 | 0 | **12.8** |
| plating (medium) | 52.0 m | 6 | 8.7 m | 0.62 | 0.34 | 0.85 | yes | 26.9 |
| greeble (dense) | 16.1 m | 4 | 4.0 m | 1.00 | 0.90 | 1.00 | yes | 86.8 |

The calm tile came **down** from 187 m and that is not a retreat. A 31 x 187 m
"plate" is not an object anyone recognises, so the previous tier bought its calm by
being too big to have any feature in frame — which is why review measured 93–97%
calm and still called it blank. The calm now comes from what has been removed.

### D66 (was the second D51) · `alt` was being used as a second MATERIAL, so three variants rendered at the average of two colours · FIXED
**The most consequential find of the pass, and it explains three rounds of "hulls read
at a single value".** In `hullMaps.js` the per-texel colour is `lerp(base, alt, t)`
with `t = 0.5 + (t0 - 0.5) * contrast` and contrast is 0.30–0.40, so `t` never leaves
0.5 ± 0.2 — **the surface's actual colour is the MIDPOINT of `base` and `alt`.**
Harmless when they are neighbours, which is what a plate-to-plate variance is. Three
variants had them as different materials:

| variant | base | alt (was) | rendered |
|---|---|---|---|
| `hullDark` | baseDark | **base** | a mid grey, never a dark |
| `greeble` | greeble | **baseDark** | the average of a bright metal and a near-black |
| `plating` | plating | **base** | Y 0.130 against `hull`'s Y 0.132 |

The last row is the one that matters. `palette.js` states at length that `plating`
sits "a genuine half-stop BELOW `hull`" so "the belt/spine split is a VALUE split that
survives to LOD2". It was not — the two rendered within **1.5%** of each other, which
is invisible, and the fleet's `hull`, `plating` and `dark` surfaces were therefore all
resolving to nearly the same grey. Solved together so the midpoints land where the
palette says they land: **0.710 / 0.627 / 0.359** lit sRGB, in the ALBEDO, where no
lighting pass can take them away.

`greeble` is the one that moves down: its palette entry is a metal's F0 and the old
`alt: baseDark` was wrong in KIND and accidentally right in VALUE (Y 0.21). The new
pair keeps the value (Y 0.206) and fixes the kind.

### D52 · Colour identity was four temperatures; the hull albedo was authored cool · FIXED
`reference-ui-language.md` §1: "the whole screen is black, amber, and bone … our
frames carry neutral-grey hull, blue planet, warm-brown asteroids and cobalt accents —
four temperatures." Every hull albedo in `palette.js` was authored COOL (player base
0x666d75 is hue 212°, B > G > R) under a cream key, and the two cancelled: the shipped
frame's hull mask measured RGB(0.556, 0.537, 0.498), dead neutral.

Rotated onto the warm axis **at constant linear luminance**, so the six solved POI key
intensities remain valid (they were solved against a specific linear luminance):
player base 0x666d75 → 0x716c63, Y 0.1505 → 0.1514. Every hull colour holds to within
1%. Concord is left cool as the stated faction-hue exception.

**Near-black was not near black.** `baseDark` — the third value of "amber / bone /
near-black" — was 0x3a3f47 / 0x495561 / 0x373b31 (Y 0.049 / 0.088 / 0.042), i.e. mids.
Every faction's is now Y 0.012–0.024.

### D53 · Saturated navy and cobalt were whole-face fills, and it was a palette bug · FIXED
`ships/common.js#SURFACES` maps the logical surfaces `dark` and `trim` onto whole
merged meshes, so every square metre Concord geometry called "trim" was painted
`0x2f7fa8` (chroma **0.72**) and every square metre it called "dark" was `0x495561`.
That is the model-kit finding, and D24 had already cleared the fill LIGHT of it — it
was in the palette the whole time. Both are near-neutral slate now (trim chroma
0.720 → 0.098). `variantSpec('trim')` no longer fills with the accent at all: it fills
with the faction's own plating and draws the accent as a 2.6 m band along the strake
seams (`stampAccentEdges`), so accent follows structure per §4.

### D54 · Accent had no semantics, so no mark meant anything · FIXED
Adopted Falling Frontier's rule from `closest-comparables.md`: **ORANGE = ACCESS AND
MAINTENANCE, WHITE = SENSORS**, applied identically on every faction because the mark
names a function and a function has no nationality. Three families now come out of the
one atlas channel (`macro.js` values 0.42 ink / 0.72 hazard / 1.00 sensor,
`hullShader.js#nadirMark` classifies).

**The band ORDER is load-bearing.** A mark's filtered outer edge ramps down through
every band beneath it. Sensor was tried at 0.72 with hazard at 1.0 and the consequence
is arithmetic: a hazard patch is the largest mark on the hull, its bars are 2–3 texels
at 4.17 m/texel, and every one would have carried a bone-white fringe on both sides —
averaging an ORANGE access marking towards WHITE at exactly the distance the rule
exists to serve. Hazard sits in the middle band; the fringe lands on the sensor
family, whose members are thin outlines, and puts a warm rim on a white aperture.

### D55 · Plate scale did not track surface size · PARTIAL
"A 400 m armour face must not carry the same cell as a 30 m module", and it did:
`modules/kit.js` asks for `get('hull', { tier: 2 })` for a 30–100 m bolt-on and
`cruiser.js` asks for the same key for a 1400 m hull, so a module wore one sixth of
one plate. `hullMaps.js#resolveTile` and a `surfaceM` registry option now bound the
tile to 1.6–10 repeats across the stated surface, quantised to 25 m so it cannot
fragment the material cache.

**Still PARTIAL and it is not this stream's to close:** no geometry call site passes
`surfaceM`, and `src/art/geometry` belongs to another stream. Two one-line changes
would make it bite — `modules/kit.js:91` adding `surfaceM: 90` and
`cruiser.js#SURFACE.hull` adding `surfaceM: 400`. What ships today is the mechanism,
plus a calm tile that is no longer 187 m wide, which improves the module case on its
own.

### D56 · One macro atlas anchored every faction's marks to the PLAYER CRUISER · PARTIAL
Raised by pass 9 as a stated limitation and by review as a finding. The mechanism is
not fixable by moving marks: a region maps ±800 m of object space, `macroM` is a
per-MATERIAL uniform, and a whole faction shares ONE hull material — so per-class
scaling means per-class materials, i.e. a draw call per class per surface against a
budget already at 499 for a committed 320.

What is done instead: the mark set is **self-similar**, drawn at three scales of the
same anchor table (1.00 / 0.34 / 0.14, reaching ±700 / ±240 / ±100 m), so the annulus
a 480 m destroyer actually samples carries a stripe, a hatch and an aperture sized and
placed for a 480 m hull. The scale multiplies both region axes, so a chine at y = 68 m
on the cruiser sits at y = 23 m on the destroyer set.

**Stated limitation, in full:** this makes the marks PLAUSIBLE at a class's size, not
CORRECT for that class. A destroyer whose real chine is at y = 18 m still gets a
stripe at 23 m. Closing it needs a per-class anchor table plus either the draw budget
for per-class materials or a texture array.

---

## Round-1 UI review — systems-UI stream

Every item below was raised with a measurement, so every one is closed with a
measurement. Two new gates were added so none of them can silently come back:
`npm run uicheck` (contrast, escaped text boxes, colliding text boxes, illegal ink)
and `npm run occlusion` (what share of the ship the interface is standing on).

### U1 · The HUD covered the player's ship — FIXED
Measured by diffing the identical pose with the interface up and suppressed. That
diff is now `tools/occlusion.mjs` and it runs on three poses.

| pose | hull covered, before | after |
|---|---|---|
| three-quarter | 99.0% | **1.8%** |
| close | 80.3% | **9.2%** |
| engagement | — | **3.1%** |
| central half of frame | 36.3% | **7.2 – 8.6%** |
| whole frame | 15.5% | **12.2 – 12.6%** |

Four changes, not one. ARMAMENT no longer opens by default and nothing else does
either — a window open before the player asked for it is welded chrome wearing a close
button. `PanelHost.solve` scores every 24 px grid position against the player's
projected bounding sphere, the reserved welded regions and the other open windows, and
re-solves when the ship's box moves. The target block collapses from 360 px to a
two-line prompt when there is no lock, which is where most of the remaining figure
came from. And `\` held hides the interface entirely.

### U2 · Dim text below any usable contrast floor — FIXED
`C.inkGhost` was alpha 0.17 of a bone white on near-black — 1.42:1, which cannot clear
3:1 at any size — and `C.inkFaint` was 0.38, i.e. 2.91:1. Both were used as body text.
The ramp is now three text values, all above 4.5:1 against the plate (ink 14.7,
inkDim 9.7, inkFaint 6.6), and the old ghost value survives as `C.track` for bar
tracks and inert chip fills ONLY. `Painter.text` audits every glyph against a
whitelist and `tools/uicheck.mjs` walks every (font, colour, background) pair.

Disabled state is now `Painter.struck` — a leading dash and a strike rule at full ink.

### U3 · Welded blocks were transparent over bright content — FIXED
Only the floating windows had the near-opaque plate; the welded chrome used
`P.scrim` at alpha 0.62–0.70, and at a close framing the white hull read straight
through the REACTOR ROUTING panel. `Painter.plate` is now used by every block, and
`C.panel` went from 0.955 to **1.0** — the last 4.5% was printing the hull through the
ARMAMENT window body at rgb(13,14,21) on rgb(2,3,10).

`C.panelTitle` was also wrong in a way nobody had measured: it was
`mix(spaceBlack, ice, 0.045)` and `mix` lerps in LINEAR space, so it came out
rgb(47,53,58) — a mid grey, not a near-black band. It is now a 5% ink lift composited
over the plate, which lands at rgb(13,14,21) as intended.

### U4 · The sealed-state hatch was drawn over the text — FIXED
The power panel's diagonal hatch went down last, so every label in it was struck
through and two rules ran through the WEAPONS and ENGINES baselines. The hatch is now
drawn FIRST, on the plate, under everything, and the content is drawn on top at full
ink — locked no longer means illegible. Same fix on the device hotbar's `NONE CARRIED`
and on destroyed sub-part squares, where the glyph now goes down after the hatch.

### U5 · Panel content overflowed its own frame — FIXED
Every panel now reserves a footer strip; content clips above it and the strip prints
`▼ N MORE · SCROLL`. Panels also GROW toward `maxH` before they scroll, and a row is
only drawn when the whole row fits — a caption sliced by the panel border reads as a
rendering fault, not as "there is more". `uicheck` asserts no drawn text box extends
past its panel's inner rect.

### U6 · Names truncated to uselessness — FIXED
Nine ellipses in one ARMAMENT panel. `src/ui/names.js` authors a short name per module
and per device at twelve characters or fewer, with the faction word stripped — it is
already carried by the identity stripe and by the ORIGIN column, and re-printing
`COALITION` was what forced the ellipsis. `COALITION RAIL BATTERY` is `RAIL BATTERY`.
The empty state names the socket (`PORT SPONSON`) instead of fading `— NO MODULE —`.

### U7 · Colour semantics had collapsed — FIXED
One saturated red-orange carried thermal state, out-of-ammunition, structural failure,
subsystem disabled and an alert count at the same value. `SEMANTIC` in theme.js now
writes the split down and the call sites read from it: heat is amber escalating by
VALUE (`warnLow` → `warn`), starved states are neutral ink with a struck bar, and only
structural loss — BREACHED / LOST / DESTROYED — and the hostile contact get red.

### U8 · The player-state block had no layers and no rate — FIXED
It is now a three-row stack — SHIELD / ARMOUR / HULL — that is always three rows tall,
because the shape of what you do not have is information; the reference prints
`NO ARMOR 0%` for the same reason. Each row carries its own per-second rate, sampled on
the FIXED step, and a net `HP/S` figure underneath. The velocity bar prints `MAX 180`
over the fill, and beside it what the fitted mass is costing in acceleration and turn —
the honest coupling, because `refit.js` divides accel by `massLoad` and turn by its
square root and nothing in the sim makes mass reduce top speed.

### U9 · Type fixed in CSS pixels with no scale control — FIXED
`F.micro` was 9 px, which loses the counters in 8, 6 and 0 in this stack. The floor is
10 px and `setUIScale` (0.85 / 1.0 / 1.25 / 1.5, `=` to cycle) multiplies the whole
overlay by dividing the logical viewport, so type and every layout constant move
together. Defaults off viewport height.

### U10 · Windows did not avoid each other — FIXED
See U1 for the solver. A title bar may never be covered: `_raiseBuriedTitles` brings
any window whose title strip is under another to the top. The player-state and target
blocks are HARD reserved regions no window may enter.

### U11 · World-anchored text unreadable and clipped mid-word — FIXED
Every world-anchored string is now the reference's filled label chip with dark text
(§4) rather than light ink on nothing, which fixes both a bright planet and a white
hull at once. Occlusion is a WHOLE-LABEL test — if the rectangle is taken the string is
dropped, never clipped. The subsystem ring labels, the rejection reason and the arc and
range-ring captions all go through it, and duplicate captions (an arc and its range
ring both saying `LANCE 6.80 KM`) are suppressed.

### U12 · Column collisions — FIXED
`STARBOARD NACELLEENGINE` and `BALANCEDF1` were both fixed offsets. Columns are now
measured, and the target block's four right-hand columns are laid out from the RIGHT
edge with the name taking what is left, so nothing can be pushed into anything else.

Root cause of one of them was a real bug: `ctx.restore()` reverts `letterSpacing`, so
after any clip or hatch the painter's cached tracking was wrong and `measure` returned
a width for one tracking while `fillText` drew at another. `Painter._forgetTrack` is
called after every restore, and `Painter.text` now takes `maxW` so clipping and drawing
can never disagree about tracking.

### U13 · HULL and SALVAGE shared one line; the legend was ambiguous — FIXED
They have a line and a number each. The legend now states three encodings separately —
dim ink is out of arc, a strike is destroyed, the cyan dot means a whole part still
comes out — and the dot is legended rather than unexplained.

### U14 · Cargo cost was stated as volume but never as a cost — FIXED
The HOLD header prints `FITTED MASS ×4.14 · ACCEL −72% · TURN −51% · BURN ×4.14` and
says plainly that hold mass joins fitted mass when installed. These are read off the
sim; a falling top speed would have been invented.

### U15 · Orphaned `ARRIVAL IF YOU GO NOW` label — FIXED
It prints the actual ETA at best burn, the reward is labelled `PAYS`, and the modifier
caption sits above the divider at `C.inkDim`.

### U16 · The arc dial spent 90x90 px drawing nothing — FIXED
Collapsed to a single `ARC 0% — NO MOUNTS BEAR` line until at least one mount bears.

---

## Deferred / accepted

### A1 · Frame rate is unverified — ACCEPTED (environmental)
No GPU in the build environment; headless Chromium runs ANGLE over SwiftShader. Draw
calls, triangles, programs and CPU step cost are measured and enforced. No fps figure
is asserted anywhere. Requires a run on target hardware to close.

### A2 · WebGPU path unverified — ACCEPTED (environmental)
`navigator.gpu` is unavailable here, so a `WebGPURenderer` path could not be validated
at build time. §5 of the brief permits shipping WebGL2 and saying so.

---

## Integration observation — art-direction pass, form stream round 1

### D-INT1 · Surface may have overcorrected from "all medium" to "all calm" · OPEN
`docs/review/ad-form/close.png`. The form work is a clear improvement — mass hierarchy,
varied section, genuine see-through negative space in the ventral cradle, an asymmetric
hull number, and the cobalt flat fills are gone.

But at this range the hull now reads as almost entirely **calm**: panel plating is barely
legible anywhere on the primary masses. The brief asked for roughly 60% calm / 30% medium
/ 10% dense; this looks closer to 95% calm. The previous failure was uniform medium
detail everywhere, and the risk now is the opposite error — a hull with no surface
information at all reads as untextured rather than as restrained.

**Caveat, stated because it changes the diagnosis:** the frame is also bright, and
lighting is a deferred pass. Some of the missing plating read may be exposure washing it
out rather than the surface genuinely lacking detail. That distinction must be settled by
measurement — `tools/surface.mjs` reports frequency statistics on a hull mask — and not
from this screenshot.

**For the next pass:** confirm with `tools/surface.mjs` whether the calm/medium/dense
split is actually near 60/30/10 on the hull mask. If it is, this is an exposure artefact
and belongs to the deferred lighting work. If it is not, the dense and medium tiers need
restoring around machinery, joints between masses, and recesses — the places §3 of the
ship-language spec says they belong.

---

## Cohesion audit — after the container restart

An independent audit was run over the whole tree at the stopping point, specifically to
find what two killed workflows had left inconsistent. It also re-ran the evidence behind
every PASS in `acceptance.md`. Findings that are not already recorded above:

### D-INT1 now has a number · **STILL OPEN, AND THE NUMBER POINTED THE WRONG WAY**
The entry immediately below this heading used to read: *"`node tools/surface.mjs
docs/review/look-surface/close.png` gives a calm/medium/dense split of 78.1 / 20.3 / 1.6
against the brief's 60/30/10 … the hull genuinely is too calm."*

**That measurement reproduces exactly and its conclusion is still wrong**, because it was
taken on the wrong image. `ship-language.md` §3's reference table is built from ship
renders of Homeworld and Star Citizen assets, and its own "ours" row names
`docs/probes/cruiser.png`. `look-surface/close.png` is a game frame whose mask is 29.9%
of the picture and contains the HUD, lit asteroids and nebula. Comparing it to that table
is comparing a photograph of a room to a photograph of a model.

Measured today, all three framings of the same ship, `tools/surface.mjs` (which now
**requires** `--frame` for exactly this reason):

| framing | image | mask | tiles | calm | medium | dense |
|---|---|---|---|---|---|---|
| `ship` | `docs/probes/cruiser.png` @ HEAD | 8.0% | 503 | **44.9** | **45.7** | 9.3 |
| `ship` | `docs/probes/cruiser.png`, working tree | 8.0–8.1% | 505–507 | 44.0–44.6 | 46.0–46.5 | 9.5 |
| `scene` | `docs/review/look-surface/close.png` | 29.9% | 1781 | 78.1 | 20.3 | 1.6 |
| `face` | the same frame, `--crop 0.30,0.39,0.62,0.50` | 90.5% | 2111 | 97.2 | 2.8 | 0.0 |
| — | §3 reference median | | | 62 | 21 | 14 |
| — | §3 six-reference envelope | | | 51.3–79.8 | 10.1–39.0 | 6.8–22.1 |

**On the like-for-like framing the hull fails by being TOO MEDIUM, not too calm.** Medium
45.7% is over the top of the reference envelope (39.0, SC Idris Invictus quarter view) and
calm 44.9% is under the bottom of it (51.3, SC Javelin). That is
`cruiser-modules.png`'s failure mode, the one §3 describes as *"nothing for the detail to
be detail against"* — the opposite direction from what this entry has said since it was
written, and the opposite direction from what the greeble-band work was scoped against.

Three consequences, in order of how much they cost if ignored:

1. **Adding 6–9 dense greeble bands is aimed at the wrong tier.** It would raise dense
   from 9.3 toward the envelope's 22.1 ceiling while medium is already 6.7 points over
   the top. There are also **11 triangles of LOD0 headroom** (1989 against
   `BUDGET.cruiserCoreTris` 2000, `src/core/units.js`), and `ARCHITECTURE.md:24-26` is a
   non-negotiable that reads *"If you are about to add surface noise to make it look
   better, stop."* The band work stays unscheduled.
2. **The work that IS indicated is converting medium to calm** — enlarging continuous
   armour faces and removing mid-frequency incident from them — which costs negative
   triangles rather than positive ones and needs no budget decision.
3. **`tools/surface.mjs` could not have caught any of this and now can.** It had no
   `process.exit` outside its usage guard, so it always exited 0; and its printed rule
   was one-sided (`calm >= 60, medium <= 28, dense <= 12`), which the 78.1/20.3/1.6 scene
   figure *satisfies on all three counts*. A rule that cannot express "too calm" cannot
   catch the defect it was written for. It now takes a required `--frame ship|face|scene`,
   gates only on `ship`, gates against the two-sided envelope of §3's own six references,
   and exits 1 outside it. It exits 1 on `docs/probes/cruiser.png` today.

The `face` reading of 97.2/2.8/0.0 is not evidence of anything on its own: §3 has no
face-scale reference rows, so there is nothing to compare it to. `--frame face` reports it
and explicitly declines a verdict.

**A note on the working-tree row, because it is a moving target:** `docs/probes/cruiser.png`
is regenerated by `node tools/probe.mjs cruiser`, which another stream is running in the
same wave. Three measurements of it across this session gave 44.9/45.7/9.3 (HEAD),
44.0/46.5/9.5 and 44.6/46.0/9.5 — a spread of 0.9 / 0.8 / 0.2 points. The verdict is the
same on all three and the spread is well under the distance to either band edge, but any
future claim of a *delta* on this image has to clear that noise floor first. The number
that should be quoted is the one measured off a committed image, named by its commit.

### D57 · Four pieces of the core hull float unattached · **CLOSED — NOT A DEFECT. The detector was wrong, the geometry never was.**
The entry as written said: `node tools/probe.mjs cruiser` logs `DETACHED GEOMETRY` at all
three LODs, in the bridge and sensor-mast region — roughly x −51..16, y 177..366,
z −281..−170, offenders `core/hull#3`, `core/hull#4`, `core/greeble#0`, `core/greeble#1`
— and that it predated the interrupted art work and "cannot be reverted away".

Every one of those bounding boxes was real. The conclusion drawn from them was not.

`src/probes/cruiser.js` used to SHRINK every part's box by up to 0.5 m per axis and then
test the shrunken boxes for intersection. That demanded more than a metre of mutual
*interpenetration* before two parts counted as joined — so anything bolted flat to a
deck, which is how a bridge tower is built, reported as floating. The comment now at
`src/probes/cruiser.js:334-352` records the measurement that settles it: `core/hull#3`
sits on `core/hull#2` with a y-separation of **0.000 m** and overlap on both other axes,
and the four superstructure parts overlap *each other* by 10–29 m. They were a genuine
connected component whose only link to the main hull was a flush face — which is a join.

The check now EXPANDS by `TOUCH_TOLERANCE_M = 0.25` and tests intersection, i.e. touching
counts as joined. Commit `0c30f6c`, "The detached-geometry defect was the detector, not
the geometry". `src/probes/cruiser.js:280` prints `attachment audit: every part connected
at LOD 0/1/2`.

Re-run today: `node tools/probe.mjs cruiser` exits **0** and prints **no ERRORS block** —
62 draw calls, 7,630 triangles, 27 programs, 20 geometries, 47 textures. Note for whoever
checks this next: `tools/probe.mjs` forwards page `console.error` only, so the reassuring
`attachment audit: …` line never reaches the terminal. The evidence that the audit ran
and found nothing is the ABSENCE of a `DETACHED GEOMETRY` error, which is a `console.error`
and would be forwarded.

`HANDOFF.md:38` already said this in its own correction table and then `HANDOFF.md:125-132`
re-opened it four paragraphs later with the bounding boxes quoted; this entry sided with
the wrong half. **A defect sheet that lists a closed defect as open costs the next session
the afternoon this one spent confirming it** — which is the actual lesson, and it is worth
more than the four boxes were.

Nothing about the *class* of check is retracted: a bounding-box attachment sweep over the
core hull is worth having, it just has to answer "do these touch" rather than "do these
interpenetrate by a metre".

### D58 · The progression layer's `game.js` seam was dead, and the boot report said so backwards · FIXED
`STREAM_MODULES` in `src/game.js` had no glob matching `./sim/meta/`, so
`optional('./sim/meta/index.js', 'progression')` could never resolve and returned null
every boot. The layer ran anyway, via a documented backstop in `SalvageSystem`'s
constructor that exists *because* the glob entry was missing.

The dead seam was harmless. The boot report was not: it announced
`missing: progression` for a layer that was fully installed and running. A status line
that reports a live system as missing is worse than no status line, and this project has
already lost a wave to believing that the progression layer was not wired.

Fixed by adding the glob. Both installers are idempotent (`installProgression` returns
early if `world.systems.economy` exists), so whichever seam runs first wins.

The structural cause is worth recording separately: `ARCHITECTURE.md`'s ownership table
assigns **no owner to `src/sim/meta/**`**, so the stream that wrote it had no legitimate
place to wire itself and documented a workaround instead.

### D59 · `src/world/lighting/pois.js` never runs in the assembled game · FIXED
227 lines that author art-directed versions of `giant-orbit`, `graveyard` and
`near-star`. The only importer in the tree is `src/probes/poi_common.js`, so
`world.systems.pois` is absent at runtime and `src/world/system.js` registers its own
generic versions of all three instead.

`src/world/system.js:521-527` states that those three POIs "are owned by
`world/lighting/pois.js` and are left exactly as that stream authored them. We only fill
the gaps." That is false at runtime — `system.js` fills all of it.

**Deliberately not fixed at the stopping point:** wiring it changes what three POIs look
like, which is a visual change that wants a capture pass behind it.

**CLOSED (W1-F).** The import landed at `src/game.js` beside the other environment
streams, before `installWorldSim`, and `tools/poicheck.mjs` now gates it. Measured on the
live path — booting the assembled game and walking the player onto each node so that
`TravelSystem._updateArrivalTracking` builds it from the registry, which is the code path
a real run takes:

| POI | live key direction | live shadow box |
|---|---|---|
| giant-orbit | (0.7763, 0.3471, −0.5262) | 1400 m, normalBias 1.846 m |
| graveyard | (−0.9050, 0.1450, 0.4000) | 1400 m, normalBias 1.846 m |
| near-star | (0.5601, 0.3001, −0.7722) | 1400 m, normalBias 1.846 m |
| **control** `vault-nine` (generic) | — | **3600 m** |

All three match their authored `CELESTIAL_SPECS.sunDir` to 0.000 deg. Before the fix all
three resolved to `sunVector([200, 18])` = (−0.3253, 0.3090, −0.8937), which is 71.0 /
91.0 / 53.1 degrees from where each of them was authored — three places, one photograph,
which is the exact test `pois.js:4-6` sets for itself.

The shadow box is the load-bearing half of the check and the reason `vault-nine` is
measured alongside: the generic builder passes `shadowRadius ?? 3600` and the authored
defs pass the measured 1400, so reading the box back identifies WHICH registration won
independently of the sun vector. A control that still reads 3600 is what stops this
check from being vacuous. `node tools/poicheck.mjs`: 3 of 3 POIs reached, 16 assertions,
16 passed, exit 0.

Also removed while the file was open: the dead `systemPos` values on the three defs
(`[0.62, 0.18]`, `[-0.44, 0.71]`, `[0.08, -0.83]`). The field is declared in
`src/core/contracts.js` and read by nothing in `src/`, and it contradicted the only other
place that computes the same quantity — `world/system.js` derives it from the node table,
and `giant-orbit`'s row is `pos: [-120, -700]`, i.e. `[-0.133, -0.778]`. Two contradictory
map positions were survivable while the file was dead; they are not now that it is live.

### D60 · `docs/design/controls.md` §6.1 specifies a handling model the code does not implement · OPEN
No `player_cruiser` ship class is registered, so `src/game.js:128` always falls through
to `synthesisePlayerClass`, whose numbers are not the spec's:

| | live | `controls.md` §6.1 |
|---|---|---|
| mass | 62,000 | 620,000 |
| maxSpeed | 140 | 180 |
| accel | 14 | 6.0 |
| turnRate | 0.22 | 0.085 |

`turnFalloff`, `turnExp`, `turnRateFloorK`, `accelRetro`, `accelLateral` and
`maxLateralSpeed` appear nowhere in `src/`; `physics.js:91` implements a plain
`1 - 0.62·s²` with no floor clamp.

The ship flies well and the measured 14.9 s / 9.9 s figures in `acceptance.md` are real.
But they were measured on the fallback, not on the documented model, and `game.js:293`
claims "Numbers match the feel tuning in `docs/design/controls.md`." Either the spec is
the intent and the code should implement it, or the code is the intent and the spec is
stale — but the comment asserting they agree should not survive either way.

Related, and a genuine bug rather than drift: `src/world/travel.js:51` sets
`combatArrivalSpeed: 180`, mirroring the spec's maxSpeed, and hands the cruiser over at
that speed on the final leg — **28% above the live hull's own 140 m/s ceiling**.

### D61 · Two PASS rows in `acceptance.md` do not reproduce · OPEN
Both are recorded in full in `acceptance.md` itself and in `HANDOFF.md`: the lighting
key-direction row cites a key intensity of 14.0 that the code contradicts (11.5, after a
later global ×0.82 re-solve documented at `palette.js:817`) and a hull-mask p05 of 0.168
that the committed tool gives as 0.097 on the committed frame; and the loadout row's
verdict holds but every number in it is stale.

The loadout row also shows a structural weakness worth fixing generally:
`src/probes/loadouts.js:365` prints PASS/FAIL **into a PNG with no process exit code**,
so nothing gates it. That is exactly the setup that produced this project's one
acknowledged false PASS.

### D62 · Duplicate defect IDs in this file · FIXED
D49, D50 and D51 each appeared **twice**, under two sections both headed "Pass 10" —
at lines 793 / 832 / 845 and again at 886 / 910 / 927. Any cross-reference to "D51" was
therefore ambiguous, and at least one document makes one.

The second set is renumbered to **D64 / D65 / D66**, and each entry states its old id.
The *silhouette coherence* set keeps D49–D51 because it is the set with live external
references — `HANDOFF.md:130` cites D49 for detached module parts and
`tools/silhouette.mjs:460` cites D51 for the LOD2 proxy. Renumbering those to fix an
ambiguity the other section introduced would have broken two working references.

### D63 · The reserve-clamp self-test asserted against a precondition it never set · FIXED
`src/sim/selftest.mjs` §6 drained the propellant tank to `reserve + 0.05` and then ran
five seconds, expecting `stores.starved` and a clamped engine efficiency. It got
`starved false, efficiency 0.802` and failed — but the sim was right and the test was
wrong. The ship was still coasting toward the waypoint from the previous assertion, and
coasting costs nothing: `stores.js#_spend` returns early below 1e-4 of delta-v, so no
draw was ever refused and the clamp had nothing to engage on.

Fixed by reversing the course before the run, which forces a real burn. The assertion
now exercises what it claims to: propellant pinned at the 40.0 floor, `starved` true,
engine efficiency 0.361 — clamped, and above zero, so you can still limp.

`node src/sim/selftest.mjs` is 50 PASS / 0 FAIL, exit 0. It was exiting 1 before this,
which is worth noting on its own: a self-test that has been red for a while stops being
read, and this one is the only gate on the determinism rule.

---

## Wave 1 — POI lighting and measurement honesty (W1-F)

Everything below was measured on hardware (ANGLE/Metal, `tools/harness.mjs#rasterMode()`
returns `hardware` on darwin), not reasoned about. Where a number is quoted, the command
that produced it is named.

### D67 · The `close` look-review frame renders LITERAL BLACK, and the cause is one `pow()` in the engine-plume shader · **STILL OPEN. DIAGNOSIS CONFIRMED, FIX NEVER LANDED** — see the W2-E section at the end of this file for the independent re-measurement
`npm run capture -- --shots close` gives **luma 0.009, contrast 0.004**, trips both of
`capture.mjs`'s own guards (`FRAME IS FLAT OR EMPTY`, `FRAME IS ESSENTIALLY BLACK`) and
exits 1. ~~Measured over five consecutive runs of the identical command: **4 black, 1
through** — so it is not merely broken, it is *intermittent*.~~ **WITHDRAWN in Wave 2.**
Those five runs predate `2232a8e` pinning this shot to `poi=giant-orbit`, so they were not
five runs of the same shot. On HEAD it is 5 of 5 black to three decimals on hardware
(n=5, `npm run capture`), and it renders cleanly under `NP_RASTER=swiftshader`
(n=1, `tools/widediag.mjs close --assert`, 0.1692/0.2631). The rasteriser was what varied.
See the W2-E section at the end of this file.

**Everything obvious was ruled out first, by measurement, with `tools/widediag.mjs`:**

| suspected | measured |
|---|---|
| the ship is off-screen or behind the camera | dead centre, ndc `[0, 0]`, 1203 m from a 1402 m hull |
| the hull is too small to see | `cruiser:lod0` projects to ndc `[-0.62, -1.54] .. [1.10, 0.99]` — it OVERFLOWS the frame; `core/hull` covers 57% of it and `core/greeble` 78% |
| the camera is on the shadow side | key is FRONTAL: `dot(keyTravelDir, cameraForward) = +0.978` |
| frustum culling is eating it | **0 of 47 meshes** culled |
| the wrong LOD is showing | `cruiser:lod1` and `cruiser:lod2` are hidden, LOD0 is live |
| an in-flight camera snap overrode the pose | 6 of 6 trials: `_snap` null, `zoomT` 0.020, distance 1203 m — the pose is exact and deterministic |
| shadows / GTAO / godrays / the grade | disabling each ALONE leaves the frame black |

**The cause, isolated by bisection and confirmed three independent ways:**

1. Hiding the `vfx` subtree makes the frame render (mean luma 0.000 → 0.184). Inside it,
   hiding **`vfx:plumes`** alone is sufficient; every other vfx child makes no difference.
2. Disabling `UnrealBloomPass` alone makes the frame render. Bloom is the amplifier, not
   the source: its separable Gaussian smears one poisoned texel over the whole target and
   its additive composite then poisons every pixel.
3. Setting the composer's HDR target from `samples: 4` to `samples: 0` makes the frame
   render **at every one of eleven zoom steps** (a clean monotone 0.179 → 0.008).
   `samples: 2` still fails at 8 of 11. `samples: 4` fails at 10 of 11, reproducibly.

So: **MSAA on the composer target makes the rasteriser shade partially-covered edge
pixels at a pixel centre that lies OUTSIDE the primitive. Non-centroid varying
interpolation then EXTRAPOLATES, and `vUv.y` leaves `[0, 1]` by a hair.** A debug shader
that paints any fragment whose `vUv.y` is outside `[0, 1]` found **54 such fragments** in
a 320×180 sample of the frame. `src/vfx/engines.js` then evaluates `pow(t, 0.72)` (line
82) and `pow(1.0 - t, 1.10)` (line 94) on a negative base, which is undefined and returns
NaN. The `if (edge <= 0.0) discard;` on line 84 does **not** save it — every comparison
against NaN is false, so the fragment is kept and NaN is written to the half-float target.

Guarding only ONE of the three `pow()` calls still fails; guarding all three, or clamping
`t` once at the source, fixes it. Clamping `t` is the smaller change.

**THE FIX IS ONE LINE, IN A FILE THIS STREAM DOES NOT OWN** (`src/vfx/engines.js`
belongs to VFX per `ARCHITECTURE.md`'s ownership table, and no Wave-1 agent owns it):

```glsl
-  float t = vUv.y;                        // 0 at the bell, 1 at the tail
+  float t = clamp(vUv.y, 0.0, 1.0);       // 0 at the bell, 1 at the tail
```

Verified by applying exactly that substitution at runtime and re-measuring the real shot
with `capture.mjs`'s own statistic and its own three guards:

| shot | plume shader | luma | contrast | near-black | clipped | capture's guards |
|---|---|---|---|---|---|---|
| `close` | stock | 0.0090 | 0.0040 | 99.9% | 0.00% | **BOTH FIRE** |
| `close` | one-line guard | **0.1702** | **0.2622** | 67.8% | 0.00% | clear |
| `three-quarter` | stock | 0.0642 | 0.1355 | 71.8% | 0.00% | clear |
| `three-quarter` | one-line guard | 0.0647 | 0.1355 | 71.3% | 0.00% | clear |

The guarded `close` reproduces the committed `docs/review/look-surface/close.png`
manifest (meanLuma 0.1459, contrast 0.2263) to within the difference a POI pin and a
hidden HUD account for, and the frame contains the hull, its number and its plate
structure. `three-quarter` is unaffected either way, which is why this was never noticed.

**Why nobody saw it.** The composer target went `samples: 0` → `samples: 4` in commit
`64590fd`, and `docs/review/look-surface/close.png` was committed in that same commit —
its manifest records `fps: 4`, i.e. it was rendered under SwiftShader, where the failure
does not reproduce. Every frame since has been either black or unlooked-at.

**Consequences while this is open:** no surface, damage or lighting claim measured from
`docs/review/look-surface/close.png` can be regenerated on hardware, and `npm run capture`
is red. This is a **live gameplay defect, not a tooling one** — the same pose is a
perfectly ordinary tactical camera position, and the sweep found black frames across most
of the zoom range at that yaw. A player would see it.

### D68 · `QUALITY_PRESETS[*].msaa` is read by nothing · OPEN
`src/render/postfx.js` declares `msaa: 0 / 2 / 4 / 4` across the four quality presets and
documents it at length as "a quality knob and not a constant … on one that cannot afford
it, it is the first thing to drop". `PostChain.setQuality()` sets `gtao`, `godrays`,
`godraySamples`, `bloom` and `smaa` — and never touches the composer target's sample
count, which is hard-coded to `samples: 4` in the constructor. So `--quality low` does not
drop MSAA and there is no supported way to turn it off.

Found while measuring D67, where switching that number is the difference between a black
frame and a good one. Two lines to fix, in the render stream's file. This is exactly the
class of defect `?quality=` already produced once (`HANDOFF.md`: the query parameter was
parsed, forwarded, stored and read by nothing for the life of the project).

### D69 · Every look-review frame silently changed location when the boot POI default moved · FIXED
`src/game.js` used to default to `params.get('poi') ?? 'giant-orbit'`; this session it
became `?? START_POI`, which is `'graveyard'` (`src/world/system.js`). That is the right
default for the game — the node table, travel and the HUD all said "The Graveyard" while
the sky said otherwise — but no shot in `tools/shots.json` declared a POI, so every
look-review frame moved with it, to a location `src/world/lighting/pois.js:14-17` authors
as *"no fill worth the name … everything is silhouette, rim light and near-black"*.

Measured: the reframed `wide` shot at the graveyard has **no gas giant at all**
(`world.systems.celestials.parts.giant` is undefined), luma 0.030, contrast 0.021 — one
thousandth above `capture.mjs`'s flat-frame guard, and a shot whose entire subject is
absent. `close`, `three-quarter`, `wide`, `hud-close` and `hud-three-quarter` now carry
`"query": "poi=giant-orbit"`, so they stay comparable to their committed predecessors.
`cinematic`, `engagement` and `hud-engagement` deliberately do not: those are about the
fight, and should show wherever the game actually starts.

### D70 · The `wide` shot asked one control for two opposite things · FIXED
`"Maximum tactical zoom"` and `"the frame that sells the game"` were the same setting.
The pitch floor rises with zoom by design (`ORBIT.pitchFloorMax` 0.95 over
`smoothstep(0.30, 1.00, zoomT)`, `src/camera/constants.js`), so `zoomT = 0.86` forced the
camera to look **58 degrees down** at an empty plane against a 23 degree half-FOV. Measured
before: the gas giant sat at ndc.y **2.21**, 43.2 degrees off axis, with an angular radius
of 39.6 degrees — entirely out of frame; luma 0.009, contrast 0.004, both guards firing.

The tactical camera's feel is untouched. The **shot** now states what it wants in the
units the project uses and solves back through the camera's own accessors, so a retune of
either curve moves the shot's parameters and not its framing:

```js
const zr = t.zoomRange();
t.zoomT = t._zoomTTarget = Math.log(STANDOFF_M / zr.softMin) / Math.log(zr.max / zr.softMin);
t.pitchOffset = t._pitchTarget = ELEVATION_RAD - t.pitchFloor();
```

At `STANDOFF_M = 20000` and `ELEVATION_RAD = 0.20`: giant on screen at ndc `[0, -0.15]`,
3.6 degrees off axis, angular radius 39.6 degrees; cruiser 74 px tall in a 900 px frame;
`npm run capture -- --shots wide` gives **luma 0.052, contrast 0.104, clipped 0.00%,
exit 0**, against 0.009 / 0.004 / both-guards-firing before. The shot also now throws a
named error if it is run at a POI with no gas giant, rather than silently pointing at
nothing.

### D71 · `giant-orbit` and `near-star` are 19.0 degrees apart · OPEN
Not a bug, a measurement, and it contradicts the recon brief. `src/world/lighting/pois.js`
states its own acceptance test as *"a player shown a single still frame can name where
they are — not from a label, from the light"*, and the brief proposed asserting that the
three key directions are at least 30 degrees apart. Measured from
`CELESTIAL_SPECS[*].sunDir`:

| pair | separation |
|---|---|
| giant-orbit vs graveyard | 149.6 deg |
| graveyard vs near-star | 140.6 deg |
| **giant-orbit vs near-star** | **19.0 deg** |

A 30 degree gate would have shipped permanently red, or been quietly moved until it
passed. `tools/poicheck.mjs` therefore gates on a floor that is physical rather than
chosen — two POIs closer than the angular DIAMETER of the larger key disc
(`POI_PALETTES[id].key.angularRadius`, 5.73 deg for near-star) are lit by the same sun —
and prints the 30 degree target as a WARN. Closing this properly means moving a sun
vector in `src/world/celestials/index.js`, which is the Environment stream's file and
changes what two POIs look like. Filed, not fixed.

---

## Wave 2 — the black close frame, and honest surface measurement (W2-E)

Everything below was measured on hardware (`tools/harness.mjs#rasterMode()` returns
`hardware` on darwin, ANGLE/Metal) except where a row says `NP_RASTER=swiftshader`. Every
number names the command that produced it and its sample size.

**How it was measured, because it matters this time.** Other Wave-2 agents were writing to
`src/sim/**` and `src/input/**` while this ran, and a bundle is built from the whole tree.
So every number below was produced in a detached `git worktree` at `30841d1` carrying
**only this stream's five files** on top, with `node_modules` symlinked. A critic
rebuilding it needs exactly that: `git worktree add --detach <dir> <this commit>` and run.

Outstanding requests, all one-liners in other streams' files, collected here so they are
not spread across four sections:

| # | file | change | why |
|---|---|---|---|
| R1 | `src/vfx/engines.js:76` | `float t = vUv.y;` → `float t = clamp(vUv.y, 0.0, 1.0);` | D67. Unblocks `close` and `hud-close`. Verified a no-op on `wide`. **Verify on hardware, not SwiftShader.** |
| R2 | `tools/probe.mjs` | add a `--query` passthrough | the seed-`#` hatch reseeds the world (D-W2E2) |
| R3 | `docs/probes/cruiser.png` | regenerate, `node tools/probe.mjs cruiser` | committed frame is a spin capture, stale ≈3 points of calm |
| R4 | `docs/design/ship-language.md:280` | the `ours` row 49.2/25.7/25.0 is unreproducible by `tools/surface.mjs` | D-W2E3; do not regenerate R3 without also doing this |
| R5 | `docs/design/reference-research-2.md:424` | still cites 78.1/20.3/1.6 as the open D-INT1 number | superseded; see D-INT1 below |
| R6 | `docs/review/widediag-close.png`, `-nocull.png` | delete or regenerate | committed at `30841d1`, i.e. before D-W2E1 — they are **graveyard** frames of a shot pinned to `giant-orbit`. Left untouched here rather than silently overwritten; `docs/review/**` binaries are not this stream's to commit. `node tools/widediag.mjs close` rewrites them correctly. |

### D67 re-verified · The diagnosis was RIGHT. The fix was NEVER LANDED. · STILL OPEN

The question this session was asked to settle was: is `close` still black because the fix
was not landed, because it was landed and is insufficient, or because the diagnosis was
wrong? **The fix was not landed.** `src/vfx/engines.js:76` still reads
`float t = vUv.y;` on HEAD (`30841d1`); the previous stream filed it as a request because
`src/vfx/**` is VFX's file and no Wave-1 or Wave-2 review agent owns it. Nothing was
insufficient and nothing was wrong.

Everything below was re-run from scratch this session in a **detached worktree at
`30841d1` carrying only this stream's five files**, so that no other Wave-2 agent's
in-flight edits could be in the bundle. Nothing here is quoted from a previous session.

**It is not intermittent.** `npm run capture -- --out … --shots close`, five consecutive
invocations, each a fresh `vite build` and a fresh browser:

```
shot close   calls= 135 tris=   72553  luma=0.009 contrast=0.004 clipped=    0%
shot close   calls= 135 tris=   72553  luma=0.009 contrast=0.004 clipped=    0%
shot close   calls= 135 tris=   72553  luma=0.009 contrast=0.004 clipped=    0%
shot close   calls= 135 tris=   72553  luma=0.009 contrast=0.004 clipped=    0%
shot close   calls= 135 tris=   72553  luma=0.009 contrast=0.004 clipped=    0%
```

5 of 5 black, identical to three decimals, exit 1 every time. The Wave-1 D67 note above
records "4 black, 1 through" and calls the defect intermittent; that was measured before
`2232a8e` pinned this shot to `poi=giant-orbit`, so those five runs were not five runs of
the same shot. **The Wave-1 intermittency claim is withdrawn** — see the raster finding
below for what was actually varying.

#### The bisect

`node tools/widediag.mjs close --bisect` — 16 single-variable probes, each applied alone
and reverted, over a 320×180 sample (**57 600 px**) of a 2560×1440 frame:

| probe | luma | contrast | dLuma |
|---|---|---|---|
| *(baseline, HEAD)* | 0.0104 | 0.0128 | — |
| `vfx:ALL` hidden | 0.1690 | 0.2621 | +0.1586 |
| **`vfx:plumes` hidden** | **0.1689** | **0.2622** | **+0.1585** |
| `post:bloom` disabled | 0.1658 | 0.2600 | +0.1554 |
| `post:grade` disabled | 0.0013 | 0.0197 | −0.0091 |
| `post:output` disabled | 0.0022 | 0.0062 | −0.0082 |
| `msaa:samples=0` | 0.1688 | 0.2620 | +0.1584 |
| **`fix:clamp-vUv.y`** | **0.1690** | **0.2621** | **+0.1586** |
| *(baseline again)* | 0.0103 | 0.0127 | −0.0001 (clean, no residue) |

The nine not listed — `vfx:weapons`, `vfx:shields`, `vfx:explosions`, `vfx:damage`,
`vfx:rings`, `vfx:particles`, `post:gtao`, `post:godrays`, `post:smaa` — move the frame
by at most 0.0002, i.e. not at all. The two that make it *darker* are the grade and the
tone-map output, which is what removing a tone mapper does and is not a clue.

That is a causal chain, not a correlation:

- **`vfx:plumes` alone accounts for the entire effect** — 0.1689 against 0.1690 for
  hiding *all* of VFX. Nothing else in the scene contributes anything.
- **`post:bloom` is the vector, not the source.** Disabling it recovers 98% of the
  frame, which is what a separable Gaussian smearing one poisoned texel does.
- **The bad value is not in the CPU data.** `--assert` scans the live prefix of the
  plume instance buffers every run: **2 live instances of 96 capacity, 0 non-finite
  floats** across origin, dir, params and colour. So `engines.pushShip` and the ship
  state it reads are clean and the fault is downstream of them, in the shader.
- **`msaa:samples=0` is the mechanism.** Recovering the frame by dropping the composer
  target's sample count *with the plumes still drawn* is only explicable if the fault is
  a partially covered edge fragment shaded at a pixel centre outside the primitive.
  Non-centroid varying interpolation then extrapolates, `vUv.y` leaves `[0,1]`,
  `pow(t, 0.72)` at `engines.js:82` is NaN for negative `t`, and the
  `if (edge <= 0.0) discard` at `engines.js:84` cannot catch it because every comparison
  against NaN is false.
- **The one-line fix is exactly sufficient.** `float t = clamp(vUv.y, 0.0, 1.0);` patched
  into the live material and recompiled gives 0.1690 / 0.2621 — *the same frame as
  deleting the plume mesh entirely*, which is precisely what a correct clamp should
  produce, and it does it while still drawing the plumes.

The frame is not marginal either way: HEAD is **99.28% near-black**, the clamped frame
**68.26%**, and the hull fills it.

#### THE NEW FINDING, and it is why this survived two waves of review

**D67 does not reproduce under SwiftShader.** Same commit, same shot, same command, one
environment variable:

| raster | `close` HEAD | `close` + runtime clamp | verdict |
|---|---|---|---|
| hardware (ANGLE/Metal) | 0.0104 / 0.0129, 99.28% near-black | 0.1690 / 0.2621 | **FAIL** |
| `NP_RASTER=swiftshader` | **0.1692 / 0.2631**, 68.31% near-black | 0.1693 / 0.2631 | PASS |

`composerSamples` reads **4 under both**, so this is not a difference in what three.js
asks for — it is a difference in what the driver does with a varying at a partially
covered fragment, which GLSL leaves undefined outside the primitive. Consequences, all
of which have already bitten this project:

1. `docs/review/look-surface/close.png` — the frame D-INT1's 78.1/20.3/1.6 was measured
   from — is a **perfectly good frame**: luma 0.1337, contrast 0.2104, 39.95% near-black
   over 921 600 px. It was added by `64590fd` at 1280×720 with the HUD up (that commit's
   `close` shot has neither a `hud` flag nor a `query`) and its own manifest records
   `"fps": 4`, which is SwiftShader. It is not evidence that this shot renders, and the
   fact that it exists is not a contradiction of anything above.
2. **Anyone verifying the fix under SwiftShader will measure no change** and can
   reasonably conclude the change is unnecessary. It must be verified on hardware.
3. This is the honest explanation for the "intermittent" report: not one shot flickering,
   but different agents on different rasterisers.

#### The gate

D67 has now survived two waves as prose — a paragraph in this file, a paragraph in
`tools/shots.json`, a request in a commit message — and prose does not go red. So:

```
node tools/widediag.mjs close --assert          # exit 1
node tools/widediag.mjs wide  --assert          # exit 0
npm run capture -- --shots close                # exit 1
npm run capture -- --shots wide                 # exit 0
```

`--assert` agrees with `npm run capture` exit-for-exit (verified, all four above), and
adds the thing capture cannot say: *which of the three states this defect is in.* It
measures the frame, then applies the clamp to the live material and measures again, and
branches:

- frame renders → **PASS**, plus a WARN that the defect is latent while the line is still
  unclamped on disk, and a louder WARN naming the rasteriser if you are on SwiftShader.
- frame black **and** the clamp recovers it → **FAIL: "D67 IS NOT LANDED"**, and it
  prints the patch.
- frame black **and** the clamp does not → **FAIL: "the diagnosis no longer explains this
  frame"**.
- frame black **and** the line is already clamped on disk → **FAIL: "landed and
  insufficient"**.

A gate that cannot tell those apart is exactly why this defect had to be diagnosed from
scratch twice. Real output, hardware, this tree:

```
ASSERT  shot "close" against tools/capture.mjs's own three guards
  src/vfx/engines.js:76 on disk: UNCLAMPED
  plume instance buffers: 2 live of 96, 0 non-finite floats  -> the bad value is NOT in the CPU data
  HEAD          luma=0.0104 contrast=0.0129 nearBlack=99.28%  [N=57600 px]
  + clamp       luma=0.1690 contrast=0.2621 nearBlack=68.26%  [N=57600 px]
  FAIL  the frame is unusable and ONE LINE FIXES IT. D67 IS NOT LANDED.
        capture guard: FRAME IS FLAT OR EMPTY (contrast 0.0129 < 0.02)
        capture guard: FRAME IS ESSENTIALLY BLACK (99.28% > 97% near-black)
        THE PATCH, src/vfx/engines.js line 76:
          -  float t = vUv.y;
          +  float t = clamp(vUv.y, 0.0, 1.0);
        Not applied here: src/vfx/** is the VFX stream's file. Filed as a request.
```

**The `wide` shot is the control that makes the request safe to accept.** On a frame that
already renders, the clamp measures 0.0520 / 0.1045 with it and 0.0520 / 0.1045 without —
it changes nothing. So the requested line is a no-op everywhere the shader is currently
correct and a total recovery where it is not.

**What was NOT done, deliberately.** `tools/shots.json` could hide `vfx:plumes` in the
`close` setup string and the shot would go green today. Rejected: the plumes are part of
the render, not chrome over it (unlike the HUD, which the shot already suppresses), and
suppressing them would delete the only automated detector this defect has. A check that
measures nothing prints "ok".

**What was done instead.** `node tools/widediag.mjs close --with-fix` writes
`docs/review/widediag-close-clamped.png` — the counterfactual, clamp applied at runtime —
under a deliberately different name, and prints two `!!` lines saying it is not a frame of
this commit. The art review can look at the hull today without anybody being able to file
the result as evidence about HEAD.

**And the art review is less blocked than it was told it is.** `close` is required for the
in-game look questions — silhouette against a lit backdrop, and the `hud-close` occlusion
diff, which cannot be computed at all until this lands. It is **not** required for the
60/30/10 surface verdict: `ship-language.md` §3's method masks a hull on void and its own
"ours" row names `docs/probes/cruiser.png`. That measurement runs today, on the cruiser
probe, and is reported under D-INT1 below.

**Request, restated and now unambiguous** — one line, `src/vfx/engines.js:76`:

```glsl
-  float t = vUv.y;                        // 0 at the bell, 1 at the tail
+  float t = clamp(vUv.y, 0.0, 1.0);       // 0 at the bell, 1 at the tail
```

### D-W2E1 · `tools/widediag.mjs` ignored the shot's own `query`, so every `close` diagnosis was measured at the wrong POI · FIXED

`widediag.mjs:24` called `openGame(...)` with a hard-coded `query: 'capture=1'` while
loading the shot's `setup` string out of `tools/shots.json`. Five of the eight shots —
`close`, `three-quarter`, `wide`, `hud-close`, `hud-three-quarter` — carry
`"query": "poi=giant-orbit"`, and the boot default is `START_POI` (`'graveyard'`). So the
tool posed the camera exactly as the shot asks and then measured it **somewhere else**,
under a different key light, a different palette and a different celestial set.

The evidence was in its own output all along: for a shot that says `poi=giant-orbit` it
printed a lighting block named `poi-key:graveyard`.

Consequence for the record: the "key is FRONTAL, `dot = +0.978`" line quoted in D67, in
`tools/shots.json` and in the Wave-2 briefing is a **graveyard** number. Re-measured on
this tree at the graveyard the graveyard key is `−0.864`, i.e. the *shadow* side — the
+0.978 predates the `pois.js` sun-direction fix in `2232a8e`, which moved all three keys.
At the shot's real POI the framing conclusions still hold (player dead centre at ndc
`[0,0]`, 1203 m, 0 of 47 meshes culled, `cruiser:lod1`/`lod2` hidden), so nothing built on
them collapses — but they were true by luck, not by measurement.

Fixed by passing `(shot.query ? shot.query + '&' : '') + 'capture=1'`. The tool now also
prints the POI the shot asked for beside the POI the key light says it got, and flags a
mismatch, so this cannot recur silently.

Two further gaps in the same tool, both closed:

- **It measured no pixels.** It reported framing, culling, lighting and LOD — everything
  except whether the frame was bright — while being the designated instrument for "why is
  this frame black". It now measures the canvas with the same luminance weights and the
  same two thresholds `tools/capture.mjs` gates on, and prints the sample size.
- **It could not isolate a cause.** `--bisect` was added: one variable at a time, reverted
  between probes, with the baseline re-measured at the end and a `PROBES LEFT RESIDUE`
  warning if the sequence did not return to where it started.

### D-W2E2 · The cruiser probe's evidence frame had a frame-rate-dependent pose · FIXED

`src/probes/cruiser.js` declared the default `orbit` view with `spin: true`, and
`update()` advances `pose.yaw` by `dt * 0.10` every rendered frame. `tools/probe.mjs`
screenshots after a fixed **count** of frames (`--frames`, default 90), not after a fixed
amount of time. So the pose in the committed PNG is `0.95 + 0.10 × (wall-clock seconds
those 90 frames took)`:

| raster | 90 frames | yaw at screenshot |
|---|---|---|
| hardware, ~60 fps | 1.5 s | 1.10 rad |
| SwiftShader review container, ~5 fps | 18 s | 2.75 rad |

That is 94 degrees. `docs/probes/cruiser.png` is the image `ship-language.md:280` names in
its own "ours" row — the project's entire surface-frequency number is quoted off it — so
the reference measurement was framed differently on every machine and at every frame rate.

Measured consequence, `node tools/surface.mjs --frame ship`, 1600×900, hardware raster.
The spin-on rows were produced by checking `src/probes/cruiser.js` back out at `30841d1`
in the verification worktree and re-rendering, so both halves are real renders of this
tree and neither is quoted from an earlier session:

| | calm | medium | dense | tiles | run-to-run range |
|---|---|---|---|---|---|
| spin running (n=5) | 44.1–44.6 | 45.5–46.6 | 9.1–9.9 | 505–509 | 0.5 / 1.1 / 0.8 |
| spin off (n=4) | 47.0–47.6 | 44.0–44.6 | 8.0–8.6 | 498–501 | 0.6 / 0.6 / 0.6 |

**Be careful what that shows: the obvious reading is wrong, and an earlier draft of this
entry had it wrong.** The run-to-run *spread* is barely different — 0.5 of calm with the
spin on, 0.6 with it off. The defect is the **≈3-point systematic offset in calm** between
the two, produced by nothing but ≈0.15 rad of unintended yaw on a machine that happened to
be fast; and that offset is a function of frame rate, so on the SwiftShader review
container it is not 0.15 rad but ≈1.8, and not three points but unbounded. The argument is
*the subject depends on the GPU*, not *the variance is larger*.

The committed `docs/probes/cruiser.png` reads **44.3 / 47.3 / 8.4** — inside the spin-on
distribution and outside the spin-off one. It is a spin capture, and it is stale.

Fixed: `orbit` is now `spin: false`, like every other view. The spin is one query
parameter away — `probe.html?p=cruiser&spin=1` — for looking at the hull live.

**A trap in the CLI route, found while checking that and worth its own line.**
`tools/probe.mjs` forwards only `--seed`, so from the command line the escape hatch is the
seed-`#` fallback at `src/probes/cruiser.js:120`: `--seed 'probe:cruiser#spin=1'`. But
`src/probe.js:40` hands that whole string to `new World({ seed })` and `src/core/rng.js:19`
hashes it entire, so **any use of the `#` hatch reseeds the world.** Measured:
`--seed 'probe:cruiser#spin=0'` renders 47.8 / 42.8 / 9.4 against the default seed's
47.0 / 44.6 / 8.4 on the identical view — medium moves 1.8 points, three times the
0.6-point same-seed noise floor. It is a different ship. Use it to look, never to measure
against §3. The real fix is a `--query` passthrough in `tools/probe.mjs`, which is
integration's file — requested, not made.

**Request:** `docs/probes/cruiser.png` still holds a spin-pose capture and is stale by
about three points of calm. Regenerating it is `node tools/probe.mjs cruiser --out
docs/probes/cruiser.png`, but `docs/probes/**` is not in this stream's write set. Whoever
regenerates it must also correct `ship-language.md:280` — see D-W2E3 before doing so.

### D-W2E3 · `tools/surface.mjs` and `ship-language.md` §3 are not the same operator, and §3's six reference rows can never be re-measured · OPEN (measured, not fixable here)

Commit `1e6c5e2` is the commit that wrote §3's reference table AND the
`docs/probes/cruiser.png` its "ours" row was measured from. Running today's tool on that
exact blob:

```
git show 1e6c5e2:docs/probes/cruiser.png > /tmp/c.png
node tools/surface.mjs --frame ship /tmp/c.png
```

| | calm | medium | dense |
|---|---|---|---|
| §3's table, "ours" row | 49.2% | 25.7% | 25.0% |
| `tools/surface.mjs`, same blob | **73.4%** | **26.3%** | **0.3%** |
| difference | **+24.2** | **+0.6** | **−24.7** |

The two agree on **medium to 0.6 points** and disagree on both tails by 25. That is the
signature of a gradient operator with a different scale: §3's produced values large enough
to push a quarter of the hull past the 0.14 "dense" threshold where this one leaves them
under 0.045. Resolution is not the explanation — the same probe rendered natively at
900 px wide and downsampled from 1600 px differ by about one point (46.0/45.7/8.3 vs
44.9/45.3/9.9), not twenty-five.

**Which operator is right cannot be settled, and never will be.** §3's six reference rows
were measured off Star Citizen and Homeworld renders which are not in this repository and
cannot be put in it — `ARCHITECTURE.md:22`, *"No image files."* The band this tool gates
on is therefore built from six permanently unreproducible measurements.

What was done about it, without moving the gate:

- The gate stays exactly where it was. It is red on HEAD and honestly red.
- The disagreement is printed as a **PROVENANCE** block on every `--frame ship` run, so a
  calm or dense number can no longer be quoted against §3's table without it.
- `node tools/surface.mjs --calibrate` was added, which gives the thresholds a meaning
  that needs no reference image. It runs the tool's exact operator over nine synthetic
  targets whose response is derived analytically — flat field, sine gratings at four
  periods on both axes, square waves — and **fails** if the operator misses a prediction.
  It currently matches all nine to four decimal places.

Two things fell out of that calibration and both are worth having:

1. **A tile's value IS its mean per-pixel luma slope.** `calm < 0.045` means the surface
   changes by under 4.5% of the value range per pixel; `dense > 0.14` means over 14%. At
   §3's stated 900 px across a 1400 m hull (1.56 m/px) a dense tile averages a 14% value
   change every metre and a half of hull.
2. **The dense tier is not reachable by a gradient at all.** A sustained 0.14 luma/px
   slope exhausts the whole `[0,1]` range in seven pixels, so no 8×8 tile of an LDR image
   can contain one — the first version of the sweep tried sustained ramps and every one of
   them clipped flat, which is how this was found. Dense can only be reached by
   *oscillation*: measured, a 4 px full-amplitude sine and an 8 px square wave both clear
   it, a 16 px sine does not. §3's dense budget is a budget on alternation at the scale of
   a few metres of hull. It is not a budget on how steeply a surface shades.

### D-W2E4 · `tools/surface.mjs` would happily compute a frequency split from a black frame · FIXED

Nothing stopped `--frame ship` being pointed at an unrenderable PNG. On a near-black frame
the `luma > 0.055` mask picks up the noise floor, clears the 120-tile sample-size floor
easily, and returns a confident split — which would have been reported as art direction.
Given that `close` has been rendering at luma 0.0104 / contrast 0.0128 for two waves, this
was one regenerated PNG away from happening.

The tool now computes whole-frame statistics *before* masking and refuses, with a non-zero
exit, any image that trips `tools/capture.mjs`'s own two guards (contrast < 0.02, or
> 97% near-black). Same two numbers as `capture.mjs`, deliberately, so the two agree by
construction. It also now prints, per image, the source resolution, the resolution the
frequency pass actually ran at and the resample ratio; and when more than one image is
given, the spread across them — because the usual reason to pass several is to ask whether
a one-point movement is real.

### D-INT1 · Surface direction · **CLOSED ON DIRECTION: the hull is too MEDIUM, not too calm**

The Wave-1 correction was right and survives a harder look. Restating it with this
session's numbers and with the confidence each column actually carries:

| framing | image | mask | tiles | calm | medium | dense |
|---|---|---|---|---|---|---|
| `ship` | cruiser probe, 4 fresh renders, hardware | 7.9% | 498–501 | 47.0–47.6 | **44.0–44.6** | 8.0–8.6 |
| `scene` | `docs/review/look-surface/close.png` | 29.9% | 1781 | 78.1 | 20.3 | 1.6 |
| `face` | the same frame, `--crop 0.30,0.39,0.62,0.50` | 90.5% | 2111 | 97.2 | 2.8 | 0.0 |
| — | §3 six-reference envelope | | | 51.3–79.8 | **10.1–39.0** | 6.8–22.1 |
| — | §3's authored rule | | | ≥ 60 | **≤ 28** | ≤ 12 |

**The honest measurement for the 60/30/10 target is the `ship` framing, and within it the
`medium` column.** Four reasons, in order of strength:

1. **Framing.** §3's method masks a hull, and its own "ours" row names a probe render.
   `look-surface/close.png` is a game frame whose mask is 29.9% of the picture and
   contains lit asteroids and nebula. D-INT1's original 78.1/20.3/1.6 is a correct
   application of the method to the wrong subject, and it pointed at the wrong tier.
2. **Medium is the column that survives the operator disagreement.** It is the only one of
   the three where this tool and §3's table agree on the one image both have measured
   (26.3 vs 25.7, D-W2E3). Calm and dense are 25 points apart between the two operators
   and cannot carry a verdict against that table at all.
3. **It clears its own noise floor more than eight times over.** Medium reads 44.0–44.6
   over four renders — a spread of 0.6 points — against a reference ceiling of 39.0 and
   §3's own authored ceiling of 28. The exceedance is 5.0 to 16.6 points.
4. **The `scene` row is not even a frame of this codebase.** `look-surface/close.png` was
   captured by `64590fd` at 1280×720, HUD up, on SwiftShader (`"fps": 4` in its own
   manifest). The same shot on HEAD renders black on hardware — see the raster finding in
   the D67 entry above. A row that cannot be regenerated cannot be a verdict, and the
   `close` shot going green will not regenerate it either: it will produce a *different*
   frame, at 1600×900, HUD suppressed, pinned to `giant-orbit`.

`docs/design/reference-research-2.md:424` still quotes the old 78.1/20.3/1.6 as the open
D-INT1 number, and `ship-language.md:280` still carries the 49.2/25.7/25.0 row that
D-W2E3 shows this tool cannot reproduce. Both are outside this stream's write set and are
filed as requests.

**What this does NOT license.** "Too medium" means there is nothing for the detail to be
detail against — §3's own description of the `cruiser-modules.png` failure. The remedy is
*calmer* large faces, not more of anything. `ARCHITECTURE.md:24-26` and FLAG 5 stand:
there are 11 triangles of headroom and adding surface noise is forbidden. Nothing in this
stream added any.
