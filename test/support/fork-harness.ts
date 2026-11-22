import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { Agent, createServer, request } from 'node:http';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { MongooseAdminUserStore } from
  '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import type { IManagedChild } from '../../src/adapters/outbound/runtime/processes/site-process-pool.js';
import { ScryptAdminPasswordAdapter } from
  '../../src/adapters/outbound/security/scrypt/admin-users/admin-password.adapter.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import { DatabasePlacement } from '../../src/domain/resources/site-process-allocation.js';
import { ADDON_PACKAGE_REGISTRY } from '../../src/infra/addons/addons.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import type { IPublicHttpSettings } from '../../src/infra/public-http.settings.js';
import { CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION } from
  '../../src/infra/publication/publication.tokens.js';
import { CREATE_RENDERING_ELEMENT } from '../../src/infra/rendering/rendering.tokens.js';
import { createProcessSupervisor, type IProcessSupervisorSettings } from
  '../../src/infra/resources/process-supervisor.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { ICreateRenderingElement } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { account } from './admin-users.js';
import { siteInput } from './sites.js';

export interface IForkReply {
  status: number;
  body: string;
  worker: string | undefined;
}

export interface IForkHarness {
  root: string;
  origin: string;
  settings: IPublicHttpSettings;
  budget: IProcessSupervisorSettings & { workerRunner: URL };
  connection: Awaited<ReturnType<typeof createConnection>>;
  local: Awaited<ReturnType<typeof createLocalApplication>>;
  supervisor: Awaited<ReturnType<typeof createProcessSupervisor>>;
  sites: { siteId: string; pageId: string; releaseId: string; host: string }[];
  read(host: string, url?: string, port?: number): Promise<IForkReply>;
  close(): Promise<void>;
}

