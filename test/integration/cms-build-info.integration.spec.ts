import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';
import { build } from 'vite';

describe('CMS build information dismissal in the real administration bundle', () => {
  let adminDist: string;

  beforeAll(async () => {
    await mkdir(path.resolve('.tmp'), { recursive: true });
    adminDist = await mkdtemp(path.resolve('.tmp/build-info-ui-'));
    await build({
      root: path.resolve('admin'),
      configFile: path.resolve('admin/vite.config.ts'),
      build: { outDir: adminDist },
    });
  });

  afterAll(async () => {
    if (adminDist) {
      await rm(adminDist, { recursive: true, force: true });
    }
  });

  it.each([1440, 320])('dismisses and reopens details without losing header interaction at %ipx', async (width) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser executable required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [];

      page.setDefaultTimeout(3000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());

        if (url.origin !== 'http://localhost:31997') {
          return route.abort();
        }
        if (url.pathname === '/api/admin/auth/me') {
          return route.fulfill({ json: {} });
        }
        if (url.pathname === '/api/admin/sites') {
          return route.fulfill({ json: { items: [] } });
        }
        if (url.pathname.startsWith('/api/')) {
          throw new Error('Unexpected synthetic route: ' + url.pathname);
        }

        const asset = url.pathname.startsWith('/admin/assets/') ? url.pathname.slice('/admin/'.length) : 'index.html';
        const filename = path.resolve(adminDist, asset);

        if (!filename.startsWith(adminDist + path.sep)) {
          throw new Error('Unsafe asset path');
        }

        return route.fulfill({
          body: await readFile(filename),
          contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
        });
      });
      await page.goto('http://localhost:31997/admin/sites/new');
      const trigger = page.locator('._build-summary');
      const details = page.locator('._build-details');

      await trigger.waitFor({ state: 'visible' });
      const initialUrl = page.url();
      const decoration = await trigger.evaluate((element) => {
        const style = getComputedStyle(element);

        return { line: style.textDecorationLine, kind: style.textDecorationStyle };
      });

      expect(decoration).toEqual({ line: 'underline', kind: 'dotted' });

      await trigger.click();
      await details.waitFor({ state: 'visible' });

      if (process.env.ZARYA_TEST_SCREENSHOTS) {
        await page.screenshot({ path: path.resolve('.tmp/cms-build-info-' + width + '.png') });
      }
      await details.locator('p, dd').first().click();
      expect(await details.isVisible()).toBe(true);
      const box = await details.boundingBox();

      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);

      for (const dismissal of width === 1440 ? ['Escape', 'outside'] : ['outside', 'Escape']) {
        if (dismissal === 'Escape') {
          await page.keyboard.press('Escape');
        } else {
          await page.locator('.cms-header').click({ position: { x: 4, y: 4 } });
        }
        await details.waitFor({ state: 'hidden' });

        if (dismissal === 'Escape') {
          expect(await trigger.evaluate(element => element === document.activeElement)).toBe(true);
        }
        await trigger.click();
        await details.waitFor({ state: 'visible' });
      }
      await trigger.click();
      await details.waitFor({ state: 'hidden' });

      await trigger.focus();
      await page.keyboard.press('Enter');
      await details.waitFor({ state: 'visible' });
      await trigger.click();
      await details.waitFor({ state: 'hidden' });
      await page.keyboard.press('Space');
      await details.waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await details.waitFor({ state: 'hidden' });
      expect(page.url()).toBe(initialUrl);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
