# Sensors, terrain, contacts and probes

**Status: built.** Evidence: `node src/world/sensorHarness.js`. Every number quoted in
this document came out of that harness, not out of a spreadsheet.

This is the world-participation wave that `closest-comparables.md` §3.2, §3.3, §3.4 and
Part Five Product 5 asked for. Four things landed:

1. **Terrain changes sensor numbers.** `src/world/system.js#TERRAIN`.
2. **Contacts resolve gradually.** `src/world/discovery.js`, one float per contact.
3. **Deployable probes, and the enemy-probe dilemma.** Same file, plus a `recon_probe`
   item registered into the existing item registry.
4. **Wreck contents are biased by the codex.** `src/sim/salvage.js#pickByCodex`.

And one thing was *checked and not built*, which is reported in §6.

---

## 1. Terrain

`src/world/celestials/` and `src/world/fields/` are roughly 2,600 lines of finished,
lit, tuned art. Before this wave not one line of it changed a gameplay number. Now every
POI declares a terrain, and terrain declares three multipliers on an open-space baseline
of 1:

| | signature | sensor | clutter | reach |
|---|---|---|---|---|
| open | 1.00 | 1.00 | 0.00 | — |
| belt | 0.62 | 0.55 | 0.55 | 150 km |
| nebula (dust/ice) | 0.45 | 0.50 | 0.70 | 165 km |
| gas giant | 0.35 | 0.72 | 0.40 | 210 km |
| corona | 0.40 | 0.30 | 0.85 | 190 km |
| debris field | 0.75 | 0.68 | 0.80 | 140 km |
| **anchorage** | **1.35** | **1.15** | 0.10 | 60 km |

- **signature** — what you look like to somebody else. Feeds
  `discovery.signatureMultiplier`, which feeds `travel._rollRisk`.
- **sensor** — how far your own sensors reach here.
- **clutter** — how much the place slows *identification*. Clutter does not stop you
  detecting a return, it stops you classifying one.

