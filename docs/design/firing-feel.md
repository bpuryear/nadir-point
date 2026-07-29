# Firing feel and weapon archetypes

**Status:** specification. This turns §1 and §2 of `armament-brief.md` into numbers a programmer
types in. §3 of that brief (the hull adapting to what is fitted) is a separate stream and is not
covered here.

**Scope:** binding on `sim/combat.js`, `sim/ship.js`, `sim/heat.js`, `sim/stores.js`,
`sim/power.js`, `sim/subparts.js`, `sim/condition.js`, `vfx/weapons.js`, `audio/weapons.js`,
`ui/weapons.js`, `input/controls.js`. Every constant introduced appears in the tuning table in §6.

**Method.** Every claim about the codebase below was read out of the code at the time of writing,
not out of the design documents. Where the code and a design document disagree, the code is
quoted. Four real defects were found on the way and are listed in §8; two of them make parts of
this spec impossible until they are fixed.

**What this fixes.** `fun-systems.md` §2 measures our decision texture as "strong at the 5-minute
scale, adequate at the 1-minute scale, and close to empty at the 5-second scale", and §5.2 states
flatly that "there is no active ability anywhere in the codebase". This document is the 5-second
tier. It adds exactly **three** player verbs — salvo, side-select, and charge-and-release — and no
others.

---

## Part I — Research

### 1. The ripple broadside

#### 1.1 Why real navies rolled the broadside

