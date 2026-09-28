# Nadir Point: design and build plan

Draft 2, 2026-09-28. This plan draws on the five research reports in [`docs/research/`](research/README.md) and on seventeen decisions by the project owner. Draft 2 adds the answers to the open questions. Section 2 is decided. Everything else is a proposal until we build it and test it.

---

## 1. The game

Nadir Point is a free browser game about designing warships and watching them fight. You command one navy's fleet in a war that has run for thirty years. You design ships from modules on physical mounts, set each ship's doctrine, deploy the fleet, and watch the battle. You cannot steer ships, but you can send a few fleet signals. Losses carry over. A destroyed ship is gone, a dead captain stays dead, and damage costs time and money to repair.

The camera looks down at a slight angle, with tilt-shift blur at the top and bottom of the screen, so the battle looks like a model on a table. The frame is grey, black and bone. Colour is used only for weapons fire, fire, faction markings and one UI accent. The text reads like Cold War naval paperwork.

The gameplay model is Gratuitous Space Battles 1 and 2 (Positech, 2009 and 2015). The look comes from Beta Decay (Rotoscope Studios) and the tone from Deck & Conn (Funtime Electrics, 2026).

---

## 2. Decisions made (owner, 2026-09-28)

| Topic | Decision |
|---|---|
| Audience | Free web game on its own site |
| Online | Async challenges: players share fleets, and other players fight them locally |
| Devices | Desktop only: mouse or trackpad, plus keyboard |
| Art source | Code-built 3D for ships, modules and effects. AI images for backgrounds, portraits, insignia and UI illustration. |
| Meta loop | Tour of duty: 8–12 battles with a persistent fleet. Scenarios and challenges sit beside it. |
| Control in battle | Command signals only. No unit control. |
| Tone | Cold War paperwork: terse, dry gallows humour, no gore, losses stick |
| Factions | 3 at launch, each with different rules |
| Setting | Two human blocs in a Cold War that went hot, plus one alien power |
| Ship designer | Physical mounts in hull zones. Mount position matters in play. |
| Battle size | 40–80 ships a side plus strike craft, about 300–500 units |
| Name | Nadir Point. Faction and world names stay as working names for now. |
| Hosting | Vercel, for the game and the challenge server |
| Reference machine | A 13-inch MacBook Pro with Apple M1 (§8) |
| Choir tour | At launch |
| Image model | Owner delegated the choice: GPT Image 2.5 (§7.8) |

---

## 3. What the research tells us to fix or keep

| Finding | Source | Our response |
|---|---|---|
| GSB's targeting was opaque. Its designer, Cliff Harris, called it "a completely opaque system that nobody understood" (2025). | [gsb1](research/gsb1.md) §4, §10 | Pillar 1: every result has a readable cause. |
| GSB battles did not replay the same way, so there were no replays. Harris listed this as a mistake in 2010. Ridiculous Space Battles (RSB) made its sim deterministic in 2026. | gsb1 §6, [rsb](research/ridiculous-space-battles.md) §2 | Deterministic sim from day one. Replays and challenges depend on it. |
| Module position had no effect in GSB1. GSB2's visual editor was cosmetic. | gsb1 §2, [gsb2](research/gsb2.md) §3 | Physical mounts: fire arcs, armour per facing, a protected core. |
| PC Gamer said GSB2's races had "negligible differences". | gsb2 §6 | Three factions with different rules, not percentage bonuses. |
| GSB2 had thin content, players unlocked everything in hours, and one exploit (tractor beams on dreadnoughts) won most fights. It has 36.7% positive Steam reviews; GSB1 has 72.7%. | gsb2 §9 | Content defined as data, a nightly balance harness, and an alien faction that punishes one-weapon fleets. |
| In GSB1, "ship spam" beat careful design, and players stacked capital ships into dense blobs. | gsb1 §8, §10 | Hard collision radius (no stacking), explosion shock waves, supply limits per scenario. |
| RSB's fixed movement lanes are the top complaint from GSB fans on its forum. | rsb §5 | Free 2D movement with formations. No lanes. |
| Having no control during battle is the most common complaint in GSB1's negative Steam reviews (43 of 230 sampled). | gsb1 §8 | Command signals, short battles, fast default speed, and skip-to-result. |
| Harris: "The tutorial is weak, and the learning curve too steep" (2010). | gsb1 §8, §10 | The tutorial is part of the first playable build, not the last. |
| GSB1's online features died with its servers, and that broke its campaign. | gsb1 §6 | The whole game works offline. Challenges also travel as share codes. The server is optional. |
| Deck & Conn's grimness comes from setting, voice and consequence, not difficulty. Players also call it "cozy". | [look-tone](research/beta-decay-and-deck-and-conn.md) §B4–B5 | Grim goes into the rules (attrition) and the text (paperwork), not into gore. |
| Beta Decay's press kit gives its colours as "Grey, Black, White". Accent colour covers under ~1% of the frame in 13 of 14 store shots. | look-tone §A3–A4 | Rationed colour (§7). |

