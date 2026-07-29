# The two closest comparables, studied properly

**Falling Frontier** (Stutter Fox Studios / Hooded Horse) and **the space-roguelike shelf**
that "Rogue Space" points at.

The previous research pass gave Falling Frontier one clause and the roguelike shelf one
paragraph. Both were mistakes. Falling Frontier is the nearest existing thing to what we are
building on four separate axes — modular ship construction, systemic visible damage, salvage,
and sensor-driven discovery — and the roguelike shelf is the nearest thing on the axis we have
deliberately abandoned, which makes it the *more* useful study, not the less.

This document compares against **the code in `src/sim/**` and `src/world/**`**, not against our
own design documents. Where our docs promise something the code does not do, the code wins the
comparison.

---

## 0. Method, and what it cost

**Falling Frontier sources.** The official wiki (`wiki.hoodedhorse.com`) is behind a Cloudflare
challenge and returns 403 to every automated fetch, as does the Steam storefront page. The
usable primary channel turned out to be the **Steam news API**
(`api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1280190`), which returns the *full
text* of all 33 announcements including the two long developer diaries. Those two diaries —
**"Systems Coming Together" (2025-11-05)** and **"Combat Overview" (2026-03-09)** — are the
single best sources on this game that exist, and they are quoted directly below. Wiki content
is reached second-hand through search summaries and is marked as such.

**One caveat that has to lead.** *Falling Frontier has not shipped.* As of July 2026 it is
"coming soon" on Steam, Epic and GOG, targeting Early Access in 2026 with Act 1 of the *Titan
Rising* campaign (~10 hours), with skirmish and the scenario editor to follow. It has been
delayed from 2021 → 2022 → 2023 → 2025 → 2026. So: **everything below about how Falling
Frontier plays is the developer's account of it, not a verified account of a playable
build.** That does not make it useless — the design writing is unusually clear and specific,
and a specific claim you can copy is worth more than a vague one you can play — but it means
"Falling Frontier does X better than us" always means "Falling Frontier has *specified* X
better than us, and we should assume the specification is achievable because it mostly is."

**Roguelike sources.** Slipstream: Rogue Space, plus FTL, Everspace 1 → 2, Void Bastards, and
Hardspace: Shipbreaker, which is not a roguelike and is the most important entry on the list.

No images were downloaded; the scratchpad shelf at
`/tmp/claude-0/.../scratchpad/shelf/` is empty. Nothing was written into the repository outside
`docs/design/`.

---

# PART ONE — FALLING FRONTIER

## 1. What it is

A hard-SF real-time strategy game in a single procedurally generated star system. Solo project
by **Todd D'Arcy** under Stutter Fox Studios, since grown to a small team (artist Aleksandre
Lortkipanidze joined 2023; a dedicated tech artist since). Unity. Published by Hooded Horse.
The pitch, unchanged since 2021, is that **intel and logistics decide wars, not fleet size** —
"a weaker force can raid supply lines and blockade colonies; a stronger one has to spread its
flotillas out rather than concentrate them."

The framing everybody reaches for is *The Expanse*, and it is the right one: fusion torches,
no shields, no orbital mechanics but a lot of hardware honesty, jump drives with gravity-well
exclusion zones you have to burn clear of on fusion power before you can use them.

The similarity to us is not superficial. Both games are about **hardware that is expensive,
individual, damaged in specific places, and repaired or rebuilt from what you can drag home.**
The divergence is scope: they command fleets and build infrastructure across a system; we
command exactly one hull and build nothing.

---

## 2. Ship design and modular construction

**What they have (from the wiki via search, and the 2022 ship-designer trailer coverage):**

- **Four military hull classes** — frigate, destroyer, cruiser, battlecruiser. Explicitly *no*
  battleships and *no* dedicated carriers, with an in-fiction reason ("too expensive to build
  during the colonisation of a new system"). Plus a civilian line — mining barges, construction
  ships, tenders, supply ships. Over 20 ship types total.
- **Two separate slot systems.** *External* components are weapons — railgun, pulse cannon,
  cannon, missiles, point defence, VLS, flak, mines — sized in four size classes, **CL1 to
  CL4**. *Internal* components are everything else: a mandatory **bridge**, a jump-drive
  enhancer (upgradeable for range and fuel consumption), hangars whose function depends on
  which specialisation you pick, electronic warfare, targeting modules.
- **Mass is the universal cost.** Every component added raises the ship's mass, which reduces
  jump range. There is no abstract "points" budget; the budget is physics.
- **Designs are templates.** You unlock chassis and components through research, then author
  *templates* which get built at shipyards. The design is a reusable artefact, not a one-off.
- **Modules change the silhouette.** The developer's framing of the designer is that changing
  internal and external modules "can also change the ship's silhouette," and turrets ship with
  distinct turret-base geometry rather than being decals on a slot.

**How the design communicates a role, visually.** This is the part worth copying verbatim, and
it comes straight out of the November 2025 diary:

> "We've developed a shared colour language for ships that helps visually communicate their
> function. **White generally indicates sensors, while orange marks maintenance or access
> points** such as hatches, bays, or missile tubes. You can see this across multiple hulls,
> creating a consistent logic that makes each ship readable at a glance."

And on faction identity:

> "Even though all ships originate from human factions, each group reflects its own cultural
> and design philosophy. The goal has been to make them feel like they were built by the same
> species but shaped by different histories and doctrines, similar to how real-world naval
> designs differ between nations while remaining recognisably human-made."

Implementation note from the same diary: faction colour is a **tint map layered over the
albedo**, so faction schemes and camo patterns cost no additional materials, and Titan's ships
share a single colour setup (the orange stripe) that can be reconfigured globally in the
scenario editor. Pirates get per-hull colour setups instead, which is why they read as
irregular.

---

## 3. The damage model

This is what Falling Frontier is known for, and the specification is genuinely detailed.

- **~20 hitboxes per ship.** Not one hull bar. The E3 hands-off preview put it plainly: ships
  "are made up of about 20 different hitboxes and can go down in a way that leaves them
  salvageable **depending on how you attack or defend yourself**." That sentence is our game's
  premise, written by somebody else, four years earlier.
- **Penetration, not just damage.** Weapons have a penetration chance. **Armour and the angle
  of impact can cause a shot to ricochet.** A shot that penetrates damages whatever component
  is behind the plate; a shot that does not, does not.
- **Component consequences are specific.** A hit on the engines limits movement. Destruction of
  the bridge kills the command crew and forces the crew to abandon ship.
- **Crew are a damage target.** Penetrating shots kill crew. Command crew — Admirals, Captains,
  Navigators, Engineers, Gunnery Sergeants, each with traits and upgrade trees — degrade the
  ship's performance in their own domain when killed. *(Out of scope for us by owner decision;
  noted so the comparison is honest, not as a proposal.)*
