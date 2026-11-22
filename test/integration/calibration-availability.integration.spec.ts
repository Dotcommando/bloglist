import path from 'node:path';

import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';

import { account } from '../support/admin-users.js';
import { forkHarness } from '../support/fork-harness.js';

it('explains the actual missing calibration capability and how to recover in the administration', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit browser executable required');
  }

  const fixture = await forkHarness({ admin: true, adminRoot: path.resolve('admin/dist') });
  const browser = await chromium.launch({ executablePath, headless: true });
  let release = (): void => {};

  try {
    const context = await browser.newContext();
    const headers = { Origin: fixture.origin, 'X-Zarya-Admin': '1' };
    const response = await context.request.post(fixture.origin + '/api/admin/auth/login', {
      headers, data: { email: account().profile().email, password: 'synthetic fork password' },
    });

    expect(response.status()).toBe(200);
    const page = await context.newPage();

    await page.goto(fixture.origin + '/admin/sites/' + fixture.sites[0]!.siteId + '/settings');
    await page.locator('.admin-language select').selectOption('en');
    await page.getByRole('button', { name: 'Calibration', exact: true }).click();
    const workspace = page.locator('._calibration-workspace:visible');

    await expect.poll(() => workspace.getByRole('button', { name: 'Create profile', exact: true }).isEnabled())
      .toBe(true);
    expect(await workspace.locator('.cms-warning').textContent())
      .toContain('CMS is not connected to Docker CPU quota control');
    expect(await workspace.locator('.cms-warning').textContent())
      .toContain('Stop the current HTTP application and start the CMS and resource helper containers');
    const stateResponse = await context.request.get(fixture.origin + '/api/admin/installation/resources', { headers });
    const observed = await stateResponse.json();
    const ready = {
      ...observed,
      managed: true,
      databaseImage: 'mongo:synthetic',
      observedCmsCpu: observed.cmsCpu,
      observedDatabaseCpu: observed.databaseCpu,
    };
    let helperAvailable = true;
    let resourceStatus = 200;
    let hold: Promise<void> | null = null;

    await page.route('**/api/admin/installation/calibration/capabilities', route => route.fulfill({
      json: { site: true, installation: true },
    }));
    await page.route('**/api/admin/installation/resources', async route => {
      if (hold) {
        await hold;
      }
      await route.fulfill({
        status: resourceStatus,
        json: { ...ready, databaseImage: helperAvailable ? ready.databaseImage : null },
      });
    });
    const refresh = workspace.getByRole('button', { name: 'Refresh', exact: true });
    const diagnostic = workspace.locator('[data-calibration-unavailable]');

    await refresh.click();
    await expect.poll(() => refresh.isEnabled()).toBe(true);
    expect(await diagnostic.count()).toBe(0);
    helperAvailable = false;
    await refresh.click();
    await expect.poll(() => diagnostic.textContent()).toContain('Could not read container state');
    expect(await diagnostic.textContent()).toContain('resource-control is running');
    expect(await diagnostic.textContent()).not.toContain('CMS is not connected');
    resourceStatus = 503;
    await refresh.click();
    await expect.poll(() => diagnostic.textContent()).toContain('HTTP 503');
    expect(await diagnostic.textContent()).toContain('has not been determined');
    expect(await diagnostic.textContent()).not.toContain('Docker');
    resourceStatus = 200;
    helperAvailable = true;
    hold = new Promise<void>(resolve => {
      release = resolve;
    });
    await refresh.click();
    await expect.poll(() => workspace.textContent()).toContain('Checking calibration availability');
    expect(await diagnostic.count()).toBe(0);
    release();
    hold = null;
    await expect.poll(() => refresh.isEnabled()).toBe(true);
    expect(await diagnostic.count()).toBe(0);
  } finally {
    release();
    await browser.close();
    await fixture.close();
  }
}, 60000);
