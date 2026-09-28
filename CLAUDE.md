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
- Nothing in `src/sim` may import from `three`, the DOM, or `src/render`.

## Layout

- `src/sim`: deterministic simulation, no rendering
- `src/worker`: runs the sim at a fixed 30 Hz tick and posts snapshots
- `src/render`: three.js (WebGPU with WebGL2 fallback), tilt-shift post chain, camera and controls
- `determinism.html`: runs the check battles in any browser and compares with the golden hashes
