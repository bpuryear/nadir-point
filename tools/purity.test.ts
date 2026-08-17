import { describe, expect, it } from 'vitest';
import { checkPurity, scanSource } from './purity.js';

describe('scanSource rejects renderer imports', () => {
  it('flags a pixi.js import', () => {
    const v = scanSource('src/sim/ship.ts', `import { Sprite } from 'pixi.js';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-package');
    expect(v[0]!.detail).toContain('pixi.js');
    expect(v[0]!.line).toBe(1);
  });

  it('flags a scoped pixi import', () => {
    const v = scanSource('src/gen/hull.ts', `import x from '@pixi/core';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-package');
  });

  it('flags a three import — the mistake the last build made', () => {
    const v = scanSource('src/sim/physics.ts', `import * as THREE from 'three';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.detail).toContain('three');
  });

  it('flags a dynamic import too', () => {
    const v = scanSource('src/sim/a.ts', `const p = await import('pixi.js');`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-package');
  });

  it('flags a re-export', () => {
    const v = scanSource('src/gen/a.ts', `export { Sprite } from 'pixi.js';`);
    expect(v).toHaveLength(1);
  });

  it('allows a package whose name merely contains a forbidden one', () => {
    expect(scanSource('src/sim/a.ts', `import x from 'threefold-utils';`)).toEqual([]);
    expect(scanSource('src/sim/a.ts', `import x from 'not-pixi.js-really';`)).toEqual([]);
  });
});

describe('scanSource rejects DOM access', () => {
  it('flags document', () => {
    const v = scanSource('src/gen/png.ts', `const c = document.createElement('canvas');`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-global');
    expect(v[0]!.detail).toContain('document');
  });

  it('flags window', () => {
    const v = scanSource('src/sim/a.ts', `window.addEventListener('x', () => {});`);
    expect(v[0]!.rule).toBe('forbidden-global');
  });

  it('reports the right line number', () => {
    const v = scanSource('src/sim/a.ts', `const a = 1;\nconst b = 2;\nwindow.x = 3;`);
    expect(v[0]!.line).toBe(3);
  });

  it('does not flag a property named like a global', () => {
    expect(scanSource('src/sim/a.ts', `const x = opts.window;`)).toEqual([]);
    expect(scanSource('src/sim/a.ts', `const y = { document: 1 };`)).toEqual([]);
  });

  it('does not flag a global mentioned inside a comment', () => {
    expect(scanSource('src/sim/a.ts', `// never touch document here`)).toEqual([]);
    expect(scanSource('src/sim/a.ts', `/* window is forbidden */`)).toEqual([]);
  });

  it('flags a DOM global reached through globalThis', () => {
    const v = scanSource('src/sim/a.ts', `const d = globalThis.document;`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('forbidden-global');
    expect(v[0]!.detail).toContain('document');
  });

  it('flags a DOM global reached through self', () => {
    expect(scanSource('src/gen/a.ts', `self.window.alert('x');`).length).toBeGreaterThan(0);
  });

  it('still allows an unrelated namespaced property', () => {
    expect(scanSource('src/sim/a.ts', `const v = globalThis.structuredClone;`)).toEqual([]);
  });
});

describe('scanSource confines sim to its own tree', () => {
  it('flags sim importing from gen', () => {
    const v = scanSource('src/sim/ship.ts', `import { hull } from '../gen/hull.js';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('sim-escapes-tree');
  });

  it('flags sim importing from render', () => {
    const v = scanSource('src/sim/a.ts', `import { x } from '../render/atlas.js';`);
    expect(v[0]!.rule).toBe('sim-escapes-tree');
  });

  it('allows sim importing within sim', () => {
    expect(scanSource('src/sim/ship.ts', `import { vec2 } from './math/vec2.js';`)).toEqual([]);
    expect(scanSource('src/sim/ai/fleet.ts', `import { r } from '../rng.js';`)).toEqual([]);
  });

  it('allows gen importing node stdlib', () => {
    expect(scanSource('src/gen/png.ts', `import { deflateSync } from 'node:zlib';`)).toEqual([]);
  });

  it('allows gen importing from sim math', () => {
    expect(scanSource('src/gen/hull.ts', `import { vec2 } from '../sim/math/vec2.js';`)).toEqual([]);
  });
});

describe('the real tree is pure', () => {
  it('has no violations in src/sim or src/gen', () => {
    const violations = checkPurity();
    const report = violations
      .map((v) => `${v.file}:${v.line} [${v.rule}] ${v.detail}`)
      .join('\n');
    expect(report).toBe('');
  });
});
