# Fun systems — what comparable space games actually do, and what we should take

**Status:** research and recommendation. Not committed spec. Owned by design; every
recommendation in §6 names the stream that would build it.
**Audience:** whoever decides what gets built next, and whoever builds it.
**Scope note:** the brief puts campaign, missions, story, ship interiors, crew, trading and
markets, multiplayer, base building, and character progression separate from the ship
**out of scope**. Several things the reference games do best live over that line. Where a
recommendation touches it, it is flagged **SCOPE DECISION** and a version that stays
inside the line is given alongside it. Nothing here assumes the line moves.

Everything below was checked against what is actually in `src/sim/**` and `src/world/**`
as of this pass, not against what the design documents say should be there. Where the code
and the prose disagree, the code wins and the disagreement is named.

---

## 0. The one-paragraph version

We have built an unusually good **spatial** combat game — arcs anchored to hull positions,
momentum that punishes committing late, subsystem targeting that changes what a corpse is
worth — and almost no **economic** combat game on top of it. Nothing depletes during a
fight. Nothing is spent. There is no button to press at the right moment. The player picks
a target, picks a subsystem, sets a heading, sets a power split, and then watches for
thirty seconds. The reference games all produce their engagement from a resource the player
burns and must decide how to burn: FTL's reactor bars, Highfleet's fuel and missiles,
Cosmoteer's ammunition and crew, Everspace's energy and consumables, Nebulous's missiles
and emissions. **We have one such resource (power) and it neither depletes nor is ever
scarce — it is a split, not a budget.** That is the single largest gap, and most of §6
follows from it.

The second largest gap: our salvage is currently a *probability roll* rather than a *causal
chain*. `WreckSection._buildSections` decides what survived with
`rng.next() < this.integrity`. The player cannot see, before the kill, what a particular
kill will leave them. The mechanism the whole game is named after is invisible at the
moment it is being earned.

---

## 1. What makes each game fun, specifically

### 1.1 EVERSPACE (2017) — the run is a pressure gradient, and death is a payday

The mechanism is not "roguelike + spaceships". It is three things acting together, and the
developers wrote them up honestly in a
[Game Developer deep dive](https://www.gamedeveloper.com/design/game-design-deep-dive-managing-randomization-frustration-in-i-everspace-i-)
that is the single most useful source in this research.

**a) A timer inside every location that makes "one more thing" a real question.** Linger in
a sector and alien reinforcements escalate; keep lingering and "a colossal warship will
eventually arrive". You are never *forced* out. You are made to price staying. The
developers explicitly targeted ~1 hour runs and treated overlong runs as a frustration
source to engineer against. The escalation is the engine of the whole loop: without it,
looting a sector is a chore with a known end, and with it, every wreck you open is a bet.

**b) Death is a payday, presented as one.** The game-over screen leads with credits earned
and permanent unlocks — the team's internal framing was literally "Congratulations, you are
dead!". This is not a consolation prize; it is what makes a 40-minute loss feel like
progress rather than punishment.

**c) There is no inventory screen.** Quoting the deep dive: equipment swaps, salvage and
usage happen in seconds. The game deliberately refused a menu layer. Everspace 2 later
added one, and the single most consistent complaint about the sequel is that menu — see
below. This is the most transferable lesson in the entire document.

