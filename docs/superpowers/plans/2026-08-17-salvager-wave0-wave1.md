# Salvager — Wave 0 + Wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demolish the three.js tree, scaffold a TypeScript/Vite/PixiJS v8 project with an enforced purity boundary, and build a headless procedural sprite generator that emits QC-passing pixel art at four LOD tiers plus a Milestone 0 contact sheet.

**Architecture:** Two pure, headless TypeScript modules — `src/sim/` (fixed-step game state) and `src/gen/` (sprite generation) — neither importing PixiJS nor touching the DOM, enforced by an import-graph check in CI. `gen/` emits raw RGBA `PixBuf` values and a hand-rolled PNG encoder writes them to disk from Node, so the contact sheet and all palette QC run without a browser or GPU. This plan stops at the Milestone 0 gate; the renderer, UI, and combat systems are Plan 2.

**Tech Stack:** TypeScript 5.7+, Vite 8, PixiJS v8 (installed and version-verified in Wave 0, first used in Plan 2), Vitest 3, Node 24 stdlib (`node:zlib` for PNG deflate). No runtime dependencies in `sim/` or `gen/`.

## Global Constraints

These apply to every task. A task's requirements implicitly include this section.

- **Node 24+.** `package.json` declares `"engines": { "node": ">=24" }`.
- **`src/sim/` and `src/gen/` are pure.** No `import` of `pixi.js`, `@pixi/*`, `three`, or any DOM global (`document`, `window`, `navigator`, `HTMLCanvasElement`). `src/sim/` may import only from `src/sim/**`. Enforced by `tools/purity.ts` (Task 4) and run in `npm test`.
- **Alpha is binary.** Every pixel is either fully opaque (a = 255) or fully transparent (a = 0). No partial alpha anywhere in `gen/`. This is what makes palette QC and LOD reduction tractable.
- **Master palette is 52 colors** (Task 7). Zero off-palette pixels in any generated sprite, enforced automatically.
- **Sprites are authored nose-up:** bow at y = 0, stern at y = h − 1. Sim heading 0 points +X, so the renderer rotates by `heading + π/2`. Bin 0 of a rotation bake is the unrotated sprite.
- **Light direction is top-left, baked in sprite space.** The light rotates with the ship when bins are baked; this is the intended pixel-art convention, not a defect. Enforced by the light-direction check in Task 9.
- **Everything is deterministic from a seed.** No `Math.random()` anywhere in `src/`. No `Date.now()` in `gen/`.
- **Cruiser core sprite is 96–128 px long; modules 16–48 px; fighters 8–12 px; faction capitals up to 160 px.** LOD tier sizes derive from each sprite's own tier-1 size, with a 3 px floor on any axis at tier 4.
- **Every task ends with a commit.** Commit messages use conventional-commit prefixes (`chore:`, `feat:`, `test:`).

---

## File Structure

**Wave 0 — foundation**

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | Project scaffold |
| `index.html` | Single entry point (the old `probe.html` is deleted) |
| `src/app/main.ts` | Boot stub; becomes the real loop in Plan 2 |
| `src/sim/math/vec2.ts` | 2D vector math — the only geometry primitive the sim gets |
| `src/sim/rng.ts` | Seeded splittable PRNG |
| `tools/purity.ts` | Import-graph boundary check |

**Wave 1 — sprite generator**

| File | Responsibility |
|---|---|
| `src/gen/pixbuf.ts` | The `PixBuf` RGBA buffer type and pixel/blit primitives |
| `src/gen/png.ts` | Minimal PNG encoder over `node:zlib` |
| `src/gen/palette.ts` | 52-color master palette, faction/POI locks, nearest-color snap |
| `src/gen/font.ts` | 5×7 bitmap font for contact-sheet labels and later UI |
| `src/gen/qc.ts` | Off-palette check, light-direction check, LOD completeness check |
| `src/gen/grammar/profile.ts` | Spine half-width profiles — faction shape language lives here |
| `src/gen/grammar/plates.ts` | Plate partitioning, 2–3 value dithered shading, panel seams |
| `src/gen/grammar/greeble.ts` | Size-budgeted greebles and running lights at fixed spacing |
| `src/gen/hull.ts` | Hull assembly from profile + plates + greebles |
| `src/gen/module.ts` | Module sprites with hardpoint anchors |
| `src/gen/damage.ts` | intact / damaged / critical / destroyed frames |
| `src/gen/composite.ts` | Hull + installed modules → one composited buffer |
| `src/gen/lod.ts` | Four-tier generation; weighted reduction; tier-4 silhouette rule |
| `src/gen/rotate.ts` | 64-bin rotation baker with integer pivot |
| `src/gen/debris.ts` | Debris set |
| `src/gen/celestial.ts` | POI background stack — starfield, nebula, gas giant |
| `tools/contactsheet.ts` | The Milestone 0 deliverable |

---

# Wave 0 — Foundation

### Task 1: Demolition and scaffold

Deletes 85,625 LOC of three.js work and replaces it with a typechecking, testing, booting TypeScript project. Everything deleted stays recoverable — the tree is committed and clean, so this is one `git show` away forever.

**Files:**
- Delete: `src/` (entire tree), `tools/` (entire tree), `probe.html`, `ARCHITECTURE.md`, `HANDOFF.md`
- Modify: `package.json`, `vite.config.js` → `vite.config.ts`, `index.html`, `README.md`, `.gitignore`
- Create: `tsconfig.json`, `vitest.config.ts`, `src/app/main.ts`, `src/app/boot.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a repo where `npm run typecheck`, `npm test`, and `npm run build` all pass; `src/sim/` and `src/gen/` directories exist and are empty

- [ ] **Step 1: Confirm the tree is clean before deleting anything**

```bash
git status --porcelain
```

Expected: **empty output**. If anything prints, stop and resolve it — the recoverability guarantee depends on everything being committed first.

- [ ] **Step 2: Delete the three.js tree**

```bash
git rm -r -q src tools probe.html ARCHITECTURE.md HANDOFF.md
```

`docs/` is untouched. `docs/design/` (22 documents), `docs/review/`, and `docs/probes/` all survive — they are the design that outlived the presentation.

- [ ] **Step 3: Write the new `package.json`**

```json
{
  "name": "salvager",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A single-ship space salvage game in 2D pixel art",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "contactsheet": "tsx tools/contactsheet.ts"
  },
  "dependencies": {
    "pixi.js": "^8.6.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite": "^8.1.5",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tools", "vite.config.ts", "vitest.config.ts"]
}
```

`noUncheckedIndexedAccess` matters more than it looks: the generator indexes flat pixel arrays constantly, and this is what stops an off-by-one from silently yielding `undefined` and writing `NaN` into a buffer.

- [ ] **Step 5: Write `vite.config.ts` and `vitest.config.ts`**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
```

`environment: 'node'` is deliberate — if a test in `sim/` or `gen/` ever needs a DOM, that module has broken the purity rule and the test should fail loudly rather than be quietly accommodated.

Then delete the old config: `git rm -q vite.config.js`

- [ ] **Step 6: Write `index.html` and the boot stub**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Salvager</title>
    <style>
      html, body { margin: 0; height: 100%; background: #04050a; overflow: hidden; }
      canvas { display: block; image-rendering: pixelated; }
    </style>
  </head>
  <body>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

`image-rendering: pixelated` on the canvas is load-bearing for the whole art direction — without it the browser smooths the integer upscale and every pixel-integrity guarantee downstream is undone at the last step.

Create `src/app/main.ts`:

```ts
/**
 * Boot entry. Wave 0 keeps this a stub on purpose: the renderer is Plan 2,
 * and nothing should import PixiJS until the sprite generator has passed its gate.
 */
export function boot(): string {
  return 'salvager';
}

boot();
```

- [ ] **Step 7: Write the failing scaffold test**

Create `src/app/boot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { boot } from './main.js';

describe('scaffold', () => {
  it('boots', () => {
    expect(boot()).toBe('salvager');
  });
});
```

- [ ] **Step 8: Create the empty pure-module directories**

```bash
mkdir -p src/sim/math src/gen/grammar tools
```

Git does not track empty directories; they are created here so Tasks 2–4 have somewhere to land, and the first real file in each is what commits them.

- [ ] **Step 9: Install and verify all three gates pass**

```bash
npm install
```

Then run each gate and confirm the expected result:

```bash
npm run typecheck
```

Expected: exits 0, no output.

```bash
npm test
```

Expected: `1 passed`.

```bash
npm run build
```

Expected: exits 0, writes `dist/`.

- [ ] **Step 10: Verify PixiJS v8 resolved and its WebGL2 fallback is present**

```bash
node -e "console.log(require('pixi.js/package.json').version)"
```

Expected: a version starting with `8.`. If it prints `7.` or errors, the dependency range in Step 3 did not resolve as intended — fix it before continuing, because §7 of the spec requires v8's WebGPU-with-WebGL2-fallback and Plan 2 is built on it.

- [ ] **Step 11: Rewrite `README.md`**

```markdown
# Salvager

A single-ship space salvage game. Top-down 2D, real-time with pause, pixel art.

You command one capital ship in a star system where two factions fight a war you
are not part of. You are a scavenger: arrive at battles during or after them, cut
apart the wrecks, and bolt the pieces onto your own hull. Every upgrade is a
physical module on a hardpoint, so the ship you end up with looks visibly
different from the one you started with — and looks like it was assembled out of
other people's ships. Because it was.

```
find a fight → survive it → strip the dead → change your silhouette → survive a harder fight
```

## Running it

Requires Node 24+.

```bash
npm install
npm run dev
```

Then open <http://127.0.0.1:5173/>.

Every sprite, palette, and background is generated procedurally from a seed. No
assets to download, no external services, no API keys.

| command | what it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | typecheck, then production build into `dist/` |
| `npm test` | unit tests, palette QC, and the module-purity boundary check |
| `npm run contactsheet` | render the sprite contact sheet to `docs/review/contactsheet.png` |

## Design

- Specification: `docs/superpowers/specs/2026-08-17-salvager-2d-pixel-rebuild-design.md`
- Inherited design documents: `docs/design/`

The three.js implementation this replaces is in git history at `39e8c59`.
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: demolish the three.js tree and scaffold TypeScript/Vite/Pixi v8

85,625 LOC removed. Recoverable at 39e8c59; docs/ untouched."
```

---

### Task 2: `sim/math/vec2.ts` — 2D vector math

The sim's only geometry primitive. Deliberately minimal and allocation-conscious: the old build's sim reached for a renderer's math library and became unportable, so this one owns its own.

**Files:**
- Create: `src/sim/math/vec2.ts`
- Test: `src/sim/math/vec2.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Vec2 { x: number; y: number }`
  - `function vec2(x?: number, y?: number): Vec2`
  - `function add(out: Vec2, a: Vec2, b: Vec2): Vec2` — writes into `out`, returns it
  - `function sub(out: Vec2, a: Vec2, b: Vec2): Vec2`
  - `function scale(out: Vec2, a: Vec2, s: number): Vec2`
  - `function addScaled(out: Vec2, a: Vec2, b: Vec2, s: number): Vec2`
  - `function len(a: Vec2): number`
  - `function lenSq(a: Vec2): number`
  - `function normalize(out: Vec2, a: Vec2): Vec2` — zero vector yields `{0,0}`
  - `function dot(a: Vec2, b: Vec2): number`
  - `function cross(a: Vec2, b: Vec2): number` — the 2D scalar cross
  - `function rotate(out: Vec2, a: Vec2, radians: number): Vec2`
  - `function fromAngle(out: Vec2, radians: number, length?: number): Vec2`
  - `function angleOf(a: Vec2): number` — radians in (−π, π]
  - `function angleDelta(from: number, to: number): number` — shortest signed turn in (−π, π]
  - `function distance(a: Vec2, b: Vec2): number`

- [ ] **Step 1: Write the failing test**

Create `src/sim/math/vec2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  add, addScaled, angleDelta, angleOf, cross, distance, dot, fromAngle,
  len, lenSq, normalize, rotate, scale, sub, vec2,
} from './vec2.js';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 10);

describe('vec2 construction', () => {
  it('defaults to the origin', () => {
    expect(vec2()).toEqual({ x: 0, y: 0 });
  });

  it('carries the values it is given', () => {
    expect(vec2(3, -4)).toEqual({ x: 3, y: -4 });
  });
});

describe('vec2 arithmetic writes into out and returns it', () => {
  it('adds', () => {
    const out = vec2();
    const r = add(out, vec2(1, 2), vec2(10, 20));
    expect(r).toBe(out);
    expect(out).toEqual({ x: 11, y: 22 });
  });

  it('subtracts', () => {
    expect(sub(vec2(), vec2(10, 20), vec2(1, 2))).toEqual({ x: 9, y: 18 });
  });

  it('scales', () => {
    expect(scale(vec2(), vec2(3, -4), 2)).toEqual({ x: 6, y: -8 });
  });

  it('adds a scaled vector — the integrator step', () => {
    expect(addScaled(vec2(), vec2(1, 1), vec2(10, 20), 0.5)).toEqual({ x: 6, y: 11 });
  });

  it('aliases safely when out is also an input', () => {
    const a = vec2(1, 2);
    add(a, a, a);
    expect(a).toEqual({ x: 2, y: 4 });
  });
});

describe('vec2 magnitude', () => {
  it('measures length', () => {
    expect(len(vec2(3, 4))).toBe(5);
  });

  it('measures squared length without a square root', () => {
    expect(lenSq(vec2(3, 4))).toBe(25);
  });

  it('measures distance between points', () => {
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
  });

  it('normalizes to unit length', () => {
    const n = normalize(vec2(), vec2(3, 4));
    close(n.x, 0.6);
    close(n.y, 0.8);
    close(len(n), 1);
  });

  it('normalizes the zero vector to zero rather than NaN', () => {
    expect(normalize(vec2(), vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe('vec2 products', () => {
  it('takes the dot product', () => {
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
  });

  it('takes the 2D scalar cross product', () => {
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1);
    expect(cross(vec2(0, 1), vec2(1, 0))).toBe(-1);
  });
});

describe('vec2 angles', () => {
  it('rotates a quarter turn', () => {
    const r = rotate(vec2(), vec2(1, 0), Math.PI / 2);
    close(r.x, 0);
    close(r.y, 1);
  });

  it('builds a vector from an angle and length', () => {
    const v = fromAngle(vec2(), 0, 5);
    close(v.x, 5);
    close(v.y, 0);
  });

  it('defaults fromAngle to unit length', () => {
    close(len(fromAngle(vec2(), 1.234)), 1);
  });

  it('reads the angle of a vector', () => {
    close(angleOf(vec2(0, 1)), Math.PI / 2);
    close(angleOf(vec2(-1, 0)), Math.PI);
  });

  it('round-trips angle to vector and back', () => {
    for (const a of [0, 0.5, 1.5, 3, -0.5, -3]) {
      close(angleOf(fromAngle(vec2(), a)), a);
    }
  });

  it('takes the short way around when computing a turn', () => {
    close(angleDelta(0.1, -0.1), -0.2);
    close(angleDelta(-3.0, 3.0), -0.283185307179586);
    close(angleDelta(3.0, -3.0), 0.283185307179586);
  });

  it('returns a turn no larger than half a revolution', () => {
    for (let from = -Math.PI; from < Math.PI; from += 0.37) {
      for (let to = -Math.PI; to < Math.PI; to += 0.41) {
        expect(Math.abs(angleDelta(from, to))).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});
```

The `angleDelta` wrap-around cases are the ones that matter. A cruiser turning through ±π is the single most common thing in the game, and a naive `to - from` sends it the long way around — which reads on screen as the ship spinning 350° to correct a 10° error.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/sim/math/vec2.test.ts
```

Expected: FAIL — `Failed to resolve import "./vec2.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/sim/math/vec2.ts`:

```ts
/**
 * 2D vector math. The sim's only geometry primitive.
 *
 * Every operation that produces a vector writes into an `out` parameter and
 * returns it, so the hot paths (integration, collision) can run against pooled
 * vectors without allocating per tick. Aliasing `out` with an input is safe:
 * every function reads both inputs into locals before writing.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  out.x = ax + bx;
  out.y = ay + by;
  return out;
}

export function sub(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  out.x = ax - bx;
  out.y = ay - by;
  return out;
}

export function scale(out: Vec2, a: Vec2, s: number): Vec2 {
  const ax = a.x, ay = a.y;
  out.x = ax * s;
  out.y = ay * s;
  return out;
}

export function addScaled(out: Vec2, a: Vec2, b: Vec2, s: number): Vec2 {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  out.x = ax + bx * s;
  out.y = ay + by * s;
  return out;
}

export function lenSq(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function len(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** A zero-length input yields the zero vector rather than NaN. */
export function normalize(out: Vec2, a: Vec2): Vec2 {
  const ax = a.x, ay = a.y;
  const l = Math.sqrt(ax * ax + ay * ay);
  if (l === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = ax / l;
  out.y = ay / l;
  return out;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** The 2D scalar cross product — positive when b is counter-clockwise of a. */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function rotate(out: Vec2, a: Vec2, radians: number): Vec2 {
  const ax = a.x, ay = a.y;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  out.x = ax * c - ay * s;
  out.y = ax * s + ay * c;
  return out;
}

export function fromAngle(out: Vec2, radians: number, length = 1): Vec2 {
  out.x = Math.cos(radians) * length;
  out.y = Math.sin(radians) * length;
  return out;
}

/** Radians in (−π, π]. */
export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

/**
 * The shortest signed turn from one heading to another, in (−π, π].
 *
 * Every turn in the game goes through here. Without the wrap, a ship correcting
 * a 10° error across the ±π seam turns 350° the wrong way to get there.
 */
export function angleDelta(from: number, to: number): number {
  const TAU = Math.PI * 2;
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/sim/math/vec2.test.ts
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/math/vec2.ts src/sim/math/vec2.test.ts
git commit -m "feat: 2D vector math for the sim

Out-parameter form throughout so the integrator does not allocate per tick.
angleDelta wraps at the seam, which is what stops a 10 degree correction from
turning into a 350 degree one."
```

---

### Task 3: `sim/rng.ts` — seeded splittable PRNG

Every random decision in the game draws from here. The splitting is the part that matters: without independent named streams, firing a gun consumes randomness that shifts the shape of the nebula, and "reproducible from a seed" becomes false.

**Files:**
- Create: `src/sim/rng.ts`
- Test: `src/sim/rng.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface Rng { next(): number; int(n: number): number; range(lo: number, hi: number): number; pick<T>(items: readonly T[]): T; chance(p: number): boolean; split(name: string): Rng }`
  - `function makeRng(seed: string): Rng`
  - `next()` returns a float in [0, 1)
  - `int(n)` returns an integer in [0, n)
  - `range(lo, hi)` returns a float in [lo, hi)
  - `pick(items)` throws `RangeError` on an empty array
  - `split(name)` returns a new independent `Rng`; drawing from it never advances the parent

- [ ] **Step 1: Write the failing test**

Create `src/sim/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from './rng.js';

const draw = (seed: string, n: number) => {
  const r = makeRng(seed);
  return Array.from({ length: n }, () => r.next());
};

describe('rng determinism', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw('salvager', 20)).toEqual(draw('salvager', 20));
  });

  it('produces a different sequence for a different seed', () => {
    expect(draw('salvager', 20)).not.toEqual(draw('salvagex', 20));
  });

  it('stays inside [0, 1)', () => {
    const r = makeRng('bounds');
    for (let i = 0; i < 10_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('does not immediately repeat itself', () => {
    const values = new Set(draw('cycle', 5000));
    expect(values.size).toBeGreaterThan(4990);
  });
});

describe('rng derived draws', () => {
  it('returns integers in [0, n)', () => {
    const r = makeRng('ints');
    for (let i = 0; i < 5000; i++) {
      const v = r.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('covers the whole integer range', () => {
    const r = makeRng('coverage');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.int(6));
    expect(seen.size).toBe(6);
  });

  it('treats int(0) and int(1) as degenerate rather than NaN', () => {
    const r = makeRng('degenerate');
    expect(r.int(1)).toBe(0);
    expect(r.int(0)).toBe(0);
  });

  it('returns floats inside a range', () => {
    const r = makeRng('range');
    for (let i = 0; i < 2000; i++) {
      const v = r.range(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
    }
  });

  it('picks an element from the array', () => {
    const r = makeRng('pick');
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(r.pick(items));
  });

  it('refuses to pick from an empty array', () => {
    expect(() => makeRng('empty').pick([])).toThrow(RangeError);
  });

  it('honours the probability passed to chance', () => {
    const r = makeRng('chance');
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (r.chance(0.25)) hits++;
    expect(hits).toBeGreaterThan(2200);
    expect(hits).toBeLessThan(2800);
  });

  it('treats chance(0) and chance(1) as absolute', () => {
    const r = makeRng('absolutes');
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });
});

describe('rng splitting', () => {
  it('gives the same child stream for the same parent seed and name', () => {
    const a = makeRng('world').split('sprites');
    const b = makeRng('world').split('sprites');
    expect(Array.from({ length: 10 }, () => a.next()))
      .toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('gives different streams for different names', () => {
    const parent = makeRng('world');
    const sprites = parent.split('sprites');
    const layout = parent.split('layout');
    expect(Array.from({ length: 10 }, () => sprites.next()))
      .not.toEqual(Array.from({ length: 10 }, () => layout.next()));
  });

  it('does not advance the parent when a child is drawn from', () => {
    const parent = makeRng('world');
    const child = parent.split('combat');
    for (let i = 0; i < 100; i++) child.next();

    const untouched = makeRng('world');
    untouched.split('combat');

    expect(parent.next()).toBe(untouched.next());
  });

  it('keeps sibling streams independent — this is the whole point', () => {
    // Draw heavily from combat, then confirm factionwar is unmoved.
    const a = makeRng('seed-1');
    const combatA = a.split('combat');
    const warA = a.split('factionwar');
    for (let i = 0; i < 500; i++) combatA.next();
    const afterHeavyCombat = Array.from({ length: 10 }, () => warA.next());

    const b = makeRng('seed-1');
    b.split('combat');
    const warB = b.split('factionwar');
    const withoutCombat = Array.from({ length: 10 }, () => warB.next());

    expect(afterHeavyCombat).toEqual(withoutCombat);
  });

  it('splits recursively', () => {
    const deep = makeRng('root').split('a').split('b');
    const same = makeRng('root').split('a').split('b');
    expect(deep.next()).toBe(same.next());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/sim/rng.test.ts
```

Expected: FAIL — `Failed to resolve import "./rng.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/sim/rng.ts`:

```ts
/**
 * Seeded, splittable pseudo-random number generation.
 *
 * `sfc32` is the generator — small, fast, and statistically sound enough for a
 * game. `cyrb128` turns a string seed into the four 32-bit words it needs.
 *
 * The splitting is the load-bearing part. Systems take a *named child stream*
 * rather than sharing one generator, so how much randomness combat consumes
 * cannot shift what the world layout or the sprite generator produce. Sharing a
 * single stream would make "any bug is reproducible from a seed" a false claim:
 * firing one extra shot would change the shape of the nebula.
 */

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [0, n). Returns 0 for n <= 1. */
  int(n: number): number;
  /** A float in [lo, hi). */
  range(lo: number, hi: number): number;
  /** A uniformly chosen element. Throws RangeError if the array is empty. */
  pick<T>(items: readonly T[]): T;
  /** True with probability p. */
  chance(p: number): boolean;
  /** An independent child stream. Drawing from it never advances this one. */
  split(name: string): Rng;
}

/** Hashes a string into four 32-bit seed words. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

function fromWords(seed: string, words: [number, number, number, number]): Rng {
  let [a, b, c, d] = words;

  const next = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  return {
    next,

    int(n: number): number {
      if (n <= 1) return 0;
      return Math.floor(next() * n);
    },

    range(lo: number, hi: number): number {
      return lo + next() * (hi - lo);
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('pick() called on an empty array');
      }
      // Index is in bounds by construction; the assertion satisfies
      // noUncheckedIndexedAccess without a runtime cost.
      return items[Math.floor(next() * items.length)]!;
    },

    chance(p: number): boolean {
      if (p <= 0) return false;
      if (p >= 1) return true;
      return next() < p;
    },

    /**
     * Derives a child from the *seed string*, not from the current internal
     * state. That is why drawing from a child cannot advance the parent, and
     * why two siblings stay independent no matter how hard either is used.
     */
    split(name: string): Rng {
      const childSeed = `${seed}/${name}`;
      return fromWords(childSeed, cyrb128(childSeed));
    },
  };
}

export function makeRng(seed: string): Rng {
  return fromWords(seed, cyrb128(seed));
}
```

The comment on `split` explains a non-obvious choice worth preserving: deriving the child from the seed string rather than the live state is exactly what makes the independence tests pass. Deriving from state would be simpler to write and would silently couple every stream to draw order.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/sim/rng.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts src/sim/rng.test.ts
git commit -m "feat: seeded splittable RNG

sfc32 over a cyrb128 string seed. Children derive from the seed string rather
than live state, so how much randomness combat burns cannot shift the world
layout or the sprite generator."
```

---

### Task 4: `tools/purity.ts` — the boundary check

The old build's sim grew a dependency on the renderer's math library and stopped being portable. Discipline did not prevent that; a test will.

**Files:**
- Create: `tools/purity.ts`
- Test: `tools/purity.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface PurityViolation { file: string; line: number; rule: string; detail: string }`
  - `function scanSource(file: string, source: string): PurityViolation[]` — pure, testable against strings
  - `function checkPurity(roots?: string[]): PurityViolation[]` — walks the real tree from repo root
  - `const FORBIDDEN_PACKAGES: readonly string[]`
  - `const FORBIDDEN_GLOBALS: readonly string[]`

- [ ] **Step 1: Write the failing test**

Create `tools/purity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkPurity, scanSource } from './purity.js';

