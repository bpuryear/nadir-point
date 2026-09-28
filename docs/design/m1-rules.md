# M1 rules: the first fight

Status: M1 working spec, 2026-09-28. Numbers are first guesses for tuning, not balance. The code in `src/content` and `src/sim` is the source of truth; this page explains it. It is also the first draft of the in-game Naval Register.

Units: metres, seconds, tonnes (t), megawatts (MW). Armour is in plate points. Damage is in points.

Ship frame: +x is forward, +y is port (left). Angles are degrees, positive toward port.

---

## 1. Hulls (the Compact)

| Hull | Class | Length × beam | Radius | Base mass | Structure | Base turn | Hull cost | Crew |
|---|---|---|---|---|---|---|---|---|
| Picket | frigate | 60 × 16 | 22 | 380 t | 140 | 80°/s | 180 | 10 |
| Lancet | frigate | 64 × 18 | 24 | 420 t | 150 | 75°/s | 200 | 12 |
| Warden | destroyer | 100 × 26 | 36 | 1,100 t | 380 | 45°/s | 450 | 30 |
| Bastion | cruiser | 170 × 44 | 62 | 3,400 t | 1,100 | 22°/s | 1,100 | 60 |

Each hull lists its mounts: an id, a zone (bow, port, starboard, stern, dorsal, core), a size (S, M, L), a type (hardpoint, internal, engine), a position, a facing and a fire-arc half-width. `src/content/hulls.ts` has the full table.

**Armour** is plate thickness per facing: bow, port, starboard, stern. Each hull has a maximum per facing and a mass per point for each facing. The long sides cost more mass per point than the bow and stern.

---

## 2. Modules

A module fits a mount when the types match and the module size is no larger than the mount size.

### Weapons (hardpoint)

| Module | Size | Damage | Pen | Reload | Range | Tracking | Spread | Mass | Power | Cost | HP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Autocannon S | S | 4 | 12 | 0.4 s | 900 | 40°/s | 20 mrad | 20 | 2 | 30 | 30 |
| Autocannon M | M | 7 | 16 | 0.5 s | 1,100 | 28°/s | 14 mrad | 45 | 4 | 60 | 50 |
| Mass Driver M | M | 28 | 45 | 3.0 s | 1,600 | 10°/s | 6 mrad | 80 | 10 | 110 | 60 |
| Heavy Gun L | L | 36 | 55 | 2.2 s | 1,700 | 14°/s | 8 mrad | 170 | 14 | 190 | 110 |
| Mass Driver L | L | 70 | 80 | 5.0 s | 2,200 | 5°/s | 4 mrad | 200 | 22 | 240 | 120 |

### Systems

| Module | Mount | Effect | Mass | Power | Cost | HP |
|---|---|---|---|---|---|---|
| Reactor S / M / L | internal | +20 / +45 / +100 MW | 60 / 140 / 320 | — | 60 / 120 / 230 | 60 / 100 / 180 |
| Drive S / M / L | engine | thrust 5,000 / 10,000 / 22,000 | 40 / 90 / 200 | 4 / 8 / 16 | 40 / 80 / 160 | 50 / 90 / 160 |
| Bridge | internal S | required; the ship is crippled without it | 25 | 2 | 40 | 60 |
| Fire Control | internal S | +25% tracking for every weapon on the ship; one per ship counts | 20 | 4 | 70 | 40 |
| Damage Control | internal M | repairs armour and modules (§5) | 50 | 5 | 90 | 70 |

---

## 3. Budgets and derived stats

- **Power:** reactor output must be at least the total power draw, or the design is invalid.
- **Mass:** hull base mass + module mass + armour mass (points × mass per point, per facing).
- **Acceleration** = thrust ÷ mass (m/s²). **Top speed** = acceleration × 12 s, capped at 220 m/s.
- **Turn rate** = base turn × clamp(acceleration ÷ reference acceleration, 0.4, 1.6). The reference acceleration is 10 m/s² for frigates, 8 for destroyers and 6 for cruisers.
- **Cost** = hull cost + module cost + 0.5 per tonne of armour.
- **Crew** = hull crew + module crew. Crew is recorded for the report; it does not limit designs.

---

## 4. Hit chance

Every shot rolls once against:

`p = size × T / (T + ω)`

- **T** is the weapon's tracking in °/s, times 1.25 with Fire Control.
- **ω** is how fast the target crosses the shooter's line of sight, in °/s: `|rx·vy − ry·vx| / d²`, converted to degrees. A target flying straight at the gun has ω near 0.
- **size** = `R / (R + d × spread)`: target radius against the weapon's spread at that distance.

There is no cliff. Fast frigates crossing close are hard to hit with slow heavy guns, and easy with autocannons.

Worked examples:

| Case | Result |
|---|---|
| Frigate at 150 m/s, crossing, 800 m, Mass Driver L | ω = 10.7°/s; p ≈ 0.87 × 5/15.7 ≈ **0.28** |
| Same frigate, Autocannon S | size 0.58; p ≈ 0.58 × 40/50.7 ≈ **0.46** |
| Cruiser at 60 m/s, 2,000 m, Mass Driver L | ω = 1.7°/s; p ≈ 0.89 × 5/6.7 ≈ **0.66** |

Shots are instant in M1. Tracers are visual only.

---

## 5. Damage

