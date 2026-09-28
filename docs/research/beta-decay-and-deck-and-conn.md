# Art direction and tone research: Beta Decay and Deck & Conn

The only game called "Beta Decay" on Steam is Rotoscope Studios' **beta decay**. It's the one to use, with a big caveat: it isn't a top-down space game. It's a first- and third-person shooter RPG with a very distinctive near-monochrome, low-poly "PS1" look, and none of its media shows ships in space. Deck & Conn is a pixel-art, turn-based command sim. Its grimness is in the setting and framing; several players actually call it "cozy".

Method: store text was pulled from the raw Steam HTML and the Steam news and reviews APIs. I looked at all 14 Beta Decay and 13 Deck & Conn store screenshots myself. Hex values are my own measurements (dominant-color quantization of each screenshot). Colours were measured with Pillow.

---

## SUBJECT A: "Beta Decay"

### A1. Candidates
| # | Title | Developer | Date/status | URL | One line |
|---|---|---|---|---|---|
| 1 | **beta decay** | Rotoscope Studios | Steam: "To be announced", "Coming Soon to Early Access". Itch devlog "Now on Steam" dated May 17, 2023. "Project Kickoff" devlog Feb 05, 2022. | https://store.steampowered.com/app/1416070/beta_decay/ · https://rotoscopestudios.itch.io/betadecay | "A dark, dystopian RPG where you can build spaceships, join factions, and fight for territory in a newly discovered star system." |
| 2 | Cherenkov (Beta Decay 2) | Emiliano Guerra (gugulplex) | "In development"; entry in the Proyectos UN-GAMES 2024-2 jam | https://gugulplex.itch.io/cherenkov | "Clock in as a janitor in a supernatural nuclear reactor!" First-person, Godot, low-poly. Not a space game. |
| 3 | Ship Decay (different name, near miss) | timothek | Discord Jam #8 | https://itch.io/jam/discord-jam-8/rate/2891059 | Jam game on a "decay" theme. |
| – | TapTap "Pre-register beta decay" listing | unknown | – | https://www.taptap.io/app/33558943 | UNVERIFIED whether this is the same game or an aggregator page. |

