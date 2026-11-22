import sharp from 'sharp';

import type { IFileLibrary } from '../../admin/src/features/files/files.types.js';
import { journeyRead, reloadJourneyEditor, withAdminJourney } from '../support/admin-actions.js';
import { createJourneySite } from '../support/admin-journey.js';

it('replaces documents and all responsive variants through UI with stable identities and URLs', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await page.goto(origin + site + '/files');
    await page.getByRole('button', { name: 'assets/files', exact: true }).click();
    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'report.csv', mimeType: 'text/csv', buffer: Buffer.from('version\nold\n'),
    });
    await page.getByRole('button', { name: 'Upload files', exact: true }).click();
    await page.getByRole('button', { name: 'report.csv', exact: true }).click();
    const documentEditor = page.url();
    const documentUrl = await page.getByLabel('URL', { exact: true }).inputValue();
    const document = Buffer.from('version,value\nnew,42\n');
    const [changedDocument] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/change')),
      page.locator('.files-workspace input[type=file]').setInputFiles({
        name: 'updated.csv', mimeType: 'text/csv', buffer: document,
      }),
    ]);

    expect(changedDocument.status()).toBe(200);
    await page.locator('#files-workspace[aria-busy="false"]').waitFor();
    expect(page.url()).toBe(documentEditor);
    expect(await page.getByLabel('URL', { exact: true }).inputValue()).toBe(documentUrl);
    expect(Buffer.from(await (await fetch(new URL(documentUrl, origin))).arrayBuffer())).toEqual(document);
    await page.reload();
    expect(await page.locator('#file-name').inputValue()).toBe('report.csv');
    await page.goto(origin + site + '/files');
    await page.getByRole('button', { name: 'assets/images', exact: true }).click();
    const image = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#345f80' } })
      .png().toBuffer();

    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'responsive.png', mimeType: 'image/png', buffer: image,
    });
    await page.getByRole('combobox', { name: /^Processing/ }).selectOption('Responsive');
    await page.getByRole('button', { name: 'Upload images', exact: true }).click();
    await page.getByRole('button', { name: 'responsive.png', exact: true }).click();
    const imageEditor = page.url();
    const fileId = imageEditor.split('/').at(-1)!;
    const libraryBefore: IFileLibrary = await (await page.request.get(origin + '/api' + site + '/files')).json();
    const before = libraryBefore.files.find((file) => file.fileId === fileId)!;
    const previousBytes = await Promise.all(before.outputs.map(async (output) =>
      Buffer.from(await (await fetch(new URL(output.url, origin))).arrayBuffer())));
    const replacement = await sharp({ create: { width: 1920, height: 1280, channels: 3, background: '#d98030' } })
      .png().toBuffer();
    const [changedImage] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/change')),
      page.locator('.files-workspace input[type=file]').setInputFiles({
        name: 'replacement.png', mimeType: 'image/png', buffer: replacement,
      }),
    ]);

    expect(changedImage.status()).toBe(200);
    await page.locator('#files-workspace[aria-busy="false"]').waitFor();
    const libraryAfter: IFileLibrary = await (await page.request.get(origin + '/api' + site + '/files')).json();
    const after = libraryAfter.files.find((file) => file.fileId === fileId)!;

    expect(page.url()).toBe(imageEditor);
    expect(after).toMatchObject({
      name: 'responsive.png',
      mode: 'Responsive',
      hasVariants: true,
      originalDimensions: { width: 1920, height: 1280 },
    });
    expect(after.outputs.map((output) => output.url)).toEqual(before.outputs.map((output) => output.url));
    expect(after.outputs.length).toBeGreaterThan(1);
    await Promise.all(after.outputs.map(async (output, index) => {
      const response = await fetch(new URL(output.url, origin));
      const bytes = Buffer.from(await response.arrayBuffer());
      const actual = await sharp(bytes).metadata();

      expect(response.status).toBe(200);
      expect(bytes).not.toEqual(previousBytes[index]);
      expect(actual.format).toBe('webp');
      expect(Math.abs(actual.width! / actual.height! - 1.5)).toBeLessThan(0.02);
    }));
    await page.reload();
    expect(await page.locator('#file-name').inputValue()).toBe('responsive.png');
    const originalHref = await page.getByRole('link', { name: 'Download original', exact: true }).getAttribute('href');

    expect(Buffer.from(await (await page.request.get(new URL(originalHref!, origin).href)).body()))
      .toEqual(replacement);
  });
}, 90000);

