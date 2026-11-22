import type { Page } from 'playwright-core';
import { expect } from 'vitest';

import { verifyResourceRequestRaces } from './resource-settings-request-races.js';

export async function verifyResourceSettings(page: Page): Promise<void> {
  const resources = page.locator('.resource-settings:visible');
  const first = resources.locator('._resource-site').filter({ hasText: 'one.test' }).locator('input');
  const second = resources.locator('._resource-site').filter({ hasText: 'two.test' }).locator('input');
  const save = resources.getByRole('button', { name: 'Save allocation', exact: true });
  const feedback = resources.locator('._resource-feedback');
  const firstActual = resources.locator('._resource-site').filter({ hasText: 'one.test' })
    .locator('._resource-actual').first();

  await resources.waitFor();
  expect(await resources.getByText('Database image', { exact: true }).count()).toBe(0);
  let submitted = 0;

  await page.route('**/api/admin/installation/resources', async (route) => {
    if (route.request().method() === 'POST') {
      submitted++;
      expect(route.request().postDataJSON()).toMatchObject({
        sites: expect.arrayContaining([
          expect.objectContaining({ processes: 20 }), expect.objectContaining({ processes: 2 }),
        ]),
      });
      await route.fulfill({ status: 400, json: { error: 'Synthetic validation failure' } });
    } else {
      await route.continue();
    }
  });
  await first.fill('20');
  await save.click();
  await expect.poll(() => feedback.textContent()).toContain('Allocation rejected');
  expect(submitted).toBe(1);
  expect(await resources.textContent()).not.toContain('Memory/connection process limit');
  await page.unroute('**/api/admin/installation/resources');
  expect(await resources.locator('._resource-summary').textContent()).toContain('Assigned to sites: 3');
  expect(await resources.locator('._resource-summary').textContent()).toContain('Unallocated CPU budget: 0 CPU');
  const nearby = await save.evaluate((button) => {
    const feedback = button.closest('form')!.querySelector('._resource-feedback')!;

    return Math.abs(feedback.getBoundingClientRect().top - button.getBoundingClientRect().bottom);
  });

  expect(nearby).toBeLessThan(100);
  await first.fill('10');
  expect(await resources.locator('._resource-warning').textContent())
    .toContain('You may exceed the CPU recommendation');
  await save.click();
  await expect.poll(() => resources.locator('._resource-saving-overlay').isVisible()).toBe(true);
  expect(await resources.locator('._saving-spinner').isVisible()).toBe(true);
  expect(await resources.locator('._saving-spinner').evaluate((spinner) => {
    const bounds = spinner.getBoundingClientRect();

    return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
  })).toBe(true);
  expect(await save.isEnabled()).toBe(false);
  await page.screenshot({ path: '.tmp/resource-allocation-applying.png' });
  await expect.poll(() => feedback.textContent(), { timeout: 30000 }).toContain('Allocation saved');
  expect(await resources.locator('._resource-saving-overlay').count()).toBe(0);
  await expect.poll(() => firstActual.textContent()).toContain('running now 10');
  await first.fill('1');
  await save.click();
  await expect.poll(() => firstActual.textContent()).toContain('running now 1');

  await verifyResourceRequestRaces(page);

  await page.route('**/api/admin/installation/resources', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, json: { error: 'InternalError' } });
    } else {
      await route.continue();
    }
  });
  await first.fill('2');
  await save.click();
  await expect.poll(() => feedback.textContent()).toContain('Could not finish applying');
  expect(await first.inputValue()).toBe('2');
  expect(await firstActual.textContent()).toContain('Site: assigned 1');
  await page.unroute('**/api/admin/installation/resources');
  await resources.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await expect.poll(() => first.inputValue()).toBe('1');

  const resourcePath = '/api/admin/installation/resources';
  const response = await page.request.get(new URL(resourcePath, page.url()).href, {
    headers: { 'X-Zarya-Admin': '1' },
  });

  expect(response.ok()).toBe(true);
  const data = await response.json();
  const resourcePattern = '**' + resourcePath;

  await page.route(resourcePattern, (route) => route.fulfill({
    json: {
      ...data,
      capacity: 20,
      databaseCpu: 1,
      cmsCpu: 19,
      observedCmsCpu: 19,
      managed: true,
    },
  }));
  await Promise.all([
    page.waitForResponse((incoming) => new URL(incoming.url()).pathname === resourcePath),
    resources.getByRole('button', { name: 'Refresh', exact: true }).last().click(),
  ]);
  const database = resources.locator('._resource-row input');

  await expect.poll(() => database.isEnabled()).toBe(true);
  const dumpExplanation = resources.locator('._dump-explanation');

  expect(await dumpExplanation.textContent()).toContain('Capture runs in the only site process');
  await database.fill('1.2');
  await second.fill('17');
  expect(await resources.locator('._resource-summary').textContent()).toContain('0.8 CPU');
  expect(await dumpExplanation.textContent()).toContain('Capture runs in the only site process');
  await first.fill('2');
  expect(await dumpExplanation.textContent()).toContain('One site process will stop for dump capture');
  await page.unroute('**/api/admin/installation/resources');
  await resources.getByRole('button', { name: 'Refresh', exact: true }).last().click();
  await expect.poll(() => second.inputValue()).toBe('2');
}
