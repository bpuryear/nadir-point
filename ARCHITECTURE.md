# Nadir Point — architecture and stream contracts

**Read this before writing a line of code.** Every stream codes against the shapes
here. The point of this document is that twelve people can work in parallel and the
result assembles without a rewrite.

Everything is **three.js** (r185, `WebGLRenderer`). No other renderer, no other engine.
Vite is a dev server and bundler, nothing more.

---

## Non-negotiables

1. **One world unit is one metre.** The cruiser is 1400 units long because it is 1.4 km
   long. A fighter is 18. Never rescale to make something convenient.
2. **No `Math.random`, ever.** Fork an `RNG` from `world.rng` with a label. A seeded
   run must reproduce exactly.
3. **No allocation in hot loops.** Use `scratch` vectors from `core/world.js` and the
   pools in `core/pool.js`. `new THREE.Vector3()` inside `fixedUpdate` is a defect.
4. **Geometry is low-poly and hard-edged.** Budgets in `core/units.js#BUDGET` are hard
   ceilings, not targets: cruiser core ≤ 2000 tris, module ≤ 400, fighter ≤ 150.
5. **No image files.** Every texture is generated at runtime into a `DataTexture` or
   `CanvasTexture`. Nothing is fetched, nothing is committed as a binary asset.
6. **Detail density is capped.** If you are about to add surface noise to "make it look
   better", stop. Mismatched salvage only reads as deliberate under a constrained
   visual language. Added detail actively breaks the core system.

---

## Frame structure

```
Engine (core/loop.js)
 ├─ fixedUpdate @ 60 Hz, scaled by time controls (0/1/2/4×)   ← all simulation
 └─ render systems, every frame regardless of pause           ← camera, VFX lerp, UI
      └─ Renderer.render()
           ├─ far scene   (celestials, own camera, cleared)
           ├─ depth clear
           ├─ main scene  (everything in metres)
           └─ post chain
```

Simulation is a fixed step so capital-ship momentum feels identical at 30 fps and
144 fps, and so a seed reproduces. **Never read `dt` from the render loop inside a
simulation system.**

### Two scenes, deliberately

`renderer.scene` is the gameplay scene: ships, modules, debris, VFX. Real metres,
near 2, far 260000.

`renderer.far` is the celestial backdrop: gas giant, star, nebula shells, starfield.
Its camera copies the main camera's orientation and takes a whisper of its
translation (`FAR_SCENE.parallax`). This is why a gas giant can fill a third of the
frame while a fighter 40 m away still z-sorts against the hull.

**If you add a celestial, it goes in `world.far`. If a player can shoot it, tow it or
crash into it, it goes in `world.scene`.** Nothing lives in both.

---

## Registering content

You do not wire anything into a switch statement. You register a definition and the
game finds it. See `core/contracts.js` for the full typedefs.

```js
import { registerModule } from '../core/contracts.js';

registerModule({
  id: 'port_cannon_bank_mk2',
  name: 'Coalition Cannon Bank',
  hardpoint: 'port',          // bow | dorsal | ventral | port | starboard | engine
  tier: 2,                    // 1..3
  faction: 'coalition',       // carries this faction's visual identity onto your hull
  description: 'Six-barrel mass driver bank cut off a Coalition line frigate.',
  triBudget: 400,
  mass: 340,
  build(ctx) { /* returns THREE.Object3D */ },
  weapon: { /* WeaponDef */ },
  silhouetteTags: ['barrel-cluster', 'boxy', 'overhanging'],
});
```

`registerShipClass` and `registerPOI` work the same way. Registration **validates** —
a missing field or an unknown hardpoint throws at import time rather than producing a
module nobody can install.

### `BuildContext`

Every `build(ctx)` receives:

| field | meaning |
|---|---|
| `ctx.rng` | deterministic stream, already forked for this object |
| `ctx.materials` | shared material registry — **never construct your own material** |
| `ctx.palette` | the active locked palette |
| `ctx.faction` | faction id, for material variant selection |
| `ctx.lod` | 0 full, 1 mid, 2 far — return simpler geometry at higher numbers |

