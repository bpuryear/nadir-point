import { expect, test } from '@playwright/test';
import golden from '../test/golden.json' with { type: 'json' };

// The same battles must hash the same in every browser engine as in Node.
test('check battles match the Node golden hashes', async ({ page }) => {
  await page.goto('/determinism.html');
  const report = await page.waitForFunction(() => window.__determinism, null, { timeout: 150_000 }).then((h) => h.jsonValue());
  expect(report).toBeTruthy();
  for (const b of report!.battles) {
    const want = golden.battles.find((g) => g.name === b.name);
    expect(b.got, b.name).toEqual(want);
  }
  expect(report!.pass).toBe(true);
});
