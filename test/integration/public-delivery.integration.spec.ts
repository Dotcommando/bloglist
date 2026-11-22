import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { type IncomingHttpHeaders, request as httpRequest, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { Page } from '../../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { PublishedVersionPosition } from '../../src/domain/pages/published-page-version.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { LIST_PAGES } from '../../src/infra/pages/pages.tokens.js';
import { GET_PAGE, RESTORE_PAGE_VERSION, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import {
  PAGE_PUBLICATIONS, PREVIEW_MARKDOWN_DRAFT, PREVIEW_MARKDOWN_PUBLISHED, RELEASE_ACTIVATION,
} from '../../src/infra/publication/publication.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING,
  PUBLISH_PAGE,
  PUBLISH_SITE_RELEASE,
  RENDER_PUBLISHED_PAGE,
} from '../../src/infra/publication/publication.tokens.js';
import { GET_PUBLISHED_ARTIFACT, PUBLICATION_STORE } from '../../src/infra/publication/publication.tokens.js';
import { FRONTEND_BUILD } from '../../src/infra/publication/publication.tokens.js';
import {
  CREATE_RENDERING_ELEMENT, GET_RENDERING_ELEMENT, UPDATE_RENDERING_ELEMENT,
} from '../../src/infra/rendering/rendering.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CHANGE_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import { LIST_SITES } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IListPages } from '../../src/ports/inbound/pages/list-pages.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IRestorePageVersion } from '../../src/ports/inbound/pages/restore-page-version.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IGetPublishedArtifact } from '../../src/ports/inbound/publication/get-published-artifact.port.js';
import type { IPreviewMarkdownDraft } from '../../src/ports/inbound/publication/preview-markdown-draft.port.js';
import type { IPreviewMarkdownPublished } from '../../src/ports/inbound/publication/preview-markdown-published.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IRenderPublishedPage } from '../../src/ports/inbound/publication/render-published-page.port.js';
import type {
  ICreateRenderingElement, IGetRenderingElement, IUpdateRenderingElement,
} from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../../src/ports/inbound/routing/change-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IListSites } from '../../src/ports/inbound/sites/list-sites.port.js';
import type { IPagePublicationPort } from '../../src/ports/outbound/pages/page-publication.port.js';
import type { IDataLoader } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IFrontendBuildPort } from '../../src/ports/outbound/publication/frontend-build.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';

