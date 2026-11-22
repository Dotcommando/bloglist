import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';
import { build } from 'vite';

describe('deployment settings in the administration browser', () => {
  let adminDist: string;

  beforeAll(async () => {
    const { version }: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));

    await mkdir(path.resolve('.tmp'), { recursive: true });
    adminDist = await mkdtemp(path.resolve('.tmp/deployment-ui-'));
    await build({
      root: path.resolve('admin'),
      configFile: path.resolve('admin/vite.config.ts'),
      define: {
        __CMS_BUILD_INFO__: JSON.stringify({
          version,
          commit: 'a'.repeat(40),
          checksum: 'b'.repeat(64),
        }),
      },
      build: { outDir: adminDist },
    });
  });

  afterAll(async () => {
    if (adminDist) {
      await rm(adminDist, { recursive: true, force: true });
    }
  });

  it.each([true, false])('keeps recovery and the site header usable (explicit origin: %s)', async (explicitOrigin) => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    const writes: { route: string; body: Record<string, unknown> }[] = [];
    const site = {
      siteId: 'site-1',
      mark: 'Site',
      name: 'Test site',
      primaryDomain: 'example.test',
      languages: ['en'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    let target: Record<string, unknown> | null = null;
    let state = 'Idle';
    const status = (): Record<string, unknown> => ({
      target,
      state,
      version: 'delivery-1',
      activeReleaseId: 'release-1',
      attempts: 1,
      retryAt: null,
      diagnostic: state === 'OutcomeUnknown' ? {
        issue: 'Backend',
        retryable: false,
        stage: 'PublicVerification',
        reason: 'HttpStatus',
        httpStatus: 400,
        recovery: 'CheckBackendAndReconcile',
      } : null,
      delivered: null,
    });

    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;

      if (url.origin !== 'http://localhost:31989') {
        return route.abort();
      }
      if (pathname === '/api/admin/auth/me') {
        return route.fulfill({ json: {} });
      }
      if (pathname === '/api/admin/sites') {
        return route.fulfill({ json: { items: [site] } });
      }
      if (pathname === '/api/admin/sites/site-1') {
        return route.fulfill({ json: site });
      }
      if (pathname.endsWith('/pages') || pathname.endsWith('/addons') || pathname.endsWith('/addon-installations')) {
        return route.fulfill({ json: { items: [] } });
      }
      if (pathname === '/api/admin/installation/calibration/runs') {
        return route.fulfill({ json: { items: [] } });
      }
      if (pathname === '/api/admin/installation/resources') {
        return route.fulfill({ status: 503, json: { message: 'Synthetic resource helper unavailable' } });
      }
      if (pathname === '/api/admin/sites/site-1/favicon') {
        return route.fulfill({ json: { favicon: null } });
      }
      if (pathname === '/api/admin/sites/site-1/settings') {
        return route.fulfill({
          json: {
            timeZone: 'UTC',
            siteId: 'site-1',
            addresses: {
              ...(explicitOrigin
                ? { publicOrigin: 'https://example.test', localOrigin: null, originMode: 'Public' }
                : { publicOrigin: null, localOrigin: null }),
            },
          },
        });
      }
      if (pathname.endsWith('/addresses')) {
        return route.fulfill({
          json: {
            ...(explicitOrigin
              ? { publicOrigin: 'https://example.test', localOrigin: null, originMode: 'Public' }
              : { publicOrigin: null, localOrigin: null }),
          },
        });
      }
      if (pathname.endsWith('/publication')) {
        return route.fulfill({ json: { templates: [], pageAvailability: [] } });
      }
      if (pathname.includes('/deployment')) {
        if (route.request().method() === 'POST') {
          const body: Record<string, unknown> = route.request().postDataJSON();

          writes.push({ route: pathname, body });

          if (pathname.endsWith('/check')) {
            return route.fulfill({ json: { diagnostics: [{ issue: 'Backend', retryable: true }] } });
          }
          if (pathname.endsWith('/retry')) {
            state = 'Queued';
          } else {
            target = { ...body, version: 'target-1' };
            state = 'Queued';

            return route.fulfill({ json: target });
          }
        }

        return route.fulfill({ json: status() });
      }
      if (pathname.startsWith('/api/')) {
        throw new Error('Unexpected fixture route: ' + pathname);
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve(adminDist, asset);

      if (!filename.startsWith(adminDist + path.sep)) {
        throw new Error('Unsafe asset path');
      }

      return route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });

    try {
      await page.goto('http://localhost:31989/admin/sites/site-1/settings');
      const { version }: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));

      await page.getByText('CMS Zarya v.' + version, { exact: true }).waitFor();
      const siteLink = page.getByRole('link', { name: 'Test site (opens in a new tab)' });

      await siteLink.waitFor();
      expect(await siteLink.getAttribute('href')).toBe('https://example.test');
      expect(await siteLink.getAttribute('target')).toBe('_blank');
      expect(await siteLink.getAttribute('rel')).toContain('noopener');
      await page.getByRole('button', { name: 'Deployment', exact: true }).click();
      const workspace = page.getByRole('region', { name: 'Site deployment' });
      const actions = workspace.locator('._deployment-actions');

      await actions.waitFor();
      expect((await actions.getByRole('button').allTextContents()).map((text) => text.trim()))
        .toEqual(['Refresh', 'Check', 'Save']);
      const heading = page.locator('.page-workspace:has(> .cms-tabs) > ._workspace-toolbar > h1');

      expect(await heading.count()).toBe(1);
      expect(await heading.innerText()).toBe('Site deployment');
      const selectedSection = page.locator('.site-sections [aria-current="page"]');
      const sectionColor = await selectedSection.evaluate((element) => getComputedStyle(element).backgroundColor);

      expect(sectionColor).not.toBe('rgb(255, 255, 255)');
      expect(await page.locator('.cms-tab').evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).backgroundColor === getComputedStyle(
          document.querySelector('.site-sections [aria-current="page"]')!).backgroundColor))).toBe(true);

      for (const item of [selectedSection, page.locator('.cms-tab[aria-current="page"]')]) {
        expect(await item.evaluate((element) => getComputedStyle(element).borderBottomWidth)).toBe('2px');
      }
      const buildBox = await page.locator('.cms-build-info').boundingBox();
      const languageBox = await page.locator('.cms-header .admin-language').boundingBox();

      expect(languageBox!.x - buildBox!.x - buildBox!.width).toBeLessThanOrEqual(12);

      await workspace.getByLabel('Worker name', { exact: true }).fill('synthetic-site');
      await workspace.getByLabel('Public origin', { exact: true }).fill('https://example.test');
      await workspace.getByLabel('Backend origin', { exact: true }).fill('https://backend.test');
      await workspace.getByLabel('Automatic delivery', { exact: true }).check();
      await page.getByRole('button', { name: 'Main', exact: true }).click();
      expect(await page.locator('div.settings-form button.cms-primary').isDisabled()).toBe(true);
      await page.getByRole('button', { name: 'Deployment', exact: true }).click();
      await workspace.getByRole('button', { name: 'Save', exact: true }).click();
      await workspace.getByText('Settings saved.', { exact: true }).waitFor();
      expect(writes[0]!.body).toMatchObject({
        expectedVersion: null, enabled: true, destinationName: 'synthetic-site',
      });
      await workspace.getByRole('button', { name: 'Check', exact: true }).click();
      await workspace.getByText('Backend unavailable. Check DNS and HTTPS.', { exact: true }).waitFor();
      state = 'Failed';
      await workspace.getByRole('button', { name: 'Refresh', exact: true }).click();
      await workspace.getByRole('button', { name: 'Retry delivery', exact: true }).click();
      await workspace.getByText('Queued', { exact: true }).waitFor();
      expect(writes.at(-1)!.body).toEqual({ expectedVersion: 'delivery-1' });
      state = 'OutcomeUnknown';
      await workspace.getByRole('button', { name: 'Refresh', exact: true }).click();
      await workspace.getByText('Outcome unknown', { exact: true }).waitFor();
      expect(await workspace.getByLabel('Worker name', { exact: true }).isDisabled()).toBe(true);
      expect(await workspace.getByRole('button', { name: 'Retry delivery', exact: true }).count()).toBe(0);
      await workspace.getByText('HTTP 400', { exact: true }).waitFor();
      await workspace.getByText('Public response verification', { exact: true }).waitFor();

      for (const language of ['en', 'ru']) {
        await page.locator('.cms-header .admin-language select').selectOption(language);

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.locator('._deployment-actions').evaluate((element) => {
            const buttons = [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect());

            return element.scrollWidth <= element.clientWidth && buttons.length === 3
              && buttons.every((box) => Math.abs(box.top - buttons[0]!.top) < 1)
              && buttons[0]!.right <= buttons[1]!.left && buttons[1]!.right <= buttons[2]!.left;
          })).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          expect(await page.locator('._header-preferences').evaluate((element) => {
            const version = element.querySelector('.cms-build-info')!.getBoundingClientRect();
            const language = element.querySelector('.admin-language')!.getBoundingClientRect();
            const gap = language.left - version.right;

            return gap >= 6 && gap <= 12 && Math.abs(version.top + version.height / 2
              - language.top - language.height / 2) < 1;
          })).toBe(true);

          if (process.env.ZARYA_TEST_SCREENSHOTS && [390, 1440].includes(width)) {
            await page.screenshot({ path: path.resolve('.tmp/deployment-layout-' + language + '-' + width + '.png') });
          }
        }
      }
      await page.locator('.cms-header .admin-language select').selectOption('en');
      await page.getByRole('button', { name: 'Pages', exact: true }).click();

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(await page.getByText('CMS Zarya v.' + version, { exact: true }).isVisible()).toBe(true);

        const markerWidth = await page.locator('._build-summary').evaluate((element) => {
          const text = document.createRange();

          text.selectNodeContents(element);

          return text.getBoundingClientRect().x - element.getBoundingClientRect().x;
        });

        expect(markerWidth).toBeLessThanOrEqual(1);
        await page.getByText('CMS Zarya v.' + version, { exact: true }).click();
        const details = await page.locator('._build-details').boundingBox();

        expect(details).not.toBeNull();
        expect(details!.x).toBeGreaterThanOrEqual(0);
        expect(details!.x + details!.width).toBeLessThanOrEqual(width);

        await expect.poll(() => page.locator('._build-details').evaluate((element) => {
          const box = element.getBoundingClientRect();

          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.bottom - 4));
        })).toBe(true);

        await expect.poll(() => page.locator('._build-details dt, ._build-details dd').evaluateAll((elements) =>
          elements.every((element) => {
            const box = element.getBoundingClientRect();

            return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
          }))).toBe(true);

        if (process.env.ZARYA_TEST_SCREENSHOTS && [320, 1440].includes(width)) {
          await page.screenshot({ path: path.resolve('.tmp/release-header-' + width + '.png') });
        }
        await page.getByText('CMS Zarya v.' + version, { exact: true }).click();
      }
      expect(errors).toEqual([]);
    } finally {
      await page.close();
      await browser.close();
    }
  });
});
