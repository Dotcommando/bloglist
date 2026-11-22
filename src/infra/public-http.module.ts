import { type DynamicModule, Module } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { PageResolutionObserver } from '../adapters/inbound/documents/http/publication/page-resolution-observer.js';
import { PublicDocumentController } from '../adapters/inbound/documents/http/publication/public-document.controller.js';
import type { MongooseHookEvents } from '../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { MongooseSiteRepository } from '../adapters/outbound/persistence/mongoose/sites/site.repository.js';
import { type ISiteRecord, siteSchema } from '../adapters/outbound/persistence/mongoose/sites/site.schema.js';
import { ResolveSiteUseCase } from '../app/use-cases/sites/resolve-site.use-case.js';
import type { IGetPublishedArtifact } from '../ports/inbound/publication/get-published-artifact.port.js';
import type { IRenderPublishedPage } from '../ports/inbound/publication/render-published-page.port.js';
import type { IResolvePublishedPath } from '../ports/inbound/publication/resolve-published-path.port.js';
import type { IResolveSite } from '../ports/inbound/sites/resolve-site.port.js';
import type { IRenderObservationPort } from '../ports/outbound/diagnostics/render-observation.port.js';
import type { ISiteRepository } from '../ports/outbound/sites/site.repository.js';
import { addonProviders } from './addons/addons.providers.js';
import { adminAuthHttpProviders } from './admin-auth/admin-auth-http.providers.js';
import { adminUserHttpProviders } from './admin-users/admin-users-http.providers.js';
import { calibrationProviders } from './calibration/calibration.providers.js';
import { cmsApiProviders } from './cms/cms.providers.js';
import { contentHttpProviders } from './content/content-http.providers.js';
import { deploymentHttpProviders } from './deployment/deployment-http.providers.js';
import { RENDER_OBSERVATION } from './diagnostics/diagnostics.tokens.js';
import { pageResolutionProviders } from './diagnostics/page-resolution.providers.js';
import { pageResolutionHttpProviders } from './diagnostics/page-resolution-http.providers.js';
import { dumpProviders } from './dumps/dumps.providers.js';
import { hooksProviders } from './hooks/hooks.providers.js';
import { HOOK_EVENTS } from './hooks/hooks.tokens.js';
import { installationProviders } from './installation/installation.providers.js';
import { jsonLdHttpProviders } from './json-ld/json-ld-http.providers.js';
import { fileLibraryHttpProviders, mediaDeliveryProviders } from './media/file-library.providers.js';
import { siteAssetDirectoryProviders } from './media/site-asset-directory.providers.js';
import { persistenceProviders } from './persistence/persistence.providers.js';
import { MONGO_CONNECTION } from './persistence/persistence.tokens.js';
import { type IPublicHttpSettings, validatePublicHttpSettings } from './public-http.settings.js';
import { adminPublicationProviders } from './publication/admin-publication.providers.js';
import {
  GET_PUBLISHED_ARTIFACT,
  RENDER_PUBLISHED_PAGE,
  RESOLVE_PUBLISHED_PATH,
} from './publication/publication.tokens.js';
import { publishedRuntimeProviders } from './publication/published-runtime.providers.js';
import { renderingHttpProviders } from './rendering/rendering-http.providers.js';
import { resourceProviders } from './resources/resources.providers.js';
import { routingHttpProviders } from './routing/routing-http.providers.js';
import { RESOLVE_SITE, SITE_REPOSITORY } from './sites/sites.tokens.js';
import { templateVariableHttpProviders } from './template-variables/template-variables-http.providers.js';

@Module({})
export class PublicHttpModule {
  static forHttp(input: IPublicHttpSettings): DynamicModule {
    const settings = validatePublicHttpSettings(input);

    return {
      module: PublicHttpModule,
      providers: [
        // Private extension providers; the HTTP dispatcher owns the unchanged route catalogue.
        ...cmsApiProviders(settings),
        ...(settings.adminAuth ? resourceProviders(settings) : []),
        ...(settings.adminAuth ? calibrationProviders(settings) : []),
        ...pageResolutionProviders(),
        ...pageResolutionHttpProviders(settings),
        ...hooksProviders(settings),
        ...(settings.adminAuth ? installationProviders(settings.adminAuth) : []),
        ...(settings.adminAuth ? adminAuthHttpProviders(settings.adminAuth) : []),
        ...adminUserHttpProviders(settings),
        ...contentHttpProviders(settings),
        ...dumpProviders(settings),
        ...deploymentHttpProviders(settings),
        ...siteAssetDirectoryProviders(settings.media, settings.artifactsRoot),
        ...routingHttpProviders(settings),
        ...adminPublicationProviders(settings),
        ...renderingHttpProviders(settings),
        ...templateVariableHttpProviders(settings),
        ...jsonLdHttpProviders(settings),
        ...fileLibraryHttpProviders(settings),
        ...mediaDeliveryProviders(settings),
        ...addonProviders(settings),
        ...persistenceProviders(settings), ...publishedRuntimeProviders(settings),
        {
          provide: SITE_REPOSITORY,
          inject: [MONGO_CONNECTION, HOOK_EVENTS],
          useFactory: (connection: Connection, hookEvents: MongooseHookEvents): ISiteRepository =>
            new MongooseSiteRepository(connection.model<ISiteRecord>('Site', siteSchema), () => new Date(), hookEvents),
        },
        {
          provide: RESOLVE_SITE,
          inject: [SITE_REPOSITORY],
          useFactory: (sites: ISiteRepository) => new ResolveSiteUseCase(sites),
        },
        {
          provide: PublicDocumentController,
          inject: [RESOLVE_SITE,
            RESOLVE_PUBLISHED_PATH,
            RENDER_PUBLISHED_PAGE,
            GET_PUBLISHED_ARTIFACT,
            PageResolutionObserver,
            RENDER_OBSERVATION],
          useFactory: (sites: IResolveSite, routes: IResolvePublishedPath,
            render: IRenderPublishedPage,
            artifacts: IGetPublishedArtifact,
            observer: PageResolutionObserver,
            observation: IRenderObservationPort) =>
            new PublicDocumentController(sites, routes, render, artifacts,
              settings.pageDiagnostics === false ? undefined : observer, observation),
        },
      ],
    };
  }
}
