# Reference research, pass 2 — the competitive intelligence the other streams design against

**Status:** research only. This pass wrote no code and edited no source file. Every external
claim carries a URL; every claim about our own code carries `file:line` read out of the code
on 2026-07-29, not out of a design document.

**What this pass adds that pass 1 did not have:** a game called **Cogmind** that has shipped
our headline differentiator since 2015 and publishes the formula for it; the **full 289-entry
Beta Decay taxonomy** (pass 1 read 19 of them), which turns "what does Beta Decay choose to
simulate" from an inference into a count; **NLIPS**, the Homeworld mechanic that makes fleets
readable, which appears nowhere in our docs or code; and **Everspace 2's device modes**, a
variance generator that costs almost nothing.

It also corrects two claims in our own docs that reality does not support, and confirms two
others that the code has quietly outgrown.

---

## 0. What pass 1 already covered — do not re-research this

Four documents. Between them they are thorough and I have not duplicated them.

| Document | Lines | Covers |
|---|---|---|
| `docs/design/beta-decay-systems.md` | 942 | Beta Decay's roadmap, FAQ (39 of 68 entries), 19 database cards; six principles (§3); a 33-row translation table (§5); ten prioritised additions P1–P10 (§6); an honest "what could not be read" appendix (§B) |
| `docs/design/closest-comparables.md` | 899 | Falling Frontier in depth; feature-by-feature comparison against our code; where they are better (10 items) and where we are better (10 items); the roguelike "what does a run produce" question (Part Five) |
| `docs/design/shelf-survey.md` | 505 | 40+ Steam titles with review counts and CCU; 14 proven failure modes F1–F14; 10 adopt items A1–A10; 9 refusals N1–N9 |
| `docs/design/fun-systems.md` | 1102 | Everspace 1 and 2, Homeworld 1/2/RM/3, FTL, Nebulous, Highfleet, BFG:A2, Star Citizen, X4/Avorion/Cosmoteer; decision texture; 12 prioritised recommendations P1–P12 |

Specifically already established and **not repeated here**: Everspace 1's escalation timer and
"death is a payday" framing (`fun-systems.md:49-64`); Everspace 2's inventory complaint as its
#1 criticism (`fun-systems.md:109-115`); Homeworld's Salvage Corvette
(`fun-systems.md:152-161`); Homeworld 3's replacement of tactical-support abilities with stat
buffs (`fun-systems.md:168-178`); War Games artifacts as exclusive-choice-with-stated-cost
(`fun-systems.md:180-187`); the whole failure-mode table F1–F14 (`shelf-survey.md:265-338`).

---

## 1. Corrections — where a doc, or the folklore around it, disagrees with the world

### 1.1 `shelf-survey.md:147` is wrong. Somebody does own it, and has for a decade

The competitive positioning table claims:

```
| **Salvage yield determined by how you fight** | **Nobody** | **This is ours** |
```
— `docs/design/shelf-survey.md:147`

**Cogmind** (Grid Sage Games, 2015 EA / 2024 1.0, **95% of 1,546 Steam reviews**) has published
this exact mechanic in its manual for years. From the manual, verbatim:

