# Gratuitous Space Battles (GSB, 2009) — design teardown

**How to read this.** Each fact carries a source tag, and the tags resolve to URLs in the Sources list at the end. Blog posts are cited as "blog YYYY-MM-DD" and all live at https://www.positech.co.uk/cliffsblog/YYYY/MM/DD/<slug>/ (full URLs are listed at the end). Anything I could not confirm is marked **UNVERIFIED**.

**Most important sources.** Four sources carry most of the weight:
- The official manual [MAN].
- Cliff Harris's own forum posts, which include pseudocode for targeting and the hit formula [F-AI], [F-HIT].
- The Fandom wiki's module and hull stat pages [WIKI]. I pulled these through the Fandom API because the HTML pages return 402. The wiki's numbers come from a mid-2010 build: its EMP Shield ECM of 66 is the value patch 1.48 later raised to 82 (blog 2010-11-07).
- Cliff's 2024–2025 posts where he critiques GSB's design (blog 2025-05-03, 2025-05-10, 2025-08-15).

---

## 0. Quick facts
- **Release and pricing:**
  - Developer and publisher: Positech Games, i.e. Cliff Harris. Released on Steam on Nov 16, 2009 [STEAM]; Wikipedia gives Nov 17, 2009 [WP].
  - Cliff "officially declared" the direct-sale release on Nov 4, 2009 (blog 2009-11-04). A paid pre-order beta ran before that, from about Aug 31, 2009 (blog 2009-08-26, blog 2009-09-05).
  - Steam price is $14.99. The Steam page now bills it as "The first ever auto-battler game" [STEAM].
- **Engine and art:**
  - A custom 2D DirectX 9 engine [WP]. Design, code and original idea by Cliff Harris; ship art by Charles Oines; UI art by Chris Hildenbrand; music by Jesse Hopkins; nebula backdrops by Joshua Combs [MAN].
  - Minimum screen height is 768px [SUP].
- **Steam feature list:** 4 unlockable player races, over 40 hulls, over 120 modules, skirmish vs AI plus a never-ending survival mode, and per-battle "spatial anomalies" [STEAM].
- **Platforms:** Windows, Mac, Linux [WP]. The Linux version shipped in Humble Indie Bundle 4 in Dec 2011 [WIKI Main Page]. An iOS version is listed on Metacritic with a 2012-04-13 date [MC].

---

## 1. Core loop

### Official 3-step loop [HOME]
1. Design ships from hulls plus modules. "You are given some basic ships as examples."
2. Select a fleet of fighters, frigates and cruisers, position them in formations, and give each ship orders: "which targets it should attack, and at what range, with special orders such as escort, protect or concentrate fire".
3. Watch the battle "with you able only to watch, not to control". You can pause, slow down or speed up, and view the effectiveness of each shot during and after the battle.

The manual frames the same thing as four tasks: design, fleet assembly under budget and pilot limits, observation, and post-mortem [MAN p1].

### Before the battle
- **Choosing a mission [MAN p4]:**
  - Only the first battle is open at the start. Each later mission unlocks when you beat the previous one. The scenario file has an `unlocked_after` field for this [WIKI Modding].
  - Each mission sets a budget (credits), a pilot limit, an enemy race, a map size, spatial anomalies and a backdrop [WIKI Modding].
  - Difficulty is Normal, Hard or Expert, and there is no "easy" [MAN p4; blog 2009-04-20]. Higher difficulty only means a bigger pre-designed enemy fleet; the enemy AI is the same as yours (blog 2009-04-20).
- **Scenario file fields [WIKI Modding].** These are real data-file keys:
  - `mapsizex`/`mapsizey` (e.g. 2048), `player_deployment` and `ai_deployment` rectangles, `fleetcostlimit` (example 25000), `pilotlimit` (example 60), `enemyrace`, `shader` (a full-screen effect such as "yellowboost.fx"), `description` (e.g. "Shields at 50% effectiveness"), `size` ("small").
  - A `[variables]` section holds anomalies such as `SHIELD_STRENGTH_MULTIPLIER,0.5`, `WEAPON_RANGE_MULTIPLIER,0.75` and `ENGINE_SPEED_MULTIPLIER,0.85`.
  - A mod repo's scenario file also shows `type = SKIRMISH`, an `ENGINES_REQUIRED` flag, and supply limits written as `_sl_<module>,N` [MODREPO]. These values may be modded.
- **Enemy intel:**
  - The deployment map shows your fleet as green silhouettes and the enemy fleet as red [MAN p5]. Cliff: "you can tell 100% absolutely what the enemy brings to the battle" (blog 2009-11-29).
  - The FAQ calls this a "rough intel report" [FAQ]. Enemy module loadouts are not visible in battle (blog 2009-04-29).
- **Deployment screen [MAN p5–7]:**
  - The designs strip sits on the left; drag a design into the highlighted deployment zone to add a ship.
  - Dragging a ship outside the zone deletes it. Right-click gives delete or rename. "Mass deploy" places one ship per click.
  - Selection: box-select, double-click selects every ship of that design, ctrl-click adds ships.
  - Selecting a ship shows its weapon range circles. You can save many deployments per mission.
  - The zone is a free rectangle, not a hard grid. Cliff: GSB "had a 'deployment zone' but let you do pretty much what you liked inside", and players stacked capital ships into "little dense islands" (blog 2025-05-10). Eurogamer describes "a tidy grid" [EG], which appears to be a visual grid only.
  - The first version auto-deployed a loaded fleet so you could then fine-tune it, "the same sort of system used by the Total War games" (blog 2009-06-12).
- **Fleet limits [MAN p5]:**
  - Three limits apply: pilots (each ship needs one pilot, whether fighter, frigate or cruiser), budget, and the honour you forgo (see §6).
  - Fighters deploy in squadrons of 1–16, default 16. Cost and pilots scale with squadron size (blog 2009-11-12; [MAN p6]).
  - A per-module "supply limit" (e.g. only 11 frigate engines allowed) arrived in v1.27 (blog 2009-11-29, blog 2009-12-07).
- **Orders** are assigned per ship on the deployment screen (see §4). Then you press "FIGHT" [FAQ].

### During the battle: what the player controls
- **No unit control.** "You do not have control of individual ships during battle" [FAQ]. Eurogamer: "you can't issue so much as an attack command" [EG].
  - In July 2009 Cliff added experimental RTS-style direct control (blog 2009-07-10). By October 2009 he listed "No direct ship control" as a permanent limitation of GSB 1 (blog 2009-10-05).
- **Camera:** arrow keys, left-drag, minimap click or drag, mouse wheel or PgUp/PgDn zoom, and edge scrolling [MAN p8].
- **Time:** slow down, speed up, and freeze with P; numpad +/- also changes speed [MAN p8]. Playback goes up to 4× [WP citing DIYGamer; blog 2010-02-09].
- **Inspection and UI:**
  - The ship inspector shows shield strength, shield stability, armour and every module's integrity. Damaged modules show red; modules being repaired show green. Weapons show a white "has target" dot and a reload bar.
  - Clicking a turret toggles its minimum range circle (red) and maximum range circle (white) [MAN p8–9].
  - Comms chatter window [MAN p8]; grid toggle; screenshot button; U hides the GUI; O toggles a friend/foe overlay [MAN p9; blog 2009-09-29].
  - "Admit defeat" button [MAN p8].
  - Fleet overlay column showing per-ship damage (v1.32, blog 2010-02-12).
  - Floating MMO-style damage numbers were added around v1.41 and can be toggled (blog 2010-06-07).
  - Per-turret shots/hits/damage readout (blog 2010-06-10).
- **Galactic Conquest only:** a fleet-wide mid-battle "retreat" button [STEAM-GC].

### How a battle is won or lost
- **Score:** the top corners show the percentage of each fleet still operational, measured in hitpoints [MAN p7–8].
- **10% rule:** "a fleet that drops below 10% on the score indicator automatically forfeits". In a stalemate, "the fleet with the lowest level of losses is declared the victor" [MAN p8].
- **Extra rules** (blog 2009-08-18). Damage does not count toward the ratio; only active or destroyed ships do. On top of that:
  - If 3 minutes pass without any ship being destroyed and one fleet is below 50% of the other (in percentage terms), it loses.
  - If one fleet is reduced to only fighters, the other is not, and the other outnumbers it 2:1 in HP, the fighter-only fleet loses.

