import sharp from 'sharp';

import { adminJourney, createJourneySite } from '../support/admin-journey.js';

it('authors TV defaults, corrects required publication and edits definitions through real UI', async () => {
  const f = await adminJourney();
  const { page, origin } = f;
  let failed = true;

  try {
    const site = await createJourneySite(f);
    const visit = async (section: string): Promise<void> => {
      await page.goto(origin + site + '/' + section);
    };

    await visit('templates');
    await page.getByRole('button', { name: 'Create element', exact: true }).click();
    await page.getByLabel('Element name', { exact: true }).fill('TV layout');
    await page.getByRole('textbox', { name: 'HTML', exact: true }).fill(
      '<!doctype html><html><head><title>[[*title]]</title></head><body>'
      + '<p data-required>[[*requiredText]]</p><section data-details>[[*details:markdown]]</section>'
      + '<img src="[[*photo.src]]" alt="[[*photo.alt]]" width="[[*photo.width]]" height="[[*photo.height]]">'
      + '<a href="[[*attachment.url]]">[[*attachment.label]]</a></body></html>',
    );
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.waitForURL(/\/templates\/[0-9]+$/);
    await page.getByText('Draft saved. The public site has not changed.', { exact: true }).waitFor();
    const template = page.url().split('/').at(-1)!;

    await visit('files');
    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'default.png',
      mimeType: 'image/png',
      buffer: await sharp({ create: { width: 1400, height: 900, channels: 3, background: '#43674a' } })
        .png().toBuffer(),
    });
    await page.getByRole('button', { name: 'Upload images', exact: true }).click();
    await page.getByRole('button', { name: 'default.png', exact: true }).waitFor();
    await page.getByRole('button', { name: 'assets/files', exact: true }).click();
    await page.locator('.file-upload input[type=file]').setInputFiles({
      name: 'guide.json', mimeType: 'application/json', buffer: Buffer.from('{"guide":"TV attachment"}'),
    });
    await page.getByRole('button', { name: 'Upload files', exact: true }).click();
    await page.getByRole('button', { name: 'guide.json', exact: true }).waitFor();
    await visit('template-variables');
    const save = async (): Promise<void> => {
      await page.getByRole('button', { name: 'Save TV fields', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'TV fields saved' }).waitFor();
    };

    for (const [name, caption, kind] of [
      ['requiredText', 'Required text', 'Text'], ['details', 'Details', 'Markdown'],
      ['photo', 'Default photo', 'Image'], ['attachment', 'Attachment', 'File'],
    ]) {
      await page.getByRole('button', { name: 'Create TV', exact: true }).click();
      await page.locator('#tv-name').fill(name!);
      await page.locator('#tv-caption').fill(caption!);
      await page.locator('#tv-kind').selectOption(kind!);
      await page.getByLabel('TV layout', { exact: true }).check();

      if (kind === 'Text') {
        await page.getByRole('checkbox', { name: 'Required at publication', exact: true }).check();
      } else if (kind === 'Markdown') {
        await page.locator('#tv-default').fill('**Default details**');
      } else if (kind === 'Image') {
        await page.getByRole('button', { name: caption!, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Image library', exact: true });

        await dialog.getByRole('button', { name: 'default.png', exact: true }).click();
        await dialog.getByRole('button', { name: 'Use image', exact: true }).click();
        await page.locator('#tv-default-alt').fill('Default alternative text');
      } else {
        const value = await page.locator('#tv-default').getByRole('option', { name: /guide.json/ }).getAttribute('value');

        await page.locator('#tv-default').selectOption(value!);
        await page.locator('input#tv-default-label').fill('Download guide');
      }
      await save();
    }
    await page.reload();
    await page.locator('.tv-row').first().waitFor();
    expect(await page.locator('.tv-row').count()).toBe(4);
    await visit('pages/new');
    await page.locator('#page-title').fill('TV page');
    await page.locator('#page-template').selectOption(template);
    await page.locator('#page-path').fill('/tv/');
    const [rejected] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/publication')
        && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save & publish', exact: true }).click(),
    ]);

    expect(rejected.status()).toBe(400);
    await page.getByRole('alert').waitFor();
    expect((await fetch(origin + '/tv/')).status).toBe(404);
    expect(await page.locator('#page-title').inputValue()).toBe('TV page');
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    await page.getByRole('textbox', { name: 'Required text', exact: true }).fill('<b>Escaped text</b>');
    await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
    await page.getByText('Page published', { exact: true }).waitFor();
    const publicPage = await f.context.newPage();

    await publicPage.goto(origin + '/tv/');
    expect(await publicPage.locator('[data-required]').textContent()).toBe('<b>Escaped text</b>');
    expect(await publicPage.locator('[data-required] b').count()).toBe(0);
    expect(await publicPage.locator('[data-details] strong').textContent()).toBe('Default details');
    expect(await publicPage.getByRole('img').getAttribute('alt')).toBe('Default alternative text');
    const attachment = await publicPage.getByRole('link', { name: 'Download guide', exact: true }).getAttribute('href');

    expect(await (await fetch(new URL(attachment!, origin))).json()).toEqual({ guide: 'TV attachment' });
    await publicPage.close();
    await page.waitForURL(origin + site);
    await visit('template-variables');
    await page.locator('.tv-row').filter({ hasText: 'Details' }).click();
    expect(await page.locator('#tv-name').isEditable()).toBe(false);
    await page.locator('#tv-caption').fill('Revised details');
    await page.locator('#tv-description').fill('Editorial help');
    await page.locator('#tv-order').fill('-10');
    await page.locator('#tv-kind').selectOption('Text');
    expect(await page.locator('#tv-default').inputValue()).toBe('');
    await page.locator('#tv-default').fill('Plain default');
    await save();
    await page.reload();
    await page.locator('.tv-row').filter({ hasText: 'Revised details' }).click();
    expect(await page.locator('#tv-kind').inputValue()).toBe('Text');
    expect(await page.locator('#tv-description').inputValue()).toBe('Editorial help');
    expect(await page.locator('#tv-order').inputValue()).toBe('-10');
    expect(await page.locator('#tv-default').inputValue()).toBe('Plain default');
    await page.locator('#tv-default').fill('');
    await save();
    await page.reload();
    await page.locator('.tv-row').filter({ hasText: 'Revised details' }).click();
    expect(await page.locator('#tv-default').inputValue()).toBe('');
    await page.getByRole('button', { name: 'Remove field', exact: true }).click();
    await save();
    await page.reload();
    await page.locator('.tv-row').first().waitFor();
    expect(await page.locator('.tv-row').count()).toBe(3);
    expect(await page.locator('.tv-row').filter({ hasText: 'Revised details' }).count()).toBe(0);
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}, 120000);

