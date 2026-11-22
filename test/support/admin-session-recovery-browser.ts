import type { Page } from 'playwright-core';
import { expect } from 'vitest';

export async function verifyAdminSessionRecovery(page: Page): Promise<void> {
  const resources = page.locator('.resource-settings:visible');
  const input = resources.locator('._resource-site input').first();
  const original = await input.inputValue();
  const edited = String(Number(original) + 1);
  const warning = page.locator('[data-session-unavailable]');
  const endpoint = '**/api/admin/auth/me';
  let completed = 0;
  let unavailable = true;

  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await input.fill(edited);
  await resources.evaluate((form) => form.setAttribute('data-session-recovery', 'retained'));
  await page.route(endpoint, async (route) => {
    if (unavailable) {
      await route.fulfill({ status: 503, json: { error: 'Synthetic overload' } });
    } else {
      await route.continue();
    }
    completed++;
  });

  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => completed).toBeGreaterThan(0);
    await expect.poll(() => warning.isVisible()).toBe(true);
    expect(await resources.getAttribute('data-session-recovery')).toBe('retained');
    expect(await input.inputValue()).toBe(edited);
    await page.screenshot({ path: '.tmp/admin-session-recovery.png' });
    expect(await page.getByRole('heading', { name: 'No connection', exact: true }).count()).toBe(0);

    unavailable = false;
    await page.clock.runFor(5000);
    await expect.poll(() => warning.count()).toBe(0);
    expect(await resources.getAttribute('data-session-recovery')).toBe('retained');
    expect(await input.inputValue()).toBe(edited);

    await page.unroute(endpoint);
    await page.route(endpoint, (route) => route.abort('connectionrefused'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => warning.isVisible()).toBe(true);
    expect(await input.inputValue()).toBe(edited);
    await page.unroute(endpoint);
    await warning.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect.poll(() => warning.count()).toBe(0);
    expect(await input.inputValue()).toBe(edited);

    await page.route(endpoint, (route) => route.fulfill({ status: 401 }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    expect(await warning.count()).toBe(0);
    await page.unroute(endpoint);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.locator('.resource-settings:visible').waitFor();
  } finally {
    await page.unroute(endpoint);
    await page.clock.resume();
  }
}