### After the battle
- **Post-mortem statistics browser:** "how incoming shots fared against your ship, and how its outgoing shots fared" [MAN p9].
  - v1.37 replaced it with a time-series graph of every shot in 10 categories: missed, reflected by shields, shield damage, armour damage and hull damage, each for dealt and received.
  - The graph has per-ship toggles for both fleets, plus pie charts and per-module filtering (blog 2010-03-23, blog 2010-03-26, blog 2010-03-29, blog 2010-04-15). Old and new stats can be toggled from v1.46.
  - A 4-stat summary popup based on hull damage followed later (blog 2010-11-15).
- **Honour** is awarded on a win and spent in Fleet HQ (§6). Then you go back to the designer or deployment screen and retry; stats has a direct "return to deployment" button (blog 2009-09-05). Eurogamer: "This trial and error is the core of the game" [EG].

---

## 2. Ship design

### Hull classes [MAN p2]
Three sizes: fighter, frigate and cruiser. Modules are class-specific, so a fighter module cannot go on a frigate.

Two edge cases:
- The Rebel "Atlantis Bomber" is a fighter-class hull [WIKI Rebel].
- The Imperial "Weapons Platform" (8 hardpoints, 4 standard slots) is treated as a frigate for modules [WIKI Imperial Weapons Platform Hull].

Cliff later called "a fixed number of ship sizes" a mistake (blog 2010-11-30).

### Hull stats
Each hull has cost, size in metres, base power produced, hardpoint count, standard slot count, and percentage bonuses [WIKI hull pages]. There are five bonus types: Shields, Armour, Integrity, Speed and Power (blog 2009-04-29):
- A power bonus scales power-plant output.
- An integrity bonus raises the HP of every module on the ship.
- Racial bonuses apply on top.

Base-race hulls. Format is cost / size / power / hardpoints+standard slots / bonus [WIKI]:
- **Federation** (all hulls +10% hull integrity):
  - Fighters: Hawk 30/10/2/1+2; Leopard 35/12/3/2+2 (speed +12%); Falcon 44/11/3/1+3 (power +12%).
  - Frigates: Gazelle 105/80/8/3+7; Wolf 115/100/9/3+7; Puma 120/80/10/4+7; Fox 135/90/9/4+7.
  - Cruisers: Panther 130/160/8/8+7; Tiger 150/210/8/6+10; Eagle 160/220/9/7+11; Buffalo 180/240/10/7+11.
  - Extras: "Rabbit" cruiser 160/220/9/6+8, and a free "FedElite" variant (blog 2010-06-11).
- **Alliance** (armour bonus):
  - Fighters: Tarantula 34/9/2.2/1+2; Hornet 37/11/2.3/1+2; Scorpion 50/12/3/1+3.
  - Frigates: Wasp 105/100/10/5+6; Swordfish 130/100/10/4+7; Cobra 155/130/13/5+8.
  - Cruisers: Alligator 120/170/8/5+9; Stingray 140/210/10/5+12; Shark 150/210/11/5+11; Python 170/230/12/9+9.
- **Empire:**
  - Fighters: Phalanx 28/8/2.0/1+2; Ballista 32/9/2.1/1+2; Javelin 39/10/2.6/1+2.
  - Frigates: Gladius 140/120/12/4+8; Cohort 176/145/15/4+9; Hasta 201/180/19/4+11; Weapons Platform 152/125/14/8+4.
  - Cruisers: Imperator 160/215/9.3/7+9; Legion 172/200/10/6+11; Centurion 190/235/11/6+12; Praetorian 230/250/14/5+15.
- **Rebels:**
  - Fighters: Phoenix 34/11/4/2+2; Icarus 38/12/4/2+2; Achilles 38/11/4.8/2+2; Atlantis bomber 55/14/4/2+3.
  - Frigates: Loki 90/70/7/4+4; Asgard 100/80/8/6+4; Odin 115/90/9/4+7; Midgard 135/110/10/5+7 (added in v1.29, blog 2010-01-07).
  - Cruisers: Fenrir 99/140/6/6+8; Valkyrie 110/175/7/7+8; Minotaur 120/165/7/6+9; Valhalla 140/200/8/7+10.
- **Tribe (DLC):** 4 fighters, 3 frigates, 4 cruisers. Examples: Utopia cruiser 130/160/8/8+7; Freedom 180/240/10/7+11; Heaven fighter 44/13/1/1+5 [WIKI Tribe].

Typical ranges: frigates have 3–5 hardpoints and 4–7 standard slots; cruisers have about 7–11 of each [WIKI Frigate, Cruiser].

Some bonuses disagree between wiki pages. Individual hull pages give Fox "Speed +17%" and Empire frigates "Speed", while the race tables say "Shield". Tribe hull pages say "Speed −50%" while the race page says "Shield −50%". Treat hull bonuses as **partly UNVERIFIED**.

### Slots [MAN p2]
- Square "standard" slots and hexagonal "hardpoint" slots.
- Standard modules fit either slot type. Hardpoint modules (all weapons except the EMP Cannon [WIKI Module]) fit only hardpoints.
- A slot linked to several turret graphics only multiplies the visual. "It does not make them more powerful" [MAN p2; blog 2009-03-24].
- Layout does not change the ship's appearance except for drawn and animated turrets [FAQ].
- The two-tier slot system was added in June 2009 (blog 2009-06-07).

### Resource budgets [MAN p3–4]
- **Cost:** hull cost plus module costs, drawn from the fleet budget.
- **Power:** generators must cover consumption.
- **Crew:** crew modules must cover requirements. You cannot save a design that violates crew or power; the Save button is disabled.
- **Speed:** "combined thrust of its engines, against its total weight"; turning speed is tied to speed.
  - The exact speed formula is **UNVERIFIED**.
  - Observed speeds: cruiser tanks around 0.03–0.07; fast cruisers above 0.30 [WIKI Torrenal; F-123]; fighters above 3 (forum post quoting a 3.24 fighter [F-HIT]).
- **Stacking penalties:** some modules lose efficiency when stacked; hovering a module shows its current efficiency [MAN p2].
  - Shields use `stack_effectiveness` 0.9, i.e. 1, 0.9, 0.81, … as a player reports [F-STACK].
  - Target boosters peak at 2 per ship. Player-measured: TB-I gives +10% with one module, +12% with two, +10.8% with three; the boost is multiplicative on tracking [F-TB].
- Empty slots are allowed [MAN p3].

### Module data format
The data-file keys come from a mod repo; the field names match the base game's UI [MODREPO]:
- `category` (WEAPONS/DEFENSES/ENGINES/OTHER), `classname` (e.g. SIM_BeamWeaponModule, SIM_BulletWeaponModule, SIM_MissileModule), `size` (FIGHTER/FRIGATE/CRUISER), `slot_type` (TURRET or standard).
- `cost`, `crew_required`, `powerconsumed`, `weight`, `hitpoints`.
- `damage`, `fire_interval` (ms), `min_range`, `max_range`, `optimum_range`, `tracking_speed`, `shield_penetration`, `armour_penetration`.
- Missiles add `fuel`, `missilespeed`, `turnspeed`, `has_decoys`, `warhead`.
- `unlockcost`, `lockable`.

UI stat labels on the wiki: Cost, Crew Required, Power Required, Weight, Hit Points, Shield Penetration, Armour Penetration, Damage, Fire Interval, Min/Max/Optimum Range, Tracking Speed, Has Decoys, Shield Capacity, Shield Resistance, Recharge Rate, Damage Absorbable, Thrust, Power Produced, Crew Provided, Repair Rate, Repair Supplies, Tracking Speed Boost, Beam Weight, ECM Strength, Shock Duration, Scanner Accuracy, Capacitor, Beam Rate [WIKI].

### Full module list with stats
Source: [WIKI], the 139 module pages at gratuitousspacebattles.fandom.com/wiki/<Module_Name>.
- H = hardpoint, S = standard.
- Abbreviations: c = cost, crew, pwr = power use, wt = weight, hp = hitpoints, SP/AP = shield/armour penetration, dmg = damage, int = fire interval (ms), min/max/opt = range, trk = tracking.

**Fighter weapons (all H):**
- Laser Cannon: c16, pwr4, wt2.5, SP8, AP8, dmg4, int300, 20–300 (opt240), trk2.8.
- Pulse Laser: c22, pwr4.8, SP3.8, AP3.8, dmg6, int300, 15–270, trk2.9.
- Rocket Launcher: c16, pwr0.2, wt2, SP12, AP12, dmg9, int2100, 280–450, trk2.0.
- Torpedo: c42, pwr0, wt15, SP50, AP50, dmg15, int5200, 258–400, trk1.2.
- Target Painter: c55, int5000, max400, trk1.1.
- Fusion Gun (Swarm only): c26, SP4.2, AP5, dmg8.5, int600, 20–290, trk2.0.

