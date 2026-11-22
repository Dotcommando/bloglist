import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { currentAdmin } from '../support/current-admin.js';

describe('document editing in the built administration', () => {
  it('keeps sitemap read-only, shows raw MIME editing and preserves the first home suggestion', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const failures: string[] = [];

    page.on('pageerror', (error) => failures.push(error.message));
    page.setDefaultTimeout(5000);
    const site = {
      siteId: 'site-1',
      mark: 'Mime',
      name: 'Documents',
      primaryDomain: 'example.test',
      languages: ['en'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    const records = [
      {
        pageId: 'sitemap', systemDocument: 'Sitemap', title: 'sitemap.xml', mimeType: 'application/xml', sortOrder: 100,
      },
      { pageId: 'robots', systemDocument: 'Robots', title: 'robots.txt', mimeType: 'text/plain', sortOrder: 200 },
      { pageId: 'llms', systemDocument: 'Llms', title: 'llms.txt', mimeType: 'text/plain', sortOrder: 300 },
    ].map((item, index) => ({
      ...item,
      pageNumber: String(index + 1),
      siteId: site.siteId,
      mark: item.pageId,
      parentPageId: null,
      language: 'en',
      status: 'PUBLISHED',
      contentMd: '',
    }));
    let sitemapXml = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
      + '<url><loc>https://example.test/a&amp;b/</loc></url></urlset>';
    let saved: Record<string, unknown> | null = null;
    let savedRecord: Record<string, unknown> | null = null;

    try {
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const pathname = url.pathname;

        if (url.origin !== 'http://localhost:31989') {
          await route.abort();

          return;
        }
        if (pathname === '/api/admin/auth/me') {
          await route.fulfill({ json: currentAdmin() });
        } else if (pathname === '/api/admin/sites') {
          await route.fulfill({ json: { items: [site] } });
        } else if (pathname === '/api/admin/sites/site-1') {
          await route.fulfill({ json: site });
        } else if (pathname === '/api/admin/sites/site-1/pages') {
          if (route.request().method() === 'POST') {
            saved = route.request().postDataJSON();
            savedRecord = {
              ...saved,
              siteId: site.siteId,
              pageId: 'newpage',
              pageNumber: '4',
              parentPageId: null,
              sortOrder: 400,
              status: 'DRAFT',
            };
            await route.fulfill({ json: savedRecord });
          } else {
            await route.fulfill({ json: { items: [...records, ...(savedRecord ? [savedRecord] : [])] } });
          }
        } else if (pathname.endsWith('/publication')) {
          const selected = records.find((item) => pathname.includes('/pages/' + item.pageId + '/'));

          await route.fulfill({
            json: {
              templates: [{ templateId: 'ZaryaBasic', name: 'Basic', requiresParameters: false }],
              templateId: null,
              path: selected ? '/' + selected.title : null,
              mimeTypes: ['text/html', 'text/plain', 'application/xml', 'application/json'],
              generatedContent: sitemapXml,
              crawlerDiagnostics: selected ? [{
                pageId: selected.pageId,
                path: '/' + selected.title,
                inSitemap: false,
                reason: 'SystemDocument',
                robotsAvailable: true,
                blockedBy: [],
              }] : [],
              pageAvailability: records.map((item) => ({
                pageId: item.pageId, assignedPath: '/' + item.title, publicPath: '/' + item.title,
              })),
            },
          });
        } else if ((pathname.endsWith('/addons') || pathname.endsWith('/addon-installations'))) {
          await route.fulfill({ json: { items: [] } });
        } else if (pathname.endsWith('/settings')) {
          await route.fulfill({
            json: {
              siteId: site.siteId,
              timeZone: 'UTC',
              addresses: { publicOrigin: 'https://example.test', localOrigin: 'http://localhost:31989' },
            },
          });
        } else if (pathname.endsWith('/files')) {
          await route.fulfill({ json: { version: 'v1', pending: false, files: [], folders: [] } });
        } else if (pathname.endsWith('/template-variables')) {
          await route.fulfill({ json: { siteId: site.siteId, version: 'v1', fields: [] } });
        } else if (pathname.startsWith('/api/admin/sites/site-1/pages/')) {
          const record = pathname.endsWith('/newpage') ? savedRecord
            : records.find((item) => pathname.endsWith('/' + item.pageId));

          await route.fulfill({ json: record });
        } else if (pathname.startsWith('/api/')) {
          throw new Error('Unexpected fixture request: ' + pathname);
        } else {
          const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
          const filename = path.resolve('admin/dist', asset);

          if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
            throw new Error('Unsafe fixture asset');
          }
          await route.fulfill({
            body: await readFile(filename),
            contentType: asset.endsWith('.js') ? 'text/javascript'
              : asset.endsWith('.css') ? 'text/css' : 'text/html',
          });
        }
      });
      await page.goto('http://localhost:31989/admin/sites/site-1/pages/sitemap');
      await page.locator('#page-content').waitFor();
      await page.locator('#page-content a').waitFor();
      expect(await page.locator('#page-content textarea').count()).toBe(0);
      expect(await page.locator('#page-content a').textContent()).toBe('https://example.test/a&b/');
      expect(await page.locator('#page-content a').getAttribute('href')).toBe('https://example.test/a&b/');

      for (const width of [320, 390, 576, 768, 992, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.locator('#page-content').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '.tmp/sitemap-admin-desktop.png' });
      sitemapXml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + Array.from({ length: 101 }, (_, index) => '<url><loc>https://example.test/' + index + '/</loc></url>').join('')
        + '</urlset>';
      await page.reload();
      await page.getByRole('button', { name: 'Show more URLs', exact: true }).waitFor();
      expect(await page.locator('#page-content a').count()).toBe(100);
      await page.getByRole('button', { name: 'Show more URLs', exact: true }).click();
      expect(await page.locator('#page-content a').count()).toBe(101);
      sitemapXml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + '<url><loc>javascript:alert(1)</loc></url></urlset>';
      await page.reload();
      await page.locator('#page-content [role="alert"]').waitFor();
      expect(await page.locator('#page-content a').count()).toBe(0);
      sitemapXml = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>';
      await page.reload();
      await page.getByText('No published URLs in this sitemap yet.', { exact: true }).waitFor();
      sitemapXml = '<urlset><url><loc>javascript:alert(1)</loc></url>';
      await page.reload();
      await page.locator('#page-content [role="alert"]').waitFor();
      expect(await page.locator('#page-content a').count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Save draft', exact: true }).isDisabled()).toBe(true);
      expect(await page.locator('#page-mime').isDisabled()).toBe(true);
      expect(await page.locator('#page-template').count()).toBe(0);

      const hideSystem = page.getByRole('checkbox', { name: 'Hide system pages', exact: true });

      expect(await hideSystem.isChecked()).toBe(false);
      expect(await page.getByRole('treeitem').count()).toBe(3);
      await hideSystem.check();
      expect(await page.getByRole('treeitem').count()).toBe(0);
      expect(await page.locator('#page-content [role="alert"]').count()).toBe(1);
      await page.reload();
      await page.locator('#page-content').waitFor();
      expect(await hideSystem.isChecked()).toBe(true);
      expect(await page.getByRole('treeitem').count()).toBe(0);
      await hideSystem.uncheck();
      expect(await page.getByRole('treeitem').count()).toBe(3);

      await page.goto('http://localhost:31989/admin/sites/site-1/pages/robots');
      await page.locator('#page-content').waitFor();
      expect(await page.locator('#page-content').isEditable()).toBe(true);
      expect(await page.locator('#page-template').count()).toBe(0);
      await page.waitForFunction(() => document.querySelector<HTMLSelectElement>('#page-mime')?.value === 'text/plain');
      await page.screenshot({ path: '.tmp/document-robots-desktop.png' });

      await page.goto('http://localhost:31989/admin/sites/site-1/pages/llms');
      await page.locator('#page-title').waitFor();
      await page.getByText('Sitemap: Excluded: system document', { exact: true }).waitFor();
      const titleGap = await page.evaluate(() => {
        const heading = document.querySelector('#page-editor-title')!.getBoundingClientRect();
        const field = document.querySelector('label[for="page-title"]')!.getBoundingClientRect();

        return field.top - heading.bottom;
      });

      expect(titleGap).toBeGreaterThan(0);
      await page.getByText('Checked against the robots.txt file currently active on the site.', { exact: true })
        .waitFor();

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const notes = page.locator('._page-status-area');

        await expect.poll(async () => {
          const box = await notes.boundingBox();

          return Boolean(box && box.x >= 0 && box.x + box.width <= width);
        }).toBe(true);
        const statuses = notes.locator('._page-status-item');

        expect(await statuses.count()).toBe(4);
        expect(await statuses.nth(2).innerText()).toContain('Excluded: system document');
        expect(await statuses.nth(3).innerText()).toContain('Crawler access:');
      }
      await page.locator('.admin-language select').selectOption('ru');
      await page.getByText('Проверено по файлу robots.txt, который сейчас действует на сайте.', { exact: true })
        .waitFor();
      await page.locator('#page-editor-title').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '.tmp/document-notes-desktop.png' });
      await page.setViewportSize({ width: 390, height: 900 });
      await expect.poll(async () => {
        const box = await page.locator('._page-status-area').boundingBox();

        return Boolean(box && box.x >= 0 && box.x + box.width <= 390);
      }).toBe(true);
      await page.screenshot({ path: '.tmp/document-notes-mobile.png' });
      await page.locator('.admin-language select').selectOption('en');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('http://localhost:31989/admin/sites/site-1/pages/new');
      await page.locator('#page-title').waitFor();
      expect(await page.locator('#page-title').inputValue()).toBe('Home');
      expect(await page.locator('#page-path').inputValue()).toBe('/');
      expect(await page.locator('#page-mark').inputValue()).toBe('index');
      await page.locator('#page-path').fill('/games/seksualnost-energiya-zhizni/');
      await expect.poll(() => page.locator('#page-mark').inputValue()).toBe('SeksualnostEnergiyaZhizni');
      await page.locator('#page-mark').fill('MyChosenKey');
      await page.locator('#page-path').fill('/another-page/');
      expect(await page.locator('#page-mark').inputValue()).toBe('MyChosenKey');
      expect(await page.locator('#page-order').getAttribute('placeholder')).toBe('400');
      await page.locator('#page-mime').selectOption('custom');
      await page.locator('#page-custom-mime').fill('application/vnd.example+json');
      await page.locator('#page-content').fill('{"literal":"[[*title]]"}');
      expect(await page.locator('#page-template').count()).toBe(0);
      await page.getByText('Additional search settings', { exact: true }).click();
      await page.getByRole('checkbox', { name: 'Exclude from sitemap' }).check();

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('#page-custom-mime').isVisible()).toBe(true);
      }
      await page.setViewportSize({ width: 390, height: 900 });
      await page.locator('#page-custom-mime').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '.tmp/document-mime-mobile.png' });
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.cms-success') !== null);
      expect(saved).toMatchObject({
        mimeType: 'application/vnd.example+json',
        mark: 'MyChosenKey',
        excludeFromSitemap: true,
        contentMd: '{"literal":"[[*title]]"}',
      });
      await page.goto('http://localhost:31989/admin/sites/site-1/pages/new');
      await page.locator('#page-mark').waitFor();
      expect(await page.locator('#page-mark').inputValue()).toMatch(/^Page[a-f0-9]{8}$/);
      await page.locator('#page-title').fill('Другая игра');
      await expect.poll(() => page.locator('#page-mark').inputValue()).toBe('DrugayaIgra');
      expect(failures).toEqual([]);
    } finally {
      await context.close();
      await browser.close();
    }
  });
});
