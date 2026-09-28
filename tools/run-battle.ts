// Run the M0 check battles headless in Node and print, or write, the golden hashes.
//   npm run battle            print results
//   npm run battle -- --write update test/golden.json
import { writeFileSync } from 'node:fs';
import { SIM_VERSION } from '../src/sim/constants.ts';
import { CHECK_SEEDS, runBattleCheck } from '../src/sim/run.ts';

const t0 = performance.now();
const results = CHECK_SEEDS.map((seed) => runBattleCheck(seed));
const ms = performance.now() - t0;
const totalTicks = results.reduce((s, r) => s + r.finalTick, 0);

const golden = { simVersion: SIM_VERSION, battles: results };
console.log(JSON.stringify(golden, null, 2));
console.error(`${results.length} battles, ${totalTicks} ticks, ${ms.toFixed(0)} ms, ${(ms / totalTicks).toFixed(3)} ms/tick`);

if (process.argv.includes('--write')) {
  writeFileSync(new URL('../test/golden.json', import.meta.url), JSON.stringify(golden, null, 2) + '\n');
  console.error('wrote test/golden.json');
}