export async function forkHarness(
  options: { admin?: boolean;
    listenPort?: number;
    workerRunner?: URL;
    delivery?: HtmlDelivery;
    adminRoot?: string;
    runtimePackages?: readonly string[];
    resourceSocket?: string;
    resourceSecret?: string;
    prepare?: (local: IForkHarness['local'], sites: IForkHarness['sites']) => Promise<void> } = {},
): Promise<IForkHarness> {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }
  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/fork-faults-'));
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let port = options.listenPort ?? 0;

  if (options.admin && options.listenPort === undefined) {
    const listener = createServer();

    await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const address = listener.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing test listener');
    }
    port = address.port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }

  const origin = `http://127.0.0.1:${port}`;
  const settings = {
    mongoUri,
    database,
    sourcesRoot: path.join(root, 'sites'),
    artifactsRoot: path.join(root, 'artifacts'),
    dumpsRoot: path.join(root, 'coordination'),
    host: '127.0.0.1',
    port,
    ...(options.admin ? { adminAuth: { origin } } : {}),
    ...(options.adminRoot ? { adminRoot: options.adminRoot } : {}),
  };
  const connection = await createConnection(mongoUri, {
    dbName: database, autoIndex: false, autoCreate: false,
  }).asPromise();
  let local: Awaited<ReturnType<typeof createLocalApplication>> | undefined;
  let supervisor: Awaited<ReturnType<typeof createProcessSupervisor>> | undefined;
  const agent = new Agent({ keepAlive: true, maxSockets: 8 });
  const sites: { siteId: string; pageId: string; releaseId: string; host: string }[] = [];
  const budget = {
    capacity: 6,
    infrastructureCpu: 0,
    ...(options.resourceSocket ? {
      resourceSocket: options.resourceSocket, resourceSecret: options.resourceSecret!,
    } : {}),
    databasePlacement: DatabasePlacement.ManagedLocal,
    workerRunner: options.workerRunner ?? new URL('../fixtures/resilient-site-worker.mjs', import.meta.url),
  };
  const close = async (): Promise<void> => {
    agent.destroy();

    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Refusing to remove a non-test database');
    }

    try {
      await supervisor?.close();
    } finally {
      await local?.close();

      await connection.dropDatabase();
      await connection.close();
      await rm(root, { recursive: true, force: true });
    }
  };

  try {
    await applyMigrations(connection, 'migrations');
    local = await createLocalApplication({
      ...settings,
      operator: { operatorId: 'test', platformAdministrator: true },
      rendering: settings,
      backgroundWork: false,
    });

    for (const directory of options.runtimePackages ?? []) {
      await local.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).install(directory);
    }

    for (const mark of ['One', 'Two']) {
      const site = await local.get<ICreateSite>(CREATE_SITE).execute({
        ...siteInput(), mark, primaryDomain: mark.toLowerCase() + '.test',
      });
      const primary = await local.get<ICreatePage>(CREATE_PAGE).execute({
        siteId: site.siteId, mark: 'Home', language: 'en', title: mark + ' old',
      });
      const secondary = await local.get<ICreatePage>(CREATE_PAGE).execute({
        siteId: site.siteId, mark: 'Other', language: 'en', title: mark + ' second',
      });
      const template = await local.get<ICreateRenderingElement>(CREATE_RENDERING_ELEMENT).execute({
        siteId: site.siteId,
        kind: TemplateSourceKind.Template,
        name: 'Fork probe',
        html: '<!doctype html><html><head><title>[[*title]]</title></head><body><h1>[[*title]]</h1></body></html>',
        css: 'body { color: #264f3d; }',
        browserTypeScript: null,
        parameters: [],
      });

      for (const page of [primary, secondary]) {
        await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
          siteId: site.siteId,
          pageId: page.pageId,
          actorId: 'test',
          rendering: {
            templateId: template.key,
            delivery: options.delivery ?? HtmlDelivery.Request,
            interaction: BrowserInteraction.None,
            parameters: {},
            loaders: [],
            ...(options.delivery !== HtmlDelivery.Static
              ? { requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 } } : {}),
          },
        });
        await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
          siteId: site.siteId,
          pageId: page.pageId,
          mark: mark + (page === primary ? 'HomeUrl' : 'OtherUrl'),
          parentUrlId: null,
          segment: page === primary ? 'probe' : 'second',
          path: page === primary ? '/probe/' : '/second/',
        });
        await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: page.pageId });
      }
      const page = primary;
      const active = await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
        siteId: site.siteId,
        actorId: 'test',
        expectedActiveReleaseId:
          (await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(site.siteId))?.releaseId ?? null,
      });

      sites.push({
        siteId: site.siteId, pageId: page.pageId, releaseId: active.releaseId, host: mark.toLowerCase() + '.test',
      });
    }

    if (options.admin) {
      const passwordDigest = await new ScryptAdminPasswordAdapter().hash('synthetic fork password');

      await new MongooseAdminUserStore(connection).run(async (work) => {
        await work.save(new AdminUser({ ...account().toState(), passwordDigest }), null);
      });
    }
    await options.prepare?.(local, sites);
    supervisor = await createProcessSupervisor(settings, budget);
    const read = (host: string, url = '/probe/', port?: number): Promise<{
      status: number; body: string; worker: string | undefined;
    }> => new Promise((resolve, reject) => {
      const address = supervisor!.server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Missing test listener'));

        return;
      }

      const req = request({
        host: '127.0.0.1', port: port ?? address.port, path: url, headers: { Host: host }, agent,
      }, (response) => {
        const parts: Buffer[] = [];

        response.on('data', (chunk: Buffer) => parts.push(chunk));
        response.once('error', reject);
        response.once('end', () => resolve({
          status: response.statusCode!,
          body: Buffer.concat(parts).toString(),
          worker: typeof response.headers['x-test-worker'] === 'string' ? response.headers['x-test-worker'] : undefined,
        }));
      });

      req.once('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('Test HTTP deadline')));
      req.end();
    });

    return { root, settings, budget, connection, local, supervisor, sites, read, close, origin };
  } catch (error) {
    await close();
    throw error;
  }
}

export function workerMessage(child: IManagedChild, kind: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: Record<string, unknown>): void => {
      clearTimeout(timer);
      child.off('message', message);
      child.off('exit', exit);

      if (error) {
        reject(error);
      } else {
        resolve(value!);
      }
    };
    const message = (value: Record<string, unknown>): void => {
      if (value.kind === kind) {
        finish(undefined, value);
      }
    };
    const exit = (): void => finish(new Error('Worker exited before ' + kind));
    const timer = setTimeout(() => finish(new Error('Missing worker message: ' + kind)), 15000);

    child.on('message', message);
    child.once('exit', exit);
  });
}