describe('published delivery through real composition', () => {
  const database = `zarya_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Connection;
  let app: INestApplicationContext;
  let http: INestApplication<Server>;
  let port = 0;
  let staticPageId = '';
  let root = '';
  let siteId = '';
  let pageId = '';
  let releaseId = '';
  let buildReads = 0;
  let requestReads = 0;
  let settings: Parameters<typeof createLocalApplication>[0];
  const loaders: readonly IDataLoader[] = [
    {
      id: 'BuildValue',
      parameters: [],
      output: { name: 'value', kind: ParameterKind.String, required: true },
      phases: [LoaderPhase.Build],
      read: async () => {
        buildReads++;

        return 'Frozen';
      },
    },
    {
      id: 'CurrentValue',
      parameters: [{ name: 'date', kind: ParameterKind.String, required: true }],
      output: { name: 'value', kind: ParameterKind.String, required: true },
      phases: [LoaderPhase.Request],
      read: async (input) => {
        requestReads++;

        if (input.date === 'fail') {
          throw new Error('Private dependency diagnostic');
        }

        return `Live ${input.date}`;
      },
    },
  ];

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit test MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/public-http-'));
    const sourcesRoot = path.join(root, 'sites');

    await mkdir(path.join(sourcesRoot, 'demo/templates/Live'), { recursive: true });
    settings = {
      mongoUri,
      database,
      operator: { operatorId: 'owner', platformAdministrator: true },
      rendering: { sourcesRoot, artifactsRoot: path.join(root, 'artifacts'), loaders },
    };
    app = await createLocalApplication(settings);
    siteId = (await app.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'Delivery',
      name: 'Delivery',
      primaryDomain: 'delivery.test',
      languages: ['en'],
      defaultLanguage: 'en',
    })).siteId;
    await writeFile(path.join(sourcesRoot, 'demo/site.config.ts'), `export default ${JSON.stringify({
      siteId,
      requestParameters: [{ name: 'date', kind: 'String', required: true }],
    })}`);
    await writeFile(path.join(sourcesRoot, 'demo/templates/Live/index.html'),
      '<html><head><title>[[*title]]</title></head><body>[[BuildValue? &as=`built`]]'
      + '[[!CurrentValue? &date=`[[+request.date]]` &as=`live`]]'
      + '[[$Live_label? &value=`[[+built]][[+live]]`]]</body></html>',
    );
    await app.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId,
      kind: TemplateSourceKind.Chunk,
      name: 'Live label',
      html: '<p>[[+value]]</p>',
      css: '',
      browserTypeScript: null,
      parameters: [{ name: 'value', kind: ParameterKind.String, required: true }],
    });
    await writeFile(path.join(sourcesRoot, 'demo/styles.css'), 'body{margin:0;color:navy}');
    await mkdir(path.join(sourcesRoot, 'demo/templates/Static'), { recursive: true });
    await writeFile(path.join(sourcesRoot, 'demo/templates/Static/index.html'),
      '<html><head><title>[[*title]]</title></head>'
      + '<body><button id="toggle">Ready</button></body></html>');
    await writeFile(path.join(sourcesRoot, 'demo/templates/Static/client.ts'),
      'document.querySelector("#toggle")?.addEventListener("click",(event)=>{'
      + 'if(event.currentTarget instanceof HTMLElement){event.currentTarget.textContent="Clicked"}})');
    await mkdir(path.join(sourcesRoot, 'demo/pages/Static'), { recursive: true });
    await writeFile(path.join(sourcesRoot, 'demo/pages/Static/styles.css'),
      '#toggle{width:80px;background-color:gold}');
    staticPageId = (await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId,
      mark: 'Static',
      title: 'Static page',
      language: 'en',
    })).pageId;
    await app.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      actorId: 'owner',
      pageId: staticPageId,
      rendering: {
        templateId: 'Static',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId: staticPageId });
    await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId,
      pageId: staticPageId,
      mark: 'OldStatic',
      path: '/old/',
      segment: 'old',
      parentUrlId: null,
    });
    await app.get<IChangePageUrl>(CHANGE_PAGE_URL).execute({
      siteId,
      pageId: staticPageId,
      mark: 'StaticUrl',
      path: '/static/',
      segment: 'static',
      parentUrlId: null,
      redirectStatus: UrlRedirectStatus.HTTP_308,
    });
    await vi.waitFor(async () => {
      pageId = (await app.get<ICreatePage>(CREATE_PAGE).execute({
        siteId,
        mark: 'Live',
        title: 'Live page',
        language: 'en',
      })).pageId;
    }, { timeout: 5000, interval: 100 });
    await app.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      actorId: 'owner',
      pageId,
      rendering: {
        templateId: 'Live',
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId });
    await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId,
      pageId,
      mark: 'LiveUrl',
      path: '/',
      segment: 'home',
      parentUrlId: null,
    });
    const frontend = app.get<IFrontendBuildPort>(FRONTEND_BUILD);
    const build = frontend.build.bind(frontend);
    const legacy = vi.spyOn(frontend, 'build').mockImplementationOnce((input) =>
      build({ ...input, assetBasePath: '/assets/' }));

    releaseId = (await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId,
      actorId: 'owner',
      expectedActiveReleaseId: (await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION)
        .getActive(siteId))?.releaseId ?? null,
    })).releaseId;
    legacy.mockRestore();
    await app.close();
    app = await createLocalApplication(settings);
    http = await createPublicHttpApplication({
      mongoUri,
      database,
      artifactsRoot: settings.rendering!.artifactsRoot,
      host: '127.0.0.1',
      port: 0,
      loaders,
    });
    const address = http.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected public TCP listener');
    }
    port = address.port;
  });
  afterAll(async () => {
    await http?.close();
    await app?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[0-9a-f]{32}$/.test(database)) {
          throw new Error('Unsafe cleanup');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
    if (root && (await realpath(root)).startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('renders current Request data from persisted plans without reexecuting Build reads after restart', async () => {
    const before = buildReads;
    const operation = app.get<IRenderPublishedPage>(RENDER_PUBLISHED_PAGE);
    const current = await app.get<IGetRenderingElement>(GET_RENDERING_ELEMENT).execute({
      siteId, kind: TemplateSourceKind.Chunk, key: '1',
    });
    const changed = await app.get<IUpdateRenderingElement>(UPDATE_RENDERING_ELEMENT).execute({
      ...current, name: 'Changed draft name', expectedVersion: current.version,
    });

    try {
      for (const date of ['2026-10-25', '2026-10-26']) {
        const result = await operation.execute({ siteId, releaseId, renderPlanId: pageId, requestValues: { date } });

        expect(result.html).toContain(`FrozenLive ${date}`);
        expect(result.html).toContain('common.reflow.');
      }
    } finally {
      await app.get<IUpdateRenderingElement>(UPDATE_RENDERING_ELEMENT).execute({
        ...current, expectedVersion: changed.version,
      });
    }
    expect(buildReads).toBe(before);
    expect(requestReads).toBe(2);
    await expect(operation.execute({
      siteId: 'foreign',
      releaseId,
      renderPlanId:
pageId,
    })).rejects.toMatchObject({ code: 'NotFound' });
  });
  it('reads declared public bytes while plans, manifests and foreign-site artifacts remain private', async () => {
    const release = (await app.get<IPublicationStorePort>(PUBLICATION_STORE).read(siteId, releaseId))!;
    const path = release.manifest!.artifacts.find((file) => file.public && file.mimeType === 'text/css')!.path;
    const read = app.get<IGetPublishedArtifact>(GET_PUBLISHED_ARTIFACT);
    const file = await read.execute({ siteId, releaseId, path });

    expect(file?.metadata.public).toBe(true);
    expect(file?.content.byteSize).toBeGreaterThan(0);
    expect(await read.execute({ siteId, releaseId, path: `plans/${pageId}.json` })).toBeNull();
    expect(await read.execute({ siteId, releaseId, path: 'manifest.json' })).toBeNull();
    expect(await read.execute({ siteId: 'foreign', releaseId, path })).toBeNull();
    expect((await read.execute({ siteId, releaseId: null, path }))?.releaseId).toBe(releaseId);
  });
  it('previews saved and published Markdown through real composition', async () => {
    const draft = await app.get<IPreviewMarkdownDraft>(PREVIEW_MARKDOWN_DRAFT).execute({
      siteId, pageId: staticPageId, actorId: 'owner',
    });
    const published = await app.get<IPreviewMarkdownPublished>(PREVIEW_MARKDOWN_PUBLISHED).execute({
      siteId, pageId: staticPageId, actorId: 'owner',
    });

    expect(draft.markdown).toContain('Ready');
    expect(published.markdown).toBe(draft.markdown);
  });

  it('lists managed sites through the real local administrative boundary', async () => {
    const sites = await app.get<IListSites>(LIST_SITES).execute();

    expect(sites.map((site) => site.siteId)).toContain(siteId);
    expect(sites).toHaveLength(1);
  });
  it('lists all owned pages and applies persisted filters without mixing site data', async () => {
    const operation = app.get<IListPages>(LIST_PAGES);
    const owned = await operation.execute({ siteId });

    expect(owned.every((page) => page.siteId === siteId)).toBe(true);
    expect(new Set(owned.filter((page) => !page.toState().systemDocument).map((page) => page.pageId))).toEqual(
      new Set([pageId, staticPageId]));
    expect(await operation.execute({ siteId, filter: { status: PageStatus.DRAFT } })).toEqual([]);
    expect((await operation.execute({
      siteId,
      filter: {
        status: PageStatus.PUBLISHED,
        language: 'EN',
      },
    })).filter((page) => !page.toState().systemDocument)).toHaveLength(2);
    expect(await operation.execute({ siteId: 'foreign' })).toEqual([]);
  });
  it('restores all three positions into the same draft without publication or history changes', async () => {
    for (const title of ['Second', 'Third']) {
      await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title });
      await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId });
    }
    const publications = app.get<IPagePublicationPort>(PAGE_PUBLICATIONS);
    const versions = await publications.versions(siteId, pageId);

    await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title: 'Working draft' });

    for (const [version, title] of [[PublishedVersionPosition.Previous, 'Second'],
      [PublishedVersionPosition.Latest, 'Third'], [PublishedVersionPosition.Oldest,
        'Live page']] satisfies readonly (readonly [PublishedVersionPosition, string])[]) {
      const draft = await app.get<IRestorePageVersion>(RESTORE_PAGE_VERSION).execute({ siteId, pageId, version });

      expect(draft.title).toBe(title);
      expect(draft.status).toBe(PageStatus.DRAFT);
      expect(draft.toState().rendering?.delivery).toBe(HtmlDelivery.Request);
      expect(draft.publishedAt).toEqual(versions[0]?.publishedAt);
    }
    expect(await publications.versions(siteId, pageId)).toEqual(versions);
    expect((await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId))?.releaseId).toBe(releaseId);
  });
  it('rolls back the tentative draft when a selected publication has moved or been pruned', async () => {
    const publications = app.get<IPagePublicationPort>(PAGE_PUBLICATIONS);
    const selected = (await publications.versions(siteId, pageId))[2]!;

    await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title: 'Fourth' });
    await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId });
    const current = (await app.get<IGetPage>(GET_PAGE).execute({ siteId, pageId }))!;
    const draft = new Page(current.toState());

    draft.restorePublishedContent(selected);
    await expect(publications.restore(current.toState(), selected, PublishedVersionPosition.Oldest, draft, new Date()))
      .rejects.toThrow();
    expect((await app.get<IGetPage>(GET_PAGE).execute({ siteId, pageId }))!.toState()).toEqual(current.toState());
    expect((await publications.versions(siteId, pageId)).map((page) => page.title)).toEqual([
      'Fourth', 'Third', 'Second']);
  });
  async function get(target: string, method = 'GET', headers: Record<string, string> = {}):
  Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const request = httpRequest({
        hostname: '127.0.0.1',
        port,
        path: target,
        method,
        headers: { Host: 'delivery.test', ...headers },
      }, (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.once('end', () => resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
        response.once('error', reject);
      });

      request.once('error', reject);
      request.end();
    });
  }
  it('records static and dynamic page resolution after real HTTP completion', async () => {
    expect((await get('/static/')).status).toBe(200);
    expect((await get('/?date=2026-10-25')).status).toBe(200);
    await vi.waitFor(async () => {
      expect(await connection.collection('page_resolutions').countDocuments({ siteId })).toBe(2);
    });
    const records = await connection.collection('page_resolutions').find({ siteId }).toArray();

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/static/', delivery: 'Static', cmsVersion: '0.10.1', outcome: 'Success' }),
      expect.objectContaining({ path: '/', delivery: 'Dynamic', cmsVersion: '0.10.1', outcome: 'Success' }),
    ]));

    for (const record of records) {
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
      expect(record.completionMs).toBeGreaterThanOrEqual(record.durationMs);
    }
    const dynamic = records.find((record) => record.delivery === 'Dynamic');

    expect(dynamic?.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'activation', outcome: 'Success' }),
      expect.objectContaining({ stage: 'plan', outcome: 'Success' }),
      expect.objectContaining({ stage: 'runtime', outcome: 'Success' }),
      expect.objectContaining({ stage: 'snippet', outcome: 'Success' }),
      expect.objectContaining({ stage: 'assets', outcome: 'Success' }),
    ]));
    expect(JSON.stringify(records)).not.toContain('2026-10-25');
  });

  it('rejects excessive public query resources before rendering without truncation', async () => {
    const before = requestReads;

    for (const query of [
      'future=' + 'x'.repeat(12282),
      Array.from({ length: 129 }, (_, index) => 'key' + index + '=value').join('&'),
      encodeURIComponent('я'.repeat(129)) + '=value',
    ]) {
      const response = await get('/?' + query);

      expect(response.status).toBe(414);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(requestReads).toBe(before);
    }
    expect((await get('/?date=2026-10-25&future=' + 'x'.repeat(12265))).status).toBe(200);
  });

  it('opens social referral URLs without passing campaign metadata into Request inputs', async () => {
    const campaign = '&utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=click&igsh=share';
    const clean = await get('/?date=2026-10-25');
    const linked = await get('/?date=2026-10-25' + campaign);

    expect(linked.status).toBe(200);
    expect(linked.body).toBe(clean.body);
    expect(linked.body).not.toContain('link_in_bio');
    expect(linked.headers['cache-control']).toBe('no-store');
    const head = await get('/?date=2026-10-25' + campaign, 'HEAD');

    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    const markdown = await get('/?date=2026-10-25' + campaign, 'GET', { Accept: 'text/markdown' });

    expect(markdown.status).toBe(200);
    expect(markdown.body).toContain('FrozenLive 2026-10-25');
    expect((await get('/static/?utm_source=ig&fbclid=click')).status).toBe(200);
    expect((await get('/?utm_source=ig&fbclid=click')).status).toBe(400);
    expect((await get('/?date=2026-10-25&unknown=value&future_partner=new&gtm_new_campaign=ok')).status).toBe(200);
    expect((await get('/?date=2026-10-25&fbclid=a&fbclid=b')).status).toBe(200);
    expect((await get('/?date=2026-10-25&%5F%5Fproto%5F%5F=x&fbclid=click')).status).toBe(200);
  });

  it('serves GET/HEAD, redirects and ETags through a public-only composition with typed request values', async () => {
    expect(() => http.get(LIST_SITES)).toThrow();
    expect(() => http.get(RESTORE_PAGE_VERSION)).toThrow();
    const live = await get('/?date=2026-10-25');

    expect(live.status).toBe(200);
    expect(live.body).toContain('FrozenLive 2026-10-25');
    expect(live.headers['cache-control']).toBe('no-store');
    expect((await get('/?date=2026-10-25', 'HEAD')).body).toBe('');
    expect((await get('/')).status).toBe(400);
    expect((await get('/?date=a&date=b')).status).toBe(400);
    const foreignSelector = await get('/?date=a&siteId=foreign');

    expect(foreignSelector.status).toBe(200);
    expect(foreignSelector.body).toContain('FrozenLive a');
    const escaped = await get('/?date=' + encodeURIComponent('<img src=x onerror=alert(1)>'));

    expect(escaped.status).toBe(200);
    expect(escaped.body).not.toContain('<img');
    expect(escaped.body).toContain('&lt;img');
    const failed = await get('/?date=fail');

    expect(failed.status).toBe(503);
    expect(failed.body).not.toContain('Private');
    const redirect = await get('/old/', 'HEAD');

    expect(redirect.status).toBe(308);
    expect(redirect.headers.location).toBe('/static/');
    const document = await get('/static/');

    expect(document.status).toBe(200);
    const head = await get('/static/', 'HEAD');

    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(document.headers['content-length']);
    expect((await get('/static/', 'GET', { 'If-None-Match': document.headers.etag! })).status).toBe(304);
    const markdown = await get('/static/', 'GET', { Accept: 'text/markdown' });

    expect(markdown.status).toBe(200);
    expect(markdown.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(markdown.headers.vary).toContain('Accept');
    expect(markdown.headers.etag).not.toBe(document.headers.etag);
    expect((await get('/static/', 'GET', {
      Accept: 'text/markdown', 'If-None-Match': markdown.headers.etag!,
    })).status).toBe(304);
    expect((await get('/static/', 'HEAD', { Accept: 'text/markdown' })).body).toBe('');
    const liveMarkdown = await get('/?date=2026-10-25', 'GET', { Accept: 'text/markdown' });

    expect(liveMarkdown.status).toBe(200);
    expect(liveMarkdown.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(liveMarkdown.headers['cache-control']).toBe('no-store');
    expect(liveMarkdown.body).toContain('FrozenLive 2026-10-25');
    expect((await get('/static/', 'POST')).status).toBe(405);

    for (const target of ['/api/sites', '/admin', '/manifest.json', `/plans/${pageId}.json`, '/assets/%2e%2e/private']) {
      expect((await get(target)).status).toBeGreaterThanOrEqual(400);
    }
    expect((await get('/static/', 'GET', {
      Host: 'unknown.test',
      'X-Forwarded-Host': 'delivery.test',
    })).status).toBe(404);
  });
  it('runs production browser JS and CSS, retaining old resources across an atomic release switch', async () => {
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit browser executable required');
    }

    const oldDocument = await get('/static/');
    const oldCss = /href="([^"]+common\.repaint\.[^"]+)"/.exec(oldDocument.body)?.[1];

    expect(oldCss).toBeTruthy();
    const previousAsset = await get(oldCss!);

    expect(previousAsset.status).toBe(200);
    const buildBefore = buildReads;
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--host-resolver-rules=MAP delivery.test 127.0.0.1', '--no-proxy-server'],
    });

    try {
      const page = await browser.newPage();
      const failures: string[] = [];

      page.on('pageerror', (error) => {
        failures.push(error.message);
      });
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
          failures.push(message.text());
        }
      });
      const calls: string[] = [];

      page.on('request', (request) => {
        calls.push(request.url());
      });
      await page.goto(`http://delivery.test:${port}/static/`);
      await page.locator('#toggle').click();
      await expect.poll(() => page.locator('#toggle').textContent()).toBe('Clicked');
      expect(await page.locator('body').evaluate((element) => getComputedStyle(element).color)).toBe('rgb(0, 0, 128)');
      expect(await page.locator('#toggle').evaluate((element) => getComputedStyle(element).width)).toBe('80px');
      expect(await page.locator('#toggle').evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe('rgb(255, 215, 0)');
      expect(calls.some((url) => url.includes('/api/'))).toBe(false);
      await writeFile(path.join(settings.rendering!.sourcesRoot, 'demo/styles.css'), 'body{margin:0;color:green}');
      const next = await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
        siteId,
        actorId: 'owner',
        expectedActiveReleaseId: releaseId,
      });

      expect((await get(oldCss!)).body).toBe(previousAsset.body);
      expect((await get(`/assets/releases/${releaseId}/${oldCss!.slice('/assets/'.length)}`)).body).toBe(previousAsset.body);
      await page.reload();
      expect(await page.locator('body').evaluate((element) => getComputedStyle(element).color)).toBe('rgb(0, 128, 0)');
      expect((await get('/static/')).body).toContain(`/assets/releases/${next.releaseId}/`);
      expect(failures.filter((message) => !message.includes('favicon.ico'))).toEqual([]);
      expect(buildReads).toBe(buildBefore + 1);
    } finally {
      await browser.close();
    }
  });
  it('isolates identical page paths and release resources by the registered HTTP hostname', async () => {
    const other = await app.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'OtherSite',
      name: 'Other site',
      primaryDomain: 'other.test',
      languages: ['en'],
      defaultLanguage: 'en',
    });
    const directory = path.join(settings.rendering!.sourcesRoot, 'other');

    await mkdir(path.join(directory, 'templates/Other'), { recursive: true });
    await writeFile(path.join(directory, 'site.config.ts'), `export default ${JSON.stringify({ siteId: other.siteId })}`);
    await writeFile(path.join(directory, 'templates/Other/index.html'),
      '<html><head><title>Other</title></head><body>Other site only</body></html>');
    const otherPage = await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: other.siteId,
      mark: 'OtherPage',
      title: 'Other page',
      language: 'en',
    });

    await app.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId: other.siteId,
      actorId: 'owner',
      pageId: otherPage.pageId,
      rendering: {
        templateId: 'Other',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: other.siteId, pageId: otherPage.pageId });
    await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId: other.siteId,
      pageId: otherPage.pageId,
      mark: 'OtherUrl',
      path: '/static/',
      segment: 'static',
      parentUrlId: null,
    });
    await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: other.siteId,
      actorId: 'owner',
      expectedActiveReleaseId: (await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION)
        .getActive(other.siteId))?.releaseId ?? null,
    });
    const response = await get('/static/', 'GET', { Host: 'other.test' });

    expect(response.status).toBe(200);
    expect(response.body).toContain('Other site only');
    expect((await get('/static/')).body).not.toContain('Other site only');
    const manifest = (await app.get<IPublicationStorePort>(PUBLICATION_STORE).read(siteId, releaseId))!.manifest!;
    const file = manifest.artifacts.find((file) => file.public && file.path.startsWith('assets/'))!;

    expect((await get(`/assets/releases/${releaseId}/${file.path.slice('assets/'.length)}`,
      'GET', { Host: 'other.test' })).status).toBe(404);
    await expect(app.get<IRestorePageVersion>(RESTORE_PAGE_VERSION).execute({
      siteId: other.siteId,
      pageId,
      version: PublishedVersionPosition.Latest,
    })).rejects.toMatchObject({ name: 'PageScopeError' });
  });
  it('fails corrupt active publication data without rerunning Build loaders or disclosing the plan', async () => {
    const active = (await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId))!;
    const filename = path.join(settings.rendering!.artifactsRoot, `sites/delivery.test/${active.releaseId}/plans/${pageId}.json`);
    const bytes = await readFile(filename);
    const before = buildReads;

    try {
      await writeFile(filename, '{}');
      const response = await get('/?date=2026-10-25');

      expect(response.status).toBe(500);
      expect(response.body).toBe('');
      expect(buildReads).toBe(before);
    } finally {
      await writeFile(filename, bytes);
    }
  });
});