**Fighter defences, engines, power (all S):**
- Armour (damage absorbable / weight): Armour I 11.25/0.625, II 13.75/0.86, III 16.25/1.25; Ablative 8.75/0.45; Advanced Ablative 7.5/0.31.
- Engines (thrust / power / weight): I 14/1/2.0, II 17/2/2.5, III 20/3.9/3.0.
- Power output: Generator I 3, II 4, III 5.
- Micro Target Booster (Swarm only): +0.10.

**Frigate weapons (all H):**
- Beam Laser: c35, crew10, pwr9, SP18, AP49, dmg26, int1900, 290–700 (opt650), trk1.5.
- SmallBeam Laser: c31, SP10, AP39, dmg21, int1600, 185–740, trk1.1.
- Pulse Laser: c31, SP5, AP20, dmg10, int500, 125–380, trk2.8.
- Rapid Fire Laser: c40, SP32, AP9, dmg5, int280, 65–400, trk1.5.
- Ion Cannon: c67, SP38, AP12, dmg7.5, int290, 180–550, trk2.0.
- Phasor Cannon II: c55, SP24, AP18, dmg8, int525, 120–500, trk1.9.
- Plasma Launcher: c47, crew12, SP32, AP20, dmg15, int3300, 345–950, trk1.0.
- Torpedo: c46, SP40, AP14, dmg22, int3510, 280–1000, trk1.0.
- Missile Launcher: c53, SP22, AP22, dmg12, int3900, 375–1200, trk1.5, decoys.
- Fast Missile: c62, SP22, AP22, dmg11, int3510, 300–1100, trk1.9, decoys.
- Anti-Fighter Missile: c61, SP0, AP6, dmg19, int1100, 50–550, trk12.5.
- Disruptor Bomb: c82, dmg75 (shield stability), int1800, 300–650, trk1.3.
- EMP Missile I: c59, ECM18, shock 2000ms, int3900, 225–800.
- EMP Missile II: c69, ECM20, shock 2400ms.
- Rapid-Fire Cannon (Tribe only): c45, SP25, AP18, dmg3, int80, 120–600, trk1.9.

**Frigate defences:**
- Shields (capacity / resistance / recharge):
  - Super-Light: c30, 18/7/6.
  - Light Shields: c44, 27/7/6.
  - Shield Generator: c58, 50/9/6.
  - Shield Gen II: c73, 70/10/7.
  - Turbo Shields: c84, 77/7/6.
- Armour (absorbable / weight):
  - Armour I: c45, 31/24.
  - Armour II: c63, 44/34.
  - Armour III: c96, 62/40.
  - Powered Armor: c112, 71, pwr2.5.
  - Lightweight Powered: c142, 70/38.
  - Patch 1.48 later raised all frigate armour absorbable by 20% (blog 2010-11-07).
- Point defence (H):
  - Frigate PD: c50, int1200, range 320, trk3.0.
  - Automated PD: c70, int1100, range 300, trk3.5.
  - iPoint Defense MkII: c70, int900, range 370, trk3.3.
- Shield Support Beam I (H, Empire only): c116, pwr19, range 500, capacitor 110, beam rate 20.

**Frigate engines, crew, power, other:**
- Engines (thrust / cost): I 40/50, II 56/72, III 70/102.
- Crew: Micro-Crew 22 crew/c18; Crew I 54/c30; Crew II 78/c40; Swarm Crew Nest 89 (Swarm only).
- Power: Generator I 13/c71, II 18/c104, III 22/c125.
- Frigate Tractor Beam (H): c50, crew12, pwr9, beam weight 12.
- Tribal Frigate Repair (Tribe only): rate 0.14, supplies 450.

**Cruiser weapons (all H except EMP Cannon):**
- Cruiser Laser: c113, crew4, pwr11, wt135, SP55, AP15, dmg20, int430, 90–490 (opt400), trk0.9.
- Beam Laser: c115, pwr15, SP20, AP70, dmg57, int2700, 260–770 (opt616), trk1.02.
- Proton Beam: c73, SP24, AP73, dmg50, int3200, 180–700, trk0.64.
- Pulse Laser: c123, SP11, AP31, dmg10, int500, 220–600, trk2.6.
- Defence Laser: c96, SP6, AP8, dmg9, int550, 30–300, trk3.7.
- Quantum Blaster: c75, SP48, AP18, dmg8, int600, 110–450, trk1.5.
- Plasma Launcher: c115, crew18, SP44, AP52, dmg30, int3000, 330–950, trk0.6.
- Light Plasma: c100, SP44, AP44, dmg17, int1800, 320–705, trk1.0.
- Heavy Plasma: c110, SP55, AP55, dmg36, int3600, 340–900, trk0.4.
- Missile Launcher: c139, SP52, AP44, dmg30, int1950, 340–1200, trk0.6, decoys.
- Fast Missile: c154, SP48, AP42, dmg30, int2145, 270–900, trk0.9.
- Multiple Warhead Missiles: c136, SP50, AP41, dmg11, int1950, 500–1160, trk0.6.
- Megaton Missile: c159, SP51, AP51, dmg60, int2600, 300–750, trk0.5.
- Rocket Launcher: c94, SP43, AP36, dmg19, int950, 224–810, trk0.9.
- Decoy Missile Launcher: c66, dmg0.
- Target Painter: c132, int10000, max720.
- EMP Cannon (S): c160, crew16, pwr16, ECM32, shock 3200ms, int6000, max700, trk0.5.
- Race-exclusive cruiser weapons:
  - Federation Fusion Beam: SP24, AP60, dmg52, 275–705, trk1.5.
  - Rebel Fusion Beam: SP22, AP72, dmg60, 310–800, trk0.85.
  - Imperial Laser Beam: SP20, AP66, dmg45, 280–860, trk1.275.
  - Alliance Beam Laser: SP22, AP69, dmg53, 280–643.
  - Alliance Lightning Beam: SP56, AP45, dmg33, 220–360.
  - Fusion Torpedo Launcher (Alliance per [WIKI Race]): SP47, AP44, dmg22, 256–560.
  - Tribe Autocannon: SP12, AP13, dmg3, int110, 30–320, trk3.7.
  - Tribe Howitzer: SP40, AP16, dmg6, int60, 110–450.
  - Order Radiation Gun: SP48, AP36, dmg9, int600, 90–600.
  - Order Limpet Launcher: int2000, 90–600.
  - Order Firefly Rockets: SP48, AP38, dmg12, int950, 300–850.
  - Order Nuclear Missile: SP40, AP42, dmg15, int2860, 330–900.
  - Swarm Disruptor Beam: SP62, AP33, dmg36, int4650, 380–910, trk1.2.

**Cruiser defences:**
- Shields (capacity / resistance / recharge):
  - Light Shield Gen: c110, 100/16/5.
  - Basic Shield Gen: c132, 190/19/5.
  - Shield Gen II: c164, 255/24/7.
  - Reflective: c155, 200/27/7.
  - Multiphasic: c160, 275/9/7.
  - Fast Recharge: c195, 262/24/8.
- Armour (absorbable / weight):
  - Minimal: c89, 45/66.
  - Armour I: c136, 74/92.
  - Armour II: c220, 101/72.
  - Armour III: c243, 121/120.
  - Powered: c207, 117/79, pwr3.
  - Lightweight: c268, 117/90.
  - Ultraheavy: c261, 145/160.
- Point defence (H):
  - Cruiser PD: range 380, trk3.0, int800.
  - Automated PD: range 310, trk3.2.
  - Hi-Speed PD: range 370, trk3.2, int700.
- Guidance Scrambler Beam (H): range 380, trk2.2.
- Point Defense Scanner I/II (S): accuracy 0.66/0.87.
- EMP Shield: ECM 66.
- Camouflage Shield: hp440, crew36, pwr18.
- Smart Bomb Pulse Generator (Swarm only): int2800, range 300.

**Cruiser engines (thrust / cost / power):**
- Engine I 75/132/2; II 102/175/3.5; III 118/200/5.1.
- Lightweight 105/185; High-Efficiency 110/225; Supercharged 130/261/5.3.

**Cruiser other:**
- Crew:
  - Micro 80 crew/c50.
  - Crew I 160/c80.
  - Crew II 268/c120.
  - Crew III 290/c139.
  - Reinforced Crew Bay 250 (hp185).
  - Zero-G Crew 273.
  - Droid Bay 150 (wt49).
