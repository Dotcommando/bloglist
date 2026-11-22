import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

import {
  type IResourceView, ResourceDatabasePlacement, ResourceProcessRole, ResourceProcessState,
} from '../../admin/src/features/resources/resources-api.js';

it('distinguishes three total CMS processes from one configured site process in both languages', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const site = {
    siteId: 'site-1',
    mark: 'Synthetic',
    name: 'Synthetic site',
    primaryDomain: 'one.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };
  const resources: IResourceView = {
    version: 'v1',
    capacity: 20,
    infrastructureCpu: 0,
    databaseCpu: 1,
    databasePlacement: ResourceDatabasePlacement.ManagedLocal,
    cmsCpu: 19,
    cmsCpuBudget: null,
    observedDatabaseCpu: 1,
    observedCmsCpu: 19,
    databaseVersion: null,
    databaseImage: null,
    recommendation: 19,
    unallocated: 18,
    managed: true,
    allocationEditable: true,
    activeDump: false,
    dumpSiteId: null,
    applyError: null,
    sites: [{
      siteId: site.siteId,
      name: site.name,
      domain: site.primaryDomain,
      processes: 1,
      running: 1,
      error: null,
      dumpMode: 'InProcess',
    }],
    processes: [
      { pid: 100, role: ResourceProcessRole.Coordinator, state: ResourceProcessState.Ready, siteId: null },
      { pid: 101, role: ResourceProcessRole.Administration, state: ResourceProcessState.Ready, siteId: null },
      { pid: 102, role: ResourceProcessRole.Site, state: ResourceProcessState.Ready, siteId: site.siteId },
    ],
  };
  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    page.setDefaultTimeout(5000);
    const errors: string[] = [];

    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname.startsWith('/api/')) {
        let json: unknown = { items: [] };

        if (pathname.endsWith('/auth/me')) {
          json = { user: { authorization: { systemAdmin: true } } };
        } else if (pathname === '/api/admin/sites') {
          json = { items: [site] };
        } else if (pathname === '/api/admin/sites/site-1') {
          json = site;
        } else if (pathname === '/api/admin/installation/resources') {
          json = {
            ...resources,
            siteDetails: resources.sites,
            sites: resources.sites.map(entry => ({ siteId: entry.siteId, processes: entry.processes })),
            running: Object.fromEntries(resources.sites.map(entry => [entry.siteId, entry.running])),
            processErrors: Object.fromEntries(resources.sites.map(entry => [entry.siteId, entry.error])),
          };
        } else if (pathname === '/api/admin/installation/settings') {
          json = { adminOrigin: 'http://localhost:31989', version: 'v1' };
        } else if (pathname.endsWith('/settings')) {
          json = {
            siteId: site.siteId,
            timeZone: 'UTC',
            addresses: { publicOrigin: 'https://one.test', localOrigin: 'http://localhost:3000', originMode: 'Local' },
          };
        }
        await route.fulfill({ json });

        return;
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe test asset');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });
    await page.goto('http://localhost:31989/admin/sites/site-1/settings');
    await page.getByRole('button', { name: 'General', exact: true }).click();
    const workspace = page.locator('.resource-settings:visible');

    await workspace.getByRole('table', { name: 'CMS processes', exact: true }).waitFor();
    expect(await workspace.textContent()).toContain('Total CMS processes: 3');
    expect(await workspace.textContent()).toMatch(/sites:\s*1\s*\+\s*services:\s*2/);
    expect(await workspace.getByLabel('Processes for this site', { exact: true }).inputValue()).toBe('1');
    expect(await workspace.locator('._resource-summary').textContent()).toContain('Site processes only');
    expect(await workspace.textContent()).not.toContain('Total running processes: 1');
    await page.locator('.admin-language select').selectOption('ru');
    await workspace.getByRole('table', { name: 'Процессы CMS', exact: true }).waitFor();
    expect(await workspace.textContent()).toContain('Всего процессов CMS: 3');
    expect(await workspace.textContent()).toMatch(/сайты:\s*1\s*\+\s*служебные:\s*2/);
    expect(await workspace.getByLabel('Процессы этого сайта', { exact: true }).inputValue()).toBe('1');

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
