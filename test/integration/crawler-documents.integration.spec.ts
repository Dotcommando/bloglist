import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';

import {
  PublicDocumentController,
} from '../../src/adapters/inbound/documents/http/publication/public-document.controller.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { SystemDocument } from '../../src/domain/pages/document-mime.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import {
  CREATE_PAGE, LIST_PAGES, MOVE_PAGE, PAGE_REPOSITORY, UPDATE_PAGE,
} from '../../src/infra/pages/pages.tokens.js';
import { RESTORE_PAGE_VERSION } from '../../src/infra/pages/pages.tokens.js';
import {
  GET_PUBLICATION_OPTIONS, GET_PUBLISHED_ARTIFACT, PUBLISH_CURRENT_PAGE, RENDER_PUBLISHED_PAGE,
  RESOLVE_PUBLISHED_PATH,
} from '../../src/infra/publication/publication.tokens.js';
import { PUBLISH_ROUTING_RELEASE } from '../../src/infra/publication/publication.tokens.js';
import { PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION } from '../../src/infra/publication/publication.tokens.js';
import { CHANGE_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE, RESOLVE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IListPages } from '../../src/ports/inbound/pages/list-pages.port.js';
import type { IMovePage } from '../../src/ports/inbound/pages/move-page.port.js';
import type { IRestorePageVersion } from '../../src/ports/inbound/pages/restore-page-version.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IGetPublicationOptions } from '../../src/ports/inbound/publication/get-publication-options.port.js';
import type { IPublishCurrentPage } from '../../src/ports/inbound/publication/publish-current-page.port.js';
import type { IPublishRoutingRelease } from '../../src/ports/inbound/publication/publish-routing-release.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IChangePageUrl } from '../../src/ports/inbound/routing/change-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IPageRepository } from '../../src/ports/outbound/pages/page.repository.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';

