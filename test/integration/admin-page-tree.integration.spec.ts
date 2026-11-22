import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, chromium } from 'playwright-core';
import sharp from 'sharp';

import { verifyScrollShadow } from '../support/admin-scroll.js';

describe('built page tree', () => {
  let browser: Browser;

  beforeAll(async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }
    browser = await chromium.launch({ executablePath, headless: true });
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('collapses folders, sorts siblings, drags into and out of folders and preserves unsaved editor text', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(5000);
    const site = {
      siteId: 'site-1',
      mark: 'Tree',
      name: 'Tree site',
      primaryDomain: 'example.test',
      languages: ['en'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    const make = (pageId: string, pageNumber: string, title: string, parentPageId: string | null,
      sortOrder: number): Record<string, unknown> => ({
      pageId,
      pageNumber,
      siteId: 'site-1',
      title,
      mark: pageId,
      parentPageId,
      sortOrder,
      language: 'en',
      status: 'DRAFT',
      contentMd: 'Original',
    });
    const records: Record<string, unknown>[] = [make('child', '3', 'Child', 'folder', 100),
      make('last', '4', 'Last', null, 300), make('folder', '2', 'Folder', null, 200),
      make('first', '1', 'robots.txt', null, 100),
      ...['Sitemap', 'Robots', 'Llms'].map((role, index) => ({
        ...make('system' + role, String(index + 11), role, null, index + 1),
        systemDocument: role,
      }))];
    const moves: unknown[] = [];
    let failMove = false;

    try {
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;

        if (url.origin !== 'http://localhost:31989') {
          await route.abort();

          return;
        }
        if (pathname === '/api/admin/auth/me') {
          await route.fulfill({ json: { user: { authorization: { systemAdmin: true, siteAdminSiteIds: [] } } } });
        } else if (pathname === '/api/admin/sites') {
          await route.fulfill({ json: { items: [site] } });
        } else if (pathname === '/api/admin/sites/site-1') {
          await route.fulfill({ json: site });
        } else if (pathname === '/api/admin/sites/site-1/pages') {
          await route.fulfill({ json: { items: records } });
        } else if (pathname.endsWith('/publication')) {
          await route.fulfill({ json: { templates: [], templateId: null, path: '/unchanged', pageAvailability: [] } });
        } else if (pathname.endsWith('/position')) {
          const body: Record<string, unknown> = request.postDataJSON();

          moves.push(body);

          if (failMove) {
            await route.fulfill({ status: 409, json: { error: 'Conflict' } });
          } else {
            const record = records.find((record) => pathname.endsWith('/' + record.pageId + '/position'))!;

            expect(record.parentPageId).toBe(body.expectedParentPageId);
            expect(record.sortOrder).toBe(body.expectedSortOrder);
            record.parentPageId = body.parentPageId;
            await route.fulfill({ json: record });
          }
        } else if (pathname.startsWith('/api/admin/sites/site-1/pages/')) {
          const record = records.find((record) => pathname.endsWith('/' + record.pageId));

          await route.fulfill({ json: record });
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
        } else if (pathname.endsWith('/template-variables')) {
          await route.fulfill({ json: { siteId: site.siteId, version: 'v1', fields: [] } });
        } else if (pathname.endsWith('/files')) {
          await route.fulfill({ json: { version: 'v1', pending: false, files: [], folders: [] } });
        } else if (pathname.startsWith('/api/')) {
          throw new Error('Unexpected fixture API: ' + pathname);
        } else {
          const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
          const filename = path.resolve('admin/dist', asset);

          if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
            throw new Error('Unsafe fixture asset');
          }
          await route.fulfill({
            body: await readFile(filename),
            contentType: asset.endsWith('.js')
              ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
          });
        }
      });
      await page.goto('http://localhost:31989/admin/sites/site-1');
      await page.getByRole('tree').waitFor();
      const tree = page.getByRole('tree');
      const hideSystem = page.getByRole('checkbox', { name: 'Hide system pages', exact: true });

      expect(await hideSystem.isChecked()).toBe(false);
      expect(await tree.getByRole('treeitem').count()).toBe(6);
      await tree.locator('[data-page-id="systemSitemap"]').focus();
      await hideSystem.check();
      expect(await tree.getByRole('treeitem').count()).toBe(3);
      await hideSystem.press('Tab');
      expect(await tree.locator('[data-page-id="first"]').evaluate((element) => element === document.activeElement))
        .toBe(true);
      await page.setViewportSize({ width: 1440, height: 420 });
      const headerY = (await hideSystem.boundingBox())!.y;

      await verifyScrollShadow(page.locator('#page-drawer ._tree-scroll'),
        page.locator('#page-drawer ._drawer-heading'));
      expect((await hideSystem.boundingBox())!.y).toBe(headerY);
      await page.setViewportSize({ width: 1440, height: 900 });
      const folder = tree.locator('[data-page-id="folder"]');
      const child = tree.locator('[data-page-id="child"]');
      const verifyDisclosureCenter = async (): Promise<void> => {
        const screenshot = await folder.locator('[data-tree-toggle]').screenshot({
          path: '.tmp/tree-disclosure-center.png',
        });
        const { data, info } = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const ink: { x: number; y: number }[] = [];

        // Exclude the selected row's border and rounded corners from the icon measurement.
        for (let y = 4; y < info.height - 4; y++) {
          for (let x = 4; x < info.width - 4; x++) {
            const offset = (y * info.width + x) * info.channels;

            if (data[offset]! < 130 && data[offset + 1]! < 150 && data[offset + 2]! < 130) {
              ink.push({ x, y });
            }
          }
        }
        expect(ink.length).toBeGreaterThan(0);
        const centerX = (Math.min(...ink.map((pixel) => pixel.x)) + Math.max(...ink.map((pixel) => pixel.x)) + 1) / 2;
        const centerY = (Math.min(...ink.map((pixel) => pixel.y)) + Math.max(...ink.map((pixel) => pixel.y)) + 1) / 2;

        expect(Math.abs(centerX - info.width / 2)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(centerY - info.height / 2)).toBeLessThanOrEqual(0.5);
      };

      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await verifyDisclosureCenter();
      }

      expect(await tree.getByRole('treeitem').allTextContents()).toEqual([
        expect.stringContaining('robots.txt'), expect.stringContaining('Folder'), expect.stringContaining('Last'),
      ]);
      expect(await folder.getAttribute('aria-expanded')).toBe('false');
      expect(await child.count()).toBe(0);
      await folder.click();
      await expect.poll(() => folder.getAttribute('aria-selected')).toBe('true');
      const contents = page.locator('#page-workspace .folder-contents');

      await contents.getByRole('heading', { name: 'Folder contents', exact: true }).waitFor();
      expect(await contents.innerText()).toContain('Direct child pages: 1');
      expect(await contents.getByRole('link', { name: 'Child', exact: true }).getAttribute('href'))
        .toBe('/admin/sites/site-1/pages/child');
      await contents.getByRole('link', { name: 'Child', exact: true }).click();
      await page.locator('#page-title').waitFor();
      await expect.poll(() => page.locator('#page-title').inputValue()).toBe('Child');
      await folder.click();
      await contents.getByRole('heading', { name: 'Folder contents', exact: true }).waitFor();
      expect(await folder.getAttribute('aria-expanded')).toBe('true');
      await folder.locator('[data-tree-toggle]').click();
      expect(await folder.getAttribute('aria-expanded')).toBe('false');
      await folder.locator('[data-tree-toggle]').click();
      await child.waitFor();
      await verifyDisclosureCenter();
      expect(await folder.getAttribute('aria-selected')).toBe('true');
      await folder.press('ArrowLeft');
      expect(await child.count()).toBe(0);
      await folder.press('ArrowRight');
      await child.waitFor();
      expect(await child.getAttribute('aria-level')).toBe('2');
      await child.click();
      await page.locator('#page-title').waitFor();
      await verifyScrollShadow(page.locator('#page-workspace ._workspace-scroll'),
        page.locator('#page-workspace .page-editor-controls'));
      expect(await page.locator('#page-number').inputValue()).toBe('3');
      expect(await page.locator('#page-number').getAttribute('readonly')).not.toBeNull();
      expect(await page.locator('#page-order').inputValue()).toBe('100');
      expect(await page.locator('#content-hint').textContent()).toContain('[[~12]]');
      await page.locator('#page-content').fill('Unsaved content');
      await tree.locator('[data-tree-drag="child"]').dragTo(page.locator('._tree-root'));
      await page.getByRole('status').filter({ hasText: 'Page moved' }).waitFor();
      expect(records[0]?.parentPageId).toBeNull();
      expect(records[0]?.sortOrder).toBe(100);
      expect(await child.getAttribute('aria-level')).toBe('1');
      expect(await page.locator('#page-content').inputValue()).toBe('Unsaved content');
      expect(await page.locator('#page-path').inputValue()).toBe('/unchanged');
      await tree.locator('[data-tree-drag="child"]').dragTo(tree.locator('[data-tree-drag="last"]'));
      await child.waitFor();
      await page.waitForFunction(() => document.querySelector('[data-page-id="child"]')
        ?.getAttribute('aria-level') === '2');
      expect(records[0]?.parentPageId).toBe('last');
      expect(moves).toHaveLength(2);
      failMove = true;
      await tree.locator('[data-tree-drag="child"]').dragTo(page.locator('._tree-root'));
      await page.getByRole('alert').waitFor();
      expect(await child.getAttribute('aria-level')).toBe('2');
      expect(await page.locator('#page-content').inputValue()).toBe('Unsaved content');
      expect(errors).toEqual([]);

      for (const width of [320, 390, 768, 992, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});