it('creates nested folders, preserves a colliding name and saves a corrected sibling without overwriting', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await page.goto(origin + site + '/files');
    const folderName = page.getByLabel('New folder name', { exact: true });
    const saveFolder = page.getByRole('button', { name: 'Create folder', exact: true });
    const folderEndpoint = origin + '/api' + site + '/files/folders';

    async function createFolder(name: string, expectedStatus = 200): Promise<void> {
      await folderName.fill(name);
      const [response] = await Promise.all([
        page.waitForResponse((reply) => reply.url() === folderEndpoint && reply.request().method() === 'POST'),
        saveFolder.click(),
      ]);

      expect(response.status()).toBe(expectedStatus);
      await page.locator('#files-workspace[aria-busy="false"]').waitFor();
    }

    await createFolder('Parent');
    await page.getByRole('navigation', { name: 'File tree', exact: true })
      .getByRole('button', { name: 'Parent', exact: true }).click();
    await createFolder('Child');
    const before: IFileLibrary = await (await page.request.get(origin + '/api' + site + '/files')).json();
    const parent = before.folders.find((folder) => folder.name === 'Parent')!;
    const child = before.folders.find((folder) => folder.name === 'Child')!;

    expect(child.parentId).toBe(parent.folderId);
    await page.getByRole('navigation', { name: 'File tree', exact: true })
      .getByRole('button', { name: 'Parent', exact: true }).click();
    await createFolder('Child', 409);
    await page.getByRole('alert').waitFor();
    expect(await folderName.inputValue()).toBe('Child');
    expect(await journeyRead(f, site, '/files')).toEqual(before);
    await createFolder('Sibling');
    const after: IFileLibrary = await (await page.request.get(origin + '/api' + site + '/files')).json();

    expect(after.folders).toHaveLength(3);
    expect(after.folders.find((folder) => folder.name === 'Sibling')?.parentId).toBe(parent.folderId);
    await page.reload();
    await page.getByRole('button', { name: 'Expand or collapse folder Parent', exact: true }).click();
    await page.getByRole('navigation', { name: 'File tree', exact: true })
      .getByRole('button', { name: 'Child', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'File tree', exact: true })
      .getByRole('button', { name: 'Sibling', exact: true }).waitFor();
  });
}, 60000);

it.each(['name', 'folder'])('keeps pending file fields on a stale %s conflict and recovers', async (field) => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await page.goto(origin + site + '/files');
    await page.getByRole('button', { name: 'assets/files', exact: true }).click();
    await page.getByLabel('New folder name', { exact: true }).fill('Target');
    await page.getByRole('button', { name: 'Create folder', exact: true }).click();
    await page.getByRole('navigation', { name: 'File tree', exact: true })
      .getByRole('button', { name: 'assets/files', exact: true }).click();
    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'shared.csv', mimeType: 'text/csv', buffer: Buffer.from('shared\nvalue\n'),
    });
    await page.getByRole('button', { name: 'Upload files', exact: true }).click();
    await page.getByRole('button', { name: 'shared.csv', exact: true }).click();
    const editor = page.url();
    const fileId = editor.split('/').at(-1)!;
    const stale = await f.context.newPage();

    stale.setDefaultTimeout(10000);
    await stale.goto(editor);
    await stale.locator('#file-name').fill('losing.csv');
    const target = await stale.locator('#file-folder').getByRole('option', { name: /Target$/ }).getAttribute('value');

    await stale.locator('#file-folder').selectOption(target!);

    await page.locator('#file-name').fill('winning.csv');
    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/move') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save name', exact: true }).click(),
    ]);

    expect(saved.status()).toBe(200);
    await stale.getByRole('button', { name: field === 'name' ? 'Save name' : 'Save folder', exact: true }).click();
    await stale.getByRole('alert').waitFor();
    expect(await stale.locator('#file-name').inputValue()).toBe('losing.csv');
    expect(await stale.locator('#file-folder').inputValue()).toBe(target);
    const winning: IFileLibrary = await (await page.request.get(origin + '/api' + site + '/files')).json();

    expect(winning.files.find((file) => file.fileId === fileId)).toMatchObject({ name: 'winning.csv', folderId: null });
    await reloadJourneyEditor(stale);
    expect(await stale.locator('#file-name').inputValue()).toBe('winning.csv');
    await stale.locator('#file-folder').selectOption(target!);
    const [moved] = await Promise.all([
      stale.waitForResponse((r) => r.url().endsWith('/move') && r.request().method() === 'POST'),
      stale.getByRole('button', { name: 'Save folder', exact: true }).click(),
    ]);

    expect(moved.status()).toBe(200);
    const recovered: IFileLibrary = await (await page.request.get(origin + '/api' + site + '/files')).json();

    expect(recovered.files.find((file) => file.fileId === fileId))
      .toMatchObject({ name: 'winning.csv', folderId: target });
    await stale.close();
  });
}, 90000);
