import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, chromium, type Page } from 'playwright-core';
import sharp from 'sharp';

import { currentAdmin } from '../support/current-admin.js';
import { fileLibraryResponse } from '../support/file-library-http.js';

interface IImageLibraryFixture {
  browser: Browser;
  page: Page;
  image: Buffer;
  pageWrites: Record<string, unknown>[];
  uploads: Record<string, unknown>[];
  errors: string[];
  setUploadStatus: (status: number) => void;
  setLibraryStatus: (status: number) => void;
  reads: () => number;
}

async function imageLibraryFixture(): Promise<IImageLibraryFixture> {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  const image = await sharp({
    create: { width: 160, height: 100, channels: 3, background: '#b7c8ad' },
  }).webp().toBuffer();
  const files = Array.from({ length: 1000 }, (_, index) => {
    const suffix = String(index).padStart(4, '0');

    return {
      fileId: 'image-' + suffix,
      folderId: null,
      name: 'Image-' + suffix + '.webp',
      mimeType: 'image/webp',
      mode: 'Responsive',
      hasVariants: true,
      byteSize: image.length,
      originalDimensions: { width: 160, height: 100 },
      outputs: [{
        key: 'w320',
        url: '/assets/images/image-' + suffix + '.webp',
        mimeType: 'image/webp',
        dimensions: { width: 160, height: 100 },
      }, {
        key: 'w80',
        url: '/assets/images/image-' + suffix + '-80.webp',
        mimeType: 'image/webp',
        dimensions: { width: 80, height: 50 },
      }],
    };
  });
  const pageWrites: Record<string, unknown>[] = [];
  const uploads: Record<string, unknown>[] = [];
  const errors: string[] = [];
  let uploadStatus = 200;
  let libraryStatus = 200;
  let version = 'm0';
  let reads = 0;
  const site = {
    siteId: 'site-1',
    mark: 'Fixture',
    name: 'Fixture',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'Active',
  };
  const workingPage = {
    pageId: 'page-1',
    siteId: 'site-1',
    mark: 'Example',
    title: 'Example',
    language: 'en',
    status: 'PUBLISHED',
    contentMd: 'Description',
    updatedAt: '2026-11-07T00:00:00.000Z',
    pageNumber: '1',
    sortOrder: 100,
    parentPageId: null,
    tvValues: { photo: { kind: 'Image', fileId: files[0]!.fileId, mode: 'Responsive', alt: 'Original caption' } },
  };

  page.setDefaultTimeout(4000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());

    if (pathname.startsWith('/api/')) {
      if (pathname.includes('/files/') && pathname.endsWith('/content')) {
        await route.fulfill({ body: image, contentType: 'image/webp' });

        return;
      }
      if (pathname.endsWith('/files')) {
        if (route.request().method() === 'POST') {
          uploads.push({
            metadata: JSON.parse(decodeURIComponent(route.request().headers()['x-zarya-file-metadata'] ?? '')),
            byteSize: route.request().postDataBuffer()?.length,
          });

          if (uploadStatus !== 200) {
            await route.fulfill({ status: uploadStatus, json: { error: 'Conflict' } });

            return;
          }
          files.push({ ...files[0]!, fileId: 'uploaded-1', name: 'fresh.webp' });
          version = 'm1';
        } else {
          reads++;

          if (libraryStatus !== 200) {
            await route.fulfill({ status: libraryStatus, json: { error: 'InternalError' } });

            return;
          }
        }
        await route.fulfill({
          json: fileLibraryResponse(searchParams, { version, pending: false, folders: [], files }),
        });

        return;
      }

      let json: unknown = { items: [] };

      if (pathname.endsWith('/auth/me')) {
        json = currentAdmin();
      } else if (pathname === '/api/admin/sites') {
        json = { items: [site] };
      } else if (pathname === '/api/admin/sites/site-1') {
        json = site;
      } else if (pathname.endsWith('/pages/page-1/template-variables')) {
        pageWrites.push(route.request().postDataJSON());
        json = { ...workingPage, updatedAt: '2026-11-07T00:00:02.000Z' };
      } else if (pathname.endsWith('/template-variables')) {
        json = {
          siteId: site.siteId,
          version: 'c1',
          fields: [{
            name: 'photo',
            caption: 'Page image',
            description: '',
            kind: 'Image',
            templateIds: ['Card'],
            sortOrder: 1,
            required: false,
          }],
        };
      } else if (pathname.endsWith('/pages/page-1')) {
        json = workingPage;
      } else if (pathname.endsWith('/pages')) {
        json = { items: [workingPage] };
      } else if (pathname.endsWith('/publication')) {
        json = {
          templates: [{ templateId: 'Card', name: 'Card', requiresParameters: false }],
          templateId: 'Card',
          path: '/',
          pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
        };
      }
      await route.fulfill({ json });

      return;
    }

    const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
    const filename = path.resolve('admin/dist', asset);

    if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
      throw new Error('Unsafe fixture asset');
    }
    await route.fulfill({
      body: await readFile(filename),
      contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
    });
  });

  try {
    await page.goto('http://localhost:31987/admin/sites/site-1/pages/page-1');
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
  } catch (error) {
    await browser.close();
    throw error;
  }

  return {
    browser,
    page,
    image,
    pageWrites,
    uploads,
    errors,
    setUploadStatus: (status: number) => uploadStatus = status,
    setLibraryStatus: (status: number) => libraryStatus = status,
    reads: () => reads,
  };
}

