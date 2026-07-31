/**
 * THE GATE LIST, AS A PROGRAM.
 *
 *   node tools/gates.mjs              # everything, in order, stops nothing early
 *   node tools/gates.mjs --fast       # skip the three browser gates (smoke, uicheck, widediag, bench)
 *   node tools/gates.mjs --only bench
 *
 * WHY THIS FILE EXISTS.
 *
 * The gate list has lived in three places at once — README.md, ARCHITECTURE.md and
 * HANDOFF.md — as prose that a human copies into a terminal. That works exactly until
 * one of the three drifts, and it drifted: `npm run bench` was in none of them as a
 * per-wave gate, so it was the one check nobody ran after each wave. It is also the
 * one that regressed. The frame went from a claimed 12.1 ms to a measured 34.4 ms and
 * eleven other gates stayed green through all of it, because none of them look at a
 * clock.
 *
 * A gate that is a paragraph is a gate that is optional. A gate that is an array
 * element is not. `bench` is in the array below, it is marked `budget: true`, and this
 * program exits non-zero when it fails.
 *
 * WHAT IT DOES NOT DO. It does not stop at the first failure. A run that dies on gate
 * 2 of 12 tells you one thing; a run that reports all twelve tells you what you broke
 * and what you did not, which is what you need before deciding whether to keep going.
 *
 * MEASUREMENT HONESTY. `bench` reports a frame rate only under hardware
 * rasterisation. On a machine without a GPU it deliberately refuses to assert one, so
 * running this list in a GPU-less container will show `bench` passing or failing on
 * the DRAW-CALL budget alone. That is correct behaviour and not a pass on frame time.
 * `tools/harness.mjs#rasterMode` decides, and this file prints which mode it got so a
 * green line can never be quoted as a frame-rate result it is not.
 */
import { spawn } from 'node:child_process';
import { rasterMode, fpsIsMeaningful, ROOT } from './harness.mjs';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(`--${n}`);

/**
 * `browser: true` means the gate launches Chromium and is slow (tens of seconds to
 * minutes). `budget: true` means it enforces a performance budget rather than a
 * correctness property — those are the ones that go stale when nobody runs them.
 */
const GATES = [
  { id: 'selftest',    cmd: ['node', 'src/sim/selftest.mjs'],                  what: 'headless checks over the whole sim stream' },
  { id: 'ripple',      cmd: ['node', 'tools/ripple.mjs'],                      what: 'salvo ripple wave' },
  { id: 'flight',      cmd: ['node', 'tools/flight.mjs'],                      what: 'flight model' },
  { id: 'escalation',  cmd: ['node', 'src/sim/ai/escalationHarness.mjs'],      what: 'escalation ladder actually fires' },
  { id: 'economy',     cmd: ['node', 'src/sim/meta/economyAudit.mjs'],         what: 'economy closure' },
  { id: 'poicheck',    cmd: ['node', 'tools/poicheck.mjs'],                    what: 'POI lighting rigs' },
  { id: 'ships-audit', cmd: ['node', 'src/art/geometry/ships/audit.mjs'],      what: 'class silhouettes held apart by measured outline distance' },
  { id: 'mods-audit',  cmd: ['node', 'src/art/geometry/modules/audit.mjs'],    what: 'same-mount module silhouettes held apart' },
  { id: 'smoke',       cmd: ['node', 'tools/smoke.mjs'],                       what: 'boots with no console error',            browser: true },
  { id: 'uicheck',     cmd: ['node', 'tools/uicheck.mjs'],                     what: 'contrast and panel layout',              browser: true },
  { id: 'widediag',    cmd: ['node', 'tools/widediag.mjs', 'close', '--assert'], what: 'the close shot is not black',          browser: true },
  {
    id: 'bench',
    cmd: ['node', 'tools/bench.mjs'],
    what: 'draw-call / triangle / program budgets AND frame time at 2560x1440',
    browser: true,
    budget: true,
  },
];

const only = arg('only', null);
const list = GATES
  .filter((g) => !only || g.id === only)
  .filter((g) => !(has('fast') && g.browser));

function run(g) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(g.cmd[0], g.cmd.slice(1), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { out += d.toString(); });
    p.on('exit', (code) => resolve({ ...g, code: code ?? 1, ms: Date.now() - started, out }));
    p.on('error', (e) => resolve({ ...g, code: 1, ms: Date.now() - started, out: String(e) }));
  });
}

console.log(`\nGATES  raster=${rasterMode()}  frame time ${fpsIsMeaningful() ? 'IS' : 'is NOT'} meaningful here`);
console.log(`${list.length} gate(s)${has('fast') ? ', browser gates skipped' : ''}\n`);

const results = [];
for (const g of list) {
  process.stdout.write(`  ${g.id.padEnd(12)} … `);
  const r = await run(g);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${(r.ms / 1000).toFixed(1)}s   ${g.what}`);
}

const failed = results.filter((r) => r.code !== 0);
for (const r of failed) {
  console.log(`\n--- ${r.id} FAILED (exit ${r.code}) ---`);
  console.log(r.out.split('\n').slice(-40).join('\n'));
}

console.log(`\n${results.length - failed.length}/${results.length} gates pass`);
if (failed.some((r) => r.budget)) {
  console.log('A BUDGET GATE FAILED. This is the class of gate that goes stale when it is');
  console.log('not run every wave — do not defer it to a review pass.');
}
process.exit(failed.length ? 1 : 0);
