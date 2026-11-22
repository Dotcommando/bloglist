import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  type IJsonLdProfile, type IJsonLdSharedObject, JsonLdSourceKind,
} from '../../src/domain/json-ld/json-ld-catalog.js';
import { JsonLdValueKind } from '../../src/domain/json-ld/json-ld-graph.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { UrlRedirectStatus } from '../../src/domain/routing/url-redirect-status.enum.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import {
  INSPECT_JSON_LD_DRAFT, INSPECT_JSON_LD_PUBLISHED, SAVE_JSON_LD_CATALOG,
} from '../../src/infra/json-ld/json-ld.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE, UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { CONFIGURE_PAGE_RENDERING } from '../../src/infra/publication/publication.tokens.js';
import { PUBLISH_CURRENT_PAGE } from '../../src/infra/publication/publication.tokens.js';
import { CHANGE_PUBLISHED_PAGE_URL } from '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IInspectJsonLd } from '../../src/ports/inbound/json-ld/inspect-json-ld.port.js';
import type { ISaveJsonLdCatalog } from '../../src/ports/inbound/json-ld/json-ld-catalog.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPublishCurrentPage } from '../../src/ports/inbound/publication/publish-current-page.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IChangePublishedPageUrl } from '../../src/ports/inbound/routing/change-published-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IDataLoader } from '../../src/ports/outbound/publication/data-loader.port.js';

