import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import {
  journeyRead, openJourneySource, publishJourneyEditor, saveJourneySource, withAdminJourney,
} from '../support/admin-actions.js';
import { addJourneyParameters, editJourneyParameter } from '../support/admin-contracts.js';
import { createJourneySite, publishJourneyPage } from '../support/admin-journey.js';

it('authors nested contracts and a typed Snippet through UI and executes frozen Build and Request output', async () => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await openJourneySource(f, site, 'chunks', 'Typed chunk',
      '<p data-chunk>[[+config.caption]]|[[+config.enabled]]</p>');
    await addJourneyParameters(page, 'Chunk', [{
      name: 'config',
      kind: 'Object',
      defaultValue: { caption: 'Typed chunk', enabled: false },
      properties: [{ name: 'caption', kind: 'String' }, { name: 'enabled', kind: 'Boolean' }],
    }]);
    const chunk = await saveJourneySource(page, 'chunks');

    await openJourneySource(f, site, 'snippets', 'Typed phases',
      'const settings = input.settings as { note: string };'
      + 'return { summary: settings.note + "|" + input.enabled + "|" + input.count'
      + ' + "|" + (input.entries as string[]).join(",") + "|" + String(input.empty), phase: context.phase };');
    await page.getByRole('checkbox', { name: 'Build', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Request', exact: true }).uncheck();
    const code = await page.getByRole('textbox', { name: 'Server TypeScript', exact: true }).inputValue();
    const [refused] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/snippets')),
      page.getByRole('button', { name: 'Save draft', exact: true }).click(),
    ]);

    expect(refused.status()).toBe(400);
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('textbox', { name: 'Server TypeScript', exact: true }).inputValue()).toBe(code);
    expect(await journeyRead(f, site, '/snippets')).not.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ name: 'Typed phases' })]),
    });
    await page.getByRole('checkbox', { name: 'Build', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Request', exact: true }).check();
    await page.getByRole('checkbox', {
      name: 'Allow public document caching (CMS commands disabled)', exact: true,
    }).check();
    await page.getByLabel('Maximum accepted data age, seconds', { exact: true }).fill('17');
    await page.getByRole('checkbox', { name: 'Allow parallel reads (CMS commands disabled)', exact: true }).check();
    await addJourneyParameters(page, 'Snippet', [
      {
        name: 'settings',
        kind: 'Object',
        defaultValue: { note: 'typed' },
        properties: [{ name: 'note', kind: 'String' }],
      },
      { name: 'enabled', kind: 'Boolean', defaultValue: false },
      { name: 'count', kind: 'Number', defaultValue: 0 },
      { name: 'empty', kind: 'String', nullable: true, defaultValue: null },
      {
        name: 'entries',
        kind: 'Array',
        defaultValue: ['red', 'green'],
        items: { name: 'item', kind: 'Enum', values: ['red', 'green'] },
      },
    ]);
    await page.getByRole('button', { name: 'Result contract', exact: true }).click();
    await editJourneyParameter(page, '#element-Snippet-output-0', {
      name: 'value',
      kind: 'Object',
      properties: [
        { name: 'summary', kind: 'String', required: true },
        { name: 'phase', kind: 'Enum', values: ['Build', 'Request'], required: true },
      ],
    }, true);
    const snippet = await saveJourneySource(page, 'snippets');
    const stored = await journeyRead(f, site, '/snippets/' + snippet);

    expect(stored).toMatchObject({
      snippet: {
        phases: ['Build', 'Request'],
        execution: 'ParallelRead',
        cache: { scope: 'SharedPublic', maxAgeMs: 17000 },
        output: {
          kind: 'Object',
          properties: [
            { name: 'summary', kind: 'String', required: true },
            { name: 'phase', kind: 'Enum', values: ['Build', 'Request'], required: true },
          ],
        },
      },
    });
    await openJourneySource(f, site, 'templates', 'Typed layout',
      '<!doctype html><html><head><title>Typed contracts</title></head><body><h1>[[+layout.heading]]</h1>'
      + '[[$' + chunk + ']]'
      + '[[' + snippet + '? &as=`buildData`]]<p data-build>[[+buildData.summary]] / [[+buildData.phase]]</p>'
      + '[[!' + snippet + '? &as=`requestData`]]<p data-request>[[+requestData.summary]] / [[+requestData.phase]]</p>'
      + '</body></html>');
    await addJourneyParameters(page, 'Template', [{
      name: 'layout',
      kind: 'Object',
      defaultValue: { heading: 'Typed layout' },
      properties: [{ name: 'heading', kind: 'String', required: true }],
    }]);
    const template = await saveJourneySource(page, 'templates');
    const editor = await publishJourneyPage(f, site, 'Contracts', '/contracts/');
    const pageId = editor.split('/').at(-1)!;

    await f.configureRendering(site.split('/').at(-1)!, pageId, template, HtmlDelivery.Request);
    await page.goto(editor);
    await publishJourneyEditor(f, site);
    const publicPage = await f.context.newPage();

    await publicPage.goto(origin + '/contracts/');
    expect(await publicPage.getByRole('heading', { level: 1 }).textContent()).toBe('Typed layout');
    expect(await publicPage.locator('[data-chunk]').textContent()).toBe('Typed chunk|false');
    expect(await publicPage.locator('[data-build]').textContent()).toBe('typed|false|0|red,green|null / Build');
    expect(await publicPage.locator('[data-request]').textContent()).toBe('typed|false|0|red,green|null / Request');
    await publicPage.reload();
    expect(await publicPage.locator('[data-request]').textContent()).toBe('typed|false|0|red,green|null / Request');
    await publicPage.close();
    await page.goto(origin + site + '/templates/' + template);
    await page.getByRole('button', { name: 'Parameters', exact: true }).click();
    expect(await page.locator('#element-Template-0-default').inputValue()).toBe('{"heading":"Typed layout"}');
  });
}, 120000);

