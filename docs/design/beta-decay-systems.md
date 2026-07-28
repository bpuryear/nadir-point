# Beta Decay — systems research, and what it means for Nadir Point

**Status:** research + proposal. Nothing here is committed. Sections 5 and 6 are decisions
for the project owner, several of which collide with the brief's out-of-scope list and are
flagged as such rather than assumed.

**Brief framing this answers:** *"How do we make this the space game version of Beta Decay?"*

**What was read.** Every page cited in the appendix, by URL, with the date of reading
(2026-07-28). Where a page could not be read it is named in the appendix and the claim that
would have rested on it is either dropped or marked as inference.

**Method note.** The `/database` category pages paginate and only expose 8 entries per view,
so the category listing alone is not a complete enumeration. The full set of 289 post URLs
was recovered from `blog-posts-sitemap.xml` and individual entries were then fetched
directly. That is how the FAQ set was enumerated despite the category page showing 8 of 68.

---

## 0. The one-paragraph answer, before the detail

Beta Decay is not deep because any one of its systems is deep. It is deep because it
simulates **nouns** in obsessive, named, chemically-literate detail and abstracts **verbs**
down to a queue. Nine real ores refine into sixteen real ingots via a machine whose entire
interaction is "put material in, it comes out refined, first-in-first-out." There is no
skill tree, because the player's power curve is *what they own* and *what they know*, and
the game publishes a 289-entry encyclopedia so that knowing is possible. One general system
— the ECS — pays for interaction, carrying, inspection, furnishing, destruction and (later)
spaceship construction. And the visual budget is deliberately spent down — low poly, point
filtering, downsampled, no toggle — because the developer says outright that polygons are
not where the frame time goes.

Every one of those is a transferable principle, and three of them are things Nadir Point is
*already* doing without having named them.

---

## 1. What Beta Decay actually is

### 1.1 Genre and shape

