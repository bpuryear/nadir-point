/**
 * Enforces the module boundary that the specification's architecture rests on:
 * `src/sim/` and `src/gen/` are pure and headless.
 *
 * This exists because the previous build lost exactly this property by
 * accident. Fifteen files under `src/sim/` imported three.js for its Vector3
 * and Quaternion, and by the time anyone noticed, the "portable pure core" was
 * welded to a renderer. Nobody decided that; it accreted. A check that runs on
 * every `npm test` is the difference between a boundary and an intention.
 *
 * The check has two layers. `scanSource` is a per-file lexical scan: it sees
 * a file's own `import`/`export`/`require` specifiers and flags a direct
 * `import 'pixi.js'` or a relative specifier that climbs out of the tree it
 * is confined to. That layer is fast but not transitive — it cannot see that
 * `src/gen/hull.ts` imports `../render/atlas.ts`, which itself imports
 * `pixi.js`, unless `atlas.ts` happens to also live under `src/gen` or
 * `src/sim` (where it would be scanned directly). `checkPurity` adds the
 * second layer: it follows first-party relative imports out of the pure
 * roots, wherever they lead in `src/**`, and reports a violation naming the
 * whole chain when that walk reaches a forbidden package. A violation the
 * developer cannot trace by reading the message is one they will not fix.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export interface PurityViolation {
  file: string;
  line: number;
  rule:
    | 'forbidden-package'
    | 'forbidden-global'
    | 'sim-escapes-tree'
    | 'gen-escapes-tree'
    | 'transitive-forbidden-package';
  detail: string;
}

export const FORBIDDEN_PACKAGES: readonly string[] = ['pixi.js', '@pixi', 'three'];

export const FORBIDDEN_GLOBALS: readonly string[] = [
  'document',
  'window',
  'navigator',
  'localStorage',
  'HTMLCanvasElement',
  'requestAnimationFrame',
];

/** Matches static imports, re-exports, and dynamic imports in one pass. */
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

/** Matches namespaced access to globals like globalThis.document and self.window. */
const NAMESPACED_RE = /\b(?:globalThis|self)\s*\.\s*(\w+)/g;

/** Strips line and block comments so a mention of `document` in prose is not a violation. */
function stripComments(source: string): string {
  // Replace comment bodies with spaces to preserve line numbering exactly.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function isForbiddenPackage(specifier: string): string | null {
  for (const pkg of FORBIDDEN_PACKAGES) {
    // Exact match or a subpath of it — 'pixi.js/foo' counts, 'pixi.js-shim' does not.
    if (specifier === pkg || specifier.startsWith(`${pkg}/`)) return pkg;
  }
  return null;
}

export function scanSource(file: string, source: string): PurityViolation[] {
  const violations: PurityViolation[] = [];
  const code = stripComments(source);
  const lines = code.split('\n');
  const normalized = file.replace(/\\/g, '/');
  const inSim = normalized.includes('src/sim/');
  const inGen = normalized.includes('src/gen/');

  const lineOf = (index: number): number =>
    code.slice(0, index).split('\n').length;

  SPECIFIER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPECIFIER_RE.exec(code)) !== null) {
    const specifier = match[1]!;
    const line = lineOf(match.index);

    const forbidden = isForbiddenPackage(specifier);
    if (forbidden !== null) {
      violations.push({
        file,
        line,
        rule: 'forbidden-package',
        detail: `imports '${specifier}' (forbidden package '${forbidden}')`,
      });
      continue;
    }

    // sim/ may only reach inside sim/. Relative specifiers that climb out are
    // the failure mode; bare node: and package specifiers are handled above.
    if (inSim && specifier.startsWith('.')) {
      const fromDir = normalized.slice(0, normalized.lastIndexOf('/'));
      const target = resolve('/', fromDir, specifier).replace(/\\/g, '/');
      if (!target.includes('/src/sim/')) {
        violations.push({
          file,
          line,
          rule: 'sim-escapes-tree',
          detail: `imports '${specifier}', which resolves outside src/sim/`,
        });
      }
    }

    // gen/ may reach inside gen/, plus the sim math helpers and the seeded
    // RNG it legitimately depends on — nothing else. Anything that resolves
    // outside that allowance (most importantly src/render/) is the failure
    // mode this rule exists to catch.
    if (inGen && specifier.startsWith('.')) {
      const fromDir = normalized.slice(0, normalized.lastIndexOf('/'));
      const target = resolve('/', fromDir, specifier).replace(/\\/g, '/');
      const inGenTree = target.includes('/src/gen/');
      const inSimMath = target.includes('/src/sim/math/');
      const isSimRng = /\/src\/sim\/rng(\.[jt]s)?$/.test(target);
      if (!inGenTree && !inSimMath && !isSimRng) {
        violations.push({
          file,
          line,
          rule: 'gen-escapes-tree',
          detail:
            `imports '${specifier}', which resolves outside src/gen/ ` +
            `(only src/gen/**, src/sim/math/**, and src/sim/rng.ts are allowed)`,
        });
      }
    }
  }

  for (const global of FORBIDDEN_GLOBALS) {
    // Word-boundary match, and not preceded by a dot or an object-literal key
    // colon, so `opts.window` and `{ document: 1 }` are not violations.
    const re = new RegExp(`(?<![.\\w])${global}\\b(?!\\s*:)`, 'g');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        violations.push({
          file,
          line: i + 1,
          rule: 'forbidden-global',
          detail: `references DOM global '${global}'`,
        });
      }
      re.lastIndex = 0;
    }
  }

  // Namespaced access — `globalThis.document`, `self.window`. The bare-word
  // check above cannot see these: its lookbehind deliberately ignores anything
  // preceded by a dot, so that `opts.window` stays legal.
  for (let i = 0; i < lines.length; i++) {
    NAMESPACED_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NAMESPACED_RE.exec(lines[i]!)) !== null) {
      const name = m[1]!;
      if (FORBIDDEN_GLOBALS.includes(name)) {
        violations.push({
          file,
          line: i + 1,
          rule: 'forbidden-global',
          detail: `references DOM global '${name}' via a namespace`,
        });
      }
    }
  }

  return violations;
}

