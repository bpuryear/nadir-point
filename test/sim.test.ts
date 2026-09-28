import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../src/sim/constants.ts';
import { cos, sin } from '../src/sim/dmath.ts';
import { hashWorld } from '../src/sim/hash.ts';
import { createRng, nextFloat, nextU32 } from '../src/sim/rng.ts';
import { CHECK_SEEDS, runBattleCheck } from '../src/sim/run.ts';
import { createTestBattle } from '../src/sim/scenario.ts';
import { step } from '../src/sim/step.ts';
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

describe('determinism', () => {
  it('golden file matches the current sim version', () => {
    expect(golden.simVersion).toBe(SIM_VERSION);
  });

  it.each(CHECK_SEEDS)('seed %i reproduces the golden hashes', (seed) => {
    const expected = golden.battles.find((b) => b.seed === seed);
    expect(expected).toBeDefined();
    expect(runBattleCheck(seed)).toEqual(expected);
  });

  it('two runs in one process agree tick by tick', () => {
    const a = createTestBattle(3);
    const b = createTestBattle(3);
    for (let t = 0; t < 600; t++) {
      step(a);
      step(b);
      if (t % 60 === 0) expect(hashWorld(a)).toBe(hashWorld(b));
    }
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

  it('src/sim uses no banned APIs', () => {
    const dir = join(import.meta.dirname, '../src/sim');
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
});
