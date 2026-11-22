import path from 'node:path';

import { chromium, type Page } from 'playwright-core';

const repositoryUrl = 'https://github.com/example/synthetic-addon';

const menuLabel = 'Synthetic add-on';

function createResponseGate(): { promise: Promise<void>; resolve: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, resolve: release };
}

it('preserves system document roles in add-on page summaries', async () => {
  await withAddonPage(async (page) => {
    const runtime = page.locator('.runtime-addon');

    await runtime.getByText('Ordinary page', { exact: false }).waitFor();
    expect(JSON.parse((await runtime.textContent())!)).toEqual([
      { pageId: '0', title: 'sitemap.xml', systemDocument: 'Sitemap' },
      { pageId: '1', title: 'robots.txt', systemDocument: 'Robots' },
      { pageId: '2', title: 'llms.txt', systemDocument: 'Llms' },
      { pageId: '3', title: 'Ordinary page', systemDocument: null },
    ]);
  }, undefined, true);
});

async function withAddonPage(verify: (page: Page) => Promise<void>, menuCount?: number,
  probePages = false): Promise<void> {
  const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

  if (!executablePath) {
    throw new Error('Explicit test browser required');
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const site = {
    siteId: 'site-1',
    mark: 'Site',
    name: 'Synthetic site',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };

  page.setDefaultTimeout(3000);

  try {
    await page.route('**/*', async (route) => {
      const pathname = new URL(route.request().url()).pathname;

      if (probePages && pathname.endsWith('/addon-workspaces/synthetic-addon/fixture/admin/probe.js')) {
        await route.fulfill({
          contentType: 'application/javascript',
          body: `export function mount(target, host) {
            function update(value) { target.textContent = JSON.stringify(value.pages); }
            update(host);
            return { update, destroy() {} };
          }`,
        });

        return;
      }
      if (pathname.startsWith('/api/')) {
        let json: unknown = { items: [] };

        if (pathname.endsWith('/auth/me')) {
          json = {
            user: {
              authorization: {
                systemAdmin: true,
                ...(probePages ? { systemActionIds: ['synthetic-addon.probe.read'] } : {}),
              },
            },
          };
        } else if (pathname === '/api/admin/sites') {
          json = { items: [site] };
        } else if (pathname === '/api/admin/sites/site-1') {
          json = site;
        } else if (pathname.endsWith('/addon-installations')) {
          json = {
            items: [{
              addonKey: 'synthetic-addon',
              repositoryUrl,
              releaseTag: 'v0.4.1',
              implementationVersion: '0.4.1',
              status: 'Installed',
            }],
          };
        } else if (probePages && pathname.endsWith('/pages')) {
          json = {
            items: [
              ['Sitemap', 'sitemap.xml'], ['Robots', 'robots.txt'], ['Llms', 'llms.txt'], [null, 'Ordinary page'],
            ].map(([systemDocument, title], index) => ({
              pageId: String(index),
              siteId: 'site-1',
              mark: 'page' + index,
              title,
              language: 'en',
              status: 'PUBLISHED',
              systemDocument,
            })),
          };
        } else if (pathname.endsWith('/addon-workspaces')) {
          json = {
            items: probePages ? [{
              addonKey: 'synthetic-addon',
              label: { en: menuLabel, ru: 'Синтетический аддон' },
              views: ['main'],
              actionIds: [],
              digest: 'fixture',
              entry: 'admin/probe.js',
              styles: [],
              enabled: true,
            }] : [],
            timeZone: null,
          };
        } else if (pathname.endsWith('/menu-badge')) {
          json = { count: menuCount };
        } else if (pathname.endsWith('/addons')) {
          json = {
            items: [{
              addonKey: 'synthetic-addon',
              definition: {
                addonKey: 'synthetic-addon',
                name: { en: 'Synthetic add-on', ru: 'Синтетический аддон' },
                description: { en: 'Synthetic fixture', ru: 'Синтетические данные' },
                implementationVersion: '0.4.2',
                contractVersion: 1,
                configurationSchemaVersion: 1,
                adminComponentId: null,
                snippetIds: [],
                adminMenu: { en: menuLabel, ru: 'Синтетический аддон' },
              },
              connection: menuCount === undefined ? null : { status: 'Enabled', version: '0.4.2' },
              menuBadge: menuCount !== undefined,
            }],
          };
        }
        await route.fulfill({ json });

        return;
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture asset');
      }
      await route.fulfill({ path: filename });
    });
    await page.goto('http://localhost:31989/admin/sites/site-1/addons' + (probePages ? '/synthetic-addon' : ''));
    await verify(page);
  } finally {
    await browser.close();
  }
}

it('shows the current add-on version and GitHub link without the saved installation tag', async () => {
  await withAddonPage(async (page) => {
    for (const [language, versionLabel] of [['ru', 'Версия'], ['en', 'Version']] as const) {
      await page.locator('.admin-language select').selectOption(language);
      const card = page.locator('._addon-card');

      await card.waitFor();
      expect(await card.textContent()).toContain(versionLabel + ' 0.4.2');
      expect(await card.textContent()).not.toContain('0.4.1');
      const link = card.getByRole('link', { name: 'example/synthetic-addon', exact: true });

      expect(await link.getAttribute('href')).toBe(repositoryUrl);
      expect(await link.getAttribute('target')).toBe('_blank');
      expect(await link.getAttribute('rel')).toBe('noreferrer');
    }
  });
});

it('shows a centered refresh glyph with a clear stroke at the shared button size', async () => {
  await withAddonPage(async (page) => {
    await page.locator('.admin-language select').selectOption('en');
    const button = page.locator('.addons-workspace ._workspace-toolbar')
      .getByRole('button', { name: 'Refresh', exact: true });
    const icon = button.locator('svg');

    await icon.waitFor();
    const geometry = await icon.evaluate((element) => {
      if (!(element instanceof SVGSVGElement)) {
        throw new Error('Expected the shared refresh SVG');
      }

      const { x, y, width, height } = element.getBBox();

      return {
        x,
        y,
        width,
        height,
        stroke: Number.parseFloat(getComputedStyle(element).strokeWidth),
        displayWidth: element.getBoundingClientRect().width,
      };
    });

    expect(geometry.x).toBeCloseTo(3);
    expect(geometry.y).toBeCloseTo(3);
    expect(geometry.width).toBeCloseTo(18);
    expect(geometry.height).toBeCloseTo(18);
    expect(geometry.stroke).toBe(2);
    expect(geometry.displayWidth).toBe(18);
    expect(await icon.getAttribute('aria-hidden')).toBe('true');
  });
});

it('shows progress on the add-on card until repository and file operations settle', async () => {
  await withAddonPage(async (page) => {
    const card = page.locator('._addon-card');
    const proposal = {
      addonKey: 'synthetic-addon',
      updateId: 'synthetic-update',
      fromVersion: '0.4.2',
      toVersion: '0.4.3',
      mode: 'Compatible',
      phase: 'Prepared',
    };

    async function expectProgress(routePath: string, label: string, trigger: () => Promise<void>,
      response: { status?: number; json: unknown } | null, surface = card): Promise<void> {
      const gate = createResponseGate();
      const spinner = surface.locator('._saving-spinner');

      await page.route('**' + routePath, async (route) => {
        await gate.promise;

        if (response) {
          await route.fulfill(response);
        } else {
          await route.fallback();
        }
      }, { times: 1 });

      try {
        await trigger();
        await spinner.waitFor({ timeout: 1500 });
        await surface.getByRole('status').filter({ hasText: label }).waitFor();
        expect(await card.getByRole('button', { name: 'Update from file', exact: true }).isDisabled()).toBe(true);
        expect(await page.locator('._saving-spinner').count()).toBe(1);
      } finally {
        gate.resolve();
      }
      await spinner.waitFor({ state: 'detached' });
    }

    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('.admin-language select').selectOption('en');
    const toolbar = page.locator('.addons-workspace ._workspace-toolbar');

    await card.waitFor();
    await toolbar.locator('._saving-spinner').waitFor({ state: 'hidden' });
    await expectProgress('/api/admin/sites/site-1/addons', 'Loading add-ons',
      () => toolbar.getByRole('button', { name: 'Refresh', exact: true }).click(), null, toolbar);
    await expectProgress('/api/admin/addon-updates/repository/synthetic-addon', 'Checking for updates',
      () => card.getByRole('button', { name: 'Check for updates', exact: true }).click(),
      { status: 503, json: { error: 'AddonUnavailable' } });
    await card.getByText('Could not check for an update. Try again.', { exact: true }).waitFor();

    await card.getByRole('button', { name: 'Update from file', exact: true }).click();
    await card.locator('input[type=file]').setInputFiles({
      name: 'test.runtime.gz', mimeType: 'application/gzip', buffer: Buffer.from('fixture upload'),
    });
    await expectProgress('/api/admin/addon-updates', 'Uploading and checking the package',
      () => card.getByRole('button', { name: 'Check package', exact: true }).click(), { json: proposal });
    await expectProgress('/api/admin/addon-updates/synthetic-update', 'Checking update status',
      () => card.getByRole('button', { name: 'Check status', exact: true }).click(), { json: proposal });
    await expectProgress('/api/admin/addon-updates/synthetic-update/apply', 'Installing the update',
      () => card.getByRole('button', { name: 'Install update', exact: true }).click(),
      { json: { ...proposal, phase: 'Completed' } });
    expect(await card.getByRole('button', { name: 'Install update', exact: true }).count()).toBe(0);
    await expectProgress('/api/admin/sites/site-1/addons/synthetic-addon/enable', 'Enabling the add-on',
      () => card.getByRole('button', { name: 'Enable', exact: true }).click(), { json: {} });
    expect(await card.getByRole('button', { name: 'Update from file', exact: true }).isEnabled()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

it('groups the selected file with the chooser and separates the file actions', async () => {
  await withAddonPage(async (page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.admin-language select').selectOption('en');
    const card = page.locator('._addon-card');

    await card.getByRole('button', { name: 'Update from file', exact: true }).click();
    const choose = card.getByRole('button', { name: 'Choose package', exact: true });
    const filename = card.getByText('No file selected', { exact: true });
    const check = card.getByRole('button', { name: 'Check package', exact: true });
    const cancel = card.getByRole('button', { name: 'Cancel', exact: true });
    const [chooseBox, filenameBox, checkBox, cancelBox] = await Promise.all(
      [choose, filename, check, cancel].map(control => control.boundingBox()),
    );

    if (!chooseBox || !filenameBox || !checkBox || !cancelBox) {
      throw new Error('Expected all file controls to be visible');
    }

    const chooserGap = filenameBox.x - chooseBox.x - chooseBox.width;
    const actionGap = checkBox.x - filenameBox.x - filenameBox.width;

    expect(actionGap).toBeGreaterThanOrEqual(chooserGap + 8);
    expect(cancelBox.x - checkBox.x - checkBox.width).toBeGreaterThanOrEqual(8);
    const description = await filename.getAttribute('id');

    expect(description).toBeTruthy();
    expect(await choose.getAttribute('aria-describedby')).toBe(description);

    await page.setViewportSize({ width: 390, height: 800 });
    const longName = 'long-events-package-'.repeat(12) + '1.0.0.runtime.gz';

    await card.locator('input[type=file]').setInputFiles({
      name: longName, mimeType: 'application/gzip', buffer: Buffer.from('fixture upload'),
    });
    await card.getByText(longName, { exact: true }).waitFor();
    expect(await check.isEnabled()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

it('shows the spinner while opening add-on settings', async () => {
  await withAddonPage(async (page) => {
    await page.locator('.admin-language select').selectOption('en');
    const card = page.locator('._addon-card');
    const gate = createResponseGate();
    const screen = page.locator('._addon-scroll__component');

    await card.waitFor();
    await page.route('**/api/admin/sites/site-1/addons/synthetic-addon', async (route) => {
      await gate.promise;
      await route.fulfill({ json: { connection: null } });
    }, { times: 1 });
    await page.route('**/api/admin/sites/site-1/addon-runtime/synthetic-addon',
      route => route.fulfill({ json: null }), { times: 1 });

    try {
      await card.getByRole('button', { name: 'Settings', exact: true }).click();
      await screen.getByRole('status').filter({ hasText: 'Loading the add-on screen' })
        .locator('._saving-spinner').waitFor();
    } finally {
      gate.resolve();
    }
    await screen.locator('._saving-spinner').waitFor({ state: 'detached' });
  }, 0);
});

it.each([[390, 1234], [1200, 3]])('keeps the add-on badge inside the menu item without shifting the row at %ipx',
  async (width, count) => {
    await withAddonPage(async (page) => {
      await page.setViewportSize({ width, height: 800 });
      await page.locator('.admin-language select').selectOption('en');
      const menu = page.locator('.site-sections');
      const item = menu.getByRole('button', { name: menuLabel, exact: true });
      const badge = menu.locator('._addon-menu-badge');

      await badge.waitFor();
      await item.scrollIntoViewIfNeeded();
      expect(await badge.textContent()).toBe(String(count));

      const menuBox = await menu.boundingBox();
      const itemBox = await item.boundingBox();
      const badgeBox = await badge.boundingBox();

      if (!menuBox || !itemBox || !badgeBox) {
        throw new Error('The menu item and its badge must be visible');
      }
      expect(itemBox.y).toBeCloseTo(menuBox.y);
      expect(badgeBox.y).toBeGreaterThanOrEqual(itemBox.y);
      expect(badgeBox.y + badgeBox.height).toBeLessThan(itemBox.y + itemBox.height / 2);
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(itemBox.x + itemBox.width);
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(menuBox.x + menuBox.width);
    }, count);
  });
