import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import {
  LocalPublicationAccessAdapter,
} from '../../adapters/outbound/access/local/publication/local-publication-access.adapter.js';
import type { MongooseHookEvents } from '../../adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import { type IPageRecord, pageSchema } from '../../adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageContentSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-content-source.adapter.js';
import {
  MongoosePagePublicationAdapter,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publication.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import { createRoutingModels } from '../../adapters/outbound/persistence/mongoose/routing/routing.models.js';
import {
  MongooseRoutingSourceAdapter,
} from '../../adapters/outbound/persistence/mongoose/routing/routing-source.adapter.js';
import { CmsPublishedPagesAdapter } from '../../adapters/outbound/publication/files/cms-published-pages.adapter.js';
import {
  MediaAddressReleaseBuildAdapter,
} from '../../adapters/outbound/publication/files/media-address-release-build.adapter.js';
import { PageReleaseBuildAdapter } from '../../adapters/outbound/publication/files/page-release-build.adapter.js';
import { PublicationSourceAdapter } from '../../adapters/outbound/publication/files/publication-source.adapter.js';
import { PublishedRoutingAdapter } from '../../adapters/outbound/publication/files/published-routing.adapter.js';
import {
  RoutingReleaseBuildAdapter,
} from '../../adapters/outbound/publication/files/routing-release-build.adapter.js';
import { LocalPreviewDeliveryAdapter } from '../../adapters/outbound/publication/local/preview-delivery.adapter.js';
import {
  BasicRenderingSourceAdapter,
} from '../../adapters/outbound/rendering/files/basic-rendering-source.adapter.js';
import {
  FileFrontendSourceLocationsAdapter,
} from '../../adapters/outbound/rendering/files/frontend-source-locations.adapter.js';
import {
  ManagedRenderingSourceAdapter,
} from '../../adapters/outbound/rendering/files/managed-rendering-source.adapter.js';
import { FileRenderingSourceAdapter } from '../../adapters/outbound/rendering/files/rendering-source.adapter.js';
import { JsonLdInspectionAdapter } from '../../adapters/outbound/rendering/html/json-ld-inspection.adapter.js';
import { MarkdownConversionAdapter } from '../../adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { RenderingElementUsagesAdapter } from '../../adapters/outbound/rendering/modx/element-usages.adapter.js';
import { RenderingRegistryAdapter } from '../../adapters/outbound/rendering/modx/rendering-registry.adapter.js';
import { FrontendBuildAdapter } from '../../adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { JsonLdPublicationSourceService } from '../../app/services/json-ld/json-ld-publication-source.service.js';
import { type IRenderRuntime } from '../../app/services/publication/render-data.service.js';
import {
  TemplateVariablePagePublicationService,
} from '../../app/services/template-variables/template-variable-page-publication.service.js';
import {
  TemplateVariableSourceService,
} from '../../app/services/template-variables/template-variable-source.service.js';
import { InspectJsonLdDraftUseCase } from '../../app/use-cases/json-ld/inspect-json-ld-draft.use-case.js';
import { InspectJsonLdPublishedUseCase } from '../../app/use-cases/json-ld/inspect-json-ld-published.use-case.js';
import { ConfigurePageRenderingUseCase } from '../../app/use-cases/pages/configure-page-rendering.use-case.js';
import { GetPageEditorialStatesUseCase } from '../../app/use-cases/pages/get-page-editorial-states.use-case.js';
import { PublishPageUseCase } from '../../app/use-cases/pages/publish-page.use-case.js';
import { GetPublicationOptionsUseCase } from '../../app/use-cases/publication/get-publication-options.use-case.js';
import { PreviewMarkdownDraftUseCase } from '../../app/use-cases/publication/preview-markdown-draft.use-case.js';
import {
  PreviewMarkdownPublishedUseCase,
} from '../../app/use-cases/publication/preview-markdown-published.use-case.js';
import { PreviewPageUseCase } from '../../app/use-cases/publication/preview-page.use-case.js';
import { PublishCurrentPageUseCase } from '../../app/use-cases/publication/publish-current-page.use-case.js';
import {
  PublishMediaAddressReleaseUseCase,
} from '../../app/use-cases/publication/publish-media-address-release.use-case.js';
import { PublishPageReleaseUseCase } from '../../app/use-cases/publication/publish-page-release.use-case.js';
import { PublishRoutingReleaseUseCase } from '../../app/use-cases/publication/publish-routing-release.use-case.js';
import { PublishSiteReleaseUseCase } from '../../app/use-cases/publication/publish-site-release.use-case.js';
import { RepublishSnippetPagesUseCase } from '../../app/use-cases/publication/republish-snippet-pages.use-case.js';
import { ChangePublishedPageUrlUseCase } from '../../app/use-cases/routing/change-published-page-url.use-case.js';
import { GetUrlCatalogUseCase } from '../../app/use-cases/routing/get-url-catalog.use-case.js';
import { RedirectPublishedUrlUseCase } from '../../app/use-cases/routing/redirect-published-url.use-case.js';
import { Page } from '../../domain/pages/page.js';
import type { IConfigurePageRendering } from '../../ports/inbound/pages/configure-page-rendering.port.js';
import type { IGetPage } from '../../ports/inbound/pages/get-page.port.js';
import type { IGetPageEditorialStates } from '../../ports/inbound/pages/get-page-editorial-states.port.js';
import type { IListPages } from '../../ports/inbound/pages/list-pages.port.js';
import type { IPublishPage } from '../../ports/inbound/pages/publish-page.port.js';
import type { IGetPublishedArtifact } from '../../ports/inbound/publication/get-published-artifact.port.js';
import type { IPublishPageRelease } from '../../ports/inbound/publication/publish-page-release.port.js';
import type { IPublishRoutingRelease } from '../../ports/inbound/publication/publish-routing-release.port.js';
import type { IRenderPublishedPage } from '../../ports/inbound/publication/render-published-page.port.js';
import type { IAssignInitialPageUrl } from '../../ports/inbound/routing/assign-initial-page-url.port.js';
import type { IChangePageUrl } from '../../ports/inbound/routing/change-page-url.port.js';
import type { IRedirectUrl } from '../../ports/inbound/routing/redirect-url.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IHookChangesPort } from '../../ports/outbound/hooks/hook-execution.port.js';
import type { IJsonLdCatalogReader } from '../../ports/outbound/json-ld/json-ld-catalog.port.js';
import type { ISiteFaviconStore } from '../../ports/outbound/media/site-favicon-store.port.js';
import type { IPageRepository } from '../../ports/outbound/pages/page.repository.js';
import type { IPageAccessPort } from '../../ports/outbound/pages/page-access.port.js';
import type { IPageContentSourcePort } from '../../ports/outbound/pages/page-content-source.port.js';
import type { IPageLifecycleValues } from '../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { IPagePublicationPort } from '../../ports/outbound/pages/page-publication.port.js';
import type { IFrontendBuildPort } from '../../ports/outbound/publication/frontend-build.port.js';
import type { IPageReleaseBuildPort } from '../../ports/outbound/publication/page-release-build.port.js';
import type { IPreviewDeliveryPort } from '../../ports/outbound/publication/preview-delivery.port.js';
import type { IPublicArtifactPort } from '../../ports/outbound/publication/public-artifact.port.js';
import type { IPublicationAccessPort } from '../../ports/outbound/publication/publication-access.port.js';
import type {
  IPublicationArtifactSourcePort,
} from '../../ports/outbound/publication/publication-artifact-source.port.js';
import type { IPublicationSourcePort } from '../../ports/outbound/publication/publication-source.port.js';
import type { IPublicationStorePort } from '../../ports/outbound/publication/publication-store.port.js';
import type { IPublicationValuesPort } from '../../ports/outbound/publication/publication-values.port.js';
import type { IReleaseActivationPort } from '../../ports/outbound/publication/release-activation.port.js';
import type { IRenderingRegistryPort } from '../../ports/outbound/publication/rendering-registry.port.js';
import type { IRenderingSourcePort } from '../../ports/outbound/publication/rendering-source.port.js';
import type { IRequestDocumentCachePort } from '../../ports/outbound/publication/request-document-cache.port.js';
import type { ITemplateCompositionPort } from '../../ports/outbound/publication/template-composition.port.js';
import type { IElementStore } from '../../ports/outbound/rendering/element-store.port.js';
import type { IRoutingAccessPort } from '../../ports/outbound/routing/routing-access.port.js';
import type { IRoutingSourcePort } from '../../ports/outbound/routing/routing-source.port.js';
import type { IUrlBehaviorStorePort } from '../../ports/outbound/routing/url-behavior-store.port.js';
import type { IUrlCreationValues } from '../../ports/outbound/routing/url-creation-values.port.js';
import type {
  ITemplateVariablePublication,
  ITemplateVariableStore,
} from '../../ports/outbound/template-variables/template-variables.port.js';
import { HOOK_EVENTS } from '../hooks/hooks.tokens.js';
import { HOOK_CHANGES } from '../hooks/hooks.tokens.js';
import { INSPECT_JSON_LD_DRAFT, INSPECT_JSON_LD_PUBLISHED } from '../json-ld/json-ld.tokens.js';
import { JSON_LD_CATALOG_READER } from '../json-ld/json-ld.tokens.js';
import { jsonLdReleaseProjection } from '../json-ld/json-ld-release.factory.js';
import type { ILocalApplicationSettings } from '../local-application.settings.js';
import { SITE_FAVICON_STORE } from '../media/media.tokens.js';
import { GET_PAGE_EDITORIAL_STATES, PAGE_ACCESS } from '../pages/pages.tokens.js';
import { GET_PAGE } from '../pages/pages.tokens.js';
import { PAGE_REPOSITORY, PAGE_VALUES } from '../pages/pages.tokens.js';
import { LIST_PAGES } from '../pages/pages.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { REPUBLISH_SNIPPET_PAGES } from '../rendering/rendering.tokens.js';
import { ELEMENT_STORE } from '../rendering/rendering.tokens.js';
import { registeredSnippets } from '../rendering/snippets.js';
import { ASSIGN_INITIAL_PAGE_URL, URL_VALUES } from '../routing/routing.tokens.js';
import { GET_URL_CATALOG, ROUTING_ACCESS, URL_BEHAVIOR_STORE } from '../routing/routing.tokens.js';
import { CHANGE_PAGE_URL } from '../routing/routing.tokens.js';
import { REDIRECT_PUBLISHED_URL, REDIRECT_URL } from '../routing/routing.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import { TV_PUBLICATION, TV_STORE } from '../template-variables/template-variables.tokens.js';
import { REQUEST_DOCUMENT_CACHE_STORAGE } from './publication.tokens.js';
import { PUBLISH_MEDIA_ADDRESS_RELEASE } from './publication.tokens.js';
import {
  COMPOSITION,
  CONFIGURE_PAGE_RENDERING,
  FRONTEND_BUILD,
  GET_PUBLICATION_OPTIONS,
  PAGE_CONTENT_SOURCE,
  PAGE_PUBLICATIONS,
  PAGE_RELEASE_BUILD,
  PREVIEW_DELIVERY,
  PREVIEW_MARKDOWN_DRAFT,
  PREVIEW_MARKDOWN_PUBLISHED,
  PREVIEW_PAGE,
  PUBLICATION_ACCESS,
  PUBLICATION_SOURCE,
  PUBLICATION_STORE,
  PUBLICATION_VALUES,
  PUBLISH_CURRENT_PAGE,
  PUBLISH_PAGE,
  PUBLISH_PAGE_RELEASE,
  PUBLISH_SITE_RELEASE,
  RELEASE_ACTIVATION,
  RENDER_RUNTIME,
  RENDERING_REGISTRY,
  RENDERING_SOURCE,
  ROUTING_CONTENT_SOURCE,
} from './publication.tokens.js';
import { GET_PUBLISHED_ARTIFACT, PUBLISHED_CONTENT, RENDER_PUBLISHED_PAGE } from './publication.tokens.js';
import { CHANGE_PUBLISHED_PAGE_URL, PUBLISH_ROUTING_RELEASE } from './publication.tokens.js';
import { publishedRuntimeProviders } from './published-runtime.providers.js';

export function publicationProviders(settings: ILocalApplicationSettings): Provider[] {
  return [
    ...publishedRuntimeProviders(settings.rendering ?? {}),
    {
      provide: REPUBLISH_SNIPPET_PAGES,
      inject: [RENDERING_SOURCE, PAGE_CONTENT_SOURCE, PUBLICATION_SOURCE, COMPOSITION, RENDER_RUNTIME,
        PAGE_RELEASE_BUILD, PUBLICATION_STORE, RELEASE_ACTIVATION, PUBLICATION_VALUES, HOOK_CHANGES],
      useFactory: (sources: IRenderingSourcePort, pages: IPageContentSourcePort, source: IPublicationSourcePort,
        composition: ITemplateCompositionPort, runtime: IRenderRuntime, frontend: IPageReleaseBuildPort,
        store: IPublicationStorePort, activation: IReleaseActivationPort, values: IPublicationValuesPort,
        hooks: IHookChangesPort) => new RepublishSnippetPagesUseCase(new RenderingElementUsagesAdapter(sources,
        { execute: async (input) => (await pages.readPublished(input.siteId)).map((page) => new Page(page)) }),
      source, composition, runtime, frontend, store, activation, values, hooks),
    },
    {
      provide: REDIRECT_PUBLISHED_URL,
      inject: [REDIRECT_URL, PUBLISH_ROUTING_RELEASE, PUBLICATION_ACCESS],
      useFactory: (redirect: IRedirectUrl, publish: IPublishRoutingRelease, access: IPublicationAccessPort) =>
        new RedirectPublishedUrlUseCase(redirect, publish, access),
    },
    {
      provide: PUBLISH_MEDIA_ADDRESS_RELEASE,
      inject: [PUBLICATION_ACCESS, GET_SITE, RELEASE_ACTIVATION, PUBLICATION_STORE, PUBLICATION_VALUES, HOOK_CHANGES,
        REQUEST_DOCUMENT_CACHE_STORAGE],
      useFactory: (access: IPublicationAccessPort, sites: IGetSite, activation: IReleaseActivationPort,
        store: IPublicationStorePort & IPublicationArtifactSourcePort, values: IPublicationValuesPort,
        hooks: IHookChangesPort, cache: IRequestDocumentCachePort) => new PublishMediaAddressReleaseUseCase(
        access, sites, activation,
        store, new MediaAddressReleaseBuildAdapter(store), values, hooks, cache),
    },
    {
      provide: PUBLISH_ROUTING_RELEASE,
      inject: [PUBLICATION_ACCESS, GET_SITE, ROUTING_CONTENT_SOURCE, RELEASE_ACTIVATION, PUBLICATION_STORE,
        PUBLICATION_VALUES, HOOK_CHANGES],
      useFactory: (access: IPublicationAccessPort, sites: IGetSite, routing: IRoutingSourcePort, activation:
      IReleaseActivationPort, store: IPublicationStorePort & IPublicationArtifactSourcePort, values:
      IPublicationValuesPort, hooks: IHookChangesPort) => new PublishRoutingReleaseUseCase(access, sites,
        routing, activation, store, new RoutingReleaseBuildAdapter(store, jsonLdReleaseProjection()), values, hooks),
    },
    {
      provide: CHANGE_PUBLISHED_PAGE_URL,
      inject: [CHANGE_PAGE_URL, PUBLISH_ROUTING_RELEASE, PUBLICATION_ACCESS],
      useFactory: (change: IChangePageUrl, publish: IPublishRoutingRelease, access: IPublicationAccessPort) =>
        new ChangePublishedPageUrlUseCase(change, publish, access),
    },
    {
      provide: GET_URL_CATALOG,
      inject: [ROUTING_ACCESS, GET_SITE, LIST_PAGES, ROUTING_CONTENT_SOURCE, URL_BEHAVIOR_STORE,
        RELEASE_ACTIVATION, PUBLICATION_STORE, PUBLISHED_CONTENT],
      useFactory: (access: IRoutingAccessPort, sites: IGetSite, pages: IListPages, routing: IRoutingSourcePort,
        versions: IUrlBehaviorStorePort, activation: IReleaseActivationPort, store: IPublicationStorePort,
        files: IPublicArtifactPort) => new GetUrlCatalogUseCase(access, sites, pages, routing, versions,
        new PublishedRoutingAdapter(activation, store, files)),
    },
    {
      provide: GET_PAGE_EDITORIAL_STATES,
      inject: [PAGE_ACCESS, PAGE_REPOSITORY, RELEASE_ACTIVATION, PAGE_PUBLICATIONS, PUBLICATION_STORE],
      useFactory: (access: IPageAccessPort, pages: IPageRepository, activation: IReleaseActivationPort,
        publications: IPagePublicationPort, store: IPublicationStorePort & IPublicationArtifactSourcePort) =>
        new GetPageEditorialStatesUseCase(access, pages, activation,
          new CmsPublishedPagesAdapter(publications, activation, store)),
    },
    {
      provide: GET_PUBLICATION_OPTIONS,
      inject: [GET_SITE, GET_PAGE, RENDERING_SOURCE, ROUTING_CONTENT_SOURCE,
        RELEASE_ACTIVATION, PUBLICATION_STORE, PUBLISHED_CONTENT, GET_PAGE_EDITORIAL_STATES],
      useFactory: (sites: IGetSite, pages: IGetPage, sources: IRenderingSourcePort, routing: IRoutingSourcePort,
        activation: IReleaseActivationPort, store: IPublicationStorePort, files: IPublicArtifactPort,
        editorial: IGetPageEditorialStates) =>
        new GetPublicationOptionsUseCase(sites, pages, sources, routing,
          new PublishedRoutingAdapter(activation, store, files), editorial),
    },
    {
      provide: PUBLISH_CURRENT_PAGE,
      inject: [GET_PAGE, CONFIGURE_PAGE_RENDERING, ASSIGN_INITIAL_PAGE_URL,
        ROUTING_CONTENT_SOURCE, URL_VALUES, PUBLISH_PAGE_RELEASE],
      useFactory: (pages: IGetPage, rendering: IConfigurePageRendering, urls: IAssignInitialPageUrl,
        routing: IRoutingSourcePort, values: IUrlCreationValues, publish: IPublishPageRelease) =>
        new PublishCurrentPageUseCase(pages, rendering, urls, routing, values, publish),
    },
    {
      provide: PAGE_RELEASE_BUILD,
      inject: [FRONTEND_BUILD, PUBLICATION_STORE],
      useFactory: (frontend: IFrontendBuildPort, store: IPublicationArtifactSourcePort) =>
        new PageReleaseBuildAdapter(frontend, store, jsonLdReleaseProjection()),
    },
    {
      provide: PUBLISH_PAGE_RELEASE,
      inject: [PUBLICATION_ACCESS, PUBLISH_PAGE, PUBLICATION_SOURCE, COMPOSITION, RENDER_RUNTIME,
        PAGE_RELEASE_BUILD, PUBLICATION_STORE, RELEASE_ACTIVATION, PUBLICATION_VALUES, HOOK_CHANGES, TV_PUBLICATION],
      useFactory: (access: IPublicationAccessPort, publish: IPublishPage, source: IPublicationSourcePort,
        composition: ITemplateCompositionPort, runtime: IRenderRuntime, frontend: IPageReleaseBuildPort,
        store: IPublicationStorePort, activation: IReleaseActivationPort, values: IPublicationValuesPort,
        hooks: IHookChangesPort, variables: ITemplateVariablePublication) =>
        new PublishPageReleaseUseCase(access, publish, source, composition, runtime, frontend, store,
          activation, values, hooks, variables),
    },

    {
      provide: PUBLISH_SITE_RELEASE,
      inject: [PUBLICATION_ACCESS, PUBLICATION_SOURCE, COMPOSITION, RENDER_RUNTIME, FRONTEND_BUILD,
        PUBLICATION_STORE, RELEASE_ACTIVATION, PUBLICATION_VALUES, HOOK_CHANGES],
      useFactory: (access: IPublicationAccessPort, source: IPublicationSourcePort, composition:
      ITemplateCompositionPort, runtime: IRenderRuntime, frontend: IFrontendBuildPort, store:
      IPublicationStorePort, activation: IReleaseActivationPort, values: IPublicationValuesPort, hooks:
      IHookChangesPort) =>
        new PublishSiteReleaseUseCase(access, source, composition, runtime, frontend, store, activation, values, hooks),
    },
    {
      provide: PAGE_PUBLICATIONS,
      inject: [MONGO_CONNECTION, HOOK_EVENTS, TV_PUBLICATION],
      useFactory: (connection: Connection, hookEvents: MongooseHookEvents, variables: ITemplateVariablePublication) =>
        new TemplateVariablePagePublicationService(new MongoosePagePublicationAdapter(
          connection.model<IPageRecord>('Page', pageSchema),
          connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema), hookEvents),
        variables),
    },
    {
      provide: PUBLISH_PAGE,
      inject: [PAGE_REPOSITORY, PUBLICATION_ACCESS, PAGE_PUBLICATIONS, PAGE_VALUES, RENDERING_REGISTRY, HOOK_CHANGES],
      useFactory: (pages: IPageRepository, access: IPublicationAccessPort, publications: IPagePublicationPort,
        values: IPageLifecycleValues, registry: IRenderingRegistryPort, hooks: IHookChangesPort) =>
        new PublishPageUseCase(pages, access, publications, values, registry, hooks),
    },
    {
      provide: PAGE_CONTENT_SOURCE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new MongoosePageContentSourceAdapter(connection.model<IPageRecord>('Page', pageSchema),
          connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema)),
    },
    {
      provide: ROUTING_CONTENT_SOURCE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new MongooseRoutingSourceAdapter(createRoutingModels(connection).urls),
    },
    {
      provide: PUBLICATION_SOURCE,
      inject: [RENDERING_SOURCE, PAGE_CONTENT_SOURCE, ROUTING_CONTENT_SOURCE, GET_SITE, TV_PUBLICATION, TV_STORE,
        JSON_LD_CATALOG_READER, RELEASE_ACTIVATION, PUBLICATION_STORE, PUBLISHED_CONTENT,
        ...(settings.media ? [SITE_FAVICON_STORE] : [])],
      useFactory: (sources: IRenderingSourcePort, pages: IPageContentSourcePort, routing:
      IRoutingSourcePort, sites: IGetSite, variables: ITemplateVariablePublication,
      definitions: ITemplateVariableStore, catalogs: IJsonLdCatalogReader, activation: IReleaseActivationPort,
      store: IPublicationStorePort, files: IPublicArtifactPort, favicons?: ISiteFaviconStore) =>
        new JsonLdPublicationSourceService(new TemplateVariableSourceService(
          new PublicationSourceAdapter(sources, pages, routing, sites, favicons), variables, definitions), catalogs,
        new PublishedRoutingAdapter(activation, store, files)),
    },

    {
      provide: FRONTEND_BUILD,
      useFactory: () => new FrontendBuildAdapter(settings.media?.publicBaseUrl,
        new FileFrontendSourceLocationsAdapter(settings.rendering?.sourcesRoot ?? path.resolve('sites')),
        new MarkdownConversionAdapter()),
    },
    { provide: PREVIEW_DELIVERY, useFactory: () => new LocalPreviewDeliveryAdapter() },
    {
      provide: 'PreviewLifecycle',
      inject: [PREVIEW_DELIVERY],
      useFactory: (delivery: LocalPreviewDeliveryAdapter) =>
        ({ onApplicationShutdown: () => delivery.close() }),
    },
    {
      provide: PUBLICATION_VALUES,
      useFactory: (): IPublicationValuesPort => ({
        nextReleaseId:
randomUUID,
        now: () => new Date(),
      }),
    },
    {
      provide: PREVIEW_PAGE,
      inject: [PUBLICATION_ACCESS, PUBLICATION_SOURCE, COMPOSITION, RENDER_RUNTIME,
        FRONTEND_BUILD, PREVIEW_DELIVERY, PUBLICATION_VALUES],
      useFactory: (access: IPublicationAccessPort, source: IPublicationSourcePort, composition:
      ITemplateCompositionPort,
      runtime: IRenderRuntime, frontend: IFrontendBuildPort, delivery: IPreviewDeliveryPort,
      values: IPublicationValuesPort) =>
        new PreviewPageUseCase(access, source, composition, runtime, frontend, delivery, values),
    },
    {
      provide: PREVIEW_MARKDOWN_DRAFT,
      inject: [PUBLICATION_ACCESS, PUBLICATION_SOURCE, COMPOSITION, RENDER_RUNTIME, FRONTEND_BUILD, PUBLICATION_VALUES],
      useFactory: (access: IPublicationAccessPort, source: IPublicationSourcePort,
        composition: ITemplateCompositionPort, runtime: IRenderRuntime, frontend: IFrontendBuildPort,
        values: IPublicationValuesPort) => new PreviewMarkdownDraftUseCase(
        access, source, composition, runtime, frontend, values,
      ),
    },
    {
      provide: PREVIEW_MARKDOWN_PUBLISHED,
      inject: [PUBLICATION_ACCESS, RELEASE_ACTIVATION, PUBLICATION_STORE,
        RENDER_PUBLISHED_PAGE, GET_PUBLISHED_ARTIFACT],
      useFactory: (access: IPublicationAccessPort, activation: IReleaseActivationPort, store: IPublicationStorePort,
        render: IRenderPublishedPage, artifacts: IGetPublishedArtifact) =>
        new PreviewMarkdownPublishedUseCase(access, activation, store, render, artifacts),
    },
    {
      provide: INSPECT_JSON_LD_DRAFT,
      inject: [PUBLICATION_ACCESS, PUBLICATION_SOURCE, COMPOSITION, RENDER_RUNTIME],
      useFactory: (access: IPublicationAccessPort, source: IPublicationSourcePort,
        composition: ITemplateCompositionPort, runtime: IRenderRuntime) =>
        new InspectJsonLdDraftUseCase(access, source, composition, runtime),
    },
    {
      provide: INSPECT_JSON_LD_PUBLISHED,
      inject: [PUBLICATION_ACCESS, RELEASE_ACTIVATION, PUBLICATION_STORE,
        RENDER_PUBLISHED_PAGE, GET_PUBLISHED_ARTIFACT],
      useFactory: (access: IPublicationAccessPort, activation: IReleaseActivationPort,
        store: IPublicationStorePort, render: IRenderPublishedPage, artifacts: IGetPublishedArtifact) =>
        new InspectJsonLdPublishedUseCase(access, activation, store, render, artifacts, new JsonLdInspectionAdapter()),
    },
    { provide: PUBLICATION_ACCESS, useFactory: () => new LocalPublicationAccessAdapter(settings.operator) },
    {
      provide: RENDERING_SOURCE,
      inject: [ELEMENT_STORE],
      useFactory: (store: IElementStore) => new ManagedRenderingSourceAdapter(store,
        new FileRenderingSourceAdapter(settings.rendering?.sourcesRoot ?? path.resolve('sites'),
          new BasicRenderingSourceAdapter())),
    },
    {
      provide: RENDERING_REGISTRY,
      inject: [RENDERING_SOURCE],
      useFactory: (sources: IRenderingSourcePort) => new RenderingRegistryAdapter(sources,
        registeredSnippets(settings.rendering?.loaders)),
    },
    {
      provide: CONFIGURE_PAGE_RENDERING,
      inject: [PAGE_REPOSITORY, PUBLICATION_ACCESS, RENDERING_REGISTRY, HOOK_CHANGES],
      useFactory: (pages: IPageRepository, access: IPublicationAccessPort, registry: IRenderingRegistryPort,
        hooks: IHookChangesPort) =>
        new ConfigurePageRenderingUseCase(pages, access, registry, hooks),
    },
  ];
}