- **Ships break apart, revealing interiors.** From the November 2025 diary: ships "break apart
  revealing internal decks as they succumb to sustained weapons fire." Destruction is physics-
  driven — debris is pushed outward by the blast, "so every explosion looks slightly different
  depending on where the final hit lands," and a medium station can be torn open from an
  internal blast with debris scattering by impact direction.
- **Damage is visible on the surface over time, as a material layer.** Also from the diary:
  "Ship radiators now light up dynamically, **grime builds up over time through an animated
  mask**, and destroyed internals show **embers and heat fade** as ships break apart. These
  effects all run within the same shader."

**How it presents in play:** through the four-phase combat structure the March 2026 diary lays
out, which is the clearest thing the developer has written:

| Phase | Name | What is happening |
|---|---|---|
| 1 | Information Acquisition | Greatest distance. No enemies in visual range. Everything is a **LiDAR contact that becomes clearer as it approaches visual range**. The phase is about "attempting to understand more than your enemy." |
| 2 | The Long War | Missiles, rockets, VLS against CIWS. "The hope is to land one or two decisive shots that can take several vital systems or defences offline, crippling the enemy ship." Missiles follow decoys and get lost in asteroids. |
| 3 | Mid-Range Warfare | Manoeuvre based on your read of the area of operations. Second VLS salvo. Main battle guns come online and are inaccurate unless they are railguns. Asteroid clusters confuse enemy missiles. Electronic warfare disrupts missiles and targeting. |
| 4 | Looking Death in the Eye | "Broadsides and trying to manoeuvre your ships into the **blind spot** of your opponents" — while remembering that Ship B may have Ship A covered. "If you're in this close, you're not having a good day. Even if you win." |

And the closing thought, which is a design statement about variance:

> "Even if you were to play the exact same battle 10 times, you would never see exactly the
> same result. There's always an element of chance with every calculation."

**Repair and persistence.** Thinner sourcing here. What is established: **Way Stations** are
outposts that resupply *and repair* ships far from your main bases; **orbital refuelling
stations** service ships in orbit of friendly planets and must themselves be supplied; and
small parasite craft launched from hangars can perform repair on the parent ship and others
within a radius. The clear implication is that damage persists until you take the ship to
something that fixes it, and that where those somethings are is a strategic problem. I could
not source a per-component repair-cost model.

---

## 4. Salvage and logistics

**Salvage** is described consistently across four years but is not the centre of their design
the way it is the centre of ours:

- How a ship dies determines whether there is anything left. Attack pattern and defensive
  posture both feed this.
- Wrecks yield **materials and resources**, not modules-as-objects (no source describes cutting
  a named turret off a hulk and bolting it to your own ship).
- **Evacuated crew are an intel source.** There is a Search & Rescue mission type: recover your
  own officers floating in space, or capture enemy agents and interrogate them for intelligence.
  Salvage is therefore partly an *information* economy, not only a materials one.

**Logistics** is where they have gone deepest, and the key decision is stated flatly in the
Space Game Junkie interview:

> "All resources except for credits are **physicalised** … players' accessible resources no
> longer live as just a number in the top panel."

Concretely:
- Ships carry finite **ammunition, fuel and food**. Crews eat; a cut-off strike force starves.
- Every station owns **three cargo ships**, which jump between stations, despawn on arrival and
  transfer their cargo. Transports can be destroyed, "allowing for a planet or moon to be
  blockaded."
- **Supply ships** are player-controlled and carry food, munitions and supplies to fleets
  operating away from friendly territory.
- Fuel is **He3**, which ties the jump drive to the logistics network — and refuelling under
  fire is a hazard, because "any damage during transfer could ignite the He3 and destroy nearby
  vessels."
- The jump drive has a **gravity exclusion zone**: you must burn clear of a celestial body on
  fusion drives before you can jump. That single rule creates chokepoints without needing a map
  to have corridors.

---

## 5. Recon, intel and fog of war

This is the direct comparable to our Plot-and-Burn discovery layer, and it is richer than ours.

- **Probes** are the primary recon tool, used "in a variety of ways." Enemy probes create a
  genuine dilemma: destroy one and you extract intelligence but reveal your position; leave it
  and you stay exposed to whoever is reading it.
- **Recon stations** are built infrastructure. They **scan a defined angle**, with an explicit
  **tradeoff between arc width and range**. They can run **passive scans** that grant very
  limited information, or **active scans** that give better information and **give away your
  position**.
- **Scout ships** — the York frigate is the archetype: fast, lightly armoured, deliberately
  fragile.
- **Contacts resolve gradually.** A LiDAR return is not a binary "unknown → known." "The closer
  the object gets to visual range, the clearer it becomes." The screenshots in the March 2026
  diary show a destroyed vessel resolving through three stages as it enters visual range.
- **Terrain masks you.** You can hide behind a planet or moon, **mask your heat signature near
  a gas giant or a star**, and ambush from inside an asteroid field or a nebula. The environment
  is a sensor participant, not scenery.
- The map is procedurally generated per campaign, so recon is not memorisable.

The load-bearing idea: **looking is a two-sided transaction.** Every sensor action in the game
has a "what does this tell me" value and a "what does this tell them" cost, and there is always
a passive option that is worse at both.

---

## 6. Art direction

- **Grounded, naval, readable.** Ships read as built things with a shipyard's logic. The
  colour language (white = sensors, orange = access/maintenance) means a hull's *function* is
  legible before you have read a single label.
- **Scale is conveyed by furniture and by density,** not by fog. The environment art push has
  been on "rocky asteroids to shipping containers which all help create a sense of a lived in
  and populated world," stations "of various shapes and sizes," planets promoted from textured
  spheres to **full 3D geometry with ridges, mountains, craters and ravines**, and gas clouds
  moved from primitive volumetrics to **mesh-driven volumetrics** for non-spherical shapes.
- **Lighting is hard and single-sourced,** consistent with a system-local star; radiators are
  the main self-illumination and they respond to ship state.
- **The in-world ship UI** is explicitly designed so you can "view critical information without
  taking your eyes off the action" — labels and readouts anchored in the world, not in a panel.
- **Performance is treated as an art problem.** Material Property Blocks cut draw calls ~60% by
  batching different texture sets under one material, so ships, asteroids, containers and
  stations share a draw set. Tint maps give faction variety with no new materials.
- Music by **Scott Buckley**, explicitly aiming at the *Blade Runner 2049* register — "that
  balance between scale and intimacy."

---

## 7. What its community praises, and what it is criticised for

**Honest framing: there is no player community verdict, because there is no public build.**
Anything claiming to be a review of Falling Frontier's gameplay is not.

**Praised (press and wishlist behaviour):**
- The look. PC Gamer: "looks like *The Expanse* in a very good way." PCGamesN has covered it
  four separate times on visuals alone. It crossed a major wishlist milestone in 2024 on
  trailers.