it('selects, searches and uploads TV images without changing the page on cancel', async () => {
  const f = await imageLibraryFixture();
  const { page } = f;
  const field = page.getByRole('region', { name: 'Page image', exact: true });
  const replace = field.getByRole('button', { name: 'Page image', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Image library', exact: true });

  try {
    const mainTab = page.getByRole('tab', { name: 'Main', exact: true });
    const tvTab = page.getByRole('tab', { name: 'Template variables', exact: true });
    const scroll = page.locator('.page-editor-frame > ._workspace-scroll');

    await page.addStyleTag({ content: '.page-editor-frame > ._workspace-scroll::-webkit-scrollbar { width: 16px; }' });
    expect(await scroll.evaluate((element) => getComputedStyle(element).scrollbarGutter)).toBe('stable');

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 1400 });
      await page.evaluate(() => new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const openWorkspace = page.getByRole('button', { name: 'Open workspace', exact: true });

      if (await openWorkspace.isVisible()) {
        await openWorkspace.click();
      }
      await mainTab.click();
      const mainWidth = await scroll.evaluate((element) => element.clientWidth);
      const mainBox = await page.locator('.page-editor').boundingBox();

      await tvTab.click();
      expect(await scroll.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
      expect(await scroll.evaluate((element) => element.clientWidth)).toBe(mainWidth);
      const tvBox = await page.locator('.page-editor').boundingBox();

      expect(tvBox!.x).toBeCloseTo(mainBox!.x, 1);
      expect(tvBox!.width).toBeCloseTo(mainBox!.width, 1);
      const binding = await field.getByLabel('Image binding', { exact: true }).boundingBox();
      const alt = await field.getByLabel('Alternative text (empty for decorative images)').boundingBox();

      if (width < 768) {
        expect(alt!.y).toBeGreaterThanOrEqual(binding!.y + binding!.height);
      } else {
        expect(alt!.x).toBeGreaterThanOrEqual(binding!.x + binding!.width);
        expect(alt!.y).toBeCloseTo(binding!.y, 1);
      }
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    await field.screenshot({ path: '.tmp/tv-image-settings-desktop.png', animations: 'disabled' });
    expect(await field.getByRole('combobox', { name: 'Select a file', exact: true }).count()).toBe(0);
    await replace.click();
    await dialog.getByRole('status').filter({ hasText: '1 / 40 · 1000' }).waitFor();
    expect(await dialog.locator('._file-action').count()).toBe(25);
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: '2 / 40 · 1000' }).waitFor();
    const search = dialog.getByRole('searchbox', { name: 'Search by name', exact: true });

    await search.focus();
    await page.locator('#page-title').evaluate((element) => element.focus());
    expect(await search.evaluate((element) => element === document.activeElement)).toBe(true);
    await search.fill('IMAGE-0999');
    await search.press('Enter');
    expect(f.pageWrites).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Image-0999.webp', exact: true }).click();
    expect(await dialog.locator('._file-action').count()).toBe(1);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    expect(await field.getByRole('button', { name: 'Page image', exact: true }).innerText())
      .toContain('Image-0000.webp');
    const opener = await replace.getAttribute('id');

    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(opener);

    await replace.click();
    await dialog.getByRole('searchbox').fill('nothing matches');
    await dialog.getByText('This folder is empty. Add an item here to get started.', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(opener);
    await replace.click();
    await dialog.getByRole('searchbox').fill('0999');
    await dialog.getByRole('button', { name: 'Image-0999.webp', exact: true }).click();
    await dialog.getByRole('button', { name: 'Use image', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    expect(await field.getByRole('button', { name: 'Page image', exact: true }).innerText())
      .toContain('Image-0999.webp');
    expect(f.pageWrites).toHaveLength(0);
    expect(await field.getByRole('radio').count()).toBe(0);
    await field.getByLabel('Image binding', { exact: true }).selectOption('Single');
    expect(await field.getByRole('radio', { name: '160 × 100 px', exact: true }).isChecked()).toBe(true);

    f.setLibraryStatus(503);
    await replace.click();
    await dialog.getByRole('alert').waitFor();
    expect(await dialog.getByRole('button', { name: 'Use image', exact: true }).isDisabled()).toBe(true);
    f.setLibraryStatus(200);
    await dialog.getByRole('button', { name: 'Refresh', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: '1 / 40 · 1000' }).waitFor();
    await page.screenshot({ path: '.tmp/image-library-desktop.png', animations: 'disabled' });

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.tmp/image-library-mobile.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 960 });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('combobox', { name: 'Interface language' }).selectOption('ru');
    await field.getByRole('button', { name: 'Page image', exact: true }).click();
    const russianDialog = page.getByRole('dialog', { name: 'Библиотека изображений', exact: true });

    await russianDialog.getByRole('searchbox', { name: 'Поиск по названию', exact: true }).fill('0999');
    await russianDialog.getByRole('button', { name: 'Image-0999.webp', exact: true }).waitFor();
    await russianDialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    await page.getByRole('combobox', { name: 'Язык интерфейса' }).selectOption('en');
    await replace.click();
    await dialog.getByRole('status').filter({ hasText: '1 / 40 · 1000' }).waitFor();

    const upload = dialog.getByLabel('Upload new image', { exact: true });
    const selection = { name: 'fresh.webp', mimeType: 'image/webp', buffer: f.image };

    await upload.setInputFiles({ name: 'not-an-image.pdf', mimeType: 'application/pdf', buffer: f.image });
    await dialog.getByRole('alert').waitFor();
    expect(f.uploads).toHaveLength(0);
    f.setUploadStatus(403);
    await upload.setInputFiles(selection);
    await dialog.getByRole('alert').waitFor();
    await expect.poll(() => f.uploads.length).toBe(1);
    expect(await dialog.isVisible()).toBe(true);
    f.setUploadStatus(409);
    await upload.setInputFiles(selection);
    await dialog.getByRole('alert').waitFor();
    await expect.poll(() => f.uploads.length).toBe(2);
    await dialog.getByRole('button', { name: 'Refresh', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: '1 / 40 · 1000' }).waitFor();
    expect(f.reads()).toBeGreaterThan(3);
    f.setUploadStatus(200);
    await upload.setInputFiles(selection);
    await dialog.waitFor({ state: 'detached' });
    expect(f.uploads).toHaveLength(3);
    expect(f.uploads[2]).toMatchObject({
      metadata: { filename: 'fresh.webp', mode: 'Responsive', expectedVersion: 'm0', folderId: null },
      byteSize: f.image.length,
    });
    expect(await field.getByRole('button', { name: 'Page image', exact: true }).innerText()).toContain('fresh.webp');
    expect(await field.getByRole('radio', { name: '160 × 100 px', exact: true }).isChecked()).toBe(true);
    await field.getByRole('radio', { name: '80 × 50 px', exact: true }).check();
    await field.screenshot({ path: '.tmp/tv-image-sizes-desktop.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 960 });
    await field.screenshot({ path: '.tmp/tv-image-sizes-mobile.png', animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect.poll(() => f.pageWrites.length).toBe(1);
    expect(f.pageWrites[0]).toMatchObject({
      mediaVersion: 'm1',
      values: { photo: { kind: 'Image', mode: 'Single', key: 'w80', fileId: 'uploaded-1', alt: 'Original caption' } },
    });
    expect(f.errors).toEqual([]);
  } finally {
    await f.browser.close();
  }
}, 45000);
