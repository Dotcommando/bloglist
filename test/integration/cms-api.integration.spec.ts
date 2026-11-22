import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { HookKind } from '@zarya/addon-contracts/hooks';
import { Lexer } from 'marked';
import { type Connection, createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { pageSnapshotPath } from '../../src/adapters/outbound/publication/files/page-content-snapshot.js';
import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import type { CmsApiService } from '../../src/app/services/cms/cms-api.service.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PublishedResolutionKind } from '../../src/domain/publication/published-resolution.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { ADDON_PACKAGE_REGISTRY } from '../../src/infra/addons/addons.tokens.js';
import { installedAddons } from '../../src/infra/addons/installed-addons.js';
import { CMS_API } from '../../src/infra/cms/cms.tokens.js';
import { HookWorkerLifecycle } from '../../src/infra/hooks/hook-worker.lifecycle.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { CmsApi } from '../../src/ports/inbound/cms/cms-api.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import { siteInput } from '../support/sites.js';

describe('CMS API through real local composition', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let application: INestApplicationContext;
  let root = '';
  let cms: CmsApi;
  let siteId = '';

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated test MongoDB required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    root = await mkdtemp(path.resolve('.tmp/cms-api-'));
    application = await createLocalApplication({
      mongoUri,
      database,
      dumpsRoot: path.join(root, 'dumps'),
      operator: { operatorId: 'cms-api-test', platformAdministrator: true },
      rendering: { sourcesRoot: path.join(root, 'sources'), artifactsRoot: path.join(root, 'artifacts') },
      media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
    });
    await application.get(HookWorkerLifecycle).onApplicationShutdown();
    const site = await application.get<ICreateSite>(CREATE_SITE).execute(siteInput());

    siteId = site.siteId;
    cms = application.get<CmsApiService>(CMS_API).forContext({ siteId, actorId: 'cms-test-extension' });
  });

  afterAll(async () => {
    await application?.close();

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
    if (root && path.resolve(root).startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps contextual site lists and hostname resolution isolated through real composition', async () => {
    const foreign = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(), mark: 'ScopedOther', primaryDomain: 'scope-other.test',
    });

    expect((await cms.sites.list()).items.map((site) => site.siteId)).toEqual([siteId]);
    expect((await cms.sites.resolve({ hostname: 'example.test' }))?.siteId).toBe(siteId);
    expect(await cms.sites.resolve({ hostname: 'scope-other.test' })).toBeNull();
    const foreignCms = application.get<CmsApiService>(CMS_API).forContext({
      siteId: foreign.siteId, actorId: 'scope-probe',
    });

    expect((await foreignCms.sites.list()).items.map((site) => site.siteId)).toEqual([foreign.siteId]);
    expect(await foreignCms.sites.resolve({ hostname: 'example.test' })).toBeNull();
  });

  it('runs real commands through compiled Build/Request Snippets and preview', async () => {
    const target = await cms.pages.create({ mark: 'Target', language: 'en', title: 'Before' });
    const snippet = await cms.snippets.create({
      name: 'CmsProbe',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: [],
      snippet: {
        code: 'await cms.pages.update({ pageId: "' + target.pageId + '", title: "Changed by " + context.phase }); '
          + 'return (await cms.pages.getDraft({ pageId: "' + target.pageId + '" })).title;',
        phases: [LoaderPhase.Build, LoaderPhase.Request],
        output: { name: 'result', kind: ParameterKind.String, required: true },
      },
    });

    for (const phase of [LoaderPhase.Build, LoaderPhase.Request]) {
      const template = await cms.templates.create({
        name: 'Probe ' + phase,
        html: '<html><head></head><body>[[probe]]</body></html>'
          .replace('[[probe]]', '[[' + (phase === LoaderPhase.Request ? '!' : '') + snippet.key
            + '? &as=`value`]][[+value]]'),
        css: '',
        browserTypeScript: null,
        parameters: [],
      });
      const page = await cms.pages.create({ mark: 'Probe' + phase, language: 'en', title: 'Probe' });

      await cms.pages.configureRendering({
        pageId: page.pageId,
        rendering: {
          templateId: template.key,
          delivery: phase === LoaderPhase.Build ? HtmlDelivery.Static : HtmlDelivery.Request,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      });
      const segment = phase.toLowerCase();

      await cms.urls.assignInitial({
        pageId: page.pageId,
        mark: 'Url' + phase,
        parentUrlId: null,
        segment,
        path: '/' + segment + '/',
      });
      const released = await cms.pages.publishRelease({ pageId: page.pageId });

      if (phase === LoaderPhase.Request) {
        const route = await cms.publication.resolvePath({ path: '/' + segment + '/' });

        expect(route.kind).toBe(PublishedResolutionKind.RequestPlan);

        if (route.kind !== PublishedResolutionKind.RequestPlan) {
          throw new Error('Expected Request route');
        }

        const document = await cms.publication.renderPage({
          releaseId: released.publication.releaseId, renderPlanId: route.renderPlanId,
        });

        expect(document.html).toContain('Changed by Request');
        const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

        if (!mongoUri) {
          throw new Error('Explicit isolated test MongoDB required');
        }

        const http = await createPublicHttpApplication({
          mongoUri,
          database,
          host: '127.0.0.1',
          port: 0,
          dumpsRoot: path.join(root, 'dumps'),
          sourcesRoot: path.join(root, 'sources'),
          artifactsRoot: path.join(root, 'artifacts'),
          media: { root: path.join(root, 'media'), publicBaseUrl: '/assets' },
        });

        try {
          const address = http.getHttpServer().address();

          if (!address || typeof address === 'string') {
            throw new Error('Missing test listener');
          }

          const call = (pathname: string, method = 'GET'): Promise<{ status: number; body: string }> =>
            new Promise((resolve, reject) => {
              const outgoing = request({
                host: '127.0.0.1',
                port: address.port,
                path: pathname,
                method,
                headers: { Host: 'example.test' },
              }, (response) => {
                const chunks: Buffer[] = [];

                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => resolve({
                  status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'),
                }));
              });

              outgoing.once('error', reject);
              outgoing.end();
            });

          expect(await call('/request/')).toMatchObject({
            status: 200,
            body: expect.stringContaining('Changed by Request'),
          });
          expect((await call('/api/cms/pages/update', 'POST')).status).toBe(405);
          expect((await call('/api/cms/pages/get')).status).toBe(404);
          expect((await call('/' + pageSnapshotPath(page.pageId))).status).toBe(404);
        } finally {
          await http.close();
        }
      }
      expect((await cms.pages.getDraft({ pageId: target.pageId }))?.title).toBe('Changed by ' + phase);
      const preview = await cms.pages.preview({ pageId: page.pageId });

      expect(preview.html).toContain('Changed by ' + phase);
    }
  });

  it('binds every object family to real operations and preserves draft/release/version separation', async () => {
    expect((await cms.sites.get({}))?.siteId).toBe(siteId);
    expect((await cms.sites.list()).total).toBe(1);
    expect((await cms.templates.list()).total).toBeGreaterThan(0);
    expect((await cms.chunks.list()).total).toBeGreaterThan(0);
    expect((await cms.snippets.list()).total).toBeGreaterThan(0);
    expect((await cms.tvs.list()).total).toBe(0);
    expect((await cms.files.list()).total).toBe(0);
    expect((await cms.addons.list()).items.map((addon) => addon.addonKey))
      .toEqual(installedAddons.map((addon) => addon.definition.addonKey).sort());
    expect((await cms.hooks.list()).total).toBeGreaterThan(0);
    expect((await cms.adminUsers.list()).total).toBe(0);
    const handler = await cms.hooks.create({
      title: 'API Check', kind: HookKind.Check, draft: { source: 'return {allow: true};', capabilities: [] },
    });

    expect(handler.kind).toBe(HookKind.Check);
    const applied = await cms.hooks.apply({ handlerId: handler.handlerId, expectedVersion: handler.version });

    expect(applied.handlerId).toBe(handler.handlerId);
    const page = await cms.pages.create({ mark: 'ApiPage', language: 'en', title: 'Published title' });

    await cms.pages.configureRendering({
      pageId: page.pageId,
      rendering: {
        templateId: 'ZaryaBasic',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await cms.urls.assignInitial({
      pageId: page.pageId,
      mark: 'ApiUrl',
      parentUrlId: null,
      segment: 'api-page',
      path: '/api-page/',
    });
    const result = await cms.pages.publishRelease({ pageId: page.pageId });
    const published = await cms.pages.getPublished({ pageId: page.pageId });

    expect(published?.title).toBe('Published title');
    expect(typeof published?.updatedAt).toBe('string');
    await cms.pages.update({ pageId: page.pageId, title: 'New draft' });
    expect((await cms.pages.getDraft({ pageId: page.pageId }))?.title).toBe('New draft');
    expect((await cms.pages.getPublished({
      pageId: page.pageId,
      releaseId: result.publication.releaseId,
    }))?.title).toBe('Published title');
    const versions = await cms.pages.listVersions({ pageId: page.pageId });

    expect(versions.total).toBe(1);
    expect((await cms.pages.getPublished({
      pageId: page.pageId,
      pageVersionId: versions.items[0]!.pageVersionId,
    }))?.title).toBe('Published title');
    expect((await cms.urls.findByPath({ path: '/api-page/' }))?.pageId).toBe(page.pageId);
    await cms.pages.publishRelease({ pageId: page.pageId });
    expect((await cms.pages.getPublished({ pageId: page.pageId }))?.title).toBe('New draft');
    expect((await cms.pages.getPublished({
      pageId: page.pageId, releaseId: result.publication.releaseId,
    }))?.title).toBe('Published title');
    expect(await cms.publication.getArtifact({
      releaseId: result.publication.releaseId, path: pageSnapshotPath(page.pageId),
    })).toBeNull();
    await expect(application.get<CmsApiService>(CMS_API).invoke({ siteId, actorId: 'test' },
      'pages', 'get', { pageId: page.pageId, siteId: 'foreign' })).rejects.toThrow();
    const foreign = await application.get<ICreateSite>(CREATE_SITE).execute({
      ...siteInput(),
      mark: 'Other',
      primaryDomain: 'other.test',
    });
    const foreignCms = application.get<CmsApiService>(CMS_API).forContext({
      siteId: foreign.siteId,
      actorId: 'other-extension',
    });

    await expect(foreignCms.pages.get({ pageId: page.pageId })).rejects.toThrow();
    expect(await foreignCms.pages.getPublished({
      pageId: page.pageId,
      releaseId: result.publication.releaseId,
    })).toBeNull();
  });
  it.skipIf(!process.env.ZARYA_TEST_SYNTHETIC_ADDON_DIRECTORY)(
    'loads the external synthetic artifact and fences persistent record writes', async () => {
      const directory = process.env.ZARYA_TEST_SYNTHETIC_ADDON_DIRECTORY;

      if (!directory) {
        throw new Error('Explicit synthetic package artifact required');
      }
      await application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).install(directory);
      const client = application.get<CmsApiService>(CMS_API).forContext({ siteId, actorId: 'synthetic-api-test' });
      const enabled = await client.addons.enable({
        addonKey: 'synthetic',
        expectedVersion: null,
        configuration: { schemaVersion: 1, values: {} },
      });
      const record = await client.extensions.synthetic!.records!.put!({
        recordId: 'one',
        value: 'first',
        expectedVersion: null,
      });

      expect(record).toMatchObject({ siteId, recordId: 'one', value: 'first' });
      await expect(client.extensions.synthetic!.records!.put!({
        recordId: 'one',
        value: 'stale',
        expectedVersion: null,
      })).rejects.toThrow();
      const concurrent = await Promise.allSettled(['a', 'b'].map((value) =>
        client.extensions.synthetic!.records!.put!({ recordId: 'race', value, expectedVersion: null })));

      expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const failed = concurrent.find((result) => result.status === 'rejected');

      expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({ code: 'Conflict' });
      await expect(client.extensions.synthetic!.records!.list!({ limit: null })).rejects.toThrow();
      await expect(client.extensions.synthetic!.records!.list!({ sortby: null })).rejects.toThrow();
      expect(await client.extensions.synthetic!.records!.list!({ limit: 5000 })).toMatchObject({
        total: 2,
        limit: 5000,
        offset: 0,
      });
      const page = await client.pages.create({ mark: 'SyntheticProbe', language: 'en', title: 'Probe draft' });

      expect(await client.extensions.synthetic!.records!.probePage!({ pageId: page.pageId })).toMatchObject({
        draftTitle: 'Probe draft', publishedTitle: null,
      });
      await client.addons.disable({ addonKey: 'synthetic', expectedVersion: enabled.version });
      await expect(client.extensions.synthetic!.records!.put!({
        recordId: 'two',
        value: 'disabled',
        expectedVersion: null,
      })).rejects.toThrow();
      expect(await client.extensions.synthetic!.records!.get!({ recordId: 'one' })).toMatchObject({ value: 'first' });
    });
  it('executes the documented chunk/template/TV recipe against the real server API', async () => {
    const guide = await readFile('docs/guide/en/recipes.md', 'utf8');
    const example = Lexer.lex(guide).find((token) => token.type === 'code' && token.lang === 'typescript');

    if (example?.type !== 'code') {
      throw new Error('Missing executable guide example');
    }

    const code = example.text;
    const execute = new Function('cms', 'return (async () => { ' + code + ' })();');

    await execute(cms);
    const pages = await cms.pages.list({ filter: { mark: 'ApiExample' } });

    expect(pages.total).toBe(1);
    const page = pages.items[0]!;

    expect((await cms.pages.getPublished({ pageId: page.pageId }))?.tvValues).toMatchObject({
      lead: 'Hello from the API',
    });
    const route = await cms.publication.resolvePath({ path: '/api-example/' });

    if (route.kind !== PublishedResolutionKind.StoredDocument) {
      throw new Error('Expected compiled static recipe');
    }

    const artifact = await cms.publication.getArtifact({ releaseId: route.releaseId, path: route.documentPath });

    if (!artifact) {
      throw new Error('Missing compiled recipe artifact');
    }
    expect(new TextDecoder().decode(Uint8Array.from(artifact.content.bytes))).toContain('Hello from the API');
  });
});