- Power:
  - Basic 40/c135/crew28.
  - Generator II 51.
  - Generator III 66/c229.
  - Reinforced Powerplant II 52 (hp155).
- Repair (rate / supplies):
  - Cruiser Autorepair 0.05/450.
  - Armor Repair 0.07/370.
  - Advanced Armor Repair 0.08/410.
  - Nanobot 0.11/490.
  - Tribal Repair 0.15/1040 (Tribe only).
- Carriers: Carrier Support Bay rate 0.05/supplies 500; Reinforced Carrier Bay 0.05/600.
- Tractors (H): Cruiser Tractor trk2.2, beam weight 16; Supercharged Tractor trk2.8, beam weight 40.
- Target Booster I +0.10; Target Booster II +0.16.

**DLC modules not on the wiki.** From the Steam and blog descriptions:
- Nomads: tweaked module variants such as the "Nomadic dogfight laser" and "Nomadic beam laser" (blog 2010-11-07), plus Nomad missiles [F-123].
- Parasites: flak cannon, "plasma slinger", "missile revenge scrambler" [STEAM-PAR].
- Outcasts: cruiser decoy projector, frigate sniper laser, multi-target tractor, two-stage missiles, solar power collector, pulse gun [STEAM-OUT; blog 2012-11-30].

---

## 3. Weapons and damage model

### Damage pipeline [MAN p3]
- A shot first rolls to hit (below). If it hits a shielded ship from outside the shield bubble, it faces the shields.
- **Shields:**
  - If shield penetration is below shield resistance, the shot has "zero effect".
  - Otherwise damage comes off shield strength. Shields regenerate unless a shield is knocked to zero; a zeroed shield "is down and out" for the whole battle [MAN p3, p11].
- **Armour:**
  - The shot needs armour penetration greater than the ship's average armour. Average armour is total armour strength divided by the number of modules, shown in ship stats [MAN p3].
  - A player guide says "number of installed modules plus 1" [WIKI Torrenal]. **Conflict: UNVERIFIED which is right.**
  - Damaged armour does not regenerate, though repair modules can fix it [MAN p3].
- **Hull and modules:**
  - Once shields and armour are gone, hits damage individual modules. A module at 0 HP is disabled. "When all of the modules on a ship are disabled, it will explode" [MAN p3].
  - Damaged modules can be less effective; some weapons reload more slowly [MAN p8].
  - Engine damage slows ships. A 1.13 bug fix made this apply immediately, "then you are just some slowly drifting piece of metal with 'target' written on your ass" (blog 2009-09-29).

### Hit chance — Cliff's own formula [F-HIT]
- If target speed is greater than weapon tracking speed, there is only a 2% "lucky hit" chance.
- Otherwise: hitchance = 1 − (targetSpeed / trackingSpeed).
- Then multiply by a size factor = 0.5 + (shipSize / 256 m) × 0.5.
- Worked examples:
  - Speed 2.5, size 16, tracking 2.9 gives 6.9%.
  - A stationary target of size 200 with tracking 1.0 gives 89%.
- Cloak adds another factor. Target boosters raise tracking and do not act on the final chance [F-HIT].
- "Current speed, not the maximum speed" is used, so a fast ship parked in formation is easy to hit [MAN p11].
- Tractor beams slow fighters "almost to a stop" [MAN p11].
- There is "always a chance (about 2%) of a lucky hit" [MAN p11].
- The shooter's own speed is not part of Cliff's formula [F-HIT].
- Size also matters because bigger ships have bigger shield bubbles, so fighters get under them more easily [F-123].

### Shields in detail
- **Resistance** is the highest resistance of any *working* shield module [MAN; WIKI Torrenal; F-123].
- **Damage spreading:** a hit can land on up to 4 shield modules unevenly. One module can be knocked out while others survive, which permanently cuts maximum shield strength for that battle [MAN p11]. v1.30 added UI showing per-module shield strength (blog 2010-01-07).
- **Player-derived detail:** a random generator is chosen per hit, and if it is a dead generator the shot passes through to the hull [WIKI Torrenal].
- **Stability** is a separate stat. Shield-destabilising weapons (e.g. the Disruptor Bomb) lower it; at zero the shield "will flicker off entirely for a short period" [MAN p3].
- **Close range:** fighters inside the shield bubble bypass shields entirely [MAN p3].
- **Pre-release design note:** Cliff wrote that 3% of hits leak through shields (blog 2009-06-28).

### Armour in detail
- Below the penetration threshold armour takes only critical hits. Players report crits at about 2% or 3% [WIKI Xelek: "2% chance of critical hit"; F-123: "3% of the time"]. **Exact value UNVERIFIED.**
- Crits wear armour down, which lowers average armour until weapons start penetrating. Players call this all-or-nothing and "not-so-gradual erosion" [F-ARM].
- Player-published average-armour breakpoints [WIKI Xelek; F-123]:
  - above 8 stops fighter lasers;
  - above 12 stops fighter rockets;
  - above 15 stops the Cruiser Laser and Ion Cannon;
  - above 52 stops missiles and cruiser plasma;
  - 73 or more stops everything, since no weapon exceeds 73 AP.

### Range
- Each weapon has minimum and maximum range. Weapons "will always fire at targets the minute they enter range" [blog 2010-02-01].
- The per-class order range is a *movement* setting, labelled "Move to attack at this range" (blog 2010-02-01).
- **Optimum range** (pre-release design, blog 2009-05-10): "leave armor and shield penetration the same for the whole range, but damage done varies by 50%. So at range 0 damage is 50%, it scales up to 100% at range 800, then drops down to 50% at 1200 where it then drops to zero." Whether the shipped game uses exactly this curve is **UNVERIFIED**. Missiles and rockets have no optimum range in the wiki data.
- **No firing arcs:** turrets fire in all directions (blog 2009-07-22).

### Weapon families
Rules of thumb from [WIKI Weapons]:
- Lasers: high DPS, high power use, mid range.
- Missiles: long range and good penetration, but vulnerable to point defence and inaccurate.
- Plasma: high damage and long range, but inaccurate against small or fast targets.
- Rocket and missile trails and multi-warhead volleys are distinct visual types.

### Special mechanics
- **Missiles:**
  - A launcher cannot fire again until its missiles in flight resolve [MAN p8].
  - Missiles self-destruct if their target dies (v1.13, blog 2009-09-29).
  - A painted target means missiles always hit [MAN p12].
  - "Decoys" are dummy warheads (`has_decoys`) [WIKI]. The Decoy Missile Launcher fires only decoys.
- **Point defence** tracks missiles by missile speed, with a flat 5% always-hit and 5% always-miss [MAN p12]. It covers missiles aimed at other ships too [WIKI Xelek]; the pre-release version did not (blog 2009-05-29).
- **Guidance Scrambler** sends missiles on random paths. Because they fly until fuel runs out, it also slows the enemy launcher's fire rate [WIKI Torrenal].
- **EMP** stuns the target, which "will be unable to fire back" [WIKI Torrenal]. An EMP Shield gives a chance to neutralise the pulse [MAN p12].
- **Tractor beams** grab fighters and frigates; a tractored or limpeted fighter becomes a priority target (see §4).
- **Order Limpets** stick to fighters and slow them (blog 2010-02-26).
- **Radiation** (Order): poor shield penetration, but if it gets through, a payload keeps damaging random modules over time, even if the firing ship dies. It counters the Tribe's hull-heavy design (blog 2010-01-13).
- **Camouflage Shield (cloak):** hard to hit, but you can't shoot while cloaked [MAN p11; WIKI Torrenal]. Patch 1.61 added a modding flag `fire_while_cloaked` (blog 2012-12-07).
- **Carriers:** only fighters with a Cautious order return to dock, repair, and relaunch [MAN p7; blog 2009-10-26].
- **Repair modules** have limited "repair supplies" and "can't fix something that's been destroyed" [MAN p8; WIKI Torrenal].
- **Shield Support Beam** (Empire frigate, free patch in June 2010): recharges a friendly cruiser's shields when they fall below 80%. It was nerfed: it can't target ECM-jammed ships, only one SSB can work on a target at a time, and it only targets cruisers (blog 2010-06-29, blog 2010-07-22).
- **Swarm Smart Bomb:** anti-missile pulse (blog 2010-05-02).
- **Parasites flak:** area-of-effect damage. Later limited to hits only, not misses (v1.61).
- **Missile revenge scrambler** reverses missiles back at the ship that launched them (blog 2011-08-06).
- **Outcasts decoy projector:** a hologram cruiser that draws fire (blog 2012-11-13).
- **Explosion shock waves** damage nearby ships in proportion to the dead ship's power output. They ignore shields, with armour penetration equal to their force. Fighters are immune and frigates take half [MAN p9].
- **Anti-stalemate rule:** a weapon that fires more than 4 times in 7 s with no effect switches target (blog 2009-07-10).

