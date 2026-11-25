import sharp from 'sharp';

import {
  journeyRead, openJourneySource, publishJourneyEditor, reloadJourneyEditor, saveJourneySource,
  saveJourneyTv, withAdminJourney,
} from '../support/admin-actions.js';
import { createJourneySite, type IAdminJourney, publishJourneyPage } from '../support/admin-journey.js';

async function tvTemplate(f: IAdminJourney, site: string, name: string): Promise<string> {
  await openJourneySource(f, site, 'templates', name,
    '<!doctype html><html><head><title>TV</title></head><body><p>[[*note]]</p></body></html>');

  return saveJourneySource(f.page, 'templates');
}

async function addTextTv(f: IAdminJourney, site: string, name: string, caption: string): Promise<void> {
  await f.page.goto(f.origin + site + '/template-variables');
  await f.page.getByRole('button', { name: 'Create TV', exact: true }).click();
  await f.page.locator('#tv-name').fill(name);
  await f.page.locator('#tv-caption').fill(caption);
}

it('corrects invalid TV catalogs and applies template assignments and field ordering to page forms', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);
    const first = await tvTemplate(f, site, 'First layout');
    const second = await tvTemplate(f, site, 'Second layout');

    await addTextTv(f, site, 'note', 'First field');
    await saveJourneyTv(page, 400);
    expect(await page.locator('#tv-name').inputValue()).toBe('note');
    expect(await journeyRead(f, site, '/template-variables')).toMatchObject({ fields: [] });
    await page.getByRole('checkbox', { name: 'First layout', exact: true }).check();
    await saveJourneyTv(page);
    const beforeDuplicate = await journeyRead(f, site, '/template-variables');

    await page.getByRole('button', { name: 'Create TV', exact: true }).click();
    await page.locator('#tv-name').fill('note');
    await page.locator('#tv-caption').fill('Second field');
    await page.getByRole('checkbox', { name: 'First layout', exact: true }).check();
    await saveJourneyTv(page, 400);
    expect(await journeyRead(f, site, '/template-variables')).toEqual(beforeDuplicate);
    expect(await page.locator('#tv-caption').inputValue()).toBe('Second field');
    await page.locator('#tv-name').fill('other');
    await page.locator('#tv-order').fill('10');
    await saveJourneyTv(page);
    const editor = await publishJourneyPage(f, site, 'TV order', '/tv-order/');

    await page.locator('#page-template').selectOption(first);
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    expect(await page.locator('.tv-page-field h3').allTextContents()).toEqual(['Second field', 'First field']);
    await page.getByRole('textbox', { name: 'Second field', exact: true }).fill('Retained second value');
    await page.getByRole('textbox', { name: 'First field', exact: true }).fill('First value');
    await publishJourneyEditor(f, site);
    await page.goto(origin + site + '/template-variables');
    await page.locator('.tv-row').filter({ hasText: 'First field' }).click();
    await page.getByRole('checkbox', { name: 'First layout', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Second layout', exact: true }).check();
    await saveJourneyTv(page);
    await page.goto(editor);
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    expect(await page.locator('.tv-page-field h3').allTextContents()).toEqual(['Second field']);
    expect(await page.getByRole('textbox', { name: 'Second field', exact: true }).inputValue())
      .toBe('Retained second value');
    await page.getByRole('tab', { name: 'Main', exact: true }).click();
    await page.locator('#page-template').selectOption(second);
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    expect(await page.locator('.tv-page-field h3').allTextContents()).toEqual(['First field']);
    expect(await page.getByRole('textbox', { name: 'First field', exact: true }).inputValue()).toBe('First value');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved', { exact: true }).waitFor();
    await page.waitForURL(origin + site);
    await page.goto(editor);
    await page.locator('#page-template').selectOption(first);
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    expect(await page.getByRole('textbox', { name: 'Second field', exact: true }).inputValue())
      .toBe('Retained second value');
  });
}, 120000);

