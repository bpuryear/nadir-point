import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { getPx, opaqueBounds } from './pixbuf.js';
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

  it('keeps all six hardpoints distinct and separated, every faction and size', () => {
    // Fighters are exempt: six points cannot be 4px apart on an 8-12px hull.
    const sizes: SizeClass[] = ['corvette', 'destroyer', 'cruiser', 'capital'];
    for (const faction of ALL_FACTIONS) {
      for (const sizeClass of sizes) {
        for (let i = 0; i < 40; i++) {
          const h = hull(faction, sizeClass, `sep-${i}`);
          const seen = new Set(HARDPOINT_IDS.map((id) => `${h.hardpoints[id].x},${h.hardpoints[id].y}`));
          expect(seen.size, `${faction}/${sizeClass}/${i}`).toBe(6);
          for (let a = 0; a < HARDPOINT_IDS.length; a++) {
            for (let b = a + 1; b < HARDPOINT_IDS.length; b++) {
              const p = h.hardpoints[HARDPOINT_IDS[a]!];
              const q = h.hardpoints[HARDPOINT_IDS[b]!];
              expect(Math.hypot(p.x - q.x, p.y - q.y), `${faction}/${sizeClass}/${i}`)
                .toBeGreaterThanOrEqual(4);
            }
          }
        }
      }
    }
  });

  it('orders them bow to stern along the hull, every faction and size', () => {
    // Fighters are exempt for the same reason: too short to guarantee distinct
    // rows for every hardpoint once collisions are resolved.
    const sizes: SizeClass[] = ['corvette', 'destroyer', 'cruiser', 'capital'];
    for (const faction of ALL_FACTIONS) {
      for (const sizeClass of sizes) {
        for (let i = 0; i < 40; i++) {
          const h = hull(faction, sizeClass, `order-${i}`);
          expect(h.hardpoints.bow.y, `${faction}/${sizeClass}/${i}`).toBeLessThan(h.hardpoints.dorsal.y);
          expect(h.hardpoints.dorsal.y, `${faction}/${sizeClass}/${i}`).toBeLessThan(h.hardpoints.ventral.y);
          expect(h.hardpoints.ventral.y, `${faction}/${sizeClass}/${i}`).toBeLessThan(h.hardpoints.engine.y);
        }
      }
    }
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

  it('lands every hardpoint on filled hull, every faction and size', () => {
    const sizes: SizeClass[] = ['fighter', 'corvette', 'destroyer', 'cruiser', 'capital'];
    for (const faction of ALL_FACTIONS) {
      for (const sizeClass of sizes) {
        for (let i = 0; i < 40; i++) {
          const h = hull(faction, sizeClass, `fill-${i}`);
          for (const id of HARDPOINT_IDS) {
            const hp = h.hardpoints[id];
            expect(isFilled(h.profile, hp.x - h.centreX, hp.y), `${faction}/${sizeClass}/${i}/${id}`)
              .toBe(true);
          }
        }
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
