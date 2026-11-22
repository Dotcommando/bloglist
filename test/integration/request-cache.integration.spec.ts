import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { SiteDumpType } from '../../src/domain/dumps/site-dump.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import { SITE_DUMP_STORE } from '../../src/infra/dumps/dumps.tokens.js';
import { HookWorkerLifecycle } from '../../src/infra/hooks/hook-worker.lifecycle.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION, REQUEST_DOCUMENT_CACHE_STORAGE,
} from '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { ISiteDumpStore } from '../../src/ports/outbound/dumps/site-dump-store.port.js';
import type { ISnippet } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import type { IRequestDocumentCachePort } from '../../src/ports/outbound/publication/request-document-cache.port.js';
import { siteInput } from '../support/sites.js';

it('serves explicit Request cache hits, misses and bypasses through HTTP', async () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const connection = await createConnection(mongoUri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();
  const root = await mkdtemp(path.resolve('.tmp/request-cache-'));
  const dropTestDatabase = async (): Promise<void> => {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe test database');
    }
    await connection.dropDatabase();
  };
  let local: INestApplicationContext | undefined;
  let http: INestApplication<Server> | undefined;
  let reads = 0;
  let unavailable = false;
  let fallback = false;
  const loaders: ISnippet[] = [{
    id: 'PublicRead',
    cache: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 60000 },
    phases: [LoaderPhase.Request],
    parameters: [],
    output: { name: 'value', kind: ParameterKind.String, required: true },
    read: async (_input, context) => {
      reads++;

      if (unavailable) {
        throw new Error('unavailable');
      }
      if (fallback) {
        context.onUncacheable?.();
      }

      return 'read:' + reads;
    },
  }];

  try {
    await applyMigrations(connection, 'migrations');
    const rendering = { sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts'), loaders };
    const media = { root: path.join(root, 'media'), publicBaseUrl: '/media' };
    const dumpsRoot = path.join(root, 'dumps');

    local = await createLocalApplication({
      mongoUri,
      database,
      rendering,
      media,
      dumpsRoot,
      operator: { operatorId: 'cache-test', platformAdministrator: true },
    });
    await local.get(HookWorkerLifecycle).onApplicationShutdown();
    const site = await local.get<ICreateSite>(CREATE_SITE).execute(siteInput());
    const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: site.siteId, mark: 'CachePage', language: 'en', title: 'Cache page',
    });
    const edited = await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId: site.siteId,
      kind: TemplateSourceKind.Snippet,
      name: 'Edited public read',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: [],
      snippet: {
        code: 'return "public";',
        cache: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 60000 },
        phases: [LoaderPhase.Request],
        output: { name: 'value', kind: ParameterKind.String, required: true },
      },
    });
    const template = await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId: site.siteId,
      kind: TemplateSourceKind.Template,
      name: 'Cache template',
      css: '',
      browserTypeScript: null,
      parameters: [],
      html: '<html><head></head><body>[[!PublicRead? &as=`value`]]<p>[[+value]]</p>'
        + `[[!${edited.key}? &as=\`edited\`]]<span>[[+edited]]</span></body></html>`,
    });

    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId: site.siteId,
      pageId: page.pageId,
      actorId: 'cache-test',
      rendering: {
        templateId: template.key,
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
        requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 },
      },
    });
    await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId: site.siteId,
      pageId: page.pageId,
      mark: 'CacheUrl',
      parentUrlId: null,
      segment: 'cache',
      path: '/cache/',
    });
    await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
    const active = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site.siteId);

    await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site.siteId, actorId: 'cache-test', expectedActiveReleaseId: active?.releaseId ?? null,
    });
    http = await createPublicHttpApplication({
      mongoUri,
      database,
      ...rendering,
      media,
      dumpsRoot,
      host: '127.0.0.1',
      port: 0,
      adminAuth: { origin: 'http://localhost:31999' },
    });
    await http.get(HookWorkerLifecycle).onApplicationShutdown();
    const address = http.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing listener');
    }

    const get = (method = 'GET', accept = 'text/html', cookie?: string, query = '', authorization?: string): Promise<{
      status: number;
      body: string;
      cache: string | undefined;
      policy: string | undefined;
      csp: string | undefined;
      length: string | undefined;
    }> => new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: address.port,
        path: '/cache/' + query,
        method,
        headers: {
          Host: 'example.test',
          Accept: accept,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(authorization ? { Authorization: authorization } : {}),
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        const header = (name: string): string | undefined => {
          const value = response.headers[name];

          return typeof value === 'string' ? value : undefined;
        };

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
          cache: header('x-zarya-cache'),
          policy: header('cache-control'),
          csp: header('content-security-policy'),
          length: header('content-length'),
        }));
      });

      outgoing.on('error', reject);
      outgoing.end();
    });
    const adminCookie = 'zarya_admin_session=test; zarya_admin_site=site; zarya_admin_ui_session=test';
    const first = await get('GET', 'text/html', adminCookie);

    expect(first).toMatchObject({
      status: 200, cache: 'miss', policy: 'no-store', body: expect.stringContaining('read:1'),
    });
    const hit = await get();

    expect(hit).toEqual({ ...first, cache: 'hit' });
    expect(await get('HEAD', 'text/html', adminCookie)).toEqual({ ...first, cache: 'hit', body: '' });
    expect(await get('GET', 'text/markdown', adminCookie)).toMatchObject({
      status: 200, cache: 'miss', body: expect.stringContaining('read:2'),
    });
    expect(await get('GET', 'text/markdown')).toMatchObject({ cache: 'hit', body: expect.stringContaining('read:2') });

    for (const cookie of [adminCookie, 'analytics=visitor; language=ru', 'future_cookie=value', 'session=private']) {
      expect(await get('GET', 'text/html', cookie)).toEqual({ ...first, cache: 'hit' });
    }
    expect(reads).toBe(2);
    expect(await get('GET', 'text/html', adminCookie, '', 'Bearer test')).toMatchObject({
      status: 200, cache: 'bypass', body: expect.stringContaining('read:3'),
    });
    expect(await get('GET', 'text/html', undefined, '?unknown=1')).toMatchObject({ status: 200, cache: 'hit' });

    for (const source of ['telegram', 'newsletter', 'future-platform']) {
      const tracked = await get('GET', 'text/html', undefined, '?utm_source=' + source);

      expect(tracked).toEqual({ ...first, cache: 'hit' });
    }
    expect(await get('GET', 'text/html', undefined, '?unknown=1&unknown=2'))
      .toMatchObject({ status: 200, cache: 'hit' });
    const cache = http.get<IRequestDocumentCachePort>(REQUEST_DOCUMENT_CACHE_STORAGE);
    const dumpStore = http.get<ISiteDumpStore>(SITE_DUMP_STORE);
    const mediaDirectory = path.join(media.root, site.primaryDomain);

    await mkdir(mediaDirectory, { recursive: true });
    await writeFile(path.join(mediaDirectory, 'synthetic.bin'), Buffer.alloc(2 * 1024 * 1024, 7));

    for (const options of [undefined, { type: SiteDumpType.Files }]) {
      let completed = false;
      const capture = Promise.allSettled([dumpStore.create(site.siteId, options)]).then((outcomes) => {
        completed = true;

        return outcomes;
      });

      do {
        expect((await get()).status).toBe(200);
      } while (!completed);

      expect((await capture)[0]).toMatchObject({ status: 'fulfilled' });
    }

    cache.purge(site.siteId);
    unavailable = true;
    expect((await get()).status).toBe(503);
    unavailable = false;
    fallback = true;
    expect((await get('GET', 'text/html', adminCookie)).cache).toBe('bypass');
    expect((await get('GET', 'text/html', adminCookie)).cache).toBe('bypass');
    fallback = false;
    expect((await get()).cache).toBe('miss');
    expect((await get()).cache).toBe('hit');
    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId: site.siteId,
      pageId: page.pageId,
      actorId: 'cache-test',
      rendering: {
        templateId: template.key,
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
        requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 21000 },
      },
    });
    await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
    const beforeRefreshRelease = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site.siteId);

    await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site.siteId, actorId: 'cache-test', expectedActiveReleaseId: beforeRefreshRelease?.releaseId ?? null,
    });
    const beforeRefresh = reads;

    expect(await get()).toMatchObject({
      status: 200,
      cache: 'miss',
      body: expect.stringContaining('read:' + (beforeRefresh + 1)),
    });
    await vi.waitFor(() => expect(reads).toBe(beforeRefresh + 2), { timeout: 6000, interval: 25 });
    await vi.waitFor(async () => {
      expect(await get()).toMatchObject({
        status: 200,
        cache: 'hit',
        body: expect.stringContaining('read:' + (beforeRefresh + 2)),
      });
    }, { timeout: 3000, interval: 25 });
    await verifyMigrations(connection, 'migrations');
  } finally {
    await http?.close();
    await local?.close();

    await dropTestDatabase();
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
});
