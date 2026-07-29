# Acceptance criteria — status

Every item from §9 of the brief, with an honest state. `UNVERIFIED` means it was not
measured, not that it failed. Nothing here is marked PASS on the strength of intent.

Last updated: after the fleet-and-modules measurement pass (pass 8).

---

## Performance

| Criterion | State | Evidence |
|---|---|---|
| 60 fps at 1440p on an Apple laptop | **UNVERIFIED** | No GPU in this environment. See below. |
| 1% lows above 50 fps | **UNVERIFIED** | Same. |
| Benchmark scene: 200+ debris, 12 combat ships, 1 capital, full post chain | **PASS** | `src/probes/benchmark.js`: 930 instanced objects, 12 combat ships actively engaging, 1 fully-fitted capital, full post chain. |
| Draw calls under a committed ceiling, measured and reported | **FAIL** | Committed 320, measured **499** in the benchmark scene (`docs/review/benchmark.json`, the machine-written record). Reported as a miss with diagnosis in `docs/review/benchmark.md`. The assembled game at boot framing measures **119** (`npm run smoke`). This row previously said 650 and 143; both were earlier runs copied forward, and 650 also disagreed with line 101 of this same file. `benchmark.md` still carries the stale figures and disagrees with `benchmark.json` beside it on resolution, frame count and mesh count too — the `.md` was written from a different run than the `.json`. Trust the `.json`. |

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
| Every module identifiable from silhouette alone at max tactical zoom | **PASS** | Measured, not argued. `src/art/geometry/modules/audit.mjs` fits every module of a mount to a real 1400 m cruiser, bins the fitted outline over the union of the envelopes, and holds all **46 same-mount pairs** to one and three pixels at the 30 px read (mean ≥ 46.7 m over the bins the two modules touch, peak ≥ 140 m). It printed **four failures** on its first honest run — see D29 — and every one is now closed by structure: the PD ring's stalks went 44 → 150 m and splayed outboard, the missile raft went wide and flat, the rail battery's turret and rails rose 16–20 m, and the cannon bank was slung *below* the mount plane with echeloned guns and its reach cut from 486 to 290 m against the beam array's 548. Worst pair is now `port_cannon_bank / port_beam_array` at mean 95 peak 149. The audit exits non-zero on a regression, so this cannot quietly rot back. Caveat kept: this measures the OUTLINE, which is what the criterion is about; it does not measure whether a player can *name* the module. |
| Three loadouts of the same cruiser distinguishable in silhouette | **PASS** | `docs/probes/loadouts.png` prints **PASS**: A/B mean 84.2 max 313, A/C mean 89.3 max 358, B/C mean 78.5 max 441. Worst pair mean **78.5 against a target of 45**, worst max **313 against 120**. Closed exactly as the previous entry predicted — by making the ventral, engine and broadside modules much larger and much more cantilevered, and by separating the three ventral fits on three axes at once (cargo pods shallow/wide/long at −300 m; hangar deck deep/narrow/short at −540 m; field dock mid/widest/longest at −390 m). No two share a row, so the bottom of the ship names the build before a panel line resolves. |
| Every faction ship class distinguishable from every other | **PASS** | Also measured now. `src/art/geometry/ships/audit.mjs` compares all **78 pairs** of the thirteen classes with both hulls NORMALISED TO 200 m, so the metric is about shape and not about size — a fleet of thirteen identical shapes at thirteen sizes would fail it — against the same one- and three-pixel targets at the 30 px read (6.7 m mean, 20 m peak at that length). `probes/ships.js` prints the five closest pairs at the foot of both silhouette sheets, so the picture carries its own audit. The measurement immediately named the PARTIAL this row used to carry: the **Whipcord** was the closest class to two others (7.1 m from the Concord strike craft, 7.5 m from the Meridian, floor 6.7) because a twin-boom is a razor edge-on. Fixed in the hull lines — 32° of wing dihedral, booms riding the knuckle 4.6 m above the nacelle, canted fins and a 7.4 m keel blade — for 12.6 → 22.3 m of height on a 95 m hull with the plan-view tail hole untouched. Worst pair is now 8.8 m, **every pair separated**. Ardent vs Bulwark and the Peregrine's crest, from the previous pass, both hold at 9.4 m and above. **Round-one blind review passed this row and still found "Concord fails class-vs-class distinguishability — four sizes of the same swept arrowhead", and both were true**: the fleet-wide gate is one pixel, which is the floor for "not literally the same shape", not for "tellable apart in a fleet". A Coalition hull beside a Concord one is separated by design philosophy before it is separated by outline; two hulls of the SAME navy share hue, material, plate language and surface treatment, so the outline carries the whole load alone. The audit now also reports **intra-faction** pairs at a raised bar — 1.5 px mean and 6 px peak, 10.0 m and 40.0 m at the 200 m reference — and gates on it. It named two pairs on its first run: Coalition `monitor / destroyer` at 9.4 and Concord `corvette / frigate` at 8.9. Both are closed by structure rather than by size: the Sledge's gun house went 44 → 56 m tall with its director mast moved off the after deck onto the barbette, so the after half is the bare skeleton the class was always described as and the tallest thing on the ship sits over the gun (9.4 → 10.2); the Meridian grew a **single** auxiliary nacelle on a cantilevered pylon, starboard only, which cannot be got by scaling a corvette and makes it the one bilaterally unequal hull in either navy (8.9 → 11.2). All twenty intra-faction pairs now pass. |