---

## 4. Design pillars

1. **Every result has a readable cause.** Click any ship, in battle or in the replay, to see its target, why it chose that target, its hit chance, and where its damage went. The after-action report names the three largest causes of the result.
2. **Design choices show on the ship and matter in play.** A bow module faces forward, fires forward and takes bow hits. Armour is plate you can see.
3. **Losses stick.** Ships, captains and crews persist through a tour. Each battle's cost carries into the next.
4. **Three navies, three rule sets.** Each faction changes how a battle works, not only its numbers.
5. **No single answer.** Every strong fleet has a counter, and the balance harness checks this every night.

---

## 5. Structure of play

### 5.1 Modes

| Mode | What it is |
|---|---|
| **Tour of duty** | The main mode. A campaign of 8–12 engagements with one persistent fleet (§5.2). |
| **Exercises** | Fixed scenarios, as in GSB. Score is the budget you did not spend on a win, as in GSB's "honour" and RSB's "smallest fleet". They teach the systems and earn merit. |
| **War College** | A sandbox. Any fleet against any fleet, with a scenario editor. Used to test designs. |
| **Challenges** | Fight a fleet another player built. Beat it, and your winning fleet is attached as a reply, as in RSB's "retaliation" (§5.5). |

### 5.2 Tour of duty

**The loop**

1. **Dispatch.** Fleet Command sends coded orders. A front map shows 2–3 reachable engagements. Each shows its type (patrol, convoy escort, strike, defence, relief), tonnage cap, intel quality and reward.
2. **Port.** Between engagements you use three screens:
   - **Yard:** repair, refit, build new hulls from unlocked designs, or scrap ships.
   - **Personnel:** assign captains, read their files, fill crews.
   - **Intel:** read the sensor picture of the next enemy.
3. **Engagement.** Deploy ships up to the tonnage cap. The rest stay in reserve. The battle runs, and you can send command signals.
4. **Aftermath.** It depends on who holds the field:
   - **You hold the field:** recover your crippled ships. Take enemy crippled ships as prizes, which costs a prize crew, or scuttle them for salvage.
   - **You withdrew:** your crippled ships are lost.
   - **Either way:** an after-action report prints on teletype paper, with losses, the KIA list, commendations and the causes of the result.
5. **Advance.** Time passes, and damaged ships spend engagements in the yard. Command reviews your record and sets your next Requisition grant.

**End of a tour**

- **Win:** after 8–12 engagements the front moves, and your commander is promoted and retires.
- **Loss:** your fleet falls below a minimum, or Command relieves you because your record is too poor. A Board of Inquiry report closes the tour.
- **Every tour:**
  - The service record goes to the **Admiralty Archive**.
  - Dead captains go on the **Memorial**, which lists the dead from all tours.
  - **Merit** unlocks hulls, modules and doctrines for future commanders. Unlocks come slowly on purpose, because GSB2 players unlocked everything in a few hours.

**Resources in a tour**

| Resource | Where it comes from | What it pays for |
|---|---|---|
| Requisition | Command's grant after each engagement: more for wins and objectives | Repairs, refits, new hulls |
| Salvage | Scuttled enemy ships and wreck fields you hold | Cheaper refits; captured enemy modules you can study to unlock them |
| Crew | Replacement drafts each engagement (green); survivors gain experience | Crewing ships, prize crews |
| Yard time | Yard slots | Repairs and builds take a number of engagements |
| Command Points (CP) | Flagship command module and admiral rank | Signals in battle |

**Captains and crews**

- Every ship larger than a strike craft has a named captain with a portrait, a personnel file, a rank, experience, and one or two traits.
- Traits change doctrine in small, visible ways. For example, "Stubborn" makes a captain withdraw at a hull threshold 10% lower than the setting.
- Captains gain experience and small bonuses. If their ship is destroyed, an escape roll decides whether they live. Death is permanent.
- Each ship's crew has a grade: green, trained or veteran. The grade changes fire rate, repair speed and damage control. When a veteran ship dies, you lose more than its price. Replacement crews arrive green.
- Command may promote your best captain away from your fleet. You can refuse once per tour, at a cost in standing. One Deck & Conn reviewer disliked this mechanic, so we test it before we keep it.

