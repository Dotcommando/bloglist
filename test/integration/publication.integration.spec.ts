import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';
import { chromium } from 'playwright-core';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { HookWorkerLifecycle } from '../../src/infra/hooks/hook-worker.lifecycle.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE, GET_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../../src/infra/persistence/persistence.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING,
  PAGE_PUBLICATIONS,
  PREVIEW_PAGE,
  PUBLICATION_SOURCE,
  PUBLISH_PAGE,
} from '../../src/infra/publication/publication.tokens.js';
import {
  PUBLISH_SITE_RELEASE,
  RELEASE_ACTIVATION,
  RESOLVE_PUBLISHED_PATH,
} from '../../src/infra/publication/publication.tokens.js';
import { PUBLICATION_STORE } from '../../src/infra/publication/publication.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CHANGE_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IGetPage } from '../../src/ports/inbound/pages/get-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPreviewPage } from '../../src/ports/inbound/publication/preview-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IResolvePublishedPath } from '../../src/ports/inbound/publication/resolve-published-path.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../../src/ports/inbound/routing/change-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IPagePublicationPort } from '../../src/ports/outbound/pages/page-publication.port.js';
import type { IDataLoader } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IPublicationSourcePort } from '../../src/ports/outbound/publication/publication-source.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { siteInput } from '../support/sites.js';

