import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { readJsonLdCatalog } from '../../admin/src/features/json-ld/json-ld-api.js';
import { validateJsonLdCatalog } from '../../src/domain/json-ld/json-ld-catalog.js';
import { pageFixture } from '../support/pages.js';

it('edits JSON-LD profiles and typed shared references with keyboard access and responsive layouts', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit browser required');
  }

  const { version }: { version: string } = JSON.parse(await readFile('package.json', 'utf8'));
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const writes: unknown[] = [];
  let conflict = true;
  let catalog = readJsonLdCatalog({
    siteId: 'site-1',
    version: 'v1',
    profiles: [{
      profileId: 'article',
      name: 'Article',
      templateIds: ['ZaryaBasic'],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [{ property: 'headline', required: true, source: { kind: 'pageField', name: 'title' } }],
      }],
    }],
    objects: [{
      objectId: 'owner',
      name: 'Public owner',
      type: 'Person',
      properties: {
        name: { kind: 'text', value: '' },
        sameAs: { kind: 'list', value: [] },
        url: { kind: 'url', required: true, reference: { kind: 'external', url: 'https://example.test/' } },
      },
    }],
  }, 'site-1');
  const site = {
    siteId: 'site-1',
    mark: 'Site',
    name: 'Test site',
    primaryDomain: 'example.test',
    languages: ['en', 'ru'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };

  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(5000);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (url.origin !== 'http://localhost:31989') {
      await route.abort();

      return;
    }
    if (pathname === '/api/admin/auth/me') {
      await route.fulfill({ json: {} });
    } else if (pathname === '/api/admin/sites') {
      await route.fulfill({ json: { items: [site] } });
    } else if (pathname === '/api/admin/sites/site-1') {
      await route.fulfill({ json: site });
    } else if (pathname.endsWith('/json-ld')) {
      if (route.request().method() === 'POST') {
        const body: unknown = route.request().postDataJSON();

        writes.push(body);

        if (conflict) {
          await route.fulfill({ status: 409, json: { error: 'Conflict' } });

          return;
        }

        const next: unknown = { ...Object(body), siteId: 'site-1', version: 'v2' };
        const parsed = readJsonLdCatalog(next, 'site-1');

        validateJsonLdCatalog(structuredClone(parsed));
        catalog = parsed;
      }
      await route.fulfill({ json: catalog });
    } else if (pathname.endsWith('/templates')) {
      await route.fulfill({
        json: {
          items: [{
            siteId: 'site-1',
            key: 'ZaryaBasic',
            name: 'Basic',
            kind: 'Template',
            version: 'v1',
            backupState: 'Ready',
            html: '',
            css: '',
            browserTypeScript: null,
            parameters: [],
          }],
        },
      });
    } else if (pathname.endsWith('/urls')) {
      await route.fulfill({
        json: {
          siteId: 'site-1',
          urls: [],
          published: null,
          pages: [{ pageId: 'page-1', title: 'About', language: 'en', status: 'DRAFT', robotsIndex: true }],
        },
      });
    } else if (pathname.endsWith('/publication')) {
      await route.fulfill({ json: { templates: [], pageAvailability: [] } });
    } else if (pathname.endsWith('/settings')) {
      await route.fulfill({ json: { timeZone: 'UTC' } });
    } else if (pathname.startsWith('/api/')) {
      await route.fulfill({ json: { items: [] } });
    } else {
      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture asset');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    }
  });

  try {
    await page.goto('http://localhost:31989/admin/sites/site-1/jsonLd');
    const drawer = page.getByRole('complementary', { name: 'JSON-LD', exact: true });

    await page.getByText('CMS Zarya v.' + version, { exact: true }).waitFor();
    const createButton = drawer.getByRole('button', { name: 'Create', exact: true });

    await createButton.waitFor();

    for (const width of [320, 575, 576, 991, 992, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await createButton.evaluate((element) => {
        const button = element.getBoundingClientRect();
        const icon = element.querySelector('svg')!.getBoundingClientRect();

        return {
          width: button.width,
          height: button.height,
          dx: icon.x + icon.width / 2 - button.x - button.width / 2,
          dy: icon.y + icon.height / 2 - button.y - button.height / 2,
        };
      });

      expect(geometry.width, String(width)).toBe(44);
      expect(geometry.height, String(width)).toBe(44);
      expect(Math.abs(geometry.dx), String(width)).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.dy), String(width)).toBeLessThanOrEqual(1);
    }
    await createButton.click();
    const presets = drawer.getByRole('group', { name: 'Create from preset', exact: true });

    await presets.waitFor();

    if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY) {
      await page.screenshot({ path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-presets.png') });
    }
    expect(await presets.getByRole('button', { name: 'Web page', exact: true }).count()).toBe(1);
    expect(await presets.getByRole('button', { name: 'Article', exact: true }).count()).toBe(1);
    expect(await presets.getByRole('button', { name: 'Service', exact: true }).count()).toBe(1);

    for (const [name, type] of [['Web page', 'WebPage'], ['Article', 'Article'], ['Service', 'Service']] as const) {
      const button = presets.getByRole('button', { name, exact: true });

      expect(await button.locator('svg[data-jsonld-icon="' + type + '"]').count()).toBe(1);
      expect(await button.locator('> :last-child').getAttribute('data-jsonld-icon')).toBe(type);
    }
    await presets.getByRole('button', { name: 'Service', exact: true }).click();
    await page.getByLabel('Profile name', { exact: true }).fill('Consultations').catch(async () => {
      throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText() }));
    });
    await page.getByRole('button', { name: 'Provider', exact: true }).click();
    await page.locator('.reference-popup input').fill('Public owner');
    await page.locator('.reference-popup input').press('ArrowDown');
    await page.locator('.reference-popup input').press('Enter');
    conflict = false;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Draft saved' }).waitFor();
    const service = catalog.profiles.find((item) => item.name === 'Consultations');

    expect(service?.nodes.map((node) => node.type)).toEqual(['WebPage', 'Service']);
    expect(service?.nodes[1]?.mappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: 'provider', source: { kind: 'sharedObject', objectId: 'owner' } }),
      expect.objectContaining({ property: 'mainEntityOfPage', source: { kind: 'currentPage' } }),
    ]));
    expect(writes).toHaveLength(1);
    writes.length = 0;
    conflict = true;
    const help = page.locator('.json-ld-editor details._element-syntax');
    const helpSummary = help.locator('summary');

    await helpSummary.waitFor();
    expect(await help.getAttribute('open')).toBeNull();
    await helpSummary.focus();
    await helpSummary.press('Enter');
    expect(await help.getAttribute('open')).not.toBeNull();
    expect(await help.innerText()).toContain('Person');
    expect(await help.innerText()).toContain('mainEntityOfPage');
    expect(await help.innerText()).not.toContain('without a legal entity');
    expect(await help.innerText()).toContain('"@type": "WebPage"');
    expect(await help.innerText()).toContain('[[~52]]');
    expect(await help.innerText()).toContain('https://directory.example.test/people/anna');
    expect(await help.innerText()).toContain('Saving does not update the public site');
    expect(writes).toHaveLength(0);

    if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY) {
      await page.screenshot({ path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-help.png') });
    }
    await helpSummary.press('Enter');
    expect(await help.getAttribute('open')).toBeNull();

    await drawer.getByRole('button', { name: 'Article · Article', exact: true }).waitFor().catch(async () => {
      throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText() }));
    });
    const articleRow = drawer.getByRole('button', { name: 'Article · Article', exact: true });

    expect(await articleRow.locator('> :last-child').getAttribute('data-jsonld-icon')).toBe('Article');
    await articleRow.click();
    const profileTab = drawer.getByRole('tab', { name: 'Profiles', exact: true });

    await profileTab.waitFor();
    expect(await profileTab.getAttribute('aria-selected')).toBe('true');
    await profileTab.focus();
    await profileTab.press('ArrowRight');
    const objectsTab = drawer.getByRole('tab', { name: 'Shared objects', exact: true });

    expect(await objectsTab.getAttribute('aria-selected')).toBe('true');
    await page.keyboard.press('ArrowLeft');
    await drawer.getByRole('button', { name: 'Article · Article', exact: true }).click();
    const heading = page.locator('.json-ld-editor ._workspace-title');
    const name = page.getByLabel('Profile name', { exact: true });

    expect(Math.abs((await heading.boundingBox())!.x - (await name.boundingBox())!.x)).toBeLessThan(1);
    const schemaType = page.getByLabel('Schema.org type', { exact: true });

    await schemaType.fill('Event');
    const customRow = drawer.getByRole('button', { name: 'Article · Event', exact: true });

    expect(await customRow.locator('> :last-child').getAttribute('data-jsonld-icon')).toBe('Custom');
    expect(await customRow.getAttribute('title')).toContain('Event');
    await schemaType.fill('WebSite');
    expect(await drawer.getByRole('button', { name: 'Article · WebSite', exact: true })
      .locator('> :last-child').getAttribute('data-jsonld-icon')).toBe('WebSite');
    await schemaType.fill('Article');
    const source = page.getByLabel('Source', { exact: true });
    const field = page.getByLabel('Page field', { exact: true });
    const availableFields = await field.locator('option').evaluateAll((options) =>
      options.map((option) => option.getAttribute('value')).filter((value) => value));
    const actualPage = pageFixture().toState();

    for (const fieldName of availableFields) {
      expect(Object.hasOwn(actualPage, fieldName!), 'existing page field: ' + fieldName).toBe(true);
    }

    for (const profile of catalog.profiles) {
      for (const node of profile.nodes) {
        for (const mapping of node.mappings.filter((mapping) => mapping.source.kind === 'pageField')) {
          expect(Object.hasOwn(actualPage, mapping.source.name!), 'preset field: ' + mapping.source.name).toBe(true);
        }
      }
    }
    expect((await source.boundingBox())!.y).toBe((await field.boundingBox())!.y);
    expect(await page.getByRole('button', { name: 'Template', exact: true }).locator('svg').count()).toBe(1);
    expect(await page.getByLabel('Schema.org type', { exact: true }).getAttribute('placeholder')).toBe('WebPage');
    const nodeActions = page.locator('.json-ld-form > ._form-actions');

    for (const button of await nodeActions.getByRole('button').all()) {
      expect(await button.getAttribute('class')).toContain('cms-secondary');
      expect(await button.locator('svg').count()).toBe(1);
    }

    if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY) {
      await page.screenshot({ path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-profile.png') });
    }

    await page.setViewportSize({ width: 320, height: 900 });
    expect((await field.boundingBox())!.y).toBeGreaterThan((await source.boundingBox())!.y);
    await expect.poll(async () => (await heading.boundingBox())?.height ?? Infinity).toBeLessThan(30);
    const actionBoxes = await Promise.all((await nodeActions.getByRole('button').all()).map((button) =>
      button.boundingBox()));

    expect(actionBoxes[0]!.y).toBe(actionBoxes[1]!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY) {
      await page.screenshot({ path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-mobile.png') });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const scroll = page.locator('.json-ld-editor ._workspace-scroll');

    expect(await scroll.evaluate((element) => element.getAttribute('data-scrolled'))).toBe('false');
    await scroll.evaluate((element) => {
      element.scrollTop = 1;
    });
    await page.waitForFunction(() => document.querySelector('.json-ld-editor ._workspace-scroll')
      ?.getAttribute('data-scrolled') === 'true');
    expect(await page.locator('.json-ld-editor ._workspace-toolbar').evaluate((element) =>
      getComputedStyle(element).boxShadow)).not.toBe('none');
    await scroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForFunction(() => document.querySelector('.json-ld-editor ._workspace-scroll')
      ?.getAttribute('data-scrolled') !== 'true');
    expect(await page.locator('.json-ld-editor ._workspace-toolbar').evaluate((element) =>
      getComputedStyle(element).boxShadow)).toBe('none');
    await page.getByLabel('Entity key', { exact: true }).selectOption('source');
    const keySettings = page.getByRole('region', { name: 'Entity key source', exact: true });

    await keySettings.getByLabel('TV name / snippet alias', { exact: true }).fill('nearest');
    await keySettings.getByLabel('Property path (dot separated)', { exact: true }).fill('sessionId');
    await page.getByLabel('Node presence', { exact: true }).selectOption('source');
    const presenceSettings = page.getByRole('region', { name: 'Node presence condition', exact: true });

    await presenceSettings.getByLabel('TV name / snippet alias', { exact: true }).fill('nearest');
    await presenceSettings.getByLabel('Property path (dot separated)', { exact: true }).fill('present');

    for (const width of [320, 767, 768, 991, 992, 1440]) {
      await page.setViewportSize({ width, height: 900 });

      for (const group of [keySettings, presenceSettings]) {
        const alias = group.getByLabel('TV name / snippet alias', { exact: true });
        const [aliasBox, pathBox] = await group.locator('input').evaluateAll((inputs) => inputs.map((input) => {
          const box = input.getBoundingClientRect();

          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }));

        if (width >= 768) {
          expect(Math.abs(aliasBox!.y - pathBox!.y), 'paired fields at ' + width).toBeLessThan(1);
          expect(pathBox!.x - aliasBox!.x - aliasBox!.width).toBeGreaterThanOrEqual(20);
        } else {
          expect(pathBox!.y - aliasBox!.y - aliasBox!.height).toBeGreaterThanOrEqual(24);
        }

        const spacing = await alias.evaluate((element) => {
          if (!(element instanceof HTMLInputElement)) {
            throw new Error('Expected an input');
          }

          const input = element;
          const label = input.labels![0]!.getBoundingClientRect();
          const box = input.getBoundingClientRect();
          const source = input.closest('section')!.querySelector('select')!.getBoundingClientRect();

          return { labelGap: box.y - label.bottom, rowGap: label.y - source.bottom };
        });

        expect(spacing.labelGap, 'label belongs to its input at ' + width).toBeGreaterThanOrEqual(8);
        expect(spacing.rowGap, 'separate field rows at ' + width).toBeGreaterThanOrEqual(24);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const settingsOverflow = await page.locator('._jsonld-node-settings').evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));

      expect(settingsOverflow.scrollWidth, 'settings stay inside the editor at ' + width)
        .toBeLessThanOrEqual(settingsOverflow.width);

      if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY && [320, 768, 1440].includes(width)) {
        await page.locator('._jsonld-node-settings').screenshot({
          path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-node-settings-' + width + '.png'),
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY) {
      await keySettings.screenshot({
        path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'json-ld-node-key-source.png'),
      });
    }
    await page.getByLabel('Profile name', { exact: true }).fill('Unsaved article');
    await page.getByRole('button', { name: 'Template', exact: true }).click();
    await page.locator('.reference-popup input').fill('Basic');
    await page.locator('.reference-popup input').press('ArrowDown');
    await page.locator('.reference-popup input').press('Enter');
    await page.locator('.reference-popup').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Another editor' }).waitFor();
    expect(await page.getByLabel('Profile name', { exact: true }).inputValue()).toBe('Unsaved article');
    conflict = false;
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Draft saved' }).waitFor();
    expect(catalog.profiles[0]?.templateIds).toEqual(['ZaryaBasic']);
    expect(catalog.profiles[0]?.nodes[0]).toMatchObject({
      keySource: { kind: 'snippet', name: 'nearest', path: ['sessionId'] },
      presenceSource: { kind: 'snippet', name: 'nearest', path: ['present'] },
    });
    await drawer.getByRole('button', { name: 'Unsaved article · Article', exact: true }).click();
    expect(await page.getByLabel('Entity key', { exact: true }).inputValue()).toBe('source');
    expect(await page.getByLabel('Node presence', { exact: true }).inputValue()).toBe('source');
    await drawer.getByRole('tab', { name: 'Shared objects', exact: true }).click();
    const personRow = drawer.getByRole('button', { name: /Public owner/ });

    expect(await personRow.locator('> :last-child').getAttribute('data-jsonld-icon')).toBe('Person');
    expect(await personRow.getAttribute('title')).toContain('Person');
    await personRow.click();
    await page.getByPlaceholder('Full name', { exact: true }).waitFor();
    expect(await page.getByLabel('Values (one per line)', { exact: true }).getAttribute('placeholder'))
      .toBe('https://directory.example.test/people/anna\nhttps://social.example.test/anna');
    await page.getByLabel('Address source', { exact: true }).selectOption('page');
    await page.getByRole('button', { name: 'Page', exact: true }).click();
    await page.locator('.reference-popup input').fill('About');
    await page.locator('.reference-popup input').press('ArrowDown');
    await page.locator('.reference-popup input').press('Enter');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Draft saved' }).waitFor();
    expect(catalog.objects[0]?.properties.url?.reference).toEqual({ kind: 'page', pageId: 'page-1' });
    expect(catalog.objects[0]?.properties.name?.value).toBe('');
    expect(catalog.objects[0]?.properties.sameAs?.value).toEqual([]);
    await helpSummary.click();
    expect(await help.getAttribute('open')).not.toBeNull();

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const overflow = await page.locator('.json-ld-editor').evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        children: Array.from(element.querySelectorAll('*')).filter((child) =>
          child.getBoundingClientRect().right > element.getBoundingClientRect().right)
          .map((child) => ({
            tag: child.tagName,
            className: child.className,
            text: child.textContent?.slice(0, 80),
            right: child.getBoundingClientRect().right,
          })),
      }));

      await expect.poll(async () => page.locator('.json-ld-editor').evaluate((element) =>
        element.scrollWidth <= element.clientWidth), { message: JSON.stringify({ width, overflow }) }).toBe(true);
    }
    await page.getByLabel('Interface language').selectOption('ru');
    await drawer.getByRole('tab', { name: 'Общие объекты', exact: true }).waitFor();
    expect(await page.getByLabel('Источник адреса', { exact: true }).inputValue()).toBe('page');
    expect(await helpSummary.innerText()).toBe('JSON-LD: с чего начать');
    expect(await help.innerText()).toContain('JSON-LD сохранённого черновика');
    expect(await help.getAttribute('open')).not.toBeNull();
    await helpSummary.focus();
    await helpSummary.press('Enter');
    expect(await help.getAttribute('open')).toBeNull();
    expect(writes).toHaveLength(3);

    for (const [caption, type] of [['Человек', 'Person'], ['Организация', 'Organization']] as const) {
      await drawer.getByRole('button', { name: 'Создать', exact: true }).click();
      const choices = drawer.getByRole('group', { name: 'Создать из заготовки', exact: true });
      const choice = choices.getByRole('button', { name: caption, exact: true });

      expect(await choice.locator('> :last-child').getAttribute('data-jsonld-icon')).toBe(type);
      await choice.click();
      await page.getByLabel('Название в списке', { exact: true }).fill('Preset ' + type);
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Черновик сохранён' }).waitFor();
      const object = catalog.objects.find((item) => item.name === 'Preset ' + type);

      expect(object?.type).toBe(type);
      expect(object?.properties.name).toEqual({ kind: 'text', value: '' });
      expect(object?.properties.sameAs).toEqual({ kind: 'list', value: [] });
      expect(object?.properties.jobTitle !== undefined).toBe(type === 'Person');
    }
    await drawer.getByRole('tab', { name: 'Профили', exact: true }).click();

    for (const [caption, type] of [['Веб-страница', 'WebPage'], ['Статья', 'Article']] as const) {
      await drawer.getByRole('button', { name: 'Создать', exact: true }).click();
      const choices = drawer.getByRole('group', { name: 'Создать из заготовки', exact: true });
      const choice = choices.getByRole('button', { name: caption, exact: true });

      expect(await choice.locator('> :last-child').getAttribute('data-jsonld-icon')).toBe(type);
      await choice.click();
      await page.getByLabel('Название профиля', { exact: true }).fill('Preset ' + type);
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Черновик сохранён' }).waitFor();
      const profile = catalog.profiles.find((item) => item.name === 'Preset ' + type);

      expect(profile?.templateIds).toEqual([]);
      expect(profile?.nodes[0]?.type).toBe('WebPage');
      expect(profile?.nodes[0]?.mappings).toEqual(expect.arrayContaining([
        expect.objectContaining({ property: 'name', source: { kind: 'pageField', name: 'title' } }),
      ]));

      if (type === 'Article') {
        expect(profile?.nodes[1]?.type).toBe('Article');
        expect(profile?.nodes[1]?.mappings.some((mapping) => mapping.property === 'author')).toBe(false);
      } else {
        expect(profile?.nodes).toHaveLength(1);
      }
    }
    await drawer.getByRole('button', { name: 'Создать', exact: true }).click();
    const keyboardChoices = drawer.getByRole('group', { name: 'Создать из заготовки', exact: true });

    await keyboardChoices.getByRole('button', { name: 'Веб-страница', exact: true }).press('ArrowDown');
    expect(await keyboardChoices.getByRole('button', { name: 'Статья', exact: true }).evaluate((element) =>
      element === document.activeElement)).toBe(true);
    await page.keyboard.press('Escape');
    expect(await keyboardChoices.count()).toBe(0);
    expect(await drawer.getByRole('button', { name: 'Создать', exact: true }).evaluate((element) =>
      element === document.activeElement)).toBe(true);
    expect(writes).toHaveLength(7);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
}, 30000);