### 5.1 Which facing

The facing that is hit is the one pointing at the shooter. With the shooter at (fx, ly) in the target's frame:
- **Bow** if fx ≥ |ly|.
- **Stern** if −fx ≥ |ly|.
- **Port** if ly > 0.
- **Starboard** otherwise.

### 5.2 Armour

With plate thickness T on that facing and weapon penetration P, let r = P ÷ T.
- **Through damage** = damage × 1 if r ≥ 1, else damage × r².
- **Plate wear** = 0.1 × damage × min(1, r)². A round that cannot penetrate barely marks heavy plate; a round that penetrates wears it at the full rate.
- **Bare facing** (T = 0): all damage goes through.

### 5.3 Structure, modules, crew

Through damage comes off structure, and the same amount hits one module:

| Chance | Module group |
|---|---|
| 55% | the hit zone |
| 25% | dorsal |
| 20% | core |

The engine mounts count as the stern zone. The module is picked at random among the working modules in that group; if the group is empty, only structure takes the damage.

- A module at 0 HP stops working, and its status light goes out.
- Crew casualties are 0.2 × through damage.

### 5.4 Crippled, destroyed, reactor breach

A ship is **crippled** when:
- its structure reaches 0, or
- its bridge is destroyed, or
- it has no working reactor, or
- it has no working drive (it then drifts).

A crippled ship stops firing, and its speed decays to zero over about 3 s.

A ship is **destroyed** when:
- its structure falls below −50% of maximum, or
- a reactor breaches.

When a reactor module is destroyed, it breaches with this chance (S / M / L): 15% / 25% / 35%. The blast:
- has a radius of 120 / 180 / 260 m and peak damage of 60 / 120 / 220 at the centre, falling linearly to 0 at the edge;
- hits every ship in range on the facing toward the blast, with penetration equal to its damage.

Dense blobs pay for this.

### 5.5 Damage Control

Once per second, a working Damage Control module:
1. restores 3 plate points to the most worn facing that is below 75% of its design thickness;
2. restores 4 HP to the most damaged module that still works.

Rates halve if the ship was hit in the last 3 s. Each module has 400 points of supplies per battle.

---

## 6. Doctrine (M1 subset)

| Setting | Choices |
|---|---|
| Role | **Line**: hold at engagement range, keep the best firing bearing. **Strike**: go for priority targets anywhere on the map, at full speed, from short range. |
| Engage at | Short (0.55), optimal (0.8) or long (0.95) × the damage-weighted mean weapon range |
| Priority | Up to 3 criteria, in order: cruiser, destroyer, frigate, crippled, armour broken, threat (is shooting at me). Nearest is always the last fallback. |
| Withdraw at | Structure fraction 0 (never) to 0.9 |

**Target choice**
- The first criterion that finds a candidate wins, and the nearest candidate is taken.
- Line ships look within 2.5 × engagement range; Strike ships look across the whole map.
- Crippled ships are skipped unless "crippled" is a criterion.
- The ship re-checks once per second, or when its target dies.
- The reason is recorded, so the inspector can say "criterion 1: cruisers".

**Weapons** fire at the ship's target when it is in arc and range. Otherwise each weapon takes the nearest enemy in its own arc and range.

**Firing bearing**
- Each design computes the bearing, among 0, ±30, ±60, ±90, ±120 and 180°, that brings the most damage per second to bear.
- Line ships take the bearing with the most damage per second, so bow-heavy ships point at the target and broadside ships circle it.
- Strike ships take the widest bearing that keeps at least 90% of that damage, so they strafe across the target instead of flying straight at it.

**Movement**

| Distance to target | Line ships |
|---|---|
| More than 1.15 × engagement range | Close at full speed |
| Otherwise | Hold the firing bearing: half speed for Line, full speed for Strike. Ships do not turn away to open the range; that would show the stern and mask the bow guns. |

When a ship falls below its withdraw threshold, it runs for its own edge. It has escaped once it passes the edge by 200 m.

---

## 7. End of battle

- **Value** is the sum of design costs.
- A side **breaks** when its combat-ready value (ships not crippled, destroyed, withdrawing or escaped) falls below 40% of the value it deployed. Every ship on a broken side withdraws.
- The battle ends when one side has no ship left on the field, or at 8 minutes.
- **Holding the field:**
  - If one side broke and the other did not, the side that did not break holds the field.
  - Otherwise, the side with the higher remaining fraction of value holds it.

---

## 8. After-action report: causes

The sim records, for each side:
- shots, hits, expected hit chance, raw damage and through damage, per weapon type and target class;
- through damage per facing taken;
- losses by cause (destroyed, crippled, reactor breach);
- time with no target in range.

Detectors turn these into sentences. Each carries an impact score, the damage or value it explains, and the report prints the top three. For example:

| Detector | Example sentence |
|---|---|
| Low hit rate | "Mass Driver L hit enemy frigates 12% of the time. Their tracking is 5°/s; the frigates crossed at about 14°/s." |
| Poor penetration | "Autocannon S put 9% of its damage through enemy armour (penetration 12 against average plate 48)." |
| Exposed facing | "61% of the damage that reached your hulls came through port armour." |
| Reactor breaches | "3 of your ships were lost to reactor breaches; 5 more took blast damage." |
| Idle guns | "Your cruisers spent 58% of the battle with no target in range." |