- The premise — intel and logistics as the decisive axes rather than fleet composition.
- The ship designer, and the "every ship is a precious, expensive asset, not an expendable
  unit" stance.
- The commitment to a *simulated* rather than arcade combat model, and the willingness to
  rebuild it once to get there.

**Criticised:**
- **Five years of "coming soon."** Four public delays. This is the dominant sentiment in the
  community and it is entirely about schedule, not about design.
- **Communication.** Updates have historically gone to Discord rather than the Steam storefront,
  which the community reads as opacity. The Nov 2025 diary is explicitly an attempt to fix this
  ("just wanting to formalise an update as to the progress over the past couple of years").
- **Scope risk from a very small team.** A near-solo developer specified fleet RTS + procedural
  systems + ship designer + simulated damage + physicalised logistics + intel warfare + a
  three-act campaign + a scenario editor. The 2023 delay was partly personal (family health).
  The 2025 diary's own framing — "refining what is already there rather than adding more for the
  sake of it" — is the sound of a scope reckoning.
- **Uncertainty about whether the systems interlock in play.** Every one of those systems has
  been shown in isolation. Nobody outside the alpha has played them together.

**The lesson for us is the criticism, not the praise.** The specification is not the game. We
have the same failure mode available: `src/sim/meta/` alone is 3,100 lines of economy,
objectives, perks, codex and items that a player currently cannot see. Depth that has not been
surfaced is indistinguishable from depth that does not exist.

---

# PART TWO — DIRECT FEATURE COMPARISON AGAINST OUR CODE

Read against `src/sim/**` and `src/world/**` as they stand, not against our design docs.

## 8.1 Modular ship construction

| | Falling Frontier | Nadir Point (code) |
|---|---|---|
| Hulls | 4 military classes + civilians, 20+ types | **One** player hull. `src/game.js:297` "Salvager Cruiser". AI hulls exist via `sim/ai/roster.js` but are not player-buildable. |
| Slots | External weapon slots sized CL1–CL4, plus a separate internal bay | **Six hardpoints**, one axis: `HARDPOINTS = ['bow','dorsal','ventral','port','starboard','engine']` (`src/core/contracts.js:15`). No internal/external split. |
| Library | Unlocked by research; large | **24 modules** (`src/art/geometry/modules/{bow,dorsal,ventral,broadside,engine}.js`), 5 per hardpoint except engine's 4; port/starboard share a mirrored set (`refit.canInstall`). |
| Fit constraint | Mass → jump range | Tier gate per hardpoint (`hpDef.maxTier`, `refit.js`), plus `massLoad` against `REFERENCE_FIT_MASS = 1800` (`refit.js:10`) feeding propellant. Same idea, one less dimension. |
| Silhouette change | Claimed for internal + external modules | **Real and live.** `RefitSystem.install` calls `attachment.attachModule` in the same call as the stat change; the doc comment demands "change the 3D model live, with no hitch." Verified in the module geometry files (each is 60–100 lines of built geometry, not a decal). |
| Design as artefact | Named, saved, reusable templates | **None.** There is no saved fit, no loadout name, no comparison view. `src/sim/meta/patterns.js` stores *rebuild patterns for individual modules*, which is a different thing. |
| Where you may refit | Shipyards | **Anywhere, instantly, for free.** `RefitSystem.install` has no location check and no time cost (`installTime = 2.5` is declared and never consumed by `install`). |

## 8.2 Damage model

| | Falling Frontier | Nadir Point (code) |
|---|---|---|
| Granularity | ~20 hitboxes per ship | Subsystems + 3 plating runs as salvage sections (`ship._buildSections`), **plus 2–4 sub-parts per weapon mount** (`sim/subparts.js`). A five-mount cruiser carries ~20 independently destroyable things. **Comparable granularity.** |
| Failure semantics | Engines → mobility; bridge → abandon ship; component → performance | **More specific than theirs.** `PART_KINDS = ['output','feed','traverse','cooling','mount']`, each with a named consequence: inert / rate −65% / arc frozen / cooks in half the time / **module falls off intact** (`subparts.js`, `PART_CONSEQUENCE`). |
| Armour interaction | Penetration chance; **angle of impact causes ricochet** | **Nothing.** No armour value, no penetration roll, no angle term anywhere in `sim/combat.js`. Damage is `accuracy` roll → nearest part → overflow. This is a real, named gap. |
| Persistence | Persists to a Way Station or a repair tender | Persists as `condition` 0..1 per section and per mount, restored by a **materials-costed repair queue** (`refit.js`, `repairRate = 0.035`/s, one job at a time, `SERVICE_HEAT = 0.35` blocks work on a hot mount). Persistence model is **stronger than theirs**; the *place* constraint is absent. |
| Death | Break-apart revealing internal decks; physics-driven debris; embers and heat fade | Wreck body with tumble (`salvage.js`), scorch decals (`vfx/damage.js`), pooled instanced debris (`vfx/explosions.js`), soot in the hull shader (`art/materials/hullShader.js`). **No break-apart, no revealed interior, no ember/heat-fade pass.** |
| Surface aging | **Grime accumulates over time via an animated mask** | Soot exists as a static shader term (`hullShader.js:345 soot: 0.85`) with no time evolution. |

## 8.3 Salvage

| | Falling Frontier | Nadir Point (code) |
|---|---|---|
| What a wreck yields | Materials, resources, and crew-as-intel | **Parts as objects.** `WreckSection.moduleId` — the cannon bank you cut off is the same object that goes on your hull (`salvage.js`). |
| Quality model | "Can go down salvageable depending on how you attack" — binary-ish | **Per-section condition, one number, whole chain.** `sim/condition.js` — shot at → cut free → stowed → installed → shot at again → repaired, same number. Reactor kill floors it (`ship.js:722`, `salvageIntegrity → 0.15`). |
| The cut itself | Not described as an action | A real verb with a real decision: `cutMode` clean vs fast (1.75× speed, −0.12 condition), **residual wreck heat that cooks what you cut** and decays over 90 s (`Wreck.residualHeat`, `heatDecay = 1/90`), and `coolIn` published so waiting is arithmetic. |
| Recovery of your own losses | — | **Symmetric.** Kill a mount pad and the module detaches *intact* and floats — on the player's ship too (`ship._detachMount` → `salvage.spawnDetachedModule`). You can lose a gun and go and pick it up. |
| Ammunition | Ships carry finite rounds | Magazines are cuttable wreck sections (`ammoSalvage`, `AMMO_SPEC[cls].salvagePer`), so a dry gun is a reason to open a specific *kind* of hull. |
| Intel from salvage | Crew interrogation | **One wreck in three yields a fix on 1–2 unvisited POIs** (`discovery._rollIntel`, `p = 0.34`). Our exploration layer *is* our salvage layer. |

## 8.4 Recon, intel, fog of war

