# Nadir Point

A single-ship space roguelike RTS, built in **three.js**.

You command one capital ship in a star system where two factions are fighting a war
you are not part of. You are a scavenger. You arrive at battles during or after them,
cut apart the wrecks, fight off whatever is still moving, and bolt the pieces onto
your own hull.

Every upgrade is a physical module on a hardpoint, so the ship you end up with looks
visibly different from the one you started with — and looks like it was assembled out
of other people's ships. Because it was.

```
find a fight  →  survive it  →  strip the dead  →  change your silhouette  →  survive a harder fight
```

---

## Running it

Requires Node 20+.

```bash
npm install
npm run dev
```

Then open <http://127.0.0.1:5173/>.

No assets to download, no external services, no API keys. Every texture, hull, nebula
and sound in the game is generated procedurally at runtime from a seed. A clean clone
plus `npm install` is the whole setup.

### Other commands

| command | what it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the production build |
| `npm run smoke` | headless boot check; non-zero exit on any console error |
| `npm run capture` | screenshot every framing in `tools/shots.json` |
| `npm run bench` | benchmark scene with draw-call and triangle budget enforcement |
| `node tools/probe.mjs <name>` | render and screenshot one subsystem in isolation |

### Probes

`/probe.html?p=<name>` renders a single stream's work on its own — the material set,
the cruiser hull, a POI's lighting, the VFX library. This is how each part of the game
gets looked at without the rest of it needing to exist. `node tools/probe.mjs <name>`
does the same headlessly and writes a PNG.

### Determinism

Everything procedural derives from one seed, so any bug reproduces exactly:

```
http://127.0.0.1:5173/?seed=whatever-you-like
```

`Math.random` is not used anywhere in the codebase.

---

## Reading the code

Start with **[ARCHITECTURE.md](ARCHITECTURE.md)**. It documents the frame structure,
the two-scene rendering strategy, the content registries, coordinate conventions and
the performance rules. It is the contract every part of the codebase codes against.

```
src/
  core/      engine loop, seeded RNG, registries, pooling, world state
  render/    renderer, post-processing chain, LOD
  art/       palettes, material registry, procedural texture generation, geometry
  world/     celestials, points of interest, debris and asteroid fields
  sim/       physics, combat, power routing, salvage, AI
  ui/        tactical overlay, power panel, refit screen, inventory
  vfx/       weapons, engines, shields, explosions, cutting beams
  audio/     procedurally synthesised audio
  probes/    isolation scenes for visual review
tools/       headless harness: smoke, capture, probe, benchmark
docs/        design notes, stream reports, review passes
```

---

## Performance note

The development environment for this project has **no GPU** — headless Chromium runs
ANGLE over SwiftShader. That means:

- Draw calls, triangle counts, shader program counts and CPU frame cost are measured
  and enforced. Those numbers are hardware independent and real.
- **Frame rate was not measured.** `npm run bench` deliberately refuses to print an
  fps pass/fail, because a software-rasteriser number would be meaningless.

Run `npm run bench` on the target machine to validate the 60 fps @ 1440p criterion.
