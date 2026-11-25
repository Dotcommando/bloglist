import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Locator } from 'playwright-core';
import sharp from 'sharp';

import { adminJourney, createJourneySite } from '../support/admin-journey.js';

it('recovers queued uploads, preserves replacement identity and downloads documents through real UI', async () => {
  const f = await adminJourney();
  const { page, origin } = f;
  let failed = true;

  try {
    const site = await createJourneySite(f);
    const original = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#325d71' } })
      .png().toBuffer();
    const replacement = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#d58032' } })
      .png().toBuffer();

    await page.goto(origin + site + '/files');
    await page.getByLabel('New folder name', { exact: true }).fill('Uploads');
    await page.getByRole('button', { name: 'Create folder', exact: true }).click();
    await page.getByRole('navigation', { name: 'File tree', exact: true })
      .getByRole('button', { name: 'Uploads', exact: true }).click();
    await page.locator('.file-upload input[type=file]').setInputFiles(
      ['raw.png', 'broken.png', 'responsive.png', 'cancelled.png'].map((name) => ({
        name, mimeType: 'image/png', buffer: name === 'broken.png' ? Buffer.from('invalid PNG') : original,
      })),
    );
    const queued = (name: string): Locator => page.locator('._file-upload-row').filter({ hasText: name });

    await queued('raw.png').getByRole('combobox').selectOption('Original');
    await queued('responsive.png').getByRole('combobox').selectOption('Responsive');
    await queued('cancelled.png').getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await page.locator('._file-upload-row').count()).toBe(3);
    await page.getByRole('button', { name: 'Upload images', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'broken.png' }).waitFor();
    expect(await page.locator('._file-upload-row').count()).toBe(2);
    await page.getByRole('link', { name: 'raw.png', exact: true }).waitFor();
    await queued('broken.png').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Upload images', exact: true }).click();
    await page.getByRole('link', { name: 'responsive.png', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Expand or collapse folder Uploads', exact: true }).click();
    await page.getByRole('link', { name: 'responsive.png', exact: true }).waitFor();
    expect(await page.locator('._file-upload-row').count()).toBe(0);
    expect(await page.getByRole('link', { name: 'cancelled.png', exact: true }).count()).toBe(0);
    const catalogBefore = await (await page.request.get(origin + '/api' + site + '/files')).json();

    expect(catalogBefore).toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ name: 'raw.png', mode: 'Original', hasVariants: false }),
        expect.objectContaining({ name: 'responsive.png', mode: 'Responsive', hasVariants: true }),
      ]),
    });
    await page.getByRole('link', { name: 'raw.png', exact: true }).click();
    await page.getByRole('button', { name: 'Copy img', exact: true }).click();
    const before = await page.locator('.file-code textarea').inputValue();
    const [changed] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/files/')),
      page.locator('.files-workspace input[type=file]').setInputFiles({
        name: 'new.png', mimeType: 'image/png', buffer: replacement,
      }),
    ]);

    expect(changed.status()).toBe(200);
    await page.getByRole('button', { name: 'Copy img', exact: true }).click();
    expect(await page.locator('.file-code textarea').inputValue()).toContain('width="1200"');
    const after = await page.locator('.file-code textarea').inputValue();
    const source = (html: string): string | undefined => /src="([^"]+)"/.exec(html)?.[1];

    expect(source(after)).toBe(source(before));
    const bytes = Buffer.from(await (await fetch(new URL(source(after)!, origin))).arrayBuffer());

    expect(bytes).toEqual(replacement);
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 1200, height: 800 });
    await page.goto(origin + site + '/files');
    await page.getByRole('button', { name: 'assets/files', exact: true }).click();
    const document = Buffer.from('release,version\nCMS,0.16.0\n');

    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'release.csv', mimeType: 'text/csv', buffer: document,
    });
    expect(await page.locator('._file-upload-row').getByRole('combobox').count()).toBe(0);
    await page.getByRole('button', { name: 'Upload files', exact: true }).click();
    await page.getByRole('link', { name: 'release.csv', exact: true }).click();
    const publicUrl = await page.getByLabel('URL', { exact: true }).inputValue();

    expect(Buffer.from(await (await fetch(new URL(publicUrl, origin))).arrayBuffer())).toEqual(document);
    await f.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.getByRole('button', { name: 'Copy URL', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(publicUrl);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download original', exact: true }).click(),
    ]);
    const destination = path.join(f.root, 'download.csv');

    expect(download.suggestedFilename()).toBe('release.csv');
    await download.saveAs(destination);
    expect(await readFile(destination)).toEqual(document);
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}, 90000);
