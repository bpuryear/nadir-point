import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAIDER_LANCET, STANDARD_PATTERNS } from '../src/content/designs.ts';
import { EXERCISE_1 } from '../src/content/exercises.ts';
import type { Design } from '../src/content/types.ts';
import { createBattle } from '../src/sim/battle.ts';
import { SIM_VERSION } from '../src/sim/constants.ts';
import { compileDesign, validateDesign } from '../src/sim/design.ts';
import { cos, sin } from '../src/sim/dmath.ts';
import { hashWorld } from '../src/sim/hash.ts';
import { buildReport } from '../src/sim/report.ts';
import { createRng, nextFloat, nextU32 } from '../src/sim/rng.ts';
import { CHECK_BATTLES, exerciseBattle, mirrorBattle, runBattleCheck, runToEnd } from '../src/sim/run.ts';
import { step } from '../src/sim/step.ts';
import { ACTIVE } from '../src/sim/world.ts';
import golden from './golden.json';

describe('dmath', () => {
  it('matches Math.sin and Math.cos to 1e-12 over [-100, 100]', () => {
    let worst = 0;
    for (let k = -20000; k <= 20000; k++) {
      const x = k * 0.005;
      worst = Math.max(worst, Math.abs(sin(x) - Math.sin(x)), Math.abs(cos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

describe('rng', () => {
  it('gives the same stream for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let k = 0; k < 1000; k++) expect(nextU32(a)).toBe(nextU32(b));
  });

  it('keeps floats in [0, 1) with a mean near 0.5', () => {
    const r = createRng(9);
    let sum = 0;
    for (let k = 0; k < 100000; k++) {
      const f = nextFloat(r);
      expect(f >= 0 && f < 1).toBe(true);
      sum += f;
    }
    expect(Math.abs(sum / 100000 - 0.5)).toBeLessThan(0.01);
  });
});

describe('designs', () => {
  it('standard patterns and the raider are valid', () => {
    for (const d of [...STANDARD_PATTERNS, RAIDER_LANCET]) expect(validateDesign(d), d.name).toEqual([]);
  });

  it('rejects a design that draws more power than it makes', () => {
    const d: Design = { ...STANDARD_PATTERNS[2], modules: { ...STANDARD_PATTERNS[2].modules, C2: 'fire-control' } };
    expect(validateDesign(d).join(' ')).toMatch(/Power draw/);
  });

  it('rejects a module that is too large for its mount', () => {
    const d: Design = { ...STANDARD_PATTERNS[0], modules: { ...STANDARD_PATTERNS[0].modules, D1: 'md-l' } };
    expect(validateDesign(d).join(' ')).toMatch(/too large/);
  });

  it('rejects a design with no bridge', () => {
    const { C2: _bridge, ...rest } = STANDARD_PATTERNS[0].modules;
    expect(validateDesign({ ...STANDARD_PATTERNS[0], modules: rest }).join(' ')).toMatch(/No bridge/);
  });

  it('strike doctrine strafes; line doctrine points the guns', () => {
    expect(compileDesign(RAIDER_LANCET).bearingDeg).toBe(30);
    expect(compileDesign({ ...RAIDER_LANCET, doctrine: { ...RAIDER_LANCET.doctrine, role: 'line' } }).bearingDeg).toBe(0);
  });
});

describe('determinism', () => {
  it('golden file matches the current sim version', () => {
    expect(golden.simVersion).toBe(SIM_VERSION);
  });

  it.each(CHECK_BATTLES.map((b) => [b.name, b]))('%s reproduces the golden hashes', (_name, b) => {
    const expected = golden.battles.find((g) => g.name === b.name);
    expect(expected).toBeDefined();
    expect(runBattleCheck(b.name, b.spec())).toEqual(expected);
  });

  it('two runs in one process agree tick by tick', () => {
    const a = createBattle(mirrorBattle(3));
    const b = createBattle(mirrorBattle(3));
    for (let t = 0; t < 900; t++) {
      step(a);
      step(b);
      if (t % 60 === 0) expect(hashWorld(a)).toBe(hashWorld(b));
    }
  });
});

describe('range keeping', () => {
  // Share of samples in which an active ship's target is inside half its engagement range.
  const closeShare = (spec: ReturnType<typeof mirrorBattle>, side: number | null): number => {
    const w = createBattle(spec);
    let close = 0;
    let samples = 0;
    while (!w.ended) {
      step(w);
      for (let i = 0; i < w.count; i++) {
        const t = w.target[i];
        if (w.status[i] !== ACTIVE || t < 0 || (side !== null && w.side[i] !== side)) continue;
        const dx = w.x[t] - w.x[i];
        const dy = w.y[t] - w.y[i];
        samples++;
        if (Math.sqrt(dx * dx + dy * dy) < 0.5 * w.designs[w.design[i]].engageRange) close++;
      }
    }
    return close / samples;
  };

  it('strike ships break off their runs before they reach the target', () => {
    expect(closeShare(exerciseBattle(EXERCISE_1, EXERCISE_1.issued, 1), 1)).toBeLessThan(0.05);
  });

  it('line ships stop at range instead of closing to point blank', () => {
    expect(closeShare(mirrorBattle(1), null)).toBeLessThan(0.15);
  });
});

describe('report', () => {
  it('names at least one cause for the issued fleet losing Exercise 1', () => {
    const w = runToEnd(createBattle(exerciseBattle(EXERCISE_1, EXERCISE_1.issued, 1)));
    const r = buildReport(w);
    expect(r.winner).toBe(1);
    expect(r.causes.length).toBeGreaterThan(0);
    expect(r.causes.every((c) => c.text.length > 20)).toBe(true);
  });
});

describe('exercise 1 teaches its lesson', () => {
  // The M1 exit test in numbers: the issued fleet loses, and the refit the
  // report points to (more stern plate, per cause 1) wins.
  const stern = (d: Design, extra: number): Design => ({
    ...d,
    id: `${d.id}-stern`,
    armour: [d.armour[0], d.armour[1], d.armour[2], d.armour[3] + extra],
  });
  const winRate = (fleet: typeof EXERCISE_1.issued, seeds: number): number => {
    let wins = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      if (runToEnd(createBattle(exerciseBattle(EXERCISE_1, fleet, seed))).winner === 0) wins++;
    }
    return wins / seeds;
  };

  it('the issued fleet loses most engagements', () => {
    expect(winRate(EXERCISE_1.issued, 20)).toBeLessThanOrEqual(0.3);
  });

  it('the issued fleet with thicker stern plate wins most engagements', () => {
    const refit = EXERCISE_1.issued.map((o) => ({ design: stern(o.design, o.design.hull === 'bastion' ? 20 : o.design.hull === 'warden' ? 15 : 10), count: o.count }));
    expect(winRate(refit, 20)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('sim code rules', () => {
  // Implementation-approximated or nondeterministic APIs. See src/sim/dmath.ts.
  const BANNED = [
    /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|random)\b/,
    /\*\*/,
    /\bDate\b/,
    /\bperformance\b/,
  ];

  it.each(['../src/sim', '../src/content'])('%s uses no banned APIs', (rel) => {
    const dir = join(import.meta.dirname, rel);
    const offences: string[] = [];
    for (const file of readdirSync(dir)) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      lines.forEach((line, n) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
        for (const re of BANNED) if (re.test(code)) offences.push(`${file}:${n + 1}: ${line.trim()}`);
      });
    }
    expect(offences).toEqual([]);
  });

  it('src/sim imports nothing from rendering or the DOM', () => {
    const dir = join(import.meta.dirname, '../src/sim');
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).not.toMatch(/from ['"](three|.*\/render\/|.*\/ui\/)/);
    }
  });
});
