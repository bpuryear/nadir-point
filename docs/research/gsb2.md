
# Gratuitous Space Battles 2 (GSB2): design teardown

Everything below comes from the sources in the reference list at the end. Tags like [F8123] point to entries in that list. I've marked where a fact comes from the developer (Cliff Harris, "cliffski") and where it comes from the community (players on the forum or in Steam reviews). Anything I couldn't confirm is marked **UNVERIFIED**.

**Quick facts:**
- **Release and price:** Released April 16, 2015 on Windows, Mac and Linux by Positech Games [1][2]. The beta opened February 6, 2015 for pre-orders [B-beta][F8186]. Launch price was £18.99 / $24.99 [R1]; the current Steam price is $9.99 [2].
- **Patch history:** The last patch was 1.40 in August 2015 [6][F8228]. The developer stopped work on it in November 2015 [18][6].
- **Engine:** A custom C++/DirectX 9 engine. Ships are layered 2D sprites with normal maps, drawn in fake 3D. Ranges and positions are computed in 2D and then drawn with parallax [25][F8025][F6982].

---

## 1. What changed from GSB1 to GSB2 (old → new)

**Ship classes**
- GSB1 had 3 classes: fighters, frigates, cruisers [13][R11].
- GSB2 has 6, described as "three sizes, each with two classes and three hulls for that class" [U-Snowman][13]:
  - Small: fighter and gunship.
  - Medium: frigate and destroyer.
  - Large: cruiser and dreadnought.
- Intended roles, per the developer [13]:
  - Frigates are fast raiders.
  - Destroyers are support ships that "don't generally attack".
  - Cruisers are the main battle line and do most of the damage; they can also be carriers.
  - Dreadnoughts are what a fleet is built around: very slow, carry the biggest guns, ideally rear-area carriers, and depend on destroyer escorts.
  - Gunships are "big fighters" that can mount two weapons.
