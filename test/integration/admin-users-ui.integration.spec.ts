import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, chromium, type Page } from 'playwright-core';

import { object } from '../../admin/src/shared/api/content-api.js';
import { siteTransliterationTables } from '../../src/domain/sites/transliteration.policy.js';

describe('administrator settings UI', () => {
  let browser: Browser;
  let page: Page;
  let writes: { path: string; body: Record<string, unknown> }[];
  let errors: string[];
  let conflict: boolean;
  const origin = 'http://localhost:31989';
  const site = {
    siteId: 'site-1',
    mark: 'Site',
    name: 'Synthetic site',
    primaryDomain: 'example.test',
    languages: ['en'],
    defaultLanguage: 'en',
    status: 'ACTIVE',
  };
  let users: {
    adminUserId: string; email: string; blocked: boolean; version: string; createdAt: string; updatedAt: string;
  }[];

  beforeEach(async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit test browser required');
    }
    browser = await chromium.launch({ executablePath, headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(3000);
    errors = [];
    writes = [];
    conflict = false;
    users = ['owner', 'editor', 'blocked'].map((id, index) => ({
      adminUserId: id,
      email: id + '@example.test',
      blocked: index === 2,
      version: id + '-v1',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    }));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;

      if (url.origin !== origin) {
        await route.abort();

        return;
      }
      if (pathname.startsWith('/api/')) {
        let json: unknown = { items: [] };

        if (pathname === '/api/admin/users') {
          if (route.request().method() === 'POST') {
            const body = object(route.request().postDataJSON());

            writes.push({ path: pathname, body });
            const user = { ...users[0]!, adminUserId: 'new', email: String(body.email), version: 'new-v1' };

            users.push(user);
            await route.fulfill({ status: 201, json: user });

            return;
          }
          json = { currentAdminUserId: 'owner', items: users, nextCursor: null };
        } else if (pathname.startsWith('/api/admin/users/')) {
          const body = object(route.request().postDataJSON());

          writes.push({ path: pathname, body });

          if (conflict) {
            conflict = false;
            await route.fulfill({ status: 409, json: { error: 'StaleWrite' } });

            return;
          }

          const id = pathname.split('/')[4]!;
          const user = users.find((user) => user.adminUserId === id)!;

          if (pathname.endsWith('/delete')) {
            users = users.filter((user) => user.adminUserId !== id);
            json = { adminUserId: id, version: 'deleted', currentSessionInvalidated: id === 'owner' };
          } else {
            user.version += '-next';

            if (pathname.endsWith('/block')) {
              user.blocked = body.blocked === true;
              json = user;
            } else {
              json = { user, currentSessionInvalidated: id === 'owner' };
            }
          }
        } else if (pathname.endsWith('/auth/me') || pathname.endsWith('/auth/login')) {
          json = { user: { authorization: { systemAdmin: true, siteAdminSiteIds: [] } } };
        } else if (pathname === '/api/admin/sites') {
          json = { items: [site] };
        } else if (pathname === '/api/admin/sites/site-1') {
          json = site;
        } else if (pathname.endsWith('/page-resolutions')) {
          json = {
            from: url.searchParams.get('from') ?? '2026-11-07',
            to: url.searchParams.get('to') ?? '2026-11-07',
            today: '2026-11-07',
            timeZone: 'UTC',
            retainedSince: '2026-08-09T00:00:00.000Z',
            versions: ['0.10.0', '0.10.1'],
            diagnostics: { dropped: 0, failed: 0, pending: 0 },
            rows: [
              { path: '/popular/', calls: 1250, averageMs: 12.25, medianMs: 10, p95Ms: 25, p99Ms: 40 },
              { path: '/static/', calls: 40, averageMs: 1.5, medianMs: 1, p95Ms: 3, p99Ms: 4 },
            ],
          };
        } else if (pathname.endsWith('/favicon')) {
          json = { favicon: null };
        } else if (pathname.endsWith('/access')) {
          json = { revision: null, actions: [], managerActionIds: [], siteActors: [] };
        } else if (pathname.endsWith('/settings')) {
          json = {
            siteId: site.siteId,
            timeZone: 'UTC',
            addresses: { publicOrigin: 'https://example.test', localOrigin: null, originMode: 'Public' },
          };
        } else if (pathname.endsWith('/publication')) {
          json = { templates: [], pageAvailability: [] };
        }
        await route.fulfill({ json });

        return;
      }

      const asset = pathname.startsWith('/admin/assets/') ? pathname.slice('/admin/'.length) : 'index.html';
      const filename = path.resolve('admin/dist', asset);

      if (!filename.startsWith(path.resolve('admin/dist') + path.sep)) {
        throw new Error('Unsafe fixture path');
      }
      await route.fulfill({
        body: await readFile(filename),
        contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'text/html',
      });
    });
    await page.goto(origin + '/admin/sites/site-1/settings');
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByRole('tab', { name: 'Users', exact: true }).click();
    await page.getByRole('table').getByText('owner@example.test', { exact: true }).waitFor();
  });
  it('keeps installation accounts and General outside SiteAdmin authority', async () => {
    const accountRequests: string[] = [];

    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/admin/users')) {
        accountRequests.push(request.url());
      }
    });
    await page.route('**/api/admin/auth/me', (route) => route.fulfill({
      json: { user: { authorization: { systemAdmin: false, siteAdminSiteIds: [site.siteId] } } },
    }));
    await page.route('**/api/admin/sites/site-1/access', (route) => route.fulfill({
      json: {
        revision: null,
        actions: [],
        groups: [
          {
            groupId: 'cms.system.group.global',
            key: 'global',
            name: 'Global',
            description: 'Global administrators',
            builtIn: 'installation',
            members: [{ email: 'hidden@example.test' }],
          },
          {
            groupId: 'cms.system.group.site',
            key: 'site',
            name: 'Site',
            description: 'Site administrators',
            builtIn: 'site',
            members: [],
          },
        ],
      },
    }));
    await page.route('**/api/admin/sites/site-1/dumps', (route) => route.fulfill({ json: { items: [] } }));
    await page.reload();
    await page.getByRole('button', { name: 'Main', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dumps', exact: true }).click();
    await page.getByRole('button', { name: 'Create dump', exact: true }).waitFor();
    expect(await page.getByLabel('Dump type', { exact: true }).getByRole('option').allTextContents())
      .toEqual(['Full site']);
    expect(await page.getByRole('button', { name: 'Create installation dump', exact: true }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'General', exact: true }).count()).toBe(0);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await page.getByRole('tab', { name: 'Roles and permissions', exact: true }).waitFor();
    expect(await page.getByRole('tab', { name: 'Users', exact: true }).count()).toBe(0);
    await page.getByRole('tab', { name: 'Access groups', exact: true }).click();
    const groups = page.getByLabel('Group', { exact: true });

    await groups.selectOption({ label: 'Site' });
    expect(await groups.getByRole('option', { name: 'Global', exact: true }).count()).toBe(0);
    expect(await page.getByText('hidden@example.test', { exact: true }).count()).toBe(0);
    expect(accountRequests).toEqual([]);
  });

  it('edits a site role and an independent access group in Settings', async () => {
    const changes: unknown[] = [];
    const siteActors = [{ adminUserId: 'member-1', email: 'member@example.test' }];
    const actions = [{
      actionId: 'cms.pages.list',
      shortDescription: 'List pages',
      description: 'List site pages',
      allowedObjectScopes: ['all', 'own', 'groups'],
      method: 'GET',
      route: '/api/admin/sites/:siteId/pages',
      domains: ['cms.pages', 'cms.urls'],
      read: true,
      admission: 'admin',
      scope: 'site',
    }];
    let roles: unknown[] = [];
    let groups: unknown[] = [
      {
        groupId: 'global',
        key: 'global',
        name: 'Global',
        description: 'Global administrators',
        builtIn: 'installation',
        members: [{ email: 'system@example.test' }],
      },
      {
        groupId: 'site',
        key: 'site',
        name: 'Site',
        description: 'Administrators of this site',
        builtIn: 'site',
        members: [{ email: 'site-admin@example.test' }],
      },
    ];

    await page.route('**/api/admin/sites/site-1/access', (route) => {
      if (route.request().method() === 'POST') {
        const body: unknown = route.request().postDataJSON();
        const edit = object(body);

        changes.push(body);

        if (edit.role) {
          roles = [{
            ...object(edit.role),
            roleId: 'role-1',
            actionIds: edit.actionIds,
            objectScopes: edit.objectScopes,
          }];
        }
        if (edit.group) {
          groups = [{ ...object(edit.group), groupId: 'group-1' }];
        }
      }

      return route.fulfill({
        json: {
          revision: null,
          actions,
          siteActors,
          managerActionIds: [],
          administratorActionIds: { 'cms.system.admin': ['cms.pages.list'], 'cms.system.site-admin': [] },
          delegableActionIds: ['cms.pages.list'],
          customRoles: roles,
          groups,
        },
      });
    });
    await page.getByRole('tab', { name: 'Roles and permissions', exact: true }).click();
    const rolePicker = page.getByLabel('Role', { exact: true });

    await rolePicker.selectOption('cms.system.admin');
    expect(await page.getByRole('cell', { name: '✓', exact: true }).count()).toBe(2);
    await rolePicker.selectOption('cms.system.site-admin');
    expect(await page.getByRole('cell', { name: '✓', exact: true }).count()).toBe(0);

    await rolePicker.selectOption('cms.system.site-admin');
    expect(await page.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0);
    expect(await page.getByRole('checkbox').count()).toBe(0);
    await rolePicker.selectOption('cms.system.admin');
    expect(await page.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0);
    await rolePicker.selectOption('new');
    await page.getByLabel('Key', { exact: true }).fill('page-reader');
    await page.getByLabel('Name', { exact: true }).fill('Page reader');
    await page.getByLabel('Description', { exact: true }).fill('Read pages');
    const pagesOwn = page.getByRole('checkbox', { name: 'List pages · Own · Pages', exact: true });
    const urlsOwn = page.getByRole('checkbox', { name: 'List pages · Own · URLs', exact: true });

    await pagesOwn.check();
    expect(await urlsOwn.isChecked()).toBe(true);
    await page.getByText('Also on in URLs', { exact: true }).waitFor();
    await urlsOwn.uncheck();
    expect(await pagesOwn.isChecked()).toBe(false);
    expect(await page.getByText('Also on in URLs', { exact: true }).count()).toBe(0);
    await page.getByText('Also off in Pages', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    expect(await page.getByText('Also off in Pages', { exact: true }).isVisible()).toBe(false);

    await pagesOwn.check();
    await page.getByText('Also on in URLs', { exact: true }).waitFor({ state: 'hidden', timeout: 4500 });
    await page.getByRole('checkbox', { name: 'List pages · Groups · Pages', exact: true }).check();
    await page.getByRole('checkbox', { name: 'member@example.test' }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('option', { name: 'Page reader' }).waitFor({ state: 'attached' });
    expect(changes[0]).toMatchObject({
      role: { name: 'Page reader', actorIds: ['member-1'] },
      actionIds: ['cms.pages.list'],
      objectScopes: { 'cms.pages.list': ['own', 'groups'] },
    });

    const activeTab = page.getByRole('tab', { name: 'Roles and permissions', exact: true });
    const refresh = page.getByRole('tabpanel').locator('..').getByRole('button', { name: 'Refresh', exact: true });
    const title = page.getByRole('heading', { name: 'Roles and permissions', exact: true });
    const settingsMenu = page.getByRole('navigation', { name: 'Settings', exact: true });
    const roleLabel = page.locator('label').filter({ hasText: /^Role$/ });
    const save = page.getByRole('button', { name: 'Save', exact: true });

    for (const width of [390, 576, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const menuBounds = (await settingsMenu.boundingBox())!;
      const titleBounds = (await title.boundingBox())!;
      const tabsBounds = (await activeTab.boundingBox())!;
      const menuGap = titleBounds.y - (menuBounds.y + menuBounds.height);
      const contentGap = tabsBounds.y - (titleBounds.y + titleBounds.height);

      expect.soft(contentGap, `heading to Access tabs at ${width}px`).toBeGreaterThanOrEqual(0);
      expect.soft(contentGap, `heading to Access tabs at ${width}px`).toBeLessThan(menuGap);

      const labelBounds = (await roleLabel.boundingBox())!;
      const pickerBounds = (await rolePicker.boundingBox())!;

      if (width === 390) {
        expect.soft(labelBounds.y + labelBounds.height).toBeLessThanOrEqual(pickerBounds.y);
      } else {
        const saveBounds = (await save.boundingBox())!;
        const pickerCenter = pickerBounds.y + pickerBounds.height / 2;

        expect.soft(labelBounds.x + labelBounds.width, `Role label at ${width}px`).toBeLessThan(pickerBounds.x);
        expect.soft(labelBounds.y + labelBounds.height / 2, `Role label center at ${width}px`)
          .toBeCloseTo(pickerCenter, 0);
        expect.soft(saveBounds.y + saveBounds.height / 2, `Save button center at ${width}px`).toBeCloseTo(pickerCenter, 0);
      }
    }

    const tabBox = await activeTab.boundingBox();
    const titleBox = await title.boundingBox();
    const tableBox = await page.getByRole('tabpanel').locator('.cms-table-wrap').boundingBox();
    const refreshBox = await refresh.boundingBox();

    expect(tabBox!.x).toBeCloseTo(titleBox!.x, 0);
    expect(tableBox!.x).toBeCloseTo(titleBox!.x, 0);
    expect(refreshBox!.x).toBeGreaterThan(tabBox!.x + tabBox!.width);
    expect(refreshBox!.y).toBeGreaterThanOrEqual(tabBox!.y);
    expect(refreshBox!.y + refreshBox!.height).toBeLessThan(tabBox!.y + tabBox!.height);
    await page.getByRole('tab', { name: 'Access groups', exact: true }).click();
    const groupPicker = page.getByLabel('Group', { exact: true });

    await groupPicker.selectOption('global');
    await page.getByText('system@example.test', { exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Archive group', exact: true }).count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0);
    await groupPicker.selectOption('site');
    await page.getByText('site-admin@example.test', { exact: true }).waitFor();
    await groupPicker.selectOption('new');
    await page.getByLabel('Key', { exact: true }).fill('editors');
    await page.getByLabel('Name', { exact: true }).fill('Editors');
    await page.getByLabel('Description', { exact: true }).fill('Site editors');
    await page.getByRole('checkbox', { name: 'member@example.test' }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('option', { name: 'Editors' }).waitFor({ state: 'attached' });
    expect(changes[1]).toMatchObject({ group: { name: 'Editors', actorIds: ['member-1'] }, actionIds: [] });
    await page.getByRole('tab', { name: 'Actions catalog', exact: true }).click();
    await page.getByRole('table').getByText('List site pages', { exact: true }).waitFor();
    expect(await page.getByRole('columnheader', { name: 'E', exact: true }).count()).toBe(1);
    expect(await page.getByRole('checkbox', { name: 'List pages' }).count()).toBe(0);

    await page.getByRole('tab', { name: 'Create user', exact: true }).click();
    await page.getByLabel('Role', { exact: true }).selectOption('role-1');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('new-member@example.test');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await page.getByText('The password must contain 15 to 1024 characters.', { exact: true }).waitFor();
    await page.locator('.admin-language select').selectOption('ru');
    await page.getByText('Пароль должен содержать от 15 до 1024 символов.', { exact: true }).waitFor();
    expect(await page.getByLabel('Роль', { exact: true }).inputValue()).toBe('role-1');
    const email = page.getByRole('textbox', { name: 'Email', exact: true });

    expect(await email.inputValue()).toBe('new-member@example.test');
    expect(writes).toEqual([]);
    await page.locator('.admin-language select').selectOption('en');
    await page.getByLabel('Password', { exact: true }).fill('synthetic password');
    await page.getByRole('button', { name: 'Create user', exact: true }).click();
    await page.getByText('User created', { exact: true }).waitFor();
    expect(writes[0]).toMatchObject({
      path: '/api/admin/users',
      body: { email: 'new-member@example.test', roleId: 'role-1', siteId: 'site-1' },
    });
    await page.getByRole('tab', { name: 'Users', exact: true }).click();
    await page.getByRole('row', { name: 'new-member@example.test', exact: true }).waitFor();
  });

  it('opens page creation without requesting the page tree, and hides unrelated sections', async () => {
    const requests: string[] = [];
    let actionIds = ['cms.pages.create'];

    page.on('request', (request) => {
      if (request.url().includes('/api/admin/sites/site-1/')) {
        requests.push(request.url());
      }
    });
    await page.route('**/api/admin/auth/me', (route) => route.fulfill({
      json: {
        user: {
          authorization: { systemAdmin: false, siteAdminSiteIds: [], siteGrants: [{ siteId: site.siteId, actionIds }] },
        },
      },
    }));
    await page.goto(origin + '/admin/sites/site-1');
    const navigation = page.getByRole('navigation', { name: 'Site sections' });

    await navigation.getByRole('button', { name: 'Pages', exact: true }).waitFor();
    expect(await navigation.getByRole('button', { name: 'URLs', exact: true }).count()).toBe(0);
    expect(await page.getByRole('tree').count()).toBe(0);
    await page.locator('#page-drawer').getByRole('button', { name: /create a page|create page/i }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).filter({ visible: true }).waitFor();
    expect(await page.locator('#page-h1').getAttribute('required')).not.toBeNull();
    expect(await page.locator('#page-path').count()).toBe(0);
    await page.getByText('The URL will be generated from this heading when you save the draft.').waitFor();
    expect(await page.getByRole('button', { name: 'Save and publish', exact: true }).count()).toBe(0);
    expect(requests).toEqual([]);

    actionIds = ['cms.chunks.list'];
    await page.goto(origin + '/admin/sites/site-1');
    await navigation.getByRole('button', { name: 'Chunks', exact: true }).waitFor();
    expect(await navigation.getByRole('button', { name: 'Pages', exact: true }).count()).toBe(0);
    expect(page.url()).toBe(origin + '/admin/sites/site-1/chunks');
    expect(errors).toEqual([]);
  });

  it('shows the selected virtual folder address only with all page creation grants', async () => {
    const actionIds = ['cms.pages.create', 'cms.urls.list'];
    const longFolder = 'news-' + 'release-notes'.repeat(12);
    const longPath = '/' + longFolder + '/';
    const urls = ['blog', longFolder].map((folder) => ({
      version: folder + '-v1',
      url: {
        urlId: folder + '-post-url',
        siteId: site.siteId,
        mark: folder + 'Post',
        path: '/' + folder + '/post/',
        segment: 'post',
        parentUrlId: null,
        kind: 'PAGE',
        pageId: folder + '-post',
        redirectTargetUrlId: null,
        redirectStatus: null,
        createdAt: '2026-11-19T00:00:00Z',
        updatedAt: '2026-11-19T00:00:00Z',
      },
    }));

    await page.route('**/api/admin/auth/me', (route) => route.fulfill({
      json: {
        user: {
          authorization: { systemAdmin: false, siteAdminSiteIds: [], siteGrants: [{ siteId: site.siteId, actionIds }] },
        },
      },
    }));
    await page.route('**/api/admin/sites/site-1/urls', (route) => route.fulfill({
      json: { siteId: site.siteId, urls, pages: [], published: null },
    }));
    const workspaceUrl = origin + '/admin/sites/site-1/urls';
    const workspace = page.locator('#urls-workspace');
    const creationLink = workspace.locator('a[href*="/pages/new?urlPath="]');
    const blog = page.locator('[data-url-path="/blog/"]');

    await page.goto(workspaceUrl);
    await blog.click();
    await workspace.getByRole('heading', { name: '/blog/', exact: true }).waitFor();
    expect(await creationLink.count()).toBe(0);

    actionIds.push('cms.urls.materialize');
    await page.reload();
    await blog.click();
    const englishLink = workspace.getByRole('link', { name: 'Create a page at /blog/', exact: true });

    await englishLink.waitFor();
    expect(await englishLink.getAttribute('href')).toBe('/admin/sites/site-1/pages/new?urlPath=%2Fblog%2F');
    await page.locator('.admin-language select').selectOption('ru');
    await workspace.getByRole('link', { name: 'Создать страницу по адресу /blog/', exact: true }).waitFor();
    await page.locator('[data-url-path="' + longPath + '"]').click();
    await page.setViewportSize({ width: 320, height: 800 });
    const russianLink = workspace.getByRole('link', { name: 'Создать страницу по адресу ' + longPath, exact: true });

    await russianLink.waitFor();
    expect(await russianLink.getAttribute('href')).toBe('/admin/sites/site-1/pages/new?urlPath='
      + encodeURIComponent(longPath));
    await expect.poll(() => russianLink.evaluate((link) => ({
      textFits: link.scrollWidth <= link.clientWidth,
      insideViewport: link.getBoundingClientRect().right <= innerWidth,
      wraps: link.clientHeight > 44,
    }))).toEqual({ textFits: true, insideViewport: true, wraps: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    actionIds.splice(0, 1);
    await page.reload();
    await blog.click();
    await workspace.getByRole('heading', { name: '/blog/', exact: true }).waitFor();
    expect(await creationLink.count()).toBe(0);
  });
  it('keeps the transliteration controls aligned and the rules compact from one to four columns', async () => {
    let tables = siteTransliterationTables();
    let collapseHyphens = true;

    await page.route('**/api/admin/sites/site-1/settings', async (route) => {
      if (route.request().method() === 'POST') {
        const change = object(object(route.request().postDataJSON()).transliteration);
        const rule = { symbol: 'Ё', replacement: '-' };

        expect(change.language).toBe('ru');
        expect(change.rules).toEqual(expect.arrayContaining([rule]));
        expect(change.expectedRules).toEqual(expect.arrayContaining([{ symbol: 'Ё', replacement: 'yo' }]));
        expect(change).toMatchObject({ collapseHyphens: false, expectedCollapseHyphens: true });
        collapseHyphens = false;
        tables = tables.map((table) => table.language === 'ru'
          ? { ...table, rules: table.rules.map((item) => item.symbol === rule.symbol ? rule : item) } : table);
      }
      await route.fulfill({
        json: {
          siteId: site.siteId,
          timeZone: 'UTC',
          addresses: { publicOrigin: 'https://example.test', localOrigin: null, originMode: 'Public' },
          transliteration: tables,
          collapseTransliterationHyphens: collapseHyphens,
        },
      });
    });
    expect(await page.getByRole('navigation', { name: 'Settings', exact: true }).getByRole('button').allTextContents())
      .toEqual([
        'Main', 'Access', 'General', 'Calibration', 'Dumps', 'Deployment', 'Page statistics',
        'CPU usage', 'Transliteration',
      ]);
    const settingsNav = page.getByRole('navigation', { name: 'Settings', exact: true });
    const title = page.locator('._workspace-toolbar:visible h1');
    const tabs = await settingsNav.getByRole('button').allTextContents();

    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await settingsNav.getByRole('button', { name: 'Access', exact: true }).click();
      const baseline = await title.boundingBox();

      expect(baseline).not.toBeNull();

      for (const tab of tabs) {
        await settingsNav.getByRole('button', { name: tab.trim(), exact: true }).click();
        expect(await title.boundingBox()).toMatchObject({ x: baseline!.x, y: baseline!.y });
      }
    }
    await page.getByRole('button', { name: 'Transliteration', exact: true }).click();
    const language = page.getByLabel('Transliteration language');

    await language.waitFor();
    expect(await language.locator('option').count()).toBe(10);
    await language.selectOption('el');
    await page.getByRole('textbox', { name: 'Replacement Ψ', exact: true }).waitFor();
    await language.selectOption('ru');
    const replacement = page.getByRole('textbox', { name: 'Replacement Ё', exact: true });

    expect(await replacement.inputValue()).toBe('yo');
    const collapse = page.getByRole('checkbox', { name: 'Collapse consecutive hyphens into one' });

    expect(await collapse.isChecked()).toBe(true);
    const editor = page.locator('._transliteration');
    const alignment = await editor.evaluate((panel) => {
      const center = (element: Element): number => {
        const bounds = element.getBoundingClientRect();

        return bounds.top + bounds.height / 2;
      };
      const selectCenter = center(panel.querySelector('select')!);

      return [...panel.querySelectorAll('form button')]
        .map((button) => Math.abs(center(button) - selectCenter));
    });
    const inputGeometry = (): Promise<{ height: number; offset: number; below: number }> =>
      replacement.evaluate((input) => {
        const row = input.closest('tr')!.getBoundingClientRect();
        const bounds = input.getBoundingClientRect();

        return { height: row.height, offset: bounds.top - row.top, below: row.bottom - bounds.bottom };
      });
    const before = await inputGeometry();

    expect.soft(alignment).toHaveLength(2);
    expect.soft(alignment.every((difference) => difference < 1)).toBe(true);
    expect.soft(before.height).toBeLessThanOrEqual(64);
    expect.soft(Math.abs(before.below - before.offset)).toBeLessThan(1);

    await replacement.fill('');
    expect(await replacement.evaluate((input) =>
      document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent)).toBe('empty');
    expect(await inputGeometry()).toEqual(before);
    await replacement.fill(' ');
    expect(await replacement.inputValue()).toBe('');
    await page.locator('.admin-language select').selectOption('ru');
    await page.getByRole('textbox', { name: 'Замена Ё', exact: true }).waitFor();
    await page.getByText('пусто', { exact: true }).first().waitFor();
    await page.getByRole('textbox', { name: 'Замена Ё', exact: true }).fill('-');
    await page.getByRole('checkbox', { name: 'Объединять длинные последовательности минусов в один' }).uncheck();
    await page.locator('._transliteration').getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    await page.getByText('Правила транслитерации сохранены.').waitFor();
    expect(await page.getByRole('checkbox', { name: 'Объединять длинные последовательности минусов в один' })
      .isChecked()).toBe(false);

    for (const [width, columns] of [[600, 1], [900, 2], [1100, 3], [1440, 4]] as const) {
      await page.setViewportSize({ width, height: 900 });

      const boxes = await page.locator('._transliteration-table tbody tr').evaluateAll((rows) =>
        rows.map((row) => {
          const rect = row.getBoundingClientRect();

          return { left: Math.round(rect.left), width: rect.width };
        }));

      expect.soft(new Set(boxes.map((box) => box.left)).size, width + ' px viewport').toBe(columns);
      expect.soft(Math.max(...boxes.map((box) => box.width)), width + ' px viewport').toBeLessThanOrEqual(264);
    }
    expect(errors).toEqual([]);
  });

  it('uploads and replaces a favicon with readable metadata and responsive alignment', async () => {
    let uploads = 0;
    let removals = 0;
    let removeFails = true;
    let fail = false;
    let current: { byteSize: number; width: number; height: number; version: string } | null = null;

    await page.route('**/api/admin/sites/site-1/favicon', async (route) => {
      if (route.request().method() === 'POST') {
        uploads++;
        const metadata: unknown = JSON.parse(
          decodeURIComponent(route.request().headers()['x-zarya-file-metadata']!),
        );

        expect(metadata).toEqual({ filename: 'favicon.ico' });
        expect(route.request().postDataBuffer()).toEqual(Buffer.from('synthetic icon'));

        if (fail) {
          await route.fulfill({ status: 400, json: { error: 'FileContentMismatch' } });

          return;
        }
        current = {
          byteSize: uploads === 1 ? 12595 : 10240,
          width: 32 * uploads,
          height: 32 * uploads,
          version: (uploads === 1 ? 'a' : 'b').repeat(64),
        };
      }
      await route.fulfill({ json: { favicon: current } });
    });
    await page.route('**/api/admin/sites/site-1/favicon/delete', async (route) => {
      removals++;
      expect(route.request().postDataJSON()).toEqual({});

      if (removeFails) {
        await route.fulfill({ status: 500, json: { error: 'InternalError' } });
      } else {
        current = null;
        await route.fulfill({ json: { favicon: null } });
      }
    });
    await page.route('https://example.test/favicon.ico?*', (route) => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32"/></svg>',
    }));
    await page.getByRole('button', { name: 'Main', exact: true }).click();
    const chooser = page.getByRole('button', { name: 'Favicon', exact: true });
    const field = page.locator('._favicon-field .media-file-input');
    const input = page.locator('._favicon-field input[type="file"]');

    await chooser.waitFor();
    expect(await field.count()).toBe(1);
    expect(await field.locator('.media-size-choice').count()).toBe(0);
    const [selection] = await Promise.all([page.waitForEvent('filechooser'), chooser.click()]);

    expect(selection.isMultiple()).toBe(false);
    expect(await input.getAttribute('type')).toBe('file');
    expect(await input.getAttribute('accept')).toBe('.ico');
    expect(await input.isVisible()).toBe(false);
    const file = { name: 'favicon.ico', mimeType: 'image/x-icon', buffer: Buffer.from('synthetic icon') };

    await input.setInputFiles(file);
    await page.getByText('favicon.ico · 12.3 KiB · 32 × 32 px', { exact: true }).waitFor();
    await input.setInputFiles(file);
    await page.getByText('favicon.ico · 10 KiB · 64 × 64 px', { exact: true }).waitFor();
    expect(await input.inputValue()).toBe('');
    expect(await field.locator('._media-file-name').innerText()).toBe('favicon.ico');
    expect(await field.locator('._media-file-preview').getAttribute('src'))
      .toBe('https://example.test/favicon.ico?v=' + 'b'.repeat(64));
    expect(await field.locator('.media-size-choice').count()).toBe(0);

    for (const width of [375, 768, 992, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const address = await page.getByLabel(/^Public site address/).boundingBox();
      const icon = await chooser.boundingBox();

      expect(address).not.toBeNull();
      expect(icon).not.toBeNull();

      if (width >= 768) {
        expect(Math.abs(address!.y - icon!.y)).toBeLessThan(2);
        expect(icon!.x).toBeGreaterThan(address!.x + address!.width);
      } else {
        expect(icon!.y).toBeGreaterThan(address!.y + address!.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await mkdir('.tmp', { recursive: true });
      await page.screenshot({ path: '.tmp/favicon-settings-' + width + '.png' });
    }
    fail = true;
    await input.setInputFiles(file);
    await page.getByRole('alert').waitFor();
    expect(await page.getByText('favicon.ico · 10 KiB · 64 × 64 px', { exact: true }).isVisible()).toBe(true);
    expect(uploads).toBe(3);
    const clear = page.getByRole('button', { name: 'Remove image: Favicon', exact: true });

    await clear.click();
    await expect.poll(() => clear.isEnabled()).toBe(true);
    expect(await field.locator('._media-file-name').innerText()).toBe('favicon.ico');
    removeFails = false;
    await clear.click();
    await expect.poll(() => clear.count()).toBe(0);
    expect(await field.locator('._media-file-name').innerText()).toBe('Choose image');
    expect(await page.getByText('favicon.ico · 10 KiB · 64 × 64 px', { exact: true }).count()).toBe(0);
    expect(removals).toBe(2);
  });

  afterEach(async () => {
    expect(errors).toEqual([]);
    await browser?.close();
  });
  it('hides the page statistics caption in mobile cards and retains it in tables', async () => {
    await page.getByRole('button', { name: 'Page statistics', exact: true }).click();
    await page.getByRole('cell', { name: '/popular/', exact: true }).waitFor();
    const caption = page.locator('.resolution-caption');

    for (const language of ['en', 'ru']) {
      await page.locator('.admin-language select').selectOption(language);

      for (const width of [320, 375, 576, 767, 768, 991, 992, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await caption.isVisible(), language + '/' + width).toBe(width >= 768);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const cell = page.getByRole('cell', { name: '/popular/', exact: true });
        const box = (await cell.boundingBox())!;

        expect(box.y).toBeLessThan(900);
        expect(await cell.isVisible()).toBe(true);

        if (width >= 768) {
          const bounds = (await caption.boundingBox())!;

          expect(bounds.width).toBeGreaterThan(bounds.height);
        }
        if (language === 'ru' && [375, 1440].includes(width)) {
          await page.screenshot({ path: '.tmp/page-statistics-caption-' + width + '.png' });
        }
      }
    }
    expect(writes).toEqual([]);
  });

  it('shows page resolution filters, a ready calendar and responsive statistics', async () => {
    const reads: URL[] = [];

    page.on('request', (request) => {
      if (request.url().includes('/page-resolutions?')) {
        reads.push(new URL(request.url()));
      }
    });
    await page.getByRole('button', { name: 'Page statistics', exact: true }).click();
    await page.getByRole('cell', { name: '/popular/', exact: true }).waitFor();
    expect(await page.getByRole('row').nth(1).innerText()).toContain('/popular/');
    expect(await page.getByRole('cell', { name: '12.25', exact: true }).count()).toBe(1);
    await page.getByLabel('CMS version', { exact: true }).selectOption('0.10.1');
    await page.getByLabel('Period', { exact: true }).selectOption('week');
    await page.getByRole('button', { name: 'Show results', exact: true }).click();
    await vi.waitFor(() => {
      expect(reads.at(-1)?.searchParams.get('cmsVersion')).toBe('0.10.1');
      expect(reads.at(-1)?.searchParams.get('from')).toBe('2026-11-01');
      expect(reads.at(-1)?.searchParams.get('to')).toBe('2026-11-07');
    });
    await page.getByLabel('Period', { exact: true }).selectOption('custom');
    await page.getByRole('button', { name: 'Open calendar', exact: true }).click();
    await page.locator('.resolution-calendar').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.resolution-calendar').waitFor({ state: 'hidden' });
    expect(await page.getByRole('button', { name: 'Open calendar', exact: true })
      .evaluate((element) => element === document.activeElement)).toBe(true);

    for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('cell', { name: '/popular/', exact: true }).waitFor({ state: 'visible' });
    }
    await page.getByLabel(/Interface language/).selectOption('ru');
    await page.getByRole('heading', { name: 'Статистика страниц', exact: true }).waitFor();
    expect(await page.getByRole('cell', { name: '12,25', exact: true }).count()).toBe(1);
  });

  it('distinguishes the current account, whole-row hover and accessible actions across responsive widths', async () => {
    const owner = page.getByRole('row', { name: 'owner@example.test — You', exact: true });
    const editor = page.getByRole('row', { name: 'editor@example.test', exact: true });
    const ownerColor = await owner.locator('td').first().evaluate((element) =>
      getComputedStyle(element).backgroundColor);

    expect(await owner.getByText('You', { exact: true }).count()).toBe(1);
    expect(await owner.getByRole('button', { name: 'Block: owner@example.test', exact: true }).isDisabled()).toBe(true);
    await editor.hover();
    const hoverColors = await editor.locator('td').evaluateAll((cells) =>
      cells.map((element) => getComputedStyle(element).backgroundColor));

    expect(new Set(hoverColors).size).toBe(1);
    expect(hoverColors[0]).not.toBe(ownerColor);
    expect(await editor.getByRole('button', { name: 'Delete: editor@example.test', exact: true })
      .evaluate((element) => element.classList.contains('cms-danger'))).toBe(true);
    expect(await editor.getByRole('button', { name: 'Block: editor@example.test', exact: true })
      .evaluate((element) => element.classList.contains('cms-warning'))).toBe(true);

    for (const width of [320, 375, 576, 767, 768, 992, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), String(width)).toBe(true);

      for (const button of await editor.getByRole('button').all()) {
        const box = await button.boundingBox();

        expect(box!.width, String(width)).toBe(44);
        expect(box!.height, String(width)).toBe(44);
      }

      if (width < 768) {
        expect(await editor.evaluate((element) => getComputedStyle(element).display)).toBe('grid');
        const rowBox = await editor.boundingBox();
        const actionBoxes = await Promise.all((await editor.getByRole('button').all()).map((button) =>
          button.boundingBox()));

        expect(new Set(actionBoxes.map((box) => box!.y)).size).toBe(1);
        expect(actionBoxes.at(-1)!.x + actionBoxes.at(-1)!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
      }
      if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY && [375, 1440].includes(width)) {
        await mkdir(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'admins-' + width + '.png'),
        });
      }
    }
    await page.getByRole('button', { name: 'Delete: editor@example.test', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete administrator', exact: true });

    await dialog.waitFor();
    expect(await dialog.getByText('editor@example.test', { exact: true }).count()).toBe(1);
    await page.keyboard.press('Escape');
    expect(await dialog.isVisible()).toBe(false);
    expect(await page.getByRole('button', { name: 'Delete: editor@example.test', exact: true }).evaluate(
      (element) => element === document.activeElement,
    )).toBe(true);
    expect(writes).toEqual([]);
    await page.locator('.admin-language select').selectOption('ru');
    const localizedTab = page.getByRole('tab', { name: 'Пользователи', exact: true });

    await localizedTab.waitFor();
    expect(await localizedTab.getAttribute('aria-selected')).toBe('true');
    expect(await page.getByRole('row', { name: 'owner@example.test — Вы', exact: true }).count()).toBe(1);
  });
  it('confirms access changes and deletion and preserves failed password edits', async () => {
    await page.getByRole('button', { name: 'Block: editor@example.test', exact: true }).click();
    let dialog = page.getByRole('dialog');

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Block: editor@example.test', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('button', { name: 'Unblock: editor@example.test', exact: true }).waitFor();
    expect(writes.at(-1)).toEqual({
      path: '/api/admin/users/editor/block', body: { expectedVersion: 'editor-v1', blocked: true },
    });
    await page.getByRole('button', { name: 'Unblock: editor@example.test', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('button', { name: 'Block: editor@example.test', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Change password: editor@example.test', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Change password', exact: true });
    const password = dialog.getByLabel('New password', { exact: true });

    await password.fill('synthetic changed password');
    expect(await password.getAttribute('type')).toBe('password');
    await dialog.getByRole('button', { name: 'Show password', exact: true }).click();
    expect(await password.getAttribute('type')).toBe('text');
    conflict = true;
    await dialog.getByRole('button', { name: 'Change password', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    expect(await password.inputValue()).toBe('synthetic changed password');
    const count = writes.length;

    await page.waitForTimeout(100);
    expect(writes).toHaveLength(count);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Change password: editor@example.test', exact: true }).click();
    expect(await password.inputValue()).toBe('');
    expect(await password.getAttribute('type')).toBe('password');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Delete: editor@example.test', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('tr[aria-label="editor@example.test"]'));
  });
  it('loads additional pages explicitly and retains rows on a failed refresh', async () => {
    let reads = 0;
    let fail = false;
    const first = users.slice(0, 2);
    const last = users.slice(2);

    await page.route('**/api/admin/users*', async (route) => {
      reads++;

      if (fail) {
        await route.fulfill({ status: 500, json: { error: 'InternalError' } });

        return;
      }

      const more = new URL(route.request().url()).searchParams.has('cursor');

      await route.fulfill({
        json: { currentAdminUserId: 'owner', items: more ? last : first, nextCursor: more ? null : 'opaque' },
      });
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Load more', exact: true }).waitFor();
    expect(await page.getByRole('row', { name: 'blocked@example.test', exact: true }).count()).toBe(0);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await page.getByRole('row', { name: 'blocked@example.test', exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Load more', exact: true }).count()).toBe(0);
    fail = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').waitFor();
    const count = reads;

    await page.waitForTimeout(100);
    expect(reads).toBe(count);
    expect(await page.getByRole('row', { name: 'owner@example.test — You', exact: true }).count()).toBe(1);
  });
  it('creates accounts with one password and signs in again after changing its own password', async () => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.getByRole('button', { name: 'Create administrator', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const dialogBox = await dialog.boundingBox();

    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(375);

    await dialog.getByLabel('Email', { exact: true }).fill('new@example.test');
    expect(await dialog.locator('input[name="password"]').count()).toBe(1);
    await dialog.getByLabel('New password', { exact: true }).fill('short');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    expect(writes).toEqual([]);
    await dialog.getByLabel('New password', { exact: true }).fill('synthetic initial password');

    if (process.env.ZARYA_UI_SCREENSHOT_DIRECTORY) {
      await mkdir(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.ZARYA_UI_SCREENSHOT_DIRECTORY, 'admins-create-dialog-375.png'),
      });
    }
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('row', { name: 'new@example.test', exact: true }).waitFor();
    expect(writes.at(-1)).toEqual({
      path: '/api/admin/users',
      body: {
        email: 'new@example.test',
        password: 'synthetic initial password',
        roleId: 'cms.system.admin',
        siteId: null,
      },
    });
    await page.getByRole('button', { name: 'Change password: owner@example.test', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('New password', { exact: true }).fill('synthetic own new password');
    await dialog.getByRole('button', { name: 'Change password', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain('synthetic');
  });
});