describe('crawler documents through real composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplicationContext;
  let server: Server;
  let root = '';
  let port = 0;

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/crawler-'));
    app = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'owner', platformAdministrator: true },
      rendering: { sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts') },
    });
    const controller = new PublicDocumentController(app.get(RESOLVE_SITE), app.get(RESOLVE_PUBLISHED_PATH),
      app.get(RENDER_PUBLISHED_PAGE), app.get(GET_PUBLISHED_ARTIFACT));

    server = createServer((req, res) => {
      void controller.handle(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener');
    }
    port = address.port;
  });
  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await app?.close();

    if (connection) {
      if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
        throw new Error('Unsafe cleanup');
      }
      await connection.dropDatabase();
      await connection.close();
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  function get(path: string, method = 'GET', host = 'crawler.test'):
  Promise<{ status: number; body: string; type: string; noindex: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers: { Host: host } }, (res) => {
        let body = '';

        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => resolve({
          status: res.statusCode!,
          body,
          type: String(res.headers['content-type'] ?? ''),
          noindex: String(res.headers['x-robots-tag'] ?? ''),
        }));
      });

      req.on('error', reject);
      req.end();
    });
  }

  it('keeps readable system and home keys site-scoped and arbitrates concurrent duplicates', async () => {
    const first = await app.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'KeysOne', name: 'Keys one', primaryDomain: 'keys-one.test', languages: ['en'], defaultLanguage: 'en',
    });
    const second = await app.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'KeysTwo', name: 'Keys two', primaryDomain: 'keys-two.test', languages: ['en'], defaultLanguage: 'en',
    });

    for (const site of [first, second]) {
      const pages = await app.get<IListPages>(LIST_PAGES).execute({ siteId: site.siteId });

      expect(pages.map((page) => page.mark).sort()).toEqual(['llmsTxt', 'robotsTxt', 'sitemapXml']);
    }
    const create = app.get<ICreatePage>(CREATE_PAGE);
    const own = await create.execute({ siteId: first.siteId, language: 'en', mark: 'index', title: 'Home one' });
    const other = await create.execute({ siteId: second.siteId, language: 'en', mark: 'INDEX', title: 'Home two' });
    const repository = app.get<IPageRepository>(PAGE_REPOSITORY);

    expect((await repository.findByMark(first.siteId, 'INDEX'))?.pageId).toBe(own.pageId);
    expect((await repository.findByMark(second.siteId, 'index'))?.pageId).toBe(other.pageId);
    const races = await Promise.allSettled(['Duplicate', 'dUPLICATE'].map((mark) => create.execute({
      siteId: first.siteId, language: 'en', mark, title: 'Concurrent',
    })));

    expect(races.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(races.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await connection.db!.collection('pages').countDocuments({
      siteId: first.siteId, markKey: 'duplicate',
    })).toBe(1);
  });

  it('creates an empty site without inventing an origin or leaking another site map', async () => {
    await app.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'Unconfigured',
      name: 'Unconfigured',
      primaryDomain: 'empty.test',
      languages: ['en'],
      defaultLanguage: 'en',
    });

    expect((await get('/robots.txt', 'GET', 'empty.test')).body).not.toContain('Sitemap:');
    const map = await get('/sitemap.xml', 'GET', 'empty.test');

    expect(map.status).toBe(200);
    expect(map.body).toContain('urlset');
    expect(map.body).not.toContain('<loc>');
    const stylesheet = /<\?xml-stylesheet type="text\/css" href="([^"]+)"\?>/.exec(map.body)?.[1];

    expect(stylesheet).toBeDefined();
    const css = await get(stylesheet!, 'GET', 'empty.test');

    expect(css.status).toBe(200);
    expect(css.type).toContain('text/css');
    expect(css.body).toContain('XML Sitemap');
    expect((await get('/feed.json', 'GET', 'empty.test')).status).toBe(404);
  });

  it('creates public protected files, preserves raw MIME, and reconciles sitemap only on activation', async () => {
    const site = await app.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'Crawler',
      name: 'Crawler',
      primaryDomain: 'crawler.test',
      languages: ['en'],
      defaultLanguage: 'en',
      onboarding: { localAddress: 'http://localhost:31989', originMode: SiteOriginMode.Public },
    });
    const pages = await app.get<IListPages>(LIST_PAGES).execute({ siteId: site.siteId });
    const robots = pages.find((page) => page.systemDocument === SystemDocument.Robots)!;
    const sitemap = pages.find((page) => page.systemDocument === SystemDocument.Sitemap)!;

    expect(pages.map((page) => page.sortOrder)).toEqual([100, 200, 300]);
    expect(await get('/llms.txt')).toMatchObject({ status: 200, body: '', type: 'text/plain; charset=utf-8' });
    expect((await get('/robots.txt')).body).toContain('Sitemap: https://crawler.test/sitemap.xml');
    expect((await get('/sitemap.xml')).body).not.toContain('<url>');
    expect((await get('/')).status).toBe(404);

    const page = await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: site.siteId,
      mark: 'Feed',
      language: 'en',
      title: 'Raw feed',
      mimeType: 'application/vnd.test+json',
      contentMd: '{"literal":"[[*title]]"}',
    });

    expect(page.sortOrder).toBe(400);
    const publish = app.get<IPublishCurrentPage>(PUBLISH_CURRENT_PAGE);
    const update = app.get<IUpdatePage>(UPDATE_PAGE);

    await publish.execute({ siteId: site.siteId, pageId: page.pageId, actorId: 'owner', path: '/feed.json' });
    expect(await get('/feed.json')).toMatchObject({
      status: 200, type: 'application/vnd.test+json', body: '{"literal":"[[*title]]"}',
    });
    expect((await get('/sitemap.xml')).body).toContain('https://crawler.test/feed.json');
    await update.execute({
      siteId: site.siteId,
      pageId: robots.pageId,
      contentMd: 'User-agent: SpecialBot\nDisallow: /feed.json\n',
    });
    expect((await get('/sitemap.xml')).body).toContain('/feed.json');
    await publish.execute({ siteId: site.siteId, pageId: robots.pageId, actorId: 'owner' });
    expect((await get('/sitemap.xml')).body).not.toContain('/feed.json');
    const options = await app.get<IGetPublicationOptions>(GET_PUBLICATION_OPTIONS)
      .execute({ siteId: site.siteId, pageId: page.pageId });

    expect(options.crawlerDiagnostics?.[0]).toMatchObject({
      inSitemap: false, reason: 'Robots', blockedBy: [{ agent: 'SpecialBot' }],
    });
    await update.execute({ siteId: site.siteId, pageId: robots.pageId, contentMd: 'User-agent: *\nDisallow:\n' });
    await publish.execute({ siteId: site.siteId, pageId: robots.pageId, actorId: 'owner' });
    expect((await get('/sitemap.xml')).body).toContain('/feed.json');
    await update.execute({ siteId: site.siteId, pageId: page.pageId, robotsIndex: false });
    await publish.execute({ siteId: site.siteId, pageId: page.pageId, actorId: 'owner' });
    expect(await get('/feed.json', 'HEAD')).toMatchObject({ status: 200, body: '', noindex: 'noindex' });
    expect((await get('/robots.txt')).body).toBe('User-agent: *\nDisallow:\n');
    expect((await get('/sitemap.xml')).body).not.toContain('/feed.json');
    await update.execute({
      siteId: site.siteId, pageId: page.pageId, mimeType: 'text/plain', robotsIndex: true, excludeFromSitemap: true,
    });
    await publish.execute({ siteId: site.siteId, pageId: page.pageId, actorId: 'owner' });
    expect((await get('/feed.json')).type).toBe('text/plain; charset=utf-8');
    expect((await get('/sitemap.xml')).body).not.toContain('/feed.json');
    const restored = await app.get<IRestorePageVersion>(RESTORE_PAGE_VERSION).execute({
      siteId: site.siteId, pageId: page.pageId, version: 2,
    });

    expect(restored.toState()).toMatchObject({
      mimeType: 'application/vnd.test+json', robotsIndex: false, excludeFromSitemap: false,
    });
    expect((await get('/feed.json')).type).toBe('text/plain; charset=utf-8');
    await update.execute({ siteId: site.siteId, pageId: page.pageId, robotsIndex: true });
    await publish.execute({ siteId: site.siteId, pageId: page.pageId, actorId: 'owner' });
    await app.get<IChangePageUrl>(CHANGE_PAGE_URL).execute({
      siteId: site.siteId,
      pageId: page.pageId,
      mark: 'MovedFeed',
      parentUrlId: null,
      segment: 'moved.json',
      path: '/moved.json',
      redirectStatus: UrlRedirectStatus.HTTP_301,
    });
    await app.get<IPublishRoutingRelease>(PUBLISH_ROUTING_RELEASE).execute({ siteId: site.siteId, actorId: 'owner' });
    expect(await get('/moved.json')).toMatchObject({
      status: 200, type: 'application/vnd.test+json', body: '{"literal":"[[*title]]"}',
    });
    expect((await get('/feed.json')).status).toBe(301);
    expect((await get('/sitemap.xml')).body).toContain('/moved.json');
    expect((await get('/sitemap.xml')).body).not.toContain('/feed.json');
    expect((await get('/robots.txt')).body).toBe('User-agent: *\nDisallow:\n');

    const active = await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site.siteId);

    await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site.siteId, actorId: 'owner', expectedActiveReleaseId: active!.releaseId,
    });
    expect(await get('/moved.json')).toMatchObject({
      status: 200, type: 'application/vnd.test+json', body: '{"literal":"[[*title]]"}',
    });
    expect((await get('/sitemap.xml')).body).toContain('/moved.json');

    await expect(update.execute({ siteId: site.siteId, pageId: sitemap.pageId, contentMd: 'edited' }))
      .rejects.toThrow('read-only');
    await expect(app.get<IMovePage>(MOVE_PAGE).execute({
      siteId: site.siteId,
      pageId: robots.pageId,
      parentPageId: page.pageId,
      expectedParentPageId: null,
      expectedSortOrder: 200,
    })).rejects.toThrow('site root');
  });
});
