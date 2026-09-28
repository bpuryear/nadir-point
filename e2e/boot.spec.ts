import { expect, test } from '@playwright/test';

// Smoke test: directive → engagement → skip → report, on the WebGL2 path, with no page errors.
// CI machines have no GPU, so only Chromium's software GL runs this.
test('an exercise runs from directive to report', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'software WebGL is only reliable in Chromium on CI');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?webgl');
  await expect(page.locator('.paper h1')).toContainText('EXERCISE 1');
  await page.getByRole('button', { name: 'Commence engagement' }).click();
  await expect(page.locator('.hud-top')).toContainText('OPFOR', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip to result' }).click();
  await expect(page.locator('.stamp')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.paper')).toContainText('CAUSES');
  expect(errors).toEqual([]);
});