Ship classes are **role contracts, not stat sliders**: the Interceptor is the balanced hull;
the Gunship has the most hull and consumable slots, can mount turrets, has the slowest
engine and *cannot use normal shields at all*; the Scout has the fastest engines and
upgradable sensors and the lowest hull and energy
([Everspace ship/gadget guide](https://steamcommunity.com/sharedfiles/filedetails?id=971289834)).
Note the shape: each class has a **capability the others cannot buy** and a **hard
prohibition**, not a −15% modifier.

Devices sit on the same energy pool as everything else: passive devices *reserve* a block of
energy permanently, active devices *spend* a burst on use. That single design choice makes
loadout a budget problem rather than a slot-filling problem, because equipping a passive
permanently shrinks the pool the actives draw from.

**Enemies are deliberately not randomised.** Maps, spawns, loot and events are; enemy
behaviour is not. That is what lets skill accumulate across runs rather than luck
accumulating.

### 1.2 EVERSPACE 2 (2023) — synergy is the fun, and the menu is the tax

What players praise is not "loot". It is **build synergy that changes how you fight**. The
canonical example from [EIP Gaming's review](https://eip.gg/reviews/everspace-2/): pair a
railgun that hits harder on slowed targets with a device that slows on demand, or a shield
that refunds energy on kill. The upgrade that matters is the one that makes a *different
action* correct, not the one that makes the same action 7% better. Reviews describe "a
satisfying climb where every couple of upgrades changes how you approach a fight".

Ship subclasses carry that further with a **passive that defines a playstyle and an ultimate
that rewards committing to it**
([TheGamer subclass ranking](https://www.thegamer.com/everspace-2-every-ship-subclass-type-ranked/)):

| Subclass | Passive | Ultimate |
|---|---|---|
| Vanguard | shields overcharge to 200% while above cruise speed | instantly recharges all weapons and energy |
| Striker | +5% weapon damage per enemy within 500 m | chains up to five ships so damage to one hits all |
| Interceptor | fire rate scales with current shield level | unlimited weapon energy, refreshed 1 s per kill |
| Scout | can go invisible | long-range, stealth-oriented |

Every one of those passives makes a *positioning* or *pacing* choice correct. The Striker's
passive is a reason to close; the Vanguard's is a reason never to stop moving. That is what
"a class" should mean.

**And now the criticism, which is more useful to us than the praise.**

- **Inventory management is the #1 complaint, by a distance.** Players describe "loot
  juggling" as "a painful chore", constant trips between map and home base, "never enough
  inventory space with bad stack limits", and most loot as "junk that needs processed" for
  "increasingly small incremental numerical upgrades"
  ([1](https://steamcommunity.com/app/1128920/discussions/5/3464974615679850392/),
  [2](https://steamcommunity.com/app/1128920/discussions/0/3154202142442283467/),
  [3](https://steamcommunity.com/app/1128920/discussions/0/3108014879955874142/)).
- **Loot variety is thin under the numbers.** "There isn't enough variety in the type of
  items you get to change up the gameplay in a meaningful way"; too many set items funnel
  players into fixed builds; many weapons "feel like reskins despite different names"
  ([Steam thread](https://steamcommunity.com/app/1128920/discussions/0/4206994023684663218/)).
- **Perks are inconsistent.** "Some of them are completely useless or unnecessary, while
  others are a must"; the system needs 40+ hours to read. Players who preferred the first
  game say its upgrade system had "a proper, well-structured evolution" the sequel lacks.
- **Resource gathering is the most-hated loop.** PC Gamer ran a whole piece titled
  ["Everspace's chronically dull resource gathering gets in the way of the action"](https://www.pcgamer.com/everspaces-chronically-dull-resource-gathering-gets-in-the-way-of-the-action/).
  Player summary of the loop: "enter a system, scan it for stuff, fly over to the stuff,
  shoot it, pick it up, and then beam into the next system", called out as "not really fun".
  One review: "I am spending way too much time gathering materials. This is Everspace, not
  EVERMINE!"

**This is a direct warning shot at us.** Our loop is *literally* "arrive, scan, fly to the
wreck, cut it, tow it, leave". The thing that separates us from EVERMINE is that the cut is
supposed to be dangerous and the *kill* is supposed to be the skill expression. If either of
those fails, we have shipped the loop PC Gamer wrote an article about.

**Ancient Rifts** — the endgame — is the sequel quietly readmitting what the first game had.
Players raise "Lunacy" before entering and pick portal modifiers, trading difficulty for
legendary drop rates
([update notes](https://steamcommunity.com/games/1128920/announcements/detail/3479622095817450565),
[Gaming Trend](https://gamingtrend.com/news/everspace-2-receives-final-early-access-update-with-ancient-rifts/)).
A voluntary, player-set risk dial, chosen before the fight, paid out in loot quality. That is
the single most portable mechanic in the sequel.

### 1.3 HOMEWORLD (1 / 2 / Remastered / 3) — persistence is the tension carrier

The reason Homeworld 1 lands and most RTS campaigns do not: **the fleet persists between
missions**. Ships built last mission fly this mission; resources and research carry; early
missions are resource-starved, so a mistake in mission 3 is still hurting you in mission 9
([Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Homeworld)). Every combat decision
is therefore also an *attrition* decision. Nothing in the mission's own rules produces that
tension; the campaign structure does.

**The Salvage Corvette** is the mechanic closest to our whole premise, and it is remembered
with disproportionate affection: it captures live enemy vessels, tows them home, and they
come back crewed on your side, "expanding the fleet well beyond its normal limits" and
granting access to hulls you cannot build
([wiki](https://homeworld.fandom.com/wiki/Salvage_Corvette),
[Force For Good retrospective](https://forceforgood.co.uk/moments-in-gaming-the-salvage-corvette/)).
Players describe capturing a mass of ion frigates as "a glorious sight". It was strong enough
that Homeworld 2 nerfed it into uselessness. **The lesson: taking a thing that is still alive
is dramatically more exciting than cutting up a thing that is already dead.** We currently
only do the second.

The **Sensors Manager** works because it is the *same* command surface at a different scale —
you issue orders from it, you do not merely read it. Homeworld 3's version is criticised
specifically for icon amalgamation, which our `controls.md` already pre-empts with
24-px declustering.

**Homeworld 3's failures are our checklist.** Reviewers name: difficulty forming command
groups and picking units mid-battle even in Sensor view; orders "frequently ignored by the
game's AI pathfinding" with units flying into danger despite waypoints; unit abilities
"much simplified and more direct… special attacks and stat buffs rather than tactical
support"; and the removal of the command-and-control corvette, defense field frigate,
sensor distortion probes and proximity sensors
([TheSixthAxis](https://www.thesixthaxis.com/2024/05/10/homeworld-3-review/),
[GrogHeads](https://grogheads.com/review/21339),
[Gamerant](https://gamerant.com/homeworld-3-review/)).
The pattern: **they replaced tactical-support abilities with stat buffs, and the game got
smaller.** Our module `grants` block is currently 100% stat buffs.

**War Games**, Homeworld 3's roguelite mode, is the best-received part of the game and is
worth studying as a shape. Runs are ~1 hour, and **Artifacts** offer a choice of a few
upgrades of which you take one; most carry a small stat penalty alongside an extreme
benefit, and they "define the strategies and unit compositions used each run"
([TheGamer](https://www.thegamer.com/homeworld-3-war-games-artifacts-explained/),
[PC Gamer](https://www.pcgamer.com/homeworld-3s-roguelike-inspired-war-games-mode-is-perfect-for-strategists-in-a-hurry/)).
Note the two properties: **an exclusive choice** and **a stated cost**. Both are absent from
our refit.

### 1.4 FTL — power is a budget you cannot cover, and everything is a triage

FTL's reactor works because **you can never power everything**. Even fully upgraded, without
Zoltan crew you cannot simultaneously run maxed weapons, shields, engines, cloak, teleporter
and drones ([systems wiki](https://ftl.fandom.com/wiki/Systems)). Every fight is therefore a
sequence of *unpowering* decisions: shields down to charge the cloak, engines down to fire
the fourth weapon.

The dissenting analysis is worth taking seriously, because it applies to us more than to FTL.
A [design critique](https://www.vigaroe.com/2022/08/ftl-analysis-subsystems.html) argues the
power mechanic is partly redundant: needing to upgrade the reactor to power upgraded shields
is not meaningfully different from shields simply costing more scrap, *if you never
reallocate mid-fight*. **The power mechanic only earns its keep at the moments you move bars
under fire.** In FTL those moments exist because damage takes systems offline and frees their
bars, fires spread, and boarders force you to vent rooms.

**Our version has the same latent problem and fewer of the forcing moments.** `PowerPlant`
is a normalised split with a 3-second spool. Reactor damage lowers the ceiling (good —
that is a forcing moment). But nothing else forces a reallocation, and one of the four
channels, `sensors`, has **zero combat effect anywhere in the codebase** — it feeds
`DiscoverySystem.sensorRange()` and `sensorPips()` and nothing else. In a fight it is
strictly dominated, so a rational player always runs it at zero and the four-way split is
really a three-way split. That is a whole quarter of our marquee system doing nothing at the
moment the player is most engaged.

### 1.5 NEBULOUS: Fleet Command — the information is the game

Nebulous's depth comes from making **detection itself the contested resource**. Radar returns
depend on which way a hull is facing; jammers degrade both search and fire-control radars,
including the ones point defence needs; your EWAR emitters are themselves targets, and losing
them drops you to visual targeting only
([SpaceBattles thread](https://forums.spacebattles.com/threads/nebulous-fleet-command-ewar-in-spaceeeee.919887/),
[Steam reviews](https://steamcommunity.com/app/887570/reviews/?browsefilter=toprated)).
Players describe it as realistic "while not being intimidating", which is the trick: the
fidelity is in the *simulation*, and the *interface* stays a small number of switches.

The transferable idea is **emissions as a stance you toggle, with a cost on both sides**.
Not a fidelity arms race.

### 1.6 HIGHFLEET — weight, fuel, and the dread of being the one who is found

Two mechanisms.

**Fuel as universal solvent.** Fuel is spent on taking off, on strategic movement, and on
manoeuvring in battle; fuel is expensive, repairs are more expensive
([GosuNoob review](https://www.gosunoob.com/reviews/highfleet-review-brilliant-but-frustrating/),
[Steam: running out of money due to fuel](https://steamcommunity.com/app/1434950/discussions/0/2950411088479374116/)).
So a won battle can still be a loss, and the strategic decision "which town do I go to" is
answered in fuel, not in preference.

**Asymmetric detection with an escalation ladder.** The sensor set is genuinely elegant
([HighFleet wiki: Sensors](https://highfleet.fandom.com/wiki/Sensors),
[basic guide](https://gameplay.tips/guides/11966-highfleet.html)):

- **Radar** — long range, precise, and *loudly detectable*.
- **ELINT** — passive, detects radar emissions only, with far greater range than radar
  itself. So a ship sweeping with radar is seen long before it sees.
- **IRST** — passive, catches everything, undetectable, short range.
- **Sector search** — narrow the radar to a 60° arc and it becomes undetectable to ELINT
  *outside that arc*.

Every one of those is a **stance with a stated cost**, and together they make "should I
look?" the tensest decision in the game. Our `controls.md` §5.6 already borrowed the sector
search. What it did not borrow is the *ladder* — the fact that there are three sensor modes
that beat each other in a cycle, which is what stops the answer from being static.

The criticism is instructive too: reviewers consistently pair "brilliant" with
"frustrating", because the fuel economy has no forgiving floor. Our propellant reserve of 40
units (from `integration-decisions.md`) is exactly the right instinct.

### 1.7 Battlefleet Gothic: Armada 2 — big slow ships with buttons

BFG:A2 is the closest reference for *capital-ship combat feel*: "large, slow-turning
battleships", "an elegant ballet of guns and torpedoes… massive capital ships lurching into
position creating palpable tension"
([PixelJudge](https://pixeljudge.com/reviews/battlefleet-gothic-armada-2/),
[Third Coast Review](https://thirdcoastreview.com/2019/01/24/game-review-battlefield-gothic-armada-ii)).
It also has subsystem targeting — shields, crew, engines and weapons — exactly like ours.

The difference is that **BFG's ships have buttons**. Boarding actions, ramming, ordnance
runs, per-faction special abilities, and morale that can tip a crew into mutiny
([PC Gamer](https://www.pcgamer.com/battlefleet-gothic-armada-2-review/)). PC Gamer's phrase
is "smartly blends directed automation and micromanagement". The automation gives you the
seconds; the abilities give you something to do with them. Our ship has automation and no
abilities, so the seconds are dead.

Its failures are also worth pre-empting: fleet AI that gives "each fleet a single order",
causing bunching and vulnerability to AoE; ships colliding constantly and needing per-ship
micro paths; the AI charging to close range regardless of hull role
([Steam AI feedback](https://steamcommunity.com/app/573100/discussions/0/1780514838721784230/),
[pathfinding thread](https://steamcommunity.com/app/573100/discussions/0/1742231705667021824/?l=english)).
Our `fleetAI.js` already avoids the first (per-ship `ShipAI` under a fleet stance) and our
`shipAI.js` explicitly avoids the third (role profiles that fight the arc system). Keep both.

### 1.8 Star Citizen — components as a declared trade-off class

The component system's good idea is that gear is sorted into **classes with an explicit
personality**, not tiers: Competition (high performance, loud signature), Industrial (heavy,
power-hungry, durable), Military (durable, high signature and power draw), Stealth (fragile,
very low emissions and power draw)
([Star Citizen wiki: Ship components](https://starcitizen.tools/Ship_components)). Engines and
manoeuvring thrusters are the dominant EM emitters; shields and weapons second; the standard
stealth play is to shut down non-essential components rather than to buy a stat
([stealth guide](https://doctrine.substack.com/p/star-citizen-stealth-guide-tutorial)).

There is a live cautionary tale here too. Since power plants became frequent damage targets,
military-grade plants out-perform stealth ones **because they survive long enough to keep
systems online** — i.e. once a component became shootable, durability beat the exotic stat
([2026 equipment guide](https://starcitizenhelp.com/game-guides/ship-equipment)). Our
hardpoints are shootable by design; expect the same convergence unless fragile-but-exotic
modules also get a way to matter.

### 1.9 X4 / Avorion / Cosmoteer — the shape of "modular" that works

**Avorion**: turret slots are a *budget granted by subsystems*, and subsystems that grant
combat turret slots also grant defensive and auto-turret slots
([Avorion wiki](https://avorion.fandom.com/wiki/Turret_Control_Subsystems)). So the
interesting decision is not which gun, it is **how many guns you are allowed to have, bought
with the slots you did not spend on something else**. That is a much better decision than
ours: our six hardpoints are a fixed shape and a module either fits or does not.

**Cosmoteer**: the strongest reference for internal logistics as gameplay. Crew physically
carry batteries from reactors to systems and physically carry ammunition to projectile
weapons; the designer is integrated into play so you watch crew scramble to operate a module
the moment you add it ([Cosmoteer wiki: Crew](https://cosmoteer.wiki.gg/wiki/Crew)). The
campaign loop is described by players as: take a mission, spend the spoils on repairs, crew
and bits, and be limited in how fast you can add upgrades. **The limiter is the loop.** Crew
and interiors are out of scope for us; the *ammunition-must-reach-the-gun* idea is not
necessarily.

**Falling Frontier** (in development, but the design writing is unusually clear) makes
logistics simulated rather than abstracted, which turns supply lines into raidable objects,
and lets ships **mask their heat signature by closing heat sinks at the cost of gradual
overheating**
([GameDaily](https://gamedaily.com/news/falling-frontier-is-one-of-the-most-ambitious-space-rts-games-in-development),
[PC Gamer](https://www.pcgamer.com/games/rts/falling-frontiers-new-trailer-makes-me-want-to-hibernate-until-the-rts-appears-in-2025/)).
That heat-sink mechanic is a self-limiting stance — the good kind, because it ends on its own
and you have to choose *when* to spend it.

### 1.10 "Rogue Space" and the current Steam space-roguelike shelf

There is no single well-known Steam title called *Rogue Space*; the nearest current matches
are **[Slipstream: Rogue Space](https://store.steampowered.com/app/2765860/Slipstream_Rogue_Space/)**
(91% positive, 144 reviews) and **[Rogue Command](https://store.steampowered.com/app/1461910/Rogue_Command/)**.

Slipstream is an asymmetric co-op ship: one Captain gives orders while a Crew of players
operate guns, repairs and shields, on randomly generated maps, with permanent XP and a skill
tree between runs. **Its interesting property for us is that the fun is entirely in
concurrent station demands** — the ship needs three things at once and there are not enough
hands. It gets that for free by having several humans. A single-player ship has to
manufacture it, which is precisely what an ammunition/heat/damage-control layer does.

Rogue Command is a base-building RTS roguelite whose pitch is that "with every run the rules
of the battlefield change" — i.e. **run-level rule modifiers**, the War Games artifact idea
again. Two independent recent RTS roguelites converging on the same device is a strong signal.

---

## 2. Decision texture — what the player actually decides, and how often

This is the diagnostic that matters. Decisions per unit time, by game, restricted to
decisions with a real cost.

### Per minute (inside a fight)

| Game | Decisions available every few seconds |
|---|---|
| FTL | which system to unpower; which enemy room to shoot; when to spend the cloak; where to send crew; when to vent |
| Everspace 1/2 | which device to trigger; which damage type to switch to; when to burn boost; when to break off; whether to spend a consumable |
| Nebulous | radar on or off; which contact to commit a missile to; whether to accept a fire-control lock cost |
| BFG:A2 | which ability to spend; when to ram or board; when to brace; which subsystem to switch fire to |
| Highfleet (battle) | which ship to commit; fuel spent on manoeuvre; when to launch missiles that cost money |
| **Nadir Point today** | which subsystem to target; which heading to turn to; which power preset to hold |

Ours is not empty — the heading decision is a genuinely good one because arcs are anchored
to hull positions and turning costs seconds. But it is **three decisions with slow feedback
and no expenditure**, so a fight is one plan executed rather than a plan being revised. The
per-minute column is where we are thinnest.

### Per engagement

| Game | Engagement-level decisions |
|---|---|
| FTL | fight or flee; whether to spend the FTL charge early |
| Everspace 1 | stay for the last container or jump before the warship arrives |
| Highfleet | engage, evade, or bait; whether to reveal yourself with radar |
| Homeworld | what to build with this mission's resources; what to capture |
| **Nadir Point today** | which ship to kill first; **whether to kill by reactor or by attrition**; whether to salvage now or later |

**The reactor-versus-attrition decision is genuinely excellent and is the best thing in the
design.** It is a real risk/reward with a stated payout curve (`salvageIntegrity` capped at
0.15 on a reactor kill), it is legible, and it is expressed entirely through aiming. Protect
it. Almost everything in §6 is built to give it more company.

### Per run / per POI visit

| Game | Run-level decisions |
|---|---|
| Everspace 1 | route branch; which permanent upgrade to buy; when to cash in |
| Homeworld | what to research; what to preserve for the next mission |
| HW3 War Games | which artifact of three; which map branch |
| Highfleet | route across the map; which town; how much fuel to buy |
| ES2 Rifts | how much Lunacy to take on before opening the portal |
| **Nadir Point today** | which POI to burn to; SILENT or fast; which module to fit |

This tier is our **strongest** — Plot-and-Burn already produces a proper decision with
numbers on it (ETA, propellant, interception %), and the "arrive during the battle or after
it" fork from `controls.md` §5.7 is a genuinely first-rate run-level decision. What is
missing at this tier is a **ratchet**: nothing gets harder because time passed, so there is
no cost to taking the safe route every time.

**Summary of the texture problem:** we are strong at the 5-minute scale, adequate at the
1-minute scale, and close to empty at the 5-second scale. Reference games are dense at all
three, and the 5-second layer is what makes the other two feel earned.

---

## 3. Loot and progression models — Everspace 2's gear versus our parts-not-currency salvage

### 3.1 What each model actually is

**Everspace 2**: a Diablo loop. Items drop with rarity tiers and randomised affixes; you
compare numbers in a grid, equip the bigger one, sell the rest. Perks unlock every 5 levels
on a separate character track. What makes it *sometimes* great is that a minority of items
carry **conditional** effects that interlock (slow-on-demand + bonus-versus-slowed). What
makes it *usually* tedious is that the majority are incremental scalars, and the sorting is
done in a menu at a base.

**Ours** (`src/sim/salvage.js`, `src/sim/refit.js`): a `WreckSection` yields a **registered
module**, which is the *same object* whether it is on the enemy hull, in your hold, or bolted
to your ship. There is no currency, no market and no price. The only sink is
`scrapInventoryItem`, which converts a part into `mass × 0.4 × condition` alloy plus
composite, and alloy pays for `repairHardpoint` and `repairHull`.

**Our model is better than theirs at the thing that matters most**, and it is worth saying
why precisely, because it is the reason to defend it against every "just add a shop" impulse:

1. **The reward is visible on the outside of the ship.** The silhouette audit measures
   84–89 m of mean outline divergence between loadouts. Everspace 2's +7% shield capacity is
   a number in a menu. Ours is a shape against a starfield.
2. **The reward is causally attached to how you fought.** A reactor kill destroys the thing
   you wanted. No looter-shooter has this. It converts *aiming skill* directly into *loot
   quality*, which is the single cleanest reward channel in the genre.
3. **There is no menu economy to be tedious in.** No prices, no vendor trash, no stack
   limits. We have structurally avoided the #1 complaint about Everspace 2 by construction.

### 3.2 What they do that gives loot meaning beyond a stat bump — and what we should take

Five mechanisms, ranked by how much they would help us:

**(a) Conditional effects that create a combo, not a total.** The praised ES2 items do not
add damage; they add *a rule* ("+X versus slowed", "refund energy on kill"). Our
`ModuleDef.grants` is a flat map: `{powerOutput, thrust, turnRate, hangarBays, cargo,
sensorRange, shieldCapacity, salvageRate}`. Every entry is a scalar and no entry can
reference another module. **This is the same failure Homeworld 3 was criticised for** — stat
buffs where the older games had tactical support. Adding a small vocabulary of conditional
grants is the highest-value change in this section.

**(b) Every gain has a stated cost.** HW3's artifacts pair "extreme benefit" with "small stat
penalty". Star Citizen's component classes are pure trade-offs — stealth parts are *fragile*,
military parts are *loud*. Our modules have `mass` declared in `ModuleDef` and **`RefitSystem`
never reads it**. A salvaged cannon bank is free. Free upgrades are not decisions.

**(c) Loot as capability unlock, not magnitude.** Ours already does this twice and both are
the best-designed moments in the codebase: installing a reactor unlocks power routing;
installing a hangar unlocks the RTS command layer, with `_applyModuleEffects` deliberately
gating both so the player is not handed two systems at once. That instinct — **a part that
turns on a verb** — should be extended, not the scalar list.

**(d) Provenance you can read.** A module carries `faction`, so a Coalition cannon bank
visibly wears Coalition identity on a Concord-heavy hull. This is a genuine differentiator no
reference game has, and it currently pays out only visually. It should pay out mechanically
too — see §6.7.

**(e) Condition as a live property, not a scrap multiplier.** `condition` is written from
`section.integrity` on pickup and read in exactly two places, both of which compute scrap
value. A cannon bank cut from a burning wreck at 0.4 condition fires exactly as well as a
pristine one. That is a whole dimension of "how the ship died" thrown away one step after it
is generated.

### 3.3 What we must not copy

- **No inventory grid, no stack limits, no vendor.** We have six mounts and a hold of six.
  Keep it. Everspace 1 shipped no inventory screen on purpose and Everspace 2's is its
  most-complained-about system.
- **No rarity tiers with rolled affixes.** Rolled numbers are what produce "junk that needs
  processed". Our tiers (1–3) are mount-capacity gates, which is a structural constraint, not
  a rarity ladder. Keep it that way.
- **No character level, no XP, no perk tree.** Out of scope per the brief, and ES2's perk
  system is its second-most-criticised feature. Everything the player gains should be a thing
  bolted to the ship.

---

## 4. Failure and risk — what creates tension when nothing is permanent

### 4.1 How the references do it

| Game | Loss model | What actually generates the tension |
|---|---|---|
| Everspace 1 | permadeath, run resets, meta-currency kept | the escalating reinforcement timer inside every location — "one more container" is priced |
| Everspace 2 | no permadeath; you respawn and pay | almost nothing; reviewers note the ship "learns through living", and the tension is widely reported as absent outside Rifts |
| ES2 Ancient Rifts | run ends, loot lost | **player-set difficulty before entry** (Lunacy) + portal modifiers |
| FTL | permadeath | resources you cannot replenish: fuel, missiles, drone parts, hull |
| Highfleet | fleet attrition, no undo | fuel and money; a won battle can bankrupt you; being *detected* is a loss state before a shot is fired |
| Homeworld | fleet persists into the next mission | every loss is permanent even though you did not lose |
| Nebulous | match loss | your sensors are shootable; losing EWAR blinds you mid-fight |
| BFG:A2 | ships can be crippled or lost for a campaign turn | morale/mutiny; the decision to withdraw a damaged ship *and forfeit the fight* |

The pattern across every one of them: **tension does not come from death. It comes from an
irreversible expenditure made under uncertainty.** Permadeath is just the loudest wrapper.
Homeworld has no permadeath at all and is the tensest game on the list, because a corvette
lost in mission 4 is gone in mission 12.

### 4.2 What we have

- **Hardpoint breach → permanent module loss** (`Ship._breachHardpoint`). This is our
  Homeworld-style irreversible loss and it is well-built: the player watches `structureHP`
  fall, gets an explicit warning event at 35%, and the doc comment correctly says losing a
  rare module to an invisible threshold would be a bug. It is the strongest tension source we
  have.
- **Salvage integrity** — irreversible in the other direction: a bad kill destroys value that
  never existed to be lost, which is a subtler and rather elegant kind of loss.
- **Propellant + interception rolls** in transit, with a 40-unit reserve floor.
- **Reputation** moving with both factions, gating patrol heat.

### 4.3 What we are missing, and it is the important half

**There is no cost to time.** Nothing in the codebase makes waiting expensive. A player can
sit in a wreck field indefinitely, cut every section, repair to full if they have alloy, and
leave. `SalvageSystem._updateCut` even *preserves cut progress* when you drift out of range —
kind, and correct in isolation, but the sum of every such kindness is a loop with no pressure
in it at all. Everspace 1's single most important mechanic is the one that makes exactly this
impossible.

**There is no reason to retreat.** Withdrawal exists for the AI (`ShipAI._withdraw`,
`Fleet.retreatThreshold = 0.30`) and not for the player. The player never says "I am leaving
this field with three sections uncut", because leaving costs nothing and returning costs
nothing.

**There is no repair scarcity curve.** `repairHull` costs `missing × 0.5` alloy at a flat
rate with no cap and no time. Since scrapping parts generates alloy and wrecks generate
parts, the material economy has no obvious floor. Highfleet's whole dread is that repairs
outrun income.

**The player cannot lose the run.** There is no run. The faction war progresses on its own
schedule forever and nothing about the world gets worse if the player is slow.

### 4.4 The design position I would take

Given no permadeath and a persistent hull, the three tension sources available to us, in
order of strength:

1. **Irreversible partial loss** — modules blown off hardpoints. Already built. Lean into it
   hard: make more of the ship loseable and make the loss legible before it happens.
2. **A clock with teeth at every scale** — one inside the fight (heat/ammo), one inside the
   POI visit (escalation), one across the run (the war ratchets). None of these exist yet.
3. **Foregone value** — the salvage you did not take because you had to leave. This is
   *uniquely available to us* and no reference game has it in this form, because in a looter
   the loot waits for you and in an RTS there is no loot. In our game the thing you leave
   behind is a physical object you shot at, in a wreck field you can see from the tactical
   overlay, and it will be gone or picked over when you come back.

Number 3 is the one to build the game's identity on. "I got out with four of the six
sections" is a Nadir Point sentence and it is not a sentence any of the reference games can
say.

---

## 5. What we are missing — specific gaps, checked against the code

Each item names the file and states what is there now. Ordered by how much fun is being left
on the table.

### 5.1 Nothing depletes in a fight (`sim/combat.js`, `sim/power.js`)

Weapons have `cooldown`, `shotsPerBurst`, `burstInterval` and no magazine. `powerFactor`
scales the cooldown and nothing else. There is no ammunition, no heat, no capacitor. A
20-minute engagement costs exactly what a 20-second one costs. Every reference game on the
list has at least one depleting combat resource, and most have two.

The direct consequence: **the player has no reason to stop firing, therefore no reason to
choose a target order, therefore no reason to have a plan beyond "turn to bear".**

### 5.2 The player has nothing to press (`sim/ship.js`, `ui/**`)

There is no active ability anywhere in the codebase. The complete set of live combat inputs
is: move order, attack order, subsystem selection, power slider/preset, strike-craft order.
BFG:A2's abilities, FTL's cloak/hack, Everspace's devices, Nebulous's emissions toggles all
occupy this slot. This is the gap that makes the 5-second decision tier empty.

### 5.3 The `sensors` power channel does nothing in combat (`sim/power.js`, `world/discovery.js`)

`power.factor(...)` is read in exactly four places: engines (twice — hull efficiency and
plume VFX), shields (regen), weapons (rate of fire). `sensors` is read only by
`DiscoverySystem`, for POI reveal range and survey pips. In a fight the correct play is to
zero it. **One quarter of the marquee system is a strictly dominated option during the only
part of the game where the system is on screen.**

### 5.4 Module `mass` is declared and never applied (`core/contracts.js`, `sim/refit.js`)

`ModuleDef.mass` exists (e.g. `340` on the example in ARCHITECTURE.md).
`RefitSystem._applyModuleEffects` computes `thrustMul`, `turnMul`, power, bays, cargo,
sensors, shields and salvage rate — and never touches `body.mass`, `body.accel` or
`body.turnRate` on account of load. **Fitting the heaviest possible module on all six mounts
is strictly correct.** There is no loadout decision, only a loadout maximum.

### 5.5 Module `condition` never affects performance (`sim/salvage.js`, `sim/refit.js`)

Written from `section.integrity` at pickup; read only to compute scrap alloy. A 0.3-condition
beam array is a 1.0-condition beam array with a smaller resale value that there is no market
to sell into.

### 5.6 Salvage yield is a hidden dice roll, not a visible consequence (`sim/salvage.js`)

```js
const survived = !sub.destroyed && rng.next() < this.integrity;
```

`this.integrity` is `ship.salvageIntegrity`, which is 1 unless a reactor kill capped it at
0.15. So: shoot out a destroyer's engines and its port battery carefully, and its *starboard*
battery — which you never touched — still has a 1-in-1 chance if the reactor lived and a
17-in-20 chance of being scrap if it did not. There is **no per-section damage attribution**.
The game's central promise ("how a ship died decides what is left of it") is currently true
at exactly one bit of resolution.

### 5.7 Cutting is dead time (`sim/salvage.js`)

`cutRate = 0.34/s`, so a section takes ~3 s at base and ~1.9 s with a tractor rating of 1. The
only failure mode is drifting out of `RANGE.salvageBeam` (1800 m), and even that preserves
progress. During a cut the player does nothing and risks nothing. Compare Everspace's
escalation timer, or Homeworld's salvage corvettes being shootable and slow enough that
escorting them was the mission.

### 5.8 There is no capture, only scavenging (`sim/salvage.js`, `sim/ai/shipAI.js`)

`Ship.stranded` and `Ship.defanged` exist and are computed. A ship that is stranded and
defanged is a fully helpless live hull that the game has no verb for except "keep shooting
it until it becomes a wreck". Homeworld's most-loved mechanic lives exactly here.

### 5.9 Strike-craft stances are declared and unread (`sim/strikecraft.js`)

`SQUAD_STANCE = ['aggressive','defensive','escort','strike']` and `setStance()` stores it.
`_updateCraft` never reads `squad.stance`. `StrikeCraft.fuel = 1` is set and never decremented.
There is one squadron, capped at 8, of one auto-selected class. The RTS layer the design
promises is currently a single attack-move button.

### 5.10 There is no in-combat damage control (`sim/refit.js`)

`repairHardpoint` and `repairHull` are instant material spends with no time cost and no
combat restriction. There is no triage decision — no "the port mount is at 12%, do I pull
power to brace it or accept the loss". FTL, Cosmoteer and BFG:A2 all put their most frantic
decisions here.

### 5.11 There is no clock at any scale (`world/factionWar.js`, `world/travel.js`)

The faction war has excellent *content* pacing — 41 battles across 92 simulated minutes in
the probe, control flipping, wreck fields deposited by the loser — and **no pressure on the
player**. Nothing gets worse if you are slow. `heat`, which is the one variable that could
carry it, only affects transit interception.

### 5.12 No emissions/signature layer in combat (`world/discovery.js`)

`signatureMultiplier` exists and is 1 except during a survey. In transit it is ×6 (×1.5
SILENT). Inside a fight there is no such thing as being seen or not seen; every AI ship knows
about every other ship. Given that we already have (a) a sensors power channel doing nothing,
(b) a signature concept, and (c) a salvage fantasy that is thematically about *not* being
noticed, this is the largest thematically-aligned system that is 80% pre-built and 0% wired.

### 5.13 Faction identity does not cash out mechanically

Coalition is "rectilinear, slab armour, external structure" and Concord is "swept, blade-like,
machinery hidden". Both are purely visual. `matchesKind()` filters salvage candidates by
faction, so the *distribution* of what you find differs, but a Coalition cannon and a Concord
cannon of the same tier behave identically. Everspace's ship classes and Star Citizen's
component classes both show how much personality is available here for very little code.

---

## 6. Prioritised, implementable recommendations

Each entry: **what it is**, **why it is fun**, **how it interlocks**, **cost**. Cost bands are
S (≤ a day inside one stream), M (a few days, one stream, one contract change), L (multiple
streams or a new subsystem). Priority order is by fun-per-unit-cost, not by size.

---

### P1 — Weapon heat, per-mount, spent and shed (Combat + UI) — **cost M**

**What.** Every non-PD mount accumulates `heat` per shot and sheds it at `coolRate`. Above
`softCap` (say 0.7) accuracy degrades and `spread` widens; at 1.0 the mount **trips offline**
for a fixed spin-down and takes minor structure damage on the hardpoint it sits on. Heat sheds
faster when the `engines`/`shields` channels are *under*-drawn, or add a fifth
non-combat-dominated behaviour: the `sensors` channel doubles as thermal management (see P2).

**Why it is fun.** It converts "turn to bear and hold the trigger" into "turn to bear and
decide which two of my four mounts fire". It creates the alpha-strike-versus-sustain decision
that FTL, Nebulous and Highfleet all monetise, and it does it without an ammunition inventory
(which would drag in the Everspace-2 menu problem). It also gives the player a reason to
break off that is not "I am nearly dead".

**Interlock.** Heat lives on `WeaponMount`, which already has `cooldown`/`burstTimer`/`online`
— `online` is already the flag that a destroyed weapon subsystem sets, so a tripped mount
reuses the existing offline path and the existing HUD treatment. It makes `power.factor(
'weapons')` matter in two directions instead of one (more power = more shots = more heat).
It makes *hull facing* matter twice: a broadside that can only bring three mounts to bear
overheats them faster than a fit that brings six.

**Cost.** `sim/ship.js` (~30 lines on `WeaponMount`), `sim/combat.js` (~10 lines at the fire
site), a heat bar per mount in `ui/hud.js`, one constant block. No new systems, no new
contracts. **This is the single best fun-per-line change available.**

---

### P2 — Make the `sensors` channel do something in a fight (Combat + World sim) — **cost M**

**What.** Give the sensors channel two combat effects and one drawback:

- **Fire solution quality.** `subsystemAccuracy` scales with `power.factor('sensors')`. At
  low sensors, aimed subsystem shots mostly hit hull; at high sensors, they land. This is
  *directly* the salvage-integrity dial.
- **Contact resolution.** Below a pip threshold, hostiles beyond some range render as
  unresolved contacts (bearing + mass class, no subsystem ring) — reuse the
  `MASS SIG · ~3400 m · UNRESOLVED` treatment the tactical overlay already specifies.
- **Drawback:** high sensors raises your own signature, feeding the existing
  `signatureMultiplier` and therefore `heat` and the war's `_observe()`.

**Why it is fun.** It repairs the marquee system. Right now a four-way split has three real
options; after this it has four, and the fourth trades *loot quality* against *being noticed*,
which is the game's actual theme. It also makes the SCAN preset (`sensors: 0.48`) something
other than a travel utility.

**Interlock.** `applyDamage` already takes `accuracy`; `_fire` already reads
`def.subsystemAccuracy`. Multiply at one site. `DiscoverySystem.signatureMultiplier` already
exists and `FactionWarSystem` already consumes heat. The subsystem ring in `ui/tactical.js`
already greys out entries via `canAnyWeaponBear` — greying for *unresolved* uses the same
path.

**Cost.** ~40 lines across `sim/combat.js`, `sim/ship.js`, `world/discovery.js`; a contact-
resolution state in the HUD.

---

### P3 — Per-section damage attribution for salvage (Salvage) — **cost M**

**What.** Replace the single `salvageIntegrity` roll with per-section integrity accumulated
during the fight. Every `applyDamage` that resolves near a subsystem degrades *that*
subsystem's future salvage value; splash and hull damage degrade nearby sections a little.
A reactor kill still floors everything (keep it — it is the best rule in the design). Then
show it: while a hostile is targeted, the subsystem ring displays each section's **projected
salvage state** — INTACT / DAMAGED / SCRAP — updating live as you shoot.

**Why it is fun.** It converts the game's central promise from a hidden die roll into a live
readout you are steering. "Kill it without touching the starboard battery" becomes an
executable objective with feedback at 60 Hz. It is the difference between a loot table and a
skill.

**Interlock.** `WreckSection` already has `integrity` per section and
`Wreck._buildSections` already reads per-subsystem `destroyed`. The change is to track the
number continuously instead of rolling it at death. `ui/tactical.js` already draws a
subsystem ring; this adds a colour state to rings that already exist. It makes P2's accuracy
dial directly legible, and it makes beam weapons (`subsystemAccuracy` 0.92) mechanically the
salvager's weapon rather than rhetorically.

**Cost.** ~60 lines in `sim/ship.js` + `sim/salvage.js`, plus a ring state in UI. Touches the
Salvage stream's files, so coordinate.

---

### P4 — Escalation pressure at a POI (World sim + UI) — **cost M**

**What.** Everspace's reinforcement clock, in our fiction. While the player is inside a POI
with hostiles present or wrecks unclaimed, a **response timer** runs. Its rate scales with
`heat`, with how loud the player has been (weapons fired, active survey, transit arrival at
×6 signature), and with whose space it is. At each threshold the controlling faction sends a
heavier element: a patrol, then a picket with a destroyer, then something you should not
fight. The timer is **always visible** on the HUD as a bearing-and-ETA readout, never a
surprise, and it can be *slowed* — a countermeasure module, running SILENT, or cutting from
the far side of a hulk.

**Why it is fun.** It is the missing price on time, and it makes every remaining decision
sharper without adding any new verbs: which section do I cut first, do I take the reactor
kill for speed or the careful kill for value, do I leave with four of six. It is exactly the
mechanism that produces §4.4's "foregone value" identity, and it is the mechanism the
Everspace team named as their fix for the frustration of long runs.

**Interlock.** `FactionWarSystem` already spawns fleets (`_spawnBattle`, `materialise`) and
already tracks `heat` and `control`; `TravelSystem._intercepted` already builds an ambush
force from nothing. The response wave reuses both. It gives `SILENT` a combat-adjacent use.
It gives the reputation system real consequences (`adjustReputation` already exists and the
report calls its consequences shallow). It gives the salvage cut a reason to be slow.

**Cost.** ~120 lines in `world/factionWar.js` or a small new `world/response.js`, plus HUD.
Needs a design pass on the threshold table.

---

### P5 — Mass and condition finally do something (Refit) — **cost S**

**What.** Two small changes with disproportionate effect.

- **Mass:** sum installed `ModuleDef.mass`, and derive a load factor that reduces
  `body.accel` and `body.turnRate` and increases the transit propellant rate. Publish the
  number on the refit screen as a delta ("+340 t · −4% turn · +0.06 prop/km").
- **Condition:** `condition` multiplies the module's effective output — a 0.4-condition
  cannon bank fires slower or hits softer, a 0.4-condition reactor grants less
  `powerOutput` — and can be restored toward 1.0 with materials and time.

**Why it is fun.** It turns six mounts from "fill them all" into a real loadout problem, which
is Avorion's whole appeal and Star Citizen's component-class trade-off in miniature. It makes
the careful kill pay twice (better condition, not just a part existing). And it gives the
alloy economy a second sink that is not repair, which is the thing keeping Highfleet's fuel
dread alive.

**Interlock.** Both values already exist on the data. `_applyModuleEffects` is already the
single place where a loadout becomes statistics — this is entirely inside that one function
plus the refit UI. It interacts with the turn-rate-degrades-with-speed model already tuned in
`physics.js`, so a heavy fit is felt in the one system we have measured most carefully.

**Cost.** ~25 lines in `sim/refit.js`, ~20 in `ui/refit.js`. **The cheapest item on this list
and it creates a decision where there is currently none.**

---

### P6 — A small vocabulary of conditional grants (Contracts + Refit) — **cost M**

**What.** Extend `ModuleDef.grants` from a flat scalar map with a short, closed list of
**conditional** effects — six to ten, no more — each of which changes what action is correct
rather than how big a number is. Candidates that fit systems we already have:

| Grant | Effect | The decision it creates |
|---|---|---|
| `heatSink` | mounts on this side shed heat faster | a reason to fight on one flank |
| `coldStart` | first burst after a lull does bonus damage | a reason to hold fire |
| `braced` | this hardpoint's `structureHP` regenerates out of combat | a reason to fit a fragile module here |
| `overdraw` | +rate of fire, but draws from `shields` as well as `weapons` | a live power gamble |
| `salvageSpotter` | shows projected section integrity at longer range | a scout fit |
| `quietRunning` | −signature while weapons are cold | rewards not shooting |
| `spallLiner` | subsystem hits bleed less into hull | changes how long a target survives being stripped |

Each is a boolean or a small scalar on the existing `grants` object, read at one site.

**Why it is fun.** This is the exact mechanism behind everything players praise about
Everspace 2's loot and everything reviewers say Homeworld 3 lost. It is what makes a salvaged
part a *plan* rather than a *number*. Two modules that interlock produce the "every couple of
upgrades changes how you approach a fight" effect at a fraction of the content cost of a
rarity/affix system.

**Interlock.** `grants` is already the one place a module's passive effects live, and
`_applyModuleEffects` is already the one place they are applied. Several entries above are
free riders on P1 (heat) and P2 (signature/sensors), which is the point — conditional grants
are worth much more once there are systems for them to be conditional *on*. **Build P1 and P2
first; this is worth half as much without them.**

**Cost.** ~15 lines in `core/contracts.js` typedef + validation, ~40 across the reading sites,
plus module authoring. Registry-driven, so content scales without code.

---

### P7 — Boarding/prize capture of a stranded, defanged hull (Salvage + World sim) — **cost L**

**What.** When a hostile is both `stranded` and `defanged` (both properties already computed),
a new verb appears: **claim**. Hold position within tractor range for a sustained period —
long enough that the response clock from P4 is a real threat — and the hull becomes yours: not
as a controllable ship, but as a **prize** that yields every intact section at full condition
plus its hull plating, or, at the top end, one section of a class you cannot otherwise obtain.

**Why it is fun.** It is the most fondly-remembered mechanic in the reference set, it is
thematically exact for a scavenger, and it converts the *best* combat outcome from "shoot it
until it dies carefully" into "cripple it precisely and then survive the consequences". It
also gives `stranded`/`defanged` — two well-designed properties currently used only by the AI
— a player-facing payoff.

**Interlock.** Needs P4 to be interesting (otherwise it is a free reward for waiting) and is
made much better by P3 (you can see exactly what the prize is worth before you commit).
Extends `SalvageSystem` with a second mode alongside `orderCut`.

**SCOPE DECISION.** Crew and boarding parties are out of scope. The version above avoids crew
entirely — it is a tractor-and-tow operation on a helpless hull, mechanically a long cut on a
live target. If a *strike-craft-delivered* boarding action is wanted instead, that crosses
into crew and should be an explicit decision, not an assumption.

**Cost.** ~150 lines plus UI and a VFX grammar for the claim. Real feature.

---

### P8 — Give the strike-craft layer its stances and its cost (World sim & AI) — **cost M**

**What.** Make `SQUAD_STANCE` real — `escort` holds a screen and intercepts munitions,
`defensive` engages only what closes, `strike` runs on one subsystem of one target,
`aggressive` is current behaviour — and make squadrons **consumable**: drain `StrikeCraft.fuel`
(already declared, never decremented), require a rearm cycle on the deck, and let losses cost
materials to replace. Add at least a second squadron slot when hangar bays allow.

**Why it is fun.** Right now the RTS layer is one button. Stances are the cheapest way to make
it a *command* layer, and they map cleanly onto our arc system: an escort screen changes what
the enemy can bring to bear on you. Fuel and rearm make launching a decision rather than a
default, which is what stops the hangar module from being a strict upgrade.

**Interlock.** `Squadron.setStance` and the stance list already exist; the work is in
`_updateCraft`. Strike craft are the only player-controlled things off the combat plane, so
this is also the system that pays off the vertical-volume design decision. Rearm cost ties into
the alloy economy alongside P5.

**Cost.** ~100 lines in `sim/strikecraft.js`, plus command UI.

---

### P9 — In-combat damage control as a power stance (Combat + Refit + UI) — **cost M**

**What.** A fifth thing to spend on, expressed through the widget the player already knows.
Holding a **BRACE** stance diverts output to structural integrity: hardpoint `structureHP`
degrades more slowly and can partially recover, at the cost of weapons and engine output —
paid at the 3-second spool, so it is a commitment, not a panic button. Optionally: while
braced, a breached-but-not-yet-lost mount can be saved.

**Why it is fun.** It puts a decision at the moment the game currently has its loudest event
and its least interesting response — the 35% breach warning, where today the only options are
"keep fighting" and "leave". FTL, Cosmoteer and BFG:A2 all locate their most frantic moments
exactly here. And the spool makes it a *prediction* problem: brace too late and you have
neither the guns nor the structure, which is the same lesson `power.js`'s comment already
states as the system's core skill.

**Interlock.** Pure addition to `PowerPlant` (a preset plus one consumer) and
`Ship.applyDamage`'s hardpoint branch. Uses the existing `HARDPOINT_BREACH_WARNING` event as
its cue. Directly increases the value of P5's condition system (bracing preserves condition).

**Cost.** ~50 lines plus a HUD state.

---

### P10 — A run-level ratchet and a stated arc (World sim) — **cost L**

**What.** Give the campaign a shape without giving it a story. The war escalates on a schedule
the player can read: as total salvage extracted rises (or as the front stabilises), both
factions field heavier classes, patrol heat floors rise, and the richest wreck fields appear
further inside contested space. Optionally: an end condition — the front collapses, or the
ancient hulk becomes reachable — that the player is racing toward without being told to.

**Why it is fun.** It is the missing per-run tier from §2. Without it, the safe route is always
correct and the player's own growing power has no counterweight. HW3's War Games, Everspace's
sector scaling, and FTL's rebel fleet all do exactly this, and Everspace's team was explicit
that the escalation *is* the pacing.

**Interlock.** `FactionWarSystem` already has `_reinforceWeight`, `_schedule` and a front line
that moves; this is a global difficulty term feeding those. It is what makes P4's local clock
part of a curve rather than a repeated tax.

**SCOPE DECISION.** "Run structure" edges toward campaign, which is out of scope. The
in-scope version is **a difficulty and content curve driven by the existing simulation**, with
no missions, no objectives text and no scripted beats — the world simply gets heavier. An
explicit win condition would be a scope decision and should be raised, not assumed.

**Cost.** ~150 lines plus a balance pass. Cheap in code, expensive in tuning.

---

### P11 — Faction component personality (Contracts + Geometry data) — **cost S**

**What.** Give the two factions a mechanical grammar to match their visual one, along Star
Citizen's component-class lines. Coalition (slab armour, external structure): higher
`structureHP` contribution, higher mass, more heat capacity, cruder accuracy. Concord
(swept, machinery hidden): lighter, better `subsystemAccuracy`, lower signature, less
tolerant of hardpoint damage.

**Why it is fun.** It makes a mixed-faction hull — which is *the* visual identity of the
project, already measured and defended in `ship-language.md` §5 — into a mechanical statement
as well. "This ship is Concord guns on a Coalition frame" becomes something the player *did*,
not just something they are looking at. It costs almost nothing because the faction field is
already on every module.

**Interlock.** Multiplies with P1 (heat capacity), P2 (accuracy/signature), P5 (mass), P6
(conditional grants). It is best built *after* those systems exist, but it is trivial once
they do.

**Cost.** Data plus ~20 lines of derivation in `_applyModuleEffects`.

---

### P12 — Wreck fields decay and are competed for (World sim + Salvage) — **cost M**

**What.** Wrecks are not permanent. Uncut sections degrade over sim time; the controlling
faction runs its own recovery tenders that strip fields you leave; a field you visited and
half-cut is visibly picked over when you return. The tactical overlay shows a field's
remaining value and its age.

**Why it is fun.** It is the mechanism that converts §4.4's "foregone value" from a feeling
into a number. Leaving three sections uncut *costs something specific*, and the cost is on
screen the next time you look at the map. It also makes the "arrive during the battle vs.
after it" fork from `controls.md` §5.7 pay out properly, and it stops the world from being an
infinite larder.

**Interlock.** `FactionWarSystem._depositWreckage` already creates fields per POI and
`debrisSpecFor` already describes them. This adds a decay term and a recovery actor. It
combines with P4 to produce the game's defining sentence: *I left with four of six because
the response wave arrived, and when I came back the Coalition had taken the rest.*

**Cost.** ~100 lines, mostly in `world/factionWar.js`.

---

### Deliberately not recommended

- **A market, prices, or selling.** Out of scope, and it is the mechanism behind Everspace 2's
  worst reviews. Parts-not-currency is a competitive advantage; do not trade it for
  convenience.
- **Rarity tiers with rolled affixes.** Produces "junk that needs processed". Our tier field
  is a mount gate; keep it structural.
- **A pilot/character perk tree.** Out of scope, and the second-most-criticised system in
  Everspace 2.
- **An inventory grid or a stash.** Six mounts, six hold slots. Everspace 1 shipped no
  inventory screen deliberately; that was the right call and we should hold it.
- **More sensor fidelity than one stance switch.** Nebulous earns its depth with a dedicated
  audience. Take the *idea* (looking costs something) and not the instrument panel.
- **Ability-spam abilities.** BFG:A2's ability layer works because the ships are slow; it fails
  where players just spam. Every active we add should be a stance with a spool, not a
  cooldown button — which our power system already models correctly.

---

### Suggested build order

**Phase 1 — make a fight have an economy.** P1 (weapon heat), P5 (mass and condition), P2
(sensors channel). Three changes, mostly inside files that already exist, and after them a
fight has a resource, a loadout has a cost, and the power widget has four live options.

**Phase 2 — make salvage a skill you can watch.** P3 (per-section attribution), P4
(escalation clock), P12 (wreck decay). After these the game's title mechanic is legible,
priced, and lossy.

**Phase 3 — new verbs.** P6 (conditional grants), P9 (brace), P8 (strike-craft stances), P11
(faction personality).

**Phase 4 — the long ones.** P7 (capture), P10 (run ratchet). Both need scope decisions and
both are better after everything above.

---

## Sources

**Everspace / Everspace 2**
- [Game Design Deep Dive: Managing randomization, frustration in Everspace — Game Developer](https://www.gamedeveloper.com/design/game-design-deep-dive-managing-randomization-frustration-in-i-everspace-i-)
- [Everspace 2 review — EIP Gaming](https://eip.gg/reviews/everspace-2/)
- [Thoughts and issues with Everspace 2 — Steam](https://steamcommunity.com/app/1128920/discussions/0/4206994023684663218/)
- [A (hopefully) constructive criticism about Everspace 2 — Steam](https://steamcommunity.com/app/1128920/discussions/0/3108014879955874142/)
- [My biggest complaint has to be inventory management — Steam](https://steamcommunity.com/app/1128920/discussions/0/3154202142442283467/)
- [Decrease or Remove inventory management — Steam](https://steamcommunity.com/app/1128920/discussions/5/3464974615679850392/)
- [Everspace's chronically dull resource gathering gets in the way of the action — PC Gamer](https://www.pcgamer.com/everspaces-chronically-dull-resource-gathering-gets-in-the-way-of-the-action/)
- [Mining — Everspace 2 Steam discussion](https://steamcommunity.com/app/1128920/discussions/0/6861841362667976942/)
- [Every Ship Subclass In Everspace 2, Ranked — TheGamer](https://www.thegamer.com/everspace-2-every-ship-subclass-type-ranked/)
- [Ships, Guns, and Gadgets of Everspace — Steam guide](https://steamcommunity.com/sharedfiles/filedetails?id=971289834)
- [The Ancient Rifts Update changelog — Steam](https://steamcommunity.com/games/1128920/announcements/detail/3479622095817450565)
- [Everspace 2 receives final early access update with Ancient Rifts — Gaming Trend](https://gamingtrend.com/news/everspace-2-receives-final-early-access-update-with-ancient-rifts/)
- [Everspace 2 Review: Leaving Roguelike Behind — ScreenRant](https://screenrant.com/everspace-2-pc-review/)
- [EVERSPACE 2 user reviews — Metacritic](https://www.metacritic.com/game/everspace-2/user-reviews/)
- [Everspace — Wikipedia](https://en.wikipedia.org/wiki/Everspace)

**Homeworld**
- [Homeworld — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Homeworld)
- [Research (Homeworld) — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Research_(Homeworld))
- [Salvage Corvette — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Salvage_Corvette)
- [Moments in Gaming: the Salvage Corvette — A Force For Good](https://forceforgood.co.uk/moments-in-gaming-the-salvage-corvette/)
- [Homeworld 3 review — TheSixthAxis](https://www.thesixthaxis.com/2024/05/10/homeworld-3-review/)
- [Homeworld 3 review — GrogHeads](https://grogheads.com/review/21339)
- [Homeworld 3 review — Gamerant](https://gamerant.com/homeworld-3-review/)
- [War Games Artifacts Explained — TheGamer](https://www.thegamer.com/homeworld-3-war-games-artifacts-explained/)
- [Homeworld 3's roguelike-inspired War Games mode — PC Gamer](https://www.pcgamer.com/homeworld-3s-roguelike-inspired-war-games-mode-is-perfect-for-strategists-in-a-hurry/)
- [Homeworld 3 War Games preview — Shacknews](https://www.shacknews.com/article/136796/homeworld-3-war-games-mode-preview)

**FTL**
- [Systems — FTL Wiki](https://ftl.fandom.com/wiki/Systems)
- [FTL Analysis: Subsystems — Vigaroe](https://www.vigaroe.com/2022/08/ftl-analysis-subsystems.html)
- [Practical FTL — Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=266502670)

**Highfleet**
- [Sensors — HighFleet Wiki](https://highfleet.fandom.com/wiki/Sensors)
- [HighFleet basic guide (radar, aircraft, ship systems)](https://gameplay.tips/guides/11966-highfleet.html)
- [HighFleet review — GosuNoob](https://www.gosunoob.com/reviews/highfleet-review-brilliant-but-frustrating/)
- [HighFleet review — Cultured Vultures](https://culturedvultures.com/highfleet-review/)
- [Running out of money due to fuel — Steam](https://steamcommunity.com/app/1434950/discussions/0/2950411088479374116/)

**Nebulous: Fleet Command**
- [NEBULOUS: EWar IN SPACEEEEE! — SpaceBattles](https://forums.spacebattles.com/threads/nebulous-fleet-command-ewar-in-spaceeeee.919887/)
- [NEBULOUS: Fleet Command top-rated Steam reviews](https://steamcommunity.com/app/887570/reviews/?browsefilter=toprated)

**Battlefleet Gothic: Armada 2**
- [BFG: Armada 2 review — PC Gamer](https://www.pcgamer.com/battlefleet-gothic-armada-2-review/)
- [BFG: Armada 2 review — PixelJudge](https://pixeljudge.com/reviews/battlefleet-gothic-armada-2/)
- [BFG: Armada II review — Third Coast Review](https://thirdcoastreview.com/2019/01/24/game-review-battlefield-gothic-armada-ii)
- [Campaign AI: feedback and suggestions — Steam](https://steamcommunity.com/app/573100/discussions/0/1780514838721784230/)
- [Improve the awful ship pathfinding and bad AI — Steam](https://steamcommunity.com/app/573100/discussions/0/1742231705667021824/?l=english)

**Star Citizen / X4 / Avorion / Cosmoteer / Falling Frontier**
- [Ship components — Star Citizen Wiki](https://starcitizen.tools/Ship_components)
- [Star Citizen Ship Equipment Guide (2026) — StarCitizenHelp](https://starcitizenhelp.com/game-guides/ship-equipment)
- [Star Citizen Stealth Guide — Doctrine](https://doctrine.substack.com/p/star-citizen-stealth-guide-tutorial)
- [Turret Control Subsystems — Avorion Wiki](https://avorion.fandom.com/wiki/Turret_Control_Subsystems)
- [Subsystems — Avorion Wiki](https://avorion.fandom.com/wiki/Subsystems)
- [Crew — Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Crew)
- [Cosmoteer — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Cosmoteer)
- [Falling Frontier is one of the most ambitious space RTS games in development — GameDaily](https://gamedaily.com/news/falling-frontier-is-one-of-the-most-ambitious-space-rts-games-in-development)
- [Falling Frontier's new trailer — PC Gamer](https://www.pcgamer.com/games/rts/falling-frontiers-new-trailer-makes-me-want-to-hibernate-until-the-rts-appears-in-2025/)

**Recent Steam space roguelikes / RTS hybrids**
- [Slipstream: Rogue Space — Steam](https://store.steampowered.com/app/2765860/Slipstream_Rogue_Space/)
- [Rogue Command — Steam](https://store.steampowered.com/app/1461910/Rogue_Command/)
- [Space Rogue — Steam](https://store.steampowered.com/app/364300/Space_Rogue/)

**Internal (read, not modified)**
- `ARCHITECTURE.md`, `docs/design/controls.md`, `docs/design/ship-language.md`,
  `docs/design/integration-decisions.md`, `docs/review/acceptance.md`, `docs/reports/README.md`
- `src/sim/{ship,combat,power,salvage,refit,strikecraft,physics}.js`,
  `src/sim/ai/{shipAI,fleetAI}.js`, `src/world/{travel,factionWar,discovery}.js`,
  `src/core/{contracts,events,units}.js`