## Lighting

| Criterion | State | Evidence |
|---|---|---|
| Single consistent key direction per POI across every object | **PASS** | The key is solved, not guessed, and now against the right TARGET. The 0.55–0.62 band the previous pass hit was itself wrong — it left the top two stops of the curve unused, which is what round-one review measured (hull mask p25 0.226 → p95 0.481, against SC Stanton 0.28 → 0.744). `giant-orbit` key 6.8 → **14.0**, fill/bounce/rim unchanged, so key-to-fill went 17:1 → 35:1. Measured on `docs/review/look-surface/close.png` with `tools/surface.mjs --crop`: the bridge tower's key-facing face reads **median 0.669, p95 0.749**, inside the 0.72–0.80 target; the 45° deck plate reads 0.612; whole hull mask p05 0.168. Three values, and the split is now visible because it is out of the compressive toe. |
| Shadowed regions retain readable value separation without ambient wash | **PASS** | The shadow side is held by the rim, which is directional, and no ambient term was raised with the key — that is the distinction the criterion turns on. **Cast shadows are live and were live before**, which two passes of screenshot argument got wrong in both directions: `tools/shadowcheck.mjs` diffs the close shot against the same frame with `key.castShadow = false` and measured **5.3% of lit pixels changing at a mean delta of 51/255**. They did not READ because 5.3% coverage on a hull whose lit deck measured 0.36 is a small absolute step. With the key doubled and the shadow box tightened 1750 → 1200 m (texel 1.71 → 1.17 m, normal offset 2.31 → 1.58 m) the bridge tower now lays a visible hard shadow across the deck in the shipped frame. |
| No object lit from a direction contradicting the POI key | **PARTIAL** | The blown-out case that caused this is fixed. The critic's separate `cinematic.png` finding — a flaring star at frame-right while the ship's left flank is brightest — has not been re-verified since; the `cinematic` shot was not in this pass's capture set. |

These were the highest-priority failures. Both of the ones that could be settled with a
measurement now are, and the tools that settle them are committed
(`tools/surface.mjs`, `tools/shadowcheck.mjs`) so neither can quietly rot back.

## Scale

