/**
 * Per-commit frame-time bisect.
 *
 *   node tools/perfbisect.mjs --from c9bfd00 --to 37252e9
 *   node tools/perfbisect.mjs --from c9bfd00 --to 37252e9 --repeats 2 --frames 300
 *
 * WHY A WORKTREE AND NOT `git checkout`
 * The main tree is a shared workspace: other streams are writing to it, and a bisect
 * that checked out 36 commits under them would destroy their work and measure a tree
 * that is half theirs. Every candidate is measured in a DETACHED worktree under the
 * scratchpad, with `node_modules` symlinked back to the main tree so no install is
 * paid per commit.
 *
 * WHY THE WORKTREE IS SPARSE
 * `docs/` is 240 MB of review captures. A full worktree per commit is 8.6 GB for a
 * 3.5 MB `src/`. The sparse spec is `/*` minus `/docs/`, which is everything the
 * bundle needs (`src`, `index.html`, `probe.html`, `vite.config.js`, `package.json`)
 * and nothing the bundle does not.
 *
 * WHY ONE WORKTREE REUSED RATHER THAN ONE PER COMMIT
 * Identical measurement, 36x less disk and no repeated `worktree add` cost. The
 * worktree is detached, so moving it between commits cannot touch any branch.
 *
 * WHY THE MEASUREMENT IS SINGLE-VARIABLE
 * `tools/bench.mjs`, `tools/harness.mjs` and `probe.html` have not been touched since
 * c9bfd00 ("Measure on real hardware..."), which is the commit that introduced
 * hardware rasterisation in the first place:
 *
 *   $ git log --oneline c9bfd00~1..HEAD -- tools/bench.mjs tools/harness.mjs probe.html
 *   c9bfd00 Measure on real hardware, and fix the quality flag that made it impossible
 *
 * So every commit in the range is measured by the SAME harness that is checked out
 * with it, and the only thing that differs between rows is `src/`.
 *
 * NEVER READ A FRAME RATE OFF SWIFTSHADER. This tool forces NP_RASTER=hardware and
 * refuses to run when `fpsIsMeaningful()` is false, because a software-rasterised
 * bisect would rank commits by how expensive they are for a CPU rasteriser, which is
 * not the question.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fpsIsMeaningful, rasterMode } from './harness.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const from = arg('from', 'c9bfd00');
const to = arg('to', 'HEAD');
const repeats = Number(arg('repeats', 1));
const frames = Number(arg('frames', 420));
const quality = arg('quality', 'high');
const scratch = arg('scratch', path.join(process.env.TMPDIR || '/tmp', 'nadir-perfbisect'));
const outJson = arg('out', null);

if (!has('allow-software') && !fpsIsMeaningful()) {
  console.error(`[perfbisect] raster mode is "${rasterMode()}". Frame time under a software`);
  console.error('[perfbisect] rasteriser is not a frame rate and a bisect over it ranks nothing.');
  console.error('[perfbisect] Run with NP_RASTER=hardware on a machine with a GPU.');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const wt = path.join(scratch, 'wt');
const results = path.join(scratch, 'runs');
fs.mkdirSync(results, { recursive: true });

/** Detached, sparse worktree. Created once, moved between commits. */
function ensureWorktree(sha) {
  if (!fs.existsSync(path.join(wt, '.git'))) {
    fs.rmSync(wt, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    git('worktree', 'add', '--detach', '--no-checkout', wt, sha);
    execFileSync('git', ['sparse-checkout', 'init', '--no-cone'], { cwd: wt });
    execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '/*', '!/docs/'], { cwd: wt });
  }
  execFileSync('git', ['checkout', '--detach', '--force', sha], { cwd: wt, stdio: 'ignore' });
  execFileSync('git', ['clean', '-fdq', '-e', 'node_modules', '-e', 'dist'], { cwd: wt });
  const nm = path.join(wt, 'node_modules');
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(ROOT, 'node_modules'), nm, 'dir');
}