- Module sharing was planned by size pair (fighter/gunship, frigate/destroyer, cruiser/dreadnought). Within that, some weapons are dreadnought-only and many support modules are destroyer-only [F7899 #13].
- "In GSB2, cruisers and dreadnoughts have no point defense at all, they require support ships" (developer, September 2014) [F8031].

**Fighters**
- GSB1: fighters were free-deployed. Cruisers could carry carrier modules that repaired fighters that had the Cautious order [F-search: cliffski 2009 "Carrier Modules"].
- GSB2 [13][F7948][1]:
  - Fighters and gunships must be deployed inside a carrier bay.
  - They launch from tubes at battle start.
  - They burn fuel and must return to a carrier to refuel.
  - Killing carriers therefore grounds the enemy's fighters.
- An "Assign carrier" order is added to every fighter automatically, can't be removed, and the fighter flashes red until you assign it [F7828 #93].
- Fighters and gunships are hard-coded to need engines and fuel [F8317].

**Damage model**
- GSB1 used penetration only, and the developer admits players found it baffling [15][F7899].
- GSB2 gives every weapon [F8123]:
  - a base damage;
  - a hull, armor and shield damage multiplier;
  - an armor penetration and a shield penetration value.
- The penetration-versus-resistance hard block stays: if penetration is below resistance, the shot bounces [9].
- There is a small "lucky shot" chance through armor: about 3% in the official guide [9], "2%" in a December 2014 developer post [F8123].

**Shields**
- GSB1 shields were spheres; fighters could fly inside the shield radius and shoot underneath it [F8260][F8260 #5].
- GSB2 shields hug the hull, drawn with a hex/grid pattern and the ship's alpha map, so there is no flying inside them [27][F8260].
- GSB2 shields regenerate over time and can be "disrupted" [9].

**Other combat changes**
- **Optimum range falloff:** GSB1 had an "optimum range" damage penalty; community players say GSB2 "no longer has" it [F8677 #16][F8955 #16]. (Community claim, not confirmed by the developer.)
- **Missiles:** GSB1 allowed one missile in flight per launcher; GSB2 allows up to 10, each able to have sub-munitions [F7948][F8126].
- **Firing arcs:** new in GSB2, set per weapon slot and shown on mouse-over [F7948][F7967 #25].
- **Targeting:** GSB1 aimed at the ship's centre; GSB2 works on range to target points on the hull [F8033].
- **Per-weapon target choice:** GSB1 turrets ignored how effective they'd be against a target. GSB2 weighs a weapon's damage multipliers against each target's shield, armor and hull state [F8171].

**Formations**
- GSB1: a formation meant "stay at this position relative to that ship", and it was abandoned when that ship died [16].
- GSB2: you group-select ships and add one formation. The group "elects" a command ship (by default the non-fighter with the most hitpoints) and holds relative positions. If the leader dies or is tractored, a new one is elected [16][F8072 #5][1].
- Formations can't be nested [F8209 #7].

**Deployment**
- GSB1 battles always ran left to right. GSB2 supports top-to-bottom layouts [F7978 #10] and ambush missions where the defender starts in the centre [F8487].
- Ships can be rotated during deployment (Ctrl or Shift plus mouse wheel) [F7948][8].

**Engines and hulls**
- Thrusters are new: turning (agility) is separate from top speed [F8123].
- Each hull now supplies some power and crew; in GSB1 hulls did not [14].

**Visuals**
- GSB1: flat sprites, topping out around 2048 resolution [R9].
- GSB2 [26][33][R9][19]:
  - normal-mapped directional, ambient and ship lights, with shadows;
  - parallax layers, with ships flying above and below each other;
  - bloom occlusion;
  - resolution of 5120 and beyond, with one-click multi-monitor support.

**Ship appearance**
- GSB1 had fixed hull art.
- GSB2 has a component-based visual editor: rotate, scale, colour, add spinning parts, save groups as "composites". It is purely cosmetic [R1][F8032].

**Direct control and campaign**
- GSB1's Galactic Conquest DLC added optional direct control of ships and a 4X-lite campaign [GH-review 2011][F8497].
- GSB2 has no direct control ("in the original game, nobody used it") [D-RTS]. Its campaign is a linear series of battles, added free in 1.34 [6][7].

**Content**
- "Every single weapon and module from every race & expansion pack of GSB1 is in GSB2", redistributed across 4 new races [20][F7828 #138].
- GSB1's races are not playable in GSB2 [F8417].

**Performance**
- The engine is multithreaded. Early on, the developer estimated this roughly doubled the framerate [30].
- He later said multithreading "increases your bug count by at least tenfold" [20].

**Not found:** I found no evidence of a 3-lane or zone battlefield. Battles are a single 2D map with parallax depth; ships that clump together separate into draw layers [U-Snowman][F8025].

---

## 2. Core loop

**Before battle**
- **Picking a mission:** Missions sit on a map screen and unlock along a path [F7961]. Each mission has difficulty variants (normal, medium, hard, expert; expert high scores are tracked online) [7][F8228 1.21][12].
- **Scenario file:** Each scenario defines [F8244]:
  - map size (example: 4096×4096);
  - player and AI deployment rectangles;
  - `fleetcostlimit` (example 250,000; a player reports 190,000 as a default);
  - `pilotlimit` (example 800);
  - enemy race;
  - default ship angle, asteroids and lighting;
  - terrain (planets, nebulas, stars).
- **Anomalies:** Missions can have spatial anomalies, e.g. no shields or no dreadnoughts. Designs using modules an anomaly disables are tinted red, and banned classes disappear from the deployment screen [F8228 1.20][F8407].
- **Designing:** Design ships on the ship designer / "Fleet HQ" screen [F8080].
- **Deploying** [8][F8275][22]:
  - Drag designs into your zone; right-click → "mass deploy".
  - Save and load "sub-deployments" (groups of selected ships with their orders and formations) that can be reused in any mission.
  - Save whole deployments per scenario.
  - Save "default orders" for each design.
  - Hotkeys Shift+A, Shift+E, Shift+F assign carrier, escort and formation.
- **Enemy visibility:** The enemy fleet may show as "Enemy Deployment Unknown" [F8228 1.21].

**During battle**
- You give no orders; "once the fight begins, you're left to watch" [R10][R1].
- You control [8][F8276 #6][F8453]:
  - the camera and zoom (minimum zoom editable as `OPTIONS_MINZOOM`);
  - battle speed (reports mention x4.0) and pause;
  - clicking a ship icon to focus the camera, open a detail window and filter comms chatter to that ship;
  - `U` to hide the UI;
  - a visuals panel for brightness, lighting angle and bloom.
- There is an "admit defeat" option [F8410].

**After battle**
- **Honor:** "Every point you don't spend on fleet cost gets transformed into 'honor' if you win the battle. If you beat your honor record for a mission, you earn the difference" [14].
- **Research:** Spend honor on the Research screen (the old unlocks tab) for hulls, modules, races and visual components [F8080][14].
- **Stats:** A tabbed end-battle stats screen [F8228 1.19].
- **Retry, or post the fleet as a challenge.**

**Win/loss condition: UNVERIFIED.** There is a "Victory!" popup [F8276 #10]. One Steam review reports AI ships "move outside the gameworld… making it impossible to finish a mission" [U-43195182], which suggests victory requires eliminating the enemy, but I found no rule text.
- **Time limits:** none found (UNVERIFIED).
- **Reinforcements:** none found in the base game. The developer floated campaign reinforcement points but I found no evidence they shipped (UNVERIFIED) [D-campaign].

---

## 3. Ship design

**Hull classes and slots**
- There are two slot types:
  - weapon slots ("hardpoints"), which can hold a weapon or a module;
  - module slots, which hold modules only.
- Slots don't restrict by type; each module decides which hull sizes may carry it [F8466][F7828 #5].
- Every gunship hull, all twelve across the races, has 2 hardpoints and 5 standard slots [F8276 #11][F8483].
- The Kraugerisk Pitchfork is the only fighter with 2 hardpoints [F8483].
- Gunship power output is 6, 7 or 8; the Yootan Clyde fighter has 4, the highest of any fighter [F8483] (community).
- The developer planned more extreme cruiser slot spreads ("some cruisers may have 12 turrets, some only 4") [F8013].
- A sample Terran design file (`hull = F1_CruiserC`) lists module slots 0–19 plus a `[targets]` list of hull hit-points [F8357].
- Hull attributes: physical size, free power produced, cost, bonuses, turret-slot count, standard-slot count, and crew supplied [F8013][14].

**Hull bonuses**
- Percentage modifiers such as SPEEDBOOST, AGILITYBOOST and TARGETBOOST (tracking) [F8123][F8317 #11], plus armor, shield, cost and power bonuses [14].
- Examples:
  - Eisenhower dreadnought: +80% armor; Yamamoto: +85% armor [F8941 #6].
  - Socrates dreadnought (Zyrtari): +30% shields [F8486 #10].
  - A "+60% tracking hull" is mentioned [F8237 #4].
- One player felt racial bonuses were large ("That might just be my bias from GSB where a 20% bonus was huge") [F8209].

**Real hull names found**
- Terran: Kennedy (cruiser) [7], Yamamoto (dreadnought) [F8486], Nixon (fighter) [F8276].
- Race not stated: Eisenhower (dreadnought) [F8941], Zedong (destroyer, AI design) [7].
- Zyrtari: Socrates (dreadnought) [F8486][F-support 8211].
- Kraugerisk: Sabre (dreadnought) [F8311], Pitchfork (fighter) [F8483].
- Y'ootan: Clyde (fighter), Capone (cruiser), Blackbeard (dreadnought), Sundance (dreadnought) [F8483][F8941][F8276][7]; "Khan" [F8237].
- Zyrtari "Cherchil" (spelled that way) [D-shields].

**Budgets**
- Every module has cost, weight, crew and power requirements, plus type-specific stats. More weight means a slower ship [14].
- The designer shows supplied crew in green and deficit in red; "you have to get rid of the red" [F7967 #23].
- Fleet-level caps are the scenario's credit and pilot limits [F8244].

**Module stat fields actually shown or used:**
- **General:** cost, weight, crew, power, hitpoints.
- **Weapons:** damage; hull, armor and shield damage multipliers ("%"); shield and armor penetration; tracking speed; fire interval; salvo size; max range and min range [9][14][F8123][F8506].
- **Missiles:** missile speed, turn speed, and "fuel" (which sets missile range) [6 1.38][D-fuel].
- **Radiation:** payload and decay [F8228 1.21].
- **Support modules:** ECM strength [F8330]; limpet weight and seek speed [7 1.31]; beam power (on-time) and recharge [7 1.36].
- **Engines:** thrust and maneuverability [F8537].
- **Carriers:** fighter capacity and launch rate ("launch tubes" launch faster) [14][F8107 #9].
- **Stacking effectiveness:** armor and shields [F8941][F8486].
- Stats live in `shipmodules.csv`, a CSV with more than 120 columns (`ecm_strength` appears in columns 80 and 123) [F8330].
- There's a comparison tool: click any stat to rank the module against others. Fill bars were added in 1.20 [14][F8228].

**Visual editor**
- About 300 component icons as of September 2014 [32].
- Components are sprite, normal map, optional tint layer and optional lightmap, with per-component "hulk" (debris) pieces [11].
- Components can be hit by enemy fire, but their position has no gameplay effect [F8032 #7].
- Pre-built composites of 30+ components were added so players didn't field bare hulls [23].
- Custom per-component textures arrived in 1.36 and can be included in challenges [41].
- The hull layer can be hidden (1.31) [7].

---

## 4. Weapons and damage model

**Layer order**
- Shots hit shields, then armor, then hull [9].
- Worked developer example: a 100-damage shot with a 0.5 shield multiplier spends 40 of its damage removing 20 shield points [F8123].

**Penetration**
- If a weapon's shield penetration is below the target's shield resistance, the shot "will literally bounce off" [9].
- Effective resistance is the highest resistance among the ship's surviving shield modules [9][F8486 #5].
- The developer kept this as a hard block on purpose, because "it is easy to understand and explain" [F8504 #4].
- The same rule applies to armor, plus the ~3% lucky-shot chance [9].

**"Leaky shields"**
- Shield damage is split into 4 chunks, each hitting a random shield module. A chunk that finishes off a module can leak through to armor [9].

**Shield behaviour**
- Shields recharge over time and can be topped up by destroyer shield support beams [9].
- Shield stacking penalties are fixed when the ship is built and never recalculated in battle [F8486 #8].
- Community measurements: 90% stacking for heavy shields, 80% for capacitors [F8486 #10].
- The shield capacitor has strength but zero resistance [F8486 #2].

**Shield disruption**
- Disruption "damage" empties a separate stability pool equal to the shield's strength [F8504 #21]. A disrupted shield is off until engineers restore it [9].
- Since 1.30, disrupted shields can't regenerate, and disruptor weapons won't target a ship whose shields are already down [6 1.30].

**Armor**
- Armor does not regenerate; armor repair modules exist [9].
- The average armor value is roughly total armor × hull bonus × stacking factor, divided by the number of slots [F8941].
- Stacking was 0.85 per extra plate and became 0.90 in 1.40 ("reduced by 5%") [F8941 #10][6 1.40].
- A bug meant battles divided by filled slots only, so ships with empty slots got inflated armor. Fixed in 1.40 [F8941 #5][6].
- Community-reported ceilings: about 20 average armor on dreadnoughts before the fix [F8941 #6]; the developer measured 27.12 on a Yootan Capone cruiser with 9 heavy plates after it [F8941 #10].

**Hull and module damage**
- Every module contributes hitpoints; a ship explodes when its hull points are gone [9].
- Individual modules take damage from hull hits, so lucky shots can knock out weapons [9].
- Destroyed modules stop working (point defense, camouflage shield and ECM beam fixes) [7 1.26].
- Hull repair needs "peace and quiet", which is why pairing it with the Cautious order is recommended [9].

**Radiation**
- A dose persists inside the ship and keeps doing decaying damage regardless of shields or armor [9].
- Radiation shielding modules exist [9].

**Point defense vs anti-missile ECM**
- PD hit chance compares its tracking speed to the missile's speed.
- The ECM beam has a fixed 75% chance [D-PD].
- Since 1.38, PD beams visibly "oscillate wildly" around missiles too fast to hit [7].

**Hit chance**
- Depends on weapon tracking versus target speed, with target size also a factor ("the size variable on hit chance") [F8677 #24][R-snow].
- Community speed thresholds (not developer-confirmed) [F8544]:
  - fighters at 3.0+ speed are hit about 2% of the time by rapid-fire weapons;
  - below 2.0 they start being hit by cruiser weapons.

**EMP / ECM**
- Ships can be "Systems Scrambled". There are ECM shields, ECM shock missiles, and a cruiser EMP missile that a player says stops fire for about 3 seconds [F8558][F8486 #4].

**Fighter mechanics** [13][F8288][F8535][F8302][D-fuel]
- Fuel tanks; fighters return to the nearest carrier to refuel and repair.
- Multiple carrier modules launch faster.
- Refuel and repair limpets (added 1.30) service fighters mid-space.
- Hostile limpets either add weight (slowing fighters) or act as tracers that paint fighters for missiles.

**Weapon families and names that appear in sources:**
- **Cruiser/dreadnought:**
  - Pulse family: pulse cannon, rapid pulse cannon, Sledgehammer pulse cannon (Kraugerisk), pulse laser, heavy pulse laser (dreadnought).
  - Beams: light, standard and heavy beam laser; sniper beam/laser; particle accelerator; pulverizer beam and lightning gun (dreadnought-only); dreadnought fusion cannon; cruiser radiation beam.
  - Plasma: heavy plasma, radiation plasma.
  - Missiles: multi-warhead, two-stage and fast missiles; shield-disruptor, EMP and anti-fighter missiles.
  - Other: defence laser; tractor, multi-point tractor, combat tractor and high-power tractor beams.
  - Sources: [6][7][F8230][F8537][F8558][F8237].
- **Frigate/destroyer:**
  - Missiles: frigate, hyperspeed and superseeker missiles; anti-fighter missile.
  - Guns: flak cannon, heavy beam laser, heavy plasma, plasma sling, Zyrtari pulse laser, radiation gun.
  - Defence and support: point defense laser, ECM beam, guidance scrambler, shield support beam (a superior Kraugerisk version), propulsion beam, recon projector.
  - Sources: [6][F9093][F8558][F8072][D-PD].
- **Fighter/gunship:** pulse and light pulse laser, fighter missiles, dogfight missile, torpedo, anti-shield bomb, disruptor bomb, Yootani Scimitar beam, an anti-armor fighter beam [F8441][F9093][F8228].

**Real stat values**
Developer numbers come from patch notes or developer posts; others are community-quoted:
- Pulse cannons (beta 1.15): tracking ≥1.80, shield penetration ≥23, 50% shield damage, armor penetration 19. Small version 13.5 damage per 0.88 s; large version 40 per 2.65 s [F8237 #3].
- Sniper beam: tracking 1.4, shield penetration 8, 36 damage per 2.7 s, extended minimum range [F8237 #3].
- Frigate missile: tracking 1.50, shield penetration 23. Hyperspeed missile: tracking 1.75, shield penetration 24 [F8237 #3].
- Heavy beam laser: armor penetration 25, 65 damage. Particle accelerator: armor penetration 30, the highest [F8941].
- Cruiser heavy plasma: shield penetration 27 (developer) [F8504]; armor penetration cut from 18 to 13 in 1.30 [6].
- Heavy plasma range 1200 vs 950 for the standard plasma [F8558 #5].
- Fighter weapon minimum ranges: 10 m (pulse laser) to 250 m (torpedo); bombs have none [D-first].
- Gunship torpedo (developer): damage 21, shield penetration 28 vs 16 for the fighter missile; weight cut from 15 to 10 in 1.32 [F8544 #11][7].
- Anti-fighter missile, 1.36–1.38: damage 9→18, range 800→900, fire interval 2900→1500, 100% vs hull / 25% vs shield. Later developer values: tracking 5.4, turn 14, missile speed 0.42 [7][F8677 #24].
- Cruiser shields in 1.40: heavy 200→250, medium 150→200, light 50→150 strength. Resistance: heavy 22, light 14 [6][F8955 #4].
- Frigate shields in 1.40: heavy 30→65, medium 70→91, light 50→70 [6].
- Shield support beam range up to 700 m [F8350 #4]. Multi-point tractor range cut to 400 [F8535 #7].

**Death explosions:** Large ships' explosions damage nearby ships; players describe dreadnought deaths as chain-reaction "suicide bombs" [F8494 #2, #11].

**Repair:** armor repair, fast repair and droid bay modules; carrier repair for fighters [F8357][F9093][9].

---

## 5. Orders and AI

**Orders confirmed in GSB2**
- **Attack [class]:** one order per class (fighters, gunships, frigates, destroyers, cruisers, dreadnoughts), each with a priority % and an engagement range. Delete the order to ignore that class [F8357][F8353].
  - Default engagement range is the ship's longest max range × 0.8 (1.20) [F8228].
  - Priority % acts as a weighting on target preference (GSB1 analysis) [W-yurch].
- **Cautious:** retreat at a damage threshold. Since 1.32 it uses armor + hull combined [7].
- **Keep Moving:** in-game text says "Continually move to a new location within range of your target so as not to be a sitting duck. This is incompatible with the escort or formation orders" [F8310].
- **Escort:** stay within a user-set distance of a chosen ship [17].
- **Formation:** formation takes precedence over all movement; the leader follows its own orders [F8310 #2].
- **Stick Together:** keeps fighter squads together [F8362][F8238].
- **Target-choice modifiers:** Co-operative, Vulture, Rescuer, Retaliate [F8362 #4][F8494 #10]. GSB1 definitions: Vulture prefers damaged hulls; Co-operative prefers targets others are firing on; Rescuer prefers enemies that are firing; Retaliate prefers enemies firing at itself [W-yurch]. **UNVERIFIED** whether GSB2 changed these semantics.
- **Assign carrier:** automatic and mandatory for fighters and gunships [F7828 #93].

**How targeting works**
- Each ship has a "destination" (the target it drives toward) and a "tactical target". Turrets take pot shots at anything in range while heading to the destination [F8353 #2].
- Weapons consider relative effectiveness; a weapon that can't penetrate a target still fires if nothing else is available [F8171].

**Escort geometry (developer) [17][F8494 #4]**
- Non-fighters head for the point on the escort radius along the line toward their current target. This causes "frigate bunching" at the nose of big ships.
- Fighters and gunships pick random points within half the escort radius, halfway between the escorted ship and the target.

**Movement**
- Since 1.25 ships slow down for tight turns. Players complained this made fast frigates and gunships stall [7][F8494 #13–21].

**Developer's own view:** In 2025 he called GSB's orders "a completely opaque system that nobody understood and was poorly explained", assigned per ship rather than per weapon [43].

---

## 6. Factions / races

- **Four races, all in the base game:** Terrans (the starting race), Zyrtari, Kraugerisk, Y'ootan [F8311][R1]. Achievements refer to "each of the four basic races" [12].
- **No GSB2 DLC exists.** Steam lists no DLC for the app [2], and GOG lists none [R3]. Nomads, Order, Outcasts, Parasites, Swarm, Tribe and Galactic Conquest are all **GSB1** DLC; they appear only in the "Ultimate Collection" bundle alongside GSB2 [1][5].
  - GSB1 DLC dates: Tribe (Dec 2009), Order (Mar 2010), Swarm (May 2010), Nomads (Nov 2010), Parasites (Oct 2011), Outcasts (Jan 2013) [5].
  - The developer (July 2015): "we arent planning any DLC right now" [D-campaign].
- **Race tendencies (community):**
  - Zyrtari: boosted shields; Kraugerisk: boosted tracking [F8311 #6].
  - Terran fighters: good power and targeting; Zyrtari fighters: armor and hull; Kraugerisk: targeting; Yootan: speed and better engines [F8483].
- **Race-specific kit:**
  - Kraugerisk: Sledgehammer pulse cannon, a superior shield support beam, most salvo weapons [F8558][F8506 #3].
  - Zyrtari: shield caster [F8955].
  - Terran: reactor array [F9093].
  - Yootani: Scimitar beam [F8441].
- **Looks:** Kraugerisk ships are insectoid [F8311]. The fourth race's ships were "saucer" style [F6982 #102] (which race that is: UNVERIFIED).
- **Critic view:** PC Gamer said "the other races offer negligible differences in buffs to ship stats" [R1].

---

## 7. Progression and meta

**Missions**
- 10 core missions at launch. Achievements say "all 10 campaign missions" on medium and expert [12], and a player counted "just 10 battles" [D-posneg].
- Added after launch: Pyrataxian Ambush and The Slarthoon Belt (1.29), The Gamorlian Expanse (1.30) [6].
- Two tutorial battles [F8843].
- Named maps: Atterion III, Yamaxxia Prime, Paleovost IX, Zoophon's World [F8276][F8252].

**Honor and research**
- Unlock costs were raised 50% in 1.18 and again in 1.27–1.28 [22][7].
- Players still unlocked everything within hours [U-15426473][F8407].

**High scores:** Per-mission online high-score tables ("win with the smallest fleet"), including expert [40][F8228 1.21].

**Campaign (1.34, July 2015)**
- You pick one fleet in the first battle and carry the survivors through a linear series of battles.
- Destroyed ships are lost; damaged ships are repaired between battles.
- You can save at any point; the campaign is moddable [6][F8595][D-campaign].
- Players called it short and easy with no difficulty option [U-43195182][D-campdiff].

**Custom battles (1.31):** A scenario editor (planets, nebulas, stars, anomalies, map size) with "deploy player fleet" and "deploy AI fleet" buttons, also usable to issue custom challenges [21][F8510 #10].

**Online challenges**
- Upload a whole fleet — orders, formations and custom designs — to the Positech server; others download it and fight it [2].
- Other features [F8228][F8875][39][F8487]:
  - retaliation challenges;
  - an inbox with jump-to-challenge (1.38);
  - required mods listed with each challenge;
  - ambush maps flip attacker and defender for challenges and retaliations.
- It needs an online serial and username [B-beta].
- Community reports that no challenges newer than the end of 2019 are listed [D-servers].

**Also:** Steam Workshop for ship designs, auto-tagged by class [F8228 1.26]; 30 achievements; trading cards [2][12].

---

## 8. Presentation

**Lighting and effects**
- Sprites combined with normal maps, lightmaps and multiple render targets; composited per frame [26][25].
- Lighting per mission: ambient/foreground, directional, and ship lights; "dark battles where you can only see lasers and lights" [33][F6982 #14].
- Also [36][34][F6982 #97][6 1.40]:
  - inter-ship and asteroid shadows;
  - bloom occlusion;
  - parallax planets and nebulas;
  - experimental depth of field;
  - distortion waves at beam convergence points (1.40).

**Explosions:** Clustered particle emitters (black smoke, additive fire); the developer's view is that explosions are "90% physics, 10% graphics" [28].

**Damage visuals**
- "Rips in the ship's hull are holes exposing fires beneath" [F8260].
- Parts fly off and burn [R8].
- Per-component hulk (debris) sprites; big ships break apart on death [11][F8228 1.16].
- Escape pods; hovering one shows which crew escaped [8].

**Camera:** Minimum zoom is editable in `config.txt`; GSB1's follow-cam button was missing in GSB2 [F8387][F8834].

**Battle UI** [8][F6982 #80]
- Ship detail windows with per-weapon firing arcs, shot counts and reload bars.
- Lines from each weapon to its target; range rings.
- Minimap; comms chatter; voiceover.

**Post-battle:** A tabbed stats screen (graphs: UNVERIFIED). Some players thought it gave less useful information than GSB1's [F8407].

**Complaint:** The screen is too busy — asteroids, nebulas and debris obscure the fight. Toggles were added in 1.28 [F8407][F8222][7].

---

## 9. Reception

**Steam**
- 91 positive / 157 negative among Steam purchasers = 36.7% ("Mostly Negative", 248 reviews). All sources: 123/311 = 39.5% [3].
- GSB1 for comparison: 412/567 = 72.7% ("Mostly Positive") among Steam purchasers; 622/890 = 69.9% overall [4].

**Metacritic:** No Metascore ("tbd"). Three critic reviews: PC Gamer UK 59, 4P.de 56, CD-Action 50. User score 2.4 from 5 ratings [R2]. GSB1's Metascore is 72 [5].

**Other scores:** GOG 2.8/5 from 22 ratings [R3]; Power Up Gaming 7/10 [R5]; GamingShogun 2/5 [R6]; Chalgyr's Game Room 9.25/10 (quoted on the Steam page) [1][R7].
- No GSB2 reviews found from GameSpot, Eurogamer or Strategy Gamer. Rock Paper Shotgun only ran a release news post [R4].

**Praise**
- The ship designer and visuals [R1][R7].
- New classes, carriers, firing arcs, formations and the deployment screen [D-posneg][F8497].

**Complaints**
- Crashes [R1][U-19312924].
- Exploits: "90% of your encounters can be won by strapping a couple of tractor beams to a fleet of dreadnoughts" [R1].
- Fast unlocks, "samey" modules and thin content compared with GSB1 plus its DLC [U-15426473][U-15409493].
- Busy visuals [F8407].
- Developer abandonment [U-19536474].

**GSB1 vs GSB2**
- Fans broadly preferred GSB1 for its content, stability and campaign [D-GSB1or2][D-shouldbuy][U-30480512].
- The developer thought GSB2 was "superior in every way" [18].

**Sales and business**
- 10,876 Steam owners (per SteamSpy, as the developer cited it). A bit over $150k revenue against $115k development and marketing cost, about $40k profit, about $12.74/hour [18].
- Developer on why: it "failed, partly because it was released into a sea of space strategy games" [18].

---

## 10. Scale numbers

- **Per scenario:** The example file has `fleetcostlimit` 250,000 and `pilotlimit` 800 on a 4096×4096 map [F8244].
- **Maximum ships per battle: UNVERIFIED.** The developer's aim was "hundreds and hundreds of ships on each side" [F7828 #33].
- **Achievements as a scale hint:** firing 1,000+ missiles in one battle (72.9% of players have it); destroying 500+ fighters in one battle; refuelling 100+ fighters [12].
- **Render load:** One scene had 915 3D objects and 372 effects [B-toomuch]; about 4,000 draw calls per frame; 50–60 FPS at 5120 dual-monitor on a GTX 670 [29].
- **Hulls:** 3 per class per race, as the gunship count (12 across 4 races) confirms [F8276 #11][U-Snowman]. That implies 72 hulls in total — my derivation, UNVERIFIED.
- **Module count: UNVERIFIED.** A February 2015 beta player estimated about 70 modules for large ships [F8260 #2]; a preview said about 15 weapon choices per cruiser early on [R10].
- **Battle length: UNVERIFIED.**
- **Visual components:** about 300 as of September 2014 [32].

---

## References

**Steam (store, APIs, community)**
- [1] https://store.steampowered.com/app/344840/Gratuitous_Space_Battles_2/
- [2] https://store.steampowered.com/api/appdetails?appids=344840
- [3] https://store.steampowered.com/appreviews/344840?json=1&language=all&purchase_type=all (and `&purchase_type=steam`)
- [4] https://store.steampowered.com/appreviews/41800?json=1&language=all&purchase_type=all (and `&purchase_type=steam`)
- [5] https://store.steampowered.com/api/appdetails?appids=41800 (GSB1 and its DLC)
- [6] https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=344840 (patch notes 1.27–1.40, the 1.34 campaign announcement, PC Gamer "moving on")
- [7] https://steamcommunity.com/app/344840/discussions/0/611703999983521184/ (developer changelist)
- [8] https://steamcommunity.com/app/344840/discussions/0/611704730314437995/ (developer "features you may have missed")
- [9] https://steamcommunity.com/sharedfiles/filedetails/?id=437804617 (developer combat guide)
- [10] https://steamcommunity.com/sharedfiles/filedetails/?id=441697736 (modding guide)
- [11] https://steamcommunity.com/sharedfiles/filedetails/?id=424475587 (new ship component guide)
- [12] https://steamcommunity.com/stats/344840/achievements/

**Steam discussions**
- D-RTS: /594820656478651053/
- D-campaign: /523890681410896145/
- D-PD: /530647080134391327/
- D-fuel: /611703999973435561/
- D-posneg: /611703999980192094/
- D-GSB1or2: /523890681404277975/
- D-shouldbuy: /365163686055347141/
- D-shields: /3454730619114989459/
- D-servers: /2141966124580319764/
- D-first: /611703999966005051/
- D-campdiff: /487876568242154639/
- All under https://steamcommunity.com/app/344840/discussions/0/

**Steam user reviews**
- Format: https://steamcommunity.com/profiles/<id>/recommended/344840/
- U-Snowman = 76561197985900913
- U-15426473 = 76561197963408025
- U-19312924 = 76561197972608891
- U-19536474 = 76561198025394314
- U-15409493 = 76561197972054384
- U-30480512 = 76561197974493059
- U-43195182 = 76561197987565903
- GH-review 2011 (GSB1 direct control): public review dataset at https://github.com/fluffywaffles/349-project (data/reviews/41800.csv)

**Developer blog** (base URL https://www.positech.co.uk/cliffsblog/)
- [13] 2015/02/03/gratuitous-space-battles-2-the-brand-new-ship-classes/
- [14] 2015/02/01/a-preview-of-space-ship-design-in-gratuitous-space-battles-2/
- [15] 2015/01/20/finally-realized-i-need-to-explain-the-core-mechanics/
- [16] 2014/04/16/redesigning-formation-orders-in-gsb2/
- [17] 2015/05/05/musing-on-space-battle-tactics-and-improving-the-escort-order/
- [18] 2015/11/25/indie-game-developers-move-on-or-they-fail/
- [19] 2015/04/16/gratuitous-space-battles-2-is-released-right-now/
- [20] 2015/04/21/fixed-the-low-hanging-bugs-pause-for-breath/
- [21] 2015/05/16/working-on-a-battle-simulator-custom-scenario-thing/
- [22] 2015/02/27/gratuitous-space-battles-beta-1-18-update/
- [23] 2015/02/13/gsb2-design-mode-composites-pre-built/
- [25] 2015/08/02/coding-the-gsb2-radiation-effect-directx9-c/
- [26] 2014/02/19/gratuitous-space-battles-2-lighting/
- [27] 2014/04/08/gsb-2-shields/
- [28] 2014/12/06/on-programming-decent-2d-game-explosions/
- [29] 2015/01/04/the-gsb2-engine-optimizing-post/
- B-toomuch: 2014/12/28/too-much-stuff-on-screen/
- [30] 2014/06/12/gsb2-multithreading-a-single-frame-so-far/
- [32] 2014/09/15/optimizing-dilemma-of-the-day/
- [33] 2014/04/27/goodbye-specular-lighting-stuff/
- [34] 2014/05/25/gratuitous-space-battles-2-planet-image-update/
- [36] 2014/02/28/yay-depth-sorting-kinda/
- [39] 2015/04/04/supporting-modded-content/
- [40] 2015/03/27/big-pharma-update-gsb2-trading-cards/
- [41] 2015/07/12/gratuitous-space-battles-gets-custom-textures/
- B-beta: 2015/02/06/gratuitous-space-battles-2-is-in-beta-at-last-right-now/
- [43] 2025/08/15/designing-the-orders-system-for-ridiculous-space-battles/

**Positech forum** (https://forums.positech.co.uk/t/<id>, which redirects to the topic)
- 6982, 7828, 7899, 7948, 7961, 7967, 7978, 8013, 8025, 8031, 8032, 8033, 8072, 8080, 8107, 8123, 8126, 8171, 8186
- 8209, 8222, 8228, 8230, 8237, 8238, 8244, 8252, 8260, 8275, 8276, 8288, 8302, 8310, 8311, 8317, 8330, 8350, 8353, 8357, 8362, 8387
- 8407, 8410, 8417, 8441, 8453, 8466, 8483, 8486, 8487, 8494, 8497, 8504, 8506, 8510, 8535, 8537, 8538, 8544, 8558, 8595
- 8677, 8834, 8843, 8875, 8941, 8955, 9093
- F-support 8211 is also a forum topic.
- W-yurch (GSB1 orders semantics): https://gratuitousspacebattles.fandom.com/wiki/Gunnery_and_Dying_last:_Defense_on_a_budget_by_yurch

**Press**
- R1: https://www.pcgamer.com/gratuitous-space-battles-2-review/ (Ian Dransfield, 59/100, April 24, 2015)
- R2: https://www.metacritic.com/game/gratuitous-space-battles-2/
- R3: https://www.gog.com/en/game/gratuitous_space_battles_2
- R4: https://www.rockpapershotgun.com/gratuitous-space-battles-2-released
- R5: https://powerupgaming.co.uk/2015/05/18/gratuitous-space-battles-2-review/
- R6: https://gamingshogun.com/2015/05/03/gratuitous-space-battles-2-review-pc/
- R7: https://www.chalgyr.com/2015/05/gratuitous-space-battles-2-pc-review.html
- R8: https://www.spacegamejunkie.com/reviews/gratuitous-space-battles-2-review-battles-blasts-bugs/
- R9: https://www.pcgamesn.com/gratuitous-space-battles-2/cliff-harris-gratuitous-space-battles-2-its-whole-new-world
- R10: https://www.pcgamesn.com/gratuitous-space-battles-2/gratuitous-space-battles-2-you-can-fill-space-with-searing-neon-death
- R11: https://en.wikipedia.org/wiki/Gratuitous_Space_Battles

**Caveats**
- PC Gamer, Metacritic and several blog pages were read through automated text extraction, not a browser.
- Community stats are player measurements, not official numbers.
- The official site gratuitousspacebattles2.com is now a parked domain, and the Wayback Machine was unreachable from here, so the old official manual and modding pages could not be checked.
