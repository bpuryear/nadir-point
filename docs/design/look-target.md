# Look target, refit commitment, and what crippling costs

**Binding decisions from the project owner. These supersede any conflicting guidance in
`visual-direction.md`, `closest-comparables.md` or the acceptance rubric.**

---

## 1. The look: Homeworld scale, Beta Decay surface

### THIS IS ABOUT ART STYLE. IT IS NOT ABOUT LIGHTING.

Read that twice before acting on anything below. The hybrid is a decision about **art
direction** — shapes, forms, surface language, colour identity, density, composition. It is
**not** about bloom, exposure, tone curve, shadows, ambient, or key-to-fill ratio.

**Lighting and post are explicitly deferred to a later polish pass.** They are not the
current problem and they are not what anything should be scored on right now. An earlier
version of this document specified the hybrid as a zoom-driven lift/gain grade, which was
simply the wrong axis, and review rounds were consequently spent failing frames for
"no self-shadowing" and "value range" while the actual art-style question went untouched.
That was a misreading and it is corrected here.

### What each reference contributes

| Reference | What we take from it | Where it applies |
|---|---|---|
| **Homeworld** | **Scale and composition.** Vastness. Negative space. How a capital ship sits in a frame. Silhouette drama and how forms read at distance. The sense that the system is enormous and mostly empty. Fleet and hull proportion at range. | Wide and mid framings; overall composition; how big things feel |
| **Beta Decay** | **Surface and identity.** Warm amber / bone / near-black colour identity. Industrial, utilitarian, working-machine surface treatment. Panel and plate language. Density and technical detail up close. The HUD and UI vocabulary. | Close framings; hull surfaces; materials; UI; the colour the game *is* |

The two do not fight, because **they are answering different questions.** Homeworld
answers "how big is this and how is it framed". Beta Decay answers "what is this thing
made of and what does it feel like to work on". A frame can be composed like Homeworld and
surfaced like Beta Decay with no contradiction at all.

It is defensible in fiction, too: **the system is vast and indifferent; your ship is a
warm, cramped, over-used industrial object inside it.** Pulling back should feel like
looking at something enormous. Leaning in should feel like standing in an engine room.

### What this means concretely

- **Hull and module forms**: proportion, mass hierarchy and silhouette follow Homeworld's
  discipline (see `ship-language.md`).
- **Hull surfaces**: plate language, wear, marks, industrial density and the warm
  amber/bone/black identity follow Beta Decay (see `reference-ui-language.md`).
- **UI and HUD**: Beta Decay, wholesale. Dense, monospace, near-opaque black panels, one
  warm accent, world-space target brackets with label and distance chips.
- **Environment and celestials**: Homeworld's vastness and negative space.
- **Faction hue** survives as the one identity exception, as before.

### For critics — read this before scoring

Score **art direction**: form, silhouette, proportion, surface language, colour identity,
density, composition, and whether the frame reads as a designed object.

**Do NOT fail a frame on bloom, exposure, tone curve, shadow presence, ambient level or
key-to-fill ratio.** Those are a deferred polish pass and are out of scope for scoring.
If a lighting issue genuinely prevents you from judging the art — the frame is so dark or
so blown that form is unreadable — say exactly that in one line and score what you can.

Name which reference governs what you are judging: Homeworld for scale, composition and
form at range; Beta Decay for surface, density and identity up close.

---

## 2. Refit: anchorage-only, with a limited field swap

**Full refit happens only when docked at an anchorage.** The six station and yard points
of interest already exist in `src/world/system.js` with written blurbs; they become the
places where the ship is genuinely reconfigured.

**In the field**, the player may jettison a module and hot-swap into a now-empty mount.
That is deliberately worse than a proper refit:

- it takes real time, during which the mount is dead and the ship is vulnerable
- it applies a **condition penalty** to the installed part — a field weld is not a yard weld
- it cannot move a module between two occupied mounts, only into an empty one

This makes **the loadout you leave with a real commitment**, which is what the sortie loop
needs to mean anything, while still allowing the moment the game is named for: cutting
something beautiful free and bolting it on right there, at a price.

`src/sim/refit.js` declares `installTime = 2.5` and never consumes it. That is the hook.

---

## 3. Crippling: modules drop at the site, the hold survives

Our no-permadeath answer to death. When the hull is crippled:

- reactor scram, drive dead, the ship goes **drifting**
- **breached hardpoints eject their modules intact, at the place you fell**
- the **cargo hold survives** — everything you cut free on this sortie comes home
- recovery to the nearest anchorage costs a **materials bill** and time

The reason the hold survives: losing an hour of careful cutting to one bad fight reads as
punishing rather than dramatic. Losing your *installed guns*, and being able to see exactly
where they are, reads as dramatic — because **going back for your own guns becomes its own
sortie**, with the wreck of your loadout sitting in contested space getting picked over by
whoever else is out there.

That is a roguelike's sense of loss inside a persistent world, and it comes out of one
death handler rather than a run structure we do not have.

---

## Why these three go together

All three decisions push the same way: **the sortie is the unit of commitment.** You leave
an anchorage with a loadout you chose and cannot easily change, you accumulate salvage you
will keep, and the thing you risk is the ship you built rather than your progress. The look
supports it — cold and vast when you are deciding where to go, warm and industrial when you
are working.
