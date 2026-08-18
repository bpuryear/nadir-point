import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

describe('scanSource confines gen to its own tree', () => {
  it('flags gen importing from render — the reviewer-demonstrated hole', () => {
    const v = scanSource('src/gen/x.ts', `import { y } from '../render/y.js';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('gen-escapes-tree');
    expect(v[0]!.detail).toContain('../render/y.js');
  });

  it('flags gen importing from sim outside the math/rng allowance', () => {
    const v = scanSource('src/gen/x.ts', `import { Ship } from '../sim/ship.js';`);
    expect(v).toHaveLength(1);
    expect(v[0]!.rule).toBe('gen-escapes-tree');
  });

  it('allows gen importing the seeded rng', () => {
    expect(scanSource('src/gen/x.ts', `import { r } from '../sim/rng.js';`)).toEqual([]);
  });

  it('allows gen importing sim math', () => {
    expect(scanSource('src/gen/x.ts', `import { vec2 } from '../sim/math/vec2.js';`)).toEqual([]);
  });

  it('allows gen importing within its own tree, including nested dirs', () => {
    expect(scanSource('src/gen/hull.ts', `import { p } from './grammar/profile.js';`)).toEqual([]);
    expect(scanSource('src/gen/grammar/profile.ts', `import { c } from '../palette.js';`)).toEqual([]);
  });
});

describe('checkPurity follows the import graph transitively', () => {
  const tempFiles: string[] = [];

  const write = (path: string, contents: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
    tempFiles.push(path);
  };

  afterEach(() => {
    for (const f of tempFiles.splice(0)) {
      rmSync(f, { force: true });
    }
    // Clean up any directories the test created that are now empty (best
    // effort — leaves the tree exactly as it was found).
    for (const dir of ['src/gen/__purity_probe__', 'src/render']) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('reports a violation the file-local scan cannot see, naming the chain', () => {
    // The reviewer's exact probe: src/render/atlas.ts imports pixi.js, and a
    // pure src/gen file imports atlas.ts. scanSource on the gen file alone
    // cannot see the pixi.js import; checkPurity's graph walk must.
    write('src/render/atlas.ts', `import { Sprite } from 'pixi.js';\nexport const s = new Sprite();\n`);
    write(
      'src/gen/__purity_probe__/entry.ts',
      `import { s } from '../../render/atlas.js';\nexport const probe = s;\n`,
    );

    const violations = checkPurity();
    const transitive = violations.find((v) => v.rule === 'transitive-forbidden-package');
    expect(transitive).toBeDefined();
    expect(transitive!.file).toBe('src/gen/__purity_probe__/entry.ts');
    expect(transitive!.detail).toContain('pixi.js');
    expect(transitive!.detail).toContain(
      'src/gen/__purity_probe__/entry.ts -> src/render/atlas.ts -> pixi.js',
    );

    // The direct escape is also caught, independently, by gen-escapes-tree —
    // both layers should fire on this probe.
    const escape = violations.find(
      (v) => v.rule === 'gen-escapes-tree' && v.file === 'src/gen/__purity_probe__/entry.ts',
    );
    expect(escape).toBeDefined();
  });

  it('does not double-report a direct import as a transitive chain', () => {
    write('src/gen/__purity_probe__/direct.ts', `import { Sprite } from 'pixi.js';\nexport const s = Sprite;\n`);
    const violations = checkPurity();
    const transitive = violations.filter(
      (v) => v.rule === 'transitive-forbidden-package' && v.file === 'src/gen/__purity_probe__/direct.ts',
    );
    expect(transitive).toHaveLength(0);
    const direct = violations.filter(
      (v) => v.rule === 'forbidden-package' && v.file === 'src/gen/__purity_probe__/direct.ts',
    );
    expect(direct).toHaveLength(1);
  });

  it('is silent when the chain never reaches a forbidden package', () => {
    write('src/gen/__purity_probe__/inner.ts', `export const x = 1;\n`);
    write(
      'src/gen/__purity_probe__/outer.ts',
      `import { x } from './inner.js';\nexport const y = x;\n`,
    );
    const violations = checkPurity();
    expect(violations.filter((v) => v.file.includes('__purity_probe__'))).toEqual([]);
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
