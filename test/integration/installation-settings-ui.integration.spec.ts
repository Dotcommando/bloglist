import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

it('edits installation settings in the General tab with preserved input and responsive layout', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const errors: string[] = [];
  const writes: unknown[] = [];
  let failureStatus = 400;
  let version = 'v1';
  const site = {
    siteId: 'site-1',
    mark: 'Site',
    name: 'Synthetic site',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };

  page.setDefaultTimeout(5000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.origin === 'https://next.example.test') {
      return route.fulfill({ contentType: 'text/html', body: '<h1>New administration</h1>' });
    }
    if (url.origin !== 'http://localhost:31988') {
      return route.abort();
    }
    if (url.pathname === '/api/admin/auth/me') {
      return route.fulfill({ json: {} });
    }
    if (url.pathname === '/api/admin/sites') {
      return route.fulfill({ json: { items: [site] } });
    }
    if (url.pathname === '/api/admin/sites/site-1') {
      return route.fulfill({ json: site });
    }
    if (url.pathname === '/api/admin/installation/settings') {
      if (route.request().method() === 'POST') {
        writes.push(route.request().postDataJSON());

        return failureStatus
          ? route.fulfill({ status: failureStatus, json: { error: 'Validation' } })
          : route.fulfill({ json: { adminOrigin: 'https://next.example.test', version: 'v3' } });
      }

      return route.fulfill({ json: { adminOrigin: 'https://backend.example.com', version } });
    }
    if (url.pathname === '/api/admin/sites/site-1/settings') {
      return route.fulfill({
        json: {
          timeZone: 'UTC',
          addresses: { publicOrigin: null, localOrigin: null, originMode: null },
        },
      });
    }
    if (url.pathname.startsWith('/api/')) {
      return route.fulfill({ json: { items: [] } });
    }

    const asset = url.pathname.startsWith('/admin/assets/') ? url.pathname.slice('/admin/'.length) : 'index.html';
    const root = path.resolve('admin/dist');
    const filename = path.resolve(root, asset);

    if (!filename.startsWith(root + path.sep)) {
      throw new Error('Unsafe fixture path');
    }

    return route.fulfill({
      body: await readFile(filename),
      contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
    });
  });

  try {
    await page.goto('http://localhost:31988/admin/sites/site-1/settings');
    expect(await page.locator('.cms-header').getByRole('button', { name: 'Installation settings' }).count()).toBe(0);
    const settings = page.getByRole('main', { name: 'Settings', exact: true });

    await settings.getByRole('button', { name: 'General', exact: true }).click();
    const panel = settings.locator('.installation-settings');
    const input = panel.getByLabel('Administration address', { exact: true });

    await input.waitFor();
    await settings.getByRole('heading', { name: 'General installation settings', exact: true }).waitFor();
    expect(await page.getByRole('dialog').count()).toBe(0);
    expect(await input.inputValue()).toBe('https://backend.example.com/admin/');
    expect(await panel.getByRole('button', { name: 'Save', exact: true }).isDisabled()).toBe(true);
    expect(await panel.getByRole('button', { name: 'Save', exact: true }).getAttribute('class'))
      .toContain('cms-secondary');
    expect(await panel.getByRole('button', { name: 'Save', exact: true }).locator('svg').count()).toBe(1);
    await input.fill('https://public.example.com/admin/');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    expect(writes).toEqual([{ adminAddress: 'https://public.example.com/admin/', expectedVersion: 'v1' }]);
    expect(await input.inputValue()).toBe('https://public.example.com/admin/');
    await settings.getByRole('button', { name: 'Main', exact: true }).click();
    await settings.getByRole('button', { name: 'General', exact: true }).click();
    expect(await input.inputValue()).toBe('https://public.example.com/admin/');

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const saveBox = await panel.getByRole('button', { name: 'Save', exact: true }).boundingBox();
      const refreshBox = await panel.getByRole('button', { name: 'Refresh', exact: true }).boundingBox();

      expect(saveBox!.y).toBe(refreshBox!.y);
    }
    await page.locator('.admin-language select').selectOption('ru');
    const ruSettings = page.getByRole('main', { name: 'Настройки', exact: true });
    const ruPanel = ruSettings.locator('.installation-settings');

    expect(await ruSettings.getByRole('button', { name: 'Общие', exact: true })
      .getAttribute('aria-current')).toBe('page');
    await ruPanel.getByLabel('Адрес админки', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.tmp/installation-settings-mobile.png' });
    await page.locator('.admin-language select').selectOption('en');
    failureStatus = 409;
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: 'Settings changed' }).waitFor();
    expect(await input.inputValue()).toBe('https://public.example.com/admin/');
    version = 'v2';
    page.once('dialog', (dialog) => void dialog.accept());
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(async () => input.inputValue()).toBe('https://backend.example.com/admin/');
    failureStatus = 0;
    await input.fill('https://next.example.test/admin/');
    await panel.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL('https://next.example.test/admin/');
    expect(writes.at(-1)).toEqual({ adminAddress: 'https://next.example.test/admin/', expectedVersion: 'v2' });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
