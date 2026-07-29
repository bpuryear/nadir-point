# Stream reports

One report per work stream: what was built, what is weak, what is unresolved. A report
claiming no weaknesses is a report that failed to look, so every stream was required to
list at least three, and every stream did.

These are the streams' own words, condensed. Where a stream's self-assessment
disagreed with what the independent visual critic saw, the critic's finding is noted.

---

## 1. Foundation and engine — *integration*

**Built.** Fixed-step 60 Hz simulation with 0/1/2/4× time controls plus a transit-only
compression band to 64×, decoupled from render-rate systems so capital-ship momentum is
frame-rate independent and a seed reproduces. Two-scene renderer: celestials render into
a far scene with their own camera, depth is cleared, gameplay renders on top in real
metres. Post chain: GTAO → screen-space volumetrics → HDR bloom → ACES → LDR grade with
per-POI lift/gain, chromatic aberration, grain, ordered dither, vignette → SMAA. Seeded
RNG with labelled forks. Content registries with import-time validation. Object pools and
shared scratch vectors.

**Weak.** The two-scene split means anything needing to occlude between the scenes
cannot; a celestial cannot pass in front of a ship. `installFallbackLighting` exists so a
partial build is never a black screen, but it is a trap — it looks like a lighting design
and is not, and the critic initially suspected it of causing the blown-out hulls.

**Unresolved.** Draw-call ceiling is committed at 320 but was chosen analytically, not
from profiling on target hardware.

---

## 2. Controls, camera and travel research

**Built.** `docs/design/controls.md`, ~1300 lines against ~50 cited sources. Full binding
table, exact camera model, and a decision on the brief's open question: **Plot-and-Burn** —
one continuous coordinate space, no map screen, no teleport. The strategic view is a
screen-space overlay reached by continuing the same zoom gesture with the 3D scene still
live behind it. Travel is a physical burn with weapons offline, six-fold sensor
signature, propellant cost and interception rolls.

**Weak, in its own words.** *"Every feel number in section 6 is untested by hand."* It
predicted `accelRetro = 4.0` (45 s to stop) would be the first value reverted — and the
implemented figure is 9.9 s, so that prediction was correct. *"Section 5.5.1's Tactical
View is the least-proven part of the document… I never prototyped it."* The binding table
is dense enough that collisions are likely once more screens land.

**Unresolved.** No gamepad or accessibility pass. `Space` = pause breaks 25 years of
Homeworld muscle memory and is flagged as the binding most likely to be overruled.

---

## 3. Materials, procedural texture and palette

**Built.** Four locked faction palettes and six POI palettes with an explicit colour
index and provenance-recording derivation. Every map generated at runtime from a seed:
recursive BSP panel plating with seam gaps, chamfers and rivets; greeble relief; a
three-layer weathering model; composable scorch stamps; a font-free 5×7 block glyph set
driving hull codes and hazard striping; constant-spacing running lights. Memoised
registry with `damageable()` and `applyScorch()` for runtime battle damage.

Two physical corrections drove most of the result: **painted hull is a dielectric**
(metalness ~0.1–0.3, not 0.8), and **metal albedo is bright because albedo is F0
reflectance**. Before those, every faction collapsed to the same dark sludge.

**Weak, in its own words.** *"Tiling repeat is the biggest unsolved visual problem"* — a
~17 m plate tile repeats ~75× along a 1400 m cruiser. *"`registry.get('damaged')` bakes
its blasts into a TILING texture, so the damage repeats across the whole hull."* Seam
shading is baked into albedo because three's `aoMap` only affects indirect light, so
under a hard key it contributes almost nothing — meaning seams will read as painted-on
lines under a grazing key. Texture memory is unmeasured and probably too high.

**Critic disagreed harder.** The independent review called the surface *"cinderblock
masonry or bathroom tile rather than ship plating"* and identified the real problem as
absence of a **frequency hierarchy**: Homeworld's hulls are roughly 60% calm, 30% medium,
10% dense, plus hand-placed asymmetric marks. Ours is 100% medium everywhere.

### Round two — the masonry was structural, and one fix had never worked

A second blind comparison scored this stream 3/10 and named the mechanism precisely:
*"bevelled rectangular blocks in running bond at the SAME block scale on every part."*
It was right, and it was not a tuning problem. Three properties of the recursive-BSP
generator made that outcome unavoidable: a BSP has **no preferred direction**, so the
field is isotropic where real plating is strongly directional; every leaf **bevelled up
from groove height on all four sides**, which is a highlight ring around every block
under any key; and recursion **concentrates leaves at one size**, so the calm reserve
§3 demands could not exist. `textures/panelLines.js` is rewritten around **strakes and
butts** — continuous fore-aft seams, subordinate butt joints phase-offset per strake,
flush joints with the groove stated in metres (0.26 m), and relief from weld beads,
plate lips and fastener rows along strake seams only.

