import { expect, test } from '@playwright/test';

// Smoke test: the game boots on the WebGL2 path without page errors.
// CI machines have no GPU, so only Chromium's software GL runs this.
test('game boots and runs the sim', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'software WebGL is only reliable in Chromium on CI');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?webgl&n=40');
  await expect(page.locator('#stats')).toContainText('WebGL2', { timeout: 30_000 });
  await expect(page.locator('#stats')).toContainText(/T[1-9]\d*/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
