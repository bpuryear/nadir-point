# Ridiculous Space Battles (RSB): competitor research report
Checked 2026-09-28. Each fact has a source and date. Anything I could not confirm is marked UNVERIFIED.

**Key facts**
- The Steam date of **Nov 16, 2026 is correct**, but it is a planned date, the store does not say whether it is Early Access or 1.0, and there is still no price.
- The "~600 ships on a 20×20 grid" claim is real, but it describes Harris's profiling test battle in May 2025. It is not a stated cap.
- The ~5% AI-art disclosure is confirmed word for word.
- **Tone:** the store and site copy is jokey, but the visuals aim for cinematic spectacle, not cartoon art.
- **Most criticised change so far:** fixed lanes, meaning ships only move straight forward. Several GSB fans say it put them off. Harris defends the change but says Early Access could add free movement.

---

## 1. Release status, dates, price, reviews

| Item | Fact | Source (date) |
|---|---|---|
| Announced | Blog post "Announcing Ridiculous Space Battles". The Steam page (app 3607230) was live at announcement. He said "released on steam this year (into Early Access anyway)". About 18 months of prior work. | https://www.positech.co.uk/cliffsblog/2025/04/29/announcing-ridiculous-space-battles/ (2025-04-29) |
| Earliest trace of the project | "Designing a system of orders for units in a war game" (an unnamed hobby project). On 2025-01-05 he described an unannounced game of about 40k lines of code. | https://www.positech.co.uk/cliffsblog/2024/03/24/designing-a-system-of-orders-for-units-in-a-war-game/ ; https://www.positech.co.uk/cliffsblog/2025/01/05/so-is-2025-another-game-dev-year-for-me/ |
| Press coverage in 2025 | Worthplaying: "early access sometime towards the end of this year" (i.e. 2025). That target slipped. | https://worthplaying.com/article/2025/5/25/news/146182-ridiculous-space-battles-is-the-spiritual-successor-to-gratuitous-space-battles-scheduled-for-later-this-year-screens-trailer/ (2025-05-25) |
| Target of Sept 2026 | Harris on Steam: "I am thinking probably September?" | https://steamcommunity.com/app/3607230/discussions/0/803470896719291418/ (2026-07-05) |
| Target of Oct 2026 | "hope to actually have the game in a shippable (to Early Access) state around October at the latest". Still to do at that point: challenges, a second pass on campaign fleets, and a tutorial. | https://www.positech.co.uk/cliffsblog/2026/08/19/challenge-ui-for-ridiculous-space-battles/ (2026-08-19) |
| Demo | "I signed up the game to be in the next NextFest with a demo." The next Next Fest runs **Oct 19–26, 2026**, with registration closing Aug 31. That this is the event he meant is my inference. As of today Steam lists no demo (the appdetails `demos` field is null). | https://www.positech.co.uk/cliffsblog/2026/08/26/challenge-code-and-ui-almost-done/ (2026-08-26); https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/2026october |
| **Steam date** | **"Planned Release Date: Nov 16, 2026 … plans to unlock in approximately 6 weeks"**. The prior claim is **confirmed**. The store page has no Early Access label. Every statement from Harris says it launches into Early Access first. **No 1.0 date has been announced.** | https://store.steampowered.com/app/3607230/ and https://store.steampowered.com/api/appdetails?appids=3607230 (both checked 2026-09-28) |
| Side observation | GSB1's Steam release date is also Nov 16 (2009). Whether the match is intentional is UNVERIFIED. | https://store.steampowered.com/api/appdetails?appids=41800 |
| Price | Not listed on Steam. Harris: "Sometimes I think $20, but thats not decided for sure." | https://steamcommunity.com/app/3607230/discussions/0/583931831085219270/ (2026-08-22) |
| Reviews | 0 ("No user reviews"). | https://store.steampowered.com/appreviews/3607230?json=1 (2026-09-28) |
| Followers and wishlists | The Steam community group memberCount is **708**; this is normally equal to store followers. **Wishlist numbers have never been published** (UNVERIFIED). | https://steamcommunity.com/games/3607230/memberslistxml/?xml=1 (2026-09-28) |
| Platforms | Windows and English only. DirectX 9.0c. Minimum spec: i5 1.6GHz, 8GB RAM, Intel HD graphics, 2GB disk. GOG is "hopefully". No Epic, no Mac. Steam Deck: "Maybe!". | Steam page; https://www.positech.co.uk/cliffsblog/2026/07/05/new-battle-video-from-ridiculous-space-battles/ ; https://steamcommunity.com/app/3607230/discussions/0/591776209704191144/ |
| Offline play and mods | Fully playable offline (confirmed 2025-05-06). Steam Workshop mod support is planned for after Early Access starts. | https://steamcommunity.com/app/3607230/discussions/0/591770590786914959/ ; https://steamcommunity.com/app/3607230/discussions/0/591772621004118277/ |
| Age ratings (Steam) | Germany 12, Brazil (DEJUS) 6, Indonesia (IGRS) 3+. | appdetails (2026-09-28) |

