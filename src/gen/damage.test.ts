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

  it('punches interior holes at critical without shrinking the bounding box', () => {
    const src = source();
    const critical = frame('critical');
    expect(countOpaque(critical)).toBeLessThan(countOpaque(src));
    expect(opaqueBounds(critical)).toEqual(opaqueBounds(src));
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