it.each(['catalog', 'media'])('keeps page TV inputs on a stale %s conflict and recovers', async (change) => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);
    const template = await tvTemplate(f, site, 'Concurrent layout');

    await addTextTv(f, site, 'note', 'Concurrent note');
    await page.getByRole('checkbox', { name: 'Concurrent layout', exact: true }).check();
    await saveJourneyTv(page);

    if (change === 'media') {
      await page.getByRole('button', { name: 'Create TV', exact: true }).click();
      await page.locator('#tv-name').fill('photo');
      await page.locator('#tv-caption').fill('Concurrent image');
      await page.locator('#tv-kind').selectOption('Image');
      await page.getByRole('checkbox', { name: 'Concurrent layout', exact: true }).check();
      await saveJourneyTv(page);
      await page.goto(origin + site + '/files');
      await page.locator('.file-upload input[type=file]').setInputFiles({
        name: 'baseline.png',
        mimeType: 'image/png',
        buffer: await sharp({ create: { width: 80, height: 50, channels: 3, background: '#385a48' } }).png().toBuffer(),
      });
      await page.getByRole('button', { name: 'Upload images', exact: true }).click();
      await page.getByRole('link', { name: 'baseline.png', exact: true }).waitFor();
    }

    const editor = await publishJourneyPage(f, site, 'Concurrent TV', '/concurrent-tv/');

    await page.locator('#page-template').selectOption(template);
    await publishJourneyEditor(f, site);
    await page.goto(editor);
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    await page.getByRole('textbox', { name: 'Concurrent note', exact: true }).fill('Unsaved TV text');

    if (change === 'media') {
      await page.getByRole('button', { name: 'Concurrent image', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Image library', exact: true });

      await dialog.getByRole('button', { name: 'baseline.png', exact: true }).click();
      await dialog.getByRole('button', { name: 'Use image', exact: true }).click();
    }

    const other = await f.context.newPage();

    other.setDefaultTimeout(10000);
    other.on('pageerror', (error) => f.errors.push(error.message));

    if (change === 'catalog') {
      await other.goto(origin + site + '/template-variables');
      await other.locator('.tv-row').filter({ hasText: 'Concurrent note' }).click();
      await other.locator('#tv-description').fill('Updated in another editor');
      await saveJourneyTv(other);
    } else {
      await other.goto(origin + site + '/files');
      await other.locator('.file-upload input[type=file]').setInputFiles({
        name: 'concurrent.png',
        mimeType: 'image/png',
        buffer: await sharp({ create: { width: 80, height: 50, channels: 3, background: '#385a48' } }).png().toBuffer(),
      });
      await other.getByRole('button', { name: 'Upload images', exact: true }).click();
      await other.getByRole('link', { name: 'concurrent.png', exact: true }).waitFor();
    }

    const pageId = editor.split('/').at(-1)!;
    const [conflict] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/pages/' + pageId + '/template-variables')
        && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Save draft', exact: true }).click(),
    ]);

    expect(conflict.status()).toBe(409);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('textbox', { name: 'Concurrent note', exact: true }).inputValue())
      .toBe('Unsaved TV text');
    expect((await journeyRead(f, site, '/pages/' + pageId)).tvValues ?? {}).toEqual({});
    expect(await (await fetch(origin + '/concurrent-tv/')).text()).not.toContain('Unsaved TV text');
    await reloadJourneyEditor(page);
    await page.getByRole('tab', { name: 'Template variables', exact: true }).click();
    await page.getByRole('textbox', { name: 'Concurrent note', exact: true }).fill('Recovered TV text');
    await publishJourneyEditor(f, site);
    expect((await journeyRead(f, site, '/pages/' + pageId)).tvValues).toEqual({ note: 'Recovered TV text' });
    expect(await (await fetch(origin + '/concurrent-tv/')).text()).toContain('Recovered TV text');
    await other.close();
  });
}, 90000);
