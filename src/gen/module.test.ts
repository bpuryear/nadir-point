import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque } from './pixbuf.js';
import { FACTION_PALETTE, type FactionId } from './palette.js';
import { qcSprite } from './qc.js';
import { HARDPOINT_IDS, buildHull } from './hull.js';
import type { SizeClass } from './grammar/profile.js';
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

  it('changes the hull outline when installed — every module, every faction', () => {
    // The proxy this used to check (reach within the module's own buffer) let
    // three dorsal modules through while they were entirely swallowed by the
    // hull. What matters is pixels landing outside the hull's silhouette: a
    // module that cannot be identified from the outline is not finished, and an
    // invisible upgrade is the one failure the salvage loop cannot survive.
    for (const faction of ['player', 'concord', 'coalition'] as FactionId[]) {
      for (const sizeClass of ['cruiser', 'capital'] as SizeClass[]) {
        const hull = buildHull({ faction, sizeClass, rng: makeRng(`sil-${faction}`) });

        const hullPx = new Set<string>();
        for (let y = 0; y < hull.buf.h; y++) {
          for (let x = 0; x < hull.buf.w; x++) {
            if (isOpaque(getPx(hull.buf, x, y))) hullPx.add(`${x},${y}`);
          }
        }

        for (const def of MODULE_CATALOGUE) {
          const s = buildModule(def, faction, makeRng(def.id));
          const hp = hull.hardpoints[def.hardpoint];
          const ox = hp.x - s.anchorX;
          const oy = hp.y - s.anchorY;

          let outside = 0;
          for (let y = 0; y < s.buf.h; y++) {
            for (let x = 0; x < s.buf.w; x++) {
              if (!isOpaque(getPx(s.buf, x, y))) continue;
              if (!hullPx.has(`${ox + x},${oy + y}`)) outside++;
            }
          }

          expect(outside, `${def.id} on ${faction}/${sizeClass}`).toBeGreaterThanOrEqual(8);
        }
      }
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
