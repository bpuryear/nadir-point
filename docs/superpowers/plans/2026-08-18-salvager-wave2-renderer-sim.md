# Salvager — Wave 2: Renderer, Sim Core, Camera and Post Chain

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the generated sprites on screen and let the player fly the cruiser through a POI at four discrete zoom levels, with parallax depth, real momentum, and the restrained post chain — the first build where the game is a moving picture rather than a contact sheet.

**Architecture:** The simulation stays pure and headless, ticking at a fixed timestep decoupled from render. The renderer reads sim state and never mutates it. Critically, **render logic is separated from render calls**: camera math, zoom quantisation, atlas packing and parallax offsets are pure arithmetic in testable modules, while PixiJS touches the GPU only through thin adapters. That keeps most of the renderer unit-testable in Node, the same discipline that has already caught defects twice in `sim/` and `gen/`.

**Tech Stack:** TypeScript 5.7, PixiJS v8.19 (WebGPU with automatic WebGL2 fallback), Vite 8, Vitest 3, Node 24.

## Global Constraints

These bind every task. Values are copied from the spec and from Wave 0/1's established invariants.

- **Node 24+.** `package.json` declares `"engines": { "node": ">=24" }`.
- **`src/sim/` and `src/gen/` remain PURE and headless.** No `pixi.js`, no `@pixi/*`, no `three`, no DOM globals (`document`, `window`, `navigator`, `localStorage`, `HTMLCanvasElement`, `requestAnimationFrame`) including via `globalThis.` or `self.`. `src/sim/` may import only within `src/sim/`; `src/gen/` may import only within `src/gen/`, plus `src/sim/math/**` and `src/sim/rng.ts`. **`tools/purity.ts` now enforces this transitively** and will report the full import chain — it will catch `src/sim/x.ts -> src/render/y.ts -> pixi.js`.
- **`src/render/` may import from `src/sim/` and `src/gen/`, never the reverse.**
- **The renderer never mutates sim state.** It reads. All mutation flows through the tick.
- **Fixed timestep.** The sim advances in fixed increments; time controls change how many ticks run per frame, never the tick duration.
- **Zoom is four discrete levels**, bound 1:1 to LOD tiers, with divisors `[1, 4, 8, 32]` from `LOD_DIVISORS`. Never continuous, never fractional scaling.
- **Integer scaling only.** World sprites blit at 1:1 into a virtual canvas which is then integer-scaled to the display. Any non-integer scale is a defect.
- **No `Math.random()` anywhere in `src/`.** Everything deterministic from a seed.
- **Alpha is binary** in generated content: 0 or 255.
- **Rotation is clockwise**, 64 bins, `binForHeading(radians)` maps a heading to a bin. Sprites are authored nose-up; sim heading 0 points +X, so the renderer selects `binForHeading(heading + Math.PI / 2)`.
- Every task ends with a commit using a conventional-commit prefix.

## Acceptance criteria this plan is judged against

From spec §11, the items in scope for Wave 2:

- **The cruiser cannot change heading instantly at any speed.**
- **Every order the player issues produces visible feedback within 100 ms.**
- **No input that requires the player to fight the camera.**
- Zooming across all four levels never breaks pixel integrity — no shimmer, no sub-pixel mush.
- 60 fps at native resolution with 1% lows above 55, measured against a committed benchmark scene.

---

## File Structure

**Simulation — pure, no renderer imports**

| File | Responsibility |
|---|---|
| `src/sim/body.ts` | A 2D rigid body: position, velocity, heading, angular velocity, mass |
| `src/sim/integrate.ts` | Fixed-step integration — momentum, drag, turn-rate limiting |
| `src/sim/order.ts` | Move orders: plot a heading, commit to the turn, accelerate, brake |
| `src/sim/loop.ts` | Fixed-timestep driver and time controls (pause, 1x, 2x, 4x) |
| `src/sim/world.ts` | The entity store the renderer reads |

**Render logic — pure arithmetic, unit-testable in Node**

| File | Responsibility |
|---|---|
| `src/render/viewport.ts` | Virtual canvas size, integer display scale, world↔screen transforms |
| `src/render/zoom.ts` | Four discrete levels, LOD tier binding, crossfade state |
| `src/render/camera.ts` | Follow behaviour and pixel-grid snapping |
| `src/render/parallax.ts` | Per-layer offset arithmetic from camera position and parallax depth |
| `src/render/atlaspack.ts` | Rectangle packing for the rotation-bin atlas |

**Render adapters — the only files that touch PixiJS**

| File | Responsibility |
|---|---|
| `src/render/device.ts` | PixiJS application boot; WebGPU with verified WebGL2 fallback |
| `src/render/textures.ts` | `PixBuf` → Pixi `Texture`; atlas upload |
| `src/render/scene.ts` | Sprite pools, layer containers, draw order |
| `src/render/post.ts` | Bloom → dither → grain → vignette filter chain |

**Application**

| File | Responsibility |
|---|---|
| `src/app/main.ts` | Boot, wire sim to render, drive the frame loop |
| `src/app/input.ts` | Pointer and key handling; right-click move orders, zoom keys |

---

# Simulation core

### Task 1: `sim/body.ts` — the 2D rigid body

Every moving thing in the game is one of these. Keeping it a plain data record with no behaviour means the integrator, the order system and the renderer can all read it without any of them owning it.

**Files:**
- Create: `src/sim/body.ts`
- Test: `src/sim/body.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `vec2` from `./math/vec2.js`
- Produces:
  - `interface Body { position: Vec2; velocity: Vec2; heading: number; angularVelocity: number; mass: number; thrust: number; turnRate: number; angularAccel: number; drag: number }`
  - `interface BodySpec` — every field of `Body` optional
  - `function makeBody(spec?: BodySpec): Body`
  - `const CRUISER_BODY: Readonly<BodySpec>` — the player cruiser's tuning
  - `function speed(b: Body): number`
  - `function wrapHeading(radians: number): number` — normalises to (−π, π]

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { angleOf, vec2 } from './math/vec2.js';
import { CRUISER_BODY, makeBody, speed, wrapHeading } from './body.js';

describe('makeBody', () => {
  it('defaults to a body at rest at the origin', () => {
    const b = makeBody();
    expect(b.position).toEqual({ x: 0, y: 0 });
    expect(b.velocity).toEqual({ x: 0, y: 0 });
    expect(b.heading).toBe(0);
    expect(b.angularVelocity).toBe(0);
  });

  it('takes overrides', () => {
    const b = makeBody({ position: vec2(3, 4), heading: 1.5, mass: 900 });
    expect(b.position).toEqual({ x: 3, y: 4 });
    expect(b.heading).toBe(1.5);
    expect(b.mass).toBe(900);
  });

  it('does not alias the spec it was given', () => {
    // A shared position vector between two bodies would couple their movement.
    const pos = vec2(1, 1);
    const a = makeBody({ position: pos });
    const b = makeBody({ position: pos });
    a.position.x = 99;
    expect(b.position.x).toBe(1);
    expect(pos.x).toBe(1);
  });

  it('gives every body positive mass, thrust and turn rate', () => {
    const b = makeBody();
    expect(b.mass).toBeGreaterThan(0);
    expect(b.thrust).toBeGreaterThan(0);
    expect(b.turnRate).toBeGreaterThan(0);
    expect(b.angularAccel).toBeGreaterThan(0);
  });
});

describe('CRUISER_BODY', () => {
  it('describes a heavy ship — slow to turn and slow to stop', () => {
    // The spec's feel requirement: mass and momentum are real, and in 2D there
    // is no visual mass to lean on, so the numbers have to sell it alone.
    const b = makeBody(CRUISER_BODY);
    // A full revolution takes several seconds at peak rate.
    expect((Math.PI * 2) / b.turnRate).toBeGreaterThan(4);
    // Reaching peak turn rate is not instant either.
    expect(b.turnRate / b.angularAccel).toBeGreaterThan(0.8);
  });
});

describe('speed', () => {
  it('is the magnitude of velocity', () => {
    expect(speed(makeBody({ velocity: vec2(3, 4) }))).toBe(5);
  });
});

describe('wrapHeading', () => {
  it('leaves an in-range heading alone', () => {
    expect(wrapHeading(1)).toBeCloseTo(1, 10);
  });

  it('wraps past a full revolution', () => {
    expect(wrapHeading(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 10);
    expect(wrapHeading(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5, 10);
  });

  it('always returns a heading in (-PI, PI]', () => {
    for (let a = -20; a < 20; a += 0.37) {
      const w = wrapHeading(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('round-trips through angleOf', () => {
    for (const a of [0.3, 2.9, -2.9, 3.14]) {
      expect(wrapHeading(angleOf({ x: Math.cos(a), y: Math.sin(a) }))).toBeCloseTo(a, 9);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/sim/body.test.ts
```

Expected: FAIL — `Failed to resolve import "./body.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * A 2D rigid body — the state every moving thing in the game carries.
 *
 * Deliberately a plain data record with no behaviour. The integrator advances
 * it, the order system steers it, and the renderer reads it, but none of them
 * owns it. That keeps the simulation a pure transformation of state rather than
 * a graph of objects calling each other.
 */

import { vec2, type Vec2 } from './math/vec2.js';

export interface Body {
  position: Vec2;
  velocity: Vec2;
  /** Radians. 0 points along +X. */
  heading: number;
  /** Radians per second. */
  angularVelocity: number;
  mass: number;
  /** Peak linear acceleration, world units per second squared. */
  thrust: number;
  /** Peak turn rate, radians per second. */
  turnRate: number;
  /** How fast the turn rate itself can change, radians per second squared. */
  angularAccel: number;
  /** Linear damping per second. Small — this is not a frictionless vacuum by choice. */
  drag: number;
}

export type BodySpec = Partial<Body>;

/**
 * The player cruiser's tuning.
 *
 * The spec asks for mass and momentum to be real, and notes that in 2D there is
 * no visual weight to lean on — the movement integrator has to sell it alone.
 * So: a full revolution takes about six seconds at peak rate, and reaching that
 * rate takes another second on top. Drift, overshoot and turn commitment all
 * fall out of those two numbers.
 */
export const CRUISER_BODY: Readonly<BodySpec> = {
  mass: 1200,
  thrust: 26,
  turnRate: 1.05,
  angularAccel: 0.9,
  drag: 0.35,
};

export function makeBody(spec: BodySpec = {}): Body {
  return {
    // Copy rather than adopt: two bodies made from one spec must not share a
    // position vector, or they would move together.
    position: spec.position ? vec2(spec.position.x, spec.position.y) : vec2(),
    velocity: spec.velocity ? vec2(spec.velocity.x, spec.velocity.y) : vec2(),
    heading: spec.heading ?? 0,
    angularVelocity: spec.angularVelocity ?? 0,
    mass: spec.mass ?? 1000,
    thrust: spec.thrust ?? 30,
    turnRate: spec.turnRate ?? 1.2,
    angularAccel: spec.angularAccel ?? 1.0,
    drag: spec.drag ?? 0.35,
  };
}

export function speed(b: Body): number {
  return Math.hypot(b.velocity.x, b.velocity.y);
}

/** Normalises a heading into (−π, π]. */
export function wrapHeading(radians: number): number {
  const TAU = Math.PI * 2;
  let a = radians % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/sim/body.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/body.ts src/sim/body.test.ts
git commit -m "feat: the 2D rigid body every moving thing carries

A plain data record with no behaviour, so the integrator, the order system and
the renderer can all read it without any of them owning it. The cruiser's
tuning makes a full revolution take about six seconds — in 2D there is no
visual mass to lean on, so the numbers have to sell the weight alone."
```

---

### Task 2: `sim/integrate.ts` — fixed-step motion

The acceptance criterion "the cruiser cannot change heading instantly at any speed" is satisfied here or nowhere. Heading changes only through angular velocity, which changes only through angular acceleration — there is no code path that sets heading directly.

**Files:**
- Create: `src/sim/integrate.ts`
- Test: `src/sim/integrate.test.ts`

