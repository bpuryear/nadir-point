# Reference UI and visual language — observed from Beta Decay

Transcribed directly from two Beta Decay build screenshots supplied by the project owner.
This is a **first-hand observation record**, not research from marketing copy — every item
below was read off an actual frame. Where I am inferring a mechanic from a visual, it is
marked *(inferred)*.

Companion targets: **EVE Frontier** (<https://evefrontier.com/en>) for the harsher,
starker end of the same family.

---

## 1. The palette is monochrome plus one accent

This is the single most transferable thing, and it is severe:

- Background is **near-black**, with a deep desaturated red/orange nebula field. It never
  competes with the UI.
- The accent is **one warm amber/orange** (roughly `#c85a1e` … `#ff9126`). It is used for
  every selected, owned, targeted or warning state.
- Text is **off-white / bone**, never pure white.
- A second, cooler grey is used for inert structures.

There is essentially **no third hue anywhere in frame.** The whole screen is black, amber,
and bone. Our locked palette already has the right idea, but our frames carry neutral-grey
hull, blue planet, warm-brown asteroids and cobalt accents — four temperatures. This
reference carries one.

**Action:** the per-POI grade should pull the whole frame toward *one* temperature far
harder than it currently does, and faction hue should be the only exception.

## 2. Every panel is a window

The UI is composed of **floating, independent panels**, each with:

- a thin **1 px border**, no rounding, no shadow, no gradient
- a **title bar** carrying the panel name in small caps (`PERSONAL ASSETS`, `INVENTORY`,
  `LOCAL`, `SWEET HUB`)
- a **⋮ overflow menu** and an **× close** at the right of the title bar
- a near-opaque black fill so it stays legible over the bright nebula

They overlap freely and are clearly draggable *(inferred)*. Nothing is docked to a fixed
chrome frame.

**Action:** our HUD is currently fixed, welded panels that overlap the ship at common
framings. Moving to independent closable panels solves the occlusion complaint directly and
matches the reference.

## 3. Typography is dense, small, monospace and unafraid of numbers

Row after row of small monospace text. Tables have real column headers
(`Name · Quantity · Group · Size · Slot · Volume · Est. Price`). Timestamps are shown on
chat lines. Nothing is enlarged for "readability"; density *is* the aesthetic.

Critically: **the text is legible because the panel behind it is near-opaque black**, not
because the text is large. That is the fix for our unreadable-over-bright-planet defect.

## 4. World-space target brackets

The most striking in-world element:

- A **solid filled label chip** above the target — `CARBONACEOUS ORE [ASTEROID]`,
  `PORTABLE STORAGE` — in accent colour with dark text.
- A **distance chip** directly beneath it — `13 KM`, `2 KM`.
- A **reticle** below that: a small square with corner ticks and a centre glyph.
- A thin **leader line** from the bracket down to the object when it is offset.
- Secondary objects get just a small hatched square, no label, until targeted.

This is far more legible than a wireframe box and it scales to any object size. Distance is
always present, which is a scale cue in its own right.

**Action:** adopt wholesale for our target and salvage-section brackets.

## 5. Persistent status readouts, grouped by concern

Bottom-left — **hull state**: `0.0 HP/s`, a bar with `100% / 500`, `NO ARMOR 0%`,
a shield figure `1,250`, and `MAX 290 m/s` over a fill bar with current `236 m/s`.

Bottom-right — **thermal and capacity**: `STATUS NOMINAL` in one frame and
`STATUS OVERHEATED` in the other, with an `EXT 87.8 / 94.4` figure and a large vertical
orange bar. Beside it a **grid of small squares** (a capacitor or cargo-volume readout),
plus rates `0.12/s` and `2.4%/s`.

**Heat is a real, visible, changing mechanic** — the status word changes and the bar moves.
See §8.

Bottom-centre — a **numbered hotbar**, slots `1 2 3 4 5 6 7 8 9 0 - =`, holding module and
consumable icons with charge counts (`86%`, `80`).

## 6. Navigation and logistics are always on screen

Top-left: system/location identifier (`OM1-V49`, `UNL-LV8`) with a sub-identifier
(`R62-Y-04`), and a `ROUTE` block reading `No Destination`.

Right: `PERSONAL ASSETS` — a searchable table of everything you own **and where it is**,
each row annotated `Route: 0 Jumps` or `No gate-to-gate`. Ownership is distributed across
the universe and the UI tracks reachability.

**Action:** this maps directly onto our Plot-and-Burn travel layer and our salvage
inventory. Showing "where your stuff is and how many jumps away" is a cheap, high-value
addition.

## 7. Interaction prompts are inline and diegetic

`E Open Cargo` appears next to the object, keycap first. `APPROACHING / Carbonaceous Ore`
is centred just under the crosshair as transient state text. Mode tabs sit along the top:
`B Build`, `F1 CAM`, `F2 TAC`, `F3 SYS`.

## 8. Systems visible in the frames worth stealing

| Observed | Mechanic | Fits us? |
|---|---|---|
| `STATUS NOMINAL` → `OVERHEATED`, `EXT` figure, big orange bar | **Heat as a managed resource.** Firing and running hard builds heat; overheating presumably degrades or forces a cooldown. | **Yes — strongly.** This interlocks with our power routing, which currently has spool but no thermal cost. Heat gives sustained fire a price and makes the "run cold and quiet" option in our travel layer mean something mechanically. |
| `2 620,0/5 000,0 m³` on the inventory | **Cargo measured in VOLUME, not slots.** | **Yes.** Our hold is a 6-slot array. Volume makes a salvaged destroyer reactor genuinely bulky and forces real choices about what to cut free. |
| Item grid with quantities, ore/material tiers | Material tiers (`Common Ore`, `Carbonaceous`, `Feldspar`, `Heavy Metals`, `Precious Metals`, `Reinforced`) | **Yes.** Our economy is three flat pools. Tiered materials with different sources make salvage targets meaningfully different. |
| `Portable Refinery`, `Portable Printer`, `Assembler`, `Portable Storage` | Deployable industrial structures | **Partly — flag for the owner.** This edges toward base building, which is out of scope. A single deployable field-refinery on the cruiser itself would capture the idea without the base game. |
| Mining beam to an asteroid, `Obtained 17 units of Carbonaceous Ore` | Resource extraction as an activity, with a running feed | **Yes** — our salvage cutting beam is the same verb and should carry the same feedback. |

## 9. Visible damage — what the reference implies

The owner asked specifically about visible damage. The frames show the *state readouts* for
it — `NO SHIELD 0%`, `NO ARMOR 0%`, `0.0 HP/s`, `STATUS OVERHEATED` — which tells us the
model is **layered**: shield, then armour, then hull, each tracked separately with its own
percentage and regeneration rate.

What that means for us:

1. **Layer the damage model visually as well as numerically.** We have shields and hull.
   Armour as a distinct middle layer that ablates — and *shows* ablation as exposed
   substructure — is the thing that makes damage read at a glance.
2. **Per-layer HUD state with a rate**, not just a bar. `0.0 HP/s` tells the player whether
   they are winning the repair race right now. That single number carries more decision
   weight than a bar does.
3. Our persistent-hull, no-permadeath design means damage accumulates across engagements —
   so it must be **legible on the hull itself**, not only in the HUD. That is the
   `scorch → blown plating → exposed frame → venting` progression we already have partly
   built in `src/vfx/damage.js`, but it is not yet driven hard enough to read.

---

## What to change here, ranked

1. **One temperature per frame.** Grade harder toward the POI's single accent. Kill the
   four-temperature problem.
2. **Near-opaque black panel backings.** Fixes text legibility over bright backdrops
   immediately and is nearly free.
3. **World-space target brackets** with label chip, distance chip, reticle and leader line.
4. **Floating, closable panels** instead of welded chrome — fixes HUD-occludes-ship.
5. **Heat as a resource**, wired into power routing and sustained fire.
6. **Volume-based cargo** instead of slots.
7. **Layered damage** — shield / armour / hull, each with a visible rate, and armour
   ablation that exposes substructure on the model.
8. **Tiered materials** replacing three flat pools.
9. **Asset/route tracking** — what you own, where it is, how far.
