# Integration decisions

Answers to cross-stream questions raised by stream reports. A stream that flagged a
dependency it did not own gets an answer here rather than a shrug, because a design
that quietly assumes work from three other streams is a design that collapses when one
of them says no.

---

## From the controls & travel spec (`controls.md`)

### 1. Can `TIME_SCALES` be extended for transit-only compression? — **Yes**

`src/core/units.js` now exports two tables:

```js
export const TIME_SCALES_COMBAT  = [0, 1, 2, 4];
export const TIME_SCALES_TRANSIT = [0, 1, 2, 4, 8, 16, 32, 64];
```

`Engine.setScaleTable(table)` swaps the active band. The transit layer opens the tail
while burning between points of interest and slams it shut the moment a contact
resolves. The current index is **clamped into the new table**, so collapsing the band
while the player sits at 32× drops them to the fastest combat scale rather than leaving
them running at a speed the new table does not contain.

Combat deliberately stops at 4×. Past that you cannot read an arc closing or react to a
breach warning, so a faster combat setting would only be a way to lose a ship you were
not watching.

**Plot-and-Burn is unblocked.** Travel times stand as specified.

### 2. Can `postfx` expose an exposure hook for the Tactical View cross-fade? — **Yes**

`PostChain` now splits exposure so unrelated systems cannot fight over it:

```js
post.setExposure(v)       // per-POI grade exposure; each POI owns its own stop
post.setExposureScale(v)  // transient multiplier; the tactical overlay drives this to 0.22
```

The flat alpha plate fallback is not needed.

### 3. Can combat supply `canAnyWeaponBear()`? — **Yes**

`CombatSystem.canAnyWeaponBear(fromShip, target)` accepts a subsystem, a ship or a bare
point. There is also `bearingReport(fromShip, target)` returning
`{ bearing, total, minError }` — how many mounts can currently engage, out of how many,
and how far off bearing the nearest capable mount is when none can.

That second one exists so the HUD can say *"turn to port to open your broadside"*
instead of making the player read six separate arc wedges. Point defence is excluded
from both: it is reactive, not commandable.

### 4. Will salvage model wrecks as named targetable sections? — **Yes, already built**

`WreckSection` in `src/sim/salvage.js` is structurally parallel to `SubsystemDef`:
`{ id, moduleId, label, localPosition, worldPosition, radius, integrity, materials, cutProgress, detached }`.

Sections are derived from what survived the kill, so a reactor detonation leaves a hull
whose sections are nearly all scrap while a careful engine-and-mounts kill leaves them
intact and installable. `order.salvage.section` and the shared targeting ring both live.

### 5. Transit drive: registry module or intrinsic ship property? — **Module**

It goes in the registry on the `engine` hardpoint, so it can be shot off and lost. That
is consistent with everything else on the hull and it creates a genuinely interesting
failure state.

The stranding recovery path, which the spec correctly noted nobody had designed:

- Losing the transit drive does not strand you, it slows you. Combat drive still crosses
  a leg, at roughly 25× the sim time. With the transit compression band still available
  when no contact is resolved, that is tedious rather than fatal.
- Propellant has a floor: the cruiser always retains a **reserve of 40 units**, enough
  for roughly 50 km, that cannot be spent on a plotted course. A course that would eat
  the reserve is rejected at plot time with the reason shown, rather than accepted and
  then failed halfway.
- A hard-lock therefore needs the player to lose the drive *and* run the tank to reserve
  *and* be further than 50 km from anything. In that state a Coalition or Concord tender
  will come to you, on the faction whose reputation is higher — with what that costs
  depending on how they feel about you.

---

## Standing decisions

### Renderer: WebGL2, not WebGPU

`navigator.gpu` is unavailable in the build environment, so a WebGPU path cannot be
verified here. The brief's §5 says to ship WebGL2 and say so if the integration costs
more than it returns. Unverifiable is worse than unbuilt, so: WebGL2, `WebGLRenderer`,
committed.

### Performance measurement honesty

The environment has no GPU; headless Chromium runs ANGLE over SwiftShader. Draw calls,
triangle counts, program counts, geometry/texture counts and CPU step cost are
hardware-independent real measurements and are enforced by `npm run bench`.

**Frame rate is not measured and no fps figure is asserted.** `bench.mjs` deliberately
refuses to print an fps pass/fail rather than quote a software-rasteriser number that
would be repeated back as if it meant something. The 60 fps @ 1440p / 1% lows > 50
criterion requires a run on target hardware and is currently **unverified**.

### Order feedback ownership

Order acknowledgement is emitted **synchronously from `src/input/controls.js`**, in the
same call stack as the input event, before the simulation has run. Whoever draws the
marker is downstream of an event that has already fired, so the 100 ms criterion is met
by construction and does not depend on a cross-stream latency contract.

UI owns marker *rendering*. Input owns marker *timing*. That split is the answer to the
grey zone the controls spec flagged.