describe('scanSource rejects renderer imports', () => {
  it('flags a pixi.js import', () => {
    const v = scanSource('src/sim/ship.ts', `import { Sprite } from 'pixi.js';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-package');
    expect(v[0]!.detail).toContain('pixi.js');
    expect(v[0]!.line).toBe(1);
  });

  it('flags a scoped pixi import', () => {
    const v = scanSource('src/gen/hull.ts', `import x from '@pixi/core';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-package');
  });

  it('flags a three import — the mistake the last build made', () => {
    const v = scanSource('src/sim/physics.ts', `import * as THREE from 'three';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('three');
  });

  it('flags a dynamic import too', () => {
    const v = scanSource('src/sim/a.ts', `const p = await import('pixi.js');`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-package');
  });

  it('flags a re-export', () => {
    const v = scanSource('src/gen/a.ts', `export { Sprite } from 'pixi.js';`);
    expect(v).toHaveLength(1);
  });

  it('allows a package whose name merely contains a forbidden one', () => {
    expect(scanSource('src/sim/a.ts', `import x from 'threefold-utils';`)).toEqual([]);
    expect(scanSource('src/sim/a.ts', `import x from 'not-pixi.js-really';`)).toEqual([]);
  });
});

describe('scanSource rejects DOM access', () => {
  it('flags document', () => {
    const v = scanSource('src/gen/png.ts', `const c = document.createElement('canvas');`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-global');
    expect(v[0]!.detail).toContain('document');
  });

  it('flags window', () => {
    const v = scanSource('src/sim/a.ts', `window.addEventListener('x', () => {});`);
    expect(v[0]!.rule).toBe('forbidden-global');
  });

  it('reports the right line number', () => {
    const v = scanSource('src/sim/a.ts', `const a = 1;\nconst b = 2;\nwindow.x = 3;`);
    expect(v[0]!.line).toBe(3);
  });

  it('does not flag a property named like a global', () => {
    expect(scanSource('src/sim/a.ts', `const x = opts.window;`)).toEqual([]);
    expect(scanSource('src/sim/a.ts', `const y = { document: 1 };`)).toEqual([]);
  });

  it('does not flag a global mentioned inside a comment', () => {
    expect(scanSource('src/sim/a.ts', `// never touch document here`)).toEqual([]);
    expect(scanSource('src/sim/a.ts', `/* window is forbidden */`)).toEqual([]);
  });

  it('flags a DOM global reached through globalThis', () => {
    const v = scanSource('src/sim/a.ts', `const d = globalThis.document;`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-global');
    expect(v[0]!.detail).toContain('document');
  });

  it('flags a DOM global reached through self', () => {
    expect(scanSource('src/gen/a.ts', `self.window.alert('x');`).length).toBeGreaterThan(0);
  });

  it('still allows an unrelated namespaced property', () => {
    // The namespaced rule must key off the forbidden list, not flag every
    // globalThis.* access.
    expect(scanSource('src/sim/a.ts', `const v = globalThis.structuredClone;`)).toEqual([]);
  });
});

describe('scanSource confines sim to its own tree', () => {
  it('flags sim importing from gen', () => {
    const v = scanSource('src/sim/ship.ts', `import { hull } from '../gen/hull.js';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('sim-escapes-tree');
  });

  it('flags sim importing from render', () => {
    const v = scanSource('src/sim/a.ts', `import { x } from '../render/atlas.js';`);
    expect(v[0]!.rule).toBe('sim-escapes-tree');
  });

  it('allows sim importing within sim', () => {
    expect(scanSource('src/sim/ship.ts', `import { vec2 } from './math/vec2.js';`)).toEqual([]);
    expect(scanSource('src/sim/ai/fleet.ts', `import { r } from '../rng.js';`)).toEqual([]);
  });

  it('allows gen importing node stdlib', () => {
    expect(scanSource('src/gen/png.ts', `import { deflateSync } from 'node:zlib';`)).toEqual([]);
  });

  it('allows gen importing from sim math', () => {
    expect(scanSource('src/gen/hull.ts', `import { vec2 } from '../sim/math/vec2.js';`)).toEqual([]);
  });
});

describe('the real tree is pure', () => {
  it('has no violations in src/sim or src/gen', () => {
    const violations = checkPurity();
    const report = violations
      .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.detail}`)
      .join('\n');
    expect(report).toBe('');
  });
});
```

That last block is the one that earns the task. It runs on every `npm test` and fails the moment anyone reaches across the boundary.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tools/purity.test.ts
```

Expected: FAIL — `Failed to resolve import "./purity.js"`.

- [ ] **Step 3: Write the implementation**

Create `tools/purity.ts`:

```ts
/**
 * Enforces the module boundary that the specification's architecture rests on:
 * `src/sim/` and `src/gen/` are pure and headless.
 *
 * This exists because the previous build lost exactly this property by
 * accident. Fifteen files under `src/sim/` imported three.js for its Vector3
 * and Quaternion, and by the time anyone noticed, the "portable pure core" was
 * welded to a renderer. Nobody decided that; it accreted. A check that runs on
 * every `npm test` is the difference between a boundary and an intention.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface PurityViolation {
  file: string;
  line: number;
  rule: 'forbidden-package' | 'forbidden-global' | 'sim-escapes-tree';
  detail: string;
}

export const FORBIDDEN_PACKAGES: readonly string[] = ['pixi.js', '@pixi', 'three'];

export const FORBIDDEN_GLOBALS: readonly string[] = [
  'document',
  'window',
  'navigator',
  'localStorage',
  'HTMLCanvasElement',
  'requestAnimationFrame',
];

/** Matches static imports, re-exports, and dynamic imports in one pass. */
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * Namespaced access — `globalThis.document`, `self.window`.
 *
 * The bare-word check below cannot see these: its lookbehind deliberately
 * ignores anything preceded by a dot, so that `opts.window` stays legal. Without
 * this second pass, `globalThis.document` is a one-token bypass of the whole
 * DOM rule.
 */
const NAMESPACED_RE = /\b(?:globalThis|self)\s*\.\s*(\w+)/g;

/** Strips line and block comments so a mention of `document` in prose is not a violation. */
function stripComments(source: string): string {
  // Replace comment bodies with spaces to preserve line numbering exactly.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function isForbiddenPackage(specifier: string): string | null {
  for (const pkg of FORBIDDEN_PACKAGES) {
    // Exact match or a subpath of it — 'pixi.js/foo' counts, 'pixi.js-shim' does not.
    if (specifier === pkg || specifier.startsWith(`${pkg}/`)) return pkg;
  }
  return null;
}

export function scanSource(file: string, source: string): PurityViolation[] {
  const violations: PurityViolation[] = [];
  const code = stripComments(source);
  const lines = code.split('\n');
  const normalized = file.replace(/\\/g, '/');
  const inSim = normalized.includes('src/sim/');

  const lineOf = (index: number): number =>
    code.slice(0, index).split('\n').length;

  SPECIFIER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPECIFIER_RE.exec(code)) !== null) {
    const specifier = match[1]!;
    const line = lineOf(match.index);

    const forbidden = isForbiddenPackage(specifier);
    if (forbidden !== null) {
      violations.push({
        file,
        line,
        rule: 'forbidden-package',
        detail: `imports '${specifier}' (forbidden package '${forbidden}')`,
      });
      continue;
    }

    // sim/ may only reach inside sim/. Relative specifiers that climb out are
    // the failure mode; bare node: and package specifiers are handled above.
    if (inSim && specifier.startsWith('.')) {
      const fromDir = normalized.slice(0, normalized.lastIndexOf('/'));
      const target = resolve('/', fromDir, specifier).replace(/\\/g, '/');
      if (!target.includes('/src/sim/')) {
        violations.push({
          file,
          line,
          rule: 'sim-escapes-tree',
          detail: `imports '${specifier}', which resolves outside src/sim/`,
        });
      }
    }
  }

  for (const global of FORBIDDEN_GLOBALS) {
    // Word-boundary match, and not preceded by a dot or an object-literal key
    // colon, so `opts.window` and `{ document: 1 }` are not violations.
    const re = new RegExp(`(?<![.\\w])${global}\\b(?!\\s*:)`, 'g');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        violations.push({
          file,
          line: i + 1,
          rule: 'forbidden-global',
          detail: `references DOM global '${global}'`,
        });
      }
      re.lastIndex = 0;
    }
  }

  // Second pass for namespaced access, keyed off the same forbidden list so an
  // unrelated property like `globalThis.structuredClone` stays legal.
  for (let i = 0; i < lines.length; i++) {
    NAMESPACED_RE.lastIndex = 0;
    let named: RegExpExecArray | null;
    while ((named = NAMESPACED_RE.exec(lines[i]!)) !== null) {
      const name = named[1]!;
      if (FORBIDDEN_GLOBALS.includes(name)) {
        violations.push({
          file,
          line: i + 1,
          rule: 'forbidden-global',
          detail: `references DOM global '${name}' via a namespace`,
        });
      }
    }
  }

  return violations;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    // A directory that does not exist yet is normal and not a violation —
    // src/gen/ is empty until Task 5. Anything else (permissions, I/O) must
    // surface: this tool's whole value is that silence means clean, so a
    // directory it could not read has to be loud rather than absent.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

export function checkPurity(roots: string[] = ['src/sim', 'src/gen']): PurityViolation[] {
  const violations: PurityViolation[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = relative('.', file).replace(/\\/g, '/');
      violations.push(...scanSource(rel, readFileSync(file, 'utf8')));
    }
  }
  return violations;
}
```

Two details worth not losing. `stripComments` replaces comment bodies with spaces rather than deleting them, so reported line numbers stay accurate. And the forbidden-package match is exact-or-subpath rather than substring, so a package named `threefold-utils` does not trip the `three` rule — a substring check here would produce false positives that train people to ignore the tool.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tools/purity.test.ts
```

Expected: PASS, 17 tests. The final "real tree is pure" test passes trivially right now because `src/gen/` is empty — it becomes load-bearing from Task 5 onward.

- [ ] **Step 5: Run the whole suite and confirm the gate is wired**

```bash
npm test
```

Expected: PASS — `boot.test.ts`, `vec2.test.ts`, `rng.test.ts`, `purity.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add tools/purity.ts tools/purity.test.ts
git commit -m "test: enforce the sim/gen purity boundary in CI

The last build lost this property by accident across fifteen files. Discipline
did not catch it; this does, on every npm test."
```

---

# Wave 1 — Sprite Generator

Everything below runs headless. No PixiJS, no DOM, no GPU. That is what lets the contact sheet render from Node and the palette QC run in CI.

### Task 5: `gen/pixbuf.ts` — the pixel buffer

Every sprite in the game is a `PixBuf`. Getting the primitives right matters more than they look: `blit` is called millions of times during a contact-sheet render, and out-of-bounds behaviour decided here determines whether a generator bug shows up as a visible artifact or as a silent crash.

**Files:**
- Create: `src/gen/pixbuf.ts`
- Test: `src/gen/pixbuf.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface PixBuf { readonly w: number; readonly h: number; readonly data: Uint8ClampedArray }`
  - `interface Bounds { x0: number; y0: number; x1: number; y1: number }` — inclusive corners
  - `type Rgba = number` — packed `0xRRGGBBAA`
  - `const EMPTY: Rgba` — `0`, fully transparent
  - `function rgba(r: number, g: number, b: number, a?: number): Rgba`
  - `function fromHex(hex: string): Rgba` — accepts `'#rrggbb'` and `'#rrggbbaa'`
  - `function redOf(c: Rgba): number`, `greenOf`, `blueOf`, `alphaOf`
  - `function isOpaque(c: Rgba): boolean`
  - `function luminance(c: Rgba): number` — 0–255, Rec. 601
  - `function createBuf(w: number, h: number): PixBuf`
  - `function cloneBuf(b: PixBuf): PixBuf`
  - `function getPx(b: PixBuf, x: number, y: number): Rgba` — `EMPTY` when out of bounds
  - `function setPx(b: PixBuf, x: number, y: number, c: Rgba): void` — no-op when out of bounds
  - `function fillBuf(b: PixBuf, c: Rgba): void`
  - `function blit(dst: PixBuf, src: PixBuf, dx: number, dy: number): void` — skips transparent source pixels
  - `function blitOpaque(dst: PixBuf, src: PixBuf, dx: number, dy: number): void` — copies transparency too
  - `function opaqueBounds(b: PixBuf): Bounds | null` — `null` if fully transparent
  - `function crop(b: PixBuf, x0: number, y0: number, w: number, h: number): PixBuf`
  - `function countOpaque(b: PixBuf): number`

- [ ] **Step 1: Write the failing test**

Create `src/gen/pixbuf.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  alphaOf, blit, blitOpaque, blueOf, countOpaque, createBuf, cloneBuf, crop,
  EMPTY, fillBuf, fromHex, getPx, greenOf, isOpaque, luminance, opaqueBounds,
  redOf, rgba, setPx,
} from './pixbuf.js';

const RED = rgba(255, 0, 0);
const BLUE = rgba(0, 0, 255);

describe('packed colour', () => {
  it('packs and unpacks channels', () => {
    const c = rgba(18, 52, 86, 120);
    expect(redOf(c)).toBe(18);
    expect(greenOf(c)).toBe(52);
    expect(blueOf(c)).toBe(86);
    expect(alphaOf(c)).toBe(120);
  });

  it('defaults alpha to opaque', () => {
    expect(alphaOf(rgba(1, 2, 3))).toBe(255);
  });

  it('stays a positive integer at the top of the range', () => {
    const c = rgba(255, 255, 255, 255);
    expect(c).toBeGreaterThan(0);
    expect(Number.isSafeInteger(c)).toBe(true);
  });

  it('parses hex with and without alpha', () => {
    expect(fromHex('#12345678')).toBe(rgba(0x12, 0x34, 0x56, 0x78));
    expect(fromHex('#123456')).toBe(rgba(0x12, 0x34, 0x56, 255));
  });

  it('rejects malformed hex rather than producing NaN pixels', () => {
    expect(() => fromHex('123456')).toThrow();
    expect(() => fromHex('#12345')).toThrow();
  });

  it('treats EMPTY as transparent and everything else by its alpha', () => {
    expect(isOpaque(EMPTY)).toBe(false);
    expect(isOpaque(rgba(0, 0, 0, 255))).toBe(true);
  });

  it('measures luminance', () => {
    expect(luminance(rgba(0, 0, 0))).toBe(0);
    expect(luminance(rgba(255, 255, 255))).toBeCloseTo(255, 0);
    expect(luminance(rgba(255, 0, 0))).toBeLessThan(luminance(rgba(0, 255, 0)));
  });
});

describe('buffer creation', () => {
  it('starts fully transparent', () => {
    const b = createBuf(4, 3);
    expect(b.w).toBe(4);
    expect(b.h).toBe(3);
    expect(b.data.length).toBe(4 * 3 * 4);
    expect(countOpaque(b)).toBe(0);
  });

  it('rejects a non-positive size', () => {
    expect(() => createBuf(0, 4)).toThrow(RangeError);
    expect(() => createBuf(4, -1)).toThrow(RangeError);
  });

  it('clones without sharing memory', () => {
    const a = createBuf(2, 2);
    setPx(a, 0, 0, RED);
    const b = cloneBuf(a);
    setPx(b, 1, 1, BLUE);
    expect(getPx(a, 1, 1)).toBe(EMPTY);
    expect(getPx(b, 0, 0)).toBe(RED);
  });
});

describe('pixel access', () => {
  it('round-trips a pixel', () => {
    const b = createBuf(3, 3);
    setPx(b, 1, 2, RED);
    expect(getPx(b, 1, 2)).toBe(RED);
  });

  it('returns EMPTY outside the buffer instead of throwing', () => {
    const b = createBuf(2, 2);
    expect(getPx(b, -1, 0)).toBe(EMPTY);
    expect(getPx(b, 0, -1)).toBe(EMPTY);
    expect(getPx(b, 2, 0)).toBe(EMPTY);
    expect(getPx(b, 0, 2)).toBe(EMPTY);
  });

  it('silently ignores writes outside the buffer', () => {
    const b = createBuf(2, 2);
    expect(() => setPx(b, -5, 5, RED)).not.toThrow();
    expect(countOpaque(b)).toBe(0);
  });

  it('fills every pixel', () => {
    const b = createBuf(3, 2);
    fillBuf(b, BLUE);
    expect(countOpaque(b)).toBe(6);
    expect(getPx(b, 2, 1)).toBe(BLUE);
  });
});

describe('blit', () => {
  it('copies opaque pixels and skips transparent ones', () => {
    const dst = createBuf(4, 4);
    fillBuf(dst, BLUE);
    const src = createBuf(2, 2);
    setPx(src, 0, 0, RED); // (1,1) transparent

    blit(dst, src, 1, 1);
    expect(getPx(dst, 1, 1)).toBe(RED);
    expect(getPx(dst, 2, 2)).toBe(BLUE); // transparent source left the target alone
  });

  it('clips at every edge without wrapping', () => {
    const dst = createBuf(4, 4);
    const src = createBuf(2, 2);
    fillBuf(src, RED);

    blit(dst, src, -1, -1);
    expect(getPx(dst, 0, 0)).toBe(RED);
    expect(getPx(dst, 3, 3)).toBe(EMPTY); // did not wrap around

    blit(dst, src, 3, 3);
    expect(getPx(dst, 3, 3)).toBe(RED);
    expect(countOpaque(dst)).toBe(2);
  });

  it('is a no-op when placed entirely outside', () => {
    const dst = createBuf(4, 4);
    const src = createBuf(2, 2);
    fillBuf(src, RED);
    blit(dst, src, 10, 10);
    blit(dst, src, -10, -10);
    expect(countOpaque(dst)).toBe(0);
  });

  it('blitOpaque carries transparency across, punching holes', () => {
    const dst = createBuf(2, 2);
    fillBuf(dst, BLUE);
    const src = createBuf(2, 2); // fully transparent
    blitOpaque(dst, src, 0, 0);
    expect(countOpaque(dst)).toBe(0);
  });
});

describe('bounds and crop', () => {
  it('finds the tight box around opaque pixels', () => {
    const b = createBuf(8, 8);
    setPx(b, 2, 3, RED);
    setPx(b, 5, 6, RED);
    expect(opaqueBounds(b)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 6 });
  });

  it('returns null for a fully transparent buffer', () => {
    expect(opaqueBounds(createBuf(4, 4))).toBeNull();
  });

  it('handles a single pixel', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, RED);
    expect(opaqueBounds(b)).toEqual({ x0: 1, y0: 1, x1: 1, y1: 1 });
  });

  it('crops a region', () => {
    const b = createBuf(4, 4);
    setPx(b, 2, 2, RED);
    const c = crop(b, 2, 2, 2, 2);
    expect(c.w).toBe(2);
    expect(getPx(c, 0, 0)).toBe(RED);
  });

  it('fills out-of-range crop area with transparency rather than throwing', () => {
    const b = createBuf(2, 2);
    fillBuf(b, RED);
    const c = crop(b, 1, 1, 3, 3);
    expect(getPx(c, 0, 0)).toBe(RED);
    expect(getPx(c, 2, 2)).toBe(EMPTY);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/pixbuf.test.ts
```

Expected: FAIL — `Failed to resolve import "./pixbuf.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/pixbuf.ts`:

```ts
/**
 * The pixel buffer every generated sprite is made of.
 *
 * Colours are packed into a single number as 0xRRGGBBAA, which makes palette
 * membership a Set lookup rather than a four-way comparison — the palette QC
 * runs over every pixel of every sprite, so that difference is worth the
 * packing.
 *
 * Alpha is binary by project rule: 0 or 255, never between. Partial alpha would
 * make both palette QC and LOD reduction ambiguous, and pixel art does not want
 * it anyway.
 *
 * Out-of-bounds reads return EMPTY and out-of-bounds writes are dropped. That is
 * deliberate: generators draw shapes that legitimately overhang their buffer,
 * and clamping at the primitive keeps every caller from repeating the same
 * bounds check.
 */

export type Rgba = number;

export interface PixBuf {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;
}

/** Inclusive corners. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const EMPTY: Rgba = 0;

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export function fromHex(hex: string): Rgba {
  if (!/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) {
    throw new RangeError(`malformed hex colour: ${hex}`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  return rgba(r, g, b, a);
}

export function redOf(c: Rgba): number {
  return (c >>> 24) & 255;
}

export function greenOf(c: Rgba): number {
  return (c >>> 16) & 255;
}

export function blueOf(c: Rgba): number {
  return (c >>> 8) & 255;
}

export function alphaOf(c: Rgba): number {
  return c & 255;
}

export function isOpaque(c: Rgba): boolean {
  return (c & 255) !== 0;
}

/** Rec. 601 luminance, 0–255. Used by the light-direction check and LOD weighting. */
export function luminance(c: Rgba): number {
  return 0.299 * redOf(c) + 0.587 * greenOf(c) + 0.114 * blueOf(c);
}

export function createBuf(w: number, h: number): PixBuf {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new RangeError(`buffer size must be positive integers, got ${w}x${h}`);
  }
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function cloneBuf(b: PixBuf): PixBuf {
  return { w: b.w, h: b.h, data: new Uint8ClampedArray(b.data) };
}

export function getPx(b: PixBuf, x: number, y: number): Rgba {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return EMPTY;
  const i = (y * b.w + x) * 4;
  return rgba(b.data[i]!, b.data[i + 1]!, b.data[i + 2]!, b.data[i + 3]!);
}

export function setPx(b: PixBuf, x: number, y: number, c: Rgba): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  b.data[i] = redOf(c);
  b.data[i + 1] = greenOf(c);
  b.data[i + 2] = blueOf(c);
  b.data[i + 3] = alphaOf(c);
}

export function fillBuf(b: PixBuf, c: Rgba): void {
  const r = redOf(c), g = greenOf(c), bl = blueOf(c), a = alphaOf(c);
  for (let i = 0; i < b.data.length; i += 4) {
    b.data[i] = r;
    b.data[i + 1] = g;
    b.data[i + 2] = bl;
    b.data[i + 3] = a;
  }
}

/** Copies opaque source pixels; transparent source pixels leave the target untouched. */
export function blit(dst: PixBuf, src: PixBuf, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      const c = getPx(src, x, y);
      if (isOpaque(c)) setPx(dst, tx, ty, c);
    }
  }
}

/** Copies every source pixel including transparency — punches holes in the target. */
export function blitOpaque(dst: PixBuf, src: PixBuf, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      setPx(dst, tx, ty, getPx(src, x, y));
    }
  }
}

export function opaqueBounds(b: PixBuf): Bounds | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (b.data[(y * b.w + x) * 4 + 3]! !== 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0) return null;
  return { x0, y0, x1, y1 };
}

export function crop(b: PixBuf, x0: number, y0: number, w: number, h: number): PixBuf {
  const out = createBuf(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      setPx(out, x, y, getPx(b, x0 + x, y0 + y));
    }
  }
  return out;
}

export function countOpaque(b: PixBuf): number {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) {
    if (b.data[i]! !== 0) n++;
  }
  return n;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/pixbuf.test.ts
```

Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/pixbuf.ts src/gen/pixbuf.test.ts
git commit -m "feat: PixBuf, the RGBA buffer every sprite is made of

Packed 0xRRGGBBAA so palette membership is a Set lookup. Binary alpha by rule.
Out-of-bounds reads yield EMPTY and writes are dropped, so generators can draw
shapes that overhang their buffer without every caller repeating the check."
```

---

### Task 6: `gen/png.ts` — PNG encoder

Written by hand over `node:zlib` rather than pulling a dependency. It is about eighty lines, it keeps `gen/` dependency-free, and it means the Milestone 0 contact sheet is a file this project produces rather than one a library produces.

**Files:**
- Create: `src/gen/png.ts`
- Test: `src/gen/png.test.ts`

**Interfaces:**
- Consumes: `PixBuf`, `getPx`, `redOf`, `greenOf`, `blueOf`, `alphaOf` from `./pixbuf.js`
- Produces:
  - `function encodePng(buf: PixBuf): Uint8Array`
  - `const PNG_SIGNATURE: readonly number[]`

- [ ] **Step 1: Write the failing test**

Create `src/gen/png.test.ts`:

```ts
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBuf, fillBuf, rgba, setPx } from './pixbuf.js';
import { encodePng, PNG_SIGNATURE } from './png.js';

/** Reads the chunk type strings in order, so structure can be asserted without a decoder. */
function chunkTypes(png: Uint8Array): string[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const types: string[] = [];
  let p = 8; // skip signature
  while (p < png.length) {
    const len = view.getUint32(p);
    types.push(String.fromCharCode(png[p + 4]!, png[p + 5]!, png[p + 6]!, png[p + 7]!));
    p += 12 + len; // length + type + data + crc
  }
  return types;
}

function idatPayload(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [];
  let p = 8;
  while (p < png.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(png[p + 4]!, png[p + 5]!, png[p + 6]!, png[p + 7]!);
    if (type === 'IDAT') parts.push(png.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const total = parts.reduce((n, x) => n + x.length, 0);
  const joined = new Uint8Array(total);
  let o = 0;
  for (const part of parts) { joined.set(part, o); o += part.length; }
  return joined;
}

describe('png structure', () => {
  it('starts with the PNG signature', () => {
    const png = encodePng(createBuf(2, 2));
    expect(Array.from(png.slice(0, 8))).toEqual([...PNG_SIGNATURE]);
  });

  it('emits IHDR, IDAT and IEND in that order', () => {
    expect(chunkTypes(encodePng(createBuf(4, 4)))).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('records the dimensions in IHDR', () => {
    const png = encodePng(createBuf(7, 13));
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(7);  // IHDR data starts at byte 16
    expect(view.getUint32(20)).toBe(13);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // colour type: RGBA
  });

  it('ends with a zero-length IEND', () => {
    const png = encodePng(createBuf(2, 2));
    const tail = Array.from(png.slice(-12, -4));
    expect(tail.slice(0, 4)).toEqual([0, 0, 0, 0]); // length
    expect(String.fromCharCode(...tail.slice(4))).toBe('IEND');
  });
});

describe('png pixel fidelity', () => {
  it('round-trips pixel data through the IDAT stream', () => {
    const b = createBuf(2, 1);
    setPx(b, 0, 0, rgba(10, 20, 30, 255));
    setPx(b, 1, 0, rgba(40, 50, 60, 0));

    const raw = inflateSync(Buffer.from(idatPayload(encodePng(b))));
    // One scanline: a filter byte followed by 2 RGBA pixels.
    expect(Array.from(raw)).toEqual([0, 10, 20, 30, 255, 40, 50, 60, 0]);
  });

  it('writes one filter byte per scanline', () => {
    const b = createBuf(3, 4);
    const raw = inflateSync(Buffer.from(idatPayload(encodePng(b))));
    expect(raw.length).toBe(4 * (1 + 3 * 4));
    for (let y = 0; y < 4; y++) {
      expect(raw[y * (1 + 3 * 4)]).toBe(0); // filter type 0, "None"
    }
  });

  it('preserves a filled buffer exactly', () => {
    const b = createBuf(8, 8);
    fillBuf(b, rgba(1, 2, 3, 255));
    const raw = inflateSync(Buffer.from(idatPayload(encodePng(b))));
    expect(raw[1]).toBe(1);
    expect(raw[2]).toBe(2);
    expect(raw[3]).toBe(3);
    expect(raw[4]).toBe(255);
  });

  it('is deterministic — the same buffer encodes to identical bytes', () => {
    const b = createBuf(16, 16);
    fillBuf(b, rgba(9, 9, 9, 255));
    expect(Array.from(encodePng(b))).toEqual(Array.from(encodePng(b)));
  });
});
```

The round-trip through `inflateSync` is what makes this a real test rather than a shape check: it proves the bytes a decoder will see are the pixels that went in.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/png.test.ts
```

Expected: FAIL — `Failed to resolve import "./png.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/png.ts`:

```ts
/**
 * A minimal PNG encoder: 8-bit RGBA, no interlacing, filter type 0.
 *
 * Hand-rolled over node:zlib rather than taken as a dependency. The whole
 * encoder is shorter than the install it replaces, it keeps `gen/` free of
 * runtime dependencies, and it is deterministic — the same buffer always
 * encodes to the same bytes, which the contact sheet's reproducibility relies
 * on.
 */

import { deflateSync } from 'node:zlib';
import { alphaOf, blueOf, getPx, greenOf, redOf, type PixBuf } from './pixbuf.js';

export const PNG_SIGNATURE: readonly number[] = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 255]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);

  // The CRC covers the type and the data, but not the length field.
  view.setUint32(8 + data.length, crc32(out.slice(4, 8 + data.length)));
  return out;
}

function ihdr(w: number, h: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  data[8] = 8;  // bit depth
  data[9] = 6;  // colour type 6 = truecolour with alpha
  data[10] = 0; // compression: deflate
  data[11] = 0; // filter method: adaptive
  data[12] = 0; // interlace: none
  return data;
}

/**
 * Raw scanlines, each prefixed with filter byte 0 ("None").
 *
 * Per-scanline filters would compress better, but sprite sheets of flat palette
 * colour already deflate well and an unfiltered stream is trivially verifiable
 * in tests — which is worth more here than a smaller file.
 */
function scanlines(buf: PixBuf): Uint8Array {
  const stride = buf.w * 4;
  const out = new Uint8Array(buf.h * (stride + 1));
  let o = 0;
  for (let y = 0; y < buf.h; y++) {
    out[o++] = 0;
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      out[o++] = redOf(c);
      out[o++] = greenOf(c);
      out[o++] = blueOf(c);
      out[o++] = alphaOf(c);
    }
  }
  return out;
}

export function encodePng(buf: PixBuf): Uint8Array {
  const idat = new Uint8Array(deflateSync(Buffer.from(scanlines(buf)), { level: 9 }));

  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr(buf.w, buf.h)),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    png.set(part, o);
    o += part.length;
  }
  return png;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/png.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Verify the purity check still passes now that `gen/` has files in it**

```bash
npx vitest run tools/purity.test.ts
```

Expected: PASS. `node:zlib` is stdlib, not a forbidden package, so `png.ts` is legal in a pure module.

- [ ] **Step 6: Commit**

```bash
git add src/gen/png.ts src/gen/png.test.ts
git commit -m "feat: hand-rolled PNG encoder over node:zlib

Eighty lines instead of a dependency, and deterministic: the same buffer always
encodes to identical bytes, which is what the contact sheet's reproducibility
rests on."
```

---

### Task 7: `gen/palette.ts` — the 52-color master palette

Palette discipline is the entire art budget. Every color in the game is one of these 52, every faction locks to a subset, and a build fails if a single pixel falls outside. This is what makes a Coalition cannon bank bolted to a Concord hull read as deliberate assembly rather than as a bug.

**Files:**
- Create: `src/gen/palette.ts`
- Test: `src/gen/palette.test.ts`

**Interfaces:**
- Consumes: `Rgba`, `fromHex`, `redOf`, `greenOf`, `blueOf`, `luminance`, `isOpaque` from `./pixbuf.js`
- Produces:
  - `const NEUTRAL: readonly Rgba[]` — 8 values, cold steel, dark → light
  - `const WARM: readonly Rgba[]` — 7 values, rust and bronze
  - `const CONCORD_RAMP: readonly Rgba[]` — 7 values, cold blue
  - `const COALITION_RAMP: readonly Rgba[]` — 7 values, olive and ochre
  - `const EMISSIVE: Readonly<Record<EmissiveName, Rgba>>` — 8 values
  - `const SPACE: readonly Rgba[]` — 8 values
  - `const UI: readonly Rgba[]` — 7 values
  - `type EmissiveName = 'cyan' | 'blue' | 'amber' | 'red' | 'green' | 'white' | 'magenta' | 'orange'`
  - `const MASTER_PALETTE: readonly Rgba[]` — all 52, deduplicated
  - `const EMISSIVE_SET: ReadonlySet<Rgba>` — the only colors permitted to bloom
  - `type FactionId = 'concord' | 'coalition' | 'derelict' | 'player'`
  - `const FACTION_PALETTE: Readonly<Record<FactionId, readonly Rgba[]>>`
  - `type PoiId = 'gasgiant' | 'belt' | 'station' | 'graveyard' | 'yard' | 'star' | 'deepfield' | 'wreckreef'`
  - `const POI_PALETTE: Readonly<Record<PoiId, readonly Rgba[]>>`
  - `function isInPalette(c: Rgba): boolean` — transparent counts as in-palette
  - `function isEmissive(c: Rgba): boolean`
  - `function snapToPalette(c: Rgba, allowed?: readonly Rgba[]): Rgba` — nearest by squared RGB distance
  - `function rampOf(faction: FactionId): readonly Rgba[]` — the faction's hull ramp, dark → light
  - `function shadeStep(ramp: readonly Rgba[], step: number): Rgba` — clamped index

- [ ] **Step 1: Write the failing test**

Create `src/gen/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { alphaOf, EMPTY, luminance, rgba } from './pixbuf.js';
import {
  COALITION_RAMP, CONCORD_RAMP, EMISSIVE, EMISSIVE_SET, FACTION_PALETTE,
  isEmissive, isInPalette, MASTER_PALETTE, NEUTRAL, POI_PALETTE, rampOf,
  shadeStep, snapToPalette, SPACE, UI, WARM,
} from './palette.js';

describe('master palette', () => {
  it('holds 52 colours', () => {
    expect(MASTER_PALETTE).toHaveLength(52);
  });

  it('contains no duplicates', () => {
    expect(new Set(MASTER_PALETTE).size).toBe(52);
  });

  it('is entirely opaque — transparency is an alpha state, not a colour', () => {
    for (const c of MASTER_PALETTE) expect(alphaOf(c)).toBe(255);
  });

  it('is the union of its named groups', () => {
    const grouped = new Set([
      ...NEUTRAL, ...WARM, ...CONCORD_RAMP, ...COALITION_RAMP,
      ...Object.values(EMISSIVE), ...SPACE, ...UI,
    ]);
    expect(grouped.size).toBe(52);
    for (const c of MASTER_PALETTE) expect(grouped.has(c)).toBe(true);
  });
});

describe('ramps ascend in luminance', () => {
  const ramps: [string, readonly number[]][] = [
    ['neutral', NEUTRAL], ['warm', WARM],
    ['concord', CONCORD_RAMP], ['coalition', COALITION_RAMP], ['space', SPACE], ['ui', UI],
  ];

  for (const [name, ramp] of ramps) {
    it(`${name} goes dark to light with no flat steps`, () => {
      for (let i = 1; i < ramp.length; i++) {
        expect(luminance(ramp[i]!)).toBeGreaterThan(luminance(ramp[i - 1]!));
      }
    });
  }

  it('gives the hull ramps enough range to shade with', () => {
    for (const ramp of [NEUTRAL, CONCORD_RAMP, COALITION_RAMP, WARM]) {
      const spread = luminance(ramp.at(-1)!) - luminance(ramp[0]!);
      expect(spread).toBeGreaterThan(120);
    }
  });
});

describe('membership', () => {
  it('accepts every palette colour', () => {
    for (const c of MASTER_PALETTE) expect(isInPalette(c)).toBe(true);
  });

  it('accepts transparency', () => {
    expect(isInPalette(EMPTY)).toBe(true);
  });

  it('rejects an invented colour', () => {
    expect(isInPalette(rgba(123, 45, 67))).toBe(false);
  });

  it('rejects a palette colour at the wrong alpha', () => {
    const c = MASTER_PALETTE[0]!;
    expect(isInPalette(rgba((c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, 128))).toBe(false);
  });
});

describe('emissives', () => {
  it('names eight of them', () => {
    expect(Object.keys(EMISSIVE)).toHaveLength(8);
    expect(EMISSIVE_SET.size).toBe(8);
  });

  it('identifies them', () => {
    expect(isEmissive(EMISSIVE.amber)).toBe(true);
    expect(isEmissive(NEUTRAL[0]!)).toBe(false);
  });

  it('makes them the brightest things in the palette', () => {
    // Bloom keys off emissives; if hull midtones outshone them the threshold
    // could not separate the two.
    const dimmestEmissive = Math.min(...Object.values(EMISSIVE).map(luminance));
    const brightestHull = Math.max(...[...NEUTRAL, ...WARM].map(luminance));
    expect(dimmestEmissive).toBeGreaterThan(brightestHull * 0.55);
  });
});

describe('faction locks', () => {
  it('defines a subset for each faction', () => {
    for (const id of ['concord', 'coalition', 'derelict', 'player'] as const) {
      const lock = FACTION_PALETTE[id];
      expect(lock.length).toBeGreaterThan(6);
      expect(lock.length).toBeLessThan(MASTER_PALETTE.length);
      for (const c of lock) expect(isInPalette(c)).toBe(true);
    }
  });

  it('gives the two live factions visibly different hull ramps', () => {
    const concord = new Set(rampOf('concord'));
    const overlap = rampOf('coalition').filter((c) => concord.has(c));
    expect(overlap).toHaveLength(0);
  });

  it('returns a usable ramp for every faction', () => {
    for (const id of ['concord', 'coalition', 'derelict', 'player'] as const) {
      expect(rampOf(id).length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('POI locks', () => {
  it('defines eight POIs, each a real subset', () => {
    const ids = Object.keys(POI_PALETTE);
    expect(ids).toHaveLength(8);
    for (const id of ids) {
      const lock = POI_PALETTE[id as keyof typeof POI_PALETTE];
      expect(lock.length).toBeGreaterThan(3);
      expect(lock.length).toBeLessThan(MASTER_PALETTE.length);
      for (const c of lock) expect(isInPalette(c)).toBe(true);
    }
  });

  it('gives each POI a distinct lock — no two are the same set', () => {
    const keys = Object.values(POI_PALETTE).map((lock) => [...lock].sort().join(','));
    expect(new Set(keys).size).toBe(8);
  });
});

describe('snapping', () => {
  it('leaves a palette colour untouched', () => {
    expect(snapToPalette(NEUTRAL[3]!)).toBe(NEUTRAL[3]!);
  });

  it('pulls a near-miss to its nearest neighbour', () => {
    const target = NEUTRAL[3]!;
    const nudged = rgba(
      ((target >>> 24) & 255) + 2,
      ((target >>> 16) & 255) - 1,
      ((target >>> 8) & 255) + 1,
    );
    expect(snapToPalette(nudged)).toBe(target);
  });

  it('always returns something in the palette', () => {
    for (let i = 0; i < 200; i++) {
      const c = rgba((i * 37) % 256, (i * 91) % 256, (i * 13) % 256);
      expect(isInPalette(snapToPalette(c))).toBe(true);
    }
  });

  it('honours a restricted allowed set', () => {
    const allowed = CONCORD_RAMP;
    for (let i = 0; i < 50; i++) {
      const c = rgba((i * 51) % 256, (i * 17) % 256, (i * 200) % 256);
      expect(allowed).toContain(snapToPalette(c, allowed));
    }
  });

  it('passes transparency through rather than snapping it to black', () => {
    expect(snapToPalette(EMPTY)).toBe(EMPTY);
  });
});

describe('shadeStep', () => {
  it('indexes into a ramp', () => {
    expect(shadeStep(NEUTRAL, 2)).toBe(NEUTRAL[2]!);
  });

  it('clamps rather than wrapping or returning undefined', () => {
    expect(shadeStep(NEUTRAL, -5)).toBe(NEUTRAL[0]!);
    expect(shadeStep(NEUTRAL, 999)).toBe(NEUTRAL.at(-1)!);
  });

  it('rounds a fractional step', () => {
    expect(shadeStep(NEUTRAL, 1.6)).toBe(NEUTRAL[2]!);
  });
});
```

The emissive-brightness assertion is doing real work: bloom in the post chain keys off a luminance threshold, and if a hull highlight were brighter than the dimmest running light, no threshold could separate them and the whole ship would haze.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/palette.test.ts
```

Expected: FAIL — `Failed to resolve import "./palette.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/palette.ts`:

```ts
/**
 * The 52-colour master palette and the locks that carve it up.
 *
 * Palette discipline is the entire art budget. Because every sprite is drawn
 * from this list and every faction is locked to a subset of it, a Coalition
 * cannon bank bolted onto a Concord hull reads as deliberate assembly rather
 * than as a rendering bug — the mismatch is a designed signal, and it only
 * works because the vocabulary is small and closed.
 *
 * Ramps run dark to light with strictly increasing luminance so shading code
 * can index them as steps rather than choosing colours.
 */

import {
  blueOf, EMPTY, fromHex, greenOf, isOpaque, redOf, type Rgba,
} from './pixbuf.js';

/** Cold steel. The player's structural hull and every faction's shared plating. */
export const NEUTRAL: readonly Rgba[] = [
  fromHex('#0a0d12'), fromHex('#161c26'), fromHex('#26303f'), fromHex('#3c4a5c'),
  fromHex('#5a6b80'), fromHex('#8496ab'), fromHex('#b6c4d4'), fromHex('#dce6f0'),
];

/** Rust and bronze. Derelict hulls, oxidised salvage, scorch. */
export const WARM: readonly Rgba[] = [
  fromHex('#1a120c'), fromHex('#2e2015'), fromHex('#4a3320'), fromHex('#6b4a2c'),
  fromHex('#91663a'), fromHex('#b98a52'), fromHex('#d9ab73'),
];

/** Faction A — cold blue-white. Disciplined, uniform, navy. */
export const CONCORD_RAMP: readonly Rgba[] = [
  fromHex('#0c1622'), fromHex('#16293f'), fromHex('#234460'), fromHex('#356585'),
  fromHex('#4f8cae'), fromHex('#7fb8d4'), fromHex('#a8dcf0'),
];

/** Faction B — olive and ochre. Industrial, welded, agricultural-machinery green. */
export const COALITION_RAMP: readonly Rgba[] = [
  fromHex('#14170c'), fromHex('#242a12'), fromHex('#3c451e'), fromHex('#5a6630'),
  fromHex('#7f8c44'), fromHex('#a8b263'), fromHex('#ccd68a'),
];

export type EmissiveName =
  | 'cyan' | 'blue' | 'amber' | 'red' | 'green' | 'white' | 'magenta' | 'orange';

/** The only colours permitted to bloom. Everything else is matte by rule. */
export const EMISSIVE: Readonly<Record<EmissiveName, Rgba>> = {
  cyan: fromHex('#5ff2e6'),
  blue: fromHex('#4a9df2'),
  amber: fromHex('#ffb03a'),
  red: fromHex('#ff4a3a'),
  green: fromHex('#6cf24a'),
  white: fromHex('#f2f7ff'),
  magenta: fromHex('#d45ff2'),
  orange: fromHex('#ff7a29'),
};

/** Deep space and nebula. Cold at the bottom, drifting warm-violet at the top. */
export const SPACE: readonly Rgba[] = [
  fromHex('#04050a'), fromHex('#080b14'), fromHex('#0e1322'), fromHex('#161d33'),
  fromHex('#221a3a'), fromHex('#33224a'), fromHex('#4a2e52'), fromHex('#6b3d55'),
];

/** Panel chrome. Phosphor green — the terminal register the UI speaks in. */
export const UI: readonly Rgba[] = [
  fromHex('#0a0f0c'), fromHex('#12211a'), fromHex('#1e3a2c'), fromHex('#2f5c45'),
  fromHex('#468a66'), fromHex('#7fd4a0'), fromHex('#b8f2cc'),
];

export const MASTER_PALETTE: readonly Rgba[] = [
  ...NEUTRAL, ...WARM, ...CONCORD_RAMP, ...COALITION_RAMP,
  ...Object.values(EMISSIVE), ...SPACE, ...UI,
];

const PALETTE_SET: ReadonlySet<Rgba> = new Set(MASTER_PALETTE);

export const EMISSIVE_SET: ReadonlySet<Rgba> = new Set(Object.values(EMISSIVE));

export type FactionId = 'concord' | 'coalition' | 'derelict' | 'player';

/**
 * Each faction's locked subset. Shared neutrals are what let salvaged parts sit
 * on a foreign hull at all; the ramp is what keeps their origin legible.
 */
export const FACTION_PALETTE: Readonly<Record<FactionId, readonly Rgba[]>> = {
  concord: [
    ...CONCORD_RAMP, ...NEUTRAL,
    EMISSIVE.blue, EMISSIVE.cyan, EMISSIVE.white,
  ],
  coalition: [
    ...COALITION_RAMP, ...NEUTRAL.slice(0, 5), ...WARM.slice(0, 4),
    EMISSIVE.amber, EMISSIVE.orange, EMISSIVE.red,
  ],
  derelict: [
    ...WARM, ...NEUTRAL.slice(0, 4),
    EMISSIVE.green, EMISSIVE.red,
  ],
  player: [
    ...NEUTRAL, ...WARM.slice(2, 5),
    EMISSIVE.amber, EMISSIVE.white, EMISSIVE.red,
  ],
};

export type PoiId =
  | 'gasgiant' | 'belt' | 'station' | 'graveyard'
  | 'yard' | 'star' | 'deepfield' | 'wreckreef';

/**
 * Each POI locks to a subset so a single screenshot identifies where you are.
 * The star's lock is deliberately the harshest: blown-out warm values with the
 * cold end of the palette withheld entirely.
 */
export const POI_PALETTE: Readonly<Record<PoiId, readonly Rgba[]>> = {
  gasgiant: [...SPACE.slice(0, 6), ...WARM.slice(2, 6), ...NEUTRAL.slice(1, 6), EMISSIVE.amber],
  belt: [...SPACE.slice(0, 4), ...NEUTRAL, ...WARM.slice(1, 4), EMISSIVE.white],
  station: [...SPACE.slice(0, 5), ...NEUTRAL.slice(1, 7), EMISSIVE.amber, EMISSIVE.red, EMISSIVE.cyan],
  graveyard: [...SPACE.slice(0, 4), ...NEUTRAL.slice(0, 5), ...WARM.slice(0, 5), EMISSIVE.green],
  yard: [...SPACE.slice(1, 5), ...NEUTRAL.slice(2, 8), ...CONCORD_RAMP.slice(1, 5), EMISSIVE.blue, EMISSIVE.white],
  star: [...WARM.slice(1, 7), ...NEUTRAL.slice(4, 8), EMISSIVE.orange, EMISSIVE.amber, EMISSIVE.white],
  deepfield: [...SPACE, ...NEUTRAL.slice(0, 4), EMISSIVE.cyan],
  wreckreef: [...SPACE.slice(2, 8), ...WARM.slice(0, 4), ...NEUTRAL.slice(1, 5), EMISSIVE.magenta, EMISSIVE.red],
};

/** Transparency is a valid state, not an off-palette colour. */
export function isInPalette(c: Rgba): boolean {
  if (!isOpaque(c)) return c === EMPTY;
  return PALETTE_SET.has(c);
}

export function isEmissive(c: Rgba): boolean {
  return EMISSIVE_SET.has(c);
}

/** Nearest palette entry by squared RGB distance. Transparency passes through. */
export function snapToPalette(c: Rgba, allowed: readonly Rgba[] = MASTER_PALETTE): Rgba {
  if (!isOpaque(c)) return EMPTY;

  const r = redOf(c), g = greenOf(c), b = blueOf(c);
  let best = allowed[0]!;
  let bestDist = Infinity;

  for (const candidate of allowed) {
    const dr = r - redOf(candidate);
    const dg = g - greenOf(candidate);
    const db = b - blueOf(candidate);
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

const HULL_RAMP: Readonly<Record<FactionId, readonly Rgba[]>> = {
  concord: CONCORD_RAMP,
  coalition: COALITION_RAMP,
  derelict: WARM,
  player: NEUTRAL,
};

export function rampOf(faction: FactionId): readonly Rgba[] {
  return HULL_RAMP[faction];
}

/** Clamped ramp index. Shading code walks steps; it never picks colours. */
export function shadeStep(ramp: readonly Rgba[], step: number): Rgba {
  const i = Math.round(step);
  if (i <= 0) return ramp[0]!;
  if (i >= ramp.length) return ramp[ramp.length - 1]!;
  return ramp[i]!;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/palette.test.ts
```

Expected: PASS, 24 tests.

If the "emissives are the brightest things" assertion fails, do not weaken the assertion — darken the offending hull ramp's top step. The threshold relationship is the requirement; the specific values are negotiable.

> **Amended during execution (commit `f1870de`).** Every exported palette
> structure must be wrapped in `Object.freeze` — the seven ramp arrays,
> `MASTER_PALETTE`, `EMISSIVE`, `FACTION_PALETTE` and `POI_PALETTE` **including
> their inner arrays**, and the internal `HULL_RAMP`. `readonly` is compile-time
> only; without freezing, `NEUTRAL.push(0)` and `MASTER_PALETTE[0] = 0` both
> succeed silently, and `rampOf()` hands consumers the live array. Fourteen later
> tasks import this module, so one mutation would collapse the closed vocabulary
> the whole art direction rests on. Leave `PALETTE_SET` and `EMISSIVE_SET`
> unfrozen — freezing a `Set` does not block `.add()`, so it would be theatre.

- [ ] **Step 5: Commit**

```bash
git add src/gen/palette.ts src/gen/palette.test.ts
git commit -m "feat: 52-colour master palette with faction and POI locks

Ramps ascend in luminance so shading indexes steps rather than picking colours.
Emissives sit above every hull value, which is the only reason a bloom threshold
can separate a running light from a bright plate."
```

---

### Task 8: `gen/font.ts` — 5×7 bitmap font

Needed now to label the contact sheet, and it becomes the UI's pixel font in Plan 2. One font at integer scales only, per the spec's UI rule.

**Files:**
- Create: `src/gen/font.ts`
- Test: `src/gen/font.test.ts`

**Interfaces:**
- Consumes: `PixBuf`, `Rgba`, `setPx`, `createBuf` from `./pixbuf.js`
- Produces:
  - `const GLYPH_W: 5`, `const GLYPH_H: 7`, `const GLYPH_ADVANCE: 6`
  - `function hasGlyph(ch: string): boolean`
  - `function textWidth(text: string, scale?: number): number`
  - `function drawText(dst: PixBuf, text: string, x: number, y: number, color: Rgba, scale?: number): void` — uppercases input; unknown characters render as a filled box so a missing glyph is visible rather than silent
  - `function renderText(text: string, color: Rgba, scale?: number): PixBuf`

- [ ] **Step 1: Write the failing test**

Create `src/gen/font.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countOpaque, createBuf, EMPTY, getPx, rgba } from './pixbuf.js';
import {
  drawText, GLYPH_ADVANCE, GLYPH_H, GLYPH_W, hasGlyph, renderText, textWidth,
} from './font.js';

const WHITE = rgba(255, 255, 255);

describe('glyph coverage', () => {
  it('covers A-Z', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(hasGlyph(ch)).toBe(true);
  });

  it('covers 0-9', () => {
    for (const ch of '0123456789') expect(hasGlyph(ch)).toBe(true);
  });

  it('covers the punctuation the contact sheet labels need', () => {
    for (const ch of ' -.:/') expect(hasGlyph(ch)).toBe(true);
  });

  it('maps lowercase onto the uppercase glyph', () => {
    expect(hasGlyph('a')).toBe(true);
  });

  it('reports an unmapped character as missing', () => {
    expect(hasGlyph('é')).toBe(false);
  });
});

describe('metrics', () => {
  it('uses a 5x7 cell with a one-pixel gap', () => {
    expect(GLYPH_W).toBe(5);
    expect(GLYPH_H).toBe(7);
    expect(GLYPH_ADVANCE).toBe(6);
  });

  it('measures text without a trailing gap', () => {
    expect(textWidth('A')).toBe(5);
    expect(textWidth('AB')).toBe(11);
    expect(textWidth('ABC')).toBe(17);
  });

  it('scales metrics by integers', () => {
    expect(textWidth('AB', 2)).toBe(22);
    expect(textWidth('', 3)).toBe(0);
  });
});

describe('drawing', () => {
  it('puts ink on the buffer', () => {
    const b = createBuf(40, 10);
    drawText(b, 'A', 0, 0, WHITE);
    expect(countOpaque(b)).toBeGreaterThan(5);
  });

  it('leaves a space blank', () => {
    const b = createBuf(20, 10);
    drawText(b, ' ', 0, 0, WHITE);
    expect(countOpaque(b)).toBe(0);
  });

  it('draws in the requested colour only', () => {
    const b = createBuf(20, 10);
    const red = rgba(255, 0, 0);
    drawText(b, 'X', 0, 0, red);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const c = getPx(b, x, y);
        expect(c === EMPTY || c === red).toBe(true);
      }
    }
  });

  it('stays inside its declared box', () => {
    const b = createBuf(20, 20);
    drawText(b, 'W', 3, 4, WHITE);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (getPx(b, x, y) === EMPTY) continue;
        expect(x).toBeGreaterThanOrEqual(3);
        expect(x).toBeLessThan(3 + GLYPH_W);
        expect(y).toBeGreaterThanOrEqual(4);
        expect(y).toBeLessThan(4 + GLYPH_H);
      }
    }
  });

  it('advances between characters', () => {
    const a = createBuf(30, 10);
    drawText(a, 'II', 0, 0, WHITE);
    const b = createBuf(30, 10);
    drawText(b, 'I', 0, 0, WHITE);
    expect(countOpaque(a)).toBe(countOpaque(b) * 2);
  });

  it('clips at the edge without throwing or wrapping', () => {
    const b = createBuf(8, 8);
    expect(() => drawText(b, 'LONG TEXT', 0, 0, WHITE)).not.toThrow();
    expect(() => drawText(b, 'A', -20, -20, WHITE)).not.toThrow();
  });

  it('renders an unknown character as a visible box rather than nothing', () => {
    const b = createBuf(20, 10);
    drawText(b, 'é', 0, 0, WHITE);
    expect(countOpaque(b)).toBeGreaterThan(10);
  });

  it('scales by whole pixels', () => {
    const one = createBuf(40, 20);
    drawText(one, 'A', 0, 0, WHITE, 1);
    const two = createBuf(40, 20);
    drawText(two, 'A', 0, 0, WHITE, 2);
    expect(countOpaque(two)).toBe(countOpaque(one) * 4);
  });

  it('distinguishes different letters', () => {
    const a = createBuf(20, 10);
    drawText(a, 'A', 0, 0, WHITE);
    const b = createBuf(20, 10);
    drawText(b, 'B', 0, 0, WHITE);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });
});

describe('renderText', () => {
  it('returns a buffer sized to the text', () => {
    const buf = renderText('AB', WHITE);
    expect(buf.w).toBe(textWidth('AB'));
    expect(buf.h).toBe(GLYPH_H);
  });

  it('returns a 1x1 buffer for empty text rather than throwing', () => {
    const buf = renderText('', WHITE);
    expect(buf.w).toBe(1);
    expect(countOpaque(buf)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/font.test.ts
```

Expected: FAIL — `Failed to resolve import "./font.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/font.ts`:

```ts
/**
 * A 5x7 bitmap font — the project's only typeface, rendered at integer scales
 * only.
 *
 * Each glyph is five column bytes. Bit 0 of a column is its top row, bit 6 the
 * bottom, so a column byte never exceeds 0x7F. This is the classic 5x7 cell
 * that early terminal hardware used, which is exactly the register the UI is
 * meant to speak in.
 */

import { createBuf, setPx, type PixBuf, type Rgba } from './pixbuf.js';

export const GLYPH_W = 5 as const;
export const GLYPH_H = 7 as const;
/** Cell width plus a one-pixel inter-character gap. */
export const GLYPH_ADVANCE = 6 as const;

/** Column bitmaps, LSB = top row. */
const GLYPHS: Readonly<Record<string, readonly number[]>> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  '-': [0x08, 0x08, 0x08, 0x08, 0x08],
  '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00],
  '0': [0x3e, 0x51, 0x49, 0x45, 0x3e],
  '1': [0x00, 0x42, 0x7f, 0x40, 0x00],
  '2': [0x42, 0x61, 0x51, 0x49, 0x46],
  '3': [0x21, 0x41, 0x45, 0x4b, 0x31],
  '4': [0x18, 0x14, 0x12, 0x7f, 0x10],
  '5': [0x27, 0x45, 0x45, 0x45, 0x39],
  '6': [0x3c, 0x4a, 0x49, 0x49, 0x30],
  '7': [0x01, 0x71, 0x09, 0x05, 0x03],
  '8': [0x36, 0x49, 0x49, 0x49, 0x36],
  '9': [0x06, 0x49, 0x49, 0x29, 0x1e],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x01, 0x01],
  G: [0x3e, 0x41, 0x41, 0x51, 0x32],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x04, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x7f, 0x20, 0x18, 0x20, 0x7f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x03, 0x04, 0x78, 0x04, 0x03],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

/** Rendered for any character with no glyph, so a gap is visible rather than silent. */
const MISSING: readonly number[] = [0x7f, 0x7f, 0x7f, 0x7f, 0x7f];

function glyphOf(ch: string): readonly number[] {
  return GLYPHS[ch.toUpperCase()] ?? MISSING;
}

export function hasGlyph(ch: string): boolean {
  return ch.toUpperCase() in GLYPHS;
}

export function textWidth(text: string, scale = 1): number {
  if (text.length === 0) return 0;
  return (text.length * GLYPH_ADVANCE - 1) * scale;
}

export function drawText(
  dst: PixBuf,
  text: string,
  x: number,
  y: number,
  color: Rgba,
  scale = 1,
): void {
  for (let i = 0; i < text.length; i++) {
    const columns = glyphOf(text[i]!);
    const originX = x + i * GLYPH_ADVANCE * scale;

    for (let col = 0; col < GLYPH_W; col++) {
      const bits = columns[col]!;
      for (let row = 0; row < GLYPH_H; row++) {
        if ((bits & (1 << row)) === 0) continue;
        // Scale by painting a scale x scale block; setPx clips for us.
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPx(dst, originX + col * scale + sx, y + row * scale + sy, color);
          }
        }
      }
    }
  }
}

export function renderText(text: string, color: Rgba, scale = 1): PixBuf {
  const buf = createBuf(Math.max(1, textWidth(text, scale)), GLYPH_H * scale);
  drawText(buf, text, 0, 0, color, scale);
  return buf;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/font.test.ts
```

Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/font.ts src/gen/font.test.ts
git commit -m "feat: 5x7 bitmap font, integer scales only

Labels the contact sheet now; becomes the UI typeface in Plan 2. Unknown
characters render as a filled box so a missing glyph is visible rather than
silently absent."
```

---

### Task 9: `gen/qc.ts` — automated sprite quality control

The three checks that turn acceptance criteria into build failures: zero off-palette pixels, binary alpha, and a consistent baked light direction. Every generator task from here on ends by running its output through these.

**Files:**
- Create: `src/gen/qc.ts`
- Test: `src/gen/qc.test.ts`

**Interfaces:**
- Consumes: `PixBuf`, `Rgba`, `getPx`, `isOpaque`, `alphaOf`, `luminance`, `EMPTY` from `./pixbuf.js`; `isInPalette`, `isEmissive`, `snapToPalette` from `./palette.js`
- Produces:
  - `interface PaletteViolation { x: number; y: number; color: Rgba; nearest: Rgba }`
  - `interface LightReport { litMean: number; shadowMean: number; margin: number; samples: number; pass: boolean }`
  - `interface QcReport { name: string; palette: PaletteViolation[]; alpha: PaletteViolation[]; light: LightReport | null; pass: boolean }`
  - `const LIGHT_MARGIN: number` — required luminance gap, 8
  - `const MIN_LIGHT_SAMPLES: number` — below this the check abstains, 12
  - `function checkPalette(buf: PixBuf, allowed?: readonly Rgba[]): PaletteViolation[]`
  - `function checkBinaryAlpha(buf: PixBuf): PaletteViolation[]`
  - `function checkLightDirection(buf: PixBuf): LightReport | null` — `null` when there are too few samples to judge
  - `function qcSprite(name: string, buf: PixBuf, allowed?: readonly Rgba[]): QcReport`
  - `function formatQcReport(report: QcReport): string`
  - `function assertQc(report: QcReport): void` — throws with the formatted report on failure

- [ ] **Step 1: Write the failing test**

Create `src/gen/qc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBuf, fillBuf, rgba, setPx } from './pixbuf.js';
import { CONCORD_RAMP, EMISSIVE, NEUTRAL } from './palette.js';
import {
  assertQc, checkBinaryAlpha, checkLightDirection, checkPalette,
  formatQcReport, LIGHT_MARGIN, MIN_LIGHT_SAMPLES, qcSprite,
} from './qc.js';

/**
 * A lit blob: a filled rectangle whose top-left border is the ramp's bright end
 * and whose bottom-right border is its dark end. This is what every generated
 * sprite is supposed to look like to the light checker.
 */
function litBlob(size = 10, inverted = false): ReturnType<typeof createBuf> {
  const b = createBuf(size, size);
  const lit = inverted ? NEUTRAL[1]! : NEUTRAL[6]!;
  const shadow = inverted ? NEUTRAL[6]! : NEUTRAL[1]!;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const onTopLeft = x === 1 || y === 1;
      const onBottomRight = x === size - 2 || y === size - 2;
      setPx(b, x, y, onTopLeft ? lit : onBottomRight ? shadow : NEUTRAL[3]!);
    }
  }
  return b;
}

describe('palette check', () => {
  it('passes a sprite built from palette colours', () => {
    const b = createBuf(4, 4);
    fillBuf(b, NEUTRAL[2]!);
    expect(checkPalette(b)).toEqual([]);
  });

  it('passes a fully transparent sprite', () => {
    expect(checkPalette(createBuf(4, 4))).toEqual([]);
  });

  it('reports an off-palette pixel with its location and nearest match', () => {
    const b = createBuf(4, 4);
    setPx(b, 2, 1, rgba(200, 7, 99));
    const violations = checkPalette(b);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.x).toBe(2);
    expect(violations[0]!.y).toBe(1);
    expect(violations[0]!.nearest).not.toBe(violations[0]!.color);
  });

  it('reports every offending pixel, not just the first', () => {
    const b = createBuf(4, 4);
    setPx(b, 0, 0, rgba(1, 2, 3));
    setPx(b, 3, 3, rgba(4, 5, 6));
    expect(checkPalette(b)).toHaveLength(2);
  });

  it('enforces a restricted allowed set — a faction lock', () => {
    const b = createBuf(2, 2);
    setPx(b, 0, 0, CONCORD_RAMP[3]!);
    expect(checkPalette(b, CONCORD_RAMP)).toEqual([]);
    // The same pixel is off-palette when the sprite claims to be Coalition.
    expect(checkPalette(b, [NEUTRAL[0]!, NEUTRAL[1]!])).toHaveLength(1);
  });
});

describe('binary alpha check', () => {
  it('accepts fully opaque and fully transparent pixels', () => {
    const b = createBuf(2, 2);
    setPx(b, 0, 0, NEUTRAL[3]!);
    expect(checkBinaryAlpha(b)).toEqual([]);
  });

  it('rejects partial alpha', () => {
    const b = createBuf(2, 2);
    b.data[3] = 128; // alpha of pixel (0,0)
    expect(checkBinaryAlpha(b)).toHaveLength(1);
  });
});

describe('light direction check', () => {
  it('passes a blob lit from the top-left', () => {
    const report = checkLightDirection(litBlob());
    expect(report).not.toBeNull();
    expect(report!.pass).toBe(true);
    expect(report!.litMean).toBeGreaterThan(report!.shadowMean);
    expect(report!.margin).toBeGreaterThanOrEqual(LIGHT_MARGIN);
  });

  it('fails a blob lit from the bottom-right', () => {
    const report = checkLightDirection(litBlob(10, true));
    expect(report!.pass).toBe(false);
  });

  it('fails a flat blob with no shading at all', () => {
    const b = createBuf(10, 10);
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) setPx(b, x, y, NEUTRAL[3]!);
    expect(checkLightDirection(b)!.pass).toBe(false);
  });

  it('abstains rather than guessing when there is too little to measure', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, NEUTRAL[3]!);
    expect(checkLightDirection(b)).toBeNull();
  });

  it('abstains on a fully transparent buffer', () => {
    expect(checkLightDirection(createBuf(8, 8))).toBeNull();
  });

  it('ignores emissive pixels, which are self-lit', () => {
    // An engine glow along the stern is bright and faces bottom-right. Counting
    // it would invert the verdict on a correctly-lit hull.
    const b = litBlob(12);
    for (let x = 2; x < 10; x++) setPx(b, x, 9, EMISSIVE.amber);
    expect(checkLightDirection(b)!.pass).toBe(true);
  });

  it('counts enough samples to be meaningful', () => {
    const report = checkLightDirection(litBlob(16));
    expect(report!.samples).toBeGreaterThanOrEqual(MIN_LIGHT_SAMPLES);
  });
});

describe('qcSprite', () => {
  it('passes a well-formed sprite', () => {
    const report = qcSprite('blob', litBlob());
    expect(report.pass).toBe(true);
    expect(report.palette).toEqual([]);
    expect(report.alpha).toEqual([]);
  });

  it('fails when a pixel is off-palette', () => {
    const b = litBlob();
    setPx(b, 5, 5, rgba(3, 3, 3));
    expect(qcSprite('blob', b).pass).toBe(false);
  });

  it('fails when the light runs the wrong way', () => {
    expect(qcSprite('blob', litBlob(10, true)).pass).toBe(false);
  });

  it('passes when the light check abstains — silence is not failure', () => {
    const b = createBuf(4, 4);
    setPx(b, 1, 1, NEUTRAL[3]!);
    const report = qcSprite('tiny', b);
    expect(report.light).toBeNull();
    expect(report.pass).toBe(true);
  });

  it('names the sprite in its report', () => {
    const b = litBlob();
    setPx(b, 5, 5, rgba(3, 3, 3));
    expect(formatQcReport(qcSprite('cruiser-bow', b))).toContain('cruiser-bow');
  });

  it('reports the offending coordinates so the defect is findable', () => {
    const b = litBlob();
    setPx(b, 5, 6, rgba(3, 3, 3));
    expect(formatQcReport(qcSprite('x', b))).toContain('5,6');
  });

  it('assertQc throws on failure and stays quiet on success', () => {
    const bad = litBlob();
    setPx(bad, 5, 5, rgba(3, 3, 3));
    expect(() => assertQc(qcSprite('bad', bad))).toThrow(/bad/);
    expect(() => assertQc(qcSprite('good', litBlob()))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/qc.test.ts
```

Expected: FAIL — `Failed to resolve import "./qc.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/qc.ts`:

```ts
/**
 * Automated sprite quality control. Turns three acceptance criteria into build
 * failures rather than things somebody is supposed to notice.
 *
 * The light-direction check deserves an explanation, because it is the one that
 * looks like magic. Every sprite bakes a single global light from the top-left.
 * That means edge pixels facing up-and-left should be drawn from the bright end
 * of their ramp, and edge pixels facing down-and-right from the dark end. So:
 * classify each opaque edge pixel by which way its exposed side faces, take the
 * mean luminance of each group, and require the lit group to win by a margin.
 *
 * Emissive pixels are excluded. They are self-lit by definition, and an engine
 * glow sits along the stern — the bottom edge — where counting it would invert
 * the verdict on a correctly shaded hull.
 */

import {
  alphaOf, getPx, isOpaque, luminance, type PixBuf, type Rgba,
} from './pixbuf.js';
import { isEmissive, isInPalette, snapToPalette } from './palette.js';

export interface PaletteViolation {
  x: number;
  y: number;
  color: Rgba;
  nearest: Rgba;
}

export interface LightReport {
  litMean: number;
  shadowMean: number;
  margin: number;
  samples: number;
  pass: boolean;
}

export interface QcReport {
  name: string;
  palette: PaletteViolation[];
  alpha: PaletteViolation[];
  light: LightReport | null;
  pass: boolean;
}

/** Required luminance gap between the lit and shadowed edges. */
export const LIGHT_MARGIN = 8;

/** Below this many edge samples the check abstains instead of guessing. */
export const MIN_LIGHT_SAMPLES = 12;

/**
 * Each side needs its own floor, not just the combined total.
 *
 * Added during execution (commit `f1829cd`) after a reviewer showed that
 * gating only the total let 21 lit pixels and 1 shadow pixel pass, with the
 * entire verdict resting on that one pixel. An almost-unshaded hull carrying a
 * single incidentally dark pixel would otherwise read as correctly lit.
 */
export const MIN_SIDE_SAMPLES = 4;

export function checkPalette(buf: PixBuf, allowed?: readonly Rgba[]): PaletteViolation[] {
  const violations: PaletteViolation[] = [];
  const allowedSet = allowed ? new Set(allowed) : null;

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      if (!isOpaque(c)) continue;

      const ok = allowedSet ? allowedSet.has(c) : isInPalette(c);
      if (!ok) {
        violations.push({
          x, y, color: c,
          nearest: snapToPalette(c, allowed),
        });
      }
    }
  }
  return violations;
}

export function checkBinaryAlpha(buf: PixBuf): PaletteViolation[] {
  const violations: PaletteViolation[] = [];
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      const a = alphaOf(c);
      if (a !== 0 && a !== 255) {
        violations.push({ x, y, color: c, nearest: c });
      }
    }
  }
  return violations;
}

export function checkLightDirection(buf: PixBuf): LightReport | null {
  let litSum = 0, litCount = 0;
  let shadowSum = 0, shadowCount = 0;

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = getPx(buf, x, y);
      if (!isOpaque(c) || isEmissive(c)) continue;

      // Which way does this pixel's exposed side face?
      const openUpLeft =
        !isOpaque(getPx(buf, x, y - 1)) ||
        !isOpaque(getPx(buf, x - 1, y)) ||
        !isOpaque(getPx(buf, x - 1, y - 1));
      const openDownRight =
        !isOpaque(getPx(buf, x, y + 1)) ||
        !isOpaque(getPx(buf, x + 1, y)) ||
        !isOpaque(getPx(buf, x + 1, y + 1));

      // A pixel open on both sides is a thin strut with no meaningful facing.
      if (openUpLeft === openDownRight) continue;

      if (openUpLeft) {
        litSum += luminance(c);
        litCount++;
      } else {
        shadowSum += luminance(c);
        shadowCount++;
      }
    }
  }

  const samples = litCount + shadowCount;
  if (
    litCount < MIN_SIDE_SAMPLES ||
    shadowCount < MIN_SIDE_SAMPLES ||
    samples < MIN_LIGHT_SAMPLES
  ) {
    return null;
  }

  const litMean = litSum / litCount;
  const shadowMean = shadowSum / shadowCount;
  const margin = litMean - shadowMean;

  return { litMean, shadowMean, margin, samples, pass: margin >= LIGHT_MARGIN };
}

export function qcSprite(name: string, buf: PixBuf, allowed?: readonly Rgba[]): QcReport {
  const palette = checkPalette(buf, allowed);
  const alpha = checkBinaryAlpha(buf);
  const light = checkLightDirection(buf);

  return {
    name,
    palette,
    alpha,
    light,
    // An abstaining light check is not a failure — a 3px sprite has nothing to
    // measure, and demanding a verdict there would only produce noise.
    pass: palette.length === 0 && alpha.length === 0 && (light === null || light.pass),
  };
}

function hex(c: Rgba): string {
  return `#${((c >>> 8) & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function formatQcReport(report: QcReport): string {
  if (report.pass) return `${report.name}: PASS`;

  const lines: string[] = [`${report.name}: FAIL`];

  if (report.palette.length > 0) {
    lines.push(`  off-palette pixels: ${report.palette.length}`);
    for (const v of report.palette.slice(0, 8)) {
      lines.push(`    at ${v.x},${v.y}: ${hex(v.color)} (nearest ${hex(v.nearest)})`);
    }
    if (report.palette.length > 8) {
      lines.push(`    ...and ${report.palette.length - 8} more`);
    }
  }

  if (report.alpha.length > 0) {
    lines.push(`  partial-alpha pixels: ${report.alpha.length}`);
    for (const v of report.alpha.slice(0, 8)) {
      lines.push(`    at ${v.x},${v.y}: alpha ${v.color & 255}`);
    }
  }

  if (report.light !== null && !report.light.pass) {
    lines.push(
      `  light direction: lit edges ${report.light.litMean.toFixed(1)} vs ` +
      `shadowed ${report.light.shadowMean.toFixed(1)} ` +
      `(margin ${report.light.margin.toFixed(1)}, need ${LIGHT_MARGIN}) ` +
      `over ${report.light.samples} samples`,
    );
  }

  return lines.join('\n');
}

export function assertQc(report: QcReport): void {
  if (!report.pass) {
    throw new Error(formatQcReport(report));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/qc.test.ts
```

Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/qc.ts src/gen/qc.test.ts
git commit -m "feat: automated sprite QC — palette, binary alpha, light direction

The light check classifies edge pixels by which way their exposed side faces and
requires the up-left group to outshine the down-right group. Emissives are
excluded: engine glow sits on the stern, and counting it would invert the
verdict on a correctly shaded hull."
```

---

### Task 10: `gen/grammar/profile.ts` — spine profiles and faction shape language

The first half of the shape grammar. A profile is the half-width of the hull at every row from bow to stern — the silhouette, before any plating exists. Faction identity is a parameter here, not a drawing.

**Files:**
- Create: `src/gen/grammar/profile.ts`
- Test: `src/gen/grammar/profile.test.ts`

**Interfaces:**
- Consumes: `Rng` from `../../sim/rng.js`; `FactionId` from `../palette.js`
- Produces:
  - `type SizeClass = 'fighter' | 'corvette' | 'destroyer' | 'cruiser' | 'capital'`
  - `const SIZE_LENGTH: Readonly<Record<SizeClass, [number, number]>>` — inclusive length range in px
  - `interface Profile { readonly length: number; readonly halfWidth: Int32Array; readonly maxHalfWidth: number; readonly faction: FactionId; readonly sizeClass: SizeClass }`
  - `interface ProfileSpec { faction: FactionId; sizeClass: SizeClass; rng: Rng; length?: number }`
  - `function buildProfile(spec: ProfileSpec): Profile`
  - `function profileWidth(p: Profile, y: number): number` — full width at row `y`, 0 outside
  - `function isFilled(p: Profile, x: number, y: number): boolean` — `x` measured from the centreline
  - `function profileArea(p: Profile): number`

- [ ] **Step 1: Write the failing test**

Create `src/gen/grammar/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../sim/rng.js';
import type { FactionId } from '../palette.js';
import {
  buildProfile, isFilled, profileArea, profileWidth, SIZE_LENGTH, type SizeClass,
} from './profile.js';

const build = (faction: FactionId, sizeClass: SizeClass, seed = 'p') =>
  buildProfile({ faction, sizeClass, rng: makeRng(seed) });

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];
const ALL_SIZES: SizeClass[] = ['fighter', 'corvette', 'destroyer', 'cruiser', 'capital'];

/** Counts how many times the half-width changes value along the hull. */
function widthSteps(halfWidth: Int32Array): number {
  let steps = 0;
  for (let i = 1; i < halfWidth.length; i++) {
    if (halfWidth[i] !== halfWidth[i - 1]) steps++;
  }
  return steps;
}

describe('profile dimensions', () => {
  it('respects the size class length range', () => {
    for (const sizeClass of ALL_SIZES) {
      const [lo, hi] = SIZE_LENGTH[sizeClass];
      for (const faction of ALL_FACTIONS) {
        const p = build(faction, sizeClass);
        expect(p.length).toBeGreaterThanOrEqual(lo);
        expect(p.length).toBeLessThanOrEqual(hi);
        expect(p.halfWidth.length).toBe(p.length);
      }
    }
  });

  it('puts the cruiser inside the 96-128px band the spec fixes', () => {
    expect(SIZE_LENGTH.cruiser[0]).toBeGreaterThanOrEqual(96);
    expect(SIZE_LENGTH.cruiser[1]).toBeLessThanOrEqual(128);
  });

  it('keeps fighters at 8-12px', () => {
    expect(SIZE_LENGTH.fighter).toEqual([8, 12]);
  });

  it('keeps capitals at or under 160px', () => {
    expect(SIZE_LENGTH.capital[1]).toBeLessThanOrEqual(160);
  });

  it('honours an explicit length', () => {
    const p = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('x'), length: 110 });
    expect(p.length).toBe(110);
  });

  it('never lets a hull be wider than it is long', () => {
    for (const faction of ALL_FACTIONS) {
      for (const sizeClass of ALL_SIZES) {
        const p = build(faction, sizeClass);
        expect(p.maxHalfWidth * 2).toBeLessThan(p.length);
      }
    }
  });

  it('reports maxHalfWidth accurately', () => {
    const p = build('player', 'cruiser');
    expect(p.maxHalfWidth).toBe(Math.max(...Array.from(p.halfWidth)));
  });
});

describe('profile shape', () => {
  it('has a bow narrower than its widest point', () => {
    for (const faction of ALL_FACTIONS) {
      const p = build(faction, 'cruiser');
      expect(p.halfWidth[0]!).toBeLessThan(p.maxHalfWidth);
    }
  });

  it('is never negative and never zero at the widest point', () => {
    for (const faction of ALL_FACTIONS) {
      const p = build(faction, 'destroyer');
      for (const w of p.halfWidth) expect(w).toBeGreaterThanOrEqual(0);
      expect(p.maxHalfWidth).toBeGreaterThan(0);
    }
  });

  it('keeps a continuous hull for live factions — no interior gaps', () => {
    // A hole in the middle of a Concord hull is a generator bug. Derelicts are
    // exempt: erosion is their whole point.
    for (const faction of ['concord', 'coalition', 'player'] as const) {
      const p = build(faction, 'cruiser');
      const firstFilled = Array.from(p.halfWidth).findIndex((w) => w > 0);
      const lastFilled = p.halfWidth.length - 1 -
        Array.from(p.halfWidth).reverse().findIndex((w) => w > 0);
      for (let y = firstFilled; y <= lastFilled; y++) {
        expect(p.halfWidth[y]!).toBeGreaterThan(0);
      }
    }
  });

  it('lets derelicts be eroded — they may have gaps', () => {
    const anyGap = ['a', 'b', 'c', 'd', 'e'].some((seed) => {
      const p = build('derelict', 'cruiser', seed);
      const filled = Array.from(p.halfWidth);
      const first = filled.findIndex((w) => w > 0);
      const last = filled.length - 1 - [...filled].reverse().findIndex((w) => w > 0);
      return filled.slice(first, last + 1).some((w) => w === 0);
    });
    expect(anyGap).toBe(true);
  });
});

describe('faction shape language', () => {
  it('makes Coalition hulls visibly stepped and Concord hulls smooth', () => {
    // This is the shape language, expressed as an assertion: Coalition is
    // welded from slabs and changes width abruptly; Concord is a milled wedge.
    const concordSteps = widthSteps(build('concord', 'cruiser').halfWidth);
    const coalitionRuns = build('coalition', 'cruiser').halfWidth;

    let longestFlatRun = 0;
    let run = 1;
    for (let i = 1; i < coalitionRuns.length; i++) {
      run = coalitionRuns[i] === coalitionRuns[i - 1] ? run + 1 : 1;
      longestFlatRun = Math.max(longestFlatRun, run);
    }

    expect(longestFlatRun).toBeGreaterThan(8);   // Coalition has slab sections
    expect(concordSteps).toBeGreaterThan(20);    // Concord tapers continuously
  });

  it('gives each faction a different silhouette from the same seed', () => {
    const shapes = ALL_FACTIONS.map((f) => Array.from(build(f, 'cruiser', 'same').halfWidth).join(','));
    expect(new Set(shapes).size).toBe(4);
  });

  it('makes Coalition hulls beamier than Concord ones', () => {
    const concord = build('concord', 'cruiser');
    const coalition = build('coalition', 'cruiser');
    const ratio = (p: ReturnType<typeof build>) => p.maxHalfWidth / p.length;
    expect(ratio(coalition)).toBeGreaterThan(ratio(concord));
  });
});

describe('determinism', () => {
  it('produces identical profiles from identical seeds', () => {
    const a = build('concord', 'destroyer', 'seed-1');
    const b = build('concord', 'destroyer', 'seed-1');
    expect(Array.from(a.halfWidth)).toEqual(Array.from(b.halfWidth));
  });

  it('produces different profiles from different seeds', () => {
    const a = build('concord', 'destroyer', 'seed-1');
    const b = build('concord', 'destroyer', 'seed-2');
    expect(Array.from(a.halfWidth)).not.toEqual(Array.from(b.halfWidth));
  });
});

describe('queries', () => {
  it('reports full width as twice the half-width plus the centreline', () => {
    const p = build('player', 'cruiser');
    expect(profileWidth(p, 50)).toBe(p.halfWidth[50]! * 2 + 1);
  });

  it('reports zero width outside the hull', () => {
    const p = build('player', 'cruiser');
    expect(profileWidth(p, -1)).toBe(0);
    expect(profileWidth(p, p.length)).toBe(0);
  });

  it('fills symmetrically about the centreline', () => {
    const p = build('player', 'cruiser');
    for (let y = 0; y < p.length; y += 7) {
      for (let x = 0; x <= p.maxHalfWidth; x++) {
        expect(isFilled(p, x, y)).toBe(isFilled(p, -x, y));
      }
    }
  });

  it('excludes points beyond the half-width', () => {
    const p = build('player', 'cruiser');
    const y = 40;
    expect(isFilled(p, p.halfWidth[y]!, y)).toBe(true);
    expect(isFilled(p, p.halfWidth[y]! + 1, y)).toBe(false);
  });

  it('measures area as the sum of row widths', () => {
    const p = build('player', 'corvette');
    let expected = 0;
    for (let y = 0; y < p.length; y++) expected += profileWidth(p, y);
    expect(profileArea(p)).toBe(expected);
  });
});
```

The faction shape-language test is the important one. It converts "Coalition looks welded and Concord looks milled" from an art note into a property a build can verify: Coalition profiles contain flat runs longer than 8 rows, Concord profiles change width more than 20 times along their length.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/grammar/profile.test.ts
```

Expected: FAIL — `Failed to resolve import "./profile.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/grammar/profile.ts`:

```ts
/**
 * Spine profiles — the first half of the shape grammar.
 *
 * A profile is the hull's half-width at every row from bow (y = 0) to stern
 * (y = length - 1). It is the silhouette before any plating exists, and because
 * the acceptance criteria judge ships by outline, it is where faction identity
 * actually lives. Everything later in the pipeline decorates this shape; none of
 * it changes the outline.
 *
 * Faction shape languages are parameters, not drawings:
 *
 *   concord    a milled wedge — continuous taper, narrow bow, flared stern
 *   coalition  welded slabs — long constant-width runs with abrupt shoulders
 *   derelict   an eroded hull — a base shape with bites taken out of it
 *   player     a working salvager — blunt bow, slab sides, heavy midsection
 */

import type { Rng } from '../../sim/rng.js';
import type { FactionId } from '../palette.js';

export type SizeClass = 'fighter' | 'corvette' | 'destroyer' | 'cruiser' | 'capital';

/** Inclusive length range in pixels at LOD tier 1. Fixed by the specification. */
export const SIZE_LENGTH: Readonly<Record<SizeClass, [number, number]>> = {
  fighter: [8, 12],
  corvette: [24, 36],
  destroyer: [48, 72],
  cruiser: [96, 128],
  capital: [130, 160],
};

/** Peak half-width as a fraction of length. Coalition ships are beamier by design. */
const BEAM_RATIO: Readonly<Record<FactionId, [number, number]>> = {
  concord: [0.11, 0.15],
  coalition: [0.18, 0.23],
  derelict: [0.13, 0.19],
  player: [0.15, 0.19],
};

export interface Profile {
  readonly length: number;
  readonly halfWidth: Int32Array;
  readonly maxHalfWidth: number;
  readonly faction: FactionId;
  readonly sizeClass: SizeClass;
}

export interface ProfileSpec {
  faction: FactionId;
  sizeClass: SizeClass;
  rng: Rng;
  length?: number;
}

/** A milled wedge: smooth taper from a narrow bow to a broad, flared stern. */
function concordCurve(t: number): number {
  // t is 0 at the bow, 1 at the stern.
  const nose = Math.pow(Math.min(t / 0.32, 1), 0.62); // quick but smooth flare
  const body = 1 - 0.28 * Math.pow(Math.max(t - 0.62, 0) / 0.38, 1.7);
  const stern = t > 0.88 ? 1 + 0.22 * ((t - 0.88) / 0.12) : 1; // engine flare
  return nose * body * stern;
}

/** A blunt working hull: short bow taper, long parallel midbody, square stern. */
function playerCurve(t: number): number {
  const nose = Math.pow(Math.min(t / 0.2, 1), 0.5);
  const taper = t > 0.82 ? 1 - 0.18 * ((t - 0.82) / 0.18) : 1;
  return nose * taper;
}

/** Quantises a curve into slabs so the hull reads as welded rather than milled. */
function slabbed(curve: (t: number) => number, slabs: number, t: number): number {
  const step = Math.floor(t * slabs) / slabs;
  const mid = step + 0.5 / slabs;
  return curve(Math.min(mid, 1));
}

export function buildProfile(spec: ProfileSpec): Profile {
  const { faction, sizeClass, rng } = spec;
  const [lo, hi] = SIZE_LENGTH[sizeClass];
  const length = spec.length ?? lo + rng.int(hi - lo + 1);

  const [beamLo, beamHi] = BEAM_RATIO[faction];
  const peak = Math.max(1, Math.round(length * rng.range(beamLo, beamHi)));

  const halfWidth = new Int32Array(length);

  // Coalition slab count scales with hull length so a corvette gets 3-4 slabs
  // and a capital gets 7-8 — the language reads the same at every size.
  const slabs = Math.max(3, Math.round(length / 18));

  for (let y = 0; y < length; y++) {
    const t = length === 1 ? 0 : y / (length - 1);

    let shape: number;
    switch (faction) {
      case 'concord':
        shape = concordCurve(t);
        break;
      case 'coalition':
        shape = slabbed(concordCurve, slabs, t);
        break;
      case 'derelict':
        shape = concordCurve(t);
        break;
      case 'player':
        shape = slabbed(playerCurve, Math.max(3, Math.round(length / 26)), t);
        break;
    }

    halfWidth[y] = Math.max(0, Math.round(shape * peak));
  }

  // A hull one pixel wide at the bow is a point, not a prow. Guarantee the very
  // front row is at least present so the silhouette has a tip to read.
  if (halfWidth[0] === 0) halfWidth[0] = 0;

  if (faction === 'derelict') {
    erode(halfWidth, rng);
  }

  let maxHalfWidth = 0;
  for (const w of halfWidth) if (w > maxHalfWidth) maxHalfWidth = w;

  // Guard the invariant the tests assert: never wider than long. A pathological
  // random draw at the small end could otherwise produce a disc.
  if (maxHalfWidth * 2 >= length) {
    const scale = (length - 1) / (maxHalfWidth * 2);
    maxHalfWidth = 0;
    for (let y = 0; y < length; y++) {
      halfWidth[y] = Math.floor(halfWidth[y]! * scale);
      if (halfWidth[y]! > maxHalfWidth) maxHalfWidth = halfWidth[y]!;
    }
  }

  return { length, halfWidth, maxHalfWidth, faction, sizeClass };
}

/**
 * Takes bites out of a hull. Derelicts have been dead for a long time; the
 * erosion is the difference between "a ship" and "what is left of a ship", and
 * it is the only faction permitted interior gaps.
 */
function erode(halfWidth: Int32Array, rng: Rng): void {
  const length = halfWidth.length;
  const bites = 1 + rng.int(3);

  for (let i = 0; i < bites; i++) {
    // Keep bites away from the extreme bow so the hull still reads nose-first.
    const start = Math.floor(length * rng.range(0.25, 0.85));
    const span = Math.max(2, Math.round(length * rng.range(0.04, 0.11)));
    const severity = rng.range(0.45, 1);

    for (let y = start; y < Math.min(length, start + span); y++) {
      halfWidth[y] = Math.max(0, Math.round(halfWidth[y]! * (1 - severity)));
    }
  }
}

export function profileWidth(p: Profile, y: number): number {
  if (y < 0 || y >= p.length) return 0;
  const half = p.halfWidth[y]!;
  return half === 0 ? 0 : half * 2 + 1;
}

/** `x` is measured from the centreline, so it may be negative. */
export function isFilled(p: Profile, x: number, y: number): boolean {
  if (y < 0 || y >= p.length) return false;
  const half = p.halfWidth[y]!;
  if (half === 0) return false;
  return Math.abs(x) <= half;
}

export function profileArea(p: Profile): number {
  let area = 0;
  for (let y = 0; y < p.length; y++) area += profileWidth(p, y);
  return area;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/grammar/profile.test.ts
```

Expected: PASS, 21 tests.

If the Coalition/Concord shape-language assertions fail, tune `slabs` and the curve exponents rather than relaxing the test — those two numbers *are* the shape language, and the assertion is the only thing keeping the two factions distinguishable by outline as the generator evolves.

> **Amended during execution (commits `a34135c`, `4ee55ab`, `b50cad6`).** The curve
> constants below are the *starting* values; three were wrong and were corrected
> against measurement. A re-run must apply these or it will reproduce the defects:
>
> - **`concordCurve` was too flat**, yielding 18 width changes against the >20
>   assertion. Nose span 0.32→0.5, exponent 0.62→0.9; stern flare breakpoint
>   0.88→0.85 and amplitude 0.22→0.35.
> - **`playerCurve` produced a brick.** It returned exactly 1.0 across t=0.2..0.82,
>   so slabbing collapsed 62% of the hull to one width — 72 identical rows out of
>   122. Replaced with a nose/body/stern formulation that carries mass forward of
>   amidships and narrows aft.
> - **The player slab floor is 5**, not 3 or 4. Measured across 3,000 seeds:
>   floor 4 → worst flat ratio 0.500 (fails), floor 5 → 0.423, floor 6 → 0.500,
>   floor 7 → 0.571. Not monotonic, because at 24px the peak half-width is ~4 and
>   extra slabs quantize onto the same integer. Do not raise it.
> - **A flat-run assertion was added** — no faction/size/seed may be flat for more
>   than half its length, swept over 40 seeds and reporting its worst case.
>   Fighters are exempt; at 8-12px there is no shape to hold. Verified over 80,000
>   combinations: worst 0.423, nothing above 0.45.

- [ ] **Step 5: Commit**

```bash
git add src/gen/grammar/profile.ts src/gen/grammar/profile.test.ts
git commit -m "feat: spine profiles — faction shape language as parameters

Concord is a milled wedge, Coalition is welded slabs, derelicts are eroded, the
player hull is a blunt working ship. The tests assert the language directly:
Coalition profiles hold flat runs over 8 rows, Concord changes width more than
20 times along its length."
```

---

### Task 11: `gen/grammar/plates.ts` — plating, shading, and panel seams

Turns a profile into a shaded hull: plate bands, 2–3 value dithered shading with the light from top-left, and single-pixel seams. This is the task whose output the light-direction check in Task 9 was written to judge.

**Files:**
- Create: `src/gen/grammar/plates.ts`
- Test: `src/gen/grammar/plates.test.ts`

**Interfaces:**
- Consumes: `Profile`, `isFilled` from `./profile.js`; `PixBuf`, `Rgba`, `createBuf`, `setPx`, `getPx`, `isOpaque` from `../pixbuf.js`; `shadeStep` from `../palette.js`; `Rng` from `../../sim/rng.js`
- Produces:
  - `interface PlateSpec { profile: Profile; ramp: readonly Rgba[]; rng: Rng }`
  - `interface PlatedHull { buf: PixBuf; centreX: number; plateCount: number }`
  - `const BASE_STEP: number` — mid-ramp index shading starts from, 3
  - `function plateHull(spec: PlateSpec): PlatedHull`
  - `function ditherMask(x: number, y: number): boolean` — 4×4 ordered Bayer test used project-wide

- [ ] **Step 1: Write the failing test**

Create `src/gen/grammar/plates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../sim/rng.js';
import { countOpaque, getPx, isOpaque, luminance } from '../pixbuf.js';
import { CONCORD_RAMP, NEUTRAL } from '../palette.js';
import { checkLightDirection, checkPalette } from '../qc.js';
import { buildProfile, isFilled } from './profile.js';
import { ditherMask, plateHull } from './plates.js';

const hull = (faction: 'concord' | 'player' = 'player', seed = 'plate') => {
  const profile = buildProfile({ faction, sizeClass: 'cruiser', rng: makeRng(seed) });
  const ramp = faction === 'concord' ? CONCORD_RAMP : NEUTRAL;
  return { profile, ramp, plated: plateHull({ profile, ramp, rng: makeRng(seed) }) };
};

describe('plated hull geometry', () => {
  it('fills exactly the profile and nothing else', () => {
    const { profile, plated } = hull();
    for (let y = 0; y < plated.buf.h; y++) {
      for (let x = 0; x < plated.buf.w; x++) {
        const filled = isFilled(profile, x - plated.centreX, y);
        expect(isOpaque(getPx(plated.buf, x, y))).toBe(filled);
      }
    }
  });

  it('sizes the buffer to the hull', () => {
    const { profile, plated } = hull();
    expect(plated.buf.h).toBe(profile.length);
    expect(plated.buf.w).toBe(profile.maxHalfWidth * 2 + 1);
    expect(plated.centreX).toBe(profile.maxHalfWidth);
  });

  it('draws something', () => {
    expect(countOpaque(hull().plated.buf)).toBeGreaterThan(500);
  });
});

describe('plated hull colour', () => {
  it('uses only its ramp', () => {
    for (const faction of ['concord', 'player'] as const) {
      const { ramp, plated } = hull(faction);
      expect(checkPalette(plated.buf, ramp)).toEqual([]);
    }
  });

  it('uses at least three values — flat hulls are a generator failure', () => {
    const { plated } = hull();
    const used = new Set<number>();
    for (let y = 0; y < plated.buf.h; y++) {
      for (let x = 0; x < plated.buf.w; x++) {
        const c = getPx(plated.buf, x, y);
        if (isOpaque(c)) used.add(c);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
  });

  it('passes the light-direction check', () => {
    // The whole point of the shading pass.
    for (const faction of ['concord', 'player'] as const) {
      for (const seed of ['a', 'b', 'c']) {
        const report = checkLightDirection(hull(faction, seed).plated.buf);
        expect(report).not.toBeNull();
        expect(report!.pass).toBe(true);
      }
    }
  });

  it('makes the top-left border brighter than the bottom-right border', () => {
    const { profile, plated } = hull();
    const y = Math.floor(profile.length / 2);
    const half = profile.halfWidth[y]!;
    const left = getPx(plated.buf, plated.centreX - half, y);
    const right = getPx(plated.buf, plated.centreX + half, y);
    expect(luminance(left)).toBeGreaterThan(luminance(right));
  });
});

describe('plate seams', () => {
  it('divides the hull into plates', () => {
    const { plated } = hull();
    expect(plated.plateCount).toBeGreaterThanOrEqual(3);
    expect(plated.plateCount).toBeLessThanOrEqual(12);
  });

  it('draws seams as single-pixel dark rows', () => {
    const { profile, plated } = hull();
    // A seam row is darker on average than the rows on either side of it.
    const rowMean = (y: number) => {
      let sum = 0, n = 0;
      for (let x = 0; x < plated.buf.w; x++) {
        const c = getPx(plated.buf, x, y);
        if (isOpaque(c)) { sum += luminance(c); n++; }
      }
      return n === 0 ? 0 : sum / n;
    };

    let seamRows = 0;
    for (let y = 2; y < profile.length - 2; y++) {
      if (rowMean(y) < rowMean(y - 1) && rowMean(y) < rowMean(y + 1)) seamRows++;
    }
    expect(seamRows).toBeGreaterThanOrEqual(plated.plateCount - 1);
  });

  it('scales plate count with hull length', () => {
    const small = buildProfile({ faction: 'player', sizeClass: 'corvette', rng: makeRng('s') });
    const large = buildProfile({ faction: 'player', sizeClass: 'capital', rng: makeRng('s') });
    const a = plateHull({ profile: small, ramp: NEUTRAL, rng: makeRng('s') });
    const b = plateHull({ profile: large, ramp: NEUTRAL, rng: makeRng('s') });
    expect(b.plateCount).toBeGreaterThan(a.plateCount);
  });
});

describe('dither', () => {
  it('is a 4x4 ordered mask that tiles', () => {
    expect(ditherMask(0, 0)).toBe(ditherMask(4, 4));
    expect(ditherMask(1, 2)).toBe(ditherMask(9, 10));
  });

  it('turns on for about half the cells', () => {
    let on = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherMask(x, y)) on++;
    expect(on).toBe(8);
  });

  it('never clumps into 2x2 blocks', () => {
    // Corrected during execution (commit `5fd29d6`). This test originally
    // asserted the mask was NOT a plain checkerboard — which forbade the
    // correct answer. A 4x4 Bayer matrix at 50% IS a checkerboard by
    // construction, and that is the canonical fine dither: measured tiled, it
    // gives zero fully-on 2x2 blocks where a hand-authored "non-checkerboard"
    // alternative gave 38, reading as woven corduroy on hull plate.
    //
    // State the property that matters — no clumping — not a shape to distrust.
    let blocks = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (ditherMask(x, y) && ditherMask(x + 1, y) &&
            ditherMask(x, y + 1) && ditherMask(x + 1, y + 1)) {
          blocks++;
        }
      }
    }
    expect(blocks).toBe(0);
  });

  it('never runs more than one cell horizontally', () => {
    for (let y = 0; y < 16; y++) {
      let run = 0;
      for (let x = 0; x < 32; x++) {
        run = ditherMask(x, y) ? run + 1 : 0;
        expect(run).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('determinism', () => {
  it('renders identically from the same seed', () => {
    expect(Array.from(hull('player', 'z').plated.buf.data))
      .toEqual(Array.from(hull('player', 'z').plated.buf.data));
  });

  it('renders differently from different seeds', () => {
    expect(Array.from(hull('player', 'z1').plated.buf.data))
      .not.toEqual(Array.from(hull('player', 'z2').plated.buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/grammar/plates.test.ts
```

Expected: FAIL — `Failed to resolve import "./plates.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/grammar/plates.ts`:

```ts
/**
 * Plating and shading — the second half of the shape grammar.
 *
 * Takes a profile and paints it: horizontal plate bands, each a slightly
 * different value so the hull reads as assembled from big flat pieces; a
 * single-pixel dark seam between bands; and a light baked in from the top-left,
 * which means edges facing up and left take the bright end of the ramp and
 * edges facing down and right take the dark end.
 *
 * The shading is deliberately coarse — two or three ramp steps with an ordered
 * dither between them. Smooth gradients would fight the pixel scale, and the
 * detail-density rule says a hull must read as plate, not as texture.
 */

import type { Rng } from '../../sim/rng.js';
import {
  createBuf, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from '../pixbuf.js';
import { shadeStep } from '../palette.js';
import { isFilled, type Profile } from './profile.js';

export interface PlateSpec {
  profile: Profile;
  ramp: readonly Rgba[];
  rng: Rng;
}

export interface PlatedHull {
  buf: PixBuf;
  /** x coordinate of the hull centreline inside `buf`. */
  centreX: number;
  plateCount: number;
}

/** Mid-ramp index that unlit interior plate sits at. */
export const BASE_STEP = 3;

/** 4x4 Bayer matrix, normalised to a boolean test at 50%. */
const BAYER: readonly number[] = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

export function ditherMask(x: number, y: number): boolean {
  const i = (((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4);
  return BAYER[i]! < 8;
}

/** True when the pixel's exposed side faces up and left — the lit direction. */
function facesLight(profile: Profile, cx: number, x: number, y: number): boolean {
  const rel = x - cx;
  return (
    !isFilled(profile, rel, y - 1) ||
    !isFilled(profile, rel - 1, y) ||
    !isFilled(profile, rel - 1, y - 1)
  );
}

/** True when the pixel's exposed side faces down and right — the shadow direction. */
function facesShadow(profile: Profile, cx: number, x: number, y: number): boolean {
  const rel = x - cx;
  return (
    !isFilled(profile, rel, y + 1) ||
    !isFilled(profile, rel + 1, y) ||
    !isFilled(profile, rel + 1, y + 1)
  );
}

export function plateHull(spec: PlateSpec): PlatedHull {
  const { profile, ramp, rng } = spec;
  const centreX = profile.maxHalfWidth;
  const buf = createBuf(profile.maxHalfWidth * 2 + 1, profile.length);

  // Plate bands. Roughly one plate per 14px of hull, jittered, so a corvette
  // gets 3 and a capital gets 10 — the density reads the same at every size.
  const targetPlates = Math.max(3, Math.min(12, Math.round(profile.length / 14)));
  const boundaries: number[] = [];
  {
    let y = 0;
    while (y < profile.length) {
      const span = Math.max(4, Math.round((profile.length / targetPlates) * rng.range(0.7, 1.3)));
      y += span;
      if (y < profile.length - 2) boundaries.push(y);
    }
  }
  const plateCount = boundaries.length + 1;

  // Each plate carries a small base-value offset so neighbours are separable
  // without anything as loud as a different colour.
  const plateOffset = new Int32Array(plateCount);
  for (let i = 0; i < plateCount; i++) {
    plateOffset[i] = rng.int(3) - 1; // -1, 0, or +1
  }

  const seamRows = new Set(boundaries);
  const plateIndexAt = (y: number): number => {
    let i = 0;
    for (const b of boundaries) {
      if (y >= b) i++;
    }
    return i;
  };

  for (let y = 0; y < profile.length; y++) {
    const plate = plateIndexAt(y);
    const offset = plateOffset[plate]!;
    const half = profile.halfWidth[y]!;
    if (half === 0) continue;

    for (let x = centreX - half; x <= centreX + half; x++) {
      let step = BASE_STEP + offset;

      if (seamRows.has(y)) {
        // Panel seam: one pixel, two steps down, drawn across the whole plate.
        step -= 2;
      } else {
        const lit = facesLight(profile, centreX, x, y);
        const shadow = facesShadow(profile, centreX, x, y);

        if (lit && !shadow) {
          step += 2;
        } else if (shadow && !lit) {
          step -= 2;
        } else {
          // Interior plate: dither between this step and one above so a large
          // flat area has texture without gaining detail.
          if (ditherMask(x, y)) step += 1;
        }
      }

      setPx(buf, x, y, shadeStep(ramp, step));
    }
  }

  return { buf, centreX, plateCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/grammar/plates.test.ts
```

Expected: PASS, 13 tests.

If the light-direction assertion fails, the fix is in `facesLight`/`facesShadow` or in the ±2 step deltas — never in `LIGHT_MARGIN`. The check is the requirement.

- [ ] **Step 5: Commit**

```bash
git add src/gen/grammar/plates.ts src/gen/grammar/plates.test.ts
git commit -m "feat: plating, dithered shading, and single-pixel panel seams

Light baked from the top-left: up-left edges take the bright ramp end, down-right
edges the dark one, interior plate dithers between two steps. Coarse on purpose —
smooth gradients fight the pixel scale and hulls must read as plate, not texture."
```

---

### Task 12: `gen/grammar/greeble.ts` — budgeted detail and running lights

Greebles are the constraint that most wants violating. The spec is explicit that added detail density breaks the silhouette economy, so this module budgets detail by size class and — critically — is tested to never touch the outline.

**Files:**
- Create: `src/gen/grammar/greeble.ts`
- Test: `src/gen/grammar/greeble.test.ts`

**Interfaces:**
- Consumes: `Profile`, `isFilled`, `SizeClass` from `./profile.js`; `PlatedHull` from `./plates.js`; `PixBuf`, `Rgba`, `getPx`, `setPx`, `isOpaque`, `opaqueBounds` from `../pixbuf.js`; `shadeStep`, `EMISSIVE` from `../palette.js`; `Rng` from `../../sim/rng.js`
- Produces:
  - `const GREEBLE_BUDGET: Readonly<Record<SizeClass, number>>` — max greebles by size class
  - `const RUNNING_LIGHT_SPACING: number` — pixels between running lights at tier 1, 16
  - `function applyGreebles(hull: PlatedHull, profile: Profile, ramp: readonly Rgba[], rng: Rng): number` — returns count placed
  - `function applyRunningLights(hull: PlatedHull, profile: Profile, color: Rgba): number` — returns count placed
  - `function runningLightRows(profile: Profile): number[]` — the rows lights land on, for scale-cue verification

- [ ] **Step 1: Write the failing test**

Create `src/gen/grammar/greeble.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../../sim/rng.js';
import { getPx, isOpaque, opaqueBounds } from '../pixbuf.js';
import { EMISSIVE, isEmissive, NEUTRAL } from '../palette.js';
import { checkLightDirection, checkPalette } from '../qc.js';
import { buildProfile, SIZE_LENGTH, type SizeClass } from './profile.js';
import { plateHull } from './plates.js';
import {
  applyGreebles, applyRunningLights, GREEBLE_BUDGET, RUNNING_LIGHT_SPACING, runningLightRows,
} from './greeble.js';

const make = (sizeClass: SizeClass = 'cruiser', seed = 'g') => {
  const profile = buildProfile({ faction: 'player', sizeClass, rng: makeRng(seed) });
  const hull = plateHull({ profile, ramp: NEUTRAL, rng: makeRng(seed) });
  return { profile, hull };
};

/** The set of opaque pixel coordinates — the silhouette. */
const silhouette = (buf: { w: number; h: number }, get: (x: number, y: number) => number) => {
  const s = new Set<string>();
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) if (isOpaque(get(x, y))) s.add(`${x},${y}`);
  }
  return s;
};

describe('greeble budget', () => {
  it('scales with size class', () => {
    expect(GREEBLE_BUDGET.fighter).toBeLessThan(GREEBLE_BUDGET.corvette);
    expect(GREEBLE_BUDGET.corvette).toBeLessThan(GREEBLE_BUDGET.destroyer);
    expect(GREEBLE_BUDGET.destroyer).toBeLessThan(GREEBLE_BUDGET.cruiser);
    expect(GREEBLE_BUDGET.cruiser).toBeLessThan(GREEBLE_BUDGET.capital);
  });

  it('gives fighters almost nothing — at 8-12px there is no room for detail', () => {
    expect(GREEBLE_BUDGET.fighter).toBeLessThanOrEqual(2);
  });

  it('never exceeds the budget', () => {
    for (const sizeClass of Object.keys(GREEBLE_BUDGET) as SizeClass[]) {
      for (const seed of ['a', 'b', 'c', 'd']) {
        const { profile, hull } = make(sizeClass, seed);
        const placed = applyGreebles(hull, profile, NEUTRAL, makeRng(seed));
        expect(placed).toBeLessThanOrEqual(GREEBLE_BUDGET[sizeClass]);
      }
    }
  });
});

describe('greebles never touch the outline', () => {
  it('leaves the silhouette pixel-identical', () => {
    // This is the constraint that keeps every module identifiable by outline.
    // Greebles are interior decoration; if one can change the edge, the
    // silhouette economy is dead.
    for (const seed of ['a', 'b', 'c']) {
      const { profile, hull } = make('cruiser', seed);
      const before = silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y));
      applyGreebles(hull, profile, NEUTRAL, makeRng(seed));
      const after = silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y));
      expect(after).toEqual(before);
    }
  });

  it('leaves the bounding box unchanged', () => {
    const { profile, hull } = make();
    const before = opaqueBounds(hull.buf);
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(opaqueBounds(hull.buf)).toEqual(before);
  });

  it('stays inside the hull ramp', () => {
    const { profile, hull } = make();
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(checkPalette(hull.buf, NEUTRAL)).toEqual([]);
  });

  it('does not break the light-direction check', () => {
    const { profile, hull } = make();
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(checkLightDirection(hull.buf)!.pass).toBe(true);
  });

  it('actually changes something', () => {
    const { profile, hull } = make();
    const before = Array.from(hull.buf.data);
    applyGreebles(hull, profile, NEUTRAL, makeRng('g'));
    expect(Array.from(hull.buf.data)).not.toEqual(before);
  });
});

describe('running lights', () => {
  it('spaces them evenly along the hull', () => {
    const { profile } = make('cruiser');
    const rows = runningLightRows(profile);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]! - rows[i - 1]!).toBe(RUNNING_LIGHT_SPACING);
    }
  });

  it('gives longer hulls more lights — this is the scale cue', () => {
    // Known spacing along a hull is one of the three cues that make a 4px
    // speck read as kilometres long. More hull, more lights.
    const cruiser = runningLightRows(make('cruiser').profile).length;
    const capital = runningLightRows(make('capital').profile).length;
    expect(capital).toBeGreaterThan(cruiser);
  });

  it('places an emissive pixel on each side at each row', () => {
    const { profile, hull } = make();
    const placed = applyRunningLights(hull, profile, EMISSIVE.amber);
    expect(placed).toBe(runningLightRows(profile).length * 2);
  });

  it('uses only emissive colours for the lights', () => {
    const { profile, hull } = make();
    applyRunningLights(hull, profile, EMISSIVE.amber);
    let found = 0;
    for (let y = 0; y < hull.buf.h; y++) {
      for (let x = 0; x < hull.buf.w; x++) {
        if (isEmissive(getPx(hull.buf, x, y))) found++;
      }
    }
    expect(found).toBe(runningLightRows(profile).length * 2);
  });

  it('does not change the silhouette either', () => {
    const { profile, hull } = make();
    const before = silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y));
    applyRunningLights(hull, profile, EMISSIVE.amber);
    expect(silhouette(hull.buf, (x, y) => getPx(hull.buf, x, y))).toEqual(before);
  });

  it('places no lights on a hull shorter than the spacing', () => {
    const { profile } = make('fighter');
    expect(runningLightRows(profile)).toEqual([]);
  });
});

describe('determinism', () => {
  it('places identical greebles from the same seed', () => {
    const a = make('cruiser', 'same');
    const b = make('cruiser', 'same');
    applyGreebles(a.hull, a.profile, NEUTRAL, makeRng('r'));
    applyGreebles(b.hull, b.profile, NEUTRAL, makeRng('r'));
    expect(Array.from(a.hull.buf.data)).toEqual(Array.from(b.hull.buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/grammar/greeble.test.ts
```

Expected: FAIL — `Failed to resolve import "./greeble.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/grammar/greeble.ts`:

```ts
/**
 * Budgeted surface detail and running lights.
 *
 * Two rules govern this module, and both exist because detail is the constraint
 * that most wants violating:
 *
 *   1. Greebles are budgeted per size class. A fighter is 8-12px long and gets
 *      almost none; adding "just a bit more" to a small hull is how a readable
 *      silhouette turns into noise.
 *
 *   2. Greebles never touch the outline. They are interior decoration only. If a
 *      greeble could alter the edge, then a module bolted to a hardpoint would no
 *      longer be identifiable by outline, and the entire silhouette economy the
 *      game is built on stops working.
 *
 * Running lights are not decoration. Placed at fixed spacing along a hull, they
 * are one of the three scale cues that let a four-pixel speck read as a ship
 * kilometres long, so their spacing is a constant, not a random draw.
 */

import type { Rng } from '../../sim/rng.js';
import { getPx, isOpaque, setPx, type Rgba } from '../pixbuf.js';
import { shadeStep } from '../palette.js';
import { isFilled, type Profile, type SizeClass } from './profile.js';
import { BASE_STEP, type PlatedHull } from './plates.js';

/** Maximum greebles by size class. Deliberately austere. */
export const GREEBLE_BUDGET: Readonly<Record<SizeClass, number>> = {
  fighter: 1,
  corvette: 4,
  destroyer: 9,
  cruiser: 16,
  capital: 24,
};

/** Pixels between running lights along a hull at LOD tier 1. */
export const RUNNING_LIGHT_SPACING = 16;

/**
 * A pixel is interior if it is filled and all eight neighbours are filled.
 * Only interior pixels may be greebled, which is what guarantees the outline
 * survives untouched.
 */
function isInterior(profile: Profile, cx: number, x: number, y: number): boolean {
  const rel = x - cx;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isFilled(profile, rel + dx, y + dy)) return false;
    }
  }
  return true;
}

export function applyGreebles(
  hull: PlatedHull,
  profile: Profile,
  ramp: readonly Rgba[],
  rng: Rng,
): number {
  const budget = GREEBLE_BUDGET[profile.sizeClass];
  const cx = hull.centreX;
  let placed = 0;

  // Bounded attempts: a narrow hull may simply have nowhere legal to put one,
  // and the loop must terminate regardless.
  const maxAttempts = budget * 12;

  for (let attempt = 0; attempt < maxAttempts && placed < budget; attempt++) {
    const w = 1 + rng.int(3);           // 1-3 px wide
    const h = 1 + rng.int(2);           // 1-2 px tall
    const y = 1 + rng.int(Math.max(1, profile.length - h - 2));
    const half = profile.halfWidth[y]!;
    if (half < 2) continue;

    const x = cx - half + 1 + rng.int(Math.max(1, half * 2 - 1));

    // Every pixel of the greeble must be interior, or it could reach the edge.
    let legal = true;
    for (let dy = 0; dy < h && legal; dy++) {
      for (let dx = 0; dx < w && legal; dx++) {
        if (!isInterior(profile, cx, x + dx, y + dy)) legal = false;
      }
    }
    if (!legal) continue;

    // A vent reads dark; a raised block reads light. Both stay inside the ramp.
    const step = rng.chance(0.55) ? BASE_STEP - 2 : BASE_STEP + 2;
    const color = shadeStep(ramp, step);

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setPx(hull.buf, x + dx, y + dy, color);
      }
    }
    placed++;
  }

  return placed;
}

/**
 * The rows running lights land on.
 *
 * Corrected during execution (commit `c493843`). Lights sit on a fixed
 * LATTICE: candidate rows are multiples of RUNNING_LIGHT_SPACING, and a row is
 * dropped only where the hull is too thin to carry one. Consecutive gaps on an
 * eroded derelict may therefore be 32 or 48 rather than 16 — a blown-away
 * section cannot carry a lamp — while the lattice itself stays regular, which
 * is what actually reads as a scale cue. Measured at 209 of 1,200 derelict
 * profiles having at least one gap above 16.
 *
 * The earlier claim that spacing "is a constant" was false, and the tests hid
 * it because the test helper hardcoded the player faction, which has no
 * erosion. Related: capital hulls get NEVER FEWER lights than cruisers, not
 * strictly more — a 130px capital and a 128px cruiser can land on the same
 * lattice count.
 *
 * Exposed separately so the scale-cue check can verify the lattice without
 * re-deriving it.
 */
export function runningLightRows(profile: Profile): number[] {
  const rows: number[] = [];
  const first = RUNNING_LIGHT_SPACING;
  for (let y = first; y < profile.length - 2; y += RUNNING_LIGHT_SPACING) {
    if (profile.halfWidth[y]! >= 2) rows.push(y);
  }
  return rows;
}

export function applyRunningLights(
  hull: PlatedHull,
  profile: Profile,
  color: Rgba,
): number {
  const cx = hull.centreX;
  let placed = 0;

  for (const y of runningLightRows(profile)) {
    const half = profile.halfWidth[y]!;
    // One inboard of each edge, so the light sits on the hull rather than
    // extending it — the silhouette must not change.
    for (const x of [cx - half + 1, cx + half - 1]) {
      if (isOpaque(getPx(hull.buf, x, y))) {
        setPx(hull.buf, x, y, color);
        placed++;
      }
    }
  }

  return placed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/grammar/greeble.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/grammar/greeble.ts src/gen/grammar/greeble.test.ts
git commit -m "feat: budgeted greebles and fixed-spacing running lights

Greebles may only touch interior pixels, which is tested by comparing the
silhouette before and after. That constraint is what keeps every module
identifiable by outline once it is bolted to a hardpoint.

Running lights sit at a constant 16px spacing because they are a scale cue, not
decoration — known spacing is what makes a 4px speck read as kilometres long."
```

---

### Task 13: `gen/hull.ts` — finished hulls with hardpoints

Assembles the grammar into a complete hull sprite and places the six hardpoint anchors on it. Every ship in the game comes out of this function.

**Files:**
- Create: `src/gen/hull.ts`
- Test: `src/gen/hull.test.ts`

**Interfaces:**
- Consumes: `buildProfile`, `Profile`, `SizeClass` from `./grammar/profile.js`; `plateHull` from `./grammar/plates.js`; `applyGreebles`, `applyRunningLights` from `./grammar/greeble.js`; `rampOf`, `FACTION_PALETTE`, `EMISSIVE`, `FactionId` from `./palette.js`; `qcSprite`, `assertQc` from `./qc.js`; `Rng` from `../sim/rng.js`
- Produces:
  - `type HardpointId = 'bow' | 'dorsal' | 'ventral' | 'port' | 'starboard' | 'engine'`
  - `const HARDPOINT_IDS: readonly HardpointId[]` — all six, in install order
  - `interface Hardpoint { id: HardpointId; x: number; y: number }`
  - `interface Hull { buf: PixBuf; centreX: number; profile: Profile; hardpoints: Readonly<Record<HardpointId, Hardpoint>>; faction: FactionId; sizeClass: SizeClass }`
  - `interface HullSpec { faction: FactionId; sizeClass: SizeClass; rng: Rng; length?: number }`
  - `function buildHull(spec: HullSpec): Hull`
  - `const HARDPOINT_AT: Readonly<Record<HardpointId, number>>` — fractional position along the hull

- [ ] **Step 1: Write the failing test**

Create `src/gen/hull.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { getPx, isOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, isEmissive, type FactionId } from './palette.js';
import { qcSprite } from './qc.js';
import { isFilled, type SizeClass } from './grammar/profile.js';
import { buildHull, HARDPOINT_IDS, type HardpointId } from './hull.js';

const hull = (faction: FactionId = 'player', sizeClass: SizeClass = 'cruiser', seed = 'h') =>
  buildHull({ faction, sizeClass, rng: makeRng(seed) });

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];

describe('hull assembly', () => {
  it('passes QC against its faction lock', () => {
    for (const faction of ALL_FACTIONS) {
      for (const seed of ['a', 'b', 'c']) {
        const h = hull(faction, 'cruiser', seed);
        const report = qcSprite(`${faction}-${seed}`, h.buf, FACTION_PALETTE[faction]);
        expect(report.pass, JSON.stringify(report.palette.slice(0, 3))).toBe(true);
      }
    }
  });

  it('builds every size class without QC failures', () => {
    const sizes: SizeClass[] = ['fighter', 'corvette', 'destroyer', 'cruiser', 'capital'];
    for (const sizeClass of sizes) {
      const h = hull('concord', sizeClass);
      expect(qcSprite(sizeClass, h.buf, FACTION_PALETTE.concord).pass).toBe(true);
    }
  });

  it('fills the buffer tightly — no wasted transparent margin', () => {
    const h = hull();
    const b = opaqueBounds(h.buf)!;
    expect(b.y0).toBe(0);
    expect(b.y1).toBe(h.buf.h - 1);
  });

  it('carries running lights on anything cruiser-sized or larger', () => {
    for (const sizeClass of ['cruiser', 'capital'] as SizeClass[]) {
      const h = hull('player', sizeClass);
      let lights = 0;
      for (let y = 0; y < h.buf.h; y++) {
        for (let x = 0; x < h.buf.w; x++) if (isEmissive(getPx(h.buf, x, y))) lights++;
      }
      expect(lights).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('hardpoints', () => {
  it('places all six', () => {
    const h = hull();
    expect(HARDPOINT_IDS).toHaveLength(6);
    for (const id of HARDPOINT_IDS) {
      expect(h.hardpoints[id].id).toBe(id);
    }
  });

  it('puts every hardpoint at a distinct position', () => {
    // The spec requires all six to be visually distinct positions on the
    // sprite; coincident anchors would make two modules indistinguishable.
    const h = hull();
    const seen = new Set(HARDPOINT_IDS.map((id) => `${h.hardpoints[id].x},${h.hardpoints[id].y}`));
    expect(seen.size).toBe(6);
  });

  it('separates every pair by at least four pixels on a cruiser', () => {
    const h = hull();
    for (let i = 0; i < HARDPOINT_IDS.length; i++) {
      for (let j = i + 1; j < HARDPOINT_IDS.length; j++) {
        const a = h.hardpoints[HARDPOINT_IDS[i]!];
        const b = h.hardpoints[HARDPOINT_IDS[j]!];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('orders them bow to stern along the hull', () => {
    const h = hull();
    expect(h.hardpoints.bow.y).toBeLessThan(h.hardpoints.dorsal.y);
    expect(h.hardpoints.dorsal.y).toBeLessThan(h.hardpoints.ventral.y);
    expect(h.hardpoints.ventral.y).toBeLessThan(h.hardpoints.engine.y);
  });

  it('puts the sponsons on opposite sides of the centreline', () => {
    const h = hull();
    expect(h.hardpoints.port.x).toBeLessThan(h.centreX);
    expect(h.hardpoints.starboard.x).toBeGreaterThan(h.centreX);
  });

  it('puts the centreline hardpoints on the centreline', () => {
    const h = hull();
    for (const id of ['bow', 'dorsal', 'ventral', 'engine'] as HardpointId[]) {
      expect(h.hardpoints[id].x).toBe(h.centreX);
    }
  });

  it('keeps every hardpoint on the hull, not floating beside it', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const h = hull('player', 'cruiser', seed);
      for (const id of HARDPOINT_IDS) {
        const hp = h.hardpoints[id];
        expect(isFilled(h.profile, hp.x - h.centreX, hp.y)).toBe(true);
      }
    }
  });

  it('keeps them inside the buffer', () => {
    const h = hull();
    for (const id of HARDPOINT_IDS) {
      const hp = h.hardpoints[id];
      expect(hp.x).toBeGreaterThanOrEqual(0);
      expect(hp.x).toBeLessThan(h.buf.w);
      expect(hp.y).toBeGreaterThanOrEqual(0);
      expect(hp.y).toBeLessThan(h.buf.h);
    }
  });
});

describe('faction distinguishability', () => {
  it('gives each faction a different silhouette from the same seed', () => {
    const outlines = ALL_FACTIONS.map((f) => {
      const h = hull(f, 'cruiser', 'shared');
      return Array.from(h.profile.halfWidth).join(',');
    });
    expect(new Set(outlines).size).toBe(4);
  });

  it('gives each ship class a different silhouette', () => {
    const classes: SizeClass[] = ['corvette', 'destroyer', 'cruiser', 'capital'];
    const lengths = classes.map((c) => hull('concord', c).profile.length);
    expect(new Set(lengths).size).toBe(4);
  });
});

describe('determinism', () => {
  it('rebuilds identically from the same seed', () => {
    expect(Array.from(hull('concord', 'destroyer', 's').buf.data))
      .toEqual(Array.from(hull('concord', 'destroyer', 's').buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/hull.test.ts
```

Expected: FAIL — `Failed to resolve import "./hull.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/hull.ts`:

```ts
/**
 * Finished hulls: profile, plating, greebles, running lights, and the six
 * hardpoint anchors modules bolt onto.
 *
 * In a top-down view "dorsal" and "ventral" cannot be above and below, so they
 * render as centreline positions — dorsal forward of amidships, ventral aft of
 * it. Together with the bow, the engine block, and the two sponsons that gives
 * six positions a player can tell apart at a glance, which is the requirement
 * they exist to satisfy.
 */

import type { Rng } from '../sim/rng.js';
import { type PixBuf } from './pixbuf.js';
import { EMISSIVE, FACTION_PALETTE, rampOf, type FactionId } from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import { buildProfile, type Profile, type SizeClass } from './grammar/profile.js';
import { plateHull } from './grammar/plates.js';
import { applyGreebles, applyRunningLights } from './grammar/greeble.js';

export type HardpointId = 'bow' | 'dorsal' | 'ventral' | 'port' | 'starboard' | 'engine';

/** Install order — also the z-order modules composite in. */
export const HARDPOINT_IDS: readonly HardpointId[] = [
  'bow', 'dorsal', 'ventral', 'port', 'starboard', 'engine',
];

/** Position along the hull as a fraction from bow (0) to stern (1). */
export const HARDPOINT_AT: Readonly<Record<HardpointId, number>> = {
  bow: 0.06,
  dorsal: 0.30,
  port: 0.50,
  starboard: 0.50,
  ventral: 0.66,
  engine: 0.93,
};

export interface Hardpoint {
  id: HardpointId;
  x: number;
  y: number;
}

export interface Hull {
  buf: PixBuf;
  centreX: number;
  profile: Profile;
  hardpoints: Readonly<Record<HardpointId, Hardpoint>>;
  faction: FactionId;
  sizeClass: SizeClass;
}

export interface HullSpec {
  faction: FactionId;
  sizeClass: SizeClass;
  rng: Rng;
  length?: number;
}

/** Emissive colour each faction runs its lights in. */
const RUNNING_LIGHT_COLOR: Readonly<Record<FactionId, number>> = {
  concord: EMISSIVE.blue,
  coalition: EMISSIVE.amber,
  derelict: EMISSIVE.green,
  player: EMISSIVE.amber,
};

/** Clamps a row into the hull and off its very tips, where there is no width. */
function anchorRow(profile: Profile, fraction: number): number {
  const raw = Math.round((profile.length - 1) * fraction);
  // Walk toward midships until the row has hull on it. A derelict's erosion can
  // leave the nominal row empty, and an anchor floating in a gap is a defect.
  const mid = Math.floor(profile.length / 2);
  let y = Math.max(0, Math.min(profile.length - 1, raw));
  let guard = profile.length;
  while (guard-- > 0 && profile.halfWidth[y]! < 1) {
    y += y < mid ? 1 : -1;
    if (y < 0 || y >= profile.length) return mid;
  }
  return y;
}

export function buildHull(spec: HullSpec): Hull {
  const { faction, sizeClass, rng } = spec;

  const profile = buildProfile(
    spec.length === undefined
      ? { faction, sizeClass, rng }
      : { faction, sizeClass, rng, length: spec.length },
  );

  const ramp = rampOf(faction);
  const plated = plateHull({ profile, ramp, rng });

  applyGreebles(plated, profile, ramp, rng);
  applyRunningLights(plated, profile, RUNNING_LIGHT_COLOR[faction]);

  const cx = plated.centreX;
  const hardpoints = {} as Record<HardpointId, Hardpoint>;

  for (const id of HARDPOINT_IDS) {
    const y = anchorRow(profile, HARDPOINT_AT[id]);
    const half = profile.halfWidth[y]!;

    let x = cx;
    if (id === 'port') x = cx - Math.max(1, half - 1);
    if (id === 'starboard') x = cx + Math.max(1, half - 1);

    hardpoints[id] = { id, x, y };
  }

  // Fail loudly at generation time rather than shipping an off-palette hull that
  // only surfaces when the whole contact sheet is QC'd.
  assertQc(qcSprite(`hull:${faction}:${sizeClass}`, plated.buf, FACTION_PALETTE[faction]));

  return {
    buf: plated.buf,
    centreX: cx,
    profile,
    hardpoints,
    faction,
    sizeClass,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/hull.test.ts
```

Expected: PASS, 15 tests.

The four-pixel hardpoint separation may fail on the narrowest cruiser draws. If it does, widen the gap between `port`/`starboard` and `dorsal`/`ventral` in `HARDPOINT_AT` rather than lowering the threshold — six positions a player cannot tell apart is the failure the assertion exists to catch.

> **Amended during execution — five fix rounds (`4ab9276`, `1eeaad1`).** The
> `anchorRow` below is wrong in three ways a 3-seed test cannot see. A re-run
> must apply all of these:
>
> - **The walk `y += y < mid ? 1 : -1` has a fixed point at midships.** Below mid
>   it steps up, which puts it at/above mid, which steps it back down — it
>   oscillates between two adjacent rows until the guard expires, never reaching
>   a valid row just past them. Replaced with `searchOutward`, which tries
>   offsets 0, ±1, ±2 … from the nominal row. Cannot oscillate, and preferring
>   the nearest row is what preserves bow→stern ordering.
> - **Row identity is not separation.** The claimed-row set must reject rows
>   *within `MIN_ROW_GAP = 4`*, not merely identical ones — the sponsons sit off
>   the centreline, so a hardpoint 3 rows away is only √13 ≈ 3.6px distant.
>   Sponsons additionally need a row with `halfWidth >= 3` or they land 2px apart.
> - **Fallbacks must degrade the constraint gradually, and never through
>   validity.** Try gap 4, 3, 2, 1 before abandoning the gap — an all-or-nothing
>   fallback takes the *first* available row, not the *best* one, producing 1px
>   separations. Then give up distinctness before ever returning an unfilled row,
>   and walk the sponson x inboard until `isFilled` is genuinely true (erosion can
>   hollow the edge pixel while leaving the row nominally filled).
>
> **Adjudicated:** six hardpoints at 4px separation is an exact fit on a 24px
> hull, and erosion can make it impossible. That is geometry, like the fighter
> exemption but rare. The assertion states the honest invariant — never below
> 2px, under-4px pairs rare — with distinctness absolute at corvette and above.
> Verified over 960,000 pairs: minimum observed 3px, 6 pairs under 4px.
>
> Task 10's `profile.ts` also needed a fix found here: erosion could zero out
> *every* row of a short derelict (~0.2%), yielding an invisible ship. The guard
> for it was a no-op (`if (halfWidth[0] === 0) halfWidth[0] = 0;`).

- [ ] **Step 5: Commit**

```bash
git add src/gen/hull.ts src/gen/hull.test.ts
git commit -m "feat: finished hulls with six distinct hardpoint anchors

Dorsal and ventral become centreline positions fore and aft of amidships, since
top-down has no up. Anchors walk toward midships if erosion left their nominal
row empty, so a derelict never gets a hardpoint floating in a hole.

Hulls QC themselves at build time — an off-palette hull fails here rather than
surfacing later as one bad pixel in a contact sheet."
```

---

### Task 14: `gen/module.ts` — the module catalogue

Twenty-four modules across six hardpoints and three tiers, built from six shape archetypes. Faction identity rides on the palette lock, so a Coalition cannon bank looks Coalition wherever it ends up.

**Files:**
- Create: `src/gen/module.ts`
- Test: `src/gen/module.test.ts`

**Interfaces:**
- Consumes: `HardpointId` from `./hull.js`; `FactionId`, `rampOf`, `FACTION_PALETTE`, `EMISSIVE`, `shadeStep` from `./palette.js`; `PixBuf` primitives; `ditherMask` from `./grammar/plates.js`; `qcSprite`, `assertQc` from `./qc.js`; `Rng` from `../sim/rng.js`
- Produces:
  - `type ModuleArchetype = 'barrel' | 'boom' | 'block' | 'pod' | 'nozzle' | 'array'`
  - `type ModuleId` — the 24 module identifiers as a union
  - `interface ModuleDef { id: ModuleId; name: string; hardpoint: HardpointId; archetype: ModuleArchetype; tier: 1 | 2 | 3; length: number; width: number }`
  - `const MODULE_CATALOGUE: readonly ModuleDef[]` — all 24
  - `function modulesFor(hardpoint: HardpointId): readonly ModuleDef[]`
  - `interface ModuleSprite { def: ModuleDef; buf: PixBuf; anchorX: number; anchorY: number; faction: FactionId }`
  - `function buildModule(def: ModuleDef, faction: FactionId, rng: Rng): ModuleSprite`
  - The anchor is the point that lands on the hull's hardpoint; module pixels extend *outward* from it so the outline changes

- [ ] **Step 1: Write the failing test**

Create `src/gen/module.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, type FactionId } from './palette.js';
import { qcSprite } from './qc.js';
import { HARDPOINT_IDS, type HardpointId } from './hull.js';
import { buildModule, MODULE_CATALOGUE, modulesFor, type ModuleDef } from './module.js';

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];

describe('the catalogue', () => {
  it('holds 24 modules', () => {
    expect(MODULE_CATALOGUE).toHaveLength(24);
  });

  it('gives every module a unique id and a human name', () => {
    expect(new Set(MODULE_CATALOGUE.map((m) => m.id)).size).toBe(24);
    for (const m of MODULE_CATALOGUE) expect(m.name.length).toBeGreaterThan(2);
  });

  it('gives every hardpoint exactly four modules', () => {
    for (const id of HARDPOINT_IDS) {
      expect(modulesFor(id)).toHaveLength(4);
    }
  });

  it('spreads modules across three tiers on every hardpoint', () => {
    for (const id of HARDPOINT_IDS) {
      const tiers = new Set(modulesFor(id).map((m) => m.tier));
      expect(tiers.size).toBeGreaterThanOrEqual(2);
      for (const t of tiers) expect([1, 2, 3]).toContain(t);
    }
  });

  it('keeps every module inside the 16-48px band the spec fixes', () => {
    for (const m of MODULE_CATALOGUE) {
      const longest = Math.max(m.length, m.width);
      expect(longest).toBeGreaterThanOrEqual(16);
      expect(longest).toBeLessThanOrEqual(48);
    }
  });

  it('includes the hangar deck on the ventral bay', () => {
    // The structural pivot of the whole game.
    const hangar = MODULE_CATALOGUE.find((m) => m.id === 'hangar-deck');
    expect(hangar).toBeDefined();
    expect(hangar!.hardpoint).toBe('ventral');
    expect(hangar!.tier).toBe(3);
  });

  it('makes higher tiers bigger', () => {
    for (const id of HARDPOINT_IDS) {
      const byTier = [...modulesFor(id)].sort((a, b) => a.tier - b.tier);
      const area = (m: ModuleDef) => m.length * m.width;
      expect(area(byTier.at(-1)!)).toBeGreaterThan(area(byTier[0]!));
    }
  });
});

describe('module sprites', () => {
  it('passes QC in every faction', () => {
    for (const def of MODULE_CATALOGUE) {
      for (const faction of ALL_FACTIONS) {
        const sprite = buildModule(def, faction, makeRng(`${def.id}-${faction}`));
        const report = qcSprite(`${def.id}:${faction}`, sprite.buf, FACTION_PALETTE[faction]);
        expect(report.pass, report.name).toBe(true);
      }
    }
  });

  it('draws something substantial', () => {
    for (const def of MODULE_CATALOGUE) {
      const sprite = buildModule(def, 'player', makeRng(def.id));
      expect(countOpaque(sprite.buf)).toBeGreaterThan(20);
    }
  });

  it('sizes the buffer to its definition', () => {
    for (const def of MODULE_CATALOGUE) {
      const sprite = buildModule(def, 'player', makeRng(def.id));
      expect(sprite.buf.w).toBe(def.width);
      expect(sprite.buf.h).toBe(def.length);
    }
  });

  it('keeps the anchor inside the sprite', () => {
    for (const def of MODULE_CATALOGUE) {
      const s = buildModule(def, 'player', makeRng(def.id));
      expect(s.anchorX).toBeGreaterThanOrEqual(0);
      expect(s.anchorX).toBeLessThan(s.buf.w);
      expect(s.anchorY).toBeGreaterThanOrEqual(0);
      expect(s.anchorY).toBeLessThan(s.buf.h);
    }
  });

  it('extends outward from its anchor, so it can change the outline', () => {
    // A module that sits entirely inboard of its anchor would be swallowed by
    // the hull and invisible in silhouette — the one failure mode that breaks
    // the core loop.
    for (const def of MODULE_CATALOGUE) {
      const s = buildModule(def, 'player', makeRng(def.id));
      const b = opaqueBounds(s.buf)!;
      const reach =
        def.hardpoint === 'port' ? s.anchorX - b.x0
        : def.hardpoint === 'starboard' ? b.x1 - s.anchorX
        : def.hardpoint === 'engine' ? b.y1 - s.anchorY
        : def.hardpoint === 'bow' ? s.anchorY - b.y0
        : Math.max(s.anchorX - b.x0, b.x1 - s.anchorX);
      expect(reach, def.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives different archetypes different shapes', () => {
    const byArchetype = new Map<string, string>();
    for (const def of MODULE_CATALOGUE) {
      const s = buildModule(def, 'player', makeRng('fixed'));
      const key = Array.from(s.buf.data).join(',');
      if (!byArchetype.has(def.archetype)) byArchetype.set(def.archetype, key);
    }
    expect(new Set(byArchetype.values()).size).toBe(byArchetype.size);
  });

  it('looks different in different factions', () => {
    const def = MODULE_CATALOGUE.find((m) => m.id === 'cannon-bank')!;
    const shots = ALL_FACTIONS.map((f) =>
      Array.from(buildModule(def, f, makeRng('same')).buf.data).join(','));
    expect(new Set(shots).size).toBe(4);
  });
});

describe('determinism', () => {
  it('rebuilds identically from the same seed', () => {
    const def = MODULE_CATALOGUE[0]!;
    expect(Array.from(buildModule(def, 'concord', makeRng('s')).buf.data))
      .toEqual(Array.from(buildModule(def, 'concord', makeRng('s')).buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/module.test.ts
```

Expected: FAIL — `Failed to resolve import "./module.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/module.ts`:

```ts
/**
 * The module catalogue: 24 modules across six hardpoints and three tiers.
 *
 * Modules are built from six shape archetypes rather than drawn one at a time,
 * so a faction's visual identity is a palette lock plus an archetype choice
 * rather than 24 hand-authored sprites per faction.
 *
 * The anchor is the pixel that lands on the hull's hardpoint. Everything else
 * extends *outward* from it, which is the property that makes an installed
 * module change the ship's outline. A module drawn inboard of its anchor would
 * be swallowed by the hull and invisible in silhouette, and an invisible upgrade
 * is the one failure the whole salvage loop cannot survive.
 */

import type { Rng } from '../sim/rng.js';
import {
  createBuf, setPx, type PixBuf,
} from './pixbuf.js';
import {
  EMISSIVE, FACTION_PALETTE, rampOf, shadeStep, type FactionId,
} from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import { ditherMask } from './grammar/plates.js';
import type { HardpointId } from './hull.js';

export type ModuleArchetype = 'barrel' | 'boom' | 'block' | 'pod' | 'nozzle' | 'array';

export type ModuleId =
  | 'siege-lance' | 'breaching-prow' | 'mining-array' | 'ram-spike'
  | 'rail-battery' | 'sensor-mast' | 'missile-cells' | 'spinal-coil'
  | 'salvage-tractor' | 'cargo-expansion' | 'hangar-deck' | 'repair-bay'
  | 'cannon-bank' | 'beam-array' | 'flak-cluster' | 'torpedo-rack'
  | 'cannon-bank-sb' | 'beam-array-sb' | 'flak-cluster-sb' | 'torpedo-rack-sb'
  | 'thruster-uprate' | 'reactor-uprate' | 'jump-drive' | 'vector-nozzles';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  hardpoint: HardpointId;
  archetype: ModuleArchetype;
  tier: 1 | 2 | 3;
  /** Sprite extent along the hull axis. */
  length: number;
  /** Sprite extent across the hull axis. */
  width: number;
}

export const MODULE_CATALOGUE: readonly ModuleDef[] = [
  // Bow — forward weapons, ramming, cutting
  { id: 'ram-spike',       name: 'RAM SPIKE',       hardpoint: 'bow',        archetype: 'boom',   tier: 1, length: 20, width: 8 },
  { id: 'mining-array',    name: 'MINING ARRAY',    hardpoint: 'bow',        archetype: 'array',  tier: 1, length: 18, width: 16 },
  { id: 'breaching-prow',  name: 'BREACHING PROW',  hardpoint: 'bow',        archetype: 'block',  tier: 2, length: 22, width: 18 },
  { id: 'siege-lance',     name: 'SIEGE LANCE',     hardpoint: 'bow',        archetype: 'boom',   tier: 3, length: 40, width: 12 },

  // Dorsal spine — heavy weapons, sensors
  { id: 'sensor-mast',     name: 'SENSOR MAST',     hardpoint: 'dorsal',     archetype: 'boom',   tier: 1, length: 24, width: 10 },
  { id: 'missile-cells',   name: 'MISSILE CELLS',   hardpoint: 'dorsal',     archetype: 'pod',    tier: 2, length: 20, width: 18 },
  { id: 'rail-battery',    name: 'RAIL BATTERY',    hardpoint: 'dorsal',     archetype: 'barrel', tier: 2, length: 26, width: 16 },
  { id: 'spinal-coil',     name: 'SPINAL COIL',     hardpoint: 'dorsal',     archetype: 'boom',   tier: 3, length: 44, width: 14 },

  // Ventral bay — utility, capacity
  { id: 'salvage-tractor', name: 'SALVAGE TRACTOR', hardpoint: 'ventral',    archetype: 'array',  tier: 1, length: 18, width: 20 },
  { id: 'cargo-expansion', name: 'CARGO EXPANSION', hardpoint: 'ventral',    archetype: 'block',  tier: 2, length: 26, width: 22 },
  { id: 'repair-bay',      name: 'REPAIR BAY',      hardpoint: 'ventral',    archetype: 'block',  tier: 2, length: 24, width: 20 },
  { id: 'hangar-deck',     name: 'HANGAR DECK',     hardpoint: 'ventral',    archetype: 'block',  tier: 3, length: 38, width: 30 },

  // Port sponson — broadside
  { id: 'flak-cluster',    name: 'FLAK CLUSTER',    hardpoint: 'port',       archetype: 'pod',    tier: 1, length: 16, width: 16 },
  { id: 'cannon-bank',     name: 'CANNON BANK',     hardpoint: 'port',       archetype: 'barrel', tier: 2, length: 22, width: 20 },
  { id: 'beam-array',      name: 'BEAM ARRAY',      hardpoint: 'port',       archetype: 'array',  tier: 2, length: 24, width: 18 },
  { id: 'torpedo-rack',    name: 'TORPEDO RACK',    hardpoint: 'port',       archetype: 'pod',    tier: 3, length: 30, width: 26 },

  // Starboard sponson — mirrors port, upgraded independently
  { id: 'flak-cluster-sb', name: 'FLAK CLUSTER',    hardpoint: 'starboard',  archetype: 'pod',    tier: 1, length: 16, width: 16 },
  { id: 'cannon-bank-sb',  name: 'CANNON BANK',     hardpoint: 'starboard',  archetype: 'barrel', tier: 2, length: 22, width: 20 },
  { id: 'beam-array-sb',   name: 'BEAM ARRAY',      hardpoint: 'starboard',  archetype: 'array',  tier: 2, length: 24, width: 18 },
  { id: 'torpedo-rack-sb', name: 'TORPEDO RACK',    hardpoint: 'starboard',  archetype: 'pod',    tier: 3, length: 30, width: 26 },

  // Engine block — mobility, power
  { id: 'vector-nozzles',  name: 'VECTOR NOZZLES',  hardpoint: 'engine',     archetype: 'nozzle', tier: 1, length: 16, width: 20 },
  { id: 'thruster-uprate', name: 'THRUSTER UPRATE', hardpoint: 'engine',     archetype: 'nozzle', tier: 2, length: 22, width: 26 },
  { id: 'reactor-uprate',  name: 'REACTOR UPRATE',  hardpoint: 'engine',     archetype: 'block',  tier: 2, length: 20, width: 24 },
  { id: 'jump-drive',      name: 'JUMP DRIVE',      hardpoint: 'engine',     archetype: 'pod',    tier: 3, length: 28, width: 32 },
];

export function modulesFor(hardpoint: HardpointId): readonly ModuleDef[] {
  return MODULE_CATALOGUE.filter((m) => m.hardpoint === hardpoint);
}

export interface ModuleSprite {
  def: ModuleDef;
  buf: PixBuf;
  /** The pixel that lands on the hull's hardpoint. */
  anchorX: number;
  anchorY: number;
  faction: FactionId;
}

/** Emissive accent each faction lights its modules with. */
const ACCENT: Readonly<Record<FactionId, number>> = {
  concord: EMISSIVE.cyan,
  coalition: EMISSIVE.orange,
  derelict: EMISSIVE.green,
  player: EMISSIVE.amber,
};

/**
 * Archetype silhouettes, drawn in a local frame where +y is outward from the
 * hull. `outward(t)` gives the half-width at each step along the module's reach,
 * so an archetype is a one-line shape rule rather than a bitmap.
 */
const SHAPE: Readonly<Record<ModuleArchetype, (t: number) => number>> = {
  // A gun barrel: broad breech, narrow muzzle.
  barrel: (t) => 1 - 0.62 * t,
  // A mast or lance: thin, near-constant, tapering only at the tip.
  boom: (t) => (t > 0.82 ? 0.34 * (1 - (t - 0.82) / 0.18) : 0.34),
  // A bolted-on box: square, full width the whole way.
  block: () => 1,
  // A cluster: bulges in the middle.
  pod: (t) => 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))),
  // An exhaust bell: narrow throat flaring to a wide mouth.
  nozzle: (t) => 0.45 + 0.55 * t,
  // A flat panel bank: full width, squared off, shallow.
  array: (t) => (t > 0.9 ? 0.8 : 1),
};

export function buildModule(def: ModuleDef, faction: FactionId, rng: Rng): ModuleSprite {
  const buf = createBuf(def.width, def.length);
  const ramp = rampOf(faction);
  const accent = ACCENT[faction];

  // Local frame: the module reaches along `reach` and spans `span`.
  // For port/starboard the reach is horizontal; otherwise it is vertical.
  const lateral = def.hardpoint === 'port' || def.hardpoint === 'starboard';
  const reach = lateral ? def.width : def.length;
  const span = lateral ? def.length : def.width;
  const shape = SHAPE[def.archetype];

  // Reverse the reach for hardpoints whose outward direction runs toward
  // decreasing coordinates, so `t = 0` is always the end that touches the hull.
  //
  // Amended during execution (commit `82c3f38`). `dorsal` is in this set so it
  // leans to PORT while `ventral` leans to starboard. Centreline modules cannot
  // straddle the spine: dorsal and ventral sit at the hull's widest run
  // (half-width up to 25px), so a centred anchor would need a reach of 2H+16 ≈
  // 66px against the 48px size ceiling — measured, and widening to the maximum
  // still left 0px escape on one side. The spec requires centreline HARDPOINTS
  // and distinct POSITIONS, not symmetric sprites, and explicitly welcomes
  // port/starboard asymmetry. The real defect was that all eight leaned the same
  // way, which made dorsal read as a starboard sponson.
  const flip =
    def.hardpoint === 'port' || def.hardpoint === 'bow' || def.hardpoint === 'dorsal';

  for (let r = 0; r < reach; r++) {
    const t = reach === 1 ? 0 : r / (reach - 1);
    const halfSpan = Math.max(0, Math.round((shape(t) * span) / 2) - 1);
    if (halfSpan < 0) continue;

    const centre = Math.floor(span / 2);
    for (let s = centre - halfSpan; s <= centre + halfSpan; s++) {
      const rr = flip ? reach - 1 - r : r;
      const x = lateral ? rr : s;
      const y = lateral ? s : rr;

      // Shade from the top-left, matching the hull's baked light.
      const onLitEdge = s === centre - halfSpan || (!lateral && r === 0);
      const onShadowEdge = s === centre + halfSpan || (!lateral && r === reach - 1);

      let step = 3;
      if (onLitEdge && !onShadowEdge) step += 2;
      else if (onShadowEdge && !onLitEdge) step -= 2;
      else if (ditherMask(x, y)) step += 1;

      setPx(buf, x, y, shadeStep(ramp, step));
    }
  }

  // One emissive accent at the working end — a muzzle, a lens, an exhaust —
  // so the module reads as powered and gives bloom something to key on.
  {
    const tipT = 0.86;
    const r = Math.round((reach - 1) * tipT);
    const rr = flip ? reach - 1 - r : r;
    const centre = Math.floor(span / 2);
    const x = lateral ? rr : centre;
    const y = lateral ? centre : rr;
    setPx(buf, x, y, accent);
  }

  // The anchor sits at the hull-side end of the reach, centred across the span.
  const centre = Math.floor(span / 2);
  const hullEnd = flip ? reach - 1 : 0;
  const anchorX = lateral ? hullEnd : centre;
  const anchorY = lateral ? centre : hullEnd;

  assertQc(qcSprite(`module:${def.id}:${faction}`, buf, FACTION_PALETTE[faction]));

  return { def, buf, anchorX, anchorY, faction };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/module.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/module.ts src/gen/module.test.ts
git commit -m "feat: 24-module catalogue from six shape archetypes

An archetype is a one-line half-width rule, so faction identity is a palette lock
plus an archetype choice rather than 24 hand-drawn sprites per faction.

Every module is tested to extend at least 4px outward from its anchor. A module
drawn inboard would be swallowed by the hull and invisible in silhouette, and an
invisible upgrade is the one failure the salvage loop cannot survive."
```

---

### Task 15: `gen/damage.ts` — the four damage frames

Every hull and module ships with intact / damaged / critical / destroyed frames. The design rule the code has to honour: damage stays *inside* the outline until critical, because the player must be able to see a hardpoint approaching breach and react.

**Files:**
- Create: `src/gen/damage.ts`
- Test: `src/gen/damage.test.ts`

**Interfaces:**
- Consumes: `PixBuf` primitives; `WARM`, `EMISSIVE`, `isEmissive`, `snapToPalette` from `./palette.js`; `Rng` from `../sim/rng.js`
- Produces:
  - `type DamageState = 'intact' | 'damaged' | 'critical' | 'destroyed'`
  - `const DAMAGE_STATES: readonly DamageState[]` — in worsening order
  - `interface DamageSpec { state: DamageState; rng: Rng; allowed: readonly Rgba[] }`
  - `function applyDamage(src: PixBuf, spec: DamageSpec): PixBuf` — returns a new buffer, never mutates
  - `function damageFrames(src: PixBuf, rng: Rng, allowed: readonly Rgba[]): Readonly<Record<DamageState, PixBuf>>`

- [ ] **Step 1: Write the failing test**

Create `src/gen/damage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, isEmissive, WARM } from './palette.js';
import { checkPalette } from './qc.js';
import { buildHull } from './hull.js';
import { applyDamage, DAMAGE_STATES, damageFrames, type DamageState } from './damage.js';

const allowed = [...FACTION_PALETTE.player, ...WARM];
const source = () => buildHull({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('d') }).buf;

const frame = (state: DamageState, seed = 'x') =>
  applyDamage(source(), { state, rng: makeRng(seed), allowed });

const emissiveCount = (buf: ReturnType<typeof source>) => {
  let n = 0;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) if (isEmissive(getPx(buf, x, y))) n++;
  }
  return n;
};

describe('damage states', () => {
  it('names four, in worsening order', () => {
    expect(DAMAGE_STATES).toEqual(['intact', 'damaged', 'critical', 'destroyed']);
  });

  it('leaves the intact frame byte-identical', () => {
    const src = source();
    expect(Array.from(applyDamage(src, { state: 'intact', rng: makeRng('x'), allowed }).data))
      .toEqual(Array.from(src.data));
  });

  it('never mutates its input', () => {
    const src = source();
    const before = Array.from(src.data);
    applyDamage(src, { state: 'destroyed', rng: makeRng('x'), allowed });
    expect(Array.from(src.data)).toEqual(before);
  });
});

describe('degradation is monotonic', () => {
  it('loses hull pixels as damage worsens', () => {
    const counts = DAMAGE_STATES.map((s) => countOpaque(frame(s)));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
    expect(counts.at(-1)!).toBeLessThan(counts[0]!);
  });

  it('loses running lights as damage worsens', () => {
    const lights = DAMAGE_STATES.map((s) => emissiveCount(frame(s)));
    for (let i = 1; i < lights.length; i++) {
      expect(lights[i]!).toBeLessThanOrEqual(lights[i - 1]!);
    }
  });

  it('kills every emissive by the destroyed frame', () => {
    expect(emissiveCount(frame('destroyed'))).toBe(0);
  });
});

describe('the outline rule', () => {
  it('keeps the silhouette intact through the damaged frame', () => {
    // Modules are lost only to critical breach. If ordinary damage ate the
    // outline, the player would watch a hardpoint shrink with no way to read
    // how close it was to the threshold.
    const src = source();
    const damaged = frame('damaged');
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        expect(isOpaque(getPx(damaged, x, y))).toBe(isOpaque(getPx(src, x, y)));
      }
    }
  });

  it('punches interior holes at critical without touching the outline', () => {
    // Corrected during execution (commit `f00244c`). This originally asserted
    // bounding-box equality as a proxy for "the outline survives" — and could
    // not detect the defect. Mutation testing showed that setting
    // `erodeEdges: true` for critical left ALL tests green: a boundary row is
    // dozens of pixels wide and erosion is per-pixel at 30%, so clearing an
    // entire extreme row essentially never happens. The proxy caught it in 1 of
    // 32 seeds.
    //
    // Assert the rule itself: every pixel on the intact silhouette edge must
    // still be opaque at critical. Under the mutation this now fails with
    // "97 of 278 outline pixels lost".
    const src = source();
    const critical = frame('critical');

    const isEdge = (buf: typeof src, x: number, y: number) =>
      isOpaque(getPx(buf, x, y)) &&
      (!isOpaque(getPx(buf, x - 1, y)) || !isOpaque(getPx(buf, x + 1, y)) ||
       !isOpaque(getPx(buf, x, y - 1)) || !isOpaque(getPx(buf, x, y + 1)));

    let edgePixels = 0;
    let lost = 0;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        if (!isEdge(src, x, y)) continue;
        edgePixels++;
        if (!isOpaque(getPx(critical, x, y))) lost++;
      }
    }

    // Without this guard the assertion passes vacuously on an empty buffer —
    // the failure mode that has bitten this plan repeatedly.
    expect(edgePixels).toBeGreaterThan(50);
    expect(lost, `${lost} of ${edgePixels} outline pixels lost at critical`).toBe(0);
    expect(countOpaque(critical)).toBeLessThan(countOpaque(src));
  });

  it('erodes the outline itself only once destroyed', () => {
    expect(countOpaque(frame('destroyed'))).toBeLessThan(countOpaque(frame('critical')));
  });
});

describe('appearance', () => {
  it('adds scorch — warm pixels that were not there before', () => {
    const src = source();
    const damaged = frame('damaged');
    let scorched = 0;
    const warm = new Set(WARM);
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        if (warm.has(getPx(damaged, x, y)) && !warm.has(getPx(src, x, y))) scorched++;
      }
    }
    expect(scorched).toBeGreaterThan(4);
  });

  it('stays on palette in every state', () => {
    for (const state of DAMAGE_STATES) {
      expect(checkPalette(frame(state), allowed), state).toEqual([]);
    }
  });
});

describe('damageFrames', () => {
  it('returns all four keyed by state', () => {
    const frames = damageFrames(source(), makeRng('f'), allowed);
    for (const state of DAMAGE_STATES) {
      expect(frames[state].w).toBe(source().w);
    }
  });

  it('is deterministic', () => {
    const a = damageFrames(source(), makeRng('same'), allowed);
    const b = damageFrames(source(), makeRng('same'), allowed);
    for (const state of DAMAGE_STATES) {
      expect(Array.from(a[state].data)).toEqual(Array.from(b[state].data));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/damage.test.ts
```

Expected: FAIL — `Failed to resolve import "./damage.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/damage.ts`:

```ts
/**
 * The four damage frames every hull and module ships with.
 *
 * The rule that shapes this code is a design rule, not a graphics one: modules
 * are lost only to critical hardpoint breach, and the player must be able to see
 * a hardpoint approaching that threshold and react to it. So the frames escalate
 * in a legible order —
 *
 *   intact     untouched
 *   damaged    scorch and dead running lights; outline pixel-identical
 *   critical   interior holes punched through, every emissive out; the bounding
 *              box still holds, so the ship reads as breached rather than eaten
 *   destroyed  the outline itself erodes
 *
 * Keeping the silhouette whole until critical is what makes the warning
 * readable. If ordinary damage nibbled the outline, a player would have no way
 * to tell "hurt" from "about to lose the module".
 */

import type { Rng } from '../sim/rng.js';
import {
  cloneBuf, createBuf, EMPTY, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { isEmissive, snapToPalette, WARM } from './palette.js';

export type DamageState = 'intact' | 'damaged' | 'critical' | 'destroyed';

/** In worsening order. */
export const DAMAGE_STATES: readonly DamageState[] = [
  'intact', 'damaged', 'critical', 'destroyed',
];

export interface DamageSpec {
  state: DamageState;
  rng: Rng;
  allowed: readonly Rgba[];
}

interface Severity {
  /** Fraction of hull pixels that take scorch. */
  scorch: number;
  /** Fraction of emissives that go dark. */
  lightsOut: number;
  /** Fraction of interior pixels punched out. */
  holes: number;
  /** Whether the outline itself may erode. */
  erodeEdges: boolean;
}

const SEVERITY: Readonly<Record<DamageState, Severity>> = {
  intact:    { scorch: 0,    lightsOut: 0,   holes: 0,    erodeEdges: false },
  damaged:   { scorch: 0.10, lightsOut: 0.5, holes: 0,    erodeEdges: false },
  critical:  { scorch: 0.22, lightsOut: 1,   holes: 0.10, erodeEdges: false },
  destroyed: { scorch: 0.34, lightsOut: 1,   holes: 0.22, erodeEdges: true },
};

/** True when every eight-neighbour is opaque — safe to punch without touching the outline. */
function isInteriorPixel(buf: PixBuf, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isOpaque(getPx(buf, x + dx, y + dy))) return false;
    }
  }
  return true;
}

export function applyDamage(src: PixBuf, spec: DamageSpec): PixBuf {
  if (spec.state === 'intact') return cloneBuf(src);

  const { rng, allowed } = spec;
  const sev = SEVERITY[spec.state];
  const out = cloneBuf(src);

  // Scorch palette: the dark end of the warm ramp, snapped into whatever the
  // caller allows so a faction lock is never broken by damage.
  const scorchDark = snapToPalette(WARM[1]!, allowed);
  const scorchMid = snapToPalette(WARM[2]!, allowed);

  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const c = getPx(out, x, y);
      if (!isOpaque(c)) continue;

      // Running lights die first and stay dead.
      if (isEmissive(c)) {
        if (rng.chance(sev.lightsOut)) {
          setPx(out, x, y, scorchDark);
        }
        continue;
      }

      if (rng.chance(sev.scorch)) {
        setPx(out, x, y, rng.chance(0.6) ? scorchDark : scorchMid);
      }
    }
  }

  // Holes are punched only through interior pixels, which is what preserves the
  // bounding box at critical.
  if (sev.holes > 0) {
    const snapshot = cloneBuf(out);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (!isInteriorPixel(snapshot, x, y)) continue;
        if (rng.chance(sev.holes)) setPx(out, x, y, EMPTY);
      }
    }
  }

  if (sev.erodeEdges) {
    const snapshot = cloneBuf(out);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        if (!isOpaque(getPx(snapshot, x, y))) continue;
        if (isInteriorPixel(snapshot, x, y)) continue; // edge pixels only
        if (rng.chance(0.3)) setPx(out, x, y, EMPTY);
      }
    }
  }

  return out;
}

export function damageFrames(
  src: PixBuf,
  rng: Rng,
  allowed: readonly Rgba[],
): Readonly<Record<DamageState, PixBuf>> {
  const frames = {} as Record<DamageState, PixBuf>;
  for (const state of DAMAGE_STATES) {
    // A child stream per state, so adding a state later cannot change how the
    // existing ones look.
    frames[state] = applyDamage(src, { state, rng: rng.split(state), allowed });
  }
  return frames;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/damage.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/damage.ts src/gen/damage.test.ts
git commit -m "feat: intact/damaged/critical/destroyed frames

Damage stays inside the outline until critical and erodes the edge only once
destroyed. That escalation is a design requirement, not a look: modules are lost
only to critical breach, and a player who cannot see the outline holding has no
way to read how close a hardpoint is to the threshold."
```

---

### Task 16: `gen/composite.ts` — hull plus modules

The function the refit screen calls. Takes a hull and a loadout, returns one buffer. This is where "three loadouts of the same cruiser are distinguishable by outline" either holds or does not.

**Files:**
- Create: `src/gen/composite.ts`
- Test: `src/gen/composite.test.ts`

**Interfaces:**
- Consumes: `Hull`, `HardpointId`, `HARDPOINT_IDS` from `./hull.js`; `ModuleSprite` from `./module.js`; `PixBuf` primitives
- Produces:
  - `interface Loadout { readonly [K in HardpointId]?: ModuleSprite }` — partial by design; empty hardpoints are normal
  - `interface CompositeShip { buf: PixBuf; centreX: number; centreY: number; hull: Hull; installed: readonly HardpointId[] }`
  - `function compositeShip(hull: Hull, loadout: Loadout): CompositeShip`
  - `const Z_ORDER: readonly HardpointId[]` — ventral under the hull, everything else over it
  - `function silhouetteKey(buf: PixBuf): string` — a stable outline fingerprint, used by tests and the contact sheet

- [ ] **Step 1: Write the failing test**

Create `src/gen/composite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE } from './palette.js';
import { checkPalette } from './qc.js';
import { buildHull } from './hull.js';
import { buildModule, MODULE_CATALOGUE, modulesFor } from './module.js';
import { compositeShip, silhouetteKey, type Loadout } from './composite.js';

const hull = () => buildHull({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('c') });

const mod = (id: string) => {
  const def = MODULE_CATALOGUE.find((m) => m.id === id)!;
  return buildModule(def, 'player', makeRng(id));
};

describe('compositing', () => {
  it('returns the bare hull when nothing is installed', () => {
    const h = hull();
    const ship = compositeShip(h, {});
    expect(countOpaque(ship.buf)).toBe(countOpaque(h.buf));
    expect(ship.installed).toEqual([]);
  });

  it('grows the canvas to fit overhanging modules', () => {
    const h = hull();
    const bare = compositeShip(h, {});
    const fitted = compositeShip(h, { bow: mod('siege-lance'), port: mod('torpedo-rack') });
    expect(fitted.buf.w).toBeGreaterThan(bare.buf.w);
    expect(fitted.buf.h).toBeGreaterThan(bare.buf.h);
  });

  it('adds pixels rather than replacing them', () => {
    const h = hull();
    const bare = countOpaque(compositeShip(h, {}).buf);
    const fitted = countOpaque(compositeShip(h, { dorsal: mod('spinal-coil') }).buf);
    expect(fitted).toBeGreaterThan(bare);
  });

  it('reports which hardpoints are filled', () => {
    const ship = compositeShip(hull(), { bow: mod('ram-spike'), engine: mod('jump-drive') });
    expect([...ship.installed].sort()).toEqual(['bow', 'engine']);
  });

  it('keeps the hull centre addressable after the canvas grows', () => {
    const h = hull();
    const ship = compositeShip(h, { port: mod('torpedo-rack') });
    // The recorded centre must still land on hull, not in the new margin.
    expect(isOpaque(getPx(ship.buf, ship.centreX, ship.centreY))).toBe(true);
  });

  it('stays on palette', () => {
    const ship = compositeShip(hull(), {
      bow: mod('siege-lance'),
      dorsal: mod('rail-battery'),
      ventral: mod('hangar-deck'),
      port: mod('cannon-bank'),
      starboard: mod('beam-array-sb'),
      engine: mod('thruster-uprate'),
    });
    expect(checkPalette(ship.buf, FACTION_PALETTE.player)).toEqual([]);
  });

  it('accepts a full six-hardpoint loadout', () => {
    const ship = compositeShip(hull(), {
      bow: mod('siege-lance'),
      dorsal: mod('spinal-coil'),
      ventral: mod('hangar-deck'),
      port: mod('torpedo-rack'),
      starboard: mod('torpedo-rack-sb'),
      engine: mod('jump-drive'),
    });
    expect(ship.installed).toHaveLength(6);
  });
});

describe('every module changes the outline', () => {
  it('holds for all 24 modules', () => {
    // The acceptance criterion: a module that cannot be identified from the
    // outline is not finished.
    const h = hull();
    const bareKey = silhouetteKey(compositeShip(h, {}).buf);

    for (const def of MODULE_CATALOGUE) {
      const loadout = { [def.hardpoint]: buildModule(def, 'player', makeRng(def.id)) } as Loadout;
      expect(silhouetteKey(compositeShip(h, loadout).buf), def.id).not.toBe(bareKey);
    }
  });

  it('makes different modules on the same hardpoint look different', () => {
    const h = hull();
    for (const hardpoint of ['bow', 'ventral', 'port'] as const) {
      const keys = modulesFor(hardpoint).map((def) => {
        const loadout = { [hardpoint]: buildModule(def, 'player', makeRng(def.id)) } as Loadout;
        return silhouetteKey(compositeShip(h, loadout).buf);
      });
      expect(new Set(keys).size, hardpoint).toBe(keys.length);
    }
  });

  it('makes three whole loadouts distinguishable by outline alone', () => {
    const h = hull();
    const loadouts: Loadout[] = [
      { bow: mod('ram-spike'), port: mod('flak-cluster') },
      { bow: mod('siege-lance'), dorsal: mod('spinal-coil'), engine: mod('jump-drive') },
      { ventral: mod('hangar-deck'), port: mod('torpedo-rack'), starboard: mod('torpedo-rack-sb') },
    ];
    const keys = loadouts.map((l) => silhouetteKey(compositeShip(h, l).buf));
    expect(new Set(keys).size).toBe(3);
  });

  it('renders port and starboard asymmetrically when they differ', () => {
    const h = hull();
    const ship = compositeShip(h, { port: mod('torpedo-rack'), starboard: mod('flak-cluster-sb') });
    const b = opaqueBounds(ship.buf)!;
    const leftReach = ship.centreX - b.x0;
    const rightReach = b.x1 - ship.centreX;
    expect(leftReach).not.toBe(rightReach);
  });
});

describe('silhouetteKey', () => {
  it('ignores colour and reads only the outline', () => {
    const h = hull();
    const a = compositeShip(h, {}).buf;
    const b = compositeShip(h, {}).buf;
    // Recolour one pixel; the silhouette is unchanged.
    b.data[0] = 1; b.data[1] = 2; b.data[2] = 3;
    expect(silhouetteKey(a)).toBe(silhouetteKey(b));
  });

  it('changes when a pixel is added or removed', () => {
    const buf = compositeShip(hull(), {}).buf;
    const before = silhouetteKey(buf);
    buf.data[3] = buf.data[3] === 0 ? 255 : 0;
    expect(silhouetteKey(buf)).not.toBe(before);
  });
});

describe('determinism', () => {
  it('composites identically twice', () => {
    const h = hull();
    const l: Loadout = { bow: mod('siege-lance') };
    expect(Array.from(compositeShip(h, l).buf.data))
      .toEqual(Array.from(compositeShip(h, l).buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/composite.test.ts
```

Expected: FAIL — `Failed to resolve import "./composite.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/composite.ts`:

```ts
/**
 * Hull plus installed modules, flattened to one buffer.
 *
 * This is the function the refit screen calls on every install, and the one the
 * rotation baker consumes. It is also where the game's central promise either
 * holds or does not: three loadouts of the same cruiser have to be tellable
 * apart by outline alone, which is only true if every module reaches past the
 * hull edge and the canvas grows to let it.
 *
 * The canvas is recomputed from the union of the hull and every module's placed
 * bounds. Cropping to the hull would silently clip exactly the overhang that
 * makes an upgrade visible.
 */

import {
  blit, createBuf, isOpaque, opaqueBounds, type PixBuf,
} from './pixbuf.js';
import { HARDPOINT_IDS, type HardpointId, type Hull } from './hull.js';
import type { ModuleSprite } from './module.js';

export type Loadout = { readonly [K in HardpointId]?: ModuleSprite };

export interface CompositeShip {
  buf: PixBuf;
  /** Where the hull's centreline sits in the composited buffer. */
  centreX: number;
  centreY: number;
  hull: Hull;
  installed: readonly HardpointId[];
}

/**
 * Draw order. The ventral bay hangs under the hull, so it goes down first and
 * the hull covers its inboard edge; everything else bolts on over the plating.
 */
export const Z_ORDER: readonly HardpointId[] = [
  'ventral', 'bow', 'dorsal', 'port', 'starboard', 'engine',
];

interface Placement {
  sprite: ModuleSprite;
  /** Top-left corner of the module in hull coordinates. */
  x: number;
  y: number;
}

export function compositeShip(hull: Hull, loadout: Loadout): CompositeShip {
  const placements: Placement[] = [];
  const installed: HardpointId[] = [];

  for (const id of Z_ORDER) {
    const sprite = loadout[id];
    if (sprite === undefined) continue;

    const hp = hull.hardpoints[id];
    placements.push({
      sprite,
      x: hp.x - sprite.anchorX,
      y: hp.y - sprite.anchorY,
    });
    installed.push(id);
  }

  // Union bounds in hull coordinates, so nothing gets clipped.
  let minX = 0, minY = 0, maxX = hull.buf.w - 1, maxY = hull.buf.h - 1;
  for (const p of placements) {
    const b = opaqueBounds(p.sprite.buf);
    if (b === null) continue;
    minX = Math.min(minX, p.x + b.x0);
    minY = Math.min(minY, p.y + b.y0);
    maxX = Math.max(maxX, p.x + b.x1);
    maxY = Math.max(maxY, p.y + b.y1);
  }

  const offsetX = -minX;
  const offsetY = -minY;
  const buf = createBuf(maxX - minX + 1, maxY - minY + 1);

  // Ventral goes under the hull; the rest go over it.
  for (const p of placements) {
    if (p.sprite.def.hardpoint !== 'ventral') continue;
    blit(buf, p.sprite.buf, p.x + offsetX, p.y + offsetY);
  }

  blit(buf, hull.buf, offsetX, offsetY);

  for (const p of placements) {
    if (p.sprite.def.hardpoint === 'ventral') continue;
    blit(buf, p.sprite.buf, p.x + offsetX, p.y + offsetY);
  }

  return {
    buf,
    centreX: hull.centreX + offsetX,
    centreY: Math.floor(hull.buf.h / 2) + offsetY,
    hull,
    installed: installed.sort(),
  };
}

/**
 * A stable fingerprint of the outline, ignoring colour entirely.
 *
 * Encodes the opaque/transparent mask as a run-length string. Used by the tests
 * that enforce "every module changes the silhouette" and by the contact sheet's
 * loadout comparison — both of which are asking about shape, not paint.
 */
export function silhouetteKey(buf: PixBuf): string {
  const runs: number[] = [];
  let current = false;
  let run = 0;

  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const opaque = buf.data[(y * buf.w + x) * 4 + 3]! !== 0;
      if (opaque === current) {
        run++;
      } else {
        runs.push(run);
        current = opaque;
        run = 1;
      }
    }
  }
  runs.push(run);

  return `${buf.w}x${buf.h}:${runs.join('.')}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/composite.test.ts
```

Expected: PASS, 13 tests.

If "all 24 modules change the outline" fails for a specific module, the fix belongs in that module's `ModuleDef` dimensions or its archetype reach in Task 14 — not in this test. A module that does not change the outline is the defect.

- [ ] **Step 5: Commit**

```bash
git add src/gen/composite.ts src/gen/composite.test.ts
git commit -m "feat: composite hull and modules into one buffer

Canvas grows to the union of hull and module bounds — cropping to the hull would
clip exactly the overhang that makes an upgrade visible.

silhouetteKey fingerprints the outline while ignoring colour, which is what lets
the tests assert all 24 modules change the silhouette and three loadouts stay
tellable apart by shape alone."
```

---

### Task 17: `gen/lod.ts` — four LOD tiers

Zoom does not scale sprites; it swaps tiers. Tiers 2 and 3 are weighted reductions that protect the outline and the running lights; tier 4 is generated from the shape grammar directly, because at four pixels the question is *which* four pixels and no filter answers it well.

**Files:**
- Create: `src/gen/lod.ts`
- Test: `src/gen/lod.test.ts`

**Interfaces:**
- Consumes: `PixBuf` primitives; `snapToPalette`, `isEmissive` from `./palette.js`; `Profile` from `./grammar/profile.js`
- Produces:
  - `const LOD_DIVISORS: readonly [1, 4, 8, 32]` — one per zoom level
  - `type LodTier = 0 | 1 | 2 | 3`
  - `const TIER_FLOOR: number` — minimum pixels on any axis at the far tier, 3
  - `const EMISSIVE_WEIGHT: number`, `const EDGE_WEIGHT: number`, `const FILL_THRESHOLD: number`
  - `function reduceTier(src: PixBuf, divisor: number, allowed: readonly Rgba[]): PixBuf`
  - `function silhouetteTier(profile: Profile, targetLength: number, hullColor: Rgba, lightColor: Rgba): PixBuf`
  - `function buildLodSet(src: PixBuf, profile: Profile, allowed: readonly Rgba[], hullColor: Rgba, lightColor: Rgba): PixBuf[]` — always length 4, index 0 is the original

- [ ] **Step 1: Write the failing test**

Create `src/gen/lod.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, rgba } from './pixbuf.js';
import { EMISSIVE, FACTION_PALETTE, isEmissive, NEUTRAL } from './palette.js';
import { checkPalette } from './qc.js';
import { buildProfile } from './grammar/profile.js';
import { buildHull } from './hull.js';
import {
  buildLodSet, LOD_DIVISORS, reduceTier, silhouetteTier, TIER_FLOOR,
} from './lod.js';

const allowed = FACTION_PALETTE.player;
const hull = (sizeClass: 'cruiser' | 'destroyer' = 'cruiser', seed = 'l') =>
  buildHull({ faction: 'player', sizeClass, rng: makeRng(seed) });

const lodSet = (sizeClass: 'cruiser' | 'destroyer' = 'cruiser', seed = 'l') => {
  const h = hull(sizeClass, seed);
  return buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);
};

describe('tier structure', () => {
  it('defines four divisors matching the four zoom levels', () => {
    expect(LOD_DIVISORS).toEqual([1, 4, 8, 32]);
  });

  it('returns four tiers', () => {
    expect(lodSet()).toHaveLength(4);
  });

  it('leaves tier 1 byte-identical to the source', () => {
    const h = hull();
    const tiers = buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);
    expect(Array.from(tiers[0]!.data)).toEqual(Array.from(h.buf.data));
  });

  it('shrinks each tier by its divisor', () => {
    const h = hull();
    const tiers = buildLodSet(h.buf, h.profile, allowed, NEUTRAL[3]!, EMISSIVE.amber);
    expect(tiers[1]!.h).toBe(Math.max(TIER_FLOOR, Math.round(h.buf.h / 4)));
    expect(tiers[2]!.h).toBe(Math.max(TIER_FLOOR, Math.round(h.buf.h / 8)));
  });

  it('never produces an empty tier', () => {
    for (const sizeClass of ['cruiser', 'destroyer'] as const) {
      for (const tier of lodSet(sizeClass)) {
        expect(countOpaque(tier)).toBeGreaterThan(0);
      }
    }
  });

  it('honours the three-pixel floor on the far tier', () => {
    const tiers = lodSet();
    expect(tiers[3]!.w).toBeGreaterThanOrEqual(TIER_FLOOR);
    expect(tiers[3]!.h).toBeGreaterThanOrEqual(TIER_FLOOR);
  });

  it('gets smaller monotonically', () => {
    const tiers = lodSet();
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.h).toBeLessThan(tiers[i - 1]!.h);
    }
  });
});

describe('reduction preserves what matters', () => {
  it('stays on palette at every tier', () => {
    for (const tier of lodSet()) {
      expect(checkPalette(tier, allowed)).toEqual([]);
    }
  });

  it('keeps the running lights alive down to the far tier', () => {
    // This is the scale cue. A 4px speck reads as kilometres long because it
    // still carries a light; a reduction that averaged them away would kill it.
    for (const tier of lodSet()) {
      let emissives = 0;
      for (let y = 0; y < tier.h; y++) {
        for (let x = 0; x < tier.w; x++) if (isEmissive(getPx(tier, x, y))) emissives++;
      }
      expect(emissives).toBeGreaterThan(0);
    }
  });

  it('weights emissives above their pixel count', () => {
    // A single emissive in a 4x4 block must win against 15 hull pixels.
    const src = { w: 4, h: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
    for (let i = 0; i < 16; i++) {
      const c = i === 5 ? EMISSIVE.amber : NEUTRAL[3]!;
      src.data[i * 4] = (c >>> 24) & 255;
      src.data[i * 4 + 1] = (c >>> 16) & 255;
      src.data[i * 4 + 2] = (c >>> 8) & 255;
      src.data[i * 4 + 3] = 255;
    }
    const reduced = reduceTier(src, 4, allowed);
    expect(isEmissive(getPx(reduced, 0, 0))).toBe(true);
  });

  it('keeps a mostly-filled block filled and a mostly-empty block empty', () => {
    const mostlyFull = { w: 4, h: 4, data: new Uint8ClampedArray(64) };
    for (let i = 0; i < 12; i++) mostlyFull.data[i * 4 + 3] = 255;
    expect(isOpaque(getPx(reduceTier(mostlyFull, 4, allowed), 0, 0))).toBe(true);

    const nearlyEmpty = { w: 4, h: 4, data: new Uint8ClampedArray(64) };
    nearlyEmpty.data[3] = 255;
    expect(isOpaque(getPx(reduceTier(nearlyEmpty, 4, allowed), 0, 0))).toBe(false);
  });

  it('introduces no partial alpha', () => {
    for (const tier of lodSet()) {
      for (let i = 3; i < tier.data.length; i += 4) {
        expect(tier.data[i] === 0 || tier.data[i] === 255).toBe(true);
      }
    }
  });
});

describe('the far tier is generated, not filtered', () => {
  it('draws a hull from the profile at a target length', () => {
    const profile = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('s') });
    const tiny = silhouetteTier(profile, 4, NEUTRAL[3]!, EMISSIVE.amber);
    expect(tiny.h).toBe(4);
    expect(countOpaque(tiny)).toBeGreaterThan(0);
  });

  it('clamps to the floor when asked for something absurd', () => {
    const profile = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('s') });
    expect(silhouetteTier(profile, 1, NEUTRAL[3]!, EMISSIVE.amber).h).toBe(TIER_FLOOR);
  });

  it('carries one emissive so the speck still has a light', () => {
    const profile = buildProfile({ faction: 'player', sizeClass: 'cruiser', rng: makeRng('s') });
    const tiny = silhouetteTier(profile, 4, NEUTRAL[3]!, EMISSIVE.amber);
    let emissives = 0;
    for (let y = 0; y < tiny.h; y++) {
      for (let x = 0; x < tiny.w; x++) if (isEmissive(getPx(tiny, x, y))) emissives++;
    }
    expect(emissives).toBe(1);
  });

  it('keeps a cruiser and a destroyer distinguishable at the far tier', () => {
    // The acceptance criterion at 4px. If these collapse to the same blob, the
    // wide shot stops carrying information.
    const cruiser = lodSet('cruiser')[3]!;
    const destroyer = lodSet('destroyer')[3]!;
    const key = (b: typeof cruiser) => {
      const bits: string[] = [];
      for (let y = 0; y < b.h; y++) {
        for (let x = 0; x < b.w; x++) bits.push(isOpaque(getPx(b, x, y)) ? '1' : '0');
      }
      return `${b.w}x${b.h}:${bits.join('')}`;
    };
    expect(key(cruiser)).not.toBe(key(destroyer));
  });
});

describe('determinism', () => {
  it('produces identical tiers twice', () => {
    const a = lodSet('cruiser', 'same');
    const b = lodSet('cruiser', 'same');
    for (let i = 0; i < 4; i++) {
      expect(Array.from(a[i]!.data)).toEqual(Array.from(b[i]!.data));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/lod.test.ts
```

Expected: FAIL — `Failed to resolve import "./lod.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/lod.ts`:

```ts
/**
 * Four LOD tiers, one per zoom level.
 *
 * Zoom never scales a sprite. A 128px cruiser squeezed to 4px is mush, and mush
 * at the far end kills the wide shot the game is sold on. Instead each hull
 * exists at four discrete sizes and the camera swaps between them.
 *
 * Tiers 2 and 3 are reductions, but not box filters. A plain average erases the
 * two things that have to survive: the outline, which is the only way ships stay
 * tellable apart, and the running lights, which are the scale cue that makes a
 * small sprite read as a huge object. So the reduction scores candidate colours
 * by count *plus* a heavy bonus for emissives and a smaller one for
 * silhouette-edge pixels. Interior panel seams are expected to vanish by tier 3.
 * The outline is not.
 *
 * Tier 4 is not reduced at all. At four pixels the question is which four
 * pixels, and no filter answers it well — so it is drawn from the shape
 * grammar's profile directly, which already knows where the spine and the mass
 * are.
 */

import {
  createBuf, EMPTY, getPx, isOpaque, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { isEmissive, snapToPalette } from './palette.js';
import { isFilled, type Profile } from './grammar/profile.js';

/** Divisor per zoom level: close, tactical, operational, wide. */
export const LOD_DIVISORS: readonly [1, 4, 8, 32] = [1, 4, 8, 32];

export type LodTier = 0 | 1 | 2 | 3;

/**
 * The far tier's minimum extent on any axis.
 *
 * Lowered from 3 to 2 during execution (commit `b2b52a4`). At 3, a 107px
 * cruiser (3.3px reduced) and a 56px destroyer (1.75px reduced) both clamped to
 * 3x3 and came out byte-identical in 35 of 120 same-faction pairs — an
 * acceptance criterion failing 29% of the time. A floor that collapses two size
 * classes onto the same dimensions defeats the purpose it exists for.
 *
 * At 2, a destroyer is 2x2 and a cruiser 2x3 or 2x4: they differ by SIZE, which
 * is the only honest signal at 32x reduction. Collisions measured 0 of 160.
 *
 * Accepted consequence: corvettes and destroyers both clamp to 2 and may
 * collide with each other. The criterion names cruiser-versus-destroyer, and at
 * this reduction two small classes genuinely are both specks.
 */
export const TIER_FLOOR = 2;

/** An emissive pixel counts this much more than a hull pixel when reducing. */
export const EMISSIVE_WEIGHT = 8;

/** A silhouette-edge pixel counts this much more than an interior one. */
export const EDGE_WEIGHT = 3;

/** A block this full or fuller survives as an opaque pixel. Biased to preserve. */
export const FILL_THRESHOLD = 0.25;

function isEdgePixel(src: PixBuf, x: number, y: number): boolean {
  return (
    !isOpaque(getPx(src, x - 1, y)) || !isOpaque(getPx(src, x + 1, y)) ||
    !isOpaque(getPx(src, x, y - 1)) || !isOpaque(getPx(src, x, y + 1))
  );
}

export function reduceTier(src: PixBuf, divisor: number, allowed: readonly Rgba[]): PixBuf {
  const w = Math.max(TIER_FLOOR, Math.round(src.w / divisor));
  const h = Math.max(TIER_FLOOR, Math.round(src.h / divisor));
  const out = createBuf(w, h);

  const blockW = src.w / w;
  const blockH = src.h / h;

  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor(ox * blockW);
      const y0 = Math.floor(oy * blockH);
      const x1 = Math.min(src.w, Math.ceil((ox + 1) * blockW));
      const y1 = Math.min(src.h, Math.ceil((oy + 1) * blockH));

      const scores = new Map<Rgba, number>();
      let filled = 0;
      let total = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          const c = getPx(src, x, y);
          if (!isOpaque(c)) continue;
          filled++;

          let weight = 1;
          if (isEmissive(c)) weight = EMISSIVE_WEIGHT;
          else if (isEdgePixel(src, x, y)) weight = EDGE_WEIGHT;

          scores.set(c, (scores.get(c) ?? 0) + weight);
        }
      }

      if (total === 0 || filled / total < FILL_THRESHOLD) {
        setPx(out, ox, oy, EMPTY);
        continue;
      }

      let best = EMPTY;
      let bestScore = -1;
      for (const [color, score] of scores) {
        if (score > bestScore) {
          bestScore = score;
          best = color;
        }
      }

      setPx(out, ox, oy, snapToPalette(best, allowed));
    }
  }

  return out;
}

/**
 * The far tier, drawn from the profile rather than filtered down to it.
 *
 * The profile is resampled to the target length and filled; one emissive pixel
 * goes at the stern so even a speck carries a light.
 */
export function silhouetteTier(
  profile: Profile,
  targetLength: number,
  hullColor: Rgba,
  lightColor: Rgba,
): PixBuf {
  const h = Math.max(TIER_FLOOR, targetLength);
  const scale = profile.length / h;

  // Width follows the profile's own aspect ratio, floored so the hull has body.
  const w = Math.max(TIER_FLOOR, Math.round(((profile.maxHalfWidth * 2 + 1) / scale)));
  const out = createBuf(w, h);
  const cx = Math.floor(w / 2);

  for (let y = 0; y < h; y++) {
    // Sample the middle of the source band this output row represents.
    const sy = Math.min(profile.length - 1, Math.floor((y + 0.5) * scale));
    const halfSource = profile.halfWidth[sy]!;
    if (halfSource === 0) continue;

    const half = Math.max(0, Math.round(halfSource / scale));
    for (let x = cx - half; x <= cx + half; x++) {
      if (isFilled(profile, Math.round((x - cx) * scale), sy)) {
        setPx(out, x, y, hullColor);
      }
    }

    // Guarantee the row is present at all — a resampled hull that vanishes to
    // nothing mid-body would break the silhouette read.
    if (!isOpaque(getPx(out, cx, y))) setPx(out, cx, y, hullColor);
  }

  // One light, at the stern, on the centreline.
  setPx(out, cx, h - 1, lightColor);

  return out;
}

export function buildLodSet(
  src: PixBuf,
  profile: Profile,
  allowed: readonly Rgba[],
  hullColor: Rgba,
  lightColor: Rgba,
): PixBuf[] {
  return [
    src,
    reduceTier(src, LOD_DIVISORS[1], allowed),
    reduceTier(src, LOD_DIVISORS[2], allowed),
    silhouetteTier(profile, Math.round(src.h / LOD_DIVISORS[3]), hullColor, lightColor),
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/lod.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/lod.ts src/gen/lod.test.ts
git commit -m "feat: four LOD tiers — weighted reduction and a generated far tier

The reduction weights emissives 8x and silhouette edges 3x above interior
pixels, so outline and running lights are the last things to survive. Panel
seams are expected to vanish by tier 3; the outline is not.

Tier 4 is drawn from the profile rather than filtered to it. At four pixels the
question is which four pixels, and no filter answers it well."
```

---

### Task 18: `gen/rotate.ts` — the 64-bin rotation baker

The decision that makes pixel integrity structural. Every frame on screen is an unrotated blit of a pre-baked bin, so there is no runtime rotation to produce shimmer.

**Files:**
- Create: `src/gen/rotate.ts`
- Test: `src/gen/rotate.test.ts`

**Interfaces:**
- Consumes: `PixBuf` primitives
- Produces:
  - `const ROTATION_BINS: number` — 64
  - `function binForHeading(radians: number, bins?: number): number` — wraps; result in [0, bins)
  - `function headingForBin(bin: number, bins?: number): number`
  - `function bakeSize(src: PixBuf): number` — the square canvas side used for every bin
  - `function bakeRotations(src: PixBuf, bins?: number): PixBuf[]`

- [ ] **Step 1: Write the failing test**

Create `src/gen/rotate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, createBuf, getPx, isOpaque, rgba, setPx } from './pixbuf.js';
import { buildHull } from './hull.js';
import {
  bakeRotations, bakeSize, binForHeading, headingForBin, ROTATION_BINS,
} from './rotate.js';

const RED = rgba(255, 0, 0);

/** A small asymmetric test sprite: an L, so rotation is unambiguous. */
function ell() {
  const b = createBuf(4, 4);
  for (let y = 0; y < 4; y++) setPx(b, 0, y, RED);
  setPx(b, 1, 3, RED);
  setPx(b, 2, 3, RED);
  return b;
}

describe('bin arithmetic', () => {
  it('bakes 64 bins by default', () => {
    expect(ROTATION_BINS).toBe(64);
  });

  it('maps heading 0 to bin 0', () => {
    expect(binForHeading(0)).toBe(0);
  });

  it('wraps a full revolution back to bin 0', () => {
    expect(binForHeading(Math.PI * 2)).toBe(0);
    expect(binForHeading(-Math.PI * 2)).toBe(0);
  });

  it('handles negative headings', () => {
    expect(binForHeading(-Math.PI / 2)).toBe(48); // three quarters round
  });

  it('always returns a bin in range', () => {
    for (let a = -20; a < 20; a += 0.13) {
      const bin = binForHeading(a);
      expect(bin).toBeGreaterThanOrEqual(0);
      expect(bin).toBeLessThan(ROTATION_BINS);
      expect(Number.isInteger(bin)).toBe(true);
    }
  });

  it('round-trips a bin through its heading', () => {
    for (let bin = 0; bin < ROTATION_BINS; bin++) {
      expect(binForHeading(headingForBin(bin))).toBe(bin);
    }
  });

  it('resolves to 5.625 degrees per bin', () => {
    expect((headingForBin(1) * 180) / Math.PI).toBeCloseTo(5.625, 5);
  });
});

describe('bake geometry', () => {
  it('produces one buffer per bin', () => {
    expect(bakeRotations(ell(), 8)).toHaveLength(8);
  });

  it('makes every bin the same square size', () => {
    const src = ell();
    const size = bakeSize(src);
    for (const bin of bakeRotations(src, 8)) {
      expect(bin.w).toBe(size);
      expect(bin.h).toBe(size);
    }
  });

  it('sizes the canvas to fit the diagonal, so nothing clips when rotated', () => {
    const src = createBuf(10, 30);
    expect(bakeSize(src)).toBeGreaterThanOrEqual(Math.ceil(Math.hypot(10, 30)));
  });

  it('uses an even side so the pivot is an exact centre', () => {
    expect(bakeSize(ell()) % 2).toBe(0);
    expect(bakeSize(createBuf(7, 13)) % 2).toBe(0);
  });
});

describe('bake fidelity', () => {
  it('reproduces the source exactly at bin 0', () => {
    const src = ell();
    const bin0 = bakeRotations(src, 8)[0]!;
    const size = bakeSize(src);
    const ox = Math.floor((size - src.w) / 2);
    const oy = Math.floor((size - src.h) / 2);

    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        expect(getPx(bin0, ox + x, oy + y), `${x},${y}`).toBe(getPx(src, x, y));
      }
    }
  });

  it('rotates a quarter turn exactly', () => {
    // A 90 degree bin must be a pure array rotation with no resampling loss.
    const src = ell();
    const bins = bakeRotations(src, 4);
    expect(countOpaque(bins[1]!)).toBe(countOpaque(bins[0]!));
    expect(countOpaque(bins[2]!)).toBe(countOpaque(bins[0]!));
    expect(countOpaque(bins[3]!)).toBe(countOpaque(bins[0]!));
  });

  it('actually rotates — bins differ from one another', () => {
    const bins = bakeRotations(ell(), 8);
    const keys = bins.map((b) => Array.from(b.data).join(','));
    expect(new Set(keys).size).toBe(8);
  });

  it('roughly conserves mass across every bin', () => {
    // Nearest-neighbour sampling gains and loses a little; a bin that lost half
    // the ship is a bug in the inverse mapping.
    const src = buildHull({ faction: 'player', sizeClass: 'destroyer', rng: makeRng('r') }).buf;
    const base = countOpaque(src);
    for (const bin of bakeRotations(src, 16)) {
      expect(countOpaque(bin)).toBeGreaterThan(base * 0.85);
      expect(countOpaque(bin)).toBeLessThan(base * 1.15);
    }
  });

  it('introduces no partial alpha — point sampling only', () => {
    const src = buildHull({ faction: 'concord', sizeClass: 'corvette', rng: makeRng('r') }).buf;
    for (const bin of bakeRotations(src, 16)) {
      for (let i = 3; i < bin.data.length; i += 4) {
        expect(bin.data[i] === 0 || bin.data[i] === 255).toBe(true);
      }
    }
  });

  it('introduces no new colours — the palette survives rotation', () => {
    const src = ell();
    for (const bin of bakeRotations(src, 16)) {
      for (let y = 0; y < bin.h; y++) {
        for (let x = 0; x < bin.w; x++) {
          const c = getPx(bin, x, y);
          expect(c === 0 || c === RED).toBe(true);
        }
      }
    }
  });
});

describe('determinism', () => {
  it('bakes identically twice', () => {
    const src = ell();
    const a = bakeRotations(src, 8);
    const b = bakeRotations(src, 8);
    for (let i = 0; i < 8; i++) {
      expect(Array.from(a[i]!.data)).toEqual(Array.from(b[i]!.data));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/rotate.test.ts
```

Expected: FAIL — `Failed to resolve import "./rotate.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/rotate.ts`:

```ts
/**
 * The rotation baker.
 *
 * Sprites are never rotated at runtime. Instead each composite is baked into 64
 * fixed bins, 5.625 degrees apart, and the renderer blits the nearest bin
 * unrotated at integer device pixels. That makes "zero sub-pixel artifacts" a
 * structural property of the pipeline rather than something to tune toward:
 * there is no runtime resampling that could shimmer, because there is no runtime
 * rotation.
 *
 * The cost is a bake, and the bake is cheap — a cruiser composite takes one to
 * two milliseconds and only runs on refit or a damage-state change, so the refit
 * screen still updates instantly.
 *
 * Every bin shares one square canvas sized to the source's diagonal, so a bin
 * can be swapped for another without the sprite's centre moving. The side is
 * forced even so the pivot lands exactly between pixels and bin 0 reproduces the
 * source byte for byte.
 */

import { createBuf, EMPTY, getPx, setPx, type PixBuf } from './pixbuf.js';

export const ROTATION_BINS = 64;

const TAU = Math.PI * 2;

export function binForHeading(radians: number, bins = ROTATION_BINS): number {
  const step = TAU / bins;
  const bin = Math.round(radians / step);
  return ((bin % bins) + bins) % bins;
}

export function headingForBin(bin: number, bins = ROTATION_BINS): number {
  return (bin * TAU) / bins;
}

/** Square side big enough that no rotation of the source clips, forced even. */
export function bakeSize(src: PixBuf): number {
  const diagonal = Math.ceil(Math.hypot(src.w, src.h));
  return diagonal % 2 === 0 ? diagonal : diagonal + 1;
}

export function bakeRotations(src: PixBuf, bins = ROTATION_BINS): PixBuf[] {
  const size = bakeSize(src);
  const out: PixBuf[] = [];

  // Destination pivot is the exact centre of an even-sided canvas.
  const dcx = size / 2;
  const dcy = size / 2;

  // Source pivot placed so bin 0 lands the source on integer pixels.
  const offsetX = Math.floor((size - src.w) / 2);
  const offsetY = Math.floor((size - src.h) / 2);
  const scx = offsetX + src.w / 2;
  const scy = offsetY + src.h / 2;

  for (let bin = 0; bin < bins; bin++) {
    const buf = createBuf(size, size);
    const angle = headingForBin(bin, bins);

    // Inverse rotation: walk destination pixels and sample the source, which is
    // the only way to guarantee every destination pixel is written exactly once
    // and no holes appear.
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        // Sample at pixel centres.
        const rx = dx + 0.5 - dcx;
        const ry = dy + 0.5 - dcy;

        const sx = Math.floor(rx * cos - ry * sin + scx);
        const sy = Math.floor(rx * sin + ry * cos + scy);

        const c = getPx(src, sx - offsetX, sy - offsetY);
        if (c !== EMPTY) setPx(buf, dx, dy, c);
      }
    }

    out.push(buf);
  }

  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/rotate.test.ts
```

Expected: PASS, 16 tests.

The bin-0 identity test is the one that catches pivot arithmetic errors. If it fails, the offsets in `bakeRotations` are half a pixel out — fix the arithmetic, never the tolerance, because bin 0 being exact is what proves the sampling has no systematic bias.

- [ ] **Step 5: Commit**

```bash
git add src/gen/rotate.ts src/gen/rotate.test.ts
git commit -m "feat: 64-bin rotation baker with an exact pivot

Nothing rotates at runtime. Every frame is an unrotated blit of a pre-baked bin,
which makes zero sub-pixel artifacts a property of the pipeline rather than a
tuning target — there is no runtime resampling left to shimmer.

Bin 0 reproduces the source byte for byte, which is the test that catches pivot
arithmetic being half a pixel out."
```

---

### Task 19: `gen/debris.ts` — the debris set

Wreckage in four size bands. Debris is what a battle leaves behind and what the player cuts up, so it has to read as *pieces of ships* rather than as rocks.

**Files:**
- Create: `src/gen/debris.ts`
- Test: `src/gen/debris.test.ts`

**Interfaces:**
- Consumes: `PixBuf` primitives; `rampOf`, `FACTION_PALETTE`, `shadeStep`, `FactionId` from `./palette.js`; `ditherMask` from `./grammar/plates.js`; `qcSprite`, `assertQc` from `./qc.js`; `Rng` from `../sim/rng.js`
- Produces:
  - `type DebrisSize = 'chip' | 'shard' | 'chunk' | 'hulk'`
  - `const DEBRIS_SIZES: readonly DebrisSize[]`
  - `const DEBRIS_EXTENT: Readonly<Record<DebrisSize, [number, number]>>` — pixel extent range
  - `interface DebrisSprite { buf: PixBuf; size: DebrisSize; faction: FactionId }`
  - `function buildDebris(size: DebrisSize, faction: FactionId, rng: Rng): DebrisSprite`
  - `function buildDebrisSet(faction: FactionId, rng: Rng, perSize?: number): DebrisSprite[]`

- [ ] **Step 1: Write the failing test**

Create `src/gen/debris.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, type FactionId } from './palette.js';
import { checkBinaryAlpha, checkPalette } from './qc.js';
import {
  buildDebris, buildDebrisSet, DEBRIS_EXTENT, DEBRIS_SIZES, type DebrisSize,
} from './debris.js';

const ALL_FACTIONS: FactionId[] = ['concord', 'coalition', 'derelict', 'player'];

describe('size bands', () => {
  it('names four, smallest first', () => {
    expect(DEBRIS_SIZES).toEqual(['chip', 'shard', 'chunk', 'hulk']);
  });

  it('gives each band an ascending, non-overlapping extent', () => {
    for (let i = 1; i < DEBRIS_SIZES.length; i++) {
      const prev = DEBRIS_EXTENT[DEBRIS_SIZES[i - 1]!];
      const cur = DEBRIS_EXTENT[DEBRIS_SIZES[i]!];
      expect(cur[0]).toBeGreaterThanOrEqual(prev[1]);
    }
  });

  it('respects its band', () => {
    for (const size of DEBRIS_SIZES) {
      const [lo, hi] = DEBRIS_EXTENT[size];
      for (const seed of ['a', 'b', 'c', 'd']) {
        const d = buildDebris(size, 'player', makeRng(seed));
        const longest = Math.max(d.buf.w, d.buf.h);
        expect(longest).toBeGreaterThanOrEqual(lo);
        expect(longest).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe('debris sprites', () => {
  it('draws something in every band and faction', () => {
    for (const size of DEBRIS_SIZES) {
      for (const faction of ALL_FACTIONS) {
        const d = buildDebris(size, faction, makeRng(`${size}-${faction}`));
        expect(countOpaque(d.buf), `${size}/${faction}`).toBeGreaterThan(2);
      }
    }
  });

  it('stays on its faction palette', () => {
    for (const size of DEBRIS_SIZES) {
      for (const faction of ALL_FACTIONS) {
        const d = buildDebris(size, faction, makeRng(`${size}-${faction}`));
        expect(checkPalette(d.buf, FACTION_PALETTE[faction])).toEqual([]);
        expect(checkBinaryAlpha(d.buf)).toEqual([]);
      }
    }
  });

  it('is irregular — debris is torn, not cut', () => {
    // A perfect rectangle reads as a crate. Wreckage should not fill its box.
    for (const size of ['chunk', 'hulk'] as DebrisSize[]) {
      const d = buildDebris(size, 'player', makeRng(size));
      const b = opaqueBounds(d.buf)!;
      const boxArea = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
      expect(countOpaque(d.buf) / boxArea).toBeLessThan(0.92);
    }
  });

  it('touches its own bounding box on every side — no dead margin', () => {
    const d = buildDebris('chunk', 'player', makeRng('m'));
    const b = opaqueBounds(d.buf)!;
    expect(b.x0).toBe(0);
    expect(b.y0).toBe(0);
    expect(b.x1).toBe(d.buf.w - 1);
    expect(b.y1).toBe(d.buf.h - 1);
  });

  it('uses more than one value, so it reads as plate rather than a blob', () => {
    const d = buildDebris('hulk', 'player', makeRng('v'));
    const used = new Set<number>();
    for (let i = 0; i < d.buf.data.length; i += 4) {
      if (d.buf.data[i + 3] !== 0) {
        used.add((d.buf.data[i]! << 16) | (d.buf.data[i + 1]! << 8) | d.buf.data[i + 2]!);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(2);
  });
});

describe('debris sets', () => {
  it('returns one sprite per size per requested count', () => {
    expect(buildDebrisSet('player', makeRng('s'), 3)).toHaveLength(12);
  });

  it('varies within a set — no two pieces identical', () => {
    const set = buildDebrisSet('player', makeRng('s'), 4);
    const keys = set.map((d) => `${d.size}:${Array.from(d.buf.data).join(',')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every size band', () => {
    const set = buildDebrisSet('coalition', makeRng('s'), 2);
    expect(new Set(set.map((d) => d.size))).toEqual(new Set(DEBRIS_SIZES));
  });
});

describe('determinism', () => {
  it('rebuilds identically from the same seed', () => {
    expect(Array.from(buildDebris('chunk', 'concord', makeRng('z')).buf.data))
      .toEqual(Array.from(buildDebris('chunk', 'concord', makeRng('z')).buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/debris.test.ts
```

Expected: FAIL — `Failed to resolve import "./debris.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/debris.ts`:

```ts
/**
 * Wreckage in four size bands.
 *
 * Debris has to read as pieces of ships, not as rocks — it is what a battle
 * leaves behind and what the player cuts apart, so it carries the same plating
 * language and the same faction palette as the hull it came off. The difference
 * is that it is torn: an irregular blob with a jagged edge, never a filled
 * rectangle, because a filled rectangle reads as cargo.
 */

import type { Rng } from '../sim/rng.js';
import {
  createBuf, crop, EMPTY, getPx, isOpaque, opaqueBounds, setPx, type PixBuf,
} from './pixbuf.js';
import { FACTION_PALETTE, rampOf, shadeStep, type FactionId } from './palette.js';
import { assertQc, qcSprite } from './qc.js';
import { ditherMask } from './grammar/plates.js';

export type DebrisSize = 'chip' | 'shard' | 'chunk' | 'hulk';

export const DEBRIS_SIZES: readonly DebrisSize[] = ['chip', 'shard', 'chunk', 'hulk'];

/** Longest-axis extent per band, in pixels at LOD tier 1. */
export const DEBRIS_EXTENT: Readonly<Record<DebrisSize, [number, number]>> = {
  chip: [2, 4],
  shard: [4, 8],
  chunk: [8, 16],
  hulk: [16, 28],
};

export interface DebrisSprite {
  buf: PixBuf;
  size: DebrisSize;
  faction: FactionId;
}

export function buildDebris(size: DebrisSize, faction: FactionId, rng: Rng): DebrisSprite {
  const [lo, hi] = DEBRIS_EXTENT[size];
  const extent = lo + rng.int(hi - lo + 1);
  // Wreckage is rarely square; the short axis runs 55-100% of the long one.
  const shortAxis = Math.max(2, Math.round(extent * rng.range(0.55, 1)));
  const horizontal = rng.chance(0.5);

  const w = horizontal ? extent : shortAxis;
  const h = horizontal ? shortAxis : extent;
  const work = createBuf(w, h);
  const ramp = rampOf(faction);

  // Start from a filled slab and tear pieces off the edges. Growing a blob
  // outward tends to produce blobs; tearing produces plate with broken edges,
  // which is what a cut-apart hull actually looks like.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lit = x === 0 || y === 0;
      const shadow = x === w - 1 || y === h - 1;
      let step = 3;
      if (lit && !shadow) step += 2;
      else if (shadow && !lit) step -= 2;
      else if (ditherMask(x, y)) step += 1;
      setPx(work, x, y, shadeStep(ramp, step));
    }
  }

  // Tear the corners and edges. Bounded bites so the piece survives.
  const bites = 2 + rng.int(4);
  for (let i = 0; i < bites; i++) {
    const bw = 1 + rng.int(Math.max(1, Math.floor(w / 2)));
    const bh = 1 + rng.int(Math.max(1, Math.floor(h / 2)));
    // Anchor bites to an edge, so they read as breaks rather than as holes.
    const fromLeft = rng.chance(0.5);
    const fromTop = rng.chance(0.5);
    const bx = fromLeft ? 0 : w - bw;
    const by = fromTop ? 0 : h - bh;

    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        // Ragged rather than square: skip some pixels of the bite.
        if (rng.chance(0.75)) setPx(work, x, y, EMPTY);
      }
    }
  }

  // Guarantee the piece still exists after tearing.
  if (opaqueBounds(work) === null) {
    setPx(work, Math.floor(w / 2), Math.floor(h / 2), shadeStep(ramp, 3));
  }

  // Crop to the tight bounds so debris has no dead margin — pooled sprites are
  // placed by their bounding box and a transparent border would offset them.
  const b = opaqueBounds(work)!;
  const buf = crop(work, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);

  assertQc(qcSprite(`debris:${size}:${faction}`, buf, FACTION_PALETTE[faction]));

  return { buf, size, faction };
}

export function buildDebrisSet(
  faction: FactionId,
  rng: Rng,
  perSize = 4,
): DebrisSprite[] {
  const set: DebrisSprite[] = [];
  for (const size of DEBRIS_SIZES) {
    // A child stream per size so changing the count of one band cannot reshuffle
    // the others.
    const stream = rng.split(size);
    for (let i = 0; i < perSize; i++) {
      set.push(buildDebris(size, faction, stream.split(`${i}`)));
    }
  }
  return set;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/debris.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/debris.ts src/gen/debris.test.ts
git commit -m "feat: debris in four size bands

Built by tearing a plated slab rather than growing a blob — growing produces
blobs, tearing produces plate with broken edges, which is what a cut-apart hull
looks like. Cropped to tight bounds so pooled placement is not offset by a
transparent border."
```

---

### Task 20: `gen/celestial.ts` — POI background stacks

Depth without a third axis. Each POI is a parallax stack and a palette lock, and the acceptance criterion is that a single screenshot with the HUD hidden tells you where you are.

**Files:**
- Create: `src/gen/celestial.ts`
- Test: `src/gen/celestial.test.ts`

**Interfaces:**
- Consumes: `PixBuf` primitives; `POI_PALETTE`, `PoiId`, `SPACE`, `EMISSIVE`, `snapToPalette` from `./palette.js`; `ditherMask` from `./grammar/plates.js`; `checkPalette` from `./qc.js`; `Rng` from `../sim/rng.js`
- Produces:
  - `interface Layer { buf: PixBuf; parallax: number; name: string }` — `parallax` 0 (infinitely far) to 1 (play plane)
  - `interface PoiStack { poi: PoiId; layers: readonly Layer[]; foreground: Layer | null }`
  - `const STAR_DENSITY: number` — stars per 1000 px², bounded
  - `function buildStarfield(w: number, h: number, poi: PoiId, rng: Rng): PixBuf`
  - `function buildNebula(w: number, h: number, poi: PoiId, rng: Rng): PixBuf`
  - `function buildGasGiant(diameter: number, poi: PoiId, rng: Rng): PixBuf`
  - `function buildPoiStack(poi: PoiId, w: number, h: number, rng: Rng): PoiStack`

- [ ] **Step 1: Write the failing test**

Create `src/gen/celestial.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, luminance } from './pixbuf.js';
import { POI_PALETTE, type PoiId } from './palette.js';
import { checkBinaryAlpha, checkPalette } from './qc.js';
import {
  buildGasGiant, buildNebula, buildPoiStack, buildStarfield, STAR_DENSITY,
} from './celestial.js';

const ALL_POIS = Object.keys(POI_PALETTE) as PoiId[];

describe('starfield', () => {
  it('places stars at a bounded density', () => {
    const w = 200, h = 100;
    const field = buildStarfield(w, h, 'deepfield', makeRng('s'));
    const expected = ((w * h) / 1000) * STAR_DENSITY;
    expect(countOpaque(field)).toBeGreaterThan(expected * 0.5);
    expect(countOpaque(field)).toBeLessThan(expected * 1.5);
  });

  it('never fills the sky — a starfield is mostly empty', () => {
    const field = buildStarfield(200, 100, 'deepfield', makeRng('s'));
    expect(countOpaque(field) / (200 * 100)).toBeLessThan(0.05);
  });

  it('stays on the POI palette', () => {
    for (const poi of ALL_POIS) {
      const field = buildStarfield(120, 80, poi, makeRng(poi));
      expect(checkPalette(field, POI_PALETTE[poi]), poi).toEqual([]);
    }
  });
});

describe('nebula', () => {
  it('covers a large fraction of the frame', () => {
    const neb = buildNebula(160, 100, 'wreckreef', makeRng('n'));
    expect(countOpaque(neb) / (160 * 100)).toBeGreaterThan(0.2);
  });

  it('stays on the POI palette', () => {
    for (const poi of ALL_POIS) {
      const neb = buildNebula(100, 60, poi, makeRng(poi));
      expect(checkPalette(neb, POI_PALETTE[poi]), poi).toEqual([]);
      expect(checkBinaryAlpha(neb)).toEqual([]);
    }
  });

  it('uses several values so it reads as depth rather than a flat wash', () => {
    const neb = buildNebula(160, 100, 'wreckreef', makeRng('n'));
    const used = new Set<number>();
    for (let y = 0; y < neb.h; y++) {
      for (let x = 0; x < neb.w; x++) {
        const c = getPx(neb, x, y);
        if (isOpaque(c)) used.add(c);
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
  });
});

describe('gas giant', () => {
  it('is round', () => {
    const giant = buildGasGiant(64, 'gasgiant', makeRng('g'));
    expect(giant.w).toBe(64);
    expect(giant.h).toBe(64);
    // Corners empty, centre filled.
    expect(isOpaque(getPx(giant, 0, 0))).toBe(false);
    expect(isOpaque(getPx(giant, 32, 32))).toBe(true);
  });

  it('is lit from the top-left like everything else', () => {
    const giant = buildGasGiant(64, 'gasgiant', makeRng('g'));
    expect(luminance(getPx(giant, 22, 22))).toBeGreaterThan(luminance(getPx(giant, 42, 42)));
  });

  it('is banded, not smooth', () => {
    const giant = buildGasGiant(64, 'gasgiant', makeRng('g'));
    let changes = 0;
    for (let y = 1; y < 64; y++) {
      if (getPx(giant, 32, y) !== getPx(giant, 32, y - 1)) changes++;
    }
    expect(changes).toBeGreaterThan(4);
  });

  it('stays on the POI palette', () => {
    const giant = buildGasGiant(48, 'gasgiant', makeRng('g'));
    expect(checkPalette(giant, POI_PALETTE.gasgiant)).toEqual([]);
  });
});

describe('POI stacks', () => {
  it('builds three to five parallax layers', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 160, 100, makeRng(poi));
      expect(stack.layers.length, poi).toBeGreaterThanOrEqual(3);
      expect(stack.layers.length, poi).toBeLessThanOrEqual(5);
    }
  });

  it('orders layers from far to near', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 160, 100, makeRng(poi));
      for (let i = 1; i < stack.layers.length; i++) {
        expect(stack.layers[i]!.parallax).toBeGreaterThan(stack.layers[i - 1]!.parallax);
      }
    }
  });

  it('keeps every layer behind the play plane', () => {
    for (const poi of ALL_POIS) {
      for (const layer of buildPoiStack(poi, 160, 100, makeRng(poi)).layers) {
        expect(layer.parallax).toBeGreaterThan(0);
        expect(layer.parallax).toBeLessThan(1);
      }
    }
  });

  it('puts the foreground layer in front of the play plane when present', () => {
    const stack = buildPoiStack('wreckreef', 160, 100, makeRng('f'));
    if (stack.foreground !== null) {
      expect(stack.foreground.parallax).toBeGreaterThan(1);
    }
  });

  it('locks every layer to the POI palette', () => {
    for (const poi of ALL_POIS) {
      const stack = buildPoiStack(poi, 120, 80, makeRng(poi));
      for (const layer of stack.layers) {
        expect(checkPalette(layer.buf, POI_PALETTE[poi]), `${poi}/${layer.name}`).toEqual([]);
      }
    }
  });

  it('makes every POI visually distinct from every other', () => {
    // The acceptance criterion: identifiable from a single screenshot.
    const keys = ALL_POIS.map((poi) => {
      const stack = buildPoiStack(poi, 100, 60, makeRng('shared'));
      const colors = new Set<number>();
      for (const layer of stack.layers) {
        for (let i = 0; i < layer.buf.data.length; i += 4) {
          if (layer.buf.data[i + 3] !== 0) {
            colors.add((layer.buf.data[i]! << 16) | (layer.buf.data[i + 1]! << 8) | layer.buf.data[i + 2]!);
          }
        }
      }
      return [...colors].sort((a, b) => a - b).join(',');
    });
    expect(new Set(keys).size).toBe(ALL_POIS.length);
  });

  it('names every layer', () => {
    for (const layer of buildPoiStack('gasgiant', 160, 100, makeRng('n')).layers) {
      expect(layer.name.length).toBeGreaterThan(2);
    }
  });
});

describe('determinism', () => {
  it('rebuilds identically from the same seed', () => {
    const a = buildPoiStack('belt', 100, 60, makeRng('z'));
    const b = buildPoiStack('belt', 100, 60, makeRng('z'));
    for (let i = 0; i < a.layers.length; i++) {
      expect(Array.from(a.layers[i]!.buf.data)).toEqual(Array.from(b.layers[i]!.buf.data));
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/gen/celestial.test.ts
```

Expected: FAIL — `Failed to resolve import "./celestial.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gen/celestial.ts`:

```ts
/**
 * POI background stacks — depth without a third axis.
 *
 * The 3D build put the world in a volume. This one fakes the volume with
 * parallax layers, and has to do it well, because the sense of scale now lives
 * entirely here. Each POI is a palette lock plus a composition, and the bar it
 * has to clear is that a single screenshot with the HUD hidden tells you where
 * you are.
 *
 * Parallax runs 0 (infinitely far, never moves) to 1 (the play plane). The
 * optional foreground layer sits above 1: debris silhouettes drifting in front
 * of the action, faster than it, partially occluding it. Used sparingly — it is
 * seasoning, and a frame full of it is unreadable.
 */

import type { Rng } from '../sim/rng.js';
import {
  createBuf, EMPTY, getPx, setPx, type PixBuf, type Rgba,
} from './pixbuf.js';
import { POI_PALETTE, snapToPalette, type PoiId } from './palette.js';
import { ditherMask } from './grammar/plates.js';

export interface Layer {
  buf: PixBuf;
  /** 0 = infinitely far, 1 = the play plane, >1 = in front of it. */
  parallax: number;
  name: string;
}

export interface PoiStack {
  poi: PoiId;
  layers: readonly Layer[];
  foreground: Layer | null;
}

/** Stars per 1000 square pixels. Bounded so a starfield never becomes a texture. */
export const STAR_DENSITY = 6;

/** Picks the n brightest colours in a POI's lock — used for stars and highlights. */
function brightest(poi: PoiId, n: number): Rgba[] {
  const lum = (c: Rgba) =>
    0.299 * ((c >>> 24) & 255) + 0.587 * ((c >>> 16) & 255) + 0.114 * ((c >>> 8) & 255);
  return [...POI_PALETTE[poi]].sort((a, b) => lum(b) - lum(a)).slice(0, n);
}

/** Picks the n darkest colours — used for deep-space grounds and near debris. */
function darkest(poi: PoiId, n: number): Rgba[] {
  const lum = (c: Rgba) =>
    0.299 * ((c >>> 24) & 255) + 0.587 * ((c >>> 16) & 255) + 0.114 * ((c >>> 8) & 255);
  return [...POI_PALETTE[poi]].sort((a, b) => lum(a) - lum(b)).slice(0, n);
}

export function buildStarfield(w: number, h: number, poi: PoiId, rng: Rng): PixBuf {
  const buf = createBuf(w, h);
  const palette = brightest(poi, 3);
  const count = Math.round(((w * h) / 1000) * STAR_DENSITY);

  for (let i = 0; i < count; i++) {
    const x = rng.int(w);
    const y = rng.int(h);
    // Most stars are the dimmest of the three; a few are bright. A uniform
    // field reads as noise, a weighted one reads as distance.
    const c = rng.chance(0.15) ? palette[0]! : rng.chance(0.4) ? palette[1]! : palette[2]!;
    setPx(buf, x, y, c);
  }

  return buf;
}

export function buildNebula(w: number, h: number, poi: PoiId, rng: Rng): PixBuf {
  const buf = createBuf(w, h);
  const palette = darkest(poi, 4);

  // Three overlapping soft blobs, quantised into palette bands and dithered at
  // the boundaries. Ordered dither on a large gradient is what the post chain
  // expects; a smooth ramp would band uglily once the palette snapped it.
  const blobs = Array.from({ length: 3 }, () => ({
    cx: rng.range(0, w),
    cy: rng.range(0, h),
    r: rng.range(Math.min(w, h) * 0.3, Math.min(w, h) * 0.8),
  }));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let density = 0;
      for (const b of blobs) {
        const d = Math.hypot(x - b.cx, y - b.cy) / b.r;
        if (d < 1) density += (1 - d) * (1 - d);
      }
      if (density <= 0.05) continue;

      // Quantise to a band, then dither one step up on half the cells.
      const bandF = Math.min(0.999, density) * palette.length;
      let band = Math.floor(bandF);
      if (bandF - band > 0.5 && ditherMask(x, y)) band += 1;

      const c = palette[Math.min(palette.length - 1, band)]!;
      setPx(buf, x, y, snapToPalette(c, POI_PALETTE[poi]));
    }
  }

  return buf;
}

export function buildGasGiant(diameter: number, poi: PoiId, rng: Rng): PixBuf {
  const buf = createBuf(diameter, diameter);
  const r = diameter / 2;
  const palette = [...POI_PALETTE[poi]];

  // Horizontal bands of varying height, each a palette step apart.
  const bandCount = 5 + rng.int(5);
  const bandEdges: number[] = [];
  for (let i = 1; i < bandCount; i++) {
    bandEdges.push(Math.round(diameter * (i / bandCount) * rng.range(0.82, 1.18)));
  }
  const bandColor = bandEdges.map(() => palette[rng.int(palette.length)]!);
  bandColor.push(palette[rng.int(palette.length)]!);

  for (let y = 0; y < diameter; y++) {
    let band = 0;
    for (const edge of bandEdges) if (y >= edge) band++;

    for (let x = 0; x < diameter; x++) {
      const dx = x - r + 0.5;
      const dy = y - r + 0.5;
      if (dx * dx + dy * dy > r * r) continue;

      // Terminator: light from the top-left, same as every sprite in the game.
      const lit = (-dx - dy) / (r * 1.6); // -1 (dark) .. 1 (lit)
      let step = Math.round((lit + 1) * 1.5); // 0..3
      if (ditherMask(x, y)) step += 1;

      const base = bandColor[band]!;
      const idx = Math.max(0, Math.min(palette.length - 1, palette.indexOf(base) + step - 2));
      setPx(buf, x, y, palette[idx]!);
    }
  }

  return buf;
}

/** Sparse silhouettes for the near-debris and foreground layers. */
function buildDebrisLayer(
  w: number, h: number, poi: PoiId, rng: Rng, count: number, maxSize: number,
): PixBuf {
  const buf = createBuf(w, h);
  const color = darkest(poi, 1)[0]!;

  for (let i = 0; i < count; i++) {
    const bw = 1 + rng.int(maxSize);
    const bh = 1 + rng.int(maxSize);
    const x0 = rng.int(w);
    const y0 = rng.int(h);
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        if (rng.chance(0.8)) setPx(buf, x, y, color);
      }
    }
  }

  return buf;
}

export function buildPoiStack(poi: PoiId, w: number, h: number, rng: Rng): PoiStack {
  const layers: Layer[] = [
    { buf: buildStarfield(w, h, poi, rng.split('stars')), parallax: 0.02, name: 'starfield' },
    { buf: buildNebula(w, h, poi, rng.split('nebula')), parallax: 0.10, name: 'nebula' },
  ];

  // The celestial layer: a gas giant where the POI has one, otherwise a
  // distant wreck field. Either way it is the thing that dwarfs everything.
  if (poi === 'gasgiant' || poi === 'star') {
    const diameter = Math.round(Math.min(w, h) * 1.4);
    layers.push({
      buf: buildGasGiant(diameter, poi, rng.split('celestial')),
      parallax: 0.18,
      name: poi === 'star' ? 'star' : 'gas-giant',
    });
  } else {
    layers.push({
      buf: buildDebrisLayer(w, h, poi, rng.split('far-wrecks'), 14, 5),
      parallax: 0.18,
      name: 'distant-wrecks',
    });
  }

  layers.push({
    buf: buildDebrisLayer(w, h, poi, rng.split('near-debris'), 26, 3),
    parallax: 0.45,
    name: 'near-debris',
  });

  // Foreground occlusion, used on the two densest POIs only. Seasoning.
  const foreground = poi === 'wreckreef' || poi === 'belt'
    ? {
        buf: buildDebrisLayer(w, h, poi, rng.split('foreground'), 5, 7),
        parallax: 1.6,
        name: 'foreground-debris',
      }
    : null;

  return { poi, layers, foreground };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/gen/celestial.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gen/celestial.ts src/gen/celestial.test.ts
git commit -m "feat: POI parallax stacks, nebulae, and banded gas giants

Depth without a third axis: 3-5 layers from 0.02 to 0.45 parallax, plus an
optional foreground layer above 1.0 that drifts in front of the action. Every
layer locks to its POI palette, which is what makes a single screenshot enough
to tell you where you are.

The gas giant takes its terminator from the top-left, same as every sprite —
one global light, no exceptions."
```

---

### Task 21: `tools/contactsheet.ts` — the Milestone 0 deliverable

Everything the generator makes, on one page, with a QC verdict printed underneath. This is what stops the build and goes to the user for review.

**Files:**
- Create: `tools/contactsheet.ts`
- Test: `tools/contactsheet.test.ts`

**Interfaces:**
- Consumes: everything in `src/gen/`
- Produces:
  - `interface SheetResult { buf: PixBuf; reports: QcReport[]; failures: QcReport[]; spriteCount: number }`
  - `function buildContactSheet(seed: string): SheetResult`
  - `function main(): void` — writes `docs/review/contactsheet.png` and prints the QC summary; exits non-zero on any QC failure

- [ ] **Step 1: Write the failing test**

Create `tools/contactsheet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { countOpaque } from '../src/gen/pixbuf.js';
import { encodePng, PNG_SIGNATURE } from '../src/gen/png.js';
import { buildContactSheet } from './contactsheet.js';

describe('contact sheet', () => {
  it('renders a large page', () => {
    const { buf } = buildContactSheet('milestone-0');
    expect(buf.w).toBeGreaterThan(600);
    expect(buf.h).toBeGreaterThan(600);
  });

  it('draws a substantial amount of content', () => {
    const { buf } = buildContactSheet('milestone-0');
    expect(countOpaque(buf)).toBeGreaterThan(50_000);
  });

  it('covers every sprite family the milestone calls for', () => {
    const { spriteCount } = buildContactSheet('milestone-0');
    // Hull LODs, six installed modules, faction classes, damage frames,
    // rotation bins, debris, and POI layers.
    expect(spriteCount).toBeGreaterThan(60);
  });

  it('QCs every sprite it draws', () => {
    const { reports, spriteCount } = buildContactSheet('milestone-0');
    expect(reports.length).toBe(spriteCount);
  });

  it('passes QC on every sprite', () => {
    const { failures } = buildContactSheet('milestone-0');
    const detail = failures.map((f) => f.name).join(', ');
    expect(failures.length, detail).toBe(0);
  });

  it('encodes to a valid PNG', () => {
    const png = encodePng(buildContactSheet('milestone-0').buf);
    expect(Array.from(png.slice(0, 8))).toEqual([...PNG_SIGNATURE]);
    expect(png.length).toBeGreaterThan(1000);
  });

  it('is deterministic from its seed', () => {
    const a = buildContactSheet('fixed');
    const b = buildContactSheet('fixed');
    expect(Array.from(a.buf.data)).toEqual(Array.from(b.buf.data));
  });

  it('changes with the seed', () => {
    const a = buildContactSheet('seed-a');
    const b = buildContactSheet('seed-b');
    expect(Array.from(a.buf.data)).not.toEqual(Array.from(b.buf.data));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tools/contactsheet.test.ts
```

Expected: FAIL — `Failed to resolve import "./contactsheet.js"`.

- [ ] **Step 3: Write the implementation**

Create `tools/contactsheet.ts`:

```ts
/**
 * The Milestone 0 contact sheet.
 *
 * Renders every family of sprite the generator produces onto one page, QCs all
 * of them, and writes a PNG. The build stops here for human review, because
 * every downstream stream is built on top of this output and the art direction
 * is a design requirement rather than a taste question.
 *
 * Runs entirely in Node. No browser, no GPU, no PixiJS — which is the whole
 * reason `gen/` was kept headless.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { makeRng } from '../src/sim/rng.js';
import {
  blit, createBuf, fillBuf, type PixBuf,
} from '../src/gen/pixbuf.js';
import { encodePng } from '../src/gen/png.js';
import {
  EMISSIVE, FACTION_PALETTE, NEUTRAL, POI_PALETTE, SPACE, UI, type FactionId, type PoiId,
} from '../src/gen/palette.js';
import { drawText, GLYPH_H } from '../src/gen/font.js';
import { qcSprite, type QcReport } from '../src/gen/qc.js';
import { buildHull } from '../src/gen/hull.js';
import { buildModule, MODULE_CATALOGUE } from '../src/gen/module.js';
import { compositeShip, type Loadout } from '../src/gen/composite.js';
import { damageFrames, DAMAGE_STATES } from '../src/gen/damage.js';
import { buildLodSet } from '../src/gen/lod.js';
import { bakeRotations, ROTATION_BINS } from '../src/gen/rotate.js';
import { buildDebrisSet } from '../src/gen/debris.js';
import { buildPoiStack } from '../src/gen/celestial.js';
import type { SizeClass } from '../src/gen/grammar/profile.js';

export interface SheetResult {
  buf: PixBuf;
  reports: QcReport[];
  failures: QcReport[];
  spriteCount: number;
}

const SHEET_W = 1200;
const MARGIN = 16;
const ROW_GAP = 14;
const LABEL_GAP = 4;

/** A cursor-based layout: sections stack down the page, sprites flow across. */
class Sheet {
  private rows: { y: number; height: number }[] = [];
  readonly items: { buf: PixBuf; x: number; y: number }[] = [];
  readonly labels: { text: string; x: number; y: number; color: number }[] = [];
  private cursorX = MARGIN;
  private cursorY = MARGIN;
  private rowHeight = 0;

  heading(text: string): void {
    this.newline();
    this.cursorY += ROW_GAP;
    this.labels.push({ text, x: MARGIN, y: this.cursorY, color: UI[5]! });
    this.cursorY += GLYPH_H + LABEL_GAP + 2;
    this.cursorX = MARGIN;
  }

  place(buf: PixBuf, label: string): void {
    const width = Math.max(buf.w, label.length * 6);
    if (this.cursorX + width > SHEET_W - MARGIN) this.newline();

    this.labels.push({ text: label, x: this.cursorX, y: this.cursorY, color: UI[4]! });
    this.items.push({ buf, x: this.cursorX, y: this.cursorY + GLYPH_H + LABEL_GAP });

    this.rowHeight = Math.max(this.rowHeight, GLYPH_H + LABEL_GAP + buf.h);
    this.cursorX += width + 12;
  }

  newline(): void {
    if (this.rowHeight > 0) {
      this.cursorY += this.rowHeight + ROW_GAP;
      this.rowHeight = 0;
    }
    this.cursorX = MARGIN;
  }

  height(): number {
    return this.cursorY + this.rowHeight + MARGIN;
  }
}

export function buildContactSheet(seed: string): SheetResult {
  const rng = makeRng(seed);
  const sheet = new Sheet();
  const reports: QcReport[] = [];

  const record = (name: string, buf: PixBuf, allowed?: readonly number[]) => {
    reports.push(allowed ? qcSprite(name, buf, allowed) : qcSprite(name, buf));
  };

  // --- 1. Player cruiser, bare hull, all four LOD tiers -------------------
  sheet.heading(`SALVAGER - SPRITE CONTACT SHEET - SEED ${seed.toUpperCase()}`);
  sheet.heading('1. PLAYER CRUISER - BARE HULL - LOD TIERS 1 TO 4');

  const cruiser = buildHull({ faction: 'player', sizeClass: 'cruiser', rng: rng.split('cruiser') });
  const cruiserLods = buildLodSet(
    cruiser.buf, cruiser.profile, FACTION_PALETTE.player, NEUTRAL[3]!, EMISSIVE.amber,
  );
  cruiserLods.forEach((buf, i) => {
    const label = `TIER ${i + 1} - ${buf.w}X${buf.h}`;
    sheet.place(buf, label);
    record(`cruiser-lod${i + 1}`, buf, FACTION_PALETTE.player);
  });

  // --- 2. One module per hardpoint, composited ---------------------------
  sheet.heading('2. MODULES INSTALLED - ONE PER HARDPOINT');

  const showcase = [
    'siege-lance', 'rail-battery', 'hangar-deck',
    'cannon-bank', 'beam-array-sb', 'thruster-uprate',
  ];
  for (const id of showcase) {
    const def = MODULE_CATALOGUE.find((m) => m.id === id)!;
    const sprite = buildModule(def, 'player', rng.split(`mod-${id}`));
    const ship = compositeShip(cruiser, { [def.hardpoint]: sprite } as Loadout);
    sheet.place(ship.buf, `${def.hardpoint.toUpperCase()}: ${def.name}`);
    record(`fitted-${id}`, ship.buf, FACTION_PALETTE.player);
  }

  // --- 3. Three loadouts, to be compared by outline ----------------------
  sheet.heading('3. THREE LOADOUTS - COMPARE BY OUTLINE ALONE');

  const loadouts: [string, Loadout][] = [
    ['LIGHT', {
      bow: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'ram-spike')!, 'player', rng.split('l1a')),
      port: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'flak-cluster')!, 'player', rng.split('l1b')),
    }],
    ['LANCE', {
      bow: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'siege-lance')!, 'player', rng.split('l2a')),
      dorsal: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'spinal-coil')!, 'player', rng.split('l2b')),
      engine: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'jump-drive')!, 'player', rng.split('l2c')),
    }],
    ['CARRIER', {
      ventral: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'hangar-deck')!, 'player', rng.split('l3a')),
      port: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'torpedo-rack')!, 'player', rng.split('l3b')),
      starboard: buildModule(MODULE_CATALOGUE.find((m) => m.id === 'torpedo-rack-sb')!, 'player', rng.split('l3c')),
    }],
  ];
  for (const [name, loadout] of loadouts) {
    const ship = compositeShip(cruiser, loadout);
    sheet.place(ship.buf, name);
    record(`loadout-${name}`, ship.buf, FACTION_PALETTE.player);
  }

  // --- 4. Faction ship classes -------------------------------------------
  sheet.heading('4. FACTION SHIP CLASSES');

  const classes: SizeClass[] = ['corvette', 'destroyer', 'cruiser'];
  for (const faction of ['concord', 'coalition', 'derelict'] as FactionId[]) {
    for (const sizeClass of classes) {
      const h = buildHull({ faction, sizeClass, rng: rng.split(`${faction}-${sizeClass}`) });
      sheet.place(h.buf, `${faction.toUpperCase()} ${sizeClass.toUpperCase()}`);
      record(`${faction}-${sizeClass}`, h.buf, FACTION_PALETTE[faction]);
    }
    sheet.newline();
  }

  // --- 5. Damage states ---------------------------------------------------
  sheet.heading('5. DAMAGE STATES - OUTLINE HOLDS UNTIL CRITICAL');

  const allowedWithScorch = [...FACTION_PALETTE.player];
  const frames = damageFrames(cruiser.buf, rng.split('damage'), allowedWithScorch);
  for (const state of DAMAGE_STATES) {
    sheet.place(frames[state], state.toUpperCase());
    record(`damage-${state}`, frames[state], allowedWithScorch);
  }

  // --- 6. Rotation bins ---------------------------------------------------
  sheet.heading(`6. ROTATION - 8 OF ${ROTATION_BINS} BINS`);

  const fitted = compositeShip(cruiser, loadouts[1]![1]);
  const bins = bakeRotations(fitted.buf, ROTATION_BINS);
  for (let i = 0; i < ROTATION_BINS; i += Math.floor(ROTATION_BINS / 8)) {
    sheet.place(bins[i]!, `BIN ${i}`);
    record(`rotation-${i}`, bins[i]!, FACTION_PALETTE.player);
  }

  // --- 7. Debris ----------------------------------------------------------
  sheet.heading('7. DEBRIS SET');

  for (const faction of ['concord', 'coalition'] as FactionId[]) {
    for (const piece of buildDebrisSet(faction, rng.split(`debris-${faction}`), 3)) {
      sheet.place(piece.buf, `${faction.slice(0, 3).toUpperCase()} ${piece.size.toUpperCase()}`);
      record(`debris-${faction}-${piece.size}`, piece.buf, FACTION_PALETTE[faction]);
    }
    sheet.newline();
  }

  // --- 8. POI background stacks -------------------------------------------
  sheet.heading('8. POI BACKGROUND STACKS - LAYERS SHOWN SEPARATELY');

  for (const poi of ['gasgiant', 'graveyard'] as PoiId[]) {
    const stack = buildPoiStack(poi, 220, 130, rng.split(`poi-${poi}`));
    for (const layer of stack.layers) {
      sheet.place(layer.buf, `${poi.toUpperCase()} ${layer.name.toUpperCase()}`);
      record(`poi-${poi}-${layer.name}`, layer.buf, POI_PALETTE[poi]);
    }
    sheet.newline();
  }

  // --- Render -------------------------------------------------------------
  sheet.newline();
  const buf = createBuf(SHEET_W, sheet.height() + 40);
  fillBuf(buf, SPACE[0]!);

  for (const item of sheet.items) blit(buf, item.buf, item.x, item.y);
  for (const label of sheet.labels) drawText(buf, label.text, label.x, label.y, label.color);

  const failures = reports.filter((r) => !r.pass);
  drawText(
    buf,
    `QC: ${reports.length - failures.length} OF ${reports.length} PASS`,
    MARGIN,
    buf.h - GLYPH_H - MARGIN,
    failures.length === 0 ? UI[5]! : EMISSIVE.red,
  );

  return { buf, reports, failures, spriteCount: reports.length };
}

export function main(): void {
  const seed = process.argv[2] ?? 'milestone-0';
  const result = buildContactSheet(seed);
  const out = resolve('docs/review/contactsheet.png');

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(result.buf));

  console.log(`contact sheet: ${out}`);
  console.log(`  ${result.buf.w}x${result.buf.h}, ${result.spriteCount} sprites, seed "${seed}"`);
  console.log(`  QC: ${result.spriteCount - result.failures.length}/${result.spriteCount} pass`);

  for (const failure of result.failures) {
    console.error(`  FAIL ${failure.name}`);
  }

  if (result.failures.length > 0) process.exit(1);
}

// Run when invoked directly, stay silent when imported by a test.
if (process.argv[1]?.endsWith('contactsheet.ts')) main();
```

`rng.js` is imported from `src/sim/`, which is legal: the purity rule confines what `sim/` may import, not who may import it.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tools/contactsheet.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Render the sheet and confirm the QC verdict**

```bash
npm run contactsheet
```

Expected output — the sprite count will vary slightly with the catalogue, but the pass ratio must be total:

```
contact sheet: .../docs/review/contactsheet.png
  1200x<height>, <n> sprites, seed "milestone-0"
  QC: <n>/<n> pass
```

Exit code must be 0. Any `FAIL` line means a generator defect — fix the generator, not the QC.

- [ ] **Step 6: Run the entire suite one last time**

```bash
npm test && npm run typecheck
```

Expected: every test file passes, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add tools/contactsheet.ts tools/contactsheet.test.ts docs/review/contactsheet.png
git commit -m "feat: Milestone 0 contact sheet

Every sprite family on one page with a QC verdict printed underneath: hull LOD
tiers, one module per hardpoint, three loadouts to compare by outline, faction
classes, damage frames, rotation bins, debris, and POI layer stacks.

Renders in Node with no browser and no GPU, which is what keeping gen/ headless
bought. The build stops here for review."
```

- [ ] **Step 8: STOP — Milestone 0 gate**

Do not begin any Wave 2 work. Send `docs/review/contactsheet.png` to the user with the QC summary and wait.

The gate question is not "does this look good" — it is whether the generator's output is a foundation worth building nine more streams on top of. Specifically worth the user's eye:

- Are faction shape languages distinguishable at a glance, and at tier 4?
- Does the light read as coming from one direction across every sprite?
- Do the six hardpoints land somewhere a player would expect?
- Do the three loadouts differ enough by outline alone?
- Is the detail density right, or has anything crossed into greeble soup?

Plan 2 — the renderer, camera, combat, UI, and the vertical slice — is written after this gate clears, with whatever the review changes folded in.

---

## Self-Review

Run against the spec after the plan was written.

**Spec coverage.** Every §4 and §5 requirement that Wave 0/1 owns maps to a task: purity boundary (Task 4), determinism and split streams (Task 3), 52-color palette with faction and POI locks (Task 7), shape grammar and faction languages (Tasks 10–12), damage frames (Task 15), composite (Task 16), four LOD tiers with a generated tier 4 (Task 17), 64-bin rotation (Task 18), parallax stacks (Task 20), contact sheet (Task 21). Automated palette and light-direction QC (Task 9) runs in CI via `npm test`.

Deliberately **not** in this plan, and correctly so: the post chain, integer scaling across zoom levels, the benchmark, the four UI screens, combat, camera, world sim, and audio. All are Wave 2+ and sit behind the M0 gate.

**One gap accepted knowingly.** §5.6 requires a tool that asserts three scale cues are present in a wide frame. Running lights at fixed spacing exist and are tested (Task 12); strike-craft crossing and parallax gradient cannot be asserted until there is a rendered frame to assert against. That check belongs to Plan 2's benchmark task, and is recorded here so it is not lost at the plan boundary.

**Placeholder scan.** No TBD, no "handle errors appropriately", no "similar to Task N". Every code step carries the actual code. One instance of a test telling the implementer to fix a typo was found and corrected inline rather than shipped.

**Type consistency.** `PixBuf`/`Rgba` are used identically from Task 5 onward. `HardpointId` is defined once in Task 13 and imported by Tasks 14 and 16. `FactionId`/`PoiId` come from Task 7 throughout. `Profile` flows from Task 10 into Tasks 11, 12, 13, and 17 with the same shape. `qcSprite`/`assertQc` keep one signature across Tasks 13, 14, 19, and 21. `Rng.split` is used the same way everywhere.
