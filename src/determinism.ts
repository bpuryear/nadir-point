// Runs the check battles in this browser and compares them with the golden
// hashes produced by Node. Playwright reads window.__determinism; people can
// read the page.
import golden from '../test/golden.json';
import { SIM_VERSION } from './sim/constants.ts';
import { CHECK_SEEDS, runBattleCheck, type BattleCheck } from './sim/run.ts';

interface DeterminismReport {
  simVersion: number;
  pass: boolean;
  ms: number;
  battles: { seed: number; pass: boolean; got: BattleCheck }[];
}

declare global {
  interface Window {
    __determinism?: DeterminismReport;
  }
}

function sameCheck(a: BattleCheck, b: BattleCheck): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function run(): Promise<void> {
  const out = document.getElementById('out')!;
  out.textContent = 'RUNNING…';
  await new Promise((r) => setTimeout(r, 30));

  const t0 = performance.now();
  const battles = CHECK_SEEDS.map((seed) => {
    const got = runBattleCheck(seed);
    const want = golden.battles.find((b) => b.seed === seed) as BattleCheck | undefined;
    return { seed, pass: !!want && sameCheck(got, want), got };
  });
  const report: DeterminismReport = {
    simVersion: SIM_VERSION,
    pass: golden.simVersion === SIM_VERSION && battles.every((b) => b.pass),
    ms: performance.now() - t0,
    battles,
  };
  window.__determinism = report;

  const lines = [
    `DETERMINISM CHECK · SIM v${SIM_VERSION} · ${report.pass ? 'PASS' : 'FAIL'}`,
    `${navigator.userAgent}`,
    `${report.ms.toFixed(0)} ms`,
    '',
    ...battles.map((b) => `seed ${String(b.seed).padEnd(10)} ${b.pass ? 'PASS' : 'FAIL'}  final T${b.got.finalTick}  ${b.got.finalHash}`),
  ];
  out.textContent = lines.join('\n');
  document.body.dataset.result = report.pass ? 'pass' : 'fail';
}

void run();
