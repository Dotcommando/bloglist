import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION,
} from '../../src/infra/publication/publication.tokens.js';
import { createProcessSupervisor } from '../../src/infra/resources/process-supervisor.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';

async function freePort(): Promise<number> {
  const probe = createServer();

  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP socket');
  }
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));

  return address.port;
}

const budget = {
  capacity: 3,
  infrastructureCpu: 0,
  cmsCpuBudget: 3,
  databasePlacement: DatabasePlacement.UnmanagedLocal,
};

it('serves two published sites on their database local origins without a proxy or custom Host header', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const database = 'zarya_test_local_http_' + randomUUID().replaceAll('-', '');

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/local-http-'));
  const settings = {
    mongoUri,
    database,
    host: '127.0.0.1',
    port: 0,
    sourcesRoot: path.join(root, 'sources'),
    artifactsRoot: path.join(root, 'artifacts'),
    dumpsRoot: path.join(root, 'dumps'),
  };
  const connection = await createConnection(mongoUri,
    {
      dbName: database,
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
  let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
  let application: Awaited<ReturnType<typeof createProcessSupervisor>> | undefined;
  const origins: string[] = [];

  try {
    await applyMigrations(connection, 'migrations');
    local = await createLocalApplication({
      ...settings,
      rendering: settings,
      operator: {
        operatorId: 'test',
        platformAdministrator: true,
      },
    });

    for (const mark of ['Alpha', 'Beta']) {
      const origin = 'http://localhost:' + await freePort();

      origins.push(origin);
      const site = await local.get<ICreateSite>(CREATE_SITE).execute({
        mark,
        name: mark,
        primaryDomain: mark.toLowerCase() + '.test',
        languages: ['en'],
        defaultLanguage: 'en',
        onboarding: { localAddress: origin, originMode: SiteOriginMode.Local },
      });
      const page = await local.get<ICreatePage>(CREATE_PAGE).execute({
        siteId: site.siteId,
        mark: mark + 'Probe',
        language: 'en',
        title: mark,
      });

      await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
        siteId: site.siteId,
        pageId: page.pageId,
        actorId: 'test',
        rendering: {
          templateId: 'ZaryaBasic',
          delivery: HtmlDelivery.Request,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      });
      await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
        siteId: site.siteId,
        pageId: page.pageId,
        mark: mark + 'ProbeUrl',
        parentUrlId: null,
        segment: 'probe',
        path: '/probe/',
      });
      await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
      const active = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site.siteId);

      await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
        siteId: site.siteId,
        actorId: 'test',
        expectedActiveReleaseId: active?.releaseId ?? null,
      });
    }
    await local.close();
    local = undefined;
    application = await createProcessSupervisor(settings, budget);
    expect(application.startupSites.every(site => site.localListenerReady)).toBe(true);

    for (let index = 0; index < origins.length; index++) {
      const response = await fetch(origins[index] + '/probe/');

      expect(response.status).toBe(200);
      expect(await response.text()).toContain(index === 0 ? 'Alpha' : 'Beta');
      const missing = await fetch(origins[index] + '/missing');

      expect(missing.status).toBe(404);
      await missing.arrayBuffer();
    }
    await application.close();
    application = undefined;

    for (const origin of origins) {
      await expect(fetch(origin + '/probe/')).rejects.toThrow();
    }
  } finally {
    const closed = await Promise.allSettled([application?.close(), local?.close()]);

    try {
      expect(database).toMatch(/^zarya_test_local_http_/);
      await connection.dropDatabase();
    } finally {
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }

    expect(closed.filter(result => result.status === 'rejected')).toEqual([]);
  }
}, 120000);

it('cancels startup without a listening socket or ready state when MongoDB is unavailable', async () => {
  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/local-http-no-db-'));
  const port = await freePort();
  const mongoPort = await freePort();

  try {
    await expect(createProcessSupervisor({
      mongoUri: `mongodb://127.0.0.1:${mongoPort}/?serverSelectionTimeoutMS=200&connectTimeoutMS=200`,
      database: 'zarya_test_unavailable',
      host: '127.0.0.1',
      port,
      dumpsRoot: root,
      artifactsRoot: path.join(root, 'artifacts'),
    }, budget)).rejects.toThrow();
    await expect(fetch('http://127.0.0.1:' + port + '/api/health')).rejects.toThrow();
    await expect(access(path.join(root, '.coordination/processes/supervisor.pid'))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
