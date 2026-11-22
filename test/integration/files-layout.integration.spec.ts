import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, chromium, type Page } from 'playwright-core';

describe('built Files controls', () => {
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

  async function openFiles(page: Page, nested = false, responsive = false, documents = false): Promise<void> {
    const site = {
      siteId: 'site-1',
      mark: 'Example',
      name: 'Example',
      primaryDomain: 'example.test',
      languages: ['en'],
      defaultLanguage: 'en',
      status: 'ACTIVE',
    };
    const dimensions = { width: 24, height: 16, aspectRatio: 1.5 };

    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());

      if (url.origin !== 'http://localhost:31987') {
        await route.abort();

        return;
      }
      if (url.pathname === '/api/admin/auth/me') {
        await route.fulfill({ json: { user: { authorization: { systemAdmin: true, siteAdminSiteIds: [] } } } });
      } else if (url.pathname === '/api/admin/sites') {
        await route.fulfill({ json: { items: [site] } });
      } else if (url.pathname === '/api/admin/sites/site-1/pages') {
        await route.fulfill({
          json: {
            items: [{
              pageId: 'page-1',
              siteId: 'site-1',
              mark: 'Home',
              language: 'en',
              title: 'Home',
              contentMd: '',
              status: 'DRAFT',
            }],
          },
        });
      } else if (url.pathname === '/api/admin/sites/site-1/files') {
        await route.fulfill({
          json: {
            version: 'v1',
            pending: false,
            folders: nested ? [{ folderId: 'folder-1', parentId: null, name: 'Photos' }] : [],
            files: [{
              fileId: 'image',
              folderId: nested ? 'folder-1' : null,
              name: 'Screenshot 2024-09-18 202105.png',
              mode: responsive ? 'Responsive' : 'Original',
              mimeType: 'image/png',
              byteSize: 100,
              hasVariants: responsive,
              originalDimensions: dimensions,
              outputs: [
                ...(responsive ? [{
                  key: 'w12',
                  url: '/media/images/image--w12.webp',
                  mimeType: 'image/webp',
                  dimensions: { width: 12, height: 8, aspectRatio: 1.5 },
                }] : []),
                { key: 'file', url: '/media/images/image.png', mimeType: 'image/png', dimensions },
              ],
            }, ...(documents ? [
              ['report.pdf', 'application/pdf'],
              ['letter.doc', 'application/msword'],
              ['letter.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
              ['table.xls', 'application/vnd.ms-excel'],
              ['table.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
              ['table.csv', 'text/csv'],
              ['data.json', 'application/json'],
            ].map(([name, mimeType], index) => ({
              fileId: 'document-' + index,
              name,
              mimeType,
              folderId: null,
              mode: 'Original',
              byteSize: 100,
              hasVariants: false,
              originalDimensions: null,
              outputs: [{ key: 'file', url: '/assets/files/' + name, mimeType, dimensions: null }],
            })) : [])],
          },
        });
      } else if (url.pathname.startsWith('/api/admin/sites/site-1/files/') && url.pathname.endsWith('/usages')) {
        await route.fulfill({ json: { version: 'v1', usages: [] } });
      } else if (url.pathname === '/api/admin/sites/site-1/files/image/content') {
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"/>',
        });
      } else if (url.pathname.endsWith('/publication')) {
        await route.fulfill({ json: { templates: [], pageAvailability: [] } });
      } else if ((url.pathname.endsWith('/addons') || url.pathname.endsWith('/addon-installations'))) {
        await route.fulfill({ json: { items: [] } });
      } else if (url.pathname.endsWith('/settings')) {
        await route.fulfill({ json: { timeZone: 'UTC' } });
      } else if (url.pathname.startsWith('/api/')) {
        throw new Error('Unexpected Files layout request: ' + url.pathname);
      } else {
        const asset = url.pathname.startsWith('/admin/assets/')
          ? url.pathname.slice('/admin/'.length) : 'index.html';

        await route.fulfill({
          body: await readFile(path.resolve('admin/dist', asset)),
          contentType: asset.endsWith('.js') ? 'text/javascript'
            : asset.endsWith('.css') ? 'text/css' : 'text/html',
        });
      }
    });
    await page.goto('http://localhost:31987/admin/sites/site-1/files');

    if (nested) {
      await page.locator('[data-folder-toggle="folder-1"]').click();
    }
    await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).waitFor();
  }

  it('shows a select arrow and aligns Cancel with the select across supported widths', async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    try {
      await openFiles(page);
      await page.locator('.file-upload input[type=file]').setInputFiles({
        name: 'Screenshot 2024-09-18 202105.png',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"/>'),
      });
      const select = page.locator('._file-upload-row select');
      const cancel = page.locator('._file-upload-row').getByRole('button', { name: 'Cancel', exact: true });

      expect(await select.evaluate((element) => getComputedStyle(element).backgroundImage)).not.toBe('none');

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 960 });

        if (width === 320) {
          await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
        }

        const fieldBox = await select.boundingBox();
        const buttonBox = await cancel.boundingBox();

        if (!fieldBox || !buttonBox) {
          throw new Error('Missing upload controls');
        }
        expect(Math.abs(fieldBox.y + fieldBox.height - buttonBox.y - buttonBox.height)).toBeLessThanOrEqual(1);
        expect(buttonBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width);
        expect(await select.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingRight)))
          .toBeGreaterThanOrEqual(40);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        if (width === 320 || width === 1440) {
          await mkdir('.tmp', { recursive: true });
          await page.screenshot({ path: path.resolve('.tmp/files-controls-' + width + '.png'), fullPage: true });
        }
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await select.focus();
      expect(await select.evaluate((element) => document.activeElement === element)).toBe(true);
      await select.selectOption('Original');
      expect(await select.inputValue()).toBe('Original');
      await cancel.click();
      expect(await page.locator('._file-upload-row').count()).toBe(0);
    } finally {
      await context.close();
    }
  });

  it('gives unselected file rows the same filled background as page rows', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();

    try {
      await openFiles(page);
      const file = page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true });
      const fileColor = await file.evaluate((element) => getComputedStyle(element).backgroundColor);
      const pageColor = await page.locator('._tree-page').first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);

      expect(await file.getAttribute('aria-current')).toBeNull();
      expect(fileColor).toBe(pageColor);
      expect((await file.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    } finally {
      await context.close();
    }
  });

  it('groups documents under assets/files and gives every supported type its own icon', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
      await openFiles(page, false, false, true);
      const tree = page.getByRole('navigation', { name: 'File tree', exact: true });

      expect(await tree.getByRole('button', { name: 'assets/images', exact: true }).count()).toBe(1);
      expect(await tree.getByRole('button', { name: 'assets/files', exact: true }).count()).toBe(1);
      const imageRow = await tree.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true })
        .boundingBox();
      const filesRoot = await tree.getByRole('button', { name: 'assets/files', exact: true }).boundingBox();

      expect(filesRoot!.y - imageRow!.y - imageRow!.height).toBeGreaterThanOrEqual(8);
      const icons = await tree.locator('[data-file-icon]').evaluateAll((items) => items.map((item) =>
        item.getAttribute('data-file-icon')));

      expect(icons.sort()).toEqual(['image', 'pdf', 'word', 'word', 'excel', 'excel', 'csv', 'json'].sort());
      await tree.getByRole('button', { name: 'data.json', exact: true }).click();
      expect(await page.getByRole('heading', { name: 'Public file URL', exact: true }).count()).toBe(1);
      expect(await page.getByRole('button', { name: 'Copy img', exact: true }).count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Copy URL', exact: true }).isEnabled()).toBe(true);
      await tree.getByRole('button', { name: 'assets/files', exact: true }).click();
      expect(await page.locator('.file-upload input[type=file]').getAttribute('accept')).toContain('.json');
      await page.locator('.file-upload input[type=file]').setInputFiles({
        name: 'another.json', mimeType: 'application/json', buffer: Buffer.from('{}'),
      });
      expect(await page.locator('._file-upload-row select').count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Upload files', exact: true }).isEnabled()).toBe(true);
      await tree.getByRole('button', { name: 'assets/images', exact: true }).click();
      expect(await page.locator('._file-upload-row').count()).toBe(0);
      await tree.getByRole('button', { name: 'assets/files', exact: true }).click();
      expect(await page.locator('._file-upload-row').innerText()).toContain('another.json');
      await page.screenshot({ path: path.resolve('.tmp/files-two-roots.png') });
    } finally {
      await context.close();
    }
  });

  it('shows the actual size of every image variant with localized binary units', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors: string[] = [];
    const sizes = [512, 10240, 10752, 1048576, Math.floor(10.05 * 1048576), Math.ceil(10.06 * 1048576)];

    page.on('pageerror', (error) => errors.push(error.message));

    try {
      await openFiles(page, false, true);
      await page.route('**/api/admin/sites/site-1/files', (route) => route.fulfill({
        json: {
          version: 'v2',
          pending: false,
          folders: [],
          files: [{
            fileId: 'image',
            folderId: null,
            name: 'sizes.png',
            mode: 'Responsive',
            hasVariants: true,
            mimeType: 'image/png',
            byteSize: 1536,
            originalDimensions: { width: 1440, height: 960, aspectRatio: 1.5 },
            outputs: sizes.map((byteSize, index) => ({
              key: 'w' + index,
              url: '/media/images/image--w' + index + '.webp',
              mimeType: 'image/webp',
              dimensions: { width: 320 + index * 100, height: 200, aspectRatio: (320 + index * 100) / 200 },
              byteSize,
            })),
          }],
        },
      }));
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.getByRole('button', { name: 'sizes.png', exact: true }).click();

      for (const language of ['en', 'ru']) {
        await page.locator('.admin-language select').selectOption(language);
        const expected = language === 'ru'
          ? ['0,5 КиБ', '10 КиБ', '11 КиБ', '1 МиБ', '10 МиБ', '10,1 МиБ']
          : ['0.5 KiB', '10 KiB', '11 KiB', '1 MiB', '10 MiB', '10.1 MiB'];

        for (const width of [320, 375, 768, 1440]) {
          await page.setViewportSize({ width, height: 960 });
          const rows = page.locator('.file-variants li');

          expect(await rows.count()).toBe(sizes.length);

          for (const [index, size] of expected.entries()) {
            expect(await rows.nth(index).innerText()).toContain(' · ' + size);
          }
          expect(await page.locator('._file-metadata').innerText())
            .toContain(language === 'ru' ? '1,5 КиБ' : '1.5 KiB');
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
      }
      await page.locator('.file-variants').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '.tmp/file-variant-sizes.png' });
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('offers responsive copying with visible sizes validation and copies both HTML forms', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();

    try {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: async (value: string) => {
              document.documentElement.dataset.clipboard = value;
            },
          },
        });
      });
      await openFiles(page, false, true);
      await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).click();
      const img = page.getByRole('button', { name: 'Copy img', exact: true });
      const picture = page.getByRole('button', { name: 'Copy picture', exact: true });
      const sizes = page.getByLabel('sizes', { exact: true });

      expect(await sizes.inputValue()).toBe('24px');
      expect(await page.getByRole('button', { name: '24px', exact: true }).getAttribute('aria-pressed')).toBe('true');
      await page.getByRole('button', { name: '12px', exact: true }).click();
      expect(await sizes.inputValue()).toBe('12px');
      expect(await page.getByRole('button', { name: '24px', exact: true }).getAttribute('aria-pressed')).toBe('false');
      expect(await img.isEnabled()).toBe(true);
      expect(await picture.isEnabled()).toBe(true);
      expect(await img.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
      await img.click();
      expect(await page.locator('.file-code textarea').inputValue()).toContain('sizes="12px"');
      await sizes.fill('');
      await picture.click();
      await page.getByText('Enter sizes to copy responsive image code.', { exact: true }).waitFor();
      expect(await sizes.evaluate((element) => document.activeElement === element)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.dataset.clipboard)).toContain('sizes="12px"');
      await sizes.fill('50vw');
      expect(await page.getByRole('button', { name: '12px', exact: true }).getAttribute('aria-pressed')).toBe('false');

      for (const [button, tag] of [[img, '<img'], [picture, '<picture>']] as const) {
        await button.click();
        const markup = await page.locator('.file-code textarea').inputValue();

        expect(markup.startsWith(tag)).toBe(true);
        expect(markup).toContain('sizes="50vw"');
        expect(markup).toContain('width="24" height="16"');
        expect(await page.evaluate(() => document.documentElement.dataset.clipboard)).toBe(markup);
        expect(await button.locator('svg[aria-hidden=true]').count()).toBe(1);
      }
    } finally {
      await context.close();
    }
  });

  it('translates Files and replacement and uses icon buttons with outlined danger styling', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
      await page.addInitScript(() => localStorage.setItem('zarya.admin.language', 'ru'));
      await openFiles(page, false, true);
      await page.getByRole('button', { name: 'Файлы', exact: true }).waitFor();
      expect(await page.getByRole('button', { name: 'Обновить', exact: true }).locator('svg').count()).toBe(1);
      await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).click();
      await page.getByText('Заменить картинку', { exact: true }).waitFor();
      const remove = page.getByRole('button', { name: 'Удалить изображение', exact: true });

      expect(await remove.locator('svg').count()).toBe(1);
      expect(await remove.getAttribute('class')).toContain('cms-danger');
      expect(await remove.evaluate((element) => {
        const style = getComputedStyle(element);

        return style.borderTopColor === style.color && style.backgroundColor === 'rgb(255, 255, 255)';
      })).toBe(true);
      expect(await remove.locator('svg').evaluate((element) => getComputedStyle(element).stroke))
        .toBe(await remove.evaluate((element) => getComputedStyle(element).color));

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        if (width === 320 || width === 1440) {
          await page.locator('.file-code').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.resolve('.tmp/files-actions-' + width + '.png') });
          await remove.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.resolve('.tmp/files-danger-' + width + '.png') });
        }
      }
    } finally {
      await context.close();
    }
  });

  it('shows copy feedback in an accessible snack bar for two seconds and restarts its timer', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async () => {} },
        });
      });
      await openFiles(page);
      await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).click();
      await page.clock.install();
      const copy = page.getByRole('button', { name: 'Copy img', exact: true });
      const snackbar = page.locator('[data-snack-bar]');
      const codeHeight = (await page.locator('.file-code').boundingBox())!.height;

      await copy.click();
      await snackbar.waitFor();
      expect(await snackbar.innerText()).toBe('HTML copied');
      expect(await snackbar.getAttribute('role')).toBe('status');
      expect(await snackbar.getAttribute('data-snack-bar')).toBe('success');
      expect(await snackbar.locator('svg').count()).toBe(1);
      expect(await snackbar.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(36, 77, 55)');
      expect(await snackbar.locator('svg').evaluate((element) => getComputedStyle(element).stroke))
        .toBe('rgb(36, 77, 55)');
      expect((await page.locator('.file-code').boundingBox())!.height).toBeGreaterThanOrEqual(codeHeight);
      expect(await page.locator('.file-code .cms-success').count()).toBe(0);
      const copiedHeight = (await page.locator('.file-code').boundingBox())!.height;

      await page.screenshot({ path: path.resolve('.tmp/snack-bar-success.png') });
      await page.clock.fastForward(1500);
      await copy.click();
      await page.clock.fastForward(1000);
      expect(await snackbar.count()).toBe(1);
      await page.clock.fastForward(1100);
      await snackbar.waitFor({ state: 'detached' });
      expect((await page.locator('.file-code').boundingBox())!.height).toBe(copiedHeight);
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', {
          value: {
            writeText: async () => {
              throw new Error('Clipboard denied');
            },
          },
        });
      });
      await copy.click();
      await snackbar.waitFor();
      expect(await snackbar.getAttribute('role')).toBe('alert');
      expect(await snackbar.innerText()).toBe('Could not copy. Select and copy the HTML below.');
      expect(await snackbar.getAttribute('class')).toContain('_snack-bar__failure');
      expect(await snackbar.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(161, 47, 40)');
      expect(await snackbar.locator('svg').evaluate((element) => getComputedStyle(element).stroke))
        .toBe('rgb(161, 47, 40)');
      expect(await page.locator('.file-code textarea').inputValue()).toContain('<img');
      await page.screenshot({ path: path.resolve('.tmp/snack-bar-failure.png') });
      await page.clock.fastForward(2000);
      await snackbar.waitFor({ state: 'detached' });
    } finally {
      await context.close();
    }
  });

  it('renames in place on blur, keeps text geometry, and confirms success in the snackbar', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));

    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openFiles(page);
      await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).click();

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        const label = page.locator('._file-name-label');

        await expect.poll(() => label.evaluate((element) => {
          const rect = element.getBoundingClientRect();

          return rect.x >= 0 && rect.right <= innerWidth;
        })).toBe(true);
        const before = await label.boundingBox();

        await label.click();
        const input = page.locator('._file-name-edit');
        const geometry = await input.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const css = getComputedStyle(element);

          return {
            x: rect.x + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft),
            y: rect.y + parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop),
            active: document.activeElement === element,
          };
        });

        expect(geometry.active).toBe(true);
        expect(geometry.x).toBeCloseTo(before!.x, 0);
        expect(geometry.y).toBeCloseTo(before!.y, 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await input.press('Escape');
      }
      let savedName = '';

      await page.route('**/api/admin/sites/site-1/files/image/move', async (route) => {
        const body: {
          name: string; folderId: string | null; updateReferences: boolean;
        } = route.request().postDataJSON();

        savedName = body.name;
        expect(body.updateReferences).toBe(false);
        await route.fulfill({
          json: {
            version: 'v2',
            pending: false,
            folders: [],
            files: [{
              fileId: 'image',
              name: body.name,
              folderId: body.folderId,
              mode: 'Original',
              mimeType: 'image/png',
              byteSize: 100,
              hasVariants: false,
              originalDimensions: null,
              outputs: [{ key: 'file', url: '/assets/images/' + body.name, mimeType: 'image/png', dimensions: null }],
            }],
          },
        });
      });
      await page.locator('._file-name-label').click();
      await page.locator('._file-name-edit').fill('logo-1.png');
      await page.locator('._file-name-edit').press('Tab');
      await page.getByRole('status').filter({
        hasText: 'Renamed Screenshot 2024-09-18 202105.png to logo-1.png successfully.',
      }).waitFor();
      expect(savedName).toBe('logo-1.png');
      expect(await page.locator('._file-name-label').innerText()).toBe('logo-1.png');
      expect(await page.getByText('File name saved.', { exact: true }).count()).toBe(0);
      await page.locator('#file-name').fill('logo-2.png');
      await page.getByRole('button', { name: 'Save name', exact: true }).click();
      await page.getByRole('status').filter({
        hasText: 'Renamed logo-1.png to logo-2.png successfully.',
      }).waitFor();
      expect(savedName).toBe('logo-2.png');
      expect(await page.getByText('File name saved.', { exact: true }).count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('shortens long file references in the middle without horizontal dialog scrolling', async () => {
    for (const language of ['en', 'ru']) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const title = 'content/pages/' + 'abcdef0123456789'.repeat(20) + '/image-source.map';
      const field = 'plans/' + '0123456789abcdef'.repeat(20) + '/request-plan.json';
      const errors: string[] = [];

      page.on('pageerror', (error) => errors.push(error.message));
      page.setDefaultTimeout(4000);

      try {
        await page.addInitScript((value) => localStorage.setItem('zarya.admin.language', value), language);
        await openFiles(page);
        await page.route('**/api/admin/sites/site-1/files/image/usages?*', async (route) => {
          await route.fulfill({
            json: {
              version: 'v1',
              usages: [
                {
                  group: 'Templates',
                  title,
                  field,
                  state: 'Release 72b8a405-80c8-43aa-9482-747a0eaf03a4',
                  editorPath: '/admin/sites/site-1/templates/Home',
                },
                {
                  group: 'Templates',
                  title: 'Hero',
                  field: 'html',
                  state: 'Draft',
                  editorPath: '/admin/sites/site-1/chunks/Hero',
                },
              ],
            },
          });
        });
        await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).click();
        await page.locator('._file-name-label').click();
        await page.locator('._file-name-edit').fill('logo-1.png');
        await page.locator('._file-name-edit').press('Tab');
        const dialog = page.getByRole('dialog');

        await dialog.waitFor();

        for (const width of [
          320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1093, 1199, 1200, 1440,
        ]) {
          await page.setViewportSize({ width, height: 960 });
          await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
          const displayed = dialog.locator('.middle-ellipsis[title="' + title + '"] ._ellipsis-visible');

          await expect.poll(() => displayed.innerText()).toContain('...');
          const shortened = await displayed.innerText();

          expect(shortened.startsWith('content/')).toBe(true);
          expect(shortened.endsWith('.map')).toBe(true);
          expect(shortened.length).toBeLessThan(title.length);
          expect(await dialog.locator('.middle-ellipsis[title="' + title + '"]').getAttribute('title')).toBe(title);
          expect(await dialog.locator('.middle-ellipsis[title="Hero"] ._ellipsis-visible').innerText()).toBe('Hero');
        }
        await page.screenshot({ path: '.tmp/file-reference-dialog-' + language + '.png' });
        await dialog.press('Escape');
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });

  it('drags a file to a folder and asks whether to replace used output addresses before saving', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();

    page.setDefaultTimeout(4000);

    try {
      await openFiles(page, true, true);
      await page.route('**/api/admin/sites/site-1/files/image/usages?*', async (route) => {
        await route.fulfill({
          json: {
            version: 'v1',
            usages: [{
              group: 'Templates',
              title: 'Hero',
              field: 'html',
              state: 'Draft',
              editorPath: '/admin/sites/site-1/chunks/Hero',
            }],
          },
        });
      });
      const writes: { name: string; folderId: string | null; updateReferences: boolean }[] = [];

      await page.route('**/api/admin/sites/site-1/files/image/move', async (route) => {
        const body: {
          name: string; folderId: string | null; updateReferences: boolean;
        } = route.request().postDataJSON();

        writes.push(body);
        await route.fulfill({
          json: {
            version: 'v2',
            pending: false,
            folders: [{ folderId: 'folder-1', parentId: null, name: 'Photos' }],
            files: [{
              fileId: 'image',
              name: body.name,
              folderId: body.folderId,
              mode: 'Responsive',
              mimeType: 'image/png',
              byteSize: 100,
              hasVariants: true,
              originalDimensions: null,
              outputs: [{
                key: 'w12', url: '/assets/images/image--w12.webp', mimeType: 'image/webp', dimensions: null,
              }],
            }],
          },
        });
      });
      const item = page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true });
      const root = page.getByRole('button', { name: 'assets/images', exact: true });

      await item.dragTo(root);
      const dialog = page.getByRole('dialog', { name: 'Change file address' });

      await dialog.waitFor();
      expect(writes).toEqual([]);
      expect(await dialog.innerText()).toContain('Hero');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(writes).toEqual([]);
      await item.dragTo(root);
      await dialog.getByRole('button', { name: 'Update links', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Moved Screenshot' }).waitFor();
      expect(writes).toEqual([expect.objectContaining({ folderId: null, updateReferences: true })]);
      expect(await item.isVisible()).toBe(true);

      await item.dragTo(page.locator('#files-drawer').getByRole('button', { name: 'Photos', exact: true }));
      await dialog.getByRole('button', { name: 'Keep old addresses (broken links)', exact: true }).click();
      await expect.poll(() => writes.length).toBe(2);
      expect(writes[1]).toMatchObject({ folderId: 'folder-1', updateReferences: false });
    } finally {
      await context.close();
    }
  });

  it('keeps separate save buttons to the right of their fields in both interface languages', async () => {
    for (const language of ['en', 'ru']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
      const page = await context.newPage();

      try {
        await page.addInitScript((value) => localStorage.setItem('zarya.admin.language', value), language);
        await openFiles(page);
        await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true }).click();
        const fields = page.locator('._file-organization input, ._file-organization select');
        const buttons = page.locator('._file-organization button');

        expect(await buttons.count()).toBe(2);

        for (const width of [320, 375, 390, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await page.setViewportSize({ width, height: 960 });

          for (let index = 0; index < 2; index++) {
            const field = await fields.nth(index).boundingBox();
            const button = await buttons.nth(index).boundingBox();

            if (!field || !button) {
              throw new Error('Missing file organization controls');
            }
            expect(button.x).toBeGreaterThanOrEqual(field.x + field.width);
            expect(Math.abs(button.y - field.y)).toBeLessThanOrEqual(1);
            expect(button.height).toBeGreaterThanOrEqual(44);
            expect(await buttons.nth(index).isDisabled()).toBe(true);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

          if (width === 320 || width === 1440) {
            await page.screenshot({
              path: path.resolve('.tmp/files-organization-' + language + '-' + width + '.png'),
              fullPage: true,
            });
          }
        }
      } finally {
        await context.close();
      }
    }
  });

  it('separates expanded folders from their first child by the normal row gap', async () => {
    const context = await browser.newContext({ viewport: { width: 320, height: 960 }, reducedMotion: 'reduce' });
    const page = await context.newPage();

    try {
      await openFiles(page, true);

      for (const width of [320, 390, 992, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        const folder = await page.locator('#files-drawer')
          .getByRole('button', { name: 'Photos', exact: true }).locator('..').boundingBox();
        const file = await page.getByRole('button', { name: 'Screenshot 2024-09-18 202105.png', exact: true })
          .boundingBox();

        if (!folder || !file) {
          throw new Error('Missing expanded folder or child');
        }
        expect(file.y - folder.y - folder.height).toBe(4);
      }
    } finally {
      await context.close();
    }
  });
});