### Emergent meta (player analyses)
- **Rock-paper-scissors cycles** [F-123]:
  - Rush beats long range, long range beats anti-rush, anti-rush beats rush.
  - Anti-fighter beats mass fighters, mass fighters beat no-fighter fleets, no-fighter fleets beat anti-fighter.
- **Shield choice** [F-123]: "only 1 shield with high resistance is needed", then add strength shields.
- **Hull size:** "the best hull is the smallest hull" because hit chance scales with size [F-123].
- **Concentration:** single-weapon, same-speed, tightly packed fleets concentrate fire best [F-CHAL].

---

## 4. Orders and AI behaviour

### Order list
Compiled from [MAN p6–7], [FAQ], [F-AI] (yurch's summary, which Cliff answered), [WIKI mrocktor], [WIKI yurch], and the blog.

- **Attack Fighters / Attack Frigates / Attack Cruisers.** Each has a priority % and a "Move to attack at this range" distance.
  - Priority weights both gunnery and the choice of driving target.
  - Deleting an Attack-X order means ignore that class "until the enemy has nothing but fighters left" (v1.04, blog 2009-09-05).
  - v1.32 changed this: weapons will still fire at an ignored class if nothing else is in range (blog 2010-02-16).
- **Co-operative.** Gunners prefer targets other gunners are shooting: +0.125 per ship already targeting, up to +0.5 [F-AI].
- **Vulture.** Prefers damaged hulls: bonus = 1 − hull integrity, up to +0.5. It uses hull only, not shields or armour. It also stops the default de-prioritising of disarmed ships [F-AI].
- **Rescuer.** Bonus of up to +0.5 for enemies that fired recently (within 2 s). It flips targets quickly, which makes it good for spreading EMP [F-AI; WIKI yurch].
- **Retaliate.** +0.5 if the enemy is attacking this ship [F-AI].
- **Protector.** Like Rescuer, but for enemies firing on one assigned friendly ship [F-AI; FAQ "protect this ship"].
- **Escort (distance).** Stays within X of a parent ship and otherwise follows its own orders. It won't move to the parent while within attack range of its own target [MAN p6; F-AI].
  - A player claims escort distances above about 400 are ignored [F-CAUT]. **UNVERIFIED.**
- **Formation.** Keeps its initial X/Y offset from a parent ship in world space; the parent's rotation is ignored. It lags in proportion to position error (blog 2009-03-25; [WIKI mrocktor]).
- **Cautious x%.** At x% hull damage the ship retreats to its starting map edge. Fighters instead go to the nearest carrier bay, and return once repaired above the threshold [F-AI; MAN p7].
  - Galactic-Conquest-era patches added automatic retreat for ships that lose all their weapons.
- **Last Stand** (v1.51, Dec 2010) overrides that auto-retreat (blog 2010-12-08; [F-CAUT]).
- **Keep Moving** (v1.04). Meanders within the range band instead of sitting still, so it is harder to hit. It doesn't apply to fighters and is incompatible with Escort and Formation (blog 2009-09-05; [F-AI]).
- **Stick Together** (fighters). The squadron follows an elected leader in formation; the leader is re-elected if it dies, is disabled, is tractored or is limpeted (blog 2010-03-09; [F-AI]).

Supporting mechanics:
- **Order management:** orders apply to all selected ships. Contradictory orders are auto-removed. A design can save "default orders", except Escort, Formation and Protector, which need a parent ship [MAN p7; forum search blurbs].
- **Defaults:** new deployments get default orders. A ship without orders still attacks, "but maybe not in the way you wanted" [MAN p6].

### Driving (movement) AI
Sources: [F-RANGE], [F-AI], [WIKI mrocktor].
- At battle start each ship picks one "driving target". The choice depends on class priority and distance, effectively the nearest ship of the top-priority class.
- It keeps that target until the target dies, a formation leader dies, or Cautious triggers.
- It closes to the set range and backs away if the target is closer than half that range, so it holds a ring-shaped band.
- Players exploit this with slow decoy ships that drag enemy fleets out of position. An "armor block" anchor is a common challenge trick [F-AI].
- Cliff admitted that "ships not re-evaluating the decision to stick with their current target" was more "a bug than a design flaw". The re-check interval was meant to be 2 s but "ends up being 5" [F-AI].
- v1.61 (Dec 2012): "AI now works differently, and less stupidly when assessing which target to move towards" (blog 2012-12-07).

### Gunnery (per-turret) targeting — Cliff's pseudocode [F-AI]
For each intact enemy the turret skips it if it is docked, has left the battlefield, belongs to an ignored class, or is outside min/max range. It then scores the remaining targets:

```
score = 1.0
-0.25 if total HP of ships already attacking it > 10x its strength
-0.5  if >3 ineffectual shots at it
+1.0  if it's a fighter that's tractored or limpeted
+co-op bonus (0.125/ship, max 0.5)
reject if we're a shield disruptor and it has no shields
+vulture (1-hull, max 0.5)
+rescuer (fired within 2s, max 0.5)
+retaliate (+0.5 if attacking us)
+1.0  if we're a missile and it's painted
-0.5  if no vulture order and target poses no threat
score *= class priority
pick highest
```

- If nothing qualifies, the pass re-runs ignoring class. It runs for every turret, periodically [F-AI].
- An earlier Cliff version also listed "adjust for hit chance (speed vs tracking)" [F-RANGE].
- The practical effect: gunners favour big, slow targets. Painters act as a de facto co-op order [WIKI yurch].
- Point defence, scramblers and tractors are not counted as "weapons", so ships carrying only those get low priority [F-AI].

### Designer's own verdict
- "Gratuitous Space Battles had a completely opaque system that nobody understood and was poorly explained" (blog 2025-08-15).
- "GSB players often wondered where the hell half their ships were going and why" (blog 2025-05-10).

---

## 5. Races and factions

### Base game
- **Federation:** blue ships and the starting race [MAN p10]. +10% hull integrity on all hulls [WIKI Federation]. Ferengi-inspired commerce federation (blog 2009-04-20).
- **Rebels:** speed bonuses; judged by players to have the best fighters [WIKI Race; WIKI collimatrix].
- **Alliance:** insectoid; about +10% armour on all hulls (blog 2009-04-29). Exclusive modules: Alliance Beam Laser, Fusion Torpedo Launcher, Lightning Beam [WIKI Race].
- **Empire:** shield bonus and large shield bubbles. Exclusive modules: Imperial Laser Beam, Shield Support Beam [WIKI Race; WIKI collimatrix].
- **Unlocking:** Empire, Alliance and Rebels are locked at the start and bought with honour in Fleet HQ [WIKI Fleet HQ; MAN p9–10].
  - Unlocking a race gives most of its hulls, but "bonus" hulls still need separate unlocks [MAN p9].
  - The pre-release plan unlocked races by beating every mission on Normal, then Hard, then Expert (blog 2009-04-20). Cliff reconsidered it in blog 2009-10-18; the manual's honour system is what shipped.

### DLC races
DLC races are available immediately when owned [WIKI Fleet HQ].
- **Tribe:** −50% armour, −50% shields, +100% hull integrity; kinetic weapons; the strongest repair modules [WIKI Race; blog 2009-11-21].
- **Order:** religious zealots; "big on power, low on speed"; radiation guns, nuclear missiles, limpets, Firefly rockets (blog 2010-02-26).
- **Swarm:** birdlike; about −20% cost, +15% speed, −5% hull, armour and shields; flimsy but numerous; Egyptian ship names (blog 2010-05-02; [WIKI Race]).
- **Nomads:** retro, multicoloured ships built from salvage; no new technology, only tweaked modules (blog 2010-09-04, blog 2010-09-13).
- **Parasites:** translucent multicolour hulls; integrity and armour bonuses, weak shields [STEAM-PAR].
- **Outcasts:** cybernetic, saucer-shaped ships; speed bonuses and stronger frigates (blog 2012-11-30).

---

## 6. Progression, meta and DLC

### Honour
- Every unspent credit becomes honour if you win. Only your best honour per battle counts, so replaying the same win earns nothing extra [MAN p5]. Wikipedia says this is tracked per difficulty level [WP].
- The wiki adds that honour is "modified by how severe losses were". Tutorial and survival give no honour [WIKI Honor]. **The loss modifier is UNVERIFIED.**
- Honour is spent in Fleet HQ on modules, hulls and races [MAN p9].
- Known price: Imperial Legion cruiser costs 7,200 honour [WIKI Legion page, via search result]. **Other prices UNVERIFIED.** Module files carry an `unlockcost` field [MODREPO].
- In v1.41 many more modules were locked at the start because "people found the choice overwhelming" (blog 2010-06-09).

### Modes
- **Skirmish** missions against a fixed AI fleet [MAN p4].
- **Survival** (added in v1.11): endless waves "from various different angles". Waves trigger when the previous wave is nearly destroyed or after a period with no kills. Score is the HP value destroyed, posted to a global high-score table. Its purpose was to force all-rounder fleets [F-SURV; MAN p4].
- **Tutorial** exists [WIKI Tutorial].
- **Base-game scenario count: UNVERIFIED.** Pre-release there were 10 missions (blog 2009-04-20). The wiki's walkthrough list has 20 names including DLC maps: Defending Sirius (budget 20,000), The Lagoon Nebula (25,000), Battle of Mexallon II, Emerald Nebula, Chiarn Prime, Chaos Nebula, Multari Gas Giant, Defend Caspian IV, Gravity Well, and others [WIKI Mission Walkthroughs, Defending Sirius, Lagoon Nebula]. "Gateway to Oblivion" is Swarm DLC map swarm_sk1 [MODREPO].
- **Spatial anomalies:**
  - Shield, range and speed multipliers [WIKI Modding].
  - "Must have engines" (blog 2009-12-19).
  - Supply limits, e.g. Gravity Well (blog 2009-12-07).
  - An anomaly-list button was added in v1.13 (blog 2009-09-29).

### Online challenges ("play-by-email without the email")
- **Flow:** beat a scenario, upload your fleet, deployment and orders as a challenge addressed to a username or to "all", with a taunt [MAN p9; blog 2009-05-27].
  - The server counts attempts and victories. Challenges can be rated out of 5 for difficulty and enjoyment (v1.08).
  - Early "auto" challenges were removed (blog 2009-08-26, blog 2009-09-14).
- **Later additions:**
  - v1.28: custom challenges with a scenario editor (existing backdrops; pilot limit, budget, supply limits, anomalies) and an online inbox that auto-messages on plays and beats (blog 2009-12-19).
  - Challenge IDs, uploaded deployment screenshots, and "retaliation" replies threaded under a challenge (blog 2010-03-07).
  - Challenges are tagged with required expansions or mods (blog 2009-11-25).
- **Structural issue:** the responder always places second and can see the fixed enemy deployment, so "whoever is responding… always has a huge tactical advantage" [WIKI mrocktor].
- **No replays:** battles are not deterministic. The simulation isn't frame-rate independent, so replays and competitive leagues aren't possible (blog 2009-10-05). Cliff later listed this as a mistake (blog 2010-11-30).
- **Server status now:** Steam reviews from 2019–2026 report that the servers, key validation, challenges and campaign fleet downloads no longer work, and that the campaign keeps serving the same preset fleet [REV]. **No official statement found (UNVERIFIED).**

### Galactic Conquest (campaign DLC)
Pre-order beta Nov 8, 2010 (blog 2010-11-08); Steam release Feb 11, 2011; $19.99 [STEAM-GC].

Steam feature list [STEAM-GC]:
- Mid-battle fleet-wide retreat; post-battle repairs at repair yards; scrapping ships to reclaim crew and part of the cost; shipyards in 3 sizes.
- Factories produce cash; academies produce crew.
- Capture of enemy ships after victory; per-world loyalty and threat levels.
- Movement only along hyperspace wormholes; 3 difficulty levels; new manual and music.
- "Massively singleplayer" enemies designed by other players; anomalies that limit ship choices.

Details from Cliff's blog:
- Enemy fleets come from rated, recent, mod-free player challenges (blog 2010-04-09, blog 2010-06-28).
- Scrapping returns 25% (blog 2010-05-21).
- Only the best shipyards build cruisers (blog 2010-04-15).
- The AI uses a "reactive arms race", and behind-the-lines sneak attacks were cut (blog 2010-07-20, blog 2010-08-09).
- It requires an internet connection (blog 2010-11-08).
- Fighter spam was a known problem because campaign battles have no pilot limits (blog 2010-11-16).
- v1.56 added 4 hand-designed maps by Carsten Lensch and made the game much easier (blog 2011-03-08).

From a user review: a 52-planet map; resources are money, crew and pilots; movement is one wormhole per turn; the enemy is effectively all other races allied against you [F-GC].

Critical reception: Metacritic 50, from a single PC Gamer review: "The promise of giving content to the battles never really comes together" [MC-GC].

### DLC list
Steam dates first; direct-sale dates from the blog are earlier. All race packs cost $5.99 [STEAM DLC pages; DLC].

| DLC | Steam date | Contents |
|---|---|---|
| The Tribe | Dec 16, 2009 (direct Dec 2, 2009) | 11 ships, kinetic weapons, new bonuses, 2 scenarios |
| The Order | Mar 16, 2010 (direct Feb 26, 2010) | 10 ships, radiation guns, nuclear missiles, limpets, faster rockets, 2 scenarios (one a survival map) |
| The Swarm | May 19, 2010 (direct May 2, 2010) | 10 ships, fusion guns, disruptor beams, smart bombs, 2 scenarios |
| The Nomads | Nov 11, 2010 (direct Sep 13, 2010) | Ships only, no new missions; sold as a pay-$5.99-or-$2.99 honour-system experiment (blog 2010-09-13) |
| Galactic Conquest | Feb 11, 2011 | Campaign (above) |
| The Parasites | Oct 17, 2011 | 4 cruisers, 3 frigates, 3 fighters; flak cannon, plasma slinger, missile revenge scrambler; 1 scenario |
| The Outcasts | Jan 11, 2013 | 4 cruisers, 3 frigates, 3 fighters; 6 new modules; 2 scenarios; own music by Sean Vella (blog 2012-11-30) |

A 2015 "Ultimate Edition" bundles everything plus GSB2 [NEWS].

### Key free patches
- 1.04: Keep Moving.
- 1.08: challenge ratings.
- 1.11: survival mode.
- 1.13: anomalies.
- 1.24: squad sizes.
- 1.27: supply limits.
- 1.28: custom challenges and messaging.
- 1.29: Midgard hull.
- 1.32: module comparison window and fleet overlay.
- 1.37: new stats.
- 1.41: usability pass and damage numbers.
- 1.48: memory usage and balance.
- 1.51: Last Stand.
- 1.57: flak, plasma multi-shot, return-to-sender.
- 1.61: AI movement, decoy projector, 2-stage missiles.

Sources for the list: blog posts of the matching dates.

---

## 7. Presentation
- **Style:** 2D top-down with a free camera and zoom. Cliff avoided 3D deliberately (blog 2025-05-10).
- **Visual inspiration:** the Star Trek DS9 and Revenge of the Sith battles and WW2 naval broadsides (blog 2009-01-19, blog 2009-11-15).
- **"Gratuitous" effects** (all from dev blog posts):
  - Layered damage-texture decals with spark and smoke emitters (blog 2009-01-18, blog 2009-06-25).
  - Spinning debris (blog 2009-03-15). Drifting hulks that break into 2–3 pieces (blog 2009-04-11); fighter hulks that keep momentum (blog 2009-07-12).
  - Shield impact with an angled "blast front"; lasers visibly bouncing off shields (blog 2009-02-17, blog 2009-05-14). Per-race shield colours (blog 2009-04-08).
  - Armour-hit glow (blog 2009-03-06).
  - Camera-motion blur and explosion camera shake (blog 2009-06-19).
  - A warp-in intro with the camera panning across your fleet (blog 2009-07-22).
  - Repair drones that visibly weld damage (blog 2009-09-27).
  - Improved smoke clouds (blog 2010-06-23); rocket trails that hold up at 4× speed (blog 2010-02-09).
  - Asteroid belts (blog 2010-01-08, Order DLC). Green radiation decals (blog 2010-01-13). Converging lasers (Swarm DLC).
  - Per-scenario full-screen shaders [WIKI Modding].
  - Shots physically nudge ships (blog 2009-04-23).
  - Bloom and shadows were tried and dropped (blog 2009-07-12, blog 2010-02-23).
- **Audio:** sound is zoom-dependent, so zooming in amplifies local effects [JIG]. Orchestral score by Jesse Hopkins.
- **Humour:** joke module descriptions, random ship names, and comms chatter such as "it's take-out food tonight, boys!" [EG; JIG].
- **UI layout:**
  - Design screen: blueprint with slots, a tabbed module picker, a ship stats window at the bottom (a popup at low resolution), and a module comparison window sorted by any stat (blog 2010-02-12, blog 2010-06-09).
  - Deployment screen: map in the centre, design strip and order list with ship details on the left, and a supply-limit panel [MAN; blog 2009-12-03].
  - Cliff's own verdicts: "The UI was not as gratuitous as it could have been" (blog 2010-11-30) and "The deployment UI for GSB is not as good as it could be… this is the main meat and potatoes of the game" (blog 2010-02-01).

---

## 8. Reception
- **Metacritic PC: 72** ("Mixed or average") [MC]. Scores:
  - AtomicGamer 85, PC Zone UK 84, Destructoid 80, GameShark 75, 9Lives 74.
  - PC Gamer UK 72 ("Imperfect spaceship engineering and asynchronous online dueling combine to deliver a flawed star").
  - Boomtown 70, LEVEL 70, Eurogamer 70, AceGamez 66.
- **Other reviews:** Jay is Games 4.8/5, bit-tech 8/10, GamesRadar 7/10 [WP]; SpaceSector 7.5/10 [SS].
- **Steam user reviews:**
  - Steam purchasers, all languages: "Mostly Positive", 412 up / 155 down (567 reviews).
  - Including key activations: "Mixed", 622 / 268 (890 reviews) [REV API].
- **Praised:**
  - Visuals and explosions [WP; EG "beautifully presented"; JIG].
  - Depth of ship design and the tinkering loop [EG; JIG "extremely tactical"].
  - Asynchronous challenges and "anyone can compete regardless of reflexes" (blog 2010-07-06).
  - Humour [WP Destructoid; EG].
  - The addictive honour system [SS].
- **Main complaints:**
  - **No control during battle:** "the lack of interaction during battle is sort of boring" [JIG commenter]. In my 630-review Steam sample, 43 of 230 negatives mention control or watching [REV].
  - **Opaque, steep learning curve:**
    - Eurogamer: "far from intuitive… For your first 15 or so battles… like performing surgery on a wombat" [EG]. GamesRadar says you are left unsure what worked [WP].
    - Cliff: players lacked "understanding what weapons and modules were effective" (blog 2010-06-07). "The tutorial is weak, and the learning curve too steep" (blog 2010-11-30).
  - **Shallow late game and repetition:** "Battles never hold surprises… After your first four hours or so… something much more mundane"; jokes repeat [EG]. Steam negatives: "Ship spam seems to be more effective than carefully-built ships"; "3–5 minutes of actually watching fights for each hour of setting up" [REV].
  - **Balance and spam:** Destructoid flagged a lack of balance when deploying masses of cruisers [WP]. Cliff added supply limits to fight "a block of 64 identical frigates" (blog 2009-11-29). Players call it rock-paper-scissors and report degenerate "spam and counter-spam" [F-123; F-CHAL].
  - **AI stupidity and unpredictable movement:** sticky driving targets, decoy exploits, fighters wasting fire outside shield bubbles [F-AI]. "Auto-targeting sucks" [REV].
  - **UI:** menus unpolished [WP DIYGamer]. "UI is horrible… useless post battle stats" [REV 2026].
  - **Technical:** crashes; later the dead online servers break the campaign [REV]. Battles are non-deterministic, so there are no replays (blog 2009-10-05).
  - **DLC:** some complain about content behind paywalls [REV].
- **Commercial and longevity:** about 501,934 online challenge games, 40,000+ uploaded challenges and 100,000+ campaign battles by Feb 2011 (blog 2011-02-03). About $8,700 Steam net income in the year to mid-2022 (blog 2022-07-03).

---

## 9. Scale numbers
- **Content:** over 40 hulls and over 120 modules in the base game [STEAM]. The wiki has stat pages for 139 modules (base plus Tribe, Order, Swarm, and race exclusives) and about 56 hulls [WIKI].
- **Fighters:** squadrons of 1–16; each fighter uses one pilot (blog 2009-11-12; MAN p6).
- **Fleet size:**
  - Early build: "40-50 ships a side", with plans to scale "way way beyond" (blog 2009-01-19). Later: "a few hundred ships per side" runs fine (blog 2009-04-23); Cliff's AI examples use "300 enemy ships" (blog 2009-09-22).
  - A campaign bug even produced squadrons of 120 fighters, and the engine coped (blog 2010-05-31).
  - A player challenge example: 100k credits, 1,000 pilots, map size 4096 [F-CHAL].
  - **Hard maximum ships per battle: UNVERIFIED** (none found).
- **Budgets and pilots:** Defending Sirius 20,000 credits; Lagoon Nebula 25,000 [WIKI]. Example scenario file: 25,000 credits and 60 pilots [WIKI Modding]. The mod repo's Swarm map has 15,000 and 50 [MODREPO] (possibly modded).
- **Map size:** example 2048×2048 px at zero zoom [WIKI Modding]; mod Swarm map 3000×3000 [MODREPO].
- **Battle length: UNVERIFIED** as an official figure. Anecdotes: one survival run took about 1¼ hours [F-SURV]; a test fight took "over a minute at 4x" [F-HIT].
- **Performance budget in a big battle** (blog 2009-08-13): 47% drawing ships and effects, 12.7% debris, 8.3% missiles, 7% hulks, 5.9% gameplay and target-selection AI, 4.3% post-processing.
- **Challenge browser** showed up to 1,024 challenges, raised to 2,000 (blog 2009-12-03, blog 2010-01-07).

---

## 10. Designer's own post-mortem (most useful for a remake)

**"Things I did wrong in GSB"** (blog 2010-11-30):
- No netbook resolutions.
- A fixed number of ship sizes.
- Non-deterministic battles, so no replays.
- No achievements.
- Weak tutorial and a steep learning curve.
- A dumb auto-updater.
- Thin online features: no friends lists, profiles or clans.
- Poor multi-core use.
- Little unit visual customisation.
- Awkward mod support.
- A poor internal ship editor.
- A UI that was not gratuitous enough.

**Ridiculous Space Battles (2025) changes and why** (blog 2025-05-10):
- **Grid deployment:** ships hold grid formations because GSB's overlapping "scrum" of stacked ships looked bad.
- **Fixed squads:** each grid square holds 1 cruiser, 4 frigates or 25 fighters. "95% of players never adjusted fighter squad size."
- **Simplified orders:** no retreat-to-repair and no escort. The lead ship holds the fleet position. GSB orders were "like you are doing shader programming".
- **Defend-the-line:** you lose if enemies reach your side of the screen.
- **Orders redesign** (blog 2025-08-15): prioritised, colour-coded "target criteria" plus a single "tie-breaker" (Co-operate, Vulture, Retaliate, Breakthrough or Last Defense).
- Cliff also wrote that GSB "suffered from a load of obvious game design mistakes" (blog 2025-05-03). His 2024 notes on formation-leader elections and on engagement range turning battles into a "bar-room brawl" are in blog 2024-03-24.

---

## UNVERIFIED or conflicting items (summary)
- Exact speed formula from thrust and weight.
- Whether the shipped game uses the pre-release optimum-range damage curve.
- Average-armour divisor: modules vs modules+1.
- Crit chance through armour: 2% vs 3%.
- Honour loss modifier.
- Unlock prices other than Legion's 7,200.
- Exact base-game scenario count and list.
- Hard ship cap.
- Typical battle length.
- Some wiki hull bonus labels (speed vs shield).
- Current server state (user-reported only).
- A 2017 Steam review's mention of "Manual Orders" being added.
- No Reddit threads of substance were found. Rock Paper Shotgun's review text could not be retrieved.

---

## Sources
- **[STEAM]** https://store.steampowered.com/app/41800/Gratuitous_Space_Battles/ (and appdetails API https://store.steampowered.com/api/appdetails?appids=41800)
- **Steam DLC pages:**
  - **[STEAM-GC]** https://store.steampowered.com/app/41814/
  - **[STEAM-PAR]** https://store.steampowered.com/app/41816/
  - **[STEAM-OUT]** https://store.steampowered.com/app/41817/
  - Tribe https://store.steampowered.com/app/41802/
  - Order https://store.steampowered.com/app/41803/
  - Swarm https://store.steampowered.com/app/41804/
  - Nomads https://store.steampowered.com/app/41805/
- **[REV]** https://store.steampowered.com/appreviews/41800?json=1 (purchase_type=steam and all; negative and positive samples)
- **[NEWS]** https://store.steampowered.com/news/app/41800 (Ultimate Edition, 2015-10-27)
- **[MAN]** https://cdn.akamai.steamstatic.com/steam/apps/41800/manuals/GSB%20Manual.pdf
- **[HOME]** https://www.positech.co.uk/gratuitousspacebattles/index.html
- **[FAQ]** https://www.positech.co.uk/gratuitousspacebattles/faq.html
- **[DLC]** https://www.positech.co.uk/gratuitousspacebattles/dlc.html
- **[SUP]** https://www.positech.co.uk/gratuitousspacebattles/support.html
- **[WP]** https://en.wikipedia.org/wiki/Gratuitous_Space_Battles
- **[MC]** https://www.metacritic.com/game/gratuitous-space-battles/critic-reviews/?platform=pc
- **[MC-GC]** https://www.metacritic.com/game/gratuitous-space-battles-galactic-conquest/critic-reviews/?platform=pc
- **[EG]** https://www.eurogamer.net/gratuitous-space-battles-review (and ?page=2)
- **[JIG]** https://jayisgames.com/review/gratuitous-space-battles.php
- **[SS]** https://www.spacesector.com/blog/2010/07/gratuitous-space-battles-review/
- **[WIKI]** https://gratuitousspacebattles.fandom.com/wiki/ — module and hull pages, plus Module, Race, Honor, Fleet_HQ, Modding, Fighter, Frigate, Cruiser, Weapons, Tribe, Rebel, Empire, Alliance, Federation, Mission_Walkthroughs, Defending_Sirius, The_Lagoon_Nebula, Imperial_Weapons_Platform_Hull. All read via https://gratuitousspacebattles.fandom.com/api.php.
- **Wiki guides:**
  - **[WIKI mrocktor]** …/wiki/Guide:_Positioning_and_Movement_by_mrocktor
  - **[WIKI yurch]** …/wiki/Gunnery_and_Dying_last:_Defense_on_a_budget_by_yurch
  - **[WIKI Torrenal]** …/wiki/The_State_of_Defence_-_A_Beginner's_Guide_by_Torrenal
  - **[WIKI Xelek]** …/wiki/Frigate_and_Cruiser_Design_Guide_by_Xelek
  - **[WIKI collimatrix]** …/wiki/The_State_of_Fighter_Design_by_collimatrix
- **Positech forums:**
  - **[F-AI]** https://forums.positech.co.uk/t/the-ai-thread/4932
  - **[F-RANGE]** https://forums.positech.co.uk/t/maximum-range-question/3868
  - **[F-HIT]** https://forums.positech.co.uk/t/1-11-weapon-tracking-speed-doesnt-make-sense/2794 (raw text: https://forums.positech.co.uk/raw/2794)
  - **[F-123]** https://forums.positech.co.uk/t/123s-comprehensive-gsb-guide/5083
  - **[F-SURV]** https://forums.positech.co.uk/t/survival-mode/2741
  - **[F-CAUT]** https://forums.positech.co.uk/t/please-remove-auto-caution/5215
  - **[F-STACK]** https://forums.positech.co.uk/t/reduce-shield-stacking-penalty/5590
  - **[F-TB]** https://forums.positech.co.uk/t/number-crunching-the-target-boosters/4175
  - **[F-ARM]** https://forums.positech.co.uk/t/armour-penetration/3760
  - **[F-GC]** https://forums.positech.co.uk/t/galactic-conquest-video-review/5595
  - **[F-CHAL]** https://forums.positech.co.uk/t/how-to-post-proper-online-challenges-imo/7519
- **[MODREPO]** https://github.com/Limagreen/Limagreens-Gratuitious-Overhaul (a mod, so values may be modded; used only for file format)
- **Cliff's blog.** Every "blog YYYY-MM-DD" is https://www.positech.co.uk/cliffsblog/YYYY/MM/DD/<slug>/. Slugs, grouped by year:
  - **2009:**
    - 01-18 damage-textures
    - 01-19 the-new-game
    - 02-17 better-shields
    - 03-06 biggger-battles-working-on-various-bits
    - 03-15 gratuitous-debris
    - 03-24 multiple-beams-and-turrets
    - 03-25 escorts-and-formations
    - 04-08 changing-some-shield-stuff
    - 04-11 space-hulk
    - 04-20 difficulty-levels-and-other-wrapper-stuff
    - 04-23 emergent-l33tness
    - 04-29 racial-and-ship-bonuses
    - 05-10 optimum-range
    - 05-14 reflecting-beam-lasers
    - 05-27 how-the-sort-of-multiplayer-will-work
    - 05-29 anti-missile-weapons
    - 06-07 changes-to-ship-design-system
    - 06-12 gratuitous-deployment-interface
    - 06-19 motion-blur
    - 06-25 better-damage-effects
    - 06-28 how-shields-do-and-will-work
    - 07-10 taking-direct-control
    - 07-12 fighter-hulks-and-some-aborted-stuff
    - 07-22 alpha-warping-in-and-firing-arcs
    - 08-13 performance-stats-for-gsb
    - 08-18 victory-conditions-for-gsb
    - 08-26 challenge
    - 09-05 gratuitous-patch-104
    - 09-14 patch-1-08-ratable-challenges
    - 09-22 fixing-the-ai-orders-again
    - 09-27 repair-drones
    - 09-29 fighter-nerfs-spatial-anomalies-ui-fixes-galore
    - 10-05 determinism
    - 10-18 possible-unlock-changes
    - 10-26 a-not-so-trivial-change
    - 11-04 release-day-at-last
    - 11-12 variable-squadron-sizes
    - 11-15 aesthetically-pleasing-weapons
    - 11-21 expansion-pack-underway
    - 11-25 challenges-and-mods-and-expansions
    - 11-29 supply-limits
    - 12-03 tweaking-supply-limits
    - 12-07 nearly-finished-supply-limits
    - 12-19 lets-talk-about-patch-28
  - **2010:**
    - 01-07 gsb-1-29-and-some-stuff-for-next-time
    - 01-08 asteroidz
    - 01-13 radiation-leak-on-deck-twelve-bah
    - 02-01 deployment-interface-tweaks
    - 02-09 programming-gratuitous-rocket-trails
    - 02-12 two-new-features-for-gsb
    - 02-16 gratuitous-patch-number-32
    - 02-23 spot-the-new-feature
    - 02-26 die-you-heathen-alien-scum
    - 03-07 new-challenge-details-screen
    - 03-09 stay-close-fuschia-leader
    - 03-23 gratuitous-stats-work-in-progress
    - 03-26 more-stats-and-general-update
    - 03-29 surely-not-more-stats
    - 04-09 gratuitous-campaign
    - 04-15 campaign-encounters-patch-1-37
    - 05-02 the-swarm-are-coming-flee-now
    - 05-21 campaign-scrappage-schemes
    - 05-31 ooops-fighter-swarm
    - 06-07 better-damage-feedback
    - 06-09 improving-usability
    - 06-10 experimenting-with-module-statistics
    - 06-11 federation-elite-panther-cruiser
    - 06-23 better-smoke-clouds
    - 06-28 selecting-suitable-user-generated-fleets
    - 06-29 shield-support-beam
    - 07-06 why-gsb-is-not-like-a-normal-rts-deliberately
    - 07-20 campaign-ai-stuff
    - 07-22 shield-support-balancing
    - 08-09 campaign-battle-frontiers
    - 09-04 nomads
    - 09-13 gratuitous-dlc-experiment
    - 11-07 patch-1-48-for-gratuitous-space-battles
    - 11-08 gsb-galactic-conquest
    - 11-15 stats-summary-window
    - 11-16 the-fighter-spam-issue
    - 11-30 things-i-did-wrong-in-gsb
    - 12-08 quick-bug-code-update
  - **2011:**
    - 02-03 half-a-million-space-battles
    - 03-08 gsb-update-new-campaign-maps-much-easier
    - 08-06 more-work-of-the-gratuitous-parasites
  - **2012:**
    - 11-13 the-gsb-cruiser-decoy-projector
    - 11-30 outcasts-update
    - 12-07 gratuitous-space-battles-version-1-61-is-live
  - **2022:**
    - 07-03 what-income-can-you-get-from-your-old-indie-pc-games
  - **2024:**
    - 03-24 designing-a-system-of-orders-for-units-in-a-war-game
  - **2025:**
    - 05-03 ridiculous-space-battles-how-and-why
    - 05-10 ridiculous-space-battles-design-goals
    - 08-15 designing-the-orders-system-for-ridiculous-space-battles
