# Nadir Point — Controls, Camera and Travel Specification

**Status:** committed spec. Owned by the Camera & Controls stream (`src/input/**`, `src/camera/**`).
**Audience:** an implementer who has never played Homeworld.
**Scale reminder:** one world unit is one metre. The player cruiser is 1400 units long. It is
plane-locked to `y = 0`. Strike craft, missiles and debris are not.

Everything below is a number you can type in. Where a value is a judgement call I say so and
say why. Where a well-known game got it wrong I name the game and link the complaint, because
"don't do what Homeworld 3 did" is only actionable if you know what Homeworld 3 did.

---

## 0. Design axioms

These drive every decision in this document. If a later section contradicts one of these, the
axiom wins and the section is a bug.

1. **The right mouse button never moves the camera.** In Homeworld 3, RMB both issues orders and
   drags the camera. Players report "constantly running into problems moving the camera and giving
   orders simultaneously since right-click does both"
   ([HW3 controls feedback](https://steamcommunity.com/app/1840080/discussions/0/4208119778369711135/),
   [HW3 camera thread](https://steamcommunity.com/app/1840080/discussions/4/7093810350790949529/)).
   Buttons get one job each.
2. **The camera never moves on its own.** No auto-elevation, no auto-framing, no snap-back unless
   the player asked for it. Homeworld 3's automatic elevation on W/S is described by players as
   "extremely annoying"; the camera "wigging out" in tight spaces is a top complaint
   ([Gamerant review](https://gamerant.com/homeworld-3-review/)). Every automatic camera behaviour
   in this document is either player-triggered or opt-in in options and defaulted off.
3. **The camera is tight, not floaty.** Homeworld Remastered is praised for "tight, responsive
   controls"; Homeworld 3 is criticised because they "feel floaty and unresponsive" with
   "apparent delay when trying to look around"
   ([HW3 general discussion](https://steamcommunity.com/app/1840080/discussions/0/4208119778367545699/)).
   Drag input is applied 1:1 with zero smoothing and zero flick momentum. Smoothing exists only
   on programmatic moves and keyboard input.
4. **Every order draws its own marker, from the input thread, on the same frame as the click.**
   0.1 s is the threshold at which a response "feels like the user, not the computer, caused it"
   ([NN/g, Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/)).
   We are not going to spend that budget waiting for a fixed-step tick, especially since at pause
   the fixed step never runs at all.
5. **The ship is heavy and the controls are not.** The weight is in the simulation, never in the
   input. A 1.4 km cruiser should take twenty seconds to come about. The order to come about should
   register in sixteen milliseconds.
6. **Plane-lock is a feature, not a limitation.** Rebel Galaxy locked its capital ships to a plane
   *specifically* to make broadside combat readable — "the implementation of broadside combat
   necessitated the restriction of the movement of the player's ship to a 2D plane"
   ([GameSpot user review](https://www.gamespot.com/rebel-galaxy/user-reviews/2200-12677002/)),
   and reviewers describe the result as feeling "more like a boat than a spaceship"
   ([Destructoid](https://www.destructoid.com/reviews/review-rebel-galaxy/)). Children of a Dead
   Earth similarly "flattened all weapon ranges, closing speeds, and angular velocities down to a
   2D minimap"
   ([discussion](https://forums.spacebattles.com/threads/has-there-been-ever-a-realistic-space-battle-simulation-game.1118854/)).
   We inherit the readability win and must not throw it away by adding 3D control affordances the
   cruiser cannot use.

---

## 1. Binding table

### 1.1 Binding architecture

Bindings are **data**, in `src/input/bindings.js`, keyed by *action id*, not by key. No system
anywhere reads `event.code`. Every binding is rebindable from options at ship.

Bindings resolve within a **context stack**, most-specific-first. Nebulous: Fleet Command does
exactly this — its keyboard shortcuts have "two primary contexts: widget open and widget closed"
([Nebulous key bindings update](https://store.steampowered.com/news/app/887570/view/3133946090940239598)) —
and it is why Nebulous can afford to put five meanings on the number row without collisions.

```
contexts (top of stack wins):
  screen:refit        modal, when the refit bay is open
  screen:tactical     when Tactical View is up
  widget:power        while the reactor radial is held open
  widget:target       while the subsystem ring is held open
  widget:order-armed  while an order awaits its target click
  ctx:strike          when a strike-craft group is the active selection
  global              always
```

An unhandled key falls through to the next context down. `Esc` always pops one context.

### 1.2 Mouse — global context

| Input | Action id | Behaviour |
|---|---|---|
| LMB click on entity | `select.primary` | Select ship / wreck / POI marker under cursor |
| LMB click on empty | `select.clear` | Clear selection |
| LMB drag on empty | `select.band` | Band-box: strike craft and wrecks only. The cruiser is never band-selectable; it is always commandable |
| Shift + LMB | `select.add` | Add to selection |
| Ctrl + LMB | `select.toggle` | Toggle membership |
| LMB double-click on strike craft | `select.sameTypeOnScreen` | Select all of that type in frustum |
| **MMB drag** | `camera.orbit` | Yaw + pitch. 1:1, unsmoothed |
| **Alt + LMB drag** | `camera.orbit` | Identical. Exists for laptops and trackballs with no usable MMB |
| **Shift + MMB drag** | `camera.pan` | Screen-exact pan: the plane point under the cursor stays under the cursor |
| **Wheel** | `camera.zoom` | Geometric zoom, one notch = ×1.18 distance (§2.3) |
| Shift + Wheel | `camera.zoom.fine` | ¼ notch |
| Ctrl + Wheel | `camera.zoom.coarse` | 3 notches |
| **RMB click** | `order.smart` | Context order resolved from what is under the cursor (§1.6) |
| **RMB press-drag** | `order.moveWithHeading` | Press sets the destination; dragging rotates an arrival-heading arrow around it; release commits. This is the single most important order in the game for a broadside ship |
| Shift + RMB | `order.queue` | Append rather than replace. Nebulous calls the equivalent "drive course" and lets you place, move and re-edit waypoints ([Nebulous maneuver planning](https://steamcommunity.com/app/887570/discussions/0/3275814396763891816/)) |
| Ctrl + RMB on hostile | `order.attack.subsystem` | Commit an attack on the subsystem highlighted in the ring |
| Ctrl + RMB on wreck | `order.salvage.section` | Cut the specific section highlighted in the ring |
| Alt + RMB on wreck | `order.salvage.tow` | Tow whole, instead of cutting |
| Esc | `ctx.pop` | Cancel armed order → close widget → clear selection, in that order, one per press |

**RMB is never a camera control.** There is a `Legacy` preset in options that maps
`camera.orbit` onto RMB-drag with a 6 px drag threshold, for players with twenty years of
Homeworld muscle memory. It is supported, documented as such, and not the default.

### 1.3 Keyboard — camera

| Key | Action id | Behaviour |
|---|---|---|
| `W` `A` `S` `D` / arrows | `camera.pan.*` | Pan the focus point. Screen-relative, projected onto `y = 0`. **Never changes pitch or altitude.** |
| `Q` / `E` | `camera.yaw.left/right` | Continuous keyboard yaw, `KEY_YAW_RATE` rad/s |
| Shift + pan | `camera.pan.fast` | ×2.5 |
| Ctrl + pan | `camera.pan.slow` | ×0.35 |
| `F` | `camera.focusSelection` | Focus and **lock** to current selection. Homeworld's `F` ([Remastered manual](https://homeworld.fandom.com/wiki/Homeworld_Remastered_Manual), [bindings guide](https://steamcommunity.com/sharedfiles/filedetails/?id=612574050)) and Nebulous's `F` ([Nebulous controls](https://www.magicgameworld.com/nebulous-fleet-command-pc-keyboard-controls-guide/)) agree. Do not fight this convention |
| Shift + `F` | `camera.focusKeepDistance` | Focus without changing zoom |
| `Home` | `camera.snapToPlayer` | Snap-and-lock to the cruiser (§2.7) |
| Ctrl + `Home` | `camera.reset` | Default distance, default pitch offset, yaw set to `shipHeading − 0.6` rad (three-quarter rear view) |
| Shift + `Z` | `camera.frameEngagement` | Fit the cruiser plus every hostile inside `RANGE.sensorBase` with an 18 % margin |
| `Tab` tap | `camera.tacticalToggle` | Toggle Tactical View |
| `Tab` hold > 200 ms | `camera.tacticalMomentary` | Momentary; closes on release. Homeworld and Nebulous both put the strategic layer on a single big key ([HW Remastered guide](https://gameranx.com/updates/id/26824/article/homeworld-remastered-collection-beginners-guide/), Nebulous `Space`) and players "flip back and forth countless times" ([Homeworld dev update](https://www.homeworlduniverse.com/war-games-feedback/)). Make it cheap to flip |
| `V` | `camera.cinematicToggle` | Cinematic camera on/off (§2.9) |
| Ctrl + `V` | `camera.cinematicNextShot` | Cycle shot framing |

We deliberately do **not** bind a key to camera pitch. Pitch lives on MMB-drag only. Homeworld 3
put elevation on the same keys as translation and it is the most-cited control complaint in the
game.

### 1.4 Keyboard — time

| Key | Action id | Result |
|---|---|---|
| `Space` | `time.pauseToggle` | Toggle between `TIME_SCALES[0] = 0` and the last non-zero scale |
| `[` | `time.stepDown` | Previous index in `TIME_SCALES` |
| `]` | `time.stepUp` | Next index in `TIME_SCALES` |
| Alt + `1` / `2` / `3` | `time.set1x/2x/4x` | Direct set |

`Space` is pause, not Tactical View, which breaks with Homeworld. Justification: Homeworld had no
pause, so `Space` was free. We do, and pause is the load-bearing verb — subsystem targeting and
power routing are both meant to be done stopped. Pause gets the biggest key on the keyboard.
Tactical View gets `Tab`, which is next-biggest and adjacent.

Orders are fully accepted while paused. See §4.4 for why that is safe.

### 1.5 Keyboard — cruiser orders

| Key | Action id | Behaviour |
|---|---|---|
| `X` | `order.allStop` | Null the velocity vector under retro thrust. Not instant — see §6 |
| `H` | `order.holdHeading` | Stop turning, hold current facing, keep current velocity |
| `R` | `order.reverse` | Back off along the current facing without turning. Preserves the broadside |
| `B` | `order.broadsideStance` | Hold the locked target at ±90° relative bearing while maintaining current range. Chooses the port or starboard side by whichever is nearer |
| `O` | `order.keepAtRange` | Arms a radius; wheel adjusts it live; LMB commits. The armed radius ring is drawn on the plane |
| `A` then click | `order.attackMove` | Move to a point, engaging anything that enters weapons arcs |
| `Z` | `ability.hardBurn` | 6 s of full turn authority regardless of speed, at the cost of the entire engine power channel, 40 s cooldown. This is Battlefleet Gothic's High Energy Turn — "boosts turn speed by 200 % … your snap-turn button for lining up broadsides" ([BFGA2 abilities](https://mygamingtutorials.com/2025/06/03/essential-abilities-guide-for-battlefleet-gothic-armada-2/)) |
| `T` | `select.cycleHostile` | Cycle hostiles by threat score |
| Shift + `T` | `select.cycleWreck` | Cycle wrecks by salvage value |

### 1.6 The smart order (RMB click)

One button, resolved by what is under the cursor. Resolution order, first match wins:

| Under cursor | Order issued | Marker |
|---|---|---|
| Hostile ship | `ORDER_ATTACK`, target = hull | Red bracket + range/arc readout |
| Neutral ship | Nothing; shows a "hostile? Ctrl+RMB to force" tooltip | — |
| Wreck within `RANGE.salvageBeam × 3` | `ORDER_SALVAGE`, cut nearest high-value section | Amber cut-bracket |
| Wreck beyond that | `ORDER_MOVE` to salvage standoff range, then `ORDER_SALVAGE` (queued, 2 orders) | Both markers, chained |
| Anything else (plane) | `ORDER_MOVE` to the ray/plane intersection | Blue disc + path |

Events are the existing constants in `src/core/events.js`: `EV.ORDER_MOVE`, `EV.ORDER_ATTACK`,
`EV.ORDER_SALVAGE`, `EV.ORDER_STRIKECRAFT`.

### 1.7 Subsystem targeting — `widget:target`

Hold `Ctrl` while the cursor is over a hostile (or a wreck). A ring of segments fades in around
the target in 90 ms, one segment per `SubsystemDef`, positioned at the screen projection of
`sub.position`. FTL's whole combat layer is built on picking which room to shoot
([FTL systems](https://ftl.fandom.com/wiki/Systems)), and its AI targets by an explicit priority
list — weapons, shields, cloaking, oxygen, piloting/engines, drones
([FTL AI targeting](https://steamcommunity.com/app/212680/discussions/0/3050611812299960374/)).
Ours is the same idea in 3D, and Nebulous players already reach for it: "use waypoints for missiles
to attack from specific sides of a ship … kill specific components like main engines"
([Nebulous subsystem targeting](https://steamcommunity.com/app/887570/discussions/0/5299051083539488513/)).

| Input | Action |
|---|---|
| `Ctrl` hold | Open ring on hovered target |
| Mouse move | Highlight nearest segment to the cursor |
| `1` `2` `3` `4` `5` | Jump to engine / weapon / reactor / hangar / sensor — the order of `SUBSYSTEM_KINDS` |
| Ctrl + RMB | Commit; the subsystem becomes the persistent aim point for every weapon that can bear |
| Ctrl release without commit | Ring closes, nothing changes |

Each segment shows: label, HP bar, `salvageValue` as a small coin pip, and — critically — a
**greyed state if no currently-installed weapon can bear on it from the present relative bearing**.
That greying is what teaches the player that subsystem targeting and ship facing are the same
problem.

### 1.8 Power routing — `widget:power`

Four channels, fixed by `POWER_CHANNELS`: shields, weapons, engines, sensors. Reactor output is a
pool of integer **pips**. Unlocked mid-game (`world.unlocked.powerRouting`); until then the widget
is greyed with a "reactor governor sealed" tooltip.

| Input | Action |
|---|---|
| `C` hold | Open the reactor radial: four quadrants around the cursor, one per channel |
| Mouse toward a quadrant | Highlight that channel |
| Wheel while highlighted | ±1 pip. Pips come from / return to an unallocated centre pool |
| `1` `2` `3` `4` while open | +1 pip to shields / weapons / engines / sensors |
| Shift + `1..4` while open | −1 pip |
| `C` release | Commit; emit `EV.POWER_ROUTED` |
| Shift + `C` | Cycle saved stances |
| Shift + `E` | Stance **BURN** — engines maxed, weapons unpowered |
| Shift + `W` | Stance **ALPHA** — weapons maxed, engines to minimum |
| Shift + `S` | Stance **BRACE** — shields maxed |
| Shift + `D` | Stance **SILENT** — sensors maxed, engines quartered, signature ÷4 |

**Stance changes share a 6 s cooldown.** This is lifted directly from Battlefleet Gothic: Armada 2,
where the old temporary special orders became permanent stances that "share a cooldown, so you
can't just spam them, making picking one a real tactical choice"
([BFGA2 abilities](https://mygamingtutorials.com/2025/06/03/essential-abilities-guide-for-battlefleet-gothic-armada-2/)).
Without it, power routing degenerates into per-second pip-fiddling and stops being a decision.
Individual pip moves inside the radial are *not* on the cooldown — only whole-stance jumps are.

### 1.9 Strike craft — `ctx:strike`

| Input | Action |
|---|---|
| `L` | Launch all bays / recall all — toggle. Emits `EV.ORDER_STRIKECRAFT` |
| Ctrl + `1..5` | Assign selection to group |
| `1..5` | Select group. Double-tap: select **and** `camera.focusSelection` |
| Shift + `1..5` | Add group to selection |
| `G` | Guard the cruiser — the default posture, screens against strike threats |
| `I` | Intercept — auto-assign to the nearest inbound missile or hostile strike craft |
| `D` | Dock — return to bay, repair and rearm |
| `A` + click | Attack-move |
| RMB on target | Attack that target |
| Shift + RMB | Queue waypoint |
| Alt + Wheel | **Engagement band**: −1200 / −400 / 0 / +400 / +1200 m relative to the combat plane |

The engagement band is the whole of our 3D movement UI, and §3 explains why one number is enough.

### 1.10 Tactical View — `screen:tactical`

| Input | Action |
|---|---|
| LMB | Select POI, blip or contact |
| RMB | Plot a leg to the cursor point |
| Shift + RMB | Append another leg |
| `Backspace` | Remove the last leg |
| `Enter` | **Commit the course.** The cruiser turns and begins its transit burn |
| `Esc` | Discard the plot, close the view |
| Wheel | Zoom the map |
| MMB drag | Pan the map |
| `S` | Begin a long-range survey sweep along the cursor bearing (§5.6) |
| `Alt` hold | Raise faction-control and patrol-heat overlays to full alpha |

---

## 2. The camera model

### 2.1 State

The camera is a **plane orbit rig**. Six numbers, no matrices, no quaternions in the state:

```js
{
  focus:       Vector3,   // always on y = 0
  yaw:         number,    // radians, 0 = +Z, CCW looking down
  pitchOffset: number,    // radians ABOVE the zoom-dependent pitch floor
  zoomT:       number,    // 0..1 tactical, 1..1.35 strategic overlay band
  mode:        'LOCKED' | 'FREE',
  lockTarget:  Ship | null
}
```

Derived each render frame, never stored:

```js
distance = softMinDistance(lockTarget) * exp(clamp(zoomT,0,1) * LN_ZOOM_RANGE)
pitch    = clamp(pitchFloor(zoomT) + pitchOffset, CAMERA.minPitch, CAMERA.maxPitch)
camera.position = focus + sphericalToCartesian(distance, yaw, pitch)
camera.up       = (0,1,0)   // ALWAYS. see 2.8
camera.lookAt(focus)
```

The camera updates in a **render system**, order 120 (the 100–199 camera band), never in
`fixedUpdate`. It must move smoothly at 144 Hz and it must keep moving while paused.

### 2.2 Pitch clamp, and why there are two floors

`CAMERA.minPitch = 0.06` rad (3.4°) and `CAMERA.maxPitch = 1.45` rad (83°) are the hard clamps in
`src/core/units.js`. Those are correct as absolute limits, but 3.4° is only usable up close. At
46 km a 3.4° pitch puts the entire combat plane inside a five-pixel band and the game becomes
unreadable.

So pitch has a **floor that rises with zoom**:

```js
function pitchFloor(zoomT) {
  return CAMERA.minPitch + (PITCH_FLOOR_MAX - CAMERA.minPitch)
       * smoothstep(PITCH_FLOOR_T0, PITCH_FLOOR_T1, zoomT);
}
// PITCH_FLOOR_MAX = 0.95 rad (54.4°), PITCH_FLOOR_T0 = 0.30, PITCH_FLOOR_T1 = 1.00
```

The player's stored value is `pitchOffset`, an offset *above* the floor. Consequences:

- Zoomed all the way in (`zoomT = 0`), default offset 0.30 → pitch 0.36 rad (20.6°). Low, raking,
  hull-filling. The player can drop to 3.4° for a cinematic grazing shot.
- Zoomed all the way out (`zoomT = 1`), default offset 0.30 → pitch 1.25 rad (71.6°). Near plan
  view. The player *cannot* drop below 54°, which is the point.

This is not the Homeworld 3 auto-elevation bug. Homeworld 3 changed the camera's angle in response
to *translation*, which is why it reads as the camera fighting you. Here, pitch only changes when
the player operates the zoom, the control whose entire job is changing framing, and the player's
chosen offset is preserved exactly across the whole zoom range.

### 2.3 Zoom: linear is wrong, geometric is right

**Why linear is wrong.** `CAMERA.minDistance = 260`, `CAMERA.maxDistance = 46000`; the range spans
177×. A linear step sized for the far end (say 1500 m/notch) moves you 3 % of the way at 46 km —
thirty notches to get anywhere — and at 260 m the same notch throws you six ship-lengths and
straight through the hull. There is no single linear step that works at both ends, which is why
players notice zoom feeling broken at one end of the range in almost every RTS that ships one.
Perceived magnification change is proportional to *ratio*, not difference, so a constant ratio per
notch is a constant perceived rate. This is well-trodden: linear zoom "can feel unnatural", and
exponential or logarithmic scaling "provides a more pleasing effect"
([RTS camera in Godot](https://www.wayline.io/blog/godot-rts-camera-panning-zooming-rotation),
[camera zoom math](https://gamedev.net/forums/topic/549701-camera-zoom-math/)). Sins of a Solar
Empire is the genre benchmark for exactly this — "seamlessly zoom from a grand strategic map of the
entire star system down to a close-up view of a single capital ship"
([Sins gameplay wiki](https://wiki.sinsofasolarempire.com/index.php?title=Gameplay),
[Wikipedia](https://en.wikipedia.org/wiki/Sins_of_a_Solar_Empire)) — and that is a geometric zoom.

**The curve.** Store zoom in log space and interpolate *there*:

```js
LN_ZOOM_RANGE = Math.log(CAMERA.maxDistance / CAMERA.minDistance);  // ln(176.9) = 5.1763
ZOOM_NOTCH_RATIO = 1.18;                                            // per wheel notch
ZOOM_STEP_T = Math.log(ZOOM_NOTCH_RATIO) / LN_ZOOM_RANGE;           // 0.03197
// => 31.3 notches, ~10 comfortable wheel flicks, to cross the entire range
distance = softMin * Math.exp(clamp(zoomT, 0, 1) * LN_ZOOM_RANGE);
```

Smoothing is applied to `zoomT`, not to `distance`. Smoothing distance directly makes the zoom feel
fast at the far end and syrupy up close — the exact defect the log space exists to remove.

**Soft minimum distance.** `CAMERA.minDistance = 260` is right for focusing a fighter and wrong for
focusing a 1400 m cruiser: at 260 m with a 46° FOV you see a 221 m tall slice of hull, i.e. you are
inside the ship. So the floor scales with what you are looking at:

```js
softMinDistance(target) = max(CAMERA.minDistance, boundingRadius(target) * MIN_DIST_RADIUS_K)
// MIN_DIST_RADIUS_K = 1.9
// cruiser (r ≈ 700) → 1330 m → 1130 m of vertical frame → the ship fills it diagonally
// fighter (r ≈ 9)   → falls through to the 260 m hard floor
```

This delivers `units.js`'s stated intent ("cruiser fills the frame") without editing `units.js`.

**Zoom to cursor, one-directionally.** When zooming *in*, slide `focus` toward the plane point under
the cursor by `ZOOM_CURSOR_BIAS = 0.35` of the way, per notch. When zooming *out*, bias is **0** —
pull straight back. Bidirectional cursor bias makes the focus drift and is a well-known source of
"where did my ship go". Zooming in is a *targeting* gesture; zooming out is an *orientation*
gesture. Treat them differently.

### 2.4 Pan

Two pan paths, and they use different maths.

**Drag pan (Shift+MMB) is screen-exact.** The plane point under the cursor stays under the cursor.
Any other behaviour is immediately noticeable as wrong.

```js
worldPerPixel = 2 * distance * Math.tan(CAMERA.fov * Math.PI / 360) / viewportHeightPx;
focus += (-dxPx * right + -dyPx * screenUpProjectedToPlane) * worldPerPixel / Math.max(sin(pitch), 0.18);
```

The `1 / sin(pitch)` term corrects for the plane being seen obliquely; the 0.18 clamp stops it
exploding at grazing pitch.

**Keyboard pan is proportional to distance.** Nebulous does this and calls it out explicitly:
"camera movement speed increases with zoom level"
([Nebulous camera controls](https://steamcommunity.com/app/887570/discussions/0/3189115186369337838/)).

```js
panSpeed = distance * KEY_PAN_RATE;    // KEY_PAN_RATE = 0.55 per second
// at defaultDistance 3200 → 1760 m/s ≈ 1.26 hull lengths per second
// at maxDistance 46000  → 25.3 km/s  — crosses a whole engagement in half a second
```

Keyboard pan uses screen-relative axes projected onto `y = 0`, so `W` always moves "into the
screen" along the plane. It never changes `distance` and never changes `pitch`.

Edge scroll: implemented, **off by default**, 12 px border, 0.75× keyboard rate. Off by default
because it fires accidentally whenever the player reaches for a UI panel.

### 2.5 Smoothing and damping constants

Frame-rate-independent exponential smoothing, everywhere, no exceptions:

```js
function damp(current, target, tau, dt) {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
```

`lerp(a, b, 0.1)` per frame is a defect: it makes a 144 Hz player's camera move roughly 2.4× faster
than a 60 Hz player's. The `1 - exp(-dt/tau)` form covers the same *proportion* of the remaining
distance over any interval regardless of how it is subdivided
([Rory Driscoll, Frame Rate Independent Damping](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/),
[Improved Lerp Smoothing](https://www.gamedeveloper.com/programming/improved-lerp-smoothing-)).

| Channel | τ (s) | Notes |
|---|---|---|
| `yaw`, `pitchOffset` — **during an active drag** | **0** | Applied directly. Zero smoothing, zero acceleration, zero flick momentum. This is axiom 3 |
| `yaw`, `pitchOffset` — keyboard / programmatic | 0.055 | Just enough to kill keyboard-repeat stepping |
| `zoomT` | 0.090 | Smoothed in log space |
| `focus` translation (drag pan) | 0 | Screen-exact means unsmoothed |
| `focus` translation (keyboard, lock-follow) | 0.120 | |
| `focus` translation (snap / focus change) | timed, 450 ms | `smootherstep`, not damping — see §2.7 |
| Cinematic camera position | 0.550 | |
| Cinematic camera aim | 0.750 | Aim lags position; that lag *is* the cinematography |

Mouse sensitivity: `ORBIT_YAW_SENS = 0.0042` rad/px, `ORBIT_PITCH_SENS = 0.0034` rad/px (vertical
deliberately slower). Both scaled by a 0.25–3.0 options slider. Invert-Y available. **No mouse
acceleration and no input smoothing at any sensitivity.**

### 2.6 Follow lead

In `LOCKED` mode the focus is not the ship's centre — it leads:

```js
focusTarget = ship.position + ship.velocity * FOLLOW_LEAD;   // FOLLOW_LEAD = 0.35 s
```

At full combat speed (180 m/s) that puts the ship 63 m behind frame centre, which reads as "moving
into space you can see" rather than "chasing the frame edge". The lead is damped at τ = 0.120 so
that acceleration does not snap the frame.

### 2.7 Snap and snap-back

**Hard snap** (`Home`, `F`, double-tap group, `camera.frameEngagement`):

- Duration **450 ms**, eased with `smootherstep` (C² continuous — a plain `smoothstep` has a
  visible acceleration discontinuity at both ends at this duration).
- `yaw` takes the **shortest signed arc**. `distance` interpolates **in log space** (`zoomT`), so a
  260 m → 46 km snap does not begin as a rocket launch.
- `pitchOffset` is preserved; only the floor changes with zoom.
- **Any camera input during the snap cancels it instantly at the current position.** Never fight the
  player. Not "blends out over 200 ms" — cancels, that frame.
- On completion, `mode = 'LOCKED'`, `lockTarget` = the focused entity.

**Snap-back** (returning to the ship after free panning) is the dangerous one, because an automatic
camera move is the exact thing players hate. Rules:

- Panning, or focusing something else, sets `mode = 'FREE'`.
- Automatic return happens **only** if all of: `mode === 'FREE'`, no camera input for
  `SNAP_BACK_IDLE = 6.0 s`, and the player cruiser is fully outside the view frustum.
- The return is a 900 ms `smootherstep`.
- **Default: OFF.** It is an options checkbox, "Return camera to ship when idle". Ship it off.
  `Home` is one keypress and it is honest.

An always-on exception, because losing the ship in a fight is worse than an unwanted camera move:
if the cruiser takes hull damage while off-screen, a **directional damage chevron** appears at the
screen edge pointing at it, with the distance. The camera does not move. That is the whole
mitigation and it is enough.

### 2.8 Roll is always zero

`camera.up` is `(0, 1, 0)` unconditionally in tactical mode. There is no camera roll and no free
look. Homeworld's free-flying camera is a documented disorientation source — see the whole genre of
"how do I move my units on the y axis"
([HW Remastered](https://steamcommunity.com/app/244160/discussions/0/617329150696498623/)) and
"wondering about the Z" ([HW Remastered](https://steamcommunity.com/app/244160/discussions/0/1836811737984666158/))
threads — and our combat plane makes a fixed horizon free. Take the free win.

The cinematic camera may roll. That is the difference between the two cameras.

### 2.9 The cinematic camera (`V`)

A separate render system, order 130, that takes over the `THREE.PerspectiveCamera` while active.

```js
CINE = {
  fov: 34,                          // vs 46 tactical; compresses depth, reads as "long lens"
  offset: { back: 1.35, up: 0.22, side: 0.55 },  // multiples of hull length L
  aimAhead: 0.9,                    // L in front of the ship
  tauPos: 0.55, tauAim: 0.75,
  driftAmp: 0.018,                  // fraction of distance
  driftHz: 0.07,
  rollMax: 0.09,                    // rad, follows the ship's visual bank at 0.6×
}
```

- Drift noise is sampled from `world.rng.fork('cine-cam')`. **Never `Math.random`.**
- If a target is locked, the rig biases `side` toward the firing broadside so the shot looks *down*
  the guns at the target. Otherwise it holds the three-quarter rear.
- Ctrl+`V` cycles: chase → low bow → high beam → over-the-shoulder-of-the-target.
- Time controls, pause, orders and Tactical View all keep working. The cursor still ray-casts to
  `y = 0`, so you can play from cinematic view, badly and gloriously.
- **Any orbit input auto-disables it** and hands back the exact tactical framing you left, which is
  preserved untouched the whole time.

### 2.10 Constants block

Drop this in `src/camera/constants.js`.

```js
import { CAMERA } from '../core/units.js';

export const ORBIT = {
  // sensitivity
  yawSensRadPerPx:   0.0042,
  pitchSensRadPerPx: 0.0034,
  keyYawRate:        0.85,    // rad/s
  invertY:           false,
  sensScaleRange:    [0.25, 3.0],

  // zoom (geometric — see docs/design/controls.md §2.3)
  lnZoomRange:       Math.log(CAMERA.maxDistance / CAMERA.minDistance), // 5.1763
  notchRatio:        1.18,
  stepT:             Math.log(1.18) / Math.log(CAMERA.maxDistance / CAMERA.minDistance), // 0.03197
  fineScale:         0.25,
  coarseScale:       3.0,
  minDistRadiusK:    1.9,
  cursorBiasIn:      0.35,
  cursorBiasOut:     0.0,

  // pitch floor
  pitchFloorMax:     0.95,    // rad
  pitchFloorT0:      0.30,
  pitchFloorT1:      1.00,
  defaultPitchOffset:0.30,

  // pan
  keyPanRate:        0.55,    // × distance, per second
  panFastMul:        2.5,
  panSlowMul:        0.35,
  grazingSinClamp:   0.18,
  edgeScrollEnabled: false,
  edgeScrollPx:      12,
  edgeScrollMul:     0.75,

  // damping (tau seconds; 0 = direct)
  tauOrbitDrag:      0.0,
  tauOrbitKey:       0.055,
  tauZoom:           0.090,
  tauFocusKey:       0.120,
  followLead:        0.35,

  // snap
  snapMs:            450,
  snapBackMs:        900,
  snapBackIdle:      6.0,
  snapBackEnabled:   false,
  frameEngagementMargin: 0.18,

  // strategic overlay band (see §5.3)
  strategicT0:       1.00,
  strategicT1:       1.35,
  strategicScaleAtT1:400,     // world metres per overlay metre at full strategic zoom
};

export const CINE = {
  fov: 34, back: 1.35, up: 0.22, side: 0.55, aimAhead: 0.9,
  tauPos: 0.55, tauAim: 0.75, driftAmp: 0.018, driftHz: 0.07, rollMax: 0.09,
};
```

---

## 3. Homeworld's movement disc, and why we are not building one

### 3.1 What it actually is

In Homeworld the player presses `M`, which replaces the cursor with a **disc lying in the
horizontal plane**, drawn in world space at the point under the cursor. Clicking on it moves ships
to that point in the plane. Holding `Shift` and dragging the mouse vertically raises or lowers a
vertical stalk from the disc, setting the *altitude* of the destination, and the ships move there
in three dimensions
([HW Remastered beginner guide](https://gameranx.com/updates/id/26824/article/homeworld-remastered-collection-beginners-guide/)).

The disc exists to solve exactly one problem: **a mouse click is two-dimensional and a destination
in Homeworld is three-dimensional.** A ray cast from the cursor into a 3D volume hits infinitely
many valid destinations. The disc resolves that by decomposing the choice into two sequential
one-dimensional decisions — first the plane position, then the height. As one player summarised it,
"in 3D space, if you want to move a ship somewhere that isn't on the same plane, you need to select
the plane position and then the height above or below that plane"
([HW Remastered discussion](https://steamcommunity.com/app/244160/discussions/0/620703493330550142/)).

### 3.2 Does it work?

Partially, and at a real cost. Two decades of Homeworld threads are people asking how to move on
the Y axis at all ([1](https://steamcommunity.com/app/244160/discussions/0/617329150696498623/),
[2](https://steamcommunity.com/app/244160/discussions/0/1836811737984666158/)); players complain
that ships plot a course "down to terrain then back up to the destination point rather than
following the direct move order"; and Homeworld 3 rebuilt the whole control scheme around it and
shipped to Mostly Negative user reviews with the camera and controls as the central complaint. The
disc is a competent answer to a self-inflicted problem.

### 3.3 Recommendation: **no movement disc. Build the plane reticle and the heading drag instead.**

Our cruiser is plane-locked to `y = 0`. A ray from the cursor intersects that plane in **exactly one
point**. The ambiguity the disc exists to resolve does not exist here. Adding a disc would be adding
a two-step interaction to answer a question that has one answer.

What the disc *also* did, incidentally, was make the destination legible in 3D space — you could see
where the click landed. That job is real and we still need it. It is served by two things:

**(a) The plane reticle.** Whenever a move-class order is armed (that is: continuously, since RMB
is always a potential move), the input system draws, every frame:

- a flat ring on `y = 0` at the ray/plane intersection, radius 220 m, one hairline;
- a vertical drop-line from the 3D cursor position down to that ring, if the cursor is over
  geometry above the plane;
- a dashed path from the cruiser's bow to the ring, with tick marks every 5000 m;
- an ETA and distance label at the ring, computed from the *current* speed and turn rate.

Cost: one instanced ring, one line, one label. It removes 100 % of the depth ambiguity for 0 % of
the disc's interaction cost.

**(b) The heading drag.** RMB press-and-drag rotates an arrival-heading arrow around the
destination ring. Release commits both position and arrival facing. Homeworld never had this and it
is the order our game most needs, because *facing is the whole combat model for a broadside ship*.
"Go there" and "go there presenting your port battery" are different orders and the player must be
able to say which. This is the single most valuable thing in this document.

**(c) Strike craft do not get a disc either.** They are not plane-locked and they genuinely move in
3D — but the player never needs to name a 3D point for them. Their orders are *relational*: attack
that, escort me, intercept that, guard. Relations resolve their own altitude. The one absolute
vertical decision a player ever wants to make is "screen high" or "screen low", and that is one
number, delivered by the **engagement band** on `Alt+Wheel` (§1.9): five detents, −1200 to +1200 m.
A slider is a better UI than a disc for a one-dimensional choice, and it is one input instead of
three.

**Reject** any proposal to add a movement disc later "for consistency". The consistency argument
inverts: the disc is inconsistent with a plane-locked ship.

---

## 4. Order feedback inside 100 ms

### 4.1 The rule

0.1 s is the limit for a system to feel like it reacted instantaneously, at which point "no special
feedback is necessary except to display the result"
([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)). Above it the player
stops feeling like the cause of what happened.

**Implementation rule: the order marker is spawned by the input system, from `core/pool.js`, in the
DOM event handler, on the same tick as the click.** It never waits for the simulation. It is
rendered by a render system in the 300–399 UI band on the very next frame — ≤ 16.7 ms at 60 fps,
≤ 6.9 ms at 144.

This is not an optimisation, it is a correctness requirement: while paused, `fixedUpdate` never
runs at all, so any feedback gated on the simulation would take infinite time. Subsystem targeting
and power routing are both designed to be used paused. Feedback must be on the render path.

### 4.2 The three-stage marker

Every order marker has three states:

| Stage | When | Look |
|---|---|---|
| **Provisional** | Spawned in the input handler, same tick as the button press | 60 % alpha, 1 px outline, no fill |
| **Committed** | The orders system accepted it (next `fixedUpdate`, or immediately if paused — see §4.4) | 100 % alpha, filled, 120 ms scale-in from 1.15× with a 90 ms audio confirm |
| **Rejected** | The order is illegal | Flashes to the palette's warn colour, dissolves over 200 ms, one-line reason string in the order bar |

Rejection reasons are specific, never generic: `OUT OF ARC — port battery bears 74°–106°`,
`NO POWER — weapons channel at 0 pips`, `OUT OF RANGE — 14.2 km, rail max 9.5 km`,
`NO SALVAGE ARM INSTALLED`.

### 4.3 Per-order acceptance criteria

`t = 0` is the input event. All visuals listed at `t = 0` must be on screen by the end of the next
rendered frame.

| Order | t = 0 (≤ 1 frame) | ≤ 50 ms | ≤ 100 ms |
|---|---|---|---|
| **Move** (RMB click) | Provisional blue ring at the plane point + dashed path from bow + distance label | RCS igniter flare on the relevant thruster quads; engine spool SFX begins | Ring committed; ETA appears; hull has begun to yaw; heading tape on the HUD starts moving |
| **Move + heading** (RMB drag) | Ring appears on press; heading arrow appears on first 4 px of drag and tracks the cursor 1:1 | Live "arrival bearing 043°" readout; the arriving broadside is highlighted on the ship silhouette | On release: committed; the arrival-facing ghost of the hull draws at the destination at 25 % alpha |
| **Queued move** (Shift+RMB) | New ring at 60 % alpha + segment drawn from the previous waypoint | Waypoint index badge (2, 3, …) | Committed; total route ETA updates in the order bar |
| **Attack** (RMB on hostile) | Red target bracket snaps to the hull; corner ticks animate inward over 90 ms | Weapon-bearing chevrons appear around the reticle, one per mount that can bear | Range/arc readout; every bearing mount's barrels begin to traverse; a mount that cannot bear greys its chevron |
| **Subsystem target** (Ctrl hover → Ctrl+RMB) | Ring segments fade in over 90 ms on hover, before any click | Highlighted segment brightens + label; segments with no bearing weapon go grey | On commit: segment locks with a double ring; aim point marker attaches to `sub.position`; `subsystemAccuracy` shown as a percentage |
| **Salvage** (RMB on wreck) | Amber cut-bracket on the target section | Salvage-arm deploy animation starts; tonnage estimate appears | Committed; cutting beam pre-charge glow; `EV.SALVAGE_CUT_START` fires when in range |
| **Tow** (Alt+RMB on wreck) | Amber bracket + tow-line preview from the arm to the wreck | Mass readout and the resulting handling penalty ("−18 % turn") | Committed; tow line becomes solid |
| **Strike-craft launch** (`L`) | Bay doors begin opening; bay indicators flip to LAUNCHING | Launch klaxon | First craft clears the bay by 900 ms — long, and the *bay indicator* covers the gap |
| **Strike-craft order** (RMB with group) | Green group marker at the point + leader line from the group centroid | Group callsign readout | Committed; craft break formation visibly |
| **Power routing** (`C` radial) | Radial fades in over 80 ms; pip counts are live | Highlighted quadrant brightens; a live delta shows the effect ("shield regen +34 %") | On release: pip animation, channel bar recolours, `EV.POWER_ROUTED` |
| **Power stance** (Shift+E/W/S/D) | All four channel bars begin animating **immediately** | Stance name flashes in the status strip | Bars settled; the 6 s stance cooldown ring starts sweeping |
| **Hard Burn** (`Z`) | Screen-edge vignette pulse; RCS quads all fire | Distinct sustained burn SFX; 6 s duration ring appears | Yaw rate visibly higher; turn-rate gauge jumps to 100 % |
| **All stop** (`X`) | Retro thruster plumes ignite; the velocity vector on the HUD turns amber | Retro SFX | Speed readout ticking down. **The ship takes ~45 s to actually stop.** The order registered instantly; the physics did not. That contrast is the game |
| **Time scale** (Space, `[`, `]`) | Scale indicator changes; a full-screen 90 ms desaturation-and-restore pulse on pause | `EV.TIME_SCALE_CHANGED` | — |
| **Selection** (LMB) | Selection ring, 80 ms scale-in | Info panel populated | `EV.SELECTION_CHANGED` consumers settled |

### 4.4 Orders while paused

Order application must be **idempotent state assignment**, not an event with side effects:

```js
ship.order = { kind: 'move', point: Vector3, arrivalHeading: number|null, queue: [...] };
```

Assigning that is safe outside `fixedUpdate` because it changes *intent*, not simulation state. The
simulation reads intent on its next step and is unaffected by when the assignment happened. This is
what makes orders-while-paused work without a deferred queue and without breaking determinism.

Two hard rules follow:

1. **No order may resolve a random value at issue time.** Any RNG draw belongs in `fixedUpdate`,
   forked from `world.rng`. An order issued at pause and one issued at 4× must produce identical
   simulations from the same seed.
2. **No order may mutate anything but `ship.order` and selection state.** Firing, spending power,
   consuming ammunition and emitting `EV.WEAPON_FIRED` all belong to the simulation systems in
   bands 0–99.

### 4.5 What must never happen

- A marker that appears only after the ship starts moving.
- An order that is silently dropped. Illegal orders get a visible rejection with a reason.
- Audio-only confirmation. Some players turn unit acknowledgements off, and always have
  ([RTS unit acknowledgements](https://forum.quartertothree.com/t/rts-unit-acknowledgements/20907)).
  Audio supplements the visual; it never carries it alone.
- Order feedback gated behind `TIME_SCALES[timeIndex] > 0`.

---

## 5. Travel between points of interest

This is the open question in the brief. Here is the answer.

### 5.1 The constraints

- Fiction: one lone scavenger cruiser. No fleet, no base, no home port.
- 10–15 hand-placed POIs. Hand-placed means they are *authored*, so arriving at one should feel
  like arriving somewhere, not like loading a level.
- No loading screens. Continuous space.
- A faction war (Coalition vs Concord) simulating in the background whether the player is there or
  not.
- The cruiser's combat speed is ~180 m/s and POIs are hundreds of kilometres apart. Sublight at
  combat speed is not on the table at any time scale.

### 5.2 Option A — continuous sublight flight, no travel layer

Fly the whole way at combat speed, with time compression to make it tolerable.

**For:** maximum continuity. Zero new UI. The gas giant and starfield parallax genuinely sell
distance over a long burn.

**Against:** the arithmetic kills it. A 300 km leg at 180 m/s is 28 minutes of simulated time. To
make that 40 wall-clock seconds you need 40× compression, which is ten times our maximum
`TIME_SCALES` value of 4 and would require a second, parallel time system anyway — so "no travel
layer" is a fiction; you have one, it is just undesigned. Worse, at 40× you cannot react to
anything, so the whole journey is dead air. This is Elite Dangerous's supercruise failure mode,
where players describe "never getting there" and being "mind-numbing while watching that supercruise
screen"
([ED travel discussion](https://steamcommunity.com/app/359320/discussions/0/1744479698796247465/)).
**Reject.**

### 5.3 Option B — a system map screen with a jump drive

Press a key, get a separate 2D map screen, click a node, jump. FTL's structure.

**For:** trivial to implement. Instantly readable. Makes each POI a discrete, authored place.
Pairs naturally with a fuel economy.

**Against:** it is a loading screen with a nice background, and the brief forbids loading screens.
This is precisely what players say about Elite Dangerous's hyperspace: "the jump screen is
essentially a pretty loading screen … basically a glorious loading screen"
([Frontier forums](https://forums.frontier.co.uk/threads/e-d-why-the-loading-screens-supercruise-coming-up-orbital-cruise-and-hyperspace.194125/)).
It also destroys the fiction: a lone scavenger with a working jump drive is not a scavenger, it is a
courier. And it makes the faction war invisible — you never see the space between the places, so
you never see the war moving through it. **Reject as a standalone.**

### 5.4 Option C — a sensor-uncovering exploration layer

A fog-of-war field over continuous space. Fly around; sensors reveal.

**For:** exploration is the fiction. Highfleet's strategic map is the proof that a sensor layer can
carry an entire game's tension — "the most important battles often happen on the map screen", and
"if you don't understand how the map works, the Empire will find you long before you find them"
([Highfleet guide](https://gameplay.tips/guides/11966-highfleet.html),
[Highfleet sensors](https://highfleet.fandom.com/wiki/Sensors)). It couples power routing directly
into travel, since sensors are one of our four `POWER_CHANNELS`.

**Against:** as a *travel* mechanism it is incomplete — it tells you where to go, not how to get
there. With only 10–15 hand-placed POIs, pure procedural uncovering also wastes authored content:
the player spends most of their time sweeping empty space. **Reject as a standalone; adopt as the
discovery layer.**

### 5.5 The decision: **Plot-and-Burn**

**One continuous coordinate space. Tactical View is the system map, reached by continuing the same
zoom gesture. Travel is a physical transit burn that you can watch, that costs propellant, that is
interruptible, and that is dangerous in proportion to how much of the faction war you fly through.
POIs are discovered by sensors and by intel salvaged from the last POI.**

It is Option C's discovery layer plus Freelancer's cruise engine, wearing Sins of a Solar Empire's
seamless zoom instead of a map screen.

The precedents are all load-bearing. Freelancer's cruise engine hits 300 m/s but disables your
weapons, and cruise-disruptor missiles knock you out of it — "forcing players to decide between the
safety of fast travel versus the vulnerability of being unable to defend themselves while in cruise
mode" ([Freelancer tips](https://freelancer.fandom.com/wiki/Tips_and_tricks),
[Freelancer](https://en.wikipedia.org/wiki/Freelancer_(video_game))). Highfleet supplies the fuel
economy and the dread of being detected on the map. Sins supplies the "never leave the world"
zoom.

#### 5.5.1 What the screen looks like

There is **no separate scene and no camera teleport**. Tactical View is a screen-space overlay drawn
on top of the still-live, still-rendering 3D scene.

The mechanism, in detail, because it has to respect the renderer's committed 260 km far plane which
this stream does not own:

- `zoomT` is allowed to run past 1.0, up to `ORBIT.strategicT1 = 1.35`.
- The 3D camera **parks** at `zoomT = 1.0` (`CAMERA.maxDistance`, 46 km) and stops moving.
- Across `zoomT ∈ [1.00, 1.35]` the strategic overlay cross-fades in (0 → 1 alpha) while the 3D
  scene dims to 0.22 exposure via the post chain's existing exposure control. At `zoomT = 1.35` the
  overlay is at a scale of 400 world metres per overlay metre, putting a 2000 km system inside a
  5 km overlay frame.
- The 3D scene keeps rendering behind the overlay the whole time. Ships still move. Weapons still
  fire. Explosions still happen behind the map. **This is the entire point** — it is why this is not
  a map screen.
- Zooming back in reverses the fade continuously. There is never a discontinuity, never a load,
  never a black frame.

Contents of the overlay:

| Element | Look |
|---|---|
| Plane grid | 50 km cells, hairline, fades toward the frame edge |
| Player | Bright chevron at true position, with a velocity vector line scaled to 60 s of travel |
| Known POI | Hollow diamond + name + kind glyph (belt / battlefield / station / graveyard / yard) |
| Visited POI | Filled diamond |
| Unresolved blip | Soft dot, no name. Label reads e.g. `MASS SIG · ~3400 m · UNRESOLVED · brg 214` |
| Faction control | Low-alpha Voronoi tint over POI cells, Coalition and Concord palette hues, alpha = `abs(control)` |
| Patrol heat | Red diagonal hatch, density = `heat`, per cell |
| Front line | A 3 px polyline where `control` crosses zero. It moves between visits |
| Plotted course | Dashed line, tick every 60 s of sim time, per-leg and total ETA, propellant cost |
| Threat on course | Course segments crossing `heat > 0.4` render in warn colour with an interception-chance percentage |
| POI list | Right-hand column: name, distance, ETA, propellant, last-known control, "hostiles present" flag with the timestamp of when you last had eyes on it |

Homeworld's Sensors Manager is the model for the icon layer, and its known failure is worth
pre-empting: it needed "more granular options for icon amalgamation"
([Homeworld dev update](https://www.homeworlduniverse.com/war-games-feedback/)). Ours declusters
automatically — icons within 24 screen px merge into a count badge that expands on hover.

#### 5.5.2 Inputs

Given in §1.10. The core loop is three keys: `Tab`, RMB, `Enter`.

#### 5.5.3 The travel model

The cruiser has two propulsion modes.

| | Combat | Transit | Transit (SILENT stance) |
|---|---|---|---|
| Max speed | 180 m/s | 3600 m/s | 1800 m/s |
| Accel | 6.0 m/s² | 30.0 m/s² | 13.0 m/s² |
| Drive spool | — | 25 s | 25 s |
| Weapons | Full | **Offline** | **Offline** |
| Shields | Full | **25 %** | **25 %** |
| Turn rate | Per §6 | ×0.30 | ×0.30 |
| Sensor signature | ×1.0 | **×6.0** | **×1.5** |
| Propellant | — | `0.8 units per km` | `0.5 units per km` |

The 30 m/s² transit acceleration is five times the combat figure and that is not a cheat — it is
the entire reactor on the drive, which is exactly why weapons are offline and shields are at a
quarter. The propulsion numbers and the power numbers are the same numbers.

`Enter` on a committed course does this, visibly, in the 3D world:

1. Cruiser turns to the leg heading at its normal (slow) turn rate. You watch it come about.
2. Transit spool: 25 s, main drive plume grows to 4× length, hull frame audio.
3. Burn: 30 m/s² to a 3600 m/s ceiling (216 km of runway; short legs never reach the ceiling).
4. Deceleration burn, automatic, symmetric, computed to arrive at combat speed at the POI boundary.

**Transit compression.** While in transit *and* with no contact inside sensor range, the time
control offers extra scales: 8×, 16×, 32×, 64×, accessible with `]` past 4×. These scales are
**transit-exclusive** and are removed the instant a contact resolves. They are implemented in the
existing `TIME_SCALES` mechanism (integration owns extending that array; noted in §8), not as a
parallel time system.

**Travel times.** POI spacing is authored at 120–600 km. All figures include the 25 s spool.

| Leg | Sim time | At 16× | At 32× | At 64× | Propellant | Risk rolls |
|---|---|---|---|---|---|---|
| 120 km | 151 s | 9.5 s | 4.7 s | 2.4 s | 96 | 2 |
| 300 km | 225 s | 14.1 s | 7.0 s | 3.5 s | 240 | 3 |
| 600 km | 312 s | 19.5 s | 9.7 s | 4.9 s | 480 | 5 |

Long enough to be a journey. Short enough that you never resent it. Compare Elite's multi-minute
supercruise approaches, which are the explicit anti-target. Under SILENT the same legs take 217 /
330 / 497 s — roughly **1.5× the time**, which is the price of the risk reduction below.

**Risk.** Every 60 s of transit sim time, roll an interception check for the segment you are on:

```js
P_intercept = clamp(heat * HEAT_K * signatureMul, 0, HEAT_CAP)
// HEAT_K = 0.05, HEAT_CAP = 0.35
// signatureMul = 6.0 in transit, 1.5 under SILENT
```

Total odds of being intercepted at least once, normal / SILENT:

| Leg | heat 0.1 | heat 0.3 | heat 0.5 | heat 0.7 | heat 0.9 |
|---|---|---|---|---|---|
| 120 km | 6 % / 2 % | 17 % / 7 % | 28 % / 11 % | 38 % / 15 % | 47 % / 19 % |
| 300 km | 9 % / 4 % | 25 % / 11 % | 39 % / 17 % | 51 % / 24 % | 61 % / 29 % |
| 600 km | 14 % / 6 % | 38 % / 17 % | 56 % / 26 % | 69 % / 35 % | 79 % / 43 % |

Read the shape: quiet space is effectively free, contested space is a coin flip, long legs through
hot space are close to a certainty, and SILENT cuts the risk to roughly a third for half again the
travel time. Every cell of that table is a decision the player can see on the course plot before
committing, because the percentage is drawn on the leg.

The roll comes from `world.rng.fork('transit-intercept')` — deterministic, reproducible from seed.

On a hit: **drop out of transit at the current point on the leg**, into a generated **ambush
pocket** — not a POI, just open space with a patrol in it. No load, no transition, you were already
there. Your weapons come back online over 12 s (the spin-down), which is the cost of having been
fast. This is Freelancer's cruise disruptor, and it is why cruise mode there is a decision rather
than a formality.

**Mitigation.** The `SILENT` power stance (Shift+D) halves both transit acceleration and ceiling and
cuts the signature multiplier from 6.0 to 1.5. It also costs less propellant (0.5/km rather than
0.8/km), because you are running the drive gently. One keypress, made with the same widget you use
in combat, altering travel time, fuel and risk together — which is the whole reason power routing
exists as a layer rather than as a combat gimmick.

#### 5.5.4 Wait — a transit drive on a scavenger?

Yes, and the fiction is load-bearing: the cruiser's transit drive is **salvaged and marginal**. It
is a `bow`/`engine` hardpoint module in the module registry. It cannot be lit within 40 km of a
large mass. It is one of the subsystems the enemy can shoot — losing it strands you at the current
POI until you salvage a replacement, which is a genuinely frightening loss state and a good one.
"Fast travel is a piece of equipment that can be destroyed" is more interesting than any menu.

### 5.6 How POIs are discovered

Three channels, in ascending order of importance.

**1. Passive contact.** Anything inside `RANGE.sensorBase` (14 km) × sensor-pip multiplier resolves
automatically, named and classified. This covers your immediate surroundings only.

**2. Long-range survey.** From Tactical View, press `S` and drag a bearing. The cruiser sweeps a
**35° cone out to 300 km** over **30 s of sim time**, requiring **≥ 3 sensor pips**. It returns
unresolved blips: bearing, rough mass, rough range. `MASS SIG · ~3400 m · UNRESOLVED · brg 214`
tells you something hulk-sized is out there and nothing else. This is Highfleet's sector search,
which lets you "focus your radar on a specific area at a 60 degree angle … this makes your radar
undetectable to ELINT outside that angle"
([Highfleet sensors](https://highfleet.fandom.com/wiki/Sensors)). Ours has the same trade: an active
sweep spikes your own signature ×3 for its duration and both factions get a fix on you. Looking is
not free.

**3. Intel — the primary channel.** Salvaged nav computers, faction transponder caches, survivor
logs. Each grants an exact POI: name, coordinates, kind, and one line of authored context. Intel is
weighted into wreck loot tables such that roughly **one POI in three yields intel on one to two
further POIs.**

The resulting shape: a survey blip is a *reason* to travel, an intel drop is a *destination*, and
the map fills in as a consequence of taking apart the last place you visited. The exploration layer
and the salvage layer are the same loop. With only 10–15 authored POIs this also guarantees the
player sees them in a broadly authored order without ever being railroaded, because they can always
chase a blip instead.

Start state: 1 POI known (where you begin), 2 blips visible.

### 5.7 Interaction with the faction war

The world-sim stream owns `src/world/system.js` and `src/sim/ai/**`. The travel layer reads and does
not write, across a deliberately tiny surface:

```js
world.systems.factionWar = {
  poiState(poiId): { control: number,   // -1 Concord … +1 Coalition
                     heat: number,      // 0..1 patrol density
                     contested: boolean,
                     lastSeenTick: number },
  heatAt(x, z): number,                 // sampled along a plotted leg
  frontLine(): Vector2[],               // polyline, for the overlay
};
```

Four couplings, all of which give the player a reason to care about a simulation they cannot see:

1. **Heat drives interception risk** (§5.5.3). Flying through a contested corridor is a choice with
   a number attached, shown on the course before you commit.
2. **Control determines what you find.** A POI that has flipped hands since your last visit has a
   regenerated wreck field of the *losing* faction's hulls. The war is a salvage crop and the map
   tells you where the harvest is.
3. **`EV.BATTLE_STARTED` at a known POI puts a pulsing marker on the overlay with a countdown to
   `EV.BATTLE_RESOLVED`.** Arrive during the battle and you get a live three-way, the richest and
   most dangerous salvage in the game. Arrive after and you get a cold field with nobody shooting
   at you and a lower yield. **This is what makes the travel layer good**: it converts "where do I
   go" into "where do I go *now*", and a travel system without a clock is just a menu.
4. **Reputation gates transit.** `world.reputation` at or below −40 with a faction lets that faction
   run **standing pickets** in its own space, raising `heat` on legs through it by +0.25 flat.
   Making an enemy narrows the map.

The war runs whether you are watching or not. The overlay renders `lastSeenTick` honestly: stale
data is drawn desaturated with an age readout, and can be wrong. You are a scavenger with an old
sensor suite, not a fleet admiral.

---

## 6. Feel tuning

### 6.1 Cruiser starting values

For `registerShipClass` on the player cruiser. `length` must equal `HULL_LENGTH.cruiser = 1400`.

```js
{
  id: 'player_cruiser',
  length:   1400,        // m
  mass:     620000,      // tonnes, hull only, before modules
  maxSpeed: 180,         // m/s combat
  accel:    6.0,         // m/s^2
  turnRate: 0.085,       // rad/s AT REST — this is what ShipClassDef.turnRate means
  hullHP:   /* combat stream */,
  planeLocked: true,
}
```

Everything else is camera/controls-stream constants that the physics stream consumes:

```js
export const CRUISER_FEEL = {
  // linear
  maxSpeed:        180.0,   // m/s
  accelFwd:        6.0,     // m/s^2
  accelRetro:      4.0,     // m/s^2 — decelerating is harder than accelerating
  accelLateral:    1.1,     // m/s^2 strafe
  maxLateralSpeed: 35.0,    // m/s

  // angular
  turnRateAtRest:  0.085,   // rad/s  (4.87 deg/s)
  angAccel:        0.030,   // rad/s^2 — spool to full yaw in 2.83 s
  turnFalloff:     0.72,
  turnExp:         1.35,
  turnRateFloorK:  0.22,    // never below 22% of at-rest rate

  // transit (see §5.5.3)
  transitMaxSpeed:   3600.0,  // m/s
  transitAccel:      30.0,    // m/s^2
  transitSpool:      25.0,    // s
  transitTurnMul:    0.30,
  transitSignature:  6.0,
  silentMaxSpeed:    1800.0,
  silentAccel:       13.0,
  silentSignature:   1.5,
  propellantPerKm:      0.8,
  propellantPerKmSilent:0.5,
  heatK:             0.05,
  heatCap:           0.35,
  riskRollPeriod:    60.0,    // s of sim time

  // visual
  bankMax:         0.12,    // rad
  bankTau:         1.4,     // s — the bank LAGS the turn. that lag is the tonnage
};
```

### 6.2 Why these numbers

**`maxSpeed = 180`.** The ship crosses its own length in `1400 / 180 = 7.8 s`. That ratio is the
single strongest cue for size. A real destroyer at 30 kn is 150 m long and takes 10 s to cross its
own length; keeping ours in the same 8–10 s band is what makes 1400 m read as 1400 m rather than as
a fast fighter with a big model.

**`accelFwd = 6.0`.** 0 to 180 m/s in 30 s, covering 2700 m — just under two hull lengths of runway
to reach cruise. You feel the ship *spool*.

**`accelRetro = 4.0`.** 45 s and 4050 m to stop from full speed. Deliberately worse than
acceleration: stopping is the hard problem, exactly as in Battlefleet Gothic where ships need
dedicated "retro engines to nullify momentum and stop efficiently"
([Third Coast Review](https://thirdcoastreview.com/2019/01/24/game-review-battlefield-gothic-armada-ii)).
`X` (all stop) is an order that takes three quarters of a minute to complete, and the player must
learn to issue it early.

**`turnRateAtRest = 0.085 rad/s`.** 90° in 18.5 s at rest, a full circle in 74 s. Slow enough to
have weight, fast enough that a fight is not a stalemate. Reviewers describe BFGA's capitals as
"massive, slow behemoths that take forever to turn"
([CulturedVultures](https://culturedvultures.com/battlefleet-gothic-armada-2-pc-review/)) and count
that as a virtue.

**`angAccel = 0.030 rad/s²`.** 2.83 s to spool up to full yaw rate and the same to spool down. There
is no angular drag in vacuum, so the sim must apply counter-torque to stop a turn, which means an
uncorrected turn **overshoots**. Ship the overshoot. It is the strongest single tell that the thing
you are steering is enormous, and it is what makes the visible RCS plumes meaningful rather than
decorative.

> **Implementation warning.** Do not derive `angAccel` from thruster geometry and hull mass. With
> `m = 6.2 × 10⁸ kg` and `I ≈ 0.11 m L² = 1.3 × 10¹⁴ kg·m²`, the required torque is ~4 × 10¹² N·m,
> which no plausible RCS array delivers. Declare `angAccel` as a tuning constant, place the RCS VFX
> to *match* the declared motion, and move on. Nobody has ever enjoyed a game more because its
> reaction control system closed.

### 6.3 Turn rate degradation with velocity

The requested formula, and the most important number in this document.

```js
function turnRateAt(speed, F = CRUISER_FEEL) {
  const s = clamp(speed / F.maxSpeed, 0, 1);
  const raw = F.turnRateAtRest * (1 - F.turnFalloff * Math.pow(s, F.turnExp));
  return Math.max(raw, F.turnRateAtRest * F.turnRateFloorK);
}
```

| Speed | ω (rad/s) | 90° takes | Turn radius `v/ω` | In hull lengths |
|---|---|---|---|---|
| 0 (at rest) | 0.0850 | 18.5 s | — | — |
| 45 m/s (25 %) | 0.0756 | 20.8 s | 595 m | 0.43 L |
| 90 m/s (50 %) | 0.0611 | 25.7 s | 1473 m | 1.05 L |
| 135 m/s (75 %) | 0.0435 | 36.1 s | 3103 m | 2.22 L |
| 180 m/s (100 %) | 0.0238 | 66.0 s | 7563 m | 5.40 L |

**Read the last column.** The turn radius spans 12.5× across the speed range. That single fact
generates the entire tactical layer of the game:

- **You must slow down to turn**, so committing to a heading at speed is a real commitment.
- A 5.4-length turning circle at full speed is battleship-shaped. Real battleships have tactical
  diameters of three to four lengths; a little more is correct for something with no water to bite
  against.
- It makes `Z` (Hard Burn / High Energy Turn) worth a whole power channel and a 40 s cooldown,
  because it restores `turnRateAtRest` regardless of speed. Making the escape valve expensive is
  what makes the constraint fun rather than punishing — which is exactly why BFGA gives High Energy
  Turn a running cost and forbids it to battleships
  ([BFGA2 abilities](https://mygamingtutorials.com/2025/06/03/essential-abilities-guide-for-battlefleet-gothic-armada-2/)).
- It makes `R` (reverse) genuinely useful: backing off along your current heading keeps your
  broadside on the target, which you would lose by turning.

`turnExp = 1.35` (rather than 1.0) means the penalty stays mild through the low half of the speed
range and bites hard in the top quarter — so fine positioning at 25–50 % speed stays pleasant while
full-speed manoeuvring feels like moving a mountain. That asymmetry is deliberate: the player should
be punished for being fast, not for existing.

Highfleet's whole reputation rests on this: "heavier ships have greater inertia, no matter how
powerful their engines are", and players must manage "inertia-heavy maneuvers that emphasize precise
positioning" ([Highfleet review](https://www.gosunoob.com/reviews/highfleet-review-brilliant-but-frustrating/),
[Gamasutra/GameDeveloper on designing Highfleet](https://www.gamedeveloper.com/design/designing-i-highfleet-i-a-strategy-game-with-heavy-machinery-and-twirling-knobs)).

### 6.4 Modules change the handling

`ModuleDef.mass` is in tonnes and must actually matter, or the refit screen is cosmetic.

```js
const mTotal = base.mass + sum(installedModules.map(m => m.mass ?? 0));
const accelEff    = base.accelFwd * (base.mass / mTotal);
const turnRateEff = base.turnRateAtRest * Math.pow(base.mass / mTotal, 0.6);
```

The 0.6 exponent makes turn rate degrade more gently than linear mass, so a fully-loaded ship is
noticeably heavier without becoming unplayable. Target: a maximum tier-3 loadout across all six
hardpoints should land near **−22 % acceleration** and **−14 % turn rate** versus a bare hull. That
is a felt cost, not a wall — the player should be able to feel the fit-out in the first thirty
seconds of flying it, and should occasionally choose to leave a good module uninstalled.

Show both deltas live in the refit preview (`EV.REFIT_PREVIEW`), as signed percentages against the
current fit, before the player commits.

### 6.5 Visual bank

```js
bank = clamp(-yawRate / turnRateAtRest, -1, 1) * bankMax;   // bankMax = 0.12 rad ≈ 6.9°
appliedBank = damp(appliedBank, bank, bankTau /* 1.4 s */, dt);
```

Bank is applied to the visual root only — never to physics, never to hardpoint arcs, never to the
plane lock. `bankTau = 1.4 s` means the roll arrives about a second after the turn starts and leaves
a second after it ends. **That lag is the tonnage.** A bank that tracks the turn instantly reads as
a fighter regardless of the model's size.

---

## 7. Verification

Behaviours worth an automated or scripted check, since `npm run smoke` must pass and every one of
these is cheap:

| Check | Assertion |
|---|---|
| Zoom is geometric | `d(zoomT + stepT) / d(zoomT)` is 1.18 ± 0.001 at zoomT ∈ {0, 0.25, 0.5, 0.75, 1.0} |
| Damping is frame-rate independent | 240 steps of dt = 1/240 and 60 of dt = 1/60 converge within 1e-4 |
| Pitch never leaves the clamp | Fuzz zoomT × pitchOffset over the full range; assert `minPitch ≤ pitch ≤ maxPitch` |
| No `Math.random` | grep `src/input`, `src/camera` — zero hits |
| No hot-loop allocation | Camera render system allocates zero `Vector3` per frame; use `scratch` from `core/world.js` |
| Order feedback latency | Synthetic click → marker present in the scene graph before the next `render()` returns |
| Orders survive pause | Issue every order type at `TIME_SCALES[0]`; assert `ship.order` is set and no `EV.WEAPON_FIRED` fired |
| Determinism | Same seed + same recorded input timeline → identical `world` state hash, at 1× and at 4× |
| Turn-rate curve | `turnRateAt(180) / turnRateAt(0)` = 0.28 ± 0.005; monotonically decreasing over [0, 180] |
| Transit timing | 300 km leg = 225 ± 2 s sim time; SILENT = 330 ± 2 s |
| Interception odds | 300 km at heat 0.5 → 0.39 ± 0.01 cumulative, normal; 0.17 ± 0.01, SILENT |
| Transit compression is gated | Enter transit, spawn a contact inside sensor range, assert the time scale is clamped to ≤ 4× on that same tick |
| Snap cancels | Start a `Home` snap, inject orbit input at 200 ms; assert camera state stops changing on that frame |

---

## 8. Notes for other streams

Changes I need but do not own. Per ARCHITECTURE.md, these are proposals, not edits.

1. **`src/core/units.js` — `TIME_SCALES`.** Section 5.5.3 needs transit-only compression above 4×.
   Cleanest fix: keep `TIME_SCALES = [0, 1, 2, 4]` as the combat set and add
   `TRANSIT_TIME_SCALES = [0, 1, 2, 4, 8, 16, 32, 64]`, with the time controller selecting the array
   by context. Integration owns this. Nothing else in this document depends on it.
2. **`src/render/postfx.js` — exposure hook.** The Tactical View cross-fade (§5.5.1) dims the 3D
   scene to 0.22 exposure across `zoomT ∈ [1.00, 1.35]`. The camera stream needs a public
   `post.setExposureScale(k)` or equivalent. If one does not exist, the overlay falls back to a
   plain alpha plate, which is worse but shippable.
3. **World sim — `world.systems.factionWar`.** The read-only surface in §5.7:
   `poiState(id)`, `heatAt(x, z)`, `frontLine()`. Three functions, no writes.
4. **Combat — subsystem screen projection.** The subsystem ring (§1.7) needs, per hostile,
   `subsystem.worldPosition` and a per-subsystem `canAnyWeaponBear(fromShip, sub) → boolean`. The
   greying behaviour is the teaching mechanism and does not work without the second one.
5. **Salvage — wreck sectioning.** `order.salvage.section` needs wrecks to expose named, targetable
   sections with `salvageValue`, structurally parallel to `SubsystemDef`, so the ring UI can be one
   component used by both.
6. **UI — order bar.** A single-line status strip that the input stream can write rejection strings
   into (§4.2). Owned by UI; the contract is one method, `ui.orderBar.say(text, severity)`.

---

## Sources

- [NN/g — Response Time Limits: 0.1s, 1s, 10s](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [Rory Driscoll — Frame Rate Independent Damping Using Lerp](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/)
- [Game Developer — Improved Lerp Smoothing](https://www.gamedeveloper.com/programming/improved-lerp-smoothing-)
- [Wayline — Crafting an RTS Camera in Godot: Panning, Zooming, Rotation](https://www.wayline.io/blog/godot-rts-camera-panning-zooming-rotation)
- [GameDev.net — Camera zoom math](https://gamedev.net/forums/topic/549701-camera-zoom-math/)
- [Homeworld Remastered Collection Beginners Guide — Gameranx](https://gameranx.com/updates/id/26824/article/homeworld-remastered-collection-beginners-guide/)
- [Very Quick Tips: Homeworld Remastered Collection — Destructoid](https://www.destructoid.com/very-quick-tips-homeworld-remastered-collection/)
- [Homeworld Remastered Manual — Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Homeworld_Remastered_Manual)
- [Steam Guide — List of Key Bindings with Tips & Hints (Homeworld: Deserts of Kharak)](https://steamcommunity.com/sharedfiles/filedetails/?id=612574050)
- [Homeworld 3 — All Controls and Keybinds (gamepressure)](https://www.gamepressure.com/newsroom/homeworld-3-all-controls-and-keybinds/z66d6f)
- [Homeworld 3 Review — Gamerant](https://gamerant.com/homeworld-3-review/)
- [Homeworld 3 — "The camera control is just god awful"](https://steamcommunity.com/app/1840080/discussions/4/7093810350790949529/)
- [Homeworld 3 — "Absolutely TERRIBLE control scheme"](https://steamcommunity.com/app/1840080/discussions/0/4208119778367545699/)
- [Homeworld 3 — Controls/general feedback](https://steamcommunity.com/app/1840080/discussions/0/4208119778369711135/)
- [Homeworld 3 — My Controls Feedback](https://steamcommunity.com/app/1840080/discussions/4/4357873276735549635/)
- [Homeworld 3 — Sensor Manager feedback](https://steamcommunity.com/app/1840080/discussions/4/4330852793645733776/)
- [Homeworld Universe — Dev Update: 5 Big Changes We're Making Because Of Your Feedback](https://www.homeworlduniverse.com/war-games-feedback/)
- [Homeworld Remastered — "how do I move my units on the y axis of this game?"](https://steamcommunity.com/app/244160/discussions/0/617329150696498623/)
- [Homeworld Remastered — "wondering about the Z"](https://steamcommunity.com/app/244160/discussions/0/1836811737984666158/)
- [Homeworld Remastered — "I'm used to 2D RTS"](https://steamcommunity.com/app/244160/discussions/0/620703493330550142/)
- [NEBULOUS: Fleet Command PC Keyboard Controls Guide — Magic Game World](https://www.magicgameworld.com/nebulous-fleet-command-pc-keyboard-controls-guide/)
- [NEBULOUS: Fleet Command/Controls — StrategyWiki](https://strategywiki.org/wiki/NEBULOUS:_Fleet_Command/Controls)
- [NEBULOUS: Fleet Command — Update 0.1.0.6 Key Bindings](https://store.steampowered.com/news/app/887570/view/3133946090940239598)
- [NEBULOUS — camera controls thread](https://steamcommunity.com/app/887570/discussions/0/3189115186369337838/)
- [NEBULOUS — Targeting subsystems](https://steamcommunity.com/app/887570/discussions/0/5299051083539488513/)
- [NEBULOUS — Pre-planning maneuvers and fire missions](https://steamcommunity.com/app/887570/discussions/0/3275814396763891816/)
- [NEBULOUS: Fleet Command — Missiles (programming channels)](https://wiki.hoodedhorse.com/NEBULOUS_Fleet_Command/Missiles)
- [Battlefleet Gothic: Armada 2 — Ship Command and Control wiki](http://bfga2.wikidot.com/wiki:command)
- [Essential Abilities Guide for Battlefleet Gothic: Armada 2](https://mygamingtutorials.com/2025/06/03/essential-abilities-guide-for-battlefleet-gothic-armada-2/)
- [Battlefleet Gothic: Armada II review — Third Coast Review](https://thirdcoastreview.com/2019/01/24/game-review-battlefield-gothic-armada-ii)
- [Battlefleet Gothic: Armada 2 review — CulturedVultures](https://culturedvultures.com/battlefleet-gothic-armada-2-pc-review/)
- [Battlefleet Gothic: Armada 2 review — PC Gamer](https://www.pcgamer.com/battlefleet-gothic-armada-2-review/)
- [Designing HighFleet, a strategy game with heavy machinery and twirling knobs — Game Developer](https://www.gamedeveloper.com/design/designing-i-highfleet-i-a-strategy-game-with-heavy-machinery-and-twirling-knobs)
- [HighFleet Review — GosuNoob](https://www.gosunoob.com/reviews/highfleet-review-brilliant-but-frustrating/)
- [HighFleet — Sensors wiki](https://highfleet.fandom.com/wiki/Sensors)
- [HighFleet Basic Guide (radar, map)](https://gameplay.tips/guides/11966-highfleet.html)
- [HighFleet — Map View](https://www.magicgameworld.com/highfleet-map-view/)
- [FTL: Faster Than Light — Systems wiki](https://ftl.fandom.com/wiki/Systems)
- [FTL — How does AI targetting work?](https://steamcommunity.com/app/212680/discussions/0/3050611812299960374/)
- [FTL Analysis: Subsystems — vigaroe](https://www.vigaroe.com/2022/08/ftl-analysis-subsystems.html)
- [Sins of a Solar Empire — Gameplay wiki](https://wiki.sinsofasolarempire.com/index.php?title=Gameplay)
- [Sins of a Solar Empire — Wikipedia](https://en.wikipedia.org/wiki/Sins_of_a_Solar_Empire)
- [Terra Invicta Dev Diary #18: Space Combat](https://www.pavonisinteractive.com/phpBB3/viewtopic.php?t=29439)
- [Terra Invicta — "Space combat is awful" feedback thread](https://steamcommunity.com/app/1176470/discussions/2/3425564314034843074/)
- [SpaceBattles — realistic space battle sims, on Children of a Dead Earth's 2D flattening](https://forums.spacebattles.com/threads/has-there-been-ever-a-realistic-space-battle-simulation-game.1118854/)
- [Rebel Galaxy — GameSpot user review on plane-locking for broadsides](https://www.gamespot.com/rebel-galaxy/user-reviews/2200-12677002/)
- [Rebel Galaxy review — Destructoid](https://www.destructoid.com/reviews/review-rebel-galaxy/)
- [Freelancer — Tips and tricks (cruise engines, cruise disruptors)](https://freelancer.fandom.com/wiki/Tips_and_tricks)
- [Freelancer — Wikipedia (trade lanes)](https://en.wikipedia.org/wiki/Freelancer_(video_game))
- [Elite Dangerous — "Make the travel system more seamless"](https://steamcommunity.com/app/359320/discussions/0/1744479698796247465/)
- [Elite Dangerous — "The loading screens, supercruise..." Frontier forums](https://forums.frontier.co.uk/threads/e-d-why-the-loading-screens-supercruise-coming-up-orbital-cruise-and-hyperspace.194125/)
- [Elite Dangerous — Supercruise wiki](https://elite-dangerous.fandom.com/wiki/Supercruise)
- [Quarter To Three — RTS unit acknowledgements](https://forum.quartertothree.com/t/rts-unit-acknowledgements/20907)