| | Falling Frontier | Nadir Point (`src/world/discovery.js`) |
|---|---|---|
| Passive | Recon-station passive scans, limited info | Passive contact: anything within `sensorRange()` resolves fully, once per second. |
| Active | Recon station active scan, arc width ⇄ range tradeoff, reveals your position | **Directional sweep**: 35° cone, 300 km, 30 s, needs 3 sensor pips, **triples your signature** and spikes patrol heat at every POI in range every 6 s (`SURVEY`). Same two-sided transaction, one instance of it. |
| Deployables | **Probes**; enemy probes you can kill for intel at the cost of exposure | **None.** No probe, no drop, no persistent watch post. |
| Contact resolution | **Gradual** — a LiDAR return sharpens as it nears visual range | **Binary.** `blips` (bearing, rough mass, rough range) → `known` (everything). There is no middle state and no way to sharpen a blip except to go there. |
| Terrain as sensor | Hide behind a moon; **mask heat near a gas giant or star**; ambush from asteroid fields and nebulae | **Nothing.** Nebulae, gas giants and asteroid fields exist as geometry (`src/world/celestials/`, `src/world/fields/`) and have **zero** sensor effect. `signatureMultiplier` reads only survey state. |
| Being detected | Enemy is continuously seeking intel; your emissions are their input | **Asymmetric.** Your signature feeds only the transit-interception roll (`travel.js:_rollRisk`, `heat × heatK × signature`). No enemy sensor entity exists; nothing hunts a contact it acquired. |
| Scale of the unknown | Procedural system, per campaign | 14 hand-authored POIs (`world/system.js`), start state = 1 known + 2 blips. Smaller but **denser**, which is the correct trade at our scope. |

## 8.5 Logistics and economy

| | Falling Frontier | Nadir Point |
|---|---|---|
| Consumables | Ammo, fuel, food — all physicalised | Ammo (5 classes, `stores.js AMMO_SPEC`), reactor charge, propellant. No food (correct — food without crew is a stat). |
| Fuel | He3 in a supply network; hazardous to transfer under fire | Propellant, 0.8/km (0.5 silent), **40-unit reserve floor enforced at plot time** so a course that strands you is rejected with a reason (`travel.js`). Better failure ergonomics than most games manage. |
| Resupply points | Way stations, orbital refuelling, supply ships, per-station cargo runs | **NONE.** `travel.refuel(amount)` exists at `travel.js:671` and **is called by nobody.** Four `station` and two `yard` POIs exist in `world/system.js` with written blurbs and no interaction. |
| Refining / crafting | Refineries as infrastructure | `sim/meta/materials.js`: 3 scrap grades → 4 refined pools, ~6:1 volume compression, lossy, FIFO queue. Good, and self-contained on the ship. |
| Hold | Cargo capacity per ship | **Volume in m³** (`meta/cargo.js`), with per-class densities so a reactor stows terribly and armour stows well. Genuinely better than a slot count. |
| Sink | Construction, upkeep, fleet | Repairs, module rebuilds from patterns, item fabrication, ammunition fabrication, hull perks — all drawing the same four pools (`meta/perks.js`, `meta/items.js`, `meta/patterns.js`). **No market, by design.** |

## 8.6 The strategic layer

Ours is not a fleet RTS, so most of Falling Frontier's strategic layer is out of scope by
decision, not by omission. What we do have is `src/world/factionWar.js` — per-POI control
(−1..+1), patrol heat (0..1), per-faction garrison strength in the same units the fleet AI
uses, and **battles that are scheduled with a warning period and resolve whether or not you are
there** (real ships if present, one arithmetic step if absent, identical persistent
consequences either way). That is a genuinely good system and Falling Frontier does not have an
equivalent, because in their game the war *is* the player.

---

# PART THREE — WHERE THEY ARE BETTER THAN US

Stated plainly, with the fix.

### 3.1 Armour, penetration and impact angle — they have a real ballistic model; we have none

Falling Frontier: penetration chance per weapon, armour value, **and angle of impact causing
ricochet.** Ours: `combat.js` rolls accuracy, finds the nearest sub-part, applies damage,
overflows the remainder. Nothing about *where the shot came from* matters.

This is not a cosmetic gap. It removes an entire manoeuvring axis. We already have the hardest
prerequisite — 1.4 km ships that take seconds to turn, and weapons whose arcs are a property of
where they physically sit — and we do not cash it in. In Falling Frontier, approaching a
destroyer bow-on is a different problem from approaching it abeam, and it should be here too.
**Copy it.**

### 3.2 Contacts resolve gradually; ours snap

"The closer the object gets to visual range, the clearer it becomes" — with three screenshots of
a wreck resolving through stages. Ours: `blips` → `known`, instantly, with nothing in between.
A blip carries bearing, rough mass and rough range and then a POI is *fully* named the moment
you are within `sensorRange()`.

A gradual resolve is the difference between a fog-of-war *system* and a fog-of-war *flag*, and
it costs almost nothing: a `resolution` float per contact that decays your error bars on mass,
class and position, driven by range, by time observed and by sensor pips. **Copy it.**

### 3.3 The environment participates in sensors; ours is scenery

Hide behind a moon. Mask your heat near a gas giant or a star. Ambush from a nebula or an
asteroid field. We have all four objects already built and lit, at high quality
(`src/world/celestials/gasgiant.js` alone is 714 lines), and **not one of them changes a single
number in `discovery.js` or `factionWar.js`.**

This is the highest ratio of gameplay-gained to work-required in this entire document. A nebula
that halves your signature and halves your sensor range converts an existing art asset into a
tactical decision, permanently. **Copy it.**

### 3.4 Deployable probes — a sensor you can spend

A probe is a *thing you buy with a resource to see with*, and it makes looking a logistics
problem instead of a button. Our sweep is good but it is the only active verb we have, and it
is free apart from the exposure. Their probe dilemma — kill an enemy probe for intel and reveal
yourself, or leave it and stay watched — is a whole decision we do not have anywhere.

We have the pieces: an item registry (`meta/items.js`), a materials economy, and heat. A
fabricable one-shot probe that flies a bearing and reports contacts fits in the existing item
system with no new architecture.

### 3.5 Places that service ships

Way stations, orbital refuelling, repair tenders. We have `travel.refuel()` **called by nobody**
and six station/yard POIs you cannot interact with. Meanwhile repair, refit, refining and
fabrication all work anywhere, instantly, forever.

That is not merely a missing feature; it is the reason our world has no *shape*. A game where
every service is available everywhere has no reason for you to go anywhere. See §5.2.

### 3.6 A shared, enforced visual colour language

White = sensors. Orange = maintenance and access. Applied across every hull, so function is
readable before you read a label. Our `docs/design/visual-direction.md` argues correctly for one
palette temperature per frame, but there is no *semantic* colour rule that says what a colour
**means** on a hull. With 24 modules that must read at tactical zoom, this is the cheapest
legibility win available. **Copy it, exactly, including the two colours.**

