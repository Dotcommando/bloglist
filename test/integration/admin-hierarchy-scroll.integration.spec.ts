import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, chromium, type Locator } from 'playwright-core';

import { currentAdmin } from '../support/current-admin.js';

enum Hierarchy {
  Pages = 'pages', Templates = 'templates', Chunks = 'chunks', Snippets = 'snippets', Files = 'files', Urls = 'urls',
}

describe('selection preserves the hierarchy scroll position', () => {
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

  it.each(Object.values(Hierarchy).flatMap((section) => [1440, 390].map((width) => ({ section, width }))))(
    'keeps $section stable during selection at $width px', async ({ section, width }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const origin = 'http://localhost:31983';
      const base = '/api/admin/sites/site-1';
      const errors: string[] = [];
      const site = {
        siteId: 'site-1',
        mark: 'Scroll',
        name: 'Scroll site',
        primaryDomain: 'example.test',
        languages: ['en'],
        defaultLanguage: 'en',
        status: 'ACTIVE',
      };
      const children = Array.from({ length: 50 }, (_, index) => ({
        siteId: site.siteId,
        pageId: 'page-' + index,
        mark: 'Page' + index,
        title: 'Page ' + index,
        parentPageId: 'folder',
        pageNumber: String(index + 2),
        sortOrder: index * 100,
        language: 'en',
        status: 'DRAFT',
        contentMd: 'Page content',
        robotsIndex: true,
      }));
      const pages = [{
        ...children[0]!,
        pageId: 'folder',
        mark: 'Folder',
        title: 'Folder',
        parentPageId: null,
        pageNumber: '1',
      }, ...children];
      const elements = Array.from({ length: 50 }, (_, index) => ({
        siteId: site.siteId,
        key: 'Element' + String(index).padStart(2, '0'),
        name: 'Element ' + index,
        kind: section === Hierarchy.Templates ? 'Template' : section === Hierarchy.Chunks ? 'Chunk' : 'Snippet',
        version: 'v1',
        backupState: 'Ready',
        html: '<p>Element</p>',
        css: '',
        browserTypeScript: null,
        parameters: [],
        usages: [],
        snippet: {
          code: 'return "value";', phases: ['Build'], output: { name: 'result', kind: 'String', required: true },
        },
      }));
      const files = Array.from({ length: 50 }, (_, index) => ({
        fileId: 'file-' + index,
        folderId: null,
        name: 'File ' + String(index).padStart(2, '0') + '.csv',
        mimeType: 'text/csv',
        byteSize: 16,
        mode: 'Original',
        hasVariants: false,
        originalDimensions: null,
        outputs: [{
          key: 'original',
          url: '/assets/files/file-' + index + '.csv',
          mimeType: 'text/csv',
          dimensions: null,
        }],
      }));
      const folders = Array.from({ length: 30 }, (_, index) => ({
        folderId: 'folder-' + index, parentId: null, root: 'files', name: 'Folder ' + String(index).padStart(2, '0'),
      }));
      const urls = children.map((item, index) => ({
        version: 'v1',
        url: {
          urlId: 'url-' + index,
          siteId: site.siteId,
          mark: 'Url' + index,
          path: '/catalog/page-' + index + '/',
          segment: 'page-' + index,
          parentUrlId: null,
          kind: 'PAGE',
          pageId: item.pageId,
          redirectTargetUrlId: null,
          redirectStatus: null,
          createdAt: '2026-10-28T00:00:00Z',
          updatedAt: '2026-10-28T00:00:00Z',
        },
      }));
      let release = (): void => {};
      let receive = (): void => {};
      let pausedPath = '';
      let failedPath = '';
      let pending = Promise.resolve();

      page.setDefaultTimeout(5000);
      page.on('pageerror', (error) => errors.push(error.message));

      try {
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          const pathname = url.pathname;

          if (url.origin !== origin) {
            await route.abort();

            return;
          }
          if (pathname === pausedPath) {
            receive();
            await pending;
          }
          if (pathname === failedPath) {
            await route.fulfill({ status: 500, json: { error: 'InternalError' } });

            return;
          }

          let json: unknown;

          if (pathname === '/api/admin/auth/me') {
            json = currentAdmin();
          } else if (pathname === '/api/admin/sites') {
            json = { items: [site] };
          } else if (pathname === base) {
            json = site;
          } else if (pathname.endsWith('/publication')) {
            json = { templates: [], templateId: null, path: null, pageAvailability: [] };
          } else if (pathname === base + '/addons' || pathname === base + '/addon-installations') {
            json = { items: [] };
          } else if (pathname.endsWith('/template-variables')) {
            json = { siteId: site.siteId, version: 'v1', fields: [] };
          } else if (pathname === base + '/pages') {
            json = { items: pages };
          } else if (pathname.startsWith(base + '/pages/')) {
            json = pages.find((item) => pathname.endsWith('/' + item.pageId));
          } else if (pathname === base + '/files') {
            json = { version: 'v1', pending: false, files, folders };
          } else if (pathname.endsWith('/usages')) {
            json = { version: 'v1', usages: [] };
          } else if (pathname === base + '/urls') {
            json = { siteId: site.siteId, urls, pages, published: null };
          } else if (pathname === base + '/settings') {
            json = { siteId: site.siteId, addresses: { publicOrigin: 'http://example.test', localOrigin: null } };
          } else if (pathname.endsWith('/history')) {
            json = { items: [] };
          } else if (
            [Hierarchy.Templates, Hierarchy.Chunks, Hierarchy.Snippets].some((kind) =>
              pathname === base + '/' + kind)
          ) {
            json = { items: elements };
          } else if (
            [Hierarchy.Templates, Hierarchy.Chunks, Hierarchy.Snippets].some((kind) =>
              pathname.startsWith(base + '/' + kind + '/'))
          ) {
            json = elements.find((item) => pathname.endsWith('/' + item.key));
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
              contentType: asset.endsWith('.js')
                ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
            });

            return;
          }
          await route.fulfill({ json });
        });
        await page.goto(origin + '/admin/sites/site-1' + (section === Hierarchy.Pages ? '' : '/' + section));
        const drawer = page.locator(section === Hierarchy.Pages ? '#page-drawer'
          : section === Hierarchy.Files ? '#files-drawer' : section === Hierarchy.Urls ? '#urls-drawer'
            : '#source-list-' + elements[0]!.kind);
        const scroll = drawer.locator('._tree-scroll');
        const workspace = page.locator(section === Hierarchy.Pages ? '#page-workspace'
          : section === Hierarchy.Files ? '#files-workspace' : section === Hierarchy.Urls ? '#urls-workspace'
            : '.site-viewport:not([hidden]) .page-workspace');

        if (section === Hierarchy.Pages) {
          await drawer.locator('[data-page-id="folder"] [data-tree-toggle]').click();
        }

        for (const index of [20, 21]) {
          const key = 'Element' + String(index).padStart(2, '0');
          const target: Locator = section === Hierarchy.Pages ? drawer.locator('[data-page-id="page-' + index + '"]')
            : section === Hierarchy.Urls ? drawer.locator('[data-url-path="/catalog/page-' + index + '/"]')
              : drawer.getByRole('button', {
                name: section === Hierarchy.Files
                  ? files[index]!.name : elements[index]!.name,
                exact: true,
              });

          await target.scrollIntoViewIfNeeded();
          const before = await scroll.evaluate((element) => element.scrollTop);

          expect(before).toBeGreaterThan(0);
          let received = Promise.resolve();

          pending = new Promise<void>((resolve) => {
            release = resolve;
          });
          received = new Promise<void>((resolve) => {
            receive = resolve;
          });
          pausedPath = base + (section === Hierarchy.Pages ? '/pages/page-' + index
            : section === Hierarchy.Files ? '/files/file-' + index + '/usages'
              : section === Hierarchy.Urls ? '/urls/url-' + index + '/history' : '/' + section + '/' + key);
          const response = page.waitForResponse((response) => new URL(response.url()).pathname === pausedPath);

          await target.click();
          await received;
          expect(await scroll.evaluate((element) => element.scrollTop)).toBe(before);
          release();
          await (await response).finished();

          if (section === Hierarchy.Pages) {
            await expect.poll(() => page.locator('#page-title').inputValue()).toBe('Page ' + index);
            expect(await drawer.locator('[data-page-id="folder"]').getAttribute('aria-expanded')).toBe('true');
          } else if (![Hierarchy.Files, Hierarchy.Urls].includes(section)) {
            await expect.poll(() => workspace.locator('input[id$="-name"]').inputValue())
              .toBe(elements[index]!.name);
          } else if (section === Hierarchy.Files) {
            await workspace.getByRole('heading', { name: 'Rename file: ' + files[index]!.name, exact: true }).waitFor();
          } else {
            await workspace.getByText('No previous behavior recorded.', { exact: true }).waitFor();
          }
          if (width < 992) {
            await workspace.locator('button.cms-circle').first().click();
          }
          expect(await scroll.evaluate((element) => element.scrollTop)).toBe(before);
        }

        if (section === Hierarchy.Pages) {
          const target = drawer.locator('[data-page-id="page-22"]');

          await target.scrollIntoViewIfNeeded();
          const before = await scroll.evaluate((element) => element.scrollTop);

          failedPath = base + '/pages/page-22';
          await target.click();
          await workspace.getByRole('alert').waitFor();
          expect(await scroll.evaluate((element) => element.scrollTop)).toBe(before);
          failedPath = '';
          await workspace.getByRole('button', { name: 'Refresh', exact: true }).click();
          await expect.poll(() => page.locator('#page-title').inputValue()).toBe('Page 22');

          if (width < 992) {
            await workspace.locator('button.cms-circle').first().click();
          }
          expect(await scroll.evaluate((element) => element.scrollTop)).toBe(before);
        } else if (section === Hierarchy.Files) {
          const folder = drawer.getByRole('button', { name: 'Folder 20', exact: true });

          await folder.scrollIntoViewIfNeeded();
          const before = await scroll.evaluate((element) => element.scrollTop);

          await folder.click();
          await workspace.locator('.folder-contents').waitFor();

          if (width < 992) {
            await workspace.locator('button.cms-circle').first().click();
          }
          expect(await scroll.evaluate((element) => element.scrollTop)).toBe(before);
        }

        const beforeSectionChange = await scroll.evaluate((element) => element.scrollTop);
        const otherSection = section === Hierarchy.Pages ? 'URLs' : 'Pages';

        await page.getByRole('button', { name: otherSection, exact: true }).click();
        await page.locator(section === Hierarchy.Pages ? '#urls-drawer nav' : '#page-drawer .page-tree').waitFor();
        const label = section === Hierarchy.Pages ? 'Pages' : section === Hierarchy.Urls ? 'URLs'
          : section[0]!.toUpperCase() + section.slice(1);

        await page.getByRole('button', { name: label, exact: true }).click();

        if (width < 992 && await workspace.getAttribute('aria-hidden') === 'false') {
          await workspace.locator('button.cms-circle').first().click();
        }
        await expect.poll(() => drawer.locator('[role="treeitem"]:disabled, ._source-item:disabled, '
          + '._file-tree-item:disabled, ._url-tree-select:disabled').count()).toBe(0);
        expect(await scroll.evaluate((element) => element.scrollTop)).toBe(beforeSectionChange);
        expect(errors).toEqual([]);
      } finally {
        release();
        await context.close();
      }
    });
});
