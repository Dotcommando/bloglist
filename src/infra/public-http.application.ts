import 'reflect-metadata';

import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AdminDocumentController } from '../adapters/inbound/documents/http/admin/admin-document.controller.js';
import { PublicMediaController } from '../adapters/inbound/documents/http/media/public-media.controller.js';
import { PageResolutionObserver } from '../adapters/inbound/documents/http/publication/page-resolution-observer.js';
import { PublicDocumentController } from '../adapters/inbound/documents/http/publication/public-document.controller.js';
import { AdminPreviewController } from '../adapters/inbound/documents/http/rendering/admin-preview.controller.js';
import { applyTrustedEdgeProxy } from '../adapters/inbound/gateway/http/edge-proxy.boundary.js';
import { AdminAddonInstallationsController }
  from '../adapters/inbound/rest/addons/admin-addon-installations.controller.js';
import { AdminAddonRuntimeController } from '../adapters/inbound/rest/addons/admin-addon-runtime.controller.js';
import { AdminAddonsController } from '../adapters/inbound/rest/addons/admin-addons.controller.js';
import { AdminAuthController } from '../adapters/inbound/rest/admin-auth/admin-auth.controller.js';
import { AdminUsersController } from '../adapters/inbound/rest/admin-users/admin-users.controller.js';
import {
  AdminSiteAuthorizationController,
} from '../adapters/inbound/rest/authorization/admin-site-authorization.controller.js';
import { AdminCalibrationController } from '../adapters/inbound/rest/calibration/admin-calibration.controller.js';
import { AdminContentController } from '../adapters/inbound/rest/content/admin-content.controller.js';
import { AdminDeploymentController } from '../adapters/inbound/rest/deployment/admin-deployment.controller.js';
import { PageResolutionController } from '../adapters/inbound/rest/diagnostics/page-resolution.controller.js';
import { AdminDumpsController } from '../adapters/inbound/rest/dumps/admin-dumps.controller.js';
import { AdminHooksController } from '../adapters/inbound/rest/hooks/admin-hooks.controller.js';
import {
  AdminInstallationSettingsController,
} from '../adapters/inbound/rest/installation/admin-installation-settings.controller.js';
import { InstallationAdminContext } from '../adapters/inbound/rest/installation/installation-admin-context.js';
import { AdminJsonLdController } from '../adapters/inbound/rest/json-ld/admin-json-ld.controller.js';
import { AdminFilesController } from '../adapters/inbound/rest/media/admin-files.controller.js';
import { AdminSiteFaviconController } from '../adapters/inbound/rest/media/admin-site-favicon.controller.js';
import { AdminPublicationController } from '../adapters/inbound/rest/publication/admin-publication.controller.js';
import { AdminRenderingController } from '../adapters/inbound/rest/rendering/admin-rendering.controller.js';
import { AdminResourcesController } from '../adapters/inbound/rest/resources/admin-resources.controller.js';
import { AdminRoutingController } from '../adapters/inbound/rest/routing/admin-routing.controller.js';
import { AdminRequestGate, requestUsesLegacyAddonGrant } from '../adapters/inbound/rest/shared/admin-request-gate.js';
import {
  AdminTemplateVariablesController,
} from '../adapters/inbound/rest/template-variables/admin-template-variables.controller.js';
import type { DumpMaintenance } from '../adapters/outbound/backup/files/dump-maintenance.js';
import { SharedDumpMaintenance } from '../adapters/outbound/backup/files/shared-dump-maintenance.js';
import type {
  MongooseInstallationSettingsStore,
} from '../adapters/outbound/persistence/mongoose/installation/installation-settings-store.adapter.js';
import type { AddonPackageRegistry } from '../adapters/outbound/runtime/addons/addon-package-registry.js';
import type { IGetCurrentAdminUser } from '../ports/inbound/admin-auth/get-current-admin-user.port.js';
import { ADDON_PACKAGE_REGISTRY } from './addons/addons.tokens.js';
import { GET_CURRENT_ADMIN_USER } from './admin-auth/admin-auth.tokens.js';
import { DUMP_MAINTENANCE } from './dumps/dumps.tokens.js';
import { INSTALLATION_SETTINGS_STORE } from './installation/installation.tokens.js';
import { PublicHttpModule } from './public-http.module.js';
import { type IPublicHttpSettings, validatePublicHttpSettings } from './public-http.settings.js';