### 3.7 Break-apart death revealing internal structure

"Ships break apart revealing internal decks as they succumb to sustained weapons fire," with
physics-driven debris whose scatter depends on where the final hit landed. Our death is a wreck
body plus pooled debris instances. In a game whose *entire subject* is what is inside a hull,
the moment the hull opens is the thematic centre, and we do not have it. Our own audit already
ranks the capital-ship death rebuild in its top ten; Falling Frontier says what "better" means
concretely — **the interior must be revealed, and the break must be a consequence of the final
hit's location.**

### 3.8 Grime that accumulates over time

An animated mask, in the same shader as everything else. We have soot as a constant. A hull that
gets visibly filthier the longer it goes without a refit is free narrative and free feedback,
and it makes the (currently missing) service stop feel like relief.

### 3.9 Templates and named designs

Their fit is an artefact you name, save, compare and rebuild. Ours is whatever happens to be
bolted on right now, with no memory. `meta/patterns.js` remembers how to rebuild *one module*;
nothing remembers a *ship*. For a game about assembling a hull out of other people's hardware,
not being able to name and re-create a configuration is a strange omission.

### 3.10 They have said what their game is about in one sentence, repeatedly, for five years

"Intel and logistics decide wars." Every system traces back to it. Our design documents total
over 350 KB and the closest we have to that sentence is spread across four files. This is not a
code problem, and it is still a real advantage they hold.

---

# PART FOUR — WHERE WE ARE GENUINELY BETTER OR MORE INTERESTING

Not flattery; each of these is checkable in the code.

### 4.1 Salvage yields *the object*, not a resource — and this is the whole game

Falling Frontier's wrecks yield materials and resources. Ours yield **the cannon bank**, which
is the same object on the wreck, in the hold, and on your hull, carrying the same condition
number the whole way (`condition.js`, `salvage.js`, `refit.js`). Falling Frontier's salvage is
an *economy*. Ours is a *shopping mechanic that reaches backwards into how you fight*. That is
a better idea and it is ours.

### 4.2 The mount-pad kill: shooting the upgrade off someone

`PART_CONSEQUENCE.mount = 'MODULE DETACHES INTACT'`. Destroy a mount pad and the module comes
off the hull whole, becomes a `DetachedModule` floating in space, and you go and collect it.
Nothing in Falling Frontier, or in any of the roguelikes below, does this. It converts subsystem
targeting from a damage optimisation into a *procurement decision made mid-firefight*, and it is
symmetric — the player's own guns come off the same way and can be recovered.

If this game has one signature mechanic, this is it, and it is already implemented.

### 4.3 One condition number, end to end

Falling Frontier has damage states and salvageability. We have a **single 0..1 that survives the
entire chain** and that multiplies values other systems already read: rate of fire, traverse
rate, muzzle energy, misfeed chance (rolled per burst, not per shot — a deliberate, correct
correction of the naive design), cooling rate, passive grants, repair cost with a **surcharge
below 0.35** so that reviving a nearly-dead part is deliberately the wrong call sometimes.

The surcharge is the good part. It is the line that makes "repair or scrap" a genuine decision
instead of an accounting formality.

### 4.4 The cut is a decision, not a wait

Falling Frontier does not describe salvage as an activity at all. Ours has: residual wreck heat
that cooks what you are cutting and decays over 90 seconds; a clean/fast cut mode with published
per-second burn rate and a projected outcome (`cutStatus()` returns `projected`); a `coolIn`
timer so waiting is arithmetic; and reasons to leave (a second hostile, a scheduled battle, a
plotted course) that argue against waiting. **The reward is a bet you can compute.**

### 4.5 The war runs without you and pays out differently depending on when you arrive

`world/factionWar.js` schedules battles with a warning period, resolves them for real if you are
present and arithmetically if you are not, and leaves the *same* persistent consequences either
way. `meta/objectives.js` then prices arrival: **1.75× ahead of it, 1.25× under fire, 0.55× cold
field.** Falling Frontier's war is the player's war; there is no version of "arrive during
somebody else's battle" in it. Ours is a genuinely different fantasy and the code supports it.

### 4.6 Volume, not slots

`meta/cargo.js` measures the hold in cubic metres with per-class densities — a reactor stows at
1.00 m³/t, armour at 0.22. "Cut everything" becomes "what do I leave behind." Slot counts cannot
produce that decision. Falling Frontier does not appear to have this.

### 4.7 Progression is knowledge, and it is wired

`meta/codex.js` tracks five monotonic discovery states per entry (unknown → seen → scanned →
salvaged → installed), and `meta/perks.js` **gates perk availability on codex counts**. So "the
player's power curve is what they know" is a mechanical claim, not a slogan. Falling Frontier
uses conventional research trees.

### 4.8 Sub-part consequences are more specific than component damage

"A hit at the engines limits the ship's ability to move" versus barrels/feed/traverse/cooling/
mount with five distinct, named, published consequences — each of which is a *different tactical
answer* to the same enemy. Wanting the gun? Kill the pad. Wanting to survive the next 30
seconds? Kill the feed. Wanting it to stop tracking you while you close? Kill the ring.

### 4.9 Plot-and-Burn is physical, and the risk is priced before you commit

Falling Frontier's jump drive is a jump: exclusion zones, then a conduit, then arrival. Ours is
a **four-phase burn in the same coordinate space as everything else** — turn, 25 s spool with
weapons offline and shields at a quarter *because the reactor is on the drive*, burn, symmetric
brake — with a closed-form profile (`legProfile`) that reproduces our own spec table, and an
interception percentage sampled at nine points along the leg and **drawn on the course before
you commit.** Being intercepted is always something you agreed to. That is better travel design
than a jump drive, and it is done.

### 4.10 We shipped a headless harness

`src/sim/meta/harness.js` builds a real `World`, a real `Engine`, real registered modules and a
real faction war, and prints numbers that came out of the simulation rather than out of a
comment. Falling Frontier's public evidence is trailers.

---

# PART FIVE — ROGUE SPACE, THE SPACE-ROGUELIKE SHELF, AND THE RUN QUESTION

## 5.1 What is actually on the shelf

**There is no significant game called "Rogue Space."** The nearest title is **Slipstream: Rogue
Space** (2024, Very Positive, ~144 reviews), and it must be reported honestly: it is an
asymmetric co-op party game — one Captain, a crew of up to 100+ players operating stations,
cute animals, cross-platform, built for streamers. Randomly generated maps, per-run tech bought
with gems at an Engineering Station, permanent XP into a character skill tree between runs. It
is an Artemis-descendant, not a design ancestor of ours. **Almost nothing in it transfers.**

The shelf that *does* matter:

| Game | Run shape | What persists | The idea worth stealing |
|---|---|---|---|
| **FTL** | Sector-by-sector jump chain to a fixed final boss | Nothing but unlocks and knowledge | **The Rebel Fleet.** An advancing red tide that makes *lingering* the expensive choice. Nebula beacons halve its advance — you can *buy* time, at a cost. |
| **Everspace (1)** | Short intense runs, permadeath, procedural sectors | Ship-class upgrade currency | Death as the loop's engine: "constant flow of high tension" and breakthroughs that feel earned. |
| **Everspace 2** | Open world, 30 h campaign, **no permadeath, no procgen** | Everything | The counter-example. It is a better *game* for more people and it explicitly gave up the tension that made the first one distinctive. **That trade is exactly the trade we have made.** |
| **Void Bastards** | Ship-by-ship raids from a strategic map | Unlocks, most equipment, most salvage — you lose ammo, fuel, food and the current body | Death that costs a *consumable ledger* rather than a *career*. Oxygen as the per-raid clock. |
| **Hardspace: Shipbreaker** | **15-minute shifts**, no permadeath, persistent debt | Everything, including the debt | **The single most transferable structure on this list.** See §5.2. |

## 5.2 The interesting question: what does a run *produce*, and how do we get it without runs?

Our design has no permadeath and no runs. So the question is what a run *manufactures* that a
persistent world does not, and how each of those things can be manufactured another way. There
are six.

---

### Product 1 — A bounded session with a shape

A run has an opening, an escalation, a climax and a resolution, and the player can feel where
they are in it. A persistent world is a flat line: every hour looks like every other hour.

**How to get it without runs: the SORTIE, and Hardspace: Shipbreaker is the proof it works.**
Shipbreaker has no permadeath, no procedural runs, and full persistence, and it still produces
run-shaped sessions — because a shift has a **hard boundary** (15 minutes), a **consumable that
forces you home** (oxygen and fuel, both of which you buy on credit), and a **debrief that
prices what you did** (profit minus overhead, applied to your debt, with interest).

We already own both clocks and have not made either of them bind:

- **Propellant.** `travel.js` — 0.8 units/km, 40-unit reserve floor, and `refuel()` at
  `travel.js:671` is *called by nobody*. Propellant is currently a one-way ratchet toward
  immobility, which means it is not a clock, it is a bug.
- **Hold volume.** `meta/cargo.js` — real, well-designed, and it fills. When it is full, you
  either stop cutting or start throwing things away.

The missing third piece is **somewhere to go back to.** Wire `refuel()` to the four station and
two yard POIs that already exist in `world/system.js`, and a sortie becomes: burn out with a
full tank and an empty hold, work until one of them runs out, burn home. That is a session with
a shape, produced entirely by two systems we already built and one call we never made.

**And add the debrief.** Roguelikes get a disproportionate share of their felt progression from
the post-run summary screen. Ours costs nothing to compute: sections cut, mean condition, best
part recovered, materials in, materials spent on repair, propellant burned, heat generated,
codex entries advanced. Print it on docking.

---

### Product 2 — Pressure from a clock you cannot outrun

FTL's Rebel Fleet is the canonical version. It is not a difficulty curve; it is a *reason not to
farm*. Every beacon you linger at costs you the next one. Crucially you can spend to slow it
(nebula beacons halve the advance), so the pressure is negotiable rather than merely punishing.

**We currently have the opposite of pressure.** `factionWar.js` runs a war that advances, but
nothing in it **converges on the player.** Reputation at or below `picketRep = -40` starts
running pickets, and that is the entire pursuit model.

**How to get it without runs: make the pursuit a consequence of your take, not of the clock.**
A salvage ledger per faction: cutting Coalition hulls in Coalition-controlled space accrues a
claim. At thresholds, the response escalates — a tender arrives to contest the field, then a
picket, then a hunter-killer that *plots to your position*. It decays if you work elsewhere or
if you leave value on the field.

This is better than FTL's timer for our game, for three reasons: it is **earned rather than
imposed**, so it never punishes the cautious player; it is **spatially negotiable**, so moving
to the other faction's space is a real strategy; and it makes the scavenger fantasy land — you
are stealing, and eventually somebody notices. The pieces exist: `war.bumpHeat`,
`war.adjustReputation`, `travel._rollRisk`. What is missing is the ledger and the escalation
table.

---

### Product 3 — Enforced scarcity and irreversible commitment

In a run you build with what you were *offered*. You cannot go back for the other weapon. That
is what makes a build feel like a build rather than a shopping list.

**We are maximally reversible.** `RefitSystem.install` and `uninstall` are free, instant,
available anywhere, and lossless — a module goes back into the hold in the condition it came off
in. There is no such thing as committing to a fit, so there is no such thing as a fit.

**How to get commitment without runs — three changes, in ascending order of severity:**

1. **Make refit take time and materials.** `installTime = 2.5` is declared in `refit.js:51` and
   never consumed. Route install and uninstall through the existing repair queue. Now swapping
   guns mid-field costs you the thing you cannot get back.
2. **Make removal lossy.** Uninstalling a mounted module costs condition (cutting bolts you
   welded) unless you are docked or carrying the Field Dock (`ventral_repair_bay`, which is
   already in the library). Swapping is now a real decision instead of a menu.
3. **Gate heavy refit on a place.** Hardpoint-structure repair and tier-3 installs require a
   yard or the Field Dock. This is FTL's "you cannot upgrade between jumps" without a run, and
   it simultaneously fixes Product 1 by giving the sortie a destination.

Note that (3) creates a genuine, elegant tension with our own economy: the Field Dock occupies a
ventral hardpoint that could hold cargo pods, a hangar deck, a drone bay or the salvage tractor.
**Autonomy costs a slot.** That is the good kind of scarcity and it needs no new systems.

---

### Product 4 — Stakes: something you can lose

Everspace 1 → 2 is the cleanest natural experiment in this genre: the same studio removed
permadeath and procedural generation, made a better and much more popular game, and openly gave
up "the constant flow of high tension" that made the original distinctive. **That is our trade,
and we should be honest that we made it.**

But permadeath is not the only way to have stakes; it is the crudest. Void Bastards is the model
— death costs you a *consumable ledger* (ammo, fuel, food, current body) and leaves your career
intact.

**We already have a better version of this than Void Bastards does, and have not framed it as
one.** `ship._detachMount` → `salvage.spawnDetachedModule` applies to the player. Shoot the pad
off *our* cannon bank and it comes off intact and floats there, recoverable — under fire, on a
propellant budget, while whatever shot it off is still shooting. That is loss with a *recovery
verb attached*, which is strictly more interesting than loss with a restart attached.

What is missing is everything downstream of it:
- `SHIP_DESTROYED` for the player is consumed by UI toasts, VFX, audio and the war's reputation
  hook, and **not one of them handles the player case.** The player becomes `dead: true` and the
  game keeps running around a corpse.
