# Shelf survey — who else is on this shelf, and what the shelf already proved

**Scope of this document.** A breadth survey of the *actual current Steam shelf* adjacent to
Nadir Point, conducted July 2026. It deliberately goes looking for titles nobody handed us.
The previous research pass (`fun-systems.md`) studied a curated list — Everspace, Homeworld,
FTL, Nebulous, Highfleet, BFG:A2, Star Citizen, X4/Avorion/Cosmoteer, plus three small
roguelites. That list contained **no ship-breaking game, no salvage-first game, and no
single-capital-ship competitor**. Those are our core identity. This document closes that gap.

**Binding constraints respected throughout.** `scope-decision.md` governs. Crew and officers
are OUT. Trading-as-price-speculation is OUT. Nothing below recommends either, and §5.2
records where the shelf independently confirms both exclusions were correct.

---

## 0. What I could and could not access — read this before trusting a number

Honest accounting, because several numbers below are load-bearing.

**Worked reliably:**
- Steam **store app pages** (`store.steampowered.com/app/…`) are server-rendered and fetch
  cleanly, including the review histogram summary line. Every review count marked
  *(store page)* below was read directly off the page.
- Steam **search result pages** (`/search/?term=…`) fetch cleanly and are the best available
  discovery tool. This is how the long tail of salvage titles in §1.2 was found.
- **steamcharts.com** fetches cleanly and gave concurrent-player data.
- Steam **negative-review filter pages**
  (`steamcommunity.com/app/<id>/negativereviews/?browsefilter=toprated`) fetch and were the
  single richest source in this survey. Recommend this route for all future competitor work.

**Did not work:**
- Steam **tag pages** (`store.steampowered.com/tags/en/Space%20Sim/`) are fully JS-rendered.
  Returned nav chrome only. No game list. Could not enumerate by tag.
- **SteamDB** was not reachable in a form I could parse; all concurrency figures come from
  steamcharts instead.

**Numbers I am flagging as low confidence:**
- *The Galactic Junkers* — the store page fetch returned chrome only (app ID mismatch). Its
  "60% of 10 reviews" figure comes from a search snippet and is almost certainly a
  language-filtered subset, not the global count. Treat the *direction* (mixed, poorly
  received) as sound and the *magnitude* as unverified.
- *The Last Starship* — a snippet reports "Very Positive, 75% of 1,577". Those two do not
  agree; 75% is Steam's "Mostly Positive" band. I did not re-verify on the store page. Take
  the review count as roughly right and the band as uncertain.
- *Falling Frontier* — I could not establish whether it has entered Early Access. Community
  threads as recently as available still read "coming soon for years". Listed as status
  unknown rather than guessed.
- **Capital Command** and **Starship Command: Orion Spur** are unreleased. They have *no*
  player sentiment. Everything said about them is from their own store copy, which is
  marketing. Weight accordingly — but their store copy is still evidence of what the market
  is being promised.

---

## 1. The table

### 1.1 Direct competitors — salvage or ship-breaking as the primary loop