it.each(['templates', 'chunks'])('corrects real TypeScript compilation failure from the %s editor', async (section) => {
  await withAdminJourney(async (f) => {
    const { page, origin } = f;
    const site = await createJourneySite(f);

    await openJourneySource(f, site, 'chunks', 'Script chunk', '<p data-script>Script chunk</p>');
    const chunk = await saveJourneySource(page, 'chunks');

    await openJourneySource(f, site, 'templates', 'Script layout',
      '<!doctype html><html><head><title>Scripts</title></head><body>[[$' + chunk + ']]</body></html>');
    const template = await saveJourneySource(page, 'templates');
    const editor = await publishJourneyPage(f, site, 'Scripts', '/scripts/');

    await page.locator('#page-template').selectOption(template);
    await publishJourneyEditor(f, site);
    const before = await (await fetch(origin + '/scripts/')).text();
    const key = section === 'templates' ? template : chunk;

    await page.goto(origin + site + '/' + section + '/' + key);
    await page.getByRole('button', { name: 'Browser TypeScript', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Browser TypeScript', exact: true });

    await input.fill('const broken: = ;');
    await page.getByRole('button', { name: 'Save & apply', exact: true }).click();
    await page.getByRole('alert').waitFor();
    expect(await input.inputValue()).toBe('const broken: = ;');
    expect(await (await fetch(origin + '/scripts/')).text()).toBe(before);
    expect(await journeyRead(f, site, '/' + section + '/' + key)).toMatchObject({
      browserTypeScript: 'const broken: = ;',
    });
    await input.fill('document.querySelector("[data-script]")?.setAttribute("data-compiled", "yes");');
    await page.getByRole('button', { name: 'Save & apply', exact: true }).click();
    await page.getByText('Changes saved and applied. Site published.', { exact: true }).waitFor();
    const publicPage = await f.context.newPage();

    await publicPage.goto(origin + '/scripts/');
    await publicPage.locator('[data-script][data-compiled="yes"]').waitFor();
    await publicPage.close();
    await page.reload();
    await page.getByRole('button', { name: 'Browser TypeScript', exact: true }).click();
    expect(await input.inputValue()).toContain('data-compiled');
    expect((await journeyRead(f, site, '/pages/' + editor.split('/').at(-1)!)).status).toBe('PUBLISHED');
  });
}, 120000);