- There is **no `localStorage` anywhere in `src/`**. Nothing persists across a page reload. A
  persistent-hull game with no save is not a persistent-hull game.

The design answer that fits our fiction is **crippling, not death**: player hull at zero =
reactor scrammed, drive dead, weapons dark, drifting. You lose the hold, you lose modules from
breached hardpoints (they detach intact and stay at the site), and you are recovered to the
nearest friendly anchorage with a repair bill. The *place* keeps your gear. Going back for it is
a sortie. **That is a roguelike's loss, a persistent world's continuity, and one more reason to
travel — all from one death handler.**

---

### Product 5 — Variance: the world reshuffles so you cannot converge

Runs re-randomise, which stops the player settling on one optimum and stops the designer having
to balance for a solved state. Falling Frontier reaches for the same thing without runs, in two
ways: a procedurally generated star system per campaign, and randomness *inside* combat
resolution — "even if you were to play the exact same battle 10 times, you would never see
exactly the same result."

Our scope decision forbids procedural multi-system generation (correctly). So our variance has
to come from **what the war does**, and it partly already does: `factionWar.js` schedules
battles stochastically, control drifts, heat rises and decays, and `objectives.js` reads that
state into up to four expiring offers with per-kind caps so the panel cannot silt up.

**What is missing is variance in the *hardware you are offered*.** FTL's shops are the real
variance engine — you build around what you were shown. Our wreck contents are generated by
`Wreck._buildSections`, which matches a **random** module of the right faction and role
(`rng.pick(candidates)`). That is variance without *curation*: it means you cannot ever aim at a
specific thing, which is the opposite failure from convergence.

The fix is small and it is a weighting, not a system: bias wreck module selection toward entries
whose codex state is `unknown` or `seen` (`meta/codex.js` already tracks exactly this). Now the
world reliably shows you things you do not own, the codex becomes a *want list*, and a
destroyer sighted at a POI is a specific reason to go there. **This is FTL's shop, expressed as
an enemy fleet.**

---

### Product 6 — Knowledge as the real progression

The deepest thing runs produce: since your stuff resets, the only thing that accumulates is what
*you* know, and mastery becomes the actual progression curve.

**This one we have already solved, and better than the roguelikes do.** `meta/codex.js` makes
knowledge an explicit, monotonic, five-state per-entry record, and `meta/perks.js` gates
purchases on codex counts, so knowing more literally unlocks more. No reset required. Keep it,
surface it, and make the codex the screen a player opens between sorties.

---

## 5.3 The summary answer

A run manufactures six things. We can have five of them without a run:

| Product of a run | Our replacement | Status in code |
|---|---|---|
| 1. Bounded session with a shape | The **sortie**: propellant out, hold full, burn home, debrief | Both clocks built; **`refuel()` never called**; no debrief |
| 2. Inescapable pressure | **Salvage ledger → escalating faction response** | `bumpHeat`, `adjustReputation`, `_rollRisk` exist; no ledger, no escalation table |
| 3. Irreversible commitment | **Refit costs time, removal costs condition, heavy refit needs a place** | `installTime` declared and unused; no location gate |
| 4. Stakes | **Crippling, not death.** Modules detach intact and stay where you lost them | Detach is built *and symmetric*; **no player death handler, no save** |
| 5. Variance | **Curated wreck contents biased to what the codex has not seen** | Wreck module pick is uniform-random; codex already tracks the right state |
| 6. Knowledge as progression | **The codex, gating perks** | **Done, and better than theirs** |

The sixth is done. The other five are, in every case, *a small number of lines connecting systems
that already exist.* That is the finding: our run-structure gap is not a missing feature, it is
missing **wiring** between features we have already paid for.

---

# PART SIX — PRIORITISED: WHAT TO TAKE, FROM WHICH

Ordered by (gameplay produced) ÷ (work required). Every item checked against
`docs/design/scope-decision.md`. Nothing here needs crew, officers, trading, base building,
fleets or procedural generation.

## Tier 1 — Do these first. Highest ratio in the document.

**1. Wire `travel.refuel()` to the station and yard POIs, and make docking a real stop.**
*(from Falling Frontier's Way Stations; from Hardspace's hab)*
Six POIs already exist with written blurbs. Docking gives: refuel, discounted repair, refine the
scrap backlog, and a **debrief**. This single change creates the sortie, gives propellant a
purpose other than attrition, gives the map a topology, and produces a session shape — all from
systems already built. *Blocks nothing; unblocks items 2, 5 and 9.*

