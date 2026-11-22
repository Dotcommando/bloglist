import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { Agent, createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { applyTrustedEdgeProxy } from '../../adapters/inbound/gateway/http/edge-proxy.boundary.js';
import {
  type ILocalSiteListeners, startLocalSiteListeners,
} from '../../adapters/inbound/gateway/http/local-site-listeners.js';
import { proxyAdmittedProcessRequest, proxyProcessRequest } from '../../adapters/inbound/gateway/http/process-proxy.js';
import { AdminAddonUpdatesController } from '../../adapters/inbound/rest/addons/admin-addon-updates.controller.js';
import { allowsAdminEndpoint } from '../../adapters/inbound/rest/shared/admin-endpoint-authorization.js';
import { AdminHttpBoundary, HttpFailure } from '../../adapters/inbound/rest/shared/admin-http.boundary.js';
import {
  AdminCpuTelemetryController,
} from '../../adapters/inbound/websocket/resources/admin-cpu-telemetry.controller.js';
import { SessionAdminUserAccessAdapter }
  from '../../adapters/outbound/access/admin-users/session-admin-user-access.adapter.js';
import { recoverCaptureOperation } from '../../adapters/outbound/backup/files/dump-capture-lease.js';
import { SharedDumpMaintenance } from '../../adapters/outbound/backup/files/shared-dump-maintenance.js';
import type { ProcessDumpCaptureAdapter } from '../../adapters/outbound/backup/process/dump-capture.adapter.js';
import type { MongooseInstallationSettingsStore } from
  '../../adapters/outbound/persistence/mongoose/installation/installation-settings-store.adapter.js';
import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import type { GitHubAddonPackageDelivery }
  from '../../adapters/outbound/runtime/addons/github-addon-package-delivery.adapter.js';
import { LiveAddonUpdates } from '../../adapters/outbound/runtime/addons/live-addon-updates.adapter.js';
import { ProcessCalibrationLoad } from '../../adapters/outbound/runtime/calibration/calibration-load.adapter.js';
import { HelperCalibrationLoad } from '../../adapters/outbound/runtime/calibration/helper-calibration-load.adapter.js';
import {
  LocalContainerResourcesAdapter,
} from '../../adapters/outbound/runtime/docker/local-container-resources.adapter.js';
import { ControlResourcesBroker } from '../../adapters/outbound/runtime/processes/control-resources-process.js';
import {
  InstallationResourceRuntime,
} from '../../adapters/outbound/runtime/processes/installation-resource-runtime.js';
import { OsCpuCountersAdapter } from '../../adapters/outbound/runtime/processes/os-cpu-counters.adapter.js';
import { ProcessDumpCoordinator } from '../../adapters/outbound/runtime/processes/process-dump-coordinator.js';
import { SiteProcessPool } from '../../adapters/outbound/runtime/processes/site-process-pool.js';
import { CpuTelemetryService } from '../../app/services/resources/cpu-telemetry.service.js';
import { CheckAddonRepositoryUpdateUseCase }
  from '../../app/use-cases/addons/check-addon-repository-update.use-case.js';
import { GetAddonUpdateUseCase } from '../../app/use-cases/addons/get-addon-update.use-case.js';
import { PrepareAddonUpdateUseCase } from '../../app/use-cases/addons/prepare-addon-update.use-case.js';
import { UpdateAddonUseCase } from '../../app/use-cases/addons/update-addon.use-case.js';
import { InstallationProcessRole, InstallationProcessState } from '../../domain/resources/installation-process.js';
import type { DatabasePlacement } from '../../domain/resources/site-process-allocation.js';
import { servingSiteOrigin } from '../../domain/sites/site-addresses.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IResolveSite } from '../../ports/inbound/sites/resolve-site.port.js';
import type { IAddonInstallationStore } from '../../ports/outbound/addons/addon-installation-store.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { ADDON_INSTALLATION_STORE, ADDON_PACKAGE_DELIVERY } from '../addons/addon-installation.tokens.js';
import { ADDON_PACKAGE_REGISTRY } from '../addons/addons.tokens.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { DUMP_CHILD_CAPTURE, DUMP_MAINTENANCE } from '../dumps/dumps.tokens.js';
import { INSTALLATION_SETTINGS_STORE } from '../installation/installation.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { createPublicHttpApplication } from '../public-http.application.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { RESOLVE_SITE, SITE_REPOSITORY } from '../sites/sites.tokens.js';
import type { IHttpStartupSite } from './http-ready-message.js';

export interface IProcessSupervisorSettings {
  readonly capacity: number;
  readonly infrastructureCpu: number;
  readonly cmsCpuBudget?: number;
  readonly databasePlacement: DatabasePlacement;
  readonly resourceSocket?: string;
  readonly resourceSecret?: string;
  readonly workerRunner?: URL;
  readonly controlWorkerRunner?: URL;
}

export async function createProcessSupervisor(settings: IPublicHttpSettings, budget: IProcessSupervisorSettings):
Promise<{ readonly server: Server;
  readonly pool: SiteProcessPool;
  readonly startupSites: readonly IHttpStartupSite[];
  readonly resources: InstallationResourceRuntime;
  close(): Promise<void>;
  restartAddon(addonKey: string): Promise<readonly string[]> }> {
  const root = path.join(settings.dumpsRoot ?? path.resolve('dumps'), '.coordination', 'processes');

  await mkdir(root, { recursive: true, mode: 0o700 });
  const ownerPath = path.join(root, 'supervisor.pid');

  try {
    const old = Number(await readFile(ownerPath, 'utf8'));

    if (!Number.isSafeInteger(old) || old < 1) {
      throw new Error('Invalid previous supervisor identity');
    }

    try {
      process.kill(old, 0);
      throw new Error('Another CMS supervisor is running');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
        throw error;
      }
    }
    await rm(ownerPath);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
  const owner = await open(ownerPath, 'wx', 0o600);

  await owner.writeFile(String(process.pid));
  const maintenanceRoot = path.join(root, 'maintenance');

  SharedDumpMaintenance.recoverQuiescent(maintenanceRoot);
  const secret = randomBytes(32).toString('hex');
  const workerSettings = { ...settings, sharedMaintenanceRoot: maintenanceRoot, internalRequestSecret: secret };
  let runtime: InstallationResourceRuntime;
  let dumpCoordinator: ProcessDumpCoordinator | undefined;
  let application: INestApplication<Server> | null = null;
  let closing = false;
  let drainingCalibration = false;
  let telemetry: AdminCpuTelemetryController | null = null;
  let updatesController: AdminAddonUpdatesController | null = null;
  const pool = new SiteProcessPool((siteId, id, mongoPoolSize) => {
    if (closing && !drainingCalibration) {
      throw new Error('CMS coordinator is closing');
    }

    const child = fork(budget.workerRunner ?? new URL(import.meta.url.endsWith('.ts')
      ? '../../../dist/infra/resources/site-worker.js' : './site-worker.js', import.meta.url), [], {
      env: {
        ...process.env,
        ZARYA_PROCESS_BOOTSTRAP: JSON.stringify({ ...workerSettings, mongoPoolSize }),
        ZARYA_PROCESS_SITE: siteId,
      },
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    if (child.pid) {
      dumpCoordinator?.attach(siteId, id, child);
    }

    return child;
  });
  const controlBrokers = new Set<ControlResourcesBroker>();
  const controlCleanups = new Set<Promise<void>>();
  const controlFailures: unknown[] = [];
  const controlSite = '__control__';
  let controlSpawned = false;
  let rollingControl = false;
  const controlPool = new SiteProcessPool(() => {
    const standby = controlSpawned;

    controlSpawned = true;
    const child = fork(budget.controlWorkerRunner ?? new URL(import.meta.url.endsWith('.ts')
      ? '../../../dist/infra/resources/control-worker.js' : './control-worker.js', import.meta.url), [], {
      env: {
        ...process.env,
        ZARYA_PROCESS_BOOTSTRAP: JSON.stringify(workerSettings),
        ZARYA_CONTROL_HELPER: JSON.stringify({ socket: budget.resourceSocket, secret: budget.resourceSecret }),
        ZARYA_CONTROL_STANDBY: standby ? '1' : '0',
      },
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const broker = new ControlResourcesBroker(child, runtime);

    controlBrokers.add(broker);
    child.once('exit', () => {
      const cleanup = broker.close().then(() => {
        controlBrokers.delete(broker);
        controlCleanups.delete(cleanup);
      }, (error: unknown) => {
        controlFailures.push(error);
        controlBrokers.delete(broker);
        controlCleanups.delete(cleanup);
      });

      controlCleanups.add(cleanup);
    });
    child.on('message', (value: unknown) => {
      if (
        standby
        && !rollingControl
        && value
        && typeof value === 'object'
        && 'kind' in value
        && value.kind === 'ready'
        && child.connected
      ) {
        child.send({ kind: 'activate' }, (error) => {
          if (error) {
            child.kill('SIGTERM');
          }
        });
      }
    });

    return child;
  });

  async function restartAddon(addonKey: string): Promise<readonly string[]> {
    const forced: string[] = [];
    const sites = await application!.get<ISiteRepository>(SITE_REPOSITORY).findAll();

    for (const site of sites) {
      const result = await pool.restart(site.siteId, addonKey);

      forced.push(...result.forcedProcessIds);
    }
    rollingControl = true;

    try {
      const result = await controlPool.restart(controlSite, addonKey);

      forced.push(...result.forcedProcessIds);
      controlPool.select(controlSite).child.send({ kind: 'activate' });
      await Promise.all(controlCleanups);

      return forced;
    } finally {
      rollingControl = false;
    }
  }

  const proxyAgent = new Agent({ keepAlive: true });

  function proxyServingRequest(selectedPool: SiteProcessPool, siteId: string,
    request: IncomingMessage, response: ServerResponse): void {
    proxyAdmittedProcessRequest(request, response, () => selectedPool.acquire(siteId), secret, proxyAgent);
  }
  let localSites: ILocalSiteListeners | undefined;
  const server = createServer((request, response) => {
    const dispatch = async (): Promise<void> => {
      applyTrustedEdgeProxy(request, settings.edgeProxySecret);
      const target = request.url?.split('?')[0] ?? '';

      if (updatesController?.canHandle(target)) {
        await updatesController.handle(request, response);

        return;
      }

      const dump = /^\/api\/admin\/sites\/([A-Za-z0-9_-]+)\/dumps\/(?:installation\/)?create$/.exec(target);

      if (
        settings.adminAuth
        && !dump
        && /^\/api\/admin(?:\/|$)/.test(target)
        && !['/api/admin/auth/login', '/api/admin/auth/logout'].includes(target)
      ) {
        const store = application!.get<MongooseInstallationSettingsStore>(INSTALLATION_SETTINGS_STORE);
        const installation = await store.read();
        const boundary = new AdminHttpBoundary({
          origin: installation.adminOrigin,
          cookieVersion: () => installation.version,
        });

        try {
          boundary.check(request, response);
          await application!.get<IGetCurrentAdminUser>(GET_CURRENT_ADMIN_USER)
            .execute({ token: boundary.token(request) });
        } catch (error) {
          response.shouldKeepAlive = false;
          response.setHeader('Connection', 'close');
          boundary.failure(response, error);

          return;
        }
      }
      if (dump && settings.adminAuth) {
        const store = application!.get<MongooseInstallationSettingsStore>(INSTALLATION_SETTINGS_STORE);
        const installation = await store.read();
        const boundary = new AdminHttpBoundary({
          origin: installation.adminOrigin,
          cookieVersion: () => installation.version,
        });

        try {
          boundary.check(request, response);
          const { user } = await application!.get<IGetCurrentAdminUser>(GET_CURRENT_ADMIN_USER)
            .execute({ token: boundary.token(request) });

          if (!allowsAdminEndpoint(request.method ?? '', target, user.authorization)) {
            throw new HttpFailure(403, 'Archive permission required');
          }
        } catch (error) {
          response.shouldKeepAlive = false;
          response.setHeader('Connection', 'close');
          boundary.failure(response, error);

          return;
        }
        const sites = application!.get<ISiteRepository>(SITE_REPOSITORY);

        if (!await sites.findById(dump[1]!)) {
          response.writeHead(404, { 'Cache-Control': 'no-store' }).end();

          return;
        }
        await runtime.read((await sites.findAll()).map((entry) => entry.siteId));

        proxyServingRequest(pool, dump[1]!, request, response);

        return;
      }
      if (target === '/api/health' || /^\/(?:admin|api\/admin)(?:\/|$)/.test(target)) {
        const address = target === '/api/health' ? application!.getHttpServer().address()
          : { port: controlPool.select(controlSite).port };

        if (!address || typeof address === 'string') {
          throw new Error('Administrative control process unavailable');
        }
        if (target === '/api/health') {
          proxyProcessRequest(request, response, address.port, secret, proxyAgent);
        } else {
          proxyServingRequest(controlPool, controlSite, request, response);
        }

        return;
      }
      if (request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host').length !== 1) {
        response.writeHead(400).end();

        return;
      }

      const authority = request.headers.host ?? '';

      if (!authority || /[\s,@/\\?#]/.test(authority)) {
        response.writeHead(400).end();

        return;
      }

      const url = new URL('http://' + authority);
      const site = await application!.get<IResolveSite>(RESOLVE_SITE)
        .execute({ hostname: url.hostname, authority: url.host });

      if (!site) {
        response.writeHead(404, { 'Cache-Control': 'no-store' }).end();

        return;
      }
      if (!pool.running(site.siteId)) {
        const sites = await application!.get<ISiteRepository>(SITE_REPOSITORY).findAll();

        await runtime.read(sites.map((entry) => entry.siteId));
      }
      proxyServingRequest(pool, site.siteId, request, response);
    };

    void dispatch().catch(() => {
      if (!response.headersSent) {
        response.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '5' });
      }
      response.end();
    });
  });

  async function close(): Promise<void> {
    if (closing) {
      return;
    }
    closing = true;

    drainingCalibration = true;
    await updatesController?.drain();
    controlPool.beginShutdown();
    const calibrationResults = await Promise.allSettled([controlPool.close()]);
    const controlCleanup = await Promise.allSettled([...controlBrokers].map((broker) => broker.close()));

    await Promise.all(controlCleanups);

    for (const result of controlCleanup) {
      if (result.status === 'rejected') {
        controlFailures.push(result.reason);
      }
    }

    drainingCalibration = false;
    pool.beginShutdown();
    telemetry?.close();
    localSites?.beginShutdown();
    server.close();
    server.closeIdleConnections();

    try {
      const captureResults = await Promise.allSettled([dumpCoordinator?.drain()]);
      const servingResults = await Promise.allSettled([pool.close()]);
      const results = await Promise.allSettled([dumpCoordinator?.close(), application?.close(), localSites?.close()]);
      const failures = [...calibrationResults, ...captureResults, ...servingResults, ...results]
        .filter((result) => result.status === 'rejected');

      if (failures.length || controlFailures.length) {
        throw new AggregateError([...controlFailures, ...failures.map((result) => result.reason)],
          'CMS process shutdown failed');
      }
    } finally {
      proxyAgent.destroy();
      await owner.close();
      await rm(ownerPath, { force: true });
    }
  }

  try {
    runtime = new InstallationResourceRuntime({
      ...budget,
      logicalCpuCount: os.cpus().length,
      root,
      databaseVersion: null,
      coordinatorPoolSize: settings.mongoPoolSize ?? 5,
    }, pool, budget.resourceSocket && budget.resourceSecret
      ? new LocalContainerResourcesAdapter(budget.resourceSocket, budget.resourceSecret) : undefined, {
      configure: (size) => pool.configureDatabasePoolSize(size),
      applied: (size) => pool.hasDatabasePoolSize(size),
    }, () => {
      const capture = settings.adminAuth
        ? application?.get<ProcessDumpCaptureAdapter>(DUMP_CHILD_CAPTURE).snapshot() : undefined;

      return [
        {
          pid: process.pid,
          role: InstallationProcessRole.Coordinator,
          siteId: null,
          state: InstallationProcessState.Ready,
        },
        ...controlPool.snapshot().map(worker => ({
          ...worker, role: InstallationProcessRole.Administration, siteId: null,
        })),
        ...pool.snapshot().map(worker => ({ ...worker, role: InstallationProcessRole.Site })),
        ...(capture?.pid ? [{
          pid: capture.pid,
          role: InstallationProcessRole.Dump,
          siteId: null,
          state: InstallationProcessState.Ready,
        }] : []),
      ];
    });
    application = await createPublicHttpApplication({
      ...workerSettings,
      host: '127.0.0.1',
      port: 0,
      installationResources: runtime,
      ...(settings.adminAuth ? {
        calibrationLoad: budget.resourceSocket && budget.resourceSecret
          ? new HelperCalibrationLoad(budget.resourceSocket, budget.resourceSecret)
          : new ProcessCalibrationLoad(() => {
            const address = server.address();

            if (!address || typeof address === 'string') {
              throw new Error('Calibration HTTP listener is unavailable');
            }

            return 'http://127.0.0.1:' + address.port;
          }),
      } : {}),
      coordinatorOnly: true,
      backgroundWork: false,
    });

    if (settings.adminAuth) {
      const store = application.get<MongooseInstallationSettingsStore>(INSTALLATION_SETTINGS_STORE);

      telemetry = new AdminCpuTelemetryController(new CpuTelemetryService(new OsCpuCountersAdapter()),
        application.get<IGetCurrentAdminUser>(GET_CURRENT_ADMIN_USER), async () => {
          const value = await store.read();

          return { origin: value.adminOrigin, cookieVersion: () => value.version };
        });
      server.on('upgrade', (request, socket, head) => {
        try {
          applyTrustedEdgeProxy(request, settings.edgeProxySecret);
          void telemetry!.upgrade(request, socket, head).catch(() => socket.destroy());
        } catch {
          socket.destroy();
        }
      });
    }
    if (settings.adminAuth) {
      const capture = application.get<ProcessDumpCaptureAdapter>(DUMP_CHILD_CAPTURE);

      dumpCoordinator = new ProcessDumpCoordinator(runtime,
        (pid, siteId, options, signal) => capture.captureForProcess(pid, siteId, options, signal),
        (pid) => application!.get<SharedDumpMaintenance>(DUMP_MAINTENANCE)
          .recoverCaptureOwner(pid, () => recoverCaptureOperation(settings.dumpsRoot ?? path.resolve('dumps'), pid)));
    }

    const connection = application.get<Connection>(MONGO_CONNECTION);

    if (settings.adminAuth) {
      const store = application.get<MongooseInstallationSettingsStore>(INSTALLATION_SETTINGS_STORE);
      const installation = await store.read();
      const packages = application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);
      const updates = new LiveAddonUpdates(path.join(settings.dumpsRoot ?? path.resolve('dumps'), '.installed-addons'),
        connection, packages, restartAddon, () => runtime.beginAddonUpdate());
      const current = application.get<IGetCurrentAdminUser>(GET_CURRENT_ADMIN_USER);
      const addonInstallations = application.get<IAddonInstallationStore>(ADDON_INSTALLATION_STORE);
      const delivery = application.get<GitHubAddonPackageDelivery>(ADDON_PACKAGE_DELIVERY);

      updatesController = new AdminAddonUpdatesController({
        origin: installation.adminOrigin, cookieVersion: () => installation.version,
      }, token => {
        const access = new SessionAdminUserAccessAdapter(current, token);

        return {
          actorId: (actionId) => access.actorId(actionId),
          checkRepository: new CheckAddonRepositoryUpdateUseCase(access, addonInstallations, {
            prepareLatest: (repositoryUrl, addonKey) => delivery.prepareUpdate(repositoryUrl,
              directory => updates.prepare(directory, addonKey)),
          }),
          prepare: new PrepareAddonUpdateUseCase(access, updates),
          apply: new UpdateAddonUseCase(access, updates),
          read: new GetAddonUpdateUseCase(access, updates),
        };
      });
    }

    const build: unknown = await connection.db!.command({ buildInfo: 1 });

    if (build && typeof build === 'object' && 'version' in build && typeof build.version === 'string') {
      runtime.setDatabaseVersion(build.version);
    }

    const sites = await application.get<ISiteRepository>(SITE_REPOSITORY).findAll();

    await runtime.read(sites.map((site) => site.siteId));

    await controlPool.configureDatabasePoolSize(settings.mongoPoolSize ?? 5);
    await controlPool.resize(controlSite, 1);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(settings.port, settings.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    const local = await startLocalSiteListeners(server, sites.map(site => site.toState()));

    localSites = local;

    return {
      server,
      pool,
      resources: runtime,
      startupSites: sites.map(site => {
        const origin = servingSiteOrigin(site.toState().addresses);

        return {
          siteId: site.siteId,
          name: site.name,
          origin,
          localListenerReady: origin !== null && local.origins.includes(origin),
        };
      }),
      close,
      restartAddon,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