A **dark dystopian action RPG**, in Unreal Engine 5 (upgraded to 5.8 as of Devlog #41), by
a solo-scale studio, Rotoscope Studios. Steam tags: Survival, Open World, Third Person,
First-Person, Crafting, Space Sim, Building, FPS, Action-Adventure, Perma Death, Early
Access.
[[genre]](https://www.rotoscopestudios.com/post/what-is-the-genre-of-beta-decay)
[[Steam]](https://store.steampowered.com/app/1416070/beta_decay)

Setting: the Alpha Centauri system, a colonised exoplanet in decay, a topside surface
("the **Strata**") and a planned underground **Metropolis**. Corporations, Divisions and
Syndicates contend for territory.
[[home]](https://www.rotoscopestudios.com)
[[presskit]](https://www.rotoscopestudios.com/presskit)

Structure: **one single-world sandbox.** No campaign. No linear story.

> "No. The game is presented as a single world sandbox."
> — [will-there-be-single-player-campaigns](https://www.rotoscopestudios.com/post/will-there-be-single-player-campaigns)

Single-player plus co-op and PvP multiplayer, up to 16 players. Not an MMO, not an
extraction shooter, not a live service.
[[itch.io]](https://rotoscopestudios.itch.io/betadecay)
[[extraction]](https://www.rotoscopestudios.com/post/is-the-game-an-extraction-shooter)

### 1.2 The core loop — the developer refuses to name one, and that is the finding

This is the single most important page on the site and the reason the owner flagged the FAQ.
Asked directly what the gameplay loop is:

> "I believe people make their own. The game provides a platform of features in a specific
> setting that aims to enable imagination."
> — [what-is-the-gameplay-loop](https://www.rotoscopestudios.com/post/what-is-the-gameplay-loop)

And the stated design goal, repeated almost verbatim on the genre page:

> "The goal is to provide a platform of fun features and mechanics in a foreign setting that
> enables imagination."
> — [what-is-the-genre-of-beta-decay](https://www.rotoscopestudios.com/post/what-is-the-genre-of-beta-decay)

Read this carefully, because it is easy to mistake for evasion and it is not. It is a
statement about **where the design effort goes**. A game with an authored loop spends its
budget on the loop: pacing, gating, mission structure, reward curves. A game with no
authored loop must spend that same budget on *making the systems interlock tightly enough
that a loop emerges anyway*. Beta Decay's roadmap is the receipt: 51 features, of which
exactly one — "Roles and Contracts", the only thing resembling authored objectives — sits at
**35 % complete, the lowest number on the entire Early Access list**, while manufacturing,
economy, allegiances, phenomena and the ECS all sit at 75 %.
[[roadmap]](https://www.rotoscopestudios.com/roadmap)

That ratio is the design thesis stated as a work plan.

### 1.3 Moment-to-moment play

Reconstructed from the roadmap, the item database and third-party coverage; there is no
current public build, so this is assembled evidence rather than play experience. The
2024–early-2025 playtest was a Pre-Alpha in two timed phases and is no longer available.
[[playtesting]](https://www.rotoscopestudios.com/post/playtesting-legacy)

You are a person, in first or third person with seamless switching (one model, one animation
set). You climb, slide, lean, dive, prone, sit, sleep and stumble. You take cover along walls
and lean out of it. You carry your inventory **physically on your body** — containers,
magazines and weapons are visible objects worn on the character, not grid cells. You are
tracking Health, Stamina, Bio-Energy, Restroom, Hygiene, Hunger, Thirst, mental state and
overall wellness, plus injuries and illnesses that degrade those stats over time. Weather
moves — clear, rain, wind storms, dense fog — and the wind physically affects foliage, your
clothing, and **your bullets**. Artillery falls on the Strata and takes buildings apart.

You mine, refine, fabricate, trade on a securities exchange, own property, form or join an
allegiance, recruit subordinates, pilot a mech, drive a forklift.

> "Yes. This is a core part of the game and compliments the RPG elements nicely. The small
> details matter..." — on whether there will be mundane jobs
> [[mundane-jobs]](https://www.rotoscopestudios.com/post/will-there-be-mundane-jobs)

### 1.4 What the player optimises

Four things, none of them a level:

1. **A decaying state vector.** Seven-plus needs, plus injury and illness, all trending the
   wrong way. The game's title is literally a physics process by which an unstable nucleus
   sheds a particle to reach stability. The Early Access phase is named **Beta (−) Decay**
   and the post-launch phase **Beta (+) Decay** — beta-minus and beta-plus, the two real
   decay modes. The theme is the mechanic.
   [[what-does-beta-decay-mean]](https://www.rotoscopestudios.com/post/what-does-beta-decay-mean)
2. **Material throughput.** Ore to ingot to component to finished product, through machines
   you own, in a facility you own.
3. **Capital and standing.** Share price on the Centauri Exchange, property, allegiance
   relationships, territory.
4. **Their own knowledge.** Explicitly, and this is the load-bearing one — see §3.3.

---

## 2. The systems, enumerated

Percentages are the developer's own completion figures from the public roadmap as of
2026-07-20, quoted because they are honest evidence of where depth was actually bought.
[[roadmap]](https://www.rotoscopestudios.com/roadmap)

### 2.1 The foundation system, from which several others fall out for free

| # | System | Depth | How it interlocks |
|---|---|---|---|
| 1 | **ECS System** (75 %) | The spine. "A core game system that allows game objects (entities) to be interactable, picked up, inspected, and carried, each with their own set of unique statistics." | This one implementation *is* the answer to at least four other roadmap lines. **Inspect/Carry/Place** (75 %) is its verb set. **Furnishing** (75 %) is described as existing "by nature of beta decay's entity system." **Destruction** (75 %) is described as "by nature of the ECS system, all entities can be destroyed." **Spaceship Construction** (15 %, post-EA) is "the ability to weld together ECS structures, and components, and propel them into orbit." One system, five features. |

Note what this buys: a spaceship in Beta Decay is not a special-cased vehicle. It is a pile
of ECS entities welded together, which is why it can have power grids, server networks and
life support without any of those being bespoke code — they are components, and components
already exist.

### 2.2 Body, survival and hazard

| # | System | Depth | Interlocks |
|---|---|---|---|
| 2 | **Stats / Conditions** (75 %) | Health, Stamina, Bio-Energy, Restroom, Hygiene, Hunger, Thirst, plus mental state and overall wellness. Injuries and illnesses degrade them. | Consumed by locomotion (speed modifier), by consumables, by Life Support & PPE, by implants. |
| 3 | **Injury** (75 %) | "Visual display of body limb damage by color and amount," wounded locomotion animations, dismemberment. | State is displayed **on the body**, not in a panel. Feeds locomotion and the dismemberment system. |
| 4 | **Dismemberment** (75 %) | Limbs detach from projectiles and explosions. | Downstream of the combat and injury systems, not a separate one. |
| 5 | **Life Support & PPE** (75 %) | Consumables, masks, hazmat outfits, life-support apparatus, graded MKI/MKII/MKIII. Masks carry a **Filter Duration** stat. Gas masks "prevent infection"; outfits protect against "projectiles, or radiation." | Directly gates access to Phenomena zones. The grade ladder is the equipment progression. |
| 6 | **Phenomena** (75 %) | "Viruses, Local-spatial anomalies, Solar flares, Creatures, Hazardous areas" — spread across the world. | The reason PPE exists; the reason scanners exist; the reason the map has texture. |
| 7 | **Consumables** | Food, water, and **Biocells** — "a compact unit of biochemical energy," Medium restoring **25 BU**, 0.5 kg, capacity 1 cell. | Bio-Energy powers exosuits and implants. Food/water/energy are three separate economies. |

### 2.3 Movement and combat

| # | System | Depth | Interlocks |
|---|---|---|---|
| 8 | **Locomotion** (75 %) | Heavily modified ALS; "years of customization." Climbing, sliding, leaning, diving, proning, sitting, sleeping, stumbling, dynamic speed modifier. | Speed modifier reads the stat vector and the injury state. |
| 9 | **FPS / TPS** (75 %) | Seamless switching, explicitly "(No separate models or animations)." | One rig. Same discipline as the ECS: one implementation, two features. |
| 10 | **Cover** (75 %) | Wall-hugging movement, leaning in and out. | |
| 11 | **Combat Core** (72 %) | VFX, ADS, lowering/holstering, grenades, ragdoll. | |
| 12 | **Bullet Drop** (75 %) | Real per-weapon figures. The M16A2 entry publishes **"V-Drop: 10 cm at 200 m."** | Wind (from Weather) deflects bullets. Scopes have "adjustment knobs for elevation control." Three systems meeting at one shot. |
| 13 | **Weapons** (75 %) | 3 SMG, 5 rifle, 2 pistol, 1 sniper, 1 AT rifle, 1 RPG, 1 shotgun, HE grenades, claymores, AT mines, throwing knives. Each publishes Class, Caliber, Magazine, Rate of Fire, Weight, Durability, V-Drop, Allegiances and **Mounts**. | Ammunition is a separate item class with its own weight and capacity (a 30-round 5.56 magazine is a 1 kg object). |
| 14 | **Weapon Mods** (75 %) | Two suppressors, three scopes, three bipods, one foregrip, straps. **Explicitly static: "Weapon mods not customizable real-time."** Explicitly not a priority. | See §3.4 — this is a deliberate shallow spot and it is instructive. |
| 15 | **Artillery** (75 %) | Barrages strike the Strata and destroy buildings and foliage. | An environmental hazard rather than a player system. Pressure that is not aimed at you personally. |
| 16 | **Destruction** (75 %) | Building-scale destruction; deformable (voxel) terrain; all ECS entities destructible. Explicitly *not* everything. | |

### 2.4 Machines

| # | System | Depth | Interlocks |
|---|---|---|---|
| 17 | **MCVs** (75 %) | Pilotable Mechanized Combat Vehicles. Three torso types, four mountable weapons, countermeasures, cockpit UI. Customisation is "the interchanging of core components, such as legs, torso, weaponry." | **This is the closest thing in the game to our modular hardpoints.** |
| 18 | **MCV component simulation** | The machine is modelled part by part, and each part is a database entry with mass: **Air Filter** 5 kg (protects the engine from dust and debris), **Oil Filter Centrifuge**, **Fuel Injector**, **Starter**, **AUL-MKI Autoloader** 1200 kg / **15 shell capacity**, **M/TP-17 Fire Control Radar** 120 kg feeding an internal **tactical systems display (TSD)**, **2A65-77** artillery cannon 2500 kg at **1 round/minute**, **GAU-19** three-barrel .50. | The interesting move: a weapon is not one object, it is a gun *plus a feed system plus a fire-control sensor*, each separately massed and separately breakable. |
| 19 | **Vehicles** (75 %) | Vans, trucks, tanks, forklifts. Move large cargo containers. | The logistics half of manufacturing. A forklift exists because cargo has mass and location. |
| 20 | **Exosuits** (75 % / 25 %) | Two bio-powered suits. **Industrial**: carry cargo "beyond normal capacity." **Combat** (post-EA): small-arms protection. | Powered by Bio-Energy, so the survival vector gates the industrial economy. |

### 2.5 Economy and industry

| # | System | Depth | Interlocks |
|---|---|---|---|
| 21 | **Manufacturing** (75 %) | "An industrial lifecycle that begins with identification and extraction of raw resources into refined materials, then transformed into finished products by machinery." | See §2.6 for the actual chain. |
| 22 | **Processor** (structure, 600 kg) | "Takes any single raw input material and converts it into a refined output... Raw materials are processed using a 'First In First Out' (FIFO) method." | One input. One output. A queue. That is the entire interaction. |
| 23 | **Fabricator** (structure, 750 kg) | "Intake refined materials and transform them into market-ready products," driven by **blueprints** that "specify required materials and assembly procedures," with "an automated queue system that automatically executes production jobs." | Blueprints are the gate; the queue is the abstraction. |
| 24 | **Centauri Exchange** (75 %) | "A minimum of 50 tradable companies where share price is determined by calculation of fundamental values." | Not a random walk — the prices are *derived* from the simulated economy, so your manufacturing output theoretically moves the market you trade on. |
| 25 | **Economy / property** (75 %) | Purchase locations via the **Estate Registrar**; buy/sell orders via **Market Terminals**; **warehousing** for storage. | |
| 26 | **Terminals** (75 %) | "Physical terminals with in-game UI screens that support a variety of applications such as stock trading, fabrication, and allegiance formation." | Fully diegetic UI. See §4.3. |

### 2.6 The material chain, as actually published

This is worth setting out precisely, because its *shape* is the lesson.

```
ORES (9)              → Processor →  INGOTS & ALLOYS (16)
  chalcopyrite (CuFeS)              copper ingot
  bauxite                           aluminum ingot
  magnetite                         iron ingot
  galena                            lead ingot
  rutile                            titanium ingot
  argentite                         silver ingot
  chromite, quartz, platinum        gold / platinum ingot ...

MONOMERS (8)          → Processor →  POLYMERS (9)
  ethylene (C2H4)                   polyethylene (PE)
  propylene                         polypropylene (PP)
  isoprene                          polyisoprene (IR)
  vinyl acetate                     polyvinyl acetate (PVAc)
  vinyl ether                       polyvinyl ether (PVE)
  caprolactam                       nylon-6 (PA6)
  acrylamide                        polyacrylamide (PAM)
  bisphenol                         polycarbonate (PC)

ORGANICS (7)          → chemistry →  CHEMICALS (2)
  latex sap, raw cotton, mycelium,   sulfuric acid, citric acid
  penicillium, aspergillus niger,
  aspergillus oryzae, biomass (wood)

        ↓ all of the above → Fabricator + blueprint ↓

COMPONENTS (51) → EQUIPMENT (27) / WEAPONS (18) / ATTACHMENTS (13)
                / AMMUNITION (17) / MCV COMPONENTS (8) / MASKS (4)
                / HEADWEAR (7) / STRUCTURES (4) / IMPLANTS / CONSUMABLES (8)
```

Four to five tiers deep, built from **real mineralogy and real polymer chemistry**.
Chalcopyrite genuinely is a copper iron sulfide. Ethylene genuinely polymerises to
polyethylene. The developer did not invent a fantasy resource tree; they copied one that
already exists, which is both cheaper to author and impossible to get wrong.

### 2.7 Social, world and meta

| # | System | Depth | Interlocks |
|---|---|---|---|
| 27 | **Allegiances** (75 %) | Three primary allegiances with **relationship tracking between them**; create a custom allegiance, assign a badge, recruit subordinates. | Weapons carry an `Allegiances` field — the M16A2 is used by "Factions and Divisions", the Scope MKIV by "All". Gear *signals* affiliation. |
| 28 | **Roles and Contracts** (35 %) | A contract terminal with dynamically generated contracts. First iteration: Elimination, Transport, Repair. | The lowest completion figure on the board. Deliberate. |
| 29 | **AI Core** (57 %) | Pathfinding, carrying weapons and item drops, allegiance membership, **detection via audio**, combat manoeuvring, personal agendas. Post-EA: carrying wounded, physical trade (goods placed in the world for physical currency), command. | Audio detection makes suppressors a systems choice, not a cosmetic one. |
| 30 | **Weather** (75 %) | Clear, rain, wind storms, dense fog, with dynamic wind. | Wind → foliage, clothing, **bullets**, environmental objects. One system, four consumers. |
| 31 | **Save / Load** (72 %) | Character and world data, online and offline. | |
| 32 | **Permadeath** | "Yes, it is possible for your character to permanently die," mitigated by **purchasable clones as an insurance policy**. | The clone is bought with in-game capital, so the economy is the death system. |
| 33 | **Actionable Equipment** (75 %) | NVG / IR / magnification goggles, shoulder lamp, Geiger counter, **EIL-MKI Optical Scanner** ("surveys a local radius for nearby entities... visually represented back to the lens operator"), medical scanner, resource scanner, **Seismic Sensor** ("collecting seismic reflection data"), flares, glowsticks. | Each is a sense the player does not otherwise have. Information is equipment. |
| 34 | **Implants** | **Subscriber Identity Chip (SIC)** — a cortical nano-implant by N.Sek storing "the host's name, digital financial records, and life audit history." Post-EA: bio-energy-powered boosters. | Identity is an item you can presumably lose. |
| 35 | **SYNi** (75 %) | Bio-Synaptic Interface, MKI/MKII, "displays character statistics in world space via UI such as stamina, thirst, and overall wellbeing." | The HUD is an item you wear. See §4.2. |
| 36 | **Alphabet** (100 %) | "A custom character font that has been created for the game." One of only two features at 100 %. | See §4.4. |
| 37 | **DevTracker** (100 %) | "Ability to view development features and progress from within the game." The roadmap, as an in-game menu. | The other 100 % feature. Shipping-honesty as a feature. |

### 2.8 Post-Early-Access (Beta (+) Decay)

Planetary terrain (non-procedural, fully scaled, globally traversable, voxel); the
underground Metropolis with districts; crowds of hundreds of AI citizens; crewable tanks
with driver/commander/gunner-loader/passenger seats and manual levers and switches;
**spaceship construction and space travel** — welding ECS structures and components and
propelling them into orbit, then walking aboard during flight with your cargo and crew;
**zero-gravity locomotion with custom directional gravity**; interstellar objects (asteroid
belts, wormholes, ship wreckage and debris); melee; implants; helicopters; holograms; OST.
[[roadmap]](https://www.rotoscopestudios.com/roadmap)

---

## 3. Why the depth feels good rather than fiddly

This is the section that actually earns the exercise. Six principles, each stated with the
evidence, each with the line drawn as precisely as I can draw it.

### 3.1 Simulate the noun. Abstract the verb.

The material tree is four or five tiers deep and built on real chemistry. The machine that
processes it has **one** interaction: put a material in; it comes out refined; FIFO. No
minigame, no placement puzzle, no per-step input, no timing window. The Fabricator is the
same — a blueprint and an automated queue that "automatically executes production jobs."

**This is the line.** Objects, materials and machines are modelled in specific, named,
individually-massed detail. The *actions that transform them* are a queue.

Why it works: player cognitive load scales with the number of decisions per unit time, not
with the size of the data model. A four-tier chemistry tree presents the player with exactly
one decision — *what do I want at the end* — and then gets out of the way. A one-tier tree
with a rhythm minigame at each step presents dozens of decisions and produces nothing.

Corollary, and this is the actionable version for us: **if you want to add depth cheaply, add
nouns, not verbs.** A new ore is a database row. A new crafting interaction is a feature.

### 3.2 One general system pays for many features

The ECS gives interaction, carry, inspect, furnishing, destruction and spaceship
construction. FPS/TPS is "no separate models or animations." Wind is authored once and
consumed by foliage, clothing, bullets and props.

This is how a studio of this size produces a 51-feature roadmap at 75 % without collapsing.
It is also *why* the systems interlock: they interlock because they are the same system
wearing different hats. Interlock is not something that was designed in afterwards; it is a
free consequence of generality.

The test to apply to any proposed system: **name the three existing features it makes
cheaper.** If the answer is none, it is a feature, not a system, and it should be priced as
one.

### 3.3 The player's power curve is knowledge, so the systems are published

> "No. Any skill based actions in the game are based on user knowledge and input."
> — [will-there-be-skill-trees](https://www.rotoscopestudios.com/post/will-there-be-skill-trees)

There is no XP, no levels, no stat allocation. What the player accumulates is **gear** and
**understanding**. This is why a 289-entry public database exists and why it is a headline
part of the website rather than a wiki someone else built: *reading the database is
progression*. The encyclopedia is the skill tree.

Three consequences that make the depth feel good instead of opaque:

- Every entry uses the **same card**, so learning the format is a one-time cost (§4.5).
- Every entry has a **one-sentence functional description**, so knowing what a thing is takes
  five seconds. "A rotating carousel autoloader designed to store 125 mm and 150 mm shell
  ammunition." Done. You now know what it does and what it will not do.
- Depth is therefore **discoverable in advance**, not by dying. The player can be smart before
  they are experienced.

Contrast the failure mode: a game with hidden systems and no skill tree is not deep, it is
obscure. Beta Decay avoids that by publishing everything.

### 3.4 Deliberate shallow spots, chosen and defended

Not everything gets depth, and the developer says which things do not:

- **Weapon customisation.** Suppressors and scopes only, static, "not customizable
  real-time", and stated to be "not a priority or main focus of the game."
- **Roles and Contracts.** 35 %, the lowest figure on the board, in a game whose entire genre
  usually leads with quests.
- **Destruction.** "Not everything is destructable" — selective, not universal.
- **The loop itself.** Not authored at all.

A game that is deep everywhere is unplayable and unfinishable. The skill is in choosing which
axes are flat, and then saying so out loud. The scope-creep FAQ is the governance:

> "The overall scope of Beta Decay has been well defined for many years and is reflected in
> the project Roadmap."
> — [what-is-the-risk-of-scope-creep](https://www.rotoscopestudios.com/post/what-is-the-risk-of-scope-creep)

The roadmap is not marketing. It is the mechanism by which "no" is a defensible answer, and
it is shipped *inside the game* as the DevTracker.

### 3.5 Spend the visual budget to buy the simulation budget

Stated outright:

> "Polygon counts are not the only factor that dictate the level of performance. For beta
> decay, the bulk of processing time goes into the AI logic, animations, entity component
> systems, and several other management systems."
> — [low-poly-should-run-on-anything](https://www.rotoscopestudios.com/post/the-game-is-low-poly-so-the-game-should-run-on-any-machine-right)

Low poly, nearest-neighbour filtering and reduced-resolution rendering are not nostalgia,
or not only nostalgia — they are a budget transfer. And they are non-negotiable: there is no
setting to turn the pixelation off. The answer to that FAQ is one word: "No."

Nadir Point has made the identical trade in `ARCHITECTURE.md` — 2000-triangle cruiser,
400-triangle modules, no image files, capped detail density — without having written down
what it bought. It bought a 60 Hz fixed-step deterministic simulation with 200+ instanced
debris and a live faction war. That should be said out loud somewhere.

### 3.6 Detail is placed where the player's attention already is

The signal here is what got specified and what did not. The MCV has a modelled **air filter**
and **oil filter centrifuge** — parts a pilot would think about — but no modelled valve
timing. The mask has a **Filter Duration** — the one number a wearer cares about — and no
modelled adsorption curve. The weapon publishes **V-Drop at 200 m**, the number a shooter
uses, not a ballistic coefficient.

The rule: **model the parameter the player would ask about, and stop.** Every simulated
quantity should be one the player can name a reason to want. That is the difference between
Beta Decay's depth and a spreadsheet.

---

## 4. Visual and UI language

### 4.1 The render

Low-poly geometry ("relatively low, but way higher in regards to classic 90's – early 2000's
titles"), nearest-neighbour texture filtering, and rendering at reduced resolution to produce
deliberate pixelation. Near-monochrome, very high contrast, heavily desaturated. Asked to add
colour, the answer is:

> "The game looks exactly like it's supposed to."
> — [will-you-add-more-color](https://www.rotoscopestudios.com/post/will-you-add-more-color-the-visuals-are-too-saturated-black-white)

### 4.2 Legibility outranks fidelity, and there is a hard case to prove it

TAA and DLSS are **force-disabled by default with no plans to make them optional**, and the
stated reason is not performance and not taste:

> "Terminal font sizes and display screens were carefully chosen based on what remains
> readable from specific in-game viewing distances."
> — [mandatory TAA/DLSS](https://www.rotoscopestudios.com/post/does-the-game-uses-mandatory-taa-dlss)

They rejected the two most standard anti-aliasing techniques in the industry because those
techniques smear diegetic text, and the text is a UI. Font size was chosen against a measured
in-world viewing distance.

This is the same argument as `ship-language.md` §0 — the pixel budget table where every rule
derives from "a feature smaller than 130 m cannot be read at max zoom." Beta Decay ran that
calculation for typography. We ran it for silhouette. It is the same discipline and we should
recognise it as an ally.

### 4.3 Diegetic UI: the interface is furniture

Terminals are **physical objects in the world** running applications — stock trading,
fabrication, allegiance formation. You walk to a machine to use the machine. The MCV's
targeting data goes to an in-cockpit **tactical systems display** fed by a specific,
massed, breakable **fire-control radar**. If you shoot the radar off, the display is a
display of nothing.

That last chain — sensor is an object, object feeds a display, display is in the world, break
the object and the display goes dark — is the strongest single UI idea on the site, and it
maps onto our subsystem targeting almost without translation.

### 4.4 State is displayed on the thing, not in a panel

Three instances, all the same idea:

- **Visual Inventory** — the inventory is stored physically on the character body. You read a
  stranger's loadout by looking at them.
- **Injury** — "visual display of body limb damage by color and amount," plus wounded
  locomotion. Damage is on the body and in the walk cycle.
- **SYNi** — the Bio-Synaptic Interface "displays character statistics in world space via
  UI." The HUD is a piece of equipment you wear, with MKI and MKII grades.

The panel-space cost of all three is zero.

### 4.5 The database card is itself a UI language

Every one of the 289 entries uses the same frame:

```
NAME
[image]
"One-sentence functional description."

Class:       <taxon>
Weight:      <n> kg
Durability:  <n or -->
<0 to 3 class-specific fields>
```

Class-specific slots observed: **Capacity** (30 Round Magazine / 15 Shell Storage / 1 cell),
**Rate of Fire** (1 round / minute), **V-Drop** (10 cm at 200 m), **Filter Duration**,
**Memory Capacity** (on structures), **Bioenergy** (25 BU), **Allegiances**, **Mounts**
(Suppressor, Scope, Foregrip, Bipod, Strap), **Processed Into** (ethylene → polyethylene),
**Refines To** (chalcopyrite → copper).

Fixed frame, variable slots. Learn it once, read 289 items. It scales to hundreds of entries
at near-zero marginal design cost — and note that `Durability` appears on *every* card, even
where the value is `--`, which tells you condition is intended to be universal.

### 4.6 A constructed writing system

The custom **Alphabet** is one of only two features at 100 %. World text is in a script the
player cannot read, which does two things: it makes signage atmosphere rather than
information, and it forces the *actual* informational UI to carry its own weight rather than
leaning on incidental labels.

Nadir Point already has the machinery for this. The materials stream built "a font-free 5×7
block glyph set driving hull codes and hazard striping," generated at runtime. That is a
constructed alphabet that has not been recognised as one.

---

## 5. Translation table

Our premise: a lone salvager cruiser, six modular hardpoints, two warring factions
(Coalition / Concord) plus an ancient derelict third party, subsystem-targeted combat, and
salvage that yields parts rather than currency.

**Out of scope per the build brief**, and therefore never assumed below: campaign, missions,
story, ship interiors, crew management, trading and commodity markets, multiplayer, base
building, and character progression separate from the ship. Where a Beta Decay system needs
one of these, it is marked **SCOPE DECISION** and handed back to the owner with the best
in-scope approximation attached.

| # | Beta Decay system | Nadir Point equivalent | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | ECS: uniform entity model, every object interactable with its own stats | `registerModule` / `registerShipClass` / `registerPOI` with import-time validation; `WreckSection` | **ALREADY HAVE** | Same architecture, different vocabulary. Our registries validate at import and refuse malformed content, which is the discipline BD gets from ECS. Gap: our `ModuleDef` has no universal **condition** field, and BD puts `Durability` on every card. See #12. |
| 2 | The 289-entry public database as the progression system | A module/ship codex screen | **SHOULD ADD** | Highest knowledge-per-cost item in this document. Every field it needs already exists on `ModuleDef` (`name`, `hardpoint`, `tier`, `faction`, `description`, `mass`, `silhouetteTags`) and `ShipClassDef`. It is a UI screen over data we already validate. It also directly serves "no character progression separate from the ship": knowledge *is* the progression. |
| 3 | Ore → ingot → component → product, 4–5 tiers, real chemistry | Wreck section → scrap → refined materials → repairs and rebuilds | **SHOULD ADD (shallow)** | `salvage.js` already states the philosophy: "parts can be broken down into generic materials, and materials are what repairs cost." That is a **one**-tier chain today. Two tiers is the right target for us — see §6.4. **Not** four: BD's tree is deep because it feeds a factory and a market, and we have neither. |
| 4 | Centauri Exchange (50 companies, fundamental-value pricing) | — | **DOES NOT TRANSLATE** | Out of scope (trading and commodity markets) and, more decisively, has no fiction. A lone scavenger cruiser with a securities terminal is a different game. `salvage.js` already commits to "there is no market, no prices and nothing to sell to," and that commitment is correct and should be kept. |
| 5 | Estate Registrar, property ownership, warehousing | — | **DOES NOT TRANSLATE** | Out of scope (base building). Our storage constraint is the cruiser's own hold, which is a better constraint anyway because it is mobile and can be shot. |
| 6 | Character survival vector: hunger, thirst, hygiene, restroom, bio-energy | Ship consumable state: propellant, ammunition, coolant, materials, hull integrity | **SHOULD ADD — as ship state, not character state** | **SCOPE DECISION resolved in favour of the brief.** Character needs are out of scope (character progression separate from the ship). But the *shape* — a small vector of slowly-depleting resources that forces you to come up for air — is the thing that makes BD's world feel like it costs something to be in. We already have propellant from `controls.md` §5.5.3 (0.8 units/km). Ammunition is the missing one. See §6.2. |
| 7 | Per-limb injury with visual display by colour and amount | Per-hardpoint structure bars with a visible breach threshold; subsystem HP; damage groups | **ALREADY HAVE, and it is strong** | The UI stream already ships "per-hardpoint structure bars with a visible breach threshold" and "a subsystem ring that greys out what cannot be engaged." That is BD's injury display, on a ship. |
| 8 | Dismemberment | Module loss through hardpoint breach at 35 % warning; wrecks shedding sections | **ALREADY HAVE** | `sim/refit.js` and `sim/salvage.js` cover it. The extension worth making is #13 — shooting a mount off so the module survives as loot. |
| 9 | Life Support & PPE, masks with **Filter Duration**, MKI/MKII/MKIII grades | Module condition, consumable subsystem wear, tiered modules | **PARTIAL — ALREADY HAVE the grades, SHOULD ADD the wear** | `ModuleDef.tier` (1..3) is already the MKI/MKII/MKIII ladder. What is missing is anything that *runs out*. Filter Duration's real job is to convert a binary capability into a managed resource. See §6.1 and §6.3. |
| 10 | Phenomena: viruses, spatial anomalies, solar flares, creatures, hazardous areas | POI-scoped environmental hazards | **SHOULD ADD — top of the list** | Best depth-per-cost item in the document. We already have per-POI lighting rigs, per-POI palettes and post overrides, four power channels, a sensor range, and a far scene with a star and a gas giant. A solar flare is a timer and three multipliers on values that already exist. See §6.3. |
| 11 | Weather and dynamic wind deflecting bullets | Debris density, ionisation and dust affecting projectiles and sensors | **SHOULD ADD (restrained)** | Fold into #10 rather than building a weather system. Space has no weather; a POI can still have conditions. |
| 12 | `Durability` on literally every database card | A universal `condition` 0..1 on every module instance | **SHOULD ADD** | Wrecks already carry `integrity` per section and ships carry `salvageIntegrity`. Installed modules do not carry condition forward. Unifying these three into one number is a small change with large consequences: salvage quality, repair cost, and performance degradation all become the same mechanic. See §6.1. |
| 13 | MCV component-level simulation (air filter, autoloader, fire-control radar feeding a TSD) | **Named sub-parts inside each module** | **SHOULD ADD — highest depth multiplier** | Ship interiors are out of scope, and this does not need them: these are *external* parts of an *external* module. Today a cannon bank is one HP bar. Under this it is barrels, feed and traverse ring — three aim points with three different consequences. This multiplies the subsystem-targeting ring, the salvage yield table and the combat model at once, and the ring UI already exists. See §6.2. |
| 14 | Ammunition as a discrete, massed, capacity-limited item (30-round mag = 1 kg; autoloader = 15 shells) | Per-weapon ready feed + ship magazine, salvageable from wrecks | **SHOULD ADD** | The single biggest missing consequence in our combat model. Right now a fight costs time and hull. It should cost stores. It also gives kinetic and energy weapons genuinely different economics: shells are finite and salvageable, beams cost reactor pips you need for shields. Two currencies, one existing widget. See §6.2. |
| 15 | Weapon Mods: static attachments (suppressor, scope, bipod) | Sub-attachments on modules | **DOES NOT TRANSLATE — recommend against** | We already have 24 modules across 6 hardpoints with a silhouette audit holding 46 same-mount pairs apart. A second attachment tier multiplies content cost, multiplies the audit's pair count, and adds nothing our tier system does not. Note that BD themselves rate this "not a priority." Adopt their judgement, not their feature. |
| 16 | Allegiances with relationship tracking; gear carrying an `Allegiances` field | Coalition / Concord reputation; `ModuleDef.faction` carrying visual identity onto our hull | **ALREADY HAVE the mechanism, SHOULD DEEPEN the consequences** | Our modules already carry faction identity onto the player hull — that is BD's `Allegiances` field made *visible*, which is better than BD's version. Stream report 9 says plainly: "Reputation moves but its consequences are shallow." `controls.md` §5.7 already specifies one real consequence (standing pickets at ≤ −40). Wearing a faction's guns should be another. See §6.8. |
| 17 | Custom allegiance creation, badges, recruiting subordinates | — | **DOES NOT TRANSLATE** | Multiplayer and crew management, both out of scope. |
| 18 | Roles and Contracts: dynamically generated Elimination / Transport / Repair | Faction-war events as implicit objectives | **SCOPE DECISION — flagged, and we may already have the in-scope version** | "Missions" are explicitly out of scope. But BD's contracts are not story missions; they are generated objectives with no narrative attached, and BD rates them 35 % — their least-developed system. Meanwhile `controls.md` §5.7 already specifies `EV.BATTLE_STARTED` at a known POI putting a pulsing marker with a countdown on the overlay. **That is a contract with no contract system**: a place, a clock, and a reward that changes with when you arrive. My recommendation is that we already have the in-scope approximation and should invest in it rather than in a contract terminal. Owner's call. |
| 19 | AI with personal agendas and audio detection | `fleetAI` / `shipAI`; signature and sensor range | **PARTIAL** | We have faction AI that fights on its own schedule (41 battles across 92 simulated minutes in the probe). Individual agendas are expensive and low-yield for a game with no NPC dialogue. Audio detection maps onto our *signature* model, which already exists and already interacts with the SILENT stance. |
| 20 | NPC subordinates and the command system | Strike-craft groups with `Ctrl+1..5`, guard / intercept / dock postures | **ALREADY HAVE — this is the in-scope version** | Crew management is out of scope. Strike craft are subordinates that are ships, which keeps everything ship-shaped. |
| 21 | Physical terminals running diegetic applications | The refit screen framed as a console; the fire-control-radar → TSD chain | **PARTIAL — SHOULD ADD the causal half, not the furniture** | We cannot walk to a terminal without interiors. But the valuable half of BD's terminal idea is causal, not spatial: **the display is fed by a breakable object.** Lose the sensor module and the tactical overlay degrades. See §6.3 and §6.6. |
| 22 | SYNi: stats displayed in world space | World-space damage and state readouts anchored to the hull | **SHOULD ADD** | Stream report 10 logs the exact defect this fixes: "Panel text is low contrast against bright backdrops... Panels overlap the ship at some framings." Moving state onto the ship is both the BD idiom and the fix. See §6.6. |
| 23 | Custom alphabet at 100 % | Extending the existing runtime 5×7 block glyph set into a faction script | **SHOULD ADD (cheap)** | The materials stream already generates "a font-free 5×7 block glyph set driving hull codes and hazard striping" at runtime. Extending it costs no image files (`ARCHITECTURE.md` non-negotiable 5 holds) and buys a large identity win. |
| 24 | Permadeath with purchasable clone insurance | Run-ending cruiser loss with a pre-bought hedge | **SCOPE DECISION** | We are described as a roguelike, so a terminal loss state is in genre. But "buy a clone" is character progression, which is out of scope. In-scope approximation: a **salvaged backup core** — a module you can find and install that, on cruiser loss, preserves the seed's discovered POIs and one stored module into the next run. It is a *ship part*, it can be shot off, and it costs a hardpoint slot. Owner's call on whether any meta-progression is wanted at all. |
| 25 | Building-scale destruction and deformable terrain | Ship destruction, wreck sections, debris fields | **ALREADY HAVE the translatable part** | Terrain does not translate — there is no terrain. |
| 26 | Spaceship construction by welding ECS parts | The refit system | **ALREADY HAVE the in-scope version** | Free-form construction is base building, out of scope. Six hardpoints with a tier ceiling is the constrained version, and constraint is why our silhouette audit can pass at all. |
| 27 | Zero-gravity locomotion, walking aboard during flight | — | **DOES NOT TRANSLATE** | Ship interiors, out of scope. |
| 28 | ISOs: asteroid belts, wormholes, ship wreckage and debris | Instanced asteroid and debris fields, the 3400 m ancient hulk, POI kinds | **ALREADY HAVE, and ahead** | Stream report 6 is the strongest asset in the project; the independent critic rated the gas giant above the reference. This is a box we can tick. |
| 29 | No skill trees; knowledge as the power curve | — | **ALREADY ALIGNED — adopt explicitly** | This is the finding that most changes how we should feel about our own brief. "Character progression separate from the ship is out of scope" reads as a cut. Under BD's principle it is a *design position*: the player gets stronger by understanding arcs, bearings, power routing and where the cuts are, and by owning better parts. Say it in the design docs and then build the codex (#2) that makes it true. |
| 30 | Mundane jobs made satisfying — "the small details matter" | A cold salvage field with nobody shooting should be good on its own | **SHOULD ADD as a tuning target, not a system** | `controls.md` §5.7 already accepts that arriving after a battle gives "a cold field with nobody shooting at you and a lower yield." BD's position is that the quiet version must still be worth doing. Ours currently reads as the consolation prize. That is a VFX/audio/pacing target, not a feature. |
| 31 | Blueprints gating fabrication | Salvaged **patterns** letting you rebuild a module from materials | **SHOULD ADD (small)** | Solves a real failure state: you need a part, you know exactly which part, and the RNG will not give you one. A pattern converts a luck problem into a materials problem. See §6.7. |
| 32 | DevTracker: the roadmap as an in-game menu | Same | **SHOULD ADD (trivial, low priority)** | Cheap honesty. `docs/review/acceptance.md` already has the culture for it. |
| 33 | Bullet drop with published per-weapon V-Drop | Projectile flight time and lead | **ALREADY HAVE the physics, SHOULD SURFACE the number** | We have swept-sphere projectile tests so fast slugs cannot tunnel. There is no drop in space; the equivalent skill is leading a target across a flight time. BD publishes the number the shooter uses. We should put **time-of-flight and required lead** on the targeting reticle rather than making players learn it by missing. |

---

## 6. Prioritised additions

Ordered by depth added per unit of build cost. Each is specified concretely enough to hand to
a stream. Stream ownership is per `ARCHITECTURE.md`; anything touching `src/core/**` is a
proposal to integration, not a change.

Nothing here proposes editing `src/` or `tools/` in this pass.

---

### 6.1 — P1. Universal module condition

**Owner:** Combat (`src/sim/**`) + integration for the `core/contracts.js` field.
**Cost:** small. One field, three consumers, no new UI surface.
**Why first:** it is the keystone the next four items bolt onto, and it unifies three numbers
we already have but keep separately (`WreckSection.integrity`, `Ship.salvageIntegrity`, and
installed-module HP).

Add to the module *instance* (not `ModuleDef`):

```js
condition: 1.0,   // 0..1. Persists through cut → store → install → damage → repair.
```

Effects, all multiplicative on values that already exist:

| condition | effect |
|---|---|
| 1.00 – 0.80 | nominal |
| 0.80 – 0.50 | rate of fire ×(0.6 + 0.5·c); arc traverse rate ×(0.5 + 0.6·c) |
| 0.50 – 0.20 | above, plus a per-shot `1 − c` chance of a 2 s misfeed stall |
| below 0.20 | module inert until repaired; still installable, still salvageable |

Repair: `alloy` cost = `ceil(module.mass × 0.05 × (1 − condition))`, at the existing
`RefitSystem.installTime` cadence. A 340 kg cannon bank at condition 0.4 costs 10 alloy.

Display: the existing per-hardpoint structure bar gains a second, thinner track for
condition. No new panel.

**Depth bought:** every salvaged part now has a *quality*, so "which wreck do I cut" gains a
second axis, and the existing rule that a reactor kill caps integrity at 15 % suddenly has
teeth all the way through the game rather than only at the moment of cutting.

---

### 6.2 — P2. Sub-parts inside modules

**Owner:** Combat, plus a `PartDef` typedef proposed to integration.
**Cost:** medium. One typedef, one array per module def, one extra tier on a UI ring that
already exists.
**Why second:** it is the largest depth multiplier available, because it multiplies three
existing systems at once and adds no new screen.

This is Beta Decay's MCV — where a weapon is a gun *plus* an autoloader *plus* a fire-control
radar, each separately massed and separately breakable — applied to our modules. It needs no
ship interiors: these are external parts of external modules, visible in the geometry we
already build.

```js
/**
 * @typedef {Object} PartDef
 * @property {string} id
 * @property {string} label            second-tier label in the subsystem ring
 * @property {'output'|'feed'|'traverse'|'cooling'|'mount'} kind
 * @property {number} hpShare          0..1 of the module's HP held by this part
 * @property {[number,number,number]} offset   from the module origin, metres
 * @property {number} radius           hit sphere, metres
 * @property {number} salvageValue     0..1 share of the module's salvage
 */
```

Consequences of destroying a part, by kind — each one a modifier on an existing value:

| kind | destroyed → | salvage consequence |
|---|---|---|
| `output` (barrels, emitter head) | module inert | module scraps to materials only |
| `feed` (magazine, autoloader, capacitor) | rate of fire ×0.35 | module cuts intact |
| `traverse` (turret ring, gimbal) | arc frozen at current bearing ±4° | module cuts intact |
| `cooling` (heat sink, radiator) | sustained-fire limit halved, forced cooldowns | module cuts intact |
| `mount` (pad, bolt ring) | **module detaches as a free wreck section** | module cuts intact, undamaged |

That last row is the payoff and it should be treated as the point of the whole item.
**Shooting the mount off a hostile drops the gun into space intact, and you go and pick it
up.** It is Beta Decay's dismemberment, translated exactly, and it converts subsystem
targeting from a damage optimisation into a *shopping* mechanic. It is also the single
strongest possible expression of our premise.

Budget: **2–4 parts per module, no more.** Six hardpoints × one module × 3 parts = 18 aim
points, which the existing ring can hold at a second tier (hold `Ctrl`, hover a segment, the
segment expands). Above four the ring becomes the fiddly thing this document is trying to
avoid.

**Prerequisite honesty:** the parts must be visible in the geometry, or greying an aim point
the player cannot see is exactly the "fiddly" failure. `ship-language.md` §6 already requires
modules to project ≥ 55 m beyond the bare hull, so the geometry to hang parts on exists — but
the geometry stream has to publish part anchors, and that is a real cost, not a free one.

---

### 6.3 — P3. POI phenomena

**Owner:** World sim (`src/world/poi/**`) with read-only couplings into power and sensors.
**Cost:** small-to-medium. Five phenomena, each a flag, a timer and two or three multipliers.
**Why third:** highest atmosphere-per-line in the document, and it makes power routing matter
outside combat, which is currently its weak point.

Five, and no more. Each must couple to at least two existing systems or it does not ship.

| id | POI kinds | effect | counter |
|---|---|---|---|
| `solar_flare` | `near-star` | Over 45 s: sensor range ×0.35, shield regen ×0.40, weapon heat +18 %. Telegraphed 20 s ahead by a limb brightening on the star in the far scene. | `BRACE` stance, or put a celestial between you and the star |
| `ion_veil` | `nebula` | Continuous: sensor range ×0.5, **and your own signature ×0.4** | Turns `SILENT` from a travel stance into a stealth approach — a good thing becoming situationally great |
| `debris_storm` | `graveyard`, `belt` | 0.6 hull dmg/s to unshielded facings, scaling with speed²; 12 % chance to intercept a projectile crossing it | Shields, or slow down. Two answers, different costs |
| `radiation_belt` | `derelict` | Reactor output −2 pips while inside | Leave, or fight two pips down. The ancient hulk should punish you for being near it |
| `grav_shear` | `anomaly` | ±0.3 m/s² random lateral on every free body; tumbles wrecks, spoils long-range gunnery | Close the range. Makes rail and missile ranges situationally wrong |

Every one of these is a multiplier on a value that exists today: `RANGE.sensorBase`, shield
regen, reactor pips, projectile integration, `FreeBody` acceleration. There is no new
subsystem. That is precisely why this is cheap and precisely why it will feel deep — it makes
four existing systems interact in a way they currently do not.

Determinism: schedule every phenomenon from `world.rng.fork('poi-phenomena:' + poiId)`. A
seed must reproduce the flare.

---

### 6.4 — P4. Ammunition and a two-tier material chain

**Owner:** Combat (ammunition) + Salvage (materials).
**Cost:** medium.
**Why fourth:** it is the consequence layer. Fights currently cost time and hull; they should
cost stores.

**Ammunition.** Add to `WeaponDef`:

```js
ammoClass: 'shell_180' | 'railslug' | 'missile' | 'flak' | null,   // null = energy
ready:     15,     // rounds in the module's own feed
reload:    8.0,    // s, ship magazine → ready feed, blocked if `feed` part is dead
```

Split by our existing `WEAPON_TYPES`:

- **Kinetic** — `cannon`, `rail`, `missile`, `flak` — consume finite stores. Salvageable from
  wrecks. Heavy: stores have mass and mass changes handling, which `controls.md` §6.4 already
  models.
- **Energy** — `beam`, `lance`, `pd`, `mining` — consume reactor pips only. Infinite, but they
  compete with shields and engines through the widget that already exists.

Two currencies, one existing UI, and a genuine loadout decision: an all-energy build never
runs dry but can never alpha-strike, because the pips are finite in a different way.

**Materials.** Two tiers, deliberately not four:

```
Tier 0  scrap        — from any cut section
Tier 1  alloy        — structure, armour, hulls
        composite    — shielding, heat, hull plate
        electronics  — sensors, reactors, fire control
```

Breakdown rates, from `ModuleDef.mass`:

| output | rate | applies to |
|---|---|---|
| `alloy` | `round(mass × 0.10)` | all modules |
| `composite` | `round(mass × 0.03)` | armour and structure modules |
| `electronics` | `round(mass × 0.02)` | weapon, sensor and reactor modules |

At the 340 kg example module in `ARCHITECTURE.md`, a scrapped cannon bank yields ~34 alloy
and ~7 electronics. A breached hardpoint repair should cost ~60 alloy. That is roughly two
scrapped modules per breach — legible, and arithmetic a player can do in their head.

**Explicit non-goal:** there is no market, no price, and nothing to sell to. `salvage.js`
already says this and the brief already forbids it. Materials are a *sink*, not a currency.
BD's chain is four tiers deep because it feeds a factory and an exchange; ours feeds repairs,
so two tiers is the honest depth.

---

### 6.5 — P5. The codex

**Owner:** UI.
**Cost:** small. It is a screen over registry data that is already validated at import.
**Why fifth:** it is the mechanism that makes "knowledge is the progression" true rather than
aspirational, and it is the direct answer to "character progression separate from the ship is
out of scope."

Contents, per entry, all from fields that already exist:

```
NAME                         (ModuleDef.name)
[live 3D preview]            (build(ctx) at lod 1, the refit screen already does this)
"one-sentence description"   (ModuleDef.description)

Class        <hardpoint> · tier <n>
Origin       <faction>
Mass         <n> t
Arc          <yawCentre ± halfArc>          } from WeaponDef where present
Range        <n> m                          }
Ammunition   <ammoClass or "reactor">       } from 6.4
Parts        <PartDef labels>               } from 6.2
Seen         unknown | scanned | salvaged | installed | scrapped
```

Adopt BD's card discipline exactly: **fixed frame, variable slots, one-sentence functional
description, learn it once.** Show `--` where a value does not apply rather than hiding the
row, because a consistent frame is what makes 40 entries readable at a glance.

The `Seen` state is the progression. A player who has read the codex knows a Coalition rail
battery out-ranges everything they own before they meet one.

---

### 6.6 — P6. World-space state, and displays that can be shot

**Owner:** UI + VFX.
**Cost:** small.
**Why sixth:** it closes a logged defect (report 10: "Panel text is low contrast against
bright backdrops... Panels overlap the ship at some framings") using Beta Decay's SYNi
idiom rather than by nudging a panel.

Two halves:

**(a) State on the object.** Hardpoint structure, module condition and breach warnings render
as small world-space tags anchored at each mount, fading in on hover and while the refit or
targeting context is active. The hull becomes its own readout. This is BD's Injury display
and its Visual Inventory, applied to a ship. It frees panel space and it makes damage
*locatable*, which matters for a ship whose whole combat model is bearing and arc.

**(b) The display is fed by a breakable object.** BD's fire-control radar feeds a tactical
systems display; break the radar and the display shows nothing. We already have `sensor` in
`SUBSYSTEM_KINDS`. Wire it: as the sensor subsystem loses HP, the tactical overlay degrades
in a specific, staged, legible way rather than uniformly fading.

| sensor HP | overlay state |
|---|---|
| 100–70 % | full: identities, classes, subsystem rings, projected arcs |
| 70–40 % | classes only; subsystem rings unavailable on hostiles beyond 6 km |
| 40–15 % | contacts reduce to unresolved blips beyond 6 km — the same `MASS SIG · UNRESOLVED` treatment `controls.md` §5.5.1 already specifies for the strategic overlay |
| below 15 % | contacts only inside 2 km; the strategic overlay stops updating and draws stale with an age readout |

That last row reuses machinery `controls.md` §5.7 already committed ("stale data is drawn
desaturated with an age readout, and can be wrong"). We built the honest-staleness mechanism
for the strategic layer; this makes the enemy able to *cause* it.

---

### 6.7 — P7. Patterns

**Owner:** Salvage + Refit.
**Cost:** small.

BD gates fabrication on blueprints. Our version: cutting an *intact* section at condition
≥ 0.6 has a chance to also yield a **pattern** for that module. Holding a pattern lets you
build the module from materials at the refit bay instead of needing a physical copy.

```js
patternCost: {                       // per ModuleDef, derived, not authored
  alloy:       round(mass × 0.35),
  composite:   round(mass × 0.10),   // armour/structure modules
  electronics: round(mass × 0.08),   // weapon/sensor/reactor modules
}
```

Roughly 3.5 scrapped modules' worth of alloy to build one from a pattern — expensive enough
that finding the real thing is still better, cheap enough that a player who knows what they
want is never hard-blocked by the RNG. It converts a luck problem into a materials problem,
which is the correct trade in a roguelike.

---

### 6.8 — P8. Reputation consequences

**Owner:** World sim.
**Cost:** small. Deepens something already built.

Report 9 says it plainly: "Reputation moves but its consequences are shallow."
`controls.md` §5.7 already gives one real consequence (standing pickets at ≤ −40 adding
+0.25 heat). Add two more, both cheap and both using BD's idea that gear signals allegiance:

1. **Worn colours.** A hull carrying ≥ 3 modules of one faction shifts that faction's
   reaction threshold. Their patrols hold fire longer; the other faction's engage sooner.
   `ModuleDef.faction` already carries visual identity onto our hull — this makes the visual
   fact a mechanical one, which is the most satisfying kind of coupling available.
2. **Salvage rights.** At reputation ≥ +40, a faction's patrols will not contest you cutting
   the *other* faction's hulks in their space. At ≤ −40, they will. The faction war is already
   described as "a salvage crop"; this makes standing decide who gets to harvest it.

---

### 6.9 — P9. The constructed script

**Owner:** Materials.
**Cost:** very small. The generator exists.

Extend the runtime 5×7 block glyph set into two divergent faction scripts — a rectilinear
Coalition set and a swept Concord set, matching the hull languages already established in
report 5. Hull codes, mount identifiers, hazard legends and bay markings all draw from the
faction's own script.

Constraints from existing docs, which this must not break: `ship-language.md` §4 caps
functional markings at six per ship with glyph height ≥ 12 m, and `ARCHITECTURE.md`
non-negotiable 5 forbids image files. Runtime glyph generation satisfies both.

The identity win: a salvaged Coalition module carries Coalition lettering onto our hull, and
the mismatch of two scripts on one ship is exactly the "welded on by a crew" read that
`ship-language.md` §5 is chasing — for free, from a generator that already runs.

---

### 6.10 — P10. In-game DevTracker

**Owner:** UI.
**Cost:** trivial. Low priority, listed because it is genuinely good practice.

Render `docs/review/acceptance.md`'s table in-game behind a debug key. Beta Decay ships its
roadmap as a 100 %-complete feature, and our acceptance doc already has the honesty culture
("`UNVERIFIED` means it was not measured, not that it failed"). Making it visible costs
nothing and keeps it true.

---

### 6.11 What to explicitly not do

| Rejected | Why |
|---|---|
| Sub-attachments on modules (BD's Weapon Mods) | Content cost multiplies, silhouette audit pair count multiplies, adds nothing `tier` does not. BD rate it "not a priority" themselves. |
| A four-or-five-tier material chain | BD's depth is justified by a factory and an exchange. We have neither and the brief forbids both. Two tiers. |
| Any market, price or vendor | Out of scope, and `salvage.js` already made the right call. |
| A contract terminal | Out of scope (missions), BD's own weakest system at 35 %, and `controls.md` §5.7's battle countdown already delivers the in-scope version. |
| Character needs, implants, exosuits, outfits | Out of scope (character progression separate from the ship). The in-scope shape is ship consumable state — §6.4. |
| Weather | Space has no weather. POI conditions — §6.3 — is the translation. |
| A crafting minigame at any tier | This is the exact fiddliness §3.1 identifies BD as avoiding. Put material in; it comes out. FIFO. |

---

## 7. The three things to take from Beta Decay even if we build none of the above

1. **Add nouns, not verbs.** Every unit of depth BD bought cheaply was a database row with a
   name, a mass, a durability and one sentence. Every expensive thing was an interaction.
   Our registries are already shaped for this.
2. **Name the three features each new system makes cheaper.** BD's ECS pays for five. If a
   proposal pays for none, it is a feature and should be priced as one.
3. **Publish the systems, because knowledge is the progression.** BD has no skill tree and a
   289-entry encyclopedia, and those two facts are the same fact. Our brief rules out
   character progression; §6.5 is what makes that a position rather than an absence.

---

## Appendix A — pages read

All read 2026-07-28.

**Primary site**
- https://www.rotoscopestudios.com (home / about)
- https://www.rotoscopestudios.com/roadmap — the single most information-dense page; full feature list with the developer's own completion percentages
- https://www.rotoscopestudios.com/database — category index and counts
- https://www.rotoscopestudios.com/presskit
- https://www.rotoscopestudios.com/sitemap.xml, /blog-posts-sitemap.xml — used to enumerate all 289 post URLs after category pagination proved to expose only 8 entries per view

**Category pages** (each exposes 8 of N)
- /database/categories/faq (68), /components (51), /equipment (27), /structures (4), /mcv-components (8)

**FAQ entries read individually** (39 of ~68)
what-is-the-gameplay-loop · what-is-the-genre-of-beta-decay · is-the-game-an-rpg ·
is-there-permadeath · will-there-be-skill-trees · what-features-can-we-expect-for-early-access ·
is-there-base-building-home-ownership · can-you-create-and-customize-your-own-mcv ·
will-there-be-weapon-customization · when-will-we-start-to-see-spaceship-construction ·
is-there-destruction · what-is-the-art-style · what-is-the-risk-of-scope-creep ·
is-the-game-low-poly · will-you-add-more-color… · is-there-a-setting-to-turn-off-the-pixelation ·
are-there-loading-screens · do-hazmat-suits-and-gas-masks-serve-a-purpose · is-the-game-open-world ·
will-there-be-npcs-companions-crewmates · will-there-be-mundane-jobs · can-you-create-your-own-faction ·
what-language-does-the-game-use · what-does-beta-decay-mean · is-the-game-an-extraction-shooter ·
will-there-be-single-player-campaigns · how-big-is-the-universe-how-many-planets-are-there ·
will-there-be-exo-suits · will-there-be-other-vehicles ·
the-game-is-low-poly-so-the-game-should-run-on-any-machine-right ·
will-there-be-mod-support-steam-workshop · is-the-game-voxel-based · playtesting-legacy ·
status-of-the-unreal-engine-5-8-upgrade · does-the-game-use-asset-packs ·
how-extensive-is-the-key-re-binding · does-the-game-make-use-of-ai-generated-assets… ·
does-the-game-uses-mandatory-taa-dlss · rotoscope-studios-previous-projects

All at `https://www.rotoscopestudios.com/post/<slug>`.

**Database entries read individually** (19)
fabricator · processor · chalcopyrite · copper-ingot · ethylene · polyethylene-pe · m16a2 ·
5-56-45mm-ammunition-m16a2 · biocell-medium · mask-air-mki · air-filter · scope-mkiv ·
seismic-sensor · battery · subscriber-identity-chip-sic · m-tp-17-fire-control-radar-fcr ·
aul-mki-autoloader · 2a65-77 · eil-mki-optical-scanner

**Off-site**
- https://store.steampowered.com/app/1416070/beta_decay — genre, tags, feature list
- https://rotoscopestudios.itch.io/betadecay and /devlog — player count, tooling, two public devlogs
- https://indiegamesdevel.com/beta-decay-an-ambitious-and-remarkable-dystopian-voxel-based-rpg-developed-by-rotoscope-studios/ — third-party coverage, art influences

## Appendix B — what could not be read, honestly

- **The Patreon devlogs.** 41 published, and they are where the real implementation detail
  lives. `patreon.com/betadecay/posts` and the individual public post
  `patreon.com/posts/development-35-144798483` both returned **HTTP 403** to automated fetch.
  Everything in §2 is therefore reconstructed from the roadmap, the item database and the
  FAQ, not from development writeups. If the owner wants a second pass, a human with a
  browser reading Devlogs 30–42 would sharpen §2.4 and §2.6 considerably.
- **~29 FAQ entries** not fetched individually, selected out as low design relevance
  (pricing, file size, console/Mac availability, system requirements, localisation, OST
  distribution, how-to-contribute, community forums, media policy, server player counts).
  All 68 URLs were enumerated, so nothing was missed for lack of a link.
- **The remaining ~250 database entries.** 19 were read directly, chosen to cover every
  distinct card format (ore, ingot, monomer, polymer, weapon, ammunition, attachment,
  equipment, consumable, mask, MCV component, structure, implant). The field vocabulary in
  §4.5 is therefore complete-as-observed but may be missing slots that appear only on
  categories I sampled thinly (Headwear, Organics, Alloys, OST).
- **Five roadmap features are literally "TBA"**, at 75 / 60 / 55 / 55 / 40 %, held for a 2026
  trailer. Between them they represent a meaningful fraction of Early Access scope and I
  cannot say what they are.
- **The YouTube trailer** (`youtube.com/watch?v=YfG9D8hJVeA`) and the **Discord** were not
  viewed. Moment-to-moment play in §1.3 is assembled from written evidence and third-party
  coverage; it is not a play report and should not be quoted as one.
- **Numbers I would not lean on.** Nothing in §6 is derived from Beta Decay's balance
  figures — BD publishes almost no balance numbers at all (most `Durability` fields read
  `--`). Every constant in §6 is ours, derived from `core/units.js` and the existing design
  docs, and every one is untested by hand.