- A Steam search for "beta decay" returns only app 1416070 under that name (https://store.steampowered.com/search/?term=beta+decay).
- An itch search for "beta decay" returns only #2 plus unrelated games.
- **#1 is the only candidate that is a space/ship game with a notable art style.**
- Caveat on #1:
  - Starship building is labelled "(beta + decay feature)" and is "likely to arrive throughout or Post Early Access" (Steam page).
  - All store media is ground-level first- and third-person: soldiers, mechs, city.
  - **No screenshot shows a starship or space combat.**

### A2. Facts (Rotoscope beta decay)
- **Engine and tools:** Unreal Engine, Blender, GIMP, Audacity, LMMS (itch). The FAQ says the upgrade to Unreal Engine 5.8 is complete. Itch notes "No generative AI was used".
- **Studio posts are written in the first person singular** ("game development has been an on-and-off hobby of mine"). INFERENCE: probably a solo or very small team. NoobFeed says "smaller development team".
- **Latest status:** roadmap updated 9/1/2026 shows 41 of 51 features "Ready for Testing" (https://www.rotoscopestudios.com/roadmap).
- **Kickstarter:** exists (https://www.kickstarter.com/projects/712674581/1929926636), but its status and amounts are UNVERIFIED (403). indiegamesdevel lists tiers of $100k, $350k and $500k.
- **Mature content (Steam):** "Dismemberment and Excessive gore… harsh language, profanity."

### A3. Developer and store statements about the look (quoted)
- Steam page: "Mixing the old with the new." The section header reads "N O W A   A T M O S F E R A / ESTETYKA" (Polish for "new atmosphere / aesthetic").
- Steam page: "a labyrinthic metropolis that is soaked with neon lights and dense crowds… Megatenements… Megaplazas."
- **Press kit:** "Color Scheme: Grey, Black, White" (https://www.rotoscopestudios.com/presskit).
- ResetEra opening post (Dec 11, 2023):
  - "beta decay is a dystopian voxel-based RPG with a low-poly aesthetic… Re-live the LOW POLY aesthetic and core gameplay elements from the early 00's and late 90's."
  - "High tech, low life."
  - https://www.resetera.com/threads/beta-decay-dystopian-voxel-based-rpg-with-a-low-poly-aesthetic-platform-steam-release-tba.794484/
- **FAQ on anti-aliasing (TAA/DLSS):** "force-disabled by default… Many systems were designed with a pixelated visual style in mind, including font sizes, image scaling, and overall readability. For example, Terminal font sizes and display screens were carefully chosen based on what remains readable from specific in-game viewing distances." (https://www.rotoscopestudios.com/database/categories/faq)
- Itch devlog tags: "psx, ps1, voxel, voxel-art, lowpoly, low-poly, cyberpunk, pixel" (https://rotoscopestudios.itch.io/betadecay/devlog).
- indiegamesdevel (Luca Buelli, Jan 29, 2024):
  - Low-poly style "inspired by… *Aliens vs Predator 2*, *Kingpin*, and *Blood 2*."
  - City inspired by "*Deus Ex* and *Blade Runner*"; interiors evoke "*The Matrix*".
  - https://indiegamesdevel.com/beta-decay-an-ambitious-and-remarkable-dystopian-voxel-based-rpg-developed-by-rotoscope-studios/
- Press and community reaction on ResetEra, page 2 (https://www.resetera.com/threads/beta-decay-dystopian-voxel-based-rpg-with-a-low-poly-aesthetic-platform-steam-release-tba.794484/page-2):
  - "nostalgic visuals with modern lighting"
  - "all the assets have way too many polygons, it seems to mostly just be the textures on them"
  - Comparisons to EYE Cybermancy and Killzone 1/2
  - "low poly/aliasing"
- Other developer items whose content I could not read (all UNVERIFIED):
  - ModDB news "Getting that low poly aesthetic…" (https://www.moddb.com/games/betadecay/news/getting-that-low-poly-aesthetic, Cloudflare-blocked)
  - YouTube "Low Poly Aesthetic | beta decay" (https://www.youtube.com/watch?v=HnMmwz6hm38)
  - DeviantArt "Low Poly Retro Aesthetics | beta decay" (https://www.deviantart.com/betadecaygame/art/Low-Poly-Retro-Aesthetics-beta-decay-961526947, 403)
- **Steam trailers (titles only):** Early Access Teaser, Official Soundtrack – MKIII, Triptych, Siren, asyd, Pre-Alpha Teaser, Delirium, Anomaly, Exclusion Zone, Flow, Fire, Graphical Update.
- **YouTube (titles via oEmbed):** "Strata" (yERaMr2-fQc), "Pre-Alpha Gameplay 2023" (KfhMBcdJiF0), "beta decay – aerial" (iFgE93SChjE), "beta decay – informat" (CDru9VNk09Q), "MKIII" (pl25q1hyGa4). Third-party: JakeyPants, "Beta Decay Is the Most Ambitious Indie Sci-Fi Game You've Never Heard Of" (t_hModaWaAg). Video contents UNVERIFIED (YouTube served a captcha).
- **Sound:** original soundtrack tracks posted (https://www.rotoscopestudios.com/post/ost-mkiii). Genre and mood UNVERIFIED.

### A4. What the store screenshots show (my observations, with measurements)
**Palette**
- Mean saturation is 0.01–0.13 in 9 of 14 shots.
- 37–99% of pixels are darker than luminance 40/255.
- Saturated accent pixels cover **0.00–1.09% of the frame** in 13 of 14 shots.
- Dominant tones are neutral charcoals and greys: #080807, #151513, #1f1f1d, #2e2e2c, #454642, #5c5c5c, #61625d. Outdoor fog tops out around #5d5e58 to #8d958a.
- **Whole-frame monochrome tints are used as moods:**
  - Night-vision green: #041305 → #39713b (ss3)
  - Blood/oxblood red: #26090a, #371a18, accents #842424/#9c3c3c (ss6, ss9, ss12)
  - Rust-brown cockpit: #1a120f → #675849 (ss11)
- **Accents:**
  - Single acid-green LEDs on gear (ss1, ss10)
  - Orange-yellow fire, measured #e49c6c / #e46c54 (ss10, ss13)
  - Red ground glow under a firing mech (ss5)
  - Amber HUD (ss11)
- The header is a pale olive-grey moon disc (#656653 to #858774) behind a hooded silhouette.

**Lighting**
- Sparse practical lights (fluorescent strips, square wall lamps with bloom halos) against crushed blacks.
- Silhouettes lit from behind or above; interiors fall off to pure black.
- Thick volumetric fog outdoors, fading to mid-grey rather than black (ss4, ss8).

**Texture and detail**
- Mid-poly models with **low-res, blocky, point-filtered textures** and visible texels, e.g. digital-camo that reads as pixel noise (ss1, ss7, ss10).
- No anti-aliasing (confirmed by the FAQ).
- No outlines or line work; forms read by value and silhouette.

**Camera**
- Eye-level or low-angle third-person, first-person gun view (ss14), and a mech cockpit (ss11).
- **No top-down or isometric shots.**

**Mechs and vehicles (the closest thing to "ships")**
- Boxy, slab-sided, heavily greebled: stacked rectangular panels, X-braced plates, hex ports, gatling pods, missile racks.
- Cockpit cab with grid windows; thin red-and-white stripes on barrels.
- A small lit panel with CJK characters (ss12); yellow-black hazard stripes used sparingly (ss7).
- Dark gunmetal with pale grey edge highlights.

**Weapons and effects**
- Tracers are thin white-hot dash and dot lines.
- Impacts are small red/pink spark clusters (ss5).
- Jump-jet flames are orange with white smoke puffs.
- Wreck fires are bright, fairly photographic orange flame sprites with falling white embers (ss10, ss13).

**Backgrounds**
- Grey fog skies with silhouetted power lines, lattice radio towers and dead trees; ruins and concrete.
- The Steam page background is near-black with faint monospace DOS-style directory text.

**Post-processing**
- Strong vignette (ss4, ss13, ss14).
- Film grain (ss3; itch5).
- A fine mesh or screen-door texture overlay (ss1, ss13).
- Bloom on small lights.
- Depth-of-field blur (ss14; itch3).
- Chromatic aberration visible in the older itch shot (itch3, RGB fringes on floor lights).
- Letterbox frame (itch5).

**UI and typography**
- Tiny white bitmap font, e.g. "AMMO .50 BMG" with a small white-outlined ammo icon (ss1).
- Dashed corner-bracket target boxes (ss2, ss11).
- Amber vector cockpit HUD with compass tape "E 12 15 S 21 24 W", "THRL", "KPH", "TADS" (ss11).
- Environmental signage:
  - Green dot-matrix stock ticker "49.20 CENTCOM" and an amber/cream departure board "CALDERN 7 MIN / SPACEPORT 11 MIN" (ss2).
  - Widely letter-spaced tiny caps watermark "B E T A  D E C A Y | P R E - A L P H A" (ss12).
- The logo is a constructed glyph alphabet under small spaced caps "BETA DECAY" (header).
- The store text uses letter-spaced headings ("A L P H A - C E N").

**Mood:** "dark, dystopian", "High tech, low life", ruin and decay, masked and hooded figures.

**Older itch.io screenshots** look different: saturated neon (blue #273859, red "BAR" sign, orange/yellow kanji lanterns, #825f35). INFERENCE: these are earlier builds; the current Steam media is far more monochrome.

### A5. Screenshot URLs
**Steam** (all 1920x1080; prefix `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1416070/`)
- ss1 `0a0832aaa1de126f6269987fa2b30cb0d69a0235/ss_0a0832aaa1de126f6269987fa2b30cb0d69a0235.1920x1080.jpg`
- ss2 `1c8dced98b4b9ffa835c1b9a69d2371014c83f14/ss_1c8dced98b4b9ffa835c1b9a69d2371014c83f14.1920x1080.jpg`
- ss3 `20f13f861d9964291e776c867e8038f843af1898/ss_20f13f861d9964291e776c867e8038f843af1898.1920x1080.jpg`
- ss4 `271e472c715d5311a2b82b046d9e4b70c58e0598/ss_271e472c715d5311a2b82b046d9e4b70c58e0598.1920x1080.jpg`
- ss5 `3a44d059100e6e9f06c8ebab26dc0c395694d34c/ss_3a44d059100e6e9f06c8ebab26dc0c395694d34c.1920x1080.jpg`
- ss6 `55f37433dd36f0787dded5914240935904f5f885/ss_55f37433dd36f0787dded5914240935904f5f885.1920x1080.jpg`
- ss7 `5b8bef42f531e310583e9cfa7431f0eccb96876c/ss_5b8bef42f531e310583e9cfa7431f0eccb96876c.1920x1080.jpg`
- ss8 `937c68c461f7549cdeeb423be71cfe910901d961/ss_937c68c461f7549cdeeb423be71cfe910901d961.1920x1080.jpg`
- ss9 `93c2cef6a983d7b2ed4469c363d6364e5773abb0/ss_93c2cef6a983d7b2ed4469c363d6364e5773abb0.1920x1080.jpg`
- ss10 `9657a61f3870863b0db4494cabae5ff91f424503/ss_9657a61f3870863b0db4494cabae5ff91f424503.1920x1080.jpg`
- ss11 `c0513688835d36fccbf9ae25dcffd54cb6f6449b/ss_c0513688835d36fccbf9ae25dcffd54cb6f6449b.1920x1080.jpg`
- ss12 `c840d7a70af4009e30ec80deb1d6dfa245baad06/ss_c840d7a70af4009e30ec80deb1d6dfa245baad06.1920x1080.jpg`
- ss13 `cd1020096af244b1a52f8d6e80fb806acb10fca1/ss_cd1020096af244b1a52f8d6e80fb806acb10fca1.1920x1080.jpg`
- ss14 `d42d3bb27eb235b32737c1bcfd62d6d31f865ca7/ss_d42d3bb27eb235b32737c1bcfd62d6d31f865ca7.1920x1080.jpg`
- Header: `…/1416070/header.jpg`; page background: `…/1416070/page_bg_raw.jpg`

**Itch**
- itch2 https://img.itch.zone/aW1hZ2UvNzIwNjYzLzE0MjkxNDQ5LnBuZw==/original/XBV7ac.png
- itch3 https://img.itch.zone/aW1hZ2UvNzIwNjYzLzE0MjkxNDQ3LmpwZw==/original/hNr2cI.jpg
- itch4 https://img.itch.zone/aW1hZ2UvNzIwNjYzLzEyMDY5OTQ2LnBuZw==/original/JHg8sK.png
- itch5 https://img.itch.zone/aW1hZ2UvNzIwNjYzLzEyMTk2NTE1LnBuZw==/original/x0rUQ8.png

---

## SUBJECT B: Deck & Conn (Steam app 3828500)

### B1. Facts
- **Developer:** Funtime Electrics, the Sydney studio of Elissa Black (co-creator of Objects in Space, Swords of Freeport and Metrocide).
- **Publisher:** MicroProse Software.
- **Released:** Sep 1, 2026 on Windows, macOS and Linux/SteamOS. Store page: https://store.steampowered.com/app/3828500/Deck__Conn/
- **Store tags:** Tactical RPG, Strategy, Turn-Based Tactics, Space Sim, 2D, Pixel Graphics, Retro, Singleplayer.
- **Reviews:** "Mostly Positive (74% of 118)" as of today. Metacritic lists no critic reviews (https://www.metacritic.com/game/deck-and-conn/).
- **Tech:**
  - Started as a pico-8 prototype, then Lua/Love2D, then "a custom C++ engine specifically to make this kind of UI-centric vintage pixel-art game" (Dev Log 1, below).
  - Runs on SDL (TechTimes).
- **Funding and team:**
  - Screen NSW seed grant announced Aug 2024; MicroProse deal announced Aug 2025 (TechTimes).
  - The developer's launch post describes "a team of just one or two people making a pixel art space game".
- **Studio slogans:** "AAA games… from 1992" (press releases). The studio site says "Triple-A Games… From 1993" (https://www.funtimeelectrics.com/).
- Patches v1.0.1 to v1.2.4 were released between Sep 2 and Sep 28, 2026 (Steam news).

### B2. Store description (verbatim)
Short description:
> "Take command of a nuclear-powered space corvette in a Cold War-flavored sci-fi campaign. Balance tactics, crew, and limited resources in a dynamic forever-war. Retro pixel art meets deep strategy fifteen minutes into the future of 1989."

About this game:
> "Deck and Conn is a retro-inspired, single-player turn-based tactics game where you command a Cold War-style nuclear corvette — in space. Set fifteen minutes into the future of 1989, the game blends pixel-art aesthetics with tactical depth, drawing from classics like early MicroProse titles and the original Super Star Trek mainframe game. Lead your crew through an endless war in deep space. Respond to distress calls, upgrade your systems, capture enemy ships, and rise through the ranks. Each decision you make — from combat strategy to crew management — shapes your ship's legacy. Whether you're navigating a full dynamic campaign or facing tightly designed standalone missions, Deck and Conn challenges you to survive, adapt, and command with precision."

Features: "Turn-based tactical combat with limited resources and system management", "Dynamic campaign with war patrols, ship upgrades, and crew promotions", "Pixel art visuals inspired by early '90s MicroProse classics", "Respond to HQ orders and make tough choices in the forever-war", "Inspired by the 1971 Super Star Trek mainframe game".

### B3. Gameplay loop and what the player does
- **Press releases** (https://www.gamespress.com/DECK-CONN-LAUNCHES-SEPTEMBER-1-2026 · https://www.gamespress.com/en-US/DECK-CONN-IS-AVAILABLE-NOW-ON-STEAM):
  - "Read coded orders, interpret incomplete sensor reports, allocate limited power, manage the ship and its crew."
  - "Start the reactor, follow the ship's departure checklist, and operate its systems through detailed, diegetic interfaces."
  - "Use active and passive sensors… respond to coded orders and distress calls."
  - "decide whether enemy ships should be captured or destroyed."
- **Developer, Dev Log 1** (Aug 18, 2025, https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1808061939465533):
  - Grid-based sectors inside a quadrant, from the 1971 Star Trek game.
  - "what if I put the kind of dynamic campaigns I enjoyed in WW2 sub or patrol boat sims atop of the core of this game?"
  - "What if power management and damage control was made more advanced? … a whole start-up procedure… from cold & dark."
- **Developer, "From EGA Trek to Deck & Conn"** (Aug 21, 2026, https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1841579228667456):
  - Two weapon types plus shields as a hard limit.
  - "magnetic hull plating (shields SST), but CIWTs defence turrets… against torpedoes."
  - Sectors were made larger so "you had a bit of time spent finding enemies before engaging them."
- **Seen in screenshots:**
  - Actions are queued, then committed with **[EXECUTE]**.
  - Panels: HELM, FTL (MARK/SPIN/JUMP/DECOIL), SENSORS (SRSCAN/LRSCAN), MAGS, ASR TURRETS (TARG/FIRE), CIWTs, torpedo tubes, REACTOR (START/STOP/**SCRAM**), BUS GEN/DRN in kW, BATTERY kWh, APU fuel in kL, a **GQ** (general quarters) switch.
  - A threat readout labelled "VERY LOW / MODERATE / DANGEROUS".
- **v1.2** (https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1844115010493880) added:
  - Dangerous FTL jumps with "higher chance of a misjump".
  - Incursions into enemy space.
  - "SOS calls from enemy and friendly vessels (some of which may be fibbing and just want you to come close so they can take you out)."
- **Campaign scope, per reviews:**
  - One ship class (the Wasp-class corvette); enemy gunboats, corvettes, frigates and destroyers.
  - A tour of duty is about 8 patrols.
  - Many reviews say content is thin and repetitive (e.g. review 234248362).

### B4. Setting, narrative framing and tone
- **Opening scene (TechTimes, Aug 17, 2026):**
  > "a newly battlefield-commissioned Lieutenant Commander who just watched your captain die in action. There is no ceremony — Commodore Chaw, cigarette in hand across a beat-up navy-issue desk… 'Get out there, Lieutenant Commander, and do your squadron proud.'"
  - Black calls the aesthetic "**Modempunk**".
  - "no sleek touchscreens, no omniscient tactical displays."
  - https://www.techtimes.com/articles/324781/20260817/objects-space-creator-launches-cold-war-space-tactics-deck-conn-via-microprose-september.htm
- **Developer on influences (Dev Log 1):**
  - "cold war dieselpunk & CRT aesthetic… (I'm looking at you Alien and… anything by Peter Hyams)". The linked films are Outland (1981) and 2010 (1984), verified on IMDb.
  - "Silent Running by James S. Calvert"; the "Aubrey-Maturin series".
  - "**A forever-war in space fit the kind of gallows humour I favour**."
- The launch post cites Das Boot's mid-Atlantic encounter as the inspiration for "Burst Transmissions" (https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1842212951313062).
- The Escapist: "something recovered from an alternate version of the late 1980s in which WarGames led directly to an interstellar arms race" (https://www.escapistmagazine.com/news-deck-and-conn-release-date-september-2026/).
- **In-fiction details from screenshots:**
  - Patrol date "Saturday, 1st June, 2318".
  - Factions: Colonial Earth Navy (CEN) ships vs the "Spiral Arm Federacy"; enemy ship prefix "FNA"; Coyote Station affiliated "UEC".
  - Ship names: CEN Raccoon, CEN Egret (crew 89).
  - "CEN MIL-TERMINAL… (c) Stern-Brackett Software Engineering".
  - "PRIORITY ACTION MESSAGE – CODE SHEET".
- **Counterpoint on "grim":** players also call it "downright cozy" (review 234840644), "cute UI" (235226397), and "Lovely little game" (234347220). One review says "There is no tension, all the enemies die easily" (234266910). The grimness is mostly in setting and framing, not difficulty.

### B5. Features that give it weight (with sources)
- **Named, persistent crew:**
  - Rank, age, department, experience ("inexperienced"), state ("Fit") and colony-birth bios (dc9).
  - "crew promotions and losses accumulate across encounters" (TechTimes).
- **Losses:**
  - The mess wall has a green-screen "**NOTICES — KIA / MIA**" board (dc11).
  - "you can't replace them (unless they die)" (review 234302827).
  - Crew is "expended upon capturing a vessel" as prize crews (review 235081272).
  - "not a fan of crew being promoted away from my ship" (review 234384227).
- **Prize or scuttle:**
  - Boarding screen: "SURRENDERED / TAKE AS PRIZE / Prize CDR.: Latoyia Martorell… Prize Crew: 4" (dc6).
  - Burst transmission: "Raccoon, this is Balaban. We surrender." (dc13).
  - "You do get a lotta dough for showing restraint" (review 234242214).
- **Attrition and logistics:**
  - "SUPPLY: 30 days remaining", "ARMS: CIWTS 60 / TORPEDOES 3", "DAMAGE: NO DAMAGE" (dc2).
  - Damage Control listing hull, reactor, FTL and other systems, with "DC Priority: XO'S DISCRETION" (dc10).
  - "You must repair your vessel in dynamic campaigns before being able to leave port" (v1.1, https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1842846814445369).
  - Renown works as the upgrade currency (dc3, dc8).
- **Bureaucracy:**
  - "NOTICE: NO MATERIALS OF A SENSITIVE NATURE TO LEAVE THIS ROOM UNDER PENALTY OF COURT MARTIAL" (dc3).
  - Formal report voice: "Recommend going to General Quarters, Captain." (dc5).
- **Imperfect information:** "No IFF detected – she might be hostile!" (dc5); fragmented sensors and coded orders (press releases).
- **Consequences:**
  - "Ultimately died to a much larger ship I SHOULD NOT have picked a fight with" (review 234278633).
  - "if tour of duty is done, your captain / savegame is done" (review 234384227).
  - Exact permadeath rules on ship loss are UNVERIFIED.

### B6. Visual and UI style (my observations of dc1–dc13, with measurements)
**Layout**
- Hand-pixelled, diegetic first-person interiors: captain's cabin, engine room, mess, boarding hatch.
- The bridge is a wall of physical instrument panels around one square tactical viewport.

**Palette**
- Panels: olive and sage enamel green #688858, #789262, #879c6d, #4c5b3f.
- Screens: pure black #000000.
- Room shadows: charcoal #222423.
- CRT housings: 1980s beige/putty plastic #88877a, #91836e, #a79a82.
- Walls: teal-grey #617365, #455f4d. Mess: navy #273549.
- Desk: red-brown.
- Text: phosphor green #0cb40c-ish and cyan-green on black, white, pale yellow for highlights, salmon/pink for enemy names, cyan.
- Hazard yellow and black ring around the hatch; radiation trefoil on the door.

**Tactical view**
- Photographic-looking starfield and grey-green nebula backdrop.
- **Tiny white top-down pixel ship silhouettes.**
- Orange pixel planet, yellow disc stars, dashed-bracket selection box.
- Grid coordinates such as "(15,16)" (dc5, dc10, dc13).

**Ship depiction**
- White line-art "blueprint" schematic of the corvette, seen from above, with diagonal-hatched pylons (dc3, dc5).
- A beige technical placard version of it in the engine room (dc7).

**Typography**
- Thin pixel monospace for screen text.
- Chunky condensed painted-stencil wayfinding ("‹BAR", "-DECK 4 ENG→").
- Seven-segment LED digits ("8888").
- Serif brass-plate "WILSON ELECTRIC".

**Props:** coffee cup, printed manual, mouse, pinned poster "RIPOSTE VS ROVER", code sheets on perforated printer paper.

**Sound (reviews only; no official description found)**
- "ambient background hum of electronic equipment as well as the occasional beep or boop" (234347220)
- "mechanical switches and old time buzzers" (234506511)
- "Very light on music" (234271284)
- "The sound design and atmosphere is so good" (234229715)
- Reviews URL: https://store.steampowered.com/app/3828500/Deck__Conn/ (API: `store.steampowered.com/appreviews/3828500?json=1`)

**Trailers (Steam titles):** "Publishing Announcement", "Rel Date ann", "Release". Third-party video review: "Deck & Conn: Review" by Atova (https://www.youtube.com/watch?v=JdH3VbMTDYI).

**Reddit:** I found no Reddit threads; searches returned none and Reddit blocked the API (UNVERIFIED either way). The fan wiki https://deckconn.wiki/ says it is "an unofficial fan-made resource". The old itch page (expectproblems.itch.io/deck-and-conn) now returns 404. A search snippet from it said "fifteen minutes into the future of 1986" and "missing 1990s Microprose game" (UNVERIFIED on the live page).

### B7. Screenshot URLs
All 1920x1080; prefix `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3828500/`
- dc1 `0bdbf96a3d29ea2d7f42fa30f2449721a46bc3ae/ss_0bdbf96a3d29ea2d7f42fa30f2449721a46bc3ae.1920x1080.jpg`
- dc2 `3e278c3dbd462952e60339935a495ff33ec538d4/ss_3e278c3dbd462952e60339935a495ff33ec538d4.1920x1080.jpg`
- dc3 `424a52c48288bb50bc2e9243d6faeb4046bc24f1/ss_424a52c48288bb50bc2e9243d6faeb4046bc24f1.1920x1080.jpg`
- dc4 `452276e40f07420484c4ead547eb3a731dae5c40/ss_452276e40f07420484c4ead547eb3a731dae5c40.1920x1080.jpg`
- dc5 `53a4af6b16a165459daad1fbb1279990a9101cb2/ss_53a4af6b16a165459daad1fbb1279990a9101cb2.1920x1080.jpg`
- dc6 `56d700588ec9239506506ef74c5b6684ac13c8f2/ss_56d700588ec9239506506ef74c5b6684ac13c8f2.1920x1080.jpg`
- dc7 `700b6a389021c1672c66a5f78a5f78f9333babb7/ss_700b6a389021c1672c66a5f78a5f78f9333babb7.1920x1080.jpg`
- dc8 `74d2949c7f2c6f816325283c924e6a8c855ee2e2/ss_74d2949c7f2c6f816325283c924e6a8c855ee2e2.1920x1080.jpg`
- dc9 `99169e1b11bf12d89b186491cbb4435b032a6728/ss_99169e1b11bf12d89b186491cbb4435b032a6728.1920x1080.jpg`
- dc10 `c68ce7b1a1a65d5f07350e82c5597a57c7ce1962/ss_c68ce7b1a1a65d5f07350e82c5597a57c7ce1962.1920x1080.jpg`
- dc11 `ec8751f792cf656058f0789e9f95078c852354c8/ss_ec8751f792cf656058f0789e9f95078c852354c8.1920x1080.jpg`
- dc12 `ee53cf07fc52ada0ae43ee67f22af3b986970b97/ss_ee53cf07fc52ada0ae43ee67f22af3b986970b97.1920x1080.jpg`
- dc13 `fda9d97cfb9d40a16770ec26d91d7d866f0d379f/ss_fda9d97cfb9d40a16770ec26d91d7d866f0d379f.1920x1080.jpg`

---

## What to take from each
Everything here is aimed at a non-pixel, top-down, tilt-shift 2.5D space autobattler in the browser. Each trait is observed or quoted above; how it would apply is INFERENCE.

### From Beta Decay (visual)
1. **Grey, black and white first; colour is rationed.**
   - Observed: press-kit scheme "Grey, Black, White"; mean saturation around 0.1 or less; accents under about 1% of frame.
   - INFERENCE: build hulls, space and UI in near-neutral charcoals (#0b0b0b–#5c5c5c). Spend saturation only on weapon fire, damage and faction ID, so each shot reads.
2. **Whole-frame tinted states.**
   - Observed: neutral grey, full oxblood red and night-vision green grades.
   - INFERENCE: grade the battlefield as game state, e.g. red when a flagship is critical, green for a "sensor/scan" pre-battle view.
3. **Fog and depth fade.**
   - Observed: fog fades to mid-grey outdoors and to black indoors, with heavy vignette.
   - INFERENCE: in top-down 2.5D, fade lower or farther layers (debris, background hulks) into grey haze. Tilt-shift blur can double as the depth-of-field effect seen in the stills.
4. **"Decayed" surfaces without pixel art.**
   - Observed: mid-poly forms with low-res, point-filtered textures and no anti-aliasing.
   - INFERENCE: keep smooth 3D silhouettes but use coarse, nearest-filtered grime and camo textures, plus film grain, a faint screen-mesh overlay and bloom on small lights only.
5. **Hardware language.**
   - Observed: slab-sided, stacked-panel, X-braced, gatling-and-rack mechs; tiny green status LEDs; sparse hazard stripes; red-white barrel bands.
   - INFERENCE: ships as industrial slabs with readable turret pods and one lit LED per module (a natural "alive/dead" indicator).
6. **Effects.**
   - Observed: white-hot dashed tracers, small red/pink spark impacts, orange flame with embers and white smoke.
7. **UI.**
   - Observed: tiny white bitmap-style labels, thin white outline boxes, dashed corner brackets, amber vector instrument tapes, letter-spaced caps, faint terminal-text textures, a constructed-glyph logo.
   - INFERENCE: this works as a thin-line, low-ink HUD over dark space.

### From Deck & Conn (tone and systems)
1. **Diegetic instruments over abstract menus.**
   - Observed: olive enamel panels, beige CRT bezels, seven-segment LEDs, phosphor-green on black, SCRAM/GQ/EXECUTE hardware buttons.
   - INFERENCE: pre-battle fleet setup and post-battle report as terminals and printouts. The battlefield itself can stay clean 3D.
2. **Terse military-bureaucratic voice as the grim delivery channel.**
   - Observed: "Recommend going to General Quarters, Captain."; "DC Priority: XO's discretion"; court-martial notices; KIA/MIA board; coded PAM sheets; the surrender burst transmission; the predecessor's death with "no ceremony"; "gallows humour".
   - INFERENCE: battle logs and after-action text carry the darkness better than cutscenes.
3. **Persistence and attrition.**
   - Observed: named officers with bios and experience; promotions and losses accumulate; prize crews are consumed; repairs are required before departure; supply days; ammunition counts; renown as currency.
   - INFERENCE: persistent named captains per hull, casualties that stick, and scuttle-vs-capture choices after a win.
4. **Imperfect information.**
   - Observed: unidentified contacts ("No IFF"), fake SOS traps, misjump risk.
   - INFERENCE: show an enemy fleet as a partial or uncertain sensor picture before the autobattle.
5. **Top-down ship depiction.**
   - Observed: small white silhouettes over a photographic nebula, plus white line-art schematics with hatched sections.
   - INFERENCE: line-art hull schematics for per-module damage readouts.
6. **Soundscape.** Observed (from reviews): electronic hum, beeps, buzzers, mechanical switch clicks; music "very light".

### Caveats for the brief
- Beta Decay has no published top-down or space imagery, so the ship look must be extrapolated from its mechs and vehicles.
- Deck & Conn's "grim" is tonal and framing-based; many players describe the moment-to-moment feel as cozy or tactile.