it('retains the losing TV editor input on a real catalog conflict and reloads the winning values', async () => {
  const f = await adminJourney();
  const { page, origin } = f;
  let failed = true;

  try {
    const site = await createJourneySite(f);

    await page.goto(origin + site + '/template-variables');
    await page.getByRole('button', { name: 'Create TV', exact: true }).click();
    await page.locator('#tv-name').fill('sharedField');
    await page.locator('#tv-caption').fill('Shared field');
    await page.locator('._template-options').getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Save TV fields', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'TV fields saved' }).waitFor();
    const stale = await f.context.newPage();

    stale.setDefaultTimeout(10000);
    stale.on('pageerror', (error) => f.errors.push(error.message));
    await stale.goto(origin + site + '/template-variables');
    await stale.locator('.tv-row').filter({ hasText: 'Shared field' }).click();
    await stale.locator('#tv-caption').fill('Losing edit');
    await page.locator('#tv-caption').fill('Winning edit');
    await page.locator('#tv-description').fill('Saved by the other editor');
    await page.getByRole('button', { name: 'Save TV fields', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'TV fields saved' }).waitFor();
    const [conflict] = await Promise.all([
      stale.waitForResponse((response) => response.url().endsWith('/template-variables')
        && response.request().method() === 'POST'),
      stale.getByRole('button', { name: 'Save TV fields', exact: true }).click(),
    ]);

    expect(conflict.status()).toBe(409);
    await stale.getByRole('alert').waitFor();
    expect(await stale.locator('#tv-caption').inputValue()).toBe('Losing edit');
    const saved = await (await page.request.get(origin + '/api' + site + '/template-variables')).json();

    expect(saved).toMatchObject({
      fields: [expect.objectContaining({
        name: 'sharedField', caption: 'Winning edit', description: 'Saved by the other editor',
      })],
    });
    stale.once('dialog', (dialog) => dialog.accept());
    await stale.reload();
    await stale.locator('.tv-row').filter({ hasText: 'Winning edit' }).click();
    expect(await stale.locator('#tv-caption').inputValue()).toBe('Winning edit');
    expect(await stale.locator('#tv-description').inputValue()).toBe('Saved by the other editor');
    await stale.close();
    expect(f.errors).toEqual([]);
    failed = false;
  } finally {
    await f.close(failed);
  }
}, 60000);