**Interfaces:**
- Consumes: `Body`, `wrapHeading` from `./body.js`; `Vec2`, `vec2`, `addScaled`, `scale` from `./math/vec2.js`
- Produces:
  - `const TICK_HZ: 60`, `const TICK_SECONDS: number`
  - `interface Control { thrust: number; turn: number }` — both in [−1, 1]
  - `const NEUTRAL: Readonly<Control>`
  - `function integrate(body: Body, control: Control, dt: number): void` — mutates in place
  - `function stoppingDistance(body: Body): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { CRUISER_BODY, makeBody, speed } from './body.js';
import { integrate, NEUTRAL, stoppingDistance, TICK_SECONDS } from './integrate.js';

const cruiser = () => makeBody(CRUISER_BODY);
const run = (b: ReturnType<typeof cruiser>, control: { thrust: number; turn: number }, seconds: number) => {
  const steps = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < steps; i++) integrate(b, control, TICK_SECONDS);
};

describe('heading can never change instantly', () => {
  it('does not move at all in a single tick from rest', () => {
    // This is the acceptance criterion. A ship that snaps its heading is the
    // failure this whole integrator exists to prevent.
    const b = cruiser();
    integrate(b, { thrust: 0, turn: 1 }, TICK_SECONDS);
    expect(Math.abs(b.heading)).toBeLessThan(0.01);
  });

  it('takes over a second to reach peak turn rate', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 0.5);
    expect(b.angularVelocity).toBeLessThan(b.turnRate * 0.95);
  });

  it('never exceeds its peak turn rate however long it turns', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 30);
    expect(b.angularVelocity).toBeLessThanOrEqual(b.turnRate + 1e-9);
  });

  it('cannot reverse its turn instantly either', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 5);
    const spinning = b.angularVelocity;
    integrate(b, { thrust: 0, turn: -1 }, TICK_SECONDS);
    // One tick of counter-turn barely dents it.
    expect(b.angularVelocity).toBeGreaterThan(spinning * 0.9);
  });

  it('holds heading in (-PI, PI] across many revolutions', () => {
    const b = cruiser();
    run(b, { thrust: 0, turn: 1 }, 60);
    expect(b.heading).toBeGreaterThan(-Math.PI - 1e-9);
    expect(b.heading).toBeLessThanOrEqual(Math.PI + 1e-9);
  });
});

describe('momentum is real', () => {
  it('keeps moving after thrust stops', () => {
    const b = cruiser();
    run(b, { thrust: 1, turn: 0 }, 3);
    const cruising = speed(b);
    expect(cruising).toBeGreaterThan(1);
    run(b, NEUTRAL, 0.5);
    // Drag bleeds speed, but nowhere near instantly.
    expect(speed(b)).toBeGreaterThan(cruising * 0.5);
  });

  it('takes seconds to come to a full stop from cruise', () => {
    // The spec's words: "Full stop from cruise takes seconds."
    const b = cruiser();
    run(b, { thrust: 1, turn: 0 }, 5);
    expect(speed(b)).toBeGreaterThan(1);

    let seconds = 0;
    while (speed(b) > 0.5 && seconds < 30) {
      integrate(b, { thrust: -1, turn: 0 }, TICK_SECONDS);
      seconds += TICK_SECONDS;
    }
    expect(seconds).toBeGreaterThan(1.5);
    expect(seconds).toBeLessThan(30);
  });

  it('drifts sideways when it turns while moving', () => {
    // Turning changes where the ship points, not where it is going. That
    // divergence is the whole feel of a heavy vessel.
    const b = cruiser();
    run(b, { thrust: 1, turn: 0 }, 4);
    const headingBefore = b.heading;
    run(b, { thrust: 0, turn: 1 }, 1.5);
    const velocityAngle = Math.atan2(b.velocity.y, b.velocity.x);
    expect(Math.abs(b.heading - headingBefore)).toBeGreaterThan(0.3);
    expect(Math.abs(b.heading - velocityAngle)).toBeGreaterThan(0.2);
  });

  it('accelerates along its heading, not along an axis', () => {
    const b = makeBody({ ...CRUISER_BODY, heading: Math.PI / 2 });
    run(b, { thrust: 1, turn: 0 }, 2);
    expect(b.velocity.y).toBeGreaterThan(1);
    expect(Math.abs(b.velocity.x)).toBeLessThan(0.5);
  });
});

describe('control clamping', () => {
  it('ignores thrust and turn magnitudes above 1', () => {
    const a = cruiser();
    const b = cruiser();
    run(a, { thrust: 1, turn: 1 }, 2);
    run(b, { thrust: 50, turn: 50 }, 2);
    expect(speed(b)).toBeCloseTo(speed(a), 6);
    expect(b.angularVelocity).toBeCloseTo(a.angularVelocity, 6);
  });
});

describe('stoppingDistance', () => {
  it('is zero at rest', () => {
    expect(stoppingDistance(cruiser())).toBe(0);
  });

  it('grows with speed', () => {
    const slow = cruiser();
    run(slow, { thrust: 1, turn: 0 }, 1);
    const fast = cruiser();
    run(fast, { thrust: 1, turn: 0 }, 5);
    expect(stoppingDistance(fast)).toBeGreaterThan(stoppingDistance(slow));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/sim/integrate.test.ts
```

Expected: FAIL — `Failed to resolve import "./integrate.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Fixed-step motion integration.
 *
 * The acceptance criterion "the cruiser cannot change heading instantly at any
 * speed" is satisfied here or nowhere. Heading moves only through angular
 * velocity, angular velocity moves only through angular acceleration, and
 * nothing in this module assigns a heading directly. A ship that could snap its
 * facing would make every firing arc meaningless, since bringing an arc to bear
 * is supposed to be the primary combat skill.
 *
 * Drift falls out of the same structure for free: turning changes where the
 * ship points, not where it is going, and only thrust along the new heading
 * gradually redirects the velocity.
 */

import { wrapHeading, type Body } from './body.js';
import { addScaled, fromAngle, scale, vec2 } from './math/vec2.js';

export const TICK_HZ = 60 as const;
export const TICK_SECONDS = 1 / TICK_HZ;

/** Both fields are intentions in [-1, 1], not forces. */
export interface Control {
  thrust: number;
  turn: number;
}

export const NEUTRAL: Readonly<Control> = { thrust: 0, turn: 0 };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Scratch vectors, module-level so the hot path allocates nothing per tick. */
const _accel = vec2();

export function integrate(body: Body, control: Control, dt: number): void {
  const turn = clamp(control.turn, -1, 1);
  const thrust = clamp(control.thrust, -1, 1);

  // Angular: the commanded rate is approached, never assumed.
  const targetRate = turn * body.turnRate;
  const rateDelta = targetRate - body.angularVelocity;
  const maxRateChange = body.angularAccel * dt;
  body.angularVelocity += clamp(rateDelta, -maxRateChange, maxRateChange);
  body.angularVelocity = clamp(body.angularVelocity, -body.turnRate, body.turnRate);

  body.heading = wrapHeading(body.heading + body.angularVelocity * dt);

  // Linear: thrust acts along the current heading, so a turn only redirects
  // travel as fast as the engines can push the velocity around.
  fromAngle(_accel, body.heading, thrust * body.thrust);
  addScaled(body.velocity, body.velocity, _accel, dt);

  // Drag is small and exists so the ship settles rather than coasting forever.
  const damping = Math.max(0, 1 - body.drag * dt);
  scale(body.velocity, body.velocity, damping);

  addScaled(body.position, body.position, body.velocity, dt);
}

/**
 * Roughly how far the body travels if it brakes at full thrust from now.
 *
 * Used by the order system to decide when to start slowing down. Ignores drag,
 * which makes it a slight over-estimate — braking early looks deliberate,
 * braking late looks like a mistake.
 */
export function stoppingDistance(body: Body): number {
  const v = Math.hypot(body.velocity.x, body.velocity.y);
  if (v === 0) return 0;
  return (v * v) / (2 * body.thrust);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/sim/integrate.test.ts
```

Expected: PASS.

If the "full stop takes seconds" test fails at the low end, the cruiser's `thrust` is too high relative to its speed — tune `CRUISER_BODY`, not the assertion. That threshold is the spec's own language.

- [ ] **Step 5: Commit**

```bash
git add src/sim/integrate.ts src/sim/integrate.test.ts
git commit -m "feat: fixed-step motion with real momentum and turn commitment

Heading moves only through angular velocity, which moves only through angular
acceleration — nothing here assigns a heading directly, so 'cannot turn
instantly' is structural rather than tuned. Drift falls out of the same shape:
turning changes where the ship points, not where it is going."
```

---

### Task 3: `sim/order.ts` — move orders with turn commitment

Right-click issues a move order; the ship plots and executes it with real turning physics rather than snapping its heading. This module turns a target point into a `Control` each tick.

**Files:**
- Create: `src/sim/order.ts`
- Test: `src/sim/order.test.ts`

**Interfaces:**
- Consumes: `Body`, `speed` from `./body.js`; `Control`, `stoppingDistance` from `./integrate.js` (deliberately not `NEUTRAL` — `steer` returns a fresh literal, since `NEUTRAL` is `Readonly` at compile time only and a caller writing to a returned `Control` would corrupt the shared constant); `Vec2`, `vec2`, `angleOf`, `angleDelta`, `distance`, `sub` from `./math/vec2.js`
- Produces:
  - `interface MoveOrder { target: Vec2; arriveRadius: number }`
  - `function makeMoveOrder(target: Vec2, arriveRadius?: number): MoveOrder`
  - `function steer(body: Body, order: MoveOrder | null): Control`
  - `function hasArrived(body: Body, order: MoveOrder): boolean`
  - `const FACING_CONE: number` — radians within which the ship will apply forward thrust

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { CRUISER_BODY, makeBody, speed } from './body.js';
import { integrate, TICK_SECONDS } from './integrate.js';
import { distance, vec2 } from './math/vec2.js';
import { FACING_CONE, hasArrived, makeMoveOrder, steer } from './order.js';

const cruiser = (over = {}) => makeBody({ ...CRUISER_BODY, ...over });

/** Runs the full order loop for a while and reports where the ship ended up. */
const fly = (b: ReturnType<typeof cruiser>, order: ReturnType<typeof makeMoveOrder>, seconds: number) => {
  const steps = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < steps; i++) integrate(b, steer(b, order), TICK_SECONDS);
};

describe('steer', () => {
  it('returns neutral with no order', () => {
    expect(steer(cruiser(), null)).toEqual({ thrust: 0, turn: 0 });
  });

  it('turns toward a target behind it before thrusting', () => {
    // Turn commitment: a heavy ship points itself before it pushes. Thrusting
    // while facing away would let it crab sideways to any target and erase the
    // whole point of positioning.
    const b = cruiser({ heading: 0 });
    const order = makeMoveOrder(vec2(-500, 0));
    const c = steer(b, order);
    expect(Math.abs(c.turn)).toBeGreaterThan(0.5);
    expect(c.thrust).toBeLessThanOrEqual(0);
  });

  it('thrusts once it is facing the target', () => {
    const b = cruiser({ heading: 0 });
    const c = steer(b, makeMoveOrder(vec2(500, 0)));
    expect(c.thrust).toBeGreaterThan(0.5);
  });

  it('only thrusts inside the facing cone', () => {
    const justOutside = cruiser({ heading: FACING_CONE + 0.15 });
    expect(steer(justOutside, makeMoveOrder(vec2(500, 0))).thrust).toBeLessThanOrEqual(0);
  });
});

describe('flying an order to completion', () => {
  it('reaches a target ahead of it', () => {
    const b = cruiser();
    const order = makeMoveOrder(vec2(600, 0));
    fly(b, order, 40);
    expect(distance(b.position, order.target)).toBeLessThan(order.arriveRadius * 2);
  });

  it('reaches a target behind it, having turned around first', () => {
    const b = cruiser({ heading: 0 });
    const order = makeMoveOrder(vec2(-600, 0));
    fly(b, order, 60);
    expect(distance(b.position, order.target)).toBeLessThan(order.arriveRadius * 2);
  });

  it('reaches a target off to one side', () => {
    const b = cruiser({ heading: 0 });
    const order = makeMoveOrder(vec2(400, 500));
    fly(b, order, 60);
    expect(distance(b.position, order.target)).toBeLessThan(order.arriveRadius * 2);
  });

  it('is close to stopped once it arrives', () => {
    // Arriving at speed and sailing past is the failure this braking exists to
    // prevent — the ship should settle, not orbit its own waypoint forever.
    const b = cruiser();
    const order = makeMoveOrder(vec2(600, 0));
    fly(b, order, 40);
    expect(speed(b)).toBeLessThan(6);
  });

  it('does not oscillate once arrived', () => {
    const b = cruiser();
    const order = makeMoveOrder(vec2(500, 0));
    fly(b, order, 40);
    const settled = { x: b.position.x, y: b.position.y };
    fly(b, order, 10);
    expect(distance(b.position, settled)).toBeLessThan(order.arriveRadius);
  });
});

