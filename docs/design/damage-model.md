# Visible damage — the layer model, the progression, and what it costs

**Status:** specification. Nothing here is committed code. Nothing in this pass edits `src/`
or `tools/`.
**Audience:** Combat, Materials, VFX, UI, Geometry, Performance.
**Binding constraints:** `docs/design/scope-decision.md` (crew and officers are OUT — every
crewed mechanic below is translated to a non-crew mechanism and the translation is named),
`ARCHITECTURE.md` non-negotiables 4–6, and the committed draw ceiling of 320 in
`src/core/units.js#BUDGET`, which the benchmark currently **FAILS at 499**.

**Primary evidence:** `docs/design/reference-ui-language.md` §5, §8, §9 — a first-hand
transcription of two Beta Decay frames. Those frames are the only access anyone here has to
the reference, and every claim below that starts "the reference shows" comes from that file,
not from marketing copy.

**The one-paragraph version.** Three layers is not depth; three layers that are *repaired by
three different economies, cover three different geometries, and fail in three different
ways* is. Shield is powered, omnidirectional, free to restore and competes with your guns for
reactor. Armour is per-facing, ablative, costs materials and mass, and is the only thing
standing between a hit and the module bolted to that mount. Hull is the fail state and should
never be a build. On the model, the whole thing is driven by **one extra RGBA texture per
damaged ship, addressed in object space by the function the hull shader already has**, which
is what Star Citizen and Homeworld 3 both do and is the only approach that costs zero draw
calls. Heat is the fourth resource; its model landed in `src/sim/heat.js` mid-pass, so §7 has
been rewritten to specify only the three things that file is missing — the routing clamp on
overheat, the glow on the hull, and the HUD block.

---

## 0. What the reference actually shows, restated as requirements

From `reference-ui-language.md` §5 and §9, read off real frames:

| Observed | Requirement it creates |
|---|---|
| `0.0 HP/s` as a standalone readout | Every layer carries a **signed rate**, not just a bar. §2. |
| a bar with `100% / 500` | Percentage **and** absolute, on the same line. Percentage for triage, absolute for arithmetic. |
| `NO ARMOR 0%` | Armour is a **named layer with its own percentage** and it is legible when absent. §1. |
| a shield figure `1,250` | Shield is a separate pool with its own scale. |
| `STATUS NOMINAL` → `STATUS OVERHEATED` | Heat is a **two-word state machine**, not a gradient. §7. |
| `EXT 87.8 / 94.4` + a large vertical orange bar | Heat is current-over-capacity, and its bar is the only vertical element in frame. §7. |
| rates `0.12/s` and `2.4%/s` | Rates are a *first-class widget*, used in more than one place. §2. |

Two of these are things we do not have at all (armour, heat) and two are things we have as
bars with no rate (hull, shield). That is the gap this document closes.

---

## 1. The layer model

### 1.1 What we have today

`src/sim/ship.js#applyDamage` is two layers and a straight subtraction:

```js
if (this.shields.current > 0) { /* absorb, emit SHIELD_IMPACT, maybe return */ }
// ... aimed subsystem, hardpoint structure ...
this.hullHP -= remaining;
```

`shields.max` starts at **0** and is only non-zero if an installed module grants
`shieldCapacity` (`src/sim/refit.js#_applyModuleEffects`). So the shipping default is
*one* layer. Hardpoint `structureHP` is a third pool but it is per-mount and is not presented
as a layer.

### 1.2 The decision: add ARMOUR, as a per-facing ablative layer

**Yes, add it — but not as a third bar.** Add it as the layer that is *spatial*, because
spatial is what this game already is. Our combat model is bearings and arcs; our silhouette
audit measures outline divergence; our hardpoints are six named places on a hull. A single
armour pool would throw all of that away and give us EVE's number with none of EVE's
consequences.

**Armour is six pools, one per hardpoint facing:**

| facing | axis | macro-atlas region (`textures/macro.js`) |
|---|---|---|
| bow | +Z | 4 |
| engine | −Z | 5 |
| port | −X | 1 |
| starboard | +X | 0 |
| dorsal | +Y | 2 |
| ventral | −Y | 3 |

That mapping is not a convenience. It means **the armour percentage the player reads in the
HUD is literally the region of the ship they are looking at**, and §3's damage atlas uses the
same six-region addressing. The number and the picture are the same object. Make this a hard
rule at the contract level so nothing drifts.

### 1.3 The three layers, and why each is a different decision

| | **SHIELD** | **ARMOUR** | **HULL** |
|---|---|---|---|
| geometry | omnidirectional, one pool | **six facings** | whole ship, one pool |
| source | an installed module (`grants.shieldCapacity`) | the hull itself, upgraded by armour modules | the hull itself |
| restored by | **reactor power**, automatically, in seconds, for free | **materials + time**, and only when not under fire | materials + time, and only partially in the field |
| restored in combat? | yes, that is its whole point | **no** | no |
| protects the hardpoint's module? | yes | **yes, and it is the only thing that does once shields are down** | no — hull damage is downstream of the module already being at risk |
| does anything besides absorb? | no | **yes — mitigates the damage that gets through** (§1.4) | no |
| its price | a permanent share of the reactor, taken from weapons and engines; and it **generates heat** (§7) | **mass** → turn rate → you cannot get the arc | none, until you have none |
| how the enemy beats it | alpha strike faster than regen | sustained fire on **one facing** | — |
| failure mode | goes to zero, comes back | **gone until you pay**, and the mitigation goes with it | the ship |

**The decision each one creates, stated in the form scope-decision.md §4 demands:**

- **Shield** creates the *live routing* decision. Every point of shield regen is a point not
  in the guns, paid through a widget with a 3-second spool, so it must be committed early.
  This is the decision `sim/power.js` was built for and currently only half-earns, because
  today nothing else competes for the same output on a clock.
- **Armour** creates the *facing* decision, which is the decision this game is best at.
  Presenting your intact starboard belt while your port belt is stripped means turning 1.4 km
  of ship, which `physics.js` has already tuned to cost 14.9 s for 180° from rest. It also
  creates the *refit* decision: armour has mass, `ModuleDef.mass` is declared and never read
  (`fun-systems.md` §5.4), and this gives it a job. A heavy belt buys you a flank and costs
  you the ability to bring the other one round.
