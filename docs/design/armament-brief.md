# Armament: firing as a performance, and a hull that adapts to what you bolt on

**Direction from the project owner. This is a design brief, not yet a spec — the
research and implementation streams turn it into one.**

---

## 1. The core want: firing should be an EVENT

> *"Firing a broadside or the main weapon should feel punchy, and involve hitting a
> cooldown or a button of some sort — it should feel like that broadside of cannon
> rippling down the side of a ship you see in pirate movies."*

Two things in that sentence, and both matter.

### It is a RIPPLE, not a volley

The cinematic read comes from **sequential ignition down the battery**, not from
everything firing at once. Gun one, then two, then three, each a beat apart, the muzzle
flashes running along the hull, the ship shouldering away from the recoil as the wave
travels. A simultaneous volley is a single flash and reads as a stat being applied. A
ripple is a *performance* with a beginning, a middle and an end, and it lasts long enough
that the player watches it happen.

The ripple direction should read along the hull — fore to aft or aft to fore — and the
per-gun delay is the whole feel. Too tight and it is a volley; too loose and it is
sloppy. This is a tuning problem worth taking seriously.

### It is a COMMITTED ACTION, not a passive DPS stream

Right now weapons fire automatically whenever a target is in arc. That is why combat has
no moment-to-moment texture: the player picks a target and watches. A broadside on a
button with a real cooldown creates the decision the game is missing —

- **when** to spend it, with the enemy not yet fully in arc but closing
- **which side**, if both are loaded
- whether to hold it while you finish the turn, or fire early and take a partial arc

That is a per-5-second decision, and the research names its absence as the single biggest
gap between us and the reference games.

**It must interlock with what already exists**, or it is just a button:
- **heat** (`sim/heat.js`) — a full broadside is the biggest thermal event in the game
- **stores** (`sim/stores.js`) — it spends real ammunition
- **power** (`sim/power.js`) — the weapons channel governs reload and cycle time
- **condition and sub-parts** (`condition.js`, `subparts.js`) — a worn feed stutters the
  ripple; a dead traverse ring freezes a gun mid-sequence; damaged barrels drop out of
  the wave. **The ripple should be a readout of the battery's health.** A pristine
  broadside is a clean rolling wave; a beaten one is ragged, with gaps where guns are
  dead. That is free storytelling and it costs nothing.

---

## 2. Weapon archetypes must feel genuinely different

> *"Some ships might want a spinal weapon that fires a huge thing forward, or maybe some
> with weapons along the side of the hull."*

Each archetype should produce a different **combat moment**, not a different damage
number. First pass at the vocabulary — research should extend and correct it:

| Archetype | The moment it creates |
|---|---|
| **Spinal / lance** | Long charge, whole-ship commitment. You aim by turning 1400 m of hull, and the shot is an event you line up over several seconds. Missing hurts. |
| **Broadside battery** | The ripple. Arc-limited, enormous alpha, long cooldown. Rewards the turn you planned 20 seconds ago. |
| **Turreted** | Tracks on its own, low ceiling, no drama. The reliable background damage that makes the dramatic weapons affordable. |
| **Missile cells** | Salvo launch, flight time, interception risk. Fire-and-worry rather than fire-and-forget. |
| **Point defence** | Never player-fired. Its whole character is that it saves you without being asked. |
| **Mining / cutting** | Sustained, industrial, not a weapon. Deliberately the *opposite* of punchy. |

The player's loadout should therefore change **how they fight**, not just how hard.
Two spinal mounts is a completely different ship from two broadsides.

---

## 3. The hull must adapt to what is fitted — and stay cohesive

> *"The hull should adapt dynamically/procedurally depending on all those types of weapon
> modules… and for the cruiser to adapt to all sorts of parts and still look cohesive."*

This is the hard part and the most valuable.

Today a module is a discrete object bolted to a socket. What is wanted is for **the hull
itself to respond**:

- a **broadside battery** should open gun ports / casemate blisters along that flank, with
  the plating stepping around them, so the flank reads as *built for* the battery
- a **spinal weapon** should reshape the prow and spine — a recoil structure running back
  into the hull, bracing, a muzzle aperture that is part of the bow rather than stuck on it
- **engines** should change the aft: bigger bells want a deeper block, more radiators,
  visible plumbing
- **hangars, sensors, cargo** likewise

And it must all still read as **one ship**. That is the whole premise of the game — a hull
assembled from other people's parts that nonetheless reads as intentional. The existing
constraints are the tools: one detail vocabulary, one locked palette, hard-edged forms,
the greeble kit in `art/geometry/greeble.js`.

**The likely mechanism**, for research to confirm or replace: hardpoints publish an
*adaptation* — a small procedural change to the hull's own geometry at that station,
generated at build time from the fitted module's declared needs, rather than the module
carrying every part of itself. The hull grows the socket the module needs.

Constraints that already bind:
- cruiser core ≤ 2000 tris, module ≤ 400
- the benchmark is over its draw ceiling, so adaptation must be **merged into the hull's
  existing geometry**, not added as new meshes
- the silhouette audit is the project's strongest asset and must not regress
- every LOD must still read as the same ship

---

## 4. Everything mountable deserves this treatment

The owner's closing point: the same depth of mechanic and visual response should apply to
**engines and every other mountable system**, not only weapons. An engine upgrade should
change how the ship moves *and* how its stern looks *and* give the player something to
feel. A reactor should do the same for power and heat.

The test each one must pass is the four-question test in `scope-decision.md`: what
decision does it create, what does it interlock with, what does it deliberately abstract,
and can the player see it.
