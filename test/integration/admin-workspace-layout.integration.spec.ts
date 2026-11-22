import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-core';

it('keeps settings scrolling at the workspace edge and aligns menu headers and actions', async () => {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 600 } });

  page.setDefaultTimeout(3000);
  const errors: string[] = [];
  const site = {
    siteId: 'site-1',
    mark: 'Site',
    name: 'Synthetic site',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };

  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.route('**/*', async (route) => {
      const pathname = new URL(route.request().url()).pathname;

      if (pathname.startsWith('/api/')) {
        let json: unknown = { items: [] };

        if (pathname.endsWith('/auth/me')) {
          json = {};
        } else if (pathname === '/api/admin/sites') {
          json = { items: [site] };
        } else if (pathname === '/api/admin/sites/site-1') {
          json = site;
        } else if (pathname === '/api/admin/installation/settings') {
          json = { adminOrigin: 'https://admin.example.test', version: 'v1' };
        } else if (pathname.endsWith('/settings')) {
          json = {
            siteId: site.siteId,
            timeZone: 'UTC',
            addresses: { publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3000', originMode: 'Local' },
          };
        } else if (pathname.endsWith('/publication')) {
          json = { templates: [], pageAvailability: [] };
        } else if (pathname.endsWith('/hooks')) {
          json = { hooks: [], handlers: [] };
        } else if (pathname.endsWith('/files')) {
          json = { version: 'v1', pending: false, files: [], folders: [] };
        } else if (pathname.endsWith('/template-variables')) {
          json = { siteId: site.siteId, version: 'v1', fields: [] };
        } else if (pathname.endsWith('/json-ld')) {
          json = {
            siteId: site.siteId,
            version: 'v1',
            profiles: [{
              profileId: 'long-profile',
              name: 'A very long profile title which must never change the drawer width '.repeat(3),
              templateIds: [],
              nodes: [{ role: 'webpage', type: 'WebPage', mappings: [] }],
            }],
            objects: [{
              objectId: 'long-person',
              name: 'A very long shared person name which must never change the drawer width '.repeat(3),
              type: 'Person',
              properties: {},
            }],
          };
        } else if (pathname.endsWith('/urls')) {
          json = { siteId: site.siteId, urls: [], pages: [], published: null };
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
    await page.goto('http://localhost:31989/admin/sites/site-1/settings');
    await page.locator('.admin-language select').selectOption('ru');
    const settings = page.getByRole('main', { name: 'Настройки', exact: true });

    await settings.getByLabel('Локальный порт', { exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Настройки', exact: true }).count()).toBe(1);
    const scroll = settings.locator('._workspace-scroll');
    const geometry = await scroll.evaluate((element) => ({
      right: element.getBoundingClientRect().right,
      parentRight: element.parentElement!.getBoundingClientRect().right,
      overflowing: element.scrollHeight > element.clientHeight,
    }));

    expect(geometry.right).toBe(geometry.parentRight);
    expect(geometry.overflowing).toBe(true);
    const menuBox = await page.locator('.site-sections').boundingBox();
    const tabsBox = await settings.locator('> .cms-tabs').boundingBox();
    const toolbarBox = await settings.locator('> ._workspace-toolbar').boundingBox();

    expect(tabsBox!.y).toBe(menuBox!.y + menuBox!.height);
    expect(toolbarBox!.y).toBe(tabsBox!.y + tabsBox!.height);
    const toolbar = settings.locator('> ._workspace-toolbar');
    const tabs = settings.locator('> .cms-tabs');

    for (const width of [390, 575, 576, 1440, 2560]) {
      await page.setViewportSize({ width, height: 600 });
      const mainMenu = page.locator('.site-sections');
      const firstSection = await mainMenu.locator('> button').first().evaluate((element) =>
        element.getBoundingClientRect().left + element.parentElement!.scrollLeft);
      const firstTab = await tabs.locator('> button').first().evaluate((element) =>
        element.getBoundingClientRect().left + element.parentElement!.scrollLeft);
      const mainBox = await mainMenu.boundingBox();
      const secondBox = await tabs.boundingBox();

      expect(firstTab, 'submenu alignment at ' + width).toBe(firstSection);
      expect(secondBox!.x).toBe(mainBox!.x);
      expect(secondBox!.width).toBe(mainBox!.width);
      expect(await tabs.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft)))
        .toBeGreaterThan(0);
    }
    await page.setViewportSize({ width: 1440, height: 600 });

    expect(await toolbar.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
    await scroll.evaluate((element) => {
      element.scrollTop = 1;
    });
    await page.waitForFunction(() => document.querySelector('.settings-workspace')
      ?.getAttribute('data-scrolled') === 'true');
    expect(await toolbar.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    expect(await tabs.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
    expect(await toolbar.boundingBox()).toEqual(toolbarBox);
    await scroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.waitForFunction(() => document.querySelector('.settings-workspace')
      ?.getAttribute('data-scrolled') !== 'true');
    expect(await toolbar.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');

    for (const index of [1, 2, 3, 0]) {
      await settings.locator('.cms-tabs > button').nth(index).click();
      expect(await settings.locator('> ._workspace-toolbar > h1._workspace-title').count()).toBe(1);
      expect(await settings.locator('._workspace-scroll h1:visible').count()).toBe(0);
    }
    await page.locator('.admin-language select').selectOption('en');

    for (const width of [320, 768, 992, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      let domainPosition: { x: number; y: number } | undefined;

      for (const section of ['', '/templates', '/chunks', '/snippets', '/template-variables', '/hooks',
        '/files', '/urls', '/jsonLd']) {
        await page.goto('http://localhost:31989/admin/sites/site-1' + section);
        const domain = page.locator('.page-drawer:visible ._setup-kicker');

        await domain.waitFor();
        const box = await domain.boundingBox();

        expect(box).not.toBeNull();
        expect((await page.locator('.page-drawer:visible').boundingBox())!.width, section + width)
          .toBe(width >= 992 ? 286 : width);

        const titleRow = page.locator('.page-drawer:visible ._drawer-title-row');

        expect((await titleRow.boundingBox())!.height, 'drawer title height at ' + section + width).toBe(44);

        if (section === '/jsonLd') {
          for (const tab of ['Profiles', 'Shared objects']) {
            await page.getByRole('tab', { name: tab, exact: true }).click();
            const row = page.locator('.json-ld-list button').first();
            const label = row.locator('.cms-drawer-label');

            expect(await label.evaluate((element) => ({
              clipped: element.scrollWidth > element.clientWidth,
              overflow: getComputedStyle(element).textOverflow,
              wrapping: getComputedStyle(element).whiteSpace,
            }))).toEqual({ clipped: true, overflow: 'ellipsis', wrapping: 'nowrap' });
            const icon = row.locator('svg[data-jsonld-icon]');

            expect(await icon.getAttribute('data-jsonld-icon')).toBe(tab === 'Profiles' ? 'WebPage' : 'Person');
            const rowBox = await row.boundingBox();
            const iconBox = await icon.boundingBox();

            expect(iconBox!.width).toBe(20);
            expect(iconBox!.x + iconBox!.width).toBeLessThan(rowBox!.x + rowBox!.width);
            expect((await page.locator('.page-drawer:visible').boundingBox())!.width)
              .toBe(width >= 992 ? 286 : width);
          }
          await page.getByRole('tab', { name: 'Profiles', exact: true }).click();
        }
        if (domainPosition && ['', '/files', '/jsonLd'].includes(section)) {
          expect(box!.x, section + width).toBe(domainPosition.x);
          expect(box!.y, section + width).toBe(domainPosition.y);
        } else if (!domainPosition) {
          domainPosition = { x: box!.x, y: box!.y };
        }
      }
    }

    const sections = ['pages', 'templates', 'chunks', 'snippets', 'template-variables', 'hooks', 'files', 'urls',
      'settings', 'addons'];

    for (const section of sections) {
      await page.setViewportSize({ width: 1440, height: 700 });
      await page.goto('http://localhost:31989/admin/sites/site-1' + (section === 'pages' ? '' : '/' + section));
      const toolbar = page.locator('._workspace-toolbar:visible').last();

      await toolbar.waitFor();
      const box = await toolbar.boundingBox();
      const title = toolbar.locator('._workspace-title');

      expect(await title.count(), section).toBe(1);

      if (['hooks', 'templates', 'chunks', 'snippets', 'files', 'urls'].includes(section)) {
        expect(await page.locator('._workspace-scroll:visible h1').count(), section).toBe(0);
      }

      const titleBox = await title.boundingBox();

      expect(titleBox!.x - box!.x, section).toBe(40);
      const button = toolbar.locator('> .cms-secondary, > .cms-primary').last();

      if (await button.count()) {
        const buttonBox = await button.boundingBox();

        expect(box!.x + box!.width - buttonBox!.x - buttonBox!.width, section).toBe(40);
        expect(buttonBox!.height, section).toBeGreaterThanOrEqual(44);
      }

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
        await page.setViewportSize({ width, height: 700 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          section + width).toBe(true);
      }
    }
    expect(await page.getByRole('button', { name: 'Refresh', exact: true }).locator('svg').count()).toBe(1);

    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
