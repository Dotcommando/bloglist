import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { verifyScrollShadow } from '../support/admin-scroll.js';
import { currentAdmin } from '../support/current-admin.js';
import { fileLibraryResponse } from '../support/file-library-http.js';

it('edits TV definitions and template assignments through the built administration UI', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.setDefaultTimeout(3000);
  const writes: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const pageWrites: Record<string, unknown>[] = [];
  const extraFields: Record<string, unknown>[] = [];
  let publicationTemplate = 'Game';
  const workingPage = {
    pageId: 'page-1',
    siteId: 'site-1',
    mark: 'GamePage',
    title: 'Game page',
    language: 'en',
    status: 'PUBLISHED',
    contentMd: 'Description',
    updatedAt: '2026-10-31T00:00:00.000Z',
    tvValues: { gameImage: { kind: 'Image', mode: 'Responsive', fileId: 'removed-file', alt: '' } },
  };

  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const site = {
        siteId: 'site-1',
        mark: 'Demo',
        name: 'Demo',
        primaryDomain: 'example.test',
        languages: ['en'],
        defaultLanguage: 'en',
        status: 'Active',
      };
      const endpoint = url.pathname;

      if (endpoint.startsWith('/api/')) {
        let json: unknown = { items: [] };

        if (endpoint === '/api/admin/auth/me') {
          json = currentAdmin();
        } else if (endpoint === '/api/admin/sites') {
          json = { items: [site] };
        } else if (endpoint === '/api/admin/sites/site-1') {
          json = site;
        } else if (endpoint.endsWith('/pages/page-1/template-variables')) {
          const payload: unknown = route.request().postDataJSON();

          if (payload) {
            pageWrites.push(Object.fromEntries(Object.entries(payload)));
          }
          json = { ...workingPage, updatedAt: '2026-10-31T00:00:02.000Z' };
        } else if (endpoint.endsWith('/pages/page-1')) {
          json = workingPage;
        } else if (endpoint.endsWith('/pages')) {
          json = { items: [workingPage] };
        } else if (endpoint.endsWith('/template-variables')) {
          const payload: unknown = route.request().postDataJSON();
          const body = payload && typeof payload === 'object' && !Array.isArray(payload)
            ? Object.fromEntries(Object.entries(payload)) : null;

          if (body) {
            writes.push(body);
          }

          const fields = body?.fields ?? writes.at(-1)?.fields;

          json = {
            siteId: 'site-1',
            version: 'v1',
            fields: [...(Array.isArray(fields) ? fields : []), ...extraFields],
          };
        } else if (endpoint.endsWith('/templates')) {
          json = {
            items: ['Game', 'Home', 'Basic', 'Pagination'].map((key) => ({
              key,
              name: key,
              elementId: 'element-1',
              siteId: 'site-1',
              kind: 'Template',
              version: 'v1',
              backupState: 'Ready',
              html: '',
              css: '',
              browserTypeScript: null,
              parameters: [],
              createdAt: '2026-10-31T00:00:00.000Z',
              updatedAt: '2026-10-31T00:00:00.000Z',
            })),
          };
        } else if (endpoint.endsWith('/files')) {
          json = fileLibraryResponse(url.searchParams, {
            version: '0',
            pending: false,
            folders: [],
            files: ['photo-1', 'document-1'].map((fileId) => ({
              fileId,
              folderId: null,
              name: fileId === 'photo-1' ? 'photo.webp' : 'guide.pdf',
              mimeType: fileId === 'photo-1' ? 'image/webp' : 'application/pdf',
              mode: 'Original',
              hasVariants: false,
              byteSize: 100,
              originalDimensions: null,
              outputs: [{
                key: 'file',
                url: '/assets/files/' + fileId,
                mimeType: 'application/octet-stream',
                dimensions: null,
              }],
            })),
          });
        } else if (endpoint.endsWith('/publication')) {
          json = {
            templates: ['Game', 'Home'].map((templateId) => ({
              templateId,
              name: templateId,
              requiresParameters: false,
            })),
            templateId: publicationTemplate,
            path: '/',
            pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: '/' }],
          };
        }
        await route.fulfill({ json });

        return;
      }

      const asset = endpoint.startsWith('/admin/assets/') ? endpoint.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture asset');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript'
          : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });
    await page.goto('http://localhost:31989/admin/sites/site-1/template-variables');
    await page.getByRole('button', { name: 'Create TV', exact: true }).click({ timeout: 4000 });
    await page.getByLabel('Technical name', { exact: true }).fill('gameImage');
    await page.getByLabel('Caption', { exact: true }).fill('Game image');
    await page.getByLabel('Type', { exact: true }).selectOption('Image');
    expect(await page.getByRole('button', { name: 'Game image', exact: true }).count()).toBe(1);
    const required = page.getByRole('checkbox', { name: 'Required at publication', exact: true });
    const requiredBox = await required.boundingBox();

    expect(requiredBox!.width).toBeLessThanOrEqual(24);
    expect(requiredBox!.height).toBeLessThanOrEqual(24);
    const requiredCaption = await page.getByText('Required at publication', { exact: true }).boundingBox();

    expect(requiredCaption!.x - requiredBox!.x - requiredBox!.width).toBeGreaterThanOrEqual(6);
    expect(requiredCaption!.x - requiredBox!.x - requiredBox!.width).toBeLessThanOrEqual(12);
    const technicalName = await page.getByLabel('Technical name', { exact: true }).boundingBox();
    const headerTitle = await page.locator('.tv-editor ._workspace-title').boundingBox();
    const saveButton = await page.getByRole('button', { name: 'Save TV fields', exact: true }).boundingBox();
    const editorBox = await page.locator('.tv-editor').boundingBox();

    expect(headerTitle!.x).toBe(technicalName!.x);
    expect(Math.abs(headerTitle!.y + headerTitle!.height / 2 - saveButton!.y - saveButton!.height / 2)).toBeLessThan(1);
    expect(editorBox!.x + editorBox!.width - saveButton!.x - saveButton!.width).toBe(40);
    const caption = await page.getByLabel('Caption', { exact: true }).boundingBox();

    expect(caption!.x).toBeGreaterThan(technicalName!.x + technicalName!.width);
    expect(caption!.y).toBeCloseTo(technicalName!.y, 0);
    expect(await page.locator('#tv-definitions > fieldset').evaluate((element) =>
      getComputedStyle(element).borderTopWidth)).toBe('0px');
    await page.getByText('Required at publication', { exact: true }).click();
    expect(await required.isChecked()).toBe(true);
    await required.focus();
    await required.press('Space');
    expect(await required.isChecked()).toBe(false);
    const templateCheckbox = page.getByRole('checkbox', { name: 'Game', exact: true });
    const templateBox = await templateCheckbox.boundingBox();

    expect(templateBox!.width).toBeLessThanOrEqual(24);
    await page.getByText('Game', { exact: true }).last().click();
    expect(await templateCheckbox.isChecked()).toBe(true);
    await templateCheckbox.uncheck();
    await page.getByLabel('Game', { exact: true }).check();
    await page.screenshot({ path: '.tmp/tv-editor-desktop.png' });
    await page.getByRole('button', { name: 'Save TV fields', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'TV fields saved' }).waitFor();
    await page.getByRole('button', { name: 'Create TV', exact: true }).click();
    await page.getByLabel('Technical name', { exact: true }).fill('gameImage');
    expect(await page.getByLabel('Technical name', { exact: true }).isEditable()).toBe(true);
    await page.getByLabel('Technical name', { exact: true }).fill('secondImage');
    await page.getByLabel('Caption', { exact: true }).fill('Second image');
    expect(await page.getByLabel('Value source', { exact: true }).count()).toBe(0);
    await page.locator('#tv-default').fill('Default text');
    await page.locator('#tv-default').fill('');
    await page.getByLabel('Game', { exact: true }).check();
    await page.getByRole('button', { name: 'Save TV fields', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'TV fields saved' }).waitFor();
    expect(writes[0]).toMatchObject({
      fields: [{
        name: 'gameImage',
        caption: 'Game image',
        kind: 'Image',
        templateIds: ['Game'],
      }],
    });
    const drawer = page.locator('.tv-drawer');
    const drawerBackground = await drawer.evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(drawerBackground).toBe('rgb(244, 245, 239)');
    expect(await drawer.locator('._drawer-heading').evaluate((element) =>
      getComputedStyle(element).backgroundColor)).toBe(drawerBackground);
    const selectedRow = drawer.locator('.tv-row[aria-current]');

    expect(await selectedRow.evaluate((element) =>
      getComputedStyle(element).backgroundColor)).toBe('rgb(229, 236, 220)');
    expect(await selectedRow.evaluate((element) => getComputedStyle(element).borderTopColor)).toBe('rgb(49, 88, 62)');
    const otherRow = drawer.locator('.tv-row:not([aria-current])').first();

    expect(await otherRow.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(233, 238, 226)');
    await otherRow.hover();
    await expect.poll(() => otherRow.evaluate((element) =>
      getComputedStyle(element).backgroundColor)).toBe('rgb(229, 236, 220)');

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await verifyScrollShadow(page.locator('.tv-editor ._workspace-scroll'),
      page.locator('.tv-editor ._workspace-toolbar'));
    await page.screenshot({ path: '.tmp/tv-editor-mobile.png' });
    extraFields.push(...Array.from({ length: 24 }, (_, index) => ({
      name: 'extra' + index,
      caption: 'Extra field ' + index,
      description: '',
      kind: 'Text',
      required: false,
      sortOrder: index + 2,
      templateIds: ['Game'],
    })));
    await page.reload();
    await drawer.locator('.tv-row').last().waitFor();
    await verifyScrollShadow(drawer.locator('._tree-scroll'), drawer.locator('._drawer-heading'));
    extraFields.push(...[
      { name: 'summary', caption: 'Summary', kind: 'Text', defaultValue: 'Default summary' },
      {
        name: 'details',
        caption: 'Details',
        kind: 'Markdown',
        defaultValue: { kind: 'Markdown', text: 'Default details' },
      },
      { name: 'plain', caption: 'Plain text', kind: 'Text' },
      {
        name: 'photo',
        caption: 'Default image',
        kind: 'Image',
        defaultValue: { kind: 'Image', fileId: 'photo-1', mode: 'Responsive', alt: 'Default photo' },
      },
      {
        name: 'attachment',
        caption: 'Attachment',
        kind: 'File',
        defaultValue: { kind: 'File', fileId: 'document-1', label: 'Default guide' },
      },
    ].map((field) => ({ description: '', required: false, sortOrder: 1, templateIds: ['Game'], ...field })));
    await page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
    const mainTab = page.getByRole('tab', { name: 'Main', exact: true });
    const tvTab = page.getByRole('tab', { name: 'Template variables', exact: true });
    const metadata: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));

    await page.getByText('CMS Zarya v.' + metadata.version, { exact: true }).waitFor();
    await mainTab.waitFor();
    expect(await mainTab.getAttribute('aria-selected')).toBe('true');
    expect(await page.locator('#page-title').isVisible()).toBe(true);
    await tvTab.click();
    expect(await page.locator('#page-title').isVisible()).toBe(false);
    expect(await page.getByLabel('Value source', { exact: true }).count()).toBe(0);
    expect(await page.locator('fieldset.tv-page-fields').count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Refresh files', exact: true }).count()).toBe(0);
    await page.getByRole('status').filter({ hasText: 'The selected file is missing.' }).waitFor();
    const summary = page.getByRole('textbox', { name: 'Summary', exact: true });
    const details = page.getByRole('textbox', { name: 'Details', exact: true });
    const plain = page.getByRole('textbox', { name: 'Plain text', exact: true });
    const summaryField = page.getByRole('region', { name: 'Summary', exact: true });
    const detailsField = page.getByRole('region', { name: 'Details', exact: true });
    const plainField = page.getByRole('region', { name: 'Plain text', exact: true });
    const hint = 'A default value is configured and will be used: ';

    expect(await summary.inputValue()).toBe('');
    expect(await summaryField.getByRole('status').textContent()).toContain(hint + 'Default summary');
    await summary.fill('Own summary');
    expect(await summaryField.getByRole('status').count()).toBe(0);
    await details.fill('Own details');
    await plain.fill('Temporary');
    await plain.fill('');
    expect(await plainField.getByRole('status').count()).toBe(0);
    const imageField = page.getByRole('region', { name: 'Default image', exact: true });
    const attachmentField = page.getByRole('region', { name: 'Attachment', exact: true });

    expect(await imageField.getByRole('status').textContent()).toContain(hint + 'photo.webp');
    await imageField.getByRole('button', { name: 'Default image', exact: true }).click();
    const libraryDialog = page.getByRole('dialog', { name: 'Image library', exact: true });

    await libraryDialog.getByRole('button', { name: 'photo.webp', exact: true }).click();
    await libraryDialog.getByRole('button', { name: 'Use image', exact: true }).click();
    await imageField.getByLabel('Alternative text (empty for decorative images)').fill('Own photo');
    await imageField.getByRole('button', { name: 'Remove image: Default image', exact: true }).click();
    expect(await imageField.getByRole('status').textContent()).toContain(hint + 'photo.webp');
    await attachmentField.getByLabel('Select a file', { exact: true }).selectOption('document-1');
    await attachmentField.getByLabel('Select a file', { exact: true }).selectOption('');
    expect(await attachmentField.getByRole('status').textContent()).toContain(hint + 'guide.pdf');

    await tvTab.focus();
    await tvTab.press('Home');
    expect(await mainTab.getAttribute('aria-selected')).toBe('true');
    await page.locator('#page-title').fill('Edited text');
    await tvTab.click();
    expect(await summary.inputValue()).toBe('Own summary');
    expect(await details.inputValue()).toBe('Own details');
    await summary.fill('');
    await details.fill('');
    expect(await summaryField.getByRole('status').textContent()).toContain(hint + 'Default summary');
    expect(await detailsField.getByRole('status').textContent()).toContain(hint + 'Default details');

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const openWorkspace = page.getByRole('button', { name: 'Open workspace', exact: true });

      if (await openWorkspace.isVisible()) {
        await openWorkspace.click();
      }
      expect(await tvTab.isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    const editorScroll = page.locator('.page-editor-frame > ._workspace-scroll');

    await editorScroll.evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: '.tmp/page-tv-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator('#page-drawer').getAttribute('aria-hidden')).toBe('true');
    await tvTab.waitFor();
    await page.screenshot({ path: '.tmp/page-tv-mobile.png', animations: 'disabled' });
    await page.getByRole('combobox', { name: 'Interface language' }).selectOption('ru');
    expect(await page.getByRole('tab', { name: 'TV-поля', exact: true }).getAttribute('aria-selected')).toBe('true');
    expect(await summaryField.getByRole('status').textContent())
      .toContain('Задано значение по умолчанию, оно будет подставлено: Default summary');
    await page.getByRole('combobox', { name: 'Язык интерфейса' }).selectOption('en');
    await mainTab.click();
    await page.locator('#page-title').fill('');
    await tvTab.click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    expect(await mainTab.getAttribute('aria-selected')).toBe('true');
    await expect.poll(() => page.locator('#page-title').evaluate((element) =>
      element === document.activeElement)).toBe(true);
    expect(pageWrites).toHaveLength(0);
    await page.locator('#page-title').fill('Edited text');
    await tvTab.click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Draft saved' }).waitFor();
    expect(pageWrites[0]).toMatchObject({ values: workingPage.tvValues });
    expect(pageWrites[0]?.values).not.toHaveProperty('summary');
    expect(pageWrites[0]?.values).not.toHaveProperty('details');
    expect(pageWrites[0]?.values).not.toHaveProperty('plain');
    expect(pageWrites[0]?.values).not.toHaveProperty('photo');
    expect(pageWrites[0]?.values).not.toHaveProperty('attachment');

    await page.reload();
    await mainTab.waitFor();
    await page.getByLabel('Template', { exact: true }).selectOption('Home');
    expect(await page.getByRole('tablist').count()).toBe(1);
    expect(await page.getByRole('tab').count()).toBe(3);
    expect(await tvTab.count()).toBe(0);
    expect(await page.locator('#page-title').isVisible()).toBe(true);
    await page.getByLabel('Template', { exact: true }).selectOption('Game');
    await mainTab.waitFor();
    await tvTab.click();
    expect(await summary.inputValue()).toBe('');
    publicationTemplate = 'Home';
    await page.reload();
    await page.getByLabel('Template', { exact: true }).waitFor();
    expect(await page.getByRole('tablist').count()).toBe(1);
    expect(await page.getByRole('tab').count()).toBe(3);
    expect(await tvTab.count()).toBe(0);
    expect(await page.locator('#page-title').isVisible()).toBe(true);
    await page.route('**/template-variables', (route) => route.fulfill({ status: 500, json: {} }));
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'Could not load TV fields.' }).waitFor();
    expect(await page.getByRole('tablist').count()).toBe(1);
    expect(await page.getByRole('tab').count()).toBe(3);
    expect(await tvTab.count()).toBe(0);
    expect(await page.locator('#page-title').isVisible()).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 45000);
