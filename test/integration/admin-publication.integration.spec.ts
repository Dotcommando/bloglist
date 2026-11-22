import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { parse, serialize } from 'parse5';

import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  ScryptAdminPasswordAdapter,
} from '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { PublishedVersionPosition } from '../../src/domain/pages/published-page-version.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { SITE_FAVICON_STORE } from '../../src/infra/media/media.tokens.js';
import { RESTORE_PAGE_VERSION } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import {
  CONFIGURE_PAGE_RENDERING,
  PUBLICATION_STORE,
  RELEASE_ACTIVATION,
} from '../../src/infra/publication/publication.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { IRestorePageVersion } from '../../src/ports/inbound/pages/restore-page-version.port.js';
import type { IUrlCatalog } from '../../src/ports/inbound/routing/get-url-catalog.port.js';
import type { ISiteFaviconStore } from '../../src/ports/outbound/media/site-favicon-store.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { account } from '../support/admin-users.js';
import { icoFixture } from '../support/favicon.js';

describe('authenticated page publication with isolated MongoDB and artifacts', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplication<Server>;
  let local: INestApplicationContext;
  let root = '';
  let origin = '';
  let cookie = '';

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit test MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/admin-publication-'));
    const sourcesRoot = path.join(root, 'sites');

    await mkdir(path.join(sourcesRoot, 'demo/templates/Live'), { recursive: true });
    const users = new MongooseAdminUserStore(connection);
    const password = 'synthetic publication password';
    const passwordDigest = await new ScryptAdminPasswordAdapter().hash(password);

    await users.run(async (work) => {
      await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
    });
    const probe = createServer();

    await new Promise<void>((resolve) => {
      probe.listen(0, '127.0.0.1', resolve);
    });
    const address = probe.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test port');
    }
    await new Promise<void>((resolve) => {
      probe.close(() => {
        resolve();
      });
    });
    origin = 'http://127.0.0.1:' + address.port;
    app = await createPublicHttpApplication({
      backgroundWork: false,
      mongoUri,
      database,
      host: '127.0.0.1',
      port: address.port,
      sourcesRoot,
      artifactsRoot: path.join(root, 'artifacts'),
      media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
      adminAuth: { origin },
      adminRoot: path.resolve('admin/dist'),
    });
    local = await createLocalApplication({
      backgroundWork: false,
      mongoUri,
      database,
      operator: { operatorId: 'test-operator', platformAdministrator: true },
      rendering: { sourcesRoot, artifactsRoot: path.join(root, 'artifacts') },
      media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
    });
    const response = await command('/api/admin/auth/login', { email: 'user-1@example.test', password });

    expect(response.status).toBe(200);
    cookie = response.headers.get('Set-Cookie')?.split(';')[0] ?? '';
    expect(cookie.startsWith('zarya_admin_session=')).toBe(true);
  });
  afterAll(async () => {
    await local?.close();
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
    if (root?.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  function command(route: string, body: unknown): Promise<Response> {
    return fetch(origin + route, {
      method: 'POST',
      headers: { Origin: origin, 'X-Zarya-Admin': '1', 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  async function identity(response: Response, key: string): Promise<string> {
    expect(response.status, await response.clone().text()).toBe(201);
    const body: unknown = await response.json();

    if (!body || typeof body !== 'object' || !Object.hasOwn(body, key)) {
      throw new Error('Missing response identity');
    }

    const value = Object.entries(body).find(([name]) => name === key)?.[1];

    if (typeof value !== 'string') {
      throw new Error('Invalid response identity');
    }

    return value;
  }

  it('publishes a page and retains static/Request pages and their assets across later publications', async () => {
    const siteId = await identity(await command('/api/admin/sites', {
      mark: 'PublicationExample',
      name: 'Publication example',
      primaryDomain: '127.0.0.1',
      languages: ['en', 'ru'],
      defaultLanguage: 'en',
    }), 'siteId');

    await writeFile(path.join(root, 'sites/demo/site.config.ts'), 'export default ' + JSON.stringify({ siteId }));
    await writeFile(path.join(root, 'sites/demo/styles.css'), 'body{margin:0;color:#333}');
    await writeFile(path.join(root, 'sites/demo/templates/Live/index.html'),
      '<!doctype html><html lang="[[*language]]"><head><title>[[*title]]</title></head><body>'
      + '[[*contentMd:markdown]]</body></html>');
    const pages = '/api/admin/sites/' + siteId + '/pages';
    const homeId = await identity(await command(pages, {
      mark: 'Home',
      language: 'en',
      title: 'Home',
      contentMd: 'Home content',
      h1: 'Home heading',
      metaTitle: 'Search title',
      metaDescription: 'Search description',
      robotsIndex: false,
      ogTitle: 'Social title',
      ogDescription: 'Social description',
      ogImage: 'https://example.test/share.webp',
      ogType: 'article',
    }), 'pageId');

    expect((await command(pages + '/' + homeId + '/publication', {
      templateId: 'ZaryaBasic',
      path: '/',
    })).status).toBe(200);
    const home = await fetch(origin + '/');
    const firstHtml = await home.text();

    expect(home.status).toBe(200);
    expect(firstHtml).toContain('Home content');
    expect(firstHtml).toContain('<title>Search title</title>');
    expect(firstHtml).toContain('<h1>Home heading</h1>');
    expect(firstHtml).toContain('name="robots" content="noindex,follow"');
    expect(firstHtml).toContain('property="og:title" content="Social title"');
    expect(firstHtml).toContain('property="og:image" content="https://example.test/share.webp"');
    const active = local.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const store = local.get<IPublicationStorePort>(PUBLICATION_STORE);
    const first = await active.getActive(siteId);
    const firstRelease = await store.read(siteId, first!.releaseId);
    const css = firstRelease!.manifest!.artifacts.find((file) => file.mimeType === 'text/css');

    expect(css).toBeDefined();
    const assetUrl = origin + '/assets/releases/' + first!.releaseId + '/' + css!.path.slice('assets/'.length);
    const favicon = await local.get<ISiteFaviconStore>(SITE_FAVICON_STORE).replace(siteId,
      assetBinary(await icoFixture(), 'image/x-icon'), { width: 32, height: 32, aspectRatio: 1 });
    const liveId = await identity(await command(pages, {
      mark: 'Live',
      language: 'ru',
      title: 'Live',
      contentMd: 'Сохранённый план',
    }), 'pageId');

    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      pageId: liveId,
      actorId: 'test-operator',
      rendering: {
        templateId: 'Live',
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    expect((await command(pages + '/' + liveId + '/publication', {
      templateId: 'Live',
      path: '/live/',
    })).status).toBe(200);
    const liveHtml = serialize(parse(await (await fetch(origin + '/live/')).text()));
    const liveRelease = await active.getActive(siteId);

    expect(liveHtml).toContain('Сохранённый план');
    expect(liveHtml).toContain('/favicon.ico?v=' + favicon.version);
    expect(await (await fetch(origin + '/')).text()).toBe(firstHtml);
    expect((await fetch(assetUrl)).status).toBe(200);
    const otherId = await identity(await command(pages, {
      mark: 'Other',
      language: 'en',
      title: 'Other',
      contentMd: 'Other content',
    }), 'pageId');

    expect((await command(pages + '/' + otherId + '/publication', {
      templateId: 'ZaryaBasic',
      path: '/offers/card-gift-123.php',
    })).status).toBe(200);
    expect(await (await fetch(origin + '/')).text()).toBe(firstHtml);
    const latestRelease = await active.getActive(siteId);
    const giftResponse = await fetch(origin + '/offers/card-gift-123.php');

    expect(giftResponse.status).toBe(200);
    expect(await giftResponse.text()).toContain('Other content');
    expect(latestRelease!.releaseId).not.toBe(liveRelease!.releaseId);

    expect(serialize(parse(await (await fetch(origin + '/live/')).text()))).toBe(liveHtml.replaceAll(
      '/assets/releases/' + liveRelease!.releaseId + '/', '/assets/releases/' + latestRelease!.releaseId + '/'));
    expect((await fetch(assetUrl)).status).toBe(200);
    expect((await fetch(origin + '/admin/sites/' + siteId + '/pages/' + homeId)).status).toBe(200);
    const catalogResponse = await fetch(origin + '/api/admin/sites/' + siteId + '/urls', {
      headers: { Cookie: cookie },
    });
    const catalog: IUrlCatalog = await catalogResponse.json();
    const liveUrl = catalog.urls.find((row) => row.url.pageId === liveId)!;

    expect((await command(pages + '/' + liveId, {
      title: 'Unpublished Request title',
      contentMd: 'PRIVATE REQUEST DRAFT',
    })).status).toBe(200);
    expect((await command('/api/admin/sites/' + siteId + '/urls/' + liveUrl.url.urlId + '/move', {
      pageId: liveId,
      path: '/live-renamed/',
      parentUrlId: null,
      moveSubtree: false,
      redirectStatus: 301,
      oldUrlAction: 'Redirect',
      childrenAction: 'Keep',
    })).status).toBe(200);
    const routedRelease = await active.getActive(siteId);
    const renamed = await fetch(origin + '/live-renamed/');
    const renamedHtml = serialize(parse(await renamed.text()));

    expect(renamed.status).toBe(200);
    expect(renamedHtml).toBe(liveHtml.replaceAll('/assets/releases/' + liveRelease!.releaseId + '/',
      '/assets/releases/' + routedRelease!.releaseId + '/'));
    expect((await fetch(origin + '/live/', { redirect: 'manual' })).status).toBe(301);
    const assetPaths = [...renamedHtml.matchAll(/(?:href|src)="(\/assets\/releases\/[^"]+)"/g)]
      .map((match) => match[1]!);

    expect(assetPaths.length).toBeGreaterThan(0);

    for (const assetPath of assetPaths) {
      expect(assetPath).toContain('/assets/releases/' + routedRelease!.releaseId + '/');
      expect((await fetch(origin + assetPath)).status).toBe(200);
    }
    const otherUrl = catalog.urls.find((row) => row.url.pageId === otherId)!;

    expect((await command('/api/admin/sites/' + siteId + '/urls/' + otherUrl.url.urlId + '/move', {
      pageId: otherId,
      path: '/other-renamed/',
      parentUrlId: null,
      moveSubtree: false,
      redirectStatus: 301,
      oldUrlAction: 'Delete',
      childrenAction: 'Keep',
    })).status).toBe(200);
    const reroutedRelease = await active.getActive(siteId);
    const retained = await fetch(origin + '/live-renamed/');

    expect(retained.status).toBe(200);
    expect(serialize(parse(await retained.text()))).toBe(renamedHtml.replaceAll(
      '/assets/releases/' + routedRelease!.releaseId + '/',
      '/assets/releases/' + reroutedRelease!.releaseId + '/'));
    expect((await fetch(origin + '/offers/card-gift-123.php', { redirect: 'manual' })).status).toBe(404);
    const before = await active.getActive(siteId);

    expect((await command(pages + '/' + homeId + '/publication', {
      templateId: 'ZaryaBasic',
      path: '/admin/',
    })).status).toBe(400);
    expect(await active.getActive(siteId)).toEqual(before);
    expect(await (await fetch(origin + '/')).text()).toBe(firstHtml);

    const edited = await command(pages + '/' + homeId, {
      title: 'Renamed home',
      contentMd: 'Edited draft',
      metaTitle: 'Draft search title',
      ogTitle: 'Draft social title',
      ogImage: null,
      robotsIndex: true,
    });

    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      status: 'DRAFT',
      metaTitle: 'Draft search title',
      ogTitle: 'Draft social title',
      ogImage: null,
      ogDescription: 'Social description',
      ogType: 'article',
    });
    expect(await (await fetch(origin + '/')).text()).toBe(firstHtml);
    expect((await command(pages + '/' + homeId + '/publication', {
      templateId: 'ZaryaBasic', path: '/',
    })).status).toBe(200);
    const editedHtml = await (await fetch(origin + '/')).text();

    expect(editedHtml).toContain('<title>Draft search title</title>');
    expect(editedHtml).toContain('property="og:title" content="Draft social title"');
    expect(editedHtml).not.toContain('property="og:image"');
    const restored = await local.get<IRestorePageVersion>(RESTORE_PAGE_VERSION).execute({
      siteId, pageId: homeId, version: PublishedVersionPosition.Previous,
    });

    expect(restored.toState()).toMatchObject({
      status: 'DRAFT',
      title: 'Home',
      metaTitle: 'Search title',
      ogTitle: 'Social title',
      ogImage: 'https://example.test/share.webp',
      robotsIndex: false,
    });
    expect(await (await fetch(origin + '/')).text()).toBe(editedHtml);
  });
});