## 2. What RSB keeps from GSB1/GSB2 and what it changes

**What it keeps**
- The auto-battler loop: design ships, deploy them, give orders, then watch with no control during the battle.
- Three hull classes: Cruiser, Frigate and Fighter.
- Ships built from modules.
- Scoring that rewards winning with the smallest fleet: "The smaller the fleet you win with, the more points you score" (2026-06-07).
- Points unlock content: "Victories earn points that can be used to unlock extra levels … and ridiculous weaponary" (https://www.positech.co.uk/ridiculousspacebattles/). GSB1's "honor" system worked the same way.
- The online challenge system.
- Music reused from GSB2 (2026-08-19).

**What it changes**
- **Deployment.** Ships go on a fixed grid in fixed squadrons: 1 cruiser, or 4 frigates, or 25 fighters per square. The whole fleet forms one "mega-formation", and the strongest ship in each column leads it. (Steam page; https://www.positech.co.uk/cliffsblog/2025/05/10/ridiculous-space-battles-design-goals/, 2025-05-10)
  - *Why:* GSB1 players stacked capital ships into dense "scrum" blobs that were very hard to beat. That broke his rule that "In play, the game should look cool". He calls this "total-war gameplay".
  - He believes about 95% of players never changed fighter squadron size anyway.
- **Movement.**
  - Ships move only along the X axis, i.e. in lanes. The lead ship holds position and advances as enemies die; fighters can raid ahead of the line.
  - There is no retreat-to-repair and no escort order.
  - *Why:* "GSB players often wondered where the hell half their ships were going and why." (2025-05-10)
- **Win and lose conditions.**
  - You win by destroying every enemy ship.
  - You **lose if any enemy ship reaches your side of the screen (the left)**.
  - *Why:* to force a spread-out defensive line and stop "turtle-block" deployments. Harris himself said "This is the one I am not sure of" (2025-05-10). He described its anti-turtle purpose on Steam: https://steamcommunity.com/app/3607230/discussions/0/591770110121785503/ (2025-05-02).
- **Ship designer.**
  - Hulls are Cruiser, Frigate and Fighter.
  - Module types: shields, armor, engines, weapons, repair systems, cloaking devices, decoy projectors, countermeasures and specialist equipment.
  - **The crew and power requirements from GSB have been removed:** "those restrictions were more annoying than fun" (2025-05-02, same thread).
  - Modules have a size and a cost (https://www.positech.co.uk/cliffsblog/2026/03/21/auto-balancing-and-load-testing-ridiculous-space-battles/).
  - Named weapons and modules:
    - Plasma Stream
    - Gravimetric impulse cannon
    - Ricochet lasers (anti-fighter)
    - Beam lasers and "wave beams"
    - Fast missiles
    - Plasma torpedoes
    - Target Painter
    - Tractor beams
    - Mines (seen in dev video #3)
    - A drone swarm launcher, and a bullet-attracting decoy drone (https://steamcommunity.com/app/3607230/discussions/0/573771272958334024/, 2025-10-20)
    - Shield-support beams
  - The deployment screen auto-tags each design with a "role", such as "Anti-Armor" or "SuperWeapon" (https://www.positech.co.uk/cliffsblog/2026/02/07/deployment-range-ui-for-ridiculous-space-battles/).
- **Orders.** Harris says GSB's system "was a mess" and "completely opaque". Design as of 2025-08-15 (https://www.positech.co.uk/cliffsblog/2025/08/15/designing-the-orders-system-for-ridiculous-space-battles/):
  - Orders are set per ship, and each weapon then picks its own target.
  - **Movement** order: engage at N squares.
  - **Target criteria**, colour-coded and in priority order: size class (fighter, frigate, cruiser) and defense state (shields, armor, bare hull).
  - **One "discriminator" or tie-breaker:** Co-operate, Vulture, Retaliate, Breakthrough, or Last Defense.
  - **New orders:** Raider, Last Defense, Breakthrough.
  - He was leaning towards "first criterion that yields targets wins" (Steam, 2025-08-16: https://steamcommunity.com/app/3607230/discussions/0/802322896293854714/). The final rule is UNVERIFIED.
- **Factions.** The copy says "a range of despicable aliens". There is a race-selection screen (https://www.positech.co.uk/cliffsblog/2026/02/15/ridiculous-space-battles-progress/). Asset paths mention "expanse" and "ascendency" races (https://www.positech.co.uk/cliffsblog/2025/06/29/optimizing-load-times/). **How many races there are is UNVERIFIED.**
- **Campaign.**
  - A linear chain of battles. Surviving ships carry over and you get reinforcements. His May 2025 plan was that survivors come back 100% repaired (https://steamcommunity.com/app/3607230/discussions/0/591772295701219465/).
  - The 2026-07-05 video shows campaign battle #4, using survivors plus reinforcements.
  - Branching "wouldn't be hard" to add (2026-01-13).
  - No GSB-style Galactic Conquest at launch. He calls a 4X add-on a "dream".
- **Online challenges** (async; 2026-08-19 and 2026-08-26 posts):
  - A challenge is an uploaded fleet: a ~10KB text file plus a jpg thumbnail.
  - The browser shows ID, title and description, with sort on any column and filters. It currently fetches the first 1,000 challenges.
  - **New "retaliation" mechanic:** beat a challenge, then submit your winning fleet as a child entry that others can replay.
  - Rankings, victory counts, and difficulty/fun voting are still to come.
  - Server is PHP/SQL. GSB1's challenge backend collapsed at "something silly like 500,000" files.
- **Scale.** "20×20 grid size, with up to 25 ships in each square, probably 600 ships in total" in the big battles he was profiling (https://www.positech.co.uk/cliffsblog/2025/05/18/optimising-ridiculous-space-battles/, 2025-05-18). That was a test scenario, **not a stated cap**; the real maximum is UNVERIFIED. Particle load is "thousands of emitters, hundreds of thousands of particles" (2025-07-13).
- **Battle speed and simulation.**
  - 5 speeds from 1/4x to 4x.
  - The simulation is now **100% deterministic**, using a fixed 4ms tick separated from rendering. GSB was not deterministic. (https://www.positech.co.uk/cliffsblog/2026/06/07/building-a-deterministic-space-auto-battler/)
  - You can freeze-frame and scroll around the battle.
- **Tech.** Custom C++ engine on DirectX 9, 2D top-down, 32-bit. GSB2's mock-3D lighting was dropped as "not worth it". More than 720 game source files plus the engine. Memory use ranges from about 234–400MB (March 2026) to 600–700MB (June 2026). Solo developer; the art is stock 3D packs kit-bashed into ships.

## 3. Tone, art and AI disclosure
- **Tone:** the copy is satirical and jokey. Examples: "(for reasons unspecified)", "wastes of galactic taxpayers money", "more flashing lights than an explosion in an LED factory". The site tagline is "More ships, more beams, more absurdity."
- **Art:** the visuals go for cinematic spectacle, not cartoon art. Steam tags include Cinematic, Realistic, 2D and Top-Down. He compares battles to an "old school naval battle" (2026-07-05).
- **Exact Steam disclosure (confirmed 2026-09-28):** "95% of the art in the game is entirely made by artists. The other 5% (some background images and some ship module images) are made using scenario, an AI art service that states on its site: 'We ensure that all models on our platform are trained solely on data that we own.'"
- **His defence of the AI use:** "If I create my own art and then use scenario to train my own private model on my own art, how is that exactly cheapening anything?" He then locked the thread (https://steamcommunity.com/app/3607230/discussions/0/591777299172551060/, 2025-07-27).
- **Other AI use:** he blogs openly about using AI assistants. Grok suggested optimisations (2025-05-18), and Claude Opus writes his PHP/SQL (2026-08-19).

## 4. Every blog post about RSB (positech.co.uk/cliffsblog)
1. **2025-04-29 – Announcing Ridiculous Space Battles** – …/2025/04/29/announcing-ridiculous-space-battles/ – Announces the game for Early Access in 2025. Calls GSB2 "a bit of a flop", with bugs for some players.
2. **2025-05-03 – Ridiculous Space Battles: how and why?** – …/2025/05/03/ridiculous-space-battles-how-and-why/ – Covers the path from hobby shooter to "Paint by Spaceships" to "Convoy" to RSB, and the full rewrite with bought art. Says GSB "suffered from a load of obvious game design mistakes" and he wants "the game GSB should have been". Says GSB2 had technical issues and its mock-3D wasn't worth it. No financial pressure on this game.
3. **2025-05-10 – Ridiculous Space Battles Design Goals** – …/2025/05/10/ridiculous-space-battles-design-goals/ – **The key "why we changed it from GSB" post.** Covers the grid, fixed squadrons, simpler orders and movement, "defend the line", and 2D DX9 rather than Unity/Unreal.
4. **2025-05-18 – Optimising Ridiculous Space Battles** – …/2025/05/18/optimising-ridiculous-space-battles/ – Profiles a 20×20 grid battle with about 600 ships; bullet and lightmap optimisations.
5. **2025-06-01 – Is this game you designed actually any fun?** – …/2025/06/01/is-this-game-you-designed-actually-any-fun/ – Reflects on how hard it is to judge whether your own game is fun.
6. **2025-06-07 – Ridiculous Space Battles developer blog #1** – …/2025/06/07/ridiculous-space-battles-developer-blog-1/ – A 20-minute video (youtu.be/GglvfYcaATg).
7. **2025-06-29 – Optimizing load times** – …/2025/06/29/optimizing-load-times/ – DX9 texture loading is the bottleneck.
8. **2025-07-13 – Coding a load-balanced multithreaded particle system** – …/2025/07/13/coding-a-load-balanced-multithreaded-particle-system/ – Particle update spread across 8 threads; targets 5120-pixel-wide displays and cheap laptops.
9. **2025-08-15 – Designing the orders system for ridiculous space battles** – …/2025/08/15/designing-the-orders-system-for-ridiculous-space-battles/ – Criteria, priorities and discriminators, plus the new orders. Calls GSB's system opaque.
10. **2025-10-23 – C++ Strategy Game Programming: RSB code video #1** – …/2025/10/23/c-strategy-game-programming-ridiculous-space-battles-code-video-1/ – A 50-minute code walkthrough video.
11. **2026-02-07 – Deployment Range UI for RSB** – …/2026/02/07/deployment-range-ui-for-ridiculous-space-battles/ – Calls GSB's range circles "a confused mess". RSB colours ranges red, white and green, and adds role tooltips.
12. **2026-02-15 – RSB Progress** – …/2026/02/15/ridiculous-space-battles-progress/ – Race-selection animation and calmer deployment-screen colours. Remaining work: balance, campaign fleets, challenges.
13. **2026-03-21 – Auto-balancing and load-testing RSB** – …/2026/03/21/auto-balancing-and-load-testing-ridiculous-space-battles/ – Headless random-fleet battles for balancing; soak testing. He considered launching Early Access without challenges.
14. **2026-04-16 – Ridiculous Stats Battles** – …/2026/04/16/ridiculous-stats-battles/ – Highlight stats after each battle, plus a **"previous battle" overlay on the deployment map** showing how each squad did. It fixes the GSB-era problem of knowing what to change next time.
15. **2026-06-07 – Building a deterministic space auto-battler** – …/2026/06/07/building-a-deterministic-space-auto-battler/ – Converted the simulation to 100% deterministic because scoring depends on it. GSB was not deterministic.
16. **2026-07-05 – New battle video from RSB** – …/2026/07/05/new-battle-video-from-ridiculous-space-battles/ – Campaign battle #4. Admits "some people who loved GSB dislike" the lanes and defends them as "more cinematic".
17. **2026-07-23 – New RSB Trailer** – …/2026/07/23/new-ridiculous-space-battles-trailer/ – Trailer (youtu.be/x8LVD5PytOo).
18. **2026-08-19 – Challenge UI for RSB** – …/2026/08/19/challenge-ui-for-ridiculous-space-battles/ – Rebuilds the challenge browser and recaps GSB's server collapse. Early Access target "around October at the latest".
19. **2026-08-26 – Challenge code and UI almost done!** – …/2026/08/26/challenge-code-and-ui-almost-done/ – Retaliation system; signed up for Next Fest with a demo.

Related posts:
- 2023-08-25 – Making a hobby game! – the precursor project.
- 2025-12-17 – Eventually a simpler, more local website – calls RSB "a labour of love".
- 2026-08-20 – I did a LONG interview about EVERYTHING – a Matt Gambell interview. Whether it covers RSB is UNVERIFIED.
- Background on GSB2: https://www.positech.co.uk/cliffsblog/2015/11/25/indie-game-developers-move-on-or-they-fail/ (2015-11-25). GSB2 cost $115k, made about $150k in revenue, and he calls it a "relative flop".

There are **no blog posts after 2026-08-26**, checked through the WordPress API today.

**Complaints from GSB players, from Steam reviews** (https://steamcommunity.com/app/344840/reviews/ and https://steamcommunity.com/app/41800/reviews/):
- GSB2 is "Mostly Negative" (123 positive / 188 negative). Complaints: crashes, too few modules and races, ships over-specialised by size, felt like DLC, no strategic layer, abandoned.
- GSB1 is "Mixed" (622 / 268). Complaints: the online-only campaign and CD-key checks broke when the servers were shut down, ship spam beats careful design, orders do "incredibly stupid things", and the UI is slow.

## 5. Reception so far
- **No demo, no reviews, and almost no press.** I found only Worthplaying (2025-05-25) and a database page on Kotaku (https://kotaku.com/games/ridiculous-space-battles). Reddit searches returned nothing, and Reddit's API was blocked, so that is UNVERIFIED.
- **Main criticism is the fixed lanes and grid.**
  - "Maneuver" thread (21 replies): https://steamcommunity.com/app/3607230/discussions/0/591781420376301372/
    - "looks like 2 traffic jams" (2025-12-15)
    - "my personal interest has absolutely plummeted" (2026-01-12)
    - "mobile game grid" (2026-01-20)
    - "on rails" (2025-11-29)
    - Players asked for collision avoidance instead of lanes.
    - Harris: when players demanded direct ship control in GSB he added it "and nobody used it!" (2026-01-13). He might add a separate free-movement mode (2026-02-01).
  - Trailer feedback thread (15 replies): https://steamcommunity.com/app/3607230/discussions/0/589558792744746409/
    - "strict lanes make the battles look ridiculous, but not in a good way" (2026-07-31)
    - Movement looks too instant and stiff.
    - Harris restored varied movement speeds (2026-08-05) and says free movement is possible if players agree during Early Access (2026-08-04).
- **Other feedback.**
  - Players want a GSB1-style conquest campaign and say a linear campaign has limited replay value.
  - An early reaction called the new ship designer "cumbersome"; the same poster later warmed to it.
  - Worry that "reach your side = lose" can be exploited.
  - Worry that challengers have an advantage because they can tailor a fleet to beat a known one.
  - Anti-AI objection in the "No AI" thread (2025-07-20).
- **Positive feedback:** many "we are so back" posts and alpha-test requests (https://steamcommunity.com/app/3607230/discussions/0/591775992008280518/). Players praised the new stats overlay and the effects.

**Media:** dev videos #1–#9 are on YouTube under "Positech Games". Also "Teaser October 2025" (G9qCqErapNM), "2026 Trailer" (X-c2V-HKwzI, the trailer on the Steam store), and "Campaign Battle" (zYedFhfA4cc). Upload dates for #5, #8 and the teaser are UNVERIFIED.

Not reachable, so these gaps remain UNVERIFIED: SteamDB (release-date history, follower chart), the Wayback Machine, Reddit, and the press-kit press release (the .docx is inside a .rar I could not open).