**2. Nebulae, gas giants and asteroid fields must change sensor numbers.**
*(from Falling Frontier's terrain masking)*
Signature multiplier and sensor range modifiers per field type, read by `discovery.js` and
`travel._rollRisk`. `src/world/celestials/` and `src/world/fields/` are ~2,600 lines of finished
art contributing zero to gameplay. A nebula that halves both your signature and your sensor
range makes "run the course through the nebula" a real plan.

**3. Bias wreck module selection toward `unknown` / `seen` codex entries.**
*(FTL's shop, via our own codex)*
A weighting in `Wreck._buildSections`. Turns the codex into a want list, makes reconnaissance
purposeful, and stops the 24-module library feeling like a slot machine. **Est. 20 lines.**

**4. Adopt the semantic hull colour rule: white = sensors, orange = access/maintenance.**
*(copy verbatim from Falling Frontier)*
Applied across all 24 modules and both faction hull sets. Cheapest legibility win available at
tactical zoom, and it is orthogonal to the palette-temperature work in
`docs/design/visual-direction.md` rather than in conflict with it.

**5. Handle player death as crippling, and add `localStorage` persistence.**
Reactor scram, drive dead, drifting; hold lost; breached hardpoints drop their modules **intact,
at the site**; recovery to the nearest anchorage with a bill. Going back for your own guns is a
sortie. Requires item 1. Also: **there is no save in this project at all**, which is not
survivable for a persistent-hull design.

## Tier 2 — Substantial gameplay, moderate work

**6. Armour, penetration and impact angle.**
*(copy from Falling Frontier)*
Per-section armour value; per-weapon penetration; **incidence angle → ricochet chance**. Cashes
in the manoeuvring layer we already built and paid for. It also feeds salvage directly: a
glancing hit that ricochets does not degrade the section behind it, so *approach geometry
becomes a salvage-quality decision.* That interlock is worth more than the ballistics.

**7. Gradual contact resolution.**
*(copy from Falling Frontier)*
A `resolution` 0..1 per contact, improved by range, dwell time and sensor pips; error bars on
mass, class and bearing that visibly tighten. Replaces our binary blip→known. Makes the sweep
worth repeating and makes sitting still and watching a legitimate tactic.

**8. Refit commitment: consume `installTime`, make removal lossy, gate heavy refit on a place.**
Three small changes in `refit.js`, in that order of severity. Creates build commitment without a
run, and makes the Field Dock a real strategic choice against the other four ventral modules.

**9. The salvage ledger and escalating faction response.**
*(FTL's Rebel Fleet, earned rather than imposed)*
Per-faction claim accrued by cutting their hulls in their space; thresholds escalate tender →
picket → hunter that plots to you; decays with distance and time. Pressure that is negotiable,
spatial, and thematically exact.

**10. Deployable probes as fabricable items.**
*(from Falling Frontier)*
Fits the existing `meta/items.js` registry with no new architecture: a one-shot that flies a
bearing and reports contacts. Then the counterpart — enemy probes you may destroy for intel at
the cost of exposure, which is one of the best single decisions in their design.

## Tier 3 — Real gains, larger work, do after Tier 1–2

**11. Break-apart death revealing interior structure.**
*(from Falling Frontier)*
The break should be a consequence of the final hit's location, with debris pushed outward by the
blast. In a game about what is inside a hull, this is the thematic centre. Already in our own
audit's top ten; Falling Frontier supplies the specification.

**12. Accumulating grime as an animated shader mask.**
*(copy from Falling Frontier)*
`hullShader.js` already has a soot term; make it a function of time-since-service. Free
narrative, and it gives docking an emotional payoff.

**13. Named, saved ship templates.**
*(from Falling Frontier's designer)*
Name a fit, save it, compare two, rebuild toward one as a goal. Makes the 24-module library feel
like a design space instead of an inventory.

**14. The sortie debrief screen.**
*(from every roguelike's post-run summary)*
In on docking. All the numbers already exist; nothing is computed that is not already tracked.

## Explicitly NOT taking

- **Crew, officers, command-crew traits, crew casualties, search-and-rescue of officers,
  interrogating captured crew.** Excluded by the owner. Falling Frontier gets a lot of texture
  from these and we will get none of it; that is a decision, not an oversight. Where their
  design uses crew as the mechanism (bridge kill → abandon ship), our equivalent is the reactor
  scram and the sub-part consequence table, which already carries the load.
- **Physicalised inter-station supply chains, cargo ship networks, blockades.** Requires
  infrastructure and fleets. Out.
- **Research trees unlocking hulls and components.** Our progression is the codex plus hull
  perks, which is a deliberately different and better-fitting answer.
- **Procedural system generation.** Out by scope. One deeply built system.
- **A market, prices, or anything to sell to.** Out. Materials are a sink.
- **Slipstream: Rogue Space's co-op crew stations.** Multiplayer, out, and not a fit besides.

---

## Sources

**Falling Frontier — primary (full text via the Steam news API, appid 1280190):**
- Dev Update: Combat Overview, 2026-03-09 — the four-phase combat model, LiDAR contacts,
  electronic warfare, decoys, blind spots, combat variance.
- Update – Systems Coming Together, 2025-11-05 — colour language, tint maps, Material Property
  Blocks, dynamic radiators, animated grime mask, embers and heat fade, break-apart internal
  decks, physics-driven destruction, 3D planets, mesh volumetrics, the De Vaar jump drive, He3
  and refuelling hazard, Scott Buckley's score, the 2026 delay.
- Delay announcements 2021-11-19, 2022-05-25, 2022-09-30, 2023-11-28; ship reveal 2023-02-28;
  scenario editor and campaign reveals 2021-06-13/15.

**Falling Frontier — secondary:**
- [Steam store page](https://store.steampowered.com/app/1280190/Falling_Frontier/) (403 to
  automated fetch; reached via search summaries)
- [Official wiki](https://wiki.hoodedhorse.com/Falling_Frontier/Falling_Frontier_Official_Wiki)
  — Scouting, Logistics, Ship Components, Ships, Combat (Cloudflare-blocked; reached via search
  summaries)
- [Falling Frontier Q&A — Space Game Junkie](https://www.spacegamejunkie.com/interviews/falling-frontier-qa-logistical-rts-goodness/)
  — physicalised resources, chassis-as-blank-slate
- [E3 first impressions — KTSA](https://www.ktsa.com/e3-first-impressions-falling-frontier-focuses-on-recon-and-resource-management/)
  — ~20 hitboxes, probe dilemma, terrain masking, salvage-by-attack-pattern
- [Four-phase combat — GameWatcher](https://www.gamewatcher.com/sci-fi-rts-falling-frontier-details-four-phase-combat-system-developer-diary)
- [Ship designer — PCGamesN](https://www.pcgamesn.com/falling-frontier/ship-builder)
- [New combat mechanics and ships — Worthplaying](https://worthplaying.com/article/2023/5/29/news/137444-falling-frontier-shows-off-new-combat-mechanics-and-ships-screens-trailer/)
- [Delayed to 2026 — TheSixthAxis](https://www.thesixthaxis.com/2025/11/05/falling-frontier-has-been-delayed-to-2026/)
- [New trailer — PC Gamer](https://www.pcgamer.com/games/rts/falling-frontiers-new-trailer-makes-me-want-to-hibernate-until-the-rts-appears-in-2025/)

**Roguelike shelf:**
- [Slipstream: Rogue Space — Steam](https://store.steampowered.com/app/2765860/Slipstream_Rogue_Space/)
  and [crew guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3267435001)
- [Rebel Fleet — FTL wiki](https://ftl.fandom.com/wiki/Rebel_Fleet)
- [FTL designer review — Game Design Strategies](https://gamedesignstrategies.wordpress.com/2012/09/29/ftl-faster-than-light-designer-review/)
- [Everspace: from roguelike to complete space RPG — AllKeyShop](https://www.allkeyshop.com/blog/pixel-sundays-everspace-news-k/)
- [Everspace 2 review — But Why Tho](https://butwhytho.net/2023/04/review-everspace-2-adapts-and-transforms-pc/)
- [Void Bastards — Game Wisdom](https://game-wisdom.com/analysis/void-bastards-game-caught-two-masters)
  and [Kinglink Reviews](https://kinglink-reviews.com/2020/03/02/how-void-bastards-work-a-roguelite-that-teaches-players-how-it-wants-to-be-played/)
- [Shifts — Hardspace: Shipbreaker wiki](https://hardspaceshipbreaker.fandom.com/wiki/Shifts)
  and [Game Modes](https://hardspaceshipbreaker.fandom.com/wiki/Game_Modes)

**Our code, read for this comparison:**
`src/sim/salvage.js`, `condition.js`, `subparts.js`, `refit.js`, `combat.js`, `ship.js`,
`heat.js`, `power.js`, `stores.js`; `src/sim/meta/{materials,cargo,codex,perks,items,
objectives,patterns,harness}.js`; `src/world/{discovery,travel,factionWar,system,index}.js`;
`src/core/contracts.js`; `src/art/geometry/modules/*.js`; `src/game.js`.
