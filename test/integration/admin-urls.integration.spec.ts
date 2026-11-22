import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { type Browser, chromium } from 'playwright-core';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseVirtualUrlStore,
} from '../../src/adapters/outbound/persistence/mongoose/routing/virtual-url-store.adapter.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { virtualUrlChildren } from '../../src/domain/routing/virtual-url.policy.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { PUBLICATION_STORE } from '../../src/infra/publication/publication.tokens.js';
import type { IUrlCatalog } from '../../src/ports/inbound/routing/get-url-catalog.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import { verifyScrollShadow } from '../support/admin-scroll.js';
import { account } from '../support/admin-users.js';
import { urlFixture } from '../support/routing.js';

describe('URLs and Settings through real composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplication<Server>;
  let browser: Browser;
  let root = '';
  let origin = '';
  let cookie = '';
  let siteId = '';
  let homeId = '';
  let pageId = '';

  function command(route: string, body: unknown): Promise<Response> {
    return fetch(origin + route, {
      method: 'POST',
      headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  }
  async function identity(response: Response, key: string): Promise<string> {
    expect(response.status, await response.clone().text()).toBe(201);
    const data: Record<string, unknown> = await response.json();
    const value = data[key];

    if (typeof value !== 'string') {
      throw new Error('Missing identity');
    }

    return value;
  }
  async function catalog(): Promise<IUrlCatalog> {
    const response = await fetch(origin + '/api/admin/sites/' + siteId + '/urls', { headers: { Cookie: cookie } });

    expect(response.status).toBe(200);

    return response.json();
  }
  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!mongoUri || !executablePath) {
      throw new Error('Explicit isolated MongoDB and browser required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/admin-urls-'));
    const users = new MongooseAdminUserStore(connection);
    const password = 'synthetic urls settings password';
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await users.run(async (work) => {
      await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing port');
    }
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    origin = 'http://127.0.0.1:' + address.port;
    app = await createPublicHttpApplication({
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      artifactsRoot: path.join(root, 'artifacts'),
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
      // Route mutations are explicit here; background hook delivery must not race bulk fixture creation.
      backgroundWork: false,
    });
    const login = await command('/api/admin/auth/login', { email: 'user-1@example.test', password });

    expect(login.status).toBe(200);
    cookie = login.headers.get('Set-Cookie')?.split(';')[0] ?? '';
    siteId = await identity(await command('/api/admin/sites', {
      mark: 'UrlsExample',
      name: 'URL workspace',
      primaryDomain: '127.0.0.1',
      languages: ['en'],
      defaultLanguage: 'en',
    }), 'siteId');
    const pages = '/api/admin/sites/' + siteId + '/pages';

    homeId = await identity(await command(pages, {
      mark: 'Home',
      language: 'en',
      title: 'Home',
      contentMd: 'Home',
    }), 'pageId');
    pageId = await identity(await command(pages, {
      mark: 'Consultation',
      language: 'en',
      title: 'Consultation',
      contentMd: 'Consultation content',
    }), 'pageId');
    browser = await chromium.launch({ executablePath, headless: true });
  });
  afterAll(async () => {
    await browser?.close();
    await app?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Unsafe test database');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('explains the missing sitemap when published pages have no configured public address', async () => {
    const base = '/api/admin/sites/' + siteId;

    expect((await command(base + '/pages/' + homeId + '/publication', {
      templateId: 'ZaryaBasic',
      path: '/',
    })).status).toBe(200);
    expect((await fetch(origin + '/sitemap.xml')).status).toBe(200);
    const context = await browser.newContext();

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.setDefaultTimeout(6000);

      await page.goto(origin + '/admin/sites/' + siteId + '/urls');
      await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
      const main = page.getByRole('main', { name: 'URLs', exact: true });

      await main.getByText('sitemap.xml is missing because the public site address is not configured.',
        { exact: false }).waitFor();
      expect(await main.getByRole('link', { name: 'Settings', exact: true }).first().getAttribute('href'))
        .toBe('/admin/sites/' + siteId + '/settings');
    } finally {
      await context.close();
    }
  });

  it('applies URL moves immediately while retaining frozen published page content', async () => {
    const base = '/api/admin/sites/' + siteId;
    const settings = {
      addresses: { publicOrigin: origin, localOrigin: 'http://localhost:3100' },
      expectedAddresses: { publicOrigin: null, localOrigin: null },
    };

    expect((await command(base + '/settings', settings)).status).toBe(200);
    expect((await command(base + '/settings', settings)).status).toBe(409);
    const read = await fetch(origin + base + '/settings', { headers: { Cookie: cookie } });

    expect(await read.json()).toMatchObject({ siteId, addresses: settings.addresses, timeZone: 'UTC' });
    expect((await command(base + '/pages/' + homeId + '/publication', {
      templateId: 'ZaryaBasic',
      path: '/',
    })).status).toBe(200);
    expect((await command(base + '/pages/' + pageId + '/publication', {
      templateId: 'ZaryaBasic',
      path:
      '/services/consultation/',
    })).status).toBe(200);
    expect((await fetch(origin + '/sitemap.xml')).status).toBe(200);
    expect((await command(base + '/publish', {})).status).toBe(200);
    const before = await catalog();
    const current = before.urls.find((item) => item.url.pageId === pageId)!;
    const home = before.urls.find((item) => item.url.pageId === homeId)!;

    expect(before.published?.sitemapPaths).toEqual(['/', '/services/consultation/']);
    const sitemapBefore = await fetch(origin + '/sitemap.xml');
    const xmlBefore = await sitemapBefore.text();

    expect(sitemapBefore.status).toBe(200);
    expect(xmlBefore).toContain(origin + '/services/consultation/');
    const head = await fetch(origin + '/sitemap.xml', { method: 'HEAD' });

    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const move = { pageId, path: '/services/session/', parentUrlId: null, moveSubtree: false, redirectStatus: 301 };
    const frozenHtml = await (await fetch(origin + '/services/consultation/')).text();

    expect((await command(base + '/pages/' + pageId, {
      title: 'Unpublished title', contentMd: 'PRIVATE DRAFT MUST NOT BE PUBLISHED',
    })).status).toBe(200);

    expect((await command(base + '/urls/' + current.url.urlId + '/move', move)).status).toBe(200);
    expect((await command(base + '/urls/' + current.url.urlId + '/move', {
      ...move,
      path: '/stale/',
    })).status).toBe(409);
    const after = await catalog();

    expect(after.published?.releaseId).not.toBe(before.published?.releaseId);
    expect(after.urls.find((item) => item.url.urlId === current.url.urlId)?.url.kind).toBe('REDIRECT');
    const moved = await fetch(origin + '/services/consultation/', { redirect: 'manual' });

    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/services/session/');
    expect(await (await fetch(origin + '/services/session/')).text()).toBe(frozenHtml);
    expect((await fetch(origin + '/sitemap.xml')).status).toBe(200);
    expect(await (await fetch(origin + '/sitemap.xml')).text()).not.toBe(xmlBefore);
    const old = after.urls.find((item) => item.url.urlId === current.url.urlId)!;
    const retarget = { expectedVersion: old.version, targetUrlId: home.url.urlId, redirectStatus: 308 };

    expect((await command(base + '/urls/' + old.url.urlId + '/redirect', retarget)).status).toBe(200);
    expect((await command(base + '/urls/' + old.url.urlId + '/redirect', retarget)).status).toBe(409);
    const redirect = await fetch(origin + old.url.path, { redirect: 'manual' });

    expect(redirect.status).toBe(308);
    expect(redirect.headers.get('location')).toBe('/');
    expect((await catalog()).published?.sitemapPaths).toEqual(['/', '/services/session/']);
    expect((await fetch(origin + base + '/urls/' + old.url.urlId + '/history', {
      headers: { Cookie: cookie },
    })).status).toBe(200);
    const foreignSite = await identity(await command('/api/admin/sites', {
      mark: 'ForeignUrls',
      name: 'Other',
      primaryDomain: 'other.test',
      languages: ['en'],
      defaultLanguage: 'en',
    }), 'siteId');

    expect((await command('/api/admin/sites/' + foreignSite + '/urls/' + old.url.urlId + '/redirect',
      retarget)).status).toBe(404);
    await verifyMigrations(connection, 'migrations');
  });

  it('shows virtual folders, page links, actual sitemap membership, redirect history and editable settings',
    async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];

      try {
        await context.addCookies([{
          name: 'zarya_admin_session',
          value: cookie.slice(cookie.indexOf('=') + 1),
          domain: '127.0.0.1',
          path: '/api/admin',
          httpOnly: true,
          sameSite: 'Strict',
        }]);
        const page = await context.newPage();

        page.on('pageerror', (error) => {
          errors.push(error.message);
        });
        page.setDefaultTimeout(6000);
        await page.goto(origin + '/admin/sites/' + siteId + '/pages/' + pageId);
        await page.locator('#page-content').fill('Unsaved editor buffer');
        await page.getByRole('link', { name: 'Edit URL', exact: true }).click();
        await page.getByRole('heading', { name: '/services/session/', exact: true }).waitFor();
        const main = page.getByRole('main', { name: 'URLs', exact: true });

        await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
        const beforeParent = await catalog();
        const originalUrl = beforeParent.urls.find((item) => item.url.pageId === pageId)!;
        const homeUrl = beforeParent.urls.find((item) => item.url.pageId === homeId)!;
        const frozenHtml = await (await fetch(origin + originalUrl.url.path)).text();
        const changeButton = main.getByRole('button', { name: 'Change URL', exact: true });

        expect(await changeButton.isDisabled()).toBe(true);
        await main.getByRole('button', { name: 'Parent URL for routing relationships', exact: true }).click();
        await page.getByRole('option', { name: '/', exact: true }).click();
        expect(await changeButton.isEnabled()).toBe(true);
        await changeButton.click();
        await main.getByText('Routing parent saved. The URL path is unchanged.', { exact: true }).waitFor();
        const afterParent = await catalog();
        const savedUrl = afterParent.urls.find((item) => item.url.pageId === pageId)!;

        expect(savedUrl.url).toMatchObject({
          urlId: originalUrl.url.urlId, path: originalUrl.url.path, kind: 'PAGE', parentUrlId: homeUrl.url.urlId,
        });
        expect(afterParent.urls).toHaveLength(beforeParent.urls.length);
        expect(await (await fetch(origin + originalUrl.url.path)).text()).toBe(frozenHtml);
        expect(await main.getByRole('button', {
          name: 'Parent URL for routing relationships', exact: true,
        }).innerText()).toContain('/');
        expect(await changeButton.isDisabled()).toBe(true);
        await page.locator('#urls-drawer').getByRole('button', { name: 'Refresh', exact: true }).click();
        await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
        expect(await main.getByRole('button', {
          name: 'Parent URL for routing relationships', exact: true,
        }).innerText()).toContain('/');
        const rootRow = page.locator('[data-url-path="/"]').locator('..');
        const selectedRow = page.locator('[data-url-path="/services/session/"]').locator('..');

        expect(await rootRow.evaluate((element) => getComputedStyle(element).backgroundColor))
          .toBe('rgb(233, 238, 226)');
        expect(await selectedRow.evaluate((element) => getComputedStyle(element).backgroundColor))
          .toBe('rgb(229, 236, 220)');

        for (const path of ['/', '/services/']) {
          const label = page.locator('[data-url-path="' + path + '"]');
          const toggle = label.locator('..').locator('.tree-disclosure');
          const icon = label.locator('span').first();
          const toggleBox = (await toggle.boundingBox())!;

          expect((await icon.boundingBox())!.x - toggleBox.x - toggleBox.width).toBeGreaterThanOrEqual(10);
        }
        expect(await page.locator('#urls-drawer').getByRole('button', { name: 'Refresh', exact: true })
          .locator('svg.cms-icon').count()).toBe(1);

        expect(await main.getByRole('link', { name: 'Open page in admin' }).getAttribute('href'))
          .toBe('/admin/sites/' + siteId + '/pages/' + pageId);
        expect(await main.getByRole('link', { name: 'Open public page' }).getAttribute('href')).toBe(origin
        + '/services/session/');
        expect(await main.getByRole('link', { name: 'Open public page' }).getAttribute('target')).toBe('_blank');
        expect(await main.getByRole('link', { name: 'Open local page' }).getAttribute('href')).toBe('http://localhost:3100/services/session/');
        expect(await main.getByText('Included in the active release sitemap', { exact: true }).count()).toBe(1);
        expect(await main.getByLabel('Redirect the old address to the new URL', {
          exact: true,
        }).isChecked()).toBe(true);
        expect(await main.getByLabel('Keep the URLs of nested pages', { exact: true }).count()).toBe(0);
        await page.locator('[data-url-path="/services/"]').click();
        await main.getByRole('heading', { name: '/services/', exact: true }).waitFor();
        const folderContents = main.locator('.folder-contents');

        expect(await folderContents.innerText()).toContain('page URLs — 1 · redirects — 1 · virtual folders — 0');
        expect(await folderContents.innerText()).toContain('308 → /');
        expect(await main.getByText('No page is assigned', { exact: true }).count()).toBe(1);
        expect(await main.getByRole('link', { name: 'Open page in admin' }).count()).toBe(0);
        await folderContents.getByRole('link', { name: '/services/consultation/', exact: true }).click();
        await main.getByRole('heading', { name: 'Redirect 308' }).waitFor();
        await main.getByRole('heading', { name: 'Previous behavior' }).waitFor();
        await page.locator('#urls-drawer ._tree-scroll nav').waitFor();
        await page.getByLabel('Only addresses in sitemap.xml', { exact: true }).check();
        expect(await page.locator('[data-url-path="/services/consultation/"]').count()).toBe(0);
        expect(await page.locator('[data-url-path="/services/"]').count()).toBe(1);
        await page.getByLabel('Only addresses in sitemap.xml', { exact: true }).uncheck();
        await page.getByRole('button', { name: 'Pages', exact: true }).click();
        expect(await page.locator('#page-content').inputValue()).toBe('Unsaved editor buffer');
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const settings = page.getByRole('main', { name: 'Settings', exact: true });

        expect(await settings.getByLabel('Local port', { exact: true }).inputValue()).toBe('3100');
        await page.setViewportSize({ width: 1440, height: 500 });
        await verifyScrollShadow(settings.locator('._workspace-scroll'),
          settings.locator(':scope > ._workspace-toolbar'));
        await page.setViewportSize({ width: 1440, height: 900 });
        await settings.getByLabel('Local port', { exact: true }).fill('3201');
        await settings.getByRole('button', { name: 'Save settings' }).click();
        await settings.getByText('Site address settings saved.', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'URLs', exact: true }).click();
        await page.locator('[data-url-path="/services/session/"]').click();
        await page.setViewportSize({ width: 1440, height: 500 });
        await verifyScrollShadow(main.locator('._workspace-scroll'), main.locator('._workspace-toolbar'));
        await verifyScrollShadow(page.locator('#urls-drawer ._tree-scroll'),
          page.locator('#urls-drawer ._drawer-heading'));
        const folderToggle = page.getByRole('button', { name: 'Expand or collapse /services/', exact: true });

        await folderToggle.click();
        expect(await main.getByRole('heading', { name: '/services/session/', exact: true }).count()).toBe(1);
        expect(await page.locator('[data-url-path="/services/session/"]').count()).toBe(0);
        await folderToggle.click();
        await page.setViewportSize({ width: 1440, height: 900 });
        await main.getByRole('link', { name: 'Open local page' }).waitFor();
        expect(await main.getByRole('link', { name: 'Open local page' }).getAttribute('href'))
          .toBe('http://localhost:3201/services/session/');
        const base = '/api/admin/sites/' + siteId;
        const childId = await identity(await command(base + '/pages', {
          mark: 'NestedChild', title: 'Nested child', language: 'en', contentMd: 'Nested published content',
        }), 'pageId');

        expect((await command(base + '/pages/' + childId + '/publication', {
          templateId: 'ZaryaBasic', path: '/services/session/child-wrong/',
        })).status).toBe(200);
        const child = (await catalog()).urls.find((row) => row.url.pageId === childId)!;

        expect((await command(base + '/urls/' + child.url.urlId + '/move', {
          pageId: childId,
          path: '/services/session/child/',
          parentUrlId: null,
          moveSubtree: false,
          redirectStatus: 301,
          oldUrlAction: 'Delete',
          childrenAction: 'Keep',
        })).status).toBe(200);
        await page.locator('#urls-drawer').getByRole('button', { name: 'Refresh', exact: true }).click();
        await main.getByLabel('Keep the URLs of nested pages', { exact: true }).waitFor();
        expect(await main.getByLabel('Keep the URLs of nested pages', { exact: true }).isChecked()).toBe(true);
        await main.getByLabel('New URL path', { exact: true }).fill('/services/meeting/');
        await main.getByLabel('Move nested pages up one level and retain redirects (1)', { exact: true }).check();
        expect(await main.getByLabel('Move nested pages up one level without redirects (1)', {
          exact: true,
        }).count()).toBe(1);
        await main.getByRole('button', { name: 'Change URL', exact: true }).click();
        await main.getByRole('heading', { name: '/services/meeting/', exact: true }).waitFor();
        await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
        expect((await fetch(origin + '/services/meeting/')).status).toBe(200);
        expect((await fetch(origin + '/services/child/')).status).toBe(200);
        expect((await fetch(origin + '/services/session/child/', { redirect: 'manual' })).status).toBe(301);
        expect(await (await fetch(origin + '/services/meeting/')).text()).not.toContain('PRIVATE DRAFT');
        await main.getByLabel('New URL path', { exact: true }).fill('/services/final/');
        await main.getByLabel('Permanently delete the old address', { exact: true }).check();
        await main.getByLabel('Retarget these redirects to the new page', { exact: true }).waitFor();
        expect(await main.getByText('/services/session/ → /services/meeting/', { exact: true }).count()).toBe(1);
        expect(await main.getByLabel('Permanently delete the old address', { exact: true }).isChecked()).toBe(true);
        await main.getByRole('button', { name: 'Change URL', exact: true }).click();
        await main.getByRole('heading', { name: '/services/final/', exact: true }).waitFor();
        await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
        expect((await fetch(origin + '/services/meeting/', { redirect: 'manual' })).status).toBe(404);
        expect((await fetch(origin + '/services/session/', { redirect: 'manual' })).headers.get('location'))
          .toBe('/services/final/');
        await main.getByLabel('New URL path', { exact: true }).fill('/services/finished/');
        await main.getByLabel('Permanently delete the old address', { exact: true }).check();
        await main.getByLabel('Permanently delete these redirects', { exact: true }).check();
        expect(await main.getByLabel('Permanently delete these redirects', { exact: true }).isChecked()).toBe(true);
        await main.getByRole('button', { name: 'Change URL', exact: true }).click();
        await main.getByRole('heading', { name: '/services/finished/', exact: true }).waitFor();
        await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
        expect((await fetch(origin + '/services/final/', { redirect: 'manual' })).status).toBe(404);
        expect((await fetch(origin + '/services/session/', { redirect: 'manual' })).status).toBe(404);
        expect((await fetch(origin + '/services/finished/')).status).toBe(200);
        expect(await main.locator('._workspace-scroll').evaluate((element) => element.scrollTop)).toBe(0);
        await page.locator('#urls-drawer ._tree-scroll nav').waitFor();
        await page.screenshot({ path: '.tmp/urls-desktop.png' });

        for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992, 1199, 1200, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await main.getByRole('button', { name: 'URL tree', exact: true }).focus();
        await page.keyboard.press('Enter');
        await page.locator('[data-url-path="/services/"]').click();
        await main.getByRole('heading', { name: '/services/', exact: true }).waitFor();
        await page.screenshot({ path: '.tmp/urls-mobile.png' });
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  it('reports pending activation after a publication fault and recovers without repeating the saved move', async () => {
    const before = await catalog();
    const current = before.urls.find((row) => row.url.pageId === pageId)!;
    const stage = vi.spyOn(app.get<IPublicationStorePort>(PUBLICATION_STORE), 'stage')
      .mockRejectedValueOnce(new Error('Synthetic routing publication failure'));
    const base = '/api/admin/sites/' + siteId;

    try {
      const response = await command(base + '/urls/' + current.url.urlId + '/move', {
        pageId,
        path: '/services/recovered/',
        parentUrlId: null,
        moveSubtree: false,
        redirectStatus: 301,
        oldUrlAction: 'Redirect',
        childrenAction: 'Keep',
      });

      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ publicationFailed: true, publication: null });
      expect((await catalog()).published?.releaseId).toBe(before.published?.releaseId);
      expect((await fetch(origin + current.url.path)).status).toBe(200);
      expect((await fetch(origin + '/services/recovered/')).status).toBe(404);
      expect((await command(base + '/urls/publish', {})).status).toBe(200);
      expect((await fetch(origin + current.url.path, { redirect: 'manual' })).status).toBe(301);
      expect((await fetch(origin + '/services/recovered/')).status).toBe(200);
      expect(await (await fetch(origin + '/services/recovered/')).text()).not.toContain('PRIVATE DRAFT');
    } finally {
      stage.mockRestore();
    }
  });
  it('applies redirects on save and recovers activation without repeating the saved redirect', async () => {
    const base = '/api/admin/sites/' + siteId;

    expect((await command(base + '/pages/' + homeId + '/publication', {
      templateId: 'ZaryaBasic', path: '/',
    })).status).toBe(200);
    const targetId = await identity(await command(base + '/pages', {
      mark: 'RedirectTarget', title: 'Redirect target', contentMd: 'Published target', language: 'en',
    }), 'pageId');
    const sourceId = await identity(await command(base + '/pages', {
      mark: 'RedirectSource',
      title: 'Redirect source',
      contentMd: 'Published source',
      language: 'en',
      parentPageId: targetId,
    }), 'pageId');

    for (const [id, path] of [[sourceId, '/redirect-source/'], [targetId, '/redirect-target/']]) {
      expect((await command(base + '/pages/' + id + '/publication', { templateId: 'ZaryaBasic', path })).status)
        .toBe(200);
    }
    const before = await catalog();
    const current = before.urls.find((row) => row.url.pageId === sourceId)!;
    const home = before.urls.find((row) => row.url.pageId === homeId)!;
    const homeHtml = await (await fetch(origin + '/')).text();
    const targetHtml = await (await fetch(origin + '/redirect-target/')).text();

    expect((await command(base + '/pages/' + homeId, {
      contentMd: 'PRIVATE REDIRECT DRAFT', title: 'Private home draft',
    })).status).toBe(200);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.setDefaultTimeout(6000);
      await page.goto(origin + '/admin/sites/' + siteId + '/pages/' + sourceId);
      await page.locator('#page-content').fill('Unsaved source buffer');
      await page.getByRole('link', { name: 'Edit URL', exact: true }).click();
      await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
      const main = page.getByRole('main', { name: 'URLs', exact: true });
      const picker = main.getByRole('button', { name: 'Destination address', exact: true });

      await picker.click();
      await page.getByRole('option', { name: '/', exact: true }).click();
      await main.getByRole('button', { name: 'Save redirect', exact: true }).click();
      await main.getByText('Redirect applied to the site.', { exact: true }).waitFor();
      const response = await fetch(origin + '/redirect-source/', { redirect: 'manual' });
      const head = await fetch(origin + '/redirect-source/', { method: 'HEAD', redirect: 'manual' });

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('/');
      expect(head.status).toBe(301);
      expect(head.headers.get('location')).toBe('/');
      expect(await head.text()).toBe('');
      expect(await (await fetch(origin + '/')).text()).toBe(homeHtml);
      await page.getByRole('button', { name: 'Pages', exact: true }).click();
      await page.locator('#path-unassigned').getByText('No URL is assigned to this page', { exact: false }).waitFor();
      await expect.poll(() => page.locator('#page-path').inputValue(), { timeout: 6000 })
        .toBe('/redirect-target/');
      expect(await page.locator('#path-hint').innerText()).toContain('parent page URL (/redirect-target/)');
      await page.locator('#page-path').fill('/redirect-target/new-slug/');
      await page.getByRole('button', { name: 'URLs', exact: true }).click();
      await page.getByRole('button', { name: 'Pages', exact: true }).click();
      expect(await page.locator('#page-path').inputValue()).toBe('/redirect-target/new-slug/');
      const reopened = await context.newPage();

      try {
        await reopened.goto(origin + '/admin/sites/' + siteId + '/pages/' + sourceId);
        await expect.poll(() => reopened.locator('#page-path').inputValue(), { timeout: 6000 })
          .toBe('/redirect-target/');
      } finally {
        await reopened.close();
      }
      expect(await page.locator('#page-path').isEditable()).toBe(true);
      expect(await page.locator('#page-content').inputValue()).toBe('Unsaved source buffer');
      expect(await page.locator('._page-status-primary').innerText()).toContain('Not published on the site');
      const sourceIndicator = page.locator('[data-page-id="' + sourceId + '"] ._page-state');

      await page.locator('[data-page-id="' + sourceId + '"]')
        .getByRole('img', { name: 'No URL assigned', exact: true }).waitFor();
      expect(await sourceIndicator.getAttribute('aria-label')).toBe('No URL assigned');
      expect(await sourceIndicator.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe('rgb(184, 55, 50)');
      expect(await page.locator('[data-page-id="' + homeId + '"] ._page-state').getAttribute('class'))
        .toContain('_page-state__published');
      await page.screenshot({ path: '.tmp/page-without-url.png' });
      await page.getByRole('button', { name: 'URLs', exact: true }).click();
      const after = await catalog();

      expect(after.published?.releaseId).not.toBe(before.published?.releaseId);
      expect((await command(base + '/urls/' + current.url.urlId + '/redirect', {
        expectedVersion: current.version, targetUrlId: home.url.urlId, redirectStatus: 301,
      })).status).toBe(409);
      expect((await catalog()).published?.releaseId).toBe(after.published?.releaseId);
      const stage = vi.spyOn(app.get<IPublicationStorePort>(PUBLICATION_STORE), 'stage')
        .mockRejectedValueOnce(new Error('Synthetic redirect activation failure'));

      try {
        await picker.click();
        await page.getByRole('combobox', { name: 'Search URL paths', exact: true }).fill('/redirect-target/');
        await page.getByRole('option', { name: '/redirect-target/', exact: true }).click();
        await main.getByLabel('Permanent redirect status', { exact: false }).selectOption('308');
        await main.getByRole('button', { name: 'Save redirect', exact: true }).click();
        await main.getByRole('alert').getByText('The URL was saved, but its public release could not be activated.',
          { exact: false }).waitFor();
        const pending = await fetch(origin + '/redirect-source/', { redirect: 'manual' });
        const historyUrl = origin + base + '/urls/' + current.url.urlId + '/history';
        const history = await (await fetch(historyUrl, { headers: { Cookie: cookie } })).json();

        expect(pending.status).toBe(301);
        expect(pending.headers.get('location')).toBe('/');
        expect((await catalog()).published?.releaseId).toBe(after.published?.releaseId);
        await main.getByRole('button', { name: 'Apply URL changes', exact: true }).click();
        await main.getByText('URL changes applied to the site.', { exact: true }).waitFor();
        const recovered = await fetch(origin + '/redirect-source/', { redirect: 'manual' });

        expect(recovered.status).toBe(308);
        expect(recovered.headers.get('location')).toBe('/redirect-target/');
        expect(await (await fetch(origin + '/redirect-target/')).text()).toBe(targetHtml);
        expect(await (await fetch(historyUrl, { headers: { Cookie: cookie } })).json()).toEqual(history);
        expect(await (await fetch(origin + '/')).text()).not.toContain('PRIVATE REDIRECT DRAFT');
      } finally {
        stage.mockRestore();
      }
      await page.getByRole('button', { name: 'Pages', exact: true }).click();
      await page.locator('#page-path').fill('/redirect-restored/');
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.waitForFunction((id) => document.querySelector('[data-page-id="' + id + '"] ._page-state')
        ?.classList.contains('_page-state__published'), sourceId);
      expect((await fetch(origin + '/redirect-restored/')).status).toBe(200);
      expect(await (await fetch(origin + '/redirect-restored/')).text()).toContain('Unsaved source buffer');
    } finally {
      await context.close();
    }
  });
  it('creates redirects and pages for virtual folders and atomically adopts existing page branches', async () => {
    const base = '/api/admin/sites/' + siteId;
    const first = await identity(await command(base + '/pages', {
      mark: 'VirtualChildOne', title: 'First virtual child', language: 'en', contentMd: 'Frozen first child',
    }), 'pageId');
    const second = await identity(await command(base + '/pages', {
      mark: 'VirtualChildTwo', title: 'Second virtual child', language: 'en', contentMd: 'Frozen second child',
    }), 'pageId');
    const deep = await identity(await command(base + '/pages', {
      mark: 'VirtualDeepChild',
      title: 'Deep child',
      language: 'en',
      contentMd: 'Frozen deep child',
      parentPageId: first,
    }), 'pageId');

    for (const [pageId, path] of [
      [first, '/example/page-01'], [second, '/example/page-02'], [deep, '/example/page-01/deep/'],
    ]) {
      expect((await command(base + '/pages/' + pageId + '/publication', { templateId: 'ZaryaBasic', path })).status)
        .toBe(200);
    }
    const firstHtml = await (await fetch(origin + '/example/page-01')).text();
    const before = await (await fetch(origin + base + '/pages', { headers: { Cookie: cookie } })).json();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();

      page.setDefaultTimeout(7000);
      await page.goto(origin + '/admin/sites/' + siteId + '/urls');
      await page.locator('[data-url-path="/example/"]').click();
      const main = page.locator('#urls-workspace');
      const create = main.getByRole('link', { name: 'Create a page at /example/', exact: true });

      await main.getByRole('heading', { name: 'Redirect settings', exact: true }).waitFor();
      expect(await create.getAttribute('href')).toContain('urlPath=%2Fexample%2F');
      await main.getByRole('button', { name: 'Destination address', exact: true }).click();
      await page.getByRole('combobox', { name: 'Search URL paths', exact: true }).fill('/example/page-02');
      await page.getByRole('option', { name: '/example/page-02', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await create.click();
      await expect.poll(() => page.locator('#page-path').inputValue()).toBe('/example/');
      await page.reload();
      await expect.poll(() => page.locator('#page-path').inputValue()).toBe('/example/');
      await page.locator('#page-title').fill('Example folder');
      expect(await page.locator('#page-path').inputValue()).toBe('/example/');
      await page.getByRole('button', { name: 'URLs', exact: true }).click();
      await page.getByRole('button', { name: 'Pages', exact: true }).click();
      expect(await page.locator('#page-path').inputValue()).toBe('/example/');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await page.screenshot({ path: '.tmp/virtual-folder-save.png' });
      await page.getByText('Draft saved', { exact: true }).waitFor();
      const bound = (await catalog()).urls.find((item) => item.url.path === '/example/')!;

      expect(bound.url.kind).toBe('PAGE');
      const parentId = bound.url.pageId!;
      const after = await (await fetch(origin + base + '/pages', { headers: { Cookie: cookie } })).json();

      for (const id of [first, second]) {
        expect(after.items.find((item: { pageId: string }) => item.pageId === id)).toMatchObject({
          parentPageId: parentId,
          sortOrder: before.items.find((item: { pageId: string }) => item.pageId === id).sortOrder,
        });
      }
      expect(after.items.find((item: { pageId: string }) => item.pageId === deep).parentPageId).toBe(first);
      expect(await (await fetch(origin + '/example/page-01')).text()).toBe(firstHtml);
      expect((await fetch(origin + '/example/')).status).toBe(404);
      await page.goto(origin + '/admin/sites/' + siteId + '/pages/' + parentId);
      await page.locator('#page-template').selectOption('ZaryaBasic');
      await page.getByRole('button', { name: 'Save & publish', exact: true }).click();
      await page.getByText('Page published', { exact: true }).waitFor();
      expect((await fetch(origin + '/example/')).status).toBe(200);

      const redirectChild = await identity(await command(base + '/pages', {
        mark: 'VirtualRedirectChild', title: 'Redirect child', language: 'en', contentMd: 'Redirect destination',
      }), 'pageId');

      expect((await command(base + '/pages/' + redirectChild + '/publication', {
        templateId: 'ZaryaBasic', path: '/redirect-folder/child',
      })).status).toBe(200);
      await page.goto(origin + '/admin/sites/' + siteId + '/urls');
      await page.locator('[data-url-path="/redirect-folder/"]').click();
      await main.getByRole('button', { name: 'Destination address', exact: true }).click();
      await page.getByRole('combobox', { name: 'Search URL paths', exact: true }).fill('/redirect-folder/child');
      await page.getByRole('option', { name: '/redirect-folder/child', exact: true }).click();
      await main.getByRole('button', { name: 'Save redirect', exact: true }).click();
      await main.getByText('Redirect applied to the site.', { exact: true }).waitFor();
      const response = await fetch(origin + '/redirect-folder/', { redirect: 'manual' });

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe('/redirect-folder/child');
      expect((await fetch(origin + '/redirect-folder/child')).status).toBe(200);
      await page.screenshot({ path: '.tmp/virtual-folder-redirect.png' });
    } finally {
      await context.close();
    }
  }, 60000);

  it('rejects stale virtual-folder captures and rolls back failed adoption before concurrent creation', async () => {
    const base = '/api/admin/sites/' + siteId;
    const child = await identity(await command(base + '/pages', {
      mark: 'AtomicFolderChild', title: 'Atomic child', contentMd: 'Child content', language: 'en',
    }), 'pageId');
    const parent = await identity(await command(base + '/pages', {
      mark: 'AtomicFolderParent', title: 'Atomic parent', contentMd: 'Parent content', language: 'en',
    }), 'pageId');

    expect((await command(base + '/pages/' + child + '/publication', {
      templateId: 'ZaryaBasic', path: '/atomic/child',
    })).status).toBe(200);
    const pages = connection.model<IPageRecord>('Page', pageSchema);
    const models = createRoutingModels(connection);
    const store = new MongooseVirtualUrlStore(models, pages);
    const next = urlFixture({ siteId, urlId: randomUUID(), mark: 'AtomicFolderUrl', path: '/atomic/', pageId: parent });
    const capture = await store.read(siteId);
    const children = virtualUrlChildren(capture, next.toState());

    expect(children).toEqual([child]);
    expect((await command(base + '/pages/' + child, { title: 'Changed child', contentMd: 'Child content' })).status)
      .toBe(200);
    await expect(store.commit(capture, next, children)).rejects.toThrow('changed');
    const fresh = await store.read(siteId);
    const update = vi.spyOn(pages, 'updateMany').mockImplementationOnce(() => {
      throw new Error('Synthetic adoption failure');
    });

    try {
      await expect(store.commit(fresh, next, children)).rejects.toThrow('Synthetic adoption failure');
    } finally {
      update.mockRestore();
    }
    expect(await models.urls.findOne({ siteId, path: '/atomic/' }).lean().exec()).toBeNull();
    expect((await store.read(siteId)).pages.find((page) => page.pageId === child)?.parentPageId).toBeNull();
    const other = urlFixture({ ...next.toState(), urlId: randomUUID(), mark: 'OtherAtomicFolderUrl' });
    const outcomes = await Promise.allSettled([
      store.commit(fresh, next, children), store.commit(fresh, other, children),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await models.urls.countDocuments({ siteId, path: '/atomic/' }).exec()).toBe(1);
    expect((await store.read(siteId)).pages.find((page) => page.pageId === child)?.parentPageId).toBe(parent);
  });

  it('pages URL suggestions in MongoDB across 1000 URLs and reuses the searchable picker', async () => {
    let current = (await catalog()).urls.find((row) => row.url.pageId === pageId);

    if (!current) {
      expect((await command('/api/admin/sites/' + siteId + '/pages/' + pageId + '/publication', {
        templateId: 'ZaryaBasic', path: '/suggestions-current/',
      })).status).toBe(200);
      current = (await catalog()).urls.find((row) => row.url.pageId === pageId)!;
    }

    const models = createRoutingModels(connection);
    const records = Array.from({ length: 1000 }, (_, index) => {
      const key = String(index).padStart(4, '0');
      const { urlId, ...state } = urlFixture({
        urlId: 'suggestion-' + key,
        siteId,
        mark: 'Suggestion' + key,
        pageId: 'suggestion-page-' + key,
        path: '/catalog/' + key + '/',
      }).toState();

      return { ...state, _id: urlId, markKey: state.mark.toLowerCase() };
    });

    await models.urls.insertMany(records);
    const first = records[0]!;

    await models.urls.insertMany([
      {
        ...first,
        _id: 'foreign-suggestion',
        siteId: 'foreign-site',
        mark: 'ForeignSuggestion',
        markKey: 'foreignsuggestion',
        path: '/catalog/0000-foreign/',
      },
      {
        ...first,
        _id: 'redirect-suggestion',
        pageId: null,
        mark: 'RedirectSuggestion',
        markKey: 'redirectsuggestion',
        path: '/catalog/0000-redirect/',
        kind: 'REDIRECT',
        redirectTargetUrlId: first._id,
        redirectStatus: 301,
      },
      {
        ...first,
        _id: 'descendant-suggestion',
        pageId: 'descendant-page',
        mark: 'DescendantSuggestion',
        markKey: 'descendantsuggestion',
        path: current.url.path + 'child/',
      },
    ]);
    const base = '/api/admin/sites/' + siteId + '/urls/suggestions';
    const params = new URLSearchParams({
      currentUrlId: current.url.urlId, purpose: 'Redirect', q: 'CATALOG/', limit: '10', offset: '10',
    });
    const response = await fetch(origin + base + '?' + params, { headers: { Cookie: cookie } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      siteId,
      items: records.slice(10, 20).map((record) => ({
        siteId, urlId: record._id, path: record.path, kind: 'PAGE',
      })),
    });
    params.set('purpose', 'Parent');
    params.set('q', current.url.path);
    params.set('offset', '0');
    expect(await (await fetch(origin + base + '?' + params, { headers: { Cookie: cookie } })).json())
      .toEqual({ siteId, items: [] });
    params.set('currentUrlId', 'foreign-suggestion');
    expect((await fetch(origin + base + '?' + params, { headers: { Cookie: cookie } })).status).toBe(404);

    for (const pagesOnly of [false, true]) {
      const collection = connection.db!.collection<{
        _id: string; siteId: string; kind: string; path: string;
      }>('urls');
      const plan = await collection.find({
        siteId,
        ...(pagesOnly ? { kind: 'PAGE' } : {}),
        _id: { $ne: current.url.urlId },
        path: { $regex: 'catalog/', $options: 'i' },
      }, { projection: { _id: 1, siteId: 1, path: 1, kind: 1 } }).sort({ path: 1 })
        .hint(pagesOnly ? 'urls_site_kind_path' : 'urls_site_path_unique')
        .skip(10).limit(10).explain('executionStats');
      const json = JSON.stringify(plan);

      expect(json).toContain('IXSCAN');
      expect(json).not.toContain('COLLSCAN');
      expect(json).not.toContain('"stage":"SORT"');
      expect(plan.executionStats.nReturned).toBe(10);
      expect(plan.executionStats.totalDocsExamined).toBeLessThan(1000);
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    try {
      await context.addCookies([{
        name: 'zarya_admin_session',
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/api/admin',
        httpOnly: true,
        sameSite: 'Strict',
      }]);
      const page = await context.newPage();
      const queries: URLSearchParams[] = [];

      page.on('request', (request) => {
        const url = new URL(request.url());

        if (url.pathname.endsWith('/urls/suggestions')) {
          queries.push(url.searchParams);
        }
      });
      page.setDefaultTimeout(10000);
      await page.goto(origin + '/admin/sites/' + siteId + '/urls/' + current.url.urlId);
      await page.locator('#urls-workspace[aria-busy="false"]').waitFor();
      await page.locator('[data-url-path="' + current.url.path + '"]').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const picker = page.getByRole('button', { name: 'Destination address', exact: true });

      await picker.click();
      const search = page.getByRole('combobox', { name: 'Search URL paths', exact: true });

      await search.fill('catalog/');
      await page.getByRole('option', { name: '/catalog/0009/', exact: true }).waitFor();
      expect(await page.getByRole('listbox').getByRole('option').count()).toBe(10);
      expect(await page.getByRole('option', { name: '/catalog/0000-redirect/', exact: true }).count()).toBe(0);

      for (const next of [
        { button: 'Next 10', offset: '10', lastPath: '/catalog/0019/' },
        { button: 'Previous 10', offset: '0', lastPath: '/catalog/0009/' },
      ]) {
        const options = page.getByRole('listbox').getByRole('option');
        const previousItems = await options.allTextContents();
        const before = await page.locator('._url-picker-popup').boundingBox();
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        let handled!: () => void;
        const completed = new Promise<void>((resolve) => {
          handled = resolve;
        });
        const pattern = '**/urls/suggestions?**';

        await page.route(pattern, async (route) => {
          try {
            await pending;
            await route.continue();
          } finally {
            handled();
          }
        });

        try {
          const requested = page.waitForRequest((request) =>
            new URL(request.url()).searchParams.get('offset') === next.offset);

          await page.getByRole('button', { name: next.button, exact: true }).click();
          await requested;
          expect(await options.allTextContents()).toEqual(previousItems);
          expect(await options.evaluateAll((elements) => elements.every((element) => element.matches(':disabled'))))
            .toBe(true);
          expect(await page.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
          await page.getByRole('status', { name: 'Loading…', exact: true }).waitFor();
          expect(await page.getByRole('button', { name: 'Next 10', exact: true }).isDisabled()).toBe(true);
          expect(await page.getByRole('button', { name: 'Previous 10', exact: true }).isDisabled()).toBe(true);
          await search.press('ArrowDown');
          await search.press('Enter');
          expect(await picker.getAttribute('aria-expanded')).toBe('true');
          const during = await page.locator('._url-picker-popup').boundingBox();

          expect(during!.height).toBeCloseTo(before!.height, 0);
          await page.screenshot({ path: '.tmp/url-picker-loading.png' });
        } finally {
          release();
          await completed;
          await page.unroute(pattern);
        }
        await page.getByRole('option', { name: next.lastPath, exact: true }).waitFor();
        expect(await options.count()).toBe(10);
        expect(await options.evaluateAll((elements) => elements.every((element) => !element.matches(':disabled'))))
          .toBe(true);
        expect(queries.at(-1)?.get('offset')).toBe(next.offset);
      }
      expect(queries.every((query) => query.get('limit') === '10')).toBe(true);
      await search.fill('catalog/0999/');
      await page.getByRole('option', { name: '/catalog/0999/', exact: true }).waitFor();
      expect(queries.at(-1)?.get('offset')).toBe('0');
      await search.press('ArrowDown');
      await search.press('Enter');
      expect(await picker.innerText()).toContain('/catalog/0999/');
      expect(await picker.getAttribute('aria-expanded')).toBe('false');
      await picker.click();
      await search.fill('catalog/');
      await page.getByRole('option', { name: '/catalog/0009/', exact: true }).waitFor();
      let finishSlow!: () => void;
      let retryServed = false;
      const gate = new Promise<void>((resolve) => {
        finishSlow = resolve;
      });

      await page.route('**/urls/suggestions?**', async (route) => {
        const query = new URL(route.request().url()).searchParams.get('q');

        if (query === 'slow-response') {
          await gate;
          await route.fulfill({
            json: {
              siteId,
              items: [{
                siteId, urlId: first._id, path: '/stale-result/', kind: 'PAGE',
              }],
            },
          });
        } else if (query === 'retry-response' && !retryServed) {
          retryServed = true;
          await route.fulfill({ status: 503, json: { error: 'Synthetic failure' } });
        } else {
          await route.continue();
        }
      });
      await search.fill('slow-response');
      await page.waitForRequest((request) => new URL(request.url()).searchParams.get('q') === 'slow-response');
      await search.fill('catalog/0999/');
      await page.getByRole('option', { name: '/catalog/0999/', exact: true }).waitFor();
      const obsoleteResponse = page.waitForResponse((response) =>
        new URL(response.url()).searchParams.get('q') === 'slow-response');

      finishSlow();
      await obsoleteResponse;
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      expect(await page.getByRole('listbox').getByRole('option').allTextContents()).toEqual(['/catalog/0999/']);
      await search.fill('retry-response');
      await page.getByRole('status').getByText('Could not load URLs.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByRole('status').getByText('No matching URLs.', { exact: true }).waitFor();
      expect(await page.getByRole('listbox').getByRole('option').count()).toBe(0);
      await search.fill('catalog/');
      await page.getByRole('option', { name: '/catalog/0009/', exact: true }).waitFor();
      await page.screenshot({ path: '.tmp/url-picker-desktop.png' });

      for (const width of [320, 375, 390, 393, 402, 414, 430, 440, 575, 576, 767, 768, 991, 992,
        1199, 1200, 1440, 390]) {
        await search.press('Escape');
        await page.setViewportSize({ width, height: 844 });
        await picker.scrollIntoViewIfNeeded();
        await picker.click();
        await search.fill('catalog/');
        await page.getByRole('option', { name: '/catalog/0009/', exact: true }).waitFor();
        const popup = page.locator('._url-picker-popup');

        try {
          await page.waitForFunction(() => {
            const bounds = document.querySelector('._url-picker-popup')?.getBoundingClientRect();

            return bounds && bounds.left >= 0 && bounds.right <= innerWidth
              && bounds.top >= 0 && bounds.bottom <= innerHeight
              && document.documentElement.scrollWidth <= innerWidth;
          }, undefined, { timeout: 2000 });
        } catch {
          await page.screenshot({ path: '.tmp/url-picker-failed.png' });
          throw new Error(JSON.stringify(await page.evaluate(() => ({
            width: innerWidth,
            height: innerHeight,
            popup: document.querySelector('._url-picker-popup')?.getBoundingClientRect().toJSON(),
            scrollWidth: document.documentElement.scrollWidth,
          }))));
        }
        const bounds = await popup.boundingBox();

        expect(bounds!.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.screenshot({ path: '.tmp/url-picker-mobile.png' });
      await search.press('Escape');
      expect(await picker.getAttribute('aria-expanded')).toBe('false');
    } finally {
      await context.close();
    }
    await verifyMigrations(connection, 'migrations');
  }, 30000);
});
