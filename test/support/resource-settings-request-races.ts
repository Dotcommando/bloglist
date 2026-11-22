import type { Page } from 'playwright-core';
import { expect } from 'vitest';

export async function verifyResourceRequestRaces(page: Page, domain = 'one.test'): Promise<void> {
  const resources = page.locator('.resource-settings:visible');
  const first = resources.locator('._resource-site').filter({ hasText: domain });
  const input = first.locator('input');
  const save = resources.getByRole('button', { name: 'Save allocation', exact: true });
  const feedback = resources.locator('._resource-feedback');
  const actual = first.locator('._resource-actual').first();
  const overlay = resources.locator('._resource-saving-overlay');
  const endpoint = '**/api/admin/installation/resources';
  const baseline = await page.request.get(new URL('/api/admin/installation/resources', page.url()).href, {
    headers: { 'X-Zarya-Admin': '1', Origin: new URL(page.url()).origin },
  });
  const state: unknown = await baseline.json();
  let releaseRead!: () => void;
  let readStarted = false;
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });

  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await expect.poll(() => resources.getByRole('button', { name: 'Refresh', exact: true }).last().isEnabled())
    .toBe(true);
  await page.route(endpoint, async (route) => {
    if (route.request().method() === 'GET') {
      readStarted = true;
      await heldRead;

      if (!route.request().failure()) {
        await route.fulfill({ json: state });
      }
    } else {
      await route.continue();
    }
  });

  try {
    await page.clock.runFor(5001);
    await expect.poll(() => readStarted).toBe(true);
    await input.fill('2');
    expect(await save.isEnabled()).toBe(true);
    expect(await input.isEnabled()).toBe(true);
    expect(await overlay.count()).toBe(0);
    await save.click();
    await expect.poll(() => actual.textContent(), { timeout: 15000 }).toContain('Site: assigned 2');
    await page.clock.runFor(401);
    await expect.poll(() => feedback.textContent()).toContain('Allocation saved');
    const staleResponse = page.waitForResponse((response) => response.request().method() === 'GET'
      && response.url().endsWith('/api/admin/installation/resources'));

    releaseRead();
    await (await staleResponse).finished();
    await page.clock.runFor(100);
    await expect.poll(() => actual.textContent()).toContain('Site: assigned 2');
    expect(await input.inputValue()).toBe('2');
  } finally {
    releaseRead();
    await page.unroute(endpoint);
  }

  let releasePost!: () => void;
  const heldPost = new Promise<void>((resolve) => {
    releasePost = resolve;
  });
  let serverApplied = false;

  await page.route(endpoint, async (route) => {
    if (route.request().method() === 'POST') {
      const response = await route.fetch();

      expect(response.status()).toBe(200);
      serverApplied = true;
      await heldPost;

      if (!route.request().failure()) {
        await route.fulfill({ response });
      }
    } else {
      await route.continue();
    }
  });

  try {
    await input.fill('3');
    await save.click();
    await expect.poll(() => overlay.isVisible()).toBe(true);
    expect(await save.isEnabled()).toBe(false);
    await expect.poll(() => serverApplied, { timeout: 15000 }).toBe(true);
    await page.clock.runFor(120001);
    await expect.poll(() => feedback.textContent()).toContain('Save confirmed');
    expect(await overlay.count()).toBe(0);
    expect(await input.isEnabled()).toBe(true);
    expect(await actual.textContent()).toContain('running now 3');
    await input.fill('4');
    expect(await save.isEnabled()).toBe(true);
  } finally {
    releasePost();
    await page.unroute(endpoint);
    await page.clock.setSystemTime(new Date());
    await page.clock.resume();
  }

  await resources.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await expect.poll(() => input.inputValue()).toBe('3');
  await input.fill('1');
  await save.click();
  await expect.poll(() => actual.textContent()).toContain('running now 1');
}