**The find that mattered most was not visible at all.** The macro layer — the
non-tiling object-space map that closed D4 and carries the value drift, the soot and
the marks — packed four channels into a `CanvasTexture`. A 2D canvas backing store is
**premultiplied**, and alpha is 0 over ~99% of that atlas because marks are sparse by
design. Measured in the browser the game runs in: writing `RGB(200,150,100)` at `A=0`
reads back `RGB(0,0,0)`. Three of the four channels had been multiplied by zero since
the day they were written, so D4 was closed on a mechanism that could not have been
working, and round two's *"no macro value drift survives the mip drop"* was literally
true — there was none to survive. The atlas is a `DataTexture` now.

**Everything is measured, and three tools were built to measure it.** `tools/maps.mjs`
draws the generated maps at 1:1 with a metre ruler without booting the game;
`tools/surface.mjs` reports the §3/§4 statistics on a hull mask; `tools/shadowcheck.mjs`
answers "does the ship self-shadow" by diffing the frame against itself with
`castShadow` off. That last one settled a question two passes had argued from
screenshots — shadows were **live all along** (5.3% of lit pixels, mean delta 51/255);
they did not READ because the frame's lit deck sat at sRGB 0.36.

**Still weak, in its own words.** The 180 m structural rhythm is a value band in the
macro layer, which survives mips but cannot cast a shadow — §3 wants geometry and the
geometry stream has to build it. The macro layer's mark anchors are the PLAYER
CRUISER's, and one atlas serves a whole faction, so a 480 m destroyer picks up bay-rail
stripes at stations where its own structure is something else; the honest fix needs the
geometry stream to publish per-class feature stations. Texture memory still has no
per-distance reduction and no cap (D8), and the macro atlas is a debit against it.
`tools/surface.mjs`'s anisotropy statistic is dominated by silhouette rather than
surface over a whole frame and is only trustworthy on a crop — that limitation is
written into the tool because the first reading of it was nearly quoted as evidence.

**Two of this pass's own mistakes, recorded because they are instructive.** Raising the
key exposed that Concord's hull albedo was 78% reflectance and clipped to white the
moment the light was correct (D48) — caught by the material chart, which is what a
material chart is for. And the five non-hero POI keys were first *scaled* by
giant-orbit's factor rather than solved, which got four of the five wrong by 20–30%,
because two keys of different COLOUR do not deliver the same irradiance at the same
intensity. Both were found by running the numbers a second time rather than by looking
at the frame, which is the same lesson as everything above.

---

## 4. Cruiser hull, hardpoints and modules

**Built.** 1400 m hull, LOD0 **1980 triangles against a 2000 ceiling** in 14 draws, LOD1
820/12, LOD2 148/1. Six hardpoints with a documented attachment convention: modules are
authored in ship space with their origin at the mount, so module authors never do
rotation maths. Port modules are mirrored onto starboard by rebuilding geometry with
reversed winding and conjugating node transforms — *not* by negative scale, which would
invert winding and render mirrored modules hollow including in the shadow map. 24 modules
across six mounts.

**Verified.** Three loadouts distinguishable in silhouette alone, measured as outline
divergence per z-bin: A/B 25.8 m, A/C 29.0 m, B/C 22.3 m.

**Weak, in its own words.** LOD2 does not hold together up close — proxy blocks read as
detached slabs. The dorsal structure and ventral cradle are identifiable only in the side
silhouette, not the top-down. `engine_armour_belt` *"reads as 'the stern is slightly
bigger' and nothing more."* `port_flak_cluster` merges into an amorphous lump when a
barrel is occluded. *"The hull surface reads as a brick wall at hero distance."*

---

## 5. Faction ships and the ancient derelict

**Built.** Nine registered classes. Coalition (Lancet 95 m, Ardent 210 m, Bulwark 480 m)
rectilinear with slab armour and external structure; Concord (Whipcord, Meridian,
Peregrine) swept, blade-like, machinery hidden; strike craft under 150 triangles; the
3400 m ancient hulk with a deliberately non-human structural language.

**Weak, in its own words.** Coalition frigate vs destroyer is *"still the weakest pair on
the sheet"* — they separate on a 26 m waist notch that is ~13 px at review scale. The
Concord destroyer *"reads as a smear rather than a shape."* Strike craft share planforms
with their own faction's larger hulls. The ancient hulk's value range is narrow — *"the
'mid-grey mush' the brief warns about."*

---

