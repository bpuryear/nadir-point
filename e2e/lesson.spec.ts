import { expect, test, type Page } from '@playwright/test';

// The M1 exit test, played through the UI: lose Exercise 1, read cause 1,
// add stern plate in the design bureau, re-run the same seed, win.

async function playToReport(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Skip to result' }).click();
  const stamp = page.locator('.stamp');
  await expect(stamp).toBeVisible({ timeout: 90_000 });
  return stamp.innerText();
}

async function setStern(page: Page, pattern: string, value: number): Promise<void> {
  await page.locator('.library .item', { hasText: pattern }).click();
  const stern = page.locator('.side input[type="range"]').nth(3);
  await stern.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('lose, read the cause, refit, win', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'software WebGL is only reliable in Chromium on CI');
  test.setTimeout(240_000);
  await page.goto('/?webgl');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: 'Commence engagement' }).click();
  expect(await playToReport(page)).toContain('FIELD LOST');
  await expect(page.locator('.paper')).toContainText('STERN ARMOUR');

  await page.getByRole('button', { name: 'Refit in design bureau' }).click();
  await setStern(page, 'Picket, pattern A', 20);
  await setStern(page, 'Warden, pattern A', 35);
  await setStern(page, 'Bastion, pattern A', 50);

  await page.locator('.topbar .tab', { hasText: 'Fleet' }).click();
  await page.getByRole('button', { name: 'Commence engagement' }).click();
  expect(await playToReport(page)).toContain('FIELD HELD');
});