| Criterion | State | Evidence |
|---|---|---|
| Cruiser reads as kilometres long in a wide shot | **UNVERIFIED** | The wide capture timed out under software rasterisation before it rendered. Needs a clean capture run. |
| At least three independent scale cues in any wide frame | **PARTIAL** | Built and present: running lights at a single game-wide 40 m spacing — **which was not true until this pass**: the faction fleet was wearing them at 6 m while the cruiser wore them at 40, so the one cue whose whole job is to be a ruler was lying by a factor of 6.5 about every enemy in the frame (D28) — parallax debris at multiple altitudes, celestial bodies at true angular size, atmospheric perspective. Not yet confirmed in a rendered wide frame. |
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
| No surface exceeds the established detail density | **PARTIAL** | Was FAIL, and the FAIL was right twice over: the plate generator was a recursive subdivision producing bevelled blocks in running bond (round-one blind review: "ashlar masonry"), and the non-tiling macro layer that was supposed to break the repeat **was losing three of its four channels to premultiplied alpha** and had never worked (D35). Both are fixed. The generator is now strakes and butts (`textures/panelLines.js`), and measured on `docs/probes/hullmaps.png` the calm armour tier is a **93.6 m tile, 15.0 repeats over 1400 m, a 93.6 × 31.2 m plate** — against §7's "largest plate module ≥ 55 m, ≤ 26 repeats" and against the 16–35 m courses and 40–90 repeats round one measured. The three tiers are 93.6 / 29.9 / 13.0 m, a 7.2 : 1 spread. Still PARTIAL, and honestly: what is verified is the MAP and one close frame. The whole-hull calm/medium/dense split in §3's own units has not been re-measured across a full shot set, and the 180 m structural rhythm is still a value band rather than the geometry §3 asks for (D45). |
| The refit screen updates the 3D model live with no visible hitch | **UNVERIFIED** | Refit install/uninstall rebuilds the model synchronously in the same call, but this has not been measured for hitch under a real bake. |

---

## Summary

| | count |
|---|---|
| PASS | 9 |
| PARTIAL | 3 |
| FAIL | 1 |
| UNVERIFIED | 6 |

Nineteen rows. This table previously read 5 PARTIAL and 4 UNVERIFIED, which counted to
19 but matched no actual row set — the body has always had three PARTIALs (rows 46, 57,
73) and six UNVERIFIEDs (14, 15, 56, 58, 72, 74). PASS counts the one split verdict,
"PASS (design), UNVERIFIED (hands)" at row 66, as a pass. The wrong split had been
copied outward into other documents, which is why it is worth stating how it is counted
rather than just fixing the numbers.

The two that moved this pass are both in Lighting, and they moved for the same reason
the Silhouette pair did before them: they stopped being opinions. Both were sitting at
PARTIAL carrying claims — "a fully lit face is calibrated", "cast shadows are still not
visible on hulls" — that no tool had ever checked, and one of them was simply **false**.
`tools/shadowcheck.mjs` diffs a frame against itself with `castShadow` off and found
shadows had been live all along at 5.3% of lit pixels; the problem was that the frame's
lit deck sat at sRGB 0.36, so a shadow on it was a small absolute step.

The pattern is now three for three. Every criterion in this document that has moved off
PARTIAL moved because someone wrote forty lines of tool instead of another paragraph, and
in every case the tool disagreed with the prose on its first run.

One outright failure remains:

1. **Draw calls: 499 against a committed 320.** Not mysterious. The counters say where
   they go and `docs/review/benchmark.md` ranks three fixes, all of them geometry-side
   merges. One measurement worth adding before that work starts, raised by the surface
   pass: the count includes **GTAO's depth-normal prepass, which is a second full render
   of the scene**, so a meaningful fraction of the 499 is one scene counted twice. That
   should be measured (`--quality medium` disables GTAO) before anyone re-merges a hull
   to chase it.

   **Still unmeasured.** `npm run bench -- --quality medium` was attempted twice on this
   commit and killed by its timeout both times — the review environment has no GPU and
   the benchmark scene at 2560×1440 through SwiftShader takes longer than any budget
   worth holding a session open for. It is a fast run on a machine with a GPU. Until
   someone does it, nobody knows how much of the 499 is one scene counted twice, and the
   three geometry merges are being ranked against a number that may be substantially
   inflated.

### An honest overall statement

The blind side-by-side against real Homeworld and Star Citizen frames was run twice by an
independent critic with no build context, and it chose the reference every time. Its
second reading located the surface gap mechanically rather than aesthetically — a
subdivision generator that cannot produce directional plating, a value curve using its
bottom two thirds, and marks placed by a random number generator that had no idea where
the hull's features were. All three are now closed against measurements rather than
against argument, and the measurement tools are committed.

What is NOT claimed: the frames have not been re-scored blind against the references
since. Two of the round-two findings are still open by design and are geometry's to
close — the 180 m frame rhythm wants to be a real proud ring rather than a value band,
and the forebody's diamond shading is a vertex-normal problem in the loft. And the
whole-hull calm/medium/dense split in §3's own units has been measured on two frames,
not on a full shot set.