Materials come from the registry so that palette enforcement and instancing batching
actually work. A stream that calls `new THREE.MeshStandardMaterial` directly breaks
both, and the geometry audit will flag it.

---

## Coordinate conventions

- **Ship forward is `+Z`.** Up is `+Y`. Starboard is `+X`.
- The player cruiser and all capital ships are **plane-locked to y = 0**. They yaw,
  they never pitch or roll for control (visual bank on turns is fine and encouraged).
- Strike craft, missiles, debris and celestials are **not** plane-locked and should use
  the vertical volume freely — this is where the sense of scale comes from.
- Hardpoint `yawCentre` is measured in radians from ship forward, counter-clockwise
  looking down. Port sponson is `+π/2`, starboard is `−π/2`, bow is `0`.

---

## Stream ownership

Do not edit files a stream owns unless you own it. If you need a change in someone
else's file, note it in your report.

| Stream | Owns |
|---|---|
| Environment & celestials | `src/world/celestials/**`, `src/world/fields/**` |
| Geometry | `src/art/geometry/**` |
| Materials | `src/art/materials/**`, `src/art/textures/**`, `src/art/palette.js` |
| Lighting & post | `src/render/**`, `src/world/lighting/**` |
| Physics | `src/sim/physics.js`, `src/sim/destruction.js` |
| Combat | `src/sim/combat/**`, `src/sim/power.js` |
| Salvage | `src/sim/salvage/**` |
| World sim & AI | `src/sim/ai/**`, `src/world/poi/**`, `src/world/system.js` |
| Camera & controls | `src/input/**`, `src/camera/**` |
| UI | `src/ui/**` |
| VFX | `src/vfx/**` |
| Audio | `src/audio/**` |
| Performance | `src/render/lod.js`, `src/render/instancing.js`, `tools/bench.mjs` |

Shared foundation (`src/core/**`, `src/game.js`, `tools/harness.mjs`) is owned by
integration. Propose changes; do not make them unilaterally.

---

## Assembly

`src/game.js` is the single seam. A stream exposes one installer:

```js
export function installCombat(world) { /* registers systems on world.engine */ }
```

and integration calls it in `bootGame`. Installers must be **idempotent** and must not
assume ordering beyond what they declare.

Systems register with the engine:

```js
world.engine.add({           // simulation, 60 Hz fixed, respects pause
  name: 'combat',
  order: 40,
  fixedUpdate(dt, engine) { ... },
});

world.engine.addRender({     // per-frame, runs while paused
  name: 'vfx-lerp',
  order: 200,
  update(dt, engine) { ... },
});
```

Order bands, to keep the ordering legible:

| band | phase |
|---|---|
| 0–19 | input, orders |
| 20–39 | AI, world sim |
| 40–59 | combat resolution |
| 60–79 | physics integration |
| 80–99 | salvage, damage, cleanup |
| 100–199 | camera |
| 200–299 | VFX, audio |
| 300–399 | UI |
| 1000 | present (integration owns this) |

---

## Tooling

```
npm run dev        # vite dev server on 5173
npm run smoke      # headless boot check; non-zero exit on any console error
npm run capture    # screenshots every shot in tools/shots.json
npm run bench      # benchmark scene, draw-call and triangle budget enforcement
```

`npm run smoke` must pass before any commit. A console error is a defect.

### The headless renderer is SwiftShader

The review environment has no GPU. Screenshots are correct; **frame rates measured
there are meaningless**. The benchmark reports draw calls, triangle counts, program
counts and CPU frame time, which are hardware-independent, and states plainly that
wall-clock fps on target hardware was not measured here.

---

## Performance rules

- Anything that appears more than ~8 times is an `InstancedMesh`. Debris, asteroids,
  strike craft, running lights, projectiles.
- Particles are GPU-driven: attributes uploaded once, animated in the vertex shader
  from a time uniform. **No CPU particle loops.**
- Every ship class ships three LODs. Modules ship two.
- Nothing per-frame allocates. Pool it.
- Draw-call ceiling is **320** in the benchmark scene. This is committed and enforced.