| Title | Status | Overlaps us on | Players PRAISE | Players COMPLAIN | Scale |
|---|---|---|---|---|---|
| **[Hardspace: Shipbreaker](https://store.steampowered.com/app/1161580/Hardspace_Shipbreaker/)** | Released 24 May 2022 (EA from Jun 2020) | Ship-breaking as the entire game; cutting apart hulls; "kill it wrong and you destroy the value"; hazardous reactors | Tools feel superb; physics; alone-in-space atmosphere; soundtrack; ships read as *puzzles*; the worker-exploitation theme is delivered *through* the mechanics, not cutscenes | "You are discovering new ships to salvage only within the first 10h. After that, they all start repeating"; only **4 ship classes**; "they've stretched the same 20 hours of content into a 40+ hour grind"; unskippable dialogue; upgrades "only make numbers bigger"; visible cut content (4 tool slots, 3 tools) | 89% of 16,130 EN reviews, 19,282 all-language; recent 87%/103 *(store page)*. Current ~339 CCU, all-time peak **7,718** *(steamcharts)* |
| **[Ostranauts](https://store.steampowered.com/app/1022980/Ostranauts/)** | **Early Access** since 10 Sep 2020; **1.0 announced for 3 Aug 2026** — i.e. next week | Scavenger identity; strip derelicts in "the boneyard"; **bolt used parts off wrecks onto your own ship**; Newtonian flight; debt pressure | Deep lore recovered from datafiles on wrecks; the used-parts-are-cheaper-than-new economy; each component changes how the ship flies | Tutorial *tells you to salvage, then the game arrests you for unlicensed salvaging* — players left on negative credits; "micromanagement hell" with sub-inventories inside openable items; docking bugs merge your ship into the derelict; opaque mood system; can't afford to renew the license the tutorial gifted | 79% of 2,275 EN; recent 75%/61 *(store page)*. Current ~229 CCU, all-time peak **706** (Apr 2026) *(steamcharts)* |
| **[ΔV: Rings of Saturn](https://store.steampowered.com/app/846030/V_Rings_of_Saturn/)** | Released 21 Jul 2023 (EA from 2019) | Single ship; hard Newtonian physics; modular equipment with no dominant loadout; wreck/derelict salvage as a secondary income | "There is no 'best' equipment to answer every need"; thrust as a weapon; lasers invisible without a medium; the physics is the whole appeal | Brutal onboarding — a top forum thread is literally "Stuck two minutes into the tutorial"; hard sell to anyone not already a space nerd | 93% of 2,365 EN *(store page)*. Current ~46 CCU, all-time peak **807** *(steamcharts)* |
| **[Void Crew](https://store.steampowered.com/app/1063420/Void_Crew/)** | Released 1.0 25 Nov 2024 (EA Sep 2023) | Salvage from wrecks funds ship upgrades; **installable ship systems mid-run**; roguelite structure | Role play (pilot/engineer/gunner) when the crew clicks; "phenomenal with friends" | "Salvage consists of shooting things and tractor-beaming in pieces or going out in a spacesuit to collect them"; repetitive by the fourth run; off-ship sites are minimal; **decent solo, only great in co-op** | 88% of 5,062 EN; recent **75%**/45 *(store page)* |
| **[Space Trash Scavenger](https://store.steampowered.com/app/1759350/Space_Trash_Scavenger/)** | Released 1.0 14 Nov 2024 (EA Nov 2023) | Salvage debris and wrecked-ship tech as the loop; refine into value | Automation of the processing rig | Progression blueprints "very expensive"; income "extremely reliant on a resource grinding system that is fully randomized"; devs publicly patched to reduce "a bit less of a grindy feel" | 83% of 506 |
| **[Duskers](https://store.steampowered.com/app/254320/Duskers/)** | Released 2016; **Duskers 2.0** in development | You are a scavenger in a universe that already died; derelicts; upgrade drones with salvage; roguelike | The CLI; audio-carried dread; "successful missions become harrowing, scrambling nightmares"; emergent improvisation | "The starting roll can often predetermine how much fun a particular session ultimately is" | 89% of 1,953 |
| **[Star Citizen](https://starcitizen.tools/Guide:Salvaging) (salvage module)** | Live service | Hull-scraping as a shipped salvage loop; per-panel material readout | The **colour-coded readout** — blue-outlined fuselage sections = excellent salvageable material, yellow = mediocre, red = depleted. This is a solved legibility idiom | Reclaimer-scale salvage is deliberately "process-driven", not casual; long setup | n/a |
| **[Starsector](https://starsector.wiki.gg/wiki/Salvaging)** | Long-running paid alpha (not on Steam) | Recover hulls from **your own battles** and from derelicts; **d-mods** = permanent damage hullmods carried by recovered ships; a faction war you are a freelancer inside | D-mods make a recovered wreck feel *earned and damaged* rather than a clean unlock; salvage recoups supplies/fuel during exploration *and after combat* | n/a (off-Steam, no comparable review corpus) | n/a |
| **[Space Engineers](https://spaceengineers.fandom.com/wiki/Grinder_Block)** | Released | Grinder blocks strip wrecks to components; **re-weld those components onto your own hull** — the most literal "bolt the pieces on" precedent | The grind-to-the-blue-line-then-reweld trick to convert captured blocks to your ownership is a beloved player discovery | "Parts of ships can fly away when grinding, making salvage difficult when they are hurtling through space" | n/a |
| **[The Galactic Junkers](https://store.steampowered.com/app/1243160/The_Galactic_Junkers/)** | Released 30 Jun 2022 | Junk/salvage-themed space combat adventure | — | Clunky controls; glitch-ridden; "a lot of item fetching and travelling"; sectors repetitive | **Mixed** (low confidence — see §0) |
| **[GCS: Salvage Rat](https://store.steampowered.com/app/3449610/GCS_Salvage_Rat/)** | Released 29 Aug 2025 | Salvage contracts; breach derelicts; permadeath; full ship customisation; procedural systems | — | — (too small a corpus to read) | Small |
| **[Sector Scavengers: Signal & Salvage](https://store.steampowered.com/app/4541430/Sector_Scavengers_Signal__Salvage/)** | **Unreleased, 2026** | **Premise collision — see §2.2.** Derelict salvage; push-or-extract greed decisions; debt | — (unreleased) | — | — |
| **[Spaceship Scavenger](https://store.steampowered.com/app/3679880/Spaceship_Scavenger/)** | TBA | "Salvage valuable cores from abandoned spaceships in a physics-driven race against time" | — | — | — |
| **[Deep Space Salvage Crew VR](https://store.steampowered.com/app/1730060/Deep_Space_Salvage_Crew_VR/)** | Released 8 Jul 2022 | Board wrecks, fight to the bridge, claim salvage rights; procedural roguelike | — | — | Small |

### 1.2 The long tail — what a Steam search for "salvage" actually returns

Worth stating plainly because it changes the read on §2. A `/search/?term=salvage` query
returns **654 results**, of which the first 22 are salvage-named games. Sampled dates:
*Void Salvage* (11 Aug 2026), *Salvage Shop Simulator* (12 Mar 2026), *Space Salvage
Simulator* (10 Apr 2026), *Suborbital Salvage* (11 Feb 2026), *Salvage Unlimited* (3 Mar
2026), *The Last Salvage Squad* (17 Jun 2026), *EDEN SALVAGE*, *Cold Salvage*, *Decaying
Salvage*, *Nova Salvage*, *TEMPORAL SALVAGE*, *Salvage* (TBA). A parallel search for
shipbreaking/derelict terms adds *Star Scrap* (17 Jul 2026), *Starforged Legacy* (1 Jun
2026), *Vanguard Galaxy* (30 Oct 2025), *The Patchwork Ship*, *Galactic Veins*, *Black
Jackal*, *Starpath*.

Nearly all of these are sub-$10 solo projects. **The word "salvage" is now cheap on Steam.**
It is not a differentiator by itself. See §2.4.

### 1.3 Modular ships where the modules are visible on the hull

| Title | Status | Overlaps us on | Praise | Complaints | Scale |
|---|---|---|---|---|---|
| **[Cosmoteer](https://store.steampowered.com/app/799600/Cosmoteer_Starship_Architect__Commander/)** | Released 1.0 2022 | Every module is physically on the ship and matters in the fight | "The best starship sandbox on Steam, where every weapon mount, thruster and crew corridor you place actually matters" | ~100 crew is "difficult and tedious to manage"; players "did not fully understand the system"; pathfinding; friendly hulls block friendly fire | 94% of 7,524; recent 82%/69 |
| **[The Last Starship](https://store.steampowered.com/app/1857080/The_Last_Starship/)** (Introversion) | **Released 1.0 3 Feb 2026** after 3 yrs EA | Start with an empty hull; fit propulsion, life support, weapons, FTL | "A brilliant box of interlocking systems that rewards patience, curiosity, and a tolerance for occasional catastrophe" | Content depth at launch questioned | ~1,577 reviews (band uncertain, §0). 50k units, $1M revenue, 22 EA updates, **2,182 ships shared via Workshop**, 750k player-hours |
| **[Starcom: Unknown Space](https://store.steampowered.com/app/1750770/Starcom_Unknown_Space/)** | Released 1.0 Sep 2024 (20 mo EA) | Modular ship whose modules visibly change the silhouette; derelicts; anomaly exploration | "Most players loved the modular shipbuilding element that allowed for customizing both the look and behavior of their ship"; 230+ anomalies | **"Some players disliked the 'lego-brick' appearance that resulted from mostly single-hex modules"** — the exact failure our visible-module hull risks | 92% of 3,608 |
| **[Space Haven](https://store.steampowered.com/app/979110/Space_Haven/)** | **Released 1.0 13 May 2026** after ~6 yrs EA | Tile-by-tile hull construction; derelict boarding with hostile rogue robots | Ten-year labour of love finally landing; Workshop at 1.0; faction relationship overhaul | — | 8,942 positive / 1,453 negative ≈ **86%** |
| **[Avorion](https://store.steampowered.com/app/445220/Avorion/)**, **[Starship EVO](https://store.steampowered.com/app/711980/Starship_EVO/)**, **[SpaceCraft](https://store.steampowered.com/app/3276050/SpaceCraft/)**, **Modular Spaceship Project**, **StarShip Constructor** | Mixed; several 2025–26 EA | Block/module ship construction | — | The 2025–26 cohort is crowded and mostly small | — |

### 1.4 Single-capital-ship command, subsystem targeting, tactical-pause

| Title | Status | Overlaps us on | Notes | Scale |
|---|---|---|---|---|
| **[Capital Command](https://store.steampowered.com/app/1490930/Capital_Command/)** | **Unreleased, 2026.** Demo shown at Steam Next Fest June 2026 | **The closest thing on the shelf to us.** Single capital ship; procedurally generated campaign; 6-DoF physics with inertia; **targeting enemy subsystems**; damage-control priorities; loadout customisation (projectile artillery, missile pods, PD turrets); **"acquire resources and salvage from engagements to repair and upgrade"**; **"commandeer an enemy capital ship entirely, adapting to its loadout"**; fuel reserves and jump tracking | Store copy only — no player sentiment exists. Its framing is a rogue-AI fleet, **not** a two-faction war you are outside of. It also leans on crew order-giving, which we have excluded. | Unreleased |
| **[Starship Command: Orion Spur](https://store.steampowered.com/app/4158420/Starship_Command_Orion_Spur/)** | Coming soon; **demo live** | "Target enemy subsystems to **disable rather than destroy**"; power distribution between weapons/shields/engines; bridge command with optional direct piloting | The disable-don't-destroy framing is one step from our reactor-kill tension — but their motive is moral (protect civilians), not economic (preserve salvage) | Unreleased |
| **[NEBULOUS: Fleet Command](https://store.steampowered.com/app/887570/NEBULOUS_Fleet_Command/)** | Released | Already covered in `fun-systems.md` §1.5 | Radar/EW as the game | — |
| **[Falling Frontier](https://store.steampowered.com/app/1280190/Falling_Frontier/)** | **Status unverified** (§0) | Newtonian RTS, recon and logistics decisive, ambushes in asteroid fields | Massive wishlist milestone reported; community frustration that it "has been 'coming soon' for years" | — |
| **Starfield (subsystem targeting skill)** | Released 2023 | Target and disable enemy engines to board | Mainstream normalisation of subsystem targeting as a *verb players already know* | — |

### 1.5 Space roguelikes and roguelites — the current cohort

| Title | Status | Praise | Complaints | Scale |
|---|---|---|---|---|
| **[Reality Break](https://store.steampowered.com/app/1473060/Reality_Break/)** | Released 2024 | The **"Rewrite" mechanic — you alter the game's rules** (resize weapons to fit your ship, upgrade items, raise difficulty, add time to a clock). "Rarely seen in roguelites." Loot loop is "top-tier" | **"Metagame progression and accessibility options are about as barebones as they can get"**; forced restarts where you die and lose all progress "feels unrewarding" | 81% of 648; **recent Mixed 60%/25** |
| **[Crying Suns](https://www.metacritic.com/game/crying-suns/)** | Released 2019 | Capital ships trading blows at range with squadron deployment; story integrated into a roguelite | "Grating repetitiveness from a lack of variety in events and dialogue"; "odd lack of personality from the officers"; planetary expeditions disappointing; **"there isn't much variation in how you start a new run"** | — |
| **[Homeworld 3](https://store.steampowered.com/app/1840080/Homeworld_3/) — War Games mode** | Released 2024 | Run-modifying artifacts as a device (already noted in `fun-systems.md`) | **"HW3 plainly lacks the ship diversity to make a functional roguelike/roguelite out of it"**; "incredibly restrictive ship selection"; silly difficult solo; **sidelining skirmish "has to be one of the main reasons this has died in a ditch"** | Steam reviews crossed into **Mostly Negative** |
| **[Jumplight Odyssey](https://store.steampowered.com/app/1893820/Jumplight_Odyssey/)** | **EA Aug 2023, development paused indefinitely Dec 2023** | — | "Sales from Early Access were nowhere near enough to sustain a team the size required to support a game of Jumplight Odyssey's scope and ambitions." Entire team laid off | Cautionary |
| **[Shortest Trip to Earth](https://store.steampowered.com/app/1093950/)** | Released 2019 | FTL-like with a Firefly frame | — | — |
| **Void Salvage** (11 Aug 2026), **Deep Space Cache** (90% of 868) | Recent/imminent | — | Both are autobattler/idle. The "salvage" label is being attached to genres with no salvage decision-making in them at all | Small |
| **Jump Space** (2025), **Wildgate** (2025), **[Slipstream: Rogue Space](https://store.steampowered.com/app/2765860/Slipstream_Rogue_Space/)** | Recent | Co-op crewed ships | The 2025 cohort's answer to "how do we manufacture simultaneous pressure" is **more humans**. We cannot use that answer | — |

### 1.6 Adjacent, for the loop lesson only

| Title | Lesson |
|---|---|
| **[Star Trucker](https://store.steampowered.com/app/2380050/Star_Trucker/)** (2024) | 78% of 3,167, **recent 67%**/40. Complaint that matters to us: *"some salvaged items occasionally begin to float away at a pace quicker than the space suit can manage, leading to lost items and income"* — physical retrieval of salvage as a chore. Also "tedious part swapping" |
| **[EVE Online](https://wiki.eveuniversity.org/Salvaging)** | Salvaging is a mature MMO profession that players describe as **tedious**; the automation options (Mobile Tractor Units, salvage drones) are "considerably slower". Two decades of iteration did not make picking things up fun |
| **[This War of Mine](https://store.steampowered.com/app/282070/This_War_of_Mine/)** | The canonical "you are not the hero of this war" execution. The mechanic that carries it: *"It is impossible to have any impact on the potential ceasefire"* — the war is genuinely indifferent to you, and survival is the whole verb |

---

## 2. The competitive picture

### 2.1 Where we actually sit

Draw the axes we claim and see who occupies each:

| Axis | Who owns it today | Our position |
|---|---|---|
| Ship-breaking as craft | **Hardspace: Shipbreaker**, decisively. 19k reviews, an all-time peak of 7,718 CCU, and a genre it created and named | We should not contest this |
| Hard Newtonian single-ship fidelity | **ΔV: Rings of Saturn**, **Nebulous** | We are lighter than both by design; not a contest |
| Modular hull sandbox | **Cosmoteer** (94%/7.5k), **The Last Starship**, **Space Haven**, **Avorion** | Not a contest — theirs are construction sandboxes, ours is an accretion |
| Scavenger identity in a dead world | **Ostranauts**, **Duskers**, **Starsector** | Adjacent, but all three salvage in *dead* space |
| Single capital ship, subsystem-targeted, salvage-funded | **Capital Command** (unreleased, 2026) | **Direct collision. See §2.3** |
| "Not the hero" framing | **This War of Mine**; **Sector Scavengers** claims it explicitly for 2026 | Contested, and the claim is cheap. See §2.2 |
| **Salvage yield determined by how you fight** | **Nobody** | **This is ours** |
| **Salvaging inside a live battle that is not yours** | **Nobody** | **This is ours** |

### 2.2 The premise is not the differentiator, and I want to be blunt about it

*Sector Scavengers: Signal & Salvage* (unreleased, 2026) ships this in its store copy:

> "You are not 'the hero of the revolution.' You are the line item that keeps the mission
> profitable."

That is our pitch, in someone else's storefront, with the same debt-and-derelicts framing,
arriving the same year. It is a deck-building roguelike on a base-builder, so the *game* is
not our game — but the **premise is already taken and it was cheap to take.** Anti-heroic
framing is a paragraph of store copy. It costs a competitor nothing to write it.

Same for the word "salvage": 654 Steam results, a dozen new ones dated 2026 (§1.2), and two
of the most recent — *Void Salvage*, *Deep Space Cache* — are an autobattler and an idle
game respectively. The label has been fully commoditised.

**Conclusion: "scavenger cruiser in someone else's war" is positioning, not differentiation.
The differentiation has to be a mechanic, and it has to be one a store page can show in eight
seconds.**

### 2.3 The one genuine competitor, and why it is survivable

**Capital Command** is uncomfortably close: single capital ship, procedural campaign, inertia,
subsystem targeting, damage-control priorities, salvage from engagements funding repair and
upgrade, and even commandeering enemy capital ships. If it were shipped and good, it would be
the game we are describing.

Three things separate us, and all three are real:

1. **Their salvage is a reward; ours is a constraint.** In Capital Command's copy you "use the
   spoils of war" — salvage happens *after* you win, and winning harder is strictly better.
   Our reactor kill *destroys* the salvage. **How you win changes what you get.** That
   inversion does not exist anywhere on this shelf.
2. **Their world is a rogue-AI threat; ours is two factions indifferent to us.** Theirs is a
   hero story with a procedural skin — "you're the only chance of restoring order". Ours is
   the This War of Mine structure, where the conflict does not need you.
3. **They command a crew.** We have excluded crew (`scope-decision.md`), and §5.2 argues the
   shelf validates that.

The risk is timing, not design. They are 2026 with a Next Fest demo behind them. We should
assume we are second to market on "single capital ship, subsystem targeting" and lean harder
on the salvage-integrity inversion, which is not in their copy at all.

### 2.4 What is genuinely differentiated

Two mechanics, and they are the same mechanic seen from two ends.

**A. Salvage integrity as a combat constraint.** Every salvage game on this shelf separates
combat from salvage in time: Void Crew ("the victor claims the spoils" — kill, *then* loot);
Starsector (recover *after* the battle); Hardspace (the ships are already dead and docked);
Ostranauts (a boneyard); ΔV (dead rings); Space Engineers (grind a static wreck). **Nobody
makes the targeting decision inside the fight determine the payout after it.** Star Citizen
comes closest with per-panel material readouts, but that is a readout on an already-dead hull,
not a live tension.

**B. Contested, live salvage.** Every game above salvages in safe space. Hardspace's hazards
are *industrial* (reactors, decompression) — nobody is shooting at you. Ostranauts' boneyard
is inert. The one thing our premise structurally gives us that none of them have is that **the
battle may still be going on**, and the other side of it is not interested in whether you got
paid.

Those two together are the eight-second store-page hook. Neither is on the shelf.

### 2.5 The market is small, and the numbers should calibrate ambition

The genre-defining ship-breaking game — 19,282 reviews, a Ferrari of a launch, four years of
support — currently sits at **~339 concurrent players** against an all-time peak of 7,718.
Ostranauts, six years in EA and a week from 1.0, peaks at **706 all time** and is at ~229 now.
ΔV, with a 93% rating, runs **~46 concurrent**. The Last Starship, from a studio with
Prison Architect behind it, moved 50,000 units and $1M across three years of EA.

That is the ceiling of this shelf. Jumplight Odyssey died specifically because "sales from
Early Access were nowhere near enough to sustain a team the size required to support a game of
[its] scope and ambitions." **Scope discipline is not a preference here; it is the observed
survival condition.** `scope-decision.md`'s exclusions are not conservatism — they match what
the shelf can actually fund.

---

## 3. Table stakes the audience expects that we do not have

Ordered by how loudly the shelf says it.

1. **A demo, and a Next Fest slot.** Both direct competitors (*Capital Command*,
   *Orion Spur*) led with playable demos before release. On this shelf a demo is the
   discovery mechanism, not a bonus.
2. **Onboarding that does not punish obedience.** Two of the three closest titles bleed
   players in the first hour. Ostranauts' top complaint is that *the tutorial instructs you to
   salvage and the game then arrests you for it*. ΔV's top forum thread is "Stuck two minutes
   into the tutorial." We have a systems-dense game with heat, power routing, subsystem
   targeting, integrity and refit. This is the single highest-probability place to lose people.
3. **A run-modifying meta, not a stat meta.** Reality Break's "Rewrite" (change the rules),
   Homeworld 3's War Games artifacts, Rogue Command's per-run rule changes. Three independent
   convergences. Reality Break's *criticism* is the mirror image: "metagame progression is
   about as barebones as they can get."
4. **Build sharing.** The Last Starship: 2,182 ships shared via Workshop across EA. Space
   Haven made Workshop integration a headline 1.0 feature. Cosmoteer's culture is ship-sharing.
   **A game about a hull that visibly accretes salvaged parts and cannot be shown to anyone is
   leaving its best marketing on the floor.** Even a screenshot/hull-card export is table
   stakes; full Workshop is not.
5. **Pre-shot legibility of salvage value.** Star Citizen solved the readout problem years ago
   — blue/yellow/red outlined hull sections showing salvageable material. If our reactor-kill
   tension is the differentiator, the player must be able to *see the money on the target
   before firing*. `fun-systems.md` §5.6 already flags salvage yield as "a hidden dice roll";
   the shelf shows exactly what the fix looks like.
6. **Zero-friction retrieval.** Star Trucker: salvage floats away faster than you can chase it.
   Void Crew: "shooting things and tractor-beaming in pieces". EVE: two decades of iteration
   and it is still tedious. **Nobody has ever made picking things up fun.** Retrieval should be
   automatic on the salvage decision resolving.
7. **Damage that is legible without a wiki.** Starsector's d-mods are the model: a recovered
   hull carries *named permanent scars* with stated effects. `damage-model.md` and
   `beta-decay-systems.md` P1 already point here; the shelf confirms it is expected.

---

## 4. Proven failure modes — mechanics that shipped and players rejected

The most valuable section, per the brief. Each is sourced to a specific game's actual reviews.

**F1. Content-starved variety in a repeating loop.** Hardspace: *"You are discovering new ships
to salvage only within the first 10h. After that, they all start repeating"* — four ship
classes. Homeworld 3 War Games: *"plainly lacks the ship diversity to make a functional
roguelike out of it."* Two different games, same fatal shape: a repeating structure laid over
a content set that runs out. **This is the number-one killer on this shelf and it is exactly
the risk profile of a wreck-based roguelike with a small ship catalogue.**

**F2. Stretching thin content with an XP grind.** Hardspace: *"They've stretched the same 20
hours of content into a 40+ hour grind, the pacing is now horrible."* Progression used as a
content substitute is detected and punished.

**F3. Upgrades that only make numbers bigger.** Hardspace's upgrade system criticised for
"only making numbers bigger without adding new abilities or changing gameplay approaches."
This independently confirms the Everspace-2 finding already in `scope-decision.md`. Two
sources, two genres.

**F4. Inventory and sub-inventory micromanagement.** Ostranauts: *"constant clicking and
micromanagement hell with sub-inventories for openable items."* Everspace 2 (prior pass) has
four separate top forum threads on the same thing. Salvage games generate item volume by
nature; **item volume is the trap the genre falls into.**

**F5. A tutorial that punishes doing what it said.** Ostranauts arrests you for the salvage it
told you to perform, leaving new players on negative credits with an unrenewable license. This
is the difference between "hard" and "hostile" and players do not forgive it.

**F6. Unskippable voiced narrative laid over a systems game.** Hardspace: *"often it cannot be
skipped"*, *"the voice acting adds nothing to the story, in fact it detracts"*, and the
character whose *"forever cheery in the wrong setting"* voice "kills immersion". A player who
came for the simulation experiences narration as a tax on the loop.

**F7. Salvage as physical-collection chore.** Void Crew: *"salvage consists of shooting things
and tractor-beaming in pieces or going out in a spacesuit to collect them."* Star Trucker:
items float away faster than you can chase. Space Engineers: *"parts of ships can fly away
when grinding."* EVE: automation options exist and are "considerably slower". **Four
independent implementations, four complaints, zero successes.**

**F8. Randomised income gating deterministic progression.** Space Trash Scavenger: blueprints
"very expensive", income "extremely reliant on a resource grinding system that is fully
randomized". The developers publicly patched toward "less of a grindy feel". Randomness on the
*input* to a fixed-cost *gate* reads as the game wasting your time.

**F9. Modularity that produces a lego-brick silhouette.** Starcom: *"some players disliked the
'lego-brick' appearance that resulted from mostly single-hex modules."* Our entire visual
premise is bolting heterogeneous salvaged parts onto one hull. **This is the specific
aesthetic failure our design is most exposed to**, and it comes from uniform module footprints
plus grid snapping.

**F10. Runs that start the same way every time.** Crying Suns: *"for a rogue-lite, there isn't
much variation in how you start a new run."* Duskers: *"the starting roll can often
predetermine how much fun a particular session ultimately is."* Note these are *opposite*
failures — too little variance and too much variance-that-you-cannot-influence. The working
target is high variance in *situation* with low variance in *viability*.

**F11. Forced restarts that delete visible progress.** Reality Break: players "dislike the
forced restarts where after reaching specific points you die and lose all progress, which
feels unrewarding" — and its recent reviews have fallen to Mixed 60%. **Our hull is the
progression** (`scope-decision.md`: progression attaches to the ship). A structure that wipes
the visible hull is wiping the thing the player has been looking at all game.

**F12. Crew micromanagement.** Cosmoteer, at 94% positive, still fields "~100 crew members
difficult and tedious to manage" and "did not fully understand the system." Its own review
coverage warns off players who "prefer combat you can let run rather than constant
micromanagement."

**F13. Sidelining the mode the audience came for.** Homeworld 3: *"the sidelining of the
skirmish mode has to be one of the main reasons this has died in a ditch."* A studio chased a
roguelite mode and lost the core audience. Direct warning against letting run-structure
scaffolding crowd out the actual salvage fantasy.

**F14. Shipping EA at a scope the revenue cannot carry.** Jumplight Odyssey. See §2.5.

---

## 5. What to adopt, and what to refuse

### 5.1 Adopt — prioritised

**A1 — Make the salvage-integrity inversion the front-page mechanic, and make it visible
before the shot.** *(Highest value. It is the only thing on our sheet nobody else has.)*
Concretely: adopt Star Citizen's readout idiom — target sections carry a visible
salvage-value state (rich / degraded / destroyed) that updates live as you damage them, and
the reactor is visibly the section whose destruction propagates that state across the hull.
Closes `fun-systems.md` §5.6 ("salvage yield is a hidden dice roll") with a proven UI pattern
rather than an invented one. Answers all four questions in `scope-decision.md`'s design test.

**A2 — Commit to live, contested salvage; do not let it decay into post-battle looting.**
The escalation clock at a POI (`fun-systems.md` P4) is not a nice-to-have — it is the load
bearer for the second differentiator. Without pressure while cutting, we become Hardspace with
worse cutting.

**A3 — Budget wreck variety explicitly and count it out loud, now.** F1 killed the two best
comparables. Do the arithmetic before building: how many distinguishable wrecks does a player
see in ten hours? Our multiplier is available for free — **faction × hull class × how the
battle went** (which sections are already gone, which are burning, who won). A wreck that
carries the history of a fight we did not attend is a variety source Hardspace structurally
could not have, because its ships arrive intact.

**A4 — Modules must change verbs.** Already in `scope-decision.md` from Everspace 2; F3
confirms from a second genre. Enforce it as a gate: a module that only scales a number does
not ship.

**A5 — Auto-resolve retrieval.** F7 is four-for-four. The salvage *decision* is the game; the
salvage *transport* is not. When a cut resolves, the part is yours. No tractor chores, no
floating-away, no chase.

**A6 — Onboarding that never punishes obedience, and a demo built around the first hour.**
F5 plus table-stake 1 and 2. Everything the tutorial instructs must be safe to do. The demo
should be the first hour, and the first hour must contain the integrity inversion — a player
who quits before understanding that salvage depends on aim has seen a worse Hardspace.

**A7 — Run-modifying rules over stat unlocks.** Table stake 3, four independent convergences.
Under `scope-decision.md` these must attach to the hull, not a character sheet — which
actually makes them stronger: a run modifier expressed as *a permanent oddity welded into your
ship* is both the meta system and the visual progression.

**A8 — Named, permanent damage scars on salvaged parts (the Starsector d-mod pattern).**
A recovered module carries a legible flaw with a stated effect. This makes condition mean
something (`fun-systems.md` §5.5, `beta-decay-systems.md` P1), makes a sloppy kill's cost
concrete, and makes two identical modules non-identical.

**A9 — Silhouette discipline against F9.** Non-uniform module footprints, off-grid mounting
angles, and faction-distinct part geometry (`fun-systems.md` P11) are not polish here — they
are the direct countermeasure to the lego-brick complaint. This is the one place where visual
work is a *systems* requirement.

**A10 — A hull card / share export.** Table stake 4. Cheap, late, and the highest
marketing-per-hour item on this list. Not Workshop; just a shareable render of your accreted
hull with its part manifest.

### 5.2 Deliberately do NOT do — the shelf says these do not work

**N1 — Do not build a manual cutting minigame as the source of fun.** Hardspace owns
cutting-as-craft with four years of tool polish and it *still* went repetitive at ten hours.
We cannot out-tool them and we do not need to: our cutting decision happens at target-selection
time, not at torch time. (Corroborates `fun-systems.md` §5.7 — cutting must not be dead time
*or* a competing craft game; it should be short and consequential.)

**N2 — Do not build crew.** Already excluded. F12 shows even the best-loved modular ship game
on Steam takes real damage for it, and Capital Command is voluntarily walking into it. Keep
the exclusion.

**N3 — Do not build a commodity market.** Already excluded. Space Trash Scavenger's "galactic
stock market" is nowhere in what players praise; F8 is what they noticed instead. Materials
stay a sink.

**N4 — Do not build deep inventory.** F4, two games, one of them our nearest neighbour.
Salvage generates item volume by nature — the discipline is to convert parts into hull state
fast and hold as little loose inventory as possible.

**N5 — Do not put unskippable voiced narrative over the loop.** F6. Whatever world-telling we
do should be recoverable-and-optional — Ostranauts' *datafiles retrieved from wrecks* is the
praised model, and it is diegetic salvage, which fits our loop exactly.

**N6 — Do not let the roguelike structure wipe the hull.** F11 plus `scope-decision.md`'s
ship-bound progression. The hull is the visible ledger of everything the player has done. If a
run structure resets it, the game deletes its own best feature every ninety minutes. Whatever
resets between runs, the *accreted hull* should not — or the reset must be diegetic and
visible (stripped for parts, not vanished).

**N7 — Do not attempt co-op crewing.** Void Crew (5,062 reviews), Slipstream, Jump Space and
Wildgate all manufacture simultaneous pressure by adding humans. Void Crew's own reviews say it
is merely "decent in single-player". Our answer to concurrent demand must be systemic — heat,
ammunition, damage control, integrity, the escalation clock — not social.

**N8 — Do not let run scaffolding crowd out the salvage fantasy.** F13. If a choice ever comes
down to "more roguelike structure" versus "more to salvage and more ways to cut it", the shelf
has already answered.

**N9 — Do not rely on the anti-heroic premise as the differentiator.** §2.2. It is already
claimed for 2026 by another 2026 title, in nearly our words. It is good framing; it is not a
moat. The moat is A1 and A2.

---

## Sources

**Steam store pages (fetched directly, server-rendered):**
- [Hardspace: Shipbreaker](https://store.steampowered.com/app/1161580/Hardspace_Shipbreaker/)
- [Ostranauts](https://store.steampowered.com/app/1022980/Ostranauts/)
- [ΔV: Rings of Saturn](https://store.steampowered.com/app/846030/V_Rings_of_Saturn/)
- [Void Crew](https://store.steampowered.com/app/1063420/Void_Crew/)
- [Capital Command](https://store.steampowered.com/app/1490930/Capital_Command/)
- [Starship Command: Orion Spur](https://store.steampowered.com/app/4158420/Starship_Command_Orion_Spur/)
- [Sector Scavengers: Signal & Salvage](https://store.steampowered.com/app/4541430/Sector_Scavengers_Signal__Salvage/)
- Steam search: [term=salvage](https://store.steampowered.com/search/?term=salvage&category1=998), [shipbreaking/derelict/salvage/space](https://store.steampowered.com/search/?term=shipbreaking%20derelict%20salvage%20space&category1=998)

**Steam community reviews and discussions:**
- [Hardspace: Shipbreaker — top-rated negative reviews](https://steamcommunity.com/app/1161580/negativereviews/?browsefilter=toprated&l=english)
- [Ostranauts — "Feels like tutorial hates new players?"](https://steamcommunity.com/app/1022980/discussions/1/4760956314081641231/)
- [Ostranauts — "Reality check and the state of the game"](https://steamcommunity.com/app/1022980/discussions/1/596288191849346136/)
- [Ostranauts — "First game was just a really bad experience"](https://steamcommunity.com/app/1022980/discussions/1/4638238788728947767/)
- [Ostranauts — "Suddenly broken ship"](https://steamcommunity.com/app/1022980/discussions/1/595158249006737295/)
- [ΔV — "Stuck two minutes into the tutorial"](https://steamcommunity.com/app/846030/discussions/0/2282708683277981084/)
- [Void Crew — top-rated negative reviews](https://steamcommunity.com/app/1063420/negativereviews/?l=english&browsefilter=toprated)
- [Cosmoteer — "Simplifying crew management"](https://steamcommunity.com/app/799600/discussions/0/689742326557425199/)
- [Space Engineers — "Efficient way to recycle ships"](https://steamcommunity.com/app/244850/discussions/8/617328415069789493/)
- [Jumplight Odyssey — "Entire dev team laid off, game abandoned"](https://steamcommunity.com/app/1893820/discussions/0/4031347929690247157/)
- [Jumplight Odyssey — "A Development Update - FAQ"](https://steamcommunity.com/app/1893820/discussions/0/4031347929690205259/)

**Concurrency (steamcharts):**
- [Hardspace: Shipbreaker](https://steamcharts.com/app/1161580) · [Ostranauts](https://steamcharts.com/app/1022980) · [ΔV: Rings of Saturn](https://steamcharts.com/app/846030)

**Press and reviews:**
- [Hardspace: Shipbreaker — Metacritic](https://www.metacritic.com/game/hardspace-shipbreaker/) · [OpenCritic](https://opencritic.com/game/9668/hardspace-shipbreaker) · [Gamecritics](https://gamecritics.com/jason-ricci/hardspace-shipbreaker-review/) · [PC Gamer hands-on](https://www.pcgamer.com/hands-on-hardspace-shipbreaker/)
- [Ostranauts review — Gamecritics](https://gamecritics.com/gc-staff/ostranauts-review/)
- [ΔV: Rings of Saturn — GamingOnLinux](https://www.gamingonlinux.com/2023/07/dv-rings-of-saturn/) · [WhatIfGaming review](https://whatifgaming.com/v-rings-of-saturn-review-for-the-inner-geek-in-some-of-us/)
- [Void Crew review — PC Gamer](https://www.pcgamer.com/games/action/void-crew-review/) · [Gaming Nexus](https://www.gamingnexus.com/Article/14150/Void-Crew/) · [Metacritic](https://www.metacritic.com/game/void-crew/)
- [Duskers review — PC Gamer](https://www.pcgamer.com/duskers-review/) · [Gamereactor](https://www.gamereactor.eu/duskers-review/) · [Wikipedia](https://en.wikipedia.org/wiki/Duskers)
- [Starcom: Unknown Space — Metacritic](https://www.metacritic.com/game/starcom-unknown-space/) · [review, Daily Game Bytes](https://medium.com/@DailyGameBytes/starcom-unknown-space-2024-review-among-the-best-space-sims-ive-played-e419066d7790)
- [The Last Starship 1.0 launch — Games Press](https://www.gamespress.com/The-Last-Starship-After-3-Years-In-Early-Access-and-1m-In-Revenue-Intr) · [Worthplaying](https://worthplaying.com/article/2026/1/15/news/148717-the-last-starship-rolls-out-final-early-access-update-v10-launch-set-for-february-trailer/) · [Metacritic](https://www.metacritic.com/game/the-last-starship/)
- [Space Haven 1.0 — Gamerant](https://gamerant.com/steam-best-scifi-sandbox-like-rimworld-space-haven/) · [Wikipedia](https://en.wikipedia.org/wiki/Space_Haven)
- [Cosmoteer review — Game Atlas](https://game-atlas.de/en/reviews/cosmoteer-starship-architect-commander/) · [how Cosmoteer became a breakout hit — GameDiscoverCo](https://newsletter.gamediscover.co/p/deep-dive-how-cosmoteer-became-a-breakout-steam-hit) · [Wikipedia](https://en.wikipedia.org/wiki/Cosmoteer)
- [Reality Break review — Game8](https://game8.co/articles/reviews/reality-break-review) · [Saving Content](https://www.savingcontent.com/2025/02/07/reality-break-review/) · [Metacritic](https://www.metacritic.com/game/reality-break/)
- [Crying Suns — OpenCritic](https://opencritic.com/game/8307/crying-suns/reviews) · [TouchArcade review](https://toucharcade.com/2020/07/06/crying-suns-review/)
- [Homeworld 3 — OpenCritic](https://opencritic.com/game/16052/homeworld-3/reviews) · [user reviews, Metacritic](https://www.metacritic.com/game/homeworld-3/user-reviews/) · [TheSixthAxis](https://www.thesixthaxis.com/2024/05/10/homeworld-3-review/) · [War Games mode — PC Gamer](https://www.pcgamer.com/homeworld-3s-roguelike-inspired-war-games-mode-is-perfect-for-strategists-in-a-hurry/)
- [Jumplight Odyssey on hold indefinitely — Film Stories](https://filmstories.co.uk/news/jumplight-odyssey-on-hold-indefinitely-as-studio-struggles/) · [Wikipedia](https://en.wikipedia.org/wiki/Jumplight_Odyssey)
- [Space Trash Scavenger 1.0 — PCGamesN](https://www.pcgamesn.com/space-trash-scavenger/1-0-out-now)
- [Star Trucker — Metacritic](https://www.metacritic.com/game/star-trucker/) · [Moth Gaming review](https://www.mothgaming.co.uk/2024/10/star-trucker-review.html) · [PC Gamer demo impressions](https://www.pcgamer.com/star-trucker-is-sluggish-frustrating-and-my-favourite-steam-next-fest-demo/)
- [The Galactic Junkers — SteamSpy](https://steamspy.com/app/1243160) · [TheXboxHub review](https://www.thexboxhub.com/the-galactic-junkers-review/)
- [Falling Frontier — PC Gamer](https://www.pcgamer.com/spaceship-rts-falling-frontier-looks-like-the-expanse-in-a-very-good-way/) · [wishlist milestone, PCGamesN](https://www.pcgamesn.com/falling-frontier/steam-wishlists)

**Wikis and mechanical references:**
- [Star Citizen — Guide:Salvaging](https://starcitizen.tools/Guide:Salvaging)
- [Starsector — Salvaging](https://starsector.wiki.gg/wiki/Salvaging) · [Damage hullmods (d-mods)](https://starsector.wiki.gg/wiki/Damage_hullmod) · [Ship recovery](https://starsector.fandom.com/wiki/Ship_recovery)
- [Space Engineers — Grinder Block](https://spaceengineers.fandom.com/wiki/Grinder_Block)
- [EVE University — Salvaging](https://wiki.eveuniversity.org/Salvaging) · [Ninja Salvaging and Stealing](https://wiki.eveuniversity.org/Ninja_Salvaging_and_Stealing) · [EVE Online support — Salvaging](https://support.eveonline.com/hc/en-us/articles/213014209-Salvaging)
- [Starship EVO — Salvage](https://starshipevo.fandom.com/wiki/Salvage)

**Discovery aids:**
- [wasdland — Best Spaceships Games on Steam, July 2026](https://www.wasdland.com/games/spaceships/)
- [Gamerant — Games Where You Don't Matter](https://gamerant.com/games-where-you-dont-matter/)
- [This War of Mine — Steam](https://store.steampowered.com/app/282070/This_War_of_Mine/)

**Internal (read, not modified):** `docs/design/scope-decision.md`,
`docs/design/fun-systems.md`, `docs/design/beta-decay-systems.md`,
`docs/design/damage-model.md`, `docs/design/visual-direction.md`,
`docs/review/full-audit.md`