> "How much of a robot remains to salvage when it is destroyed depends on the value of its
> cumulative 'salvage modifier' which reflects everything that happened to it before that
> point. This internal value is initially set to zero, and each projectile that impacts the
> robot will contribute its own weapon-based salvage modifier to the total."
> — [Cogmind manual](https://www.gridsagegames.com/cogmind/manual.txt), §Salvage

The full model, all four terms, quoted from the same section:

| Term | Formula | Reading |
|---|---|---|
| Per-part survival | `(percent_remaining_integrity / 2) + salvage_modifier` | more damaged parts are more likely to be destroyed with the target |
| Heat melt | `(heat - max_integrity) / 4` | **big parts resist heat, small parts melt** |
| Corruption fry | `system_corruption - max_integrity` | only ever kills small electronics |
| Matter drop | salvage potential × salvage modifier, floored at zero | a large enough negative modifier zeroes the payout |

Weapon-class polarity, quoted from the same document and from a Steam discussion:
electromagnetic weapons have **positive** salvage modifiers, ballistic cannons and explosives
have **negative** ones, ordinary guns are near zero
([manual §Salvage](https://www.gridsagegames.com/cogmind/manual.txt);
[Steam: "Force rifles, are they really supposed to have positive salvage?"](https://steamcommunity.com/app/722730/discussions/0/1738841319821924622/)).

**Why this correction matters and why it is good news, not bad.**

1. The claim on line 147 should be rewritten to *"determined by how you fight, on a capital-ship
   scale, in real time, inside a battle that is not yours."* Cogmind is turn-based, single-unit,
   ASCII, and its salvage is a loot roll on a dead robot. The overlap is the *idea*, not the game.
2. It is the strongest possible validation. The single mechanic our shelf survey identifies as
   our moat is the mechanic that carries a 95%-rated roguelike, and its designer has published
   the arithmetic. We are not speculating; we are following a proven curve.
3. **We currently only have half of it.** Our salvage depends on *where* you hit
   (`src/sim/ship.js:363` — salvage-weighted mean of section condition; `src/sim/ship.js:733` —
   a reactor kill floors every section at 0.15). It does not depend at all on *what you shot it
   with*. `grep -rn "salvageMod" src/` returns nothing, and the `WeaponDef` typedef at
   `src/core/contracts.js:75-95` has 18 fields and no salvage term. That is the gap, and R1
   below closes it.

Cogmind is absent from all four pass-1 documents (`grep -ril cogmind docs/` returns nothing).
It is the most relevant single reference in this document.

### 1.2 Two `fun-systems.md` gap claims have been closed by the code and the doc did not notice

- **`fun-systems.md:588` — "Module `mass` is declared and never applied."** Stale.
  `src/sim/refit.js:245` computes `ship.massLoad = 1 + installedMass / REFERENCE_FIT_MASS`, and
  `:248-249` divide acceleration by it and turn rate by its square root. Mass is applied.
- **`fun-systems.md:596` — "Module `condition` never affects performance."** Stale.
  `src/sim/condition.js` exports `fireRateMul` (:69), `traverseMul` (:77), `damageMul` (:85),
  `misfeedChance` (:100), `grantMul` (:109), `coolingMul` (:117) and `isInert` (:124), and
  `MISFEED_STALL = 2.0` at :106.

Do not spend a stream on either. Both were beta-decay-systems P1/P5 and both landed.

### 1.3 `look-target.md` §2's field swap is still entirely unbuilt, and it is the hook for R10

`docs/design/look-target.md:82` says *"`src/sim/refit.js` declares `installTime = 2.5` and never
consumes it. That is the hook."* That is still exactly true: `installTime` appears once, at
`src/sim/refit.js:51`, and nowhere else in `src/`. There is no jettison path, no hot-swap path
and no field-weld condition penalty anywhere in `refit.js` — `grep -n "field\|penalty\|hotSwap\|
jettison" src/sim/refit.js` returns nothing. Cogmind has shipped the exact rule this needs; see R10.

### 1.4 The prior Beta Decay pass's roadmap reading reproduces exactly, one day later

I re-fetched [the roadmap](https://www.rotoscopestudios.com/roadmap) on 2026-07-29 and every
figure `beta-decay-systems.md:84-88` cites is unchanged: Roles and Contracts at **35%**, the
lowest number on the Early Access board; manufacturing, economy, allegiances, phenomena and the
ECS all at **75%**; DevTracker and Alphabet the only two features at **100%**; five TBA entries
at 75 / 60 / 55 / 55 / 40 held for a 2026 trailer. That document's central evidential claim
holds. Beta Decay itself is still **unreleased** — the [Steam page](https://store.steampowered.com/app/1416070/beta_decay/)
says "Coming soon to Early Access", release date TBA, no user reviews.

---

## 2. Beta Decay — answering the owner's question with a count instead of an impression

> *"How do we make Nadir Point the space-game version of Beta Decay?"*

`beta-decay-systems.md` §3.1 answers this with **"simulate the noun, abstract the verb"** and
that answer is correct. What it could not do, having read 19 of the ~289 database entries, was
show *which* nouns. I recovered all 289 slugs from
[`blog-posts-sitemap.xml`](https://www.rotoscopestudios.com/blog-posts-sitemap.xml) and counted
them. The counting is the finding.

### 2.1 The full taxonomy, by count

| Group | Count | Examples |
|---|---|---|
| **Furniture and fixtures** | ~55 | `couch`, `bed-single`, `kitchen-sink`, `stove`, `washing-machine`, `office-chair`, `wooden-table-1x1x1`, `wooden-table-1x2x1`, `wooden-table-1x2x2`, `trash-bin-type_1`, `trash-bin-type_2`, `dumpster-type_1`, `koffo-automatic-drip-coffee-machine`, `vending-machine-soda`, `whiteboard`, `step-ladder`, `disc-holder` |
| **Chemistry: ores → metals → ingots** | ~24 | `chalcopyrite`, `galena`, `magnetite`, `bauxite`, `chromite`, `argentite`, `rutile`, `quartz` → `copper`, `_lead`, `_iron`, `titanium`, `platinum`, `silver` → `copper-ingot`, `titanium-ingot`, … |
| **Chemistry: monomers → polymers** | ~16 | `ethylene`→`polyethylene-pe`, `propylene`→`polypropylene-pp`, `isoprene`→`polyisoprene-ir`, `caprolactam`→`nylon-6-pa6`, `bisphenol`→`polycarbonate-pc`, `acrylamide`→`polyacrylamide-pam`, `vinyl-acetate`→`polyvinyl-acetate-pvac` |
| **Organics and biology** | 8 | `aspergillus-niger`, `aspergillus-oryzae`, `penicillium`, `mycelium`, `latex-sap`, `raw-cotton`, `biomass-wood`, `citric-acid` |
| **FAQ** | 68 | the developer answering questions in the same database frame as a couch |
| **Ammunition** | 18 | `5-56-45mm-ammunition-m16a2`, `5-56-45-ammunition-auga1`, `125-mm-ammunition`, `125-mm-heat-ammunition`, `aim-92-stinger-ammunition`, `fim-92-stinger-ammunition` |
| **Weapons** | ~19 | `m16a2`, `auga1`, `famas`, `__akm`, `_g3a3`, `__p90`, `gau-19`, `rpg-7`, `2a65-77`, `_m590` |
| **Weapon attachments** | 13 | `suppressor-mki`..`mkiv`, `scope-mki`..`mkv`, `bipod-mki`..`mkiii`, `foregrip-mki` |
| **Wearables and PPE** | ~22 | `mask-air-mki`, `mask-grom-mki`, `mask-grom-mkii`, `mask-pilot`, `helmet-k6-3`, `body-armor-mki`, `ghillie-suit`, `backpack-mki`, `backpack-mkii`, `boonie-hat`, `beanie`, `sunglasses` |
| **Actionable equipment** | ~14 | `gpnvg-18-night-vision`, `pvs-7-night-vision`, `shoulder-lamp-bpsl`, `seismic-sensor`, `glowstick`, `flare`, `battery`, `biocell-small/medium/large`, `blueprint`, `subscriber-identity-chip-sic` |
| **Explosives** | 6 | `mk3a3-he-grenade`, `m18-smoke-grenade`, `btv-1-flash-grenade`, `m18a1-claymore-mine`, `tm-62m-at-mine`, `m112-demolition-charge` |
| **MCV components** | ~8 | `aul-mki-autoloader`, `m-tp-17-fire-control-radar-fcr`, `eil-mki-optical-scanner`, `air-filter`, `oil-filter-centrifuge`, `fuel-injector`, `starter`, `wheel-medium` |
| **Machines and structures** | ~10 | `fabricator`, `processor`, `distribution-transformer-medium`, `pneumatic-rock-drill`, `hangar-small`, `decon-tent`, `shower-decon` |
| **OST** | 10 | `ost-goliath`, `ost-cipher`, … |

### 2.2 What the count says, that the sample could not

**The largest single group is furniture.** Fifty-five cards for couches, sinks, bins and
whiteboards, in a game about corporate warfare on a decaying colony world. Three separate cards
for three sizes of wooden table.

Here is the couch card in full, fetched 2026-07-29 from
[`/post/couch`](https://www.rotoscopestudios.com/post/couch):

```
Couch
"A comfy couch."
Class:      Components
Weight:     30 kg
Durability: --
```

Thirty kilograms. That number is the entire design philosophy in one field. The couch has a
mass because you can pick the couch up, and if you can pick it up, the game needs to know what
carrying it costs you.

Now the counter-example, from the same database
([`/post/aspergillus-niger`](https://www.rotoscopestudios.com/post/aspergillus-niger)):

```
Aspergillus Niger
"A fungal mold strain harvested as a source of enzymes and organic acids, serving as a
 key ingredient in biochemical manufacturing."
Class:        Raw Material > Organics
Processes To: Citric Acid
Durability:   --
```

*Aspergillus niger* is the actual industrial organism used to produce citric acid in the real
world. That is not flavour text; it is the correct answer.

**And now what is absent.** There is no card for hunger. No card for allegiance standing. No
card for the economy, the weather, injury, or the Centauri Exchange. Those are five of Beta
Decay's biggest roadmap features and not one of them has a database entry.

### 2.3 The governing principle, stated as a decision procedure

`beta-decay-systems.md` §3.1 got the shape right — nouns detailed, verbs abstracted — but the
count sharpens it into a rule you can apply without judgement:

> **A thing gets modelled in named, massed, individual detail if and only if the player can
> pick it up, wear it, put it in a machine, or shoot it. Everything else is a rate.**

That is the line. It explains every observation at once:

- The couch is an object → 30 kg, a card, an ID.
- Hunger is not an object → a decay rate on a bar, no card.
- The magazine is an object → **eighteen** ammunition cards.
- The cartridge is not an object → note that `5-56-45mm-ammunition-m16a2` and
  `5-56-45-ammunition-auga1` are the *same 5.56×45 round* under two cards, because what you
  hold is not a cartridge, it is a magazine, and the AUG's magazine is a different physical
  object. The AUG card reads *"A slightly curved detachable box magazine designed for the AUGA1
  rifle that holds 30 rounds. Class: Ammunition. Weight: 1 kg. Capacity: 30 Round Magazine"*
  ([`/post/5-56-45-ammunition-auga1`](https://www.rotoscopestudios.com/post/5-56-45-ammunition-auga1)).
- The blueprint is an object → *"A mini-disc that contains pre-programmed, production-ready
  instructions for production and manufacturing. Class: Equipment. Weight: 0.5 kg"*
  ([`/post/blueprint`](https://www.rotoscopestudios.com/post/blueprint)). **A blueprint in Beta
  Decay is a half-kilo disc you carry, not a checkbox in a menu.** Keep hold of that; it is R11.
- The refining reaction is a verb → the Processor's entire interaction is put material in,
  FIFO, it comes out refined. No minigame.

The corollary the earlier pass drew — "if you want depth cheaply, add nouns, not verbs" — is
right, and the count tells you *which* nouns: the ones with a mass.

### 2.4 The same principle applied to a game with no hands

We have no character, so "can the player pick it up" needs a translation. The honest one is:

> **A thing gets a card if it can occupy hold volume, bolt to a mount, be shot off, or be
> consumed. Everything else is a rate on something that can.**

Run our systems through it and the answers fall out without argument:

| Ours | Object or rate? | Card? | Where it stands today |
|---|---|---|---|
| Module | object — bolts to a mount | yes | `ModuleDef` at `src/core/contracts.js:109`, `registerModule` at `:266` |
| Item / device | object — consumed | yes | 5 of them, `src/sim/meta/items.js:43,78,121,157,182` |
| Ammunition | object — occupies stores, has mass | yes | `AMMO_FOR_TYPE`, `src/sim/stores.js:31-38` |
| Material | object — occupies volume | yes | `MATERIAL_VOLUME`, `src/sim/meta/materials.js:47-53` |
| **Pattern** | **currently a rate; should be an object** | **yes, and it is not one** | `this.known = new Map()`, `src/sim/meta/patterns.js:62` — see R11 |
| Heat | rate on a mount | no | correct as-is |
| Reputation | rate on a faction | no | correct as-is |
| Power routing | rate | no | correct as-is |
| Propellant | object-ish — has mass, has volume | borderline, currently a rate | `src/sim/stores.js` |
| Perk | rate attached to the hull | no | 7 of them, `src/sim/meta/perks.js:44-96` |

Two things drop out of that table immediately. **Patterns are on the wrong side of the line**
and Beta Decay's blueprint tells us exactly which side. And **perks are correctly a rate** —
which is a real defence of `scope-decision.md`'s ship-bound-progression rule, not a compromise.

### 2.5 Three more Beta Decay findings pass 1 did not have

**(a) The world is small on purpose, and they said so.** The unread FAQ entry
[`/post/early-access-game-world-play-size-planetary-terrain`](https://www.rotoscopestudios.com/post/early-access-game-world-play-size-planetary-terrain):
Early Access "will likely feature either a smaller-scale planet or a limited section of a larger
planet"; the terrain is "handcrafted, with little to no procedural generation"; the goal is "a
world packed with detail, rather than an open, barren, and uninteresting landscape." That is
`scope-decision.md`'s "one deeply built system, as before" written by somebody else, and it is
worth quoting at anyone who proposes a second star system.

**(b) The database frame absorbs the FAQ.** Sixty-eight of the 289 entries are FAQ answers,
served through the same `/database/categories/` machinery as the couch. The developer's answers
to "is there permadeath" and the mass of a couch are the same UI. That is §4.5's "fixed frame,
variable slots" taken further than pass 1 recorded — the frame is not just for items, it is the
studio's entire public information architecture. Our codex (`src/sim/meta/codex.js`) should
therefore be the frame for *everything* legible, including the objectives brief and the faction
war state, not only modules.

**(c) `Durability: --` on the couch, the blueprint, the magazine and the fungus.** Every card I
fetched shows the field and leaves it blank. Pass 1 noted this at §4.5 and drew the right
conclusion (condition is intended to be universal). What the wider sample adds is that Beta
Decay ships the *field* long before it ships the *value* — the frame is committed first and
filled in later. Our codex already does this correctly (`DISCOVERY_STATES` with masked fields,
`src/sim/meta/codex.js:25-38`).

---

## 3. Everspace 1 and 2 — more of the "changes what you can do" class

`scope-decision.md:16` already carries the headline lesson. Here is the next layer, which is
about *how the capability is packaged*, not whether it exists.

### 3.1 Everspace 1: the capability is a prohibition

From the [ships/guns/gadgets guide](https://steamcommunity.com/sharedfiles/filedetails?id=971289834):

| Class | Can do what nobody else can | **Cannot do at all** |
|---|---|---|
| Colonial Interceptor | all primary weapons; Shield Disruptor and Weapon Overdrive are exclusive | — |
| Colonial Scout | **Cloak** and **Teleporter**, both exclusive; highest speed and energy regen | **cannot equip conventional shields**; lowest hull |
| Colonial Gunship | highest hull; **turrets and drones**, exclusive | **"It is not possible to equip a shield device"** |
| Colonial Sentinel | fast hacking; extra modification slots | **one primary weapon slot, non-upgradeable** |

Note the shape. Every class is defined by a **pair**: one capability nobody can buy, and one
thing it is flatly forbidden. Not a −15% modifier. `fun-systems.md:66-72` caught this; what it
did not stress is that the *prohibition* is doing more work than the capability. "Cannot equip
shields" is what forces the Gunship player to invent a different game.

**And the energy economy is the second half.** Passive devices *reserve* a block of energy
permanently via an "En Allocate" stat; active devices *spend* a burst. Fitting a passive
permanently shrinks the pool your actives draw from. Loadout stops being slot-filling and
becomes budgeting, from one design choice.

Our nearest equivalent is the power plant's four channels. We have the budget; we do not have
the reservation. A module whose `grants` block *permanently removes* two reactor pips in
exchange for a capability would be the direct translation, and it would make the four-way
split matter outside combat — which `fun-systems.md:205-212` identifies as its weak point.

### 3.2 Everspace 2: twelve devices, and every one changes a verb

The full list, from [GameSkinny](https://www.gameskinny.com/tips/everspace-2-best-ship-devices-guide-and-full-list/):

| Device | Effect (as written) |
|---|---|
| EMP Generator | "Creates an EMP blast around your ship that disables all hostiles for a few seconds" |
| Corrosion Injector | "Afflicts the target with corrosion to deal damage over time" |
| Magnetic Repulsor | "Pushes the target toward a location, causing it to take increased collision damage temporarily; has three charges" |
| Annihilator Virus | "Infects the main target with a virus that spreads to nearby hostiles (up to a maximum of six enemies)" |
| Quantum Entangler | "Any damage done to you will also be applied to the target with increased intensity for 18 seconds" |
| Teleporter | "Instantly teleports your ship forward; has four charges" |
| Energized Boost | "Instantly catapults the ship forward via a speed boost for five seconds" |
| Front Shield Generator | "Projects an impenetrable shield in front of your ship" |
| Fusion Hook | "Attaches to surfaces and pulls you toward the target location; has four charges" |
| Nano Transmitter | "Repairs the ship hull for 40% of the damage dealt while active" |
| Temporal Nano Recompensator | "Restores a percentage of armor damage taken in the last 16 seconds" |
| Missile Defense System | "Destroys all incoming missiles in a radius around your ship for 28 seconds" |

**Not one of them is a percentage.** Every entry names a *thing that becomes possible*:
repositioning through geometry (Teleporter, Fusion Hook), converting incoming damage into
outgoing (Quantum Entangler), converting outgoing damage into hull (Nano Transmitter), making a
whole damage category not exist for 28 seconds (Missile Defense System). That is the standard
`scope-decision.md` should be enforced against, and `src/sim/meta/items.js` currently meets it:
`coolant_purge` (:43) sells a future cooldown for a present burst, `decoy` (:78) removes a
threat category, `boarding_charge` (:121) converts a kill into a prize, `scan_pulse` (:157)
buys information with heat, `jury_rig` (:182) trades permanent capacity for immediate survival.
Five for five. Hold that line.

### 3.3 The finding worth stealing: **device modes**

Every Everspace 2 device carries **three named alternate modes**, unlocked by mastering the
device (four upgrades), of which you pick one. The Teleporter's, verbatim:

- **Scurry** — 25% chance to refund a charge.
- **Parting Gift** — leaves a proximity mine behind.
- **Face Off** — face the opposite direction after teleporting.

Front Shield Generator gets Avenger / All Day / On Your Left; EMP Generator gets Short Circuit /
Hard Reset / Shield Surge; Magnetic Repulsor gets Swing Together / Serial Pusher / Energy Leak
([GameSkinny](https://www.gameskinny.com/tips/everspace-2-best-ship-devices-guide-and-full-list/)).

Look at what "Face Off" does. It is one boolean, it costs nothing to implement, and it converts
an escape tool into an attack tool. That is the highest fun-per-line ratio in this entire
document, and we already have the five devices to hang it on. See R5.

**The caution attached to it**, from the same game's forums and already in
`fun-systems.md:116-122`: modes must not become a fourth inventory tier. Everspace 2's #1
complaint is loot juggling. Three modes per device, chosen once, is the ceiling — not modes on
modules, not modes on ammunition.

---

## 4. Homeworld — scale, composition, readability, and the feel of mass

`look-target.md:33` makes Homeworld binding for "scale and composition". Pass 1 studied
Homeworld's *gameplay* (`fun-systems.md:143-187`) and its *control failures*
(`controls.md:19-33`). Nobody studied how Homeworld actually makes a fleet legible. That is
this section.

### 4.1 NLIPS — the single mechanic that makes Homeworld readable, and we do not have it

**Non-Linear Inverse Perspective Scaling.** When the camera is far from a ship, Homeworld draws
that ship **larger than perspective says it should be**. The scaling is non-linear in camera
distance, so close-up framings are untouched and distant ones are progressively exaggerated.

Why it exists, stated plainly by the community that plays with it off: without NLIPS, strike
craft "appear as indistinguishable specks next to a colossal mothership, and what they're doing
in large fights can be very difficult to understand at a glance"; disabling it "makes small
ships nearly impossible to see, requiring frequent use of the tactical overlay and playing at
higher resolution"
([Disable NLIPS, ModDB](https://www.moddb.com/downloads/disable-nlips);
[Steam: Was bewirkt "NLIPS"?](https://steamcommunity.com/app/244160/discussions/0/617328967244535207/)).

The trade is honest and Homeworld took it anyway: NLIPS is less physically correct and more
legible, and legibility won.

**Our exposure, measured.** `src/core/units.js:63-64` sets the camera range at **260 m** ("cruiser
fills the frame") to **46,000 m** ("cruiser is a bright speck"). A fighter is 18 m and
`BUDGET.fighterTris` is 150 (`src/core/units.js:83`). The strategic overlay does not begin to
blend in until `zoomT ≥ 1.00` and is not full until 1.35 (`src/camera/constants.js:56-58`), and
its only consumer dims the 3D scene (`src/game.js:231`). So across the entire mid-band — call it
3 km to 46 km — an 18 m fighter is sub-pixel, and the player has no overlay yet.

`grep -ril "nlips\|inverse perspective" docs src tools` returns **nothing**. This is a gap, it
is cheap to close, and it is the single highest-leverage thing Homeworld has to teach us that
we have not already taken. See R3.

### 4.2 Silhouette from every angle, and two ships that tell you which way is up

Rob Cunningham, Homeworld's art director, in
[a GOG interview](https://www.gog.com/forum/general/interview_homeworlds_rob_cunningham_18367):

> each ship had to have "an easily identifiable silhouette from every angle for clarity of
> gameplay"

and, on the two motherships:

> they were "designed as basically a giant tall tower and a huge flat slab to always show the
> player 'this is up/down and this is flat' at a glance"

with the galaxy backdrop chosen because its spiral provides "an excellent horizontal orientation
function for the player." His stated influences are Peter Elson, Chris Foss and John Harris, for
their "simple forms and bold colour schemes", and his surface rule is "fine detailing that did
not simply repeat over and over down the hulls" — "logic-driven design" with "painted decals and
tight industrial functional details".

Three things there are directly binding on us.

1. **"From every angle"** is stricter than our silhouette audit. `ship-language.md`'s plan-view
   enclosure figure (HANDOFF.md:106 records 6.30% against a 6–12% band) is one projection. The
   Homeworld rule is *all* of them.
2. **Two ships as orientation anchors** is free. We are plane-locked at y = 0
   (`ARCHITECTURE.md:110`), so up/down disambiguation is less critical — but *which faction* and
   *which way is forward* are, and one tall Coalition silhouette against one flat Concord
   silhouette does that work with no code at all. See R13.
3. **"Detailing that did not simply repeat"** is the same argument as `ARCHITECTURE.md:25`
   ("detail density is capped") arriving from the opposite direction, and it is the standing
   answer to HANDOFF.md:114's open `D-INT1` (78.1/20.3/1.6 calm/medium/dense against a 60/30/10
   target). The fix Cunningham describes is not *more* detail; it is *non-repeating* detail.

### 4.3 Engine trails are a rangefinder, not a VFX

From the Homeworld Remastered community, on why trails are drawn the way they are: "capital craft
and fighters have different engine trails" and "the engine trails serve as a core part of
distance visibility and trajectory"; the developers differentiated "accelerated flight and
unaccelerated 'cruising' by altering the appearance of ships' ion trails"
([Steam: Engine trails](https://steamcommunity.com/app/244160/discussions/0/617328415074249808/)).

So the trail encodes three things a player needs at range and cannot otherwise get: *that
something is there*, *which class it is*, and *whether it is burning or coasting*. At 20 km
that is the only information channel left. See R12.

### 4.4 Formations are a capability, not a decoration

Homeworld's formation set, from [HomeworldAccess](https://www.homeworldaccess.net/viewpage.php?page_id=17)
and [Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Formations):

| Formation | What it is for | The cost |
|---|---|---|
| Delta | 2D arrowhead; focuses a stream of alpha damage | the lead ship takes everything |
| Broad / Wall | line abreast; **the capital-ship formation**, maximises simultaneous firepower | wide, slow to turn |
| X | small fighter groups (≤15) concentrate fire | tight spacing feeds enemy turrets |
| Claw | the premier fighter formation; X's focus without X's density | capped at 15 |
| Sphere | capital at the centre, escorts orbiting; defensive | contributes little offence |
| Military Parade | auto-adopted with carriers present | friendly fire; not a combat formation |

And stances layer on top: aggressive / neutral / passive, where "evasive... puts most of the power
to the engines and makes them hard to hit"
([TheGamer](https://www.thegamer.com/homeworld-3-useful-beginner-tips-tricks/)).

Every one of these is a **positional trade with a stated cost** — exactly the property
`fun-systems.md:186` says our refit lacks. `src/sim/strikecraft.js` already has stances declared
(`fun-systems.md:629` logs them as declared-and-unread). Formations are the cheapest way to make
them mean something. See R14.

### 4.5 What Homeworld 3 got wrong that Homeworld 1 got right

Pass 1 has the gameplay list (`fun-systems.md:168-178`). The *compositional* failure is new here,
and it is the one `look-target.md` cares about.

**Homeworld 3 filled space up.** Where the earlier games were "almost exclusively in the open
void of space, level scenery is a constant in Homeworld 3, whether it's vast Progenitor constructs
or sometimes inexplicable natural formations." The result is a contradiction reviewers name
directly: "while the sense of scale for background structures is absolutely amazing, mission areas
feel claustrophobic due to the scale of the background derelicts," and the megaliths make "some
levels feel very constrained and directed, which is a strange feeling for a space game." Players
asked for megaliths to occupy "only a small portion of maps with the rest being dust fields and
empty space"
([GamingBolt interview](https://gamingbolt.com/homeworld-3-interview-megaliths-story-war-games-and-more);
[TheSixthAxis review](https://www.thesixthaxis.com/2024/05/10/homeworld-3-review/);
[Steam: Too much emphasis on megalith?](https://steamcommunity.com/app/1840080/discussions/4/4330852793642617755/)).

**The lesson, stated as a rule we can hold ourselves to:** *a big object placed near the play
space makes the play space feel small.* Scale is produced by emptiness with one distant
reference, not by proximity to something enormous.

This is a live risk for us. We have a **3,400 m ancient hulk** as a POI
(`beta-decay-systems.md:512`) and a gas giant in the far scene. `ARCHITECTURE.md:57` already
draws the correct structural line — celestials go in `world.far`, anything you can shoot or tow
goes in `world.scene` — and that separation is exactly the thing that protects us from Homeworld
3's mistake, because a far-scene gas giant can be vast without ever crowding the fight. **The
rule to write down is: no in-scene object may subtend more than a modest fraction of the frame at
combat framing.** If the hulk fills the screen, the fight around it stops reading as big.

**A secondary HW3 failure worth logging:** the HUD. "Players felt like the HUD ate up too much
screen real estate, especially compared to older Homeworld games", and the studio shipped a HUD
scale slider in response
([Homeworld Universe dev update](https://www.homeworlduniverse.com/war-games-feedback/)). That is
the same defect our own report 10 logged ("panels overlap the ship at some framings",
`beta-decay-systems.md:741`), and `beta-decay-systems.md` §6.6's answer — move state onto the
object — is the right one.

---

## 5. Cogmind — the reference we should have been reading all along

This is the section with the most stealable material in the document, because Cogmind is the
only shipped, well-reviewed game whose *entire progression system is our progression system*:
you are made of parts you cut off the things you killed, the parts break, and killing badly
destroys the parts.

**Numbers, for calibration** (Steam, fetched 2026-07-29): 95% of 1,546 reviews, Overwhelmingly
Positive. Not a big game. `shelf-survey.md:213-225`'s ceiling argument holds and this is another
datapoint for it. One review summary worth pinning next to the ambition: Cogmind "appeals very
strongly to very few people and is just 'meh' at most for everybody else", and per Steam
achievements only about **40% of players ever get past the tutorial region**
([Cogmind on Steam](https://store.steampowered.com/app/722730/Cogmind/);
[Steam discussion](https://steamcommunity.com/app/722730/discussions/0/3166568651718250272/)).
That is `shelf-survey.md`'s table-stake 2 (onboarding) confirmed from a fourth game.

### 5.1 The salvage model in full

Already quoted in §1.1. The parts of it that are *design*, not arithmetic:

- **The modifier is cumulative over the target's whole life, not a property of the killing
  blow.** "reflects everything that happened to it before that point." This is the correct
  choice and it is not the obvious one: it means the player who softens a target with the wrong
  gun has already spent the payout, and cannot recover it with a clean finish. It rewards
  *committing to a loadout*, which is precisely what `look-target.md:75` wants the sortie to be.
- **Weapon class sets the polarity.** EM positive, cannon and explosive negative, plain guns
  neutral. So "which gun do I bring" and "how much do I get paid" are the same question.
- **Size is the defence against heat.** `(heat - max_integrity) / 4` means big parts survive fires
  and small ones melt. Free, legible, and it makes burning wrecks yield structure but not
  electronics — a completely different loot profile for the same wreck.
- **A utility exists purely to shift the curve.** "Salvage Targeting Computers" appear as step 7
  of the published attack resolution. An entire equipment slot is spent on being paid better.
- **The destructive weapon still pays, in the lower currency.** This is the best idea in the
  system and it took a redesign to get there. Kinetic cannons "blast usable matter off target
  robots"; the amount is randomised "from between zero up to the absolute value of the weapon's
  salvage modifier, but only applies for those weapons with a negative salvage modifier below
  −2" ([manual, §Kinetic](https://www.gridsagegames.com/cogmind/manual.txt)). The stated reason
  is that cannons "require a disproportionately large ratio of supporting utilities and
  resources" ([Design Overhaul 3](https://www.gridsagegames.com/blog/2021/05/design-overhaul-3-damage-types-and-criticals/)).
  **So the weapon that destroys parts converts them into raw matter instead.** Nothing is ever
  a total waste; the wrong tool pays worse, not nothing.
- **Anti-farm rule, one sentence:** "robots built by a fabricator do not leave salvageable parts."

### 5.2 Nine damage types, each with an identity, and a critical effect that belongs to it

From [Design Overhaul 3](https://www.gridsagegames.com/blog/2021/05/design-overhaul-3-damage-types-and-criticals/):

| Type | Identity | Salvage consequence |
|---|---|---|
| Kinetic | long range, high crit, high recoil, unpredictable | negative modifier, **but blasts recoverable matter** |
| Thermal | short range, predictable, low recoil, transfers heat, can cause meltdown | heat melts small parts after the kill |
| Explosive | area, splits damage across targets | strongly negative |
| Electromagnetic | corrupts systems (50–150% of damage also applied as corruption) | **positive modifier, but the salvage is corrupted and infects you when installed** |
| Impact / Slashing / Piercing | melee | Slashing can **sever a component without destroying it** |

Two of those are worth stopping on.

**EM is the model for "a good deal with a hook in it."** The designer's stated goal was
"interesting trade-offs for using EM without making players not want to use it": EM yields the
*most* salvage, and every part it yields carries corruption that raises your own system
corruption when you attach it, with the corruption amount randomised 1 to `10×corruption/100`.
That is Starsector's d-mod pattern (already in `shelf-survey.md:384` as A8) plus contagion, and
it is a far more interesting version of "condition" than a single scalar.

**"Sever" is the mechanic `beta-decay-systems.md` §6.2 invented independently.** Our §6.2 `mount`
row proposes that destroying a module's mounting pad "detaches the module as a free wreck
section... you go and pick it up," and calls it "the payoff... the point of the whole item."
Cogmind ships that, calls it Sever, and attaches it to a specific weapon class so that
*bringing the right gun* is what makes it available. We should adopt both halves: the effect and
the gating. See R2.

### 5.3 Coverage, overflow, and the "Vulnerability" view

Three more mechanics, all cheap, all currently absent from our combat model.

**Coverage.** Every part has a coverage stat; incoming damage picks which part it hits by a
coverage-weighted roll (attack resolution step 13). Armour works by having *high coverage and
high integrity* — its job is to be hit instead of something else. Quoted: armour "can never be
instantly destroyed by critical strikes, taking 20% more damage instead."

**Overflow, with an armour-first rule.** When damage destroys a part, the surplus flows on:

> "There is no damage overflow if the destroyed part itself is armor, and overflow damage always
> targets armor first if there is any... Damage overflow is caused by all weapons except those of
> the 'gun' type."
> — [manual, §Damage Overflow](https://www.gridsagegames.com/cogmind/manual.txt)

Read those two rules together and armour has a genuine, legible job that is not "+n HP": it
absorbs the roll *and* it catches the spill *and* guns bypass the spill entirely. Three
interacting rules, no new numbers.

**The Vulnerability view.** A UI mode ('c') whose "graphs are derived from a combination of
coverage and integrity, where those parts with greater vulnerability are more likely to be lost
before others, statistically speaking." **The game shows you which of your own parts you are
about to lose.** For a game whose entire progression is an accreted hull, that is the single most
useful panel imaginable, and it is a sort over data we already have. See R6.

### 5.4 Fabrication must not be allowed to replace salvage — and ours currently can

Cogmind rebuilt its fabrication system specifically because it was undermining the loop. The
designer, quoted from [Design Overhaul 4](https://www.gridsagegames.com/blog/2021/11/design-overhaul-4-fabrication-2-0/):

> "adapting your build based on what you find and salvage is a major part of the experience, and
> yet here is a system outside that process with the potential to enable the tightest level of
> control over your build"

and on the fix:

> "I don't want to completely remove this strategy — it can certainly be an interesting way to
> play... but I believe it should be a little harder to execute."

The gate they landed on has three teeth: **Authchips** ("a new type of consumable item that can
each be used once to load and build a single schematic"), which are **category-matched** (a
Weapons chip cannot build a Power part); or **hack it**, in which case "as soon as an
unauthorized build is initiated, that machine is locked... and an investigation squad is sent to
the area"; and a **one-build-per-fabricator** limit for hackers.

**Now read our code.** `src/sim/meta/patterns.js:120-142`: `build(moduleId)` checks
`canBuild` (pattern known, materials affordable, hold volume available), spends the materials,
pushes the item into `world.inventory`, and returns. It is **instantaneous**, **unlimited**,
**repeatable** (`rec.builds++` at :129 counts builds and gates nothing), and has **no location
requirement, no time cost, no risk and no consumable**. `LEARN_CHANCE = 0.22` and
`REBUILD_CONDITION = 0.85` are the only frictions, and neither scales with use.

The file's own header (`src/sim/meta/patterns.js:14-16`) argues the cost is high enough — "roughly
three and a half scrapped modules' worth of alloy, so finding the real thing is still better."
That is true at one build. It is not true at ten, because scrap is renewable and the pattern is
permanent. This is exactly the hole Cogmind closed. See R7.

### 5.5 Repair: the yard restores, the field patches — and Cogmind priced it

> "Repairing parts is a two-stage process. First instruct the station to scan a component...
> Then initiate the repair process, which both fixes broken parts and restores them to full
> integrity."

versus the field alternative, a Mechanic ally:

> "Field repairs on the latter are only capable of restoring a part up to **50% integrity**.
> Repairs cannot be made while either the target is in combat or the Mechanic itself is taking
> fire."

That is `look-target.md:66-82` — anchorage-only full refit, worse field swap — with numbers, from
a shipped game. And our field swap is still unbuilt (§1.3). See R10.

### 5.6 Run modifiers that change the rules, not the numbers

Cogmind's challenge modes, from the manual's options list:

- `challengeScavenger` — "There are no random part stockpiles in the main complex, and any lone
  items strewn about are damaged. **Everything else must be salvaged from other robots**, stolen
  from haulers, or fabricated."
- `challengeNoSalvage` — "Destroyed robots leave no salvageable parts, only matter."
- `challengeDevolution` — start with 20 random slots and lose one at each evolution.
- `RPGLIKE` — replaces the entire progression model with XP levels, "for those who prefer to have
  more attachment to their build."

`shelf-survey.md:241-244` names run-modifying metas as a table stake with three independent
convergences. This is a fourth, and it shows the cheap form: **a flag that deletes or inverts an
existing rule**, not new content.

### 5.7 One design position of Cogmind's we should consider adopting, and one we should not

**Adopt (consider):** Cogmind has "almost no consumables in the traditional sense, because most
items are themselves technically consumables as you decide what parts you want to cycle through"
([Indie Game Website review](https://www.indiegamewebsite.com/2017/12/01/cogmind-review/)). The
*modules are the consumables*. We have gone the other way — five discrete devices in
`src/sim/meta/items.js` plus modules — and I think that is fine, because our modules are large
and slow to swap. But it is worth knowing that a shipped game in our exact shape decided the
device layer was unnecessary, and that if our device list ever grows past about eight, that is
the argument for stopping.

**Do not adopt:** Cogmind's onboarding. 40% completion of the tutorial region is a failure, and
`shelf-survey.md:236-240` already flags this as our highest-probability place to lose people.

---

## 6. Rogue Space and the shelf, checked again

### 6.1 "Rogue Space" is a dead end and here is why, so nobody researches it twice

The brief names *Rogue Space*. The Steam title is
[**Slipstream: Rogue Space**](https://store.steampowered.com/app/2765860/Slipstream_Rogue_Space/)
(Subpixel Studios, free-to-play, released 12 Feb 2024, 91% of 144 reviews). It is *"a multiplayer
roguelike about teamwork, survival... and cute animals in space"*, built for streamers, scaling
"from small friend groups to 100+ player crews", tagged Cats and Cute, with captain-and-crew role
division. There is no salvage loop, no single-ship command and no modular hull.

It has **one** transferable observation, and `shelf-survey.md:428-431` (N7) already drew it: the
2024–25 cohort's answer to "how do we manufacture simultaneous pressure" is *more humans*, and we
cannot use that answer. Everything else about it is irrelevant to us. Do not spend another hour
on it.

### 6.2 What a fresh sweep adds to `shelf-survey.md`

The shelf survey's table is thorough and I found only two things to add.

**Cogmind belongs in §1.5 (space roguelikes) and arguably at the top of §1.1.** It is the closest
game on Steam to our *progression model* even though it is not a space game and not a salvage
game by genre. Its absence is the survey's one real omission.

**[Derelict Void](https://store.steampowered.com/app/1479340/Derelict_Void/)** — roguelike space
survival, command a ship and crew, "ruthless and unforgiving". Small. Crew-based, so it sits with
the N2/N7 group rather than with us. Logged for completeness, not recommended for study.

Everything else a search surfaces is already in the survey: Ostranauts, Hardspace, Duskers,
Space Haven, Void Crew, Star Trucker, Space Trash Scavenger, Deep Space Salvage Crew VR. The
survey's §1.2 conclusion — "the word 'salvage' is now cheap on Steam" — reproduces.

---

## 7. THE RANKED LIST — specific, stealable mechanics

Ranked by **(fun delivered) / (implementation cost)**. "Stream" is from `ARCHITECTURE.md:133-147`.
Cost is my estimate of the work, not of the design argument.

Nothing here proposes a change to `src/core/**` without saying so; those are proposals to
integration per `ARCHITECTURE.md:149`.

---

### R1 — Per-weapon salvage modifier. `WeaponDef.salvageMod`, accumulated on the target
**Source:** Cogmind ([manual §Salvage](https://www.gridsagegames.com/cogmind/manual.txt)).
**Stream:** Combat (`src/sim/combat.js`) + Salvage (`src/sim/salvage.js`); one field proposed to
integration for `src/core/contracts.js:75-95`.
**Cost:** small. One optional field on 24 module defs, one accumulator on `Ship`, one term folded
into the existing `salvageIntegrity` getter at `src/sim/ship.js:363`.

Add `salvageMod` to `WeaponDef` — a signed number, roughly −0.30 to +0.15. Accumulate it on the
target as each shot lands (`target._salvageMod += weapon.salvageMod`), and fold it into per-section
condition at death rather than into the mean. Suggested polarity, matched to our `WEAPON_TYPES`:

| type | `salvageMod` | fiction |
|---|---|---|
| `mining`, `pd` | +0.10 | designed to cut, not to kill |
| `beam`, `lance` | +0.05 | clean holes |
| `rail` | −0.05 | overpenetrates |
| `cannon` | −0.15 | **and blasts loose scrap free — see R4** |
| `flak` | −0.20 | shreds |
| `missile` | −0.30 | worst of all |

**Why it is first.** It is the cheapest possible way to double the meaning of every weapon we
already have, and it converts the loadout screen into a salvage decision. Today the only thing
that changes your payout is *where* you aim (`ship.js:733`, the reactor cap). After this, *what
you brought* changes it too, before the fight starts, which is the commitment
`look-target.md:108` calls "the sortie is the unit of commitment". It is proven at 95%/1546, the formula is
published, and it answers all four questions in `scope-decision.md:48-58` without strain.

**Interlock check** (`scope-decision.md:52`): weapon choice, refit, salvage yield, materials
economy, and the codex all move. Five.

---

### R2 — Sever: shoot the mount, the module comes off intact
**Source:** Cogmind's Slashing critical ([Design Overhaul 3](https://www.gridsagegames.com/blog/2021/05/design-overhaul-3-damage-types-and-criticals/));
independently specified at `docs/design/beta-decay-systems.md:600` as the `mount` sub-part row.
**Stream:** Combat + Salvage + Geometry (part anchors on module meshes).
**Cost:** medium. The sub-part model is the work, not the effect.

Our own doc already calls this "the payoff... the point of the whole item"
(`beta-decay-systems.md:602-606`). Cogmind's contribution is the **gating**: Sever is attached to
a specific weapon class, so bringing the right tool is what makes shopping possible. Do the same
— make the mount-shot available only to a narrow set (`mining`, `rail`, `lance`) and it becomes a
loadout decision instead of a universal option.

The prerequisite honesty from `beta-decay-systems.md:614-616` still stands: the mounts must be
*visible* in the geometry or an invisible aim point is exactly the fiddliness we are avoiding.
That is a real cost on the Geometry stream and it should be priced before committing.

---

### R3 — NLIPS in the live 3D view
**Source:** Homeworld ([ModDB](https://www.moddb.com/downloads/disable-nlips);
[Steam](https://steamcommunity.com/app/244160/discussions/0/617328967244535207/)).
**Stream:** Camera & controls (`src/camera/**`) + Lighting & post (`src/render/**`).
**Cost:** small. A per-object uniform scale as a clamped non-linear function of camera distance,
applied in the LOD/instancing path.

Shape: `scale = 1 + k · max(0, ln(d / d0))`, clamped, with `k` set per size class so a fighter
grows and the 1400 m cruiser does not. It must be applied to the *visual* transform only —
collision, weapon arcs and physics stay in metres (`ARCHITECTURE.md:14`). Off by default in the
capture and benchmark harnesses so `tools/silhouette.mjs` keeps measuring true geometry.

**Why it ranks here.** Our camera reaches 46 km (`src/core/units.js:64`) and the strategic overlay
does not blend in until zoom 1.00 (`src/camera/constants.js:56`), so the mid-band is a readability
hole an 18 m fighter falls straight through. This is the mechanism Homeworld used to solve the
identical problem, it is small, and it is invisible to every other stream.

**The trade must be taken deliberately:** NLIPS is less physically honest. Homeworld took it
anyway, and `look-target.md:33` makes Homeworld binding for exactly this axis.

---

### R4 — The destructive weapon pays in scrap instead of nothing
**Source:** Cogmind's kinetic matter-blasting ([manual §Kinetic](https://www.gridsagegames.com/cogmind/manual.txt)).
**Stream:** Salvage (`src/sim/salvage.js`).
**Cost:** tiny. One term in yield, gated on `salvageMod < −0.10`.

Pairs with R1 and should ship in the same change. A weapon with a strongly negative salvage
modifier converts the parts it destroys into `scrap` — into `SCRAP_GRADES` `plate`, specifically
(`src/sim/meta/materials.js:38`) — rather than into nothing. Amount randomised from zero to
`|salvageMod| × section mass × k`.

**Why it matters more than its size.** Without it, R1 has a dead end: the missile-boat player
kills a hulk and receives a lecture. With it, the missile boat is a *materials* build and the
mining-laser boat is a *parts* build, and both are viable strategies rather than one being correct.
Cogmind needed a redesign to learn this. We can have it for free by copying the conclusion.

---

### R5 — Device modes: three named riders per device, choose one
**Source:** Everspace 2 ([GameSkinny](https://www.gameskinny.com/tips/everspace-2-best-ship-devices-guide-and-full-list/)).
**Stream:** Progression (`src/sim/meta/items.js`).
**Cost:** small. A `modes: [...]` array per item def and a chosen-mode field on the stack.

Fifteen rule-changing variants over the five devices that already exist, at near-zero content
cost. Concretely, for our five (`src/sim/meta/items.js:43,78,121,157,182`):

| Device | Mode A | Mode B | Mode C |
|---|---|---|---|
| `coolant_purge` | **Blowdown** — window 9 s, aftermath twice as long | **Selective** — one mount only, no aftermath | **Vent** — the purge plume blinds IR-guided munitions for 4 s |
| `decoy` | **Loud** — also pulls gun turret tracking, not only guided | **Sticky** — 20 s instead of 12, half the pull | **Sprint** — thrown at 3× velocity; separates further, dies sooner |
| `boarding_charge` | **Clean** — hulk at full integrity, but 3 s arming window during which it can be shot | **Cheap** — costs half, hulk at 0.75 | **Wide** — hits every stranded hull inside 400 m at 0.5 |
| `scan_pulse` | **Quiet** — half range, no heat | **Deep** — also reveals sub-parts and projected yield | **Ping** — also marks you to every hostile, and marks *them* to each other |
| `jury_rig` | **Overweld** — no capacity loss, but the mount is inert for 20 s | **Spread** — patches two hardpoints at 0.5 each | **Bodge** — instant, capacity loss doubled |

Note that none of them is a percentage; every one changes what the device is *for*. "Face Off"
turns an escape into an attack with one boolean; that is the standard.

**Guard rail** (`fun-systems.md:116-122`, `shelf-survey.md:285-288`): modes on devices only. Not
on modules, not on ammunition, not on materials. Everspace 2's #1 complaint is item volume.

---

### R6 — Coverage, and a "what am I about to lose" view
**Source:** Cogmind ([manual §Attack Resolution step 13, §Vulnerability mode](https://www.gridsagegames.com/cogmind/manual.txt)).
**Stream:** Combat (coverage) + UI (the view).
**Cost:** medium for coverage, small for the view. The view alone is worth shipping first.

**The view, first and cheaply.** A HUD mode that ranks your own installed modules by expected
loss order — a sort over `salvageValue`, `condition` and hardpoint `structureHP`, all of which
exist today. For a game whose progression *is* the accreted hull, telling the player which piece
of their identity is next to go is the highest-value panel we do not have.

**Coverage, second.** Give each hardpoint and subsystem a `coverage` weight; resolve incoming
hull damage by a coverage-weighted roll instead of a flat spread — `src/sim/meta/items.js:143`
records the current behaviour in a comment: "`Ship.applyDamage` spreads a share of whatever it is
given across every section". Then armour modules get a real job — high coverage, high structure, absorb the roll —
and the Cogmind rules that make it interesting come free:

- armour cannot be destroyed outright by a critical; it takes 20% more damage instead;
- destroyed parts overflow their surplus damage onward, **armour first**;
- one weapon class (theirs: guns; ours: `beam`) causes no overflow at all.

---

### R7 — Gate pattern rebuilds so they cannot replace salvage
**Source:** Cogmind's Authchips ([Design Overhaul 4](https://www.gridsagegames.com/blog/2021/11/design-overhaul-4-fabrication-2-0/)).
**Stream:** Progression (`src/sim/meta/patterns.js`).
**Cost:** tiny.

`build()` at `src/sim/meta/patterns.js:120-142` is instantaneous, unlimited and repeatable. Add
any two of:

1. **Anchorage-only**, consistent with `look-target.md:66` — a rebuild is a yard job.
2. **A consumable feedstock**, category-matched: a salvaged `fabricator core` that only builds
   weapon-class modules, another that only builds structure. This is Beta Decay's blueprint-as-an-
   object *and* Cogmind's Authchip in one item, and it lands naturally in `items.js`.
3. **Escalating cost** — `cost × (1 + 0.35 × rec.builds)`, using the counter already incremented
   at `patterns.js:129`. One line.

The designer's own framing is the argument: fabrication is "a system outside that process with
the potential to enable the tightest level of control over your build." We built the same system
and did not build the brake.

---

### R8 — Field weld caps at 50%; the yard restores to full
**Source:** Cogmind repair stations vs Mechanic field repair ([manual](https://www.gridsagegames.com/cogmind/manual.txt));
required by `docs/design/look-target.md:66-82`.
**Stream:** Ship & refit (`src/sim/refit.js`).
**Cost:** small, and it closes a binding-doc requirement that is currently unimplemented.

`installTime = 2.5` exists at `src/sim/refit.js:51` and is consumed nowhere; there is no
jettison, hot-swap or field-weld path in the file at all. Build it, and take Cogmind's two extra
rules, both of which our `condition.js` can already express:

- a **field** install lands at `min(condition, 0.5)` — `src/sim/condition.js` already has the
  bands and the multipliers to make 0.5 mean something;
- a field install **cannot proceed while taking fire**, which makes the "weld it on right there"
  moment a real risk rather than a free action, and gives `installTime` its teeth.

---

### R9 — Engine trails as a rangefinder
**Source:** Homeworld ([Steam](https://steamcommunity.com/app/244160/discussions/0/617328415074249808/)).
**Stream:** VFX (`src/vfx/**`).
**Cost:** small.

Three encodings on one existing effect: **class** (capital trails visibly different from strike
craft), **state** (burning vs coasting — different length, different brightness), and **presence
at range** (the trail stays visible after the hull does not). Pairs with R3; between them a 20 km
framing stops being a black rectangle with a cruiser in it.

---

### R10 — Hard prohibitions on high-tier modules
**Source:** Everspace 1's class design ([Steam guide](https://steamcommunity.com/sharedfiles/filedetails?id=971289834)).
**Stream:** Ship & refit (`src/sim/refit.js`) + module definitions.
**Cost:** small-medium — mostly a content pass and one validation rule.

Every Everspace 1 class pairs *one exclusive capability* with *one flat prohibition* — the Gunship
gets turrets and drones and **cannot equip a shield at all**. Our `grants` block is currently
all positive (`src/core/contracts.js` `ModuleDef.grants`: `{hangarBays, salvageRate, powerOutput,
thrust, turnRate, cargo, sensorRange, shieldCapacity}`). Add a `forbids` list, validated at
registration the same way hardpoints are (`ARCHITECTURE.md:86`).

Examples worth authoring: a tier-3 reactor that grants two extra pips and **forbids shields
entirely**; a spinal mount that grants a forward weapon nothing else can carry and **forbids all
port and starboard weapons**. The prohibition is the interesting half — it is what forces the
player to invent a different game.

Also worth stealing from the same source: **passive devices reserve energy permanently.** A
`grants` entry that *permanently removes* reactor pips in exchange for a capability turns the
power split into a budget problem outside combat, which `fun-systems.md:205-212` identifies as
its weak point.

---

### R11 — Make patterns physical objects
**Source:** Beta Decay's blueprint ([`/post/blueprint`](https://www.rotoscopestudios.com/post/blueprint)).
**Stream:** Progression (`src/sim/meta/patterns.js`, `src/sim/meta/cargo.js`).
**Cost:** tiny.

Beta Decay's blueprint is *"A mini-disc that contains pre-programmed, production-ready
instructions... Class: Equipment. Weight: 0.5 kg."* Ours is `this.known = new Map()`
(`src/sim/meta/patterns.js:62`) — a permanent, weightless, unloseable fact.

Make it an object: a small volume in the hold, salvaged as a physical item, **lost with the hold
if the hold is lost**, and copyable at an anchorage for a materials fee. That single change
brings patterns under the rule in §2.3, makes them a real cargo decision against modules and
materials, and gives the crippling handler (`look-target.md:88-99`) one more thing worth going
back for.

It also composes with R7: if the pattern is an object, the *feedstock chip* that lets you use it
can be another object, and the whole gate exists inside a system we already have.

---

### R12 — Two silhouettes as orientation anchors
**Source:** Rob Cunningham ([GOG interview](https://www.gog.com/forum/general/interview_homeworlds_rob_cunningham_18367)).
**Stream:** Geometry (`src/art/geometry/**`).
**Cost:** near-zero code; a constraint on art direction.

Homeworld's two motherships are "a giant tall tower and a huge flat slab" so the player always
knows which way is up. We are plane-locked (`ARCHITECTURE.md:110`) so up/down matters less, but
*whose ship is that* matters enormously at range. Commit one faction to a tall, narrow, vertical
silhouette and the other to a wide, flat, horizontal one, and faction identity survives all the
way out to the strategic band without a single icon.

The stricter half of the same quote is a genuine tightening of our audit: silhouettes must read
"from **every** angle". Our silhouette tool measures a plan-view enclosure figure (HANDOFF.md:106).
Extending it to three orthogonal projections is a `tools/` change and belongs to Performance.

---

### R13 — Salvage that carries a hook: corrupted parts
**Source:** Cogmind's EM corruption ([Design Overhaul 3](https://www.gridsagegames.com/blog/2021/05/design-overhaul-3-damage-types-and-criticals/));
converges with Starsector d-mods, already `shelf-survey.md:384` (A8).
**Stream:** Salvage + Combat.
**Cost:** medium.

The stated design goal — "interesting trade-offs for using EM without making players not want to
use it" — is the exact problem R1 creates for the high-salvage weapons: if `mining` and `beam`
yield the most, why bring anything else? Cogmind's answer is that the *best-yielding* weapon
produces *infected* loot: parts that carry corruption and pass it to you on install.

Ours: a weapon with a strongly positive `salvageMod` yields parts that carry a **named permanent
flaw** — "heat-warped feed", "arced traverse ring", "scarred emitter" — with a stated effect,
carried in `condition`'s existing band structure but as a discrete, legible tag rather than a
number. That is A8 and P1 in one, and it makes two identical modules non-identical.

---

### R14 — Run-modifier flags that delete a rule
**Source:** Cogmind's challenge modes ([manual, options](https://www.gridsagegames.com/cogmind/manual.txt));
converges with `shelf-survey.md:241-244` (table stake 3) and A7.
**Stream:** World sim & AI (`src/world/**`) + Progression.
**Cost:** small-medium.

The cheap form is a flag that **inverts or removes an existing rule**, not new content. Direct
translations of Cogmind's three:

- **Scavenger** — no intact modules spawn anywhere; every part must come off a hull you cut.
- **Cold War** — the faction war never fights while you are present; every field is a cold field
  (our `cold` multiplier is already 0.55 at `src/sim/meta/objectives.js:64`).
- **No Yard** — the anchorage repairs but does not refit; the loadout you started with is the
  loadout you finish with.

Per `shelf-survey.md:379-382` (A7) these must attach to the hull, not a character sheet. A run
modifier expressed as *a permanent oddity welded into your ship* is both the meta system and the
visual progression.

---

### R15 — Ammunition keyed to the weapon, not the class
**Source:** Beta Decay ([two cards for one cartridge](https://www.rotoscopestudios.com/post/5-56-45-ammunition-auga1)).
**Stream:** Combat (`src/sim/stores.js`).
**Cost:** small.

`AMMO_FOR_TYPE` (`src/sim/stores.js:31-38`) keys ammunition to the weapon *archetype*: every
`cannon` eats `shell`. Beta Decay keys it to the weapon *model*, because the object you carry is
a magazine and the AUG's magazine is not the M16's.

The gameplay this buys is specific and it is ours alone: **a Coalition feed only fits Coalition
guns**, so a captured Concord cannon bank is a beautiful thing you cannot supply until you also
capture its magazines. That makes faction identity a logistics fact, deepens
`beta-decay-systems.md:800-808`'s worn-colours idea, and gives a reason to cut a wreck you have
no interest in installing.

**Do not overdo it.** Two feed families (Coalition, Concord) plus a universal one, not per-module.
The failure mode is `shelf-survey.md:285-288` (F4, inventory micromanagement).

---

### R16 — Formations for strike craft, each with a stated cost
**Source:** Homeworld ([HomeworldAccess](https://www.homeworldaccess.net/viewpage.php?page_id=17)).
**Stream:** Ship & refit (`src/sim/strikecraft.js`) + Camera & controls for the binding.
**Cost:** medium.

Four, not seven: **Wall** (maximum simultaneous firepower, slow to reorient), **Claw** (focused
fire, capped group size), **Sphere** (defensive screen around the cruiser, contributes little
offence), **Delta** (alpha strike, the lead craft eats everything). Each is a positional trade
with a stated cost, which is the property `fun-systems.md:186` says our refit lacks and which our
declared-but-unread stances (`fun-systems.md:629`) are already shaped for.

---

### R17 — Publish the attack-resolution order in the codex
**Source:** Cogmind ([manual §Attack Resolution](https://www.gridsagegames.com/cogmind/manual.txt)),
whose 21-step ordered list is prefaced with "you most likely DO NOT need to know this stuff, but
it may help answer a few specific questions min-maxers have".
**Stream:** UI (`src/sim/meta/codex.js` is Progression; the screen is UI).
**Cost:** trivial — a documentation page inside a screen we already have.

`beta-decay-systems.md:303-323` establishes that knowledge is our progression and that this is
why Beta Decay publishes everything. Cogmind goes one further and publishes the *resolution
order*. Ours would read roughly: base damage → condition multiplier → salvage modifier
accumulation → subsystem accuracy roll → shield → section selection → structure → breach check →
overflow. Nine steps, all of which exist.

---

### R18 — The frame-crowding rule, written down
**Source:** Homeworld 3's megaliths ([GamingBolt](https://gamingbolt.com/homeworld-3-interview-megaliths-story-war-games-and-more);
[TheSixthAxis](https://www.thesixthaxis.com/2024/05/10/homeworld-3-review/);
[Steam](https://steamcommunity.com/app/1840080/discussions/4/4330852793642617755/)).
**Stream:** Environment & celestials (`src/world/celestials/**`, `src/world/fields/**`).
**Cost:** trivial to state, and it is a constraint that *saves* work.

*A big object placed near the play space makes the play space feel small.* Homeworld 3 spent its
art budget filling space and lost the thing the series was famous for. `ARCHITECTURE.md:57`
already draws the structural line that protects us — celestials in `world.far`, anything shootable
in `world.scene` — and the rule to add is a measurable one: **no in-scene object may subtend more
than a stated fraction of the frame at combat framing.** Our 3,400 m ancient hulk is the object
this rule exists for. `tools/` can measure it the same way `silhouette.mjs` measures enclosure.

---

## 8. Summary table

| # | Mechanic | Source | Stream | Cost |
|---|---|---|---|---|
| R1 | Per-weapon salvage modifier | Cogmind | Combat + Salvage | S |
| R2 | Sever the mount, module drops intact | Cogmind + our own §6.2 | Combat + Salvage + Geometry | M |
| R3 | NLIPS in the live 3D view | Homeworld | Camera + Lighting/post | S |
| R4 | Destructive weapons pay in scrap | Cogmind | Salvage | XS |
| R5 | Three device modes, choose one | Everspace 2 | Progression | S |
| R6 | Coverage + "what am I about to lose" | Cogmind | Combat + UI | M (view alone S) |
| R7 | Gate pattern rebuilds | Cogmind | Progression | XS |
| R8 | Field weld caps at 50% | Cogmind + `look-target.md` | Ship & refit | S |
| R9 | Engine trails as rangefinder | Homeworld | VFX | S |
| R10 | Hard prohibitions; reserved power | Everspace 1 | Ship & refit | S–M |
| R11 | Patterns as physical objects | Beta Decay | Progression | XS |
| R12 | Two silhouettes as orientation anchors | Homeworld | Geometry | XS code |
| R13 | Corrupted / scarred salvage | Cogmind + Starsector | Salvage + Combat | M |
| R14 | Run-modifier flags | Cogmind | World sim + Progression | S–M |
| R15 | Ammunition keyed to the weapon | Beta Decay | Combat | S |
| R16 | Strike-craft formations | Homeworld | Ship & refit | M |
| R17 | Publish the resolution order | Cogmind | UI | XS |
| R18 | Frame-crowding rule | Homeworld 3's failure | Environment | XS |

**If only three ship: R1, R4 and R5.** Together they cost less than a week, they make every
weapon and every device mean something new, and R1+R4 are the pair that turns our headline
differentiator from a single rule about reactors into a system with a curve.

---

## 9. What I explicitly recommend against, with the source

| Rejected | Why, and where it comes from |
|---|---|
| A ship-model-level ammunition tree (one feed per module) | Beta Decay has 18 ammunition cards for a first-person game where you hold the magazine. We would get `shelf-survey.md:285` F4 (inventory micromanagement) and nothing else. Two feed families, R15. |
| Device modes on modules or materials | Everspace 2's #1 complaint is item volume (`fun-systems.md:109-115`). Devices only. |
| A crafting or hacking minigame around fabrication | Cogmind's hacking layer is a whole subsystem we would be building from zero to solve a problem R7 solves in one line. `beta-decay-systems.md:854` already refuses minigames. |
| Cogmind's nine damage types | We have `WEAPON_TYPES` and a silhouette audit holding 46 same-mount pairs apart. Nine damage identities on top is content cost with no new decision. Take the *salvage polarity* (R1) and the *sever* (R2); leave the taxonomy. |
| Homeworld's full seven-formation set | Four is the readable number for a game with one capital ship and a strike wing. See R16. |
| Anything from Slipstream: Rogue Space | §6.1. Crewed co-op, free-to-play, cats. Nothing transfers. |
| More Beta Decay Patreon archaeology | `beta-decay-systems.md` Appendix B flags the 41 devlogs at HTTP 403. They still 403. The roadmap, database and FAQ are fully mined now; the devlogs would add implementation detail about Unreal, not design principle. |

---

## 10. Sources

All fetched 2026-07-29 unless noted.

**Beta Decay / Rotoscope Studios**
- [Roadmap](https://www.rotoscopestudios.com/roadmap) — re-verified against `beta-decay-systems.md:84-88`; unchanged
- [`blog-posts-sitemap.xml`](https://www.rotoscopestudios.com/blog-posts-sitemap.xml) — all 289 post slugs, the basis of §2.1
- [FAQ category](https://www.rotoscopestudios.com/database/categories/faq) — 68 entries, 8 exposed per view
- [`/post/couch`](https://www.rotoscopestudios.com/post/couch) — 30 kg, Class Components
- [`/post/aspergillus-niger`](https://www.rotoscopestudios.com/post/aspergillus-niger) — Processes To: Citric Acid
- [`/post/blueprint`](https://www.rotoscopestudios.com/post/blueprint) — 0.5 kg Equipment mini-disc
- [`/post/5-56-45-ammunition-auga1`](https://www.rotoscopestudios.com/post/5-56-45-ammunition-auga1) — the per-weapon magazine card
- [`/post/early-access-game-world-play-size-planetary-terrain`](https://www.rotoscopestudios.com/post/early-access-game-world-play-size-planetary-terrain) — handcrafted, small, dense
- [Steam store page](https://store.steampowered.com/app/1416070/beta_decay/) — unreleased, no reviews

**Cogmind / Grid Sage Games**
- [Cogmind manual (full text)](https://www.gridsagegames.com/cogmind/manual.txt) — salvage formulas, attack resolution, overflow, coverage, repair, challenge modes
- [Design Overhaul 3: Damage Types and Criticals](https://www.gridsagegames.com/blog/2021/05/design-overhaul-3-damage-types-and-criticals/)
- [Design Overhaul 4: Fabrication 2.0](https://www.gridsagegames.com/blog/2021/11/design-overhaul-4-fabrication-2-0/)
- [Cogmind on Steam](https://store.steampowered.com/app/722730/Cogmind/) — 95% of 1,546
- [Steam: Force rifles and positive salvage](https://steamcommunity.com/app/722730/discussions/0/1738841319821924622/)
- [Steam: Combat is repetitive](https://steamcommunity.com/app/722730/discussions/0/3166568651718250272/) — the 40% figure
- [Indie Game Website review](https://www.indiegamewebsite.com/2017/12/01/cogmind-review/) — "most items are themselves technically consumables"

**Everspace 1 and 2**
- [Everspace 2: All Ship Devices — GameSkinny](https://www.gameskinny.com/tips/everspace-2-best-ship-devices-guide-and-full-list/) — the twelve devices and their modes
- [Everspace 2 devices — GamersDecide](https://www.gamersdecide.com/articles/everspace-2-best-devices)
- [Everspace 2 builds guide — Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3060002024)
- [Everspace 1 ships, guns and gadgets — Steam](https://steamcommunity.com/sharedfiles/filedetails?id=971289834) — class prohibitions, passive energy reservation

**Homeworld**
- [Rob Cunningham interview — GOG](https://www.gog.com/forum/general/interview_homeworlds_rob_cunningham_18367) — silhouette from every angle; tower and slab
- [The Art of Homeworld 3 — Aftermath](https://aftermath.site/homeworld-3-concept-art-making-of/) — shape language, megastructure scale
- [Disable NLIPS — ModDB](https://www.moddb.com/downloads/disable-nlips) and [Steam: Was bewirkt "NLIPS"?](https://steamcommunity.com/app/244160/discussions/0/617328967244535207/)
- [Steam: Engine trails](https://steamcommunity.com/app/244160/discussions/0/617328415074249808/)
- [Formations — HomeworldAccess](https://www.homeworldaccess.net/viewpage.php?page_id=17) and [Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Formations)
- [Homeworld 3 interview: megaliths — GamingBolt](https://gamingbolt.com/homeworld-3-interview-megaliths-story-war-games-and-more)
- [Homeworld 3 review — TheSixthAxis](https://www.thesixthaxis.com/2024/05/10/homeworld-3-review/)
- [Steam: Too much emphasis on megalith?](https://steamcommunity.com/app/1840080/discussions/4/4330852793642617755/)
- [Dev Update: 5 Big Changes — Homeworld Universe](https://www.homeworlduniverse.com/war-games-feedback/) — HUD scale
- [Beginner tips — TheGamer](https://www.thegamer.com/homeworld-3-useful-beginner-tips-tricks/) — stances

**Shelf**
- [Slipstream: Rogue Space](https://store.steampowered.com/app/2765860/Slipstream_Rogue_Space/)
- [Derelict Void](https://store.steampowered.com/app/1479340/Derelict_Void/)

**Could not be read**
- `patreon.com/betadecay/posts` — still HTTP 403 to automated fetch, as `beta-decay-systems.md`
  Appendix B recorded. 41 devlogs remain unread.
- `everspace.fandom.com` — HTTP 402/403 to both WebFetch and curl. Everspace device data in §3 is
  therefore from third-party guides, cross-checked against two independent sources per claim.
- `gameluster.com` — HTTP 403.
- The Beta Decay YouTube trailer and Discord were not viewed, as before.

**Numbers I would not lean on.** Every constant proposed in §7 — the `salvageMod` polarity table,
the NLIPS coefficient shape, the 0.5 field-weld cap, the `1 + 0.35 × builds` escalator — is mine,
derived from `src/core/units.js` and the existing balance in `src/sim/condition.js` and
`src/sim/meta/materials.js`. None of it is measured. Cogmind's published figures are Cogmind's
and are quoted as evidence that the *shape* works, not as values to copy.
