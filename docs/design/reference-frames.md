# Reference frames — the look the owner is steering toward

**Owner-supplied, 2026-07-30. Six screenshots: Everspace 2 (x2), EVE Frontier, Homeworld
Remastered (x3).** The images are not in the repository — they were supplied in chat and
cannot be committed — so this document is the authority. It is written to be *measurable*
rather than evocative, because a stream that cannot measure a target cannot hit it.

**Status:** this EXTENDS `look-target.md`. Where the two conflict, the conflict is called
out explicitly below and the owner's newer direction wins.

---

## 0. The single finding, stated first

**In every one of the six references, the background is a large, saturated, luminous
object — and in Nadir Point the background is black.**

That is the gap. Not hull detail, not silhouette, not panel density. Measured on our own
frames: `docs/review/arrival/engagement.png` is **85% near-black** at `luma 0.031`;
`wave2/engagement.png` reads `contrast 0.031`. Every reference frame would measure a mean
luminance several times that, because 40–80% of each frame is a lit nebula, a planet limb,
or a star-lit dust bank.

We have been grading a hull against an empty room. The references put the drama in the
room and let the hull read *against* it.

---

## 1. What each reference actually contains

### Everspace 2 — gold hull on teal
- Ship is the **most saturated object in frame**: a hard yellow-gold, high chroma, reading
  almost orange in the lit areas.
- Environment is its **complement**: broad teal / cyan-blue nebula and a blue-white planet
  limb bottom-left.
- Station structures are near-black silhouettes carrying **orange emissive strips and
  point lights** — the darkest masses in frame are also the ones wearing the warm accent.
- So: **warm subject, cool field, warm accents inside the dark masses.**

### Everspace 2 — magenta field
- Purple/magenta nebula across the whole upper frame, orange-red planet surface below.
- **Engine glow is bright saturated cyan** against that magenta — again complementary.
- Asteroids are cool desaturated grey-blue and read as *silhouette plus rim*, not as
  fully-lit objects.

### EVE Frontier — the outlier, and the useful one
- Near-monochrome deep red / rust. Very dark overall, very low chroma variety, **one hue
  owning the entire frame**.
- The ship is a pale, almost bone-coloured shape — the *lightest* thing present.
- UI is sparse and warm-orange.
- This is the closest of the six to our current palette intent, and it proves the dark,
  restrained direction *can* work — but note what makes it work: **the darkness is
  coloured, not black,** and the hull is the value contrast.

### Homeworld Remastered — orange-to-violet gradient
- A vertical gradient sky: hot orange low, violet high, filling the frame.
- Hulls are mid-value with **faction colour blocking** — orange/white/blue painted panels,
  not just value variation.
- **Long, bright cyan engine trails**, several hull-lengths, tapering. They are the single
  strongest read in the frame and they cut across the warm sky.

### Homeworld — warm field, blue drives
- Warm orange/pink dust bank; a large flat carrier reading almost in silhouette against it.
- Blue engine glow again complementary to the field.

### Homeworld — red field, gold drives
- Deep red/orange nebula filling the frame.
- Hull carries **red and orange painted stripes**; engine trails are golden-yellow.
- Here the drives are *analogous* to the field rather than complementary — so the rule is
  not "always complementary", it is "the drives are a deliberate, saturated colour decision".

---

## 2. The rules these share, as targets we can measure

| # | Rule | Measurable target |
|---|---|---|
| R1 | **The field is lit and coloured.** Space is never black. | Background (non-hull, non-UI) pixels: median luma ≥ 0.10, and ≥ 40% of frame above luma 0.06. Today: 85% below 0.02. |
| R2 | **One hue owns the field**, at real saturation. | Background chroma median ≥ 0.18 in a hue band ≤ 60° wide. |
| R3 | **The hull answers the field**, not matches it. | Mean hull hue ≥ 60° from mean background hue, OR (EVE Frontier case) hull is the value contrast at ≥ 0.25 luma above field median. |
| R4 | **Drives are a primary read.** | Engine plume length ≥ 1.5 hull lengths at cruise; plume peak chroma ≥ 0.30. |
| R5 | **Dark masses carry the warm accent.** | Emissive/accent pixels concentrated in the darkest tier, not sprayed evenly. |
| R6 | **Hulls carry painted colour blocking**, not only value and wear. | Faction identity legible as *hue* at 2 hull-lengths, not only as outline. |

---

## 3. Where this conflicts with `look-target.md`, explicitly

`look-target.md` §1 says, twice and emphatically, that the target is **art style, not
lighting**, and that bloom/exposure/key ratio are a deferred pass that critics are barred
from scoring. That instruction was correct for the problem it was written against — a
round had been wasted failing frames on a zoom-driven grade instead of fixing form.

**It is now the binding constraint on the wrong thing.** R1 and R2 cannot be satisfied by
albedo. A coloured, luminous field is celestials, nebula and environment lighting. The
owner has supplied six frames whose common property is exactly the thing that document
defers.

**Resolution, and this is the owner's newer direction winning:** the deferral is lifted for
**the field** — celestials, nebula, environmental fill and the drives. It still holds for
**the hull grade** — do not fix hull surface problems with exposure. If a hull reads badly
against a correctly-lit field, that is still an albedo problem.

---

## 4. What this means for our frames, in priority order

1. **The nebula and celestials must actually be visible in the play framing.** The
   graveyard authors a 14-layer nebula and it does not read; `giant: null` there means no
   large body at all. The single highest-value change available is making the field
   present.
2. **Engine plumes want to be a primary read.** They are currently a small glow. R4 asks
   for length and chroma.
3. **The hull's warm identity has to survive the play distance.** Measured after the
   albedo pass: at engagement range the ship reads mean RGB 0.216/0.244/**0.238** — cool —
   because it is lit almost entirely by blue fill/rim. Warm albedo under cool-only light
   is a cool ship.
4. **Faction hue blocking on hulls** (R6) is not started. We have value structure now;
   we do not have paint.

---

## 5. What NOT to take from these references

- **Do not raise detail density to match.** `ARCHITECTURE.md` §6 still holds: mismatched
  salvage only reads as deliberate under a constrained visual language.
- **Do not adopt Everspace's arcade saturation on the hull.** Our fiction is a working
  industrial salvager; EVE Frontier is the closer model for the *ship*, Homeworld for the
  *field*.
- **Do not add geometry.** There are 11 triangles of headroom on the cruiser core.
