import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { currentAdmin } from '../support/current-admin.js';

it('keeps missing image/file and literal URL TV values visible and editable without breaking the page', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errors: string[] = [];
  const site = {
    siteId: 'site-1',
    mark: 'Demo',
    name: 'Demo',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'Active',
  };
  const values = {
    photo: { kind: 'Image', mode: 'Responsive', fileId: 'removed-image', alt: 'Keep this text' },
    attachment: { kind: 'File', fileId: 'removed-file', label: 'Document' },
    address: '/assets/images/removed.png',
  };
  const workingPage = {
    pageId: 'page-1',
    siteId: 'site-1',
    mark: 'Home',
    title: 'Home',
    language: 'en',
    status: 'DRAFT',
    contentMd: '',
    updatedAt: '2026-11-11T00:00:00Z',
    tvValues: values,
  };
  const fields = [
    { name: 'photo', caption: 'Photo', kind: 'Image', defaultValue: values.photo },
    { name: 'attachment', caption: 'Attachment', kind: 'File', defaultValue: values.attachment },
    { name: 'address', caption: 'Address', kind: 'Text', defaultValue: values.address },
  ].map((field) => ({ ...field, description: '', required: false, sortOrder: 0, templateIds: ['Home'] }));

  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(4000);

  try {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      let json: unknown = { items: [] };

      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/admin/auth/me') {
          json = currentAdmin();
        } else if (url.pathname === '/api/admin/sites') {
          json = { items: [site] };
        } else if (url.pathname.endsWith('/pages')) {
          json = { items: [workingPage] };
        } else if (url.pathname.endsWith('/pages/page-1')) {
          json = workingPage;
        } else if (url.pathname.endsWith('/template-variables')) {
          json = { siteId: 'site-1', version: 'tv1', fields };
        } else if (url.pathname.endsWith('/templates')) {
          json = {
            items: [{
              key: 'Home',
              name: 'Home',
              elementId: 'element',
              siteId: 'site-1',
              kind: 'Template',
              version: 'v1',
              backupState: 'Ready',
              html: '',
              css: '',
              browserTypeScript: null,
              parameters: [],
            }],
          };
        } else if (url.pathname.endsWith('/files')) {
          json = { version: '0', pending: false, folders: [], files: [] };
        } else if (url.pathname.endsWith('/publication')) {
          json = {
            path: '/',
            templateId: 'Home',
            templates: [{ templateId: 'Home', name: 'Home', requiresParameters: false }],
            pageAvailability: [{ pageId: 'page-1', assignedPath: '/', publicPath: null }],
          };
        } else if (url.pathname.endsWith('/settings')) {
          json = { timeZone: 'UTC' };
        }
        await route.fulfill({ json });

        return;
      }

      const asset = url.pathname.startsWith('/admin/assets/') ? url.pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture asset');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });
    await page.goto('http://localhost:31989/admin/sites/site-1/pages/page-1');
    const metadata: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));

    await page.getByText('CMS Zarya v.' + metadata.version, { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    const photo = page.getByRole('region', { name: 'Photo', exact: true });
    const attachment = page.getByRole('region', { name: 'Attachment', exact: true });
    const address = page.getByRole('region', { name: 'Address', exact: true });

    await photo.getByRole('status').filter({ hasText: 'The selected file is missing.' }).waitFor();
    expect(await photo.innerText()).toContain('removed-image');
    expect(await photo.getByLabel('Alternative text (empty for decorative images)').inputValue())
      .toBe('Keep this text');
    expect(await attachment.locator('select').inputValue()).toBe('removed-file');
    expect(await address.getByRole('textbox').inputValue()).toBe('/assets/images/removed.png');
    await address.getByRole('status').filter({
      hasText: 'The file at this address does not exist: /assets/images/removed.png',
    }).waitFor();

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await address.getByRole('textbox').fill('/assets/images/another-missing.png');
    await address.getByRole('status').filter({ hasText: '/assets/images/another-missing.png' }).waitFor();
    await page.reload();
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    expect(await page.getByRole('region', { name: 'Address', exact: true }).getByRole('textbox').inputValue())
      .toBe(values.address);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
