import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, type FactionId } from './palette.js';
import { qcSprite } from './qc.js';
import { HARDPOINT_IDS } from './hull.js';
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