function benchAt(sha, run) {
  const out = path.join(results, `${sha}-${run}.json`);
  try {
    execFileSync(process.execPath, [
      'tools/bench.mjs', '--json', out, '--frames', String(frames), '--quality', quality,
    ], { cwd: wt, env: { ...process.env, NP_RASTER: 'hardware' }, stdio: 'ignore' });
  } catch {
    // bench exits 1 on a budget FAIL. That is the normal state across this range and
    // is not a harness error; the payload is still written. Only a missing file is a
    // real failure.
  }
  if (!fs.existsSync(out)) throw new Error(`[perfbisect] no benchmark payload for ${sha}`);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

/*
 * --ab A,B  INTERLEAVED PAIRWISE MODE.
 *
 * A sequential walk measures each commit once, in order, and is therefore only as
 * trustworthy as the machine's stability over the whole walk. This machine is not
 * stable over a whole walk: another stream was running its own GPU benchmark during
 * the first sweep, and the idle baseline moved between 20.7 ms and 38.8 ms — a factor
 * of 1.9 — with a step change partway through. Any single-pass A-then-B comparison
 * across that is worthless, and a comparison that happens to straddle the step will
 * confidently name the wrong commit.
 *
 * Interleaving A,B,A,B,... makes the comparison immune to anything slower than one
 * pair. The reported figure is the MEDIAN of the per-pair differences, which is
 * further immune to a single contaminated pair.
 */
const ab = arg('ab', null);
if (ab) {
  const [a, b] = ab.split(',').map((s) => s.trim());
  const shaA = git('rev-parse', '--short', a);
  const shaB = git('rev-parse', '--short', b);
  const pairs = [];
  console.log(`[perfbisect] interleaved A/B: A=${shaA} B=${shaB}, ${repeats} pair(s), ${frames} frames each`);
  for (let i = 0; i < repeats; i++) {
    ensureWorktree(shaA);
    const ra = benchAt(shaA, `ab${i}`);
    ensureWorktree(shaB);
    const rb = benchAt(shaB, `ab${i}`);
    const d = rb.frameMs.mean - ra.frameMs.mean;
    pairs.push({ i, a: ra.frameMs.mean, b: rb.frameMs.mean, aCalls: ra.peak.calls, bCalls: rb.peak.calls, delta: d });
    console.log(`  pair ${i}   A ${ra.frameMs.mean.toFixed(2)} ms (${ra.peak.calls} calls)   `
      + `B ${rb.frameMs.mean.toFixed(2)} ms (${rb.peak.calls} calls)   B-A ${(d >= 0 ? '+' : '') + d.toFixed(2)} ms   `
      + `B/A ${(rb.frameMs.mean / ra.frameMs.mean).toFixed(3)}x`);
  }
  const ds = pairs.map((p) => p.delta).sort((x, y) => x - y);
  const rs = pairs.map((p) => p.b / p.a).sort((x, y) => x - y);
  const mid = (s) => (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  console.log(`\n  median B-A  ${(mid(ds) >= 0 ? '+' : '') + mid(ds).toFixed(2)} ms   range ${ds[0].toFixed(2)} .. ${ds[ds.length - 1].toFixed(2)}`);
  console.log(`  median B/A  ${mid(rs).toFixed(3)}x   range ${rs[0].toFixed(3)} .. ${rs[rs.length - 1].toFixed(3)}`);
  console.log('  The RATIO is the number to quote when the machine is contended: it survives a');
  console.log('  clock change that the millisecond difference does not.');
  if (outJson) {
    const p = path.resolve(ROOT, outJson);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ mode: 'ab', a: shaA, b: shaB, frames, quality, pairs }, null, 2));
    console.log(`\nwrote ${outJson}`);
  }
  process.exit(0);
}

const shas = git('rev-list', '--reverse', `${from}~1..${to}`).split('\n').filter(Boolean);
console.log(`[perfbisect] ${shas.length} commits, ${repeats} run(s) each, ${frames} frames, quality=${quality}`);

const rows = [];
for (const sha of shas) {
  const short = sha.slice(0, 7);
  const subject = git('log', '-1', '--format=%s', sha);
  ensureWorktree(sha);
  const runs = [];
  for (let r = 0; r < repeats; r++) runs.push(benchAt(short, r));
  const mean = runs.reduce((a, p) => a + p.frameMs.mean, 0) / runs.length;
  const p99 = runs.reduce((a, p) => a + p.frameMs.p99, 0) / runs.length;
  const row = {
    sha: short, subject,
    calls: runs[0].peak.calls,
    triangles: runs[0].peak.triangles,
    programs: runs[0].peak.programs,
    geometries: runs[0].counters.geometries,
    textures: runs[0].counters.textures,
    meanMs: mean, p99Ms: p99, fps: 1000 / mean,
    spread: Math.max(...runs.map((p) => p.frameMs.mean)) - Math.min(...runs.map((p) => p.frameMs.mean)),
  };
  rows.push(row);
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const d = prev ? mean - prev.meanMs : 0;
  console.log(
    `${short}  calls ${String(row.calls).padStart(4)}  tris ${String(row.triangles).padStart(7)}  `
    + `mean ${mean.toFixed(1).padStart(5)} ms  ${(1000 / mean).toFixed(1).padStart(5)} fps  `
    + `${prev ? (d >= 0 ? '+' : '') + d.toFixed(1) + ' ms' : 'baseline'}   ${subject.slice(0, 58)}`,
  );
}

console.log('\n| commit | draw calls | triangles | mean ms | fps | delta ms | subject |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
rows.forEach((r, i) => {
  const d = i ? r.meanMs - rows[i - 1].meanMs : null;
  console.log(`| \`${r.sha}\` | ${r.calls} | ${r.triangles.toLocaleString('en-US')} | ${r.meanMs.toFixed(1)} | ${r.fps.toFixed(1)} | ${d === null ? '—' : (d >= 0 ? '+' : '') + d.toFixed(1)} | ${r.subject} |`);
});

if (outJson) {
  const p = path.resolve(ROOT, outJson);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ from, to, frames, quality, repeats, rows }, null, 2));
  console.log(`\nwrote ${outJson}`);
}