The rolling broadside was not a flourish, it was a structural necessity. If every gun on the
engaged side of an early-18th-century first rate fired at once, "the devastating force of the
combined blast would cause more recoil than the ship could handle"; instead guns fired "on the
roll", **one gun from each deck firing at the same time in a chain of fire along the length of the
broadside**
([Military History Matters](https://www.military-history.org/fact-file/the-broadside.htm)).

Two details from that are directly transferable:

- **The chain runs along the hull, and it runs simultaneously on every deck.** It is one wave
  moving fore-and-aft, not a snake threading through the gunports. Our hull is a single deck of
  hardpoints, so our wave is unambiguously a fore-aft wave — which is the read the brief asks for.
- **The wave is a recoil-management device.** Sequencing exists so the hull is never asked to
  absorb the whole impulse at once. That gives us the mechanical justification for coupling the
  ripple to a recoil kick on `PlaneBody` (§5.2) rather than bolting a shake on for flavour.

The choice of *when* in the roll to fire was a doctrinal one with different payoffs — the French
fired on the up-roll into masts and rigging to cripple, the Royal Navy on the down-roll into hulls
to kill crew ([Nelson's Navy](https://www.nelsonsnavy.co.uk/broadside5.html)). That is a "what am
I trying to destroy" decision made at the moment of firing, and it is the historical ancestor of
our subsystem targeting. We already have that decision; we do not need a second copy of it.

#### 1.2 The historical cadence — broadsides are rare events

At Trafalgar the British could fire **three broadsides in five minutes** against two for the
French crews, and Collingwood's column got its first three broadsides off in "just over three
minutes", against a sustained rate of one round every two minutes
([USNI Proceedings](https://www.usni.org/magazines/proceedings/2005/october/trafalgar-predestined-victory),
[britishbattles.com](https://www.britishbattles.com/napoleonic-wars/battle-of-trafalgar/)).

So the historical shape is: **a sweep lasting a second or two, and a reload lasting one to two
minutes.** The ratio between the performance and the wait is roughly 1:50. That is far too austere
for a game, but it is the right *direction*, and it tells us which of the two numbers is doing the
work. Our heavy broadside's existing 5.0 s cooldown against a ~0.9 s sweep is a 1:5.5 ratio, which
is about as far as we can go before the wait becomes dead air. **We should not shorten the
cooldown to make the game busier; we should make the wait legible, which is §5.4.**

#### 1.3 How games stage it, and where the failure line is

| Game | What it does | What we take |
|---|---|---|
| **Naval Action** | Simultaneous volleys are **not possible**. LMB fires the broadside in a rolling sequence; the modes are Rolling Front Fire, Rolling Back Fire and Random Fire, and single-gun ranging shots are on `Space` ([Steam](https://steamcommunity.com/app/311310/discussions/1/412446292771156226/), [Game-Labs forum](https://forum.game-labs.net/topic/14386-understanding-the-different-gunnery-modes/)) | The **direction of the ripple is a player-facing choice** in the most simulationist game on the list. We take the sequencing; we do **not** take the choice — see §2.1. |
| **Naval Action (the failure)** | Players complain that the rolling sequence makes them adjust heading "over a 7 second period" to land all shots, and that smoke from earlier guns obscures the target for later ones | **7 seconds is past the failure line.** A sweep the player has to *steer through* stops being a performance and becomes a chore. Our hard ceiling is 1.25 s (§2.1). |
| **Sid Meier's Pirates!** | The opposite abstraction: one button, "all cannons on the side facing the enemy fire simultaneously", deliberately, so the spread guarantees a partial hit ([Pirates! wiki](https://sidmeierspirates.fandom.com/wiki/Naval_Combat)) | Proof that the simultaneous volley is a *legitimate* design — it is just a different game. It reads as a stat being applied, which is precisely what `armament-brief.md` §1 rejects. |
| **AC IV: Black Flag / Rogue** | Port and starboard broadsides run on **separate cooldowns**, so rotating the camera to fire one side then the other unloads both in close succession; aiming tightens the spread, and unaimed fire converts to heavy shot ([ConsolePulse](https://consolepulse.com/multiplatform/assassins-creed/guides/assassins-creed-black-flag-resynced-advanced-naval-combat-guide)) | **Two independent cooldowns per side is the whole loadout decision of a two-broadside ship.** We take this directly (§3, "two broadsides"). Also: aimed-versus-unaimed is a real trade the player makes *at the trigger*, which is our early-fire rule. |
| **Sea of Thieves** | Each cannon is manned by a separate human; reload is about a second of held input; crews alternate cannons so one fires while another loads | The ripple is **emergent from independent servicing**, and it reads as alive precisely because it is ragged and never twice the same. This is the strongest argument for the brief's core idea: **make the raggedness carry information** rather than adding random jitter. |

**The synthesis.** A rolling broadside reads as cinematic rather than as lag when three things
hold, and reads as lag when any one of them fails:

1. **It is bounded.** The whole sweep completes inside about a second. Naval Action's 7 s is the
   counter-example.
2. **It resolves without further input.** The player commits once; the sequence is not something
   they steer through. This is the anti-fiddly rule and it recurs in §1.4.
3. **The raggedness means something.** A wave with a hole in it must be *your battery telling you a
   gun is dead*, not a random number. This is the brief's insight and it is the single highest-value
   idea in the document, because the information is already sitting in `subparts.js` and
   `condition.js` unread by anything the player can see during a fight.

### 2. Spinal and lance weapons as a committed action

#### 2.1 The fiction and the physical premise

A spinal weapon is a weapon you aim by aiming the ship. The Expanse states it plainly: railguns are
"spinal-fixed weapons on ships smaller than battleships and cruisers that require the ship to turn
and face the target", and the *Rocinante*'s keel-mounted gun throws a 1 kg tungsten round at
~9,980 m/s ([Expanse wiki](https://expanse.fandom.com/wiki/Railgun)). The ship becomes the rifle.
`Fixed Forward-Facing Weapon` is a whole trope precisely because the constraint generates drama
([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/FixedForwardFacingWeapon)).

Children of a Dead Earth, which is the most rigorous simulation on the list, arrives at the same
place from physics: recoil "stresses damage weapons and require structural accommodation",
cantilever vibration on firing "causes inaccuracy and potential weapon shattering", and coilguns
with expensive massive projectiles "tend to be limited to select ships which can afford the mass of
their weapons and form the inaccurate but devastating heavy hitters of capital ship combat"
([Space Guns](https://childrenofadeadearth.wordpress.com/2016/06/14/space-guns/)). **A big gun is
a structural commitment before it is a tactical one.** That is exactly what a 1,180 t bow module on
a 62,000 t hull already is in our data.

#### 2.2 How games keep it from being fiddly

- **Homeworld — Ion Cannon Frigate.** The cannon "charges up slowly", fires a single beam that
  "can destroy capital ships in very few shots", has a slow fire rate and "can only fire in one
  direction due to the concentration of its beam". It is helpless against strike craft and
  dominant against capitals ([Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Ion_cannon)).
  The player never micro-manages the charge; they position the frigate and the frigate does the
  rest. Homeworld 3 added an explicit **burn mode with a 45 s cooldown**
  ([HW3 ion frigate](https://homeworld.fandom.com/wiki/Ion_Cannon_Frigate_(HW3))), moving the same
  weapon from a passive property to a pressed button — which is the move this document is making.
- **Nebulous: Fleet Command.** The spinal mount is a `4x12x4` volume and only the Keystone
  destroyer can carry one at all; the payoff is that "the triple tap of the spinal tends to impact
  the same spot making repairs more difficult"
  ([Community guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2439922495),
  [fleet-construction guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3035810215)).
  **The spinal's reward is concentration, not raw damage.** Three hits in one place beat three hits
  spread. We have exactly the machinery to express that: `subsystemAccuracy`, sub-parts, and
  per-section salvage condition.
- **BFG: Armada 2.** Lances have perfect accuracy at all ranges and a flat 25 armour reduction that
  multiplies hugely against heavy targets, but lower DPS than macro cannons and slower reloads, and
  they do **not** benefit from the reload stance; the Nova Cannon is an aimed area weapon limited to
  3 uses per ship whose charge time "will give opponents time to flee from the area-of-effect"
  ([Imperium weapons thread](https://steamcommunity.com/app/573100/discussions/0/3820784984100634611/),
  [Nova Cannon](https://en.namu.wiki/w/%EB%85%B8%EB%B0%94%20%EC%BA%90%EB%85%BC)).
  Note the shape: **precision plus armour-bypass plus low DPS plus a charge you can be punished
  for.** That is a complete archetype contract and we should copy its structure, not its numbers.

**The synthesis — how to make "line the whole ship up and fire once" feel good.** Every successful
version of this weapon obeys the same rule:

> **The player commits to the shot; the game picks the frame.**

The player's input is "I am taking this shot" and then a turn. It is *never* "press exactly now".
Homeworld's frigate charges by itself. BFG's nova cannon is placed and then resolves. The fiddly
versions are the ones that ask for a second, frame-accurate input at the end of a five-second
manoeuvre, which is a reaction test bolted onto a strategy game. Our implementation of this rule is
the auto-release in §2.4.

### 3. Cooldown and commitment — what makes an ability punchy

The game-feel literature is unusually consistent and unusually cheap to apply.

- **Anticipation and follow-through.** A wind-up before the action and a settle after it is the
  single largest contributor; without it, an ability arrives without having been promised
  ([Juice it or lose it, Jonasson & Purho, GDC Europe 2012](https://www.youtube.com/watch?v=Fy0aCDmgnxg)).
- **Screen shake, applied at the *source*, not the impact.** Vlambeer's talk adds shake to the
  camera on the *gun firing* and it "feels really satisfying"; the talk's other durable points are
  permanence (shells, smoke, debris that stay), a camera that leans in the direction of the action,
  and **raising the bass in the fire sound so the gun sounds more powerful**
  ([The Art of Screenshake, Jan Willem Nijman, INDIGO 2013](https://www.youtube.com/watch?v=AJdEqssNZ-U)).
- **Hit stop.** Freezing for ~0.1–0.2 s at the moment of impact reads as weight; one write-up puts
  the perceived-strength gain at around 30%
  ([hit stop / screen shake analysis](https://www.oreateai.com/blog/research-on-the-mechanism-of-screen-shake-and-hit-stop-effects-on-game-impact/decf24388684845c565d0cc48f09fa24)).
  **We are not taking this one** — see §5.1.
- **The cooldown readout is part of the ability.** Everspace 2's ultimate is a single element that
  fills yellow as it charges and goes "completely yellow and glowing with a keybinding reminder"
  at full, and the same key cancels it early ([Everspace wiki](https://everspace.fandom.com/wiki/Ultimate)).
  FTL's charge bars are readable on both your ship and the enemy's, which is how players "judge
  enemy weapon cooldowns using your own cooldown bars"
  ([FTL Weapon Control](https://ftl.fandom.com/wiki/Weapon_Control)). **The bar is not a status
  display, it is the tension carrier.**
- **BFG:A2's stances have cooldowns on the *switch*, not on the effect** — Lock On, Brace For
  Impact and Reload are permanent until you change them, and the cooldown represents how long
  before you may change again ([BFG:A2 command](http://bfga2.wikidot.com/wiki:command)). This is
  the same instinct as our 3 s power spool, and it validates keeping the power widget as the
  stance layer while the salvo is the impulse layer.

### 4. How many active abilities is right

`fun-systems.md` §2 gives the target directly: the reference games offer roughly **four to five
distinct things worth doing every few seconds**, and we currently offer three, all with slow
feedback and no expenditure. It also states the constraint, in "Deliberately not recommended":

> Every active we add should be a stance with a spool, not a cooldown button — which our power
> system already models correctly.

This document takes that seriously and resolves the apparent contradiction as follows. There are
**two kinds of active input** and they must not be confused:

- **Stances** — power routing, BRACE, SILENT, broadside stance. Spooled, reversible, no discrete
  moment. We add none.
- **Impulses** — one committed expenditure with a moment. We add exactly one family: the salvo,
  with three bindings (either side, the axial shot). It is not spammable because the expenditure
  is real and the cooldown is the existing per-mount cooldown, which is 3.2–14 s.

That takes the per-5-second decision count from three to **six**: target, heading, power stance,
*which side to fire*, *whether to fire now or hold for arc*, *whether to spend the charge buffer on
a lance shot or leave it for the beams*. That is inside the reference band and does not require a
hotbar.

---

## Part II — Specification

## 1. THE RIPPLE, exactly

### 1.1 What a "gun" is

The ripple needs per-gun positions. It already has them, unpublished.

`ModuleBuilder.glow(pos, radius, rot)` in `art/geometry/modules/kit.js` records every emitter
aperture into `this._glows` and then merges them into one geometry in `finish()`. The positions are
thrown away. **Change `finish()` to also publish them as data:**

```js
group.userData.muzzles = this._glows.map((g) => g.pos.slice());   // module-local metres, fore-first
```

Zero triangles, zero draw calls, no new authoring. The count that comes out today:

| Module | `glow()` count | `shotsPerBurst` | Match |
|---|---|---|---|
| `port_cannon_bank` | 4 | 4 | yes |
| `port_broadside_battery` | 4 | 4 | yes |
| `port_flak_cluster` | 6 | 6 | yes |
| `port_beam_array` | 3 | 1 | emitters > shots |
| `port_gauss_outrigger` | 1 | 1 | yes |
| `dorsal_vls` | 6 | 6 | yes |
| `bow_siege_lance` | 1 | 1 | yes |

**`shotsPerBurst` already equals the visible barrel count on almost every module in the game.** The
ripple therefore does not need a new timer. It needs the existing burst loop to emit each shot from
a *different* aperture and to space them on a delay the ripple owns.

Definition, for the rest of this document: a **slot** is one (mount, emitter) pair that will produce
one shot in this salvo. `emitterCount = clamp(userData.muzzles.length, 1, 8)`; when a module
publishes no muzzles, fall back to one emitter at the mount origin.

### 1.2 Order — the direction along the hull

**Fore to aft.** Slots are sorted by hull-local `z` **descending**, ties broken by `|x|` descending
then by declaration index.

Three reasons, all checkable:

1. `camera.reset` in `controls.md` §1.3 puts the default camera at `shipHeading − 0.6` rad — a
   three-quarter *rear* view. Fore-to-aft therefore runs the wave from far and small toward near
   and large: a crescendo that terminates on the gun closest to the lens. Aft-to-fore is a
   diminuendo and throws away the loudest beat.
2. The recoil kick (§5.2) accumulates over the sweep, so the ship's largest visible shoulder-away
   coincides with the last and nearest flash.
3. It is one rule for the whole ship and never depends on which way the target is. **The direction
   must never be a player choice.** Naval Action offers Rolling Front / Rolling Back / Random and
   it is the least-loved part of its gunnery, because it is a per-shot input in a game about
   positioning. Ours is a constant the player learns once.

The port and starboard sponsons are deliberately not mirrored — `CRUISER_ANCHORS.port` is at
`z = +130` and `starboard` at `z = +10` (`hardpoints.js`) — so **the port ripple starts 120 m
further forward than the starboard one and sweeps a different span.** That asymmetry is free
character: the two sides do not sound the same, and after twenty minutes the player knows which
side fired without looking.

### 1.3 The delay

```js
export const RIPPLE = {
  step:        0.110,   // s, nominal gun-to-gun delay at cadence 1.0
  stepMin:     0.070,   // s, below this two flashes fuse and the audio gate eats voices
  stepMax:     0.240,   // s, above this the wave stops reading as one event
  cadenceExp:  0.5,     // how hard power routing compresses the wave
  mountGap:    0.090,   // s, extra delay inserted when the sequence crosses to a new mount
  jitter:      0.018,   // s, +/- uniform, seeded. A battery is not a metronome
  sweepMax:    1.250,   // s, soft ceiling on the whole sweep; stepMin overrides it
  deadPause:   0.055,   // s, the hole a dead gun leaves
  frozenPause: 0.140,   // s, longer: a frozen gun visibly tries first
  stutterMax:  2.40,    // cap on the multiplier a worn feed applies to one step
};
```

Per-slot step:

```js
const cadence = Math.max(0.05, powerFactor * fireRateMul(mount.condition) * mount.parts.fireRateMul);
let step = RIPPLE.step / Math.pow(cadence, RIPPLE.cadenceExp);
step = clamp(step, RIPPLE.stepMin, RIPPLE.stepMax);
```

`powerFactor`, `fireRateMul` and `mount.parts.fireRateMul` are the three multipliers `combat.js`
already computes at line 150. **This is the whole point: the ripple step is the existing cadence
number, so the wave is a live readout of power routing, module condition and feed health without a
single new state variable.**

What that produces, using real values from the module registry:

| Situation | cadence | step | Cannon Bank sweep (4 guns, 3 gaps) |
|---|---|---|---|
| Balanced power, pristine | 1.00 | 110 ms | **330 ms** |
| `assault` preset (weapons 0.50 → factor 2.0) | 2.00 | 78 ms | **234 ms** — a bark |
| `run` preset (weapons 0.05 → factor clamped 0.25) | 0.25 | 220 ms | **660 ms** — a long lazy wave |
| Condition 0.45 (`fireRateMul` 0.825) | 0.83 | 121 ms | 363 ms |
| Feed sub-part dead (`fireRateMul` 0.35) | 0.35 | 186 ms | 558 ms |

Routing power to weapons makes the broadside *faster and tighter*; starving it makes the broadside
*slower and longer*. The player hears their power preset in the rhythm of their own guns.

**Whole-sequence assembly.** At trigger time, build the slot list, then walk it:

```
t = 0
for each slot in order:
    if slot.mount !== previous.mount:  t += RIPPLE.mountGap
    slot.time = t + rng.signed() * RIPPLE.jitter
    t += stepFor(slot)
if t > RIPPLE.sweepMax:                            // compress, but never below stepMin
    scale = RIPPLE.sweepMax / t
    rescale every step, clamping each to RIPPLE.stepMin
```

`stepMin` wins over `sweepMax`, so a maximally-armed hull gets a genuinely longer, more spectacular
broadside (~1.5 s at 20 slots) rather than a strobing one. Port and starboard never bear on the
same target (arcs `+20..+160` and `−20..−160`), so a realistic single-target salvo is 5–12 slots
and lands at 0.4–1.25 s.

The jitter is seeded from `world.rng.fork('ripple')`, so a replay of the same fight produces the
same wave. Determinism is not negotiable in this codebase.

### 1.4 The ripple as a readout of battery health

This is the brief's central idea and it is implemented entirely by *what a slot does when it
cannot fire*. **A slot is never silently removed from the sequence.** Removing it would make a
wrecked battery indistinguishable from a small one, which throws away the entire mechanic.

| Condition | Source of truth | What the slot does | Time it occupies |
|---|---|---|---|
| **Healthy** | — | fires from its emitter | full `step` |
| **Barrels dead** | `mount.parts.inert` (an `output` part destroyed), or `emitterIndex >= liveBarrels` | **nothing** — no flash, no round, no sound | `RIPPLE.deadPause` = 55 ms |
| **Worn feed** | `fireRateMul(condition)` and `parts.fireRateMul` | fires, but late | `step × min(1/mul, stutterMax)` — the wave stutters and then catches up |
| **Traverse frozen** | `parts.traverseFrozen` | **fires anyway, down the frozen bearing**, into empty space if the target is outside `frozenAt ± PART_EFFECT.traverseFrozenArc` (0.07 rad). Spends the round, spends the heat, hits nothing | `step + RIPPLE.frozenPause` — the servo tries first |
| **Misfeed** | `misfeedChance(condition)`, rolled once per mount per salvo (existing rule) | this slot and **every remaining slot on that mount** are dropped; `mount.stall = MISFEED_STALL` (2.0 s) | the wave visibly dies halfway down the flank |
| **Cooked mid-sweep** | `thermal.onShot` pushed `heat >= THERMAL.tripAt` | this shot fires, then every remaining slot on that mount is dropped and the mount trips | the wave cuts out early |
| **Ran dry mid-sweep** | `stores.consumeShot()` returned false | remaining slots on that mount dropped; `mount.cooldown = max(cooldown, 0.5)` (existing rule) | as above |
| **Cannot bear at its moment** | `mount.canBear(...)` evaluated **at `slot.time`, not at trigger** | dropped silently | 0 — the sequence closes up |

The frozen-traverse rule deserves defending, because it is the one that costs the player
ammunition for nothing. It is correct because it is the only version that is *visible*: a gun that
silently sits out is indistinguishable from a gun that is fine, and `subparts.js` already promises
the player `ARC FROZEN` as a consequence with teeth. To keep it fair, the armament strip must let
the player **exclude a mount from the salvo** (§2.2) — so a frozen gun firing into the dark is a
thing the player chose not to prevent, which is a decision, not a tax.

Net effect: **the length and shape of your own broadside is a diagnostic.** A pristine port
battery is a clean 0.53 s wave of five. The same battery after a destroyer has worked it over is
0.7 s, has two holes in it, one beat arrives late, and it stops two guns early because the third
mount cooked. Nobody had to write a damage report.

### 1.5 Where the code goes

A new `src/sim/salvo.js` owning one `SalvoController` per ship, with:

```js
class SalvoController {
  arm(side, { immediate = false })   // build slot list, return a plan for the UI to preview
  fire(plan)                          // start the sequence
  fixedUpdate(dt)                     // release slots whose time has come
  get active()                        // true while a sweep is running
}
```

`CombatSystem.fixedUpdate` calls `ship.salvo.fixedUpdate(dt)` **before** `_updateShipWeapons`, and
`_updateShipWeapons` gains one line at the top of its mount loop:

```js
if (mount.fireMode !== 'AUTO') continue;   // SALVO/CHARGE mounts are driven by salvo.js
```

That is the entire structural change to `combat.js`. Everything else in this document is a
constant, a field on `WeaponMount`, or a listener.

---

## 2. THE COMMITTED-FIRE MODEL

### 2.1 Fire modes

Three, stored per mount as `mount.fireMode`, defaulted from the archetype and persisted per module
through refit.

| Mode | Behaviour | Default for |
|---|---|---|
| `AUTO` | today's behaviour: fires whenever a target is in arc | `pd` (**locked**), `flak`, `beam`, `mining` (**locked** while a cut order is live) |
| `SALVO` | holds fire until the player triggers, then runs the ripple | `cannon`, `rail`, `missile` |
| `CHARGE` | holds fire, winds up on a held input, releases once | `lance`; available as an authored override on `rail` |

The player may move any non-locked mount between `AUTO` and `SALVO` from the armament strip.
**`pd` cannot be moved.** Its `fireMode` getter returns `'AUTO'` and the setter is a no-op:

> Point defence is never player-fired. Its whole character is that it saves you without being asked.
> — `armament-brief.md` §2

Concretely, PD is excluded from the salvo trigger, from the ripple, from the salvo heat surcharge,
and from the camera shake. `canAnyWeaponBear` already skips it (`combat.js:382`). Its only
player-facing feedback is retrospective — see §5.5. PD's thermal cost is 0.005/shot, an order of
magnitude below everything else, so it never competes for the thermal budget the player is
managing; it is a system that runs underneath the decision layer and that is deliberate.

Mining is the deliberate opposite of punchy: continuous, industrial, no ripple, no shake, no
exposure lift. **While a mining or tractor head is firing, the salvo camera shake amplitude is
multiplied by zero for that head's shots** so the industrial mode never borrows the combat mode's
vocabulary.

### 2.2 Input

Free after auditing `controls.md` §1.2–§1.10 (`Z`, `B`, `X`, `R`, `H`, `O`, `A`, `T`, `L`, `C`,
`V`, `F`, `G`, `I`, `D`, `Tab`, `Space`, `1`–`8`, `[`, `]` are all taken):

| Input | Action id | Behaviour |
|---|---|---|
| **MMB** (world view only) | `fire.salvo` | Fire every `SALVO` mount that bears on the current target. If both flanks bear on *different* targets, fires the side with more ready mounts |
| `N` | `fire.salvo` | Keyboard alias for the above |
| `,` | `fire.salvo.port` | Port flank only |
| `.` | `fire.salvo.starboard` | Starboard flank only |
| `M` **hold** | `fire.charge` | Wind up every `CHARGE` mount; release on key-up or auto-release (§2.4) |
| `Shift` + any of the above | `fire.*.immediate` | **Fire now.** Skip the trigger-time bearing check; each slot is tested at its own moment instead |
| `Alt` + click a mount cell | `fire.mount.exclude` | Toggle that mount out of / into the next salvo |

MMB is chosen as the primary because the hand is already on the mouse aiming, and because the
tactical view (which owns MMB-drag for panning) is a separate screen context — `controls.md`'s
binding architecture already scopes bindings per context.

**There is no auto-fire toggle for `SALVO` mounts.** A "fire when ready" checkbox would delete the
entire decision one patch after shipping. If the player wants automatic fire they set the mount to
`AUTO`, which is a loadout-level statement with a real cost: an `AUTO` cannon bank does not ripple,
gets no salvo VFX, and — because it fires whenever anything is in arc — will be hot when the
broadside moment arrives.

### 2.3 The salvo: cooldown, and what it costs

**There is no salvo cooldown.** The cooldown is the existing per-mount `def.cooldown`, already
divided by `cadence`, and the salvo simply releases every mount that is ready. This matters: it
means the design adds no new timer to balance, and it means the mount cooldowns already in the
registry (cannon 3.2 s, heavy broadside 5.0 s, twin rails 7.5 s, gauss 6.0 s, VLS 12.0 s,
torpedoes 14.0 s, lance 11.0 s) *are* the tuning surface.

Two rules bound it:

- **Commit lockout** `SALVO.lockout = 0.35 s` — you cannot re-trigger inside your own sweep.
- **Partial salvos are legal.** Firing with three of five mounts ready is allowed and is the
  central decision (§2.5). The HUD prints `SALVO 3/5` before you commit.

The published "cooldown" the player watches is therefore `max(cooldown)` over the mounts assigned
to that side, shown as one arc on the target bracket (§5.4).

#### What is spent

**Heat.** Per shot as today, via `ShipThermal.onShot`, with one new multiplier:

```js
th.heat += th.perShot * (0.75 + 0.35 * powerFactorWeapons) * (salvo ? SALVO.heatMul : 1);
SALVO.heatMul = 1.15;
```

A salvo shot costs 15% more than the same shot in `AUTO` because the whole battery discharges
inside a second and the mount cannot shed between shots. Plus a **ship-level radiator surcharge**:
for `SALVO.surchargeTime = 3.0 s` after a sweep, `ShipThermal.radiate` is multiplied by
`1 − SALVO.radiatorSurcharge` (0.18). The hull dumps a pulse the radiators cannot keep up with.
This is exactly the mechanism `heat.js` already models — it is the same `load`/`radiate` coupling,
driven by an event instead of by a slider.

The arithmetic, from constants already in the codebase:

- Heavy Broadside: `heatPerShot` = `HEAT_PER_SHOT.cannon (0.030) × clamp(340/45, 0.4, 2.2) = 0.066`.
- **Balanced power** (`factor 1.0`): `0.066 × 1.10 × 1.15 = 0.0835`/shot → **0.334 per 4-gun salvo.**
  `radiate` = 0.65, `cool` = `0.085 × (0.4+0.65) = 0.0893/s`; over the 5.0 s cooldown that sheds
  0.446, minus the surcharge ≈ 0.40. **Net negative — you can broadside indefinitely, slowly.**
- **`assault` power** (`factor 2.0`): `0.066 × 1.45 × 1.15 = 0.110`/shot → **0.440 per salvo.**
  `load` = 0.754, `radiate` = 0.496, `cool` = 0.0762/s; cooldown is `5.0/2.0 = 2.5 s`, so it sheds
  ~0.16 per cycle after the surcharge. **Net +0.28 per cycle — the fourth broadside cooks the
  battery.**

That is precisely the alpha-versus-sustain decision `fun-systems.md` §1.4 says we are missing, and
it falls out of two new constants. **A full broadside at assault power is 0.44 of a mount's thermal
capacity — the largest single thermal event in the game**, as the brief asks. Two mounts firing
together plus the surcharge is comfortably the largest ship-level one.

**Ammunition.** Straight through `stores.consumeShot`, per shot, existing code. Salvos per mount
before a reload, from real data:

| Mount | rounds/salvo | `ready` | Salvos before reload | Reload |
|---|---|---|---|---|
| Cannon Bank | 4 shell | 24 | 6 | 6.0 s (21.0 s with a dead feed) |
| Heavy Broadside | 4 shell | 24 | 6 | 6.0 s |
| Twin Rails | 2 railslug | 6 | 3 | 9.0 s |
| Gauss Rail | 1 railslug | 6 | 6 | 9.0 s |
| VLS Cells | 6 missile | **4** | **0 — broken** | 11.0 s |
| Heavy Torpedoes | 4 missile | 4 | 1 | 11.0 s |
| Harpoon Tubes | 2 missile | 4 | 2 | 11.0 s |

**Authoring rule, now binding: on any `SALVO`-mode weapon, `ready >= shotsPerBurst`.** Otherwise the
salvo is structurally unable to complete and the ripple always dies short. `dorsal_vls` violates
this today (see §8.2).

**Power / charge.** Energy weapons draw `def.powerDraw` from `stores.charge` per shot, existing
code. The lance is the interesting case and it is covered in §2.4.

### 2.4 The charge: spinal and lance weapons

`CHARGE` mounts add two fields to `WeaponMount`: `charge` (0..1) and `charging` (bool), ticked in
`Ship.fixedUpdate` alongside `cooldown` and `stall`.

```js
export const CHARGE = {
  time:        2.60,   // s at cadence 1.0
  timeMin:     1.20,   // s, clamp
  timeMax:     6.00,   // s, clamp
  abortRefund: 0.60,   // fraction of drawn charge returned on a cancel
  holdMax:     4.00,   // s you may sit at 100% before it vents
  ventHeat:    0.25,   // heat added when a held charge vents unfired
  dmgFloor:    0.35,   // damage multiplier at 0% charge
  accFloor:    0.55,   // subsystemAccuracy multiplier at 0% charge
};
```

- **Wind-up** takes `clamp(CHARGE.time / cadence, timeMin, timeMax)`, drawing `def.powerDraw`
  linearly from `stores.charge` across it.
- **If the charge buffer empties mid-wind-up the charge STALLS at its current level and holds.** It
  does not fail and it does not drain. The bar visibly stops, which is the legible version of "your
  reactor cannot pay for this shot", and the player's fix is the power widget.
- **Release below 100%** fires at `damage × (dmgFloor + (1−dmgFloor) × charge)` and
  `subsystemAccuracy × (accFloor + (1−accFloor) × charge)`. A half-charged lance does 68% damage at
  78% accuracy: weak and imprecise, but not forbidden.
- **Auto-release.** At 100%, the shot fires **the instant the target enters the arc**, or
  immediately if it is already in arc. The player never has to hit a frame. This is §2.2 of the
  research made mechanical: *the player commits to the shot; the game picks the frame.*
- **Hold.** `Shift` + hold keeps a full charge for up to `holdMax` = 4.0 s while you finish the
  turn. After that it **vents**: the charge is lost, `+0.25` heat, one dull audio cue. The 4-second
  ceiling is what stops "hold the lance forever and only fire on a guaranteed hit".
- **Abort** (release the key before 100%) refunds 60% of the drawn charge. The other 40% is the
  price of a cancelled commitment.

**The lance's real cooldown is not its 11 s timer.** `w_siege_lance` has `powerDraw: 42` against
`STORES.chargeBase: 90`. Regeneration is `supply × 0.85 × dt × 0.1` where `supply = capacity ×
share`, so at 100 capacity:

| Power routing | `supply` | charge/s | Time to refill 42 |
|---|---|---|---|
| `balanced` (0.25) | 25 | 2.13 | **19.8 s** |
| `assault` (0.50) | 50 | 4.25 | **9.9 s** |
| `run` (0.05) | 5 | 0.43 | 98 s |

**The lance is the weapon that makes the power widget matter most**, and it does so with existing
constants. It is also the weapon most directly in competition with a beam array, which drains the
same buffer at 11.7/s while firing.

### 2.5 What you give up by firing early or late

This is the decision the whole system exists to create, and it is real because **the sweep takes
long enough that the ship's rotation during it matters.**

`PlaneBody.effectiveTurnRate()` = `turnRate × (1 − 0.62 × speedFrac²) × steeringEfficiency`, and
the player cruiser is `turnRate: 0.22 rad/s`:

| Speed | Effective rate | Rotation during a 0.9 s sweep |
|---|---|---|
| At rest | 0.220 rad/s | **11.3°** |
| Half speed | 0.186 rad/s | **9.6°** |
| Flank | 0.084 rad/s | 4.3° |

So:

- **Fire early** (`Shift`, "fire now"): each slot is tested at its own moment, so mounts that were
  up to ~10° off bearing at the trigger will have *come onto the target by the time their turn
  arrives*. The wave fills in from the front as the hull swings. You accept a partial salvo — the
  trailing guns may still be short — in exchange for opening fire ~1 s earlier and reaching your
  next cooldown ~1 s earlier. **The turn and the ripple are the same clock.** This is the best
  single idea in the system and it costs one line: evaluate `canBear` at `slot.time` rather than at
  `arm()`.
- **Fire on time**: every assigned mount bears, the whole wave lands, maximum damage into one
  cooldown.
- **Fire late** (hold for a better arc, or for a subsystem to rotate into view): you get better
  `subsystemAccuracy` — which converts directly into salvage condition via
  `condition.degrade`/`salvageState` — at the cost of the DPS you did not do and of a target that
  has closed, possibly inside your minimum useful range or into your own PD envelope.

**There is deliberately no charge-up damage bonus on the broadside.** A hold bonus makes "hold" the
correct default and flattens the decision back into a single answer. Only the lance gets a wind-up,
and its wind-up is a *cost*, not a bonus — a half-charge is worse, a full charge is not better than
baseline.

---

## 3. WEAPON ARCHETYPE TABLE

`aimClass` is derived, not authored: `axial` when `yawWidth <= 0.35 rad` **or**
`tracking <= 0.10 rad/s`; `broadside` when the mount is `port`/`starboard` and `yawWidth >= 2.0
rad`; `traversing` otherwise. Under that rule today: Siege Lance and Gauss Rail are `axial`, Twin
Rails (`tracking: 0.12`) are `traversing`, the cannon banks and beam arrays are `broadside`.

| Archetype | The combat MOMENT | Timing envelope | Costs | Salvage character |
|---|---|---|---|---|
| **Spinal / lance** (`lance`, `axial` rails) | Aim by turning 1,400 m of hull. From a beam bearing, ±9° of an 18° arc is **~8.4 s of turning** at half speed. Then a 2.6 s wind-up, then one enormous hit. Missing costs you the whole approach | charge 2.6 s → shot → 11.0 s timer, but really **10–20 s of charge-buffer refill** governed by the weapons channel | 42 of a 90-unit charge buffer; 0.075 × 2.2 = 0.165 heat (low); no ammunition | `subsystemAccuracy 0.72`. **The precision killer. Rich corpses.** |
| **Broadside battery** (`cannon` on `port`/`starboard`) | The ripple. Present the flank, hold it, release. 140° arc means the target is either in it or 15 s away | sweep 0.33–0.90 s → 3.2–5.0 s cooldown (halved at assault power) | 4 shells; **0.334–0.440 of a mount's thermal capacity per salvo** — the largest thermal event in the game | `subsystemAccuracy 0.30–0.42`. **Cheap kills that make poor corpses** |
| **Turreted** (`rail`, `beam` on `dorsal`) | No drama, by design. 306° traverse, tracks on its own, fills the gaps between the dramatic weapons and makes them affordable | beam 2.4 s, rails 7.5 s; `AUTO` by default | rails cook fastest in the game (0.209/shot × 2 = 0.46 per burst); beams drain the charge buffer at 11.7/s | `subsystemAccuracy 0.55–0.62`. The workhorse salvager's gun |
| **Missile cells** (`missile`) | Fire and **worry**. 300 m/s over 12 km is a **40 s flight**; you watch them go and you find out later | salvo 6 cells in ~0.55 s → 12.0 s cooldown → 11.0 s reload of the ready feed | 6 missiles from a 48-round magazine — **8 full salvos in the whole hull**; almost no heat (0.004/shot) | `subsystemAccuracy 0.20`. Missiles are for killing, not for shopping |
| **Point defence** (`pd`, and `flak` by default) | **Never player-fired.** You find out it worked because the thing that was going to hit you did not | 0.8 s cycle, 8 rounds/burst, 900 m bubble, always on | 0.005 heat/shot — invisible; 900-round magazine | not a salvage instrument |
| **Mining / cutting** (`mining`) | Deliberately the opposite of punchy. Sustained, industrial, no ripple, no shake, no exposure lift | 0.5 s cycle, continuous while a cut order lives | 12–14 charge/shot; low heat | it *is* the salvage instrument |

### 3.1 Two spinal mounts versus two broadsides — the ships these make

The brief requires these to be genuinely different ships. They are, and the difference is
quantified from real constants.

| | **Two axial mounts** (bow Siege Lance + Gauss Outrigger) | **Two broadsides** (port + starboard Heavy Broadside) |
|---|---|---|
| Where you are dangerous | A **±9° cone dead ahead**, out to 6.8–9.5 km | Two 140° flanks, out to 5.2 km — but **never the same flank at once** |
| Bringing it to bear | 8.4 s to swing 90° at half speed. Then hold the heading through a 2.6 s charge | 15–17 s to swing 90°; then hold the beam, which the `B` broadside stance automates |
| Switching threat | Re-aim the whole hull: another 8 s per target | **Swapping flanks is a 180° turn: 17 s at half speed, 38 s at flank.** The other battery is dead weight for that whole time |
| The per-5-second decision | *Do I release the charge now at 70%, or hold and finish the turn?* | *Do I fire both batteries at their own targets, or alternate one side so it cools?* — two 5.0 s mounts alternating gives a salvo every 2.5 s with each mount getting a full 5 s to shed |
| Binding constraint | **Charge buffer.** 90 units, 42 per shot, 10–20 s to refill. You are power-limited | **Heat.** Four salvos at assault power and the battery is offline for 4.5 s |
| Correct power routing | `run` — you need turn authority to aim, and the charge refills either way | `assault` for burst, `balanced` to sustain. The routing is a live decision |
| Failure mode | Something fast gets inside 9° and you cannot answer it at all | Something sits in your 40° bow blind wedge and you eat it |
| What the wrecks look like | `subsystemAccuracy 0.66–0.72` → precise kills, high-condition sections, **the loadout that pays for itself in salvage** | `subsystemAccuracy 0.42` → shredded hulls, `salvageState` mostly `DAMAGED`, **you kill faster and earn less** |
| The sentence the player says | "I have one shot. Line it up." | "Port battery is cooking. Come about." |

That last row is the point. `condition.js` already turns `subsystemAccuracy` into salvage quality
through `degrade()` and `salvageState()`. **Naming it as an archetype contract costs zero code and
makes the loadout a statement about how you want to earn, not just how you want to fight.**

---

## 4. INTERLOCKS, against the real code

### 4.1 `sim/heat.js` — a full broadside is the largest thermal event in the game

- `ShipThermal.onShot(mount, powerFactorWeapons)` gains a third argument `salvo` and multiplies by
  `SALVO.heatMul` (1.15). One line.
- `ShipThermal` gains `surchargeTimer`; `update()` multiplies `this.radiate` by
  `1 − SALVO.radiatorSurcharge` while it runs. Two lines, and it reuses the existing
  `radiate`/`load` model rather than adding a parallel one.
- A trip inside a sweep already works: `trip()` sets `mount.online = false`, `offlineReason =
  'heat'` and `burstRemaining = 0`, and the armament strip already renders `COOKED`. The salvo
  controller only has to drop that mount's remaining slots.
- `THERMAL.tripStructureDamage` (16) already carries the trip through to `hardpoint.structureHP`,
  which is the game's one irreversible loss (`fun-systems.md` §4.2). **A player who alpha-strikes
  every engagement is spending hardpoint structure to do it**, and that is now visible as a
  shortened ripple before it is visible as a breach warning.
- `ShipThermal.purge()` already exists, costs one coolant charge, and removes 55% of every mount's
  heat. It is the natural counterplay to a salvo-heavy fit and needs no change. It belongs on the
  device hotbar (`ui/weapons.js` already reserves keys `4`–`8`).

### 4.2 `sim/stores.js` — ammunition

- No change to `consumeShot`, `beginReload` or `_finishReload`. The salvo calls them per shot, as
  `combat.js` does today at line 156.
- `blockedReason(mount)` is called once per mount at `arm()` time so the salvo preview can print
  `SALVO 3/5 · 1 RELOAD · 1 DRY` before the player commits. The gap between `bearing` and `ready`
  in `CombatSystem.bearingReport` is already this exact readout and the HUD already draws it.
- **`ready >= shotsPerBurst` is now an authoring invariant.** Add it to the `contracts.js`
  validator so a module that cannot complete its own salvo fails at registration rather than in a
  fight.
- Propellant: see §5.2 — recoil delta-v must be excluded from the bill, or the game charges you
  propellant for firing your guns, which is not a decision anyone made.

### 4.3 `sim/power.js` — the weapons channel governs cycle time

Three separate things now hang off `power.factor('weapons')`, all from the one existing expression
in `combat.js:150`:

1. **Cooldown**, as today. `assault` halves it.
2. **The ripple step**, via `RIPPLE.cadenceExp = 0.5`. `assault` takes a cannon bank's sweep from
   330 ms to 234 ms; `run` stretches it to 660 ms.
3. **The lance wind-up**, via `CHARGE.time / cadence`, and the charge-buffer refill rate through
   `ShipStores.update`.

And it pulls the other way through `PowerPlant.thermalLoad` → `ShipThermal.radiate`, exactly as
`heat.js`'s header claims. **After this change the weapons channel is the single most consequential
slider in the game**, and its consequences are audible: you can hear your own power preset in the
rhythm of the broadside.

The 3-second spool (`spoolRate: 0.34`) is what makes it a prediction problem. Routing to `assault`
*during* a sweep does nothing for that sweep; you had to have decided three seconds ago. That is
the same skill `power.js`'s header already names and the salvo puts a loud, discrete moment on it.

### 4.4 `sim/subparts.js` and `sim/condition.js` — worn feeds stutter, dead traverse freezes

Everything the ripple needs is already computed and cached on `ModuleParts.refresh()`:

| Field | Already means | Ripple reads it as |
|---|---|---|
| `parts.fireRateMul` (0.35 with a dead feed) | rate of fire | **step multiplier** — that beat arrives 2.4× late |
| `parts.inert` (an `output` part dead) | module will not fire | **a 55 ms hole in the wave** |
| `parts.traverseFrozen` + `parts.frozenAt` | arc frozen at `±0.07 rad` | **fires down the frozen bearing, into space** |
| `parts.coolingMul` (0.45 with dead radiators) | cooks in half the time | **the mount that cuts out first, mid-sweep** |
| `parts.detached` / `wantsDetach` | the module fell off intact | not in the sequence at all |
| `fireRateMul(condition)` | worn feed | step multiplier, multiplied with the above |
| `misfeedChance(condition)` | jams sometimes | **the wave dies halfway down the flank** |
| `traverseMul(condition)` | tracks badly | fewer slots pass `canBear` at their moment |

**Not one of these needs a new field.** The brief's "the ripple should be a readout of the
battery's health" is achievable by reading state that is already there and already correct, and
that is why it is worth building first.

There is one feedback loop worth naming: `THERMAL.tripConditionLoss` (0.02) means every cook
permanently degrades the module's `condition`, which raises `misfeedChance` and lowers
`fireRateMul`, which makes the ripple raggeder. **A battery you have repeatedly over-fired
gradually develops a stutter and then holes.** That is free, causal storytelling running from the
player's own choices, and it is exactly the "how you fought decides what you have" premise the game
is built on.

### 4.5 `sim/combat.js` — the fire site

- `_updateShipWeapons` gains the `fireMode !== 'AUTO'` guard. Nothing else changes.
- `_fire` gains an `emitter` argument and uses `emitter.worldPosition` as the origin for both
  `EV.WEAPON_FIRED` and the projectile spawn. **This one change is most of the visual ripple**, and
  it also fixes a subtler thing: today every shot of a four-gun burst spawns from the same point, so
  a casemate with 200 m of barrel row emits all four tracers from its centre.
- `bearingReport` gains `salvoReady` (count of `SALVO` mounts that bear and are unblocked) and
  `salvoIn` (`max` remaining cooldown among them) so the HUD needs no second traversal.

---

## 5. FEEDBACK

`src/vfx/` already has the GPU particle system (`particles.js`), tracers and hitscan beams
(`weapons.js`), expanding shock rings (`rings.js`), and a muzzle-flash implementation
(`WeaponVFX.onWeaponFired`) that already distinguishes `heavy` (rail/lance/cannon) from `beamish`
and already throws a directional spark spatter down the bore. `src/render/postfx.js` already
exposes a transient `exposureScale` and a `vignette` uniform. `src/audio/weapons.js` already has
one hand-built instrument per weapon type with per-faction tuning.

**What is missing is: camera shake (nothing anywhere in `src/camera/`, `src/render/` or `src/ui/`
mentions it), a recoil term on the hull, per-emitter origins, and a pre-charge event for audio.**

### 5.1 The one thing we are not taking

**No hit stop.** The research is clear that a 0.1–0.2 s freeze reads as weight, and it is wrong
here for three reasons: the sim is a fixed 60 Hz accumulator, the player can be running at 2× or
4× (`TIME_SCALES_COMBAT`), and this is a game about 1,400 m objects with momentum where a
discontinuity in time reads as a hitch rather than as impact. **Weight in this game is carried by
the ripple's duration and by the hull's reaction, not by stopping the clock.**

### 5.2 World-space: recoil on the hull

Two additions to `PlaneBody`, both tiny:

```js
this.recoilBank = 0;   // radians, cosmetic roll, decays at RECOIL.bankDecay
// in applyTo():  object3D.rotation.set(0, this.heading, this.bank + this.recoilBank, 'YXZ');
```

Per shot:

```js
const k = (def.damage ?? 300) / 300;
body.velocity.addScaledVector(mount.worldForward, -RECOIL.dv * k);   // lateral shove
body.recoilBank += RECOIL.bank * k * sideSign;                        // shoulder away
```

`RECOIL.dv = 0.045 m/s`, `RECOIL.bank = 0.012 rad`. A four-gun Heavy Broadside salvo
(`damage: 340`, `k = 1.13`) therefore produces **0.204 m/s of lateral push and 0.054 rad (3.1°) of
roll**, accumulated across the sweep so the roll peaks on the last and nearest gun.

The lateral push is then bled off by the existing line in `PlaneBody.integrate`:

```js
lateral.multiplyScalar(Math.max(0, 1 - 0.55 * dt));
```

— a ~1.26 s half-life, so the ship visibly slides off the beam and settles. **We do not need new
physics; the drift model already tuned for turning does exactly the right thing to a recoil
impulse.**

> **Required, or the numbers lie.** `ShipStores._updatePropellant` bills propellant against
> *measured* velocity change, so a recoil impulse would be charged to the player as manoeuvring
> fuel. Advance `stores._prevVel` by the same impulse when recoil is applied, so the shove itself
> is free and only the *correction burn* the move controller makes to get back on course is billed.
> That is the correct model and it is a nice consequence: **a long broadside costs you a little
> propellant to hold your heading afterwards.**

### 5.3 Screen-space

| Moment | Effect | Numbers |
|---|---|---|
| **Trigger** (t = 0) | Participating armament cells flash their state chip solid; a one-line banner `SALVO · PORT · 2 MOUNTS · 8 GUNS`; each committed mount's `traverse` locks (stops tracking) — a visible tell that the guns have been ordered | chip flash 120 ms |
| **Per shot** | Camera shake impulse, **rotational** so it is zoom-independent: amplitude `SHAKE.perShot × (damage/300)`, accumulating, capped, decaying `exp(−t/τ)` at `SHAKE.freq`. Direction opposes `mount.worldForward` | `perShot 0.0022` of viewport height (≈1.8 mrad at fov 46), `max 0.009` (≈9.7 px at 1080p), `τ 0.16 s`, `freq 22 Hz`, **zero above `camera.distance > 9000 m`** and **zero for `pd`/`mining`** |
| **Whole sweep** | One exposure transient, not one per shot: `postfx.exposureScale` steps to 1.06 on the first shot and eases back to 1.0 over `sweep + 0.4 s`. The whole ripple reads as one brightening rather than a strobe | 1.06, ease-out |
| **Last shot** | One shock ring at the centroid of the firing flank, 0 → 420 m over 0.5 s, alpha 0.18, via the existing `rings.shockwave` | one per salvo, never per shot |
| **Completion** | Every participating cell flips to its cooldown state on the same frame — the visual "clunk" of a whole battery going down together. `EV.SALVO_COMPLETE { fired, dropped, reasons }` lets the HUD print `SALVO 6/8 · 2 DEAD` | — |

Shake must be specified in **screen fraction / camera rotation**, not world metres: the camera runs
from 260 m to 46,000 m (`CAMERA.minDistance`/`maxDistance`), so a positional offset in metres is
invisible at one end and violent at the other.

### 5.4 During cooldown — the bar is the tension carrier

Everspace 2's ultimate and FTL's charge bars both work because the readout *is* the ability. Ours:

- **One arc on the world-space target bracket**, filling over `max(cooldown)` of the assigned side.
  Neutral ink while filling; **flips to amber only at 100%** — `ui/weapons.js` states the rule
  ("amber means this is costing you something right now") and a ready battery is exactly that,
  because a loaded gun you are not firing is waste.
- Per-mount detail stays where it already lives, in the armament strip. No second widget.
- Charge weapons show a second, thinner arc that fills over the wind-up, so a lance shows *two*
  clocks: the cooldown and the charge. When the charge stalls for want of buffer, the arc stops
  visibly at its current value rather than turning red.
- One dry tick at 100%, gated per side, once.

### 5.5 Audio

Existing `WeaponAudio.fire()` is already per-shot and per-type with per-faction tuning. Four
changes, all small:

1. **Gate key.** `GATE.cannon` is 30 ms and keys on `w:${type}:${opts.key}`. The caller must pass
   `key = hardpoint + ':' + emitterIndex` or consecutive guns in the same battery will suppress each
   other at `stepMin` = 70 ms. Today `combat.js` passes no key at all.
2. **Pitch contour.** Slot *k* of *n* gets `size × (1 + (k − (n−1)/2) × 0.018)`. `_cannon` computes
   `k = v.f / size^0.55`, so the wave descends slightly in pitch as it runs aft. **That contour is
   how the ear tracks the direction of the wave**, and it is the reason a ripple sounds like one
   event rather than like six.
3. **The terminal beat.** One `subThump` at 38 Hz over 0.42 s on the last shot only. Vlambeer's
   "raise the bass and the gun sounds more powerful", applied once per salvo rather than per shot
   so it does not turn to mud.
4. **Pre-charge.** `audio/weapons.js#_rail` currently says, in a comment: *"a real pre-charge would
   need combat to tell us a shot is coming, and that is a coupling this stream refuses to take."*
   The salvo controller now knows a shot is coming, `CHARGE.time` before it arrives. **Add
   `EV.WEAPON_CHARGING { ship, mount, duration }`** and let the rail and lance instruments run their
   real wind-up. This is the anticipation phase the game-feel research puts first, and it was
   blocked only by a missing event.

Spatialisation is already free: emitters on a 1,400 m hull are 100–400 m apart, which at the
default 3,200 m camera distance is a genuine stereo spread. **The wave pans across the mix.**

**Time-scale rule.** Ripple times are sim seconds, so at 4× a 0.9 s sweep is 225 ms of real time
and the gate will eat most of it. Above `timeScale 2`, `WeaponAudio` thins a salvo to the first
shot, the last shot, and every second shot between, at `size × 1.15`. The wave keeps its shape and
stops sounding like a zip.

### 5.6 Permanence

The third of Vlambeer's durable points, and the cheapest: the salvo should leave something behind.
`vfx/particles.js` already has `PKIND.EMBER` with a 1.1–1.8 s life. Spec: each `heavy` slot emits
**4 embers on a slow drift aft** from its emitter, so for a second and a half after a broadside the
ship trails a line of cooling sparks down the flank that fired. It costs 32 particles and it is the
only visual in the game that says *this side fired recently*.

---

## 6. TUNING TABLE

Every number introduced by this document. Nothing here is derived at runtime from anything not in
this table or already in the codebase.

### 6.1 `RIPPLE` — `sim/salvo.js`

| Constant | Value | Unit | What it does | Change it if |
|---|---|---|---|---|
| `step` | 0.110 | s | nominal gun-to-gun delay at cadence 1.0 | the wave reads as a volley (raise) or as lag (lower) |
| `stepMin` | 0.070 | s | floor; below this flashes fuse and the audio gate bites | — |
| `stepMax` | 0.240 | s | ceiling; above this the wave stops being one event | — |
| `cadenceExp` | 0.5 | — | how hard power routing compresses the wave | 1.0 makes routing dominate the rhythm; 0 removes the read |
| `mountGap` | 0.090 | s | extra delay when the sequence crosses to a new mount | multi-mount salvos read as one battery (lower) or as two (raise) |
| `jitter` | ±0.018 | s | seeded per-slot wobble | a metronome (lower) vs sloppy (raise) |
| `sweepMax` | 1.250 | s | soft ceiling on a whole sweep; `stepMin` overrides | Naval Action's 7 s is the failure line |
| `deadPause` | 0.055 | s | the hole a dead gun leaves | holes must be *felt*, not just seen |
| `frozenPause` | 0.140 | s | a frozen gun tries, then fires down its frozen bearing | — |
| `stutterMax` | 2.40 | × | cap on a worn feed's step multiplier | — |
| order | fore → aft | — | sort by hull-local `z` descending | never make this a player choice |

### 6.2 `SALVO` — `sim/salvo.js`

| Constant | Value | Unit | What it does |
|---|---|---|---|
| `lockout` | 0.35 | s | cannot re-trigger inside your own sweep |
| `heatMul` | 1.15 | × | a salvo shot costs 15% more heat than the same shot on `AUTO` |
| `radiatorSurcharge` | 0.18 | fraction | `ShipThermal.radiate` reduction after a sweep |
| `surchargeTime` | 3.0 | s | how long the surcharge runs |
| `minMounts` | 1 | count | partial salvos are legal, down to one mount |

### 6.3 `CHARGE` — `sim/salvo.js`

| Constant | Value | Unit | What it does |
|---|---|---|---|
| `time` | 2.60 | s | wind-up at cadence 1.0; divided by cadence |
| `timeMin` / `timeMax` | 1.20 / 6.00 | s | clamps |
| `abortRefund` | 0.60 | fraction | charge returned on a cancel |
| `holdMax` | 4.00 | s | how long a full charge may be held before it vents |
| `ventHeat` | 0.25 | fraction of capacity | cost of venting an unfired charge |
| `dmgFloor` | 0.35 | × | damage multiplier at 0% charge |
| `accFloor` | 0.55 | × | `subsystemAccuracy` multiplier at 0% charge |
| auto-release | on | — | fires the instant the target enters arc at 100% |

### 6.4 `RECOIL` — `sim/physics.js`

| Constant | Value | Unit | What it does |
|---|---|---|---|
| `dv` | 0.045 | m/s per shot | lateral shove, scaled by `damage/300` |
| `dvCap` | 0.90 | m/s per salvo | ceiling |
| `bank` | 0.012 | rad per shot | cosmetic roll, scaled by `damage/300` |
| `bankDecay` | 2.2 | /s | roll settle rate |
| `bankCap` | 0.075 | rad (4.3°) | ceiling |
| propellant | excluded | — | advance `stores._prevVel` by the impulse |

### 6.5 `SHAKE` / screen — `camera/`, `render/postfx.js`

| Constant | Value | Unit | What it does |
|---|---|---|---|
| `perShot` | 0.0022 | fraction of viewport height | rotational camera impulse, scaled by `damage/300` |
| `max` | 0.009 | fraction (≈9.7 px at 1080p) | ceiling |
| `tau` | 0.16 | s | decay |
| `freq` | 22 | Hz | oscillation |
| `distanceCutoff` | 9000 | m | above this, zero shake — at tactical zoom it is noise |
| `typeMul` | pd 0, mining 0, others 1 | × | industrial and defensive weapons do not shake |
| `exposurePeak` | 1.06 | × | one transient per salvo, eased back over `sweep + 0.4 s` |
| `ringRadius` | 420 | m | one shock ring per salvo, 0.5 s, alpha 0.18 |
| `chipFlash` | 120 | ms | armament cell flash at trigger |

### 6.6 Audio — `audio/weapons.js`

| Constant | Value | Unit | What it does |
|---|---|---|---|
| gate key | `w:{type}:{hardpoint}:{emitter}` | — | stops guns in one battery gating each other |
| `pitchWalk` | 0.018 | per slot from centre | the wave's melodic contour |
| `terminalSub` | 38 Hz / 0.42 s | — | one sub thump on the last shot only |
| `thinAbove` | 2.0 | time scale | thin to first / last / every-other, `size × 1.15` |
| `EV.WEAPON_CHARGING` | new | — | unblocks a real pre-charge for rail and lance |

### 6.7 Per-module derived values (no authoring change except where noted)

| Module | Mode | Slots | Sweep @ balanced | Cooldown | Heat/salvo | Rounds/salvo |
|---|---|---|---|---|---|---|
| Cannon Bank | SALVO | 4 | 330 ms | 3.2 s | 0.290 | 4 shell |
| Heavy Broadside | SALVO | 4 | 330 ms | 5.0 s | **0.334** | 4 shell |
| Gauss Rail | SALVO | 1 | — | 6.0 s | 0.240 | 1 railslug |
| Twin Rails | SALVO | 2 | 110 ms | 7.5 s | 0.481 | 2 railslug |
| VLS Cells | SALVO | 6 | 550 ms | 12.0 s | 0.011 | 6 missile ⚠ **`ready` 4 → 6** |
| Heavy Torpedoes | SALVO | 4 | 330 ms | 14.0 s | 0.010 | 4 missile |
| Siege Lance | CHARGE | 1 | 2.6 s wind-up | 11.0 s (really 10–20 s of buffer) | 0.165 | 42 charge |
| Beam Array | AUTO | 3 | — | 2.4 s | 0.121 | 28 charge |
| Flak Cluster | AUTO | 6 | — | 2.0 s | 0.145 | 6 flakcan |
| PD Ring | AUTO **locked** | 4 | — | 0.8 s | 0.006 | 8 pdslug |
| Cutting Array / Tractor | AUTO **locked** | 3 | — | 0.5 s | 0.033 | 12–14 charge |

Port + Heavy Broadside + Gauss Rail, together: 5 slots, 4 gaps × 110 ms + 1 `mountGap` 90 ms =
**530 ms sweep**.

---

## 7. The four-question test

From `scope-decision.md`. A system that cannot answer all four does not get built.

### 1. What decision does this create?

Four, all at the 5-second tier that `fun-systems.md` §2 measures as close to empty:

- **Which side.** Port and starboard arcs never overlap, so a two-broadside ship must choose, and
  the wrong choice is a 17–38 s turn.
- **Now or on the arc.** `Shift`-fire opens up to ~10° early and lets the wave fill in as the hull
  swings; waiting lands the whole salvo and better subsystem accuracy. **The turn and the ripple
  are the same clock.**
- **Alpha or sustain.** Four salvos at `assault` power cooks a battery for 4.5 s and 16 hardpoint
  structure; `balanced` broadsides indefinitely and slowly. The power spool means you had to have
  decided three seconds ago.
- **Spend the charge buffer or leave it.** A lance shot is 42 of 90, and the beams are drinking
  from the same tank at 11.7/s.

### 2. What does it interlock with?

Everything it touches already existed and already had consequences: `heat.js` (per-shot heat, trip,
radiator budget, `tripStructureDamage` into the one irreversible loss in the game), `stores.js`
(rounds, ready feed, reload, charge buffer, propellant), `power.js` (cooldown, ripple rhythm, charge
wind-up, buffer refill, thermal load, the 3 s spool), `subparts.js` (five failure modes, each of
which changes the shape of the wave), `condition.js` (rate, damage, misfeed, cooling, and — through
`subsystemAccuracy` — the salvage the kill leaves behind), `physics.js` (turn rate against sweep
duration; lateral drift against recoil).

**Not one new state variable is introduced on the ship.** The salvo controller owns a slot list for
the duration of a sweep and nothing else.

### 3. What does it abstract?

Stated explicitly, so nobody builds them later by accident:

- **No per-gun ballistics.** Guns within a mount share `damage`, `spread`, `range` and a single
  `mount.traverse`. Only the *origin* and the *timing* differ. Per-barrel wear would be four times
  the state for a difference the player cannot see at 3,200 m.
- **No loading, no crew, no ammunition handling.** `scope-decision.md` excludes crew outright.
  Cosmoteer's carry-the-shell-to-the-gun loop is the thing `ShipStores.beginReload` abstracts into
  one number, and the `feed` sub-part is the only place that abstraction is allowed to leak.
- **No smoke occlusion.** Naval Action's rolling fire is disliked partly because earlier guns
  obscure the target for later ones. In vacuum that is not even physical, and it would convert the
  ripple from a performance into an obstacle.
- **No ripple *direction* choice.** Naval Action offers three and it is a per-shot input in a game
  about positioning.
- **No firing on the up-roll / down-roll.** That historical decision is "what am I trying to
  destroy", and we already have it, better, as subsystem targeting.
- **No hit stop.** §5.1.
- **No charge-up damage bonus on the broadside.** §2.5.

### 4. Can the player see it?

This is the question the system is built around, not one it has to survive.

- **The ripple itself is the readout.** Its length reads power routing; its holes read dead barrels;
  its stutters read worn feeds; where it stops reads heat and magazine; a gun firing into empty
  space reads a frozen traverse ring. Every one of those is a state that today changes outcomes and
  is invisible during a fight, which `scope-decision.md` calls a bug rather than depth.
- **The commit preview** prints `SALVO 3/5 · 1 RELOAD · 1 DRY` *before* the player spends anything,
  built from `bearingReport`, which already computes exactly those counts.
- **The cooldown arc** is on the target bracket the player is already looking at, and the per-mount
  detail is in the armament strip that already exists and already renders `COOKED`, `DRY`, `JAM`,
  `RELOAD`, `INERT` and the sub-part squares.
- **`EV.SALVO_COMPLETE`** reports what did not fire and why, in words.

---

## 8. Defects found in the code while writing this

Reported here because two of them block parts of this spec.

### 8.1 Point defence cannot destroy a missile — **blocks the missile archetype**

`CombatSystem._nearestIncoming` (`combat.js:183`) finds the nearest hostile projectile with
`tracking > 0`, returns its `projectileIndex`, and PD fires a `pdslug` at its position. But
`_updateProjectiles` (`combat.js:303`) only tests projectiles against **ship** spheres — there is no
projectile-versus-projectile resolution anywhere, and `projectileIndex` is never read by the caller.

**PD aims at missiles and can never hit one.** The missile archetype's entire moment is "flight
time, interception risk", and interception does not currently exist. Fix: give guided projectiles an
`hp` column in `ProjectilePool` and resolve `pdslug`/`flak` shots against tracking projectiles.

### 8.2 `dorsal_vls` cannot complete its own burst

`w_vls_cells` has `shotsPerBurst: 6` and no `ready` override, so `readyMax` falls back to
`AMMO_SPEC.missile.ready = 4`. `consumeShot` returns false on shot 5, `burstRemaining` is zeroed and
`cooldown` is forced to 0.5 s. **A "six vertical launch cells" module fires four missiles and
stops**, every time, for ever. Fix: `ready: 6` on the weapon def, and add
`ready >= shotsPerBurst` to the `contracts.js` validator.

### 8.3 Muzzle positions are computed and discarded

`ModuleBuilder.glow()` records every emitter aperture in `this._glows` and `finish()` merges them
into one geometry, throwing the positions away. Every shot of a four-gun burst therefore spawns
from `mount.worldPosition` — the centre of a casemate that may be 200 m wide. One line in `finish()`
(§1.1) publishes them and costs nothing.

### 8.4 `WeaponAudio` is never passed a gate key

`WeaponAudio.fire()` gates on `w:${type}:${opts.key ?? ''}` at 30 ms for cannon. No caller passes
`key`, so **every cannon on the ship shares one gate**, and any two shots inside 30 ms silently lose
one. It does not bite at today's `burstInterval` of 220 ms; it will bite immediately at
`RIPPLE.stepMin` of 70 ms with two mounts interleaving.

---

## Sources

**Age of Sail gunnery**
- [The Broadside — Military History Matters](https://www.military-history.org/fact-file/the-broadside.htm)
- [Broadside: Ships and Tactics — Nelson's Navy](https://www.nelsonsnavy.co.uk/broadside5.html)
- [Gunnery tactics in the Age of Sail — ClassX](https://classx.org/gunnery-tactics-in-the-age-of-sail/)
- [Trafalgar: A Predestined Victory — USNI Proceedings, Oct 2005](https://www.usni.org/magazines/proceedings/2005/october/trafalgar-predestined-victory)
- [Battle of Trafalgar — britishbattles.com](https://www.britishbattles.com/napoleonic-wars/battle-of-trafalgar/)
- [Broadside (naval) — Wikipedia](https://en.wikipedia.org/wiki/Broadside_(naval))
- [Naval artillery in the Age of Sail — Wikipedia](https://en.wikipedia.org/wiki/Naval_artillery_in_the_Age_of_Sail)

**Naval combat games**
- [How do I volley fire simultaneously? — Naval Action, Steam](https://steamcommunity.com/app/311310/discussions/1/412446292771156226/)
- [Understanding the different gunnery modes — Game-Labs forum](https://forum.game-labs.net/topic/14386-understanding-the-different-gunnery-modes/)
- [Naval Combat — Sid Meier's Pirates! wiki](https://sidmeierspirates.fandom.com/wiki/Naval_Combat)
- [Cannons — Sid Meier's Pirates! wiki](https://sidmeierspirates.fandom.com/wiki/Cannons)
- [AC Black Flag Resynced advanced naval combat guide — ConsolePulse](https://consolepulse.com/multiplatform/assassins-creed/guides/assassins-creed-black-flag-resynced-advanced-naval-combat-guide)
- [AC Black Flag Resynced ship combat guide — GameNGuide](https://www.gamenguide.com/articles/108559/20260715/assassins-creed-black-flag-resynced-ship-combat-guide-cannons-boarding-looting.htm)
- [Assassin's Creed Rogue — IMFDB (Morrigan armament)](https://www.imfdb.org/wiki/Assassin's_Creed_Rogue)
- [Cannons should reload 3× faster — Sea of Thieves forum](https://www.seaofthieves.com/community/forums/topic/139426/cannons-should-reload-3x-faster)
- [Rapid fire cannons — Sea of Thieves forum](https://www.seaofthieves.com/community/forums/topic/40029/rapid-fire-cannons-possible-exploit)

**Spinal / lance weapons**
- [Railgun — The Expanse wiki](https://expanse.fandom.com/wiki/Railgun)
- [Fixed Forward-Facing Weapon — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/FixedForwardFacingWeapon)
- [Ion cannon — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Ion_cannon)
- [Ion Cannon Frigate (Homeworld) — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Ion_Cannon_Frigate_(Homeworld))
- [Ion Cannon Frigate (HW3) — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Ion_Cannon_Frigate_(HW3))
- [Community Guide to NEBULOUS Mechanics — Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=2439922495)
- [Constructing a 3,000-point fleet in Nebulous — Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3035810215)
- [Components — NEBULOUS: Fleet Command official wiki](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Components)
- [Space Guns — Children of a Dead Earth dev blog](https://childrenofadeadearth.wordpress.com/2016/06/14/space-guns/)
- [Railgun — Children of a Dead Earth wiki](https://coade.fandom.com/wiki/Railgun)
- [Imperium weapons overview and shields — BFG:A2, Steam](https://steamcommunity.com/app/573100/discussions/0/3820784984100634611/)
- [Nova Cannon — NamuWiki](https://en.namu.wiki/w/%EB%85%B8%EB%B0%94%20%EC%BA%90%EB%85%BC)
- [Ship command and control — BFG:A2 wiki](http://bfga2.wikidot.com/wiki:command)
- [The Battlefleet Gothic Armada 2 Guide — Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=1630983976)

**Commitment, cooldown and game feel**
- [Juice it or lose it — Martin Jonasson & Petri Purho, GDC Europe 2012](https://www.youtube.com/watch?v=Fy0aCDmgnxg)
- [The Art of Screenshake — Jan Willem Nijman (Vlambeer), INDIGO 2013](https://www.youtube.com/watch?v=AJdEqssNZ-U)
- [Squeezing more juice out of your game design — Game Developer](https://www.gamedeveloper.com/design/squeezing-more-juice-out-of-your-game-design-)
- [Research on screen shake and hit stop effects on game impact](https://www.oreateai.com/blog/research-on-the-mechanism-of-screen-shake-and-hit-stop-effects-on-game-impact/decf24388684845c565d0cc48f09fa24)
- [Ultimate — Everspace 2 wiki](https://everspace.fandom.com/wiki/Ultimate)
- [Heads-up display (ES2) — Everspace 2 wiki](https://everspace.fandom.com/wiki/Heads-up_display_(ES2))
- [Weapon Control — FTL wiki](https://ftl.fandom.com/wiki/Weapon_Control)
- [Game feel — Wikipedia](https://en.wikipedia.org/wiki/Game_feel)

**Internal (read, not modified)**
- `docs/design/armament-brief.md`, `scope-decision.md`, `fun-systems.md`, `controls.md`,
  `ship-language.md`, `look-target.md`, `reference-ui-language.md`
- `src/sim/{combat,ship,heat,stores,subparts,condition,power,physics}.js`
- `src/art/geometry/{cruiser,hardpoints,greeble}.js`, `src/art/geometry/modules/{kit,bow,broadside,dorsal,ventral}.js`
- `src/vfx/{weapons,particles,rings}.js`, `src/audio/weapons.js`, `src/ui/weapons.js`,
  `src/render/postfx.js`, `src/core/{contracts,units,events}.js`