/**
 * Extracts a file's raw first-party specifiers, with the line each occurs
 * on, caching per `checkPurity` call so the same shared module (e.g.
 * `src/sim/rng.ts`, reached from many roots during the transitive walk
 * below) is read and scanned once rather than once per edge into it. The
 * cache is call-scoped, not module-level, so it can never serve stale
 * content for a path that a test rewrites between calls.
 */
function getSpecifiers(
  file: string,
  cache: Map<string, { specifier: string; line: number }[]>,
): { specifier: string; line: number }[] {
  const cached = cache.get(file);
  if (cached) return cached;

  const code = stripComments(readFileSync(file, 'utf8'));
  const lineOf = (index: number): number => code.slice(0, index).split('\n').length;

  const specs: { specifier: string; line: number }[] = [];
  SPECIFIER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPECIFIER_RE.exec(code)) !== null) {
    specs.push({ specifier: match[1]!, line: lineOf(match.index) });
  }
  cache.set(file, specs);
  return specs;
}

/**
 * Resolves a relative specifier to an on-disk first-party file, trying the
 * project's `.js`-in-source/`.ts`-on-disk convention before giving up.
 * Returns null when the specifier does not resolve to a file this tool can
 * read — that end of the edge is out of scope for the transitive walk, not
 * a violation in itself (a bare package specifier is handled separately, by
 * `isForbiddenPackage`, at the point the edge is followed).
 */
function resolveFirstPartyFile(fromFile: string, specifier: string): string | null {
  const target = resolve(dirname(fromFile), specifier);
  const candidates = [target, target.replace(/\.js$/, '.ts'), `${target}.ts`, join(target, 'index.ts')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative('.', candidate).replace(/\\/g, '/');
    }
  }
  return null;
}

/**
 * Walks first-party relative imports out of `file`, wherever they lead in
 * `src/**`, and returns the chain of files (plus the forbidden package name
 * as the last element) the first time the walk reaches one — or null if it
 * never does. `visiting` guards against import cycles; a cycle cannot
 * introduce a forbidden package that wasn't already reachable without it, so
 * it is simply not re-entered.
 */
function findForbiddenChain(
  file: string,
  visiting: Set<string>,
  memo: Map<string, string[] | null>,
  specCache: Map<string, { specifier: string; line: number }[]>,
): string[] | null {
  const cached = memo.get(file);
  if (cached !== undefined) return cached;
  if (visiting.has(file)) return null;

  visiting.add(file);
  let result: string[] | null = null;
  for (const { specifier } of getSpecifiers(file, specCache)) {
    const forbidden = isForbiddenPackage(specifier);
    if (forbidden !== null) {
      result = [file, forbidden];
      break;
    }
    if (!specifier.startsWith('.')) continue;
    const resolved = resolveFirstPartyFile(file, specifier);
    if (resolved === null) continue;
    const sub = findForbiddenChain(resolved, visiting, memo, specCache);
    if (sub !== null) {
      result = [file, ...sub];
      break;
    }
  }
  visiting.delete(file);
  memo.set(file, result);
  return result;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    // A directory that does not exist yet is normal and not a violation.
    // Anything else — permissions, I/O — must surface: this tool's value is
    // that silence means clean, so a directory it could not read has to be
    // loud rather than absent.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

export function checkPurity(roots: string[] = ['src/sim', 'src/gen']): PurityViolation[] {
  const violations: PurityViolation[] = [];
  const files: string[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      files.push(relative('.', file).replace(/\\/g, '/'));
    }
  }

  for (const rel of files) {
    violations.push(...scanSource(rel, readFileSync(rel, 'utf8')));
  }

  // Transitive layer: follow first-party relative imports out of each pure
  // root file, wherever they lead in src/**, and report the chain when the
  // walk reaches a forbidden package. Chains of length 2 (file, package) are
  // a direct import already caught by scanSource above as forbidden-package;
  // only longer, genuinely indirect chains are reported here, so a direct
  // violation is never reported twice under two different rule names.
  const memo = new Map<string, string[] | null>();
  const specCache = new Map<string, { specifier: string; line: number }[]>();
  for (const rel of files) {
    const chain = findForbiddenChain(rel, new Set(), memo, specCache);
    if (chain === null || chain.length <= 2) continue;

    // Find the line of the specific edge that starts this chain, not just
    // the first specifier in the file, so the reported line actually points
    // at the import that leads somewhere forbidden.
    const [origin] = chain;
    const startSpecifier = getSpecifiers(origin!, specCache).find(
      (s) => s.specifier.startsWith('.') && resolveFirstPartyFile(origin!, s.specifier) === chain[1],
    );

    violations.push({
      file: origin!,
      line: startSpecifier?.line ?? 1,
      rule: 'transitive-forbidden-package',
      detail: `reaches forbidden package '${chain[chain.length - 1]}' via ${chain.join(' -> ')}`,
    });
  }

  return violations;
}
