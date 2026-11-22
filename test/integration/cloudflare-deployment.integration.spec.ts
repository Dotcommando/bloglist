import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';

import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Connection, createConnection } from 'mongoose';

import type { ICloudflareRouting } from '../../src/adapters/inbound/gateway/cloudflare/worker.js';
import { createCloudflareWorker } from '../../src/adapters/inbound/gateway/cloudflare/worker.js';
import {
  CloudflareDeliveryAdapter,
} from '../../src/adapters/outbound/deployment/cloudflare/cloudflare-delivery.adapter.js';
import { assetBinary } from '../../src/adapters/outbound/media/sharp/asset-bytes.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { DeploymentOutcome, IDeploymentAttempt } from '../../src/domain/deployment/deployment.js';
import { DeploymentOutcomeKind } from '../../src/domain/deployment/deployment.js';
import { ImageUploadMode } from '../../src/domain/media/file-library.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { AppModule } from '../../src/infra/app.module.js';
import {
  CONFIGURE_DEPLOYMENT_TARGET, DEPLOYMENT_PROVIDER_RESOLVER,
  DEPLOYMENT_WORKER_SOURCE, GET_DEPLOYMENT_STATUS, PREPARE_SITE_DEPLOYMENT,
  PROCESS_DEPLOYMENT_TARGETS,
} from '../../src/infra/deployment/deployment.tokens.js';
import { createLocalApplication } from '../../src/infra/local-application.js';
import { FILE_LIBRARY_OPERATIONS } from '../../src/infra/media/media.tokens.js';
import { CREATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { createPublicHttpApplication } from '../../src/infra/public-http.application.js';
import { PUBLISH_ROUTING_RELEASE } from '../../src/infra/publication/publication.tokens.js';
import {
  CONFIGURE_PAGE_RENDERING, PUBLISH_PAGE, PUBLISH_SITE_RELEASE, RELEASE_ACTIVATION,
} from '../../src/infra/publication/publication.tokens.js';
import { ASSIGN_INITIAL_PAGE_URL } from '../../src/infra/routing/routing.tokens.js';
import { CREATE_SITE } from '../../src/infra/sites/sites.tokens.js';
import type {
  IConfigureDeploymentTarget, IGetDeploymentStatus, IProcessDeploymentTargets,
} from '../../src/ports/inbound/deployment/deployment.port.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';
import type { IConfigurePageRendering } from '../../src/ports/inbound/pages/configure-page-rendering.port.js';
import type { ICreatePage } from '../../src/ports/inbound/pages/create-page.port.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IPrepareSiteDeployment } from '../../src/ports/inbound/publication/prepare-site-deployment.port.js';
import type { IPublishRoutingRelease } from '../../src/ports/inbound/publication/publish-routing-release.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import type { IAssignInitialPageUrl } from '../../src/ports/inbound/routing/assign-initial-page-url.port.js';
import type { ICreateSite } from '../../src/ports/inbound/sites/create-site.port.js';
import type { ISnippet } from '../../src/ports/outbound/publication/data-loader.port.js';
import type { IReleaseActivationPort } from '../../src/ports/outbound/publication/release-activation.port.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';
import { binary } from '../support/media.js';
import { siteInput } from '../support/sites.js';

describe('Cloudflare preparation with isolated CMS storage and an ephemeral origin', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let root = '';
  let connection: Connection | undefined;
  let local: INestApplicationContext | undefined;
  let exporter: INestApplicationContext | undefined;
  let origin: INestApplication<Server> | undefined;

  afterAll(async () => {
    await origin?.close();
    await exporter?.close();
    await local?.close();

    if (connection) {
      if (connection.name !== database || !/^zarya_test_[0-9a-f]{32}$/.test(database)) {
        throw new Error('Unsafe test database cleanup');
      }
      await connection.dropDatabase();
      await connection.close();
    }
    if (root.startsWith(path.resolve('.tmp') + path.sep)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('exports a complete fixed tree and keeps Request reads live behind the authenticated proxy', async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated test MongoDB URI required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await mkdir('.tmp', { recursive: true });
    root = await mkdtemp(path.resolve('.tmp/cloudflare-'));
    const sourcesRoot = path.join(root, 'sites');
    const artifactsRoot = path.join(root, 'artifacts');
    const media = { root: path.join(root, 'media'), publicBaseUrl: '/assets' };
    const actorId = 'publisher';
    let buildReads = 0;
    let requestReads = 0;
    const loaders: readonly ISnippet[] = [{
      id: 'BuildLabel',
      parameters: [],
      phases: [LoaderPhase.Build],
      output: { name: 'result', kind: ParameterKind.String, required: true },
      read: async () => {
        buildReads++;

        return 'Frozen';
      },
    }, {
      id: 'LiveLabel',
      parameters: [],
      phases: [LoaderPhase.Request],
      output: { name: 'result', kind: ParameterKind.String, required: true },
      read: async () => {
        requestReads++;

        return 'Live ' + requestReads;
      },
    }];
    const settings = {
      mongoUri,
      database,
      operator: { operatorId: actorId, platformAdministrator: true as const },
      rendering: { sourcesRoot, artifactsRoot, loaders },
      media,
    };

    local = await createLocalApplication(settings);
    const siteId = (await local.get<ICreateSite>(CREATE_SITE).execute(siteInput())).siteId;
    const templates = path.join(sourcesRoot, 'demo/templates');

    await mkdir(path.join(templates, 'Home'), { recursive: true });
    await mkdir(path.join(templates, 'Live'), { recursive: true });
    await writeFile(path.join(sourcesRoot, 'demo/site.config.ts'),
      'export default ' + JSON.stringify({ siteId, requestParameters: [] }));
    await writeFile(path.join(templates, 'Home/index.html'),
      '<!doctype html><html><head></head><body>[[BuildLabel? &as=`built`]][[+built]]</body></html>');
    await writeFile(path.join(templates, 'Live/index.html'),
      '<!doctype html><html><head></head><body>[[!LiveLabel? &as=`live`]][[+live]]</body></html>');

    for (const page of [
      { mark: 'Home', templateId: 'Home', path: '/', delivery: HtmlDelivery.Static },
      { mark: 'Live', templateId: 'Live', path: '/schedule/', delivery: HtmlDelivery.Request },
    ]) {
      const created = await local.get<ICreatePage>(CREATE_PAGE).execute({
        siteId, mark: page.mark, title: page.mark, language: 'en',
      });

      await local.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING).execute({
        siteId,
        pageId: created.pageId,
        actorId,
        rendering: {
          templateId: page.templateId,
          delivery: page.delivery,
          interaction: BrowserInteraction.None,
          parameters: {},
          loaders: [],
        },
      });
      await local.get<IAssignInitialPageUrl>(ASSIGN_INITIAL_PAGE_URL).execute({
        siteId,
        pageId: created.pageId,
        mark: page.mark + 'Url',
        parentUrlId: null,
        path: page.path,
        segment: page.mark.toLowerCase(),
      });
      await local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId: created.pageId });
    }
    const initial = await local.get<IReleaseActivationPort>(RELEASE_ACTIVATION).getActive(siteId);

    await local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId, actorId, expectedActiveReleaseId: initial?.releaseId ?? null,
    });
    const library = local.get<IFileLibraryOperations>(FILE_LIBRARY_OPERATIONS);
    const catalog = await library.list.execute({ siteId });

    await library.upload.execute({
      siteId,
      expectedVersion: catalog.version,
      filename: 'public.json',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: binary('{"public":true}', 'application/json'),
    });
    const fontBytes = Buffer.alloc(48);

    fontBytes.write('wOF2');
    fontBytes.writeUInt32BE(0x00010000, 4);
    fontBytes.writeUInt32BE(fontBytes.length, 8);
    await library.upload.execute({
      siteId,
      expectedVersion: (await library.list.execute({ siteId })).version,
      filename: 'probe.woff2',
      folderId: null,
      mode: ImageUploadMode.Original,
      content: assetBinary(fontBytes, 'application/octet-stream'),
    });
    const frozenReads = buildReads;

    origin = await createPublicHttpApplication({
      mongoUri, database, host: '127.0.0.1', port: 0, artifactsRoot, loaders, media, edgeProxySecret: 'secret',
    });
    const address = origin.getHttpServer().address();

    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral origin listener');
    }

    const target = {
      outputRoot: path.join(root, 'deploy'),
      siteId,
      workerName: 'synthetic-site',
      publicOrigin: 'https://example.test',
      backendOrigin: 'http://127.0.0.1:' + address.port,
      mediaPath: '/assets',
    };

    exporter = await Test.createTestingModule({
      imports: [AppModule.forSiteDeployment(settings, target)],
    }).overrideProvider(DEPLOYMENT_WORKER_SOURCE)
      .useValue(await readFile('dist/adapters/inbound/gateway/cloudflare/worker.js', 'utf8')).compile();
    const operation = exporter.get<IPrepareSiteDeployment>(PREPARE_SITE_DEPLOYMENT);
    const result = await operation.execute({ siteId, actorId });
    const routing: ICloudflareRouting = JSON.parse(await readFile(path.join(root, 'deploy/routing.json'), 'utf8'));
    const worker = createCloudflareWorker(routing);
    const env = {
      ZARYA_EDGE_PROXY_SECRET: 'secret',
      ASSETS: {
        fetch: async (request: Request): Promise<Response> => {
          const pathname = new URL(request.url).pathname;
          const filename = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));

          try {
            return new Response(new Uint8Array(await readFile(path.join(result.directory, filename))));
          } catch {
            return new Response(null, { status: 404 });
          }
        },
      },
    };

    expect(await (await worker.fetch(new Request('https://example.test/'), env)).text()).toContain('Frozen');
    expect(await readFile(path.join(result.directory, 'assets/files/public.json'), 'utf8')).toBe('{"public":true}');
    expect((await readFile(path.join(result.directory, 'assets/files/probe.woff2'))).equals(fontBytes)).toBe(true);
    await expect(readFile(path.join(result.directory, '.private'))).rejects.toThrow();
    await expect(readFile(path.join(result.directory, 'schedule/index.html'))).rejects.toThrow();

    for (let index = 1; index <= 2; index++) {
      const response = await worker.fetch(new Request('https://example.test/schedule/'), env);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).toContain('Live ' + index);
    }
    expect(buildReads).toBe(frozenReads);
    const probeAttempt: IDeploymentAttempt = {
      attemptId: 'request-probe',
      target: {
        ...deploymentFixture(siteId).target,
        providerKey: 'cloudflare',
        destinationName: target.workerName,
        publicOrigin: target.publicOrigin,
        backendOrigin: target.backendOrigin,
      },
      publication: { releaseId: result.releaseId, generation: 'probe-generation' },
      startedAt: new Date('2026-01-01T00:00:00Z'),
      ownershipUntil: new Date('2026-01-01T01:00:00Z'),
    };
    const probeProvider = new CloudflareDeliveryAdapter({
      accountId: 'a'.repeat(32), apiToken: 'secret',
    }, async () => {
      throw new Error('Reconciliation must not prepare');
    },
    async () => {
      throw new Error('Reconciliation must not upload');
    }, async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      if (url.hostname === 'api.cloudflare.com') {
        return Response.json({
          success: true,
          result: url.pathname.endsWith('/deployments')
            ? { deployments: [{ versions: [{ version_id: 'synthetic-probe', percentage: 100 }] }] }
            : [{ hostname: 'example.test', service: target.workerName, environment: 'production' }],
        });
      }

      // Probe the actual Request renderer with its empty query contract.
      const response = await worker.fetch(new Request('https://example.test/schedule/' + url.search, {
        method: 'HEAD',
      }), env);

      return new Response(null, {
        status: response.status,
        headers: { 'X-Zarya-Deployment': probeAttempt.attemptId + ':' + result.releaseId },
      });
    });

    await expect(probeProvider.reconcile(probeAttempt)).resolves.toMatchObject({
      kind: DeploymentOutcomeKind.Confirmed, releaseId: result.releaseId,
    });
    expect((await worker.fetch(new Request('https://example.test/unknown/'), env)).status).toBe(404);
    expect((await fetch(target.backendOrigin + '/schedule/', {
      headers: { 'x-zarya-public-host': 'example.test', 'x-zarya-proxy-secret': 'forged' },
    })).status).toBe(403);
    await writeFile(path.join(result.directory, 'obsolete.html'), 'obsolete');
    expect((await operation.execute({ siteId, actorId })).directory).toBe(result.directory);
    await expect(readFile(path.join(result.directory, 'obsolete.html'))).rejects.toThrow();
    await exporter.get<IConfigureDeploymentTarget>(CONFIGURE_DEPLOYMENT_TARGET).execute({
      siteId,
      actorId,
      expectedVersion: null,
      enabled: true,
      providerKey: 'cloudflare',
      destinationName: target.workerName,
      publicOrigin: target.publicOrigin,
      backendOrigin: target.backendOrigin,
    });
    const provider = {
      key: 'cloudflare',
      check: vi.fn(async () => []),
      deliver: vi.fn(async (attempt: IDeploymentAttempt): Promise<DeploymentOutcome> => ({
        kind: DeploymentOutcomeKind.Confirmed, releaseId: attempt.publication.releaseId, providerVersion: 'synthetic-1',
      })),
      reconcile: vi.fn(async (attempt: IDeploymentAttempt): Promise<DeploymentOutcome> => ({
        kind: DeploymentOutcomeKind.Confirmed, releaseId: attempt.publication.releaseId, providerVersion: 'synthetic-1',
      })),
    };
    const executorModule = AppModule.forDeploymentExecutor(settings, {
      accountId: 'a'.repeat(32), apiToken: 'secret', proxySecret: 'secret', outputRoot: path.join(root, 'executor'),
    });
    const startExecutor = async (): Promise<INestApplicationContext> => Test.createTestingModule({
      imports: [executorModule],
    }).overrideProvider(DEPLOYMENT_PROVIDER_RESOLVER).useValue({ resolve: () => provider }).compile();
    let executor = await startExecutor();

    try {
      await executor.get<IProcessDeploymentTargets>(PROCESS_DEPLOYMENT_TARGETS).execute();
      const status = exporter.get<IGetDeploymentStatus>(GET_DEPLOYMENT_STATUS);
      const initialDelivery = await status.execute({ siteId, actorId });

      expect(initialDelivery).toMatchObject({ state: 'Succeeded', delivered: { releaseId: result.releaseId } });
      await executor.get<IProcessDeploymentTargets>(PROCESS_DEPLOYMENT_TARGETS).execute();
      expect(provider.deliver).toHaveBeenCalledTimes(1);
      const routed = await local.get<IPublishRoutingRelease>(PUBLISH_ROUTING_RELEASE).execute({ siteId, actorId });

      expect(routed!.releaseId).not.toBe(result.releaseId);
      provider.deliver.mockResolvedValueOnce({ kind: DeploymentOutcomeKind.Unknown });
      await executor.get<IProcessDeploymentTargets>(PROCESS_DEPLOYMENT_TARGETS).execute();
      expect((await status.execute({ siteId, actorId })).state).toBe('OutcomeUnknown');
      await executor.close();
      executor = await startExecutor();
      await executor.get<IProcessDeploymentTargets>(PROCESS_DEPLOYMENT_TARGETS).execute();
      expect((await status.execute({ siteId, actorId }))).toMatchObject({
        state: 'Succeeded', delivered: { releaseId: routed!.releaseId },
      });
      expect(provider.deliver).toHaveBeenCalledTimes(2);
      expect(provider.reconcile).toHaveBeenCalledTimes(1);
    } finally {
      await executor.close();
    }
  }, 30000);
});
