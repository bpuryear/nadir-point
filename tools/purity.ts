/**
 * Enforces the module boundary that the specification's architecture rests on:
 * `src/sim/` and `src/gen/` are pure and headless.
 *
 * This exists because the previous build lost exactly this property by
 * accident. Fifteen files under `src/sim/` imported three.js for its Vector3
 * and Quaternion, and by the time anyone noticed, the "portable pure core" was
 * welded to a renderer. Nobody decided that; it accreted. A check that runs on
 * every `npm test` is the difference between a boundary and an intention.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface PurityViolation {
  file: string;
  line: number;
  rule: 'forbidden-package' | 'forbidden-global' | 'sim-escapes-tree';
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

  return violations;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // Directory does not exist yet — not a violation.
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
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = relative('.', file).replace(/\\/g, '/');
      violations.push(...scanSource(rel, readFileSync(file, 'utf8')));
    }
  }
  return violations;
}