describe('rendering and publication with isolated dependencies', () => {
  const database = `zarya_test_${randomUUID().replaceAll('-', '')}`;
  let connection: Connection;
  let app: INestApplicationContext;
  let appClosed = false;
  let root = '';
  let siteId = '';
  let pageId = '';
  const actorId = 'publisher';
  let buildReads = 0;
  let liveReads = 0;
  const rendering = {
    templateId: 'Home',
    delivery: HtmlDelivery.Static,
    interaction: BrowserInteraction.None,
    parameters: {},
    loaders: [],
  };

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated test MongoDB URI required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoCreate: false,
      autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/publication-'));
    const sourcesRoot = path.join(root, 'sites');

    await mkdir(path.join(sourcesRoot, 'demo/templates/Home'), { recursive: true });
    const loaders: readonly IDataLoader[] = [
      {
        id: 'BuildLabel',
        parameters: [],
        output: { name: 'value', kind: ParameterKind.String, required: true },
        phases: [LoaderPhase.Build],
        read: async () => {
          buildReads++;

          return 'Frozen';
        },
      },
      {
        id: 'LiveLabel',
        parameters: [{ name: 'date', kind: ParameterKind.String, required: true }],
        output: { name: 'value', kind: ParameterKind.String, required: true },
        phases: [LoaderPhase.Request],
        read: async (input) => {
          liveReads++;

          return `Live ${input.date}`;
        },
      },
    ];

    app = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: actorId, platformAdministrator: true },
      rendering: { sourcesRoot, artifactsRoot: path.join(root, 'artifacts'), loaders },
    });
    // This fixture verifies publication, not the independently tested hook worker loop.
    // Keep source writes deterministic while retaining real hook persistence.
    await app.get(HookWorkerLifecycle).onApplicationShutdown();
    siteId = (await app.get<ICreateSite>(CREATE_SITE).execute(siteInput())).siteId;
    pageId = (await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId,
      mark: 'Home',
      language:
'en',
      title: 'Hello',
    })).pageId;
    await writeFile(path.join(sourcesRoot, 'demo/site.config.ts'), `export default {siteId:${JSON.stringify(siteId)},
      requestParameters:[{name:'date',kind:'String',required:true}]}`);
    await mkdir(path.join(sourcesRoot, 'demo/templates/Live'), { recursive: true });
    await writeFile(path.join(sourcesRoot, 'demo/templates/Live/index.html'),
      '<!doctype html><html><head></head><body>[[+built]][[!LiveLabel? &date=`[[+request.date]]` &as=`live`]][[+live]]</body></html>',
    );
    await writeFile(path.join(sourcesRoot, 'demo/templates/Home/index.html'),
      '<!doctype html><html><head><title>[[*title]]</title></head><body><h1>[[*title]]</h1><button data-click>Click</button></body></html>',
    );
    await writeFile(path.join(sourcesRoot, 'demo/styles.css'), 'body{margin:0;color:black}');
    await writeFile(path.join(sourcesRoot, 'demo/templates/Home/styles.css'),
      'h1{font-size:24px;background-color:white}');
    await writeFile(path.join(sourcesRoot, 'demo/templates/Home/client.ts'),
      "document.querySelector('[data-click]')?.addEventListener('click', () => { document.body.dataset.clicked = 'yes'; });",
    );
  });
  afterAll(async () => {
    if (!appClosed) {
      await app?.close();
    }
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
    if (root?.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('configures persisted rendering and rejects unknown registered templates', async () => {
    const operation = app.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING);

    await expect(operation.execute({
      siteId,
      actorId,
      pageId,
      rendering: {
        ...rendering,
        templateId: 'Missing',
      },
    })).rejects.toThrow();
    expect((await operation.execute({ siteId, actorId, pageId, rendering })).toState().rendering).toEqual(rendering);
  });
  it('provides an actual styled browser preview without publishing the draft', async () => {
    const result = await app.get<IPreviewPage>(PREVIEW_PAGE).execute({ siteId, actorId, pageId });
    const response = await fetch(result.url);
    const html = await response.text();

    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('data-zarya="page-reflow"');
    expect(html).toContain('type="module"');
    expect(await connection.collection<{ _id: string }>('page_publications')
      .countDocuments({ siteId, _id: pageId })).toBe(0);
    const executablePath = process.env.ZARYA_TEST_BROWSER_EXECUTABLE;

    if (!executablePath) {
      throw new Error('Explicit Chromium browser executable required');
    }

    const browser = await chromium.launch({ executablePath, headless: true });

    try {
      const page = await browser.newPage();
      const apiRequests: string[] = [];

      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) {
          apiRequests.push(request.url());
        }
      });
      await page.goto(result.url);
      await page.locator('[data-click]').click();
      expect(await page.locator('body').getAttribute('data-clicked')).toBe('yes');
      expect(await page.locator('h1').evaluate((element) => getComputedStyle(element).fontSize)).toBe('24px');
      expect(apiRequests).toEqual([]);
    } finally {
      await browser.close();
    }
  });
  it('publishes drafts directly, retains three versions and keeps one later draft separate', async () => {
    const publish = app.get<IPublishPage>(PUBLISH_PAGE);
    const first = await publish.execute({ siteId, pageId });

    for (const title of ['Second', 'Third', 'Fourth']) {
      expect((await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title })).status).toBe('DRAFT');
      expect((await publish.execute({ siteId, pageId })).publishedAt).toEqual(first.publishedAt);
    }
    expect((await app.get<IPagePublicationPort>(PAGE_PUBLICATIONS).versions(siteId, pageId)).map((page) => page.title))
      .toEqual(['Fourth', 'Third', 'Second']);
    await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId, title: 'Unpublished draft' });
    const captured = await app.get<IPublicationSourcePort>(PUBLICATION_SOURCE).capture(siteId);

    expect(captured.pages.find((page) => page.pageId === pageId)?.title).toBe('Fourth');
    expect(await connection.collection<{ _id: string }>('pages').countDocuments({ _id: pageId })).toBe(1);
  });
  it('builds actual static artifacts, activates them and resolves only the active release', async () => {
    await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId,
      pageId,
      mark: 'HomeUrl',
      parentUrlId: null,
      path: '/',
      segment: 'home',
    });
    const release = await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId,
      actorId,
      expectedActiveReleaseId:
      (await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId))?.releaseId ?? null,
    });
    const resolved = await app.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId, path: '/' });

    expect(resolved).toMatchObject({
      kind: 'StoredDocument',
      releaseId: release.releaseId,
      documentPath: 'index.html',
      robotsIndex: true,
    });
    const html = await readFile(path.join(root, 'artifacts/sites/example.test', release.releaseId,
      'public/index.html'), 'utf8');

    expect(html).toContain('<h1>Fourth</h1>');
    expect(html).not.toContain('Unpublished draft');
    await expect(app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId,
      actorId,
      expectedActiveReleaseId: null,
    }))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    expect(await app.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId, path: '/unknown/' }))
      .toEqual({ kind: 'NotFound' });
    expect(await app.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId: 'foreign', path: '/' }))
      .toEqual({ kind: 'NotFound' });
  });
  it('leaves the active publication unchanged when a real build fails', async () => {
    const activation = app.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const current = await activation.getActive(siteId);
    const filename = path.join(root, 'sites/demo/templates/Home/styles.css');

    await writeFile(filename, 'h1{width:10rem}');

    try {
      await expect(app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
        siteId, actorId, expectedActiveReleaseId: current!.releaseId,
      })).rejects.toThrow();
      expect((await activation.getActive(siteId))?.releaseId).toBe(current!.releaseId);
    } finally {
      await writeFile(filename, 'h1{font-size:24px;background-color:white}');
    }
  });
  it('serializes competing release activations and preserves the previous release files', async () => {
    const current = await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId);
    const publish = app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE);
    const results = await Promise.allSettled([1, 2].map(() => publish.execute({
      siteId, actorId, expectedActiveReleaseId: current!.releaseId,
    })));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await readFile(path.join(root, 'artifacts/sites/example.test', current!.releaseId,
      'public/index.html'), 'utf8'))
      .toContain('Fourth');
  });
  it('reconciles an actual committed activation whose acknowledgement was lost', async () => {
    const current = await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId);
    const databaseConnection = app.get<Connection>(MONGO_CONNECTION);
    const start = databaseConnection.startSession.bind(databaseConnection);
    const spy = vi.spyOn(databaseConnection, 'startSession').mockImplementation(async (...args) => {
      const session = await start(...args);
      const commit = session.commitTransaction.bind(session);

      vi.spyOn(session, 'commitTransaction').mockImplementation(async () => {
        await commit();
        throw new Error('Committed but acknowledgement lost');
      });

      return session;
    });

    try {
      const result = await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
        siteId, actorId, expectedActiveReleaseId: current!.releaseId,
      });

      expect((await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId))?.releaseId)
        .toBe(result.releaseId);
      expect(await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).findActivation(siteId, current!.releaseId))
        .toMatchObject({ releaseId: current!.releaseId });
    } finally {
      spy.mockRestore();
    }
  });
  it('freezes Build values privately and never executes Request loaders during publication', async () => {
    const live = await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId,
      mark: 'Live',
      language: 'en',
      title: 'Live page',
    });

    await app.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      actorId,
      pageId: live.pageId,
      rendering: {
        ...rendering,
        templateId: 'Live',
        delivery: HtmlDelivery.Request,
        loaders: [{
          loaderId: 'BuildLabel',
          alias: 'built',
          phase: LoaderPhase.Build,
          required: true,
          parameters: {},
          dependsOn: [],
        }],
      },
    });
    await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId: live.pageId });
    await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId,
      pageId: live.pageId,
      mark: 'LiveUrl',
      parentUrlId: null,
      path: '/live/',
      segment: 'live',
    });
    const current = await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId);

    buildReads = 0;
    liveReads = 0;
    const result = await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId, actorId, expectedActiveReleaseId: current!.releaseId,
    });

    expect(buildReads).toBe(1);
    expect(liveReads).toBe(0);
    expect(await app.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId, path: '/live/' }))
      .toEqual({ kind: 'RequestPlan', releaseId: result.releaseId, renderPlanId: live.pageId, robotsIndex: true });
    const releaseRoot = path.join(root, 'artifacts/sites/example.test', result.releaseId);
    const privatePlan = await readFile(path.join(releaseRoot, 'plans', `${live.pageId}.json`), 'utf8');

    expect(privatePlan).toContain('Frozen');
    expect(privatePlan).not.toContain('Live 2026');
    await expect(readFile(path.join(releaseRoot, 'public/live/index.html'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(app.get<IPreviewPage>(PREVIEW_PAGE).execute({ siteId, actorId, pageId: live.pageId }))
      .rejects.toThrow();
    const preview = await app.get<IPreviewPage>(PREVIEW_PAGE).execute({
      siteId,
      actorId,
      pageId: live.pageId,
      requestValues: { date: '2026-11-10' },
    });

    expect(await (await fetch(preview.url)).text()).toContain('FrozenLive 2026-11-10');
  });
  it('rolls back page publication and version pruning together on a real transaction failure', async () => {
    const pages = app.get<IGetPage>(GET_PAGE);
    const before = (await pages.execute({ siteId, pageId }))!.toState();
    const versions = app.get<IPagePublicationPort>(PAGE_PUBLICATIONS);
    const retained = await versions.versions(siteId, pageId);
    const model = app.get<Connection>(MONGO_CONNECTION).model('PagePublications');
    const query = model.updateOne({}, {});

    vi.spyOn(query, 'exec').mockRejectedValueOnce(new Error('Injected version write failure'));
    const spy = vi.spyOn(model, 'updateOne').mockReturnValueOnce(query);

    try {
      await expect(app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId })).rejects.toThrow('Injected');
      expect((await pages.execute({ siteId, pageId }))!.toState()).toEqual(before);
      expect(await versions.versions(siteId, pageId)).toEqual(retained);
    } finally {
      spy.mockRestore();
    }
  });
  it('preserves a saved redirect to an unpublished page without adding a publication gate', async () => {
    const draft = await app.get<ICreatePage>(CREATE_PAGE).execute({
      siteId,
      mark: 'DraftTarget',
      language: 'en',
      title: 'Draft',
    });

    await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId,
      pageId: draft.pageId,
      mark: 'DraftOld',
      path: '/draft-old/',
      segment: 'draft-old',
      parentUrlId: null,
    });
    await app.get<IChangePageUrl>(CHANGE_PAGE_URL).execute({
      siteId,
      pageId: draft.pageId,
      mark: 'DraftNew',
      path: '/draft-new/',
      segment: 'draft-new',
      parentUrlId: null,
      redirectStatus: UrlRedirectStatus.HTTP_301,
    });
    const active = await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId);
    const release = await app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId, actorId, expectedActiveReleaseId: active!.releaseId,
    });

    expect(await app.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId, path: '/draft-old/' }))
      .toEqual({ kind: 'Redirect', releaseId: release.releaseId, targetPath: '/draft-new/', status: 301 });
    expect(await app.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH).execute({ siteId, path: '/draft-new/' }))
      .toEqual({ kind: 'NotFound' });
    expect(await readFile(path.join(root, 'artifacts/sites/example.test', release.releaseId,
      'public/_redirects'), 'utf8'))
      .toContain('/draft-old/ /draft-new/ 301');
  });
  it('serves the static export and its compiled interactions after the Nest application is closed', async () => {
    const active = await app.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId);
    const release = (await app.get<IPublicationStorePort>(PUBLICATION_STORE).read(siteId, active!.releaseId))!;
    const publicRoot = path.join(root, 'artifacts/sites/example.test', active!.releaseId, 'public');
    const files = new Map(release.manifest!.artifacts.filter((file) => file.public).map((file) => [file.path, file]));

    await app.close();
    appClosed = true;
    const server = createServer((request, response) => {
      const routePath = new URL(request.url ?? '/', 'http://localhost').pathname;
      const route = release.manifest!.routes.find((route) => route.path === routePath);
      const prefix = `/assets/releases/${active!.releaseId}/`;
      const filename = route?.kind === PublishedRouteKind.Static ? route.documentPath
        : routePath.startsWith(prefix) ? `assets/${routePath.slice(prefix.length)}` : routePath.slice(1);
      const file = files.get(filename);

      if (!file) {
        response.writeHead(404).end();

        return;
      }
      readFile(path.join(publicRoot, file.path)).then((bytes) => {
        response.writeHead(200, { 'Content-Type': file.mimeType }).end(bytes);
      }, () => {
        response.writeHead(500).end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing static test server');
    }

    const browser = await chromium.launch({
      executablePath:
process.env.ZARYA_TEST_BROWSER_EXECUTABLE!,
      headless: true,
    });

    try {
      const page = await browser.newPage();

      await page.goto(`http://127.0.0.1:${address.port}/`);
      expect(await page.locator('h1').textContent()).toBe('Fourth');
      await page.locator('[data-click]').click();
      expect(await page.locator('body').getAttribute('data-clicked')).toBe('yes');
      expect((await fetch(`http://127.0.0.1:${address.port}/manifest.json`)).status).toBe(404);
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