## 6. Environment, celestials and POI lighting

**Built.** Banded gas giant with a ring system casting a shadow across the disc, correct
terminator and limb scattering; starfield with a real magnitude distribution; layered
nebula; instanced asteroid and debris fields occupying vertical volume above and below
the combat plane. Per-POI rigs with procedural PMREM IBL and post overrides. Three
registered POIs.

**This is the strongest asset in the project.** The independent critic, comparing blind
against Homeworld frames: *"the gas giant's banding, terminator and ring shadow are
genuinely good, better-observed than the reference's nebula… That is the one asset in
this project already at the bar."*

**Weak, in its own words.** An unresolved rendering artefact at `near-star` — a "ladder"
of lit slabs in a specific band of camera poses, worked around by avoiding the pose,
which made that POI *"under-dramatic"* as a result. *"The nebula's parallax is largely
fictional."* The gas giant albedo is built synchronously on the main thread — roughly ten
million lattice samples at POI build.

---

## 7. Simulation: motion, combat, power, salvage, refit — *integration*

**Built.** Assisted-flight capital ship model where turn rate degrades with the square of
speed. Measured: **14.9 s for 180° from rest, 9.9 s to shed cruise speed.** Arcs anchored
to where a weapon physically sits on the hull. Projectiles in flat typed arrays with
swept sphere tests so fast slugs cannot tunnel. Power routing that spools rather than
switching instantly. Salvage where reactor kills cap integrity at 15%. Module loss only
through hardpoint breach, with a warning event at 35%.

**Weak.** Feel numbers were tuned analytically and by simulation, never by hand. Collision
response is a shove with almost no restitution, which is right for capitals and probably
wrong for strike craft. The AI uses `bearingReport()` to manoeuvre for arcs but does not
plan multi-ship crossfire.

**Unresolved.** No hand-play validation of any of it.

---

## 8. VFX

**Built.** A 4096-slot GPU particle system in one draw call, whose vertex shader
integrates exponential drag in closed form from spawn parameters so the CPU writes each
particle exactly once. Velocity-stretched tracers read straight from the combat system's
typed arrays; beam ribbons with a separate industrial grammar for salvage cutting; engine
plumes driven by throttle and engine-subsystem health; shield ripples that exist only at
the instant of a hit; a two-grammar explosion sequencer where a reactor kill is visibly
distinct from a hull kill. Everything animates from `simTime`, so it pauses and
time-scales with the simulation.

**Weak, in its own words.** *"Every intensity is hand-calibrated against the post chain's
CURRENT constants… If the lighting & post stream retunes bloom, all of this is mis-scaled
and there is no automated guard, only the probe screenshot."* That risk is now real: the
key intensity was subsequently changed by a factor of three.

---

## 9. World simulation and AI

**Built.** Two factions fighting on their own schedule whether or not the player is
present. Verified in the probe: **41 battles fought and resolved across 92 simulated
minutes, 71 hulks left awaiting salvage**, POI control and patrol heat evolving, a front
line that moves between visits. Plot-and-Burn travel with course plotting, propellant,
interception rolls against patrol heat, and the time-scale band swap.

**Weak.** Abstract battle resolution and live battle resolution are different code paths
and can disagree. Reputation moves but its consequences are shallow.

---

## 10. UI and HUD

**Built.** HUD with per-hardpoint structure bars and a visible breach threshold; tactical
overlay with projected firing arcs and a subsystem ring that greys out what cannot be
engaged; power panel showing both requested and actual spooling allocation; refit screen
with live 3D.

**Weak.** Panel text is low contrast against bright backdrops and the power panel's
hatched treatment costs legibility. Panels overlap the ship at some framings.

---

## 11. Audio

**Built.** Entirely synthesised at runtime — no sample files. Master bus with limiter,
per-category buses, distance attenuation, proximity-driven low-pass. Capital-ship engine
bed at 30–60 Hz, per-type weapon voices, a reactor detonation distinct from a hull kill,
industrial cutting grind, per-POI ambience. Degrades silently with no audio device.

**Weak.** Nobody has heard it. It was verified structurally and by rendering
`OfflineAudioContext` buffers to waveform plots, which proves a capital-ship explosion
has sub-bass energy and a long tail but says nothing about whether it sounds good.

---

## 12. Performance

**Built.** Instancing throughout; GPU particles; three LODs on major hulls; object
pooling; a committed benchmark scene; budget enforcement in `tools/bench.mjs`.

**Weak.** Texture memory is unmeasured. Synchronous procedural bakes cost hundreds of
milliseconds at POI build with no time-slicing.

**Unresolved and stated plainly.** Frame rate has not been measured and is not claimed.
The environment has no GPU.