### 5.3 Battle rules

**Map and movement**

- The battle is on one 2D plane, for example 8,000 × 5,000 m. Engagement type sets the size.
- Movement is free. Thrust, turn rate and top speed come from mass and engines.
- Every ship has a hard collision radius and steers to keep its distance, so ships cannot stack.
- **Formations:** a group follows a leader. If the leader dies, the group chooses a new one (GSB2).
- Height is for looks only. Capital ships sit a little higher and strike craft lower, so the diorama has layers. The sim stays 2D.

**Deployment**

- Free placement inside your zone, with formation templates as helpers: line, wedge, screen, column.
- The enemy fleet shows as a sensor picture. Its quality depends on your intel: exact designs, ship class only, or blips with an error circle.
- An overlay shows how each of your groups did in the last battle, an idea taken from RSB.

**Doctrine** (replaces GSB's order list)

Doctrine is set for each ship or group.

| Setting | Choices |
|---|---|
| Role | Line, Screen, Strike, Support, Reserve |
| Engage at | Short, optimal (worked out from the weapons), long, or a set distance |
| Target priority | An ordered list of up to 3 criteria: ship class; defence state (shields up, armour broken, crippled); threat to this ship; "marked by signal" |
| Withdraw at | A hull percentage, or Never |
| Formation | A leader and a slot, or none |

- The designer shows a plain summary of the doctrine, for example: "Engages cruisers first at 1,800 m. Switches to strike craft inside 600 m. Withdraws below 30% hull."
- Each weapon picks its own target inside its arc, in the ship's priority order. It skips targets it cannot damage. GSB2 worked this way too, but here the player can see it.

**Command signals**

| Signal | Effect | Cost |
|---|---|---|
| Concentrate fire | Mark one enemy. Every ship that can reach it puts it first for 30 s. | 1 CP |
| Advance / Hold | All Line ships close to short range, or stop and hold position | 1 CP |
| Release reserve | Reserve ships join the battle | 1 CP |
| Recall strike craft | Strike craft return to their carriers | 1 CP |
| General withdrawal | All ships run for your edge. The battle ends when they escape or die. | 2 CP |

- A fleet has 3–6 CP per battle.
- Signals go out from the flagship and take 1–3 s to reach each ship, depending on distance.
- Ships with a destroyed comms module do not get signals, and neither do ships out of range.
- If the flagship dies, the fleet sends no signals until the next-senior captain takes command, 20 s later.

**Hit chance**

- Hit chance compares the weapon's tracking with how fast the target crosses its line of sight, then scales by target size and range.
- A target that flies straight at a gun is easy to hit. A fast target crossing the gun's line of sight is hard to hit.
- The curve is smooth, with no cliff. GSB1 fell to a flat 2% chance when a target was faster than the weapon's tracking.
- The exact formula is published in the in-game Naval Register (§6).

**Damage**, in the order a shot meets it:

1. **Shields** (Directorate and Choir only). A shield is a pool with a resistance value. Damage below resistance loses most of its effect, but not all. Shields recharge, and a collapsed shield restarts after a delay.
2. **Armour.** Each facing (bow, port, starboard, stern) has its own thickness, and a hit strikes the facing that points at the shooter.
   - If penetration is equal to or more than thickness, full damage goes through and the plate wears away.
   - If penetration is less, damage falls off smoothly (for example by (penetration ÷ thickness)²), and the plate still wears.
   - No ship is immune. GSB1 player guides found that average armour of 73 or more stopped every weapon in the game, except rare critical hits.
3. **Structure and modules.** Damage that gets past the armour hits structure and a module in that zone. A destroyed module stops working, and its status light goes dark. Hits to internal zones kill crew.
4. **Crippled or destroyed.** A ship is crippled when its structure reaches 0 or it loses its reactor or bridge. A crippled ship's drive is dead, it drifts, and it cannot fire. It can be finished off, captured or recovered. Sometimes a reactor loss makes the ship explode instead, and the shock wave damages nearby ships (GSB did this too). That punishes blobs.

**Heat**

- Weapons and shields make heat, and radiators remove it.
- Above 100% heat a ship cuts its fire rate. Above 130%, its modules take damage.
- Radiators glow on the model.
- This separates burst designs from sustained-fire designs.

**Weapon families**

| Family | Strong against | Weak against | Main users |
|---|---|---|---|
| Kinetic (autocannon, mass driver, flak) | Armour; cheap | Loses damage at range; heavy ammunition | Compact |
| Energy (laser, beam) | Shields; accurate | Heat and power cost | Directorate, Choir |
| Missiles and torpedoes | Long range, burst damage | Point defence, ECM, limited magazines | Directorate |
| Strike craft (fighters, bombers, drones) | Reach; flexible | Grounded when their carrier dies, because they need its fuel (GSB2 rule) | Directorate, some Compact |
| Support (point defence, ECM, tractor, target painter, repair tender, shield projector) | Make other ships stronger | Do no damage; stacking is limited | All |

**End of battle**

- A fleet **breaks** when its losses pass its break point, by default 50–60% of the value it deployed. Doctrine and admiral traits move this point. A broken fleet withdraws.
- A **General withdrawal** signal ends the battle early.
- **Time limit** (for example 8 minutes of battle time): the side with more surviving value holds the field.
- The side that holds the field recovers wrecks and takes prizes.
- Target length: 2–4 minutes at the default 2× speed. Speeds run from ¼× to 8×, with pause and skip-to-result.

### 5.4 Factions and setting

**Setting sketch**

- The two human blocs split while settling the colonies. Their cold war over the Nadir system turned hot thirty years ago, and nobody remembers the first shot. Both navies run on forms, codes and rationed spare parts.
- A third power appeared at Nadir, and neither bloc understands it. Each bloc's propaganda says it is the other side's secret weapon.
- The faction names below are working names. The lore is still open.

**The three factions**

| Faction | Doctrine | Different rules | Weakness |
|---|---|---|---|
| **The Compact** (human bloc A; the first navy the player serves) | Armour, guns, damage control. Heavy, slow hulls, built like battleships. | No shields at all. Thick armour per facing. Damage-control teams use crew to repair armour and modules during battle. Crew grade matters most here. | Slow; short to middle range; weak against missile saturation and flanking |
| **The Directorate** (human bloc B) | Missiles, carriers, electronic warfare. Many cheap hulls. | Shields, which run hot. Salvo doctrine: missile ships that fire together saturate point defence. Drone carriers. Strong ECM and sensors, which also give better intel before battle. | Light armour; carriers are single points of failure; heat |
| **The Choir** (alien) | Beams and linked hulls | No crew, no capture, no retreat. Ships close together in formation share one defence field; break the formation and each ship weakens. The Choir **adapts**: it gains resistance to the damage type it has taken most in this battle. | Depends on formation; slow to switch targets |

- The adaptation rule is our built-in answer to GSB's single-weapon spam.
- **Launch scope:** all three factions have a tour of duty at launch.

**The Choir's tour** (proposal)

The Choir has no crew, no Requisition and no paperwork of its own, so its tour needs different rules.

- **Voice:** the Choir's tour is told through the enemy's paperwork. Your briefings are human intelligence reports: intercepts, partial decodes and analysts' guesses about what the Choir wants. The analysts are often wrong about you.
- **Names:** your ships have no names you can read. The human navies give each one a reporting name, for example `GRAVEL-7`, and that name is what the reports call it.
- **Resources:**
  - **Lattice** replaces Requisition and salvage. You absorb it from wrecks on a field you hold.
  - **Growth time** replaces yard time. Damaged ships regrow slowly between engagements. New hulls grow from Lattice.
- **What persists:** each ship keeps the adaptation it earned in battle for the whole tour. When that ship dies, its adaptation dies with it.
- **The enemy adapts too:** human fleets shift their weapon mix toward what beats you. GSB's Galactic Conquest used a similar "reactive arms race" for its campaign AI.

### 5.5 Challenges

- A challenge is a fleet file: sim version, faction, designs, deployment and doctrine. It travels as a share code, and optionally through our server.
- Your score for a win is the cost of your fleet. Lower is better, and losses count against you.
- **Retaliation:** beat a challenge and your winning fleet becomes a reply that others can fight (RSB).
- **Fairness:** in GSB the responder always saw the fixed enemy deployment, which gave them a large advantage. A challenge can therefore be **open**, where you see the enemy deployment, or **blind**, where you see only a sensor picture.
- The server re-runs every submitted win before accepting it. Determinism makes this possible.

---

## 6. Ship designer

**Hulls and mounts**

- **Hull classes:** strike craft (carrier-borne), frigate, destroyer, cruiser, capital.
- **Zones:** Bow, Port, Starboard, Stern, Dorsal (the turret deck), and Core (internal).
- **Mount sizes:** S, M or L. Capital ships add one Spinal mount.
- **Mount types:**
  - Hardpoint (external): weapons, point defence, sensors.
  - Internal: reactor, crew, magazine, bridge, damage control.
  - Engine.
- **Fire arcs:** the hull sets each hardpoint's arc, and the designer draws it.
- **Armour** is not a module. You set plate thickness for each facing. Plate adds mass and cost, and the model shows it as layers.

**Budgets**

| Budget | Rule |
|---|---|
| Power | Reactor output must meet or exceed power draw |
| Mass | Sets speed and turn rate, together with the engines |
| Cost | Paid in Requisition |
| Heat | A gauge shows the sustained heat balance |

Crew is shown for each ship, but it is a fleet resource in a tour, not a design limit. RSB removed crew and power limits as "more annoying than fun". We keep power because it forces real trade-offs, and we move crew to the tour, where losses matter.

**What the designer shows**

- Every module shows on the model: turret, launcher, radiator, dish.
- Each module has one status light: lit means working, dark means destroyed. This comes from Beta Decay's small status LEDs.
- Live readouts: speed, turn rate, damage per second by damage type and by arc, effective armour per facing, heat balance, a range chart, and the doctrine summary.
- A **Test in War College** button runs the design against an opponent you choose, at high speed.
- **Naval Register:** an in-game database with every module's exact numbers and every formula. Beta Decay keeps a public database of this kind on its website.

**Content targets**

| Content | First playable (M1) | Launch |
|---|---|---|
| Hull classes | 3 (frigate, destroyer, cruiser) | 5 |
| Hulls | 4 | about 30, across 3 factions |
| Modules | about 15 | about 100 |
| Doctrine | Role, range, priority, withdraw | Full list plus formations |

For scale: GSB1's Steam page lists over 40 hulls and over 120 modules. Reviewers criticised GSB2 for having less.

---

## 7. Look and sound

### 7.1 Camera and tilt-shift

- The camera uses perspective with a low field of view, about 15–30°, pitched about 50–65° down. We tune the exact numbers in M0.
- Blur grows toward the top and bottom of the screen. Held et al. (2010) found that a linear blur gradient closely matches real tilt-shift in a roughly flat scene, and a battle on one plane is that case.
- The sharp band moves with the zoom. The player can reduce the blur or turn it off.
- Fast motion strengthens the miniature effect, so the default battle speed is 2×.

### 7.2 Palette, following Beta Decay's rules

- Hulls, space and UI run from charcoal to bone, about `#0b0b0b` to `#8d958a`. Text is bone, not pure white.
- Colour is spent only on:
  - weapons fire;
  - fire and damage;
  - faction markings (thin stripes, running lights);
  - one UI accent (amber for the player).
- Target: accent colour covers no more than about 2% of a normal battle frame. A test measures this.
- The whole frame is graded to show state:
  - sensor-green monochrome for deployment and intel;
  - neutral for battle;
  - oxblood when the flagship is critical or the fleet withdraws.
- Friend and foe must read in greyscale too, through shape and markings. We test with greyscale and colour-blind filters.

### 7.3 Ships and surfaces

- Hulls are slab-sided and industrial, with stacked panels, braces and pods, like Beta Decay's mechs.
- Each faction has its own silhouette:
  - **Compact:** long and slab-armoured.
  - **Directorate:** boxy, with open-frame carriers and launch racks.
  - **Choir:** the only non-industrial shapes. Their exact form is not decided.
- Geometry is smooth, but trim textures are low-resolution and nearest-filtered, so texels show. Hazard stripes are rare. Barrels carry painted bands.
- Damage shows on the hull in stages: scorch, then stripped plate, then exposed frame, then fire and venting.

### 7.4 Effects

- White-hot dashed tracers.
- Small red and pink spark impacts.
- Orange flame with embers and white smoke.
- Beams as thin, hard lines.
- Explosions light nearby hulls.

### 7.5 Post-processing and backgrounds

- **Post-processing order:** tilt-shift blur, then bloom (small lights only), then colour grade, then film grain, then vignette, then a faint screen-mesh texture. No strong chromatic aberration.
- **Backgrounds:** no bright nebulae. Grey dust layers sit below the battle plane, with wrecks and station silhouettes far below, blurred by depth, and a grey planet edge.

### 7.6 UI, after Deck & Conn and Beta Decay

- Dense monospace text, 1 px borders, near-opaque black panels, letter-spaced capitals, dashed corner brackets on targets, and an amber accent for the player.
- Paper inside the fiction:
  - dispatches as coded orders;
  - after-action reports as teletype printouts;
  - personnel files with ID-photo portraits;
  - the KIA board.
- The battle HUD stays minimal. Ship labels are small chips with the distance, like Beta Decay's target brackets.

### 7.7 Sound

Equipment hum, relays, teletype, switch clicks and clipped radio text. Very little music. One Deck & Conn reviewer called it "very light on music".

### 7.8 AI-generated art

| Use | Method |
|---|---|
| Backgrounds: planet edges, wreck silhouettes, dust | Image model, then our shaders |
| Captain portraits | Image model; desaturated ID-photo style with grain |
| Insignia, posters, paper textures | Image model, cleaned up in code or by hand |
| Hull trim and panel texture atlas | Image model, made tileable |
| Ship hulls, modules, effects, UI chrome | Code only; no AI images |

- Each asset type gets one reference set and one prompt template. We normalise the palette after generation, and the in-game colour grade unifies the rest.
- A provenance log records the tool, model, prompt and date for each AI asset.
- We disclose AI use on the game's About page. Our own site has no disclosure rule, but we follow the practice of the stores. For example, itch.io requires disclosure for asset packs and encourages it for games ([itch.io, 2024-11-20](https://itch.io/t/4309690/generative-ai-disclosure-tagging)).

**Model choice: OpenAI GPT Image 2.5** (the owner delegated the choice)

| Question | Answer |
|---|---|
| Why this model | It ranks first on both public image leaderboards we checked: [LMArena text-to-image](https://arena.ai/leaderboard/text-to-image) (blind human votes, updated 2026-09-24): Sunburst 1424, Flare 1401, GPT Image 2 1383, next best from another company 1335. [Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/text-to-image) gives the same top three. |
| Which variant | `gpt-image-2.5-flare` for drafts and volume. `gpt-image-2.5-sunburst` for final assets and edits made against reference images; OpenAI built it for "tighter control across edits" ([9to5Mac, 2026-09-08](https://9to5mac.com/2026/09/08/openai-releases-chatgpt-images-2-5-with-sharper-details-and-more-precise-editing/)). |
| Rights | OpenAI's terms assign output rights to the user "if any" ([terms](https://openai.com/policies/row-terms-of-use/)). |
| Cost | Artificial Analysis lists about $211 per 1,000 images at maximum quality. With iterations, we expect roughly 500–1,500 images, which is about $100–$320. |
| Tileable textures | The API has no tiling switch. We make textures seamless by offsetting each image and asking the model to repaint the seams. |
| Confidence | Moderate-high that it gives the best single images; moderate that it keeps one style across hundreds of assets. Leaderboards do not measure style consistency. |

- **Bake-off before volume work:** at the start of M5 we make the same 6 test assets (2 portraits, 2 backgrounds, 1 insignia, 1 trim texture) with GPT Image 2.5, Nano Banana 2 (up to 14 reference images) and FLUX.2. We keep GPT Image 2.5 unless another model wins clearly on our own look tests.
- **Setup needed:** an OpenAI API key, stored as an environment secret, and network access to `api.openai.com` from the build environment.

---

## 8. Technology

| Layer | Choice | Confidence |
|---|---|---|
| Language and build | TypeScript, Vite | High |
| Renderer | three.js r186+ `WebGPURenderer` with automatic WebGL2 fallback, TSL shaders, `RenderPipeline` post-processing | Moderate-high |
| UI | DOM overlay with Svelte 5 | Moderate |
| Simulation | Deterministic, fixed 30 Hz tick in a Web Worker, rendered with interpolation. Struct-of-arrays data. Seeded random numbers. Our own trig functions. Only `+ − × ÷` and `sqrt` in sim code. | High for the architecture, moderate for the float approach |
| Spatial queries | Uniform grid or spatial hash, rebuilt every tick; large ships inserted by radius | High |
| Worker to renderer | Transferable snapshot buffers. No `SharedArrayBuffer`. | High |
| Saves | IndexedDB, plus export and import files | High |
| Share format | Fleet code: sim version, faction, designs, deployment and doctrine, compressed and base64url-encoded | High |
| Hosting | Vercel: a static site, with a preview URL for every push that you can open on your MacBook | High |
| Challenge backend (M6) | Vercel Functions, with Vercel Blob for fleet files and a Postgres database from the Vercel Marketplace for indexes and scores. The server re-runs each submitted win to verify it. | Moderate; we confirm the storage products at M6 |
| Tests | Vitest for the sim; golden replay hashes; cross-browser determinism on Chromium, Firefox and WebKit through Playwright; screenshot tests for the look rules; a check on the owner's MacBook in Safari and Chrome at the end of each milestone | High |
| Balance | A headless Node harness that runs random and seeded fleets round robin, reports win rate and cost efficiency per module, and flags dominant designs | High |

**Why these choices** (details in [tech-stack](research/tech-stack.md))

- **WebGL2 fallback:** WebGPU reaches about 86% of users and WebGL2 about 96% (caniuse, Sept 2026). three.js serves both from one shader codebase.
- **Batched drawing:** three.js's WebGPU backend is slow with many separate meshes (issue #30560, still open). So we draw every ship and module through batched or instanced meshes, and each design bakes to one merged mesh when it is saved.
- **Own trig:** JavaScript's `Math.sin`, `Math.tanh` and similar functions can return different results in different browsers and operating systems. Chrome 148 moved `tanh` to the OS maths library, for example. So the sim uses its own trig.
- **No `SharedArrayBuffer` by default:** it needs special cross-origin headers, and Safari does not support the lighter `credentialless` variant. Vercel can send the headers if profiling ever demands it.

**Reference machine: a 13-inch MacBook Pro with Apple M1**

- **Floor:** the owner's machine, a 13-inch MacBook Pro with Apple M1 and its built-in 8-core GPU. Newer MacBooks have headroom.
- **Browsers:** Safari and Chrome on macOS. Safari has WebGPU only on macOS 26 and later (caniuse), so older macOS versions use the WebGL2 path, and that path must meet the budget too.
- **Retina screens:** the 3D scene renders at a capped pixel ratio, about 1.25× the CSS size, with blur passes at half resolution. The UI text renders at full Retina sharpness.
- **Long load:** the M1 MacBook Pro has a fan, so it holds its speed better than a fanless Air. We still measure the budget over a 10-minute battle, not over a short burst.
- **Trackpad:** pinch to zoom, two-finger drag to pan, and click-and-drag for box selection, together with mouse and keyboard.

**Performance budget** (on the floor machine)

| Item | Budget |
|---|---|
| Units | 160 ships, 300 strike craft, 3,000 projectiles |
| Sim tick | 6 ms or less at 30 Hz, in the worker |
| Render | 60 fps in a full-screen browser window, sustained over a 10-minute battle |
| Draw calls | Fewer than 200 per frame |
| Download before the first battle | Less than 15 MB |

---

## 9. Build order

Each milestone ends with something playable and a test that proves it works. Sizes are relative; the order matters more than dates.

**Status (2026-09-28)**
- **M0: done.** Determinism passes in Chromium, Firefox and WebKit (CI) and in Safari on the owner's MacBook. Chrome on the MacBook ran the M0 bench at p99 11.8 ms. The Safari bench on the built-in Retina screen is deferred at the owner's request; the `?bench=600` mode stays in the build for it.
- **M1: built; waiting on the owner's playtest.** Rules in `docs/design/m1-rules.md`. The exit loop (lose Exercise 1, read cause 1, refit, win on the same seed) passes as an automated browser test (`e2e/lesson.spec.ts`) and as balance guards in the unit tests. Not in M1 yet: manual ship placement (auto-deploy only) and extra tutorial exercises; both move to M2.

| # | Milestone | Contents | Exit test |
|---|---|---|---|
| M0 | Foundations | Repo, Vite and TypeScript, CI. Vercel project with a preview URL for every push. Sim worker with fixed tick, seeded random numbers and our own trig. Golden-hash replay test. three.js scene with the tilt-shift camera, post chain and trackpad controls. | The same battle gives the same hash in Chromium, Firefox and WebKit. 500 grey boxes move at 60 fps on the owner's MacBook in Safari and Chrome. |
| M1 | First fight | Compact only; frigate, destroyer and cruiser; about 15 modules. Mounts, arcs, armour per facing, module status lights. Hit and damage rules. Doctrine (role, range, priority, withdraw). Deployment and end-of-battle rules. After-action report with causes. Ship inspector that shows "why". Code-built placeholder art in the final palette. Tutorial exercise 1. | A new player designs a ship, loses, reads why, changes the design and wins. We test this with the owner. |
| M2 | Depth | Full designer UI and Naval Register. Formations. Command signals and the flagship. Heat. Strike craft and carriers with fuel. The Directorate, with shields, missiles, ECM and the sensor picture. War College. Share codes. Balance harness v1. | The harness finds no design above an agreed win rate across the test pool. |
| M3 | Tour of duty | Front map; port (yard, personnel, intel); persistence; Requisition, salvage, crew and yard time; captains with traits and portraits; prizes and scuttling; dispatches and teletype reports; end of tour, Archive, Memorial and merit unlocks; Exercises with scoring; tutorials 2–3. | The owner completes a tour, and losses change later decisions. |
| M4 | The Choir | Alien faction with linked formations and adaptation. The Choir's tour: intelligence-report voice, reporting names, Lattice, growth time, persistent adaptation, adapting human enemies. Alien incursions in human tours. Choir art. | The harness shows adaptation beats single-weapon fleets and loses to mixed fleets. The owner completes a Choir tour. |
| M5 | Art and sound | Image-model bake-off; AI pipeline and provenance log; final ship kits for all 3 factions; backgrounds; colour-grade states; audio. | The look tests pass: accent-colour share, and friend and foe readable in greyscale. |
| M6 | Online challenges | Backend on Vercel; upload and download; server re-run check; retaliation chains; smallest-winning-fleet boards. | A challenge made on one machine is beaten on another and verified by the server. |
| M7 | Release | Onboarding polish, settings, performance tiers, save export, public launch on Vercel. | A cold player finishes the first tutorial without help. |

---

## 10. Risks

| Risk | Likelihood | Response |
|---|---|---|
| Content volume: GSB2 failed partly on thin content | High | Content as data; code-generated module meshes; the harness; content grows through data, not code |
| Tilt-shift blur hides information | Medium | Blur only at the screen edges; it follows the zoom; it can be turned off; the UI sits above it |
| The desaturated look hurts readability | Medium | Shape language, markings, greyscale tests, an accent-colour budget |
| Watching is boring, the top GSB complaint | Medium | Signals; 2–4 minute battles; fast default speed; skip-to-result; strong effects |
| Cross-browser determinism breaks | Medium | Our own maths; CI on three browser engines; a sim version stamp in every file |
| Browser performance with 500 units and post-processing | Medium | Batched rendering from M0; budget tests in CI |
| RSB launches in the same genre on Nov 16, 2026 | Certain | We are different: free in the browser, a persistent tour, physical mounts, free movement, grim tone |
| AI art drifts in style or draws backlash | Medium | AI only for backgrounds, portraits and textures; fixed reference sets; a bake-off before volume work; disclosure |
| Safari lags Chrome on WebGPU and WebGL2 behaviour | Medium | Safari in the milestone check from M0; the WebGL2 path must meet the budget on its own |
| The MacBook slows down under long heavy load | Low | Budget measured over 10-minute battles; capped render scale; half-resolution blur |
| The Choir's tour doubles the campaign work | High | Share the front map, port screens and report system; the Choir changes the text and the resources, not the structure |

---

## 11. Open questions

Answered on 2026-09-28 and moved into §2:

| Question | Answer |
|---|---|
| Image generation | Owner delegated it: GPT Image 2.5, with a bake-off at M5 (§7.8) |
| Choir tour | At launch (§5.4) |
| Hosting | Vercel (§8) |
| Reference machine | A 13-inch MacBook Pro with Apple M1 (§8) |
| Names | Working names stay for now |

Still open:

1. **OpenAI API key:** needed at M5, not before.

---

## 12. Research

| Report | Covers |
|---|---|
| [gsb1.md](research/gsb1.md) | GSB1: loop, hulls, 139 modules with stats, hit formula, targeting pseudocode, orders, races, DLC, reception, the designer's own post-mortem |
| [gsb2.md](research/gsb2.md) | GSB2: every change from GSB1, damage model, orders, factions, campaign, why it failed |
| [ridiculous-space-battles.md](research/ridiculous-space-battles.md) | Positech's 2026 successor and competitor: design changes, their reasons, early reception |
| [beta-decay-and-deck-and-conn.md](research/beta-decay-and-deck-and-conn.md) | Measured palette and visual language of Beta Decay; tone and systems of Deck & Conn |
| [tech-stack.md](research/tech-stack.md) | Renderer choice, tilt-shift method, 2.5D ships, AI art pipeline, deterministic sim |
