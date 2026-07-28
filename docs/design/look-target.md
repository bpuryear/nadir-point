# Look target, refit commitment, and what crippling costs

**Binding decisions from the project owner. These supersede any conflicting guidance in
`visual-direction.md`, `closest-comparables.md` or the acceptance rubric.**

---

## 1. The look: Homeworld scale, Beta Decay surface

The reference targets genuinely conflict. Homeworld is cool, cinematic, painterly, with
blue-teal nebulae and hero lighting. Beta Decay is warm amber monochrome, near-black,
dense and utilitarian. EVE Frontier is stark and desaturated. Grading against one while
being directed toward another is why the look scores have stalled at 3/10.

The decision is **hybrid**. The obvious failure mode of a hybrid is that it becomes a
blend of both and reads as neither, and reviewers split their scores down the middle. So
it is not a blend. It is a **rule about which reference governs which framing**, and every
frame has exactly one governing target.

### The rule

| Framing | `zoomT` | Governing reference | What that means |
|---|---|---|---|
| **Wide / strategic** | > 0.55 | **Homeworld** | Vastness, composition, negative space, painterly backdrop, celestials at true angular size, atmospheric perspective. The ship is small in a large, quiet, beautiful frame. Cool is permitted here. |
| **Transition** | 0.30 – 0.55 | interpolated | The grade lerps continuously. No discontinuity, no pop. |
| **Close / tactical** | < 0.30 | **Beta Decay** | Warm amber accent, bone text, near-monochrome, dense utilitarian surface, technical readouts, industrial. The hull fills the frame and it looks like a working machine. |

This is defensible in fiction as well as in craft: **the system is vast and indifferent;
your ship is a warm, cramped, over-used industrial object inside it.** Pulling back should
feel like looking out at something enormous and cold. Leaning in should feel like standing
in an engine room. That is the game.

### Implementation

The per-POI lift/gain grade in `src/render/postfx.js` already takes a colour pair. Drive
`liftAmount`/`gainAmount` and the lift/gain hues from the camera's `zoomT`, interpolated
with the same `smoothstep` the pitch floor uses so it is continuous. The POI palette keeps
its identity; what changes with zoom is **which end of the frame's temperature is
emphasised**, not the location's colour.

Faction hue survives at every range. It is the one exception, as before.

### For critics — read this before scoring

**Score a frame against the reference that governs its framing, and say which one you
used.** Do not average the two. A wide shot judged against Beta Decay's amber will always
look wrong, and a close shot judged against Homeworld's blue will always look wrong. A
frame that fails is failing against *one* named target, and the defect must say which.

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
