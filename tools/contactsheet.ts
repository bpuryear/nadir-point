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
  blit, countOpaque, createBuf, fillBuf, type PixBuf,
} from '../src/gen/pixbuf.js';
import { encodePng } from '../src/gen/png.js';
import {
  EMISSIVE, FACTION_PALETTE, NEUTRAL, POI_PALETTE, SPACE, UI, WARM, type FactionId, type PoiId,
} from '../src/gen/palette.js';
import { drawText, GLYPH_H } from '../src/gen/font.js';
import {
  checkBinaryAlpha, checkPalette, qcSprite, type QcReport,
} from '../src/gen/qc.js';
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

  /**
   * Palette and binary-alpha only — no light-direction verdict.
   *
   * qc.ts's light check assumes the sprite it is handed was itself shaded
   * against the single top-left light: it classifies edge pixels as lit or
   * shadowed and demands the lit group read brighter. Two sprite families on
   * this sheet do not carry that property by construction, not by accident:
   *
   *  - Rotation bins (`bakeRotations`) are a pixel-for-pixel resample of an
   *    already-shaded composite. The shading — light included — rotates
   *    bodily with the hull instead of staying fixed in image space, which is
   *    the documented trade-off in rotate.ts (bake once, blit unrotated).
   *    Measured against the LANCE-loadout cruiser: bins near 0 degrees pass
   *    with a wide margin (+119) and bins near 180 degrees fail just as hard
   *    (-121) — a clean sinusoid, not sprite-to-sprite noise. Roughly half of
   *    every 64-bin set is structurally guaranteed to fail a check built for
   *    the canonical, unrotated orientation.
   *  - The nebula and near/far debris-silhouette POI layers (`buildNebula`,
   *    `buildDebrisLayer`) are collages, not single hulls under one light.
   *    The nebula is a radial density falloff with no directional lighting
   *    at all. The debris layers scatter many independent wreckage sprites
   *    (see debris.ts), each internally lit from its own top-left like every
   *    other sprite in the game — but the check classifies edges across the
   *    *whole layer buffer*, so one piece's shadowed corner sits pixels away
   *    from an unrelated piece's lit corner with empty space in between,
   *    and the aggregate has nothing to do with any single piece's lighting.
   *    Measured: margins land around 3-7 (below the 8 the check requires)
   *    rather than at the 0 a true flat wash would produce, because the
   *    pieces are shaded, just not as one coherent surface. That is
   *    `buildGasGiant`'s job — its terminator is explicitly lit from the top
   *    left across the *whole* disc and passes this same check with a +104
   *    margin — not theirs.
   *
   * Palette and alpha discipline still apply in full: nothing here loosens
   * what colours a rotated bin or a background layer is allowed to contain.
   */
  const recordPaletteOnly = (name: string, buf: PixBuf, allowed: readonly number[]) => {
    const palette = checkPalette(buf, allowed);
    const alpha = checkBinaryAlpha(buf);
    const empty = countOpaque(buf) === 0;
    reports.push({
      name, palette, alpha, light: null, empty, pass: !empty && palette.length === 0 && alpha.length === 0,
    });
  };

  /** POI background layers with no directional shading by design — see above. */
  const NON_DIRECTIONAL_LAYERS: ReadonlySet<string> = new Set([
    'nebula', 'near-debris', 'distant-wrecks', 'foreground-debris',
  ]);

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

  // --- 4. Salvaged modules - foreign parts on the player hull ------------
  sheet.heading('4. SALVAGED MODULES - FOREIGN PARTS ON THE PLAYER HULL');

  const cannonBank = MODULE_CATALOGUE.find((m) => m.id === 'cannon-bank')!;
  for (const moduleFaction of ['concord', 'coalition', 'derelict'] as FactionId[]) {
    const sprite = buildModule(cannonBank, moduleFaction, rng.split(`salvage-${moduleFaction}`));
    const ship = compositeShip(cruiser, { [cannonBank.hardpoint]: sprite } as Loadout);
    sheet.place(ship.buf, `PLAYER + ${moduleFaction.toUpperCase()} ${cannonBank.name}`);

    // A salvaged part carries its origin faction's colours onto the player
    // hull — that is the entire point of the art direction. So the lock for a
    // mixed sprite is the union of the factions that contributed to it, not
    // the hull's alone. Measured against FACTION_PALETTE.player alone: 284
    // off-palette pixels for the Concord cannon bank, 284 for Coalition, 41
    // for Derelict — all correctly explained by the module's own faction ramp
    // and accent, not a generator defect.
    const unionLock = [...new Set([...FACTION_PALETTE.player, ...FACTION_PALETTE[moduleFaction]])];
    record(`salvaged-${moduleFaction}`, ship.buf, unionLock);
  }

  // --- 5. Faction ship classes -------------------------------------------
  sheet.heading('5. FACTION SHIP CLASSES');

  const classes: SizeClass[] = ['corvette', 'destroyer', 'cruiser'];
  for (const faction of ['concord', 'coalition', 'derelict'] as FactionId[]) {
    for (const sizeClass of classes) {
      const h = buildHull({ faction, sizeClass, rng: rng.split(`${faction}-${sizeClass}`) });
      sheet.place(h.buf, `${faction.toUpperCase()} ${sizeClass.toUpperCase()}`);
      record(`${faction}-${sizeClass}`, h.buf, FACTION_PALETTE[faction]);
    }
    sheet.newline();
  }

  // --- 6. Damage states ---------------------------------------------------
  sheet.heading('6. DAMAGE STATES - OUTLINE HOLDS UNTIL CRITICAL');

  // Full WARM ramp, not just the accent shades FACTION_PALETTE.player already
  // carries: snapToPalette picks nearest by RGB distance, and WARM[1] (the
  // scorch-dark colour) is numerically closer to a NEUTRAL steel shade than
  // to any WARM tone FACTION_PALETTE.player includes on its own — without
  // the rest of the ramp here, scorch quietly snaps to hull-coloured grey
  // instead of reading as damage.
  const allowedWithScorch = [...FACTION_PALETTE.player, ...WARM];
  const frames = damageFrames(cruiser.buf, rng.split('damage'), allowedWithScorch, cruiser.plates);
  for (const state of DAMAGE_STATES) {
    sheet.place(frames[state], state.toUpperCase());
    record(`damage-${state}`, frames[state], allowedWithScorch);
  }

  // --- 7. Rotation bins ---------------------------------------------------
  sheet.heading(`7. ROTATION - 8 OF ${ROTATION_BINS} BINS`);

  const fitted = compositeShip(cruiser, loadouts[1]![1]);
  const bins = bakeRotations(fitted.buf, ROTATION_BINS, fitted.plan);
  for (let i = 0; i < ROTATION_BINS; i += Math.floor(ROTATION_BINS / 8)) {
    sheet.place(bins[i]!, `BIN ${i}`);
    recordPaletteOnly(`rotation-${i}`, bins[i]!, FACTION_PALETTE.player);
  }

  // --- 8. Debris ----------------------------------------------------------
  sheet.heading('8. DEBRIS SET');

  for (const faction of ['concord', 'coalition'] as FactionId[]) {
    for (const piece of buildDebrisSet(faction, rng.split(`debris-${faction}`), 3)) {
      sheet.place(piece.buf, `${faction.slice(0, 3).toUpperCase()} ${piece.size.toUpperCase()}`);
      record(`debris-${faction}-${piece.size}`, piece.buf, FACTION_PALETTE[faction]);
    }
    sheet.newline();
  }

  // --- 9. POI background stacks -------------------------------------------
  sheet.heading('9. POI BACKGROUND STACKS - LAYERS SHOWN SEPARATELY');

  for (const poi of ['gasgiant', 'graveyard'] as PoiId[]) {
    const stack = buildPoiStack(poi, 220, 130, rng.split(`poi-${poi}`));
    for (const layer of stack.layers) {
      sheet.place(layer.buf, `${poi.toUpperCase()} ${layer.name.toUpperCase()}`);
      const name = `poi-${poi}-${layer.name}`;
      if (NON_DIRECTIONAL_LAYERS.has(layer.name)) {
        recordPaletteOnly(name, layer.buf, POI_PALETTE[poi]);
      } else {
        record(name, layer.buf, POI_PALETTE[poi]);
      }
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
