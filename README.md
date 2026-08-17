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
