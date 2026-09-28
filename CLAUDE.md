# Nadir Point

Browser space autobattler. Design and build plan: `docs/PLAN.md`. Research: `docs/research/`.

## Commands

- `npm run dev`: Vite dev server
- `npm run typecheck`, `npm test` (Vitest), `npm run build`
- `npm run test:e2e`: Playwright determinism and boot tests. In the cloud container use `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --project=chromium`
- `npm run battle`: run the check battles in Node; `npm run battle -- --write` updates `test/golden.json`

## Sim rules (src/sim)

The sim must give bit-identical results in every browser engine and in Node. Replays and challenges depend on it.

- Use only `+ - * /`, `Math.sqrt`, and exact helpers (`floor`, `ceil`, `round`, `trunc`, `abs`, `min`, `max`, `sign`, `imul`, `fround`).
- No `Math.sin/cos/tan/atan2/pow/exp/log/hypot/random`, no `**`, no `Date` or `performance`. Use `src/sim/dmath.ts` and `src/sim/rng.ts`. A test scans for these.
- Headings are unit vectors, not angles.
- A tick is two-phase: every unit decides from start-of-tick state, then all units move, then damage lands. Do not let unit index order favour a side.
- Any change that alters results must bump `SIM_VERSION` in `src/sim/constants.ts` and regenerate `test/golden.json`.
- Content is part of the sim. Changing module or hull numbers, or even the **order** of mounts in a hull, changes results. Mount positions (x, y) are visual only.
- `test/sim.test.ts` holds balance guards for the exercises (the issued fleet loses Exercise 1; the stern-armour refit wins). A balance change that breaks them breaks the lesson.
- Nothing in `src/sim` may import from `three`, the DOM, or `src/render`.

## Layout

- `src/sim`: deterministic simulation, no rendering
- `src/worker`: runs the sim at a fixed 30 Hz tick and posts snapshots
- `src/content`: hulls, modules, designs, exercises (plain data)
- `src/render`: three.js (WebGPU with WebGL2 fallback), code-built ship meshes, tilt-shift post chain, camera and controls
- `src/ui`: Svelte 5 screens (directive, design bureau, fleet, engagement HUD, report); `src/game.svelte.ts` ties them to the stage and the worker
- `docs/design/m1-rules.md`: the rules and numbers the sim implements
- `determinism.html`: runs the check battles in any browser and compares with the golden hashes
