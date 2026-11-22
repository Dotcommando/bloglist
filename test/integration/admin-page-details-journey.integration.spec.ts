import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import {
  journeyRead, publishJourneyEditor, withAdminJourney,
} from '../support/admin-actions.js';
import { createJourneySite, publishJourneyPage } from '../support/admin-journey.js';

it('saves manual page order, rejects an invalid order and publishes website/default Open Graph types', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);
    const other = await publishJourneyPage(f, site, 'Other', '/other/');
    const editor = await publishJourneyPage(f, site, 'Manual', '/manual/');
    const id = editor.split('/').at(-1)!;
    const writes: string[] = [];

    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/pages/' + id)) {
        writes.push(request.url());
      }
    });
    await page.locator('#page-order').fill('-1');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    expect(await page.locator('#page-order').evaluate((input) =>
      input instanceof HTMLInputElement && input.validity.rangeUnderflow)).toBe(true);
    expect(writes).toHaveLength(0);
    await page.locator('#page-order').fill('10');
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    await page.locator('#page-og-type').selectOption('website');
    await publishJourneyEditor(f, site);
    expect(await journeyRead(f, site, '/pages/' + id)).toMatchObject({ sortOrder: 10, ogType: 'website' });
    const selectedIds = [id, other.split('/').at(-1)!];
    const positions = await page.getByRole('treeitem').evaluateAll((nodes, ids) =>
      nodes.map((node) => node.getAttribute('data-page-id'))
        .filter((value) => value && ids.includes(value)), selectedIds);

    expect(positions).toEqual(selectedIds);
    async function expectPublishedWebsiteType(): Promise<void> {
      const response = await page.request.get(origin + '/manual/', { timeout: 10000 });

      expect(response.status()).toBe(200);
      expect(await response.text()).toMatch(/<meta\s+property="og:type"\s+content="website"\s*\/?\s*>/);
    }

    await expectPublishedWebsiteType();
    await page.goto(editor);
    expect(await page.locator('#page-order').inputValue()).toBe('10');
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    expect(await page.locator('#page-og-type').inputValue()).toBe('website');
    await page.locator('#page-og-type').selectOption('');
    await publishJourneyEditor(f, site);
    expect(await journeyRead(f, site, '/pages/' + id)).toMatchObject({ ogType: null, sortOrder: 10 });
    await expectPublishedWebsiteType();
    await page.goto(editor);
    await page.getByRole('tab', { name: 'Open Graph', exact: true }).click();
    expect(await page.locator('#page-og-type').inputValue()).toBe('');
  });
}, 90000);

it('validates Request cache TTL and applies enabling and disabling only on publication', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);
    const editor = await publishJourneyPage(f, site, 'Cached', '/cached/');
    const id = editor.split('/').at(-1)!;

    await f.configureRendering(site.split('/').at(-1)!, id, 'ZaryaBasic', HtmlDelivery.Request);
    await page.goto(editor);
    await page.getByRole('checkbox', { name: 'Enable shared server cache', exact: true }).check();
    const ttl = page.getByLabel('Cache lifetime, seconds', { exact: true });
    const before = await journeyRead(f, site, '/pages/' + id);

    for (const invalid of ['0', '3601', '1.5']) {
      await ttl.fill(invalid);
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      expect(await ttl.evaluate((input) => input instanceof HTMLInputElement && !input.validity.valid)).toBe(true);
      expect(await journeyRead(f, site, '/pages/' + id)).toEqual(before);
    }
    await ttl.fill('90');
    await publishJourneyEditor(f, site);
    const first = await fetch(origin + '/cached/');
    const firstBody = await first.text();
    const second = await fetch(origin + '/cached/');

    expect(first.status).toBe(200);
    expect(first.headers.get('x-zarya-cache')).toBe('miss');
    expect(second.headers.get('x-zarya-cache')).toBe('hit');
    expect(await second.text()).toBe(firstBody);
    expect(firstBody).toContain('Published Cached');
    await page.goto(editor);
    expect(await ttl.inputValue()).toBe('90');
    await page.getByRole('checkbox', { name: 'Enable shared server cache', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved', { exact: true }).waitFor();
    await page.waitForURL(origin + site);
    expect((await fetch(origin + '/cached/')).headers.get('x-zarya-cache')).toBe('hit');
    await page.goto(editor);
    expect(await page.getByRole('checkbox', { name: 'Enable shared server cache', exact: true })
      .isChecked()).toBe(false);
    await publishJourneyEditor(f, site);
    const uncached = await fetch(origin + '/cached/');

    expect(uncached.status).toBe(200);
    expect(uncached.headers.get('x-zarya-cache')).toBeNull();
    expect(await uncached.text()).toContain('Published Cached');
    expect((await journeyRead(f, site, '/pages/' + id)).rendering).toMatchObject({ delivery: 'Request' });
  });
}, 90000);

it('creates a page in a selected additional site language through real UI and retains it after reload', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await f.addLanguage(site.split('/').at(-1)!, 'ru');
    await page.goto(origin + site + '/pages/new');
    await page.locator('#page-title').fill('Русская страница');
    await page.locator('#page-language').selectOption('ru');
    await page.locator('#page-content').fill('Содержимое русской страницы');
    await page.locator('#page-path').fill('/ru/');
    await page.locator('#page-template').selectOption('ZaryaBasic');
    await publishJourneyEditor(f, site);
    await page.getByRole('treeitem', { name: /^Русская страница/ }).click();
    const editor = page.url();

    expect(await page.locator('#page-language').inputValue()).toBe('ru');
    expect(await journeyRead(f, site, '/pages/' + editor.split('/').at(-1)!)).toMatchObject({ language: 'ru' });
    await page.reload();
    expect(await page.locator('#page-language').inputValue()).toBe('ru');
    expect(await (await fetch(origin + '/ru/')).text()).toContain('Содержимое русской страницы');
  });
}, 60000);
