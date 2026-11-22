import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import type { INestApplicationContext } from '@nestjs/common';
import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type {
  FilePublishedContentAdapter,
} from '../../src/adapters/outbound/publication/files/published-content.adapter.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import { CREATE_SITE_DUMP, RESTORE_SITE_DUMP } from '../../src/infra/dumps/dumps.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING, FIND_PUBLISHED_PAGES, PUBLICATION_STORE, PUBLISH_PAGE, PUBLISH_PAGE_RELEASE,
  PUBLISH_SITE_RELEASE, PUBLISHED_CONTENT, RELEASE_ACTIVATION, RENDER_PUBLISHED_PAGE,
} from '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { ICreateSiteDump, IRestoreSiteDump } from '../../src/ports/inbound/dumps/site-dumps.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPublishPageRelease } from '../../src/ports/inbound/publication/publish-page-release.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IRenderPublishedPage } from '../../src/ports/inbound/publication/render-published-page.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IPublicationStorePort } from '../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { siteInput } from '../support/sites.js';

it('preserves warm plans across page/site publication, retained reads and dump restore', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const connection = await createConnection(mongoUri, {
    dbName: database,
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  const root = await mkdtemp(path.resolve('.tmp/parsed-plans-'));
  let app: INestApplicationContext | undefined;
  let builds = 0;
  const dropTestDatabase = async (): Promise<void> => {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe test database');
    }
    await connection.dropDatabase();
  };

  try {
    await applyMigrations(connection, 'migrations');
    app = await createLocalApplication({
      mongoUri,
      database,
      dumpsRoot: path.join(root, 'dumps'),
      rendering: {
        sourcesRoot: path.join(root, 'sites'),
        artifactsRoot: path.join(root, 'artifacts'),
        loaders: [{
          id: 'FrozenBuild',
          phases: [LoaderPhase.Build],
          parameters: [],
          output: { name: 'value', kind: ParameterKind.String, required: true },
          read: async () => 'build:' + ++builds,
        }],
      },
      operator: { operatorId: 'plan-test', platformAdministrator: true },
    });
    const site = await app.get<ICreateSite>(CREATE_SITE).execute(siteInput());
    const scope = { siteId: site.siteId, actorId: 'plan-test' };
    const template = await app.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId: site.siteId,
      kind: TemplateSourceKind.Template,
      name: 'Plan fixture',
      html: '<html><head></head><body>[[FrozenBuild? &as=`frozen`]]'
        + '<p>[[*title]]</p><span>[[+frozen]]</span></body></html>',
      css: '',
      browserTypeScript: null,
      parameters: [],
    });
    const pages = [];

    for (const [mark, title, segment] of [['First', 'First v1', 'first'], ['Second', 'Second v1', 'second']]) {
      const page = await app.get<ICreatePage>(CREATE_PAGE).execute({
        siteId: site.siteId, mark: mark!, language: 'en', title: title!,
      });

      await app.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
        ...scope,
        pageId: page.pageId,
        rendering: {
          templateId: template.key,
          delivery: HtmlDelivery.Request,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
          requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 300000 },
        },
      });
      await app.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
        siteId: site.siteId,
        pageId: page.pageId,
        mark: mark! + 'Url',
        parentUrlId: null,
        segment: segment!,
        path: '/' + segment + '/',
      });
      await app.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
      pages.push(page);
    }
    const activation = app.get<IReleaseActivationPort>(RELEASE_ACTIVATION);
    const publish = app.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE);
    const prior = await activation.getActive(site.siteId);
    const initial = await publish.execute({ ...scope, expectedActiveReleaseId: prior?.releaseId ?? null });
    const content = app.get<FilePublishedContentAdapter>(PUBLISHED_CONTENT);
    const store = app.get<IPublicationStorePort>(PUBLICATION_STORE);
    const render = app.get<IRenderPublishedPage>(RENDER_PUBLISHED_PAGE);
    const get = async (pageId: string, releaseId: string): Promise<string> => {
      const release = await store.read(site.siteId, releaseId, true);
      const route = release?.manifest?.routes.find(candidate => 'pageId' in candidate && candidate.pageId === pageId);

      if (route?.kind !== PublishedRouteKind.Request) {
        throw new Error('Expected Request route');
      }

      return (await render.execute({
        siteId: site.siteId,
        releaseId,
        renderPlanId: route.renderPlanId,
        path: route.path,
      })).html;
    };

    expect(await app.get(FIND_PUBLISHED_PAGES).execute({
      siteId: site.siteId, pageIds: [...pages.map((page) => page.pageId), 'unpublished'],
    })).toEqual(pages.map((page) => page.pageId));
    const first = pages[0]!;
    const second = pages[1]!;
    const firstHtml = await get(first.pageId, initial.releaseId);
    const secondHtml = await get(second.pageId, initial.releaseId);

    expect(firstHtml).toContain('First v1');
    expect(secondHtml).toContain('Second v1');
    expect(builds).toBe(2);
    expect(await get(first.pageId, initial.releaseId)).toBe(firstHtml);
    expect(content.planCache.snapshot().entries).toBe(2);
    const dump = await app.get<ICreateSiteDump>(CREATE_SITE_DUMP).execute(scope);

    await get(first.pageId, initial.releaseId);
    await get(second.pageId, initial.releaseId);
    await app.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId: site.siteId, pageId: first.pageId, title: 'First v2' });
    const pageRelease = await app.get<IPublishPageRelease>(PUBLISH_PAGE_RELEASE).execute({
      ...scope,
      pageId: first.pageId,
    });

    expect(pageRelease.publication.releaseId).not.toBe(initial.releaseId);
    expect(await get(first.pageId, pageRelease.publication.releaseId)).toContain('First v2');
    expect(await get(second.pageId, pageRelease.publication.releaseId)).toBe(secondHtml);
    expect(await get(first.pageId, initial.releaseId)).toBe(firstHtml);
    expect(builds).toBe(3);
    await app.get<IUpdatePage>(UPDATE_PAGE).execute({
      siteId: site.siteId,
      pageId: second.pageId,
      title: 'Unpublished draft',
    });
    const full = await publish.execute({ ...scope, expectedActiveReleaseId: pageRelease.publication.releaseId });
    const fullSecond = await get(second.pageId, full.releaseId);

    expect(await get(first.pageId, full.releaseId)).toContain('First v2');
    expect(fullSecond).toContain('Second v1');
    expect(fullSecond).not.toContain('Unpublished draft');
    expect(fullSecond).not.toBe(secondHtml);
    expect(builds).toBe(5);
    expect(await get(first.pageId, initial.releaseId)).toBe(firstHtml);
    expect(content.planCache.snapshot().entries).toBeGreaterThan(0);
    await app.get<IRestoreSiteDump>(RESTORE_SITE_DUMP).execute({ ...scope, filename: dump.filename });
    expect(content.planCache.snapshot().entries).toBe(0);
    expect((await activation.getActive(site.siteId))?.releaseId).toBe(initial.releaseId);
    expect(await get(first.pageId, initial.releaseId)).toBe(firstHtml);
    expect(await get(second.pageId, initial.releaseId)).toBe(secondHtml);
    expect(content.planCache.snapshot().entries).toBe(2);
    expect(builds).toBe(5);
  } finally {
    await app?.close();

    await dropTestDatabase();
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
});
