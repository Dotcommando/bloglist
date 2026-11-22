import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { request, type Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { type Connection, createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { SnippetExecution } from '../../src/domain/rendering/snippet.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION,
} from '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT, SNIPPET_WORKER_POOL } from '../../src/infra/rendering/rendering.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { ISnippet } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { siteInput } from '../support/sites.js';

async function dropTestDatabase(connection: Connection, database: string): Promise<void> {
  if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
    throw new Error('Unsafe test database');
  }
  await connection.dropDatabase();
}

it('serves frozen Request Snippets with isolated realms and per-request metrics', async () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated test MongoDB required');
  }

  const connection = await createConnection(mongoUri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();
  const root = await mkdtemp(path.resolve('.tmp/snippet-pool-'));
  let local: INestApplicationContext | undefined;
  let http: INestApplication<Server> | undefined;

  try {
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    let count = 0;
    let release!: () => void;
    let barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reads: string[] = [];
    const loaders: ISnippet[] = ['ReadA', 'ReadB'].map((id) => ({
      id,
      execution: SnippetExecution.ParallelRead,
      phases: [LoaderPhase.Request],
      parameters: [],
      output: { name: 'result', kind: ParameterKind.String, required: true },
      read: async () => {
        reads.push(id);
        const waiting = barrier;

        if (++count % 2 === 0) {
          release();
          barrier = new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        await waiting;

        return id;
      },
    }));
    const rendering = { sourcesRoot: path.join(root, 'sites'), artifactsRoot: path.join(root, 'artifacts'), loaders };

    local = await createLocalApplication({
      mongoUri, database, rendering, operator: { operatorId: 'pool-test', platformAdministrator: true },
    });
    const site = await local.get<ICreateSite>(CREATE_SITE).execute(siteInput());
    const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
      siteId: site.siteId, mark: 'PoolPage', language: 'en', title: 'Pool page',
    });
    const create = local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT);
    const snippet = await create.execute({
      siteId: site.siteId,
      kind: TemplateSourceKind.Snippet,
      name: 'Pool read',
      html: '',
      css: '',
      browserTypeScript: null,
      parameters: [],
      snippet: {
        execution: SnippetExecution.ParallelRead,
        code: 'globalThis.visits = (globalThis.visits ?? 0) + 1; return "isolated:" + globalThis.visits;',
        phases: [LoaderPhase.Request],
        output: { name: 'result', kind: ParameterKind.String, required: true },
      },
    });
    const template = await create.execute({
      siteId: site.siteId,
      kind: TemplateSourceKind.Template,
      name: 'Pool template',
      html: '<!doctype html><html><head><title>Pool</title></head><body><main>'
        + `[[!${snippet.key}? &as=\`result\`]]<p>[[+result]]</p>`
        + '[[!ReadA? &as=`a`]][[!ReadB? &as=`b`]]<p>[[+a]][[+b]]</p></main></body></html>',
      css: '',
      browserTypeScript: null,
      parameters: [],
    });

    await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
      siteId: site.siteId,
      pageId: page.pageId,
      actorId: 'pool-test',
      rendering: {
        templateId: template.key,
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });
    await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
      siteId: site.siteId, pageId: page.pageId, mark: 'PoolUrl', parentUrlId: null, segment: 'pool', path: '/pool/',
    });
    await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
    const active = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site.siteId);

    await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site.siteId, actorId: 'pool-test', expectedActiveReleaseId: active?.releaseId ?? null,
    });
    http = await createPublicHttpApplication({ mongoUri, database, ...rendering, host: '127.0.0.1', port: 0 });
    const address = http.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener');
    }

    const get = (method = 'GET', accept = 'text/html'): Promise<{
      status: number; body: string; cache: string | undefined;
    }> => new Promise((resolve, reject) => {
      const outgoing = request({
        host: '127.0.0.1',
        port: address.port,
        path: '/pool/',
        method,
        headers: { Host: 'example.test', Accept: accept },
      }, (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          cache: response.headers['cache-control'],
        }));
      });

      outgoing.once('error', reject);
      outgoing.end();
    });

    for (let index = 0; index < 3; index++) {
      expect(await get()).toMatchObject({
        status: 200, cache: 'no-store', body: expect.stringContaining('isolated:1'),
      });
    }
    expect(http.get<SnippetWorkerPool>(SNIPPET_WORKER_POOL).snapshot().created).toBe(1);
    expect(await get('HEAD')).toMatchObject({ status: 200, body: '', cache: 'no-store' });
    expect(await get('GET', 'text/markdown')).toMatchObject({
      status: 200, body: expect.stringContaining('isolated:1'),
    });
    expect(reads).toEqual(Array.from({ length: 5 }, () => ['ReadA', 'ReadB']).flat());
    await http.close();
    http = undefined;
    const records = await connection.collection('page_resolutions').find({ siteId: site.siteId }).toArray();

    expect(records).toHaveLength(5);

    for (const record of records) {
      expect(record['droppedStages']).toBe(0);
      expect(record['stages'].filter((stage: { stage: string }) => stage.stage === 'script')).toHaveLength(1);
      expect(record['stages'].filter((stage: { stage: string }) => stage.stage === 'worker-queue')).toHaveLength(1);
    }
    await verifyMigrations(connection, 'migrations');
  } finally {
    await http?.close();
    await local?.close();

    await dropTestDatabase(connection, database);
    await connection.close();
    await rm(root, { recursive: true, force: true });
  }
});
