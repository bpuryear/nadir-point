import { describe, expect, it } from 'vitest';
import { makeRng } from '../sim/rng.js';
import { countOpaque, getPx, isOpaque, opaqueBounds } from './pixbuf.js';
import { FACTION_PALETTE, type FactionId } from './palette.js';
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

  it('leans dorsal and ventral to opposite sides of the spine', () => {
    // Centreline modules are allowed to hang off one side — the art direction
    // asks for asymmetry, and a hull half-width of 25px makes straddling
    // impossible inside the 48px size band. What must not happen is all of them
    // leaning the same way, which makes dorsal indistinguishable from a
    // starboard sponson.
    for (const faction of ['player', 'concord'] as FactionId[]) {
      const hull = buildHull({ faction, sizeClass: 'cruiser', rng: makeRng(`lean-${faction}`) });
      const hullPx = new Set<string>();
      for (let y = 0; y < hull.buf.h; y++) {
        for (let x = 0; x < hull.buf.w; x++) {
          if (isOpaque(getPx(hull.buf, x, y))) hullPx.add(`${x},${y}`);
        }
      }

      const leanOf = (hardpoint: 'dorsal' | 'ventral') => {
        let left = 0;
        let right = 0;
        for (const def of MODULE_CATALOGUE.filter((m) => m.hardpoint === hardpoint)) {
          const s = buildModule(def, faction, makeRng(def.id));
          const hp = hull.hardpoints[hardpoint];
          for (let y = 0; y < s.buf.h; y++) {
            for (let x = 0; x < s.buf.w; x++) {
              if (!isOpaque(getPx(s.buf, x, y))) continue;
              const gx = hp.x - s.anchorX + x;
              const gy = hp.y - s.anchorY + y;
              if (hullPx.has(`${gx},${gy}`)) continue;
              if (gx < hull.centreX) left++;
              else if (gx > hull.centreX) right++;
            }
          }
        }
        return left > right ? 'port' : 'starboard';
      };

      expect(leanOf('dorsal'), faction).not.toBe(leanOf('ventral'));
    }
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