it('publishes immutable graphs and refreshes shared objects without exposing another page draft', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const database = `zarya_test_${randomUUID().replaceAll('-', '')}`;
  const connection = await createConnection(mongoUri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/json-ld-publication-'));
  let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
  let http: Awaited<ReturnType<typeof createPublicHttpApplication>> | undefined;

  try {
    await applyMigrations(connection, 'migrations');
    let requestReads = 0;
    let sessionId = 'meeting-1';
    let present = true;
    const loaders: IDataLoader[] = [{
      id: 'GraphLabel',
      parameters: [],
      output: {
        name: 'label',
        kind: ParameterKind.Object,
        required: true,
        properties: [
          { name: 'label', kind: ParameterKind.String, required: true },
          { name: 'sessionId', kind: ParameterKind.String, required: true },
          { name: 'present', kind: ParameterKind.Boolean, required: true },
        ],
      },
      phases: [LoaderPhase.Request],
      read: async () => {
        requestReads++;

        return { label: 'Live prepared', sessionId, present };
      },
    }];
    const rendering = { sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts'), loaders };

    local = await createLocalApplication({
      mongoUri,
      database,
      operator: { operatorId: 'synthetic', platformAdministrator: true },
      rendering,
    });
    const site = await local.get<ICreateSite>(CREATE_SITE).execute({
      mark: 'Graph',
      name: 'Graph',
      primaryDomain: 'graph.test',
      languages: ['en'],
      defaultLanguage: 'en',
      onboarding: { localAddress: 'http://graph.test:39876', originMode: SiteOriginMode.Local },
    });
    const siteId = site.siteId;
    const template = await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId,
      kind: TemplateSourceKind.Template,
      name: 'Article',
      html: '<html><head><title>[[*title]]</title></head><body><h1>[[*title]]</h1></body></html>',
      css: '',
      browserTypeScript: null,
      parameters: [],
    });
    const requestTemplate = await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
      siteId,
      kind: TemplateSourceKind.Template,
      name: 'Live article',
      html: '<html><head></head><body>[[!GraphLabel? &as=`headline`]]<h1>[[+headline.label]]</h1></body></html>',
      css: '',
      browserTypeScript: null,
      parameters: [],
    });
    const create = local.get<ICreatePage>(CREATE_PAGE);
    const first = await create.execute({ siteId, mark: 'First', title: 'First published', language: 'en' });
    const second = await create.execute({ siteId, mark: 'Second', title: 'Second published', language: 'en' });
    const live = await create.execute({ siteId, mark: 'Live', title: 'Live published', language: 'en' });

    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId,
      pageId: live.pageId,
      actorId: 'synthetic',
      rendering: {
        templateId: requestTemplate.key,
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    const save = local.get<ISaveJsonLdCatalog>(SAVE_JSON_LD_CATALOG);
    const definitions: { profiles: IJsonLdProfile[]; objects: IJsonLdSharedObject[] } = {
      profiles: [{
        profileId: 'article',
        name: 'Article',
        templateIds: [template.key],
        nodes: [{
          role: 'article',
          type: 'Article',
          mappings: [
            {
              property: 'headline',
              required: true,
              source: { kind: JsonLdSourceKind.PageField as const, name: 'title' },
            },
            {
              property: 'relatedLink',
              required: true,
              source: { kind: JsonLdSourceKind.Page, pageId: first.pageId },
            },
            {
              property: 'author',
              required: true,
              source: { kind: JsonLdSourceKind.SharedObject as const, objectId: 'alice' },
            },
          ],
        }],
      }],
      objects: [{
        objectId: 'alice',
        name: 'Alice',
        type: 'Person' as const,
        properties: { name: { kind: JsonLdValueKind.Text as const, value: 'Alice original' } },
      }],
    };

    definitions.profiles.push({
      profileId: 'liveArticle',
      name: 'Live article',
      templateIds: [requestTemplate.key],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [
          {
            property: 'description',
            required: true,
            source: { kind: JsonLdSourceKind.Snippet, name: 'headline', path: ['label'] },
          },
          {
            property: 'author',
            required: true,
            source: { kind: JsonLdSourceKind.SharedObject, objectId: 'alice' },
          },
        ],
      }],
    });
    definitions.profiles[1] = {
      ...definitions.profiles[1]!,
      nodes: [...definitions.profiles[1]!.nodes, {
        role: 'event',
        type: 'Event',
        keySource: { kind: JsonLdSourceKind.Snippet, name: 'headline', path: ['sessionId'] },
        presenceSource: { kind: JsonLdSourceKind.Snippet, name: 'headline', path: ['present'] },
        mappings: [{
          property: 'name',
          required: true,
          source: { kind: JsonLdSourceKind.Snippet, name: 'headline', path: ['label'] },
        }],
      }],
    };
    const catalog = await save.execute({ siteId, expectedVersion: '0', ...definitions });
    const publish = local.get<IPublishCurrentPage>(PUBLISH_CURRENT_PAGE);

    await publish.execute({
      siteId, pageId: first.pageId, actorId: 'synthetic', templateId: template.key, path: '/first/',
    });
    await publish.execute({
      siteId, pageId: second.pageId, actorId: 'synthetic', templateId: template.key, path: '/second/',
    });
    await publish.execute({ siteId, pageId: live.pageId, actorId: 'synthetic', path: '/live/' });
    http = await createPublicHttpApplication({ mongoUri, database, ...rendering, host: '127.0.0.1', port: 0 });
    const address = http.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing HTTP port');
    }

    const get = (pathname: string): Promise<string> => new Promise((resolve, reject) => {
      const request = httpRequest({
        host: '127.0.0.1',
        port: address.port,
        path: pathname,
        headers: { Host: 'graph.test:39876' },
      }, (response) => {
        let content = '';

        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          content += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}: ${content}`));
          } else {
            resolve(content);
          }
        });
      });

      request.on('error', reject);
      request.end();
    });

    expect(await get('/first/')).toContain('Alice original');
    requestReads = 0;
    expect(await get('/live/')).toContain('Live prepared');
    expect(requestReads).toBe(1);
    const eventId = (html: string): unknown => {
      const json = /<script\b[^>]*\btype=["']?application\/ld\+json["']?[^>]*>(.*?)<\/script>/s.exec(html)?.[1];
      const parsed: { '@graph': Record<string, unknown>[] } = JSON.parse(json!);

      return parsed['@graph'].find((node) => node['@type'] === 'Event')?.['@id'];
    };
    const originalId = eventId(await get('/live/'));

    expect(originalId).toBeTruthy();
    sessionId = 'meeting-2';
    requestReads = 0;
    const nextId = eventId(await get('/live/'));

    expect(nextId).toBeTruthy();
    expect(nextId).not.toBe(originalId);
    expect(requestReads).toBe(1);
    present = false;
    requestReads = 0;
    expect(eventId(await get('/live/'))).toBeUndefined();
    expect(requestReads).toBe(1);
    present = true;
    sessionId = 'meeting-1';
    expect(eventId(await get('/live/'))).toBe(originalId);
    const changed = await save.execute({
      ...definitions,
      siteId,
      expectedVersion: catalog.version,
      objects: [{
        ...definitions.objects[0]!,
        properties: { name: { kind: JsonLdValueKind.Text, value: 'Alice updated' } },
      }],
    });

    expect(await get('/first/')).toContain('Alice original');
    await local.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId, pageId: first.pageId, title: 'Private draft' });
    await publish.execute({ siteId, pageId: second.pageId, actorId: 'synthetic' });
    expect(await get('/first/')).toContain('Alice updated');
    expect(await get('/first/')).toContain('First published');
    expect(await get('/first/')).not.toContain('Private draft');
    const publishedInspection = local.get<IInspectJsonLd>(INSPECT_JSON_LD_PUBLISHED);
    const draftInspection = local.get<IInspectJsonLd>(INSPECT_JSON_LD_DRAFT);
    const inspectionInput = { siteId, pageId: first.pageId, actorId: 'synthetic' };
    const publishedGraph = await publishedInspection.execute(inspectionInput);
    const draftGraph = await draftInspection.execute(inspectionInput);

    expect(publishedGraph.jsonLd).toContain('First published');
    expect(publishedGraph.jsonLd).not.toContain('Private draft');
    expect(draftGraph.jsonLd).toContain('Private draft');
    requestReads = 0;
    const liveGraph = await publishedInspection.execute({ ...inspectionInput, pageId: live.pageId });

    expect(liveGraph.jsonLd).toContain('Live prepared');
    expect(requestReads).toBe(1);
    requestReads = 0;
    expect(await get('/live/')).toContain('Alice updated');
    expect(requestReads).toBe(1);
    const moved = await local.get<IChangePublishedPageUrl>(CHANGE_PUBLISHED_PAGE_URL).execute({
      siteId,
      actorId: 'synthetic',
      pageId: first.pageId,
      mark: 'MovedFirst',
      path: '/moved/',
      segment: 'moved',
      parentUrlId: null,
      redirectStatus: UrlRedirectStatus.HTTP_308,
    });

    expect(moved.publicationFailed).toBe(false);
    expect(await get('/second/')).toContain('http://graph.test:39876/moved/');
    expect(await get('/moved/')).toContain('First published');
    expect(await get('/moved/')).not.toContain('Private draft');
    await save.execute({ ...definitions, siteId, expectedVersion: changed.version, objects: [] });
    await expect(publish.execute({ siteId, pageId: live.pageId, actorId: 'synthetic' })).rejects.toThrow();
    expect(await get('/live/')).toContain('Alice updated');
  } finally {
    await http?.close();
    await local?.close();
    await connection.dropDatabase();
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