describe('hasArrived', () => {
  it('is false far away and true within the radius', () => {
    const order = makeMoveOrder(vec2(100, 0), 20);
    expect(hasArrived(makeBody({ position: vec2(0, 0) }), order)).toBe(false);
    expect(hasArrived(makeBody({ position: vec2(95, 0) }), order)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/sim/order.test.ts
```

Expected: FAIL — `Failed to resolve import "./order.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Move orders.
 *
 * Right-click puts a point in the world and the ship works out how to get
 * there. The important property is turn commitment: the ship points itself
 * before it pushes. If it thrust while facing away it could crab sideways to
 * any target, and positioning to bring a firing arc to bear — which the spec
 * calls the primary combat skill — would stop mattering.
 *
 * Braking starts early enough that the ship settles on the waypoint rather than
 * sailing past and circling back.
 */

import { speed, type Body } from './body.js';
import { stoppingDistance, type Control } from './integrate.js';
import { angleDelta, angleOf, distance, sub, vec2, type Vec2 } from './math/vec2.js';

export interface MoveOrder {
  target: Vec2;
  arriveRadius: number;
}

/** Forward thrust is only applied when the target is within this cone of the nose. */
export const FACING_CONE = 0.6;

const DEFAULT_ARRIVE_RADIUS = 24;

export function makeMoveOrder(target: Vec2, arriveRadius = DEFAULT_ARRIVE_RADIUS): MoveOrder {
  return { target: vec2(target.x, target.y), arriveRadius };
}

export function hasArrived(body: Body, order: MoveOrder): boolean {
  return distance(body.position, order.target) <= order.arriveRadius;
}

const _toTarget = vec2();

export function steer(body: Body, order: MoveOrder | null): Control {
  if (order === null) return { thrust: 0, turn: 0 };

  sub(_toTarget, order.target, body.position);
  const range = Math.hypot(_toTarget.x, _toTarget.y);

  // Arrived: kill remaining drift rather than nudging around the waypoint.
  if (range <= order.arriveRadius) {
    return { thrust: speed(body) > 0.5 ? -1 : 0, turn: 0 };
  }

  const bearing = angleOf(_toTarget);
  const offBy = angleDelta(body.heading, bearing);

  // Turn proportionally, saturating well before the error is large, so the ship
  // commits to a turn instead of feathering it.
  const turn = Math.max(-1, Math.min(1, offBy * 2.5));

  // Brake when the remaining range is inside the distance it takes to stop.
  if (range <= stoppingDistance(body)) {
    return { thrust: -1, turn };
  }

  // Push only when roughly pointed at the target.
  const thrust = Math.abs(offBy) < FACING_CONE ? 1 : 0;

  return { thrust, turn };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/sim/order.test.ts
```

Expected: PASS.

If a ship fails to arrive within the time budget, the likely cause is braking too early and creeping — check `stoppingDistance` against the drag in `integrate`. Tune the constants here, not the assertions: "arrives" and "is close to stopped once it arrives" are both feel requirements.

- [ ] **Step 5: Commit**

```bash
git add src/sim/order.ts src/sim/order.test.ts
git commit -m "feat: move orders that commit to the turn before pushing

The ship points itself before it thrusts. Crabbing sideways to a target would
erase positioning as a skill, and positioning to bring an arc to bear is the
one the spec calls primary."
```

---

### Task 4: `sim/loop.ts` — fixed timestep and time controls

The simulation advances in fixed increments regardless of frame rate. Time controls change **how many ticks run per frame**, never the tick duration — a variable tick would make the physics frame-rate dependent and the seeded replay worthless.

**Files:**
- Create: `src/sim/loop.ts`
- Test: `src/sim/loop.test.ts`

**Interfaces:**
- Consumes: `TICK_SECONDS` from `./integrate.js`
- Produces:
  - `type TimeScale = 0 | 1 | 2 | 4`
  - `const TIME_SCALES: readonly TimeScale[]`
  - `interface Loop { readonly tickSeconds: number; scale: TimeScale; ticksFor(realSeconds: number): number; reset(): void }`
  - `function makeLoop(tickSeconds?: number): Loop`
  - `const MAX_TICKS_PER_FRAME: number`

- [ ] **Step 1: Write the failing test**


> **Amended during execution.** This test originally used a frame of `TICK_SECONDS * 3`. At 4x that demands 12 ticks, which `MAX_TICKS_PER_FRAME = 8` clamps to 8 — making the assertion `four === one * 4` (8 === 12) unsatisfiable by any correct implementation honouring the cap. The frame is `TICK_SECONDS` so that this test isolates scale-proportionality from the death-spiral cap, which is tested separately.

```ts
import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from './integrate.js';
import { makeLoop, MAX_TICKS_PER_FRAME, TIME_SCALES } from './loop.js';

describe('fixed timestep', () => {
  it('runs one tick per tick-length of real time at 1x', () => {
    const loop = makeLoop();
    expect(loop.ticksFor(TICK_SECONDS)).toBe(1);
  });

  it('accumulates fractional time rather than dropping it', () => {
    // Frame times never divide evenly into ticks. Dropping the remainder would
    // make the sim run slow by a few percent forever.
    const loop = makeLoop();
    const third = TICK_SECONDS / 3;
    expect(loop.ticksFor(third)).toBe(0);
    expect(loop.ticksFor(third)).toBe(0);
    expect(loop.ticksFor(third)).toBe(1);
  });

  it('runs several ticks for a long frame', () => {
    const loop = makeLoop();
    expect(loop.ticksFor(TICK_SECONDS * 4)).toBe(4);
  });

  it('never changes its tick duration', () => {
    const loop = makeLoop();
    const before = loop.tickSeconds;
    loop.scale = 4;
    loop.ticksFor(1);
    expect(loop.tickSeconds).toBe(before);
  });
});

describe('time controls', () => {
  it('offers pause, 1x, 2x and 4x', () => {
    expect(TIME_SCALES).toEqual([0, 1, 2, 4]);
  });

  it('runs no ticks while paused', () => {
    const loop = makeLoop();
    loop.scale = 0;
    expect(loop.ticksFor(TICK_SECONDS * 10)).toBe(0);
  });

  it('does not bank time while paused', () => {
    // Unpausing after a minute must not fast-forward a minute of simulation.
    const loop = makeLoop();
    loop.scale = 0;
    loop.ticksFor(60);
    loop.scale = 1;
    expect(loop.ticksFor(TICK_SECONDS)).toBe(1);
  });

  it('runs proportionally more ticks at higher scales', () => {
    const one = makeLoop();
    const four = makeLoop();
    four.scale = 4;
    const frame = TICK_SECONDS * 3;
    expect(four.ticksFor(frame)).toBe(one.ticksFor(frame) * 4);
  });
});

describe('the death spiral guard', () => {
  it('caps ticks for an enormous frame', () => {
    // A long stall must not queue thousands of ticks, which would stall harder
    // and queue more. Better to lose simulated time than to lock up.
    const loop = makeLoop();
    expect(loop.ticksFor(10)).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
  });

  it('discards the backlog rather than paying it off later', () => {
    const loop = makeLoop();
    loop.ticksFor(10);
    expect(loop.ticksFor(TICK_SECONDS)).toBe(1);
  });
});

describe('reset', () => {
  it('clears accumulated time', () => {
    const loop = makeLoop();
    loop.ticksFor(TICK_SECONDS * 0.9);
    loop.reset();
    expect(loop.ticksFor(TICK_SECONDS * 0.5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/sim/loop.test.ts
```

Expected: FAIL — `Failed to resolve import "./loop.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The fixed-timestep driver.
 *
 * The simulation advances in fixed increments no matter what the frame rate is
 * doing. Time controls change how many ticks run per frame; they never change
 * the tick duration. A variable tick would make the physics frame-rate
 * dependent and would make a seeded replay produce different results on a
 * different machine, which is the property the whole determinism design rests
 * on.
 */

import { TICK_SECONDS } from './integrate.js';

export type TimeScale = 0 | 1 | 2 | 4;

export const TIME_SCALES: readonly TimeScale[] = [0, 1, 2, 4];

/**
 * The most ticks one frame may run.
 *
 * After a long stall — a breakpoint, a background tab — the accumulator holds
 * seconds of unrun time. Running all of it would stall again and accumulate
 * more, a spiral that never recovers. Losing simulated time is the better
 * failure.
 */
export const MAX_TICKS_PER_FRAME = 8;

export interface Loop {
  readonly tickSeconds: number;
  scale: TimeScale;
  /** Feed real elapsed seconds; returns how many fixed ticks to run now. */
  ticksFor(realSeconds: number): number;
  reset(): void;
}

export function makeLoop(tickSeconds: number = TICK_SECONDS): Loop {
  let accumulator = 0;

  return {
    tickSeconds,
    scale: 1 as TimeScale,

    ticksFor(realSeconds: number): number {
      // Paused banks nothing. Unpausing after a minute must not fast-forward a
      // minute of simulation.
      if (this.scale === 0) {
        accumulator = 0;
        return 0;
      }

      accumulator += realSeconds * this.scale;

      let ticks = Math.floor(accumulator / tickSeconds);
      accumulator -= ticks * tickSeconds;

      if (ticks > MAX_TICKS_PER_FRAME) {
        ticks = MAX_TICKS_PER_FRAME;
        // Drop the backlog outright rather than paying it off over later
        // frames, which would just prolong the stall.
        accumulator = 0;
      }

      return ticks;
    },

    reset(): void {
      accumulator = 0;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/sim/loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify the whole sim tree is still pure**

```bash
npx vitest run tools/purity.test.ts
```

Expected: PASS. Nothing added in Tasks 1–4 may import a renderer or touch the DOM; the purity check is now transitive and will report the chain if anything does.

- [ ] **Step 6: Commit**

```bash
git add src/sim/loop.ts src/sim/loop.test.ts
git commit -m "feat: fixed-timestep driver with pause, 1x, 2x and 4x

Time controls change how many ticks run per frame, never the tick duration — a
variable tick makes physics frame-rate dependent and makes a seeded replay
worthless. Pausing banks no time, and a long stall drops its backlog rather
than spiralling."
```

---

# Render logic — pure, testable in Node

None of these four files imports PixiJS. They are the arithmetic the renderer runs on, kept separate so the parts most likely to be wrong are the parts a unit test can reach.

### Task 5: `render/viewport.ts` — the virtual canvas and integer scaling

World sprites are drawn at 1:1 into a fixed virtual canvas, which is then scaled to the display by a whole number. A fractional scale would resample every sprite and undo the entire rotation-bake strategy.

**Files:**
- Create: `src/render/viewport.ts`
- Test: `src/render/viewport.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `vec2` from `../sim/math/vec2.js`
- Produces:
  - `const VIRTUAL_WIDTH: 480`, `const VIRTUAL_HEIGHT: 270`
  - `interface Viewport { virtualWidth: number; virtualHeight: number; scale: number; offsetX: number; offsetY: number }`
  - `function fitViewport(displayWidth: number, displayHeight: number): Viewport`
  - `function worldToScreen(out: Vec2, world: Vec2, cameraCentre: Vec2, unitsPerPixel: number, vp: Viewport): Vec2`
  - `function screenToWorld(out: Vec2, screen: Vec2, cameraCentre: Vec2, unitsPerPixel: number, vp: Viewport): Vec2`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { vec2 } from '../sim/math/vec2.js';
import {
  fitViewport, screenToWorld, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, worldToScreen,
} from './viewport.js';

describe('fitViewport', () => {
  it('always picks a whole-number scale', () => {
    // A fractional scale resamples every sprite and undoes the entire
    // rotation-bake strategy, which exists so nothing is ever resampled.
    for (let w = 320; w <= 3840; w += 37) {
      for (const h of [200, 720, 1080, 1440, 2160]) {
        const vp = fitViewport(w, h);
        expect(Number.isInteger(vp.scale)).toBe(true);
        expect(vp.scale).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('picks the largest scale that still fits', () => {
    const vp = fitViewport(VIRTUAL_WIDTH * 3, VIRTUAL_HEIGHT * 3);
    expect(vp.scale).toBe(3);
  });

  it('is limited by the tighter axis', () => {
    const vp = fitViewport(VIRTUAL_WIDTH * 4, VIRTUAL_HEIGHT * 2);
    expect(vp.scale).toBe(2);
  });

  it('never scales below 1, even on a tiny display', () => {
    expect(fitViewport(100, 60).scale).toBe(1);
  });

  it('letterboxes the remainder as whole pixels', () => {
    const vp = fitViewport(VIRTUAL_WIDTH * 2 + 33, VIRTUAL_HEIGHT * 2 + 11);
    expect(vp.scale).toBe(2);
    expect(Number.isInteger(vp.offsetX)).toBe(true);
    expect(Number.isInteger(vp.offsetY)).toBe(true);
    expect(vp.offsetX).toBe(16);
    expect(vp.offsetY).toBe(5);
  });
});

describe('world and screen transforms', () => {
  const vp = fitViewport(VIRTUAL_WIDTH * 2, VIRTUAL_HEIGHT * 2);

  it('puts the camera centre at the middle of the virtual canvas', () => {
    const out = worldToScreen(vec2(), vec2(100, 100), vec2(100, 100), 1, vp);
    expect(out.x).toBeCloseTo(VIRTUAL_WIDTH / 2, 6);
    expect(out.y).toBeCloseTo(VIRTUAL_HEIGHT / 2, 6);
  });

  it('moves a world point right when it is right of the camera', () => {
    const out = worldToScreen(vec2(), vec2(140, 100), vec2(100, 100), 1, vp);
    expect(out.x).toBeCloseTo(VIRTUAL_WIDTH / 2 + 40, 6);
  });

  it('compresses distance as units-per-pixel grows', () => {
    const near = worldToScreen(vec2(), vec2(140, 100), vec2(100, 100), 1, vp);
    const far = worldToScreen(vec2(), vec2(140, 100), vec2(100, 100), 4, vp);
    expect(far.x - VIRTUAL_WIDTH / 2).toBeCloseTo((near.x - VIRTUAL_WIDTH / 2) / 4, 6);
  });

  it('round-trips through screenToWorld at every zoom divisor', () => {
    for (const upp of [1, 4, 8, 32]) {
      const world = vec2(1234.5, -678.25);
      const screen = worldToScreen(vec2(), world, vec2(100, 100), upp, vp);
      const back = screenToWorld(vec2(), screen, vec2(100, 100), upp, vp);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/render/viewport.test.ts
```

Expected: FAIL — `Failed to resolve import "./viewport.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The virtual canvas and its integer scale to the display.
 *
 * Everything in the world is drawn at 1:1 into a fixed virtual canvas, and that
 * canvas is scaled to the window by a whole number. This is the last link in
 * the pixel-integrity chain: sprites are baked unrotated into 64 bins so
 * nothing resamples at runtime, and a fractional display scale here would
 * resample all of it anyway and throw that away.
 *
 * The leftover is letterboxed in whole pixels rather than absorbed by stretching.
 */

import { vec2, type Vec2 } from '../sim/math/vec2.js';

export const VIRTUAL_WIDTH = 480 as const;
export const VIRTUAL_HEIGHT = 270 as const;

export interface Viewport {
  virtualWidth: number;
  virtualHeight: number;
  /** Whole-number multiplier from virtual pixels to display pixels. */
  scale: number;
  /** Letterbox margin in display pixels. */
  offsetX: number;
  offsetY: number;
}

export function fitViewport(displayWidth: number, displayHeight: number): Viewport {
  const byWidth = Math.floor(displayWidth / VIRTUAL_WIDTH);
  const byHeight = Math.floor(displayHeight / VIRTUAL_HEIGHT);
  // At least 1: a display too small for one virtual pixel per device pixel
  // should crop, not blur.
  const scale = Math.max(1, Math.min(byWidth, byHeight));

  return {
    virtualWidth: VIRTUAL_WIDTH,
    virtualHeight: VIRTUAL_HEIGHT,
    scale,
    offsetX: Math.floor((displayWidth - VIRTUAL_WIDTH * scale) / 2),
    offsetY: Math.floor((displayHeight - VIRTUAL_HEIGHT * scale) / 2),
  };
}

/** World point to virtual-canvas pixel. Does not round — callers snap. */
export function worldToScreen(
  out: Vec2,
  world: Vec2,
  cameraCentre: Vec2,
  unitsPerPixel: number,
  vp: Viewport,
): Vec2 {
  out.x = (world.x - cameraCentre.x) / unitsPerPixel + vp.virtualWidth / 2;
  out.y = (world.y - cameraCentre.y) / unitsPerPixel + vp.virtualHeight / 2;
  return out;
}

/** Virtual-canvas pixel back to a world point. */
export function screenToWorld(
  out: Vec2,
  screen: Vec2,
  cameraCentre: Vec2,
  unitsPerPixel: number,
  vp: Viewport,
): Vec2 {
  out.x = (screen.x - vp.virtualWidth / 2) * unitsPerPixel + cameraCentre.x;
  out.y = (screen.y - vp.virtualHeight / 2) * unitsPerPixel + cameraCentre.y;
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/render/viewport.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/viewport.ts src/render/viewport.test.ts
git commit -m "feat: virtual canvas with a whole-number display scale

Sprites are baked into 64 unrotated bins so nothing resamples at runtime. A
fractional display scale would resample all of it anyway, so the scale is an
integer and the remainder is letterboxed in whole pixels."
```

---

### Task 6: `render/zoom.ts` — four discrete levels bound to LOD tiers

Zoom never scales a sprite. It changes how many world units a pixel covers and swaps to a different pre-generated LOD tier. The transition is a crossfade between two correctly-rendered frames, never an animated scale.

**Files:**
- Create: `src/render/zoom.ts`
- Test: `src/render/zoom.test.ts`

**Interfaces:**
- Consumes: `LOD_DIVISORS`, `LodTier` from `../gen/lod.js`
- Produces:
  - `type ZoomLevel = 0 | 1 | 2 | 3`
  - `const ZOOM_LEVELS: readonly ZoomLevel[]`
  - `const ZOOM_NAMES: Readonly<Record<ZoomLevel, string>>`
  - `const CROSSFADE_SECONDS: number` — 0.08
  - `interface ZoomState { level: ZoomLevel; from: ZoomLevel | null; elapsed: number }`
  - `function makeZoom(level?: ZoomLevel): ZoomState`
  - `function setZoom(z: ZoomState, level: ZoomLevel): void`
  - `function stepZoom(z: ZoomState, delta: number): void`
  - `function advanceZoom(z: ZoomState, dt: number): void`
  - `function crossfadeAlpha(z: ZoomState): number` — 1 when settled
  - `function unitsPerPixel(level: ZoomLevel): number`
  - `function lodTierFor(level: ZoomLevel): LodTier`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { LOD_DIVISORS } from '../gen/lod.js';
import {
  advanceZoom, crossfadeAlpha, CROSSFADE_SECONDS, lodTierFor, makeZoom,
  setZoom, stepZoom, unitsPerPixel, ZOOM_LEVELS,
} from './zoom.js';

describe('the four levels', () => {
  it('has exactly four, one per LOD tier', () => {
    expect(ZOOM_LEVELS).toEqual([0, 1, 2, 3]);
    expect(ZOOM_LEVELS.length).toBe(LOD_DIVISORS.length);
  });

  it('binds each level to its tier one to one', () => {
    for (const level of ZOOM_LEVELS) expect(lodTierFor(level)).toBe(level);
  });

  it('takes units-per-pixel straight from the LOD divisors', () => {
    // Zoom must never invent a scale the generator has no sprite for.
    for (const level of ZOOM_LEVELS) {
      expect(unitsPerPixel(level)).toBe(LOD_DIVISORS[level]);
    }
  });

  it('never yields a fractional units-per-pixel', () => {
    for (const level of ZOOM_LEVELS) {
      expect(Number.isInteger(unitsPerPixel(level))).toBe(true);
    }
  });
});

describe('changing level', () => {
  it('starts settled', () => {
    const z = makeZoom();
    expect(z.from).toBeNull();
    expect(crossfadeAlpha(z)).toBe(1);
  });

  it('records where it came from and begins a crossfade', () => {
    const z = makeZoom(0);
    setZoom(z, 3);
    expect(z.level).toBe(3);
    expect(z.from).toBe(0);
    expect(crossfadeAlpha(z)).toBeLessThan(1);
  });

  it('settles after the crossfade duration', () => {
    const z = makeZoom(0);
    setZoom(z, 1);
    advanceZoom(z, CROSSFADE_SECONDS);
    expect(crossfadeAlpha(z)).toBe(1);
    expect(z.from).toBeNull();
  });

  it('completes within 100ms, the feedback budget', () => {
    // The spec requires visible feedback within 100ms of any order.
    expect(CROSSFADE_SECONDS).toBeLessThanOrEqual(0.1);
  });

  it('ignores a set to the level it is already on', () => {
    const z = makeZoom(2);
    setZoom(z, 2);
    expect(z.from).toBeNull();
    expect(crossfadeAlpha(z)).toBe(1);
  });

  it('jumps straight to any level without passing through the others', () => {
    // Keys 1-4 bind directly, so Wide must be reachable in one press.
    const z = makeZoom(0);
    setZoom(z, 3);
    expect(z.level).toBe(3);
  });
});

describe('stepping', () => {
  it('moves one level at a time', () => {
    const z = makeZoom(1);
    stepZoom(z, 1);
    expect(z.level).toBe(2);
    stepZoom(z, -1);
    expect(z.level).toBe(1);
  });

  it('clamps at both ends rather than wrapping', () => {
    const z = makeZoom(0);
    stepZoom(z, -1);
    expect(z.level).toBe(0);
    setZoom(z, 3);
    advanceZoom(z, CROSSFADE_SECONDS);
    stepZoom(z, 1);
    expect(z.level).toBe(3);
  });
});

describe('crossfade', () => {
  it('rises monotonically to 1', () => {
    const z = makeZoom(0);
    setZoom(z, 1);
    let previous = crossfadeAlpha(z);
    for (let i = 0; i < 8; i++) {
      advanceZoom(z, CROSSFADE_SECONDS / 8);
      const now = crossfadeAlpha(z);
      expect(now).toBeGreaterThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBe(1);
  });

  it('clamps past the end rather than overshooting', () => {
    const z = makeZoom(0);
    setZoom(z, 1);
    advanceZoom(z, 10);
    expect(crossfadeAlpha(z)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/render/zoom.test.ts
```

Expected: FAIL — `Failed to resolve import "./zoom.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Four discrete zoom levels, each bound to one LOD tier.
 *
 * Zoom never scales a sprite. A 128px cruiser squeezed to 4px is mush, and mush
 * at the far end kills the wide shot the game is sold on — so instead the
 * camera changes how many world units a pixel covers and swaps to a different
 * pre-generated tier. Units-per-pixel comes straight from LOD_DIVISORS so the
 * camera can never ask for a scale the generator has no sprite for.
 *
 * The transition is a crossfade between two correctly-rendered frames, not an
 * animated scale. Animating the scale would put sprites at non-integer sizes
 * mid-transition and reintroduce exactly the resampling this design removes.
 */

import { LOD_DIVISORS, type LodTier } from '../gen/lod.js';

export type ZoomLevel = 0 | 1 | 2 | 3;

export const ZOOM_LEVELS: readonly ZoomLevel[] = [0, 1, 2, 3];

export const ZOOM_NAMES: Readonly<Record<ZoomLevel, string>> = {
  0: 'CLOSE',
  1: 'TACTICAL',
  2: 'OPERATIONAL',
  3: 'WIDE',
};

/** Short enough to sit inside the spec's 100ms feedback budget. */
export const CROSSFADE_SECONDS = 0.08;

export interface ZoomState {
  level: ZoomLevel;
  /** The level being faded out of, or null when settled. */
  from: ZoomLevel | null;
  elapsed: number;
}

export function makeZoom(level: ZoomLevel = 1): ZoomState {
  return { level, from: null, elapsed: 0 };
}

export function setZoom(z: ZoomState, level: ZoomLevel): void {
  if (level === z.level) return;
  z.from = z.level;
  z.level = level;
  z.elapsed = 0;
}

export function stepZoom(z: ZoomState, delta: number): void {
  const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, z.level + Math.sign(delta)));
  setZoom(z, next as ZoomLevel);
}

export function advanceZoom(z: ZoomState, dt: number): void {
  if (z.from === null) return;
  z.elapsed += dt;
  if (z.elapsed >= CROSSFADE_SECONDS) {
    z.from = null;
    z.elapsed = 0;
  }
}

/** 0 at the start of a transition, 1 once settled. */
export function crossfadeAlpha(z: ZoomState): number {
  if (z.from === null) return 1;
  return Math.max(0, Math.min(1, z.elapsed / CROSSFADE_SECONDS));
}

export function unitsPerPixel(level: ZoomLevel): number {
  return LOD_DIVISORS[level];
}

export function lodTierFor(level: ZoomLevel): LodTier {
  return level as LodTier;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/render/zoom.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/zoom.ts src/render/zoom.test.ts
git commit -m "feat: four discrete zoom levels bound to the LOD tiers

Units-per-pixel comes straight from LOD_DIVISORS, so the camera can never ask
for a scale the generator has no sprite for. Transitions crossfade two
correctly-rendered frames rather than animating a scale, which would put
sprites at non-integer sizes mid-transition."
```

---

### Task 7: `render/camera.ts` — follow, lead, and pixel-grid snapping

The camera is the other half of pixel integrity. A camera at a fractional world position puts every sprite on a fractional pixel, and the whole scene crawls. Snapping the camera to the pixel grid at the current zoom is what stops it.

**Files:**
- Create: `src/render/camera.ts`
- Test: `src/render/camera.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `vec2`, `sub`, `addScaled`, `distance` from `../sim/math/vec2.js`; `Body` from `../sim/body.js`
- Produces:
  - `interface Camera { position: Vec2; lag: number; lead: number }`
  - `function makeCamera(at?: Vec2): Camera`
  - `function followBody(cam: Camera, body: Body, dt: number): void`
  - `function snappedCentre(out: Vec2, cam: Camera, unitsPerPixel: number): Vec2`
  - `const DEFAULT_LAG: number`, `const DEFAULT_LEAD: number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { CRUISER_BODY, makeBody } from '../sim/body.js';
import { distance, vec2 } from '../sim/math/vec2.js';
import { followBody, makeCamera, snappedCentre } from './camera.js';

describe('following', () => {
  it('closes on a stationary ship', () => {
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(300, 200) });
    for (let i = 0; i < 240; i++) followBody(cam, b, 1 / 60);
    expect(distance(cam.position, b.position)).toBeLessThan(4);
  });

  it('lags behind rather than snapping', () => {
    // A camera welded to the ship makes the world jerk around it. Lag is what
    // lets the ship feel heavy rather than the background feel unstable.
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(1000, 0) });
    followBody(cam, b, 1 / 60);
    expect(cam.position.x).toBeGreaterThan(0);
    expect(cam.position.x).toBeLessThan(500);
  });

  it('leads in the direction of travel', () => {
    // Looking where you are going is what keeps the player from fighting the
    // camera, which the spec forbids outright.
    const still = makeBody({ ...CRUISER_BODY, position: vec2(0, 0) });
    const moving = makeBody({ ...CRUISER_BODY, position: vec2(0, 0), velocity: vec2(60, 0) });

    const a = makeCamera(vec2(0, 0));
    const b = makeCamera(vec2(0, 0));
    for (let i = 0; i < 120; i++) {
      followBody(a, still, 1 / 60);
      followBody(b, moving, 1 / 60);
    }
    expect(b.position.x).toBeGreaterThan(a.position.x + 5);
  });

  it('is stable when the ship is stationary', () => {
    const cam = makeCamera(vec2(0, 0));
    const b = makeBody({ ...CRUISER_BODY, position: vec2(100, 100) });
    for (let i = 0; i < 600; i++) followBody(cam, b, 1 / 60);
    const settled = vec2(cam.position.x, cam.position.y);
    for (let i = 0; i < 60; i++) followBody(cam, b, 1 / 60);
    expect(distance(cam.position, settled)).toBeLessThan(0.5);
  });
});

describe('pixel-grid snapping', () => {
  it('lands the centre on a whole pixel at every zoom divisor', () => {
    // This is the other half of pixel integrity. A camera on a fractional world
    // position puts every sprite on a fractional pixel and the scene crawls.
    const cam = makeCamera(vec2(123.456, -78.9));
    for (const upp of [1, 4, 8, 32]) {
      const c = snappedCentre(vec2(), cam, upp);
      expect(Number.isInteger(c.x / upp)).toBe(true);
      expect(Number.isInteger(c.y / upp)).toBe(true);
    }
  });

  it('never moves the centre by more than half a pixel', () => {
    for (const upp of [1, 4, 8, 32]) {
      for (let i = 0; i < 200; i++) {
        const cam = makeCamera(vec2(i * 7.31 - 500, i * -3.77 + 200));
        const c = snappedCentre(vec2(), cam, upp);
        expect(Math.abs(c.x - cam.position.x)).toBeLessThanOrEqual(upp / 2 + 1e-9);
        expect(Math.abs(c.y - cam.position.y)).toBeLessThanOrEqual(upp / 2 + 1e-9);
      }
    }
  });

  it('does not mutate the camera', () => {
    const cam = makeCamera(vec2(10.5, 20.5));
    snappedCentre(vec2(), cam, 8);
    expect(cam.position).toEqual({ x: 10.5, y: 20.5 });
  });

  it('is stable for a stationary camera — no jitter between frames', () => {
    const cam = makeCamera(vec2(50.4999, 50.4999));
    const a = snappedCentre(vec2(), cam, 4);
    const b = snappedCentre(vec2(), cam, 4);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/render/camera.test.ts
```

Expected: FAIL — `Failed to resolve import "./camera.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The tactical camera.
 *
 * Two jobs, and the second one is load-bearing for the art direction.
 *
 * It follows the ship with lag and a small lead in the direction of travel. A
 * camera welded to the hull makes the world jerk around a stationary ship;
 * lagging lets the ship read as heavy instead. Leading keeps the player looking
 * where they are going, which is what stops them fighting the camera — the spec
 * forbids that outright.
 *
 * And it snaps to the pixel grid. A camera at a fractional world position puts
 * every sprite on a fractional pixel, and the entire scene crawls no matter how
 * carefully the sprites themselves were baked. Snapping is cheap and it is the
 * difference between a still image and a shimmering one.
 */

import { makeBody, type Body } from '../sim/body.js';
import { addScaled, sub, vec2, type Vec2 } from '../sim/math/vec2.js';

export interface Camera {
  position: Vec2;
  /** Fraction of the remaining gap closed per second. */
  lag: number;
  /** Seconds of velocity to look ahead by. */
  lead: number;
}

export const DEFAULT_LAG = 3.2;
export const DEFAULT_LEAD = 0.45;

export function makeCamera(at: Vec2 = vec2()): Camera {
  return { position: vec2(at.x, at.y), lag: DEFAULT_LAG, lead: DEFAULT_LEAD };
}

const _desired = vec2();
const _gap = vec2();

export function followBody(cam: Camera, body: Body, dt: number): void {
  // Look ahead of the ship by a fraction of a second of travel.
  _desired.x = body.position.x + body.velocity.x * cam.lead;
  _desired.y = body.position.y + body.velocity.y * cam.lead;

  sub(_gap, _desired, cam.position);

  // Exponential approach, frame-rate independent.
  const t = 1 - Math.exp(-cam.lag * dt);
  addScaled(cam.position, cam.position, _gap, t);
}

/**
 * The camera centre rounded onto the current zoom's pixel grid.
 *
 * Returns a new value rather than moving the camera, so the smooth follow keeps
 * its sub-pixel precision internally and only the rendered centre is quantised.
 * Quantising the camera itself would make it stutter as it crept between cells.
 */
export function snappedCentre(out: Vec2, cam: Camera, unitsPerPixel: number): Vec2 {
  out.x = Math.round(cam.position.x / unitsPerPixel) * unitsPerPixel;
  out.y = Math.round(cam.position.y / unitsPerPixel) * unitsPerPixel;
  return out;
}
```

Note the unused `makeBody` import must be removed — the module only needs the `Body` type. Keep the import list to what is actually referenced or `noUnusedLocals` rejects the file.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/render/camera.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/camera.ts src/render/camera.test.ts
git commit -m "feat: camera that lags, leads, and snaps to the pixel grid

Lag lets the ship read as heavy instead of making the world jerk around it, and
leading keeps the player from fighting the camera. Snapping only the rendered
centre — not the camera itself — keeps the follow smooth while putting every
sprite on a whole pixel."
```

---

### Task 8: `render/parallax.ts` — layer offsets that never shimmer

Each background layer moves at a fraction of the camera's speed. Every offset must land on a whole pixel, or the layers crawl against each other — the most visible possible failure, since these fill the screen.

**Files:**
- Create: `src/render/parallax.ts`
- Test: `src/render/parallax.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `vec2` from `../sim/math/vec2.js`; `Layer`, `PoiStack` from `../gen/celestial.js`
- Produces:
  - `interface LayerPlacement { offsetX: number; offsetY: number; wrapWidth: number; wrapHeight: number }`
  - `function placeLayer(out: LayerPlacement, layer: Layer, cameraCentre: Vec2, unitsPerPixel: number): LayerPlacement`
  - `function makePlacement(): LayerPlacement`
  - `function sortedLayers(stack: PoiStack): readonly Layer[]` — far to near, foreground last

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildPoiStack } from '../gen/celestial.js';
import { makeRng } from '../sim/rng.js';
import { vec2 } from '../sim/math/vec2.js';
import { makePlacement, placeLayer, sortedLayers } from './parallax.js';

const stack = () => buildPoiStack('graveyard', 220, 130, makeRng('parallax'));

describe('placeLayer', () => {
  it('always produces whole-pixel offsets', () => {
    // Fractional offsets make layers crawl against each other, and these fill
    // the screen, so it is the most visible failure available.
    const s = stack();
    const p = makePlacement();
    for (const layer of s.layers) {
      for (const upp of [1, 4, 8, 32]) {
        for (let i = 0; i < 60; i++) {
          placeLayer(p, layer, vec2(i * 13.7 - 300, i * -7.3 + 90), upp);
          expect(Number.isInteger(p.offsetX)).toBe(true);
          expect(Number.isInteger(p.offsetY)).toBe(true);
        }
      }
    }
  });

  it('moves a near layer further than a far one', () => {
    const s = stack();
    const far = s.layers[0]!;
    const near = s.layers[s.layers.length - 1]!;
    expect(near.parallax).toBeGreaterThan(far.parallax);

    const a = placeLayer(makePlacement(), far, vec2(1000, 0), 1);
    const b = placeLayer(makePlacement(), near, vec2(1000, 0), 1);
    expect(Math.abs(b.offsetX)).toBeGreaterThan(Math.abs(a.offsetX));
  });

  it('barely moves the most distant layer', () => {
    // Parallax near zero is the definition of "infinitely far".
    const s = stack();
    const far = s.layers[0]!;
    const p = placeLayer(makePlacement(), far, vec2(5000, 0), 1);
    expect(Math.abs(p.offsetX)).toBeLessThan(5000 * far.parallax + 2);
  });

  it('reports the layer size for wrapping', () => {
    const s = stack();
    const layer = s.layers[1]!;
    const p = placeLayer(makePlacement(), layer, vec2(0, 0), 1);
    expect(p.wrapWidth).toBe(layer.buf.w);
    expect(p.wrapHeight).toBe(layer.buf.h);
  });

  it('is stable for a stationary camera', () => {
    const s = stack();
    const layer = s.layers[2]!;
    const a = placeLayer(makePlacement(), layer, vec2(77.7, -33.3), 4);
    const b = placeLayer(makePlacement(), layer, vec2(77.7, -33.3), 4);
    expect(a).toEqual(b);
  });

  it('does not allocate — writes into the placement it is given', () => {
    const s = stack();
    const p = makePlacement();
    const returned = placeLayer(p, s.layers[0]!, vec2(1, 1), 1);
    expect(returned).toBe(p);
  });
});

describe('sortedLayers', () => {
  it('orders far to near', () => {
    const ordered = sortedLayers(stack());
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.parallax).toBeGreaterThanOrEqual(ordered[i - 1]!.parallax);
    }
  });

  it('puts the foreground last, in front of the play plane', () => {
    const s = buildPoiStack('wreckreef', 220, 130, makeRng('fg'));
    const ordered = sortedLayers(s);
    if (s.foreground !== null) {
      expect(ordered[ordered.length - 1]!.name).toBe(s.foreground.name);
      expect(ordered[ordered.length - 1]!.parallax).toBeGreaterThan(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/render/parallax.test.ts
```

Expected: FAIL — `Failed to resolve import "./parallax.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Parallax layer placement.
 *
 * Depth without a third axis. Each layer moves at a fraction of the camera's
 * speed — 0 is infinitely far and never moves, 1 is the play plane, and the
 * optional foreground sits above 1 and overtakes the action.
 *
 * Every offset is rounded to a whole pixel. Background layers fill the screen,
 * so a fractional offset is the most visible defect available: the layers crawl
 * against each other and the whole frame looks unstable, whatever the sprites
 * themselves are doing.
 */

import type { Layer, PoiStack } from '../gen/celestial.js';
import type { Vec2 } from '../sim/math/vec2.js';

export interface LayerPlacement {
  offsetX: number;
  offsetY: number;
  wrapWidth: number;
  wrapHeight: number;
}

export function makePlacement(): LayerPlacement {
  return { offsetX: 0, offsetY: 0, wrapWidth: 0, wrapHeight: 0 };
}

export function placeLayer(
  out: LayerPlacement,
  layer: Layer,
  cameraCentre: Vec2,
  unitsPerPixel: number,
): LayerPlacement {
  // Round after scaling, so the offset is whole pixels on the virtual canvas
  // rather than whole world units.
  out.offsetX = -Math.round((cameraCentre.x * layer.parallax) / unitsPerPixel);
  out.offsetY = -Math.round((cameraCentre.y * layer.parallax) / unitsPerPixel);
  out.wrapWidth = layer.buf.w;
  out.wrapHeight = layer.buf.h;
  return out;
}

/** Far to near, with the foreground last so it draws over the play plane. */
export function sortedLayers(stack: PoiStack): readonly Layer[] {
  const all = stack.foreground === null
    ? [...stack.layers]
    : [...stack.layers, stack.foreground];
  return all.sort((a, b) => a.parallax - b.parallax);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/render/parallax.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify purity still holds now that `render/` imports `gen/` and `sim/`**

```bash
npx vitest run tools/purity.test.ts
npm test
```

Expected: PASS. `src/render/` importing from `src/gen/` and `src/sim/` is legal; the reverse is not, and the transitive check will now report the chain if it ever happens.

- [ ] **Step 6: Commit**

```bash
git add src/render/parallax.ts src/render/parallax.test.ts
git commit -m "feat: parallax placement rounded to whole pixels

Background layers fill the screen, so a fractional offset is the most visible
defect available — the layers crawl against each other and the frame looks
unstable however carefully the sprites were baked."
```

---

### Task 9: `render/atlaspack.ts` — packing 64 rotation bins into one texture

A fitted cruiser bakes to 64 bins. Uploading 64 separate textures per ship would shred the draw-call budget, so they go into one atlas. The packing arithmetic is pure and belongs here, away from any GPU call.

**Files:**
- Create: `src/render/atlaspack.ts`
- Test: `src/render/atlaspack.test.ts`

**Interfaces:**
- Consumes: `PixBuf` from `../gen/pixbuf.js`
- Produces:
  - `interface PackedRect { index: number; x: number; y: number; w: number; h: number }`
  - `interface AtlasLayout { width: number; height: number; rects: readonly PackedRect[] }`
  - `function packUniform(count: number, cellW: number, cellH: number, maxWidth?: number): AtlasLayout`
  - `const MAX_ATLAS_DIMENSION: number` — 4096
  - `function layoutForBins(bins: readonly PixBuf[]): AtlasLayout`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createBuf } from '../gen/pixbuf.js';
import { layoutForBins, MAX_ATLAS_DIMENSION, packUniform } from './atlaspack.js';

describe('packUniform', () => {
  it('places every cell', () => {
    const layout = packUniform(64, 40, 40);
    expect(layout.rects).toHaveLength(64);
    expect(new Set(layout.rects.map((r) => r.index)).size).toBe(64);
  });

  it('never overlaps two cells', () => {
    const layout = packUniform(64, 37, 41);
    for (let i = 0; i < layout.rects.length; i++) {
      for (let j = i + 1; j < layout.rects.length; j++) {
        const a = layout.rects[i]!;
        const b = layout.rects[j]!;
        const disjoint =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(disjoint, `rect ${a.index} overlaps ${b.index}`).toBe(true);
      }
    }
  });

  it('keeps every cell inside the reported bounds', () => {
    const layout = packUniform(64, 37, 41);
    for (const r of layout.rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(layout.width);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it('uses whole-pixel positions', () => {
    // A cell on a fractional texel samples its neighbour's edge and bleeds.
    const layout = packUniform(64, 40, 40);
    for (const r of layout.rects) {
      expect(Number.isInteger(r.x)).toBe(true);
      expect(Number.isInteger(r.y)).toBe(true);
    }
  });

  it('stays within the maximum texture dimension', () => {
    const layout = packUniform(64, 190, 190);
    expect(layout.width).toBeLessThanOrEqual(MAX_ATLAS_DIMENSION);
  });

  it('throws rather than silently truncating when the cells cannot fit', () => {
    expect(() => packUniform(64, 4000, 4000)).toThrow(RangeError);
  });

  it('handles a single cell', () => {
    const layout = packUniform(1, 12, 12);
    expect(layout.rects).toHaveLength(1);
    expect(layout.rects[0]).toEqual({ index: 0, x: 0, y: 0, w: 12, h: 12 });
  });
});

describe('layoutForBins', () => {
  it('sizes cells to the largest bin so every bin fits its cell', () => {
    // bakeRotations returns equal-sized bins, but taking the max rather than
    // assuming it means an unequal set degrades to wasted space, not corruption.
    const bins = [createBuf(30, 30), createBuf(40, 36), createBuf(20, 20)];
    const layout = layoutForBins(bins);
    for (const r of layout.rects) {
      expect(r.w).toBeGreaterThanOrEqual(40);
      expect(r.h).toBeGreaterThanOrEqual(36);
    }
  });

  it('produces one rect per bin', () => {
    const bins = Array.from({ length: 64 }, () => createBuf(48, 48));
    expect(layoutForBins(bins).rects).toHaveLength(64);
  });

  it('rejects an empty bin list', () => {
    expect(() => layoutForBins([])).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/render/atlaspack.test.ts
```

Expected: FAIL — `Failed to resolve import "./atlaspack.js"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Rectangle packing for the rotation-bin atlas.
 *
 * A fitted cruiser bakes into 64 bins. Uploading those as 64 textures and
 * binding a different one every frame would spend the draw-call budget on a
 * single ship, so they share one atlas and the renderer changes UVs instead.
 *
 * The bins are all the same size, so a uniform grid is the whole algorithm —
 * no bin-packing heuristics needed. This lives apart from any GPU call because
 * it is arithmetic, and arithmetic is the part a unit test can reach.
 */

import type { PixBuf } from '../gen/pixbuf.js';

/** Conservative ceiling that every WebGL2 and WebGPU target supports. */
export const MAX_ATLAS_DIMENSION = 4096;

export interface PackedRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  rects: readonly PackedRect[];
}

export function packUniform(
  count: number,
  cellW: number,
  cellH: number,
  maxWidth: number = MAX_ATLAS_DIMENSION,
): AtlasLayout {
  if (count <= 0) throw new RangeError(`atlas needs at least one cell, got ${count}`);
  if (cellW <= 0 || cellH <= 0) {
    throw new RangeError(`cell size must be positive, got ${cellW}x${cellH}`);
  }

  const columns = Math.max(1, Math.floor(maxWidth / cellW));
  const rows = Math.ceil(count / columns);

  const width = Math.min(maxWidth, columns * cellW);
  const height = rows * cellH;

  if (cellW > maxWidth || height > MAX_ATLAS_DIMENSION) {
    throw new RangeError(
      `${count} cells of ${cellW}x${cellH} need ${width}x${height}, ` +
      `over the ${MAX_ATLAS_DIMENSION} limit`,
    );
  }

  const rects: PackedRect[] = [];
  for (let i = 0; i < count; i++) {
    rects.push({
      index: i,
      x: (i % columns) * cellW,
      y: Math.floor(i / columns) * cellH,
      w: cellW,
      h: cellH,
    });
  }

  return { width, height, rects };
}

/**
 * Lays out a baked rotation set.
 *
 * `bakeRotations` returns equally-sized bins, but the cell is sized to the
 * largest anyway — an unequal set then wastes space instead of writing one bin
 * over its neighbour.
 */
export function layoutForBins(bins: readonly PixBuf[]): AtlasLayout {
  if (bins.length === 0) throw new RangeError('cannot lay out an empty bin list');

  let cellW = 0;
  let cellH = 0;
  for (const b of bins) {
    if (b.w > cellW) cellW = b.w;
    if (b.h > cellH) cellH = b.h;
  }

  return packUniform(bins.length, cellW, cellH);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/render/atlaspack.test.ts
```

Expected: PASS.

- [ ] **Step 5: Report the real atlas cost**

Write a throwaway script outside the repo that builds a fitted player cruiser, bakes 64 bins, and prints `layoutForBins`'s dimensions and the implied bytes at 4 per pixel. Put the number in the commit message. A whole-branch review previously measured roughly 8.8 MB per fitted cruiser, and the benchmark scene calls for 12 combat ships plus a capital — this is the number that decides whether the atlas strategy needs revisiting in Wave 3.

- [ ] **Step 6: Commit**

```bash
git add src/render/atlaspack.ts src/render/atlaspack.test.ts
git commit -m "feat: uniform atlas packing for the 64 rotation bins

The bins are all one size, so a grid is the whole algorithm — no heuristics.
Kept away from any GPU call because it is arithmetic, and arithmetic is the
part a test can reach."
```

---

# Render adapters — the only files that touch PixiJS

These cannot be unit-tested in Node, so each ends with a **browser smoke check** instead. That asymmetry is deliberate: everything testable was pushed into the four pure modules above, and what remains here is thin enough to verify by looking.

### Task 10: `render/device.ts` — application boot and the verified WebGL2 fallback

The spec requires PixiJS v8's WebGPU path *with its automatic WebGL2 fallback verified at build time*. Verified means observed, not assumed.

**Files:**
- Create: `src/render/device.ts`
- Modify: `index.html`
- Test: manual browser check, recorded in the commit

**Interfaces:**
- Consumes: `Viewport`, `fitViewport`, `VIRTUAL_WIDTH`, `VIRTUAL_HEIGHT` from `./viewport.js`; `pixi.js`
- Produces:
  - `interface Device { app: Application; stage: Container; viewport: Viewport; renderer: 'webgpu' | 'webgl' }`
  - `async function createDevice(host: HTMLElement, preference?: 'webgpu' | 'webgl'): Promise<Device>`
  - `function resizeDevice(device: Device, displayWidth: number, displayHeight: number): void`

- [ ] **Step 1: Write the implementation**

```ts
/**
 * PixiJS application boot.
 *
 * The spec asks for WebGPU with automatic WebGL2 fallback, verified rather than
 * assumed — so `createDevice` reports which backend it actually got, and the
 * boot logs it. A silent fallback is the kind of thing that is discovered on a
 * user's machine six months later.
 *
 * The stage is the virtual canvas: everything is drawn into it at 1:1 and it is
 * scaled to the window by a whole number. Nearest-neighbour scaling and a
 * pixel-perfect canvas style are both required here, or the integer scale gets
 * undone by the browser's default smoothing at the very last step.
 */

import { Application, Container, type Renderer } from 'pixi.js';
import { fitViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH, type Viewport } from './viewport.js';

export interface Device {
  app: Application;
  /** The virtual canvas. Draw into this, never into app.stage directly. */
  stage: Container;
  viewport: Viewport;
  renderer: 'webgpu' | 'webgl';
}

export async function createDevice(
  host: HTMLElement,
  preference: 'webgpu' | 'webgl' = 'webgpu',
): Promise<Device> {
  const app = new Application();

  await app.init({
    preference,
    width: host.clientWidth,
    height: host.clientHeight,
    backgroundColor: 0x04050a,
    antialias: false,
    roundPixels: true,
    autoDensity: false,
    resolution: 1,
  });

  // Nearest-neighbour at the canvas level. Without this the browser smooths the
  // integer upscale and every pixel-integrity guarantee upstream is undone at
  // the last possible step.
  app.canvas.style.imageRendering = 'pixelated';
  host.appendChild(app.canvas);

  const stage = new Container();
  app.stage.addChild(stage);

  const backend = detectBackend(app.renderer);
  const viewport = fitViewport(host.clientWidth, host.clientHeight);

  const device: Device = { app, stage, viewport, renderer: backend };
  applyViewport(device);

  // Loud on purpose: a silent fallback is discovered on someone else's machine.
  console.info(
    `[render] backend=${backend} virtual=${VIRTUAL_WIDTH}x${VIRTUAL_HEIGHT} scale=${viewport.scale}`,
  );

  return device;
}

function detectBackend(renderer: Renderer): 'webgpu' | 'webgl' {
  // Pixi v8 exposes a `type` string on the renderer; treat anything that is not
  // explicitly webgpu as the WebGL2 path rather than guessing.
  const type = (renderer as unknown as { type?: unknown }).type;
  return typeof type === 'string' && type.toLowerCase().includes('gpu') ? 'webgpu' : 'webgl';
}

export function resizeDevice(device: Device, displayWidth: number, displayHeight: number): void {
  device.app.renderer.resize(displayWidth, displayHeight);
  device.viewport = fitViewport(displayWidth, displayHeight);
  applyViewport(device);
}

function applyViewport(device: Device): void {
  const { scale, offsetX, offsetY } = device.viewport;
  device.stage.scale.set(scale);
  device.stage.position.set(offsetX, offsetY);
}
```

- [ ] **Step 2: Point `index.html` at a host element**

Replace the body of `index.html` so the canvas has a full-window host:

```html
  <body>
    <div id="app"></div>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
```

And extend the existing style block so the host fills the window:

```css
      #app { position: fixed; inset: 0; }
```

Keep the existing `image-rendering: pixelated` rule on `canvas` — it is load-bearing and predates this task.

- [ ] **Step 3: Verify the backend and the fallback by observation**

Run `npm run dev` and open the page. Confirm in the console:

- the `[render] backend=…` line appears, and reports `webgpu` on a machine that supports it
- the reported `scale` is a whole number matching the window size

Then force the fallback by passing `'webgl'` as the preference temporarily, reload, and confirm the line reports `webgl` and the page still renders. **Record both observed strings in the commit message.** Restore the default preference afterwards.

This is the "verify the fallback path at build time" requirement from the spec. Do not skip it and do not infer it from documentation.

- [ ] **Step 4: Confirm the purity boundary still holds**

```bash
npm test
```

Expected: PASS. `src/render/device.ts` imports `pixi.js`, which is legal — but nothing in `src/sim/` or `src/gen/` may reach it, and the purity check is transitive now, so a stray import anywhere in the graph will name the chain.

- [ ] **Step 5: Commit**

```bash
git add src/render/device.ts index.html
git commit -m "feat: Pixi boot with an observed WebGL2 fallback

Reports which backend it actually got rather than assuming WebGPU — a silent
fallback is discovered on someone else's machine six months later. Nearest
neighbour is set at the canvas level too, or the browser smooths the integer
upscale and undoes every pixel guarantee upstream at the last step."
```

---

### Task 11: `render/textures.ts` and `render/scene.ts` — uploads and the draw list

`PixBuf` is a plain RGBA buffer with no notion of a GPU. These two files are the only place that changes.

**Files:**
- Create: `src/render/textures.ts`, `src/render/scene.ts`
- Test: manual browser check plus a Node test for the pure parts of `scene.ts`

**Interfaces:**
- Consumes: `PixBuf` from `../gen/pixbuf.js`; `AtlasLayout`, `layoutForBins` from `./atlaspack.js`; `Layer` from `../gen/celestial.js`; `LayerPlacement` from `./parallax.js`; `pixi.js`
- Produces (`textures.ts`):
  - `function textureFromPixBuf(buf: PixBuf): Texture`
  - `interface BinAtlas { texture: Texture; frames: readonly Texture[]; layout: AtlasLayout }`
  - `function atlasFromBins(bins: readonly PixBuf[]): BinAtlas`
  - `function destroyAtlas(atlas: BinAtlas): void`
- Produces (`scene.ts`):
  - `interface Scene { root: Container; background: Container; play: Container; foreground: Container }`
  - `function makeScene(parent: Container): Scene`
  - `function setLayerSprite(sprite: Sprite, placement: LayerPlacement): void`
  - `const LAYER_Z: Readonly<Record<'background' | 'play' | 'foreground', number>>`

- [ ] **Step 1: Write the implementation for `textures.ts`**

```ts
/**
 * The boundary where a generated buffer becomes something a GPU can sample.
 *
 * `PixBuf` is deliberately ignorant of rendering — it is a flat RGBA array the
 * generator can build headlessly in Node, which is what lets the contact sheet
 * exist without a browser. This file is the only place that changes, so the
 * generator never grows a dependency on a renderer.
 *
 * Every texture is nearest-neighbour. Linear filtering on a 47x128 hull is the
 * single fastest way to undo the entire pixel-integrity chain.
 */

import { Texture, TextureSource, Rectangle } from 'pixi.js';
import type { PixBuf } from '../gen/pixbuf.js';
import { layoutForBins, type AtlasLayout } from './atlaspack.js';

export function textureFromPixBuf(buf: PixBuf): Texture {
  const source = new TextureSource({
    resource: new Uint8Array(buf.data.buffer.slice(0)),
    width: buf.w,
    height: buf.h,
    scaleMode: 'nearest',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  return new Texture({ source });
}

export interface BinAtlas {
  texture: Texture;
  /** One sub-texture per rotation bin, indexed by bin number. */
  frames: readonly Texture[];
  layout: AtlasLayout;
}

/**
 * Packs a baked rotation set into a single texture.
 *
 * 64 separate textures per ship would spend the whole draw-call budget on one
 * hull; sharing an atlas means the renderer swaps UVs instead of rebinding.
 */
export function atlasFromBins(bins: readonly PixBuf[]): BinAtlas {
  const layout = layoutForBins(bins);

  const packed = new Uint8Array(layout.width * layout.height * 4);
  for (const rect of layout.rects) {
    const bin = bins[rect.index]!;
    for (let y = 0; y < bin.h; y++) {
      const src = y * bin.w * 4;
      const dst = ((rect.y + y) * layout.width + rect.x) * 4;
      packed.set(bin.data.subarray(src, src + bin.w * 4), dst);
    }
  }

  const source = new TextureSource({
    resource: packed,
    width: layout.width,
    height: layout.height,
    scaleMode: 'nearest',
    alphaMode: 'premultiply-alpha-on-upload',
  });

  const sheet = new Texture({ source });
  const frames = layout.rects.map(
    (r) => new Texture({ source, frame: new Rectangle(r.x, r.y, r.w, r.h) }),
  );

  return { texture: sheet, frames, layout };
}

export function destroyAtlas(atlas: BinAtlas): void {
  for (const frame of atlas.frames) frame.destroy(false);
  atlas.texture.destroy(true);
}
```

- [ ] **Step 2: Write the implementation for `scene.ts`**

```ts
/**
 * The draw list.
 *
 * Three containers in a fixed order: background parallax, the play plane, and
 * the sparse foreground that drifts in front of the action. Order is structural
 * rather than sorted per frame — the spec's layering is fixed, and a per-frame
 * sort would be cost paid for nothing.
 */

import { Container, type Sprite } from 'pixi.js';
import type { LayerPlacement } from './parallax.js';

export const LAYER_Z: Readonly<Record<'background' | 'play' | 'foreground', number>> = {
  background: 0,
  play: 1,
  foreground: 2,
};

export interface Scene {
  root: Container;
  background: Container;
  play: Container;
  foreground: Container;
}

export function makeScene(parent: Container): Scene {
  const root = new Container();
  const background = new Container();
  const play = new Container();
  const foreground = new Container();

  root.addChild(background, play, foreground);
  parent.addChild(root);

  return { root, background, play, foreground };
}

/**
 * Positions a parallax layer sprite.
 *
 * The placement's offsets are already whole pixels — this must not reintroduce
 * a fraction by scaling or rounding differently.
 */
export function setLayerSprite(sprite: Sprite, placement: LayerPlacement): void {
  sprite.position.set(placement.offsetX, placement.offsetY);
}
```

- [ ] **Step 3: Verify in the browser**

There is no useful Node test for a GPU upload. Instead, temporarily add to `src/app/main.ts` a boot that builds one player cruiser, bakes its rotation bins, uploads the atlas, and draws bin 0 at the centre of the virtual canvas. Run `npm run dev` and confirm:

- the sprite appears, crisp, with no blurring at the edges
- the console reports the atlas dimensions from Task 9's measurement
- resizing the window keeps the sprite crisp and the scale a whole number

**Confirm nearest-neighbour is genuinely in effect** by zooming the browser to 200% — pixel edges must stay hard. If they soften, the `scaleMode` did not take and no amount of upstream work will fix it.

Record what you observed in the commit message.

- [ ] **Step 4: Run the suite and the purity check**

```bash
npm test
npm run typecheck
```

Expected: PASS. `render/` importing `pixi.js` is legal; `sim/` and `gen/` reaching it is not, and the check is transitive.

- [ ] **Step 5: Commit**

```bash
git add src/render/textures.ts src/render/scene.ts
git commit -m "feat: upload PixBufs as nearest-neighbour textures and an atlas

The only place a generated buffer learns about a GPU, so the generator keeps
its headless build. Linear filtering on a 47x128 hull is the fastest way to
undo the whole pixel-integrity chain, so every texture is nearest."
```

---

### Task 12: `render/post.ts` — bloom, dither, grain, vignette, in that order

The spec fixes the chain and its order, and forbids everything else. No CRT curvature, no scanlines, no chromatic aberration. Emissives are the only colours allowed to bloom, which is why the palette put them above every hull value.

**Files:**
- Create: `src/render/post.ts`
- Test: manual browser check

**Interfaces:**
- Consumes: `Container`, `Filter` from `pixi.js`; `EMISSIVE_SET` from `../gen/palette.js`
- Produces:
  - `interface PostChain { filters: Filter[]; setEnabled(stage: keyof PostSettings, on: boolean): void }`
  - `interface PostSettings { bloom: boolean; dither: boolean; grain: boolean; vignette: boolean }`
  - `const DEFAULT_POST: Readonly<PostSettings>`
  - `const BLOOM_THRESHOLD: number`
  - `function makePostChain(target: Container, settings?: Partial<PostSettings>): PostChain`

- [ ] **Step 1: Write the implementation**

```ts
/**
 * The post chain: bloom, then ordered dither, then grain, then vignette.
 *
 * The spec fixes both the contents and the order, and forbids everything else —
 * no CRT curvature, no scanline cosplay, no chromatic aberration. This is meant
 * to read as clean pixel art under a disciplined grade, not as nostalgia
 * filtering.
 *
 * The bloom threshold is high on purpose. Emissives are the only colours
 * permitted to bloom, and the palette was built so every emissive sits above
 * every hull value precisely so a threshold can separate them. A lower
 * threshold would haze the plating and turn the ships into blobs.
 */

import { Filter, GlProgram, type Container } from 'pixi.js';

export interface PostSettings {
  bloom: boolean;
  dither: boolean;
  grain: boolean;
  vignette: boolean;
}

export const DEFAULT_POST: Readonly<PostSettings> = {
  bloom: true,
  dither: true,
  grain: true,
  vignette: true,
};

/**
 * Luminance above which a pixel blooms, in 0..1.
 *
 * The dimmest emissive in the palette sits well above the brightest hull value;
 * this threshold lives in the gap. If hulls start hazing, the palette's
 * emissive-brightness invariant has regressed — fix that, not this number.
 */
export const BLOOM_THRESHOLD = 0.72;

/** Grain is deliberately barely there. */
const GRAIN_STRENGTH = 0.035;
const VIGNETTE_STRENGTH = 0.28;

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }
`;

function makeFilter(fragment: string, resources: Record<string, unknown> = {}): Filter {
  return new Filter({
    glProgram: GlProgram.from({ vertex: VERTEX, fragment }),
    resources,
  });
}

/**
 * Bloom, tight. Extracts only pixels above the threshold, blurs them a little,
 * and adds them back — no haze pass over the whole frame.
 */
function bloomFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uThreshold;
out vec4 finalColor;
void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec3 sum = vec3(0.0);
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      vec2 o = vec2(float(x), float(y)) * uInputSize.zw;
      vec4 s = texture(uTexture, vTextureCoord + o);
      float l = dot(s.rgb, vec3(0.299, 0.587, 0.114));
      if (l > uThreshold) sum += s.rgb * (l - uThreshold);
    }
  }
  finalColor = vec4(base.rgb + sum * 0.16, base.a);
}
`, { uniforms: { uThreshold: { value: BLOOM_THRESHOLD, type: 'f32' } } });
}

/** Ordered 4x4 dither, applied only where the frame has a gradient to break up. */
function ditherFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
out vec4 finalColor;
const float bayer[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0);
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 p = vTextureCoord * uInputSize.xy;
  int i = int(mod(p.y, 4.0)) * 4 + int(mod(p.x, 4.0));
  float t = (bayer[i] / 16.0 - 0.5) * (1.0 / 255.0) * 2.0;
  finalColor = vec4(c.rgb + t, c.a);
}
`);
}

/** Static grain — no time uniform, so it cannot crawl between frames. */
function grainFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uStrength;
out vec4 finalColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float n = hash(floor(vTextureCoord * uInputSize.xy)) - 0.5;
  finalColor = vec4(c.rgb + n * uStrength, c.a);
}
`, { uniforms: { uStrength: { value: GRAIN_STRENGTH, type: 'f32' } } });
}

function vignetteFilter(): Filter {
  return makeFilter(`
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uStrength;
out vec4 finalColor;
void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 d = vTextureCoord - 0.5;
  float v = 1.0 - dot(d, d) * uStrength * 2.0;
  finalColor = vec4(c.rgb * clamp(v, 0.0, 1.0), c.a);
}
`, { uniforms: { uStrength: { value: VIGNETTE_STRENGTH, type: 'f32' } } });
}

export interface PostChain {
  filters: Filter[];
  setEnabled(stage: keyof PostSettings, on: boolean): void;
}

export function makePostChain(
  target: Container,
  settings: Partial<PostSettings> = {},
): PostChain {
  const active: PostSettings = { ...DEFAULT_POST, ...settings };

  const built: Record<keyof PostSettings, Filter> = {
    bloom: bloomFilter(),
    dither: ditherFilter(),
    grain: grainFilter(),
    vignette: vignetteFilter(),
  };

  // Order is fixed by the spec and must not be sorted or reordered.
  const ORDER: (keyof PostSettings)[] = ['bloom', 'dither', 'grain', 'vignette'];

  const rebuild = (): void => {
    const filters = ORDER.filter((k) => active[k]).map((k) => built[k]);
    target.filters = filters;
  };

  rebuild();

  return {
    get filters(): Filter[] {
      return ORDER.filter((k) => active[k]).map((k) => built[k]);
    },
    setEnabled(stage: keyof PostSettings, on: boolean): void {
      active[stage] = on;
      rebuild();
    },
  };
}
```

- [ ] **Step 2: Verify each stage in the browser, one at a time**

Run `npm run dev` with a ship and a POI background on screen. Toggle each stage off and on via `setEnabled` from the console and confirm:

- **bloom** — running lights and emissive accents glow; **hull plating does not haze.** If plate is blooming, the threshold is too low or the palette's emissive-brightness invariant has regressed. Check the palette before touching the threshold.
- **dither** — large gradient areas in nebulae lose their banding; hull plate is visibly unaffected
- **grain** — barely perceptible, and **static between frames**. If it crawls, something is feeding it time, which the spec does not ask for.
- **vignette** — corners darken slightly; the effect should be hard to notice and easy to miss when off

Also confirm the whole chain off looks like clean pixel art, and on looks like the same art slightly graded — not like a filter demo.

Record your observations for each stage in the commit message.

- [ ] **Step 3: Confirm nothing forbidden crept in**

```bash
grep -nE "curvature|scanline|chromatic|barrel|aberration" src/render/post.ts || echo "clean"
```

Expected: `clean`. The spec forbids all four by name.

- [ ] **Step 4: Commit**

```bash
git add src/render/post.ts
git commit -m "feat: the four-stage post chain, in the order the spec fixes

Bloom, ordered dither, grain, vignette — and nothing else. The bloom threshold
sits in the gap the palette deliberately left between the brightest hull value
and the dimmest emissive, so lights glow and plating does not haze. Grain takes
no time uniform, so it cannot crawl."
```

---

# The payoff

### Task 13: `app/input.ts` and `app/main.ts` — fly the ship

Everything above is machinery. This task is the first build where the game is a moving picture: a cruiser you can order around a POI, at four zoom levels, with parallax depth and real momentum.

**Files:**
- Create: `src/app/input.ts`
- Modify: `src/app/main.ts` (currently a boot stub)
- Test: `src/app/input.test.ts` for the pure parts, plus a scripted browser check

**Interfaces:**
- Consumes: everything built above
- Produces (`input.ts`):
  - `interface InputState { moveTarget: Vec2 | null; zoomRequest: ZoomLevel | null; zoomStep: number; timeScale: TimeScale | null }`
  - `function makeInput(): InputState`
  - `function keyToZoom(key: string): ZoomLevel | null`
  - `function keyToTimeScale(key: string): TimeScale | null`
  - `function attachInput(state: InputState, host: HTMLElement, toWorld: (sx: number, sy: number) => Vec2): () => void`
  - `function drainInput(state: InputState): InputState` — snapshot and clear

- [ ] **Step 1: Write the failing test for the pure key mapping**

```ts
import { describe, expect, it } from 'vitest';
import { vec2 } from '../sim/math/vec2.js';
import { drainInput, keyToTimeScale, keyToZoom, makeInput } from './input.js';

describe('keyToZoom', () => {
  it('binds 1 through 4 to the four levels', () => {
    // Direct binding matters: the spec wants Wide reachable without passing
    // through the intermediate levels.
    expect(keyToZoom('1')).toBe(0);
    expect(keyToZoom('2')).toBe(1);
    expect(keyToZoom('3')).toBe(2);
    expect(keyToZoom('4')).toBe(3);
  });

  it('ignores anything else', () => {
    for (const k of ['0', '5', 'a', 'Escape', '']) expect(keyToZoom(k)).toBeNull();
  });
});

describe('keyToTimeScale', () => {
  it('binds space to pause and the bracket keys to speeds', () => {
    expect(keyToTimeScale(' ')).toBe(0);
    expect(keyToTimeScale('z')).toBe(1);
    expect(keyToTimeScale('x')).toBe(2);
    expect(keyToTimeScale('c')).toBe(4);
  });

  it('ignores anything else', () => {
    expect(keyToTimeScale('q')).toBeNull();
  });
});

describe('drainInput', () => {
  it('returns what was pending and clears it', () => {
    // Orders must fire once. A target left in the state would re-issue every
    // frame and the ship would never settle.
    const state = makeInput();
    state.moveTarget = vec2(10, 20);
    state.zoomRequest = 3;
    state.zoomStep = -1;
    state.timeScale = 0;

    const drained = drainInput(state);
    expect(drained.moveTarget).toEqual({ x: 10, y: 20 });
    expect(drained.zoomRequest).toBe(3);
    expect(drained.zoomStep).toBe(-1);
    expect(drained.timeScale).toBe(0);

    expect(state.moveTarget).toBeNull();
    expect(state.zoomRequest).toBeNull();
    expect(state.zoomStep).toBe(0);
    expect(state.timeScale).toBeNull();
  });

  it('is safe to drain when nothing is pending', () => {
    const drained = drainInput(makeInput());
    expect(drained.moveTarget).toBeNull();
    expect(drained.zoomStep).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/app/input.test.ts
```

Expected: FAIL — `Failed to resolve import "./input.js"`.

- [ ] **Step 3: Write `input.ts`**

```ts
/**
 * Input collection.
 *
 * The key mapping and the drain semantics are pure and tested; only
 * `attachInput` touches the DOM. Orders are drained rather than read, because a
 * target left in the state would re-issue every frame and the ship would never
 * settle on it.
 */

import type { TimeScale } from '../sim/loop.js';
import { vec2, type Vec2 } from '../sim/math/vec2.js';
import type { ZoomLevel } from '../render/zoom.js';

export interface InputState {
  moveTarget: Vec2 | null;
  zoomRequest: ZoomLevel | null;
  /** Accumulated wheel steps since the last drain. */
  zoomStep: number;
  timeScale: TimeScale | null;
}

export function makeInput(): InputState {
  return { moveTarget: null, zoomRequest: null, zoomStep: 0, timeScale: null };
}

/** Keys 1-4 jump straight to a level, so Wide needs one press, not three. */
export function keyToZoom(key: string): ZoomLevel | null {
  switch (key) {
    case '1': return 0;
    case '2': return 1;
    case '3': return 2;
    case '4': return 3;
    default: return null;
  }
}

export function keyToTimeScale(key: string): TimeScale | null {
  switch (key) {
    case ' ': return 0;
    case 'z': return 1;
    case 'x': return 2;
    case 'c': return 4;
    default: return null;
  }
}

export function drainInput(state: InputState): InputState {
  const snapshot: InputState = {
    moveTarget: state.moveTarget,
    zoomRequest: state.zoomRequest,
    zoomStep: state.zoomStep,
    timeScale: state.timeScale,
  };
  state.moveTarget = null;
  state.zoomRequest = null;
  state.zoomStep = 0;
  state.timeScale = null;
  return snapshot;
}

/** Wires DOM events into the state. Returns a detach function. */
export function attachInput(
  state: InputState,
  host: HTMLElement,
  toWorld: (screenX: number, screenY: number) => Vec2,
): () => void {
  const onContextMenu = (e: Event): void => e.preventDefault();

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 2) return; // right-click issues move orders
    const rect = host.getBoundingClientRect();
    const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    state.moveTarget = vec2(world.x, world.y);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const zoom = keyToZoom(e.key);
    if (zoom !== null) { state.zoomRequest = zoom; e.preventDefault(); return; }
    const scale = keyToTimeScale(e.key);
    if (scale !== null) { state.timeScale = scale; e.preventDefault(); }
  };

  const onWheel = (e: WheelEvent): void => {
    state.zoomStep += Math.sign(e.deltaY);
    e.preventDefault();
  };

  host.addEventListener('contextmenu', onContextMenu);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('wheel', onWheel, { passive: false });
  globalThis.addEventListener('keydown', onKeyDown);

  return () => {
    host.removeEventListener('contextmenu', onContextMenu);
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('wheel', onWheel);
    globalThis.removeEventListener('keydown', onKeyDown);
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/app/input.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write `main.ts` — wire the whole thing together**

Replace the stub entirely. The structure that matters: **the sim ticks at a fixed rate and the renderer reads it.** Nothing in the render path may write to a body.

```ts
/**
 * Boot and the frame loop.
 *
 * The shape to preserve: the simulation advances in fixed ticks, and rendering
 * reads the result. The renderer never writes to a body. Everything that moves
 * does so because a tick moved it, which is what keeps the sim reproducible
 * from a seed and keeps a replay meaningful.
 */

import { Sprite } from 'pixi.js';
import { buildHull } from '../gen/hull.js';
import { buildModule, MODULE_CATALOGUE } from '../gen/module.js';
import { compositeShip, type Loadout } from '../gen/composite.js';
import { bakeRotations, binForHeading } from '../gen/rotate.js';
import { buildPoiStack } from '../gen/celestial.js';
import { CRUISER_BODY, makeBody } from '../sim/body.js';
import { integrate, TICK_SECONDS } from '../sim/integrate.js';
import { makeMoveOrder, steer, type MoveOrder } from '../sim/order.js';
import { makeLoop } from '../sim/loop.js';
import { makeRng } from '../sim/rng.js';
import { vec2 } from '../sim/math/vec2.js';
import { createDevice, resizeDevice } from '../render/device.js';
import { makeScene } from '../render/scene.js';
import { atlasFromBins, textureFromPixBuf } from '../render/textures.js';
import { makeCamera, followBody, snappedCentre } from '../render/camera.js';
import { makePlacement, placeLayer, sortedLayers } from '../render/parallax.js';
import { advanceZoom, makeZoom, setZoom, stepZoom, unitsPerPixel } from '../render/zoom.js';
import { screenToWorld } from '../render/viewport.js';
import { makePostChain } from '../render/post.js';
import { attachInput, drainInput, makeInput } from './input.js';

const SEED = 'wave2';

export async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (host === null) throw new Error('missing #app host element');

  const device = await createDevice(host);
  const scene = makeScene(device.stage);
  makePostChain(scene.root);

  const rng = makeRng(SEED);

  // The ship: a fitted cruiser, baked into rotation bins and uploaded once.
  const hull = buildHull({ faction: 'player', sizeClass: 'cruiser', rng: rng.split('hull') });
  const pick = (id: string) => MODULE_CATALOGUE.find((m) => m.id === id)!;
  const loadout: Loadout = {
    bow: buildModule(pick('siege-lance'), 'player', rng.split('m1')),
    dorsal: buildModule(pick('rail-battery'), 'player', rng.split('m2')),
    engine: buildModule(pick('thruster-uprate'), 'player', rng.split('m3')),
  };
  const ship = compositeShip(hull, loadout);
  const atlas = atlasFromBins(bakeRotations(ship.buf, 64, ship.plan));

  const shipSprite = new Sprite(atlas.frames[0]);
  shipSprite.anchor.set(0.5);
  scene.play.addChild(shipSprite);

  // The place: one POI's parallax stack.
  const stack = buildPoiStack('graveyard', 480, 270, rng.split('poi'));
  const layers = sortedLayers(stack);
  const layerSprites = layers.map((layer) => {
    const sprite = new Sprite(textureFromPixBuf(layer.buf));
    const target = layer.parallax > 1 ? scene.foreground : scene.background;
    target.addChild(sprite);
    return sprite;
  });
  const placement = makePlacement();

  const body = makeBody(CRUISER_BODY);
  const camera = makeCamera(body.position);
  const zoom = makeZoom(1);
  const loop = makeLoop();
  const input = makeInput();
  let order: MoveOrder | null = null;

  const centre = vec2();
  const screenPoint = vec2();
  const worldPoint = vec2();

  const detach = attachInput(input, host, (sx, sy) => {
    // Screen pixels to virtual-canvas pixels, then to world.
    screenPoint.x = (sx - device.viewport.offsetX) / device.viewport.scale;
    screenPoint.y = (sy - device.viewport.offsetY) / device.viewport.scale;
    snappedCentre(centre, camera, unitsPerPixel(zoom.level));
    return screenToWorld(worldPoint, screenPoint, centre, unitsPerPixel(zoom.level), device.viewport);
  });

  globalThis.addEventListener('resize', () => {
    resizeDevice(device, host.clientWidth, host.clientHeight);
  });

  device.app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;

    const pending = drainInput(input);
    if (pending.moveTarget !== null) order = makeMoveOrder(pending.moveTarget);
    if (pending.zoomRequest !== null) setZoom(zoom, pending.zoomRequest);
    if (pending.zoomStep !== 0) stepZoom(zoom, pending.zoomStep);
    if (pending.timeScale !== null) loop.scale = pending.timeScale;

    // Simulation: fixed ticks only.
    const ticks = loop.ticksFor(dt);
    for (let i = 0; i < ticks; i++) {
      integrate(body, steer(body, order), TICK_SECONDS);
    }

    // Render: reads the sim, writes nothing back to it.
    advanceZoom(zoom, dt);
    followBody(camera, body, dt);

    const upp = unitsPerPixel(zoom.level);
    snappedCentre(centre, camera, upp);

    // Bin 0 is the unrotated source, which is drawn nose-up; a body heading of
    // 0 points along +x. Hence the quarter turn. If the ship renders a quarter
    // turn off, this sign is the first thing to check.
    shipSprite.texture = atlas.frames[binForHeading(body.heading + Math.PI / 2)]!;
    shipSprite.position.set(
      Math.round((body.position.x - centre.x) / upp + device.viewport.virtualWidth / 2),
      Math.round((body.position.y - centre.y) / upp + device.viewport.virtualHeight / 2),
    );

    for (let i = 0; i < layers.length; i++) {
      placeLayer(placement, layers[i]!, centre, upp);
      layerSprites[i]!.position.set(placement.offsetX, placement.offsetY);
    }
  });

  globalThis.addEventListener('beforeunload', detach);
}

void boot();
```

- [ ] **Step 6: Run everything**

```bash
npm test
npm run typecheck
npm run build
```

Expected: all pass. The build must succeed — this is the first task where the app has real content.

- [ ] **Step 7: Verify against the acceptance criteria, by playing it**

Run `npm run dev` and work through these deliberately. Each maps to a spec §11 criterion, and each is pass/fail:

1. **Right-click somewhere ahead.** The ship turns toward it and accelerates. *Visible feedback happens within 100 ms* — the turn begins on the next tick.
2. **Right-click somewhere behind.** The ship turns around before thrusting. It must not crab sideways.
3. **Right-click while moving fast, at a sharp angle.** The ship overshoots and comes back. *That drift is the feature, not a bug.*
4. **Watch it arrive.** It brakes and settles rather than orbiting the waypoint.
5. **Press 1, 2, 3, 4.** Each jumps straight to that zoom level with a brief crossfade. **Nothing shimmers or resamples at any level** — pause and look closely at hull edges.
6. **Press 4 (Wide) and look at the ship.** It should be a handful of pixels against the background, and still read as a ship.
7. **Scroll the wheel.** Zoom steps one level at a time and clamps at both ends.
8. **Press space.** Everything stops. Press `z`, `x`, `c` — 1x, 2x, 4x. The ship moves proportionally faster; **nothing about its path changes**, because the tick is fixed.
9. **Issue an order while paused, then unpause.** The order is honoured.
10. **Resize the window.** The scale stays a whole number and nothing blurs.
11. **Move the camera to the edge of a parallax layer.** Layers move at different speeds and none of them crawls against another.

Record the result of each in the commit message. **If any fails, fix it before committing** — this is the task where the whole wave is judged.

- [ ] **Step 8: Commit**

```bash
git add src/app/input.ts src/app/main.ts src/app/input.test.ts
git commit -m "feat: fly the cruiser through a POI at four zoom levels

The first build where this is a moving picture rather than a contact sheet.
The sim ticks at a fixed rate and the renderer reads it — nothing in the render
path writes to a body, which is what keeps a seeded replay meaningful."
```

---

## Self-Review

Run against the spec after writing the plan.

**Spec coverage.** Every §11 criterion in scope for Wave 2 maps to a task: heading cannot change instantly (Task 2, structurally — no code path assigns a heading); 100 ms feedback (Task 6's crossfade budget, Task 13 step 7); no fighting the camera (Task 7's lead and lag); pixel integrity across all four zoom levels (Tasks 5, 7, 8 — integer display scale, snapped camera centre, whole-pixel layer offsets); fixed timestep decoupled from render (Tasks 4, 13); the post chain in its fixed order with nothing else (Task 12); WebGPU with a *verified* WebGL2 fallback (Task 10, by observation).

**Deliberately deferred, and correctly so:** firing arcs, subsystem targeting, power routing, damage application, the four UI screens, world simulation, faction AI, audio, and the benchmark scene. Those are Plan 3 and beyond. Wave 2 ends when the ship flies.

**One gap accepted knowingly.** The spec's §11 performance criteria — 60 fps, 1% lows above 55, a committed draw-call ceiling — cannot be measured until there is a benchmark scene with 300+ pooled objects, 12 combat ships and a capital. Nothing in Wave 2 produces that population. The benchmark belongs to the task that first creates it, in Plan 3, and is recorded here so it is not lost at the plan boundary. Task 9 does report the real atlas cost per ship, which is the input that decides whether the atlas strategy survives that scene.

**Placeholder scan.** No TBD, no "handle errors appropriately", no "similar to Task N". Every code step carries the code. The two adapter tasks (10, 11) and the post chain (12) end in browser observation rather than a Node assertion, which is stated explicitly rather than papered over — they touch a GPU and there is no honest unit test for that.

**Type consistency.** `Body` is defined once in Task 1 and consumed by Tasks 2, 3, 7, 13. `Control` comes from Task 2 and is produced by Task 3. `TimeScale` from Task 4 is used by Task 13's input. `ZoomLevel` from Task 6 is used by Tasks 12 and 13. `Viewport` from Task 5 is used by Tasks 10 and 13. `LayerPlacement` from Task 8 is used by Task 11. `AtlasLayout` from Task 9 is used by Task 11. `unitsPerPixel` keeps one signature throughout. `snappedCentre` writes into an out-parameter in both its definition and its two call sites.