export async function createPublicHttpApplication(input: IPublicHttpSettings): Promise<INestApplication<Server>> {
  let administration: InstallationAdminContext | null = null;
  const settings = validatePublicHttpSettings({
    ...input,
    ...(input.adminAuth ? {
      adminAuth: {
        ...input.adminAuth,
        currentOrigin: () => administration?.origin() ?? input.adminAuth!.origin,
        cookieVersion: () => administration!.cookieVersion(),
      },
    } : {}),
  });
  const application = await NestFactory.create<INestApplication<Server>>(PublicHttpModule.forHttp(settings),
    { logger: false, abortOnError: false, bodyParser: false });

  try {
    const resources = settings.adminAuth && settings.installationResources
      ? application.get(AdminResourcesController) : null;
    const calibration = settings.adminAuth && settings.installationResources
      ? application.get(AdminCalibrationController) : null;
    const installation = settings.adminAuth ? application.get(AdminInstallationSettingsController) : null;

    if (settings.adminAuth) {
      const store = application.get<MongooseInstallationSettingsStore>(INSTALLATION_SETTINGS_STORE);

      await store.initialize(settings.adminAuth.origin);
      administration = new InstallationAdminContext(() => store.read(), () => store.probeKey(),
        settings.adminAuth.origin, settings.adminRoot);
    }

    const controller = application.get(PublicDocumentController);
    const timing = settings.pageDiagnostics === false ? null : application.get(PageResolutionObserver);
    const packages = application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY);
    const runtimeAssets = settings.adminAuth ? application.get(AdminAddonRuntimeController) : null;
    const dumps = settings.adminAuth ? application.get(AdminDumpsController) : null;
    const maintenance = settings.adminAuth || settings.sharedMaintenanceRoot
      ? application.get<DumpMaintenance>(DUMP_MAINTENANCE) : null;
    const addons = settings.adminAuth ? application.get(AdminAddonsController) : null;
    const authorization = settings.adminAuth ? application.get(AdminSiteAuthorizationController) : null;
    const installations = settings.adminAuth ? application.get(AdminAddonInstallationsController) : null;
    const deployment = settings.adminAuth ? application.get(AdminDeploymentController) : null;
    const hooks = settings.adminAuth ? application.get(AdminHooksController) : null;
    const auth = settings.adminAuth ? application.get(AdminAuthController) : null;
    const users = settings.adminAuth ? application.get(AdminUsersController) : null;
    const resolutions = settings.adminAuth ? application.get(PageResolutionController) : null;
    const publication = settings.adminAuth ? application.get(AdminPublicationController) : null;
    const rendering = settings.adminAuth ? application.get(AdminRenderingController) : null;
    const templateVariables = settings.adminAuth ? application.get(AdminTemplateVariablesController) : null;
    const jsonLd = settings.adminAuth ? application.get(AdminJsonLdController) : null;
    const previews = settings.adminAuth ? application.get(AdminPreviewController) : null;
    const content = settings.adminAuth ? application.get(AdminContentController) : null;
    const routing = settings.adminAuth ? application.get(AdminRoutingController) : null;
    const favicon = settings.adminAuth && settings.media ? application.get(AdminSiteFaviconController) : null;
    const files = settings.adminAuth && settings.media ? application.get(AdminFilesController) : null;
    const media = settings.media ? application.get(PublicMediaController) : null;
    const gate = settings.adminAuth ? new AdminRequestGate(settings.adminAuth,
      application.get<IGetCurrentAdminUser>(GET_CURRENT_ADMIN_USER)) : null;
    const admin = settings.adminRoot && gate
      ? await AdminDocumentController.create(settings.adminRoot, () => administration!.origin(),
        () => administration!.previousOrigin(),
        (request, response) => gate.allowDocumentAsset(request, response)) : null;
    let packageGeneration: string | null = null;

    application.use(async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      if (
        settings.internalRequestSecret
        && request.headers['x-zarya-process-secret'] !== settings.internalRequestSecret
      ) {
        response.writeHead(403, { 'Cache-Control': 'no-store' }).end();

        return;
      }
      if (settings.internalRequestSecret && typeof request.headers['x-zarya-process-source'] === 'string') {
        Object.defineProperty(request.socket, 'remoteAddress', {
          value: request.headers['x-zarya-process-source'], configurable: true,
        });
      }
      delete request.headers['x-zarya-process-secret'];
      delete request.headers['x-zarya-process-source'];
      const rawHeaders: string[] = [];

      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        if (!['x-zarya-process-secret', 'x-zarya-process-source'].includes(request.rawHeaders[index]!.toLowerCase())) {
          rawHeaders.push(request.rawHeaders[index]!, request.rawHeaders[index + 1]!);
        }
      }
      request.rawHeaders = rawHeaders;
      timing?.arrive(request);

      try {
        applyTrustedEdgeProxy(request, settings.edgeProxySecret);
      } catch {
        response.writeHead(403, { 'Cache-Control': 'no-store' });
        response.end();

        return;
      }

      if (request.url === '/api/health' && ['GET', 'HEAD'].includes(request.method ?? '')) {
        response.writeHead(200, { 'Cache-Control': 'no-store' }).end();

        return;
      }

      const dispatch = async (): Promise<void> => {
        const pathname = request.url?.split('?')[0];
        const addonRoute = packages.actionRoute(request.method ?? '', pathname ?? '');

        if (addonRoute) {
          if (addonRoute.action.admission === 'admin') {
            if (!gate) {
              response.writeHead(404, { 'Cache-Control': 'no-store' }).end();

              return;
            }

            const access = await gate.allowAddon(request, response, addonRoute.siteId, addonRoute.action);

            if (!access) {
              return;
            }
            packages.bindRequest(request, addonRoute, access);
          }
          if (!await packages.actionCatalog.admitted(addonRoute.addonKey, addonRoute.digest, addonRoute.action)) {
            response.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '5' }).end();

            return;
          }
        } else if (gate && !await gate.allow(request, response, (path) => packages.legacyAdminHandler(path) !== null)) {
          return;
        }
        if (maintenance && !dumps?.canHandle(pathname ?? '')) {
          try {
            const release = maintenance.enter(request.method === 'GET' || request.method === 'HEAD');
            const finish = (): void => {
              try {
                release();
              } catch {
                console.error('Shared request admission cleanup failed; closing write admission');

                try {
                  maintenance.failClosed();
                } catch {
                  console.error('Shared maintenance storage is unavailable; recovery is required');
                }
              }
            };

            response.once('finish', finish);
            response.once('close', finish);
          } catch {
            response.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '5' });
            response.end();

            return;
          }
        }

        const generation = maintenance instanceof SharedDumpMaintenance ? maintenance.generation() : null;

        if (generation !== null && generation !== packageGeneration) {
          try {
            await packages.refresh();
            packageGeneration = generation;
          } catch {
            response.writeHead(503, { 'Cache-Control': 'no-store' }).end();

            return;
          }
        }

        const legacyAddon = requestUsesLegacyAddonGrant(request);
        const runtimeHandler = legacyAddon
          ? packages.legacyAdminHandler(pathname ?? '') : addonRoute?.handler ?? packages.handler(pathname ?? '');

        if (addonRoute) {
          await addonRoute.handler.handle(request, response);
        } else if (legacyAddon) {
          if (runtimeHandler) {
            await runtimeHandler.handle(request, response);
          } else {
            response.writeHead(403, { 'Cache-Control': 'no-store' }).end();
          }
        } else if (calibration?.canHandle(pathname ?? '')) {
          void calibration.handle(request, response);
        } else if (resources?.canHandle(pathname ?? '')) {
          void resources.handle(request, response);
        } else if (installation?.canHandle(pathname ?? '')) {
          void installation.handle(request, response);
        } else if (dumps?.canHandle(pathname ?? '')) {
          void dumps.handle(request, response);
        } else if (runtimeAssets?.canHandle(pathname ?? '')) {
          void runtimeAssets.handle(request, response);
        } else if (admin && (pathname === '/admin' || pathname?.startsWith('/admin/'))) {
          void admin.handle(request, response);
        } else if (auth && (pathname === '/api/admin/auth' || pathname?.startsWith('/api/admin/auth/'))) {
          void auth.handle(request, response);
        } else if (resolutions?.canHandle(pathname ?? '')) {
          void resolutions.handle(request, response);
        } else if (users?.canHandle(pathname ?? '')) {
          void users.handle(request, response);
        } else if (installations?.canHandle(pathname ?? '')) {
          void installations.handle(request, response);
        } else if (authorization?.canHandle(pathname ?? '')) {
          void authorization.handle(request, response);
        } else if (addons?.canHandle(pathname ?? '')) {
          void addons.handle(request, response);
        } else if (deployment?.canHandle(pathname ?? '')) {
          void deployment.handle(request, response);
        } else if (hooks?.canHandle(pathname ?? '')) {
          void hooks.handle(request, response);
        } else if (previews?.canHandle(pathname ?? '')) {
          void previews.handle(request, response);
        } else if (jsonLd?.canHandle(pathname ?? '')) {
          void jsonLd.handle(request, response);
        } else if (templateVariables?.canHandle(pathname ?? '')) {
          void templateVariables.handle(request, response);
        } else if (rendering?.canHandle(pathname ?? '')) {
          void rendering.handle(request, response);
        } else if (publication?.canHandle(pathname ?? '')) {
          void publication.handle(request, response);
        } else if (favicon?.canHandle(pathname ?? '')) {
          void favicon.handle(request, response);
        } else if (files?.canHandle(pathname ?? '')) {
          void files.handle(request, response);
        } else if (routing?.canHandle(pathname ?? '')) {
          void routing.handle(request, response);
        } else if (content?.canHandle(pathname ?? '')) {
          void content.handle(request, response);
        } else if (runtimeHandler) {
          void runtimeHandler.handle(request, response).catch(() => {
            if (!response.headersSent) {
              response.writeHead(500, { 'Cache-Control': 'no-store' });
            }
            response.end();
          });
        } else if (media?.canHandle(pathname ?? '')) {
          void media.handle(request, response);
        } else {
          void controller.handle(request, response);
        }
      };

      if (administration) {
        await administration.run(request, response, dispatch);
      } else {
        await dispatch();
      }
    });
    await application.listen(settings.port, settings.host);

    return application;
  } catch (error) {
    await application.close();
    throw error;
  }
}
