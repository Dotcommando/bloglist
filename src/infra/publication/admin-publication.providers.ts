import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type {
  IAdminContentOperationFactory,
} from '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import { AdminPublicationController } from '../../adapters/inbound/rest/publication/admin-publication.controller.js';
import type {
  IAdminPublicationOperationFactory, IAdminPublicationOperations,
} from '../../adapters/inbound/rest/publication/admin-publication-operations.factory.js';
import {
  SessionContentAccessAdapter,
} from '../../adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import { RoutingPageLookupAdapter } from '../../adapters/outbound/capabilities/pages/routing-page-lookup.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageContentSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-content-source.adapter.js';
import {
  MongoosePagePublicationAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publication.adapter.js';
import {
  type IPagePublicationsRecord, pagePublicationsSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import { createRoutingModels } from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseRoutingSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/routing/routing-source.adapter.js';
import { MongooseUrlRepository } from '../../adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { CmsPublishedPagesAdapter } from '../../adapters/outbound/publication/files/cms-published-pages.adapter.js';
import { PageReleaseBuildAdapter } from '../../adapters/outbound/publication/files/page-release-build.adapter.js';
import { PublicationSourceAdapter } from '../../adapters/outbound/publication/files/publication-source.adapter.js';
import { PublishedRoutingAdapter } from '../../adapters/outbound/publication/files/published-routing.adapter.js';
import {
  FileFrontendSourceLocationsAdapter,
} from '../../adapters/outbound/rendering/files/frontend-source-locations.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { RenderingRegistryAdapter } from '../../adapters/outbound/rendering/modx/rendering-registry.adapter.js';
import { FrontendBuildAdapter } from '../../adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { PageLifecycleValuesAdapter } from '../../adapters/outbound/values/pages/page-lifecycle-values.adapter.js';
import { UrlCreationValuesAdapter } from '../../adapters/outbound/values/routing/url-creation-values.adapter.js';
import { JsonLdPublicationSourceService } from '../../app/services/json-ld/json-ld-publication-source.service.js';
import type { IRenderRuntime } from '../../app/services/publication/render-data.service.js';
import {
  TemplateVariablePagePublicationService,
} from '../../app/services/template-variables/template-variable-page-publication.service.js';
import {
  TemplateVariableSourceService,
} from '../../app/services/template-variables/template-variable-source.service.js';
import { ConfigurePageRenderingUseCase } from '../../app/use-cases/pages/configure-page-rendering.use-case.js';
import { GetPageEditorialStatesUseCase } from '../../app/use-cases/pages/get-page-editorial-states.use-case.js';
import { PublishPageUseCase } from '../../app/use-cases/pages/publish-page.use-case.js';
import { GetPublicationOptionsUseCase } from '../../app/use-cases/publication/get-publication-options.use-case.js';
import { PublishCurrentPageUseCase } from '../../app/use-cases/publication/publish-current-page.use-case.js';
import { PublishPageReleaseUseCase } from '../../app/use-cases/publication/publish-page-release.use-case.js';
import { PublishSiteReleaseUseCase } from '../../app/use-cases/publication/publish-site-release.use-case.js';
import { AssignInitialPageUrlUseCase } from '../../app/use-cases/routing/assign-initial-page-url.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IJsonLdCatalogReader } from '../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { ISiteFaviconStore } from '../../ports/outbound/media/site-favicon-store.port.js';
import type { IPageRepository } from '../../ports/outbound/pages/page.repository.js';
import type { IPublicArtifactPort } from '../../ports/outbound/publication/public-artifact.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { IRenderingSourcePort } from '../../ports/outbound/publication/rendering-source.port.js';
import type { ITemplateCompositionPort } from '../../ports/outbound/publication/template-composition.port.js';
import type {
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../ports/outbound/template-variables/template-variables.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { JSON_LD_CATALOG_READER } from '../json-ld/json-ld.tokens.js';
import { jsonLdReleaseProjection } from '../json-ld/json-ld-release.factory.js';
import { SITE_FAVICON_STORE } from '../media/media.tokens.js';
import { PAGE_REPOSITORY } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { registeredSnippets } from '../rendering/snippets.js';
import { TV_PUBLICATION, TV_STORE } from '../template-variables/template-variables.tokens.js';
import {
  ADMIN_PUBLICATION_OPERATIONS, COMPOSITION, PUBLICATION_STORE, RELEASE_ACTIVATION, RENDER_RUNTIME, RENDERING_SOURCE,
} from './publication.tokens.js';
import { PUBLISHED_CONTENT } from './publication.tokens.js';

export function adminPublicationProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;

  return [
    {
      provide: ADMIN_PUBLICATION_OPERATIONS,
      inject: [MONGO_CONNECTION, PAGE_REPOSITORY, ADMIN_CONTENT_OPERATIONS, GET_CURRENT_ADMIN_USER,
        PUBLICATION_STORE, RELEASE_ACTIVATION, COMPOSITION, RENDER_RUNTIME, RENDERING_SOURCE,
        PUBLISHED_CONTENT, HOOK_CHANGES, HOOK_EVENTS, TV_PUBLICATION, TV_STORE, JSON_LD_CATALOG_READER,
        ...(settings.media ? [SITE_FAVICON_STORE] : [])],
      useFactory: (connection: Connection, pages: IPageRepository, content: IAdminContentOperationFactory,
        current: IGetCurrentAdminUser, store: IPublicationStorePort & IPublicationArtifactSourcePort,
        activation: IReleaseActivationPort, composition: ITemplateCompositionPort, runtime: IRenderRuntime,
        sources: IRenderingSourcePort, files: IPublicArtifactPort, hooks: IHookChangesPort, hookEvents:
        MongooseHookEvents, variables: ITemplateVariablePublication,
        definitions: ITemplateVariableStore, catalogs: IJsonLdCatalogReader,
        favicons?: ISiteFaviconStore): IAdminPublicationOperationFactory => {
        const pageModel = connection.model<IPageRecord>('Page', pageSchema);
        const versions = connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema);
        const publications = new TemplateVariablePagePublicationService(
          new MongoosePagePublicationAdapter(pageModel, versions, hookEvents), variables);
        const pageSource = new MongoosePageContentSourceAdapter(pageModel, versions);
        const routingModels = createRoutingModels(connection);
        const routing = new MongooseRoutingSourceAdapter(routingModels.urls);
        const urls = new MongooseUrlRepository(routingModels, () => new Date(), randomUUID, hookEvents);
        const urlValues = new UrlCreationValuesAdapter();
        const registry = new RenderingRegistryAdapter(sources, registeredSnippets(settings.loaders));
        const frontend = new FrontendBuildAdapter(settings.media?.publicBaseUrl,
          new FileFrontendSourceLocationsAdapter(settings.sourcesRoot ?? path.resolve('sites')),
          new MarkdownConversionAdapter());
        const pageBuild = new PageReleaseBuildAdapter(frontend, store, jsonLdReleaseProjection());
        const values = { nextReleaseId: randomUUID, now: () => new Date() };

        return {
          forSession(token): IAdminPublicationOperations {
            const operations = content.forSession(token);
            const access = new SessionContentAccessAdapter(current, token);
            const source = new JsonLdPublicationSourceService(new TemplateVariableSourceService(
              new PublicationSourceAdapter(sources, pageSource, routing, operations.getSite, favicons),
              variables, definitions),
            catalogs, new PublishedRoutingAdapter(activation, store, files));
            const publish = new PublishPageUseCase(pages, access, publications, new
            PageLifecycleValuesAdapter(), registry, hooks);
            const release = new PublishPageReleaseUseCase(access, publish, source, composition, runtime,
              pageBuild, store, activation, values, hooks, variables);
            const page = new PublishCurrentPageUseCase(operations.getPage,
              new ConfigurePageRenderingUseCase(pages, access, registry, hooks),
              new AssignInitialPageUrlUseCase(urls, new RoutingPageLookupAdapter(operations.getPage),
                urlValues, access, hooks),
              routing, urlValues, release);
            const site = new PublishSiteReleaseUseCase(access, source, composition, runtime, frontend, store,
              activation, values, hooks);

            return {
              getOptions: new GetPublicationOptionsUseCase(operations.getSite, operations.getPage, sources, routing,
                new PublishedRoutingAdapter(activation, store, files), new GetPageEditorialStatesUseCase(access, pages,
                  activation, new CmsPublishedPagesAdapter(publications, activation, store))),
              publishPage: {
                execute: async (input) => page.execute({
                  ...input, actorId: (await current.execute({ token })).user.adminUserId,
                }),
              },
              publishSite: {
                execute: async (siteId) => {
                  await access.assertEditor(siteId);

                  return site.execute({
                    siteId,
                    actorId: (await current.execute({ token })).user.adminUserId,
                    expectedActiveReleaseId: (await activation.getActive(siteId))?.releaseId ?? null,
                  });
                },
              },
            };
          },
        };
      },
    },
    {
      provide: AdminPublicationController,
      inject: [ADMIN_PUBLICATION_OPERATIONS],
      useFactory: (operations: IAdminPublicationOperationFactory) => new AdminPublicationController(auth, operations),
    },
  ];
}
