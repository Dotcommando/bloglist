import path from 'node:path';

import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';

import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { account } from '../support/admin-users.js';
import { forkHarness } from '../support/fork-harness.js';

it('shuts down native site forks after the browser visits administration and resource settings', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit browser executable required');
  }

  const f = await forkHarness({
    admin: true,
    delivery: HtmlDelivery.Static,
    adminRoot: path.resolve('admin/dist'),
    workerRunner: new URL('../../dist/infra/resources/site-worker.js', import.meta.url),
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let closing = false;

  try {
    browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext();
    const login = await context.request.post(f.origin + '/api/admin/auth/login', {
      headers: { Origin: f.origin, 'X-Zarya-Admin': '1' },
      data: { email: account().profile().email, password: 'synthetic fork password' },
    });

    expect(login.status()).toBe(200);
    const page = await context.newPage();
    const failures: string[] = [];

    page.on('pageerror', error => failures.push(error.message));
    await page.goto(f.origin + '/admin/sites/' + f.sites[0]!.siteId + '/settings');
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.getByRole('table', { name: 'CMS processes', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Calibration', exact: true }).click();
    await page.locator('._calibration-workspace:visible').waitFor();
    expect(failures).toEqual([]);
    await browser.close();
    closing = true;
    const before = Date.now();

    await f.close();
    expect(Date.now() - before).toBeLessThan(5000);
  } finally {
    try {
      await browser?.close();
    } finally {
      if (!closing) {
        await f.close();
      }
    }
  }
}, 90000);