- **Hull** creates the *withdraw* decision, and nothing else. Following EVE, where hull
  tanking is a niche used for buying time and for bait rather than for surviving
  ([EVE forums](https://forums.eveonline.com/t/hull-tanking/492008)), hull should be
  **almost un-buildable**. There is no hull-tank build. Hull is a clock that tells you how
  many seconds you have to make a decision you should have made already.

### 1.4 What makes armour not-a-bar: mitigation and the cliff

Armour does two things at once, and the second one is the reason it is interesting.

```
incoming D on facing f
  ├─ if shield.current > 0        → shield absorbs (existing path)
  ├─ else if armour[f] > 0        → mitigated = D × (1 − M(f))
  │                                  armour[f] −= D × A          (ablation)
  │                                  pass `mitigated` on to subsystem / hardpoint / hull
  └─ else                         → pass D on at full value
```

with mitigation scaling with how much armour is left:

```
M(f) = mitigationMax × sqrt(armour[f] / armourMax[f])      // mitigationMax ≈ 0.45
```

The `sqrt` is the point. A facing at 25% armour still mitigates 22%, so armour degrades
*gracefully* until it is nearly gone and then falls off a cliff. That produces the shape every
good defence layer has: it is worth repairing early and it is a panic when it goes. A linear
term makes armour indistinguishable from HP; a step makes it a switch.

**And the cliff is visible**, which is the whole reason this document exists. `M(f)` is the
same number that drives §3's ablation channel on the atlas. When the mitigation is gone, the
plating is gone, and the player can see it on the hull before the number tells them.

### 1.5 Weapon type × layer — the cheap version of resistances, and the abstraction line

EVE differentiates layers with a 4 damage types × 3 layers resistance matrix, plus per-hull
natural profiles (shields weak to EM, armour weak to explosive), plus hardeners, plus stacking
penalties ([EVE University: Tanking](https://wiki.eveuniversity.org/Tanking),
[Natural resistances](https://wiki.eveuniversity.org/Natural_resistances)). That matrix is
load-bearing in EVE because EVE has a market where you buy the hardener for the damage type
you expect.

**We must not copy it.** We have 24 modules across 6 mounts held apart by a silhouette audit,
no market, and a refit screen that has to stay readable. A resist matrix would multiply the
comparison space and buy nothing the player can act on.

The in-scope version is **one row per weapon type, three numbers**, using `WEAPON_TYPES`
which already exists in `core/contracts.js`:

| type | vs SHIELD | vs ARMOUR | vs what is behind it |
|---|---|---|---|
| `beam`, `lance` | **×1.4** | ×0.6 | high `subsystemAccuracy` — the salvager's weapon |
| `cannon`, `rail` | ×0.7 | **×1.3** | ablates hard; punches through to subsystems |
| `missile`, `flak` | ×1.0 | ×1.0 | **×1.4 once that facing's armour is at 0** |
| `pd` | — | — | munitions only |
| `mining` | ×0 | ×0.2 | cutting only |

Twelve numbers total. It produces an actual plan — *beams to strip the field, cannons to open
the belt, missiles into the hole* — and it makes a mixed loadout mean something, which is
exactly what our six-mount refit wants. It also gives the reactor-versus-attrition decision
(`fun-systems.md` §2, "the best thing in the design") a second axis without touching it.

**Explicitly not simulated, and why:**

- **No damage types as a separate dimension.** The multiplier is on the weapon type, which the
  player already knows from the silhouette. Adding EM/thermal/kinetic/explosive on top would be
  a second taxonomy over the same objects.
- **No resistance modules, no hardeners, no stacking penalties.** There is no market to buy
  them in, and `scope-decision.md` forbids one.
- **No hull resistances at all.** Hull is the fail state; making it tunable makes it a build.
- **No armour angling / effective-thickness by impact angle.** Nebulous models penetration
  through an interior density in cm-of-armour-per-metre
  ([Nebulous wiki: Armor](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Armor)); that
  is right for a game where you drive one ship and read a penetration table, and wrong for one
  where you are also running a faction war and a salvage economy. We take the *facing*, which
  is the part the player can act on, and drop the *angle*, which they cannot.

That line is Beta Decay's own rule applied: model the parameter the player would ask about,
and stop (`beta-decay-systems.md` §3.6).

### 1.6 Repair, per layer

| layer | restored by | in combat | cost | time |
|---|---|---|---|---|
| shield | `power.factor('shields')` × `shields.regen` | **yes** | reactor share + heat | continuous |
| armour | repair job at the bay | **no** | `ceil(missing × 0.8)` alloy + `ceil(missing × 0.25)` composite | 20 s per 25% of a facing |
| hull | repair job | **no** | `ceil(missing × 0.5)` alloy (the existing `repairHull` rate) | 45 s per 10% |
| hull **strain** (§5.3) | yard job only | no | ×4 everything | 4 min |
| hardpoint structure | existing `repairHardpoint` | no | existing | 30 s |

`sim/refit.js#repairHull` and `#repairHardpoint` currently charge materials and take **zero
time**, which `fun-systems.md` §5.10 correctly calls out as removing the only triage decision
in the game. Every row above has a time cost, and time is what makes repairing at a hostile POI
a decision rather than a formality.

---

## 2. Rates, not just bars

The reference puts `0.0 HP/s` on the hull block and `0.12/s` and `2.4%/s` on the thermal block.
Take it literally and take it everywhere.

### 2.1 The readouts

```
HULL      68%  3,410 / 5,000       −24.6 HP/s     2:19
ARMOUR    P 41%   S 96%   B 88%   D 100%   V 74%   E 12%
          PORT      820 / 2,000    −31.2 HP/s      26 s
SHIELD    54%  675 / 1,250         +18.4 HP/s     ⟳ 3.1 s
THERM     61.2 / 100.0             +2.4 %/s       STATUS NOMINAL
```

- **Signed, always.** The sign is the readout. `+` on shield means you are winning the repair
  race; `−` means you are not. A bar cannot express that at all.
- **Net, not gross.** Shield shows `regen − incoming`, not `regen`. Gross regen is a stat;
  net regen is the answer to the only question being asked.
- **Armour shows six percentages on one line and the rate only for the facing under fire.**
  Six rates is noise; one rate plus the identity of the facing being chewed is information.
  Highlight that facing's letter in the accent.
- **A derived time.** `2:19`, `26 s`, `⟳ 3.1 s` (time to full shield). The rate is the honest
  quantity; the time is the one the player acts on. Show both — the reference shows both
  (`100% / 500`) and it is the same discipline.

### 2.2 Why a rate carries more decision weight than a bar

Four reasons, and the third is the one specific to us:

1. **Every combat decision is about the future.** Break off, commit, brace, re-route, cut the
   last section — all of them are bets on where the bars will be in ten seconds. A bar is one
   integration step behind the decision the player is making. The rate is the derivative they
   are actually reading off the bar's motion, badly, by eye.
2. **It makes an active defence rateable.** EVE rates an active tank in *damage per second
   negated*, which is the only way to answer "can I hold this" — a booster with 500 HP per
   cycle means nothing until you divide by the cycle
   ([EVE University: Tanking](https://wiki.eveuniversity.org/Tanking)). Our shield regen has
   exactly this shape and we currently print neither number.
3. **It is the only readout that responds to the power widget at the moment the player uses
   it.** `PowerPlant.spoolRate = 0.34` means a full swing takes ~3 s. Over those 3 s the shield
   *bar* will not visibly move — regen is small against capacity — so today the marquee system
   produces no feedback for three seconds after an input. **The rate moves on the first frame.**
   `scope-decision.md` §4 asks "can the player see it?"; for power routing, today, the honest
   answer is *not for three seconds*, and the rate is the fix.
4. **It survives being small.** A 1400 m cruiser at 3% hull loss moves a 10-segment bar by
   nothing. `−24.6 HP/s` is legible at any magnitude, which matters for a persistent hull that
   spends most of its life at partial damage.

### 2.3 Implementation note that will otherwise be got wrong

Rates must be an **exponential moving average with τ = 0.6 s**, sampled in `fixedUpdate` and
read by the render systems. A raw per-step delta on a burst weapon (`shotsPerBurst`,
`burstInterval`) flickers between 0 and a large number at 60 Hz and is unreadable — it will look
broken and be reported as a bug. Damp it once, in one place, and let the HUD read the damped
value. Do **not** damp in the UI: the HUD runs per-frame and the simulation runs fixed-step, and
`ARCHITECTURE.md` forbids reading render `dt` inside simulation logic. The damping belongs on
the sim side.

---

## 3. Visible progression on the model

### 3.1 The implementation decision, first, because everything else follows from it

**One extra RGBA texture per damaged ship, addressed in object space, sampled by the hull
shader that is already patched.**

This is what the references do:

- Star Citizen "records impacts on the ship within an extra set of textures that wrap around
  the entire ship, then uses these in shaders to dynamically add dents and burn damage in
  precisely the location the ship took damage," replacing what would otherwise be 200+ discrete
  meshes per ship (10+ parts × 5 damage states × 5 LODs) and measuring a **4× memory reduction**
  on the Gladius
  ([RSI: Design Notes — New Damage System](https://robertsspaceindustries.com/en/comm-link/engineering/14568-Design-Notes-New-Damage-System)).
- Homeworld 3 gives "each ship its own dynamic damage texture that procedurally adds damage to
  the surface, with the ability to gradually transition damage from surface scars to devastating
  hull breaches," and prioritises it on **capital ships**, where it reads
  ([Gaming Trend on the HW3 damage blog](https://gamingtrend.com/news/homeworld-3-devs-release-new-blog-post-discussing-weapon-and-unit-damage/)).

For us this is not merely the good approach, it is the **only** approach that fits, because we
are at 499 draws against a committed 320 and any mesh-swap or decal-mesh scheme adds draws.

The mapping is already written. `src/art/materials/hullShader.js#nadirMacroUV(p, n)` takes an
object-space position and normal and returns a point inside one of six atlas regions, with the
handedness table already solved and already commented at length (getting it wrong prints the
hull number backwards). **Reuse that function verbatim.** The damage atlas is a second texture
in the same address space. Cost: one sampler, one `texture2D`, and — critically — the emitted
GLSL still does not depend on any uniform, so `customProgramCacheKey` stays constant and every
hull material in the game stays on **one program**. Programs go 63 → 63.

### 3.2 Channel packing

RGBA8. Deliberately mirrors Star Citizen's four factors (temperature, burn, thickness,
deformation) mapped onto what our shader can consume:

| ch | name | behaviour | drives |
|---|---|---|---|
| **R** | `burn` | monotonic accumulator; only repair reduces it | albedo toward `pal.burn`, roughness up, metalness down |
| **G** | `ablation` | monotonic; how much plate is gone here | cross-fade to the substructure surface response |
| **B** | `heat` | **live**, decays at the ship's shed rate | additive emissive (§7) — the only additive channel |
| **A** | `breach` | monotonic; hull perforation | vent anchors, the darkest albedo, breach rim |

**Deformation is dropped, explicitly.** We cannot deform a 2000-triangle hard-edged loft
without either vertex displacement — which fights the flat-shaded normals the whole surface
pass was tuned around, and would break the vertex-normal work `acceptance.md` still has open —
or a mesh swap, which costs draws we do not have. The *structural* deformation read is bought
instead with a rigid transform on a damage group (§3.3, stage 5), which costs one quaternion.

### 3.3 The six stages

Stages are **thresholds on the local atlas value, not a state machine on the ship**. A hull can
be at stage 5 on the port bow and stage 0 aft. That is requirement §4 (localisation) satisfied
by construction rather than by a second system.

Let `d = max(burn, ablation, breach)` at the fragment.

---

**Stage 0 — CLEAN.** `d = 0`. Baseline. Nothing changes. Stated so the ramp has a floor.

---

**Stage 1 — SCORCHED.** `d ∈ [0.05, 0.25]`.

*What changes on the model:* albedo mixed toward the faction's `pal.burn`; roughness raised;
metalness multiplied down, because soot is a dielectric covering and not the surface.

*In implementation terms:* this is **arithmetically identical to three lines the hull shader
already runs** for the macro layer's soot channel:

```glsl
diffuseColor.rgb = mix( diffuseColor.rgb, nadirSootColor, nadirMacroTexel.b * nadirMacro.z );
roughnessFactor  = clamp( roughnessFactor + nadirMacroTexel.b * 0.24, 0.035, 1.0 );
metalnessFactor *= 1.0 - max( nadirMacroTexel.b * 0.60, ... );
```

Add the damage atlas's `burn` into the same three `mix`/`+`/`*` sites, at a slightly higher
weight (soot from a vent is a stain; carbon from a shell is a deposit). **Three tokens of GLSL.
Zero new shader structure. Zero draws.**

*Also:* the existing `vfx/damage.js` instanced scorch quads keep running at real impact points.
They are **not** made redundant by the atlas — see §4.3.

---

**Stage 2 — PLATING BLOWN.** `d ∈ [0.25, 0.5]`, driven by `ablation`.

*What changes:* the fragment stops responding like armour plate and starts responding like the
frame underneath it. Three things move together, and all three must move or it reads as a
stain:

1. **Albedo** drops to `pal.substructure` — specify it at roughly **0.35× the armour value**
   and shifted toward the faction's `wear.oxide`. The read at 30 px is a *dark hole in a light
   hull*. The EVE Frontier reference frames in the scratchpad show exactly this two-tone
   construction as the resting state of a warship: pale tan armour slabs hung on a dark rust
   truss. Our substructure colour should be chosen so a blown plate looks like that truss.
2. **Frequency changes.** Our hull maps already ship three measured frequency tiers — 93.6 m
   (calm armour), 29.9 m (plating), 13.0 m (greeble), a 7.2 : 1 spread
   (`docs/review/acceptance.md`, Cohesion). Substructure = cross-fade the detail sample from the
   calm 93.6 m tile to the **13.0 m greeble tile, which is already baked and already resident**.
   Frequency contrast is what makes it read as a different *kind* of thing rather than as a
   darker version of the same thing.
3. **Relief and response.** `normalScale` locally ×2.2, `envMapIntensity` contribution pulled
   down via the metalness term. The exposed frame goes matte and sits back.

*The single most important detail in this whole section:* **the ablation mask must be quantised
against the plate field, so a blown plate is a whole plate with a hard edge.**
`art/textures/hullMaps.js` already computes a `panel` field (plate identity per texel) and
returns it. Snap the mask to it. A soft radial ablation blob is a smudge; a hard-edged missing
plate is damage. This is the difference between "dirty" and "shot", and it is the thing
`ARCHITECTURE.md` non-negotiable 4 (hard-edged) is actually asking for.

*Cost:* one extra `mix` in each of map/roughness/metalness, sampling a texture already in the
material. **Zero draws. Zero new textures.**

---

**Stage 3 — SUBSTRUCTURE EXPOSED.** `d ∈ [0.5, 0.7]`.

Two versions, and the recommendation is to ship the cheap one first.

*3a — shader-only (recommended for P2).* Push stage 2 further: relief to ×3.0, albedo to
0.25×, and add a **darkened rim** one texel inside the ablation edge (an `fwidth`-based
gradient on the mask, which costs two ALU). A hard mask with a dark inner rim reads as a hole
with depth. Star Citizen's repair overlay highlights "hull breach edges" for exactly this
legibility reason
([RSI: Design Notes — Ship Repair and Maintenance](https://robertsspaceindustries.com/en/comm-link/engineering/15062-Design-Notes-Ship-Repair-And-Maintenance)).
**Zero draws.**

*3b — real substructure shell (P8, gated).* A pre-built inner shell per damage group at 0.8 m
inside the outer loft, using the `greeble` material the cruiser already carries as one of its
three surfaces, seen through alpha-tested holes punched in the outer plating by the ablation
channel.

**The honest price of 3b, stated because it is the one item here that is not free:**
+1 draw call per damage group per damaged ship (cruiser: **+2**; a 13-ship benchmark scene:
up to **+26**), and putting `alphaTest` on the outer hull material defines `USE_ALPHATEST`,
which **breaks the single shared hull program** unless alphaTest is applied to *every*
hull-family material at once. Do not start this before the 499 → 320 work in
`docs/review/benchmark.md` has landed. See §8.

---

**Stage 4 — VENTING.** `d > 0.7` with `breach > 0.4`, or any subsystem / hardpoint kill.

*Already built.* `vfx/damage.js#addVent` gives a gas cone with pressure falloff, a thin hot lip
jet so the breach has a source, and irregular sparking, over 30 s, at zero draw cost (the
particle system is GPU-driven and pooled). Two changes:

1. **Anchor vents to the `breach` channel, not only to `SUBSYSTEM_DESTROYED`.** A hull that has
   been chewed on should vent where it was chewed. Keep a CPU-side ring buffer of breach points
   — the same shape as the existing `dLocal` / `dNormal` decal arrays, capacity 24, which is
   what `ventCapacity` already is.
2. **A sealed vent leaves a scar.** Today a vent stops after 30 s and the ship is visually back
   to where it was. On a persistent hull that is wrong. On seal, write a permanent stage-3 blot
   into the atlas at that point. *The vent is transient; the hole is not.*

*Do not make it more dramatic.* The Expanse gets this right and is worth following: a hull
breach in vacuum **leaks** — air escapes at roughly the speed of sound through a hole that is
small relative to the compartment — rather than explosively decompressing
([Science vs Hollywood on The Expanse](https://sciencevshollywood.com/explosive-decompression-and-space-battles-in-the-expanse/)).
The existing tapered 30 s cone with `pressure = clamp(remaining/12)` is already the right
physics and the right drama. Leave it alone.

---

**Stage 5 — STRUCTURAL FAILURE.** A whole damage group, at group damage > 0.85 or hull < 15%.

This is the only stage that changes geometry, and we get it almost free because
`src/art/geometry/cruiser.js` **already has damage groups** — `const GROUPS = ['core','engine']`
— and the file's own comment says what they are for: *"The bridge tower does not need
independent damage GEOMETRY — it needs an independent material swap, and that costs nothing."*

Four things happen:

1. **Material swap** to the `damaged` registry key for that group. Zero draws, by construction.
2. **Emissives out** for that group. Already implemented (`DamageVFX.onSubsystemDestroyed`).
3. **Rigid deformation.** The group's root takes a small **permanent** local transform:
   ≤ 3° of cant and ≤ 8 m of sag, seeded from `world.rng` so it reproduces. A 1400 m ship with
   its drive array canted 2.5° off the centreline reads as *bent* from 4 km, and it costs one
   quaternion and one vector. This is the entire answer to "structural deformation" under a
   low-poly hard-edged constraint, and it is why §3.2 could drop the deformation channel.
4. **A sustained low-rate emitter** at the failure seam — Homeworld 3's "smoke that gets thicker
   and darker" — at a *low* rate, because it must survive being on for the rest of the session.

**The silhouette constraint, which must be written down before anyone tunes stage 5.** Star
Citizen's 75% and 100% damage states deliberately produce major silhouette changes. We cannot
afford that: our silhouette audit is the strongest asset in the project (46 same-mount module
pairs and 78 ship-class pairs held apart, `docs/review/acceptance.md`), and a damaged cruiser
that reads as a different class at 30 px would break it. So:

> **Damage changes the SURFACE at every range and the SILHOUETTE only inside 800 m.**
> Cant ≤ 3°, sag ≤ 8 m on a 1400 m hull — under one pixel at the 30 px read. Detached
> hardpoint modules (which already remove geometry via `_breachHardpoint`) are the *intended*
> exception, because losing a module is supposed to change what you look like.

This should be checked, not asserted. `src/art/geometry/modules/audit.mjs` and
`ships/audit.mjs` already bin fitted outlines at the 30 px read and exit non-zero on a
regression. Add the damaged cruiser as a case to the ship audit. That is how every other
criterion in this project moved off PARTIAL — someone wrote forty lines of tool instead of
another paragraph.

---

## 4. Localised damage

### 4.1 Impact → atlas texel, in one function

We already have the hard half. `vfx/damage.js#addScorch` raycasts **from outside the hull, down
the line from the hull centre through the impact point**, takes the first real surface, and
converts both point and face normal into hull-local space — with a bounding-box projection
fallback for thin or open geometry. That is a handful of triangle tests per *hit*, not per
frame, and the file's comment already explains that it is "the difference between damage you
can see and damage you cannot."

The mapping is then two lines:

```js
const [u, v, region] = macroUV(localPoint, localNormal);   // JS port of nadirMacroUV
atlas.stamp(region, u, v, radius, severity, weaponType);
```

**Requirement: the JS `macroUV` and the GLSL `nadirMacroUV` must be generated from one table.**
The precedent already exists and is already commented — `textures/macro.js#AXIS_FLIP` carries
the same three handedness signs as the shader "so a mark authored at a station in ship metres
still lands at that station." Extend that table; do not write a second copy of the branch. A
divergence here puts scorch marks on the wrong flank and would be debugged in the wrong file
for an hour, which is precisely the failure mode `hullShader.js` already documents.

### 4.2 The stamp itself, and how it reuses `scorch.js`

`art/textures/scorch.js#makeScorchStamp` already builds three layers per (seed, severity) and
caches them — an albedo with directional spatter tendrils and an oxidised bloom ring, an ORM
multiply and an ORM add. It already computes exactly the radii we need:

```js
const core  = lerp(0.13, 0.26, sev) * size;   // dense carbon
const soot  = lerp(0.34, 0.56, sev) * size;   // feathered halo
const bloom = core * lerp(1.10, 1.30, sev);
```

Add a **fourth product** to the same generator — `damageStamp`, one RGBA canvas — built from
shapes that are already being computed:

| ch | shape | radius |
|---|---|---|
| R `burn` | the existing feathered soot halo's coverage | `soot` |
| G `ablation` | a **hard-edged disc**, no feather — this is what makes plates come off cleanly | `core` |
| B `heat` | a bright spike, decayed at runtime | `core × 0.6` |
| A `breach` | present only above severity 0.7 | `core × 0.5` |

~40 lines in a file that already builds three layers, and the stamps stay cached per
(seed, severity, weaponType) exactly as they are now. The `weaponType` axis is what makes a
beam hit and a railgun hit leave different marks — Star Citizen's stated goal that "lasers will
cause your hull to light up for several seconds leaving burnt paint and exposed metal, a
powerful ballistic might tear a hole straight through your hull." Concretely: `beam`/`lance`
weight R and B; `cannon`/`rail` weight G and A; `missile`/`flak` weight R wide and G moderate.

`applyScorchStamp` already does a 3×3 wrapped blit so a hit near a seam is not clipped. **The
damage atlas must not wrap** — `macro.js` states plainly that "the atlas must NOT wrap: the
shader clamps into a region and a wrap here would put a mark from the deck onto the flank." So
the atlas variant clamps to the **region rect**, not to the atlas. Six lines, and getting it
wrong bleeds a port-flank hit onto the deck.

### 4.3 Two frequencies, and neither one deletes the other

Keep **both** the instanced scorch quads and the atlas. They are the same relationship as the
hull's existing tiling/macro split:

| | instanced scorch quads (`vfx/damage.js`) | damage atlas (new) |
|---|---|---|
| resolution | 256 px stamp on a 34–140 m quad | ~12.5 m per texel |
| read at | close range, per impact, crisp | any range, whole hull, coarse |
| lifetime | ring buffer, capacity 96, recycled | permanent until repaired |
| draw cost | **already paid** — one InstancedMesh for every hull in the scene | **zero** |
| blend | pure darkening (`ZeroFactor` / `OneMinusSrcAlpha`) — cannot brighten a shadow | shader term |

Write this down in the code, because the first person to see both will try to delete one.

### 4.4 Hardpoints, subsystems, and the write budget

- `Ship._hardpointNear(point)` and `_subsystemNear(point)` already resolve a hit to a mount or a
  subsystem. A hit that resolves to a hardpoint should bias its stamp toward that hardpoint's
  anchor, so the mark lands *on* the mount rather than beside it, and it should ablate **that
  facing's** armour pool (§1.2).
- Cap the write rate. A stamp is a `drawImage` plus a texture upload; at 60 Hz with point-defence
  chatter this is tens of MB/s of upload for damage nobody can see.
  1. Keep the existing filter — `onImpact` already returns early for `pdslug` and `flak`
     ("point defence chatter would carpet a hull in decals within a minute"). It is right.
  2. Coalesce: accumulate stamps into a dirty-rect list and upload **at most once per 250 ms**,
     and upload only the dirty sub-rect. three.js r185 supports partial uploads on
     `DataTexture` via update ranges; use them. A full 384×256 RGBA re-upload is 393 KB and
     should happen a handful of times per engagement, not sixty times a second.
  3. Clamp the number of *distinct* stamps per facing per second to 4. Beyond that, deepen
     existing texels rather than adding new ones — visually identical, and it bounds the cost.

---

## 5. Persistence

Our design is a persistent hull with no permadeath, so damage accumulates across engagements
and repair is a claim on the same scarce material pool as refit (`scope-decision.md`). Two
questions to answer: how does a battered ship *read*, and how does the player *choose*.

### 5.1 How a battered ship reads at a glance — three rules

1. **All permanent damage subtracts light.** Burn, ablation and breach only ever darken and
   de-metallise. `vfx/damage.js` already enforces this for decals with a custom blend and the
   comment explains why: carbon subtracts light and never adds any, so the decal "cannot
   brighten a shadow." Extend the principle to the atlas. A battered hull is a darker,
   lower-contrast hull, and that reads at any exposure and under any POI grade — which matters,
   because `reference-ui-language.md` §1 wants us grading harder toward one temperature per POI.
2. **The only additive damage channel is heat, and heat is transient.** Therefore:
   **permanent damage is dark, live damage is bright.** A player can tell "hurt now" from "hurt
   before" without reading a label, from any distance, with no UI. This is the cheapest piece of
   legibility in the whole document and it falls out of the channel packing for free.
3. **Repairs are visible and they do not match.** Following Galactica — whose hull after New
   Caprica is "clearly darker with burn marks and missile hits, most notably the three large
   holes on her back where the armor was weakest"
   ([Battlestar Wiki](https://galactica.fandom.com/wiki/Battlestar_Galactica)) — a repaired
   plate should not restore the surface, it should *replace* it. Repairing a facing clears the
   `ablation` and `breach` channels but writes a **patch mark** into the macro atlas's mark
   channel. `textures/macro.js` already draws "repair patch outlines" as a §4(c) functional
   marking at value 0.42; the machinery exists. A veteran hull becomes a quilt of mismatched
   patches, which is free identity and is exactly the project's thesis that mismatched salvage
   reads as deliberate under a constrained visual language.

### 5.2 The damage view — an overlay, in our palette

Star Citizen's repair flow leans on an AR heatmap of hull integrity: green for undamaged, red
for full damage and breaches, a gradient between, with breach edges highlighted
([RSI: Ship Repair and Maintenance](https://robertsspaceindustries.com/en/comm-link/engineering/15062-Design-Notes-Ship-Repair-And-Maintenance)).
The idea is right; the palette is not ours. `reference-ui-language.md` §1 is unambiguous —
black, bone, and one warm amber, no third hue anywhere in frame.

So: a **DAMAGE VIEW** toggle on the tactical camera. Hull renders in flat bone; damage renders
in the amber accent at intensity = local damage; breaches render as pure black with a one-texel
amber rim; the repair panel's currently-selected job pulses its facing. One hue, and it is the
hue the whole UI already uses for "selected, owned, targeted or warning".

*Implementation:* a float uniform `nadirDamageView` on the hull material and a `mix()` at the end
of the fragment. **Not** a `#define` — a define changes the program and would cost a second
variant against the 90 ceiling. A uniform-driven `mix` keeps `customProgramCacheKey` constant.
Zero draws, zero programs.

### 5.3 How the player decides what to repair first

This is the real design question, and the answer must avoid crew. Nebulous solves it with damage
control **teams** who prioritise components, travel to them, and can be re-tasked at the cost of
travel time ([Nebulous wiki: Damage Control](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Damage_Control));
Star Citizen solves it with a two-operator workshop and a Repair Task Manager. Both are crew,
and crew is **explicitly out** per `scope-decision.md`.

**The non-crew translation: the bay is a machine with a queue, and the scarcity is materials and
time, not hands.** This is the same move `beta-decay-systems.md` §3.1 identifies as Beta Decay's
own discipline — simulate the noun, abstract the verb; the Processor's entire interaction is
"put material in, it comes out, FIFO."

The REPAIR panel is a **ranked list of marginal buys**, not a shopping list of full repairs:

```
REPAIR                                    ALLOY 214  COMP 68  ELEC 31
 ─────────────────────────────────────────────────────────────────────
 1  ARMOUR  PORT      +25%   →  41%→66%     34 alloy  9 comp    20 s
 2  ARMOUR  ENGINE    +25%   →  12%→37%     41 alloy 11 comp    20 s
 3  HARDPOINT PORT   restore →  breached    60 alloy           30 s
 4  HULL              +10%   →  68%→78%     26 alloy            45 s
 5  SUBSYSTEM sensor  restore →  dead      48 alloy 12 elec    60 s
 ─  STRAIN  (yard)   −7% cap  →  requires a yard    ×4        4:00
```

Three things make this a decision rather than a formality:

1. **The materials are the same pool refit spends.** Repairing the port belt is a decision *not*
   to fit the cannon bank you cut off a Coalition frigate. That interlock is already committed
   in `scope-decision.md` ("repair, refit and breaking a part down are competing claims on the
   same pool") and is currently unrealised because repair is cheap and instant.
2. **Time is real and the POI is not safe.** Every row costs sim time. If the response-pressure
   clock (`fun-systems.md` P4) exists, repair is a thing you do *instead of leaving*, which is
   the "foregone value" identity that document argues is uniquely ours.
3. **Partial buys are allowed and are usually correct.** A 25% slice of one facing is the
   atomic unit. A list of full repairs is arithmetic; a list of 25% slices at different prices
   against a shrinking pool is a budget problem.

**Strain — the ratchet that makes hull damage matter across engagements.** Every 10% of hull
lost in a single engagement permanently reduces `maxHullHP` by 1%, restorable only at a yard
job costing 4× and four minutes. This is Highfleet's dread ("a won battle can bankrupt you")
and Homeworld's persistence ("a corvette lost in mission 4 is gone in mission 12") in one
number, and it gives the persistent hull a reason to prefer *not being hit* over *being repaired
afterwards*. Cap total strain at 25% so it is a pressure, not a death spiral. Show the cap on
the hull bar as a permanent notch — the same treatment `ui/hud.js` already uses for the
`BREACH AT 35%` line, and for the same stated reason: a threshold the player has never seen
before it fires reads as the game cheating.

---

## 6. Subsystem damage visuals

**The requirement:** every destroyed subsystem is identifiable by looking at the ship, not only
in the HUD. Homeworld makes subsystems physically attached, visible modules that a bomber can be
told to attack ([Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Homeworld_2)); Beta
Decay's fire-control radar feeds an in-cockpit display, and shooting the radar off makes the
display a display of nothing (`beta-decay-systems.md` §4.3). That causal chain — *the object is
the readout* — is the standard to hit.

**What exists.** `vfx/damage.js` already binds every emissive mesh on a hull to its nearest
subsystem at registration and hides those meshes on kill, with the correct exception that
`InstancedMesh` light strips bind to the *hull* so one dead engine does not black out the ship.
The file's own comment names this as "the one that actually changes how the game plays." It is
the spine. Everything below extends it.

| kind | what a kill looks like on the ship |
|---|---|
| **engine** | Plume gone (existing). Bell interior swaps `engineGlow` → `damaged`. A slow ember flicker from the bell at ~0.15 Hz on pooled `FIRE` particles. At 4 km the read is that **the ship no longer leaves a wake** — the strongest long-range signal we have, and it is free. If the whole array dies, `Ship.stranded` fires and the aft damage group takes its stage-5 cant (§3.3). |
| **weapon** | **Freeze `WeaponMount.traverse` at its last bearing, permanently.** A gun pointing the wrong way while the ship manoeuvres is the most legible dead-weapon signal in the medium, it costs one boolean, and it is *true* — a dead traverse ring is a real failure mode. Plus: barrel-tip emissives out; the atlas `heat` channel latched high for 20 s and then burnt permanently into `burn`, so a dead gun is a *scorched* gun; and 6° of permanent droop in pitch. |
| **reactor** | Currently catastrophic — a reactor kill destroys the ship and floors `salvageIntegrity` at 0.15, which is the best rule in the design and must not change. What is missing is the *damaged* reactor. Specify: every hull-bound emissive (`rec.hull`, i.e. the running lights and deck strips) drops to `0.35 + 0.65 × reactorHealth` **and gains an irregular flicker at 2–5 Hz** with a seeded duty cycle. A ship whose running lights are guttering is a ship whose reactor is hurt, readable from 8 km, and it is one uniform multiply on materials that are already batched. **This is the strongest new signal in the list, because it is whole-ship rather than local.** |
| **hangar** | The bay-mouth emissive band goes dark and the deck strip inside it goes out; launch VFX stops. A permanent vent at the bay mouth at `scale` = bay radius — `addVent` already takes a scale and a big compartment vents visibly bigger, which is correct and free. |
| **sensor** | The hard one, because a sensor is not luminous. **Make it luminous by making it move.** The sensor mast carries a small emissive element whose intensity is animated as a 0.25 Hz sweep while alive; kill it and the sweep stops. A stopped sweep is as legible as a dead light and costs one `sin()`. In the HUD, the tactical overlay degrades in the staged way `beta-decay-systems.md` §6.6 already specifies — the display fed by a breakable object. |

**Draw-call impact: zero.** Every entry above is a material swap, a uniform change, a transform,
or a pooled particle emitter on meshes that already exist. This is not an accident; it is why
the subsystem vocabulary is P4 and not P8.

**The audit that makes the requirement enforceable.** `registerShip` buckets emissives to the
nearest subsystem within `radius × 2.4`. A subsystem whose bucket comes back **empty is
invisible when dead** — the requirement silently fails and nobody finds out until a review pass.
Add a dev-mode audit that prints every subsystem on every registered ship class with no bound
emissive mesh, and fail `npm run smoke` on it. That is `scope-decision.md`'s fourth question —
*can the player see it?* — mechanised, and it is the same discipline that moved Silhouette and
Lighting off PARTIAL.

---

## 7. Heat

The reference tracks a thermal state that flips `STATUS NOMINAL` → `STATUS OVERHEATED`, with an
`EXT 87.8 / 94.4` figure, a large vertical orange bar, and rates `0.12/s` and `2.4%/s`
(`reference-ui-language.md` §5, §8). Beta Decay's own devlogs confirm overheat as a live
mechanic — the MCV minigun "will now overheat and can only be fired periodically"
([Development Update #30](https://www.patreon.com/betadecay/posts/development-30-111253385)).
And it is physically the right mechanic for this fiction: The Expanse's railguns generate
massive heat that the insulating vacuum will not carry away
([The Companion on 'CQB'](https://www.thecompanion.app/the-expanse-cqb-space-battle/)).

### 7.0 Status: the model landed while this was being written

**`src/sim/heat.js` now exists** (a parallel stream, same pass) and implements the thermal model
this section was going to propose, in the same shape and with better numbers. Read that file
before anything below. What it already has:

- **Per-mount `MountThermal`** — every consequence of heat is a mount-level consequence.
  `softCap 0.70` (dispersion widens, fire solution degrades), `tripAt 1.0`,
  **`rearmAt 0.45` hysteresis** so a tripped mount does not flicker back on, `spinDown 4.5 s`.
- **`ShipThermal` with a radiator budget derived from power routing** — `CHANNEL_HEAT`
  weights `{ weapons 1.0, shields 0.6, engines 0.5, sensors 0.3 }` against the plant's `actual`
  shares, so a channel you draw on both raises heat and cuts the budget that sheds it. That is
  the interlock, and it is the right one.
- **`HEAT_PER_SHOT` by weapon archetype**, scaled by damage — `rail 0.095`, `lance 0.075`,
  `beam 0.055`, `cannon 0.030`, `missile 0.004`. Beams have no ammunition cost and pay for it
  thermally, which is exactly the two-currency trade the stores model needs.
- **Trips cost `tripStructureDamage 16` to the hardpoint and `tripConditionLoss 0.02`** — heat
  feeds back into structure and into salvage quality via `src/sim/condition.js`.
- **A coolant purge** (`purgeFraction 0.55`) as an active ability — the thing `fun-systems.md`
  §5.2 said the player did not have.
- **The reference's own scale**: `extIdle 41.0`, `extMax 94.4`, matching `EXT 87.8 / 94.4` off
  the frame. Status words on peak mount heat: `elevatedAt 0.50`, `overheatedAt 0.85`.
- A damaged reactor also runs the ship hot, making the reactor a thermal target as well as a
  power one.

**Do not re-specify any of that.** What follows is only what is *missing*, and it is three
items.

### 7.1 Addition 1 — overheating should take your routing away

`heat.js` trips mounts. It does not touch the power plant. Add: at `state === 'OVERHEATED'`,
`PowerPlant` clamps every channel back toward an even split over its normal `spoolRate`, and
refuses new `setChannel` requests until the ship drops below `elevatedAt`.

**Why this specifically.** It is FTL's ion damage translated exactly: ion damage disables power
bars for five seconds rather than destroying the system, and "while under the ion effect, power
cannot be added or removed from that system"
([FTL wiki: Systems](https://ftl.fandom.com/wiki/Systems)). You lose the commitment at the exact
moment you were most committed to it, and you buy it back by paying the 3-second spool again.
It is recoverable, never a death sentence — which is what a persistent hull with no permadeath
needs — and it is the only consequence in the model that punishes the *routing* decision rather
than the *firing* decision. Without it, `assault` routing is punished only through the mounts,
and the widget the reference frames put front and centre stays a one-way lever.

Roughly 15 lines across `sim/power.js` and `sim/heat.js`.

### 7.2 Addition 2 — heat must be on the hull, not only in the HUD

This is the part that belongs to *this* document, and `heat.js` correctly does not attempt it.

- The damage atlas's **`B` channel is heat** (§3.2), written from `ShipThermal` per frame at the
  mount and drive-bell anchors, and decayed at the ship's shed rate. It is **the only additive
  channel on the ship**, which is what buys the §5.1 legibility rule: *permanent damage is dark,
  live damage is bright*, with no label and at any range.
- `emissive += pal.hazardA × smoothstep(0.55, 1.0, heat)²`. Gated hard at 0.55, because a hull
  that glows faintly all the time is a hull that has lost its blacks, and the lighting pass
  fought hard to get the value curve out of the compressive toe. Squared, because a linear ramp
  reads as a wash rather than as heat.
- **Where it glows matters.** Heat concentrates at firing mounts, at the drive bells under high
  engine share, and along radiator strakes. A ship that glows at an arbitrary place looks broken;
  a ship that glows along its radiators looks designed. **This is a request to the geometry
  stream** — the cruiser wants a named radiator element — not a change made here.
- At `OVERHEATED`, a 0.6 Hz pulse. It should be the only animated emissive on the hull, so it is
  unmistakable.
- **Bloom budget:** `postfx.js` thresholds at 1.05 luminance and `materials.get('emissive')`
  defaults to 1.9. Peak heat emissive at **1.4** — above threshold so it blooms, well below the
  point where a large hot face floods the frame. `materials/index.js` already records the reason:
  for bloom, area matters more than intensity.

Cost: one channel of a texture §3 is already adding, one term in a fragment shader already being
patched. **Zero draws. Zero programs.**

### 7.3 Addition 3 — the HUD block, built against the real numbers

`thermalReport(ship)` already returns a non-allocating report with `state`, `ext`, `extMax`,
`load`, `radiate`, `peak`, `mean`, `rate`, `tripped`, `coolant`, `mounts`. The block below is
just that report, laid out the way the reference lays it out:

```
                                    ┌───┐
   STATUS  NOMINAL                  │▓▓▓│
   EXT     71.4 / 94.4              │▓▓▓│ ← soft-cap tick at 0.70
           +2.4 %/s                 │▓▓▓│
   COOLANT ■■■□                     └───┘
```

- Bottom-right block, as observed.
- `NOMINAL` / `ELEVATED` / `OVERHEATED` in small caps; amber from `ELEVATED` up. Three words
  rather than the two the frames happened to catch — the frames show the two ends of a range,
  and a middle word is what makes the soft cap legible before it bites.
- `EXT` current-over-capacity as a pair, on `heat.js`'s own 41.0 → 94.4 scale, matching the
  observed `EXT 87.8 / 94.4` exactly.
- A **large vertical bar** with a tick at the soft cap. Vertical because it is then the only
  vertical element in the frame and is instantly findable — that is why the reference does it.
- A **signed rate** from `report.rate`. The sign is the whole readout: `+` means the fight is
  getting away from you.
- Per-mount heat pips on the hardpoint bars `ui/hud.js` already draws, with a tripped mount
  reusing the existing offline treatment (`WeaponMount.online` is already the flag a destroyed
  weapon subsystem sets, so a tripped mount needs no new HUD state).

**Heat is never damage.** It reduces *rates*, never a layer. Stated as the abstraction: no
thermal conduction, no per-component temperature, no radiator geometry — one ship scalar and one
per-mount scalar, which is what `heat.js` already does. The player can name a reason to want
exactly two numbers — *can I keep firing* and *can I keep this routing* — and Beta Decay's rule
is to model the parameter the player would ask about and stop.

Degrading before failing is Star Citizen's stated rule — "damaged components work at reduced
efficiency before shutting down completely" — and `heat.js`'s soft cap already implements it.

---

## 8. Implementation plan

Ordered by value per unit cost, with the draw-call and texture-memory position stated for every
item. Stream ownership per `ARCHITECTURE.md`; anything touching `src/core/**` is a proposal to
integration, not a change.

**The framing constraint, up front:** the benchmark measures **499 draw calls against a
committed 320** and is a reported FAIL. **P1 through P7 are draw-neutral by construction.** That
is not a happy accident — it is the constraint the entire visual design in §3 was chosen around,
and it is why the atlas approach was preferred over decal meshes, damage-state mesh swaps, or a
substructure shell.

| # | Item | Owner | Cost | Draw calls | Texture memory |
|---|---|---|---|---|---|
| **P1** | Armour layer: six facings, mitigation curve, weapon×layer table; signed per-layer rates in the HUD | Combat + UI | **M** ~200 lines `sim/ship.js`, ~120 `ui/hud.js`, one `core/contracts.js` field | **0** | 0 |
| **P2** | Damage atlas + shader consumption. Stages 1–3a | Materials | **M–L** ~300 lines across `hullShader.js`, `materials/index.js`, a new `textures/damageAtlas.js` | **0** | **+0.39 MB per damaged capital**; +1 sampler; +1 fetch/fragment |
| **P3** | Localised write path: `macroUV` JS port, `damageStamp` in `scorch.js`, coalesced sub-rect upload | VFX + Materials | **M** ~180 lines | **0** | 0 (writes into P2) |
| **P4** | Subsystem visual vocabulary (§6): frozen traverse, guttering lights, stopped sweep, dead bells, bay vents, + the empty-bucket audit | VFX + Combat | **S** ~150 lines | **0** | 0 |
| **P5** | Heat — **model already landed in `src/sim/heat.js`.** Remaining: the routing clamp on OVERHEATED (§7.1), the atlas `B` emissive (§7.2), the HUD block (§7.3) | Combat + UI + Materials | **S** ~15 lines `power.js`, ~40 shader/atlas, ~80 `ui/hud.js` | **0** | 0 |
| **P6** | Persistence: repair queue with time, marginal-buy panel, strain cap, patch marks, DAMAGE VIEW overlay | UI + Refit | **M** ~250 lines | **0** (overlay is a uniform `mix`) | 0 |
| **P7** | Stage 5: damage-group material swap + cant/sag transform; add damaged cruiser to `ships/audit.mjs` | Geometry + Combat | **S** ~90 lines | **0** (swap on an existing group) | 0 |
| **P8** | Stage 3b: substructure shell behind alpha-tested plating | Geometry + Materials | **L** | **+1 per damage group per damaged ship** — cruiser **+2**, benchmark scene up to **+26** — and **+1 shader program** unless `alphaTest` is applied to *every* hull-family material at once | 0 |

### 8.1 The draw-call position, stated plainly

- P1–P7 add nothing and must be **verified** to add nothing by re-running `npm run bench`, not
  asserted. Note the trap `docs/review/benchmark.md` already records: `tools/bench.mjs` runs the
  **dev** server, and HMR full-reloads the page whenever anything writes to the source tree,
  which destroys a 10-minute software-rasterised run and looks exactly like a benchmark crash.
  The three-character fix (`mode: 'preview'`) is the performance stream's to make.
- **P8 must not be started until 499 → ≤ 320 has landed.** Added today it would take the
  benchmark to roughly 525 and make a reported FAIL worse.
- Before anyone prices P8 or re-merges a hull to chase the count, take the measurement
  `benchmark.md` already identifies and nobody has taken: `renderer.info` counts **GTAO's
  depth-normal prepass, which is a second full render of the scene**, so a meaningful fraction of
  the 499 is one scene counted twice. `npm run bench -- --quality medium` disables GTAO and
  separates the two in one command.

### 8.2 The texture-memory position, and the one implementation note that matters most

- **Sizing.** `textures/macro.js` uses `MACRO_REGION = 384` for a 3×2 atlas — 1152×768 RGBA,
  3.5 MB per faction before mips. The damage atlas uses the **same six-region layout at
  `region = 128`**: 384×256 RGBA = **393 KB**, and **no mips**. No mips is a deliberate choice
  with a stated cost: a monotonic accumulator would need a full chain rebuild on every stamp,
  and the signal is low-frequency, so `LinearFilter` + `ClampToEdgeWrapping` is correct — at the
  price of slight aliasing at maximum zoom-out, which is accepted.
- **Who gets one.** Lazily allocated on a ship's first hit; released with the wreck. **Capitals
  and the player only.** Frigates and below keep the existing instanced scorch quads. That is
  Homeworld 3's own rule — the dynamic damage texture is prioritised on larger units where it
  reads. Worst case in the benchmark scene: 13 ships × 393 KB = **5.1 MB**.
  `registry.audit().textureMemoryMB` already reports resident texture bytes (defect D8's
  machinery), so this is measurable on day one.
- **The hidden cost, and the fix.** An atlas is per-ship-instance, so a damaged ship's hull
  materials can no longer be the *shared cached* instances the registry hands out. On the cruiser
  that is 3 surfaces × 2 damage groups = up to 6 materials that must go unique.
  `registry.damageable()` exists for exactly this and is currently used **only in
  `src/probes/materials.js`** — but it calls `hullMapsFor(o, variant, false)`, an **uncached**
  bake of three 512² maps per call, which would be a visible hitch mid-fight.

  > **Recommendation:** do not use `damageable()` for this. Add
  > `registry.withDamageAtlas(material, atlas)`, which **clones the material shell and shares
  > the cached tiling maps**, adding only the per-ship atlas uniform. A clone shares textures
  > and re-bakes nothing; the emitted GLSL is unchanged, so `customProgramCacheKey` stays
  > constant and every hull material stays on one program. Cost: 6 material objects, one 393 KB
  > texture, zero new bakes, zero new programs.

  This is the single most important implementation note in the plan. Getting it wrong turns a
  free feature into a mid-combat hitch and a texture-memory regression.

### 8.3 Contract changes to propose to integration

All of these are `src/core/**` and are **proposals**, not changes:

```js
// contracts.js
export const ARMOUR_FACINGS = HARDPOINTS;          // the six, deliberately the same list

/** @typedef {Object} ShipClassDef  — additions */
// @property {Object<string, number>} [armour]     per-facing armour HP; omit → no belt
// @property {number} [mitigationMax]              default 0.45

/** @typedef {Object} WeaponDef — additions */
// @property {number} [vsShield]   default 1.0
// @property {number} [vsArmour]   default 1.0
// @property {number} [vsExposed]  default 1.0     applied when that facing's armour is 0
// (heatPerShot and coolRate are already read by src/sim/heat.js — do not redeclare)

/** @typedef {Object} ModuleDef.grants — additions */
// armourBelt     (heatSink is already consumed by the thermal stream)
```

**Coordination note.** `src/core/contracts.js` and `src/sim/**` are being edited by parallel
streams in this same pass — `src/sim/heat.js` and `src/sim/condition.js` both landed while this
document was being written, and `contracts.js` has +111 lines uncommitted. Reconcile against the
tree before proposing any of the above, and expect `condition` (0..1, universal) to already be
the right hook for "a repaired plate is not a new plate" in §5.

Validation should reject an armour map with a key that is not a hardpoint, for the same reason
`registerModule` already rejects an unknown hardpoint: a silently mis-keyed facing renders fine
and then never takes damage, and that is an hour to find and one line to prevent.

---

## 9. The four-question test

Applied per `scope-decision.md`. A proposal that cannot answer all four does not get built.

| Proposal | 1 — What decision does it create? | 2 — What does it interlock with? | 3 — What does it abstract, and why is that the right line? | 4 — Can the player see it? |
|---|---|---|---|---|
| **Armour as a per-facing ablative layer** (§1) | Which flank do I present, and do I spend materials on the belt or on the module I salvaged? Mitigation collapses non-linearly, so *when* to repair is also a decision. | Bearings and arcs (`physics.js` turn-rate model), hardpoint structure and module loss, the materials pool that refit also draws on, `ModuleDef.mass` which is currently declared and unread. | No damage-type × layer resist matrix, no hardeners, no impact-angle penetration. There is no market to buy hardeners in and a matrix would make the refit screen unreadable. | Six percentages in the HUD **and** six regions on the hull that are the same six objects. §3 stage 2 shows a stripped belt as missing plate. |
| **Weapon type × layer, 12 numbers** (§1.5) | Which mounts do I fire first, and which mixed loadout do I build? Beams strip the field, cannons open the belt, missiles go in the hole. | The six-mount refit, the arc system (which mounts can bear decides which multiplier you get), the reactor-vs-attrition salvage decision. | The whole EVE resistance matrix. Twelve numbers on one screen versus a 4×3 matrix per hull plus modules. | One table in the codex; live, because the layer bars fall at visibly different rates per weapon. |
| **Signed per-layer rates** (§2) | Break off or commit; re-route now or ride it out. The rate is the only readout that answers either. | Power routing (it is the only widget that gives spool-time feedback in under 3 s), heat, shields, the repair queue. | Per-source damage attribution in the readout. One net number per layer, not a breakdown by attacker. The player acts on the net. | It **is** the seeing. This item exists to make an existing hidden quantity visible. |
| **Damage atlas + staged shader progression** (§3) | Where do I present, what do I repair, and is that hull worth cutting? A hull's state is readable before you engage it. | Salvage (a chewed hull yields less), targeting, repair triage, the macro layer it shares addressing with. | Deformation as a channel; per-plate physics; interior geometry. Our hull is a 2000-triangle hard-edged loft and vertex displacement would break the normals the surface pass was tuned around. | That is its entire purpose. And it reads at 30 px because ablation snaps to whole plates. |
| **Localised marks** (§4) | Which facing to turn away; whether the port belt is the one to repair. Also: aim, because damage concentrates where you put it. | The existing impact raycast, hardpoint and subsystem resolution, the scorch generator, the armour facings. | Sub-plate structural simulation and any per-texel physical model. We stamp where the ray landed and let the plate field quantise it. | Marks appear where the hit landed. That is the requirement. |
| **Persistence: strain, patch marks, repair queue** (§5) | What to buy with a shrinking pool; whether to repair here or run; whether to accept a permanent cap loss. | Materials (shared with refit and salvage), the response clock, the macro layer's repair-patch marks. | Crew, damage-control teams, component-level replacement inventories. The bay is a machine with a queue — Beta Decay's Processor discipline, and it keeps crew out. | A dark, patched, mismatched hull, plus the DAMAGE VIEW overlay and a permanent notch on the hull bar. |
| **Subsystem visual vocabulary** (§6) | Which subsystem to shoot, and — reading a hostile — whether it is already stranded or defanged and therefore safe to cut. | `stranded` / `defanged` (already computed, currently used only by the AI), the salvage yield table, the targeting ring, the tactical overlay. | Per-component internal simulation. Five kinds, one visual signature each. | By construction — and the empty-bucket audit turns "can the player see it?" into a test that fails `npm run smoke`. |
| **Heat** (§7, model already in `sim/heat.js`) | Which two of four mounts fire; whether to hold this routing; when to spend a coolant purge. The §7.1 addition adds: whether the routing itself is affordable. | Power routing (the radiator budget is derived from the plant's actual shares), fire rate, hardpoint structure via trip damage, `condition` and therefore salvage quality, `grants.heatSink`, the SILENT travel stance. | Thermal conduction, per-component temperature, radiator geometry. Two scalars: ship and mount. | `NOMINAL / ELEVATED / OVERHEATED`, `EXT` on the reference's own 41.0–94.4 scale, a vertical bar with a soft-cap tick, a signed rate — and, from §7.2, the hull glows, additively, which is the only additive channel on the ship. |

---

## Sources

Read 2026-07-28.

**Layered damage, tanking and the shield/armour/hull triad**
- [EVE University Wiki — Tanking](https://wiki.eveuniversity.org/Tanking) — active vs buffer vs passive; slot competition; extender signature penalty vs plate mass penalty; repair-timing asymmetry; why the choice is a fitting decision rather than more HP.
- [EVE University Wiki — Natural resistances](https://wiki.eveuniversity.org/Natural_resistances) — base resist profiles per layer.
- [EVE Online forums — Hull Tanking](https://forums.eveonline.com/t/hull-tanking/492008) and [Damage Control gives more to Armor](https://forums.eveonline.com/t/damage-control-gives-more-to-armor/393952) — why hull tanking is niche, and its use as a time-buying and bait layer.
- [EVE-Survival — A Guide to Tanking](https://cyberrodent.github.io/eve-survival-mission-report/reports/TankingPrinciples.html)

**Visible / physicalised damage**
- [RSI — Design Notes: New Damage System](https://robertsspaceindustries.com/en/comm-link/engineering/14568-Design-Notes-New-Damage-System) — damage textures wrapping the ship; temperature / burn / thickness / deformation; paint bubbling, peeling, denting, holing; per-weapon damage signatures; 200+ meshes avoided; 4× memory reduction on the Gladius.
- [RSI — Design Notes: Ship Repair and Maintenance](https://robertsspaceindustries.com/en/comm-link/engineering/15062-Design-Notes-Ship-Repair-And-Maintenance) — AR hull-integrity heatmap, highlighted breach edges, strip-then-patch repair, graded materials, field vs workshop repair.
- [Star Citizen Wiki — The New Damage System](https://starcitizen.tools/Comm-Link:The_New_Damage_System) — 75% and 100% states producing major silhouette changes.
- [Gaming Trend — Homeworld 3 weapon and unit damage blog](https://gamingtrend.com/news/homeworld-3-devs-release-new-blog-post-discussing-weapon-and-unit-damage/) — per-ship dynamic damage texture; damage sockets with light / heavy / critical / destruction stages; smoke thickening and darkening; prioritised on capitals.
- [Steam — Homeworld Remastered battle damage discussion](https://steamcommunity.com/app/244160/discussions/0/618456760277319976/) — the failure case: a few bullet holes at near-zero HP, which is what "not driven hard enough to read" looks like.

**Subsystems as a decision layer**
- [Encyclopedia Hiigara — Homeworld 2](https://homeworld.fandom.com/wiki/Homeworld_2) — subsystems as physically attached, individually targetable modules on capital hulls.
- [NEBULOUS: Fleet Command Wiki — Armor](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Armor) — localised armour degradation, penetration, interior armour density equivalent.
- [NEBULOUS: Fleet Command Wiki — Damage Control](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Damage_Control) — DC priority lists and re-tasking travel cost (crewed; translated to a bay queue in §5.3).
- [FTL Wiki — Systems](https://ftl.fandom.com/wiki/Systems) — ion damage disabling power bars for 5 s and locking reallocation; the model for our OVERHEATED state.

**Visual language of a damaged warship**
- [Battlestar Galactica Wiki — Battlestar Galactica](https://galactica.fandom.com/wiki/Battlestar_Galactica) — hull darkening, burn marks, and the large holes where armour was weakest.
- [Science vs Hollywood — Explosive decompression and space battles in The Expanse](https://sciencevshollywood.com/explosive-decompression-and-space-battles-in-the-expanse/) — small breaches leak at roughly the speed of sound rather than explosively decompressing.
- [The Companion — 'CQB' and the brutal science of space battle](https://www.thecompanion.app/the-expanse-cqb-space-battle/) — railgun heat that vacuum will not carry away.

**Beta Decay**
- [Rotoscope Studios — Roadmap](https://www.rotoscopestudios.com/roadmap) — Injury at 75% ("visual display of body limb damage by color and amount"), Dismemberment, Stats/Conditions, Destruction.
- [Development Update #30](https://www.patreon.com/betadecay/posts/development-30-111253385) — the MCV minigun overheating and firing only periodically.
- `docs/design/reference-ui-language.md` §5, §8, §9 — first-hand transcription of the two supplied frames; the only access to them.

**Internal**
- `ARCHITECTURE.md`, `docs/review/acceptance.md`, `docs/review/benchmark.md`, `docs/design/scope-decision.md`, `docs/design/beta-decay-systems.md`, `docs/design/fun-systems.md`, and the source files cited inline.