Terrain is assigned from POI `kind` by default and overridden per POI where the authored
blurb demands it. The Saltpan ("ice and salt dust") and The Lattice ("reads as structure
on a bad sensor") are both `nebula` rather than `belt`, because both blurbs describe a
classification failure rather than a rock field.

**The four fingerprints are deliberately different**, which is what stops this being one
slider with seven labels:

- **Gas giant** — the best mask in the game *and* you can still see out (0.35 / 0.72).
  The ambush spot.
- **Corona** — hides and blinds equally (0.40 / 0.30, clutter 0.85). Nobody finds anybody
  at Perihelion. The harness confirms it: a POI 32 km away in a corona never resolves at
  all, at any sensor setting.
- **Belt / nebula** — hide well, see poorly, confuse classification. The escape route.
- **Debris** — barely hides you (0.75) and wrecks identification (0.80). A graveyard is
  the worst place in the system to work out what just arrived, which is exactly what The
  Graveyard should feel like.
- **Anchorage** — the inversion, and the important one. The places that will service your
  ship are the places you are *most visible*, and they see furthest. Docking is exposure.

Falloff is smoothstepped from the POI's 26 km arrival boundary out to `reach`, and
overlapping influences take the **strongest**, not the sum, so two masks can never stack
into a corridor nobody can be seen in.

### Measured

Per-minute interception probability while under transit burn, same drive, same war,
different ground (harness §4):

```
POI                       TERRAIN        HEAT    SIG  OLD %/min  NEW %/min
near-star                 corona        0.263    2.4        7.9       3.16
giant-orbit               gasgiant       0.39    2.1       11.7       4.09
saltpan                   nebula        0.307    2.7       9.22       4.15
...
meridian-gate             anchorage     0.306    8.1       9.18      12.39
graveyard                 debris        0.614    4.5      18.41      13.81
hollow-anchor             anchorage     0.451    8.1      13.53      18.27
```

A **5.8x spread** between the safest and the most dangerous ground in the system, where
before there was a 2.3x spread driven entirely by patrol heat. `OLD %` is the same war
state run through the pre-wave formula, so the column is a like-for-like control.

Whole courses shift less because most of a 500 km leg is open space — `graveyard ->
saltpan` goes 24.7% → 19.6% — and `plot()` now publishes `mask`, `maskedFraction` and
`terrain` per leg so the overlay can show *why*.

---

## 2. Gradual contact resolution

One float, 0..1, per contact. Four bands:

| resolution | tier | what the player gets |
|---|---|---|
| < 0.15 | — | nothing |
| 0.15–0.45 | `signature` | bearing, rough range, **estimated tonnage with an error band** |
| 0.45–0.80 | `classified` | kind ("UNIDENTIFIED STATION"), tighter band, closer fix |
| ≥ 0.80 | `resolved` | name, plottable, written to the codex |

Gain per second is `rate x closeness^1.5 x pipFactor x clarity`, where `closeness` is
against the terrain-modified sensor reach, `pipFactor` runs 0.55x (0 pips) to 1.45x
(6 pips), and `clarity` is `1 - clutter` floored at 0.15.

Resolution **never regresses** — same monotonicity rule as the codex's discovery states,
for the same reason: that is what makes it progression rather than a cache of what is on
screen. What does go stale is the position fix, and `describeContacts()` publishes
`staleSeconds` honestly.

The survey sweep no longer creates a binary blip. It grants a lump of resolution weighted
by off-axis angle and by range, so **a second sweep on the same bearing is worth
running** — which it never was before.

### Measured

One contact at 30 km, three sensor pips, sampled as it sharpens (harness §2):

```
t s     RESOLUTION  TIER        LABEL                     MASS t    +/-  POS ERR km
0                0  (undetected)
20           0.608  classified  UNIDENTIFIED STATION        2300    350         5.8
40           0.821  resolved    Hollow Anchor               2500    100         1.2
```

Time to a name, by terrain, at fixed offsets:

```
TARGET          TERRAIN      OFFSET km  SIG @s  CLASS @s  NAMED @s
hollow-anchor   anchorage           28       4        12        21
hollow-anchor   anchorage           36      15        45        79
marrow-shoal    belt                32     129       385       683
deepwell        debris              32     105       314       558
near-star       corona              28     230       690        --
near-star       corona              32      --        --        --
```

---

## 3. The SENSORS power channel

The research verified that this channel had **zero combat effect**: it bought a slightly
larger passive-contact circle and a permission check on the sweep. A quarter of the
marquee power system was strictly dominated.

It now decides how fast an unknown hull becomes a hull you can name. `DiscoverySystem`
tracks **hull contacts** on the same resolution curve. Below `classified` a hostile is a
tonnage estimate with an error band; at `classified` its class enters the codex as
`seen`; at `resolved` the class is `scanned` and every module bolted to it is marked
`seen` — which is exactly the state the wreck generator biases toward.

### Measured

A hostile destroyer at 9 km (harness §3):

```
SENSORS  PIPS  SEEN @s  SCANNED @s  READOUT AT t=20 s                  SUBSYS?  CODEX
0.08        1       --          --  MASS SIGNATURE ~12550t +/-4900     NO       seen
0.25        3       46          82  MASS SIGNATURE ~11800t +/-3700     NO       scanned
0.48        6       17          30  UNIDENTIFIED DESTROYER ~10400t     NO       scanned
```

On the `assault` preset the hull is **never** classified — you fight a mass signature.
On `scan` you have it named in half a minute, with the codex filled and the subsystem
readout unlocked. That is a real cost paid in weapons and shields for a real capability.

**A UI must honour `showSubsystems`.** Drawing the subsystem ring on an unresolved hull
would give the sensors channel its effect back and then hand it out for free.

---

## 4. Probes

A probe is a sensor you **spend**. 1800 m/s for 360 s with a 110 km reach: one probe
covers roughly one neighbouring POI on the authored 166–546 km map, and no more. Two
modes:

- **passive** — 45% gain, silent. Nothing knows it is there.
- **active** — 100% gain, and it pulses, which raises patrol heat **around the probe**,
  not around you. An active probe is a sensor and a lure in the same object.

### The enemy-probe dilemma

A faction with heat on your position spends a probe of its own (capped at one at a time).
While it holds a fix, your signature is **x1.70** — every transit quote you are given
goes up, and `sensorProfile().watched` names the modifier rather than hiding it.

You may kill it, but you have to close to rail range (9.5 km) to do it:

- **+** it was recording. Everything it had seen sharpens by +0.50 resolution.
- **−** patrol heat +0.09 at every POI within survey range: it stopped reporting, and they
  know exactly where.
- **−** −3 standing with its owner.

Or leave it, and stay loud, and it expires on its own in up to 420 s. There is no right
answer, which is the test.

### Measured

Deepwell is 524 km from the start POI; the hull's own reach there is 9.5 km, so passive
contact will never touch it (harness §5):

```
PROBE       RESOLUTION @360s  TIER          CONTACTS  TARGET HEAT   DELTA
none                       0  none                 0        0.722       0
passive                 0.81  resolved             1        0.722       0
active                 0.817  resolved             1        0.818   0.096
```

`DELTA` is heat against the no-probe control. The active probe bought +0.007 resolution
and +0.096 patrol heat at the place it was looking at — which is a bad trade here and a
good one when you *want* the patrol to go and look at an empty stretch of space.

The dilemma, both horns priced in one run:

```
  a concord probe, 120 km reach, 208 s of life left
  LEAVE IT : signature 0.750 -> 1.275 (x1.70) for as long as it lives
  KILL IT  : destroyed; 2 contacts sharpened (the-lattice 0.280 -> 0.780);
             heat +0.090 across 1 POIs; concord standing 0 -> -3
  and you have to close on it: {"ok":false,"reason":"OUT OF REACH — 300 km, need 10 km"}
```

---

## 5. Codex-biased salvage

`Wreck._buildSections` picked a module for each weapon/reactor/sensor section with
`rng.pick(candidates)` — uniform, uncurated. That is variance without curation: you can
never aim at a specific thing, so no destination is ever a reason to go anywhere.

The fix is a weighting, not a system:

| codex state | weight |
|---|---|
| unknown | 6.0 |
| seen | 3.5 |
| scanned | 2.0 |
| salvaged | 1.0 |
| installed | 0.6 |

Weights never reach zero. A world that only ever hands you novelties is as unbelievable
as one that never does.

### Measured

400 destroyers, two battery sections each, with an empty codex versus a codex where two
of the six candidate modules are already `installed` (harness §6):

```
MODULE                        EMPTY CODEX      %  2 OWNED      %    OWNED?
bow_breaching_prow                    141   17.6       16    2.0    INSTALLED
bow_torpedo_tubes                     133   16.6       15    1.9    INSTALLED
dorsal_missile_cells                  148   18.5      195   24.4
dorsal_rail_battery                   126   15.8      187   23.4
port_broadside_battery                127   15.9      174   21.8
port_cannon_bank                      125   15.6      213   26.6

share of drops that were one of the two owned modules:
  34.3% with an empty codex -> 3.9% once installed   (uniform would be 33.3% in both)
```

The empty-codex column lands on uniform, because every entry is equally unknown. Once you
own two of them the world stops offering them and starts offering the four you do not
have. **That is FTL's shop, expressed as an enemy fleet.**

---

## 6. Per-section damage attribution — checked, already landed, NOT duplicated

The brief asked whether section survival is still decided by a die roll at death, and to
make the outcome read from damage attribution if that had landed.

**It has landed** (commit `6a945f6`, "Fix the salvage die roll"). `Ship._buildSections`
creates one section per subsystem plus three runs of plating; `Ship._attributeDamage`
degrades the section nearest each hit with a 22% splash into neighbours;
`Wreck._buildSections` reads `ship.sections.get(sub.def.id).condition` directly. There is
no `rng` call anywhere in the section-condition path. **Nothing was duplicated.** The
harness verifies it end to end (§7):

```
SECTION                 SURGICAL    BRAWL  REACTOR
Main Drive                     0        1     0.15
Port Battery                   1        0     0.15
Starboard Battery              1        0     0.15
Reactor                        1    0.862     0.15
FORE PLATING                   1    0.283     0.15

salvageIntegrity           0.869    0.499    0.082
installable modules            3        1        0
materials total              249      147       40
```

Three ways of killing the same hull, three different piles of salvage. If those columns
were identical the outcome would still be a roll; they are not.

---

## 7. The four-question test — `scope-decision.md`

Each of the four systems, answered separately. A system that cannot answer all four does
not get built.

### 7.1 Terrain affects sensors

**What decision does this create?** Where to sit and which way to plot. Loitering in the
gas giant's shadow costs you 28% of your sensor reach and buys you a 2.9x cut in
signature; loitering at Meridian Gate gains you 15% reach and costs you 1.35x signature.
Plotting a course now has a *shape* argument as well as a *length* argument, and the
plotter prices it before you commit (`leg.mask`, `leg.maskedFraction`, `leg.terrain`).
Measured spread across the system: 5.8x in per-minute interception probability.

**What does it interlock with?** Four systems, none of them new: `travel._rollRisk` (the
interception roll and the quote drawn on the course), `discovery` (sensor reach and
resolution rate), the SENSORS power channel (terrain clutter is what makes pips matter),
and the existing celestial and field art, which is now load-bearing rather than
decorative. It also interlocks *against* the sortie stream's anchorages by design: the
places that service you are the places that see you.

**What does it abstract?** Everything volumetric. There is no ray-cast through a nebula
mesh, no per-asteroid occlusion, no line-of-sight test against a moon, and no heat
plume. Terrain is a scalar field sampled from POI centres with a smoothstep falloff, and
overlapping influences take the strongest rather than integrating. That is the right line
because the decision the player makes is "which place do I do this in", at a scale of
tens of kilometres, and a volumetric model would cost an order of magnitude more code to
answer the same question with the same granularity. It also means terrain is identical
whether or not the POI's geometry is currently loaded, which a ray-cast model could never
promise.

**Can the player see it?** `discovery.sensorProfile()` returns the terrain id, its name,
its weight, both multipliers, the clutter, and the resulting reach in km — every modifier
with its cause named. `plot()` returns `mask` and `terrain` per leg. **UI is required and
not yet built**: see §8.

### 7.2 Gradual contact resolution

**What decision does this create?** Whether to keep looking. Before, a contact was either
free or unobtainable and there was nothing to spend on it. Now sitting still and watching
is a tactic with a measured payoff curve (0 → classified in 20 s at 30 km, → named at
40 s), routing power to sensors is a purchase, and re-sweeping the same bearing is worth
doing. It also creates the decision *not* to commit: an unresolved 12,550 t ±4,900 t
signature is a thing you can choose to avoid on the strength of an error bar.

**What does it interlock with?** The power system (pips scale the rate), terrain (clutter
scales it down), travel (only `resolved` POIs are plottable destinations, so the map
opens through this gate), the codex (hull contacts write `seen` and `scanned`), and
salvage via the codex (§5). The survey sweep and the intel channel both feed the same
float instead of a separate table.

**What does it abstract?** Sensor physics. There is no radar cross-section, no emission
spectrum, no aspect angle, no signal-to-noise. There is also no *false* contact — clutter
slows identification but never invents a return, because a fog-of-war system that lies to
the player has to be balanced against player trust, and that is a much larger design
problem than this wave can carry. And resolution never decays: the position fix goes
stale and says so, but knowledge does not evaporate, matching the codex's own rule.

**Can the player see it?** `describeContacts()` and `describeShipContacts()` return
`tier`, `label`, `resolution`, `mass`, `massError`, `positionErrorKm`, `staleSeconds` and
`showSubsystems`. The error bars are fixed per contact rather than re-rolled, so they do
not shimmer and cannot be averaged away by a patient player. **UI required.**

### 7.3 Probes

**What decision does this create?** Three, stacked. (1) Spend a probe or keep the
electronics for repairs — probes are deliberately electronics-heavy, and electronics is
the pool the refinery is worst at producing. (2) Passive or active — silence versus speed,
where active also pulls patrols toward the probe rather than toward you, which is
sometimes exactly what you want. (3) The enemy probe: kill it for intel and be found, or
leave it and be watched at x1.70 signature until it expires. All three are live at the
same time and none dominates.

**What does it interlock with?** The item registry and the materials economy (it
fabricates from the same four pools as repair and ammunition), the faction war (`bumpHeat`
and `adjustReputation`), travel risk (the watched multiplier goes straight into the
interception roll), and discovery itself (a probe is a second resolution origin with its
own terrain).

**What does it abstract?** The probe is not a physics body. It does not collide, cannot be
shot down by anything except the player's explicit `destroyProbe` verb, has no geometry,
and flies a straight line at constant speed. Enemy probes are capped at one at a time —
two stacked watchers would be an unreadable modifier pile and the decision they exist to
create is binary anyway. There is no probe-versus-probe interaction.

**Can the player see it?** `describeProbes()` returns position, owner, faction, mode,
remaining life, reach, `hasFix`, contact count, range to the player and `killable`.
`sensorProfile().watched` names the modifier. **UI and a marker are required**; there is
currently no way for a player to see a probe at all, which makes this the least finished
of the four. See §8.

### 7.4 Codex-biased salvage

**What decision does this create?** Where to go and what to shoot. The codex was already
a want list in principle; it is now one in fact, because an entry at `unknown` is
something the world will reliably put in front of you. A destroyer sighted at a POI is a
specific reason to go there, and resolving it first (§3) tells you what it is carrying.

**What does it interlock with?** The codex's five discovery states, the sensors channel
(which is now the main way entries advance from `unknown`), the hull perk gates that read
codex counts, and salvage integrity — the module the world offers you is worth nothing if
you popped the reactor.

**What does it abstract?** Hull loadout persistence. A ship's modules are still chosen at
death rather than at spawn, so you cannot scan a live hull and read off the exact fitting
you are about to cut off it; the roll is biased, not pre-committed. Fixing that means
generating and storing a fit per AI hull at spawn, which is a bigger change than 20 lines
and touches the AI roster, which this stream does not own. **Reported, not built.**

**Can the player see it?** Partly, and this is the weakest of the four answers. The bias
is visible *statistically* — the codex fills with things you do not own — but no screen
says "unknown entries are six times as likely". A codex UI that sorts by discovery state
makes the want list legible without ever quoting a weight, and `src/ui/codex.js` appeared
in the tree during this wave, so that is likely already in hand.

---

## 8. What UI this needs, and what wiring

This stream owns no files under `src/ui/**`, `src/render/**` or `src/vfx/**`, and
`src/game.js` is integration's. Everything below is **data and a read API that exists and
is not yet drawn.**

**Read APIs, all live now:**

| call | returns |
|---|---|
| `discovery.sensorProfile()` | pips, base reach, terrain-modified reach, terrain block, signature, sweeping, watched, probe count, contact counts |
| `discovery.describeContacts()` | one row per detected POI: `tier`, `label`, `resolution`, `bearing`, `rangeKm`, `mass`, `massError`, `positionErrorKm`, `x`, `z`, `kind`, `plottable`, `staleSeconds` |
| `discovery.describeShipContacts()` | one row per hull contact: `resolution`, `tier`, `label`, `mass`, `massError`, `showSubsystems` |
| `discovery.describeProbes()` | one row per probe: `owner`, `faction`, `mode`, `x`, `z`, `remaining`, `reachKm`, `hasFix`, `contacts`, `rangeKm`, `killable` |
| `system.terrainAt(x, z)` | terrain at any world point, for a map overlay tint |
| `travel.plot(...).legs[i]` | now carries `mask`, `maskedFraction`, `terrain`, `emission` |

**Verbs a UI needs to expose:**

- `discovery.deployProbe({ bearing, mode })` — or, better, `items.use('recon_probe',
  { bearing, mode })`, which spends a fabricated charge.
- `discovery.destroyProbe(probeOrId)` — returns `{ok, reason}`; the reason is written to
  be printed verbatim.

**Two hard requirements on whoever draws this:**

1. **Never print a contact's name below `tier === 'resolved'`.** The whole system is the
   withholding.
2. **Never draw the subsystem ring on a hull whose row says `showSubsystems: false`.**

**No `game.js` wiring is needed.** `DiscoverySystem` is already installed by
`installWorldSim`, and the `recon_probe` item registers itself when `world/discovery.js`
is imported, which `world/index.js` already does. Nothing new has to be added to
`import.meta.glob`.

---

## 9. Not built, and why

- **Persistence (`src/core/persistence.js`).** Listed in this stream's file fence but not
  in its build list, and `MEV.SAVED` / `MEV.LOADED` appeared in `sim/meta/events.js`
  mid-wave, so another stream has it. Not touched.
- **Per-hull pre-committed loadouts** (see §7.4) — needs the AI roster, which is out of
  fence.
- **False contacts from clutter** (see §7.2) — a trust problem, not a code problem.
- **Balance caveat, stated rather than hidden.** Five of the seven terrains have a
  signature multiplier below 1, so the *average* interception risk across the system has
  gone down, not up: `graveyard -> saltpan` is 24.7% → 19.6%. Open space is unchanged at
  1.00 and most of a 500 km leg is open space, so the softening is about 20% at leg level
  and much larger if you deliberately loiter. If that reads as too generous in play the
  cheapest correction is to raise the open-space baseline in `TRANSIT.heatK` rather than
  to compress the terrain table, because the table's *spread* is the thing doing the
  design work and compressing it would take the decision back out.
- **Terrain effects on the *AI's* sensors.** Terrain currently modifies the player's
  detection and the player's exposure. The AI has no sensor entity to modify —
  `closest-comparables.md` §8.4 already logs that asymmetry ("no enemy sensor entity
  exists; nothing hunts a contact it acquired"), and the enemy probe is the first thing in
  the codebase that even partially closes it. Making the AI's own acquisition terrain-aware
  is a real follow-up and it belongs with whoever owns `sim/ai/`.
